/**
 * Motion tokens — the vocabulary for every animation on the site.
 *
 * Animation is the point of this portfolio, so timing and easing are treated
 * as first-class design tokens rather than magic numbers scattered through
 * timeline code.
 *
 * The CSS-transition equivalents live in src/styles/tokens.css. Keep in sync.
 */

/** Durations in seconds (GSAP's unit). */
export const DUR = {
  /** Hover/press feedback. Should feel instant. */
  fast: 0.25,
  /** Standard entrance for a single element. */
  base: 0.45,
  /** Deliberate, "look at me" entrance. */
  slow: 0.9,
  /** Ambient idle loops — long enough to read as drift, not motion. */
  drift: 4,
} as const;

/**
 * Easing. The design language is bubbly and hand-drawn, so entrances
 * overshoot rather than settle linearly.
 */
export const EASE = {
  /** Overshoot for pops. Tuned per-element via back.out(n). */
  pop: "back.out(1.7)",
  /** Stronger overshoot for the hero wordmark letters. */
  popLoud: "back.out(2.6)",
  /** Decelerate — for anything sliding into place. */
  out: "power3.out",
  /** Symmetric — for looping idle motion so there is no visible seam. */
  loop: "sine.inOut",
} as const;

/** Stagger spacing between siblings, in seconds. */
export const STAGGER = {
  letters: 0.055,
  navItems: 0.07,
  confetti: 0.045,
} as const;
