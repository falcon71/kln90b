# Failures: the GPS receiver, jamming and the faulty satellite (#460) — design

Date: 2026-11-05. Size: a project, one `fixes #460` commit on the branch `gps-failures`, with this document in it. Part 3
of #366, on top of the framework of #458 ([2026-11-04-failures-framework-design.md](2026-11-04-failures-framework-design.md))
and the receiver model of #453 ([2026-11-01-gps-signal-loss-design.md](2026-11-01-gps-signal-loss-design.md)). The
behavior is specified in [docs/failures.md](../../failures.md); this document says how part 3 builds it and settles what
that document leaves open for this part. Where the two disagree, this document wins for #460 and `failures.md` is
updated in the same commit.

The branch already holds `fixes #464` (the STA 1 SNR curve, `kln90b/GpsSignal.ts`), which jamming builds on.

Spoofing was split off on 2026-11-05 into #465, which specifies a realistic spoofer (a fake sky, capture and recovery)
and also takes the general `SYSTEM TIME UPDATED` check while a fix is held. #465 builds on the structure here.

## Intent

The pilot practices losing the GPS the ways it is lost in reality: a receiver that fails and says so, a jammer that
takes the satellites away bit by bit, and a satellite that lies until RAIM catches it. Each looks different on the unit, so the pilot learns to tell them apart from
STA 1, STA 2 and the messages, and to continue with other means of navigation (failures.md, Intent).

The maintainer wants this **as realistic as possible**. Jamming in particular must look distinct from the receiver
failures.

## Goals

- `gpsAntenna` and `gpsReceiver`: every satellite lost at once, STA 1 `FAILR` with no satellite rows, STA 2 EPE dashed,
  their own message (`RCVR HARDWARE ERROR:` / `0010`, `NO RCVR DATA`), TEST FAIL, the #453 signal and RAIM messages
  suppressed (failures.md, GPS antenna, GPS receiver).
- `gpsJamming`, manual only: a jamming level that ramps up over a few minutes and lowers every satellite's SNR, so that
  the satellites are lost weakest first, intermittently, and the #453 messages follow on their own.
- `faultySatellite`, manual only: a growing pseudorange bias on one satellite, mapped into a position error through the
  solution's geometry; while RAIM is available and the bias is detectable, `RAIM POSITION ERROR` / `CROSS CHECK
  POSITION` and the consequences of a loss of RAIM (failures.md, Faulty satellite).
- An "inhibit" that the failures own and that survives every power-on and forced acquisition, merged with `GpsSearch`'s
  own inhibits (failures.md, What the code needs first, item 2).

## Non-goals

- The battery (#461).
- Spoofing and the general `SYSTEM TIME UPDATED` check while a fix is held (#465). The catalog gets no `gpsSpoofing`
  entry yet, so FLR 3 does not list it.
- Regional jamming and spoofing triggers from real-world areas. The manual `JAMMING` toggle stands for flying into a
  jammer's range; the maintainer may revisit that when the regional triggers are built (2026-11-05).
- Jamming or spoofing the other GPS units of the aircraft (ruled out in failures.md, Other GPS units).
- Take-home mode: it flies without satellites and is not officially supported. The receiver failures have no effect in
  it.
- Satellite health flags (`B`, `W` on STA 1) and the SDK's `GPSSatelliteState.Faulty`.
- A sim test. failures.md's Testing section asks for one before release (jamming and an antenna failure with a Working
  Title GNS beside the KLN); it is not part of this commit.

## Anti-goals

- **A change of behavior while no failure is active.** With MTBF off and nothing failed, every existing test stays green
  unchanged, and nothing the unit shows or writes changes.
- Jamming that looks like a receiver failure: an instant loss of every satellite with nothing on STA 1.
- A failure reaching other GPS units through the SDK (the leak of #463).
- New reaches into private SDK state outside `KLNGPSSatComputer` (failures.md; architecture.md, Core 3). The design
  needs none: the inhibits are public SDK API.

## Constraints

- Tick cost (CLAUDE.md): everything here runs in the 1 Hz calculation tick. It loops over the SDK's satellites (a few
  dozen) once per tick, allocates nothing in the hot path, and writes settings at most every 10 s of sim time.
- `target: es2017`.
- One commit for #460 (CLAUDE.md), with its tests and doc changes.
- The SDK's `GPSSatComputer` remains the receiver; the KLN never computes a position from pseudoranges. The position is
  the measurement strategy's (truth plus modeled error, #402), and the failures act on top of it.

## The evidence

### Jamming (research, 2026-11-05)

- **Flying into range is gradual and intermittent.** In the flight that Felux et al. analyzed (NAVIGATION 71(3), 2024,
  an A321 over the eastern Mediterranean), the tracked satellites fluctuated between 8 and 6, then fell to one over
  about 15 minutes. A business-jet pilot (Phenom Pilots forum) reports intermittent jamming that grew worse until the
  GPS was lost completely.
- **The weakest satellites go first.** In radiated tests of 80 receivers (MITRE/Volpe, *Loss of Lock Analysis*, RTCA
  GPS-ABC workshop, 2017), a satellite 10 dB weaker than nominal, typical for a low elevation, lost lock at about 10 dB
  less interference than it took to lose every satellite. Jamming power falls with the square of the distance, so
  10 dB is about three times the distance.
- **Intermittency** comes from the antenna: a ground jammer is below a roof-mounted antenna, whose gain there is low and
  changes with the bank angle and the airframe's shadow. This is our inference, not a measured fact.
- **A jammer switched on nearby** would take every satellite at once deep inside its range, and only the weak ones at
  its edge. No cockpit report of this case was found. The maintainer chose the ramp for the manual toggle, partly to
  make it distinct from the receiver failures.
- **Cockpit warnings lag.** In Felux's flight the first caution came only once the GPS position was effectively lost.

### STA 1 during an acquisition (the real-unit video cited in `Sta1Page.tsx`, youtu.be/8esFTk7Noj8)

Two frames the maintainer shared on 2026-11-05:

- At about 1:02, `STATE ACQ`, with no position on NAV 2. The rows are 01 (SNR 45, ELE 58°), 08 (42, 22°), 17 (47, 36°)
  without `*`, and 13 marked `*` with SNR `00` at 14°.
- Moments later, `STATE NAV A` with 01 (46, 43°), 08 (45, 09°), 11 (42, 44°), 13 (44, 25°) and `STA+1`. Every
  elevation changed, which confirms that the ACQ rows showed the elevations predicted for the stored position (#213). SV
  11 was not predicted and was never shown with `*`.

Reading: a receiver measures a satellite's SNR as soon as it finds the satellite's code, before it has its orbit data.
`00` therefore means "searched, not found": the unit knows from its almanac where 13 should be, has a channel on it, and
has not found it yet. A channel-based receiver picks the satellites for its channels from the almanac, not from what it
hears, and keeps searching a satellite it lost while the almanac puts it above the mask. So a satellite that jamming
takes stays on STA 1 as `*13 00 14°`, and a total loss shows every row so and the state ACQ. This is a guess from the
photo and receiver theory; whether the real unit keeps such a row for the whole jamming or for a limited time is
unknown.

The present code already draws the first frame correctly: the SDK marks satellites with collected data `InUse` even
when fewer than four have it (`selectSatellites`), so 01, 08 and 17 show their SNR without `*`, and a satellite still
searched shows `*13 00`. Nothing to change there.

## Approaches

The maintainer picked **A** on 2026-11-05.

- **A. One `GpsFailures` class beside the receiver (chosen).** Owned by `GPS`, built with `Failures`, ticked from
  `GPS.tick`. It owns the jamming level, which satellites the failures block, the drawn values, the faulty satellite's
  bias and its detection. A small measurement decorator applies the bias over whichever strategy runs, and #465 adds
  the false position to it (`ExactMeasurement` in tests, `SimulatedMeasurement` in the sim). `GpsSearch` asks it which satellites are blocked.
  Every receiver failure sits in one place that a unit test can drive with a fake receiver.
- **B. Spread across the existing owners** (`GpsSearch` for the inhibits and jamming, each measurement strategy for the
  bias). Rejected: the bias would exist twice, and the failures' state would mix into the start model and the error
  model.
- **Mechanism: inhibits, not the SDK's signal strength.** Lowering the SDK's private `data.signalStrength` would make the
  SDK keep a lost satellite in its channel as `Unreachable` (`*13- 00` on STA 1). Rejected: the SDK recomputes the value
  every 5 s, so every satellite's own method would have to be patched; the SDK keeps an unreachable satellite up to an
  hour; `-` means "health unknown" (5-30), which is satellite data. A shows the lingering rows itself (see STA 1).

## The structure

### The catalog

`FailureCatalog.ts` gets four entries. None has ports.

| Key | FLR name | Random | TEST FAIL | Message | Detection |
|---|---|---|---|---|---|
| `gpsAntenna` | `GPS ANTENNA` | yes | yes | `RCVR HARDWARE ERROR:` / `0010` | `internal` |
| `gpsReceiver` | `GPS RCVR` | yes | yes | `NO RCVR DATA` | `internal` |
| `gpsJamming` | `JAMMING` | no | no | none | none |
| `faultySatellite` | `SATELLITE` | no | no | none in the catalog (its message is a condition, below) | none |

All are always eligible. The persisted keys are `failure_<key>` as for every failure.

### The drawn values

The stored text of a failure, today `"{}"`, carries its values as JSON. `Failures` gets `values(key)` (the parsed
object, `{}` for a text that does not parse) and `setValues(key, values)` (writes only while the failure is active).

| Failure | Values |
|---|---|
| `gpsJamming` | `rampS` (180 to 360), `finalDb` (24 to 28), `elapsedS` |
| `faultySatellite` | `prn`, `biasM` (500 to 3000), `rampS` (120 to 300), `elapsedS` |

All ranges are guesses. `GpsFailures` draws them when `failureChanged` reports the failure active (FLR 3 publishes it
synchronously), and also in its tick for an active failure whose values are missing, so that a stored `"{}"` is drawn
too. The random source is injectable.

`elapsedS` is the progress of a ramp. It counts sim time while the unit ticks, by the rule of `FailureTrigger`: a step
back, a step of more than `MAX_TRIGGER_STEP_S` and the first tick after a stop count nothing. It is written at most every
10 s of progress and once when the ramp completes, so that a power cycle or a new session continues the ramp where it
was and a finished ramp stays finished.

### `GpsFailures`

A new `kln90b/failures/GpsFailures.ts`. `GPS` builds it from `Failures` (passed through `Sensors`; `KLN90BCore` builds
`Failures` before `Sensors`) and ticks it first in `GPS.tick`, outside take-home mode. It holds no state that
`VolatileMemory` would have to reset: its persistent state is in the failure values, and its runtime state (the
fluctuation, the blocked set, the save counter) restarts at every power-on.

What it exposes, read by the others:

- `isBlocked(prn)`: the failures forbid tracking this satellite (below).
- `receiverFailed`: `gpsAntenna` or `gpsReceiver` is effective.
- `jammingDb`: the present jamming level, 0 without jamming.
- `jammedRows()`: the satellites jamming took, for STA 1 (below).
- `faultDetected(halNm)`: the faulty satellite is detected for an alert limit (below).
- The faulty satellite's position error, for the decorator.

Tick order in `GPS.tick`: `GpsFailures.tick` → `GpsSearch.tick` → the inhibits applied → `onUpdate` →
`updateSolution` → the measurement.

### The inhibits

`GpsSearch` keeps its own choice (the allowed PRNs, or none) and gets a `blocked: (prn) => boolean` from `GPS`. One
method applies both: a satellite is inhibited when the search does not allow it **or** the failures block it.
`inhibitAllExcept` stores the search's choice and applies; `end()` clears only the search's choice and applies, so the
failures' blocks survive a power-on, a first fix, `acquireAndUseSatellites` (SET 10 FAST, an engine-running start,
`WelcomePage.leaveFailed`) and a power-off. `GPS.tick` applies once per tick after `GpsFailures.tick`, because jamming
changes the blocked set from tick to tick. With no failure active nothing is blocked, and the inhibits are exactly the
search's, as today.

### Blocked satellites leave the unit's solution at once

The SDK releases an inhibited satellite from its channel only at its next position update, every 5 s (`GPSSat.ts`,
the channel assignment), and until then keeps it `InUse`. The unit does not wait (our call): `GPS.updateSolution` skips a
satellite `isBlocked` reports, and STA 1 treats a blocked channel satellite as a jammed row (`*xx 00`) or, during a
receiver failure, shows none. The unit's solution may disagree with the SDK's states for up to 5 s; only the SDK's own
`hasSdkSolution` check in `GPS.tick` reads those, to decide whether to sync the last known position, and that is harmless.

### The receiver failures

While `receiverFailed`, every satellite is blocked, so the fix is lost in the next tick (the NAV flag as for any loss of
the fix), and the SDK drops the satellites within 5 s. The clock runs on as without a fix. STA 1 shows `FAILR` and no satellite rows
on either page; STA 2 shows the EPE dashed (it already does without a fix). The messages are the framework's: detected
in the next calculation tick, not before the first navigation page. A repair lifts the blocks and the receiver
reacquires as after any loss of signal. The start model runs as usual underneath; while the failure lasts, STA 1 says
`FAILR` whatever its mode.

### Jamming

- **The level** in dB: `finalDb × min(1, elapsedS / rampS) + w`, at least 0. `w` is a Gauss-Markov wander with a sigma
  of 3 dB and a correlation time of 10 s (guesses), drawn every tick, starting at 0 at every power-on and not persisted.
  The ramp is linear in dB (our call).
- **Why these values** (corrected while planning, 2026-11-05): the satellites in view span about 9 dB of SNR (41 to 50 in
  the harness's sky), and the zenith ones crowd at the top of the curve. A final level of 24 to 28 dB is just past what
  the strongest satellite survives (50 - 30 = 20, plus the wander), so the losses spread over the second half of the
  ramp; 30 to 40 dB would crowd them into a minute. A wander of 3 dB lets a lost satellite come back now and then
  across the 5 dB between losing (30) and reacquiring (35); with 2 dB that would almost never happen.
- **A satellite's SNR** under jamming is `satelliteSnr(zenith) - jammingDb` (`GpsSignal.ts`, #464).
- **Lock** (thresholds from the Installation Manual, C-7: 30 and below unusable, 30 to 35 marginal):
  - a satellite the receiver tracks (in a channel and `Acquired` or later) is blocked once its SNR falls below 30;
  - a satellite it does not track is blocked while its SNR is below 35, as acquiring needs more signal than holding;
  - a blocked satellite is unblocked once its SNR is 35 or more.

  The gap is the hysteresis that keeps a satellite from flickering every second, and the wander makes the losses
  intermittent near the thresholds. A satellite reacquired takes the SDK's normal time (9 s with a current ephemeris near
  the last known position, else 40 s).
- **What emerges** with the SNR curve of #464: the lowest satellites go first, a few come back, the EPE grows, RAIM is
  lost, and finally the fix (`SATELLITE COVERAGE INADEQUATE FOR NAV`, the NAV flag). `RAIM NOT AVAILABLE` shows only when
  RAIM stays lost for more than its 10 s before the fix goes, which depends on the sky. The test pins the order of the
  states (RAIM lost while the fix holds, then the fix lost), not the message.
- **No message of its own.** The repair sets the level to 0 at once and lifts the blocks.
- **A power-on while jammed** continues the ramp; after it, the level is the final one from the start, so the receiver
  acquires nothing.

### The faulty satellite

- **The draw**: the PRN is the highest-elevation satellite in the solution, or, with none in use, the highest one above
  the 5° mask among the SDK's satellites. The bias grows linearly to `biasM` over `rampS`.
- **The decorator** `FailingMeasurement` wraps the strategy `GPS` was given (`ExactMeasurement` in tests,
  `SimulatedMeasurement` in the sim). It always updates the inner strategy and passes its outputs through, adding only
  the error below.
- **The position error**: while the PRN is row `i` of the solution, the decorator adds `-cN_i × bias` north and
  `-cE_i × bias` east, from the coefficients `computeGeometry` already writes. The sign is flipped, as `GpsSolution`'s
  header says a single-satellite bias must be: a too-long range moves the position away from the satellite. The
  velocity and the track are not touched: a clock jump changes the range, not the Doppler (our call). When the satellite
  sets or leaves the solution, the error goes.
- **Another satellite** (decided by the maintainer, 2026-11-05): once the faulty satellite has been out of the solution
  for 2 minutes of sim time while the unit has a fix (guess), and the failure is still active, a new satellite is picked
  by the same rule, with a new bias and ramp. The time counts by the trigger's rules and is not persisted; a short
  dropout, a jammed moment or the reacquisition after a power-on never switches. So a long flight keeps a faulty
  satellite as the constellation moves, and a session far away, where the stored satellite is not in view, gets a new
  one 2 minutes after its fix.
- **Detection** (`faultDetected(halNm)`): the PRN is in the solution, the bias is at least `RAIM_K × SIGMA_UERE_M`
  (about 27 m, the smallest bias the protection level of `GpsSolution` is built to catch), and `raimStatus` is
  `Available` for that alert limit. The unit detects and does not exclude the satellite (guess). With the ramp to 500 m
  or more, detection comes within seconds of the failure.
- **The message** `RAIM POSITION ERROR` / `CROSS CHECK POSITION` (B-3) is a condition message in
  `PersistentMessages.ts`: the fix valid and `faultDetected(halForMode(navmode))`. No delay: a detected fault is an alarm,
  not a dropout. It replaces the "Not built yet" note there.
- **The consequences of a loss of RAIM** (failures.md; guess):
  - `NavCalculator`'s integrity fail (`L:KLN90B_IntegrityWarn`) is also true while `faultDetected(halForMode(navmode))`;
  - `ModeController.updateIntegrityFlag` flags the navigation in APR at once on `faultDetected` for the approach limit,
    as it does for a lost fix (not after `APR_RAIM_FLAG_DELAY`), and `PRESS GPS APR FOR NAV` follows;
  - `checkApproachIntegrity` refuses ACTV while `faultDetected` for the approach limit, which also posts `RAIM NOT
    AVAILABLE APR MODE INHIBITED` through the existing inhibit;
  - en route the navigation stays valid.

### STA 1 and STA 2

- **State**: `FAILR` while `receiverFailed`, before every other state. Without a fix, outside TRAN, with the start model
  idle and jamming effective: `ACQ` (the unit still knows the time, the almanac and roughly where it is).
- **Rows**: none while `receiverFailed`. While jamming, the rows are the SDK's channel satellites plus `jammedRows()`,
  the blocked satellites above the 5° mask by the SDK's positions, sorted by PRN, at most 8 (channel satellites first,
  then the highest blocked ones). A jammed row reads `*xx 00 ele`. A satellite in use shows `satelliteSnr - jammingDb`.
  During the start model's ACQ the predicted list is shown as today, and a blocked predicted satellite reads `*xx 00`
  on its own.
- **STA 2** is unchanged: dashes without a fix, the normal EPE with a faulty satellite.

### The #453 messages during a receiver failure

While `receiverFailed`, `SatelliteCoverageMessage`, `RaimNotAvailableMessage`, `BadGeometryMessage` and
`BadGeometryApproachMessage` are not valid (failures.md: the hardware message names the cause). The approach-mode
messages (`RAIM NOT AVAILABLE APR MODE INHIBITED`, `PRESS GPS APR FOR NAV`) stay: they say what the mode did, not why
(our call).

## Decided by the maintainer

- **Jamming ramps up over a few minutes** (2026-11-05), to stand for flying into a jammer's range and to look distinct
  from the receiver failures. Regional jamming may revisit this.
- **Jammed satellites stay on STA 1 as `*xx 00`**, and a total loss shows ACQ (2026-11-05, from the video frames).
- **The faulty satellite moves on**: another satellite is picked once the faulty one has left the solution
  (2026-11-05). See The faulty satellite.
- **Spoofing is its own issue** (#465, 2026-11-05).

## Tests

At the cheapest stage that can observe each behavior (CLAUDE.md, test/README.md):

- **Unit** (`GpsFailures` with a fake receiver and an injected random source): the blocked set of the receiver failures;
  the jamming level over the ramp and its bounds with the wander; the lock and unlock thresholds and their hysteresis;
  the draws within their ranges; the ramp progress and its saves at most every 10 s and at completion, with the trigger's
  time rules; the faulty PRN pick; the bias ramp; the sign of the error (a satellite due north moves the position south);
  detection against the bias threshold and the RAIM status; another satellite after 2 minutes out of the solution with a fix, and none after a shorter dropout or without a fix. `GpsSearch`: the
  failures' blocks survive `end()`, `start()` and `acquireAndUseSatellites`, and without a block the inhibits are the
  search's alone. `FailingMeasurement`: passes through unchanged without failures, adds the bias.
  `Failures.values`/`setValues` round trip, and a text that does not parse.
- **Render**: STA 1 `FAILR` with no rows; jammed rows `*xx 00 ele` and lowered SNRs; `ACQ` in a total loss; TEST FAIL for
  the two receiver failures; FLR 3 listing the four; the `RAIM POSITION ERROR` message.
- **Flight** (against the receiver model):
  - antenna or receiver in flight: the fix lost at once, the hardware message, no #453 message, the repair reacquires;
  - jamming in flight: the SNRs sink, the lowest satellite goes first, RAIM lost while the fix holds before the fix is
    lost and `SATELLITE COVERAGE INADEQUATE FOR NAV`, the repair reacquires; a power cycle mid-ramp continues it;
  - the faulty satellite: the error grows to the mapped bias, the message, `L:KLN90B_IntegrityWarn`, ACTV refused in ARM,
    the NAV flag and `PRESS GPS APR FOR NAV` in APR; with RAIM unavailable (four satellites, no altitude input) the
    error without the message; a long flight that sets the faulty satellite, then another one taken.
- **The anti-goal**: the whole suite green unchanged with nothing failed.

Mutation checks belong to the review, as for #458 and #459.

## Docs

- `docs/failures.md`: the status paragraph; the jamming section rewritten to the ramp, the SNR loss and STA 1; the
  faulty satellite's move to another satellite; the STA 1 notes for the receiver failures; a pointer from the spoofing
  section to #465, which rewrites it; items 2 and 3 of "What the code needs first" removed (item 1 belongs to #461, item
  4 to #465); the jamming line of "Left to the implementation" removed.
- `docs/architecture.md`, Core 3: `GpsFailures`, the inhibit ownership, the decorator.
- `CLAUDE.md`, the GPS paragraph: "Satellite failures (#366) are not modeled" replaced by a line on `GpsFailures`.
- The wiki (the maintainer): the failures page gets the four failures and what each looks like on STA 1.

## Left to the builder

- Names, and how `GpsFailures` is split into helpers.
- The Gauss-Markov step of the wander (as in `GpsErrorModel`).
- Whether the SDK's `setSatelliteInhibit` notifies when the state does not change; if it does, apply only changes.
- Confirm that the SDK's forced acquisition respects the inhibits; if not, re-apply after it.
- The exact row cap order on STA 1 when more than 8 satellites qualify.
