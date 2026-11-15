import type { InputIntent } from '@/sim/types';
import { clamp, damp } from '@/utils/math';

/** Raw, unsmoothed device state written by keyboard.ts and the touch stick. */
export const rawInput = {
  up: false,
  down: false,
  left: false,
  right: false,
  /** Analogue axes from the virtual stick, -1..1. Added to the key axes. */
  stickPitch: 0,
  stickRoll: 0,
};

/** Smoothed intent handed to the simulation each fixed step. */
export const intent: InputIntent = {
  pitchAxis: 0,
  rollAxis: 0,
  pausePressed: false,
  confirmPressed: false,
};

/** Intent with no input, used while the menu background flies itself. */
export const NEUTRAL_INTENT: Readonly<InputIntent> = {
  pitchAxis: 0,
  rollAxis: 0,
  pausePressed: false,
  confirmPressed: false,
};

export function clearRawInput(): void {
  rawInput.up = false;
  rawInput.down = false;
  rawInput.left = false;
  rawInput.right = false;
  rawInput.stickPitch = 0;
  rawInput.stickRoll = 0;
  intent.pitchAxis = 0;
  intent.rollAxis = 0;
}

/** Time constant of the axis smoothing, seconds. Taps feel soft, holds reach full input. */
const AXIS_TAU = 0.12;

function smoothAxis(current: number, target: number, dt: number): number {
  const next = damp(current, target, 1 / AXIS_TAU, dt);
  return Math.abs(next) < 0.001 ? 0 : next;
}

export function updateIntent(dt: number): void {
  const pitchTarget = clamp((rawInput.up ? 1 : 0) - (rawInput.down ? 1 : 0) + rawInput.stickPitch, -1, 1);
  const rollTarget = clamp((rawInput.right ? 1 : 0) - (rawInput.left ? 1 : 0) + rawInput.stickRoll, -1, 1);
  intent.pitchAxis = smoothAxis(intent.pitchAxis, pitchTarget, dt);
  intent.rollAxis = smoothAxis(intent.rollAxis, rollTarget, dt);
}
