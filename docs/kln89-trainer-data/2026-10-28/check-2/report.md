# KLN 89 trainer verification of the #438/#439 candidates, and #440 follow-ups (2026-10-28, 19:31-21:24)

Agent check in the KLN 89 trainer (VM "Windows 98", SET 1 take-home flying, SET 4 turn anticipation enabled for the
runs). It tests the candidate rules of `../analysis/analysis-1.md` (R1-A, R1-B for the turn-plan decision #438;
R2-A, R2-B for the abeam plan's late turn #439) with its runs W, P, Z and G, and adds the #440 runs the maintainer
approved during the session. Setup, waypoints, files: [README.md](README.md). Predictions as written before each pass:
[predictions.md](predictions.md). Nothing in the repository was changed, nothing was posted, only the KLN 89 trainer
was used.

Notation as in the analysis: al = along-track distance to the waypoint, XTK = the unit's line 2 before the switch,
L = the lead, al-L = distance before the turn point, arcD = distance to the normal turn arc, "switch" = the DTK
change on NAV 1 (the turn start). al and arcD are rebuilt from the displayed distance and bearing (+-0.05 NM).
XTK >= 1.0 is displayed with 0.1 NM resolution, so values like "3.20 at al-L 1.5" are means over the frames there.

## Summary

| run | result | verdict |
|---|---|---|
| W (119 kt) | lead plan: alert 19.3 s before the switch, switch at al 1.95 = L | as R1-A/B predicted, but not decisive: XTK fell below 1.0 at al-L 0.95, before the alert, so "abeam in an early window, then an R2 flip before the turn point" gives the same picture |
| P (119 kt, 3 repeats of r2) | identical XTK profiles (within 0.03 NM), lags 4.0 / 10.5 / 10.0 s, XTK at the switch 0.93 / 0.80 / 0.81 | R2-B (filter) refuted; R2-A (periodic check, period about 10.5 wall s) supported |
| Z (239 kt) | as specified it would have been a lead pass (no Rule 2 test); re-planned at 8T, it still became a lead pass (Z') | Rule 2 at 239 kt not tested |
| Z', 3a'', G' (239 kt, 8T) | lead plan with XTK 3.5 (landing at al-L 2.0-2.3, twice) and 3.2 (flown in from al-L 3.3) at al-L 1.5 | R1-A and R1-B both predicted abeam all three times: both fail at 8T at 239 kt |
| #440 3b' (2 passes) | a delete 1.8 s after the 8U sequencing dropped the run-out of the normal arc | dropped, as in the morning's 3b at 8S |
| #440 3a'' (239 kt) | a delete about 4 s into a lead-plan turn with XTK 2.4 to the inbound leg: the turn went on | kept (or re-started as lead); not re-decided to abeam |
| #440 3d | a delete 1.75 s after a zero-size-turn sequencing did not stop the alert | kept, but it ended about 1.0 NM past the waypoint instead of near its abeam line |

## Run W (Rule 1: the decision point)

**Predictions** (start al 4.95, al-L 2.96, 3.2 left, HDG 304, 119 kt): R1-A/R1-B (decision 1.4-1.6 NM before the
turn point, gate about 2.75 or arcD 3.1): lead, alert about 20 s of closure before L, switch at al 1.98. A decision
window starting at al-L >= 2.4 (or "largest XTK since the leg became active"): abeam, then a late start once XTK < 1.0.

**Observed.** XTK history: 3.20 at al-L 2.96 (parallel for about 10 s), 3.08 at 2.5, 2.25 at 2.0, 1.59 at 1.5
(arcD 2.0), 1.03 at 1.0, 0.79 at 0.66, 0.49 at 0. First frame with XTK <= 0.99 at al 2.93 (al-L 0.95). Alert onset
at al 2.60 (al-L 0.61, XTK 0.73, TK 32 deg off the DTK: about 22 s of along-track closure), DTK switch 19.3 s later
at al 1.95 with XTK 0.46, line 2 then the arc distance (0.46 falling). Sequencing at bearing 290 (bisector 289),
alert end at 1.92 NM past 8T.

**Verdict.** R1-A and R1-B: confirmed (lead). The early-window families: **not refuted.** The take-home's intercept
(about 64 deg) brought XTK below 1.0 15 s before the alert, so an abeam decision at al-L >= 2.4 followed by the R2-A
flip (which the analysis applies before the turn point too, giving a normal lead-plan turn) produces the same alert
and switch. Only the variant "largest XTK since the leg became active, no later re-decision" is refuted. A decisive
W needs XTK to stay at or above 1.0 until the turn point while passing <= 2.75 at al-L 1.5, which the 119-kt
take-home cannot do (in every 119-kt pass today and in r3/r5 XTK falls 1.1-1.9 NM over the last 1.5 NM before L).
Confidence: high for the observation, low for any discrimination.

## Run P (Rule 2: periodic check or filter)

**Predictions** (three r2 repeats: al 3.73-3.78, 3.0 left, 119 kt; abeam by R1 with XTK@1.5 about 2.97): R2-A: lags
spread over 0-10.5 s, XTK at the switch 0.78-0.99; R2-B: the same lag (+-1 s) and XTK every time, about 4-5 s and
0.87-0.94 judging by r2/r5/q3c.

**Observed.**

| pass | XTK at al-L 1.5 / 1.0 / 0.66 / 0 | first XTK <= 0.99 | switch: lag, XTK before, line 2 after, al | alert | sequencing (bearing) | alert end past 8T |
|---|---|---|---|---|---|---|
| P1 | 2.97 / 2.36 / 1.82 / 1.03 | al 1.94 | 4.0 s, 0.93, 0.93, al 1.87 | on with the switch | 290 | 1.92 |
| P2 | 2.97 / 2.33 / 1.82 / 1.04 | al 1.94 | 10.5 s, 0.80, 0.84, al 1.62 | on with the switch | 289 | 1.92 |
| P3 | 2.97 / 2.35 / 1.82 / 1.03 | al 1.94 | 10.0 s, 0.81, 0.84, al 1.71 | on with the switch | 290 | 1.82 |

All three: abeam plan (no alert, no switch at L), the late start on the normal arc (line 2 jumps by +0.03-0.04 from
the leg XTK to the arc distance), the alert on with the switch. Pooled with r2 4.5 s, r5 5.0 s, q3c 4.3 s: lags
4.0, 4.3, 4.5, 5.0, 10.0, 10.5 s; XTK at the switch 0.80-0.94.

**Verdict.** R2-B (a single low-pass filter): **refuted**, high. P1 and P2/P3 had the same start, the same XTK profile
to 0.03 NM at every point and the same first-0.99 position, yet their lags differ by 6-6.5 s. R2-A (a check every
~10.5 wall s, i.e. about 10 trainer seconds): **supported**: the lag is set by a phase the geometry does not control,
and no lag exceeds 10.5 s here (10.3 in the earlier set). Six values do not show the uniform shape (two clusters at
4-5 and 10-10.5 s), so the period itself is medium confidence. Threshold: every start came after the first frame
with XTK <= 0.99 and before XTK 0.80; note that 0.99 is also where the display changes from 0.1 to 0.01 resolution.

## Run Z (Rule 2 at 239 kt)

**As specified it would not have tested Rule 2.** At 8V with 4.5 NM left 8 NM before the waypoint, T7's 239-kt
intercept (about 0.87 NM of XTK lost per NM) gives about 1.6 NM of XTK 1.5 NM before the turn point, i.e. the lead
plan by every candidate, and no abeam plan to flip. It was re-planned at 8T, where the abeam line lies 4 NM after
the turn point: landing al 6.0-6.3, 3.6 left, expecting XTK about 3.3 at al-L 1.5 (abeam by R1-A and R1-B), then a
late start once XTK < 1.0 well before the abeam line (predictions in predictions.md).

**Observed (Z', z.csv).** Landing al-L 2.02 with XTK 3.60; 3.50 at al-L 1.5 (arcD 3.77), 3.23 at 1.0, 2.54 at 0.
Alert onset at al-L 1.47 with XTK 3.5 (TK 20 deg off: about 23.5 s of along-track closure), DTK switch 28.5 s later at
al 3.99 = L with XTK 2.50, line 2 the arc (2.5 falling), sequencing at bearing 290, alert end 3.92 NM past (L 3.98).
**A lead-plan pass**, so Rule 2 at 239 kt (threshold 1.0 vs 0.65-0.85, and the arc at the abeam line) remains
untested. It was not re-flown for Rule 2 because the same lead outcome repeated (3a'', G') and it bears on Rule 1
instead (below). A 239-kt abeam pass at 8T needs XTK well above 3.5 at al-L 1.5 at a waypoint whose gate is unknown;
at 8V (T7, T11) the 239-kt take-home leaves too little room before the abeam line.

## Run G (Rule 1: the 239-kt gate)

**As specified** (land al-L 2.0 with 3.1 left, expecting about 3.0 at al-L 1.5) it would have landed where Z' landed
and could not separate a gate from a jump-landing effect; Z' had already given the lead plan with 3.5. It was
replaced by a flown-in pass (G'): land al-L 3.28 (outside every window considered) with 3.9 left.

**Predictions (G').** XTK about 3.3 at al-L 1.5 (arcD about 3.5): R1-A (arcD <= 3.1, equivalent XTK gate 2.94 at 8T)
abeam; R1-B (G(239) in 2.90-3.14) abeam. A lead plan would mean the gate at 8T at 239 kt is above that XTK and that
Z' was not a jump artifact.

**Observed (G', g.csv).** XTK 3.83 at al-L 2.5, 3.60 at 2.0, **3.20 at 1.5 (arcD 3.55)**, 2.77 at 1.0, 2.42 at 0.66.
Alert onset at al-L 1.13 (XTK 2.9, about 23 s of closure), DTK switch 23.3 s later at al 3.95 = L with XTK 1.90,
line 2 the arc, sequencing at bearing 289, alert end 3.92 NM past. **Lead plan.** 3a'' repeated Z' exactly (landing
al-L 2.34 with 3.65, alert at al-L 1.47 with 3.5), lead again.

**Verdict.** R1-A: **fails** at 8T/239 kt (arcD 3.55 and 3.77 at al-L 1.5, lead; the gate was 3.1). R1-B: **fails**
(XTK 3.20 and 3.50, lead; G(239) was bounded by T7 at 3.14). Confidence high for the observations (three passes, one
flown in), medium for the conclusion, which leans on T7 (8V, 239 kt, abeam with 3.14 at al-L 1.5 and 2.95 at 1.33):
G' was farther from the leg than T7 at every al-L from 2.0 to 1.0 (3.60/3.20/2.77 vs 3.63/3.14/2.66) and took the
lead plan. So no XTK gate at a fixed al-L that depends on the speed alone fits both, and neither does arcD (G' 3.55 vs
T7 3.41). What differs: the turn (150 deg, L 3.98, rho 1.07 at 8T against 93 deg, L 1.88, rho 1.78 at 8V), and the
history (T7 was above 4.0 NM until al-L 2.4, G' below 4.0 from its landing). Either the gate depends on the turn
geometry, or T7's abeam came from its >4 NM history. A flown-in 239-kt pass at 8V with T7's XTK at al-L 1.5 but
below 4 NM throughout would separate the two; it was not flown (a long enough two-jump start at 239 kt could not be
fitted to the 8X-8V leg with the 10-15 NM jump threshold of SET 1).

The 239-kt alert onsets fit the analysis' closure rule: 23-23.5 s of along-track closure before the turn point at the
onset track (Z', G'); the time to the switch is longer when the intercept steepens after the onset (28.5 s in Z').

## Rule 1 and Rule 2: what survives

- **Rule 1.** At 119 kt nothing today contradicts R1-A or R1-B (W lead as predicted; P abeam with 2.97 at al-L 1.5
  as r2). But W could not discriminate the decision window. At 239 kt **both R1-A and R1-B fail** at 8T (lead with
  3.2 flown in, 3.5 after a landing at al-L 2.0-2.3), against T7's abeam with 3.14 at 8V. The "decision about 1.5 NM
  before the turn point with a gate that depends on the speed only (XTK) or on nothing (arcD 3.1)" does not survive.
  What survives: the decision exists before the alert and the alert onset follows the closure rule (about 23 s);
  the 119-kt gate of 2.65-2.80 at 8T stands. Confidence that R1-A/R1-B as stated are wrong: medium-high.
- **Rule 2.** R2-A (abeam plan re-decided to lead when XTK < 1.0, checked about every 10.5 wall s) survives at 119
  kt and is strengthened: the filter R2-B is refuted by P1 vs P2/P3. Confidence: high for "not a filter", medium-high
  for the 1.0 threshold at 119 kt, medium for the period. At 239 kt Rule 2 is untested (Z did not give an abeam pass).

## #440: edits in front of the active waypoint

Same method as the morning: the delete fired from FPL 0 with "Del <wpt> ?" pre-armed (CLR on the row) and ENT sent
by a watcher; NAV 1 shown again 4-7 s later. The trainer's take-home snaps its heading at an FPL edit (morning note;
seen again in every pass here), so the aircraft's path after an edit is not a clean test of the unit's steering; the
alert arrow and the DTK are.

**3b' (priority 1): the run-out of the previous waypoint's normal arc.** 8U on course (120 L, L 1.09, rho 0.63),
119 kt. Predictions: kept = line 2 the arc distance, alert flashing until about 0.9 NM past 8U (about 20 s after the
sequencing); dropped = line 2 the XTK to the 8U-8T leg, arrow steady.

| pass | delete | first NAV 1 frame after | observed |
|---|---|---|---|
| b1 | 8X, 1.8 s after the sequencing | 6.3 s after the sequencing | arrow steady from that frame on (frames with the prompt off still show the arrow); DTK 305; line 2 0.21, growing to 0.36 over 20 s and then decaying slowly; TK 297, converging on 305 over 40 s like a straight leg intercept, no turn back onto the arc |
| b2 | 8X, 1.75 s after | 6.5 s after | the same: arrow steady, DTK 305, line 2 0.22 growing to 0.36, TK 297 |

**Verdict: dropped**, high (two identical passes here, two at 8S in the morning). The DTK cannot show it (the arc and
the new leg share it); line 2 is consistent with the leg XTK (about 0.2-0.3 NM at that point of a 120 deg arc) but the
heading snap blurs it; the alert stopping 14 s or more before its normal end is the clear reading.

**3a' (priority 2): the active waypoint's own started turn.**
- At 119 kt (a1.csv, T6 replica): **inconclusive.** The take-home converged faster than in T6 (TK 291 to 316 within
  11 s), the delete (8Y) fired at status distance 2.2, and the first NAV 1 frame 4.2 s later already showed DTK 094,
  line 2 0.92 and XTK to the inbound leg about 0.95. Neither the turn start nor XTK > 1.0 at the delete is
  established. The turn went on (alert, arc, sequencing at 289, alert end 1.92 past).
- At 239 kt (a2.csv, Z' geometry; the speed gives a lead turn with XTK 2.5 at L). Predictions: kept = DTK 094, line 2
  the arc distance, alert on; dropped and decided again by the analysis' rules (al < L, XTK > 1.0, so abeam) = DTK
  back to 304, line 2 the leg XTK, no alert. The alert came at al-L 1.47 with 3.5 as in Z'; "Del" was armed after it.
  8V (flown, before the FROM 8U; the cursor landed one row lower than intended) was deleted at status distance 4.5,
  about 4 s after the turn start (the status distance passed 4.7 to 4.5 at the same rate as after Z's switch), with
  XTK to the inbound leg about 2.4. First NAV 1 frame 4.6 s after the delete: **DTK 094, line 2 2.3 (the arc
  distance, falling), alert flashing**; take-home heading snapped from about 350 to 313, then turning right again.
  Sequencing at bearing 289; the alert ended at 2.52 NM past 8T, earlier than L (3.98) and than Z's undisturbed 3.92.
  **Verdict: kept** (or dropped and immediately re-started as a lead-plan turn; not re-decided to abeam), medium
  (one pass; the turn start is inferred from the identical Z' pass, not seen). The early alert end after an edit
  matches the earlier post-edit cases (a16e 1.32, q3c2 1.62 for L 1.98).

**3d (priority 3): the run-out after a zero-size abeam turn.** 8U, run C replica (d2.csv: al 1.83, 3.5 right, 119
kt). Observed before the delete: abeam plan, XTK minimum 1.2, the zero-size turn at the abeam line (DTK 305 at bearing
335, line 2 1.2 = the distance to 8U). Sequencing 42.5 s later; 8Z deleted 1.75 s after it. Predictions: kept = alert
flashing on; dropped = arrow steady at the first NAV 1 frame.
Observed: first NAV 1 frame 6.3 s after the sequencing with the **alert still flashing**, and it kept flashing until
79 s after the sequencing, ending about 1.0 NM past 8U on the new leg. In the undisturbed C (2026-10-20) it ended 30 s
after the sequencing, about at 8U's abeam line on the new leg (along past -0.1 to 0.0).
**Verdict: kept, not dropped**, medium. Its end moved (about 1.0 NM past instead of about 0), but this pass also
differed after the delete: the take-home heading went to 057 and then swung back, so XTK to the new leg was 1.6-1.9
at the abeam line (C: 0.86-0.97). Whether the delete or the geometry moved the alert end cannot be told from one run.

**3g (priority 4): not flown.** It needs a full FPL 0 (20 waypoints on the 89, 12 more than the test plan), and its
restoration; no time was left after the 239-kt runs.

**Reading for #440, with the morning's results.** A delete of a flown waypoint (not the FROM):
- keeps the active waypoint's abeam plan (morning 3c) and its started lead-plan turn (3a'' here);
- drops the run-out of the waypoint just sequenced when that was a normal arc (3b at 8S twice, 3b' at 8U twice);
- does not drop the run-out alert of a zero-size turn (3d, one pass), whose end may move.
The 3b'/3d contrast is the new open question.

## Trainer state left behind

- KLN 89 trainer running, NAV 1 shown, cursor off, line 2 `Fly L/R`, take-home flying at GS 120 (shown 120 kt) on
  8S to 8R (15.4 NM to 8R at 21:23, converging from 1.6 NM right after the final SET 1 entry), SET 1 HDG 280, a
  message pending. SET 4 turn anticipation DISABLED (as found).
- FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R, checked row by row at 21:19. During the session 8X (twice), 8Y, 8Z and 8V
  were deleted and inserted again with the same idents in the same order. No user waypoint created, changed or
  deleted; no numbered flight plan touched; the AVsoftech trainer not started; the VM not started, stopped or reset.
- Scratchpad: this folder; the PNG frames are in `scripts/rec/` (about 200 MB).