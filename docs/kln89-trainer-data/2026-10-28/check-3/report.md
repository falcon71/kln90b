# KLN 89 trainer runs Y, V, S and the 60-kt gate passes (2026-10-28 22:12 to 2026-10-29 00:03)

Agent check in the KLN 89 trainer (VM "Windows 98", SET 1 take-home flying, SET 4 turn anticipation on for the runs).
It flies runs Y, V and S of `../analysis/analysis-2.md` section 5 and the 60-kt decision tree of
`../analysis/third-speed.md`. Run I was not flown (no time left after the 60-kt tree). Predictions as written
before each pass, with the first reading after it: [predictions.md](predictions.md). Scripts and the method are those of
`../check-2/` (copied to `scripts/`; PNG frames in `scripts/rec/`, about 190 MB). Nothing in the repository
was changed, nothing was posted, only the KLN 89 trainer was used.

Notation: al = along-track distance to the waypoint, L = the lead, al-L = distance before the turn point, XTK = NAV 1
line 2 before the switch (0.1 NM resolution at 1.0 and above), "switch" = the DTK change. "lead" = alert about 20 s of
along-track closure before L and the switch at al = L; "abeam" = neither, then a Rule 2 flip (switch after the first
XTK <= 0.99 frame, alert with it) or the zero turn. al and arcD are rebuilt from distance and bearing (+-0.05 NM).

## Files

| file | pass | GS | start | plan |
|---|---|---|---|---|
| `y1.csv` | Y1 | 239 | 8T, landing al-L 4.06 with 4.5 left | lead |
| `y2.csv` | Y2 | 239 | 8T, landing al-L 4.16 with 4.8 left | lead |
| `v1.csv` | V1 | 239 | 8V, landing al-L about 4.1 with 4.15 left, 8Z deleted at al-L about 2.4 | lead |
| `v2.csv` | V2 | 239 | 8V, the same; 8Y deleted at al-L about 2.4 | lead |
| `s1.csv` | S1 | 119 | 8T, botched single-jump start (heading 083 at the landing), landing al-L 3.72 with 2.9, 8X deleted 14 s later | abeam, Rule 2 flip 2 s before L |
| `s2.csv` | S2 | 119 | 8T, landing al-L 3.5 with 3.85, 8V deleted at al-L about 2.8 | abeam, flip after L |
| `s3.csv` | S3 | 119 | 8T, landing al-L 3.5 with 3.45, 8V deleted at al-L about 2.9 | lead-looking (masked by XTK < 1.0 from al-L 1.06) |
| `a60.csv` | A | 60 | 8T, landing al-L 0.51 with 2.10 | abeam, flip after L |
| `b2_60.csv` | B2 | 60 | 8T, landing al-L about 0.6 with 1.56 entered, 8V deleted 18 s later | alert before L but no turn at L; flip after L |
| `b2n_60.csv` | B2' | 60 | 8T, landing al-L 0.55 with 1.60, no delete | abeam, flip just after L |
| `c2n_60.csv` | C2' | 60 | 8T, landing al-L 0.52 with 1.48, no delete | abeam, flip before L, turn at L |
| `c2m_60.csv` | C2'' | 60 | 8T, landing al-L 0.26 with 1.30, no delete | lead |

## Run Y (8T, 239 kt: the history test)

**Predictions** (land al-L 4.0 with 4.45): C1 abeam (above 4.0 at 45 s = al-L 3.0), C3 abeam, C2 undecided (about
3.65 at 2.1 against [3.6, 3.8)), E2 lead (about 3.3 at 1.5). Decisive when XTK > 4.0 at al-L 3.0 and <= 3.5 at 1.5.

**Observed.**

| pass | 3.2 | 3.0 (45 s) | 2.8 | 2.5 | 2.1 | 1.5 | 1.0 | 0 | alert onset | switch |
|---|---|---|---|---|---|---|---|---|---|---|
| Y1 | 4.30 | **4.20** | 4.09 | 3.84 | 3.42 | **2.77** | 2.27 | 1.50 | al-L 1.00 (XTK 2.3), 21.3 s before | al 3.92 = L, XTK 1.50, line 2 the arc |
| Y2 | 4.64 | **4.50** | 4.48 | 4.19 | **3.77** | **2.94** | 2.34 | 1.50 | al-L 1.00 (XTK 2.3), 19.8 s before | al 4.01 = L, XTK 1.50 |

Both decisive by the criteria, both **lead**; sequencing at bearing 289, alert end 3.82 and 3.92 past (L 3.98). The
take-home flew about 0.8 NM nearly parallel, then intercepted at 45-50 deg. Y1 was flown once more as Y2 with a
larger offset so that XTK stayed above 4.0 through the whole 42-48 s bracket: Y2 had 4.5 there, the value of T7.

**Verdict.** C1: refuted (lead with 4.2 and 4.5 at 45 s; it needs abeam above 3.9-4.0). C3: refuted (Y2 4.19-4.5 at
al-L 2.5-3.0, lead). C2: fits (3.42 and 3.77 at 2.1 lead) but Y2 squeezes its 239-kt gate to [3.77, 3.8), against
T7's 3.8 abeam: within the display resolution. E2: fits at 8T (2.77, 2.94 at 1.5). High confidence for the
observations. Y2 and T7 had almost the same history (4.5 at 45 s; 4.19 against 4.10 at 2.5; 3.77 against about 3.8 at
2.1; 2.94 against 3.14 at 1.5) and opposite plans. Rule 2 at 239 kt was not tested (both lead).

## Run V (8V, 239 kt: the 8V gate below 4.0)

**Changed setup.** As specified (land al-L 3.3 with 3.75) today's 239-kt take-home (1.2-1.4 NM of XTK lost per NM
from al-L 2.1 to 1.5) would give about 2.6 at 1.5, which does not test E2's 8V gate against T7 (abeam with 3.14 at
1.5). I used the snap trick to hold the XTK: land al-L about 4.1 with 4.15, then delete a flown waypoint. Both
deletes fired later than intended, at al-L about 2.4 (V2: the first try left the cursor on the Leg field; 8Z had not
been re-inserted, so 8Y was deleted). At 239 kt the snap gave the slow intercept.

**Predictions** (re-planned): C2 lead if XTK at 2.1 < 3.77; E2 (8V gate below 3.14) abeam if XTK at 1.5 >= 3.15.

**Observed.**

| pass | 2.1 | 1.5 | 1.0 | 0 | alert onset | switch | after |
|---|---|---|---|---|---|---|---|
| V1 | **3.60** | **3.50** | 3.24 | 2.52 | al-L 1.20 (XTK 3.4), 26 s before | al 1.82 = L, XTK 2.50 | sequencing at 293, alert end 1.84 past (L 1.88) |
| V2 | **3.30** | **3.20** | 2.90 | 2.23 | al-L 1.16, 24 s before | al 1.86 = L, XTK 2.20 | sequencing at 291, alert end 1.74 past |

Both **lead**. XTK at al-L 3.0 was not seen (the FPL page was shown).

**Verdict.** E2: refuted at 8V (lead with 3.50 and 3.20 at 1.5, at the same waypoint and speed where T7 was abeam
with 3.14); V1 is the clear one, V2 is at the display resolution. C2: fits (3.60, 3.30 < 3.77). C1: refuted by Y
anyway. Caveat: both deletes came at al-L about 2.4, just outside C2's window; if an edit makes the unit decide at
once (see S1, B2), V1 and V2 were decided at the edit with XTK about 3.4-3.7. Confidence medium.

## Run S (8T, 119 kt: time or distance window)

Three passes; none was decisive. The snap trick did not give the slow 14-27 deg intercept at 119 kt: after each
delete the take-home settled at about 40-44 deg.

- **S1.** The first jump (6 NM from the 8V-8U leg) was ignored; the S jump was flown as a single jump that kept the
  take-home's current heading of 083. Landing al-L 3.72 with 2.9; 8X deleted 14 s later. XTK 3.00 at 3.2-2.8, 2.86 at
  2.5, **2.58 at 2.1, 2.05 at 1.5**, 0.99 at al-L 0.32. Alert onset at al-L 0.07, 12.0 s after the first 0.99 frame
  and only 2.0 s before the switch at al 1.96 = L: an **abeam** plan flipped by Rule 2 just before the turn point
  (a lead plan's alert comes at about al-L 0.55). All candidates but C3 predicted lead with this profile (C2: 2.58 <
  2.75; E2/C1: 2.05). Fits C3, and fits "an edit decides at once" (XTK about 2.9-3.0 at the delete, above 2.75).
  Confounded by the botched start and the delete.
- **S2.** Proper two-jump start, landing al-L 3.5 with 3.85, 8V deleted at al-L about 2.8 (XTK 3.55). XTK 3.50 at 2.5,
  3.27 at 2.1, 2.80 at 1.5, 1.34 at L; no alert, no switch at L; switch 6.2 s after the first 0.99 frame at al-L
  -0.54, line 2 the arc: **abeam**. Every candidate predicted abeam for this profile. Not decisive.
- **S3.** Landing al-L 3.5 with 3.45, 8V deleted at al-L about 2.9 (XTK 3.3). XTK 2.95 at 2.5, 2.16 at 2.1, 1.37 at
  1.5, 0.99 at al-L 1.06; alert at al-L 0.62 (21 s before the switch), switch at L: lead-looking, but XTK was below
  1.0 20 s before the alert, so an abeam decision plus a flip before L looks the same. Not decisive.

S was stopped after three passes. The profile it needs (2.9 or more at 2.1 and 2.6 or less at 1.5) requires a slow
intercept, and only the delete gives one, which brings in the edit as a confound.

## Rule 1 after Y, V, S

| candidate | Y1 | Y2 | V1 | V2 | S1 (confounded) | S2 | verdict |
|---|---|---|---|---|---|---|---|
| C1 (45 s, 2.75 / 3.9-4.0) | abeam predicted, lead | abeam predicted, lead | (lead) | (lead) | lead predicted, abeam | abeam | **refuted** (Y1, Y2) |
| C2 (2.1-2.2 NM, 2.75 / [3.6, 3.8)) | lead | lead, gate squeezed to [3.77, 3.8) | lead | lead | lead predicted, abeam | abeam | **survives on a hair**: T7 (abeam about 3.8) against Y2 (lead 3.77) is within the display resolution; S1 contradicts it if S1 is not an edit effect |
| C3 (2.5-3.3 NM, 2.75 / 4.0) | 4.2 at 3.0, abeam predicted, lead | abeam predicted, lead | lead | lead | abeam | abeam | **refuted** (Y2; Y1 unless the window ends below 2.8) |
| E2 (1.5 NM, per waypoint) | lead | lead | abeam predicted, lead | abeam predicted, lead | lead predicted, abeam | abeam | **refuted** at 8V (V1, V2 against T7) |

What the 239-kt data now say: every 239-kt pass flown in from below about 5 NM is lead (T10, G', Z', 3a'', Y1, Y2,
V1, V2), with up to 4.5 at 45 s and up to 3.5 at 1.5. T7 (landing 6.0, above 4.0 until al-L 2.51) and T11 (landing
4.2 at al-L 2.67, above 4.0 until 1.67) are the only 239-kt abeam passes with XTK below 4.0 at 1.5. Y2 matches T7 from
al-L 3.0 down. So **T7 is the outlier none of the candidates handles**, and a straight T7 repeat (one jump to 7.7 NM
before 8V with 6.0 left, HDG 332) is the cheapest next test. If the 4.0 cap is dropped, C1's 60-kt form (83 s of GS,
5.5 NM uncapped at 239 kt) fits every 239-kt pass but T7 and T11.

The edit effect is a new open question: S1 (abeam with a small XTK after a delete at al-L 3.5) and B2 below suggest
that a delete made before the turn re-decides or drops the plan. #440 3c (the morning's run) showed only that a delete
keeps an existing abeam plan.

## Third speed: 60 kt (third-speed.md)

GS 60 entered on SET 1 was accepted (shown 59-61 kt) and the take-home flew normally, with sequencing and turns. No
contingency was needed. All passes: two-jump start (22 NM before 8T on course, then the start), HDG 304, landing
inside the 45-s window (al-L 0.75), so the landing decides. At 60 kt: L 1.00-1.02 (60-s cap), rho 0.27.

**Predictions** (gate forms): F1 = 83 s of GS = 1.38 NM; F3 = 60 s of GS + 0.75 = 1.75; F2 = r + 2.15 = 2.47.

| pass | landing | XTK at L | alert | switch | plan | F2 | F3 | F1 |
|---|---|---|---|---|---|---|---|---|
| A | al-L 0.51, **2.10** | 1.30 | with the switch | al 0.66 (al-L -0.35), 8.5 s after the first 0.99, XTK 0.91, line 2 0.94 arc | **abeam** | lead predicted: refuted | abeam: fits | abeam: fits |
| B2 (8V deleted 18 s after the landing) | al-L about 0.6, 1.56 entered (landing frame not on NAV 1) | 1.15 | flashing from al-L 0.32 to al 1.03 = L, then off with no turn | al 0.82, 8.0 s after the first 0.99, XTK 0.90 | lead alert, no lead turn: confounded by the delete | - | - | - |
| B2' (no delete) | al-L 0.55, **1.60** | 1.01 | with the switch | al 0.94 (al-L -0.08), 4.75 s after the first 0.99, XTK 0.94 | **abeam** | - | lead predicted: refuted | abeam: fits |
| C2' (no delete) | al-L 0.52, **1.48** | 0.88 | 5.75 s after the first 0.99 (al-L 0.10), 8.25 s before the switch | al 1.00 = L, XTK 0.82 | **abeam** + flip before L (a lead alert would have come at al-L 0.18) | - | refuted | abeam: fits |
| C2'' (no delete) | al-L 0.26, **1.30** | 1.14 (never below 1.0) | from 0.75 s after the landing | al 1.02 = L, XTK 1.10, line 2 the arc | **lead** | - | - | lead: fits |

Sequencing at bearing 290 and alert end 0.92 past 8T in every 60-kt pass.

**Changes to the tree.** After A (abeam) the tree went to B2 (1.56 with the snap trick). B2's delete gave the
unexplained picture above, so I flew B2' without the snap trick (1.60). B2' and A put the gate below 1.60, so I flew
C2' (1.48) instead of the tree's C2 (1.25 with the snap trick) to bracket between F1 and 1.60. Then C2'' (1.30)
confirmed it from below without the snap trick: a landing at al-L 0.26 (inside 20 s of closure) makes a lead plan's
alert come at once, and XTK stayed above 1.0 to L, so no flip was possible. The optional 180-kt pass C1 belongs to
the "B2 = lead" branch and was not flown.

**Result.** **G(60) in [1.30, 1.48)**: lead with 1.30, abeam with 1.48, 1.60, 2.10. F1 (1.38) is inside. F3 (1.75)
and F2 (2.47) are refuted. In third-speed.md's form G(60) = 1.39 + 0.50 a, this gives **a in [-0.18, 0.18]**: the gate
is proportional to the ground speed (83 s of GS fits 60 and 119 kt; 1.30-1.48 NM is 78-89 s at 60 kt). Confidence:
high for F2 and F3 refuted (margins 0.15-0.6), medium-high for the bracket (C2'' needed the late landing; C2' is read
from the alert timing, 8.25 s against at least 10 s for a lead). The 45-s window itself is not tested by these passes.
B2 (1.56 with a delete) is unexplained. If its landing read about 1.5 and the plan was lead, the delete dropped the
lead turn but not its alert. That conflicts with the bracket (abeam with 1.48) unless the true landing value was lower.

**Rule 2 at 60 kt.** Every abeam pass flipped after XTK went below 1.0, with line 2 the arc distance and the alert on
with the switch (A 8.5 s after the first 0.99 frame, B2 8.0, B2' 4.75, C2' 5.75 to the alert). R2-A (1.0 NM, periodic
check) fits at 60 kt. A flip before L (C2') starts the turn at al = L. At 119 kt S1's flip came 12.0 s after its
first 0.99 frame and S2's 6.2 s: S1 raises the largest lag seen from 10.5 to 12.0 wall s.

## Trainer state left behind

- KLN 89 trainer running, NAV 1 shown, cursor off, line 2 `Fly L/R`, take-home flying at GS 120 (shown 119 kt) on
  8S to 8R (9.6 NM to 8R at 00:02), SET 1 HDG 280, a message pending. SET 4 turn anticipation DISABLED.
- FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R, checked row by row at 00:02. During the session 8Z, 8Y, 8X and 8V were deleted
  (V1, V2, S1, S2/S3, B2) and inserted again with the same idents in the same order; a stray 8X insert was canceled.
  No user waypoint created, changed or deleted, no numbered flight plan touched, the VM not started, stopped or reset.
- At the start, jump.ps1 expected the SET group to open on SET 1, but it opened on SET 4 (the last SET page used).
  Its keys toggled SET 4 a few times and pressed ENT there; I set SET 4 to ENABLED by hand and checked it. No other
  page was touched.