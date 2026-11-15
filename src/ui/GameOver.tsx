import { useGameStore } from '@/state/gameStore';
import { formatDistance, formatPercent, formatTime } from '@/utils/format';

export function GameOver() {
  const result = useGameStore((s) => s.lastResult);
  const best = useGameStore((s) => s.best);
  const isNewBest = useGameStore((s) => s.isNewBest);
  const startFlight = useGameStore((s) => s.startFlight);
  const quitToMenu = useGameStore((s) => s.quitToMenu);

  if (!result) return null;

  const causeText =
    result.cause === 'balloon'
      ? 'Hit a balloon'
      : result.cause === 'turbine'
        ? 'Hit a wind turbine'
        : 'Hit the ground';

  return (
    <div className="screen screen--dim">
      <div className="card card--result">
        <h2 className="card__title">{causeText}</h2>
        {isNewBest && <div className="badge">New best</div>}
        <div className="result-distance">{formatDistance(result.distance)}</div>

        <dl className="result-grid">
          <dt>Time</dt>
          <dd>{formatTime(result.time)}</dd>
          <dt>Max altitude</dt>
          <dd>{Math.round(result.maxAltitude)} m</dd>
          <dt>Stability</dt>
          <dd>{formatPercent(result.performance)}</dd>
          <dt>Rings</dt>
          <dd>{result.rings}</dd>
          <dt>Best</dt>
          <dd>{best ? formatDistance(best.distance) : '—'}</dd>
        </dl>

        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={startFlight} autoFocus>
            Fly again
            <span className="btn__hint">Space</span>
          </button>
          <button type="button" className="btn" onClick={quitToMenu}>
            Menu
            <span className="btn__hint">Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
