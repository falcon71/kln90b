# NaN satellite azimuth (#456) and harness position lag (#457) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The unit's GPS solution survives one satellite with a NaN azimuth, and the flight harness gives every SimVar
read the aircraft position of its exact sim time.

**Architecture:** #456 filters satellites with non-finite `[zenith, azimuth]` where the in-use list is built (`Gps.updateSolution`,
`predictRaim`), so the PRN list and the coefficients stay row-aligned. #457 adds a test-only read hook to `FakeSim`;
`Flight` uses it to integrate the aircraft from the last physics time up to `Date.now()` before any read.

**Tech Stack:** TypeScript, `@microsoft/msfs-sdk`, Vitest (unit, render, flight stages).

**Spec:** `docs/superpowers/specs/2026-11-02-nan-azimuth-and-harness-lag-design.md`

## Global Constraints

- One commit per issue, each with its test and doc changes: `fixes #456 …` and `fixes #457 …`, ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `target: es2017`: no newer runtime features in `kln90b/`.
- American English in comments; no counts in prose for collections that grow.
- No new circular dependencies (`npm run build` prints the existing ~18 warnings, no more).
- Never push.

## Review Focus

- A satellite with a finite zenith but NaN azimuth (the only case the SDK produces): dropped, not just a NaN zenith.
- The dropped satellite must also be missing from the PRN list the measurement strategy gets, or the simulated
  receiver maps the wrong satellite's error onto each row.
- A valid solution after the drop must have a finite `hdop` (no NaN leaking into a "valid" solution): asserted in the
  Task 1 render test.
- `FakeSim.reset()` must drop the hook, because one `FakeSim` serves every unit booted in a test file: a stale hook
  would move a dead flight's aircraft on the next test's reads.
- `teleport` and `jump` must not let the catch-up integrate over time that passed before them from the new position.

---

### Task 1: Drop satellites with non-finite angles (#456)

**Files:**
- Modify: `kln90b/Gps.ts` (`updateSolution`, around line 369)
- Modify: `kln90b/GpsSolution.ts` (`predictRaim`, around line 244; doc comment of `computeGeometry` at line 76)
- Test: `test/unit/GpsSolution.test.ts` (`describe('predictRaim')`), `test/render/GpsMeasurement.test.ts`

**Interfaces:**
- Produces: `export function hasFiniteAngles(position: ReadonlyFloat64Array): boolean` in `kln90b/GpsSolution.ts`
  (true when both `position[0]` and `position[1]` are finite). Both callers use it.

- [ ] **Step 1: Write the failing unit test** in `describe('predictRaim')`:

```ts
// #456: the SDK's acos can round past ±1 for a satellite exactly due north or south and give a NaN azimuth. That
// satellite is left out; the others still predict RAIM
it('leaves out a satellite whose azimuth is NaN (#456)', () => {
    const satellites = stubSatellites(RAIM_ENROUTE_NOT_APPROACH);
    const broken = stubSatellites([[30, 0]])[0];
    broken.position.get()[1] = NaN;
    expect(predict(stubContext([...satellites, broken]), 2)).toBe(true);
});
```

Check first that `predict(stubContext([...satellites, broken]), 2)` is `false` without the fix (it must be, since the
NaN row poisons the matrix); if the stub's PRN numbering collides, give `broken` a distinct `prn`.

- [ ] **Step 2: Write the failing render test** in `test/render/GpsMeasurement.test.ts`, next to "the measurement gets
  the solution, its satellites and the altitude input". Boot as that test does (`RecordingMeasurement`, `altitudeFt:
  3000`), settle, pick the first in-use satellite, and make its position read NaN in the azimuth:

```ts
const position = new Float64Array([inUse[0].position.get()[0], NaN]);
vi.spyOn(inUse[0].position, 'get').mockReturnValue(position);
await vi.advanceTimersByTimeAsync(1000);

expect(gps.solution.valid).toBe(true);
expect(gps.solution.satellites).toBe(inUse.length - 1);
expect(Number.isFinite(gps.solution.hdop)).toBe(true);
expect(measurement.last!.prns).toEqual(inUse.slice(1).map(sat => sat.prn));
```

Precondition assertion before the spy: `inUse.length >= 5`, so four good satellites remain.

- [ ] **Step 3: Run both, expect FAIL**

Run: `npx vitest run test/unit/GpsSolution.test.ts test/render/GpsMeasurement.test.ts`
Expected: the two new tests fail (`false` instead of `true`; `valid` false).

- [ ] **Step 4: Implement.** Add `hasFiniteAngles`; in `Gps.updateSolution` `continue` past an in-use satellite whose
  position fails it (before it touches `solutionPrns`/`solutionInputs`); in `predictRaim` push only satellites that
  pass it. Comment both with `#456` and the reason (SDK `applyProjection` acos rounding). Mention in the
  `computeGeometry` doc comment that callers pass only finite angles.

- [ ] **Step 5: Run the tests, expect PASS**, then the whole suite and the type check

Run: `npx vitest run test/unit/GpsSolution.test.ts test/render/GpsMeasurement.test.ts`, then `npx tsc --noEmit`, then `npm test`
Expected: all green.

- [ ] **Step 6: Verify the test bites.** Remove the filter from `updateSolution` only: the render test fails and the unit
  test stays green; restore, then remove it from `predictRaim` only: the unit test fails. Restore; `git diff` shows only
  the intended changes.

- [ ] **Step 7: Commit**

```bash
git add kln90b/Gps.ts kln90b/GpsSolution.ts test/unit/GpsSolution.test.ts test/render/GpsMeasurement.test.ts
git commit -m "fixes #456 leave out a satellite whose azimuth is NaN" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: The harness integrates the aircraft up to each read (#457)

**Files:**
- Modify: `test/harness/sim/FakeSim.ts` (`get`, `reset`)
- Modify: `test/harness/flight/Flight.ts` (`installLoops`, `jump`, `teleport`, `everySecond`, `PHYSICS_STEP_MS` comment)
- Modify: `test/flight/harness/flight.test.ts`, `test/flight/flights/simulatedGps.test.ts`, `test/README.md` (the
  "16 Hz loops" bullet)

**Interfaces:**
- Produces: `FakeSim.beforeRead: (() => void) | null` (public field, default `null`), called at the start of
  `FakeSim.get` (every read path, `readReg` included, goes through `get`), and set back to `null` by `reset()`.
- Produces (private to `Flight`): `catchUp(): void` integrates the aircraft from `lastPhysicsMs` to `Date.now()` with
  the bank last commanded (a new field `commandedBankDeg`, initially 0), writes it to the sim, sets `lastPhysicsMs`,
  and returns at once if no time has passed or a catch-up is already running (a `catchingUp` flag).

- [ ] **Step 1: Make the pin a plain test.** In `test/flight/harness/flight.test.ts` turn
  `it.fails('is the position of the aircraft at that sim time (#457)'` into `it(…)` and delete the control test "is
  at most one physics step old" with its comment above; rewrite the comment above the remaining test to say what it
  holds (the position a tick reads is the aircraft's at that tick's sim time), with `#457`.

- [ ] **Step 2: Run it, expect FAIL**

Run: `npx vitest run --project flight test/flight/harness/flight.test.ts`
Expected: the #457 test fails with a maximum error above 0.5 m.

- [ ] **Step 3: Implement the hook and the catch-up.** In `FakeSim` add the field and call it first in `get`. In
  `Flight.installLoops` set `this.sim.beforeRead = () => this.catchUp()`; the 16 Hz interval calls `catchUp()` and then
  stores `commandedBankDeg = this.pilot.commandedBank(…)`. Call `catchUp()` at the start of `everySecond`, `jump` and
  `teleport` (so those start from the aircraft at the current time and do not integrate earlier time from the new
  place). Update the `PHYSICS_STEP_MS` comment: 16 Hz now only paces the pilot's bank command; the position follows
  each read.

- [ ] **Step 4: Add the edge tests.**
  - `test/unit/harness/fakes.test.ts`: `it('reset() drops the beforeRead hook (#457)')`: set a `vi.fn()` hook, `get`
    a variable (called once), `reset()`, `get` again (still called once).
  - `test/flight/harness/flight.test.ts`: `it('teleport puts the aircraft where it is told, at once (#457)')`: fly 10 s
    with `ManualPilot`, advance the clock 30 ms with `vi.advanceTimersByTimeAsync(30)` so time has passed since the last
    physics step, `teleport(p)`, then read `PLANE LATITUDE`/`LONGITUDE` from `flight.sim` with no time passing:
    distance to `p` below 0.01 m.

- [ ] **Step 5: Run the harness tests, expect PASS**

Run: `npx vitest run --project flight test/flight/harness/flight.test.ts` and `npx vitest run test/unit/harness/fakes.test.ts`
Expected: green, maximum error below 0.5 m.

- [ ] **Step 6: Measure and tighten the no-jump bound.** In `simulatedGps.test.ts` "does not jump when satellites
  leave", log the maximum `errorStepM(..., s => s.gps)` from `loss - 5` on (temporary `console.log`), run the test,
  and set the bound to that maximum plus about 0.5 m, rounded up to 0.5 m, aiming at the issue's ~2 m. If the maximum
  is above 2 m, keep the measured value plus margin and say so in the report. Replace the #457 remarks in the comment
  above the loop and in the file's header comment with the measured value and date (2026-11-02). Remove the log.

- [ ] **Step 7: Update `test/README.md`**: the "16 Hz loops" bullet says the aircraft is integrated up to the time of
  every SimVar read (`FakeSim.beforeRead`), so position and sim time agree; the 62 ms rate still holds for the pilot's
  bank command and the instrument's own 16 Hz loop.

- [ ] **Step 8: Run everything**

Run: `npx tsc --noEmit`, then `npm test`
Expected: all green. If another flight test's bound now fails, stop and report it (value before/after), do not loosen
it silently.

- [ ] **Step 9: Verify the test bites.** Comment out the `beforeRead` assignment: the #457 test fails and the no-jump
  test fails or comes within its margin; report which. Restore; `git diff` shows only the intended changes.

- [ ] **Step 10: Commit**

```bash
git add test/harness/sim/FakeSim.ts test/harness/flight/Flight.ts test/flight/harness/flight.test.ts test/unit/harness/fakes.test.ts test/flight/flights/simulatedGps.test.ts test/README.md
git commit -m "fixes #457 integrate the aircraft up to the time of each SimVar read" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
