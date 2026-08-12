/**
 * Haptic feedback.
 *
 * Wraps the Vibration API, which is genuinely narrow in support:
 *
 *   Android Chrome / Firefox  supported
 *   iOS Safari                NOT supported — no web access to the Taptic
 *                             Engine exists at all, at any API
 *   Desktop browsers          exposed on some, but almost no machine has
 *                             hardware to actuate it
 *
 * So this is a progressive enhancement: real on Android, a silent no-op
 * everywhere else. There is no polyfill — nothing else can reach the hardware.
 *
 * Vibration also requires sticky user activation, so the first call before the
 * reader has interacted with the page may be ignored by the browser. That is
 * the same bargain as the audio context and needs no special handling.
 */

/** Feature test, evaluated lazily so it works under SSR. */
function canVibrate(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/**
 * A short tap. Kept deliberately brief — long buzzes read as errors or
 * notifications, whereas a few milliseconds reads as a detent clicking over.
 *
 * @param pattern milliseconds, or a vibrate/pause pattern.
 */
export function tap(pattern: number | number[] = 12): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw when the document is not visible or not activated.
    // A failed haptic is never worth breaking the caller for.
  }
}
