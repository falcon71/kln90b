# Predictions written before each pass (2026-10-29, inside-of-turn sequencing)

8T: inbound 304 (from 8U), outbound 094 (to 8S): a 150-deg RIGHT turn, so the inside is to the RIGHT of the inbound
leg (the earlier 8T passes flew on the left = outside). L 1.98 at 119 kt, 1.00 at 60 kt. The bisector of the 30-deg
inside angle lies 15 deg off each leg: 0.268 x a NM right of the inbound leg at a NM before 8T. Computed with
startpt.py / great circles (XTK to the inbound leg, then the cross-track to the 8T-8S line):
- I1: 10 NM before 8T, 3.3 right: 3.30 to the active leg, 2.17 to the 8T-8S line (past the bisector).
- I2: 6 NM before, 2.0 right: 2.00 against 1.28 (past the bisector).
- I3: 14 NM before, 3.3 right: 3.30 against 4.17 (before the bisector).
Plan rule (analysis-4): decided at the leg's first calculation, lead iff XTK <= min(83 s of GS, about 4.9 NM):
2.74 NM at 119 kt.

## I1 (written before the pass)
119 kt, single jump with a leg change (from the 8V-8U leg) to 10 NM before 8T with 3.3 right (inside), HDG 304.
Plan: abeam (3.3 > 2.74). The aircraft is already past the bisector, 1.1 NM closer to the 8T-8S line.
- (i) "inside sequencing at the bisector within 4.0 NM too": 8T sequenced at once or within a few seconds, without a
  turn: status ident 8S, DTK 094, FROM 8T.
- (ii) "no sequencing within 4.0 NM on the abeam plan": 8T stays active; the take-home converges (from the right,
  intercept toward the leg); then XTK < 1.0 gives the Rule 2 flip (possibly before L, which then looks like a lead
  turn at L), or the abeam line.

## I1 read (written after the pass)
The first frame after the Ok? (1 s later, still on SET 1) already showed the active waypoint 8S at 27.5 NM; the first
NAV 1 frame: 8T -> 8S active, DTK 094, Fly L 2.1 (the computed 2.17 to the 8T-8S line), no turn, no alert. The
take-home then intercepted 094. So 8T was never active after the landing: the SET 1 re-initialization picked the
closest leg (8T-8S, 2.17 against 3.30), which is the known closest-leg pick at a re-init, not an in-flight
sequencing at the bisector. Outcome (i) in form, but it does not answer the in-flight question.

## I2, control (written before the pass)
119 kt, from the 8V-8U leg, single jump to 6 NM before 8T with 2.0 right (lead plan if 8U-8T were active), HDG 304.
The landing is past the bisector (2.00 against 1.28 to the 8T-8S line).
- If the landing's closest-leg pick decides: 8T-8S active at once again (no 8T leg at all), independent of the plan.
- If a lead plan on 8U-8T held it: 8T active, lead turn at L.

## I3' (written before the pass): an in-flight bisector crossing
I3 as briefed (land 14 NM out with 3.3 right, the line at 3.75) cannot cross in flight: the 119-kt take-home loses
XTK at 1.3-1.9 NM per NM, faster than the line approaches (0.27 NM per NM). Re-planned: land just before the line
with a heading diverging to the right (outward), so XTK grows while the line approaches, and the aircraft crosses
it a few seconds after the landing, in flight, with 8U-8T already active.
- I3'a (abeam plan): 119 kt, land 12.6 NM before 8T with 3.2 right (line 3.38, gap about 0.18 NM), HDG 004 (60 deg
  right of the course). Plan at the landing: abeam (3.2 > 2.74).
  (i) sequenced to 8S when crossing the line (FROM 8T, DTK 094, no turn); (ii) 8T stays active, the take-home turns
  back and converges, then the Rule 2 flip or the abeam line.
- I3'b (lead control): the same with 2.2 right at 8.8 NM (line 2.36), lead plan at the landing.

## I2 read (written after the pass)
Same as I1: the first frames after the Ok? showed 8T -> 8S active, DTK 094, Fly L 1.2 (computed 1.28 to the 8T-8S
line), no turn. The landing's closest-leg pick does not depend on the plan (2.0 would be lead, 3.3 abeam).

## I3'a: final setup (written before the pass)
Land 12.6 NM before 8T with 3.3 right: 3.30 to the 8U-8T line, 3.47 to the 8T-8S line (gap 0.17; the gap shrinks by
about 1.9x the XTK growth), HDG 004. With 8U-8T active at the landing and XTK growing about 0.03 NM/s, the line is
crossed about 3-6 s after the landing. Predictions as above: (i) 8S becomes active at the crossing (FROM 8T, DTK 094,
no turn); (ii) 8T stays active.

## I3'a read (written after the pass)
Landing (Ok? at 16:53:57) with 8U -> 8T active: SET 1 frames showed 8T at 13.1 NM, the first NAV 1 frame
(16:54:02.0) 8U -> 8T, DTK 305, Fly L 3.4 (3.4 right of the inbound leg; plan abeam, 3.4 > 2.74), TK 003. Half a
second later (16:54:02.6, about 4 s after the landing) 8T was sequenced: 8T -> 8S active, DTK 094, Fly L 3.4 (now to
the 8T-8S line: the two distances equal, i.e. at the bisector), no turn, no alert; the take-home then intercepted
094. Outcome (i), in flight, on the abeam plan, 3.4 NM off (within 4.0), 13 NM before 8T.
Caveat: only 4 s after a SET 1 re-initialization; I1/I2 showed that the re-init itself picks the closest leg.

## I3'b, lead control (written before the pass)
Land 9.0 NM before 8T with 2.3 right (2.30 to the inbound line, 2.53 to the outbound, gap 0.23), HDG 004. Plan at
the landing: lead (2.3 < 2.74). XTK grows about 0.03 NM/s, so the line is crossed about 4-6 s after the landing.
- Sequencing at the bisector independent of the plan: 8S active at the crossing, no turn.
- Sequencing at the bisector only on the abeam plan (or only beyond the gate): 8T stays active; the take-home turns
  back, and the lead turn comes at al = L (alert about 20 s before).

## I3'c, abeam with a later crossing (written before the pass)
Land 12.6 NM before 8T with 3.2 right (3.20 / 3.56, gap 0.36), HDG 004: crossing about 6-8 s after the landing, to
separate the bisector sequencing from the first calculations after the re-init. Predictions as I3'a.

## I3'b read (written after the pass)
Ok? at 16:59:14.0; SET 1 frames showed 8T active at 9.3 NM for about 4 s; first NAV 1 frame 16:59:19.5: 8U -> 8T, DTK
304, Fly L 2.4 (lead plan at the landing, 2.3-2.4 < 2.74), TK 003. At 16:59:20.0 (about 6 s after the landing) 8T
was sequenced: 8T -> 8S, DTK 094, Fly L 2.4 (equal distances), no turn, no alert. Same as I3'a: the bisector
sequencing does not depend on the plan. The 4-6 s delays match the computed crossing times (gap 0.17 and 0.23 NM
closing at about 0.05 NM/s), but both are within a few seconds of a re-init. I3'c (gap 0.36) should take longer.

## I3'c read (written after the pass)
Ok? at about 17:04:34; SET 1 frames with 8T active at 13.0 NM, then NAV 1 frames from 17:04:38.5 to 17:04:42.0 with
8U -> 8T active, DTK 305, Fly L 3.3-3.4 (abeam plan), TK 003 -> 359. At 17:04:43.0 (9 s after the landing) 8T was
sequenced: 8T -> 8S, DTK 094, Fly L 3.3 (equal distances), no turn, no alert. The larger gap (0.36) gave a later
crossing (9 s against 4 and 6 s), as the geometry predicts: the sequencing follows the bisector crossing, not the
re-initialization. Outcome (i).
