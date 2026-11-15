import type { FlightState, Phase } from '@/sim/types';
import { PHYSICS } from '@/sim/constants';
import { clamp, lerp } from '@/utils/math';

/**
 * All game audio, synthesised with the Web Audio API. No files.
 *
 * - Wind: looping white noise through a band-pass filter. Cutoff and gain
 *   follow airspeed and gusts; turbulence wobbles the gain.
 * - Stall warning: a soft tone pulsing faster as the stall margin shrinks.
 * - Crash: noise burst plus a low thump.
 * - Thunder: slow, low noise swell, delayed after a flash.
 * - UI: tiny sine blips.
 *
 * The context is created on the first user gesture (`unlock`). Every method
 * is a no-op before that, so callers never need to check.
 */

const MIX = {
  master: 0.8,
  windMax: 0.55,
  stall: 0.11,
  crash: 0.9,
  thunder: 0.5,
  blip: 0.12,
} as const;

type BlipKind = 'start' | 'pause' | 'resume' | 'over' | 'best' | 'click' | 'ring';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private stallGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enabled = true;
  private stallPulse = 0;
  private phaseLevel = 0;

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? MIX.master : 0;
    this.master.connect(ctx.destination);

    this.noise = this.makeNoise(2);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    src.connect(this.windFilter).connect(this.windGain).connect(this.master);
    src.start();

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 640;
    this.stallGain = ctx.createGain();
    this.stallGain.gain.value = 0;
    osc.connect(this.stallGain).connect(this.master);
    osc.start();

    if (ctx.state === 'suspended') void ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(on ? MIX.master : 0, this.ctx.currentTime, 0.05);
    }
  }

  /** Called every frame by the sim driver. */
  update(s: FlightState, phase: Phase, dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.windGain || !this.windFilter || !this.stallGain) return;
    const now = ctx.currentTime;

    const phaseTarget =
      phase === 'playing'
        ? 1
        : phase === 'menu' || phase === 'launching'
          ? 0.25
          : phase === 'crashed'
            ? 0.4
            : phase === 'gameover'
              ? 0.15
              : 0;
    this.phaseLevel = lerp(this.phaseLevel, phaseTarget, 1 - Math.exp(-4 * dt));

    // Wind bed: louder and brighter with airspeed and gusts.
    const speedT = clamp((s.airspeed - 8) / 28, 0, 1);
    const overspeed = Math.max(0, s.airspeed - PHYSICS.vMax);
    const wobble = 1 + s.wind.turbulence * 0.35 * Math.sin(now * 23 + Math.sin(now * 7) * 3);
    const windLevel = (0.08 + speedT * 0.6 + s.wind.gust * 0.35) * wobble * MIX.windMax * this.phaseLevel;
    const cutoff = 220 + speedT * 900 + s.wind.gust * 700 + overspeed * 60 + s.wind.turbulence * 200;
    this.windGain.gain.setTargetAtTime(clamp(windLevel, 0, 1), now, 0.08);
    this.windFilter.frequency.setTargetAtTime(cutoff, now, 0.1);

    // Stall warning: pulses faster the closer to the stall; continuous when stalled.
    const warn = phase === 'playing' && (s.stalled || s.stallMargin < 0.35);
    if (warn) {
      const rate = s.stalled ? 9 : lerp(2.5, 7, 1 - s.stallMargin / 0.35);
      this.stallPulse = (this.stallPulse + rate * dt) % 1;
      const on = this.stallPulse < 0.45;
      this.stallGain.gain.setTargetAtTime(on ? MIX.stall : 0, now, 0.01);
    } else {
      this.stallPulse = 0;
      this.stallGain.gain.setTargetAtTime(0, now, 0.03);
    }
  }

  crash(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;

    const burst = ctx.createBufferSource();
    burst.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3200, now);
    lp.frequency.exponentialRampToValueAtTime(180, now + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIX.crash, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    burst.connect(lp).connect(g).connect(this.master);
    burst.start(now);
    burst.stop(now + 0.7);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(90, now);
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.4);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.6, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    thump.connect(tg).connect(this.master);
    thump.start(now);
    thump.stop(now + 0.5);
  }

  /** The throw: a short falling swish of filtered noise. */
  swish(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(2400, now);
    bp.frequency.exponentialRampToValueAtTime(500, now + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.5, now + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    src.connect(bp).connect(g).connect(this.master);
    src.start(now);
    src.stop(now + 0.35);
  }

  thunder(delaySeconds: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const start = ctx.currentTime + delaySeconds;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(320, start);
    lp.frequency.exponentialRampToValueAtTime(90, start + 2.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, start);
    g.gain.exponentialRampToValueAtTime(MIX.thunder, start + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, start + 2.4);
    src.connect(lp).connect(g).connect(this.master);
    src.start(start);
    src.stop(start + 2.5);
  }

  blip(kind: BlipKind): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    const notes: Record<BlipKind, number[]> = {
      start: [660, 880],
      pause: [520],
      resume: [660],
      over: [440, 330],
      best: [660, 880, 1100],
      click: [740],
      ring: [988, 1319],
    };
    notes[kind].forEach((freq, i) => {
      const t0 = now + i * 0.09;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(MIX.blip, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.11);
      osc.connect(g).connect(this.master!);
      osc.start(t0);
      osc.stop(t0 + 0.13);
    });
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

export const audio = new AudioEngine();
