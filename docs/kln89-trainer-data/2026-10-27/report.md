# KLN 89 trainer check: end of the waypoint alert, edits next to the active waypoint, same-second updates (2026-10-27, 18:41-20:18)

Agent check for #406, #407 and #408 in the KLN 89 trainer (VM "Windows 98"), SET 1 take-home flying at 119 kt shown,
SET 4 turn anticipation enabled unless noted. Setup, flight plan, glyphs and the run list are in [README.md](README.md).
Times are the `t_s` wall seconds of each run's CSV (the trainer runs about 6 % slow). "al" is the along-track distance
to the waypoint on the active leg (d cos(brg - DTK)); "along past" is the along-track position on the new leg measured
from the old waypoint (leg length - sqrt(d^2 - XTK^2)). L is the 2026-10-20 lead (r tan(turn/2), r = standard rate
capped at 25 deg bank, L capped at 60 s of GS and at half the inbound leg). Only the KLN 89 trainer was used; the
AVsoftech 90B trainer was not needed. Nothing in the repository was changed except this folder; nothing was posted.

Before flying, the 2026-10-20 CSVs were re-read for questions 1, 3 and 9; they answer those (sections 1, 3 and 9), and
the new runs were spent on questions 2 and 4 to 8, plus one turn-anticipation-off check for 9.

## Summary

| # | question | answer | confidence |
|---|---|---|---|
| 1 | what ends the alert after an abeam-plan sequencing | the aircraft passing the exit point of the turn arc in use, i.e. the along-track position past the waypoint on the new leg reaching the L of that arc; for an abeam turn flown with the zero-radius arc (line 2 = d) that is the abeam line of the waypoint on the new leg (along past = 0). Not the track angle, not the cross track, not a time | high |
| 2 | aircraft that does not come onto the new course | the alert stays on as long as the exit point is not passed: about 3 min at 10 kt in a1 (still on when GS was restored), with NAV 1 TK up to 120 deg off the new DTK; it ended once the aircraft passed along past 1.0 NM (L 1.08). GS 0 and more than 4 NM from the new leg were not flown | high for "geometric, not a time"; not tested beyond 4 NM |
| 3 | same rule after an ordinary turn | yes: every on-course and every lead-turn pass ends at along past = L (to 0.1-0.2 NM), the second tangent point of an arc with lead L on both legs; the track is then within 5 deg of DTK only for uncapped turns up to 120 deg | high |
| 4 | next leg changed after the alert onset, before the turn start | the old lead is dropped; the turn starts at the new lead (a3, a4), or at once when the aircraft is already inside the new lead (a6). When the new turn point is more than about 20 s away the alert stops at the edit and starts again about 20 s before it | high (new lead), medium-high (alert pause, 2 runs) |
| 5 | insert during a started turn | DTK goes back to the inbound leg (first NAV 1 frame, within 4 s of the edit), a new turn starts at the new lead, the waypoint is sequenced at the new turn's bisector, and the alert ends at the new arc's exit | high on course (a2; a5 the same for a delete); off course see 7 |
| 6 | delete the next waypoint during a turn | the same as 5 (a5). When the active waypoint becomes the last (a9): DTK back to the inbound leg, the alert stops, comes back about 15 s before the waypoint and ends abeam of it; no sequencing | high (a5), medium (a9, one run) |
| 7 | abeam plan, then the next leg changed before the abeam line | the unit still waited for the abeam line (a8): no turn at the edit although the new lead was already passed; the turn came at the abeam line onto the new leg. In a10 an edit during a lead turn started off course (XTK 1.8) also ended in an abeam pass. What decides the plan after an edit is not settled | medium (abeam kept), low (the rule) |
| 8 | control: edit beyond the next waypoint during a turn | nothing changed (a7): DTK kept, sequencing at the old bisector, alert end at the old arc's exit | high (one clean run) |
| 9 | same-second updates | yes: at every sequencing and turn start the new ident, distance, bearing, ETE, DTK and message prompt appear in the same 250-ms frame; the XTK line changes in that frame or up to 0.5 s earlier, never later; TO/FROM of the new waypoint is "To" from that frame. Also with turn anticipation off (a12) | high |

## 1. #406 question 1: what ends the alert after an abeam-plan sequencing

**Answer.** The arrow stops flashing when the aircraft passes the end of the turn arc the unit is flying: the
perpendicular to the new leg at along-track L past the old waypoint, where L is the lead of that arc. After an abeam
switch whose arc is degenerate (line 2 shows XTK = distance to the waypoint, as in R2, R6, C, D, T5, T7 of 2026-10-20
and today's a8 and a10), L is zero and the end is the abeam line of the old waypoint on the new leg. After an abeam
switch where the unit flies the normal arc started late (line 2 shows the distance to the r-arc, not d: T11, T13), the
end is at along past = L of that arc.

**Evidence** (2026-10-20 CSVs re-read; `along past` at the first steady-arrow frame; TK - DTK and XTK at that frame):

| run | wpt, GS | plan, arc | L | along past at end | TK - DTK | XTK at end | s after seq |
|---|---|---|---|---|---|---|---|
| R6 | 8T 150 R, 239 | abeam, zero arc | 0 | -0.12 | -4 | 2.1 | 41.0 |
| R2 | 8T 150 R, 119 | abeam, zero arc | 0 | -0.17 | +3 | 1.1 | 52.8 |
| D (run120 3479) | 8T 150 R, 119 | abeam, zero arc | 0 | -0.07 | +2 | 1.0 | 48.0 |
| C (run120 2842) | 8U 120 L, 119 | abeam, zero arc | 0 | -0.08 | +8 | -0.96 | 30.0 |
| T5 | 8U 120 L, 239 | abeam, zero arc | 0 | -0.13 | +12 | -2.0 | 29.5 |
| T7 | 8V 92 R, 239 | abeam, zero arc | 0 | -0.10 | -39 | 1.7 | 19.8 |
| T11 | 8X 62 L, 239 | abeam, normal arc | 1.07 | 1.04 | +11 | -1.4 | 26.5 |
| T13 | 8U 120 L, 119 | abeam, normal arc | 1.08 | 1.00 | -32 | 0.03 | 49.8 |

In T11 the arrow kept flashing for 20 s after the aircraft had crossed along past = 0 (218 s) and stopped at 1.04
(238.5 s), while the aircraft was moving away from the new leg (XTK -0.9 to -1.4). In T7 it stopped at along past = 0
with the track 39 deg off and XTK 1.7. Today's a10 (abeam switch, zero arc) ended at along past -0.02 (209.0 s), and a6
(a lead turn) ended at 1.92 for L 1.98 with TK 46 deg off and XTK -0.05 (208.0 s).

**Rejected:** track within about 5 deg of DTK (ends at 11 to 46 deg off: T7, T13, T2, T12, a1, a6); cross track below a
value (ends at XTK 1.4 to 3.0: T5, T7, T11, R6, run240 8S); a fixed time after the sequencing (3 to 87 s, and more than
3 min in a1); L recomputed from the current GS (a1, section 2). A rule on the distance to the new waypoint instead of the
along-track position cannot be told apart here (they differ by XTK^2/2d, under 0.13 NM in these runs).

**Unsettled.** What makes an abeam switch fly the zero arc or the normal arc. In the two normal-arc cases the aircraft
was 0.87 NM (T11) and about 1.05 NM (T13) from the normal arc at the switch; in the zero-arc cases 1.4 NM (T7) and more
(C 1.5, a10 1.7, a8 2.3, T5 3.0, R6 4.6). A threshold between about 1.1 and 1.4 NM from the arc fits, but it was not
tested. It decides whether the alert ends at the abeam line or L further on.

## 2. #406 question 2: when the aircraft does not come onto the new course

**Run a1** (8U, 120 L, on course, 119 kt, L 1.08). Turn start about 142 s (status column `M`, d 1.0), sequencing
163.25 s (status column 8T). GS 10 kt was staged on SET 1 and applied at about 168 s; NAV 1 from 171.75 s showed 10 kt,
DTK 305, the arrow flashing. It was still flashing on every NAV 1 frame up to 251.25 s (88 s after the sequencing; the
page was left at 227.5-235.5 s for a look at SET 1) and again at 344.5 s, when the cursor came off SET 1 after the GS
had been set back to 120 (343 s). At 10 kt the aircraft did not progress along the new leg: d to 8T went from 27.4 to
27.6 (along past from about 0.6 down to 0.4); SET 1 showed heading 357 while NAV 1 showed TK 175-182, so the take-home
motion at that speed is not meaningful; NAV 1 TK was up to 120 deg off DTK. With 119 kt again the arrow went steady at
372.0 s with d 27.0 (along past 1.0; last off phase 371.75 s), TK 317 (12 deg off) and XTK 0.03.

What this shows: the alert is not ended by a time; it stayed on for about 3 min while the exit point was not reached.
It also shows that L is the value of the turn as started (119 kt), not one recomputed from the current GS: at 10 kt
the lead would be about 0.05 NM, already passed at the sequencing.

**Other cases in the data:** in q2b (171 L after the 2-NM leg, 239 kt) the aircraft overshot and flew away from the new
leg (along past went from +1.5 to -0.6 NM, XTK to 2.2 NM) and the arrow flashed for the 33 s until the page was left.
Sequencings without a turn give no alert afterwards: the regime-B abeam sequencings of 2026-10-20 (E, F, R1, R3, R4),
today's a11 (an edit that sequenced the waypoint at once) and a12 (turn anticipation off; the alert ended at the
sequencing).

**Not flown:** GS 0 (10 kt was chosen so that TK stays defined; TK turned out unreliable anyway) and an abeam-plan pass
that ends more than 4 NM from the new leg. A take-home pass cannot be held away from the leg; it would take a SET 1
re-initialization, which resets the navigation state and would not be a clean test.

## 3. #406 question 3: the same rule after an ordinary turn

On-course turns of 2026-10-20 (`along past` at the alert end against L; TK - DTK):

| run | wpt | GS | L | along past | TK - DTK | s after seq |
|---|---|---|---|---|---|---|
| run240 | 8Y 31 R | 239 | 0.50 | 0.56 | -3 | 8.8 |
| run240 | 8X 62 L | 239 | 1.07 | 1.08 | +4 | 16.2 |
| run240 | 8V 92 R | 239 | 1.85 | 1.74 | -5 | 22.5 |
| run240 | 8U 120 L | 239 | 3.09 | 3.10 | +5 | 29.5 |
| run240 | 8T 150 R | 239 | 3.98 (cap) | 3.95 | -12 | 44.2 |
| run240 | 8S 171 L | 239 | 3.98 (cap) | 4.02 | +6 (XTK -3.0) | 69.0 |
| run120 | 8Y 31 R | 119 | 0.17 | 0.16 | +11 | 6.5 |
| run120 | 8X 62 L (2 passes) | 119 | 0.38 | 0.28, 0.38 | +5, -2 | 10.0, 11.0 |
| run120 | 8V 92 R | 119 | 0.65 | 0.54 | -6 | 15.2 |
| run120 | 8U 120 L | 119 | 1.08 | 1.00 | +2 | 21.8 |
| run120 | 8T 150 R | 119 | 1.98 (cap) | 1.92 | -3 | 23.3 |
| run120 | 8S 171 L | 119 | 1.98 (cap) | 1.92 | +8 | 32.5 |
| q2b, q2c | 8S 171 L after 2.0 / 3.0 NM legs | 119 | 1.0 / 1.5 (half leg) | 0.93 / 1.43 | +16 / +20 | 34.5 / 31.2 |

Off-course lead turns end the same way (T2 0.47 for L 0.50 with TK 29 deg off; T3, T8 3.00-3.10 for 3.09; T6, T14 1.92
for 1.98; T10 0.98 for 1.07 with TK 17 deg off; T12 3.92 for 3.98 with TK 19 deg off), and so do today's turns (a2 0.28
for 0.27, a3 and a5 0.09 for 0.09, a4 0.11 for 0.12, a6 1.92 for 1.98, a7 1.00 for 1.08).

So the end is the second tangent point of an arc with lead L on both legs (symmetric to the turn start), which on an
exact on-course arc is also where the track meets the new DTK. The 5-deg reading of 2026-10-20 is that coincidence for
uncapped turns up to 120 deg; for capped and half-leg-limited leads the track is still 6-20 deg off (or the aircraft has
overshot by 3 NM) when the alert ends. The end lies 0 to 0.2 NM before L in the table, more often at 119 kt; display
rounding (0.1 NM) and the flash cycle (1.25 s) explain up to about 0.1 NM.

**The comparison asked for in the dispatch:** the end coincides with "where a circle tangent to both legs ends" when
that circle is the one with lead L, i.e. with the radius reduced to L / tan(turn/2) where the lead is capped or limited
to half the leg.

## 4. #408 question 4: next leg changed after the alert onset, before the turn start

- **a4** (8V 92 R, L 0.65, on course, XTK 0.2): flashing seen on NAV 1 from d 1.4 (about 100.5 s, ETE :41); 8U deleted
  (next leg becomes 8V to 8T, 21 R, L 0.12) at about 108 s (d 1.1). From the first NAV 1 frame (110.5 s) the arrow was
  steady until 116.5 s (d 0.8, ETE :25), then flashing again; no DTK change at d 0.65 (about 123 s); turn start 140.26 s
  (d 0.2, XTK 0.16, al 0.12) to DTK 353; sequencing 145.01 s at the waypoint; alert end about 148.8 s (along past 0.11).
- **a3** (8U 120 L, L 1.08): 8T deleted at d 1.4 (about 106 s; next leg 8U to 8S, 16 L, L 0.09); the onset was not seen
  because the edit was staged on FPL 0. From 112 s the arrow was steady (to 129.75 s), flashing again from 130.0 s (d
  0.8, ETE :22); no turn at d 1.08; turn 151.75 s (d 0.1, ETE :03) to DTK 049; sequencing 155.75 s; alert end 159.3 s
  (along past 0.09).
- **a6** (8V, L 0.65): flashing from d 1.3 (100.5 s); 8Y inserted after 8V (148 R, L 1.98, longer than the 1.0 NM left)
  at about 114.8 s (d 0.9). First NAV 1 frame 119.01 s: DTK already 184, XTK -0.74 (to the new arc), flashing;
  sequencing 121.50 s with the bearing at 348 To (the new turn's bisector; the old one was 288); alert end 208.0 s at
  along past 1.92 (L 1.98).

**Answer.** The turn is computed again from the new next leg: the new lead is used (shorter or longer than the old
one) and the old lead does nothing. The alert is recomputed with it: when the new turn point is more than about 20 s
away the arrow goes steady at once and starts flashing again 22-24 s before the new turn start (both runs); when the
new lead is already behind the aircraft the turn starts at once. Had the decided turn been kept, the switch would have
come at d 0.65 (a4) and d 1.08 (a3); it did not.

## 5. #408 question 5: insert after the active waypoint during a turn

- **a2** (8V 92 R on course, L 0.65): turn start about 129.25 s (status column `M`, d 0.7). 8R inserted after 8V (next
  leg 018, 46 R, L 0.27) at 134.75 s (d 0.5, 5.5 s into the turn). First NAV 1 frame 138.75 s: DTK 332 (the inbound
  leg again), TK 338 (the aircraft had started to turn), flashing. New turn start 142.50 s (d 0.3, ETE :08) to DTK 018;
  sequencing 151.50 s (d 0.1, bearing 274 To in the frame before), 9 s after the new start, which is the half-arc time
  of a 46-deg standard-rate turn; the old 92-deg turn would have sequenced at about 146 s. Alert end 159.25-160.0 s at
  along past 0.28 (L 0.27), TK = DTK.
- **a10** (off course, see section 7): the insert during a started turn also put DTK back on the inbound leg (304).

**Answer.** The started turn is dropped and DTK shows the inbound leg again, from the first NAV 1 frame after the edit
(within 4 s; the edit itself was made on FPL 0, so the exact second is not visible). A new turn for the new next leg
starts at its own lead (at once when already inside it, a6). The active waypoint is sequenced at the bisector of the
new turn (a2, a6, a8, a10: bearing at the sequencing within 1-2 deg of the new bisector, or at the waypoint for small
turns), and the alert ends at the new arc's exit. When the aircraft is already beyond the new turn's bisector at the
edit, the waypoint is sequenced at once (a11: 8Y inserted after 8V with the aircraft 1.7 NM off and al 0.9; the status
column showed 8Y active in the frame after the edit, with no alert afterwards).

## 6. #408 question 6: delete the next waypoint during a turn

- **a5** (8U 120 L, L 1.08): turn start about 119 s (d 1.1); 8T deleted at about 125 s (d 0.9), so the next leg is 8U
  to 8S (16 L, L 0.09). First NAV 1 frame 130.76 s: DTK 065 (inbound), flashing; new turn 153.50 s (d 0.1) to DTK 049;
  sequencing 155.76 s at the waypoint (the old turn would have sequenced at its bisector about 21 s after 119 s); alert
  end 158.8 s (along past 0.09).
- **a9** (8S 171 L, L 1.98): turn start about 70 s (d 2.0); 8R deleted at about 75 s, so 8S is the last waypoint. First
  NAV 1 frame 79.0 s: DTK 095 (inbound), arrow steady (no alert) from 79.0 to 124.0 s; flashing 124.0-138.75 s (from d
  0.6, ETE :17, the 15-s alert of a waypoint without a turn), ending when the waypoint was abeam (bearing 182, DTK +
  90 = 185; the aircraft passed 0.34 NM to the side). No sequencing; afterwards DTK stayed 095, distance and ETE counted
  up, and the bearing was still shown as To (190 to 269 deg).

**Answer.** The same as question 5. With the active waypoint left as the last one, the turn is cancelled, the alert
stops, and the waypoint is then treated as an end-of-plan waypoint (alert about 15 s before, ending abeam, no
sequencing).

## 7. #408 question 7: abeam plan, then the next leg changed

- **a8** (8T, next leg 8R 132 R, L 1.41): jump at 6 s to d 4.0, XTK 3.3 left, al 2.0 (inside the decision window, XTK
  above 2.8). Flashing 9.5-37 s (the post-jump burst of 2026-10-20), steady 38.5-61.5 s; no turn when al passed 1.41
  (about 46 s, XTK 2.5): abeam plan. 8S inserted after 8T (next leg 094, 150 R, L 1.98) at about 81 s; first NAV 1
  frame 84.75 s: d 1.8, XTK 1.7, al 0.70. Prediction if the plan were decided again with this XTK and the 2.8-NM gate: a
  lead turn, and since 0.70 < 1.98, at once. Observed: DTK stayed 304, the arrow steady until 92.75 s, flashing from
  92.75 s (18 s before the abeam line), DTK switch at 110.75 s with bearing 035 To (abeam = 034) onto the new leg (DTK
  094), line 2 = d = 1.5 (zero arc), sequencing 165.25 s with bearing 109 To (the bisector of the new 150-deg turn).
- **a10** (8T, next leg 8S 150 R, L 1.98): the jump landed at al 2.12, XTK 3.3 (0.14 NM before the lead), and the unit
  turned at al 1.96 (16.51 s) onto DTK 094: a lead turn with XTK 3.3, which the 2.8-NM gate of 2026-10-20 does not
  allow, probably an artifact of appearing inside the window by SET 1. 8R inserted after 8T (076, 132 R, L 1.41) at
  about 72 s; first NAV 1 frame 75.0 s: DTK 304 (inbound), XTK 1.8, al 1.48. No turn when al passed 1.41 (about 78 s);
  steady arrow until 115.0 s, flashing from 115.0 s (16 s before the abeam line); switch at 131.51 s with bearing 035 To
  onto DTK 076, line 2 = d = 1.2 (zero arc); sequencing 171.51 s at bearing 100 To (new bisector 100); alert end 209.0 s
  at along past -0.02.

**Answer.** An abeam pass stayed an abeam pass after the next leg was changed (a8): the unit did not turn at the new
lead although the aircraft was only 1.7 NM off and already inside it; it waited for the abeam line, turned onto the new
leg there and sequenced at the new turn's bisector. a10 goes further: a lead turn already started was replaced by an
abeam pass after the edit, with the aircraft 1.8 NM off.

**Unsettled.** Two rules fit both runs and all on-course runs (which stayed lead turns):
(a) the plan is decided again at the edit from the cross track at that moment, with a gate somewhere between 0.26 NM
(a6, a lead turn) and 1.7 NM (a8, abeam), much tighter than the 2.8 NM of the normal decision; or
(b) the cross track sampled at the original decision moment (3.1-3.3 NM in both runs) is checked against the 2.8-NM gate
again, and a10's first lead turn was a SET 1 artifact. A run that separates them: a lead turn decided in flight with an
XTK of about 2.0-2.6 NM at the decision (jump at least 1.5 NM along-track before the window), then an edit while the XTK
is still above 1.7 NM; (a) predicts an abeam pass, (b) a turn at the new lead.

**Side observation (a11, inconclusive).** At 8V (92 R, L 0.65, 119 kt) with XTK 2.1-2.4 in the decision window, no
lead-turn alert had started by al 1.17 (XTK 1.9), when the edit was made. A late onset (T6 of 2026-10-20 started only
7 s before the lead) cannot be excluded, so this does not show that the 2.8-NM gate fails here; it may be worth a check
whether the gate depends on L.

## 8. #408 question 8: control, edit further down the plan

**a7** (8U 120 L): turn start about 118-119 s (d 1.1); 8S (after 8T) deleted at about 125 s. First NAV 1 frame
130.01 s: DTK 305 (the turn kept), flashing; sequencing 144.76 s with bearing 093 To (bisector 095), d 0.5; alert end
171.5 s at along past 1.00 (L 1.08), TK 6 deg off. **Nothing changed.** Confidence high for this case (one clean run).

## 9. #407 question 9: same-second updates

**From the 2026-10-20 CSVs** (every sequencing and turn start, frames 250 ms apart): the new active ident, distance,
bearing, ETE and DTK appear in the same frame at every sequencing (run240, run120, T2-T14, R1-R8). At the turn start the
DTK switch and the message prompt come in the same frame (or in the prompt's next on-phase). Where the XTK line jumps,
it changes in the same frame (T11 turn start -0.62 to -0.87; the regime-B sequencings R1 +4.2 to -3.6, R3, q2b 731) or
0.25-0.5 s before the other lines (q2b 295, the turn-anticipation-off pass: line 2 0.5 s early; R4, R5 and q2b 1294:
0.25 s early), never after. The trainer draws its rows at different moments inside one refresh, line 2 first, so this is
one display update. TO/FROM: the new waypoint shows "To" from the frame of the sequencing; no frame shows the old
waypoint as FROM after it, or a stale value next to the new ident.

**New, a12** (turn anticipation off, 8U on course): alert from 67.0 s (d 1.1, ETE :33; 39.5 wall s, about 37 trainer s,
before the sequencing), sequencing at 106.50 s at d 0.0 with ident, distance (28.1), DTK (065 to 305), bearing 305 To,
ETE and the message prompt in one frame; line 2 went from 0.01 to -0.01 in that frame; the arrow went steady at the
sequencing. Today's turn sequencings (a2, a3, a4, a5, a6, a7, a8, a10) show the same single-frame change.

**Answer.** The trainer has no one-second lag: DTK, XTK and TO/FROM refer to the new state from the same display update
as the turn start and the sequencing. Confidence high.

## 10. Driving notes

- The previous helpers were rebuilt: `kln.ps1` (relative COM mouse moves, from memory), `shot.ps1` (cropped COM
  screenshot burst), `rec.ps1` (4 Hz recorder), `ocr.py` (dot-grid template OCR: dot x = 5 + 3.05 k + 1.5 on the
  496x147 crop at (10, 20), line tops 8 + 31.33 l, row pitch 3.43; the big distance digits sit one dot left of the cell
  grid), `watch.py` and `watch_al.py` (fire a key sequence when a screen line matches, or when al falls below a value).
  Templates were labelled by hand from known screens.
- Reading `log.csv` while the recorder appends raises PermissionError on Windows; list the PNG files instead.
- Edits on FPL 0 can be staged: cursor on the row, then `CLR` shows the delete question, or `IR`, ident, `ENT` shows
  the waypoint page; the final `ENT` is then one click at the chosen moment. The insert row always opens with the
  autofill ADAME; `IL*2` gives `8`. From `>Dis`, `OR` steps row by row and scrolls.
- The take-home aircraft seems to stop steering while the FPL 0 cursor is on (a7: no turn for about 12 s after the turn
  start), and after some edits its heading snapped to the active leg (a8 TK 343 to 304, a11 40 to 183). That is the
  trainer's flying, not the unit's logic, but it changes the geometry after an edit.
- SET 1 jumps of 13.5-17 NM applied every time today. A jump landing in the last seconds before the lead gave a lead turn
  at XTK 3.3 (a10): jump at least 1.5 NM along-track before the decision window when the plan matters.
- At 10 kt the take-home position drifted backwards and NAV 1 TK did not match the SET 1 heading (a1).

## 11. What was left behind

- KLN 89 trainer: running, maximized, NAV 1 shown, cursor off, flying SET 1 take-home at GS 120 (shown 119) on 8U to 8T
  (25.6 NM to 8T at 20:18), SET 1 heading 064 as last entered, a message pending (`M`). **SET 4 turn anticipation
  DISABLED**, as found at the start of the session (it was enabled for a1-a11). FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R (the
  plan found at the start, DAF 0 GRB, was deleted). User waypoints and the numbered flight plans were not changed. The
  AVsoftech trainer was not started. VM display 1920x1200 unchanged.
- Scratchpad `trainer\`: the scripts above, `tpl.json`, recordings `rec\a1` to `rec\a12` (PNG frames with `log.csv` and
  `ocr.json`). Delete when no longer needed.