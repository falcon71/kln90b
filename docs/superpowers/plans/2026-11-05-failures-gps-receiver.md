# Failures: GPS receiver, jamming and faulty satellite (#460) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The failures `gpsAntenna`, `gpsReceiver`, `gpsJamming` and `faultySatellite` of #460, on the #458 framework,
with the receiver model of #453 and the SNR curve of #464.

**Architecture:** A new `GpsFailures` class beside the receiver owns everything the receiver failures do: which
satellites they block, the jamming level, the drawn values and the faulty satellite's bias and detection. `GpsSearch`
merges its blocks into its own inhibits; `GPS` leaves blocked satellites out of its solution; a measurement decorator
adds the faulty satellite's position error over whichever strategy runs. STA 1, the messages, `NavCalculator` and
`ModeController` read flags from `gps.failures`.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (unit, render,
flight).

**Spec:** [docs/superpowers/specs/2026-11-05-failures-gps-receiver-design.md](../specs/2026-11-05-failures-gps-receiver-design.md)
(the design, approved 2026-11-05) and [docs/failures.md](../../failures.md) (the behavior). Read both before a task;
the design wins where they differ.

## Global Constraints

- `target: es2017`; no runtime feature newer than that.
- No new circular dependency: the count of "Circular dependencies" warnings of `npm run build` must not grow.
- Public contract unchanged (CLAUDE.md): no LVar, H event or panel.xml key renamed or changed in meaning; persisted data
  only under the new keys `failure_gpsAntenna`, `failure_gpsReceiver`, `failure_gpsJamming`, `failure_faultySatellite`.
- With nothing failed, every existing test stays green and the unit behaves exactly as today. The only expected test
  updates are snapshots that list the catalog (FLR 3) gaining the four new names; any other existing test that changes
  means a behavior change: stop and report it.
- Calculation-tick work allocates nothing in the hot path: no JSON parsing, no arrays built per tick. Parse a failure's
  values once and cache them; settings writes at most every 10 s of sim time.
- No new reach into private SDK state; the inhibits are public SDK API (`setSatelliteInhibit`).
- Take-home mode: the receiver failures have no effect in it.
- Comments cite manual pages (Pilot's Guide `5-29`, Installation Manual `C-7`); never copy manual text. American
  English. No counts in prose for things that grow.
- Commits: work-in-progress commits per task on the branch `gps-failures`, so reviewers verify committed code. Task 7
  squashes them into the single `fixes #460 …` commit on top of `bf8afb58` (the `fixes #464` commit, which stays its
  own commit). Never push.
- Commands: `npx tsc --noEmit` (clean), `npm test` (all stages), `npx vitest run <path>` (one file).
- Values (all guesses from the design; use these exact numbers as named constants):
  - jamming `rampS` 180 to 360, `finalDb` 24 to 28, wander sigma 3 dB with a correlation time of 10 s;
  - lock: lost below SNR 30 (`MIN_SNR` of `GpsSignal.ts`), acquired at 35 or more;
  - faulty satellite `biasM` 500 to 3000, `rampS` 120 to 300, detected from `RAIM_K × SIGMA_UERE_M`, another satellite
    after 120 s out of the solution with a fix;
  - ramp progress saved at most every 10 s of progress and once at the ramp's end;
  - the elevation mask 5°.

## Review Focus

1. Both receiver failures active, one repaired: the unit stays `FAILR` with every satellite blocked. Test in Task 2.
2. A stored failure text that is `"{}"` or not JSON at all (an older session, a hand-edited profile): the values are
   drawn in the tick, nothing throws. Test in Task 1 (`values`) and Task 2 (the draw in the tick).
3. The sim clock set back or hours ahead during a jamming ramp: the jump counts nothing, nothing throws, the ramp goes on
   from where it was. Test in Task 2.
4. An engine-running start (a forced acquisition) with `gpsAntenna` stored by an earlier session: no satellite is
   acquired, STA 1 shows `FAILR`. Test in Task 4.
5. The faulty satellite blocked by jamming at the same time: it is not in the solution, so it adds no error and is not
   detected. Test in Task 3.

---

### Task 1: The catalog entries and the failure values

**Files:**
- Modify: `kln90b/failures/FailureCatalog.ts` (the `FailureKey` union, four entries)
- Modify: `kln90b/failures/Failures.ts` (`values`, `setValues`)
- Test: `test/unit/failures/Failures.test.ts`, `test/unit/failures/FailureCatalog.test.ts`

**Interfaces:**
- Produces:
  - `FailureKey` gains `'gpsAntenna' | 'gpsReceiver' | 'gpsJamming' | 'faultySatellite'`.
  - Entries (no ports, always eligible): `gpsAntenna` `GPS ANTENNA` random, testFail, message
    `['RCVR HARDWARE ERROR:', '0010']`, detection `'internal'`; `gpsReceiver` `GPS RCVR` random, testFail,
    `['NO RCVR DATA']`, `'internal'`; `gpsJamming` `JAMMING` and `faultySatellite` `SATELLITE`: not random, no testFail,
    message `null`, detection `null`.
  - `Failures.values(key: FailureKey): Record<string, number>`: the parsed stored object; `{}` when inactive, when the
    text does not parse, or when it parses to something that is not a plain object.
  - `Failures.setValues(key: FailureKey, values: Record<string, number>): void`: writes `JSON.stringify(values)` only
    while the failure is active; publishes nothing.

- [ ] **Step 1: Write the failing tests** in `Failures.test.ts`: `values` of an inactive failure is `{}`; after
  `fail('gpsJamming')` it is `{}`; after `setValues('gpsJamming', {rampS: 240, finalDb: 26, elapsedS: 0})` the setting
  text is `'{"rampS":240,"finalDb":26,"elapsedS":0}'` and `values` returns that object; `setValues` on an inactive
  failure leaves the setting `''`; a stored text `'garbage'` and a stored text `'[1]'` give `{}`; `setValues` publishes
  no `failureChanged`. In `FailureCatalog.test.ts`: the four entries with the fields above (literals), and
  `randomCandidates()` includes `gpsAntenna`/`gpsReceiver` and excludes `gpsJamming`/`faultySatellite`.
- [ ] **Step 2: Run** `npx vitest run test/unit/failures` and confirm the new tests fail.
- [ ] **Step 3: Implement** the union, the entries and the two methods.
- [ ] **Step 4: Run** `npx vitest run test/unit/failures` and `npx tsc --noEmit`; all pass. Then `npm test`: any
  render test that lists FLR 3 or the catalog by snapshot changes only by the four new names; update those snapshots
  and nothing else.
- [ ] **Step 5: Commit** `git add -A && git commit -m "wip #460 catalog entries and failure values"`.

### Task 2: `GpsFailures`: the blocks of the receiver failures and jamming

**Files:**
- Create: `kln90b/failures/GpsFailures.ts`
- Test: `test/unit/failures/GpsFailures.test.ts`

**Interfaces:**
- Consumes: `Failures.values`/`setValues`/`isEffective` (Task 1), `satelliteSnr`, `MIN_SNR` (`kln90b/GpsSignal.ts`),
  `MAX_TRIGGER_STEP_S` (`FailureTrigger.ts`), `FailureChangedEvents` (`Failures.ts`).
- Produces:
  - `interface ReceiverView { satellites(): readonly GPSSatellite[]; solutionPrns(): readonly number[]; readonly solution: GpsGeometry; isValid(): boolean; }`
    (`solutionPrns` is the unit's solution in row order, blocked satellites already left out).
  - `class GpsFailures`:
    - `constructor(bus: EventBus, failures: Failures, receiver: ReceiverView, takeHomeMode: boolean, random: () => number = Math.random)`
    - `public random: () => number`
    - `tick(simTimeS: number): void`
    - `reset(): void`: the runtime state (wander, blocked set, time reference, save counter, the faulty satellite's
      out-of-solution time) back to its start; called at every power change.
    - `isBlocked(prn: number): boolean`
    - `get receiverFailed(): boolean`: `gpsAntenna` or `gpsReceiver` effective, false in take-home mode.
    - `get jamming(): boolean`: `gpsJamming` effective, false in take-home mode.
    - `get jammingDb(): number`: the present level, 0 without jamming.
    - `jammedRows(): number[]`: the PRNs blocked by jamming whose zenith is below 85° (5° mask), for STA 1.
    - `public wanderSigmaDb: number = JAMMING_WANDER_SIGMA_DB`: tests set it to 0 to pin the wander.
  - Exported constants `LOCK_LOSS_SNR = MIN_SNR` (30), `ACQUIRE_SNR = 35`, `JAMMING_WANDER_SIGMA_DB = 3`,
    `JAMMING_WANDER_TAU_S = 10`, `RAMP_SAVE_INTERVAL_S = 10`.

The rules, from the design ("Jamming", "The drawn values", "The receiver failures"):
- While `receiverFailed`, `isBlocked` is true for every PRN.
- Jamming level: `finalDb × min(1, elapsedS / rampS) + w`, at least 0. `w` is a Gauss-Markov process
  (`w = a·w + sigma·sqrt(1 - a²)·n`, `a = exp(-dt / tau)`, `n` standard normal from `random`, as `GpsErrorModel`).
- `dt` and the ramp's `elapsedS` follow `FailureTrigger`'s rule: the first tick after construction or `reset`, a step
  back and a step above `MAX_TRIGGER_STEP_S` count 0.
- Per satellite, with `snr = satelliteSnr(zenith) - jammingDb`: tracked (state `Acquired`, `DataCollected`, `InUse`,
  `InUseDiffApplied`) and not blocked → blocked when `snr < 30`; not tracked → blocked while `snr < 35`; blocked →
  unblocked when `snr >= 35`. The blocked set is a `Uint8Array(256)` by PRN.
- Draw on `failureChanged` active for `gpsJamming` (and in `tick` when the cached values lack `rampS`): `rampS`
  uniform 180..360, `finalDb` uniform 24..28, `elapsedS` 0, written with `setValues`. On `failureChanged` inactive: the
  cache is dropped and the jamming blocks are cleared at once.
- `elapsedS` is written when it has grown by 10 s since the last write, and once when it reaches `rampS`.

- [ ] **Step 1: Write the failing tests** in `GpsFailures.test.ts`. Build `Failures` as `Failures.test.ts` does; a
  fake `ReceiverView` with satellites shaped `{prn, position: {get: () => Float64Array.of(zenithRad, 0)}, state: {get: () => state}}`
  cast to `GPSSatellite`; `random` injected. Tests (literal expectations):
  - nothing failed: `isBlocked` false for every PRN, `jammingDb` 0, `receiverFailed` false, `jammedRows()` `[]`;
  - `gpsAntenna` failed: every PRN blocked; `gpsReceiver` failed too, then `gpsAntenna` repaired: still every PRN
    blocked (Review Focus 1); both repaired: none;
  - take-home mode with `gpsAntenna` failed: `receiverFailed` false, nothing blocked;
  - `fail('gpsJamming')` with `random = () => 0.5` stores `rampS` 270, `finalDb` 26, `elapsedS` 0;
  - with stored `{rampS: 200, finalDb: 26, elapsedS: 0}` and `wanderSigmaDb = 0`, ticking 1 s steps for 100 s gives
    `jammingDb` 13 (26 × 100 / 200); a satellite at 10° elevation (SNR 40.88), tracked, is blocked
    once the level exceeds 10.88 and stays blocked until the level falls back to 5.88 or less;
  - an untracked satellite at 30° (SNR 46.39) is blocked while the level is above 11.39;
  - `elapsedS` written at 10, 20, … and not in between; after reaching `rampS` written once with `elapsedS = rampS`
    and never again;
  - a step back of the clock, a jump of 2 hours and the first tick after `reset()` add nothing to `elapsedS`
    (Review Focus 3);
  - a stored `'{}'` and a stored `'garbage'` for `gpsJamming` are drawn in the first tick, no throw (Review Focus 2);
  - the wander with a real random source over 10 000 ticks stays within ±15 dB and has a standard deviation between 2
    and 4 dB;
  - repair during jamming: `jammingDb` 0 and nothing blocked right after the `failureChanged`, before any tick;
  - `jammedRows()` lists the blocked satellites above 5° and not one at 3°.
- [ ] **Step 2: Run** `npx vitest run test/unit/failures/GpsFailures.test.ts`; it fails (no module).
- [ ] **Step 3: Implement** `GpsFailures` with the interfaces above. Parse values once into a cache; nothing allocates
  in `tick`.
- [ ] **Step 4: Run** the file and `npx tsc --noEmit`; pass.
- [ ] **Step 5: Commit** `git add -A && git commit -m "wip #460 GpsFailures: receiver failures and jamming"`.

### Task 3: The faulty satellite and the measurement decorator

**Files:**
- Modify: `kln90b/failures/GpsFailures.ts`
- Create: `kln90b/failures/FailingMeasurement.ts`
- Modify: `kln90b/GpsMeasurement.ts` (export `EARTH_RADIUS_M`)
- Test: `test/unit/failures/GpsFailures.test.ts`, `test/unit/failures/FailingMeasurement.test.ts`

**Interfaces:**
- Consumes: `ReceiverView` (Task 2), `raimStatus`, `Raim`, `RAIM_K`, `SIGMA_UERE_M` (`GpsSolution.ts`),
  `GpsMeasurement`, `MeasurementInputs` (`GpsMeasurement.ts`).
- Produces:
  - `GpsFailures.faultyPrn: number | null` (null without the failure or before the draw)
  - `GpsFailures.faultyBiasM: number` (`biasM × min(1, elapsedS / rampS)`, 0 without the failure)
  - `GpsFailures.faultDetected(halNm: number): boolean`
  - `class FailingMeasurement implements GpsMeasurement { constructor(inner: GpsMeasurement, failures: GpsFailures) }`
  - constants `FAULT_SWITCH_S = 120`, `FAULT_DETECTION_BIAS_M = RAIM_K * SIGMA_UERE_M`.

The rules (design, "The faulty satellite"):
- The draw (on `failureChanged` active, or in `tick` when values lack `prn`): the PRN of the solution with the smallest
  zenith; without a solution, the satellite with the smallest zenith below 85°; with no satellite at all, no draw yet.
  `biasM` uniform 500..3000, `rampS` uniform 120..300, `elapsedS` 0. The ramp's `elapsedS` counts and saves like
  jamming's.
- Out of the solution: while `receiver.isValid()` and the PRN is not in `solutionPrns()`, count sim time (trigger rule,
  runtime only); at 120 s draw a new satellite, bias and ramp. Back in the solution, or no fix: the count stops
  (without a fix it does not count; back in the solution it restarts at 0).
- `faultDetected(halNm)`: the failure effective, the PRN in `solutionPrns()`, `faultyBiasM >= RAIM_K × SIGMA_UERE_M`,
  and `raimStatus(receiver.solution, halNm) === Raim.Available`.
- `FailingMeasurement.update(simTimeS, lat, lon, inputs)`: calls `inner.update` with the same arguments; its outputs
  are the inner ones, except when `faultyPrn` is row `i` of `inputs.prns`: then
  `lat += (-inputs.coefficients[2i] × bias) / EARTH_RADIUS_M` in degrees and
  `lon += (-inputs.coefficients[2i+1] × bias) / (EARTH_RADIUS_M × cos(lat))` in degrees (with the `MIN_COS_LAT` floor
  of `GpsMeasurement.ts`). Ground speed and track are the inner ones. `restart` passes through.

- [ ] **Step 1: Write the failing tests.** In `GpsFailures.test.ts`: the PRN pick (the highest in the solution; the
  highest above 5° without a solution; no draw without satellites, then drawn once they exist); the draw's values with
  `random = () => 0.5` (`biasM` 1750, `rampS` 210); `faultyBiasM` after 105 s of 1 s ticks is 875; out of the solution
  for 119 s with a fix keeps the PRN, 120 s switches to another and redraws; 300 s out of the solution without a fix
  does not switch; 60 s out, 1 s back in, 60 s out does not switch; `faultDetected(2)`: false below 26.5 m of bias,
  true above it with five or more measurements in a good geometry, false with RAIM `TooFewMeasurements` (a fake solution
  with `measurements: 4`), false when the PRN is not in `solutionPrns()` (Review Focus 5). In
  `FailingMeasurement.test.ts` (an `ExactMeasurement`-like fake inner): without the failure the outputs equal the
  inner's exactly; with the faulty PRN in row 1 and coefficients north 0.8, east 0 for that row and a bias of 1000 m,
  the latitude is lower by `800 / 6378100` rad in degrees (a satellite due north moves the position south); the ground
  speed and the track unchanged; the PRN not in `inputs.prns` adds nothing (Review Focus 5).
- [ ] **Step 2: Run** both files; they fail.
- [ ] **Step 3: Implement** the faulty-satellite part of `GpsFailures` and `FailingMeasurement`.
- [ ] **Step 4: Run** both files and `npx tsc --noEmit`; pass.
- [ ] **Step 5: Commit** `git add -A && git commit -m "wip #460 faulty satellite and FailingMeasurement"`.

### Task 4: Wiring into the receiver: the inhibits, the solution, the receiver failures' messages

**Files:**
- Modify: `kln90b/Gps.ts` (`GPS` constructor and `tick`, `updateSolution`, `powerChanged`;
  `KLNGPSSatComputer.acquireAndUseSatellites`)
- Modify: `kln90b/GpsSearch.ts` (the merged inhibits)
- Modify: `kln90b/Sensors.ts` (`Sensors`, `SensorsIn` pass `Failures` to `GPS`)
- Modify: `kln90b/KLN90BCore.ts:298` (pass `failures` to `Sensors`)
- Modify: `kln90b/data/PersistentMessages.ts` (suppress the #453 messages while `receiverFailed`)
- Test: `test/render/failures/GpsReceiverFailures.test.ts`

**Interfaces:**
- Consumes: `GpsFailures`, `FailingMeasurement` (Tasks 2, 3).
- Produces:
  - `GPS` constructor gains a last parameter `failures: Failures`; `GPS.failures: GpsFailures` (public readonly).
  - `Sensors` constructor gains `failures: Failures` after `gpsMeasurement` (before the defaulted `dbar`);
    `SensorsIn` likewise after `gpsMeasurement`.
  - `GpsSearch` constructor gains a third parameter `blocked: (prn: number) => boolean`;
    `GpsSearch.applyInhibits(): void` (public): a satellite is inhibited when the search's stored choice does not allow
    it or `blocked(prn)`; `inhibitAllExcept` stores the choice and calls it; `end()` clears the choice and applies.

Wiring (design, "`GpsFailures`", "The inhibits", "Blocked satellites leave the unit's solution at once"):
- `GPS` builds `GpsFailures(bus, failures, view, takeHomeMode)` with an adapter `ReceiverView` over itself
  (`gpsSatComputer.getSatellites()`, its `solutionPrns`, `solution`, `isValid()`), and wraps the given measurement in
  `FailingMeasurement`.
- `GPS.tick` outside take-home: `failures.tick(simTime)` → `search.tick(...)` → `search.applyInhibits()` →
  `gpsSatComputer.onUpdate()` → `updateSolution()` → the rest as today.
- `updateSolution` skips a satellite with `failures.isBlocked(prn)`, like the satellites without finite angles.
- `powerChanged` calls `failures.reset()` on both edges.
- `acquireAndUseSatellites`: `search.end()`, then `search.applyInhibits()`, then `super.acquireAndUseSatellites()`.
  Check in the SDK source (`E:\msfs\msfs-avionics-mirror\src\sdk\instruments\GPSSat.ts`) that its forced acquisition
  skips inhibited satellites; if not, say so in the report and re-apply after it.
- Check whether `setSatelliteInhibit` notifies when nothing changes; if it does, `applyInhibits` toggles only changes.
- `SatelliteCoverageMessage`, `RaimNotAvailableMessage`, `BadGeometryMessage`, `BadGeometryApproachMessage`: not valid
  while `gps.failures.receiverFailed` (their `SustainedCondition`s see "not holding").

- [ ] **Step 1: Write the failing render tests** in `GpsReceiverFailures.test.ts` (patterns: `PersistentMessages.test.ts`
  "signal loss and RAIM messages", `SuperflagFailure.test.ts` for stored failures):
  - in flight with a fix, `props.failures.fail('gpsAntenna')`: `gps.isValid()` false after the next calculation tick;
    `RCVR HARDWARE ERROR: 0010` on the MSG list after detection; no `SATELLITE COVERAGE INADEQUATE FOR NAV`, no `RAIM
    NOT AVAILABLE` for 60 s; every PRN in `gpsSatComputer.inhibitedSatellitePrnCodes`; repaired: the inhibits lifted
    and `gps.isValid()` true again within 120 s;
  - the same for `gpsReceiver` with `NO RCVR DATA`;
  - `failure_gpsAntenna: '{}'` stored, an engine-running boot (`bootUnit()`): `gps.isValid()` false, no satellite in
    use (Review Focus 4);
  - stored `gpsAntenna`, a power cycle: every PRN still inhibited after the power-on and after the start model's
    acquisition begins;
  - the Self Test page shows `TEST FAIL` with `gpsAntenna` stored (pattern of #458's TEST FAIL test);
  - FLR 3 lists `GPS ANTENNA`, `GPS RCVR`, `JAMMING`, `SATELLITE`;
  - with nothing failed, `gpsSatComputer.inhibitedSatellitePrnCodes` after an engine-running boot is empty, as today.
- [ ] **Step 2: Run** the file; it fails.
- [ ] **Step 3: Implement** the wiring above.
- [ ] **Step 4: Run** the file, `npx tsc --noEmit`, then `npm test`. Every existing test stays green unchanged.
- [ ] **Step 5: Commit** `git add -A && git commit -m "wip #460 wire GpsFailures into the receiver"`.

### Task 5: STA 1 and jamming over time

**Files:**
- Modify: `kln90b/pages/left/Sta1Page.tsx`
- Test: `test/render/failures/GpsJamming.test.ts`

**Interfaces:**
- Consumes: `GPS.failures` (`receiverFailed`, `jamming`, `jammingDb`, `isBlocked`, `jammedRows()`).

STA 1 (design, "STA 1 and STA 2"):
- `stateText`: `FAILR` first while `receiverFailed`; then as today, except that without a fix, outside TRAN and with
  the start model idle, `ACQ` while `jamming`.
- `getRows`: `[]` while `receiverFailed`. Otherwise as today; while `jamming`, a channel satellite that `isBlocked`
  becomes a row in state `None` (drawn `*xx 00`), and the PRNs of `jammedRows()` not already in a channel are added
  in state `None` with their elevation; sorted by PRN; at most 8 (channel satellites first, then the added ones by
  highest elevation). An in-use satellite's SNR is `satelliteSnr(zenith) - jammingDb`.

- [ ] **Step 1: Write the failing render tests** in `GpsJamming.test.ts`, on an engine-running boot in flight with
  `failure_gpsJamming` stored as `{rampS: 240, finalDb: 26, elapsedS: 0}` (the seeded `Math.random` makes the wander
  repeatable):
  - STA 1 after 60 s: every in-use row's SNR is lower than its unjammed value (read the unjammed rows first) by the
    same amount ±1;
  - the first satellite lost is one of the two lowest (10° in the harness sky); its row stays as `*xx 00 ele`;
  - stepping 1 s at a time, record `gps.isValid()` and `raimStatus(gps.solution, halForMode(navmode))`: a tick exists
    where the fix is valid and RAIM is not `Available`, before the first tick where the fix is lost; then `SATELLITE
    COVERAGE INADEQUATE FOR NAV` and the NAV flag;
  - after the ramp: STA 1 state `  ACQ` and every row `*xx 00`;
  - a power cycle at 120 s of ramp: after the power-on the stored `elapsedS` is at least 110 and the level continues
    from there (not from 0);
  - repaired: `jammingDb` 0, the inhibits lifted, a fix again within 120 s, STA 1 rows with unjammed SNRs;
  - STA 1 with `gpsAntenna`: `STATE FAILR` and no satellite rows on either page.
- [ ] **Step 2: Run** the file; it fails.
- [ ] **Step 3: Implement** the STA 1 changes.
- [ ] **Step 4: Run** the file, `test/render/pages/left/Sta1Page.test.ts`, `test/render/GpsAcquisition.test.ts`, then
  `npm test`; all green, the existing STA 1 tests unchanged.
- [ ] **Step 5: Commit** `git add -A && git commit -m "wip #460 STA 1 and jamming"`.

### Task 6: The faulty satellite's message and the loss of RAIM

**Files:**
- Modify: `kln90b/data/PersistentMessages.ts` (`RaimPositionErrorMessage`, replace the "Not built yet" note)
- Modify: `kln90b/data/navdata/NavCalculator.ts:~882` (the integrity fail)
- Modify: `kln90b/services/ModeController.ts` (`updateIntegrityFlag`, `checkApproachIntegrity`)
- Test: `test/render/failures/FaultySatellite.test.ts`

**Interfaces:**
- Consumes: `GPS.failures.faultDetected(halNm)`, `faultyPrn`, `faultyBiasM` (Task 3); `halForMode`.

Rules (design, "The faulty satellite"):
- `RaimPositionErrorMessage`: lines `['RAIM POSITION ERROR', 'CROSS CHECK POSITION']`; valid while `gps.isValid()` and
  `gps.failures.faultDetected(halForMode(navState.navmode))`; no delay. Add it to `buildPersistentMessages` after the
  RAIM messages.
- `NavCalculator`: `integrityFail` is also true while `faultDetected(halForMode(nav.navmode))`.
- `updateIntegrityFlag`: the flag is also set while `faultDetected(halForMode(NavMode.APR_LEG))`, at once; keep the
  `aprRaimLoss.update` call on every tick it runs today.
- `checkApproachIntegrity`: `available` is false while `faultDetected(halForMode(NavMode.APR_LEG))`.

- [ ] **Step 1: Write the failing render tests** in `FaultySatellite.test.ts` (patterns: `ModeController.test.ts`
  for ARM/APR with `approachWorld`, `PersistentMessages.test.ts` for messages):
  - en route with a fix, `fail('faultySatellite')`: `faultyPrn` is the highest satellite in use; after 300 s (the ramp
    complete, `faultyBiasM` at least 500) the offset of `gps.coords` from the sim position (the harness navigates on
    `ExactMeasurement`) equals `-coefficient × faultyBiasM` of the faulty row, north and east, within 5 m, and is not 0; `RAIM POSITION ERROR CROSS CHECK
    POSITION` on the MSG list; `L:KLN90B_IntegrityWarn` true; the NAV flag not set;
  - with RAIM unavailable (`inhibitAllBut(unit, 4)` without an altitude input, `NO_ALTIMETER`): the faulty satellite
    among the four, the position error present, no `RAIM POSITION ERROR`;
  - in ARM before the FAF: ACTV refused, `RAIM NOT AVAILABLE APR MODE INHIBITED`;
  - in APR: the navigation flagged at once and `PRESS GPS APR FOR NAV`;
  - repaired: the message gone, `L:KLN90B_IntegrityWarn` false, the position back to the sim position;
  - nothing failed: `L:KLN90B_IntegrityWarn` false en route, as today.
- [ ] **Step 2: Run** the file; it fails.
- [ ] **Step 3: Implement** the four changes.
- [ ] **Step 4: Run** the file, `test/render/services/ModeController.test.ts`, `test/render/data/PersistentMessages.test.ts`,
  then `npm test`; all green.
- [ ] **Step 5: Commit** `git add -A && git commit -m "wip #460 faulty satellite message and integrity"`.

### Task 7: Docs, full verification and the single commit

**Files:**
- Modify: `docs/failures.md`, `docs/architecture.md` (Core 3), `CLAUDE.md` (the GPS paragraph)
- Add: `docs/superpowers/specs/2026-11-05-failures-gps-receiver-design.md`, this plan

- [ ] **Step 1: Docs** as the design's "Docs" section lists: `failures.md` (status; jamming rewritten to the ramp, the
  SNR loss and STA 1; the faulty satellite's move to another satellite; the receiver failures' STA 1; a pointer from
  spoofing to #465; items 2 and 3 of "What the code needs first" removed; the jamming line of "Left to the
  implementation" removed); `architecture.md` Core 3 (`GpsFailures`, the inhibit ownership, `FailingMeasurement`);
  `CLAUDE.md` ("Satellite failures (#366) are not modeled" replaced by one line on `GpsFailures`). No counts for things
  that grow.
- [ ] **Step 2: Verify** `npx tsc --noEmit` clean, `npm test` all green, `npm run build` with no new circular
  dependency warning (compare the count with `master`).
- [ ] **Step 3: Squash** the work-in-progress commits: `git reset --soft bf8afb58 && git commit` with the message
  `fixes #460 failures: the GPS antenna and receiver, jamming and the faulty satellite`, a body of a few sentences
  (what each failure does; spoofing moved to #465), and the `Co-Authored-By` line. Confirm `git log --oneline -3` shows
  the #460 commit on top of `bf8afb58` and `git status` is clean.
