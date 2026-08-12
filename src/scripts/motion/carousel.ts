import gsap from "gsap";

/**
 * The star-pattern carousel — a strip of stars and dots that travels sideways
 * while every shape bounces.
 *
 * Shared, because the same strip appears in two places at two sizes: the
 * printer's lid on the Play page (Figma 1534:4348) and the contact pod's lid
 * (Figma 1536:4631). The pod's artwork is the printer's scaled 1.65x, so the
 * geometry differs but not one line of the behaviour — and the behaviour is
 * where all the subtlety is. Everything size-dependent is a parameter.
 *
 * Two things make the marquee cheap:
 *
 * 1. The artwork is drawn wider than the window it shows through, so this is
 *    ONE strip sliding behind a clip rather than tiles butted together, and
 *    there is no seam to align.
 *
 * 2. The pattern repeats on a fixed period. Sliding by exactly one period lands
 *    on an arrangement identical to the start, so the loop is invisible —
 *    sliding by the window's width instead would jump, because the window is
 *    not a whole number of periods.
 */

export type CarouselConfig = {
  /** Distance between repeats, in the artwork's own units. */
  period: number;
  /** The strip's viewBox width, which `period` is expressed against. */
  stripWidth: number;
  /** Seconds for one period to pass. Slow — it is scenery, not a progress bar. */
  travelSeconds: number;
  /**
   * Where the travel runs, in periods.
   *
   * Which periods matters, not just how many. The window has to stay covered by
   * artwork across the whole sweep; run it over a stretch where the artwork has
   * ended and a bare gap crosses the lid.
   */
  fromPeriod: number;
  toPeriod: number;
  /**
   * How far a shape sits from centre at the top or bottom of its bounce.
   *
   * Set this from MEASUREMENT, not taste: the shapes are smaller than the strip
   * they are drawn in, and the padding between the lowest shape edge and the
   * edge of that box is the ceiling. Stay under it and no shape ever leaves its
   * own box, so nothing downstream can cut it — not the window's clip, not the
   * lid it sits in. (Printer: 4.21 of padding, hop 4. Pod: 6.48, hop 6.)
   *
   * A HALF-amplitude — neighbours start at opposite ends, so the distance the
   * eye actually compares is twice this.
   */
  hop: number;
  /**
   * Range of times a shape takes to travel from one end of its bounce to the
   * other. Each shape draws its own from this range, so the row never falls
   * into a single collective rhythm.
   */
  halfCycleMin: number;
  halfCycleMax: number;
  /** Motifs in one period. The strip runs star, star, ellipse. */
  motifsPerPeriod?: number;
};

/**
 * A shape's bounce speed, from its position along the strip.
 *
 * Deterministic, and keyed to POSITION rather than drawn per element. The same
 * motif appears in more than one copy of the strip at the same place on screen;
 * if those copies were given different speeds they would drift apart and paint
 * as a doubled, blurred shape. Position is what the copies agree on.
 */
function halfCycleFor(slot: number, min: number, max: number): number {
  const noise = Math.sin(slot * 12.9898) * 43758.5453;
  const unit = noise - Math.floor(noise);
  return min + unit * (max - min);
}

/**
 * Animate one strip: the sideways travel, plus a bounce on every shape.
 *
 * The strip is expected to hold copies of the artwork marked with
 * `data-carousel-shift`, each carrying its offset in whole periods.
 *
 * @returns the tweens created, for the caller to kill.
 */
export function bindCarousel(strip: HTMLElement, config: CarouselConfig): gsap.core.Tween[] {
  const copies = gsap.utils.toArray<HTMLElement>(strip.querySelectorAll("[data-carousel-shift]"));
  if (!copies.length) return [];

  const motifsPerPeriod = config.motifsPerPeriod ?? 3;
  const slotWidth = config.period / motifsPerPeriod;
  const tweens: gsap.core.Tween[] = [];

  const perPeriod = (config.period / config.stripWidth) * 100;
  tweens.push(
    gsap.fromTo(
      strip,
      { xPercent: perPeriod * config.fromPeriod },
      {
        xPercent: perPeriod * config.toPeriod,
        duration: config.travelSeconds,
        ease: "none",
        repeat: -1,
      },
    ),
  );

  /* Every star and dot bounces, and NEIGHBOURS BOUNCE OPPOSITE WAYS — while one
     is at the top of its arc the next is at the bottom.

     This replaced a travelling wave, where each shape lagged its neighbour
     slightly. That was real motion, but it was not readable: adjacent shapes
     were only a fraction apart at any moment, so there was nothing to see the
     movement AGAINST and the row looked static. Alternating puts every shape at
     maximum distance from the one beside it, which turns a few pixels into an
     obvious zigzag.

     Bucketed by position along the whole strip, so every copy of a motif lands
     together and bounces as one. */
  const bySlot = new Map<number, SVGGraphicsElement[]>();

  /* EVERY copy, not just the first. An earlier version read a single `svg` off
     the strip and animated only that one of three — and the one it picked sits
     off to the side of the window, so nearly every shape actually on screen was
     still. That is why there appeared to be no bounce at all. */
  for (const copy of copies) {
    const shift = Number(copy.dataset.carouselShift ?? 0);

    for (const shape of copy.querySelectorAll<SVGGraphicsElement>("path[id], circle[id]")) {
      const box = shape.getBBox();
      /**
       * Where this motif sits in the STRIP, not in its own copy.
       *
       * getBBox is copy-local and identical in every copy, so on its own it
       * would give the same treatment to motifs that are visually adjacent
       * across a join. Adding the copy's own offset is what keeps the up/down
       * alternation running unbroken from one copy into the next — including
       * when the offset is an odd number of motifs, which flips the parity.
       */
      const slot = Math.floor((box.x + box.width / 2) / slotWidth) + shift * motifsPerPeriod;
      const bucket = bySlot.get(slot);
      if (bucket) bucket.push(shape);
      else bySlot.set(slot, [shape]);
    }
  }

  for (const [slot, group] of bySlot) {
    /**
     * Neighbours START at opposite ends — one at the bottom heading up while
     * the next is at the top heading down. They then run at their own speeds
     * and drift out of step, which is the point: the row reads as loose and
     * hand-wound rather than mechanical. Opposing them to begin with just means
     * it never has to look uniform to get going.
     *
     * Done by swapping the ENDS, not by delaying one group half a cycle.
     * `power2.out` under `yoyo` is not symmetric about the half cycle, so a
     * delayed group meets the other in the middle rather than opposing it —
     * measured, that flattened the row on 26 frames in 60.
     *
     * The ease is a thrown ball rather than a float: it decelerates into the
     * far end and accelerates away from the near one. Easing the same at both
     * ends is what makes bobbing read as hovering.
     */
    const from = (((slot % 2) + 2) % 2) === 0 ? config.hop : -config.hop;
    tweens.push(
      gsap.fromTo(
        group,
        { y: from },
        {
          y: -from,
          duration: halfCycleFor(slot, config.halfCycleMin, config.halfCycleMax),
          ease: "power2.out",
          repeat: -1,
          yoyo: true,
        },
      ),
    );
  }

  return tweens;
}
