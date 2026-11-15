import { describe, expect, it } from 'vitest';
import { isBetter, summarizeFlight } from '../scoring';
import { createFlightState } from '../types';
import { BEST_KEY, clearBest, loadBest, saveBest } from '@/utils/storage';
import { formatDistance, formatTime } from '@/utils/format';

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

describe('scoring', () => {
  it('summarises a flight with mean stability', () => {
    const s = createFlightState();
    s.distance = 1234;
    s.time = 20;
    s.maxAltitude = 150;
    s.stabilityIntegral = 15;
    const r = summarizeFlight(s);
    expect(r.distance).toBe(1234);
    expect(r.performance).toBeCloseTo(0.75);
  });

  it('treats a zero-length flight as fully stable rather than dividing by zero', () => {
    expect(summarizeFlight(createFlightState()).performance).toBe(1);
  });

  it('only beats the best on strictly greater distance', () => {
    const best = { distance: 100, time: 1, maxAltitude: 1, performance: 1, rings: 0, cause: null };
    expect(isBetter({ ...best, distance: 101 }, best)).toBe(true);
    expect(isBetter({ ...best, distance: 100 }, best)).toBe(false);
    expect(isBetter(best, null)).toBe(true);
  });
});

describe('best record storage', () => {
  it('round-trips a record and rejects garbage', () => {
    const storage = fakeStorage();
    expect(loadBest(storage)).toBeNull();
    const record = { distance: 900, time: 50, maxAltitude: 120, performance: 0.8, rings: 2, cause: 'ground' as const, date: '2026-11-15' };
    saveBest(record, storage);
    expect(loadBest(storage)).toEqual(record);
    storage.map.set(BEST_KEY, '{"distance":"nope"}');
    expect(loadBest(storage)).toBeNull();
    storage.map.set(BEST_KEY, 'not json');
    expect(loadBest(storage)).toBeNull();
    clearBest(storage);
    expect(storage.map.has(BEST_KEY)).toBe(false);
  });

  it('survives a missing storage', () => {
    expect(loadBest(null)).toBeNull();
    expect(() => saveBest({ distance: 1, time: 1, maxAltitude: 1, performance: 1, rings: 0, cause: null, date: '' }, null)).not.toThrow();
  });
});

describe('formatting', () => {
  it('formats distance and time for the HUD', () => {
    expect(formatDistance(842.7)).toBe('842 m');
    expect(formatDistance(1234)).toBe('1.23 km');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(5)).toBe('0:05');
  });
});
