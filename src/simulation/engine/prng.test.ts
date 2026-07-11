import { describe, it, expect } from 'vitest';
import { createPrng, hashSeed } from './prng';

describe('createPrng', () => {
  it('is deterministic for the same seed', () => {
    const a = createPrng('normal-ops');
    const b = createPrng('normal-ops');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = createPrng('a');
    const b = createPrng('b');
    expect(a.next()).not.toEqual(b.next());
  });

  it('returns floats in [0, 1)', () => {
    const p = createPrng(42);
    for (let i = 0; i < 1000; i++) {
      const v = p.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() stays within bounds', () => {
    const p = createPrng(7);
    for (let i = 0; i < 500; i++) {
      const v = p.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('int() is inclusive of both ends', () => {
    const p = createPrng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(p.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('serializes and restores state', () => {
    const p = createPrng(123);
    for (let i = 0; i < 5; i++) p.next();
    const snapshot = p.getState();
    const expected = [p.next(), p.next(), p.next()];
    p.setState(snapshot);
    expect([p.next(), p.next(), p.next()]).toEqual(expected);
  });

  it('hashSeed is stable and unsigned', () => {
    expect(hashSeed('training-surge')).toBe(hashSeed('training-surge'));
    expect(hashSeed('x')).toBeGreaterThanOrEqual(0);
  });
});
