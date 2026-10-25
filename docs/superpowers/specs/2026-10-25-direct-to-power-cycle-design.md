# Direct To over a power cycle (#422) and the purge of the active waypoint (#193): design

Date: 2026-10-25. Issues: #422 (bug), #193 (question). Branch: `trainer-checks-193-422`.

A small change. Two commits, in this order: `fixes #422`, then `fixes #193`, each with its tests and doc changes
(CLAUDE.md). The #193 tests of a long power-off rely on #422.

## 1. Intent

**#422.** A Direct To that is active at the power-off survives every power cycle today, however long the unit was off.
The real unit drops it after a long power-off and comes back on the flight plan.

**#193, question 2.** The purge of temporary waypoints (region `XY`) at every power event deletes a waypoint that no
flight plan holds, even when it is the active Direct To target. After a short power-off the Direct To survives, so the
pilot flies to a waypoint that is gone from the database: it cannot be looked up and is missing from OTH 3. OTH 3 itself
refuses to delete the active waypoint (ACTIVE WPT, C-1).

**#193, question 1** (the purge at power-on as well as power-off) is answered without a change: the real unit cannot run
logic when its power is cut, so the deletion "when the unit is turned off" (5-22, 5-26) takes effect at the next
power-on, which is also the only run that follows leaving the sim with the unit on. The power-on purge stays.

## 2. Evidence

- KLN 89 trainer, 2026-10-25 (`docs/kln89-trainer-record.md`): a relaunch dropped the Direct To 6 of 6 times and came
  back in Leg on an FPL 0 leg; the first page still showed the old target. The trainer does not model the time off and
  treats every relaunch as a long power-off.
- AVsoftech KLN 90B trainer, 2026-10-25, checked by the maintainer: turning the unit off and on quickly kept the Direct
  To; closing the program and starting it again dropped it and activated FPL 0. The maintainer ruled that this follows
  the 5-minute rule (6-5) and is adopted, although that trainer is otherwise unreliable. In the same check, with fewer
  than two waypoints in the flight plan, the unit came up flagged after a restart of the program.
- The 90B guide is silent about the Direct To at power-on; it says the unit powers up in ENR-LEG (3-3) and shows the page
  of the waypoint that was active before the power-off (3-8).
- The #192 rule (2026-10-24 power-cycle design): state kept only over a short interruption stays in `VolatileMemory`
  behind `RESET_TIME`, and a sim restart counts as a long interruption. A sim restart already drops the Direct To: the
  fresh `ActiveWaypoint` has no leg and `NavCalculator` (`:107`) activates the closest FPL 0 leg.

## 3. Behavior

- **Off for more than 5 minutes** (`timeSincePowerChange > RESET_TIME`, the check that removes the procedures): the
  Direct To is dropped at the power-on. The unit has no active leg until the first calculation tick with a valid GPS
  position activates the closest FPL 0 leg, as at a sim restart. With fewer than two waypoints in FPL 0 there is no
  active waypoint.
- **Off for 5 minutes or less:** the Direct To is kept, as today.
- **A sim restart:** unchanged; it already drops the Direct To.
- **The first page after the power-on** shows the page of the waypoint that was active at the power-off (3-8), also
  when the Direct To to it was dropped.
- **The purge of temporary waypoints** skips the active waypoint, at the power-off and at the power-on. After a long
  power-off the Direct To is dropped first, so the power-on run purges the former target once no flight plan holds it.
  After a short one the target stays as long as it is active. A temporary waypoint that a flight plan holds is kept, as
  today.

## 4. Approaches

- **A. Clear the Direct To, let the first calculation tick pick the leg (chosen).** A new `ActiveWaypoint` method,
  called from `VolatileMemory.reset` after a long power-off, clears the Direct To and leaves no active leg, publishing
  `activeWaypointChanged` so that the SDK flight plan mirror (`WTFlightplanSync`) follows. `NavCalculator` then
  activates the closest leg through the path a sim restart takes. One activation path after any interruption, and the
  leg is chosen from a valid GPS position.
- **B. `cancelDirectTo()` in the reset.** The D->, CLR, ENT path (3-29) picks the closest leg at once, but from the
  position at the power-off, before the GPS has a fix, and it writes the saved last active waypoint during the reset.
  It would give a sim restart and a power cycle two different paths to the same state. Not chosen.

Shared by both: the reset takes a copy of the last active waypoint for the start page before anything can change it,
and `PageManager.startMainPage` reads that copy. A leg activated before the database page is acknowledged would
otherwise overwrite `lastactiveWaypoint` and the start page would show the new leg's waypoint.

`TemporaryWaypointDeleter` gets the `ActiveWaypoint` and spares the facility whose ICAO equals the active waypoint's. It
relies on `VolatileMemory` subscribing to `powerEvent` before the deleter (it is built earlier in `KLN90BCore.init`), as
the purge of DME arc entry waypoints already does (#94). A comment says so where the deleter is constructed.

## 5. Tests

- #422 (render, `test/render/data/VolatileMemory.test.ts`): the `it.fails` pin becomes a plain test (off 600 s: no
  Direct To, the leg to KBBB active); a power-off of under 5 minutes keeps the Direct To (AVsoftech 2026-10-25); the
  start page after a long power-off with a dropped Direct To shows the old target's page (3-8). The precondition sibling
  stays.
- #193 (render, `test/render/services/TemporaryWaypointDeleter.test.ts`): the characterization "deletes a temporary
  waypoint that is the active direct-to target once no plan holds it" becomes two spec tests: kept as long as it is
  active over a short power cycle; purged at the power-on of a long power cycle that drops the Direct To. The other
  characterizations (the purge at the boot, the DME arc entry waypoint) are relabeled as answered by #193 question 1.
- Each new test is verified by breaking its subject (test/README.md, section 5).

## 6. Docs

- `docs/kln89-trainer-record.md`: a block for the maintainer's AVsoftech check of 2026-10-25, in the #422 commit.
- `docs/architecture.md`, if it describes what a power-on resets or the deleter: the same change.
- No public contract changes: the `activeWaypoint` setting keeps its format, and the SDK planner mirror follows through
  the existing event. No wiki page is affected.

## 7. Left to the builder

The name of the new `ActiveWaypoint` method and of the start-page copy, where the copy lives (`NavPageState` next to
`activeWaypoint` is the obvious place), and whether the turn stack is cleared inside the new method or by the existing
`clearTurnStack()` call in the reset.
