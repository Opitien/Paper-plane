import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { currentSky, skyFx, SKY_DOME_RADIUS } from './skyPalette';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uBelow;
  uniform vec3 uSunColor;
  uniform vec3 uSunDirection;
  uniform float uSunVisibility;
  uniform float uFlash;
  varying vec3 vWorldPosition;

  void main() {
    vec3 dir = normalize(vWorldPosition - cameraPosition);
    float elev = dir.y;

    // Above the horizon: horizon colour blending to zenith with a haze band.
    float up = smoothstep(0.0, 0.55, elev);
    up = pow(up, 0.75);
    vec3 sky = mix(uHorizon, uZenith, up);

    // Below the horizon: fade from horizon colour into the ground haze.
    float down = smoothstep(0.0, -0.25, elev);
    vec3 below = mix(uHorizon, uBelow, down);

    vec3 col = elev >= 0.0 ? sky : below;

    // Sun disc and halo.
    float cosAngle = dot(dir, uSunDirection);
    float disc = smoothstep(0.9993, 0.9998, cosAngle);
    float halo = pow(max(cosAngle, 0.0), 180.0) * 0.55;
    float glow = pow(max(cosAngle, 0.0), 8.0) * 0.18;
    col += uSunColor * ((disc + halo) * uSunVisibility + glow * (0.3 + 0.7 * uSunVisibility));
    // Lightning: whole-sky brightening, strongest near the horizon where the clouds are.
    col += vec3(uFlash) * (0.45 + 0.35 * (1.0 - clamp(elev * 3.0, 0.0, 1.0)));

    gl_FragColor = vec4(col, 1.0);
    // No tone mapping on purpose: scene fog is applied untone-mapped by
    // three.js, so the dome must output the same horizon colour as the fog
    // or a band appears where the fogged ground meets the sky.
    #include <colorspace_fragment>
  }
`;

export function Sky() {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        // Colour uniforms reference the live palette objects, which are
        // mutated in place each frame by <Environment />.
        uniforms: {
          uZenith: { value: currentSky.zenith },
          uHorizon: { value: currentSky.horizon },
          uBelow: { value: currentSky.below },
          uSunColor: { value: currentSky.sun },
          uSunDirection: { value: currentSky.sunDirection },
          uSunVisibility: { value: currentSky.sunVisibility },
          uFlash: { value: 0 },
        },
      }),
    [],
  );

  // Keep the dome centred on the camera so its edge is never reachable.
  useFrame(({ camera }) => {
    mesh.current?.position.copy(camera.position);
    material.uniforms.uSunVisibility.value = currentSky.sunVisibility;
    material.uniforms.uFlash.value = skyFx.flash;
  });

  return (
    <mesh ref={mesh} material={material} renderOrder={-100} frustumCulled={false}>
      <sphereGeometry args={[SKY_DOME_RADIUS, 32, 20]} />
    </mesh>
  );
}
