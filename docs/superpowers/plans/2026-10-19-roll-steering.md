# Roll steering rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `RollSteeringController` with one continuous control law that steers on the path `NavCalculator`
navigates. It fixes #373 and #403 first in the old controller, then #100 with the new law, and finally sets
`GPS COURSE TO STEER` to 0 without a heading input (references #143).

**Architecture:**
- `NavCalculator` publishes the path it steers on (`NavPageState.steeringPath`).
- A pure function `rollSteeringCommand` (new module `kln90b/services/RollSteeringLaw.ts`) runs XTK → 30 s look-ahead
  intercept → course to steer → 1.25 × track error → bank capped at 25°. It adds a feed-forward bank on curved paths
  and a turn-direction latch.
- `RollSteeringController` becomes a thin 1 Hz wrapper: gates, the self-test pattern, outputs.
- Baseline flights are measured on the old controller before the rewrite, and the rewrite's flight tests assert it is
  not worse.

**Tech Stack:** TypeScript (target es2017), `@microsoft/msfs-sdk` (`GeoCircle`, `NavMath`, `FlightPathUtils`), Vitest
(unit, render, flight stages).

**Spec:** `docs/superpowers/specs/2026-10-19-roll-steering-design.md`. Read it before any task. The trainer evidence
is in the session scratchpad report
`C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\a1245638-ed9b-423d-a093-b1ecaee821d7\scratchpad\trainer\report.md`
(Task 1 turns it into a committed record).

## Global Constraints

- **Branch.** The integration branch is `roll-steering-design` (the spec is already committed there). Every task runs
  in a fresh worktree whose first command is `git merge --ff-only roll-steering-design`. If `node_modules` is
  missing, make it a junction to `E:\msfs\kln90b\node_modules` (PowerShell `New-Item -ItemType Junction`).
  - Never remove a worktree yourself.
  - If you must remove a junction, use `powershell -NoProfile -Command "(Get-Item -LiteralPath '<wt>\node_modules').Delete()"`,
    check that it is gone, and STOP if it is not.
  - No `git stash`, no `git worktree prune`, no push, no GitHub writes.
- **One commit per task**, with the message the task gives (American English) and the attribution trailer your
  environment gives you. The test and doc changes of that issue go in the same commit.
- **Before the commit:** `npm test` (the FULL suite), `npx tsc --noEmit` and `npm run build` all pass. Expected-fail
  pins of other issues stay expected-fail. A `tsc` false positive about `registerInstrument` inside a junction
  worktree is reported, not fixed.
- **Vehicles.** Apply the fix once and run the full suite before writing new tests. Every test outside the ones the
  task names that changes result is a vehicle. Report it and update it in the same commit, with a comment saying why.
- **Verify every new test** by reintroducing the bug it guards (README section 5) and seeing it fail, then restore and
  check `git diff`.
- **Labels (test/README.md section 5).**
  - A trainer fact is cited as "checked in the KLN 89 trainer, 2026-10-19", and only for what the 2026-10-19 block of
    `docs/kln89-trainer-record.md` literally records.
  - A maintainer decision is cited as "(the maintainer's decision, 2026-10-19)" in a comment.
  - The framework is cited by file (`autopilot/lnav/LNavRollSteerComputer.ts`).
  - The LVar and SimVar tests are public-contract tests (comment source: `LVars.ts`, the wiki page Autopilot).
  - What only the old code does is `(characterization)`.
- **Copyright.** Manuals and the GAMA publication are cited by page, never quoted or tabulated.
- **Code rules (CLAUDE.md).**
  - Services keep no mutable state: it lives on `NavPageState` and is reset in `VolatileMemory.reset`.
  - Angles are true.
  - Bank is positive left.
  - Comments cite their source.
  - No counts in prose for things that grow.
  - No new circular imports: `npm run build` lists them, and the count must not rise.
- **Public contract.** `L:KLN90B_RollCommand`: name, degrees, left positive, within ±30. `GPS WP DESIRED TRACK` is
  untouched. `GPS COURSE TO STEER` changes only as Tasks 5 and 6 say.
- **Report.** Write `.task-report.md` at the root of your worktree with a Bash heredoc (never committed). It holds:
  - the commit sha and the files changed;
  - for each test added, the bug reintroduced and the result;
  - the vehicles;
  - a label audit: each `describe`/`it` added or touched, spec or characterization, and its citations;
  - the full-suite totals.

## Review Focus

Each line is an input or condition no scenario of the spec covers but a user will meet. Its test is added to the
named task.
1. **A Direct To while the turn latch is set.** The latch belongs to the path it was set on and must not decide the
   first turn on the new path. The test goes in Task 5.
2. **Ground speed dropping below 5 kt mid-turn** (landing roll, slew). The command is 0 and the latch is cleared, so a
   later takeoff starts fresh. The test goes in Task 5.
3. **A power cycle while latched or in a turn.** `VolatileMemory.reset` clears the latch and the steering path is
   rebuilt by the next `NavCalculator` tick. The test goes in Task 5.
4. **The aircraft near the center of a DME arc** (XTK about −R, where the closest point on the circle is
   ill-defined). The command must be finite, toward the arc, with no NaN in either output. The test goes in Task 5.
5. **The turn-circle fallback at its boundary** (|XTK| about R). Once the fallback is taken for a turn, it is kept
   until that turn ends, so the command cannot chatter between the circle and the next leg. The test goes in Task 5.

---

### Task 1: Record the trainer check of 2026-10-19

**Files:**
- Modify: `docs/kln89-trainer-record.md` (append a block)

**Interfaces:** Produces the citation "checked in the KLN 89 trainer, 2026-10-19" that later tests use.

- [ ] **Step 1: Append a `**2026-10-19**` block** in the style of the existing blocks. Paraphrase the scratchpad
  report in your own words: method (1 Hz OCR series, OBS geometry), each experiment's key numbers, the derived law
  `atan(XTK / (GS × 30 s))` capped at 45°, the ~27 s XTK halving, the roll-in at ~50 s of closure, turns limited near
  25° bank, the 200° reversal toward the course with no direction change, the snapping Direct To. Also record the
  caveat that the moving aircraft is the trainer's own model, and the slow build-up and 4–7 s turn delay as probably
  the model's. Name what was left behind (FPL 0, SET 4 turn anticipation on).
- [ ] **Step 2: Commit** `Record the KLN 89 trainer's route tracking check of 2026-10-19 (references #100)`. No tests
  are needed, so the full suite is not required.

### Task 2: fixes #373 — steer on the path `NavCalculator` uses

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState`)
- Modify: `kln90b/data/navdata/NavCalculator.ts`
- Modify: `kln90b/services/RollSteeringController.ts:58-65`
- Test: `test/flight/flights/duplicateWaypoint.test.ts`
- Test: `test/render/services/RollSteeringController.test.ts`

**Interfaces:**
- Produces `NavPageState.steeringPath: GeoCircle | null = null`. Doc comment: the path XTK is measured on, which roll
  steering follows; null when there is nothing to steer on.
- `NavCalculator` sets it to `legPath` after the #120 block (line ~128), every tick. It sets it to null:
  - in the self-test branch;
  - in `setFlag()`;
  - in the `incoming === null` branch.
- In this task it is never the turn circle (spec section 5, item 2).

- [ ] **Step 1: Write the failing flight test** in `duplicateWaypoint.test.ts`:
  `it('turns back onto the extended course past ABC and holds it (#373)')`.
  - FPL 0 KAAA, ABC, ABC with the coupled autopilot.
  - Fly until past ABC (the active leg is ABC → ABC).
  - `flight.jump`, or `ManualPilot` then `coupledAutopilot`, to put the aircraft 1 NM right of the extended KAAA–ABC
    course with the course's track.
  - Fly 240 s, then assert:
    - the first command with |roll| ≥ 2° after the displacement is positive (left, toward the course);
    - over the last 60 s, max |`crossTrackNm(position, abc, finalCourseDeg(kaaa, abc))`| < 0.1.
  - Spec source: the #120 behavior is the 2026-10-14 trainer check (the unit keeps the incoming course); roll steering
    follows XTK.
- [ ] **Step 2: Write the failing render test** in `RollSteeringController.test.ts`:
  `it('is 0 and GPS COURSE TO STEER 0 with KAAA, KAAA, where there is no DTK (#373)')`.
  - FPL 0 KAAA, KAAA, heading input on, the aircraft 2 NM from KAAA at 120 kt.
  - Precondition: `nav.desiredTrack === null` and `nav.xtkToActive === null`.
  - Assert: `lastWrite('L:KLN90B_RollCommand').value === 0` and `lastWrite('GPS COURSE TO STEER').value === 0`.
- [ ] **Step 3: Run both and see them fail.** `npx vitest run test/flight/flights/duplicateWaypoint.test.ts` and
  `npx vitest run test/render/services/RollSteeringController.test.ts`.
- [ ] **Step 4: Implement.**
  - Add the field.
  - Set it in `NavCalculator` as above.
  - In `RollSteeringController.tick`, replace `fromLeg` with `nav.steeringPath`. A null path or a null
    `nav.xtkToActive` gives `setOutput(null, null)` and `arcController.reset()`. The GS < 5 gate stays.
  - Keep `nav.desiredTrack!` as the DTK. #403 is Task 3.
- [ ] **Step 5: Run the two files, then the full suite, tsc and the build.** The `#100` pins stay expected-fail.
- [ ] **Step 6: Commit** `fixes #373 steer on the path NavCalculator uses, and give no command without one`.

### Task 3: fixes #403 — the DTK in OBS mode

**Files:**
- Modify: `kln90b/services/RollSteeringController.ts`
- Test: `test/render/services/RollSteeringController.test.ts`

**Interfaces:** Consumes `NavPageState.steeringPath` (Task 2).

- [ ] **Step 1: Write the failing render tests** in a new
  `describe('L:KLN90B_RollCommand in OBS mode (#403)')`.
  - Boot with `panelXml({...HEADING_INPUT, ...NO_OBS})` and magvar 0, 10 NM before ABC on the standard route.
  - Enter OBS (`unit.panel.obsMode()`). The OBS course becomes the leg's, about 051 true; assert that with
    `modeController.getObsTrue()` in a sibling setup test.
  - `it('banks left and steers 45 degrees left of the course from 2 NM right, parallel (#403)')`: 2 NM right, track =
    OBS course, 120 kt. Assert `roll > 0` and `angleDiff(cts, obsTrue)` within 0.5 of −45.
  - `it('banks right and steers 45 degrees right of the course from 2 NM left, converging at 30 degrees (#403)')`: 2 NM
    left, track = OBS + 30. Assert `roll < 0` and `angleDiff(cts, obsTrue)` within 0.5 of +45.
  - Source comment: the 45° intercept from far off, checked in the KLN 89 trainer, 2026-10-19 (OBS and Leg steering
    looked alike). Both geometries avoid the #100 case-1 bug, and the new law of Task 5 gives the same values (L = 1 NM
    at 120 kt, `atan(2)` > 45°).
- [ ] **Step 2: Run, see them fail** (the course to steer lies around 000).
- [ ] **Step 3: Implement.** The DTK passed to `updateBankAngle` is
  `nav.desiredTrack ?? path.bearingAt(path.closest(position, cache))`. With a non-null path, `desiredTrack` is null
  only in OBS mode. The comment says so and cites #403.
- [ ] **Step 4: Run the file, the full suite, tsc and the build.**
- [ ] **Step 5: Commit** `fixes #403 roll steering in OBS mode steers on the OBS course`.

### Task 4: Measure the baseline (references #100)

**Files:**
- Create: `test/flight/flights/rollSteering.test.ts`
- Modify: `test/flight/flights/dmeArc.test.ts` (the arc-end metric)
- Modify: `docs/superpowers/specs/2026-10-19-roll-steering-design.md` (an appendix "Baseline, 2026-10-19")

**Interfaces:** Produces, local to `rollSteering.test.ts`:
- `interface Metrics { firstBankSign: 1 | -1 | 0; reversals: number; overshootNm: number; maxXtkEstablishedNm: number; captureS: number | null }`
- `async function flyScenario(s: Scenario): Promise<Metrics>`

Definitions (against the target leg, using `crossTrackNm` from `flight/geo.ts`, positive right):
- `firstBankSign`: the sign of the first `L:KLN90B_RollCommand` with |value| ≥ 2° after the scenario's start event
  (the placement, or the DTK switch for turns).
- `reversals`: sign changes between successive commands with |value| ≥ 2° while the aircraft's track is more than 90°
  off the target course.
- `overshootNm`: the largest cross-track on the far side after the first crossing of the target leg (0 without a
  crossing).
- `captureS`: the first time |XTK| < 0.1 NM, or null within the scenario's timeout.
- `maxXtkEstablishedNm`: the max |XTK| after capture until the end.

The scenarios (spec section 6). Invented facilities, built with `pointFrom` and `World`:
- S1/S2: parallel 5 NM left / right, 120 kt.
- S3: parallel 2 NM right, 240 kt.
- S4: parallel 0.5 NM right, 120 kt.
- S5: converging 60° from 1.6 NM left, 120 kt.
- S6: the active leg behind, 0.3 NM right, 120 kt.
- S7: the active leg behind, on it, 120 kt.
- S8a–f: anticipated turns of 35° (the standard route at ABC), 90° and 150°, each at 120 and 240 kt.
- S9: a Direct To to a waypoint 10 NM away, 120° right of the track.
- S10: turn anticipation starting while still on a 45° intercept more than one turn radius inside the turn.
- The arc-end turn: extend `dmeArc.test.ts`'s 326da1a test with the overshoot past the ARCEN–FAFAA leg (the #100
  comment measured 0.65 NM).

- [ ] **Step 1: Write the scenario runner and one `it` per scenario** titled
  `'<scenario> (baseline, characterization, #100)'`.
  - Each flies, computes `Metrics` and asserts each metric against the value measured in Step 2, with a margin of
    10% or 0.02 NM / 2 s, whichever is larger.
  - `reversals` and `firstBankSign` are exact.
  - A scenario that never captures asserts `captureS === null`.
- [ ] **Step 2: Run on the code after Task 3**, read the metrics (log them in the test's failure message while
  tuning), and fill the literals.
- [ ] **Step 3: Write the appendix table** into the spec: scenario, metrics, the date, and the commit it was measured
  on.
- [ ] **Step 4: Full suite, tsc, build.**
- [ ] **Step 5: Commit** `references #100 measure the roll steering baseline flights`.

### Task 5: fixes #100 — the new control law

**Files:**
- Create: `kln90b/services/RollSteeringLaw.ts`
- Rewrite: `kln90b/services/RollSteeringController.ts`
- Modify: `kln90b/data/navdata/NavCalculator.ts` (the turn-circle selection)
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (`TurnStackEntry`)
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState`, `reset`)
- Test: `test/unit/services/RollSteeringLaw.test.ts` (new)
- Test: `test/render/services/RollSteeringController.test.ts`
- Test: `test/flight/flights/rollSteering.test.ts`
- Test: `test/flight/flights/turnDirection.test.ts`
- Test: `test/flight/flights/dmeArc.test.ts`
- Docs: `docs/architecture.md` (the `RollSteeringController` paragraph, lines ~502-509)

**Interfaces:**

```ts
// RollSteeringLaw.ts
export type TurnLatch = 'left' | 'right' | null;
export interface RollSteeringCommand { bankAngle: Degrees; courseToSteer: Degrees; latch: TurnLatch }
export function rollSteeringCommand(path: GeoCircle, position: LatLonInterface, groundspeed: Knots,
                                    trackTrue: Degrees, latch: TurnLatch): RollSteeringCommand;
export const LOOK_AHEAD_TIME: Seconds = 30;      // trainer record 2026-10-19
export const MAX_INTERCEPT_ANGLE: Degrees = 45;  // trainer record 2026-10-19
export const BANK_GAIN = 1.25;                   // LNavRollSteerComputer.getDesiredBankAngleForTrack
export const TURN_LATCH_ANGLE: Degrees = 150;
```

- `NavPageState.rollSteeringLatch: {turn: 'left' | 'right', path: GeoCircle} | null = null`. It is reset to null in
  `VolatileMemory.reset`. The controller passes `latch.turn` only when `latch.path === nav.steeringPath`.
- `TurnStackEntry` gains `public steerOnPathForDtk = false`. Once set, it is kept until the entry pops.
- `NavCalculator`, at the end of `tick()` before `setOutput()`: `nav.steeringPath = this.steeringPath(legPath)`.
  This replaces Task 2's assignment after the #120 block, so a turn pushed in this tick is steered in this tick.
  - With an empty stack, the private `steeringPath(legPath: GeoCircle): GeoCircle` returns `legPath`.
  - Otherwise it uses `const turn = turnStack[0]` and decides the fallback: if
    `|turn.path.distance(position)| > FlightPathUtils.getTurnRadiusFromCircle(turn.path)`, it sets
    `turn.steerOnPathForDtk = true`.
  - It then returns `turn.steerOnPathForDtk ? turn.pathForDtk : turn.path`.
  - The null cases of Task 2 stay.

The law, in order (spec section 4B):
1. `xtk` is the signed distance in NM (positive right).
2. `dtk = path.bearingAt(path.closest(position))`.
3. `L = groundspeed × LOOK_AHEAD_TIME / 3600` NM.
4. `intercept = min(45, atan(|xtk| / L))`.
5. `cts = dtk − sign(xtk) × intercept`.
6. `e = cts − track`, wrapped to (−180, 180].
7. The turn:
   - If `|e| > TURN_LATCH_ANGLE`, the turn is the latch when it is set. Otherwise it is the shorter turn from the
     track to the bearing toward the path, `dtk − 90` when `xtk > 0`, `dtk + 90` when `xtk < 0`, or the shorter way
     of `e` when |xtk| < 0.01 NM. The latch is set to that turn.
   - Otherwise the latch is cleared and the turn is the sign of `e`.
8. The track bank is `min(BANK_GAIN × |e|, MAX_BANK_ANGLE)` in that direction.
9. For a non-great-circle path, add `k × NavMath.bankAngle(groundspeed, R_m)` in the circle's direction:
   - `R_m` is the radius in meters, from `FlightPathUtils.getTurnRadiusFromCircle` and `getTurnDirectionFromCircle`;
   - `k = max(1 − |xtk| / R25, 0)`, where `R25` is `NavMath.turnRadius(groundspeed, MAX_BANK_ANGLE)` in NM.
10. Clamp to ±`MAX_BANK_ANGLE`.

- [ ] **Step 1: Write the unit tests** `RollSteeringLaw.test.ts`. Expectations are derived by hand from the formulas
  above, with literal values and comments showing the arithmetic. The path is the great circle due north through
  (0, 0) unless noted.
  - 0.1 NM right, 120 kt, track 000: `courseToSteer` 354.29, `bankAngle` +7.14 (`1.25 × atan(0.1)`).
  - 0.1 NM left, 120 kt: 5.71 and −7.14.
  - 0.1 NM right, 240 kt: L = 2 NM, `bankAngle` +3.58.
  - 10 NM right, 120 kt: `courseToSteer` 315.00 exactly (the cap), `bankAngle` +25.
  - On the path, track 000: 0 and 000.
  - Latch set: 0.3 NM right, track 180. `atan(0.3)` = 16.70, `cts` = 343.30, `e` = 163.3 > 150. The path lies west,
    so the shorter turn from 180 toward 270 is right. Expect `bankAngle` −25 and latch `'right'`.
  - Latch held: 0.3 NM left, track 190, latch `'right'`. `cts` = 16.70, `e` = −173.3, whose shorter way is left.
    Expect −25 and latch `'right'`.
  - The same without a latch: +25.
  - Latch cleared: `|e|` < 150 returns latch null.
  - Curved path: a left circle of radius 1 NM, the aircraft on it with the tangent track, 120 kt. `bankAngle` is
    `atan(v² / (g × R))` with v = 120 × 1852 / 3600 m/s, g = 9.80665, R = 1852 m, that is +11.85 (within 0.05). The
    right-hand circle (`reverse()`) gives −11.85.
  - Curved path far off: 3 NM outside the 1 NM circle gives k = 0, so no feed-forward (pure track bank).
- [ ] **Step 2: Run, see them fail** (module missing).
- [ ] **Step 3: Implement `RollSteeringLaw.ts`.** Comments cite the trainer record, the framework files and the spec.
  Where code is adapted from the framework, keep its MIT notice line.
- [ ] **Step 4: Run the unit tests green.**
- [ ] **Step 5: Write the render tests** for Review Focus 1-5 in `RollSteeringController.test.ts`:
  - `it('a Direct To clears the turn latch of the old path')`: set the latch with the active leg behind, then
    `directTo` a waypoint ahead to the left. The first command is left.
  - `it('is 0 below 5 kt and clears the latch (2-70)')`.
  - `it('a power cycle clears the turn latch')`.
  - `it('gives a finite command toward the arc near its VOR')`: `arcWorld`, the arc leg active, the aircraft 0.5 NM
    from ABC. Both outputs are finite, and the bank turns toward the arc.
  - `it('keeps the next-leg fallback once taken until the turn ends')`: in a flight or render setup with the stack
    pushed while |XTK to the circle| > R, assert `steerOnPathForDtk` stays true while the aircraft crosses back within
    R.
  - Change `is -30 degrees, the cap` to `is 25 degrees, the cap` with the comment "the wiki range is ±30; the
    command now peaks at MAX_BANK_ANGLE (the maintainer's decision, 2026-10-19)".
  - Re-derive `is 25 degrees on a 45 degree intercept` (still 25).
  - Turn the #100 `it.fails` into `it`, keeping the title.
- [ ] **Step 6: Update the flight tests.**
  - `turnDirection.test.ts`: the #100 pin becomes `it`.
  - `rollSteering.test.ts`: retitle each scenario `'<scenario> (#100)'` and assert:
    - `reversals === 0` everywhere;
    - `firstBankSign` toward the path or into the turn;
    - `overshootNm` and `maxXtkEstablishedNm` ≤ the baseline literals of the appendix;
    - for S1–S3, the trainer checks (checked in the KLN 89 trainer, 2026-10-19): the max |track − DTK| while closing
      lies in [40, 45.5]°, and the time for |XTK| to halve inside L (0.5 → 0.25 NM at 120 kt, 1.0 → 0.5 NM at 240 kt)
      lies in [20, 35] s;
    - the capture time is logged, not bounded against the baseline (the maintainer's decision, 2026-10-19).
  - S10 asserts the fallback was taken and no wrong-way bank.
  - `dmeArc.test.ts`: the arc-end overshoot ≤ the baseline.
  - If a bound cannot be met, report the numbers. Do not loosen the bound.
- [ ] **Step 7: Rewrite `RollSteeringController`.**
  - Keep the self-test and the `setOutput` heading-input gate. `GPS COURSE TO STEER` is still written without a
    heading input in this task.
  - The tick: no path, GS < 5 or null XTK gives `setOutput(null, null)` and clears the latch. Otherwise call
    `rollSteeringCommand`, store the latch with the path, and output.
  - Delete `adjustBankAngleForArc`, `ArcTurnController`, the caches and `loggingEnabled`.
  - The class doc comment states the 1 Hz decision with its sources (spec section 4D: Installation Manual 1-1,
    GAMA Pub 11 label 121 interval, TSO-C129a, the Tu-154 video at 35:15, the bus repeating the held value, the
    aircraft smoothing). Paraphrase with page numbers only.
- [ ] **Step 8: Implement the `NavCalculator` selection, `TurnStackEntry.steerOnPathForDtk`, the latch field and its
  reset.**
- [ ] **Step 9: Run the three test files, then the full suite, tsc and the build.**
- [ ] **Step 10: Update `docs/architecture.md`** (the paragraph and its "Cases" bullets; drop the "unused" bullet and
  the `loggingEnabled` mention at line ~21). Put a replacement text for the wiki page Autopilot's "Implementation"
  section in the report: the new law in plain words, the 25° peak within the ±30 range, and the trainer as the source.
- [ ] **Step 11: Commit** `fixes #100 rewrite roll steering as one control law on the navigated path`.

### Task 6: references #143 — `GPS COURSE TO STEER` is 0 without a heading input

**Files:**
- Modify: `kln90b/services/RollSteeringController.ts` (`setOutput`)
- Modify: `kln90b/Sensors.ts:557-572` (`setRollCommand`)
- Test: `test/render/services/RollSteeringController.test.ts`
- Docs: `docs/architecture.md`

- [ ] **Step 1: Change the test.** `still writes GPS COURSE TO STEER, the intercept course (characterization, #143)`
  becomes `it('writes GPS COURSE TO STEER as 0 without a heading input (#143)')`. It asserts 0 with the aircraft 2 NM
  off the leg. Its comment cites the maintainer's decision of 2026-10-19 and the sim observation.
- [ ] **Step 2: Run, see it fail.**
- [ ] **Step 3: Implement.** `setOutput` passes null for both values without a heading input. The comment in
  `setRollCommand` above the `GPS COURSE TO STEER` write records:
  - the maintainer's sim check of 2026-10-19: the default autopilot tracked the flight plan with this SimVar held at
    0, so the sim's autopilot does not use it;
  - that the DTK goes to `GPS WP DESIRED TRACK` (`setDesiredTrack`), not here.

  Remove the #143 exemption comment in `RollSteeringController`.
- [ ] **Step 4: Full suite, tsc, build.** Update the #143 note in `docs/architecture.md`.
- [ ] **Step 5: Commit** `references #143 write GPS COURSE TO STEER as 0 without a heading input`.
