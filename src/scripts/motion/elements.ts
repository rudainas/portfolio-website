import gsap from "gsap";

/**
 * Interface elements — Figma "elements" (1788:5292) in the Bees case study.
 *
 * The frame is a set of HUD parts drawn as one vector: a targeting reticle,
 * hexagons, a hatched bar, measurement rules, a panel outline. Static, it reads
 * as a screenshot of an interface. Assembling itself, it reads as the interface
 * booting — which is what the case study is about.
 *
 * Each part is revealed in the way its own geometry suggests: the reticle zooms
 * in as if focusing, the rules draw along their own length, the hexagons pop in
 * sequence, the panel settles from slightly oversized. They then keep a slow
 * ambient drift so the frame is never quite dead.
 *
 * Parts are addressed by the ids Figma exported. `inlineSvg` namespaces those
 * per file (`cs-bees-4-Union_2`), so the selectors match on the ENDING — the
 * suffix is what survives that rename.
 */

/** Figma's id, and how that part should arrive. */
type Part = {
  id: string;
  from: gsap.TweenVars;
  /** Where the transform is anchored; SVG parts need this stated explicitly. */
  origin?: string;
  at: number;
  duration?: number;
  ease?: string;
};

const REVEAL: Part[] = [
  /* The reticle. Zooms in and settles, like an optic pulling focus — it is the
     largest thing in the frame, so it leads and everything else answers it. */
  {
    id: "Union_2",
    from: { scale: 0.72, opacity: 0 },
    origin: "50% 50%",
    at: 0,
    duration: 1.25,
    ease: "power3.out",
  },
  /* The dropper and its hexagon head, arriving from above. */
  {
    id: "Union_4",
    from: { yPercent: -18, opacity: 0 },
    at: 0.35,
    duration: 0.8,
    ease: "power2.out",
  },
  /* Hatched bar — drawn along its own length, left to right. */
  {
    id: "Subtract",
    from: { scaleX: 0, opacity: 0 },
    origin: "0% 50%",
    at: 0.5,
    duration: 0.7,
    ease: "power3.out",
  },
  /* Measurement rule at the foot of the frame, drawn the same way. */
  {
    id: "Union_3",
    from: { scaleX: 0, opacity: 0 },
    origin: "0% 50%",
    at: 0.62,
    duration: 0.85,
    ease: "power3.out",
  },
  /* Panel outline, settling back from slightly oversized. */
  {
    id: "Union",
    from: { scale: 1.14, opacity: 0 },
    origin: "50% 50%",
    at: 0.55,
    duration: 0.9,
    ease: "power3.out",
  },
];

/* The stacked hexagons and chevrons, popped in sequence so the group reads as
   one gesture rather than four separate arrivals. */
const HEX_SEQUENCE = ["Polygon-6", "Polygon-7", "Polygon-8", "Polygon-9"];

/** Matches a namespaced id by its original ending. */
const part = (svg: SVGElement, id: string) =>
  svg.querySelector<SVGElement>(`[id$="-${id}"]`);

export function initElements(root: ParentNode = document): () => void {
  const frames = gsap.utils.toArray<HTMLElement>(
    root.querySelectorAll('[data-motion="elements"]'),
  );
  if (!frames.length) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const teardown: Array<() => void> = [];

  for (const frame of frames) {
    const svg = frame.querySelector("svg");
    if (!svg) continue;

    const named = [
      ...REVEAL.map((p) => part(svg, p.id)),
      ...HEX_SEQUENCE.map((id) => part(svg, id)),
    ].filter((el): el is SVGElement => el !== null);
    if (!named.length) continue;

    /* Reduced motion gets the finished frame, not a frozen half-built one. */
    if (reduceMotion.matches) {
      gsap.set(named, { opacity: 1 });
      continue;
    }

    // Hidden up front so nothing flashes at full size before its cue.
    gsap.set(named, { opacity: 0 });

    /** The assembly itself — finite, so it can be replayed from the top. */
    const buildEntrance = () => {
      const tl = gsap.timeline();

      for (const { id, from, origin, at, duration, ease } of REVEAL) {
        const el = part(svg, id);
        if (!el) continue;
        tl.fromTo(
          el,
          { ...from, transformOrigin: origin ?? "50% 50%" },
          {
            opacity: 1,
            scale: 1,
            scaleX: 1,
            yPercent: 0,
            transformOrigin: origin ?? "50% 50%",
            duration: duration ?? 0.8,
            ease: ease ?? "power2.out",
          },
          at,
        );
      }

      const hexes = HEX_SEQUENCE.map((id) => part(svg, id)).filter(Boolean);
      tl.fromTo(
        hexes as SVGElement[],
        { scale: 0.55, opacity: 0, transformOrigin: "50% 50%" },
        {
          scale: 1,
          opacity: 1,
          transformOrigin: "50% 50%",
          duration: 0.6,
          ease: "back.out(1.7)",
          stagger: 0.09,
        },
        0.72,
      );

      return tl;
    };

    /**
     * Ambient afterwards: the reticle breathes, so the frame never settles into
     * a still image. Kept OUT of the entrance timeline — it repeats forever,
     * which would make that timeline infinite and so impossible to replay from
     * the top.
     */
    const reticle = part(svg, "Union_2");
    let ambient: gsap.core.Tween | null = null;

    const startAmbient = () => {
      if (!reticle) return;
      ambient?.kill();
      ambient = gsap.to(reticle, {
        scale: 1.018,
        transformOrigin: "50% 50%",
        duration: 3.2,
        ease: "sine.inOut",
        repeat: -1,
        yoyo: true,
      });
    };

    let timeline: gsap.core.Timeline | null = null;

    const play = () => {
      // The breath owns the reticle's scale; leaving it running would fight
      // the entrance tween for the same property.
      ambient?.kill();
      ambient = null;
      timeline?.kill();
      timeline = buildEntrance();
      timeline.eventCallback("onComplete", startAmbient);
    };

    /* Replayed on hover. Ignored while the assembly is still running — a
       re-entry mid-flight would snap everything back to nothing, which reads
       as a glitch rather than as a response. */
    const onEnter = () => {
      if (timeline && timeline.isActive()) return;
      play();
    };
    frame.addEventListener("pointerenter", onEnter);
    teardown.push(() => frame.removeEventListener("pointerenter", onEnter));

    /* Held until the frame is actually on screen. The case study is a long
       column, and a sequence that has already run by the time the reader
       arrives is the same as no sequence at all. */
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || timeline) continue;
          play();
          observer.disconnect();
        }
      },
      // The panel's own scroller is the viewport here, not the window.
      { root: frame.closest("[data-popup-scroll]"), threshold: 0.25 },
    );

    observer.observe(frame);
    teardown.push(() => {
      observer.disconnect();
      timeline?.kill();
      ambient?.kill();
    });
  }

  return () => teardown.forEach((fn) => fn());
}
