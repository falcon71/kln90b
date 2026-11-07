# GPS Jamming and Spoofing from Simulated Transmitters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace #460's jamming ramp with ground transmitters (jammers and spoofers) whose effects emerge from distance, line of sight, the antenna and the receiver's normal rules, and build spoofing with a fake sky, a mixed solution and capture (#465).

**Architecture:** Pure math in `kln90b/GpsTransmitter.ts` (path loss, horizon, antenna gain, noise, edges) and in `kln90b/GpsSolution.ts` (the solution's response to range errors and the residual RAIM test). `kln90b/failures/Transmitters.ts` places, replaces and persists the transmitters. `kln90b/failures/FakeReceiver.ts` models the fake satellites and claims channels beside the SDK's `GPSSatComputer`. `kln90b/failures/RangeErrors.ts` turns the rows of the solution into a position, velocity and clock error and a residual. `Gps.ts` wires them into its tick, its solution and its time.

**Tech Stack:** TypeScript (target es2017), `@microsoft/msfs-sdk` (`GPSSatComputer`, `GPSPredictionContext`, facility nearest search), Vitest (unit, render, flight stages).

**Spec:** [docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md](../specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md). Read it in full before any task; this plan cites its section names.

## Global Constraints

- `target: es2017`; no newer runtime features. No new circular dependencies (the build prints the existing ones).
- Pure math modules (`GpsSignal.ts`, `GpsSolution.ts`, `GpsTransmitter.ts`) import nothing from the project except each other; `GpsTransmitter.ts` may import `GpsSignal.ts`.
- Tick cost (CLAUDE.md): no allocation in the per-tick paths (typed arrays indexed by PRN, reused objects); `GPSPredictionContext.predict()` at most every 5 s of sim time per context; edge solves only at a generation or when the reference altitude grows. SimVars read once per calculation tick.
- DOM changes only in display ticks. STA 1 reads state; it computes nothing new.
- Every constant marked "guess" in the spec keeps a `//guess` comment and the spec's value. Manual page references (`B-3`, `B-4`, `5-29`, `IM C-7`, `IM 2-66`, `3-17`, `3-35`) stay in comments where the behavior is implemented. Never copy manual text.
- American English in code, comments, docs and commit messages. No counts in prose for things that grow.
- Take-home mode: jamming and spoofing do nothing (as `GpsFailures.receiverFailed`).
- With failures off, the existing suite stays green, except where the spec's three decided exceptions (the general time check, the restart from a far-off belief, the sky search after 5 minutes without a fix) change a test.
- Commits: each task commits on the branch `465-gps-transmitters` as `references #465 <task>`. Task 12 squashes the implementation commits into one `fixes #465 ...` commit (CLAUDE.md: one commit per issue). Never push.
- Checks before every commit: `npx tsc --noEmit` clean; the task's tests green. Before Task 12's commit: `npm test`, `npm run build`.

## Review Focus

1. **A teleport or a slew far across the map** (the sim's map relocation): a transmitter left by a jump of hundreds of NM is replaced exactly once, at the new place; nothing loops or throws. Test in Task 4.
2. **A power cycle or a hot swap while captured or in the mixed phase:** no ticks run while off or disabled; at power-on the fake satellites restart from nothing, the claims are released, and the stored false position and clock make the fake satellites come back with hot times. Test in Task 10.
3. **A repair in the middle of the mixed phase:** the claims, the fake rows, the range errors and the RAIM detection go in the same tick; STA 1 shows no fake satellite at the next display tick. Test in Task 10.
4. **An airport search that never resolves** (`Coherent.call` with nothing attached never replies): the spoofer stays pending and sends nothing, jamming works on, nothing throws, and a session that ends while pending draws a new spoofer at the next start. Test in Task 6.
5. **Both failures active, one repaired:** the other transmitter, its stored values and its effect are unchanged. Test in Task 10.

---

### Task 1: Spike: a fake satellite claims an SDK channel (throwaway)

The spec's largest risk ("The fake receiver and the shared channels"). Prove the mechanism the later tasks build on, then delete the spike. **Do not commit anything from this task.**

**The mechanism to prove:** a unit channel `i` claimed by a fake satellite makes the SDK satellite that sits in SDK channel `i` (whichever PRN it is, now or after the SDK reassigns the channel) report lost through the existing `KLNGPSSatComputer.wrapReachability(isLost)` wrapper. The SDK keeps its 8 channels and its own bookkeeping; the unit shows the fake satellite in that channel. Releasing the claim lets the SDK acquire normally again.

**Files:**
- Create (throwaway, delete at the end): `test/render/SpikeChannelClaim.test.ts`

- [ ] **Step 1: Write the spike test.** Boot an engine-running unit (`bootUnit()`, default position 47/8), wait for the fix (`settle(unit)`). Replace the reachability predicate: `gps.gpsSatComputer.wrapReachability(prn => gps.signals.isLost(prn) || claimedPrns.has(prn))`, where `claimedPrns` is recomputed before every calculation tick as `{getChannels()[0]?.prn}` (channel 0 claimed). Advance 6 minutes in 1 s steps. Assert: `getChannels().length === 8` throughout; the satellite in channel 0 is never `Acquired`/`DataCollected`/`InUse` while claimed (record every PRN that sat there: after the 4-minute `acquisitionTimeout` the SDK may reassign it, and the new PRN must be held lost too); `unit.errors` is empty. Then clear the claim and assert channel 0 reaches `InUse` within `IDLE_ACQUISITION + WARM_ACQUISITION_RANGE + 30 s` (ephemeris).
- [ ] **Step 2: Run it.** `npx vitest run test/render/SpikeChannelClaim.test.ts`. Expected: PASS.
- [ ] **Step 3: Decide.**
  - PASS: the mechanism holds. Delete the file, note "spike passed" in the task report, continue with Task 2.
  - FAIL in a way a small adjustment fixes (for example the claim must also cover the PRN the SDK is about to assign): adjust, rerun, and describe the adjusted rule in the report; Task 8 implements the adjusted rule.
  - FAIL otherwise: **stop and report to the maintainer** with the observed SDK behavior. The spec's fallback (taking `GPSSat.ts` into the project with its license notice) needs the maintainer's go-ahead before any later task starts.
- [ ] **Step 4: Confirm the tree is clean.** `git status` shows no change from this task.

---

### Task 2: Transmitter physics (pure math)

**Files:**
- Create: `kln90b/GpsTransmitter.ts`
- Test: `test/unit/GpsTransmitter.test.ts`

**Interfaces:**
- Consumes: `antennaCurveSnr`, `ZENITH_SNR`, `BACKLOBE_SNR`, `ACQUIRE_SNR`, `AntennaAttitude` from `kln90b/GpsSignal.ts`.
- Produces (all exported from `kln90b/GpsTransmitter.ts`):
  - `MAST_FT = 100` (guess), `DIFFRACTION_DB_PER_NM = 2` (guess: the spec's "few NM to a few tens of NM" band), `RECEIVER_BANDWIDTH_DBHZ = 60` (guess; with 8 fake satellites the cap is 60 − 10·log10(7) ≈ 51.5, inside the spec's 51 to 54), `LEVEL_FLIGHT_GAIN_DB = BACKLOBE_SNR - ZENITH_SNR` (−25), `GPS_ORBIT_RADIUS_M = 26_560_000`, `EARTH_RADIUS_M = 6_371_000`, `METERS_PER_MS = 299_792.458`.
  - `radioHorizonNm(aircraftAglFt: number): number` — `1.23 × (√MAST_FT + √max(0, agl))`.
  - `diffractionLossDb(distanceNm: number, aircraftAglFt: number): number` — `max(0, distance − horizon) × DIFFRACTION_DB_PER_NM`.
  - `transmitterSinLocalElevation(distanceNm: number, aircraftAglFt: number): number` — the transmitter's elevation seen from the aircraft over a 4/3 earth: `(MAST_FT − agl) / (distance in ft) − distance / (2 × 4/3 × earth radius in NM)`, as a sine.
  - `transmitterSinAntennaElevation(bearingTrueDeg: number, sinLocalElevation: number, attitude: Readonly<AntennaAttitude>): number` — as `antennaSinElevation` in `GpsSignal.ts` but from a true bearing (clockwise from north) and **without** its below-the-horizon rule.
  - `antennaGainDb(sinAntennaElevation: number): number` — `antennaCurveSnr(s) − ZENITH_SNR`.
  - `levelDb(powerDb: number, distanceNm: number, aircraftAglFt: number, gainDb: number): number` — `powerDb − 20·log10(max(distance, 0.1)) − diffractionLossDb + gainDb`. A level is dB over the thermal noise in the receiver's bandwidth.
  - `dbToRatio(db: number): number`, `noiseRiseDb(jammerRatio: number, fakeRatio: number): number` — `10·log10(1 + J + F)`.
  - `fakeSnr(perSatelliteRatio: number, fakeCount: number, jammerRatio: number): number` — `10·log10(f) + RECEIVER_BANDWIDTH_DBHZ − 10·log10(1 + J + (n − 1)·f)`.
  - `jammerPowerDb(firstLossNm: number): number` — the power whose level at `firstLossNm`, in level flight within line of sight, gives a 7 dB noise rise: `10·log10(10^0.7 − 1) + 20·log10(firstLossNm) − LEVEL_FLIGHT_GAIN_DB`.
  - `spooferPowerDb(captureNm: number): number` — the total fake level at `captureNm` in level flight gives a 20 dB noise rise: `10·log10(10^2 − 1) + 20·log10(captureNm) − LEVEL_FLIGHT_GAIN_DB`.
  - `jammerEdgeNm(powerDb: number, aircraftAglFt: number): number` — horizontal distance where the jammer's noise rise in level flight is 1 dB. Bisection on [0.1, 2000] NM, 40 iterations; the effect is monotone in the distance.
  - `spooferEdgeNm(powerDb: number, fakeCount: number, aircraftAglFt: number): number` — where `fakeSnr(level/fakeCount, fakeCount, 0)` is `ACQUIRE_SNR`, same bisection.
  - `rangeFromSinElevationM(sinElevation: number): number` — slant range to a satellite on the orbit radius: `√(R²s² + r² − R²) − R·s` with `R = EARTH_RADIUS_M`, `r = GPS_ORBIT_RADIUS_M`.

- [ ] **Step 1: Write the failing tests** in `test/unit/GpsTransmitter.test.ts`:
  - `radio horizon`: `radioHorizonNm(0)` ≈ 12.3 (±0.1); `radioHorizonNm(5000)` ≈ 99.3; `radioHorizonNm(10000)` ≈ 135.3; `radioHorizonNm(35000)` ≈ 242.4.
  - `diffraction loss is 0 within the horizon and rises with the distance beyond it`: 0 at 100 NM for 10,000 ft; 10 at 140.3 NM; strictly increasing beyond.
  - `level flight puts a distant transmitter on the antenna floor`: `antennaGainDb(transmitterSinAntennaElevation(90, transmitterSinLocalElevation(50, 10000), LEVEL))` is −25.
  - `banking toward the transmitter raises the gain, away lowers none below the floor`: at 30° right bank with the transmitter at bearing 90 (heading 0), gain > −10; at 30° left bank, gain is −25.
  - `noise rise`: `noiseRiseDb(0, 0)` is 0; `noiseRiseDb(dbToRatio(6.02), 0)` ≈ 7.0.
  - `fake SNR caps at about 51.5 with eight fake satellites`: `fakeSnr(dbToRatio(40), 8, 0)` within [51, 54] and `fakeSnr(dbToRatio(60), 8, 0)` within 0.1 of it.
  - `a jammer of the drawn power takes the weakest satellite at its first-loss distance`: `noiseRiseDb(dbToRatio(levelDb(jammerPowerDb(150), 150, 10000, -25)), 0)` ≈ 7.0 (±0.05).
  - `the jammer edge is where the rise is 1 dB, capped by the horizon`: `jammerEdgeNm(jammerPowerDb(150), 35000)` is about 3.9 × 150 capped near 242 + a few NM of diffraction (assert within [243, 260]); `jammerEdgeNm(jammerPowerDb(150), 0)` within [25, 35] (the 12.3 NM ground horizon plus the diffraction band that a strong jammer still reaches through; about 29).
  - `a spoofer is horizon-limited`: `spooferEdgeNm(spooferPowerDb(450), 8, 35000)` within [242.4, 270].
  - `range from elevation`: zenith ≈ 20,189 km (±1 km); 0° ≈ 25,785 km (±5 km).
- [ ] **Step 2: Run** `npx vitest run test/unit/GpsTransmitter.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `kln90b/GpsTransmitter.ts` with the header comment of `GpsSignal.ts`'s kind: what each term is, the spec's section names, the guesses.
- [ ] **Step 4: Run** the test. Expected: PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `references #465 transmitter physics`.

---

### Task 3: The solution's response to range errors and the residual RAIM test

**Files:**
- Modify: `kln90b/GpsSolution.ts`
- Test: `test/unit/GpsSolution.test.ts` (add a `describe('range errors (#465)')`)

**Interfaces:**
- Produces (in `kln90b/GpsSolution.ts`):
  - `export interface SolutionMatrices { readonly g: Float64Array; readonly h: Float64Array; n: number }` — `g` is `MAX_ROWS × 4` (row `i` at `[4i..4i+3]`: line of sight x, y, z and 1, the altitude row `[0, 0, ALTITUDE_WEIGHT, 0]`); `h` is `4 × MAX_ROWS` (`h[c × MAX_ROWS + i]`: component `c` of `C·Gᵀ` for row `i`, components x north, y west, z up, clock). `export function createSolutionMatrices(): SolutionMatrices`.
  - `computeGeometry(satellites, altitudeAided, coefficients?, matrices?: SolutionMatrices)` — writes `g`, `h` and `n` when the solution is valid; leaves them otherwise. Existing callers unchanged.
  - `export function solveErrors(m: SolutionMatrices, errors: Float64Array, out: Float64Array): number` — `errors[i]` is row `i`'s whitened range error in meters (a satellite's as it is; the altitude row's multiplied by `ALTITUDE_WEIGHT`). Writes `out[0]` north m, `out[1]` east m, `out[2]` up m, `out[3]` clock m (the shift of the solution: position components `−H·e`, east the negative of west, clock `+H·e`), and returns the sum of the squared residuals `Σ (e − G·(H·e))²` in m².
  - `export const RAIM_PFA = 1 / 15000` (guess) and `export function raimThreshold(dof: number): number` — the chi-square value exceeded with probability `RAIM_PFA` for `dof` degrees of freedom (bisection on the regularized upper incomplete gamma; a series or continued fraction is the implementer's choice).
  - `export function raimTestFails(sseM2: number, measurements: number): boolean` — `measurements ≥ 5 && sseM2 / SIGMA_UERE_M² > raimThreshold(measurements − 4)`.

- [ ] **Step 1: Write the failing tests:**
  - `computeGeometry fills the matrices; its coefficients are the north and minus the west row of h` (for the six-satellite fixture already in the file: `coefficients[2i] === h[0·MAX_ROWS+i]`, `coefficients[2i+1] === -h[1·MAX_ROWS+i]`).
  - `one satellite's error moves the position by minus its coefficients times the error` (same fixture, 100 m on row 2: `out[0] ≈ -coefficients[4]·100`, `out[1] ≈ -coefficients[5]·100`).
  - `an error common to every satellite row is all clock` (100 m on every satellite row, no altitude: `out[0..2] ≈ 0`, `out[3] ≈ 100`, return ≈ 0).
  - `the residual of one bad row is its error squared times (1 - its hat diagonal)` (compute the hat diagonal by hand from `g` and `h` in the test).
  - `an altitude input reading 100 m high moves the solution up` (altitude-aided fixture: the caller enters the altitude row's error as `-ALTITUDE_WEIGHT × 100`, the convention `solveErrors`' doc states for that row, because the row's coefficient sign is physical; assert `out[2] > 0`).
  - `raimThreshold(2)` ≈ `−2·ln(RAIM_PFA)` = 19.23 (±0.01); `raimThreshold(1)` ≈ 15.91 (±0.05); increasing in `dof`.
  - `raimTestFails`: false below 5 measurements whatever the residual; false at `sse = 0`; true for one 100 m error among six satellites of the fixture.
- [ ] **Step 2: Run** `npx vitest run test/unit/GpsSolution.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** `computeGeometry` already computes `C` in `augmented` and the rows in `rows`; copy them into the matrices in the existing slope loop (allocation-free). Update the module header: the single-bias note ("a later single-satellite bias must flip it") now points to `solveErrors`.
- [ ] **Step 4: Run** the file. Expected: PASS, and the existing tests of the file unchanged.
- [ ] **Step 5: Commit** `references #465 the solution's response to range errors and the residual RAIM test`.

---

### Task 4: The catalog entry and the transmitter service

**Files:**
- Modify: `kln90b/failures/FailureCatalog.ts` (add `gpsSpoofing`), `kln90b/failures/GpsFailures.ts` (remove the jamming ramp and wander: `rampS`, `finalDb`, `elapsedS`, `JAMMING_WANDER_*`, `RAMP_SAVE_INTERVAL_S` if only jamming used it, `jamming`, `jammingDb`, `refreshLevel`, the `gpsJamming` branch of the `failureChanged` handler; `RampProgress` stays for the faulty satellite)
- Create: `kln90b/failures/Transmitters.ts`
- Test: `test/unit/failures/Transmitters.test.ts`; adjust `test/unit/failures/GpsFailures.test.ts` (delete the `GpsFailures jamming` describe), `test/unit/failures/FailureCatalog.test.ts`, `test/unit/failures/Failures.test.ts` where they list the keys.

**Interfaces:**
- Consumes: `Failures` (`values`, `setValues`, `isEffective`), `FailureChangedEvents`, Task 2's functions.
- Produces (in `kln90b/failures/Transmitters.ts`):
  - `export interface TransmitterSite { lat: number; lon: number; powerDb: number; refAglFt: number }`
  - `export interface SpooferSite extends TransmitterSite { falseLat: number; falseLon: number; falseAltFt: number; shiftMs: number; clockM: number }`
  - `export interface AirportFinder { find(lat: number, lon: number, radiusNm: number): Promise<{ lat: number; lon: number; elevationFt: number } | null> }`
  - `export interface TransmitterInputs { lat: number; lon: number; aglFt: number; groundElevationFt: number; simTimeS: number; attitude: Readonly<AntennaAttitude> }` (one object owned by `GPS`, filled in place each tick)
  - `export class Transmitters` with `constructor(bus: EventBus, failures: Failures, takeHomeMode: boolean, random: () => number = Math.random)`, `setAirportFinder(finder: AirportFinder): void`, `tick(inputs: Readonly<TransmitterInputs>): void`, `refresh(inputs: Readonly<TransmitterInputs>): void` (levels only: no time, no draw, no save), `reset(): void` (power change: forgets the last position and time, keeps the sites), `get jammer(): Readonly<TransmitterSite> | null`, `get spoofer(): Readonly<SpooferSite> | null` (null while the airport search is pending), `jammerRatio: number` (J at the aircraft, 0 without), `spooferRatio: number` (the spoofer's total level at the aircraft as a ratio, 0 without or while pending), `spooferFakeCount: number` and `setFakeCount(n: number): void` (Task 8's `GPS` wiring calls it each tick with the fake sky's count; until then 8).
  - Constants (guesses from the spec): `GROUND_DISTANCE_MIN_NM = 2`, `GROUND_DISTANCE_MAX_NM = 15` (the placement uses `min(GROUND_DISTANCE_MAX_NM, radioHorizonNm(aglFt))`, so a ground transmitter stays within line of sight and takes effect at once), `PLACE_SHARE_MIN = 0.9`, `PLACE_SHARE_MAX = 1.0`, `PLACE_BEARING_SPREAD_DEG = 30`, `JAMMER_FIRST_LOSS_MIN_NM = 100`, `JAMMER_FIRST_LOSS_MAX_NM = 250`, `SPOOFER_CAPTURE_MIN_NM = 300`, `SPOOFER_CAPTURE_MAX_NM = 600`, `FALSE_DISTANCE_MIN_NM = 30`, `FALSE_DISTANCE_MAX_NM = 150`, `AIRPORT_SEARCH_RADIUS_NM = 30`, `SHIFT_MIN_H = 2`, `SHIFT_MAX_H = 12`, `REFERENCE_FLOOR_FT = 10000`, `REF_SAVE_STEP_FT = 500` (save when the reference has grown by this since the last save; our choice for "at most every few seconds of climb").

**Rules to implement** (the spec's "Transmitters", "Power", "Placement", "Persistence"):
- Stored values: `gpsJamming` `{lat, lon, powerDb, refAglFt}`; `gpsSpoofing` additionally `{falseLat, falseLon, falseAltFt, shiftMs, clockM}`. Missing or non-finite fields: generate anew.
- Track for placement: from the previous tick's true position to this one; below 2 kt (3-35) or with no previous position (first tick after `reset`, a step back, or a step over 60 s as `MAX_SIGNAL_STEP_S`) the bearing is random.
- On the ground (`attitude.onGround`): random bearing, distance uniform in [2, min(15, radioHorizonNm(aglFt))] NM (12.3 NM at AGL 0). In flight: bearing = track + uniform(−30, 30); distance = uniform(0.9, 1.0) × the edge at the present AGL (`jammerEdgeNm` / `spooferEdgeNm` with `spooferFakeCount`).
- Reference altitude: starts at `max(REFERENCE_FLOOR_FT, present AGL)` at the generation; grows with the AGL; saved per `REF_SAVE_STEP_FT`.
- Leave: horizontal distance > edge at `refAglFt` → generate anew at once (one generation per tick at most).
- Spoofer generation: draw the place, the power (from `spooferPowerDb(capture)`), the shift (uniform hours in [2, 12], random sign), `clockM` uniform in ±`METERS_PER_MS / 2`, a point 30 to 150 NM from the place at a random bearing; then `finder.find(point, 30)`. The match sets `falseLat/Lon/AltFt`; `null` sets the point and `inputs.groundElevationFt` at the generation. Until the promise resolves `spoofer` is null and nothing is saved. A finder not yet set (`setAirportFinder` not called) counts as pending. A result that arrives after the failure was repaired or regenerated is dropped (a generation counter).
- `failureChanged` active: generate at the next `tick` (it needs the inputs). Inactive: drop the site at once, ratios 0.
- Levels each tick: `levelDb(powerDb, slant distance, aglFt, antennaGainDb(transmitterSinAntennaElevation(bearing to the site, transmitterSinLocalElevation(...), attitude)))` → ratio.

- [ ] **Step 1: Write the failing tests** (`test/unit/failures/Transmitters.test.ts`, with a fake `Failures` as `GpsFailures.test.ts` builds one, `mulberry32` from `test/harness/sim/random.ts`, and a fake finder that resolves what the test says):
  - `gpsSpoofing is in the catalog: SPOOFING, manual, no TEST FAIL` (`FailureCatalog.test.ts`).
  - `on the ground the jammer is placed 2 to 12.3 NM away (within the ground horizon) and takes effect at once` (ratio at the first tick gives a noise rise above 20 dB).
  - `in flight the jammer is placed ahead within ±30 degrees at 90 to 100 % of the present edge` (100 draws, flying 090 at 5,000 ft AGL: every bearing within [60, 120], every distance within [0.9, 1.0] × `jammerEdgeNm(powerDb, 5000)`).
  - `a prop at 5,000 ft is placed by its present horizon, not by the reference altitude` (distance ≤ `jammerEdgeNm(powerDb, 5000)`).
  - `below 2 kt the bearing is random` (spread over all quadrants in 100 draws).
  - `a descent below the horizon does not generate a new jammer; it comes back on the climb` (climb to 20,000, descend to 1,000 so the site is beyond the present horizon: same site; climb again: ratio > 0 again).
  - `leaving by the reference altitude generates a new one ahead, once` (fly past until distance > edge at `refAglFt`: exactly one new site, then stable).
  - **Review Focus 1:** `a teleport of 500 NM replaces the transmitter exactly once and does not throw`.
  - `the stored site is loaded; one beyond its edge at a session start is replaced` and `values that do not parse are generated anew`.
  - `the reference altitude grows and is saved per 500 ft`.
  - `the spoofer draws its shift within 2 to 12 hours either sign, its clock within ±0.5 ms, its false point 30 to 150 NM from the place` (100 draws).
  - `the spoofer takes the airport the finder returns, else the drawn point at the ground elevation under the aircraft`.
  - `the repair drops the site at once and a late airport result is ignored`.
  - `take-home mode: no site, ratios 0`.
  - In `GpsFailures.test.ts`: the jamming describe is deleted; the receiver-failure and faulty-satellite tests stay green.
- [ ] **Step 2: Run** `npx vitest run test/unit/failures`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `Transmitters.ts`, the catalog entry, and the removal from `GpsFailures.ts`. `Gps.ts` still compiles: replace `this.failures.jammingDb` with `0` and `this.failures.refreshLevel()` with nothing for now, marked `//#465: Task 6 wires the transmitters`. The render jamming tests (`test/render/failures/GpsJamming.test.ts`) that use the ramp are deleted in this task (Task 6 writes their replacements); the `STA 1 during a receiver failure` describe moves to `test/render/failures/GpsReceiverFailures.test.ts` unchanged.
- [ ] **Step 4: Run** `npx vitest run test/unit/failures test/render/failures` and `npx tsc --noEmit`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `references #465 the spoofing catalog entry and the transmitter service`.

---

### Task 5: The airport finder

**Files:**
- Create: `kln90b/data/navdata/NearestAirportFinder.ts`
- Modify: `kln90b/Gps.ts` (construct and own `public readonly transmitters = new Transmitters(bus, failures, this.takeHomeMode)`; not yet ticked, Task 6 wires the tick), `kln90b/KLN90BCore.ts` (after `facilityLoader` exists: `sensors.in.gps.transmitters.setAirportFinder(new NearestAirportFinder(facilityLoader))`)
- Test: `test/render/failures/AirportFinder.test.ts`

**Interfaces:**
- Consumes: `AirportFinder` (Task 4), `KLNFacilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport)`, `KLNNearestAirportFacilitySearchSession.setAirportFilter` / `setExtendedAirportFilters`, `getFacility`.
- Produces: `export class NearestAirportFinder implements AirportFinder` — `constructor(loader: KLNFacilityLoader)`; `find` opens one session per call (searches are rare), filters `setAirportFilter(false, AirportClassMask.HardSurface)` and `setExtendedAirportFilters(<hard surface mask as AirportNearestList builds it>, NearestAirportSearchSession.Defaults.ApproachTypeMask, NearestAirportSearchSession.Defaults.ToweredMask, 1500)`, searches within the radius for a few items, skips ICAO regions `XX` and `XY`, takes the nearest, returns its `lat`, `lon` and elevation in feet (the facility's `altitude` is meters).

- [ ] **Step 1: Write the failing tests** (boot with `bootUnit({facilities: [...]})`, airports built with the fixtures' helpers):
  - `finds the nearest hard-surfaced airport with a runway of 1500 m or more within the radius` (three airports: a 1,200 m asphalt nearer, a grass 2,000 m nearer, a 2,500 m asphalt farther but inside: returns the last, elevation converted to feet).
  - `returns null when none matches within the radius`.
  - `ignores a user airport` (a user airport, region `XX`, nearest and matching: not returned).
  - `the unit wires the finder into the transmitters at boot` (after `bootUnit`, a stored spoofer's generation calls the real finder: spy on `NearestAirportFinder.prototype.find`).
- [ ] **Step 2: Run** `npx vitest run test/render/failures/AirportFinder.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the finder and the wiring.
- [ ] **Step 4: Run** the test and `npx tsc --noEmit`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `references #465 the spoofer's airport search`.

---

### Task 6: Jamming by distance in the receiver

**Files:**
- Modify: `kln90b/Gps.ts` (own a `Transmitters` instance as `public readonly transmitters`; fill a reused `TransmitterInputs` once per tick from `PLANE LATITUDE`, `PLANE LONGITUDE` (already read), `PLANE ALT ABOVE GROUND` and `PLANE ALTITUDE` (read once each), the sim time and the antenna attitude; `transmitters.tick(inputs)` where `failures.tick` runs today, before `signals.tick`; pass `noiseRiseDb(transmitters.jammerRatio, transmitters.spooferRatio)` where `jammingDb` was passed; in `onBeforeForcedAcquisition` call `transmitters.refresh(inputs)` after reading the attitude and the SimVars; `powerChanged` calls `transmitters.reset()`), `kln90b/GpsSignal.ts` (rename the `jammingDb` parameters of `SatelliteSignals.tick/refresh/compute` to `noiseRiseDb`; the doc says the rise of every transmitter)
- Create: `test/harness/gps.ts` additions: `flyStraight(unit: HeadlessUnit, from: LatLon, trackTrue: number, groundspeedKt: number, seconds: number, aglFt: number): Promise<LatLon>` (sets `PLANE LATITUDE/LONGITUDE`, `GROUND VELOCITY`, `PLANE ALT ABOVE GROUND`, `PLANE ALTITUDE` (= agl, the fixtures' ground at 0), `SIM ON GROUND` false, every second; returns the end point) and `jammerAt(site: TransmitterSite): Record<string, string>` / `spooferAt(site: SpooferSite)` building the stored `failure_*` values.
- Test: `test/render/failures/GpsJamming.test.ts` (rewritten)

**Interfaces:**
- Consumes: Task 2 and Task 4.
- Produces: `GPS.transmitters: Transmitters`; `GPS.transmitterInputs: Readonly<TransmitterInputs>` (read by Task 8).

- [ ] **Step 1: Write the failing tests** (rewrite `GpsJamming.test.ts`; keep its helpers `satelliteRows`, `afterCalcTick`, `searchedRow`; `signals.fadeScale = 0` and `jitterScale = 0` where the SNR is compared):
  - `a jammer ahead at 200 NM: nothing at first, then the weakest satellites go first as the aircraft closes in` (jet at FL350, 450 kt, `firstLossNm` 150, line of sight; at 220 NM out no satellite lost; between 150 and 115 NM the first lost are the lowest SNRs; the last is lost between 20 and 40 NM; assert the order follows the SNRs, not a timer. The test may move the aircraft in steps of a few NM with a few calculation ticks at each, to keep the run short).
  - `RAIM NOT AVAILABLE emerges before the fix goes` (same flight; the RAIM loss lasts more than 10 s before `SATELLITE COVERAGE INADEQUATE FOR NAV`).
  - `a descent below the jammer's horizon brings the satellites back` (prop at 5,000 ft jammed; descend to 500 ft AGL beyond the 500 ft horizon: the fix returns; same site).
  - `banking toward the jammer loses satellites that level flight keeps` (set `PLANE BANK DEGREES` toward the site at a distance where level flight keeps a fix: more satellites lost).
  - `on the ground the jammer is close and takes the satellites within seconds` (activate `gpsJamming` through the FLR path or the `Failures` API on the ground: no fix within 10 s, STA 1 `ACQ`, rows `*xx 00`).
  - `an engine-running start inside a stored jammer's effect acquires nothing` (the old ramp test, ported: the stored site 5 NM away).
  - `the repair: the rise 0, no satellite lost, a fix again within 120 s`.
  - **Review Focus 4:** `an airport search that never resolves leaves the spoofer pending, sends nothing, and jamming works on` (replace the finder with one whose promise never resolves, both failures stored active: `transmitters.spoofer === null`, `spooferRatio === 0`, `jammerRatio > 0`, `unit.errors` empty after 60 s).
  - `with failures off, nothing changes` (no transmitter, `noiseRise` 0: the SNRs equal those of `GpsAcquisition.test.ts`'s snapshot).
- [ ] **Step 2: Run** `npx vitest run test/render/failures/GpsJamming.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring. Read `PLANE ALT ABOVE GROUND` in the take-home branch too only if needed (it is not: take-home has no transmitters).
- [ ] **Step 4: Run** `npx vitest run --project render` and `npx tsc --noEmit`. Expected: PASS, clean; `SatelliteReachability.test.ts` and `GpsAcquisition.test.ts` unchanged.
- [ ] **Step 5: Commit** `references #465 jamming by distance`.

---

### Task 7: The general time check and the recovery rules

**Files:**
- Modify: `kln90b/Gps.ts` (the time check in the valid branch of `tick`: when the new GPS time differs from the unit's previous time plus the tick by more than 10 minutes (B-4) post `SYSTEM TIME UPDATED` / `TO GPS TIME` and publish `timeUpdatedEvent`; `gpsAcquired` keeps its check; on the transition from a fix to none: if `|receiverTimeDifference(timeZulu, simTime)| > CLOCK_TOLERANCE` or the believed position (`coords`) is 100 NM or more from the true position, `search.start(coords)`; otherwise `search.lostFix(simTime)`), `kln90b/GpsSearch.ts` (export `CLOCK_TOLERANCE`; `lostFix(simTime: number): void` and `fixRegained(): void`; in `Idle`, `tick` starts `SkySearch` once `simTime − lostAt ≥ GIVE_UP_TIME` with no fix since; `start`/`end` clear `lostAt`; comment cites IM 2-66 and 3-17)
- Test: `test/render/Gps.test.ts` (time check), `test/unit/GpsSearch.test.ts` (lost-fix timer), `test/render/failures/GpsJamming.test.ts` (sky search after 5 minutes)

**Interfaces:**
- Produces: `GpsSearch.lostFix(simTime: number): void`, `GpsSearch.fixRegained(): void`, `export const CLOCK_TOLERANCE` from `GpsSearch.ts`; `GPS` calls `fixRegained` from `gpsAcquired`.

- [ ] **Step 1: Write the failing tests:**
  - `a sim time jump of an hour during a fix posts SYSTEM TIME UPDATED and publishes timeUpdatedEvent once` (`sim.absoluteTimeOffsetMs` +3,600,000).
  - `a normal tick and a jump of 9 minutes post nothing`.
  - `GpsSearch: five minutes after a lost fix in Idle it starts a sky search; a fix regained before cancels it; start() and end() clear it` (unit, with the fake computer of `GpsSearch.test.ts`).
  - `a total loss to a jammer for over 5 minutes: STA 1 shows INIT; after leaving the jammer the fix comes back with blind acquisition times` (render; a stored jammer 10 NM ahead at 10,000 ft takes every satellite; after 6 minutes STA 1 shows `INIT`; then `flyStraight` away beyond its edge and assert the fix returns later than `IDLE_ACQUISITION` would allow).
  - `a loss of the fix with a clock 3 hours off restarts the start model from the belief` (set `timeZulu` 3 h off through `gps.timeZulu.setTimestamp` during a fix, then block every satellite with `gpsAntenna` and repair: `search.mode` is `Acquisition`, then `SkySearch` after 5 min).
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run --project unit --project render` and `npx tsc --noEmit`. Expected: PASS; any existing test that changes only through the three decided exceptions is updated with a comment naming the exception, nothing else.
- [ ] **Step 5: Commit** `references #465 the general time check and the recovery after a lost fix`.

---

### Task 8: The fake receiver and the shared channels

**Files:**
- Create: `kln90b/failures/FakeReceiver.ts`
- Modify: `kln90b/Gps.ts` (own `public readonly fakeReceiver`, two new prediction contexts from `gpsSatComputer.createPredictionContext()`: the fake sky and the believed sky; tick it after `signals.tick` and before `search.tick`; the reachability predicate becomes `signals.isLost(prn) || fakeReceiver.claimsSdkPrn(prn)`; `transmitters.setFakeCount(fakeReceiver.fakeSkyCount)` each tick; `powerChanged` calls `fakeReceiver.reset()`), `kln90b/pages/left/Sta1Page.tsx` (rows from `gps.channelRows()`; `searchesLostSatellite` counts a searching fake channel too), `kln90b/Gps.ts` (`channelRows(): readonly ChannelRow[]`, reused array)
- Test: `test/unit/failures/FakeReceiver.test.ts`, `test/render/pages/Sta1Spoofing.test.ts`

**Interfaces:**
- Consumes: Task 2 (`fakeSnr`, `dbToRatio`), Task 4 (`SpooferSite`, `spooferRatio`, `jammerRatio`), `GpsSignal.ts` (`ACQUIRE_SNR`, `LOCK_LOSS_SNR`, `jitterSigmaDb`, `MASK_ZENITH_RAD`), `GpsSearch.ts` timing constants, the spike's mechanism (Task 1).
- Produces (in `kln90b/failures/FakeReceiver.ts`):
  - `export interface ChannelRow { prn: number; state: GPSSatelliteState; snr: number; zenithRad: number | null; fake: boolean }`
  - `export interface FakeReceiverInputs { simTimeMs: number; spoofer: Readonly<SpooferSite> | null; spooferRatio: number; jammerRatio: number; beliefLat: number; beliefLon: number; beliefTimeMs: number; searchAll: boolean; sdkChannels: readonly (GPSSatellite | null)[]; realSnr: (prn: number) => number; realLost: (prn: number) => boolean }` (one object, filled in place by `GPS`)
  - `export class FakeReceiver` — `constructor(fakeSky: GPSPredictionContext, believedSky: GPSPredictionContext, random: () => number)`; `tick(inputs: Readonly<FakeReceiverInputs>): void`; `reset(): void` (power change: every fake satellite lost, claims released, timers cleared; the fake ephemeris memory kept); `clear(): void` (spoofer gone or replaced: also the ephemeris memory); `claimsSdkPrn(prn: number): boolean`; `get fakeSkyCount(): number` (fake PRNs above the 5° mask at the false position); `get believesFalse(): boolean` (the unit's clock is nearer the false time than the true time); `isFakeInUse(prn: number): boolean`; `inUsePrns(): readonly number[]`; `fakeZenith(prn: number): number` / `fakeHourAngle(prn: number): number` (from the fake sky, every PRN); `snr(prn: number): number`; `fillRows(out: ChannelRow[], inputs: Readonly<FakeReceiverInputs>): void` (the 8 unit channels: a claimed channel shows its fake satellite, the others the SDK's).
  - Constants: `EPHEMERIS_DOWNLOAD_MS = 30_000` (the SDK's `ephemerisDownloadTime` in `Gps.ts`), `SKY_REPREDICT_MS = 5_000`.

**Rules** (the spec's "The fake signals" and "The fake receiver and the shared channels"):
- Fake sky: `fakeSky.setPosition(falseLat, falseLon, 0, simTimeMs + shiftMs).predict()` at most every 5 s (altitude 0 as `predictRaim` passes it; the directions barely change with it); the believed sky the same at `beliefLat`, `beliefLon`, `beliefTimeMs`.
- Fake SNR per PRN in the fake sky: `fakeSnr(spooferRatio / fakeSkyCount, fakeSkyCount, jammerRatio)` plus `jitterSigmaDb(snr) × normal()` per tick.
- Searchable fake PRNs: in the fake sky above the mask, and (`searchAll` or in the believed sky above the mask).
- A claim: for a searchable fake PRN Y with SNR ≥ `ACQUIRE_SNR` and (the real Y lost, or the real Y's SNR below the fake's), claim the SDK channel that holds Y if its satellite is not tracked or is lost; otherwise any channel whose SDK satellite is null, `Unreachable`, `None` or lost. Never a channel whose SDK satellite is tracked and not lost (a loop does not jump).
- Acquisition time at the claim: `HOT_ACQUISITION ± HOT_ACQUISITION_RANGE/2` when `believesFalse`, the belief is within 2 NM of the false position and Y's fake ephemeris was collected; `BLIND_ACQUISITION ± BLIND_ACQUISITION_RANGE/2` when `searchAll`; otherwise `IDLE_ACQUISITION ± WARM_ACQUISITION_RANGE/2`. Then in use after `EPHEMERIS_DOWNLOAD_MS` unless collected before (collected PRNs remembered until `clear`).
- Lock rule: a claimed fake satellite (searching or tracked) is released when its SNR falls below `LOCK_LOSS_SNR` while tracked, or stays searched below `ACQUIRE_SNR`; a release frees the channel at once.
- Spoofer null (repair, pending, replaced): `clear()` in the same tick.

- [ ] **Step 1: Write the failing tests** (`FakeReceiver.test.ts` with stub prediction contexts as `test/harness/predictionStub.ts` provides and fake SDK channels):
  - `the fake sky is predicted at the false position and the false time, at most every 5 s`.
  - `every fake satellite has the same SNR before the jitter, capped near 51.5 with eight`.
  - `with the belief true, only PRNs in both skies are searchable; with searchAll every fake PRN`.
  - `a channel tracking a real satellite that is not lost is never claimed`.
  - `a fake satellite stronger than the real one of its PRN claims that PRN's channel; the SDK satellite there reports lost` (`claimsSdkPrn`).
  - `acquisition times: idle under a true belief, blind with searchAll, hot after a power cycle while captured with the ephemeris collected`.
  - `in use 30 s after acquisition, at once if its ephemeris was collected from this spoofer`.
  - `lost below 30, released at once; reacquired only at 35`.
  - `never more than 8 channels in the rows; a claimed channel shows the fake PRN, its SNR and its fake-sky zenith once the belief is false`.
  - `clear() on a repair releases every claim in the same tick`.
  - Render (`Sta1Spoofing.test.ts`): `a captured unit's STA 1 shows the fake satellites with a flat SNR and their fake-sky elevations` and `in the mixed phase STA 1 lists real and fake satellites, at most 8`.
- [ ] **Step 2: Run** the two files. Expected: FAIL.
- [ ] **Step 3: Implement** the receiver, the wiring and STA 1. The fake satellites do not enter the solution yet (Task 9).
- [ ] **Step 4: Run** `npx vitest run --project unit --project render` and `npx tsc --noEmit`. Expected: PASS; the existing STA 1 tests unchanged.
- [ ] **Step 5: Commit** `references #465 the fake receiver and the shared channels`.

---

### Task 9: The mixed solution, the measurement and RAIM detection

**Files:**
- Create: `kln90b/failures/RangeErrors.ts`
- Modify: `kln90b/Gps.ts` (`updateSolution` merges the rows: SDK in-use satellites not lost and not claimed, then the fake receiver's in-use PRNs; per row a claim flag (`0` true state, `1` false state); the reference state = majority of the satellite rows, true on a tie; the lines of sight from the reference (true: the SDK satellite's position for the PRN; false: `fakeZenith`/`fakeHourAngle`); `computeGeometry` with a `SolutionMatrices`; after it `rangeErrors.update(...)`; `measure` passes the view; the valid branch's clock: reference false → `timeZulu` = sim time + `shiftMs` + clock m / c; the SDK's `internalTime` stays the true time, `GPS`'s own clock follows the reference; `syncLastKnownPosition` gets the true `lat/lon`, never `coords`; `public rangeErrorDetected(halNm: number): boolean` = `raimStatus(solution, hal) === Raim.Available && raimTestFails(rangeErrors.sseM2, solution.measurements)`), `kln90b/failures/FailingMeasurement.ts` (applies a `RangeErrorView` instead of the faulty satellite alone), `kln90b/failures/GpsFailures.ts` (drop `faultDetected` and `FAULT_DETECTION_BIAS_M`; keep `faultyPrn`, `faultyBiasM`), `kln90b/data/navdata/NavCalculator.ts:886`, `kln90b/services/ModeController.ts:459,622`, `kln90b/data/PersistentMessages.ts:593` (read `gps.rangeErrorDetected(hal)`)
- Test: `test/unit/failures/RangeErrors.test.ts`, `test/unit/failures/FailingMeasurement.test.ts` (adjust), `test/render/failures/FaultySatellite.test.ts` (adjust)

**Interfaces:**
- Consumes: Task 3 (`SolutionMatrices`, `solveErrors`, `raimTestFails`, `ALTITUDE_WEIGHT`), Task 2 (`rangeFromSinElevationM`, `METERS_PER_MS`), Task 8 (`FakeReceiver`), Task 4 (`SpooferSite`).
- Produces (in `kln90b/failures/RangeErrors.ts`):
  - `export interface RangeErrorView { readonly falseReference: boolean; readonly falseLat: number; readonly falseLon: number; readonly northM: number; readonly eastM: number; readonly velNorthMps: number; readonly velEastMps: number; readonly clockM: number; readonly sseM2: number }`
  - `export interface RangeErrorRows { readonly prns: readonly number[]; readonly falseClaim: Uint8Array; readonly altitudeRow: boolean; readonly falseReference: boolean }`
  - `export class RangeErrors implements RangeErrorView` — `update(rows: RangeErrorRows, m: SolutionMatrices, simTimeS: number, trueSinElevation: (prn: number) => number, falseSinElevation: (prn: number) => number, spoofer: Readonly<SpooferSite> | null, altitudeInputM: number | null, trueAltitudeM: number, faultyPrn: number | null, faultyBiasM: number): void`; `reset(): void`.

**Rules** (the spec's "The solution" and "RAIM detection"):
- Claimed range of row i: true state `rangeFromSinElevationM(trueSinElevation(prn))`; false state `rangeFromSinElevationM(falseSinElevation(prn)) + spoofer.clockM`. Reference range: the same for the reference state.
- Whole milliseconds `k_i` (Int32Array by PRN): set to `round((claimed − reference)/METERS_PER_MS)` when the PRN enters the rows or the reference flips; held otherwise. Error `e_i = claimed − reference − k_i·METERS_PER_MS`; rows claiming the reference get exactly 0.
- Faulty satellite: `+faultyBiasM` on its row when it claims the true state (as `FailingMeasurement` does today).
- Altitude row: reference true → 0 (as today); reference false → the altitude input minus `spoofer.falseAltFt` in meters, whitened by `ALTITUDE_WEIGHT`, signed as Task 3's test fixed.
- Velocity errors: `ė_i` = (`e_i` now − `e_i` at the last update) / dt, skipping rows whose `k_i` changed and dt outside (0, 60] s; `−H·ė` north/east.
- `FailingMeasurement.update`: reference true → the inner measurement plus north/east and the velocity error added to the inner velocity (from its ground speed and track); reference false → the false position plus north/east, velocity from the errors alone; ground speed and track from the velocity, track null below 2 kt as the inner does.

- [ ] **Step 1: Write the failing tests:**
  - `RangeErrors`: `rows that all claim one state give no error and no residual` (all true; all false: the view's position is exactly the false position); `one fake row among seven real rows moves the position by minus its coefficients times its error, within ±150 km of range at the moment it enters`; `the error drifts without a new wrap while the row stays`; `the whole milliseconds are resolved again when the reference flips`; `a 4-4 tie takes the true state`; `captured with an altitude input: the altitude row's error makes raimTestFails true; without one, false`; `the faulty satellite's bias enters its row`.
  - `FailingMeasurement`: the existing faulty-satellite cases through the view; `reference false: the false position and ground speed 0 with no error rows`.
  - `FaultySatellite.test.ts`: the detection now follows the residual test. The tests that pinned `FAULT_DETECTION_BIAS_M` assert instead that `RAIM POSITION ERROR` appears once the bias exceeds `SIGMA_UERE_M × sqrt(T / (1 − h_ii))` and not before, with `T` the literal chi-square value for the test's degrees of freedom (from a table in the test, not from `raimThreshold`) and `h_ii` computed in the test from the satellite directions.
- [ ] **Step 2: Run** those files. Expected: FAIL.
- [ ] **Step 3: Implement** `RangeErrors`, the row merge in `updateSolution` (its `changed` check also compares the claim flags), the view in `FailingMeasurement`, the clock and the readers.
- [ ] **Step 4: Run** `npx vitest run` (all stages) and `npx tsc --noEmit`. Expected: PASS; with failures off no other test changed.
- [ ] **Step 5: Commit** `references #465 the mixed solution and the residual RAIM test`.

---

### Task 10: Spoofing end to end

**Files:**
- Test: `test/render/failures/GpsSpoofing.test.ts`
- Modify: only what these flights find wrong in Tasks 4 to 9 (fix it in the owning file, with a test in that task's test file).

Stored spoofers come from `spooferAt(...)` (Task 6). For "many shared PRNs" use a 2 h shift and assert as a precondition that the believed and fake skies share at least 4 PRNs above the mask (shorten the stored shift if the fixture's sky does not; stored values may be outside the draw's range). For "few shared" use 12 h and assert fewer than 4 as a precondition.

- [ ] **Step 1: Write the tests:**
  - `flying into a spoofer: the real satellites drowned, a mixed phase with RAIM POSITION ERROR, then capture: the false position, ground speed 0, SYSTEM TIME UPDATED` (FL350 jet, NAV without an altitude input, many shared PRNs; assert the order of the phases by their first tick).
  - `with few shared PRNs: no fix until the sky search, then capture` (12 h shift; capture between 5 and 20 minutes after the drowning).
  - `captured with an altitude input: RAIM POSITION ERROR and STATE NAV A for as long as it is captured`.
  - `flying out: the fake satellites lost, the true position back, SYSTEM TIME UPDATED again`.
  - `a new spoofer ahead after leaving`.
  - `jamming and spoofing together: captured far from the jammer, no fix near it`.
  - **Review Focus 2:** `a power cycle while captured: the fake satellites come back with hot times and the false position, no POSITION DIFFERS message` and `a hot swap disable and resume while in the mixed phase changes nothing while disabled and throws nothing`.
  - **Review Focus 3:** `a repair in the mixed phase removes the fake rows, the claims and RAIM POSITION ERROR in the same tick; STA 1 shows no fake satellite at the next display tick`.
  - **Review Focus 5:** `with both failures active, repairing the spoofer leaves the jammer's site, its stored values and its effect unchanged`, and the converse.
  - `a session started inside a stored spoofer's range keeps it; one started beyond its edge gets a new one`.
  - `the SDK's last known position stays the true one while captured`.
  - `take-home mode: a stored spoofer does nothing`.
- [ ] **Step 2: Run** `npx vitest run test/render/failures/GpsSpoofing.test.ts`. Expected: PASS after any fixes, each fix with its own test in the owning task's test file.
- [ ] **Step 3: Tick-cost benchmark (throwaway, not committed):** in Node, time `GPS.tick` with a captured unit, both transmitters and 8 rows over 1,000 ticks; report the worst tick. Expected: worst × 10 well under 33 ms (CLAUDE.md). Report the numbers in the task report; delete the benchmark.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`. Expected: PASS, clean.
- [ ] **Step 5: Commit** `references #465 spoofing flights`.

---

### Task 11: Documentation

**Files:**
- Modify: `docs/failures.md` (rewrite "GPS jamming (`gpsJamming`)" and "GPS spoofing (`gpsSpoofing`)" from the spec; the catalog row for `gpsSpoofing` without "not built yet"; the status paragraph; "Persistence" (the new values, no ramp); remove item 2 of "What the code needs first"; "Testing"; "Faulty satellite": detection by the residual test), `docs/architecture.md` (the GPS section: transmitters, the fake receiver, the mixed solution, the recovery rules), `CLAUDE.md` (the GPS bullet: replace "spoofing is #465" with one sentence on the transmitters and the fake receiver)

- [ ] **Step 1: Write the doc changes.** No counts of things that grow; cite page numbers, never manual text; American English.
- [ ] **Step 2: Check** that every name the docs mention exists (`grep` each identifier in `kln90b/`).
- [ ] **Step 3: Commit** `references #465 documentation`.

---

### Task 12: Verify and squash into the fix commit

- [ ] **Step 1: Run everything:** `npx tsc --noEmit` (clean), `npm test` (all green), `npm run build` (succeeds; no new circular-dependency warning compared with master: `npm run build 2>&1 | grep -c "Circular"` on both).
- [ ] **Step 2: Squash** the implementation commits of Tasks 2 to 11 into one: `git reset --soft <the plan commit>` then commit with:

```
fixes #465 GPS jamming and spoofing from simulated transmitters: path loss, horizon and antenna gain decide the jamming, a fake sky captures the receiver through a mixed solution with residual RAIM

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 3: Confirm** `git log --oneline master..` shows the design, the plan and the one `fixes #465` commit, and `git status` is clean.
