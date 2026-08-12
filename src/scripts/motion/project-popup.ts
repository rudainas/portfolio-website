import gsap from "gsap";
import { playClick } from "../audio/sfx";
import { tap } from "../haptics";

/**
 * Case-study popup — Figma Project-Pop-up-Basquait (1785:3512) expanding into
 * Case-Study-Basquiat (1765:1104).
 *
 * The two Figma frames are one component in two states, so this animates
 * between them rather than swapping views: scrolling inside the window drives
 * its inset and corner radius to zero, and the popup becomes the full-bleed
 * case study. Scrolling back up reverses it, so the reader can always retreat
 * to the windowed state instead of being committed on the first flick.
 *
 * The expansion is driven by the panel's OWN scroll position rather than the
 * page's — the page behind is locked while the popup is open, so it has no
 * scroll of its own to read.
 */

/** Scroll distance inside the panel over which it expands to full bleed. */
const EXPAND_OVER_PX = 320;

/**
 * Accumulated overscroll needed at the bottom of a case study before the next
 * one takes over.
 *
 * Deliberately large. This is the only gesture on the site that navigates
 * rather than reveals, so it has to be hard to trigger by momentum alone — a
 * trackpad flick to the end of a long page carries a lot of residual delta,
 * and anything much under this would hand over while the reader is still
 * looking at the last image.
 */
const HANDOVER_EFFORT_PX = 4800;

/**
 * The same, for reaching BACKWARDS to the previous study.
 *
 * Heavier than going forward on purpose. Scrolling down at the end of a study
 * is the reading direction — finishing one and continuing to the next is what
 * the reader was already doing. Scrolling up at the top is a correction, and
 * it starts from the position every reader passes through on the way in, so it
 * is far easier to trigger by accident. The extra weight is what keeps a
 * casual flick back to the top of a study from throwing them out of it.
 */
const HANDOVER_EFFORT_BACK_PX = 7200;

/**
 * Resistance shape: static friction, not drag.
 *
 * The gesture is stiff to START and smooth once it is moving — like shoving
 * something heavy. A single exponential curve (travel = progress^n) could not
 * express that: it spreads the weight across the ENTIRE gesture, so the panel
 * crawls the whole way and then lurches at the end. The reader feels like they
 * are fighting it right up to the moment it commits.
 *
 * So travel is piecewise. Over the first `BREAKAWAY` of the effort the panel
 * barely stirs, revealing only `BREAKAWAY_TRAVEL` of itself — enough to show
 * something is responding, not enough to be triggered by a stray flick. Past
 * that it releases and eases out over the remainder, covering the rest of its
 * travel quickly and settling.
 *
 * Backwards gets a longer, stiffer break: it starts from the position every
 * reader passes through on the way in, so it is the easier one to trigger by
 * accident.
 */
const BREAKAWAY = 0.26;
const BREAKAWAY_BACK = 0.34;

/** Travel revealed while still breaking free. */
const BREAKAWAY_TRAVEL = 0.07;

/** Stiffness within the breakaway. Higher holds the panel back harder. */
const BREAKAWAY_STIFFNESS = 2.6;
const BREAKAWAY_STIFFNESS_BACK = 3;

/** Ease-out on the glide once it is free. Higher settles sooner. */
const GLIDE_EASE = 2.2;

/**
 * Maps raw progress through the effort onto how far the panel has actually
 * travelled. Continuous at the breakaway point, and reaches exactly 1.
 */
function travelFor(progress: number, back: boolean): number {
  const p = Math.min(Math.max(progress, 0), 1);
  const breakaway = back ? BREAKAWAY_BACK : BREAKAWAY;

  if (p <= breakaway) {
    const t = p / breakaway;
    const stiffness = back ? BREAKAWAY_STIFFNESS_BACK : BREAKAWAY_STIFFNESS;
    return BREAKAWAY_TRAVEL * t ** stiffness;
  }

  const t = (p - breakaway) / (1 - breakaway);
  return BREAKAWAY_TRAVEL + (1 - BREAKAWAY_TRAVEL) * (1 - (1 - t) ** GLIDE_EASE);
}

/**
 * Idle time after the last scroll before an uncommitted peek springs back.
 *
 * Sized against the gesture: a long haul invites a pause partway, and
 * collapsing on a brief hesitation would make the effort feel punishing.
 */
const PEEK_RELEASE_MS = 320;

/**
 * How long the handover stands down after the reader last scrolled a nested
 * rail — a sketch or screen strip.
 *
 * Those rails sit at the BOTTOM of a column, exactly where the handover
 * gesture lives, and they hand the wheel back the instant they reach their own
 * end. Without this, scrolling through the last few screens of a strip ran
 * straight on into hauling the next study up: one continuous gesture doing two
 * unrelated things. Long enough that the reader has to stop and start again,
 * which is what makes the handover a separate, deliberate act.
 */
const RAIL_COOLDOWN_MS = 700;

/**
 * Which edge a peeking study travels in from.
 *
 * "below" is the next study, hauled up by scrolling past the bottom; "above"
 * is the previous one, pulled down by scrolling past the top. The gesture is
 * the same in both directions — only the sign of the travel changes — so the
 * reader can always reverse out of a study the way they came into it.
 */
type PeekFrom = "below" | "above";

/** What each popup element exposes to the others. */
type PopupApi = {
  open?: () => void;
  /** Ride in from `from`, 0 offscreen to 1 fully in place. */
  showPeek?: (progress: number, from: PeekFrom) => void;
  /** Abandon a peek that never reached the threshold. */
  endPeek?: () => void;
  /** Finish the travel and become the active study. */
  completePeek?: () => void;
};

/**
 * Wires every case-study popup on the page.
 *
 * One instance exists per study, and an opener names which by the value of its
 * `data-open-case-study`. That is also how a popup's "Next" pill hands over to
 * the following study — it is just another opener, sitting inside a popup, so
 * the handover has to close whatever is currently open first.
 */
export function initProjectPopup(root: ParentNode = document): () => void {
  const popups = gsap.utils.toArray<HTMLElement>(document.querySelectorAll("[data-popup]"));
  if (!popups.length) return () => {};

  const teardown: Array<() => void> = [];
  /** The popup currently open, so an opener inside one can swap to another. */
  let active: { close: () => void; closeForHandover: () => void } | null = null;

  /* Case-study videos autoplay silently as decoration. A reader who has asked
     for reduced motion gets them stopped — and given controls, since a paused
     video with no way to start it is just a broken image. */
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    for (const video of document.querySelectorAll<HTMLVideoElement>(
      "[data-popup] .media-frame video",
    )) {
      video.autoplay = false;
      video.loop = false;
      video.controls = true;
      video.pause();
    }
  }

  for (const popup of popups) {
    teardown.push(wire(popup));
  }

  /* Openers live outside the popups (the gallery cards) and inside them (the
     Next pill), so they are collected once here rather than per popup. */
  const openers = gsap.utils.toArray<HTMLElement>(
    document.querySelectorAll("[data-open-case-study]"),
  );

  const onOpenerClick = (event: Event) => {
    event.preventDefault();
    const key = (event.currentTarget as HTMLElement).dataset.openCaseStudy;
    const target = popups.find((popup) => popup.dataset.popup === key);
    if (!target) return;
    // Handing over from one study to the next: retire the old one first, and
    // tell it not to bring the page back — the incoming popup still wants it
    // hidden, and a restore tween racing the next hide leaves the gallery and
    // nav showing through the new window.
    active?.closeForHandover();
    (target as HTMLElement & PopupApi).open?.();
  };

  openers.forEach((el) => el.addEventListener("click", onOpenerClick));

  return () => {
    openers.forEach((el) => el.removeEventListener("click", onOpenerClick));
    teardown.forEach((fn) => fn());
  };

  function wire(popup: HTMLElement): () => void {
  const panel = popup.querySelector<HTMLElement>("[data-popup-panel]");
  const scroller = popup.querySelector<HTMLElement>("[data-popup-scroll]");
  if (!panel || !scroller) return () => {};

  const closeButton = popup.querySelector<HTMLElement>("[data-popup-close]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /**
   * Case-study videos, driven by hand rather than left to `autoplay`.
   *
   * Every popup starts hidden, and a browser will not begin autoplaying a
   * video inside a hidden subtree — it defers, then never picks it up when the
   * subtree appears. So playback starts when the study opens and stops when it
   * closes, which also means a study nobody is reading is not decoding frames.
   *
   * The `autoplay` guard is what makes reduced motion stick: that branch above
   * clears the attribute, so those videos are never started here.
   */
  const videos = gsap.utils.toArray<HTMLVideoElement>(
    popup.querySelectorAll(".media-frame video"),
  );

  const playVideos = () => {
    for (const video of videos) {
      // Rejects if the browser declines; there is nothing to recover, and an
      // unhandled rejection would surface as a console error on every open.
      if (video.autoplay) void video.play().catch(() => {});
    }
  };

  const pauseVideos = () => {
    for (const video of videos) video.pause();
  };

  let isOpen = false;
  let lastFocus: HTMLElement | null = null;

  /**
   * The panel is transparent, and Figma's popup frame shows ONLY the grid and
   * confetti behind it — no gallery, no nav. Those have to be taken out while
   * it is open or they read straight through the window and collide with the
   * case-study text. The backdrop layers stay exactly as they are.
   */
  const behind = gsap.utils.toArray<HTMLElement>(
    document.querySelectorAll("[data-page-content], [data-nav]"),
  );

  /* ---------- Expansion ---------- */

  const applyProgress = (progress: number) => {
    const eased = gsap.utils.clamp(0, 1, progress);
    // Both interpolate to 0, which is exactly the case-study frame.
    panel.style.setProperty("--inset-x", `${3.7616 * (1 - eased)}%`);
    panel.style.setProperty("--inset-y", `${8.2364 * (1 - eased)}%`);
    panel.style.setProperty("--panel-radius", `${45 * (1 - eased)}px`);
    // The border belongs to the window; at full bleed there is no window.
    panel.style.borderWidth = `${3 * (1 - eased)}px`;
    popup.dataset.expanded = eased > 0.98 ? "" : undefined!;
  };

  /**
   * The sticky aside is capped to the scroller's height so its own bottom is
   * always reachable. That height changes as the window expands to full bleed
   * and on resize, so it is measured rather than assumed.
   */
  const syncAsideHeight = () => {
    popup.style.setProperty("--aside-max", `${scroller.clientHeight}px`);
  };

  /**
   * Set briefly after this study arrives via a handover.
   *
   * The gesture that dragged it up is one continuous scroll, and whatever the
   * reader had left over would otherwise land in this panel and expand it to
   * full bleed the instant it appeared. A study should arrive windowed however
   * it was reached, so the tail of that gesture is absorbed rather than acted
   * on.
   */
  let settling = false;
  let settleTimer = 0;

  const settleAfterHandover = () => {
    settling = true;
    // Mirrored onto the element so the state is inspectable from outside.
    popup.dataset.settling = "";
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      settling = false;
      delete popup.dataset.settling;
    }, 500);
  };

  let queued = false;
  const onPanelScroll = () => {
    if (settling) {
      scroller.scrollTop = 0;
      applyProgress(0);
      return;
    }
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyProgress(scroller.scrollTop / EXPAND_OVER_PX);
      syncAsideHeight();
    });
  };

  /* ---------- Open / close ---------- */

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    active = { close, closeForHandover };
    lastFocus = document.activeElement as HTMLElement | null;

    popup.hidden = false;
    popup.setAttribute("aria-hidden", "false");
    scroller.scrollTop = 0;
    applyProgress(0);
    syncAsideHeight();

    // Lock the page behind so its scroll cannot fight the panel's.
    document.documentElement.style.overflow = "hidden";
    // Claim the scroll gesture. Wheel events still reach `window` even with
    // the page locked, and scroll-exit.ts would otherwise read an upward
    // scroll inside the panel as "leave the page" and navigate to the hero.
    document.documentElement.dataset.modalOpen = "";

    playClick();
    tap(12);
    playVideos();

    if (reduceMotion.matches) {
      gsap.set(panel, { autoAlpha: 1, scale: 1 });
      gsap.set(behind, { autoAlpha: 0 });
    } else {
      gsap.to(behind, { autoAlpha: 0, duration: 0.28, ease: "power2.out" });
      gsap.fromTo(
        panel,
        { autoAlpha: 0, scale: 0.94 },
        { autoAlpha: 1, scale: 1, duration: 0.42, ease: "back.out(1.6)" },
      );
    }

    closeButton?.focus({ preventScroll: true });
  };

  /**
   * @param restoreBackdrop bring the gallery and nav back. False when another
   * popup is opening in this one's place and still needs them hidden.
   */
  const closeWith = (restoreBackdrop: boolean) => {
    if (!isOpen) return;
    isOpen = false;
    if (active?.close === close) active = null;

    // Drop any half-built handover, so reopening this study later does not
    // start with the next one already part-way up.
    window.clearTimeout(releaseTimer);
    gsap.killTweensOf(springBack);
    if (overscroll > 0) {
      if (restoreBackdrop) peeking()?.endPeek?.();
      overscroll = 0;
      heading = null;
    }

    if (restoreBackdrop) {
      document.documentElement.style.overflow = "";
      delete document.documentElement.dataset.modalOpen;
    }
    playClick();

    const finish = () => {
      popup.hidden = true;
      popup.setAttribute("aria-hidden", "true");
      applyProgress(0);
      pauseVideos();
      // Focus follows the incoming popup on a handover, not the card behind.
      if (restoreBackdrop) lastFocus?.focus?.({ preventScroll: true });
    };

    if (reduceMotion.matches) {
      if (restoreBackdrop) gsap.set(behind, { autoAlpha: 1 });
      finish();
    } else {
      if (restoreBackdrop) {
        gsap.to(behind, { autoAlpha: 1, duration: 0.32, ease: "power2.out", delay: 0.1 });
      }
      gsap.to(panel, {
        autoAlpha: 0,
        scale: 0.94,
        duration: 0.26,
        ease: "power2.in",
        onComplete: finish,
      });
    }
  };

  const close = () => closeWith(true);
  const closeForHandover = () => closeWith(false);

  /* ---------- Peek: being dragged up by the study before this one ---------- */

  /**
   * Shown but not yet in charge. The panel rides up from below the fold as the
   * reader keeps scrolling past the end of the previous study, and is inert
   * throughout — it has not been committed to, so it must not take the pointer
   * or be announced.
   */
  /** Edge this popup is currently travelling in from, while peeking. */
  let peekFrom: PeekFrom = "below";

  const showPeek = (progress: number, from: PeekFrom = "below") => {
    if (isOpen) return;
    peekFrom = from;
    /* "above" means this study is being pulled DOWN into place — the reader is
       going backwards, which takes the stiffer break. See travelFor. */
    const eased = travelFor(progress, from === "above");

    if (popup.hidden) {
      popup.hidden = false;
      scroller.scrollTop = 0;
      // Arrives as Figma's windowed popup, not mid-expansion.
      applyProgress(0);
      syncAsideHeight();
      // Above the study being left behind, whatever their DOM order.
      popup.style.zIndex = "9001";
      panel.style.pointerEvents = "none";
      /* The panel is normally transparent so the page's grid and confetti show
         through, which is right once this study is the only one on screen. Mid
         rise there is a whole other case study behind it, and reading both at
         once is illegible — so it carries a ground for the duration of the
         gesture and gives it back on commit. */
      panel.style.background = "var(--color-paper)";
    }

    gsap.set(panel, {
      // Fully offscreen past its own edge at 0, home at 1.
      yPercent: (1 - eased) * (from === "below" ? 100 : -100),
      autoAlpha: 1,
      // A touch of scale so it reads as arriving rather than sliding on rails.
      scale: 0.94 + 0.06 * eased,
    });
  };

  const clearPeekStyles = () => {
    popup.style.zIndex = "";
    panel.style.pointerEvents = "";
    panel.style.background = "";
  };

  const endPeek = () => {
    if (isOpen || popup.hidden) return;
    gsap.to(panel, {
      // Retreats the way it came, not to a fixed edge.
      yPercent: peekFrom === "below" ? 100 : -100,
      autoAlpha: 0,
      scale: 0.94,
      duration: 0.28,
      ease: "power2.in",
      onComplete: () => {
        // A commit may have landed while this was running.
        if (isOpen) return;
        popup.hidden = true;
        clearPeekStyles();
        gsap.set(panel, { clearProps: "yPercent" });
      },
    });
  };

  /** The peek reached the threshold: this study is now the one being read. */
  const completePeek = () => {
    if (isOpen) return;
    isOpen = true;
    active = { close, closeForHandover };
    clearPeekStyles();
    settleAfterHandover();

    document.documentElement.style.overflow = "hidden";
    document.documentElement.dataset.modalOpen = "";
    popup.setAttribute("aria-hidden", "false");

    playClick();
    tap(14);
    playVideos();

    // The last stretch of travel, run out under its own momentum rather than
    // snapped — the gesture was long, so arriving instantly undercuts it.
    gsap.to(panel, {
      yPercent: 0,
      scale: 1,
      autoAlpha: 1,
      duration: reduceMotion.matches ? 0 : 0.55,
      ease: "power3.out",
      onComplete: () => gsap.set(panel, { clearProps: "yPercent" }),
    });

    closeButton?.focus({ preventScroll: true });
  };

  /* ---------- Handing over to the study after this one ---------- */

  const nextKey = popup.dataset.nextStudy;
  const prevKey = popup.dataset.prevStudy;

  /**
   * Overscroll accumulated past an edge of this study. Not a scroll position —
   * it only counts input the scroller itself could not consume. Always a
   * magnitude; `heading` carries the direction.
   */
  let overscroll = 0;
  /** Which neighbour is being hauled in, or null when none is. */
  let heading: "next" | "prev" | null = null;
  let releaseTimer = 0;
  const springBack = { value: 0 };

  const popupFor = (key: string | undefined) =>
    key
      ? (document.querySelector<HTMLElement>(`[data-popup="${key}"]`) as
          | (HTMLElement & PopupApi)
          | null)
      : null;

  /** The neighbour currently being hauled in. */
  const peeking = () => popupFor(heading === "prev" ? prevKey : nextKey);

  const atBottom = () => scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  const atTop = () => scroller.scrollTop <= 0;

  /** How far this direction has to be pushed before it commits. */
  const effort = () =>
    heading === "prev" ? HANDOVER_EFFORT_BACK_PX : HANDOVER_EFFORT_PX;

  const applyPeek = () => {
    peeking()?.showPeek?.(overscroll / effort(), heading === "prev" ? "above" : "below");
  };

  const scheduleRelease = () => {
    window.clearTimeout(releaseTimer);
    releaseTimer = window.setTimeout(() => {
      if (overscroll <= 0) return;
      // Eased rather than snapped: letting go should feel like the next study
      // sinking back, not like the gesture being cancelled.
      gsap.killTweensOf(springBack);
      springBack.value = overscroll;
      gsap.to(springBack, {
        value: 0,
        duration: 0.45,
        ease: "power2.inOut",
        onUpdate: () => {
          overscroll = springBack.value;
          applyPeek();
        },
        onComplete: () => {
          overscroll = 0;
          peeking()?.endPeek?.();
          heading = null;
        },
      });
    }, PEEK_RELEASE_MS);
  };

  const commitHandover = () => {
    window.clearTimeout(releaseTimer);
    gsap.killTweensOf(springBack);
    const target = peeking();
    overscroll = 0;
    heading = null;
    if (!target) return;
    closeForHandover();
    target.completePeek?.();
  };

  /**
   * Feed scroll input in; returns whether it was consumed.
   *
   * A positive delta is scrolling down. Once a peek is under way the gesture
   * owns the input in BOTH directions, so pushing back the other way retracts
   * the neighbour rather than scrolling this study — otherwise the reader
   * cannot cleanly back out of a haul they have started.
   */
  const pushOverscroll = (delta: number) => {
    if (!isOpen) return false;

    /* Stand down if a nested rail was scrolling a moment ago — see
       RAIL_COOLDOWN_MS. Only blocks STARTING a haul; one already under way
       keeps its own input, so this cannot strand a peek half-risen. */
    if (heading === null) {
      const railAt = Number(document.documentElement.dataset.railScrollAt ?? 0);
      if (railAt && performance.now() - railAt < RAIL_COOLDOWN_MS) return false;
    }

    // Sign that grows the current haul: down for next, up for previous.
    const growth = heading === "prev" ? -delta : delta;

    if (heading === null) {
      if (delta > 0 && nextKey && atBottom()) heading = "next";
      else if (delta < 0 && prevKey && atTop()) heading = "prev";
      else return false;
      return pushOverscroll(delta);
    }

    if (growth <= 0) {
      // Retracting. Hand the scroller back once fully wound down, so the same
      // gesture keeps going as ordinary scrolling.
      if (overscroll <= 0) {
        heading = null;
        return false;
      }
      overscroll = Math.max(0, overscroll + growth);
      applyPeek();
      if (overscroll === 0) {
        peeking()?.endPeek?.();
        heading = null;
      } else {
        scheduleRelease();
      }
      return true;
    }

    window.clearTimeout(releaseTimer);
    gsap.killTweensOf(springBack);
    overscroll = Math.min(overscroll + growth, effort());
    applyPeek();

    if (overscroll >= effort()) commitHandover();
    else scheduleRelease();
    return true;
  };

  const onWheel = (event: WheelEvent) => {
    // Only claim the event once it is ours; otherwise normal scrolling stops.
    if (pushOverscroll(event.deltaY)) event.preventDefault();
  };

  let touchY = 0;
  const onTouchStart = (event: TouchEvent) => {
    touchY = event.touches[0]?.clientY ?? 0;
  };

  const onTouchMove = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY ?? 0;
    // Dragging up is a positive delta, matching wheel.
    const delta = touchY - y;
    touchY = y;
    if (pushOverscroll(delta)) event.preventDefault();
  };

  const onTouchEnd = () => {
    if (overscroll > 0 && overscroll < effort()) scheduleRelease();
  };

  /* Keyboard scrolling inside the panel can also sit at an edge, but it moves
     in discrete jumps rather than accumulating — a haul driven by repeated key
     presses would fight its own release timer. Arrow keys are left to scroll
     the panel normally; the Next pill and Escape remain the keyboard routes
     between studies. */

  /* ---------- Wiring ---------- */

  // Published on the element so the shared opener handler and the popup before
  // this one can reach it, without these closures having to be hoisted out of
  // the loop.
  Object.assign(popup as HTMLElement & PopupApi, { open, showPeek, endPeek, completePeek });

  scroller.addEventListener("wheel", onWheel, { passive: false });
  scroller.addEventListener("touchstart", onTouchStart, { passive: true });
  scroller.addEventListener("touchmove", onTouchMove, { passive: false });
  scroller.addEventListener("touchend", onTouchEnd, { passive: true });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isOpen) close();
  };

  closeButton?.addEventListener("click", close);
  scroller.addEventListener("scroll", onPanelScroll, { passive: true });
  window.addEventListener("resize", syncAsideHeight, { passive: true });
  document.addEventListener("keydown", onKeyDown);

  /* ---------- Accordion ---------- */

  /**
   * One panel open at a time, each transition eased.
   *
   * Height is animated from 0 to `auto` rather than toggled with `display`,
   * which is why .panel__body clips its overflow and why the head's padding is
   * identical open and closed — a padding that changed on toggle would shift
   * the header while the body was still moving.
   */
  const panels = gsap.utils.toArray<HTMLElement>(popup.querySelectorAll("[data-panel]"));

  const OPEN_DURATION = 0.42;
  const CLOSE_DURATION = 0.3;

  const bodyOf = (panel: HTMLElement) =>
    panel.querySelector<HTMLElement>("[data-panel-body]");

  const setPanel = (panel: HTMLElement, open: boolean, animate: boolean) => {
    const body = bodyOf(panel);
    const button = panel.querySelector<HTMLElement>("[data-panel-toggle]");
    button?.setAttribute("aria-expanded", String(open));

    if (!body) {
      panel.toggleAttribute("data-open", open);
      return;
    }

    gsap.killTweensOf(body);

    if (open) {
      panel.setAttribute("data-open", "");
      if (!animate || reduceMotion.matches) {
        gsap.set(body, { display: "block", height: "auto", opacity: 1 });
        return;
      }
      gsap.set(body, { display: "block", height: 0, opacity: 0 });
      gsap.to(body, {
        height: "auto",
        opacity: 1,
        duration: OPEN_DURATION,
        ease: "power2.out",
      });
      return;
    }

    // Attribute drops immediately so the border and icon flip at once; the
    // body keeps its inline display until the collapse finishes.
    panel.removeAttribute("data-open");
    if (!animate || reduceMotion.matches) {
      gsap.set(body, { clearProps: "display,height,opacity" });
      return;
    }
    gsap.to(body, {
      height: 0,
      opacity: 0,
      duration: CLOSE_DURATION,
      ease: "power2.in",
      onComplete: () => gsap.set(body, { clearProps: "display,height,opacity" }),
    });
  };

  const onToggle = (event: Event) => {
    const button = event.currentTarget as HTMLElement;
    const panel = button.closest<HTMLElement>("[data-panel]");
    if (!panel) return;

    const opening = !panel.hasAttribute("data-open");

    // Exclusive: opening one closes whichever was open.
    if (opening) {
      for (const other of panels) {
        if (other !== panel && other.hasAttribute("data-open")) {
          setPanel(other, false, true);
        }
      }
    }

    setPanel(panel, opening, true);
    playClick();
    tap(8);
  };

  const toggles = gsap.utils.toArray<HTMLElement>(popup.querySelectorAll("[data-panel-toggle]"));
  toggles.forEach((el) => el.addEventListener("click", onToggle));

  return () => {
    closeButton?.removeEventListener("click", close);
    scroller.removeEventListener("scroll", onPanelScroll);
    scroller.removeEventListener("wheel", onWheel);
    scroller.removeEventListener("touchstart", onTouchStart);
    scroller.removeEventListener("touchmove", onTouchMove);
    scroller.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("resize", syncAsideHeight);
    window.clearTimeout(releaseTimer);
    window.clearTimeout(settleTimer);
    document.removeEventListener("keydown", onKeyDown);
    toggles.forEach((el) => el.removeEventListener("click", onToggle));
    const api = popup as HTMLElement & PopupApi;
    delete api.open;
    delete api.showPeek;
    delete api.endPeek;
    delete api.completePeek;
    document.documentElement.style.overflow = "";
    delete document.documentElement.dataset.modalOpen;
  };
  }
}
