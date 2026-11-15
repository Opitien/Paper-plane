import { useGameStore } from '@/state/gameStore';
import { formatDistance, formatTime } from '@/utils/format';
import { Settings } from './Settings';

export function MainMenu() {
  const best = useGameStore((s) => s.best);
  const startFlight = useGameStore((s) => s.startFlight);

  return (
    <div className="screen screen--menu">
      <div className="card card--menu">
        <h1 className="title">Paper Plane</h1>
        <p className="tagline">Ride the wind. See how far it takes you.</p>

        {best ? (
          <p className="best-line">
            Best flight <strong>{formatDistance(best.distance)}</strong> in {formatTime(best.time)}
          </p>
        ) : (
          <p className="best-line best-line--empty">No flights yet</p>
        )}

        <button type="button" className="btn btn--primary" onClick={startFlight} autoFocus>
          Start flight
          <span className="btn__hint">Space</span>
        </button>

        <div className="controls-grid">
          <div>
            <kbd>W</kbd> <kbd>&uarr;</kbd>
            <span>climb</span>
          </div>
          <div>
            <kbd>S</kbd> <kbd>&darr;</kbd>
            <span>descend</span>
          </div>
          <div>
            <kbd>A</kbd> <kbd>D</kbd>
            <span>turn</span>
          </div>
          <div>
            <kbd>Space</kbd>
            <span>pause</span>
          </div>
        </div>

        <p className="menu-tip">
          Pull up too hard and you stall. Dive too long and you overspeed. Turns cost height. The
          wind gets stronger the further you fly.
        </p>
        <p className="menu-tip menu-tip--touch">On a phone: drag anywhere to steer. Landscape works best.</p>
        <Settings showResetBest />
      </div>
    </div>
  );
}
