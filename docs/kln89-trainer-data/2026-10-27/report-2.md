# Follow-up: question 7 of #408, the plan after an edit of the next leg (2026-10-27, 20:28-21:05)

Follow-up to [report.md](report.md), section 7, at the maintainer's request. Same setup and notation (`t_s` wall
seconds, al = along-track distance to the waypoint on the active leg, "along past" = along-track position on the new leg
past the old waypoint, L = the 2026-10-20 lead at 119 kt). All runs at 8T, inbound 304 from 8U, aircraft on the left
(outside of the right turns). Next leg 8S: 150 R, L 1.98 (capped). Next leg 8R: 132 R, L 1.41. Every start point was
reached by two SET 1 jumps with HDG 304. SET 4 turn anticipation was enabled for the runs and disabled again afterwards;
FPL 0 was restored to 8Z 8Y 8X 8V 8U 8T 8S 8R. Only the KLN 89 trainer was used.

## Candidate rules and predictions

In every case the started turn is dropped at the edit (report.md, sections 4-6).

- (a) The plan is decided again at the edit from the cross track at that moment, with a gate tighter than 2.8 NM.
- (b) The cross track sampled at the original decision is checked against 2.8 NM again.
- (c) An abeam plan is kept; a lead plan is decided again by the normal rule (2.8-NM gate at the decision point of the
  new geometry, or at once when already past it).

Separating run (priority 1): a lead plan decided in flight with XTK 2.0-2.6 at the decision, then an edit while XTK is
still above 1.7. (a) predicts an abeam pass after the edit, (b) and (c) a turn at the new lead.

## Priority 1: not achieved (three attempts)

The precondition, a lead plan with XTK above about 1.7 at the decision, could not be produced. In all three in-flight
decisions of this evening the unit did NOT show the lead-plan behaviour of 2026-10-20 (alert about 20 s before the lead,
turn at al = L):

- **a13** (jump 4.3 before, 3.6 left at 20:33; XTK 3.5 at the first frame): the take-home aircraft converged fast; at
  the nominal decision point (al 2.65-2.8) XTK was 1.7-1.8. No alert at all (arrow steady 21.8-130.3 s). Turn at
  129.26 s at al 1.98 = L (d 2.2, brg 330), XTK 0.95. 8R inserted after 8T during that turn (final ENT about 151 s,
  XTK about 0.6, al about 1.5): DTK back to 304 on the first NAV 1 frame (153.51 s, al 1.50, XTK 0.53), new turn at
  154.51 s at al 1.40 = L_new to DTK 076; sequencing 195.26 s; alert end 219.5 s at along past 1.44 (L 1.41).
- **a14** (jump 4.3 before, 4.4 left): XTK 2.0-2.1 at the nominal decision point (al 2.65-2.8, 20:43:04-09); no alert
  (steady 10.5-127.3 s). 8R inserted after 8T at about 140-147 s (before any turn); first NAV 1 frame 149.0 s: DTK 304,
  XTK 1.2, al 1.93. The take-home heading snapped to 303-304 right after the edit (TK 338 to 303), so XTK then fell only
  slowly. No turn when al passed 1.41 (about 165 s, XTK about 1.2). Turn at 191.76 s at al 0.68 (d 1.1, brg 356, XTK
  0.9 to the leg; line 2 then 1.1 = the distance to the normal 132-deg arc), flashing from 192.5 s; sequencing 235.00 s
  at bearing 281-075 (new bisector 100/280); alert end 272.0 s at along past 1.34.
- **a15** (control, same start as a14, no edit): XTK 2.0-2.1 at the decision point again, no alert (steady 10.5-167.3 s),
  **no turn at al = L = 1.98** (XTK about 1.4 there), turn at 167.00 s at al 1.46 (d 1.7, brg 335, XTK 0.97; line 2 then
  the distance to the normal 150-deg arc), flashing from the turn start; sequencing 216.75 s at bearing 289 (bisector);
  alert end 243.3 s at along past 1.82 (L 1.98).

a15 shows that a decision at XTK about 2.0 gave the abeam plan this evening (no lead turn, a late start on the normal
arc), so a14 was an abeam pass before the edit and cannot separate the rules. a13 turned at al = L, but without the
usual alert, and with XTK 0.95 there; it may have been a lead plan or the same late start that happened to fall at L
(a14 and a15 started their late turns about 1.04-1.06 NM from the normal arc, a13 was 0.95 NM from it at L). Its edit
was made at XTK about 0.6, below the range that matters.

Why the precondition fails: off course at 119 kt the take-home aircraft intercepts steeply, so XTK falls by 1.5-2 NM per
NM of along-track distance before the window, and decisions at XTK 1.7-2.1 gave no lead plan. Rereading T6 of
2026-10-20 (the lead pass credited with 2.41 at the decision) shows its alert started only at 292.3 s with XTK 1.7-1.8
(al 2.3), so the lead plans seen at 119 kt in flight had XTK of about 1.8 or less at the alert. The 2.8-NM gate of
2026-10-20 rests on 239-kt passes and on jumps inside the window. With lead plans available only below about 1.8 NM, an
edit "with XTK still above 1.7" cannot follow one at 119 kt; a 239-kt version at 8T does not help either, since 8S and
8R then have the same capped lead (3.98).

## Priority 2: clean repeat of a8 (done once)

**a16**: next leg 8R (L 1.41). Jump 3.0 before, 3.8 left at 20:59:3x; first frame d 4.7, XTK 3.8, al 2.6; at the
decision window (al 2.1-2.2, 21:00:15-20) XTK 2.9-3.0; no alert; no turn when al passed 1.41 (21:01:03, XTK 1.7): abeam
plan. 8S inserted after 8T (L 1.98) with the final ENT at about 135-137 s; first NAV 1 frame 138.50 s: d 1.1, XTK 0.98,
al 0.53 (well inside the new lead). The take-home heading snapped to 303 after the edit. **No turn at the edit**;
arrow steady to 141.0 s, flashing from 141.0 s; turn at 146.00 s at al 0.29 (d 1.0, brg 017, 73 deg off the course;
line 2 then 1.7 = the distance to the normal 150-deg arc, not d); sequencing 203.00 s at bearing 289 (the new
bisector); alert end 241.3 s at along past 1.32.

Predictions: (b) and (c) an abeam pass (decision XTK 2.9-3.0 above 2.8; abeam plan kept); (a) an abeam pass if the
gate is below the 1.0 NM at the edit, otherwise an immediate turn. Observed: no turn at the edit, so the same as a8.
Different from a8: the turn came 0.29 NM before the abeam line on the normal arc, not at the abeam line on the zero arc.

## Priority 3: not flown

No run tried a lead plan decided below 2.8 NM whose cross track had grown above 2.8 by an edit before the new decision
point. Like priority 1 it needs a lead plan off course, which could not be produced.

## Verdict

- **An abeam pass stays an abeam pass after an edit of the next leg: medium-high confidence** (a8 and a16, two runs:
  no turn at the edit although the aircraft was inside the new lead, 1.7 and 1.0 NM off the leg).
- **(a) against (b)/(c): not separated.** All edits fit all three rules. If (a) holds, its gate lies between about 0.6
  NM (a13, a lead-type turn after the edit, if that was a lead plan at all) and 1.0 NM (a16, abeam). (b) and (c) fit
  every run.
- **New, and more important for the model: the lead-plan gate is not a fixed 2.8 NM at 119 kt in flight.** a14 and
  a15 decided the abeam plan at XTK 2.0-2.1 (a15 without any edit), and the 119-kt lead passes of 2026-10-20 had XTK
  about 1.8 or less when their alert started. Medium confidence; the 2.8-NM figure may come from 239-kt passes and
  from jumps into the window.
- **The abeam-plan turn start is not simply the abeam line.** It came at al 0.68 (a14), 1.46 (a15), 0.29 (a16) and
  0.17 (T13) on the normal arc, and at the abeam line on the zero arc in other passes (a8, a10, T5, T7, R2, R6). In a14
  and a15, and in T11 and T13, the aircraft was 0.87-1.06 NM from the normal arc when the turn started; in a16 it was
  1.7 NM. No rule found.
- **The alert-end rule of report.md, section 1, held for a13-a15** (along past 1.44, 1.34, 1.82 for L 1.41, 1.41,
  1.98). It did not hold for a16: that late normal-arc turn ended at along past 1.32 for L 1.98.

## Driving notes

- The take-home aircraft snaps to the leg course after an FPL 0 edit (a14, a16), which keeps XTK roughly constant for
  the rest of the pass. That is useful for holding an offset: an edit (even a no-op) right after the jump could freeze
  XTK. It was not tried.
- Two-step SET 1 jumps (about 3 min of clicks each pair) worked four times out of four.

## End state

- Trainer running, maximized, NAV 1, cursor off, flying SET 1 take-home at GS 120 (shown 119) on 8T to 8S (34 NM to 8S
  at 21:05), SET 1 HDG 304 as last entered, a message pending.
- SET 4 turn anticipation DISABLED and FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R, both as at the start of the follow-up. No user
  waypoints or numbered plans changed. The AVsoftech trainer was not used.