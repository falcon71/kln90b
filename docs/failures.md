# Failure simulation

The specification of the unit's simulated failures (#366). It builds on the interfaces of #451
([superpowers/specs/2026-11-02-io-interfaces-design.md](superpowers/specs/2026-11-02-io-interfaces-design.md)) and the
receiver model of #453
([superpowers/specs/2026-11-01-gps-signal-loss-design.md](superpowers/specs/2026-11-01-gps-signal-loss-design.md)).
A behavior or value marked "guess" is not in the manuals; change it when a source turns up.

**Status.** The framework (the failure state, the MTBF trigger, the detection, the FLR pages and the persistence) and
the interface failures (`arinc429Out`, `rs232Out`, `rmiOutput`, `obsResolver`, `rs232In`, `rs232Data`, `airdata429`,
`altitude`) are built (#458, design
[superpowers/specs/2026-11-04-failures-framework-design.md](superpowers/specs/2026-11-04-failures-framework-design.md)).
The annunciator lamps (`…Driver`, `…Wiring`, `…Bulb`), the NAV superflag and the EEPROM are built too (#459, design
[superpowers/specs/2026-11-05-failures-lamps-superflag-eeprom-design.md](superpowers/specs/2026-11-05-failures-lamps-superflag-eeprom-design.md)).
The GPS receiver failures (`gpsAntenna`, `gpsReceiver`), jamming and the faulty satellite are built (#460, design
[superpowers/specs/2026-11-05-failures-gps-receiver-design.md](superpowers/specs/2026-11-05-failures-gps-receiver-design.md)).
The other failures of the catalog are specified here and built by the later parts of #366: the battery by #461, spoofing
by #465. The source of truth for what the catalog holds is `kln90b/failures/FailureCatalog.ts`.

Page numbers without a prefix are the KLN 90B Pilot's Guide (006-08773-0000). "IM" is the Installation Manual
(006-10521-0005 Rev 5), "CMM" the Component Maintenance Manual (006-15521-0003 Rev 3) by its printed page numbers.

## Intent

The unit can fail the way a real KLN 90B fails, so that a pilot practices what the Pilot's Guide expects of them:
notice the failure, read the message, and continue with other means of navigation. The failures are opt-in and off
by default.

Every failure is one the real unit can have, with the effect and the message the manuals describe. Where the
manuals stop, the behavior is an informed guess, and this document says so.

## Goals

- Simulate the hardware and interface failures of Appendix B (B-1 to B-4) with their messages, and the realistic
  failures that have no message (a burnt bulb, the OBS resolver, the RMI output).
- External events the pilot cannot repair in flight: GPS jamming, GPS spoofing, a faulty satellite. These are
  triggered manually only, and like every failure they act on the KLN alone (see "Other GPS units").
- The internal battery ages over the years of sim time and finally loses the user data.
- A random failure rate set as an MTBF, and a fictional FLR page group to set it, to repair and to fail components by
  hand.
- Failures persist between flights until repaired.

## Non-goals and anti-goals

- No failure that cannot be undone on the FLR pages: no display, power supply or knob failures. They
  would leave the unit unusable with no way to reach the repair.
- No failure of an interface or lamp the aircraft does not have. A failure nobody can see is a nuisance, and it uses
  up a random draw.
- Not a failure: bad satellite geometry. It is already simulated (#453) and cannot be repaired.
- No sudden impossible states: a full battery never dies, a component fails in a way real hardware fails (a loose
  cable, a burnt part).
- Not possible: jamming or spoofing the sim's GPS itself, so that the other GPS units of the aircraft degrade with the
  KLN. Ruled out in "Other GPS units".
- **Anti-goal: a failure that changes how the unit behaves while failures are off.** With MTBF off and nothing failed,
  every existing test stays green and every output is written exactly as today, with one exception decided by the
  maintainer: with `Output.WriteGPSSimVars` set, a power-off empties the SDK planner `"kln90b"` (see "A failed port in
  general"), so the tests that pin the planner across a power-off change with it. With the option off the planner is
  left alone, as before.
- Anti-goal: `DATA BASE CHECKSUM ERR` from a simulated failure. That message stays reserved for the real start-up
  self-test failure of #416, so that a pilot's report of it always means a bug.

## Approaches

1. **A failure state that the #451 ports ask (chosen).** Each port asks the failure state whether its interface
   failed; readers check `isReceiving` once; writers do not change. Effects that are not a port (the receiver, the
   lamps, the EEPROM, the battery) hook into the class that owns the behavior. This is the structure #451 was built
   for.
2. A check at every setter and reader. Rejected in #451: the conditions spread over every call site.
3. Failures as an overlay that rewrites SimVars after the unit has written them. Rejected: it cannot remove the
   values from the unit's own pages and messages, and it fights the unit's writes every tick.

## The failure catalog

Each failure has a stable key (persisted, never renamed) and an FLR name (at most 11 characters, shown on FLR 2 and
FLR 3). The FLR names are fictional. The table lists every failure; the sections after it give the details.

| Key | FLR name | Message (MSG page lines) | May fail when | Random | TEST FAIL |
|---|---|---|---|---|---|
| `gpsAntenna` | `GPS ANTENNA` | `RCVR HARDWARE ERROR:` / `0010` | always | yes | yes |
| `gpsReceiver` | `GPS RCVR` | `NO RCVR DATA` | always | yes | yes |
| `gpsJamming` | `JAMMING` | none (the #453 messages follow) | always | no | no |
| `gpsSpoofing` (#465, not built yet) | `SPOOFING` | none (`SYSTEM TIME UPDATED` / `TO GPS TIME`) | always | no | no |
| `faultySatellite` | `SATELLITE` | `RAIM POSITION ERROR` / `CROSS CHECK POSITION` while detectable | always | no | no |
| `eeprom` | `EEPROM` | `EEPROM FAILURE: IC1045` / `EXTERNAL D-BAR INVALID` | always | yes | yes |
| `arinc429Out` | `429 OUTPUT` | `ARINC 429 OUTPUT FAIL` | always | yes | yes |
| `rs232Out` | `RS-232 OUT` | `RS-232 OUTPUT ERROR` | `Output.DataInterface` is `RS232` | yes | yes |
| `superflag` | `SUPERFLAG` | `NAV SUPER FLAG FAILURE` | always | yes | yes |
| `msgDriver`, `wptDriver`, `armDriver`, `actvDriver` | `MSG DRIVER`, `WPT DRIVER`, `ARM DRIVER`, `ACTV DRIVER` | `MSG ANNUNCIATOR FAIL` and so on | the lamp is declared (`…Installed`); for ARM and ACTV also `Output.WriteGPSSimVars` | yes | yes |
| `msgWiring`, `wptWiring`, `armWiring`, `actvWiring` | `MSG WIRING` … `ACTV WIRING` | `CHECK MSG ANNUNCIATOR` and so on | as the driver | yes | no |
| `msgBulb`, `wptBulb`, `armBulb`, `actvBulb` | `MSG BULB` … `ACTV BULB` | none | as the driver | yes | no |
| `battery` | `BATTERY` | `USER DATA LOST` at the next power-on | always (random only at 0 %) | at 0 % | no |
| `rs232In` | `RS-232 IN` | `NO RS-232 DATA` | a fuel computer, RS-232 air data, a baro source (`Input.Airdata.BaroSource` not 0, also with 429 air data) or an RS-232 heading is interfaced | yes | no |
| `rs232Data` | `RS-232 DATA` | `RS-232 DATA ERROR` | as `rs232In` | yes | no |
| `airdata429` | `429 AIRDATA` | `ARINC 429 AIR DATA FAIL` | air data is interfaced on `ARINC429` | yes | no |
| `altitude` | `ALTITUDE` | `ALTITUDE FAIL` | `Input.AltimeterInterfaced` without an air data computer (the gray code) | yes | no |
| `obsResolver` | `OBS INPUT` | none | `Input.ObsInterface` is `Analog` and `Input.ObsSource` is not 0 | yes | no |
| `rmiOutput` | `RMI OUTPUT` | none | `Output.RmiInterface` is `OBI` and the new `Output.RmiInstalled` is true | yes | no |

"May fail when" decides both the random draw and whether the failure is listed on FLR 3. The `*Interface` keys are
fixed, but `Input.ObsSource`, `Input.HeadingInput` and `Output.WriteGPSSimVars` can change at runtime through their
LVars (`SimVarSync`), so eligibility is evaluated when it is used, never cached. A failure that becomes ineligible
while it is active stays active and listed on FLR 2 until repaired, but has no effect while its input or output is
not in use. ARM and ACTV reach the aircraft only through `GPS APPROACH MODE`, which is written only with
`Output.WriteGPSSimVars`, so without it their failures would be invisible.

### Message lines

The MSG page lines are display strings from Appendix B. Two of them do not fit one line of 23 characters and are
split as the table shows. `RCVR HARDWARE ERROR` carries one of the RF failure codes of IM C-4 (0010; 0080, 0100, 0400
and 0800 are the same fault class). `IC1045` is the designator of the unit's 256-bit EEPROM in the CMM parts list;
designators 1xxx mean the unit and 03xx/04xx the database cartridge (IM C-6).

## Detection, messages and TEST FAIL

- **The messages are persistent messages** (`data/PersistentMessages.ts`): valid while the failure is active and
  detected. The MSG prompt flashes for a new one and stays on steady while the condition holds (3-16). A repair ends
  the condition and the message goes. The EEPROM is the exception: the unit reads it at a power-on only, so its message
  follows that read and stays after a repair until the next power-on (see the EEPROM).
- **When a failure is detected** (CMM 1018/1019, CMM 25-26, guesses where the manuals are silent):
  - Interface inputs (`rs232In`, `rs232Data`, `airdata429`, `altitude`): within about 10 s after the data stops, as in
    the CMM loop-back test, and not all at the same moment. A bench video of a real unit with no RS-232 or air data
    connected (`KLN90B (1920p_59fps_VP9-160kbit_Opus).webm` in the maintainer's collection) shows the order at a
    power-on: `NO RS-232 DATA` as soon as the first navigation page is shown (00:36), and `ARINC 429 AIR DATA FAIL`
    about 5 s later (00:41). The MSG page then lists both, the newest first, and the MSG prompt stays on. So at a
    power-on the RS-232 input is checked when the first navigation page shows and the ARINC 429 receivers 5 s later;
    in operation, a loss shows after a delay drawn from 2 to 10 s (guess).
  - Unit-internal failures (`gpsAntenna`, `gpsReceiver`, `eeprom`, `arinc429Out`, `rs232Out`): in the next calculation
    tick, but at a power-on not before the first navigation page. Detection starts with that page for every failure
    (the design's choice), so the Self Test page shows `TEST FAIL` and no failure message yet. `eeprom` is detected only
    from the first navigation page after a power-on whose read of the EEPROM failed, and stays detected until the
    next power-on (see the EEPROM).
  - `superflag`: while the flag is supposed to be valid (navigation valid or the self-test pattern).
  - `…Wiring`: while the unit commands that lamp on. The driver senses overcurrent only then (CMM 25-26).
  - `…Driver`: while the unit commands that lamp off (see the annunciators).
  - A wiring, driver or superflag condition is seen as the unit commands it, also before the first navigation page. One
    seen while the Self Test page is shown (the self-test lights every lamp and sets the flag valid) is noticed at once
    and detected with the first navigation page, with no delay. A command that comes later is detected in the
    calculation tick that sees it. The unit takes what it commanded since the last tick, so a short pulse between two
    ticks is not missed. A condition seen while the failure was not active does not count.
  - After every power-on the detection starts again, with the same rules. The self-test lights every lamp, so a wiring
    fault is found at every self-test.
  - The delays count sim time as the MTBF trigger counts it: a step back of the sim clock, a jump of more than a minute
    and the time the unit was off or disabled count nothing. A detected failure stays detected until it is repaired (the
    EEPROM until the next power-on), so setting the sim clock back does not hide its message.
- **TEST FAIL** (3-4): while a failure marked "TEST FAIL" in the catalog is active, the Self Test page shows the
  flashing `TEST FAIL` in place of `ANNUN ON`. For the EEPROM it is the read of this power-on that counts, not the
  failure as it stands now (see the EEPROM). This path is separate from the start-up failure of #416:
  it posts no `DATA BASE CHECKSUM ERR` and does not touch `memory.selfTestFailure`. The pilot can still approve the
  page, and the failure's own message is on the MSG page.
- **`ALTITUDE FAIL`** was a static check of the configuration (`AltitudeFailMessage`: an IFR unit with no
  altitude input). It is now: the existing configuration case, **or** a configured altitude input that delivers no
  altitude, on any unit (guess). An air data failure (`rs232In`, `rs232Data`, `airdata429`) that takes the altitude
  away therefore shows `ALTITUDE FAIL` as well as its own message (B-1).
- While `gpsAntenna` or `gpsReceiver` is active, the signal and RAIM messages of #453 are not posted; the hardware
  message names the cause (guess).

## The failures

### A failed port in general

A failed output port sends nothing, so the receiving equipment loses its data, for that port only:

- At the moment of the failure, at a power-on while failed, at the resume of a hot swap and when
  `L:KLN90B_WriteGpsSimvars` switches the option on at runtime, the port writes its null state once, then nothing until
  repaired. The power-on and the resume are the unit's own null-state writes, which write the failed ports as every
  other port; the failure and the runtime switch-on write only the failed ports. The ports of the null-state pass
  (`Interconnect.writeNullState`) are the only ones that write during it:
  - the `L:KLN90B_*` outputs on it get what `SensorsOut.setPoweredOff` writes: `L:KLN90B_RollCommand` 0,
    `L:KLN90B_XTK` 0, `L:KLN90B_IntegrityWarn` false, `L:KLN90B_GPS_WP_BEARING` 0, and so on;
  - **the GPS SimVars on it are zeroed too**: the null state `SensorsOut.reset` writes at every power change (#462),
    limited to the SimVars of the failed port. It has no `K:GPS_OBS_ON`/`OFF` event (the LEG/OBS switch belongs to the
    aircraft), writes `GPS WP CROSS TRK` 0 itself (only the signal tick writes it otherwise), and `setWPIndex` keeps the
    index within the count. A GPS-coupled autopilot then loses its guidance instead of following a frozen DTK.
- The power-off write of a failed port goes out with the same values as that of every other port: the port holds its
  null state either way, and the power-off pass writes all ports.
- **The planner follows the nav data port.** The SDK planner `"kln90b"` (FPL 0 and the direct-to plan) holds the plans
  only while the unit is powered **and** the port that carries the nav data transmits; otherwise both are empty, as the
  receiving side has no route when the unit sends nothing. A power-off empties it (this is the one change of behavior
  that is also there with failures off), a power-on and the repair sync it once. All of this holds only with
  `Output.WriteGPSSimVars` set: with the option off the unit writes nothing to the planner, as before. The EFB route answer stops with the
  port, and a route synced from the EFB is ignored while the port is failed. Of the EFIS displays the maintainer
  checked, the Aspen Evolution E5 and the Garmin G5 take no route at all (only live navigation values), so they have
  none to keep when the data stop. The EFD1000 Pro Max keeps the last route drawn, inactive, only while another
  position source remains (its own behavior, not the KLN's).
  The evidence is in the design section "The planner at a failure and a power-off" of
  [the design](superpowers/specs/2026-11-04-failures-framework-design.md).
  That is about what those displays do with the KLN's output, not about the KLN's ARINC 429 EFIS input port, which
  never fails (whether an EFIS reads those values is unknown, see "The ports").
- **The hot-swap crash (#462).** `GPS FLIGHT PLAN WP INDEX` above 0 with `GPS FLIGHT PLAN WP COUNT` 0 crashes MSFS 2024
  to desktop when another GPS unit takes over in a hot swap. The old null state wrote that pair, which is why it was
  disabled after a crash in FS2020. `setWPIndex` now keeps the index within the count for every caller, the failed
  ports included. The synthetic zeroing test ran in the sim on 2026-11-03 and found the cause
  ([sim-flight-record.md](sim-flight-record.md)).
- **What the zeroing does to an autopilot** (the Duke's default autopilot, 2026-11-03): a failed analog nav port with a
  failed superflag (`GPS IS ACTIVE WAY POINT` false, deviation 0) drops it from NAV to HDG at once, and it stays in HDG after the repair.
  Failed ARINC 429 nav data alone leave it in NAV, tracking on the deviation. With `GPS IS ACTIVE WAY POINT` false the sim
  reports `GPS WP DISTANCE` 0, whatever the nav data port writes.
- A failed input port reports `isReceiving` false. Its readers treat the value as missing (null, shown as dashes).
- After a repair the port works again from the next tick.

### GPS antenna (`gpsAntenna`)

A loose or shorted antenna coax, the RF failure of IM C-4. The receiver sees no satellites. The unit:

- loses every satellite at once (inhibited in the SDK, and skipped by the unit's own solution in the same tick), and
  the navigation flags as with any loss of the fix;
- shows `FAILR` as the STA 1 state (5-29) with no satellite rows on either page, and dashes for the EPE on STA 2;
- runs its clock on, as without a fix;
- posts none of the #453 signal and RAIM messages (see "Detection, messages and TEST FAIL"); the hardware message
  names the cause.

### GPS receiver (`gpsReceiver`)

The receiver module stops talking to the host (`NO RCVR DATA`, B-3: no navigation at all). The effect on the screen is
the same as `gpsAntenna`: STA 1 shows `FAILR` with no satellite rows. The guide describes `FAILR` simply as a receiver
failure (5-29), which covers this case too, and documents no other state for it. With both receiver failures active,
repairing one leaves the unit in `FAILR`: every satellite stays blocked until both are repaired. After the repair the
receiver reacquires as after any loss of signal.

### GPS jamming (`gpsJamming`)

Triggered manually only. Regional triggers from real-world jamming areas are a later issue; the manual toggle stands for
flying into a jammer's range. It is a ramp, not a switch, so that it looks different from the receiver failures: the
satellites go weakest first and some come back, and the unit shows the states of a loss of signal on its own.

- **The level** rises linearly in dB over a ramp of 180 to 360 s up to 24 to 28 dB (drawn at the failure, guesses),
  with a wander of sigma 3 dB and a correlation time of 10 s on top (guesses; it starts at 0 at every power-on and is
  not saved). The ramp progress is saved, so a power cycle or a new session continues it and a finished ramp stays
  finished. A power-on while jammed after the ramp starts at the final level, also the forced acquisition of an
  engine-running start, which runs before the first calculation tick and acquires no satellite the level takes.
- **Every satellite's SNR** drops by the level; the SNR itself, with its per-satellite differences, belongs to the
  receiver's signal model (`GpsSignal.ts`, #467, `docs/architecture.md`). Jamming is only one more cause that lowers
  the signal: the satellites it takes spread out by those differences, weakest first.
- **Lock** is the receiver's normal rule for every cause, not a jamming rule (IM C-7: 30 and below unusable, 30 to 35
  marginal): a satellite the receiver tracks is lost below SNR 30; one it does not track is acquired only at SNR 35 or
  more. The gap keeps a satellite from flickering, and the wander makes the losses intermittent near the thresholds. A
  reacquired satellite takes the SDK's normal acquisition time. A lost satellite sets no inhibit: it is unreachable for
  the SDK, so it keeps its channel and is searched.
- **STA 1.** A satellite jamming took stays in its channel and shows `*xx 00` with its elevation, as a satellite still
  being searched does (guess from the real-unit video cited in `Sta1Page.tsx`). A total loss shows every row so, with
  the state ACQ. FAST and REAL share the timings (#468), so this holds in both.
- **What follows** is what any loss of signal shows (#453): the EPE grows, RAIM is lost while the fix holds, and finally
  the fix goes with `SATELLITE COVERAGE INADEQUATE FOR NAV` and the NAV flag. `RAIM NOT AVAILABLE` shows only if RAIM
  stays lost for more than 10 s before the fix goes, which depends on the sky. There is no message of its own.
- The repair sets the level to 0; the satellites come back by the lock rule and the receiver acquires again.

### GPS spoofing (`gpsSpoofing`)

Not built yet. Issue #465 rewrites this section with a realistic spoofer (a fake sky, capture and recovery) and takes the
general `SYSTEM TIME UPDATED` check while a fix is held. What follows is the earlier specification, kept until then.

Triggered manually only. It follows the pattern airline crews report from area spoofing (for
example over the eastern Mediterranean, OPSGROUP 2023): **the position jumps to a fixed false location and the GPS
time jumps by hours.**

- At the failure, draw a false position (guess: a random bearing, 30 to 150 NM from the present position) and a
  time shift (guess: 2 to 12 hours, either sign). Both are persisted with the failure.
- The receiver reports the false position, ground speed 0 and no track change, with a normal EPE. RAIM sees nothing:
  every satellite is spoofed consistently. Everything the unit computes and outputs uses the false position,
  including the GPS SimVars, so the aircraft's moving map shows it too.
- The time shift makes the unit's GPS time jump, which shows `SYSTEM TIME UPDATED TO GPS TIME` (more than 10 minutes,
  B-4). Today that message is posted only when a fix is acquired (`GPS.gpsAcquired`), and spoofing keeps the fix, so
  the check also runs while a fix is held: whenever the GPS time differs from the unit's clock by more than 10
  minutes. Without a failure the GPS time never jumps during a fix, so this changes nothing else.
- At the repair the true position and time return the same way: a jump, and the time message again.
- The unit stores the false position as its last position, as it stores any position it navigates on, so a new
  session while spoofed shows no `POSITION DIFFERS` message.

### Faulty satellite (`faultySatellite`)

Triggered manually only (a satellite is not a component of the unit). Deferred from #453. It is a training scenario:
a real fault is rare (about one major fault a year across the constellation, mostly satellite clock jumps) and lasts
until the control segment flags the satellite unhealthy, about an hour on average and at most six hours. The
simulated fault is that unflagged window; the satellite is never flagged (the SDK's `GPSSatelliteState.Faulty` is not
used), because a flagged satellite is simply excluded and has no measurable effect.

- At the failure, pick one satellite (guess: the highest one in the solution, or with none in use the highest one above
  the 5-degree mask) and persist its PRN.
- While that satellite is in use, its pseudorange carries a bias (guess: growing over a drawn 120 to 300 s to a drawn
  500 to 3000 m, as a clock jump does). The position error follows from the bias through the geometry of the solution
  (the coefficients `GpsSolution` computes, which its header anticipates for this), so it depends on the satellites in
  use and can be larger than the bias.
- While it is in use **and RAIM is available** (the existing availability of `GpsSolution`, which says whether a fault
  could be detected), the unit shows `RAIM POSITION ERROR` / `CROSS CHECK POSITION` (B-3). The KLN 90B detects the
  fault but does not exclude the satellite (guess: the manuals describe only detection). Without RAIM the error is
  undetected. The detection threshold is the smallest bias the protection level is built to catch,
  `RAIM_K × SIGMA_UERE_M` (`FAULT_DETECTION_BIAS_M`, about 27 m): during the ramp the fault is detected only once
  the bias has grown to it.
- A detected fault has the consequences of a loss of RAIM (#453; guess, the manuals give only the message):
  `L:KLN90B_IntegrityWarn` is true, approach active cannot be entered, and in approach active the NAV flag and `PRESS
  GPS APR FOR NAV` follow (6-20). En route the navigation stays valid.
- The bias is added by `FailingMeasurement` to whichever measurement strategy runs; velocity and track are not touched.
  A satellite the receiver has lost is not in the solution, so it adds no error and is not detected.
- When the satellite sets or leaves the solution, the error and the message go. The repair ends it.
- **The fault moves on** (guess): after the faulty satellite has been out of the solution for 120 s of sim time while
  the unit has a fix, a new satellite is picked by the same rule with a new bias and ramp. A short dropout or the
  reacquisition after a power-on never switches. So a long flight keeps a faulty satellite as the constellation moves,
  and a session far from the stored satellite's view gets a new one 2 minutes after its fix.

### Other GPS units

Every failure acts on the KLN alone, the external events included. Each GPS unit of the aircraft, a Working Title GNS
430/530 in a hot swap or as a second GPS, runs its own copy of the SDK's `GPSSatComputer` in its own instrument page.
The KLN's inhibits live in the KLN's copy, and the faulty satellite's bias and the false position of spoofing in its
measurement (`GpsMeasurement`). Since #463 the receiver's events stay on a bus of its own, so a KLN failure no longer
reaches the display of another unit: before, a KLN jamming would have shown `SEARCHING` and NO GPS POSITION on the GNS.
A failure persists with the KLN's settings, so it is still there after a hot swap away and back; while the other unit is
in use, the KLN is disabled and its failure clock stands still.

- **For the hardware failures this is the real behavior.** The other unit has its own antenna, receiver and ports.
- **For jamming and spoofing it is not.** A real jammer or spoofer reaches every receiver of the aircraft, so a second
  GPS that keeps navigating gives the scenario away at the first cross-check. The faulty satellite lies in between: a
  receiver with fault detection and exclusion (a GNS 430W) would likely exclude the satellite and show nothing.
- **The limit is accepted.** The wiki tells pilots that the failures affect the KLN only, and that jamming and spoofing
  are best practiced without a second GPS unit to cross-check with.

**Ruled out: jamming or spoofing the sim's GPS, so that every unit computes the same wrong result.** The SDK's
`GPSSatComputer` computes no position from the satellites. From `PLANE LATITUDE`, `PLANE LONGITUDE`, `PLANE ALTITUDE`
and `E:ABSOLUTE TIME` it models which satellites are in view, the channels and their acquisition, the DOP and a state
(`Searching`, `Acquiring`, `SolutionAcquired`, ...). A Working Title unit takes its position from the sim's true position
(`GNSSPublisher`); the receiver state only decides whether the unit shows it and how accurate it claims to be. The
KLN's own receiver model (#453) is likewise the true position plus a modeled error, not a pseudorange solution. So:

- there are no pseudoranges to spoof. A false position in every unit would mean moving the aircraft;
- a jamming of the other units would have to reach their receivers, and none of their inputs can be reached. The true
  position and the time are the same for everyone, each product loads its own satellite file once at its start, the
  inhibits are a method call on an object in another instrument page (the GNS sets none), and the receiver reads no
  failure SimVar;
- publishing a false receiver state on the other unit's topics (the leak of #463, on purpose) is ruled out as well. The
  other unit's own receiver overwrites it at its next state change, it depends on Working Title internals (the GNS's
  receiver index 1 is hard-coded), and it fakes a display rather than simulating a loss of signal.

An aircraft can degrade its other units through its own failure system, for example by taking a GNS's power away
(see "Out of scope": a failure API for aircraft).

### EEPROM (`eeprom`)

The serial EEPROM holds the CRT centering offsets and most likely the D-bar calibration (CMM). Appendix B: the external
CDI driven by the unit must not be used, the rest of the unit including the internal CDI works, and the pages may
not be centered.

Both are shop calibrations of the unit itself (CMM 1024 to 1028). The display alignment (SET 10) moves the image with
two knobs, the outer one vertically and the inner one horizontally, until it sits right in the bezel, and ENT stores
the centering offsets. The D-bar calibration (SET 11) is done at two points: the knobs trim the output until it
measures +300 mV, ENT, then -300 mV, and ENT saves both. Two points fix a gain and a zero point. What the calibrations
correct is a property of the unit's CRT, yoke and parts, so with the EEPROM failed the unit falls back to nominal
values and shows its own uncorrected errors, the same ones at every failure.

- **The calibration values are properties of the unit** and are stored in a settings category of their own, the
  unit's EEPROM (per aircraft profile, saved with the other categories): two centering offsets and two D-bar
  calibration points. It is separate from `KLN90BUserSettings` and the user waypoints, flight plans and remarks,
  which stand for the battery-backed nonvolatile memory that the battery's failure wipes; the EEPROM needs no battery.
  The values are drawn when the settings are read at the start, for each value still at its default. The default is
  0, which no draw gives, so a new installation and an existing profile get theirs at the next start. They are never
  drawn again: a repair is a new EEPROM calibrated at the shop, and the next failure shows the same errors again.
  Neither a repair, `SERVICE?` nor the battery's loss of the user memory changes them.
  `PageContainer` gets the calibration at `propsReady`, so at the first boot of a session with the EEPROM failed the
  Turn-On page shows centered and the screen shifts from then on; later power cycles shift from the start.
- **The screen is off center.** The centering offsets (guess: 2 to 6 CRT pixels, that is 8 to 24 screen pixels, in
  each axis, either sign) are missing after a power-on whose read failed, so the whole screen content, the FLR pages
  included, is shifted by them. The change happens in a display tick. The maintainer checked in the sim on 2026-11-05
  that the screen, the FLR pages included, stays readable at 6 pixels; the outer characters reach past the screen's
  margin (4 CRT pixels horizontally, 3 vertically). The simulator's own error pages are not the unit's screen and stay
  centered.
- **The external deviation is wrong.** Each D-bar calibration point is the command, in nominal millivolts, that put out
  exactly +300 mV or -300 mV at the shop. Without them the unit commands nominal values, and the output follows the
  line through the two points: a gain of `600 / (plus - minus)` and a zero point of `300 - gain × plus` millivolts.
  `GPS WP CROSS TRK` carries the deviation with that gain and that zero point (as a share of the 150 mV of full scale)
  after a power-on whose read failed. The internal CDI, the XTK on the pages and the digital outputs stay right. The
  points are drawn from a gain of 0.7 to 1.3 and a zero point of up to ±45 mV, ±30 % of full scale (guesses).
- Not affected: OBS CAL (STA 3). It calibrates the OBS resolver input to the installed indicator (IM 2-65), nothing
  says it is kept in the EEPROM, and Appendix B names only the external D-bar.
- The STA 4 counters are not in the EEPROM: they are reset when the nonvolatile memory is cleared (5-31), which is the
  battery's loss (see the battery).
- **The EEPROM is read at a power-on only** (maintainer, 2026-11-05). The unit reads the calibration at a power-on and
  keeps it in volatile memory while it is powered:
  - A failure in operation, from FLR 3 or the MTBF trigger, has no visible effect in that power-on: no screen shift, no
    D-bar error, no message and no `TEST FAIL`.
  - At a power-on with the EEPROM failed, the read fails its integrity check. The screen and the D-bar use the
    uncalibrated values above, the Self Test page shows `TEST FAIL`, and `EEPROM FAILURE: IC1045` /
    `EXTERNAL D-BAR INVALID` is posted with the first navigation page (the rule for the unit's own failures).
  - A repair from FLR 2 or FLR 1 `SERVICE?` has no visible effect either: the uncalibrated values, the message and the
    MSG prompt stay until the next power-on, which reads a good EEPROM.
  - Only a real power-on reads: the first one of a session, a cold one and an engine-running start alike, and every
    one after the unit was off. The battery's ride-through of a short supply loss and the hot-swap disable and resume
    are no power-on and keep what the last one read.
- **Why at a power-on only.** The sources give no timing in so many words, so this is the reading that fits them best;
  a future source can be weighed against it:
  - The CMM's theory of operation: the EEPROM is a 256-bit serial chip driven bit by bit through output lines of the
    DUART (EEDI, EESK, EECS). The CRT centering offsets are stored there at the alignment (SET 10, ENT) and the D-bar
    calibration at SET 11. Values used on every CRT frame and every D-bar update cannot be fetched from such a chip each
    time, so the unit reads them once and works from RAM.
  - IM C-4: the receiver module's own EEPROM error is a failed sum-check self-test, Bendix/King's way of testing an
    EEPROM. A checksum over the contents is naturally run right after the read at the power-on.
  - Pilot's Guide B-2, the message: its advice to note the message's data before the unit is switched off is about
    the IC designator in the message. It suggests that the message may not come back after a power cycle (a marginal
    chip that reads a good checksum the next time), not that calibration data is lost.
  - IM A-7: the RS-232 self-test data record carries the EEPROM's IC designator among both power-on and continuous
    results, so it gives no timing.
  - Ruled out for lack of evidence, to be revisited if a source turns up: a check in the background during operation.
    The message could then show in flight while the values in RAM stay right until the next power-on.
- **In the code**: the catalog marks the EEPROM `readAtPowerOn`. `VolatileMemory.reset`, the power-on reset, reads it
  into `failureDetection.failedAtPowerOn`, and `FailureDetector.actsOnUnit` answers from that for the calibration
  (`EepromCalibration`), the detection, the message and `TEST FAIL`. The other failures act as they are now.

### ARINC 429 transmitter (`arinc429Out`)

The `arinc429Tx` port fails (see "A failed port in general"). The driven course pointer (`K:VOR1/2_SET`), roll
steering, the digital XTK, the integrity warning, ETE/ETA and the course to steer stop, and so do the nav data and
the RMI bearing while they are routed to ARINC 429. Appendix B: whatever uses the 429 output must not be used.

### RS-232 transmitter (`rs232Out`)

The `rs232Out` port fails. Only the nav data travel on it (while `Output.DataInterface` is `RS232`): the GPS SimVars of
the nav data are zeroed, and the SDK planner `"kln90b"` and the EFB route answer stop updating.

### NAV superflag (`superflag`)

The superflag driver cannot reach its valid level (IM C-6: usually an overloaded output). Equipment on the superflag,
some HSIs and autopilots, sees a flag; the unit itself works (B-2). In the sim:

- `L:KLN90B_HSI_TF_FLAGS` reads 0 (flagged), and `GPS IS ACTIVE WAY POINT` and `GPS IS ACTIVE FLIGHT PLAN` read false.
- The deviation (`GPS WP CROSS TRK`), the CDI scaling and everything else keep working.
- In the sim test of 2026-11-03, `GPS IS ACTIVE WAY POINT` false dropped the Duke's default autopilot from NAV to HDG
  (see "A failed port in general"), so a superflag failure disconnects such an autopilot although the deviation works.
- With `GPS IS ACTIVE WAY POINT` false the sim reports `GPS WP DISTANCE` 0 (the sim test of 2026-11-03), so a flagged
  superflag also zeroes the distance that a gauge reads from the sim.

### Annunciators

The sense circuit (CMM 25-26) is a current regulator set to about 300 mA. A lamp draws at most 250 mA, so with a
good lamp the regulator saturates, and that is the "OK" reading. A short makes it regulate at the limit, and that is
the overcurrent reading. An open bulb draws nothing and reads like a good lamp. When the output is commanded off the
loop is forced to zero, so a driver that does not reach zero is the one driver fault the circuit can see.

| Failure | The lamp | Detected | Message |
|---|---|---|---|
| `…Bulb` (burnt bulb) | dark | never | none. The pilot sees it at the self-test, when every lamp should light |
| `…Wiring` (output shorted, the lamp bypassed) | dark | while commanded on | `CHECK … ANNUNCIATOR` |
| `…Driver` (driver stuck on) | **lit while the unit is on** (inferred from the circuit) | while commanded off | `… ANNUNCIATOR FAIL` |

- The stuck driver is the regulator loop failing to reach zero, and the loop runs on the unit's own supply. So the lamp
  is lit whenever the unit is on and goes dark with the unit, as `setPoweredOff` writes it (guess). The simulation
  lights a stuck MSG or WPT lamp from the Self Test page on, because the status line first writes the lamps there, so
  on the Turn-On page it is still dark.
- `L:KLN90B_MsgLight` and `L:KLN90B_WptLight` hold false for a dark lamp and true for a stuck one, every display tick.
- A lamp with both a dark failure (`…Bulb` or `…Wiring`) and a stuck one (`…Driver`) is dark: the open or bypassed lamp
  cannot be lit by a driver that is stuck on.
- `GPS APPROACH MODE` (`ApproachLampGroup`) changes the value instead of dropping the write: a dark ARM clears bit 1
  (1 → 0, 3 → 2), a dark ACTV clears bit 2 (2 → 0, 3 → 1), a stuck ARM sets bit 1, a stuck ACTV sets bit 2.
- The status line `MSG`, the screen's mode texts and `L:KLN90B_AnnunTest` (the never-failing `sim` port) are not
  affected. The screen still tells the truth, as Appendix B tells the pilot to check.

### RS-232 input (`rs232In`, `rs232Data`)

`rs232In` is a lost connection (`NO RS-232 DATA`), `rs232Data` garbled data (`RS-232 DATA ERROR`). Both have the same
effect (guess): everything that arrives on RS-232 IN is missing.

- The fuel computer values are missing: the fuel pages (OTH 5 to 8) and every other use of them show dashes.
- With RS-232 air data: the pressure altitude, TAS, Mach, SAT and TAT are missing (the air data pages OTH 9 and 10
  show dashes), and so the altitude (`ALTITUDE FAIL`).
- The baro setting (`Input.Airdata.BaroSource`, always RS-232): the unit behaves as if no baro were transmitted. The
  barometer keeps its last value and the pilot can set it again.
- With an RS-232 heading: the heading is missing, as without a heading input (a HDG up map is drawn north up, #368).

### ARINC 429 air data receiver (`airdata429`)

As the air data part of `rs232In`, with the message `ARINC 429 AIR DATA FAIL`. The baro is unaffected: it always
comes over RS-232.

### Altitude encoder (`altitude`)

The gray code input fails (a loose connector or a failed encoder). The pressure altitude is missing: the ALT page
altitude, the altitude alert, VNAV and the height above airport alert lose their altitude, and the receiver loses the
altitude aiding, so the RAIM messages become more likely (B-1). Message `ALTITUDE FAIL`.

### OBS resolver (`obsResolver`)

The unit can no longer read the selected course (CMM STA 7: V = 0). It behaves as with `Input.ObsSource` 0: the
course is set on the unit, and the Self Test page shows OBS IN dashed (as the Tu-154 video shows on a unit that cannot
read the CDI). No message: Appendix B has none.

### RMI output (`rmiOutput`)

The `obiBus` port fails: the RMI needle gets the null state (bearing 0) and nothing after it. No message. It needs the
new panel.xml key `Output.RmiInstalled` (default false), because nothing tells the unit today whether an RMI is
connected, and a failure of an RMI that does not exist would be invisible (the same rule as the annunciators).

### Battery (`battery`)

The internal lithium battery keeps the user memory while the unit is off (CMM). Typical life is three to five years
(B-2).

- **The state is two values**: the health, a float from 0 to 100 %, and the latest sim date seen. Every battery is
  made the same; how it is used and what it goes through decide how long it lasts, and that can change over its life.
- **Aging** by sim time, counted **forward only**: at each session start, the time since the latest sim date seen is
  taken, the health drops by that time multiplied by a rate drawn anew for this step from 20 to 33.3 % a year (a life
  of 5 to 3 years, B-2), and the latest date is moved on. The health stops at 0. A sim date set back does not
  recharge the battery, and time changes during a session do not age it. A sim date set years ahead ages it by that
  much.
- FLR 1 shows the health in whole percent, rounded up, so `0` means empty.
- **`BATTERY LOW`**: the unit assumes a conservative life of 1000 days (three years, rounded down) and warns about 15
  days before the end (B-2: replace within a week), so the message `BATTERY LOW: SERVICE` / `REQUIRED TO PREVENT` /
  `LOSS OF USER DATA` shows at a health of 1.5 % or less (100 % / 1000 days × 15 days), also once the battery has
  failed.
- **Failure**: at 0 % the battery may be drawn by the MTBF trigger. With MTBF off it reaches 0 % and stays there
  without failing. FLR 3 can fail it at any charge.
- **Effect**: the unit works on. At every power-on while the battery is failed, including the first one of a sim
  session, the user memory is lost:
  - every user setting of the unit, the user waypoints, the flight plans and the remarks are reset to their defaults
    (also in memory, not only in storage), and `USER DATA LOST` shows (B-4). This includes the welcome text, the
    last position, the stored almanac and ephemeris, and the receiver's own copies of them in the SDK computer;
  - the clock is lost: the unit starts with a default date and time (guess: a fixed date, chosen when this is built, which
    the Self Test page then shows). In REAL, with the almanac and the last position also gone, the receiver does an
    almanac search, unless the pilot enters the date, time and position (3-5, 3-17 to 3-19, the existing start model).
    In FAST, the default, `GPS.powerChanged` runs `initializeFromTruth` at the power-on (#468) and overwrites the wiped
    clock, position, almanac and ephemeris with the true ones, so the receiver starts hot. That holds only if the wipe
    runs before `GPS.powerChanged` does: a requirement on this feature, not yet built. `fastGpsAcquisition` is not
    wiped (see the kept settings below);
  - with no stored position there is nothing to compare the first fix with, so in REAL `POSITION DIFFERS FROM LAST
    POSITION BY >2NM` does not show after a wipe; in FAST it never shows;
  - the STA 4 operating hours and power cycles restart at 0: they are set to zero when the nonvolatile memory is
    cleared (5-31);
  - kept: the failure state, the battery state and the fictional SET 10 settings (not the unit's memory),
    `userDataFormat` (it describes the storage, not data), and the EEPROM's calibration values (a settings category
    of their own, see the EEPROM).
- A failed battery stays failed until repaired, so the data is lost again at every power-on.
- The first session after this feature is installed starts with a new battery: health 100 % and the session's sim
  date as the latest date seen.

## The failure rate

- **MTBF** on FLR 1: off (the default), or 1 to 999 hours.
- Random failures follow a Poisson process: in each calculation tick a failure happens with probability
  `1 - exp(-dt / MTBF)`, where `dt` is the sim time of the tick. Time counts only while the unit is powered and
  ticking (not while off or hot-swap disabled), and it runs with the sim rate. The gaps between failures are random
  and average one MTBF; no extra variance setting is needed.
- A trigger picks one failure with equal chance among those that may fail, are random, and are not active.
  With none left, the trigger does nothing. A component never fails twice.
- The random source and the clock of the trigger are injectable, so that tests are deterministic.

## Persistence

- The failure state is persisted per aircraft model, under the same profile key as the user settings
  (`"<ATC MODEL>.profile_1"`): the MTBF, the active failures with their drawn values (spoofing position and time
  shift; the jamming ramp: its length `rampS`, its final level `finalDb` and its progress `elapsedS`; the faulty
  satellite: its PRN `prn`, its bias `biasM` and its ramp `rampS` and `elapsedS`), and the battery state (the health
  and the latest sim date seen). The EEPROM's calibration values are properties of the unit, not of a failure, and
  have a settings category of their own (see the EEPROM).
- **It lives in its own settings manager**, added to `KLN90BSettingSaveManager`, so that the battery's wipe of the
  user memory leaves it alone.
- New keys only, with defaults that mean "nothing failed, MTBF off, new battery". Changes are saved when they happen.
- Detection is not persisted; it runs again after every power-on.

## Repair

- FLR 2 repairs one failure; FLR 1 `SERVICE?` repairs every failure and installs a new battery (health 100 %).
- A repair ends the effect at once: the port works from the next tick, the lamp follows its command, the receiver
  acquires again, the message condition ends. Data lost by a dead battery stays lost.
- The EEPROM is the exception, as the unit reads it at a power-on only: the screen recenters, the D-bar is right again
  and the message goes at the next power-on (see the EEPROM).

## UI

### SET 10

The fictional SET 10 page gets a `FAILURES` button below the GPS line. ENT on it opens FLR 1.

### The FLR pages

FLR 1 to 3 are a fictional left page group, reachable only through the SET 10 button. They are a pushed left page
with its own page tree, as ACT is on the right (`CustomPageTreeController`). The inner knob moves between FLR 1, 2 and
3; the outer knob leaves them as it leaves any pushed page (the page is popped and the knob step handled again). The
page names are `FLR 1`, `FLR 2`, `FLR 3`.

#### FLR 1

```
MTBF:   OFF
BATTERY 100
          
          
          
SERVICE?   
```

- `MTBF:` is an editor field set of three digits and an `H`, not a select. It shows ` OFF` for 0, or the hours
  without leading zeros (` 15H`, `999H`). An entry of 0, or CLR on the field, sets OFF.
- `BATTERY` is the remaining charge in percent, read-only.
- `SERVICE?` is a button on line 6. ENT shows `CONFIRM?`; ENT again repairs everything and installs a new battery,
  and the status line shows `SERVICED` (a new `StatusLineMessage`; the status line holds 11 characters). CLR at
  `CONFIRM?` cancels.

#### FLR 2

```
  ACTIVE   
GPS ANTENNA
JAMMING    
MSG BULB   
           
           
```

- The header is static. The list holds the active failures in alphabetical order of their FLR names and scrolls like
  any other list to show more entries.
- CLR on an entry shows `REPAIR    ?` in its place; ENT repairs it and removes it from the list, CLR cancels.
- With nothing failed, the list is empty and has no cursor positions.

#### FLR 3

```
  INACTIVE 
429 OUTPUT 
ALTITUDE   
BATTERY    
EEPROM     
GPS ANTENNA
```

- As FLR 2, for the failures that may fail and are not active, including the manual-only ones. A failure that may not
  fail in this installation is not listed.
- ENT on an entry shows `FAIL      ?` in its place; ENT again fails it at once, also with MTBF off, and draws its
  values. CLR cancels.

## The ports

From #451. Each port asks the failure state; the failures above say which port each one fails.

| Port | Pins | Carries | Fails with |
|---|---|---|---|
| ARINC 429 TX | 23/24 | `K:VOR1/2_SET`, `L:KLN90B_XTK`, `L:KLN90B_RollCommand`, `L:KLN90B_IntegrityWarn`, `GPS WP ETE/ETA`, `GPS ETE/ETA`, `GPS COURSE TO STEER`; the nav data and the RMI when routed here | `arinc429Out` |
| RS-232 OUT | 13 | the nav data when routed here | `rs232Out` |
| Analog nav | 19-22, 25 | `GPS WP CROSS TRK`, `GPS CDI SCALING` | never as a whole; `eeprom` changes the deviation |
| NAV superflag | 18 | `L:KLN90B_HSI_TF_FLAGS`, `GPS IS ACTIVE FLIGHT PLAN/WAY POINT` | `superflag` |
| OBI | 10-12 | `L:KLN90B_GPS_WP_BEARING` (default) | `rmiOutput` |
| Annunciators | 14-17 | the lamps (`L:KLN90B_MsgLight`, `L:KLN90B_WptLight`, `GPS APPROACH MODE`) | the lamp failures, through the value changes above |
| Sim | fictional | the vertical constants, `GPS OVERRIDDEN`, `L:KLN90B_AnnunTest` | never |
| ARINC 429 EFIS RX | 4/5 | the heading (default) and the OBS course when routed here | never (whether an EFIS reads these values is unknown) |
| ARINC 429 air data RX | 8/9 | the air data when routed here | `airdata429` |
| RS-232 IN | 36 | the fuel computer, the baro (always), the air data (default), the heading when routed here | `rs232In`, `rs232Data` |
| OBS resolver | 26, 37, 31 | `Nav OBS:1/2` (default) | `obsResolver` |
| Gray code | 41-50 | `PRESSURE ALTITUDE` without an air data computer | `altitude` |
| GPS DISPLAYED, LEG/OBS CONTROL, Power | 1, 33, 40/27 | `GPS DRIVES NAV1`, `GPS OBS ACTIVE`, `Input.ElectricitySimVar` | never |

`Output.WriteGPSSimVars` stays the separate gate `Interconnect.gps(port)`. A GPS SimVar is written only when both the
gate and the port let it through.

## What the code needs first

This section describes the code that #458 did not change and the later parts of #366 need. It is removed once #366 is
implemented. These changes come before the failures that need them. The ports, the nullable values, `ALTITUDE FAIL`
as a detected failure, TEST FAIL for an active failure and the injectable randomness are settled by #458.

1. **No runtime wipe of the user memory** (it belongs to #461). User data is restored only in `KLN90BCore.asyncInit`. A dead battery at a
   power-on within a session needs a path that resets the flight plans, the user waypoints in the facility
   repository, the remarks, the user settings and the clock in memory, and through them in storage. The restore error
   path (empty plans and `USER DATA LOST`) is the closest existing code. The receiver's memory is private SDK state:
   the almanac time (`lastAlamanacTime`) and each satellite's `data.lastEphemerisTime`, which `GPS` sets only at
   construction from the stored settings (`Gps.ts`). The clock has no stored value at all: `GPS` takes it from
   `E:ABSOLUTE TIME` at construction. The wipe needs a way to erase the first and to set the second at a power-on.
2. **`SYSTEM TIME UPDATED` is checked only at acquisition** (`GPS.gpsAcquired`); spoofing needs the check while a fix
   is held (see spoofing). It belongs to #465.

Already possible without new structure: the screen shift (a style change in a display tick). Spoofing builds on the
measurement decorator of #460. The FLR pages exist (#458).

## Public contract

- New: the panel.xml key `Output.RmiInstalled` (default false), parsed like the annunciator keys.
- New persisted keys, in their own settings manager. No existing key changes meaning.
- No H event changes, and no existing LVar changes meaning. The outputs keep their meaning; a failure only changes their
  values as a real failure would.
- New read-only LVars `L:KLN90B_Arinc429OutputTransmitted` and `L:KLN90B_Rs232OutputTransmitted` (fictional, written
  by `TransmitterStatus`): 1 while the unit transmits on its ARINC 429 output, or on its RS-232 output with the nav data
  (`Output.DataInterface` RS232). 0 while the unit is off, while it boots until the Self Test page shows (the main page at
  an engine-running start), and while the output is failed. Agreed with an EFIS developer (2026-11-04): an EFIS that
  takes the nav data and the MSG annunciation over the bus cannot see when the data stop, so it shows its reversion mode
  on these, and hides the MSG annunciation it takes from `L:KLN90B_MsgLight` (an external lamp, which keeps working when
  the bus fails).
- Wiki (the maintainer updates it): a new page for the failures and the FLR pages, with the limit that they affect the
  KLN only (see "Other GPS units"); panel.xml
  customization (`Output.RmiInstalled`); External Annunciators (dark and stuck lamps); RMI (the new key).

## Testing

Each behavior gets a test at the cheapest stage that can observe it (CLAUDE.md, `test/README.md`):

- Unit: the trigger (rate, equal choice, eligibility, no double failure) with an injected random source; the battery
  aging (forward only, set back, the rate range, the 1.5 % warning); the eligibility rules against the plane settings; the persistence round
  trip of every key.
- Render: FLR 1 to 3 (fields, prompts, lists, SERVICED), SET 10's button, the messages and TEST FAIL, OTH 9/10 dashes,
  the screen shift.
- Flight: each failure's effect on the outputs (`test/render/Interconnect.test.ts` holds the SimVar-to-port table; a
  failed port must drop exactly its SimVars), the receiver failures, jamming and the faulty satellite against the
  receiver model (spoofing is #465), the battery wipe at a power-on.
- With MTBF off and nothing failed, the whole existing suite stays green unchanged, except the tests that pin the
  planner across a power-off with `Output.WriteGPSSimVars` set (the exception of the anti-goals).
- Sim, before release: the failed ports with a hot swap to another GPS unit (the zeroing itself was tested on
  2026-11-03, #462), and jamming and an antenna failure with a Working Title GNS beside the KLN, which must keep its
  position.

## Out of scope

- Regional jamming and spoofing triggers from real-world areas (a later issue).
- A failure API for aircraft (an LVar or H event to fail a component from the aircraft's own failure system).
- The EFIS receiver failure, the database cartridge failure (see the anti-goals), the
  altitude alert tone (it is a sound with no port).
- The Appendix B messages that are not failures and are still missing: `APT ELEVATION UNKNOWN`, `POSITION OF WPT HAS
  CHANGED`, `POSITIONS OF OTHER WAYPOINTS HAVE CHANGED`. They belong in issues of their own.
- Satellite health flags from the control segment (STA 1 health `B`).

## Left to the implementation

Like "What the code needs first", this section is removed once #366 is implemented.

- The order of the work of the later parts and how it is split into commits (CLAUDE.md wants one commit per issue).
- The default clock date after a battery wipe.
