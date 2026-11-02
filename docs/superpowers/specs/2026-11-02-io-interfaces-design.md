# Interfaces of the inputs and outputs (#451) — design

Date: 2026-11-02. Size: a project (one `fixes #451` commit). Grouping, defaults and approach chosen by the maintainer
in the session.

## Intent

#451 is the precondition for the failure simulation (#366). On the real unit every value comes in or goes out through
one physical interface on the P901 connector: an ARINC 429 receiver or the transmitter, RS-232 IN or OUT, an analog
pin, a discrete, or the OBI bus. #366 fails interfaces, and a failed interface must affect only the SimVars it
carries. So every SimVar the unit reads or writes needs a declared interface, and the unit must know which external
annunciators exist, so that it never fails a lamp the aircraft does not have.

**#451 changes no behavior.** It adds the panel.xml keys, a model of the interfaces, and routes every interface read
and write through it. Until #366 every interface works, so every SimVar is read and written exactly as today.

The second goal is a structure that keeps #366 readable. Adding more `if`s to every setter would end in
`if (writeGpsSimVars && isRs232 && !rs232Failed)`; instead the condition lives in one object per interface.

## Goals

- New panel.xml keys, grouped by device, with defaults that need no change from existing aircraft and cause no
  nuisance failures later.
- One object per physical interface, documented with its P901 pins and the manual pages.
- Every interface SimVar read and write in the unit goes through such an object, so the code states its interface.
- The interface of a device can be switched at runtime later (a numeric LVar, as `L:KLN90B_ObsSource` does), without
  restructuring.

## Non-goals and anti-goals

- No failures, no failure state, no FLR pages, no messages (#366).
- No new runtime LVar to switch an interface. Only the structure must allow one later.
- No "both" option: a consumer is wired to one interface (see Approaches).
- No change to what is written or read, when, or with which value. A test that turns red because of this work is a bug
  in this work.
- Not a failure: a new key may never make an existing aircraft show a panel.xml problem message.

## Constraints

- Public contract (CLAUDE.md): the panel.xml keys are added, never renamed. The wiki page "panel.xml customization"
  needs the new keys; the wiki is a separate repository, so the maintainer updates it (the session drafts the text).
- Tick cost: a port adds one method call and one property read per SimVar write; no allocation per write.
- Invalid values go through the existing `problems` list of `KLN90BPlaneSettingsParser` (#145) and get the default.

## The panel.xml keys

Only devices that the real unit can take on more than one interface get a key. Everything else has a fixed interface
in code.

| Key | Values | Default | What it means |
|---|---|---|---|
| `Input.Airdata.Interface` | `RS232`, `ARINC429` | `RS232` | The air data computer: RS-232 IN fuel/air data format C or D (a Shadin, an Aspen) or the ARINC 429 air data receiver. Only read when `Input.Airdata.IsInterfaced` is true. |
| `Input.ObsInterface` | `Analog`, `ARINC429` | `Analog` | The selected course: the CDI/HSI's OBS resolver or the ARINC 429 EFIS receiver (an EFIS, a KA 90). |
| `Input.HeadingInterface` | `ARINC429`, `RS232` | `ARINC429` | The heading: the ARINC 429 EFIS receiver (an EFIS, a KA 90) or RS-232 IN format C or D. |
| `Output.RmiInterface` | `OBI`, `ARINC429` | `OBI` | The RMI bearing: the OBI bus (P901 pins 10-12) or ARINC 429 label 115 through a KA 90. |
| `Output.DataInterface` | `ARINC429`, `RS232` | `ARINC429` | The digital navigation data an EFIS, a distance indicator or a moving map shows: position, ground speed, track, distance, waypoints, flight plan. |
| `Output.ExternalAnnunciators.MsgInstalled` | `true`, `false` | `false` | A remote MSG lamp on P901 pin 15. |
| `Output.ExternalAnnunciators.WptInstalled` | `true`, `false` | `false` | A remote WPT lamp on pin 14. |
| `Output.ExternalAnnunciators.ArmInstalled` | `true`, `false` | `false` | The ARM lamp of the GPS APR switch-annunciator on pin 17. |
| `Output.ExternalAnnunciators.ActvInstalled` | `true`, `false` | `false` | The ACTV lamp on pin 16. |

Reasons for the defaults:
- `Output.DataInterface` `ARINC429`: both EFIS units aircraft developers pair with the KLN prefer it. The Aspen EFD1000
  E5 takes the KLN 90/A/B either on ARINC 429 or on RS-232 "GPS TYPE 1", and its manual calls 429 the preferred
  connection, since RS-232 carries no GPSS (Aspen install manual 900-00041-001 Rev F, 5.4.2 and figure 9-13). The G5
  shows a navigator's data only through a GAD 29 on ARINC 429 (G5 install manual 190-01112-10 Rev 11, 1.6.2.3). A
  classic panel shows the digital values only on a distance indicator, which is fed by 429 too (Installation manual
  2-69). A Garmin or Aspen does not take one navigator on both interfaces, so there is no "both".
- `Input.Airdata.Interface` `RS232`: the common GA air data source with a KLN 90B is a Shadin, or an Aspen sending
  format C into pin 36 (Aspen figure 9-27).
- Annunciators `false`: no nuisance failures in aircraft that did not declare their lamps. The LVars are still written
  for every annunciator, declared or not, as today (backwards compatibility). The key only decides whether #366 may
  fail it.

Validation, my call (the strapping of Installation manual 2-6, figure 2-17 sheet 8): pin 16 carries the VFR strap and
pin 17 the IFR en route strap, so they cannot drive a lamp then.
- `VFROnly` true with `ActvInstalled` true: a problem, the default `false` is used.
- `VFROnly` false and `AppArmSwitchInstalled` false with `ArmInstalled` true: a problem, `false` is used.

Value spelling follows the existing keys: exactly as listed, anything else is a problem.

## The fixed interfaces

From the "Real unit:" comments that already name each value's interface in `Sensors.ts`, `SimVarSync.ts`,
`WTFlightplanSync.ts`:

| Interface (P901 pins) | Values |
|---|---|
| Power, pins 40/27 | `Input.ElectricitySimVar` |
| Discrete GPS DISPLAYED, pin 1 | `GPS DRIVES NAV1` (both reads) |
| Discrete LEG/OBS CONTROL, pin 33 | `GPS OBS ACTIVE` read |
| Gray code, pins 41-50 | `PRESSURE ALTITUDE` without an air data computer |
| RS-232 IN, pin 36 | the fuel computer reads; `KOHLSMAN SETTING HG` (baro, format D only) |
| Analog nav, pins 18-22, 25 | `GPS WP CROSS TRK`, `L:KLN90B_HSI_TF_FLAGS`, `GPS CDI SCALING`, `GPS IS ACTIVE FLIGHT PLAN`, `GPS IS ACTIVE WAY POINT` |
| ARINC 429 TX, pins 23/24 | `K:VOR1_SET`/`K:VOR2_SET` (label 100), `L:KLN90B_XTK` (116), `L:KLN90B_RollCommand` (121), `L:KLN90B_IntegrityWarn` (261), `GPS WP ETE` (252), `GPS ETE` (352) |
| Annunciator pins 14, 15 | `L:KLN90B_WptLight`, `L:KLN90B_MsgLight` |
| Annunciator pins 16, 17 | `GPS APPROACH MODE`, through the approach lamp group (below) |

**Approach lamp group (maintainer's decision).** `GPS APPROACH MODE` carries both the ARM lamp (pin 17) and the ACTV
lamp (pin 16); it is the SimVar the wiki documents for aircraft to light their lamps, and expecting aircraft authors to
move to new per-lamp LVars is not realistic. So it is written through one group port over the ARM and ACTV ports. In
#451 it passes every write through. In #366 the group changes the value for a failed lamp instead of dropping the
write (ARM failed: mode 1 becomes 0, the self-test 3 becomes 2), so the writers stay unchanged. The group's API must
allow that: it receives the value, not only a go/no-go.

**`GPS IS APPROACH ACTIVE` is data, not a lamp (maintainer's decision).** It is not documented for lamps, so it is
routed with `Output.DataInterface` (ARINC 429 label 261 bits 25-27, RS-232 item t character c). The "Real unit:"
comment on `SensorsOut.setMode` is split accordingly: `GPS APPROACH MODE` is the annunciator pins 16/17 for the lamps,
`GPS IS APPROACH ACTIVE` the digital approach state.

**`L:KLN90B_AnnunTest` is deprecated (maintainer's decision).** The self-test already lights every lamp through the
lamp SimVars (`GPS APPROACH MODE` 3, the steady WPT light, the MSG light). It keeps today's behavior, written through
the never-failing `sim` port, and `LVars.ts` and the wiki mark it deprecated. It is not removed (public contract).

**`GPS OBS ACTIVE` is not a lamp.** The unit has no OBS or LEG lamp output; its only annunciator pins are 14-17. With
a GPS CRS switch, the switch's own contacts light its OBS and LEG lamps and the unit reads pin 33 (discrete input, not
written). Without the switch, the unit sends LEG or OBS only as ARINC 429 label 075 bit 9 and RS-232 item t, which an
EFIS shows (the Aspen reads bit 9, its table 8-2), so `K:GPS_OBS_ON/OFF` is routed with `Output.DataInterface`. An
aircraft lighting panel lamps from it without a declared switch has fictional lamps, which never fail as lamps.

My calls where a value has a digital alternative but stays fixed: `L:KLN90B_XTK` is documented in `LVars.ts` as
"ARINC label 116", so it stays on the 429 transmitter even with `Output.DataInterface` `RS232`. `GPS CDI SCALING` goes
with the analog deviation `GPS WP CROSS TRK` it scales (label 326 would be the EFIS's). `L:KLN90B_MsgLight` and
`WptLight` are documented as external annunciators, so they are the lamp pins, not label 275 or RS-232 item t.

Routed by a key:
- `Output.DataInterface`: `GPS POSITION LAT/LON`, `GPS GROUND SPEED`, `GPS GROUND TRUE/MAGNETIC TRACK`, `GPS MAGVAR`,
  `GPS WP DISTANCE`, `GPS WP DESIRED TRACK`, `GPS WP BEARING`, `GPS WP TRUE BEARING`, `GPS OBS VALUE`,
  `GPS FLIGHT PLAN WP COUNT/INDEX`, `GPS WP NEXT *`, `GPS WP PREV *`, `K:GPS_OBS_ON/OFF`, `GPS IS APPROACH ACTIVE`,
  the SDK planner `"kln90b"`
  (`WTFlightplanSync`) and the EFB route answer (`KlnEfbSaver`).
- `Output.RmiInterface`: `L:KLN90B_GPS_WP_BEARING`.
- `Input.Airdata.Interface`: `PRESSURE ALTITUDE`, `AIRSPEED TRUE`, `AIRSPEED MACH`, `AMBIENT TEMPERATURE`,
  `TOTAL AIR TEMPERATURE` with an air data computer.
- `Input.ObsInterface`: `Nav OBS:1/2`. `Input.HeadingInterface`: the heading SimVar.

Fictional values go with the real value they are derived from: `GPS WP ETA` with `GPS WP ETE`, `GPS ETA` with
`GPS ETE`, `GPS COURSE TO STEER` with the roll command, `GPS WP TRACK ANGLE ERROR` with the desired track.
Constants with no counterpart (`GPS GSI SCALING`, `GPS VERTICAL *`, `GPS HAS GLIDEPATH`) and `GPS OVERRIDDEN` go on a
port that never fails, named for what it is (the sim, not the unit).

Not interfaces, so not routed: the front-panel controls (`L:KLN90B_Power`, `RightScan`, `Brightness`,
`L:KLN90B_Disabled`, `L:KLN90B_AlertVolume`), the panel.xml override LVars, the GPS receiver's reads of the sim's
position, velocity and time (`Gps.ts`, `GpsMeasurement.ts`: the antenna is a coax, not a P901 interface; jamming and
spoofing in #366 act on the receiver), `ATC MODEL`, `ENG COMBUSTION:1`. The altitude alert tone (pins 38/39) is a
sound, not a SimVar; it is left out and noted in the #366 draft.

## Approaches

**A. Port objects (chosen).** One object per physical interface. At boot and on every access, the settings decide
which port a device uses. Writers write through the port; a disabled path is a null port that drops writes.
- Reads like the interconnect drawing, keeps the "Real unit:" comments next to the code, and #366 adds one check in
  one place per interface.
- Costs one method call per write and touches every SimVar access in the listed files once.

**B. Declarative signal table.** One table of every signal with its interface; writes go through
`signals.write(ID, value)`. Documents the mapping in one place, but string/enum ids add indirection, and the comments
drift away from the code that computes the value.

**C. Central gate booleans.** An object computes `canWriteNavData` and similar; each setter keeps one flat `if`. The
smallest change, but the `if`s stay scattered and #366 touches every one.

The maintainer chose A, and asked that each interface object document the pins it stands for.

## The structure

A sketch to build from; names are the builder's to refine.

```ts
/** One physical output of the unit */
interface OutputPort {
    /** False while nothing leaves this interface. Always true until #366 */
    readonly isTransmitting: boolean;
    write(simVar: string, unit: SimVarValueType, value: number | string | boolean): void;
}

/** One physical input of the unit */
interface InputPort {
    readonly isReceiving: boolean;
    read(simVar: string, unit: SimVarValueType): any;
}
```

- One class or instance per interface, each with a doc comment naming its P901 pins, its labels or items and the
  Installation manual pages. The existing "Real unit:" comments at the call sites stay; they explain the value, the
  port's comment explains the wire.
- A null output port whose `isTransmitting` is false and whose `write` does nothing.
- `Interconnect` (the name of the real unit's wiring drawing, figure 2-17) owns the ports and the routing:
  - the physical ports as fields: `arinc429Tx`, `arinc429EfisRx`, `arinc429AirdataRx`, `rs232Out`, `rs232In`,
    `analogNav`, `obsResolver`, `obiBus`, `grayCode`, the discretes, the four annunciators, `power`, `sim`;
  - device getters resolved from the settings **on every access**: `navData`, `rmi`, `airdata`, `obs`, `heading`;
  - `gps(port)`: the port while `Output.WriteGPSSimVars` is set, the null port otherwise. This replaces the
    `if (!this.options.output.writeGPSSimVars) return;` lines; `WriteGPSSimVars` is a property of the sim's GPS
    SimVars, not of an interface, so it stays separate from the ports.
- One `Interconnect` is built in `KLN90BCore.init()` and passed to `Sensors`, `SimVarSync`, `WTFlightplanSync`,
  `KlnEfbSaver`. Whether it also goes into `PageProps` is the builder's call (only if a page needs it).

**The rule that keeps runtime switching open: no consumer stores a port.** Every access goes through
`interconnect.navData` (or another getter) at the moment of the write. `SimVarSync` already writes runtime overrides
into the settings object (`L:KLN90B_WriteGpsSimvars` toggles `WriteGPSSimVars` in flight today), so a later
`L:KLN90B_DataInterface` only changes one settings field. Side effects of a switch (today: `GPS OVERRIDDEN` and
`wtFlightplanSync.sync()` when `WriteGPSSimVars` turns on) stay where they are in this work; a later switch hook on
`Interconnect` is for whoever adds the first runtime interface switch.

How #366 then plugs in (not built now): each port asks a failure state whether its interface failed, and
`isTransmitting`/`isReceiving` include that. Writers do not change. Readers that must react to a dead input (show
dashes, raise a message) check `isReceiving` once, at the top of their read.

## Tests

- Parser (`test/unit/settings/KLN90BPlaneSettings.test.ts`): each new key's default, each valid value, an invalid
  value giving a problem and the default, and the two strapping conflicts.
- `Interconnect` (unit): each device getter for each setting; a settings change between two accesses returns the
  other port (the runtime-switch rule); `gps()` returns the null port while `WriteGPSSimVars` is false, also after a
  runtime change.
- The mapping (render stage, where `Sensors` runs against `FakeSim`): record which port each SimVar was written or
  read through while the setters and a tick run, and compare against a literal table of SimVar → interface (the two
  tables above). Also assert that no interface SimVar reached `FakeSim` without a port. This is the test that holds
  "it must be clearly defined which interface a SimVar uses".
- No behavior change: the whole suite stays green without editing an existing assertion.

## Docs

- `cfg/panel.xml`: the new keys with comments, in the style of the existing ones.
- `kln90b/LVars.ts`: `L:KLN90B_AnnunTest` marked deprecated, pointing at `GPS APPROACH MODE` 3 and the lamp LVars.
- `docs/architecture.md`: the `Interconnect` and the no-stored-port rule in the Sensors section.
- The wiki text for "panel.xml customization", drafted for the maintainer.
- The #366 draft spec (`E:\msfs\kln-failures.md`, not in Git): its RS-232/ARINC 429 and annunciator sections updated
  at the end of the session.

## Left to the builder

- File layout (one `kln90b/Interconnect.ts` or a folder), class vs instance per port, exact names.
- How the mapping test records port use (spy ports or a recording `FakeSim` hook).
- Whether `SensorsIn`/`Airdata`/`FuelComputer` take the `Interconnect` or keep `options` and get it added.
