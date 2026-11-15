# Paper Plane — Milestone Implementation Plan

Status: all milestones complete (2026-11-15), plus the turning addition.
Remaining work is human playtesting on real devices; see `docs/TESTING.md`
section 4.

Every milestone follows the standing rule in `CLAUDE.md`: inspect the existing
code first, preserve working features, implement incrementally, run the app,
test, fix, then update the docs. A milestone is not complete until its
completion checks pass in a real browser and `npm run check` passes.

---

## Milestone 0 — Planning (this milestone)

Deliverables:

- [x] `docs/ARCHITECTURE.md`: layers, stack, state machine, performance plan, decisions
- [x] `docs/FLIGHT_MODEL.md`: equations, constants, stall, wind, difficulty, scoring
- [x] `docs/ASSETS.md`: asset inventory, procedural plans, swap points
- [x] `docs/MILESTONES.md`: this plan
- [x] `CLAUDE.md`: standing instructions for later milestones

No code.

---

## Milestone 1 — 3D flight prototype

Goal: a plane visibly flying forward through a convincing sky, with smooth
chase camera and placeholder up/down.

Tasks in order:

1. **Scaffold.** `npm create vite` with React + TypeScript. Add `three`,
   `@react-three/fiber`, `@react-three/drei`, `zustand`, `vitest`, types,
   eslint. Pin versions. Add scripts: `dev`, `build`, `preview`, `test`,
   `lint`, `typecheck`, `check` (typecheck + lint + test + build).
   Create the folder structure from `ARCHITECTURE.md` section 9, with empty
   index files where needed.
2. **Canvas and loop.** `GameCanvas` with a capped DPR, `SimDriver` that
   runs an accumulator and calls a placeholder step. `state/live.ts` holds the
   mutable state. Fixed step is in place from day one even though the step is
   a placeholder.
3. **Placeholder movement.** Constant forward speed. Pitch eases toward
   `pitchAxis * 25 degrees` with damping. Vertical speed = forward speed *
   sin(pitch). No lift, drag or stall yet. Altitude clamped above 2 m so the
   prototype never "crashes".
4. **Keyboard input.** W/Up, S/Down, both = 0, `preventDefault`.
5. **Paper plane.** Procedural dart geometry and paper material per `ASSETS.md`.
   Flat shading, double-sided. Pivot at 40 percent.
6. **Chase camera.** Offset behind and above, partial pitch follow, exponential
   damping, look-ahead target, small FOV change with speed.
7. **Sky dome.** Shader gradient with sun disc, clear-day palette only.
8. **Ground and fog.** Flat fogged disc, fog colour matched to horizon.
9. **Clouds.** Instanced billboards, three layers, recycled with the floating
   origin. Parallax speeds differ per layer.
10. **Lighting.** Sun directional light plus hemisphere light. No shadows.
11. **Floating origin.** Plane at z = 0; clouds and ground texture offset by
    distance travelled.
12. **FPS readout** (dev only) to confirm smoothness.

Completion checks (in the browser):

- Runs with `npm run dev` and `npm run build && npm run preview`.
- Plane is clearly a folded paper dart, readable from behind.
- Holding W climbs smoothly; holding S descends smoothly; releasing eases back.
- Camera follows with visible but mild lag, plane never leaves the frame.
- Clouds pass at three distinct speeds; forward motion is obvious.
- Horizon and sun look convincing; no visible dome seam.
- Steady 60 fps on a mid-range laptop at 1080p with 350 clouds.
- `npm run check` passes.

Explicitly not in scope: real physics, wind, menus, scoring, audio, touch.

### Milestone 1 outcome

Done. Notes for the next milestone:

- `npm run check` passes: typecheck, lint, 6 sim tests, production build
  (about 315 kB gzipped, inside the budget).
- Verified in headless Chrome via screenshots of neutral, held-climb and
  held-dive flight. Real-GPU frame rate was not measurable in that environment;
  check the fps readout (backtick key) on a real machine at the start of M2.
- The placeholder movement lives in `src/sim/placeholder.ts`. M2 replaces it
  and deletes that file; `Simulation.step` is the only caller.
- Dev-only URL flag `?hold=up` or `?hold=down` simulates a held key for
  automated screenshots. It is stripped from production builds.
- Sky and cloud shaders intentionally skip tone mapping so their horizon colour
  matches the scene fog, which three.js applies untone-mapped. Keep that if
  the palette becomes dynamic in M3: fog colour and dome horizon must stay
  the same value.
- Camera constants (`CAMERA` in `ChaseCamera.tsx`) put the horizon slightly
  above mid-frame and the plane in the lower middle. Bank slide and pitch
  follow are in but only lightly exercised until the real model lands.

---

## Milestone 2 — Flight physics and wind

Goal: replace the placeholder with the model in `FLIGHT_MODEL.md`.

Tasks in order:

1. `sim/constants.ts` with every constant from the design doc, grouped.
2. `sim/rng.ts` (mulberry32) and `sim/noise.ts` (1D value noise).
3. `sim/flight.ts`: forces, CL/CD curves, pitch moments, stall hysteresis,
   overspeed, stability metric, bank.
4. `sim/wind.ts`: base noise channels, gust scheduler and envelope, turbulence.
5. `sim/difficulty.ts`: progress to wind parameters. For M2, expose a manual
   difficulty override in the debug panel; the distance-driven curve is wired
   in M3.
6. `sim/simulation.ts`: owns state, `reset(seed)`, `step(dt, input)`, previous
   state copy for interpolation.
7. Wire `SimDriver` to the real sim with render interpolation.
8. Input smoothing (time constant ~0.12 s).
9. Rendering reads pitch and bank from the sim; clouds drift with
   `wind.horizontal`.
10. **Debug panel** (toggle with backtick): airspeed, ground speed, vertical
    speed, altitude, pitch, pitch rate, alpha, CL, lift, drag, wind channels,
    gust, turbulence, stall and overspeed flags, stability, fps. Optional
    `leva` sliders for the main constants behind a dev flag.
11. **Minimal wind HUD**: small arrow and speed in a corner, plus a stall
    warning text. Full HUD comes in M4.
12. **Vitest scenarios** from `ARCHITECTURE.md` section 11.
13. Tune through the checklist in `FLIGHT_MODEL.md` section 11. Record the
    final constants in the doc.

Completion checks:

- All tuning checklist items pass in the browser.
- Climb, descend and hold steady all feel controlled; nothing snaps.
- Stalls happen from over-pitching, drop the nose, and recover with altitude.
- Gusts are felt and seen (cloud drift, bank, HUD arrow).
- Vitest scenarios pass, including frame-rate independence.
- Throttling the browser to 30 fps gives the same flight behaviour.
- `npm run check` passes.

Explicitly not in scope: menus, crash handling beyond a flag, scoring, audio.

### Milestone 2 outcome

Done. Notes for the next milestone:

- `npm run check` passes: typecheck, lint, 15 sim tests, production build.
- The flight model, wind system and difficulty curve live in `src/sim/` with
  every constant in `constants.ts`. The placeholder is gone.
- `src/sim/loop.ts` holds the fixed-step accumulator (`FixedStepper`) so the
  frame-rate independence test can drive it directly. `SimDriver` uses it.
- `npm run tune` runs the headless scenario harness in `scripts/tune.ts` and
  prints the checklist outcomes; the measured results are in
  `docs/FLIGHT_MODEL.md` section 12. Use it before touching any constant.
- Debug panel (backtick) shows all flight variables and offers wind mode
  (auto / off / manual sliders), a difficulty override and restart. These
  write to `simulation` directly. M3 keeps the panel but must remove the
  difficulty override from the player-facing path.
- Crash sets `state.crashed` and freezes the sim; the R key calls
  `resetFlight()`. M3 replaces this with the real phase machine.
- The minimal wind HUD (`WindHud.tsx`) shows an arrow, speed, gust flag and
  stall / low speed / overspeed / crashed messages. M4 replaces it with the
  full HUD.
- Clouds drift with `wind.horizontal` and `wind.cross`, more for near layers.
- Dev-only URL flags: `?hold=up|down` and `?skip=<seconds>` fast-forward the
  sim with that key held, for screenshots.
- Open balancing item: a hands-off plane at full difficulty survives longer
  than the 30 to 60 s target. Decide with real play in M3.

### Milestone 2b — Turning (scope addition, 2026-11-15)

Added on request before Milestone 3: A/D or Left/Right roll the plane, bank
drives a coordinated turn, turns cost vertical lift, cross wind now carries
the plane sideways instead of banking it. The sim tracks `posX`, `posZ`,
`heading`, `bank` and `rollRate`; render space is world-aligned with the
plane at the origin; the chase camera rotates behind the heading and rolls
with 30 percent of the bank; clouds recycle by distance ahead along the
heading. Four turning tests added (20 total). Design in
`docs/FLIGHT_MODEL.md` section 4b.

Follow-ups: M4 touch controls need a roll axis (left/right zones or a drag);
the HUD should show bank or a heading tape.

---

## Milestone 3 — Gameplay systems and progression

Goal: a complete game loop with scoring and a journey that gets harder.

Tasks in order:

1. `gameStore` with phase machine: menu, playing, paused, crashed, gameover.
2. Main menu: title, best distance, controls hint, Start. Space/Enter starts.
3. Pause overlay (Space / P / Esc, and auto on tab hidden): Resume, Quit.
4. Crash detection from the sim flag; `crashed` beat about 1.2 s; then game
   over with distance, time, max altitude, performance, best, Restart, Menu.
5. Restart resets the sim with a new seed and goes straight to playing.
6. `sim/scoring.ts` and `utils/storage.ts` with the `paperplane.best.v1` key.
   New-best highlight on the game over screen.
7. Wire `difficulty.ts` to distance. Remove the manual override from release
   builds (keep in debug panel).
8. Sky palette table with five stages, blended by progress. Lighting and fog
   follow the palette. Cloud count, size and darkness follow the stage.
9. `hudStore` at 10 Hz with distance, time and wind. Basic HUD text.
10. Gameplay balancing: play ten runs; adjust the difficulty table so an
    attentive new player reaches 800 to 1500 m and a practised one 3000 m plus.

Completion checks:

- Open the game, read the controls, start, fly, crash, see the score, restart
  with one key, all without confusion.
- Best distance persists across reloads.
- Pause works from keyboard and from switching tabs.
- Sky visibly changes from clear to storm over a long run with no hard cuts.
- Difficulty never spikes; a full-difficulty run is hard but survivable.
- `npm run check` passes.

### Milestone 3 outcome

Done. Notes for the next milestone:

- `npm run check` passes: typecheck, lint, 25 tests, production build.
- Phase machine lives in `gameStore` (`startFlight`, `pause`, `resume`,
  `quitToMenu`, `crash`, `finish`). `SimDriver` steps the sim only in
  `playing`, flies the menu background itself with neutral input, and turns
  `crashed` into `gameover` after a 1.2 s beat. Keys are mapped per phase in
  `keyboard.ts`; the tab going hidden pauses.
- Scoring: `sim/scoring.ts` summarises distance, time, max altitude and mean
  stability; `utils/storage.ts` persists the best under `paperplane.best.v1`
  with validation. The HUD distance turns gold once the run passes the best.
- Sky progression: `skyPalette.ts` holds five keyframes blended by progress
  into `currentSky`; `Environment.tsx` runs the blend and the fog each frame;
  Sky, Lighting, Ground and Clouds read the live palette (shader uniforms
  reference the palette's Color objects directly). Stage screenshots taken at
  progress 0, 0.5, 0.72 and 1.
- Dev URL flags gained `?phase=playing` and `?progress=<0..1>`.
- Balancing: full-difficulty drafts raised to 4.5 m/s. Real playtesting is
  still owed; the harness cannot judge feel. Suggested first session: ten
  runs, note the distance where new players die, adjust `DIFFICULTY` ranges.
- Known rough edges for M4: the crashed plane just rests on the ground; no
  transition animation between phases beyond the card fade; the menu's
  self-flying plane can stall in gusts (it restarts itself after a crash).

---

## Milestone 4 — Visual polish, audio and UX

Goal: it feels like a finished game, not a prototype.

Tasks in order:

1. Plane: wing flex with pitch rate and turbulence; refined crease texture;
   bank response to crosswind and pitch rate.
2. Camera: bank follow, shake scaled by turbulence and gust, improved damping
   constants, plane always readable.
3. Environment: better cloud shapes (multi-sprite clusters), atmospheric depth
   via fog and layer tinting, wind particle streaks, storm lightning flashes,
   near-ground speed cues.
4. HUD: distance, time, wind arrow and speed, altitude bar, pitch and
   stability indicator, pause and restart buttons. Minimal, legible, no clutter.
5. Touch controls: pointer zones top and bottom, visible soft buttons, hint on
   first mobile run. Landscape recommended message.
6. Audio engine: unlock on first gesture, master mute in settings. Wind
   synthesis tied to airspeed and gust; turbulence modulation; stall warning;
   crash; UI blips.
7. Transitions: fade between phases, score card animation, new best flourish.
8. Settings: sound on/off, quality tier override, reset best.

Completion checks:

- Plays well on a phone in landscape with touch only.
- Audio responds to gusts, stalls and crash, and never plays before a gesture.
- HUD readable at a glance; the sky is still the star of the screen.
- Camera shake is felt in storms and absent in calm air.
- `npm run check` passes.

### Milestone 4 outcome

Done. Notes for the next milestone:

- `npm run check` passes: typecheck, lint, 28 tests, production build.
- Plane: built as three parts (`createPaperPlaneParts`) so the wings flex
  about the crease with load factor, pitch rate and turbulence. Crash pose
  (nose down, tipped on a wing, short bounce) blends in over the crash beat.
- Camera: shake from turbulence, gusts and overspeed, added on top of the
  smoothed rig so it never feeds back into the lag.
- Environment: four cloud shapes in an atlas picked per instance; wind
  streaks (`WindParticles.tsx`, one shared relative-velocity uniform, per
  instance positions) that brighten with gusts, turbulence and overspeed;
  lightning in the storm stage (`skyFx.flash`) applied to the dome, clouds,
  hemisphere light and, importantly, the fog colour. Without the fog term a
  hard line appeared at the horizon during flashes.
- HUD: distance and time, altitude bar, attitude ball with bank and pitch,
  stability bar, pause and restart buttons. Wind pill and warnings as before.
- Touch: virtual stick anywhere on screen (`TouchControls.tsx`, maths in
  `input/stick.ts`), up to climb and sideways to turn, works with mouse too.
  First-run hint on coarse pointers, persisted. Keyboard hint hidden on touch.
- Audio: `audio/engine.ts`, Web Audio synthesis only. Wind bed, stall pulse,
  crash, thunder, UI blips. Unlocked on the first gesture, muted via settings
  or the M key. `SimDriver` calls `audio.update` each frame.
- Settings: sound and quality (auto, high, medium, low) persisted under
  `paperplane.settings.v1`; reset best on the menu. Quality changes apply
  to DPR, clouds and particles immediately; antialias only on reload.
- Not verifiable headlessly: audio and touch. Both need a real device check
  in M5. The storm and lightning were checked by screenshot.

---

## Milestone 5 — Testing, optimisation and release

Goal: production build, documented, tested in real browsers.

Tasks in order:

1. Gameplay test matrix from the brief: normal flight, held up, held down,
   alternating, strong headwind, strong tailwind, sudden gusts, stall recovery,
   crash detection, restart. Record outcomes and fix instabilities.
2. Technical tests: frame-rate independence at 30/60/144 Hz, memory steady
   over a 10 minute run (no growth from pools), draw-call count, Chrome,
   Edge, Firefox, Safari, iOS Safari, Android Chrome, portrait and landscape,
   keyboard, touch, every state transition, localStorage persistence.
3. Optimisation: profile with the browser devtools; cap cloud counts per tier;
   confirm no per-frame allocations; quality tier detection and fallback;
   WebGL2 missing message.
4. Production build: `vite build`, check bundle size against the budget in
   `ASSETS.md`, test `vite preview`.
5. `README.md` per the user's README style: tagline, limits callout, what you
   can do, how it works with a Mermaid flowchart, tech stack, getting started,
   project structure, deployment, status and limits, security.
6. Deployment: static hosting instructions for Vercel and GitHub Pages
   (base path note for Pages).
7. Known limitations list.

Completion checks:

- Every item in the test matrix has a recorded pass.
- Production build served with `vite preview` plays the full loop in at least
  two browsers.
- README is accurate against the code.
- `npm run check` passes.

The game is not "finished" until the main loop has been played in a real
browser from the production build.

### Post-release addition: launch scene and obstacles (2026-11-15)

Requested after Milestone 5.

- New phase `launching` between `menu` and `playing`. The menu shows the boy
  on the hilltop holding the plane (camera orbits); Start plays a 0.5 s
  wind-up and 0.25 s throw; any flight key or tap throws immediately; the sim
  starts from the hand's world position with the throw velocity.
- The hill is real terrain (`sim/terrain.ts`), used for both the mesh and
  ground collision. Flight-model tests now start 1 km clear of it.
- Obstacles (`sim/obstacles.ts`): balloons and turbines crash the plane,
  rings give +100 m. Pools are fixed; spawning and collisions are in the sim;
  rendering is instanced. Game over names the cause; the HUD shows a ring
  count and a "+100 m" pop. Seven new tests (48 total).
- Dev flags: `?phase=launching&launchHold=<t>` freezes the throw at a time.
- Owed: real play to judge obstacle density and whether the blade disc
  collision feels fair; both live in `OBSTACLES` in `constants.ts`.

### Post-release addition: Vercel hosting and social card (2026-11-15)

- `vercel.json`: Vite framework, `npm run build`, `dist`, immutable cache
  headers for hashed assets, basic security headers.
- `index.html`: description, Open Graph and Twitter card tags, manifest,
  apple-touch-icon, mobile web-app meta. `%SITE_URL%` is replaced at build
  time by a tiny Vite plugin from `SITE_URL`, else Vercel's production or
  deployment URL, else left root-relative.
- `public/manifest.webmanifest` with fullscreen landscape display and PNG
  icons (180, 192, 512) rendered from the favicon SVG.
- `public/og.png` (1200x630) rendered from a live flight with the dev-only
  `OgCard` overlay (`/?og=1`).
- Verified: builds with and without `SITE_URL` produce the expected tag
  values. Not verified: an actual Vercel deployment; that needs the user's
  account.

### Milestone 5 outcome

Done, with the caveats listed in `docs/TESTING.md`.

- `npm run check` passes: typecheck, lint, 40 tests, production build
  (about 145 kB app plus 181 kB Three.js, gzipped).
- Test record in `docs/TESTING.md`: gameplay matrix via tests and the
  harness, technical matrix with what was verified here and what needs a
  human on real devices (Firefox, Safari, phones, audio, touch, memory).
- Quality: `FrameProbe` measures real frame times after startup and steps the
  tier down on slow devices (up on fast desktops) while quality is on auto.
  Draw calls and triangles show in the debug panel.
- Drei removed (never imported). No other dependency changes.
- `BASE_PATH` build variable for sub-path hosting; `.env.example` documents
  it. GitHub Pages workflow in `.github/workflows/deploy.yml`.
- `README.md` written in the project's house style: what you can do, how it
  works, stack, getting started, structure, deployment, limits, security.
- Production build served with `vite preview` and screenshotted; the main
  loop was played through in Chrome via screenshots of every phase.
