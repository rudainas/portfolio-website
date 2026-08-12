import gsap from "gsap";

/**
 * Squash-and-stretch bounce.
 *
 * The hero wordmark's hover behaviour, shared so the case-study doodles use
 * the identical motion rather than a lookalike — if this is ever retuned, both
 * move together.
 *
 * Anchored at "50% 100%" so the target squashes onto its own baseline instead
 * of shrinking toward its middle. That bottom anchor is what reads as weight.
 *
 * The lift uses `yPercent`, never `y`. Some targets (the wordmark's letter
 * groups) carry a `transform="translate(...)"` from Figma, which GSAP parses
 * into its own `y` — animating `y` back to 0 would wipe that baked-in offset
 * and leave the element permanently displaced. GSAP keeps `y` and `yPercent`
 * as separate components of one transform, so this composes instead of
 * overwriting. It also scales the hop to each target's height.
 */
export function bounce(target: Element): void {
  // A fresh hover restarts the bounce rather than layering a second timeline.
  gsap.killTweensOf(target);

  gsap
    .timeline()
    .set(target, { transformOrigin: "50% 100%" })
    .to(target, { scaleX: 1.11, scaleY: 0.87, duration: 0.11, ease: "power2.out" })
    .to(target, {
      scaleX: 0.95,
      scaleY: 1.08,
      yPercent: -9,
      duration: 0.15,
      ease: "power2.out",
    })
    .to(target, {
      scaleX: 1,
      scaleY: 1,
      yPercent: 0,
      duration: 0.75,
      ease: "elastic.out(1, 0.4)",
    });
}
