import { launchTransition } from "./page-transition";
import { playClick } from "../audio/sfx";

/**
 * Leave a page by scrolling up past its top.
 *
 * Once the reader has rewound to the very top and keeps pulling upward, the
 * page launches its streak transition and navigates — on Projects, back to the
 * hero.
 *
 * This needs `wheel` and touch listeners rather than `scroll`: the browser
 * clamps scrolling at 0, so no scroll event fires for the gesture that matters
 * here. The intent has to be read from the input itself.
 *
 * A threshold rather than a hair trigger, because arriving at the top with
 * trackpad momentum still in flight would otherwise fling the reader off the
 * page. They have to keep pulling deliberately.
 */

/** Accumulated upward pull required to leave, in px. */
const OVERSCROLL_PX = 160;

/** Treat anything within this of the top as "at the top". */
const TOP_EPSILON = 2;

/** Accumulated pull decays if the reader pauses this long. */
const DECAY_MS = 320;

/**
 * Ignore upward input for this long after arriving at the top, so trackpad
 * momentum from the rewind cannot carry straight through into an exit.
 */
const SETTLE_MS = 260;

export function initScrollExit(stage: HTMLElement, href: string): () => void {
  let pulled = 0;
  let lastPullAt = 0;
  let atTopSince = 0;
  let armed = false;
  let touchY: number | null = null;

  const atTop = () => window.scrollY <= TOP_EPSILON;

  /**
   * A modal owns the scroll gesture while it is open. The page behind is
   * locked, so it sits at a fixed offset and every wheel event still reaches
   * `window` — without this check, scrolling up inside the case-study popup
   * would read as "leave the page" and navigate to the hero.
   */
  const modalOpen = () => document.documentElement.dataset.modalOpen !== undefined;

  const resetIfStale = (now: number) => {
    if (now - lastPullAt > DECAY_MS) pulled = 0;
  };

  const trackTop = () => {
    if (atTop()) {
      if (atTopSince === 0) atTopSince = performance.now();
    } else {
      atTopSince = 0;
      pulled = 0;
    }
  };

  const pull = (amount: number) => {
    if (modalOpen()) {
      // Discard anything banked, so closing the modal does not leave a
      // part-filled threshold that exits on the next small scroll.
      pulled = 0;
      atTopSince = 0;
      return;
    }
    if (armed || amount <= 0 || !atTop()) return;

    // Wait out the momentum from whatever brought them to the top.
    const now = performance.now();
    if (atTopSince === 0) atTopSince = now;
    if (now - atTopSince < SETTLE_MS) return;

    resetIfStale(now);
    lastPullAt = now;
    pulled += amount;

    if (pulled < OVERSCROLL_PX) return;

    armed = true;
    playClick();
    if (!launchTransition(stage, href)) {
      // Streak layer missing — still honour the gesture.
      window.location.href = href;
    }
  };

  const onWheel = (event: WheelEvent) => {
    trackTop();
    // deltaY < 0 is upward. deltaMode 1 is lines, 2 is pages.
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
    if (event.deltaY < 0) pull(-event.deltaY * scale);
  };

  const onTouchStart = (event: TouchEvent) => {
    trackTop();
    touchY = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY;
    if (y === undefined || touchY === null) return;
    // Dragging DOWN scrolls the page up.
    const delta = y - touchY;
    touchY = y;
    trackTop();
    if (delta > 0) pull(delta);
  };

  const onTouchEnd = () => {
    touchY = null;
    pulled = 0;
  };

  const onScroll = () => trackTop();

  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("scroll", onScroll);
  };
}
