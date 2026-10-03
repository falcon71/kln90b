# Test harness design

Date: 2026-10-03. Status: approved in brainstorming, pending spec review.

## Goal

Give the project automated tests at three stages, each proven by one short but realistic test, and document them:

1. **Unit tests** for pure logic and data formats.
2. **Render tests** that check what the 23×7 screen shows, including the canvas maps.
3. **Flight tests** that boot the whole unit without the simulator, enter a flight plan through the front panel, fly it
   with a coupled autopilot in compressed time (with jump-ahead), and check SimVars, screen and calculated values.

Out of scope: broad coverage, CI, fixing bugs found on the way, an in-sim navdata recorder.

## Constraints

- **No behavior change.** Production changes are limited to what enables testing (the composition-root extraction
  below). The public contract with aircraft (H events, LVars, panel.xml keys, GPS SimVars, persisted data formats) is
  untouched.
- Bugs found while building are checked against GitHub issues and filed if new (done so far: #97). Tests pin a known
  bug with `test.fails` and the issue link instead of fixing it.
- `target: es2017` and the rollup build stay as they are; test code is never bundled.
- Never commit manual content or navdata recorded from the sim.

## Decisions

| topic | decision | main reason |
|---|---|---|
| test runner | **Vitest** | handles the SDK's ESM-without-`type:module`, the custom `jsxFactory` and `.scss` with little config; per-project environments; fake timers incl. `Date` |
| DOM | **happy-dom** | FSComponent renders through plain `document.createElement`; happy-dom is fast and sufficient |
| canvas | **@napi-rs/canvas** behind `HTMLCanvasElement.prototype.getContext` | happy-dom returns `null` for `getContext('2d')`; prebuilt Skia binaries need no build tools; verified with `kln90b-map.ttf` |
| screen assertions | 23×7 text grid + attribute mask; canvas as ASCII pixel art | the display is a character grid; text diffs review well |
| assembling the unit | **composition root** (`Kln90bCore`) + small `Kln90bPlatform`; `KLN90B` becomes a thin `BaseInstrument` adapter | tests and production run the same build code; no faking of the sim's undocumented `BaseInstrument` |
| leaf sim access | stays global (`SimVar`, `Coherent`, timers) and is faked globally | small stable APIs; wrapping them would touch nav and UI code everywhere |
| pilot | pluggable; default **coupled autopilot** flying `L:KLN90B_RollCommand` | closed loop tests the guidance, not only the math |
| time | `fly()` = compressed, every tick; `jump()` = slew-style teleport plus clock jump, refuses to cross a waypoint | full fidelity where it matters, near-free cruise |
| navdata | synthetic builders; the memory source also loads plain JSON | readable tests, no licensing question; recorded data can come later |
| flight plan entry | front-panel driver in the proof flight; seeded storage available | proves the input path; fast setup for later tests |

## Tooling and layout

- Dev dependencies: `vitest`, `happy-dom`, `@napi-rs/canvas`.
- Scripts: `npm test` (`vitest run`), `npm run test:watch` (`vitest`).
- `vitest.config.mts` declares three Vitest projects:

| project | files | environment | setup files |
|---|---|---|---|
| `unit` | `test/unit/**/*.test.ts` | node | load-time SDK globals (`SimVar`, `RunwayDesignator`, `Avionics`, `BaseInstrument`, `KeyCode`, others found while wiring) |
| `render` | `test/render/**/*.test.ts(x)` | happy-dom | sim fakes, canvas backing, map font |
| `flight` | `test/flight/**/*.test.ts` | happy-dom | sim fakes, canvas backing, map font |

- esbuild takes the JSX factory from `tsconfig.json`; `.scss` imports are ignored in tests.
- `tsc --noEmit` type-checks the tests and harness too (add Vitest types; keep `kln90b/` free of test code).
- Directory tree:

```
test/
  harness/
    globals/       load-time SDK stubs (unit project)
    sim/           FakeSimVars, Coherent/RegisterViewListener, DataStore, XHR, magvar, clock, seeded random
    navdata/       facility builders, MemoryFacilityClient
    render/        screen reader, canvas backing, canvasToAscii
    flight/        Flight, World, Aircraft, pilots, FrontPanel, monitors, recorder
    platform.ts    FakePlatform implementing Kln90bPlatform
  unit/
  render/
  flight/
    __output__/    recorder output on failure (gitignored)
  fixtures/
```

## Stage 1: unit tests

- Proof test: a round trip through the V2 user-waypoint format, `UserWaypointPersistor` serialization and
  `UserWaypointLoaderV2` loading, for APT, VOR, NDB and INT, plus a fixed literal V2 string. Expected values are
  literals. If the persistor proves too entangled for a first test, fall back to the turn math in `KLNNavmath`.
- Bug pin: `test.fails` for `KLNNavmath.intermediatePoint` (#97). It asserts the correct great-circle midpoint and end
  point (computed independently), so it fails today and turns red once the bug is fixed.

## Composition root (production change)

New file `kln90b/Kln90bCore.ts`:

- `class Kln90bCore`:
    - `constructor(platform: Kln90bPlatform)` does what the `KLN90B` constructor does today: bus, user settings, settings
      load and auto-save under `"<ATC MODEL>.profile_1"`, `HEventPublisher`, keyboard subscription, `PageManager`.
    - `init(xmlConfig: Element): Promise<void>` is today's `asyncInit` body, moved verbatim. Statement order is kept:
      the welcome page can show before the navdata awaits, and the tick lists keep their order.
    - `onInteractionEvent(evt: string)`, `onSoundEnd(id)` and the keyboard mapping move over unchanged.
    - Exposes for tests: `bus`, `pageManager`, and a `propsReady: Promise<PageProps>`.
- `interface Kln90bPlatform`:
    - `createFacilityClient(bus)` returns the facility-client methods `KLNFacilityLoader` calls on its inner loader.
      Production: `new FacilityLoader(FacilityRepository.getRepository(bus))`.
    - `getFacilityRepository(bus)`. Production: `KLNFacilityRepository.getRepository(bus)`.
    - `getRouteManager()`. Production: `FlightPlanRouteManager.getManager()`.
- `KLN90B extends BaseInstrument` keeps `templateID`, `isInteractive`, `Init`, `onInteractionEvent`, `onSoundEnd`,
  `connectedCallback` and `registerInstrument('kln-90b', KLN90B)`, and forwards to the core with `SimPlatform`. The
  `ErrorEvent` publication on init failure stays.
- `KLNFacilityLoader`'s constructor type is narrowed to the interface of the methods it uses, if needed, without
  changing its behavior.
- Verification: `tsc`, build, and a manual check in the sim (cold-and-dark start with self-test, engine-running start,
  a direct-to, a saved flight plan surviving a restart, hot swap via `L:KLN90B_Disabled`).

## Global sim fakes

Installed by the setup files. Vitest isolates modules per test file, which also resets the settings and repository
singletons; one unit per test file is the rule for now.

- **FakeSimVars** (`SimVar.GetSimVarValue`/`SetSimVarValue`):
    - normalizes names (`L:`, `E:`, `:index` suffixes);
    - stores value and unit; converts within known unit families (angle, distance, speed, bool, number);
    - **throws on an unknown conversion** so unit mistakes fail loudly;
    - keeps a timestamped write log; `K:` writes go to a separate event log;
    - `SetSimVarValue` returns a resolved promise, like the sim.
- **Coherent / RegisterViewListener**: listener objects whose `on`/`off`/`call`/`trigger` are recorded; replies are
  configurable and default to a never-resolving promise.
- **Facilities.getMagVar**: answered by the test world (uniform value or a function).
- **GetStoredData / SetStoredData**: in-memory store, seedable before boot.
- **XMLHttpRequest**: serves `coui://html_ui/...` from `resources/`, so the real ephemeris, SBAS and MSA files load.
- **Clock**: Vitest fake timers for `setInterval`, `setTimeout`, `Date`, `requestAnimationFrame`.
  `E:ABSOLUTE TIME`, `E:SIMULATION TIME` and related time variables are derived from the fake clock.
- **Math.random**: replaced by a seeded generator per test.

## Fake navdata

- Builders `airport(ident, lat, lon, opts)`, `vor(...)`, `ndb(...)`, `intersection(...)` produce SDK facility objects
  with plausible defaults (ICAO values, region, frequencies, runways).
- `MemoryFacilityClient` implements the facility-client interface: `getFacility`, ident search, and nearest search
  sessions backed by SDK `GeoKdTree`s. It also loads arrays of plain facility JSON. Boundary searches return no
  airspaces.

## Stage 2: render tests

- Props come from the real composition root built with the fake platform (unpowered, not flying), never a hand-made
  `PageProps`.
- **Screen reader** (`test/harness/render/screen.ts`):
    - walks `#pageContainer`, skips `d-none` subtrees, maps `<br>` to a new row and `&nbsp;` to a space;
    - joins left half page (11 columns), a `|` separator, right half page (11 columns); full-width overlays are 23
      columns; row 7 is the status line;
    - always returns 7 rows of 23 cells, padded so missing cells are visible;
    - keeps the font's code points (`›`, `η`, `á`, ...) and the small lowercase glyphs as they are;
    - **mask**: a parallel grid with `.` normal, `I` `inverted`, `B` `blink`, `F` `inverted-blink`;
    - API: `text()`, `mask()`, `row(n)`, `cell(row, col)`, `dump()`.
- Display changes are driven by advancing the unit's fake clock, never by calling `tick()` directly, so blink phases
  are real.
- **Canvas**: the setup file patches `getContext('2d')` to return a lazily created `@napi-rs/canvas` context sized to
  the element; `kln90b-map.ttf` is registered as `KLN90BMap`. `canvasToAscii(el, threshold)` returns `#`/`.` rows. Map
  snapshots use `toMatchFileSnapshot`.
- Proof test: boot with the engine running at a fixed position near a builder VOR; after the GPS solution, assert the
  full screen (NAV 2 left, SUP right, status line with `NAV 2` and `enr-leg`) as an inline snapshot and check the mask.
  The radial and distance are computed independently from the test geometry.
- Canvas smoke test: a canvas created in happy-dom draws real pixels, including map-font text.

## Stage 3: flight tests

### Start

```ts
const world = new World({magvar: 2})
    .add(airport('KAAA', 47.0, 8.0, {elevation: 1400}))
    .add(vor('ABC', 47.5, 8.9, {frequency: 114.3}))
    .add(airport('KBBB', 47.9, 9.8, {elevation: 1500}));
const flight = await Flight.start({
    world,
    aircraft: {at: world.pos('KAAA'), altitude: 3000, groundspeed: 120, track: 45},
    pilot: coupledAutopilot(),
    panelXml: undefined,   // optional PlaneHTMLConfig snippet; parser defaults otherwise
    storage: undefined,    // optional seeded user data, e.g. saved flight plans
    engineRunning: true,   // ENG COMBUSTION:1, skips the self-test
});
```

`Flight.start` installs the world into the fakes, builds `Kln90bCore` with the fake platform, calls `init()`, and
resolves once `propsReady` fired and the GPS solution is valid. (Coordinates above are illustrative.)

### Aircraft and pilots

- Kinematic point mass stepped at 16 Hz on the fake clock. Bank follows the commanded bank at a configurable roll rate
  (default 5°/s) up to a configurable maximum (default 25°); turn rate is g·tan(bank)/v; ground speed constant or
  scripted; optional wind.
- Each step writes what the unit reads: `PLANE LATITUDE/LONGITUDE`, `GROUND VELOCITY`, `PLANE HEADING DEGREES
  GYRO/TRUE`, `PLANE ALTITUDE`, `PRESSURE ALTITUDE`, `AIRSPEED TRUE`, `GPS DRIVES NAV1` and the others found while
  wiring.
- `Pilot` interface with `coupledAutopilot()` (flies `L:KLN90B_RollCommand`, positive = left; wings level while the
  command is null), `scriptedPath(points)` and `manual()`.

### Time

- `await flight.fly(seconds)` and `await flight.flyUntil(predicate, {timeout})` use `vi.advanceTimersByTimeAsync`, so
  every interval fires in order and async ticks get their promises flushed.
- `await flight.jump(nmBefore(ident, nm) | minutes(n))` moves the aircraft along its current path, advances the fake
  `Date` and the sim-time variables without firing ticks, then runs one display and calc cycle. It throws if the jump
  would cross the active or a future waypoint. Integrated quantities (flight timer, fuel used) do not include the
  jumped span.

### Front panel

- `flight.panel` sends events through `core.onInteractionEvent`, the H-event path: `leftOuter(n)`, `leftInner(n)`,
  `rightOuter(n)`, `rightInner(n)`, `cursor('L' | 'R')`, `ent()`, `clr()`, `dct()`, `msg()`, `alt()`, `scan()`, `power()`.
- Helpers built only on those events: `selectPage(group, n)` (reads the status line to find the current page),
  `enterIdent(ident)`, `appendToFpl0(idents)` including the confirmation ENTs.

### Observation

- `flight.sim.get(name, unit)`, `flight.sim.log`, `flight.sim.events`.
- `flight.screen` (the stage 2 reader).
- `flight.nav`: read-only view of `memory.navPage` (active waypoint, DIS, DTK, XTK, TO/FROM, nav mode).
- `flight.aircraft`: ground truth.
- `flight.monitor(name, predicate)`: evaluated after every calc tick; failures are collected with sim time and fail the
  test at the end. Built-in monitors: no `error` on the bus, no `console.error`, GPS SimVars finite.
- Recorder: 1 Hz in memory (aircraft, nav state, key SimVars, screen text). On failure, written to
  `test/flight/__output__/<test>.jsonl` and `<test>.kml`.

### Proof flight

1. Start airborne near KAAA at 3000 ft and 120 kt, engine running.
2. Enter FPL 0 `KAAA ABC KBBB` through the front panel.
3. `fly` until the unit sequences at ABC. Assert:
    - the waypoint alert (`L:KLN90B_WptLight`) came on before sequencing;
    - sequencing happened before the aircraft reached ABC (turn anticipation);
    - `GPS WP NEXT ID` changed to `KBBB`;
    - |XTK| < 0.3 NM outside the turn (monitor).
4. `jump` to 10 NM before KBBB, then `fly` until within 1 NM.
5. Assert DIS against an independently computed distance, and NAV 1 on screen showing KBBB with matching DIS and DTK.
6. Report wall time and measured simulated seconds per wall second.

## Stage 4: documentation

- New `docs/testing.md`:
    1. the three stages and which to use (cheapest stage that can observe the behavior);
    2. running tests;
    3. harness architecture (composition root, platform, global fakes and their gaps, per-file isolation);
    4. writing each kind of test, using the proof tests as worked examples (mask legend, canvas snapshots, flight API,
       `jump` caveats, recorder and KML);
    5. conventions: cite the manual page behind an expectation, derive expectations independently, pin known bugs with
       `test.fails` plus the issue, keep runs deterministic, never commit manual content or recorded sim navdata;
    6. limitations: happy-dom is not Coherent GT (no layout, CSS, glow), Skia text pixels differ, synthetic navdata
       without procedures or airspaces, `jump` skips integrated quantities, fakes and `KLNGPSSatComputer` must be
       rechecked after SDK upgrades, no CI;
    7. next steps, e.g. a power-cycle flight test for #90 (OTH pages pruned again on each `MainPage` construction).
- `CLAUDE.md`: replace "There are no automated tests ..." with the commands and a pointer to `docs/testing.md`; ask for
  a test at the cheapest stage that can observe a behavior change.
- `docs/architecture.md`: Core 1 describes `Kln90bCore`, `Kln90bPlatform` and the thin adapter; update the "as of"
  line.

## Build order

1. Tooling and the unit stage (no production change).
2. Composition-root extraction; verify `tsc`, build and the manual sim check.
3. Sim fakes, fake navdata, fake platform; a boot smoke test.
4. Render stage.
5. Flight stage.
6. Documentation.

## Acceptance criteria

- `npm test` runs all three projects green; each project also runs alone.
- `tsc --noEmit` and `npm run build` are clean apart from the pre-existing warnings.
- The unit proof test and the #97 `test.fails` pin pass.
- The render proof test asserts a full 23×7 screen and its mask; the canvas smoke test passes.
- The proof flight enters its plan through the front panel, uses both `fly` and `jump`, checks SimVars, screen and nav
  values, and completes in a few seconds of wall time.
- Review verifies each proof test by mutation (the mutations are chosen at review time and not named in advance); the
  tree is clean afterwards.
- The sim check after the composition-root extraction shows no behavior change.
- `docs/testing.md`, `CLAUDE.md` and `docs/architecture.md` are updated.

## Risks

- **The boot touches more sim APIs than found so far.** Mitigation: the boot smoke test in step 3 fails on the first
  missing global, and each new fake gets added to the doc's list.
- **SDK internals** (`GPSSatComputer` private fields, the facility-client interface) can change with SDK upgrades.
  Mitigation: typed platform seam; the doc lists what to recheck.
- **Flight speed.** Display ticks redraw the DOM; if compressed flying is too slow, `jump` covers cruise, and the
  measured rate is reported so a later decision (for example a display-off mode) can be made on data.
- **Composition-root move breaks startup ordering.** Mitigation: verbatim move, same order, sim check list above.
