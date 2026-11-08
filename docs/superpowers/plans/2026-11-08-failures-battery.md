# Failures: the Internal Battery and the Loss of User Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The battery of the unit's nonvolatile memory ages over sim time, warns, and once failed wipes the user memory and the receiver's memory at every power-on, leaving a 1988 clock whose era survives sessions until `SERVICE?` or SET 2 corrects it (#461).

**Architecture:** A stateless `Battery` service over two new failure settings ages the battery at each session start. At a power-on with the battery failed, `PowerSupply` publishes `userMemoryLost` on the bus before it counts the power cycle and before `powerEvent`; every holder of user memory clears itself in that handler, and `powerEvent` carries `memoryLost` so that power-on handlers (also late subscribers, through the bus cache) know. The unit's clock is persisted as an offset from sim time in the battery-backed settings.

**Tech Stack:** TypeScript (target es2017), `@microsoft/msfs-sdk` (`DefaultUserSettingManager`, `GPSSatComputer.eraseAlamanac`/`eraseCachedEphemeris`), Vitest (unit, render, flight stages).

**Spec:** [docs/superpowers/specs/2026-11-08-failures-battery-design.md](../specs/2026-11-08-failures-battery-design.md), and the section Battery of [docs/failures.md](../../failures.md). Read the design in full before any task; this plan cites its section names and does not repeat its reasons.

## Global Constraints

- `target: es2017`; no newer runtime features. No new circular dependencies (`npm run build 2>&1 | grep -c "Circular"` must not grow against master).
- Public contract (CLAUDE.md): only new persisted keys, with defaults: `batteryHealth` (100) and `batteryDate` (0) in `KLN90BFailureSettings`, `clockOffset` (0) in `KLN90BUserSettings`. No existing key changes meaning. `userDataFormat` and `fastGpsAcquisition` are never wiped.
- **Nothing is wiped while the unit is on.** The only place that wipes is the power-on path of `PowerSupply.refreshPowerState`.
- A unit with empty storage is no wiped unit: battery 100 %, clock from the sim date (current era).
- The default clock after a wipe: **1 JAN 1988 00:00:00 UTC** (`Date.UTC(1988, 0, 1)`).
- The thresholds and rates: `BATTERY LOW` at `health <= 1.5` or failed; the aging rate uniform in [20, 100/3] % per year of 365.25 days; FLR 1 shows `Math.ceil(health)` right-aligned in 3 characters.
- Message lines exactly: `BATTERY LOW: SERVICE` / `REQUIRED TO PREVENT` / `LOSS OF USER DATA`; `USER DATA LOST`; `RCVR HARDWARE ERROR:` / `0008`.
- Manual references stay in comments where the behavior is implemented (`B-2`, `B-3`, `B-4`, `5-31`, `IM C-3`, `CMM 22`, `3-5`, `3-17`); never copy manual text. American English. No counts in prose for things that grow.
- DOM changes only in display ticks. The wipe allocates freely (it runs once per power-on), but the persistent message conditions allocate nothing.
- With MTBF off, the battery never failed, a health above 1.5 % and a right clock, the existing suite stays green unchanged.
- Commits: each task commits on `failures-battery-461` as `references #461 <task>`. Task 7 squashes Tasks 1 to 6 into one `fixes #461 ...` commit (CLAUDE.md: one commit per issue). Never push.
- Checks before every commit: `npx tsc --noEmit` clean; the task's test files green. Before Task 7's commit: `npm test` and `npm run build`.

## Review Focus

1. **A cold-and-dark power-on while the boot still awaits its restore** (a slow facility client): the unit starts with empty plans, no active waypoint, and no message from the restore besides `USER DATA LOST`. Test in Task 4.
2. **Two power cycles in a row with the battery still failed, the second within 5 minutes:** each wipes; the MSG page lists `USER DATA LOST` once; data entered between them is lost at the second. Test in Task 4.
3. **A hot-swap disable and resume during a wiped power-on:** no second wipe, the 1988-era clock carries over the disable, and `0008` stays until a satellite is tracked. Test in Task 5.
4. **`SERVICE?` during a wiped power-on before the first fix:** the clock is right at once (current era), the battery is at 100 %, the lost data stays lost, the almanac search goes on, and the first fix has the right date. Test in Task 5.
5. **A hand-edited `clockOffset` that is not a finite number:** the GPS treats it as 0 at construction; nothing throws. Test in Task 3.

---

### Task 1: The battery state, the aging and the catalog entry

**Files:**
- Create: `kln90b/failures/Battery.ts`
- Modify: `kln90b/settings/KLN90BFailureSettings.ts` (the two keys, in `KLN90BFailureTypes` and the defs), `kln90b/failures/FailureCatalog.ts` (the key `battery` in `FailureKey`, the field `randomWhenEmpty`, the entry), `kln90b/failures/Failures.ts` (`randomCandidates`), `kln90b/pages/Page.tsx` (`PageProps.battery`), `kln90b/KLN90BCore.ts` (build and age the battery right after `Failures` in `asyncInit`; `battery` in the props)
- Test: `test/unit/failures/Battery.test.ts` (new), `test/unit/failures/Failures.test.ts`, `test/unit/failures/FailureCatalog.test.ts`, `test/render/failures/FailurePersistence.test.ts`

**Interfaces:**
- Produces, in `kln90b/failures/Battery.ts`:
  - `export const BATTERY_LOW_PERCENT = 1.5`, `export const MIN_RATE_PER_YEAR = 20`, `export const MAX_RATE_PER_YEAR = 100 / 3`.
  - `export function ageBattery(health: number, lastDateS: number, nowS: number, random: () => number): { health: number, lastDateS: number }` — pure; the rule of the design's "Aging" (`lastDateS === 0`: `{health, lastDateS: nowS}`; `nowS > lastDateS`: one draw, `rate = MIN + random() × (MAX − MIN)`, `health − years × rate` floored at 0; else unchanged).
  - `export class Battery { constructor(settings: DefaultUserSettingManager<KLN90BFailureTypes>, failures: Failures); get health(): number; get displayPercent(): number; get isLow(): boolean; age(nowS: number, random?: () => number): void; service(): void }` — `isLow` is `health <= BATTERY_LOW_PERCENT || failures.isActive('battery')`; `service()` sets the health to 100 and keeps `batteryDate`.
  - `FailureDefinition.randomWhenEmpty?: boolean` — the random trigger may pick it only while `batteryHealth` is 0. `Failures.randomCandidates()` reads `batteryHealth` from its own settings manager (the same one `Battery` uses).
  - `PageProps.battery: Battery`.
- The catalog entry: `key: 'battery', flrName: 'BATTERY', random: true, randomWhenEmpty: true, testFail: false, outputs: [], inputs: [], message: null, detection: null, isEligible: () => true`, with a comment citing CMM 22 and B-2.

- [ ] **Step 1: Write the failing tests.**
  - `Battery.test.ts`, `ageBattery`: first session (`lastDateS 0`) → `{100, now}`; one year forward with `random () => 0` → health 80 and `lastDateS` now; with `() => 0.999999` → ≈ 66.67 (±0.01); half a year with `() => 0` → 90; a date set back (`nowS < lastDateS`) and an equal date → unchanged, `lastDateS` kept; ten years forward → 0; health 0.5 one day forward → ≥ 0 (never negative).
  - `Battery.test.ts`, the class over a fresh `DefaultUserSettingManager` (build it with `KLN90BFailureSettings`' defs through a test `EventBus`): `displayPercent` 100 → `100`, 42.01 → `43`, 0.001 → `1`, 0 → `0`; `isLow` false at 1.51, true at 1.5, true at 100 with `failures.fail('battery')`; `service()` after 3.2 → health 100, `batteryDate` unchanged.
  - `Failures.test.ts`: `randomCandidates()` leaves out `battery` at health 0.001 and contains it at health 0; `inactiveList()` lists `battery` at any health.
  - `FailureCatalog.test.ts`: the existing per-entry checks hold for `battery` (FLR name ≤ 11 characters, and so on); `battery` is the only entry with `randomWhenEmpty`.
  - `FailurePersistence.test.ts`: `a first boot installs a new battery` — `bootUnit()` with empty storage, advance 250 ms: `storedSetting(unit, 'batteryDate')` is the sim time of the boot in seconds (`E:ABSOLUTE TIME`, read it through `unit.env.sim`), `unit.props.battery.health` is 100. `a later session ages the battery` — storage `{batteryHealth: 50, batteryDate: <boot time − 365.25 days in s>}`: health within [16.66, 30] (50 minus one year at 33.33 or 20 %). `a sim date set back does not age it` — `batteryDate` one day after the boot time: health 50, `batteryDate` unchanged.
- [ ] **Step 2: Run** `npx vitest run test/unit/failures test/render/failures/FailurePersistence.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** as the Interfaces say. In `asyncInit`: `const battery = new Battery(KLN90BFailureSettings.getManager(this.bus), failures); battery.age(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));` before `Sensors` is built.
- [ ] **Step 4: Run** the same files. Expected: PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `references #461 the battery state, the aging and the catalog entry`.

---

### Task 2: FLR 1 and `BATTERY LOW`

**Files:**
- Modify: `kln90b/pages/left/Flr1Page.tsx` (a read-only field for the percent; `serviced()` also calls `props.battery.service()`), `kln90b/data/PersistentMessages.ts` (`BatteryLowMessage`)
- Test: `test/render/pages/left/Flr1Page.test.ts`, `test/render/failures/FailureMessages.test.ts`

**Interfaces:**
- Consumes: `PageProps.battery` (Task 1).
- Produces: `class BatteryLowMessage implements Message` in `PersistentMessages.ts`, built in `buildPersistentMessages` with `(props.battery, props.memory)`; condition `memory.failureDetection.mainPageShown && battery.isLow`.

- [ ] **Step 1: Write the failing tests.**
  - `Flr1Page.test.ts`: storage `batteryHealth: 42.01` → row 2 reads `BATTERY  43`; `batteryHealth: 0` → `BATTERY   0`; default → `BATTERY 100`. `SERVICE?` → ENT → ENT with `batteryHealth: 3` and `failure_battery: '{}'` stored → after one display tick row 2 reads `BATTERY 100`, `failures.isActive('battery')` false. FLR 2 is no service: the same storage, repair `BATTERY` on FLR 2 (CLR, ENT) → `isActive('battery')` false and FLR 1 still reads `BATTERY   3`.
  - `FailureMessages.test.ts`: `BATTERY LOW at 1.5 %` — storage `batteryHealth: 1.5`: after the first navigation page `messageLines(unit)` contains `['BATTERY LOW: SERVICE', 'REQUIRED TO PREVENT', 'LOSS OF USER DATA']`; at `1.51` it does not; at 100 with `failure_battery: '{}'` it does; on the Self Test page of a cold-and-dark boot (`bootToSelfTest`) it is not listed yet; after `SERVICE?` it goes.
- [ ] **Step 2: Run** `npx vitest run test/render/pages/left/Flr1Page.test.ts test/render/failures/FailureMessages.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** The percent is `padStart(3)` of `displayPercent`, written in `tick` only when it changed. Remove the "fixed until #461" note in the page's doc comment.
- [ ] **Step 4: Run** the same files. Expected: PASS.
- [ ] **Step 5: Commit** `references #461 FLR 1 shows the battery, BATTERY LOW`.

---

### Task 3: The clock across sessions, `SERVICE?` sets it, FAST keeps the era

Independent of the battery: this is the design's "The clock across sessions" and the clock part of `SERVICE?`.

**Files:**
- Modify: `kln90b/settings/KLN90BUserSettings.ts` (`clockOffset: number`, default 0, with a comment: the battery-backed clock as its offset from the sim time in ms, #461), `kln90b/Gps.ts`, `kln90b/pages/left/Flr1Page.tsx` (`serviced()` calls `props.sensors.in.gps.serviceClock()`)
- Test: `test/render/GpsClock.test.ts` (new)

**Interfaces:**
- Produces, in `GPS`:
  - The constructor sets the clock to `absoluteTimeToUNIXTime(E:ABSOLUTE TIME + timeRandom) + offset`, `offset` the stored `clockOffset`, or 0 when it is not a finite number.
  - `public saveClock(): void` — stores `timeZulu − currentSimUnixTime()` in `clockOffset`. Called from: `savePosition()`, `gpsAcquired()` (after the clock is set), `timeUpdated()`, `reinitializeSearch()` (first statement, before the early return: the caller has just set the clock), `serviceClock()`, `initializeFromTruth()`, and the power-off branch of `powerChanged`.
  - `public serviceClock(): void` — `timeZulu` set to the true time (`currentSimUnixTime()`); without a fix also `gpsSatComputer.internalTime` and `reinitializeSearch()` as a SET 2 entry does; `saveClock()`.
  - `initializeFromTruth()` sets `timeZulu` to `calculateGPSTime(timeZulu, now)` instead of `now` (the true time in the unit's era); the almanac and ephemeris keep the sim time base `now` as today. The start must stay hot (the test below).

- [ ] **Step 1: Write the failing tests** in `GpsClock.test.ts`. Let `ERA_MS = 1024 × 7 × 86 400 000` and `simNowMs()` the fake clock plus `unit.env.sim.absoluteTimeOffsetMs` (derive it from the harness, not from `GPS`).
  - `a first start keeps the sim date` — empty storage, engine running, settled: `|timeZulu − simNowMs()| < 3000`; after 61 s `storedSetting(unit, 'clockOffset')` within ±3000.
  - `a clock two eras behind survives the session` — storage `clockOffset: −2 × ERA_MS`, REAL (`fastGpsAcquisition: false`), engine running, settled: `timeZulu ≈ simNowMs() − 2 × ERA_MS` (±3000).
  - `FAST keeps the era and stays hot` — the same storage with `fastGpsAcquisition: true`, `bootToSelfTest` then approve: the fix within 60 s of the power-on, and `timeZulu ≈ simNowMs() − 2 × ERA_MS` (±3000). The same with the SET 10 switch from REAL to FAST during a search.
  - `SERVICE? corrects the era` — the two-eras storage, settled with a fix: `openFlr1`, `SERVICE?`, ENT, ENT; `timeZulu ≈ simNowMs()` (±3000), still after 10 calculation ticks, and `storedSetting(unit, 'clockOffset')` within ±3000 after 1 s. The same before the first fix (`coldGps: true`), then settled: the first fix keeps the current era.
  - `a SET 2 date entry before the fix corrects the era` — the two-eras storage, `coldGps: true`, `panel.enterDate('L', <today's day, month, year digits>)` on SET 2 before the fix, settled: `timeZulu ≈ simNowMs()` (±3000).
  - `the offset is saved at the power-off` — empty storage, engine running, `coldGps: true` (no fix, so no periodic save): set `gps.timeZulu` to `simNowMs() − 2 × ERA_MS` directly, `panel.powerOff()`, 1 s: `storedSetting(unit, 'clockOffset')` ≈ `−2 × ERA_MS` (±3000).
  - `a clockOffset that is not a number is 0` — storage `clockOffset: 'x'` (the FakeStorage takes raw JSON; store the string): boots without errors, `|timeZulu − simNowMs()| < 3000`.
- [ ] **Step 2: Run** `npx vitest run test/render/GpsClock.test.ts`. Expected: the new tests FAIL (the session tests and SERVICE?; the first-start test may already pass).
- [ ] **Step 3: Implement** as the Interfaces say.
- [ ] **Step 4: Run** the file, then `npx vitest run test/render/Gps.test.ts test/render/GpsAcquisition.test.ts test/render/failures`. Expected: PASS, the existing tests unchanged.
- [ ] **Step 5: Commit** `references #461 the unit's clock is kept across sessions, SERVICE? sets it, FAST keeps its era`.

---

### Task 4: The memory-lost event and the wipe of the user data

**Files:**
- Create: `kln90b/settings/UserMemory.ts`
- Modify: `kln90b/PowerSupply.ts`, `kln90b/KLN90BCore.ts`, `kln90b/settings/UserWaypointPersistor.ts`, `kln90b/data/VolatileMemory.ts`, `kln90b/data/flightplan/ActiveWaypoint.ts`, `kln90b/settings/RemarksManager.ts`, `kln90b/services/Timers.ts`
- Test: `test/unit/settings/UserMemory.test.ts` (new), `test/render/failures/BatteryWipe.test.ts` (new)

**Interfaces:**
- Consumes: the `battery` failure (Task 1).
- Produces:
  - In `PowerSupply.ts`: `export interface UserMemoryLostEvent { userMemoryLost: void }`; `PowerEventData.memoryLost?: boolean` (true only on the power-on that wiped); the constructor takes a third parameter `batteryFailed: () => boolean`. In `refreshPowerState`, on a power-on: `const memoryLost = this.batteryFailed()`; if so publish `userMemoryLost` (`sync false, cached false`); then count `powercycles`, set the page and publish `powerEvent` with `memoryLost`.
  - In `UserMemory.ts`: `export const KEPT_USER_SETTINGS: readonly (keyof KLN90BUserSettingsTypes)[] = ['userDataFormat', 'fastGpsAcquisition']` and `export function wipeStorage(userSettings: KLN90BUserSettings, bus: EventBus): void` — every other user setting `resetToDefault()`; every slot of `KLN90BUserWaypointsSettings`, `KLN90BUserFlightplansSettings` and `KLN90BUserRemarkSettings` to `""`.
  - `KLN90BCore` subscribes `userMemoryLost` **in its constructor, right after the settings are loaded** (so it runs before every later subscriber, the GPS's clock write of Task 5 included): `wipeStorage(...)`, increments `private memoryLossCount`, then `messageHandler.clear()` and `addMessage(new OneTimeMessage(["USER DATA LOST"]))`.
  - `UserWaypointPersistor` subscribes: with `ignoreSync` set, removes every repository facility whose ICAO region is `USER_WAYPOINT` (`data/navdata/IcaoBuilder.ts`).
  - `VolatileMemory` subscribes: each of `fplPage.flightplans` `.delete()`, then `navPage.activeWaypoint.forgetAll()`. `reset(evt)` treats `evt.memoryLost` as `timeSincePowerChange > RESET_TIME` (one local `const longInterruption`).
  - `ActiveWaypoint.forgetAll(): void` — drops the direct-to and the procedure leg, no active leg, `lastactiveWaypoint = null`, the turn stack cleared.
  - `RemarksManager` subscribes: its map emptied. `Timers` gets the bus as a new first constructor parameter and subscribes: `totalTime = 0`.
  - `asyncInit`: `const lossesBefore = this.memoryLossCount` right before the user waypoint restore; after the awaits of the active waypoint and the flight plan restore, if the count changed: `lastActiveWaypoint = null`, 26 empty plans, and the list cleared and `USER DATA LOST` posted again (a private `postUserDataLost()` shared with the constructor's handler). The restore's own `WAYPOINT xxx DELETED` is posted only if the count is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `UserMemory.test.ts`: every key of `KLN90BUserSettings` set to a non-default value (iterate `getAllSettings()`), plus `wpt3`, `fpl1`, `rmk7` and `failure_battery`, `batteryHealth`, `eepromDbarCalPlus`; `wipeStorage`: each key except the kept ones equals its default, `userDataFormat` and `fastGpsAcquisition` keep theirs, the three slots are `""`, the failure and EEPROM settings unchanged.
  - `BatteryWipe.test.ts` (flight; stored data: a user waypoint via `savedUserWaypoints`, FPL 1 via `savedFlightplan`, `rmk0`, `welcome1`, `powercycles: 41`, `totalTime: 7200`, `userDataFormat: 2`, `fastGpsAcquisition: false`, an EEPROM calibration):
    - `a power-on with the battery failed wipes the user memory` — engine running without the failure, then `failures.fail('battery')`, `panel.powerCycle({offSeconds: 600})`, past the self-test: `userWaypoints(unit)` empty, `fplIdents(unit, 1)` empty, `props.remarksManager.getAirportsWithRemarks()` empty, `welcome1` default, STA 4 power cycles `1` and hours `0` (`settings`), `messages(unit)` contains `USER DATA LOST` once; after 1 s the storage: `wpt0`, `fpl1`, `rmk0` empty or undefined, `userDataFormat` 2, `fastGpsAcquisition` false, the EEPROM and the failure settings as before.
    - `nothing is wiped while the unit is on, and a repair before the power-off keeps everything` (the anti-goal) — fail the battery, advance 10 minutes: all data there in memory and storage; `failures.repair('battery')`, power cycle: all data there, no `USER DATA LOST`.
    - `the first power-on of a session wipes` — storage with `failure_battery: '{}'`: cold and dark (`bootToSelfTest`) and engine running (`bootUnit`): the data gone, `USER DATA LOST` listed once, no `WAYPOINT xxx DELETED`.
    - `the ride-through and the hot-swap resume wipe nothing` — battery failed while on; an electricity loss of 1 s (as `test/render/PowerSupply.test.ts` does), and a hot-swap disable and resume (as `SimVarSync.test.ts` does): data kept.
    - `a first-ever start is no wipe` — empty storage: no `USER DATA LOST`, `batteryHealth` 100.
    - `a wipe counts as a long interruption` — battery failed while on, a pilot magnetic variation set (`memory.navPage.userMagvar = 5`), `powerCycle({offSeconds: 60})` (under `RESET_TIME`): `userMagvar` 0 and no direct-to.
    - `a route synced from the EFB before the power-on is wiped, one after it stays` — `efb: true`, battery failed: cold and dark with the route synced before `powerOn` → FPL 0 empty after the self-test; engine running with the route synced after the boot → FPL 0 holds it.
    - `data entered after a wipe survives the next session once repaired` — after the wipe, create a user waypoint, repair, 1 s: the stored slot is V2 (`UserWaypointV2` format starts with the V2 ICAO) and `userDataFormat` is 2.
    - Review Focus 1: `a power-on during the boot's restore` — `platform.createFacilityClient` wrapping the memory client so that `getFacility` resolves after 5 s; stored FPL 1 and an active waypoint; cold and dark, `powerOn` 1 s into the boot: after the boot FPL 1 empty, no active waypoint, the message list exactly `['USER DATA LOST']`.
    - Review Focus 2: `two power cycles in a row` — battery failed, stored data, two `powerCycle({offSeconds: 60})` with a user waypoint created between them: after the second it is gone and `USER DATA LOST` is listed once.
  - Throwaway benchmark (not committed): time the `userMemoryLost` publish with a full repository (250 user waypoints, 26 plans of 30 legs, 100 remarks) in Node. Expected: worst × 10 under 33 ms. Report the numbers in the task report.
- [ ] **Step 2: Run** `npx vitest run test/unit/settings/UserMemory.test.ts test/render/failures/BatteryWipe.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as the Interfaces say. `PowerSupply` gets `() => failures.isActive('battery')` from `asyncInit`.
- [ ] **Step 4: Run** the two files, then `npx vitest run test/render/PowerSupply.test.ts test/render/SimVarSync.test.ts test/render/data test/render/KLN90BCore.userDataConversion.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `references #461 at a power-on with the battery failed the user memory is wiped`.

---

### Task 5: The receiver's memory after a wipe and `RCVR HARDWARE ERROR: 0008`

**Files:**
- Modify: `kln90b/Gps.ts`, `kln90b/data/PersistentMessages.ts` (`ReceiverMemoryLostMessage`), `kln90b/data/VolatileMemory.ts` (the flag below)
- Test: `test/render/failures/BatteryReceiver.test.ts` (new)

**Interfaces:**
- Consumes: `userMemoryLost`, `PowerEventData.memoryLost` (Task 4); `saveClock` (Task 3).
- Produces:
  - `export const WIPED_CLOCK_MS = Date.UTC(1988, 0, 1)` in `Gps.ts` (comment: the year the unit's date editors default to, `DateEditor`; a guess, #461).
  - `GPS` subscribes `userMemoryLost` in its constructor: `timeZulu` and `gpsSatComputer.internalTime` to `WIPED_CLOCK_MS`; `lastPowerOffTime` to the sim time now; `eraseAlamanac()`, `eraseCachedEphemeris()`, and `ephemerisErasePending = true` so that the constructor's `awaitInit().then` erases instead of restoring; `coords.set(0, 0)` and `syncLastKnownPosition(coords)`; `noStoredPosition = true`; `saveClock()`.
  - `powerChanged`: on `evt.memoryLost` it skips `initializeFromTruth` and sets `memoryLostThisPowerOn` (cleared at the next power event); `startFast()` returns early while it is set. `gpsAcquired` posts `POSITION DIFFERS` only if `!noStoredPosition`, and clears `noStoredPosition`; the power-off clears it too.
  - `public get tracksSatellite(): boolean` — some real satellite in the SDK channels is in an acquired state (the set `GpsSearch.ts` calls `ACQUIRED_STATES`; export it). Allocates nothing.
  - `VolatileMemory.receiverMemoryLost: boolean` — set from `evt.memoryLost` in `reset`; cleared in `reset` of the next power-on and once `gps.tracksSatellite` is true (the message clears it, see below).
  - `class ReceiverMemoryLostMessage implements Message` — lines `['RCVR HARDWARE ERROR:', '0008']`; condition `memory.failureDetection.mainPageShown && memory.receiverMemoryLost`, and when `gps.tracksSatellite` it sets `memory.receiverMemoryLost = false` and is false.

- [ ] **Step 1: Write the failing tests** in `BatteryReceiver.test.ts` (`ERA_MS` and `simNowMs()` as in Task 3; the fake clock starts on `DEFAULT_START`, 2026-06-01):
  - `the clock starts at 1 JAN 1988` — REAL, stored position far from the aircraft, battery failed, `bootToSelfTest`: `timeZulu` within 20 s of `WIPED_CLOCK_MS` plus the time since the power-on (assert the literal `Date.UTC(1988, 0, 1)`, not the constant), and `storedSetting(unit, 'clockOffset')` ≈ `Date.UTC(1988,0,1) − simNowMs()` (±20 000).
  - `an almanac search, no POSITION DIFFERS, and the rollover date` — the same, approve the self-test: `gps.search.mode === SearchMode.AlmanacSearch`; advance until valid (cap 40 min): `messages(unit)` has no `POSITION DIFFERS FROM`, and `timeZulu ≈ simNowMs() − 2 × ERA_MS` (±3000).
  - `FAST does nothing after a wipe` — the same with `fastGpsAcquisition: true`: AlmanacSearch; and the SET 10 switch to FAST (REAL first) during it leaves the mode AlmanacSearch.
  - `the receiver memory is gone from storage` — after the wipe and 61 s: `lastAlmanacDownload` 0, `lastEphemeris` `""`, `lastLatitude` 0 (before any fix).
  - `an engine-running start keeps its forced fix` — battery failed, engine running: valid at once, `timeZulu ≈ simNowMs() − 2 × ERA_MS` (±3000), and no `RCVR HARDWARE ERROR:` listed after 5 s. The ephemeris stored before the boot is not restored late: after 61 s `storedSetting('lastEphemeris')` holds only times after the boot (or is empty).
  - `0008 shows until a satellite is tracked` — cold and dark, battery failed: absent on the Self Test page; present (`['RCVR HARDWARE ERROR:', '0008']` in `messageLines`) after the approval; absent within one calculation tick of `gps.tracksSatellite` turning true (advance in 1 s steps, cap 30 min).
  - `FLR 2 does not correct the clock` — after the approval, repair `BATTERY` on FLR 2: `timeZulu` still before 1989; settled to the first fix: the rollover date.
  - Review Focus 3: `a hot-swap during the wiped power-on` — after the approval, disable 30 s and resume: no second `USER DATA LOST` in the list, `0008` still listed, `timeZulu` still before 1989.
  - Review Focus 4: `SERVICE? during the wiped power-on` — after the approval, before the fix: `SERVICE?`; `timeZulu ≈ simNowMs()` (±3000), `battery.health` 100, the user waypoint still gone, the mode still AlmanacSearch; the first fix: `timeZulu ≈ simNowMs()`.
- [ ] **Step 2: Run** `npx vitest run test/render/failures/BatteryReceiver.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** as the Interfaces say.
- [ ] **Step 4: Run** the file, then `npx vitest run test/render/Gps.test.ts test/render/GpsAcquisition.test.ts test/render/SatelliteReachability.test.ts test/render/failures test/unit/GpsSearch.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `references #461 the receiver's memory and the clock after a wipe, RCVR HARDWARE ERROR 0008`.

---

### Task 6: Documentation

**Files:**
- Modify: `docs/failures.md`, `docs/architecture.md`

- [ ] **Step 1: Write the doc changes.** `docs/failures.md`: the Status names the battery as built (design link); the catalog row for `battery` with `USER DATA LOST` and `RCVR HARDWARE ERROR:` / `0008`; the section Battery: the default date, the two anti-goals, the `userMemoryLost` event, FAST after a wipe and FAST keeping the era, the clock across sessions, `0008`, FLR 2 versus `SERVICE?`, the two batteries (CMM pages); correct its claim that entering the date, the time or the position avoids the almanac search; "Repair" says `SERVICE?` sets the clock; "Persistence" the new keys; remove item 1 of "What the code needs first" and the default date of "Left to the implementation", and the two sections if nothing is left in them. `docs/architecture.md`: the power-on order (`userMemoryLost` before `powerEvent`, `memoryLost` on the power event) and the clock offset.
- [ ] **Step 2: Check** that every identifier the docs name exists (`grep` each in `kln90b/`).
- [ ] **Step 3: Commit** `references #461 documentation`.

---

### Task 7: Verify and squash into the fix commit

- [ ] **Step 1: Run everything:** `npx tsc --noEmit` (clean), `npm test` (all green), `npm run build` (succeeds; the circular-dependency count equal to master's).
- [ ] **Step 2: Squash** the commits of Tasks 1 to 6: `git reset --soft <the plan commit>`, then commit with:

```
fixes #461 the internal battery ages, warns and, once failed, loses the user memory and the receiver's memory at every power-on; the unit's clock is kept across sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
```

- [ ] **Step 3: Confirm** `git log --oneline master..` shows the two design commits, the plan and the one `fixes #461` commit, and `git status` is clean.
