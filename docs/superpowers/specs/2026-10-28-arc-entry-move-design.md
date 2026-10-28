# MOVE ? on a DME arc entry next to the active leg (#420, #441, #442): design

Date: 2026-10-28. Issues: #420, #441, #442 (bugs). Branch: `arc-entry-move`.

A small change, three `fixes #NN` commits, each with its tests and doc changes (CLAUDE.md).

## 1. Intent

MOVE ? (Pilot's Guide 6-17) moves a DME arc entry to where the present track meets the arc. Every display, output and
turn decision should then use the moved entry, wherever it sits relative to the active leg. Today only the path of the
active leg is rebuilt, and only when the moved entry is the active waypoint (`moveArcEntry`,
`services/FlightplanUtils.ts`). The cause is the same for all three issues: `Flightplan.setArcEntry` changes the leg in
place, and `ActiveWaypoint` keeps copies or instance checks that do not see an in-place change.

- **#420, the entry is the leg before the active leg** (the arc is active): `from` is a copy made at the activation
  (`setFplData`), so NAV 1, NAV 3, Super NAV 1, the NAV 5 and Super NAV 5 maps and the previous-waypoint GPS SimVars keep
  the old entry until the next sequencing. Guidance is right, because the arc circle object is shared.
- **#441, the entry is the leg after the active waypoint:** the #408 instance check does not fire, so a turn started onto
  the old entry and a decided lead plan stay.
- **#442, the entry is the active waypoint:** `recalculatePath()` rebuilds the path, but a turn started onto the arc
  and a decided lead plan stay, as in #441.

## 2. Evidence

- Pilot's Guide 6-17 and 6-18: MOVE ? from Super NAV 5 and FPL 0, NO INTRCPT when the track does not meet the arc. The
  guide describes the move before the arc is reached, but does not forbid it later.
- KLN 89 trainer: it has a DME arc but offers no MOVE ? (`docs/kln89-trainer-record.md`, 2026-10-24), so none of the
  three cases can be checked there.
- #408 rule (c), checked in the KLN 89 trainer on 2026-10-27 for an edit of the next leg (runs a2 to a16): the
  waypoint's own started turn is dropped, a lead plan is decided again, an abeam plan is kept, and a leftover of the
  previous waypoint's turn stays.

## 3. Behavior

- **#420.** After a move of the entry behind the aircraft, `from` is the moved entry, with the arc's circle as its path,
  as a sequencing onto the arc would make it. During a Direct To, `from` is the Direct To origin and is not touched.
- **#441.** A move of the entry after the active waypoint is handled exactly as an edit of the next leg under #408
  (`onFollowingLegChanged`).
- **#442.** A move of the entry that is the active waypoint rebuilds the active path as today, and then applies the
  same rule as #441 to the active waypoint's turn state. This is the design's call, with no trainer evidence: the rule
  was observed for a changed next leg, not for a moved active waypoint, but it covers what changes here (the turn onto
  the arc and the lead), and one rule for all edits around the active waypoint is easier to reason about. The
  alternative, also dropping an abeam plan because the inbound leg itself changed, was not chosen. A Direct To to the
  entry is handled the same way.
- A move of any other arc entry changes nothing in `ActiveWaypoint`, as today.
- MOVE ? stays offered behind the aircraft. Refusing it has no evidence (#420's alternative).

## 4. Approaches

- **A. `moveArcEntry` tells `ActiveWaypoint` which leg moved (chosen by the maintainer).** One public method of
  `ActiveWaypoint`, called by `moveArcEntry` after `setArcEntry`, decides by the moved index relative to the active
  index: the one before rebuilds `from` (#420), the active one rebuilds the path and applies the turn rule (#442), the
  one after runs the #408 handling (#441). `setArcEntry` keeps changing the leg in place. Both entry points (Super NAV 5,
  FPL 0) already go through `moveArcEntry`. Its cost: a future in-place edit of a leg needs the same call.
- **B. `setArcEntry` replaces the leg object**, so that the instance checks catch it. #441 would come for free, but a
  move of the active entry would trip the active-leg check and reactivate FPL 0 (`activateFpl0`): a Direct To dropped,
  the closest leg picked again, the whole turn stack cleared, the previous turn's run-out included. #420 would still
  need its own code, as `from` is a copy. Not chosen.
- **C. `ActiveWaypoint` notices the edit by itself**, by also remembering the `wpt` instances of the from, active and
  next legs in `assertToMatchesFplIdx`. It would catch any future in-place edit, but is more implicit, and adds work to a
  check that runs several times per calculation. Not chosen.

## 5. Left to the builder

- The method's name and signature, and whether `recalculatePath` stays public or is folded into it. `moveArcEntry` is
  its only caller today.
- How #420 rebuilds `from`: by the same rule as `setFplData` (a new object, the arc's circle as the path), without the
  rest of what `setFplData` does (setting `to`, clearing the Direct To, saving the last active waypoint).
- The three commits build on each other in the order #441, #442, #420 or any other, as long as each commit stands on its
  own with its tests. The shared method arrives with the first.
- `docs/architecture.md`: the `ActiveWaypoint` section (the #408 paragraph and the API list) and the `SidStar` bullet on
  MOVE ? say how a moved entry reaches `ActiveWaypoint`.
- Tick cost: none. The move runs on ENT, never in a tick.
- `WTFlightplanSync` needs nothing: `setArcEntry` publishes before the new method runs, but the FPL 0 mirror reads the
  plan's legs, and the Direct To plan's `from` is not touched by #420.

## 6. Tests

- #420: the render pin `makes the moved entry the from waypoint of the active arc leg (#420)`
  (`test/render/controls/FlightplanList.test.ts`) loses its `.fails`. Add an assertion that the from path is still the
  arc (not a great circle), and a test that a Direct To keeps its origin as `from` when the entry before the active leg is
  moved.
- #441: the flight pin `drops the turn started onto the old entry when the entry is moved (#441)`
  (`test/flight/flights/dmeArc.test.ts`) loses its `.fails`. Add a test that an abeam plan is kept and a lead plan is
  decided again, at the cheapest stage that can set them up.
- #442: a new flight test beside the #441 one, with the entry as the active waypoint and the turn onto the arc started:
  the turn is dropped and started again for the moved entry, with a passing sibling that holds the setup. The same check
  for the turn plan as in #441.
- A move of an entry two or more legs away changes no turn state (one test, any stage).
