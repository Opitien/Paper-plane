import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { SimDriver } from './SimDriver';
import { QualityProbe } from './QualityProbe';
import { Environment } from './Environment';
import { Lighting } from './Lighting';
import { Sky } from './Sky';
import { Ground } from './Ground';
import { Clouds } from './Clouds';
import { WindParticles } from './WindParticles';
import { Hill } from './Hill';
import { Boy } from './Boy';
import { Obstacles } from './Obstacles';
import { PaperPlane } from './PaperPlane';
import { ChaseCamera } from './ChaseCamera';
import { CAMERA_FAR } from './skyPalette';
import { START_ALTITUDE } from '@/sim/constants';
import { useGameStore } from '@/state/gameStore';
import { TIER_SETTINGS } from '@/utils/quality';

export function GameCanvas() {
  const tier = useGameStore((s) => s.qualityTier);
  const settings = TIER_SETTINGS[tier];

  return (
    <Canvas
      dpr={[1, settings.dprCap]}
      gl={{ antialias: settings.antialias, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 56, near: 0.1, far: CAMERA_FAR, position: [0, START_ALTITUDE + 1.6, 6.4] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <SimDriver />
      <QualityProbe />
      <Environment />
      <Lighting />
      <Sky />
      <Ground />
      <Clouds />
      <WindParticles />
      <Hill />
      <Boy />
      <Obstacles />
      <PaperPlane />
      <ChaseCamera />
    </Canvas>
  );
}
