# Session 3b regression tests (rows Session H unblocked): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A regression test for every triage row Session H made *testable*, plus #23, the #41 missed approach, the
pause half of `43d472b` and the `SidStar` flagged-repeat rule, each at the cheapest stage and proven to bite; pins for
#90 part 1, #102 and the new bugs the research found.

**Architecture:**
- **Task 1** adds three small harness pieces: `FrontPanel.loadProcedure`, `moveAircraft` and the Center frequency name.
- **Tasks 2 to 6** are five parallel batches. Each runs in its own git worktree branched from the session branch after
  task 1 is merged, and ends in one commit (plus one per fix round).
- **Task 7** files the issues, fills in the numbers, ticks the table and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest 5 (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the
headless harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-05-session-3b-unblocked-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task.
- **Branches.** The session branch is `tests-session-3b-unblocked`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`. Before anything else run
  `git reset --hard tests-session-3b-unblocked` on the (still empty) worktree branch and check `git log -1`. A missing
  `node_modules` is created as a junction to `E:\msfs\kln90b\node_modules` (never delete it recursively).
- **No behavior changes** in `kln90b/` (rule 12). Testability seams only, each named in its commit message.
- **Test names** carry the issue or commit: `'… (#18)'` or `'… (633fdad)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23), numbered per task from 1.
- **Spec, characterization or public contract** (`testing.md` section 5):
    - A spec test cites the Pilot's Guide page (or the KLN 89 trainer together with the fix commit) in a comment.
    - A characterization test has `characterization` in its `describe` or `it` title and no manual citation.
    - A public-contract test cites its source (`CLAUDE.md` "Public contract with aircraft", `LVars.ts`, `cfg/panel.xml`).
    - The page index is `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\pilots-guide-index.md`. Cite page numbers,
      never copy manual text.
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts` or by hand, never from the code under
  test or the SDK's flavor of the same formula. Setup may use SDK geometry.
- **Assertions.** No permissive assertions (rule 17). Where a test asserts several things, say in the report which
  ones the row's break turns red.
- **Pins.** Every `it.fails` has a passing sibling that asserts its heavy preconditions. A pin is proven by fixing the
  bug temporarily (the fix edit is named per pin below) and seeing it turn red, then restoring.
- **Proof per row (rule 10).** Put the original bug back by hand, run the test and see it fail, restore, check that
  `git diff` shows only test files. Never commit the broken state.
- **Commits (rule 22).** One commit per task, plus one per fix round, never amended. The message lists every row as
  `- <row>: Proof: fails when <break>` and ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
- **Implementers leave alone:** `docs/test-coverage.md`, GitHub issues, other tasks' rows and files.
- **Copyright and data.** Never commit manual text, navdata recorded from the sim or extracts of the real navigation
  database. Facilities are invented.
- **Research drafts** are in
  `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\75af0fd9-2e78-45a1-847d-c8ee10ecfca0\scratchpad\research-nav-drafts\`
  (`draftApr`, `draftArc`, `draftArcFlight`, `draftConversion`, `draftNav5Arc`, `draftProc`). They ran, but contain
  debugging output and loose naming: starting points, not finished tests. The four research reports are next to them
  (`research-nav.md`, `research-nearest.md`, `research-startup.md`, `research-displays.md`).
- **Reports** go to the same scratchpad folder as `report-task-<N>.md`. The reply to the controller is only the status,
  the head commit and concerns.

**User decisions (already made):**
- "Please only create a question Github issue for this for now and don't pin it yet. We will need to research this in
  more detail" (#90 part 2, APT 8).
- Bugs to file and pin: "Co-located IAF/FAF no APR", "hasDuplicates by reference", and "Also create a bug issue and pin
  for the merged arcs".
- "Please create a new Github issue with the label `enhancement` for the missing MOVE on FPL 0."
- "Yes, you can add a comment to #102."
- "Small harness task first (Recommended)".
- "Section 1 looks right", "Section 2 looks right", "Spec approved": the verdicts, the six tasks plus close-out, Sonnet
  implementers, Opus reviewers for tasks 2 to 4 and Sonnet for 1, 5 and 6.

---

## Facts every batch needs (from the research pass)

**Boot and settle.** `bootUnit` boots force-ready. `await settle(unit)` waits for the GPS and for FPL 0 to activate.
One calculation tick is exactly `await vi.advanceTimersByTimeAsync(1000)`.

**Loading a procedure** (task 1 adds the helper): `await unit.panel.loadProcedure('APT 8')`. With more than one airport,
pass `{ident: 'KPRC'}`. The helper takes the first procedure in the list and its only transition.

**Moving the aircraft in a render test** (task 1): `await moveAircraft(unit, point, {groundspeedKt: 120})` gives the GPS
the track of the jump; `{groundspeedKt, trackTrue}` sets a given track. Holding still afterwards is the paused sim: the
unit keeps the last track.

**A held position with ground speed can sequence the leg** (`NavCalculator.ts:200-238`: the alert plus a distance that
does not decrease). Keep the aircraft more than about 20 s of turn-start time away from the next waypoint, or boot with
`storage: {turnAnticipation: false}`.

**Arc geometry used throughout** (true radials, `magvar` 0):
- VOR `abc = vor('ABC', 47.3, 8.3)`, radius 10 NM, `at = (b, nm) => pointFrom({lat: 47.3, lon: 8.3}, b, nm)`.
- The left arc runs 270 to 180, the right arc 180 to 270, both through the south-west quarter.
- The tangent (DTK) on an arc, derived independently: `courseDeg(p, ABC) + 90` for a left (counterclockwise) arc,
  `- 90` for a right (clockwise) one. That is the course to the VOR plus 90°, not the radial ± 90; at 47° N they differ by
  about 0.13°.
- **Boot on the arc** (`at(225, 10)`) so that the arc leg is the closest and becomes active: FPL 0 is then
  `D225J ARCEN FAFAA MAPAA KPRC` with `ARCEN` active. Mid-arc activation is the open bug #121.
- **#104** names a right-arc entry wrongly after a recalculation: tests that pass through `recalculateArcEntryData`
  (MOVE?) use a left arc.
- The arc must not be the first leg that survives the conversion (`testing.md`, Procedures).

**Reading FPL 0:** `unit.props.memory.fplPage.flightplans[0].getLegs()`; the active waypoint is
`unit.props.memory.navPage.activeWaypoint` (`getActiveFplIdx()`, `getActiveWpt()`).

**Panel.xml options are nested elements:**
`<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><Airdata><IsInterfaced>true</IsInterfaced></Airdata></Input></Instrument></PlaneHTMLConfig>`.

---

### Task 1: harness helpers

**Goal:** `FrontPanel.loadProcedure`, `moveAircraft` and a frequency name on Center airspaces, each with a harness test
that fails when the helper is disabled, and the docs.

**Files:**
- Modify: `test/harness/flight/FrontPanel.ts` (`loadProcedure`)
- Modify: `test/harness/boot.ts` (`moveAircraft`, next to `settle`)
- Modify: `test/harness/navdata/airspaces.ts` (`frequencyName` option)
- Modify: `test/render/harness/procedures.test.ts` (a `loadProcedure` test)
- Create: `test/render/harness/moveAircraft.test.ts`
- Modify: `test/render/harness/airspaces.test.ts` (an OTH 2 Center test)
- Modify: `docs/testing.md` sections 3 and 4

**Acceptance Criteria:**
- [ ] `loadProcedure('APT 8')` on a one-airport world leaves FPL 0 holding the approach legs and the right cursor off; a
      harness test asserts the loaded idents and fails when the helper skips its last ENT.
- [ ] `loadProcedure('APT 7', {ident})` selects the given airport when the world has two; a harness test proves it.
- [ ] `moveAircraft(unit, p, {groundspeedKt: 120})` leaves `gps.trackTrue` within 0.01° of `courseDeg(from, p)`, and
      with `{trackTrue: 45}` within 0.01° of 45; the track holds over a further 5 s. The test fails when the helper does
      not set `GROUND VELOCITY`.
- [ ] A Center airspace built with `frequencyMHz` shows its name and frequency on OTH 2 without errors; the test fails
      when the name is removed again.
- [ ] `testing.md` describes the three, and nothing under `kln90b/` changes.

**Verify:** `npx vitest run test/render/harness && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: `FrontPanel.loadProcedure`.**

```ts
/**
 * Loads the first procedure of APT 7 or APT 8 into FPL 0 the way a pilot does (testing.md, Procedures): select the
 * page, enter the airport when given (the APT pages open on the first airport of the scan list), cursor, ENT on the
 * first entry (its only transition is taken without a question), ENT on LOAD IN FPL, cursor off. FPL 0 scrolls to the
 * active leg only at the next calculation tick, so it waits one second.
 */
public async loadProcedure(page: 'APT 7' | 'APT 8', o: { ident?: string } = {}): Promise<void> {
    if (o.ident !== undefined) {
        // The APT pages show one airport; it is chosen with the ident selector of APT 1 (3-42)
        await this.selectPage('R', 'APT 1');
        await this.cursor('R');
        await this.enterIdent('R', o.ident);
        await this.cursor('R');
    }
    await this.selectPage('R', page);
    await this.cursor('R');
    await this.ent();
    await this.ent();
    if (this.screen().status().right === 'CRSR') await this.cursor('R');
    await vi.advanceTimersByTimeAsync(1000);
}
```

  Confirm both paths by running. In the existing harness test, `cursor('R')` on APT 8 puts the cursor on the first
  procedure, so ENT selects it; check that this still holds after an ident was entered on APT 1, and that APT 7/8 then
  show the entered airport (if the airport selector of APT 8 takes the cursor first, step over it with `cursorTo`). Use
  the status-line read that `FrontPanel` already has for `CRSR` if `screen().status()` is not how it does it.
  Harness tests in `procedures.test.ts`: the RNAV 27 of that file through `loadProcedure('APT 8')` gives the APP legs
  `IAFAA, IFAAA, FAFAA, MAPAA, MAHAA` (the same literal the existing test asserts); a two-airport world (`KPRC` with the
  approach, `KAAB` without) loads with `{ident: 'KPRC'}`. Disable the last ENT: the first test fails.

- [ ] **Step 2: `moveAircraft`** in `test/harness/boot.ts`.

```ts
/**
 * Moves the aircraft of a render test so that the GPS computes a track (Gps.ts takes it from the last two positions
 * when the ground speed is at least 2 kt, 3-35). Without trackTrue the track is that of the jump from the present
 * position; with it, the aircraft first jumps to a point 0.05 NM behind the target on that track. Each jump is followed
 * by exactly one calculation tick. Afterwards the position holds, which is a paused sim: the unit keeps the track.
 */
export async function moveAircraft(unit: HeadlessUnit, to: { lat: number; lon: number },
                                   o: { groundspeedKt: number; trackTrue?: number }): Promise<void> {
    const sim = unit.env.sim;
    sim.set('GROUND VELOCITY', 'knots', o.groundspeedKt);
    if (o.trackTrue !== undefined) {
        const from = pointFrom(to, (o.trackTrue + 180) % 360, 0.05);
        sim.set('PLANE LATITUDE', 'degrees', from.lat);
        sim.set('PLANE LONGITUDE', 'degrees', from.lon);
        await vi.advanceTimersByTimeAsync(1000);
    }
    sim.set('PLANE LATITUDE', 'degrees', to.lat);
    sim.set('PLANE LONGITUDE', 'degrees', to.lon);
    await vi.advanceTimersByTimeAsync(1000);
}
```

  `pointFrom` comes from `flight/geo.ts`. Harness test `moveAircraft.test.ts`: boot at 47/8, `settle`, move to
  `pointFrom({lat: 47, lon: 8}, 45, 0.05)` with 120 kt: `unit.props.sensors.in.gps.trackTrue` is within 0.01° of
  `courseDeg({lat: 47, lon: 8}, target)`; advance 5 s, unchanged. A second test with `trackTrue: 200` to a point 1 NM away:
  within 0.01° of `courseDeg(pointFrom(target, 20, 0.05), target)`. Break: drop the `GROUND VELOCITY` line; the track
  stays at its initial value and both fail. Note in the doc comment that the order of the two ticks relative to the
  display tick does not matter, because only the calculation reads the position.

- [ ] **Step 3: the Center frequency name.** `airspaces.ts`: add `frequencyName?: string` to `AirspaceOptions` and build
  `frequency: {freqMHz: o.frequencyMHz, name: o.frequencyName ?? name}`. `Oth2Page.redraw` reads `centers[0].name`
  (`kln90b/pages/left/Oth2Page.tsx`); without it the page throws on every display tick. Harness test in
  `airspaces.test.ts`: a Center square around the position (`airspace('TEST CENTER', BoundaryType.Center, square,
  {frequencyMHz: 118.55})`), `selectPage('L', 'OTH 2')`, advance 2 s: `rows('L').slice(0, 3)` is
  `['TEST CENTER', 'CTR        ', '     118.55']` and `unit.errors` is empty. Confirm the literal rows by running.

- [ ] **Step 4: docs.** `testing.md` section 3, Procedures: a bullet for `loadProcedure`, replacing the hand-written
  sequence as the recommended way. Section 4, Render: a bullet for `moveAircraft` (the track of the jump, `trackTrue`,
  the held position is a paused sim, and the sequencing caveat above). Section 3, Airspaces: the `frequencyName` option.

- [ ] **Step 5: verify and commit.** `npx vitest run test/render/harness`, `npx tsc --noEmit`, then one commit with a
  `Proof:` line per helper.

```json:metadata
{"files": ["test/harness/flight/FrontPanel.ts", "test/harness/boot.ts", "test/harness/navdata/airspaces.ts", "test/render/harness/procedures.test.ts", "test/render/harness/moveAircraft.test.ts", "test/render/harness/airspaces.test.ts", "docs/testing.md"], "verifyCommand": "npx vitest run test/render/harness && npx tsc --noEmit", "acceptanceCriteria": ["loadProcedure loads APT 8 approach, harness test bites", "loadProcedure with ident selects the airport", "moveAircraft sets the jump track and trackTrue, holds, bites without GROUND VELOCITY", "Center airspace shows on OTH 2 with name and frequency", "testing.md updated, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 2: `SidStar` conversion (unit)

**Goal:** Unit tests for the arc ending at the IF and the left-hand entry ranges (`7fd640e`/`1ef2a35`), the flagged-repeat
rule, the intended same-navaid arc merge, and pins for `hasDuplicates` by reference and the merged radius of
`AF, CI, AF`.

**Files:**
- Modify: `test/unit/data/navdata/SidStar.test.ts`

**Acceptance Criteria:**
- [ ] Each row fails under its own break (below) and passes on clean code; the proof lines are in the commit.
- [ ] The two pins are `it.fails('… (#NEW-2-1)')` and `(#NEW-2-2)`, each proven by the temporary fix named below, each
      with a passing sibling.
- [ ] Expectations are idents, fix types and radials from `geo.ts` or construction, never from `SidStar`.
- [ ] Report written.

**Verify:** `npx vitest run test/unit/data/navdata/SidStar.test.ts` → passes, the two pins as expected failures.

**Steps:**

- [ ] **Step 0: the unit scaffold** (no boot; `SidStar` reads only `getFacility`, `repo.add` and `gps.coords` here):

```ts
const convert = (facs: Facility[], at: {lat: number; lon: number}, kprc: AirportFacility, app: ApproachProcedure) =>
    new SidStar(new MemoryFacilityClient(facs) as any, {add() {}} as any,
                {in: {gps: {coords: new GeoPoint(at.lat, at.lon)}}} as any)
        .getKLNApproachLegList(kprc, app, app.transitions[0]);
```

  For a STAR use `getKLNProcedureLegList(kprc, star, KLNLegType.STAR, null, null)`. Read the existing file first; it
  already builds facilities with the Session H builders. Copy from `draftConversion.test.ts`.

- [ ] **Step 1: (a) an arc ending at the IF keeps its arc data** (`7fd640e`, `SidStar.addArcInfoIfPrevIsSame`,
  `SidStar.ts:449-457`).
    - Setup: transition `[Leg.IF(arcbg, IAF), Leg.AF(ifaaa, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: Left})]`,
      final `[Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FAF), Leg.TF(mapaa, MAP)]`, with `arcbg = at(270, 10)`,
      `ifaaa = at(180, 10)`; aircraft at `at(225, 20)`.
    - Expected: idents `['D225J', 'IFAAA', 'FAFAA', 'MAPAA']`, the entry's fix type IAF, and the `IFAAA` leg carries
      `arcData` (defined, with `circle`).
    - Break: `SidStar.ts:450` becomes `if (true) {` (the early return always taken). Observed under it:
      `[ARCBG (IAF, no arc), IFAAA, …]`.
    - Label: spec 6-16, 6-17.

- [ ] **Step 2: (b) left-hand entry ranges** (the `getArcEntryData` half of `1ef2a35`, `SidStar.ts:624-632`).
    - Left arc 270→180: aircraft at `at(225, 20)` gives entry `D225J`; at `at(45, 20)` (radial outside the arc) gives
      `D270J`, the start of the arc. Right arc 180→270 at `at(45, 20)` gives `D180J` (control).
    - Break: swap the two arguments at `SidStar.ts:625-626` (`course`, `theta`). Observed: `D270J` and `D045J`.
    - Label: spec 6-16 (the intercept lies on the present radial, or at the beginning of the arc when that radial is
      outside it).

- [ ] **Step 3: the flagged-repeat rule** (`SidStar.ts:402`, the `BitFlags.isAny(…IAF, FAF, MAP, MAHP)` clause).
    - Setup: VOR approach, transition `[Leg.IF(txo, IAF)]`, final `[Leg.IF(txo, FAF), Leg.TF(mapaa, MAP)]`.
    - Expected `[[TXO, IAF], [TXO, FAF], [MAPAA, MAP]]` (ident and `KLNFixType`).
    - Break: drop the `BitFlags.isAny(...)` clause. Observed `[[TXO, FAF], [MAPAA, MAP]]`.
    - Label: spec 6-10 (the example lists the co-located fix twice), 6-11 (switching to LEG makes the FAF active when IAF
      and FAF are the same waypoint, which needs both entries).

- [ ] **Step 4: the intended same-navaid merge** (spec 6-18: step-down fixes on an arc are not in the database).
    - Setup: two consecutive AF legs on `abc`, both radius 10, the first 270→225 ending at `at(225, 10)` (unflagged), the
      second 225→180 ending at `at(180, 10)`; aircraft at `at(260, 20)`.
    - Expected: one arc: entry `D260J`, then the end fix of the second arc; no leg for the step-down fix; the entry's arc
      runs from radial 260 (to within 0.5°) toward 180.
    - Break: in `mergeAFsIfNecessary` remove `leg.course = prev.course`; the merged arc then starts at 225 and the entry
      is `D225J`. Confirm by running.

- [ ] **Step 5: pin `hasDuplicates` by reference (`#NEW-2-1`).**
    - `SidStar.ts:67-71` uses `procedureIcaos.includes(fplLeg.wpt.icaoStruct)`, a reference comparison.
    - Passing sibling: the same `icaoStruct` object in both lists gives `true`.
    - Pin: an FPL leg whose `wpt.icaoStruct` is a structurally equal copy (`{...struct}`) of a procedure leg's gives
      `true` (6-5, B-3: the unit tells the pilot about redundant waypoints). Today `false`.
    - Prove: replace `includes` with `some(i => ICAO.valueEquals(i, fplLeg.wpt.icaoStruct))`; the pin turns red. Restore.

- [ ] **Step 6: pin the merged radius of `AF, CI, AF` (`#NEW-2-2`).**
    - Real STARs have `AF, CI (no fix), AF` on one navaid with two radii. `isLegSupported` drops the fixless CI leg
      before `filterOutDuplicates`, the first arc is dropped as `bothAreAF`, and `mergeAFsIfNecessary` keeps only the
      second arc's radius.
    - Setup (STAR, `common` legs): `Leg.IF(stfix)`, `Leg.AF(arc1end, abc, {radiusNm: 13, fromRadial: 270, toRadial: 225, turn: Left})`,
      a CI leg built inline (`FlightPlan.createLeg({type: LegType.CI, course: 135})`; the harness has no `Leg.CI`),
      `Leg.AF(arc2end, abc, {radiusNm: 10, fromRadial: 225, toRadial: 180, turn: Left})`, `Leg.TF(final)`. `arc1end =
      at(225, 13)`, `arc2end = at(180, 10)`, `stfix = at(270, 20)`.
    - Passing sibling: the conversion completes and contains `arc2end`.
    - Pin: the converted list keeps `arc1end`, and the arc that ends there has a radius of 13 NM (convert
      `arcData.circle.radius` from great-arc radians to NM by hand, to within 0.1 NM). Today `arc1end` is missing and the
      only arc has 10 NM.
    - Prove: make `bothAreAF` false when the two arcs differ in navaid or radius (`leg.rho !== next.rho`), and skip the
      `course` copy in `mergeAFsIfNecessary` in the same case; the pin turns red. Restore. If the proof fix needs more
      (the junction fix), describe in the report what it took.
    - Label: spec 6-16 to 6-18 (an arc is flown at its published DME distance).

- [ ] **Step 7: report** (per row: path, label, break that bit; the two pins with their proof edits).

```json:metadata
{"files": ["test/unit/data/navdata/SidStar.test.ts"], "verifyCommand": "npx vitest run test/unit/data/navdata/SidStar.test.ts", "acceptanceCriteria": ["arc ending at IF, left entry ranges, flagged repeat, same-navaid merge each bite", "hasDuplicates and AF-CI-AF pins proven by temporary fix", "expectations independent", "report written"], "modelTier": "standard"}
```

---

### Task 3: approaches in FPL 0 (render)

**Goal:** Render tests for #23, the #41 missed approach and `633fdad`, the co-located IAF/FAF sequencing sibling, and the
pin for the co-located IAF/FAF that never switches to APR.

**Files:**
- Create: `test/render/data/navdata/NavCalculator.test.ts` (#23, co-located sequencing)
- Modify: `test/render/data/flightplan/ActiveWaypoint.test.ts` (#41 missed approach)
- Modify: `test/render/services/ModeController.test.ts` (`633fdad`, the APR pin and its sibling)

**Acceptance Criteria:**
- [ ] Each row fails under its break and passes on clean code; proof lines in the commit.
- [ ] The APR pin is `it.fails('… (#NEW-3-1)')`, proven by the temporary fix below, with a passing sibling (IAF copy
      active, `ARM_LEG`).
- [ ] Every precondition (the FPL 0 idents, the active index, the mode before the move) is its own assertion.
- [ ] Report written.

**Verify:** `npx vitest run test/render/data/navdata/NavCalculator.test.ts test/render/data/flightplan/ActiveWaypoint.test.ts test/render/services/ModeController.test.ts` → passes, the pin as expected failure.

**Steps:**

- [ ] **Step 1: #23 (`3364def`): a STAR whose first fix repeats the last en-route waypoint.**
    - Fix: the NaN guard at `NavCalculator.ts:94` (FROM and TO are the same fix, the path's center is NaN, sequence on).
    - World: `KDST` (47.0, 8.0); VOR `KPT` 20 NM north; `ENRAA` 30 NM north of `KPT`; `STARB` 8 NM from `KPT` on 135.
      STAR `KPT4H` with `common: [Leg.IF(kpt), Leg.TF(starb)]`.
    - Boot 3 NM north of `KPT` with `savedFlightplan(0, [enraa, kpt, kdst])`, `settle`, `loadProcedure('APT 7')`.
    - Preconditions: FPL 0 idents `ENRAA KPT KPT STARB KDST`, active index 1; the MSG list
      (`unit.props.messageHandler.getMessages()`) holds `REDUNDANT WPTS IN FPL` (6-5, B-3).
    - Move: `moveAircraft(unit, 0.3 NM south of KPT, {groundspeedKt: 120})`, advance 2 s.
    - Expected: `unit.errors` empty, active index 3 (`STARB`), DTK within 0.5° of `courseDeg(kpt, starb)`.
    - Break: `NavCalculator.ts:94`, replace `&& isNaN(fromLeg.path.center[0])` with `&& false`. Two errors follow
      ("the specified point does not lie on this circle").
    - Label: spec 6-5 and B-3 for the message, the KLN 89 trainer and `3364def` for sequencing through (as
      `duplicateWaypoint.test.ts`). Copy from `draftProc.test.ts`.

- [ ] **Step 2: co-located IAF/FAF sequencing sibling** (same file). VOR approach with `TXOAA` 5 NM north of `KPRC` as
  IAF and FAF (transition `[Leg.IF(txo, IAF)]`, final `[Leg.IF(txo, FAF), Leg.TF(mapaa, MAP)]`), FPL `[ENRAA (30 NM north),
  KPRC]`, boot 1.6 NM north of `TXOAA`, `loadProcedure('APT 8')`. Preconditions: FPL 0 `ENRAA TXOAA TXOAA MAPAA KPRC`,
  fix types IAF and FAF on the two `TXOAA` legs, active index 1. Move to 0.3 NM south of `TXOAA` on track 180: no errors,
  `MAPAA` active (6-10: the unit sequences through the IAF/FAF to the MAP). Break: as step 1. Label: spec 6-10.

- [ ] **Step 3: the #41 missed-approach scenario** (`42099f3`, `ActiveWaypoint.ts:297`).
    - World: `KDST` (47.0, 8.0) with `MAPAA` at the airport; VOR `VVV` 5 NM south (FAF and MAHP); `IFAAA` 10 NM south;
      `ENRAA` 30 NM from `IFAAA` on 240. VOR 36: transition `[Leg.IF(ifaaa, IAF)]`, final `[Leg.IF(ifaaa), Leg.TF(vvv, FAF),
      Leg.TF(mapaa, MAP)]`, missed `[Leg.DF(vvv), Leg.HM(vvv, 0, Right, MAHP)]`.
    - FPL `[ENRAA, KDST]`; the aircraft 7 NM south of `MAPAA` and 1 NM east (abeam `IFAAA`→`VVV`, 2 NM before the FAF).
      `loadProcedure('APT 8')`, advance 2 s.
    - Expected: FPL 0 `ENRAA IFAAA VVV MAPAA VVV KDST`, active index 2 (`VVV`, the FAF).
    - Break: `ActiveWaypoint.ts:297` becomes
      `if (!(tempClosestGeoPoint.distance(tempFromGeoPoint) <= tempFromGeoPoint.distance(to))) {` (the old rule). Active
      index becomes 4, the missed-approach leg `MAPAA`→`VVV`, whose extension passes 1 NM from the aircraft. By hand
      (flat earth): the old metric gives 1.0 NM for MAP→MAHP and 3.16 NM for IF→FAF.
    - Label: characterization, as the existing #41 tests (put it in a `describe` with `characterization` in the title).

- [ ] **Step 4: `633fdad`, the APR switch tolerance of 110°** (`ModeController.ts:369`).
    - World: `KPRC` (47.0, 8.0), `MAPAA` at the airport, `FAFAA` 5 NM north (final course 180), `IFAAA` 5 NM before the
      FAF on the inbound course, `IAFAA` 10 NM before it. Transition `[Leg.IF(iafaa, IAF), Leg.TF(ifaaa)]`, final
      `[Leg.IF(ifaaa), Leg.TF(fafaa, FAF), Leg.TF(mapaa, MAP)]`.
    - Boot 1.6 NM before the FAF on the inbound course with `storage: {...savedFlightplan(0, [kprc]), turnAnticipation:
      false}`, `settle`, `loadProcedure('APT 8')`, advance 3 s. Preconditions: `FAFAA` active, mode `NavMode.ARM_LEG`.
    - Move to 1.55 NM before the FAF with `{groundspeedKt: 120, trackTrue: 80}` (100° off the final course): mode
      `NavMode.APR_LEG`. A second test with `trackTrue: 60` (120° off): stays `ARM_LEG`.
    - Break: `> 110` becomes `> 70`; the 100° case stays `ARM_LEG`.
    - Why a final course of 180: `checkSwitchAprArmToActive` reads `gps.trackTrue`, which is 0 at rest; a final course
      within 110° of 000 would activate before the aircraft moves.
    - Label: spec 6-3 for the 100° case (the aircraft heads toward the FAF); the 120° case and the 110° limit are a
      characterization (separate `it` with the word in the title). Copy from `draftApr.test.ts`.

- [ ] **Step 5: pin: a co-located IAF/FAF never switches to APR (`#NEW-3-1`).** `ModeController.ts:350` returns unless
  the active waypoint's fix type is FAF; with a co-located IAF/FAF the IAF copy is active during the last 2 NM.
    - Setup: the world of step 2, `turnAnticipation: false`, boot 1.6 NM north of `TXOAA`, load, then
      `moveAircraft(unit, 1.55 NM north of TXOAA, {groundspeedKt: 120, trackTrue: 180})`.
    - Passing sibling: the IAF copy (index 1) is active and the mode is `ARM_LEG` before the move.
    - Pin: after the move the mode is `NavMode.APR_LEG` (6-3 lists a co-located IAF/FAF as the active waypoint; 6-10,
      the example switches 2 NM from the IAF/FAF). Today `ARM_LEG`.
    - Prove: at `ModeController.ts:350` also accept an IAF whose next leg is the same fix with type FAF; the pin turns
      red. Restore.

- [ ] **Step 6: report** (also: does `checkSwitchAprArmToActive` reading the stale `gps.trackTrue` at rest show up in
  any of these tests? Say so if it does, with a reproduction).

```json:metadata
{"files": ["test/render/data/navdata/NavCalculator.test.ts", "test/render/data/flightplan/ActiveWaypoint.test.ts", "test/render/services/ModeController.test.ts"], "verifyCommand": "npx vitest run test/render/data/navdata/NavCalculator.test.ts test/render/data/flightplan/ActiveWaypoint.test.ts test/render/services/ModeController.test.ts", "acceptanceCriteria": ["#23, co-located sequencing, #41 missed approach, 633fdad each bite", "co-located APR pin proven with passing sibling", "preconditions asserted separately", "report written"], "modelTier": "standard"}
```

---

### Task 4: DME arcs flown and shown

**Goal:** Flights for the #18 flown direction and `326da1a`; render tests for the #18 drawn direction, #17, #21 and the
Super NAV 5 MOVE? state after ENT.

**Files:**
- Create: `test/flight/flights/dmeArc.test.ts` (#18 flown, `326da1a`)
- Modify: `test/render/pages/left/Nav5Page.test.ts` (#18 drawn, #17)
- Modify: `test/render/SensorsOutSimVars.test.ts` (#21)
- Create: `test/render/controls/selects/SuperNav5DirectToSelector.test.ts` (MOVE?)
- Create (if the snapshot is too large inline): `test/render/pages/left/__snapshots__/nav5ArcEndOffCircle.txt`

**Acceptance Criteria:**
- [ ] Each row fails under its break; #17 carries two proof lines (pixels and the original exception).
- [ ] The flights: one issue per flight, every `flyUntil` names its predicate, expectations from `geo.ts` and the
      bounds below.
- [ ] #17 is labeled characterization; the others cite their pages or the contract.
- [ ] Report written.

**Verify:** `npx vitest run test/flight/flights/dmeArc.test.ts test/render/pages/left/Nav5Page.test.ts test/render/SensorsOutSimVars.test.ts test/render/controls/selects/SuperNav5DirectToSelector.test.ts` → passes.

**Steps:**

- [ ] **Step 1: #18 flown direction (`15d9b35`, flight).** The functional change is `circle.reverse()` for right-hand arcs
  in `SidStar.getArcEntryData` (`SidStar.ts:631`). The author's doubt comment there is unfounded: an SDK `GeoCircle` runs
  counterclockwise, so a right arc needs the reverse.
    - World (right arc): `ABC`; `ARCBG = at(180, 10)`, `ARCEN = at(270, 10)`; `FAFAA = at(270, 5)`; `MAPAA` and `KPRC`
      at `at(270, 1)`. RNAV approach: transition `[IF(ARCBG, IAF), AF(ARCEN, ABC, {10, 180→270, Right}), TF(FAFAA, FAF)]`,
      final `[TF(MAPAA, MAP)]`. The left arc mirrors it: 270→180, `FAFAA = at(180, 5)`, `MAPAA = at(180, 1)`.
    - Flight: start on the arc at `at(190, 10)` (left: `at(260, 10)`), track `courseDeg(p, ABC) - 90` (left `+ 90`),
      120 kt, 3000 ft; `storage: savedFlightplan(0, [kprc])`; load through APT 8 (`flight.panel.loadProcedure('APT 8')`),
      then `fly(2)`. Precondition: FPL 0 `D190J ARCEN FAFAA MAPAA KPRC` (left `D260J …`), `ARCEN` active.
    - Monitor while `ARCEN` is active, from 20 s on: `|distanceNm(ABC, aircraft) - 10| < 0.3` (measured max 0.18 NM,
      including the corner cut at the arc's end). Also: the radial `courseDeg(ABC, aircraft)` never steps back against
      the turn direction.
    - `flyUntilActive('FAFAA', {timeout: 540})` (measured 414.75 s; the arc is 80° of 10 NM = 13.96 NM = 419 s at
      120 kt, minus the anticipation).
    - Break: comment out `SidStar.ts:631`. The right arc fails (the aircraft spirals into the VOR: 9.02 NM at 60 s), the
      left passes. The distance band is the predicate that bites; the radial monitor alone trips only at 531 s.
    - Label: spec 6-16 to 6-18. Model on `largeTurn.test.ts`; copy from `draftArcFlight.test.ts`.

- [ ] **Step 2: `326da1a`, anticipation at the end of an arc uses the DTK there (flight, same file).**
    - Fix: `NavCalculator.ts:177`, `fromDtk = fromLeg.path.bearingAt(fromLeg.path.closest(toLeg.wpt))`.
    - Setup: right arc of **radius 5 NM** around `ABC`, 180→270; `FAFAA = at(270, 2.5)`. The next course
      `courseDeg(ARCEN, FAFAA)` ≈ 89.91, a right turn of 90°. Start on the arc at `at(200, 5)`, tangent track, **180 kt**.
    - `flyUntil(ARCEN no longer active || angleBetween(dtk, nextCourse) < 1, {description: 'turn onto the FAF leg started'})`.
      Assert `ARCEN` is still active and `distanceNm(aircraft, ARCEN)` is in (1.01, 1.35).
    - Bounds: bank `min(57.3·atan(180/362.1), 25)` = 25° (capped); `r = v²/(g·tan 25°)` = 1.01 NM, the lower bound
      `r·tan(45°)`; the roll-in adds 25°/(5°/s)·180/3600 = 0.25 NM and one calculation tick 0.05 NM, the upper bound 1.35.
      Measured 1.244.
    - Break: `const fromDtk = dtk;`. The turn starts at 5.54 NM, at once (200° to 090 looks like a 160° turn).
    - **Keep the tight geometry:** at 10 NM and 120 kt the broken and correct starts differ by about 0.06 NM. Say so in a
      comment.
    - Label: spec 6-18 (alerting and anticipation to the next leg at the end of the arc), 4-8.

- [ ] **Step 3: #18 drawn direction (render, `Nav5Page.test.ts`).**
    - World: as step 1, but `FAFAA = at(to, 14)`, `MAPAA` and `KPRC` at `at(to, 18)`, so that the rest of the plan stays
      out of the north-east quarter. Boot at `at(225, 10)` with `storage: {...savedFlightplan(0, [kprc]),
      nav5MapOrientation: 0, nav5MapRange: 25}`; load; `moveAircraft` to `pointFrom(ABC, 90, 0.5)` with ground speed 0
      (not exactly onto the VOR: there the unit throws, see the report's minor notes); `selectPage('L', 'NAV 5')`, advance
      2 s.
    - Count the `#` pixels of `canvasToAscii(document.querySelector('canvas'))` (396×312) per quarter around the center,
      leaving a margin of ±8 px. Assert NE = 0 and SW > 20, for both directions (measured right 0/620/204/0 for
      NE/SW/NW/SE, left 0/608/0/0; NW holds the labels).
    - Break: comment out `SidStar.ts:631`; the right arc gives NE = 328 (the long way round).
    - Label: spec 6-17. The full revert of `15d9b35` only moved the arrowhead; say so in a comment. Copy from
      `draftNav5Arc.test.ts`.

- [ ] **Step 4: #17 (`e290ea4`), NAV 5 with the arc's end fix off the circle (render, `Nav5Page.test.ts`).**
    - World: right arc 180→270 radius 10, `ARCEN = at(270, 13)` (3 NM outside the circle), the rest as in
      `test/render/harness/procedures.test.ts`'s arc scenario. Boot at `at(225, 10)` with
      `storage: {...savedFlightplan(0, [kprc]), nav5MapRange: 10}`; `settle`; `loadProcedure('APT 8')`;
      `selectPage('L', 'NAV 5')`; advance 2 s.
    - Assert the precondition `getActiveWpt().icaoStruct.ident === 'ARCEN'` (so the arrow branch is drawn), then
      `unit.errors` and `unit.consoleErrors` empty, then a snapshot of the canvas (`toMatchFileSnapshot` or an inline
      snapshot of a crop around the arc end).
    - Proof 1 (pixels): `Nav5Page.tsx:168`, `prevleg.arcData.endPoint` → `prevleg.arcData.endFacility`. No error; the
      snapshot differs. Offsets of 0.3 or 1 NM give identical pixels: keep 3 NM and say why in a comment.
    - Proof 2 (the original exception): `git show e290ea4^:kln90b/controls/Canvas.tsx > kln90b/controls/Canvas.tsx` and
      the same for `kln90b/pages/left/Nav5Page.tsx`; the right-turn arc throws `GeoCircle: the specified point does not
      lie on this circle`, and the no-error assertion fails. Restore with `git checkout -- kln90b`.
    - Label: characterization (the title says so; no page cited).

- [ ] **Step 5: #21 (`1e1a8f5`), `GPS WP TRUE BEARING` (render, `SensorsOutSimVars.test.ts`).**
    - Fix: `NavCalculator.ts:152-157` sets `bearingForAP` to the DTK when the leg path is not a great circle;
      `SensorsOut.setWpBearing` writes `GPS WP BEARING` and `GPS WP TRUE BEARING` from it.
    - Arc case: left-arc world (`ARCBG = at(270, 10)`, `ARCEN = at(180, 10)`, `FAFAA` (47.1, 7.9), `MAPAA` and `KPRC` at
      (47.0, 8.0)); boot at `at(225, 10)`, load; `moveAircraft` to `p = at(210, 10)` with ground speed 0; advance 2 s.
      `GPS WP TRUE BEARING` in degrees is within 0.05 of `courseDeg(p, ABC) + 90` (119.91). `L:KLN90B_GPS_WP_BEARING`
      in degrees is within 0.05 of `courseDeg(p, ARCEN)` (104.91).
    - Great-circle case: same boot, then `activeWaypoint.sequenceToNextWaypoint()` (`FAFAA` active from `ARCEN`); move to
      the point 2 NM along `ARCEN`→`FAFAA` and 1 NM to its right: `GPS WP TRUE BEARING` within 0.05 of
      `courseDeg(p, FAFAA)` (259.12), while the DTK is 263.07.
    - Break: `NavCalculator.ts:156`, `nav.bearingForAP = dtk` → `nav.bearingToActive`. The arc case fails; the
      great-circle case passes (it is the unchanged half; say so).
    - Label: public contract (`CLAUDE.md`, GPS SimVars); Appendix A for the LVar.

- [ ] **Step 6: Super NAV 5 MOVE? state after ENT (`1ef2a35`(c), render).**
    - Fix: `SuperNav5DirectToSelector.tsx:107`, `this.isMovingArc = false` after `enter()`.
    - Left-arc world; boot at `at(225, 10)`, load. `moveAircraft(unit, at(200, 15), {groundspeedKt: 0})`, then
      `moveAircraft(unit, pointFrom(at(200, 15), 10, 0.05), {groundspeedKt: 120})`; the track is then 010 (a track of 330
      misses the circle and gives NO INTRCPT, which hides the subject).
    - Super NAV 5: `selectPage('R', 'NAV 4')`, `selectPage('L', 'NAV 5')`, `inner('R', 1)`; `scan()`, then `inner('R', -1)`
      until `SuperNav5.read().directTo` is the entry `D225J` with its arc symbol; `clr()` shows `MOVE ?`; `ent()` shows
      the new entry, and FPL 0 starts with it.
    - Expected radial: the point where the track from the aircraft meets the 10 NM circle, computed on the sphere
      (step along the track with `pointFrom` until `distanceNm(ABC, q)` crosses 10 NM, then `courseDeg(ABC, q)`); the
      flat-earth estimate is 205.1. Assert the entry name `D205J` (or whatever the sphere gives, as a literal).
    - Break: delete line 107; the window stays `MOVE ?`.
    - Label: spec 6-17 (CLR shows MOVE?, ENT computes a new intercept from the present track).

- [ ] **Step 7: report.**

```json:metadata
{"files": ["test/flight/flights/dmeArc.test.ts", "test/render/pages/left/Nav5Page.test.ts", "test/render/SensorsOutSimVars.test.ts", "test/render/controls/selects/SuperNav5DirectToSelector.test.ts"], "verifyCommand": "npx vitest run test/flight/flights/dmeArc.test.ts test/render/pages/left/Nav5Page.test.ts test/render/SensorsOutSimVars.test.ts test/render/controls/selects/SuperNav5DirectToSelector.test.ts", "acceptanceCriteria": ["#18 flown and 326da1a flights bite with geo.ts bounds", "#18 drawn and #17 bite (two proofs for #17)", "#21 arc case bites", "MOVE? state bites", "report written"], "modelTier": "standard"}
```

---

### Task 5: nearest lists and airspaces (render)

**Goal:** Render tests for #57, the SET 3 criteria and `133f4d8`; pins for the SET 3 label and for #102 (TRI 2 far, TRI 2
midpoint, TRI 4, TRI 6, the APT 1 visit order).

**Files:**
- Create: `test/render/data/navdata/NearestList.test.ts` (#57, SET 3 criteria)
- Create: `test/render/pages/left/Set3Page.test.ts` (the label pin)
- Create: `test/render/data/navdata/NearestUtils.test.ts` (`133f4d8` on OTH 2 and APT 1, the APT 1 order pin)
- Create: `test/render/services/AirspacesAlongRoute.test.ts` (the TRI pins)

**Acceptance Criteria:**
- [ ] Each row fails under its break; each pin is proven by the temporary fix named below and has a passing sibling.
- [ ] Pins: `#NEW-5-1` for the SET 3 label; the #102 pins name `(#102)`.
- [ ] The heliport assertion is separate from the short-runway one (only the heliport is evidence for #57).
- [ ] Report written.

**Verify:** `npx vitest run test/render/data/navdata/NearestList.test.ts test/render/pages/left/Set3Page.test.ts test/render/data/navdata/NearestUtils.test.ts test/render/services/AirspacesAlongRoute.test.ts` → passes, pins as expected failures.

**Steps:**

- [ ] **Step 1: #57 (`531b0f9`), heliports out of the nearest list.**
    - Fix: `AirportNearestList.updateFilters` (`NearestList.ts:143-152`) also sets the class mask.
    - World, position 47.0/8.0: `airport('HELI', 47.0, 8.0, {runways: []})`, `airport('KAAA', 47.2, 8.0)`,
      `airport('KGRS', 47.3, 8.0, {runways: [{lengthFt: 3500, surface: RunwaySurfaceType.Grass}]})`,
      `airport('KBBB', 47.4, 8.0)`, `airport('KSHT', 47.1, 8.0, {runways: [{lengthFt: 800}]})`.
    - Advance 12 s (the nearest search runs every 10 s); `msg()`, `ent()` (MSG then ENT shows NR 1 on APT 1, 3-23; the
      boot leaves messages, as `Apt1Page.test.ts` does); walk the list with `scan()` then `inner('R', 1)` while row 0
      contains ` nr `.
    - Expected rows 0: `' KAAA  nr 1'`, `' KGRS  nr 2'`, `' KBBB  nr 3'`; `HELI` and `KSHT` absent (separate assertions).
    - Nine slots: ten ordinary airports `KA00`..`KA09` at `47.05 + i·0.1` plus the heliport at 47.0: exactly nine entries
      `KA00 nr 1` … `KA08 nr 9`.
    - Super NAV 5: `storage: {superNav5Apt: true}`; spy on `CoordinateCanvasDrawContext.prototype.drawLabel`
      (`kln90b/controls/Canvas.tsx`), collect the text argument, restore the spy with `onTestFinished`; reach Super NAV 5
      as `test/render/harness/superNav5.test.ts` does; the distinct labels equal `['KAAA', 'KGRS', 'KBBB']`.
    - Break: comment out `this.session?.setAirportFilter(...)` at `NearestList.ts:144`; the list, nine-slot and Super
      NAV 5 tests fail. `KSHT` stays hidden under this break (the extended filter hides it): predicted survivor.
    - Label: spec 3-22, 3-23 (the nearest list holds the nine nearest airports that meet the SET 3 runway criteria; a
      heliport has no runway, so it cannot), with #57 and the fix commit.

- [ ] **Step 2: SET 3 criteria (same code).** Add `airport('KMID', 47.1, 8.0, {runways: [{lengthFt: 1500}]})`.
  Default list `KMID, KAAA, KGRS, KBBB`. `selectPage('L', 'SET 3')`, `cursor('L')`, `inner('L', 7)` makes `1700'`;
  cursor off; advance 12 s: `KAAA, KGRS, KBBB`. Break: comment out `aptNearestList.updateFilters()` in
  `Set3Page.setMinLength` (`Set3Page.tsx:62`). Surface: `outer('L', 1)`, `inner('L', 1)` → `KMID, KAAA, KBBB` and
  `storedSetting(unit, 'nearestAptSurface')` is `false`. Spec 3-22, 3-23.

- [ ] **Step 3: pin: SET 3 labels the hard-only option `SFT` (`#NEW-5-1`, `Set3Page.test.ts`).** `Set3Page.tsx:39` builds
  `["    HRD SFT", "        SFT"]`; the second entry stores hard-only. 3-22 to 3-23 name the options `HRD SFT` and
  `HRD`. Passing sibling: after `outer('L', 1)`, `inner('L', 1)` the stored setting is hard-only (`false`). Pin: row 5 of the
  left half contains `HRD` and not `SFT`. Prove: change the label to `"        HRD"`; the pin turns red.

- [ ] **Step 4: `133f4d8`, polygon instead of box (`NearestUtils.test.ts`).**
    - A right triangle `[[47.2, 7.8], [47.2, 8.2], [46.8, 7.8]]`; `(47.1, 7.9)` is inside, `(46.9, 8.1)` is in the box but
      outside (hand check: the hypotenuse is lat = lon + 39.0, interior above it).
    - OTH 2: `airspace('TEST CENTER', BoundaryType.Center, tri, {frequencyMHz: 118.55})` (task 1 adds the name). At
      `(47.1, 7.9)`: `rows('L').slice(0, 3)` is `['TEST CENTER', 'CTR        ', '     118.55']` (3-52). At `(46.9, 8.1)`:
      `['OUTSIDE    ', 'ARTCC      ']` (the outside text is the unit's own; comment that the page cites a video).
    - APT 1: `airspace('TEST CLASS B', BoundaryType.ClassB, tri)`; `airport('KOUT', 46.9, 8.1)` alone: row 3 blank;
      `airport('KINS', 47.1, 7.9)` alone: row 3 `'CL B       '` (3-42). Enter the ident with `cursor('R')`,
      `enterIdent('R', …)`, `ent()`, advance 2 s, cursor off.
    - Break: `NearestUtils.ts:79`, `if (true || BoundaryUtils.isInside(...))`; the OTH 2 outside and APT 1 `KOUT` cases
      fail, the inside cases stay green (predicted).

- [ ] **Step 5: #102 pins on TRI 2, TRI 4 and TRI 6 (`AirspacesAlongRoute.test.ts`).**
    - Position 47.0/8.0, `KBBB = pointFrom(pos, 0, 40)`; `squareAt(name, alongNm)` builds a 5 NM square restricted area
      centered `alongNm` along the leg (corners with `pointFrom`).
    - TRI 2: `settle`, `selectPage('L', 'TRI 2')`, `cursor('L')`, `type('L', 'KBBB')`, `ent()`, `ent()`, advance 2 s. Row 0
      `'P.POS-KBBB '`.
    - Sibling: `squareAt('R-ST', 0)` (contains the present position): rows 2-3 `['R-ST       ', ' REST      ']`.
    - Pin (far): `squareAt('R-FAR', 32)`: rows 2-3 `['R-FAR      ', ' REST      ']`; today blank.
    - Pin (midpoint, the shared session): `squareAt('R-MID', 20)`: `['R-MID      ', ' REST      ']`; today blank (the
      first search, from the present position, sees the area by its box and rejects it; the session then does not offer
      it again to the midpoint search).
    - TRI 4: `selectPage('L', 'TRI 3')`, `cursor('L')`, `type('L', 'KAAA')`, `ent()`, `ent()`, `type('L', 'KBBB')`,
      `ent()`, `ent()`, `cursor('L')`, `selectPage('L', 'TRI 4')`, advance 2 s; row 0 `'KAAA -KBBB '`; sibling at 0 NM, pin
      at 32 NM.
    - TRI 6: `storage: savedFlightplan(0, [kaaa, kbbb])`, `selectPage('L', 'TRI 6')`; row 0 `'FP 0       '`; sibling and
      pin as above.
    - Prove: `NearestUtils.ts:79`, `if (true || …)`; every pin turns red, the siblings stay green. Restore.
    - Label: spec 5-4 (TRI 2), 5-5 (TRI 4), 5-6 (TRI 6). Confirm every row literal by running.

- [ ] **Step 6: #102 pin: the APT 1 airport type depends on the airport shown before (`NearestUtils.test.ts`).** The
  triangle Class B; `KINS` inside, `KOUT` outside. Order 1: `KINS` then `KOUT` (entered with `enterIdent` and `ent()`,
  row 3 read after each): expected `KINS:CL B`, `KOUT:` blank; today `KOUT` shows `CL B`. Order 2: `KOUT` then
  `airport('ZZIN', 47.1, 7.9)`: expected `ZZIN:CL B`; today blank. Siblings: each airport alone (step 4). Prove: in
  `getAirspaces` create a fresh boundary session per call and return `added.filter(isInside)`; both orders are right.
  Restore. Label: spec 3-42.

- [ ] **Step 7: report** (also note: the `fill([])` array of #102 is not provable, and the SUA alert's two polygon guards
  cover each other; no test for either in this task).

```json:metadata
{"files": ["test/render/data/navdata/NearestList.test.ts", "test/render/pages/left/Set3Page.test.ts", "test/render/data/navdata/NearestUtils.test.ts", "test/render/services/AirspacesAlongRoute.test.ts"], "verifyCommand": "npx vitest run test/render/data/navdata/NearestList.test.ts test/render/pages/left/Set3Page.test.ts test/render/data/navdata/NearestUtils.test.ts test/render/services/AirspacesAlongRoute.test.ts", "acceptanceCriteria": ["#57 list, nine slots and Super NAV 5 bite; heliport separate from short runway", "SET 3 criteria bite", "133f4d8 OTH 2 and APT 1 bite", "SET 3 label pin and #102 pins proven with siblings", "report written"], "modelTier": "standard"}
```

---

### Task 6: start-up, import and displays (render)

**Goal:** Render tests for #15, the #50 `init()` catch, `80631c8`, `eef92e8` and the pause half of `43d472b`, and the
#90 part 1 pin with its siblings.

**Files:**
- Create: `test/render/services/KlnEfbLoader.test.ts` (#15)
- Create: `test/render/KLN90BCore.startup.test.ts` (#50)
- Create: `test/render/pages/PageTreeController.test.ts` (#90)
- Create: `test/render/pages/right/Apt7Page.test.ts`, `test/render/pages/right/Apt8Page.test.ts` (`80631c8`)
- Create: `test/render/controls/selects/SuperNav5Field1Selector.test.ts` (`eef92e8`)
- Modify: `test/render/Gps.test.ts` (the pause half of `43d472b`)

**Acceptance Criteria:**
- [ ] Each row fails under its break; `80631c8` fails on each page under that page's own break.
- [ ] The #90 pin is `it.fails('… (#90)')`, proven by the temporary fix below, with the siblings passing.
- [ ] No duplicate of a harness test: the #15 test adds the OTH 3 plan number and the repository entries, the #50 test
      the `init()` catch, the `eef92e8` test the field width.
- [ ] Report written.

**Verify:** `npx vitest run test/render/services/KlnEfbLoader.test.ts test/render/KLN90BCore.startup.test.ts test/render/pages/PageTreeController.test.ts test/render/pages/right/Apt7Page.test.ts test/render/pages/right/Apt8Page.test.ts test/render/controls/selects/SuperNav5Field1Selector.test.ts test/render/Gps.test.ts` → passes, the pin as expected failure.

**Steps:**

- [ ] **Step 1: #15 (`34a9cb0`), lat/lon route legs become temporary SUP waypoints.**
    - `kaaa = airport('KAAA', 47.0, 8.0)`, `kbbb = airport('KBBB', 47.4, 8.0)`; `bootUnit({facilities, efb: true})`,
      `settle`; `unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}, {lat: 47.2,
      lon: 8.2}]}))`; advance 2 s.
    - Expected: FPL 0 idents `['KAAA', 'CUST', 'CUSTA', 'KBBB']`; the two user legs have region `XY`, type `U`,
      `userFacilityType` `LAT_LONG` and exactly the given coordinates; the repository holds `CUST` and `CUSTA` in `XY`;
      OTH 3 rows `' USER WPTS '`, `'CUST  S   0'`, `'CUSTA S   0'` (5-20: the type and the plan number).
    - Breaks: comment out `this.facilityRepository.add(facility)` in `KlnEfbLoader.loadLeg`; region `XY` → `XX`;
      `Oth3Page.tsx` `fpl.toString()` → `(fpl + 1).toString()` (the OTH 3 half of `34a9cb0`).
    - Label: public contract (the EFB route sync) and spec 5-20.

- [ ] **Step 2: #50 (`b4a4ff2`), the `init()` catch.** The harness test `bootFailure.test.ts` holds the catch on the
  `propsReady` chain only.
    - Mute `console.error` as `bootFailure.test.ts` does; `const failed = await bootUnitExpectingError({platform:
      {createFacilityClient: () => { throw new Error('no client'); }}})`.
    - Expected: `failed.errors.map(e => e.message)` is `['no client']`; `failed.errorPage()` starts with
      `'Error: no client'`; `failed.takeRejections()` is `[]` (caught, not unhandled).
    - Break: in `KLN90BCore.init`, `return this.asyncInit(xmlConfig).catch(...)` → `return this.asyncInit(xmlConfig);`.
      The error page stays hidden and the rejection collector fails the test. `bootFailure.test.ts` stays green under it.
    - Label: the fix commit (no manual page).

- [ ] **Step 3: #90 part 1, OTH 5 and OTH 6 of an air data unit after a power cycle (`PageTreeController.test.ts`).**
    - Helper (local):

```ts
async function walk(unit: HeadlessUnit, side: 'L' | 'R', first: string): Promise<string[]> {
    await unit.panel.selectPage(side, first);
    const read = () => Screen.read().status()[side === 'L' ? 'left' : 'right'];
    const names = [read()];
    for (let i = 0; i < 40; i++) {
        await unit.panel.inner(side, 1);
        const n = read();
        if (n === names[0]) break;
        if (n !== names[names.length - 1]) names.push(n);
    }
    return names;
}
```

    - Panel XML per configuration: `<Input><Airdata><IsInterfaced>true</IsInterfaced></Airdata></Input>` and/or
      `<Input><FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer></Input>` inside the `KLN90B` instrument.
    - Sibling: air data only, no power cycle: `walk(unit, 'L', 'OTH 1')` is `['OTH 1', …, 'OTH 6']` (OTH 9 and 10 are
      named OTH 5 and 6 without a fuel computer).
    - Siblings after `powerCycle()` and `approveSelfTest()`: neither gives `OTH 1`..`OTH 4`, fuel only `OTH 1`..`OTH 8`,
      both `OTH 1`..`OTH 10`.
    - Pin: air data only after a power cycle is still `OTH 1`..`OTH 6`; today `OTH 1`..`OTH 4`.
    - Prove: as the first constructor statement of `PageTreeController`, `(this as any).tree = this.tree.map(g => [...g]);`
      ; the pin turns red. Restore. (`test/render/harness/pageTree.test.ts` fails under that fix, because it asserts the
      in-place pruning; mention it in the report, do not change it.)
    - Label: spec 5-39, 5-42.

- [ ] **Step 4: `80631c8`, APT 7 and APT 8 redrawn after a waypoint confirmation page.**
    - World: KPRC with the RNAV 27 approach and a SID `DEP1` (as `test/render/harness/procedures.test.ts`), the fixes, and
      `vor('ABC', 47.5, 8.5)`; position 47/8; `settle`.
    - APT 8: `selectPage('R', 'APT 8')`; rows `[' KPRC IAP', ' 1 RNAV 27']`; `appendToFpl0(['ABC'])` (the confirmation page
      is pushed on the right and popped by the second ENT); advance 1 s; the same rows, no `NO APPROACH`, FPL 0 shows
      `ABC` (precondition that the confirmation happened).
    - APT 7: the same with `[' KPRC', 'SELECT SID', ' 1 DEP1']` and no `NO SID/STAR`.
    - Break: delete `this.requiresRedraw = true;` in `Apt8Page.tsx:298` (APT 8 test fails) and, separately, in
      `Apt7Page.tsx:541` (APT 7 test fails). Run each break alone.
    - Label: spec 3-14 (the right side returns to the page shown before), 3-49 (the empty-database text appears only for
      an airport without procedures).

- [ ] **Step 5: `eef92e8`, the Super NAV 5 XTK field without XTK.** `bootUnit({storage: {superNav5Field1:
  SuperNav5Field1.XTK}})`, reach Super NAV 5 as `superNav5.test.ts` does, read `SuperNav5.read().left[4]`. Spec test: its
  length is 6 (6-8: the XTK field is six cells wide). Characterization test (title says so): the text is `-.-NM-`.
  Break: `SuperNav5Field1Selector.tsx` null branch `"-.-NM-"` → `"--.-NM-"`; both fail.

- [ ] **Step 6: the pause half of `43d472b` (`Gps.test.ts`).**
    - `bootUnit({position: {lat: 47, lon: 8}, magvar: 4})`, `settle`, `selectPage('L', 'NAV 3')`;
      `moveAircraft(unit, {lat: 47.1, lon: 8.1}, {groundspeedKt: 120})`.
    - After the move: NAV 3 row 2 is `'TK     ' + <magnetic track> + '° '`, where the magnetic track is
      `courseDeg({lat: 47, lon: 8}, {lat: 47.1, lon: 8.1}) - 4`, rounded and written as a literal; `GPS GROUND TRUE TRACK`
      in radians is close (3 digits) to the true course; `GPS GROUND MAGNETIC TRACK` 4° less.
    - Advance 5 s more (the hold): the same three values, and `unit.consoleErrors` is empty.
    - Break: `Gps.ts:181`, `if (!this.lastCoords.equals(this.coords)) {` → `if (true) {`. After the hold NAV 3 shows
      `TK     °`, the SimVars are NaN, and `normalizeHeading: Invalid heading: NaN` is logged; each of the three hold
      assertions fails on its own, the after-move ones stay green.
    - Label: spec 3-32 (TK shows a number with sufficient velocity); the held value equal to the pre-pause value is a
      characterization (separate `it`, title says so).

- [ ] **Step 7: report** (per row; for #15, #50 and `eef92e8` say which half the existing harness test holds).

```json:metadata
{"files": ["test/render/services/KlnEfbLoader.test.ts", "test/render/KLN90BCore.startup.test.ts", "test/render/pages/PageTreeController.test.ts", "test/render/pages/right/Apt7Page.test.ts", "test/render/pages/right/Apt8Page.test.ts", "test/render/controls/selects/SuperNav5Field1Selector.test.ts", "test/render/Gps.test.ts"], "verifyCommand": "npx vitest run test/render/services/KlnEfbLoader.test.ts test/render/KLN90BCore.startup.test.ts test/render/pages/PageTreeController.test.ts test/render/pages/right/Apt7Page.test.ts test/render/pages/right/Apt8Page.test.ts test/render/controls/selects/SuperNav5Field1Selector.test.ts test/render/Gps.test.ts", "acceptanceCriteria": ["#15, #50, 80631c8 (each page), eef92e8, pause half each bite", "#90 pin proven with four siblings", "no duplicate of harness tests", "report written"], "modelTier": "standard"}
```

---

### Task 7: issues and close-out

**Goal:** File the issues, replace the placeholders, comment on #102, tick and re-verdict the triage rows, write the
session log and update `testing.md`.

**Files:**
- Modify: test files containing `#NEW-` placeholders
- Modify: `docs/test-coverage.md` (section 3 checkbox, section 4 log, section 5 rows)
- Modify: `docs/testing.md` sections 3, 4 and 7

**Acceptance Criteria:**
- [ ] Filed after a search of open and closed issues: the co-located IAF/FAF, `hasDuplicates`, the `AF, CI, AF` merged
      radius and the SET 3 label (`bug` label); the APT 8 question (no `bug` label); MOVE? on FPL 0 (`enhancement`); plus
      any further bug the reports or reviews confirmed.
- [ ] #102 has a comment with the APT 1 reproduction.
- [ ] `grep -r "#NEW-" test/` finds nothing.
- [ ] Every Session 3b row is ticked with its test path or re-verdicted with a reason (#20, `7fd640e`(d), the #102
      `fill([])` array); the #15, #50 and `eef92e8` rows say which half the harness test holds.
- [ ] The session log has: done, re-verdicts, bugs filed, fixes not re-broken, not covered (rule 18), coverage at start
      and end, suite totals.
- [ ] `npm test`, `npx tsc --noEmit` and `npm run coverage` are clean.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [ ] **Step 1: file the bugs.** For each: what is wrong, a reproduction with observed and expected values, file and
  line, impact, a suggested fix, the pin's test name, and the closed issue it continues. Cite manual pages, never copy
  text. Mark code-read findings as not reproduced in the sim.
    - Co-located IAF/FAF never switches to APR (`ModeController.ts:350`; 6-3, 6-10).
    - `SidStar.hasDuplicates` compares by reference (`SidStar.ts:67-71`; 6-5, B-3; same family as `6a6c634`).
    - `AF, CI, AF` merged into one arc with the second radius (`SidStar.ts` `isLegSupported`, `filterOutDuplicates`,
      `mergeAFsIfNecessary`). Evidence: five real STARs in AIRAC 2607 (GVNP NCL1K, NCL2W, SVT1K, SVT2W on SNT 13/10 NM;
      LGKR PITA2P on GAR 16/19 NM); the sim's own representation of the CI legs was not checked. Continues #18 and #20.
    - SET 3 shows `SFT` for the hard-only option (`Set3Page.tsx:39`; 3-22, 3-23).
- [ ] **Step 2: file the question and the enhancement.**
    - Question (no `bug` label): APT 8 and the approach-capable installation. 3-49 says APT 8 is absent when the unit is
      not installed for non-precision approaches; the Installation Manual ties that to the external approach-arm switch;
      `Input.ExternalSwitches.AppArmSwitchInstalled` is parsed and never read; removing APT 8 by default would change most
      aircraft configurations; `FlightplanList.tsx:550` constructs an `Apt8Page` directly and
      `PageTreeController.getPageIndices` throws for a page not in the tree. References #90.
    - Enhancement (`enhancement` label): MOVE? on the FPL 0 page (6-17); only `SuperNav5DirectToSelector` has it.
- [ ] **Step 3: comment on #102** with the APT 1 reproduction (the triangle Class B, `KINS` and `KOUT`, both orders,
  observed and expected, the per-call session that fixes both, and the test name of the pin).
- [ ] **Step 4: replace the placeholders** in one commit (`references #NN …` per issue in the message).
- [ ] **Step 5: tick the rows** in section 5 with test paths; re-verdict #20, `7fd640e`(d) and the `fill([])` array; add
  the harness-test halves to #15, #50 and `eef92e8`; tick the #19 and #41 notes. Tick Session 3b's checkbox.
- [ ] **Step 6: write the log entry** in section 4 (newest first), with the coverage table at the start (identical to
  Session H's end) and at the end, and the suite totals. Not covered: the SUA alert's two polygon guards cover each other
  (Session 7 item 3); the stale `gps.trackTrue` in `checkSwitchAprArmToActive` (not reproduced unless task 3 reproduced
  it); the throw exactly over an arc VOR; the no-op `nextDtk` change of `15d9b35`; the #18 arrowhead of the full revert.
- [ ] **Step 7: `testing.md`.** Section 7: drop the #90 power-cycle item (done); add anything the reports found. Section
  6 or 7: the `AF, CI, AF` evidence came from a real navigation database queried locally, not committed.
- [ ] **Step 8: run the checks and commit.**

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["four bugs, the APT 8 question and the MOVE? enhancement filed after duplicate search", "#102 comment added", "no #NEW- placeholders", "rows ticked or re-verdicted", "session log complete", "checks clean"], "modelTier": "standard"}
```
