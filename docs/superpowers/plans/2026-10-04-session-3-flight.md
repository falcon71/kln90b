# Session 3 regression tests (flight rows): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A regression test for every open *testable* flight row of the triage table in `docs/test-coverage.md`
section 5, each at the cheapest stage that observes it and proven to bite on its original bug. A small harness
extension comes first.

**Architecture:**
- **Task 1** extends the harness: `Flight` restores `console.error`, an exception-safe teardown, `settle`, a cold-GPS
  boot, `storedSetting` and `FrontPanel.type`.
- **Tasks 2 to 5** are four parallel batches. Each runs in its own git worktree branched from the session branch after
  task 1, and writes one commit per triage row.
- **Task 6** files the bugs and the question, fills in the issue numbers, ticks the table and closes the session.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest 5 (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the
headless harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-04-session-3-flight-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task.
- **Branches.** The session branch is `tests-session-3-flight`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **No behavior changes** in `kln90b/` (rule 12). Testability seams only, each named in its commit message.
- **Test names** carry the issue or commit: `'… (#76)'` or `'… (014293d)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23), numbered per task from 1.
- **Spec, characterization or public contract** (`testing.md` section 5):
    - A spec test cites the Pilot's Guide page, or the KLN 89 trainer together with the fix commit, in a comment.
    - A characterization test has `characterization` in its `describe` or `it` title and no manual citation.
    - A public-contract test cites its source (`CLAUDE.md` "Public contract with aircraft", the doc comment in
      `LVars.ts`, `cfg/panel.xml`).
    - The page index is in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\pilots-guide-index.md`. Cite page
      numbers, never copy manual text.
- **Expected values** are literals or are derived with `test/harness/flight/geo.ts` or by hand, never from the code
  under test or the SDK's flavor of the same formula.
- **Assertions.** No permissive assertions (rule 17). An unset SimVar or LVar reads 0 in `FakeSim`, so "written as 0" is
  asserted with `sim.lastWrite(name)` being defined and its value 0.
- **Timing.** Never assert a measured second of a seeded acquisition. Use bounds from physics or generous windows. "One
  calculation tick" is exactly `vi.advanceTimersByTimeAsync(1000)`.
- **Flights.** One issue per flight. Every `flyUntil` has a `description` naming the predicate. Where the judgment is a
  pin, use the two-test shape of `test/flight/flights/turnDirection.test.ts`.
- **Proof per row (rule 10).** Put the original bug back by hand, run the test and see it fail, restore, check that
  `git diff` shows only the test. Never commit the broken state. Commit message: `references #NN <what>` or
  `Regression test for <commit> <what>`, then `Proof: fails when <break>`, then
  `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`. A row that cannot be re-broken is reported as
  "not provable" with the reason.
- **Implementers leave alone (rule 22):** `docs/test-coverage.md`, GitHub issues, other batches' rows.
- **Copyright.** Never commit manual text or navdata recorded from the sim. Facilities are invented.
- **Worktrees.** A fresh worktree needs `npm install` (or a `node_modules` junction to the main checkout); see
  `testing.md` section 2.

**User decisions (already made):**
- "Cheapest stage (Recommended)": rows go to their cheapest stage, re-verdicted with a reason; only the rows that need
  motion fly.
- "Plan's list + cold GPS (Recommended)": the harness task takes every item `test-coverage.md` lists plus a cold-GPS boot
  option.
- "The real unit appears to be uncapped" (turn anticipation near 180° on a long leg): no issue and no pin.
- "You can create a question for the self-test date editor."
- "The plan looks right, please continue": four batches (sequencing; OBS and direct-to; GPS state; SimVar outputs and
  scanning), Sonnet implementers, Opus reviewers for tasks 2 and 3, Sonnet for 1, 4 and 5.

---

## Facts every batch needs (from the research pass, run in a scratch copy)

**Boot and settle.** `bootUnit` boots force-ready: the GPS is valid at once, but FPL 0 activates only at the first
calculation tick. After task 1, `await settle(unit)` (from `test/harness/boot.ts`) waits for both. `Flight.start` already
waits for the GPS; then `flyUntil` the expected active ident.

**The standard world** (from `firstFlight.test.ts`): `kaaa = airport('KAAA', 47.0, 8.0)`, `abc = vor('ABC', 47.5, 8.9)`,
`kbbb = airport('KBBB', 48.2, 9.2)`. The final course KAAA to ABC (`finalCourseDeg(kaaa, abc)`) is about 51.0°, the
initial course (`courseDeg(kaaa, abc)`) about 50.37°, and `courseDeg(abc, kbbb)` about 15.93°.

**Positions.** A point at a distance and bearing from a facility:
`new GeoPoint(f.lat, f.lon).offset(bearingDeg, UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN))` (SDK geometry for
setup only; expectations come from `geo.ts`).

**Panel.xml options are nested elements**, not dotted names:
`<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><ObsTarget>1</ObsTarget></Output></Instrument></PlaneHTMLConfig>`.

**Entering OBS.** `await unit.panel.selectPage('L', 'MOD 2'); await unit.panel.cursor('L'); await unit.panel.ent();`
(confirm whether the cursor is needed; the two research passes differ). Before that, set the external course:
`unit.env.sim.set('Nav OBS:1', 'degrees', value)`. Unset, it reads 0 and the unit enters OBS 000. With panel.xml
`<Input><ObsSource>0</ObsSource></Input>` the unit ignores the external course.

**The SDK planner** mirrored from FPL 0: `FlightPlanner.getPlanner('kln90b', unit.core.bus)`.

**DCT pre-fill.** The boot right page is SUP with no facility, so DCT opens blank. `panel.outer('R', 1)` moves to CTR 1
first; then DCT pre-fills the active waypoint (3-27).

**Teleport.** In a render test, `unit.env.sim.set('PLANE LATITUDE', 'degrees', lat)` moves the unit. A flight's aircraft
overwrites these SimVars at 16 Hz, and also writes `GPS DRIVES NAV1` true (`test/harness/flight/Aircraft.ts:90`).

**Render tests do not fail on `console.error`** (`testing.md` section 6); spy on it where it is the signal. **ENT-path
errors never reach `unit.errors`**; assert a visible effect.

---

### Task 1: harness extensions

**Goal:** The harness items `testing.md` section 7 lists from session 2, plus a cold-GPS boot option, each with a harness
test, and the docs.

**Files:**
- Modify: `test/harness/flight/Flight.ts` (restore `console.error`)
- Modify: `test/harness/boot.ts` (teardown runner, `FakeXhr.requests`, `settle`, `coldGps`, `atcModel` on `HeadlessUnit`)
- Modify: `test/harness/storage.ts` (`storedSetting`)
- Modify: `test/harness/flight/FrontPanel.ts` (`type`)
- Create: `test/flight/harness/consoleRestore.test.ts`
- Create: `test/unit/harness/teardown.test.ts`
- Create: `test/render/harness/settle.test.ts`
- Modify: `test/render/harness/reboot.test.ts` (FakeXhr reset assertion) or a new render harness test
- Create: `test/render/harness/storedSetting.test.ts`, `test/render/harness/frontPanelType.test.ts`
- Modify: `docs/testing.md` sections 3, 4 and 7

**Acceptance Criteria:**
- [ ] After a test that ran `Flight.start`, `console.error` is the function it was before (a second test in the same file
      asserts identity with a reference captured at module load).
- [ ] Teardown runs every step even when one throws, then rethrows the first error; a unit test of the exported runner
      proves it with a throwing step.
- [ ] `simEnv().xhr.requests` is empty at the start of the second test of a file whose first test booted a unit.
- [ ] `settle(unit)` returns with `gps.isValid()` true and FPL 0 active (`getActiveFplIdx() >= 1` for a stored two-leg
      plan); it throws with a message when the GPS is not valid within its cap.
- [ ] `bootUnit({coldGps: true})` returns with `isValid()` false; the GPS becomes valid later on its own.
- [ ] `storedSetting(unit, name)` returns the parsed value after the unit saved a setting, and `undefined` for an absent key.
- [ ] `FrontPanel.type('R', 'AB')` produces the same result as the hand-rolled `KLN90B_Internal_Key` loop (an ident typed
      into a waypoint selector shows on screen).
- [ ] Each harness test fails when its item is disabled (rule 10), recorded in the commit message.
- [ ] `testing.md` sections 3 and 4 describe the helpers; section 7 drops the items done here; the existing tests are not
      migrated.
- [ ] `npm test` and `npx tsc --noEmit` are clean.

**Verify:** `npx vitest run test/unit/harness test/render/harness test/flight/harness` → all pass; `npm test` → all pass;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Flight restores console.error.** In `Flight.start`, right after installing the wrapper:

```ts
onTestFinished(() => {
    console.error = originalError;
});
```

  Import `onTestFinished` from `vitest`. Test `test/flight/harness/consoleRestore.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport} from '../../harness/navdata/builders';

const original = console.error;

describe('Flight restores console.error', () => {
    it('wraps console.error during a flight', async () => {
        const world = new World().add(airport('KAAA', 47.0, 8.0));
        await Flight.start({world, aircraft: {lat: 47.0, lon: 8.0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90}});
        expect(console.error).not.toBe(original);
    });

    it('has the original back after the flight', () => {
        expect(console.error).toBe(original);
    });
});
```

  Proof: remove the `onTestFinished` and see the second test fail.

- [ ] **Step 2: Exception-safe teardown.** In `boot.ts`, export a runner and use it in `teardown`:

```ts
/** Runs every step even if one throws, then rethrows the first error */
export function runAll(steps: (() => void)[]): void {
    let first: unknown = undefined;
    let failed = false;
    for (const step of steps) {
        try {
            step();
        } catch (e) {
            if (!failed) first = e;
            failed = true;
        }
    }
    if (failed) throw first;
}
```

  `teardown` becomes `runAll([...])` over the existing steps (clear timers, real timers, `sim.reset`, `storage.reset`,
  `coherent.reset`, magvar, `env.xhr.requests.length = 0`, `resetSingletons`, blank the DOM), with
  `live = undefined` in a `finally` so a failed teardown never blocks the next boot. Unit test
  `test/unit/harness/teardown.test.ts`: three steps, the second throws `new Error('two')`, the third pushes to an array;
  expect `runAll` to throw `'two'` and the array to hold the third step's mark; a second throwing step's error is not the
  one rethrown. Proof: a plain `for` loop without `try` fails it. Add the `FakeXhr.requests` check to
  `test/render/harness/reboot.test.ts` (the first test boots, which fetches the ephemeris; the second asserts
  `simEnv().xhr.requests` equals `[]` before its own boot). Proof: drop the reset.

- [ ] **Step 3: settle.** In `boot.ts`:

```ts
/**
 * Advances the clock until the GPS has a solution, then two calculation ticks more, so that FPL 0 has activated and the
 * display shows it. A force-ready boot is valid at once; FPL 0 activates at the first calculation tick after that.
 */
export async function settle(unit: HeadlessUnit, capSeconds = 120): Promise<void> {
    for (let i = 0; !unit.props.sensors.in.gps.isValid(); i++) {
        if (i >= capSeconds) throw new Error(`settle: no GPS solution within ${capSeconds} s`);
        await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(2000);
}
```

  Test `test/render/harness/settle.test.ts`: boot with `savedFlightplan(0, [kaaa, kbbb])` (invented, 47.0/8.0 and
  47.4/8.0, position 47.2/8.0), `settle`, expect `activeWaypoint.getActiveFplIdx()` to be 1 and `isValid()` true. A
  second test: `coldGps` boot, `settle(unit, 1)` rejects with `settle: no GPS solution`. Proof: drop the trailing 2 s
  (the FPL index is -1).

- [ ] **Step 4: coldGps.** Add `coldGps?: boolean` to `BootOptions` with a doc comment ("an engine-running boot whose GPS
  has no fix yet: `gps.reset()` after propsReady; it acquires again on its own, fast or slow per the
  `fastGpsAcquisition` setting"). After `state.completed = true`, `if (opts.coldGps) props.sensors.in.gps.reset();`.
  Test in `settle.test.ts`: `coldGps` boot, `isValid()` false right after `bootUnit`, then `settle` succeeds. Proof:
  ignore the option.

- [ ] **Step 5: storedSetting.** Add `atcModel: string` to `HeadlessUnit` (the model `bootUnit` used). In `storage.ts`:

```ts
/** The value the unit saved under a user setting, parsed; undefined if it was never saved (FakeStorage returns "") */
export function storedSetting(unit: HeadlessUnit, name: string): unknown {
    const raw = unit.env.storage.data.get(`persistent-setting.${unit.atcModel}.profile_1.${name}`);
    return raw === undefined || raw === '' ? undefined : JSON.parse(raw);
}
```

  Check how `FakeStorage.data` stores values (`AltPage.test.ts` reads `'30.92'` raw for `barosetting`) and match it.
  Test `test/render/harness/storedSetting.test.ts`: boot, change a setting through its `UserSetting` (for example
  `unit.props.userSettings.getSetting('barosetting').set(29.5)`; confirm the name), advance 250 ms, expect
  `storedSetting(unit, 'barosetting')` to be `29.5`; an unknown name gives `undefined`. Proof: a wrong key prefix.

- [ ] **Step 6: FrontPanel.type.** In `FrontPanel.ts`:

```ts
/** Types text with the keyboard (KLN90B_Internal_Key), one display tick per character. The side's cursor must be on. */
public async type(side: Side, text: string): Promise<void> {
    for (const ch of text) {
        await this.press(`KLN90B_Internal_Key:${side === 'L' ? 'LEFT' : 'RIGHT'}:${ch}`);
    }
}
```

  Test `test/render/harness/frontPanelType.test.ts`: reproduce one existing hand-rolled use (for example the APT 1 ident
  entry of `Apt1Page.test.ts`: right cursor on, `type('R', 'KAAA')`, the ident row shows `KAAA`). Proof: send `LEFT` for
  both sides.

- [ ] **Step 7: Docs.** `testing.md` section 3 (`bootUnit` options: `coldGps`; `HeadlessUnit.atcModel`; teardown runs
  every step), section 4 (render: `settle`, `storedSetting`, `FrontPanel.type`; flight: `console.error` restored per
  flight), section 6 (replace the `gps.reset()` advice with `coldGps`), section 7 (remove the items done; keep
  `restoreMocks` as considered and declined, with the reason that tests restore their own spies).

- [ ] **Step 8: Verify and commit.** One commit per step (2 to 6 may be one commit each), each with its proof line.
  Run `npm test` and `npx tsc --noEmit`.

```json:metadata
{"files": ["test/harness/flight/Flight.ts", "test/harness/boot.ts", "test/harness/storage.ts", "test/harness/flight/FrontPanel.ts", "test/flight/harness/consoleRestore.test.ts", "test/unit/harness/teardown.test.ts", "test/render/harness/settle.test.ts", "test/render/harness/reboot.test.ts", "test/render/harness/storedSetting.test.ts", "test/render/harness/frontPanelType.test.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["console.error restored after a flight", "teardown runs every step and rethrows the first error", "FakeXhr.requests reset", "settle waits for GPS and FPL 0", "coldGps boot has no fix", "storedSetting reads parsed values", "FrontPanel.type types keys", "each harness test proven by disabling its item", "testing.md updated"], "modelTier": "standard"}
```

---

### Task 2: sequencing and leg activation

**Goal:** Tests for #76, #19 (with #22), the flight half of #27, #41 and #34, and pins for the suspected bugs A and B.

**Files:**
- Create: `test/flight/flights/largeTurn.test.ts` (#76)
- Create: `test/flight/flights/duplicateWaypoint.test.ts` (#19, #22, #27, bug A)
- Create: `test/unit/data/flightplan/ActiveWaypoint.test.ts` (#41, #34, bug B)

**Acceptance Criteria:**
- [ ] Each row has its own commit with a proof line; each suspected bug is either pinned as `#NEW-2-<n>` or reported as
      not reproduced.
- [ ] #76, #19 and #27 are flights; #41 and #34 are unit tests; the reasons for the stage changes are in the report.
- [ ] #19 and #27 are independent: the #19 test fails only under the #19 break, the #27 test under the #27 break.
- [ ] Every `flyUntil` names its predicate; expectations come from `geo.ts` or construction.
- [ ] Report written to the path the controller gives (outside the repo).

**Verify:** `npx vitest run test/flight/flights/largeTurn.test.ts test/flight/flights/duplicateWaypoint.test.ts test/unit/data/flightplan/ActiveWaypoint.test.ts` → all pass (pins as expected failures).

**Steps:**

- [ ] **Step 1: #76 `e7cc3ca`, the next leg taken at once when the anticipation exceeds the distance (flight).**
    - Fix: `NavCalculator.ts` turn-start block (about lines 197 to 225): `if (turnAnticipationDistance > nav.distToActive)
      { sequenceToNextWaypoint(); … }`.
    - Break: that condition becomes `if (false) {`.
    - Setup: `a = airport('KAAA', 47.0, 8.0)`; `b = vor('ABC', …)` at a offset 90° by 10 NM; `c = airport('KBBB', …)` at b
      offset 265° by 12 NM; `World({magvar: 0})`. Leg 1 `finalCourseDeg(a, b)` ≈ 90.18, leg 2 `courseDeg(b, c)` ≈ 265.00,
      a 175° turn. At 120 kt the standard-rate radius is about 0.63 NM and the anticipation `R·tan(87.5°)` about 14.4 NM,
      more than the 10 NM leg. `Flight.start({world, storage: savedFlightplan(0, [a, b, c]), aircraft: a offset 90° by
      3 NM, 3000 ft, 120 kt, track leg1})`.
    - Fly 60 s one `fly(1)` at a time and sample `nav.activeIdent`, `nav.dtkTrue`, `nav.toFrom`.
    - Assertions: from the sixth sample on, `activeIdent === 'KBBB'` and `toFrom === 'TO'`. Classify each DTK as within
      1° of leg 1 or leg 2: no other value, at most one switch, never back from leg 2 to leg 1. Under the break, DTK
      alternates every second, `toFrom` alternates and ABC stays active.
    - Label: spec citing the KLN 89 trainer and `e7cc3ca` (4-8 and 4-9 do not cover it; do not cite them). The maintainer
      confirmed the real unit is uncapped; on a long leg a near-180° turn starting about 14 NM early is correct, not a bug.
    - A render test with a frozen aircraft does not reproduce the flip-flop (tried): flight is required.

- [ ] **Step 2: #19 `3364def` (and #22), consecutive identical waypoints sequence without error (flight).**
    - Fix: `NavCalculator.ts:94-98`, `if (!isObsModeActive() && isNaN(fromLeg.path.center[0])) { sequenceToNextWaypoint();
      return; }`.
    - Break: the condition becomes `false`.
    - Setup: the standard world, `storage: {...savedFlightplan(0, [kaaa, abc, abc, kbbb]), turnAnticipation: false}`
      (turn anticipation off isolates #19 from the #27 guard). The aircraft 3 NM before ABC on leg 1 (`finalCourseDeg`),
      3000 ft, 120 kt, coupled autopilot.
    - Observe `unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()` once per second (the idents repeat, the index
      does not).
    - Assertions: `flyUntil(idx === 3, {timeout: 150, description: 'sequenced through both ABC legs to KBBB'})`; the
      recorded index sequence is exactly `[1, 2, 3]` after removing repeats; `nav.dtkTrue` is finite whenever it is not
      null; at index 3 the DTK is within 1° of `courseDeg(abc, kbbb)`. The built-in monitors catch the throw (under the
      break: `GeoCircle … NaN` at about 92 s).
    - #22 variant in the same file: `abd = vor('ABD', abc.lat, abc.lon)`, plan `[kaaa, abc, abd, kbbb]`, sequence
      ABC, ABD, KBBB with no error.
    - Label: spec citing the trainer and `3364def` (no manual page). #23 needs procedures; say so in the report.

- [ ] **Step 3: #27 `dbb01bf` flight half, no turn anticipation into a duplicated waypoint (flight).**
    - Fix: `NavCalculator.ts:167-173`, the `&& !TO_GEOPOINT_CACHE.equals(followingLeg.wpt)` in the anticipation
      condition.
    - Break: delete that clause. It throws at once (NaN `GeoCircle`); also check a non-throwing variant by hand (the
      guard removed and the next course for a duplicate set to fromDtk + 35°) so the no-turn assertions are known to bite.
    - Setup: as step 2 with the default turn anticipation (`storage: savedFlightplan(0, [kaaa, abc, abc, kbbb])`).
    - Sampled each second until ABC is passed: `activeWaypoint.turnStack.length === 0`,
      `Math.abs(flight.aircraft.bankDeg) < 0.5`, `Math.abs(nav.xtkNm) < 0.01`; the minimum of
      `distanceNm(flight.aircraft, abc)` over the samples is below 0.05 NM.
    - Label: spec citing the trainer (the code comment) and `dbb01bf`; do not cite 4-8.

- [ ] **Step 4: #41 `42099f3`, the leg the aircraft is on is activated (unit).**
    - Fix: `ActiveWaypoint.ts:277-326`, `findClosestLegIdx` and `isPointOnCircleBetween`.
    - Break: at `ActiveWaypoint.ts:297` replace `this.isPointOnCircleBetween(tempFromGeoPoint, to, tempClosestGeoPoint)`
      with `!(tempClosestGeoPoint.distance(tempFromGeoPoint) <= tempFromGeoPoint.distance(to))`.
    - Scaffold, no boot:

```ts
const bus = new EventBus();
const coords = new GeoPoint(lat, lon);
const sensors = {in: {gps: {coords}}} as unknown as Sensors; // only gps.coords is read
const fpl = new Flightplan(0, facs.map(f => ({wpt: f, type: KLNLegType.USER})), bus);
const aw = new ActiveWaypoint(bus, new KLN90BUserSettings(bus), sensors, fpl, null);
aw.activateFpl0();
```

      Move the aircraft with `coords.set(lat, lon)` and call `activateFpl0()` again.
    - Facilities by offset from A = KAAA (47.0, 8.0): B = A + 90° 40 NM; C = B + 0° 40 NM; D = C + 270° 40 NM.
    - Cases (expected `getActiveFplIdx()`): B + 270° 5 NM with [A, B, C] gives 1 (under the break 2);
      (C + 270° 20 NM) + 0° 1 NM with [A, B, C, D] gives 3 (break 2); A + 90° 20 NM + 0° 2 NM with [A, B, C] gives 1 (stays
      green under the break: say so in a comment as the predicted survivor).
    - Label: characterization (the manual is silent; the issue asks what is right). Missed-approach scenario needs
      procedures.

- [ ] **Step 5: #34 `2b06e54`, FPL 0 with two waypoints always activates (unit, same file).**
    - Break: in `findClosestLegIdx`'s `else` branch, set `distGPSClosestWpt = Infinity` (no leg is chosen when the
      closest point lies outside the leg).
    - Cases: plan [A, B]; positions B + 90° 100 NM and A + 270° 100 NM. Expected `activateFpl0()` non-null,
      `getActiveFplIdx() === 1`, `getActiveWpt()!.icaoStruct.ident === 'ABC'` (or B's ident). Under the break: -1.
      "Far to the side" does not flag the old code; do not use it.
    - Label: spec 4-1 (FPL 0 needs at least two waypoints, so two suffice) plus the trainer for the position
      independence.

- [ ] **Step 6: suspected bug A, stale outputs on a zero-length leg.** `NavCalculator.ts:94-98` returns before
  `setOutput()`. Reproduce: plan `[kaaa, kaaa]` (sequencing cannot advance), aircraft 5 NM west of KAAA, render or
  flight: `desiredTrack`, `xtkToActive` and `toFrom` stay null while `distToActive` is set, and the GPS SimVars are not
  refreshed (for example `sim.lastWrite('GPS WP DISTANCE')` stops changing while the aircraft moves). Decide the
  expected behavior from 4-1 (a plan whose legs have no length is flagged) or the public contract (outputs stay current),
  write the pin as `it.fails('… (#NEW-2-1)')`, and describe the choice in the report.

- [ ] **Step 7: suspected bug B, DME-arc legs in `findClosestLegIdx`.** Unit test in the #41 file: VOR at 47/8;
  P = VOR + 270° 10 NM with `arcData: {circle: GeoCircle.createFromPoint(vor, 10 NM in great-arc radians)}` (hand-built,
  cast as needed); Q = VOR + 0° 10 NM; R = Q + 90° 30 NM; plan [P, Q, R]; aircraft on the arc at VOR + 330° 10 NM.
  Expected index 1 (the arc to Q); observed 2. Pin `it.fails('… (#NEW-2-2)')`, continuing the closed #41.

- [ ] **Step 8: report.** One line per row, the suspected bugs with reproduction and file:line, the worktree path and
  branch.

```json:metadata
{"files": ["test/flight/flights/largeTurn.test.ts", "test/flight/flights/duplicateWaypoint.test.ts", "test/unit/data/flightplan/ActiveWaypoint.test.ts"], "verifyCommand": "npx vitest run test/flight/flights/largeTurn.test.ts test/flight/flights/duplicateWaypoint.test.ts test/unit/data/flightplan/ActiveWaypoint.test.ts", "acceptanceCriteria": ["one commit per row with proof line", "#19 and #27 independent", "bugs A and B pinned or reported not reproduced", "expectations from geo.ts or construction", "report written"], "modelTier": "standard"}
```

---

### Task 3: OBS, direct-to and modes

**Goal:** Tests for #67 (a), `014293d`, #70 and #29, and pins for the suspected bugs C and D.

**Files:**
- Modify: `test/render/data/flightplan/ActiveWaypoint.test.ts` (#67 (a), #70)
- Create: `test/render/services/ModeController.test.ts` (`014293d`, bugs C and D)
- Create: `test/flight/flights/hsiToFromFlags.test.ts` (#29 flight)
- Create or modify: `test/render/Sensors.test.ts` (#29, the 0 case)

**Acceptance Criteria:**
- [ ] Each row has its own commit with a proof line; bugs C and D pinned as `#NEW-3-<n>` or reported not reproduced.
- [ ] #67 (a), `014293d` and #70 are render tests; #29 has a flight for the TO to FROM flip and a render test for 0.
- [ ] No assertion relies only on `unit.errors` where the break does not throw (#67 (a)).
- [ ] Report written.

**Verify:** `npx vitest run test/render/data/flightplan/ActiveWaypoint.test.ts test/render/services/ModeController.test.ts test/flight/flights/hsiToFromFlags.test.ts test/render/Sensors.test.ts` → all pass (pins as expected failures).

**Steps:**

- [ ] **Step 1: #67 (a) `3415417`, OBS with the same waypoint twice (render).**
    - Fix: `ModeController.ts:223`, `this.navState.desiredTrack ?? this.navState.bearingToActive!`.
    - Break: back to `this.navState.desiredTrack!`.
    - Setup: `panelXml` with `<Input><ObsSource>0</ObsSource></Input>` (with the default 1 the fixed line is never
      reached); `kaaa` only; position KAAA + 270° 5 NM; `storage: savedFlightplan(0, [kaaa, kaaa])`; `settle`; enter OBS
      on MOD 2; advance 3 s.
    - Assertions: `navmode === NavMode.ENR_OBS`; `memory.navPage.obsMag` within 0.5° of `courseDeg(position, kaaa)`
      (≈ 89.91); `xtkToActive` finite and below 0.05 NM in magnitude; the left half shows `OBS:090°` (or the status line
      the `enr:090` mode text; mind the cursor shift). Under the break: `obsMag` null, XTK -5 NM, `OBS:°`, `unit.errors`
      empty.
    - Label: spec 5-36 for "OBS mode is entered and the waypoint stays active"; the fallback course value is
      characterization (put it in a separately titled `it`).

- [ ] **Step 2: `014293d`, a changed OBS course is used in the same calculation tick (render).**
    - Fix: the tick order in `KLN90BCore.ts:330-331` (`modeController` before `NavCalculator`).
    - Break: swap the two entries.
    - Setup: the standard world, `savedFlightplan(0, [kaaa, abc, kbbb])`, position 5 NM before ABC on the final course;
      `settle`; `sim.set('Nav OBS:1', 'degrees', 51)`; enter OBS; advance 2 s (`GPS OBS VALUE` 51). Then
      `sim.set('Nav OBS:1', 'degrees', 100)` and advance exactly 1000 ms.
    - Assertions: `sim.get('GPS OBS VALUE', 'degrees')` and `sim.get('GPS WP DESIRED TRACK', 'degrees')` within 0.01 of
      100; `xtkToActive` within 0.05 NM of the hand value `R·asin(sin(d/R)·sin(100 - brg))`, with `d = distanceNm` and
      `brg = courseDeg(position, abc)` from `geo.ts` (≈ 3.77 NM). Do not use `GPS WP CROSS TRK` (the 16 Hz filter lags).
      `nav.desiredTrack` is null in OBS; do not assert it. Under the break: 51, 51, about 0.
    - Label: spec 5-34 and 5-35 (the deviation follows the selected course); the one-tick timing is the regression.

- [ ] **Step 3: #70 `748151c`, sequencing after a direct-to (render).**
    - Fix: `ActiveWaypoint.ts:124-125`, the publish of `activeWaypointChanged` after `setFplData`.
    - Breaks: swap the two lines (throws `TypeError … 'arcData'`); separately delete the publish (no throw, the planner
      stays stale). Check both.
    - Setup: the standard world, `savedFlightplan(0, [kaaa, abc, kbbb])`, position 5 NM before ABC; `settle`;
      `panel.outer('R', 1)`; `panel.dct()`; `panel.ent()`; expect `isDctNavigation()` true and index 1. Then call
      `aw.sequenceToNextWaypoint()` directly.
    - Assertions: no throw; `aw.getActiveWpt()!.icaoStruct.ident === 'KBBB'`, `getActiveFplIdx() === 2`; the planner
      `FlightPlanner.getPlanner('kln90b', unit.core.bus)`: `activePlanIndex === 0`, `hasFlightPlan(1) === false`,
      `getFlightPlan(0).activeLateralLeg === 2`, `getFlightPlan(0).getLeg(2).leg.fixIcaoStruct.ident === 'KBBB'`.
    - Label: spec 4-10 (a direct-to to an FPL 0 waypoint resumes the plan when reached); the planner assertions are
      public contract (`CLAUDE.md`).

- [ ] **Step 4: #29 `a0678fa`, `L:KLN90B_HSI_TF_FLAGS` (flight and render).**
    - Fix: `Sensors.ts:309-315` (`setToFrom`: null 0, TO 1, FROM 2), called at `NavCalculator.ts:308`.
    - Breaks: `toFrom === TO ? 2 : 1`; and, separately, comment out the call.
    - Flight `test/flight/flights/hsiToFromFlags.test.ts`: standard world, plan [KAAA, ABC, KBBB], aircraft 1.5 NM
      before ABC on the final course, `ManualPilot` (bank 0); `flight.sim.set('Nav OBS:1', 'degrees', leg1)`;
      `flyUntil` ABC active; enter OBS; `fly(2)`; then a monitor over 60 s: skipping samples within 0.05 NM of ABC, the
      LVar (`'enum'`) is 1 when `courseDeg(aircraft, abc)` is within 90° of the course and 2 otherwise. Also assert at the
      end that both 1 and 2 were seen, ABC stays active and the mode is `ENR-OBS`.
    - Render, the 0 case: boot with no flight plan, `settle`; `sim.lastWrite('L:KLN90B_HSI_TF_FLAGS')` is defined and
      its value is 0.
    - Label: public contract (`LVars.ts:11`, `CLAUDE.md` "LVars"); the TO and FROM geometry cites 5-35 and 3-31.

- [ ] **Step 5: suspected bug C, OBS 000 keeps the leg path.** `ModeController.setObs` returns at once when the course
  equals `navState.obsMag` (`ModeController.ts:149-151`), which is 0 at start and after `switchToEnrLegMode`. Reproduce
  in `ModeController.test.ts`: plan [KAAA, ABC], aircraft 10 NM before ABC on the leg, `sim.set('Nav OBS:1', 'degrees',
  0)`, enter OBS: expected per 5-36 the deviation from the 000° course through ABC, `xtkToActive` ≈ `10·sin(51.0)` ≈ 7.77
  NM by `geo.ts`, and `isDctNavigation()` true; observed about 0 and false. Pin `it.fails('… (#NEW-3-1)')`, with a sibling
  test at 077° that passes today (so a broken setup fails there).

- [ ] **Step 6: suspected bug D, `L:KLN90B_ObsSource` 0 at runtime leaves `obsMag` stale.** `Sensors.ts:221-229` has no
  case for 0. Reproduce: boot, `sim.set('Nav OBS:1', 'degrees', 51)`, advance 3 s (`sensors.in.obsMag` 51), then
  `sim.set('L:KLN90B_ObsSource', 'number', 0)`, advance 3 s: `obsMag` should be null (the external course is disabled,
  `LVars.ts` doc of the override), observed 51. Pin `it.fails('… (#NEW-3-2)')`; the precondition (51 before the switch,
  `planeSettings.input.obsSource` 0 after) in a sibling passing test.

- [ ] **Step 7: report.**

```json:metadata
{"files": ["test/render/data/flightplan/ActiveWaypoint.test.ts", "test/render/services/ModeController.test.ts", "test/flight/flights/hsiToFromFlags.test.ts", "test/render/Sensors.test.ts"], "verifyCommand": "npx vitest run test/render/data/flightplan/ActiveWaypoint.test.ts test/render/services/ModeController.test.ts test/flight/flights/hsiToFromFlags.test.ts test/render/Sensors.test.ts", "acceptanceCriteria": ["one commit per row with proof line", "bugs C and D pinned or reported not reproduced", "#67 (a) not asserted by unit.errors alone", "report written"], "modelTier": "standard"}
```

---

### Task 4: GPS state

**Goal:** Tests for #61, #63, #87 and #24, and a pin for the suspected bug E.

**Files:**
- Create: `test/render/Gps.test.ts` (#61, #63)
- Create: `test/render/SensorsOut.test.ts` (#87, #24, bug E; task 3 owns `test/render/Sensors.test.ts`, task 5
  `test/render/SensorsOutSimVars.test.ts`, so the batches never write the same file)

**Acceptance Criteria:**
- [ ] Each row has its own commit with a proof line; bug E pinned as `#NEW-4-1` or reported not reproduced.
- [ ] No assertion on a measured acquisition second; `isValid()` is not asserted near the end of the turn-on page.
- [ ] #63 has the era-off case checked twice (right after acquisition and 5 s later), a same-era control and the era
      boundary case.
- [ ] Report written.

**Verify:** `npx vitest run test/render/Gps.test.ts test/render/SensorsOut.test.ts` → all pass (pin as expected failure).

**Steps:**

- [ ] **Step 1: #61 `179d37d`, acquisition starts at power-on (render).**
    - Fix: removed `GPS.isStarted`/`startGPSSearch`; `Gps.ts:166-169` runs from the first calculation tick.
    - Break (all four edits): add `private isStarted = false;` and `public startGPSSearch(): void { this.isStarted = true; }`
      to `Gps.ts`; wrap the three statements at `Gps.ts:166-169` in `if (this.isStarted)`; call `startGPSSearch()` before
      `acquireAndUseSatellites()` at `WelcomePage.tsx:146` and after `shortBeeps(5)` in `SelfTestRightPage.approve`.
    - Setup: `bootUnit({engineRunning: false})`; the channels (`unit.props.sensors.in.gps.gpsSatComputer.getChannels()`,
      confirm the path) are all null; `unit.send('KLN90B_Power_On')`; advance 5 s; the turn-on page is still up (its first
      row, read as `PowerButton.test.ts` reads it); every channel is non-null.
    - Do not assert `Acquiring` or `isValid()`; their timing comes from the seeded random.
    - Label: spec 3-17 (time to first fix counts from power-on).

- [ ] **Step 2: #63 `64c203d`, GPS week rollover (render).**
    - Fix: `Gps.ts:27-28` (constants), `calculateGPSTime` (`Gps.ts:287-292`), used in `gpsAcquired` and the valid tick
      (`Gps.ts:190-192`).
    - Breaks: `calculateGPSTime` returns `TimeStamp.create(actualUnixTime)`; separately, only `Gps.ts:192` reverted to
      `this.unixToTimestamp(actualUnixTime)` (caught only by the 5 s re-check); separately, `GPS_EPOCH` plus one day
      (caught only by the boundary case).
    - Setup per case: `bootUnit({coldGps: true})`; `gps.timeZulu = TimeStamp.create(<user date>)` (the field
      `Set2Page.saveDate` writes); advance in 1 s steps until `isValid()` (cap 60 s); read `gps.timeZulu.getTimestamp()`.
    - Era off (characterization, the Pilot's Guide is silent on the rollover): user date `Date.UTC(2006, 5, 1, 12)`;
      expected `Date.UTC(2006, 9, 16, 12) + (Date.now() - Date.UTC(2026, 5, 1, 12))` within 1500 ms, right after the fix
      and again 5 s later. 2006-10-16T12:00Z is 2026-06-01T12:00Z minus 1024 weeks (7168 days).
    - Same era (spec 3-53, the date comes from the satellite): user date `Date.UTC(2026, 5, 1, 11)`; expected `Date.now()`
      within 1500 ms.
    - Era boundary: user date `Date.UTC(2019, 3, 7, 12)` (era 2 starts 2019-04-07T00:00Z, 2048 weeks after
      1980-01-06); expected `Date.now()` within 1500 ms. Characterization; it is the only case that pins the epoch.

- [ ] **Step 3: #87 `8a16a33`, `L:KLN90B_IntegrityWarn` (render).**
    - Fix: `NavCalculator.ts:315` passes `!gps.isValid()`; written at `Sensors.ts:397`.
    - Breaks: `false`; inverted; the write deleted (caught only by a `lastWrite` assertion).
    - Setup: `bootUnit({storage: {fastGpsAcquisition: false, lastLatitude: 47.0, lastLongitude: 8.0}, position: {lat:
      47.0, lon: 8.0}})`; advance 2 s: `lastWrite('L:KLN90B_IntegrityWarn')` defined with value 0 (valid). Then
      `gps.reset()`; advance 2 s: value 1. Advance to 30 s: still 1. Advance until `isValid()` (cap 900 s); advance 2 s:
      0. Assert the acquisition took between 10 s and 400 s only.
    - Label: public contract (`LVars.ts:15`, `CLAUDE.md`).

- [ ] **Step 4: #24 `66b0444`, GPS OVERRIDDEN re-asserted (render).**
    - Fix: `NavCalculator.ts:306` calls `setGpsOverriden()` every calculation tick.
    - Break: delete that line (the boot write still sets 1, so the test must clear it after boot).
    - Setup: boot, `settle`; `sim.get('GPS OVERRIDDEN', 'bool') === 1`; `sim.set('GPS OVERRIDDEN', 'bool', false)`;
      advance exactly 1000 ms; 1 again.
    - Companions: `sim.set('L:KLN90B_Disabled', 'bool', true)`, advance 3 s: 0; then another unit sets it true and it
      stays 1. With `panelXml` `<Output><WriteGPSSimVars>false</WriteGPSSimVars></Output>`: never written
      (`sim.lastWrite('GPS OVERRIDDEN')` undefined).
    - Label: public contract (`CLAUDE.md` "GPS SimVars" and the Hot Swapping wiki page).

- [ ] **Step 5: suspected bug E, the integrity and bearing LVars are gated by `WriteGPSSimVars`.** `Sensors.ts:371-373`
  (`setPos` returns early) and `342-345` (`setWpBearing`). With `<Output><WriteGPSSimVars>false</WriteGPSSimVars></Output>`,
  boot, advance 3 s: `lastWrite('L:KLN90B_IntegrityWarn')` undefined while `lastWrite('L:KLN90B_HSI_TF_FLAGS')` is
  defined. Expected: the LVars are outputs of the unit independent of the GPS SimVars (`CLAUDE.md` lists them separately).
  Pin `it.fails('… (#NEW-4-1)')` for both LVars, with the HSI flag control in a passing sibling.

- [ ] **Step 6: report.**

```json:metadata
{"files": ["test/render/Gps.test.ts", "test/render/SensorsOut.test.ts"], "verifyCommand": "npx vitest run test/render/Gps.test.ts test/render/SensorsOut.test.ts", "acceptanceCriteria": ["one commit per row with proof line", "bug E pinned or reported not reproduced", "no measured-second assertions", "#63 checked twice plus same-era and boundary cases", "report written"], "modelTier": "standard"}
```

---

### Task 5: GPS SimVar outputs and scanning

**Goal:** Tests for `6be164c` (part), `1236025` (part), `07c6e37`, `92fbba1` and #39.

**Files:**
- Create: `test/render/SensorsOutSimVars.test.ts` (`6be164c` MAGVAR, `1236025`, `07c6e37`, `92fbba1`)
- Create: `test/flight/flights/magneticTrack.test.ts` (`6be164c` track)
- Modify: `test/render/pages/right/Apt1Page.test.ts` (#39)

**Acceptance Criteria:**
- [ ] Each row has its own commit with a proof line (`6be164c` may be two commits, one per half).
- [ ] Units are asserted through `lastWrite(name)!.unit` as well as the value.
- [ ] #39: the ident, the coordinate rows and `unit.errors` are separate assertions, and a `console.error` spy count.
- [ ] Report written.

**Verify:** `npx vitest run test/render/SensorsOutSimVars.test.ts test/flight/flights/magneticTrack.test.ts test/render/pages/right/Apt1Page.test.ts` → all pass.

**Steps:**

- [ ] **Step 1: `6be164c` GPS MAGVAR in radians (render).** Fix `Sensors.ts:375`. Break: drop the
  `UnitType.DEGREE.convertTo(…, RADIAN)`. `bootUnit({magvar: 4, position: {lat: 47, lon: 8}})`, advance 3 s:
  `sim.get('GPS MAGVAR', 'radians')` close to `4 * Math.PI / 180` (6 digits), `lastWrite('GPS MAGVAR')!.unit === 'radians'`.
  Public contract (`CLAUDE.md` "GPS SimVars").

- [ ] **Step 2: `6be164c` GPS GROUND MAGNETIC TRACK (flight).** Fix `Sensors.ts:391-394`. Breaks: `trueToMagnetic(track,
  -magvar)`; drop the conversion. `World({magvar: 4})`, `Flight.start` at 47/8, 3000 ft, 120 kt, track 090 true, no flight
  plan; `fly(10)`. `GPS GROUND MAGNETIC TRACK` in radians within 0.005 of `86 * Math.PI / 180`, and the control
  `GPS GROUND TRUE TRACK` within 0.005 of `90 * Math.PI / 180`. Public contract.

- [ ] **Step 3: `1236025` GPS WP NEXT LON and PREV LON in degrees (render).** Fix `Sensors.ts:452` and `:469`. Break:
  `SimVarValueType.String` on each (two independent edits; check both). Standard world, plan [KAAA, ABC, KBBB], position
  KAAA, advance 3 s. In degrees: NEXT LON 8.9, NEXT LAT 47.5, PREV LON 8.0, PREV LAT 47.0 (6 digits), and
  `lastWrite('GPS WP NEXT LON')!.unit === 'degrees'` and the same for PREV. Consider KAAA at non-round coordinates so a
  default cannot match. Public contract.

- [ ] **Step 4: `07c6e37` `Output.ObsTarget` writes `K:VOR1_SET`/`K:VOR2_SET` (render).** Fix `Sensors.ts:267` and `:270`.
  Breaks: `'VOR1_SET'`; `'K:VOR2_SET'` changed to `'K:VOR1_SET'`. `panelXml` with `<Output><ObsTarget>1</ObsTarget></Output>`,
  standard world, plan [KAAA, ABC, KBBB], position KAAA, `magvar: 4`, advance 3 s: the last `sim.keyEvents` entry named
  `K:VOR1_SET` has value within 0.01 of `courseDeg(kaaa, abc) - 4` (≈ 46.372); no `sim.writes` entry named `VOR1_SET`.
  Variant ObsTarget 2: only `K:VOR2_SET`. Variant default (0): no VOR key event. Public contract (`cfg/panel.xml:27`,
  `CLAUDE.md`); say in the comment that "magnetic DTK in LEG mode" is a code fact (`getDtkOrObsMagnetic`).

- [ ] **Step 5: `92fbba1` `ObsTarget` only when the GPS drives NAV1 (render).** Fix `Sensors.ts:262-273`. Break:
  `if (gpsIsNavSource)` to `if (true)`. Setup as step 4; after 3 s record the count of VOR key events and assert it is
  above zero in a sibling assertion that precedes the switch (a precondition, not the test's claim);
  `sim.set('GPS DRIVES NAV1', 'bool', false)`; advance 5 s; the count is unchanged. Optionally set it back and see the
  events resume. The source is `cfg/panel.xml` `ObsTarget` plus the commit `92fbba1`; say so. Render only: a flight's
  `Aircraft.writeTo` forces `GPS DRIVES NAV1` true (record for `testing.md` section 7).

- [ ] **Step 6: #39 `c2e7b8e`, `d202f4a`, scanning after the shown nearest entry dropped off (render).**
    - Breaks (check each): B-selector, `NearestSelector.getIndex` returns a value captured once; B-scan, remove
      `&& this.facility.index > -1` at `WaypointPage.tsx:144` and `:177`; B-guard, additionally remove the
      `fac === undefined` guard at `WaypointPage.tsx:218-221`; B-view, remove `&& this.facility.index > -1` at
      `AirportCoordOrNearestView.tsx:165`.
    - Facilities: `KAAA (47.0, 8.0)`, `KBBB (47.2, 8.0)`, `KCCC (47.4, 8.0)`, `KZZZ (57.1, 8.0)`; position (47.19, 8.0).
    - Reach the nearest entry: advance 12 s; `panel.msg()`; `panel.ent()` (the nearest-airport function, 3-23). Assert the
      precondition: right row 0 `' KBBB  nr 1'`.
    - Test "nr follows the aircraft" (spec 3-24): `sim.set('PLANE LATITUDE', 'degrees', 47.39)`, advance 12 s: row 0
      `' KBBB  nr 2'`, rows 4 and 5 `'     180°to'` and `'     11.4nm'` (0.19° of latitude = 11.4 NM, bearing 180).
    - Test "dropped entry" (characterization): teleport to latitude 57.0, advance 25 s: row 0 `' KBBB      '`, rows 4 and
      5 the KBBB coordinates `"N 47°12.00'"` and `"E 08°00.00'"`.
    - Tests "scan left" and "scan right" from the dropped entry (characterization, one boot each): `panel.scan()`, then
      `inner('R', -1)` gives KAAA and `inner('R', 1)` gives KCCC; `unit.errors` is `[]`; a `console.error` spy saw no
      call (restore it).
    - Put a small helper in the file that boots and drops the entry.

- [ ] **Step 7: report.**

```json:metadata
{"files": ["test/render/SensorsOutSimVars.test.ts", "test/flight/flights/magneticTrack.test.ts", "test/render/pages/right/Apt1Page.test.ts"], "verifyCommand": "npx vitest run test/render/SensorsOutSimVars.test.ts test/flight/flights/magneticTrack.test.ts test/render/pages/right/Apt1Page.test.ts", "acceptanceCriteria": ["one commit per row with proof line", "units asserted via lastWrite", "#39 assertions independent", "report written"], "modelTier": "standard"}
```

---

### Task 6: issues and close-out

**Goal:** File the confirmed bugs and the question, replace the placeholders, tick the triage rows, and write the session
log.

**Files:**
- Modify: test files containing `#NEW-` placeholders
- Modify: `docs/test-coverage.md` (section 3 checkbox, section 4 log, section 5 rows)
- Modify: `docs/testing.md` section 7

**Acceptance Criteria:**
- [ ] Every confirmed bug from the four reports and the reviews has a GitHub issue with the `bug` label, filed after a
      search of open and closed issues; duplicates found by two tasks are one issue.
- [ ] A question issue (no `bug` label, no pin) for the self-test date and time editors, citing 3-53.
- [ ] `grep -r "#NEW-" test/` finds nothing.
- [ ] Every session 3 row is ticked with its test path or re-verdicted with a reason; the stage changes are in the rows.
- [ ] The session log entry has: done, re-verdicts, bugs filed, fixes not re-broken, not covered, coverage at start and
      end, the suite totals.
- [ ] `npm test`, `npx tsc --noEmit` and `npm run coverage` are clean.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [ ] **Step 1:** Collect the bugs from the reports. For each, search open and closed issues with several wordings; file
  with the `bug` label: what is wrong, a reproduction with observed and expected values, file and line, user impact,
  suggested fix, a reference to the closed issue it continues (#41 for bug B). Cite manual pages; never copy text.
- [ ] **Step 2:** File the question about `SelfTestRightPage` (its date and time editors have no read-only guard for a
  valid GPS, unlike `Set2Page.tsx:62-67, 102-107`; since #61 the fast GPS can be valid while the self-test page is up;
  3-53 says date and time cannot be changed while the satellite supplies them; what the real unit does is not known).
- [ ] **Step 3:** Replace the placeholders in one commit (`references #NN …` per issue in the message).
- [ ] **Step 4:** Tick the rows in section 5 with test paths; for each stage change, edit the stage column and add the
      reason to the how/why column. Tick the session 3 checkbox.
- [ ] **Step 5:** Write the log entry in section 4 (newest first), with the coverage table from `npm run coverage` at the
      start (identical to session 2's end) and the end. Add to `testing.md` section 7: `Aircraft.writeTo` forces
      `GPS DRIVES NAV1` true, and `Flight.start` cannot start cold; drop the session 3 harness items that task 1 did.
- [ ] **Step 6:** Run the checks and commit.

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["bugs filed with bug label after duplicate search", "question issue for self-test date editor", "no #NEW- placeholders", "rows ticked or re-verdicted", "session log complete", "checks clean"], "modelTier": "standard"}
```

### Task 7: migrate the older tests to the harness helpers, and update the workflow rules

Added at the maintainer's request after the final review of session 3.

**Goal:** The older tests use the helpers that task 1 added instead of hand-rolling them, and the workflow rules and
Session H say what the sessions learned.

**Files:**
- Modify: the render tests that hand-rolled `settle`, `FrontPanel.type`, `storedSetting` or `coldGps` (the list is in
  the commit message)
- Modify: `docs/test-coverage.md` (rules 10, 21 and 22, session 2 step 2, Session H, the session 3 log)
- Modify: `docs/testing.md` sections 4 and 7
- Modify: this plan and its `.tasks.json`

**Acceptance Criteria:**
- [ ] Assertions do not change; local helpers are deleted once unused.
- [ ] A hand-rolled form stays only where it is the subject or the helper does not fit, with the reason in the report.
- [ ] Every migrated test whose waits changed is proven again against its original bug.
- [ ] `npm test` gives the same totals as before and `npx tsc --noEmit` is clean.
- [ ] One commit for the whole task, listing each part.

**Verify:** `npm test && npx tsc --noEmit` -> same totals as before, no type errors.

**Steps:**

- [ ] **Part A:** Migrate the tests, re-prove those whose timing changed, and keep the others as they are.
- [ ] **Part B:** One commit per task and per fix round (rules 10 and 22), the worktree base (rule 21), Session H split
  and candidates, the session 3 log and `testing.md`.

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["assertions unchanged", "kept forms explained", "re-proof where waits changed", "same totals", "one commit"], "modelTier": "standard"}
```
