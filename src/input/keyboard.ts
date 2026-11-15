import { useEffect } from 'react';
import { clearRawInput, intent, rawInput } from './intent';
import { useGameStore } from '@/state/gameStore';
import { launch, simulation } from '@/state/live';
import { FIXED_DT } from '@/sim/constants';

const UP_KEYS = new Set(['KeyW', 'ArrowUp']);
const DOWN_KEYS = new Set(['KeyS', 'ArrowDown']);
const LEFT_KEYS = new Set(['KeyA', 'ArrowLeft']);
const RIGHT_KEYS = new Set(['KeyD', 'ArrowRight']);
const PREVENT_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Phase transitions on keys. Returns true when the key was consumed. */
function handlePhaseKey(code: string): boolean {
  const store = useGameStore.getState();
  switch (store.phase) {
    case 'menu':
      if (code === 'Space' || code === 'Enter') {
        store.startFlight();
        return true;
      }
      return false;
    case 'launching':
      // Any flight key throws right away; movement keys also fall through to steer after release.
      if (code === 'Space' || code === 'Enter') {
        launch.skip = true;
        return true;
      }
      if (code === 'Escape') {
        store.quitToMenu();
        return true;
      }
      launch.skip = true;
      return false;
    case 'playing':
      if (code === 'Space' || code === 'KeyP' || code === 'Escape') {
        store.pause();
        return true;
      }
      if (code === 'KeyR') {
        store.startFlight();
        return true;
      }
      return false;
    case 'paused':
      if (code === 'Space' || code === 'KeyP' || code === 'Enter') {
        store.resume();
        return true;
      }
      if (code === 'Escape') {
        store.quitToMenu();
        return true;
      }
      if (code === 'KeyR') {
        store.startFlight();
        return true;
      }
      return false;
    case 'crashed':
      return false;
    case 'gameover':
      if (code === 'Space' || code === 'Enter' || code === 'KeyR') {
        store.startFlight();
        return true;
      }
      if (code === 'Escape') {
        store.quitToMenu();
        return true;
      }
      return false;
  }
}

export function installKeyboard(): () => void {
  // Dev only: `?hold=up|down|left|right` (comma separated) simulates held
  // keys, `?skip=<seconds>` fast-forwards the simulation with them held, and
  // `?phase=playing` skips the menu. For screenshots and automated checks.
  // Stripped from production builds.
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);
    const phase = params.get('phase');
    if (phase === 'playing' || phase === 'paused') {
      useGameStore.getState().startFlight();
      useGameStore.getState().release(); // skip the throw; starts from the default point
    }
    if (phase === 'launching') {
      useGameStore.getState().startFlight();
      const hold = params.get('launchHold');
      if (hold !== null) {
        launch.t = Number(hold);
        launch.frozen = true;
      }
    }
    if (phase === 'paused') useGameStore.getState().pause();
    const progress = params.get('progress');
    if (progress !== null) simulation.difficultyOverride = Number(progress);
    const holds = new Set((params.get('hold') ?? '').split(','));
    rawInput.up = holds.has('up');
    rawInput.down = holds.has('down');
    rawInput.left = holds.has('left');
    rawInput.right = holds.has('right');
    const skip = Number(params.get('skip') ?? 0);
    if (skip > 0) {
      intent.pitchAxis = (rawInput.up ? 1 : 0) - (rawInput.down ? 1 : 0);
      intent.rollAxis = (rawInput.right ? 1 : 0) - (rawInput.left ? 1 : 0);
      for (let t = 0; t < skip; t += FIXED_DT) simulation.step(FIXED_DT, intent);
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (e.code === 'Backquote') {
      useGameStore.getState().toggleDebug();
      return;
    }
    if (e.code === 'KeyM') {
      const store = useGameStore.getState();
      store.setSoundOn(!store.settings.soundOn);
      return;
    }
    if (handlePhaseKey(e.code)) return;
    if (UP_KEYS.has(e.code)) rawInput.up = true;
    else if (DOWN_KEYS.has(e.code)) rawInput.down = true;
    else if (LEFT_KEYS.has(e.code)) rawInput.left = true;
    else if (RIGHT_KEYS.has(e.code)) rawInput.right = true;
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (UP_KEYS.has(e.code)) rawInput.up = false;
    else if (DOWN_KEYS.has(e.code)) rawInput.down = false;
    else if (LEFT_KEYS.has(e.code)) rawInput.left = false;
    else if (RIGHT_KEYS.has(e.code)) rawInput.right = false;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clearRawInput);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clearRawInput);
  };
}

export function useKeyboard(): void {
  useEffect(() => installKeyboard(), []);
}

/** Pauses when the tab is hidden. */
export function useAutoPause(): void {
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) useGameStore.getState().pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);
}
