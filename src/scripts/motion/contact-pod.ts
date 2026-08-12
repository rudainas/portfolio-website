import gsap from "gsap";
import { bindCarousel, type CarouselConfig } from "./carousel";
import { DUR, EASE } from "./tokens";
import { playClick } from "../audio/sfx";

/**
 * Contact pod — Figma Frame 92 (1536:4620).
 *
 * Opens from the Contact pill in the nav, wherever the reader is on the page.
 * The lid runs the same carousel as the printer on the Play page, at the pod's
 * own size.
 */

/**
 * The pod's measurements of the shared carousel. Same artwork as the printer's,
 * scaled 1.6478x — so the numbers differ and the behaviour does not.
 */
const POD_CAROUSEL: CarouselConfig = {
  /** Measured off the file's own ellipse centres: 113 units apart. */
  period: 113,
  /** The window the strip shows through, in artwork units. */
  stripWidth: 603,
  travelSeconds: 5.6,

  /**
   * One period, starting from rest, travelling RIGHT.
   *
   * The pod's artwork spans 7 to 667 and is NOT rotated, unlike the printer's,
   * so it sits square on its own window and no offset is needed to keep that
   * window covered.
   *
   * The direction is the sign, and it changes which stretch of artwork has to
   * exist. Running right, the window sweeps local -113 to 603 — off the LEFT
   * end of the artwork, where the copy at -5 periods covers -558 to 102 and
   * takes over. (Running left it swept 0 to 716 and leaned on the +5 copy
   * instead.) Both are covered continuously by the same three copies, so
   * flipping this is safe; a fourth direction change is not automatically.
   */
  fromPeriod: 0,
  toPeriod: 1,

  /**
   * A star is 21.15 units in a 35.3-unit window, leaving 7.08 of padding above
   * and 6.48 below. Six keeps every shape inside its own box at full hop, so
   * the lid can clip plainly without ever cutting the bounce.
   */
  hop: 6,

  /* Slower than the printer's in proportion to the bigger shapes, so the pod
     reads as calm rather than busy at nearly twice the size. */
  halfCycleMin: 0.36,
  halfCycleMax: 0.68,
};

/** Focusable children, for keeping Tab inside the dialog while it is open. */
const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea';

export function initContactPod(root: ParentNode = document): () => void {
  const pod = root.querySelector<HTMLElement>("[data-contact-pod]");
  const panel = pod?.querySelector<HTMLElement>("[data-contact-panel]");
  if (!pod || !panel) return () => {};

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let open = false;
  let carousel: gsap.core.Tween[] | null = null;
  let restoreFocusTo: HTMLElement | null = null;

  /**
   * Bound on FIRST OPEN, not at init.
   *
   * The pod starts `hidden`, and `getBBox()` returns zeros for anything in a
   * `display: none` subtree — every motif would land in slot 0 and the whole
   * strip would bounce as one block. It also means a reader who never opens the
   * pod never pays for the animation.
   */
  const ensureCarousel = () => {
    if (carousel || reduceMotion.matches) return;
    const strip = pod.querySelector<HTMLElement>("[data-pod-carousel]");
    if (strip) carousel = bindCarousel(strip, POD_CAROUSEL);
  };

  const show = () => {
    if (open) return;
    open = true;

    restoreFocusTo = document.activeElement as HTMLElement | null;
    pod.hidden = false;
    ensureCarousel();

    /* Holds the page still underneath. On Projects the scroll position drives
       the project queue, so without this the queue turns over behind the pod
       while the reader scrolls the dialog. `overflow` on the root leaves
       scrollY untouched, so nothing jumps when it is released.

       The padding replaces the scrollbar's width. Hiding the overflow takes
       the scrollbar away, and the page then widens by that much — which slides
       the nav sideways under a stationary cursor, with no pointer event to say
       so. That is exactly how a pill gets stuck looking hovered. */
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.overflow = "hidden";
    if (scrollbar > 0) document.documentElement.style.paddingRight = `${scrollbar}px`;

    /* Lets the nav show Contact as lit while its dialog is open, and drop any
       hover the scrim is now covering. Broadcast rather than called directly:
       the pod is rendered at body level and knows nothing of the nav, which
       lives in a different component on every page. */
    document.dispatchEvent(new CustomEvent("contact:open"));

    if (!reduceMotion.matches) {
      gsap.fromTo(
        panel,
        { scale: 0.9, y: 18, autoAlpha: 0 },
        { scale: 1, y: 0, autoAlpha: 1, duration: DUR.base, ease: EASE.pop, overwrite: true },
      );
      gsap.fromTo(
        pod.querySelector("[data-contact-dismiss]"),
        { autoAlpha: 0 },
        { autoAlpha: 1, duration: DUR.fast, ease: "none", overwrite: true },
      );
    }

    /* Focus moves into the dialog so the keyboard follows the eye, and so Esc
       and Tab are handled here rather than by the page behind. */
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  };

  const hide = () => {
    if (!open) return;
    open = false;
    document.documentElement.style.overflow = "";
    document.documentElement.style.paddingRight = "";
    document.dispatchEvent(new CustomEvent("contact:close"));

    const finish = () => {
      pod.hidden = true;
      // Back to whatever opened it, so a keyboard reader is not dropped at the
      // top of the document.
      restoreFocusTo?.focus?.();
      restoreFocusTo = null;
    };

    if (reduceMotion.matches) {
      finish();
      return;
    }

    gsap.to(panel, {
      scale: 0.94,
      y: 10,
      autoAlpha: 0,
      duration: DUR.fast,
      ease: "power2.in",
      overwrite: true,
      onComplete: finish,
    });
  };

  /* Delegated from the document rather than bound to the nav, because the pill
     that opens this lives in a component the pod knows nothing about — and on
     every page. Any `#contact` link works, which also keeps the markup's
     no-JS meaning honest. */
  const onDocumentClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    const opener = target?.closest?.('[data-contact-open], a[href="#contact"]');
    if (!opener) return;
    // Leave modified clicks to the browser.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    event.preventDefault();
    playClick();
    show();
  };

  const onPodClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (!target?.closest?.("[data-contact-dismiss]")) return;
    event.preventDefault();
    hide();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;

    if (event.key === "Escape") {
      event.preventDefault();
      hide();
      return;
    }

    if (event.key !== "Tab") return;

    /* Keep Tab inside the dialog. Without this the focus ring walks off into
       the page behind, which is still there and still full of links. */
    const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (element) => element.offsetParent !== null,
    );
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener("click", onDocumentClick);
  pod.addEventListener("click", onPodClick);
  document.addEventListener("keydown", onKeyDown);

  /* Arriving on a #contact link from elsewhere opens the pod directly. */
  if (window.location.hash === "#contact") show();

  return () => {
    document.removeEventListener("click", onDocumentClick);
    pod.removeEventListener("click", onPodClick);
    document.removeEventListener("keydown", onKeyDown);
    carousel?.forEach((tween) => tween.kill());
    document.documentElement.style.overflow = "";
    document.documentElement.style.paddingRight = "";
  };
}
