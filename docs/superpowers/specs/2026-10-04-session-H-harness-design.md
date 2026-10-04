# Session H design: harness extensions

Session H of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2), the candidate list of Session H (section 3) and the triage table (section 5). This design adds what the
tasks need beyond those rules. Branch: `tests-session-H-harness`.

## Scope (maintainer's decisions)

- **In:** candidates 1 to 8, 12 and 13 of the Session H list, the page-tree leak found by the research, and the small
  helpers that several test files duplicate today. Then a refactor of the existing tests onto everything the session
  adds.
- **Out:**
    - Candidates 9 (paused aircraft), 10 (`GPS DRIVES NAV1` option) and 11 (cold start in `Flight.start`). Each would
      only serve a flight copy of something a render test already proves (rule 9, cheapest stage). The pause half of
      `43d472b` needs no harness: a render test can settle, set `GROUND VELOCITY` above 2 kt, teleport once and hold.
    - The regression tests for the rows this session unblocks. They go to a **new session, Session 3b**, which the
      close-out inserts between Session H and Session 4 (below). There is no rerun of sessions 2 or 3.
- **Start state** on 2026-10-04: `npm test` 265 passed and 24 expected failures in 87 files, `npx tsc --noEmit` clean.

The research pass (three read-only agents) looked at every candidate against the code and the SDK 2.3.3 typings. Its
facts are summarized under each item; the plan carries the file and line references.

## Navdata world

### 1. Procedures (`test/harness/navdata/procedures.ts`, new)

What the instrument reads (so the builders fill exactly that):
- `SidStar.ts` filters and converts; APT 7 loads SIDs and STARs, APT 8 approaches, APT 2 reads only `approachType`.
  `ModeController` and the other `fixType` consumers see the converted KLN legs, not the SDK data.
- Leg fields read: `type`, `fixIcaoStruct`, `fixTypeFlags`, `flyOver`, `originIcaoStruct`, `rho` (meters), `course`,
  `theta`, `turnDirection`. A leg is kept when it has a fix and is not RF; every kept leg becomes a plain waypoint. Legs
  without a fix (CA, VM and the like) are dropped.
- `ApproachProcedure`: `name`, `runway`, `runwayNumber`, `runwayDesignator`, `approachType`, `approachSuffix`,
  `rnavTypeFlags` (an RNAV approach needs LNAV), `rnpAr`, `missedApproachRnpAr`, `transitions`, `finalLegs`,
  `missedLegs`. `Procedure`: `name`, `rnpAr`, `commonLegs`, `enRouteTransitions`, `runwayTransitions`
  (`runwayNumber`, `runwayDesignation`, `legs`).
- `ApproachType` and `RunwayDesignator` are MSFS globals from `staticGlobals.ts`, not SDK exports.
- `SidStar` **writes into the SDK legs** (`fixTypeFlags`, `course`), so the builders return new, unfrozen objects on
  every call.
- The conversion loads every fix with `getFacility`, and an AF leg also its navaid (`originIcaoStruct`). A missing
  facility rejects the whole conversion inside an ENT handler nobody awaits.
- An AF leg must not be the first leg after filtering (the conversion pops the leg before it). The arc entry depends on
  the GPS position when the conversion runs; `course` and `theta` are used as true bearings.

API:
- Leg builders on `FlightPlan.createLeg`: `IF`, `TF`, `CF`, `DF`, `CA`, `VM`, `HM`, `AF` and `RF`, each with the fix
  flags (IAF, IF, FAF, MAP, MAHP). `AF` takes the end fix, the navaid, the radius in NM, the from and to radials and
  the turn direction. `RF` exists only to test rejection.
- `sid(name, {runways, common, transitions, rnpAr})`, `star(...)` with the same shape, and
  `approach({type, runway, suffix, rnav, transitions, final, missed, rnpAr, missedRnpAr})`, which fills the name and
  parses the runway number and designator.
- `withProcedures(apt, {departures, arrivals, approaches})` returns a copy of the airport; `builders.ts` is not
  touched for procedures.
- `runwayFix(apt, '27')` builds the `RunwayFacility` (type `R`) that a realistic MAP needs.
- **A missing fix fails early:** `bootUnit` and `Flight.start` check every procedure fix and arc navaid against the
  navdata and throw with the missing idents.
- **Loading into FPL 0 goes through the real path,** APT 7 or APT 8 with the panel. No harness shortcut reproduces
  the private `load()` of those pages.

Harness tests: an RNAV approach loaded through APT 8 shows the IAF, FAF, MAP and MAHP suffixes on FPL 0; a SID
loaded through APT 7 drops its CA leg; a DME arc converts to a `D…` entry waypoint; an approach with an RF leg is not
listed. `test/unit/data/navdata/SidStar.test.ts` moves its hand-built literals onto the builders in the same task,
assertions unchanged.

### 2. Nearest filters (`MemoryFacilityClient.ts`, `builders.ts`)

What the instrument calls: `NearestList` sets `setAirportFilter(false, classMask)` and
`setExtendedAirportFilters(surfaceMask, approachMask, toweredMask, minRunwayLengthMeters)` at init and again when
SET 3 changes; two VOR sessions call `setVorFilter(classMask, typeMask)` with different masks; NDBs have no filter.
The instrument does not filter airports or NDBs again after the search, so the fake decides those lists. Masks are
`1 << enum value` (`AirportClass`, `RunwaySurfaceType`, `VorClass`, `VorType`; towered 1 = untowered, 2 = towered).

The fake:
- stores the filter state **per session**;
- filters inside the k-d tree search, **before `maxItems`**, so a hidden facility takes no slot and a facility that a
  settings change hides is reported as `removed`;
- airports: the class mask against `airportClass`; the extended filter requires a runway that matches the surface
  mask and the minimum length, **except for an airport with no runways, which passes**. Source: the sim developers'
  code, quoted to the maintainer ("If there are no runways, the minimum runway size and surface types filters should
  not apply"). Then the towered mask. The approach mask is ignored (the instrument passes all bits);
- VORs: class mask and type mask.

Builders: `airport()` gains `runways: [{heading, lengthFt, surface}]` (zero or more), `towered` and `airportClass`. The
class is derived when not given: no runways gives `HeliportOnly`, a hard-surface runway `HardSurface`, otherwise
`SoftSurface`. `vor()` gains `vorClass`. The defaults keep every existing test's world unchanged.

Harness tests: a heliport is dropped by the class filter only; a short or grass runway is dropped per SET 3; a
terminal VOR is missing from the nearest VOR list but found by the reference-VOR search.

### 3. Airspaces (`test/harness/navdata/airspaces.ts`, new; `MemoryFacilityClient.ts`)

What the instrument does: `NearestUtils` and `AirspaceAlert` open boundary sessions and wrap them in the SDK's
`NearestLodBoundarySearchSession` with the shared `DefaultLodBoundaryCache`. The raw session returns
`{added: BoundaryFacility[], removed: number[]}` by `id`. Fields read: `id`, `name`, `type`, `minAlt`/`maxAlt`
(meters) with their altitude types (only MSL counts), `topLeft`/`bottomRight` (date-line test), `vectors`, `lods`,
and an untyped `frequency` for center boundaries (OTH 2). `BoundaryUtils` uses LOD 0 as a closed ring and ignores arcs
and circles. The SDK builds `LodBoundary` objects in a throttled queue measured with the real `performance.now()`
that continues on the faked `requestAnimationFrame`, so tests advance timers.

API:
- `airspace(name, type, polygon, {minFt, maxFt, minType, maxType, frequencyMHz})` returns a `BoundaryFacility` with a
  unique id, a closed ring of `Start` and `Line` vectors, the bounding box and `lods: []` (so LOD 0 is the exact
  polygon). `circularAirspace(...)` builds the `Origin` plus `Circle` form, for the known gap that circles are ignored.
- The fake boundary session replaces `EmptyBoundarySession`: `setBoundaryFilter(mask)` filters by type; a candidate is
  an airspace whose **bounding box** intersects the search circle (inferred from the comment in `NearestUtils.ts`, not
  observed in the sim; `testing.md` says so); results sorted by distance and cut at `maxItems`; added and removed kept
  per session by id.
- `BootOptions.airspaces`, `World.addAirspace`, and `DefaultLodBoundaryCache` reset in `singletons.ts`.

Harness tests: an aircraft inside a restricted area gets `INSIDE SPC USE AIRSPACE`; TRI 2 lists an airspace on the
route; a type outside the mask is not returned. `BoundaryUtils.test.ts` moves onto `airspace()` where the SDK
`LodBoundary` fits the test.

To check, and pin and file if real: `AirspaceAlert.ts:155` appears to compare the upper limit with `minAlt`.

## Boot, platform and error paths

### 5. Power cycle (`FrontPanel.ts`)

- `powerOff()` and `powerOn()` send `KLN90B_Power_Off`/`_On` (not the toggle). `powerCycle({offSeconds})` is off, a
  wait, then on; the off time matters to the GPS clock and the brightness warm-up.
- `approveSelfTest()` waits for the self-test page (the welcome page lasts 17 s), presses ENT on `APPROVE?`, then ENT
  on `ACKNOWLEDGE?`, and returns once a new `MainPage` is current. The VFR-only and OBS-warning variants throw with
  the screen dump unless the test asks for them.
- After boot, every power-on runs the full welcome and self-test, also on an engine-running boot; the doc comment says
  so.
- Harness test: a power cycle with `approveSelfTest()` completes on an engine-running and on a cold-and-dark boot, and
  the main page afterwards is a new instance. #90 itself is a Session 3b row.

### Page-tree leak (`singletons.ts`)

`PageTreeController` prunes the module-level `LEFT_PAGE_TREE` on every `MainPage` construction (#90), and the teardown
does not restore it, so a later boot in the same file sees the pages an earlier one pruned. `singletons.ts` snapshots
the tree at load and restores it in the teardown. Harness test: a default boot, then a fuel-computer boot in the same
file, still has OTH 5 to 8.

### 6. EFB route manager (`platform.ts`)

The instrument subscribes to `syncedAvionicsRoute` (later sets only), listens to `avionicsRouteRequested`, and calls
`replyToAvionicsRouteRequest`. `FakeRouteManager`: `sync(route)` sets a new route object, `request()` fires the event
and returns the id, `replies` records the answers. `efbRoute({departure, destination, enroute})` builds the route on
the SDK's `FlightPlanRouteUtils` (no Coherent calls); an enroute entry is a facility or `{lat, lon, name?}`.
`bootUnit({efb: true})` exposes it as `unit.efb`; the default remains a manager that never resolves. Harness test: a
synced route lands in FPL 0.

To check, and pin and file if real: `KlnEfbSaver` shifts and pops the internal leg array of FPL 0 on a request
(stripping its airports), and throws on an empty FPL 0.

### 7. Boot failure (`boot.ts`)

`bootUnitExpectingError({...bootOptions, platform: {createFacilityClient?, getFacilityRepository?, ...}})` shares the
live-unit guard and the teardown with `bootUnit`, waits for the first `error` event instead of `propsReady` (with a
cap), throws if `propsReady` fires, and returns `{core, env, errors, errorPage()}`; `errorPage()` reads the visible
`.errorpage` message. It leaves the boot marked incomplete, so the teardown tolerates singletons that were never
created. Harness test: a facility client whose nearest session rejects shows the error page.

### 12. Unhandled rejections (`boot.ts`)

- `bootUnit` installs a `process` `unhandledRejection` listener for the life of the unit. Each rejection goes into
  `unit.errors` and `unit.rejections`.
- **Strict:** when the test ends, after one real `setImmediate` so late rejections land, a rejection not taken with
  `unit.takeRejections()` fails the test. The suite is green today, so no existing test leaves one.
- The listener is removed in the teardown. Once a listener exists, Vitest no longer reports these rejections itself,
  which is why the harness must fail the test.
- Harness test: an injected throw on the ENT path fails the test that pressed ENT, and `takeRejections()` hands it
  over.

### `console.error` collector (`boot.ts`, `Flight.ts`)

`bootUnit` records every `console.error` in `unit.consoleErrors` and still passes it on. It does not fail the test.
`Flight`'s `no console.error` monitor reads the collector instead of its own wrapper. `unit.display` offers
`opacity()` and `powerWrites()`, the probes `PowerButton.test.ts` and `BrightnessManager.test.ts` duplicate.

## Reading and driving the screen

### 13. `Screen` (`screen.ts`)

- Trailing blank cells beyond the width are dropped; a non-blank cell beyond it still throws (#115 stays visible).
- `readRows` inserts the blank cell the CSS margin of `offset-left-cursor` draws, so the status line reads as shown.
- `screen.status()` returns `{left, mode, right}`, the trimmed fields of the status line.
- A full page with no visible status line (the welcome page) reads as 7 rows, row 6 being its seventh line. Super
  NAV 5 still throws, naming its reader.
- The text CSS positions over the NAV 5 map (orientation and range) reads at row 5.
- `rows(side)` and `maskRows(side)` return the six rows of a half page.

### 8. Super NAV 5 reader (`test/harness/render/superNav5.ts`, new)

`SuperNav5.read()` returns the seven left rows, the message and range fields, the right rows (or `null` while hidden)
and the direct-to window (or `null`). Harness test: field 1 shows `-.-NM-` with no active waypoint and the XTK setting.

### 13. `selectPage` both ways (`FrontPanel.ts`)

The outer knob turns the shorter way round, using the group order of each side kept in the harness; a harness test
walks the real trees and fails when that order drifts from `PageTreeController`. The inner knob turns toward the
target number the shorter way; SET 0 counts as the last SET page.

### 4. `enterIdent` (`FrontPanel.ts`)

- Editors (FPL, DIR, REF): after the last character, blank the next position (outer knob, then inner knob to blank),
  which removes the autocomplete tail. This is the knob path of the real unit.
- Waypoint selectors (APT, VOR, NDB, INT, SUP), detected by a single-cell focus: per character, turn the selector
  charset (`0-9`, blank, `A-Z`), advance with the outer knob, wait one display tick for the async search, then blank
  the tail the same way.
- `panel.focused(side)` exposes the focused field. `panel.cursorTo(side, text)` moves the cursor with the outer knob
  until the focused field reads `text`.
- `FrontPanel.obsMode()` selects MOD 2 and presses ENT.

### Small helpers

- `geo.ts`: `angleDiff(a, b)` (signed), `pointFrom(p, bearingTrue, nm)` and `pointBefore(from, to, nm)`, written from
  the textbook destination formula so the module stays independent of the SDK.
- `test/harness/fixtures.ts`: `standardRoute()` returns a fresh KAAA (47.0, 8.0), ABC (47.5, 8.9) and KBBB (48.2, 9.2).
- `Flight.syncDisplay()` flies display ticks until one runs without a calculation tick; `flight.flyUntilActive(ident,
  {timeout})`.
- `storage.ts`: `savedUserWaypoints(...)` writes V2 user-waypoint strings laid out by hand from the format. It is
  setup input; the format tests keep their literals.
- `test/harness/flightplan.ts`: `insertLeg(unit, idx, fac)`.

Every helper and extension comes with a harness test in a `harness/` folder of the cheapest stage, proven by disabling
it, and a paragraph in `testing.md` section 3 or 4.

## Tasks

### Phase 1: extensions (parallel worktrees, rule 21)

| task | content | main files | implementer / reviewer |
|------|---------|------------|------------------------|
| 1 | procedures; `SidStar.test.ts` onto the builders | `navdata/procedures.ts` | Sonnet / Opus |
| 2 | nearest filters, airspaces; `BoundaryUtils.test.ts` where it fits; the `AirspaceAlert.ts:155` check | `MemoryFacilityClient.ts`, `builders.ts`, `navdata/airspaces.ts` | Sonnet / Opus |
| 3 | boot failure, rejections, `console.error` collector, `unit.display`, EFB fake and the saver checks, page-tree reset | `boot.ts`, `platform.ts`, `singletons.ts`, `Flight.ts` (monitor) | Sonnet / Opus |
| 4 | `Screen`, Super NAV 5 reader, `selectPage`, `enterIdent`, `focused`, `cursorTo`, power helpers, `obsMode` | `screen.ts`, `FrontPanel.ts`, `render/superNav5.ts` | Sonnet / Sonnet |
| 5 | `geo.ts` helpers, `fixtures.ts`, `syncDisplay`, `flyUntilActive`, `savedUserWaypoints`, `insertLeg` | `geo.ts`, `Flight.ts`, `storage.ts`, `flightplan.ts` | Sonnet / Sonnet |

Tasks 2 and 3 both touch `BootOptions` and `singletons.ts`, tasks 3 and 5 both touch `Flight.ts`, and every task adds
to `testing.md`. The controlling session resolves these overlaps at merge. The procedure check at boot (task 1) is a
call into `boot.ts` that task 1 adds alone. An implementer that stalls is re-dispatched on Opus (rule 26).

Each phase 1 implementer does not refactor other tests beyond the ones named in its row; that is phase 2.

### Phase 2: refactor of the existing tests (parallel worktrees, after all of phase 1 is merged)

| task | folders |
|------|---------|
| R1 | `test/render/pages/left`, `test/render/controls`, the files directly in `test/render` |
| R2 | `test/render/pages/right`, `test/render/data`, `test/render/services` |
| R3 | `test/flight`, `test/unit` |

Rules, as in session 3 task 7:
- A test keeps the meaning of its assertions; only setup, navigation and reading change. Local helpers that a harness
  helper replaces are deleted.
- Raw events stay where the raw event is the subject: `PowerButton.test.ts`, `KeyboardService.test.ts`,
  `pageNames.test.ts`, the #56 and #81 knob tests, and the CAL subpage changes. A harness test stays hand-rolled.
- A test whose navigation, waits or ident entry changed is proven again against its original bug, and the commit
  message carries the proof line.
- The "ENT errors never reach `unit.errors`" comments and the fixed-count navigation comments go with their workarounds.

Implementers Sonnet, reviewers Sonnet, each with a mutation pass on the changed tests.

### Phase 3: issues and close-out (one task)

1. File the confirmed bugs per `CLAUDE.md` after searching open and closed issues, and replace the `#NEW-`
   placeholders.
2. Triage table: the *needs harness* rows become *testable*, each naming its extension; the pause half of `43d472b`
   becomes *testable* at render stage with the reason above. The flight-only versions of `92fbba1` and #61 stay
   uncovered by the maintainer's ruling.
3. **Insert Session 3b** into `test-coverage.md` section 3, between Session H and Session 4: regression tests for the
   rows Session H unblocked, run like sessions 2 and 3 (rules 19 to 27). Change the Session H text that names a rerun
   of session 2 or 3 to name Session 3b.
4. `testing.md`: section 3 and 4 paragraphs reconciled; section 6 loses the traps this session removes (ENT
   rejections, the selector `enterIdent`, the width and CRSR limits, Super NAV 5, the navdata without filters,
   airspaces and procedures) and gains the inferences (bounding-box airspace search); section 7 drops what was built.
5. Tick Session H, write its session log (rule 18), run `npm test`, `npx tsc --noEmit`, `npm run coverage` and
   `grep -r "#NEW-" test/`.

Then the final review of the whole session runs on Opus, and the maintainer is asked to approve the merge into
`master` and the deletion of the task branches and worktrees.

## Risks

- **The strict rejection check may surface rejections nobody saw,** such as the scan-list background job or a stray
  `.then` without a catch. Each one is either a real bug (filed and pinned) or taken explicitly by the test with a
  comment. It never gets a blanket ignore.
- **Faithfulness of the fakes.** The nearest filters follow the sim developers' rule; the airspace bounding-box search
  is inferred. Both are written into `testing.md` section 6 as such.
- **Refactor drift.** A refactored test that keeps passing may have lost its bite; that is why changed navigation or
  waits are re-proven and the reviewers run mutations.
- **SDK internals.** The boundary session and `LodBoundary` path depend on SDK 2.3.3 behavior (the throttled queue,
  the cache keyed by id). `testing.md`'s SDK-upgrade note names them.
