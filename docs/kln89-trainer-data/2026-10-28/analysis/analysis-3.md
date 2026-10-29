# The turn-plan decision (#438) and the abeam plan's late turn (#439): third analysis

Re-analysis after the 2026-10-28c session (Y, V, S, the 60-kt tree). All readings were rebuilt from the CSVs with
`scripts/runs3.py` (the pass list of round 2 plus the new passes), `fits3.py` (the fit table, output `fits3.txt`) and
inline scripts; the round-2 scripts (`(the analysis scripts, not kept)`) are reused. Nothing flown, nothing in the
repository changed, nothing posted. Notation as in the earlier rounds (al-L = NM before the turn point, XTK = line 2,
"landing" = the first calculation after the last SET 1 jump, "leg change" = the jump made a different leg active).

## Summary

| | candidate | fits | confidence |
|---|---|---|---|
| Rule 1 | **H4: the plan is decided at the first calculation after the leg becomes active or the position is re-initialized (every SET 1 jump, whether or not the leg changes), with the state then: lead iff XTK <= about 80 s of ground speed (bracket 78-85 s: 1.33 NM at 60 kt, 2.64 at 119, 5.3 at 239), uncapped; latched. No separate window before the turn point is needed by any pass.** | 45/47 (T5 at the edge, T11 a start artifact) | medium-high for "decided at the (re)activation with the speed-proportional gate"; the gate constant medium; what happens to a leg that drifts off course in flight without a re-initialization: no data |
| | R-A: one decision 45 s before the turn point, gate 80-83 s of GS uncapped (the report's reading) | 43/47 (T5, T7, T11, S1) | low: T7 (4.5 at 45 s) and S1 (2.05) are lead by it and were abeam |
| | H4 with "a leg activated with XTK > 4.0 latches abeam" | 46/47 by the first NAV 1 frames, 44/47 with V1/V2's entered 4.15 | low: T8 (leg change with 4.5, lead) refutes it; V1/V2 (leg change with about 4.15, lead) too unless the display read 4.0 |
| | C1 (round 2), C2, C3, E2 | 44, 41, -, - | refuted (Y1/Y2; T7 3.74 at 2.1 against Y2 3.77; S1) |
| Rule 2 | R2-A holds at 60, 119 kt: an abeam plan flips to lead once XTK < 1.0 NM, checked periodically; the flip also runs before the turn point (C2', S1, S3, W) and then gives an ordinary turn at L. Period at least 12 wall s (S1). 239 kt still untested. | 20/20 flips | high (threshold, before-L); period medium |
| Edits | An FPL 0 delete of a flown waypoint does not re-decide the plan: 3c, a8, a16 kept abeam with XTK 1.0-1.7 at the edit, B2 kept abeam (its "alert" is the 25-s burst that also follows SET 1 jumps), 3a'' kept lead. S1's abeam comes from its landing (2.9 > 2.64), not from its delete. | 6/6 | medium-high |

## 1. Verification of the report's readings

Rebuilt from the CSVs (`runs3.py`, XTK at fixed al-L, mean of the frames within 0.06 NM; alert onsets and switches
from the frames):

| pass | GS | landing (al-L, XTK, leg) | x@3.0 | x@2.5 | x@2.1 | x@1.5 | x@1.0 | x@0 | alert onset | switch | plan |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Y1 | 239 | 4.06, 4.5, same leg (8U-8T, two-jump) | 4.20 | 3.84 | 3.42 | 2.77 | 2.27 | 1.50 | al-L 1.00 | al = L | lead |
| Y2 | 239 | 4.16, 4.8, same leg | 4.50 | 4.19 | 3.77 | 2.94 | 2.34 | 1.50 | al-L 1.00 | al = L | lead |
| V1 | 239 | about 4.1, 4.15 entered, **leg change** from 8T-8S; first NAV 1 frame al-L 2.07 with 3.60 (8Z deleted at about 2.4) | - | - | 3.60 | 3.50 | 3.24 | 2.52 | al-L 1.20 | al = L | lead |
| V2 | 239 | about 4.7, 4.1 entered, **leg change** from 8V-8U; first NAV 1 frame al-L 2.37 with 3.30 | - | - | 3.30 | 3.20 | 2.90 | 2.23 | al-L 1.16 | al = L | lead |
| S1 | 119 | 3.72, 2.9, **leg change** from 8V-8U (single jump, HDG 083), max 3.10; 8X deleted 14 s later | 3.00 | 2.86 | 2.58 | 2.05 | 1.60 | 0.79 | al-L 0.07, 12.0 s after the first 0.99 frame (al-L 0.32) | al = L, 2 s later | abeam, Rule 2 flip before L |
| S2 | 119 | 2.73 (first NAV 1), 3.5, same leg; 8V deleted at about 2.8 | - | 3.50 | 3.27 | 2.80 | 2.34 | 1.34 | none before L | al-L -0.54, 6.2 s after the first 0.99 | abeam |
| S3 | 119 | 2.91 (first NAV 1), 3.3, same leg; 8V deleted at about 2.9 | - | 2.95 | 2.16 | 1.37 | 0.89 | - | al-L 0.62 (XTK < 1.0 from al-L 1.06) | al = L | lead-looking, masked |
| A | 60 | 0.53, 2.10, same leg | | | | | | 1.30 | none | al-L -0.34, 8.5 s after 0.99 | abeam |
| B2 | 60 | 1.56 entered; first NAV 1 at al-L 0.34 with 1.40 after the 8V delete | | | | | | 1.15 | burst t 122-147 after the delete, then steady; none at L | al-L -0.24, about 9 s after 0.99 | abeam |
| B2' | 60 | 0.57, 1.60 | | | | | | 0.97 | none | al-L -0.06, 4.8 s after 0.99 | abeam |
| C2' | 60 | 0.54, 1.50 (1.48 entered) | | | | | | 0.88 | al-L 0.06, 5.7 s after 0.99 at al-L 0.11 | al = L | abeam, flip before L |
| C2'' | 60 | 0.27, 1.30 | | | | | | 1.10 (never below 1.0) | 2 s after the landing | al = L, line 2 the arc | lead |

All of the report's headline readings stand. Two details differ: T7's XTK at al-L 2.1 is 3.74, not "about 3.8"
(T7: 4.52 at 3.0, 4.10 at 2.5, 3.74 at 2.1, 3.63 at 2.0, 3.14 at 1.5), which puts C2's 239-kt gate at
[3.77, 3.74): refuted, not "on a hair". And B2's alert is not a lead alert: it flashes from the first NAV 1 frame
after the delete (t 122) for 25 s and goes steady at al-L about 0.5, well before L; the DTK switch comes after L
with line 2 the arc (an ordinary Rule 2 flip). The same 15-25 s burst follows SET 1 jumps (T5, T11, C, T12, T14).

The 4.0 NM crossings in time before the turn point: T7 37.8 s, T8 50.5 s, T11 25.1 s, Y1 42 s (al-L 2.79), Y2 36 s
(al-L 2.39). Y2 and T7 had the same XTK 45 s before the turn point (4.5) and 2.1 NM before it (3.77 against 3.74).

## 2. The starts: what was active before each jump (the activation listing of `runs3.py`)

| start | passes | plan |
|---|---|---|
| single jump that changed the active leg, XTK at the landing above 5.3-5.5 (80-83 s of 239 kt) | T7 (6.0 at al-L 5.84, from 8U-8T 21 NM out, clean), R6 (6.2) | abeam |
| leg change, 239 kt, landing 4.0-5.2 | T3 (4.0, lead), T8 (4.5, lead), T5 (5.2, abeam; 5.3 within 3 s, 5.4 at 11 s, 5.5 from 18 to 32 s), T11 (4.2, abeam; jumped out of a turn in progress at 8V, DTK already 065 at 0.9 NM), V1 (about 4.15 entered, lead, delete at 2.4), V2 (about 4.1, lead, delete at 2.4) | mixed |
| leg change, 239 kt, landing below 4.0 | T2 (4.0, inside), T10 (3.2) | lead |
| same leg (two-jump start), 239 kt | Z' 3.6, 3a'' 3.6, G' 3.9, Y1 4.5, Y2 4.8 | lead |
| leg change, 119 kt | T6 2.3 (lead), B 2.0 (lead), T12 (239, 2.3, lead), T13 2.9, C 3.5, a13 3.5, a16 3.8, r4 3.2, S1 2.9, r1/q3c/a14/a15 4.4, R2 5.7, D 5.0 (abeam) | lead at most 2.3, abeam from 2.9 |
| same leg, 119 kt | T14 2.7 (lead), r3 2.6 (lead), r5 2.8, r2/P 3.0, S2 3.5, a8 3.3, d2 3.5 (abeam), W 3.2 and S3 3.3 (lead-looking, XTK < 1.0 before L) | lead at most 2.7, abeam from 2.8 (W, S3 masked) |
| same leg, 60 kt | C2'' 1.30 (lead); C2' 1.50, B2' 1.60, B2 1.56, A 2.10 (abeam) | gate in [1.30, 1.48) |

Three things follow.

1. **"A leg activated with XTK above 4.0 latches abeam" is refuted by T8** (leg change from 8T-8P with 4.5, lead;
   the first calculation after the jump runs on the SET 1 page with the entered offset) and, unless their display
   read 4.0, by V1 and V2 (leg changes with about 4.1-4.15, lead; their deletes came 15-20 s later, and section 4
   shows that deletes do not re-decide). T3 and T2 (4.0 at a leg change, lead) sit on the bound. The rule fits
   46/47 only because V1/V2's first NAV 1 frames (3.6, 3.3) come after the FPL page.
2. **Every landing, same leg or leg change, is consistent with a decision taken at the landing with a gate
   proportional to the ground speed** (H4): at 239 kt lead up to 4.8 (Y2) and abeam at 6.0 (T7) and 6.2 (R6); at
   119 kt lead up to 2.7 (T14) and abeam from 2.8 (r5); at 60 kt lead at 1.30 and abeam from 1.48-1.50. T5 (5.2 at
   the landing, abeam) is the one 239-kt landing between 4.8 and 6.0; with the gate at 80 s (5.31) it is abeam if
   the decision came 3 s or more after the landing (5.3 shown), which a check every 10-12 s (Rule 2's cadence)
   would give; with 83 s (5.51) it needs the decision 18-32 s after the landing. T11 (4.2, abeam) fits no gate
   that passes T8 (4.5) and V1/V2; it is the only pass started out of a turn in progress (the 8V turn, DTK 065 at
   0.9 NM TO 8V), the family of the a10 artifact, and is set aside with that caveat.
3. **S1 and T7, the two passes that refuted a decision 45 s before the turn point, are the two that were decided
   at a leg change far out** with XTK above the gate (S1 2.9 at 112 s, T7 6.0 at 88 s) and then converged below it
   (S1 2.05 and T7 4.5 at 45 s). Y1/Y2 (4.5/4.8 at 61-63 s, same leg) and G' (3.9 at 50 s) were below the 239-kt
   gate at the landing already, so they do not distinguish "decided at the landing" from "decided later". W and S3
   (119 kt, 3.2-3.3 at the landing, 1.6/1.4 at 45 s, lead-looking) are decided abeam at the landing under H4 and
   then flipped by Rule 2 before L (XTK < 1.0 at al-L 0.95 and 1.06; the alert then comes at 20 s of closure before
   L, as observed, 0.61 and 0.62). C2' is the clean demonstration of that flip before L at 60 kt: landing 1.50
   (abeam), 0.99 at al-L 0.11, alert 5.7 s later at al-L 0.06, switch at L. S1 is the same at 119 kt with a late
   check (12.0 s): alert at al-L 0.07, switch 2 s later at L.

## 3. Rule 1 candidates and fits (`fits3.py`)

47 decided passes (a10 inherited, a11 undetermined and q3c2 left out; B2 read as abeam; W, S3, B, T2 counted as fit
for either prediction because XTK < 1.0 before L makes an abeam plan plus flip look like lead).

| rule | fits | misses |
|---|---|---|
| emulation today (20 s, 2.8, off-leg abeam) | 23/47 | 24 passes |
| C1 of round 2 (45 s, min(4.0, 83 s)) | 44/47 | Y1, Y2, S1 |
| R-A (45 s, 83 s uncapped) | 43/47 | T5, T7, T11, S1 |
| R-A (45 s, 80 s) | 43/47 | T7, T11, T14, S1 |
| **H4 (at the landing, 83 s)** | **45/47** | T5 (edge), T11 (artifact) |
| H4 (at the landing, 80 s) | 44/47 | T5 (edge), T11, T14 (2.7 against 2.64: within the 0.1 display step) |
| H4 + abeam latched at a leg change with XTK > 4.0 | 46/47 (44/47 with V1/V2 at 4.15) | T8 (and V1, V2) |
| C2 (2.15 NM, 2.75 / 3.76) | 41/47 | Y2, S1, and the four 60-kt landings inside its window |

The gate constant: lead at 1.30 (60 kt), 2.7 (T14, 119 kt), 4.8 (Y2, 239 kt) and abeam at 1.48-1.50 (60), 2.8
(r5, 119), 5.2-5.5 (T5, 239), 6.0 (T7) give 78-89 s (60 kt), 80-85 s (119, counting the 0.05 display half-step),
72-80 s (239, T5 at the landing) or 72-83 s (T5 3-18 s later). **80 s (bracket 78-85) is the value that fits all
three speeds with T5 and T14 at the display resolution.** The gate is proportional to the speed, uncapped: at
239 kt it is above the 4.0 NM off-leg bound, and Y2 (4.5 at 45 s, 4.8 at the landing) shows that being more than 4.0
from the leg does not by itself make the plan abeam.

**The window.** No pass now requires a decision point before the turn point other than the landing. The 45-s bracket
of round 2 came from a13/T6/r5 at 40 s and T7/T8's 4.0 crossings at 38/50 s; a13, T6 and r5 are decided at their
landings under H4 (3.5, 2.3, 2.8), and T7's abeam is its landing (6.0). What the data bounds: a landing 16 s before
the turn point decides at once (C2''), landings 88-112 s before it decide at once (T7, S1), and a leg activated on
course 20-27 NM out (the first jump of every two-jump start) does not fix a lead plan that survives the second jump,
so either a re-initialization re-decides or the first jump was outside a window of less than about 10 min. Nothing
distinguishes "decided at the (re)activation" from "decided at the first calculation inside a window longer than
112 s at 119 kt and 88 s at 239 kt". The case that matters for users, an aircraft that drifts off the leg in flight
after a normal sequencing, has no data: the take-home always steers to the course and every pass starts with a jump.

**Still rejected:** XTK <= L + c (T10/T7 at 239 kt, r5 at 119), arcD, bearing offset, cones (round 2), a decision in
straight distance or ETE, a 4.0 cap on the gate (Y1, Y2), a geometry-dependent gate (V1/V2 against T7 at 8V), and
any single moment 20-50 s before the turn point (S1, T7).

## 4. Edits (item 2 of the brief)

"A delete of a flown waypoint re-decides the plan with the state at the edit" predicts, with the 80-s gate: 3c
(q3c2, 119 kt: XTK 1.5 at the delete) lead; a8 (1.7) and a16 (1.0) lead; B2 (60 kt, 1.40 at the delete, gate
1.33) abeam or lead; S1 (2.95) abeam; S2 (3.55) abeam; V1/V2 (3.6-3.7) lead; 3a'' (2.4, turn started) lead. Observed:
3c, a8, a16 kept abeam (refutes re-decision); B2 abeam with the post-edit burst; S1, S2 abeam either way; V1/V2 lead
either way; 3a'' lead either way. The edits that leave the active leg in place never changed the plan in any pass
(3c, a7, a8, a16, 3a'', B2, S1, S2, S3, V1, V2); the runs that changed the plan all removed the FROM or the TO (3e,
a2-a6, a9, a11). So the V passes are not confounded, S1's abeam is its landing, and the snap trick is safe for
decisions already taken.

## 5. Rule 2 (item 4)

Flips observed, lag from the first frame with XTK <= 0.99 to the flip (the alert and the arc start when al < L; the
alert when al > L, the turn then starting at L): a13 2.2, P1 4.0, q3c 4.2, r2 4.8, B2' 4.8, C2' 5.7, S2 6.2, r5 6.5,
a15 6.8, a16e 7.5, A 8.5, a14e 8.8, B2 about 9, T13 9.8, P3 10.0, r1 10.2, r4 10.2, P2 10.5, T11 11.5, S1 12.0 s
(wall). Threshold: every flip after the first 0.99 frame and none from 1.0 or above, at 60 and 119 kt (20 flips);
C2'' at 60 kt sat at 1.10-1.14 and did not flip (it was lead anyway). The period is at least 12 wall s (11.3 trainer
s) if S1's flip was the same mechanism; the spread 2.2-12.0 is what a 12-s check gives (mean 7.4 s, expected 6).
The flip runs before the turn point too (C2', S1, S3, W) and then produces a normal lead-plan turn at L with the
alert at about 20 s of closure (S3 0.62, W 0.61) or at once when less than that remains (S1, C2'). At 239 kt it is
still untested: Y and V were lead; T7 (0.99 for 7 s before the abeam line, no flip) and T11 (flip 11.5 s after 0.99,
at the line) fit a 12-s period with the 1.0 threshold and also a lower 239-kt threshold.

## 6. Trainer runs

All with SET 4 on, line 2 on `Fly L/R`, no FPL edits. Predictions: H4 = decision at the landing with 80 s of GS
(5.31 NM at 239 kt, 2.64 at 119); R-A = decision 45 s before the turn point with the same gate; H4+4.0 = H4 with
abeam latched when a leg change lands above 4.0.

**Run 1: T7 repeat** (8V, 239 kt, single jump from the 8U-8T or 8T-8S leg to 7.7 NM before 8V with 6.0 left, HDG
332; the aircraft at least 15 NM from the point; abandon if the jump re-orients to 8V-8U). Expected XTK as T7:
about 4.5 at 45 s, 3.7 at 2.1, 3.1 at 1.5, 1.8 at L, 0.9 before the abeam line.

| candidate | prediction |
|---|---|
| H4 | abeam (6.0 > 5.3 at the landing): no alert before L, no switch at al 1.88; then Rule 2 (XTK < 1.0 about 7 s before the abeam line: flip with line 2 the arc if a check falls in that window, else the zero turn at the line) |
| H4+4.0 | abeam |
| R-A | lead (4.5 at 45 s < 5.3): alert about 23 s of closure before L, switch at al 1.88 |

A lead here would leave T7 unexplained by everything and point at a difference in T7's start (its heading at the
jump: TK 333 then 016, heading at the waypoint).

**Run 2: T8 replica with a leg change** (8U, 239 kt, single jump from the 8T-8S leg to 8 NM before 8U with 4.5
right, HDG 065). Expected: about 3.8 at 45 s, 2.2 at 1.5.

| candidate | prediction |
|---|---|
| H4, R-A | lead (4.5 < 5.3) |
| H4+4.0 | abeam (leg change above 4.0) |

**Run 3: the 239-kt gate** (8U or 8T, 239 kt, single jump with a leg change, 8 NM before, 5.0 right/left, HDG = the
inbound DTK; then a second pass with 5.6 if the first is lead, with 4.8 if it is abeam). Expected XTK at the
landing = entered (the take-home holds it for about 0.8 NM at 239 kt).

| candidate | 5.0 | 5.6 | 4.8 |
|---|---|---|---|
| H4, 80 s (5.31) | lead | abeam | lead |
| H4, 83 s (5.51) | lead | abeam (margin 0.1) | lead |
| H4+4.0 | abeam | abeam | abeam |
| R-A (45 s, 80-83 s) | lead (about 4.3 at 45 s) | lead (about 4.9) | lead |

Run 3 pins G(239) to 0.3 NM and, with run 2, separates H4 from H4+4.0; runs 1 and 3 together separate H4 from R-A
(R-A predicts lead in all of them).

**Run 4: S1 clean** (119 kt, 8T, single jump with a leg change from 8V-8U to 5.7 NM before 8T (al-L 3.7) with 2.9
left, HDG 304, no edit). Expected: about 2.1 at 45 s, 1.0 at al-L 0.3.

| candidate | prediction |
|---|---|
| H4 | abeam at the landing (2.9 > 2.64), then the Rule 2 flip near L: the alert less than 12 s before the switch at L, or after it |
| R-A | lead (2.1 < 2.64): alert about 20 s of closure before the switch |

The read-back is the alert-to-switch interval (S1: 2.0 s; W, S3: 19-21 s). Fly it twice: the flip's lag is random,
and an alert 12-20 s before L is ambiguous.

Priority: 1 (the outlier itself), 3 (two passes; the gate at 239 kt has never been measured), 2, 4. The in-flight
drift case cannot be flown with the take-home.

## 7. What the emulation should do without further runs

- **Decide at the first calculation on a newly active leg** (sequencing, Direct To, power-up, position
  re-initialization, a FROM/TO change), with the state then: `turnPlan = |legXtk| <= GS * TURN_PLAN_MAX_XTK_TIME ?
  AT_LEAD : AT_ABEAM`, `TURN_PLAN_MAX_XTK_TIME` 80 s (bracket 78-85; 1.33 NM at 60 kt, 2.64 at 119, 5.3 at 239),
  no 4.0 cap and no off-leg override (Y2: 4.5-4.8 NM from the leg, lead). `TURN_DECISION_TIME` goes away. This is
  what every trainer pass shows; for an aircraft that leaves the leg in flight after a normal sequencing the trainer
  has no data, and deciding at activation is the reading with the fewest assumptions.
- **Latch** the plan until the active leg changes; an FPL 0 edit that keeps FROM and TO keeps the plan (section 4).
- **Rule 2:** while `turnPlan === AT_ABEAM` and no turn has started, set `AT_LEAD` when `|legXtk| < 1.0 NM`, before
  or after the turn point; the existing turn-point and start-at-once paths then run. 1 Hz; the trainer's 12-s cadence
  need not be emulated.
- **The alert** stays at about 20 s of along-track closure before the turn point for a lead plan (T6 16 s to Y 21 s),
  not at the decision; `isAlertWithTurn` must not arm on `AT_LEAD` alone.
- Do not emulate the post-jump/post-edit alert burst, the inherited plan (a10) or the turn-in-progress start (T11).

## Scripts

`scripts/runs3.py` (pass list with the 2026-10-28c passes; `series`, `at`, `cross4` from round 2), `scripts/fits3.py`
(section 3, output `fits3.txt`). Run with `python -I` from `scripts/`.
