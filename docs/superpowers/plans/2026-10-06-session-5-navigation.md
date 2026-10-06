# Session 5 (navigation core): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Spec tests for the project's own navigation model (nav math, the flight plan model, `ActiveWaypoint`,
`NavCalculator`, `ModeController`, the XTK filter), each proven to bite, and pins for the navigation bugs the research
and the trainer checks found.

**Architecture:**
- **Task 1** adds the `approachWorld()` fixture to the harness. It runs alone, first.
- **Tasks 2 to 5** are four parallel batches, one per area. Each runs in its own git worktree reset to the session branch
  after task 1 is merged, starts from the research drafts, and ends in one commit (plus one per fix round).
- **Task 6** files the issues, replaces the placeholders, updates `testing.md` and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk`, the headless
harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-06-session-5-navigation-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task.
- **Branches.** The session branch is `tests-session-5-navigation`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`. Before anything else run
  `git reset --hard tests-session-5-navigation` on the (still empty) worktree branch and check `git log -1`: it must
  show the session branch's head (task 1's merge for tasks 2 to 5). A missing `node_modules` is created as a junction
  to `E:\msfs\kln90b\node_modules` (`cmd //c mklink /J node_modules E:\msfs\kln90b\node_modules`); never delete it
  recursively.
- **No behavior changes** in `kln90b/` (rule 12). Testability seams only, each named in its commit message.
- **Test names** carry the issue or commit where there is one: `'… (#122)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23) with the numbers fixed in this plan. The research drafts use older
  placeholder names (`#NEW-A`, `#NEW-B-1`, `#NEW-C-1`, `#NEW-D-1`, …): rename them as each task says.
- **Labels** (`testing.md` section 5):
    - A **spec test** cites the Pilot's Guide page (or the Installation Manual page) in a comment.
    - A **characterization test** has `characterization` in its `describe` or `it` title and no manual citation.
    - A **contract test** cites its source (`LVars.ts`, a wiki page by name) and needs neither.
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `install-manual-index.md`, `maintenance-manual-index.md`). Cite page numbers, never copy manual text.
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts` or by hand, never from the code under
  test or the SDK's flavor of the same formula. Setup may use SDK geometry.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure, not substrings of a whole screen.
- **Pins.** Every `it.fails` has a passing sibling that asserts its heavy preconditions. A pin is proven by fixing the
  bug temporarily (the fix is named per pin below) and seeing it turn red, then restoring.
- **Proof per test (rule 10).** Break the subject by hand (the break is named per test below or in the research report
  section the task names; a different real break is fine), run the test and see it fail, restore, check that `git diff`
  shows only test files. Never commit the broken state.
- **Commits (rule 22).** One commit per task, plus one per fix round, never amended. The message lists every test as
  `- <test>: Proof: fails when <break>` and ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, GitHub issues, other tasks' files and blocks.
- **Copyright and data.** Never commit manual text or navdata recorded from the sim. Facilities are invented. The trainer
  checks are cited as "KLN 89 trainer" in comments; the Chicago waypoints used there never appear in tests.
- **Research.** The reports and drafts are in
  `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\0249a3a7-1531-4d51-b49e-98ebcbc93dd6\scratchpad\`:
  `research-A.md` (drafts in `drafts-A\test\…`, already laid out in the repo's folders), `research-B.md` (drafts in
  `research-B-drafts\`), `research-C.md` (drafts `NavCalculatorC.test.ts`, `waypointAlertTurn.test.ts`),
  `research-D.md` (drafts in `drafts-D\`). The drafts ran against the session branch before task 1, but they are
  starting points, not finished tests. Do not copy the research's break lists into test comments.
- **Reports** go to the same scratchpad folder as `report-task-<N>.md`, written with the Bash tool
  (`cat > '<path>' <<'EOF'`); check that the file exists. The reply to the controller is only the status, the head
  commit and concerns.

**User decisions (already made):**
- Roll steering: "Pins only" (the wrong-way bank of #100; no characterization of the algorithm).
- XTK filter overshoot: "Bug: file and pin"; the ramp tracking is a characterization.
- Abeam sequencing, the direct-to index shift: checked in the KLN 89 trainer, both bugs.
- #82: "Pin #82, fix #43 test" (drop the CRSR assertion, comment the reproduction on #82).
- OBS to LEG on the FROM side and #119: checked in the KLN 89 trainer, both bugs ("If this trainer confirms it is a bug,
  we will turn the issue into a bug and pin it").
- APR cancel before the FAF: "Treat is as intended for now, but please also file an issue with the question tag".
- The four approach-scale cases: "One question issue".
- The two research-C open questions became the question issues #146 and #147 ("we will verify them with the trainer in
  another session").
- "Approve both" (scope, rulings, bugs, the six tasks); "The rest of the spec is approved".

---

## Facts every batch needs (from the research pass)

**Boot and settle.** `bootUnit` boots force-ready. `await settle(unit)` waits for the GPS and for FPL 0 to activate. One
calculation tick is `await vi.advanceTimersByTimeAsync(1000)`. Every boot also holds the default navdata (`ZZXA`, `ZZV`,
`ZZN`, `ZZXIN`); never give a test facility an ident starting with `ZZ`.

**Moving the aircraft in a render test:** `await moveAircraft(unit, point, {groundspeedKt, trackTrue?})`. Afterwards the
position holds (a paused sim). A held position with ground speed can sequence the leg: keep the aircraft away from the
next waypoint, or boot with `storage: {turnAnticipation: false}`.

**The standard route** (`standardRoute()`): `kaaa` 47.0/8.0, `abc` 47.5/8.9 (a VOR), `kbbb` 48.2/9.2; leg 1 course 050,
leg 2 course 016. `savedFlightplan(0, [kaaa, abc, kbbb])` as `storage` stores FPL 0. `flight/geo.ts`: `pointBefore`,
`pointFrom`, `courseDeg`, `finalCourseDeg`, `distanceNm`, `angleDiff`.

**State probes.** `unit.props.memory.navPage` is the navigation state (`activeWaypoint`, `navmode`, `xtkScale`,
`xtkToActive`, `desiredTrack`, `toFrom`, `waypointAlert`, `obsMag`). `unit.props.modeController` is the
`ModeController`. `unit.props.sensors.in.gps.reset()` loses the GPS in the middle of a test (fast acquisition is about
10 s). `unit.env.sim.lastWrite(name)?.value` reads an output; `sim.set(name, unit, value)` sets an input.

**OBS traps.** An unset `Nav OBS:1` reads 0, and an OBS course equal to the stored `obsMag` makes `setObs` return early
(#122): OBS tests set a non-zero course (`sim.set('NAV OBS:1', 'degrees', 90)`). With ObsSource 1 the indicator rewrites
the OBS every tick; tests of a course the unit chooses itself use ObsSource 0 (panel.xml `Input.ObsSource`).

**Approach world (after task 1).** `approachWorld()` from `test/harness/fixtures.ts` (below). Load the approach with
`await unit.panel.loadProcedure('APT 8')` after `settle`.

---

### Task 1: the approach-world fixture

**Goal:** A shared RNAV approach world (`approachWorld()`) whose FAF can reach APR and that has a step-down fix past the
FAF, with a harness test proving it loads and activates.

**Files:**
- Modify: `test/harness/fixtures.ts` (`approachWorld()`)
- Create: `test/render/harness/approachWorld.test.ts`
- Modify: `docs/testing.md` section 3 (one paragraph after "standardRoute") and section 7 (the "Shared worlds" bullet)

**Acceptance Criteria:**
- [ ] `approachWorld()` returns fresh facilities on every call, all idents sort before the default navdata, every
      approach fix is in `facilities`.
- [ ] The harness test passes: after `loadProcedure('APT 8')` FPL 0 holds ENRAA, IAFAA, IFAAA, FAFAA, SDFAA, MAPAA,
      KPRC with IAF, FAF and MAP flags on the right legs; moving down the final course reaches `NavMode.APR_LEG` within
      2 NM of FAFAA.
- [ ] Each harness case fails under a deliberately broken fixture (named in step 3) and passes again restored.
- [ ] `npm test` passes; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: the fixture** in `test/harness/fixtures.ts` (extend the imports with `FixTypeFlags` from
  `@microsoft/msfs-sdk`, `approach`, `Leg`, `withProcedures` from `./navdata/procedures`, `pointFrom` from
  `./flight/geo`; check that no import cycle appears in the build warnings):

```ts
/**
 * An RNAV approach to KPRC (47.0, 8.0) from the north, final course 180: IAFAA 10 NM and IFAAA 5 NM north of the FAF,
 * the FAF FAFAA 5 NM north of the MAP, a step-down fix SDFAA 2.5 NM north of the MAP, the MAP MAPAA at the airport, and
 * an enroute fix ENRAA 60 NM north of KPRC. Unlike the IAF = FAF worlds of ModeController.test.ts (#129), the unit can
 * reach APR here, and the step-down fix lets a test check that APR does not come back past the FAF. Store
 * [enraa, kprc] in FPL 0 and load the approach with unit.panel.loadProcedure('APT 8'). Fresh objects on every call.
 */
export function approachWorld() {
    const kprcBase = airport('KPRC', 47.0, 8.0);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const at = (nmNorthOfMap: number) => pointFrom(mapaa, 0, nmNorthOfMap);
    const fafaa = intersection('FAFAA', at(5).lat, at(5).lon);
    const sdfaa = intersection('SDFAA', at(2.5).lat, at(2.5).lon);
    const ifaaa = intersection('IFAAA', at(10).lat, at(10).lon);
    const iafaa = intersection('IAFAA', at(15).lat, at(15).lon);
    const enraa = intersection('ENRAA', at(60).lat, at(60).lon);
    const kprc = withProcedures(kprcBase, {
        approaches: [approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa)]}],
            final: [Leg.IF(ifaaa), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(sdfaa), Leg.TF(mapaa, FixTypeFlags.MAP)],
        })],
    });
    return {
        kprc, enraa, iafaa, ifaaa, fafaa, sdfaa, mapaa,
        /** Every facility the world needs, for bootUnit({facilities}) */
        facilities: [kprc, enraa, iafaa, ifaaa, fafaa, sdfaa, mapaa],
        /** The point nm NM north of KPRC on the final course line */
        north: (nm: number) => pointFrom(kprcBase, 0, nm),
    };
}
```

  Confirm the `approach()` options against `test/harness/navdata/procedures.ts` (`ApproachOptions`); `ApproachType` is
  a static global (see `ModeController.test.ts`). If the builder needs a different leg shape, follow the builder, keep
  the geometry.

- [ ] **Step 2: the harness test** `test/render/harness/approachWorld.test.ts` (a harness test, no manual page):

```ts
describe('approachWorld (harness)', () => {
    async function loaded(nmNorth: number) {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(nmNorth),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        return {w, unit};
    }

    it('loads the approach into FPL 0 with its IAF, FAF and MAP', async () => {
        const {unit} = await loaded(20);
        const legs = unit.props.memory.fplPage.flightplans[0].getLegs();
        expect(legs.map(l => l.wpt.icaoStruct.ident)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
        expect(legs.map(l => l.fixType)).toEqual([undefined, KLNFixType.IAF, undefined, KLNFixType.FAF, undefined, KLNFixType.MAP, undefined]);
    });

    it('reaches APR within 2 NM of the FAF on the final course', async () => {
        const {w, unit} = await loaded(7.5);   // 2.5 NM before FAFAA, inside 30 NM: armed
        await vi.advanceTimersByTimeAsync(31_000);
        await moveAircraft(unit, w.north(6.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.APR_LEG);
    });
});
```

  Confirm the ident list and the fix types by running (the IF of the final may merge with the transition's IFAAA; record
  what the loader produces and keep the assertion exact). If the active waypoint after the load is not FAFAA at 7.5 NM,
  read `activateFpl0` and pick a start position on the FAF leg.

- [ ] **Step 3: prove the harness test** (rule 10): remove `FixTypeFlags.FAF` from the FAF leg (both cases fail); move
  FAFAA 5 NM east (the APR case fails). Restore.

- [ ] **Step 4: docs.** `testing.md` section 3, after the `standardRoute()` paragraph: one paragraph on
  `approachWorld()` (what it holds, that it reaches APR, the step-down fix, how to load it). Section 7, "Shared worlds":
  the approach world now exists as a fixture; the older copies in `ModeController.test.ts` and `HEvents.test.ts` (IAF =
  FAF, #129) and the arc worlds stay copied.

- [ ] **Step 5: verify and commit.** `npm test`, `npx tsc --noEmit`, one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/harness/fixtures.ts", "test/render/harness/approachWorld.test.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["approachWorld returns fresh facilities sorting before the defaults, all fixes included", "harness test passes: legs and fix types exact, APR within 2 NM", "each case fails under the named broken fixture", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 2: nav math and the flight plan model

**Goal:** Spec tests for `KLNNavmath`, `Flightplan`, `FlightplanUtils`, `Flightplanloader` and FPL 0 editing, and the pins
`#NEW-2-1` (row-1 insert on a full FPL 0), `#NEW-2-2` (direct-to index shift) and `#NEW-2-3` (DELETE FPL? not saved).

**Files:**
- Modify (replace): `test/unit/services/KLNNavmath.test.ts`
- Create: `test/unit/data/flightplan/Flightplan.test.ts`
- Create: `test/unit/services/FlightplanUtils.test.ts`
- Create: `test/unit/services/Flightplanloader.test.ts`
- Create: `test/render/data/flightplan/FlightplanEdit.test.ts`
- Create: `test/render/data/flightplan/DuplicateWaypoints.test.ts`

**Acceptance Criteria:**
- [ ] Every test of the six files passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The permissive "computes the midpoint without throwing" test is gone; the #97 pin is split per fraction with a
      passing sibling tying `geo.ts` to the avform literals.
- [ ] The pins `#NEW-2-1` (unit and UI), `#NEW-2-2` and `#NEW-2-3` turn red under their named fixes; each has a passing
      sibling.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Copy the six files from `scratchpad\drafts-A\test\…` to the same paths in the
  repo. Read `research-A.md` sections 1 to 5 and "Other findings and traps" first. Rename the placeholders:
  `#NEW-A` → `#NEW-2-1`, `#NEW-B` → `#NEW-2-2`, `#NEW-C` → `#NEW-2-3`.

- [ ] **Step 2: KLNNavmath** (`research-A.md` section 1). Keep: f = 0; the passing sibling "the expectation of the pins
  below is the textbook midpoint and end point" (geo.ts against 50.5043/8.9894, avform147); `it.fails.each([0.25, 0.5,
  0.75, 1])` and the on-segment `it.fails` (#97); `bankeAngleForStandardTurn` at 60/90/120/150 kt within 0.15 degree of
  `atan(V·ω/g)` with ω = 3°/s, g = 9.80665, 1852/3600 m/s per kt; the SDK radius at that bank within 1 % of V/ω; 0 kt;
  below 25 at 160 kt and exactly 25 at 170 and 250 kt; `distanceToAchieveBankAngleChange (characterization)`: 25° at
  120 kt = 1/6 NM, 10° at 360 kt = 0.2 NM, 0 change and 0 kt = 0. Breaks: constant 300, `Math.min` to `Math.max`, cap 30,
  cap removed, rate 10, `/ HOURS_TO_SECONDS` removed. Prove the #97 pins with both fixes of `intermediatePoint`
  (`Math.sin((1 - f) * d)` and `z = A·sin(lat1) + B·sin(lat2)`).

- [ ] **Step 3: Flightplan** (`research-A.md` section 2 table): insert/publish (break `splice(idx + 1, …)`), the 31st
  leg (4-1, 4-4; break `>= 30` to `> 30`), the 30th leg (break `>= 29`), delete (4-5; break `splice(idx, 2)`), batch
  publishing (characterization of the API, no citation; breaks: no publish in `finishBatchInsert`, publishing not
  re-enabled), `removeProcedures`/`removeProcedure` (6-5, 6-23; breaks `!== APP` for USER, inverted filter), `load`
  (4-1, 4-4; break: procedures kept), `loadInverted` (4-4; break `this.legs = fpl.legs`), `delete` (4-5; break no-op).
  The batch title must carry `characterization`.

- [ ] **Step 4: FlightplanUtils** (`research-A.md` section 3). `calcDistToDestination` with the A–B 40 NM east, B–C
  25 NM north, C–D 15 NM west box: 47, the last leg, a direct-to in the plan 45, outside 55, the MAP fence 32 (4-11,
  6-20; breaks: loop from `i = 2`, `+=` to `=`, unit, MAP fence removed). `getDestination` cases including the off-plan
  direct-to (break `return []`). `insertLegIntoFpl` on 30 legs FIX00…FIX29 5 NM apart: room, the numbered plan refuses,
  the drops and the refusals (C-1 for the refusals; the plain drop is a characterization because C-1 only implies it;
  breaks named in the report). Pin `#NEW-2-1` (unit; fix `Math.max(0, idx - 1)` in `insertLegIntoFpl`). Pin `#NEW-2-2`
  "keeps a direct-to to a waypoint of the plan in the plan (KLN 89 trainer)": its sibling "follows the shifted index in
  leg mode" passes; fix: in `ActiveWaypoint.assertToMatchesFplIdx`, for a direct-to set `this.fplIdx =
  legs.indexOf(this.to)` instead of -1. Run the full suite against that fix: the #67 tests must stay green. Cite the
  trainer in the pin's comment ("checked in the KLN 89 trainer: the direct-to follows its target to the new index"),
  plus 4-10 and 4-11.

- [ ] **Step 5: Flightplanloader** (`research-A.md` section 4): one missing waypoint keeps the order (B-4); ten named, no
  OTHER (B-3); the eleventh gives OTHER and exactly ten named (B-3); the order of the ten (characterization); the 30-leg
  cut; cut and missing counted together; cut before missing (characterization). Breaks: `>= 10`, `> 11`,
  `slice(0, 9)`, `slice(0, 11)`, OTHER removed, `slice(0, 31)`, cut messages removed, missing message dropped.

- [ ] **Step 6: FPL 0 page** (`FlightplanEdit.test.ts`, `research-A.md` sections 2 and 3): 26 plans numbered 0–25 and
  empty (4-1; break `Array(26)` to `25` in `KLN90BCore`); 26 empty plans after a failed waypoint restore
  (characterization, ties to #144); `FPL FULL` on the status line (C-1; break: the `FPL FULL` publish in
  `FlightplanList` removed); the drop to append (characterization); typing over the second row; pin `#NEW-2-1` (UI;
  same fix); the plan delete empties it (4-5); pin `#NEW-2-3` "saves the deleted plan as empty" (fix: publish
  `flightplanChanged` in `Flightplan.delete()`; the stored value of an empty plan reads `''` through `storedSetting`,
  not `undefined`).

- [ ] **Step 7: the #67 gap** (`DuplicateWaypoints.test.ts`): OBS on the second ABC of `[KAAA, ABC, KBBB, ABC, KBBB]`
  keeps index 3 and the future legs ABC, KBBB; `Nav OBS:1` = 90 (an unset course hits #122 and the test passes under the
  break). Break: `if (activeIdx >= 0)` to `if (false)` in `ModeController.setObs`.

- [ ] **Step 8: verify and commit.** `npm test`, `npx tsc --noEmit`, one commit with the `Proof:` lines and the
  pin-fix lines (`- <pin>: Proof: turns red with <fix>`).

```json:metadata
{"files": ["test/unit/services/KLNNavmath.test.ts", "test/unit/data/flightplan/Flightplan.test.ts", "test/unit/services/FlightplanUtils.test.ts", "test/unit/services/Flightplanloader.test.ts", "test/render/data/flightplan/FlightplanEdit.test.ts", "test/render/data/flightplan/DuplicateWaypoints.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "permissive midpoint test removed, #97 pin split with passing sibling", "pins #NEW-2-1 (unit, UI), #NEW-2-2, #NEW-2-3 turn red under their fixes, each with a sibling", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 3: ActiveWaypoint, LEG/OBS and direct-to in OBS

**Goal:** Spec tests for `ActiveWaypoint`'s direct-to flows, the LEG/OBS switching and the direct-to in OBS, with the
pins `#NEW-3-1` to `#NEW-3-5`, #82 and #119, and the #43 test freed from its CRSR assertion.

**Files:**
- Modify: `test/unit/data/flightplan/ActiveWaypoint.test.ts` (append)
- Create: `test/render/services/ModeControllerObs.test.ts`
- Create: `test/render/pages/left/DirectToObs.test.ts`
- Modify: `test/render/pages/left/DirectToPage.test.ts` (the #43 CRSR assertion; the #119 pin)

**Acceptance Criteria:**
- [ ] Every new test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The pins `#NEW-3-1` to `#NEW-3-5`, #82 and #119 turn red under their named fixes; each has a passing sibling.
- [ ] The #43 test no longer asserts `CRSR` after the direct-to, and still holds index 3 (proven again by its original
      break).
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-B.md` fully. Append the cases of
  `research-B-drafts\ActiveWaypointB.test.ts` to the existing `test/unit/data/flightplan/ActiveWaypoint.test.ts` (reuse
  its `activeWaypointOver` and the A/B/C/D box; fix the import depth). Copy `ModeControllerB.test.ts` to
  `test/render/services/ModeControllerObs.test.ts` and `DirectToObsB.test.ts` to
  `test/render/pages/left/DirectToObs.test.ts` (one more `../` in its imports). Rename: `#NEW-B-1` → `#NEW-3-1`,
  `#NEW-B-2` → `#NEW-3-2`, `#NEW-B-3` → `#NEW-3-3`, `#NEW-B-4` → `#NEW-3-4`.

- [ ] **Step 2: ActiveWaypoint** (`research-B.md` 1.1 to 1.7): cancel (characterization of the leg choice; break: `setFplData(this.fplIdx)` instead of `activateFpl0()`), a direct-to to a plan waypoint resumes (4-10; breaks `slice(fplIdx - 1)`, `setFplData` removed in `sequenceToNextWaypoint`), a random direct-to never resumes (4-10), the last leg (characterization), the MAP as destination (6-20), the turn stack and the saved setting (characterization), the re-activation by position (characterization). Titles of the characterizations carry the word.

- [ ] **Step 3: LEG/OBS** (`research-B.md` 3.1 to 3.11): LEG to OBS keeps 2 NM (5-36; break `obsTrue = bearingToActive`); pin
  `#NEW-3-1` the long leg (fix `obsTrue = fromLeg.path.bearingAt(active)` in `forceSwitchToEnrObsMode`); `NO ACTV WPT`
  (C-1); OBS to LEG on the TO side (5-36; break `fromCoords = gps.coords`); pin `#NEW-3-2` the duplicate (fix:
  `directToFlightplanIndex(from, activeFplIdx)` when the index is ≥ 0 in `switchToEnrLegMode`; the MAHP = FAF test then
  fails, which is expected for that naive fix, say so in the commit); pin `#NEW-3-3` IAF = FAF (proven only to fail at its
  final assertion: run it as a plain `it` and see `expected 1 to be 2`; say so); the MAHP = FAF spec test (6-11, 6-19
  notes); the VOR variation (5-35; breaks: always the current magvar, sign flipped); `OBS WPT > 200NM` (B-3; breaks
  `> 250`, `> 150`, OBS check dropped); the external switch back to LEG (5-33).

- [ ] **Step 4: OBS to LEG on the FROM side becomes pin `#NEW-3-5`.** The draft test "makes a direct-to from the present
  position … (characterization)" is replaced by a passing sibling and a pin:
    - sibling "the pin setup: OBS 050 to ABC, 10 NM past ABC, 2 NM right of ABC–KBBB, FROM": asserts ENR_OBS, ABC active,
      `toFrom` FROM;
    - `it.fails('re-activates the plan leg ABC–KBBB instead of a direct-to from the present position (#NEW-3-5)')`: after
      MOD 1 ENT, KBBB active, `isDctNavigation()` false, the from waypoint ABC, DTK the course of leg 2 at the position
      (geo.ts, within 0.5 degree) and the deviation still 2 NM (within 0.1). Cite 5-36 and "checked in the KLN 89
      trainer: the leg comes back with its deviation".
    - Fix to prove it: in `ModeController.switchToEnrLegMode`'s FROM branch replace the `directTo(from, to)` call by just
      `activateFpl0()` (keep the obsMag reset). Restore.

- [ ] **Step 5: direct-to in OBS** (`research-B.md` 4.1 to 4.5): ACTIVATE keeps the OBS (5-37; ObsSource 0; break
  `if (this.activateMode)` to `if (false)`); pin `#NEW-3-4` not recentred (fix: remove the early return in `setObs`;
  confirm that the #122 pin also turns red under that fix and note it); a direct-to sets the OBS and centres (5-37);
  `CRS xxx` (5-37, C-1; break `obsTarget === 1`); the driven indicator (5-37).

- [ ] **Step 6: #82 and #43.** In `test/render/pages/left/DirectToPage.test.ts`, the #43 test (around line 34) asserts
  `status().left === 'CRSR'` after the direct-to: remove that assertion only, with a comment that figure 4-42 (4-11)
  shows the cursor off after the approval and #82 pins it; re-prove the #43 test by its original break (`git log -S`
  on the file names it). The #82 pin (`DirectToObs.test.ts`, draft 4.6): an ENT after the direct-to from FPL 0 inserts
  nothing (rows `1:KAAA`, `2:ABC `, `3:KBBB`); its sibling asserts the direct-to happened. Fix to prove it: in
  `DirectToPage.performDirectTo`, turn the left cursor off before popping the page (find the left page's cursor API in
  `MainPage`). If the fix is not a one-liner, prove the pin by running it as a plain `it` and recording the failing
  assertion instead, and say so.

- [ ] **Step 7: the #119 pin** in `DirectToPage.test.ts`. Read GitHub issue #119 for its reproduction. Pin:
  `it.fails('prefills the active waypoint on the DIRECT TO page after power-up (#119)')`: boot with the standard route
  in FPL 0, settle, select a right page that is not a waypoint page (NAV 1 on the right), press DCT, the left DIRECT TO
  page shows `ABC` in its ident field (3-27 rule 4; "checked in the KLN 89 trainer: the active waypoint is prefilled
  after power-up from a waypoint page and from NAV 1"). Sibling: ABC is active and the DIRECT TO page is open. If #119's
  own reproduction needs the power-up path (`engineRunning: false`, `powerOn()`, `approveSelfTest()`), use it. Fix to
  prove it: in `DirectToPage`'s default-ident logic fall back to the active waypoint (3-27 rule 4). Note in the report
  whether the right page after the boot is the active waypoint's page as 3-8 describes (a possible further finding).

- [ ] **Step 8: verify and commit.** `npm test`, `npx tsc --noEmit`, one commit with the `Proof:` lines and the pin-fix
  lines.

```json:metadata
{"files": ["test/unit/data/flightplan/ActiveWaypoint.test.ts", "test/render/services/ModeControllerObs.test.ts", "test/render/pages/left/DirectToObs.test.ts", "test/render/pages/left/DirectToPage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every new test passes or is a pin, each proven against its break", "pins #NEW-3-1..5, #82, #119 turn red under their fixes, each with a sibling", "#43 test without the CRSR assertion and re-proven", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 4: NavCalculator

**Goal:** Render spec tests for `NavCalculator`'s untested branches, one flight for the alert through a turn, and the pins
`#NEW-4-1` (flag resets the scale), `#NEW-4-2` (WPT light out mid-turn before the last leg), `#NEW-4-3` (no
sequencing when passing abeam).

**Files:**
- Modify: `test/render/data/navdata/NavCalculator.test.ts` (append new `describe` blocks)
- Create: `test/flight/flights/waypointAlertTurn.test.ts`

**Acceptance Criteria:**
- [ ] Every new test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] Each break of `research-C.md` section 0 item 1 (SET 6 ignored, 36 s → 20 s, 20 s → 15/24 s, fly-over ignored, the
      three MAP guards, the GPS-invalid branch, both 2 kt thresholds, the self-test DIS and XTK, the alert's turn-stack
      term, `setFlag`'s alert reset) fails at least one new test.
- [ ] The pins `#NEW-4-1` (three cases), `#NEW-4-2` and `#NEW-4-3` turn red under their named fixes; each has a passing
      sibling.
- [ ] The flight runs in under 2 s wall time.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-C.md` fully. Append the `describe` blocks of
  `scratchpad\NavCalculatorC.test.ts` to `test/render/data/navdata/NavCalculator.test.ts` (keep the existing #23 and
  6-10 blocks first; merge imports). Copy `waypointAlertTurn.test.ts` to `test/flight/flights/`. Rename: `#NEW-C-1` →
  `#NEW-4-1`, `#NEW-C-2` → `#NEW-4-2`, `#NEW-C-3` → `#NEW-4-3`.

- [ ] **Step 2: the render tests** (`research-C.md` section 2, rows 1 to 12, with the breaks of section 4):
    - FLY L/R and the NAV 1 bar (3-32, 3-31; B1, B16);
    - DTK along the great circle (5-33, 5-34; B2) — keep it, it guards the long-leg geometry other tests reuse;
    - DIS as the chord on an arc, 12.9 NM not 14.0 (6-18; B3);
    - the 36 s alert with SET 6 off: off at 1.3 NM, on at 1.1 NM at 120 kt (4-9; B4a, B4b);
    - the 36 s alert on an off-plan direct-to with SET 6 on (3-29; B4a, B4b);
    - the 20 s alert with turn anticipation: off at 1.05 NM, on at 0.84 NM before ABC (4-8; bounds derived in the report
      from the standard-rate radius, the 17.2° half turn and the roll-in; B5a/b/c);
    - sequencing without turn anticipation (4-9; B6, B15);
    - fly-over: the control and the test (4-2, 4-3; B7);
    - the MAP with and without turn anticipation (6-7; B8, B9, B10);
    - GPS invalid: NAV 1 `FLAG` rows and the HSI flag 0, and the WPT light off when the GPS is lost during the alert
      (3-31, 3-59; B11, B20);
    - below 2 kt (characterization; B12a, B12b);
    - the self-test DIS 34.5 NM and the half-scale right deviation, read late because of the filter overshoot
      (`#NEW-5-1`) (3-4; B13a, B13b).

- [ ] **Step 3: the pins.**
    - `#NEW-4-1` (three `it.fails` with two passing controls, `describe('CDI scale selected on MOD 1 (5-38)')`): the
      selected 1.00 NM over a GPS loss; the approach-arm 1 NM over a GPS loss (use `approachWorld()` from task 1 instead of
      the draft's local world if it fits; otherwise keep the draft's world); the selected 1.00 NM without an active
      waypoint. Fix: delete `nav.xtkScale = 5` from `NavCalculator.setFlag` (the self-test keeps its own line).
    - `#NEW-4-3` (`describe('passing a waypoint off course')`): control without turn anticipation sequences once ABC is
      behind (4-9); `it.fails` with turn anticipation sequences to KBBB once ABC is behind, 1.5 NM abeam (5-33, 4-8;
      "checked in the KLN 89 trainer: a waypoint passed 3.5 NM abeam was sequenced"). Fix: in the turn-anticipation
      branch also sequence when the turn stack is empty and `nav.toFrom === FROM` and the waypoint is not the MAP.

- [ ] **Step 4: the flight** (`waypointAlertTurn.test.ts`): KAAA, ABC, KBBB, KCCC (KCCC 20 NM from KBBB on 060), the
  coupled autopilot, start 3 NM before ABC. The spec test: a monitor that the light, once on, stays on until the turn at
  ABC has ended; one calculation tick after KBBB becomes active the turn stack is > 0 and the light 1;
  `flyUntil(() => turn stack empty, {description: 'end of the turn onto KBBB'})`, one second more, light 0, track within
  3° of leg 2, |XTK| < 0.1 NM (4-8, 4-9, the video cited at `NavCalculator.ts:193`, the maintainer's steady-light
  ruling). Then `jump(nmBefore('KBBB', 3))` and record the same around KBBB. The `it.fails` judge `#NEW-4-2` reads the
  recording: one tick after KCCC becomes active, with the turn stack > 0, the light is 1. Break B17 (drop
  `|| turnStack.length > 0`) fails the spec test; fix for the pin: `waypointAlert = eteToActive <= 36 ||
  turnStack.length > 0` in the else branch. Read `activeWaypoint.turnStack` through the property each time
  (`testing.md` section 6).

- [ ] **Step 5: verify and commit.** `npm test`, `npx tsc --noEmit`, one commit with the `Proof:` lines and the pin-fix
  lines; report the flight's wall time.

```json:metadata
{"files": ["test/render/data/navdata/NavCalculator.test.ts", "test/flight/flights/waypointAlertTurn.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every new test passes or is a pin, each proven against its break", "each listed research-C break fails at least one new test", "pins #NEW-4-1 (three), #NEW-4-2, #NEW-4-3 turn red under their fixes, each with a sibling", "flight under 2 s wall", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 5: approach modes, the #100 pin and the XTK filter

**Goal:** Render spec tests for the approach modes on `approachWorld()`, the MOD 1 pin `#NEW-5-2`, the roll steering pin
of #100, and unit tests of the XTK filter with the overshoot pin `#NEW-5-1`.

**Files:**
- Create: `test/render/services/ModeControllerApproach.test.ts`
- Create: `test/render/pages/left/Mod1Page.test.ts`
- Modify: `test/render/services/RollSteeringController.test.ts` (append one `describe`)
- Create: `test/unit/services/SignalOutputFilter.test.ts`

**Acceptance Criteria:**
- [ ] Every new test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The approach tests use `approachWorld()`; there is no pin for the GPS APR press before the FAF (ruled intended),
      only its passing sibling.
- [ ] The pins `#NEW-5-1`, `#NEW-5-2` and #100 turn red under their named fixes; each has a passing sibling.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-D.md` fully. Copy `drafts-D\ModeControllerApproach.test.ts` to
  `test/render/services/`, `drafts-D\SignalOutputFilter.test.ts` to `test/unit/services/`, and append the
  `describe('L:KLN90B_RollCommand far left of the leg on a parallel track (#100)')` block of
  `drafts-D\RollSteeringController.test.ts` (see the `.diff` next to it) to the existing file. Rename `#NEW-D-1` →
  `#NEW-5-1`, `#NEW-D-3` → `#NEW-5-2`.

- [ ] **Step 2: the approach world.** Replace the draft's local world (the facilities at the top and `approachLoaded`)
  with `approachWorld()` from `test/harness/fixtures.ts`: `const w = approachWorld()`, `bootUnit({facilities:
  w.facilities, position: w.north(nm), storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false}})`,
  `settle`, `loadProcedure('APT 8')`. Keep the helpers `nav`, `activeIdent`, `scaleAfter`, `flyTo`.

- [ ] **Step 3: the approach tests** (`research-D.md` section 1 table; the breaks are listed per row there): ENR ±5 at
  40 NM (6-3); ARM at 30 NM and the ramp over 30 s (6-1, 6-3, Installation Manual AFMS); the linear ramp
  (characterization); ARM by the switch at 40 NM keeps ±5 until 30 NM (6-1); the approach deleted returns to ENR ±5
  (6-7); APR at 2 NM and the ramp to 0.3, 0.3 to and past the MAP (6-3, 6-7); the linear ramp in distance
  (characterization); the GPS APR press past the FAF goes to ARM ±1 and stays (6-1, 6-3); a direct-to to the MAP gives
  ARM ±1 (3-29); OBS in ACTV gives ARM in OBS ±1 (6-3, 5-32); the press 1.5 NM before the FAF goes to ARM ±1 (6-1;
  the sibling only). **Delete the draft's `#NEW-D-2` pin** ("stays in ARM after the GPS APR press before the FAF"): the
  maintainer ruled the re-activation intended for now; task 6 files a question issue. Send the switch as the literal
  event `unit.panel.press('KLN90B_ApprArm_Push')`.

- [ ] **Step 4: MOD 1** (`test/render/pages/left/Mod1Page.test.ts`): move the two MOD 1 cases out of the approach file
  into this new file on `approachWorld()`: the sibling "shows CDI:±5.00NM in ENR 40 NM from the airport (5-38)" and the
  pin `#NEW-5-2` "shows CDI:±5.00NM when armed by the switch 40 NM from the airport". Fix to prove the pin: in
  `Mod1Page.buildValidScales` return `[0.3, 1, 5]` for ARM while `xtkScale >= 5`. (Mod2Page has the same code; mention
  it in the commit for task 6.)

- [ ] **Step 5: the #100 pin** (`research-D.md` section 2): sibling "the pin setup: 5 NM left of the leg, parallel to it,
  at 120 kt with HeadingInput on" (ABC active, `xtkToActive` about -5, track within 1° of the DTK); `it.fails('banks
  right, toward the leg (#100)')`: `L:KLN90B_RollCommand` < 0 and `GPS COURSE TO STEER` right of the track by more than
  0 and less than 90 degrees (Autopilot wiki: a 45° intercept toward the leg from either side). No formula values.
  Fix: `Math.abs(xtk) < 0.1` in case 1 of `RollSteeringController.updateBankAngle`.

- [ ] **Step 6: the XTK filter** (`research-D.md` section 3): `vi.useFakeTimers({toFake: ['Date']})` in `beforeEach`,
  `vi.useRealTimers()` in `afterEach`; `setValue` every 1000 ms, samples every 62 ms (`testing.md` section 6). Sibling
  "settles on a step in XTK (characterization)"; pin `#NEW-5-1` "does not overshoot a step in XTK" (the largest sample
  at most 1000; cite the Component Maintenance Manual's description of the D-bar output as an integrated PWM level, by
  page, per `maintenance-manual-index.md`); "follows a steadily changing XTK without lag (characterization)", judged
  from 3 s on. Prove the pin with the fix "extrapolate only while the measured rate keeps its sign" (the ramp test must
  stay green under it) and the ramp test with the break `next = m`.

- [ ] **Step 7: verify and commit.** `npm test`, `npx tsc --noEmit`, one commit with the `Proof:` lines and the pin-fix
  lines.

```json:metadata
{"files": ["test/render/services/ModeControllerApproach.test.ts", "test/render/pages/left/Mod1Page.test.ts", "test/render/services/RollSteeringController.test.ts", "test/unit/services/SignalOutputFilter.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every new test passes or is a pin, each proven against its break", "approach tests on approachWorld, no pin for the press before the FAF", "pins #NEW-5-1, #NEW-5-2, #100 turn red under their fixes, each with a sibling", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 6: issues and close-out

**Goal:** File the bugs and the two question issues, comment on #82, #100, #119 and #122, replace the placeholders,
update `testing.md` and write the session log.

**Files:**
- Modify: test files containing `#NEW-` placeholders
- Modify: `docs/test-coverage.md` (section 3 checkbox, section 4 log)
- Modify: `docs/testing.md`

**Acceptance Criteria:**
- [ ] Filed after a search of open and closed issues with several wordings: the bugs `#NEW-2-1` to `#NEW-2-3`,
      `#NEW-3-1` to `#NEW-3-5`, `#NEW-4-1` to `#NEW-4-3`, `#NEW-5-1`, `#NEW-5-2` (`bug` label), plus any further bug the
      reports or reviews confirmed; the two `question` issues (APR cancel before the FAF; the four approach-scale cases).
- [ ] #82, #100, #119 (relabeled `bug`) and #122 have their comments; `Ctr1Page`'s missing catch is filed or logged with
      the reason.
- [ ] `grep -r "#NEW-" test/` finds nothing.
- [ ] The session log has: done, rulings, trainer checks, bugs filed, fixes not re-broken, not covered (rule 18),
      coverage at start and end, suite totals.
- [ ] `npm test`, `npx tsc --noEmit` and `npm run coverage` are clean.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [ ] **Step 1: file the bugs** (`bug` label). For each: what is wrong, a reproduction with observed and expected values,
  file and line, impact, a suggested fix, the pin's test name. Cite manual pages, never copy manual text. Say "checked in
  the KLN 89 trainer" where the trainer confirmed it; otherwise "found in the headless harness, not reproduced in the
  sim". The facts are in the reports (`research-A.md` NEW-A to NEW-C, `research-B.md` NEW-B-1 to NEW-B-4,
  `research-C.md` NEW-C-1 to NEW-C-3, `research-D.md` D-1 and D-3) and the implementers' reports:
    - `#NEW-2-1` a waypoint typed over row 1 of a full FPL 0 lands before the last waypoint (`FlightplanUtils.ts`,
      `insertLeg(idx - 1)`; also reachable from APT 7 and CTR 1);
    - `#NEW-2-2` an insert or delete in front of an in-plan direct-to target makes it a random direct-to
      (`ActiveWaypoint.assertToMatchesFplIdx`; trainer);
    - `#NEW-2-3` DELETE FPL? is not saved (`Flightplan.delete()` does not publish; same family as #92);
    - `#NEW-3-1` LEG to OBS moves the deviation on long legs (5-36);
    - `#NEW-3-2` OBS to LEG activates the first copy of a duplicated waypoint (5-36);
    - `#NEW-3-3` OBS to LEG at an IAF = FAF keeps the IAF copy (6-11; references #129);
    - `#NEW-3-4` ACTIVATE in OBS recentres the D-bar (5-37; references #122, the same early return);
    - `#NEW-3-5` OBS to LEG on the FROM side makes a direct-to instead of re-activating the plan leg (5-36; trainer);
    - `#NEW-4-1` a NAV flag or no active waypoint resets the CDI scale to 5 (5-38);
    - `#NEW-4-2` the WPT light goes out at the sequencing onto the last leg while the turn is flown (4-8);
    - `#NEW-4-3` a waypoint passed more than about 1 NM abeam is never sequenced with turn anticipation on (trainer);
    - `#NEW-5-1` the XTK output filter overshoots a step by 100 % for one second (Component Maintenance Manual);
    - `#NEW-5-2` MOD 1 and MOD 2 show `CDI:±NM` without a value in ARM beyond 30 NM and for one tick at APR activation
      (5-38; references `#NEW-4-1`, whose ARM case shows the same blank).
- [ ] **Step 2: the question issues** (`question` label):
    - APR ACTV cannot be cancelled by the GPS APR switch before the FAF: the press gives ARM and the next calculation
      tick re-activates APR (`ModeController.ts` `armApproachPressed` and `checkSwitchAprArmToActive`); 6-1 says the
      switch cancels ACTV to ARM and implies a return to ACTV is possible before the FAF; the AVsoftech KLN 90B trainer
      (an unreliable third-party trainer) re-activated within about 2 s; the KLN 89 trainer cannot show ARM/ACTV.
      Treated as intended for now; references #139.
    - The four approach-scale cases of the spec (late OBS-to-LEG switch, direct-to the FAF inside 2 NM, a pilot-selected
      0.3 overwritten at activation, the scale above 1 when moving back beyond 2 NM), each with code lines and the
      guide pages (6-3, 6-11, 5-38); no trainer could show them.
- [ ] **Step 3: comments and labels.** #82: the headless reproduction (the cursor stays on after the direct-to, the next
  ENT inserts a blank leg; figure 4-42) and that the #43 test no longer asserts `CRSR`. #119: the KLN 89 trainer result
  (prefilled from a waypoint page and from NAV 1 after power-up, 3-27 rules 3 and 4), then change its label from
  `question` to `bug`. #100: the wrong-way case is now pinned (test name). #122: `#NEW-3-4` shares the early return of
  `setObs`. Check `Ctr1Page.insertIntoFpl` (no catch on a full plan): file it if CTR 2's `NOT ENOUGH ROOM IN FPL` check
  does not prevent it, otherwise log why it cannot be reached.
- [ ] **Step 4: replace the placeholders** in one commit (`references #NN …` per issue in the message).
- [ ] **Step 5: `testing.md`.** Section 3: `approachWorld()` (from task 1, check it is there). Section 6: the XTK filter
  overshoot makes XTK outputs read right after a step depend on the tick phase. Section 7: the `USE? INVRT?` overlay
  breaks `Screen.read()` on numbered FPL pages with legs (`FlightplanList.tsx`, `.use-invert`), with the fix idea; the
  open trainer questions #146 and #147; what the reports found as next steps.
- [ ] **Step 6: the session log** in `docs/test-coverage.md` section 4 (newest first), and tick Session 5's checkbox.
  Done per task; the maintainer's rulings; the trainer checks; bugs filed; fixes not re-broken; not covered (the spec's
  list plus what the reports add); the coverage table at the start (from the spec's start state, per directory) and at
  the end; the suite totals; note that the 98.85 % statement coverage of `NavCalculator.ts` at the start hid untested
  branches.
- [ ] **Step 7: run the checks and commit.**

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["bugs #NEW-2-1..3, #NEW-3-1..5, #NEW-4-1..3, #NEW-5-1..2 filed after duplicate search", "two question issues filed", "#82, #100, #119 (relabeled), #122 comments; Ctr1Page filed or logged", "no #NEW- placeholders", "session log complete", "checks clean"], "modelTier": "frontier"}
```
