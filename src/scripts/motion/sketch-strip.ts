import gsap from "gsap";

/**
 * Drag-to-scroll for the sketch strip (Figma Frame 200, 1775:1621).
 *
 * The rail scrolls natively — trackpads, shift+wheel and touch all work
 * without any of this. What it adds is click-and-drag for mouse users, who
 * otherwise have no way to move a horizontal rail whose scrollbar is hidden,
 * plus the grab cursor that says it can be moved at all.
 *
 * Vertical wheel is translated to horizontal only while the pointer is over
 * the rail AND the rail still has somewhere to go; at either end the event is
 * left alone so the case study keeps scrolling behind it. Swallowing it
 * unconditionally is what makes carousels feel like they trap the page.
 */

export function initSketchStrip(root: ParentNode = document): () => void {
  const rails = gsap.utils.toArray<HTMLElement>(root.querySelectorAll("[data-sketch-rail]"));
  if (!rails.length) return () => {};

  const teardown: Array<() => void> = [];

  for (const rail of rails) {
    let dragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    const maxScroll = () => rail.scrollWidth - rail.clientWidth;

    /**
     * Stamped whenever the rail actually consumes input.
     *
     * The case-study handover reads this and stands down while it is fresh:
     * the rail sits at the bottom of the column, exactly where that gesture
     * lives, so without it a drag along the strip could roll straight on into
     * hauling the next study up. Only set when the rail MOVED — a plain
     * vertical scroll passing over it belongs to the page, and blocking the
     * handover for it would make that gesture feel broken.
     */
    const markScrolled = () => {
      document.documentElement.dataset.railScrollAt = String(performance.now());
    };

    const onPointerDown = (event: PointerEvent) => {
      // Touch already drags natively; hijacking it would fight the browser.
      if (event.pointerType === "touch" || event.button !== 0) return;
      dragging = true;
      moved = false;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
      rail.setPointerCapture(event.pointerId);
      rail.dataset.dragging = "";
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      if (Math.abs(dx) > 3) moved = true;
      rail.scrollLeft = startScroll - dx;
      markScrolled();
    };

    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      delete rail.dataset.dragging;
      if (rail.hasPointerCapture(event.pointerId)) {
        rail.releasePointerCapture(event.pointerId);
      }
    };

    // A drag that moved should not also count as a click on whatever is under it.
    const onClickCapture = (event: MouseEvent) => {
      if (!moved) return;
      event.stopPropagation();
      event.preventDefault();
      moved = false;
    };

    const onWheel = (event: WheelEvent) => {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);

      /* A plain vertical wheel is left alone — it belongs to the page.
         Translating it to sideways movement turned the rail into a trap: the
         reader scrolling down the case study would cross the strip, the page
         would stop dead, and they had to scroll through every slide before it
         moved again. The rail is reached deliberately instead — a sideways
         trackpad gesture, shift+wheel, or dragging it. */
      if (!horizontal && !event.shiftKey) return;

      const delta = horizontal ? event.deltaX : event.deltaY;
      const atStart = rail.scrollLeft <= 0;
      const atEnd = rail.scrollLeft >= maxScroll() - 1;
      // Hand the page back its scroll at either end.
      if ((delta < 0 && atStart) || (delta > 0 && atEnd)) return;

      event.preventDefault();
      rail.scrollLeft += delta;
      markScrolled();
    };

    rail.addEventListener("pointerdown", onPointerDown);
    rail.addEventListener("pointermove", onPointerMove);
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    rail.addEventListener("click", onClickCapture, { capture: true });
    rail.addEventListener("wheel", onWheel, { passive: false });

    teardown.push(() => {
      rail.removeEventListener("pointerdown", onPointerDown);
      rail.removeEventListener("pointermove", onPointerMove);
      rail.removeEventListener("pointerup", endDrag);
      rail.removeEventListener("pointercancel", endDrag);
      rail.removeEventListener("click", onClickCapture, { capture: true });
      rail.removeEventListener("wheel", onWheel);
    });
  }

  return () => teardown.forEach((fn) => fn());
}
