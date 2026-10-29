# The turn-plan decision, the abeam plan's late turn, edits in front of the active waypoint and the inside bisector (#438, #439, #440, #443): design

Date: 2026-10-29. Issues: #438, #439, #440, #443 (bugs). Branch: `turn-plan-438-439-440`.

A project: one commit with this design, the trainer data and the record, then one `fixes #NN` commit per issue, each with
its tests and doc changes (CLAUDE.md).

## 1. Intent

When an aircraft approaches a waypoint off the inbound leg, the KLN 90B chooses between two ways of turning onto the
next leg (`TurnPlan` in `data/flightplan/ActiveWaypoint.ts`, the 2026-10-20 design,
`2026-10-20-waypoint-sequencing-design.md`, section 3.3): the turn plan (`AT_LEAD`, the normal turn circle from the lead)
and the abeam plan (`AT_ABEAM`, a zero-size turn at the abeam line). The emulation's rule for that choice came from the
2026-10-20 trainer check and has turned out wrong in its moment, its gate and its latch (#438). The abeam plan also
misses the trainer's late normal turn (#439). And an edit in front of the active waypoint reactivates FPL 0, losing the
turn state (#440).

The goal is the real unit's behavior as the KLN 89 trainer shows it, quirks included (faithful emulation, CLAUDE.md).
Where the trainer could not show it, the design says so and the code comment names the call.

- **#438.** Today the plan is decided once, at the decision point L + roll-in + 20 s of ground speed before the
  waypoint, with a gate of 2.8 NM at every speed, and latched until the waypoint changes. The trainer decides at the
  first calculation of the leg, with a gate that grows with the ground speed, and the plan follows the cross track
  afterwards (section 3.1).
- **#439.** On the abeam plan the emulation always flies the zero-size turn at the abeam line. The trainer switches to
  the normal turn once the aircraft is within 1.0 NM of the inbound leg, at a periodic check (section 3.2).
- **#440.** Deleting or inserting a waypoint in front of the active one moves the active leg to another index;
  `ActiveWaypoint.assertToMatchesFplIdx` then reactivates FPL 0 (`activateFpl0`, which clears the turn stack and the
  plan). The trainer keeps the active leg and its plan, but drops the previous waypoint's turn circle (section 3.3).
- **#443.** On the turn plan an aircraft that crosses the bisector on the inside of a turn before the turn point is
  not sequenced; the trainer sequences it there, with no turn (section 3.4).

Non-goals: the off-leg regime beyond 4.0 NM (`tickOffLeg`, #157) stays as it is; the lead distance, roll-in, turn
circle, bisector sequencing and alert end are unchanged; the edit of the leg after the active waypoint (#408,
`onFollowingLegChanged`) and MOVE ? (#420, #441, #442) keep their rules.

Anti-goal: a rule that fits the data by construction but no simple implementation a 1989 unit would have; the gate and
the check below are the simplest forms that fit.

## 2. Evidence

All in `docs/kln89-trainer-record.md`, blocks 2026-10-20, 2026-10-27, 2026-10-28 and 2026-10-29, with the raw data,
reports and analyses in `docs/kln89-trainer-data/2026-10-28/` and `2026-10-29/`. The closing analysis is
`2026-10-29/analysis-4.md`; it rebuilds every decided pass of the series and tests each candidate rule against all of
them (its fit table names the misses).

- The plan is decided at the first calculation of a leg: its activation (a sequencing, a Direct To, a leg change by a
  jump), a re-initialization of the position (a SET 1 jump, also onto the same leg), and an edit of the active
  waypoint's coordinates (the drift passes d1 and d2 of 2026-10-29). Every window before the turn point that was tried
  (20 s, 45 s, 1.5 NM, 2.1 NM) was refuted by a later pass.
- Gate: lead when the cross track to the leg is at most the smaller of about 83 s of ground speed and about 4.9 NM.
  Brackets: 60 kt lead 1.30 / abeam 1.48; 119 kt lead 2.7 / abeam 2.8; 239 kt lead 4.8 / abeam 5.0. The cap may be
  5.0 NM with a strict comparison (the en-route CDI full scale); the data cannot tell. A curved form without natural
  constants fits as well; a 300 kt pass would separate it (not flown).
- The abeam plan becomes the turn plan when the cross track to the inbound leg is below 1.0 NM, at a check that runs
  about every 12 wall s (11 trainer s; the trainer runs about 6 % slow): identical passes started 4.0, 10.5 and 10.0 s
  after the first reading below 1.0; delays seen 2 to 12 s; at 60, 119 and 239 kt; before the turn point (then the
  turn starts at the lead) and after it (then at once). High for 1.0 NM and for "periodic, not a filter", medium for
  the period.
- Not settled, the **drift case**: the leg becomes active on course and the aircraft then leaves it in flight, with no
  edit and no re-initialization. The trainer's take-home flying re-intercepts from any offset, so it cannot be flown.
  In every pass the largest cross track since the decision was the one at the decision, so "kept until the next
  re-computation" and "follows the cross track" fit the same data.
- #440, deletes of a flown waypoint that leave the FROM and TO in place (2026-10-28): the active waypoint's plan is kept
  (3c) and so is its started lead turn (3a'', one pass, medium); a turn circle of the waypoint just sequenced is
  dropped, with the alert stopping at once and line 2 the leg's cross track (3b, 3b'; four passes, high); the alert of
  a zero-size abeam turn's run-out kept flashing (3d, one pass, medium; it ended later than without the edit, which one
  pass cannot explain). Deleting the FROM re-picks the closest leg (3e), as the emulation does today. An insert into a
  full FPL 0 was not flown.

## 3. Behavior

### 3.1 The plan follows the cross track (#438)

Chosen by the maintainer as approach B (section 4).

- **Gate.** `turnPlanGate(gs) = min(83 s of gs, 4.9 NM)`, and never less than 1.0 NM (the design's call, section 3.2:
  it keeps the gate above the recapture threshold, so that below about 43 kt, on the ground included, the plan cannot
  flip every check).
- **In every calculation on the leg branch** (turn anticipation on, a next leg; where `decideTurnPlan` is called today),
  while the waypoint's own turn has not started (`!ownTurnStarted`), with `xtk = |legXtk|`, the cross track to the
  active leg's own path:
  - plan `null` (a new leg, or after a reset): `AT_LEAD` if `xtk <= gate`, else `AT_ABEAM`;
  - plan `AT_LEAD` and `xtk > gate`: `AT_ABEAM`;
  - plan `AT_ABEAM`: becomes `AT_LEAD` only by section 3.2.
- **No decision point.** `TURN_DECISION_TIME` and the "past the decision point" condition go. A plan decided far out is
  the normal case now.
- **Re-initializations need no hooks, in one direction.** An activation clears the plan (`clearTurnState`, as today);
  a jump of the aircraft (slew, teleport, a flight loaded in the air), a GPS fix after a search and an edit of the active
  waypoint's coordinates all show up as a new cross track, and a cross track above the gate gives the abeam plan in
  the same calculation. That is what the trainer did at a SET 1 jump and at an edit of the coordinates; the trainer
  does not lose its fix, so the GPS fix after a search was not flown and follows by analogy (the design's call). The
  other direction is not covered: a jump that
  brings an aircraft on the abeam plan within the gate but more than 1.0 NM off keeps the abeam plan until the 1.0 NM
  check, where the trainer's "decided at the re-computation" would give the lead plan. No trainer pass shows this
  direction (every first jump of a two-jump start was on course). Accepted as the design's call, with a code comment
  and a test labeled so: it is rare in the sim, and covering it needs approach A's hooks.
- **The gate uses the ground speed of the calculation**, not the speed at the decision: a lead plan can become abeam by
  slowing down alone (2.5 NM off: lead at 119 kt, gate 2.74; abeam at 100 kt, gate 2.31). The trainer flew every pass at
  a constant speed, so this is the design's call: it is what a periodic check of the live state gives, and needs no
  stored speed.
- **The drift case** is the design's call: the plan follows the cross track, so a lead plan becomes abeam once the
  aircraft is beyond the gate. The trainer could not show it (section 2). The code comment says so and names the
  alternative (the plan kept until the next activation or re-initialization).
- **Off the leg** (`|legXtk| > OFF_LEG_XTK`, 4.0 NM) nothing changes: `tickOffLeg` runs, with no turn, and the plan is
  updated by the same rule. At 239 kt a lead plan survives 4.0 to 4.9 NM and the turn comes at the lead once the
  aircraft is back on the leg (Y2, g48 of the trainer). The #157 comment in `decideTurnPlan` that "off the leg the plan
  is always abeam" no longer holds and goes.
- **#408 unchanged.** `onFollowingLegChanged` still nulls a lead plan and keeps an abeam plan; the next calculation
  decides the nulled plan by the gate, at once.
- **The lead plan's alert** (`isAlertWithTurn`) no longer starts with the plan, which can now be minutes before the
  turn. It starts when the turn point is at most `WPT_ALERT_WITH_TURN_ANTI` (20 s) away at the along-track closure
  rate (as `isWithinTimeOfAbeam` measures it for the abeam line), or once the aircraft is inside the turn point, and
  holds while TO as today. Trainer: onset 20 to 23 s of along-track closure before the turn point, on every lead pass
  of the series. The #408 pause (a3, a4: the alert stops when an edit moves the turn point more than 20 s away) falls
  out of this.
- **The abeam plan's alert** (15 s before the abeam line) is unchanged.
- **Sequencing at the bisector on the inside of a turn.** The abeam plan arms the bisector test (as today), and under
  this design the abeam plan can exist from the leg's first calculation. On the inside of a turn, between the gate and
  4.0 NM, the waypoint is then sequenced when the aircraft crosses the bisector, however far out (at 3 NM inside,
  about 11 NM before a 150° turn), with no turn. The trainer does exactly that (2026-10-29, inside check, passes I3'a
  and I3'c: sequenced at the crossing 12.6 NM out, no turn, no alert). It does the same on the turn plan (I3'b), which
  the emulation does not: that is #443, see section 3.4.

### 3.2 The abeam plan switches to the normal turn (#439)

- On the abeam plan, while the waypoint's own turn has not started, a check every `TURN_PLAN_CHECK_PERIOD` (12 s, the
  design's call within the measured 11 to 12 s) sets the plan to `AT_LEAD` when `|legXtk| < TURN_PLAN_RECAPTURE_XTK`
  (1.0 NM). The check is free-running: its phase does not restart at a new leg (the trainer's delays spread over the
  whole period from passes started alike). Its counter is reset at a power-on.
- Nothing else is needed: the existing code then starts the lead turn at the turn point, or at once when the aircraft
  is already inside it (#404's start-at-once path), and the turn is a normal circle with line 2 the distance to the arc,
  the alert on, sequencing at the bisector and the alert ending L past the waypoint, as the trainer showed.
- Once the zero-size abeam turn has started (`ownTurnStarted`) the check no longer applies; the trainer's T7 read 0.99
  just before its abeam line and flew the zero-size turn.

### 3.3 An edit in front of the active waypoint (#440)

- When the active leg instance is still in FPL 0 at another index **and the leg before it is the same instance the FROM
  was made from**, `assertToMatchesFplIdx` follows the active leg, as its Direct To branch does (`legs.indexOf`): the
  index changes, the FROM, the plan (`turnPlan`) and the waypoint's own started turn are kept.
- **A turn left over from the previous waypoint is dropped**, except the run-out of a zero-size abeam turn
  (`TurnStackEntry.isRunOut`, #406), which is kept. While `ownTurnStarted` the stack holds only the own turn, which
  stays. Line 2 and the DTK then follow the active leg; the alert follows from the stack and the plan (normally off
  until the next waypoint's alert).
- **A leg inserted between the FROM and the TO** (the leg before the TO is new, the FROM's leg is still in the plan
  right before it): the inserted waypoint becomes the active waypoint and the FROM is kept, however far the new
  waypoint is (3f: the new TO was 138 NM away). Today `activateFpl0` re-picks the closest leg, which matches 3f only
  when that leg happens to be the nearest. The active leg changes, so the plan is cleared as at any activation; a turn
  left over from the previous waypoint was made onto the old leg and is dropped, the run-out included (the reason of
  #442; not flown in the trainer during a turn).
- **The FROM deleted:** `activateFpl0` as today (3e).
- **Anything else** (the active waypoint deleted, or more than one leg inserted between the FROM and the TO in one
  edit) falls to `activateFpl0` too, the closest leg, by the design's call. Through the pages a waypoint is inserted one
  at a time, and each insert is seen on its own, so only a batch edit (a procedure load, the EFB loader) can put two
  or more legs between them at once. There the closest leg is what the unit did before this design, and usually the
  leg to the first inserted fix anyway.
- An insert into a full FPL 0 deletes front legs and then inserts (`insertLegIntoFpl`, #148); both edits go through
  the same rule. `roomSteps` never deletes the FROM, so the delete always takes the "follow the index" branch. Not
  flown in the trainer; the code comment says the rule is applied by analogy.
- The `activeWaypointChanged` event is published with the new index, so the pages that show the active index follow.
- The #408 check of the following leg runs after the index followed, as in the Direct To branch.

### 3.4 The bisector on the turn plan (#443)

Part of this work (the maintainer, 2026-10-29), its own `fixes #443` commit. The trainer sequenced an aircraft on the
turn plan when it crossed the inside bisector 7 NM before the turn point, with no turn and no alert (I3'b). The emulation
arms the bisector test only once the own turn has started or on the abeam plan (`NavCalculator.tick`), so it keeps the
waypoint and turns at the lead. The fix arms the test on the leg branch whatever the plan, as off the leg. On course
and on the outside of a turn the turn starts before the bisector is reached, so nothing else changes; the existing
on-course and outside tests hold that. The comment on the test cites the trainer check and drops the "not observed in
the trainer" note of the 2026-10-20 design.

## 4. Approaches

- **A. Latched at the leg's computation, re-decided on events.** The plan is decided at the first calculation of a
  leg and kept; a re-initialization (a GPS fix after a search, a position jump of more than about 1 NM between ticks,
  an edit of the active waypoint) clears it. In the drift case a lead plan stays. Its cost: three new hooks, and the
  position-jump hook needs a cached position and an invented threshold, for an event the real unit does not have. This
  was the closing analysis's recommendation.
- **B. The plan follows the cross track (chosen by the maintainer, 2026-10-29).** Lead becomes abeam beyond the gate,
  abeam becomes lead below 1.0 NM at the periodic check. No hooks: every re-initialization shows up as a cross track.
  In the drift case a lead plan becomes abeam. It is the mirror of #439's check, which the unit evidently has.

Both fit every decided pass of the series; they differ only in the drift case, which nobody knows.

For #439 the alternative of checking every calculation (1 Hz) was set aside: the spread of the trainer's delays is a
real quirk, and the period is cheap to emulate.

For #440 the issue suggested keeping the whole turn stack; the trainer dropped the previous waypoint's turn circle in
every pass, so the leftover goes.

## 5. Constraints

- 1 Hz calculation tick, es2017, no allocation in the hot path beyond what `tick` does today (CLAUDE.md, tick cost).
- State: the plan stays in `ActiveWaypoint`; the check's counter lives where it is reset at a power-on (VolatileMemory,
  whose guard test holds that, or the calculator if it is reset there explicitly; the builder's call).
- Code comments cite the trainer record by date ("checked in the KLN 89 trainer, 2026-10-28") and the Pilot's Guide by
  page (4-8 for the alert); no manual text.
- Constants in `NavCalculator.ts` replace `TURN_DECISION_TIME` and `TURN_PLAN_MAX_XTK`: `TURN_PLAN_MAX_XTK_TIME` (83 s),
  `TURN_PLAN_MAX_XTK` (4.9 NM, the cap), `TURN_PLAN_MIN_XTK` (1.0 NM, the floor), `TURN_PLAN_RECAPTURE_XTK` (1.0 NM),
  `TURN_PLAN_CHECK_PERIOD` (12 s). Names are the builder's to improve; each comment gives its brackets.
- The 2026-10-20 design is a dated record: its sections 3.3 and 3.5 get a one-line note that this design supersedes
  the decision and the lead plan's alert, not a rewrite.

## 6. Tests

Each fix comes with its tests at the cheapest stage that observes it (flight tests mostly:
`test/flight/flights/offCourseSequencing.test.ts`, `nextLegEdit.test.ts`; unit tests in
`test/unit/data/flightplan/ActiveWaypoint.test.ts`; `test/render/data/navdata/NavCalculator.test.ts`).

- **Existing tests built on the old rule** (the 2.8 NM gate, the 20 s decision point, the latch) must be re-derived from
  the trainer record, not adjusted until green. Where a test pinned a trainer pass of 2026-10-20, check that pass
  against the new rule in the 2026-10-29 analysis's table; a few old readings were revised there.
- **#438:** the gate at two speeds on both sides (lead just inside, abeam just outside); a decision at the first
  calculation far before the turn point; a lead plan that becomes abeam when the aircraft leaves the leg beyond the
  gate (the drift case, labeled as the design's call); a jump onto the same leg beyond the gate; the lead alert starting
  about 20 s of closure before the turn point, not at the decision; at 239 kt a lead plan kept between 4.0 and 4.9 NM.
- **#439:** an abeam pass that converges below 1.0 NM: the normal turn starts within one check period after the first
  calculation below 1.0 NM, with line 2 the arc distance and the alert on; before the turn point it starts at the turn
  point; an abeam pass that stays above 1.0 NM still flies the zero-size turn; no switch once the zero-size turn has
  started.
- **#440:** the `it.fails` pin in `nextLegEdit.test.ts` ("keeps the turn in progress when the first waypoint of the plan
  is deleted") expects the previous waypoint's turn kept, which the trainer contradicts. It is rewritten to the
  trainer's behavior (the index follows, the leftover turn circle is dropped, the DTK is the active leg's) and loses its
  `.fails`; its title says what it now holds. Plus: the abeam plan and the own started turn kept through a delete in
  front; the run-out of a zero-size abeam turn kept; the FROM deleted re-picks the closest leg; an insert between the
  FROM and the TO makes the new waypoint active with the FROM kept, also when another leg is closer; an insert into a
  full FPL 0 during a turn.
- **#443:** an aircraft on the turn plan, inside a 150° turn, crossing the bisector well before the turn point is
  sequenced there, with no turn; the abeam-plan inside case of section 3.1 (it arms already, but now from the leg's
  first calculation) gets its own test labeled with the trainer check.

## 7. Left to the builder

- Whether the lead plan's alert is a condition of each calculation (the #408 pause suggests it is) and whether its
  20 s are timed to the turn point with or without the roll-in; whether the check counter runs while the GPS is invalid
  or in OBS mode; the order of the #438 and #439 commits.

- Where the plan update lives (extend `decideTurnPlan` or split it), and the shape of the check counter.
- How the lead alert's closure test is shared with `isWithinTimeOfAbeam`.
- How `ActiveWaypoint` remembers the leg instance the FROM was made from (a reference set in `setFplData`).
- Whether to file the drift case and the 300 kt gate form as open questions: not bugs, so not issues; the design's
  call is recorded here and in the code comments.
