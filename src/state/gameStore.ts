import { create } from 'zustand';
import type { Phase } from '@/sim/types';
import { isBetter, summarizeFlight, type FlightResult } from '@/sim/scoring';
import { detectQualityTier, isMobileDevice, stepTier, type ProbeVerdict, type QualityTier } from '@/utils/quality';
import {
  clearBest,
  loadBest,
  loadSettings,
  saveBest,
  saveSettings,
  type BestRecord,
  type QualityChoice,
  type Settings,
} from '@/utils/storage';
import { launch, resetFlight, simulation } from './live';
import { clearRawInput } from '@/input/intent';
import { audio } from '@/audio/engine';
import { START_ALTITUDE } from '@/sim/constants';

interface GameStore {
  phase: Phase;
  /** Effective tier: the detected one unless the player chose otherwise. */
  qualityTier: QualityTier;
  settings: Settings;
  /** Dev readout visible. Toggled with the backtick key. */
  showDebug: boolean;
  best: BestRecord | null;
  lastResult: FlightResult | null;
  isNewBest: boolean;

  toggleDebug: () => void;
  setSoundOn: (on: boolean) => void;
  setQualityChoice: (choice: QualityChoice) => void;
  /** Result of the startup frame-time probe. Only acts while quality is on auto. */
  applyProbe: (verdict: ProbeVerdict) => void;
  markTouchHintSeen: () => void;

  /** menu, paused or gameover -> launching: the boy winds up and throws. Also used by restart. */
  startFlight: () => void;
  /** launching -> playing: the plane leaves the hand. Called by the frame driver. */
  release: () => void;
  /** playing -> paused */
  pause: () => void;
  /** paused -> playing */
  resume: () => void;
  /** paused or gameover -> menu */
  quitToMenu: () => void;
  /** playing -> crashed. Called by the frame driver when the sim reports a crash. */
  crash: () => void;
  /** crashed -> gameover. Summarises the flight and updates the best. */
  finish: () => void;
  resetBest: () => void;
}

const detectedTier = detectQualityTier();
const initialSettings = loadSettings();
audio.setEnabled(initialSettings.soundOn);

function effectiveTier(choice: QualityChoice): QualityTier {
  return choice === 'auto' ? detectedTier : choice;
}

function holdPlane(): void {
  launch.active = true;
  launch.t = 0;
  launch.skip = false;
}

export const useGameStore = create<GameStore>((set, get) => ({
  phase: 'menu',
  qualityTier: effectiveTier(initialSettings.quality),
  settings: initialSettings,
  showDebug: false,
  best: loadBest(),
  lastResult: null,
  isNewBest: false,

  toggleDebug: () => set((s) => ({ showDebug: !s.showDebug })),

  setSoundOn: (on) => {
    const settings = { ...get().settings, soundOn: on };
    saveSettings(settings);
    audio.setEnabled(on);
    if (on) audio.blip('click');
    set({ settings });
  },

  setQualityChoice: (choice) => {
    const settings = { ...get().settings, quality: choice };
    saveSettings(settings);
    set({ settings, qualityTier: effectiveTier(choice) });
  },

  applyProbe: (verdict) => {
    if (get().settings.quality !== 'auto') return;
    // Phones stay where the heuristic put them unless they are struggling.
    if (verdict === 'up' && isMobileDevice()) return;
    set({ qualityTier: stepTier(get().qualityTier, verdict) });
  },

  markTouchHintSeen: () => {
    if (get().settings.touchHintSeen) return;
    const settings = { ...get().settings, touchHintSeen: true };
    saveSettings(settings);
    set({ settings });
  },

  startFlight: () => {
    resetFlight();
    clearRawInput();
    holdPlane();
    simulation.collisions = true;
    audio.blip('start');
    set({ phase: 'launching', lastResult: null, isNewBest: false });
  },

  release: () => {
    if (get().phase !== 'launching') return;
    // Hand pose is in render space with the plane's world origin at zero
    // (the sim has not moved yet), so sim x = render x and sim z = -render z.
    if (launch.handValid) {
      simulation.launchFrom({ x: launch.handX, y: launch.handY, z: -launch.handZ, heading: 0 });
    } else {
      simulation.launchFrom({ x: 0, y: START_ALTITUDE, z: 0, heading: 0 });
    }
    launch.active = false;
    audio.swish();
    set({ phase: 'playing' });
  },

  pause: () => {
    if (get().phase === 'playing') {
      audio.blip('pause');
      set({ phase: 'paused' });
    }
  },

  resume: () => {
    if (get().phase === 'paused') {
      clearRawInput();
      audio.blip('resume');
      set({ phase: 'playing' });
    }
  },

  quitToMenu: () => {
    resetFlight();
    clearRawInput();
    holdPlane();
    audio.blip('click');
    set({ phase: 'menu' });
  },

  crash: () => {
    if (get().phase === 'playing') {
      audio.crash();
      set({ phase: 'crashed' });
    }
  },

  finish: () => {
    if (get().phase !== 'crashed') return;
    const result = summarizeFlight(simulation.state);
    const best = get().best;
    const newBest = isBetter(result, best);
    const record: BestRecord | null = newBest ? { ...result, date: new Date().toISOString() } : best;
    if (newBest && record) saveBest(record);
    audio.blip(newBest ? 'best' : 'over');
    set({ phase: 'gameover', lastResult: result, isNewBest: newBest, best: record });
  },

  resetBest: () => {
    clearBest();
    set({ best: null });
  },
}));
