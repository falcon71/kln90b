# Failures: the framework, the FLR pages and the interface failures (#458) — design

Date: 2026-11-04. Size: a project, one `fixes #458` commit on the branch `issue-458-failures-framework`. Part 1 of
#366. The behavior is specified in [docs/failures.md](../../failures.md); this document says how part 1 builds it and
settles what that document leaves open for this part. Where the two disagree, this document wins for #458 and
`failures.md` is updated in the same commit.

## Intent

The unit can fail the way a real KLN 90B fails, so that a pilot practices noticing a failure, reading the message and
navigating by other means (failures.md, Intent). Part 1 lays the base the later parts (#459 lamps, superflag and EEPROM;
#460 receiver, jamming, spoofing and the faulty satellite; #461 the battery) build on: the persisted failure state, the
random trigger, the FLR pages, the TEST FAIL path, ports that fail, and the interface failures with their messages.

## Goals

- The failure state persisted in its own settings manager: the MTBF and the active failures (failures.md, Persistence).
- The MTBF trigger over powered sim time, with an injectable random source and clock (The failure rate).
- Eligibility evaluated at every use, the runtime LVars included (The failure catalog).
- SET 10's `FAILURES` button and the fictional pages FLR 1 to 3 (UI).
- TEST FAIL for an active failure, separate from the start-up failure of #416.
- Failing ports: a failed output writes its null state once and then nothing; a failed input reports `isReceiving`
  false (A failed port in general).
- The interface failures `arinc429Out`, `rs232Out`, `rmiOutput` (with the new panel.xml key `Output.RmiInstalled`),
  `obsResolver`, `rs232In`, `rs232Data`, `airdata429` and `altitude`, with their messages and detection timing.
- Nullable air data and fuel values (OTH 5 to 10 show dashes). `ALTITUDE FAIL` follows the altitude that arrives.

## Non-goals

- The failures of #459, #460 and #461. Their catalog entries are added by those issues. Until then FLR 3 and the
  random draw offer only the failures built here (maintainer, 2026-11-04).
- The battery. FLR 1 shows `BATTERY 100` as fixed text until #461 gives it a state (maintainer, 2026-11-04).
- A sim test. The zeroing of every port and the hot-swap crash sequence were tested in the sim on 2026-11-03
  (`docs/sim-flight-record.md`, #462); the maintainer confirmed on 2026-11-04 that no further sim test is needed for
  this issue. The issue text that asks for one is outdated.

## Anti-goals

- **Any change while failures are off.** With MTBF off and nothing failed, every existing test stays green unchanged
  and every output is written with the values it has today. One exception, decided by the maintainer: with
  `Output.WriteGPSSimVars` set, a power-off now empties the SDK planner `"kln90b"` (see "The planner at a failure and a
  power-off"), so the tests that pin the planner across a power-off change with it.
- `DATA BASE CHECKSUM ERR` from a simulated failure: it stays reserved for #416.
- A failure listed or drawn that has no effect: only built failures are in the catalog (above), and only eligible ones
  are offered.

## Constraints

- The public contract (CLAUDE.md): no H event or LVar changes; one new panel.xml key with a default; new persisted
  keys only, with defaults meaning "nothing failed, MTBF off".
- Tick cost: the trigger and the detection run in the 1 Hz tick and must stay negligible. They read no SimVar of their
  own (see the clock below).
- `target: es2017`; DOM changes only in display ticks.
- One commit per issue: the whole part is one `fixes #458` commit with its tests and docs.

## Approaches

The one open choice of structure was how a failing output port writes its null state once and then stays silent. Today
the null state is spread over `SensorsOut.setPoweredOff` (the `L:KLN90B_*` outputs) and `SensorsOut.reset` (the GPS
SimVars, only with `Output.WriteGPSSimVars` and not while disabled), and those setters also change state (the D-bar
filter, `obsOut`) and claim `GPS OVERRIDDEN`.

1. **Replay the existing null state through only the failing port (chosen by the maintainer).** `Interconnect` gets a
   null-state pass in which the named ports write although they failed, and every other port drops its writes.
   `SensorsOut` writes the null state from one method, built from the write parts of `setPoweredOff` and `reset` with
   the state changes moved out. A power change runs the same pass over every port. One definition of the null state, and
   exactly the power-off values (`GPS CDI SCALING` 5 NM, not 0). The maintainer's reasoning: turning the unit off and
   failing a port are the same thing for the wire, so they share the path.
2. A declared null table per port, written at the failure. Rejected: it duplicates what `reset` knows, and a SimVar
   added to a setter later is missed unless a test cross-checks the table.
3. Ports remember what they wrote and zero it. Dropped: a port failed since boot has written nothing, so nothing would
   be zeroed, and zero is the wrong null value for some SimVars (the CDI scaling).

The structure of the failures as a whole (a failure state the ports ask, effects hooked into the class that owns the
behavior) was chosen in failures.md (Approaches) and is not reopened here.

## The structure

### The catalog

`kln90b/failures/FailureCatalog.ts` (name: builder's call) declares each built failure as data: its key (persisted,
never renamed, as in failures.md), its FLR name, whether the random trigger may draw it, whether it shows TEST FAIL, the
ports it fails, and `isEligible(planeSettings)`. The later parts append entries. Eligibility for this part:

| Key | Eligible when | TEST FAIL | Fails |
|---|---|---|---|
| `arinc429Out` | always | yes | output `arinc429Tx` |
| `rs232Out` | `output.dataInterface` is `RS232` | yes | output `rs232Out` |
| `rmiOutput` | `output.rmiInterface` is `OBI` and `output.rmiInstalled` | no | output `obiBus` |
| `obsResolver` | `input.obsInterface` is `Analog` and `input.obsSource` is not 0 | no | input `obsResolver` |
| `rs232In`, `rs232Data` | a fuel computer, air data on `RS232`, air data with a baro source not 0, or `input.headingInput` with `input.headingInterface` `RS232` | no | input `rs232In` |
| `airdata429` | air data interfaced on `ARINC429` | no | input `arinc429AirdataRx` |
| `altitude` | `input.altimeterInterfaced` and no air data computer | no | input `grayCode` |

The baro source counts only with an air data computer, because `Airdata.tick` reads the baro only then. All are random
failures. `input.obsSource` and `input.headingInput` change at runtime (`SimVarSync`), which is why eligibility is a
function and never cached.

### The failure state

- **Persistence.** A settings group `KLN90BFailureSettings` with `getManager(bus)` and a static `INSTANCE`, like the
  remark and flight plan groups, concatenated into `KLN90BSettingSaveManager`, so it loads and auto-saves under the
  same profile key. Its `INSTANCE` is cleared in `test/harness/singletons.ts`. It is built in the `KLN90BCore`
  constructor with the other groups, which keeps the seeded random draws of the tests where they are (test/README.md).
  The keys (names: builder's call): the MTBF in hours (number, 0 = off), and one string per failure key, `""` for not
  failed and a JSON object of the drawn values otherwise (`{}` for the failures of this part, which draw nothing). The
  later parts store their drawn values in the same string. One key per failure keeps a failure independent of the
  others when the catalog grows, and a JSON value lets #460 add drawn values without a new key format (my call,
  confirmed by the maintainer, 2026-11-04).
- **Short values.** Long user setting values are known to corrupt the stored settings, at a limit nobody knows, so the
  values stay short JSON. 50 characters is a guide for reporting, not a hard limit: the flight plan values are much
  longer (maintainer, 2026-11-04). In this part a value is `""` or `{}`, and the MTBF a number up to 999. The longest
  value of the later parts, spoofing's false position and time shift, is about 48 characters
  (`{"lat":-12.345678,"lon":-123.456789,"dt":-43200}`), which the maintainer accepted as it is.
- **The service.** `Failures` (name: builder's call), built in `asyncInit` once the plane settings are parsed and before
  the `Interconnect`, which needs it. It holds no state of its own: it reads and writes the settings group. It offers
  `isActive(key)`, `isEffective(key)` (active and eligible: a failure that became ineligible stays active and listed on
  FLR 2 but has no effect, failures.md), the eligible and active lists for the FLR pages, `fail(key)`, `repair(key)` and
  `repairAll()`. A change publishes a bus event (for example `failureChanged`) with the key and the new state. It goes
  into `PageProps`.

### The trigger

- A calculation tickable placed right after `sensors` in the calc order.
- **The clock** is the sim time the GPS already read in this tick (`gps.simTimeUnix`, from `E:ABSOLUTE TIME`), passed
  in as a function, so the trigger reads no SimVar of its own and follows the sim rate. The tick intervals are real
  time and do not speed up with the sim rate, so `dt` must come from the sim time, not from `TICK_TIME_CALC`.
- `dt` is the difference to the previous tick's sim time. The first tick after a power-on, a hot-swap resume or a
  restore only sets the reference, so off and disabled time never counts. A step of 0 or less, or above 60 s, is a
  clock jump and counts nothing (the rule of `SustainedCondition`). My call: a sim date set ahead must not fire a
  failure at once.
- In each counted tick a failure happens with probability `1 - exp(-dt / (MTBF × 3600))`. It then picks with equal
  chance among the failures that are random, eligible and not active; with none, nothing happens.
- **The random source** is injected (default `Math.random`); the unit tests pass `mulberry32`.
- `E:ABSOLUTE TIME` runs on in the active pause, so failures can happen while paused. Accepted by the maintainer
  (2026-11-04).

### The ports

- `SimVarOutput.isTransmitting` and `SimVarInput.isReceiving` ask a function given to the port by the `Interconnect`:
  false while a failure that fails this port is effective. `NULL_OUTPUT`, `sim`, `analogNav` and the annunciator ports
  never fail in this part; `ApproachLampGroup` is untouched until #459.
- **The null-state pass.** `Interconnect.writeNullState(ports, write)` runs `write` with a pass: inside it a port in
  `ports` writes even though it failed, and every other output port drops its writes. Outside a pass, a port writes only
  while transmitting. A pass over every port is the power-change case. JS is single-threaded and the pass is
  synchronous, so a flag in the `Interconnect` is enough.
- **`SensorsOut.writeNullState()`** writes the null state of every output and changes no state: the `L:KLN90B_*`
  writes of `setPoweredOff` and, while `Output.WriteGPSSimVars` is set and the unit is not disabled, the GPS SimVar
  writes of `reset`, through the `gps()` gate as today. The state changes move out of the null path: the D-bar filter
  (`xtkFilter.setValue` in `setXTK(null)`, `xtkFilter.reset` in `setPoweredOff`), `obsOut`, and the `GPS OVERRIDDEN`
  claim (it is on the `sim` port, which never fails). How the setters are split is the builder's call; the result must
  write the same values as today.
- **At a power change** `Sensors` keeps today's sequence and its state changes, and writes the null state in a pass
  over every port. So at a power-on while failed, the failed port writes its null state once, and the power-off write
  of a failed port goes out too. failures.md says that write "is dropped, which is fine"; it now goes out with the same
  values, which is equally fine and keeps one path. failures.md is changed to say so.
- **At the moment of a failure** a subscriber to the failure event (in `SensorsOut`, or a small class beside it)
  writes the null state in a pass over the outputs the failure fails. Inputs need nothing.
- **When the unit claims the GPS SimVars again** (the hot-swap resume in `SimVarSync.setDisabled(false)`, and
  `L:KLN90B_WriteGpsSimvars` switched on at runtime) the failed output ports write their null state in a pass. Their
  GPS SimVars would otherwise keep what the other unit or the sim's own GPS last wrote, the frozen guidance failures.md
  sets out to prevent. My call, from the maintainer's rule that a failed port behaves as a switched-off one. The
  sequence is the null state of case A of the 2026-11-03 sim test (`WP COUNT` / `WP INDEX` 0 / 0), which did not crash
  at a hot swap; the resume itself was not part of that test.
- **The SDK planner `"kln90b"`** travels on the nav data port (`WTFlightplanSync` already asks
  `gps(navData).isTransmitting` on a change). It is emptied at the failure and at a power-off, and synced at the repair
  and at a power-on (see "The planner at a failure and a power-off").
- **The EFB route sync** is ignored in both directions while the port that carries the nav data is failed (maintainer,
  2026-11-04): `KlnEfbSaver` answers no route request (it already asks `gps(navData).isTransmitting`), and
  `KlnEfbLoader` loads no synced route into FPL 0. The loader asks the port itself, `navData.isTransmitting`, not the
  `gps()` gate, because it loads today whatever `Output.WriteGPSSimVars` says, and that must not change.
- **A repair** otherwise needs nothing: the next tick writes live values again.
- **The readers of a failed input** check `isReceiving` once per read cycle and treat the values as missing:
  - `Airdata`: with the air data port not receiving, `pressureAltitude`, `tas`, `mach`, `sat` and `tat` are null; with
    the gray code not receiving, `pressureAltitude` is null. With `rs232In` not receiving, the baro is not read and keeps
    its last value (the pilot can set it).
  - `FuelComputer`: with `rs232In` not receiving, every value that arrives on RS-232 is null. A FOB the pilot entered
    (`FOBTransmitted` false) is not a received value and stays.
  - `SensorsIn`: with the OBS port not receiving, `obsMag` is null, which already means "course set on the unit"
    (`obsSource` is read nowhere else); with the heading port not receiving, the heading is null.

### The planner at a failure and a power-off

The maintainer's point (2026-11-04): the KLN stops sending the flight plan, which technically empties it on the
receiving side. The EFIS manuals the maintainer supplied (Aspen Evolution E5 installation manual and pilot guide, Garmin
G5 installation manual and pilot guide) were checked on 2026-11-04:

- The E5 lists the KLN 90B as a compatible GPS on ARINC 429 and RS-232, but takes only the live navigation values from
  it (DTK, XTK, bearing, distance, roll command and so on), not the waypoint labels, and has no map. The G5 takes no
  flight plan either and does not name the KLN.
- When the GPS data stop, both flag the source (the E5 a red slash and an amber GPS caution, the G5 a red X and its
  "not receiving" messages), stop drawing the deviation and drop GPSS to wings level. Neither keeps any received data,
  and neither gives a timeout.
- None of them caches a route.
- The Aspen of the sim draws a map, so it is an EFD1000 Pro; its Pro Max PFD Pilot's Guide was checked too. It draws
  the flight plan of the GPS selected as the nav source on a map centered on the aircraft's position. When that GPS's
  data stop, it keeps the last route drawn, inactive and all white, only while another position source remains (a
  second GPS, or its own emergency receiver), with a reversion caution. Nothing else is cached, and a single-GPS
  installation has nothing to center the route on. GPSS drops to wings level and does not re-engage by itself.

So the KLN empties the planner at the failure of the port that carries the nav data, and fills it again at the repair:
it stops sending, and the receiving side has no route. The "retained but inactive" route of a Pro with a second GPS is
the display's own behavior, not something the KLN provides.

**A power-off empties it the same way** (maintainer, 2026-11-04): a switched-off unit sends nothing, as a failed port
does. This is the one deliberate change of behavior without a failure; the anti-goal above holds for everything else.
The rule for `WTFlightplanSync`: the planner holds FPL 0 (and the direct-to plan) only while the unit is powered and
the port that carries the nav data transmits; otherwise both plans are empty. So:

- a power-off and a failure of that port empty the planner;
- a power-on and the repair sync it once (`sync()`), as the resume does (#398);
- `sync()` itself follows the rule, so a hot-swap resume or a runtime switch-on of `L:KLN90B_WriteGpsSimvars` while
  the unit is off or the port failed writes empty plans, not FPL 0;
- while `Hardware.isDisabled`, nothing is written, as today (#398); the resume applies the rule;
- with `Output.WriteGPSSimVars` off, `sync()` writes nothing at all, not even the empty plans, as before (#142): the
  rule holds only while the option is set (the controller's ruling in the final review).

The wiki page "Accessing the Flight Plan" gets the matching text (drafted for the maintainer).

### Nullable values

`Airdata.tas`, `mach`, `sat` and `tat` and the fuel computer's `fob`, `fuelFlow1` and `fuelFlow2` become nullable.
`MachDisplay`, `TemperatureDisplay` and `FuelFlowDisplay` take null and show dashes of their width. OTH 5 to 10 show
dashes for a missing value, and every value derived from one (density altitude, wind, fuel figures) is dashed too.
`Oth10Page`'s `pressureAltitude!` goes. Every other reader of `pressureAltitude` already handles null.

### Detection and messages

- **Detection state** is forgotten at every power-on, so it lives in `VolatileMemory` (a field reset in `reset()` at
  every power-on, not only after `RESET_TIME`). It holds, per scheduled failure, the seconds it still waits, counted
  with the trigger's rule (no step back, no jump of more than a minute, nothing after a stop), and the failures already
  detected, which stay so until the repair. A jump of the sim clock then neither hides a message nor hurries one (final
  review). The guard test covers only the `*Page` fields, so this reset gets its
  own assertion.
- **When**, following failures.md (Detection) and the bench video:
  - `arinc429Out`, `rs232Out` (unit-internal): detected at the next calculation tick, but at a power-on not before the
    first navigation page. My call: detection starts with the first navigation page for every failure, so the Self
    Test page shows TEST FAIL and no failure message, as the #416 path does (its message is read after APPROVE?).
  - `rs232In`, `rs232Data`: at a power-on, when the first navigation page shows (`PageManager.startMainPage`, the one
    place the main page appears, also on a forced start); in operation, after a delay drawn from 2 to 10 s.
  - `airdata429` and `altitude`: at a power-on 5 s after the first navigation page; in operation as `rs232In`. The video
    shows only the ARINC 429 receiver; that the gray code is checked with it is my call (guess).
  - `obsResolver` and `rmiOutput` have no message and need no detection.
  - A failure that starts before the first navigation page waits for it, as at a power-on.
- **The messages** are persistent messages in `buildPersistentMessages`, valid while the failure is effective and
  detected: `ARINC 429 OUTPUT FAIL`, `RS-232 OUTPUT ERROR`, `NO RS-232 DATA`, `RS-232 DATA ERROR`, `ARINC 429 AIR DATA
  FAIL`. The MSG page then lists them newest first, as the video shows.
- **`ALTITUDE FAIL`** is valid for the existing configuration case, or while an effective, detected failure takes the
  altitude away: `altitude`, or `rs232In`, `rs232Data` or `airdata429` on the port that carries the pressure altitude.
  On any unit, VFR included (guess, failures.md). Tying it to the detected failure rather than to a null
  `pressureAltitude` avoids a false message at boot, before the first air data tick. The altitude's other effects
  (the ALT page, the alerts, VNAV, the RAIM altitude aiding) follow from the null value with no change.

### TEST FAIL

`SelfTestLeftPage` shows the flashing `TEST FAIL` when `memory.selfTestFailure` is set **or** an effective failure
marked TEST FAIL is active when the page is built. The new path does not touch `memory.selfTestFailure` and posts no
`DATA BASE CHECKSUM ERR`; the approval works as after a passed test. A failure that starts while the Self Test page is
shown does not change it (failures.md leaves this open; my call: the test ran at the power-on).

### UI

- **SET 10** gets a `FAILURES` button on the line below `GPS:`. ENT pushes the FLR page onto the left stack
  (`MainPage.pushLeftPage(…, null)`).
- **The FLR page** is a pushed left page that implements `CustomPageTreeController` with a tree of its own, one group of
  FLR 1, 2 and 3, as `ActPagePage` does on the right. `PageTreeController`'s tree type is widened for it. The inner knob
  moves between the three (`MainPage` already gives a pushed custom-tree page the inner knob); the outer knob pops it and
  handles the step again (existing `MainPage` behavior). The names are `FLR 1`, `FLR 2`, `FLR 3`.
- **FLR 1**: `MTBF:` with an editor of three digits and `H` (` OFF` for 0, the hours without leading zeros otherwise);
  an entry of 0 or CLR on the field sets OFF. `BATTERY 100` fixed text. `SERVICE?` on line 6: ENT shows `CONFIRM?`,
  ENT again repairs every failure and publishes the new `StatusLineMessage` `SERVICED`; CLR at `CONFIRM?` cancels.
  `Button` renders its text once, so the prompt change needs a re-render or a second button (builder's call).
- **FLR 2**: static header `  ACTIVE   ` and a list of the active failures, sorted by FLR name, on lines 2 to 6. CLR on
  an entry shows `REPAIR    ?` in its place; ENT repairs it and the list refreshes; CLR cancels. Empty: no cursor
  positions.
- **FLR 3**: `  INACTIVE ` and the eligible failures that are not active. ENT on an entry shows `FAIL      ?`; ENT again
  fails it at once, also with MTBF off; CLR cancels.
- The lists use `List`. `SimpleListItem`'s confirm prompt is hard-coded to `DEL … ?` on CLR, so a variant with its own
  prompt text and trigger key is needed (builder's call: generalize the item or add a sibling).
- Lists refresh when the failure event fires, so a random failure while FLR 2 or 3 is shown appears there.

### The panel.xml key

`Output.RmiInstalled`, boolean, default false, parsed with `getBoolean` like the annunciator keys, added to
`KLN90PlaneSettings.output` and to `cfg/panel.xml` with a comment that only an installed RMI can fail.

## Tests

At the cheapest stage that observes each behavior (test/README.md):

- **Unit:** the trigger (the probability over `dt`, the equal choice, eligibility, no failure twice, nothing with none
  left, the first tick and clock jumps counting nothing) with `mulberry32` and a fake clock; eligibility of each entry
  against plane settings, including a runtime change of `obsSource` and `headingInput`; the persistence round trip of
  every key and the defaults.
- **Render:** FLR 1 to 3 (the MTBF field and OFF, the prompts, the lists and their order, an empty list, `SERVICED`);
  SET 10's button; each message and `ALTITUDE FAIL`; TEST FAIL with no `DATA BASE CHECKSUM ERR`; OTH 5 to 10 dashes.
- **Flight:** a failed output drops exactly its SimVars and writes their null state once, from the SimVar-to-port table
  of `test/render/Interconnect.test.ts`, with the other ports unchanged (the D-bar filter included); the null state at a
  power-on while failed; a repair restores the live values; each failed input's values missing and their consequences
  (the altitude's RAIM aiding, the OBS course set on the unit); the null state at a hot-swap resume and at a runtime
  switch-on of `L:KLN90B_WriteGpsSimvars` while failed; the planner emptied at the failure and at a power-off, synced at
  the repair and at a power-on, and empty after a resume or a switch-on while off or failed; the detection timing at a power-on (`NO RS-232 DATA`
  with the first navigation page, `ARINC 429 AIR DATA FAIL` 5 s later) and in operation (2 to 10 s); detection
  restarting after a power cycle.
- With MTBF off and nothing failed, the existing suite stays green unchanged.

The reviewers verify the tests by mutation (CLAUDE.md).

## Docs

- `docs/failures.md`: the power-off write of a failed port (above); "What the code needs first" loses the items this
  part settles (the ports, the nullable values, `ALTITUDE FAIL`, TEST FAIL, the randomness); the issue text's sim test
  is not repeated.
- `docs/architecture.md`: the failure state, the trigger, the ports' failure and the null-state pass, the FLR pages.
- `test/README.md` if the harness gets a helper for failures.
- Wiki drafts for the maintainer (failures.md, Public contract): a new page for the failures and the FLR pages with the
  limit that they affect the KLN only, panel.xml customization and RMI for `Output.RmiInstalled`, and Accessing the
  Flight Plan for the planner emptied while the unit is off or its data output failed.
- `docs/architecture.md` Core 4 (`WTFlightplanSync`) for the same rule.

## Left to the builder

- Class, file and key names.
- How the setters of `SensorsOut` are split into writes and state changes.
- How the FLR 1 prompt and the list item prompt are built.
- A test helper to fail a component (through the service, or by storing the settings before the boot).
