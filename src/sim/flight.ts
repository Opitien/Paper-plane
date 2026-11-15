import { PHYSICS as P, WIND } from './constants';
import { noise1 } from './noise';
import { terrainHeight } from './terrain';
import type { FlightState } from './types';
import { clamp, mix, smoothstep } from '@/utils/math';

/** Noise seeds for the disturbance terms, drawn once per run. */
export interface DisturbanceSeeds {
  turbPitch: number;
  cross: number;
  kick: number;
  flutter: number;
}

function wrapAngle(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2));
}

/**
 * One fixed step of the arcade flight model. Reads `s.wind`, writes
 * everything else. Equations and reasoning are in docs/FLIGHT_MODEL.md.
 */
export function flightStep(
  s: FlightState,
  dt: number,
  pitchAxis: number,
  rollAxis: number,
  seeds: DisturbanceSeeds,
): void {
  const t = s.time;

  // --- Air-relative velocity -------------------------------------------------
  const ax = s.vx - s.wind.horizontal;
  const ay = s.vy - s.wind.vertical;
  const V = Math.max(Math.hypot(ax, ay), 0.1);
  const gamma = Math.atan2(ay, ax);
  const alpha = wrapAngle(s.pitch - gamma);
  const ux = ax / V;
  const uy = ay / V;

  // --- Coefficients ------------------------------------------------------------
  const rho = Math.max(P.minDensity, 1 - s.altitude / P.ceilingAltitude);
  const clLinear = P.clAlpha * alpha;
  const stallBlend = smoothstep(P.alphaStall - P.stallBlendBelow, P.alphaStall + P.stallBlendAbove, Math.abs(alpha));
  let cl = mix(clLinear, Math.sign(alpha) * P.clStalled, stallBlend);
  cl = clamp(cl, -P.clMaxNegative, P.clMax);

  const overspeedExcess = Math.max(0, V - P.vMax);
  const cd = P.cd0 + P.kInduced * cl * cl + P.overspeedDragK * overspeedExcess * overspeedExcess;

  const q = P.kAero * rho * V * V;
  const lift = q * cl;
  const drag = q * cd;

  // --- Forces in the vertical plane along the heading -----------------------
  // Drag along -air, lift perpendicular to air and tilted by bank (only the
  // cos(bank) part holds the plane up; the rest turns it), breeze forward.
  const liftVertical = lift * Math.cos(s.bank);
  const fx = -drag * ux - liftVertical * uy + P.breezeForce * rho;
  const fy = -drag * uy + liftVertical * ux - P.mass * P.gravity;

  const turb = s.wind.turbulence;
  const kick = P.turbKick * turb * noise1(t * WIND.turbKickFreq, seeds.kick);

  s.vx += (fx / P.mass) * dt;
  s.vy += (fy / P.mass + kick) * dt;
  s.altitude += s.vy * dt;

  // --- Heading and ground track ------------------------------------------------
  const turnRate = (P.turnGain * P.gravity * Math.tan(s.bank)) / Math.max(V, P.turnSpeedFloor);
  s.heading += turnRate * dt;
  const sinH = Math.sin(s.heading);
  const cosH = Math.cos(s.heading);
  const drift = s.wind.cross * P.crossDrift;
  s.posX += (s.vx * sinH + drift * cosH) * dt;
  s.posZ += (s.vx * cosH - drift * sinH) * dt;
  s.distance += Math.abs(s.vx) * dt;

  // --- Stall and overspeed flags (hysteresis) ----------------------------------
  if (!s.stalled) {
    if (alpha > P.alphaStall || V < P.vStall) s.stalled = true;
  } else if (alpha < P.alphaStall - P.stallExitAlphaMargin && V > P.vStall + P.stallExitSpeedMargin) {
    s.stalled = false;
  }
  s.overspeed = V > P.vMax;

  // --- Pitch dynamics ------------------------------------------------------------
  const sf = clamp(V / P.vRef, 0, 2);
  const authority = pitchAxis >= 0 ? P.controlAuthorityUp : P.controlAuthorityDown;
  const controlM = pitchAxis * authority * sf;
  const stabilityM = -P.stabilityK * (alpha - P.alphaTrim) * sf * sf;
  const dampingM = -P.pitchDamping * (0.5 + 0.5 * sf) * s.pitchRate;
  const stallM = s.stalled ? -P.stallNoseDrop * (1 - sf * 0.5) : 0;
  const turbM =
    turb * P.turbPitchK * noise1(t * WIND.turbPitchFreq, seeds.turbPitch) +
    Math.abs(s.wind.cross) * P.crossPitchK * noise1(t * WIND.turbPitchFreq * 1.3, seeds.cross);
  const flutterM = s.overspeed
    ? P.overspeedFlutter * clamp(overspeedExcess / 5, 0, 1) * noise1(t * WIND.flutterFreq, seeds.flutter)
    : 0;

  s.pitchRate += (controlM + stabilityM + dampingM + stallM + turbM + flutterM) * dt;
  s.pitchRate = clamp(s.pitchRate, -P.maxPitchRate, P.maxPitchRate);
  s.pitch += s.pitchRate * dt;
  if (s.pitch > P.pitchLimit) {
    s.pitch = P.pitchLimit;
    s.pitchRate = Math.min(s.pitchRate, 0);
  } else if (s.pitch < -P.pitchLimit) {
    s.pitch = -P.pitchLimit;
    s.pitchRate = Math.max(s.pitchRate, 0);
  }

  // --- Roll dynamics ---------------------------------------------------------------
  const rollControlM = rollAxis * P.rollAuthority * sf;
  const rollStabilityM = -P.rollStability * s.bank * sf;
  const rollDampingM = -P.rollDamping * s.rollRate;
  const wingDropM = s.stalled ? P.stallWingDrop * noise1(t * 2, seeds.flutter + 1) : 0;
  s.rollRate += (rollControlM + rollStabilityM + rollDampingM + wingDropM) * dt;
  s.rollRate = clamp(s.rollRate, -P.maxRollRate, P.maxRollRate);
  s.bank += s.rollRate * dt;
  if (s.bank > P.bankLimit) {
    s.bank = P.bankLimit;
    s.rollRate = Math.min(s.rollRate, 0);
  } else if (s.bank < -P.bankLimit) {
    s.bank = -P.bankLimit;
    s.rollRate = Math.max(s.rollRate, 0);
  }

  // --- Derived values for HUD, audio, camera -----------------------------------
  s.airspeed = V;
  s.angleOfAttack = alpha;
  s.liftCoefficient = cl;
  s.lift = lift;
  s.drag = drag;
  const stallMargin = clamp((P.alphaStall - alpha) / P.stallMarginWidth, 0, 1);
  const speedMargin = clamp((V - P.vStall) / 8, 0, 1) * clamp((P.vMax + 4 - V) / 8, 0, 1);
  s.stallMargin = stallMargin;
  s.stability = stallMargin * speedMargin * (1 - 0.5 * turb);

  // --- Bookkeeping ---------------------------------------------------------------
  s.time += dt;
  s.stabilityIntegral += s.stability * dt;
  if (s.altitude > s.maxAltitude) s.maxAltitude = s.altitude;
  const ground = terrainHeight(s.posX, s.posZ);
  if (s.altitude <= ground) {
    s.altitude = ground;
    s.crashed = true;
    s.crashCause = 'ground';
  }
}
