import { create } from 'zustand';
import { simulation, frameStats } from './live';

/** Snapshot of the live state for React. Published at most HUD_HZ times per second. */
export interface HudSnapshot {
  distance: number;
  altitude: number;
  time: number;
  airspeed: number;
  groundSpeed: number;
  verticalSpeed: number;
  pitch: number;
  pitchRate: number;
  bank: number;
  heading: number;
  angleOfAttack: number;
  liftCoefficient: number;
  lift: number;
  drag: number;
  windHorizontal: number;
  windVertical: number;
  windCross: number;
  gust: number;
  turbulence: number;
  stability: number;
  stallMargin: number;
  stalled: boolean;
  overspeed: boolean;
  crashed: boolean;
  progress: number;
  ringsCollected: number;
  lastRingAt: number;
  fps: number;
  drawCalls: number;
  triangles: number;
}

export const HUD_HZ = 12;

export const useHudStore = create<HudSnapshot>(() => ({
  distance: 0,
  altitude: 0,
  time: 0,
  airspeed: 0,
  groundSpeed: 0,
  verticalSpeed: 0,
  pitch: 0,
  pitchRate: 0,
  bank: 0,
  heading: 0,
  angleOfAttack: 0,
  liftCoefficient: 0,
  lift: 0,
  drag: 0,
  windHorizontal: 0,
  windVertical: 0,
  windCross: 0,
  gust: 0,
  turbulence: 0,
  stability: 1,
  stallMargin: 1,
  stalled: false,
  overspeed: false,
  crashed: false,
  progress: 0,
  ringsCollected: 0,
  lastRingAt: -Infinity,
  fps: 0,
  drawCalls: 0,
  triangles: 0,
}));

let lastPublish = -Infinity;

/** Called every frame; writes to the store only when the interval has elapsed. */
export function publishHud(nowSeconds: number): void {
  if (nowSeconds - lastPublish < 1 / HUD_HZ) return;
  lastPublish = nowSeconds;
  const s = simulation.state;
  useHudStore.setState({
    distance: s.distance,
    altitude: s.altitude,
    time: s.time,
    airspeed: s.airspeed,
    groundSpeed: s.vx,
    verticalSpeed: s.vy,
    pitch: s.pitch,
    pitchRate: s.pitchRate,
    bank: s.bank,
    heading: s.heading,
    angleOfAttack: s.angleOfAttack,
    liftCoefficient: s.liftCoefficient,
    lift: s.lift,
    drag: s.drag,
    windHorizontal: s.wind.horizontal,
    windVertical: s.wind.vertical,
    windCross: s.wind.cross,
    gust: s.wind.gust,
    turbulence: s.wind.turbulence,
    stability: s.stability,
    stallMargin: s.stallMargin,
    stalled: s.stalled,
    overspeed: s.overspeed,
    crashed: s.crashed,
    progress: s.progress,
    ringsCollected: s.ringsCollected,
    lastRingAt: s.lastRingAt,
    fps: frameStats.fps,
    drawCalls: frameStats.drawCalls,
    triangles: frameStats.triangles,
  });
}
