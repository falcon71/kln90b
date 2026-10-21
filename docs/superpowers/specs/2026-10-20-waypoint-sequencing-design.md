# Waypoint sequencing and turn anticipation: design

Date: 2026-10-20. Issues: #375, #157 and #404 (the lead limits, a follow-up of the closed #76). Branch: `investigate-375-157`.

This document says how the unit decides when to start an anticipated turn and when to change the active waypoint, so
that it matches the KLN 89 trainer, and why. It replaces the sequencing part of `NavCalculator.tick`.

## 1. Intent

Two reported bugs and a trainer study:

- **#375** (reported from the sim, reproduced): a pilot flying VFR toward EDNN passed EDSZ 0.2 NM to its south. The unit
  sequenced EDSZ to EDTW and two seconds later skipped EDTW, 13 NM away, for EDNN. Cause: after EDSZ is sequenced, the
  turn at EDSZ is still on the turn stack, which keeps `waypointAlert` on for EDTW; the abeam test ("alert on and the
  distance to the active waypoint no longer falling") then fires for EDTW because the aircraft flies away from it.
- **#157**: with turn anticipation on, a waypoint passed farther abeam than about the lead plus 20 s of ground speed is
  never sequenced, because neither the turn start nor the abeam test is ever reached.
- **The trainer study** (section 2) found that the unit's rules differ from the sim's in more places than these two:
  the lead is capped, a short leg limits the lead instead of being skipped, and the active waypoint changes at the
  bisector of the turn. The maintainer chose to bring all of them in line in this round.

The goal of the project is faithful emulation of the real unit, quirks included (CLAUDE.md). **Success:** every rule of
section 3 holds in tests whose expectations come from the trainer record or from geometry, #375 and #157 are fixed,
and nothing that sequences correctly today stops doing so. **Anti-goal:** the "improved" sim behavior that the real
unit does not have, except for the roll-in distance that section 3.1 names and explains.

## 2. Evidence

- **KLN 89 trainer, 2026-10-20**, three agent checks: the 2026-10-20 block of
  [kln89-trainer-record.md](../../kln89-trainer-record.md), with the raw data (screen text at 4 Hz, one CSV per run)
  and the reports in [kln89-trainer-data/2026-10-20](../../kln89-trainer-data/2026-10-20/README.md). Turn start and
  lead cap: high confidence (twelve on-course turns of 31° to 171° at 119 and 239 kt). Bisector sequencing: high on
  course, medium-high off course. The 4.0 NM rule: high (two direct transitions at both speeds). Half-leg limit:
  medium. The off-course turn start (section 3.3, from the third check, 12 runs): the along-track start and the latched
  decision high, the 2.8 NM gate and the moment of the decision medium.
- **#375 video** (the reporter's YouTube recording at 45:20 to 45:46): the KLN screen read frame by frame, giving the
  track that `test/flight/flights/skippedLeg.test.ts` flies.
- **Pilot's Guide** 4-8 and 4-9 (turn anticipation, waypoint alert, sequencing) and 5-33 (leg sequencing). The guide
  gives no numbers for the lead limits or the off-course case.
- **Maintainer decisions, 2026-10-20, in chat:**
  - Cover all trainer findings in this round, not only #375 and #157.
  - The roll-in distance stays (section 3.1): pilots notice an overshoot after every turn, nobody notices a turn
    starting a second or two early. What the pilot sees and what the SimVars carry stay one set of values; faking two
    sets was rejected as not worth the complexity.
  - The abeam turn start is reproduced faithfully, dogleg included (section 3.3), with a comment saying why and what it
    means for an autopilot. An autopilot user will be on track; this happens when hand flying.
  - The earlier ruling that the lead is uncapped (#76) came from a less rigorous trainer observation and is wrong.

## 3. Behavior

All of this applies with turn anticipation on (SET 6 on the 90B, SET 4 on the 89), not in OBS mode, for a waypoint
that has a turn to anticipate: a following leg, not a fly-over, not followed by a copy of itself. Everything else
keeps today's rules (section 3.6).

### 3.1 The lead distance

L = min(r · tan(θ/2), GS · 60 s, inbound leg / 2), where θ is the course change at the waypoint (from the DTK at the
end of the inbound leg to the DTK at the start of the next, as today, so DME arcs keep their end DTK), r the radius of
a standard-rate turn with the bank limited to 25° (`bankeAngleForStandardTurn`, unchanged), and the inbound leg the
length of the active leg (for a Direct To, from its start point).

The turn starts at an **along-track** distance to the waypoint (measured along the inbound course; on course it equals
the straight distance) of L **plus the roll-in distance** (`distanceToAchieveBankAngleChange`) the sim adds today,
when section 3.3 decides on that plan. The trainer adds none. The code comment at that addition says that this is a deliberate departure: the unit
calculates at 1 Hz and can start a turn up to a second late, and the sim's autopilot and aircraft need time to roll
in; users reported overshoots before it was added, and the default autopilot follows the GPS SimVars, so the displayed
and the commanded values cannot be split. The cap applies to L; the roll-in comes on top of the capped L.

When L is capped (by the 60 s or by half the leg), the turn circle is the one tangent to both legs at L from the
waypoint: radius L / tan(θ/2), tighter than the aircraft can fly at 25°. Today's construction (radius r from a start
point L before the waypoint) would no longer meet the next leg. The trainer's capped turns showed its aircraft lagging
such a path (XTK grew to 0.43 NM outside it, and the bisector came a few seconds late). Uncapped, the circle is today's.
(The maintainer's lead's call, after the review.)

The #76 rule (skip the waypoint at once when the lead is longer than the distance to it) goes. A leg activated with the
aircraft already past the decision point of section 3.3 (after a Direct To, a power-up, a FPL change) is decided at
once, by the same rule; on the turn plan with the aircraft already inside L + roll-in, the turn starts at once and is
flown. (The trainer evidence for this case is a single re-initialization, run A; this is the maintainer's lead's call.)

### 3.2 On the leg or off the leg

Every calculation tick the unit compares |XTK| to the **active leg** (the leg's own path, not a turn circle) against a
fixed **4.0 NM**. Not latched: the regime can change from one tick to the next (in the trainer it changed 20 s before
the abeam line). The threshold is the same at every speed, turn angle and mode; the trainer cannot show whether it
depends on the CDI scale, so it stays fixed in approach too (the maintainer's lead's call).

What a flip does to a turn already in progress (the maintainer's lead's calls; the trainer did not show it):

- **On to off:** off the leg the active waypoint has no anticipated turn, so a turn it had started is dropped and XTK
  and DTK fall back to the leg; section 3.4 then decides. A turn left over from the previous waypoint (still on the
  stack after its sequencing) runs to its end as today.
- **Off to on:** the conditions of section 3.3 are states, not crossings that must happen on the leg: an aircraft
  already past the decision point is decided at once (in the trainer that always gave the abeam plan, because the
  cross track is about 4.0 NM at the flip: R2, R6), and one already past the abeam line with no turn started gets the
  abeam turn at once.
- A decision of section 3.3, once made, is kept while the aircraft is off the leg and applies again when it comes
  back; it is cleared when the active waypoint changes.

### 3.3 On the leg: |XTK| ≤ 4.0 NM

- **The decision.** The unit decides once where the turn will start, and keeps that decision until the active
  waypoint changes (latched: in T7, T11 and T13 the cross track fell to 0.7 to 0.9 NM later and the unit still waited
  for the abeam line). It decides at the first tick on the leg at which the along-track distance to the waypoint is
  at most the **decision point**: L + roll-in + 20 s of ground speed, the point where the alert of a normal turn is due.
  - **|XTK| ≤ 2.8 NM then: the turn plan.** The turn starts at an along-track distance of L + roll-in (section 3.1),
    whatever the cross track is by then (the trainer started it with 0.86 to 2.0 NM, on both sides of the turn, at
    both speeds).
  - **|XTK| > 2.8 NM then, or the aircraft off the leg when it passed the decision point: the abeam plan.** The turn
    starts **when the aircraft crosses the abeam line** (TO turns FROM).
  - The gate lies between 2.69 and 2.83 NM (turned at the turn point) and 2.80 and 2.93 NM (abeam) at both speeds;
    2.8 NM is the medium-confidence value, and the decision moment is known to a few seconds. The code comment says so.
- **Turn start** (DTK and XTK switch to the turn, as today) follows the plan.
- **The abeam turn** is degenerate: a turn of zero radius at the waypoint. XTK is the distance to the waypoint, with the
  sign of the side the turn goes to; DTK is the next leg's. This is what the trainer showed (line 2 equal to the distance
  to the waypoint for 35 to 115 s). A code comment says that this reproduces the real unit, that it only happens when a
  waypoint is passed up to 4 NM off course (in practice when hand flying), and that a default autopilot coupled at that
  moment steers back toward the waypoint until the bisector.
- **Sequencing** (the active waypoint changes): when the aircraft **crosses the bisector** of the turn, the line
  through the waypoint that halves the angle between the two legs, from either side. On course this is the midpoint of
  the turn, as today; for big turns it is well before the waypoint (3.2 NM for 171° at 239 kt in the trainer). The
  test is a state, not a change between two ticks: the aircraft's signed distance to that line is at least 0. It is
  armed once the waypoint's own turn has started, or on the abeam plan, so an aircraft already past the line when the
  test arms sequences at once instead of never (written in the plan, 2026-10-21). If the aircraft crosses the bisector
  before a turn has started (possible on the inside of a turn on the abeam plan, not observed in
  the trainer; its one inside pass within 4 NM, T2, took the turn plan), it sequences there too, the same as off the
  leg (the maintainer's lead's call).
- This replaces the abeam test "alert on and distance no longer falling", which is what #375 trips over. The new test
  does not read the alert, so a turn still on the stack from the previous waypoint cannot sequence the next one.

### 3.4 Off the leg: |XTK| > 4.0 NM

No turn anticipation and no turn path. The unit **sequences as soon as the next leg's segment is at least as close as
the active leg's segment**, where the distance to a segment is the perpendicular distance while its foot lies between
the segment's ends and otherwise the distance to the nearer end. On the outside of the turn that is the abeam line; on
the inside it is the bisector, however far away (11 NM in the trainer). `ActiveWaypoint.findClosestLegIdx` already
measures this distance, including DME arcs; reuse it rather than a second implementation.

### 3.5 The waypoint alert

- On the turn plan: from the decision point, about 20 s before the turn start, as today (4-8; the trainer's 21 to 24 s
  lies within its flash timing).
- On the abeam plan: about 15 s before the abeam line, from the along-track closure rate; none at the decision point.
- Off the leg: about 36 s before the abeam line (the alert without turn anticipation), and none before a sequencing at
  the inside bisector (the trainer gave none).
- The alert stays on through the turn as today and ends with it (4-8, #156). The trainer kept flashing until the track
  was within about 5° of the new DTK; matching that end exactly is not part of this design.

### 3.6 Unchanged

Turn anticipation off, fly-over waypoints, a waypoint followed by a copy of itself (#27), no sequencing past the MAP,
OBS mode, the last waypoint, a leg without length (#120), the uncapped turn circle and its end, and the roll steering
law. For the degenerate abeam turn roll steering keeps its existing fallback: farther from the turn circle than its
radius, it steers on the next leg (`steerOnPathForDtk`); a zero-radius circle therefore steers on the next leg at once
(the maintainer's lead's call: roll steering is the separate output the roll steering design already lets differ).

## 4. Constraints

- **Public contract** (CLAUDE.md): no H event, LVar, panel.xml key or SimVar changes name or meaning. The timing of
  `GPS WP NEXT ID` and the other sequencing outputs moves with the rules, which is the point.
- **State:** services keep no mutable state of their own; new state (for example the latched plan of section 3.3, or
  the signed bisector distance of the last tick) goes on `NavPageState` or `ActiveWaypoint` and is reset in
  `VolatileMemory.reset` (the maintainer's rule, 2026-10-14). The `lastDistanceToTurn`/`lastDistanceToActive` fields
  of `NavCalculator` exist today; whether they survive is the builder's.
- The calculations stay at 1 Hz; `target: es2017`.
- **Commits:** the maintainer waived the one-commit-per-issue rule for this work (2026-10-20, in chat), because the
  issues are intertwined: the fixes may land in a single commit, or in several commits that each reference any of the
  issues (`references #NN`). Each issue still gets its `fixes #NN` in the commit that completes its fix, so that
  GitHub closes it. Every commit carries its tests and doc changes and leaves the suite green. A sensible split, if
  the builder wants one, follows the dependencies: the lead limits (#404, section 3.1), then the bisector sequencing (#375),
  then the off-course rules and alerts (#157), each building on the one before.

  The pinned test `skippedLeg.test.ts` (#375) and the #157 pin in `test/render/data/navdata/NavCalculator.test.ts`
  lose their `.fails` in the commit that makes them pass. With a split, note that the bisector test applied to every
  case already sequences the #157 pin (its parallel pass crosses the outside bisector about 0.5 NM past abeam).
- **Comments:** manual and trainer references at each rule ("checked in the KLN 89 trainer, 2026-10-20"). The one
  deliberate departure (the roll-in) and the faithful dogleg get their reasoning in the code.

## 5. Tests

- Each rule gets a test at the cheapest stage that observes it (test/README.md). Most are flight tests; the 4.0 NM
  threshold and the lead formula may be render tests with a placed aircraft (`moveAircraft`).
- Expectations come from geometry and the trainer record, never from the code under test. Useful anchors: the lead
  table (0.50, 1.07, 1.85, 3.09 NM for 31°, 62°, 92°, 120° at 239 kt; 4.0 NM cap at 239 kt and 2.0 NM at 119 kt);
  half a 2.0 NM leg; the bisector bearing at the sequencing; run R2/R6 for the regime change; R1/R4 (outside, abeam)
  and R7/R8 (inside, bisector) for off the leg; T3/T8/T12 (turn plan, the turn at along-track L with 1.1 to 1.9 NM
  cross track) against T7/T11/T13 (abeam plan, kept although the cross track fell below 1 NM) for the decision. A test
  of the gate keeps clear of 2.8 NM (for example 2.0 and 3.5), because the gate is known only to about 0.1 NM. The sim's roll-in adds to the lead, so a lead expectation either adds
  `distanceToAchieveBankAngleChange` derived independently (5°/s at the standard-rate bank) or brackets it.
- Existing tests that encode today's rules will change, and each change says why: `largeTurn.test.ts` (#76, the skip
  becomes a flown turn), the capped big turns of `rollSteering.test.ts` (150° at 240 kt, S8f), `waypointAlertTurn.test.ts`,
  and any turn whose sequencing distance moves. A changed expectation cites the trainer record.
- Each commit runs the whole suite (`npm test`), `npx tsc --noEmit` and `npm run build`.

## 6. Open

Not settled by the trainer; implement the stated call and note it in the code:

- a truly parallel pass (every trainer pass converged at 40° to 70°);
- the exact gate (2.8 NM, between 2.69 and 2.93) and the exact moment of the decision (section 3.3);
- an inside pass on the abeam plan (section 3.3 takes the bisector);
- whether 4.0 NM depends on the CDI scale (fixed, section 3.2);
- the end of the alert after a turn (unchanged, section 3.5);
- a leg activated past the decision point (decided at once, section 3.1).

## 7. Left to the builder

How the turn stack represents the degenerate abeam turn, how the bisector line is computed (it must follow the DTK at
the end of a DME arc, like θ), how the alert's time to the abeam line is estimated, the structure of `NavCalculator`
after the change, how the along-track distance is measured on a DME arc, and the test layout within the order of
section 4.
