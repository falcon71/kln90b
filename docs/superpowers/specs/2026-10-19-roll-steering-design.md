# Roll steering rework: design

Date: 2026-10-19. Issues: #100, #373, #403 (found while preparing this). Branch: `roll-steering-design`.

The maintainer wrote `RollSteeringController` without any documentation of how the real unit steers and expects it to
be overcomplicated. It may be reimplemented from scratch. This document says what the new roll steering does and why.

## 1. Intent

`L:KLN90B_RollCommand` is the bank angle the unit asks a coupled autopilot to fly (ARINC 429 label 121 on the real
unit). Today it is computed by three separate cases (on track, no intercept, optimal-bank intercept) with a
great-circle intersection search. The case switches and the geometry against the wrong path produce:

- **#100**: a wrong-way bank for a few seconds when turn anticipation starts, a bank that collapses mid-turn at the
  end of a DME arc, and a wrong-way bank far left of a leg on a parallel track (the `xtk < 0.1` test without `abs`).
- **#373**: on a final zero-length leg (…, Y, Y) it steers on the degenerate path of the leg Y - Y instead of the
  incoming course that `NavCalculator` uses.
- **#403**: in OBS mode it steers on a DTK of 000, because `NavCalculator` leaves `desiredTrack` null there.
- A turn reversal when the active leg lies behind the aircraft: in the maintainer's video (Aspen Evolution PFD with
  the KLN 90B, about 14:00) the command went right for about 6 s, left for about 20 s, then right through a full
  turn of about 220°.

The replacement is one continuous control law, taken from the MSFS avionics framework's lateral guidance, with the
intercept shaped by what the KLN 89 trainer does. It steers on the same path `NavCalculator` navigates on.

**Success:** the rework is better than the current code in every situation of section 6, and never worse, on the
metrics section 6 names. The maintainer's anti-goal: code that is worse than what it replaces. The capture time is
the one exception: the trainer's look-ahead joins more slowly than the old code's late, hard turn-on, and the
maintainer chose the trainer (2026-10-19). It may also suit a sluggish autopilot better.

## 2. Evidence

**Maintainer decisions (2026-10-19, in chat).**
- The avionics framework's lateral guidance is the starting point. It is widely used and tested, and its license
  allows reuse.
- The intercept follows the KLN 89 trainer's 30 s look-ahead, not Garmin's tangent-turn curve: "we are modelling the
  KLN, not a Garmin".
- Both aircraft that currently read the roll command smooth it themselves. The unit outputs the raw command with no
  rate limiting.
- The command is calculated at 1 Hz. The class doc comment says why, with the sources below, so that the decision can
  be cited later.
- `GPS COURSE TO STEER` is not used by the sim's default autopilot. The maintainer held it at 0 in the sim and the
  default autopilot still tracked the flight plan perfectly (2026-10-19). That reverses the reason for the #143
  exemption. The SimVar now carries the new law's course to steer and is 0 without a heading input, like the roll
  command. It is not to be confused with `GPS WP DESIRED TRACK`, which carries the DTK (`setDesiredTrack`) and is
  untouched.
- The heading input stays a pure on/off condition (Installation Manual 2-69, #143). Steering uses the GPS ground
  track. The theory why the real unit needs heading (a smooth track estimate between 1 Hz GPS updates) is recorded on
  #402 and matters only once the GPS is no longer exact.

**KLN 89 trainer, 2026-10-19** (agent report in the session scratchpad, `trainer/report.md`, with a 1 Hz series per
run). The moving aircraft is the trainer's own model, not necessarily what the real unit's roll command makes an
autopilot do.
- The intercept is capped at 45°: 44-45° from 5-6 NM at 119 kt, 41° from 3.8 NM at 239 kt before the roll-in.
- The intercept angle fits `atan(XTK / (GS × 30 s))`: the aircraft aims at the point on the leg about 30 s ahead.
  Small offsets give shallow intercepts: 0.51 NM at 121 kt peaked at 10°, 0.31 NM at 239 kt gave 2-3°.
- The join is asymptotic with no overshoot. XTK halves about every 27 s at 119 and 239 kt alike, and the roll-in
  starts at about 50 s of closure (XTK 1.1 NM at 119 kt, 2.2 NM at 239 kt).
- Turns are limited by about 25° of bank. A 70° turn at 119 kt ran at about 3°/s (standard rate), turns at 239 kt at
  about 2°/s (25° bank), and the reversal at 120 kt reached 4-5°/s.
- Course behind the aircraft (0.29 NM off, 120 kt): one continuous turn of about 200° toward the course line, with no
  reversal. It overshot 0.74 NM to the far side and came back at about 15°.
- Converging at 60° from 1.6 NM: it turned early and shallowed to 45° and less without crossing the course.
- Direct To snaps the trainer's heading, so it says nothing about Direct To turns.
- The slow build-up to the intercept angle (about 1.5°/s, then a creep to 45° over 60-80 s) and a 4-7 s delay
  before turns probably belong to the trainer's aircraft model. They are not modeled.

**Avionics framework** (`E:\msfs\msfs-avionics-mirror\src\sdk`, MIT plus the MSFS-only addendum).
- `autopilot/lnav/LNavComputer.ts` `getCourseToSteerTrack`: XTK → intercept angle → course to steer =
  DTK ∓ intercept.
- `autopilot/lnav/LNavRollSteerComputer.ts` `getDesiredBankAngleForTrack`: bank = 1.25 × (course to steer − track),
  the shorter way, capped at the maximum bank.
- `adjustDesiredBankAngleForTurn`: on a curved path it adds the bank the path's radius needs at the ground speed
  (`NavMath.bankAngle`). It blends that in with `k = max(1 − |XTK| / turnRadius(GS, maxBank), 0)`, plus a P-only XTK
  rate controller (`ArcTurnController`).
- Neither computer filters its output; the autopilot driver slews the bank at 10°/s.
- The framework reads heading only for constant-heading legs, which the KLN does not have.

**Update rate.**
- No KLN document gives an ARINC 429 bus speed or label rate. Installation Manual 1-1 only says the labels follow the
  GAMA format.
- GAMA Publication 11 (v6.0, 2016; not necessarily the edition the unit was built to) gives label 121 a transmit
  interval of 50-100 ms, and labels 114/115/116 31.3-62.5 ms.
- TSO-C129a asks for navigation data at least once per second. The maintainer's note on the Tu-154 video (35:15)
  shows a 1 Hz calculation rate. The RS-232 record goes out every 2 s (Installation Manual A-9).
- Conclusion: the unit computes once per second and the bus repeats the held value. Our 1 Hz calc tick matches that.

## 3. Goals, non-goals, anti-goals

**Goals**
- One continuous law: path → XTK and local DTK → intercept → course to steer → bank.
- Steer on the path the unit navigates in every case: a leg, the incoming course past a final zero-length leg, the
  OBS course, a DME arc, the turn-anticipation circle.
- No wrong-way bank. A turn once commanded does not reverse while the course to steer is still far off the track.
- Join without overshoot from a 45° intercept, as the trainer does.
- No command (0) when there is nothing to steer on: no path, DTK or XTK null, GPS invalid, ground speed below 5 kt,
  no heading input. The self-test pattern stays as it is.
- Remove the dead code (`adjustBankAngleForArc`, `ArcTurnController`, the unused caches and the logging flag).

**Non-goals**
- Changing turn anticipation itself: when the turn starts, the turn circle `NavCalculator` builds, or the sequencing.
- A heading-based track estimate, GPS noise or smoothing (#402).
- Modeling the trainer aircraft's slow build-up or turn delay.
- Rate limiting or filtering the output.

**Anti-goals**
- Worse tracking than today in any situation of section 6.
- Code more complicated than the code it replaces.
- A change to the public contract: the LVar name, unit, sign (left positive) and range (within ±30, wiki page
  Autopilot). `GPS COURSE TO STEER` changes on purpose (section 4C).

## 4. Design

### A. The steering path comes from `NavCalculator` (#373, #403)

`NavCalculator` already decides which path XTK is measured against. It publishes that path on the nav state each
tick, and roll steering reads it instead of `getFromLeg().path`. Services keep no state, so the path goes on
`NavPageState`.
- No turn on the stack: `legPath`. That is the active leg's path, the incoming path past a final zero-length leg
  (#120), the OBS leg in OBS mode, or the arc circle on a DME arc.
- A turn on the stack: the turn circle. That is `turnStack[0].path`, the bottom entry. The top entry during the
  lead-in is the inbound great circle up to the start of the turn, kept for XTK. Roll steering already steers on the
  circle during the lead-in, so that the bank is established when the circle begins. The lead-in exists for exactly
  that roll-in time. *My call.*
  - Fallback: if the aircraft is farther from the turn circle than the circle's radius, the closest point lies on its
    far side and the circle's bearing there runs backward. The steering path is then the next path (the entry's
    `pathForDtk`) instead. This happens when turn anticipation starts while the aircraft is still well off the
    inbound leg, for example a 45° intercept that joins close to the waypoint. *My call.* Section 6 has a scenario
    for it.
- Null whenever `NavCalculator` sets XTK or DTK null (flag, a zero-length leg with no leg before it, self-test).

Roll steering computes XTK and the local DTK from the published path itself: XTK = the signed distance from the path
(positive right of it), DTK = `path.bearingAt(path.closest(position))`. It does not use `nav.desiredTrack`, which
during a turn already holds the next leg's DTK and in OBS mode is null.

### B. The control law (1 Hz)

All angles are true. Positive bank is left.

1. **Intercept**: `intercept = min(45°, atan(|XTK| / L))`, with `L = GS × 30 s` (the look-ahead distance).
2. **Course to steer**: `CTS = DTK − sign(XTK) × intercept`. Right of the path steers left of the DTK.
3. **Track error**: `e = CTS − track`, wrapped to (−180°, 180°].
4. **Track bank**: `1.25 × |e|`, toward `e`, capped at 25° (`MAX_BANK_ANGLE`). The trainer's turns are limited at
   about 25°, the same limit turn anticipation assumes.
5. **Curved path** (turn circle or DME arc): add the feed-forward bank `NavMath.bankAngle(GS, R)` in the path's turn
   direction, weighted by `k = max(1 − |XTK| / R_25, 0)`, where `R_25` is the turn radius at 25° bank. This means:
   the full turn bank on the path, and none beyond one turn radius away. Then cap the sum at 25°. Starting point
   chosen by me; the builder may adjust the blend if the scenarios of section 6 call for it, and says so.
6. **No reversal**: once `|e|` exceeds a threshold (about 135-150°, the builder's choice), the turn direction is
   picked once and kept until `|e|` is back under it.
   - The direction picked is the turn that first brings the track toward the path. The intercept offset of step 2
     already gives that the shorter way in nearly all cases. The latch only holds the choice while XTK changes sign
     during the turn.
   - The latch is state, so it lives on `NavPageState` and is reset in `VolatileMemory.reset`.

The constants (30 s, 45°, 1.25, 25°) are named and cite their sources: the trainer record for 30 s and 45°, the
framework for 1.25, `MAX_BANK_ANGLE` for 25°.

The law is a pure function of path, position, ground speed, track and the latch. That lets the unit stage test it
with literal expectations.

### C. Outputs and gates

- `L:KLN90B_RollCommand` = the bank. It is 0 with no command, without a heading input (#143), below 5 kt ground
  speed, or with no steering path. The contract is unchanged.
- `GPS COURSE TO STEER` = CTS (with `Output.WriteGPSSimVars`, as today). It is 0 whenever the roll command has no
  command, now also without a heading input (maintainer's decision, section 2).
  - The comment at the place where it is written (`Sensors.setRollCommand`) records the maintainer's sim
    observation of 2026-10-19: the default autopilot tracked the flight plan with this SimVar held at 0, so the sim
    does not use it for the autopilot.
  - The same comment notes that the DTK goes to `GPS WP DESIRED TRACK`, not here.
  - The comment in `RollSteeringController.setOutput` that justified the exemption goes away.
- The self-test pattern (Installation Manual 2-70) is kept as it is.

### D. The class

`RollSteeringController` keeps its place in the calc tick order (after `NavCalculator`). Its doc comment states the
1 Hz decision and its sources, paraphrased with page citations:
- Installation Manual 1-1 (GAMA format);
- GAMA Pub 11 (label 121 at 50-100 ms);
- TSO-C129a (at least 1 Hz);
- the Tu-154 video at 35:15;
- the conclusion that the bus repeats the value computed once per second;
- that the aircraft smooth the command.

It also cites the trainer record and the framework files the law comes from, with the framework's notice where code
is adapted. Reuse what the SDK exports (`NavMath.bankAngle`, `turnRadius`, `FlightPathUtils` turn direction and
radius of a circle).

## 5. Commits (one per issue)

1. Plain commit: the 2026-10-19 trainer check as a dated block in `docs/kln89-trainer-record.md`. This design is
   already committed on the branch.
2. `fixes #373`: `NavCalculator` publishes the steering path, the current controller steers on it and gives no
   command when DTK or XTK is null. In this commit the published path is `legPath` only. The turn-circle selection
   of section 4A (with its fallback) comes with commit 4, because steering on the turn circle is the #100 fix.
   Commits 2 and 3 therefore leave turns as they are, the #100 pins stay red, and the existing turn and arc flights
   keep passing unchanged. *My call.* Test: the reproduction of #373 (FPL 0 KAAA, ABC, ABC, past ABC, 1 NM off the
   extended course).
3. `fixes #403`: the current controller takes its DTK from the published path. Test: the reproduction of #403 (OBS
   051 on the standard route, 2 NM left and right of the course).
4. `fixes #100`: the new controller of section 4, with unit tests of the law and the flight scenarios of section 6.
   The `it.fails` pins of #100 turn into passing tests. Docs: the `RollSteeringController` paragraph in
   `docs/architecture.md`.

5. `references #143`: `GPS COURSE TO STEER` is 0 without a heading input, with the sim-observation comment of
   section 4C. The characterization test `still writes GPS COURSE TO STEER, the intercept course (characterization,
   #143)` becomes a test that it is 0, citing the decision. Docs: `docs/architecture.md` (the
   `RollSteeringController` paragraph and its #143 note on `GPS COURSE TO STEER`). The milestone 3 design
   (`2026-10-14-navcalculator-cdi-outputs-design.md`) is a dated record and stays as it is. This commit is kept apart
   from #100, so that the reversal of the #143 exemption can be reverted on its own.

Commits 2 and 3 change the old controller in a few lines that commit 4 replaces. That is the price of one commit per
issue, and it keeps each fix revertible.

## 6. Measuring "not worse"

**Before commit 4**, the builder flies each situation below on the current code (after commits 2 and 3) with the
flight harness and its coupled autopilot. The harness aircraft rolls at 5°/s and is capped at 25°. The numbers go
into a dated table in this document's appendix. **Commit 4** turns them into flight tests that assert the new law is
at least as good on each metric, with bounds stated as literals.
- Parallel to the leg, 5 NM left and 5 NM right, 120 kt; and 2 NM right at 240 kt.
- Parallel, 0.5 NM off, 120 kt.
- Converging at 60° from 1.6 NM.
- The active leg behind the aircraft, 0.3 NM off, and exactly on it (the video case).
- Anticipated turns of about 35° (the `turnDirection` flight), 90° and 150°, at 120 and 240 kt.
- The DME-arc flights (`dmeArc.test.ts`), including the turn at the arc end of the #100 comment.
- A Direct To about 120° off the current track.
- Turn anticipation starting while the aircraft is still on a 45° intercept, more than one turn radius inside the
  turn (the fallback of section 4A).
- The #373 and #403 situations.

**Metrics** for each situation. Each must be at least as good as the baseline:
- the first bank direction after a change;
- turn-direction reversals while `|e|` > 90°;
- the overshoot past the path;
- the maximum |XTK| once established and through a turn.

The capture time is not compared with the baseline (maintainer's decision, 2026-10-19: the trainer wins). It is
checked against the trainer instead: the intercept reaches but does not exceed 45° from far off, and XTK halves in
roughly 20-35 s once inside the look-ahead distance, at 120 and 240 kt. The builder records the measured times next
to the baseline's for the record.

## 7. Documentation outside the repository (for the maintainer)

The "Implementation" section of the wiki page Autopilot describes the old cases (45° intercept, a 25° planned
intercept, at most 30° once in range). Commit 4's report gives a replacement text describing the new law. The range
line (−30 to 30) stays true; the command now peaks at 25°.

## 8. Left to the builder

- Names of the nav-state fields, the pure function's module and signature, and the constants.
- The exact reversal threshold and the curved-path blend, within the requirements of section 4B, justified by the
  section 6 numbers.
- How the flight scenarios are set up (fixtures, positions), and which existing render tests change their expected
  values. The contract test `is -30 degrees, the cap` expects the old 30° cap. It becomes 25°, which is within the
  wiki's range, and its comment says so.

## 9. Out of scope

- #402 (fuzzy GPS) and a heading-based track estimate.
- Turn anticipation geometry, for example the long lead of a 164° turn seen in the trainer.
- Direct To turn behavior beyond what the law gives.
- The XTK output filter (#158).
