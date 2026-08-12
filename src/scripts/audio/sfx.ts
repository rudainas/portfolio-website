/**
 * Synthetic UI sound effects.
 *
 * Every sound is generated with oscillators at runtime — there are no audio
 * files to download, and the whole module costs a couple of hundred bytes.
 *
 * Autoplay policy: browsers refuse to start an AudioContext until the user has
 * interacted with the page. Rather than construct one up front and let it sit
 * suspended (which makes Chrome log "The AudioContext was not allowed to
 * start"), the context is created lazily on the first real gesture. Until then
 * every play call is a silent no-op — so the very first hover makes no sound,
 * which is expected and not worth working around.
 *
 * Sound design — each hit is a small three-part voice, not a bare oscillator:
 *
 *   1. A body oscillator (triangle) at the fundamental.
 *   2. A sine one octave below it. This is what supplies "depth"; a lone
 *      oscillator at these frequencies sounds thin and synthetic.
 *   3. A lowpass filter that sweeps downward over the hit, rolling off the
 *      harsh upper harmonics so the result reads as soft rather than beepy.
 *
 * Each sound is then played as a short ricochet: the voice repeats a few
 * times with the gaps tightening, the level dropping and the pitch stepping
 * up — the pattern of a bouncing object settling.
 *
 * Elements opt in declaratively:
 *   data-sfx-hover  -> soft tone when the pointer first enters
 *   data-sfx-click  -> punchier tone on press
 * Binding is delegated from the document, so anything added later (cards,
 * future sections) works with no extra wiring.
 */

/* ---------- Mix ---------- */
/* Levels sit at a normal UI-sound loudness — the click peaks around -8 dBFS.
   The earlier values were roughly 5.8x quieter (a -24 dBFS click), which read
   as background texture rather than feedback.

   The RELATIVE balance is unchanged: hover is the quietest, click the
   loudest, trail in between. Scale MASTER_GAIN to move everything together;
   scale an individual gain only to re-balance one sound against the others. */
const MASTER_GAIN = 0.9;
const HOVER_GAIN = 0.19;
const CLICK_GAIN = 0.42;
const TRAIL_GAIN = 0.105;

/* Limiter settings. At these levels several overlapping sounds — a trail
   sparkle under a hover, or a ricochet tail meeting the next hit — would sum
   past full scale and clip audibly. The limiter catches those peaks instead
   of letting the mix distort, so the increase is safe without having to keep
   every individual sound timid. */
const LIMIT_THRESHOLD_DB = -6;
const LIMIT_RATIO = 12;

/* ---------- Rate limiting ---------- */
/* Each window is wider than its sound's full ricochet tail, so consecutive
   triggers queue rather than pile on top of one another. */
const HOVER_DEBOUNCE_MS = 150;
const CLICK_DEBOUNCE_MS = 60;
/* The trail's gate is not fixed — it scales with pointer speed between these
   two bounds, so the sparkle audibly speeds up and slows down with the mouse. */
const TRAIL_DEBOUNCE_SLOW_MS = 260;
const TRAIL_DEBOUNCE_FAST_MS = 70;
/** The trail yields briefly after a "real" sound so the two never stack. */
const TRAIL_YIELD_MS = 110;

type Voice = {
  type: OscillatorType;
  /** Fundamental in Hz. */
  freq: number;
  /** Optional end frequency — a downward sweep is what gives a hit its punch. */
  endFreq?: number;
  /** Seconds. */
  duration: number;
  gain: number;
  /** Level of the sub-octave sine, relative to the body oscillator. */
  sub: number;
  /** Lowpass cutoff at the start of the hit, in Hz. */
  cutoff: number;
};

type Ricochet = {
  /** Total hits including the first. */
  bounces: number;
  /** Seconds before the second hit. */
  gap: number;
  /** Each successive gap is multiplied by this — under 1 tightens the bounce. */
  gapDecay: number;
  /** Level multiplier per bounce. */
  gainDecay: number;
  /** Pitch multiplier per bounce. */
  pitchStep: number;
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

let lastHoverAt = 0;
let lastTrailAt = 0;
let lastClickAt = 0;
/** Any non-trail sound, used to make the trail step aside. */
let lastPriorityAt = 0;

/**
 * Create the context. Only ever called from a user-gesture handler, which is
 * what keeps the browser from blocking (and warning about) it.
 */
function ensureContext(): AudioContext | null {
  if (ctx) return ctx;

  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  ctx = new Ctor();

  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;

  // master -> limiter -> speakers. Everything is summed at the master gain,
  // so the limiter only has to sit once at the end of the chain.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = LIMIT_THRESHOLD_DB;
  limiter.knee.value = 6;
  limiter.ratio.value = LIMIT_RATIO;
  // Fast enough to catch a transient click, slow enough not to pump.
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;

  master.connect(limiter);
  limiter.connect(ctx.destination);
  return ctx;
}

/** Schedule one layered hit at an absolute context time. */
function voice(spec: Voice, at: number): void {
  if (!ctx || !master) return;

  const end = at + spec.duration;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(spec.cutoff, at);
  // Closing the filter as the hit decays is what stops it sounding electronic.
  filter.frequency.exponentialRampToValueAtTime(Math.max(spec.cutoff * 0.35, 120), end);

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  // A few ms of attack — an instant start produces an audible edge.
  envelope.gain.linearRampToValueAtTime(spec.gain, at + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);

  const body = ctx.createOscillator();
  body.type = spec.type;
  body.frequency.setValueAtTime(spec.freq, at);
  if (spec.endFreq !== undefined) {
    // exponentialRamp cannot reach or cross zero, hence the guard.
    body.frequency.exponentialRampToValueAtTime(Math.max(spec.endFreq, 1), end);
  }
  body.connect(filter);

  // Sub-octave sine — the depth layer.
  const sub = ctx.createOscillator();
  const subGain = ctx.createGain();
  sub.type = "sine";
  sub.frequency.setValueAtTime(spec.freq / 2, at);
  if (spec.endFreq !== undefined) {
    sub.frequency.exponentialRampToValueAtTime(Math.max(spec.endFreq / 2, 1), end);
  }
  subGain.gain.value = spec.sub;
  sub.connect(subGain);
  subGain.connect(filter);

  filter.connect(envelope);
  envelope.connect(master);

  const stopAt = end + 0.02;
  body.start(at);
  body.stop(stopAt);
  sub.start(at);
  sub.stop(stopAt);

  body.onended = () => {
    body.disconnect();
    sub.disconnect();
    subGain.disconnect();
    filter.disconnect();
    envelope.disconnect();
  };
}

/** Play a voice as a short decaying bounce. */
function play(spec: Voice, ric: Ricochet): void {
  // No context yet (no gesture), or the tab suspended it — stay silent.
  if (!ctx || ctx.state !== "running") return;

  const start = ctx.currentTime;
  let offset = 0;
  let gap = ric.gap;
  let gain = spec.gain;
  let freq = spec.freq;
  let endFreq = spec.endFreq;

  for (let i = 0; i < ric.bounces; i++) {
    voice(
      {
        ...spec,
        gain,
        freq,
        endFreq,
        // Later bounces are shorter, as a real bounce would be.
        duration: spec.duration * (1 - i * 0.18),
      },
      start + offset,
    );

    offset += gap;
    gap *= ric.gapDecay;
    gain *= ric.gainDecay;
    freq *= ric.pitchStep;
    if (endFreq !== undefined) endFreq *= ric.pitchStep;
  }
}

/** Soft, low, rounded — with one light echo behind it. */
export function playHover(): void {
  const now = performance.now();
  if (now - lastHoverAt < HOVER_DEBOUNCE_MS) return;
  lastHoverAt = now;
  lastPriorityAt = now;

  play(
    {
      type: "triangle",
      // Was 780-900Hz and read as a beep; roughly an octave and a half down.
      freq: 300 + Math.random() * 46,
      duration: 0.075,
      gain: HOVER_GAIN,
      sub: 0.55,
      cutoff: 1300,
    },
    { bounces: 2, gap: 0.062, gapDecay: 0.66, gainDecay: 0.4, pitchStep: 1.18 },
  );
}

/** Punchier: lower, with a downward sweep and three tightening bounces. */
export function playClick(): void {
  const now = performance.now();
  if (now - lastClickAt < CLICK_DEBOUNCE_MS) return;
  lastClickAt = now;
  lastPriorityAt = now;

  play(
    {
      type: "triangle",
      freq: 226,
      endFreq: 104,
      duration: 0.11,
      gain: CLICK_GAIN,
      sub: 0.62,
      cutoff: 1700,
    },
    { bounces: 3, gap: 0.076, gapDecay: 0.62, gainDecay: 0.44, pitchStep: 1.22 },
  );
}

/** Linear interpolation, clamped to the 0..1 range of `t`. */
function lerp(from: number, to: number, t: number): number {
  const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
  return from + (to - from) * clamped;
}

/**
 * Sparkle for the cursor trail. Quieter and more widely spaced than a hover,
 * and it defers to any hover/click that just played — otherwise a pointer
 * sweeping onto a nav link would sound the trail over the link's own tone.
 *
 * Everything about it tracks pointer speed, so the audio moves with the hand
 * rather than ticking along at a fixed rate:
 *
 *   rate   260ms apart when crawling -> 70ms apart at full tilt
 *   pitch  ~430Hz -> ~880Hz, so faster reads as brighter
 *   level  slightly louder when moving fast, so it cuts through
 *   bounce the ricochet tightens too, or its tail would overlap the next hit
 *
 * @param speedNorm pointer speed, normalised 0..1 by the trail module.
 */
export function playTrail(speedNorm = 0): void {
  const now = performance.now();

  const gate = lerp(TRAIL_DEBOUNCE_SLOW_MS, TRAIL_DEBOUNCE_FAST_MS, speedNorm);
  if (now - lastTrailAt < gate) return;
  if (now - lastPriorityAt < TRAIL_YIELD_MS) return;
  lastTrailAt = now;

  play(
    {
      type: "sine",
      // Still the brightest of the three, but no longer piercing.
      freq: lerp(430, 880, speedNorm) + Math.random() * 90,
      duration: lerp(0.06, 0.042, speedNorm),
      gain: lerp(TRAIL_GAIN * 0.8, TRAIL_GAIN * 1.25, speedNorm),
      sub: 0.4,
      cutoff: lerp(1800, 2600, speedNorm),
    },
    {
      bounces: 2,
      gap: lerp(0.058, 0.034, speedNorm),
      gapDecay: 0.6,
      gainDecay: 0.34,
      pitchStep: 1.26,
    },
  );
}

/**
 * Bind gesture-unlock and the delegated hover/click listeners.
 * Returns a teardown for symmetry with the motion modules.
 */
export function initSfx(): () => void {
  // Kept bound rather than { once: true }: a context can be suspended again
  // when the tab is backgrounded, and the next gesture should revive it.
  const unlock = () => {
    const context = ensureContext();
    if (context && context.state === "suspended") void context.resume();
  };

  let hoverTarget: Element | null = null;

  // pointerover bubbles (pointerenter does not), so one listener covers every
  // opted-in element, including any added to the DOM later.
  const onPointerOver = (event: PointerEvent) => {
    const target = event.target as Element | null;
    const el = target?.closest?.("[data-sfx-hover]") ?? null;
    if (!el) {
      hoverTarget = null;
      return;
    }
    // Moving within the same element must not retrigger.
    if (el === hoverTarget) return;
    hoverTarget = el;
    playHover();
  };

  const onPointerDown = (event: PointerEvent) => {
    unlock();
    const target = event.target as Element | null;
    if (target?.closest?.("[data-sfx-click]")) playClick();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    unlock();
    if (event.key !== "Enter" && event.key !== " ") return;
    const active = document.activeElement;
    if (active?.closest?.("[data-sfx-click]")) playClick();
  };

  document.addEventListener("pointerover", onPointerOver, { passive: true });
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.addEventListener("keydown", onKeyDown, { passive: true });
  // Touch taps that never produce a pointerdown still count as a gesture.
  document.addEventListener("touchstart", unlock, { passive: true });

  /* Scrolling should start the audio too, so the Projects queue is audible
     without having to click first.
     Note the browser rules this runs against: only pointer, key and touch-end
     events grant user activation. `wheel` and `scroll` do not, so on desktop
     this is a best-effort attempt that the browser may refuse — it costs
     nothing, and the listeners stay bound, so the context starts the moment
     any qualifying interaction happens. On touch, `touchend` DOES qualify, so
     the first flick of a scroll genuinely unlocks it. */
  window.addEventListener("wheel", unlock, { passive: true });
  window.addEventListener("scroll", unlock, { passive: true });
  window.addEventListener("touchend", unlock, { passive: true });

  return () => {
    document.removeEventListener("pointerover", onPointerOver);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("touchstart", unlock);
    window.removeEventListener("wheel", unlock);
    window.removeEventListener("scroll", unlock);
    window.removeEventListener("touchend", unlock);
  };
}
