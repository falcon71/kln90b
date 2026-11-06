# FAST GPS acquisition as a hot start from the true state (#468)

Short design, approved by the maintainer on 2026-11-06.

## Intent

FAST (SET 10) exists so the pilot can use the GPS more or less right away after power-on, typically after loading a
flight somewhere else in the world, without the long almanac or sky search a real unit would need. In flight, FAST must
behave exactly like REAL. Since #467 it does not: with FAST's 1 s `acquisitionTimeout` a satellite lost to a weak
signal turns `Unreachable` and stays out for the SDK's `unreachableExpireTime` (1 h), while REAL reacquires it in
seconds.

## Goals

- FAST is the same receiver as REAL: the same SDK timings, the same start model, the same signal loss, reacquisition
  and jamming.
- A FAST power-on anywhere in the world has its fix in hot-start time, about 17 s after power-on, self-test included
  (#62).

## Non-goals and anti-goals

- No FAST-specific timings anywhere.
- No forced acquisition for FAST. The forced path makes a lost satellite `Unreachable`, which is the bug being fixed.
- The engine-running start (`WelcomePage`, forced acquisition) is not changed.
- A FAST unit that is jammed at power-on still acquires nothing.

## Approaches considered

- **A (chosen): initialize memory from the truth, then the normal search.** At power-on, and when SET 10 is switched
  to FAST while there is no fix, the unit's memory is set to the true state and the start model runs as in REAL. One
  code path, and no forced acquisition.
- **B: initialize, then force an acquisition on the SET 10 switch.** Instant fix on the switch, but it keeps a path
  that differs from REAL and keeps the `Unreachable` problem. Rejected for that reason.

## Design

- **The truth.** The sim position as the last known position (`coords`, and the SDK's last known position), the
  unit's clock set to the correct time, a current almanac (completed at the current time), and a current ephemeris
  for every satellite (its ephemeris time set to the current time). This is what a pilot would do by hand on SET 1 and
  SET 2, plus the ephemeris.
- **When.** At every power-on with FAST selected, before `search.start`. Also when SET 10 is switched to FAST while the
  unit has no fix: the same initialization, then the search restarts (as `reinitializeSearch` does). With a fix,
  switching does nothing. Switching to REAL does nothing; the next power-on runs as REAL.
- **The SDK's hot path.** The SDK uses `acquisitionTimeWithEphemeris` only within 2 NM of its last known position and
  with a valid cached ephemeris (`GPSSatellite.updateStateTracked`). The last known position and the ephemeris times
  must both be set before the first acquisition, including when the satellites finish loading after power-on (the
  ephemeris restore in `awaitInit`).
- **Consequences, deliberate.** In FAST the first fix matches the stored position and the clock, so neither
  `POSITION DIFFERS FROM LAST POSITION BY >2NM` nor `SYSTEM TIME UPDATED TO GPS TIME` appears. The maintainer wants
  this: the position message is a nuisance for most users. REAL keeps both messages.
- **Removed.** The FAST branches of the `GPSSatComputerOptions` timings, the FAST early return in `GpsSearch.start`,
  the FAST `downloadAlamanac()` call in the `Gps` constructor and the forced acquisition in
  `Set10Page.saveFastGpsAcquisition`. The comment "after a switch from FAST it stays off until the next session" goes.

## Docs and tests

- Update the FAST notes in `docs/architecture.md`, `docs/failures.md` (the `*xx-` paragraph of #467) and
  `test/README.md`.
- Tests: a FAST power-on far from the stored position has its fix in hot-start time and shows neither message; FAST
  and REAL lose and reacquire a satellite in a bank alike (the `antennaAttitude` boot option of #467); a SET 10 switch
  to FAST during a search gives a hot-start fix; the #467 jamming tests no longer pin `fastGpsAcquisition: false`.
- The harness default is FAST, so many seeded timings move. They are updated, not worked around.

## Left to the builder

The exact place of the initialization (a method on `GPS` called from `powerChanged` and from SET 10), how the
ephemeris time reaches satellites that load after power-on, and which time base the SDK compares the ephemeris time
with.
