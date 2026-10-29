# A third ground speed: how the C1 gate G(GS) scales (design for the trainer agent)

Follows `analysis.md` (C1: one latched decision about 45 s of GS before the turn point; lead iff XTK <= G(GS), with
G(119) in [2.7, 2.8) and G(239) >= 3.9, capped by the 4.0 NM off-leg bound). Three forms fit the two speeds; this
designs the passes that tell them apart. Analysis only; nothing flown, nothing changed, nothing posted.

## 1. The forms, and what a third speed can see

r = standard-rate radius, bank limited to 25 deg: r = 0.0053 * GS below 170 kt, 3.12e-5 * GS^2 above (0.63 at 119,
1.01 at 180, 1.78 at 239). All gates are capped at 4.0 NM (off-leg bound).

| GS kt | r | L at 8T (150 R) | 45-s window (NM before the turn point) | F1: 83 s of GS | F2: r + 2.15 | F3: 60 s of GS + 0.75 |
|---|---|---|---|---|---|---|
| 60 | 0.32 | 1.00 (cap) | 0.75 | **1.38** | **2.47** | **1.75** |
| 70 | 0.37 | 1.17 (cap) | 0.88 | 1.61 | 2.52 | 1.92 |
| 90 | 0.48 | 1.50 (cap) | 1.12 | 2.08 | 2.63 | 2.25 |
| 119 | 0.63 | 1.98 | 1.49 | 2.74 | 2.78 | 2.73 |
| 160 | 0.85 | 2.67 | 2.00 | 3.69 | 3.00 | 3.42 |
| 180 | 1.01 | 3.00 (cap) | 2.25 | 4.00 (cap) | 3.16 | 3.75 |
| 200 | 1.25 | 3.33 | 2.50 | 4.00 | 3.40 | 4.00 |
| 239 | 1.78 | 3.98 | 2.99 | 4.00 | 3.93 | 4.00 |

The general picture: every form that fits 119 and 239 kt is linear in r (G = a + b r) or linear in GS (G = a + b GS),
with the one free parameter a (the intercept) fixed by G(119) = 2.75 and constrained by G(239) >= 3.9: a in [0, 2.15]
for r-linear, a in [0, 1.6] for GS-linear. F1 is a = 0, F3 a = 0.75, F2 a = 2.15. Below 170 kt r is proportional to
GS, so both families coincide there and **G(60) = 1.39 + 0.50 a**: a 60-kt pass measures a directly. Above 170 kt the
families differ by only 0.1-0.2 NM (at 180 kt, a = 0.75: 3.78 vs 3.95), and the 4.0 cap hides everything with a
below about 0.5. So:

- **60 kt is the speed that separates the forms**: F1 1.38, F3 1.75, F2 2.47, gaps 0.37 and 0.72 NM (at 90 kt the
  F1/F3 gap is only 0.17; at 160-180 kt 0.27-0.4 but squeezed against the cap). The 45-s window is 0.75 NM and L at
  8T is 1.0 NM (the 60-s cap), so the decision point is at al 1.75 and the turn point at al 1.0.
- 180 kt is the optional third pass for "r-linear or GS-linear" once a is known, and only worth it if a comes out
  near 0.75 (F3), where the two give 3.78 and 3.95; with a near 0 both are capped, with a near 2.15 only r-linear
  exists.

Take-home at 60 kt: not yet observed. At 119 kt it flies about 5 s parallel after a jump and then intercepts at
50-60 deg (losing 1.3-1.9 NM of XTK per NM along track); assume the same angles, i.e. about 0.013 NM/s of XTK loss
after the first 5 s. At 60 kt that is 0.4 NM of loss over the 30 s from a landing at al-L 1.0 to the decision at 0.75,
far too much for 0.2-0.4 NM margins. Hence **land inside the window and let the landing decide** (established for
T12, T13, T14, C, a8, d2, Z', 3a'': a leg that becomes active inside the window is decided at once with the landing
XTK, which the SET 1 jump controls to 0.05 NM). Jumps under 10-15 NM are ignored: use the two-jump start (first to
20 NM before 8T on course 304, then to the start point; both jumps keep GS 60 and HDG 304).

Masking: with an abeam decision the Rule 2 re-check flips to lead once XTK < 1.0, and if that happens before the
turn point the turn starts at al = L as a lead plan would. From 1.6 NM at al-L 0.6 a 50-deg intercept reaches 1.0
before L. So **for passes with a target below 2.0 NM, freeze the intercept with the snap trick**: within 10 s of the
landing delete 8Z from FPL 0 (a flown waypoint, not the FROM 8U); the take-home snaps to 304 and then intercepts at
14-27 deg (0.25-0.5 NM per NM), which keeps XTK above 1.0 until L. The delete leaves the active waypoint's plan alone
(#440, 3c). Re-insert 8Z after the pass.

Read-back of the plan at 60 kt (8T, L 1.00, rho 0.27, 150 R, DTK 304 -> 094):
- **lead** = alert onset at least 10 s before the DTK switch (about 20 s of along-track closure before the turn point;
  T14 at 119 kt: alert 2.75 s after a landing 0.82 before L) and the switch at **al 1.00 +- 0.05** (d and bearing on
  NAV 1; line 2 then the arc distance, falling), sequencing at bearing 289, alert end about 1.0 NM past 8T.
- **abeam** = no switch at al 1.00; either a later switch with line 2 the arc distance (the Rule 2 flip, XTK < 1.0,
  0-11 s after the first 0.99 frame) or the zero-size turn at the abeam line (line 2 = distance to 8T).
- The alert burst after a SET 1 jump (15-20 s) can merge with a lead alert; the switch position is the marker.

## 2. The passes (sequential; 8T, inbound 304 from 8U, aircraft left of the leg = outside; SET 4 on; NAV 1 line 2
on `Fly L/R`; GS 60 entered on SET 1, shown about 59 kt)

All landings at **al 1.60 (al-L 0.60, 36 s before the turn point), HDG 304**, start point from
`startpt.py 8U 8T 1.6 -<XTK>`; expected XTK at the decision = the landing XTK (decided at the landing; the 45-s
point al 1.75 is already passed). Record the landing frame's XTK, the first alert frame, the switch (al, XTK, line 2),
the sequencing bearing and the alert end.

**Pass A: XTK 2.10 left.** Between F3 (1.75) and F2 (2.47).

| form | prediction | margin |
|---|---|---|
| F2 (r + 2.15) | lead: switch at al 1.00 | 0.37 |
| F3 (60 s + 0.75) | abeam | 0.35 |
| F1 (83 s) | abeam | 0.72 |

Decisive when the landing XTK reads 2.0-2.2 and the plan is clear by the read-back above. No snap trick needed
(from 2.1 at al-L 0.6 the natural intercept leaves about 1.3 at L; a Rule 2 flip then comes after L, i.e. a switch at
al < 0.95 with line 2 the arc, which is itself the 60-kt Rule 2 observation).

- A = lead -> a >= 1.4: the gate scales like r + c (or a hybrid with a large intercept). Go to **Pass B1**.
- A = abeam -> a < 1.45: a time-like gate. Go to **Pass B2**.

**Pass B1 (after A = lead): XTK 2.35 left.** Confirms F2 against a hybrid between F3 and F2.

| form | prediction | margin |
|---|---|---|
| F2 | lead | 0.12 |
| hybrid a = 1.6 (G(239) exactly 3.9, G(60) 2.18) | abeam | 0.17 |

B1 = lead -> F2 (G = r + 2.15, a in [1.9, 2.15]); B1 = abeam -> a in [1.45, 1.9]: G = r + a with a about 1.6-1.9,
report the bracket. Thin margins: fly B1 twice if the first read-back is marginal (landing XTK 2.3 or 2.4 shown).

**Pass B2 (after A = abeam): XTK 1.56 left, with the snap trick** (delete 8Z within 10 s of the landing).
Between F1 (1.38) and F3 (1.75).

| form | prediction | margin |
|---|---|---|
| F3 | lead: switch at al 1.00 with XTK about 1.3-1.4 | 0.19 |
| F1 | abeam: no switch at al 1.00; XTK stays 1.2-1.4 to L, then the flip after L once below 1.0, or the zero turn | 0.18 |

Decisive when the landing XTK reads 1.5-1.6 and XTK was still at or above 1.0 at al 1.00 (otherwise a flip before L
could mimic lead; then repeat with the delete fired faster, or with 1.65 left).

- B2 = lead -> a in [0.35, 1.45]: G = 60 s of GS + 0.75 (F3) or a neighbour; optional **Pass C1**.
- B2 = abeam -> a < 0.35: G = 83 s of GS (F1), i.e. proportional to speed; confirm with **Pass C2**.

**Pass C1 (optional, after B2 = lead): 180 kt, 8T, land al-L 2.5 (al 5.5) with 3.85 left, HDG 304**, no snap trick
(the 180-kt take-home should fly nearly parallel for the first 0.5-0.8 NM as at 239 kt; the decision falls at
al-L 2.25, 6 s after the landing). Never above 4.0. GS-linear with a = 0.75 gives G(180) 3.78 -> abeam; r-linear with
a = 0.75 gives 3.95 -> lead; a cap-only gate gives lead. Margins 0.07-0.1: weak, fly only if the GS change is cheap
and read the landing XTK to 0.05; a lead says the 180-kt gate is at least 3.85, an abeam says below.

**Pass C2 (after B2 = abeam): 60 kt, XTK 1.25 left, snap trick.** F1 predicts lead (1.38, margin 0.13); abeam would
mean the gate at 60 kt is below 1.25, i.e. steeper than proportional to GS (a < -0.3), which no fitted form gives;
report the bracket.

Contingency if the 60-kt take-home does not keep XTK above 1.0 until L even with the snap trick (it may head at the
waypoint when the offset is large relative to the distance): move the landing to al-L 0.9 and the targets up by the
loss measured between the landing and al-L 0.6 in pass A, and read the XTK at al-L 0.75 (45 s) and 0.70 (42 s) as the
decision values. If the 60-kt flying is unusable altogether (no sequencing, GS not accepted), fall back to 70 kt
(F1 1.61, F3 1.92, F2 2.52; window 0.88, L 1.17; targets 2.2 / 2.4 / 1.76 / 1.45) with the same tree.

## 3. What else the passes show

- **The 45-s window is not tested**: every landing is inside it and decides at the landing. A by-product: if a pass
  lands at al-L 1.0 by mistake (60 s before the turn point) and still shows the landing XTK decided, the window is
  longer than 50 s. The window test stays with runs S and Y of `analysis.md`.
- **Rule 2 at 60 kt**: any abeam pass that reaches XTK < 1.0 after the turn point (pass A if abeam, B2 without the
  snap trick) gives the threshold and the lag at a third speed; the prediction is R2-A (1.0 NM, start 0-11 s after
  the first 0.99 frame, line 2 the arc distance, alert on with the switch, sequencing at 289, alert end about L past).
- **Other forms worth keeping in mind** when reading the bracket on a: the gate as the turn radius plus a constant
  (F2) predicts almost no speed dependence below 170 kt (2.47 at 60, 2.78 at 119); the gate as a time of GS (F1)
  predicts half the 119-kt value at 60 kt; F3 sits between. A gate tied to the lead cap (1.4 x 60 s of GS = F1 in
  disguise) or to r times a factor (4.35 r = F1 below 170 kt, capped above) cannot be told from F1 at 60 kt; they
  differ from F1 only through the cap at high speed, where nothing can be measured. A gate with a floor (e.g. never
  below 2.0 NM) would show as lead in B2 and C2 and abeam in A, i.e. a in [1.2, 1.45]: report it as such rather than
  forcing a form. If pass A comes out lead and B1 lead, note that r + 2.15 at 180 kt predicts 3.16 and at 160 kt
  3.00, well below the time forms, and a single 180-kt pass with 3.45 left (land al-L 2.5) would confirm it with
  0.3 NM of margin either way (F2 abeam, F1/F3 lead).

## 4. Decision tree (summary)

```
A: 60 kt, land al 1.6 with 2.10 left
  lead  -> B1: 2.35 left      lead  -> F2 (r + 2.15); optional 180 kt with 3.45: abeam confirms
                              abeam -> r + a, a in [1.45, 1.9]
  abeam -> B2: 1.56 left (snap trick)
                              lead  -> F3 (60 s of GS + 0.75) or a in [0.35, 1.45]; optional C1 at 180 kt, 3.85
                              abeam -> C2: 1.25 left (snap trick): lead -> F1 (83 s of GS); abeam -> report a < -0.3
```

Expected cost: GS change to 60 (about 2 min of clicks), two-jump start about 3 min per pass, the pass itself about
3 min (36 s to the turn point, then the turn and the sequencing), re-insert of 8Z after a snap-trick pass. Two
passes decide between the three forms; a third confirms or brackets.
