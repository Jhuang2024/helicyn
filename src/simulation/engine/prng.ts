/**
 * Deterministic, seedable pseudo-random number generator.
 *
 * The simulation engine must be reproducible: given the same scenario, seed,
 * and operator actions it must produce identical output. We therefore never
 * call `Math.random()` inside the engine: every stochastic value flows through
 * a `Prng` instance created from an explicit seed.
 *
 * Implementation: SplitMix64-style seed expansion feeding a mulberry32 core.
 * mulberry32 is a small, fast, well-distributed 32-bit generator that is more
 * than adequate for illustrative simulation noise.
 */

export interface Prng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Approximately-Gaussian value (mean 0, sd 1) via the central-limit trick. */
  gaussian(): number;
  /** Pick a random element from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Return true with the given probability. */
  chance(probability: number): boolean;
  /** Current 32-bit internal state: used for serialization. */
  getState(): number;
  /** Restore internal state produced by {@link getState}. */
  setState(state: number): void;
}

/** Convert an arbitrary string seed into a 32-bit unsigned integer. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** Create a PRNG from a numeric or string seed. */
export function createPrng(seed: number | string): Prng {
  let state = (typeof seed === 'string' ? hashSeed(seed) : seed >>> 0) || 0x9e3779b9;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    gaussian: () => {
      // Sum of 6 uniforms approximates a normal distribution (Irwin–Hall),
      // scaled to unit variance. Deterministic and dependency-free.
      let sum = 0;
      for (let i = 0; i < 6; i++) sum += next();
      return (sum - 3) / Math.sqrt(0.5);
    },
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('createPrng.pick: empty array');
      return items[Math.floor(next() * items.length)] as T;
    },
    chance: (probability) => next() < probability,
    getState: () => state,
    setState: (s) => {
      state = s >>> 0;
    },
  };
}
