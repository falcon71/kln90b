# KLN 89 trainer check: sequencing when a waypoint is passed off course (2026-10-20, 19:20-20:30)

Follow-up to `trainer-report.md` (runs A-G, TA-off run). Same setup: VM "Windows 98", SET 1 take-home flying,
SET 4 turn anticipation ENABLED, FPL 0 = 8Z 8Y 8X 8V 8U 8T 8P 8S 8R (user waypoints as in the first report,
section 6). Times are wall-clock seconds of the 4 Hz COM recorder; trainer s = about 0.94 x wall s. "XTK" is the
value on NAV 1 line 2 (cross-track to the ACTIVE leg), "d" the distance in line 1, "brg" the bearing To in line 4.
Nothing in the repository was changed; nothing was posted.

## 1. The rule

Confidence: high for the threshold and for both branches; medium-high for the exact geometry of the "closest
leg" test (section 5).

With turn anticipation on, the trainer evaluates every second which of two regimes applies to the active leg:

**A. "On the leg": |XTK| <= 4.0 NM.** Turn-anticipation logic.
- The turn (DTK switch, `M` prompt) starts when the straight distance d <= L (L = r tan(theta/2), capped at 60 s
  of GS and half the inbound leg, as in the first report), or, if d never gets that small, **when the waypoint is
  abeam** (TO/FROM line). In the abeam case the transition arc is degenerate: during the turn line 2 shows
  **XTK = distance to the waypoint** (Fly toward the turn side), i.e. an arc of radius zero at the waypoint.
- The active waypoint changes **when the aircraft crosses the bisector line** of the two legs (through the waypoint),
  from either side. Off course on the outside this is 35-115 s after the abeam turn start (C, D, R2, R6).
- Alert: ~20 s before a predicted d = L turn start; **~15 s before the abeam line** when the turn will start abeam
  (C, D, R2, R6: 15-18 wall s). The arrow keeps flashing until the turn is about complete (TK within ~5 deg of
  the new DTK: R6 flashing ended at TK 092 vs DTK 094).

**B. "Off the leg": |XTK| > 4.0 NM.** No turn anticipation at all. The unit **sequences as soon as the next leg
is at least as close as the active leg**, where "close" is the distance to the leg *segment* (perpendicular
distance while the foot of the perpendicular lies on the segment, otherwise the distance to the nearer end
waypoint). Concretely:
- outside of the turn: at the **abeam line** of the active waypoint (there both segment distances equal d):
  E, F, R1, R3, R4 all sequenced at bearing = DTK + 90 within one second, with no DTK-switch phase and no
  flashing afterwards;
- inside of the turn: at the **inside bisector** of the two legs, however far from the waypoint: R7 sequenced
  11.0 NM from 8X with XTK 9.4 (next-leg XTK also 9.4), R8 sequenced 5.5 NM from 8Y, 1.4 NM *before* the abeam
  line, with XTK 5.3 -> next-leg XTK 5.2.
- Alert in regime B: the arrow flashes while the predicted time to the abeam line (along-track rate) is <= ~36 s:
  39-41.5 wall s (37-39 trainer s) before the abeam sequencing in E, F, R1, R3, R4, R6 and R2 (burst). The TA-off
  run of the first report (34.5 wall s) is the same alert. For the inside-bisector sequencings (R7, R8) **no
  alert was given at all** (the arrow stayed steady; the prediction apparently only knows the abeam line).
- The regime is **re-evaluated every second, not latched**: in R2 and R6 the regime-B alert started 40 s before
  abeam with XTK 4.3 / 4.7, **stopped the second line 2 fell to 4.0 / 3.9 NM** (d still 4.1), and the regime-A
  alert started 15-18 s before abeam; the turn then started at abeam and the waypoint sequenced at the bisector.

The threshold is on the active leg's XTK, not on d (R6: alert off at XTK 3.9 while d read 4.1; R2: XTK 4.0 vs
d 4.1). It is the same at 119 and 239 kt (4.0 in R2 and R6, so neither 2L nor a time), and the same for 31, 62,
92 and 150 deg turns. I found no quantity of the geometry that it equals; the only coincidence is the 60-s lead cap
at 240 kt (4.0 NM).

What this answers for the first report's open question: D (XTK 2.8) was regime A, E and F (6.9, 4.8) were
regime B. The boundary between them is 4.0 NM of cross-track error, not a multiple of L.

## 2. Evidence per run

Previous runs (first report) re-read from the frames, new runs R1-R8 (this session). "XTK at abeam" = line 2 when
bearing = DTK +- 90. "seq" = active waypoint change. Convergence in all passes: the take-home aircraft intercepts
the active leg at 45 deg (TK = DTK +- 45).

| Run | Wpt, turn | GS | side | XTK at abeam (NM) | regime | alert (wall s before seq/turn) | turn start | sequencing |
|---|---|---|---|---|---|---|---|---|
| C | 8U 120 L | 119 | outside | 1.15 (L 1.08) | A | 15.5 before turn | abeam | bisector, d 0.8, 35 s later |
| D | 8T 150 R | 119 | outside | 2.75-2.8 (L 2.0) | A | 15.2 | abeam, XTK = d | bisector (brg 108/109), d 1.3, 93 s later |
| R2 | 8T 150 R | 119 | outside | 3.5 | A | B-burst 40.0..25 before abeam (XTK 4.3 -> 4.0), then 18 | abeam (260.5 s), XTK = d | bisector (brg 105-108), d 1.5, 114 s later |
| R6 | 8T 150 R | 239 | outside | 3.0 | A | B-burst 40.3..21.8 before (XTK 4.7 -> 3.9), then 15.8 | abeam (229.5), XTK = d | bisector (brg 107), d 1.9, 51.5 s later |
| R1 | 8T 150 R | 119 | outside | 4.3 | B | 40.0 before abeam | none | abeam (279.0), next XTK 3.6 |
| R4 | 8T 150 R | 239 | outside | 4.4 | B | 41.5 | none | abeam (103.5), next XTK 3.8 |
| F | 8T 150 R | 239 | outside | 4.85 | B | 38.9 | none | abeam |
| R3 | 8V 92 R | 119 | outside | 5.1 | B | 41.5 | none | abeam (256.0), next XTK 0.15 |
| E | 8T 150 R | 119 | outside | 6.9 | B | 39.3 | none | abeam |
| R7 | 8X 62 L | 119 | inside | (XTK 9.4 at seq) | B | none | none | inside bisector (brg 093, bisector 094), d 11.0, 45 s after the jump |
| R8 | 8Y 31 R | 119 | inside | (XTK 5.3 at seq) | B | none | none | inside bisector (brg 290, bisector 289.5), d 5.5, 1.4 NM before abeam |
| TA off | 8U 120 L | 119 | outside | 1.2 | (TA off) | 34.5 | none | abeam |
| A | 8V 92 R | 119 | outside | jump 2 NM before, 1 left | A? | - | at the jump (re-init) | bisector, d 1.3 |
| on course (12 turns, first report) | | 119/239 | - | 0 | A | 22-26 before d = L | d = L | bisector |

Run A is a SET 1 re-initialization artifact (the unit came up already in the turn, showing the next leg's XTK
1.9), not a sequencing observation; it does not contradict the rule.

Bisector bearings (magnetic, from the trainer's DTKs): 8T 109/289, 8U 275/095, 8V 108/288, 8X 094/274, 8Y
289.5/109.5. Inside bisector = where the perpendicular distances to the two leg lines are equal; outside bisector
= its extension through the waypoint.

## 3. New runs, raw log

Wall s from each recording's start; format d, FROM>TO, flash, GS, line 2, DTK, TK, brg, ETE. All jumps: SET 1
lat/lon, HDG = inbound DTK, `Ok?`; start points from `startpt.py <wpt> <NM before> <+right/-left>`.

**R1** (rec/r1; 8T, start 3 NM before, 6.4 left, 119 kt; jump 19:27): 159.0 8U>8T Fly R 6.4 TK 305; TK 348 by
251; 239.0 flashing starts, d 5.2, XTK 5.1, brg 024, ETE 0:02; 276.3 d 4.3 XTK 4.3 brg 033; **279.0 8T>8P, DTK 94,
Fly L 3.6, brg 088 To 8P**, flashing stopped at 279.3; the aircraft then turned right to the 094 leg.

**R3** (rec/r3; 8V, 3 before, 7.3 left, 119 kt; 19:34): 133.8 8X>8V Fly R 7.3 DTK 332; TK 016 by 230; 214.5
flashing, d 6.0 XTK 6.0 brg 054; 255.8 d 5.1 XTK 5.1 brg 062 (abeam = 062); **256.0 8V>8U DTK 64 Fly L 0.15**,
flashing off; XTK then 0.06, 0.02, R 0.10 ... 0.29 while the aircraft turned onto 065.

**R2** (rec/r2; 8T, 3 before, 5.65 left, 119 kt; 19:41): 140.3 8U>8T Fly R 5.7; 220.5 flashing starts d 4.4
XTK 4.3 brg 023; 233.0 XTK reads 4.0 (d 4.1); 235.5 flashing stops (XTK 4.0, d 4.1); 237.5 XTK 3.9; 242.5
flashing again, d 3.8 XTK 3.8 brg 029; 258.8 d 3.5 XTK 3.5 brg 034; **260.5 DTK 304 -> 94**, still 8U>8T, line 2
Fly R 3.4 = d; then XTK = d all the way: 3.0/3.0 (281), 2.6/2.6 (301), 2.0/2.0 (338), 1.6/1.6 (366); TK turned
348 -> 046; brg 036 (264) ... 097 (362), 105 (370.5); **374.5 8T>8P, brg 095 To 8P, Fly R 1.5**; flashing continued
(turn not complete, TK 046 -> 093 by 424).

**R4** (rec/r4; 8T, 5 before, 7.6 left, GS 240 -> 239 shown; 19:55): 20.0 8U>8T Fly R 7.5 TK 317; TK 347 by 86;
62.0 flashing, d 6.4 XTK 6.1 brg 017; 103.25 d 4.4 XTK 4.4 brg 034; **103.5 line 2 Fly L 3.8 (next leg) with DTK
still 304; 103.75 8T>8P DTK 94**, flashing off.

**R6** (rec/r6; 8T, 5 before, 6.2 left, 239 kt; 20:02): 133.8 8U>8T Fly R 6.2; 189.25 flashing, d 5.1 XTK 4.7
brg 013; 205.5 XTK reads 4.0 (d 4.2); 207.5 XTK 3.9, 208.0 flashing stops (d 4.1); 213.75 flashing again, d 3.8
XTK 3.7 brg 023; 229.0 d 3.0 XTK 3.0 brg 033; **229.5 DTK 304 -> 94**, line 2 Fly R 3.0 = d; XTK = d: 2.4/2.4,
2.0/2.0 (263); brg 034 -> 107 (278.5); **281.0 8T>8P brg 095 To 8P Fly R 1.9**; line 2 stayed 1.9-2.1 through the
turn (TK 022 -> 092), flashing ended 322.8 at TK 092; then line 2 fell 2.0, 1.9, 1.8, 1.7 ...

**R7** (rec/r7; 8X, 7 before, 10 left = inside of the 62 deg left turn, GS 120; 20:09): 203.3 8Y>8X Fly R 10.0
DTK 035 TK 035 brg 090 d 12.2 (the start point is due west of 8X); TK turned to 072 by 244; XTK 10.0 -> 9.5, d
11.1; no flashing at any time; **248.25 8X>8V DTK 332, line 2 Fly R 9.4 (next-leg XTK), brg 010 To 8V d 15.2**;
the aircraft then turned left to intercept the 333 leg (XTK 9.4 -> 2.1 by 561).

**R8** (rec/r8; 8Y, 5 before, 8 right = inside of the 31 deg right turn, 119 kt; 20:21): 130.3 8Z>8Y Fly L 8.0
DTK 004 TK 003 brg 306 d 9.4; TK turned to 320 (45 deg intercept) by 232; XTK 8.0 -> 5.3, d 9.4 -> 5.5, brg 306 ->
290; no flashing; **276.25 8Y>8X DTK 035, line 2 Fly L 5.2 (next-leg XTK), brg 018 To 8X d 17.9**; then the
aircraft turned right onto the 035 leg (XTK 5.2 -> 2.2 by 398). Predicted beforehand by a 45-deg-intercept
simulation: crossing of the inside bisector after ~150 s at XTK ~5.1, 1.4 NM before abeam (observed 146 s after the
first NAV frame, XTK 5.3, 1.4 NM).

**R5 attempt** (rec/r5; 8S, 3 before, 7.2 left; 19:50): the jump re-oriented to 8S>8R (the point is 6.7 NM from
the 8S-8R line and 7.2 from the 3-NM leg 8P-8S); abandoned at once (the recording holds only the jump and the first
seconds). Note: 8P sits 3 NM before 8S, so 8S has no usable inbound leg for off-course passes.

## 4. Candidates rejected

- **A multiple of L (2L etc.), or a time at GS**: D (2.8, L 2.0) regime A vs F (4.85, L 3.98) regime B, and R6
  (3.0 at 239 kt, L 3.98) regime A vs R1 (4.3 at 119 kt, L 2.0) regime B. The boundary is 4.0 at both speeds.
- **d - L > ~0.8 NM** (fitted D 0.75 vs F 0.87): R2 (3.5 - 2.0 = 1.5) stayed regime A.
- **Next-leg XTK** (D 2.4 vs F 4.2 looked like a 4-NM threshold on it): R3 sequenced at abeam with next-leg XTK
  0.15 (92 deg turn), and R7/R8 sequenced with next-leg XTK 9.4 / 5.2.
- **Distance d instead of XTK**: R6's regime-B alert ended when XTK read 3.9 with d 4.1 (R2: XTK 4.0, d 4.1).
  Small margin, but consistent twice.
- **A latched decision at the alert**: R2 and R6 switched regime B -> A 20-25 s before abeam.
- **The predicted closest approach, the intercept angle, the bearing to the next waypoint**: constant across the
  runs (45 deg intercept everywhere) and cannot produce the D/R2 vs R1/R4 split at equal angles.
- **Closest leg by lines (infinite)**: an outside pass would then sequence at the external bisector (DTK +- 90
  minus half the turn), i.e. before abeam; all outside regime-B runs sequenced at the abeam line (DTK + 90 within
  1 deg). Closest leg by *segments* gives the abeam line outside and the bisector inside, which is what was seen.
- **"Beyond the end of the computed turn / outside its circle"**: D (2.8 NM, well outside the circle of radius
  0.54 at 2.07 NM from 8T) stayed regime A; E/F/R1/R4 are at 1.1-3.4 x L. No consistent cut.
- **Which side of the turn**: both sides sequence in regime B (outside at abeam, inside at the bisector), so the
  side changes the place, not the regime.
- "Which leg is closer" was rejected in the first report because D would then be immediate: D is regime A
  (XTK 2.8), where that test does not run; the test exists but only above 4 NM.

## 5. Confidence and what remains open

- Threshold 4.0 NM on the active-leg XTK, speed-independent, continuously evaluated: **high** (two direct
  transitions at 4.0 at 119 and 239 kt, five regime-B and four regime-A passes consistent).
- Regime B sequencing = "next leg segment at least as close": **high** for the outside (5 abeam sequencings
  within 1 deg) and **medium-high** for the inside (R7 and R8 both at the bisector within 1-2 deg; whether the tie
  counts (<= vs <) is not distinguishable at 1 Hz).
- Regime A off course: turn start at abeam with XTK = d, sequencing at the bisector: **high** (C, D, R2, R6).
- Open: (1) an inside pass with XTK <= 4 (not flown; presumably the normal d <= L turn, since the aircraft
  converges); (2) whether the 4.0 NM is tied to the +-5 NM CDI scale (could not be tested in the trainer: a CDI
  scale change needs a long cursor edit and approach mode never arms there); (3) the regime-B alert for an inside
  sequencing (none in R7/R8; maybe the prediction only looks at the abeam line); (4) the XTK-vs-d question rests
  on two 0.1-0.2 NM margins; (5) run A's immediate turn after a jump is a re-init behaviour, not sequencing; (6)
  the SET 1 re-orientation rule (R5 picked the next leg when its line was closer; G in the first report did not)
  is not the sequencing rule and was not pursued.

## 6. Driving lessons (additions to the first report's section 5)

- Alternate the waypoints between runs (8T, 8V, 8T, ...) so every jump is > 15 NM from the aircraft; no second
  "far" jump was needed in 8 runs.
- Expected XTK at abeam for an outside pass = start offset minus ~0.75 x (NM before) at 119 kt and ~0.64 x at
  239 kt (the 45 deg intercept after a slow turn-in): 3 before/5.65 left gave 3.5, 3/6.4 gave 4.3, 5/6.2 at 239
  gave 3.0, 5/7.6 at 239 gave 4.4.
- Inside passes that cross the bisector before reaching the leg need the start offset larger than the distance
  before the waypoint (offset/before above tan of half the inside angle); a few-line simulation in the (along,
  cross) frame predicted R8's crossing to within 10 s and 0.2 NM.
- A jump near a short leg (8P-8S is 3 NM) re-orients to the neighbouring leg; keep 8S out of such runs.
- `ev4.py <recdir> [t0 t1 step]` (scratchpad `t\`) lists events from a copy of log.csv while the recorder is
  still appending; it caches OCR in ocr.json. Several recorders may run at once (shared VM locks).
- The regime-B alert is a good online indicator: flashing ~40 s before abeam = regime B; flashing starting ~15 s
  before = regime A; a 20-s burst that stops = XTK just crossed 4.0.
- The HDG field on SET 1 is captured as `###` (inverse video) by the OCR while pending; the value cannot be
  verified before `Ok?`, but the jump script's heading took every time (TK = DTK on the first NAV frame).

## 7. Left behind

- Trainer: running, maximized, NAV 1, cursor off, flying SET 1 take-home at GS 120 (shown 119) on 8Y -> 8X
  (13.7 NM to 8X at 20:27, XTK 1.0 L; it will fly the rest of FPL 0), SET 1 HDG 004 as last entered, SET 4 turn
  anticipation ENABLED, message state untouched (one `M` from before may still be pending). FPL 0 unchanged:
  8Z 8Y 8X 8V 8U 8T 8P 8S 8R. User waypoints unchanged (8P-8Z, 8Q, the stray `0`). The AVsoftech trainer was not
  used. VM display 1920x1200 unchanged.
- Scratchpad `...\scratchpad\t\`: new `ev4.py`, `now_*.png`, `h_*.png`, `final_*.png`, and recordings
  `rec\r1 r2 r3 r4 r5 r6 r7 r8` (~180 MB of PNG frames plus ocr.json caches; r5 is the abandoned jump). The old
  recordings (run240, run120, q2b, q2c, ~340 MB) are still there. Delete when no longer needed.
- Repository: untouched (branch investigate-375-157; only the pre-existing untracked
  test/flight/flights/skippedLeg.test.ts).
