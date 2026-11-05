# Failures: framework, FLR pages and interface failures (#458) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the unit's interface failures can happen at random or by hand, persist, fail their ports and show their
messages, while nothing changes with failures off (except the planner emptied at a power-off).

**Architecture:** a data catalog of failures and a stateless `Failures` service over a new settings group; the
`Interconnect` ports ask it whether they failed, and a null-state pass lets exactly the named ports write the null
state that `SensorsOut` writes from one method. A calculation-tick trigger draws random failures over sim time, a
detector times when each failure counts as detected, and persistent messages, TEST FAIL and the FLR pages read both.

**Tech Stack:** TypeScript (es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`, FSComponent JSX), Vitest with the
project harness (`test/harness/`).

**Spec:** [docs/superpowers/specs/2026-11-04-failures-framework-design.md](../specs/2026-11-04-failures-framework-design.md)
(approved 2026-11-04), built on [docs/failures.md](../../failures.md). Read both before any task.

## Global Constraints

- With MTBF off and nothing failed, every existing test stays green unchanged, except the tests that pin the `"kln90b"`
  planner across a power-off (Task 4), which change with the maintainer's decision.
- No H event or LVar is added, renamed or changes meaning. New panel.xml key `Output.RmiInstalled`, boolean, default
  false. New persisted keys only, defaults meaning "nothing failed, MTBF off".
- Persisted values are short JSON (`""` or `{}` in this part); 50 characters is a reporting guide, not a limit.
- `DATA BASE CHECKSUM ERR` and `memory.selfTestFailure` are never touched by a simulated failure.
- The trigger and the detector read no SimVar of their own; the clock is `gps.simTimeUnix` of the current tick.
- DOM changes only in display ticks; input handlers change state only.
- `target: es2017`. Display text uppercase; page names exactly 5 characters (`FLR 1`, `FLR 2`, `FLR 3`).
- Manual references stay in comments (`3-4`, `B-2`, IM/CMM pages); never copy manual text.
- American English in code comments and docs. No counts in prose for collections that grow (CLAUDE.md, Writing).
- One `fixes #458` commit in the end (CLAUDE.md, one commit per issue). The tasks commit as `wip #458 …` on the branch
  `issue-458-failures-framework`; Task 10 folds them into the one commit. Never `git push`.
- After every task: `npx tsc --noEmit` clean and `npm test` green.

## Review Focus

1. **A failure that becomes ineligible while active** (`L:KLN90B_ObsSource` set to 0, `L:KLN90B_HeadingInput` off
   while `rs232In` is failed for the heading only): it stays on FLR 2, has no effect and no message; eligible again,
   it acts again and is detected anew. Test in Task 6.
2. **The FLR list changing under the cursor**: a random failure while FLR 3 is shown, and repairing the last entry of
   FLR 2 (the list becomes empty; `CursorController.setCursorActive(true)` throws with no fields). Test in Task 9.
3. **A stored failure the installation cannot have**: the profile was saved in an aircraft with RS-232 nav data and the
   panel.xml changed to ARINC 429 (`failure_rs232Out` is `{}`, ineligible). Boot without error, listed on FLR 2, no
   effect, not on FLR 3. Also a stored value that is not valid JSON counts as failed, not as a crash. Test in Task 1.
4. **A hot-swap disable and resume, and a long power-off, while failed**: the trigger counts no disabled or off time,
   the resume writes the failed port's null state, detection starts again after the power-on. Tests in Tasks 2, 3, 6.
5. **The power-on of a force-ready unit while failed** (engine running, no self-test): the null state is written,
   detection starts with `startMainPage`, and no TEST FAIL page exists. Test in Task 6.

---

### Task 1: The catalog, the settings group, the `Failures` service and `Output.RmiInstalled`

**Files:**
- Create: `kln90b/failures/FailureCatalog.ts`, `kln90b/failures/Failures.ts`,
  `kln90b/settings/KLN90BFailureSettings.ts`
- Modify: `kln90b/settings/KLN90BUserSettingsSaverManager.ts`, `kln90b/settings/KLN90BPlaneSettings.ts`
  (output type, parser near the annunciator keys at ~250), `cfg/panel.xml` (near line 34), `kln90b/KLN90BCore.ts`
  (constructor ~160, `asyncInit` after the parse ~254, props ~412), `kln90b/pages/Page.tsx` (`PageProps`),
  `test/harness/singletons.ts`
- Test: `test/unit/failures/FailureCatalog.test.ts`, `test/unit/failures/Failures.test.ts`,
  `test/unit/settings/KLN90BPlaneSettings.test.ts` (or the existing parser test file), `test/render/failures/FailurePersistence.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // FailureCatalog.ts
  export type FailureKey = 'arinc429Out' | 'rs232Out' | 'rmiOutput' | 'obsResolver' | 'rs232In' | 'rs232Data' | 'airdata429' | 'altitude';
  export type FailedOutputPort = 'arinc429Tx' | 'rs232Out' | 'obiBus';   // Interconnect property names
  export type FailedInputPort = 'obsResolver' | 'rs232In' | 'arinc429AirdataRx' | 'grayCode';
  export type Detection = 'internal' | 'rs232' | 'arinc429' | null;    // Task 6 timing; null = no message
  export interface FailureDefinition {
      readonly key: FailureKey;
      readonly flrName: string;               // at most 11 characters
      readonly random: boolean;
      readonly testFail: boolean;
      readonly outputs: readonly FailedOutputPort[];
      readonly inputs: readonly FailedInputPort[];
      readonly message: readonly string[] | null; // MSG page lines; null: none of its own
      readonly detection: Detection;
      isEligible(settings: KLN90PlaneSettings): boolean;
  }
  export const FAILURE_CATALOG: readonly FailureDefinition[];
  export function failureSettingName(key: FailureKey): `failure_${FailureKey}`;
  // KLN90BFailureSettings.ts
  export type KLN90BFailureTypes = { failureMtbf: number } & { [K in `failure_${FailureKey}`]: string };
  export class KLN90BFailureSettings { static getManager(bus: EventBus): DefaultUserSettingManager<KLN90BFailureTypes>; }
  // Failures.ts
  export interface FailureChangedEvents { failureChanged: { key: FailureKey, active: boolean } }
  export class Failures {
      constructor(bus: EventBus, settings: DefaultUserSettingManager<KLN90BFailureTypes>, planeSettings: KLN90PlaneSettings);
      definition(key: FailureKey): FailureDefinition;
      isActive(key: FailureKey): boolean;      // stored value !== ""
      isEligible(key: FailureKey): boolean;    // evaluated now, never cached
      isEffective(key: FailureKey): boolean;   // active && eligible
      isOutputFailed(port: FailedOutputPort): boolean; // some effective failure lists the port
      isInputFailed(port: FailedInputPort): boolean;
      activeList(): FailureDefinition[];       // active, sorted by flrName (plain string order)
      inactiveList(): FailureDefinition[];     // eligible and not active, sorted by flrName
      randomCandidates(): FailureDefinition[]; // random, eligible, not active, catalog order
      anyTestFail(): boolean;                  // some effective failure with testFail
      fail(key: FailureKey): void;             // stores "{}", publishes failureChanged {active: true}; no-op when active
      repair(key: FailureKey): void;           // stores "", publishes {active: false}; no-op when not active
      repairAll(): void;
      get mtbfHours(): number;                 // 0 = off
      setMtbfHours(hours: number): void;       // 0..999
  }
  // KLN90PlaneSettings.output gains: rmiInstalled: boolean
  // PageProps gains: failures: Failures
  ```

The catalog of this part (failures.md table, design "The catalog"):

| key | flrName | testFail | outputs | inputs | message | detection | eligible |
|---|---|---|---|---|---|---|---|
| `arinc429Out` | `429 OUTPUT` | yes | `arinc429Tx` | | `ARINC 429 OUTPUT FAIL` | internal | always |
| `rs232Out` | `RS-232 OUT` | yes | `rs232Out` | | `RS-232 OUTPUT ERROR` | internal | `dataInterface === RS232` |
| `rmiOutput` | `RMI OUTPUT` | no | `obiBus` | | null | null | `rmiInterface === OBI && rmiInstalled` |
| `obsResolver` | `OBS INPUT` | no | | `obsResolver` | null | null | `obsInterface === Analog && obsSource !== 0` |
| `rs232In` | `RS-232 IN` | no | | `rs232In` | `NO RS-232 DATA` | rs232 | see below |
| `rs232Data` | `RS-232 DATA` | no | | `rs232In` | `RS-232 DATA ERROR` | rs232 | as `rs232In` |
| `airdata429` | `429 AIRDATA` | no | | `arinc429AirdataRx` | `ARINC 429 AIR DATA FAIL` | arinc429 | `airdata.isInterfaced && airdata.interface === ARINC429` |
| `altitude` | `ALTITUDE` | no | | `grayCode` | null (Task 6: `ALTITUDE FAIL`) | arinc429 | `altimeterInterfaced && !airdata.isInterfaced` |

`rs232In` eligible: `fuelComputer.isInterfaced || (airdata.isInterfaced && (airdata.interface === RS232 || airdata.baroSource !== 0)) || (headingInput && headingInterface === RS232)`.
All entries are `random: true`.

- [ ] **Step 1: Write the failing unit tests**

`FailureCatalog.test.ts`:
- `every flrName fits FLR 2 and 3` — each `flrName.length <= 11`, uppercase, unique.
- `every message line fits the MSG page` — each line `<= 23`.
- `keys are unique and match the setting names` — `failureSettingName('rs232In') === 'failure_rs232In'`.
- `eligibility follows the plane settings` — table-driven over the eligible column: for each key one settings object
  where it is eligible and one where it is not (e.g. `rs232Out` false with `DataInterface.ARINC429`, true with `RS232`;
  `rmiOutput` false with `rmiInstalled` false; `obsResolver` false with `obsSource 0`; `rs232In` true with only
  `baroSource 1` and ARINC 429 air data, false with `baroSource 1` and no air data computer; `altitude` false with an air
  data computer).
- `eligibility reads the settings at every call` — mutate `settings.input.obsSource` from 1 to 0 and
  `settings.input.headingInput` between calls on the same object; the answer follows.

`Failures.test.ts` (own `EventBus`, as `UserWaypointV2.test.ts` does):
- `defaults: nothing failed, MTBF off` — every `isActive` false, `mtbfHours === 0`, every setting value `""`.
- `fail stores {} and publishes` — after `fail('arinc429Out')`: setting `failure_arinc429Out === "{}"`, one
  `failureChanged {key: 'arinc429Out', active: true}`; a second `fail` publishes nothing.
- `repair and repairAll` — stored `""`, events `{active: false}` only for keys that were active.
- `an ineligible active failure is active but not effective` — `rs232Out` failed with ARINC 429 nav data:
  `isActive` true, `isEffective` false, `isOutputFailed('rs232Out')` false, in `activeList()`, not in `inactiveList()`.
- `a stored value that is not JSON counts as active` — setting value `"x"` → `isActive` true, no throw.
- `lists are sorted by FLR name` — fail `rs232In`, `altitude`, `arinc429Out` → `activeList().map(d => d.flrName)`
  equals `['429 OUTPUT', 'ALTITUDE', 'RS-232 IN']`.
- `anyTestFail needs an effective TEST FAIL failure` — `rs232Out` failed with ARINC 429 nav data → false; with RS-232
  → true; `rs232In` alone → false.

Parser test: `Output.RmiInstalled` absent → false; `true` → true; `yes` → false with one problem naming the key.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/failures test/unit/settings`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the catalog, the settings group and the service**

The settings group follows `KLN90BUserRemarkSettings` (static `INSTANCE`, defs built from `FAILURE_CATALOG` plus
`failureMtbf` default 0). Add its `getAllSettings()` to `KLN90BSettingSaveManager`, build it in the `KLN90BCore`
constructor (before the save manager, so the load covers it) and clear its `INSTANCE` in `test/harness/singletons.ts`.
Build `Failures` in `asyncInit` right after `parsePlaneSettings`, before `new Interconnect`, and add it to `PageProps`.
Parse `Output.RmiInstalled` with `getBoolean` like `Output.ExternalAnnunciators.*`; add it to `cfg/panel.xml` with a
comment that only an installed RMI can fail.

- [ ] **Step 4: Write the boot-level persistence test**

`FailurePersistence.test.ts` (render stage):
- `a failure survives a new session` — boot, `props.failures.fail('arinc429Out')`, read
  `storedSetting(unit, 'failure_arinc429Out')` → `"{}"`; boot a second unit with that `storage` → `isActive` true.
- `a stored ineligible failure boots cleanly` (Review Focus 3) — `storage` with `failure_rs232Out: "{}"` and the default
  ARINC 429 panel: `errors` empty, `activeList()` contains it, `inactiveList()` does not.
- `the existing settings keep their values` — a boot with failures stored leaves `fastGpsAcquisition` and a remark as
  stored.

- [ ] **Step 5: Run the stage tests and the whole suite**

Run: `npx vitest run test/unit/failures test/render/failures` then `npm test` and `npx tsc --noEmit`
Expected: PASS, suite green, tsc clean. If seeded GPS tests drift, the settings group was built after the harness
reseeds `Math.random`: move it into the constructor.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-11-04-failures-framework-design.md docs/superpowers/plans/2026-11-04-failures-framework.md kln90b/failures kln90b/settings cfg/panel.xml kln90b/KLN90BCore.ts kln90b/pages/Page.tsx test/harness/singletons.ts test/unit test/render/failures
git commit -m "wip #458 failure catalog, settings and service"
```

---

### Task 2: The MTBF trigger

**Files:**
- Create: `kln90b/failures/FailureTrigger.ts`
- Modify: `kln90b/KLN90BCore.ts` (calc list ~373, right after `sensors`)
- Test: `test/unit/failures/FailureTrigger.test.ts`, `test/render/failures/FailureTrigger.test.ts`

**Interfaces:**
- Consumes: `Failures` (Task 1).
- Produces:
  ```ts
  export const MAX_TRIGGER_STEP_S = 60;
  export class FailureTrigger implements CalcTickable {
      constructor(bus: EventBus, failures: Failures, simTimeS: () => number, random: () => number = Math.random);
      tick(): void;
  }
  ```
  Built with `() => sensors.in.gps.simTimeUnix` (check the unit of `simTimeUnix`; convert to seconds if it holds ms).

Behavior (design "The trigger"): `dt` = sim seconds since the previous tick. The reference is cleared at every
`powerEvent` and whenever ticks were not running (detect a resume by subscribing to whatever `SimVarSync.setDisabled`
changes, or by clearing the reference in `setEnabled` of `TickController`; builder's call, but a test pins it), so the
first tick after them only sets it. `dt <= 0` or `dt > MAX_TRIGGER_STEP_S` counts nothing. With MTBF > 0: one draw
`random() < 1 - Math.exp(-dt / (mtbfHours * 3600))`; on a hit, a second draw picks
`candidates[Math.floor(random() * candidates.length)]` and calls `failures.fail`. With no candidates, nothing.

- [ ] **Step 1: Write the failing unit tests** (fake clock function, `mulberry32` from `test/harness/sim/random.ts`)

- `MTBF off never fails` — 10 000 ticks of 1 s, no failure.
- `the first tick only sets the reference` — a random source that always returns 0: first tick no failure, second
  tick fails one.
- `the rate matches the MTBF` — MTBF 1 h, `mulberry32(1)`, ticks of 1 s until 200 failures have been drawn with every
  failure repaired after its draw; the mean gap is within 10 % of 3600 s.
- `the choice is equal among candidates` — always-hit source, 3 eligible candidates, repair after each draw, 3000
  draws: each key between 900 and 1100.
- `ineligible and active failures are not drawn` — only `arinc429Out` eligible and active, always-hit: no
  `failureChanged`.
- `a clock jump counts nothing` — step of 61 s and step of -5 s with an always-hit source: no failure.
- `a power event clears the reference` — publish `powerEvent`, next tick no failure with an always-hit source.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run test/unit/failures/FailureTrigger.test.ts`, FAIL.

- [ ] **Step 3: Implement `FailureTrigger` and add it to the calc list right after `sensors`.**

- [ ] **Step 4: Write the boot-level tests** (`test/render/failures/FailureTrigger.test.ts`)

- `the trigger fails a component on the running unit` — boot, `setMtbfHours(1)`, stub the trigger's random through a
  harness hook or `vi.spyOn(Math, 'random')` to always hit: within 3 s one failure is active.
- `disabled time counts nothing` (Review Focus 4) — MTBF 1, set `L:KLN90B_Disabled` 1 for 10 min of clock, resume with
  an always-hit random from the resume on: no failure in the first tick after the resume, one in the second.

- [ ] **Step 5: Run** `npx vitest run test/unit/failures test/render/failures`, `npm test`, `npx tsc --noEmit`: PASS.

- [ ] **Step 6: Commit** `git commit -am "wip #458 MTBF trigger"` (add new files first).

---

### Task 3: Failing output ports and the null-state pass

**Files:**
- Modify: `kln90b/Interconnect.ts`, `kln90b/Sensors.ts` (`SensorsOut.setXTK` ~372, `setObs` ~338, `setPoweredOff`
  ~796, `reset` ~815, `Sensors.reset` ~870), `kln90b/SimVarSync.ts` (`setDisabled` ~80, switch-on ~64),
  `kln90b/KLN90BCore.ts` (wiring)
- Create: `kln90b/failures/FailureOutputs.ts`
- Test: `test/unit/Interconnect.test.ts`, `test/render/failures/FailedOutputs.test.ts`

**Interfaces:**
- Consumes: `Failures`, `FailedOutputPort`, `FailureChangedEvents` (Task 1).
- Produces:
  ```ts
  // Interconnect.ts
  export interface PortFailureSource { isOutputFailed(port: FailedOutputPort): boolean; isInputFailed(port: FailedInputPort): boolean; }
  export const NO_FAILURES: PortFailureSource;          // nothing ever fails
  export class Interconnect {
      constructor(settings: KLN90PlaneSettings, failures: PortFailureSource = NO_FAILURES);
      writeNullState(ports: readonly OutputPort[] | 'all', write: () => void): void;
      output(port: FailedOutputPort): OutputPort;         // the port object by its property name
  }
  // Sensors.ts, SensorsOut
  writeLVarNullState(): void;   // the L:KLN90B_* writes of setPoweredOff, nothing else
  writeGpsNullState(): void;    // the GPS SimVar writes of reset after the claim, nothing else; same early return
  writeNullState(): void;       // both
  // FailureOutputs.ts
  export class FailureOutputs {
      constructor(bus: EventBus, failures: Failures, interconnect: Interconnect, out: SensorsOut);
      writeFailedNullStates(): void; // a pass over every effectively failed output port
  }
  ```

Rules (design "The ports"):
- A `SimVarOutput` built for `arinc429Tx`, `rs232Out` and `obiBus` asks `failures.isOutputFailed(<its key>)`; the
  others never fail. `isTransmitting` is `!failed`.
- `write` passes when no pass runs and the port transmits, or when a pass runs and lists the port (or is `'all'`); it
  drops otherwise. `ApproachLampGroup.write` follows the same rule through `arm`/`actv`. `NULL_OUTPUT` always drops.
- `setXTK(null, …)` keeps feeding `xtkFilter` only outside the null path; `setPoweredOff` keeps `xtkFilter.reset()`;
  `reset` keeps the `GPS OVERRIDDEN` claim. Those state changes stay on the power path only.
- `Sensors.reset(evt)`: same order as today, with the writes inside `interconnect.writeNullState('all', …)`.
- `FailureOutputs` on `failureChanged {active: true}`: `interconnect.writeNullState(def.outputs.map(p => interconnect.output(p)), () => out.writeNullState())`.
- `SimVarSync`: after claiming `GPS OVERRIDDEN` on a resume, and on a runtime switch-on of
  `L:KLN90B_WriteGpsSimvars`, call `failureOutputs.writeFailedNullStates()` (pass it in the constructor).

- [ ] **Step 1: Write the failing tests**

`test/unit/Interconnect.test.ts`, new cases:
- `a failed port drops writes and a pass lets it through` — fake `PortFailureSource` failing `arinc429Tx`: a write
  outside a pass reaches no `SimVar.SetSimVarValue`; inside `writeNullState([arinc429Tx], …)` it does, and a write to
  `analogNav` inside that pass does not.
- `a pass over all ports writes through failed ports` — inside `'all'` both reach the sim.
- `NULL_OUTPUT drops inside a pass`.

`test/render/failures/FailedOutputs.test.ts` (reuse `record()`, `flyWith`-style setup and the tables of
`test/render/Interconnect.test.ts`; export them from a shared helper rather than copying):
- `a failed ARINC 429 port writes its null state once, then nothing` — on the standard route with RS-232 nav data off
  (default ARINC 429): after `fail('arinc429Tx' via arinc429Out)` every SimVar of that port in the table gets exactly
  one more write with its null value (`L:KLN90B_XTK` 0, `L:KLN90B_RollCommand` 0, `L:KLN90B_IntegrityWarn` false,
  `GPS WP DISTANCE` 0, `GPS FLIGHT PLAN WP COUNT` 0 and `WP INDEX` 0, …) and no write in the next 5 s; the analog port's
  SimVars keep live values and `GPS WP CROSS TRK` stays within 0.01 NM of its value before the failure (the D-bar
  filter untouched).
- `the null values equal the power-off values` — the values written at the failure equal those written at a power-off
  for the same SimVars (expected values as literals from today's `reset`/`setPoweredOff`, e.g. `GPS CDI SCALING` 5 NM
  in meters), not computed by the code under test.
- `a failed RS-232 port, a failed OBI port` — the same for `rs232Out` (with `Output.DataInterface RS232`) and for
  `rmiOutput` (`Output.RmiInstalled true`): `L:KLN90B_GPS_WP_BEARING` 0 once, then nothing.
- `a power-on while failed writes the null state` — failed, power off, power on: the port's SimVars get their null
  values at the power-on and nothing during the next 5 s.
- `a repair brings live values at the next tick`.
- `a resume writes the null state` (Review Focus 4) — failed, `L:KLN90B_Disabled` 1, `sim.set` a live-looking
  `GPS WP DISTANCE`, resume: the value is 0 again after the next poll.
- `a runtime switch-on writes the null state` — `L:KLN90B_WriteGpsSimvars` 0, fail, set it to 1: the port's GPS
  SimVars read their null values.
- `failures off: the writes are unchanged` — the existing `test/render/Interconnect.test.ts` and `SensorsOut*.test.ts`
  stay green unchanged (no new assertion; run them).

- [ ] **Step 2: Run to verify they fail** — `npx vitest run test/unit/Interconnect.test.ts test/render/failures/FailedOutputs.test.ts`.

- [ ] **Step 3: Implement the port gate, the pass, the `SensorsOut` split, `FailureOutputs` and the two `SimVarSync` calls.**

- [ ] **Step 4: Run** the two files, `npm test`, `npx tsc --noEmit`: PASS, with `Interconnect.test.ts` and
  `SensorsOut*.test.ts` unchanged.

- [ ] **Step 5: Commit** `wip #458 failing output ports and the null-state pass`.

---

### Task 4: The planner rule and the EFB route sync

**Files:**
- Modify: `kln90b/services/WTFlightplanSync.ts`, `kln90b/services/KlnEfbLoader.ts` (`loadRoute` ~34),
  `kln90b/services/KlnEfbSaver.ts` (check only), `kln90b/PowerSupply.ts` (a public `isPoweredOn(): boolean`),
  `kln90b/failures/FailureOutputs.ts`, `kln90b/KLN90BCore.ts`
- Test: `test/render/services/WTFlightplanSync.test.ts`, `test/render/services/KlnEfbLoader.test.ts` (or the existing
  EFB test file), and the planner tests across a power-off in `test/render/data/VolatileMemory.test.ts:202` and
  `test/render/harness/reboot.test.ts`

**Interfaces:**
- Consumes: `Failures`, `FailureOutputs` (Tasks 1, 3).
- Produces:
  ```ts
  // WTFlightplanSync
  constructor(bus, facilityLoader, interconnect, activeWaypoint, hardware, isPowered: () => boolean);
  sync(): void;          // FPL 0 and the direct-to plan when isPowered() && gps(navData).isTransmitting, else both empty; nothing while disabled
  ```
  `FailureOutputs` calls `wtFlightplanSync.sync()` after a failure or a repair of a failure whose outputs include the
  port `interconnect.navData` returns at that moment. `WTFlightplanSync` subscribes to `powerEvent` and calls `sync()`.

Rule (design "The planner at a failure and a power-off"): the planner holds FPL 0 only while powered and the nav data
port transmits; a power-off and a failure empty it; a power-on and a repair sync it once; while
`Hardware.isDisabled` nothing is written. The EFB loader ignores a synced route while `interconnect.navData.isTransmitting`
is false (the port itself, not the `gps()` gate); the saver already checks `gps(navData)`.

- [ ] **Step 1: Write the failing tests** in `WTFlightplanSync.test.ts`:
- `a power-off empties the planner, a power-on fills it` — standard route: after power-off
  `plannerOf(unit).getFlightPlan(0).length === 0` and no direct-to plan; after power-on and one calc tick the legs
  match FPL 0 again.
- `a failure of the nav data port empties it, the repair fills it` — `arinc429Out` with ARINC 429 nav data; and
  `rs232Out` with RS-232 nav data. A failure of the other port (`rs232Out` with ARINC 429 data) leaves it unchanged.
- `a resume while off writes empty plans` — disable (`L:KLN90B_Disabled` 1), power off, resume while still off: the
  planner is empty. `a resume while the port is failed writes empty plans` — fail `arinc429Out`, disable, resume: empty.
- `an edit of FPL 0 while failed does not reach the planner`.
- EFB test: `a synced route is ignored while the data port is failed` — fail `arinc429Out`, publish a synced route:
  FPL 0 unchanged, no `WAYPOINT … DELETED` message; the route request is unanswered.
- Update the existing tests that expect the planner to keep FPL 0 across a power-off (`VolatileMemory.test.ts:202`,
  `reboot.test.ts`) to the new rule, with a comment citing this design.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement the rule in `WTFlightplanSync`, the loader gate and the calls from `FailureOutputs`.**

- [ ] **Step 4: Run** the planner and EFB files, `npm test`, `npx tsc --noEmit`: PASS.

- [ ] **Step 5: Commit** `wip #458 planner emptied while off or the data port failed; EFB ignored while failed`.

---

### Task 5: Failing inputs and the nullable values

**Files:**
- Modify: `kln90b/Interconnect.ts` (`SimVarInput.isReceiving` for `obsResolver`, `rs232In`, `arinc429AirdataRx`,
  `grayCode`), `kln90b/Sensors.ts` (`Airdata` ~178-257, `FuelComputer` ~56-178, `SensorsIn.tick` ~277-319),
  `kln90b/controls/displays/SpeedDisplay.tsx` (`MachDisplay`), `TemperatureDisplay.tsx`, `FuelDisplay.tsx`
  (`FuelFlowDisplay`), `kln90b/pages/left/Oth5Page.tsx` … `Oth10Page.tsx`, every other reader of the changed fields
  (find them with `tsc` after the type change)
- Test: `test/render/controls/displays/*.test.ts` (the display files), `test/render/pages/left/Oth5Page.test.ts` …
  `Oth10Page.test.ts`, `test/render/failures/FailedInputs.test.ts`

**Interfaces:**
- Consumes: `PortFailureSource.isInputFailed` (Task 3).
- Produces: `Airdata.tas: Knots | null`, `mach: number | null`, `sat: Celsius | null`, `tat: Celsius | null`;
  `FuelComputer.fob: number | null` (pilot-entered FOB stays a number), `fuelFlow1/2: number | null`;
  `MachDisplay(mach: number | null)`, `TemperatureDisplay(temperature: Celsius | null)`,
  `FuelFlowDisplay(fuelFlow: number | null)`, each showing dashes of its width for null.

Rules (design "The readers of a failed input", "Nullable values"): readers check `isReceiving` once per tick. Air data
port not receiving → altitude, TAS, Mach, SAT, TAT null; gray code not receiving → altitude null; `rs232In` not
receiving → baro not read (keeps its value), the RS-232 fuel values null, the RS-232 heading null; OBS port not
receiving → `obsMag` null. A derived value (density altitude, wind, fuel figures) is dashed when an input is null.

- [ ] **Step 1: Write the failing tests**
- Display tests: `MachDisplay(null)`, `TemperatureDisplay(null)`, `FuelFlowDisplay(null)` render dashes of the width
  of a normal value (mount them as the existing display tests do).
- OTH 9 and OTH 10 with `AIRDATA` and `airdata429` failed: every value row dashed, no error; OTH 5 to 8 with
  `fuelComputer()` and `rs232In` failed: the transmitted values dashed, a pilot-entered FOB still shown.
- `FailedInputs.test.ts`:
  - `a failed gray code takes the altitude and its aiding away` — `NO_ALTIMETER` vs default: with `altitude` failed,
    `sensors.in.airdata.pressureAltitude === null` after one calc tick and `gps.solution.altitudeAided === false`.
  - `a failed RS-232 input keeps the baro` — RS-232 air data with baro source 1: `sim.set('KOHLSMAN SETTING HG:1', …)`
    after the failure does not change `airdata.barometer`.
  - `a failed OBS resolver lets the pilot set the course` — OBS mode, `obsResolver` failed: `sensors.in.obsMag === null`
    and the course entry on the unit works as with `ObsSource 0` (assert the page field as the existing ObsSource 0 test does).
  - `a failed RS-232 heading draws the map north up` — RS-232 heading, `rs232In` failed: heading null.
  - `the repair brings the values back at the next tick`.

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement the input gate, the nullable fields, the displays and the pages.**
- [ ] **Step 4: Run** the files, `npm test`, `npx tsc --noEmit`: PASS.
- [ ] **Step 5: Commit** `wip #458 failing inputs, nullable air data and fuel values`.

---

### Task 6: Detection, the failure messages and `ALTITUDE FAIL`

**Files:**
- Create: `kln90b/failures/FailureDetector.ts`
- Modify: `kln90b/data/VolatileMemory.ts` (a `failureDetection` field, reset in `reset()` at every power-on),
  `kln90b/pages/PageManager.ts` (`startMainPage` sets `memory.failureDetection.mainPageShown = true`),
  `kln90b/data/PersistentMessages.ts` (`AltitudeFailMessage` ~222, `buildPersistentMessages` ~42),
  `kln90b/KLN90BCore.ts` (calc list right after `FailureTrigger`; `PageProps` gains `failureDetector`)
- Test: `test/unit/failures/FailureDetector.test.ts`, `test/render/failures/FailureMessages.test.ts`,
  `test/render/data/VolatileMemory.test.ts`

**Interfaces:**
- Consumes: `Failures`, `FailureDefinition.detection`, `FailureDefinition.inputs` (Task 1).
- Produces:
  ```ts
  export const POWER_ON_ARINC429_DELAY_S = 5;
  export const OPERATION_DELAY_MIN_S = 2, OPERATION_DELAY_MAX_S = 10;
  export interface FailureDetectionState { mainPageShown: boolean; powerOnScheduled: boolean; detectAt: Map<FailureKey, number>; }
  export class FailureDetector implements CalcTickable {
      constructor(failures: Failures, state: () => FailureDetectionState, simTimeS: () => number, random: () => number = Math.random);
      tick(): void;
      isDetected(key: FailureKey): boolean; // effective, scheduled and the last tick's time >= detectAt
  }
  ```

Rules (design "Detection and messages"): each tick, keys that are not effective lose their schedule. Before
`mainPageShown`, nothing is scheduled. At the first tick that sees `mainPageShown` with `powerOnScheduled` false,
every effective failure with a detection gets `now` (`internal`, `rs232`) or `now + 5` (`arinc429`), and
`powerOnScheduled` becomes true. Afterwards an effective, unscheduled failure gets `now` (`internal`) or
`now + 2 + random() * 8` (`rs232`, `arinc429`). Messages: one persistent message per catalog entry with a `message`,
valid while `isDetected`. `AltitudeFailMessage`: today's configuration case, or some key among `altitude`, `rs232In`,
`rs232Data`, `airdata429` is detected and its input port is the one that carries the altitude
(`airdata.isInterfaced ? interconnect.airdata : altimeterInterfaced ? grayCode : none`).

- [ ] **Step 1: Write the failing tests**
- Unit (`FailureDetector.test.ts`, fake state, clock and random): `nothing before the main page`; `power-on order`
  (`rs232In` and `airdata429` active before: rs232 detected at the main page tick, 429 five seconds later, not at
  4 s); `operation delay` (fail after the main page with random 0 → 2 s, random 0.999 → 10 s, not before);
  `internal at the next tick`; `a repair or loss of eligibility clears the schedule and a new eligibility schedules
  anew` (Review Focus 1).
- Render (`FailureMessages.test.ts`):
  - `the bench video order at a power-on` — a panel with a fuel computer (RS-232) and ARINC 429 air data, both
    `rs232In` and `airdata429` stored as failed, `bootToSelfTest`, approve: the MSG page lists
    `NO RS-232 DATA` as soon as the first navigation page shows (within one calc tick), `ARINC 429 AIR DATA FAIL` 5 s
    later, the newer first; the MSG prompt flashes.
  - `each message` — one case per message key with the panel that makes it eligible: the message text on the MSG page.
  - `a repair removes the message`.
  - `ALTITUDE FAIL follows the failed altitude` — default panel, `altitude` failed: `ALTITUDE FAIL` after detection; a
    VFR panel too; with RS-232 air data and `rs232In` failed both `NO RS-232 DATA` and `ALTITUDE FAIL`; with ARINC 429
    air data and `rs232In` failed only `NO RS-232 DATA`; no `ALTITUDE FAIL` at boot with nothing failed (existing
    tests stay green).
  - `a force-ready boot while failed` (Review Focus 5) — engine running, `arinc429Out` stored as failed: null state
    written, message after the first calc tick, `errors` empty.
  - `a power cycle restarts detection` (Review Focus 4) — detected, power off 10 min, on: no message before the main
    page, then again by the rules.
  - `an ineligible failure shows no message` (Review Focus 1) — `rs232In` failed for an RS-232 heading only, set
    `L:KLN90B_HeadingInput` 0: the message goes, FLR 2 still lists it; set it to 1: the message returns after its delay.
- `VolatileMemory.test.ts`: `failureDetection is reset at every power-on` — a short power cycle (under `RESET_TIME`)
  clears `mainPageShown`, `powerOnScheduled` and `detectAt`.

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement the detector, the memory field, the `startMainPage` flag and the messages.**
- [ ] **Step 4: Run** the files, `npm test`, `npx tsc --noEmit`: PASS.
- [ ] **Step 5: Commit** `wip #458 failure detection and messages`.

---

### Task 7: TEST FAIL

**Files:**
- Modify: `kln90b/pages/left/SelfTestLeftPage.tsx` (~27-46)
- Test: `test/render/pages/left/SelfTestLeftPage.test.ts`

**Interfaces:** Consumes `Failures.anyTestFail()` (Task 1).

- [ ] **Step 1: Write the failing tests**
- `an active TEST FAIL failure flashes TEST FAIL` — storage with `failure_arinc429Out: "{}"`, `bootToSelfTest`: row 6
  of the left half reads `TEST FAIL` flashing (mask `F`) in place of `ANNUN ON`; `memory.selfTestFailure === null`;
  after APPROVE? the MSG page holds no `DATA BASE CHECKSUM ERR`; the approval leaves the page as after a passed test.
- `a failure without TEST FAIL shows ANNUN ON` — `rs232In` stored (with a panel that makes it eligible).
- `an ineligible TEST FAIL failure shows ANNUN ON` — `rs232Out` stored with ARINC 429 nav data.
- The #416 tests stay green unchanged.

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement** (`isTestFailed = memory.selfTestFailure !== null || props.failures.anyTestFail()` at construction). **Step 4: Run** the file, `npm test`, `npx tsc --noEmit`. **Step 5: Commit** `wip #458 TEST FAIL for an active failure`.

---

### Task 8: SET 10's button, the FLR page tree and FLR 1

**Files:**
- Create: `kln90b/pages/left/Flr1Page.tsx` (the pushed page `FlrPage`, `Flr1Page` and `FLR_PAGE_TREE`; all pages
  carry their number), `kln90b/controls/editors/MtbfEditor.tsx`
- Modify: `kln90b/pages/left/Set10Page.tsx`, `kln90b/pages/MainPage.tsx` (`openFailurePages()`, so that the SET 10
  page in the tree does not import `Flr1Page.tsx` and close an import cycle), `kln90b/pages/PageTreeController.ts`
  (the tree type widened, `FLR_PAGE_TREE` imported as a type only), `kln90b/controls/StatusLine.tsx` (`"SERVICED"` in
  `StatusLineMessage`)
- Test: `test/render/pages/left/Set10Page.test.ts`, `test/render/pages/left/Flr1Page.test.ts` (FLR 1 and the
  container), with the way to the pages in `test/harness/render/flrPages.ts`

**Interfaces:**
- Consumes: `Failures` (Task 1).
- Produces: `class FlrPage extends SixLineHalfPage implements CustomPageTreeController` (constructor `(props: PageProps)`,
  starts at FLR 1), `class Flr1Page`, `export const FLR_PAGE_TREE` with one group `[Flr1Page, Flr2Page, Flr3Page]`
  (Task 9 supplies the other two; create them as empty pages here). `MtbfEditor extends Editor<number>` with three
  `NumberEditorField`s and leading-zero cells `[0, 1]`, as `SpeedEditor`.

Screens (failures.md, FLR 1; design "UI"):
```
MTBF:   OFF        row 1: "MTBF:  " + a 4-cell field: " OFF" for 0, the hours right-aligned with "H" (" 15H", "999H")
BATTERY 100        row 2: fixed text until #461
                   rows 3-5 empty
SERVICE?           row 6: button; ENT → "CONFIRM?"; ENT again → repairAll(), status line "SERVICED"; CLR at CONFIRM? → "SERVICE?"
```
SET 10 row 2 is a `Button("FAILURES", …)`; ENT calls
`(props.pageManager.getCurrentPage() as MainPage).openFailurePages()`, which pushes `new FlrPage(props)` on the left.

- [ ] **Step 1: Write the failing tests**
- SET 10: `rows('L')[1] === 'FAILURES'`; cursor on it, ENT: the left name is `FLR 1`.
- FLR 1: `the default screen` — rows `['MTBF:   OFF', 'BATTERY 100', '', '', '', 'SERVICE?']` (trimmed as `rows`
  returns them).
- `MTBF entry` — enter 015 → row 1 `MTBF:   15H`, `failures.mtbfHours === 15`; 999 → `MTBF:  999H`; entry 000 →
  ` OFF`; CLR on the field with 15 set → ` OFF`, `mtbfHours === 0`.
- `SERVICE? needs CONFIRM?` — two failures active, ENT on SERVICE?: row 6 `CONFIRM?`, failures still active; ENT:
  none active, status line shows `SERVICED`; CLR at CONFIRM? → `SERVICE?`, failures unchanged.
- `the knobs` — inner knob right from FLR 1 shows `FLR 2`, then `FLR 3`, then wraps to `FLR 1`; outer knob pops the
  page and changes the page group as from SET 10 (assert the left name equals what an outer step from SET 10 shows
  today, read in the test from a unit without the push).

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement.** **Step 4: Run** the files, `npm test`,
  `npx tsc --noEmit` (`pageNames.test.ts` included). **Step 5: Commit** `wip #458 SET 10 FAILURES and FLR 1`.

---

### Task 9: FLR 2 and FLR 3

**Files:**
- Create: `kln90b/pages/left/Flr2Page.tsx`, `kln90b/pages/left/Flr3Page.tsx` and their shared
  `kln90b/pages/left/FailureListPage.tsx`; neither imports anything from `Flr1Page.tsx`
- Modify: `kln90b/controls/ListItem.tsx` (a confirm item
  with its own prompt and trigger, or a sibling class: builder's call)
- Test: `test/render/pages/left/Flr2Page.test.ts`, `test/render/pages/left/Flr3Page.test.ts`

**Interfaces:**
- Consumes: `Failures.activeList()`, `inactiveList()`, `fail`, `repair`, `FailureChangedEvents` (Task 1); `List`.
- Produces: a list item with `{bus, value, text, prompt: string /* 11 characters */, trigger: 'clear' | 'enter', onConfirm(value)}`.

Screens: row 1 `  ACTIVE   ` / `  INACTIVE ` (static), rows 2-6 the list (`List` height 5), each entry its `flrName`.
FLR 2: CLR on an entry → `REPAIR    ?` flashing in its place, ENT → `repair`, CLR → cancel. FLR 3: ENT on an entry →
`FAIL      ?`, ENT → `fail` (also with MTBF off), CLR → cancel. Both refresh on `failureChanged`
(`list.refresh` and `cursorController.refreshChildren`, as OTH 4 does).

- [ ] **Step 1: Write the failing tests**
- `FLR 2 lists the active failures in order` — `rs232In`, `altitude`, `arinc429Out` failed:
  rows 2-4 `429 OUTPUT`, `ALTITUDE`, `RS-232 IN`.
- `FLR 2 repairs with CLR, ENT` — cursor on `ALTITUDE`, CLR: that row `REPAIR    ?`; ENT: `altitude` not active, rows
  `429 OUTPUT`, `RS-232 IN`; CLR at the prompt cancels.
- `FLR 2 empty` — nothing failed: row 1 only, the cursor cannot be turned on (no error).
- `repairing the last entry` (Review Focus 2) — one failure, cursor on it, CLR, ENT: list empty, cursor off,
  `errors` empty.
- `FLR 3 lists the eligible, inactive failures` — panel.xml defaults (altimeter, `ObsSource 1`, analog OBS; check
  what the harness's `MINIMAL_PANEL_XML` sets): exactly `429 OUTPUT`, `ALTITUDE`, `OBS INPUT` in that order, as
  literals from the catalog table of this plan;
  `RS-232 OUT` absent with ARINC 429 nav data.
- `FLR 3 fails with ENT, ENT` — `FAIL      ?` then the failure is active and gone from FLR 3, on FLR 2; MTBF off.
- `a random failure while FLR 3 is shown` (Review Focus 2) — cursor on the second entry, `failures.fail` of another
  entry from the test: the list refreshes within a display tick, no error, the cursor on a valid entry.
- `more entries than rows scroll` — a panel where six or more failures are eligible (RS-232 nav data, an RMI, a fuel
  computer, ARINC 429 air data): the cursor reaches the last entry.

- [ ] **Step 2: Run to verify they fail.** **Step 3: Implement.** **Step 4: Run** the file, `npm test`,
  `npx tsc --noEmit`. **Step 5: Commit** `wip #458 FLR 2 and FLR 3`.

---

### Task 10: Docs, wiki drafts and the one commit

**Files:**
- Modify: `docs/failures.md` (the power-off write of a failed port now goes out; the planner emptied while off or
  failed; remove items 1, 2, 3, 8 and 9 from "What the code needs first", which this issue settles, and keep the rest
  for the later parts; in "Left to the implementation" remove the key and class names and the TEST FAIL question,
  which the design settled), `docs/architecture.md` (Core 2 calc
  list, Core 3 air data nullability, Core 4 ports and the null-state pass, `WTFlightplanSync`'s rule, Part 2 the FLR
  pages), `test/README.md` (a failure helper if Task 1–9 added one), `CLAUDE.md` only if a public-contract line changes
  (the planner rule: "mirrored from FPL 0 while the unit is on and its data output works")
- Create (not committed): the wiki drafts in the session scratchpad, `wiki-drafts-458.md`: a new page for the failures
  and the FLR pages (KLN only, jamming and spoofing best without a second GPS), panel.xml customization and RMI
  (`Output.RmiInstalled`), Accessing the Flight Plan (empty while off or the data output failed).

- [ ] **Step 1: Update the docs** as listed; no manual text, page references only.
- [ ] **Step 2: Run the full checks** — `npx tsc --noEmit` clean, `npm test` green, `npm run build` succeeds (the
  known circular-dependency and Sass warnings only).
- [ ] **Step 3: Fold the work into one commit**

```bash
git reset --soft master
git commit -m "fixes #458 failures: the failure state, the MTBF trigger, the FLR pages, failing ports and the interface failures" -m "<body: what the commit does, the planner emptied at a power-off, the design doc path>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Run: `git log --oneline master..HEAD` → exactly one commit; `git status` clean.
