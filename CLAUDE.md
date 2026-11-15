# Paper Plane — project rules

Browser 3D arcade flyer: a paper plane, chase camera, pitch-only control, wind
as the main challenge, distance as the score. Built with React, TypeScript,
Vite, Three.js, React Three Fiber, Drei, Zustand and a custom flight model.

## Read first

- `docs/ARCHITECTURE.md` — layers, stack, state machine, performance plan, decisions
- `docs/FLIGHT_MODEL.md` — physics equations, constants, wind, difficulty, scoring
- `docs/ASSETS.md` — what is procedural and where to swap in real assets
- `docs/MILESTONES.md` — the plan, the completion checks and the outcome of each milestone
- `docs/TESTING.md` — what has been verified, how, and what still needs a human

## Standing instruction for every milestone

Inspect the existing codebase and understand the current implementation before
making changes. Preserve working features. Do not unnecessarily rewrite
existing systems. Implement the milestone incrementally, run the application,
test the changes and fix errors before declaring the milestone complete.
Update the project documentation where necessary.

## Hard rules

- `src/sim/**` imports nothing from `react`, `three`, `@react-three/*` or the DOM.
  It is pure TypeScript and must stay unit-testable.
- Input changes pitch rate and roll rate, never pitch, bank or position
  directly. No instant moves.
- The simulation runs at a fixed step through an accumulator. Never step with
  the raw frame delta.
- Per-frame data never goes through React state. The HUD reads a 10 Hz snapshot.
- Every tunable number lives in `src/sim/constants.ts` (physics) or a clearly
  named constants block at the top of the owning file (rendering, camera).
  No magic numbers inline.
- No new runtime dependency without a row in `docs/ARCHITECTURE.md` section 10.
  No physics engine.
- No allocations inside `useFrame` or `sim.step`. Reuse scratch objects.
- Keep the floating origin: the plane renders at the ground origin, render
  space stays world-aligned, the world moves.

## Conventions

- TypeScript strict. Named exports. One component per file.
- Units: metres, seconds, radians in the sim. Convert for display only.
- Pitch positive = nose up. Bank positive = right wing down = turning right.
  Heading positive = turned right. Wind horizontal positive = tailwind.
  Vertical positive = updraft. Cross positive = pushes the plane right.
- Keyboard: W / ArrowUp climb, S / ArrowDown descend, A / ArrowLeft roll
  left, D / ArrowRight roll right, Space / P / Escape pause, Space / Enter
  confirm, R restart, M mute. Always `preventDefault` on Space and arrows.
- Touch and mouse drag: virtual stick anywhere on screen.
- Audio is synthesised in `src/audio/engine.ts`; no audio files. Every method
  is a no-op until the first user gesture unlocks the context.
- Debug panel toggles with the backtick key and is excluded from the HUD by default.

## Before declaring any milestone done

```
npm run check      # typecheck + lint + test + build
npm run dev        # play the completion checks in docs/MILESTONES.md in a real browser
```

Then update `docs/MILESTONES.md` status and any doc whose decision changed.
