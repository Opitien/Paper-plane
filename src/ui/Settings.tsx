import { useGameStore } from '@/state/gameStore';
import type { QualityChoice } from '@/utils/storage';

/** Sound, quality and (on the menu) best reset. Shared by the menu and the pause screen. */
export function Settings({ showResetBest = false }: { showResetBest?: boolean }) {
  const settings = useGameStore((s) => s.settings);
  const tier = useGameStore((s) => s.qualityTier);
  const best = useGameStore((s) => s.best);
  const setSoundOn = useGameStore((s) => s.setSoundOn);
  const setQualityChoice = useGameStore((s) => s.setQualityChoice);
  const resetBest = useGameStore((s) => s.resetBest);

  return (
    <div className="settings">
      <label className="settings__item">
        <input type="checkbox" checked={settings.soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
        Sound <span className="settings__hint">M</span>
      </label>
      <label className="settings__item">
        Quality
        <select value={settings.quality} onChange={(e) => setQualityChoice(e.target.value as QualityChoice)}>
          <option value="auto">auto ({tier})</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </label>
      {showResetBest && best && (
        <button type="button" className="link-btn" onClick={resetBest}>
          Reset best
        </button>
      )}
    </div>
  );
}
