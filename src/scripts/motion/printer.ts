import gsap from "gsap";
import { bindCarousel, type CarouselConfig } from "./carousel";

/**
 * The printer's paper carousel — Figma star-pattern-carousel (1534:4348).
 *
 * The strip along the lid travels sideways while the shapes bounce in
 * alternation, so the printer looks like it is running rather than sitting
 * there as a drawing. All the behaviour lives in ./carousel — this file is the
 * printer's measurements of it. The contact pod runs the same code at a
 * different size.
 */
const PRINTER_CAROUSEL: CarouselConfig = {
  /** Distance between repeats, measured off the file's own ellipse centres. */
  period: 68.5935,
  stripWidth: 224,
  travelSeconds: 3.4,

  /**
   * NOT zero, and the sign matters. The lid is rotated 180deg, so the artwork
   * is not centred on its own window: swept across the whole range, the window
   * is only fully covered while the strip sits between -180px and -20px.
   * Outside that band the artwork runs off an edge and leaves a blank — at rest
   * it already misses the far edge by 5px, and travelling the other way opened
   * a gap of well over 100px. One period is 68.6px, which fits inside that
   * 160px band with room at both ends.
   */
  fromPeriod: -1,
  toPeriod: -2,

  /** A star is 12.7 units in a 21.4-unit window, leaving 4.21 of padding. */
  hop: 4,

  halfCycleMin: 0.3,
  halfCycleMax: 0.58,
};

export function initPrinter(root: ParentNode = document): () => void {
  const strips = gsap.utils.toArray<HTMLElement>(
    root.querySelectorAll("[data-printer-carousel]"),
  );
  if (!strips.length) return () => {};

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

  const tweens = strips.flatMap((strip) => bindCarousel(strip, PRINTER_CAROUSEL));

  return () => tweens.forEach((tween) => tween.kill());
}
