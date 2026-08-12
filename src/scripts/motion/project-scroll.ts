import gsap from "gsap";
import { playTrail } from "../audio/sfx";
import { tap } from "../haptics";

/**
 * Scroll-driven project queue — an endless rotation.
 *
 * Figma has four states of one layout — Projects (1521:3352), Projects-Yoko
 * (1737:499), Projects-DWA (1748:644), Projects-Bees (1748:721) — and they
 * rotate: the featured project drops to the end of the thumbnail column and
 * the rest shift up.
 *
 * The stage is sticky over a tall wrapper, so scrolling advances the queue
 * while the layout stays put. That is CSS `position: sticky` rather than a
 * pinning plugin: no JS runs to hold the layout in place, it survives resize
 * for free, and without scripting it degrades to a plain tall page.
 *
 * ENDLESS: the wrapper holds two full rotations of runway. Once the reader
 * passes the first rotation, the scroll position is moved back by exactly one
 * rotation. The sticky layout is pixel-identical either side of that jump and
 * the queue index is the same, so the rotation simply keeps going. The runway
 * is doubled precisely so the jump never lands on the document's end, which
 * would stop the scroll dead.
 *
 * Nothing is created or destroyed on change. Featured cards are stacked and
 * cross-faded; thumbnails are reordered with CSS `order`. That matters — the
 * shine overlays are bound to their elements at init, and rebuilding the DOM
 * per step would orphan those listeners.
 */

/**
 * Haptic tap length in ms. Short enough to read as a detent clicking over
 * rather than a notification buzz.
 */
const HAPTIC_MS = 12;

/** px/ms of scrolling treated as "full speed" when scaling the sound. */
const SCROLL_SPEED_REFERENCE = 2.2;

/** 0 = follow raw jittery speed, 1 = never move. */
const SPEED_SMOOTHING = 0.6;

export function initProjectScroll(gallery: HTMLElement): () => void {
  const featured = gsap.utils.toArray<HTMLElement>(gallery.querySelectorAll("[data-featured]"));
  const thumbs = gsap.utils.toArray<HTMLElement>(gallery.querySelectorAll("[data-thumb]"));
  const count = featured.length;
  if (count < 2) return () => {};

  const scroller = gallery.closest<HTMLElement>("[data-stage-scroll]");
  if (!scroller) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = -1;

  /** One full rotation's worth of scrolling. The wrapper holds three. */
  const loopLength = () => (scroller.offsetHeight - window.innerHeight) / 3;

  const apply = (index: number, initial: boolean) => {
    if (index === current) return;
    const previous = current;
    current = index;

    // Hard cut, no cross-fade. A dissolve makes the queue feel like it is
    // drifting; an instant swap lands as a discrete click, which is what the
    // haptic below is punctuating. `set` rather than `to` also means a fast
    // scroll through several steps cannot leave two cards half-faded.
    //
    // `opacity`, NOT `autoAlpha`. autoAlpha also writes `visibility: hidden`,
    // which lets the browser discard the card's rasterisation — so the next
    // reveal paints the card's white background for a frame before the image
    // reappears, and that frame reads as a blink. At plain opacity 0 the card
    // stays composited and the swap is genuinely instant.
    featured.forEach((card, i) => {
      const active = i === index;
      card.toggleAttribute("aria-hidden", !active);
      gsap.set(card, {
        opacity: active ? 1 : 0,
        // Hidden cards must not catch the shine's hover or the reader's clicks.
        pointerEvents: active ? "auto" : "none",
      });
    });

    /* Both the tap and the sparkle fire HERE — on an actual change of project,
       not on scrolling.

       The sound used to be driven by scroll movement itself, which meant it
       played continuously while nothing happened: a project holds for about
       540px, so half a viewport of scrolling was answered by a sparkle every
       70-260ms with the same card on screen the whole way. That reads as the
       page responding to the reader when it has nothing to report. Tied to the
       change, each sparkle means one thing — the queue turned over.

       Not on the first paint, so arriving on the page is silent. */
    if (!initial && previous !== -1) {
      tap(HAPTIC_MS);
      // Scaled by scroll speed the way the cursor trail scales by pointer
      // speed, so racing through the queue sounds brighter than easing through.
      playTrail(Math.min(speed / SCROLL_SPEED_REFERENCE, 1));
    }

    thumbs.forEach((thumb, i) => {
      if (i === index) {
        // The featured project leaves the column entirely.
        thumb.dataset.slot = "hidden";
        return;
      }
      // Queue order: the project after the featured one leads.
      const slot = (i - index - 1 + count) % count;
      thumb.dataset.slot = String(slot);
      thumb.style.order = String(slot);
    });
  };

  let lastY = window.scrollY;
  let lastAt = performance.now();
  let speed = 0;

  const readScroll = () => {
    const loop = loopLength();
    if (loop <= 0) {
      apply(0, false);
      return;
    }

    const raw = window.scrollY - scroller.offsetTop;

    // Wrap back one full rotation once past the SECOND, landing the reader in
    // the middle of the runway. The visual state is identical across the seam
    // (index is the same either side), so the queue just keeps turning — and
    // landing mid-runway preserves a full rotation of room above them for
    // rewinding, which scrolling up to the hero depends on.
    if (raw >= loop * 2) {
      window.scrollTo({ top: window.scrollY - loop, behavior: "instant" });
      lastY = window.scrollY;
      return;
    }

    apply(Math.floor((raw / loop) * count) % count, false);
  };

  /* Tracks how fast the reader is scrolling, which only sets how bright the
     sparkle is when the queue does turn over. It makes no sound of its own. */
  const measureSpeed = () => {
    const now = performance.now();
    const elapsed = Math.max(now - lastAt, 1);
    const distance = Math.abs(window.scrollY - lastY);
    lastY = window.scrollY;
    lastAt = now;

    // Exponentially smoothed so one erratic sample cannot spike the audio.
    speed = speed * SPEED_SMOOTHING + (distance / elapsed) * (1 - SPEED_SMOOTHING);
  };

  // Passive + rAF-coalesced: scroll fires far more often than paint.
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      // Speed first: apply() reads it when a change lands on this frame.
      measureSpeed();
      readScroll();
    });
  };

  apply(0, true);
  readScroll();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  // Clicking a thumbnail scrolls to that project's step rather than doing
  // nothing — the queue is the only way to reach them otherwise.
  const onThumbClick = (event: Event) => {
    const thumb = event.currentTarget as HTMLElement;
    const index = Number(thumb.dataset.index ?? 0);
    const loop = loopLength();
    if (loop <= 0) return;
    window.scrollTo({
      top: scroller.offsetTop + (loop * (index + 0.5)) / count,
      behavior: reduceMotion.matches ? "auto" : "smooth",
    });
  };
  thumbs.forEach((thumb) => thumb.addEventListener("click", onThumbClick));

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    thumbs.forEach((thumb) => thumb.removeEventListener("click", onThumbClick));
  };
}
