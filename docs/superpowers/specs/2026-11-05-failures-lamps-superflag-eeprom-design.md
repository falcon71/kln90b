# Failures: the annunciators, the superflag and the EEPROM (#459) — design

Date: 2026-11-05. Size: a project, one `fixes #459` commit on the branch `issue-459-lamps-superflag-eeprom`, with this
document in it. Part 2 of #366, on top of the framework of #458
([2026-11-04-failures-framework-design.md](2026-11-04-failures-framework-design.md)). The behavior is specified in
[docs/failures.md](../../failures.md); this document says how part 2 builds it and settles what that document leaves
open for this part. Where the two disagree, this document wins for #459 and `failures.md` is updated in the same commit.

## Intent

The pilot practices what Appendix B expects when a lamp, the NAV superflag or the EEPROM fails: notice that a lamp
stayed dark or stays lit, read the message, stop trusting the external CDI or an instrument on the superflag, and
check the screen, which still tells the truth (failures.md, Intent; B-2, B-3).

## Goals

- The lamp failures `…Bulb`, `…Wiring` and `…Driver` for each of MSG, WPT, ARM and ACTV, eligible while the lamp is
  declared (`Output.ExternalAnnunciators.…Installed`), ARM and ACTV also only while `Output.WriteGPSSimVars` is set
  (failures.md, The failure catalog, Annunciators).
- `GPS APPROACH MODE` with the bits of a dark or stuck ARM and ACTV changed instead of the write dropped.
- `superflag`: `L:KLN90B_HSI_TF_FLAGS` 0 and `GPS IS ACTIVE WAY POINT`/`FLIGHT PLAN` false, the deviation working,
  `NAV SUPER FLAG FAILURE`, TEST FAIL (NAV superflag).
- `eeprom`: `EEPROM FAILURE: IC1045` / `EXTERNAL D-BAR INVALID`, the screen off center and `GPS WP CROSS TRK` with a
  gain and zero-point error, both from the unit's own calibration values, which are drawn once and kept with its user
  settings; TEST FAIL (EEPROM).

## Non-goals

- The failures of #460 (receiver, jamming, spoofing, faulty satellite) and #461 (battery).
- A sim test. failures.md's Testing section asks for sim tests only of the failed ports in a hot swap and of the
  receiver failures, none of which this part changes (my call).
- Changing the screen's mode texts, the status line `MSG` or `L:KLN90B_AnnunTest`: they never fail (Annunciators).
- The STA 4 counters. The Pilot's Guide (5-31) resets them when the nonvolatile memory is cleared, so they go with the
  battery (#461), not the EEPROM (maintainer, 2026-11-05; failures.md and #461 updated).
- OBS CAL (STA 3). It calibrates the OBS resolver input to the installed indicator (IM 2-65), not the D-bar output, and
  in the sim, whose course is exact, a calibration value other than 100 would make a working unit read the course
  wrong (maintainer, 2026-11-05).
- A mechanism for values drawn per failure. #460 needs one for spoofing and the faulty satellite and builds it; the
  EEPROM's calibration values belong to the unit, not to one failure.

## Anti-goals

- **Any change while failures are off.** With nothing failed every existing test stays green and every output is
  written with today's values. The one structural change, the superflag SimVars moving to a port of their own, writes
  the same values at the same moments. The calibration values drawn at the start are stored, but change no output
  while the EEPROM works.
- A lamp failure that the screen also shows: the screen tells the truth (Appendix B).

## Constraints

- The public contract (CLAUDE.md): no LVar, H event or panel.xml key changes meaning. The lamp LVars and `GPS APPROACH
  MODE` keep their meaning; a failure changes their values as a real failure would. No new panel.xml key.
- New persisted data with new keys only: the new failure keys in the failure settings manager hold `"{}"` as the #458
  failures do; the EEPROM's calibration values are the keys of a new EEPROM settings manager, with defaults (CLAUDE.md,
  persisted user data).
- The ports are asked on every write, so the failure checks allocate nothing (`Failures.isOutputFailed`'s rule).
- DOM changes only in display ticks: the screen shift is set in a display tick.

## Approaches

One part was fixed by failures.md: a lamp failure changes the value at the lamp's output. The choice was where the
superflag and the EEPROM's deviation live.

1. **Mostly in the ports (chosen by the maintainer, 2026-11-05).** The lamp ports change the value; the superflag is a
   port of its own, split from the analog nav port, that fails like any #458 port; the EEPROM's deviation error is
   applied by `SensorsOut` where the deviation is written, because it is a wrong value on a working port, not a port
   that stops. The superflag gets the null-state writes of #458 (at the failure, at a power change, at a hot-swap
   resume, at the runtime switch-on of `L:KLN90B_WriteGpsSimvars`) without new code.
2. Everything in `SensorsOut`, each setter asking the failures. Rejected: it repeats the null-state cases #458 built for
   ports, and failures.md puts the lamp changes in the ports.
3. Lamps in the ports, the superflag in `SensorsOut`. Rejected: the superflag would need its own code for every
   null-state moment that a failing port already covers.

## The structure

### The catalog

New entries in `FAILURE_CATALOG`, with the FLR names, messages and flags of failures.md's table:

| Key | Random | TEST FAIL | Outputs | Message | Detection |
|---|---|---|---|---|---|
| `msgBulb` … `actvBulb` | yes | no | none | none | none |
| `msgWiring` … `actvWiring` | yes | no | none | `CHECK MSG ANNUNCIATOR` … | commanded on, the lamp's signal |
| `msgDriver` … `actvDriver` | yes | yes | none | `MSG ANNUNCIATOR FAIL` … | commanded off, the lamp's signal |
| `superflag` | yes | yes | `superflag` | `NAV SUPER FLAG FAILURE` | commanded on (valid), the superflag signal |
| `eeprom` | yes | yes | none | `EEPROM FAILURE: IC1045` / `EXTERNAL D-BAR INVALID` | internal |

- `Detection` gains `'commandedOn'` and `'commandedOff'`, and a definition names the signal it watches
  (`msg`, `wpt`, `arm`, `actv`, `superflag`). For the superflag, "on" means commanded valid.
- A lamp failure names its lamp and its kind (`bulb`, `wiring`, `driver`), so that the ports can ask "what is wrong with
  this lamp" without a list of keys.
### The unit's EEPROM calibration

- The display alignment (SET 10) and the D-bar calibration (SET 11) are shop calibrations that correct the unit's own
  CRT, yoke and parts (CMM 1024 to 1028). A failed EEPROM falls back to nominal values and shows the uncorrected
  errors, the same at every failure (maintainer, 2026-11-05).
- **Stored as the real unit stores them, in a settings category of their own** (maintainer, 2026-11-05: properties of
  the unit, not of a failure, and not of the battery-backed memory). A new manager for the EEPROM, built like
  `KLN90BFailureSettings` (a `getManager(bus)` singleton) and added to `KLN90BSettingSaveManager`, holds exactly four
  keys, each with the default 0:
  - the two centering offsets in CRT pixels, horizontal and vertical (the inner and outer knob of SET 10);
  - the two D-bar calibration points, each the command in nominal millivolts that put out exactly +300 mV and −300 mV
    (SET 11 calibrates at both, CMM 1027 to 1028).
- **What each settings category stands for** (maintainer, 2026-11-05). `KLN90BUserSettings` was taken for "the unit's
  properties" and nearly got the EEPROM's values, which #461's wipe would then have erased. Each settings class gets a
  header comment saying which memory of the unit it stands for:
  - `KLN90BUserSettings`, `KLN90BUserWaypoints`, `KLN90BUserFlightplans`, `KLN90BUserRemarkSettings`: the
    battery-backed nonvolatile memory, which a failed battery wipes (#461). `KLN90BUserSettings` names its keys that
    are not that memory: `userDataFormat` (it describes the storage) and the fictional SET 10 setting
    `fastGpsAcquisition`.
  - `KLN90BFailureSettings`: fictional, the simulation's own state, not memory of the unit.
  - The new EEPROM manager: the unit's serial EEPROM (IC1045, 256 bits), which needs no battery and holds the CRT
    centering and the D-bar calibration (CMM 67, 1024 to 1028).
- **Drawn when the settings are read** (maintainer, 2026-11-05): after `KLN90BSettingSaveManager.load` in
  `KLN90BCore`, each key still at its default 0 gets its value, and the save manager stores it. No draw gives 0, so 0
  means "not drawn". A new installation and an existing profile both get theirs at their next start, and nothing draws
  them again: not a failure, a repair, `SERVICE?` or #461's wipe of the user memory, which does not reach this
  category. The random source is injectable, so tests steer it.
- The draws (failures.md, guesses): each centering offset 2 to 6 CRT pixels with a random sign. The D-bar points from a
  gain `g` of 0.7 to 1.3 and a zero point `z` of −45 to +45 mV (±30 % of the 150 mV of full scale): plus
  `(300 − z) / g`, minus `(−300 − z) / g`, which lie between about 196 and 493 mV on either side, never 0.
- **Applied while `eeprom` is effective:** the unit commands nominal values, so the output follows the line through
  the two points, gain `600 / (plus − minus)` and zero point `300 − gain × plus` mV. The deviation written is
  `filtered × gain + (zeroPoint / 150) × full scale`. The screen is shifted by the centering offsets × `ZOOM_FACTOR`.
- Reading four number settings allocates nothing, so the 16 Hz write needs no cache. A stored 0 (not reachable after
  the start's draw) reads as neutral: no shift, and a D-bar point of 0 as its nominal ±300 (my call).
- Legibility: the maintainer checked in the sim on 2026-11-05 that the screen, the FLR pages included, stays readable
  shifted by 6 CRT pixels, although the outer characters reach past the margin (4 CRT pixels horizontally, 3
  vertically).

### The lamp ports

- MSG and WPT become a lamp port: an `OutputPort` that, outside a null-state pass, writes false for a dark lamp (bulb
  or wiring) and true for a stuck one (driver), whatever is commanded. Inside a null-state pass it writes the value it
  gets, so the power-off and power-on writes leave every lamp dark, a stuck one included: the stuck driver runs on the
  unit's own supply (Annunciators).
- `ApproachLampGroup` changes the bits of `GPS APPROACH MODE` the same way outside a pass: a dark ARM clears bit 1, a
  dark ACTV clears bit 2, a stuck ARM sets bit 1, a stuck ACTV sets bit 2. Inside a pass it passes the value through.
  It still writes only through the `Output.WriteGPSSimVars` gate.
- If both a dark and a stuck failure are active on one lamp (possible from FLR 3), dark wins: a stuck driver cannot
  light a bulb that is burnt or bypassed by a short. Rule: dark if bulb or wiring, otherwise lit if driver (my call).
- The ports ask the failure state through `PortFailureSource`, which gains a lamp question (`lampFault(lamp)`:
  `'dark' | 'stuck' | null`); `NO_FAILURES` answers null.
- **The stuck lamp before the first write.** The MSG and WPT lamps are written by the status line, which first runs on
  the Self Test page, so on the welcome page a stuck MSG or WPT lamp is still dark from the power-on pass. The welcome
  page lasts a few seconds; the builder may add a write at the power-on if it is simple, otherwise this stays (my call).

### The superflag port

- A new output port `superflag` (P901 pin 18, NAV SUPERFLAG, Installation manual 1-7, 2-5), failed by `superflag`. It
  carries the sim's stand-ins for the flag: `L:KLN90B_HSI_TF_FLAGS` and `GPS IS ACTIVE WAY POINT`/`FLIGHT PLAN`, which
  move off `analogNav`. `GPS WP CROSS TRK` and `GPS CDI SCALING` stay on `analogNav`.
- A failed port writes its null state once and then nothing (#458), and that null state is exactly the failed flag: 0
  and false. `FailedOutputPort` gains `'superflag'`, so `FailureOutputs` writes it at the failure and at a re-claim.
- `test/harness/interconnect.ts`' SimVar-to-port table moves the three SimVars to the new port.
- **The boot.** The boot's null-state pass (`SensorsOut`'s constructor, `reset()`) does not write
  `L:KLN90B_HSI_TF_FLAGS`; only the power-off does. A superflag failure from an earlier session would leave whatever the
  LVar held (after an instrument reload, for example). So the boot also runs `FailureOutputs.writeFailedNullStates()`,
  which writes only failed ports and so changes nothing while failures are off (my call; not a new write in `reset()`,
  which would change the outputs with failures off).
- With `GPS IS ACTIVE WAY POINT` false the sim reports `GPS WP DISTANCE` 0 whatever the unit writes (sim test of
  2026-11-03, failures.md "A failed port in general"), so a superflag failure also takes the distance away from
  equipment that reads that SimVar. failures.md's superflag section and the wiki draft say so.

### What the unit commands

- The detection of wiring, driver and superflag faults needs what the unit commanded, not what the port wrote. The
  ports record it outside a null-state pass: each signal keeps two sticky flags, "commanded on since the last look"
  and "commanded off since the last look". The lamp ports record their boolean, `ApproachLampGroup` the two bits, and
  `SensorsOut.setToFrom` records the superflag (valid when `toFrom` is not null), because the failed port drops the
  write before it sees the value.
- Sticky flags, because the MSG lamp flashes at the display rate and the detector runs at 1 Hz: a sample would miss the
  phase. The detector reads and clears them every tick, and clears them when the ticks stop.

### Detection

- At the Self Test page every lamp is commanded on and the flag is valid (the test pattern), but detection starts with
  the first navigation page (#458). The maintainer decided (2026-11-05) that a wiring fault is found at every power-on,
  as failures.md says. So:
  - `FailureDetectionState` gains a set of *noticed* failures, reset at every power-on with the rest of the state.
  - Every tick, before the main-page check, a `commandedOn`/`commandedOff` failure whose condition was seen goes into
    the noticed set (only while effective).
  - From the main page on, a noticed failure is detected at once (no delay, like an internal failure), and a condition
    seen later is detected in the tick that sees it.
- So at a power-on: a wiring fault and the superflag are noticed on the Self Test page and shown with the first
  navigation page; a driver fault is found as soon as the lamp is commanded off, for MSG and WPT on the first navigation
  page without a message or alert.
- `eeprom` is internal: detected in the first tick of the main page (#458's rule).
- The messages follow the detection through `FailureMessage` (data/PersistentMessages.ts), unchanged.

### The EEPROM

- **The deviation.** `SensorsOut.setFilteredOutputs` writes `GPS WP CROSS TRK` with the gain and zero point of the
  calibration points (above) while `eeprom` is effective, with full scale the CDI scaling of the moment. Only this
  write: `L:KLN90B_XTK`, the internal CDI, the pages and the ARINC 429 and RS-232 outputs stay right. The null state of
  a power change stays 0 (the pin drops to 0 V without power). The zero point also shows while the deviation is
  flagged, as a miscalibrated pin does (my call).
- **The screen.** `PageContainer` shifts `#pageContainer`, which holds every page of the unit, the FLR pages included,
  by the centering offsets × `ZOOM_FACTOR` screen pixels in its display tick while `eeprom` is effective, and back at the
  repair; it sets the style only when the offset changes. The simulator's error pages (`ErrorPage`,
  `PanelXmlErrorPage`) are not the unit's screen and stay centered, so they stay readable.

### TEST FAIL

`Failures.anyTestFail()` covers the new entries through their flags: the drivers, `superflag` and `eeprom`.

## Tests

At the cheapest stage that observes each behavior (test/README.md):

- **Unit:** the catalog entries (names at most 11 characters, message lines at most 23, the eligibility of the lamps
  against `…Installed` and `writeGPSSimVars`, a runtime change of `writeGPSSimVars` included); the lamp port and
  `ApproachLampGroup` value changes for dark, stuck and both, and their pass-through in a null-state pass; the sticky
  command flags; the detector's noticed set before the main page and detection after it; the calibration values
  drawn at the start only for keys at 0, a stored value left alone, the draw ranges with a steered random source, the
  gain and zero point derived from the two points against hand-computed literals, the same values after a repair and
  a second failure, and the neutral reading of a 0.
- **Render:** each new message and TEST FAIL; the screen shift and its removal at the repair; the error pages
  unshifted.
- **Flight:** with each lamp failure, the lamp LVar or `GPS APPROACH MODE` over the self-test, a waypoint alert and an
  approach arm; a wiring fault's message at the first navigation page after a power-on; a driver fault found when the
  lamp is commanded off; the superflag's SimVars at the failure, at a power-on and at the repair, with the deviation
  live; the EEPROM deviation against the undisturbed `L:KLN90B_XTK`.
- With nothing failed, the existing suite stays green unchanged, the port table test included after the move.

The reviewers verify the tests by mutation (CLAUDE.md).

## Docs

- `docs/failures.md`, already updated with the maintainer on 2026-11-05: the EEPROM's calibration values as properties
  of the unit in a settings category of their own, drawn at the start and kept (the battery's wipe included), OBS CAL
  not affected, the STA 4 counters moved to the battery. With the build: the status line (#459 built); the ports
  table (the new superflag port); the detection rule for a condition seen on the Self Test page; the rule for
  a lamp with both a dark and a stuck failure; the superflag's `GPS WP DISTANCE` 0; "What the code needs first" loses
  item 5.
- `docs/architecture.md`: the lamp ports, the superflag port and the command flags, where the ports are described; the
  settings categories and the memory of the unit each stands for, where persistence is described.
- Wiki draft for the maintainer (External Annunciators: the dark and stuck lamps, and what the screen still shows),
  given in the session's report, not committed.

## Left to the builder

- Class, file, field and key names; where the calibration values are drawn and turned into the gain, zero point and
  shift (a small class in `kln90b/failures/` is the obvious place).
- How the definitions name their lamp and signal.
- How the tests fail a component (the #458 helpers).
