# KLN 90B testing guide

Companion to [CLAUDE.md](../CLAUDE.md) and [architecture.md](architecture.md). It explains how the automated tests are
organized, how to write one, what they cannot tell you (section 6), what they covered when the baseline was complete
(section 7) and what is left to do (section 9). All paths are relative to the repo root.

Tests live in `test/` and run with [Vitest](https://vitest.dev). The harness (`test/harness/`) boots the real
instrument headless: the same `KLN90BCore` the sim runs, with fakes for everything the sim provides.

# 1. Stages and when to use which

There are three stages, one Vitest project each (`vitest.config.mts`).

| stage  | folder         | environment | what it observes                                                                    |
|--------|----------------|-------------|-------------------------------------------------------------------------------------|
| unit   | `test/unit/`   | Node        | pure logic and data formats: `KLNNavmath`, loaders and serializers, the harness fakes |
| render | `test/render/` | happy-dom   | what a page shows on the 23×7 screen for a given state                              |
| flight | `test/flight/` | happy-dom   | behavior over time: guidance, sequencing, alerts, SimVar outputs                    |

**Rule: use the cheapest stage that can observe the behavior.** A serializer bug belongs in a unit test, a wrong label
on a page in a render test, and a leg that sequences too early in a flight test. A flight test boots the whole unit and
runs every tick, so it is the most expensive to write and the hardest to read when it fails.

Files are named `<Subject>.test.ts`, and the folders mirror the code under test (`test/unit/settings/` for
`kln90b/settings/`). Tests of the harness itself live in `harness/` subfolders of each stage.

# 2. Running

```bash
npm test                                   # everything: unit, render and flight
npx vitest run --project unit              # one stage (unit | render | flight)
npm run test:watch                         # Vitest watch mode
npx vitest run test/render/pages/Nav2Page.test.ts   # one file
npx vitest run --reporter=verbose          # also shows what passing tests print with console.warn
KLN_TEST_LOG=1 npx vitest run --reporter=verbose   # also shows the instrument's console.log/info output
npx tsc --noEmit                           # the type check; Vitest does not type-check
npm run coverage                           # all tests with V8 coverage of kln90b/: table on stdout, HTML in coverage/
```

- The instrument logs a great deal. By default `vitest.config.mts` drops all console output except stderr; set
  `KLN_TEST_LOG=1` when you need to see it. The default reporter also hides the output of passing tests.
- `npx tsc --noEmit` and `npm run build` are separate checks. `vitest.config.mts` is excluded from `tsc`.
- `tsconfig.json` lists what `tsc` compiles in `include`: `kln90b/`, `test/` and the declaration files of the
  dependency `@microsoft/msfs-types` (the base MSFS types that declare globals such as `registerInstrument`). A fresh
  clone or a git worktree therefore needs only `npm install`. The gitignored `types/` directory that older checkouts
  carry is no longer read, and agent worktrees under `.claude/` are not compiled by the main checkout.
- Coverage is a diagnostic: it shows code no test has run. It is not a target, because a snapshot of every page in its
  default state raises it without proving anything about the real unit. `coverage/` is gitignored.
- A failed flight test writes its recording to `test/flight/__output__/` (gitignored); see section 4.
- There is no linter and no CI.

# 3. How the harness works

## The composition root

`KLN90B` (`kln90b/KLN90B.tsx`) is a thin `BaseInstrument` adapter. Everything else is `KLN90BCore`
(`kln90b/KLN90BCore.ts`), which the tests create directly. What the sim provides outside the global APIs comes
through `KLN90BPlatform` (`kln90b/KLN90BPlatform.ts`): the navdata client, the facility repository and the EFB route
manager. The sim uses `SIM_PLATFORM`; tests use `FakePlatform` (`test/harness/platform.ts`).

`bootUnit()` (`test/harness/boot.ts`) does the following:

1. Installs the fake clock, seeds `Math.random` and sets the SimVars a booting unit reads (position, `ATC MODEL`,
   `ENG COMBUSTION:1`, and so on), then the test's own `simVars` (section 4), which win.
2. Writes saved user settings into `FakeStorage` if the test passes `storage`.
3. Builds a `KLN90BCore` with a `FakePlatform` around a `MemoryFacilityClient` and calls `init()` with a panel.xml
   document (`MINIMAL_PANEL_XML` unless `panelXml` is given).
4. Advances simulated time until `propsReady` fires, and returns the `HeadlessUnit`: `core`, `props` (the `PageProps`
   bag), `env` (the fakes), `navdata`, `errors` (everything published on the `error` topic), `atcModel` (the model the
   unit booted with, which is part of the key its settings are saved under), `send(evt)`, `panel` (the front panel),
   the collectors and `display` probes (below) and, with `efb: true`, the fake `efb`.

By default the engine is running, so the unit skips the welcome and self-test pages (`isForceReadyToUse`). Pass
`engineRunning: false` to see the cold-and-dark start. Pass `coldGps: true` for an engine-running boot whose GPS has no
fix yet (the boot resets the GPS after `propsReady`); it acquires on its own, fast or slow per the `fastGpsAcquisition`
setting, and `settle` waits for it.

## The global fakes

The sim globals are installed once per test file by the setup files `test/harness/setup/unit.ts` and `dom.ts`, through
`installSimFakes()` (`test/harness/sim/install.ts`). `simEnv()` returns them.

- **`FakeSim`** (`sim/FakeSim.ts`) fakes SimVars at the *native* layer, not at `SimVar.GetSimVarValue`. The SDK replaces
  `SimVar.GetSimVarValue` and `SetSimVarValue` at import time with versions built on `SimVar.GetRegisteredId`,
  `simvar.getValueReg*` and `Coherent.call('setValueReg_*')`, so a replacement of the public functions would be
  overwritten. The fake therefore sits below the SDK, and the SDK's own unit conversion runs for real.
    - `sim.set(name, unit, value)` sets a value as the sim would. `sim.get(name, unit)` reads it in any unit.
    - `sim.writes`, `sim.lastWrite(name)`, `sim.writeCount(name)` and `sim.keyEvents` log what the instrument wrote.
      `sim.writes` stores the names in upper case, so a filter over it compares with `name.toUpperCase()`; `lastWrite`
      and `writeCount` do that themselves (`writeCount('l:my_var')` counts the writes of `L:MY_VAR`). A value a test sets
      with `sim.set` is not a write.
    - **Key events have no effect.** `sim.keyEvents` records a `K:` event, but nothing acts on it: `K:GPS_OBS_ON` does
      not set `GPS OBS ACTIVE`, and `K:VOR1_SET` does not move `Nav OBS:1`. A test asserts the event, or sets the
      SimVar the sim would set itself. The one exception is opt-in: `sim.applyObsKeyEvents = true` makes `K:VOR1_SET`
      and `K:VOR2_SET` set `Nav OBS:1` and `Nav OBS:2` to their value in degrees, as the sim does, for a test of an
      indicator the unit drives (`ObsTarget`). `reset()` turns it off, so it lasts one test.
    - `sim.unsetReads` lists variables the instrument read that nobody set, which helps when wiring a new input.
    - The SDK swallows exceptions inside `GetSimVarValue`, so unit-conversion problems would vanish. `FakeSim` collects
      them in `sim.errors`, and the flight driver turns them into a failure.
- **`FakeCoherent`** routes `setValueReg_*` calls to `FakeSim` and records every other `Coherent.call`. Calls without a
  configured reply (`coherent.replies`) never resolve, like a sim with nothing attached.
- **`FakeStorage`** implements `GetStoredData` and friends. **A missing key returns `""`, not `null`.** The sim does the
  same: `DataStore.get` fails to parse it and the setting keeps its default. Returning `null` would set every setting to
  null.
- **`FakeXhr`** serves `coui://` URLs from `resources/` (ephemeris, MSA grid).
- **Magnetic variation:** `env.magvar(lat, lon)` answers `Facilities.getMagVar`. `bootUnit` sets it from the `magvar`
  option, a number for the whole world or a function.
- **Static globals** (`sim/staticGlobals.ts`): `BaseInstrument`, `KeyCode`, `RunwayDesignator`, `Utils` and the like.
  They talk to nothing.
- **`installCanvas`** (`render/canvas.ts`) backs happy-dom's canvas elements with Skia (`@napi-rs/canvas`) and registers
  the instrument's fonts. Only the render and flight stages install it.

## Isolation and time

- Vitest gives every test file fresh module state and its own globals. Every test may boot its own unit with
  `bootUnit`, and a file may hold several such tests. The unit is torn down when the test ends:
    - its timers stop;
    - the sim fakes are reset in place (`FakeSim` keeps its registration ids, because SDK objects cache them);
    - the singletons listed in `test/harness/singletons.ts` are cleared. That list includes the module-level
      `LEFT_PAGE_TREE`, which `PageTreeController` prunes in place on every `MainPage` (#90): the teardown puts it back
      from a snapshot taken at load, so a later boot in the same file still has the fuel computer pages;
    - the DOM is emptied.

  The teardown (`runAll` in `boot.ts`) runs every step even when one throws, then rethrows the first error, so one
  failing reset cannot leave the singletons dirty for the next test. It also clears `FakeXhr.requests`.

  Only one unit is live at a time: `bootUnit` throws on a second call in the same test, and outside a test. A singleton
  added to the instrument must be added to `singletons.ts`.
  Unit tests of a single service (see `UserWaypointV2.test.ts`) use the same singletons, so they build their own bus.
- The clock is Vitest's fake timers (`sim/clock.ts`): `setTimeout`, `setInterval`, `Date` and `requestAnimationFrame`
  are faked, starting at `DEFAULT_START`. Advance it with `await vi.advanceTimersByTimeAsync(ms)`. All tick loops
  of the instrument (docs/architecture.md, Core 2) run on this clock.
- `Math.random` is replaced by a seeded generator (`sim/random.ts`, default seed 1), so the GPS clock jitter and scan
  list job ids repeat between runs. A test that needs another jitter passes `seed`. The teardown puts the real
  `Math.random` back, so a later unit test of the file sees the real generator.

## Collectors and boot failures

`bootUnit` installs collectors before `KLN90BCore.init`, so that an error while the unit starts up is seen too.

- **`unit.errors`** holds everything published on the `error` topic, and every unhandled promise rejection.
- **`unit.consoleErrors`** holds the arguments of every `console.error` call. The call is passed on to the
  `console.error` it replaced, and the teardown puts that one back. `Flight` reads it for its "no console.error"
  monitor.
- **Unhandled rejections** are collected through a `process` listener, into `unit.rejections` and `unit.errors`. Many
  input handlers are not awaited (ENT, for example), so a throw inside one is a rejection nobody sees. Vitest stops
  reporting unhandled rejections once a second listener exists, which makes this collector the only check. It is
  strict: a rejection still in `unit.rejections` when the test ends fails that test. The check runs while the unit is
  still up, before the teardown (Vitest runs `onTestFinished` callbacks last registered first), and a throw in it does
  not stop the teardown. The teardown removes the listener.

`bootUnitExpectingError({...bootOptions, platform})` is the boot for a start-up that is expected to fail (#50). It
shares the guard and the teardown with `bootUnit`, but waits for the first `error` event instead of `propsReady`,
throws `propsReady fired` if the unit came up, and returns `{core, env, errors, consoleErrors, rejections,
takeRejections(), errorPage()}`. `errorPage()` is the message on the visible error page, or `null` while it is hidden.
A failed unit keeps ticking and its nearest searches keep rejecting, so a test that advances the clock after the
failure must call `takeRejections()`, or the strict collector fails the test. `platform` overrides methods of
`FakePlatform`, for example `createFacilityClient`. The boot stays marked incomplete, so the teardown tolerates
singletons that were never created.

## Navdata

`MemoryFacilityClient` (`navdata/MemoryFacilityClient.ts`) is the navdata the unit sees: a set of facilities built
with `airport()`, `vor()`, `ndb()` and `intersection()` (`navdata/builders.ts`). The builders fill every field the
instrument reads and nothing else. The data is synthetic; see the limitations in section 6.

**Default navdata.** `bootUnit`, `bootUnitExpectingError` and `Flight.start` add one airport, VOR, NDB and intersection
to every world (`defaultNavdata()` in `test/harness/fixtures.ts`), because a real unit always has a database: without
them, the APT, VOR, NDB and INT pages of a world that lacks the type post `NO APT WPTS`, `NO VOR WPTS`, and so on, a state
no real unit shows. They lie at 45 S 150 W, far beyond the 500 NM nearest search of every test position, so the nearest
lists, the maps and the INT reference VOR are unchanged. Their idents (`ZZXA`, `ZZV`, `ZZN`, `ZZXIN`) sort after the idents
of the tests, which matters because the scan lists are in ident order and the pages open on the first entry, and they are
unique across the types, so no DUPLICATE page appears. `bootUnit` throws when a test facility has exactly one of their
idents, whatever its type. The guard checks exact idents only; the ordering is the test's part: a test ident that sorts
after `ZZXA` (or after the default of its own type) would put the default first on its page, so choose test idents that
sort before the defaults. There is no default user waypoint, so `NO SUP WPTS` stays real. A test that needs
the bare world (the `NO ... WPTS` messages themselves, or a count of the facilities) passes `defaultNavdata: false`.
`MemoryFacilityClient` itself is unchanged, so a unit test that builds one gets exactly the facilities it is given.
`test/render/harness/defaultNavdata.test.ts` holds this behavior.

**Nearest filters.** A nearest session keeps its filters itself and applies them inside the search, before `maxItems`,
as the sim does: a nearer facility that the filter hides takes no slot, and a facility hidden by a new filter is reported
as `removed` at the next search. The airport filters are the class mask of `setAirportFilter` and the surface, length
and towered filters of `setExtendedAirportFilters` (bit 1 of the towered mask is untowered, bit 2 towered); the VOR
filters are the class and type masks of `setVorFilter`. An airport without runways passes the extended filter and is
dropped only by the class mask. That rule is the sim developers' own, quoted to the maintainer from their code: "If
there are no runways, the minimum runway size and surface types filters should not apply". `airport()` takes `runways`
(an empty list is a heliport), `towered` and `airportClass`, which is derived from the runways when absent; `vor()`
takes `vorClass`. Without these options a world is the same as before. A runway's `heading` (or `runwayHeading`) is
the heading of either end. The runway is stored the way the SDK reads it, with the lower-numbered end first and the
heading of that end as its `direction`, so `runwayHeading: 270` gives the designation `09-27` with a direction of 90,
and `runwayFix(apt, '27')` and `runwayFix(apt, '09')` both resolve, 27 with a course of 270.

**Airspaces.** `airspace()` and `circularAirspace()` (`navdata/airspaces.ts`) build `BoundaryFacility` objects. Pass
them as `BootOptions.airspaces`, add them to a flight with `World.addAirspace()`, or call
`MemoryFacilityClient.addAirspace()`. The boundary session filters by the type mask (`1 << BoundaryType`), selects the
airspaces whose bounding box meets the search circle, sorts them by distance to the box, cuts at `maxItems` and reports
removed ones by id. The bounding-box selection is inferred from a comment in `NearestUtils.getAirspaces`, not observed
in the sim. The SDK's `NearestLodBoundarySearchSession` builds the `LodBoundary` objects in a throttled queue on
`requestAnimationFrame`, so a test advances the fake clock for a search to finish. The builder sets `lods: []`, so that
LOD 0 is the exact ring instead of a simplified one, and `resetSingletons` clears the SDK's boundary cache, which is
keyed by the airspace id. A circular airspace exists for the known gap that `BoundaryUtils` ignores circles. A test of a
message reads the MSG page with `Screen.read()` (see `test/render/harness/airspaces.test.ts`).
A Center airspace (`BoundaryType.Center`) built with `frequencyMHz` carries the frequency that OTH 2 lists. OTH 2 also
reads the frequency's name, and throws on every display tick without it, so the builder gives the airspace's own name
unless `frequencyName` says otherwise.

`savedFlightplan(idx, legs)` (`test/harness/storage.ts`) returns user data in the V2 format (docs/architecture.md,
Core 7). Pass it as `storage` to start a test with a flight plan already stored, which is far faster than entering it
with the knobs.

`savedUserWaypoints(wpts)` (same file) does the same for user waypoints: a list of `{kind: 'sup' | 'int' | 'apt' | 'vor' |
'ndb', ident, lat, lon, ...}` becomes the `wpt0`, `wpt1`, ... strings plus `userDataFormat: 2`. Spread it together with
`savedFlightplan` when a test needs both. The strings are laid out by hand from the format, never produced by the
persistor, so a test of the restore stays independent of the code that saves. The format tests of the persistor itself
(`UserWaypointV2.test.ts`) keep their literals. An airport's `elevationFt` is stored in meters, rounded, as the format
and the model hold it (1400 ft are `+00427`), so APT 2 of that airport shows 1400 ft; an unknown elevation is the
unit's own -1 m. A southern latitude of one degree or more does not survive the restore (#98),
so keep it out of setup.

`standardRoute()` (`test/harness/fixtures.ts`) returns the world many tests use: KAAA, the VOR ABC and KBBB, fresh objects
on every call. `insertLeg(unit, idx, fac)` (`test/harness/flightplan.ts`) puts a `USER` leg into FPL 0 at `idx`, the way the
FPL page does after a waypoint confirmation, which is far faster than typing it with the knobs.

`approachWorld()` (same file) returns an RNAV approach to KPRC from the north with fresh objects on every call: the IAF
IAFAA, the intermediate fix IFAAA, the FAF FAFAA 5 NM north of the MAP, a step-down fix SDFAA between the FAF and the MAP, the MAP MAPAA at the
airport and an enroute fix ENRAA. Its FAF is not its IAF, so the unit can reach APR there, and the step-down fix lets a test
check that APR does not come back past the FAF. Boot with its `facilities`, store `[enraa, kprc]` in FPL 0 with
`savedFlightplan` and load the approach with `await unit.panel.loadProcedure('APT 8')` after `settle`; `north(nm)` gives a
point on the final course line. `sidStarWorld({sids, stars, rf?})` gives KPRC of that world invented SIDs and STARs
east of it (optionally with an RF procedure the unit leaves out) and returns `{facilities, position}`, KPRC and ENRAA
first; the APT 7 and ACT 7 tests use it.

`dtWorld()` returns four waypoints half a degree of latitude apart on one meridian, 10 E: the airport KAAA, the VOR ABC,
the intersection DEF and the airport KBBB. Each leg is about 30 NM, which is 15 minutes at 120 kt. `centerWorld()`
returns `{kaaa, kbbb, kccc, bgd, gck, centers}` for the CTR pages: three airports 5 degrees (300 NM) apart on 100 W, the
VORs BGD and GCK, and three Center airspaces stacked along that meridian that share their boundaries at 42.75 N and
47.75 N. BGD is the only VOR within 100 NM of the first crossing and GCK of the second. A plan through the airports
should keep its legs at 300 NM: the route search searches circles of about 75 NM radius at 0, 75 and 225 NM along a leg,
so each Center is first returned by a search whose center lies inside it, and a Center first returned from outside it is
dropped for good by the shared search session (#102). Both return fresh objects on every call; pass `centers` as
`BootOptions.airspaces`.

`legWorld()` returns `{kddd, kaaa, keee, west}`, the leg world of the NAV 3 and NAV 4 pages and the Super NAV 5
selectors: KDDD (47.0 N, 9.0 E), KAAA 200 NM west of it on the great circle that leaves KDDD on 270 true, KEEE 30 NM
east of KDDD, so that the leg KAAA to KDDD is not the last one (the ESA of the last leg is #183). `west(nm)` is the
point nm NM west of KDDD on that line. Store `[kaaa, kddd, keee]` in FPL 0 with `savedFlightplan`; an eastbound
aircraft on the first leg has KDDD active. `arcWorld()` returns
`{abc, at, arcbg, arcen, fafaa, mapaa, kprc, facilities}`: a left DME arc of 10 NM around the VOR ABC from its 270 to
its 180 radial (ARCBG to ARCEN), then FAFAA and the MAP MAPAA, in an RNAV approach to runway 27 of KPRC with the
transition ARCBG. `at(bearing, nm)` is the point nm NM from ABC on a true bearing, so `at(225, 10)` lies on the arc.
Store `[kprc]` in FPL 0 and load the approach with `unit.panel.loadProcedure('APT 8')`; the arc is the active leg
then. Both are pure worlds with fresh objects on every call and no boot: the boot sequence that puts the aircraft on
the leg or on the arc and shows Super NAV 5 stays in the test file that needs it.

## The EFB

`FakeRouteManager` (`platform.ts`) stands in for the SDK's `FlightPlanRouteManager`, with the members the unit uses
(`KlnEfbLoader`, `KlnEfbSaver`). `bootUnit({efb: true})` attaches one as `unit.efb`; without it the route manager never
resolves, like a sim with no EFB.

- `sync(route)` emits a synced route as the EFB would. Pass a new object each time, because the subject compares by
  identity. The unit loads it into FPL 0 and shows FPL 0 on the left.
- `request()` asks the unit for its route and returns the request id. The answer lands in `replies`.
- `efbRoute({departure, destination, enroute})` builds a route on the SDK's empty route. An enroute entry is a facility
  (its ICAO is the fix) or `{lat, lon}`, which the unit imports as a temporary user waypoint (region `XY`).

## Procedures

`navdata/procedures.ts` builds SIDs, STARs and approaches that the real `SidStar` conversion and the APT 7 and APT 8
pages accept.

- `Leg.TF(fix, flags)`, `Leg.IF`, `Leg.CF`, `Leg.DF`, `Leg.CA`, `Leg.VM`, `Leg.HM`, `Leg.HF`, `Leg.HA`, `Leg.PI`
  (holds and a procedure turn, with the arguments of `Leg.HM`), `Leg.AF` (a DME arc) and `Leg.RF`
  (only to test that RF procedures are rejected) return legs as `FlightPlan.createLeg` does. `SidStar` writes into legs
  (`fixTypeFlags`, `course`), so every call returns a new object; never share a leg between procedures.
- `sid`, `star` and `approach` take the legs by role: runway transitions, enroute transitions, common legs, or an
  approach's transitions, final and missed legs. `withProcedures(apt, {...})` returns a copy of an `airport()` that carries
  them, because the builders in `builders.ts` stay procedure-free.
- `runwayFix(apt, '27')` is the runway waypoint a procedure can fly to. Add it to the navdata like any facility.
- **Every fix must be in the navdata**, because `SidStar` loads each one with `getFacility`, and so must an arc's navaid.
  `bootUnit` checks this on the facilities it is given and throws, naming each missing fix as `IDENT (type region)`
  (`MemoryFacilityClient.missingProcedureFixes()` is the same check for a unit test).
- **`unit.panel.loadProcedure('APT 8')`** loads the first procedure of APT 7 or APT 8 into FPL 0 the way a pilot does:
  select the page, cursor, ENT on the first entry (a single transition is taken without a question), ENT on LOAD IN
  FPL, cursor off, then one second of clock, because FPL 0 scrolls to the active leg only at the next calculation tick.
  The APT pages open on the first airport of the scan list, so with more than one airport pass
  `{ident: 'KPRC'}`: the helper first enters that ident on APT 1. A test that needs another entry or a transition
  question does the sequence by hand (`selectPage`, `cursor`, `ent`). `test/render/harness/procedures.test.ts` does
  both.
- A DME arc is converted to an entry waypoint `Dnnnx` and the arc's end fix. The entry is the point of the arc closest to
  the GPS position at load time (the beginning of the arc when that point is outside it), so the position the unit boots
  at decides the entry. The arc's radials are true bearings: keep `magvar` at 0 or account for it. The arc must not be the
  first leg that survives the conversion, which replaces the leg before the arc with the entry.
  Boot on the arc, so that the arc leg is the closest and becomes active (activation in the middle of an arc is #121).
  A test that recalculates the entry (MOVE? on Super NAV 5) uses a left arc, because the entry of a right arc is named
  wrongly after a recalculation (#104).
- `Leg.TF(fix, FixTypeFlags.IAF)` and its siblings set the fix types. `SidStar` keeps a leg flagged IAF, FAF, MAP or MAHP
  even when its fix repeats, and drops an unflagged repeat.

## Reading the screen

`Screen.read()` (`render/screen.ts`) turns the DOM into the cells the pilot sees; where the DOM and the screen differ,
the reader follows the screen:

- A row may carry blank cells past the edge of its half page (the nearest selector of APT 1 and VOR); they read as
  nothing. A visible character or an inverted cell past the edge is a rendering bug, and the reader throws (#115).
- With the left cursor on, the status line shows `CRSR` (or `KYBD`) one cell in, because the DOM gives that field a
  CSS margin of one cell. The reader inserts that blank, so the status line keeps its 23 cells and `CRSR` sits in
  columns 1 to 4.
- A newline inside a `<pre>` starts a row, as the browser renders it (the MSG page joins its lines that way).
- The top row of a numbered flight plan (FPL 1 to 25) with waypoints shows `USE?` over the first four cells of
  `USE? INVRT?`: `FlightplanList.tsx` pulls it back with a negative CSS margin of eleven cells (`.use-invert`,
  `KLN90B.scss`). The reader lays the text of a `.use-invert` element over the cells it covers, so the row keeps its
  eleven cells and the cursor on `USE?` inverts four of them. An overlay with other characters than the cells below it,
  or a normal overlay over inverted cells (which would fill them green), is a rendering bug and throws.
- The IAF list of APT 8 and ACT 8 is positioned with CSS (`.apt-8-iaf-list`, `KLN90B.scss`): the browser draws every
  row of it from the cell where the list starts, cell 4 of the right half, while the DOM starts the second and later rows
  at the line start. The reader moves those rows right by four blank cells, so the rows read `IAF 1 IAFAA` and
  `    2 IAFAB`. It throws when the list does not start in cell 4.
- The classes of a flashing cell follow the CSS of `KLN90B.scss`, where `.inverted` is black on green,
  `.inverted-blink` (later) takes the background away and makes the text green, and `.blink` (later still) makes the
  text transparent. `inverted` with `inverted-blink` is a flashing inverse cell, `F`. `inverted-blink` without
  `inverted`, on the element or on an ancestor, is plain green text and reads as it would without the class: the status
  line's `ent` keeps the class while an unread `msg` toggles it. `blink` hides the text, whatever else the element has,
  so it reads `B`.
- A half page has six rows (row 7 is the status line). The reader throws when a seventh row holds a character or a
  non-normal cell, naming the side and the text: a creation block that stayed visible under a waypoint page once went
  unseen that way. Blank rows past the sixth are tolerated.
- A full page without a status line (the welcome page) owns all seven rows. The orientation and range of NAV 5 are
  positioned over the map with CSS and are read at row 5 of their half.
- Super NAV 5 is a map with text over it, not a text grid. `Screen.read()` throws there; section 4 shows how to read it.

# 4. Writing tests

## Unit

Import the code under test and call it. The sim globals exist already. Pure functions need nothing more; code that
reads settings builds its own `EventBus`. `test/unit/settings/UserWaypointV2.test.ts` is the model: it drives the real
`UserWaypointPersistor` and `UserWaypointLoaderV2` through the repository and asserts the exact stored string.

```ts
it('serializes a user VOR', () => {
    repo.add(vor);   // a VorFacility in the user region XX
    expect(storedSlot(0)).toBe('VXX        ABC     +4730.75+00854.75+114.30+02');
});
```

The expected string is a literal laid out by hand from the format, not produced by the serializer.

**A unit test resets the fakes it writes.** Without `bootUnit` there is no teardown, so `FakeSim` and `FakeStorage` keep
what one test of the file wrote for the next. A unit test that writes either resets it before it writes
(`simEnv().sim.reset()`, `simEnv().storage.data.clear()`), in `beforeEach` as the panel.xml parser tests
(`KLN90BPlaneSettings.test.ts`) do, or at the start of the test as the stored-key pin
(`KLN90BUserSettingsSaverManager.test.ts`) does. The settings
manager and the repository are singletons bound to the first bus that reaches them, so a unit file that needs both uses
one `EventBus` for all its tests (`UserWaypointPersistor.test.ts`).

## Render

Boot, let the page settle, read the screen.

```ts
await bootUnit({facilities: [vor('ABC', 47.2, 8.0)], position: {lat: 47.0, lon: 8.0}});
await vi.advanceTimersByTimeAsync(12_000);   // the nearest list searches every 10 s
const screen = Screen.read();
expect(screen.half('L').split('\n')).toEqual([ 'PRESENT POS', /* ... */ ]);
```

(`test/render/pages/Nav2Page.test.ts`.)

- **Advance the clock; do not call `tick()`.** The DOM changes only inside display ticks (docs/architecture.md,
  Core 2), and a test that calls a tick method by hand skips the ordering the real unit has. The one exception is a
  control rendered on its own with `mount()` (below), which has no tick loop: the test ticks it.
- `Screen.read()` (`render/screen.ts`) returns the 23×7 screen: six rows of two half pages or one full page, plus the
  status line as row 6.
    - `text()`, `row(n)`, `half('L' | 'R')`, `rows(side)` (the six rows of a half as strings), `cell(row, col)` and
      `status()` read it. `status()` returns `{left, mode, right}` trimmed, so with a cursor on it reads `CRSR` or
      `KYBD`; prefer it to slicing row 6, whose columns shift with the cursor. `leftName()` and `rightName()` are the
      raw five-character fields.
    - `mask()` shows the attributes per cell: `.` normal, `I` inverted, `B` blinking, `F` flashing inverse, and
      `maskRows(side)` the mask of a half in the columns of `rows(side)`.
    - `dump()` is the text, a blank line and the mask. It is the format for snapshots and for failure messages.
    - `inverse(row)` returns the characters of one row shown inverse, in order. On a full page (the Database page, the
      self-test pages) that is the field under the cursor, which `focused('R')` cannot read because it looks at one
      half and cuts `ACKNOWLEDGE?` at the middle. `pageRows()` returns the six text rows above the status line, each
      trimmed, the rows of a full page.
- **`settle(unit)`** (`boot.ts`) advances the clock until the GPS has a solution, then two calculation ticks more, so that
  FPL 0 has activated and the display shows it (a force-ready boot is valid at once, but FPL 0 activates only at the first
  calculation tick). It throws when there is no fix within its cap (120 s by default).
- **`NEAREST_SEARCH_WAIT_MS`** (`boot.ts`, 12 s) is how long a test advances the clock for the nearest lists to hold
  their result. The nearest lists and the airspace alert search every 10 s (`NearestList.ts`, `AirspaceAlert.ts`), so
  12 s leaves one search and the time its result needs; a wait below one search interval reads an empty list. Its
  harness test covers the nearest airport list.
- **Time to first fix.** `bootUnit({coldGps: true})` resets the GPS after a forced acquisition, so every satellite keeps
  its ephemeris and the last known position is the present one: it acquires in about 62 s (slow) whatever the almanac,
  the stored position or the clock, and cannot measure a cold or warm start. Boot with `engineRunning: false` and the
  stored position, almanac time and `fastGpsAcquisition` in `storage`, then `powerOn()`; the GPS acquires while the
  welcome and self-test pages run.
- **`bootToSelfTest(opts)`** (`boot.ts`) boots cold and dark whatever `opts.engineRunning` says (the self-test follows
  the welcome page only on a unit that is not force-ready), powers on, advances 19 s (the 17 s Turn-On page and two
  seconds more) and returns the unit with the self-test page showing. It throws with `Screen.read().dump()` when the
  right half has no `APPROVE?` row. The page stays until ENT approves it, so a test that wants more time advances the
  clock itself. It stops there: approving, the data base page and the main page are `unit.panel.approveSelfTest()`
  (Flight, below). The hand-written copies of this boot stay where they are (section 9).
- **`recordSounds(unit)`** (`sounds.ts`) returns `{ids, finishAll}`. `ids` lists the sound ids the unit requested on the
  bus topic `sound_server_play_sound` since the call, in order; install it before the action that sounds. The topic is
  not cached, so a recorder installed later starts empty. The sim plays one tone at a time and reports its end
  (`KLN90B.onSoundEnd`), which asks for the next, so a pattern is one id until the end is reported:
  `finishAll()` reports the end of the playing sound until no new one is requested (at most 20 times). The unit asks
  for sounds unless the panel.xml of the boot sets `Output.AltitudeAlertEnabled` to false (it defaults to true); a test
  of the sounds still sets it, so that the precondition is in the test.
- **`moveAircraft(unit, point, {groundspeedKt, trackTrue?})`** (`boot.ts`) moves the aircraft so that the GPS computes a
  track, which it takes from the last two positions once the ground speed is at least 2 kt (3-35). The helper sets
  `GROUND VELOCITY`, jumps to the point and runs one calculation tick, so the track is that of the jump from the present
  position. With `trackTrue` the aircraft first jumps to a point 0.05 NM behind the target on that track, ticks, then
  jumps to the target. Afterwards the position holds, which is a paused sim: the unit keeps the last track (see
  `test/render/harness/moveAircraft.test.ts`). Only the calculation tick reads the position, so the order of these ticks
  relative to a display tick does not matter. A held position with ground speed can sequence the leg, so keep the
  aircraft away from the next waypoint or boot with `storage: {turnAnticipation: false}`.
- **`storedSetting(unit, name)`** (`storage.ts`) returns the parsed value the unit saved under a user setting, and
  `undefined` for a key never saved. The unit saves a moment after the change, so advance the clock first. Use it instead
  of building the `persistent-setting.<model>.profile_1.` key by hand.
- **`unit.panel.type(side, text)`** types characters with the keyboard (`KLN90B_Internal_Key`), one display tick each, with
  that side's cursor on. It is the keyboard alternative to `enterIdent` (below), which turns the knobs as a pilot does
  to fill the ident selectors of the APT, VOR, NDB, INT and SUP pages. It refuses everything the PC keyboard cannot
  send: only `A` to `Z` and `0` to `9` pass (`KLN90BCore.handleKeyboardEvent`, which also maps the numpad digits), and
  a text with any other character throws before the first key goes out. A pilot cannot type a blank, so a cell that
  needs one (the hundreds cell of a longitude below 100 degrees, the thousands cell of an NDB frequency below 1000 kHz)
  is entered with the knobs: the inner knob until the blank shows, the outer knob to the next cell, then the digits
  (`SupPage.test.ts`, `NdbPage.test.ts`). A test of the raw H event presses it with
  `unit.panel.press('KLN90B_Internal_Key:RIGHT: ')` and says in a comment that only an aircraft's H event can send
  that character.
- **`mount(el)`** (`render/mount.ts`) renders a display or control into a detached element, the way a page renders its
  children, without booting a unit: `text()` and `mask()` read it as `Screen` does (the rows joined by a newline), and
  `tick(blink = false)` runs one display tick of the control. A display that changes its text on a tick only (a value
  set after the render) shows the new text after `tick()`. This is the cheapest stage for the format of a display
  (`mount(new BearingDisplay(null)).text()` is `---°`); what a control does inside a page needs the booted unit.
  `mountedText(el)` and `mountedRead(el)` (same file) are mount, one `tick()` and the read in one call: the text, or
  the `{text, mask}` pair. The tick matters, because a control that changes on its first tick reads differently
  before it, so a test of the format of a control reads it through these.
- **`blinkCycle(read)` and `mountedCycle(m, read)`** (`render/blink.ts`) sample a flashing cell in both phases. The
  display blinks on every fourth display tick (`TICK_TIME_DISPLAY`, 250 ms), so a cell that flashes reads `F` on one
  tick in four, and one read decides the result by the phase the test happens to be in. `blinkCycle(read)` advances
  four display ticks of a booted unit, reading after each, and returns the four reads; `mountedCycle(m, read)` ticks
  a mounted control four times, the fourth with `blink`, and returns the four reads. A test that asserts text only may
  ignore the mask instead.
- **SimVars the unit reads while it is built.** `bootUnit({simVars: [{name, unit, value}]})` sets them before
  `KLN90BCore.init`, after the SimVars the boot sets itself, so a test can override one of those too. The fuel computer
  reads `NUMBER OF ENGINES` only in its constructor, so a fuel test with two engines boots with it.
- **`panelXml(options)`** (`panelXml.ts`) builds the `panelXml` boot option from the keys the parser reads. A key is the
  parser's dotted path from `PANEL_KEYS` (`panelXml({'Input.ObsSource': 0})`), and the presets spread into it: `NO_OBS`,
  `HEADING_INPUT`, `NO_GPS_SIMVARS`, `LEG_OBS_SWITCH`, `NO_ALTIMETER`, `VFR_ONLY`, `AIRDATA`, `ALTITUDE_ALERT(enabled)` and
  `fuelComputer({unit, type, fob, fuelUsed})`. `extra` appends raw XML for what no key covers. It removes the silent
  default: the parser falls back to its default for a tag it does not find, so a misspelled tag in a hand-written
  document tests the default and passes. `panelXml` throws on a key outside the list, and
  `test/unit/harness/panelXml.test.ts` parses every key through the real parser and asserts the parsed setting differs
  from the default, so a misspelled entry of the list fails there. The altitude alert is a function because its parser
  default (true) is the open question #141: a test that depends on it states it.
- **Readers of the unit's state** (`readers.ts`). `userWaypoints(unit, type?)` lists the user waypoints of the facility
  repository in repository order, and the type is stated at the call: without it airports, VORs, NDBs and intersections
  of the user are in too, and `FacilityType.USR` is the supplementary waypoints only, so a local loop that forgets the
  filter reads the wrong set. `messages(unit)` lists the message list as the MSG page would, each message's lines joined
  with a blank, and `messageLines(unit)` keeps the lines apart. `fplIdents(unit, idx = 0)`, `identsOf(legs)`,
  `activeIdent(unit)` (undefined without an active waypoint) and `turnStackLength(unit)` read the navigation state;
  the last reads `turnStack` through the property each time, because `ActiveWaypoint` replaces the array (section 6).
  They read the unit's state, not the screen: use them where the state is the subject and `Screen` where the display is.
- **`bootOnStandardRoute(opts)` and `bootOnDtWorld(opts)`** (`worldBoot.ts`) are the boots the page tests repeated.
  `bootOnStandardRoute` stores `standardRoute()` as FPL 0, boots at KAAA unless `position` is given, settles, and
  throws unless ABC is active: a test that moves on without the check reads a unit that has not activated the plan,
  and its failure shows far from the cause. `facilities` are added to the route's and `storage` is merged over the
  stored plan. `bootOnDtWorld` boots in `dtWorld()` 0.1 degree north of KAAA with `legs` (KAAA, ABC, DEF, KBBB by
  default) stored as FPL 0, settles, and flies due north at 120 kt unless `moving` is false. It also stores the legs
  as FPL 3, because the D/T tests show the D/T page beside FPL 0 and beside FPL 3, unless `fpl3` is false, so the
  choice is a named option and not an accident of a copy. A `facilities` option replaces the legs as the navdata, so it must contain them.
- **Use these helpers; do not hand-roll them.** A wait-for-GPS loop, a `KLN90B_Internal_Key` loop, a
  `persistent-setting.<model>.profile_1.` key and a `gps.reset()` right after the boot are what `settle`,
  `unit.panel.type`, `storedSetting` and `bootUnit({coldGps: true})` do. A hand-rolled form stays only where it is the
  subject or where the helper does not fit: a test of the raw key event (`KeyboardService.test.ts`), a loop that
  measures the acquisition time (`Gps.test.ts`, `SensorsOut.test.ts`), a unit test with no `HeadlessUnit`, a `gps.reset()`
  in the middle of a test, a storage key written before the boot, and the harness tests.
- **An expected unhandled rejection is taken, not ignored.** A test that provokes one calls `unit.takeRejections()`,
  which returns the rejections and empties the list; it also stays in `unit.errors`. One left in the list fails the
  test when it ends, so a handler that started to throw is not missed. To pin such a failure with `it.fails`, keep the
  boot in a passing sibling (the rule above).
- **`unit.consoleErrors`** is the place to assert that the unit logged (or did not log) an error. A test that provokes a
  `console.error` and wants the test output quiet calls `muteConsoleError()` (`console.ts`) before the boot. It replaces
  `console.error` with a silent spy and restores it with an `onTestFinished` registered before the boot, which runs
  after the teardown. Two things log with `console.error` that a test may provoke: the error page, which logs every
  error it shows, and the SDK, which logs its own errors (a failed facility search) the same way.
- **`answerTimezone(standardHours, dstMonths)`** (`timezone.ts`) answers the sim's time zone call for APT 2: a zone
  of `standardHours` from UTC that observes one hour of daylight saving time in the 0-based UTC months `dstMonths`, or
  none. Without it the call never resolves, like a sim with nothing attached, and APT 2 shows no time zone row. The
  answer arrives asynchronously, so advance the clock by a display tick after selecting the page.
- **`collectStatusMessages(unit)`** (`statusLine.ts`) returns the list of the status-line messages published from now
  on. A new bus subscriber is called at once with the last cached message (section 6); the collector drops that call, so
  a message that was shown before is not in the list.
- **`unit.display`** reads what the unit drives outside the screen grid: `opacity()` is the container's opacity as a
  number, and `powerWrites()` lists the writes of `L:KLN90B_POWER`.
- **`unit.overlay()`** is the overlay page over the main page (MSG, Super NAV 1 and 5, SET 0), or `null`; DIR and ALT
  are left pages, not overlays. It reads `MainPage.getOverlayPage()`, so a test asserts which page is on top with `toBeInstanceOf` and not through
  text that `Screen` cannot read (Super NAV 5).
- **A start-up failure** is tested with `bootUnitExpectingError({platform: {createFacilityClient: () => client}})`. Build
  the client from `MemoryFacilityClient` and replace only the method that should fail, so that nothing else in the boot
  breaks for a reason the test does not name (`test/render/harness/bootFailure.test.ts`).
- Prefer `toMatchInlineSnapshot` on `screen.dump()` for a whole page, and `toEqual` on `half()` rows when only part of a
  page matters. Snapshots are text, so the diff in review is the diff of the screen.
- Special glyphs stay as the code points the font maps them to (docs/architecture.md, UI 3). Copy them from the
  failure output rather than typing them.
- The cursor and the blink phase change the mask. If a test is flaky on `B` or `F` cells, assert text only, or read the
  whole cycle with `blinkCycle`.
- **Canvas pages** (NAV 5, Super NAV 5, APT 3 draw maps): `canvasToAscii(el)` returns the pixels as `#` and `.`. Snapshot
  it with `toMatchInlineSnapshot` as `test/render/harness/canvas.test.ts` does for a tiny canvas. For a map that is too
  large to read inline, `toMatchFileSnapshot('./__snapshots__/name.txt')` keeps it in a file. `downsampled()`
  (`render/canvas.ts`) turns the output of `canvasToAscii` into one character per block of four pixels, the size the
  maps draw in, which makes a map file snapshot readable. `recordMap(names)` (`render/mapRecorder.ts`), installed before
  the boot, records per redraw what NAV 5, Super NAV 5 and APT 3 draw: `drawn` lists the symbols, labels and flight plan
  lines of the last complete redraw by point, `pixels` the symbols by pixel, and `reset()` forgets the frame. A point is
  named after the entry of `names` it equals, so pass the facilities of the test. The spies pass every call on, so the
  canvas still draws. It records symbols, labels and straight lines (`icon`, `label`, `line`, `arrow`, `plain`); the
  arcs of a DME arc leg (`drawArc`, `drawArcWithArrow`) are not recorded, so read them from the canvas.
- `Screen` skips `<canvas>` subtrees (their fallback text). It throws on Super NAV 5, a `SevenLinePage` made of
  CSS-positioned `<pre>` blocks: use `SuperNav5.read()` (`render/superNav5.ts`), which returns
  `{left, msg, range, right, directTo}`. `right` and `directTo` are `null` while hidden (the right cursor and the pulled
  scan knob show them). `SuperNav5.read()` has no mask, so `SuperNav5.focused()` returns the text of the inverted run(s)
  of the left column, which is the field the left cursor is on (`[]` with the cursor off): the msg prompt, which is
  inverted while a message is unread, is left out, the range selector that shares its overlay is not, and no-break
  spaces come back as blanks.
- **`showSuperNav5(unit, {waitMs})`** (`render/superNav5.ts`) is the sequence that reaches Super NAV 5 (the right side to
  NAV 4 first, the left side to NAV 5, the last click with `inner('R', 1)`), waits (default one second) and throws with
  the screen unless `unit.overlay()` is the `SuperNav5Page`: a click that a page refused would otherwise leave the
  test reading another page. `superNav5OnLeg({westNm, rightNm?, groundspeedKt?, storage?, magvar?})` boots in
  `legWorld()` on the leg to KDDD and shows it, and `superNav5OnArc({storage?, magvar?})` boots on the arc of
  `arcWorld()` with the approach loaded and shows it.
- **Pages that show the version** (STA 3) carry the placeholder of `kln90b/Version.ts` in tests, 18 cells wide, which
  `Screen` rightly refuses to read. Mock the module in the test file, as `selectPage.test.ts` does.

## Flight

A flight test boots the unit with an aircraft in a world, then flies on simulated time.

```ts
const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
const flight = await Flight.start({world, aircraft: {lat, lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1}});
await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);
await flight.flyUntil(() => flight.nav.activeIdent === 'ABC', {timeout: 30, description: 'ABC active'});
```

(`test/flight/flights/firstFlight.test.ts`, the proof flight.)

- **`World`** holds the facilities and the magnetic variation. Idents must be unique within a world, and must differ from
  those of the default navdata (section 3), which `Flight.start` adds like `bootUnit`.
- **`Flight.start(opts)`** boots the unit, starts the aircraft and flies until the GPS has a solution. Call it inside a
  test, because it registers `onTestFailed`. Besides `world` and `aircraft` it takes `aircraftOptions` (roll rate,
  maximum bank), `pilot`, and the `BootOptions` that make sense in flight (`storage`, `panelXml`, `engineRunning`,
  `start`, `seed`, `atcModel`, `coldGps`, `efb`, `platform`, `defaultNavdata`). Airspaces are not a boot option here: they come from
  `World.addAirspace()`, and the facilities, position, altitude and magnetic variation from the world and the aircraft.
- **Aircraft** (`flight/Aircraft.ts`): a point mass with constant ground speed and altitude, coordinated turns and a
  roll rate. No wind. It writes the SimVars the unit reads, 16 times per simulated second.
- **Pilots** (`flight/pilots.ts`): the default `coupledAutopilot()` banks as `L:KLN90B_RollCommand` says (positive
  left). `ManualPilot` lets the test set the bank, for example to leave the course on purpose. `scriptedPath(points)`
  flies direct to each point independent of the unit.
- **`fly(seconds)`** runs every tick for that long. **`flyUntil(predicate, {timeout, description})`** advances in 250 ms
  steps (one display tick) and throws with the screen dump when the timeout passes. Both throw if a monitor failed.
- **`jump(target)`** skips ahead without running the ticks in between: `nmBefore('ABC', 10)` or `minutes(5)`. Caveats:
    - Integrated values (flight timer, fuel) miss the jumped time.
    - It guards only the active waypoint: it refuses to cross it or to end closer than 3 NM, but it does not know about
      later waypoints.
    - Monitors do not run across the skipped span.
    - It flies one normal second afterwards, so the unit sees the new position.
- **`flight.nav`** is a typed view of the navigation state (`activeIdent`, `distNm`, `dtkTrue`, `xtkNm`, `toFrom`,
  `mode`, `waypointAlert`, `xtkScale`). `flight.sim` reads and writes SimVars, `flight.screen` reads the screen and
  `flight.t` is the simulated time in seconds.
- **`flight.panel`** (`flight/FrontPanel.ts`) is the front panel driven through the same H events an aircraft sends.
  A render test that boots with `bootUnit` gets the same panel as `unit.panel`.
    - Raw events: `press(evt)`, `outer(side, clicks)`, `inner(side, clicks)`, `cursor(side)`, `ent()`, `clr()`, `dct()`,
      `msg()`, `alt()`, `scan()`, `power()`. Each click advances one display tick so the screen shows its result.
    - `selectPage(side, 'FPL 0')` turns the outer knob the shorter way round the page groups (`PAGE_GROUPS`) and the
      inner knob the shorter way round the pages of the group (`PAGE_CYCLES`; the knob wraps, and `SET 0` is the last
      `SET` page, so it is one click backward from `SET 1`). Page names are those of the status line (`FPL10`, `SET 0`,
      `D/T 1`, `REF`, `INT`); a page with sub-pages shows `APT+3` and still matches `APT 3`. The cursor on that side must
      be off. A test of the harness walks the real page trees and checks `PAGE_GROUPS` and `PAGE_CYCLES` against them.
      `selectPage` cannot end on Super NAV 5, and the shorter way can pass `NAV 5` on either side. Super NAV 5 (both
      sides on `NAV 5`) hides the status line that `selectPage` reads. So select the side whose way passes `NAV 5`
      first, and reach Super NAV 5 itself by selecting the page before it and turning the last click with `inner`, as
      `test/render/harness/superNav5.test.ts` does. A bare group name (`'ACT'`, `'VOR'`: three characters) ends on
      whichever page of the group shows, because the ACT page of an active airport has pages `ACT 1` to `ACT 8` and none
      of them is named `ACT`. APT 7 is reached backward from APT 8, so with SIDs and STARs it lands on the STAR page
      (its last sub-page); to see the SID page select APT 6 and turn the inner knob forward.
    - `enterIdent(side, ident)` types with the knobs and does not press ENT. In an editor (FPL, DIR) a short ident is
      followed by a blank, so `KAA` stays `KAA` and does not autocomplete to `KAAA`. In a waypoint selector (the APT,
      VOR, NDB, INT and SUP pages: the focused run is one cell) it steps through the characters, and throws if the ident
      is longer than the selector. Each knob click on a character starts a search, so when the last character already
      shows the wanted letter (a fresh VOR page showing `ABC SOUTH`, entering `ABC`) it turns that character one click
      away and one back, as a pilot would, and the search runs for exactly the typed ident. In an editor whose first
      character already shows the wanted letter (the VNAV waypoint `ABC` of NAV 4, entering `AAA`) no click has started
      the edit, and the outer knob would leave the field, so `enterIdent` clicks once to start it. `type(side, text)` is
      the keyboard alternative that types the same characters.
    - `focused(side)` returns the one focused field `{row, col, text}`. Two runs of inverted cells that one plain `.`
      separates are one field: the NDB frequency and DIS editors invert their digits and not their point, so the DIS
      field of the INT page reads `___._`. The real cursor covers the point, so the plain point is a bug (#302,
      section 6).
      `cursorTo(side, 'USER POS?')` turns the outer knob until that field has the cursor, stepping over the cursor
      positions that focus nothing (the SUP page without user waypoints has one after the ident characters) and throwing
      with the screen after `maxClicks`. It throws at once when the status field of that side shows a page name, which
      means the cursor is off: the outer knob would turn the pages and the search would end on another page.
      `appendToFpl0(idents)` enters and confirms idents on FPL 0.
    - `readMessages(max = 10)` opens the MSG page and presses MSG until it closes (3-16: the status line's left field is
      empty while the page shows), then waits a second so that the one-time messages that were read go. It returns the
      non-blank rows of every MSG page seen, each trimmed and newest message first, and throws with the screen when the
      page is still open after `max` presses. The loop is the point: a test that presses MSG a fixed number of times
      leaves the page open, or closes it before the last message, without saying so.
    - `directTo(ident, {waitMs})` enters a Direct To the way a pilot does (3-28): D->, the ident on the left, ENT on the
      waypoint page, ENT to approve, then `waitMs` (default one second, one calculation tick) so that the active
      waypoint has changed when it returns.
    - `show(side, name, {waitMs})` selects a page, waits (default one second) and returns the six rows of that side. Use
      it where a test reads a page that a calculation tick has to fill.
    - `confirmSet1AndReselect()` is CONFIRM?, ENT, then SET 2 and back to SET 1, so that the page is built anew and reads
      the GPS again, which shows what CONFIRM? committed.
    - `enterDate(side, day, month, [tens, units])` enters a date in the open date editor with the cursor on the day: the
      first click opens the editor with day 01, the first click on the dashed month gives JAN and on a dashed year
      digit 0, so the day takes `day` clicks, the month `month` clicks and a year digit its value plus one. It is the
      date sequence of the SET 2 and CAL 7 tests for either side.
    - Power: `powerOff()`, `powerOn()`, `powerCycle({offSeconds})` and `approveSelfTest()`. After boot every power-on runs
      the welcome page (17 s) and the self-test, also on an engine-running unit; `approveSelfTest` presses ENT on
      `APPROVE?` and on `ACKNOWLEDGE?`, and throws with the screen at the VFR only page or the OBS warning. A unit
      booted with `engineRunning: false` is dark until `powerOn()`. OBS mode set with `obsMode()` is forgotten over a power
      cycle. The OBS warning appears only with the external GPS CRS switch option (`LegObsSwitchInstalled`) and
      `GPS OBS ACTIVE` set to true; `approveSelfTest({allowObsWarning: true})` then waits until the switch is back.
    - `obsMode()` enters ENR-OBS from MOD 2 (the unit needs an active waypoint).
- **Monitors:** `flight.monitor(name, check)` adds a check that runs once per simulated second and returns `true` or a
  description of what is wrong. Built-in monitors fail the test on an error published to the bus, a SimVar unit error,
  any `console.error` and a non-finite GPS output. The `console.error` wrapper that counts is removed again when the
  test finishes, so a file may hold several flights. A monitor sees whole seconds only, so a transient shorter than a
  second can slip through.
- **The recorder** keeps one row per simulated second (position, track, bank, `nav`, a few SimVars and the screen text).
  When a flight test fails, it writes `test/flight/__output__/<test name>.jsonl` and `.kml`. Open the KML in Google Earth
  to see the track against the waypoints, and the JSONL to see what the unit showed at each second.
- **Display versus calculation:** both ticks fall due together once a second. Under the fake timers the calculation runs
  first at that shared second (the timer that fired longest ago goes first), so the screen is normally current at once;
  a display tick that ran before the calculation would show the previous second's. Before asserting on the screen
  against `flight.nav`, call `await flight.syncDisplay()`: it flies display ticks until one passed without a
  calculation tick, so the screen shows the latest calculation. It recognizes a calculation tick by DIS to the active
  waypoint changing, so it needs a moving aircraft and an active waypoint. It throws when DIS changed in every display
  tick.
- **`flight.flyUntilActive(ident, {timeout})`** is `flyUntil` for the active waypoint becoming `ident`. The timeout error
  names `"<ident> active"` and carries the screen dump.
- **Geometry for expectations** (`flight/geo.ts`, written from the textbook, independent of the SDK): `distanceNm`,
  `courseDeg` and `finalCourseDeg`, plus
    - `angleDiff(a, b)`, the signed `a - b` in (-180, 180], and `angleBetween(a, b)`, the absolute difference in
      0 to 180 where a null course (no DTK) counts as 180;
    - `pointFrom(p, bearingTrue, nm)`, the point `nm` from `p` on a course, and `pointBefore(from, to, nm)`, the point
      `nm` before `to` on the great circle from `from`. They agree with `distanceNm` and `courseDeg` to 1e-6, so use
      them to place an aircraft before a waypoint instead of the SDK's `GeoPoint.offset`. The standard world
      (`standardRoute()`, section 3) is the usual input;
    - `crossTrackNm(position, through, courseTrue)`, the spherical cross-track distance of `position` from the great
      circle through `through` on the true course `courseTrue`: signed, positive right of the course, and measured
      against the whole great circle, so a position behind `through` counts the same way. Use it for every XTK
      expectation instead of writing the formula out in a test; the unit's own XTK agrees with it to 1e-11.

### Worked example: the proof flight

`firstFlight.test.ts` flies KAAA, ABC, KBBB with the coupled autopilot and checks, with expectations derived from
`flight/geo.ts` and the manual rather than from the instrument:

- The turn starts 0.2 to 0.45 NM before ABC. The lower bound is the distance a turn through the course change needs,
  taken from the standard-rate radius at 120 kt; the upper bound leaves room for the roll-in and one calculation tick.
- The unit switches DTK and XTK at the start of the turn but sequences at the closest approach to the waypoint (4-8), so
  sequencing is checked separately, below 0.1 NM.
- The waypoint alert comes on about 20 s before the turn (`WPT_ALERT_WITH_TURN_ANTI`) and stays on through it.
- Right after `jump(nmBefore('KBBB', 10))`, the navigation model's DIS matches the independent great-circle distance to
  KBBB. At 5 NM to go, both the model's DIS and the SimVar `GPS WP DISTANCE` match it. Both checks use 0.04 NM, one
  calculation tick at 120 kt. The NAV 1 page's DIS row is then compared with the model's calculated distance.

`turnDirection.test.ts` shows how to pin a bug that needs a flight: one test flies and records, a second `it.fails`
judges the recording, so a broken flight cannot be mistaken for the bug.

# 5. Conventions

- **Two kinds of tests, labeled differently.** A *spec test* states what the real unit does: it cites the manual page
  and derives its expected value independently (the next two bullets). A *characterization test* pins what the code
  does today, typically a page snapshot, and claims nothing about the real unit. Characterization tests are allowed
  where no spec is at hand, but the word `characterization` must appear in the `describe` or `it` title
  (`describe('NAV 3 page (characterization)', …)`), so that `grep characterization test/` lists every test that is not
  evidence of correctness. A characterization test carries no manual citation, and a `describe` titled with a manual
  page holds spec tests only. When the code and the manual disagree, the test asserts the manual and is pinned as a
  known bug (below); a snapshot never freezes a visible bug as correct: a row that shows a bug is left out of the
  snapshot, or the bug is pinned in a test of its own.
- **Public-contract tests are spec tests whose source is the contract.** Tests of the public contract with aircraft (H
  events, LVars, panel.xml keys, GPS SimVars) and of the persisted-data formats (setting keys, the V1/V2 waypoint and
  flight-plan strings) have no manual page behind them. They need neither a manual citation nor the word
  `characterization`; they cite their source in a comment instead: `CLAUDE.md` "Public contract with aircraft", the doc
  comments in `HEvents.ts` and `LVars.ts`, or the formats in `docs/architecture.md` (Core 7). The tests of
  `PowerButton.test.ts` and `BrightnessManager.test.ts` are the examples.
- **Cite the manual page behind an expectation** in a comment (`// 4-8: ...`), the same as in the code. A test is a
  statement of the real unit's behavior, and the page is the evidence.
- **Which evidence decides.** The KLN 90B Pilot's Guide and its figures win. Where the guide is silent, a check on the
  KLN 89 trainer decides, cited as "checked in the KLN 89 trainer, *date*" (section 8). The 89 is a different unit:
  behavior that exists only there (its block layout of some fields, its own texts, what follows from its single knob
  pair) never becomes a pin, and a test takes from it a wrap, a stop or a padding, not a layout. A photo of a real unit
  or a video counts when the test names it; the third-party AVsoftech KLN 90B trainer does not count.
- **A throw on input is a bug.** The real unit never answers a key or a knob with an error, so a test that sees one on
  the error page or as a rejection pins it as a bug and never characterizes it.
- **Derive expected values independently.** Never compute the expectation with the function under test or with the
  SDK's flavor of the same formula. `flight/geo.ts` is a haversine written from the textbook; its earth radius is the
  sphere of the SDK's `UnitType.GA_RADIAN` (`6378100 / 1852` NM), which the instrument computes on, so the numbers
  agree while the formulas stay independent. Prefer literals, and derive bounds from physics where a literal would be a
  guess (the turn-start bounds above).
- **Independent physical or published sources are valid spec sources** when the test names them in a comment, next to
  the manual page where one exists: the ICAO standard atmosphere computed by hand (`Conversions.test.ts`), the wind
  triangle as a vector sum (`Wind.test.ts`), the USNO almanac with its URL (`Sun.test.ts`). The code's own source never
  is: `Conversions.ts` and `Wind.ts` follow avform, and an expectation computed from avform restates the code.
- **Pin known bugs with `it.fails('... (#NN)')`.** The test states the correct behavior, fails today, and turns red when
  someone fixes the bug, which is the signal to remove `.fails`. Reference the GitHub issue. See `KLNNavmath.test.ts`
  (#97), `UserWaypointV2.test.ts` (#98) and `turnDirection.test.ts` (#100).
- **Prove a pin by fixing the bug, and keep heavy setup out of it.** An `it.fails` test passes on *any* failure, so a
  broken precondition inside it (a boot that threw, a wrong key sequence) is invisible: the pin stays green for the
  wrong reason. Prove a pin by fixing the bug temporarily and seeing the test turn red, then restore. Where it is cheap,
  keep the heavy preconditions in a sibling test that passes today and asserts them, so that a broken setup fails
  there; `turnDirection.test.ts` is the pattern.
- **Keep runs deterministic.** The harness fixes the clock and the random seed. Do not read the wall clock in an
  assertion (`performance.now` is the wall clock, because the fake clock does not fake it).
- **Never commit manual content or navdata recorded from the sim.** The manuals are copyrighted: cite page numbers,
  paraphrase, and do not paste text, tables or screens from them. Facilities in tests are invented (`KAAA`, `ABC`).
  Screen snapshots of your own render of the instrument are fine.
- **A harness extension needs several users.** A helper goes into `test/harness/` when several tests need it, with a
  harness test of its own and a paragraph in section 4. A gap that serves one test is listed in section 9 instead, and
  the test works around it. When a helper is added, the tests that carry a copy move onto it and keep their
  assertions; a copy stays only where the helper would change what the test asserts.
- **A behavior change comes with a test** at the cheapest stage that can observe it. A bug fix starts with a test that
  fails for the bug.
- **Verify a new test by breaking its subject on purpose** and confirming it fails, then restore the code and check
  that `git diff` shows only the intended changes. For a regression test the break is the original bug: reintroduce it
  in the working tree, by hand when the old commit's diff no longer applies. Never commit the broken state. A test
  that stays green under the break is not a test of that behavior; fix the test, not the record. Permissive
  assertions (`toBeDefined`, `length > 0`, a bare `not.toThrow`) survive almost any break, so use them only for a
  deliberate "accepts every event without an error" sweep, and say so in the test name.

# 6. Limitations

- **happy-dom is not Coherent GT.** There is no layout, no CSS rendering and no glow. A test cannot see overlap,
  clipping or a font problem in the sim. Skia's text pixels also differ from the sim's, so canvas snapshots hold the
  instrument's own drawing, not a pixel-exact copy of what the sim shows.
- **The navdata is synthetic, and some of its rules are inferred.** The facilities, airspaces and procedures are
  invented (section 3). The fake follows two rules, one inferred and one quoted: the nearest airspace search selects
  by bounding box (inferred from a comment in `NearestUtils.getAirspaces`, not observed in the sim), and the nearest
  filters let an airport without runways pass the surface and length filters (the sim developers' rule, quoted to the
  maintainer from their code). A test that passes against the fake proves the instrument's use of those rules, not that
  the sim applies them.
  The instrument itself ignores circular airspaces (`BoundaryUtils`, #209); `circularAirspace()` exists to hold that
  gap.
- **The fake navdata is looser than the sim in two ways that hide bugs.** `MemoryFacilityClient` hands out one
  `IcaoValue` object per facility, the same in search results, in the nearest `added` and `removed` lists and in
  `getFacility`; the sim answers with new objects each time. Code that compares ICAOs by reference instead of with
  `ICAO.valueEquals` therefore passes against the fake: `6a6c634` fixed such a bug in `Scanlist`, and the removal in
  `NearestList.ts:89` would be the next (a break there survives the suite). The fake's `getFacility` also ignores its
  type argument and looks up by ICAO alone, so the type that `KLNFacilityLoader.getFacilities` passes down cannot be
  observed. Section 9 has the options.
- **One fact about real procedures came from a navigation database queried locally and is not committed.** The pattern
  `AF, CI (no fix), AF` around one navaid with two radii, which `SidStar` merges into one arc (#131), was found in an
  AIRAC 2607 export (five STARs). No row of it is in the repo (section 5 forbids recorded navdata), and the sim's own
  representation of the CI legs was not checked: the invented procedure of the pin in `SidStar.test.ts` is built from the
  pattern, not from the data.
- **There is no wind.** Ground speed and track equal airspeed and heading, so crosswind effects are not modeled.
- **`jump` skips integrated values**, and monitors and the recorder sample once per simulated second.
- **The 16 Hz loops** run every 62 ms in tests: the fake timers round the 62.5 ms interval down to whole milliseconds.
  The aircraft integrates the time that really passed, but the instrument's own 16 Hz signal loop (the XTK output
  filter) also runs at that rate, which matters for any future test of filter timing.
- **The XTK output filter overshoots a step** (#158): after the XTK jumps (a sequencing, a direct-to, an OBS course
  change, the self-test) `GPS WP CROSS TRK` runs on to about twice the step one second later and settles a second after
  that. An XTK output read right after a step therefore depends on the tick phase. Read the output once it has settled
  (the self-test test in `NavCalculator.test.ts` reads it 30 s in), read `navPage.xtkToActive` instead, or test the
  filter itself at the unit stage, as `test/unit/services/SignalOutputFilter.test.ts` does: only `Date` is faked
  (`vi.useFakeTimers({toFake: ['Date']})`), a value is set every 1000 ms and the output sampled every 62 ms.
- **A booted engine-running unit starts with the MSG annunciator lit.** Empty storage means the last position is 0/0, so
  `POSITION DIFFERS FROM LAST POSITION BY >2NM` posts; that is a fact of the harness, and the NAV 2 screens of the
  harness tests show its `msg`. Seeding a last position in `storage` (`lastLatitude`, `lastLongitude`) removes it. The
  second message of such a boot, `SYSTEM TIME UPDATED TO GPS TIME`, is a bug (#328): the GPS clock starts an hour
  behind and `forceReadyToUse` never adds the hour back, so it posts on every engine-running boot whatever `storage`
  holds (pinned in `GpsAcquisition.test.ts`). A test that needs a message in the live list as a guard (that the list is
  read at all) uses `POSITION DIFFERS` with empty storage, or posts a message of its own with
  `unit.props.messageHandler.addMessage(new OneTimeMessage([...]))` when its storage holds the position
  (`Set1Page.test.ts`); it never relies on SYSTEM TIME UPDATED, which a fix of #328 removes.
- **Long render tests need their own timeout.** The render stage keeps Vitest's 5 s default. A test that advances
  minutes of simulated time with every tick running can pass alone and time out while other suites load the machine,
  which makes a mutation run report a false kill. Give such a test a per-test timeout (the CAL 6 tests in
  `VolatileMemory.test.ts`).
- **One live unit per test.** `bootUnit` refuses a second boot in the same test, because the singletons allow one unit
  at a time. A singleton the teardown does not know shows up as a test that passes alone and fails in its file.
- **SDK upgrades may require updating the fakes.** `FakeSim` mirrors the native layer the SDK builds on, and
  `KLNGPSSatComputer` reaches into private SDK internals (docs/architecture.md, Core 3); recheck both, and run the whole
  suite, after upgrading `@microsoft/msfs-sdk`. `KLNGPSSatComputer` (`Gps.ts`) reads `activeSimulationContext.channels`
  and the computer's own private `lastAlamanacTime`. It also reads `this.simTime` and `this.distanceFromLastKnownPos`
  through `as any`: both were fields of the computer until SDK 2.3.3 moved them to `activeSimulationContext.time` and
  `activeSimulationContext.distanceFromLastKnownPos`, which no type error reports (#211; three pins hold it). After an
  upgrade run `test/render/GpsAcquisition.test.ts` first. The harness also relies on these SDK
  internals, and after an upgrade a change in one of them shows up as a confusing harness error, not as a named check:
    - the boundary search: `NearestLodBoundarySearchSession` builds its `LodBoundary` objects in a throttled queue on
      `requestAnimationFrame` (the airspace tests advance the fake clock for it), and a facility with `lods: []` makes
      LOD 0 the exact ring (`navdata/airspaces.ts`);
    - the singletons `resetSingletons` clears by name (`singletons.ts`): `DefaultLodBoundaryCache.INSTANCE` and the
      private `FlightPlanner.instances` map, which it checks is a `Map`;
    - the EFB route: `FakeRouteManager` copies the members of `FlightPlanRouteManager` that `KlnEfbLoader` and
      `KlnEfbSaver` use (`syncedAvionicsRoute`, `avionicsRouteRequested`, `replyToAvionicsRouteRequest`), and `efbRoute`
      builds routes with `FlightPlanRouteUtils.emptyRoute()` and `emptyEnrouteLeg()`.
- **STA 5 cannot be tested as it is.** `Sta5Page` builds its own `GPSSatComputer` with the sync role `'primary'`, and
  that computer never finishes `init()` in the harness: the `SharedGlobal` a primary creates never resolves, so the
  page shows `Searching` at every offset. A probe with the role `'none'` runs, which is also the suggested fix of the
  prediction bug #214; whether the primary role works in the sim is part of that issue's sim check.
- **TypeScript 6 no longer includes `@types` automatically.** Harness files that use Node APIs carry
  `/// <reference types="node" />`. The directive makes the Node types available to the whole `tsc` program, because the
  `include` of the root `tsconfig.json` compiles `kln90b/` and `test/` together; it does not keep Node APIs out of the
  code in `kln90b/`, so `tsc` will not catch an accidental Node call there.
- **Errors thrown on the ENT path do not reach the error page.** `MainPage` starts `handleEnter` without awaiting it,
  so a throw is an unhandled rejection, not an `error` event (the exception handling of ticks and synchronous input
  does not see it; #118 asks whether that is intended). The harness collects the rejection and fails the test that
  leaves one untaken (section 3), so a broken ENT is no longer silent. A test that provokes one takes it with
  `unit.takeRejections()` (section 4).
- **The harness collects `console.error` but does not fail on it.** `unit.consoleErrors` holds every call, and only
  `Flight` fails on one (its `no console.error` monitor, which also counts the boot). A render or unit test that must
  not log asserts that the list is empty.
- **`selectPage` cannot end on Super NAV 5**, and a way that passes `NAV 5` on one side while the other side shows
  `NAV 5` is a hazard too: Super NAV 5 hides the status line the helper reads (section 4).
- **`selectPage` runs the pages it passes.** Each page on the way is built and runs its side effects: on the way from
  CAL 1 to CAL 3 the unit shows CAL 2, which overwrites the CAL 3 TAS (#33), so a CAL 3 test enters its TAS with the
  knobs after arriving; the TRI pages read their fields from `unit.props.memory.triPage` when they are built, so a test
  seeds the memory first and selects the page after.
- **`selectPage` throws once a row overflows**, because it reads the screen after every click, and `Screen.read()`
  throws on a character past column 11 (below). A pin of an overflow (a distance that rounds up to its cutoff) selects
  its page first, then moves the aircraft into the overflow, and its sibling reads the raw row with `readRows`
  (`Nav1Page.test.ts`, `Nav3Page.test.ts`).
- **The fuel computer reads `NUMBER OF ENGINES` once, while it is built.** A test without the `simVars` option
  (section 4) counts no real engine and sees every fuel flow and every fuel used as 0. The pages that show them exist
  only with the matching interfaces: OTH 5 to OTH 8 with the fuel computer and OTH 9 and OTH 10 with the air data
  computer (`PageTreeController` removes them otherwise), so their tests boot with both the panel.xml and the SimVar.
- **A bus subscription added after boot is called at once with the last cached value.** A test that subscribes to a
  topic and expects to see only new events must skip that first call (or count from a reference taken after
  subscribing).
- **`Screen.read()` throws on a visible character, or an inverted cell, past column 11 of a half page.** That is how
  the ACT page with an active index shows the type letter of an NDB (#115). Blank cells past the edge, such as the
  trailing blanks of the nearest selector on APT 1 and VOR, are tolerated. A test that pins #115 reads the half page's
  DOM with `readRows`.
- **A booted engine-running unit has a GPS fix at once**, in the slow acquisition mode too (the force-ready start calls
  `acquireAndUseSatellites()` in `WelcomePage`). A test that needs an invalid GPS, for example to enter the date on SET 2
  (read-only with a fix), boots with `coldGps: true`.
- **`ActiveWaypoint` replaces its `turnStack` array** (`clearTurnStack`) instead of emptying it. A reference captured once
  goes stale and can read as empty or unchanged while the unit has pushed turns; read `activeWaypoint.turnStack` through
  the property each time.
- **`AudioGenerator` is observed at the bus level.** The SDK `SoundServer` reads `window` when it is built, so the tests
  run at the render stage, give the generator its own `EventBus` and listen on the topic `sound_server_play_sound`, the
  unit's request for a tone (`test/render/services/AudioGenerator.test.ts`). The `PLAY_INSTRUMENT_SOUND` call itself is
  not seen: the SDK server makes it only in the in-game state (a `gamestate` attribute on `document.body`), and its own
  sound-end handling needs a `Name_Z` global, neither of which the harness provides (section 9). The tests report the
  end of a tone by calling `AudioGenerator.onSoundEnd` themselves, as `KLN90B.onSoundEnd` does in the sim.
- **APT 6 cannot show real service data.** The sim's facilities carry no fuel, oxygen or fee data, so `Apt6Page` shows
  its fixed texts (`NO FUEL`, `NO OXYGEN`, `NO FEE INFO`; `formatFuel` says the fuel fields are always empty). The APT 6
  snapshot holds those texts, and no test can show the page with services.
- **The IAF list of APT 8 and ACT 8 is placed by the reader, not by layout.** happy-dom computes no CSS positions, so
  `Screen.read()` moves the rows of `.apt-8-iaf-list` by a fixed four cells (section 3). A change of the list's position
  in `KLN90B.scss` would not show in a test; the reader only throws when the list no longer starts in cell 4.
- **The NDB frequency and DIS editors do not invert their decimal point, which is a bug (#302).**
  `NdbFreqEditor` and `DistanceEditor` (the NDB frequency and the INT and SUP DIS field) draw the point as plain text,
  while `VorFreqEditor` and `RadialEditor` invert theirs. Figure 5-74 (5-19) shows the open DIS field as one inverse
  block with the point inside, like the RAD field of figures 5-72 and 5-73; no figure shows the cursor in the NDB
  frequency, so its pin extends them. `focused()` and `cursorTo` still join two runs across one plain point
  (section 4) until the bug is fixed, and then `FrontPanel.joinAcrossPoint` can go. The mask assertion of the DIS
  field is the pin `covers the decimal point of the DIS field` in `test/render/harness/focused.test.ts`; no snapshot
  may hold the plain point (section 5).
- **A class with no visible effect is invisible to the reader.** `Screen` follows the CSS (section 3), so an
  `inverted-blink` left on a cell without `inverted` reads as a plain cell, as it renders. A control that forgets to
  remove the class (the cell under the cursor after the cursor is turned off, for example) passes every mask assertion
  until another class makes the leftover visible; only the page tests that read the row next to it catch such a slip.
- **The editor's autocompletion depends on the fake's search order.** `WaypointEditor.onCharChanged` asks the facility
  search for one result, and `KLNFacilityLoader` sorts only what it got, so "digits before letters" (3-21) holds because
  `MemoryFacilityClient` returns sorted results. Whether the sim returns them in that order is not known (section 9);
  the selectors sort a hundred results themselves and do not depend on it.
- **`FakeCoherent.on`, `off` and `trigger` are no-ops.** The keyboard tests focus the input by hand; a test cannot see
  `FOCUS_INPUT_FIELD` or `UNFOCUS_INPUT_FIELD`, nor emit `mousePressOutsideView`, so the click outside the instrument
  and the unfocus of `PageContainer.destroy` have no test.
- **Some editor code cannot be reached in a booted unit.** The NDB frequency range (190 to 1750 kHz) waits behind #277,
  which refuses every entry; the tenth of `RadialEditor.convertFromValue` is never shown on its own, because every
  radial a page shows meets #281; the null branch of `TimeEditor.convertToValue` needs a host without a time, and SET 2
  always has one while STA 5 cannot run (above).
- **The flash rate is CSS.** The harness reads which display tick flashes a cell, not the animation of `.blink` and
  `.inverted-blink` in `KLN90B.scss`; whether FLAG is shown inverse on the real unit is not settled either (figure 3-101
  cannot show it), so the masks of the deviation bars' FLAG row are characterizations.
- **The KLN 89 trainer lays out several fields differently.** Its longitude degrees, radial, date, hours, CAL 3 minutes
  and CAL 7 heading are blocks of two or three digits where the 90B code has single cells. Tests take the 89's behavior
  (a wrap, a stop, a padding) only where the 90B guide is silent and never its block layout (the evidence rule of
  section 5).
- **Fixes the suite cannot hold.** Some past fixes live where the harness does not reach: the glow and refresh of
  popped-out panels (#3); CSS-only changes such as the error screen's font, cut-off buttons and the color of flashing
  editor fields (#11, `7bb08f2`, `88f5620`); the build's injection of the version into `manifest.json` and
  `Version.ts` (#10; the tests never run rollup); the bundler setting that stopped minifying because a minified name
  collided with a Coherent global (#16); the workaround that no longer zeroes the GPS SimVars after a hot swap, because
  the sim crashed (`d3c5230`); the order of the `GPS WP DESIRED TRACK` and track angle error writes, which mattered
  only because the sim overwrote one with the other (`0086363`; `FakeSim` keeps every SimVar apart); and the speed of
  scrolling through long lists (#40; the fake answers at once, while the rewritten cache window is tested). A change
  in any of them shows only in the sim.
- **There is no CI.** Run `npm test` and `npx tsc --noEmit` before committing.

Measured speed (a dated record): on 2026-10-03 the proof flight (`firstFlight.test.ts`) ran about 1466 simulated
seconds in 1.0 to 1.2 s of wall time, roughly 1200 to 1450 times real time, with every tick running. The test prints a
`[flight-speed]` line with `console.warn`; it shows only under `npx vitest run --reporter=verbose`.

# 7. Coverage record

A dated record of 2026-10-10, written when the test baseline was complete. It is true on that date and is not updated;
a later record is added beside it, and new gaps go to section 9. The baseline was built between 2026-10-03 and
2026-10-10 in sessions that each took one area, in the order of the protection they bought: first the regression tests
for past fixes, then the public contract, the navigation core, data and services, navdata, the left pages, the right
pages, the controls, and boot and power, then an audit of the whole suite.

What it means here: a **spec test** cites the Pilot's Guide (or the contract, or an independent source) and derives its
expectation independently; a **characterization** carries the word in its title and claims nothing about the real
unit; a **pin** is an `it.fails` that states the correct behavior of an open bug (section 5). Every test was verified by
breaking its subject; a mutation that survived is listed below or in section 9. Coverage is what ran, not what is
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
  conversion; the user setting keys are pinned. *Untested:* invalid panel.xml values (by decision; the enhancement
  #145), `TakeHomeMode`, the effect of a custom `BasePath` (needs a `FakeXhr` mount), the `Internal_*` events except
  `Internal_Key`, the 5 kt threshold of the roll command, the clamp and boot value of `L:KLN90B_Brightness`
  (undocumented), the planner gate through the runtime LVar `L:KLN90B_WriteGpsSimvars` (#142), temporary (`XY`)
  waypoints round-tripped through storage, the ten-message cap of the flight plan loader and the failing V1 restore.
- **The navigation core** (`data/flightplan/`, `NavCalculator`, `ModeController`, `KLNNavmath`, `FlightplanUtils`,
  `Flightplanloader`). *Spec* (chapters 4 to 6), with expectations from `flight/geo.ts`: DTK and XTK, sequencing at the
  closest approach, turn anticipation and the near-180° turn, the waypoint alert with and without anticipation, the
  GPS-invalid path, LEG and OBS and the OBS synthetic waypoint, the ENR, ARM and APR scaling, the Direct To flows, the
  flight plan bounds, insert and delete and the duplicate waypoint cases. Flights cover the large turn, duplicate
  waypoints, the DME arc, the alert through a turn, the TO/FROM flag and the magnetic track. *Pins and
  characterizations only:* roll steering (the #100 pins, by decision) and the XTK output filter (#158; its step
  response is a unit test). *Untested:* the approach-scale cases and the APR cancel before the FAF (#162, #163; the
  trainer shows neither ARM nor ACTV), the alert questions #146 and #147, ARM GPS APPROACH in a booted unit (only the
  unit stage while #139 stands), the turn circle on a great-circle leg (only the arc case), and the nav-source gate and
  a cold start in a flight (render tests hold both).
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
  offset to a waypoint ahead in FPL 0, and the MSA sampling step (unobservable before #97 is fixed).
- **Settings and persistence** (`settings/`). *Spec, from the formats:* the V1 and V2 loaders and persistors, the
  conversion, the user settings and the panel.xml parser. The format bugs are pinned (#98, #101, #103, #144).
- **The page shell** (`pages/` itself: `MainPage`, `PageManager`, `PageTreeController`, `CursorController`, the segment
  pages, the overlays and the start-up pages). *Spec:* the Turn-On, self-test, Database, VFR-only and OBS warning pages
  and what follows APPROVE?, the overlays and the rule that a pushed page that does not handle a knob is popped (#56,
  from the KLN 89 trainer), the distinct slot classes, group sizes, group memory and five-character page names of the
  page trees, and the cursor stopping at both ends (the code wraps: pinned as #218). *Characterization only:* the
  `FiveSegmentPage` SCAN and ENT order. *Untested:* the `FourSegmentPage` ENT order (by decision) and `TakehomePage`.
- **The left pages** (`pages/left/`). Every page has a render test and a characterization snapshot, in tree order from
  NAV 1 to the self-test page, with spec tests where the Pilot's Guide or the KLN 89 trainer gives the rule. *Without a
  spec test:* OTH 1 (the sim has no FSS data), SET 10 (the page is the project's own, #46), STA 2 and STA 3; STA 5
  shows only its defaults before a prediction (#214). Super NAV 5 is read through `SuperNav5.read()`, and the NAV 5 and
  Super NAV 5 maps through the map recorder and file snapshots. *Untested:* weather, terrain and SUA on the maps (no
  code path), the ESA along the route (needs a non-flat MSA grid), take-home on SET 1 and the TRI pages, and SET 1
  CONFIRM? for a faster first fix (the harness acquisition ignores the position).
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
  it), the NDB frequency range (behind #277), the tenth of `RadialEditor.convertFromValue` (every shown radial meets
  #281), the null branch of `TimeEditor.convertToValue`, the focus events and the click outside the instrument
  (`FakeCoherent`), and the CSS flash rate.
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
  repository VORs), #214 (the STA 5 prediction; the harness cannot run the page) and #325 (the empty MSG page; no 90B
  text). #110 is fixed on `master` and closes when that commit reaches GitHub. #213 was first filed without a pin and
  has one since (`Sta1Page.test.ts`). The questions and enhancements the sessions filed carry their labels on GitHub
  and have no pins.
- **The regression triage** covered every closed issue and every bug-fix commit on `master` up to 2026-10-03, and every
  fix that could be observed has a test that failed under the original bug. Three were *not provable*: #20 (closed
  without a fix of its own, and its symptom is an autopilot turn in the sim), part (d) of `7fd640e` (the canvas is
  identical before and after) and the `fill([])` array of `133f4d8` (#102). Two fixes are held only in part: the
  `WaypointEditor.isEnterAccepted` half of #72 (`3977549`) and the second half of `d3228dd` (`Scanlist.invalidateCache`
  keeping `lastIcao`). The superseded rows were confirmed: the AIRAC last-day boundary of `6ed57d9` is held on the SDK
  utilities that replaced it (`Database.test.ts`), and the cache window that #40 rewrote is held by
  `Scanlist.test.ts`, whose long lists pin #201. The fixes that no test can hold are in section 6.

# 8. Trainer record

A dated record of the checks made on the KLN 89 trainer while the baseline was built; it is not updated. The trainer
runs in a virtual machine that the maintainer starts. Each check is paraphrased, with its confidence where it was not
high and the issue it led to. The 89 has one knob pair, a four-line screen and its own layout, so section 5 decides
how far a check counts for the 90B.

A test cites a check as "checked in the KLN 89 trainer, *date*", and the checks of 2026-10-08 and 2026-10-09 by id as
well (`T4`). The two days have separate series that both start at T1, so a `T<n>` is read together with the date on
its line, in the comment above it or in the title of its `describe`.

**2026-10-06**
- With turn anticipation on, a waypoint passed about 3.5 NM abeam at 240 kt was sequenced (#157).
- After a Direct To a waypoint of FPL 0, inserting a waypoint in front of the target kept the Direct To on the target
  at its new index (#149).
- Right after power-up, D-> prefilled the active waypoint from a waypoint page and from NAV 1 (#119).
- OBS to LEG on the FROM side re-activated the plan leg with its DTK and kept the deviation, TO (#155); LEG to OBS on a
  short leg took the DTK and kept the deviation.
- The approach modes cannot be observed: ARM and ACTV are external annunciators the trainer does not draw, and its demo
  approach never armed (#162 and #163 stay open).
- VNAV (medium; the trainer recomputes VNAV only when a knob changes a value): with VNAV active, moving the cursor onto
  the vertical speed field changed nothing, while from Inactive the same move starts VNAV; 400 to 500 ft above the path
  VNAV stayed active. At the end of the descent the 89 goes Inactive and resets its inputs, and a new selected altitude
  starts a second VNAV at once, while the 90B code keeps the angle and the waypoint (#194, the comment on #73).
- The third-party AVsoftech KLN 90B trainer, which is unreliable: in APR before the FAF the GPS APR switch gave ARM, and
  APR was back within about 2 s, as in the code (#162).

**2026-10-07**
- The outer knob stops at the first and the last cursor field on FPL 0 and SET 2 and never wraps (#218).
- Scanning from an ident without a match offers no CREATE NEW WPT and scans from the last waypoint the entry matched
  (#202). Approach waypoints do not count against the 89's twenty, and an approach loaded whole without a message
  (#221). Returning to ACT always shows ACT 1, while APT and SET remember their page. NRST APT lists airports within
  200 NM only (#207).
- Durations never show `:60`, the hour rolls over; NAV 1 truncates the ETE to whole minutes (medium-high).
  Coordinates never show `60.00'`; from `59.99'` the next value is the next whole degree. Degrees below 10 are padded
  with blanks, with zeros only inside an open edit field (#230).
- SET 1: after the ident and two ENT the cursor goes straight to `Ok?` (#248); CLR then ENT on the ident has no visible
  effect (medium, #244).
- FPL pages: the waypoint before the active one goes to the top row (medium-high); a full plan has no blank position
  after its last waypoint (#241); approach waypoints are not stored when FPL 0 is copied; the `?` of the delete prompt
  stands in a fixed column after a five-cell ident field.
- OTH: the user waypoint list shows the lowest plan number, `0` for FPL 0, and an arrow at the active waypoint (#253);
  the remarks list is sorted by ident.
- OBS: one degree per click; north shows `000`, never `360`, and the course wraps (#263).
- DUPLICATE WAYPOINT: a header row with the ident and the column titles, then one row per waypoint (#258). A Direct To
  an unknown ident offers the creation of a user waypoint, not `NO SUCH WPT` (#262).
- Radials on the intersection and user waypoint pages are magnetic with the reference VOR's own variation, on display
  and on entry; four published intersections fit within 0.05° (#280, #281). A changed REF recomputes RAD and DIS at
  once (#279); after REF, ENT, ENT the cursor is on RAD (#284); distances are padded with blanks and carry the small
  `nm` (#282, #283); DIS accepts 400.0 and 999.9 (#288).
- The user waypoint page without user waypoints shows `0` and the creation choices without a message; the first click
  on a blank selector cell gives `A` (medium, #290).
- Nearest pages: with the cursor parked on the rank, the page follows the new nearest at rank 1 (#268); distances below
  10 NM show without a leading zero (#266, the 90B figures decide).
- Procedures: CLR on the question that adds a STAR and its airport returns to the waypoint list, and steps back one list
  at a time (#271); the cursor stays on the chosen procedure after CLR (medium, #273); a second approach asks before it
  replaces the first (#274); the cursor starts on the first procedure; an airport whose remark is blanked stays in the
  remarks list.
- NDB frequencies on a whole kHz show without `.0` (medium, #287). On FPL 0 the DTK beside the active waypoint is the
  leg's DTK (#297), a repeated active waypoint has no arrow at its second copy (#294), and the type letter sits in a
  fixed column (medium); ACT with nothing active shows its text and no message (#293).
- Not answerable on the 89: the map page, the fuel efficiency format, the alert values over a power cycle, names with
  words inside words and the APT 7 page order.

**2026-10-08** (the series T1 to T35)
- **T1:** the outer knob stops at the first and the last cell of an open edit, and the edit stays open (#306).
- **T2:** CLR during an open edit brings the old value back, the cursor stays on the field, and a following ENT does
  nothing (#307).
- **T3:** the cursor button during an open edit turns the cursor off with the old value back.
- **T4:** every cell and block wraps in both directions; calculator values change without ENT.
- **T5:** ENT on a partly filled field counts the dashed cells as 0.
- **T6:** the first inner click of an ident entry gives `A` and the first matching ident (#311).
- **T7:** after the cursor is turned off and on, the 89 comes back on the first field; a note, because 4-3 implies that
  the 90B remembers the field.
- **T8:** the open longitude edit shows the hundreds digit (`E008°`), and the entered value is padded with blanks
  (#304).
- **T9:** the latitude tens offer 0 to 8 only, so 90° cannot be entered (#303).
- **T10:** a radial of 360.0 cannot be entered; the largest is 359.9.
- **T11:** SET 1 gives back the offered and the entered heading unchanged after the confirmation (#309); the ground
  speed is `005` while open and `  5kt` entered (#245).
- **T12:** the remark charset has a hyphen between 9 and the blank (#305), and the first click on an empty remark line
  gives `A` (#311).
- **T13:** the variation tens offer 0 to 9; a manual variation of 0 shows a blank tens place.
- **T14:** the CAL 7 heading is one three-digit block that wraps between 359 and 000 (the layout is the 89's).
- **T15:** the CAL 3 hour wraps from 23 to 00; its minutes are one block (the layout is the 89's).
- **T16:** 993 mB shows with a blank in front (#315).
- **T17:** the seconds restart at 00 after a time entry.
- **T18:** CLR during the FPL 0 confirmation returns to the blank position with the cursor on it, and the next ENT adds
  nothing (#310).
- **T19:** CLR during the Direct To confirmation of a typed ident, then ENT, cancels the Direct To.
- **T20:** duplicate idents on a waypoint page: not done.
- **T21:** on an FPL delete question (a) the outer knob drops the question and moves the cursor on (#317), (b) the
  inner knob opens an entry in front of the waypoint, and (c) after ENT the cursor is on the waypoint that moved up
  (#242).
- **T22:** on the delete question of the user waypoint list (a) a second CLR drops it, (b) the outer knob drops it and
  moves the cursor to the entry above (#317), and (c) the inner knob is ignored (medium).
- **T23:** a scrolled list stays scrolled when the cursor is turned off; the cursor comes back on the top visible entry.
- **T24:** the 89 shows no waypoint page during a deletion (#316 rests on the 90B guide, medium).
- **T25:** the delete question's `?` stands in a fixed column (#318).
- **T26:** CLR twice on the approach header brings CHANGE APR? back and keeps the approach.
- **T27:** the inner knob on the approach header opens an en route entry in front of it.
- **T28:** an insertion in a scrolled FPL 0 leaves the page where it was (medium-high, #319).
- **T29:** with an unseen message on the second MSG page, leaving after the first page keeps the prompt flashing (#191).
- **T30:** MSG without messages shows a page with a one-line text of the 89's own (#325).
- **T31:** the prompt while the MSG page shows cannot be asked; the 89's MSG page covers the whole screen.
- **T32:** the trip calculator shows an ETE below an hour as `0:31` (#324).
- **T33:** an airport below sea level cannot be asked; the trainer's database has none.
- **T34:** a bearing goes from 359 to 0 and never shows 360 (medium-high), padded `  0°` (#263).
- **T35:** a position of exactly zero shows `N` and `E` (#308).

**2026-10-09** (the series T1 to T12)
- **T1:** D-> on the message page shows the Direct page at once and the message page is gone; the field holds the
  active waypoint, or is blank with none. ENT returns to the page before; no nearest airport is involved (#335).
- **T2:** ALT on the message page shows the first altitude page at once; leaving the altitude pages returns to the
  page shown before MSG (#335).
- **T3:** the knobs on the message page close it and act on the page beneath: the outer knob the page group, the inner
  knob the page (medium-high for the inner knob) (#333).
- **T4:** CLR on the message page is ignored; the cursor button closes it and brings back the page beneath with its
  cursor on (#333).
- **T5:** with the cursor on a prompt, the inner knob does nothing in either direction (medium, #336).
- **T6:** ALT, then D->, then CLR on the empty field returns to the altitude page; the 89's stacking of its two altitude
  pages differs.
- **T7:** the 89's power-on page shows for about 5 s; it says nothing about the 90B's Turn-On time.
- **T8:** no message prompt appeared while the 89's self-test page showed; it has no readable course and no status line
  there (#330).
- **T9:** not observable: the 89's self-test page has no baro or altitude field.
- **T10:** the 89's data base page is a full screen without mode or prompt; figure 3-24 shows a status line, and the
  90B guide decides.
- **T11:** opening the time entry clears it; after ENT the clock starts from the entered hour and minute with the
  seconds at zero (medium-high, #331).
- **T12:** everything changed was restored by a relaunch.

# 9. Next steps

Gathered from the baseline sessions (2026-10-03 to 2026-10-10) and grouped by area. A harness gap is built only when
several tests need it (section 5); a gap that serves one test is listed here instead.

## Harness

- **Copies of helpers that stayed, and why** (when a helper was built, the tests that carried a copy moved onto it; a
  copy stays where the helper would change what the test asserts or needs a world it does not build):
    - `readMessages` opens the page and asserts that it closed, so `MainPage.test.ts` keeps `closeMsgPage` (it closes
      the MSG page with a Direct To page pushed over it, presses at most three times and never throws). Bare
      `MessageHandler` readers stay where no unit exists: `messagesOf` in `Flightplanloader.test.ts` (it joins with a
      bar, where `messages(unit)` joins with a blank), the arrays of `UserFlightplanLoaderV2.test.ts` and `posted()` in
      `Database.test.ts`. The two `m.message[0]` reads of `MessagePage.test.ts` stay: one asserts with `not.toContain`
      and the other sits inside a pin, so a move could not be proven.
    - `showSuperNav5` has no hook between its selects, so the status line test of `MainPage.test.ts` keeps its own
      sequence. `selectPage` cannot be used with an overlay shown, so `SuperNav.test.ts` reaches Super NAV 1 and 5 with
      the knobs. `MainPage.test.ts` has local `superNav1` and `names` (copies from `SuperNav1Page.test.ts`) and a
      `bootNearKbbb` copied from `MessagePage.test.ts`; a Super NAV 1 helper would replace them. `Screen.read()`
      throws on Super NAV 5, so the 3-36 test reads the status line's DOM element.
    - `activeIdent` returns undefined, where the null checks of `MainPage.test.ts`, `DirectToPage.test.ts`,
      `WaypointEditor.test.ts` and `ActiveWaypoint.test.ts` assert `null`.
    - `directTo` types an ident and confirms. The sequences with a prefilled ident or that stop at the confirmation
      page stay: `DirectToObs.test.ts`, `DuplicateWaypointPage.test.ts`, `FplPage.test.ts`, `VorUserWaypoint.test.ts`,
      `WaypointConfirmPage.test.ts`, `ActiveWaypoint.test.ts`, `DuplicateWaypoints.test.ts`,
      `ModeControllerObs.test.ts`, `TemporaryWaypointDeleter.test.ts` and the second Direct To of
      `WaypointEditor.test.ts`.
    - `confirmSet1AndReselect` reselects the page, so the inline CONFIRM? and ENT sites stay where the test asserts the
      status line between the two presses (`Set1Page.test.ts`) or reads the GPS position directly
      (`LatLonEditor.test.ts`). `mountedText` ticks once, so the display tests that change a value after the render and
      read before and after the tick keep `mount()`.
    - `Set0Page.test.ts` keeps its `rows()` (it trims the end only, and the assertions hold the leading blanks) and its
      reader of the status row's mask; `SuperNav1Page.test.ts` keeps `untrimmedRows`.
    - `userWaypoints` is unfiltered in the tests whose user waypoints are intersections, and `KeyboardService.test.ts`
      filters on region XX, a third meaning.
    - The reads of idents with their types stay as pairs or triples (`fpl0Legs` of `ActPage.test.ts`,
      `Apt7Page.test.ts` and `Apt8Page.test.ts`, the pair reads of `SidStar.test.ts`, the triples of the V1 and V2
      flight plan loader tests, the filtered reader of `procedures.test.ts`, the `legs` read for the fix type in
      `approachWorld.test.ts`, and `VolatileMemory.test.ts`'s `procedureLegs`), as does the SDK `identsOf(plan)` of
      `WTFlightplanSync.test.ts`.
    - `AirspaceAlert.test.ts` presses MSG twice with a wait between them and lays out its box edges with flat-earth
      offsets that are not `moveAircraft` targets; `SensorsOutSimVars.test.ts` filters `sim.writes` on a literal that is
      already upper case; the keyed storage read of `KLN90BCore.userDataConversion.test.ts`;
      `test/unit/harness/navdata.test.ts` has its own `abc`, `abd` and `kaaa`; `ObsDtkElement.test.ts` keeps the parser
      default through `MINIMAL_PANEL_XML`; `Apt3Page.test.ts` keeps its surface and lighting `it.each` beside the unit
      table.
    - The cold boot to the self-test page is `bootToSelfTest` (section 4); the older copies in `HEvents.test.ts`,
      `NavCalculator.test.ts`, `Button.test.ts` and `enterIdent.test.ts` stay as written. Boots whose timing or state
      is the subject stay too: `GpsAcquisition.test.ts` (it measures from the power-on), the cold-GPS tests of the D/T
      page files, `WelcomePage.test.ts`, and `hsiToFromFlags.test.ts` and `turnDirection.test.ts`, which start through
      `Flight.start`.
    - The `"kln90b"` planner is read through `FlightPlanner.getPlanner('kln90b', …)` in `WTFlightplanSync.test.ts`,
      `ActiveWaypoint.test.ts` and `reboot.test.ts`.
    - The power-off helper `offFor()` is local to `BrightnessManager.test.ts`.
    - `expectFlashing` (a prompt that flashes on the same tick of each of two blink cycles) is written out in
      `StatusLine.test.ts` and `MessagePage.test.ts` (`expectPromptFlashing`) and inline in `SuperNav5Left.test.ts`.
      `SuperNav5.read()` has no mask, so the Super NAV 5 prompt tests read `.super-nav5-mgs-range` with `readRows`, and
      `SuperNav5Page.test.ts` keeps its focused-field helpers (`focusedIn`, `focusedLeft`, `focusedRight`), which also
      read the right menu.
- **Shared worlds.** `standardRoute()`, `approachWorld()`, `legWorld()`, `arcWorld()`, `dtWorld()` and `centerWorld()`
  exist (section 3). The copies written before them stay, and some differ in detail, so check one before replacing it:
  the approach worlds with IAF = FAF in `ModeController.test.ts` and `HEvents.test.ts` (#129); the missed approach
  world (IAFAA at 47.3 N 7.7 E with a MAHAA hold) in `FplPage.test.ts` (`rnavWorld`), `Apt7Page.test.ts` and
  `Apt8Page.test.ts`; the MAP world with a missed approach leg in `NavCalculator.test.ts`, `SuperNav5Page.test.ts` and
  `DirectToPage.test.ts`, and the IAF = FAF and MAHP = FAF approaches of `ModeControllerObs.test.ts` (#153); the VOR 36
  world of KDST in `ActiveWaypoint.test.ts` and `WTFlightplanSync.test.ts`; the KDDD world in `Nav1Page.test.ts`,
  `Nav3Page.test.ts`, `Nav4Page.test.ts`, `Nav4Vnav.test.ts` and `SuperNav1Page.test.ts`; and the DME arc world in
  `SuperNav5DirectToSelector.test.ts`, `SensorsOutSimVars.test.ts`, `WTFlightplanSync.test.ts`, `dmeArc.test.ts` and
  others. A missed approach option of `approachWorld()` would replace the approach copies. Own worlds that are not the
  standard route stay by design: `DirectToPage.test.ts` (other coordinates, the frequency in a snapshot),
  `DirectToObs.test.ts`'s `planInObs` (a VOR with a published variation), `FplPage.test.ts`'s `bootRoute` and
  `route7()`, the BRAVO world of `HEvents.test.ts`, the `[kaaa, abc]` worlds of `SensorsOut.test.ts`,
  `SensorsOutSimVars.test.ts`'s `bootOnRoute` (no settle), `Tri5Page.test.ts`'s `meridianRoute()`, the intersection
  worlds of `SuperNav5Page.test.ts`, the obsMode boot of `power.test.ts` and the garbage `wpt0` of
  `FlightplanEdit.test.ts`.
- **A boot that leaves an `ElectricitySimVar` unit dark from the start.** The `simVars` boot option sets SimVars before
  `init` (section 4), but the circuit tests of `SimVarSync.test.ts` and `PowerButton.test.ts` still boot powered, lose
  power at the first `SimVarSync` tick and wait 3 s for the unit to go dark, beyond the ride-through a fix of #332 may
  add.
- **Sampling an LVar.** Tests sample an LVar over display ticks with a hand-written loop (`SimVarSync.test.ts`,
  `StatusLine.test.ts`, `SelfTestLeftPage.test.ts`). A sampling helper would remove the pitfall; the counting half is
  `sim.writeCount(name)` (section 3).
- **A blink phase probe.** The #320 pin finds the blink phase through `L:KLN90B_MsgLight`, which is dark on those ticks
  only while a message is unread; a `blinkPhase()` on the unit would not need a message.
- **A `beforeInit(core)` boot option.** The test of H events before `init()` spies on `KLN90BCore.prototype.init`.
- **The `Version` mock.** STA 3 shows the placeholder of `kln90b/Version.ts`, which `Screen` refuses, so the tests that
  show or pass STA 3 mock the module: `selectPage.test.ts`, `Sta3Page.test.ts` and `Sta4Page.test.ts`. The harness
  could set the placeholder up.
- **`airport()` options** for frequencies, runway lighting, the private type and radar coverage. The APT 1, APT 3 and
  APT 4 tests spread the facility or patch `runways[i].lighting`.
- **`savedUserWaypoints` writes region `XX` only.** The temporary-waypoint tests lay out the `XY` strings by hand
  (`savedTemporary` in `TemporaryWaypointDeleter.test.ts`); an `XY` option would replace them.
- **Options of the fake navdata** (section 6): a cloning option that hands out a copy of the `IcaoValue` per call, which
  would make the reference comparisons observable (`Scanlist`, fixed in `6a6c634`, and the nearest list removal at
  `NearestList.ts:89`, which a break survives); a `getFacility` that checks its type argument; and a search that returns
  matches in insertion order, which would show whether the code orders the autocompletion itself (also unobservable
  with the instant fake: `WaypointEditor.onCharChanged` has no guard against a stale result, and
  `WaypointEditor.convertToValue` looks for the exact ident among the first 99 results only).
- **A recording `FakeCoherent`**: a `trigger` that records its calls and an `emit` for the `on` handlers would hold the
  keyboard focus and the click outside the instrument (section 6).
- **No `Name_Z` fake and no in-game state.** A test that sees `PLAY_INSTRUMENT_SOUND` itself would need both (section
  6).
- **A `FakeXhr` mount.** `FakeXhr` serves `resources/` only at the default path, so a custom `BasePath` fails the boot.
- **Flights cannot test the nav-source gate or a cold start, by decision.** `Aircraft.writeTo` forces
  `GPS DRIVES NAV1` true on every 16 Hz step, and `Flight.start` waits for a fix. Render tests prove both behaviors
  (`92fbba1` in `SensorsOutSimVars.test.ts`, #61 in `Gps.test.ts`); lifting either would need an `Aircraft` option
  or a start that does not wait.
- `Flight.syncDisplay` throws when DIS changed in every display tick; no test covers that throw.
- `restoreMocks: true` in `vitest.config.mts` was considered and declined: tests restore their own spies.
- **`vitest -t` takes a regular expression.** Titles with `(`, `)`, `+`, `?` or `#` (every pin and most citations)
  need escaping in a filtered run, which matters for a mutation pass.
- **The glyphs of the font have no table.** `docs/architecture.md` lists the code points of the special symbols but not
  what each one draws; the tests name them by the code's constants or in comments.

## Navigation and navdata

- **Approach arming** (the ARM and APR scale ramps), the waypoint alert without turn anticipation and the GPS-invalid
  path are held at the render stage, where a held position plus `moveAircraft` observes them; flights would only add the
  motion. **ARM GPS APPROACH** is tested at the unit stage only (`PersistentMessages.test.ts`): while #139 stands the
  unit re-arms within 30 NM on every tick, so ENR-LEG within 3 NM of the FAF is unreachable. Add a render test once #139
  is fixed.
- **The flown-through bound of `dmeArc.test.ts` does not hold the arc reversal.** With `fromDtk` reversed on arc legs
  the monitor's bound north of the leg stays green (0.895 NM against a radius of 1.012 NM); only the circle-center
  assertion fails. A tighter bound, or a monitor on the arc's radius, would hold it twice.
- The XTK expectations of `ModeController.test.ts`, `ModeControllerObs.test.ts` and `DirectToObs.test.ts` come from
  `crossTrackNm` and are exact, while their 0.05 NM tolerances date from an approximation. They could be tightened.
- **Surviving mutations near past fixes:** the 2 NM condition of 6-3 (`ModeController.ts:354`, `> 20` survives); the
  110° limit (`ModeController.ts:369`) is held only between 100° and 120°; a halved roll-in distance
  (`NavCalculator.ts:190`) survives the lower bound of the DME arc flight; the flag copy of `addArcInfoIfPrevIsSame`
  (`SidStar.ts:455`) has no arc whose fix carries other flags; the two halves of the SET 3 hard-surface filter
  (`NearestList.ts:163` and `:191-198`) and the two polygon guards of the SUA alert (`AirspaceAlert.ts:109`,
  `MessageHandler.ts:87`) cover each other.
- The removal loop of `NearestList.tick` splices while it iterates (`NearestList.ts:87-93`), so of two adjacent
  removals one waits for the next search.
- **CTR computes once per unit in tests.** With `centerWorld()` one computation needs no OTH 2 detour: its legs are
  300 NM, so each Center is first returned by a search from inside it. A second computation in the same unit meets
  #102; the #102 pin in `Ctr1Page.test.ts` is such a test on purpose, and #161 is pinned there with one computation.
- CTR leads: a recomputation without insertion creates a new user waypoint with the next number (BGD00, then BGD01),
  and the orphans count against the limit until power-off; a crossing without a VOR within 100 NM, or without a free
  number, is dropped silently; when the first waypoint lies in no Center the first crossing is dropped
  (`AirspacesAlongRoute.cleanup`); `getWaypointIfExistsInFpl` compares coordinates with `===`; CTR 2 converts the radial
  with the variation at the present position, NAV 2 with the VOR's own (#280 rules the VOR's own for INT, SUP and REF);
  the status line shows `msg` for one display tick after CTR 1 is selected.

## Pages

- **The ENT order of `FourSegmentPage` is not tested**, by decision. The shell is the full-page frame of the Database
  page and the OBS warning, whose pages have no cursor fields, so most of its knob switch cannot be reached. Take-home
  mode and `TakehomePage` are out of scope (`Gps.ts:154-165`, an undocumented panel.xml key): a probe found that a
  cold-and-dark unit in take-home never gets a fix and that the position dead-reckons a straight line on the SET 1 track
  instead of following the plan (5-46, 3-19); no issue was filed.
- **The `FiveSegmentPage` tests are characterizations**: no trainer check is recorded for the SCAN rule its code comment
  names. The comment on the left branch of `handleEnter` (`FiveSegmentPage.tsx:217`) says the right half has priority
  when it waits for confirmation, while the code serves the left half first; the test holds the code's order.
- **The `fields` array of the `CursorController` constructor is dead** (`CursorController.ts:62-63`, behind
  `@ts-ignore`): the field list is recomputed on every call. It looks like a cache, so do not rely on it.
- **A blank Direct page:** ENT on the 89's Direct page with a blank field returns to the page before (section 8,
  2026-10-09, T1), while the 90B code stays on the DIR page. The 90B guide was not checked for the case, and the #335
  pin does not assert it.
- **Left page leads** (seen and not confirmed or not filed):
    - FPL 0 shows an empty top row when the active waypoint is the first one, and after a list rebuild with the cursor
      on; the guide's figures do not show the case (a trainer question). `DirectToPage.test.ts` reads rows 1 to 5
      around it.
    - An XTK of exactly 0 shows `-.-` on NAV 3 (`Nav3Page.tsx:55,95` treat 0 as no value); unreachable in practice.
    - CAL 2's `setTemp` writes the CAL 1 temperature too; 5-11 does not say whether the pages share it.
    - The ` 0` in the top row of an empty SUP page is also the trainer's behavior and is a spec test.
- **Right page leads** (seen and not confirmed or not filed):
    - On the page of a user airport, typing the ident of a database airport on the first character switches APT 3 to the
      diagram page of the airport that character matches, and that page has no cursor controller, so the entry cannot go
      on. Whether the real unit keeps the cursor there is not known.
    - INT and SUP show dashes for REF, RAD and DIS for the first seconds of every visit (`REF_CALCULATION_TIME`, a
      deliberate debounce); the trainer shows them with the ident at once.
    - The trainer shows a radial of 0 as `360.0`; the code shows `000.0`, which figure 5-94's zero padding supports for
      the 90B (a characterization holds it).
    - `Apt3ListPage.buildRunwayList` sorts the facility's shared `runways` array in place (`Apt3ListPage.tsx:126`); no
      visible effect found.
    - With no waypoint of a type at all (`defaultNavdata: false`) the VOR, NDB and INT pages show the ident `0`.
    - Editing the latitude or longitude of a stored user intersection leaves REF, RAD and DIS describing the old
      position until the page is left. After a USER POS? entry the SUP page shows the typed longitude, not the stored
      one (seen only through a mutation).
    - The right outer knob during a waypoint confirmation leaves the left editor waiting for a page that is gone.
    - NAV 2 with the aircraft exactly on its VOR shows the ident and `°fr` without a radial and logs an invalid heading.
    - `VolatileMemory` starts the SUP ident as a `0` and four blanks, while `setFirstSupplementary` writes a `0` and
      three; harmless.
    - APT pages: `Apt4Page.render` does not set `requiresRedraw`; `Apt1Page` builds a dead `type` child; APT 4 shows its
      constructor text for one display tick at power-on; APT 2 truncates half-hour time zones; the `aptPage` memory
      writes of `PageManager.startMainPage` are redundant.
    - APT 7 decides on raw transition counts while it lists the recognized ones; an IAF number of ten or more has no
      blank before the name (`Apt8Page.tsx:470`); the IAF list is not filtered by recognition; the cursor on APPROVE? of
      the add question is only characterized.
    - D/T 1 and D/T 2 beside another page hide the last-waypoint block when the active waypoint is the last one (4-12 is
      silent). After LOAD IN FPL on ACT 8 the ACT page switches to the new active waypoint (the guide is silent).
    - The code comment at `Apt8Page.tsx:352` quotes a sentence of 6-4 nearly word for word; it should be paraphrased.
    - Selecting NAV 2 on the right from the boot's SUP page passes ACT, which posts NO SUP WPTS (#293), so a test that
      reads the status line routes the right side another way.

## Controls

- **The 4-3 cursor tests** (the cursor field remembered while the page is not left) sit in `WaypointEditor.test.ts`,
  though their subject is `CursorController`; they could move to `FplPage.test.ts` or a `CursorController` test file.
- The controls' bugs that the right pages showed (#277, #282, #288, #290) are pinned on the pages and at control level.
- **Leads** (seen and not confirmed or not filed):
    - Editors: `FreetextEditor.convertFromValue` drops a cell for a stored character outside its charset;
      `MagvarEditor` enters 0°W as -0 and cuts a variation of 100° or more to two digits (polar VORs only);
      `ElevationEditor` has no sign, so a user airport below sea level cannot get its elevation; `VorFreqEditor` takes
      any 10 kHz step (113.13), while VOR channels are 50 kHz apart (the guide gives no rule); a user elevation is saved
      in whole meters, so a change of 1 ft is not observable.
    - Selectors and fieldsets: `VorSelector` leaves out TACAN-only stations (2-1 and 2-2 name VORs only); for a
      duplicated ident the VOR page reached by scanning and the selector can show different VORs (#105); the OBS taken
      from the DTK keeps its fraction (089.46) while the field shows 089, and the CDI follows the fraction (5-35 is
      silent); the inches cell of `BaroFieldset` caps at 30.99 while millibars reach 1099; `OthFuelFieldset` shows a
      rounded value and rebuilds from one with a fraction; `MapOrientationSelector` renders an undefined value for a
      stored HDG up without a heading input; `SuperNav5RangeSelector` builds its index with `indexOf`, -1 for a stored
      scale outside its list; CAL 4 at 9.9° and 999 kt shows an FPM of `1770` for about 17700 (the question #257); the
      Super NAV 5 fields 2 and 3 round 359.5 to 360 (#263's rule); `AltitudeFieldset` shows `00000` below sea level,
      while a low-confidence photo of the self-test page shows a negative altitude; `ModObsElement.innerRight` (MOD 2)
      and `FuelOnBoardSelect.innerRight` return `false` while `innerLeft` returns `true` (no visible effect; the Super
      NAV 5 case is #238).
    - Lists: figures 4-4 and 4-5 read `LOAD INVRT?` in the PDF's text layer while the first waypoint of an empty plan is
      entered, where the code shows LOAD FPL 0? (worth a look at the printed page); the procedure header hides the arrow
      column while focused, and whether its text starts in column 0 or 1 was not checked; `SimpleListItem.tick` toggles
      `inverted-blink` twice for an entered item (redundant).
    - Status line, MSG page and views: `MessagePage.enter` with an empty nearest list keeps the MSG page, while the
      comment at `MessagePage.tsx:53` reads as if the unit removes it; `AirportCoordOrNearestView.loadAirspace` resolves
      late and writes against the airport shown then, so a quick scan could show the previous airport's class;
      `ErrorPage.showError` writes the error text with `innerHTML`, unescaped; `getAirspaces(lat, lon, 10, …)` passes
      10 meters, which reads like nautical miles but works with `isInside`.
    - Displays: the `targetLetterIndex == 9` branches of both deviation bars and the `activeIdx === null` branch of
      `FlightplanArrow` are dead; `formatDuration` is exported but used only in its file; a negative OTH fuel clamps to
      0; single-digit temperatures keep a zero (the trainer could not answer); the Super NAV 1 FLAG row draws 22 cells
      instead of 23.
    - The trainer brings the cursor back on the first field after it is turned off and on, and on the top visible entry
      of a scrolled list (section 8, 2026-10-08, T7 and T23); 4-3 implies that the 90B remembers the field, which the
      code does and the 4-3 tests hold.

## Boot, power and the unit as a whole

- **Errors thrown on the ENT path never reach the error page**, although `CLAUDE.md` and `architecture.md` say input
  exceptions are shown there (section 6). The question is #118; once it is decided, either the code changes or the two
  documents do. The harness collector stays either way.
- **Code notes** (latent or possibly intended, so questions rather than bugs; the code is unchanged):
    - `TickController.setupLoops` starts new intervals without clearing the old ones. Only the dedup upstream
      (`PowerButton` publishes a power event on a change only, `SimVarSync` dedups its enable and disable) keeps a second
      power-on event from doubling every loop, the symptom of #24. That early return of `PowerButton.refreshPowerState`
      (`PowerButton.ts:118`) is not run by any test.
    - H events sent before `KLN90BCore.init()` are dropped (`7b4465d`), an early power-on included: `KLN90B_Power_On`
      before `init()` leaves a cold-and-dark unit off. The `hEvent` topic is also dropped until
      `hEventPublisher.startPublish()`. Whether an aircraft's early power-on should be kept is open.
    - An `error` published on the bus before `pageManager.Init` builds the `ErrorPage` still aborts the start-up: the
      bus caches it, `ErrorPage.showError` runs before the page is rendered and throws, `init()` rejects and the unit
      never comes up. No path publishes one today; a `showError` deferred to `onAfterRender` would be safe.
    - The class comment of `TickController` cites page 43 of the maintenance manual (Figure 9), which is the V2
      manual's numbering; in V3 the figure is printed page 55 (Figure 10). Its pages 186 and 189 were not confirmed.
    - `platform.getRouteManager().then(...)` in `KLN90BCore` has no catch; a rejection is an unhandled rejection
      (`bootFailure.test.ts` takes it), not an error-page error.
- **Leads** (seen and not confirmed or not filed):
    - Start-up pages: `WelcomePage` subscribes to `propsReady` in its constructor and never unsubscribes (the pattern of
      #96); `docs/architecture.md` (UI 0) says the Turn-On page waits about 15 s, the code 17 s (the tests hold 14 to
      19 s), and the code comment "page 84" is the V2 maintenance manual's numbering of the printed page 1011;
      `VFROnlyPage` renders a `<div>` where the other start-up pages use `<pre>`; figure 3-22 shows the VFR page's status
      line without a mode, the code `enr-leg ent`; `VFROnlyPage.acknowledge` taking the OBS branch always is an
      equivalent mutant, because the OBS warning moves on by itself with the switch in LEG; the coverage text on line
      1 of the Database page and the cursor after ENT on the fourth Turn-On line (5-28 is silent) are not asserted.
    - Self test: `SelfTestRightPage` makes the baro read-only for `BaroSource` above 0 even without
      `Airdata.IsInterfaced`, and the baro then never updates (an invalid panel.xml combination, #145); GPS WP BEARING
      shares the conversion of #329; `POSITION DIFFERS` posts while the self-test page shows with empty storage, and
      whether a real unit posts it before APPROVE? is not known; the ALT row's padding and the case of `ft`; whether a
      baro change takes effect before ENT; the distance indicator's 0 KTS and 0 MIN of Installation Manual 2-69; a time
      entry in a time zone other than UTC.
    - Power cycle: `Timers` saves the total time every 60 s and not at power-off, so STA 4 loses up to 59 s when the sim
      closes; `PowerButton` counts the first cold power-on as an hour off (intended; #211 has the clock half);
      `SimVarSync` ignores the LEG/OBS switch while disabled (read again at the resume); the Direct To and the active
      waypoint survive a power cycle unchanged, while 3-8 only says the last waypoint's page shows; the
      `memory.<x>Page.ident` writes of `PageManager.startMainPage` are equivalent, because `WaypointPage` uses the ident
      only when the facility cannot be read.
    - Overlays: a last active waypoint of a facility type `PageManager.ts:100` does not handle (a VIS fix of an approach)
      would throw at power-on, if it can be stored at all; the right scan branches read the base right page's cursor
      while an overlay shows; the overlay orders without MSG (ALT over DIR, DIR over ALT, ALT twice) have no source and
      are not frozen; the error page lives outside the overlay stack, so a knob turned while it shows reaches the page
      beneath, and it stays over a power cycle.

## Across the suite

- **Flip the pins when the bugs are fixed:** remove `.fails` from the tests that `grep -rn "it.fails" test/` lists, each
  of which names its issue. Fixes that touch other tests:
    - the real fix of #90 (a copy of the page tree per controller) also changes `test/render/harness/pageTree.test.ts`,
      which asserts the in-place pruning;
    - the fix of #96 needs `PageStack` in `MainPage.tsx` to destroy the half page it replaces (`setCurrentPage`, `pop`,
      `parentRemoved`) besides the pages unsubscribing; the pages' `destroy()` alone leaves both handler counts
      unchanged, and OTH 4 counts the `changed` topic of the remarks manager;
    - the fix of #269 (`this.children = this.getCurrentPage().children; this.requiresRedraw = true;` in
      `Apt3Page.changeFacility`) turns both #269 pins red; the fix of #95 turns its two pins red (the list and the error
      page); the fix of #93 turns two (Avgas and JetB; JetA1 passes today, because the SDK's generic imperial gallon
      weighs as Jet A);
    - the fix of #311 in `WaypointEditor` leaves the `FplPage.test.ts` insert tests green; the fix of #262 must keep NO
      SUCH WPT on the REF page (held in `WaypointEditor.test.ts`, and the vehicle of the status line tests); the fix of
      #306 changes the keyboard's automatic advance at the last cell (a characterization in `Editor.test.ts`); the tens
      fix of #303 retires the 91-degree characterization of `LatLonEditor.test.ts`; #324 needs a trip-page form of
      `DurationDisplay`, not a change of the shared form;
    - a fix of #336 at the `MainPage` level also turns the #238 pin red; a fix of #335 turns the #334 pin red as well,
      though #334 still needs its own fix for SET 0 and Super NAV 5; a fix of #332 with a ride-through above about 1.5 s
      needs the 3 s waits of the circuit tests raised; a fix of #328 must keep the screen warm on a forced start
      (`lastPowerChangeTime` also drives the warm-up); the fix of #199 turns its pins red; `HEADING_INPUT` in
      `RollSteeringController.test.ts` can bite once #143 is fixed.
- **Open questions for the KLN 89 trainer** (the maintainer starts the VM): #146 (the alert time on a Direct To a
  waypoint of FPL 0 that has a following leg), #147 (a waypoint alert in OBS mode), duplicate idents on a waypoint page
  (2026-10-08, T20, not done), and the empty top row of FPL 0 above. #162 and #163 cannot be answered there, because
  the trainer shows neither ARM nor ACTV; what the 90B shows on an empty MSG page (#325), the prompt while the MSG page
  shows and an airport below sea level cannot be asked on the 89. The Super NAV 5 prompt once all messages are read is
  the question #326.
- **Debug `console.log` calls** left in the code: `Apt3MapPage.tsx:30`, `TemporaryWaypointDeleter.ts:27` and `:32`,
  `WaypointPage.tsx:46` and `WaypointPage.getScrollSpeed`, `SupPage.tsx`, the constructors of the waypoint pages
  (`ActPage.tsx:43`, `Apt1Page.tsx:78`, `Apt6Page.tsx:43`, `IntPage.tsx:71`, `NdbPage.tsx:55`, `VorPage.tsx:58`,
  `WaypointConfirmPage.tsx:41` and others), `Apt7Page.load`, `Apt8Page.load`, `EditorField`, `WaypointSelector`,
  `formatAirportType`, `StatusLine.destroy`, and the constructor, `saveDate` and `saveTime` of `SelfTestRightPage`. A
  cleanup commit, if wanted.
- **Premises that no assertion needs** (dropping them leaves the tests green; a test that needs one must assert
  something that depends on it): `NO_OBS` in `DirectToObs.test.ts`, `Mod2Page.test.ts`, `Nav3Page.test.ts`, the route
  boot of `StatusLine.test.ts` and the Leg-mode test of `ObsDtkElement.test.ts`; `AIRDATA` and `fuelComputer()` in
  three name tests of `PageTreeController.test.ts`; `HEADING_INPUT` in `SelfTestLeftPage.test.ts`, `SensorsOut.test.ts`
  and `RollSteeringController.test.ts`; the `FOBTransmitted` and `IsInterfaced` values of two `Messages.test.ts` tests;
  `WriteGPSSimVars` off in the `KlnEfbLoader.test.ts` import (the import is not gated); the `FacilityType.USR` filter in
  `KlnEfbLoader.test.ts` and `TemporaryWaypointDeleter.test.ts`. Hygiene that no assertion holds: the `storage.reset()`
  and the spy restore of the #103 file, the `sim.reset()` of the first `Hardware.test.ts` test, and `muteConsoleError` in
  the `ErrorPage`, `SupPage` and `bootFailure` tests.
- **Waits that no assertion needs** (a shorter wait leaves the tests green; each has a comment that names what it is
  for): the default of `directTo` and of `show`, the waits after `showSuperNav5` in `superNav5.test.ts` and
  `mapRecorder.test.ts`, the 2000 ms of `Nav5Page.test.ts`, the 250 ms of `SuperNav5Field1Selector.test.ts`, the 31 s
  of `SuperNav5Left.test.ts`'s `armed()` and of `approachWorld.test.ts`, the 30 s boot of
  `test/flight/harness/boot.test.ts`, the 25 s of `Apt1Page.test.ts`'s `dropEntry` and the 2 NM start of
  `jump.test.ts`.
- **Review notes left as they are:** the INT REF read-only mutant survives one test of `IntPage.test.ts`;
  `Sensors.test.ts` does not hold the type-dependent volume of its passing tests (the #93 pins will); `Screen.inverse`
  accepts any non-normal cell; the tick of `mountedText` and the trim of `writeCount` are unheld; `NearestList.test.ts`
  reads the last frame of the map only; `Mod1Page.test.ts` words the 5-38 note as "offers 1 and 0.3 only", an
  inference; the spies of `superNav5.test.ts` and `frontPanelHelpers.test.ts` are restored after the assertion, not in
  `finally`; `KLN90BCore.init.test.ts` cannot see whether the sample panel.xml keys are parsed (a parser that ignores
  `Input.ElectricitySimVar` survives, because the test sets the SimVar itself); `isTurnOnPage` of
  `WelcomePage.test.ts` reads the ORS text of the top row; the wait-cut test of `selfTestBoot.test.ts` passes on any
  throw with the helper's message; the CTR test of `Ctr1Page.test.ts` does not hold the flight plan check of
  `TemporaryWaypointDeleter` (its own test file does); `firstFlight.test.ts` survives a DIS row rounded to whole NM;
  the MOVE? test of Super NAV 5 does not hold `leg.arcData = newData` (`SuperNav5DirectToSelector.tsx:101`); the plan
  number of OTH 3 is seen for plan 0 only.
- **Describes without a label in the title** that predate the label rule: `FplPage` (FPL 1 to FPL 25), `Mod1Page`,
  `Mod2Page`, `DirectToPage`, `AltPage`, `FlightplanList`, `WaypointDeleteListItem`, `DateEditor`, `WaypointEditor`,
  `FuelFieldset`, `ObsDtkElement`, the Super NAV 5 selectors and the four tests of
  `test/render/data/navdata/AirspaceAlert.test.ts:28-45`. Each of their tests cites a page, a commit or a trainer
  check.
- **Costs to keep in mind:** the H event sweep boots a fresh unit for every public event in four states, and
  `test/unit/KLN90B.test.ts` imports the whole instrument statically, which is slow at collection (a dynamic import
  timed out under load).
