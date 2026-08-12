import gsap from "gsap";
import { DUR, EASE, STAGGER } from "./tokens";
import { bounce } from "./bounce";

/**
 * Hero motion.
 *
 * Structure worth knowing before editing:
 *
 * - Everything is wrapped in `gsap.matchMedia()`. The reduced-motion branch is
 *   a real alternative (a quick fade), not a disabled no-op, and GSAP reverts
 *   the other branch's inline styles automatically when the preference flips
 *   mid-session. Never add a tween outside the matchMedia block.
 *
 * - Confetti motion is split across two elements on purpose. The outer
 *   [data-confetti] span owns x/y (pointer parallax), the inner <svg> owns its
 *   own y/rotation (idle float). Two tweens writing the same property on the
 *   same element is the usual cause of "the parallax fights the float".
 *
 * - Elements start hidden via CSS (see global.css). GSAP's `autoAlpha` writes
 *   an inline `visibility`, which outranks the class rule and reveals them.
 */

type Conditions = { motionOK: boolean; reduced: boolean };

/** Blob scale while hidden — it pops out from slightly under full size. */
const BLOB_HIDDEN_SCALE = 0.72;

/* The wordmark's hover bounce now lives in ./bounce, shared with the
   case-study doodles so both stay in step if it is retuned. */

/**
 * Hover bounce for every glyph in the wordmark — the letters of Group 80 and
 * Group 81, plus the two "!!" accent marks of Group 83.
 *
 * Hit-testing is done by hand rather than with `pointerenter` on the letters.
 * The glyphs are outlines with fill="none", so native hit-testing only catches
 * the stroke itself; even `pointer-events: all` leaves dead spots, because the
 * middle of an "R" or an "a" sits in a counter that is not part of the fill.
 * Measured that way, 13 of 14 letters were unhoverable at their own centre.
 *
 * So each pointer move is projected into the SVG's user space and tested
 * against the letters' bounding boxes. Two useful properties fall out:
 * bounding boxes are transform-independent, so a letter mid-bounce keeps its
 * resting hit area; and where boxes overlap the smallest wins, which keeps a
 * narrow letter like "i" reachable beside a wide neighbour.
 *
 * @param isReady gate so a hover landing mid-entrance cannot fight the
 *                entrance timeline — both write `transform` on the same
 *                element, and `killTweensOf` would otherwise cancel a letter's
 *                arrival and strand it at a partial scale.
 */
function bindLetterBounce(root: HTMLElement, isReady: () => boolean): () => void {
  type Glyph = { el: SVGElement; box: DOMRect };
  type Source = { svg: SVGSVGElement; group: SVGGraphicsElement; glyphs: Glyph[] };

  // Every SVG inside the wordmark contributes its root group's children:
  // Group 80 (7 letters), Group 83 (2 accent marks), Group 81 (7 letters).
  // Each source carries its own coordinate space, hence the per-source CTM.
  const parsed: Source[] = [];
  for (const svg of gsap.utils.toArray<SVGSVGElement>(root.querySelectorAll("svg"))) {
    const group = svg.querySelector<SVGGraphicsElement>(":scope > g");
    if (!group) continue;
    const glyphs = gsap.utils
      .toArray<SVGGraphicsElement>(group.children)
      // Geometry is static, so each box is measured once.
      .map((el) => ({ el: el as SVGElement, box: el.getBBox() }));
    if (glyphs.length) parsed.push({ svg, group, glyphs });
  }

  let hovered: SVGElement | null = null;

  const onMove = (event: PointerEvent) => {
    if (!isReady()) return;

    let best: SVGElement | null = null;
    let bestArea = Infinity;

    for (const { svg, group, glyphs } of parsed) {
      const ctm = group.getScreenCTM();
      if (!ctm) continue;
      // Project the pointer into the group's user space, so the comparison is
      // against raw bounding boxes with no scaling maths.
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const local = point.matrixTransform(ctm.inverse());

      for (const { el, box } of glyphs) {
        const inside =
          local.x >= box.x &&
          local.x <= box.x + box.width &&
          local.y >= box.y &&
          local.y <= box.y + box.height;
        if (!inside) continue;
        const area = box.width * box.height;
        if (area < bestArea) {
          bestArea = area;
          best = el;
        }
      }
    }

    if (best === hovered) return;
    hovered = best;
    if (best) bounce(best);
  };

  const onLeave = () => {
    hovered = null;
  };

  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);

  return () => {
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave);
  };
}

/**
 * Wire up the nav hover states.
 *
 * Figma replaces the white pill with a coloured blob and tilts the button
 * (Nav-Projects-Hover -10.56deg, Nav-Play-Hover +11.69deg, Nav-Contact-Hover
 * upright). Both layers are always in the DOM and cross-fade, so nothing
 * reflows and the neighbouring buttons stay put.
 *
 * Bound for pointer and focus alike, so keyboard users get the same state.
 *
 * @param animated false under `prefers-reduced-motion` — the blob still
 *                 swaps, because it is the only hover affordance the design
 *                 has, but it snaps and the tilt is skipped.
 */
function bindNavHover(items: HTMLElement[], animated: boolean): () => void {
  const teardown: Array<() => void> = [];

  /**
   * Last known pointer position, in viewport coordinates.
   *
   * Needed because `pointerleave` is not a reliable way to learn that the
   * pointer is no longer over a pill: it fires when the POINTER moves off an
   * element, not when the element moves out from under the pointer. Scrolling
   * with the wheel while resting the cursor on a pill does exactly that — the
   * nav slides away, no event is sent, and the pill keeps its hover state.
   * That left two pills looking hovered at once with the cursor elsewhere.
   */
  const pointer = { x: -1, y: -1, known: false };
  const trackPointer = (event: PointerEvent) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.known = true;
  };
  window.addEventListener("pointermove", trackPointer, { passive: true });
  teardown.push(() => window.removeEventListener("pointermove", trackPointer));

  /** Re-checks, per item, that a pill claiming hover really is under the pointer. */
  const verifiers: Array<() => void> = [];
  const verifyAll = () => verifiers.forEach((verify) => verify());

  /** Forces a pill back to rest, however it came to be lit. */
  const resets: Array<() => void> = [];

  /** Per-item reactions to the contact dialog opening and closing. */
  const onContactOpen: Array<() => void> = [];
  const onContactClose: Array<() => void> = [];

  const contactOpened = () => onContactOpen.forEach((fn) => fn());
  const contactClosed = () => onContactClose.forEach((fn) => fn());
  document.addEventListener("contact:open", contactOpened);
  document.addEventListener("contact:close", contactClosed);
  teardown.push(() => {
    document.removeEventListener("contact:open", contactOpened);
    document.removeEventListener("contact:close", contactClosed);
  });

  /**
   * A page restored from the back/forward cache comes back with the DOM exactly
   * as it was left — including whatever GSAP had written inline. Leave the page
   * with a pill lit and pressing Back brings it back lit, with no pointer event
   * to correct it. Nothing else fires here, so `pageshow` is the only hook.
   */
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    resets.forEach((reset) => reset());
  };
  window.addEventListener("pageshow", onPageShow);
  teardown.push(() => window.removeEventListener("pageshow", onPageShow));

  /* Scroll and resize both move pills relative to the pointer without any
     pointer event. Blur covers tabbing or switching away mid-hover, which also
     never delivers a leave. */
  window.addEventListener("scroll", verifyAll, { passive: true });
  window.addEventListener("resize", verifyAll, { passive: true });
  window.addEventListener("blur", verifyAll);
  teardown.push(() => {
    window.removeEventListener("scroll", verifyAll);
    window.removeEventListener("resize", verifyAll);
    window.removeEventListener("blur", verifyAll);
  });

  for (const item of items) {
    const bg = item.querySelector<HTMLElement>("[data-nav-bg]");
    const blob = item.querySelector<HTMLElement>("[data-nav-blob]");
    if (!bg || !blob) continue;

    const rotation = Number(item.dataset.rotate ?? 0);

    // The pill for the current page stays blobbed permanently and takes no
    // hover — it is a state indicator, not a target. Without this the init
    // below would immediately hide its blob.
    if (item.dataset.active !== undefined) {
      gsap.set(bg, { autoAlpha: 0 });
      gsap.set(blob, { autoAlpha: 1, scale: 1 });
      if (animated) gsap.set(item, { rotation });
      continue;
    }

    gsap.set(blob, { autoAlpha: 0, scale: BLOB_HIDDEN_SCALE });

    const enter = () => {
      if (!animated) {
        gsap.set(bg, { autoAlpha: 0 });
        gsap.set(blob, { autoAlpha: 1, scale: 1 });
        return;
      }
      gsap.to(item, { rotation, duration: DUR.fast, ease: EASE.pop });
      gsap.to(bg, { autoAlpha: 0, duration: DUR.fast * 0.5, ease: "none" });
      gsap.to(blob, { autoAlpha: 1, scale: 1, duration: DUR.base, ease: EASE.popLoud });
    };

    const leave = () => {
      if (!animated) {
        gsap.set(bg, { autoAlpha: 1 });
        gsap.set(blob, { autoAlpha: 0, scale: BLOB_HIDDEN_SCALE });
        return;
      }
      gsap.to(item, { rotation: 0, duration: DUR.fast, ease: EASE.pop });
      gsap.to(bg, { autoAlpha: 1, duration: DUR.fast * 0.5, ease: "none" });
      gsap.to(blob, {
        autoAlpha: 0,
        scale: BLOB_HIDDEN_SCALE,
        duration: DUR.fast,
        ease: "power2.out",
      });
    };

    /* The two reasons a pill can be lit are tracked separately and the visual
       follows from both, rather than each event driving the animation directly.
       Otherwise losing focus while still hovered — or the reverse — puts the
       pill back to rest under the cursor. `shown` also makes enter/leave
       idempotent, so a re-check that finds nothing changed does nothing. */
    let hovered = false;
    let focused = false;
    /** Held lit for as long as this pill's dialog is open. */
    let pinned = false;
    let shown = false;

    const sync = () => {
      const next = pinned || hovered || focused;
      if (next === shown) return;
      shown = next;
      if (next) enter();
      else leave();
    };

    const onEnter = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.known = true;
      hovered = true;
      sync();
    };
    const onLeavePill = () => {
      hovered = false;
      sync();
    };
    const onFocus = () => {
      /**
       * Only KEYBOARD focus lights the pill, which is what `:focus-visible`
       * means. Clicking an anchor focuses it in every browser, so treating
       * plain focus as a reason to stay lit left a pill blobbed after a click
       * with the cursor nowhere near it — a hover state with nothing hovering.
       * Tabbing to it still shows the state, which is the point of binding
       * focus at all.
       */
      focused = item.matches(":focus-visible");
      sync();
    };
    const onBlur = () => {
      focused = false;
      sync();
    };

    resets.push(() => {
      hovered = false;
      focused = false;
      pinned = false;
      shown = false;
      // Snapped, not animated: this runs when the page reappears, and a pill
      // easing out of a state the reader never saw it enter looks like a glitch.
      gsap.set(bg, { autoAlpha: 1 });
      gsap.set(blob, { autoAlpha: 0, scale: BLOB_HIDDEN_SCALE });
      gsap.set(item, { rotation: 0 });
    });

    /* Hit-tested by rectangle rather than `elementFromPoint`, because the trail
       canvas and other full-page overlays sit above the nav and would answer
       with themselves — reporting a miss while the cursor is genuinely on the
       pill. The rect of a tilted pill is a little larger than the pill, which
       only makes this more generous; that is the direction to err in, since the
       verifier below uses it to take a hover AWAY. */
    const pointerIsInside = () => {
      if (!pointer.known) return false;
      const rect = item.getBoundingClientRect();
      return (
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom
      );
    };

    /* Only ever CLEARS a stale hover — it never lights a pill up. */
    verifiers.push(() => {
      if (!hovered || pointerIsInside()) return;
      hovered = false;
      sync();
    });

    /**
     * While the contact dialog is open, ITS pill stays lit and every other one
     * goes dark.
     *
     * Lit because the pill has become a state indicator, the same as the pill
     * for the page you are on — the thing it opened is on screen. Dark for the
     * rest because the dialog's scrim is now over the nav: whatever the cursor
     * was on, it is not on a pill any more, and the browser sends no
     * pointerleave for something that merely appeared on top.
     */
    const isContactPill = item.dataset.contactOpen !== undefined;

    onContactOpen.push(() => {
      if (isContactPill) pinned = true;
      else hovered = false;
      focused = false;
      sync();
    });

    onContactClose.push(() => {
      pinned = false;
      /* Recomputed rather than assumed false: the reader may well close with
         Esc while the cursor sits on a pill, and once the scrim goes no pointer
         event arrives to say the pill is under it again. */
      hovered = pointerIsInside();
      focused = item.matches(":focus-visible");
      sync();
    });

    item.addEventListener("pointerenter", onEnter);
    item.addEventListener("pointerleave", onLeavePill);
    item.addEventListener("focus", onFocus);
    item.addEventListener("blur", onBlur);

    teardown.push(() => {
      item.removeEventListener("pointerenter", onEnter);
      item.removeEventListener("pointerleave", onLeavePill);
      item.removeEventListener("focus", onFocus);
      item.removeEventListener("blur", onBlur);
    });
  }

  return () => teardown.forEach((fn) => fn());
}

export function initHero(hero: HTMLElement): () => void {
  const nav = hero.querySelector<HTMLElement>("[data-nav]");
  const navItems = gsap.utils.toArray<HTMLElement>(hero.querySelectorAll("[data-nav-item]"));

  const wordmark = hero.querySelector<HTMLElement>("[data-wordmark]");
  const lines = gsap.utils.toArray<HTMLElement>(hero.querySelectorAll("[data-wordmark-line]"));
  // Each export has exactly one root <g> holding one child per letter.
  const lettersByLine = lines.map((line) =>
    gsap.utils.toArray<SVGElement>(line.querySelectorAll(":scope > svg > g > *")),
  );
  const accent = hero.querySelector<HTMLElement>("[data-wordmark-accent]");

  const cloud = hero.querySelector<HTMLElement>("[data-cloud]");
  const cloudShape = hero.querySelector<HTMLElement>("[data-cloud-shape]");
  const cloudLabel = hero.querySelector<HTMLElement>("[data-cloud-label]");

  const confetti = gsap.utils.toArray<HTMLElement>(hero.querySelectorAll("[data-confetti]"));
  const confettiArt = confetti
    .map((el) => el.querySelector<SVGElement>("svg"))
    .filter((el): el is SVGElement => el !== null);

  const grid = hero.querySelector<SVGElement>(".grid");

  const containers = [nav, wordmark, cloud, ...confetti].filter(
    (el): el is HTMLElement => el !== null,
  );

  const mm = gsap.matchMedia();

  mm.add(
    {
      motionOK: "(prefers-reduced-motion: no-preference)",
      reduced: "(prefers-reduced-motion: reduce)",
    },
    (context) => {
      const { motionOK } = context.conditions as Conditions;

      // Reveal the wrappers the CSS pre-hid; individual pieces are re-hidden
      // below by the timeline's `from` states.
      gsap.set(containers, { autoAlpha: 1 });

      const cleanups: Array<() => void> = [];

      // Nav hover is bound in BOTH branches. The blob swap carries meaning —
      // it is the only hover affordance, since the custom cursor replaces the
      // system pointer — so reduced-motion users get it too, just without the
      // tilt and with the cross-fade snapped rather than eased.
      cleanups.push(bindNavHover(navItems, motionOK));

      if (!motionOK) {
        gsap.from([nav, wordmark, cloud, ...confetti], {
          autoAlpha: 0,
          duration: DUR.fast,
          stagger: 0.02,
          ease: "none",
        });
        return () => cleanups.forEach((fn) => fn());
      }

      // Letters only become interactive once they have finished arriving.
      let entranceDone = false;
      if (wordmark) {
        cleanups.push(bindLetterBounce(wordmark, () => entranceDone));
      }

      const tl = gsap.timeline({
        defaults: { ease: EASE.out },
        onComplete: () => {
          entranceDone = true;
        },
      });

      if (grid) {
        tl.from(grid, { autoAlpha: 0, duration: DUR.slow, ease: "none" }, 0);
      }

      // Nav drops in from above.
      tl.from(
        navItems,
        {
          autoAlpha: 0,
          y: -28,
          scale: 0.85,
          duration: DUR.base,
          ease: EASE.pop,
          stagger: STAGGER.navItems,
        },
        0.1,
      );

      // Letters pop per line. Slight random rotation keeps the bubble letters
      // from landing like a mechanical grid.
      lettersByLine.forEach((letters, lineIndex) => {
        if (!letters.length) return;
        tl.from(
          letters,
          {
            autoAlpha: 0,
            scale: 0.35,
            y: 46,
            rotation: () => gsap.utils.random(-18, 18),
            transformOrigin: "50% 50%",
            duration: DUR.slow,
            ease: EASE.popLoud,
            stagger: STAGGER.letters,
          },
          0.25 + lineIndex * 0.28,
        );
      });

      if (accent) {
        tl.from(
          accent,
          {
            autoAlpha: 0,
            scale: 0,
            rotation: -35,
            transformOrigin: "50% 100%",
            duration: DUR.base,
            ease: EASE.popLoud,
          },
          0.95,
        );
      }

      // Confetti pops outward. Only scale/rotation/alpha here — x and y are
      // reserved for the parallax handler.
      if (confetti.length) {
        tl.from(
          confetti,
          {
            autoAlpha: 0,
            scale: 0,
            rotation: () => gsap.utils.random(-90, 90),
            transformOrigin: "50% 50%",
            duration: DUR.base,
            ease: EASE.popLoud,
            stagger: { each: STAGGER.confetti, from: "random" },
          },
          0.6,
        );
      }

      if (cloud) {
        tl.from(
          cloud,
          {
            autoAlpha: 0,
            scale: 0.4,
            yPercent: 18,
            transformOrigin: "50% 50%",
            duration: DUR.slow,
            ease: EASE.popLoud,
          },
          1.05,
        );
      }

      /* ---------- Idle loops (start once the entrance has landed) ---------- */

      const idle = gsap.timeline({ delay: tl.duration() * 0.75 });

      confettiArt.forEach((art, i) => {
        const drift = Number(confetti[i]?.dataset.drift ?? 1);
        idle.to(
          art,
          {
            y: gsap.utils.random(-10, -5),
            rotation: gsap.utils.random(-16, 16),
            duration: DUR.drift * drift,
            ease: EASE.loop,
            repeat: -1,
            yoyo: true,
          },
          i * 0.12,
        );
      });

      // Floats the whole button — shape and label together. Targeting the
      // shape alone would leave the label behind and split the two apart.
      // Safe alongside the entrance tween's yPercent: GSAP keeps `y` and
      // `yPercent` as separate components of the same transform.
      if (cloud) {
        idle.to(
          cloud,
          {
            y: -7,
            duration: DUR.drift * 0.55,
            ease: EASE.loop,
            repeat: -1,
            yoyo: true,
          },
          0,
        );
      }

      /* ---------- Pointer parallax ---------- */

      const parallax = confetti.map((el, i) => ({
        el,
        // Alternating depth so the layer separates instead of moving as a slab.
        depth: 10 + (i % 4) * 7,
        x: gsap.quickTo(el, "x", { duration: 0.9, ease: "power3.out" }),
        y: gsap.quickTo(el, "y", { duration: 0.9, ease: "power3.out" }),
      }));

      const onPointerMove = (event: PointerEvent) => {
        const rect = hero.getBoundingClientRect();
        const dx = (event.clientX - rect.left) / rect.width - 0.5;
        const dy = (event.clientY - rect.top) / rect.height - 0.5;
        for (const item of parallax) {
          item.x(dx * item.depth);
          item.y(dy * item.depth);
        }
      };

      const onPointerLeave = () => {
        for (const item of parallax) {
          item.x(0);
          item.y(0);
        }
      };

      // Coarse pointers have no hover, so parallax would only fire mid-scroll.
      const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      if (canHover) {
        hero.addEventListener("pointermove", onPointerMove);
        hero.addEventListener("pointerleave", onPointerLeave);
      }

      /* ---------- Interactive states ---------- */
      /* Nav hover is bound earlier so it applies to both motion branches. */

      if (cloud && cloudShape && cloudLabel) {
        // Squash-and-stretch: the shape deforms, the label only scales, so the
        // text never skews.
        const enter = () => {
          gsap.to(cloudShape, {
            scaleX: 1.08,
            scaleY: 0.94,
            duration: DUR.fast,
            ease: EASE.pop,
            transformOrigin: "50% 100%",
          });
          gsap.to(cloudLabel, { scale: 1.05, duration: DUR.fast, ease: EASE.pop });
        };
        const leave = () => {
          gsap.to(cloudShape, {
            scaleX: 1,
            scaleY: 1,
            duration: DUR.base,
            ease: "elastic.out(1, 0.45)",
          });
          gsap.to(cloudLabel, { scale: 1, duration: DUR.fast, ease: EASE.pop });
        };
        const press = () =>
          gsap.to(cloudShape, { scaleX: 0.94, scaleY: 1.06, duration: 0.1, ease: "power2.out" });

        cloud.addEventListener("pointerenter", enter);
        cloud.addEventListener("pointerleave", leave);
        cloud.addEventListener("pointerdown", press);
        cloud.addEventListener("pointerup", enter);
        cloud.addEventListener("focus", enter);
        cloud.addEventListener("blur", leave);
        cleanups.push(() => {
          cloud.removeEventListener("pointerenter", enter);
          cloud.removeEventListener("pointerleave", leave);
          cloud.removeEventListener("pointerdown", press);
          cloud.removeEventListener("pointerup", enter);
          cloud.removeEventListener("focus", enter);
          cloud.removeEventListener("blur", leave);
        });
      }

      // Returned cleanup runs when the media query stops matching or on revert.
      return () => {
        hero.removeEventListener("pointermove", onPointerMove);
        hero.removeEventListener("pointerleave", onPointerLeave);
        cleanups.forEach((fn) => fn());
      };
    },
    hero,
  );

  return () => mm.revert();
}
