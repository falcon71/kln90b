# The turn-plan decision (#438) and the abeam plan's late turn (#439): fourth analysis

After the 2026-10-29 session (T7 repeat, the 239-kt gate passes, T8 replica, S1 clean, the drift test D1/D2). All
readings rebuilt from the CSVs with `scripts/runs4.py` (the pass list of rounds 2-3 plus the new passes) and inline
scripts; nothing flown, nothing in the repository changed, nothing posted. Notation as before (al-L = NM before the
turn point, XTK = line 2, "landing" = the first calculation after a SET 1 jump, "leg change" = the jump made another
leg active, lead = alert about 20 s of closure before L and the DTK switch at al = L, abeam = neither).

## Summary

| | result | fits | confidence |
|---|---|---|---|
| mechanism | **H4 stands: the plan is decided at the first calculation after the leg is (re)computed - a sequencing, a leg change, a position re-initialization, an edit of the active TO (D1, D2) or of the following leg (#408) - and latched.** No decision before the turn point in flight is needed by any pass. | 54/55 (T11 the turn-in-progress artifact) | high for "at (re)computation"; the pure drift case (leg activated on course, aircraft wanders off, no edit) is untested |
| gate | **G = min(83 s of ground speed, 4.9 NM)**: 83 s in [82, 85) from 119 kt (2.7 lead, 2.8 abeam), consistent with 60 kt (1.30 lead, 1.48 abeam: 78-89 s); the cap in [4.8, 5.0) from 239 kt (4.8 lead twice, 5.0 abeam, 5.2 abeam, 6.0 abeam twice). The cap is a constant, not a multiple of the lead, the radius or the speed. | all three brackets, T5 included | the time constant high (three speeds), the cap medium-high (one speed, two passes at 0.2 NM); its being a constant: medium (the 300-kt pass of section 2 would show a speed-dependent cap) |
| Rule 2 | 1.0 NM recapture, periodic (about 12 wall s), before or after the turn point, now seen at 239 kt (G50 9.0 s, D2 12.0 s; T7r reached 0.99 1.25 s before the abeam line and took the zero turn) | 22/22 | high |

## 1. The new passes, verified (`runs4.py`)

| pass | GS | start | landing (al-L, XTK) | x@3.5 | x@3.0 (45 s) | x@2.5 | x@2.1 | x@1.5 | x@1.0 | x@0 | alert | switch | plan |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T7r | 239 | 8V, leg change from 8T-8S (16.8 NM out) | 5.58, 6.0 | 5.25 | 4.80 | 4.40 | 4.08 | 3.44 | 3.02 | 2.05 | zero-turn alert at al-L -1.06 (15 s before the abeam line) | abeam line, line 2 0.97 = d; 0.99 reached 1.25 s before it | abeam |
| G50 | 239 | 8T, leg change from 8V-8U | 3.82, 5.0 | 5.00 | about 4.95 | 4.70 | 4.50 | 4.07 | 3.69 | 2.76 | with the flip | 0.99 at al-L -2.63, alert 7.5 s later, switch 9.0 s later, line 2 0.82 -> 2.70 (arc) | abeam |
| G48 | 239 | 8T, leg change from 8V-8U | 3.73, 4.8 | 4.80 | 4.70 | 4.50 | 4.12 | 3.40 | 2.75 | 1.77 | al-L 0.91, 19.75 s before | al = L (+0.04), XTK 1.70, line 2 the arc | lead |
| T8r | 239 | 8U, leg change from 8T-8S | 4.70, 4.5 | 4.20 | 3.80 | 3.23 | 2.84 | 2.14 | 1.76 | - | al-L 1.11, 20.25 s before | al = L, XTK 1.20 | lead |
| S1c1 | 119 | 8T, leg change from 8V-8U | 3.63, 2.9 | 2.90 | 2.59 (x@1.49 0.73) | 1.77 | 1.27 | 0.73 | 0.47 | 0.21 | al-L 0.69, 22 s before | al = L | lead-looking; 0.99 at al-L 1.16: masked |
| S1c2 | 119 | 8T, leg change | 2.06, 2.9 | - | - | - | 2.90 | 2.70 | 1.90 | 0.84 | with the switch | al = L (-0.05), 9.8 s after 0.99 at al-L 0.19, XTK 0.82, line 2 the arc | abeam, flip just before L |
| D1 | 239 | 8U sequenced on course (XTK 0.04), 8T moved 1.6 NM before the old turn point; new geometry 324 -> 109, L 3.98 | first frame after the edit: al-L 2.12, XTK 7.3 | - | - | - | 7.30 | 7.05 | - | - | zero-turn alert at al-L -3.28 | abeam line (brg 55), line 2 2.1 = d | abeam |
| D2 | 239 | as D1, 8T moved at al-L about 6 | first frame al-L 5.66, XTK 6.2 | 5.00 | 4.55 | 4.15 | 3.80 | 3.17 | 2.66 | 1.87 | with the flip | 0.99 at al-L -1.57, switch 12.0 s later, line 2 0.76 -> 1.80 (arc) | abeam |

All of the report's readings hold. T7 is reproduced exactly (T7r 4.80 at 45 s against T7 4.52; abeam both). Y2
(same-leg landing with 4.8, lead) and G48 (leg change with 4.8, lead) agree, so "same leg or leg change" makes no
difference, as H4 says.

## 2. The gate (task 1)

Brackets from the landings: G(60) in [1.30, 1.48) (C2'' lead, C2' abeam); G(119) in [2.7, 2.8) (T14 lead, r5 abeam);
G(239) in [4.8, 5.0) (G48 and Y2 lead, G50 abeam; T5 5.2, T7/T7r 6.0 and R6 6.2 abeam). In seconds of ground speed:
78-89 / 82-85 / 72-75. The gate is proportional to the speed up to 119 kt and relatively lower at 239 kt.

| form | 60 / 119 / 239 kt | fit | plausibility for a 1989 implementation |
|---|---|---|---|
| **min(k s of GS, C)**, k in [82, 85), C in [4.8, 5.0) | 1.38 / 2.74 / 4.9 (k 83, C 4.9) | all brackets and every pass (T5 5.2 abeam now explained by the cap) | high: a time of ground speed with a fixed outer limit; 5 NM is the en-route CDI full-scale deflection, so "lead only while the needle is on scale" is a natural reading if C is 5.0 with a strict comparison (G50's 5.0 shown as 4.95-5.05) |
| k s of GS, uncapped (round 3) | 1.38 / 2.74 / 5.5 | misses G50, T5 | - |
| a GS + b GS^2 (a 0.0257, b -2.17e-5) | 1.46 / 2.75 / 4.90 | all brackets | low: a curve with no natural constants; its maximum sits at 590 kt |
| r + c (standard-rate radius, bank-limited) | needs c 2.12 at 119 and 3.1 at 239 | no | - |
| k r | 0.63 r -> 2.75 gives 7.8 at 239 | no (unless capped: then it is the first form with a different low-speed law, 1.39 at 60 either way) | - |
| multiples of the 60-s lead cap (1.0 / 1.98 / 3.98) | ratios 1.30-1.48 / 1.36-1.41 / 1.21-1.26 | no common factor | - |
| 60 s of GS + c | c in [0.30, 0.48) at 60, [0.72, 0.82) at 119 | no | - |
| a cap that scales with the lead cap (e.g. 1.25 x 60 s of GS = 75 s) | 1.25 / 2.48 / 4.98 | no: 2.48 at 119 is below T14 (2.7) and r3 (2.6) | - |
| a cap from the turn angle or the waypoint | 8U: lead at 4.5 (T8, T8r), abeam at 5.2 (T5); 8T: lead at 4.8, abeam at 5.0; 8V: abeam at 6.0 | the same cap fits all three waypoints (93, 120, 150 deg) | no angle dependence visible |

**Ranking:** 1. min(83 s of GS, 4.9 NM); 2. the concave quadratic (only because it fits; nothing recommends it).
A cap that is a constant and one that grows slowly with speed (the quadratic, or a multiple of the 25-deg-bank radius
above 170 kt, 2.75 r = 4.9 at 239 kt) differ only above 239 kt. **The separating pass: 300 kt at 8T (leg change,
single jump 8 NM before 8T, HDG 304) with 5.4 left.** Constant cap: abeam (5.4 > 4.9, margin 0.4-0.6); quadratic:
lead (5.75); 2.75 r: lead (7.7). A second pass with 4.5 (lead under all) checks that 300 kt is flown normally. At
300 kt L at 8T is the 60-s cap, 5.0 NM, and the 45-s point is 3.75 NM before it; the take-home's convergence at 300
kt is unknown, which does not matter for a decision at the landing. Whether the trainer accepts GS 300 is unknown
(240 was accepted). Between 119 and 239 kt the forms differ by at most 0.2 NM (180 kt: 4.15 against 3.9), too little
for the take-home's 0.1-NM read-back.

## 3. The drift test (task 2)

D1 and D2 activated 8U-8T by a normal sequencing on course (XTK 0.04 / 0.05): under H4 that decided lead. Then the
active TO was moved; after the edit the aircraft was 7.3 (D1) / 6.2 (D2) NM from the new leg, above the gate, and
converged (D2: 5.0 at 53 s, 4.55 at 45 s, 3.80 at 2.1 NM, 1.87 at L). Both took abeam.

What is established:
- **Leg activation decides** (every sequencing, Direct To, leg change and power-up; all 47 earlier passes).
- **A position re-initialization decides again**, also on the same leg (the two-jump starts: a lead decided on
  course 20-27 NM out never survived the second jump: r2, r5, P1-P3, S2, W, S3, A, B2', C2').
- **An edit of the active TO decides again** (D1, D2), with the state right after the edit (D2: 6.2 > 4.9, abeam;
  a later decision in flight would have seen 4.55 at 45 s and 3.80 at 2.1 NM, below the gate, and given lead). This
  matches #408 (2026-10-27): an edit of the following leg makes a lead plan be "decided again by the normal rule" -
  which under H4 means at once, with the XTK of that moment - while an abeam plan is kept (a8, a16; 3c, B2). Deletes
  that leave FROM and TO in place change nothing (section 4 of round 3).
- **An in-flight window** is not needed by D2 and not excluded: a decision at 53 s or more before the turn point
  (XTK 5.0 at al-L 3.5) would also give abeam. The earlier passes bound such a window to 78 s or more at 119 kt
  (S1: 2.9 at the landing 112 s out, 2.8 or more until 78 s, abeam) and 50 s or more at 239 kt (T7). Since every
  pass with a decision far out was decided with the landing/edit value, the window, if it exists, is at least 80 s
  and is indistinguishable from "at the (re)computation" in the data.

Candidates for the pure drift case (leg activated on course, aircraft leaves it in flight, no edit, no re-init):
- **(a) latched at the activation**: the lead plan stays; the aircraft turns at L however far off it is (the 4.0-NM
  off-leg handling of the sequencing regime aside).
- **(b) a window of 80 s or more** before the turn point: the plan is decided (again) there with the XTK then.
- **(c) continuous**: the plan becomes abeam the first time XTK exceeds the gate (and lead again only through Rule
  2's 1.0 NM). In every pass so far the largest XTK was the landing or edit value, so (c) is indistinguishable from
  (a) in the data; it is the mirror of Rule 2 with a different threshold.

What the take-home can fly: nothing clean. It re-intercepts at 40-60 deg from any offset, a SET 1 heading-only entry
is itself a candidate re-initialization (and once switched the active leg, g48a), the OBS return is an activation.
Two partial tests:
- **(a)/(c) against (b)**: D2 with the edit two minutes out (al-L about 8 at 239 kt) and about 6.0 after the edit,
  converging below 4.9 by al-L 5 (75 s): (a), (c) abeam (re-decided at the edit with 6.0); (b) with W at most 75 s:
  lead. The convergence must be read back; the take-home's 0.6 NM per NM after 0.8 NM parallel gives about 4.5 at
  al-L 5.
- **(a) against (c)**, the only handle: the post-jump heading transient. A jump with the heading set 100 deg or more
  away from the course makes the take-home drift away for about 30 s, gaining up to 0.3 NM (T5 5.2 -> 5.5, T6 2.3 ->
  2.6). Land at 8T, 239 kt, leg change, 4.7 left with HDG 200 (104 deg off 304): (a) lead (4.7 at the landing);
  (c) abeam if XTK passes 4.9-5.0 during the transient. Margins 0.1-0.2 NM, so fly it twice and read the peak
  XTK; a lead with a peak of 5.0 or more refutes (c), an abeam with a peak below 4.9 refutes (a). Also informative at
  119 kt: land with 2.5 and HDG 180 (124 deg off): (c) abeam if the peak passes 2.75.
No run separates (a) from (b) if the window is longer than the edit-to-turn-point time the plan allows (about
2.5 min at 239 kt on the 28-NM 8U-8T leg).

## 4. Mapping onto the emulation (task 3)

The trainer's "(re)computation" events and their MSFS counterparts in `NavCalculator`/`ActiveWaypoint`:

| trainer event | emulation | what to do |
|---|---|---|
| sequencing, Direct To, FPL 0 activation, power-on | `ActiveWaypoint.setActiveIdx` -> `clearTurnState` (`turnPlan = null`), `clearTurnStack`, `activateFpl0` | the next calculation decides at once (`decideTurnPlan` with no window) |
| SET 1 position re-initialization | (1) power-on (covered above); (2) a GPS fix after a search (`Gps.isValid()` false -> true, the unit resumes navigating from a new position); (3) a sim position jump: slew, teleport, "move aircraft" on the map, a flight (re)load, which the 1-Hz calculation sees as a jump of more than about 1 NM between ticks (at 239 kt the aircraft moves 0.07 NM per tick) | clear the plan (`turnPlan = null`) on these; the next calculation decides. The jump detector needs a cached last position in `NavCalculator`; a GS of 0 (paused sim) must not count |
| edit of the following leg (#408) | `onFollowingLegChanged`: a lead plan is nulled, an abeam plan kept | unchanged, but the re-decision is now at once (the window is gone), with the current XTK |
| edit of the active TO waypoint's position (D1, D2) | a user waypoint redefined on the USR page while it is the active TO (or FROM: the trainer switched to the next leg when the FROM was moved, D1's side note) | clear the plan on a redefinition of the active TO (the user-waypoint save path has to tell `ActiveWaypoint`); treat a moved FROM like a FROM delete (closest-leg re-pick, as today) |
| delete of a flown waypoint | FPL 0 edits that keep FROM and TO | keep the plan (as today) |
| pure drift | - | see below |

`decideTurnPlan` becomes: if `turnPlan === null`, `turnPlan = |legXtk| <= min(GS * TURN_PLAN_MAX_XTK_TIME,
TURN_PLAN_MAX_XTK) ? AT_LEAD : AT_ABEAM`, every calculation; `TURN_DECISION_TIME` and the `along > turnPoint + ...`
guard go away. `OFF_LEG_XTK` (4.0) keeps its sequencing-regime role (`tickOffLeg`) but no longer feeds the plan: Y2
and G48 were 4.5-4.8 from the leg and lead. The Rule 2 recapture (`AT_ABEAM` -> `AT_LEAD` at `|legXtk| < 1.0`, before
or after the turn point) is added as in round 3; the alert of a lead plan stays at about 20 s of closure before the
turn point and must not arm on `AT_LEAD` alone.

**The pure drift case.** Recommendation: **(a), latched at the (re)computation, no in-flight re-decision except
Rule 2's recapture**, because every observed re-decision was tied to a recomputation of the leg (activation,
re-initialization, TO edit, following-leg edit) and the unit's one in-flight check that is established, Rule 2, has
its own threshold (1.0) and runs toward lead only. Risks: if the real unit is (c), an aircraft hand-flown from on
course to beyond 2.75 NM (119 kt) or 4.9 NM (239 kt) would, in the sim, still turn at the lead point where the unit
would wait for the abeam line (and the sim's `tickOffLeg` would drop the turn only beyond 4.0 NM); if the real unit
is (a) and the sim implemented (c), it would wait at the abeam line where the unit turns at L. (b) is the middle
ground with no support of its own. With (a) the behavior for an aircraft that is on course at the sequencing is
the same as today for everything within 2.8 NM, and more generous beyond it; the code comment should say that the
pure drift case is untested in the trainer and name (c) as the alternative.

## 5. Rule 2 (both speeds)

Flips at 239 kt: G50 9.0 s after the first 0.99 frame (alert 7.5 s after it), D2 12.0 s; T7r reached 0.99 1.25 s
before the abeam line and took the zero turn; T11 11.5 s; T7 none in 7.0 s. With the 20 flips at 60-119 kt (2.2 to
12.0 s) the picture is one periodic check, about 12 wall s (11 trainer s), threshold 1.0 NM at all three speeds (the
239-kt flips came with XTK 0.82 and 0.76 at the check), before or after the turn point. The emulation checks at
1 Hz; no change from round 3.

## 6. No-more-runs recommendation

- Decide at the first calculation after the leg is (re)computed; `TURN_DECISION_TIME` removed.
- `TURN_PLAN_MAX_XTK_TIME = 83` s (bracket 82-85: 2.74 NM at 119 kt, 1.38 at 60) and `TURN_PLAN_MAX_XTK = 4.9` NM as
  the cap (bracket 4.8-5.0; 5.0 with a strict comparison is the natural reading, 4.9 keeps G50 clear of it).
  G = min(GS * 83 s, 4.9).
- Clear the plan on: sequencing, Direct To, activation, power-on (as today), a GPS fix after a search, a position
  jump of more than about 1 NM in a tick, a redefinition of the active TO waypoint, and a following-leg edit when the
  plan is lead (as today).
- Keep the plan on FPL 0 edits that leave FROM and TO, and on in-flight drift (pure drift untested; comment it).
- Rule 2: `AT_ABEAM` -> `AT_LEAD` at `|legXtk| < 1.0` NM, any time, 1 Hz; the normal-arc turn then starts at once past
  the turn point or at the turn point before it.
- The lead-plan alert at about 20 s of along-track closure before the turn point, independent of the decision.
- Optional trainer passes, in order of value: the 300-kt cap pass (section 2), the heading-transient drift pass
  (section 3), a second G50/G48 pair at 8U or 8V to confirm the cap is waypoint-independent at 0.1 NM.

## Scripts

`scripts/runs4.py` (pass list with the 2026-10-29 passes, built on rounds 2-3). Run with `python -I` from `scripts/`.
