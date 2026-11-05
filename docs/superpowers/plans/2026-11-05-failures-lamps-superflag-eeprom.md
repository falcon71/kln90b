# Failures: annunciators, superflag and EEPROM (#459) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The lamp failures (bulb, wiring, driver for MSG, WPT, ARM, ACTV), the NAV superflag failure and the EEPROM
failure of #459, on the #458 framework.

**Architecture:** Lamp failures change the value in the lamp ports (`LampOutput`, `ApproachLampGroup`); the superflag
becomes its own output port that fails like any #458 port; the EEPROM failure applies the unit's own calibration values
(a new EEPROM settings category, drawn once at the start) to `GPS WP CROSS TRK` and to the screen position. Wiring,
driver and superflag faults are detected from what the unit commanded (sticky flags), noticed on the Self Test page and
shown from the first navigation page.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (unit, render,
flight).

**Spec:** [docs/superpowers/specs/2026-11-05-failures-lamps-superflag-eeprom-design.md](../specs/2026-11-05-failures-lamps-superflag-eeprom-design.md)
(the design, approved 2026-11-05) and [docs/failures.md](../../failures.md) (the behavior). Read both before a task.

## Global Constraints

- `target: es2017`; no runtime feature newer than that.
- No new circular dependency: the build prints about 18 "Circular dependencies" warnings today; the count must not grow
  (`npm run build`).
- Public contract unchanged (CLAUDE.md): no LVar, H event or panel.xml key renamed or changed in meaning; persisted data
  only under new keys with defaults.
- With nothing failed, every existing test stays green unchanged and every output is written with today's values.
- Port writes allocate nothing: the failure checks loop over `FAILURE_CATALOG` like `Failures.isOutputFailed`.
- DOM changes only in display ticks.
- Comments cite manual pages (Pilot's Guide `5-31`, `IM 2-65`, `CMM 1024`); never copy manual text. American English.
  No counts in prose for things that grow.
- Commits: work-in-progress commits per task on `issue-459-lamps-superflag-eeprom` so reviewers verify committed code;
  Task 7 squashes them into the single `fixes #459 …` commit CLAUDE.md requires (one commit per issue, with its tests and
  docs). Never push.
- Commands: `npx tsc --noEmit` (clean), `npm test` (all stages), `npx vitest run <path>` (one file).

## Review Focus

1. `L:KLN90B_WriteGpsSimvars` switched off at runtime while an ARM failure is active: the failure stops being eligible
   and has no effect, nothing throws; switched on again, the lamp change resumes. Test in Task 4.
2. A dark and a stuck failure on the same lamp (possible from FLR 3): the lamp is dark. Test in Task 4 (unit) and
   Task 2 (`lampFault`).
3. A failure that arrives during the Self Test page (the MTBF trigger can fire there): a wiring fault seen there shows
   with the first navigation page. Test in Task 4.
4. A power cycle with a stuck driver: dark at the power-off, lit again after the power-on, and a wiring fault found
   again at the second power-on's self-test. Test in Task 4.
5. A hot-swap resume with the superflag failed: its null state is written at the resume. Test in Task 5.

---

### Task 1: The EEPROM settings category, the memory comments and the calibration values

**Files:**
- Create: `kln90b/settings/KLN90BEepromSettings.ts`
- Create: `kln90b/failures/EepromCalibration.ts`
- Modify: `kln90b/settings/KLN90BUserSettingsSaverManager.ts` (add the EEPROM manager's settings)
- Modify: `kln90b/KLN90BCore.ts:168-173` (draw after the load), `~264` (construct `EepromCalibration`), the `PageProps`
  literal `~432`
- Modify: `kln90b/pages/Page.tsx` (`PageProps.eepromCalibration`)
- Modify: header comments of `kln90b/settings/KLN90BUserSettings.ts`, `KLN90BUserWaypoints.ts`,
  `KLN90BUserFlightplans.ts`, `KLN90BUserRemarkSettings.ts`, `KLN90BFailureSettings.ts`
- Modify: `test/harness/singletons.ts` (clear the new `INSTANCE`)
- Test: `test/unit/failures/EepromCalibration.test.ts`, `test/render/failures/EepromSettings.test.ts`

**Interfaces:**
- Produces:
  - `type KLN90BEepromTypes = { eepromCrtCenterX: number, eepromCrtCenterY: number, eepromDbarCalPlus: number, eepromDbarCalMinus: number }`,
    all defaults 0.
  - `class KLN90BEepromSettings { static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BEepromTypes> }`
    (the `INSTANCE ??=` singleton of `KLN90BFailureSettings`).
  - `class EepromCalibration`:
    - `static drawMissing(settings: DefaultUserSettingManager<KLN90BEepromTypes>, random: () => number = Math.random): void`
    - `constructor(settings: DefaultUserSettingManager<KLN90BEepromTypes>, failures: Failures)`
    - `screenShiftXPx(): number`, `screenShiftYPx(): number`: screen pixels, 0 while `eeprom` is not effective
    - `dbarDeviation(filtered: number, fullScale: number): number`: `filtered` unchanged while `eeprom` is not
      effective (same unit in and out)
  - `PageProps.eepromCalibration: EepromCalibration`

- [ ] **Step 1: Write the failing unit tests** in `test/unit/failures/EepromCalibration.test.ts` (a fresh
  `EventBus`, `clearStatic(KLN90BEepromSettings, 'INSTANCE', false)` in `beforeEach`, a `Failures` built as in
  `FailureDetector.test.ts`). The random source is a queue; `drawMissing` consumes it in this order: X magnitude, X
  sign, Y magnitude, Y sign, gain, zero point (sign: `random() < 0.5` is negative; magnitude `2 + 4r`; gain `0.7 + 0.6r`;
  zero point `-45 + 90r` mV; plus `(300 - z) / g`, minus `(-300 - z) / g`):
  - `draws every key at 0`: queue all 0 → X `-2`, Y `-2`, plus `492.857142…` (`345 / 0.7`), minus `-364.285714…`
    (`-255 / 0.7`), `toBeCloseTo(…, 6)`.
  - `draws the far end`: queue `[0.999, 0.999, 0.999, 0.999, 0.999, 0.999]` → X and Y `toBeCloseTo(5.996, 6)`,
    plus `toBeCloseTo((300 - 44.91) / 1.2994, 6)`.
  - `leaves stored values alone`: X set to 3 and both D-bar points set before → X stays 3, Y is drawn, the D-bar points
    unchanged, and the queue is read only twice (Y magnitude and sign).
  - `draws both D-bar points when one is 0`: plus 250, minus 0 → both replaced by the draw.
  - `working EEPROM changes nothing`: points plus 200, minus -300, center 3/-5 stored, `eeprom` not failed →
    `screenShiftXPx()` 0, `screenShiftYPx()` 0, `dbarDeviation(0.7, 5)` `0.7`.
  - `failed EEPROM applies the calibration`: same values, `failures.fail('eeprom')` → `screenShiftXPx()` `-12`,
    `screenShiftYPx()` `20` (the uncorrected image is off by the opposite of the stored centering, × `ZOOM_FACTOR` 4),
    `dbarDeviation(0.7, 5)` `toBeCloseTo(1.2 * 0.7 + 60 / 150 * 5, 9)` = `2.84` (gain `600 / 500` = 1.2, zero point
    `300 - 1.2 × 200` = 60 mV).
  - `a stored 0 reads as neutral`: all keys 0, `eeprom` failed → shifts 0, `dbarDeviation(0.7, 5)` `0.7`.

- [ ] **Step 2: Run** `npx vitest run test/unit/failures/EepromCalibration.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement** `KLN90BEepromSettings.ts` and `EepromCalibration.ts` with the interfaces above. Header
  comment of `KLN90BEepromSettings`: the unit's serial EEPROM (IC1045, 256 bits), which needs no battery and holds the CRT
  centering and the D-bar calibration (CMM 67, 1024 to 1028); a property of the unit, never wiped by the battery's
  failure (#461). Comment in `EepromCalibration` on the D-bar: SET 11 calibrates at +300 and -300 mV (CMM 1027 to 1028),
  so two points give a gain and a zero point; 150 mV is full scale (IM 1-7).

- [ ] **Step 4: Run** the same file. Expected: PASS.

- [ ] **Step 5: Write the failing boot tests** in `test/render/failures/EepromSettings.test.ts`:
  - `a first start draws and stores the calibration`: `bootUnit()` with no storage → each of the four keys in
    `unit.env.storage.data` under `persistent-setting.<model>.profile_1.<key>` parses to a non-zero number (find the
    model string as `boot.ts` builds it).
  - `a stored calibration is kept`: `bootUnit({storage: {eepromCrtCenterX: 3, eepromCrtCenterY: -5, eepromDbarCalPlus: 200, eepromDbarCalMinus: -300}})`
    → the manager's four values are exactly those.
  - `the save manager includes the EEPROM`: a value set on the EEPROM manager after boot reaches the storage.

- [ ] **Step 6: Run** it. Expected: FAIL.

- [ ] **Step 7: Wire it:** add `KLN90BEepromSettings.getManager(bus).getAllSettings()` to `KLN90BSettingSaveManager`;
  in `KLN90BCore` call `EepromCalibration.drawMissing(KLN90BEepromSettings.getManager(this.bus))` right after
  `startAutoSave(saveKey)` (so the drawn values are saved); construct `new EepromCalibration(...)` next to `Failures` and
  put it in `PageProps`; add the `clearStatic` line to `test/harness/singletons.ts`.

- [ ] **Step 8: Write the header comments** saying which memory each settings class stands for (design, "What each
  settings category stands for"): `KLN90BUserSettings`, `KLN90BUserWaypoints`, `KLN90BUserFlightplans`,
  `KLN90BUserRemarkSettings` are the battery-backed nonvolatile memory that a failed battery wipes (#461), and
  `KLN90BUserSettings` names its keys that are not that memory (`userDataFormat`, `fastGpsAcquisition`, the fictional
  SET 10); `KLN90BFailureSettings` is fictional simulation state.

- [ ] **Step 9: Run** `npx vitest run test/render/failures/EepromSettings.test.ts test/unit/failures` and
  `npx tsc --noEmit`. Expected: PASS, no errors.

- [ ] **Step 10: Commit** `git add -A && git commit -m "wip #459 EEPROM settings and calibration values"`.

### Task 2: The catalog entries, the lamp question and the command flags

**Files:**
- Modify: `kln90b/failures/FailureCatalog.ts`, `kln90b/failures/Failures.ts`, `kln90b/Interconnect.ts`
  (`PortFailureSource`, `NO_FAILURES`, new `CommandedSignals`)
- Test: `test/unit/failures/FailureCatalog.test.ts`, `test/unit/failures/Failures.test.ts`,
  `test/unit/failures/CommandedSignals.test.ts`

**Interfaces:**
- Produces:
  - `type FailureKey` gains `'msgBulb' | 'wptBulb' | 'armBulb' | 'actvBulb' | 'msgWiring' | 'wptWiring' | 'armWiring' | 'actvWiring' | 'msgDriver' | 'wptDriver' | 'armDriver' | 'actvDriver' | 'superflag' | 'eeprom'`.
  - `type FailedOutputPort` gains `'superflag'`, and `Interconnect` gets the port it names:
    `superflag: OutputPort = new SimVarOutput("NAV superflag", () => this.failures.isOutputFailed('superflag'), this.pass)`
    with `output('superflag')` returning it (P901 pin 18, IM 1-7, 2-5). It carries no SimVar until Task 5 moves the
    flag writes onto it.
  - `type Lamp = 'msg' | 'wpt' | 'arm' | 'actv'`; `type LampFaultKind = 'bulb' | 'wiring' | 'driver'`;
    `type CommandedSignal = Lamp | 'superflag'`.
  - `type Detection` gains `'commandedOn' | 'commandedOff'`.
  - `FailureDefinition` gains `readonly signal?: CommandedSignal` (set for `commandedOn`/`commandedOff`) and
    `readonly lamp?: { lamp: Lamp, kind: LampFaultKind }`.
  - `PortFailureSource.lampFault(lamp: Lamp): 'dark' | 'stuck' | null`; `NO_FAILURES` returns null; `Failures`
    implements it without allocating.
  - `class CommandedSignals` (in `Interconnect.ts`): `record(signal: CommandedSignal, on: boolean): void`,
    `take(signal: CommandedSignal, on: boolean): boolean` (true when commanded that way since the last take of that
    pair, and clears it), `clear(): void`. `Interconnect.commanded: CommandedSignals`.

- [ ] **Step 1: Write the failing tests:**
  - `FailureCatalog.test.ts`: every new entry's FLR name and message lines as in failures.md's table (literals:
    `'MSG BULB'`, `'ACTV WIRING'`, `['CHECK ACTV ANNUNCIATOR']`, `['ARM ANNUNCIATOR FAIL']`, `['NAV SUPER FLAG FAILURE']`,
    `['EEPROM FAILURE: IC1045', 'EXTERNAL D-BAR INVALID']`, …); `random` true for all; `testFail` true exactly for the
    drivers, `superflag` and `eeprom`; detection: bulbs null, wirings `commandedOn` with their lamp's signal, drivers
    `commandedOff`, `superflag` `commandedOn` with signal `'superflag'`, `eeprom` `'internal'`; `superflag.outputs`
    `['superflag']`. Eligibility: `msgWiring` follows `msgInstalled`; `armDriver` needs `armInstalled` **and**
    `writeGPSSimVars` (each false alone → false; flipping `writeGPSSimVars` on the same settings object flips it);
    `superflag` and `eeprom` always.
  - `Failures.test.ts`: `lampFault('msg')` null with nothing failed; `'dark'` with `msgBulb`; `'dark'` with `msgWiring`;
    `'stuck'` with `msgDriver`; `'dark'` with `msgBulb` and `msgDriver` (Review Focus 2); null for `msgBulb` when
    `msgInstalled` is false; `lampFault('wpt')` null while only `msg…` failures are active.
  - `CommandedSignals.test.ts`: `take` false before any record; after `record('msg', true)` `take('msg', true)` true
    once, then false; `take('msg', false)` stays false; on and off both recorded between two takes are both true;
    `clear()` drops both; signals are independent.

- [ ] **Step 2: Run** the three files. Expected: FAIL.

- [ ] **Step 3: Implement** the entries (eligibility per failures.md: the lamp's `externalAnnunciators.…Installed`, for
  ARM and ACTV also `output.writeGPSSimVars`), `Failures.lampFault`, `CommandedSignals` (two booleans per signal) and
  `Interconnect.commanded`. `KLN90BFailureSettings` builds the new keys from the catalog by itself.

- [ ] **Step 4: Run** the files, `test/unit/Interconnect.test.ts` and `npx tsc --noEmit`. Expected: PASS, no errors.

- [ ] **Step 5: Commit** `wip #459 catalog entries, lampFault and the command flags`.

### Task 3: Detection from the commanded state

**Files:**
- Modify: `kln90b/failures/FailureDetector.ts`, `kln90b/data/VolatileMemory.ts:370,416-419`, `kln90b/KLN90BCore.ts:389`
- Test: `test/unit/failures/FailureDetector.test.ts` (the whole-unit detection tests come in Task 4, once the ports
  record what the unit commands)

**Interfaces:**
- Consumes: `CommandedSignals`, `FailureDefinition.signal`, `Detection` from Task 2.
- Produces: `FailureDetectionState.noticed: Set<FailureKey>` (reset at every power-on with the rest);
  `FailureDetector` constructor gains `commanded: CommandedSignals` as the parameter after `state`:
  `new FailureDetector(failures, state, commanded, simTimeS, random?)`.

- [ ] **Step 1: Write the failing unit tests** (extend the existing `plane()` with
  `externalAnnunciators` all true; every existing `state` literal gets `noticed: new Set()`):
  - `a wiring fault seen before the main page is detected at the main page`: fail `msgWiring`, `record('msg', true)`,
    tick before the main page → not detected, `state.noticed` has it; main page shown, tick → detected.
  - `a wiring fault is not detected without the lamp commanded on`: only `record('msg', false)` → never detected.
  - `a driver fault is detected in the tick that sees the lamp commanded off`: main page shown, fail `wptDriver`,
    tick → not detected; `record('wpt', false)`, tick → detected (no delay).
  - `the superflag is detected when the flag was commanded valid`: `record('superflag', true)`.
  - `a command seen while the failure was not active does not count`: `record('msg', true)`, tick, then fail
    `msgWiring`, tick → not detected (the flag was taken).
  - `the flags are cleared when the ticks stop`: `record('msg', true)`, `onTicksStopped()`, fail, tick → not noticed.
  - `a repair drops a noticed failure`.
  - `eeprom is detected at the first tick of the main page` (internal, existing rule).

- [ ] **Step 2: Run** `npx vitest run test/unit/failures/FailureDetector.test.ts`. Expected: new tests FAIL.

- [ ] **Step 3: Implement.** Before the `mainPageShown` return: for each catalog entry with a `commandedOn`/`commandedOff`
  detection, `take` its signal (always, so stale commands are dropped) and add it to `noticed` if seen and effective;
  drop non-effective keys from `noticed` alongside the existing cleanup. In the scheduling loop, an entry with a commanded
  detection never goes to `pendingS`: it moves to `detected` when it is in `noticed`, or when its signal was seen in this
  tick. `onTicksStopped` also calls `commanded.clear()`. Wire the new argument in `KLN90BCore`.

- [ ] **Step 4: Run** the unit file and `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** `wip #459 detection from the commanded state`.

### Task 4: The lamp ports

**Files:**
- Modify: `kln90b/Interconnect.ts` (`NullStatePass.isRunning`, `SimVarOutput.pass` protected, new `LampOutput`,
  `ApproachLampGroup`, the `msgAnnunciator`/`wptAnnunciator`/`approachLamps` fields)
- Test: `test/unit/Interconnect.test.ts`, `test/render/failures/LampFailures.test.ts`

**Interfaces:**
- Consumes: `PortFailureSource.lampFault`, `CommandedSignals` (Task 2).
- Produces: `NullStatePass.isRunning(): boolean`;
  `class LampOutput extends SimVarOutput { constructor(name: string, lamp: Lamp, failures: PortFailureSource, commanded: CommandedSignals, pass: NullStatePass) }`;
  `ApproachLampGroup` constructor `(arm: OutputPort, actv: OutputPort, failures: PortFailureSource, commanded: CommandedSignals, pass: NullStatePass)`.
  `LampOutput.write` calls `super.write` with the changed value, so the harness recorder (`SimVarOutput.prototype.write`
  spy) still sees the write.

- [ ] **Step 1: Write the failing unit tests** in `test/unit/Interconnect.test.ts` (a `PortFailureSource` stub whose
  `lampFault` returns a value per lamp; `SimVar.SetSimVarValue` spied):
  - `LampOutput` outside a pass: fault null writes the value; `'dark'` writes false for true; `'stuck'` writes true for
    false; every write records the **commanded** value in `commanded` (`take('msg', true)` after a dark write of true).
  - `LampOutput` inside `writeNullState('all', …)`: `'stuck'` writes false as given, and records nothing.
  - `ApproachLampGroup` outside a pass, as literals: dark ARM 1→0, 3→2; dark ACTV 2→0, 3→1; stuck ARM 0→1, 2→3; stuck
    ACTV 0→2, 1→3; dark ARM and stuck ACTV 0→2; records `arm` on for 1 and 3, off for 0 and 2, `actv` on for 2 and 3.
  - `ApproachLampGroup` inside a pass: a stuck ARM writes 0 as given.

- [ ] **Step 2: Run** `npx vitest run test/unit/Interconnect.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** with the interfaces above and wire the three fields with `this.failures`,
  `this.commanded`, `this.pass`. Comment on `LampOutput`: the stuck driver runs on the unit's own supply, so the power
  change's pass leaves the lamp dark (failures.md, Annunciators; CMM 25-26).

- [ ] **Step 4: Run** the unit file. Expected: PASS.

- [ ] **Step 5: Write `test/render/failures/LampFailures.test.ts`** (panel with all four lamps declared,
  `Output.ExternalAnnunciators.MsgInstalled` … `ActvInstalled` true, and `WriteGPSSimVars` true):
  - `a wiring fault is found at every power-on`: `bootToSelfTest({panelXml, storage: {failure_msgWiring: '{}'}})` →
    no `CHECK MSG ANNUNCIATOR` during the self-test; `approveSelfTest()`, advance 1100 ms → listed. Then
    `panel.powerOff()`, `panel.powerOn()`, through the self-test again → listed again after the main page (Review
    Focus 4, the detection half).
  - `a wiring fault failed during the Self Test page shows with the first navigation page` (Review Focus 3):
    `bootToSelfTest`, `unit.props.failures.fail('wptWiring')` while the Self Test page shows, advance 2 s,
    `approveSelfTest()`, advance 1100 ms → `CHECK WPT ANNUNCIATOR` listed.
  - `a WPT driver fault shows when the lamp is first commanded off`: `bootUnit` en route with no alert, storage
    `failure_wptDriver` → after `settle` `WPT ANNUNCIATOR FAIL` listed, and the Self Test page showed `TEST FAIL` (read
    as the #458 TEST FAIL test reads it).
  - `a bulb fault is never detected`: `msgBulb` stored, through the self-test and 30 s en route → no lamp message.
  - `a dark MSG lamp`: `msgBulb` stored, during the self-test `L:KLN90B_MSGLIGHT` reads 0 while the status line shows
    `MSG` lit (read with `test/harness/statusLine.ts`), and `L:KLN90B_ANNUNTEST` reads 1.
  - `a stuck WPT lamp`: `wptDriver` stored, en route with no alert → `L:KLN90B_WPTLIGHT` 1 at every display tick over 2 s.
  - `the approach lamps` (self-test is mode 3, en route 0): `armBulb` → 2 during the self-test; `actvWiring` → 1 during
    the self-test; `armDriver` → 1 en route; `actvDriver` → 2 en route.
  - `a stuck lamp goes dark with the unit` (Review Focus 4): `wptDriver`, `powerOff()` → last `L:KLN90B_WPTLIGHT` write
    0; `powerOn()`, through the self-test → 1 again en route.
  - `an ARM failure without WriteGPSSimVars` (Review Focus 1): `armDriver` stored, `GPS APPROACH MODE` 1 en route; set
    `L:KLN90B_WriteGpsSimvars` 0 → no further `GPS APPROACH MODE` write and `unit.errors` empty; back to 1 → 1 again.
  - `nothing failed: the lamps write today's values` — `L:KLN90B_MSGLIGHT`, `L:KLN90B_WPTLIGHT`, `GPS APPROACH MODE`
    during the self-test 1, 1, 3 and en route 0, 0, 0.

- [ ] **Step 6: Run** `npx vitest run test/render/failures/LampFailures.test.ts test/render/Interconnect.test.ts`.
  Expected: PASS.

- [ ] **Step 7: Commit** `wip #459 lamp ports`.

### Task 5: The superflag port

**Files:**
- Modify: `kln90b/Sensors.ts`
  (`setToFrom`, `writeGpsXtk`, `writeLVarNullState` write the flag SimVars through `interconnect.superflag`;
  `setToFrom` records `commanded.record('superflag', toFrom !== null)`), `kln90b/KLN90BCore.ts:294` (boot call)
- Modify: `test/harness/interconnect.ts` (`L:KLN90B_HSI_TF_FLAGS`, `GPS IS ACTIVE FLIGHT PLAN`,
  `GPS IS ACTIVE WAY POINT` → `'NAV superflag'`)
- Test: `test/render/failures/SuperflagFailure.test.ts`

**Interfaces:**
- Consumes: `Interconnect.superflag` and `CommandedSignals` (Task 2), detection (Task 3).
- Produces: the flag SimVars on `interconnect.superflag`; the GPS writes of the flag go through
  `interconnect.gps(interconnect.superflag)`.

- [ ] **Step 1: Write the failing tests** in `SuperflagFailure.test.ts`, on `offCourse()` copied from
  `FailedOutputs.test.ts` (or move that helper to `test/harness` and import it from both):
  - `a failed superflag writes the flagged values once, then nothing`: after `fail('superflag')` the writes since the
    mark hold exactly `L:KLN90B_HSI_TF_FLAGS` [0], `GPS IS ACTIVE FLIGHT PLAN` [0], `GPS IS ACTIVE WAY POINT` [0] among
    the table's SimVars; over the next 5 s none of the three is written, while `GPS WP CROSS TRK` and `GPS CDI SCALING`
    keep being written and `GPS WP CROSS TRK` stays within 0.01 NM of its value before.
  - `the repair restores the flags`: after `repair('superflag')` and one calculation tick, `L:KLN90B_HSI_TF_FLAGS` is 1
    or 2 and `GPS IS ACTIVE WAY POINT` 1.
  - `a boot with the superflag failed writes the flagged values`: storage `failure_superflag`, the sim's
    `L:KLN90B_HSI_TF_FLAGS` preset to 1 before the boot (as an instrument reload leaves it) → reads 0 after the boot.
  - `a resume writes the flagged values` (Review Focus 5): follow `FailedOutputs.test.ts` "a resume writes the null
    state" with `superflag`.
  - `NAV SUPER FLAG FAILURE shows with the first navigation page, and TEST FAIL on the Self Test page`.
  - `nothing failed: the flags are written as today` — `test/render/Interconnect.test.ts` passes with the moved table
    entries.

- [ ] **Step 2: Run** `npx vitest run test/render/failures/SuperflagFailure.test.ts test/render/Interconnect.test.ts`.
  Expected: FAIL.

- [ ] **Step 3: Implement.** Call `failureOutputs.writeFailedNullStates()` right after `new FailureOutputs(...)` in
  `KLN90BCore`, with a comment that the boot's own pass does not write the flag LVar (design, "The superflag port").

- [ ] **Step 4: Run** the two files and `test/render/failures/FailedOutputs.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit** `wip #459 superflag port`.

### Task 6: The EEPROM effects

**Files:**
- Modify: `kln90b/Sensors.ts` (`Sensors` and `SensorsOut` constructors take an `EepromCalibration`-shaped
  `DbarOutput`; `setFilteredOutputs` writes `dbarDeviation(filtered, scale)`), `kln90b/controls/PageContainer.tsx`
  (`propsReady` subscription, shift in `tick`), `kln90b/KLN90BCore.ts:293`
- Test: `test/render/failures/EepromFailure.test.ts`

**Interfaces:**
- Consumes: `EepromCalibration` (Task 1), `PageProps.eepromCalibration`.
- Produces: `interface DbarOutput { dbarDeviation(filtered: number, fullScale: number): number }` in `Sensors.ts`;
  `Sensors` gains it as the last constructor parameter with the default `{dbarDeviation: v => v}`, passed on to
  `SensorsOut`. `SensorsOut` keeps the full scale it last got in `setXTK` (NM) for the write.

- [ ] **Step 1: Write the failing tests** in `EepromFailure.test.ts` (storage `eepromCrtCenterX: 3`,
  `eepromCrtCenterY: -5`, `eepromDbarCalPlus: 200`, `eepromDbarCalMinus: -300`; the offCourse setup, 0.5 NM off the leg):
  - `the external deviation carries the uncalibrated gain and zero point`: fail `eeprom`, advance 5 s → `GPS WP CROSS
    TRK` in NM within 0.01 of `1.2 × (−L:KLN90B_XTK) + 0.4 × (GPS CDI SCALING in NM)` (gain 1.2, zero point 60 mV of
    150), while `L:KLN90B_XTK` is unchanged from before the failure (within 0.01).
  - `the zero point also shows while the deviation is flagged`: with no active waypoint (`L:KLN90B_XTK` 0) and `eeprom`
    failed → `GPS WP CROSS TRK` settles at `0.4 × 5 NM` = 2 NM.
  - `a power-off writes 0`: `powerOff()` → last `GPS WP CROSS TRK` 0.
  - `the screen shifts while failed`: after one display tick `document.getElementById('pageContainer').style.transform`
    is `'translate(-12px, 20px)'`; the screen text (`Screen.read()`) is unchanged; FLR 1 reached through SET 10 is
    shifted the same; after `repair('eeprom')` and a display tick the transform is `''`.
  - `the error pages are not shifted`: the `ErrorPage` element is not inside `#pageContainer`.
  - `messages and TEST FAIL`: `EEPROM FAILURE: IC1045` and `EXTERNAL D-BAR INVALID` in that order with the first
    navigation page; `TEST FAIL` on the Self Test page.
  - `the same values after a repair and a second failure`: fail, repair, fail → the same transform and deviation.
  - `nothing failed: GPS WP CROSS TRK as today` — equals `−L:KLN90B_XTK` in NM within 0.01 at steady state.

- [ ] **Step 2: Run** it. Expected: FAIL.

- [ ] **Step 3: Implement.** `PageContainer` keeps the last transform string and writes `style.transform` only when it
  changes (`translate(${x}px, ${y}px)`, `''` for 0/0). Pass the `EepromCalibration` to `Sensors` in `KLN90BCore`.

- [ ] **Step 4: Run** the file, `test/render/failures`, `npx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit** `wip #459 EEPROM effects`.

### Task 7: Docs, full verification and the single commit

**Files:**
- Modify: `docs/failures.md` (Status: #459 built; the ports table gets the NAV superflag port, pin 18, failed by
  `superflag`, and the analog nav row loses the flags; Detection: a commanded condition seen on the Self Test page is
  detected with the first navigation page; Annunciators: dark wins over stuck on one lamp; NAV superflag: `GPS WP
  DISTANCE` reads 0 while `GPS IS ACTIVE WAY POINT` is false; "What the code needs first" loses item 5)
- Modify: `docs/architecture.md` (the lamp ports, the superflag port, `CommandedSignals`, the settings categories and the
  memory each stands for, `EepromCalibration`)
- Modify: `test/README.md` only if a harness helper moved (the offCourse helper of Task 5)

- [ ] **Step 1: Update the docs** as listed.
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npm test`, `npm run build`. Expected: tsc clean; all tests pass; the build
  succeeds with no more circular-dependency warnings than before (count them on master first).
- [ ] **Step 3: Squash** the work-in-progress commits into one:
  `git reset --soft master && git commit` with the message
  `fixes #459 failures: the annunciator lamps, the NAV superflag and the EEPROM` plus a short body and the
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` line. The design doc, this plan and the docs are in it.
- [ ] **Step 4: Draft the wiki text** for External Annunciators (a dark lamp, a stuck lamp lit while the unit is on,
  the messages, that the screen and `L:KLN90B_AnnunTest` still tell the truth) and give it in the report, not committed.
