import gsap from "gsap";
import { playClick } from "../audio/sfx";

/**
 * Page transition — the confetti stretch into light streaks and shoot upward,
 * then the browser navigates.
 *
 * Figma: Rectangle 4 (1534:4381), Rectangle 8 (1534:4385), Rectangle 10
 * (1534:4382), Rectangle 7 (1534:4384), Rectangle 6 (1534:4383). All five are
 * 25 x 717 stadiums; 4382 and 4384 are byte-identical, and 4381's image fill
 * matches 4385, so the five nodes resolve to three gradients. All five names
 * are kept so the mapping back to Figma stays traceable.
 *
 * On ScrollSmoother: the reference snippet uses `data-speed` for scroll
 * parallax, but this transition is click-driven, not scroll-driven — there is
 * no scroll for the plugin to read. What carries over is the *idea*: each
 * shape keeps a `data-speed` multiplier and travels at its own rate, so the
 * field separates into layers instead of sliding as one sheet. That needs no
 * plugin, so ScrollSmoother/ScrollTrigger are not loaded. If real scroll
 * parallax is wanted later, ScrollSmoother can read the same attributes.
 */

/** Seconds for a speed-1.0 shape to clear the viewport. */
const LAUNCH_BASE = 0.62;

/** How long the stretch-into-a-streak takes. */
const STRETCH_TIME = 0.26;

/** Navigate slightly before the last streak lands, so it never feels stalled. */
const NAVIGATE_LEAD = 0.12;

/** Streak variants, keyed to their Figma node. */
const STREAKS: Record<string, string[]> = {
  sky: ["streak--rect-4", "streak--rect-8"],
  pink: ["streak--rect-10", "streak--rect-7"],
  yellow: ["streak--rect-6"],
};

/** Guards against a second launch while one is already playing. Module-level
 *  because the launch can now be triggered from more than one place. */
let running = false;

/**
 * The launch in flight, and what it touched.
 *
 * Kept so a page RESTORED FROM THE BACK/FORWARD CACHE can undo it. Leaving the
 * page mid-launch is the normal case, not an edge one — the launch is what
 * navigates. The browser then freezes the document as it stands: content faded
 * to nothing, confetti collapsed, streaks mid-flight, `running` still true.
 * Press Back and that is exactly what comes back, with no load event to clear
 * it. The page reads as blank and no further transition can start.
 */
let launch: gsap.core.Timeline | null = null;
let launchedFrom: HTMLElement[] = [];
let streaks: HTMLElement[] = [];

/** Put the page back the way it was before a launch started. */
function restoreFromLaunch(): void {
  /* `revert` rather than clearing properties by name: GSAP restores each
     element to the inline state it recorded before the tween ran, so this stays
     correct if the launch is ever given more to animate. */
  launch?.revert();
  launch = null;

  for (const streak of streaks) streak.remove();
  streaks = [];

  /* Belt and braces. `revert` restores INLINE styles, and if the reader gets
     back inside the 3s failsafe window the `js-motion` class may still be on
     <html> — which hides this content by CSS. `autoAlpha` writes an inline
     `visibility`, which outranks the class, so this guarantees a visible page
     however the restore is timed. */
  if (launchedFrom.length) {
    gsap.set(launchedFrom, { autoAlpha: 1, scale: 1, x: 0, y: 0 });
  }
  launchedFrom = [];

  running = false;
}

/**
 * Run the launch and navigate. Exported so other modules can trigger the same
 * transition without a link to click — scroll-exit.ts uses it to leave the
 * Projects page upward, where no `data-transition` anchor exists.
 */
export function launchTransition(stage: HTMLElement, href: string): boolean {
  const layer = stage.querySelector<HTMLElement>("[data-streaks]");
  if (!layer || running) return false;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) {
    window.location.href = href;
    return true;
  }

  {
    running = true;

    const confetti = gsap.utils.toArray<HTMLElement>(stage.querySelectorAll("[data-confetti]"));
    const stageRect = stage.getBoundingClientRect();
    const perColour: Record<string, number> = { sky: 0, pink: 0, yellow: 0 };

    const tl = gsap.timeline();
    launch = tl;

    // Everything that is not backdrop lifts and fades, so the page clears out
    // from under the streaks rather than sitting there during the launch.
    const content = gsap.utils.toArray<HTMLElement>(
      stage.querySelectorAll("[data-wordmark], [data-cloud], [data-nav], [data-page-content]"),
    );
    if (content.length) {
      tl.to(content, { autoAlpha: 0, y: -34, duration: 0.34, ease: "power2.in", stagger: 0.03 }, 0);
    }
    // Everything the launch hides, remembered for restoreFromLaunch above.
    launchedFrom = [...content, ...confetti];

    let longest = 0;

    confetti.forEach((shape) => {
      const speed = Number(shape.dataset.speed ?? 1);
      const colour = shape.dataset.color ?? "sky";
      const variants = STREAKS[colour] ?? STREAKS.sky;
      const variant = variants[perColour[colour]++ % variants.length];

      const rect = shape.getBoundingClientRect();
      // Streak is centred on the shape it grew from, and anchored by its
      // bottom edge so it stretches upward out of that shape.
      const centreX = rect.left + rect.width / 2 - stageRect.left;
      const centreY = rect.top + rect.height / 2 - stageRect.top;

      const streak = document.createElement("span");
      streak.className = `streak ${variant}`;
      streak.style.left = `${centreX}px`;
      streak.style.bottom = `${stageRect.height - centreY}px`;
      layer.appendChild(streak);
      streaks.push(streak);

      // The shape collapses as the streak grows out of it, which is what sells
      // the "it stretched into a beam" read rather than "a beam appeared".
      tl.to(shape, { scale: 0, autoAlpha: 0, duration: 0.2, ease: "power2.in" }, 0);

      tl.fromTo(
        streak,
        { scaleY: 0, autoAlpha: 0 },
        { scaleY: 1, autoAlpha: 1, duration: STRETCH_TIME, ease: "power3.out" },
        0.04,
      );

      // Travel far enough that even the tallest streak fully clears the top.
      const distance = stageRect.height + streak.offsetHeight + 80;
      const travel = LAUNCH_BASE / speed;
      tl.to(
        streak,
        { y: -distance, duration: travel, ease: "power2.in" },
        STRETCH_TIME * 0.7,
      );

      longest = Math.max(longest, STRETCH_TIME * 0.7 + travel);
    });

    // Navigate just before the slowest streak lands. Waiting for the very last
    // frame reads as a stall; leaving early means the new page paints while the
    // tail is still clearing.
    tl.call(
      () => {
        window.location.href = href;
      },
      undefined,
      Math.max(longest - NAVIGATE_LEAD, 0.25),
    );
  }

  return true;
}

/** Bind the launch to every `a[data-transition]` inside the stage. */
export function initPageTransition(stage: HTMLElement): () => void {
  /* Bound BEFORE the early return below: a page with no transition links can
     still have been left by one — scroll-exit.ts launches from the Projects
     page with no anchor involved — so every page needs to be able to undo a
     launch it comes back to. */
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) restoreFromLaunch();
  };
  window.addEventListener("pageshow", onPageShow);
  const unbindRestore = () => window.removeEventListener("pageshow", onPageShow);

  const links = gsap.utils.toArray<HTMLAnchorElement>(
    stage.querySelectorAll("a[data-transition][href]"),
  );
  if (!links.length) return unbindRestore;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const onClick = (event: MouseEvent) => {
    const link = event.currentTarget as HTMLAnchorElement;
    // Let the browser handle modified clicks (new tab, download, etc.).
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    // Reduced motion still gets the click sound, just no launch.
    if (reduceMotion.matches) return;

    event.preventDefault();
    playClick();
    launchTransition(stage, href);
  };

  links.forEach((link) => link.addEventListener("click", onClick));

  return () => {
    unbindRestore();
    links.forEach((link) => link.removeEventListener("click", onClick));
  };
}
