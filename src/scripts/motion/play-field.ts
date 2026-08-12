import gsap from "gsap";
import { playTrail } from "../audio/sfx";

/**
 * Play field motion — Figma Play (1525:3680).
 *
 * Three things at once:
 *
 * 1. An endless plane. The field is a 3x3 block of identical tiles; moving it
 *    by one tile's width lands on a copy indistinguishable from the original,
 *    so the offset is simply wrapped modulo the tile size. Nothing is created
 *    or destroyed, and there is no seam to hit.
 *
 * 2. Depth. Pieces LAG behind the plane by their own depth as it moves, then
 *    ease back. Deliberately a transient offset rather than a change of
 *    position — an actual per-piece parallax would break the tiling, because
 *    two copies of the same piece would need to be in different places at
 *    once. The lag reads as depth and costs the loop nothing.
 *
 * 3. Idle drift, so nothing is ever perfectly still.
 */

/**
 * Tile size as a multiple of the viewport.
 *
 * MUST match --tile-scale on the field element. The plane repeats every tile,
 * so if the wrap distance and the drawn tile disagree the seam is visible as a
 * jump.
 */
const TILE_SCALE = 1.55;

/** How far the pointer must travel before a press counts as a drag, not a click. */
const DRAG_THRESHOLD_PX = 4;

/** Lag applied per unit of depth, as a fraction of the movement. */
const PARALLAX = 0.16;

/**
 * Hard cap on how far a piece may be displaced from its slot, in pixels.
 *
 * The layout is packed so no two pieces touch, with 32px to spare at the
 * tightest point. Drift and parallax both move pieces off their slots, and two
 * neighbours moving toward each other close that gap twice as fast — so the
 * budget is: 2 x LAG_LIMIT + 2 x max drift must stay under the clearance.
 * Without the cap a fast drag could pile up enough lag to overlap.
 */
const LAG_LIMIT = 8;

/** How quickly a lagging piece catches up once the plane stops. */
const CATCH_UP = 0.9;

export function initPlayField(root: ParentNode = document): () => void {
  const field = root.querySelector<HTMLElement>("[data-play-field]");
  const plane = field?.querySelector<HTMLElement>("[data-play-plane]");
  if (!field || !plane) return () => {};

  const pieces = gsap.utils.toArray<HTMLElement>(field.querySelectorAll("[data-piece]"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /** Position of the plane, in pixels. Wrapped, so it never grows unbounded. */
  let x = 0;
  let y = 0;

  /** One tile — the distance after which the plane repeats exactly. */
  const tile = () => ({
    w: field.clientWidth * TILE_SCALE,
    h: field.clientHeight * TILE_SCALE,
  });

  const setter = { x: gsap.quickSetter(plane, "x", "px"), y: gsap.quickSetter(plane, "y", "px") };

  /** Per-piece lag, eased back toward zero every frame. */
  const lag = pieces.map(() => ({ x: 0, y: 0 }));
  const pieceSetter = pieces.map((piece) => gsap.quickSetter(piece, "translate", "px"));
  const depths = pieces.map((piece) => Number(piece.dataset.depth ?? 1));

  const applyPlane = () => {
    const { w, h } = tile();
    if (w > 0) x = gsap.utils.wrap(-w, 0, x);
    if (h > 0) y = gsap.utils.wrap(-h, 0, y);
    setter.x(x);
    setter.y(y);
  };

  const move = (dx: number, dy: number) => {
    x += dx;
    y += dy;
    applyPlane();

    if (reduceMotion.matches) return;
    for (let i = 0; i < lag.length; i += 1) {
      // Heavier pieces (higher depth) lag less, so they read as nearer.
      const weight = PARALLAX * (2 - depths[i]);
      lag[i].x = gsap.utils.clamp(-LAG_LIMIT, LAG_LIMIT, lag[i].x - dx * weight);
      lag[i].y = gsap.utils.clamp(-LAG_LIMIT, LAG_LIMIT, lag[i].y - dy * weight);
    }
  };

  /* ---------- Drag ---------- */

  /** Pressed, but not yet moved far enough to count as a drag. */
  let pending = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;

  const onPointerDown = (event: PointerEvent) => {
    // Left button only, and never while the reader is drawing.
    if (event.button !== 0 || document.documentElement.dataset.drawing !== undefined) return;
    pending = true;
    dragging = false;
    moved = 0;
    lastX = event.clientX;
    lastY = event.clientY;
    /* NOT captured here. Capturing on press routes every later pointer event to
       the field, and the browser then never delivers a click to whatever was
       actually pressed — which killed the links on the captions. The capture is
       taken only once the gesture proves itself a drag, below. */
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!pending && !dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    moved += Math.abs(dx) + Math.abs(dy);

    if (!dragging) {
      // Still might be a click; wait for real travel before claiming the pointer.
      if (moved < DRAG_THRESHOLD_PX) return;
      dragging = true;
      pending = false;
      field.setPointerCapture(event.pointerId);
      field.dataset.dragging = "";
    }

    move(dx, dy);
    // Same sparkle as the cursor trail, keyed to how fast the plane is moving.
    playTrail(Math.min(Math.hypot(dx, dy) / 26, 1));
  };

  const endDrag = (event: PointerEvent) => {
    pending = false;
    if (!dragging) return;
    dragging = false;
    delete field.dataset.dragging;
    if (field.hasPointerCapture(event.pointerId)) field.releasePointerCapture(event.pointerId);
  };

  /* A drag that travelled should not also count as a click on the piece under
     it — otherwise letting go over an image triggers whatever it does. */
  const onClickCapture = (event: MouseEvent) => {
    if (moved < DRAG_THRESHOLD_PX) return;
    event.stopPropagation();
    event.preventDefault();
    moved = 0;
  };

  /* ---------- Wheel ---------- */

  const onWheel = (event: WheelEvent) => {
    if (document.documentElement.dataset.drawing !== undefined) return;
    event.preventDefault();
    // Both axes: a trackpad can pan sideways, a mouse only scrolls down.
    move(-event.deltaX, -event.deltaY);
    playTrail(Math.min(Math.hypot(event.deltaX, event.deltaY) / 90, 1));
  };

  /* ---------- Frame loop ---------- */

  const drift = pieces.map((piece, index) => {
    const seed = Number(piece.dataset.drift ?? index);
    return {
      /* Prime-ish multipliers so the periods do not line up and the field
         never falls into a visible collective rhythm. */
      /* Small on purpose — see LAG_LIMIT. Two neighbours drifting toward each
         other must not close the gap the packing leaves between them. */
      ax: 2.5 + (seed % 3) * 1.2,
      ay: 3 + (seed % 4) * 1,
      sx: 0.00021 + (seed % 5) * 0.00004,
      sy: 0.00017 + (seed % 7) * 0.00003,
      phase: seed * 1.7,
    };
  });

  const tick = () => {
    const now = performance.now();
    for (let i = 0; i < pieces.length; i += 1) {
      lag[i].x = gsap.utils.interpolate(lag[i].x, 0, CATCH_UP * 0.14);
      lag[i].y = gsap.utils.interpolate(lag[i].y, 0, CATCH_UP * 0.14);

      const d = drift[i];
      const fx = reduceMotion.matches ? 0 : Math.sin(now * d.sx + d.phase) * d.ax;
      const fy = reduceMotion.matches ? 0 : Math.cos(now * d.sy + d.phase) * d.ay;

      /* `translate` rather than `x`/`y`: GSAP's x/y write into the same
         transform this element's own CSS would use, and quickSetter on
         "translate" keeps the two independent. */
      pieceSetter[i](`${lag[i].x + fx}px ${lag[i].y + fy}px`);
    }
  };

  /* Autoplay is unreliable for a clip this small inside a lazily-painted
     field, so playback is started explicitly. `muted` is what makes it legal
     at all; the catch swallows a browser that still declines. */
  for (const video of field.querySelectorAll<HTMLVideoElement>("video")) {
    video.loop = true;
    void video.play().catch(() => {});
  }

  gsap.ticker.add(tick);
  applyPlane();

  field.addEventListener("pointerdown", onPointerDown);
  field.addEventListener("pointermove", onPointerMove);
  field.addEventListener("pointerup", endDrag);
  field.addEventListener("pointercancel", endDrag);
  field.addEventListener("click", onClickCapture, { capture: true });
  field.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("resize", applyPlane, { passive: true });

  return () => {
    gsap.ticker.remove(tick);
    field.removeEventListener("pointerdown", onPointerDown);
    field.removeEventListener("pointermove", onPointerMove);
    field.removeEventListener("pointerup", endDrag);
    field.removeEventListener("pointercancel", endDrag);
    field.removeEventListener("click", onClickCapture, { capture: true });
    field.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", applyPlane);
  };
}
