import gsap from "gsap";
import { tap } from "../haptics";
import { playHover } from "../audio/sfx";

/**
 * Drag-to-reorder for the colour palette cards.
 *
 * The cards are reordered in the DOM rather than with CSS `order`, because
 * both things that make the palette read correctly are DOM-based:
 *   - the -172px overlap comes from `:not(:last-child)`, and
 *   - which card sits on top comes from paint order.
 * Using `order` would move the cards visually while leaving the overlap and
 * stacking attached to the original sequence.
 *
 * While dragging, the card's offset is recomputed from its CURRENT layout
 * position every frame. That is what lets the DOM reorder mid-drag without the
 * card jumping — the moment it swaps slots its layout position changes, and
 * the offset absorbs the difference so it stays under the pointer.
 *
 * Keyboard: focus a card and use the arrow keys. Drag alone would make the
 * ordering unreachable for anyone not using a pointer.
 */

/** Lift on hover, signalling the card can be picked up. */
const HOVER_LIFT = -10;
const HOVER_SCALE = 1.02;

/** Stronger lift while actually held. */
const DRAG_SCALE = 1.05;
const DRAG_LIFT = -16;

export function initPaletteDrag(root: ParentNode = document): () => void {
  const palettes = gsap.utils.toArray<HTMLElement>(root.querySelectorAll("[data-palette]"));
  if (!palettes.length) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const teardown: Array<() => void> = [];

  for (const palette of palettes) {
    const cards = () =>
      gsap.utils.toArray<HTMLElement>(palette.querySelectorAll("[data-palette-card]"));

    /** Layout x of a card, ignoring any drag offset currently applied. */
    const layoutLeft = (el: HTMLElement) =>
      el.getBoundingClientRect().left - (Number(gsap.getProperty(el, "x")) || 0);

    const settle = (el: HTMLElement, hovering: boolean) => {
      if (reduceMotion.matches) {
        gsap.set(el, { x: 0, y: 0, scale: 1, rotation: 0 });
        return;
      }
      gsap.to(el, {
        x: 0,
        y: hovering ? HOVER_LIFT : 0,
        scale: hovering ? HOVER_SCALE : 1,
        rotation: 0,
        duration: 0.4,
        ease: "back.out(1.6)",
      });
    };

    for (const card of cards()) {
      let dragging = false;
      let grabOffset = 0;
      let moved = false;

      const onEnter = () => {
        if (dragging || reduceMotion.matches) return;
        gsap.to(card, {
          y: HOVER_LIFT,
          scale: HOVER_SCALE,
          duration: 0.28,
          ease: "back.out(2)",
        });
      };

      const onLeave = () => {
        if (dragging) return;
        settle(card, false);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        dragging = true;
        moved = false;
        card.setPointerCapture(event.pointerId);
        card.dataset.dragging = "";
        // Distance from the pointer to the card's left edge, so the card is
        // held where it was actually grabbed rather than snapping centre-first.
        grabOffset = event.clientX - card.getBoundingClientRect().left;

        if (!reduceMotion.matches) {
          gsap.to(card, {
            scale: DRAG_SCALE,
            y: DRAG_LIFT,
            duration: 0.18,
            ease: "power2.out",
          });
        }
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        moved = true;

        const desiredLeft = event.clientX - grabOffset;
        gsap.set(card, { x: desiredLeft - layoutLeft(card) });

        // Swap when the held card's centre crosses a neighbour's centre.
        const held = card.getBoundingClientRect();
        const heldCentre = held.left + held.width / 2;

        for (const other of cards()) {
          if (other === card) continue;
          const rect = other.getBoundingClientRect();
          const centre = rect.left + rect.width / 2;
          const before = card.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING;

          // Moving right past a card that follows it, or left past one before.
          if (before && heldCentre > centre) {
            other.after(card);
          } else if (!before && heldCentre < centre) {
            other.before(card);
          } else {
            continue;
          }

          // The reorder changed the card's layout position; re-anchor so it
          // stays exactly under the pointer instead of snapping.
          gsap.set(card, { x: desiredLeft - layoutLeft(card) });
          tap(8);
          playHover();
          break;
        }
      };

      const endDrag = (event: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        delete card.dataset.dragging;
        if (card.hasPointerCapture(event.pointerId)) {
          card.releasePointerCapture(event.pointerId);
        }
        // Still hovering if the pointer is over the card when released.
        settle(card, card.matches(":hover"));
        if (moved) tap(12);
      };

      // Arrow keys give the same reordering without a pointer.
      const onKeyDown = (event: KeyboardEvent) => {
        const list = cards();
        const index = list.indexOf(card);
        if (event.key === "ArrowRight" && index < list.length - 1) {
          list[index + 1].after(card);
        } else if (event.key === "ArrowLeft" && index > 0) {
          list[index - 1].before(card);
        } else {
          return;
        }
        event.preventDefault();
        card.focus({ preventScroll: true });
        tap(8);
        playHover();
      };

      card.addEventListener("pointerenter", onEnter);
      card.addEventListener("pointerleave", onLeave);
      card.addEventListener("pointerdown", onPointerDown);
      card.addEventListener("pointermove", onPointerMove);
      card.addEventListener("pointerup", endDrag);
      card.addEventListener("pointercancel", endDrag);
      card.addEventListener("keydown", onKeyDown);

      teardown.push(() => {
        card.removeEventListener("pointerenter", onEnter);
        card.removeEventListener("pointerleave", onLeave);
        card.removeEventListener("pointerdown", onPointerDown);
        card.removeEventListener("pointermove", onPointerMove);
        card.removeEventListener("pointerup", endDrag);
        card.removeEventListener("pointercancel", endDrag);
        card.removeEventListener("keydown", onKeyDown);
        gsap.killTweensOf(card);
      });
    }
  }

  return () => teardown.forEach((fn) => fn());
}
