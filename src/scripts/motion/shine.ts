import gsap from "gsap";

/**
 * Hover shine sweep — Figma node 1735:483, "shine-motion".
 *
 * Figma's comp is a still of the effect mid-sweep; this slides that whole
 * four-bar group across the image and off the far side.
 *
 * "Respective to the size of the image" is handled two ways:
 *
 *  - Geometry is proportional. Every bar's width, height and position is a
 *    percentage of its container (see Shine.astro), so the group is naturally
 *    larger on the featured card than on a thumbnail.
 *
 *  - Travel runs at a CONSTANT SPEED rather than a fixed duration. A wide
 *    image therefore takes longer to cross than a small one, which is what
 *    makes the two read as the same physical material. A fixed duration would
 *    make the thumbnails look like they were flicked and the featured card
 *    look sluggish.
 *
 * Binding is delegated from each overlay's parent element, so any card that
 * contains a <Shine /> is wired up with no per-page code.
 */

/** Sweep speed in px/second, measured across the container. */
const SWEEP_SPEED = 1000;

/**
 * Clamps, so tiny images stay readable and huge ones never drag. The ceiling
 * is set high enough that the large featured card stays INSIDE the range and
 * runs at the true constant speed; only small thumbnails hit the floor, which
 * is what the floor is for. If both ends clamp, the size relationship the
 * whole effect depends on flattens out.
 */
const MIN_DURATION = 0.62;
const MAX_DURATION = 2;

/** Start and end offsets as a multiple of container width. The group is wider
 *  than the container, so it must start and finish fully outside it. */
const SWEEP_FROM = -0.9;
const SWEEP_TO = 1.2;

/**
 * Hover intent. The pointer must rest on a card this long before the sweep
 * begins, so merely passing over one on the way somewhere else does not fire
 * it.
 */
const HOVER_INTENT_MS = 190;

/**
 * Quiet period after scrolling stops. While the page is moving, cards slide
 * under a stationary pointer and would trigger sweeps the reader never asked
 * for — which is what makes the shine feel like it is interrupting the scroll.
 */
const SCROLL_QUIET_MS = 320;

/* Scroll state is shared by every overlay, so it is tracked once here rather
   than per card. */
let lastScrollAt = 0;
let scrollBound = false;

function watchScroll(): void {
  if (scrollBound) return;
  scrollBound = true;
  window.addEventListener(
    "scroll",
    () => {
      lastScrollAt = performance.now();
    },
    { passive: true },
  );
}

function isScrolling(): boolean {
  return performance.now() - lastScrollAt < SCROLL_QUIET_MS;
}

export function initShine(root: ParentNode = document): () => void {
  const overlays = gsap.utils.toArray<HTMLElement>(root.querySelectorAll("[data-shine]"));
  if (!overlays.length) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const teardown: Array<() => void> = [];
  watchScroll();

  for (const overlay of overlays) {
    const card = overlay.parentElement;
    const group = overlay.querySelector<HTMLElement>("[data-shine-group]");
    if (!card || !group) continue;

    // Park it off the left edge so the first hover sweeps in rather than
    // fading up in the middle of the image.
    gsap.set(group, { xPercent: SWEEP_FROM * 100, autoAlpha: 0 });

    const sweep = () => {
      if (reduceMotion.matches) return;

      const width = card.getBoundingClientRect().width;
      if (!width) return;

      const distance = (SWEEP_TO - SWEEP_FROM) * width;
      const duration = gsap.utils.clamp(
        MIN_DURATION,
        MAX_DURATION,
        distance / SWEEP_SPEED,
      );

      // Restart rather than queue, so re-entering re-triggers cleanly.
      gsap.killTweensOf(group);
      gsap
        .timeline()
        .set(group, { xPercent: SWEEP_FROM * 100, autoAlpha: 1 })
        .to(group, {
          xPercent: SWEEP_TO * 100,
          duration,
          ease: "power1.inOut",
        })
        // Hide once it is off the far edge, otherwise the next hover's `set`
        // would show it flicking back across.
        .set(group, { autoAlpha: 0 });
    };

    // Hover intent: arm a timer on enter, and only sweep if the pointer is
    // still there when it elapses AND the page has settled.
    let intent: number | undefined;

    const clearIntent = () => {
      if (intent !== undefined) {
        window.clearTimeout(intent);
        intent = undefined;
      }
    };

    const onEnter = () => {
      clearIntent();
      intent = window.setTimeout(() => {
        intent = undefined;
        // Re-checked here, not on enter: the reader may have started
        // scrolling during the wait.
        if (isScrolling()) return;
        sweep();
      }, HOVER_INTENT_MS);
    };

    card.addEventListener("pointerenter", onEnter);
    card.addEventListener("pointerleave", clearIntent);
    card.addEventListener("focusin", sweep);

    teardown.push(() => {
      clearIntent();
      card.removeEventListener("pointerenter", onEnter);
      card.removeEventListener("pointerleave", clearIntent);
      card.removeEventListener("focusin", sweep);
      gsap.killTweensOf(group);
    });
  }

  return () => teardown.forEach((fn) => fn());
}
