# Interfaces of the inputs and outputs (#451) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Declare the physical interface of every SimVar the unit reads or writes, through panel.xml keys and port
objects, without changing any read or write.

**Architecture:** `kln90b/Interconnect.ts` holds one port object per P901 interface and resolves the routed devices
(`navData`, `rmi`, `airdata`, `obs`, `heading`) from the settings on every access. Every interface SimVar access in
`Sensors.ts`, `SimVarSync.ts`, `WTFlightplanSync.ts` and `KlnEfbSaver.ts` goes through a port. `gps(port)` replaces the
`writeGPSSimVars` checks.

**Tech Stack:** TypeScript (es2017), `@microsoft/msfs-sdk`, Vitest (unit, render stages), FakeSim.

**Spec:** `docs/superpowers/specs/2026-11-02-io-interfaces-design.md`

## Global Constraints

- No behavior change: the whole suite stays green without editing an existing assertion (adding fields to the
  parser test's `DEFAULTS` and keys to `PANEL_KEYS`/`CASES` is not editing an assertion).
- Panel keys added, never renamed; values exactly as listed, anything else a `problems` entry and the default.
- Defaults: `Input.Airdata.Interface` `RS232`, `Input.ObsInterface` `Analog`, `Input.HeadingInterface` `ARINC429`,
  `Output.RmiInterface` `OBI`, `Output.DataInterface` `ARINC429`, the four `Output.ExternalAnnunciators.*Installed`
  `false`.
- No consumer stores a routed port: access `interconnect.navData` etc. at the moment of use. Storing the
  `Interconnect` is fine.
- No allocation per write: getters and `gps()` return existing instances.
- Manual references as page numbers only; never copy manual text (CLAUDE.md).
- American English; no counts in prose for growing collections.
- One `fixes #451` commit at the end (CLAUDE.md "One commit per issue"); the tasks below stage, they do not commit.

## Review Focus

1. `L:KLN90B_WriteGpsSimvars` toggled in flight: `gps()` must follow the setting at the next write, both ways
   (Task 2 test; existing `SimVarSync` tests).
2. An existing aircraft without the new keys: no new `problems` entry, from an empty instrument and from
   `cfg/panel.xml` (Task 1 test).
3. `Input.Airdata.Interface` `ARINC429` with `BaroSource` 1: the baro still reads through RS-232 IN, the air data
   through the 429 receiver (Task 5 alternative configuration).
4. A wrong case or whitespace (`rs232`, ` RS232 `): rejected resp. accepted, as `getChoice` does (Task 1 test).
5. A unit disabled for hot swapping: the `hardware.isDisabled` checks stay exactly where they are (existing hot-swap
   tests; reviewers diff those lines).

---

### Task 1: The panel.xml keys

**Files:**
- Modify: `kln90b/settings/KLN90BPlaneSettings.ts`
- Modify: `cfg/panel.xml`
- Modify: `test/harness/panelXml.ts` (`PANEL_KEYS`)
- Test: `test/unit/settings/KLN90BPlaneSettings.test.ts`, `test/unit/harness/panelXml.test.ts` (`CASES`)

**Interfaces:**
- Produces, in `KLN90BPlaneSettings.ts`:
  - `export const enum DataInterface { ARINC429 = "ARINC429", RS232 = "RS232" }`
  - `export const enum ObsInterface { ANALOG = "Analog", ARINC429 = "ARINC429" }`
  - `export const enum RmiInterface { OBI = "OBI", ARINC429 = "ARINC429" }`
  - `KLN90PlaneSettings` fields: `input.airdata.interface: DataInterface`, `input.obsInterface: ObsInterface`,
    `input.headingInterface: DataInterface`, `output.rmiInterface: RmiInterface`,
    `output.dataInterface: DataInterface`, `output.externalAnnunciators: {msgInstalled: boolean, wptInstalled: boolean,
    armInstalled: boolean, actvInstalled: boolean}`.

- [ ] **Step 1: Write the failing tests** in `KLN90BPlaneSettings.test.ts`:
  - `DEFAULTS` gains the six fields with the defaults above.
  - `it.each` over the five interface keys: each non-default value parses (e.g. `Input.Airdata.Interface` `ARINC429`
    → `input.airdata.interface === 'ARINC429'`).
  - `'rs232'` for `Output.DataInterface` → `problems` has one line naming the key, value `'ARINC429'`.
  - `' RS232 '` (padded) for `Output.DataInterface` → `'RS232'`, no problem.
  - Each annunciator key `true` → `true`; `'1'` → problem and `false`.
  - `VFROnly` true + `ActvInstalled` true → one problem naming `Output.ExternalAnnunciators.ActvInstalled`, value
    `false`.
  - `VFROnly` false + `AppArmSwitchInstalled` false + `ArmInstalled` true → one problem naming
    `Output.ExternalAnnunciators.ArmInstalled`, value `false`; with `AppArmSwitchInstalled` true → `true`, no problem.
  - An instrument with only `<Name>` and the sample `cfg/panel.xml` → `problems` is `[]`.
  - In `panelXml.test.ts` `CASES`, one entry per new key with its non-default value.

- [ ] **Step 2: Run** `npx vitest run test/unit/settings test/unit/harness/panelXml.test.ts` — FAIL (unknown keys,
  missing fields).

- [ ] **Step 3: Implement** in `parsePlaneSettings`, with `getChoice` and `getBoolean` and a "Real unit:" comment for
  each key in the style of the existing ones (P901 pins and manual pages from the design). The strap checks go next to
  the existing VFR/approach-switch check, with the problem text in the same form
  (`"<key>: <reason>. The default false is used."`). Add the keys to `PANEL_KEYS`. Add the keys to `cfg/panel.xml` with
  their defaults and one-line comments (where `Interface` sits in `<Airdata>`, the others as new elements under
  `<Input>`/`<Output>`, the annunciators in an `<ExternalAnnunciators>` block). The comments say the keys only matter
  for the failure simulation.

- [ ] **Step 4: Run** the same command — PASS. Then `npx tsc --noEmit` — clean.

- [ ] **Step 5: Stage** `git add -A` (no commit).

### Task 2: Ports and the Interconnect

**Files:**
- Create: `kln90b/Interconnect.ts`
- Test: `test/unit/Interconnect.test.ts` (`// @vitest-environment happy-dom` if the parser is used to build settings)

**Interfaces:**
- Consumes: Task 1 settings fields and enums.
- Produces, exported from `kln90b/Interconnect.ts`:
  - `interface OutputPort { readonly name: string; readonly isTransmitting: boolean; write(simVar: string, unit:
    SimVarValueType | string, value: number | boolean | string): void }`
  - `interface InputPort { readonly name: string; readonly isReceiving: boolean; read(simVar: string, unit:
    SimVarValueType | string): any }`
  - `class SimVarOutput implements OutputPort` (`isTransmitting` always true; `write` calls `SimVar.SetSimVarValue`
    when transmitting), `class SimVarInput implements InputPort` (`read` = `SimVar.GetSimVarValue`).
  - `NULL_OUTPUT: OutputPort` (name `'none'`, never transmits, `write` does nothing).
  - `class ApproachLampGroup implements OutputPort`, constructor `(arm: OutputPort, actv: OutputPort)`, name
    `'Approach lamps'`, `isTransmitting = arm.isTransmitting || actv.isTransmitting`, `write` passes the value
    through. Its doc comment states the #366 duty: change the value for a failed lamp (ARM failed: 1 → 0, 3 → 2;
    ACTV failed: 2 → 0, 3 → 1).
  - `class Interconnect`, constructor `(settings: KLN90PlaneSettings)`, public readonly ports with these exact
    `name`s (the mapping test compares them):

    | field | name | pins (doc comment) |
    |---|---|---|
    | `arinc429Tx` | `ARINC 429 TX` | 23/24 |
    | `rs232Out` | `RS-232 OUT` | 13 |
    | `analogNav` | `Analog nav` | 18-22, 25 |
    | `obiBus` | `OBI` | 10-12 |
    | `wptAnnunciator` | `WPT annunciator` | 14 |
    | `msgAnnunciator` | `MSG annunciator` | 15 |
    | `actvAnnunciator` | `ACTV annunciator` | 16 |
    | `armAnnunciator` | `ARM annunciator` | 17 |
    | `approachLamps` | `Approach lamps` | group of 16/17 |
    | `sim` | `Sim` | fictional, never fails |
    | `arinc429EfisRx` | `ARINC 429 EFIS RX` | 4/5 |
    | `arinc429AirdataRx` | `ARINC 429 air data RX` | 8/9 |
    | `rs232In` | `RS-232 IN` | 36 |
    | `obsResolver` | `OBS resolver` | 26, 37, 31 |
    | `grayCode` | `Gray code` | 41-50 |
    | `gpsDisplayed` | `GPS DISPLAYED` | 1 |
    | `legObsControl` | `LEG/OBS CONTROL` | 33 |
    | `power` | `Power` | 40/27 |

    `sim` is an `OutputPort`; the input ports are `InputPort`s. Getters: `navData: OutputPort` (`arinc429Tx` or
    `rs232Out` by `output.dataInterface`), `rmi: OutputPort` (`obiBus` or `arinc429Tx`), `airdata: InputPort`
    (`rs232In` or `arinc429AirdataRx`), `obs: InputPort` (`obsResolver` or `arinc429EfisRx`), `heading: InputPort`
    (`arinc429EfisRx` or `rs232In`). `gps(port: OutputPort): OutputPort` returns `port` while
    `output.writeGPSSimVars`, else `NULL_OUTPUT`. The class comment states the no-stored-routed-port rule and why
    (runtime overrides through `SimVarSync`).

- [ ] **Step 1: Write the failing tests:**
  - for each getter and each setting value, the expected port (`toBe` the field);
  - mutate `settings.output.dataInterface` between two `navData` reads → the second is the other port;
  - `gps(interconnect.navData)` is `NULL_OUTPUT` with `writeGPSSimVars` false, is `arinc429Tx` after setting it true
    on the same settings object;
  - two calls of `gps(p)` and of each getter return the same instance (`toBe`);
  - `NULL_OUTPUT.write(...)` leaves no write in `simEnv().sim.writes`; `SimVarOutput.write('GPS WP DISTANCE',
    'meters', 5)` leaves one;
  - `ApproachLampGroup.write('GPS APPROACH MODE', 'enum', 3)` writes 3.
- [ ] **Step 2: Run** `npx vitest run test/unit/Interconnect.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `kln90b/Interconnect.ts`.
- [ ] **Step 4: Run** — PASS; `npx tsc --noEmit` clean.
- [ ] **Step 5: Stage.**

### Task 3: Route Sensors through the Interconnect

**Files:**
- Modify: `kln90b/Sensors.ts`, `kln90b/KLN90BCore.ts`
- Modify: `test/unit/Sensors.test.ts` (construction only)

**Interfaces:**
- Consumes: Task 2 `Interconnect`.
- Produces: `Sensors` constructor gains `interconnect: Interconnect` (after `options`) and exposes
  `public readonly interconnect`; `SensorsIn`, `SensorsOut`, `Airdata`, `FuelComputer` take it as a constructor
  parameter after `options`. `KLN90BCore.init()` builds `new Interconnect(this.planeSettings)` once, before
  `Sensors`, and keeps it for Task 4.

- [ ] **Step 1:** Change `test/unit/Sensors.test.ts` to `new FuelComputer(settings, new Interconnect(settings))`; run
  `npx tsc --noEmit` — FAIL (arity).
- [ ] **Step 2: Implement.** Every interface SimVar access in `Sensors.ts` goes through a port per the design's
  tables:
  - writes behind `writeGPSSimVars` become `this.interconnect.gps(<port>).write(...)` and the early `return`s go;
  - `GPS IS APPROACH ACTIVE` → `gps(navData)`, `GPS APPROACH MODE` → `gps(approachLamps)`, `K:GPS_OBS_ON/OFF` →
    `gps(navData)`;
  - the vertical constants and `GPS OVERRIDDEN` → `gps(sim)`; `L:KLN90B_AnnunTest` → `sim`;
  - LVars outside `writeGPSSimVars` → their fixed port directly (`arinc429Tx`, `analogNav`, `rmi`, annunciators);
  - `setPoweredOff` writes each LVar through the same port as its setter;
  - reads: `gpsDisplayed`, `obs`, `heading`, `airdata`, `grayCode`, `rs232In` (fuel, `NUMBER OF ENGINES`, baro).
  - `reset()` keeps its `writeGPSSimVars || isDisabled` guard as is (it guards the claim, not one write).
  - Split the "Real unit:" comment of `setMode`: `GPS APPROACH MODE` is the annunciator pins 16/17 and the SimVar
    the wiki documents for the lamps; `GPS IS APPROACH ACTIVE` is the digital approach state (label 261 bits 25-27,
    RS-232 item t character c), not for lamps.
- [ ] **Step 3: Run** `npx tsc --noEmit` and `npm test` — all green, no assertion edited.
- [ ] **Step 4: Stage.**

### Task 4: Route SimVarSync, WTFlightplanSync and KlnEfbSaver

**Files:**
- Modify: `kln90b/SimVarSync.ts`, `kln90b/services/WTFlightplanSync.ts`, `kln90b/services/KlnEfbSaver.ts`,
  `kln90b/KLN90BCore.ts`

**Interfaces:**
- Consumes: the `Interconnect` built in Task 3.
- Produces: each of the three constructors gains `interconnect: Interconnect`.

- [ ] **Step 1: Implement:**
  - `SimVarSync`: the electricity read through `power`, `GPS OBS ACTIVE` through `legObsControl`, both
    `GPS OVERRIDDEN` writes through `sim` (the override LVar reads are not interfaces and stay);
  - `WTFlightplanSync` and `KlnEfbSaver`: replace `!...writeGPSSimVars` with
    `!this.interconnect.gps(this.interconnect.navData).isTransmitting`;
  - `KLN90BCore` passes the instance.
- [ ] **Step 2: Run** `npx tsc --noEmit` and `npm test` — all green.
- [ ] **Step 3: Stage.**

### Task 5: The mapping test

**Files:**
- Create: `test/render/Interconnect.test.ts`

**Interfaces:**
- Consumes: `unit.props.sensors.interconnect` and the port names of Task 2.

- [ ] **Step 1: Write the test.** Wrap `write`/`read` of every port field of the booted unit's `interconnect` in
  recorders (record SimVar name upper-cased → port name, then call through). Record every `SimVar.SetSimVarValue` and
  `SimVar.GetSimVarValue` call (`vi.spyOn` on the global or `sim.writes`/`keyEvents` plus a read hook). Fly
  `bootOnStandardRoute` for a few seconds, enough for calculation and filter ticks. No approach is needed: every
  mode writes the same SimVars. Three configurations:
  - **A, defaults plus every input:** fuel computer, air data with `BaroSource` 1, heading input, `ObsTarget` 1,
    `GPS DRIVES NAV1` set to 1 in the sim. Expected ports: the design's fixed table and the defaults of the routed
    table.
  - **B, every routed key flipped:** `Output.DataInterface` `RS232`, `Output.RmiInterface` `ARINC429`,
    `Input.Airdata.Interface` `ARINC429`, `Input.ObsInterface` `ARINC429`, `Input.HeadingInterface` `RS232`, plus
    A's inputs. Expected: the routed SimVars on the other port; `KOHLSMAN SETTING HG:1` still `RS-232 IN`.
  - **C, no air data, with the LEG/OBS switch:** `PRESSURE ALTITUDE` on `Gray code`, `GPS OBS ACTIVE` on
    `LEG/OBS CONTROL`.
  Assertions per configuration: (1) no SimVar recorded on two ports; (2) every recorded pair equals the literal
  expected table (written out in the test, not computed from `Interconnect`); (3) every expected table entry was
  recorded; (4) every SimVar the sim saw written or read is either recorded by a port or in a literal
  `NOT_INTERFACES` list (front-panel LVars, override LVars, the GPS receiver's position/velocity/time reads,
  `ATC MODEL`, `ENG COMBUSTION:1`, `E:ABSOLUTE TIME`).
- [ ] **Step 2: Run** `npx vitest run test/render/Interconnect.test.ts` — PASS. Then prove it bites: temporarily write
  one SimVar in `Sensors.ts` with `SimVar.SetSimVarValue` directly and route one to the wrong port; each must turn
  the test red; restore and confirm `git diff` shows only intended changes.
- [ ] **Step 3: Stage.**

### Task 6: Docs, full verification, commit

**Files:**
- Modify: `kln90b/LVars.ts`, `docs/architecture.md`

- [ ] **Step 1:** `LVars.ts`: `L:KLN90B_AnnunTest` marked deprecated: still written as before; aircraft light their
  lamps from `GPS APPROACH MODE` (3 on the self-test) and the MSG and WPT light LVars. `docs/architecture.md`, Sensors
  section: the `Interconnect`, its ports, `gps()`, and the no-stored-routed-port rule.
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npm test`, `npm run build` — all clean (the known circular-dependency and
  Sass warnings only, no new cycle: compare the count with master).
- [ ] **Step 3: Commit** one commit:

```bash
git add -A
git commit -m "fixes #451 declare the interface of every input and output

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: Outside the repository (after the review)

- [ ] Update `E:\msfs\kln-failures.md` (not in Git): the RS-232/ARINC 429 and annunciator sections with the keys,
  the port model, the lamp group's value rule, `GPS OBS ACTIVE`, the deprecated `AnnunTest`, the alarm tone left out,
  and the matching Appendix B messages.
- [ ] Draft the wiki "panel.xml customization" text for the maintainer, in the closing message.
