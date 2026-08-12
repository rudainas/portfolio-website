import { playClick } from "../audio/sfx";
import { tap } from "../haptics";

/**
 * Drawing on the Play page — Figma Frame 125 (1527:4022).
 *
 * Clicking an ink on the printer arms a pen; clicking the same ink again puts
 * it down. While armed, the reader draws across the background and the field
 * stops responding to drag, so one gesture never means two things.
 *
 * Strokes live on a canvas fixed to the viewport, NOT pinned to the field.
 * Drawing on an endless plane would mean the marks wander off and can never be
 * found again — here they stay where they were made, like writing on the glass
 * rather than on what is behind it.
 */

/** Figma's stroke on the printer's whiteboard, scaled to the drawing surface. */
const STROKE_WIDTH = 7;

export function initDraw(root: ParentNode = document): () => void {
  const canvas = root.querySelector<HTMLCanvasElement>("[data-draw-canvas]");
  const widget = root.querySelector<HTMLElement>("[data-draw-widget]");
  /* Strokes are PAINTED on the canvas, which sits beneath the work, but they
     are CAUGHT on a transparent sheet above it — otherwise a piece would
     swallow the pointer and you could not draw across your own posters. */
  const capture = root.querySelector<HTMLElement>("[data-draw-capture]") ?? canvas;
  if (!canvas || !widget) return () => {};

  const context = canvas.getContext("2d");
  if (!context) return () => {};

  const inks = [...widget.querySelectorAll<HTMLElement>("[data-draw-ink]")];
  const scribble = widget.querySelector<HTMLElement>("[data-draw-scribble]");
  const reset = widget.querySelector<HTMLElement>("[data-draw-reset]");

  /** Key of the armed ink, or null when the pen is down. */
  let active: string | null = null;
  let drawing = false;

  /* ---------- Surface ---------- */

  /**
   * Canvas is sized in device pixels and scaled back down, so strokes are
   * crisp on a retina screen. Resizing clears it — the browser discards the
   * bitmap on any size change, so the marks are re-drawn from the record kept
   * below rather than lost.
   */
  type Stroke = { colour: string; points: { x: number; y: number }[] };
  const strokes: Stroke[] = [];

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    repaint();
  };

  const repaint = () => {
    const { width, height } = canvas.getBoundingClientRect();
    context.clearRect(0, 0, width, height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = STROKE_WIDTH;
    for (const stroke of strokes) {
      if (stroke.points.length < 2) continue;
      context.strokeStyle = stroke.colour;
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        context.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      context.stroke();
    }
  };

  /* ---------- Arming ---------- */

  const colourOf = (key: string) =>
    inks.find((ink) => ink.dataset.drawInk === key)?.dataset.colour ?? "#000";

  const setActive = (key: string | null) => {
    active = key;

    for (const ink of inks) {
      ink.setAttribute("aria-pressed", String(ink.dataset.drawInk === key));
    }

    /* Read by the field so it stands down while the pen is armed, and by the
       stylesheet so the whole page takes the drawing cursor. */
    if (key) {
      document.documentElement.dataset.drawing = "";
      scribble?.style.setProperty("--stroke", colourOf(key));
    } else {
      delete document.documentElement.dataset.drawing;
      scribble?.style.removeProperty("--stroke");
    }

    playClick();
    tap(10);
  };

  const onInkClick = (event: Event) => {
    const key = (event.currentTarget as HTMLElement).dataset.drawInk ?? null;
    // Same ink twice puts the pen down.
    setActive(key === active ? null : key);
  };

  /**
   * Wipes the drawings and leaves the pen exactly as it was.
   *
   * Clearing is not the same as stopping: someone who has just filled the
   * screen and wants a clean sheet still wants their pen. Disarming here would
   * make them re-pick their ink after every wipe.
   */
  const onReset = () => {
    if (strokes.length === 0) return;
    strokes.length = 0;
    repaint();
    playClick();
    tap(12);
  };

  /* ---------- Drawing ---------- */

  let current: Stroke | null = null;

  /* Measured against the CANVAS, not the sheet the event arrived on — the two
     are the same size and position, but the canvas is what the coordinates
     have to mean. */
  const pointAt = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!active || event.button !== 0) return;
    drawing = true;
    current = { colour: colourOf(active), points: [pointAt(event)] };
    strokes.push(current);
    capture.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!drawing || !current) return;
    current.points.push(pointAt(event));

    /* Only the new segment is drawn, rather than repainting everything — a
       full repaint per pointermove gets slower with every stroke, and the lag
       shows up as the line falling behind the cursor. */
    context.strokeStyle = current.colour;
    context.lineWidth = STROKE_WIDTH;
    context.lineCap = "round";
    context.lineJoin = "round";
    const points = current.points;
    if (points.length >= 2) {
      const a = points[points.length - 2];
      const b = points[points.length - 1];
      context.beginPath();
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    event.preventDefault();
  };

  const endStroke = (event: PointerEvent) => {
    if (!drawing) return;
    drawing = false;
    current = null;
    if (capture.hasPointerCapture(event.pointerId)) capture.releasePointerCapture(event.pointerId);
  };

  /** Escape puts the pen down — the same way it closes everything else here. */
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && active) setActive(null);
  };

  /* ---------- Wiring ---------- */

  inks.forEach((ink) => ink.addEventListener("click", onInkClick));
  reset?.addEventListener("click", onReset);
  capture.addEventListener("pointerdown", onPointerDown);
  capture.addEventListener("pointermove", onPointerMove);
  capture.addEventListener("pointerup", endStroke);
  capture.addEventListener("pointercancel", endStroke);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", resize, { passive: true });

  resize();

  return () => {
    inks.forEach((ink) => ink.removeEventListener("click", onInkClick));
    reset?.removeEventListener("click", onReset);
    capture.removeEventListener("pointerdown", onPointerDown);
    capture.removeEventListener("pointermove", onPointerMove);
    capture.removeEventListener("pointerup", endStroke);
    capture.removeEventListener("pointercancel", endStroke);
    document.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", resize);
    delete document.documentElement.dataset.drawing;
  };
}
