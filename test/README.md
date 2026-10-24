# KLN 90B testing guide

Companion to [CLAUDE.md](../CLAUDE.md) and [architecture.md](../docs/architecture.md). It explains how the automated
tests are organized, how to write one and what they cannot tell you (section 6). All paths are relative to the repo
root. The records kept beside it are in `docs/`:

- [test-coverage-record.md](../docs/test-coverage-record.md): what the tests covered when the baseline was complete;
- [test-next-steps.md](../docs/test-next-steps.md): what is left to do;
- [kln89-trainer-record.md](../docs/kln89-trainer-record.md): the dated checks on the KLN 89 trainer.

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
- There is no linter. CI (`.github/workflows/ci.yml`) runs the type check, `npm test` and the build on GitHub.

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
fix yet (the boot resets the GPS after `propsReady` and erases the cached ephemeris); it acquires on its own, fast or
slow per the `fastGpsAcquisition` setting, and `settle` waits for it.

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
    - `E:ABSOLUTE TIME` and `E:SIMULATION TIME` follow the fake clock, so real and sim time run together.
      `sim.absoluteTimeOffsetMs` moves `E:ABSOLUTE TIME` against it: a negative offset while the clock advances is a sim
      pause, a positive one a jump of the sim time (the #328 clock tests). `reset()` sets it back to 0.
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
    - the singletons listed in `test/harness/singletons.ts` are cleared;
    - the DOM is emptied.

  The teardown (`runAll` in `boot.ts`) runs every step even when one throws, then rethrows the first error, so one
  failing reset cannot leave the singletons dirty for the next test. It also clears `FakeXhr.requests`.

  Only one unit is live at a time: `bootUnit` throws on a second call in the same test, and outside a test. A singleton
  added to the instrument must be added to `singletons.ts`.
  Unit tests of a single service (see `UserWaypointV2.test.ts`) use the same singletons, so they build their own bus.
- The clock is Vitest's fake timers (`sim/clock.ts`): `setTimeout`, `setInterval`, `Date` and `requestAnimationFrame`
  are faked, starting at `DEFAULT_START`. Advance it with `await vi.advanceTimersByTimeAsync(ms)`. All tick loops
  of the instrument (docs/architecture.md, Core 2) run on this clock.
- `Math.random` is replaced by a seeded generator (`sim/random.ts`, default seed 1), so the GPS clock jitter repeats
  between runs. A test that needs another jitter passes `seed`. The SDK's `UserSetting` draws once per setting it
  builds, so `bootUnit` starts the sequence again from the seed once the `KLN90BCore` constructor has built the user
  settings: a new setting key does not move the GPS draws of the seeded tests. The teardown puts the real
  `Math.random` back, so a later unit test of the file sees the real generator.

## Collectors and boot failures

`bootUnit` installs collectors before `KLN90BCore.init`, so that an error while the unit starts up is seen too.

- **`unit.errors`** holds everything published on the `error` topic, and every unhandled promise rejection.
- **`unit.consoleErrors`** holds the arguments of every `console.error` call. The call is passed on to the
  `console.error` it replaced, and the teardown puts that one back. `Flight` reads it for its "no console.error"
  monitor.
- **Unhandled rejections** are collected through a `process` listener, into `unit.rejections` and `unit.errors`. Some
  async callbacks of ENT are not awaited (`RefPage.calcRef`, for example; section 6), so a throw inside one is a
  rejection nobody sees. Vitest stops reporting unhandled rejections once a second listener exists, which makes this
  collector the only check. It is strict: a rejection still in `unit.rejections` when the test ends fails that test. The
  check runs while the unit is still up, before the teardown (Vitest runs `onTestFinished` callbacks last registered
  first), and a throw in it does not stop the teardown. The teardown removes the listener.

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
no real unit shows. They lie at 45 S 150 W, far beyond the 200 NM nearest search and the 1000 NM reference VOR search of every test position, so the nearest
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

**Airspaces.** `airspace()`, `circularAirspace()`, `arcSectorAirspace()` and `multiShapeAirspace()`
(`navdata/airspaces.ts`) build `BoundaryFacility` objects. Pass
them as `BootOptions.airspaces`, add them to a flight with `World.addAirspace()`, or call
`MemoryFacilityClient.addAirspace()`; `removeAirspace(id)` takes one out again, and the next search reports it as
removed. The boundary session filters by the type mask (`1 << BoundaryType`), selects the
airspaces whose bounding box meets the search circle, sorts them by distance to the box, cuts at `maxItems` and reports
removed ones by id. The bounding-box selection is inferred from a comment in `NearestUtils.getAirspacesAt`, not observed
in the sim. The SDK's `NearestLodBoundarySearchSession` builds the `LodBoundary` objects in a throttled queue on
`requestAnimationFrame`, so a test advances the fake clock for a search to finish. The builder sets `lods: []`, so that
LOD 0 is the exact ring instead of a simplified one, and `resetSingletons` clears the SDK's boundary cache, which is
keyed by the airspace id. `circularAirspace()` uses the sim's Origin and Circle vectors. `arcSectorAirspace()` builds a
pie slice whose curved side is an `ArcCW`, or an `ArcCCW` with `counterClockwise`; `startOffsetNm` moves the arc's
start off its circle, as real data sometimes has it (the SDK takes the radius from the arc's end).
`multiShapeAirspace()` puts a polygon and a circle into one boundary. A test of a message reads the MSG page with `Screen.read()` (see `test/render/harness/airspaces.test.ts`).
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
unit's own -1 m.

`standardRoute()` (`test/harness/fixtures.ts`) returns the world many tests use: KAAA, the VOR ABC and KBBB, fresh objects
on every call. `insertLeg(unit, idx, fac)` (`test/harness/flightplan.ts`) puts a `USER` leg into FPL 0 at `idx`, the way the
FPL page does after a waypoint confirmation, which is far faster than typing it with the knobs.

`approachWorld()` (same file) returns an RNAV approach to KPRC from the north with fresh objects on every call: the IAF
IAFAA, the intermediate fix IFAAA, the FAF FAFAA 5 NM north of the MAP, a step-down fix SDFAA between the FAF and the MAP, the MAP MAPAA at the
airport and an enroute fix ENRAA. Its FAF is not its IAF, so the unit can reach APR there, and the step-down fix lets a test
check that APR does not come back past the FAF. Boot with its `facilities` and `panelXml(APR_ARM_SWITCH)`, store `[enraa, kprc]` in FPL 0 with
`savedFlightplan` and load the approach with `await unit.panel.loadProcedure('APT 8')` after `settle`; `north(nm)` gives a
point on the final course line. `sidStarWorld({sids, stars, rf?})` gives KPRC of that world invented SIDs and STARs
east of it (optionally with an RF procedure the unit leaves out) and returns `{facilities, position}`, KPRC and ENRAA
first; the APT 7 and ACT 7 tests use it.

`dtWorld()` returns four waypoints half a degree of latitude apart on one meridian, 10 E: the airport KAAA, the VOR ABC,
the intersection DEF and the airport KBBB. Each leg is about 30 NM, which is 15 minutes at 120 kt. `centerWorld()`
returns `{kaaa, kbbb, kccc, bgd, gck, centers}` for the CTR pages: three airports 5 degrees (300 NM) apart on 100 W, the
VORs BGD and GCK, and three Center airspaces stacked along that meridian that share their boundaries at 42.75 N and
47.75 N. BGD is the closest VOR to the first crossing and GCK to the second. A plan through the airports
should keep its legs at 300 NM: the route search searches circles of about 75 NM radius at 0, 75 and 225 NM along a leg,
so each Center is met by a search whose center lies inside it. (Before #102 was fixed, a Center first returned from
outside it was dropped for good by the shared search session, which the long legs hid.) Both return fresh objects on
every call; pass `centers` as
`BootOptions.airspaces`.

`legWorld()` returns `{kddd, kaaa, keee, west}`, the leg world of the NAV 3 and NAV 4 pages and the Super NAV 5
selectors: KDDD (47.0 N, 9.0 E), KAAA 200 NM west of it on the great circle that leaves KDDD on 270 true, KEEE 30 NM
east of KDDD, so that the leg KAAA to KDDD is not the last one (the last leg: `Nav3Esa.test.ts`). `west(nm)` is the
point nm NM west of KDDD on that line. Store `[kaaa, kddd, keee]` in FPL 0 with `savedFlightplan`; an eastbound
aircraft on the first leg has KDDD active. `arcWorld()` returns
`{abc, at, arcbg, arcen, fafaa, mapaa, kprc, facilities}`: a left DME arc of 10 NM around the VOR ABC from its 270 to
its 180 radial (ARCBG to ARCEN), then FAFAA and the MAP MAPAA, in an RNAV approach to runway 27 of KPRC with the
transition ARCBG. `at(bearing, nm)` is the point nm NM from ABC on a true bearing, so `at(225, 10)` lies on the arc.
Boot with `panelXml(APR_ARM_SWITCH)`, store `[kprc]` in FPL 0 and load the approach with
`unit.panel.loadProcedure('APT 8')`; the arc is the active leg then. Both are pure worlds with fresh objects on every call and no boot: the boot sequence that puts the aircraft on
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
  (only to test that RF procedures are rejected) return legs as `FlightPlan.createLeg` does. Every call returns a new
  object; never share a leg between procedures. `SidStar` converts copies of the legs, so the procedure stays as built
  (#376).
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
  A load into a full FPL 0 that must delete waypoints asks on the left page first (#222); the helper leaves that
  question open, and the test answers it with `ent()` or `clr()`. A load of a procedure that FPL 0 holds one of the
  same type already asks first to replace it on the right page (#274): the helper leaves that question open too, with
  the cursor off, so the test turns the cursor on with `cursor('R')` and answers it with `ent()`. FPL 0 on the left
  with its cursor off takes CLR for its DELETE FPL? question (4-5) unless the right side holds an open entry, and a
  selection step of APT 7 or APT 8 (every step after the procedure list) counts as one (#383), so CLR reaches it first.
  A test no longer needs `selectPage('L', 'NAV 1')` for that, though existing uses may stay.
  APT 8 (and ACT 8) exists only on a unit with the approach arm switch (3-49, #133), so a test that reaches it boots
  with `panelXml(APR_ARM_SWITCH)`; the harness default panel.xml has no switch, as the parser default.
  The APT pages open on the first airport of the scan list, so with more than one airport pass
  `{ident: 'KPRC'}`: the helper first enters that ident on APT 1. A test that needs another entry or a transition
  question does the sequence by hand (`selectPage`, `cursor`, `ent`). `test/render/harness/procedures.test.ts` does
  both.
- A DME arc is converted to an entry waypoint `Dnnnx` and the arc's end fix. The entry is the point of the arc closest to
  the GPS position at load time (the beginning of the arc when that point is outside it), so the position the unit boots
  at decides the entry. The arc's radials are true bearings: keep `magvar` at 0 or account for it. The arc must not be the
  first leg that survives the conversion, which replaces the leg before the arc with the entry.
  Boot on the arc, so that the arc leg is the closest and becomes active.
  A test that recalculates the entry (MOVE? on Super NAV 5) can use a left or a right arc.
  Two arcs around one navaid with radii more than 0.1 NM apart stay two arcs: the first arc's end fix stays in the
  list, and the second arc starts at a generated entry at its published beginning (#131).
- `Leg.TF(fix, FixTypeFlags.IAF)` and its siblings set the fix types. `SidStar` keeps a leg flagged IAF, FAF, MAP or MAHP
  even when its fix repeats, and drops an unflagged repeat. A missed approach that ends in a hold (HA, HF or HM) gets
  the MAHP flag without a flagged leg in the test data (#220); one that ends otherwise has none.

## Reading the screen

`Screen.read()` (`render/screen.ts`) turns the DOM into the cells the pilot sees; where the DOM and the screen differ,
the reader follows the screen:

- A row may carry blank cells past the edge of its half page (the nearest selector of APT 1, VOR and NDB); they read as
  nothing. A visible character or an inverted cell past the edge is a rendering bug, and the reader throws.
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
- **`untilCalcTick(unit)`** (`boot.ts`) advances the clock in display ticks until a calculation tick has run, so the next
  is 750 to 1000 ms away. A test that asserts a state which lasts only until the next calculation tick (ARM after a Direct
  To) performs its last action after it: each click of the steps before is a display tick, so without it the phase of the
  calculation ticks moves with the click count and the test passes or fails by chance (#163, ModeControllerApproach).
- **`NEAREST_SEARCH_WAIT_MS`** (`boot.ts`, 12 s) is how long a test advances the clock for the nearest lists to hold
  their result. The nearest lists and the airspace alert search every 10 s (`NearestList.ts`, `AirspaceAlert.ts`), so
  12 s leaves one search and the time its result needs; a wait below one search interval reads an empty list. Its
  harness test covers the nearest airport list.
- **Time to first fix.** `bootUnit({coldGps: true})` resets the GPS after a forced acquisition and erases the cached
  ephemeris, without a power-on, so the start model (`GpsSearch.ts`) does not run: it acquires in about 70 s (slow;
  `IDLE_ACQUISITION` plus 30 s of ephemeris) whatever the almanac, the stored position or the clock, and cannot measure
  a hot, warm or cold start. For hot, warm, ACQ-give-up and almanac-search starts boot with `engineRunning: false` and
  the stored position, almanac time, `lastEphemeris` and `fastGpsAcquisition` in `storage`, then `powerOn()`; the GPS
  acquires while the welcome and self-test pages run. A warm start's time is drawn per power-on, so pass `seed` for
  the spread (`powerOnCold` in `GpsAcquisition.test.ts`).
- **`bootToSelfTest(opts)`** (`boot.ts`) boots cold and dark whatever `opts.engineRunning` says (the self-test follows
  the welcome page only on a unit that is not force-ready), powers on, advances 19 s (the 17 s Turn-On page and two
  seconds more) and returns the unit with the self-test page showing. It throws with `Screen.read().dump()` when the
  right half has no `APPROVE?` row. The page stays until ENT approves it, so a test that wants more time advances the
  clock itself. It stops there: approving, the data base page and the main page are `unit.panel.approveSelfTest()`
  (Flight, below). The hand-written copies of this boot stay where they are (see the
  [next steps](../docs/test-next-steps.md)).
- **`recordSounds(unit)`** (`sounds.ts`) returns `{ids, finishAll}`. `ids` lists the sound ids the unit requested on the
  bus topic `sound_server_play_sound` since the call, in order; install it before the action that sounds. The topic is
  not cached, so a recorder installed later starts empty. The sim plays one tone at a time and reports its end
  (`KLN90B.onSoundEnd`), which asks for the next, so a pattern is one id until the end is reported:
  `finishAll()` reports the end of the playing sound until no new one is requested (at most 20 times). The unit asks
  for sounds only when the panel.xml of the boot sets `Output.AltitudeAlertEnabled` to true (it defaults to false,
  #141), so a test of the sounds states `ALTITUDE_ALERT(true)`.
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
  needs one (the thousands cell of an NDB frequency below 1000 kHz) is entered with the knobs: the inner knob until
  the blank shows, the outer knob to the next cell, then the digits (`NdbPage.test.ts`). The hundreds cell of a
  longitude takes a typed 0 since #304 (`SupPage.test.ts` still selects it with the knob). A test of the raw H event presses it with
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
  `HEADING_INPUT`, `NO_GPS_SIMVARS`, `LEG_OBS_SWITCH`, `APR_ARM_SWITCH`, `NO_ALTIMETER`, `VFR_ONLY`, `AIRDATA`, `ALTITUDE_ALERT(enabled)` and
  `fuelComputer({unit, type, fob, fuelUsed})`. `extra` appends raw XML for what no key covers. It removes the silent
  default: the parser falls back to its default for a tag it does not find, so a misspelled tag in a hand-written
  document tests the default and passes. `panelXml` throws on a key outside the list, and
  `test/unit/harness/panelXml.test.ts` parses every key through the real parser and asserts the parsed setting differs
  from the default, so a misspelled entry of the list fails there. The altitude alert is a function so that a test
  states either value: the parser default is false (#141), and a test that needs the alerter states
  `ALTITUDE_ALERT(true)`.
- **Readers of the unit's state** (`readers.ts`). `userWaypoints(unit, type?)` lists the user waypoints of the facility
  repository in repository order, and the type is stated at the call: without it airports, VORs, NDBs and intersections
  of the user are in too, and `FacilityType.USR` is the supplementary waypoints only, so a local loop that forgets the
  filter reads the wrong set. `messages(unit)` lists the message list as the MSG page would, each message's lines joined
  with a blank, and `messageLines(unit)` keeps the lines apart. `fplIdents(unit, idx = 0)`, `identsOf(legs)`,
  `activeIdent(unit)` (undefined without an active waypoint) and `turnStackLength(unit)` read the navigation state;
  the last reads `turnStack` through the property each time, because `ActiveWaypoint` replaces the array (section 6).
  They read the unit's state, not the screen: use them where the state is the subject and `Screen` where the display is.
- **`hold(state, key, value)`** (`navState.ts`) holds a field of `NavPageState` (`unit.props.memory.navPage`) at a value:
  the field becomes an accessor that ignores every write, those of the calculation ticks included, until the teardown.
  It is for a value that the world of a test cannot produce, such as a cross track or an ETE of exactly 0 (#393: NAV 3,
  D/T 2, D/T 4). Where the aircraft can be flown to the value, fly it instead: a held field no longer follows the
  calculation, so the test says nothing about what computes it.
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
  `start`, `seed`, `atcModel`, `coldGps`, `efb`, `platform`, `defaultNavdata`). Without a `panelXml` it boots with
  `panelXml(HEADING_INPUT)`, because the coupled autopilot flies on the roll command, which needs a heading input (2-69,
  #143); a test that passes its own `panelXml` adds `HEADING_INPUT` itself. Airspaces are not a boot option here: they come from
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
      of them is named `ACT`. APT 7 is reached backward, so with SIDs and STARs it lands on the STAR page
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
    - `focused(side)` returns the one focused field `{row, col, text}`.
      `cursorTo(side, 'USER POS?')` turns the outer knob until that field has the cursor, stepping over the cursor
      positions that focus nothing (the SUP page without user waypoints has one after the ident characters). It turns
      clockwise and, once the cursor stops at the last field, counterclockwise, and throws with the screen after
      `maxClicks` or when the cursor stops at both ends. It throws at once when the status field of that side shows a
      page name, which means the cursor is off: the outer knob would turn the pages and the search would end on another
      page.
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

`turnDirection.test.ts` shows how to pin a bug that needs a flight: one test flies and records, a second judges the
recording (an `it.fails` until #100 was fixed), so a broken flight cannot be mistaken for the bug.

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
  `PowerSupply.test.ts` and `BrightnessManager.test.ts` are the examples.
- **Cite the manual page behind an expectation** in a comment (`// 4-8: ...`), the same as in the code. A test is a
  statement of the real unit's behavior, and the page is the evidence.
- **Which evidence decides.** The KLN 90B Pilot's Guide and its figures win. Where the guide is silent, a check on the
  KLN 89 trainer decides, cited as "checked in the KLN 89 trainer, *date*" and recorded in
  [kln89-trainer-record.md](../docs/kln89-trainer-record.md). The 89 is a different unit: behavior that exists only
  there (its block layout of some fields, its own texts, what follows from its single knob pair) never becomes a pin,
  and a test takes from it a wrap, a stop or a padding, not a layout. A photo of a real unit or a video counts when the
  test names it; the third-party AVsoftech KLN 90B trainer does not count.
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
  someone fixes the bug, which is the signal to remove `.fails`. Reference the GitHub issue. See the #370 pin in
  `test/render/pages/left/DirectToObs.test.ts`.
- **Prove a pin by fixing the bug, and keep heavy setup out of it.** An `it.fails` test passes on *any* failure, so a
  broken precondition inside it (a boot that threw, a wrong key sequence) is invisible: the pin stays green for the
  wrong reason. Prove a pin by fixing the bug temporarily and seeing the test turn red, then restore. Where it is cheap,
  keep the heavy preconditions in a sibling test that passes today and asserts them, so that a broken setup fails
  there. The pair in `passing a waypoint off course` (`test/render/data/navdata/NavCalculator.test.ts`) is the
  pattern: the control without turn anticipation beside the test with it, which was the #157 pin until the off-course turn
  start made it pass. `turnDirection.test.ts` shows it for a flight.
- **Keep runs deterministic.** The harness fixes the clock and the random seed. Do not read the wall clock in an
  assertion (`performance.now` is the wall clock, because the fake clock does not fake it).
- **Never commit manual content or navdata recorded from the sim.** The manuals are copyrighted: cite page numbers,
  paraphrase, and do not paste text, tables or screens from them. Facilities in tests are invented (`KAAA`, `ABC`).
  Screen snapshots of your own render of the instrument are fine.
- **A harness extension needs several users.** A helper goes into `test/harness/` when several tests need it, with a
  harness test of its own and a paragraph in section 4. A gap that serves one test is listed in the
  [next steps](../docs/test-next-steps.md) instead, and the test works around it. When a helper is added, the tests that
  carry a copy move onto it and keep their assertions; a copy stays only where the helper would change what the test
  asserts.
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
  by bounding box (inferred from a comment in `NearestUtils.getAirspacesAt`, not observed in the sim), and the nearest
  filters let an airport without runways pass the surface and length filters (the sim developers' rule, quoted to the
  maintainer from their code). A test that passes against the fake proves the instrument's use of those rules, not that
  the sim applies them.
- **The fake navdata is looser than the sim in two ways that hide bugs.** `MemoryFacilityClient` hands out one
  `IcaoValue` object per facility, the same in search results, in the nearest `added` and `removed` lists and in
  `getFacility`; the sim answers with new objects each time. Code that compares ICAOs by reference instead of with
  `ICAO.valueEquals` therefore passes against the fake: `6a6c634` fixed such a bug in `Scanlist`, and the removal in
  `NearestList.ts:107` would be the next (a break there survives the suite). The fake's `getFacility` also ignores its
  type argument and looks up by ICAO alone, so the type that `KLNFacilityLoader.getFacilities` passes down cannot be
  observed. The [next steps](../docs/test-next-steps.md) have the options.
- **One fact about real procedures came from a navigation database queried locally and is not committed.** The pattern
  `AF, CI (no fix), AF` around one navaid with two radii, which `SidStar` keeps as two arcs (#131), was found in an
  AIRAC 2607 export (five STARs). No row of it is in the repo (section 5 forbids recorded navdata), and the sim's own
  representation of the CI legs was not checked: the invented procedure of the #131 test in `SidStar.test.ts` is built
  from the pattern, not from the data.
- **There is no wind.** Ground speed and track equal airspeed and heading, so crosswind effects are not modeled.
- **`jump` skips integrated values**, and monitors and the recorder sample once per simulated second.
- **The 16 Hz loops** run every 62 ms in tests: the fake timers round the 62.5 ms interval down to whole milliseconds.
  The aircraft integrates the time that really passed, but the instrument's own 16 Hz signal loop (the XTK output
  filter) also runs at that rate, which matters for any future test of filter timing.
- **The XTK output follows the D-bar filter** (#158): `GPS WP CROSS TRK` is the deviation through an RC low-pass with
  τ = 0.24 s (`kln90b/services/SignalOutputFilter.ts`), so after a step it needs about 1 s (4 τ) to get within 2 % and
  3 s to settle to 4 decimals. Read it once it has settled (the self-test test in `NavCalculator.test.ts` reads it 30 s
  in), read `L:KLN90B_XTK` or `navPage.xtkToActive`, which are not smoothed, or test the filter itself at the unit
  stage, as `test/unit/services/SignalOutputFilter.test.ts` does: only `Date` is faked
  (`vi.useFakeTimers({toFake: ['Date']})`), a value is set every 1000 ms and the output sampled every 62 ms.
- **A booted engine-running unit starts with the MSG annunciator lit.** Empty storage means the last position is 0/0, so
  `POSITION DIFFERS FROM LAST POSITION BY >2NM` posts; that is a fact of the harness, and the NAV 2 screens of the
  harness tests show its `msg`. Seeding a last position in `storage` (`lastLatitude`, `lastLongitude`) removes it. A
  test that needs a message in the live list as a guard (that the list is read at all) uses `POSITION DIFFERS` with
  empty storage, or posts a message of its own with
  `unit.props.messageHandler.addMessage(new OneTimeMessage([...]))` when its storage holds the position
  (`Set1Page.test.ts`).
- **Long render tests need their own timeout.** The render stage keeps Vitest's 5 s default. A test that advances
  minutes of simulated time with every tick running can pass alone and time out while other suites load the machine,
  which makes a mutation run report a false kill. Give such a test a per-test timeout (the CAL 6 tests in
  `VolatileMemory.test.ts`).
- **One live unit per test.** `bootUnit` refuses a second boot in the same test, because the singletons allow one unit
  at a time. A singleton the teardown does not know shows up as a test that passes alone and fails in its file.
- **SDK upgrades may require updating the fakes.** `FakeSim` mirrors the native layer the SDK builds on, and
  `KLNGPSSatComputer` reaches into private SDK internals (docs/architecture.md, Core 3); recheck both, and run the whole
  suite, after upgrading `@microsoft/msfs-sdk`. `KLNGPSSatComputer` (`Gps.ts`) reads `activeSimulationContext.channels`
  and the computer's own private `lastAlamanacTime`, sets the private `satelliteTimingOptions` (the per-power-on
  acquisition time of the start model) and writes the satellites' private `data.lastEphemerisTime` (the persisted
  ephemeris), all through `as any`, which no type error reports. The SDK's `simTime` and `distanceFromLastKnownPos` are
  no longer read. The start model uses only public API besides: `createPredictionContext`, `setSatelliteInhibit`,
  `syncLastKnownPosition`, `eraseLastKnownPosition`; the harness's `coldGps` uses `eraseCachedEphemeris`.
  `GpsAcquisition.test.ts` holds these fields. After an
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
- **STA 5 predicts through `gps.raimPrediction`**, a prediction context of the main computer, and the harness tests it
  (#214). The page used to build its own `GPSSatComputer` with the sync role `'primary'`, which never finishes `init()`
  in the harness (its `SharedGlobal` never resolves). The DOP of a fresh context reads 0, which the page counts as
  available, so a test that reads only the bars cannot see whether `predict()` ran; the call test spies on both
  `setPosition` and `predict`.
- **TypeScript 6 no longer includes `@types` automatically.** Harness files that use Node APIs carry
  `/// <reference types="node" />`. The directive makes the Node types available to the whole `tsc` program, because the
  `include` of the root `tsconfig.json` compiles `kln90b/` and `test/` together; it does not keep Node APIs out of the
  code in `kln90b/`, so `tsc` will not catch an accidental Node call there.
- **Errors thrown on the ENT path reach the error page.** The ENT paths hand their promise to `reportErrors`
  (`controls/ErrorPage.tsx`), so an error there reaches the `error` topic like any input error (#118). The harness
  still collects unhandled rejections and fails a test that leaves one untaken (section 3). Deeper drops remain: an
  async `enterCallback` that `Editor.enter` and `WaypointEditor.currentValueConfirmed` do not await (such as
  `RefPage.calcRef`), `onCharChanged`, and the async selections of APT 7 and APT 8. A throw there is still an unhandled
  rejection, and catching it would mean awaiting it, which changes when ENT completes. A test that provokes one takes
  it with `unit.takeRejections()` (section 4).
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
  throws on a character past column 11 (below). A test of an overflow (a distance that rounded up to its cutoff, #226)
  selects its page first, then moves the aircraft into the overflow, and a setup sibling that must see the overflowing
  row reads the raw row with `readRows` (`Nav1Page.test.ts`, `Nav3Page.test.ts`).
- **The fuel computer reads `NUMBER OF ENGINES` once, while it is built.** A test without the `simVars` option
  (section 4) counts no real engine and sees every fuel flow and every fuel used as 0. The pages that show them exist
  only with the matching interfaces: OTH 5 to OTH 8 with the fuel computer and OTH 9 and OTH 10 with the air data
  computer (`PageTreeController` removes them otherwise), so their tests boot with both the panel.xml and the SimVar.
- **A bus subscription added after boot is called at once with the last cached value.** A test that subscribes to a
  topic and expects to see only new events must skip that first call (or count from a reference taken after
  subscribing).
- **`Screen.read()` throws on a visible character, or an inverted cell, past column 11 of a half page.** A row
  that pushes its type letter off the half page is a rendering bug. Blank cells past the edge, such as the trailing
  blanks of the nearest selector on APT 1, VOR and NDB, are tolerated.
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
  sound-end handling needs a `Name_Z` global, neither of which the harness provides (see the
  [next steps](../docs/test-next-steps.md)). The tests report the end of a tone by calling `AudioGenerator.onSoundEnd`
  themselves, as `KLN90B.onSoundEnd` does in the sim.
- **APT 6 cannot show real service data.** The sim's facilities carry no fuel, oxygen or fee data, so `Apt6Page` shows
  its fixed texts (`NO FUEL`, `NO OXYGEN`, `NO FEE INFO`; `formatFuel` says the fuel fields are always empty). The APT 6
  snapshot holds those texts, and no test can show the page with services.
- **The IAF list of APT 8 and ACT 8 is placed by the reader, not by layout.** happy-dom computes no CSS positions, so
  `Screen.read()` moves the rows of `.apt-8-iaf-list` by a fixed four cells (section 3). A change of the list's position
  in `KLN90B.scss` would not show in a test; the reader only throws when the list no longer starts in cell 4.
- **A class with no visible effect is invisible to the reader.** `Screen` follows the CSS (section 3), so an
  `inverted-blink` left on a cell without `inverted` reads as a plain cell, as it renders. A control that forgets to
  remove the class (the cell under the cursor after the cursor is turned off, for example) passes every mask assertion
  until another class makes the leftover visible; only the page tests that read the row next to it catch such a slip.
- **The editor's autocompletion depends on the fake's search order.** `WaypointEditor.onCharChanged` asks the facility
  search for one result, and `KLNFacilityLoader` sorts only what it got, so "digits before letters" (3-21) holds because
  `MemoryFacilityClient` returns sorted results. Whether the sim returns them in that order is not known (see the
  [next steps](../docs/test-next-steps.md)); the selectors sort a hundred results themselves and do not depend on it.
- **`FakeCoherent.on`, `off` and `trigger` are no-ops.** The keyboard tests focus the input by hand; a test cannot see
  `FOCUS_INPUT_FIELD` or `UNFOCUS_INPUT_FIELD`, nor emit `mousePressOutsideView`, so the click outside the instrument
  and the unfocus of `PageContainer.destroy` have no test.
- **Some editor code cannot be reached in a booted unit.** The null branch of `TimeEditor.convertToValue` needs a host
  without a time, and SET 2 always has one.
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
- **CI runs only once a commit reaches GitHub.** Run `npm test` and `npx tsc --noEmit` before committing.

Measured speed (a dated record): on 2026-10-03 the proof flight (`firstFlight.test.ts`) ran about 1466 simulated
seconds in 1.0 to 1.2 s of wall time, roughly 1200 to 1450 times real time, with every tick running. The test prints a
`[flight-speed]` line with `console.warn`; it shows only under `npx vitest run --reporter=verbose`.
