# Receiver Hardware Error Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One combined `RCVR HARDWARE ERROR:` code from a receiver error word, `gpsAntenna` open/short, and the new
receiver failures `rcvrMemory`, `rcvrHardware`, `rcvrInit`, `rcvrEeprom` and `antennaGain` (#471).

**Architecture:** A new `ReceiverErrors` class, owned by `GpsFailures`, holds the 16-bit error word: power-on bits
latched at the start of `GPS.powerChanged` for a power-on, live bits read from cached failure values. The message,
`TEST FAIL`, `receiverFailed` and every new effect read that word. Drawn values live in the failure's setting text.

**Tech Stack:** TypeScript (es2017 target), `@microsoft/msfs-sdk`, Vitest (unit, render, flight stages).

**Spec:** [docs/superpowers/specs/2026-11-08-receiver-hardware-errors-design.md](../specs/2026-11-08-receiver-hardware-errors-design.md)
(approved by the maintainer 2026-11-08). Read it and `docs/failures.md` before starting.

## Global Constraints

- Persisted keys are public contract: the new keys are `rcvrMemory`, `rcvrHardware`, `rcvrInit`, `rcvrEeprom`,
  `antennaGain`; FLR names `RCVR MEMORY`, `RCVR HW`, `RCVR INIT`, `RCVR EEPROM`, `ANT GAIN`. Never rename them.
- With MTBF off and nothing failed, every existing test stays green unchanged and nothing draws from `Math.random`.
- `receiverFailed` (every calculation tick) and the message condition (1 Hz) never parse setting text: values are
  cached at `failureChanged` and at the power-on latch.
- `target: es2017`; no newer runtime features.
- Take-home mode: no receiver error word, no effect (all getters return the "nothing failed" values).
- Manual references in comments (IM C-3 to C-7, A-7; CMM 10, 12, 22, 1026; 5-29; KLN 900 B-6); never copy manual text.
- American English; no counts in prose for things that grow.
- **One commit per issue** (CLAUDE.md): tasks commit `wip #471 …` on `issue-471-receiver-errors`; Task 8 squashes
  them into one `fixes #471 …` commit.
- Draws (tests can steer them through the injected `random`): `short` = `random() < 0.5`; `transient` =
  `random() < 0.5`; `rcvrHardware` code = `[0x0002, 0x0004, 0x0080, 0x2000, 0x8000][floor(random() * 5)]`;
  `lossDb` = `6 + random() * 9`; 0800 factor = `2 + random() * 2`.

## Review Focus

1. A profile from before this change with `failure_gpsAntenna` = `'{}'`: draws `short` once, saves it, and the next
   session shows the same code (Task 3 test "missing values are drawn once and saved").
2. A failure triggered in operation for a power-on-only code (0002/0004/0080, 0008, 0400, 0800) changes nothing until
   the next power-on, also its message and `TEST FAIL` (Task 3 test "a power-on code started in operation acts from
   the next power-on").
3. A transient failure repaired by FLR 2 before the next power-on: no effect at all (Task 3 test "repaired before the
   power-on: nothing latched").
4. The hot-swap disable/resume and the battery ride-through: no latch, the word is kept (Task 4 test "a hot-swap resume
   keeps the latched word").
5. Two causes of 0008 at one power-on (battery wipe and `rcvrMemory`): one 0008 bit, the unit's memory wiped once, the
   message shows `0008` (Task 4 test "battery wipe and rcvrMemory together").

---

### Task 1: The new catalog entries

**Files:**
- Modify: `kln90b/failures/FailureCatalog.ts` (the `FailureKey` union and `FAILURE_CATALOG`)
- Test: `test/unit/failures/FailureCatalog.test.ts`, `test/render/failures/GpsReceiverFailures.test.ts` ("FLR 3 lists
  the GPS failures")

**Interfaces:**
- Produces: `FailureKey` includes `'rcvrMemory' | 'rcvrHardware' | 'rcvrInit' | 'rcvrEeprom' | 'antennaGain'`.

- [ ] **Step 1: Write the failing tests.** In `FailureCatalog.test.ts`, a test "the receiver failures of #471": for each
  of the five keys, `flrName` as in the Global Constraints, `random: true`, `testFail: false`, `message: null`,
  `detection: null`, `outputs`/`inputs` empty, `readAtPowerOn` undefined, `isEligible(anyPlane)` true. Extend the FLR 3
  render test's expected rows to the new alphabetical order (the plain string order `Failures.sorted` uses).
- [ ] **Step 2: Run** `npx vitest run test/unit/failures/FailureCatalog.test.ts` — expected FAIL (unknown keys).
- [ ] **Step 3: Add the five entries** with a comment each citing IM C-3/C-4 (and C-7, KLN 900 B-6 for `antennaGain`).
  Leave `gpsAntenna` unchanged in this task. The settings type and the persistence follow from the catalog
  (`KLN90BFailureSettings`).
- [ ] **Step 4: Run** the two test files and `npx tsc --noEmit` — expected PASS, clean.
- [ ] **Step 5: Commit** `wip #471 catalog entries`.

### Task 2: `ReceiverErrors`, the error word

**Files:**
- Create: `kln90b/failures/ReceiverErrors.ts`
- Test: `test/unit/failures/ReceiverErrors.test.ts` (build like `GpsFailures.test.ts`: `Failures` over
  `KLN90BFailureSettings.getManager(new EventBus())`)

**Interfaces:**
- Consumes: `Failures` (`isEffective`, `values`, `setValues`, `repair`, `failureChanged` on the bus).
- Produces:
  - `export const RCVR_ROM = 0x0002, RCVR_RAM = 0x0004, RCVR_MEMORY = 0x0008, RCVR_RF = 0x0010, RCVR_ASIC = 0x0080,
    RCVR_BBP = 0x0100, RCVR_INIT = 0x0400, RCVR_EEPROM = 0x0800, RCVR_BBP_UNDER = 0x2000, RCVR_BBP_OVER = 0x8000`
  - `export function formatReceiverCode(code: number): string` → four uppercase hex digits (`0x18` → `'0018'`).
  - `class ReceiverErrors { constructor(bus: EventBus, failures: Failures, takeHomeMode: boolean, random?: () => number) }`
    with `public random`, and:
    - `latchPowerOn(batteryWipe: boolean): void`
    - `get code(): number` — latched bits (0008 as it stands) | live bits
    - `get reportedCode(): number` — `code`, or 0 while `gpsReceiver` is effective
    - `get testFailCode(): number` — latched bits as latched | live bits; 0 while `gpsReceiver` is effective
    - `get receiverDead(): boolean` — `code` has any of 0002, 0004, 0080, 0010, 0100, 2000, 8000
    - `get memoryLostAtPowerOn(): boolean` — `rcvrMemory` acted at this power-on's latch (not the battery)
    - `get hostBlocked(): boolean` — 0400 latched
    - `get acquisitionFactor(): number` — the drawn factor with 0800 latched, else 1
    - `get antennaLossDb(): number` — `lossDb` while `antennaGain` is effective, else 0
    - `satelliteTracked(): void` — clears the 0008 bit of `code` (not of `testFailCode`)
    - `get memoryBitSet(): boolean` — the cheap check `GPS.tick` asks before `tracksSatellite`

- [ ] **Step 1: Write the failing tests** (`random` steered per test):
  - `formatReceiverCode(0x18) === '0018'`, `(0x110) === '0110'`, `(0x2010) === '2010'`.
  - nothing failed: `code` 0, `testFailCode` 0, `receiverDead` false, `acquisitionFactor` 1, `antennaLossDb` 0, and
    `random` never called (spy) — also through `latchPowerOn(false)`.
  - `gpsAntenna` failed with `random` 0.7: values `{short: 0}` saved, `code === 0x10`; with 0.2: `{short: 1}`,
    `code === 0x110`; `receiverDead` true; repair → `code` 0 at once.
  - missing values are drawn once and saved: settings text `'{}'` for `gpsAntenna` before construction, first `code`
    read draws and saves `{short: …}`; a second `ReceiverErrors` over the same settings reads the same code without
    calling `random`.
  - `rcvrHardware` codes: `random` 0, 0.2, 0.4, 0.6, 0.8 → saved `code` 0x0002, 0x0004, 0x0080, 0x2000, 0x8000.
    0x2000 and 0x8000 show in `code` at once and end at once with a repair. A power-on code started in operation acts
    from the next power-on: 0x0002 failed → `code` 0 until `latchPowerOn(false)`, then 0x0002; repaired → still 0x0002
    until the next `latchPowerOn`, then 0.
  - battery wipe: `latchPowerOn(true)` → `code` 0x0008, `memoryLostAtPowerOn` false; `satelliteTracked()` → `code` 0,
    `testFailCode` still 0x0008; next `latchPowerOn(false)` → 0.
  - `rcvrMemory` not transient (`random` 0.9 at the failure): every `latchPowerOn` gives 0x0008 and
    `memoryLostAtPowerOn` true, the failure stays active. Transient (0.1): the first latch gives 0x0008, the failure is
    repaired (`failures.isActive` false), `code` keeps 0x0008 until tracked; the next latch gives 0.
  - repaired before the power-on: nothing latched (`rcvrInit` failed then repaired → `latchPowerOn` → `hostBlocked`
    false, `code` 0).
  - `rcvrInit`: latched → `hostBlocked` true, `code` 0x0400 for the power-on, also after a repair.
  - `rcvrEeprom`: latch with `random` 0.5 → `acquisitionFactor === 3`, `code` 0x0800.
  - combination: `gpsAntenna` open + battery wipe → `code === 0x0018`; `rcvrEeprom` + `rcvrMemory` → 0x0808.
  - `gpsReceiver` effective: `reportedCode` and `testFailCode` 0 while `code` keeps the bits; repaired → back.
  - `antennaGain` with `random` 0.5 → `lossDb` 10.5 saved, `antennaLossDb` 10.5; repaired → 0.
  - take-home: every getter returns the nothing-failed value with `gpsAntenna` failed.
- [ ] **Step 2: Run** `npx vitest run test/unit/failures/ReceiverErrors.test.ts` — expected FAIL (module missing).
- [ ] **Step 3: Implement.** Subscribe to `failureChanged`: on `active` for one of the keys, draw and `setValues`; on
  any change of these keys, refresh the cache. Read values once per change (never in a getter on the hot path) and
  validate them (finite, `short`/`transient` 0 or 1, `code` one of the five, `lossDb` within 6..15); unusable values
  are drawn anew and saved. The latch: power-on bits from the effective failures and `batteryWipe`; then repair each
  transient failure that acted; then the 0800 factor. Allocate nothing in the getters.
- [ ] **Step 4: Run** the test file and `npx tsc --noEmit` — expected PASS, clean.
- [ ] **Step 5: Commit** `wip #471 receiver error word`.

### Task 3: The word in the receiver: latch, dead receiver, `rcvrMemory`

**Files:**
- Modify: `kln90b/failures/GpsFailures.ts` (own `public readonly receiverErrors: ReceiverErrors`; `receiverFailed`
  = `!takeHomeMode && (receiverErrors.receiverDead || failures.isEffective('gpsReceiver'))`)
- Modify: `kln90b/Gps.ts` (`powerChanged`, `forgetMemory` split, `tick`, `startFast`)
- Test: `test/render/failures/ReceiverMemory.test.ts` (new), `test/unit/failures/GpsFailures.test.ts`

**Interfaces:**
- Consumes: Task 2's `ReceiverErrors`.
- Produces: `gps.failures.receiverErrors` (read by Tasks 4–7); `GPS.forgetReceiverMemory(): void` (private) and
  `GPS.forgetUnitMemory(): void` (private).

- [ ] **Step 1: Write the failing tests.**
  - Unit (`GpsFailures.test.ts`): `rcvrHardware` with saved `{code: 8192}` is a receiver failure at once;
    `{code: 2}` only after `receiverErrors.latchPowerOn(false)`.
  - Render, `ReceiverMemory.test.ts`, storage as `BatteryReceiver.test.ts`'s `STORED` but with
    `failure_rcvrMemory: '{"transient":0}'` instead of `failure_battery`:
    - "rcvrMemory erases the almanac and the ephemeris and keeps the user data": after the boot the SDK has no almanac
      (`getLastAlmanacTime()` undefined) and no satellite has `lastEphemerisTime`; the user waypoint `USRA` is still
      there; no `USER DATA LOST`; the clock is within `TOLERANCE_MS` of the sim time (not 1988); `lastLatitude`/
      `lastLongitude` still -47/-172 in storage; `gps.search.mode === SearchMode.AlmanacSearch`.
    - "FAST is blocked as for the battery": the same with `fastGpsAcquisition: true` → still `AlmanacSearch`; then
      SET 10 switched to FAST (as the existing SET 10 test does) → still `AlmanacSearch`.
    - "the first fix keeps the unit's era": wait for the fix (cap as `BatteryReceiver.test.ts`) → the clock is within
      `TOLERANCE_MS` of the sim time; no `SYSTEM TIME UPDATED` message.
    - "battery wipe and rcvrMemory together": both stored → one `USER DATA LOST`, clock from 1988 as in #461.
- [ ] **Step 2: Run** `npx vitest run test/render/failures/ReceiverMemory.test.ts test/unit/failures/GpsFailures.test.ts`
  — expected FAIL.
- [ ] **Step 3: Implement.**
  - `GpsFailures` constructs `ReceiverErrors(bus, failures, takeHomeMode, random)`.
  - `GPS.powerChanged`, power-on branch, first: `this.failures.receiverErrors.latchPowerOn(evt.memoryLost === true)`.
    Then, if `memoryLostAtPowerOn` and not `evt.memoryLost`, `forgetReceiverMemory()`.
  - Split `forgetMemory`: `forgetReceiverMemory` = `eraseAlamanac`, `eraseCachedEphemeris`,
    `fakeReceiver.forgetEphemeris`, `ephemerisErasePending = true`, `ephemerisFromTruthPending = false`;
    `forgetUnitMemory` = the rest (1988 clock, `lastPowerOffTime`, `coords` 0/0, `syncLastKnownPosition`,
    `noStoredPosition`, `saveClock`). The `userMemoryLost` handler calls both.
  - FAST: `memoryLostThisPowerOn` also true for `memoryLostAtPowerOn` (`powerChanged` and `startFast` already read it).
  - `GPS.tick`: `if (receiverErrors.memoryBitSet && this.tracksSatellite) receiverErrors.satelliteTracked()`.
- [ ] **Step 4: Run** the two files, then `npm test` — expected all green: the messages are untouched until Task 5.
  A stored `failure_gpsAntenna: '{}'` now draws `short` from the seeded `Math.random`, which shifts that test's later
  draws; if such a test changes, store `'{"short":0}'` in it. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `wip #471 latch and rcvrMemory`.

### Task 4: `rcvrHardware` and the latch's edges in a booted unit

**Files:**
- Test: `test/render/failures/ReceiverHardware.test.ts` (new)
- Modify: only if a test finds a gap (no planned code)

**Interfaces:**
- Consumes: Task 3.

- [ ] **Step 1: Write the tests.**
  - "rcvrHardware 0002 failed in operation acts from the next power-on": `bootUnit({storage: HOME})`, fail from FLR 3
    with `gps.failures.receiverErrors.random = () => 0` → the fix stays; power cycle → every satellite inhibited, STA 1
    `FAILR`.
  - "rcvrHardware 2000 acts at once": `random` 0.6 → inhibited at the next calculation tick; FLR 2 repair →
    reacquires.
  - "a hot-swap resume keeps the latched word": stored `failure_rcvrInit: '{"transient":1}'`, boot, hot-swap disable
    and resume (as the existing hot-swap tests do) → `receiverErrors.code === 0x400` still, `failures.isActive('rcvrInit')`
    false.
- [ ] **Step 2: Run** `npx vitest run test/render/failures/ReceiverHardware.test.ts` — expected PASS (Task 3 built it);
  if one fails, fix the latch, not the test.
- [ ] **Step 3: Mutation check.** Break `latchPowerOn` so power-on codes are live; confirm the first test fails; restore;
  `git diff` clean apart from the new test.
- [ ] **Step 4: Commit** `wip #471 rcvrHardware`.

### Task 5: The combined message and TEST FAIL

**Files:**
- Modify: `kln90b/data/PersistentMessages.ts` (replace `ReceiverMemoryLostMessage` with `ReceiverHardwareMessage`)
- Modify: `kln90b/data/VolatileMemory.ts` (remove `receiverMemoryLost` and its line in `reset`)
- Modify: `kln90b/failures/FailureCatalog.ts` (`gpsAntenna`: `message: null`, `detection: null`, `testFail: false`)
- Modify: `kln90b/pages/left/SelfTestLeftPage.tsx` (`|| gps.failures.receiverErrors.testFailCode !== 0`)
- Test: `test/render/failures/ReceiverHardwareMessage.test.ts` (new); update `GpsReceiverFailures.test.ts` and any test
  that stores `failure_gpsAntenna: '{}'` and asserts `0010` to store `'{"short":0}'`

**Interfaces:**
- Consumes: `formatReceiverCode`, `receiverErrors.reportedCode`, `testFailCode`, `memory.failureDetection.mainPageShown`.
- Produces: `class ReceiverHardwareMessage implements Message` with `message = ['RCVR HARDWARE ERROR:', '0000']`
  updated in place, and `onPowerOff()` resetting the remembered code to 0.

- [ ] **Step 1: Write the failing tests.**
  - "0018 from the antenna and the battery's wipe": stored `failure_gpsAntenna: '{"short":0}'` and `failure_battery`
    → after the first navigation page exactly one `RCVR HARDWARE ERROR:` entry, lines `['RCVR HARDWARE ERROR:', '0018']`;
    FLR 2 repair of the antenna → `0008`, still read if it was read (read it first with the MSG page), MSG prompt not
    flashing; after the first satellite tracked → no entry.
  - "a new bit re-alerts": antenna `0010` read on the MSG page; fail `rcvrHardware` with `random` 0.6 → `2010`, the
    message unread, MSG prompt flashing.
  - "a short shows 0110": `'{"short":1}'` → `0110`.
  - "not posted before the first navigation page": `bootToSelfTest` with the antenna → no entry; `TEST FAIL` shown.
  - "TEST FAIL for a power-on code": stored `failure_rcvrEeprom: '{"transient":0}'` → `bootToSelfTest` row 5
    `'TEST FAIL  '`; and for the battery's wipe alone (`failure_battery`) → `'TEST FAIL  '`.
  - "hidden while NO RCVR DATA": antenna + `gpsReceiver` stored → `NO RCVR DATA` listed, no `RCVR HARDWARE ERROR:`;
    repair `gpsReceiver` → `0010` appears unread.
  - "after a power cycle the message comes back unread" with the same code.
- [ ] **Step 2: Run** the new file — expected FAIL.
- [ ] **Step 3: Implement.** Condition: `reportedCode !== 0 && mainPageShown`. On each call compare with the last code:
  a bit not in it → `seen = false`; update the second line with `formatReceiverCode`. Keep `isConditionValid`
  allocation-free when the code did not change.
- [ ] **Step 4: Run** `npm test` — expected PASS after updating the `'{}'` antenna storages; `BatteryReceiver.test.ts`
  passes unchanged (`0008`).
- [ ] **Step 5: Mutation check.** Remove the `seen = false` on a new bit → the re-alert test fails; restore.
- [ ] **Step 6: Commit** `wip #471 combined message and TEST FAIL`.

### Task 6: `rcvrInit` and `rcvrEeprom`

**Files:**
- Modify: `kln90b/Gps.ts` (`reinitializeSearch`, `powerChanged` FAST and host init, `startFast`, the altitude source)
- Modify: `kln90b/pages/left/Set1Page.tsx` (`confirmPosition`: skip `syncLastKnownPosition` while `hostBlocked`)
- Modify: `kln90b/GpsSearch.ts` (constructor gets `acquisitionFactor: () => number`)
- Test: `test/unit/GpsSearch.test.ts`, `test/render/failures/ReceiverInit.test.ts` (new)

**Interfaces:**
- Consumes: `receiverErrors.hostBlocked`, `acquisitionFactor`, `memoryLostAtPowerOn`.

- [ ] **Step 1: Write the failing tests.**
  - Unit (`GpsSearch.test.ts`, its existing fake computer): factor 3 → the warm, hot, blind and almanac-search times and
    ranges the search sets at `begin`/`startBlindSearch` are 3× the constants; after `end()` the idle and hot times are
    `IDLE_ACQUISITION`/`HOT_ACQUISITION` unscaled; the sky search after `lostFix` uses the unscaled times.
  - Render `ReceiverInit.test.ts` with `WARM_START` storage and `failure_rcvrInit: '{"transient":0}'`:
    - "no altitude aiding": on the ground with the altitude input, after the fix STA 1 shows `NAV` not `NAV A`, and
      `gps.solution.altitudeAided` false; with three satellites (`inhibitAllBut`) no fix.
    - "SET 1 and SET 2 entries do not restart the search": record `search` start calls (spy on `search.start`) → none
      after the power-on; the unit's displayed clock does change with the SET 2 entry.
    - "FAST sends nothing": `fastGpsAcquisition: true` → the search is the warm start of the stored memory, not hot;
      SET 10 switched to FAST → no restart.
    - "0400 and 0008 together": both stored → the receiver's `internalTime` is `WIPED_CLOCK_MS`-based while the unit's
      clock is right; the first fix keeps the unit's era.
    - "rcvrEeprom slows the first fix": `failure_rcvrEeprom: '{"transient":0}'`, `random` steered to factor 4 → the
      warm start's acquisition time is 4× (read through the SDK timing the search set, as `GpsAcquisition.test.ts` does).
- [ ] **Step 2: Run** both files — expected FAIL.
- [ ] **Step 3: Implement.**
  - The altitude: one private `receiverAltitude(): Feet | null` in `GPS` returning null while `hostBlocked`, used in
    `updateSolution`, `measure` and the take-home branch.
  - `reinitializeSearch`: after `saveClock()`, return while `hostBlocked`.
  - `powerChanged`: skip `initializeFromTruth` while `hostBlocked`; with `hostBlocked` and `memoryLostAtPowerOn` set
    `gpsSatComputer.internalTime = WIPED_CLOCK_MS` and `syncLastKnownPosition` 0/0 instead of the host's values, and
    start the search from 0/0.
  - `startFast`: return while `hostBlocked`.
  - `GpsSearch`: multiply mean and range in `startAcquisition` and `startBlindSearch` by `acquisitionFactor()`; `end`
    and `startSkySearchKeepingBelief` stay unscaled. `GPS` passes `() => this.failures.receiverErrors.acquisitionFactor`.
- [ ] **Step 4: Run** the two files, then `npm test` — expected PASS. `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `wip #471 rcvrInit and rcvrEeprom`.

### Task 7: `antennaGain`

**Files:**
- Modify: `kln90b/Gps.ts` (`currentNoiseRiseDb` adds `receiverErrors.antennaLossDb`)
- Modify: `kln90b/failures/FakeReceiver.ts` (`FakeReceiverInputs.antennaLossDb`, subtracted in `updateSnrs`)
- Test: `test/render/failures/AntennaGain.test.ts` (new)

**Interfaces:**
- Consumes: `receiverErrors.antennaLossDb`.

- [ ] **Step 1: Write the failing tests.** Boot with a fix; record each satellite's `signals.snr(prn)`; fail
  `antennaGain` with `random` 0.5 (10.5 dB) and run one calculation tick with the fades frozen
  (`signals.fadeScale = 0`, `jitterScale = 0`) → every SNR is 10.5 lower; STA 1 shows the lower SNRs; no message, no
  `TEST FAIL`; repair → back. With a spoofer's fake satellites (as `GpsSpoofing.test.ts` sets one up) the fake SNR is
  10.5 lower too.
- [ ] **Step 2: Run** — expected FAIL.
- [ ] **Step 3: Implement** as in Files.
- [ ] **Step 4: Run** the file and `npm test` — expected PASS.
- [ ] **Step 5: Commit** `wip #471 antennaGain`.

### Task 8: Docs, full verification, the one commit

**Files:**
- Modify: `docs/failures.md` (status paragraph; catalog table rows; "Message lines" corrected: the codes are
  different faults and combine, IM C-3; the EEPROM section: IC1045 vs 0800; sections for the receiver error word,
  each new failure, the transient rule; the battery's 0008 as a bit with `TEST FAIL`; `gpsAntenna` open/short)
- Keep: `docs/superpowers/specs/2026-11-08-receiver-hardware-errors-design.md`, this plan

- [ ] **Step 1: Update `docs/failures.md`** from the design; cite pages, paraphrase only.
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npm run build`, `npm test` — expected all clean and green; the build
  prints only the known warnings.
- [ ] **Step 3: Squash** the `wip #471` commits: `git reset --soft master` then one commit
  `fixes #471 receiver hardware error codes combine into one message; gpsAntenna open or short; new receiver failures rcvrMemory, rcvrHardware, rcvrInit, rcvrEeprom and antennaGain`
  with the Co-Authored-By trailer.
- [ ] **Step 4:** Draft the wiki failure-page text for the maintainer in the closing note (the maintainer updates the
  wiki).
