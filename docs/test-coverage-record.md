# Test coverage record

A dated record of 2026-10-10, written when the test baseline was complete. It is true on that date and is not updated;
a later record is added beside it, and new gaps go to [the test next steps](test-next-steps.md). Section numbers refer
to the [testing guide](../test/README.md).

The baseline was built between 2026-10-03 and 2026-10-10 in sessions that each took one area, in the order of the
protection they bought: first the regression tests for past fixes, then the public contract, the navigation core, data
and services, navdata, the left pages, the right pages, the controls, and boot and power, then an audit of the whole
suite.

What it means here: a **spec test** cites the Pilot's Guide (or the contract, or an independent source) and derives its
expectation independently; a **characterization** carries the word in its title and claims nothing about the real unit;
a **pin** is an `it.fails` that states the correct behavior of an open bug (section 5). Every test was verified by
breaking its subject; a mutation that survived is listed below or in the next steps. Coverage is what ran, not what is
held.

**The suite on 2026-10-10:** 2858 tests passed and 372 expected failures in 324 files (62 unit, 242 render, 20
flight); `npx tsc --noEmit` clean. 534 lines carry the word `characterization` in a test title. The 361 `it.fails`
pins name 216 distinct open issues between them; the one pin without an issue is the harness self-test of the strict
rejection collector (`rejections.test.ts`), whose failure is the behavior under test.

**Coverage** (`npm run coverage`, V8, `kln90b/` only), at the first run of 2026-10-03 and on 2026-10-10:

| directory                  | % stmts 10-03 | % stmts 10-10 | % branch 10-10 | % funcs 10-10 | % lines 10-10 |
|----------------------------|--------------:|--------------:|---------------:|--------------:|--------------:|
| all files                  |         34.22 |         93.12 |          87.91 |         92.03 |         93.09 |
| `kln90b`                   |         68.53 |         94.39 |          86.85 |         94.28 |         94.37 |
| `kln90b/controls`          |         44.33 |         94.33 |          89.96 |         94.60 |         94.22 |
| `kln90b/controls/displays` |         54.40 |         93.31 |          85.63 |        100.00 |         93.16 |
| `kln90b/controls/editors`  |         53.99 |         95.24 |          87.29 |         97.61 |         95.08 |
| `kln90b/controls/selects`  |         26.18 |         89.92 |          85.71 |         87.20 |         89.24 |
| `kln90b/data`              |         65.21 |         99.18 |          99.10 |        100.00 |         99.15 |
| `kln90b/data/flightplan`   |         68.64 |         98.91 |          98.14 |         97.56 |         98.87 |
| `kln90b/data/navdata`      |         49.28 |         94.36 |          90.14 |         93.45 |         94.16 |
| `kln90b/pages`             |         37.82 |         88.63 |          87.32 |         83.06 |         88.54 |
| `kln90b/pages/left`        |         14.35 |         92.65 |          84.89 |         91.83 |         92.71 |
| `kln90b/pages/right`       |          7.20 |         91.72 |          87.42 |         87.88 |         92.13 |
| `kln90b/services`          |         36.09 |         93.96 |          87.13 |         99.12 |         93.60 |
| `kln90b/settings`          |         73.63 |         96.56 |          87.75 |        100.00 |         96.41 |

The files below 80 % of statements on 2026-10-10, and why: `TakehomePage.tsx` 0 (take-home mode is out of scope),
`KLN90BPlatform.ts` 25 (the real SDK objects of `SIM_PLATFORM`; tests use `FakePlatform`), `NullPage.tsx` 30 and
`OneSegmentPage.tsx` 16.7 (base classes whose defaults the pages override), `FourSegmentPage.tsx` 46 (its ENT order is
not tested, by decision), `Sta5Page.tsx` 60.8 (its primary satellite computer cannot run in the harness), `Apt6Page.tsx`
65.5 and `Apt5Page.tsx` 70.5 (the sim has no service data; the remark editing paths), `Cal2Page.tsx` 72.7,
`SuperDeviationBar.tsx` 73.3, `NearestSelector.tsx` 73.5, `FpmFieldset.tsx` 76, `Sta1Page.tsx` 77.1 (the TRAN, DEGRD and
FAILR states are not modeled) and `FuelFieldset.tsx` 79.5.

## Per area

- **The public contract with aircraft** (`HEvents.ts`, `LVars.ts`, `settings/KLN90BPlaneSettings.ts`, `SensorsOut`,
  `WTFlightplanSync`, the EFB sync, the persisted formats). *Spec, from the contract:* a sweep sends every public H
  event to a unit in four states and asserts that nothing was published on `error` (a deliberate permissive sweep),
  and the events with an effect on the screen or the state have tests of that effect; every read-only LVar is checked
  against a known state and every writable one for the behavior it overrides; `cfg/panel.xml` is parsed key by key and
  an empty document gives the defaults; the GPS SimVars are written with `WriteGPSSimVars` and not without it, against
  independent geometry; the `"kln90b"` planner mirrors FPL 0; the EFB route is loaded and answered; the V1 and V2
  waypoint and flight plan strings are hand-laid literals, through the loaders, the persistors and the V1 to V2
  conversion; the user setting keys are pinned. Invalid panel.xml values fall back to the default with one recorded line each,
  and the panel.xml error page lists them (#145). *Untested:* `TakeHomeMode`, the effect of a custom `BasePath` (needs a `FakeXhr` mount), the `Internal_*` events except
  `Internal_Key`, the 5 kt threshold of the roll command, the clamp and boot value of `L:KLN90B_Brightness`
  (undocumented), temporary (`XY`)
  waypoints round-tripped through storage, the ten-message cap of the flight plan loader and the failing V1 restore.
- **The navigation core** (`data/flightplan/`, `NavCalculator`, `ModeController`, `KLNNavmath`, `FlightplanUtils`,
  `Flightplanloader`). *Spec* (chapters 4 to 6), with expectations from `flight/geo.ts`: DTK and XTK, sequencing at the
  closest approach, turn anticipation and the near-180° turn, the waypoint alert with and without anticipation, the
  GPS-invalid path, LEG and OBS and the OBS synthetic waypoint, the ENR, ARM and APR scaling, the Direct To flows, the
  flight plan bounds, insert and delete and the duplicate waypoint cases. Flights cover the large turn, duplicate
  waypoints, the DME arc, the alert through a turn, the TO/FROM flag and the magnetic track. *Pins and
  characterizations only:* roll steering (the #100 pins, by decision), the XTK output filter (#158; its step
  response is a unit test), the return to ACTV after the GPS APR press before the FAF (#162) and the ACTV scale ramp
  from the activation (#163); the last two are the maintainer's rulings, because the trainer shows neither ARM nor
  ACTV. *Untested:* the alert questions #146 and #147, the turn circle on a great-circle leg (only the arc case), and
  the nav-source gate and a cold start in a flight (render tests hold both).
- **Navdata** (`data/navdata/`, `Gps.ts`). *Spec and characterization:* `KLNFacilityLoader` merging the user
  repository with the database and its user and temporary regions, the nearest lists (order, update interval, the
  selected entry dropping out (#39), the filters of #57 and SET 3), the scan list including its cache window (#40,
  pinned as #201), the database validity through the last day of the cycle, `KLNMagvar`, `BoundaryUtils` against
  hand-computed cases, the airspace alert on invented airspaces, `SidStar` on invented procedures, and the GPS:
  acquisition from cold and warm, the almanac, the week rollover (#63) and acquisition from power-on (#61). *Untested,
  because the fake cannot show it:* comparisons of ICAOs by reference and the type `getFacilities` passes down (the fake
  shares one `IcaoValue` and ignores the type), the sim's search order for the autocompletion, `isCalculating` (the fake
  answers at once), circular airspaces (#209), DEGRD, FAILR and RAIM (not modeled) and take-home mode.
- **Data and pure services** (`data/`, `services/`). *Spec* against independent sources: the ICAO standard atmosphere,
  the wind triangle, the USNO almanac, spot checks of Appendix D for the country and FIR maps; the message handler and
  the persistent messages; `Timers`, `TimezoneService`, `Vnav`, `MSA` (the real grid through `FakeXhr`), the altitude
  and height-above-airport alerts, `TemporaryWaypointDeleter`, the EFB loader and saver, `AudioGenerator` at the bus
  level and `VolatileMemory`. *Untested:* `Units.ts` (type aliases only), the full country and FIR tables (spot checks
  only), the `PLAY_INSTRUMENT_SOUND` call itself (no `Name_Z` fake), IF REQUIRED SELECT OBS in a booted unit, the VNAV
  offset to a waypoint ahead in FPL 0, and the MSA sampling step.
- **Settings and persistence** (`settings/`). *Spec, from the formats:* the V1 and V2 loaders and persistors, the
  conversion, the user settings and the panel.xml parser. The format bugs are pinned (#98, #101, #103, #144).
- **The page shell** (`pages/` itself: `MainPage`, `PageManager`, `PageTreeController`, `CursorController`, the segment
  pages, the overlays and the start-up pages). *Spec:* the Turn-On, self-test, Database, VFR-only and OBS warning pages
  and what follows APPROVE?, the overlays and the rule that a pushed page that does not handle a knob is popped (#56,
  from the KLN 89 trainer), the distinct slot classes, group sizes, group memory and five-character page names of the
  page trees, and the cursor stopping at both ends (#218). *Characterization only:* the
  `FiveSegmentPage` SCAN and ENT order. *Untested:* the `FourSegmentPage` ENT order (by decision) and `TakehomePage`.
- **The left pages** (`pages/left/`). Every page has a render test and a characterization snapshot, in tree order from
  NAV 1 to the self-test page, with spec tests where the Pilot's Guide or the KLN 89 trainer gives the rule. *Without
  a spec test:* OTH 1 (the sim has no FSS data), SET 10 (the page is the project's own, #46), STA 2 and STA 3. Super
  NAV 5 is read through `SuperNav5.read()`, and the NAV 5 and Super NAV 5 maps through the map recorder and file
  snapshots. *Untested:* weather, terrain and SUA on the maps (no code path), the ESA along the route (needs a
  non-flat MSA grid), and take-home on SET 1 and the TRI pages. The restart of the GPS search by a corrected position, date
  or time (SET 1 CONFIRM?, SET 2, the self-test page) is tested in `GpsAcquisition.test.ts` (architecture.md Core 3).
- **The right pages** (`pages/right/`). Every page has a render test with a characterization and spec tests where the
  guide, the trainer or a photo of a real unit gives the rule; ACT 7 has characterizations only, and the APT 7 page
  order is a characterization (the trainer had no airport with both SIDs and STARs). *Untested:* the name and city
  search of 3-24 to 3-26 (the SDK has no such search; out of scope by decision), APT 6 with service data (none in the
  sim), the city row of a long name and the order of the comm frequencies.
- **The controls** (`controls/`, `displays/`, `editors/`, `selects/`). Every editor, select and fieldset type is driven
  through the front panel and asserts the committed value; every display file has a test of the mounted control;
  `List`, `FlightplanList`, `WaypointDeleteListItem`, `Button`, `PageContainer`, `StatusLine`, `Blink`, `Inverted`,
  `MessagePage`, `ErrorPage`, the airport and coordinate views and Super NAV 5 left and right have tests. The 89's block
  layout of some fields is never asserted (section 5). *Untested:* the label placement of `Canvas` (the map tests hold
  it), the null branch of `TimeEditor.convertToValue`, the focus events and the
  click outside the instrument (`FakeCoherent`), and the CSS flash rate.
- **Boot, power and the unit as a whole** (`KLN90BCore`, `TickController`, `Hardware`, `PowerButton`,
  `BrightnessManager`, `SimVarSync`, `KeyboardService`). *Spec and contract:* the cold-and-dark start, the self-test
  values and outputs, the power cycle and what it clears, the 4 Hz display with every fourth tick blinking, the 1 Hz
  calculations in their documented order, nothing running while off or hot-swap disabled, H events before `init()`
  ignored, a start-up error on the error page (#50), and `init()` with the sample and a minimal panel.xml. *Untested:*
  `debugMode` (a constant), the real `SIM_PLATFORM` and `KLN90B.connectedCallback`, the early return of
  `PowerButton.refreshPowerState` that keeps `setupLoops` from doubling the loops (unrun), the exact Turn-On time (the
  tests hold 14 to 19 s), TEST FAIL (no failure model), and what the real unit keeps over a short interruption (#192).

## Bugs and the regression triage

- **Every pin names an open issue**, checked against GitHub on 2026-10-10 (all closed issues are #88 or older; the
  only pins that name #56 also name the open #333). Bugs filed without a pin, each because no test can observe it
  cheaply or the fix is pending: #117 (scan list job ids can collide; random), #128 (the nearest VOR filter of
  repository VORs) and #325 (the empty MSG page; no 90B text). #110 is fixed on `master` and closes when that commit
  reaches GitHub. The questions and enhancements the sessions filed carry their labels on GitHub and have no pins.
- **The regression triage** covered every closed issue and every bug-fix commit on `master` up to 2026-10-03, and every
  fix that could be observed has a test that failed under the original bug. Three were *not provable*: #20 (closed
  without a fix of its own, and its symptom is an autopilot turn in the sim), part (d) of `7fd640e` (the canvas is
  identical before and after) and the `fill([])` array of `133f4d8` (#102). Two fixes are held only in part: the
  `WaypointEditor.isEnterAccepted` half of #72 (`3977549`) and the second half of `d3228dd` (`Scanlist.invalidateCache`
  keeping `lastIcao`). The superseded rows were confirmed: the AIRAC last-day boundary of `6ed57d9` is held on the SDK
  utilities that replaced it (`Database.test.ts`), and the cache window that #40 rewrote is held by
  `Scanlist.test.ts`, whose long lists pin #201. The fixes that no test can hold are in section 6.
