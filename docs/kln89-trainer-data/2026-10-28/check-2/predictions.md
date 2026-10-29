# Predictions written before each pass (2026-10-28 evening)

## W (written 19:36, before the jump)
8T, 304 -> 094 (150 R), L 1.98, 119 kt. Start: al 5.0 (al-L 3.0), 3.2 NM left, HDG 304.
Expected XTK: ~2.8 at al-L 2.5, ~2.2 at 2.0, ~1.5 at 1.5 (arcD ~1.9).
- R1-A (arcD <= 3.1 from al-L <= 1.5) and R1-B (XTK <= 2.65-2.80 from al-L <= 1.4-1.6): LEAD. Alert onset ~20 s of
  along-track closure before L (al about 2.5-2.6), DTK switch to 094 at al ~1.98, line 2 = arc distance.
- Window starting at al-L >= 2.4 (XTK - r <= 2.1 with W 2.2-3.1, or "largest XTK since the leg became active"
  with a 2.75 gate): ABEAM. No alert before L, no switch at L; late normal-arc start once XTK < 1.0 (R2).
- If the actual XTK at al-L 2.5 is well below 2.75 the pass does not separate (both lead); if XTK at al-L 1.5 is above
  ~2.7 it does not test the early-window family either.

## W, read after the pass (19:45)
Lead plan as R1-A/B predicted (alert 19.3 s before the switch at al 2.60, switch at al 1.95). But XTK read 0.99 at
al-L 0.95, 15 s before the alert: an abeam decision in an early window followed by an R2 flip before the turn point
gives the same observation. W does not separate unless the R2 flip is restricted to al <= L. A 239-kt variant (W2)
where XTK stays above 1.0 until L is added after Z (take-home intercept at 239 kt drops XTK only ~0.6 NM per NM).

## P1-P3 (written 19:46, before P1)
r2 repeats: 8T, jump al 3.9, 3.0 NM left, HDG 304, 119 kt. Rule 1: abeam (r2: XTK@1.5 2.97). Then XTK reaches 0.99
some 20-30 s after the turn point.
- R2-A (periodic check, P 10-11.5 s): lag from the first frame with XTK <= 0.99 to the DTK switch uniform in 0-10.5 s;
  XTK at the switch accordingly 0.78-0.99 (0.02 NM/s).
- R2-B (filter, single tau): the same lag every time (+-1 s) and the same XTK at the switch; with r2 4.5 s / 0.90,
  r5 5.0 / 0.87, q3c 4.3 / 0.94, a filter predicts about 4-5 s and 0.87-0.94.
- Caveat: XTK >= 1.0 is shown with 0.1 resolution ("1.0nm" covers about 0.995-1.05), so "first frame <= 0.99" is
  also the display format change.

## P read (20:07)
P1 lag 4.0 s (XTK 0.93 at the switch), P2 10.5 s (0.80), P3 10.0 s (0.81). Same start, same XTK profile within
0.03 NM (2.97 / 2.33-2.36 / 1.82 / 1.03-1.04 at al-L 1.5 / 1.0 / 0.66 / 0), lags 4-10.5 s: not a filter.

## #440 3b' (written 20:08, before the pass)
8U on course from 8V (065 -> 305, 120 L, L 1.09, rho 0.63), 119 kt. FPL 0 8Z 8Y 8X 8V 8U 8T 8S 8R; at the 8U
sequencing (bisector) delete 8X (flown, two before the new FROM 8U) within about 2 s.
- Kept: line 2 continues as the arc distance (near 0), the DTK stays 305, the alert keeps flashing until about 0.9 NM
  past 8U (about 20 s after the sequencing).
- Dropped (closest leg re-picked, turn state cleared): line 2 jumps to the XTK to the 8U-8T leg (about 0.1-0.3 NM at
  that point of the arc, decaying), DTK 305 either way, the arrow goes steady at the delete (as in 3b at 8S).

## 3b' pass 1 read (20:14)
Delete of 8X came 1.8 s after the 8U sequencing (FPL page). First NAV 1 frame 6.3 s after the sequencing: arrow
steady (no flashing), DTK 305, line 2 0.21 growing to 0.36 then decaying slowly, TK 297 (take-home heading snapped
near the DTK) converging on 305 over 40 s like a leg intercept, no turn back onto the arc. Reads as "dropped".

## #440 3a' (written 20:15, before the pass)
T6 replica at 8T: second jump al 3.86, 2.3 NM left, HDG 290 (diverging 14 deg), 119 kt. Expected lead plan (XTK@1.5
about 2.5), turn start at al = L with XTK about 1.2-1.3. Delete 8Y (flown, not the FROM 8U) fired from FPL 0 at a
status distance <= 2.2 NM, about 3-6 s into the turn.
- Kept: DTK stays 094, line 2 = arc distance (about 1.2, slowly falling), alert flashing until 1.9 NM past 8T.
- Dropped and decided again by the analysis rules (al < L, XTK > 1.0 => abeam): DTK back to 304, line 2 = XTK to the
  inbound leg (about 1.2), no alert, a later re-start when XTK < 1.0 (R2), or the zero turn at the abeam line.
- Dropped and re-picked with a fresh lead decision: same as kept (not separable).

## 3a' read (20:22)
Not decisive: the take-home converged faster than in T6 (TK 291 -> 316 within 11 s of the jump), the delete (8Y)
fired at status distance 2.2 with the FPL page shown, and the first NAV 1 frame (4.2 s after the delete) already had
DTK 094, line 2 0.92, XTK to the inbound leg about 0.95. Turn start time unknown, XTK at the delete about 1.0. The
turn went on (alert flashing, line 2 falling as the arc distance). To be repeated at 239 kt, where a lead plan turns
at L with XTK about 2 (T10, T14).

## #440 3d (written 20:23, before the pass)
C replica at 8U (065 -> 305, 120 L, L 1.09): jump al 1.94 (0.85 before the turn point), 3.5 NM right, HDG 065, 119 kt.
Expected: abeam plan, XTK minimum about 1.2, zero-size turn at the abeam line (DTK 305, line 2 = d about 1.2), the
sequencing about 30-35 s later, the alert flashing until about 30 s after the sequencing (C: 2842.5 -> 2872).
Delete 8Z (flown, not the FROM) right after the sequencing (FPL page, status ident 8T).
- Kept: alert keeps flashing about 30 s after the sequencing.
- Dropped (as in 3b, 3b'): arrow steady from the first NAV 1 frame after the delete.

## 3d read (20:36)
Zero turn at the abeam line as in C (DTK 305 at bearing 335, line 2 1.2 = d). 8Z deleted 1.75 s after the sequencing.
First NAV 1 frame 6.3 s after the sequencing: the arrow still flashing (every blank-prompt frame also has the arrow
blank) until about 52 s after the sequencing; the alert was KEPT, unlike 3b/3b'.

## 3b' pass 2 read (20:46)
Same as pass 1: delete 1.75 s after the sequencing, first NAV 1 frame 6.5 s after: arrow steady (frames "A."), DTK
305, line 2 0.22, TK 297. Dropped.

## Z re-planned (20:55)
The specified Z (8V, 8 NM before, 4.5 NM left, 239 kt) would by T7's 239-kt intercept (about 0.87 NM of XTK per NM)
reach XTK about 1.6 at al-L 1.5: the lead plan, no test of Rule 2. Flown instead at 8T (150 R, L 3.98, rho 1.07 at
239 kt; abeam line at al 0, 4 NM after the turn point): jump al 6.5 (al-L 2.5), 3.6 NM left, HDG 304.
Expected: XTK at al-L 1.5 about 3.3 (abeam by R1-A and R1-B), then XTK < 1.0 around al 2, about 40 s before the abeam
line.
- R2-A (XTK < 1.0, check every ~10.5 s): normal-arc start within 10.5 s of the first XTK <= 0.99 frame, XTK at the
  start 0.7-0.99, line 2 = distance to the normal arc (rho 1.07), alert on at the start.
- Speed-dependent threshold 0.65-0.85 (1 Hz): start within ~1 s of XTK crossing that value, XTK at the start <= 0.85.
- Neither before the abeam line: zero turn (line 2 = d) or normal arc there if arcD <= ~1.2.

## Z' read (21:03)
Not an abeam pass: the 239-kt take-home intercepted at 40-46 deg and lost XTK faster than T7. Landed at al-L about
2.2 with 3.6; XTK 3.50 at al-L 1.5 (arcD 3.77); alert onset at al-L 1.47 (XTK 3.5), DTK switch at al 3.99 = L with
XTK 2.50, line 2 the arc. LEAD plan with 3.5 NM at al-L 1.5: both R1-A (arcD 3.77 > 3.1) and R1-B (G(239) < 3.14)
predicted abeam. Either the jump landing (al-L about 2.2) set the plan, or the 239-kt gate at 8T is above 3.5
(T7 at 8V abeam with 3.14). G as specified (landing at al-L 2.0 with 3.1) cannot separate these; replaced by a
flown-in replica of Z' (landing at al-L >= 3.5, XTK about 3.5 at al-L 1.5).

## 3a'' (written 21:05, before the pass)
Z' geometry again (239 kt, 8T, land al about 6.2 with 3.6 left): lead, switch at L with XTK about 2.5. Watch NAV 1
for the alert, then arm "Del 8X" on FPL 0 and fire at status distance <= 4.5 (about 5 s into the turn, XTK to the
inbound leg about 2.3).
- Kept: DTK 094, line 2 the arc distance (about 2.3 falling), alert on.
- Dropped and decided again (al < L, XTK > 1.0): DTK back to 304, line 2 = XTK about 2.3, no alert, a late start
  later (R2) or the zero turn at the abeam line.

## 3a'' read (21:09)
Replicated Z' for Rule 1 (landing al-L 2.34 with 3.65, alert onset at al-L 1.47 with XTK 3.5). 8V (flown, before
the FROM 8U; the cursor landed one row lower than intended) deleted about 4 s after the turn start (the status
distance passed 4.7 -> 4.5 at the same rate as in Z' after its switch), XTK to the inbound leg about 2.4.
First NAV 1 frame 4.6 s after the delete: DTK 094, line 2 2.3 (arc distance), alert flashing, take-home heading
snapped back to 313 then turning again. The started turn was KEPT (not re-decided to abeam).

## G' (written 21:10, before the pass)
Flown-in replica of Z' to separate "jump landing set the lead plan" from "the 239-kt gate at 8T is above 3.3":
239 kt, 8T, land al about 7.3 (al-L 3.3, outside every window considered), 3.95 NM left, HDG 304.
Expected XTK: about 3.85 at al-L 2.4, 3.3 at al-L 1.5 (arcD about 3.5).
- R1-A (arcD <= 3.1) and R1-B (XTK <= 2.90-3.14): ABEAM (no alert before L, no switch at al 3.98).
- If the lead plan comes again (alert about 20-23 s of closure before L, switch at L): the 239-kt gate at 8T is
  above 3.3, and Z' was not a jump artifact.
