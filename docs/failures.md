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
The GPS receiver failures (`gpsAntenna`, `gpsReceiver`) and the faulty satellite are built (#460, design
[superpowers/specs/2026-11-05-failures-gps-receiver-design.md](superpowers/specs/2026-11-05-failures-gps-receiver-design.md)).
Jamming and spoofing are built from simulated ground transmitters (#465, design
[superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md](superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md)),
which replaced the jamming ramp of #460. The internal battery, its aging and the loss of the user memory at a power-on
are built too (#461, design
[superpowers/specs/2026-11-08-failures-battery-design.md](superpowers/specs/2026-11-08-failures-battery-design.md)).
The source of truth for what the catalog holds is `kln90b/failures/FailureCatalog.ts`.

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
  left alone, as before. #465 adds three more, each a plausible behavior of the real unit that hardly occurs without a
  failure (see "Recovery and the time check" under spoofing): the general `SYSTEM TIME UPDATED` check while a fix is
  held, the restart of the search after a lost fix when the unit's belief is far off, and the sky search after
  5 minutes without a fix.
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
| `gpsSpoofing` | `SPOOFING` | none of its own (`RAIM POSITION ERROR` / `CROSS CHECK POSITION` and `SYSTEM TIME UPDATED` / `TO GPS TIME` follow) | always | no | no |
| `faultySatellite` | `SATELLITE` | `RAIM POSITION ERROR` / `CROSS CHECK POSITION` while detectable | always | no | no |
| `eeprom` | `EEPROM` | `EEPROM FAILURE: IC1045` / `EXTERNAL D-BAR INVALID` | always | yes | yes |
| `arinc429Out` | `429 OUTPUT` | `ARINC 429 OUTPUT FAIL` | always | yes | yes |
| `rs232Out` | `RS-232 OUT` | `RS-232 OUTPUT ERROR` | `Output.DataInterface` is `RS232` | yes | yes |
| `superflag` | `SUPERFLAG` | `NAV SUPER FLAG FAILURE` | always | yes | yes |
| `msgDriver`, `wptDriver`, `armDriver`, `actvDriver` | `MSG DRIVER`, `WPT DRIVER`, `ARM DRIVER`, `ACTV DRIVER` | `MSG ANNUNCIATOR FAIL` and so on | the lamp is declared (`…Installed`); for ARM and ACTV also `Output.WriteGPSSimVars` | yes | yes |
| `msgWiring`, `wptWiring`, `armWiring`, `actvWiring` | `MSG WIRING` … `ACTV WIRING` | `CHECK MSG ANNUNCIATOR` and so on | as the driver | yes | no |
| `msgBulb`, `wptBulb`, `armBulb`, `actvBulb` | `MSG BULB` … `ACTV BULB` | none | as the driver | yes | no |
| `battery` | `BATTERY` | `USER DATA LOST` at the next power-on, then `RCVR HARDWARE ERROR:` / `0008` until a satellite is tracked | always (random only at 0 %) | at 0 % | no |
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
  the navigation flags as with any loss of the fix. No signal reaches a dead antenna or receiver, so a spoofer's fake
  satellites go too: no fake satellite claims a channel or enters the solution (#465);
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

### Ground transmitters (`gpsJamming`, `gpsSpoofing`)

Jamming and spoofing are simulated from physical causes, not scripted (#465, design
[superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md](superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md)).
A jammer and a spoofer are transmitters on the ground with a place and a power, and everything the pilot sees comes out
of the distance, the line of sight, the antenna and the receiver's normal rules. Nothing in the receiver, the solution or
STA 1 is keyed on jamming or spoofing: they key on signal levels and on which signal a channel tracks, so jamming and
spoofing active together combine through the same physics, with no rule for the combination. A real jammer or spoofer
is at full power within milliseconds; what a pilot experiences as a ramp comes from flying closer.

Both are triggered manually only. Regional triggers from real-world jamming and spoofing areas are a later issue. Each
active failure has at most one transmitter at a time (`Transmitters`); with both active there are two independent ones,
each with its own place and its own replacement. Take-home mode has none (#460).

- **The site:** a latitude and longitude, on a mast of 100 ft (guess) at the ground level of the aircraft's
  surroundings, and a power drawn at the generation.
- **The level at the aircraft** (`GpsTransmitter.ts`), in dB over the receiver's thermal noise: the power, less the
  free-space spreading over the slant range (20 × log10 of the distance), less the diffraction loss, plus the antenna's
  gain toward the transmitter.
  - **The radio horizon** of mast and aircraft over a 4/3 earth radius is `1.23 × (sqrt(100) + sqrt(h))` NM for a height
    `h` above the ground in feet: about 12 NM on the ground, 99 NM at 5,000 ft, 135 NM at 10,000 ft and 242 NM at
    FL350. The height is `PLANE ALT ABOVE GROUND`, read once per calculation tick while a transmitter failure is in
    effect (with failures off the unit reads no height), so that a jet parked at a high airport is on the ground. The
    earth is smooth: terrain masking is not modeled.
  - **The diffraction loss** is 0 within the horizon and 2 dB per NM beyond it (guess), so a transmitter does not
    appear at a hard edge but comes in over a band of a few NM to a few tens of NM.
  - **The antenna's gain** toward the transmitter depends on the transmitter's elevation above the antenna's plane, from
    its bearing, its elevation over the local horizon and the aircraft's heading, pitch and bank (`transmitterGainDb`).
    Above the plane it is the antenna curve of #467 (`GpsSignal.ts`), but at least 12 dB under the zenith; below the
    plane it is 12 dB under the zenith less 0.5 dB per degree, down to the curve's floor of 25 dB under the zenith
    (guesses, decided at the final review of 2026-11-08). A real top-mounted L1 antenna is some 8 to 11 dB under its
    zenith at its horizon (the minimum gains of RTCA DO-301 and ICAO Annex 10: -7 dBic at 0 degrees, -5.5 at 5, -4 at
    10, against +2 to +4 at the zenith) and rolls off gradually below it, to the -20 to -25 dBic near the nadir of the
    EEC 337 measurements. In level flight a distant transmitter is a few degrees under the plane, some 12 to 14 dB under
    the zenith; one nearly under the aircraft gets the floor, so a high aircraft is shielded from a transmitter it
    overflies. A bank of 20 degrees toward a transmitter raises its level by about 6 to 8 dB, one away lowers it by
    about 10. Unlike a satellite, a transmitter below the local horizon is not blocked by the earth.
- **The noise floor.** Every transmitter's level adds to the receiver's noise: with `J` the jammer's level and `F` the
  sum of the spoofer's fake signals, both as power ratios, the noise rise is `10 × log10(1 + J + F)` dB. Every real
  satellite's SNR is that of the signal model of #467 less the rise.
- **Placement.** The effect of a transmitter is measured by one quantity: for a jammer the noise rise of its level
  alone, for a spoofer the SNR of its fake signals. Its **edge** at a height is the distance in level flight at which
  that quantity reaches a small threshold: a 1 dB noise rise, or a fake SNR of 35, the acquisition threshold (guesses).
  The edges are solved by bisection, at a generation and when the reference altitude grows, never per tick.
  - **Switched on while on the ground** (`SIM ON GROUND`): a random bearing, at 2 NM (guess) to the smaller of 15 NM
    (maintainer) and the ground radio horizon, so that the transmitter is in line of sight and its effect is there at
    once.
  - **Switched on in flight, and every new transmitter:** ahead on the track within ±30 degrees (guess), at a random
    bearing without a track (below 2 kt, 3-35). The distance is drawn between the edge at the **present** height and
    the distance at which the effect is a little stronger: a noise rise of 3 dB for a jammer, a fake SNR of 38 for a
    spoofer (guesses). So the effect is not noticeable yet and becomes so as the aircraft closes in. The placement is
    by the effect, not by a share of the distance: in the diffraction band a tenth of the distance is tens of dB. The
    present height, so that a prop at 5,000 ft is not placed far beyond its own horizon.
  - **Leaving.** Each transmitter keeps a **reference altitude**: the highest height above the ground seen since its
    generation, at least 10,000 ft (guess), stored with it. A jammer is left once the horizontal distance exceeds its
    edge at the reference altitude. A spoofer is left once its fake SNR at the reference altitude would be below 25,
    5 below the lock-loss level (guess), so that the lock rule has lost its fake satellites before it is replaced. Then
    a new transmitter is generated at once by the in-flight rule. A descent below the horizon never replaces one: the
    old transmitter comes back on the climb.
  - **A session start** with an active failure loads the stored transmitter. Beyond its leave edge at the reference
    altitude a new one is generated, so a session continued in the same area keeps its transmitter.
- **The repair** removes the transmitter at once.

### GPS jamming (`gpsJamming`)

A jammer is a transmitter (above) whose level only raises the noise floor. The satellites go weakest first as the
aircraft closes in, and some come back as the attitude and the fades change, so the unit shows the states of a loss of
signal on its own.

- **The power** is drawn so that, in level flight at FL350 as if in line of sight, with the antenna's gain at the
  jammer's depression there, the jammer takes the weakest typical satellite (a noise rise of 7 dB, a satellite at SNR 37
  dropping to 30) at 100 to 600 NM (guess; the maintainer widened it from 250 NM at the final review, 2026-11-08). From
  there the satellites go one by one as the distance shrinks, which at realistic speeds is minutes to tens of minutes.
  For a jet the horizon often limits first: the jammer arrives over the diffraction band and then creeps. Near a weak
  jammer the antenna's roll-off toward the nadir eats most of what the shorter distance gives, so at FL350 the strong
  satellites go only in the last few NM before it: a jet flying at a jammer whose first loss is at 150 NM loses its
  weakest satellite (SNR 39) at about 121 NM and the weak ones by about 74 NM, then the strong ones (SNR 47 to 51)
  within about 10 NM, the last at about 4.5 NM (the jet flight of `GpsJamming.test.ts`, 2026-11-08). Lower down the
  jammer is less shielded and takes them sooner.
- **A strong jammer**, drawn beyond the horizon of FL350 (about 242 NM), is limited by the horizon: it takes the first
  satellites near the horizon, a few NM before the aircraft is in its line of sight, while the diffraction loss falls
  away, and the strong ones still far out, so it blacks out a wide area. One drawn at 600 NM takes every satellite of a
  jet at FL350 about 110 NM out, and of a prop at 8,000 ft within a few NM of the prop's horizon, about 120 NM out
  (measured 2026-11-08).
- **Every satellite's SNR** drops by the noise rise; the SNR itself, with its per-satellite differences, belongs to the
  receiver's signal model (`GpsSignal.ts`, #467, `docs/architecture.md`). Jamming is only one more cause that lowers
  the signal: the satellites it takes spread out by those differences, weakest first. The variation comes from the
  antenna's attitude toward the jammer and the satellites' own fades.
- **Lock** is the receiver's normal rule for every cause, not a jamming rule (IM C-7: 30 and below unusable, 30 to 35
  marginal): a satellite the receiver tracks is lost below SNR 30; one it does not track is acquired only at SNR 35 or
  more. The gap keeps a satellite from flickering. A reacquired satellite takes the SDK's normal acquisition time. A
  lost satellite sets no inhibit: it is unreachable for the SDK, so it keeps its channel and is searched.
- **STA 1.** A satellite jamming took stays in its channel and shows `*xx 00` with its elevation, as a satellite still
  being searched does (guess from the real-unit video cited in `Sta1Page.tsx`). A total loss shows every row so, with
  the state ACQ. FAST and REAL share the timings (#468), so this holds in both.
- **What follows** is what any loss of signal shows (#453): the EPE grows, RAIM is lost while the fix holds, and finally
  the fix goes with `SATELLITE COVERAGE INADEQUATE FOR NAV` and the NAV flag. `RAIM NOT AVAILABLE` shows only if RAIM
  stays lost for more than 10 s before the fix goes, which depends on the sky. There is no message of its own. Turns
  toward the jammer make it worse. A descent below the jammer's horizon brings GPS back; a climb takes it away again.
- After 5 minutes without a fix the receiver searches the whole sky, keeping its belief (see "Recovery and the time
  check" under spoofing): once four satellites are back, the fix returns as a reacquisition would, in about 40 s.
- The repair removes the jammer; the satellites come back by the lock rule and the receiver acquires again.

### GPS spoofing (`gpsSpoofing`)

A spoofer is a transmitter (above) that broadcasts the sky of a GPS signal simulator: the signals a receiver would get
standing still at a **false position** at a **false time**. It follows the pattern airline crews report from area
spoofing (OPSGROUP 2023 and the other sources the design cites): the position ends at a fixed false location near the
transmitter, often an airport, after the error estimate has climbed for a short while, and the time jumps by hours.

- **The power** is drawn high enough that the fake signals would drown the real satellites (a noise rise of 20 dB) at
  300 to 600 NM at FL350 as if in line of sight (the horizon left out), with the antenna's gain at the spoofer's
  depression there (guess).
  Spoofers are therefore limited by the horizon: the horizon and the
  diffraction band decide where a spoofer takes effect, abruptly. At FL350 that is about 242 NM, in line with the
  reported capture 200 to 250 NM from the false location.
- **The false position** is drawn at the spoofer's generation, 30 to 150 NM from the transmitter at a random bearing
  (guess; a broadcast spoofer shows every aircraft the same place). It snaps to the nearest airport of the sim's
  database within 30 NM of the drawn point (guess) that has a hard surface and a runway of at least 1500 m
  (maintainer), through the nearest airport search of `KLNFacilityLoader` (`NearestAirportFinder`). Its reference
  point and its elevation give the false position and the false altitude. User waypoints are no candidates. Without a
  match the drawn point is used, at the ground elevation under the aircraft at the generation. The search is
  asynchronous: the spoofer sends nothing until it has resolved, and its result is stored with it. A search that has not
  answered after 30 s of sim time (guess) is given up for the drawn point, and a late answer is ignored.
- **The time shift** is drawn at the generation, 2 to 12 hours, either sign (crew reports). **The spoofer's clock
  offset**, within ±0.5 ms (guess), is common to every fake signal: it disappears into the receiver's clock once every
  satellite is fake and matters only while real and fake satellites mix.
- **The fake sky** is an SDK prediction context at the false position and the false time, predicted again every 5 s of
  sim time, never every tick. It gives the PRNs above the false position's horizon and their directions there. With a
  shift of hours it is largely another set of satellites than the real sky.
- **The fake signals.** Every fake signal arrives over the same path, so each has the same level: the spoofer's level
  at the aircraft divided among the fake sky's PRNs. A fake satellite's SNR is that level over the thermal noise, the
  jammer and the other fake signals, scaled by the spectral separation of one C/A code from another
  (`SPECTRAL_SEPARATION_DBHZ`, 60 dB-Hz; Betz gives about 61.8 for C/A on C/A). The fake signals jam each other, so with
  eight of them the SNR levels off at about 51.5 however strong the spoofer is: a flat, high column on STA 1, the same
  for every elevation. The fake signals also
  raise the noise floor of the real satellites (above): close in they drown every real satellite, which is why capture
  happens.

**The fake receiver and the shared channels** (`FakeReceiver`). The unit has 8 channels. Each tracks one PRN, and the
signal it locks onto is that PRN's real signal or its fake one.

- **The belief** is the position the unit navigates on and its clock, not a captured flag. The receiver searches the
  PRNs its almanac puts in the sky at its belief, or every PRN during a sky or an almanac search of the start model.
- **One search rule:** a channel searching a PRN locks whichever of its two signals is at 35 or more and the stronger. A
  channel tracking a signal keeps it until the lock rule loses it (below 30): a tracking loop does not jump to another
  correlation peak. So real satellites can come back while the unit is captured, as fake ones can come in while it is
  not.
- **Shared PRNs.** Before a sky search, the fake signals the receiver finds are those of the PRNs up both in the
  believed (true) sky and in the fake sky. How many there are depends on the time shift: with about 6 hours roughly a
  third of the visible satellites, with about 12 hours almost none. With few shared PRNs the drowned receiver has no fix
  until its sky search finds the rest of the fake sky.
- **Taking a channel.** A fake satellite claims a channel: the one of its own PRN, else an empty one, one whose
  satellite was lost, or one still searching, never one that tracks. The SDK's satellite in a claimed channel is seen as
  lost through the reachability wrapper of #467, so the SDK neither tracks it nor gives the channel away while the claim
  lasts. The SDK keeps its channel count and STA 1 shows exactly 8 channels. A real satellite the SDK marked
  Unreachable while it sat in a claimed channel is made searchable again once the claim is gone: the real receiver
  never searched it there.
- **Acquisition of a fake satellite** takes the start model's times (`GpsSearch.ts`), judged against the fake signals'
  own truth: the hot time when the unit already believes the false time, within 2 NM of the false position, with the
  fake ephemeris collected from this spoofer; the almanac search's time during an almanac search, as for a real
  satellite; the blind time during a sky search; otherwise the idle time. A fake satellite whose ephemeris has not been
  collected from this spoofer then takes 30 s (one data frame) to it. A fake satellite is lost by the lock rule like any
  satellite.
- **STA 1** shows a channel a fake satellite claims with that satellite: its fake SNR, and the elevation the unit
  predicts for it, from the fake sky once the unit believes the false time and from the believed sky before, unknown
  during a sky or an almanac search until its ephemeris is in. Without a fix, a channel searching a fake satellite
  makes the state ACQ. No PRN is shown twice.

**The mixed solution** (`RangeErrors`, `GpsSolution.solveErrors`). Every satellite in use is a row of the unit's
solution, real or fake.

- **Two claimed states.** A real signal claims the true position and time; a fake signal claims the false position on
  the ground there and the false time plus the spoofer's clock offset. A fake signal also travels the spoofer's slant
  range to the aircraft, so its claimed range includes it, as does the false state (final review, 2026-11-08). It is
  common to every fake row: in a captured solution it goes into the clock (at most a few ms), and in the mixed phase the
  aircraft's speed toward the spoofer enters the velocity error.
- **The reference state** is the one most satellite rows claim, the true one on a tie (our call). The lines of sight
  are the directions from it: the real sky for the true state, the fake sky for the false one. Rows that claim the
  reference state carry no error; each other row carries the range its signal claims minus the range from the
  reference state, less the whole milliseconds the receiver resolved for the row when it entered the solution or the
  reference state last changed. Between those moments the row is tracked, so its error drifts and does not wrap. The
  solution is the reference state moved by the least-squares response to those errors. The resolution of the whole
  milliseconds against the reference state is a receiver assumption: a receiver that resolves its code phases from its
  own time and position (coarse time) places a row within half a millisecond of the predicted range, while one that
  took the transmit time from the decoded time of week would reject such a row instead.
- **The altitude row** (NAV A, 5-29). The fake signals describe a receiver on the ground at the false position, so with
  an altitude input the altitude disagrees with them by the aircraft's height above that ground. Under the false
  reference the row carries the altitude input against the false altitude; it moves the solution and enters the
  residual test like any row.
- **The velocity** comes from the range-rate errors: each claimed range's rate is taken from its own steps (the skies
  move their satellites every 5 s) and held between them. Under the true reference the true velocity is moved by the
  fake rows; under the false reference a velocity of 0 (a receiver standing still) is moved by the real rows. The
  ground speed and the track follow from that velocity.
- **The clock** is the reference state's time moved by the clock part of the solution, so the unit takes the false
  time once most rows are fake, and the true time back once most are real.
- **Every row fake (captured):** the false position, ground speed 0, no track change, the false time, and an EPE from
  the geometry of the rows. The receiver gives up on nothing: there is no residual-scaled EPE and no gross residual
  limit (maintainer: the receiver was built for selective availability, not for spoofing).
- `FailingMeasurement` applies the result to whichever measurement strategy runs: under the true reference it moves the
  measured position and velocity, under the false reference the false position takes the measured position's place.
  Everything the unit outputs uses the position it navigates on, the false or the mixed one included, the GPS SimVars
  too.

**RAIM detection.** RAIM detects a bad range from the residuals of the solution, as a real receiver's RAIM does
(`raimTestFails`): the sum of the squared residuals in units of the ranging error against the chi-square bound for
the redundancy (measurements − 4 degrees of freedom) at a false-alarm probability of 1 in 15000 (`RAIM_PFA`, guess).
While RAIM is available for the alert limit of the mode and the test fails, `RAIM POSITION ERROR` / `CROSS CHECK
POSITION` shows (B-3), with the consequences given under the faulty satellite. With 4 measurements there is no RAIM,
and the wrong position goes undetected. The unit detects and does not exclude.

- **Captured with an altitude input,** the altitude row disagrees with the fake rows, so while RAIM is available a
  captured unit in flight shows `RAIM POSITION ERROR` for as long as it is captured. Without an altitude input RAIM sees
  nothing (maintainer). On the ground near the spoofer with an altitude input it sees nothing only while the false
  airport's elevation is within roughly 500 ft of the field's: the altitude input disagrees with the false altitude by
  that difference.

**What the pilot sees.**

- **Flying toward a spoofer:** at the horizon the real satellites lose SNR fast. In a mixed phase the position wanders
  by several to tens of NM with `RAIM POSITION ERROR` (silently with 4 measurements), the ground speed and the track are
  wrong, and fixes come and go as the geometry changes; at jet speeds the band can be crossed with no mixed phase at
  all. Then every real satellite is drowned. If the two skies share enough PRNs the fake satellites are acquired within
  a minute or two; with few shared PRNs the unit has no fix until its sky search finds the fake sky, 5 to about 15
  minutes later. Then the unit is captured: the false position, ground speed 0, a normal EPE, a flat high SNR on STA 1,
  and `SYSTEM TIME UPDATED TO GPS TIME` from the time shift.
- **Flying out:** the fake satellites fade below 30 and are lost. Real satellites of the PRNs the receiver searches (the
  fake sky's, from its false belief) can come back into a mixed phase, and with enough of them the true position returns
  directly. Otherwise the real satellites come back slowly (below). At the true fix the true time returns with
  `SYSTEM TIME UPDATED`.
- **Jamming and spoofing together:** the jammer lowers the fake satellites as it lowers the real ones. Near a strong
  spoofer and far from the jammer the unit is captured; near a strong jammer the fakes are drowned too and there is no
  fix; in between, a captured unit can lose its fake fix to the jammer and regain it.

**Recovery and the time check** (`GPS.fixLost`, `GpsSearch`). The SDK's receiver is omniscient: it always assigns the
satellites that are really up. The start model steps in where the real receiver would not know them, and two rules
extend it to a loss of the fix. Neither is a spoofing rule.

- **A far-off belief.** When the unit loses its fix while its clock is off by more than 10 minutes (IM 2-66) or its
  position is 100 NM or more from the truth (the SDK's own limit), the receiver starts its search again from that
  belief, as at a power-on (`GpsSearch.start`). The satellites it predicts are not there, and after the give-up time it
  searches the sky. That is the slow recovery after a spoofer. Within those limits a loss of the fix reacquires as
  before. Without a failure this is reached by a teleport, a slew or a move on the map of 100 NM or more that loses the
  fix; a sim time change during a fix does not lose it.
- **No fix for 5 minutes** (the give-up time, IM 2-66): the receiver searches the whole sky, every PRN, as the start
  model does after a power-on (3-17; `GpsSearch.lostFix`). This is how a drowned receiver finds a fake sky that shares
  few PRNs with the believed one. It also applies after a long loss to jamming or an antenna failure, on the ground too;
  without a failure it does not happen.
  - **It keeps the receiver's belief** (decided at the final review, 2026-11-08). A jammed receiver's clock and position
    stay right, so it does not search blind: the SDK keeps its last known position, its almanac and the idle and hot
    acquisition times. Once four satellites are back the fix returns as a reacquisition would, in about 40 s (the
    jammed A321 of Felux et al., NAVIGATION 71(3), 2024, was back about 2 minutes after the interference ended). The
    fake receiver still uses the blind time during it, so a capture by a spoofer whose sky shares few PRNs with the
    believed one still takes 5 to about 15 minutes. STA 1 shows INIT.
  - The SDK gives up on a satellite it searched in vain for 4 minutes for an hour (Unreachable), and fills a channel it
    has nothing in view for with satellites in PRN order, below the horizon too. Neither is what a receiver does that
    knows where it is: during this sky search the Unreachable marks are forgotten in every tick (`forgetUnreachable`),
    and a satellite below the horizon in a channel is inhibited until the SDK has taken it out, so that the channels go
    to the satellites in view.
- **A long loss before the first fix** (#470). A receiver that knows its position, time and almanac keeps searching a
  satellite it predicts in view however long its signal is lost, so after an engine-running start, during the start
  model's acquisition and whenever the unit is idle, a lost satellite that is up never times out to `Unreachable`
  (`wrapReachability`), and the fix returns in the acquisition time after the signals do: the hot time with a current
  ephemeris near the stored position, otherwise the idle or warm time. The blind searches (the almanac search and the
  power-on sky search) search each PRN in turn and keep the SDK's timeout, as they do not know which satellites are in
  view; they start a new pass once every PRN was searched in vain (`GpsSearch.nextPassWhenAllGivenUp`). After a jamming
  that outlasts the give-up time of a cold power-on, the next satellite in view is found within about one pass (some
  16 to 18 minutes) instead of up to an hour.
- **The general time check** (B-4): in every calculation tick with a fix, when the GPS time differs from the unit's
  clock by more than 10 minutes, `SYSTEM TIME UPDATED` / `TO GPS TIME` shows. Before #465 the check ran only at the
  acquisition of a fix. It also fires when the pilot changes the sim's time of day during a fix (accepted by the
  maintainer). The unit's clock runs on over a hot-swap disable as it does over a power-off (3-53), so a resume does
  not post it; a power-off while disabled counts the disabled time too.

**Power cycles, sessions and the SDK.**

- **The stored position** is the false one while captured, as for any position the unit navigates on. With REAL
  acquisition, a power cycle with the same spoofer finds the stored false position and the battery clock in agreement
  with the fake signals and the fake ephemeris kept: the fake satellites come back with the hot time and no
  `POSITION DIFFERS FROM LAST POSITION BY >2NM` shows. A new session is no hot start on the fakes: the unit's clock
  starts from the sim's time (`E:ABSOLUTE TIME`) plus the stored `clockOffset` (see the battery), and the fake ephemeris is not stored. With FAST, the default, every power-on writes the
  true state into the memory (#468): the receiver searches the real sky's PRNs from the truth and meets their fake
  signals. Inside a spoofer a power cycle is then no hot start on the fakes, and the capture after it shows
  `POSITION DIFFERS` as well as `SYSTEM TIME UPDATED`.
- **The SDK's last known position** is never the false position while the unit has a fix: where `GPS.tick` syncs it
  (a fix the SDK has no solution of its own for, as with fake satellites in the channels), it gets the true position.
  At a power-on the start model gives the SDK the stored position, false or not, only within 100 NM of the present one,
  so that #62's 2 NM hot-start rule stays honest; beyond 100 NM it gives the present one. A false position beyond
  100 NM would send the SDK into a blind search.
- **A receiver failure** (`gpsAntenna`, `gpsReceiver`) silences the fake receiver too: no fake rows and no claims.
- **The repair** removes the spoofer at once. The fake satellites go, their claims are released, and the unit recovers
  as when flying out.

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
- While it is in use **and RAIM is available** (the existing availability of `GpsSolution` for the alert limit of the
  mode) **and the residual test fails**, the unit shows `RAIM POSITION ERROR` / `CROSS CHECK POSITION` (B-3). The
  residual test (`raimTestFails`, #465) is the one rule for every bad range, a spoofer's fake satellites included (see
  "RAIM detection" under spoofing): the sum of the squared residuals of the solution in units of the ranging error
  against the chi-square bound of measurements − 4 degrees of freedom. So the detection depends on the geometry, as in
  a real receiver: during the ramp the fault is detected once its bias stands out of the residuals. It replaced #460's
  fixed threshold. The KLN 90B detects the fault but does not exclude the satellite (guess: the manuals describe only
  detection). Without RAIM the error is undetected.
- A detected fault has the consequences of a loss of RAIM (#453; guess, the manuals give only the message):
  `L:KLN90B_IntegrityWarn` is true, approach active cannot be entered, and in approach active the NAV flag and `PRESS
  GPS APR FOR NAV` follow (6-20). En route the navigation stays valid.
- The bias is a range error on the satellite's row (`RangeErrors`), and `FailingMeasurement` moves the position of
  whichever measurement strategy runs by the solution's response to it. Velocity and track are not touched: the ramp
  is a clock jump, which has no Doppler. A satellite the receiver has lost is not in the solution, so it adds no error
  and is not detected.
- When the satellite sets or leaves the solution, the error and the message go. The repair ends it.
- **The fault moves on** (guess): after the faulty satellite has been out of the solution for 120 s of sim time while
  the unit has a fix, a new satellite is picked by the same rule with a new bias and ramp. A short dropout or the
  reacquisition after a power-on never switches. So a long flight keeps a faulty satellite as the constellation moves,
  and a session far from the stored satellite's view gets a new one 2 minutes after its fix.

### Other GPS units

Every failure acts on the KLN alone, the external events included. Each GPS unit of the aircraft, a Working Title GNS
430/530 in a hot swap or as a second GPS, runs its own copy of the SDK's `GPSSatComputer` in its own instrument page.
The KLN's inhibits live in the KLN's copy, and the transmitters, the fake satellites and the range errors of the faulty
satellite and of spoofing in the KLN's own receiver model (`GPS`, `Transmitters`, `FakeReceiver`, `RangeErrors`). Since #463 the receiver's events stay on a bus of its own, so a KLN failure no longer
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

The unit has two batteries (CMM pages 17, 18 and 43 for the first, CMM page 22 for the second):

- The Battery Module, a rechargeable pack that carries a short interruption of the aircraft power (the ride-through,
  `PowerSupply.RIDE_THROUGH_TIME`). It is no part of this section.
- The remote-mounted lithium battery that holds the nonvolatile RAM while the unit is off, with a comparator that
  watches its voltage (CMM page 22). Its typical life is three to five years (B-2). This section is about it.

Design: [superpowers/specs/2026-11-08-failures-battery-design.md](superpowers/specs/2026-11-08-failures-battery-design.md).

- **The state is two values**: the health, a float from 0 to 100 %, and the latest sim date seen
  (`batteryHealth`, `batteryDate`). Every battery is made the same; how it is used and what it goes through decide how
  long it lasts, and that can change over its life.
- **Aging** by sim time, counted **forward only** (`ageBattery`, `Battery.age`): at each session start, when
  `KLN90BCore.asyncInit` builds the failure services, the time since the latest sim date seen is taken, the health drops
  by that time multiplied by a rate drawn anew for this step from 20 to 33.3 % a year (a life of 5 to 3 years, B-2),
  and the latest date is moved on. The health stops at 0. A sim date set back does not recharge the battery, and time
  changes during a session do not age it. A sim date set years ahead ages it by that much. A date of 0 (a first
  session, or a new installation) only notes the date.
- FLR 1 shows the health in whole percent, rounded up, so `0` means empty.
- **`BATTERY LOW`**: the unit assumes a conservative life of 1000 days (three years, rounded down) and warns about 15
  days before the end (B-2: replace within a week), so the message `BATTERY LOW: SERVICE` / `REQUIRED TO PREVENT` /
  `LOSS OF USER DATA` shows at a health of 1.5 % or less (100 % / 1000 days × 15 days), also once the battery has
  failed. Like the unit's other hardware messages it is posted from the first navigation page of a power-on.
- **Failure**: the catalog entry has `randomWhenEmpty`, so the MTBF trigger may draw it only at a health of exactly 0.
  With MTBF off it reaches 0 % and stays there without failing. FLR 3 can fail it at any charge.
- **Anti-goal: nothing is wiped while the unit is on** (maintainer, 2026-11-08). A battery that fails in operation, from
  FLR 3 or the trigger, changes nothing until the next power-on. A pilot who repairs it before then (FLR 2 or FLR 1
  `SERVICE?`) keeps every setting and all user data. The wipe happens only at a power-on, and only if the battery is
  failed at that moment. The ride-through and the hot-swap resume are no power-on and wipe nothing.
- **Anti-goal: a unit that has never stored anything is not a wiped unit.** The first start in a new aircraft (empty
  storage) is a unit fresh from service: a new battery and a clock taken from the sim date, so the first fix is in the
  current GPS era. The default clock of 1 JAN 1988 belongs to a loss of the user memory only. The restore failure of a
  corrupt profile in `asyncInit` keeps its own behavior.
- **Effect**: the unit works on. At every power-on while the battery is failed, including the first one of a sim
  session, the user memory is lost. `PowerSupply` publishes the bus event `userMemoryLost` (not cached) when the unit
  becomes powered and the failure is active, before it counts the power cycle and before `powerEvent`, which carries
  `memoryLost`. Every holder of user memory resets itself in the handler, and the order against the power-on handlers
  (`GPS.powerChanged` among them) holds by construction, for the first power-on of a session and every later one:
  - every user setting of the unit, the user waypoints, the flight plans and the remarks are reset to their defaults,
    also in memory and not only in storage (`wipeStorage` in `settings/UserMemory.ts`, and the handlers of the flight
    plans, the active waypoint, the user waypoint persistor, `RemarksManager` and `Timers`), and `USER DATA LOST` shows
    (B-4). This includes the welcome text, the last position, the stored almanac and ephemeris, and the receiver's own
    copies of them in the SDK computer. The message list is cleared first, as messages the boot's restore posted about
    the wiped data are void;
  - a route synced from the EFB follows the same rule: one that is in FPL 0 at the power-on (synced while the unit was
    off) is wiped with the rest, and one synced after the power-on is new data and loads as always;
  - `VolatileMemory.reset` treats such a power-on as a long interruption (6-5), because the RAM that carries a short
    one is held by the same battery;
  - the clock is lost: it starts at 1 JAN 1988 00:00:00 UTC (`WIPED_CLOCK_MS`, the year the date editors default to),
    which the Self Test page then shows. The receiver's almanac and every ephemeris are erased, and there is no stored
    position. In REAL and in FAST alike the receiver then does an almanac search (`GpsSearch.begin`, the existing start
    model, ORS 01 6-30). **Entering the date, the time or the position (3-5, 3-17 to 3-19) does not shorten that
    search**: a receiver without an almanac has to collect one first. What the date entry on SET 2 does correct is the
    era (see the clock below);
  - **FAST does nothing at a power-on with a wipe** (maintainer, 2026-11-08), nor does a switch to FAST on SET 10 later in
    that power-on (`GPS.startFast`). FAST stands for a unit that was just on and starts hot from a current memory; a
    wiped memory has none. The next power-on is normal again once the battery is repaired. `fastGpsAcquisition` itself
    is not wiped;
  - an engine-running start keeps its forced acquisition (`WelcomePage`, `acquireAndUseSatellites`): it stands for a unit
    that was on before the session began and would have collected its almanac by then. Its instant fix computes the
    date in the era of the 1988 clock, which is the rollover date of the next section;
  - with no stored position there is nothing to compare the first fix with, so `POSITION DIFFERS FROM LAST POSITION BY
    >2NM` does not show after a wipe (B-3); the flag ends with the first fix or the next power-on;
  - the STA 4 operating hours and power cycles restart at 0 (5-31), with this power-on counted, so the cycles read 1;
  - a 1987 or 1988 clock is before the end of the database cycle, so `DATA BASE OUT OF DATE` does not post while the clock
    stays in that era (the message latches on a change from current to expired, so a later date entry on SET 2 in the
    current era can post it);
  - kept: the failure state, the battery state and the fictional SET 10 settings (not the unit's memory),
    `userDataFormat` (it says the stored slots are V2, which the persistors write after a wipe too) and the EEPROM's
    calibration values (a settings category of their own, see the EEPROM). The storage's kept keys are
    `KEPT_USER_SETTINGS`.
- **`RCVR HARDWARE ERROR:` / `0008`** (IM C-3): the receiver's battery-backed RAM failed its check and was cleared; the
  manual names the loss of the receiver's backup among the causes. It shows from the first navigation page of a power-on
  with a wipe until the receiver tracks its first satellite in it (`GPS.tracksSatellite`: a real satellite in a channel in
  an acquired state, as STA 1 shows it), so at a cold-and-dark start it shows during the blind search and at an
  engine-running start, whose forced acquisition tracks satellites at once, it does not. That the code ends with the
  first satellite also for this cause is the design's reading of the manual (2026-11-08), not its pairing. It is a
  message of its own beside `0010` of the antenna; both can be listed.
- A failed battery stays failed until repaired, so the data is lost again at every power-on.
- **FLR 2 is no service** (maintainer, 2026-11-08): it repairs the failure only. The battery works again, but the health
  stays where it is (a battery at 0 % may be drawn again by the trigger), the data already lost stays lost, and the
  unit's clock is not corrected: a wrong era stays. **FLR 1 `SERVICE?`** stands for the unit brought to a shop: it
  repairs every failure, sets the health to 100 % (the latest date stays) and sets the unit's clock to the true date and
  time (`Battery.service`, `GPS.serviceClock`), also with a fix: while the unit has a fix every tick takes the era from
  the unit's own clock, so a corrected clock stays corrected. The data lost by a wipe stays lost.
- The first session after this feature is installed starts with a new battery: health 100 % and the session's sim
  date as the latest date seen.

#### The clock across sessions

The unit's clock is battery-backed, and on a real unit a wrong era stays until the pilot enters the date on SET 2
before the next fix. The simulation keeps it (maintainer, 2026-11-08):

- The user setting `clockOffset` (milliseconds, default 0) holds the clock as its offset from the sim time.
  `GPS.saveClock` writes it whenever the clock is set other than by running (a fix and its time update, a date or time
  entry on SET 2, `SERVICE?`, FAST, the wipe) and at a power-off; `savePosition` saves it too. The wipe resets it with
  every other key and then writes the offset of the 1988 clock.
- At the construction of `GPS` the clock is the sim time plus the stored offset, with the random ±2.5 s as before (the
  drift while the unit was off). The default 0 keeps a first start, and every unit whose clock was right, in the
  current era as before. One deliberate exception to "a failure changes nothing while failures are off": a clock that
  is wrong at the end of a session stays wrong in the next.
- A first fix computes its date in the era of the unit's own clock (`calculateGPSTime`), so with the 1988 clock and a
  sim date in 2026 the date comes out two eras early, about 1987, and with a date entered on SET 2 in the current era it
  comes out right. `SYSTEM TIME UPDATED TO GPS TIME` follows as for any large correction.
- **FAST keeps the unit's era**: `initializeFromTruth` sets the true date and time moved into the era of the unit's
  clock (the true time minus the whole eras the unit is off), not the true time itself. The receiver, which works modulo
  the era, then sees an exact clock and the start stays hot. Otherwise every FAST power-on would correct a wrong era kept
  after an FLR 2 repair. With the clock in the current era nothing changes.

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
  (`"<ATC MODEL>.profile_1"`): the MTBF, the active failures with their drawn values, and the battery state (the
  health and the latest sim date seen). The unit's clock offset is a user setting (`clockOffset`, see the battery): it is
  battery-backed memory of the unit and the wipe resets it. The EEPROM's calibration values are properties of the unit, not of a failure,
  and have a settings category of their own (see the EEPROM). The drawn values are numbers in the failure's setting
  text (`Failures.values`, `setValues`):
  - the jammer: its place `lat` and `lon`, its power `powerDb` and its reference altitude `refAglFt`;
  - the spoofer: the same, plus the false position `falseLat`, `falseLon` and `falseAltFt`, the time shift `shiftMs`
    and the clock offset `clockM`;
  - the faulty satellite: its PRN `prn`, its bias `biasM` and its ramp `rampS` and `elapsedS`.
- A jammer is saved at its generation, a spoofer once its airport search has resolved. The reference altitude is saved
  again when it has grown by 500 ft. Values that do not parse (a hand-edited profile) are drawn anew by the placement
  rules. #460's jamming ramp (`rampS`, `finalDb`, `elapsedS` of `gpsJamming`) was never released, so no stored ramp
  needs handling.
- **It lives in its own settings manager**, added to `KLN90BSettingSaveManager`, so that the battery's wipe of the
  user memory leaves it alone.
- New keys only, with defaults that mean "nothing failed, MTBF off, new battery" (`batteryHealth` 100, `batteryDate` 0,
  and in the user settings `clockOffset` 0). Changes are saved when they happen.
- Detection is not persisted; it runs again after every power-on.

## Repair

- FLR 2 repairs one failure; FLR 1 `SERVICE?` repairs every failure, installs a new battery (health 100 %) and sets the
  unit's clock to the true date and time (see the battery).
- A repair ends the effect at once: the port works from the next tick, the lamp follows its command, the receiver
  acquires again, the message condition ends. Data lost by a dead battery stays lost, and a clock in the wrong era stays after FLR 2.
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
- `SERVICE?` is a button on line 6. ENT shows `CONFIRM?`; ENT again repairs everything, installs a new battery and sets the clock,
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
  trip of every key. For #465: the transmitter physics (`GpsTransmitter.test.ts`: the horizon, the diffraction loss,
  the antenna's gain in level flight and banked, the noise rise, the fake SNR's cap, the edges); the transmitters'
  placement, leaving, reference altitude and persistence (`failures/Transmitters.test.ts`); the fake receiver's search
  rule, claims, acquisition times and lock rule (`failures/FakeReceiver.test.ts`); the range errors, the reference
  state and the velocity error (`failures/RangeErrors.test.ts`); the residual test and its thresholds
  (`GpsSolution.test.ts`); the recovery rules of the start model (`GpsSearch.test.ts`).
- Render: FLR 1 to 3 (fields, prompts, lists, SERVICED), SET 10's button, the messages and TEST FAIL, OTH 9/10 dashes,
  the screen shift; STA 1 with fake satellites, their flat SNR and their fake-sky elevations once captured, and in the
  mixed phase (`pages/Sta1Spoofing.test.ts`).
- A booted unit flown on simulated time: each failure's effect on the outputs (`test/render/Interconnect.test.ts` holds
  the SimVar-to-port table; a failed port must drop exactly its SimVars), the receiver failures, jamming, spoofing and
  the faulty satellite against the receiver model (`test/render/failures/`: flying into a jammer's range and below its
  horizon; flying into a spoofer, the mixed phase, capture with and without an altitude input and with many and few
  shared PRNs; flying out; a new transmitter after leaving; both together; power cycles, sessions, hot swapping and
  the repair; the airport search), the general time check and the recovery after a lost fix (`test/render/Gps.test.ts`),
  the battery wipe at a power-on.
- With MTBF off and nothing failed, the whole existing suite stays green unchanged, except the tests that pin the
  planner across a power-off with `Output.WriteGPSSimVars` set and those the exceptions of #465 touch (the anti-goals).
- Sim, before release: the failed ports with a hot swap to another GPS unit (the zeroing itself was tested on
  2026-11-03, #462); jamming, spoofing and an antenna failure with a Working Title GNS beside the KLN, which must keep its
  position; a jammer approached in a jet and in a prop.

## Out of scope

- Regional jamming and spoofing triggers from real-world areas (a later issue).
- A failure API for aircraft (an LVar or H event to fail a component from the aircraft's own failure system).
- The EFIS receiver failure, the database cartridge failure (see the anti-goals), the
  altitude alert tone (it is a sound with no port).
- The Appendix B messages that are not failures and are still missing: `APT ELEVATION UNKNOWN`, `POSITION OF WPT HAS
  CHANGED`, `POSITIONS OF OTHER WAYPOINTS HAVE CHANGED`. They belong in issues of their own.
- Satellite health flags from the control segment (STA 1 health `B`).
