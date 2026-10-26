# APT 7 runway groups (#409) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APT 7 lists the runways of a SID or STAR only as far as the unit can tell them apart: parallels with the same
kept legs are one `RWnnB` entry, and the runway step is skipped when every runway gives the same list.

**Architecture:** A new synchronous `SidStar` instance method groups the recognized runway transitions by the legs the
conversion keeps. `Apt7Page.tsx` (the runway list, the step-skipping, the CLR step-back) and `EfbRouteResolver` (the
EFB import, which mirrors APT 7) use it. Loading still takes one `RunwayTransition`, the first member of the chosen
entry, so the procedure information and `KlnEfbSaver` need no change.

**Tech Stack:** TypeScript, `@microsoft/msfs-sdk`, Vitest (unit, render stages).

**Spec:** `docs/superpowers/specs/2026-10-26-apt7-runway-groups-design.md`

## Global Constraints

- One commit for the issue in the end, subject `fixes #409 ...`, with its tests and doc changes (CLAUDE.md, one commit
  per issue). Tasks commit as they go; Task 4 squashes them.
- `target: es2017`: no `Array.prototype.flat`/`flatMap`, no `Object.fromEntries` in `kln90b/`.
- Cite the manual as `6-22, figure 6-35` in comments; never copy manual text.
- List entries are `NN RWxxx` padded as today (`(idx + 1).toString().padStart(2, " ") + " " + name.padEnd(5, " ")`).
- Test facilities are invented (no real navdata in the repo); CHINS5/CANUC7 are only named in comments.
- American English; no counts in prose for collections that grow.
- Run `npx tsc --noEmit` as well as the tests; they are separate checks.

## Review Focus

- Three parallels L/C/R with the same legs: one entry `RWnnB` (Task 1 test).
- A SID whose runways merge and that has one en-route transition: ENT on the SID goes straight to the waypoints, and
  CLR from there goes back to the SID list (Task 2 test).
- Two transitions of the same runway with no designator and the same legs (duplicated data): one entry named `RWnn`,
  not `RWnnB` (Task 1 test).
- A STAR whose runways merge: CLR from the waypoints goes back to the transition list, not to a runway list (Task 2
  test).
- ACT 7 runs the same component as APT 7 (`ActPage.test.ts` uses `sidStarWorld`): the fixture change of Task 2 must
  keep those tests green, and their expectations change only where they pick 27L.

---

### Task 1: `SidStar.getRunwayChoices`

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts` (new exported interface, new public method, a private leg-list builder
  shared with `getKLNProcedureLegList`)
- Test: `test/unit/data/navdata/SidStar.test.ts` (new `describe` after `SidStar.isProcedureRecognized needs a recognized leg`)

**Interfaces:**
- Produces:
  ```ts
  /** #409 6-22, figure 6-35: an entry of the APT 7 runway list */
  export interface RunwayChoice {
      /** "RW14B" for parallels with the same legs, "RW14L" or "RW13" for a runway on its own */
      readonly name: string;
      /** The runway transitions of the entry in the navdata's order; the first one is loaded */
      readonly members: readonly RunwayTransition[];
  }
  // in class SidStar:
  public getRunwayChoices(proc: Procedure, type: KLNLegType, trans: EnrouteTransition | null): RunwayChoice[]
  ```
  Contract: only the runway transitions with `SidStar.isProcedureRecognized(proc, rwy, trans)`; `[]` when there are
  none. When every one of them gives the same kept legs, the result is **one** entry holding all of them (never listed;
  callers skip the runway step on `length <= 1` and load `choices[0]?.members[0] ?? null`). Otherwise one entry per
  runway number and kept-leg list, ordered by the first member's position in `proc.runwayTransitions`.

- [ ] **Step 1: Write the failing tests**

  Helper in the new `describe('SidStar.getRunwayChoices (#409, 6-22 figure 6-35)')`:
  `const names = (c: RunwayChoice[]) => c.map(e => [e.name, e.members.map(r => RunwayUtils.getRunwayNameString(r.runwayNumber, r.runwayDesignation, true, 'RW'))]);`
  and a `SidStar` built as in `SidStar conversion of procedures to KLN legs` (`new SidStar(new MemoryFacilityClient([]) as any, {add() {}} as any, {in: {gps: {coords: new GeoPoint(47, 8)}}} as any)`).
  Invented fixes `a`, `b`, `c` (intersections) and the VOR `abc`. Tests and their exact expectations:

  1. `merges parallels with the same legs into RWnnB (6-22, figure 6-35)`: SID, runways 01L/01R `[CA(10), DF(a)]`,
     19L/19R `[CA(190), DF(b)]`, common `[TF(c)]` → `[['RW01B', ['RW01L', 'RW01R']], ['RW19B', ['RW19L', 'RW19R']]]`.
  2. `merges three parallels into one RWnnB`: 17L/17C/17R `[DF(a)]`, 35 `[DF(b)]` → `[['RW17B', ['RW17L', 'RW17C', 'RW17R']], ['RW35', ['RW35']]]`.
  3. `keeps parallels with different legs apart`: 08L/08R `[DF(c)]`, 26L `[DF(a)]`, 26R `[DF(b)]` →
     `[['RW08B', ['RW08L', 'RW08R']], ['RW26L', ['RW26L']], ['RW26R', ['RW26R']]]`.
  4. `keeps the same legs under different numbers apart while another runway differs`: 08L/08R/13 `[DF(a)]`, 26L
     `[DF(b)]`, 26R `[DF(c)]` → `RW08B`, `RW13`, `RW26L`, `RW26R`, with `RW13` holding only `RW13`.
  5. `gives one entry holding every runway when all give the same legs`: STAR, common `[IF(a), TF(b)]`, runways
     14L/14R `[IF(b), {...TF(c), altitude1: 4572, altDesc: 3}, VM(343)]` and 32L/32R `[IF(b), TF(c), VM(250)]` →
     `length === 1`, members `['RW14L', 'RW14R', 'RW32L', 'RW32R']`.
  6. `does not tell a CF from a TF to the same fix`: 14L `[TF(a)]`, 14R `[CF(a, 140)]`, 32 `[TF(b)]` →
     `RW14B`, `RW32`.
  7. `tells apart a hold at the end`: 14L `[DF(a)]`, 14R `[DF(a), HM(a, 140)]` → two entries `RW14L`, `RW14R`.
  8. `tells apart a fly-over`: 14L `[TF(a)]`, 14R `[TF(a, 0, true)]` → `RW14L`, `RW14R`.
  9. `tells apart an arc of another radius`: 14L `[TF(a), AF(b, abc, {radiusNm: 10, ...})]`, 14R the same with
     `radiusNm: 12` → `RW14L`, `RW14R`; with both at 10 → one entry.
  10. `takes the duplicate at the join into account`: STAR, common `[IF(c), TF(a)]`, 14L `[TF(a), TF(b)]`, 14R `[TF(b)]`
      → one entry (`length === 1`).
  11. `lists only the runways the unit can fly`: SID, no common, runways 04 `[CA(40), VM(40)]`, 31 `[CA(310), TF(a)]`,
      13 `[TF(b)]` → `[['RW31', ['RW31']], ['RW13', ['RW13']]]`.
  12. `names two transitions of one runway without designator RWnn`: 27 `[DF(a)]` twice, 09 `[DF(b)]` →
      `[['RW27', ['RW27', 'RW27']], ['RW09', ['RW09']]]`.
  13. `gives no entry without runway transitions` → `[]`.

- [ ] **Step 2: Run them to verify they fail**

  Run: `npx vitest run test/unit/data/navdata/SidStar.test.ts`
  Expected: FAIL, `getRunwayChoices is not a function`.

- [ ] **Step 3: Implement**

  - Extract the copy-and-order part of `getKLNProcedureLegList` (the `if (type === KLNLegType.SID)` block, #376 copies)
    into `private procedureLegs(proc, type, rwy, trans): FlightPlanLeg[]`; `getKLNProcedureLegList` calls it.
  - `private keptLegsKey(legs: FlightPlanLeg[]): string`: runs `this.filterOutDuplicates(legs.filter(SidStar.isLegSupported))`
    and joins, per kept leg, what `convertToKLN` uses: `ICAO.getUid(leg.fixIcaoStruct)`; for `LegType.AF` also
    `ICAO.getUid(leg.originIcaoStruct)`, `rho`, `course`, `theta`, `turnDirection`; the OBS reminder
    (`shouldAskObs(leg.type) || askObsLegs.has(leg)`); the effective fly-over (`leg.flyOver || askObs`);
    `getKLNFixType(leg)`; `iafArcLegs.has(leg)`. No other leg type information.
  - `getRunwayChoices`: key every recognized transition with `keptLegsKey(this.procedureLegs(proc, type, rwy, trans))`;
    all keys equal → one entry with all members; else group by `runwayNumber` + key. Name: `"RW"` prefix via
    `RunwayUtils.getRunwayNameString(number, designator, true, "RW")`, with `RunwayDesignator.RUNWAY_DESIGNATOR_B` when
    the members have more than one distinct designator, else the first member's designator. JSDoc cites 6-22, figure
    6-35 and the AVsoftech CHINS2 check of 2026-10-26.

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npx vitest run test/unit/data/navdata/SidStar.test.ts` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

  `git add kln90b/data/navdata/SidStar.ts test/unit/data/navdata/SidStar.test.ts` and
  `git commit -m "references #409 SidStar groups the runway transitions the unit cannot tell apart"`.

### Task 2: APT 7 uses the runway choices

**Files:**
- Modify: `kln90b/pages/right/Apt7Page.tsx` (`selectProcedure` ~:325, `selectTransition` ~:397, the step-back ~:183-205,
  `Apt7RunwayPage` ~:725-792)
- Modify: `test/harness/fixtures.ts` (`sidStarWorld`, ~:76-106)
- Test: `test/render/pages/right/Apt7Page.test.ts`, plus expectation updates in `Apt7Page.test.ts` and
  `test/render/pages/right/ActPage.test.ts` where a test picks 27L

**Interfaces:**
- Consumes: `SidStar.getRunwayChoices(proc, type, trans): RunwayChoice[]` and `RunwayChoice` (Task 1), through
  `this.props.sidstar`.
- Produces: nothing new for other tasks. `Apt7RunwayPageProps.selectRunway` keeps its `RunwayTransition` parameter;
  `selected` stays a `RunwayTransition`.

- [ ] **Step 1: Change the fixture so its two runways differ**

  In `sidStarWorld`, add `const sidac = intersection('SIDAC', east(12).lat, east(12).lon)` to the facilities. The SID's
  27L becomes `[Leg.CA(270), Leg.DF(sidac)]`, ARR2's 27L `[Leg.TF(sidac)]`; update the fixture's doc comment (27L flies
  to SIDAC, so the unit tells the two runways apart, #409). Today's 09 and 27L give the same kept legs, so without this
  the runway step would vanish from every test that uses the fixture. Where an existing test picks 27L and asserts
  waypoint rows, `SIDAA` becomes `SIDAC` in those rows; nothing else in the existing expectations changes.

- [ ] **Step 2: Run the touched files to see them green on the old code**

  Run: `npx vitest run test/render/pages/right/Apt7Page.test.ts test/render/pages/right/ActPage.test.ts` → PASS.

- [ ] **Step 3: Write the failing tests**

  New `describe('APT 7 runways the unit cannot tell apart (#409)')` with its own invented KPRC worlds
  (`withProcedures`, fixes east of KPRC as in `sidStarWorld`), using `rows('R')`, `unit.panel` and
  `unit.props.memory.fplPage.flightplans[0].getLegs()`:

  1. `asks for no runway for a STAR whose runways all give the same waypoints (AVsoftech KLN 90B trainer, 2026-10-26)`:
     STAR ARR3, common `[IF(trnaa), TF(sidab)]`, runways 14L/14R/32L/32R `[TF(sidaa), VM(...)]` (VM 140 for 14, 320 for
     32). ENT on ARR3 → `rows('R')` is `['ARR3-Æ', ' 1 TRNAA', ' 2 SIDAB', ' 3 SIDAA', '', 'LOAD IN FPL']`. After LOAD
     IN FPL and the add question, every ARR3 leg in FPL 0 has `procedure.runwayNumber === 14` and
     `procedure.runwayDesignator === RunwayDesignator.RUNWAY_DESIGNATOR_LEFT`.
  2. `lists parallels with the same waypoints once as RWnnB (6-22, figure 6-35)`: SID DEP3, 01L/01R `[CA(10), DF(sidaa)]`,
     19L/19R `[CA(190), DF(sidac)]`, common `[TF(sidab)]`, transitions TRNAA/TRNAB → after ENT on DEP3,
     `rows('R')` is `['DEP3-SID', 'RUNWAY', ' 1 RW01B', ' 2 RW19B', '', '']`.
  3. `loads the first runway of a merged entry`: in that world, RW19B, TRNAA, LOAD IN FPL, add → the DEP3 legs carry
     runway 19 LEFT.
  4. `puts the cursor back on the merged entry after CLR (#273)`: RW19B, then CLR from the transition list →
     `unit.panel.focused('R').text === ' 2 RW19B'`.
  5. `goes from the SID straight to the transitions and back to the SID list when its runways merge (6-5)`: SID DEP4,
     all runways the same, transitions TRNAA/TRNAB → ENT on DEP4 shows `TRANSITION`; CLR shows
     `[' KPRC', 'SELECT SID', ...]`.
  6. `goes from the SID straight to the waypoints and back to the SID list with merged runways and one transition`:
     like 5 with only TRNAA → ENT shows the waypoints with `LOAD IN FPL`; CLR shows the SID list.
  7. `goes back from the waypoints to the transitions for a STAR whose runways merge (6-5)`: STAR with transitions
     TRNAA/TRNAB and runways that merge → TRNAB shows the waypoints; CLR shows `TRANSITION`.

- [ ] **Step 4: Run them to verify they fail**

  Run: `npx vitest run test/render/pages/right/Apt7Page.test.ts -t "#409"` → FAIL (the runway list still shows four
  entries).

- [ ] **Step 5: Implement**

  - `Apt7RunwayPage.buildList`: one `SimpleListItem<RunwayChoice>` per `this.props.sidstar.getRunwayChoices(this.proc,
    this.procedureType, this.trans)`, text from `choice.name`, `onEnter` calls `selectRunway(this.proc,
    choice.members[0], this.trans)`; `selectedItem` is the entry whose `members` include `selected`.
  - Every `proc.runwayTransitions.length <= 1` check in `Apt7Page` becomes `choices.length <= 1` on
    `getRunwayChoices(proc, type, trans)` with the `trans` the runway page would receive there (`null` in
    `selectProcedure` for a SID, the chosen one in `selectTransition` for a STAR, the step-back's `trans`), and the
    skipped step loads `choices[0]?.members[0] ?? null`. Comment: `//#409 6-22, figure 6-35`.

- [ ] **Step 6: Run the tests to verify they pass**

  Run: `npx vitest run test/render` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 7: Commit**

  `git commit -m "references #409 APT 7 lists the runways the unit cannot tell apart as one entry"` with the touched
  files.

### Task 3: the EFB import and the reported runway

**Files:**
- Modify: `kln90b/services/EfbRouteResolver.ts` (`resolveDepartureArrival`, `chooseRunway` ~:161)
- Test: `test/render/services/KlnEfbLoader.test.ts` (next to the #378 SID/STAR runway tests ~:1235-1320),
  `test/render/services/KlnEfbSaver.test.ts` (next to `sends runway 03L of a SID as 03 and L (#186)`)

**Interfaces:**
- Consumes: `SidStar.getRunwayChoices` (Task 1) through `this.sidstar`.

- [ ] **Step 1: Write the failing tests**

  1. KlnEfbLoader: `loads a SID whose runways give the same legs when the route names no runway, with the first one (#409)`:
     `dep1([{runway: '09L', legs: [Leg.DF(r09)]}, {runway: '09R', legs: [Leg.DF(r09)]}])`, sync without
     `departureRunway` → the SID's legs are in FPL 0 (assert the idents with `fplIdents`), and the SID legs carry 09
     LEFT.
  2. KlnEfbLoader: `keeps the runway the route names for a SID whose runways give the same legs (#409)`: the same SID,
     `departureRunway: '09R'` → the SID legs carry 09 RIGHT.
  3. KlnEfbSaver: `sends the first runway of a merged entry: 03L and 03R with the same legs go out as 03 and L (#409)`:
     like the 03L test with runways 03L and 03R `[CA(30), DF(depaa)]`, loaded with `unit.panel.loadProcedure('APT 7')`
     → `departureRunway.number === '03'`, `designator === 'L'`. (This one passes after Task 2 already; it pins the
     first-member rule at the EFB output.)

- [ ] **Step 2: Run them to verify 1 fails**

  Run: `npx vitest run test/render/services/KlnEfbLoader.test.ts -t "#409"` → test 1 FAILS (the SID is skipped as
  incomplete); test 2 passes already.

- [ ] **Step 3: Implement**

  `chooseRunway(trans)`: the named runway transition when the route names one and it is recognized (as today);
  otherwise, when `this.sidstar.getRunwayChoices(proc, type, trans).length <= 1`, the first member (or `null`) with
  `made: true`; otherwise `made: false`. Update the method's JSDoc (#409: APT 7 asks no runway where every runway gives
  the same legs).

- [ ] **Step 4: Run the tests to verify they pass**

  Run: `npx vitest run test/render/services` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

  `git commit -m "references #409 The EFB import asks no runway where APT 7 asks none"` with the touched files.

### Task 4: full check and the single commit

- [ ] **Step 1: Run every check**

  `npm test` → all green; `npx tsc --noEmit` → clean; `npm run build` → succeeds with only the known warnings (circular
  dependencies, Sass legacy API).

- [ ] **Step 2: Squash the task commits into one**

  `git reset --soft <hash>`, where `<hash>` is the commit `Implementation plan for the APT 7 runway groups (#409)`, the
  last one before Task 1 (read it from `git log --oneline`), then one commit:

  ```
  fixes #409 APT 7 lists the runways the unit cannot tell apart as one entry

  Parallel runways whose kept legs are the same are one RWnnB entry (6-22, figure 6-35), and the runway step is
  skipped when every runway gives the same list (AVsoftech KLN 90B trainer, CHINS2 at KBFI, 2026-10-26). A merged
  entry loads its first runway, which the EFB sync reports. The EFB import asks no runway where APT 7 asks none.

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```

- [ ] **Step 3: Verify the tree**

  `git status` clean; `git log --oneline -5` shows the design, the trainer record, the plan and the `fixes #409` commit.
