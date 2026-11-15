import { useGameStore } from '@/state/gameStore';
import { Settings } from './Settings';

export function PauseOverlay() {
  const resume = useGameStore((s) => s.resume);
  const quitToMenu = useGameStore((s) => s.quitToMenu);
  const startFlight = useGameStore((s) => s.startFlight);

  return (
    <div className="screen screen--dim">
      <div className="card">
        <h2 className="card__title">Paused</h2>
        <div className="btn-row">
          <button type="button" className="btn btn--primary" onClick={resume} autoFocus>
            Resume
            <span className="btn__hint">Space</span>
          </button>
          <button type="button" className="btn" onClick={startFlight}>
            Restart
            <span className="btn__hint">R</span>
          </button>
          <button type="button" className="btn" onClick={quitToMenu}>
            Menu
            <span className="btn__hint">Esc</span>
          </button>
        </div>
        <Settings />
      </div>
    </div>
  );
}
