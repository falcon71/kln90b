# GPS signal loss, bad geometry and RAIM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The unit computes its own GPS solution (four satellites, or three plus altitude), shows a realistic error on
STA 2, evaluates RAIM per flight phase, and posts the Pilot's Guide's signal-loss and RAIM messages, states and approach
behavior (#453).

**Architecture:** A pure module `kln90b/GpsSolution.ts` turns the SDK's in-use satellites (line of sight) plus an
optional altitude row into validity, HDOP, EPE and RAIM slopes. `GPS` owns one cached result and uses it for
`isValid()`. STA 1, STA 2, STA 5, the persistent messages and `ModeController`'s approach gate read it.

**Tech Stack:** TypeScript (es2017), MSFS Avionics Framework (`GPSSatComputer`, `GPSPredictionContext`), Vitest (unit,
render, flight).

**Spec:** `docs/superpowers/specs/2026-11-01-gps-signal-loss-design.md`

## Global Constraints

- Modern error levels only: σ_UERE = 5 m, σ_ALT = 30 m, EPE = 2 × HDOP × σ_UERE, RAIM K = 5.3. No SA at any sim date.
- Alert limits: 2 NM in ENR-LEG/ENR-OBS, 1 NM in ARM-LEG/ARM-OBS, 0.3 NM in APR (`NavMode.APR_LEG`).
- RAIM needs at least five measurements, the altitude counting as one; validity needs four measurements of which at
  least three are satellites, and EPE ≤ 3.8 NM.
- The messages apply to every installation, VFR-only included.
- No new hooks into private SDK internals; `syncLastKnownPosition` (public) is allowed.
- Tick cost: the solution is recomputed only when the in-use satellites, their positions or the altitude presence
  change.
- Project rules from `CLAUDE.md`: manual page references in comments, no manual text copied, uppercase display text,
  `target: es2017`, no new circular dependencies, DOM changes only in display ticks, state that must survive a page
  change in `VolatileMemory`, reset at power-on.
- One commit per issue: the work commits as `references #453 …` on the branch, and Task 7 squashes it into a single
  `fixes #453 …` commit.

## Review Focus

1. **Take-home mode** (`TakeHomeMode` in panel.xml): the unit flies without satellites. It must stay valid and post no
   RAIM or coverage message. Test in Task 2.
2. **A clock jump during a debounce** (SET 2 time entry, sim time change): no message may post at once because the
   clock jumped. Test in Task 5.
3. **A power cycle with a message listed or the integrity flag set:** after power-on the flag is clear, and SATELLITE
   COVERAGE INADEQUATE FOR NAV does not come during the new start-up search. Test in Task 6.
4. **Ground speed 0 at the approach gate** (a hover, a paused sim at 2 NM): the ETA falls back to now, with no NaN and
   no exception. Test in Task 6.
5. **A forced acquisition** (an engine-running start, SET 10 FAST): `acquireAndUseSatellites` calls
   `acceptForcedSolution` before the next tick has recomputed the solution. The fix must still be accepted at once,
   without TRAN. So `acceptForcedSolution` recomputes the solution first. Test in Task 2.

---

### Task 1: The solution math

**Files:**
- Create: `kln90b/GpsSolution.ts`
- Test: `test/unit/GpsSolution.test.ts`

**Interfaces:**
- Produces:
  - `SIGMA_UERE_M = 5`, `SIGMA_ALT_M = 30`, `RAIM_K = 5.3`, `MAX_EPE_NM = 3.8`.
  - `const enum Raim { Available, TooFewMeasurements, Geometry }`.
  - `interface GpsGeometry { valid: boolean; satellites: number; altitudeAided: boolean; measurements: number; hdop: number; epeNm: number; maxSlope: number }`.
    An invalid geometry has `hdop = NaN`, `epeNm = NaN` and `maxSlope = Infinity`.
  - `computeGeometry(los: readonly ReadonlyFloat64Array[], altitudeAided: boolean): GpsGeometry`.
    - Each `los` entry is `[zenithRad, azimuthRad]`, as `GPSSatellite.position.get()` returns it.
    - Rows are the SDK's unit vectors (`Vec3Math.setFromSpherical(1, zenith, azimuth)`) with a clock column of 1.
    - The altitude row is `[0, 0, SIGMA_UERE_M / SIGMA_ALT_M, 0]`.
  - `raimStatus(g: GpsGeometry, halNm: number): Raim`.
    - `TooFewMeasurements` when `measurements < 5`.
    - Otherwise `Geometry` when `maxSlope × SIGMA_UERE_M × RAIM_K` exceeds `halNm` in metres, else `Available`.
  - `halForMode(mode: NavMode): number`.

- [ ] **Step 1: Write the failing tests** in `test/unit/GpsSolution.test.ts`. Every expected value is derived by hand
  in the test's comment, never by calling the module.
  - `zenith plus three satellites on the horizon 120° apart: HDOP 2/√3`. Assert `valid` true, `hdop` close to
    `1.154700` (6 digits), `measurements` 4.
  - `EPE is 2 × HDOP × 5 m in NM`. Same geometry, `epeNm` close to `11.547005 / 1852` (6 digits).
  - `three satellites on the horizon need the altitude`.
    - Without the altitude row: `valid` false.
    - With it: `valid` true, `hdop` close to `1.154700`, `altitudeAided` true, `measurements` 4.
  - `four satellites on the horizon are singular without the altitude`. Assert `valid` false and `hdop` NaN.
  - `zenith plus four on the horizon at 0/90/180/270°: max slope 1`.
    - Hand derivation: the x/y variances are 0.5, the clock variance 0.25, and `S` of a horizon satellite is 0.25.
    - Assert `maxSlope` close to `1` (6 digits).
    - `raimStatus(g, 2)` is `Raim.Available`.
  - `raimStatus with four measurements is TooFewMeasurements`, whatever the HAL.
  - `raimStatus is Geometry when the protection level exceeds the limit`. Use a literal geometry object with
    `measurements: 6`, `maxSlope: 25`, `valid: true`:
    - `Geometry` for 0.3 NM (662.5 m > 555.6 m);
    - `Available` for 1 NM.
  - `a nearly collinear constellation is invalid above 3.8 NM`. Four satellites at zenith 89.9° and azimuths 0°, 0.1°,
    0.2°, 0.3°: assert `valid` false and `epeNm` > 3.8.
  - `halForMode`: ENR_LEG and ENR_OBS 2, ARM_LEG and ARM_OBS 1, APR_LEG 0.3.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run --project unit test/unit/GpsSolution.test.ts`
  Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `kln90b/GpsSolution.ts`.**
  - Approach: weighted least squares on whitened rows. Build the 4×4 normal matrix and invert it with a small Gauss-Jordan
    with partial pivoting. Treat a pivot below 1e-9 as singular, so the geometry is invalid.
  - `hdop = sqrt(C₀₀ + C₁₁)`.
  - Slopes: `H = C·Gᵀ`, `Sᵢᵢ = 1 − gᵢ·H[:, i]`, `slopeᵢ = sqrt(H₀ᵢ² + H₁ᵢ²) / sqrt(Sᵢᵢ)`. Take `Infinity` when
    `Sᵢᵢ ≤ 1e-9`.
  - `maxSlope` is the maximum over all rows, the altitude row included.
  - Reuse module-level scratch arrays (no allocation per call beyond the result object).
  - The header comment cites 5-29 and B-4 and points to the spec.

- [ ] **Step 4: Run them and see them pass.** The same command now PASSES.

- [ ] **Step 5: Benchmark, then throw it away.** Time 100 000 calls with nine rows in a scratch script (not committed).
  The result must be under 10 µs per call in Node. Note the number in the commit message.

- [ ] **Step 6: Commit**

  ```bash
  git add kln90b/GpsSolution.ts test/unit/GpsSolution.test.ts
  git commit -m "references #453 the GPS solution math: validity, HDOP, EPE and RAIM slopes"
  ```

### Task 2: GPS uses its own solution

**Files:**
- Modify: `kln90b/Gps.ts` (constructor, `tick`, `isValid`, `acceptForcedSolution`, `powerChanged`)
- Modify: `kln90b/Sensors.ts` (`SensorsIn` constructor: build `Airdata` before `GPS`)
- Create: `test/harness/gps.ts`
- Test: `test/render/GpsSolution.test.ts`
- Modify: `test/README.md`, `docs/architecture.md` (the GPS section)

**Interfaces:**
- Consumes: `computeGeometry`, `GpsGeometry` (Task 1).
- Produces:
  - `GPS` constructor gains a last parameter `hasAltitude: () => boolean`. `SensorsIn` passes
    `() => this.airdata.pressureAltitude !== null`.
  - `GPS.solution: GpsGeometry`, a getter (later tests spy on it with `vi.spyOn(gps, 'solution', 'get')`).
  - `GPS.hadFixSincePowerOn: boolean`, a getter. It is set by `gpsAcquired`, cleared by `powerChanged` on power-on and
    off. Note that #454 will touch `gpsAcquired` independently.
  - `GPS.isValid()` is `solutionAccepted && solution.valid`. The TRAN acceptance in `tick` and `acceptForcedSolution`
    use `solution.valid` instead of `hasSdkSolution()`.
  - In take-home mode, `solution` is a constant healthy geometry: `valid` true, `satellites` 8, `measurements` 8,
    `hdop` 1, `epeNm` from the formula, `maxSlope` 0. `isValid()` keeps today's take-home result.
  - Harness, in `test/harness/gps.ts`:
    - `inhibitAllBut(unit: HeadlessUnit, n: number): number[]`. It inhibits every satellite except the first `n` the
      SDK has in use, on `gpsSatComputer` and on `raimPrediction`, and returns the kept PRNs.
    - `liftInhibits(unit: HeadlessUnit): void`.

- [ ] **Step 1: Write the failing tests** in `test/render/GpsSolution.test.ts`:
  - `the model's HDOP equals the SDK's without an altitude input (two implementations)`. Use
    `bootUnit({panelXml: panelXml(NO_ALTIMETER)})` and `settle`, then expect `gps.solution.hdop` close to
    `gpsSatComputer.hdop` (6 digits) and `altitudeAided` false.
  - `navigates on three satellites with an altitude input, as NAV A (5-29)`.
    - Default boot (altimeter interfaced), settle, `inhibitAllBut(unit, 3)`, advance 10 s.
    - `isValid()` is true, `solution.satellites` 3, `solution.altitudeAided` true.
    - `gpsSatComputer.pdop` is -1 (the SDK alone has no solution).
  - `loses the fix on three satellites without an altitude input (5-29)`. Same with `NO_ALTIMETER`: `isValid()` is
    false within 3 s.
  - `passes the three-plus-altitude fix to the SDK as its last known position`.
    - Spy on `gpsSatComputer.syncLastKnownPosition`.
    - In the three-plus-altitude state, move the aircraft 150 NM in 10 NM steps (`moveAircraft`, 1 s apart).
    - `liftInhibits`. Within 120 s, `gpsSatComputer.systemState.get()` is `SolutionAcquired`, and the spy was called
      with the moved position.
  - `the bad-geometry case of the real constellation (spec 2)`.
    - `bootUnit({position: {lat: -64.5, lon: -52}, start: new Date('2026-11-05T01:20:00Z'), altitudeFt: 0, panelXml: panelXml(NO_ALTIMETER)})`,
      then `settle`.
    - Advance to 01:50:00Z: `solution.hdop` < 1.2.
    - Advance to 01:50:45Z: `solution.hdop` > 4.5, `satellites` 6, `isValid()` true.
    - The comment states the weekly repeat and that a changed ephemeris file must fail here.
    - The date is outside the harness navdata cycle (see `BootOptions.start`). Assert nothing about MSG here.
  - `take-home mode stays valid and healthy`. Boot with take-home on, past its warning page, then advance 60 s:
    - `isValid()` keeps today's value;
    - `solution.valid` is true;
    - no message from Task 5's list is listed.
  - `an engine-running start is valid at once, without TRAN` (Review Focus 5). Right after `bootUnit()` returns,
    before any `settle`, `isValid()` is true and `isTransition()` is false.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run --project render test/render/GpsSolution.test.ts`
  Expected: FAIL (`solution` does not exist, `inhibitAllBut` missing).

- [ ] **Step 3: Implement.**
  - Write `test/harness/gps.ts`.
  - In `GPS.tick` (non-take-home branch), after `onUpdate()`, recompute `solution` from the channels whose state is
    `InUse` or `InUseDiffApplied`, and from `hasAltitude()`.
    - Recompute only when the in-use PRN list, any of their position values or `hasAltitude()` changed since the last
      computation. Keep the previous inputs in reused arrays.
    - While `solution.valid && !hasSdkSolution()`, call `gpsSatComputer.syncLastKnownPosition(this.coords)` after
      `coords` is updated.
  - `acceptForcedSolution` recomputes the solution before it checks `solution.valid`.
  - The altitude input cannot change at runtime (no LVar override exists), but the cache key includes `hasAltitude()`
    anyway, since airdata may report none until its first tick.
  - Replace the todo comment in `isValid` with a 5-29 reference.

- [ ] **Step 4: Run them and see them pass, then the whole suite.**
  - Run: `npx vitest run --project render test/render/GpsSolution.test.ts`, then `npm test`.
  - Expected: PASS.
  - Existing characterization snapshots that change only because NAV A now follows `solution.altitudeAided` are a
    finding: report them, do not update them blindly.

- [ ] **Step 5: Docs.**
  - `docs/architecture.md`, GPS: the receiver model, the cache, the take-home constant, the last-known-position sync.
  - `test/README.md`: `inhibitAllBut` and `liftInhibits`.

- [ ] **Step 6: Commit**

  ```bash
  git add kln90b/Gps.ts kln90b/Sensors.ts test/harness/gps.ts test/render/GpsSolution.test.ts test/README.md docs/architecture.md
  git commit -m "references #453 GPS validity from the unit's own solution: three satellites plus altitude"
  ```

### Task 3: STA 2 as on the photographed unit

**Files:**
- Modify: `kln90b/pages/left/Sta2Page.tsx`
- Test: `test/render/pages/left/Sta2Page.test.ts`

**Interfaces:**
- Consumes: `GPS.solution.epeNm`, `GPS.isValid()` (Task 2).
- Produces: `export function formatEpe(epeNm: number | null): string`, five characters wide.

- [ ] **Step 1: Write the failing tests.**
  - Unit-level cases inside the render file:
    - `formatEpe(null)` is `'_____'`;
    - `formatEpe(0.0049)` is `' 0.00'`;
    - `formatEpe(0.0051)` is `' 0.01'`;
    - `formatEpe(0.025)` is `' 0.03'`;
    - `formatEpe(3.8)` is `' 3.80'`.
  - Replace both characterization snapshots:
    - Without a fix, row 2 of the left half is `'    _____NM'`.
    - With a fix, row 2 matches `/^ {5}\d\.\d\dNM$/`, and with this harness seed it is the literal the test pins (run
      once, then pin it with a comment saying it is the seed's value).
    - Rows 0 and 1 stay `'ESTIMATED  '` and `'POSN ERROR '`.

- [ ] **Step 2: Run them and see them fail.**

  Run: `npx vitest run --project render test/render/pages/left/Sta2Page.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `formatEpe` uses `padFixed(epeNm, 1, 2)` padded to 5 with `padStart`.
  - Line 3 renders four spaces, the field and capital `NM`.
  - The page comment:
    - cites 5-30 for the page;
    - says the line follows the photographed unit on host software 01515-0047 (spec section 1), not the 5-30 figure;
    - gives the EPE formula.

- [ ] **Step 4: Run them and see them pass.** The same command now PASSES.

- [ ] **Step 5: Commit**

  ```bash
  git add kln90b/pages/left/Sta2Page.tsx test/render/pages/left/Sta2Page.test.ts
  git commit -m "references #453 STA 2 shows the modern error estimate as on the photographed unit"
  ```

### Task 4: STA 1 DEGRD and NAV A from the solution

**Files:**
- Modify: `kln90b/pages/left/Sta1Page.tsx` (`stateText`)
- Test: `test/render/pages/left/Sta1Page.test.ts`
- Modify: `docs/architecture.md` (the STA 1 state line)

**Interfaces:**
- Consumes: `GPS.solution`, `raimStatus`, `halForMode`, `Raim` (Tasks 1 and 2), `props.memory.navPage.navmode`.

- [ ] **Step 1: Write the failing tests** in a new `describe('STA 1 states from the receiver solution (5-29, #453)')`:
  - `shows NAV A on three satellites with an altitude input`. After `inhibitAllBut(unit, 3)` and 10 s, row 0 is
    `'STATE NAV A'`.
  - `shows ACQ after losing the fix on three satellites without altitude`. With `NO_ALTIMETER`, row 0 is
    `'STATE   ACQ'`.
  - `shows DEGRD while RAIM is unavailable for geometry`.
    - `vi.spyOn(gps, 'solution', 'get')` returns a literal valid geometry with `measurements: 6`, `maxSlope: 200`,
      `satellites: 6`, `hdop: 1`, `epeNm: 0.01`, `altitudeAided: false`.
    - Row 0 is `'STATE DEGRD'`.
  - `does not show DEGRD when RAIM lacks measurements`. Same spy with `measurements: 4`: row 0 is `'STATE   NAV'`.

- [ ] **Step 2: Run them and see them fail.**

  Run: `npx vitest run --project render test/render/pages/left/Sta1Page.test.ts`
  Expected: the DEGRD test FAILS. The NAV A and ACQ tests may already pass through Task 2; keep them as pins.

- [ ] **Step 3: Implement.** In `stateText`, while valid:
  - `DEGRD` when `raimStatus(solution, halForMode(navmode)) === Raim.Geometry`;
  - otherwise NAV D as today, then `NAV A` when `solution.altitudeAided`, else `  NAV`.

  The comment says DEGRD's condition is the spec's low-confidence call.

- [ ] **Step 4: Run them and see them pass, then `npm test`.** Both commands PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add kln90b/pages/left/Sta1Page.tsx test/render/pages/left/Sta1Page.test.ts docs/architecture.md
  git commit -m "references #453 STA 1 shows DEGRD for a geometry without integrity, NAV A from the solution"
  ```

### Task 5: The coverage, RAIM and geometry messages

**Files:**
- Modify: `kln90b/data/PersistentMessages.ts`
- Test: `test/render/data/PersistentMessages.test.ts`

**Interfaces:**
- Consumes: `GPS.solution`, `GPS.isValid()`, `GPS.hadFixSincePowerOn`, `GPS.timeZulu`, `raimStatus`, `halForMode`,
  `SustainedCondition`.
- Produces:
  - `RAIM_MESSAGE_DELAY = 10_000`.
  - Four message classes, built in `buildPersistentMessages`, with these exact texts:
    - `["SATELLITE COVERAGE", "INADEQUATE FOR NAV"]`: `gps.hadFixSincePowerOn && !gps.isValid()`, no delay (B-4).
    - `["RAIM NOT AVAILABLE", "CROSS CHECK POSITION"]`: valid, mode not `APR_LEG`, `raimStatus(…, halForMode(mode)) !== Available`,
      held for more than `RAIM_MESSAGE_DELAY` of GPS time (B-3).
    - `["BAD SATELLITE GEOMETRY", "SEE EPE ON STA 2 PAGE"]`: the RAIM message's condition with cause `Geometry`, held for
      more than `RAIM_MESSAGE_DELAY` (B-1).
    - `["BAD SATELLITE GEOMETRY", "AND RAIM NOT AVAILABLE"]`: valid, mode `APR_LEG`, `raimStatus(…, 0.3) !== Available`,
      held for more than `RAIM_MESSAGE_DELAY` (B-1).
  - Each class keeps its own `SustainedCondition` and resets it in `onPowerOff`.
  - The file's "except for failures and RAIM problems" comment becomes a list of what stays for #366.

- [ ] **Step 1: Write the failing tests** in a new `describe('signal loss and RAIM messages (#453)')`:
  - `posts SATELLITE COVERAGE INADEQUATE FOR NAV at once when the fix is lost in flight, and removes it with the fix (B-4)`.
    - Settle, inhibit every satellite (`inhibitAllBut(unit, 0)`), advance 2 s: the message is listed.
    - `liftInhibits`, wait for `isValid()`: the message is gone.
  - `does not post it during the start-up search`. `bootUnit({coldGps: true})` and advance until valid: it is never
    listed.
  - `posts RAIM NOT AVAILABLE CROSS CHECK POSITION after 10 s with four satellites and no altitude (B-3)`.
    - `NO_ALTIMETER`, `inhibitAllBut(unit, 4)`.
    - Not listed at 9 s; listed at 12 s.
    - `BAD SATELLITE GEOMETRY SEE EPE ON STA 2 PAGE` is not listed (the cause is the count).
    - After `liftInhibits`, both are gone within 15 s.
  - `a drop of 3 s posts nothing`. Inhibit to 4 for 3 s, then lift: nothing is listed after 20 s.
  - `the altitude counts: four satellites plus altitude posts no RAIM message`. Default altimeter,
    `inhibitAllBut(unit, 4)`, 30 s: not listed.
  - `posts the geometry message with the RAIM message when the cause is geometry (B-1)`. Spy `solution` with
    `measurements: 6, maxSlope: 200` (valid): both messages are listed after 12 s, and neither at 9 s.
  - `VFR-only units get the RAIM message too`. `VFR_ONLY` with `NO_ALTIMETER`, four satellites: listed after 12 s.
  - `a clock jump does not post at once (Review Focus 2)`.
    - Hold four satellites for 5 s, then move the sim time 10 minutes ahead (`FakeSim` absolute time offset).
    - Not listed on the next tick; listed more than 10 s later.

- [ ] **Step 2: Run them and see them fail.**

  Run: `npx vitest run --project render test/render/data/PersistentMessages.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement the four classes** with B-page references in their comments.

- [ ] **Step 4: Run them and see them pass, then `npm test`.** Both commands PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add kln90b/data/PersistentMessages.ts test/render/data/PersistentMessages.test.ts
  git commit -m "references #453 the coverage, RAIM and bad geometry messages"
  ```

### Task 6: Integrity on the approach and STA 5

**Files:**
- Modify: `kln90b/GpsSolution.ts` (prediction helper)
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState` fields and their power-on reset)
- Modify: `kln90b/services/ModeController.ts` (`tick`, `checkSwitchAprArmToActive`)
- Modify: `kln90b/data/navdata/NavCalculator.ts` (the flag branch)
- Modify: `kln90b/data/PersistentMessages.ts` (two messages)
- Modify: `kln90b/pages/left/Sta5Page.tsx` (`calculateRaim`)
- Test: `test/render/services/ModeController.test.ts`, `test/render/pages/left/Sta5Page.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1, 2 and 5.
- Produces:
  - `predictRaim(prediction: GPSPredictionContext, lat: number, lon: number, timeMs: number, altitudeAided: boolean, halNm: number): boolean`
    in `GpsSolution.ts`. It runs `setPosition(lat, lon, 0, timeMs).predict()` and computes the geometry from the
    prediction's satellites in state `InUse`/`InUseDiffApplied`. It is true when `raimStatus === Available`.
  - `NavPageState` gets three fields, all reset at power-on:
    - `aprIntegrityInhibit: boolean`;
    - `integrityFlag: boolean`;
    - `aprRaimLoss: SustainedCondition`, built with `APR_RAIM_FLAG_DELAY = 120_000` (exported from `ModeController.ts`).
  - Messages, in `buildPersistentMessages`:
    - `["RAIM NOT AVAILABLE", "APR MODE INHIBITED", "PREDICT RAIM ON STA 5"]` while `navPage.aprIntegrityInhibit` (B-3);
    - `["PRESS GPS APR FOR NAV"]` while `navPage.integrityFlag` (B-3, 6-20).

- [ ] **Step 1: Write the failing tests.**
  - In `ModeController.test.ts`, a new `describe('integrity at the approach (6-3, 6-20, #453)')`. It reuses
    `armedNearFaf` (move it out of its describe if needed) or `approachWorld`.
  - `stays in ARM and posts the inhibit message when RAIM is predicted unavailable`.
    - Inhibit every satellite on `raimPrediction` only, then `flyOn`.
    - `navmode` stays `ARM_LEG` and the inhibit message is listed.
    - Lift the prediction inhibits: within 11 s `navmode` is `APR_LEG` and the message is gone.
  - `the inhibit message leaves when the gate stops checking`. As above, then move the aircraft back to 3 NM before
    the FAF: the message is gone on the next calculation tick.
  - `ACTV also needs RAIM now`. `NO_ALTIMETER`, `inhibitAllBut(unit, 4)` on the computer (the prediction stays
    full): `navmode` stays `ARM_LEG` with the inhibit message.
  - `in APR, a RAIM loss flags the navigation after 2 minutes and asks for GPS APR (B-1, B-3, 6-20)`.
    - Reach `APR_LEG`, then `NO_ALTIMETER` and `inhibitAllBut(unit, 4)`.
    - At 12 s: `BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE` is listed, and `nav.xtkToActive` is not null.
    - At 119 s: still not null.
    - At 122 s: `xtkToActive` is null, and `PRESS GPS APR FOR NAV` is listed.
    - Press GPS APR (`EVT_APPR_ARM`): on the next calculation tick `navmode` is `ARM_LEG`, `xtkToActive` is not null,
      and `PRESS GPS APR FOR NAV` is gone.
  - `the integrity flag stays after the fix comes back, until GPS APR`.
    - In `APR_LEG`, inhibit everything for 5 s, then lift.
    - With a valid fix again, `xtkToActive` stays null until GPS APR.
  - `a Direct To clears the integrity flag`. Same flagged state, then Direct To the MAP: `integrityFlag` is false and
    the message is gone.
  - `ground speed 0 at the gate predicts at the present time (Review Focus 4)`.
    - `moveAircraft` with `groundspeedKt: 0` inside 2 NM, spying on `raimPrediction.setPosition`.
    - Every time argument is finite, and `unit.errors` is empty.
  - `a power cycle clears the flag and posts no coverage message during the new search (Review Focus 3)`.
    - Flagged state, power off, power on (`coldGps`-like search).
    - `integrityFlag` is false.
    - SATELLITE COVERAGE INADEQUATE FOR NAV is never listed before the first fix.
  - In `Sta5Page.test.ts`, `predicts RAIM not available with four satellites and no altitude input (6-20, #453)`.
    - `NO_ALTIMETER`. Before opening STA 5, inhibit on `raimPrediction` all but the four it has in use at the
      destination ETA.
    - The bars read `'  ééééééé  '`.
    - The existing STA 5 tests still pass.

- [ ] **Step 2: Run them and see them fail.**

  Run: `npx vitest run --project render test/render/services/ModeController.test.ts test/render/pages/left/Sta5Page.test.ts`
  Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - **`checkSwitchAprArmToActive`**, after the track check, replacing `//Integrity check?`. Retry the predictions at
    most every 10 s while refused. The gate needs:
    - `raimStatus(gps.solution, 0.3) === Available`;
    - `predictRaim` true at the FAF for its ETA;
    - `predictRaim` true at the MAP for its ETA.
  - **ETAs.**
    - `now = gps.timeZulu.getTimestamp()`.
    - FAF: `now + fafDist / gs` hours.
    - MAP: the FAF's ETA plus the FAF→MAP distance over `gs`.
    - With `gs < 1` kt, both ETAs are `now`.
  - **Refused:** set `aprIntegrityInhibit` and stay in `ARM_LEG`.
  - **Clearing `aprIntegrityInhibit`:**
    - on success;
    - in `tick` when the mode is not `ARM_LEG`;
    - when the gate returns early because the FAF is not active or the aircraft is beyond 2 NM.
  - **`tick`, `APR_LEG`:**
    - `integrityFlag ||= !gps.isValid() || aprRaimLoss.update(raimStatus(solution, 0.3) !== Available, now)`.
    - In any other mode: `integrityFlag = false` and `aprRaimLoss.reset()`.
  - **`NavCalculator`:** flag when `!gps.isValid() || navPage.integrityFlag`.
  - **`Sta5Page.calculateRaim`:** `predictRaim(…, props.sensors.in.airdata.pressureAltitude !== null, 0.3)` instead of
    the PDOP check.
  - The spec's 5.6 lists the approach cases as flight tests. These render tests with `moveAircraft` observe them more
    cheaply, which CLAUDE.md prefers.
  - Comments cite 6-3, 6-20, B-1 and B-3, and say the 2 minutes are the spec's low-confidence call.

- [ ] **Step 4: Run them and see them pass, then `npm test`, `npx tsc --noEmit` and `npm run build`.**
  - Expected: all PASS.
  - The build shows no new circular dependency warning: compare the count with `master`.

- [ ] **Step 5: Commit**

  ```bash
  git add kln90b/GpsSolution.ts kln90b/data/VolatileMemory.ts kln90b/services/ModeController.ts kln90b/data/navdata/NavCalculator.ts kln90b/data/PersistentMessages.ts kln90b/pages/left/Sta5Page.tsx test/render/services/ModeController.test.ts test/render/pages/left/Sta5Page.test.ts
  git commit -m "references #453 integrity at the approach: ACTV gate, integrity flag, PRESS GPS APR FOR NAV, STA 5"
  ```

### Task 7: Close-out

**Files:**
- Modify: `docs/superpowers/specs/2026-11-01-gps-signal-loss-design.md`, only if the implementation settled one of the
  spec's open calls differently. Record the change with the reason.

- [ ] **Step 1: Full verification on the committed tree.** Run `git status` (clean), then `npm test`,
  `npx tsc --noEmit` and `npm run build`. All PASS.
- [ ] **Step 2: Squash the work commits into one** (CLAUDE.md, one commit per issue). The spec and plan commits stay
  as they are.

  ```bash
  git reset --soft <the plan commit>
  git commit -m "fixes #453 the unit's own GPS solution, error estimate, RAIM, signal-loss messages and approach integrity"
  ```

  Expected: `git log --oneline master..` shows the design commit, the plan commit and one `fixes #453` commit.
