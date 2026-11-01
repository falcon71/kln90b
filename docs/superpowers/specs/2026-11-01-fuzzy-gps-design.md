# Fuzzy GPS position: design

Date: 2026-11-01. Issue: #402. Branch: `402-fuzzy-gps`. Inspiration, not a base: the abandoned branch `fuzzy-gps`
(commit `14424c12`).

## 1. Intent

Once it has a fix, the unit navigates on the exact sim position, while STA 2 shows an estimated position error. The real
unit navigates on what its receiver measures. That measurement is off by about the STA 2 estimate, and the receiver
smooths it. #402 asks for that measured position.

**What success looks like (maintainer):** in normal conditions the pilot notices nothing.

- The position does not jump.
- Ground speed and track are the unit's own measurements, not the sim's values. On the takeoff roll they follow the
  acceleration at once.
- The autopilot follows the flight plan without banking left and right.

The change shows only when accuracy is severely degraded, for example with three satellites plus the altitude input,
poor geometry or a wrong altimeter setting. With today's constellations that is rare.

**Why the experiment failed**, and what this design does differently:

- It added white noise to the position each second and derived the velocity by differencing the noisy positions. A
  filter that makes such a velocity smooth must average over many seconds, so it lags. A real receiver measures velocity
  from the Doppler shift of the satellite signals, which is accurate to a fraction of a knot whatever the position
  error.
- Its measurement noise `R` was a standard deviation where the filter needs a variance. It was about a million times too
  large, so the filter almost ignored the measurements.
- Its ANP formula used `^`, which is XOR in JavaScript, not a power.

The 1 Hz rate was not the cause: the real receiver reports at 1 Hz. This design stays in the 1 Hz calculation tick.

## 2. Evidence and background

- **The receiver is in the unit, not in the antenna.** The KA 91 and KA 92 are active antennas: a preamplifier powered
  over the coax (Installation Manual 14-15, 30). The GPS receiver is a module inside the KLN 90B with two processors of
  its own, connected to the host CPU over a serial line (Maintenance Manual 48-49). So the solution and any smoothing
  happen in the KLN 90B. The manuals do not say whether the host smooths the receiver's output further.
- **The altitude input is used in the solution.** STA 1 shows NAV A when it is (5-29, 5-30), and arming an approach posts
  `PRESS ALT TO SET BARO` (6-8, B-3), so the altimeter setting matters to the position. #453 already models the altitude
  as a measurement row in `GpsSolution.ts`.
- **Track comes from velocity.** The unit hides the track below 2 kt (3-35, `MIN_GROUND_SPEED_FOR_TRACK`), which fits a
  track that is the direction of a measured velocity vector: at walking pace a few cm/s of noise swing it around.
- **No dead reckoning, no heading in the position.** Nothing in the manuals says the heading input feeds the position.
  Heading serves wind, HDG-up maps and roll steering (Installation Manual 75).
- **GPS errors are slow.** Per satellite, the ranging error is dominated by the ionosphere, troposphere, satellite clock
  and ephemeris. These drift over minutes (textbook model: a first-order Gauss-Markov process). Receiver noise of about a
  meter is the only part that changes from second to second. The position error at one moment is roughly normally
  distributed around the truth; it is not uniform, and it is strongly correlated in time.
- **Modern error levels only** (#453, maintainer's decision): no Selective Availability, σ_UERE = 5 m. STA 2's EPE
  (2 × HDOP × σ_UERE) is about the 95% radius of the error this design produces.

## 3. Goals, non-goals, anti-goals

**Goals**

- The position the unit navigates on is truth plus a simulated receiver error, filtered.
- Ground speed and track come from a simulated Doppler velocity, filtered.
- The error follows the real satellite geometry: its size, shape and direction come from the satellites in use and the
  altitude input.
- A wrong altimeter setting, the 100 ft encoder steps and a non-standard atmosphere enter the solution through the
  altitude input, as they would on the real unit.
- Tests are exact by default and opt in to the simulated receiver.
- The added cost per tick is measured in the sim and passes the performance gate (6.9).

**Non-goals**

- Selective Availability, multipath environments, jamming.
- Fault detection and exclusion: RAIM stays an availability check (#453). A wrong altitude is not detected or excluded.
- Satellite failures (#366). This design makes them possible later as a range bias on one satellite, but does not add
  them.
- Any change to STA 2. It keeps showing the formal estimate from the geometry.
- Take-home mode. It has no satellites and is not supported (maintainer, #455). It stays exact.
- A vertical position output. The unit uses only the horizontal position.

**Anti-goals** (a failure even if the code works)

- Visible lag in position, ground speed or track.
- The autopilot weaving on a leg.
- Position jumps the pilot can see in normal conditions.
- Any change in behavior for the existing tests.

## 4. Constraints

- **Tick cost** (CLAUDE.md): the worst case of one tick's work, assumed 10× slower than Node on the maintainer's PC, must
  stay well under one 30 fps frame. No allocation in the per-tick path; reuse arrays and `GeoPoint`s.
- **SimVar reads are expensive.** Read each SimVar once per tick.
- `target: es2017`. No new dependencies.
- The public contract does not change. `GPS POSITION LAT/LON`, `GPS GROUND SPEED` and `GPS GROUND TRUE TRACK` keep their
  meaning: the unit's position, ground speed and track. They now carry the measured values.
- `GpsSolution.ts` stays a pure math module that imports nothing from the project.
- Seeded tests: the exact strategy must not call `Math.random`, so that the seeded draws of existing tests do not move.

## 5. Approaches

Considered:

- **A. Errors on the position, simple fixed-gain filter.** Two slowly drifting error values, north and east, sized by
  HDOP. A Doppler velocity with small noise. A fixed-gain (alpha-beta) filter. Cheap, but the error is always a round
  blob that ignores the real geometry, and a wrong baro would need a hand-made rule.
- **B. Errors on each satellite's range, solved through the real geometry, filter fed by Doppler.** Each satellite in use
  carries its own slowly drifting ranging error and a small range-rate noise, and the altitude row its own error. The
  position and velocity errors are the least-squares solution of those errors through the geometry `GpsSolution` already
  builds. A small Kalman filter per axis smooths the result.
- **Ruled out: a faster loop with a position-only filter.** Velocity from differenced positions is what made the
  experiment lag, and a faster tick puts the cost into more frames.

**Chosen: B** (maintainer). It is the most realistic: the error has the shape the sky produces, a satellite joining or
leaving changes it as on a real receiver, and a wrong altimeter setting degrades the position exactly as much as the
geometry lets it. It reuses existing math, and #366 can later add a satellite failure as a range bias. The maintainer
asked that its performance be measured in the sim on the self-test page (6.9).

## 6. Design

### 6.1 Strategy and selection

The measurement is a strategy behind an interface. Proposed names; the builder may choose better ones.

- `GpsMeasurement` (interface): given the truth, the solution and the elapsed sim time, it produces the position,
  ground speed and track the unit uses. It also has a reset for the life-cycle events of 6.7.
- `ExactMeasurement`: today's behavior, unchanged. Position = sim position. Ground speed = `GROUND VELOCITY`. Track =
  the bearing from the last to the current position, held while the position does not change (sim paused). It draws no
  random numbers.
- `SimulatedMeasurement`: the error model (6.3, 6.4) and the filter (6.5).

`KLN90BPlatform` gets a factory for the strategy. `SIM_PLATFORM` returns `SimulatedMeasurement`. `FakePlatform` returns
`ExactMeasurement` unless the test opts in through a `bootUnit` option (for example `simulatedGps: true`). The platform
reaches `GPS` through `KLN90BCore` and `Sensors`.

Take-home mode keeps its own dead-reckoning branch in `GPS.tick` and never calls the strategy.

### 6.2 Truth inputs

Read once per tick, in `GPS.tick`, only by the strategy that needs them:

- `PLANE LATITUDE`, `PLANE LONGITUDE` (both strategies, as today).
- Simulated: `VELOCITY WORLD Z` (north) and `VELOCITY WORLD X` (east), feet per second, ground-relative. Not
  `GPS GROUND SPEED`/`GPS GROUND TRUE TRACK`: the unit writes those itself. Exact: `GROUND VELOCITY`, as today.
- Simulated: `PLANE ALTITUDE` (true altitude) and, when the unit has an altitude input, the unit's own baro-corrected
  altitude `sensors.in.airdata.getIndicatedAlt()`. `Airdata` ticks after `GPS`, so this is the value from the previous
  tick; that is fine.
- `E:ABSOLUTE TIME`, already read, gives the elapsed sim time `dt`.

`GPS` needs access to the indicated altitude. Today it gets only a `hasAltitude` callback; widen that callback or pass a
second one.

### 6.3 Error model, per measurement

Each satellite in use (keyed by PRN) carries:

- **A slow ranging error** e_s: a first-order Gauss-Markov process with σ_s and correlation time τ, updated exactly for
  any `dt`: `e ← a·e + σ_s·√(1−a²)·n`, with `a = exp(−dt/τ)` and n standard normal.
- **Fast receiver noise** e_f: white, σ_f, drawn fresh every tick.
- **Range-rate (Doppler) noise** ė: white, σ_d, drawn fresh every tick.

The ranging error of the satellite is e_s + e_f. A satellite that enters the solution starts with e_s drawn from the
stationary distribution (σ_s). A satellite that leaves loses its state.

**The altitude row**, when the altitude input is present:

- Error = the unit's indicated altitude − `PLANE ALTITUDE`, in meters. This one value contains a wrong altimeter setting
  (about 1000 ft per inHg), the 100 ft steps of the gray-code encoder and a non-standard atmosphere. It is not random.
- Rate error: white, σ_altRate. The real receiver must constrain the vertical velocity somehow; a smoothed altitude rate
  is the assumption here. Differencing the 100 ft encoder steps would put 30 m/s spikes into the velocity.

**Numbers (my calls):**

| Quantity | Value | Why |
|---|---|---|
| σ_s | 4.9 m | With σ_f the total stays σ_UERE = 5 m, so STA 2's EPE stays honest |
| τ | 300 s | Typical correlation of ionosphere and ephemeris errors |
| σ_f | 1 m | C/A code noise of a 1990s receiver |
| σ_d | 0.05 m/s | Doppler velocity accuracy, a tenth of a knot |
| σ_altRate | 0.5 m/s | A smoothed vertical rate |

The normal draws use Box-Muller on `Math.random` (seeded in tests), keeping the second value of each pair.

### 6.4 From measurement errors to position and velocity errors

`computeGeometry` already computes, for every measurement row i, the horizontal parts of column i of `H = C Gᵀ` (`h0`,
`h1` in its slope loop). These are exactly the coefficients that map a whitened measurement error to a horizontal
position error.

- Extend `computeGeometry` to write them, for each row in the order of its input, into a reused output (for example
  an optional `Float64Array` parameter, or fields on the result). Also expose the two horizontal diagonal entries of
  `C`, for the filter's measurement noise.
- The whitening: a satellite row's error enters as is (weight 1, in units of σ_UERE). The altitude row's error enters
  multiplied by its weight `SIGMA_UERE_M / SIGMA_ALT_M`, because the row itself was scaled by that weight.
- Position error (north, east) = Σ_i h_i · ẽ_i over all rows. Velocity error = the same coefficients applied to the
  range-rate errors (σ_d per satellite, σ_altRate times the weight for the altitude row).
- The geometry is recomputed only when the satellites in use or their positions change (every 5 s at most). The error
  processes run every tick, so the per-tick work is one pass over at most nine rows.

**Check the frame first.** `GpsSolution` builds the line of sight with `Vec3Math.setFromSpherical(1, zenith, azimuth)`,
from the SDK's `[zenith angle, hour angle]` (`GPSSatellite.position`; computed in `applyProjection` in
`E:\msfs\msfs-avionics-mirror\src\sdk\instruments\GPSSat.ts`). For DOP and RAIM only magnitudes mattered. For this
design it matters which of `h0`/`h1` is north and which is east, and which way the hour angle turns. The builder works
that out from `applyProjection`, and a test pins it with a satellite at a known bearing. The sign of a satellite's
error does not matter (it is zero-mean), but the sign of the altitude row does: an altitude reading that is too high must
move the solution up, and its horizontal coupling must follow from that.

### 6.5 The filter

One Kalman filter per horizontal axis, north and east, each with the state [position, velocity], in meters and m/s in a
local frame around the filtered position. Each tick:

1. **Predict** over `dt` with constant velocity. Process noise: white acceleration with spectral density q.
2. **Update** with the measured position (truth + position error) and the measured velocity (truth velocity + velocity
   error). Measurement noise: position variance = σ_UERE² × the axis's diagonal of `C`; velocity variance from σ_d the
   same way.

The 2×2 matrices are written out by hand; no matrix library, no allocation.

Because the velocity is measured so precisely, the velocity estimate follows the truth within one tick. The position
estimate predicts with that velocity and blends in the measured position with a small gain. That smooths the 1 m
receiver noise and turns the step of a satellite change into a glide over several seconds, without lag in maneuvers.
The slow error passes through, because no filter can tell it from the truth; that is what the real receiver shows too.

The filtered position is a lat/lon. Moving it by `v·dt` and taking the innovation in north/east meters is a local
flat-earth step; that is accurate enough over one tick.

**Tuning (my call, to be checked against the tests of 6.10):** q = (3 m/s²)², a hard maneuver for a light aircraft. The
tests set the bounds; the builder adjusts q within them.

### 6.6 Outputs

- `GPS.coords` = the filtered position.
- `GPS.groundspeed` = the length of the filtered velocity, in knots.
- `GPS.trackTrue` = its direction, updated only while the ground speed is at least 2 kt (3-35), as today.

### 6.7 Life cycle

- **First fix and every regained fix** (`gpsAcquired`): the filter starts from the current measurement, position and
  velocity, with no history. `POSITION DIFFERS FROM LAST POSITION BY >2NM` compares against the measured position, not
  the truth.
- **Fix lost:** as today, the last values are held. The error processes stop.
- **Power-off and power-on:** all error and filter state is discarded. Nothing is persisted.
- **Sim paused** (`dt` ≤ 0): no update, outputs held.
- **Time acceleration:** the update uses the real `dt`; the Gauss-Markov step and the filter are exact for any `dt`.
- **Large gaps** (`dt` above 30 s, my call): the filter restarts from the measurement.
- **Slew, teleport, a new flight:** the truth moved much farther than its velocity explains. When the truth moved more
  than 1 NM beyond `v·dt` in one tick (my call), the filter restarts from the measurement. This uses only the truth
  inputs; no extra SimVar.

### 6.8 Roll steering

The comment on #402 raises the concern that a noisy track could make roll steering hunt, and that the real unit might
steer on heading plus drift. With Doppler velocity the track should stay smooth, so roll steering stays as it is. The
weaving test in 6.10 decides. **If it fails, stop and bring it to the maintainer**; do not build the heading-plus-drift
estimate on the side.

### 6.9 Performance gate

Before the change is merged, the maintainer measures it in the sim, during the first test flight of 6.9a:

- A temporary, uncommitted benchmark on the self-test page runs `SimulatedMeasurement`'s per-tick update many times, with
  the live satellites and the altitude input. It runs both the plain tick and a tick that includes a `computeGeometry`
  recompute. It logs the mean and the maximum per call to the Coherent GT debugger console.
- A Node benchmark of the same worst case runs beforehand, to catch a gross problem without the sim.
- **The gate (my call):** the measured worst case in the sim, times ten, is under 1 ms. That is 3% of a 30 fps frame and
  leaves room for the rest of the tick.

The benchmark code is thrown away after the measurement; the result goes into the commit message or the design's
record.

### 6.9a Sim flight gate: the autopilot in the worst case

Also before the merge, the maintainer flies the change in the sim with the default autopilot in NAV/GPS mode, on the
GPS SimVars, along a flight plan with turns. A normal flight shows little, because the error is meters, so the flights
force the worst case (maintainer's decision).

**The maintainer only takes off and engages the autopilot** (maintainer's requirement). Setting up a flight by hand
takes them long, so Claude prepares every flight in code beforehand:

- For each flight Claude builds a **temporary flight build**: the finished change plus an uncommitted setup module,
  hooked into `KLN90BCore` after `propsReady`, and builds it into the sim's community folder (`buildTargetDir`). The
  setup module and its hook are removed after the last flight and are never committed.
- **Preconditions on the maintainer's side:** the aircraft is on the runway, lined up for takeoff, when the unit is
  powered on, and its NAV/GPS source is set to GPS. Claude checks the aircraft's `panel.xml` first: it must have an
  altitude input (flight 2 cannot navigate without one) and must let the unit drive the autopilot through the GPS
  SimVars.
- **The test aircraft** (checked 2026-11-01): the Black Square Turbine Duke, flown on the sim's default autopilot, not on
  the KLN's roll steering. Its `panel.xml` has an air-data computer (the altitude input, with the baro entered on the
  unit, `BaroSource` 0), a heading input and `WriteGPSSimVars` true.
- **What the setup module does at power-on**, so that nothing is left for the pilot:
    - Approves the self-test automatically once it has run, and turns on fast acquisition, so the fix comes within
      seconds.
    - Sets `L:KLN90B_WriteGpsSimvars` so the GPS SimVars are written.
    - At the first fix, builds FPL 0 from temporary waypoints (region `XY`, not stored with the user's waypoints)
      relative to the position and true heading at that moment, and activates it. It replaces the stored FPL 0.
    - Applies the flight's degradation (below).
    - Records once per second into a ring buffer in memory: bank angle, `GPS WP CROSS TRK`, the unit's ground speed and
      track against the truth, its position error against the truth and the number of satellites in use. After the
      flight Claude reads the buffer through the sim-debugger skill as one JSON string of a few tens of KB.
- **The route (my call):** about 8.5 NM, so a flight takes about 4.5 minutes at 120 kt including the takeoff run:
  2 NM straight out along the runway heading to the first waypoint (takeoff, climb, engage the autopilot), a 90° right
  turn and 3.5 NM, then a 90° left turn and 3 NM to the end. The straight legs show weaving, the turns show the
  steps of the turn anticipation.

**The flights:**

1. **Baseline:** the simulated receiver with normal geometry and the correct altitude. This build also carries the
   performance benchmark of 6.9, which runs during the self-test and logs to the console, so the measurement needs no
   extra sim session.
2. **Realistic worst case, the gate:** at the first fix, inhibit all satellites but four (as the harness's
   `inhibitAllBut` does). At the first waypoint, inhibit one more, so the unit flies on three satellites plus the
   altitude input from there on, and the step of a satellite change happens in the air. The altitude row carries a
   1000 ft error from the start, the effect of an altimeter setting about 1 inHg off. It is injected into the altitude
   error directly, so it does not depend on whether the aircraft's altitude comes from an encoder or an air-data
   computer.
   Pass: the bank angle on the straight legs shows no oscillation beyond flight 1's, and the turns look like flight 1's.
   The position is expected to be off by the degraded error; that is not a failure.
3. **Stress test, not a gate:** normal geometry, with every simulated error multiplied by 20 (roughly Selective
   Availability). The multiplier lives only in the flight build. The flight shows how wide the margin is. A failure here
   is reported to the maintainer, not fixed on the side.

If flight 2 shows weaving, stop and bring it to the maintainer (see 6.8).

### 6.10 Tests

At the cheapest stage that can observe each property. The simulated strategy is opted into per test, with a fixed seed.

**Unit (Node)**

- Gauss-Markov step: stationary σ over a long run, correlation after τ about 1/e, exact for a large `dt`.
- The frame pin of 6.4: a satellite at a known bearing, and the sign of the altitude coupling.
- The mapping: with all satellite errors zero, a 300 m altitude error moves the position by the amount the coefficients
  give (independently computed in the test, not by the function under test). Three satellites plus altitude move it far
  more than eight satellites plus altitude.
- The filter: a step in the measured position settles over several ticks; a velocity step is followed within one tick;
  constant input converges to it.

**Flight (simulated strategy)**

- **Accuracy:** over an hour of straight flight, the horizontal error is inside STA 2's EPE in at least 90% of the
  samples, and is not zero.
- **No jumps:** the position never moves more than a few meters per tick beyond `v·dt`, including when satellites leave
  the solution (`inhibitAllBut`).
- **Takeoff:** from standstill, accelerating at 4 kt/s, the unit's ground speed is within 1 kt of the truth from the
  second tick on.
- **Track:** on a straight leg at 120 kt, the track the pages show (whole degrees) stays within 1° of the truth, and
  the 99th percentile of the tick-to-tick change of `trackTrue` stays under 0.2°. Not the maximum: with σ_d = 0.05 m/s
  the worst tick of a long run is near that bound by chance, and σ_d is not tuned to pass a test (my call). Below 2 kt
  no track is shown (existing behavior).
- **Takeoff and track together:** the takeoff bound needs a velocity gain near 1, so the filter barely reduces the
  Doppler noise. That is intended: the real receiver's velocity is that precise. If the two tests conflict, stop and
  report it; do not change σ_d or add a separate track smoothing on the side.
- **No weaving:** flying a flight plan with turns, the roll command and the cross-track on the straight legs after the
  intercept stay within small bounds (the builder sets them from the exact strategy's run plus a margin).
- **The sim's autopilot path:** most users fly the sim's or the aircraft's own autopilot on `GPS WP CROSS TRK`,
  `GPS WP DESIRED TRACK` and `GPS WP TRACK ANGLE ERROR`, not on the KLN's roll command. With `Output.WriteGPSSimVars`
  set, on the same straight legs, those SimVars stay within small bounds tick to tick (the builder sets them from the
  exact strategy's run plus a margin).
- **Wrong baro:** with three satellites plus altitude and the altimeter setting off by 1 inHg, the position error is many
  times larger than with the correct setting. With eight satellites the difference stays small.
- **Life cycle:** a pause holds the outputs; a teleport restarts the filter within one tick.

**Guard**

- The default `bootUnit` uses the exact strategy: after a fix, `coords` equals the sim position exactly.
- The whole existing suite passes without changes.

The test harness's `Aircraft.writeTo` and the boot SimVars must also write `VELOCITY WORLD X/Z` from ground speed and
track, so that the opt-in tests have a truth velocity.

### 6.11 Documentation

- `docs/architecture.md`, Core 3: replace "no position error or noise" with the measurement strategy, the error model,
  the filter and the life cycle.
- `CLAUDE.md`, Architecture: the GPS bullet says a fuzzy position (#402) is not modeled; update it.
- `test/README.md`: the opt-in option, and that the default is exact.
- The header comment of `GpsSolution.ts`: the new output.
- No wiki change: the public contract keeps its meaning.

Commits: this design and the plan as `references #402`, the implementation with its tests and doc changes as one
`fixes #402` commit.

## 7. Left to the builder

- Names of the interface, classes, files and the `bootUnit` option.
- How the platform's factory reaches `GPS`, and how `GPS` gets the indicated altitude.
- The storage of per-PRN error state (a preallocated array indexed by PRN is suggested).
- Exact test bounds, within the intent of 6.10, and q within them.
- Where the self-test benchmark hooks in.

## 8. My calls, for the maintainer to check

- The error budget split and the correlation time (6.3 table).
- The altitude row's error as indicated − true altitude, with no random part, and its rate error as white noise.
- A new satellite starts with a fresh draw; a satellite that leaves forgets its error.
- The filter's process noise q = (3 m/s²)².
- Restart thresholds: `dt` above 30 s, and a truth jump of more than 1 NM beyond `v·dt`.
- The performance gate: the in-sim worst case × 10 under 1 ms.
- The test-flight route (6.9a), the 1000 ft altitude error standing in for a wrong altimeter setting, the multiplier
  of 20 for the stress flight, and the pass criterion of flight 2: no oscillation beyond the baseline's.
- Roll steering unchanged unless the weaving test fails, and then a stop for a decision.
