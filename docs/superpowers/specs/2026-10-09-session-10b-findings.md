# Session 10b findings: the audit before Session 11

The research behind Session 10b of [docs/test-coverage.md](../../test-coverage.md), so that the session does not repeat
it. It is the input of the session's design (rule 19), not the design itself: the scope decisions are the maintainer's,
settled when the design is written. This is a dated record of 2026-10-09, taken on `master` at `873d8a8` plus the split
of `StartupPages.test.ts` (below). Line numbers are of that tree and drift as files change, so confirm each before use.

## How it was found

The audit answered five questions of the maintainer before the close-out of the baseline plan: which components have
no tests at all, what technical debt the tests carry, which older tests do not use a newer harness feature, which
repeated code deserves a harness feature, and whether the plan is ready for Session 11. Five read-only agents searched
the tree (one per question), the controlling session ran the suite and the coverage report and spot-checked the
findings marked *checked* below against the code and GitHub. Everything else is an agent's reading of the code: rule
19's "the implementer still confirms" applies to every item.

What the audit did not do: it re-broke no test, ran no mutation, and checked no page citation against the Pilot's Guide
index. A new spec test that Session 10b writes still needs its citation checked and its break proven (rules 10 and 19).

## The state at the start

- `npm test`: 311 files, 2732 passed, 365 expected failures. `npx tsc --noEmit` clean. Coverage of `kln90b/`:
  statements 92.82 %, branches 87.36 %, functions 91.94 %, lines 92.78 %, the same as at the end of Session 10.
- No `#NEW-` placeholder in `test/`, no session branch or worktree left from earlier sessions.
- No `.skip`, `.only`, `.todo` or commented-out test; no orphaned snapshot file (the four file snapshots are referenced
  and sit under characterization titles); no `@ts-ignore` or `@ts-expect-error` in `test/`.
- Triage table (section 5): every *testable* row is ticked and no *needs harness* row is left. Nine rows are *not
  testable* (CSS and Coherent rendering: #3, #11, the blink color, cut-off buttons; the build: #10, #16; sim-only
  effects: `d3c5230`, `0086363`; performance: #40), one is *not provable* (#20).
- GitHub (*checked*): every issue a pin cites exists. The only closed issue a pin cites is #56, in the three pins of
  `MainPage.test.ts:225`, `:235` and `:245`, each of which also cites the open #333. The one pin without an issue is
  `test/render/harness/rejections.test.ts:45`, a harness self-test of the strict rejection collector, not a bug pin.
- #110 is fixed on `master` (`1779f34`, "Fixes #110") and held by a plain `it` in `Set2Page.test.ts:10`; the issue is
  still open because `master` is not pushed. It closes when the maintainer pushes, so it needs no pin.

## The split of StartupPages.test.ts (done on the branch `tests-session-10b-prep`)

The maintainer asked for one test file per file under test, so that a test is found by the name of its subject. The
file's tests moved unchanged, with their titles; only the OBS warning test's `describe` is now `OBS warning (3-7)`:

| describe                           | subject             | new file                                   |
|------------------------------------|---------------------|--------------------------------------------|
| `Database page (3-7)`              | `AiracPage.tsx`     | `test/render/pages/AiracPage.test.ts`      |
| `VFR only page (3-7)`              | `VFROnlyPage.tsx`   | `test/render/pages/VFROnlyPage.test.ts`    |
| the OBS warning test of that block | `ObsWarningPage.tsx`| `test/render/pages/ObsWarningPage.test.ts` |
| `messages at power-on (B-3, B-4)`  | `Gps.gpsAcquired`   | `test/render/GpsAcquisition.test.ts`       |

The power-on messages joined the B-3 and B-4 describes of `GpsAcquisition.test.ts`, which already had the same
`messages(unit)` helper, so that copy is gone. The other helpers of the old file are now **local copies** for the
harness task of Session 10b to replace: `approveSelfTestPage` (in `AiracPage.test.ts` and `VFROnlyPage.test.ts`),
`pageRows` (all three page files), `inverseText` (`AiracPage.test.ts`, `VFROnlyPage.test.ts`), `expectVfrPage`
(`VFROnlyPage.test.ts`, `ObsWarningPage.test.ts`) and a `panelXml(...parts)` builder with `VFR_ONLY` and `OBS_SWITCH`
(`VFROnlyPage.test.ts`, `ObsWarningPage.test.ts`). They were copied rather than moved into the harness so that the
split stays a plain move; items H1 and H5 below absorb them.

## 1. Components without a test of their own

Of the source files, 24 have neither a test file named after them nor a direct import in a test. Almost all are
reached through the tests of their container and need nothing more. The candidates:

| file | coverage (statements / branches) | assessment |
|---|---|---|
| `kln90b/pages/FiveSegmentPage.tsx`, the `FiveSegmentPage` shell | 77.6 / 70.6 for the file | The two-half shell runs only for the self-test and take-home screens. Its SCAN fall-through to the inner knob while a cursor is on (lines 141 to 152, a KLN 89 trainer rule in its comment) and its ENT order are partly unrun. Worth a test. `SixLineHalfPage` in the same file is the base of the half pages and is held by them. |
| `getKLNSurfaceString`, `getKLNLightingString` in `kln90b/pages/right/Apt3ListPage.tsx` (lines 141 to 184) | the file 96.9 / 97.2 | Pure exported functions with many branches, reached only through APT 3. A unit table is cheap; the macadam surface is the open question #270, so it stays out of the table. |
| `kln90b/pages/right/Apt3ListPageContainer.tsx` | 81.6 / 68.8 | The switch between the database and the user-airport list (`changeFacility`, `getCurrentPage`) runs only through APT 3 scans. Optional. |
| `kln90b/pages/FourSegmentPage.tsx`, the `FourSegmentPage` shell (*checked*) | 46 / 20 | The full-page shell of the Database page and the OBS warning (`SelfTestRightPage.tsx:146`, `ObsWarningPage.tsx:32`). Those pages have no cursor fields, so most of its knob switch cannot be reached in a booted unit. Its ENT order (a field waiting for confirmation first, then left, right, the page; lines 158 to 179) could be held. Low value. |
| `kln90b/pages/TakehomePage.tsx` | 0 | Out of scope by the maintainer's decision (take-home mode). |
| `NullPage.tsx`, `OneSegmentPage.tsx`, `data/Constants.ts`, `data/Units.ts`, `global.d.ts` | | Trivial or abstract. |

Held through their containers at 92 % of branches or more: the six D/T sub-pages (`Dt1FplPage` to `Dt3OtherPage`),
`Apt3MapPage`, `EditorField`, `CoordOrNearestView`, and `AiracPage`, `VFROnlyPage` and `ObsWarningPage` (which have
their own test files since the split). `FlightplanListItem.tsx` (90.4 / 90.9) and `ListItem.tsx` (87.3 / 85.7) are held
by the FPL, OTH 4 and `List.test.ts` tests; a test of their own is optional.

## 2. Bugs without a pin

Open bugs filed from #89 on that no pin cites: #93, #95, #96, #110, #117, #128, #214, #325. The session logs record #117,
#128, #214 and #325 as filed without a pin, and #110 is fixed (above). The other three:

- **#93** (*checked*): with `Input.FuelComputer.Unit` IMP the fuel type is ignored, because `FuelComputer.tick` sets
  `targetUnit = UnitType.IMP_GALLON_FUEL` after the inner switch (`kln90b/Sensors.ts:91`; the JetB unit is selected
  at line 88 and then overwritten). Neither the docs nor a test mention it. Pinnable at the unit stage, or at the render
  stage on an OTH fuel page with a `FuelComputer` panel.xml and `NUMBER OF ENGINES` set (testing.md section 6). Filed
  from a code reading on 2026-10-03; the issue names the fix.
- **#95** (*checked*): `NearestList.tick` is async and `TickController.tickCalc` does not await it, so a rejected
  `searchNearest` or `getFacility` leaves `isCalculating` true (`kln90b/data/navdata/NearestList.ts:61`, `:81`, `:109`)
  and the nearest list frozen for good; the rejection is unhandled and never reaches the error page. Pinnable at the
  render stage with a `MemoryFacilityClient` whose search rejects once, the way `test/render/harness/bootFailure.test.ts`
  builds a failing client: after one rejection (taken with `unit.takeRejections()`) and a working search, the list must
  update again. Neither the docs nor a test mention it.
- **#96**: `Oth3Page` (and OTH 4) subscribe to the repository sync and never unsubscribe (`Oth3Page.tsx:36`).
  `testing.md` section 7 says a test that counts handlers would hold the fix; no log records it as filed without a pin.
  Either pin it with a handler count or record why not.

## 3. Technical debt in the tests

Ordered by weight.

- **D1. The #103 pin breaks three rules** (*checked*): `test/unit/settings/UserWaypointPersistor.test.ts:19`.
    - Its heavy setup (a save manager with load and autosave, the repository, the persistor) is inside the `it.fails`
      with no passing sibling, so a broken setup would keep the pin green (testing.md section 5).
    - It writes `wpt0` and `wpt1` into `FakeStorage` without clearing it first, and the later describes of the file share
      the storage (testing.md section 4, "A unit test resets the fakes it writes").
    - Its `vi.spyOn(globalThis as any, 'SetStoredData')` is never restored.
- **D2. A title that claims more than the test holds** (*checked*):
  `test/render/data/flightplan/ActiveWaypoint.test.ts:155` says "zero deviation" and asserts only
  `Number.isFinite(nav.xtkToActive)`. The deviation should be asserted as 0 within a tolerance, or the title changed.
- **D3. A pin's steps copied by hand:** the #111 pin `test/render/pages/left/Set2Page.test.ts:18` enters a date with
  eleven knob steps, and its passing sibling is a copy of those steps in another file
  (`outOfDateBySet2` in `test/render/data/PersistentMessages.test.ts:115` to `:129`, whose comment names the copy). A
  shared helper keeps them from drifting apart.
- **D4. Unexplained waits:** 66 `advanceTimersByTimeAsync` calls with a literal of five digits or more and no comment on
  the line or the one above. 40 are `12000` or `12_000`, the "the nearest list searches every 10 s" idiom, explained in
  some files (`NearestSelector.test.ts:18`) and bare in others: `NearestList.test.ts` (lines 27, 85, 176, 230, 233, 250,
  271, 303, 324, 348, 363), `AirspaceAlert.test.ts` (15 calls between lines 108 and 373), `Apt1Page.test.ts` (60, 70,
  239, 427, 435). A named constant in the harness would say it once. Other bare values: `Mod1Page.test.ts:136`
  (35_000) and `:188` (40_000), `Sta4Page.test.ts:41` (65_000), `GpsAcquisition.test.ts:248` (62_000) and `:374`
  (60_000), `NavCalculator.test.ts:476` (30_000) and `:529` (18_500), `SensorsOut.test.ts:28` (28_000) and `:241`
  (19_000), `WelcomePage.test.ts:94` and `:108`, `SelfTestRightPage.test.ts:161`, `SuperNav5Left.test.ts:42`,
  `StatusLine.test.ts:206`.
- **D5. Inconsistent per-test timeouts:** `NearestSelector.test.ts:9` gives 20 s to tests that advance 12 s, while about
  40 others with the same wait have none; `Mod2Page.test.ts:243` and `:249` carry 30 s without a reason;
  `Dt4Page.test.ts:57`, `:75` and `:194` carry 30 s for 5 to 10 simulated minutes (justified, testing.md section 6).
  The heaviest render files by boots: `GpsAcquisition.test.ts`, `MainPage.test.ts`, `Apt1Page.test.ts`,
  `HEvents.test.ts`.
- **D6. Tests coupled to private members** (an internal rename breaks them): `test/render/KLN90BCore.init.test.ts:63`
  (`(unit.core as any).tickManager`), `test/unit/services/Vnav.test.ts:268` (replaces
  `sensors.in.airdata.getIndicatedAlt` through the private field), `test/unit/settings/RemarksManager.test.ts:141`
  (writes the private `remarks`), `test/unit/data/navdata/Scanlist.test.ts:12` (the private `listManangerJob`,
  misspelled in the source, through a helper the file calls many times), `test/render/harness/bootFailure.test.ts:62`
  (`KLNFacilityRepository.INSTANCE`), `test/render/controls/displays/ActiveArrow.test.ts:85` (replaces a method on the
  state object). Each needs a public seam or a comment that names the coupling.
- **D7. Small ones:**
    - `test/unit/Hardware.test.ts:7` writes to `FakeSim` through `Hardware` without `sim.reset()` (its sibling at line
      22 resets) (*checked*).
    - `test/harness/sim/random.ts:9`: the seeded `Math.random` spy that `bootUnit` installs is never restored, so it
      stays for the non-boot tests that follow in the same file (*checked*). The boot teardown could restore it.
    - `test/unit/settings/UserWaypointV2.test.ts:100`, "restores a southern waypoint without throwing", asserts only
      `not.toThrow()` and `toBeDefined()`. It is the setup sibling of the #98 pin; its title should say so, or it should
      assert the restored ident (*checked*).
    - Weak checks with a reason worth stating: `SensorsOut.test.ts:363` (GPS COURSE TO STEER only defined and finite,
      deliberate per its comment) and the #260 pin `Mod1Page.test.ts:210` (`[0.3, 1].toContain(...)`).
    - `test/flight/flights/firstFlight.test.ts:85` prints the `[flight-speed]` line with `console.warn` on purpose
      (testing.md section 6); the only console call in a test.
    - Type escapes: 29 `as any` in 17 test files (most in `SidStar.test.ts`, for constructor fakes) and 98
      `as unknown as` in 38 files. Not a defect in itself; D6 lists the ones that reach private members.
- **Clean:** every test in `test/render/pages` and `test/render/controls` carries a citation, the word
  characterization, an issue, a commit, a trainer check or a contract note. Outside them the file-level contract comments
  cover the rest; `KLNNavmath.test.ts:16` and `:74` (the start point at f = 0, no bank at 0 kt) have no comment, which is
  harmless. No wall-clock read in an assertion (`performance.now` only for the speed line of `firstFlight.test.ts`).

## 4. Older tests that do not use a newer harness feature

Copies that `testing.md` does **not** name (the named ones are in its sections 4 and 7 and are left out here):

- `mount()`: `test/render/controls/displays/NullDashes.test.ts:17` (`rendered()`) and
  `test/render/controls/editors/LatLonEditor.test.ts:8` (`text()`) render with `FSComponent.render` by hand.
- `blinkCycle`: hand loops over four display ticks in `test/render/controls/editors/WaypointEditor.test.ts:23` (the
  same file uses `blinkCycle` elsewhere) and `test/render/pages/right/VorPage.test.ts:88` and `:222`.
- `recordMap`: `test/render/data/navdata/NearestList.test.ts:80` and `:319` spy on
  `CoordinateCanvasDrawContext.prototype.drawLabel` and mock it out to collect the Super NAV 5 labels.
- `selectPage`: `test/render/pages/left/SuperNav.test.ts:11` to `:30` reaches Super NAV 1 and 5 with raw knob events
  and fixed counts; the documented way is `selectPage` to the page before and the last click with `panel.inner`.
- `Screen.status()`: `test/render/HEvents.test.ts:427` and `test/render/services/ModeControllerApproach.test.ts:262`
  slice row 6. `status().mode` includes `msg`, so `toMatch(/^arm-leg/)` replaces the slice.
- Fixed knob counts to reach a page: `test/render/pages/MainPage.test.ts:49` (`outer('R', -5); inner('R', 3)` for NAV
  4) and `test/render/pages/CursorController.test.ts:14`. Both check the page name afterwards.
- `pointFrom`: `test/render/data/navdata/AirspaceAlert.test.ts:52` places the `moveAircraft` targets (`:168`, `:179`)
  with flat-earth offsets.
- `bootToSelfTest` and `approveSelfTest`: `test/render/pages/left/Sta1Page.test.ts:14` writes the cold boot, power-on
  and approval by hand, and so does the cold-and-dark messages test, now at the `messages at power-on` describe of
  `GpsAcquisition.test.ts` (it uses `approveSelfTest`, so only the boot is by hand).
- Raw power-on: `test/render/controls/editors/FreetextEditor.test.ts:27` sends `KLN90B_Power_On` instead of
  `panel.powerOn()` (`bootToSelfTest` does not fit: the test needs the Turn-On page).
- `cursorTo`: fixed cursor counts to a field with unique text and no reason given: `Oth3Page.test.ts:148`, `:168`,
  `:184`, `:198`; `Oth4Page.test.ts:97`, `:114`; `Set2Page.test.ts:240`; `Set1Page.test.ts:128`, `:338`;
  `FplPage.test.ts:516`, `:532`; `IntPage.test.ts:576`; `SupPage.test.ts:284`. Counts over digit cells, duplicate
  texts or blank entries are justified and not listed.
- `standardRoute()` in harness tests: `test/flight/harness/frontPanel.test.ts:9`, `:22`,
  `test/flight/harness/jump.test.ts:11` (and `GeoPoint.offset` at `:17` instead of `pointFrom`),
  `test/render/harness/power.test.ts:52`, `test/unit/harness/navdata.test.ts:10`.
- `savedUserWaypoints`: `test/render/harness/reboot.test.ts:22` writes `wpt0` by hand.
- World copies that `testing.md` section 7 does not list: the missed-approach world (IAFAA at 47.3/7.7 with a MAHAA
  hold) in `test/render/pages/left/FplPage.test.ts:162`, `test/render/pages/right/Apt7Page.test.ts:17` and
  `Apt8Page.test.ts:17`; the VOR 36 KDST world in `test/render/data/flightplan/ActiveWaypoint.test.ts:240` and
  `test/render/services/WTFlightplanSync.test.ts:189` (section 7 names those two files only for the planner read). A
  missed-approach option of `approachWorld()` would replace these and the copies section 7 lists.
- Justified and left: `GpsAcquisition.test.ts:42` (`secondsToFix` measures the time), `TempFieldset.test.ts:152` (a
  character `type()` refuses), `WelcomePage.test.ts` (the Turn-On timing is its subject), the arc worlds of
  `NavCalculator.test.ts:183`, `Nav5Page.test.ts:44` and `TemporaryWaypointDeleter.test.ts:151` (different geometry),
  `RefPage.test.ts:257` and `dmeArc.test.ts:163` (inline trigonometry no helper covers).

## 5. Repeated code that deserves a harness feature

Ranked by the number of files times the risk that the copies drift. H1 to H3 have already drifted in a way that can hide
a wrong test.

- **H1. A panel.xml builder with named presets** (new; about 45 files). Proposed
  `panelXml({input?, output?, extra?})` beside `MINIMAL_PANEL_XML` in `test/harness/boot.ts`, with presets for the
  values tests repeat: `<ObsSource>0` (about 10 files), the heading input (6: Cal3, Nav5, SelfTestLeft, SuperNav5Page,
  SensorsOut, RollSteeringController), `WriteGPSSimVars` false (5), `LegObsSwitchInstalled` (4: Mod1, Mod2,
  ModeControllerObs, SensorsOutSimVars; now also ObsWarningPage), `AltimeterInterfaced` false (5), the fuel computer
  (7), the VFR only flag (VFROnlyPage, ObsWarningPage). **Drift:** there are local builders with different signatures
  (input only in Messages, PersistentMessages and Mod2; input and output in DirectToObs; `...parts` in VFROnlyPage and
  ObsWarningPage, formerly StartupPages; `xml(inner)` in SimVarSync; `{airdata, fuel}` in PageTreeController; a boolean
  in Set9; three `fuelXml` in Oth5, Oth7 and Oth8 with three meanings of their parameter), and one value under two names
  (`OBS_SOURCE_OFF`, `OBS_SOURCE_0`). A misspelled tag falls back to the parser's default, so such a test passes while
  testing the default. The builder should be typed on the keys of `KLN90BPlaneSettings`, or its harness test should
  parse each preset and assert the setting it changes.
- **H2. `unit.panel.readMessages(max)`**, reading every message off the MSG page (new; 6 files): `readAll` in
  `Messages.test.ts` and `MessagePage.test.ts`, `readBootMessages` and two inline loops (`:66`, `:206`) in
  `StatusLine.test.ts`, a loop in `test/render/harness/screen.test.ts`, `closeMsgPage` in `MainPage.test.ts`.
  **Drift:** only some copies check that the page closed, so a loop that presses MSG ten times without closing the page
  passes silently in `MessagePage.test.ts` and in `readBootMessages`; the end check differs (`getMessages()` empty,
  `hasMessages()` false, `messages(unit)` empty); `StatusLine.test.ts:66` presses `KLN90B_MSG_Push` raw. The helper
  presses until the page closes, throws if it does not, and waits a second.
- **H3. `userWaypoints(unit, type?)`** (listed in section 7; 14 files). **Drift in meaning:**
  `TemporaryWaypointDeleter`, `Ctr1Page`, `RefNaming` and `KlnEfbLoader` filter on `FacilityType.USR`, while `IntPage`,
  `NdbPage`, `VorUserWaypoint`, `WaypointDeleteListItem`, `reboot`, the Distance, NdbFreq, Radial and VorFreq editor
  tests and `KeyboardService` do not, so user VORs, NDBs and intersections count in some and not in others. Two access
  paths are mixed (`unit.props.facilityRepository`, `KLNFacilityRepository.getRepository(bus)`). The helper returns the
  facilities and takes an optional type filter.
- **H4. `messages(unit)`** (listed in section 7): identical copies in about 9 files (one fewer since the split) plus
  `messageTexts` in `KlnEfbLoader.test.ts`, and inline forms in `UserFlightplanLoaderV2`, `FlightplanEdit`,
  `NavCalculator`, `Apt8`, `StatusLine`, `ModeControllerObs` and `Set2`. No drift; cheap with H2.
- **H5. A full-page reader:** `inverseText(row)` (listed in section 7; now in `AiracPage.test.ts` and
  `VFROnlyPage.test.ts`) and `pageRows()` (the trimmed six rows of a full page; the three start-up page files). A
  `Screen` method for each, with a harness test, replaces the copies the split left; the helpers `approveSelfTestPage`
  and `expectVfrPage` of those files can then go into the harness or stay as two-line locals.
- **H6. `fplIdents(unit, idx = 0)`** (new; about 26 files): the idents of a flight plan, inline in 20 files and named
  `fpl0Idents`, `legIdents`, `klnIdents`, `idents(unit, fpl)` or `fpl0()` elsewhere; `fpl0Legs` (ident and type) in
  Apt7, Apt8 and ActPage; a pure `identsOf(legs)` would serve 9 unit files. No drift.
- **H7. `unit.panel.directTo(ident, {waitMs})`** (new; 17 files): `dct`, `enterIdent('L', x)`, `ent`, `ent`. **Drift:**
  the wait after it is 0, 1000 or 2000 ms.
- **H8. Super NAV 5:** the sequence `selectPage('R', 'NAV 4')`, `selectPage('L', 'NAV 5')`, `inner('R', 1)` is in 12
  files and only 3 assert that the overlay is the Super NAV 5 page; `showSuperNav5` is listed in section 7 for 3 of
  them. New: `superNav5OnLeg(o)` is byte-identical in the Field1, Field2 and Field3 selector tests, and
  `superNav5OnArc(o)` in Field2 and Field3; both belong in `test/harness/render/superNav5.ts`.
- **H9. `bootOnStandardRoute(o?)`** (new; about 32 files store `[kaaa, abc, kbbb]` and settle, 8 behind a local
  `onRoute`, `onStandardRoute` or `bootOnRoute`). **Drift:** `NavCalculator` and `RollSteeringController` assert that ABC
  is active, the others do not; `SensorsOutSimVars`' `bootOnRoute` does not settle; `WTFlightplanSync` uses a magvar of 4
  and an extra facility. `FplPage`, `SensorsOutSimVars` and `HEvents` type the standard coordinates instead of calling
  `standardRoute()`.
- **H10. `activeIdent(unit)`** (new; 15 files): local in `NavCalculator`, `ModeControllerApproach`, `SimVarSync`, as
  `active` in `SensorsOut`; flights have `flight.nav.activeIdent` already. `turnStackLength` is in `NavCalculator` and
  two flights.
- **H11. A D/T world boot** (new): the D/T 1 and D/T 2 `bootOnWorld` store FPL 0 and FPL 3, while D/T 3's
  `directToOutsidePlan` and D/T 4's `bootMoving` store FPL 0 only (**drift**); a `show(side, page)` (select, wait, read
  rows) is in the four D/T files and six others. A `dtWorld()` boot option would hold both.
- **H12. `mountedText(el)`** (new; the display tests: Altitude, Bearing, Distance, Duration, Fuel, Latitude, Longitude,
  RoundedDistance, Speed, Temperature, Time): `mount(el)`, `tick()`, `text()`. No drift.
- **H13. Small ones:** a named constant for the nearest search wait (D4); `muteConsoleError()` identical in
  `bootFailure`, `KLN90BCore.startup` and `KlnEfbSaver`; `confirmAndReselect(unit)` (SET 1 CONFIRM?, then reselect) in
  `BearingEditor`, `SpeedEditor` and `Set1Page`, with five more inline CONFIRM? presses in `LatLonEditor`; `writeCount`
  identical in `KlnEfbLoader` and `SimVarSync` (listed as `sim.writeCount`; `SensorsOutSimVars` filters `sim.writes`
  without upper-casing the name, the pitfall testing.md describes); `overlay()` (listed; `getOverlayPage()` in 10
  files); the date entry of D3.
- Lower value: `sim.set('Nav OBS:1', …)` in 14 files and `GPS OBS ACTIVE` in 5 (a helper would only name the intent);
  the `{lastLatitude, lastLongitude}` storage seed in 7 files.

## 6. What Session 11 needs that its plan does not say

The current text of Session 11 (section 3) would leave references dangling once `test-coverage.md` is deleted:

- **The trainer notes.** 89 references of the form `T<n>` in 26 test files point at the trainer lists in the session
  logs of Session 9b and Session 10 (section 4), the only place they are defined. The two series overlap (both have T1
  to T12), and 21 of the references carry no date on their line (for example `FlightplanList.test.ts:222`,
  `WaypointEditor.test.ts:376`, `BearingFieldset.test.ts:60`); some are in pin titles (`Set0Page.test.ts:100`,
  `MainPage.test.ts:356`, `SelfTestLeftPage.test.ts:263`). The KLN 89 trainer observations must outlive the plan: a
  dated trainer record in `testing.md` that keeps the ids with their session, or comments rewritten to say what was
  observed and when.
- **Session references in tests:** `SidStar.test.ts:494` ("Session 7 task 6"), `IntPage.test.ts:588` ("the Session 8
  ruling on #243"), `LatLonEditor.test.ts:351` ("The lead of Session 9a"), `test/harness/flight/FrontPanel.ts:456`
  ("open (Session 9b)"), `Apt7Page.test.ts:275` and `SupPage.test.ts:16`, `:204` ("research items"). Harmless once the
  record names the sessions, confusing otherwise.
- **References to the plan in `testing.md`:** "rule 8 of test-coverage.md" (section 6, the #302 item) and "per rule 13
  of test-coverage.md" in seven items of section 7; the maintainer's evidence rule "in the designs of Sessions 9a and
  9b" (section 6, the KLN 89 layout item); "Session 10 trainer note T1" and "the startup research" (section 7). The
  rules that must outlive the plan (rule 8: a snapshot never holds a visible bug; rule 13: a harness extension needs
  several users; the evidence rule) need their own wording in `testing.md`.
- **The designs and plans:** rule 19 deletes `docs/superpowers/specs/` and `docs/superpowers/plans/` with the plan, but
  Session 11's step 5 names only `test-coverage.md`. They are the session designs, the plans and their `.tasks.json`
  files, and this findings file.
- **Section 7 of `testing.md`** is organized by session ("Harness gaps and leads from Session 7", and so on), which reads
  oddly once the logs are gone; step 3 is the place to regroup it by area. The "SimVars before `init`" item (Session 4)
  and the "boot that leaves an `ElectricitySimVar` unit dark" item (Session 10) are the same gap. The `Version` mock item
  names `selectPage.test.ts` only, while `Sta3Page.test.ts` and `Sta4Page.test.ts` mock it too.
- **Step 4** ("every `it.fails` pin references an open GitHub issue") should exempt the harness self-test of
  `rejections.test.ts:45`, or that pin should be reworded so that it does not read as a bug pin.
- **Two superseded triage rows hand work to Session 7:** the AIRAC last-day boundary and the #40 cache window of the
  `Scanlist` tests. Confirm both were done before the table goes.
- **Stale text:** Session 7's result in section 3 and its log say #213 was filed without a pin, but it has one now. The
  log is a dated record and stays as it is; the coverage record should not repeat the claim.
- **Outside the repository:** four notes of the controlling session's local memory point at `test-coverage.md` or the
  designs (`kln89-trainer-observations.md`, `session-workflow-lessons.md`, `subagent-report-files.md`,
  `worktree-junction-removal.md`). The controlling session updates them in Session 11.
