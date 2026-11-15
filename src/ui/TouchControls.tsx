import { useEffect, useRef, useState } from 'react';
import { rawInput } from '@/input/intent';
import { stickAxes } from '@/input/stick';
import { useGameStore } from '@/state/gameStore';
import { launch } from '@/state/live';

const STICK = {
  radius: 64,
  deadzone: 8,
  /** Seconds the first-run hint stays up. */
  hintSeconds: 6,
} as const;

/**
 * Virtual stick: press anywhere and drag. Up climbs, sideways turns.
 * Works with touch, pen and mouse. Mounted only while playing; HUD buttons
 * sit above this layer so taps on them never start a drag.
 */
export function TouchControls() {
  const layer = useRef<HTMLDivElement>(null);
  const [stick, setStick] = useState<{ x: number; y: number; nubX: number; nubY: number } | null>(null);
  const activePointer = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const hintSeen = useGameStore((s) => s.settings.touchHintSeen);
  const markTouchHintSeen = useGameStore((s) => s.markTouchHintSeen);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (!coarse || hintSeen) return;
    setShowHint(true);
    const id = window.setTimeout(() => {
      setShowHint(false);
      markTouchHintSeen();
    }, STICK.hintSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [hintSeen, markTouchHintSeen]);

  useEffect(() => {
    const el = layer.current;
    if (!el) return;

    const end = () => {
      activePointer.current = null;
      rawInput.stickPitch = 0;
      rawInput.stickRoll = 0;
      setStick(null);
    };

    const onDown = (e: PointerEvent) => {
      if (activePointer.current !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      activePointer.current = e.pointerId;
      origin.current = { x: e.clientX, y: e.clientY };
      if (useGameStore.getState().phase === 'launching') launch.skip = true;
      el.setPointerCapture(e.pointerId);
      setStick({ x: e.clientX, y: e.clientY, nubX: 0, nubY: 0 });
      if (showHint) {
        setShowHint(false);
        markTouchHintSeen();
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointer.current) return;
      const a = stickAxes(e.clientX - origin.current.x, e.clientY - origin.current.y, STICK.radius, STICK.deadzone);
      rawInput.stickPitch = a.pitch;
      rawInput.stickRoll = a.roll;
      setStick({ x: origin.current.x, y: origin.current.y, nubX: a.nubX, nubY: a.nubY });
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointer.current) return;
      end();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('lostpointercapture', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('lostpointercapture', onUp);
      end();
    };
  }, [showHint, markTouchHintSeen]);

  return (
    <>
      <div ref={layer} className="touch-layer" aria-hidden />
      {stick && (
        <div className="stick" style={{ left: stick.x, top: stick.y }}>
          <div className="stick__base" style={{ width: STICK.radius * 2, height: STICK.radius * 2 }} />
          <div className="stick__nub" style={{ transform: `translate(${stick.nubX}px, ${stick.nubY}px)` }} />
        </div>
      )}
      {showHint && (
        <div className="touch-hint">
          Drag anywhere: <strong>up</strong> to climb, <strong>sideways</strong> to turn
        </div>
      )}
    </>
  );
}
