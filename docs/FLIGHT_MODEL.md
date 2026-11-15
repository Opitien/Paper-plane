# Paper Plane — Flight Model Design

Status: Implemented in Milestone 2 (`src/sim/flight.ts`, `wind.ts`,
`difficulty.ts`). Constants below match `src/sim/constants.ts` after tuning.
Section 12 records what the tuning harness measured.

This is an **arcade** model. It borrows the shape of real aerodynamics so that
behaviour is coherent and emergent, but every constant is chosen for feel, not
realism. All numbers below are starting values and live in `src/sim/constants.ts`.

---

## 1. Why this shape of model

The player has one axis of control: pitch. Everything interesting must come
from how pitch couples to speed, lift and wind:

- Pull up: angle of attack rises, lift rises, the plane climbs, speed drops.
  Keep pulling and the angle of attack passes the stall limit, lift collapses,
  the nose drops.
- Push down: angle of attack falls, the plane dives, speed rises. Keep pushing
  and the plane overspeeds, control gets twitchy and drag spikes.
- Let go: a stabilising moment pulls the angle of attack back toward trim over
  a second or two. Nothing snaps.
- Wind: a headwind raises airspeed (more lift, more drag) without changing
  ground speed; a tailwind does the opposite. Updrafts add energy. Gusts are
  sudden changes in all of this. Turbulence adds pitch noise.

A two-dimensional model in the vertical plane captures all of it.

---

## 2. State

```ts
interface FlightState {
  // Kinematics (world frame, metres, seconds)
  distance: number;        // x, metres travelled forward
  altitude: number;        // y
  vx: number;              // ground velocity, forward
  vy: number;              // ground velocity, vertical
  pitch: number;           // theta, radians, nose-up positive
  pitchRate: number;       // q, rad/s
  bank: number;            // cosmetic roll, radians (from crosswind + pitch rate)

  // Derived each step (for HUD, audio, camera)
  airspeed: number;        // |v - wind|
  angleOfAttack: number;   // alpha = pitch - flightPathAngle (air relative)
  lift: number;
  drag: number;
  stability: number;       // 0..1, HUD indicator
  stalled: boolean;
  overspeed: boolean;

  // Wind (see section 6)
  wind: { horizontal: number; vertical: number; cross: number;
          gust: number; turbulence: number };

  // Bookkeeping
  time: number;            // seconds since start
  maxAltitude: number;
  crashed: boolean;
  progress: number;        // 0..1 difficulty / environment driver
}
```

Input is `pitchAxis` in [-1, 1], already smoothed by the input layer with a
time constant of about 0.12 s so taps feel soft.

---

## 3. Forces

Air-relative velocity:

```
ax = vx - wind.horizontal
ay = vy - wind.vertical
V  = sqrt(ax^2 + ay^2)              // airspeed
gamma = atan2(ay, ax)               // flight path angle (air relative)
alpha = pitch - gamma               // angle of attack
```

Air density falls with altitude to make a soft ceiling:

```
rho(altitude) = max(0.35, 1 - altitude / CEILING_ALTITUDE)     // CEILING_ALTITUDE = 400 m
```

Lift coefficient, linear then collapsing past the stall angle (smooth, no step):

```
CL_linear = CL_ALPHA * alpha                                 // CL_ALPHA = 5.0 per rad
s         = smoothstep(ALPHA_STALL - 0.04, ALPHA_STALL + 0.08, alpha)   // ALPHA_STALL = 0.30 rad (17 deg)
CL        = mix(CL_linear, CL_STALLED, s)                    // CL_STALLED = 0.35
CL        = clamp(CL, -CL_MAX_NEG, CL_MAX)                   // CL_MAX = 1.5, CL_MAX_NEG = 0.8
```

Drag coefficient with induced drag and an overspeed penalty:

```
CD = CD0 + K_INDUCED * CL^2 + overspeedDrag                  // CD0 = 0.06, K_INDUCED = 0.10
overspeedDrag = OVERSPEED_K * max(0, V - V_MAX)^2            // V_MAX = 30 m/s, OVERSPEED_K = 0.002
```

Magnitudes (`K_AERO` stands in for 0.5 * rho0 * wing area):

```
q    = K_AERO * rho * V^2                                    // K_AERO = 0.045
L    = q * CL
D    = q * CD
```

Directions: drag is opposite the air-relative velocity; lift is perpendicular
to it, rotated 90 degrees toward "up" in the vertical plane.

```
ux = ax / V ; uy = ay / V            // unit air velocity (guard V < 0.1)
Fx = -D * ux - L * uy + T * rho
Fy = -D * uy + L * ux - MASS * G     // MASS = 1.0, G = 9.81
```

`T` is the **ambient breeze**, the arcade energy source (see ARCHITECTURE.md,
decision 3). It is tuned so that at cruise, breeze roughly equals drag:

```
T = BREEZE_FORCE                     // starts at 1.5 N; tuned in M2 so trim flight is level
```

Integration (semi-implicit Euler at the fixed step):

```
vx += (Fx / MASS) * dt
vy += (Fy / MASS) * dt
distance += vx * dt
altitude += vy * dt
```

Sanity numbers with the starting constants at cruise `V = 18 m/s`, `rho = 0.85`:
`q ~ 12.4`, level flight needs `CL ~ 0.79`, giving `alpha ~ 0.16 rad (9 deg)`,
about 8 degrees of margin to stall. Lift-to-drag is roughly 6, so with the
breeze off the plane sinks at about 3 m/s. These are the values to check first
when tuning.

---

## 4. Pitch dynamics

Pitch is driven by a moment equation, never set directly.

```
speedFactor  = clamp(V / V_REF, 0, 2)                        // V_REF = 18 m/s
authority    = pitchAxis >= 0 ? AUTHORITY_UP : AUTHORITY_DOWN  // 1.0 up, 1.5 down (rad/s^2)
controlM     = pitchAxis * authority * speedFactor
stabilityM   = -STABILITY_K * (alpha - ALPHA_TRIM) * speedFactor^2   // STABILITY_K = 8.0, ALPHA_TRIM = 0.16 rad
dampingM     = -PITCH_DAMPING * (0.5 + 0.5 * speedFactor) * pitchRate  // PITCH_DAMPING = 3.5
stallM       = stalled ? -STALL_NOSE_DROP * (1 - speedFactor * 0.5) : 0   // STALL_NOSE_DROP = 3.0
turbM        = wind.turbulence * TURB_PITCH_K * noise(t)     // TURB_PITCH_K = 1.2
             + |wind.cross| * CROSS_PITCH_K * noise(t)       // CROSS_PITCH_K = 0.08
flutterM     = overspeed ? OVERSPEED_FLUTTER * noise(t * 7) : 0           // OVERSPEED_FLUTTER = 2.0, ramps in over 5 m/s

pitchRate += (controlM + stabilityM + dampingM + stallM + turbM + flutterM) * dt
pitchRate  = clamp(pitchRate, -MAX_PITCH_RATE, MAX_PITCH_RATE)             // 2.5 rad/s
pitch     += pitchRate * dt
pitch      = clamp(pitch, -PITCH_LIMIT, PITCH_LIMIT)                       // 80 deg
```

What this gives:

- **Nose-up authority is modest on purpose.** With full up input at V_REF the
  trim balance settles near alpha 0.29, just under the stall angle, so a held
  climb does not snap into a stall. Instead the climb bleeds airspeed, the
  speed factor falls, the balance drifts past the stall angle and the stall
  develops after about 2.5 s. Nose-down authority is stronger because a dart
  dives readily and the dive needs to be dangerous.
- **Control authority scales with airspeed.** Slow plane = mushy controls. This
  is what makes stall recovery a real skill: you must let the nose drop and gain
  speed before you can pull out.
- **Stability moment** pulls angle of attack toward trim when the player lets
  go. It is quadratic in speed so a fast plane snaps back harder.
- **Damping** prevents oscillation and makes neutral input feel calm.
- **Stall moment** drops the nose when stalled, regardless of input.
- **Flutter** at overspeed adds shaky pitch noise so a steep dive feels unsafe.

Bank is no longer cosmetic; see section 4b.

---

## 4b. Roll and turning (added after Milestone 2)

The brief was pitch-only; turning was added on request. It is a coordinated
turn driven by bank, and bank is driven by a roll moment, so nothing snaps.

```
rollControlM   = rollAxis * ROLL_AUTHORITY * speedFactor        // ROLL_AUTHORITY = 3.0 rad/s^2
rollStabilityM = -ROLL_STABILITY * bank * speedFactor            // dihedral, ROLL_STABILITY = 4.0
rollDampingM   = -ROLL_DAMPING * rollRate                        // ROLL_DAMPING = 3.0
wingDropM      = stalled ? STALL_WING_DROP * noise(t * 2) : 0    // STALL_WING_DROP = 1.2

rollRate += (rollControlM + rollStabilityM + rollDampingM + wingDropM) * dt
rollRate  = clamp(rollRate, -MAX_ROLL_RATE, MAX_ROLL_RATE)       // 2.5 rad/s
bank     += rollRate * dt ; clamp to +/- BANK_LIMIT              // 70 deg

turnRate  = TURN_GAIN * G * tan(bank) / max(V, TURN_SPEED_FLOOR) // 1.0, 6 m/s
heading  += turnRate * dt
```

Full stick at V_REF settles near 43 degrees of bank and about 24 degrees per
second of turn; a full circle takes roughly 15 s. Only `lift * cos(bank)` acts
in the vertical plane, so a sustained turn sinks at about 1.3 m/s unless the
player adds back pressure. Releasing the stick rolls level within about 2 s
because of the dihedral term. A stalled wing drops randomly.

Ground track:

```
forward = (sin heading, cos heading)      // sim frame: X right, Z forward at heading 0
right   = (cos heading, -sin heading)
pos    += (vx * forward + wind.cross * CROSS_DRIFT * right) * dt   // CROSS_DRIFT = 1.0
distance += |vx| * dt                     // path length; circling still counts
```

Cross wind therefore carries the plane sideways over the ground rather than
banking it. Wind stays expressed in the plane's frame (head/tail, up/down,
cross), so turning does not change the wind the player feels; this keeps the
game from rewarding a permanent downwind heading.

Rendering: render space is world-aligned with the plane at the ground origin.
The plane yaws by heading, the camera rig rotates behind it and rolls with
30 percent of the bank, clouds and ground texture are offset by the plane's
world position, and clouds recycle based on their distance ahead along the
current heading.

---

## 5. Stall and overspeed

Stall enters and exits with hysteresis so it does not flicker:

```
enter stall when alpha > ALPHA_STALL  or  V < V_STALL          // V_STALL = 10 m/s
exit  stall when alpha < ALPHA_STALL - 0.06  and  V > V_STALL + 2
```

While stalled: lift collapses through the CL curve, the stall moment pushes
the nose down, control authority is already low because speed is low. Recovery
is automatic *if there is altitude*: nose drops, speed builds, stability moment
re-trims. The player can shorten recovery by pushing down (gain speed faster)
and then easing up. Pulling up during a stall deepens it.

Pre-stall warning for HUD and audio:

```
stallMargin = clamp((ALPHA_STALL - alpha) / 0.12, 0, 1)     // 1 = safe, 0 = at stall
```

Overspeed:

```
overspeed = V > V_MAX
```

While overspeed: drag penalty grows quadratically, flutter noise shakes pitch,
camera shake and audio ramp up. Pulling up from a fast dive is effective
(high authority) but the extra lift can swing straight into a high-alpha stall
if overdone. This is the intended "unstable dive".

Stability indicator for HUD (0 = bad, 1 = good):

```
speedMargin = clamp((V - V_STALL) / 8, 0, 1) * clamp((V_MAX + 4 - V) / 8, 0, 1)
stability   = stallMargin * speedMargin * (1 - 0.5 * wind.turbulence)
```

---

## 6. Wind system

Wind is a vector with three channels plus two scalars for feedback. All are
driven by difficulty parameters (section 7) and by smooth noise so changes are
gradual, with gusts layered on as events.

```
wind.horizontal = base_h + gust_h               // + tailwind, - headwind
wind.vertical   = base_v                        // + updraft, - downdraft
wind.cross      = base_c                        // cosmetic bank + stability penalty
wind.gust       = |gust envelope| / gustMax     // 0..1 for HUD, audio, camera
wind.turbulence = turbAmp * (0.5 + 0.5 * noise) // 0..1
```

**Base wind** uses 1D value noise with slow frequencies, so direction and
strength drift over tens of seconds:

```
base_h = baseAmp   * noise(t * 0.05  + seedA)          // noise in [-1, 1]
base_v = draftAmp  * noise(t * 0.08  + seedB)
base_c = crossAmp  * noise(t * 0.06  + seedC)
```

**Gusts** are discrete events. A Poisson process with rate `gustRate` schedules
the next gust. Each gust has:

- magnitude: `gustMag * (0.6 + 0.4 * rand)`, sign random with a headwind bias
  that grows with progress (`P(headwind) = 0.5 + 0.3 * progress`)
- envelope: attack 0.3 to 0.6 s, hold 0.4 to 1.0 s, decay 1.0 to 2.0 s, using
  smoothstep ramps
- a vertical component of 30 percent of the magnitude, random sign

**Turbulence** is a high-frequency amplitude `turbAmp` that scales the pitch
noise moment (section 4), adds small random velocity kicks
(`TURB_KICK * turbAmp * noise`), drives camera shake and audio.

Visible feedback (rendering layer, out of scope here): cloud drift speed follows
`wind.horizontal`, wind particle streaks follow the wind vector, plane bank
follows cross wind, HUD arrow shows direction and strength.

---

## 7. Difficulty curve

```
progress = clamp(distance / FULL_DIFFICULTY_DISTANCE, 0, 1)   // FULL_DIFFICULTY_DISTANCE = 5000 m
ease     = progress^1.3                                       // slow start
```

| Parameter | At 0 | At 1 | Interpolation |
|---|---|---|---|
| `baseAmp` (m/s) | 1.5 | 8 | lerp(ease) |
| `draftAmp` (m/s) | 0.8 | 4.5 | lerp(ease) |
| `crossAmp` (m/s) | 0.5 | 5 | lerp(ease) |
| `gustRate` (per s) | 1/25 | 1/5 | lerp(ease) |
| `gustMag` (m/s) | 2.5 | 10 | lerp(ease) |
| `turbAmp` (0..1) | 0 | 1 | smoothstep(0.25, 1, progress) |

Fairness rules:

- Turbulence does not start until about 1250 m, so the first minute teaches
  pitch and gusts only.
- A gust never exceeds `gustMag`, and `gustMag` at full difficulty is still
  below what a trimmed plane at 60 m altitude can survive with a correct reaction.
- No two gusts overlap: the next gust is scheduled only after the current decay
  finishes.
- Difficulty is a function of distance only. It never increases while paused
  and never randomly spikes.

Environment stages share the same `progress`, so weather matches difficulty:

| Distance (m) | Stage | Sky |
|---|---|---|
| 0 to 900 | Clear | Bright blue, few small clouds, high sun |
| 900 to 2000 | Cumulus | More and larger clouds, warmer light |
| 2000 to 3200 | Golden hour | Low sun, orange and pink gradient, long shadows in cloud shading |
| 3200 to 4200 | Overcast | Grey-blue, dense cloud layer, dimmer |
| 4200 and on | Storm | Dark, fast low clouds, occasional lightning flash (M4) |

Stages blend continuously over about 300 m. They are one journey, not levels.

---

## 8. Crash, terrain and obstacles

```
crashed = altitude <= terrainHeight(posX, posZ)      // crashCause 'ground'
```

`terrainHeight` is flat except for the launch hill at the origin: height 68
inside a 22 m flat top, falling along a smoothstep to zero at 170 m. The
hill is deliberately steep and narrow so a plane that sinks a little after
the throw still clears it, while a dive or an immediate full circle does not.

Obstacles (`sim/obstacles.ts`) spawn from 250 m on, one every 230 m at the
start falling to 130 m at full difficulty, 380 to 680 m ahead and up to 170 m
to either side, with a 40 percent chance that a balloon or ring sits in the
plane's corridor. Nothing spawns within 340 m of the hill. Collision shapes:

| Obstacle | Shape | Result |
|---|---|---|
| Balloon | sphere, radius 9 m, drifts with 60 percent of the wind | crash, cause `balloon` |
| Wind turbine | tower (radius 2.4 up to the hub), hub sphere (4.5), blade disc (radius 14, thickness 1.6) facing its spawn heading | crash, cause `turbine` |
| Ring | torus plane: within 9 m of the centre while crossing it | +100 m distance, counted in `ringsCollected` |

The plane's own radius is 1.2 m. Collisions can be disabled
(`simulation.collisions`) for the menu or tests. On crash the sim freezes
its state, the game enters `crashed`, and the scene plays a short settle.

## 8b. Launch

The flight starts from the thrower's hand: `launchFrom` sets the position
from the scene, heading 0, 17 m/s forward, 3 m/s up and pitch 0.26 rad, so
the plane arcs up gently and settles to trim. The hand ends up about 12 m
above the hilltop, which puts the start at the documented 80 m.

---

## 9. Scoring

| Metric | Source | Shown |
|---|---|---|
| Distance (primary) | `distance`, metres, displayed as `1 234 m` or `1.23 km` | HUD, game over |
| Flight time | `time` | HUD, game over |
| Max altitude | `maxAltitude` | game over |
| Flight performance | mean `stability` over the run, 0 to 100 percent | game over |
| Best distance | localStorage key `paperplane.best.v1`, JSON `{ distance, time, maxAltitude, performance, date }` | menu, game over |

---

## 10. Fixed step and interpolation

```
FIXED_DT = 1 / 120
accumulator += min(frameDt, 0.25)
while accumulator >= FIXED_DT:
    previous = copy(state)
    sim.step(FIXED_DT, input)
    accumulator -= FIXED_DT
alpha = accumulator / FIXED_DT
render(lerp(previous, state, alpha))     // position, pitch, bank only
```

With a fixed step the trajectory for a given seed and input sequence is
identical on every machine, which is what the frame-rate independence test
asserts.

---

## 11. Tuning checklist (Milestone 2)

Run these with `npm run tune` (headless harness in `scripts/tune.ts`) and in
the debug panel before calling the physics done:

1. Neutral input, wind off: plane holds altitude within a few metres and
   airspeed settles near `V_REF`.
2. Hold climb from trim: airspeed decays, stall flag within 5 to 8 s, nose
   drops, plane recovers on its own with altitude to spare from 80 m.
3. Hold dive from trim: overspeed flag within 3 to 5 s, flutter visible,
   crash from 80 m in roughly 6 to 10 s.
4. Tap climb for 0.3 s: altitude gain of a few metres, no stall, returns to
   trim within about 3 s.
5. Headwind gust of 8 m/s at trim: airspeed and lift jump, plane balloons up,
   then settles. No stall from the gust alone.
6. Tailwind gust of 8 m/s at trim: airspeed drops, plane sinks, may approach
   stall margin but should not stall without player input at `V_REF`.
7. Full difficulty for 60 s with a skilled hand on the keys: survivable.
8. Full difficulty with no input: crashes within about 30 to 60 s. If it never
   crashes, difficulty is too low; if it crashes under 15 s, it is unfair.

---

## 12. Measured outcomes (Milestone 2, 2026-11-15)

From `npm run tune` with the constants in this document:

| Scenario | Result |
|---|---|
| Neutral, wind off, 30 s | Altitude 78.7 to 80.0 m, airspeed settles at 18.5 m/s |
| Held climb | Gains 6 m, stalls at 2.6 s with airspeed 13.2 m/s, recovers at 3.2 s |
| Held climb, release at stall | Loses 10 m, back at trim within 5 s |
| Held dive | Overspeed at 3.9 s, crash from 80 m at 7.6 s |
| Tap up 0.3 s | Gains under 1 m, returns to trim, no stall |
| Hold up 2 s then release | Gains 6 m, no stall |
| Headwind gust 8 m/s for 2 s | Balloons to 90 m, brief stall when the gust ends, settles |
| Tailwind gust 8 m/s for 2 s | Sinks to 59 m, brief stall, settles |
| Updraft / downdraft 3 m/s | Plus 51 m / minus 54 m over 20 s |
| Full turbulence, no input | Altitude 64 to 85 m, one brief stall in 60 s |
| Full difficulty, no input, 3 seeds | One crash at 84 s, two survive 90 s with 45 to 126 m swings |
| Progress 0, no input, 3 seeds | Never crashes in 120 s, 64 to 90 m band |
| Held right roll 20 s | Bank 43 deg, 485 deg of heading, sinks from 80 to 54 m |
| Held right roll with 35 percent up | Bank 43 deg, 542 deg of heading, sinks to 58 m |

Open balancing item for Milestone 3: at full difficulty a hands-off plane
survives longer than the 30 to 60 s target. Candidates: stronger drafts at
high progress, a slightly lower stability stiffness, or longer gusts. Decide
with real play, not the harness.
