import gsap from "gsap";
import { playTrail } from "../audio/sfx";

/**
 * Cursor image trail — Figma node 1514:1988 ("mouse trail").
 *
 * Shapes spawn along the pointer's path, then fade and shrink away. The Figma
 * node is a cluster of three shapes; each is extracted to its own asset and
 * they are cycled in turn, so the trail reads as a stream of confetti rather
 * than one repeated stamp.
 *
 * Spacing is per-DISTANCE, not per-time. A time-based throttle looks fine when
 * the pointer creeps but tears the trail apart when it moves quickly: pointer
 * events arrive at a fixed rate, so a faster pointer just means bigger gaps
 * between the same number of shapes. Instead a running distance accumulator
 * spawns one shape every SPACING_PX, INTERPOLATING along the segment between
 * events — so a fast flick emits several shapes spread evenly across the
 * ground it covered, and density stays constant at any speed.
 *
 * Pointer speed is also measured and drives:
 *   - the sparkle's rate, pitch and level (see playTrail)
 *   - each shape's lifetime, so a fast trail stays tight behind the cursor
 *     instead of smearing into a long ribbon
 *
 * Notes that matter if you change this:
 *
 * - Items are centred with negative margins, NOT a transform. GSAP owns each
 *   item's `transform` for position and scale, and it nulls the standalone
 *   `translate`/`rotate`/`scale` properties when it takes over — so any CSS
 *   transform used for centring would be wiped.
 */

/** Gap between consecutive shapes along the path, in px. */
const SPACING_PX = 46;

/** Ceiling on shapes emitted from one pointer event, to bound a huge jump. */
const MAX_PER_EVENT = 14;

/** Beyond this the pointer teleported (window entry, tab switch) — don't
 *  draw a line across the whole screen to catch up. */
const TELEPORT_PX = 400;

/** Safety valve — a throttled/background tab can otherwise queue up work. */
const MAX_LIVE_ITEMS = 70;

/** px/ms treated as "full speed" when scaling sound and lifetime. */
const SPEED_REFERENCE = 2.4;

/** 0 = follow raw jittery speed, 1 = never move. Smooths the measurement. */
const SPEED_SMOOTHING = 0.65;

export function initCursorTrail(container: HTMLElement): () => void {
  // Decorative only, so it is skipped outright rather than given a reduced
  // variant. Checked once at init; the media listener below handles changes.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const templates = gsap.utils.toArray<HTMLTemplateElement>(
    container.querySelectorAll("[data-trail-shape]"),
  );
  if (!templates.length) return () => {};

  let shapeIndex = 0;
  let liveItems = 0;

  let lastX: number | null = null;
  let lastY = 0;
  let lastAt = 0;
  /** Distance carried over toward the next shape. */
  let carry = 0;
  /** Smoothed pointer speed in px/ms. */
  let speed = 0;

  const spawn = (clientX: number, clientY: number, speedNorm: number) => {
    if (liveItems >= MAX_LIVE_ITEMS) return;

    // Pointer coordinates are viewport-relative; the container is not. It sits
    // inside the hero, which scrolls and may be inset, so convert. Measured
    // per spawn because a cached rect would go stale on scroll, resize and
    // zoom alike.
    const bounds = container.getBoundingClientRect();
    const x = clientX - bounds.left;
    const y = clientY - bounds.top;

    // Skip anything outside the container — it would only be clipped away.
    if (x < 0 || y < 0 || x > bounds.width || y > bounds.height) return;

    const template = templates[shapeIndex % templates.length];
    shapeIndex += 1;

    const item = template.content.firstElementChild?.cloneNode(true) as HTMLElement | undefined;
    if (!item) return;

    container.appendChild(item);
    liveItems += 1;

    // Faster pointer, shorter life — keeps the trail tight rather than
    // letting a flick leave a long ribbon hanging behind.
    const life = gsap.utils.mapRange(0, 1, 1, 0.66, speedNorm);

    gsap.set(item, {
      x,
      y,
      scale: 0,
      opacity: 1,
      rotation: gsap.utils.random(-50, 50),
      transformOrigin: "50% 50%",
    });

    gsap
      .timeline({
        onComplete: () => {
          item.remove();
          liveItems -= 1;
        },
      })
      .to(item, {
        scale: gsap.utils.random(0.85, 1.1),
        duration: 0.22 * life,
        ease: "back.out(2.4)",
      })
      .to(
        item,
        {
          scale: 0.32,
          opacity: 0,
          rotation: "+=28",
          duration: 0.62 * life,
          ease: "power2.in",
        },
        ">-0.06",
      );
  };

  const considerPoint = (x: number, y: number) => {
    if (reduceMotion.matches) return;

    const now = performance.now();

    // First sample only anchors the path.
    if (lastX === null) {
      lastX = x;
      lastY = y;
      lastAt = now;
      return;
    }

    const dx = x - lastX;
    const dy = y - lastY;
    const distance = Math.hypot(dx, dy);
    if (distance <= 0) return;

    const elapsed = Math.max(now - lastAt, 1);

    if (distance > TELEPORT_PX) {
      lastX = x;
      lastY = y;
      lastAt = now;
      carry = 0;
      speed = 0;
      return;
    }

    // Exponentially smoothed, so one erratic sample cannot spike the sound.
    const instantSpeed = distance / elapsed;
    speed = speed * SPEED_SMOOTHING + instantSpeed * (1 - SPEED_SMOOTHING);
    const speedNorm = Math.min(speed / SPEED_REFERENCE, 1);

    // Walk the segment, dropping a shape every SPACING_PX. `carry` is the
    // distance already banked from previous segments, so spacing stays even
    // across event boundaries instead of restarting each time.
    let nextAt = SPACING_PX - carry;
    let emitted = 0;
    while (nextAt <= distance && emitted < MAX_PER_EVENT) {
      const t = nextAt / distance;
      spawn(lastX + dx * t, lastY + dy * t, speedNorm);
      emitted += 1;
      nextAt += SPACING_PX;
    }

    if (emitted > 0) playTrail(speedNorm);

    carry = (carry + distance) % SPACING_PX;
    lastX = x;
    lastY = y;
    lastAt = now;
  };

  const onPointerMove = (event: PointerEvent) => considerPoint(event.clientX, event.clientY);
  const onMouseMove = (event: MouseEvent) => considerPoint(event.clientX, event.clientY);
  const onTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (touch) considerPoint(touch.clientX, touch.clientY);
  };

  // Pointer events already unify mouse, touch and pen. Binding touchmove
  // alongside them would spawn twice per move on touch hardware, so the
  // mouse/touch pair is only a fallback for browsers without PointerEvent.
  const usePointer = "PointerEvent" in window;
  if (usePointer) {
    window.addEventListener("pointermove", onPointerMove, { passive: true });
  } else {
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
  }

  // Clear anything mid-flight when the user opts out part-way through.
  const onPreferenceChange = () => {
    if (!reduceMotion.matches) return;
    gsap.killTweensOf(container.children);
    container.replaceChildren(...templates);
    liveItems = 0;
  };
  reduceMotion.addEventListener("change", onPreferenceChange);

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("touchmove", onTouchMove);
    reduceMotion.removeEventListener("change", onPreferenceChange);
    gsap.killTweensOf(container.children);
    container.replaceChildren(...templates);
    liveItems = 0;
  };
}
