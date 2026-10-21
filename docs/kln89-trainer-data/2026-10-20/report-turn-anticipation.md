# KLN 89 trainer check: waypoint sequencing and turn anticipation (2026-10-20)

Agent check in the Bendix/King KLN 89 trainer (VM "Windows 98"), SET 1 take-home flying, SET 4 turn anticipation
ENABLED unless noted. The AVsoftech KLN 90B trainer was NOT used (time went to questions 1 and 2; see the end).
All times below are wall-clock seconds of my recorder unless marked "trainer s". The trainer's own time runs slower:
the aircraft covered ground at 223-225 kt (wall) while showing 239 kt, and 112-113 kt while showing 119 kt, so
trainer s = about 0.94 x wall s.

## 1. Summary of the rules found

**Q1, turn anticipation on the planned path (high confidence).**
- The turn start (DTK switches to the next leg, the `ADJ NAV CRS` message prompt `M` appears at the same second)
  comes at a straight distance to the waypoint of
  `L = r * tan(turnAngle/2)`, with `r` = the standard-rate radius, but the bank limited to 25 deg
  (119 kt: r = 0.63 NM, standard rate; 239 kt: r = 1.785 NM, the 25 deg radius). No additive roll-in distance
  is visible (a two-point fit at 239 kt gives an intercept of +0.004 NM).
- **L is capped at about 60 s of flight (GS x 1 min)**: 3.96-3.98 NM at 239 kt and 1.98-2.00 NM at 119 kt, for both
  150 deg and 171 deg. That is not an angle cap (the cap angle would differ between the speeds) and not a fraction
  of the leg (inbound legs 28 and 37.7 NM gave the same 4.0 NM).
- **L is further limited to half the inbound leg**: a 171 deg turn after a 2.0 NM leg started at 1.0 NM (at 239 and
  at 119 kt), after a 3.0 NM leg at 1.5 NM (119 kt). The unit did NOT skip the waypoint at once (contrast #76).
- The alert (arrow flashing) starts 22-26 wall s (about 21-24 trainer s) before the turn start, i.e. "about 20 s"
  plus 1-2 s; the flashing has a ~1.25 s cycle so the onset is known to about 1 s.
- **The active waypoint changes when the aircraft crosses the bisector of the turn** (the line through the waypoint
  that halves the angle between the legs), i.e. at the midpoint of the transition (4-8 says so). Checked by the
  bearing to the waypoint at the sequencing frame, which equalled the bisector bearing within 1-2 deg in every
  on-course turn (31 to 171 deg), and also from the outside of the turn when off course. For big turns this is well
  before the waypoint: 2.7 NM before at 150 deg and 3.2 NM before at 171 deg (239 kt) - this is the "skips legs
  early" the maintainer saw (the 2026-10-19 DLL case, 164 deg, 4.0 NM, sequenced 2.9 NM before, fits the same rule).
- After the sequencing the arrow keeps flashing until the turn is about complete (TK within ~5 deg of the new DTK
  for turns up to 120 deg: 6-30 s after the sequencing; 32-48 s after it for the capped 150-171 deg turns, ending
  while TK was still 12-64 deg off).

**Q2, off-course passage (#157) (medium-high).** The trainer always sequenced. Passing offsets at the abeam point of
0.1, ~1.2, 2.8, 4.8 (239 kt) and 6.9 NM (119 kt) were all sequenced, no maximum found.
- With an offset larger than L, the turn start (DTK switch) came **when the waypoint was abeam** (relative bearing
  90 deg, the TO/FROM line through the waypoint), not at a distance: 8T 150 deg at 119 kt, offset 2.8 NM, L = 2.0:
  DTK switch at abeam (d = 2.8 NM), then the aircraft turned and the waypoint was sequenced 93 s later at the
  bisector (d = 1.3 NM).
- With a larger offset the unit sequenced **at the abeam point at once**, with no separate turn phase and no
  flashing afterwards: 6.9 NM at 119 kt (L 2.0) and 4.8 NM at 239 kt (L 4.0). The threshold between "turn at abeam,
  sequence at bisector" and "sequence at abeam" lies between those cases; I could not pin it (it is not a fixed
  multiple of L: 2.8/2.0 turned, 4.8/4.0 did not).
- When the offset was below L (8U, 120 deg, 1.15 NM offset at abeam, L 1.08) the switch came at d about L/abeam
  (ambiguous) and the sequencing at the bisector (outside ray).
- Turn anticipation OFF (8U, offset 1.2 NM): sequenced at the abeam/TO-FROM line, d = 1.2 NM.
- All off-course passes were converging at 40-70 deg, because the take-home aircraft always steers to the active
  leg; a truly parallel pass could not be flown (see section 4). So "crossing beyond the waypoint at an angle" is
  what was tested.
- The borderline (offset ~ L) was flown at both speeds only in the sense above (2.8 NM at 119 kt, 4.8 NM at 239 kt).

**Q3, #375 (low-medium; the exact scenario cannot be flown).** The trainer aircraft always steers onto the active
leg, so flying past B toward D (or straight away from C) is not possible in take-home mode, and a SET 1 jump
re-orients the plan instead of exercising sequencing. Indirect evidence: after every big-turn sequencing the arrow
kept flashing for 30-48 s while the distance to the new active waypoint increased (8S at 239 kt: distance to 8R
22.8 -> 23.6 NM during the flashing), and the new waypoint was never skipped. That supports "C stays active".

## 2. Measurements

Flight plan FPL 0 (user waypoints, see section 5): 8Z, 8Y, 8X, 8V, 8U, 8T, 8S, 8R; course changes from the trainer's
own DTKs (magnetic): 8Y 31 R, 8X 62 L, 8V 92 R, 8U 120 L, 8T 150 R, 8S 171 L. "Switch" distance = the straight-line
distance at the switch, from a linear fit of the distance readings in the 90 s before the alert (residual <= 0.07 NM);
the displayed distance (0.1 NM) agrees.

### 2.1 Turn start distance (DTK switch), on course

| Waypoint, turn | GS shown | measured L (NM) | r tan(theta/2) (NM) | capped (60 s x GS, half leg) | displayed d / ETE at switch |
|---|---|---|---|---|---|
| 8Y 31 R  | 239 | 0.49 | 0.50 (r 1.785) | - | 0.5 / :07 |
| 8X 62 L  | 239 | 1.05 | 1.07 | - | 1.0 / :15 |
| 8V 92 R  | 239 | 1.86 | 1.85 | - | 1.8 / :27 |
| 8U 120 L | 239 | 3.12 | 3.09 | - | 3.1 / :46 |
| 8T 150 R | 239 | 3.98 | 6.66 | 3.98 | 3.9 / :59 |
| 8S 171 L | 239 | 3.96 | 22.6 | 3.98 | 3.9 / :59 |
| 8X 62 L  | 119 | 0.35, 0.39 (2 runs) | 0.38 (r 0.63) | - | 0.4 / :11 |
| 8V 92 R  | 119 | 0.69 | 0.65 | - | 0.7 / :19 |
| 8U 120 L | 119 | 1.08 | 1.09 | - | 1.1 / :32 |
| 8T 150 R | 119 | 2.00 | 2.36 | 1.98 | 2.0 / 0:01 |
| 8S 171 L | 119 | 1.98 | 8.0 | 1.98 | 2.0 / :59 |
| 8S 171 L after 2.0 NM leg (8Q) | 239 | 1.0 | 22.6 | 4.0 -> 1.0 | 1.0 / :14-:15 |
| 8S 171 L after 2.0 NM leg (8Q) | 119 | 1.0 | 8.0 | 2.0 -> 1.0 | 1.0 / :29-:30 |
| 8S 171 L after 3.0 NM leg (8P) | 119 | 1.47-1.5 | 8.0 | 2.0 -> 1.5 | 1.5 / :45 |

The 25 deg radius at 119 kt (0.44 NM) would give 0.27/0.46/0.77 NM for 62/92/120 deg; measured 0.35-0.39/0.69/1.08,
so standard rate below 25 deg. Standard rate at 239 kt (r 1.27) would give 1.31 NM for 92 deg; measured 1.86, so the
25 deg limit. The 8Y 31 deg case at 119 kt was flown converging from 0.3 NM left (after a jump with the old heading)
and switched at d 0.3 with XTK 0.30: not usable for the fit.

### 2.2 Alert onset before the switch (wall s; trainer s ~ x0.94)

239 kt: 8Y 24.8, 8X 25.5, 8V 23.8, 8U 25.3, 8T 24.5, 8S 25.8. 119 kt: 8V 22.0, 8X 22.3, 8U 22.5, 8T 23.3, 8S 23.8,
8S-after-3-NM-leg 24.6. Waypoint without a turn (8Q, 8P, ~1 deg): onset at ETE :14-:15, sequenced at 0.0 NM (as the
2026-10-14 record: 15 s).

### 2.3 Sequencing (active waypoint change), on course

| Waypoint | GS | s after switch (wall) | d at sequencing (NM) | bearing To at seq | bisector bearing To |
|---|---|---|---|---|---|
| 8Y 31  | 239 | 7.5  | 0.1 | ~330 (bearing unstable at 0.1 NM) | 289.5 |
| 8X 62  | 239 | 15.0 | 0.3 | 085 (frame before) | 094 |
| 8V 92  | 239 | 23.6 | 0.8 | 290 | 289 |
| 8U 120 | 239 | 29.6 | 1.8 | 094 | 095 |
| 8T 150 | 239 | 25.5 | 2.7 | 290 | 289 |
| 8S 171 | 239 | 13.6 | 3.2 | 099 | 099.5 |
| 8V 92  | 119 | 17.0 | 0.3 | 290 | 289 |
| 8U 120 | 119 | 21.3 | 0.6 | 094 | 095 |
| 8T 150 | 119 | 22.3 | 1.5 | 290 | 289 |
| 8S 171 | 119 | 11.8 | 1.7 | 100 | 099.5 |

For 31-120 deg the time from the switch to the sequencing matches the half-arc time r*theta/2 / GS within 1 s; for the
capped turns the aircraft lags the (tighter) path and reaches the bisector a few s later than that.

### 2.4 Off-course passes (all TA on unless noted; offset = |XTK| when the waypoint was abeam)

| Run | Waypoint, turn | GS | start (side, offset, dist before) | offset at abeam | turn start | sequencing |
|---|---|---|---|---|---|---|
| A | 8V 92 R | 119 | left 1.0, 2.0 | - | immediately after the jump (DTK 065, Fly R 1.9) | bisector, d 1.3, brg 289 |
| B | 8X 62 L | 119 | right 2.0, 5.0 | 0.1 (converged) | d 0.4 | at 0.0 |
| C | 8U 120 L | 119 | right 3.5, 2.0 | ~1.15 | at abeam (d 1.15, L 1.08) | bisector outside ray, d 0.8, brg 276-281 (bisector 275) |
| D | 8T 150 R | 119 | left 5.0, 3.0 | 2.8 | at abeam, d 2.8 > L 2.0 | 93 s later at bisector, d 1.3, brg 108 (bisector 109) |
| E | 8T 150 R | 119 | left 10, 4.0 | 6.9 | none separate | at abeam, d 6.9 |
| F | 8T 150 R | 239 | left 8.0, 5.0 | 4.8 | none separate | at abeam, d 4.8 |
| TA off | 8U 120 L | 119 | right 3.5, 2.0 | 1.2 | (no anticipation) | at abeam, d 1.2 |

Alert in the off-course runs: C began 15.5 s before the abeam switch (plus a 20 s burst right after the jump),
D 15 s before, E 39 s, F 39 s before the abeam sequencing; TA off began at d 2.1 (displayed ETE 1:00).

## 3. Raw observation log (condensed; full frame recordings are in the scratchpad, see section 6)

Format: wall s, displayed distance, FROM>TO, flash state, GS, line 2, DTK, TK, bearing, ETE.

run240 (start 9 NM before 8Y at 240 kt, 16:02):
- 115.5 d 2.0 8Z>8Y flashing starts (ETE :30); 140.26 d 0.5 DTK 4 -> 35, `M` prompt; 147.76 8Y>8X (d to 8Y was 0.1,
  brg 330); flashing to 157.5, TK 32 vs DTK 35.
- 403.0 d 2.6 flashing (:39); 428.51 d 1.0 DTK 35 -> 333; 443.51 8X>8V (d 0.3, brg 085 one frame before); flash to 459.5.
- 672.5 d 3.4 (:50); 696.26 d 1.8 DTK 333 -> 65; 720.01 8V>8U (d 0.8, brg 290); flash to 742.3.
- 994.25 d 4.7; 1019.51 d 3.1 DTK 65 -> 305; TK starts turning ~1024.5; XTK stays <= 0.02 NM; 1049.26 8U>8T
  (d 1.8, brg 094); flash to 1078.5.
- 1390.3 d 5.5; 1414.76 d 3.9 DTK 304 -> 94 (no switch at 6.7 NM); XTK grows to 0.43 R; 1440.26 8T>8S (d 2.7,
  brg 290, TK 355 = only 51 deg turned); flash to 1484.3.
- no switch near 20 NM before 8S (checked 1640-1750); 1942.3 d 5.5; 1968.0 d 3.9 DTK 95 -> 284; 1981.76 8S>8R
  (d 3.2, brg 099/100); distance to 8R rose 22.8 -> 23.6 while flashing until 2021.5; aircraft overshot to 2.4 NM.

run120 (jumps with SET 1 to on-course points, 16:38-17:46):
- 8Y: jump kept the old heading 253; converged from 0.9 NM left; 102.3 flashing; 123.01 d 0.3 XTK 0.30 DTK 4 -> 35;
  132.26 8Y>8X (brg 107 To = aircraft on the 287 side, bisector 289.5).
- 8V: 395.3 d 1.4 (:41); 417.26 d 0.7 DTK 333 -> 65; 434.51 8V>8U (brg 290).
- 8T: 727.0 d 2.7; 750.26 d 2.0 DTK 304 -> 94; 772.75 8T>8S (brg 290).
- 8S: jump to 6 NM before, no immediate switch; 1181.3 d 2.7; 1205.0 d 2.0 DTK 95 -> 284; 1216.76 8S>8R (brg 100).
- 8X: 1470.5 d 1.1 (:32); 1492.76 d 0.4 DTK 35 -> 333; 1505.0 8X>8V at 0.0-0.1.
- 8U: 1755.0 d 1.8 (:53); 1777.5 d 1.1 DTK 65 -> 305; 1798.76 8U>8T (brg 094).
- Run A 8V left 1/2: from the first NAV frame 2014.26: 8X>8V, DTK 65, Fly R 1.9, flashing; aircraft turned right
  to ~045-065; 2091.51 8V>8U at d 1.3, brg 289.
- Run B 8X right 2/5: 2308 Fly L 2.0; XTK 1.5 at 2350, 1.0 at 2376, 0.5 at 2410; 2447 flashing d 1.1;
  2470.0 d 0.4 XTK 0.11 DTK 35 -> 333; 2483.5 8X>8V.
- Run C 8U right 3.5/2: TK went to 354 (71 deg intercept) then shallowed; flashing 2713.5-2733.5 right after the
  jump, again from 2792.5 (d 1.5); 2808.0 d 1.2 XTK 1.2 brg 336-333 (abeam) DTK 65 -> 305; 2843.0 8U>8T, brg 281
  at the frame before, d 0.8.
- Run "8V left 10/2": re-orientation picked 8V>8U at once (32.3 NM to 8U, Fly L 2.2): run abandoned.
- Run D 8T left 5/3: 3268 Fly R 5.0; TK 348 (44 deg); 3371 flashing d 3.2; 3387.0 d 2.8 XTK 2.8 brg 034 (abeam)
  DTK 304 -> 94 (still 8U>8T); 3479.76 8T>8S, brg 108 To, d 1.3; flash to 3527.5.
q2b (17:41-18:41):
- TA OFF run (8U right 3.5/2): 261 flashing d 2.1 (ETE 1:00); 295.5 8U>8T at d 1.2, XTK 1.2, brg 337-339 (abeam
  335); no anticipation (DTK 65 until then).
- Run E 8T left 10/4: TK 349; 691 flashing d 7.7; 728.25 d 6.9 XTK 6.8 brg 034; 731.0 8T>8S DTK 94 at once, Fly L 5.9;
  flashing stopped at the sequencing.
- Run F (GS 240) 8T left 8/5: 1255 flashing d 6.8; 1294.5 d 4.8 brg 034 line 2 Fly L 4.1 (next-leg XTK) DTK 304;
  1294.75 8T>8S DTK 94; flashing stopped.
- Run G 8T left 6.5/4: re-orientation picked 8T>8S at once: abandoned.
- Short leg 2.0 NM (8Q inserted 2 NM before 8S), 239 kt: 2236.5 flashing d 1.0 to 8Q (:15); ~2252 8Q>8S at 0.0;
  2268.76 d 1.0 (:14) DTK 95 -> 284; 2275.25 8S>8R d 0.7 brg 097.
- Same at 119 kt: 3073 flashing d 0.5 to 8Q (:14); 3090.25 8Q>8S; 3096.5 flashing d 1.8; 3122.0 d 1.0 (:29)
  DTK 95 -> 284; 3128.5 8S>8R d 0.8 brg 099.
q2c (8P 3.0 NM before 8S, 119 kt): 421.5 flashing d 0.5 to 8P (:15); 438.25 8P>8S; 461.5 flashing d 2.3;
  486.25 d 1.5 (:45) DTK 95 -> 284; 495.75 8S>8R d 1.3 brg 098; flash to 527.6.

## 4. How the setups were driven

- Flight plan of user waypoints made directly on FPL 0 (delete FPL with the cursor off: CLR, ENT; then on the blank
  row: ident, ENT, `User Pos L/L?` ENT, lat ENT, lon ENT, ENT on the USR 1 page). Courses and lengths in section 5.
- Flying: SET 1 take-home with GS and HDG. The 240 kt run flew the whole plan in one go (33 min); the 120 kt and the
  off-course runs used SET 1 position jumps (lat/lon, GS, HDG, `Ok?`) to points computed with great-circle math on
  the inbound course, D NM before the waypoint and X NM to the side.
- Recording: a background PowerShell loop took VirtualBox COM screenshots (`TakeScreenShotToArray`, PNG, ~50 ms)
  every 250 ms, cropped to the unit's screen (x 10-505, y 20-166). A template OCR on the dot grid (dot x =
  2.42 + 3.05 k, centre +1.3 px; dot rows of the four text lines at y 9-30, 41-61, 72-92, 103-123; the big distance
  digits in line 1, cells 0-3, are 8 dots high starting y 6) read every frame; templates were labelled by hand from
  a few frames. Events (flash on/off, DTK, FROM/TO idents, distance, XTK, bearing, ETE) were extracted from the
  series; distances at events also from a linear fit of distance vs time on the straight approach.
- Parallel offset passes were not possible: the trainer aircraft intercepts the active leg at 40-70 deg within
  20-30 s of a jump and only a ~1-4 min window exists before the offset is gone. The offsets in 2.4 are those at the
  abeam point, not at the start.

## 5. Driving lessons worth keeping

- **Click rate:** two clicks on the same knob closer than ~560 ms merge (Win98 double-click); the Session 15 trick of
  alternating 6 px apart at 250 ms did NOT work here (exactly half the clicks were lost, at 200 and 350 ms). Use
  `-Pause 500` (560 ms per click) for long GS/HDG runs: GS 0 -> 240 takes ~2.3 min.
- **SET 1 HDG field** (after GS): the first inner click resets it to 000, then 1 deg per click either way (IL from 000
  gives 359). ENT on HDG goes to `Ok?`. **Always set HDG with a jump**: a jump keeps the old heading, and the aircraft
  then makes a big turn (my first 120 kt run came in converging).
- **While the SET 1 cursor is on, the shown lat/lon freeze**; `Ok?` re-initializes at the shown (stale) position. A long
  edit therefore becomes a jump back. Once, keys sent from the `Ok?` field (OL*4 then digits) did not reach the lat field
  and instead changed HDG and applied `Ok?` - check each step.
- **Jumps of < ~15 NM are ignored** (confirmed). For a near target, jump to a far point first (two jumps, ~1.2 min each).
- **Re-orientation after SET 1** is not simply the closest leg: offset points 4 NM before 8T (6.5 NM left) and 2 NM
  before 8V (10 NM left) got the NEXT leg; 4 NM before 8T at 10 NM left got the inbound leg. A jump 2 NM before 8V,
  1 NM left, started the turn at once. Use jumps only to place the aircraft, then watch which leg is active.
- Ident entry: `8` gives the autofill `82C`; from its 2nd character '2', IL steps 1, 0, Z, Y, ... (8Z = IL*3, 8P =
  IL*13). `8W` autofills to the database airport `8W1` (ENT accepts it!) - always screenshot before ENT. Insert row:
  cursor on the following row, IR opens `ADAME`-like autofill starting at 'A'; IL*2 gives '8'.
- OTH 4 lists user waypoints; CLR, ENT deletes (used to delete an accidental `AILBF`).
- Fast recorder: 4 Hz COM screenshots are cheap; the arrow flash cycle is ~1.25 s with 0.25-0.5 s off, so 4 Hz is
  needed. Reading `log.csv` while the recorder appends caused a few lost log lines (IOException) - read a copy.
- Python: Pillow went to the user site; `python -I` hides it, run plain `python` from the scratch folder.
- FPL 0 Dis column: the number shown beside a row looked shifted by one row after an insert; verify on NAV or USR 1.

## 6. What was left behind

- KLN 89 trainer: running, maximized, NAV 1 shown, cursor off, flying SET 1 take-home at GS 120 on 8S -> 8R (about
  19 NM before 8R at 18:46; it will reach the end of the plan), one message pending (`M`). SET 4 turn anticipation
  ENABLED. VM display unchanged (1920x1200). The AVsoftech trainer was not launched.
- FPL 0 (the old BAE, C29, DLL, KMSN, BAE was deleted): 8Z, 8Y, 8X, 8V, 8U, 8T, 8P, 8S, 8R.
- User waypoints created (OTH 4): 8Z N43 30.00 W089 30.00; 8Y N43 44.00 W089 30.00; 8X N44 00.00 W089 17.00;
  8V N44 15.00 W089 30.00; 8U N44 26.00 W089 03.00; 8T N44 40.00 W089 37.00; 8S N44 40.00 W088 44.00;
  8R N44 44.00 W089 20.00; 8Q N44 40.00 W088 46.81 (not in a plan); 8P N44 40.00 W088 48.22. The accidental `AILBF`
  was deleted. OTH 4 also shows an entry `0` at the top of the list, not mine.
- Scratchpad: helper scripts and OCR in `...\scratchpad\t\` (kln.ps1, shot.ps1, rec.ps1, jump.ps1, go.ps1, ocr.py,
  tpl.json, parse.py, ana.py, ev3.py); recordings `t\rec\run240`, `run120`, `q2b`, `q2c` (~340 MB of PNG frames plus
  ocr.json caches) - delete when no longer needed.

## 7. Comparison with the simulator (NavCalculator.ts) - differences, not filed

1. Lead: the sim adds a roll-in distance (`distanceToAchieveBankAngleChange`); the trainer shows none (+0.004 NM).
2. Lead cap: the trainer caps the lead at ~60 s of ground speed; the sim is uncapped. Note: memory says the
   maintainer ruled the real unit uncapped for #76; this trainer data contradicts that for the KLN 89 trainer.
3. Short inbound leg: the sim skips the waypoint at once when the lead exceeds the leg (#76); the trainer limited
   the lead to half the leg (2 legs, 3 runs) and flew the turn normally.
4. Sequencing: the sim sequences when the distance stops decreasing; the trainer at the bisector crossing. Equal on
   an exact arc, but in the trainer's capped big turns the distance was still decreasing at the sequencing
   (8S 239 kt: 3.4 -> 3.2 -> 3.2 NM), so the sim would sequence later there.
5. #157: the trainer starts the turn at the abeam (TO/FROM) line at the latest, and for large offsets sequences
   right there; the sim never sequences when the offset exceeds about lead + 20 s of GS.
6. Alert: ~21-24 trainer s before the turn start vs 20 s in the sim (small; within the flash quantization plus ~1-3 s).

Confidence: Q1 lead and cap high (12 on-course turns, two speeds); half-leg limit medium (3 runs, 2 leg lengths);
bisector sequencing high on course, medium-high off course; Q2 offset behaviour medium (7 usable runs, converging
geometry, the 2.8-vs-4.8 threshold unresolved); Q3 low-medium (indirect). More data: a parallel pass would need a
real autopilot/sim; a run with a 1.5 or 4 NM leg would separate "half the leg" from other leg rules further; offset
passes at 3.5-4.5 NM at both speeds would locate the immediate-sequencing threshold.
