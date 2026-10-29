# KLN 89 trainer check for #438, #439 and #440 (2026-10-28, 16:27-18:40)

Agent check in the KLN 89 trainer (VM "Windows 98", SET 1 take-home flying at 119 kt shown, SET 4 turn anticipation
enabled for the runs). Setup, waypoints and the run list are in [README.md](README.md). Notation: al = along-track
distance to the waypoint on the active leg, XTK = cross track to the active leg (NAV 1 line 2 before a turn), L = the
lead of the 2026-10-20 rule, "turn point" = al = L, "arcD" = distance to the normal turn arc (the circle tangent to both
legs at L from the waypoint; at al = L it equals XTK), "nominal decision point" = al = L + 20 s of GS (what the unit
does today), XTK@D = XTK at al = L + D. Positions are rebuilt from NAV 1 distance (0.1 NM) and bearing (1 deg), so
reconstructed values carry about +-0.05 NM; line 2 after a turn start is the unit's own arc distance (0.01 NM).
Only the KLN 89 trainer was used; the AVsoftech KLN 90B trainer was not started. Nothing in the repository was changed;
nothing was posted.

## Summary

| # | question | answer | confidence |
|---|---|---|---|
| Q1 #438 | what decides the turn plan | not the XTK at the nominal point. The plan follows the XTK about 1.3-1.5 NM along-track before the turn point (about 20 s at 239 kt, about 40-45 s at 119 kt); the turn plan needs XTK there at most about 2.6-2.7 NM at 119 kt (2.8-2.9 NM at 239 kt). The turn-plan alert then starts about 20 s of along-track closure before the turn start | medium-high for "earlier than 20 s at 119 kt"; medium for the distance; low-medium for the exact gate and its speed dependence |
| Q2 #439 | late normal arc or zero turn at the abeam line | without edits: a late start is always on the normal arc, after al <= L, with arcD 0.8-1.2 NM at the start; the zero turn at the abeam line comes when the aircraft never got closer than about 1.4 NM to the arc. No single threshold separates the frames; a candidate fits all no-edit runs. The late arc sequences at the bisector and its alert ends at about L past (1.92 for L 1.98) | high for the facts; low for the rule |
| Q3 #440 | edits in front of the active waypoint | mixed: the active waypoint's abeam plan survived a delete of a flown waypoint (3c); the run-out alert of a waypoint just sequenced was dropped by such a delete (3b, two runs); deleting the FROM re-picked the closest leg before and during a turn (3e); an insert between FROM and TO made the new waypoint active (3f); on course nothing distinguishes "kept" from "dropped and restarted" (3a) | see section Q3 |

## Q0: re-analysis of the 2026-10-20 and 2026-10-27 data

Table `etab.txt` (all passes, XTK at fixed along-track distances before the turn point) and `q2tab.txt`. Main points:

- **The nominal decision point does not separate the 119 kt passes.** T6 (8T, 119 kt, flown in) took the turn plan
  with XTK 2.34 at the nominal point; a13 at the same waypoint and speed took the abeam plan with 1.66, a14/a15 with
  1.90-2.05. Every rule on XTK at a fixed point at or after the nominal one, on the predicted XTK at the turn point, on
  the track angle (T6 +49 to +60 deg, a13-a15 +48 to +53) or on a closure-time decision moment fails on that pair: a13
  is closer to the leg than T6 at every al after the nominal point. What differs is the history: T6 never had more
  than 2.6 NM of XTK (it flew parallel at 2.6 between al 3.4 and 3.0), a13-a15 still had 3.0-4.0 NM 1.5 NM before the
  turn point.
- **Candidate C (no decision, distance to the arc) is ruled out:** at al = L, T6 (arcD 1.34) turned and a15 (arcD
  1.29) did not; T14 turned at L with arcD 2.0.
- **The T6 alert came late (al 2.21, 16 s before the turn).** The turn-plan alert onsets of all runs fit "about 20-23 s
  of along-track closure, (al - L)/(GS cos(TK - DTK)), before the turn point" (T3 22, T8 21, T10 21, T2 23, T6 14-20,
  r3 18.5 s) better than the fixed al = L + 20 s of GS.
- The jump-into-window cases (T12, T14, a8, C, T13) are consistent with a decision taken at once when the jump lands
  inside the decision range; a10 (turn plan with 3.3 NM, landing 0.14 NM before the lead) stays an artifact, and
  today's p1 showed another jump artifact (below).

## Q1 (#438): the turn-plan gate

**Predictions written before the runs** (8T, 150 R, L 1.98, aircraft left of the leg; jump at al 3.9 with HDG = DTK,
so the take-home flies parallel for about 5 s, then intercepts at 50-60 deg):

| run | XTK at the jump | XTK@1.5 (expected) | XTK at nominal (expected) | today's model (2.8 at nominal) | lower fixed gate at nominal (below 1.7) | decision about 1.5 NM before, gate about 2.8 |
|---|---|---|---|---|---|---|
| r2 | 3.0 | 2.9 | 1.8 | lead | abeam | abeam |
| r3 | 2.6 | 2.5 | 1.5 | lead | lead (borderline) | lead |
| r4 (8U, L 1.09) | 3.2 right | 3.1 | 1.7 | lead | abeam | abeam |
| r5 | 2.85 | 2.8 | 1.7 | lead | abeam | borderline |
| r1, q3c (a15 repeats) | 4.4 | 4.5, 3.4 | 2.6, 1.8 | lead | abeam | abeam |

**Observed** ("plan" = lead if the alert started before al = L and the turn started at al = L):

| run | XTK@1.5 | XTK@1.33 | XTK nominal | plan | alert onset | turn start | line 2 after the start |
|---|---|---|---|---|---|---|---|
| r1 | 4.58 | 4.50 | 2.59 | abeam | none before the turn | al 0.91 (XTK 0.79) | 1.20 (normal arc) |
| q3c | 3.43 | 2.78 | 1.84 | abeam | none | al 1.77 | 0.94 (normal arc) |
| r2 | 2.97 | 2.88 | 1.82 | abeam | none | al 1.78 | 0.91 (normal arc) |
| r5 | 2.80 | 2.65 | 1.69 | abeam | none | al 1.90 | 0.88 (normal arc) |
| r3 | 2.52 | 2.46 | 1.50 | **lead** | al 2.34, XTK 1.1, 16.8 s before the start | al 1.95 = L | 0.78 |
| r4 (8U) | 3.08 | 2.85 | 1.71 | abeam | none | al 0.78 | 0.84 (normal arc) |

r2, r4 and r5 had less XTK at the nominal point (1.7-1.8) than T6 (2.34) and still took the abeam plan; r3 with 1.50
took the turn plan. Today's model (2.8 NM at the nominal point) predicted lead for all of them and is wrong five times
out of six; a fixed lower gate at the nominal point cannot be both below 1.69 (r5 abeam) and above 2.34 (T6 lead).
The a15 start was flown three times (a15, r1, q3c): abeam every time, so the trainer is repeatable here.

**Combined bracket about 1.5 NM before the turn point** (flown-in runs of all three days):

| speed | turn plan (XTK@1.5) | abeam plan (XTK@1.5) |
|---|---|---|
| 119 kt | B 0.39, T6 2.50, r3 2.52; T14 2.70 (landed 0.82 NM before the turn point, decided at the jump) | r5 2.80, r2 2.97, a13 3.05, r4 3.08, q3c 3.43, a14 3.61, a15 4.02, r1 4.58; a11 2.70 (jump landing at 1.49 NM, outcome uncertain: the edit came before its alert was due); T13 2.88 (landed at 1.07 NM) |
| 239 kt | T2 1.58, T3 1.87, T8 2.16, T12 2.30, T10 2.90 | T7 3.14, T11 4.00 |

At 1.33 NM: 119 kt lead <= 2.59 (T6), abeam >= 2.65 (r5, a13); 239 kt lead <= 2.80 (T10), abeam >= 2.95 (T7).

**Verdict.**
- (A) a fixed gate at the nominal point: **ruled out** (T6 2.34 lead against r5 1.69, r2 1.82, a13 1.66 abeam).
- (C) no decision, distance to the arc: **ruled out** (T6 against a15 at al = L; T14).
- (D) track angle or time to intercept: not supported; the track angles of lead and abeam runs overlap (T6 +49..+60,
  r3 +54..+59 lead; a13-a15, r2, r5 +46..+57 abeam).
- **Supported: an earlier decision point.** The plan follows the XTK about 1.3-1.5 NM along-track before the turn
  point, the same distance at both speeds within the data (at 239 kt that is about 20 s, at 119 kt about 40-45 s). A
  fixed time fails: T10 had 3.1 NM 30 s before the turn point at 239 kt and turned; r5 had 2.2 NM 30 s before at
  119 kt and did not. Medium-high that it is earlier than 20 s at 119 kt (seven abeam runs with nominal XTK 1.66-2.05
  against T6 and r3); medium for the distance itself (if the gate is about 2.85, the decision lies between about 1.45
  NM, from a13/r2, and 2.2 NM, from T8/T3, before the turn point).
- **The gate looks slightly speed dependent (B).** At a common distance a single XTK gate cannot pass T10 (239 kt,
  2.80 at 1.33 NM, 2.90 at 1.5) and fail r5 (119 kt, 2.65 at 1.33, 2.80 at 1.5). Separately: 119 kt about 2.6-2.7 NM
  (T14 2.70 lead and a11 2.70 abeam straddle it), 239 kt about 2.8-2.9. The gap is 0.1-0.2 NM, two display steps, so
  low-medium. An alternative that fits both speeds within the display resolution: the distance to the normal turn arc
  at the decision point at most about 3.1 NM (at 1.5 NM: T10 3.13 lead, r5 3.12 abeam, T6 2.85 and r3 2.87 lead, r2
  3.28, a13 3.35, T7 3.36 abeam; T13, landing inside the range with 3.05, does not fit it). Not separated.
- For the simulation, the smallest change consistent with the flown-in runs: decide at along-track L + 1.5 NM instead
  of L + 20 s of GS, with a gate of about 2.7 NM (r5, 2.80 at 1.5 NM, then falls on the abeam side as observed; T10
  at 239 kt would fall on the wrong side by 0.2 NM). Pinning the speed dependence needs 239 kt runs with XTK 2.6-3.0
  about 1.5 NM before the turn point; not flown today (each GS change costs about 2 min of clicks).
- The turn-plan alert: about 20 s of along-track closure before the turn start (r3: 16.8 wall s, al 2.34 with TK
  54 deg off the DTK), not at the decision point.

**Driving notes for Q1.** No way to hold a steady offset was found: the cursor on NAV 1 or on FPL 0 does not stop the
take-home steering (j1); an FPL 0 delete snaps the heading to the DTK, but the aircraft turns back to a 20-30 deg
intercept within about 10 s (j1, q3c2). A jump with HDG = DTK gives about 5 s of parallel flight, then 50-60 deg of
intercept at 119 kt, so converging passes with the XTK sampled at each candidate moment were used. A jump 2.2 NM
before 8U with a 124 deg heading change (p1) put the unit into a turn at once, with line 2 about the distance to the
outbound leg line, while the take-home diverged: avoid jumps close to the waypoint with large heading changes.
Two-jump starts (21 NM before 8T on course, then the start point) avoid the transient.

## Q2 (#439): the abeam plan's late normal-arc turn and the zero turn at the abeam line

Every abeam-plan turn start (from `q2tab.txt`; arcD from the reconstruction, in brackets line 2 = the unit's value):

| run | gs | wpt | al at start | XTK to leg | arcD (line 2) | arc | arcD before the start |
|---|---|---|---|---|---|---|---|
| a13 | 119 | 8T | 1.98 | 0.95 | 0.96 (0.95) | normal | reached at L |
| r5 | 119 | 8T | 1.90 | 0.87 | 0.89 (0.88) | normal | 1.00 at L |
| r2 | 119 | 8T | 1.78 | 0.90 | 0.92 (0.91) | normal | 1.03 at L, 0.97 after |
| q3c | 119 | 8T | 1.77 | 0.94 | 0.95 (0.94) | normal | 1.10 at L |
| a15 | 119 | 8T | 1.46 | 0.88 | 0.97 (0.97) | normal | 1.29 at L, hovering 0.95-1.0 for 8 s |
| r1 | 119 | 8T | 0.91 | 0.79 | 1.17 (1.20) | normal | 1.74 at L, decreasing to 1.16; closing rate about 0 at the start |
| r4 | 119 | 8U | 0.78 | 0.81 | 0.81 (0.84) | normal | 0.96 at L |
| T13 | 119 | 8U | 0.15 | 0.78 | 1.07 (1.10) | normal | plateau 1.06-1.10 for 8 s |
| T11 | 239 | 8X | -0.02 (abeam) | 0.60 | 0.84 (0.87) | normal | 1.11 at al 0.7 |
| T7 | 239 | 8V | 0.00 (abeam) | 0.85 | 1.43 (= d) | zero | minimum about 1.40 |
| C | 119 | 8U | 0.00 (abeam) | 1.20 | 1.50 (= d) | zero | minimum about 1.49 |
| T5, R2, R6, D | both | | 0.00 (abeam) | 1.7-3.5 | 2.9-4.6 (= d) | zero | above 2.9 |
| after edits: a14e | 119 | 8T, next 8R | 0.68 | 0.87 | 1.04 (1.10) | normal | |
| q3c2 | 119 | 8T | 0.71 | 0.84 | 1.34 (1.40) | normal | plateau 1.31 |
| a16e | 119 | 8T | 0.29 | 0.96 | 1.72 (1.70) | normal | growing 1.55-1.72 since the edit |
| a8e, a10e | 119 | 8T | 0.00 (abeam) | 1.5, 1.2 | 2.33, 1.70 (= d) | zero | |

**Settled (high).** On the abeam plan the turn never starts before al <= L; a late start always uses the normal arc
(line 2 = distance to the circle tangent to both legs at L), in the runs without edits with arcD 0.8-1.2 NM. The zero
turn at the abeam line came only when the aircraft had never been closer than about 1.4 NM to the arc. A late
normal-arc turn sequences at the bisector (bearing before the sequencing r1 291, r2 290, r5 289, q3c 290, q3c2 289
for the 8T bisector 289; r4 093 for the 8U bisector 095) and its alert ends at along-track L past the waypoint as for
any turn: r1, r2, r5, q3c 1.92 for L 1.98; r4 0.90 for 1.09 (T11 1.04 for 1.07, T13 1.00 for 1.08). After an edit
it ended earlier (a16 1.32, q3c2 1.62 for L 1.98).

**Not settled: the trigger.** No fixed threshold on arcD, on XTK to the leg or on al separates start frames from the
frames before them: r2 did not start at arcD 1.03 (at L) but did at 0.92; r1 started at 1.17-1.20; r4 did not start at
0.96 but did at 0.84; a15 hovered at 0.95-1.0 for 8 s before starting at 0.97. A candidate that fits every no-edit run:
**start the normal arc when arcD has fallen to about 0.9-0.95 NM, or when arcD stops decreasing (closest approach) at
no more than about 1.2 NM; otherwise fly the zero turn at the abeam line** (r1 and T13 start at their closest
approach, 1.17 and 1.07; T7 and C reach their minimum at 1.40 and 1.49 and get the zero turn). Low confidence: it is
fitted to these runs, and it does not explain the post-edit cases (a16e started at 1.72 while arcD was growing, a10e
got the zero turn at 1.70), where the take-home heading snap after the edit changes the geometry. A run that would test
it: an abeam pass flying parallel at 1.1-1.3 NM after al = L (closest approach to the arc at al = L, then growing):
the candidate predicts the normal arc at about al = L, a fixed 0.95 threshold the zero turn.

## Q3 (#440): edits in front of the active waypoint

The unit today re-picks the closest leg and drops all turn state. Predictions per case: "kept" = turn state and alert
continue as without the edit; "re-pick" = the closest leg, a new decision, no run-out alert.

| case | run | edit | observed | reading |
|---|---|---|---|---|
| 3a | q3a | 8T on course, 119 kt; 8V (flown, before the FROM 8U) deleted about 10 s into the turn (d 1.7; the turn started at d 2.0) | first NAV 1 frame 5.5 s later: DTK 094 (the turn), line 2 0.10 (arc), alert on; sequencing at the bisector (bearing 290, bisector 289); alert end at along past 1.92 (L 1.98): identical to an undisturbed pass | consistent with "kept" and with "dropped and restarted at once" (on course the closest leg is the inbound leg and the aircraft is inside L, so a new decision gives the same turn); not separating |
| 3b | q3b | 8S on course (171 L, L 1.98); 8U deleted 6.8 s after the 8S sequencing, during the run-out | arrow steady from the first NAV 1 frame (12.3 s after the sequencing) and afterwards; DTK 284; line 2 0.07, growing to 0.45 | the run-out alert was **dropped**: in the undisturbed 8S pass of 2026-10-20 (run120) the arrow kept flashing until 32.5 s after the sequencing |
| 3b | q3b2 | same, 8Y deleted 1.8-2.0 s after the sequencing | arrow steady from the first NAV 1 frame, 5.3 s after the sequencing | same: **dropped**. Medium-high (two runs); whether line 2 switched from the arc to the leg cannot be read, the 171 deg arc ends on the leg DTK |
| 3c | q3c2 | abeam plan (XTK@1.5 about 3.4); 8X (flown) deleted at al 2.3 with XTK 1.5 | take-home heading snapped (TK 340 to 307); no alert and no turn at al = L (XTK 1.5 there); late normal-arc turn at al 0.71, line 2 1.40; sequencing at the bisector (289); alert end at along past 1.62 | the abeam plan was **kept**; a new decision at the edit (XTK 1.5, inside the decision range) would have given the turn plan and a turn at al = L. Medium (one run; agrees with a8 and a16 of 2026-10-27, where next-leg edits also kept the abeam plan) |
| 3d | - | not flown | | 3b suggests the run-out alert of a zero turn is dropped as well; untested |
| 3e before a turn | q3e | 8T on course, 6.8 NM before 8T; the FROM 8U deleted | at once: active leg 8T to 8S (8T skipped), DTK 094, XTK 3.3, 32 NM to 8S; take-home snapped to 094 | **closest-leg re-pick**: the aircraft was 3.6 NM from the 8T-8S segment and 5.4 NM from the new 8V-8T segment (one run; the closest leg happened to be the next one) |
| 3e during a turn | q3e2 | 8S on course; the FROM 8T deleted about 2 s after the 8S turn start (d 1.9) | 8S sequenced in the same 250-ms frame as the delete (an undisturbed pass sequences about 12 s after the turn start); 8S to 8R active, line 2 0.26; no alert afterwards (arrow steady 3.5 s later) | **closest-leg re-pick**, turn state and run-out alert dropped (one run) |
| 3f between FROM and TO | q3e | on 8T to 8S, 26 NM before 8S, not in a turn; 8Q inserted between the FROM 8T and the TO 8S | the inserted waypoint became the TO: 8T to 8Q, DTK 097, 138 NM; deleting 8Q again restored 8T to 8S | FROM kept, the new waypoint becomes active (one run each) |
| 3f in front of FROM | q3e, q3e2 | 8U inserted between 8V and the FROM 8T while flying 8T to 8S; 8T inserted in front of the FROM 8S while flying 8S to 8R; neither in a turn | nothing changed: same leg, XTK 0.37 continued, no message | kept, but not in a turn, so not separating |
| 3g | - | not flown | | |

**Reading for #440.** The trainer does not simply drop everything at an edit in front of the active waypoint: the
active waypoint's latched abeam decision survived (3c), as it survived next-leg edits on 2026-10-27. But the turn state
left over from the previous waypoint (its run-out alert) was dropped (3b, twice), and deleting the FROM waypoint
re-oriented on the closest leg before and during a turn (3e), which is what the unit does today. Whether the active
waypoint's own started lead-plan turn is kept cannot be told on course (3a), and an off-course lead turn would not tell
either, because a new decision inside L gives the same turn. A model consistent with all of it: an edit that leaves the
active leg (FROM and TO) unchanged keeps the active waypoint's plan and its started turn and drops the previous
waypoint's run-out; an edit that removes the FROM re-picks the closest leg. Medium-low as a whole; 3b and 3c are the
load-bearing runs.

## What was left behind

- KLN 89 trainer: running, maximized, NAV 1 shown, cursor off, flying SET 1 take-home at GS 120 (shown 119) on 8S to
  8R (14 NM to 8R at 18:35), SET 1 HDG 094 as last entered, a message pending. SET 4 turn anticipation DISABLED (as
  found). FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R (checked row by row; the FPL 0 distance column is back on `Dis`).
- Changed from the state found: the trainer had been relaunched before the session and stood at the take-home warning
  with GS 0; it now runs at GS 120. NAV 1 line 2 shows `Fly L/R x.xx` instead of the CDI bar. During the session
  waypoints of FPL 0 were deleted and inserted again (same idents, same order). No user waypoint was created, changed
  or deleted, no numbered flight plan was touched, the AVsoftech trainer was not started, the VM was not started,
  stopped or reset.
- Scratchpad: this folder, with the PNG frames in `scripts/rec/` (about 230 MB).