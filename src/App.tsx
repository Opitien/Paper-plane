import { useEffect, useMemo } from 'react';
import { GameCanvas } from './scene/GameCanvas';
import { DebugPanel } from './ui/DebugPanel';
import { WindHud } from './ui/WindHud';
import { Hud } from './ui/Hud';
import { ControlsHint } from './ui/ControlsHint';
import { MainMenu } from './ui/MainMenu';
import { PauseOverlay } from './ui/PauseOverlay';
import { GameOver } from './ui/GameOver';
import { TouchControls } from './ui/TouchControls';
import { OgCard } from './ui/OgCard';
import { useAutoPause, useKeyboard } from './input/keyboard';
import { useGameStore } from './state/gameStore';
import { audio } from './audio/engine';

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/** Browsers only allow audio after a user gesture; unlock on the first one. */
function useAudioUnlock(): void {
  useEffect(() => {
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
}

export function App() {
  useKeyboard();
  useAutoPause();
  useAudioUnlock();
  const phase = useGameStore((s) => s.phase);
  const supported = useMemo(hasWebGL2, []);

  if (!supported) {
    return (
      <div className="webgl-missing">
        <p>
          Paper Plane needs WebGL 2, which this browser does not provide.
          <br />
          Try a recent version of Chrome, Edge, Firefox or Safari.
        </p>
      </div>
    );
  }

  const inFlight =
    phase === 'launching' || phase === 'playing' || phase === 'paused' || phase === 'crashed' || phase === 'gameover';

  // Dev only: render the social card instead of the interface.
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('og') === '1') {
    return (
      <>
        <GameCanvas />
        <div className="overlay">
          <OgCard />
        </div>
      </>
    );
  }

  return (
    <>
      <GameCanvas />
      <div className={`overlay overlay--${phase}`}>
        {(phase === 'playing' || phase === 'launching') && <TouchControls />}
        {inFlight && <Hud />}
        {inFlight && <WindHud />}
        {phase === 'playing' && <ControlsHint />}
        {phase === 'crashed' && <div className="crash-flash" />}
        {phase === 'menu' && <MainMenu />}
        {phase === 'paused' && <PauseOverlay />}
        {phase === 'gameover' && <GameOver />}
        <DebugPanel />
      </div>
    </>
  );
}
