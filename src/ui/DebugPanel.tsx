import { useState } from 'react';
import { useHudStore } from '@/state/hudStore';
import { useGameStore } from '@/state/gameStore';
import { simulation } from '@/state/live';
import type { WindMode } from '@/sim/simulation';
import { RAD } from '@/utils/math';
import { stageName } from '@/scene/skyPalette';

/**
 * Flight variable readout and tuning hooks. Toggle with the backtick key.
 * Writes go straight to the simulation object, never through React state.
 */
export function DebugPanel() {
  const show = useGameStore((s) => s.showDebug);
  const hud = useHudStore();

  const [windMode, setWindMode] = useState<WindMode>(simulation.windMode);
  const [manual, setManual] = useState({ ...simulation.manualWind });
  const [autoDifficulty, setAutoDifficulty] = useState(simulation.difficultyOverride === null);
  const [difficulty, setDifficulty] = useState(simulation.difficultyOverride ?? 0);

  if (!show) return null;

  const applyWindMode = (mode: WindMode) => {
    simulation.windMode = mode;
    setWindMode(mode);
  };
  const applyManual = (key: keyof typeof manual, value: number) => {
    simulation.manualWind[key] = value;
    setManual((m) => ({ ...m, [key]: value }));
  };
  const applyDifficulty = (auto: boolean, value: number) => {
    simulation.difficultyOverride = auto ? null : value;
    setAutoDifficulty(auto);
    setDifficulty(value);
  };

  const row = (label: string, value: string, flag = false) => (
    <div className={`debug__row${flag ? ' debug__row--flag' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="debug">
      <div className="debug__title">debug · ` to hide</div>
      {row('fps', hud.fps.toFixed(0))}
      {row('draw calls / tris', `${hud.drawCalls} / ${(hud.triangles / 1000).toFixed(1)}k`)}
      {row('quality', useGameStore.getState().qualityTier)}
      {row('distance', `${hud.distance.toFixed(0)} m`)}
      {row('time', `${hud.time.toFixed(1)} s`)}
      {row('altitude', `${hud.altitude.toFixed(1)} m`)}
      {row('airspeed', `${hud.airspeed.toFixed(1)} m/s`)}
      {row('ground spd', `${hud.groundSpeed.toFixed(1)} m/s`)}
      {row('vert spd', `${hud.verticalSpeed.toFixed(1)} m/s`)}
      {row('pitch', `${(hud.pitch * RAD).toFixed(1)}°`)}
      {row('pitch rate', `${(hud.pitchRate * RAD).toFixed(0)}°/s`)}
      {row('bank', `${(hud.bank * RAD).toFixed(1)}°`)}
      {row('heading', `${(((hud.heading * RAD) % 360) + 360) % 360 | 0}°`)}
      {row('alpha', `${(hud.angleOfAttack * RAD).toFixed(1)}°`)}
      {row('CL', hud.liftCoefficient.toFixed(2))}
      {row('lift / drag', `${hud.lift.toFixed(1)} / ${hud.drag.toFixed(1)}`)}
      {row('wind h/v/c', `${hud.windHorizontal.toFixed(1)} / ${hud.windVertical.toFixed(1)} / ${hud.windCross.toFixed(1)}`)}
      {row('gust', hud.gust.toFixed(2), hud.gust > 0.25)}
      {row('turbulence', hud.turbulence.toFixed(2))}
      {row('stability', hud.stability.toFixed(2))}
      {row('stall margin', hud.stallMargin.toFixed(2), hud.stallMargin < 0.3)}
      {row('stalled', hud.stalled ? 'YES' : 'no', hud.stalled)}
      {row('overspeed', hud.overspeed ? 'YES' : 'no', hud.overspeed)}
      {row('progress', `${hud.progress.toFixed(2)} · ${stageName(hud.progress)}`)}

      <div className="debug__controls">
        <label>
          wind
          <select value={windMode} onChange={(e) => applyWindMode(e.target.value as WindMode)}>
            <option value="auto">auto</option>
            <option value="off">off</option>
            <option value="manual">manual</option>
          </select>
        </label>
        {windMode === 'manual' && (
          <>
            <Slider label="head/tail" min={-12} max={12} step={0.5} value={manual.horizontal} onChange={(v) => applyManual('horizontal', v)} />
            <Slider label="up/down" min={-6} max={6} step={0.25} value={manual.vertical} onChange={(v) => applyManual('vertical', v)} />
            <Slider label="cross" min={-8} max={8} step={0.5} value={manual.cross} onChange={(v) => applyManual('cross', v)} />
            <Slider label="turb" min={0} max={1} step={0.05} value={manual.turbulence} onChange={(v) => applyManual('turbulence', v)} />
          </>
        )}
        <label>
          <input type="checkbox" checked={autoDifficulty} onChange={(e) => applyDifficulty(e.target.checked, difficulty)} />
          difficulty from distance
        </label>
        {!autoDifficulty && (
          <Slider label="progress" min={0} max={1} step={0.05} value={difficulty} onChange={(v) => applyDifficulty(false, v)} />
        )}
        <button type="button" onClick={() => useGameStore.getState().startFlight()}>
          restart flight
        </button>
      </div>
    </div>
  );
}

function Slider(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="debug__slider">
      <span>{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span>{props.value.toFixed(2)}</span>
    </label>
  );
}
