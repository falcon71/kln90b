# KLN 90B testing guide

Companion to [CLAUDE.md](../CLAUDE.md) and [architecture.md](architecture.md). It explains how the automated tests are
organized, how to write one, and what they cannot tell you. All paths are relative to the repo root.

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
   `ENG COMBUSTION:1`, and so on).
2. Writes saved user settings into `FakeStorage` if the test passes `storage`.
3. Builds a `KLN90BCore` with a `FakePlatform` around a `MemoryFacilityClient` and calls `init()` with a panel.xml
   document (`MINIMAL_PANEL_XML` unless `panelXml` is given).
4. Advances simulated time until `propsReady` fires, and returns the `HeadlessUnit`: `core`, `props` (the `PageProps`
   bag), `env` (the fakes), `navdata`, `errors` (everything published on the `error` topic), `atcModel` (the model the
   unit booted with, which is part of the key its settings are saved under), `send(evt)` and `panel` (the front panel).

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
    - `sim.writes`, `sim.lastWrite(name)` and `sim.keyEvents` log what the instrument wrote.
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
- `Math.random` is replaced by a seeded generator (`sim/random.ts`, default seed 1), so the GPS clock jitter and scan
  list job ids repeat between runs. A test that needs another jitter passes `seed`.

## Navdata

`MemoryFacilityClient` (`navdata/MemoryFacilityClient.ts`) is the navdata the unit sees: a set of facilities built
with `airport()`, `vor()`, `ndb()` and `intersection()` (`navdata/builders.ts`). The builders fill every field the
instrument reads and nothing else. The data is synthetic; see the limitations in section 6.

`savedFlightplan(idx, legs)` (`test/harness/storage.ts`) returns user data in the V2 format (docs/architecture.md,
Core 7). Pass it as `storage` to start a test with a flight plan already stored, which is far faster than entering it
with the knobs.

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
  Core 2), and a test that calls a tick method by hand skips the ordering the real unit has.
- `Screen.read()` (`render/screen.ts`) returns the 23×7 screen: six rows of two half pages or one full page, plus the
  status line as row 6.
    - `text()`, `row(n)`, `half('L' | 'R')`, `leftName()`, `rightName()` and `cell(row, col)` read it.
    - `mask()` shows the attributes per cell: `.` normal, `I` inverted, `B` blinking, `F` flashing inverse.
    - `dump()` is the text, a blank line and the mask. It is the format for snapshots and for failure messages.
- **`settle(unit)`** (`boot.ts`) advances the clock until the GPS has a solution, then two calculation ticks more, so that
  FPL 0 has activated and the display shows it (a force-ready boot is valid at once, but FPL 0 activates only at the first
  calculation tick). It throws when there is no fix within its cap (120 s by default).
- **`storedSetting(unit, name)`** (`storage.ts`) returns the parsed value the unit saved under a user setting, and
  `undefined` for a key never saved. The unit saves a moment after the change, so advance the clock first. Use it instead
  of building the `persistent-setting.<model>.profile_1.` key by hand.
- **`unit.panel.type(side, text)`** types characters with the keyboard (`KLN90B_Internal_Key`), one display tick each, with
  that side's cursor on. It is how the ident selectors of the APT, VOR, NDB, INT and SUP pages take input.
- Prefer `toMatchInlineSnapshot` on `screen.dump()` for a whole page, and `toEqual` on `half()` rows when only part of a
  page matters. Snapshots are text, so the diff in review is the diff of the screen.
- Special glyphs stay as the code points the font maps them to (docs/architecture.md, UI 3). Copy them from the
  failure output rather than typing them.
- The cursor and the blink phase change the mask. If a test is flaky on `B` or `F` cells, assert text only.
- **Canvas pages** (NAV 5, Super NAV 5, APT 3 draw maps): `canvasToAscii(el)` returns the pixels as `#` and `.`. Snapshot
  it with `toMatchInlineSnapshot` as `test/render/harness/canvas.test.ts` does for a tiny canvas. For a map that is too
  large to read inline, `toMatchFileSnapshot('./__snapshots__/name.txt')` keeps it in a file.
- `Screen` skips `<canvas>` subtrees (their fallback text) and cannot read Super NAV 5, which is a `SevenLinePage` made
  of CSS-positioned `<pre>` blocks. It throws on a full page with more than six rows.

## Flight

A flight test boots the unit with an aircraft in a world, then flies on simulated time.

```ts
const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
const flight = await Flight.start({world, aircraft: {lat, lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1}});
await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);
await flight.flyUntil(() => flight.nav.activeIdent === 'ABC', {timeout: 30, description: 'ABC active'});
```

(`test/flight/flights/firstFlight.test.ts`, the proof flight.)

- **`World`** holds the facilities and the magnetic variation. Idents must be unique within a world.
- **`Flight.start(opts)`** boots the unit, starts the aircraft and flies until the GPS has a solution. Call it inside a
  test, because it registers `onTestFailed`. Besides `world` and `aircraft` it takes `aircraftOptions` (roll rate,
  maximum bank), `pilot`, and the `BootOptions` that make sense in flight (`storage`, `panelXml`, `engineRunning`,
  `start`, `seed`, `atcModel`).
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
    - Helpers: `selectPage(side, 'FPL 0')`, `enterIdent(side, ident)`, `type(side, text)` and `appendToFpl0(idents)`.
    - `enterIdent` does not blank the positions past a short ident, so an autocompleted longer ident leaves a tail.
      Enter long idents first, or prefer `savedFlightplan` for setup.
- **Monitors:** `flight.monitor(name, check)` adds a check that runs once per simulated second and returns `true` or a
  description of what is wrong. Built-in monitors fail the test on an error published to the bus, a SimVar unit error,
  any `console.error` and a non-finite GPS output. The `console.error` wrapper that counts is removed again when the
  test finishes, so a file may hold several flights. A monitor sees whole seconds only, so a transient shorter than a
  second can slip through.
- **The recorder** keeps one row per simulated second (position, track, bank, `nav`, a few SimVars and the screen text).
  When a flight test fails, it writes `test/flight/__output__/<test name>.jsonl` and `.kml`. Open the KML in Google Earth
  to see the track against the waypoints, and the JSONL to see what the unit showed at each second.
- **Display versus calculation:** both ticks fall due together once a second, and the display tick runs first, so the
  screen can show the previous second's calculation. Before asserting on the screen against `flight.nav`, fly display
  ticks until one passes without a calculation tick (see the end of the proof flight).

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
  evidence of correctness. A characterization test carries no manual citation. When the code and the manual disagree,
  the test asserts the manual and is pinned as a known bug (below); a snapshot never freezes a visible bug as correct.
- **Public-contract tests are spec tests whose source is the contract.** Tests of the public contract with aircraft (H
  events, LVars, panel.xml keys, GPS SimVars) and of the persisted-data formats (setting keys, the V1/V2 waypoint and
  flight-plan strings) have no manual page behind them. They need neither a manual citation nor the word
  `characterization`; they cite their source in a comment instead: `CLAUDE.md` "Public contract with aircraft", the doc
  comments in `HEvents.ts` and `LVars.ts`, or the formats in `docs/architecture.md` (Core 7). The tests of
  `PowerButton.test.ts` and `BrightnessManager.test.ts` are the examples.
- **Cite the manual page behind an expectation** in a comment (`// 4-8: ...`), the same as in the code. A test is a
  statement of the real unit's behavior, and the page is the evidence.
- **Derive expected values independently.** Never compute the expectation with the function under test or with the
  SDK's flavor of the same formula. `flight/geo.ts` is a haversine written from the textbook; its earth radius is the
  sphere of the SDK's `UnitType.GA_RADIAN` (`6378100 / 1852` NM), which the instrument computes on, so the numbers
  agree while the formulas stay independent. Prefer literals, and derive bounds from physics where a literal would be a
  guess (the turn-start bounds above).
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
- **The navdata is synthetic.** `MemoryFacilityClient` ignores nearest-search filters (airport surface and length, VOR
  class, and so on) and has no airspaces and no procedures, so SUA alerts, SIDs, STARs and approaches cannot be tested
  yet.
- **There is no wind.** Ground speed and track equal airspeed and heading, so crosswind effects are not modeled.
- **`jump` skips integrated values**, and monitors and the recorder sample once per simulated second.
- **The 16 Hz loops** run every 62 ms in tests: the fake timers round the 62.5 ms interval down to whole milliseconds.
  The aircraft integrates the time that really passed, but the instrument's own 16 Hz signal loop (the XTK output
  filter) also runs at that rate, which matters for any future test of filter timing.
- **A booted engine-running unit starts with the MSG annunciator lit.** Empty storage means the last position is 0/0, so
  `POSITION DIFFERS FROM LAST POSITION BY >2NM` posts, and the GPS clock starts an hour behind, so
  `SYSTEM TIME UPDATED TO GPS TIME` posts. The NAV 2 snapshot shows it. Seeding a last position in `storage`
  (`lastLatitude`, `lastLongitude`) removes only the first message; the second still posts on an engine-running boot
  (the hour is not added back when `forceReadyToUse` skips the power-on), so no `storage` setting gives an unlit MSG
  annunciator.
- **One live unit per test.** `bootUnit` refuses a second boot in the same test, because the singletons allow one unit
  at a time. A singleton the teardown does not know shows up as a test that passes alone and fails in its file.
- **SDK upgrades may require updating the fakes.** `FakeSim` mirrors the native layer the SDK builds on, and
  `KLNGPSSatComputer` reaches into private SDK internals (docs/architecture.md, Core 3); recheck both, and run the whole
  suite, after upgrading `@microsoft/msfs-sdk`.
- **TypeScript 6 no longer includes `@types` automatically.** Harness files that use Node APIs carry
  `/// <reference types="node" />`. The directive makes the Node types available to the whole `tsc` program, because the
  root `tsconfig.json` has no `include`; it does not keep Node APIs out of the code in `kln90b/`, so `tsc` will not catch
  an accidental Node call there.
- **Display limits:** `Screen` cannot read Super NAV 5 and skips `<canvas>` content (section 4).
- **Errors thrown on the ENT path never reach `unit.errors`.** `MainPage` starts `handleEnter` without awaiting it, so a
  throw becomes an unhandled rejection instead of an `error` event (the exception handling of ticks and sync input
  does not see it). The test that caused it stays green; Vitest reports an unhandled error after the fact, fails the run
  and names the last test that ran, which is not necessarily the culprit. So a test that only asserts `unit.errors` is
  empty cannot show a broken ENT. Assert a visible effect of the ENT (the page, the status line, the stored value),
  and when the run fails with an unhandled error, look for the test that pressed ENT before the one it names.
- **The render harness does not fail on `console.error`.** Only `Flight` counts it (the `no console.error` monitor,
  which also counts the boot). A render or unit test that must notice a logged error has to spy on `console.error`
  itself, and restore the spy afterwards.
- **`FrontPanel.enterIdent` cannot type into the ident selectors** of the APT, VOR, NDB, INT and SUP pages (the waypoint
  selectors). Use `unit.panel.type(side, text)`, with the cursor on and the field entered.
- **While a cursor is on, the status line shows `CRSR`** and `leftName()` and `rightName()` are shifted by one cell
  (`APT 1` reads `PT 1`; with the right cursor on, `rightName()` is `CRSR`). Read `row(6)` or turn the cursor off before
  reading a page name.
- **A bus subscription added after boot is called at once with the last cached value.** A test that subscribes to a
  topic and expects to see only new events must skip that first call (or count from a reference taken after
  subscribing).
- **`Screen.read()` throws on a half page wider than 11 cells**, and the DOM of some right pages is wider: the ACT page
  with an active index (the NDB row, #115) and the APT 1 and VOR rows, which carry the four trailing blanks of the
  nearest selector. `FrontPanel.selectPage('R', …)` only turns the outer knob forward, so it throws when it has to
  pass such a page (from the boot page SUP, any page after NDB, and INT or VOR going the long way round). Navigate with
  fixed counts (`outer('R', -1)` from SUP reaches INT) or read the half page's DOM with `readRows`.
- **A booted engine-running unit has a GPS fix at once**, in the slow acquisition mode too (the force-ready start calls
  `acquireAndUseSatellites()` in `WelcomePage`). A test that needs an invalid GPS, for example to enter the date on SET 2
  (read-only with a fix), boots with `coldGps: true`.
- **There is no CI.** Run `npm test` and `npx tsc --noEmit` before committing.

Measured speed (a dated record): on 2026-10-03 the proof flight (`firstFlight.test.ts`) ran about 1466 simulated
seconds in 1.0 to 1.2 s of wall time, roughly 1200 to 1450 times real time, with every tick running. The test prints a
`[flight-speed]` line with `console.warn`; it shows only under `npx vitest run --reporter=verbose`.

# 7. Next steps

- **The test baseline is being built session by session.** The plan, the rules for those sessions and the regression
  triage table are in [test-coverage.md](test-coverage.md). That document is temporary and its last session retires it
  into a coverage record here; until then, start a test session from it rather than from this list.
- A power-cycle flight test for #90 (the OTH pages are pruned again on each `MainPage` construction). It needs the
  `FrontPanel.power()` helper and a boot with `engineRunning: false`.
- Procedure builders for the navdata, so approach and SID/STAR tests can run, and nearest-search filters in
  `MemoryFacilityClient`.
- A `FrontPanel.enterIdent` that blanks the positions past a short ident and that handles the waypoint selectors
  (APT, VOR, NDB, INT, SUP). `FrontPanel.type` covers the selectors today.
- A collector for unhandled rejections on `unit.errors`, so that a throw on the ENT path fails the test that caused it.
- A `Screen.read()` that tolerates trailing blanks beyond column 11 (and reads the status line while a cursor is on
  without the shift), and a `selectPage` that can turn the outer knob in either direction, so that no test has to
  navigate with fixed counts.
- Migrate the tests that hand-roll what `settle`, `storedSetting`, `FrontPanel.type` and `coldGps` now provide (the
  `typeRight` loops, the `persistent-setting.` keys, the `gps.reset()` calls and the fixed waits). They still work.
- `restoreMocks: true` in `vitest.config.mts` was considered and declined: tests restore their own spies.
- Errors thrown on the ENT path never reach the error page, although `CLAUDE.md` and `architecture.md` say input
  exceptions are shown there (section 6). The question is #118; once it is decided, either the trap goes away or the
  two documents change.
- Flip the pins when the bugs are fixed: remove `.fails` from the tests that `grep -rn "it.fails" test/` lists, each of which names its issue.
- #99 (lat/lon displays show 60.00 minutes just below a whole degree) is filed but has no pin yet; a render test would
  hold it.
- Further flights: OBS mode, direct-to, approach arming (ARM to APR scale ramp), waypoint alert without turn
  anticipation, and the GPS-invalid path.
