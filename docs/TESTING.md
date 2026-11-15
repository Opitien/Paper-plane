# Paper Plane — Test record (Milestone 5)

Date: 2026-11-15. Build: production, `npm run check` green (40 tests).

How to repeat: `npm test` for the automated rows, `npm run tune` for the
harness rows, and `npm run dev` with the URL flags for the browser rows.

---

## 1. Gameplay matrix

| Case | How checked | Result |
|---|---|---|
| Normal flight (neutral, no wind, 30 s) | test `holds altitude with neutral input` | Pass. Altitude within 3 m, airspeed settles at 18.5 m/s |
| Continuous upward input | test `climbs for a while ... then stalls` | Pass. Gains height, stalls at about 2.6 s from speed loss, recovers on its own |
| Continuous downward input | test `dives, overspeeds and crashes` | Pass. Overspeed at 3.9 s, crash at 7.6 s, state frozen afterwards |
| Alternating inputs (1.5 s up / 1.5 s down, mid difficulty, 40 s) | test `survives alternating full up and down input` | Pass. All values finite, pitch within limits |
| Strong headwind (8 m/s sustained, 30 s) | test `handles a strong sustained headwind and tailwind` | Pass. Airspeed above ground speed, no crash |
| Strong tailwind (8 m/s sustained, 30 s) | same test | Pass. Loses height and may stall briefly, trims out, no crash |
| Sudden gusts (8 m/s head and tail for 2 s) | tests `balloons upward in a headwind gust`, `sinks in a tailwind gust` | Pass. Recoverable in both directions from 80 m |
| Stall recovery | test `recovers from a stall on its own when there is altitude` | Pass. Stays above 20 m, returns to trim |
| Turning | tests under `turning` | Pass. 43 deg bank, full circle, level-off on release |
| Crash detection | test `freezes after a crash`, store test `runs crash -> gameover` | Pass |
| Restart behaviour | store test `restarts from gameover with a fresh flight` | Pass. Time and distance zero, crashed flag cleared |
| Launch hill collision | tests `crashes the plane into the hill when flying into it below the top`, dive test resting on terrain | Pass. Cause `ground`, resting height equals the terrain |
| Balloon collision | test `crashes into a balloon placed in the path` | Pass. Cause `balloon` |
| Ring collection | test `collects a ring in the path` | Pass. +100 m, counted once, no crash |
| Obstacle spawning | test `spawns ahead of the plane, never on the hill, and recycles` | Pass over 120 s |
| Launch flow | store tests: start -> launching -> release -> playing; pause ignored while launching | Pass |
| Full difficulty, hands off, 90 s (3 seeds) | `npm run tune` scenario 8 | 1 crash at 74 s, 2 survive. Hard but not deadly without input |
| Full difficulty, crude autopilot, 120 s | `npm run tune` scenario 10 | 1 survives, 1 crashes at 96 s |

Situations looked for and not found: NaN or infinite values, pitch beyond
the clamp, the plane stuck at the ceiling (density falloff makes it sink
back), a stall with no way out (speed always rebuilds in the dive).

Known soft spot: at low progress a hands-off plane never crashes. This is a
balancing choice to keep the first minute gentle, not a bug.

---

## 2. Technical matrix

| Check | How checked | Result |
|---|---|---|
| Frame-rate independence | test `gives the same trajectory at 30 Hz and 240 Hz`, fixed-step accumulator | Pass. Distance equal within one fixed step |
| Catch-up cap after a long frame | test `caps catch-up after a long frame` | Pass. At most 0.25 s simulated per frame |
| Rendering performance | debug panel draw calls | 7 draw calls at medium (sky, ground, 3 cloud layers, streaks, plane parts batch as 3). Clouds and streaks are instanced |
| Allocation during play | code review of every `useFrame` and `sim.step` | No per-frame allocations: scratch vectors, typed arrays, pooled instances |
| Memory over 10 minutes | not measured here | Manual: open DevTools Performance monitor, play 10 min, heap should stay flat. Pools are fixed size, so growth would indicate a leak |
| Quality fallback | `FrameProbe` tests, `applyProbe` store test | Pass. Slow frames step the tier down; forced quality is respected |
| WebGL 2 missing | code path in `App.tsx` | Shows a plain message instead of a blank page. Not exercised in a browser here |
| Browser: Chrome | production build in headless Chrome, screenshots of menu, flight, turn, stages, pause, crash, game over | Pass |
| Browser: Edge, Firefox, Safari, iOS Safari, Android Chrome | not run by the author | Manual. Only standard WebGL 2, Pointer Events and Web Audio are used |
| Responsive layout | screenshots at 1280x720, 900x1600 portrait, 812x375 landscape | Pass. Cards fit, HUD stays clear of edges, controls hint hidden on touch |
| Keyboard controls | store tests for every phase transition; key map in `keyboard.ts` | Pass |
| Touch controls | stick maths tests; pointer wiring not exercised headlessly | Manual on a phone: drag anywhere, confirm climb and turn, confirm buttons do not start a drag |
| Game state transitions | store tests (7) | Pass. Illegal transitions are ignored |
| Best score persistence | storage tests (round trip, garbage rejected, missing storage) | Pass |
| Settings persistence | `loadSettings` validation in `storage.ts` | Pass by inspection; quality and sound survive a reload |
| Production build | `npm run build`, served with `vite preview`, screenshot | Pass. Dev URL flags absent in production |
| Sub-path build | `BASE_PATH=/paper-plane/ vite build` | Pass. Asset URLs are prefixed |

---

## 3. Optimisation notes

- Draw calls stay constant regardless of how long you fly because every
  environment object is pooled and recycled.
- Cloud and streak counts scale with the quality tier (0.45x, 1x, 1.7x).
  Device pixel ratio is capped at 1, 1.5 and 2.
- Shadows and post-processing are not used at any tier.
- Three.js ships in its own chunk so it caches across game updates.
- The HUD re-renders at most 12 times per second; the scene never touches
  React state per frame.

---

## 4. Still owed (needs a human and real devices)

1. Ten play sessions on a keyboard to judge difficulty and the feel of
   turning; adjust `DIFFICULTY` ranges and `PHYSICS.rollAuthority` if needed.
2. A phone in landscape: touch stick, performance tier chosen, audio unlock.
3. Firefox and Safari once each through the full loop.
4. A 10 minute flight with the DevTools memory monitor open.
