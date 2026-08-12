import gsap from "gsap";

/**
 * Cursor-following hover label — Figma label-hover (1751:778) shown beside
 * cursor-defult (1521:3350).
 *
 * Delegated from the document, so any element with `data-hover-label` works
 * with no per-page wiring and elements added later are picked up for free.
 *
 * The pill trails the pointer on an eased follow rather than sticking rigidly
 * to it — a label welded to the crosshair reads as part of the cursor, while a
 * slight lag reads as something being carried.
 */

/**
 * Offset from the pointer, in px. Down-right, and only just clear of the
 * cursor: the plus is 32px wide, so its arms reach ~16px from the hotspot, and
 * sitting diagonally at this distance tucks the pill against the corner
 * between them without covering either arm.
 */
const OFFSET_X = 14;
const OFFSET_Y = 12;

/** Follow easing. Long enough to lag visibly, short enough to feel attached. */
const FOLLOW = 0.22;

/** Keep the pill this far inside the viewport edges. */
const EDGE_PAD = 8;

export function initHoverLabel(): () => void {
  const pill = document.querySelector<HTMLElement>("[data-hover-label-pill]");
  if (!pill) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const xTo = gsap.quickTo(pill, "x", { duration: FOLLOW, ease: "power3" });
  const yTo = gsap.quickTo(pill, "y", { duration: FOLLOW, ease: "power3" });

  let active: Element | null = null;

  const place = (clientX: number, clientY: number, instant: boolean) => {
    const rect = pill.getBoundingClientRect();
    // Flip to the other side of the cursor near a viewport edge rather than
    // letting the pill run off it.
    const overflowsRight = clientX + OFFSET_X + rect.width > window.innerWidth - EDGE_PAD;
    const overflowsBottom = clientY + OFFSET_Y + rect.height > window.innerHeight - EDGE_PAD;

    const x = overflowsRight ? clientX - OFFSET_X - rect.width : clientX + OFFSET_X;
    const y = overflowsBottom ? clientY - OFFSET_Y - rect.height : clientY + OFFSET_Y;

    if (instant) {
      gsap.set(pill, { x, y });
    } else {
      xTo(x);
      yTo(y);
    }
  };

  const show = (target: Element, text: string, clientX: number, clientY: number) => {
    active = target;
    pill.textContent = text;
    // Positioned before revealing, so it never flashes at the previous spot.
    place(clientX, clientY, true);
    gsap.killTweensOf(pill, "opacity,scale");
    gsap.fromTo(
      pill,
      { opacity: 0, scale: reduceMotion.matches ? 1 : 0.8 },
      {
        opacity: 1,
        scale: 1,
        duration: reduceMotion.matches ? 0 : 0.22,
        ease: "back.out(2)",
        transformOrigin: "0% 0%",
      },
    );
  };

  const hide = () => {
    active = null;
    gsap.killTweensOf(pill, "opacity,scale");
    gsap.to(pill, {
      opacity: 0,
      scale: reduceMotion.matches ? 1 : 0.85,
      duration: reduceMotion.matches ? 0 : 0.14,
      ease: "power2.in",
    });
  };

  const onPointerMove = (event: PointerEvent) => {
    const target = (event.target as Element | null)?.closest?.("[data-hover-label]") ?? null;

    if (!target) {
      if (active) hide();
      return;
    }

    const text = (target as HTMLElement).dataset.hoverLabel ?? "";
    if (!text) {
      if (active) hide();
      return;
    }

    if (target !== active) {
      show(target, text, event.clientX, event.clientY);
      return;
    }

    place(event.clientX, event.clientY, false);
  };

  // The pointer can leave the window without a final move over empty space.
  const onPointerLeave = () => {
    if (active) hide();
  };

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerleave", onPointerLeave, { passive: true });
  // A card scrolling out from under a stationary pointer must not strand the
  // label; the next move corrects it, but blur covers tab-away.
  window.addEventListener("blur", onPointerLeave);

  return () => {
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerleave", onPointerLeave);
    window.removeEventListener("blur", onPointerLeave);
    gsap.killTweensOf(pill);
  };
}
