# EFB Route Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load the EFB route into FPL 0 with its SID, STAR and approach, with airways expanded and point-bearing-distance
fixes created, and cut a route that does not fit by the rules of the design without ever losing the destination.

**Architecture:** `EfbRouteResolver` turns the SDK route into an ordered list of segments (async: navdata, airways,
temporary waypoints, `SidStar` conversion). `fitEfbRoute` is a pure function that applies the limits and returns the legs
to load and the idents to report. `KlnEfbLoader` runs the two, loads FPL 0, removes the temporary waypoints of cut legs,
posts the messages and makes the newest route win.

**Tech Stack:** TypeScript (target es2017), `@microsoft/msfs-sdk` 2.3.3, Vitest (unit, render stages).

**Spec:** `docs/superpowers/specs/2026-10-24-efb-route-import-design.md` (read it first; its sections are cited as §N).

## Global Constraints

- `target: es2017`: no `Array.prototype.flat`/`flatMap`, `Object.fromEntries` or other later runtime features in `kln90b/`.
- The limits are the constants `MAX_LEGS` (30 en-route legs) and `MAX_FPL0_LEGS` (45 legs) of `kln90b/data/flightplan/Flightplan.ts`; never a literal.
- The message text is exactly `WAYPOINT ${ident} DELETED`; more than 10 give the first 10 and `OTHER WAYPOINTS DELETED`.
- The import never posts `REDUNDANT WPTS IN FPL`.
- Public contract (CLAUDE.md): the EFB route sync keeps its meaning; H events, LVars, panel.xml keys, persisted formats untouched.
- Comments cite the issue (`#195`, `#378`) and manual pages (`4-1`, `6-5`) where behavior is decided; never copy manual text.
- American English; no counts in prose for things that grow (CLAUDE.md "Writing").
- Commits: exactly one `fixes #195 …` and one `fixes #378 …` commit (CLAUDE.md "One commit per issue"), each with its tests and doc changes, each ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git push`.
- A bug found on the way is not fixed on the side: check GitHub issues, file one with the `bug` label, pin it with `it.fails('… (#NN)')` (CLAUDE.md).
- Every step's checks: `npx tsc --noEmit` clean, and the named Vitest file green.

## Review Focus

1. A PPOS leg (`isPpos`) in the route: dropped silently as today, the rest loads. Test in Task 3.
2. An airway leg whose exit is the entry fix itself: no expansion, the fix loads once more as the leg (direct), no crash. Test in Task 3.
3. `null` synced right after a route (the EFB clears): FPL 0 ends empty, the overtaken route posts nothing. Test in Task 3.
4. A SID named while the route has no departure airport: the SID is skipped without a message, the rest loads. Test in Task 4.
5. A loaded approach with a DME arc: its arc entry stays in the repository (FPL 0 uses it); only entries of cut or invalid procedures go. Test in Task 4.

---

### Task 1: The fit rules (`fitEfbRoute`)

**Files:**
- Create: `kln90b/services/EfbRouteFit.ts`
- Test: `test/unit/services/EfbRouteFit.test.ts`

**Interfaces:**
- Produces:
  ```ts
  /** §4: a part of the route, in route order */
  export type EfbSegment =
      | { readonly kind: "user", readonly legs: KLNFlightplanLeg[] }       // departure airport, en-route fixes: cut leg by leg
      | { readonly kind: "procedure", readonly legs: KLNFlightplanLeg[] }  // SID, STAR, approach: whole or nothing
      | { readonly kind: "invalid", readonly idents: string[] }            // a procedure the unit cannot take: skipped, reported
      | { readonly kind: "missing", readonly ident: string };              // a fix that cannot be loaded: dropped, reported, never cuts
  export interface ResolvedEfbRoute { readonly segments: EfbSegment[], readonly destination: KLNFlightplanLeg | null }
  export interface EfbFitResult { readonly legs: KLNFlightplanLeg[], readonly deleted: string[] }
  export function fitEfbRoute(route: ResolvedEfbRoute): EfbFitResult
  ```

The algorithm (§4): walk the segments; count en-route legs (`type === KLNLegType.USER`) and all legs; when `destination`
is not null, one en-route and one total leg are reserved for it. A `user` segment takes legs one by one while
`enRoute + 1 <= MAX_LEGS - reserve` and `total + 1 <= MAX_FPL0_LEGS - reserve`; a `procedure` segment is taken only if
all its legs fit the total. `invalid` and `missing` add their idents to `deleted` and do not stop the walk. At the first
leg or procedure that does not fit, the walk is cut: from then on every remaining leg ident, `invalid` ident and
`missing` ident goes to `deleted`, in route order. The destination is appended last when not null.

- [ ] **Step 1: Write the failing tests.** Helpers in the test file: `user(...idents)` makes a `user` segment of
  `{wpt: intersection(ident, 47, 8), type: KLNLegType.USER}` legs; `proc(type, ...idents)` a `procedure` segment of legs
  of that type; `fixes(prefix, n)` the idents `prefix01`…; `idents(result.legs)` via `identsOf`. Tests (name — assertion):
  - `loads a route that fits whole` — dep `KAAA`, user `A B C`, destination `KBBB` → legs `[KAAA,A,B,C,KBBB]`, deleted `[]`.
  - `cuts the en-route part and keeps the destination (#195)` — user `KAAA`+`W01..W30`, destination `KBBB` → legs `[KAAA, W01..W28, KBBB]`, deleted `[W29, W30]`.
  - `cuts at the 30th en-route leg without a destination` — user `W01..W31`, destination null → legs `W01..W30`, deleted `[W31]`.
  - `fills FPL 0 to exactly 45 legs` — user `KAAA`, SID `S01..S15`, user `W01..W28`, destination `KBBB` → 45 legs, deleted `[]`.
  - `drops a procedure that does not fit whole and everything after it, but keeps the destination (#378)` — user `KAAA`, SID `S01..S10`, user `W01..W27`, STAR `T01..T08`, APP `P01 P02`, destination `KBBB` → legs `[KAAA, S01..S10, W01..W27, KBBB]`, deleted `[T01..T08, P01, P02]` (the approach would fit alone).
  - `skips an invalid procedure and goes on loading (#378)` — user `KAAA`, invalid `[S1,S2]`, user `A`, STAR `T1`, destination `KBBB` → legs `[KAAA,A,T1,KBBB]`, deleted `[S1,S2]`.
  - `reports a missing fix without cutting` — user `A`, missing `ZZZ`, user `B`, destination `KBBB` → legs `[A,B,KBBB]`, deleted `[ZZZ]`.
  - `reports everything after a cut in route order` — user `KAAA`+`W01..W29`, missing `ZZZ`, invalid `[T1]`, destination `KBBB` → deleted `[W29, ZZZ, T1]`.
  - `keeps the procedure leg types` — the SID legs of the 45-leg case come out with `KLNLegType.SID`.
- [ ] **Step 2:** `npx vitest run test/unit/services/EfbRouteFit.test.ts` — FAIL (module not found).
- [ ] **Step 3:** Implement `fitEfbRoute` in `kln90b/services/EfbRouteFit.ts` with a doc comment citing §4, 4-1 and #221.
- [ ] **Step 4:** Run the test file — PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** `git commit -m "WIP #195 fit rules"` (squashed in Task 3).

### Task 2: Airways through the facility loader

**Files:**
- Modify: `kln90b/data/navdata/KLNFacilityLoader.ts:189` (`ActualFacilityClient` gains `'getAirway'`), `:360-366` (`getAirway` delegates), `:396-398` (`tryGetAirway` delegates, resolving null on rejection)
- Modify: `test/harness/navdata/MemoryFacilityClient.ts` (airways)
- Test: `test/unit/harness/navdata.test.ts`, `test/unit/data/navdata/KLNFacilityLoader.test.ts` (create if absent)

**Interfaces:**
- Produces: `KLNFacilityLoader.getAirway(airwayName: string, airwayType: number, icao: IcaoValue): Promise<AirwayData>` (rejects when the sim has none); `MemoryFacilityClient.addAirway(name: string, fixes: Facility[]): void` and `MemoryFacilityClient.getAirway(name: string, type: number, icao: IcaoValue): Promise<AirwayData>` — resolves `{name, type: 0, waypoints: fixes as IntersectionFacility[]}` for the airway of that name whose fixes include `icao` (by `ICAO.getUid`), rejects otherwise. A VOR in `fixes` keeps its type `V` ICAO, as the sim gives a VOR on an airway.

- [ ] **Step 1: Failing tests.** navdata: `getAirway returns the airway holding the fix` (waypoint idents in order) and `getAirway rejects for a fix not on the airway`. KLNFacilityLoader: `getAirway asks the sim's facility loader` (returns the fake's airway for a fix on it).
- [ ] **Step 2:** Run both files — FAIL.
- [ ] **Step 3:** Implement as the Interfaces say. Check that the casts in `test/harness/platform.ts` and every `new KLNFacilityLoader(... as unknown as ActualFacilityClient)` still type-check.
- [ ] **Step 4:** Both files PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5:** `git commit -m "WIP #195 airways"`.

### Task 3: Resolve the en-route part and load through the fit (#195)

**Files:**
- Create: `kln90b/services/EfbRouteResolver.ts`
- Modify: `kln90b/services/KlnEfbLoader.ts` (whole class), `kln90b/services/Flightplanloader.ts:17-37` (extract the cap)
- Modify: `test/harness/platform.ts` (`EfbRouteSpec` grows; builder's choice of shape, e.g. `{pbd: {reference, bearing, distance, name}}`, `{fix, via}`, `{ppos: true}` entries)
- Test: `test/render/services/KlnEfbLoader.test.ts`; `test/unit/services/Flightplanloader.test.ts` stays green

**Interfaces:**
- Consumes: `fitEfbRoute`, `ResolvedEfbRoute`, `EfbSegment` (Task 1); `KLNFacilityLoader.getAirway` (Task 2).
- Produces:
  - `export class EfbRouteResolver { constructor(bus: EventBus, facilityLoader: FacilityClient, facilityRepository: KLNFacilityRepository); resolve(route: ReadonlyFlightPlanRoute): Promise<ResolvedEfbRoute> }` — Task 4 adds a `SidStar` constructor parameter and procedure segments.
  - `Flightplanloader`: `protected addDeletedMessages(messages: Message[]): void` (the 10-message cap, posts to `messageHandler`); `loadIcaos` uses it unchanged in behavior.

Resolver rules (§5): the departure airport is a one-leg `user` segment (a `missing` segment if not found); each enroute
leg in order becomes legs of one `user` segment, broken by a `missing` segment where a fix cannot be loaded. Lat/lon:
the existing `loadLeg`/`findHeldWaypoint` code moves here unchanged. PBD (`hasPointBearingDistance`): reference via
`getFacility`; position `new GeoPoint(ref.lat, ref.lon).offset(bearing, UnitType.NMILE.convertTo(distance, UnitType.GA_RADIAN))`
(distance 0 → the reference position); ident `getUniqueIdent(name || referenceIcao.ident || "CUST", facilityLoader)`;
created like a lat/lon temporary waypoint; reference not found → `missing` with `name`. Airway (`via !== ""`): entry =
the facility of the last leg resolved before it (null if none); `getAirway(via, 0, fixIcao)` in try/catch; entry and exit
indexes found by `ident` and `region`; when both are found and differ, the fixes strictly between them, in the direction
of travel, are inserted before the exit; a fix whose ICAO type is not `W` is loaded with `getFacility` (VOR, NDB);
otherwise the leg is only its exit fix. `isPpos` legs and legs with nothing to load are skipped as today.

Loader (§6): the hot-swap check (`hardware.isDisabled`, #188, #353) stays first and unchanged; then `loadRoute`
increments `private loadOpId`; it snapshots the UIDs of the repository's region-`XY` facilities,
resolves, returns without any effect if `opId !== this.loadOpId` (an overtaken import), runs `fitEfbRoute`, loads FPL 0
(`this.fpl0.load(new Flightplan(0, legs, this.bus))`), removes every region-`XY` facility not in the snapshot that FPL 0
does not use, posts `deleted` through `addDeletedMessages`, and switches to the FPL 0 page as today. `null` loads an
empty plan as today (and also bumps `loadOpId`).

- [ ] **Step 1: Failing render tests** in `KlnEfbLoader.test.ts` (`intersection`, `vor` builders; `fplIdents`, `messages`, `userWaypoints` readers):
  - Replace the characterization `keeps the first 30 waypoints of a route of 31…` with `keeps the destination of a route of 31 and reports the last en-route fix deleted (#195)` — `[KAAA, W01..W28, KBBB]`, messages contain `WAYPOINT W29 DELETED`, not `WAYPOINT KBBB DELETED`.
  - `loads a point-bearing-distance leg as a temporary waypoint at the bearing and distance (#195)` — VOR `DKB` at 49.0 N 10.0 E, leg 180°/15 NM named `DKB180`, then fix `WLD` → `[KAAA, DKB1, WLD, KBBB]`; `DKB1` region `XY`, lat `toBeCloseTo(48.75, 3)`, lon `toBeCloseTo(10.0, 3)`.
  - `names an unnamed point-bearing-distance waypoint after its reference (#195)` — empty name → `DKBA` (`DKB` is the VOR).
  - `drops a point-bearing-distance leg whose reference is not in the database (#195)` — messages contain `WAYPOINT DKB180 DELETED`, the other fixes load.
  - `expands an airway into its fixes (#195)` — airway `Q118` = `KPASA F1 F2 HEVAN F3`; route `KPASA`, `HEVAN via Q118`, `BONNT` → `[KMIA, KPASA, F1, F2, HEVAN, BONNT, KORD]`.
  - `expands an airway flown against its listed order (#195)` — airway listed `F3 HEVAN F2 F1 KPASA`, same route → same result.
  - `loads a VOR on an airway as the VOR (#195)` — `F2` replaced by VOR `VVV` → that leg's `icaoStruct.type` is `V`.
  - `flies direct to the exit fix when the airway has no entry (#195)` — first enroute leg `HEVAN via Q118` after the airport → `[KAAA, HEVAN, KBBB]`, no `DELETED` message.
  - `flies direct when the exit is the entry (Review Focus 2)` — `KPASA`, `KPASA via Q118` → `[KAAA, KPASA, KPASA, KBBB]`.
  - `cuts an expanded airway at the limit and keeps the destination (#195)` — airway of 40 fixes → 28 en-route fixes kept, `KBBB` last.
  - `removes the temporary waypoint of a cut lat/lon leg (#195)` — 28 fixes then a lat/lon leg → no `CUST` in `userWaypoints(unit)`, messages contain `WAYPOINT CUST DELETED`.
  - `keeps a temporary waypoint that existed before the import` — a saved `XY` waypoint in no plan survives the import.
  - `skips a PPOS leg (Review Focus 1)` — `[KAAA, A, KBBB]`, no message.
  - `loads only the newest of two routes synced at once` — route 1 with an unknown fix `ZZZ`, route 2 `KBBB→KAAA` synced without advancing timers in between → `[KBBB, KAAA]`, no `WAYPOINT ZZZ DELETED`.
  - `empties FPL 0 when null follows a route (Review Focus 3)` — `[]`, no messages from the route.
  - `shows 10 deleted waypoints and OTHER WAYPOINTS DELETED for a longer cut` — 45 enroute fixes → exactly 10 `WAYPOINT … DELETED` then `OTHER WAYPOINTS DELETED`.
- [ ] **Step 2:** `npx vitest run test/render/services/KlnEfbLoader.test.ts` — the new tests FAIL, the rest of the file still passes.
- [ ] **Step 3:** Implement `EfbRouteResolver`, rewrite `KlnEfbLoader` as above, extract `addDeletedMessages`.
- [ ] **Step 4:** The file PASSES; also `test/render/harness/efb.test.ts`, `test/render/services/KlnEfbSaver.test.ts`, `test/render/services/TemporaryWaypointDeleter.test.ts`, `test/unit/services/Flightplanloader.test.ts`; `npx tsc --noEmit` clean.
- [ ] **Step 5: Docs.** `docs/architecture.md`: where it describes the EFB sync, the resolve-then-fit structure in one or two sentences. `docs/test-coverage-record.md` or wherever the 30-waypoint characterization is recorded: note it is replaced (#195).
- [ ] **Step 6: Commit #195 as one commit.** `npm test` all green, then `git reset --soft <base>` where `<base>` is the commit that added this plan, `git add` the changes, `git commit -m "fixes #195 EFB route import: point-bearing-distance legs become temporary waypoints, airways are expanded, and a long route keeps its destination"` with the Co-Authored-By line. `git log --oneline -3` shows one #195 commit on top of the plan commit.

### Task 4: Procedures (#378)

**Files:**
- Modify: `kln90b/services/EfbRouteResolver.ts` (procedure segments), `kln90b/services/KlnEfbLoader.ts` (pass `SidStar`, load with procedures, drop the `//TODO … SID and STAR` line), `kln90b/KLN90BCore.ts:386-390` (pass `sidstar`)
- Modify: `kln90b/data/flightplan/Flightplan.ts` (new load)
- Modify: `test/harness/platform.ts` (`EfbRouteSpec`: `departure`/`arrival`/`approach` names, transitions, runways)
- Test: `test/render/services/KlnEfbLoader.test.ts`; `test/unit/data/flightplan/Flightplan.test.ts` (or the existing flight plan unit file)

**Interfaces:**
- Consumes: Task 1 and Task 3 interfaces.
- Produces: `Flightplan.loadLegs(legs: KLNFlightplanLeg[]): void` — replaces all legs, procedures included, publishes `flightplanChanged` once. `EfbRouteResolver` constructor `(bus, facilityLoader, facilityRepository, sidstar: SidStar)`.

Resolver rules (§4 "Invalid procedure", §5 "Procedures"): segments in order departure, SID, en-route, STAR, approach;
the destination stays `ResolvedEfbRoute.destination`. A procedure needs its airport (departure for the SID, destination
for STAR and approach); no airport, or a name the SDK does not find (`AirportUtils.findDepartureArrivalIndexesFromName`,
`AirportUtils.findApproachIndexesFromIdentifier`), gives no segment and no message. Choice of transitions, mirroring
`Apt7Page`/`Apt8Page`:
- runway transition: with ≤ 1, that one or null; otherwise the route's `runwayTransitionIndex`, and only if
  `SidStar.isProcedureRecognized(proc, rwy, type === SID ? null : trans)`.
- enroute transition: with ≤ 1, that one or null; otherwise the route's `enrouteTransitionIndex`, and only if
  `SidStar.isProcedureRecognized(proc, type === SID ? rwy : null, trans)`.
- approach IAF: with ≤ 1, that one or null; otherwise the route's `transitionIndex`.
- valid when the procedure is in the list (`isProcedureRecognized(proc)` / `isApproachRecognized(app)`) and every
  choice that needed the route's name got one. Legs from `getKLNProcedureLegList` / `getKLNApproachLegList` with the
  choices made (a missing choice is null); valid → `procedure` segment, invalid → `invalid` with the legs' idents.
The loader uses `this.fpl0.loadLegs(legs)`. The cleanup of Task 3 also removes the arc entries `SidStar` added for cut
or invalid procedures (they are new `XY` facilities FPL 0 does not use).

- [ ] **Step 1: Failing tests.** Unit: `loadLegs keeps procedure legs and publishes once`. Render, with a world built with `withProcedures`, `sid`, `star`, `approach`, `Leg` (`test/harness/navdata/procedures.ts`): `KAAA` SID `DEP1` (common `D1 D2`), `KBBB` STAR `ARR1` (transitions `T1`, `T2`, common `A1 A2`), RNAV 27 (transitions `IAF1`, `IAF2`, final `FAF MAP`, missed hold). The leg types are read as `getLegs().map(l => l.type)`.
  - `loads the SID, the STAR and the approach in route order (#378)` — idents `[KAAA, D1, D2, E1, T1, A1, A2, IAF1, FAF, MAP, …missed, KBBB]` and types `USER, SID, SID, USER, STAR…, APP…, USER`.
  - `keeps a fix the route repeats after the SID and shows no REDUNDANT message (#378)` — enroute starts with `D2` → `D2` twice; no message containing `REDUNDANT`.
  - `skips a STAR whose needed transition the route does not name, reports its waypoints and still loads the approach (#378)` — no STAR legs; messages `WAYPOINT A1 DELETED`, `WAYPOINT A2 DELETED`; approach legs present.
  - `takes the only transition of a procedure the route does not name (#378)` — STAR with one transition `T1` → loaded with `T1`.
  - `skips an ILS approach and reports its waypoints (#378)` — `ApproachType.APPROACH_TYPE_ILS` → no APP legs, each leg ident reported.
  - `skips an approach without the IAF it needs (#378)` — two transitions, none named → reported, not loaded.
  - `loads the SID of the named runway (#378)` — SID with runway transitions `09`, `27` and `departureRunway` 27 → that runway's legs; without the runway → invalid, reported.
  - `skips a procedure the airport does not have without a message (#378)` — `arrival: "NOPE"` → no STAR, no `DELETED`.
  - `skips a SID when the route has no departure airport (Review Focus 4)` — enroute and destination load, no message.
  - `drops a STAR that does not fit and the approach after it, keeping the destination (#378)` — 26 enroute fixes and a STAR of 18 legs (more than the 17 left before the destination) → no STAR or APP legs, their idents reported in order, `KBBB` last.
  - `removes the DME arc entry of a skipped approach` / `keeps the DME arc entry of a loaded approach (Review Focus 5)` — an approach with an `AF` leg (`Leg.AF`, see its doc comment), once invalid (ILS) and once valid → the `XY` entry absent / present in `userWaypoints(unit)`.
  - `loses the procedures at the first power-on of a fresh session (§2 ruling, 6-5)` — `bootUnit({engineRunning: false, efb: true, …})`, sync before power-on, `unit.panel.powerOn()` and settle → FPL 0 has the en-route legs only.
- [ ] **Step 2:** Run the two files — the new tests FAIL.
- [ ] **Step 3:** Implement as above.
- [ ] **Step 4:** Both files PASS, plus every file Task 3 Step 4 lists, `test/render/pages/right/Apt7Page*.test.ts` and `Apt8Page*.test.ts`; `npx tsc --noEmit` clean.
- [ ] **Step 5: Docs.** CLAUDE.md, public contract bullet "The EFB route sync": "the synced route is loaded into FPL 0 (`KlnEfbLoader`) with its SID, STAR and approach where the unit can take them". `docs/architecture.md` likewise if it describes the import.
- [ ] **Step 6: Commit.** `npm test` all green, then one commit `fixes #378 EFB route import: load the SID, STAR and approach that the unit can take, whole or not at all` with the Co-Authored-By line.

### Task 5: Final verification and the wiki text

**Files:**
- Create: `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\9f3e4365-f7ea-4a4d-a6c1-a8527efef639\scratchpad\efb-wiki-draft.md` (not in the repo)

- [ ] **Step 1:** `npx tsc --noEmit` clean; `npm test` all green; `npm run build` succeeds (the known circular-dependency and Sass warnings only).
- [ ] **Step 2:** `git status` clean; `git log --oneline master..` shows the design commit, the plan commit, `fixes #195 …`, `fixes #378 …`.
- [ ] **Step 3:** Draft the wiki text for the EFB FAQ: what the import loads (procedures the unit offers, airways expanded, point-bearing-distance fixes), how a long route is cut and reported, and the power-on note (a route sent while the unit is off in a fresh sim session loses its procedures at the first power-on, 6-5). The maintainer edits the wiki.
