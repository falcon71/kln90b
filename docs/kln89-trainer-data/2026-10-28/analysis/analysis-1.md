# The turn-plan decision (#438) and the abeam plan's late turn (#439): analysis of the three trainer sessions

Analysis of the KLN 89 trainer recordings of 2026-10-20, 2026-10-27 and 2026-10-28 (the CSVs, rebuilt with the
2026-10-28 scripts; nothing was flown, nothing in the repository was changed, nothing was posted). Scripts in
`scripts/` (`runs.py` lists every pass with its geometry and observed plan, `rule1.py` scans gate/window pairs for a
quantity; the dumps quoted below come from short inline scripts built on them).

Notation as in the 2026-10-28 report: al = along-track distance to the waypoint on the inbound leg, XTK = the unit's
line 2 before the switch (0.01 NM, exact), L = the lead, "turn point" = al = L, arcD = distance to the circle tangent to
both legs at L (radius rho = L / tan(turn/2)), tke = TK - DTK. al is rebuilt from the displayed distance (0.1 NM) and
bearing (1 deg): +-0.05 NM. "al-L 1.5" means 1.5 NM along-track before the turn point.

## Summary

| | best candidate | confidence |
|---|---|---|
| Rule 1 (#438) | The plan is decided (lead latched, else abeam) from the aircraft's state about **1.4-1.6 NM along-track before the turn point**, at both speeds (a distance, not a time: 45 s at 119 kt, 22 s at 239 kt). The gated quantity is either the **distance to the turn arc, gate about 3.1 NM** (speed-independent, zero margin), or **XTK with a speed-dependent gate** (2.65-2.80 at 119 kt, 2.90-3.14 at 239 kt). A speed-independent XTK gate is excluded by T10 (239 kt, lead) against r5 (119 kt, abeam): T10 had the larger XTK at every point of the approach. | the decision point as a distance: medium-high; the 119-kt gate 2.65-2.80: high; which quantity: low (undecidable at the display resolution) |
| Rule 2 (#439) | The abeam plan is not final. Once past the turn point the unit **re-decides for the lead plan when XTK to the inbound leg falls below about 1.0 NM**, and then starts the normal-arc turn at once (alert on at once, sequencing at the bisector, alert end at L past). The start lags the crossing of 1.0 NM by 2 to 10 s, uniformly, which looks like a check run every ~10 s rather than a filter. The zero-size turn at the abeam line is what remains when XTK never got below 1.0 before the line (or the check did not come in time: T7). | the 1.0 NM threshold at 119 kt: high (11 starts at 0.79-0.99, none at 1.0-1.3; the parallel case a16e at 0.99); the periodic check: low-medium (the lag distribution only; the period cannot be read from the timestamps); 239 kt: low (two runs) |

The two rules are most simply one mechanism: "lead plan iff the aircraft is close enough to the turn", with "close
enough" being about 2.75 NM of XTK (or 3.1 NM to the arc) when tested about 1.5 NM before the turn point and 1.0 NM of
XTK when tested later; a lead decision is latched; an abeam state is not. Section 4 states it as one rule.

## 1. The data and what was set aside

All passes with a decision (runs.py). Flown-in = the aircraft reached the decision range in flight; jump = the SET 1
jump landed inside it.

- Jump-ins are unreliable for Rule 1 and are only reported, not fitted: a10 (lead with XTK 3.3, landed 0.14 NM before
  the turn point) and a8 (abeam with 3.3, landed 0.82 before) contradict each other outright; T12 (2.3, lead), T14
  (2.7, lead, alert 2.75 s after the jump), T13 (2.9, abeam, GS still 164 kt falling to 121 at the landing), C (3.5,
  abeam). Run A of 2026-10-20 (immediate turn after a jump) and the 2026-10-28 p1 are the same family. A SET 1
  re-initialization may well start the leg in the lead plan by default; that would explain a10, T12, T14 and A, while
  a8, C and T13 landed with XTK large enough for a prompt abeam decision anyway.
- a11 (8V, XTK 2.70 parallel at 1.3-1.5 NM before the turn point, edit at al-L 0.5) is undetermined: every
  candidate predicts the lead plan, and by the closure-rate alert rule the alert was not yet due at the edit (24 s to
  go). Not a counterexample to anything.
- q3c2, a14e, a16e, a8e, a10e (edited during the pass) are used for Rule 2 only.
- T5, R2, R6, D had XTK above 4.0 at the decision range; they constrain nothing beyond "abeam".

The alert timing of the lead runs matters because it puts the decision before the alert: the onset fits "about
20-23 s of along-track closure, (al-L)/(GS cos tke), before the turn point" in every lead run (T2 23, T3 22, T8 21,
T10 21, B 21, T6 14, r3 17 s; T6 and r3 were closing at 54-60 deg). T6's alert came with XTK 1.72 at al-L 0.23, when
a13 at the same point had 1.2 and got none. So the plan existed before the alert.

## 2. Rule 1: what decides the turn plan

### 2.1 Facts that any rule must respect

1. **History decides, not the state at or after the nominal point.** T6 (lead) had XTK 2.34 at al-L 0.66 and was
   farther from the leg than a13 (abeam, 1.66), r5 (1.69) and r2 (1.82) at every al-L below 1.33. Up the approach,
   T6 never had more than 2.60 (2.59 at 1.33, 2.50 at 1.5, 2.30-2.40 at 1.66-1.87); a13 had 2.65 at 1.33, 3.05 at
   1.5, 3.36 at 1.66; r5 2.65 / 2.80 / 2.80; r2 2.88 / 2.97 / 3.00; r3 (lead) 2.46 / 2.52 / 2.60. At 119 kt the
   separation between lead and abeam exists only at al-L >= 1.33, and it is clean from 1.4 on: lead <= 2.60, abeam
   >= 2.74 (r5 at 1.4), with r3's 2.60 at 1.66 (lead) and r5's 2.80 at 1.5-1.77 (abeam).
2. **The decision point is a distance before the turn point, not a time.** At 239 kt the 20-s point (al-L 1.33) already
   separates T10 (2.80, lead) from T7 (2.95, abeam); at 119 kt the 20-s point (0.66) does not, the 1.4-1.5 NM point
   (42-45 s) does. In time: 119 kt needs the window to reach >= 42 s, 239 kt needs it to start < 32-38 s (T8 had 3.3 at
   38 s and 2.9 at 33 s before, T3 3.1 at 40 s, both lead). No single time works; a single distance of 1.4-1.6 NM does.
   (A window in straight distance d - L of about 2.5 NM also works, at zero margin; in ETE it does not.)
3. **No speed-independent rule on XTK alone fits.** T10 (239 kt, 8X 62 deg, lead) had XTK 3.10 at al-L 2.0-2.33,
   2.94 at 1.66, 2.90 at 1.5, 2.85 at 1.4, 2.80 at 1.33, 2.70 at 1.16, 2.60 at 1.0, 2.40 at 0.66. r5 (119 kt, 8T
   150 deg, abeam) had 2.80 at 1.5-1.77, 2.74 at 1.4, 2.65 at 1.33, 2.51 at 1.16, 2.23 at 1.0, 1.69 at 0.66. T10 is
   farther from the leg than r5 at every along-track distance and at every time before the turn point. Any rule on the
   XTK history that does not use the speed (or something that goes with it: the turn radius, L, the waypoint) puts
   T10 on the abeam side of r5. The gap is 0.10-0.15 NM, two to three times the XTK-at-position error (+-0.03).
   The 2026-10-20 "2.8 NM at both speeds" came from the 20-s point, where the 119-kt lead runs happen to sit near 2.3.
4. **Once decided, the lead plan is kept** (T10 turned at L with XTK 2.0, T14 with 2.0, T6 with 1.34), and a lead
   plan is not taken later by an abeam run with a smaller XTK (a15 at L had 1.29 and did not turn). The abeam
   decision is kept until Rule 2 (section 3) flips it.
5. **What the decision is not**: the predicted XTK at the turn point along the track (a13 at 1.5 was heading at the
   leg at 64-73 deg, predicted 0, and took abeam; T6 was diverging at al-L 1.3-1.9), the time to intercept, the track
   angle, the bearing offset (T10 48 deg lead against T7 43 abeam), the next-leg XTK (T8 5.1 lead against T7 3.6
   abeam), a filtered XTK (fact 3 holds for every function of the history), a time window with any fixed gate (fact 2).

### 2.2 Candidates

Each is evaluated every calculation; "lead" is latched; otherwise the plan is abeam (subject to Rule 2).

- **R1-A, distance to the arc.** From the first calculation with al <= L + W (W = 1.5 NM): lead if arcD <= 3.1 NM,
  arcD being the distance from the aircraft to the circle tangent to both legs at L from the waypoint (the circle the
  unit's line 2 shows during the turn); latched abeam if above. Speed-independent; the speed dependence seen in XTK
  comes from the radius: at al-L 1.5, arcD = XTK + 0.33 for rho 0.53 (8T at 119 kt), + 0.24 for rho 1.78 (239 kt),
  + 0.16 for rho 1.07 (8T at 239 kt), so the equivalent XTK gates are 2.77 / 2.86 / 2.94. Fit: zero margin (T10 3.14
  lead against r5 3.16 abeam, both at W 1.5; the scan finds a sliver at W 1.51-1.54 with G 3.10), T13 (jump) off by
  0.05.
- **R1-B, XTK with a speed-dependent gate.** From al <= L + W (W 1.4-1.6): lead if XTK <= G(GS), G(119) in
  [2.65, 2.80), G(239) in (2.90, 3.14). Fit: every flown-in run with margins of at least 0.05 (r5), 0.10 (T10, T7),
  0.15 (T6). The data cannot say what G is between or beyond the two speeds; "XTK - r <= 2.1" (r the turn radius) fits
  only with W >= 2.2, which fails T7 at W 1.5 (3.14 there); "G = 2.5 + 0.0021 GS" is a bare interpolation.
- **R1-C, XTK 2.75 at a slow cadence.** As R1-B with a single gate (2.75) but the check run every ~10 s (section 3.3):
  T10 would be lead only if its first check in the window fell at al-L <= 1.2 (XTK 2.70; 55 % of phases), T7 abeam
  only if its first fell at >= 1.1 (60 %), and r5, a13, r2, r4 abeam only with their first checks early in the window
  (30, 30, 90, 75 %): joint about 2 %. Not credible as stated.
- **R1-D, XTK 2.75 in a straight-distance window.** Lead if XTK <= 2.70-2.75 at every calculation with d - L <= 2.5
  NM (T10 enters that window at al-L 1.2 with 2.75, r5 at 1.5 with 2.80, a13 at 1.46 with 2.9). Zero margin and no
  reason for a 2.5-NM constant; listed because d - L is the one "distance to the turn point" a unit would get for
  free.

### 2.3 Fit table

XTK@1.5 = XTK 1.5 NM before the turn point; maxXTK = largest XTK at al-L <= 1.5 (what a continuous check sees);
arcD@1.5 likewise. Predictions: A = arcD <= 3.1 within al-L <= 1.55; B = XTK <= 2.75 (119 kt) / 3.0 (239 kt) within
al-L <= 1.5. Jump-ins: the landing values. Margin = distance of the decisive value from the gate, negative = wrong.

| run | GS | wpt, turn | kind | plan | XTK@1.5 | maxXTK | arcD@1.5 (max) | A | B |
|---|---|---|---|---|---|---|---|---|---|
| T2 | 239 | 8Y 31 R (inside) | flown | lead | 1.58 | 1.60 | -0.27 (-0.22) | lead +3.3 | lead +1.4 |
| T3 | 239 | 8U 120 L | flown | lead | 1.87 | 1.90 | 2.17 (2.25) | lead +0.85 | lead +1.1 |
| T8 | 239 | 8U 120 L | flown | lead | 2.16 | 2.20 | 2.45 (2.50) | lead +0.60 | lead +0.8 |
| T10 | 239 | 8X 62 L | flown | lead | 2.90 | 2.90 | 3.14 (3.14) | **abeam -0.04** | lead +0.10 |
| T7 | 239 | 8V 92 R | flown | abeam | 3.14 | 3.14 | 3.41 (3.44) | abeam +0.34 | abeam +0.14 |
| T11 | 239 | 8X 62 L | flown | abeam | 4.00 | 4.00 | 4.23 | abeam +1.1 | abeam +1.0 |
| T5 | 239 | 8U 120 L | flown | abeam | 5.3 | 5.5 | 5.5 | abeam | abeam |
| R6 | 239 | 8T 150 R | flown | abeam | >4 | 6.2 | 6.3 | abeam | abeam |
| T12 | 239 | 8T 150 R | jump 1.77 | lead | 2.30 | 2.30 | 2.65 (2.75) | lead +0.35 | lead +0.70 |
| B | 119 | 8X 62 L | flown | lead | 0.39 | 0.41 | 1.17 (1.26) | lead +1.8 | lead +2.3 |
| T6 | 119 | 8T 150 R | flown | lead | 2.50 | 2.60 | 2.86 (2.91) | lead +0.19 | lead +0.15 |
| r3 | 119 | 8T 150 R | flown | lead | 2.52 | 2.60 | 2.88 (2.96) | lead +0.14 | lead +0.15 |
| r5 | 119 | 8T 150 R | flown | abeam | 2.80 | 2.80 | 3.16 (3.16) | abeam +0.06 | abeam +0.05 |
| r2 | 119 | 8T 150 R | flown | abeam | 2.97 | 2.97 | 3.28 | abeam +0.18 | abeam +0.22 |
| a13 | 119 | 8T 150 R | flown | abeam | 3.05 | 3.30 | 3.37 (3.57) | abeam +0.27 | abeam +0.30 |
| r4 | 119 | 8U 120 L | flown | abeam | 3.08 | 3.10 | 3.39 (3.44) | abeam +0.29 | abeam +0.33 |
| q3c, q3c2 | 119 | 8T 150 R | flown | abeam | 3.43 | 3.43 | 3.74 (4.33) | abeam | abeam |
| a14 | 119 | 8T 150 R | flown | abeam | 3.61 | 3.90 | 3.91 (4.33) | abeam | abeam |
| a16 | 119 | 8T 132 R | flown | abeam | 3.80 | 3.80 | 4.07 | abeam | abeam |
| a15 | 119 | 8T 150 R | flown | abeam | 4.02 | 4.10 | 4.30 (4.46) | abeam | abeam |
| r1 | 119 | 8T 150 R | flown | abeam | 4.58 | 4.60 | 4.79 (4.85) | abeam | abeam |
| R2, D | 119 | 8T 150 R | flown | abeam | >4 | 5.0-5.7 | 5.1-5.8 | abeam | abeam |
| a11 | 119 | 8V 92 R | flown | ? | 2.70 | 2.70 | 3.07 | lead +0.03 | lead +0.05 |
| T14 | 119 | 8T 150 R | jump 0.82 | lead | - | 2.70 | 2.81 | lead +0.29 | lead +0.05 |
| T13 | 119 | 8U 120 L | jump 1.07 | abeam | - | 2.90 | 3.04 | **lead -0.06** | abeam +0.15 |
| C | 119 | 8U 120 L | jump 0.85 | abeam | - | 3.50 | 3.58 | abeam +0.5 | abeam +0.75 |
| a8 | 119 | 8T 132 R | jump 0.82 | abeam | - | 3.30 | 3.40 | abeam +0.3 | abeam +0.55 |
| a10 | 119 | 8T 150 R | jump 0.25 | lead | - | 3.30 | 3.32 | **abeam** | **abeam** |

Runs inconsistent with every candidate: a10 (jump artifact, contradicted by a8). Runs at the resolution limit: T10
and r5 (they decide between A and B, and the data cannot), T13 (jump during a GS change).

### 2.4 Confidence

- The decision is taken from the state about 1.4-1.6 NM before the turn point and latched when lead: medium-high
  (facts 1, 2 and 4; nine flown-in abeam runs and five flown-in lead runs order cleanly there at both speeds).
- The 119-kt gate on XTK, 2.65-2.80: high (T6 2.60 and r3 2.60 lead, r5 2.74-2.80 and a13 2.75 abeam, all the unit's
  own numbers). The 239-kt gate on XTK, 2.90-3.14: medium (one pair, T10 and T7).
- Which quantity (arcD at 3.1 or XTK with a speed-dependent gate): low. They differ by 0.1-0.15 NM of XTK at 239
  kt, which the take-home's intercept (0.1 NM per 3-5 s) and the 1-Hz calculation cannot resolve in one or two runs.
- Not a time window, not the nominal point: high.

## 3. Rule 2: the abeam plan's late normal-arc turn and the zero turn

### 3.1 Facts

Every abeam-plan turn start, with the unit's XTK on the last frame before the switch and the lag from the first frame
on which XTK read 0.99 or less (wall s; the trainer second is 0.94 wall s):

| run | GS | wpt | al-L at start | XTK before the switch | lag after XTK <= 0.99 | tke | line 2 after | arc |
|---|---|---|---|---|---|---|---|---|
| a13 | 119 | 8T | 0.00 | 0.98 | 2.3 s | +44 | 0.95 | normal |
| r5 | 119 | 8T | -0.08 | 0.87 | 5.0 | +43 | 0.88 | normal |
| r2 | 119 | 8T | -0.20 | 0.90 | 4.5 | +43 | 0.91 | normal |
| q3c | 119 | 8T | -0.22 | 0.94 | 4.3 | +42 | 0.94 | normal |
| a15 | 119 | 8T | -0.53 | 0.97 (0.88 two frames earlier) | 6.8 | +41 | 0.97 | normal |
| r1 | 119 | 8T | -1.08 | 0.79 | 10.3 | +38 | 1.20 | normal |
| r4 | 119 | 8U | -0.32 | 0.81 | 10.2 | -39 | 0.84 | normal |
| T13 | 119 | 8U | -0.94 | 0.81 | 9.8 | -35 | 1.10 | normal |
| a14e | 119 | 8T (next 8R) | -0.74 | 0.90 | 8.8 | +25 | 1.10 | normal |
| q3c2 | 119 | 8T | -1.29 | 0.87 | 9.5 | +31 | 1.40 | normal |
| a16e | 119 | 8T | -1.69 (0.29 before abeam) | 0.99, parallel (tke 0) since the edit | 7.5 from the first frame after the edit | +1 | 1.70 | normal |
| T11 | 239 | 8X | -1.02 (at the abeam line) | 0.62 | 11.5 (9.0 from 0.90) | -26 | 0.87 | normal |
| T7 | 239 | 8V | at the abeam line | 0.85 (0.99 reached 7.0 s before the line) | - | +24 | 0.85 = d | zero |
| C | 119 | 8U | at the abeam line | 1.20 (minimum) | - | -47 | 1.20 = d | zero |
| a8e, a10e | 119 | 8T | at the abeam line | 1.50, 1.20 (minima) | - | | = d | zero |
| T5, R2, R6, D | both | | at the abeam line | 1.7-4.4 | - | | = d | zero |

1. **Every late start came with XTK to the inbound leg below 1.0 NM (0.79-0.99), and no abeam run that stayed at or
   above 1.0 started a normal arc** (C 1.20, a8e 1.50, a10e 1.20 flew the zero turn). Frames with XTK 1.00-1.30 just
   before the starts never triggered (a15 passed 1.30 at the turn point and 1.00-1.10 for 8 s; r1 sat at 1.0-1.1 for
   9 s; r4 at 1.0-1.1 for 7 s).
2. **The start lags the crossing of 1.0 by 2 to 10 s** (11 runs: 2.3, 4.3, 4.5, 5.0, 6.8, 7.5, 8.8, 9.5, 9.8, 10.2,
   10.3 s). The lag does not follow the XTK rate (a13 fell at 0.01 NM/s and lagged 2 s; q3c at 0.012 lagged 4 s; r4 and
   r1 at 0.02 lagged 10 s; a16e did not converge at all and lagged 7.5 s), so a first-order filter would need a time
   constant anywhere between 2 and 10 s. A check run once every ~10 s gives exactly a uniform 0-10 s lag.
3. **The trigger is not an intercept-geometry test.** a16e flipped flying parallel at 0.99 (tke 0, no intercept
   point); T7 at 239 kt was closing at 24 deg with 0.85-0.93 and did not flip; the distance along the track to the
   leg at the starts ranges 1.28-1.48 (119 kt) and 1.44 (T11) against 1.6 (C) and 2.1 (T7): a16e breaks it.
4. **The trigger is not the distance to the arc** (the 2026-10-28 candidate): r1 started at 1.17-1.20 while r2 passed
   1.03 and r4 0.96 without starting; a16e started at 1.70 (parallel, arcD growing). The "closest approach" clause was
   fitted to r1 and T13; T13's arcD was rising and falling by 0.03 (reconstruction noise) around the start.
5. **The late start is a lead-type turn.** The alert comes on with the switch (not 15 s before the abeam line as in
   the zero-turn runs), line 2 shows the distance to the normal arc, the waypoint sequences at the bisector and the
   alert ends at L past the waypoint (r1, r2, r5, q3c 1.92 for L 1.98; r4 0.90 for 1.09; T13 1.00, T11 1.04) - exactly
   what a lead-plan turn started inside L does (a6, a13 after its edit). After an edit the end came earlier (a16e
   1.32, q3c2 1.62), unexplained here.
6. **At 239 kt** T11 started the normal arc 0-1 s before the abeam line with XTK 0.62 (0.99 reached 11.5 s earlier,
   0.90 9.0 s earlier) and T7 flew the zero turn with 0.85 at the line (0.99 reached 7.0 s before it). Either the
   threshold is lower at 239 kt (between 0.62 and 0.85), or both are the 1.0 rule with the periodic check: T7's check
   did not come within 7 s (likely enough), T11's came just before the line (needs the period to be at least 9-11.5 s,
   depending on the threshold). Not separable with two runs.
7. The zero-size turn at the abeam line: in every run whose XTK never went below 1.0 before the line, and in T7.

### 3.2 Candidates

- **R2-A, periodic re-decision on XTK.** On the abeam plan, a check that runs about every 10 s (period P between
  10 and 11.5 s; the lags bound it below by 10.3 s) tests XTK to the inbound leg < 1.0 NM (threshold Theta in
  [0.98, 1.00); a13 started with 0.98 showing). If true, the plan becomes lead: the normal-arc turn starts at once
  when al <= L (all observed cases; before the turn point it would start at al = L with the alert 20 s of closure
  ahead, not observed because XTK < 1.0 before the turn point gives the lead plan at the 1.5-NM decision anyway). If
  the abeam line comes first, the zero-size turn starts there and the plan is closed. Fits all 16 rows of the table
  (T7 with a 7-s gap, T11 with the check 0-1 s before the line).
- **R2-B, filtered XTK.** Same threshold on a low-pass XTK with time constant tau. Fits a13 (tau 2), q3c (5), r2/r5
  (5-6), a15 (7), r1/r4/T13/q3c2 (10) only with tau varying 2-10 s: rejected as a single filter.
- **R2-C, speed-dependent threshold, 1 Hz.** Threshold 0.80 at 119 kt would miss a13 (0.98), r2 (0.90), q3c (0.94),
  a15, a16e (0.99); 1.0 at 1 Hz would start a13 fine but r1 10 s late. Rejected at 119 kt; at 239 kt a threshold of
  0.65-0.85 is as good as R2-A.
- **The arc at the abeam line.** With R2-A, the arc at the abeam line is always the zero-size one; T11's normal arc
  at the line is a flip that landed 0-1 s before it. The alternative (normal arc at the line when arcD <= about 1.2,
  else zero: T11 0.87, T7 1.44, C 1.49) fits the same runs; a 239-kt run that reaches XTK 0.9 more than 12 s before
  the abeam line separates them (section 5).

### 3.3 Confidence

- Threshold about 1.0 NM of XTK to the inbound leg at 119 kt, and the flip being a lead-type turn: high (11 starts
  at 0.79-0.99, the three zero turns with minima 1.2-1.5, the parallel case a16e, and the identical alert, sequencing
  and alert-end behavior).
- The lag being a periodic check rather than a filter: low-medium. The lag distribution is the only evidence; the
  flip timestamps of one session do not fix the period (with 4-6 events per session any period in 9-20 s can be made
  to fit; a control set of sequencing times fits one equally well, R 0.995 at 11.47 s).
- 239 kt: low (T7, T11).
- Post-edit runs fit R2-A (a14e, q3c2, a16e start below 1.0 with lags 7.5-9.5 s; a8e, a10e never below 1.2).

## 4. One rule

The simplest statement that covers both: every calculation on the leg (|XTK| <= 4.0), the unit sets the plan to
**lead** when the aircraft is "close enough" to the planned turn; a lead plan is latched; an abeam state is just
"not yet". "Close enough" is

- XTK <= 2.75 NM (119 kt) / about 3.0 (239 kt) - or arcD <= 3.1 NM - while 1.4-1.6 NM before the turn point (the
  window where the gate is large), and
- XTK < 1.0 NM at any later check (about every 10 s).

A lead plan taken in the window starts the turn at al = L with the alert 20 s of closure before; a lead plan taken
later starts it at once; no lead plan by the abeam line gives the zero-size turn there. The 4.0-NM regime, the
bisector sequencing, the alert end and the edit behavior of 2026-10-27 are untouched. Why the gate is 2.75 in a
window about 1.5 NM wide and 1.0 afterwards is not explained by the data; a step in the gate at about al-L 1.3 is
required by a13 and r5 (2.65 at 1.33 abeam, 2.33-2.51 at 1.16 abeam) against T6 (2.59 at 1.33, lead).

What the simulation would change (not done here): decideTurnPlan decides at along <= turnPoint + 1.5 NM (not 20 s
of GS), on legXtk <= 2.75 at 119 kt or on the arc distance <= 3.1 (either reproduces every flown-in 119-kt run); an
AT_ABEAM plan is re-decided (AT_LEAD) when legXtk < 1.0, after which the existing "inside the lead: start at once"
path runs; the periodic cadence can be left out (start at once) until the trainer shows otherwise.

## 5. Trainer runs that would settle what is open

All at 8T (inbound 304 from 8U, L 1.98 at 119 kt), two-jump starts (first 25 NM before 8T on course, then the start
point, HDG 304 both times), SET 4 on, NAV 1 line 2 on `Fly L/R`.

**Run W (Rule 1, the decision point: 1.5 NM or earlier).** 119 kt, jump to al 5.0 (al-L 3.0), 3.2 NM left. The
take-home flies parallel 5 s, then intercepts at 50-60 deg; from the a13/a15 profiles XTK falls about 0.4 in the first
0.5 NM and 1.3 per NM after that, so expect about 2.8 at al-L 2.5, 2.2 at 2.0, 1.5 at 1.5 (arcD about 1.9). Predictions:
R1-A/B (window 1.4-1.6): lead - alert at about al 2.5-2.6 (20 s of closure before L), DTK switch at al 1.98, line 2
the arc. A window starting at al-L >= 2.4 (the "XTK - r <= 2.1 with W 2.2-3.1" family, or any "largest XTK since the
leg became active"): abeam - no alert before L, no switch at L, a late start once XTK < 1.0. Margins 0.4 NM both ways.
Reading: whether the DTK switches at al 1.98 with the alert about 20 s before. One pass, about 8 min.

**Run G (Rule 1, the 239-kt gate: arcD 3.1 against XTK 3.0).** 239 kt (2 min of clicks), 8T (rho 1.07 at 239 kt, L
3.98), jump to al 6.0 (al-L 2.0), 3.1 NM left. Expect about 3.0 at al-L 1.5. R1-A (equivalent XTK gate 2.94 here):
abeam; R1-B with G(239) = 3.0: lead, borderline. Only worth flying if the 239-kt speed is set anyway; a result of
"abeam with 3.0" would also move G(239) below 3.0 and tighten R1-B to 2.90-3.0. Low power.

**Run P (Rule 2, periodic check or filter).** Three repeats of r2 (119 kt, jump al 3.9, 3.0 left: abeam plan, XTK
reaches 0.99 about 25 s after the turn point while falling about 0.02 NM/s). For each, read the lag from the first
frame with XTK <= 0.99 to the DTK switch. R2-A: lags spread uniformly over 0-10.5 s, and the XTK at the switch spreads
0.78-0.99 accordingly; a filter: the same lag (+-1 s) every time and the same XTK at the switch. Six runs in all (the
three existing r2/r5/q3c count) decide at 2-sigma. About 6 min per pass.

**Run Z (Rule 2 at 239 kt, and the arc at the abeam line).** 239 kt, 8V (92 R, L 1.85) as T7 but with a smaller
offset so that XTK reaches 0.9 about 20 s before the abeam line: jump 8 NM before 8V, 4.5 NM left (T7 used 6.0 and
had 0.99 7 s before the line). R2-A: a normal-arc start within 10.5 s of XTK < 1.0, i.e. 10-20 s before the abeam
line, with line 2 the arc distance (about 1.2-1.4). Speed-dependent threshold (0.65-0.85): no start before the line;
then at the line either the zero turn (line 2 = d) or, if the arc choice at the line is by arcD <= 1.2, the normal
arc. One pass after the GS change.

Priority: W (cheap, separates the window families and is what the simulation needs first), then P (cheap, repeats),
then Z, then G.