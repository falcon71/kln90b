# Turn-plan decision, late turn, edits in front, inside bisector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the KLN 90B choose, switch and fly its turn plan, follow edits in front of the active waypoint and sequence at the inside bisector the way the KLN 89 trainer does (#438, #439, #440, #443).

**Architecture:** The plan becomes a state that follows the cross track every calculation (`NavCalculator.updateTurnPlan`): lead within a speed-dependent gate, abeam beyond it, back to lead below 1.0 NM at a 12-s periodic check. The lead plan's alert gets its own 20-s closure trigger. `NavCalculator.tick` arms the bisector sequencing on every plan. `ActiveWaypoint.assertToMatchesFplIdx` follows the active leg to its new index instead of reactivating FPL 0.

**Tech Stack:** TypeScript (es2017), MSFS Avionics Framework, Vitest (unit, render, flight stages).

**Spec:** `docs/superpowers/specs/2026-10-29-turn-plan-decision-design.md` (approved by the maintainer, 2026-10-29). Read it first: this plan argues from it and does not repeat its reasons.

## Global Constraints

- One commit per issue, message `fixes #NN <description>`, each with its tests and doc changes; end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Work on branch `turn-plan-438-439-440`.
- Faithful emulation: behavior comes from `docs/kln89-trainer-record.md` (blocks 2026-10-20 to 2026-10-29). Code comments cite "checked in the KLN 89 trainer, <date>" and Pilot's Guide pages (4-8 for the alert); never manual text. Calls without trainer evidence say "the design's call".
- 1 Hz calculation tick; es2017; no new allocation per tick in `NavCalculator.tick`.
- DOM changes only in display ticks; services keep no state: per-power-on state goes in `VolatileMemory` (with an initializer, reset in `VolatileMemory.reset`, held by the guard test in `test/render/data/VolatileMemory.test.ts`).
- Constant values, verbatim from the spec: gate time 83 s of ground speed; gate cap 4.9 NM; gate floor 1.0 NM; recapture 1.0 NM (strictly below); check period 12 s; lead alert `WPT_ALERT_WITH_TURN_ANTI` (20 s) of along-track closure before the turn point. `OFF_LEG_XTK` stays 4.0 NM.
- American English in comments and docs. No counts in prose for things that grow.
- Existing tests built on the old rule (2.8 NM gate, 20-s decision point, latch) are re-derived from the trainer record and the spec, never nudged until green. A test whose meaning changes gets a new title saying what it now holds.
- After each task: `npx tsc --noEmit` clean, `npm test` green (all three stages), and `npm run build` succeeds.

## Review Focus

1. **The plan flipping at the gate edge.** An aircraft hovering at the gate at 1 Hz: lead→abeam happens once, and it does not come back until below 1.0 NM. Owner: Task 1 (test "stays abeam between the gate and 1.0 NM").
2. **A lead turn in progress when the cross track grows past the gate** (e.g. a wide 150° arc at 119 kt): the started turn must not be dropped or re-planned; only `tickOffLeg` beyond 4.0 NM drops it. Owner: Task 1 (test "keeps a started lead turn whatever the cross track below 4.0 NM").
3. **Ground and taxi speeds**: below about 43 kt the floor holds the gate at 1.0 NM, so a parked or taxiing aircraft does not toggle the plan every check. Owner: Task 2 (test at 20 kt).
4. **An inside aircraft at activation already past the bisector** (FPL 0 activation, a sequencing onto a short leg): with #443 the waypoint is sequenced in the first calculation, once per waypoint, with no cascade beyond what the geometry gives. Owner: Task 3 (test "activates past the inside bisector").
5. **Direct To targets and the follow-the-index branch together**: an edit in front during a Direct To keeps today's Direct To branch; the new branch is for plan legs only. Owner: Task 4 (existing #408 Direct To test plus one delete in front during a Direct To).

---

### Task 1: The plan follows the cross track (#438)

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts` (constants at lines 39-51; `tick` at the `decideTurnPlan` call, line 190; `decideTurnPlan` at 503-524; `isAlertWithTurn` at 609-629)
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (comments on `TurnPlan`, `turnPlan`, `onFollowingLegChanged`, `dropOwnTurn` that describe the latch or the decision point)
- Modify: `docs/architecture.md` (the turn-plan paragraphs around lines 498 and 566-580)
- Modify: `docs/superpowers/specs/2026-10-20-waypoint-sequencing-design.md` (one-line note under 3.3 and 3.5: superseded for the decision and the lead plan's alert by the 2026-10-29 design)
- Test: `test/flight/flights/offCourseSequencing.test.ts`, `test/flight/flights/nextLegEdit.test.ts`, `test/render/data/navdata/NavCalculator.test.ts`

**Interfaces:**
- Produces, in `NavCalculator.ts`:
  - `export const TURN_PLAN_MAX_XTK_TIME: Seconds = 83`
  - `export const TURN_PLAN_MAX_XTK: NauticalMiles = 4.9` (now the cap; same name, new meaning and comment)
  - `export const TURN_PLAN_MIN_XTK: NauticalMiles = 1.0` (the floor)
  - `export function turnPlanGate(groundspeed: Knots): NauticalMiles` = clamp(gs · 83 / 3600, 1.0, 4.9)
  - `private updateTurnPlan(legXtk: NauticalMiles): void` (absolute cross track), replacing `decideTurnPlan`; `TURN_DECISION_TIME` is deleted.
  - `private isWithinTimeOfAlong(legPath: GeoCircle, alongToPoint: NauticalMiles, time: Seconds): boolean`, the closure test of `isWithinTimeOfAbeam` generalized to any along-track point; `isWithinTimeOfAbeam(legPath, along, time)` becomes `isWithinTimeOfAlong(legPath, along, time)`.
  - `isAlertWithTurn(legPath, along, turnPoint)` gains the `turnPoint` parameter.
- Consumed by Task 2: `updateTurnPlan` (adds the recapture branch), `TURN_PLAN_MIN_XTK`.

- [ ] **Step 1: Write the failing gate tests** in `offCourseSequencing.test.ts`, a new `describe('the turn plan follows the cross track (#438)')`, citing "checked in the KLN 89 trainer, 2026-10-29":
  - `it('computes the gate as 83 s of ground speed, capped at 4.9 NM and floored at 1.0 NM')`: `turnPlanGate(60)` ≈ 1.383, `turnPlanGate(119)` ≈ 2.744, `turnPlanGate(239)` = 4.9, `turnPlanGate(20)` = 1.0 (toBeCloseTo, 3).
  - `it('decides at the first calculation, far before the turn point')`: boot at 239 kt 20 NM before WWW on the leg 4.5 NM right, parallel; after the first calculation `aw.turnPlan` is `AT_LEAD` and `waypointAlert` is false.
  - `it('takes the abeam plan beyond the gate at 239 kt')`: boot 20 NM before WWW 5.3 NM right, parallel: `AT_ABEAM` at the first calculation (5.3 > 4.9; the trainer's g50, 5.0 abeam).
  - `it('turns a lead plan into an abeam plan once the aircraft is beyond the gate (the drift case, the design\'s call)')`: 239 kt, start 2.0 NM right 15 NM out (lead), ManualPilot holds a track diverging 20° right; assert the plan becomes `AT_ABEAM` within one calculation after `xtkRight` passes 4.9 + one tick of divergence.
  - `it('stays abeam between the gate and 1.0 NM')`: 239 kt, start 5.5 NM right 18 NM out (abeam), converge at 30° to a parallel 1.5 NM right: the plan stays `AT_ABEAM` every second until WWW's abeam line; no lead turn at TP.
  - `it('keeps a started lead turn whatever the cross track below 4.0 NM')`: 119 kt variant of the 150° turn (use `boot`'s `next` = `INBOUND - 150 + 360`, outside), 2.5 NM right parallel; after the turn starts, sample every second until sequencing: `ownTurnStarted` stays true and the stack is not emptied while `|xtk| < 4.0`.
  - `it('starts the lead plan\'s alert 20 s of closure before the turn point, not at the decision')`: 239 kt on a 30° converging track inside the gate; the alert first comes on with `gpsAlongBefore − TP` between `20·closure − closure − GPS_TOLERANCE_NM` and `20·closure + GPS_TOLERANCE_NM`, closure = `GS·cos30°/3600`.
  - `it('keeps a jump closer than the gate on the abeam plan (the design\'s call)')`: abeam at 5.5 NM, then `flight.aircraft` placed 3.0 NM right (use the harness's position setter; if none exists, add `Flight.teleport(pos: LatLon)` in `test/harness/flight/Flight.ts`): still `AT_ABEAM` after 3 calculations.
  - `it('keeps a lead plan between 4.0 and 4.9 NM at 239 kt and turns at the lead once back on the leg')`: start 4.6 NM right (lead, off the leg), converge so the aircraft is under 4.0 NM before TP: the turn starts at TP (the trainer's Y2, g48).

- [ ] **Step 2: Run them to verify they fail**
  Run: `npx vitest run --project flight test/flight/flights/offCourseSequencing.test.ts -t "#438"`
  Expected: FAIL (`turnPlanGate` not exported; plans differ).

- [ ] **Step 3: Implement** the constants, `turnPlanGate`, and `updateTurnPlan` in `NavCalculator.ts`, called where `decideTurnPlan` is now. Rule (spec 3.1), skipped while `activeWaypoint.ownTurnStarted`:
  ```
  if turnPlan === null:        turnPlan = legXtk <= gate ? AT_LEAD : AT_ABEAM
  else if AT_LEAD && legXtk > gate: turnPlan = AT_ABEAM
  ```
  Delete `TURN_DECISION_TIME` and the decision-point condition; delete the #157 "always abeam off the leg" comment. `isAlertWithTurn`: for `AT_LEAD` return `toFrom === TO && (along <= turnPoint || isWithinTimeOfAlong(legPath, along - turnPoint, WPT_ALERT_WITH_TURN_ANTI))`. The comment states the drift case and the jump-closer asymmetry as the design's calls, naming the alternative (latched until the next activation or re-initialization).

- [ ] **Step 4: Re-derive the existing tests that the new rule moves.** At 239 kt the gate is 4.9 NM, at 120 kt 2.767 NM. For each, keep what the test is about and rebuild the geometry so it holds under the new rule; update its comment and, where its meaning changed, its title:
  - `offCourseSequencing`: the 2.0 NM lead test (its start `at(9.75, 7.0)` is beyond the gate: start within 4.9, and assert the alert by the closure rule, not at `DP`); every abeam fixture built from `[at(9.75, 8.5), at(4.25, 3.0)]` with `trackPilot(2.8, …)` (abeam from the start since 8.5 > 4.9, but it ends about 0.9 NM off: keep it at or above 1.2 NM to the abeam line so Task 2's recapture cannot apply; the "keeps it although the cross track falls" claim now reads "keeps it while above 1.0 NM"); the 30° converging alert test (start beyond 4.9); the FLY R test; the R6 test (decided off the leg, still abeam at 6.6 > 4.9, keep); the "drops its own turn beyond 4 NM" test (the circle must stay under 4.9 NM, or the plan becomes abeam and the test's last part changes: rebuild so the peak stays between 4.0 and 4.9); the Direct To test (`decides at once…` becomes "decides at the first calculation of the Direct To"); `derives … the decision point` loses `DP`; the bisector tests at lines 452 and 474 are Task 3's.
  - `nextLegEdit`: the a3/a4 alert-pause test (the pause now comes from the alert's closure trigger: keep its expectations, check they still hold); `bootAbeamPass` (12 NM north at 120 kt is beyond 2.767: abeam from the start, keep, but the 3.5 NM-at-`decisionPoint` precondition goes; `decisionPoint` helper removed if unused).
  - `NavCalculator.test.ts` "waypoint alert with turn anticipation (4-8)": on course, closure = GS: the expectation should hold unchanged; confirm.

- [ ] **Step 5: Run the whole suite**
  Run: `npx tsc --noEmit && npm test`
  Expected: all green.

- [ ] **Step 6: Update the docs** listed under Files (architecture.md: the plan follows the cross track, the gate, no decision point, the alert trigger; 2026-10-20 design: the two one-line notes).

- [ ] **Step 7: Commit**
  `git commit -m "fixes #438 the turn plan follows the cross track with a gate of 83 s of ground speed, at most 4.9 NM"` (plus the Co-Authored-By line).

### Task 2: The abeam plan switches to the normal turn below 1.0 NM (#439)

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts` (`updateTurnPlan`; constants)
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState`, `reset`)
- Test: `test/flight/flights/offCourseSequencing.test.ts`; `test/render/data/VolatileMemory.test.ts` (the guard covers the new field by itself; confirm it fails without the reset)

**Interfaces:**
- Consumes: `updateTurnPlan`, `TURN_PLAN_MIN_XTK` (Task 1).
- Produces: `export const TURN_PLAN_RECAPTURE_XTK: NauticalMiles = 1.0`, `export const TURN_PLAN_CHECK_PERIOD: Seconds = 12`, `NavPageState.turnPlanCheckPhase: number = 0` (seconds since the last check, free-running; reset to 0 at a power-on).

- [ ] **Step 1: Write the failing tests**, `describe('the abeam plan switches to the normal turn (#439)')`, citing "checked in the KLN 89 trainer, 2026-10-28" (P1-P3, r1-r5, a13-a16):
  - `it('starts the normal turn within one check period once the cross track is below 1.0 NM, past the turn point')`: 119 kt (use `boot` with an added `gs` parameter, default 239), 150° turn, abeam from 4 NM right converging at 20° so XTK passes 1.0 after TP; record the first calculation with `|xtk| < 1.0`; the own turn starts (stack non-empty, `ownTurnStarted`) within 12 calculations after it, the turn is a circle (`aw.turnStack` holds a non-abeam entry: `abeamTurnSign === null`), `waypointAlert` true at the start, and `flight.nav.xtkNm` is the arc distance (≈ distance to the circle, not to WWW).
  - `it('starts the turn at the turn point when the switch comes before it')`: same with XTK below 1.0 by al-L 1.0; the turn starts at TP (± one tick), the alert about 20 s of closure before it or at the switch, whichever is later.
  - `it('flies the zero-size turn when the cross track stays at or above 1.0 NM')`: abeam, parallel 1.2 NM: no switch; zero-size turn at the abeam line.
  - `it('does not switch once the zero-size turn has started')`: abeam pass at 1.2 NM that drops below 1.0 just after the abeam line: the stack keeps the abeam entry.
  - `it('checks every 12 s whatever the leg')`: two otherwise identical passes started 6 s apart in flight time relative to the check phase (set `navPage.turnPlanCheckPhase` before the pass): the switch delays differ, and each is ≤ 12 s.
  - `it('holds the gate at 1.0 NM on the ground, so the plan does not toggle')`: 20 kt, 0.6 NM right of the leg, 60 calculations: the plan stays `AT_LEAD` throughout (Review Focus 3).

- [ ] **Step 2: Run them to verify they fail**
  Run: `npx vitest run --project flight test/flight/flights/offCourseSequencing.test.ts -t "#439"`
  Expected: FAIL (no switch; zero-size turn instead).

- [ ] **Step 3: Implement.** In `NavCalculator.tick`, advance `navPage.turnPlanCheckPhase` once per calculation (wrap at the period) whatever the plan, so the phase is free-running; in `updateTurnPlan`, while not `ownTurnStarted` and `turnPlan === AT_ABEAM`, at the calculation where the phase wraps, set `AT_LEAD` if `legXtk < TURN_PLAN_RECAPTURE_XTK`. Reset the field in `VolatileMemory.reset`. Comment: the period is the design's call within the trainer's 11-12 s; free-running because identical passes gave different delays.

- [ ] **Step 4: Re-check Task 1's re-derived abeam fixtures** stay at or above 1.0 NM, and run the suite.
  Run: `npx tsc --noEmit && npm test`
  Expected: all green, including the VolatileMemory guard.

- [ ] **Step 5: Update docs/architecture.md** (the recapture and its check), then commit:
  `git commit -m "fixes #439 the abeam plan switches to the normal turn once the cross track is below 1.0 NM, at a check every 12 s"`.

### Task 3: Sequencing at the inside bisector on every plan (#443)

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts` (the bisector arm at lines 245-258 and its comment)
- Test: `test/flight/flights/offCourseSequencing.test.ts` (tests at lines 452 and 474)

**Interfaces:** none new.

- [ ] **Step 1: Rewrite the test at line 452** as `it('sequences on the turn plan at the inside bisector before the turn point, with no turn (KLN 89 trainer, 2026-10-29, I3\'b; #443)')`: same 150° left turn at 239 kt, 2.0 NM inside, parallel. Expected now: WWW sequenced in the first calculation past the bisector (7.5 NM before WWW, ± one tick, measured with `gpsAlongBefore` against `2.0 / tan 15°`), `turnStackLength` 0, no alert before it. Add a 119-kt case mirroring I3'b: 2.3 NM inside about 9 NM out, a track crossing the line, sequenced at the crossing.
- [ ] **Step 2: Retitle the test at line 474** to cite the trainer (2026-10-29, I3'a, I3'c) instead of "the maintainer's lead's call"; under Task 1 the plan exists from the start, so WWW is sequenced where the aircraft crosses the bisector (6.1 NM before WWW), not at `DP`: update the along-track expectation.
- [ ] **Step 3: Add `it('activates past the inside bisector: sequenced in the first calculation, once')`** (Review Focus 4): boot inside and past WWW's bisector within 4.0 NM; KBBB active after the first calculations, and KBBB itself not sequenced unless past its own bisector.
- [ ] **Step 4: Run to verify they fail**
  Run: `npx vitest run --project flight test/flight/flights/offCourseSequencing.test.ts -t "#443"`
  Expected: FAIL (WWW kept until the turn point).
- [ ] **Step 5: Implement**: drop the `(ownTurnStarted || turnPlan === AT_ABEAM)` condition from the bisector arm; rewrite its comment (trainer 2026-10-29: inside crossing sequences on either plan; on course and outside the turn starts first).
- [ ] **Step 6: Run the suite**
  Run: `npx tsc --noEmit && npm test`
  Expected: all green; the on-course and outside sequencing tests unchanged.
- [ ] **Step 7: Update docs/architecture.md** (bisector arm), then commit:
  `git commit -m "fixes #443 an aircraft on the inside of a turn is sequenced at the bisector on the turn plan too"`.

### Task 4: Follow the active leg through an edit in front (#440)

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (`setFplData`, `assertToMatchesFplIdx`, a new private field)
- Test: `test/flight/flights/nextLegEdit.test.ts` (the `#440` describe), `test/unit/data/flightplan/ActiveWaypoint.test.ts`

**Interfaces:**
- Produces: `private fromPlanLeg: KLNFlightplanLeg | null = null` in `ActiveWaypoint`, set in `setFplData` to `legs[idx - 1]` and cleared in `flag`; a private `followActiveLeg(legs: KLNFlightplanLeg[], idx: number): void`.

- [ ] **Step 1: Rewrite the `it.fails` pin** at `nextLegEdit.test.ts:378` as `it('follows the active leg and drops the turn of the waypoint just sequenced when the first waypoint is deleted (KLN 89 trainer, 2026-10-28, 3b, 3b\'; #440)')`, without `.fails`: after `deleteLeg(unit, 0)` and one calculation: `activeIdent` KBBB, `getActiveFplIdx()` 1, `turnStackLength` 0, DTK within 1° of the ABC→KBBB leg, `waypointAlert` false (unless KBBB's own alert is due: assert the geometry keeps it off). Keep the control test.
- [ ] **Step 2: Add the flight tests** in the same describe:
  - `it('keeps the abeam plan through a delete in front (KLN 89 trainer, 2026-10-28, 3c)')`: `bootAbeamPass`, delete leg 0: plan `AT_ABEAM`, index follows.
  - `it('keeps the waypoint\'s own started turn through a delete in front (KLN 89 trainer, 2026-10-28, 3a\'\')')`: fly into KBBB's own turn, delete leg 0: same stack entries (`toBe`), `ownTurnStarted` true.
  - `it('keeps the run-out of a zero-size abeam turn through a delete in front (KLN 89 trainer, 2026-10-28, 3d)')`: after an abeam pass at ABC, the run-out on the stack; delete leg 0: the run-out entry kept (`isRunOut`).
  - `it('activates the closest leg when the FROM is deleted (KLN 89 trainer, 2026-10-28, 3e)')`: delete the FROM: `activateFpl0` behavior (closest leg, stack cleared).
  - `it('makes an inserted waypoint between FROM and TO active and keeps the FROM (KLN 89 trainer, 2026-10-28, 3f)')`: insert a waypoint far off the route (farther than the closest leg alternative) between ABC and KBBB: it becomes active, FROM ABC, plan null then decided, leftover turn dropped.
  - `it('follows the active leg through an insert into a full FPL 0 during a turn (by analogy, the design\'s call)')`: fill FPL 0 to the limit, insert during ABC's leftover turn: front legs deleted, index follows, leftover dropped, own turn kept.
  - `it('keeps the Direct To branch for a delete in front during a Direct To')` (Review Focus 5).
- [ ] **Step 3: Run them to verify they fail**
  Run: `npx vitest run --project flight test/flight/flights/nextLegEdit.test.ts -t "#440"`
  Expected: FAIL (index reset by `activateFpl0`, stack cleared).
- [ ] **Step 4: Implement** in `assertToMatchesFplIdx`, after the Direct To branch, with `idx = legs.indexOf(this.to)`:
  - `idx >= 1 && legs[idx - 1] === this.fromPlanLeg` (the edit was in front of the FROM): `followActiveLeg(legs, idx)`.
  - `idx >= 2 && legs[idx - 2] === this.fromPlanLeg` (one leg inserted between FROM and TO, now at `idx - 1`): make it active with the FROM kept: `setActiveIdx(idx - 1)`, `this.to = legs[idx - 1]`, `this.from` rebuilt by `fromLegOf(this.fromPlanLeg, legs[idx - 1])`, `fromPlanLeg` unchanged, `turnStack = []`, save the last active waypoint and publish `activeWaypointChanged`.
  - Otherwise (the TO or the FROM gone): `activateFpl0()` as today. `followActiveLeg`: set `fplIdx = idx` directly (not `setActiveIdx`, which clears the plan), keep `from`, `turnPlan`, `ownTurnStarted`; if `!ownTurnStarted` filter the stack to `isRunOut` entries; publish `activeWaypointChanged`; then `assertFollowingLegUnchanged(legs)`. Comments cite the trainer passes and say the insert into a full FPL 0 and the insert during a turn are by analogy.
- [ ] **Step 5: Add unit tests** in `ActiveWaypoint.test.ts` for `followActiveLeg`'s filtering (own turn kept; leftover circle dropped; run-out kept) using the existing `TurnStackEntry` builders there.
- [ ] **Step 6: Run the suite**
  Run: `npx tsc --noEmit && npm test && npm run build`
  Expected: all green; build succeeds.
- [ ] **Step 7: Update docs/architecture.md** (edits in front of the active waypoint), then commit:
  `git commit -m "fixes #440 an edit in front of the active waypoint follows the active leg instead of reactivating FPL 0"`.

### Task 5: Close-out checks

- [ ] **Step 1:** `git log --oneline master..` shows the plan commit and the four `fixes` commits in order; `git status` clean.
- [ ] **Step 2:** Mutation pass by the reviewer (CLAUDE.md: verify by mutation), not named to the implementers.
- [ ] **Step 3:** Hand back to the maintainer for the local merge decision; nothing is merged or deleted before their approval.
