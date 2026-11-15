import { useHudStore } from '@/state/hudStore';
import { useGameStore } from '@/state/gameStore';
import { RAD } from '@/utils/math';

/**
 * Small wind readout plus flight warnings. Minimal by design; the full HUD
 * arrives in Milestone 4.
 */
export function WindHud() {
  const h = useHudStore((s) => s.windHorizontal);
  const v = useHudStore((s) => s.windVertical);
  const c = useHudStore((s) => s.windCross);
  const gust = useHudStore((s) => s.gust);
  const stalled = useHudStore((s) => s.stalled);
  const stallMargin = useHudStore((s) => s.stallMargin);
  const overspeed = useHudStore((s) => s.overspeed);
  const playing = useGameStore((s) => s.phase === 'playing');

  const speed = Math.hypot(h, v, c);
  // Arrow points where the wind blows, seen from above: up = forward, right = cross+.
  const angle = Math.atan2(c, h) * RAD;
  const gusting = gust > 0.25;

  return (
    <>
      <div className={`wind-hud${gusting ? ' wind-hud--gust' : ''}`}>
        <span className="wind-hud__arrow" style={{ transform: `rotate(${angle}deg)` }} aria-hidden>
          &#x2191;
        </span>
        <span className="wind-hud__speed">{speed.toFixed(0)}</span>
        <span className="wind-hud__unit">m/s</span>
        {gusting && <span className="wind-hud__gust">gust</span>}
      </div>

      <div className="warnings">
        {!playing ? null : stalled ? (
          <span className="warning warning--stall">stall · nose down</span>
        ) : stallMargin < 0.3 ? (
          <span className="warning warning--soft">low speed</span>
        ) : overspeed ? (
          <span className="warning warning--soft">overspeed</span>
        ) : null}
      </div>
    </>
  );
}
