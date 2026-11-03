# Failure simulation

The specification of the unit's simulated failures (#366). It builds on the interfaces of #451
([superpowers/specs/2026-11-02-io-interfaces-design.md](superpowers/specs/2026-11-02-io-interfaces-design.md)) and the
receiver model of #453
([superpowers/specs/2026-11-01-gps-signal-loss-design.md](superpowers/specs/2026-11-01-gps-signal-loss-design.md)).
A behavior or value marked "guess" is not in the manuals; change it when a source turns up.

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
  triggered manually only.
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
- **Anti-goal: a failure that changes how the unit behaves while failures are off.** With MTBF off and nothing failed,
  every existing test stays green and every output is written exactly as today.
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
| `gpsSpoofing` | `SPOOFING` | none (`SYSTEM TIME UPDATED` / `TO GPS TIME`) | always | no | no |
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
  the condition and the message goes.
- **When a failure is detected** (CMM 1018/1019, CMM 25-26, guesses where the manuals are silent):
  - Interface inputs (`rs232In`, `rs232Data`, `airdata429`, `altitude`): within about 10 s after the data stops, as in
    the CMM loop-back test, and not all at the same moment. A bench video of a real unit with no RS-232 or air data
    connected (`KLN90B (1920p_59fps_VP9-160kbit_Opus).webm` in the maintainer's collection) shows the order at a
    power-on: `NO RS-232 DATA` as soon as the first navigation page is shown (00:36), and `ARINC 429 AIR DATA FAIL`
    about 5 s later (00:41). The MSG page then lists both, the newest first, and the MSG prompt stays on. So at a
    power-on the RS-232 input is checked when the first navigation page shows and the ARINC 429 receivers 5 s later;
    in operation, a loss shows after a delay drawn from 2 to 10 s (guess).
  - Unit-internal failures (`gpsAntenna`, `gpsReceiver`, `eeprom`, `arinc429Out`, `rs232Out`): in the next calculation
    tick.
  - `superflag`: while the flag is supposed to be valid (navigation valid or the self-test pattern).
  - `…Wiring`: while the unit commands that lamp on. The driver senses overcurrent only then (CMM 25-26).
  - `…Driver`: while the unit commands that lamp off (see the annunciators).
  - After every power-on the detection starts again, with the same rules. The self-test lights every lamp, so a wiring
    fault is found at every self-test.
- **TEST FAIL** (3-4): while a failure marked "TEST FAIL" in the catalog is active, the Self Test page shows the
  flashing `TEST FAIL` in place of `ANNUN ON`. This path is separate from the start-up failure of #416:
  it posts no `DATA BASE CHECKSUM ERR` and does not touch `memory.selfTestFailure`. The pilot can still approve the
  page, and the failure's own message is on the MSG page.
- **`ALTITUDE FAIL`** today is a static check of the configuration (`AltitudeFailMessage`: an IFR unit with no
  altitude input). It becomes: the existing configuration case, **or** a configured altitude input that delivers no
  altitude, on any unit (guess). An air data failure (`rs232In`, `rs232Data`, `airdata429`) that takes the altitude
  away therefore shows `ALTITUDE FAIL` as well as its own message (B-1).
- While `gpsAntenna` or `gpsReceiver` is active, the signal and RAIM messages of #453 are not posted; the hardware
  message names the cause (guess).

## The failures

### A failed port in general

A failed output port sends nothing, so the receiving equipment loses its data, for that port only:

- At the moment of the failure, and at a power-on while failed, the port writes its null state once, then nothing
  until repaired:
  - the `L:KLN90B_*` outputs on it get what `SensorsOut.setPoweredOff` writes: `L:KLN90B_RollCommand` 0,
    `L:KLN90B_XTK` 0, `L:KLN90B_IntegrityWarn` false, `L:KLN90B_GPS_WP_BEARING` 0, and so on;
  - **the GPS SimVars on it are zeroed too**: the null state `SensorsOut.reset` writes at every power change (#462),
    limited to the SimVars of the failed port. It has no `K:GPS_OBS_ON`/`OFF` event (the LEG/OBS switch belongs to the
    aircraft), writes `GPS WP CROSS TRK` 0 itself (only the signal tick writes it otherwise), and `setWPIndex` keeps the
    index within the count. A GPS-coupled autopilot then loses its guidance instead of following a frozen DTK.
- The power-off write of a failed port is dropped, which is fine: the port already holds its null state.
- **The hot-swap crash (#462).** `GPS FLIGHT PLAN WP INDEX` above 0 with `GPS FLIGHT PLAN WP COUNT` 0 crashes MSFS 2024
  to desktop when another GPS unit takes over in a hot swap. The old null state wrote that pair, which is why it was
  disabled after a crash in FS2020. `setWPIndex` now keeps the index within the count for every caller, the failed
  ports included. The synthetic zeroing test ran in the sim on 2026-11-03 and found the cause
  ([sim-flight-record.md](sim-flight-record.md)).
- **What the zeroing does to an autopilot** (the Duke's default autopilot, 2026-11-03): a failed analog nav port
  (`GPS IS ACTIVE WAY POINT` false, deviation 0) drops it from NAV to HDG at once, and it stays in HDG after the repair.
  Failed ARINC 429 nav data alone leave it in NAV, tracking on the deviation. With `GPS IS ACTIVE WAY POINT` false the sim
  reports `GPS WP DISTANCE` 0, whatever the nav data port writes.
- A failed input port reports `isReceiving` false. Its readers treat the value as missing (null, shown as dashes).
- After a repair the port works again from the next tick.

### GPS antenna (`gpsAntenna`)

A loose or shorted antenna coax, the RF failure of IM C-4. The receiver sees no satellites. The unit:

- loses every satellite at once (inhibited in the SDK), and the navigation flags as with any loss of the fix;
- shows `FAILR` as the STA 1 state (5-29) with no satellite rows, and dashes for the EPE on STA 2;
- runs its clock on, as without a fix.

### GPS receiver (`gpsReceiver`)

The receiver module stops talking to the host (`NO RCVR DATA`, B-3: no navigation at all). The effect on the screen is
the same as `gpsAntenna`: STA 1 shows `FAILR` with no satellite rows. The guide describes `FAILR` simply as a receiver
failure (5-29), which covers this case too, and documents no other state for it.

### GPS jamming (`gpsJamming`)

Triggered manually only. Regional triggers from real-world jamming areas are a later issue. Every
satellite is lost, so the unit shows exactly what a loss of signal shows (#453): satellites drop off STA 1, then `RAIM
NOT AVAILABLE`, then `SATELLITE COVERAGE INADEQUATE FOR NAV` and the NAV flag. There is no message of its own. After
the repair the receiver acquires again as after any loss of signal.

### GPS spoofing (`gpsSpoofing`)

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

- At the failure, pick one satellite in use (guess: the highest one) and persist its PRN.
- While that satellite is in use, its pseudorange carries a bias (guess: growing over a few minutes to a drawn 500 to
  3000 m, as a clock jump does). The position error follows from the bias through the geometry of the solution
  (the coefficients `GpsSolution` computes, which its header anticipates for this), so it depends on the satellites in
  use and can be larger than the bias.
- While it is in use **and RAIM is available** (the existing availability of `GpsSolution`, which says whether a fault
  could be detected), the unit shows `RAIM POSITION ERROR` / `CROSS CHECK POSITION` (B-3). The KLN 90B detects the
  fault but does not exclude the satellite (guess: the manuals describe only detection). Without RAIM the error is
  undetected.
- A detected fault has the consequences of a loss of RAIM (#453; guess, the manuals give only the message):
  `L:KLN90B_IntegrityWarn` is true, approach active cannot be entered, and in approach active the NAV flag and `PRESS
  GPS APR FOR NAV` follow (6-20). En route the navigation stays valid.
- When the satellite sets or leaves the solution, the error and the message go. The repair ends it.

### EEPROM (`eeprom`)

The serial EEPROM holds the CRT centering offsets and most likely the D-bar calibration (CMM). Appendix B: the external
CDI driven by the unit must not be used, the rest of the unit including the internal CDI works, and the pages may
not be centered.

- **The screen is off center.** At the failure, draw an offset (guess: 2 to 6 CRT pixels, that is 8 to 24 screen
  pixels, in each axis, either sign) and shift the whole screen content by it. The change happens in a display tick.
- **The external deviation is wrong.** At the failure, draw a scale error (guess: 0.7 to 1.3) and an offset (guess:
  up to ±30 % of full scale). `GPS WP CROSS TRK` carries the deviation with them. The internal CDI, the
  XTK on the pages and the digital outputs stay right.
- Both drawn values are persisted with the failure.
- **The STA 4 counters are lost.** The operating hours and power cycles are assumed to live in the EEPROM (see the
  battery), so a failed EEPROM cannot keep them: at the failure, and at every power-on while it is failed, they
  restart at 0. A repair (a new EEPROM) does not bring them back.

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
  is lit whenever the unit is on and goes dark with the unit, as `setPoweredOff` writes it (guess).
- `L:KLN90B_MsgLight` and `L:KLN90B_WptLight` hold false for a dark lamp and true for a stuck one, every display tick.
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
    the Self Test page then shows), so with the almanac and the last position also gone the receiver does an almanac
    search, unless the pilot enters the date, time and position (3-5, 3-17 to 3-19, the existing start model);
  - with no stored position there is nothing to compare the first fix with, so `POSITION DIFFERS FROM LAST POSITION BY
    >2NM` does not show after a wipe;
  - kept: the STA 4 operating hours and power cycles (guess: hour counters are usually kept in EEPROM so that they
    need no battery, and a few bytes fit next to the calibration; a failed EEPROM loses them, see the EEPROM), the failure state, the battery state and the
    fictional SET 10 settings (not the unit's memory), and `userDataFormat` (it describes the storage, not data).
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
  shift, faulty PRN and error, EEPROM offsets), and the battery state (the health and the latest sim date seen).
- **It lives in its own settings manager**, added to `KLN90BSettingSaveManager`, so that the battery's wipe of the
  user memory leaves it alone.
- New keys only, with defaults that mean "nothing failed, MTBF off, new battery". Changes are saved when they happen.
- Detection is not persisted; it runs again after every power-on.

## Repair

- FLR 2 repairs one failure; FLR 1 `SERVICE?` repairs every failure and installs a new battery (health 100 %).
- A repair ends the effect at once: the port works from the next tick, the lamp follows its command, the receiver
  acquires again, the screen recenters, the message condition ends. Data lost by a dead battery stays lost.

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
| Analog nav | 18-22, 25 | `GPS WP CROSS TRK`, `GPS CDI SCALING`, `GPS IS ACTIVE FLIGHT PLAN/WAY POINT`, `L:KLN90B_HSI_TF_FLAGS` | never as a whole; `eeprom` changes the deviation, `superflag` the flags |
| OBI | 10-12 | `L:KLN90B_GPS_WP_BEARING` (default) | `rmiOutput` |
| Annunciators | 14-17 | the lamps | the lamp failures, through the value changes above |
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

This section describes the code before #366 and is removed once #366 is implemented. These changes come before the
failures that need them.

1. **The ports ask nobody.** `SimVarOutput.isTransmitting` and `SimVarInput.isReceiving` return true, and
   `InputPort.read` ignores `isReceiving`. `Interconnect` needs the failure state, and the null-state write (including the GPS SimVars of the port) at the
   moment a port fails.
2. **The air data values cannot be missing.** `Airdata.tas`, `mach`, `sat` and `tat` are plain numbers, and OTH 9 and
   10 assume valid values (`pressureAltitude!` in `Oth10Page`). They become nullable and the pages show dashes. The
   fuel computer values need the same check.
3. **`ALTITUDE FAIL` is static** (`AltitudeFailMessage`, see above).
4. **No runtime wipe of the user memory.** User data is restored only in `KLN90BCore.asyncInit`. A dead battery at a
   power-on within a session needs a path that resets the flight plans, the user waypoints in the facility
   repository, the remarks, the user settings and the clock in memory, and through them in storage. The restore error
   path (empty plans and `USER DATA LOST`) is the closest existing code. The receiver's memory is private SDK state:
   the almanac time (`lastAlamanacTime`) and each satellite's `data.lastEphemerisTime`, which `GPS` sets only at
   construction from the stored settings (`Gps.ts`). The clock has no stored value at all: `GPS` takes it from
   `E:ABSOLUTE TIME` at construction. The wipe needs a way to erase the first and to set the second at a power-on.
5. **Satellite inhibits have one owner.** `GpsSearch` sets the inhibits when its search changes mode, and `end()`
   lifts them all: at every power-on through `start()`, and through `acquireAndUseSatellites` (SET 10 FAST, an
   engine-running start, `WelcomePage.leaveFailed`). With FAST it never inhibits anything. The receiver failures and
   jamming need an "inhibit all" that survives all of these, merged with the search's own choice.
6. **RAIM has no fault model.** `GpsSolution` judges the geometry only. The faulty satellite uses its availability as
   "a fault would be detected" (see above), so no residual model is needed, but the satellite's bias must be mapped
   into a position error through the solution's coefficients and added to the measurement (`GpsMeasurement`), as
   spoofing's false position is. The detected fault also feeds the integrity output and the approach gate, which
   today read only the RAIM availability.
7. **`SYSTEM TIME UPDATED` is checked only at acquisition** (`GPS.gpsAcquired`); spoofing needs the check while a fix
   is held (see spoofing).
8. **TEST FAIL belongs to #416 today.** `SelfTestLeftPage` shows it for `memory.selfTestFailure`, and
   `WelcomePage.leaveFailed` posts `DATA BASE CHECKSUM ERR`. The failure path is separate.
9. **No injectable randomness.** The trigger and every drawn value need a random source and clock the tests control.
10. **`ApproachLampGroup`** passes values through; it gets the bit changes above.

Already possible without new structure: the FLR pages (pushed left page with its own tree, `Button`, the list pattern
of APT 7/8 and the OTH pages), the screen shift (a style change in a display tick), spoofing (the measurement
strategy).

## Public contract

- New: the panel.xml key `Output.RmiInstalled` (default false), parsed like the annunciator keys.
- New persisted keys, in their own settings manager. No existing key changes meaning.
- No H event or LVar changes. The outputs keep their meaning; a failure only changes their values as a real failure
  would.
- Wiki (the maintainer updates it): a new page for the failures and the FLR pages; panel.xml
  customization (`Output.RmiInstalled`); External Annunciators (dark and stuck lamps); RMI (the new key).

## Testing

Each behavior gets a test at the cheapest stage that can observe it (CLAUDE.md, `test/README.md`):

- Unit: the trigger (rate, equal choice, eligibility, no double failure) with an injected random source; the battery
  aging (forward only, set back, the rate range, the 1.5 % warning); the eligibility rules against the plane settings; the persistence round
  trip of every key.
- Render: FLR 1 to 3 (fields, prompts, lists, SERVICED), SET 10's button, the messages and TEST FAIL, OTH 9/10 dashes,
  the screen shift.
- Flight: each failure's effect on the outputs (`test/render/Interconnect.test.ts` holds the SimVar-to-port table; a
  failed port must drop exactly its SimVars), the receiver failures, jamming, spoofing and the faulty satellite
  against the receiver model, the battery wipe at a power-on.
- With MTBF off and nothing failed, the whole existing suite stays green unchanged.
- Sim, before release: the failed ports with a hot swap to another GPS unit (the zeroing itself was tested on
  2026-11-03, #462).

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

- The order of the work and how it is split into commits (CLAUDE.md wants one commit per issue: either one
  `fixes #366` commit, or sub-issues the maintainer opens).
- The names of the persisted keys and of the new classes.
- How jamming's loss looks over the first seconds (all at once, or the satellites dropping over a few seconds).
- The default clock date after a battery wipe.
- Whether `TEST FAIL` also flashes when a failure starts while the Self Test page is shown.
