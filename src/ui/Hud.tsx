import { useHudStore } from '@/state/hudStore';
import { useGameStore } from '@/state/gameStore';
import { formatDistance, formatTime } from '@/utils/format';
import { clamp, RAD } from '@/utils/math';
import { OBSTACLES, PHYSICS } from '@/sim/constants';

/** Altitude where the bar tops out; matches the soft ceiling. */
const ALT_BAR_MAX = PHYSICS.ceilingAltitude;
/** Pixels of horizon shift per degree of pitch in the attitude ball. */
const ATTITUDE_PX_PER_DEG = 1.6;

/**
 * In-flight interface: distance and time top centre, altitude bar on the
 * left, attitude ball and stability bar bottom left, pause and restart
 * buttons top right under the wind readout. Minimal on purpose.
 */
export function Hud() {
  const distance = useHudStore((s) => s.distance);
  const time = useHudStore((s) => s.time);
  const altitude = useHudStore((s) => s.altitude);
  const pitch = useHudStore((s) => s.pitch);
  const bank = useHudStore((s) => s.bank);
  const stability = useHudStore((s) => s.stability);
  const best = useGameStore((s) => s.best);
  const phase = useGameStore((s) => s.phase);
  const pause = useGameStore((s) => s.pause);
  const startFlight = useGameStore((s) => s.startFlight);

  const ringsCollected = useHudStore((s) => s.ringsCollected);
  const lastRingAt = useHudStore((s) => s.lastRingAt);
  const ringPop = time - lastRingAt < 1.2;
  const ahead = best !== null && distance > best.distance;
  const altPct = clamp(altitude / ALT_BAR_MAX, 0, 1) * 100;
  const horizonShift = clamp(pitch * RAD * ATTITUDE_PX_PER_DEG, -26, 26);
  const stabilityClass = stability > 0.6 ? 'ok' : stability > 0.3 ? 'warn' : 'bad';

  return (
    <>
      <div className="hud">
        <div className={`hud__distance${ahead ? ' hud__distance--best' : ''}`}>{formatDistance(distance)}</div>
        <div className="hud__sub">
          <span>{formatTime(time)}</span>
          {best && <span className="hud__best">best {formatDistance(best.distance)}</span>}
          {ringsCollected > 0 && <span className="hud__rings">&#x25CB; {ringsCollected}</span>}
        </div>
        {ringPop && <div className="hud__pop">+{OBSTACLES.ringBonus} m</div>}
      </div>

      <div className="alt-bar" title="altitude">
        <div className="alt-bar__track">
          <div className="alt-bar__fill" style={{ height: `${altPct}%` }} />
        </div>
        <div className="alt-bar__label">{Math.round(altitude)} m</div>
      </div>

      <div className="attitude">
        <div className="attitude__ball" title="pitch and bank">
          <div
            className="attitude__horizon"
            style={{ transform: `rotate(${-bank * RAD}deg) translateY(${horizonShift}px)` }}
          />
          <div className="attitude__wings" />
        </div>
        <div className="stability" title="stability">
          <div className={`stability__fill stability__fill--${stabilityClass}`} style={{ width: `${stability * 100}%` }} />
        </div>
      </div>

      {phase === 'playing' && (
        <div className="hud-buttons">
          <button type="button" className="icon-btn" onClick={pause} aria-label="Pause" title="Pause (Space)">
            <span className="icon-pause" />
          </button>
          <button type="button" className="icon-btn" onClick={startFlight} aria-label="Restart" title="Restart (R)">
            &#x21bb;
          </button>
        </div>
      )}
    </>
  );
}
