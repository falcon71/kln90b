# Predictions written before each pass (2026-10-29)

Candidates from `../2026-10-28/analysis/analysis-3.md`: H4 = decided at the first calculation after the leg becomes
active or the position is re-initialized (every SET 1 jump), lead iff XTK <= about 80 s of GS (5.31 NM at 239 kt,
2.64 at 119; bracket 78-85 s: 5.2-5.6 / 2.6-2.8), uncapped, latched; R-A = one decision 45 s before the turn point
with the same gate; H4+4.0 = H4 with abeam latched when a leg change lands above 4.0. lead = alert about 20-23 s of
closure before L and the switch at al = L; abeam = neither, then Rule 2.

## Run 1: T7 repeat (written before the pass)
8V (93 R, L 1.88, rho 1.78 at 239 kt). Position first on the 8T-8S leg (20 NM after 8T, HDG 094, GS 240), then one
jump to 7.7 NM before 8V with 6.0 left (al-L 5.8), HDG 332: a leg change. Expected XTK as T7: about 4.5 at 45 s
(al-L 3.0), 3.7 at 2.1, 3.1 at 1.5, 1.8 at L, about 0.9 before the abeam line.
- H4: abeam (6.0 > 5.3 at the landing): no alert before L, no switch at al 1.88; then Rule 2 (flip with line 2 the
  arc if a check falls after XTK < 1.0 before the abeam line, else the zero turn at the line).
- H4+4.0: abeam.
- R-A: lead (4.5 at 45 s < 5.3): alert about 23 s of closure before L, switch at al 1.88.
Note: today's 239-kt take-home intercepts faster than T7's did (Y, V), so XTK at 45 s may be lower than 4.5; that
only strengthens R-A's lead prediction.

## Run 1 read (written after the pass)
Landing al-L 5.58 with 6.0 (leg change from 8T-8S). XTK 5.25 at al-L 3.5, 4.80 at 3.0 (45 s), 4.40 at 2.5, 4.08 at 2.1,
3.44 at 1.5, 3.02 at 1.0, 2.05 at L. No alert and no switch at L (al 1.88). Alert onset at al 0.82 (15.5 s before the
abeam line, the zero-turn alert as in C), first XTK <= 0.99 at al 0.05, switch 1.25 s later at the abeam line (al
-0.07) with line 2 0.97 = the distance to 8V (zero-size turn), sequencing at bearing 105, alert end at the abeam
line on the new leg (past -0.11). ABEAM; T7 reproduced (its XTK history was even higher than T7's at 45 s).
H4: abeam, fits. H4+4.0: abeam, fits. R-A: predicted lead (4.80 at 45 s < 5.31): refuted. Rule 2 at 239 kt: no flip
(0.99 reached 1.25 s before the abeam line).

## Run 3a: 239-kt gate, 5.0 (written before the pass)
8T (150 R, L 3.98). One jump from the 8V-8U leg (leg change) to 8 NM before 8T (al-L 4.0) with 5.0 left, HDG 304.
Expected XTK at the landing 5.0, held for about 0.8 NM.
- H4 (80 s = 5.31, bracket 5.2-5.6): lead.
- H4+4.0: abeam (leg change above 4.0).
- R-A (45 s): lead (about 4.3-4.6 at 45 s).

## Run 3a read (written after the pass)
Landing al-L 3.82 with 5.0 (leg change from 8V-8U). XTK 5.00 at 3.5-3.2, 4.90 at 2.8, about 4.95 at 3.0 (45 s), 4.70
at 2.5, 4.50 at 2.1, 4.07 at 1.5, 3.69 at 1.0, 2.76 at L. No alert, no switch at L: ABEAM. Then the first 239-kt Rule 2
flip: first XTK <= 0.99 at al 1.36 (al-L -2.63), alert 7.5 s later, switch 9.0 s after the 0.99 frame at al 0.76,
before the abeam line, XTK 0.82 before, line 2 jumping to 2.70 (the distance to the rho 1.07 arc), sequencing at
bearing 105, alert end 0.77 before the abeam line on the new leg.
H4 (80 s, 5.31): predicted lead: refuted unless the gate is below 5.0 (75 s). H4+4.0: abeam, fits. R-A: predicted
lead (4.95 at 45 s): refuted.

## Run 3b: 239-kt gate, 4.8 (written before the pass)
As 3a with 4.8 left (leg change from 8T-8S).
- H4 (80 s): lead. H4 with a gate below 4.8 (e.g. 70-75 s): abeam.
- H4+4.0: abeam.
- R-A: lead.
Y2 (same leg, two-jump start, 4.8 at the landing) was lead; an abeam here would separate "leg change" from
"same leg" at the same XTK.

## Run 3b read (written after the pass)
First try (g48a.csv) unusable: the jump fired from inside the 8U turn (2.0 NM before 8U on the 8V-8U leg, the T11
artifact family), the heading went to 302 with TK 291-297 diverging, and the recorder ran out before the turn
point. Second try (g48.csv): positioned 20 NM before 8U first, then the jump. Landing al-L 3.73 with 4.8 (leg change
from 8V-8U). XTK 4.70 at al-L 3.0, 4.50 at 2.5, 4.12 at 2.1, 3.40 at 1.5, 1.77 at L. Alert at al-L 0.91, 19.75 s
before the switch at al 4.02 = L with XTK 1.70, line 2 the arc, sequencing at 290, alert end 3.92 past. LEAD.
H4: lead, fits; with 3a the 239-kt gate at a leg change is in [4.8, 5.0) = 72-75 s of GS (80 s = 5.31 is too high).
H4+4.0: predicted abeam: refuted. R-A: lead, fits (refuted by runs 1 and 3a).

## Run 2: T8 replica (written before the pass)
8U (120 L, L 3.09, rho 1.78 at 239 kt). One jump from the 8T-8S leg (leg change) to 8 NM before 8U (al-L 4.9) with
4.5 right, HDG 065.
- H4 (gate 4.8-5.0 from run 3): lead (4.5).
- H4+4.0: abeam (already refuted by 3b).
- R-A: lead.

## Run 2 read (written after the pass)
Landing al-L 4.70 with 4.5 right (leg change from 8T-8S). XTK 3.80 at al-L 3.0 (45 s), 2.84 at 2.1, 2.14 at 1.5, 1.20
at L. Alert at al-L 1.11, 20.25 s before the switch at al 3.08 = L with XTK 1.20, line 2 the arc, sequencing at
bearing 093 (bisector 095), alert end 3.10 past (L 3.09). LEAD. H4: lead, fits. H4+4.0: abeam predicted: refuted
(second time, after 3b). R-A: lead, fits.

## Run 4: S1 clean, pass 1 (written before the pass)
119 kt, 8T (L 1.98). Position on the 8V-8U leg first, then one jump (leg change) to 5.7 NM before 8T (al-L 3.7) with
2.9 left, HDG 304, no edit. Expected: about 2.1 at 45 s (al-L 1.49), XTK < 1.0 near al-L 0.3.
- H4 (119-kt gate 2.7-2.8): abeam at the landing, then the Rule 2 flip near L: alert less than 12 s before the switch
  at L, or after L.
- R-A: lead (2.1 at 45 s): alert about 20 s of closure before the switch at L.
Read-back: the alert-to-switch interval (S1: 2.0 s; W, S3: 19-21 s); 12-20 s is ambiguous.

## Run 4 pass 1 read (written after the pass)
Landing al-L 3.63 with 2.9 (leg change from 8V-8U, no edit). The take-home intercepted at about 45-50 deg: XTK 2.59
at al-L 3.0, 1.77 at 2.5, 1.27 at 2.1, 0.73 at 1.5 (45 s), first 0.99 at al-L 1.88. Alert at al-L 0.69, 22.25 s
before the switch at al 1.99 = L (XTK 0.21). Lead-looking but masked: XTK was below 1.0 65 s before the switch, so an
abeam decision at the landing plus a flip before the 20-s point gives the same picture. Not decisive (both H4 and
R-A fit). The original S1's slow profile came from its heading-083 start and the delete.

## Run 4 pass 2 (written before the pass), re-planned
Land closer so that XTK reaches 0.99 inside the last 20 s of closure: al 4.1 (al-L 2.1) with 2.9 left, HDG 304.
Expected (P/r3 profiles: about 0.3 NM nearly parallel, then about 1.5 NM of XTK per NM): about 2.3-2.5 at al-L 1.49
(45 s), first 0.99 near al-L 0.5.
- H4 (2.9 at the landing > 2.7-2.8): abeam, then the flip: alert after the first 0.99 frame, less than about 15 s
  before the switch (switch at L if the flip comes before L, else after L).
- R-A (2.3-2.5 at 45 s < 2.64): lead: alert about 20 s of closure before the switch at L, independent of the 0.99
  frame.

## Run 4 pass 2 read (written after the pass)
Landing al-L 2.06 with 2.9. The take-home flew nearly parallel longer than expected: XTK 2.90 at al-L 2.0, 2.70 at
1.49 (45 s), 1.90 at 1.0, first 0.99 at al-L 0.19. No alert before the switch; switch at al 1.93 = L, 9.75 s after
the first 0.99 frame, XTK 0.82, line 2 the arc, alert with the switch: ABEAM plus a flip just before L.
H4: abeam, fits. R-A: with 2.70 at 45 s against 2.64 it also predicts abeam (by 0.06, the display step). Not decisive.
Run 4 stopped after two passes: the 119-kt take-home either converges before 45 s (pass 1, masked) or stays near the
gate at 45 s (pass 2).

## Drift test D1 (written before the pass): moving the active TO waypoint
The take-home always steers back to the active leg, and every SET 1 entry may re-initialize. Moving the leg instead:
the trainer lets a user waypoint in FPL 0 be edited on its USR page (tested on 8R with the unchanged latitude: the
entry was accepted). 8T recorded before: N 44 40.00, W 089 37.00 (USR page, before the pass).
Setup: 239 kt. One jump on course onto the 8V-8U leg 7 NM before 8U (HDG 065, GS 240); the unit sequences 8U
normally with XTK about 0 and activates 8U-8T (H4: lead decided there). On the 8U-8T leg, with the USR 8T page
prepared, enter 8T's latitude 44 48.50 (ENT when the status distance to 8T reads 5.6, i.e. 1.6 NM before the old
turn point), then at once the longitude 089 30.00 (ENT about 20 s later). Computed final geometry: inbound 320,
outbound 104, turn 145 R, L 3.98; at the second ENT the aircraft is about 7.5-8 NM left of the new leg, about 3.3
NM before its turn point. With the 239-kt take-home (about 0.8 NM parallel, then 0.8-1.0 NM of XTK per NM) XTK is
expected about 5.5 at L, above the 239-kt gate (4.8-5.0) all the way.
- H4, lead latched at the activation, edits do not re-decide: LEAD: alert about 20 s of closure before L, DTK
  switch at al = L of the new geometry with XTK about 5.5, line 2 the arc.
- A decision later in flight (any window after the edit, e.g. 45 s before the turn point), or an edit that
  re-decides: ABEAM: no switch at L; then Rule 2 (XTK < 1.0 unlikely before the abeam line) or the zero turn.
Restore 8T to N 44 40.00, W 089 37.00 afterwards.

## D1 read (written after the pass)
Sequencing at 8U normally (02:14:59, XTK 0.04). 8T's latitude (44 48.50) ENT at status distance 5.6 (02:20:41), the
longitude (089 30.00) about 25 s later. First NAV 1 frame (02:21:22): DTK 324, XTK 7.3 (left), d 9.5. The take-home
converged: 6.0 at d 7.2, 4.9 at d 5.7, 4.1 at d 4.5, 3.6 at d 4.0, 2.5 at d 2.6. No switch at the new turn point;
alert onset 02:23:17 (about 15 s before), switch at 02:23:31.7 at the abeam line (bearing 55 against DTK 324) with
line 2 2.1 = the distance to 8T: the zero-size turn. ABEAM.
So "lead latched at the sequencing, edits do not re-decide, no later decision" is refuted. Not separated: "the TO edit
re-decides (XTK 7.3 > gate)" and "a decision later in flight" (XTK about 5.5 at 45 s before the new turn point, also
above the gate). 8T restored afterwards to N 44 40.00, W 089 37.00 (USR page read back).
(Side observation: editing 8T while it was the FROM switched the active leg to 8S-8R.)

## D2 (written before the pass): edit early, converge below the gate before the turn point
As D1, but the 8T edit (same new position N 44 48.50, W 089 30.00) earlier: latitude ENT at status distance 9.0 to
the old 8T, longitude about 20 s later. Computed: about 6.3-6.7 NM left of the new leg at about 7-7.7 NM before its
turn point; with D1's convergence (about 0.64 NM of XTK per NM after 0.8 NM nearly parallel) about 3.4-3.9 at
45 s before the turn point (al-L 3.0), 3.0 at 2.1, 1.6-2.0 at L (above 1.0, no Rule 2 flip before L).
- The edit re-decides (XTK 6.3-6.7 > 4.8-5.0): ABEAM.
- A decision later in flight (45 s before the turn point, or 2.1 NM): LEAD (3.4-3.9 and 3.0 below the gate).
- Latched at the sequencing, no re-decision: LEAD (already refuted by D1).
