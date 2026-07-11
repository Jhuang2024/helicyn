/**
 * Diurnal accumulation curve.
 *
 * Cumulative fleet metrics (energy, cost, carbon, cooling) accrue slowly
 * overnight, steepen through the working day, and taper in the evening. This
 * module reproduces the original `ACC(t)` curve: a rate function integrated by
 * trapezoid rule and normalised so `ACC(1) === 1`.
 */

const N = 240;

/** Instantaneous accrual rate at time-of-day t in [0, 1]. */
function rate(t: number): number {
  return (
    0.16 +
    0.8 * Math.exp(-Math.pow((t - 0.4) / 0.13, 2)) + // morning ramp
    1.25 * Math.exp(-Math.pow((t - 0.66) / 0.17, 2)) // afternoon / evening peak
  );
}

// Precompute the normalised cumulative table once.
const cum: number[] = new Array(N + 1);
cum[0] = 0;
for (let i = 0; i < N; i++) {
  cum[i + 1] = (cum[i] ?? 0) + rate((i + 0.5) / N);
}
const total = cum[N] ?? 1;
for (let i = 0; i <= N; i++) cum[i] = (cum[i] ?? 0) / total;

/** Cumulative fraction 0..1 of the day's total accrued by time-of-day t. */
export function ACC(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  const idx = x * N;
  const lo = Math.floor(idx);
  const hi = Math.min(N, lo + 1);
  const frac = idx - lo;
  const a = cum[lo] ?? 0;
  const b = cum[hi] ?? 1;
  return a + (b - a) * frac;
}

/** Convert simulation seconds (0..86400) into a day fraction 0..1. */
export function dayFractionFromSeconds(seconds: number): number {
  const s = ((seconds % 86400) + 86400) % 86400;
  return s / 86400;
}

/** Format simulation seconds as HH:MM:SS. */
export function formatClock(seconds: number): string {
  const s = Math.floor(((seconds % 86400) + 86400) % 86400);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
