import type { FlightResult } from '@/sim/scoring';

export interface BestRecord extends FlightResult {
  /** ISO date of the flight. */
  date: string;
}

export const BEST_KEY = 'paperplane.best.v1';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isRecord(v: unknown): v is BestRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.distance === 'number' &&
    Number.isFinite(r.distance) &&
    typeof r.time === 'number' &&
    typeof r.maxAltitude === 'number' &&
    typeof r.performance === 'number' &&
    typeof r.date === 'string'
  );
}

export function loadBest(storage: StorageLike | null = defaultStorage()): BestRecord | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(BEST_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveBest(record: BestRecord, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(BEST_KEY, JSON.stringify(record));
  } catch {
    // Private mode or quota: the game still works, the best just does not persist.
  }
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const SETTINGS_KEY = 'paperplane.settings.v1';

export type QualityChoice = 'auto' | 'high' | 'medium' | 'low';

export interface Settings {
  soundOn: boolean;
  quality: QualityChoice;
  touchHintSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = { soundOn: true, quality: 'auto', touchHintSeen: false };

export function loadSettings(storage: StorageLike | null = defaultStorage()): Settings {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const quality: QualityChoice =
      parsed.quality === 'high' || parsed.quality === 'medium' || parsed.quality === 'low' ? parsed.quality : 'auto';
    return {
      soundOn: typeof parsed.soundOn === 'boolean' ? parsed.soundOn : DEFAULT_SETTINGS.soundOn,
      quality,
      touchHintSeen: parsed.touchHintSeen === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function clearBest(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(BEST_KEY);
  } catch {
    // ignore
  }
}
