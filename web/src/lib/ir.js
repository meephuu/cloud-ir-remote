// Helpers for raw IR codes.
// A code is a list of durations in microseconds, alternating mark (IR on) and
// space (IR off), starting with a mark. See docs/uart-protocol.md.

export const MAX_DURATIONS = 600;

/** "486,403,401" -> [486, 403, 401]. Ignores blanks and non-numbers. */
export function parseTimings(timings) {
  if (Array.isArray(timings)) return timings.map(Number).filter(Number.isFinite);
  if (typeof timings !== 'string') return [];
  return timings
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Total length of a code in microseconds. */
export function codeLengthUs(durations) {
  return durations.reduce((a, b) => a + b, 0);
}

/**
 * Turns durations into an SVG path for a timing diagram.
 * Long gaps (over gapClampUs) are shortened so one frame gap does not flatten
 * the whole picture; the returned `breaks` mark where that happened.
 */
export function waveformPath(durations, width, height, { gapClampUs = 6000, pad = 2 } = {}) {
  if (!durations.length) return { d: '', breaks: [] };
  const clamped = durations.map((d) => Math.min(d, gapClampUs));
  const total = codeLengthUs(clamped);
  const scale = width / total;
  const hi = pad;
  const lo = height - pad;
  let x = 0;
  let d = `M0 ${lo}`;
  const breaks = [];
  clamped.forEach((dur, i) => {
    const isMark = i % 2 === 0;
    const y = isMark ? hi : lo;
    d += ` V${y} H${(x + dur * scale).toFixed(2)}`;
    if (durations[i] > gapClampUs) breaks.push(x + (dur * scale) / 2);
    x += dur * scale;
    if (isMark) d += ` V${lo}`;
  });
  d += ` H${width}`;
  return { d, breaks };
}

// ---------------------------------------------------------------------------
// Synthetic codes for demo mode and the seed file. These are NOT captured from
// a real remote; they only look like an air-con / TV signal.

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Daikin-style: two frames separated by a ~29 ms gap, 319 durations in total.
 * Header 3480/1740, bit mark ~430, space ~420 (0) or ~1300 (1).
 */
export function syntheticAcCode(label) {
  const r = rng(hashString(label));
  const jitter = (v) => Math.round(v + (r() - 0.5) * 40);
  const out = [];
  const frame = (bits) => {
    out.push(jitter(3480), jitter(1740));
    for (let i = 0; i < bits; i++) out.push(jitter(430), r() < 0.45 ? jitter(1300) : jitter(420));
    out.push(jitter(430));
  };
  frame(64);
  out.push(jitter(29400));
  frame(92);
  return out; // 131 + 1 + 187 = 319
}

/** NEC-style TV code: 67 durations. */
export function syntheticNecCode(label) {
  const r = rng(hashString(label));
  const out = [9000, 4500];
  for (let i = 0; i < 32; i++) out.push(560, r() < 0.5 ? 1690 : 560);
  out.push(560);
  return out;
}

/** Short code for a cheap LED remote: 35 durations. */
export function syntheticShortCode(label) {
  const r = rng(hashString(label));
  const out = [2400, 600];
  for (let i = 0; i < 16; i++) out.push(600, r() < 0.5 ? 1200 : 600);
  out.push(600);
  return out;
}
