# The hot-swap crash of the GPS SimVars' null state (#462) — design

Date: 2026-11-03. Size: a small change, one `fixes #462` commit. Approach chosen by the maintainer in the session.

## Intent

`SensorsOut.reset` has carried the null state of the GPS SimVars commented out since d3c5230f (2024-03-03), after a
crash to desktop in FS2020. So a switched-off KLN leaves the GPS SimVars frozen at its last values with
`GPS OVERRIDDEN` still 1, and a GPS-coupled autopilot keeps following a frozen DTK and deviation. The failure
simulation (#366, #458) needs the same null state for a failed port. The sim tests of 2026-11-03 found the cause, so
the null state can be written again: at every power change, and later by a failed port.

## What the sim showed (MSFS 2024, 2026-11-03, Turbine Duke with its hot swap to a GNS)

A throwaway build let the console fail an output port (it writes its null state once, then drops every write); the
Coherent GT debugger wrote single SimVars directly. The record goes into `docs/sim-flight-record.md`.

| Case | `WP COUNT` / `WP INDEX` | Other GPS SimVars | Hot swap KLN to GNS |
|---|---|---|---|
| Every port failed, the old null state | 0 / 1 | zero | **crash** |
| A | 0 / 0 | zero | no crash |
| B | 0 / 1 | live values | **crash** |
| D, normal operation, last waypoint active | 3 / 3 | live (unit working) | no crash |
| C | 1 / 2 | live values | no crash |

- The cause is an index above 0 with a count of 0: an active waypoint in an empty flight plan. The old comment's
  guesses (a start on the runway, `L:KLN90B_Disabled` set at once, no calculation tick yet) were wrong: the KLN had
  ticked for minutes before the crashing swap.
- The 1-based index the unit writes is safe: index = count (the last waypoint active) does not crash (D). An index
  above a non-zero count did not crash either (C), but it is no state the unit should write.
- Without a hot swap the null state is harmless: written at load, at a power cycle and in flight, nothing crashed.
- Hot swaps alone (KLN to GNS and between the other units, several times) did not crash.
- Further observations for the record and for #458: a failed analog nav port (`GPS IS ACTIVE WAY POINT` false,
  deviation 0) drops the Duke's default autopilot from NAV to HDG at once, and it stays in HDG after the repair; failed
  ARINC 429 nav data alone leaves it in NAV, tracking on the deviation. With `GPS IS ACTIVE WAY POINT` false the sim
  reports `GPS WP DISTANCE` 0. The sim ignores the unit of a write to these GPS SimVars (a distance in nautical miles
  lands as meters): they must be written in their own units, as `SensorsOut` does. `GPS WP NEXT ID` and `PREV ID` read
  back empty although the unit writes them.

## Approaches

1. **A guard in `setWPIndex` (chosen).** The written index never exceeds the count, so an empty flight plan writes
   0 / 0, whoever the caller is: `reset()` now, a failed port of #458 later. The comment at the guard names the crash
   and #462.
2. Pass `setWPIndex(-1, 0)` in `reset()` only. Rejected: the smallest change, but the next caller (#458's null state)
   would fall into the same trap.

## What gets built

- **`setWPIndex`** writes `GPS FLIGHT PLAN WP INDEX` as today (the active index + 1), but never above the count. Normal
  operation is unchanged (the index never exceeds the count there).
- **`reset()`** writes the null state of the GPS SimVars at every power change, on and off, under its existing gate
  (`Output.WriteGPSSimVars` on and the unit not disabled for hot swapping), after claiming `GPS OVERRIDDEN` as today.
  It is the commented-out list with today's signatures, with two changes the maintainer decided:
  - **No `K:GPS_OBS_OFF`.** LEG/OBS is a switch state, not a value, and the KLN must not flip it at a power change. The
    null state of the mode is `GPS IS APPROACH ACTIVE` false and `GPS APPROACH MODE` 0 only; the next calculation tick
    writes the real mode.
  - **`GPS WP CROSS TRK` 0 at once.** Only the 16 Hz signal tick writes it, and that tick stops at power-off. The
    manuals do not describe the unpowered D-bar; our reading of the driver (CMM 64-65, `SignalOutputFilter`): the RC
    filter sits before the op-amp stages that hold the pin, so without power the pin drops to 0 V at once, and the
    needle returns at the speed of the indicator's own movement (guess).
- The constructor's call of `reset()` stays. It writes the null state once at load, before the first power-on, as the
  first sim test did without harm.
- **The comment in `reset()`** is replaced by the cause and the evidence (the table above in short), so that the pair
  can never come back.

## Non-goals

- No change to normal operation, the `L:KLN90B_*` outputs (`setPoweredOff`), `GPS OVERRIDDEN` or the hot-swap paths.
- Not the failure simulation itself (#458); only the spec text it builds on.
- Not #74 (multiplayer crashes near the ground), which is not known to be related.

## Tests (the cheapest stage that observes it)

- Render: at power-off the GPS SimVars get their null values (position, DTK, distance, active waypoint false,
  `WP COUNT`/`WP INDEX` 0 / 0, `GPS WP CROSS TRK` 0) and stay there while the unit is off; at power-on they get the null
  state and then live values; nothing is written while the unit is disabled or with `Output.WriteGPSSimVars` off;
  no `K:GPS_OBS_OFF` or `K:GPS_OBS_ON` at a power change.
- An invariant over every write: `GPS FLIGHT PLAN WP INDEX` never exceeds `GPS FLIGHT PLAN WP COUNT`, through a power
  cycle, normal flight and a Direct To the last waypoint.
- The whole existing suite stays green.
- Sim: the built fix, the KLN switched off (null state written), then a hot swap to the GNS: no crash.

## Docs

- `docs/failures.md`: the null state is written at every power change (#462), so "the power-off path stays as it is"
  goes; "The hot-swap crash" is replaced by the cause and the rule; the null state of a failed port uses the same
  setters (so it gets the guard, no `K:GPS_OBS` event, the deviation 0); the synthetic sim test is done (2026-11-03),
  with the autopilot observations above; testing keeps a sim check of #458's failed ports with a hot swap.
- `docs/sim-flight-record.md`: a dated block for the 2026-11-03 tests (the zeroing flights, the hot swaps, cases A to
  D), with the trap that the sim ignores the unit of a GPS SimVar write.
- Wiki (drafted for the maintainer): the outputs while the unit is off now include the GPS SimVars' null state (pages
  Autopilot and CDI/HSI, if they say what happens at power-off).
