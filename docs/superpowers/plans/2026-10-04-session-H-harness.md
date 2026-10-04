# Session H harness extensions: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** The harness extensions of Session H (`docs/test-coverage.md` section 3) and the shared helpers the old tests
duplicate, each with a harness test, then the existing tests moved onto them, then the close-out that inserts
Session 3b.

**Architecture:**
- **Phase 1, tasks 1 to 5,** run in parallel, one implementer each in its own git worktree branched from the session
  branch. Each builds one area of the harness with harness tests and a `testing.md` paragraph.
- **Phase 2, tasks 6 to 8,** run in parallel after every phase 1 task is merged. They move the existing tests onto
  the new harness, split by folder.
- **Task 9** files the bugs found, re-verdicts the triage rows, inserts Session 3b and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest 5 (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the
headless harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-04-session-H-harness-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 bind every task.
- **Branches.** The session branch is `tests-session-H-harness`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktrees (rule 21).** The isolation worktree starts at `origin/main`. First thing, on its own still-empty worktree
  branch: `git reset --hard tests-session-H-harness` (phase 2: the session branch after the phase 1 merges). A fresh
  worktree needs `npm install` or a `node_modules` junction to the main checkout (`testing.md` section 2). Before
  `git worktree remove`, the junction is removed with `rmdir`, never recursively.
- **No behavior changes** in `kln90b/` (rule 12). Testability seams only, each named in the commit message.
- **Every extension has a harness test** in the `harness/` folder of the cheapest stage that can run it
  (`test/unit/harness/`, `test/render/harness/`, `test/flight/harness/`), proven to bite by disabling the extension:
  break it, see the test fail, restore, `git diff` clean. The commit message carries one `Proof: fails when …` line per
  extension.
- **Existing tests stay green** after every task. A phase 1 change that alters what an existing assertion reads (the
  CRSR cell in task 4) updates that assertion in the same task, and says so in the report.
- **Bugs found** are not fixed (rule 14). A reproducible one gets an `it.fails('… (#NEW-<task>-<n>)')` pin in the test
  folder that mirrors the code under test, and a report entry with reproduction, observed and expected values and
  file:line. Implementers do not file issues and do not edit `docs/test-coverage.md` (rule 22).
- **Commits (rule 22).** One commit per task plus one per fix round, never amended. The message lists each item with its
  proof line and ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
- **Reports.** The implementer writes its report to `.superpowers/reports/session-H-task-<n>.md` in its worktree and
  replies with only the status, the head commit and concerns. The report lists each extension (files, harness test,
  proof), every changed existing test, and every suspected bug.
- **Docs.** Each phase 1 task adds its paragraphs to `docs/testing.md` section 3 (harness) or 4 (writing tests).
  Sections 6 and 7 are left to task 9.
- **Fakes record their source.** Where a fake models sim behavior, its doc comment says where the rule comes from:
  the sim developers' code (no-runway airports pass the extended filter), a code comment (bounding-box airspace search),
  or the SDK typings.
- **Copyright.** Never commit manual text or navdata recorded from the sim. Facilities and airspaces are invented.
- **No counts in prose** for things that grow (maintainer's global rule); `es2017` target for `kln90b/` only.

**User decisions (already made):**
- "All except 9, 10, 11 (Recommended)": build candidates 1 to 8, 12 and 13 plus the page-tree reset; drop the paused
  aircraft, the `GPS DRIVES NAV1` option and the cold start in `Flight.start`.
- "All of them": also add the small helpers the old tests duplicate, including a standard world, `syncDisplay` and a
  `console.error` collector.
- "Yes they pass. The developers quoted me this from their code: `If there are no runways, the minimum runway size and
  surface types filters should not apply`."
- "We will not do a re-run of the old session. Please insert a new session before Session 4 that works on the newly
  unblocked rows."
- "Spec approved": five parallel extension tasks, three refactor tasks by folder, one close-out; Sonnet implementers,
  Opus reviewers for tasks 1 to 3, Sonnet for the others; final review on Opus.

---

## Facts every task needs (from the research pass)

- `bootUnit` (`test/harness/boot.ts`) boots force-ready; `settle(unit)` waits for the fix and FPL 0. `HeadlessUnit` has
  `core`, `props`, `env`, `navdata`, `errors`, `send`, `atcModel` and `panel`. The teardown (`teardown`, `runAll`) is
  registered with `onTestFinished` and also exported for its own harness test.
- `Screen.read()` (`test/harness/render/screen.ts`) throws on a half row wider than 11 cells and on a full page with more
  than 6 rows. `readRows(el)` walks the DOM: `<br>` starts a row; `d-none` and `<canvas>` are skipped.
- The status line (`kln90b/controls/StatusLine.tsx:154-191`): with the left cursor on, the left name is the 4-character
  `CRSR` or `KYBD` with the class `offset-left-cursor`, whose CSS margin is one cell (`KLN90B.scss:254-256`). The right
  side has no offset. With SET 0 on the left, the right name is blank (3-7).
- Page trees (`kln90b/pages/PageTreeController.ts:99-121`). Left groups in order: TRI, MOD, FPL, NAV, CAL, STA, SET, OTH;
  SET runs SET 1 to SET 10, then SET 0. Right groups: CTR, REF, ACT, D/T, NAV, APT, VOR, NDB, INT, SUP. The outer knob
  wraps; each group remembers its last page; pages with several subpages show `XXX+n` in the status line.
  `PageTreeController`'s constructor prunes the module-level `LEFT_PAGE_TREE` (#90).
- Power (`kln90b/PowerButton.ts`, `kln90b/pages/WelcomePage.tsx`): `KLN90B_Power_On`/`_Off` set the switch; after
  `propsReady` every power-on runs the welcome page (17 s, `TEST_TIME`) and the self-test pages, also on an
  engine-running boot. `SelfTestRightPage` has its cursor on `APPROVE?`; ENT goes to `AiracPage` (or `VFROnlyPage`,
  or `ObswarningPage` in OBS mode), whose cursor is on `ACKNOWLEDGE?`; ENT starts a new `MainPage`.
- ENT handlers are not awaited (`MainPage.tsx:535-541`, `FiveSegmentPage.tsx:155`, `FourSegmentPage.tsx:35-38,109`,
  `WelcomePage.tsx:98`, `FlightplanListItem.tsx:176`, `FlightplanList.tsx:474`). A throw there is an unhandled
  rejection. Vitest 5 stops reporting unhandled rejections as soon as a second `process` listener exists
  (`node_modules/vitest/dist/chunks/init.*.js`: `if (processListeners(event).length > 1) return;`).
- `setImmediate` is not faked (`test/harness/sim/clock.ts`), and `vi.advanceTimersByTimeAsync` yields through it, so a
  rejection from `panel.ent()` surfaces inside that call.

---

### Task 1: procedure builders

**Goal:** SIDs, STARs, approaches and DME arcs in the fake navdata that the real `SidStar` conversion and the APT 7 and
APT 8 pages accept, with a boot check for missing fixes.

**Files:**
- Create: `test/harness/navdata/procedures.ts`
- Modify: `test/harness/navdata/MemoryFacilityClient.ts` (add `missingProcedureFixes()` only)
- Modify: `test/harness/boot.ts` (one call of `missingProcedureFixes` after the client is built)
- Create: `test/unit/harness/procedures.test.ts`, `test/render/harness/procedures.test.ts`
- Modify: `test/unit/data/navdata/SidStar.test.ts` (literals onto the builders, assertions unchanged)
- Modify: `docs/testing.md` section 3 (Navdata)

**Acceptance Criteria:**
- [ ] The leg builders return a new, unfrozen `FlightPlanLeg` on every call, with the fields `SidStar` reads.
- [ ] `sid`, `star`, `approach` and `withProcedures` produce data that `SidStar.isProcedureRecognized` and
      `isApproachRecognized` accept, and an RF leg makes them reject it.
- [ ] An RNAV approach loaded through APT 8 shows the IAF, FAF, MAP and MAHP suffixes on FPL 0; a SID loaded through APT 7
      drops its CA leg; a DME arc converts to a `D…` entry waypoint followed by the arc's end fix.
- [ ] `bootUnit` throws, naming the missing idents, when a procedure fix or an arc navaid is not in the navdata.
- [ ] `SidStar.test.ts` uses the builders and its assertions are unchanged; it still passes and its pins still fail.
- [ ] Each harness test fails when its extension is disabled (proof lines in the commit).
- [ ] `npm test` and `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/unit/harness/procedures.test.ts test/render/harness/procedures.test.ts test/unit/data/navdata/SidStar.test.ts`
→ all pass; `npm test` → all pass; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Leg builders.** In `procedures.ts`. Confirm against `node_modules/@microsoft/msfs-sdk/msfssdk.d.ts`
  (`FlightPlan.createLeg`, `LegType`, `FixTypeFlags`, `LegTurnDirection`) that `createLeg` takes `fixIcaoStruct` and
  `originIcaoStruct` and fills the rest with defaults.

```ts
import {
    AirportFacility, ApproachProcedure, ApproachTransition, EnrouteTransition, Facility, FixTypeFlags, FlightPlan,
    FlightPlanLeg, ICAO, IcaoValue, LegTurnDirection, LegType, Procedure, RnavTypeFlags, RunwayTransition, UnitType,
    VorFacility,
} from '@microsoft/msfs-sdk';

/** A fix by facility or ICAO. Every fix must also be in the navdata: SidStar loads each one with getFacility. */
export type Fix = Facility | IcaoValue;
const icaoOf = (f: Fix): IcaoValue => 'icaoStruct' in f ? f.icaoStruct : f;

/**
 * Procedure legs as the sim's navdata delivers them. SidStar writes into legs (fixTypeFlags, course), so every call
 * returns a new object; never share a leg between procedures.
 */
export const Leg = {
    IF: (fix: Fix, flags = 0) => FlightPlan.createLeg({type: LegType.IF, fixIcaoStruct: icaoOf(fix), fixTypeFlags: flags}),
    TF: (fix: Fix, flags = 0, flyOver = false) => FlightPlan.createLeg({type: LegType.TF, fixIcaoStruct: icaoOf(fix), fixTypeFlags: flags, flyOver}),
    CF: (fix: Fix, courseMag: number, flags = 0) => FlightPlan.createLeg({type: LegType.CF, fixIcaoStruct: icaoOf(fix), course: courseMag, fixTypeFlags: flags}),
    DF: (fix: Fix, flags = 0) => FlightPlan.createLeg({type: LegType.DF, fixIcaoStruct: icaoOf(fix), fixTypeFlags: flags}),
    /** No fix: SidStar drops it */
    CA: (courseMag: number) => FlightPlan.createLeg({type: LegType.CA, course: courseMag}),
    /** No fix: SidStar drops it */
    VM: (courseMag: number) => FlightPlan.createLeg({type: LegType.VM, course: courseMag}),
    HM: (fix: Fix, inboundMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.HM, fixIcaoStruct: icaoOf(fix), course: inboundMag, turnDirection: turn, fixTypeFlags: flags}),
    /**
     * DME arc to endFix around navaid. SidStar uses fromRadial (course) and toRadial (theta) as true bearings, and the arc
     * must not be the first leg that survives filtering (the conversion replaces the leg before it with the entry).
     */
    AF: (endFix: Fix, navaid: VorFacility, o: { radiusNm: number; fromRadial: number; toRadial: number; turn: LegTurnDirection; flags?: number }) =>
        FlightPlan.createLeg({
            type: LegType.AF, fixIcaoStruct: icaoOf(endFix), originIcaoStruct: navaid.icaoStruct,
            rho: UnitType.NMILE.convertTo(o.radiusNm, UnitType.METER), course: o.fromRadial, theta: o.toRadial,
            turnDirection: o.turn, fixTypeFlags: o.flags ?? 0,
        }),
    /** Only for testing that RF procedures are rejected */
    RF: (fix: Fix) => FlightPlan.createLeg({type: LegType.RF, fixIcaoStruct: icaoOf(fix)}),
};
```

- [ ] **Step 2: Procedure builders.** Runway strings are `'27'`, `'27L'`, `'09R'`, `'27C'` or `''` (circling).
  `RunwayDesignator` and `ApproachType` are MSFS globals (`test/harness/sim/staticGlobals.ts`), not imports.

```ts
export interface Transition { name: string; legs: FlightPlanLeg[] }

function parseRunway(runway: string): { runwayNumber: number; designator: RunwayDesignator } {
    if (runway === '') return {runwayNumber: 0, designator: RunwayDesignator.RUNWAY_DESIGNATOR_NONE};
    const letter = runway.slice(2);
    const designator = letter === 'L' ? RunwayDesignator.RUNWAY_DESIGNATOR_LEFT
        : letter === 'R' ? RunwayDesignator.RUNWAY_DESIGNATOR_RIGHT
            : letter === 'C' ? RunwayDesignator.RUNWAY_DESIGNATOR_CENTER : RunwayDesignator.RUNWAY_DESIGNATOR_NONE;
    return {runwayNumber: Number(runway.slice(0, 2)), designator};
}

export interface ProcedureOptions {
    /** Runway transitions, e.g. {runway: '27', legs} */
    runways?: { runway: string; legs: FlightPlanLeg[] }[];
    common?: FlightPlanLeg[];
    transitions?: Transition[];
    rnpAr?: boolean;
}

function procedure(name: string, o: ProcedureOptions): Procedure {
    return {
        name, rnpAr: o.rnpAr ?? false, commonLegs: o.common ?? [],
        enRouteTransitions: (o.transitions ?? []).map(t => ({name: t.name, legs: t.legs}) as EnrouteTransition),
        runwayTransitions: (o.runways ?? []).map(r => {
            const {runwayNumber, designator} = parseRunway(r.runway);
            return {runwayNumber, runwayDesignation: designator, legs: r.legs} as RunwayTransition;
        }),
    } as unknown as Procedure;
}

export const sid = (name: string, o: ProcedureOptions): Procedure => procedure(name, o);
export const star = (name: string, o: ProcedureOptions): Procedure => procedure(name, o);

export interface ApproachOptions {
    /** An ApproachType global, e.g. ApproachType.APPROACH_TYPE_RNAV */
    type: ApproachType;
    runway: string;
    suffix?: string;
    /** RnavTypeFlags; an RNAV approach is listed only with LNAV. Default LNAV */
    rnav?: number;
    transitions?: Transition[];
    final: FlightPlanLeg[];
    missed?: FlightPlanLeg[];
    rnpAr?: boolean;
    missedRnpAr?: boolean;
    name?: string;
}

export function approach(o: ApproachOptions): ApproachProcedure {
    const {runwayNumber, designator} = parseRunway(o.runway);
    return {
        name: o.name ?? `APPROACH ${o.runway}`, runway: o.runway, runwayNumber, runwayDesignator: designator,
        approachType: o.type, approachSuffix: o.suffix ?? '', rnavTypeFlags: o.rnav ?? RnavTypeFlags.LNAV,
        rnpAr: o.rnpAr ?? false, missedApproachRnpAr: o.missedRnpAr ?? false, icaos: [],
        transitions: (o.transitions ?? []).map(t => ({name: t.name, legs: t.legs}) as ApproachTransition),
        finalLegs: o.final, missedLegs: o.missed ?? [],
    } as unknown as ApproachProcedure;
}

/** A copy of the airport with procedures; the builders in builders.ts stay procedure-free */
export function withProcedures(apt: AirportFacility, p: { departures?: Procedure[]; arrivals?: Procedure[]; approaches?: ApproachProcedure[] }): AirportFacility {
    return {...apt, departures: p.departures ?? [], arrivals: p.arrivals ?? [], approaches: p.approaches ?? []} as AirportFacility;
}
```

  Check against `msfssdk.d.ts:5643-5843` whether any required field is missing (for example `ApproachTransition`
  carrying more than `name` and `legs`) and add it with a neutral value; the cast only silences the compiler.

- [ ] **Step 3: Runway fix.** `runwayFix(apt, '27')` returns a `RunwayFacility` (`msfssdk.d.ts:6159`): `icaoStruct`
  `ICAO.value('R', '', apt ident, 'RW27')` (confirm the SDK's runway ICAO convention in `msfssdk.js` around
  `getFacilityTypeFromValue` and `RunwayUtils`), the airport's lat/lon, and a `runway` (`OneWayRunway`) built from the
  airport's first runway. It is added to the navdata like any facility.

- [ ] **Step 4: Missing-fix check.** In `MemoryFacilityClient`:

```ts
/** Idents of procedure fixes and arc navaids that are not in the navdata. SidStar loads each with getFacility. */
public missingProcedureFixes(): string[] {
    const missing = new Set<string>();
    const check = (icao: IcaoValue) => {
        if (icao.ident.trim() !== '' && !this.byUid.has(ICAO.getUid(icao))) missing.add(ICAO.tryValueToStringV2(icao));
    };
    for (const fac of this.all()) {
        if (ICAO.getFacilityTypeFromValue(fac.icaoStruct) !== FacilityType.Airport) continue;
        const apt = fac as AirportFacility;
        const procs = [...apt.departures, ...apt.arrivals];
        const legs = [
            ...procs.flatMap(p => [...p.commonLegs, ...p.enRouteTransitions.flatMap(t => t.legs), ...p.runwayTransitions.flatMap(t => t.legs)]),
            ...apt.approaches.flatMap(a => [...a.finalLegs, ...a.missedLegs, ...a.transitions.flatMap(t => t.legs)]),
        ];
        for (const leg of legs) {
            check(leg.fixIcaoStruct);
            if (leg.type === LegType.AF) check(leg.originIcaoStruct);
        }
    }
    return [...missing];
}
```

  In `bootUnit`, right after `new MemoryFacilityClient(...)`:
  `const missing = navdata.missingProcedureFixes(); if (missing.length > 0) throw new Error(\`bootUnit: procedure fixes missing from the navdata: ${missing.join(', ')}\`);`
  It runs after the live-unit guard and the `onTestFinished` registration, so the teardown still runs.

- [ ] **Step 5: Unit harness test** `test/unit/harness/procedures.test.ts` (unit stage: `SidStar`'s static methods take
  the procedures directly):
    - two calls of `Leg.TF(x)` return different objects, and neither is frozen;
    - `SidStar.isApproachRecognized(approach({type: ApproachType.APPROACH_TYPE_RNAV, runway: '27', final: [...]}))` is
      true; with `rnav: 0` it is false; with an `RF` leg in `final` it is false;
    - `SidStar.isProcedureRecognized(sid('AAA1', {common: [Leg.TF(fix)]}), …)` is true; a SID of only `CA` legs is false
      (check the signature in `SidStar.ts:234`);
    - `approach({runway: '27L', …})` gives `runwayNumber` 27 and the LEFT designator;
    - `missingProcedureFixes()` names a fix that was not added, and is empty once it is added.

- [ ] **Step 6: Render harness test** `test/render/harness/procedures.test.ts`. Invented world near 47/8: airport KPRC
  with an RNAV 27 approach (transition `IAFAA`: `IF(IAFAA, IAF)`, `TF(IFAAA, IF)`; final: `IF(IFAAA, IF)`,
  `TF(FAFAA, FAF)`, `TF(MAPAA, MAP)`; missed: `CA(270)`, `DF(MAHAA)`, `HM(MAHAA, 90, Right, MAHP)`), and a SID `DEP1`
  (runway 27: `CA(270)`, `DF(DEPAA)`; common: `TF(ENRAA)`). All fixes are `intersection()`s.
    - **APT 8:** boot with KPRC in FPL 0 (`savedFlightplan(0, [kprc])`), select APT 8 on the right with KPRC shown (enter
      the ident with `panel.type` on the selector), and drive the page as `Apt8Page.tsx` does it: choose the approach,
      the IAF, then `LOAD IN FPL` with ENT. Assert on FPL 0's screen rows, or on
      `unit.props.memory.fplPage.flightplans[0].getLegs()`, the idents IAFAA, IFAAA, FAFAA, MAPAA, MAHAA, the fix types
      IAF, FAF, MAP, MAHP (`KLNFixType`), and the suffix glyphs from `SidStar.getWptSuffix` on the screen
      (characterization of the screen; the fix types are the conversion's code facts).
    - **APT 7:** load `DEP1`: FPL 0 holds KPRC, DEPAA, ENRAA (the CA leg dropped).
    - **DME arc:** an approach whose transition is `IF(ARCBG, IAF)`, `AF(ARCEN, abcVor, {radiusNm: 10, fromRadial: 270,
      toRadial: 180, turn: Left})`, `TF(FAFAA, FAF)`, … with ARCBG on the 270 radial and ARCEN on the 180 radial at
      10 NM (positions from `GeoPoint.offset` for setup). After loading, the leg before ARCEN is a `D…` user waypoint
      with `arcData` and fix type IAF. Keep `magvar: 0` (the radials are true bearings).
    - The boot check: `bootUnit` with a procedure whose fix is missing rejects with a message naming it.
  Proof per extension: (a) make `Leg.TF` drop `fixTypeFlags` → the suffix test fails; (b) remove the `missingProcedureFixes`
  call → the boot-check test fails; (c) make `approach()` ignore `rnav` → the unit test fails.

- [ ] **Step 7: Move `SidStar.test.ts`** onto the builders: replace `leg(type, rnp)`, `app(f)`, the `procedure(...)`
  literals and `noFix(type)` (`:11-13`, `:25-35`, `:108-110`, `:143-159`). Keep the `rnp` field where a test is about
  it (`FlightPlan.createLeg({..., rnp})` inline, or an `rnp` option on the builder if more than one test needs it).
  Assertions unchanged; the pins (#104, #107) still fail.

- [ ] **Step 8: Docs.** `testing.md` section 3, Navdata: a paragraph on `procedures.ts` (builders, `withProcedures`,
  `runwayFix`, the boot check, loading through APT 7/8 with the panel, the arc entry depends on the GPS position at
  load time, `SidStar` writes into legs).

- [ ] **Step 9: Run** `npm test` and `npx tsc --noEmit`, write the report, commit once.

```json:metadata
{"files": ["test/harness/navdata/procedures.ts", "test/harness/navdata/MemoryFacilityClient.ts", "test/harness/boot.ts", "test/unit/harness/procedures.test.ts", "test/render/harness/procedures.test.ts", "test/unit/data/navdata/SidStar.test.ts", "docs/testing.md"], "verifyCommand": "npx vitest run test/unit/harness/procedures.test.ts test/render/harness/procedures.test.ts test/unit/data/navdata/SidStar.test.ts && npx tsc --noEmit", "acceptanceCriteria": ["fresh unfrozen legs", "recognized and RF rejected", "APT 8 approach with suffixes, APT 7 SID drops CA, DME arc entry", "boot check names missing fixes", "SidStar.test.ts on builders, assertions unchanged", "proof lines", "npm test and tsc clean"], "modelTier": "standard"}
```

---

### Task 2: nearest filters and airspaces

**Goal:** `MemoryFacilityClient` honors the airport and VOR nearest filters per session, and serves airspaces through a
boundary session, with builders for both.

**Files:**
- Modify: `test/harness/navdata/MemoryFacilityClient.ts` (filters, boundary session, `addAirspace`)
- Modify: `test/harness/navdata/builders.ts` (`airport` runways, towered, class; `vor` class)
- Create: `test/harness/navdata/airspaces.ts`
- Modify: `test/harness/boot.ts` (`BootOptions.airspaces`), `test/harness/flight/World.ts` (`addAirspace`),
  `test/harness/flight/Flight.ts` (pass the world's airspaces), `test/harness/singletons.ts` (`DefaultLodBoundaryCache`)
- Create: `test/unit/harness/nearestFilters.test.ts`, `test/unit/harness/airspaces.test.ts`,
  `test/render/harness/airspaces.test.ts`
- Modify: `test/unit/data/navdata/BoundaryUtils.test.ts` (where `airspace()` plus the SDK `LodBoundary` fits)
- Modify: `docs/testing.md` section 3 (Navdata)

**Acceptance Criteria:**
- [ ] Filter state is stored per session; the filter runs before `maxItems`; a facility hidden by a new filter is reported
      as `removed` at the next search.
- [ ] Airports: class mask on `airportClass`; extended filter on surface, length and towered, passed by an airport with
      no runways (sim developers' rule, cited in the doc comment). VORs: class and type masks.
- [ ] `airport()` takes `runways`, `towered` and `airportClass` (derived when absent); `vor()` takes `vorClass`; the
      defaults leave existing worlds unchanged (the whole suite is green without edits to other tests).
- [ ] `airspace()` and `circularAirspace()` build `BoundaryFacility` objects; the boundary session filters by type mask,
      selects by bounding box against the search circle, sorts, cuts at `maxItems`, and keeps added/removed by id.
- [ ] A render test shows `INSIDE SPC USE AIRSPACE` for an aircraft inside a restricted area, and TRI 2 lists an airspace
      on the route.
- [ ] `AirspaceAlert.ts:155` is checked; if the limit comparison is wrong, an `it.fails('… (#NEW-2-1)')` pin exists and
      the report has the reproduction.
- [ ] Proof lines for each extension; `npm test` and `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/unit/harness/nearestFilters.test.ts test/unit/harness/airspaces.test.ts test/render/harness/airspaces.test.ts test/unit/data/navdata/BoundaryUtils.test.ts`
→ all pass; `npm test` → all pass; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Builders.** In `builders.ts`, `AirportOptions` gains:

```ts
export interface RunwayOptions {
    heading?: number;       // default 90
    lengthFt?: number;      // default 5000
    surface?: RunwaySurfaceType; // default Asphalt
}
// in AirportOptions:
    /** Zero or more runways; default one runway from runwayHeading/runwayLengthFt/surface (the existing options) */
    runways?: RunwayOptions[];
    towered?: boolean;
    /** Default: HeliportOnly without runways, HardSurface with a hard runway, otherwise SoftSurface */
    airportClass?: AirportClass;
```

  The existing single-runway options keep working when `runways` is absent. Derive the class with
  `RunwayUtils.getSurfaceCategory(rwy) === RunwaySurfaceCategory.Hard` (or an explicit list of hard surfaces, whichever
  the SDK exposes). `vor()` gains `vorClass?: VorClass` (default `HighAlt`, as today).

- [ ] **Step 2: Nearest filters.** In `MemoryNearestSession`, store the state and filter in the k-d tree search
  (`GeoKdTree.search(lat, lon, radius, maxItems, out, filter)`, `msfssdk.d.ts:11555`):

```ts
/**
 * Filters as the sim applies them (masks are 1 << enum value). Source for "no runways passes the extended filter": the
 * sim developers' code, quoted to the maintainer: "If there are no runways, the minimum runway size and surface types
 * filters should not apply".
 */
private airportClassMask = ~0;
private surfaceMask = ~0;
private toweredMask = 3;
private minRunwayLengthM = 0;
private vorClassMask = ~0;
private vorTypeMask = ~0;

public setAirportFilter(_showClosed: boolean, classMask: number): void { this.airportClassMask = classMask; }
public setExtendedAirportFilters(surfaceMask: number, _approachMask: number, toweredMask: number, minRunwayLength: number): void {
    this.surfaceMask = surfaceMask; this.toweredMask = toweredMask; this.minRunwayLengthM = minRunwayLength;
}
public setVorFilter(classMask: number, typeMask: number): void { this.vorClassMask = classMask; this.vorTypeMask = typeMask; }

private passes(fac: Facility): boolean {
    const flag = (v: number) => 1 << v;
    switch (ICAO.getFacilityTypeFromValue(fac.icaoStruct)) {
        case FacilityType.Airport: {
            const apt = fac as AirportFacility;
            if ((this.airportClassMask & flag(apt.airportClass)) === 0) return false;
            if ((this.toweredMask & (apt.towered ? 2 : 1)) === 0) return false;
            return apt.runways.length === 0
                || apt.runways.some(r => r.length >= this.minRunwayLengthM && (this.surfaceMask & flag(r.surface)) !== 0);
        }
        case FacilityType.VOR: {
            const v = fac as VorFacility;
            return (this.vorClassMask & flag(v.vorClass)) !== 0 && (this.vorTypeMask & flag(v.type)) !== 0;
        }
        default:
            return true;
    }
}
```

  Pass `f => this.passes(f)` to `tree.search`. Keep the added/removed bookkeeping unchanged; it reports a newly hidden
  facility as removed by itself. Confirm the towered bit meaning (1 untowered, 2 towered) in `msfssdk.d.ts:23270-23310`.

- [ ] **Step 3: Unit harness test for filters** `test/unit/harness/nearestFilters.test.ts` (drive the session directly):
    - a heliport (`runways: []`) is returned until `setAirportFilter(false, AirportClassMask.HardSurface | SoftSurface)`;
      with only the extended filter set it is still returned (the developers' rule);
    - a 900 ft runway is dropped by `minRunwayLength` 1000 ft in meters; a grass runway by a hard-only surface mask;
    - nine paved airports plus a nearer heliport with `maxItems` 9 and the class filter return the nine paved ones;
    - after a filter change, the next search lists the hidden airport in `removed`;
    - a `Terminal` VOR is dropped by `HighAlt | LowAlt` and kept by `HighAlt | LowAlt | Terminal`; a DME-only type is
      dropped by the VOR/VORDME/VORTAC type mask.
  Proofs: apply the filter after `maxItems` (slice first) → the nine-slot test fails; drop the no-runway pass → the
  heliport-with-extended-filter test fails; ignore the class mask → the heliport test fails.

- [ ] **Step 4: Airspace builders** in `airspaces.ts`. Confirm field names and `BoundaryVectorType` values in
  `msfssdk.d.ts:6428-6510`.

```ts
let nextId = 1;

export interface AirspaceOptions {
    minFt?: number;                         // default 0
    maxFt?: number;                         // default 10000
    minType?: BoundaryAltitudeType;         // default MSL
    maxType?: BoundaryAltitudeType;         // default MSL
    /** Center boundaries carry a frequency that OTH 2 reads (untyped in the SDK) */
    frequencyMHz?: number;
}

/** A polygon airspace; the ring is closed for you. Ids are unique per file (the SDK cache is keyed by id). */
export function airspace(name: string, type: BoundaryType, polygon: [number, number][], o: AirspaceOptions = {}): BoundaryFacility {
    const ring = [...polygon, polygon[0]];
    const lats = polygon.map(p => p[0]);
    const lons = polygon.map(p => p[1]);
    const vectors = ring.map(([lat, lon], i) => ({type: i === 0 ? BoundaryVectorType.Start : BoundaryVectorType.Line, originId: 0, lat, lon, radius: 0}));
    return {
        id: nextId++, name, type,
        minAlt: UnitType.FOOT.convertTo(o.minFt ?? 0, UnitType.METER), maxAlt: UnitType.FOOT.convertTo(o.maxFt ?? 10000, UnitType.METER),
        minAltType: o.minType ?? BoundaryAltitudeType.MSL, maxAltType: o.maxType ?? BoundaryAltitudeType.MSL,
        topLeft: {lat: Math.max(...lats), long: Math.min(...lons)}, bottomRight: {lat: Math.min(...lats), long: Math.max(...lons)},
        vectors, lods: [],
        ...(o.frequencyMHz !== undefined ? {frequency: {freqMHz: o.frequencyMHz}} : {}),
    } as unknown as BoundaryFacility;
}
```

  `circularAirspace(name, type, center, radiusNm, o)` builds `Origin` plus `Circle` vectors (radius in meters) and the
  bounding box of the circle. It exists for the known gap that `BoundaryUtils` ignores circles; its doc comment says so.
  Check how the SDK's `LodBoundary` treats `lods: []` (`msfssdk.js:50528-50674`): LOD 0 must be the exact ring. If it is
  not, build `lods` so that it is, and say why in a comment.

- [ ] **Step 5: Boundary session.** Replace `EmptyBoundarySession`:

```ts
/**
 * The raw sim boundary session (NearestBoundarySearchSession): returns BoundaryFacility objects, removed by id. Candidates
 * are airspaces whose bounding box meets the search circle. Inferred from the comment in NearestUtils.getAirspaces
 * ("searchNearest seems to only check the bounding box"), not observed in the sim.
 */
class MemoryBoundarySession {
    private readonly cached = new Set<number>();
    private searchId = 0;
    private mask = ~0;

    constructor(private readonly airspaces: BoundaryFacility[], public readonly sessionId: number) {}

    public setBoundaryFilter(mask: number): void { this.mask = mask; }
    public setFilter(mask: number): void { this.mask = mask; }

    public searchNearest(lat: number, lon: number, radiusMeters: number, maxItems: number): Promise<NearestSearchResults<BoundaryFacility, number>> {
        const radiusNm = UnitType.METER.convertTo(radiusMeters, UnitType.NMILE);
        const found = this.airspaces
            .filter(a => (this.mask & (1 << a.type)) !== 0)
            .map(a => ({a, d: distanceToBoxNm(lat, lon, a)}))
            .filter(x => x.d <= radiusNm)
            .sort((x, y) => x.d - y.d)
            .slice(0, maxItems)
            .map(x => x.a);
        const added = found.filter(a => !this.cached.delete(a.id));
        const removed = [...this.cached];
        this.cached.clear();
        found.forEach(a => this.cached.add(a.id));
        return Promise.resolve({sessionId: this.sessionId, searchId: this.searchId++, added, removed});
    }
}
```

  `distanceToBoxNm` clamps the point into the box (latitude and longitude) and returns the great-circle distance to
  the clamped point (0 inside); write it in `airspaces.ts` with the haversine of `test/harness/flight/geo.ts`.
  `MemoryFacilityClient` gets `private readonly airspaces: BoundaryFacility[] = []`, `addAirspace(a)`, and a constructor
  parameter or `addAirspace` calls from `bootUnit`. `BootOptions.airspaces?: BoundaryFacility[]`;
  `World.addAirspace(...a)` and `World.airspaces()`; `Flight.start` passes `airspaces: world.airspaces()`.
  `singletons.ts`: clear `DefaultLodBoundaryCache.INSTANCE` with `clearStatic(..., false)` (confirm the field name in
  `msfssdk.js:50994-51006`).

- [ ] **Step 6: Unit harness test** `test/unit/harness/airspaces.test.ts`: a session returns an airspace whose box meets
  the circle and not one beyond it; a type outside the mask is not returned; a second search returns nothing new in
  `added`, and moving away lists its id in `removed`; `maxItems` cuts the farther ones; the `LodBoundary` the SDK
  builds from `airspace()` has LOD 0 equal to the closed ring (`new LodBoundary(fac, ...)` or `DefaultLodBoundaryCache`).
  `BoundaryUtils.isInside` on that `LodBoundary` agrees with the polygon for a point inside and one outside.

- [ ] **Step 7: Render harness test** `test/render/harness/airspaces.test.ts`:
    - Restricted area `R-TEST` (a square ±0.1° around 47.0/8.0, 0 to 5000 ft MSL), boot at 47.0/8.0, altitude 3000 ft
      (`altitudeFt` sets `PRESSURE ALTITUDE`), `settle`, advance 12 s (the alert runs every 10 s): the MSG page lists
      `INSIDE SPC USE AIRSPACE` (open it with `panel.msg()` and read the screen; the message formatting is
      `AirspaceAlert.ts:162-180`).
    - TRI 2: an airspace astride the route from present position to a waypoint: TRI 2 lists its name. Use a route whose
      search center lies inside the airspace, so that #102 does not hide it (the session 3b pin for #102 uses the other
      case).
  Proofs: return no airspaces from the session → both fail; ignore the type mask → the unit mask test fails.

- [ ] **Step 8: Check `AirspaceAlert.ts:155`.** Read `AirspaceAlert.ts:144-180`. If an MSL airspace from 1000 to 5000 ft
  is treated as "not vertically inside" at, for example, 3000 ft, write the render pin
  `it.fails('INSIDE SPC USE AIRSPACE between the limits (#NEW-2-1)')` with that setup in
  `test/render/data/navdata/AirspaceAlert.test.ts`, plus a passing sibling that proves the alert fires for an airspace
  from 0 ft (the setup works). Cite the Pilot's Guide page for the SUA alert from the page index
  (`C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\pilots-guide-index.md`). If the code is right, report it.

- [ ] **Step 9: `BoundaryUtils.test.ts`.** Replace the hand-built `LodBoundary` objects with `airspace()` plus the SDK
  `LodBoundary` where the test is about polygons; keep a hand-built literal where it tests a shape `airspace()` cannot
  make (say so in a comment). Assertions unchanged; the #106 pins still fail.

- [ ] **Step 10: Docs, run, report, commit.** `testing.md` section 3, Navdata: the filters (with the source of the
  no-runway rule), the airspace builders, the bounding-box inference, `BootOptions.airspaces`, `World.addAirspace`, and
  that the SDK builds `LodBoundary` objects in a throttled queue on `requestAnimationFrame`, so tests advance timers.

```json:metadata
{"files": ["test/harness/navdata/MemoryFacilityClient.ts", "test/harness/navdata/builders.ts", "test/harness/navdata/airspaces.ts", "test/harness/boot.ts", "test/harness/flight/World.ts", "test/harness/flight/Flight.ts", "test/harness/singletons.ts", "test/unit/harness/nearestFilters.test.ts", "test/unit/harness/airspaces.test.ts", "test/render/harness/airspaces.test.ts", "test/unit/data/navdata/BoundaryUtils.test.ts", "docs/testing.md"], "verifyCommand": "npx vitest run test/unit/harness/nearestFilters.test.ts test/unit/harness/airspaces.test.ts test/render/harness/airspaces.test.ts test/unit/data/navdata/BoundaryUtils.test.ts && npx tsc --noEmit", "acceptanceCriteria": ["per-session filters before maxItems", "no-runway airports pass extended filter", "builder defaults keep existing worlds", "boundary session by bbox, mask, maxItems, added/removed", "SUA message and TRI 2 render tests", "AirspaceAlert:155 checked and pinned if real", "proof lines", "npm test and tsc clean"], "modelTier": "standard"}
```

---

### Task 3: boot, platform and error paths

**Goal:** A boot-failure helper, a strict unhandled-rejection collector, a `console.error` collector, display probes, a
fake EFB route manager, and the page-tree reset.

**Files:**
- Modify: `test/harness/boot.ts` (`bootUnitExpectingError`, rejections, `consoleErrors`, `display`, `efb` option)
- Modify: `test/harness/platform.ts` (`FakeRouteManager`, `efbRoute`, optional overrides)
- Modify: `test/harness/singletons.ts` (`LEFT_PAGE_TREE` snapshot and restore)
- Modify: `test/harness/flight/Flight.ts` (the `no console.error` monitor reads `unit.consoleErrors`)
- Create: `test/render/harness/bootFailure.test.ts`, `test/render/harness/rejections.test.ts`,
  `test/render/harness/consoleErrors.test.ts`, `test/render/harness/efb.test.ts`, `test/render/harness/pageTree.test.ts`
- Modify: `test/flight/harness/consoleRestore.test.ts` (still holds after the change)
- Modify: `docs/testing.md` sections 3 and 4

**Acceptance Criteria:**
- [ ] `bootUnitExpectingError` returns after the first `error` event with the visible error page message, throws if
      `propsReady` fires instead, and tears down like `bootUnit`.
- [ ] An unhandled rejection during a test with a unit lands in `unit.errors` and `unit.rejections`; one not taken with
      `unit.takeRejections()` fails that test; the listener is removed afterwards.
- [ ] `unit.consoleErrors` records `console.error` calls and passes them on; `console.error` is restored at teardown;
      `Flight`'s monitor uses it.
- [ ] `unit.display.opacity()` and `unit.display.powerWrites()` return what the duplicated probes return.
- [ ] `bootUnit({efb: true})` exposes `unit.efb`; a synced `efbRoute` lands in FPL 0; a route request is answered in
      `unit.efb.replies`.
- [ ] The `KlnEfbSaver` checks are done (FPL 0's airports stripped on a request; a request with an empty FPL 0): each that
      reproduces has an `it.fails('… (#NEW-3-<n>)')` pin and a report entry.
- [ ] A default boot, then a fuel-computer boot in the same file, still has OTH 5 to 8.
- [ ] Proof lines; `npm test` and `npx tsc --noEmit` clean, with no existing test changed except the ones named here.

**Verify:** `npx vitest run test/render/harness test/flight/harness` → all pass; `npm test` → all pass;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Page-tree reset.** In `singletons.ts`:

```ts
import {LEFT_PAGE_TREE} from '../../kln90b/pages/PageTreeController';

/** PageTreeController prunes LEFT_PAGE_TREE in place on every MainPage (#90); restore it for the next unit */
const LEFT_TREE_AT_LOAD = LEFT_PAGE_TREE.map(group => [...group]);

export function restorePageTrees(): void {
    LEFT_PAGE_TREE.length = 0;
    LEFT_TREE_AT_LOAD.forEach(group => LEFT_PAGE_TREE.push([...group]));
}
```

  Call `restorePageTrees()` from `resetSingletons`. Harness test `pageTree.test.ts`: test 1 boots with the default
  panel.xml (which prunes the fuel pages); test 2 boots with a panel.xml that interfaces the fuel computer (find the
  key in `settings/KLN90BPlaneSettings.ts` and `cfg/panel.xml`) and reaches OTH 5 (navigate with the outer knob to OTH
  and the inner knob; until task 4 lands, use `selectPage('L', 'OTH 5')`). Proof: drop the call → test 2 fails.

- [ ] **Step 2: `console.error` collector and display probes.** In `bootUnit`, before `core.init`:

```ts
const consoleErrors: unknown[][] = [];
const originalError = console.error;
console.error = (...args: unknown[]) => {
    consoleErrors.push(args);
    originalError(...args);
};
```

  Add a teardown step `() => { console.error = originalError; }` (keep it in `runAll`; store `originalError` in the
  `live` state so `teardown` can reach it). `HeadlessUnit` gains `consoleErrors: unknown[][]` and

```ts
display: {
    /** The instrument container's opacity, which the brightness and the power state drive */
    opacity(): number;
    /** Every write of L:KLN90B_POWER */
    powerWrites(): { name: string; value: unknown }[];
};
```

  (`opacity` is `Number(document.getElementById('InstrumentsContainer')!.style.opacity)`; `powerWrites` filters
  `env.sim.writes` by `'L:KLN90B_POWER'`, as `PowerButton.test.ts:7-9` does.) In `Flight.start`, delete the wrapper and
  the `consoleErrors` counter; the monitor becomes
  `f.unit.consoleErrors.length === 0 || \`${f.unit.consoleErrors.length} console.error call(s)\``. Boot errors are still
  counted, because `bootUnit` installs the collector before `init`. Harness test `consoleErrors.test.ts`: a
  `console.error('x')` after boot is in `unit.consoleErrors`; a second test in the same file sees the original
  `console.error` (identity with a reference captured at module load). `test/flight/harness/consoleRestore.test.ts` and
  `monitor-console.test.ts` still pass (adapt their wording only if they name the old wrapper). Proofs: skip the push →
  the first fails; skip the restore → the second fails.

- [ ] **Step 3: Unhandled rejections.** In `bootUnit`, before `core.init`:

```ts
const rejections: unknown[] = [];
const onRejection = (reason: unknown) => {
    rejections.push(reason);
    errors.push(reason instanceof Error ? reason : new Error(String(reason)));
};
process.on('unhandledRejection', onRejection);
onTestFinished(async () => {
    // One real macrotask, so a rejection from the test's last input lands before the check
    await new Promise(resolve => setImmediate(resolve));
    process.off('unhandledRejection', onRejection);
    if (rejections.length > 0) {
        throw new Error(`unhandled rejection(s) during the test; take expected ones with unit.takeRejections():\n${rejections.map(String).join('\n')}`);
    }
});
```

  `HeadlessUnit` gains `rejections: unknown[]` and `takeRejections(): unknown[]` (returns and empties the list).
  **Order:** this callback must run before the teardown, because the teardown switches back to real timers and blanks the
  DOM. Check Vitest 5's order for `onTestFinished` callbacks (the `sequence.hooks` setting; default `stack` runs the
  last registered first) and register so that the check runs first; prove the order in the harness test. A teardown
  step also removes the listener, so that a boot that throws before the test ends cannot leak it.
  Add `/// <reference types="node" />` to `boot.ts` if `tsc` needs it (`testing.md` section 6).
  Harness test `rejections.test.ts`:
    - a test that boots, then `void Promise.reject(new Error('boom'))`, advances 250 ms and calls
      `unit.takeRejections()` gets one error `boom`, and `unit.errors` contains it; the test passes;
    - the strict check: a test declared with `it.fails` that boots and leaves a rejection untaken fails (so `it.fails`
      passes). Keep the heavy setup out of the `it.fails` body (`testing.md` section 5): a sibling test asserts that
      the same rejection is collected;
    - after these tests, `process.listenerCount('unhandledRejection')` equals its value at module load.
  Proofs: remove the listener registration → the first fails; remove the throw → the `it.fails` test turns red; remove
  `process.off` → the listener-count test fails.

- [ ] **Step 4: Boot-failure helper.** Refactor `bootUnit`'s setup into a private `prepareBoot(opts)` that both
  functions use (guard, `onTestFinished` teardown, clock, seed, SimVars, storage, DOM, navdata, collectors), then:

```ts
export interface FailedBoot {
    core: KLN90BCore;
    env: SimEnvironment;
    errors: Error[];
    /** The message on the visible error page, or null while it is hidden */
    errorPage(): string | null;
}

/**
 * Boots a unit whose start-up is expected to fail (#50): waits for the first error event instead of propsReady.
 * platform overrides methods of FakePlatform, for example a facility client whose nearest session rejects.
 */
export async function bootUnitExpectingError(opts: BootOptions & { platform?: Partial<KLN90BPlatform> } = {}): Promise<FailedBoot>
```

  The boot stays marked incomplete, so `resetSingletons(false)` tolerates singletons that were never created. It throws
  `bootUnitExpectingError: propsReady fired` if the unit came up, and a cap message after 30 s. The error page is
  `ErrorPage` (`kln90b/controls/ErrorPage.tsx`), a sibling of `#pageContainer`: read `.errorpage` (visible when it has
  no `d-none`) and `.errormessage`. Harness test `bootFailure.test.ts`: a `createFacilityClient` override whose
  `startNearestSearchSessionWithIcaoStructs` rejects with `new Error('no navdata')` gives `errors[0].message`
  `'no navdata'` and an `errorPage()` containing it; a normal platform throws `propsReady fired`. Proof: wait for
  `propsReady` instead → the first fails.

- [ ] **Step 5: EFB route manager.** In `platform.ts`:

```ts
/**
 * The EFB side of FlightPlanRouteManager as the unit uses it (KlnEfbLoader, KlnEfbSaver): a synced route, and route
 * requests the unit answers.
 */
export class FakeRouteManager {
    public readonly syncedAvionicsRoute = Subject.create<ReadonlyFlightPlanRoute | null>(null);
    public readonly avionicsRouteRequested = new SubEvent<FakeRouteManager, number>();
    public readonly replies: { requestId: number; route: ReadonlyFlightPlanRoute }[] = [];
    private nextId = 1;

    /** Emits a route as the EFB would; pass a new object each time (Subject compares by identity) */
    public sync(route: ReadonlyFlightPlanRoute | null): void {
        this.syncedAvionicsRoute.set(route);
    }

    /** Asks the unit for its route, as the EFB does; returns the request id */
    public request(): number {
        const id = this.nextId++;
        this.avionicsRouteRequested.notify(this, id);
        return id;
    }

    public replyToAvionicsRouteRequest(requestId: number, route: ReadonlyFlightPlanRoute): Promise<void> {
        this.replies.push({requestId, route});
        return Promise.resolve();
    }
}
```

  `efbRoute({departure?, destination?, enroute: (Facility | {lat, lon, name?})[]})` builds on
  `FlightPlanRouteUtils.emptyRoute()` and `emptyEnrouteLeg()` (confirm field names in `msfssdk.d.ts:30981-31040`): a
  facility sets `fixIcao`; a lat/lon sets `hasLatLon`, `lat`, `lon` and `name`. `FakePlatform` takes an optional
  route manager and overrides (`Partial<KLN90BPlatform>`); `getRouteManager` resolves with the fake when one is given and
  never resolves otherwise. `BootOptions.efb?: boolean` creates one; `HeadlessUnit.efb?: FakeRouteManager`.
  Harness test `efb.test.ts`: boot with KAAA and KBBB, `unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb,
  enroute: [{lat: 47.5, lon: 8.5}]}))`, advance 2 s: FPL 0 holds KAAA, a temporary user waypoint (region `XY`, the given
  lat/lon), KBBB (assert on `memory.fplPage.flightplans[0].getLegs()`), and the left page is FPL 0. `request()` produces
  one entry in `replies`. Proof: never resolve the manager → the test fails.

- [ ] **Step 6: Check the saver.** Read `kln90b/services/KlnEfbSaver.ts:22-88` and `Flightplan.getLegs`
  (`data/flightplan/Flightplan.ts:91-93`). If a request removes the departure and destination from FPL 0, pin it in
  `test/render/services/KlnEfbSaver.test.ts`: `it.fails('a route request leaves FPL 0 unchanged (#NEW-3-1)')` with a
  passing sibling that asserts the reply arrived. If a request with an empty FPL 0 throws (it surfaces as an unhandled
  rejection or a synchronous error from `request()`; the collector now sees it), pin it as `#NEW-3-2`, taking the
  rejection in the sibling. The source is the public contract (EFB route sync); no manual page.

- [ ] **Step 7: Docs, run, report, commit.** `testing.md` section 3: the collectors, `bootUnitExpectingError`, the EFB
  fake, the page-tree reset (add `LEFT_PAGE_TREE` to the singleton list in "Isolation and time"). Section 4: how to take
  an expected rejection, `unit.consoleErrors`, `unit.display`.

```json:metadata
{"files": ["test/harness/boot.ts", "test/harness/platform.ts", "test/harness/singletons.ts", "test/harness/flight/Flight.ts", "test/render/harness/bootFailure.test.ts", "test/render/harness/rejections.test.ts", "test/render/harness/consoleErrors.test.ts", "test/render/harness/efb.test.ts", "test/render/harness/pageTree.test.ts", "test/flight/harness/consoleRestore.test.ts", "docs/testing.md"], "verifyCommand": "npx vitest run test/render/harness test/flight/harness && npx tsc --noEmit", "acceptanceCriteria": ["boot-failure helper with error page", "strict rejection collector with takeRejections and listener removal", "console.error collector, Flight monitor uses it", "display probes", "EFB fake and route sync into FPL 0", "saver checks pinned if real", "page-tree reset", "proof lines", "npm test and tsc clean"], "modelTier": "standard"}
```

---

### Task 4: reading and driving the screen

**Goal:** `Screen` reads every page the pilot sees except the Super NAV 5 map, a reader for Super NAV 5, and
`FrontPanel` helpers that navigate and enter idents the way a pilot would.

**Files:**
- Modify: `test/harness/render/screen.ts`
- Create: `test/harness/render/superNav5.ts`
- Modify: `test/harness/flight/FrontPanel.ts`
- Modify: `test/render/harness/screen.test.ts`, `test/flight/harness/frontPanel.test.ts` (new cases)
- Create: `test/render/harness/superNav5.test.ts`, `test/render/harness/selectPage.test.ts`,
  `test/render/harness/enterIdent.test.ts`, `test/render/harness/power.test.ts`
- Modify: the existing tests whose status-line slices change with the CRSR cell (at least
  `test/render/pages/left/DirectToPage.test.ts:72-73, 101-102`; find all with `grep -rn "CRSR\|row(6)" test/`)
- Modify: `docs/testing.md` sections 3 and 4

**Acceptance Criteria:**
- [ ] A half row with trailing blanks beyond 11 cells reads without error; a non-blank cell beyond it still throws (the
      ACT page with an NDB, #115, still throws).
- [ ] With the left cursor on, the status line has `CRSR` in columns 1 to 4 and the following fields where the pilot
      sees them; `screen.status()` returns `{left, mode, right}` trimmed.
- [ ] The welcome page reads as 7 rows; Super NAV 5 throws naming `SuperNav5.read`; the NAV 5 orientation and range read
      at row 5; `rows(side)` and `maskRows(side)` return six strings.
- [ ] `SuperNav5.read()` returns the left rows, message, range, right rows or null, and direct-to window or null; field 1
      shows `-.-NM-` without an active waypoint and the XTK setting.
- [ ] `selectPage` reaches every page of both trees from any page, turning the shorter way; a test fails when the
      harness group order drifts from `PageTreeController`.
- [ ] `enterIdent` enters a short ident without an autocomplete tail in an editor, and enters idents into the APT, VOR,
      NDB, INT and SUP selectors; `focused`, `cursorTo` and `obsMode` work.
- [ ] `powerOff`, `powerOn`, `powerCycle` and `approveSelfTest` bring an engine-running and a cold-and-dark unit to a new
      main page.
- [ ] Proof lines; `npm test` and `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/render/harness test/flight/harness` → all pass; `npm test` → all pass;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Tolerant width.** In `fit`:

```ts
function fit(row: Cell[] | undefined, width: number, where: string): Cell[] {
    const r = [...(row ?? [])];
    // The DOM of some pages carries trailing blanks past the edge (the nearest selector of APT 1 and VOR); the pilot sees
    // nothing there. A visible character past the edge is a rendering bug and still throws (#115).
    while (r.length > width && r[r.length - 1].ch === ' ' && r[r.length - 1].attr === '.') r.pop();
    if (r.length > width) {
        throw new Error(`Screen: ${where} is ${r.length} cells wide, more than ${width}: "${r.map(c => c.ch).join('')}"`);
    }
    return [...r, ...Array.from({length: width - r.length}, (): Cell => ({ch: ' ', attr: '.'}))];
}
```

- [ ] **Step 2: The CRSR cell.** In `readRows`' walk, before descending into an element with the class
  `offset-left-cursor`, push one `{ch: ' ', attr: '.'}` cell (the CSS margin, `KLN90B.scss:254-256`). Update the doc
  comments of `leftName()` (now `' CRSR'` with the left cursor on) and `rightName()`. Add:

```ts
/** The status line's fields as the pilot reads them: the left page name (or CRSR/KYBD), the mode field, the right page name */
public status(): { left: string; mode: string; right: string } {
    const r = this.row(6);
    return {left: r.slice(0, 5).trim(), mode: r.slice(6, 17).trim(), right: r.slice(18, 23).trim()};
}
```

  Confirm the column ranges against a dump with both cursors off, the left on, and the right on (the mode field and
  `ent` for a pending ENT). Then fix every existing assertion that read the shifted line (`grep -rn "CRSR\|row(6)\|leftName\|rightName" test/`):
  change the slice to `status()` without changing what the test claims, and list each in the report.

- [ ] **Step 3: 7-row pages, NAV 5 and half rows.** In `Screen.read`:
    - Full page with no visible `.statusline`: up to 7 rows are allowed, and row 6 is the page's seventh line. If the
      full page contains `.super-nav5-left-controls`, throw
      `Screen: Super NAV 5 is not a text grid; use SuperNav5.read() (test/harness/render/superNav5.ts)`.
    - NAV 5: a half page containing `.nav-5-bottom-controls` reads that element's rows at row 5 instead of in DOM
      order (clone the half, remove the element, read the rest, then place the element's row at index 5).
    - `rows(side)` returns `half(side).split('\n')`; `maskRows(side)` the same columns of `mask()`.
  Harness tests in `screen.test.ts`: a synthetic DOM with a 15-cell row whose last 4 cells are blank reads; a non-blank
  12th cell throws; the welcome page after `engineRunning: false` and `KLN90B_Power_On` reads 7 rows (assert row 0
  against the existing `readRows` reading in `PowerButton.test.ts`); NAV 5 on the left has its range text in row 5.
  Proofs: remove the trailing-blank loop → the 15-cell test throws; remove the CRSR cell → a status test fails; remove
  the 7-row branch → the welcome test throws.

- [ ] **Step 4: Super NAV 5 reader** in `superNav5.ts`, from the DOM described in `pages/left/SuperNav5Page.tsx:78-85`,
  `controls/SuperNav5Left.tsx:46-59` and `SuperNav5Right.tsx:36-55`:

```ts
export interface SuperNav5Text {
    /** The seven rows of the left column (distance, ident, mode, ground speed, fields 1 to 3) */
    left: string[];
    msg: string;
    range: string;
    /** VOR, NDB, APT and orientation rows; null while the right cursor is off and they are hidden */
    right: string[] | null;
    /** The direct-to window; null while hidden */
    directTo: string | null;
}

export const SuperNav5 = {
    read(): SuperNav5Text { /* clone .super-nav5-left-controls, take out .super-nav5-mgs-range and read both with readRows;
                               read .super-nav5-right-controls-parent unless d-none; read .super-nav5-directto-window unless d-none */ },
};
```

  Harness test `superNav5.test.ts`: boot with no active waypoint and `storage: {superNav5Field1: <the XTK value of the
  SuperNav5Field1 const enum>}`, show NAV 5 on both sides (the knob sequence in `test/render/pages/left/SuperNav.test.ts`),
  advance one display tick: `left[4]` is `-.-NM-` (6-8); `left` has 7 rows; `right` is null. Proof: read the field from
  the wrong row → fails.

- [ ] **Step 5: `selectPage` both ways.** Keep the group order in the harness:

```ts
/** Page groups in outer-knob order (PageTreeController LEFT_PAGE_TREE / RIGHT_PAGE_TREE); the harness test checks it */
export const PAGE_GROUPS: Record<Side, string[]> = {
    L: ['TRI', 'MOD', 'FPL', 'NAV', 'CAL', 'STA', 'SET', 'OTH'],
    R: ['CTR', 'REF', 'ACT', 'D/T', 'NAV', 'APT', 'VOR', 'NDB', 'INT', 'SUP'],
};
```

  `selectPage(side, name)`: read the current group from `status()` (the cursor must be off), turn the outer knob by the
  signed shorter distance in `PAGE_GROUPS[side]` (wrapping), then turn the inner knob: read the page number, step toward
  the target with SET 0 counted after SET 10, and fall back to stepping forward with a cap when the group's numbering is
  not numeric (D/T, APT+n subpages; keep `sameName`). Throw with the dump when a cap is hit, as today. Harness test
  `selectPage.test.ts`: from SUP, `selectPage('R', 'INT 1')` (confirm the name the status line shows) takes one click
  backwards (count `send` calls by wrapping `unit.send` or by comparing knob events in `sim.keyEvents` — use whatever is
  observable; a spy on the panel's `outer` is fine); every left group and every right group is reachable from the boot
  pages; a test walks the real `LEFT_PAGE_TREE`/`RIGHT_PAGE_TREE` with the outer knob and compares the status-line group
  names with `PAGE_GROUPS` (the drift guard; note `LEFT_PAGE_TREE` is pruned per panel.xml). Proof: reverse one group
  pair in `PAGE_GROUPS` → the drift test fails; force forward turning → the one-click test fails.

- [ ] **Step 6: `focused`, `cursorTo`, `enterIdent`.** Make `focusedField` public as `focused(side)` (same return type).
  `cursorTo(side, text, maxClicks = 20)`: turn the outer knob until `focused(side).text.trim()` equals `text`; throw with
  the dump otherwise. `enterIdent(side, ident)`:
    - If the focused run is one cell wide, it is a waypoint selector: for each character, turn the inner knob with the
      selector charset `['0'-'9', ' ', 'A'-'Z']` (`WaypointSelector.tsx:26`), reading the character at the focused cell;
      then `outer(side, 1)` to the next character and one extra display tick for the async search. After the last
      character, if the row shows a longer autocompleted ident, set the next position to blank the same way. The
      selector lengths are APT 4, VOR 3, NDB 3, INT 5, SUP 5; stop at the selector's length.
    - Otherwise (an editor): as today, then, if `ident.length < 5`, `outer(side, 1)` and turn the inner knob to blank, so
      that `KAA` stays `KAA` instead of autocompleting to `KAAA`.
  Harness test `enterIdent.test.ts`: with KAAA and KAA in the navdata, FPL 0 accepts `KAA` and shows `KAA` (not `KAAA`);
  APT 1 with the cursor on its selector accepts `KAAA` via the knobs; VOR accepts `ABC`; INT accepts a 5-letter ident;
  `cursorTo('R', 'USER POS?')` on an unknown APT ident reaches that field. Proofs: skip the tail blanking → the `KAA`
  test fails; use the editor charset on selectors → the APT test fails.

- [ ] **Step 7: Power helpers and OBS.** In `FrontPanel`:

```ts
public powerOff(): Promise<void> { return this.press(EVT_POWER_OFF); }
public powerOn(): Promise<void> { return this.press(EVT_POWER_ON); }

/** Off, a wait, on. After boot every power-on runs the full welcome and self-test, also on an engine-running unit. */
public async powerCycle(o: { offSeconds?: number } = {}): Promise<void> {
    await this.powerOff();
    await vi.advanceTimersByTimeAsync((o.offSeconds ?? 1) * 1000);
    await this.powerOn();
}
```

  `approveSelfTest()` needs to know the current page: give `FrontPanel` an optional third constructor argument
  `currentPage: () => unknown` (`bootUnit` passes `() => props.pageManager.getCurrentPage()`, `PageManager.ts:118`), or
  detect the self-test from the screen (`APPROVE?` on the right). It advances in 1 s steps (cap 30 s) until the
  self-test page shows `APPROVE?`, presses ENT, waits for `ACKNOWLEDGE?` and presses ENT, then waits until the current
  page is a `MainPage`. On `VFROnlyPage` or `ObswarningPage` it throws with the dump (an option
  `{allowObsWarning: true}` waits through the OBS warning, which advances by itself). Import the event names from
  `kln90b/HEvents.ts`. `obsMode()`: `selectPage('L', 'MOD 2')`, `cursor('L')`, `ent()`, `cursor('L')` (confirm the
  sequence against `ModeController.test.ts:21-24`, which the refactor will replace). Harness test `power.test.ts`: an
  engine-running boot, `powerCycle()`, `approveSelfTest()`: the current page is a `MainPage` that is not the boot's
  instance; a cold-and-dark boot (`engineRunning: false`), `powerOn()`, `approveSelfTest()`: main page shown, NAV 2 on
  the left. Proof: skip the second ENT → the test times out with the dump.

- [ ] **Step 8: Docs, run, report, commit.** `testing.md` section 4: `status()`, `rows`/`maskRows`, the 7-row pages,
  `SuperNav5.read`, two-way `selectPage`, `enterIdent` on selectors, `focused`, `cursorTo`, the power helpers,
  `obsMode`. Leave section 6's old traps to task 9.

```json:metadata
{"files": ["test/harness/render/screen.ts", "test/harness/render/superNav5.ts", "test/harness/flight/FrontPanel.ts", "test/render/harness/screen.test.ts", "test/render/harness/superNav5.test.ts", "test/render/harness/selectPage.test.ts", "test/render/harness/enterIdent.test.ts", "test/render/harness/power.test.ts", "test/flight/harness/frontPanel.test.ts", "test/render/pages/left/DirectToPage.test.ts", "docs/testing.md"], "verifyCommand": "npx vitest run test/render/harness test/flight/harness && npx tsc --noEmit", "acceptanceCriteria": ["tolerant width keeps #115 visible", "CRSR cell and status()", "7-row pages, NAV 5 row 5, rows/maskRows", "SuperNav5.read with -.-NM-", "two-way selectPage with drift guard", "enterIdent editors and selectors, focused, cursorTo, obsMode", "power helpers and approveSelfTest", "existing CRSR assertions updated", "proof lines", "npm test and tsc clean"], "modelTier": "standard"}
```

---

### Task 5: shared helpers

**Goal:** The small helpers that several test files duplicate: angles and positions in `geo.ts`, the standard world, flight
conveniences, saved user waypoints and a leg insert.

**Files:**
- Modify: `test/harness/flight/geo.ts`
- Create: `test/harness/fixtures.ts`, `test/harness/flightplan.ts`
- Modify: `test/harness/flight/Flight.ts` (`syncDisplay`, `flyUntilActive`)
- Modify: `test/harness/storage.ts` (`savedUserWaypoints`)
- Modify: `test/unit/harness/aircraft.test.ts` or create `test/unit/harness/geo.test.ts`; create
  `test/flight/harness/syncDisplay.test.ts`, `test/render/harness/savedUserWaypoints.test.ts`,
  `test/render/harness/insertLeg.test.ts`
- Modify: `docs/testing.md` sections 3 and 4

**Acceptance Criteria:**
- [ ] `angleDiff` is signed in (-180, 180]; `angleBetween` is absolute and treats null as 180; `pointFrom` and
      `pointBefore` agree with `distanceNm`/`courseDeg` to 1e-6 NM and 1e-6°, and are textbook formulas, not the SDK.
- [ ] `standardRoute()` returns fresh KAAA (47.0, 8.0), ABC (47.5, 8.9) VOR and KBBB (48.2, 9.2) on every call.
- [ ] `flight.syncDisplay()` returns at a display tick that ran without a calculation tick; `flight.flyUntilActive`
      throws with the dump on timeout.
- [ ] `savedUserWaypoints` produces V2 storage strings that the unit restores (the waypoint shows up in the repository
      with its coordinates); its layout is written by hand from the format, not by the persistor.
- [ ] `insertLeg(unit, idx, fac)` inserts into FPL 0 as the two duplicated `append` helpers do.
- [ ] Proof lines; `npm test` and `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/unit/harness test/render/harness test/flight/harness` → all pass; `npm test` → all
pass; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: `geo.ts`.**

```ts
/** a - b, signed, in (-180, 180] */
export function angleDiff(a: number, b: number): number {
    const d = ((a - b) % 360 + 540) % 360 - 180;
    return d === -180 ? 180 : d;
}

/** |a - b| in degrees, 0 to 180; a null course (no DTK) counts as 180, the farthest it can be */
export function angleBetween(a: number | null, b: number): number {
    return a === null ? 180 : Math.abs(angleDiff(a, b));
}

/** The point nm from p on the initial course bearingTrue (textbook destination formula on the same sphere) */
export function pointFrom(p: LatLon, bearingTrue: number, nm: number): LatLon {
    const d = nm / EARTH_RADIUS_NM;
    const b = bearingTrue * RAD;
    const lat1 = p.lat * RAD;
    const lon1 = p.lon * RAD;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return {lat: lat2 / RAD, lon: ((lon2 / RAD + 540) % 360) - 180};
}

/** The point nm before `to` on the great circle from `from` */
export function pointBefore(from: LatLon, to: LatLon, nm: number): LatLon {
    return pointFrom(to, courseDeg(to, from), nm);
}
```

  Note: the old helpers used `angleTo = Math.abs(((a - b + 540) % 360) - 180)`, i.e. `angleBetween`. Test in
  `test/unit/harness/geo.test.ts`: `angleDiff(10, 350)` is 20, `angleDiff(350, 10)` is -20, `angleDiff(0, 180)` is 180;
  `angleBetween(null, 5)` is 180; `pointFrom(kaaa, 51, 30)` is 30 NM away at course 51 (via `distanceNm`/`courseDeg`);
  `pointBefore(kaaa, abc, 10)` is 10 NM from ABC on the KAAA–ABC great circle (distance check plus the course from
  KAAA equal within 1e-6). Proof: swap sin and cos in the latitude term → fails.

- [ ] **Step 2: `fixtures.ts`.**

```ts
import {airport, vor} from './navdata/builders';

/**
 * The world many tests use: KAAA (47.0, 8.0), the VOR ABC (47.5, 8.9) and KBBB (48.2, 9.2), roughly 45 NM and 45 NM
 * apart with a turn of about 35° at ABC. Fresh objects on every call, so a test may change them.
 */
export function standardRoute() {
    return {kaaa: airport('KAAA', 47.0, 8.0), abc: vor('ABC', 47.5, 8.9), kbbb: airport('KBBB', 48.2, 9.2)};
}
```

  Check the distances and the turn against `geo.ts` before writing them into the comment; if they differ, write the
  measured values. Test: two calls return different objects with the same idents and coordinates.

- [ ] **Step 3: Flight conveniences.** In `Flight`:

```ts
/**
 * Flies display ticks until one ran without a calculation tick, so the screen shows the latest calculation (both fall
 * due once a second and the display tick runs first; testing.md section 4).
 */
public async syncDisplay(): Promise<void>

/** flyUntil the active waypoint is ident */
public flyUntilActive(ident: string, o: { timeout: number }): Promise<number> {
    return this.flyUntil(() => this.nav.activeIdent === ident, {timeout: o.timeout, description: `${ident} active`});
}
```

  Implement `syncDisplay` from the loop at the end of `test/flight/flights/firstFlight.test.ts:80-85` (read it and move
  that logic here). Test `test/flight/harness/syncDisplay.test.ts`: after `syncDisplay()`, the NAV 1 DIS row equals the
  model's `distToActive` formatted (the same comparison the proof flight makes); `flyUntilActive('ZZZ', {timeout: 2})`
  rejects with a message naming `ZZZ active`. Proof: return at once from `syncDisplay` → the comparison fails (check
  that it does; if the comparison happens to pass anyway, pick a moment within the second where it does not and say so).

- [ ] **Step 4: `savedUserWaypoints`** in `storage.ts`. Read the V2 user-waypoint format in `docs/architecture.md`
  (Core 7) and the literals in `test/unit/settings/UserWaypointV2.test.ts`. Write the strings by hand-laid template
  (type letter, region `XX`, ident padded, signed coordinates as in the literals), one storage key per slot as the
  persistor uses (check the key names in `settings/KLN90BUserWaypoints.ts`), plus `userDataFormat: 2`. Support at least
  user waypoints (SUP), user intersections and user airports with or without runway length, because
  `Oth3Page.test.ts:6-14`, `Apt3UserPage.test.ts:17, 30` and `render/harness/reboot.test.ts:22` build these by hand.
  Test `savedUserWaypoints.test.ts`: boot with one of each, `settle`: `KLNFacilityRepository` (or the SUP/INT/APT page)
  holds each with its coordinates; the strings equal hand-written literals for the same facilities. Proof: flip a sign
  in the template → the restore test fails.

- [ ] **Step 5: `flightplan.ts`.**

```ts
import {Facility} from '@microsoft/msfs-sdk';
import type {HeadlessUnit} from './boot';
import {KLNLegType} from '../../kln90b/data/flightplan/Flightplan';

/** Inserts a USER leg into FPL 0 at idx, as the FPL page does after a waypoint confirmation */
export function insertLeg(unit: HeadlessUnit, idx: number, fac: Facility): void {
    unit.props.memory.fplPage.flightplans[0].insertLeg(idx, {wpt: fac, type: KLNLegType.USER});
}
```

  Match the existing duplicated helpers exactly (`ActPage.test.ts:21-24`, `WaypointConfirmPage.test.ts:11-13`; they may
  call `insertLegIntoFpl` on another object; use the same call). Test `insertLeg.test.ts`: after two inserts, FPL 0's
  legs are in the given order. Proof: insert at `idx + 1` → fails.

- [ ] **Step 6: Docs, run, report, commit.** `testing.md` section 4: the geo helpers (setup and expectations), the
  standard world, `syncDisplay` and `flyUntilActive` (replace the prose "fly display ticks until one passes" with the
  helper), `savedUserWaypoints`, `insertLeg`.

```json:metadata
{"files": ["test/harness/flight/geo.ts", "test/harness/fixtures.ts", "test/harness/flightplan.ts", "test/harness/flight/Flight.ts", "test/harness/storage.ts", "test/unit/harness/geo.test.ts", "test/flight/harness/syncDisplay.test.ts", "test/render/harness/savedUserWaypoints.test.ts", "test/render/harness/insertLeg.test.ts", "docs/testing.md"], "verifyCommand": "npx vitest run test/unit/harness test/render/harness test/flight/harness && npx tsc --noEmit", "acceptanceCriteria": ["angleDiff/angleBetween/pointFrom/pointBefore textbook and tested", "standardRoute fresh", "syncDisplay and flyUntilActive", "savedUserWaypoints restores", "insertLeg", "proof lines", "npm test and tsc clean"], "modelTier": "standard"}
```

---

## Phase 2: the refactor (tasks 6 to 8)

All three start after tasks 1 to 5 are merged into the session branch. Shared rules:
- A test keeps the meaning of its assertions; only setup, navigation and reading change. A local helper that a harness
  helper replaces is deleted once unused.
- **Stay raw** where the raw event is the subject: `test/render/PowerButton.test.ts` (the H events; its `opacity` and
  `powerWrites` probes do move to `unit.display`), `test/render/services/KeyboardService.test.ts` (the key event),
  `test/render/pages/left/pageNames.test.ts`, the #56 knob tests in `MainPage.test.ts`, the #81 knob in
  `DirectToPage.test.ts`, the CAL subpage changes in `Cal2Page.test.ts` and `AltitudeFieldset.test.ts`, and every
  harness test.
- **Re-proof:** a test whose navigation, waits or ident entry changed is proven again against its original bug (rule 10).
  A test that only swaps a reader (`rows`, `status()`) needs no re-proof. The commit lists every re-proven test with its
  proof line and every file changed.
- Remove the comments that explain a removed workaround (the ENT-trap comments, "selectPage would pass the NDB page",
  "rightName() cannot be used").
- The suite totals are the same before and after (passed and expected failures), unless a hidden rejection or
  `console.error` surfaces; then stop and report it, do not hide it.

Workaround inventory from the research pass (line numbers at the session start; confirm before editing):

| workaround | where | replace with |
|---|---|---|
| fixed-count page navigation | FPL 0 via `outer('L', -1)`: render `data/flightplan/ActiveWaypoint.test.ts:24, 77`, `pages/left/DirectToPage.test.ts:21, 84`, `pages/right/Dt3Page.test.ts:22`; CTR 1: `ActiveWaypoint.test.ts:161`; NAV 4 right: `MainPage.test.ts:44-45` (only if not the #56 subject); CAL 1: `Cal1Page.test.ts:14, 36`, `CursorController.test.ts:14`; CAL 2/3: `Cal2Page.test.ts:13-14, 31-32`, `AltitudeFieldset.test.ts:14-15`; SET 2: `Set2Page.test.ts:11-12, 22-23`, `DateEditor.test.ts:11-12`; SET 0: `Set0Page.test.ts:13-14, 24-25`; SET 10: `Set10Page.test.ts:8-9`; NAV 3: `Nav3Page.test.ts:23`; INT: `IntPage.test.ts:13-15`; VOR, ACT: `WaypointConfirmPage.test.ts:26-28, 35-36`; D/T 3: `Dt3Page.test.ts:23-26` | `selectPage` |
| fixed-count field moves | `IntPage.test.ts:18`, `KeyboardService.test.ts:23-25` (setup only, not the key events), `Apt1Page.test.ts:27-30` with local `highlightedRows` (`:7-18`) | `cursorTo`, `focused` |
| `readRows` around the width check | `ActPage.test.ts:9-19` (`rightRows`, `statusLine`), `WaypointConfirmPage.test.ts:9` | `Screen.read().rows('R')`, `status()` (the ACT page with an NDB still needs `readRows`; keep it there with the #115 reason) |
| `readRows` on the welcome page | `Gps.test.ts:20-21`, `PowerButton.test.ts:54-55` | `Screen.read()` |
| hand-sliced status line | `WaypointEditor.test.ts:17-18`, `DirectToPage.test.ts:33-34, 72-73, 101-102`, `IntPage.test.ts:25`, `flight/harness/boot.test.ts:43-44` (harness: leave) | `status()` |
| `half(...).split('\n')` and local `left(n)`/`right(n)`/`rightRow`/`identAndName`, `row(n).slice(12)` | many files; local helpers in `MainPage.test.ts:6`, `Cal1Page.test.ts:7`, `Cal2Page.test.ts:6`, `DateEditor.test.ts:19`, `AltitudeFieldset.test.ts:6`, `AltPage.test.ts:7`, `KeyboardService.test.ts:6`, `Apt1Page.test.ts:60`, `VorPage.test.ts:7`, `Apt1Page.test.ts:27, 36`, `DirectToPage.test.ts:51, 104` | `rows(side)` |
| local mask helpers | `CursorController.test.ts:6`, `KeyboardService.test.ts:11`, `WaypointEditor.test.ts:24`, `DateEditor.test.ts:43`, `Oth3Page.test.ts:33, 60` | `maskRows(side)` |
| `panel.type` into selectors | `Apt1Page.test.ts:26`, `VorPage.test.ts:26`, `Apt3UserPage.test.ts:8`, `IntPage.test.ts:19`, `WaypointConfirmPage.test.ts:30, 43` | `enterIdent` (keep `type` only where the keyboard is the subject) |
| hand-rolled welcome and self-test waits | `SelfTestLeftPage.test.ts:7-9`, `Gps.test.ts:12-17` | `panel.powerOn()`; keep a fixed wait where the time is the subject (#61 measures the acquisition during the self-test) |
| ENT-trap comments and screen-only assertions | render `ActiveWaypoint.test.ts:62-66, 94-97` | keep the screen assertion, drop the comment; the strict collector now fails on a rejection |
| hand-written `console.error` spies | `Dt3Page.test.ts:14`, `ErrorPage.test.ts:23, 43`, `Apt1Page.test.ts:109-121, 127-139` | `unit.consoleErrors` (an `ErrorPage` silencing mock may stay if it silences output on purpose; say so) |
| duplicated `append` | `ActPage.test.ts:21-24`, `WaypointConfirmPage.test.ts:11-13` | `insertLeg` |
| `angleTo` / `angleDiff` | `firstFlight.test.ts:40`, `largeTurn.test.ts:34`, `turnDirection.test.ts:36`, `duplicateWaypoint.test.ts:25`, `flight/harness/jump.test.ts:9` (harness: may move) | `angleBetween` / `angleDiff` |
| point before/after a facility | `ModeController.test.ts:15-18`, render `ActiveWaypoint.test.ts:107, 154`, `firstFlight.test.ts:19`, `turnDirection.test.ts:28-29`, `hsiToFromFlags.test.ts:22`, `duplicateWaypoint.test.ts:17, 117`, `largeTurn.test.ts:9-10`, unit `ActiveWaypoint.test.ts:13-14` | `pointFrom` / `pointBefore` (the result may differ from the SDK's `offset` in the last digits; a test whose literals depend on the exact position keeps its form or re-derives the literal, said in the commit) |
| standard world | `ModeController.test.ts:10-12`, render `ActiveWaypoint.test.ts:148-150`, `SensorsOutSimVars.test.ts:9-10`, `firstFlight.test.ts:12-14`, `hsiToFromFlags.test.ts:16-18`, `turnDirection.test.ts:19`, `duplicateWaypoint.test.ts:12` | `standardRoute()` |
| `flyUntil(activeIdent === …)` | `firstFlight.test.ts:23`, `hsiToFromFlags.test.ts:28`, `turnDirection.test.ts:34`, `duplicateWaypoint.test.ts:122` | `flyUntilActive` |
| display sync loop | `firstFlight.test.ts:80-85` | `syncDisplay()` |
| `enterObs` | `ModeController.test.ts:21-24`, render `ActiveWaypoint.test.ts:113-114`, `hsiToFromFlags.test.ts:29-30` | `panel.obsMode()` |
| hand-built V2 user-waypoint strings | `Oth3Page.test.ts:6-14`, `Apt3UserPage.test.ts:17, 30` | `savedUserWaypoints` (`render/harness/reboot.test.ts:22` is a harness test: leave) |
| power and brightness probes | `PowerButton.test.ts:7-9`, `BrightnessManager.test.ts:4` | `unit.display` |
| `SidStar.test.ts`, `BoundaryUtils.test.ts` | done in tasks 1 and 2 | — |

### Task 6: refactor R1 (render left pages, controls, root render files)

**Goal:** The tests in `test/render/pages/left/`, `test/render/controls/` and the files directly in `test/render/` use the
new harness instead of their workarounds.

**Files:**
- Modify: `test/render/pages/left/*.test.ts`, `test/render/controls/**/*.test.ts`, `test/render/*.test.ts` (per the
  inventory rows that fall in these folders)

**Acceptance Criteria:**
- [ ] Every inventory row in these folders is applied or kept with a stated reason.
- [ ] Assertions keep their meaning; deleted local helpers have no remaining use.
- [ ] Every test whose navigation, waits or ident entry changed is re-proven against its original bug (proof lines).
- [ ] `npm test` totals unchanged; `npx tsc --noEmit` clean; one commit.

**Verify:** `npx vitest run test/render/pages/left test/render/controls test/render/*.test.ts` → all pass; `npm test` →
same totals as before the task; `npx tsc --noEmit` → no output.

**Steps:**
- [ ] **Step 1:** Run `npm test` and record the totals.
- [ ] **Step 2:** Apply the inventory rows for these folders, one file at a time, running the file after each.
- [ ] **Step 3:** Re-prove the changed-navigation tests: for each, reintroduce the original bug named in its title (the
  triage row in `docs/test-coverage.md` section 5 says how), see it fail, restore, `git diff` shows only the test.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, report, one commit listing each file and each proof.

```json:metadata
{"files": ["test/render/pages/left", "test/render/controls", "test/render"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["inventory rows applied or reasoned", "assertions keep meaning", "re-proof where navigation or waits changed", "same totals", "one commit"], "modelTier": "standard"}
```

### Task 7: refactor R2 (render right pages, data, services)

**Goal:** The tests in `test/render/pages/right/`, `test/render/data/` and `test/render/services/` use the new harness
instead of their workarounds.

**Files:**
- Modify: `test/render/pages/right/*.test.ts`, `test/render/data/**/*.test.ts`, `test/render/services/*.test.ts`

**Acceptance Criteria:**
- [ ] Every inventory row in these folders is applied or kept with a stated reason (the ACT page with an NDB keeps
      `readRows`, #115).
- [ ] Assertions keep their meaning; deleted local helpers have no remaining use.
- [ ] Every test whose navigation, waits or ident entry changed is re-proven against its original bug (proof lines).
- [ ] `npm test` totals unchanged; `npx tsc --noEmit` clean; one commit.

**Verify:** `npx vitest run test/render/pages/right test/render/data test/render/services` → all pass; `npm test` → same
totals; `npx tsc --noEmit` → no output.

**Steps:**
- [ ] **Step 1:** Run `npm test` and record the totals.
- [ ] **Step 2:** Apply the inventory rows for these folders, one file at a time, running the file after each.
- [ ] **Step 3:** Re-prove the changed-navigation and changed-entry tests against their original bugs.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, report, one commit listing each file and each proof.

```json:metadata
{"files": ["test/render/pages/right", "test/render/data", "test/render/services"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["inventory rows applied or reasoned", "assertions keep meaning", "re-proof where navigation, waits or entry changed", "same totals", "one commit"], "modelTier": "standard"}
```

### Task 8: refactor R3 (flight and unit)

**Goal:** The tests in `test/flight/` and `test/unit/` use the new harness instead of their workarounds.

**Files:**
- Modify: `test/flight/flights/*.test.ts`, `test/unit/**/*.test.ts` (per the inventory rows in these folders; harness
  tests may move to the shared geo helpers, nothing else)

**Acceptance Criteria:**
- [ ] Every inventory row in these folders is applied or kept with a stated reason.
- [ ] Expected values stay independent of the code under test (`geo.ts` is the textbook module); literals that depended on
      the SDK's `offset` are re-derived or kept, said in the commit.
- [ ] Every flight whose setup position, predicate or sync changed is re-proven against its original bug.
- [ ] `npm test` totals unchanged; `npx tsc --noEmit` clean; one commit.

**Verify:** `npx vitest run --project flight` and `npx vitest run --project unit` → all pass; `npm test` → same totals;
`npx tsc --noEmit` → no output.

**Steps:**
- [ ] **Step 1:** Run `npm test` and record the totals.
- [ ] **Step 2:** Apply the inventory rows for these folders, one file at a time, running the file after each.
- [ ] **Step 3:** Re-prove each changed flight against its original bug (the triage row says how).
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`, report, one commit listing each file and each proof.

```json:metadata
{"files": ["test/flight/flights", "test/unit"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["inventory rows applied or reasoned", "expectations stay independent", "re-proof of changed flights", "same totals", "one commit"], "modelTier": "standard"}
```

---

### Task 9: issues and close-out

**Goal:** File the bugs the session found, re-verdict the triage rows, insert Session 3b, reconcile `testing.md`, and
write the session log.

**Files:**
- Modify: test files containing `#NEW-` placeholders
- Modify: `docs/test-coverage.md` (Session H checkbox and text, new Session 3b, section 4 log, section 5 rows)
- Modify: `docs/testing.md` sections 3, 4, 6 and 7

**Acceptance Criteria:**
- [ ] Every confirmed bug from the reports and reviews has a GitHub issue with the `bug` label, filed after a search of
      open and closed issues; `grep -r "#NEW-" test/` finds nothing.
- [ ] The *needs harness* rows say *testable* and name their extension; the pause half of `43d472b` is *testable* at
      render stage with its reason; the flight-only versions of `92fbba1` and #61 stay uncovered with the maintainer's
      ruling.
- [ ] Section 3 has Session 3b between Session H and Session 4: goal, the rows it takes, done-when, run by rules 19 to 27;
      the Session H text names Session 3b instead of a rerun.
- [ ] `testing.md` section 6 drops the traps the session removed and records the inferred behaviors; section 7 drops what
      was built and keeps what was not.
- [ ] Session H is ticked; its log entry has done, decisions, bugs filed, not covered (rule 18), coverage at start and
      end, the suite totals.
- [ ] `npm test`, `npx tsc --noEmit` and `npm run coverage` clean.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [ ] **Step 1: Issues.** Collect the suspected bugs from the reports and reviews (expected candidates: `AirspaceAlert.ts:155`,
  the `KlnEfbSaver` request handling, anything the strict rejection check surfaced). For each, search open and closed
  issues with several wordings, then file with the `bug` label: what is wrong, a reproduction with observed and expected
  values, file and line, user impact, a suggested fix. Cite manual pages; never copy manual text. Replace the
  placeholders in one commit (`references #NN …` per issue).
- [ ] **Step 2: Triage table** (section 5). Rows #15, #17, #18, #20, #21, `326da1a`, `633fdad`, `7fd640e`/`1ef2a35`,
  `80631c8`, #57, `133f4d8`, #50, `eef92e8`: verdict *testable*, the how/why column names the extension (procedure
  builders, nearest filters, airspaces, EFB fake, boot-failure helper, Super NAV 5 reader). `43d472b` (part): *testable*,
  stage render, reason "a render test sets ground speed above 2 kt, teleports once and holds; no harness needed". Rows
  #23, the #41 missed approach and the DME-arc half of #19 (in the session 3 log's "not covered") get a note that
  procedure builders now exist. Do not tick them; Session 3b does.
- [ ] **Step 3: Session 3b.** Insert after Session H in section 3:
    - `## Session 3b: regression tests for the rows Session H unblocked` with an unticked checkbox;
    - **Goal:** a test for every row that Session H turned from *needs harness* into *testable*, plus #23, the #41 missed
      approach, the DME-arc half of #19, #90 and the pause half of `43d472b`, in impact order (navigation first), at the
      cheapest stage, proven to bite;
    - the steps of sessions 2 and 3 (one issue per flight, pins for half-fixed rows, tick the rows), the tasks pattern
      (no harness task unless a gap appears; batches by area), and **Done when** every such row is ticked or
      re-verdicted with a reason.
  In Session H's text, replace "picked up by a rerun of session 2 or 3" with "picked up by Session 3b". Check section 3's
  intro sentence about the order of sessions and add 3b there.
- [ ] **Step 4: `testing.md`.** Reconcile the paragraphs the tasks added in sections 3 and 4 (one voice, no duplicates).
  Section 6: remove "The navdata is synthetic … no procedures" (rewrite to what is still synthetic: the bounding-box
  airspace search is inferred, circles are ignored by the instrument, nearest filters follow the sim developers' rule),
  "Errors thrown on the ENT path never reach `unit.errors`" (now collected strictly; keep a line on `takeRejections`),
  "`FrontPanel.enterIdent` cannot type into the ident selectors", the CRSR shift, the width trap (keep #115), "Display
  limits" for Super NAV 5, and "The render harness does not fail on console.error" (rewrite: it collects, it does not
  fail). Section 7: drop the items built; keep the flight cold start and `GPS DRIVES NAV1` with the maintainer's ruling,
  and add anything the reports list as not done.
- [ ] **Step 5: Log and checks.** Tick Session H. Write the log entry (newest first): done per task, the decisions above,
  bugs filed, refactor scope (files changed, kept forms and why, re-proofs), not covered, workflow notes, coverage at the
  start (identical to the end of session 3) and the end from `npm run coverage`, and the suite totals. Run the checks,
  commit.

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["bugs filed with bug label after duplicate search", "no #NEW- placeholders", "needs-harness rows re-verdicted", "Session 3b inserted and Session H text updated", "testing.md sections 6 and 7 reconciled", "session log complete", "checks clean"], "modelTier": "standard"}
```

---

## Execution notes for the controlling session

- Tasks 1 to 5 run in parallel (rule 21). Merge order: 5, 4, 1, 2, 3 (smallest overlap first). Expected merge overlaps:
  `boot.ts` (tasks 1, 2, 3), `Flight.ts` (tasks 2, 3, 5), `singletons.ts` (tasks 2, 3), `MemoryFacilityClient.ts` (tasks
  1, 2), `docs/testing.md` (all). Resolve by keeping both sides; run `npm test` and `npx tsc --noEmit` after each merge.
- After task 4 merges, any test another task added that slices the status line around `CRSR` is fixed in that merge.
- Tasks 6 to 8 start from the session branch after all five merges and run in parallel.
- Reviewers: Opus for tasks 1, 2 and 3; Sonnet for 4 to 9. Each runs the mutation pass in the task's worktree and checks
  every page citation in the diff against the page index.
- The final review of the whole session runs on Opus before the maintainer is asked to approve the merge into `master`.
