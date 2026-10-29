# The turn-plan decision (#438) and the abeam plan's late turn (#439): second analysis

Re-analysis of all KLN 89 trainer recordings (2026-10-20, 2026-10-27, 2026-10-28 morning and evening), after the
verification run of 2026-10-28 refuted the first round's Rule 1 (R1-A, R1-B). Every number below was rebuilt from the
CSVs with the scripts in `scripts/` (`runs2.py` the pass list and geometry, `table.py` the data table, `scan.py` the
gate scan, `detail.py` per-window listings, `fits.py` the fit table, `rule2.py` the abeam-plan starts). Nothing was
flown, nothing in the repository was changed, nothing was posted.

Notation as before: al = along-track distance to the waypoint on the inbound leg, L = the lead, al-L = distance before
the turn point, XTK = the unit's line 2 before the switch (0.1 NM above 1.0, 0.01 below), arcD = distance to the normal
turn arc, r = the standard-rate radius (0.63 NM at 119 kt, 1.78 at 239), rho = the arc radius of a capped turn,
"landing" = the first NAV 1 frame after the last SET 1 jump, "the switch" = the DTK change. GS 119 kt = 0.0331 NM/s,
239 kt = 0.0664 NM/s (the unit's own numbers; the trainer's clock runs 6 % slow, lags are in wall seconds).

## Summary

| | candidate | fits | confidence |
|---|---|---|---|
| Rule 1 (#438) | **C1: one latched decision at the first calculation about 45 s of ground speed before the turn point (bracket 42-48 s), along the track: lead iff XTK <= G(GS), G(119) in [2.7, 2.8) and G(239) in [3.9, 4.0]; the 239-kt gate is the 4.0 NM off-leg bound itself. Jump landings inside the window decide at the landing.** T7's abeam is explained without geometry: at 45 s before its turn point T7 had 4.5 NM, T11 4.2 (T8, lead, had 3.7). | 35/35 | medium-high for the mechanism and the window; high for G(119); G(239) >= 3.9 high; the form of G(GS) low |
| | C2: the same at a fixed 2.1-2.2 NM before the turn point at both speeds, G(239) in [3.6, 3.8) | 35/35 | medium-low (margins 0.1-0.2 at both speeds, no natural constant) |
| | C3: the same at 2.5-3.3 NM before the turn point with G(239) = 4.0, requiring the W run's lead to be a Rule 2 flip before the turn point | 35/35 | low-medium |
| | E2: a decision 1.5 NM before the turn point with a gate that depends on the turn geometry (8V below 3.14, 8T above 3.5 at 239 kt) | 35/35 | low (the two 239-kt waypoints with the same radius and speed, 8X and 8V, would need gates 0.3 NM apart; no form of the gate found) |
| Rule 2 (#439) | R2-A confirmed: an abeam plan becomes a lead plan when XTK to the inbound leg < 1.0 NM, checked about every 10.5 wall s (P1-P3: identical profiles, lags 4.0 / 10.5 / 10.0 s). Not the same mechanism as Rule 1 (section 4.3). | 15/15 starts | high at 119 kt; the period medium; 239 kt untested (T7, T11 fit) |

Rejected with the data: a gate of the form XTK <= L + c (T10 against T7 at any decision point, section 3.3), a single
speed-independent XTK gate (T10 and G' against r5), arcD (G' 3.55 lead against r5 3.16 abeam), any gate growing with
the distance to the turn point (a cone; r5, r2 and P1-P3 landed at al-L 1.75-1.8 with 2.8-3.0 and took abeam; T14),
a decision point in straight distance, in ETE or in closure time, the bearing offset, the predicted XTK at the turn
point along the track, and the 20-s decision of the emulation today (19/35).

## 1. The data

### 1.1 The table (`scripts/table.py`)

XTK at fixed al-L (NM before the turn point; mean of the frames within 0.06 NM), the landing (al-L, XTK), arcD at
1.5, the largest XTK after the landing, and the al-L of the last frame above 4.0 NM. Runs: T = 2026-10-20 (t-series),
B/C/D = 2026-10-20 run120, R2/R6 = 2026-10-20 r-series, a = 2026-10-27, r/q3c = 2026-10-28 morning, W/P/Zp/a2/Gp/d2 =
2026-10-28 evening (Zp = Z', Gp = G', a2 = 3a'' before its edit).

| run | GS | wpt, turn | L | rho | landing | x@2.5 | x@2.0 | x@1.5 | x@1.33 | x@1.0 | x@0.66 | x@0 | arc@1.5 | max | >4 until | plan | kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T2 | 239 | 8Y +31 (inside) | 0.49 | 1.78 | 5.31, 4.0 | 2.33 | 1.95 | 1.58 | 1.48 | 1.30 | 1.10 | 0.87 | -0.27 | 4.0 | - | lead | flown |
| T3 | 239 | 8U -120 | 3.09 | 1.78 | 4.75, 4.0 | 2.72 | 2.30 | 1.87 | 1.80 | 1.58 | 1.36 | - | 2.17 | 4.0 | - | lead | flown |
| T5 | 239 | 8U -120 | 3.09 | 1.78 | 3.78, 5.2 | 5.5 | 5.5 | - | 5.28 | 5.10 | 4.90 | 4.40 | - | 5.5 | -0.42 | abeam | flown |
| T6 | 119 | 8T +150 | 1.98 | 0.53 | 1.87, 2.3 | - | - | 2.50 | 2.59 | 2.57 | 2.34 | 1.32 | 2.86 | 2.6 | - | lead | flown |
| T7 | 239 | 8V +93 | 1.88 | 1.78 | 5.84, 6.0 | 4.10 | 3.63 | 3.14 | 2.95 | 2.66 | 2.33 | 1.80 | 3.41 | 6.0 | **2.51** | abeam | flown |
| T8 | 239 | 8U -120 | 3.09 | 1.78 | 4.70, 4.5 | 3.23 | 2.67 | 2.16 | 2.00 | 1.74 | 1.50 | - | 2.45 | 4.5 | **3.35** | lead | flown |
| T10 | 239 | 8X -62 | 1.07 | 1.78 | 2.68, 3.2 | 3.20 | 3.10 | 2.90 | 2.80 | 2.60 | 2.40 | 2.00 | 3.14 | 3.2 | - | lead | flown |
| T11 | 239 | 8X -62 | 1.07 | 1.78 | 2.67, 4.2 | 4.20 | 4.20 | 4.00 | 3.90 | 3.60 | 3.05 | 1.46 | 4.23 | 4.2 | 1.67 | abeam | flown |
| T12 | 239 | 8T +150 | 3.98 | 1.07 | 1.77, 2.3 | - | - | 2.30 | 2.30 | 2.20 | 2.10 | 1.80 | 2.65 | 2.3 | - | lead | jump |
| T13 | 119 | 8U -120 | 1.09 | 0.63 | 1.07, 2.9 | - | - | - | - | 2.90 | 2.75 | 1.75 | - | 2.9 | - | abeam | jump |
| T14 | 119 | 8T +150 | 1.98 | 0.53 | 0.82, 2.7 | - | - | - | - | - | 2.70 | 2.05 | - | 2.7 | - | lead | jump |
| R2 | 119 | 8T +150 | 1.98 | 0.53 | 0.88, 5.7 | | | | | | 5.6 | 5.3 | | 5.7 | -1.41 | abeam | flown |
| R6 | 239 | 8T +150 | 3.98 | 1.07 | 0.82, 6.2 | | | | | | 6.2 | 6.1 | | 6.2 | -2.90 | abeam | flown |
| B | 119 | 8X -62 | 0.38 | 0.63 | 4.53, 2.0 | 0.87 | 0.58 | 0.39 | 0.35 | 0.27 | 0.20 | 0.12 | 1.17 | 2.0 | - | lead | flown |
| C | 119 | 8U -120 | 1.09 | 0.63 | 0.85, 3.5 | - | - | - | - | - | 3.50 | 2.57 | - | 3.5 | - | abeam | jump |
| D | 119 | 8T +150 | 1.98 | 0.53 | 0.92, 5.0 | | | | | | 5.0 | 4.6 | | 5.0 | -0.65 | abeam | flown |
| a8 | 119 | 8T +132 | 1.42 | 0.63 | 0.82, 3.3 | - | - | - | - | - | 3.30 | 2.64 | - | 3.3 | - | abeam | jump |
| a10 | 119 | 8T +150 | 1.98 | 0.53 | 0.25, 3.3 | | | | | | | | | 3.3 | - | lead | jump (inherited, 1.2) |
| a11 | 119 | 8V +93 | 0.67 | 0.63 | 1.49, 2.7 | - | - | 2.70 | 2.70 | 2.56 | 2.12 | - | 3.07 | 2.7 | - | ? | flown (edit) |
| a13 | 119 | 8T +150 | 1.98 | 0.53 | 1.82, 3.5 | - | - | 3.05 | 2.65 | 2.07 | 1.66 | 0.98 | 3.37 | 3.5 | - | abeam | flown |
| a14 | 119 | 8T +150 | 1.98 | 0.53 | 2.18, 4.4 | - | 4.40 | 3.61 | 2.97 | 2.38 | 1.90 | - | 3.91 | 4.4 | 1.56 | abeam | flown |
| a15 | 119 | 8T +150 | 1.98 | 0.53 | 2.18, 4.4 | - | 4.40 | 4.02 | 3.14 | 2.53 | 2.05 | 1.30 | 4.30 | 4.4 | 1.49 | abeam | flown |
| a16 | 119 | 8T +132 | 1.42 | 0.63 | 1.47, 3.8 | - | - | 3.80 | 3.80 | 3.65 | 2.81 | 1.85 | 4.07 | 3.8 | - | abeam | flown |
| r1 | 119 | 8T +150 | 1.98 | 0.53 | 2.18, 4.4 | - | 4.48 | 4.58 | 4.50 | 3.44 | 2.59 | 1.76 | 4.79 | 4.6 | 1.07 | abeam | flown |
| r2 | 119 | 8T +150 | 1.98 | 0.53 | 1.75, 3.0 | - | - | 2.97 | 2.88 | 2.35 | 1.82 | 1.04 | 3.28 | 3.0 | - | abeam | flown |
| r3 | 119 | 8T +150 | 1.98 | 0.53 | 1.78, 2.6 | - | - | 2.52 | 2.46 | 2.06 | 1.50 | 0.81 | 2.88 | 2.6 | - | lead | flown |
| r4 | 119 | 8U -120 | 1.09 | 0.63 | 1.96, 3.2 | - | 3.20 | 3.08 | 2.85 | 2.25 | 1.71 | 1.00 | 3.39 | 3.2 | - | abeam | flown |
| r5 | 119 | 8T +150 | 1.98 | 0.53 | 1.77, 2.8 | - | - | 2.80 | 2.65 | 2.23 | 1.69 | 0.96 | 3.16 | 2.8 | - | abeam | flown |
| q3c | 119 | 8T +150 | 1.98 | 0.53 | 2.18, 4.4 | - | 4.40 | 3.43 | 2.78 | 2.24 | 1.84 | 1.13 | 3.74 | 4.4 | 1.56 | abeam | flown |
| W | 119 | 8T +150 | 1.98 | 0.53 | 2.96, 3.2 | 3.08 | 2.25 | 1.59 | 1.39 | 1.03 | 0.79 | 0.49 | 2.09 | 3.2 | - | lead | flown (XTK < 1.0 at al-L 0.95) |
| P1 | 119 | 8T +150 | 1.98 | 0.53 | 1.75, 3.0 | - | - | 2.97 | 2.86 | 2.36 | 1.82 | 1.03 | 3.29 | 3.0 | - | abeam | flown |
| P2 | 119 | 8T +150 | 1.98 | 0.53 | 1.75, 3.0 | - | - | 2.97 | 2.85 | 2.33 | 1.82 | 1.04 | 3.28 | 3.0 | - | abeam | flown |
| P3 | 119 | 8T +150 | 1.98 | 0.53 | 1.80, 3.0 | - | - | 2.97 | 2.84 | 2.35 | 1.82 | 1.03 | 3.29 | 3.0 | - | abeam | flown |
| Zp | 239 | 8T +150 | 3.98 | 1.07 | 2.02, 3.6 | - | 3.60 | 3.50 | 3.41 | 3.23 | 3.01 | 2.54 | 3.77 | 3.6 | - | lead | jump |
| a2 | 239 | 8T +150 | 3.98 | 1.07 | 2.34, 3.6 | - | 3.60 | 3.50 | 3.40 | - | - | - | 3.80 | 3.6 | - | lead | jump |
| Gp | 239 | 8T +150 | 3.98 | 1.07 | 3.28, 3.9 | 3.83 | 3.60 | 3.20 | 3.07 | 2.77 | 2.42 | - | 3.55 | 3.9 | - | lead | flown |
| d2 | 119 | 8U -120 | 1.09 | 0.63 | 0.74, 3.5 | - | - | - | - | - | 3.50 | 2.67 | - | 3.5 | - | abeam | jump |

In time before the turn point the 4.0 NM crossings are: T7 37.8 s, T8 50.5 s, T11 25.1 s (239 kt); a14/q3c 47.2 s,
a15 45.0 s, r1 32.5 s (119 kt).

### 1.2 What was set aside, and the jump landings

- **a10 is an inherited plan, not a decision** (`a9.csv` end, `a10.csv` start). Before a10's jump the aircraft was
  FROM 8S, 6.7-7.2 NM and moving away: 8S had been the last waypoint since a9 deleted 8R three seconds into 8S's
  lead turn, so 8S was never sequenced and its lead plan was never cleared. The SET 1 jump re-oriented the plan to
  8U-8T and the unit turned at al = L seven seconds later with XTK 3.3 (line 2 then 3.3, which at that point is also
  the distance to the 150-degree arc). Every other jump-in had a cleared state before the jump: T12 from 8V-8U at
  13.3 NM, T13 from 8T-8P at 23 NM, C from 8X-8V at 15 NM, d2 from 8V-8U at 19.5 NM, Zp/a2/Gp/W/r2/r3/r5 from 8U-8T
  at 20-27 NM (two-jump starts), T14 from 8U-8T at 20.4 NM after T13's 8U had been sequenced normally. r4 (abeam
  with 3.2) came after r3's lead turn at 8T was sequenced, so a normal sequencing does clear the plan, and T14's
  lead with 2.7 is a real decision at its landing. The morning's p1 (immediate DTK switch after a jump 2.2 NM before
  8U) started with the 8T alert already on (`p1.csv` first frame) and is the same family; not used.
- a11 (2.70 at al-L 1.43-1.49, edited before any alert was due) stays undetermined; every surviving candidate
  predicts lead (2.70 sits exactly on the 119-kt gate).
- q3c2 is the q3c start with an edit; used for Rule 2 only. R2, R6, D and T5 were above 4.0 at every candidate
  decision point and constrain nothing beyond "abeam".
- The W run (119 kt, lead) had XTK < 1.0 from al-L 0.95 on, 15 s before its alert. It is a lead run under C1, C2
  and E2 (XTK 1.6 at 45 s, 2.5 at 2.1 NM), and under C3 only if the Rule 2 flip also runs before the turn point.

## 2. What the verification run changed

- G' (239 kt, 8T, flown in from al-L 3.28 with 3.9): lead with 3.20 at al-L 1.5; Z' and 3a'' (landings at 2.0-2.3
  with 3.6): lead with 3.5 at 1.5. T7 (239 kt, 8V): abeam with 3.14 at 1.5, 3.63 at 2.0, 4.10 at 2.5. Any decision
  at a fixed 1.5 NM (or 2.0 NM) before the turn point with a gate that depends on the speed alone is dead (G' is
  farther from the leg than T7 at every al-L from 2.0 to 1.0).
- What separates T7 from G': **the history above 4.0 NM**. T7 was above 4.0 until al-L 2.51 (37.8 s before its turn
  point); G' never was; T8 (lead) was above 4.0 until al-L 3.35 (50.5 s). So a decision taken between 38 and 50 s
  before the turn point sees T7 off the leg and T8, G', T10, T3 on it. At 119 kt the first round had already placed
  the decision at al-L 1.4-1.6, which is 42-48 s. The two brackets coincide. That coincidence is the main evidence
  for C1 (section 3.2).
- The verification report's two explanations ("the gate depends on the turn geometry" or "T7's abeam came from its
  > 4 NM history") are E2 and C1/C3 below. Both fit all 35 decided passes; the data cannot separate them (section 5).

## 3. Rule 1: what decides the turn plan

### 3.1 Facts any rule must respect (updated)

1. History decides, not the state at the alert: T6 (lead, 2.57 at al-L 1.0) against a13, r5, r2, P1-P3 (abeam,
   1.7-2.4 at 1.0). The 20-s decision of the emulation today misfits 16 of 35 passes.
2. The decision moment is along the track at the ground speed, not in straight distance, ETE or closure time: with
   d or ETE the T6/r5 pair at 119 kt cannot be ordered (T6 is farther from the leg than r5 at every d below 4.3), and
   Z'/3a'' never reach a straight-distance decision point before their switch; with closure time T8 is still above
   4.0 at every W that makes T7 abeam (`scan.py`).
3. The gate depends on the speed: at 239 kt lead with 3.2 (T10 landing), 3.6 (Z') and 3.9 (G'); at 119 kt abeam
   with 2.8 (r5), 2.9 (T13 landing), 3.0 (r2, P), 3.2 (r4 landing), 3.5 (a13 landing). Between the two speeds the
   239-kt gate is at least 3.9 and the 119-kt gate below 2.8, whatever the decision point.
4. Once decided, the lead plan is kept (T10 turned at L with 2.0, T14 with 2.0, T6 with 1.3); the abeam plan is kept
   until Rule 2 flips it (a15 at L with 1.29 did not turn, r5 with 1.00 at L turned 6.5 s later with 0.87).
5. A leg that becomes active inside the window decides at the landing (T12, T13, T14, C, a8, d2, Z', 3a''), with the
   same gates as in flight (T13 2.9 abeam, T14 2.7 lead at 119 kt; Z' 3.6 lead at 239 kt).

### 3.2 The scan (`scripts/scan.py`, `detail.py`)

For every decision moment q in {al-L, (al-L)/GS, al, d, d-L, ETE, closure time} on a grid of W, and every gated
quantity Q in {XTK, XTK/GS, XTK-r, XTK-L, XTK-60 s of GS, XTK-rho, arcD, bearing offset, XTK-(al-L), XTK/(al-L)}:
the first frame with q <= W (the landing if inside) is the decision; per speed the feasible gate is [max lead Q,
min abeam Q); with and without the off-leg latch (XTK > 4.0 at the decision gives abeam) and with and without the
jump-ins. Results (margins in NM; a negative margin is a misfit):

| decision moment | Q = XTK, per speed | speed-independent Q |
|---|---|---|
| (al-L)/GS <= **42-50 s** | 119: lead <= 2.70 (T14; 2.50 T6/r3 without jumps), abeam > 2.80 (r5), margin 0.10 (0.30); 239: lead <= 3.90 (G'), abeam > 4.20 (T11, T7 4.5), margin 0.30 | XTK/GS <= 2.27-2.35 per 100 kt (82-85 s of GS), margin 0.08; XTK-r <= 2.07-2.17, margin 0.05; XTK-60 s of GS <= 0.72-0.82, margin 0.10 (all with the 4.0 bound for T11) |
| al-L <= **2.1-2.2 NM** | 119: lead <= 2.70, abeam > 2.80, margin 0.10 (W run 2.5-2.6 lead); 239: lead <= 3.60 (3a'', G' 3.6-3.7), abeam > 3.80 (T7), margin 0.20 | XTK-r, margin 0.05 |
| al-L <= 2.3-3.3 NM | 119 fails by the W run (2.9-3.2 at the decision, lead) unless its lead is a Rule 2 flip before the turn point; then 239 needs the off-leg latch (T7 4.1-4.5) and G(239) in [3.9, 4.0] | - |
| al-L <= 1.4-1.6 NM | 239 fails: G' 3.2 lead against T7 3.1-3.14 abeam at 1.5 (margin -0.06 to -0.1) | - |
| al <= W, d <= W | no fit: Z', 3a'', G' (landings at al 6-7.3, d 7-8.3) never reach a W that makes T7 abeam before they switch; T6 against r5 at 119 kt | - |
| ETE, closure time | no fit (T8 above 4.0 at the decision for every W that makes T7 abeam) | - |

Bounds of the time window: at 40 s a13 (2.60, abeam) and T6 (2.60, lead) coincide; at 50 s T8 reads 4.0 (lead).
So 42-48 s, 45 s in the middle. The 119-kt bound comes from a13/T6/r5 (40-50 s), the 239-kt bound from T7/T8 (38-50 s).

### 3.3 Candidates

Each is one latched decision at the first calculation inside its window; a landing inside the window decides at the
landing; XTK > 4.0 at the decision gives abeam (the existing off-leg rule); an abeam plan is subject to Rule 2.

- **C1 (time).** Window: (al-L)/GS <= 45 s (42-48). Gate: G(119) in [2.7, 2.8) (with T14; [2.5, 2.8) without),
  G(239) in [3.9, 4.0], i.e. the off-leg bound. Forms of G(GS) that fit: 82-85 s of ground speed capped at 4.0
  (2.74 NM at 119 kt); r + 2.1-2.17; 60 s of GS + 0.72-0.82. They differ only at other speeds (90 kt: 2.1 / 2.6 /
  2.3; 160 kt: 3.7 / 3.0 / 3.4) and the data has none. Fits 35/35 with margins 0.10 (119) and 0.30 (239).
- **C2 (distance).** Window al-L <= 2.1-2.2 NM at both speeds (64-67 s at 119 kt, 32-33 s at 239). Gate G(119)
  [2.7, 2.8), G(239) [3.6-3.7, 3.8) (G' 3.6-3.7 lead against T7 3.8 abeam). Fits 35/35, margins 0.10 / 0.20. No
  natural constant; a 2.1-NM window has no relation to the lead (0.5-4.0 NM) or the speed.
- **C3 (distance, early).** Window al-L <= 2.5-3.3 NM, G(239) = 4.0 (T7, T11 abeam by the off-leg latch), G(119)
  [2.7, 2.8). Requires the W run (3.08-3.2 at 2.5-3.0, lead) to be an abeam decision flipped by Rule 2 before the
  turn point (XTK < 1.0 from al-L 0.95; the alert then came 22 s of closure before L, as a lead plan's would). Fits
  35/35 only with that assumption.
- **E2 (geometry).** Window al-L <= 1.4-1.6 NM (the first round's), gate per waypoint and speed: 8V/239 below 3.14,
  8X/239 at least 2.9, 8T/239 at least 3.5, 8U/239 at least 2.2, 8T/119 [2.7, 2.8), 8U/119 below 2.9. 8X and 8V have
  the same radius and speed (rho 1.78, L 1.07 and 1.88), so the gate would have to fall from 8X to 8V and rise again
  to 8T (rho 1.07, L 3.98): no function of L, rho or the turn angle does that monotonically (checked: XTK-L,
  XTK-rho, arcD, the distance to the arc center). Fits 35/35 as a lookup table only.
- **Rejected forms** (`scan.py`, `fits.py`):
  - XTK <= L + c: T10 (8X, L 1.07) lead with 2.9-3.2 needs c >= 1.8-2.1; T7 (8V, L 1.88) abeam with 3.1-3.8 needs
    c < 1.3-1.9 at the same decision point; at 45 s T7 is above 4.0 and the form reduces to C1 with c >= 1.8, which
    then fails at 119 kt (8T, L 1.98: r5 abeam with 2.8 needs c < 0.82). Dead at every window.
  - A gate that grows with the distance to the turn point (XTK <= a + b(al-L), the "could still intercept" cone,
    evaluated continuously): r5 (2.8 at its landing 1.77), r2 and P1-P3 (3.0 at 1.75-1.8) were abeam while T6 (2.3
    at 1.87) and r3 (2.6 at 1.78) were lead, which fixes b near 1.0 and a below 1.03 at 119 kt; Z' (3.6 at 2.02,
    lead) then needs a >= 1.58. In time units it is worse. T14 (2.7 at 0.82, lead) kills every version.
  - XTK minus (al-L) at a fixed time (reach the course by the turn point at 45 degrees): fits the flown-in runs at
    42-50 s with a speed-independent c in (1.05, 1.36], and fails T14 (1.88) and every other jump-in decided at its
    landing; only alive if landings are decided differently from flight.
  - arcD (the first round's R1-A): G' 3.55 and Z' 3.77 lead against r5 3.16 and T7 3.41 abeam.
  - The bearing offset: T10 40-48 degrees lead against r5 37-39 abeam.

### 3.4 Fit table (`scripts/fits.py`)

| rule | fits | misses |
|---|---|---|
| emulation today (20 s of GS, 2.8 NM) | 19/35 | T13, a13, a14, a15, a16, r1, r2, r4, r5, q3c, P1, P2, P3, Z', 3a'', G' |
| first round R1-A (1.5 NM, arcD 3.1) | 30/35 | T13, r5, Z', 3a'', G' |
| first round R1-B (1.5 NM, 2.75 / 3.0) | 32/35 | Z', 3a'', G' |
| C1 (45 s, min(4.0, 83 s of GS)) and its r + 2.15 and 60 s + 0.75 forms | 35/35 | - |
| C2 (2.15 NM, 2.75 / 3.7) | 35/35 | - |
| C3 (2.8 NM, 2.75 / 4.0), W run by Rule 2 | 35/35 | - |
| E2 (1.5 NM, per-waypoint gates) | 35/35 | - |

The 35 are the decided passes of the table minus a10 (inherited), a11 (undetermined) and q3c2 (q3c's start).

### 3.5 Confidence

- One latched decision, well before the alert, with the lead plan kept and the abeam plan re-decidable: high.
- The decision moment as a time of ground speed along the track, about 45 s (C1): medium-high. The independent
  brackets at 119 kt (40-50 s, from a13/T6/r5) and at 239 kt (38-50 s, from T7/T8) coincide; under C2, C3 and E2
  that is a coincidence. Against C1: 45 s is not a constant the unit shows anywhere, and the gate it needs is
  speed dependent.
- G(119) in [2.7, 2.8): high (T14 2.7 lead, r5 2.8 abeam, a13/r2/P 2.9 abeam; T6/r3 2.5 lead). G(239) >= 3.9: high
  (G' flown in). Whether a 239-kt gate below 4.0 exists at all: unknown; the off-leg bound suffices.
- The form of G(GS): low. Three forms fit (83 s of GS, r + 2.15, 60 s of GS + 0.75); two speeds cannot separate them.
- C2: medium-low; C3: low-medium (it needs Rule 2 before the turn point, which only the W run suggests); E2: low.

## 4. Rule 2: the abeam plan's late normal-arc turn

### 4.1 Every abeam-plan start (`scripts/rule2.py`)

First frame with XTK <= 0.99 after al-L < 1.0, the switch, the lag (wall s), XTK on the frame before the switch:

| run | GS | wpt | first <= 0.99 at al-L | switch at al-L | XTK before | line 2 after | lag |
|---|---|---|---|---|---|---|---|
| a13 | 119 | 8T | +0.07 | -0.01 | 0.98 | 0.95 (arc) | 2.2 |
| P1 | 119 | 8T | -0.04 | -0.11 | 0.93 | 0.93 (arc) | 4.0 |
| q3c | 119 | 8T | -0.15 | -0.22 | 0.94 | 0.94 (arc) | 4.2 |
| r2 | 119 | 8T | -0.04 | -0.20 | 0.90 | 0.91 (arc) | 4.8 |
| r5 | 119 | 8T | +0.07 | -0.08 | 0.87 | 0.88 (arc) | 6.5 |
| a15 | 119 | 8T | -0.37 | -0.53 | 0.97 | 0.97 (arc) | 6.8 |
| a16e | 119 | 8T | -1.45 | -1.69 | 0.99 (parallel) | 1.70 (arc) | 7.5 |
| a14e | 119 | 8T (next 8R) | -0.46 | -0.74 | 0.9 | 1.10 (arc) | 8.8 |
| T13 | 119 | 8U | -0.68 | -0.94 | 0.78-0.81 | 1.10 (arc) | 9.8 |
| P3 | 119 | 8T | -0.04 | -0.28 | 0.81 | 0.84 (arc) | 10.0 |
| r1 | 119 | 8T | -0.76 | -1.08 | 0.79 | 1.20 (arc) | 10.2 |
| r4 | 119 | 8U | 0.00 | -0.32 | 0.81 | 0.84 (arc) | 10.2 |
| P2 | 119 | 8T | -0.04 | -0.37 | 0.80 | 0.84 (arc) | 10.5 |
| T11 | 239 | 8X | -0.45 | -1.09 (at the abeam line) | 0.62 | 0.87 (arc) | 11.5 |
| T7 | 239 | 8V | -1.47 | -1.91 (abeam line) | 0.85 | 0.85 = d (zero) | 7.0, no flip |
| C, d2, a8e, a10e, T5, R2, R6, D | | | never below 1.0 | abeam line | 1.2-4.4 | = d (zero) | - |

### 4.2 What the P data settles

P1, P2 and P3 repeated r2's start and had the same XTK profile within 0.03 NM at every al-L, the same first-0.99
position (al-L -0.04), and lags of 4.0, 10.5 and 10.0 s. A filter with one time constant cannot give lags that differ
by 6.5 s on identical inputs: R2-B is refuted. The 14 flips at 119 kt lag 2.2-10.5 s with no dependence on the XTK rate
(a13 at 0.01 NM/s lagged 2.2 s, r1 and r4 at 0.02 NM/s lagged 10.2 s), which is what a check every P seconds gives.
P is at least 10.5 wall s (the largest lag) and, if T11's flip 0-1 s before its abeam line was the same check, at
least 11.5 wall s (10.8 trainer s). T7 (0.99 reached 7.0 s before its abeam line, no flip) is a miss with probability
about 1 - 7/P, i.e. one in three; consistent, not evidence. Threshold: every start came after the first frame with
XTK <= 0.99 and none from a frame at 1.0 or more (a15 sat at 1.0-1.1 for 8 s, r1 for 9 s, r4 for 7 s); 1.0 NM at
119 kt is high. At 239 kt the threshold is untested: 1.0 with the cadence fits T7 and T11, so does 0.65-0.85.

The flip is a lead-type turn: alert on with the switch, line 2 the arc distance, sequencing at the bisector, alert end
at L past the waypoint (r1, r2, r5, q3c, P1-P3 1.82-1.92 for L 1.98; r4 0.90 for 1.09; T11 1.04 for 1.07).

### 4.3 One rule for #438 and #439?

No. The only single-test form that covers both, a gate that shrinks toward the turn point and bottoms at 1.0 NM
(section 3.3, the cone), is refuted by the landings of r5, r2 and P1-P3 and by T14. The two facts stand apart: a
one-time test about 45 s before the turn point with a speed-dependent gate (2.75 NM at 119 kt, 4.0 at 239), latched
when it gives lead; and a periodic re-check of the abeam plan against 1.0 NM, which starts the normal-arc turn at
once when the turn point is already passed. Whether the re-check also runs before the turn point (and then gives an
ordinary lead-plan turn at L) is open: only the W run bears on it, and the W run is lead under C1 and C2 anyway.

## 5. Trainer runs that would separate the candidates

Constraints learned from the verification run: the 119-kt take-home loses 1.1-1.9 NM of XTK over the last 1.5 NM
before the turn point (so XTK falls below 1.0 before L from any landing beyond al-L 2.5, and the Rule 2 flip can mask
an abeam decision); the 239-kt take-home flies about 0.8 NM nearly parallel after a jump, then loses about 0.46 NM
per NM, then 0.8 per NM (G': 3.9 at 3.28, 3.83 at 2.5, 3.6 at 2.0, 3.2 at 1.5, 2.77 at 1.0); SET 1 jumps under
10-15 NM are ignored; two-jump starts (first to 20-27 NM before the waypoint on course, then to the start point)
work at 8T from the 8T-8S leg; a single jump to 8 NM before 8V worked from the 8U-8T leg (T7) but 3.55 NM before 8V
re-oriented to 8V-8U (T9). After an FPL 0 delete of a flown waypoint the take-home snaps to the DTK for about 10 s and
then intercepts at 14-27 degrees (0.25-0.52 NM per NM: a14e, q3c2). FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R; 8U-8T 28 NM on
304, 8X-8V 17.7 NM on 332, 8V-8U 22 NM, 8T-8S 38 NM (magnetic as the trainer shows them).

Predictions are for the plan (lead = alert about 20 s of closure before L and the DTK switch at al = L; abeam = no
alert before L, no switch at L, then Rule 2). All runs with SET 4 turn anticipation on, NAV 1 line 2 on `Fly L/R`.

**Run Y (priority 1): the history test at 8T, 239 kt.** Two-jump start, land 8.0 NM before 8T (al-L 4.0) with 4.45 NM
left, HDG 304. Expected XTK (G' profile): 4.4 at 3.2, about 4.2 at 3.0 (45 s), 4.0 at about 2.6, 3.65 at 2.1, 3.3 at
1.5, 2.9 at 1.0, 2.2 at L.

| candidate | prediction |
|---|---|
| C1 | abeam (above 4.0 at 45 s, margin 0.2): no alert before L, no switch at al 3.98 |
| C3 | abeam (above 4.0 at 2.5-3.3) |
| C2 | undecided (3.65 at 2.1 against a gate in [3.6, 3.8)) |
| E2 / first round | lead (3.3 at 1.5, below Z's 3.5): alert about 23 s of closure before L, switch at al 3.98 with XTK about 2.2 |

Read the actual XTK at 3.0, 2.1 and 1.5 afterwards; the pass is decisive when XTK was above 4.0 at al-L 3.0 and at or
below 3.5 at 1.5. If it is abeam, it also gives the first 239-kt Rule 2 test for free: XTK about 2.2 at L falling
0.5 per NM reaches 0.99 about 2.4 NM past the turn point, 1.6 NM (24 s) before the abeam line. R2-A (1.0, period
about 10.5 s) predicts the normal-arc start 0-11 s after the first 0.99 frame, alert on with it, line 2 jumping from
about 0.9 to the arc distance (about 2.0 NM at that point of a rho 1.07 arc), sequencing at bearing 289, alert end
3.9 NM past 8T; a 239-kt threshold of 0.65-0.85 predicts the start only once XTK reads that value or the zero turn at
the abeam line (line 2 = d). Cost: one GS change plus about 6 min per pass; fly it twice if the first is abeam.

**Run V (priority 2): the 8V gate at 239 kt, below 4.0 throughout.** From the 8T-8S leg (at least 15 NM from the
point), one jump to 5.2 NM before 8V on the 8X-8V course (al-L 3.3), 3.75 NM left (outside of the right turn), HDG
332. If the jump re-orients to 8V-8U, abandon and retry from 6 NM before with 3.9 left. Expected XTK: 3.7 at 2.5,
3.45 at 2.0, 3.05 at 1.5.

| candidate | prediction |
|---|---|
| C1 | lead (3.7 at 45 s, below 3.9-4.0; margin 0.2-0.3): alert about 23 s before L, switch at al 1.88 |
| C2, C3 | lead (3.45 at 2.1; 3.7 at 2.5-3.3, below 4.0) |
| E2 | abeam (3.05 at 1.5, below T7's 3.14 but above any 8V gate that made T7 abeam unless it lies in [3.05, 3.14)) |

With Y: C1 predicts (Y abeam, V lead), E2 predicts (Y lead, V abeam), C2 predicts (Y ?, V lead). Two passes of V
with 3.75 and 3.6 left bracket the 8V gate if E2 survives.

**Run S (priority 3): time or distance window at 119 kt, with the snap trick.** Two-jump start, land 5.5 NM before
8T (al-L 3.5) with 3.5 NM left, HDG 304; within 10 s of the landing delete 8Z from FPL 0 (a flown waypoint, not the
FROM; re-insert it after the pass), which snaps the take-home onto 304 and then gives a 14-27 degree intercept.
Expected XTK with 0.45 NM per NM: 3.5 to al-L 3.2, 3.3 at 2.9, 3.0 at 2.2, 2.6 at 1.5, 1.8 at L (so no Rule 2 flip
before the turn point).

| candidate | prediction |
|---|---|
| C1 | lead (2.6 at 45 s): alert about 20 s before L, switch at al 1.98 with XTK about 1.8, line 2 the arc |
| C2 | abeam (3.0 at 2.1-2.2): no switch at L; normal-arc start once XTK < 1.0 about 1.5-2 NM past L, or the zero turn at the abeam line |
| C3 | abeam (3.3-3.5 at 2.5-3.3) |

Decisive only when the read-back shows XTK at or above 2.9 at al-L 2.1-2.2 and at or below 2.6 at 1.4-1.6; a 14-degree
intercept (a14e) leaves XTK above 2.8 at 1.5 and the pass is abeam under all three (then repeat with 3.3 left).
About 8 min per pass. The delete before the decision is covered by the #440 results (3c: a delete of a flown
waypoint leaves the active waypoint's plan alone), but it is the one untested ingredient.

**Run I (optional, cheap): the inherited plan.** From a clean state (previous waypoint sequenced normally, no alert),
replicate a10: jump to 0.2 NM before 8T's turn point with 3.3 NM left at 119 kt. All candidates predict abeam (3.3 at
the landing); a lead means landings decide differently from flight and T14 is suspect too. Then replicate a9/a10
(delete the last waypoint during the previous turn, let the aircraft pass it, jump): lead if the plan is inherited.
About 5 min each.

Not worth flying: W-type passes at 119 kt from beyond al-L 2.5 (masked by Rule 2 before the turn point); G-type passes
at 8T at 239 kt with 3.2-3.9 (all lead under every surviving candidate); anything that tries to hold a steady XTK
without the snap trick.

## 6. What the emulation should do without further runs

Implement C1 in `NavCalculator.decideTurnPlan`, keeping the structure (decide once, latch, decide at once when the
leg becomes active inside the window, abeam when off the leg at the decision):

- **The decision moment:** the first calculation with `along <= turnPoint + GS * TURN_DECISION_TIME`, with
  `TURN_DECISION_TIME` 45 s instead of 20 s (bracket 42-48 s; a13/T6 at 40 s, T8 at 50 s). Note the roll-in that the
  emulation adds to the lead sits inside `turnPoint`; the trainer has none, so the 45 s are measured from the
  trainer's L.
- **The gate:** replace the constant `TURN_PLAN_MAX_XTK = 2.8` by a speed-dependent bound,
  `min(OFF_LEG_XTK, GS * TURN_PLAN_MAX_XTK_TIME)` with `TURN_PLAN_MAX_XTK_TIME` 83 s (2.74 NM at 119 kt, 4.0 at 239;
  bracket 82-85 s). The equivalent forms `r + 2.15` and `60 s of GS + 0.75` fit the same data; the time form is the
  simplest to state and the only one that reduces to the off-leg bound at 239 kt by itself. The comment should say the
  bracket at each speed (119 kt: 2.7-2.8; 239 kt: at least 3.9) and that the form between and beyond them is a guess.
- **The latch:** unchanged for the lead plan. **Add the Rule 2 re-decision:** while `turnPlan === AT_ABEAM` and the
  abeam turn has not started, set `AT_LEAD` when `|legXtk| < 1.0 NM` (constant, say `ABEAM_PLAN_RECAPTURE_XTK`); the
  existing "inside the lead: start at once" path then starts the normal-arc turn when `along <= turnPoint`, and the
  ordinary turn-point start applies when the flip comes earlier. Check it every calculation (1 Hz); the trainer's
  10-s cadence only adds a 0-10 s lag and need not be emulated. Apply it before and after the turn point (simplest;
  the W run is consistent with it; no run contradicts it).
- **The alert must not move with the decision.** `isAlertWithTurn` today returns true for `AT_LEAD` while TO, i.e. from
  the decision on; with the decision at 45 s the alert would come 25 s early. The lead-plan alert has to be armed
  separately, about 20 s of along-track closure before the turn point (every lead run: 19-25 s, T6 16 s), the way
  `isWithinTimeOfAbeam` does it for the abeam plan.
- Do not emulate the inherited plan of a10 (a SET 1 re-initialization keeping the previous waypoint's plan): the
  emulation clears the plan with the active waypoint, which is what the trainer does at a normal sequencing (r4 after
  r3).
- Expected behavior change for users: off course within 4 NM the unit now anticipates the turn when it was within
  about 2.75 NM (at 119 kt) or 4 NM (at 239 kt) of the leg 45 s before the turn point, and an abeam plan recovers to a
  normal turn once the aircraft is back within 1 NM; both as the trainer does.

## Scripts

`scripts/runs2.py` (pass list, landing detection, geometry), `table.py` (section 1.1), `scan.py` and `detail.py`
(section 3.2; outputs `scan_latch.txt`, `scan_nolatch.txt`, `scan_nojump.txt`, `detail_t.txt`, `detail_d.txt`),
`fits.py` (section 3.4, `fits.txt`), `rule2.py` (section 4.1). All read the CSVs in place; run with `python -I`.
