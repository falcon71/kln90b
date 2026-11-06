# Satellite signal: each satellite its own SNR, and signal loss as normal receiver behavior (#467)

## Intent

Since #464 the SNR of a satellite is `satelliteSnr(zenith)` in `kln90b/GpsSignal.ts`, a function of the elevation alone.
Two satellites at the same elevation show the same SNR on STA 1, the value never moves except with the elevation, and
under jamming (#460) the satellites near the top of the curve drop in the same moment, so the loss of RAIM before the
loss of the fix is too short for `RAIM NOT AVAILABLE`.

The maintainer wants this **simulated from physical causes, not faked to force a behavior**. The decision taken in the
brainstorm (2026-11-06): **losing a satellite to a weak signal is the normal behavior of the receiver, and jamming is
just one more cause that lowers the signal.** The results of jamming must emerge from the normal receiver, with no
special case for it. A weak satellite low in the sky may now never be acquired; that is accepted as realistic.

## Goals

- One SNR per satellite, computed once per calculation tick, that STA 1 and the lock rule read, and through the lock rule
  the SDK's acquisition and therefore the solution; jamming acts only by lowering it.
- The SNR is the sum of physical causes: the antenna's gain toward the satellite (which tilts with the aircraft's pitch
  and bank), the satellite's transmit power by its block, a slow fade, and the receiver's estimate jitter, minus the
  jamming level.
- The lock rule (lost below 30, reacquired at 35 or more) runs always, for every cause.
- Under jamming the losses spread out by themselves, through the per-satellite differences.

## Non-goals

- Shadows of the tail, the wings, the propeller or the nacelles. The unit can be installed in any aircraft, and the
  Installation Manual (2-1) tells the installer to keep the antenna away from them. The antenna tilt is the effect no
  installation avoids.
- Any aircraft-specific setting: no new panel.xml key, LVar or H event.
- The jamming ramp and wander stay as they are; how fast a jammer is approached is #465's distance model.
- The zenith value of the curve (50) stays. The research found 45 to 48 dB-Hz typical for aircraft receivers at high
  elevation, but the manuals (C-7, 5-29/5-30) give the forties as typical and the mid-fifties as the top of the usable
  range, and #464 fixed the curve on them.
- STA 5 and the RAIM prediction stay geometric (6-20): the unit predicts from the almanac, not from signal levels.
- Ice on the radome, cable loss, the satellite's own antenna variation by azimuth (about 0.2 to 0.3 dB).

## Anti-goals

- A loss scripted to happen (a timer, a forced order, a "drop a satellite in turns" rule). Losses must come out of the
  SNR crossing the lock thresholds.
- Any branch in the receiver, the solution or STA 1 keyed on "jamming". They key on the signal.
- Noise added only so that the column looks alive. Every term has a named physical cause.

## Approaches considered

1. **A signal model the receiver ticks, with one lock rule for everything (chosen).** A new service holds per-PRN typed
   arrays, is ticked in `GPS.tick` before anything reads it, and owns the lock rule, which moves out of `GpsFailures`.
   `GpsFailures` keeps only real failures: the dead antenna or receiver, the jamming level and the faulty satellite.
2. **The same, stateless.** One pure function of PRN, direction, attitude and time, the fade made of smooth
   deterministic noise. Easier to test, no reset, but the fade is a pattern made to look random rather than a process,
   and the jitter still needs a draw. Not chosen.
3. **Extend `GpsFailures.updateBlocks`.** Smallest diff, but it keeps signal loss inside the failure code, the special
   case the maintainer does not want. Dropped.

## The design

### The SNR of one satellite

Per satellite and tick, in dB-Hz:

```
snr = antennaCurve(antennaElevation) + blockOffset(prn, localElevation) + fadeSigma(antennaElevation, onGround) × z(prn)
      - jammingDb + jitter
```

**The antenna curve** is #464's curve, evaluated at the elevation **above the antenna's plane** instead of above the
horizon: `50 + 12 × log10(sin(e_a))` for `e_a > 0`, floored at `BACKLOBE_SNR = 25`, and 25 for `e_a <= 0` and for a
non-number (#456). In level flight above about 1 degree every value is the same as today.

- Why 25 (our choice): measured aircraft patterns fall to -20 to -25 dBic below the antenna's plane, with spots of
  -10 to -15 (Eurocontrol EEC Report 337, 1999, BAC 1-11 scale model), against a peak of about +2 to +3 dBic. That is
  about 23 to 28 dB under the zenith's 50. With the floor at 25 a satellite under the antenna's plane is lost and stays
  lost, as the reacquire threshold is 35.
- `MIN_SNR` today is both the curve's floor and the lock-loss threshold. They split: the floor becomes `BACKLOBE_SNR`,
  the lock-loss threshold stays 30 (Installation Manual C-7: 30 and below unusable).

**The antenna elevation.** The KA 91/92 is mounted on top of the fuselage with its base level within 5 degrees in level
flight (Installation Manual 2-1), so its plane is the airframe's, and the manual says a tilted antenna loses satellites.
With the satellite's local elevation `e`, true azimuth `A` (clockwise from north), the true heading `psi`, the pitch
`theta` (nose up positive) and the bank `phi` (right wing down positive):

```
sin(e_a) = sin(e)·cos(phi)·cos(theta) - cos(e)·[cos(phi)·sin(theta)·cos(A - psi) - sin(phi)·sin(A - psi)]
```

Checks: level flight gives `e`; nose up by `theta` lowers a satellite dead ahead to `e - theta`; a right bank by `phi`
raises a satellite on the right to `e + phi` and lowers one on the left to `e - phi`.

- **Correction to what was said in the brainstorm:** in a bank the antenna faces the inside of the turn, so the
  satellites lost are the low ones on the **high-wing side**, the outside of the turn, not the low-wing side. In a 25
  degree bank a satellite below about 25 degrees on the outside of the turn goes under the antenna's plane.
- The SDK gives a satellite as `[zenith, hour angle]` and the hour angle turns from north towards the west
  (`GpsSolution.ts` header, held by a test), so `e = 90° - zenith` and `A = -hourAngle`.
- A satellite at or below the local horizon (`zenith >= 90°`) gets the floor whatever the attitude: the earth blocks
  it.

**The block offset.** The transmit power is a property of the satellite's **block**; which PRN is which block is a
property of the **constellation on the ephemeris's date**, and it changes whenever the ephemeris is regenerated
(satellites are launched, retired and their PRNs reassigned). The two are kept apart (maintainer, 2026-11-06: the list
must not go stale or be overlooked when the ephemeris is updated):

- **The physics, in code**: an offset per block, keyed by the block names of the IGS satellite metadata (the names IGS
  and ANTEX use, which split the IIR antenna panels: IIR-A is the legacy panel, IIR-B the improved one, after Rothacher &
  Schmid, IGSMAIL-5131, 2005; check the letter-to-panel match against Marquis & Reigh's table while building):

  | Block (IGS name) | Offset (dB) |
  |---|---|
  | GPS-IIF | +1.0 |
  | GPS-IIR-M | +0.5 |
  | GPS-IIR-B (improved antenna panel) | 0 |
  | GPS-IIR-A (legacy antenna panel) | -1.0 |
  | GPS-IIIA | -1.5 at a local elevation of 30° or less, linear to -4.0 at 50° or more |

  The offsets are fixed per block and are **not** renormalized to the constellation: the curve stands for a typical
  satellite of the July 2022 mix, and a constellation with more GPS III is a little weaker on average, as it really is.
  A block not in the table, or a satellite without a block, gets 0 at runtime.
- **The data, with the ephemeris**: every PRN entry of `gps_ephemeris.json` gets a `block` field with its IGS block name.
  The SDK keeps each entry object as the satellite's private `data.ephemeris` (GPSSat.ts, `loadSatelliteData`), so the
  signal model reads the block there, the way `KLNGPSSatComputer.restoreEphemeris` reaches the satellite's private data;
  extra fields do not disturb the SDK, which reads only its named ones.
- **The sources, committed** (maintainer, 2026-11-06) in a folder of their own outside `resources/` (say
  `ephemeris/`), with a README that cites and attributes them:
  - the RINEX 2 broadcast navigation file `brdc1820.22n`, the CDDIS daily GPS broadcast ephemeris of 2022-07-01 (day
    182), copied from the avionics framework mirror (`src/workingtitle-instruments-gns/html_ui/Assets/Data/
    gps_ephemeris.txt`), where it is the source of today's JSON. Broadcast orbit parameters are facts; the README gives
    its CDDIS origin and the citation CDDIS asks for.
  - the IGS satellite metadata SINEX `igs_satellite_metadata.snx` (files.igs.org/pub/station/general/, about 280 KB),
    downloaded as published. The IGS terms of use (Data and Product Disclaimer and Terms of Use, 5 August 2020) let it
    be used freely provided it is cited and attributed to IGS and its contributing organizations; the README does that.
- **The generator, written from scratch** in TypeScript with unit tests, to the project's standards (the maintainer's
  converter was a quick test). It parses the RINEX file, takes for each PRN the first record of the file (the rule of
  today's JSON), and looks up in the SINEX the SVN that carried the PRN on that record's date and the SVN's block. Its
  regression test: from `brdc1820.22n` it reproduces today's `gps_ephemeris.json` value for value, plus the `block`
  fields. A PRN whose SVN or block the SINEX does not give is an error, not a silent gap.
- **The build regenerates the JSON** (maintainer: on each build). The rollup build writes `gps_ephemeris.json` into the
  package from the two sources, and writes its **exact byte size into the package's `layout.json`**, which the sim needs
  to be right (maintainer: "very important"). The committed `resources/.../gps_ephemeris.json` goes; its entry in
  `resources/layout.json` stays and the build fills in the size. A test checks that the size in the built `layout.json`
  equals the size of the written file. The test harness's fake file server (`test/harness/sim/FakeXhr.ts`) serves the
  same generated JSON, so the tests and the build see the same data.
- **The guard, a unit test** over the generated JSON: every PRN has a `block`, and every block is one the offset table
  knows. A new block (GPS-IIIF launches from about 2027) or a stale SINEX fails the test instead of silently getting 0.
- **Updating the ephemeris** then means dropping in a new RINEX file and, if satellites were launched since, a fresh
  SINEX. Whether to update it is the maintainer's separate decision; this change keeps the 2022 data.

- Sources and confidence of the offsets: GPS III against IIF, 2 to 3 dB lower up to about 35 degrees and almost 5 dB
  above, is measured (Thoelert, Steigenberger et al., GPS Solutions 2019). The IIR-M C/A power step of 2017 (+1.5 dB
  C/N0 on average, Thoelert et al., ION GNSS 2017) and the IIR panel difference (at least 1 dB, Marquis & Reigh,
  NAVIGATION 2015) are measured. The offsets of IIR, IIR-M and IIF against each other are our synthesis of those,
  weakly sourced. Aging is negligible (Marquis & Reigh: SVN 43 constant over 15 years), and within one block satellites
  differ by about 0.3 dB, which the model leaves out.

- The III offset depends on the **local** elevation, as it comes from the satellite's antenna pattern, whose
  off-boresight angle the receiver's position fixes, not the aircraft's attitude.

**The fade** is a first-order Gauss-Markov process `z(prn)` of unit variance per satellite, scaled by a sigma that grows
toward the antenna's horizon:

- In flight: `fadeSigma = 0.3 + 0.9 × (1 - clamp(e_a / 45°, 0, 1))` dB, 1.2 at the antenna's horizon and 0.3 from 45
  degrees up; correlation time 20 s. The cause is the echo from the airframe (Steingass et al., PLANS 2004, about -14 dB,
  giving about ±1.5 dB of ripple), which changes as the satellite's direction relative to the airframe changes. Ground
  reflections in flight arrive through the antenna's underside and add little.
- On the ground (`SIM ON GROUND`): `fadeSigma = 0.5 + 1.5 × (1 - clamp(e_a / 45°, 0, 1))` dB, 2.0 at the horizon;
  correlation time 120 s. The cause is the reflection from the ground and nearby structures, which oscillates over
  minutes as the satellite's elevation changes.
- All of these numbers are our estimates; the research found no published airborne C/N0 statistics.
- `z` advances by `z ← a·z + sqrt(1 - a²)·n`, `a = exp(-dt / tau)`, `n` a standard normal draw, with `dt` from the sim
  clock and the rule of `FailureTrigger`/`GpsFailures.tick`: the first tick, a step back and a jump count nothing. A
  satellite's `z` is drawn from the standard normal the first time it gets an SNR after a power-on.

**The jitter** is the receiver's C/N0 estimate noise, white, drawn fresh each tick with `dt > 0` (a paused sim does not
flicker): sigma `0.15 × 10^((45 - s) / 20)` dB, `s` being the SNR before the jitter, capped at 1.5 dB. That is about 0.15
at 45, 0.5 at 35 and 0.85 at 30. The form follows from the estimate's variance falling with C/N0; the 0.15 is our
estimate (research: about 0.4 dB-Hz above 45 degrees and 1.5 below in a receiver testbed, 2025).

**Randomness and determinism**: the service takes `random: () => number = Math.random` as `GpsFailures` does, so the
harness's seeded `Math.random` makes the render and flight tests repeatable, and unit tests pass their own. A public
`fadeScale` (default 1) and `jitterScale` (default 1), like `GpsFailures.wanderSigmaDb`, let a test pin the deterministic
part.

### The lock rule, for every cause

Moved unchanged from `GpsFailures.updateBlocks` and run on every tick for every satellite of the SDK:

- a satellite the receiver tracks (`Acquired` or later) is lost once its SNR falls below 30;
- a satellite it does not track is lost while its SNR is below 35;
- a lost satellite comes back once its SNR is 35 or more, and the SDK then takes its normal time to reacquire it.

The SNR the rule reads includes the jitter: the receiver judges lock by its own estimate.

**How a lost satellite acts on the SDK: through its reachability, not through inhibits** (settled after the builder
check, our call). The SDK's satellite already has the physical behavior of a missing signal: in `updateState` a tracked
satellite that is not reachable falls back to `None` and stays in its channel, searched; a searched satellite that is not
reachable is never acquired and becomes `Unreachable` after the acquisition timeout; once reachable again it is acquired
after the SDK's acquisition time (with a current ephemeris, the short one). Reachability is `signalStrength > 0.05`, a
private value the SDK computes from the zenith angle before the channel assignment and `updateState` in the same update
(`SatelliteSimulationContext.update`, GPSSat.ts).

- The lost flag therefore makes the satellite unreachable **for `updateState` only**: each SDK satellite's `updateState`
  is wrapped once, at init, so that a lost satellite is seen with a signal strength of 0 during that call and the SDK's
  own value is restored after it. The wrapper allocates nothing per call.
- The channel assignment keeps reading the SDK's geometric signal strength. That is the real receiver: it gives channels
  from the almanac's prediction, not from what it currently hears, so a weak satellite that is up holds a channel and is
  searched (`*xx 00` on STA 1). The blind searches (almanac search, sky search) keep putting any satellite in a channel,
  as today, so they stay blind and the #62 calibration holds; a weak satellite they find just is not acquired.
- Signal loss sets **no inhibit**. `GpsSearch` keeps its inhibits for its own start-model choice and the receiver
  failures (`allBlocked`); its per-satellite `blocked` callback goes.
- This replaces the inhibits that jamming uses today. With them, a lost satellite left its channel and the channel went
  to another satellite, which is why STA 1 needed its added rows and its "blocked but still in a channel" state override.
  Both go: the SDK's own channel states now show what the receiver does.
- The wrapper reaches into a private SDK method, like the rest of `KLNGPSSatComputer`; a test holds it, so that an SDK
  upgrade that moves it fails a test instead of silently disabling signal loss.

What emerges, for example:

- **Turns**: the low satellites on the outside of a steep turn are lost and come back some seconds after the wings are
  level. With few satellites, RAIM or even the fix can go in a turn.
- **Climbs and taildraggers on the ground**: nose up tilts the antenna aft, so the low satellites **ahead** are weaker,
  or lost at a steep pitch.
- **Rising satellites** are acquired only some degrees above the horizon, a weak GPS III later than an IIF.
- **Jamming**: the losses spread over several dB of per-satellite differences instead of a 1 to 2 dB band.

### Where it lives

- **`kln90b/GpsSignal.ts`** grows from a pure module into the service, say `SatelliteSignals`, still importing nothing
  from the project but the SDK types it needs. It keeps the pure functions (the curve, the antenna elevation, the block
  offset) exported for the unit tests, and the per-PRN state in typed arrays sized for the PRN range (as
  `GpsFailures.jamBlocked` is): the SNR, `z`, whether `z` has been drawn, and the lost flag. Allocation-free in the
  tick: no arrays, closures or objects created per call.
- **Its API**, roughly: `tick(simTimeS, attitude, jammingDb)`, `refresh(attitude, jammingDb)` (recompute the SNRs and the
  lock without counting time, for the forced acquisition), `reset()` (power change: lost set and fades cleared),
  `snr(prn)`, `isLost(prn)`, and the lost satellites above the 5-degree mask for STA 1. The attitude is plain numbers in
  the formula's convention; the conversion from MSFS signs is done once, where the SimVars are read.
- **The antenna's attitude comes from the platform** (maintainer, 2026-11-06), the way the measurement strategy does
  (`KLN90BPlatform.createGpsMeasurement`: `SimulatedMeasurement` in the sim, `ExactMeasurement` in tests unless a test
  opts in). In the sim it reads `PLANE HEADING DEGREES TRUE`, `PLANE PITCH DEGREES` (MSFS: positive nose down, so
  negated), `PLANE BANK DEGREES` (MSFS: positive left, so negated) and `SIM ON GROUND`, the airframe the antenna sits on,
  not an input of the unit, so not through the `Interconnect`. In the test platform the antenna is **level by default**
  (heading, pitch and bank 0, in flight), and a boot option opts a test into the SimVar attitude. The navigation tests
  (turn anticipation, sequencing, arcs, messages) are not about the GPS and keep a level antenna; separate tests cover
  the tilt's effect on the antenna and the signals. The source fills a reused object; no allocation per tick.
- **`GPS.tick`** asks the attitude source once per tick. Order: `failures.tick` (the jamming level), then the signals' tick, then the search, its inhibits, the
  SDK's update and the solution.
- **`GpsFailures`** loses `jamBlocked`, `updateBlocks`, `isJammed`, `jammedRows` and `refreshBlocks`, and keeps
  `receiverFailed`, the jamming level (`jammingDb`, its ramp and wander) and the faulty satellite. Its `isBlocked(prn)`
  goes; `GPS.updateSolution` leaves out a satellite when `receiverFailed || signals.isLost(prn)`, which with the
  reachability above only covers the moment between the signals' tick and the SDK's update.
- **`GpsSearch`** loses its per-satellite `blocked` callback (see "How a lost satellite acts on the SDK").
- **`KLNGPSSatComputer`** wraps each satellite's `updateState` once the SDK has built its satellites, and
  `acquireAndUseSatellites` calls the signals' `refresh` where it calls `refreshBlocks` today, so that the forced
  acquisition of an engine-running start or SET 10 FAST finds the lost set current (the forced path also asks
  reachability, and makes a lost satellite `Unreachable`). The jamming level `refresh` needs after a power-on reset is
  restored the way `refreshBlocks` loads it today.
- **Take-home mode** has no satellites to track and no signal model; the service is not ticked there.

### STA 1 (5-29, 5-30)

- The SNR column reads `signals.snr(prn)`, the value of the last calculation tick, for the rows it shows today.
- Every branch keyed on `failures.jamming` goes or becomes a branch on the signal:
  - a lost satellite reads `*xx 00` (searched, not found) whatever the cause; with the reachability mechanism this comes
    from the SDK's own `None` state in the channel, so the state override goes;
  - the added rows of lost satellites not in a channel go, as lost satellites keep their channels (see above);
  - the state without a fix while the search model is idle is `ACQ` when the receiver is searching satellites it lost
    (a lost satellite above the mask in a channel), else what the SDK's state gives today.
- `failures.receiverFailed` keeps its own branches (`FAILR`, no rows).

### What persists

Nothing new. The block offsets are fixed by PRN, the fades and the lost set restart at every power-on, and no setting or
storage key is added.

### Performance

Per calculation tick, one pass over the SDK's satellites, each a handful of trig calls, a `log10`, an `exp` and up to
two normal draws: far under the bar in CLAUDE.md. No allocation in the tick.

## Tests (the cheapest stage that observes each)

- **Unit, `GpsSignal`**: the curve and its floor (literal values, the floor below the plane and for NaN); the antenna
  elevation with literal expectations for pitch up/down, bank left/right, satellites ahead, behind, left and right;
  the block offset for one PRN of each block and the III ramp; the fade's stationary sigma and correlation over a seeded
  run; the jitter's scale; `dt` rules (first tick, step back, jump); the lock rule's thresholds and hysteresis (moved from
  `GpsFailures.test.ts`); `reset`.
- **Unit, `GpsFailures`**: what stays (receiver failures, the jamming level, the faulty satellite); the moved lock tests
  leave.
- **Render**: STA 1 characterization regenerated with the seeded random, so it now shows the per-satellite spread; a
  bank test, opted into the SimVar attitude: a low satellite on the outside of a 30-degree bank is lost (`*xx 00` and
  gone from the solution) and is back after the wings are level; the MSFS sign convention of bank and pitch held at the
  SimVar boundary (a bank to the left loses a satellite on the right). A test that the default test platform keeps the
  antenna level whatever the SimVars say.
- **Flight**: the existing jamming flights still hold their order of states (RAIM lost while the fix holds, then the
  fix). **Whether `RAIM NOT AVAILABLE` shows is not a pass criterion** (maintainer, 2026-11-06: either it appears with
  the change or it does not): the constants are not tuned to make it appear. A jamming flight with the
  wander and the signal model at their defaults, over a few seeds, measures and reports the time from the first loss to
  the loss of the fix and the length of the RAIM-lost window, before and after this change, in the commit and the
  issue. A test pins what is robust: the losses no longer come in one tick (the first and last loss of the satellites in
  view are apart by more than a set time in a seeded run). The harness's `Aircraft.writeTo` writes `PLANE BANK DEGREES` with the MSFS sign (positive left) and writes
  `PLANE PITCH DEGREES` and `SIM ON GROUND`.
- Snapshots and expectations that shift because low satellites are now acquired later are updated, with the reason in
  the commit.
- Review verifies the tests by mutation (CLAUDE.md).

## Delivery

- One `fixes #467` commit with the code, the tests, this document and the doc updates, on branch
  `467-satellite-signal`. It includes the two committed source files with their README, the generator and its tests,
  the build step that writes the JSON and its size into `layout.json`, and the removal of the committed JSON.
- `CLAUDE.md`'s Commands section: `resources/layout.json` is static **except** the ephemeris's size, which the build
  writes; where the ephemeris sources live and how to update them.
- Docs: `docs/failures.md` (the jamming section: the lock rule now belongs to the receiver's signal model), the GPS
  paragraph of `docs/architecture.md` and of `CLAUDE.md` (one sentence on the signal model and the lock rule).
- Code comments cite the Installation Manual (2-1, C-7), the Pilot's Guide (5-29, 5-30) and the papers above, in our
  own words.

## Left to the builder

- Names, the exact split between the service and pure functions, and where `isBlocked` lives.
- How the STA 1 "has lost satellites above the mask" query is shaped.
- Which existing tests need new expectations and which need a pinned `fadeScale`/`jitterScale` to stay meaningful.
