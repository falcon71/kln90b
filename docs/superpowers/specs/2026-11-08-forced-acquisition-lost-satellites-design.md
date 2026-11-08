# A forced acquisition keeps a lost satellite searched in its channel (#469)

Short design, approved by the maintainer on 2026-11-08.

## Intent

An engine-running start (the forced acquisition of #215) inside a total signal loss, such as a jammer, a spoofer or a
full noise rise, acquires nothing, which is right. But once the signals return, the fix comes back only after about
4 minutes, while a unit that lost its satellites in flight reacquires in the idle acquisition time plus TRAN. The two
cases should reacquire the same way.

## Cause

The forced update (`GPSSatComputer.acquireAndUseSatellites`, SDK `updateSatellites(0, true, true)`) assigns the
channels from the SDK's geometric signal strength, so a lost satellite that is in view gets a channel. Its
`updateState` then runs under the reachability wrapper of #467 (`KLNGPSSatComputer.wrapReachability`), which shows a
lost satellite with a strength of 0. On the forced branch (`GPSSat.ts` `updateStateTracked`) an unreachable satellite
is set to `Unreachable`. From then on the SDK treats its channel as open and keeps it out of the assignment until its
unreachable time expires.

## Goals

- After a forced acquisition, a satellite whose signal is lost stays in its channel, `None`, and is searched, as after
  any other loss (#467).
- Once the signals return, the fix comes back within the reacquisition time of a satellite lost in flight
  (`IDLE_ACQUISITION` with its range, plus TRAN).

## Non-goals and anti-goals

- A forced acquisition inside a total signal loss still acquires nothing, and one with some satellites lost acquires
  only the others.
- FAST (#468) is not changed: it still forces nothing.
- The reachable satellites' forced acquisition (`DataCollected` at once) is not changed.
- No satellite is shown as `Unreachable`, not even for one update.

## Approaches considered

- **B (chosen): the unforced path for a lost satellite.** In `wrapReachability`, a lost satellite's `updateState`
  runs with `forceAcquireAndUse` false. The forced update passes a delta time of 0, so the SDK's unforced `None`
  branch starts the acquisition clock at 0 and neither acquires nor times out: the satellite stays `None` in its
  channel. A lost satellite with another state follows the unforced loss rules, as in any calculation tick. One change
  where the signal loss is already modeled, and no `Unreachable` state is ever set.
- **A: forget the marks afterwards.** After `super.acquireAndUseSatellites()`, reset every lost satellite that the SDK
  marked `Unreachable` (as `forgetUnreachable` does for the sky search of #465). It works, but every lost satellite
  shows `Unreachable` for one update, which state subscribers (STA 1, `FakeReceiver.heldUnreachable`) can see, and the
  loss predicate has to be kept a second time. Rejected for that reason.

## Design

- `wrapReachability`: for a lost satellite, call the SDK's `updateState` with `forceAcquireAndUse` false, inside the
  existing strength-0 window. Nothing else changes in the wrapper, and it still allocates nothing per call.
- The doc comments that give the `Unreachable` marking of the forced path as a fact or as a reason are updated:
  `acquireAndUseSatellites`, `startFast` and their tests' comments. FAST keeps its reason not to force: it starts the
  normal search from the true state, the same receiver as REAL.

## Tests

- The pin of #469 in `test/render/failures/GpsJamming.test.ts` becomes a normal test.
- The characterization tests that expect `Unreachable` after a forced acquisition with lost satellites
  (`test/render/SatelliteReachability.test.ts`) expect instead that no satellite is `Unreachable` and that the lost
  satellites in channels are `None`.

## Left to the builder

- The exact wording of the updated comments, and whether a render test also checks STA 1 right after the forced
  acquisition.
