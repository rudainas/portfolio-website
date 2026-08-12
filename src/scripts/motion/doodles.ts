import gsap from "gsap";
import { DUR, EASE } from "./tokens";
import { bounce } from "./bounce";

/**
 * doodles-motion — Figma node 1790:5813.
 *
 * The marks arrive as vectors, so each animates independently rather than as
 * one flat image: they scribble in with a staggered overshoot, then keep a
 * slow idle drift.
 *
 * Entrance is triggered by an IntersectionObserver instead of firing on load,
 * because these live far down the case study's scroll. Animating them while
 * they are still offscreen would mean the reader arrives to a scene that has
 * already finished.
 */

/** Fraction of the block that must be visible before the marks draw in. */
const REVEAL_RATIO = 0.25;

export function initDoodles(root: ParentNode = document): () => void {
  const blocks = gsap.utils.toArray<HTMLElement>(root.querySelectorAll("[data-doodles]"));
  if (!blocks.length) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const idles: gsap.core.Tween[] = [];
  const teardown: Array<() => void> = [];

  /**
   * Hover bounce, the same one the hero wordmark uses.
   *
   * Bound to the inner <svg>, not the outer span: the span owns the idle
   * drift's `yPercent`, and the bounce animates `yPercent` too. Splitting them
   * across two elements is what stops the drift and the bounce fighting over
   * the same property — the same split the confetti uses for parallax vs float.
   */
  const bindHover = (mark: HTMLElement) => {
    const art = mark.querySelector("svg");
    if (!art) return;
    const onEnter = () => {
      if (reduceMotion.matches) return;
      bounce(art);
    };
    mark.addEventListener("pointerenter", onEnter);
    teardown.push(() => mark.removeEventListener("pointerenter", onEnter));
  };

  const reveal = (block: HTMLElement) => {
    const marks = gsap.utils.toArray<HTMLElement>(block.querySelectorAll("[data-doodle]"));
    if (!marks.length) return;

    if (reduceMotion.matches) {
      gsap.set(marks, { autoAlpha: 1, scale: 1, rotation: 0 });
      return;
    }

    gsap.fromTo(
      marks,
      {
        autoAlpha: 0,
        scale: 0.3,
        // Random tilt so they land hand-placed rather than stamped.
        rotation: () => gsap.utils.random(-35, 35),
        transformOrigin: "50% 50%",
      },
      {
        autoAlpha: 1,
        scale: 1,
        rotation: 0,
        duration: DUR.slow,
        ease: EASE.popLoud,
        stagger: { each: 0.06, from: "random" },
      },
    );

    // Idle drift, started once the entrance has mostly landed.
    marks.forEach((mark, i) => {
      const speed = Number(mark.dataset.speed ?? 1);
      idles.push(
        gsap.to(mark, {
          yPercent: gsap.utils.random(-7, -3),
          rotation: gsap.utils.random(-6, 6),
          duration: DUR.drift * speed,
          ease: EASE.loop,
          repeat: -1,
          yoyo: true,
          delay: 0.8 + i * 0.05,
        }),
      );
    });
  };

  // Hide up front so nothing shows before its entrance runs.
  blocks.forEach((block) => {
    const marks = block.querySelectorAll("[data-doodle]");
    if (!reduceMotion.matches) gsap.set(marks, { autoAlpha: 0 });
  });

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        reveal(entry.target as HTMLElement);
        // One-shot: re-running on every scroll-by would be noise.
        observer.unobserve(entry.target);
      }
    },
    { threshold: REVEAL_RATIO },
  );

  blocks.forEach((block) => {
    observer.observe(block);
    gsap.utils
      .toArray<HTMLElement>(block.querySelectorAll("[data-doodle]"))
      .forEach(bindHover);
  });

  return () => {
    observer.disconnect();
    idles.forEach((tween) => tween.kill());
    teardown.forEach((fn) => fn());
  };
}
