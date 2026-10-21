# KLN 89 trainer check: where the turn starts when the aircraft is off course but within 4 NM (2026-10-20, 21:00-22:45)

Follow-up to `report-turn-anticipation.md` and `report-off-course.md` (docs/kln89-trainer-data/2026-10-20). Same setup:
VM "Windows 98", KLN 89 trainer in SET 1 take-home mode, SET 4 turn anticipation ENABLED, FPL 0 = 8Z 8Y 8X 8V 8U 8T 8P
8S 8R, user waypoints as in the README. Times are wall-clock seconds of my 4 Hz COM recorder (`t_s` in each run's
`log.csv`); the trainer runs about 6 % slow (20 trainer s = 21.3 wall s). GS shown 239 = 0.0622 NM per wall s, 119 =
0.0311. "XTK" = NAV 1 line 2 (cross-track to the active leg), "d" = line 1, "brg" = line 4 bearing To, "al" = the
along-track distance to the waypoint = d*cos(brg-DTK), "cr" = d*sin(brg-DTK) (agrees with the displayed XTK to 0.05).
L = the lead of the first report (r*tan(theta/2), r = standard rate limited to 25 deg bank, capped at 60 s of GS and
half the leg): 8Y 0.495, 8X 1.07, 8V 1.85, 8U 3.09, 8T 3.98 at 239 kt; 8X 0.38, 8U 1.08, 8T 1.98 at 119 kt. T = the
turn point = the point on the inbound course L before the waypoint. Nothing in the repository was changed; nothing posted.

## 1. The rule

**In regime A (|XTK| <= 4.0 NM) the unit decides once, about 20 s of flight before T, whether the turn will start
at T or at the abeam line, and the decision is latched.**

1. **Turn at T when |XTK| was at most about 2.8 NM at the decision.** The DTK switch (with the `M` prompt) then comes
   when the **along-track** distance to the waypoint equals L, whatever the cross-track error is at that moment
   (observed 0.86 to 2.0 NM), on the inside (T2) and on the outside (B, T3, T6, T8, T10, T12, T14). The "d = L" of
   the first report is the special case XTK = 0 of "along-track = L" (d = L exactly only on course). The waypoint
   alert (arrow flashing) starts at the decision, i.e. about 20 s (16-25 wall s) before the switch.
2. **Turn at the abeam line when |XTK| was more than about 2.8 NM at the decision** (C, T5, T7, T11, T13; and the
   regime-B-at-T runs D, R2, R6): no alert at T minus 20 s, the alert starts about 15 s before the abeam line, the
   DTK switch comes at bearing = DTK +- 90 (76-90 deg observed), and line 2 then shows XTK = d (the degenerate arc of
   the second report). **The decision is not revisited:** in T7, T11 and T13 the cross-track error fell to 1.5-1.8 NM
   at T and to 0.7-0.9 NM before the abeam line, far below the gate, and the unit still waited for the abeam line.
   Conversely once the T plan is taken nothing cancels it (T10 turned at T with XTK 2.0).
3. **The decision moment** is the moment the regime-A alert is due: al - L about 1.2-1.3 NM at 239 kt (18-21 trainer
   s) and 0.67-0.82 NM at 119 kt (21-26 s). When the aircraft appears (SET 1 jump) inside that window, the decision is
   taken at once with the XTK of that moment (T12: alert 4 s after the jump, 26 s before T; T14: 3 s after the jump;
   T13: fail with the XTK of the first seconds).
4. **The gate is a cross-track distance, about 2.8 NM, the same at 119 and 239 kt** (passes at 2.69 (119 kt) and
   2.83 (239 kt), fails at 2.80 (119 kt, T13) and 2.93-3.0 (239 kt, T7)). It is not the turn radius r (0.63 at 119 kt,
   1.785 at 239 kt), not a time (2.8 NM is 43 s at 239 kt and 85 s at 119 kt), not a multiple of L (L ranged 0.5 to
   3.98 among the passes) and not the turn angle (passes at 31, 62, 120, 150 deg; fails at 62, 92, 120 deg).
5. After the switch the displayed XTK is referenced to the arc of radius r (T2: the displayed 0.86 equals the distance
   to the r = 1.785 circle), the aircraft turns and the waypoint sequences when it crosses the bisector (every run:
   bearing at the sequencing within 2 deg of the bisector, inside and outside), as in the earlier reports.

Confidence: the along-track = L start on both sides and at both speeds: **high** (8 turns, 4 waypoints, 31-150 deg,
XTK 0.12-2.0 at the switch, each within 0.05 NM of L). The one-time, latched decision: **high** (three runs with XTK
well below the gate between the decision and the abeam line and no turn; the only quantity that separates all passes
from all fails is the XTK about 20 s before T). The gate value 2.8 +- 0.1 NM and its speed independence: **medium**
(the bracket is 2.69 pass / 2.80 fail at 119 kt and 2.83 pass / 2.93 fail at 239 kt; T10 2.83 pass vs T13 2.80 fail is
an inversion inside the display resolution of +-0.05 NM, so the gate may be 2.8 at 119 kt and 2.9 at 239 kt, or the
decision moment may differ by a few seconds from 20 s). The decision moment "when the alert is due": **medium**
(bracketed by T7/T10 at 239 kt and T13/T14 at 119 kt to within about 5 s; T6's alert came only 16 s before T).

What this answers for the open question of the dispatch: R6 and C never had a chance to turn at T. R6 (and R2, D) were
in regime B (XTK > 4) when the decision was due, C had XTK 3.5 then (3.47 at al - L = 0.69); the later XTK below 4 (or
below 2.8) did not matter because the abeam plan was already latched. The "small cross-track error" needed for the
d = L start is in fact "XTK <= 2.8 NM about 20 s before T", and the start is at along-track = L, not d = L.

## 2. Evidence per run

Runs T2-T14 are new (T4 was not flown, T9 was spoiled by the SET 1 re-orientation). "20 s before T" = the last frame
with al - L >= 20 trainer s of GS (1.33 NM at 239 kt, 0.66 at 119 kt); "jump" = the first NAV 1 frame after the SET 1
jump. B and C are the first report's runs re-read from `run120.csv`; R2/R6/D from the second report.

| Run | Wpt, turn | GS | side | XTK at jump (al-L) | XTK 20 s before T (al-L) | plan | alert onset (s before switch; al-L) | XTK at T | turn start: al / XTK / d / brg-DTK / TK-DTK / ETE | sequencing d / brg (bisector) |
|---|---|---|---|---|---|---|---|---|---|---|
| T2 | 8Y 31 R, L 0.50 | 239 | inside | 3.9 (5.3) | 1.5 (1.37) | T | 21.5; 1.27 | 0.86 | 0.52 / 0.86 / 1.0 / -59 / -17 / :15 | 0.9 / 292 (inside bisector 109.5 from the wpt, aircraft at 112) |
| B | 8X 62 L, L 0.38 | 119 | outside | 2.0 (4.5) | 0.21 (0.70) | T | 23.0; 0.70 | 0.12 | 0.38 / 0.12 / 0.4 / -17 / -8 / :12 | 0.0 |
| T3 | 8U 120 L, L 3.09 | 239 | outside | 4.0 (4.75) | 1.80 (1.36) | T | 21.3; 1.18 | 1.11 | 3.21 / 1.11 / 3.4 / -19 / -28 / :50 | 1.6 / 094 (095) |
| T8 | 8U 120 L, L 3.09 | 239 | outside | 4.5 (4.70) | 2.07 (1.35) | T | 19.2; 1.05 | 1.16 | 3.19 / 1.16 / 3.4 / -20 / -28 / :50 | 1.6 / 095 (095) |
| T6 | 8T 150 R, L 1.98 | 119 | outside | 2.3 (1.88) | 2.41 (0.70) | T | 16.0; 0.23 | 1.34 | 1.99 / 1.34 / 2.4 / +34 / +57 / 0:01 | 1.6 / 290 (289) |
| T12 | 8T 150 R, L 3.98 | 239 | outside | 2.32 (1.77) | 2.27 (1.36) | T | 25.5; 1.54 (4.5 s after the jump) | 1.86 | 3.99 / 1.86 / 4.4 / +25 / +29 / 0:01 | 3.2 / 289 (289) |
| T14 | 8T 150 R, L 1.98 | 119 | outside | 2.69 (0.71) | 2.69 (0.71) | T | 29.5; 0.59 (2.75 s after the jump) | 2.0 | 1.98 / 1.98 / 2.8 / +45 / +61 / 0:01 | 1.2 / 290 (289) |
| T10 | 8X 62 L, L 1.07 | 239 | outside | 3.15 (2.68) | 2.83-2.87 (1.31-1.42) | T | 24.5; 1.24 | 2.01 | 1.12 / 2.01 / 2.3 / -61 / -33 / :34 | 0.4 / 275 (274) |
| T13 | 8U 120 L, L 1.08 | 119 | outside | 2.88 (1.09) | 2.80 (0.67) | abeam | 8.0; -0.72 | 1.78 (no turn) | 0.17 / 0.78 / 0.8 / -78 / -35 / :25 | 0.4 / 278 (275) |
| T7 | 8V 92 R, L 1.85 | 239 | outside | 6.0 (5.87) | 2.93-3.00 (1.29-1.37) | abeam | 14.8; -0.99 | 1.81 (no turn) | 0.03 / 0.90 / 0.9 / +88 / +24 / :13 | 0.9 / 108 (108) |
| C | 8U 120 L, L 1.08 | 119 | outside | 3.5 (0.86) | 3.47 (0.69) | abeam | burst after the jump, then 15.5 | 2.58 (no turn) | 0.02 / 1.20 / 1.2 / -89 / -47 / :35 | 0.8 / 276 (275) |
| T11 | 8X 62 L, L 1.07 | 239 | outside | 4.16 (2.68) | 3.90 (1.37) | abeam | ~14; -1.0 | 1.56 (no turn) | 0.05 / 0.70 / 0.7 / -86 / -26 / :09 | 0.6 / 278 (274) |
| T5 | 8U 120 L, L 3.09 | 239 | outside | 5.2 (3.78) | 5.3 (1.35), regime B | abeam | 15.5; 0.70 | 4.42 (regime B) | 0.06 / 1.80 / 1.8 / -88 / -38 / :27 | 1.5 / 275 (275) |
| R6 | 8T 150 R, L 3.98 | 239 | outside | 6.2 (1.0) | ~4.8, regime B | abeam | B-burst, then 15.8 | 4.5 (regime B) | abeam, d 3.0 | 1.9 / 107 |
| R2, D | 8T 150 R, L 1.98 | 119 | outside | 5.65, 5.0 (1.0) | >4, regime B | abeam | 15-18 | >4 | abeam, d 3.5, 2.8 | bisector |

Reading of the table: the passes have XTK 0.21-2.87 twenty seconds before T, the fails 2.80-5.3; the XTK at T itself
does not separate them (pass at 2.0 in T10, fail at 1.56 in T11 at the same waypoint and speed), nor does the XTK at
the jump (T12 2.32 pass, T13 2.88 fail, T10 3.15 pass), nor the side, the turn angle, L or the speed.

The alert in the T plan started 19-25 wall s before the switch except T6 (16 s) and T14 (29.5 s; the aircraft was
converging at 47-61 deg so its along-track speed was half the GS); (al - L)/GS at the onset was 17-20 s in T2, T3, T8,
T10 and T14 and 7 s in T6. In the abeam plan the alert started 14-16 s before the switch (T13: 8 s before a switch that
came at bearing-DTK = -78, i.e. 0.17 NM before the abeam line).

## 3. Raw log of the new runs

Format: wall s (t_s of the run's log.csv), d, FROM>TO, flash, GS, line 2, DTK, TK, brg, ETE. All jumps: SET 1 lat/lon
from `startpt.py <wpt> <NM before> <+right/-left>`, HDG = the inbound DTK, `Ok?`.

**t2** (21:04-21:16): the first jump attempt. The stored pointer position was stale, 4 min of clicks went nowhere except
one that put the cursor on NAV 1; no run. The aircraft flew 8U>8T on course at 119 kt and turned at 8T (d 2.0 = L).

**T2 = rec2/t2b** (8Y, start 6 NM before, 4 right = inside of the 31 deg right turn; GS 240 set in the same jump;
21:14): 254.0 8Z>8Y d 7.0 Fly L 4.0 DTK 004 TK 004, GS 184 -> 239 by 273; TK 321 (43 deg intercept) from 285; XTK 3.4
(282), 2.7 (301), 2.0 (316), 1.5 (332); 333.0 flashing starts d 2.3 XTK 1.4 brg 324; 354.26 TK jumps 340 -> 347 (the
aircraft reacts one second before the display); **355.25 DTK 4 -> 35**, d 1.0, XTK 0.86, brg 302, ETE :14 (al 0.52);
line 2 then 0.85 ... 0.76 (= distance to the r 1.785 arc); **359.76 8Y>8X** d 0.9 brg 292 (inside bisector 109.5 from
the waypoint: aircraft at 112).

**T3 = rec2/t3** (8U, 8 before, 4.0 right = outside of the 120 deg left turn, 239 kt; 21:22): 165.0 8V>8U d 8.6 Fly L
4.0 TK 060 -> 022 by 196 (43 deg); XTK 3.3 (190), 2.8 (202), 2.3 (215), 1.8 (227); **230.0 flashing** d 4.7 XTK 1.7
brg 043; TK shallows 027 (230) -> 037 (252); **252.0 DTK 65 -> 305** d 3.3 XTK 1.1 brg 046 ETE :49 (al 3.12); line 2
0.99 ... 0.18 while TK 037 -> 352; **295.26 8U>8T** d 1.6 brg 094.

**T5 = rec2/t5** (8U, 7 before, 5.2 right, 239 kt; 21:31): 146.5 8V>8U d 8.6 Fly L 5.2; TK drifted 070 -> 078 (away
from the leg) until 172, then 062 -> 025 (40 deg); XTK 5.5 (165), 5.0 (196), 4.0 (224, regime A), 3.0 (246), 2.0
(273); flashing 149.75-150 (burst after the jump), none at T minus 20 s (x 5.3), **264.0 flashing** d 2.4 XTK 2.3
(abeam in 15 s); **279.5 DTK 65 -> 305** d 1.7-1.8 XTK 1.7-1.8 brg 337 (abeam = 335) ETE :25; line 2 1.7, 1.6, 1.5,
1.5 (= d); **307.0 8U>8T** d 1.5 brg 275.

**T7 = rec2/t7** (8V, 8 before, 6.0 left = outside of the 92 deg right turn, 239 kt; 21:38): 117.0 8X>8V d 9.8 Fly R
6.0 TK 333 -> 016 by 139 (44 deg, equal to the bearing: the aircraft headed at the waypoint); XTK 5.0 (161), 4.0
(185, regime A), 3.0 (207), 2.0 (231), 1.8 (238 = T: al 1.77-1.87, no switch), 1.5 (247), 1.2 (256), 1.0 (262), 0.92
(268); no flashing at T minus 20 s (x 2.9-3.0 at 209-213); **255.75 flashing** d 1.5 XTK 1.2 (abeam in 14 s);
**271.25 DTK 332 -> 65** d 0.8 XTK 0.85 brg 060-064 (abeam = 062) ETE :12; line 2 0.81, 0.83, 0.88, 0.97, 1.1 (= d);
**283.5 8V>8U** d 0.9 brg 108 (bisector 108).

**T6 = rec2/t6** (8T, 4 before, 2.3 left = outside of the 150 deg right turn, GS 120 set in the jump; 21:47): 226.0
8U>8T d 4.5 Fly R 2.3 TK 290 -> 276 (28 deg past the course, away from the leg) until 245, then right to 004 (60 deg)
by 277; XTK rose 2.3 -> 2.6 (245-256) then 2.0 (281), 1.8 (292), 1.5 (301); **292.26 flashing** d 2.9 XTK 1.7-1.8
brg 342; **309.0 DTK 304 -> 94** d 2.4 XTK 1.3 brg 338 TK 001 ETE 0:01 (al 1.99); line 2 1.3 ... 0.01 (365) while TK
001 -> 041; **369.76 8T>8P** d 1.6 brg 290 (bisector 289).

**T8 = rec2/t8** (8U, 8 before, 4.5 right, 239 kt, a repeat of T3 with a larger offset; 21:56): 289.75 8V>8U d 8.8 Fly
L 4.5 TK 062 -> 016 by 326 (49 deg); XTK 4.0 (314, regime A), 3.0 (334), 2.0 (358), 1.5 (371); **362.0 flashing** d
4.6 XTK 1.8 brg 041; **381.75-382.0 DTK 65 -> 305** d 3.3-3.4 XTK 1.2 brg 045 ETE :50 (al 3.19); **425.5 8U>8T** d
1.6 brg 095.

**T9 = rec2/t9** (8V, 3.55 before, 2.25 left; 22:02): the SET 1 jump re-oriented the plan to 8V>8U (24.6 NM, Fly L 3.2)
although the inbound 8X-8V leg was closer (2.25 NM); abandoned. The folder holds the jump and the convergence onto 8V-8U.

**T10 = rec2/t10** (8X, 4.0 before, 3.15 right = outside of the 62 deg left turn, 239 kt; 22:07): 125.25 8Y>8X d 4.9
Fly L 3.2 TK 034 -> 002 by 161 (28-33 deg only); XTK 3.0 (142), 2.8 (148), 2.5 (157), 2.2 (168), 2.0 (172);
**148.76 flashing** d 3.7 XTK 2.8 brg 345 (al 2.38); **174.0 DTK 35 -> 333** d 2.2-2.3 XTK 1.9-2.0 brg 333-335 TK 002
ETE :33 (al 1.12-1.15; the aircraft was also exactly on the extended outbound course: next-leg XTK 0.00); line 2 1.9
... 0.71 (208) while TK 002 -> 329; **209.0 8X>8V** d 0.4 brg 275 (bisector 274).

**T11 = rec2/t11** (8X, the jump landed 3.5 NM before (along-track) and 4.2 right because of a coordinate typo; 239 kt;
22:15): 117.5 8Y>8X d 5.6 Fly L 4.2 TK 034 -> 323 by 158 (72 deg, heading at the waypoint); 120.0-134.3 flashing
(burst after the jump); XTK 4.0 (136, regime A), 3.0 (158), 2.0 (175), 1.5 (184 = T: al 1.09, no switch), 1.2 (190),
1.0 (194.5), 0.85 (198.5: crossing the extended outbound course, no switch), 0.66 (205); **192.26 flashing** d 1.4
XTK 1.1-1.2 (abeam in 12-14 s); **206.26 DTK 35 -> 333** d 0.6-0.7 XTK 0.62-0.87 brg 303-309 (abeam = 305) ETE :09;
line 2 0.87, 0.87, 0.88, 0.90 (= d); **212.0 8X>8V** d 0.6 brg 278.

**T12 = rec2/t12** (8T, 6.0 before, 2.3 left, 239 kt; 22:26): 148.75 8U>8T d 6.2 Fly R 2.3 TK 304 -> 318 by 161 (14
deg) -> 333 (29 deg) by 178; **152.25-152.5 flashing** (4 s after the jump; d 6.0, XTK 2.3, al 5.52 = T + 1.54 NM);
XTK 2.2 (158), 2.1 (165), 2.0 (170), 1.9 (174), 1.8 (178); **178.75 DTK 304 -> 94** d 4.4 XTK 1.8 brg 329 TK 335 ETE
0:01 (al 3.99); line 2 1.8 ... 0.01 (222) while TK 335 -> 043; **228.5 8T>8P** d 3.2 brg 289 (bisector 289).

**T13 = rec2/t13** (8U, 2.3 before, 2.9 right, GS 120 set in the jump, decelerating 164 -> 121 by 220; 22:33): 206.75
8V>8U d 3.6 Fly L 2.9 TK 064 -> 003 by 235 (62 deg), then 020 by 293; XTK 2.9 (207-215), 2.8 (217-222), 2.7 (223), 2.5
(231), 2.3 (239), 2.0 (250), 1.7 (262 = T: al 1.06-1.11, no switch), 1.5 (270), 1.2 (282), 1.0 (291); no flashing
until **295.0** (d 1.1 XTK 0.97, al 0.41); **303.75 DTK 65 -> 305** d 0.8 XTK 0.83 -> line 2 reads 1.1 and stays 1.1
through the turn (not d, unlike T5/T7/T11), brg 346-347 (abeam = 335: 11-12 deg before the abeam line, al 0.17-0.22)
ETE :24; **330.25 8U>8T** d 0.4 brg 278.

**T14 = rec2/t14** (8T, 2.98 before, 2.7 left, 119 kt already, heading unchanged; 22:39): 148.0 8U>8T d 3.8 Fly R 2.7
TK 305 -> 355 by 164 (51 deg) -> 005 (61 deg) by 177; **150.75 flashing** (2.75 s after the jump; d 3.7 XTK 2.7, al
2.57 = T + 0.59); XTK 2.4 (165), 2.2 (172), 2.0 (178); **180.25 DTK 304 -> 94** d 2.8 XTK 2.0 brg 349 TK 005 ETE 0:01
(al 1.98); line 2 2.0 ... 0.32 (265) while TK 005 -> 049; **265.75 8T>8P** d 1.2 brg 290 (bisector 289).

File-to-run index of `scratchpad\t\rec2\` (each folder: `fNNNNN.png` 4 Hz frames of the unit's screen, `log.csv` with
`i,ms,wall`, `ocr.json` with the OCR of every frame; `log_copy.csv` is a scratch copy made by the event listers):

| folder | run | frames | recorder start (wall) |
|---|---|---|---|
| t2 | aborted first jump attempt (no run) | 2880 (720 s) | 21:04:14 |
| t2b | T2 (8Y inside, 239 kt) | 3600 | 21:10:0x |
| t3 | T3 (8U outside 4.0, 239) | 3600 | 21:19:0x |
| t5 | T5 (8U outside 5.2, 239) | 3600 | 21:28:5x |
| t7 | T7 (8V outside 6.0, 239) | 3600 | 21:36:3x |
| t6 | T6 (8T outside 2.3, 119) | 3601 | 21:43:5x |
| t8 | T8 (8U outside 4.5, 239) | 3600 | 21:51:3x |
| t9 | T9 (8V, spoiled jump) | 2400 | 22:00:2x |
| t10 | T10 (8X outside 3.15, 239) | 2400 | 22:04:5x |
| t11 | T11 (8X outside 4.2 at 3.5 along, 239) | 2400 | 22:12:5x |
| t12 | T12 (8T outside 2.3 at T+1.5, 239) | 2400 | 22:23:2x |
| t13 | T13 (8U outside 2.9 at T+1.1, 119) | 2400 | 22:29:2x |
| t14 | T14 (8T outside 2.7 at T+0.8, 119) | 2400 | 22:36:3x |

The exact wall clock of every frame is in `log.csv`. The scripts in `scratchpad\t\`: `rec2.ps1` (the recorder writing
to rec2), `ev5.py <dir> [t0 t1 step]` (event list with along/cross-track), `summ.py <dir> <L> [t0 t1]` (alert, T
crossing, switch, sequencing of one approach), `tab.py` (the table of section 2 for all runs, also reads the repo's
CSVs), plus the earlier `kln.ps1`, `shot.ps1`, `jump.ps1`, `go.ps1`, `startpt.py`, `ocr.py`, `tpl.json`, `parse_lib.py`.

## 4. Candidates rejected and why

- **A fixed cross-track gate tested continuously or at T** (the dispatch's "fixed XTK threshold"): T10 turned at T with
  XTK 2.0 while T11 passed T with 1.56 and did not turn; T7 passed T with 1.8 and had 0.9 before the abeam line without
  turning. Only a one-time, earlier test fits.
- **Along-track = L unconditionally**: C (XTK 2.6 at T), T7, T11, T13 crossed al = L without a switch.
- **The turn radius r as the gate** (XTK <= r): T6 and T14 turned at T with XTK 1.3-2.0 at 119 kt where r = 0.63.
- **A time threshold (XTK/GS)**: 2.7 NM passes at 119 kt (85 s) while 2.9-3.0 NM fails at 239 kt (44 s).
- **A gate relative to L or to the turn angle**: T2 passed at XTK = 3 L (31 deg) and T7 failed at 1.6 L (92 deg); the
  fails cover 62-120 deg, the passes 31-150 deg.
- **The transition circle** (turn when the aircraft enters the r-circle tangent to both legs, or is within a band of
  it): T2 was deep inside the circle for 40 s before it turned at al = L; T3, T8 turned at T 1.1 NM outside it.
- **A lead computed from the track angle instead of the course change** (d <= r*tan(angle(TK, next DTK)/2)): T2 would
  have switched 4-6 s earlier (TK 339: L' 0.95 vs the observed al 0.52 = L); T10 would not have switched at all (TK 002
  vs 333 gives L' 0.46 against d 2.3).
- **The extended outbound course line** (turn when the aircraft crosses the FROM side of the next leg): T10's switch
  did coincide with that crossing (next-leg XTK 0.00), but T11 crossed it at 198.5 s without a switch and turned at
  the abeam line 8 s later.
- **The closest leg by lines or segments** (the regime-B rule): T10 switched at T while the inbound segment was still
  the closer one (2.0 vs 2.3), T7 did not switch at 262 s when the outbound line was closer (0.46 vs 1.07).
- **A settling timer** ("the leg must have been active for >= 30 s when the alert is due", which fitted T2-T11
  because the late regime-A entries also had large XTK): T12 and T14 took the T plan 3-4 s after the jump.
- **Decision at the jump / at the regime-A entry**: T10 (3.15 at the jump), T3 (4.0), T8 (4.5) passed.
- **The predicted XTK at T along the track, the track-miss distance at the waypoint, the relative bearing**: the fails
  all had the aircraft heading at the waypoint (TK = brg +- 5 deg) and the passes not, but T13's track crossed the
  course 0.7 NM before the waypoint like T6's (1.3) and T3/T8's (2.1) which passed; the correlation comes from the
  trainer's steering (it aims at the waypoint when the offset is large relative to the distance), not from the unit.
- **The sampling 20 s before the actual T crossing by time**: T13 had 2.3 then and failed, T10 2.74 and passed; the
  along-track form (al - L = 20 s of GS, i.e. the alert-due point) orders all runs.

## 5. Open points

1. The gate is known to +-0.1 NM (2.69 pass, 2.80 fail at 119 kt; 2.83 pass, 2.93 fail at 239 kt) and T10 vs T13 are
   inverted by 0.03 NM, inside the display resolution. It could be 2.8 at both speeds, or 3.0 on an internal unrounded
   value with the decision a few seconds earlier than I place it. A run with XTK 2.6 and one with 3.0 held constant
   (parallel jump ~25 s before T, HDG = DTK) at each speed would settle it; the trainer's 15 NM minimum jump distance
   makes that a two-jump setup.
2. The decision moment: 18-21 trainer s before T at 239 kt, 21-26 s at 119 kt (brackets, not a measurement). T6's
   alert came only 16 s (7 s at GS) before T; T14's 29.5 s (the aircraft converging at 60 deg).
3. The alert burst right after a SET 1 jump (T5 149.75-150, T11 120-134, C 2713-2733, and T12/T14 where it merged with
   the T-plan alert) is unexplained; it stops after about 15-20 s when no plan is due.
4. Line 2 after the abeam switch read XTK = d in T5, T7, T11 (the degenerate arc) but a constant 1.1 in T13 (d 0.8 ->
   0.4) - note L = 1.08 there; T13's switch also came 0.2 NM before the abeam line (bearing-DTK 78 deg).
5. Only one inside pass within 4 NM (T2, pass at 1.5); no inside fail was flown. Run A of the first report (jump 2 NM
   before 8V, 1.0 inside, immediate DTK switch) remains a re-init artifact in my reading: nothing here reproduces it.
6. The SET 1 re-orientation rule is still unknown: 3.55 NM before 8V with 2.25 NM outside went to the next leg while
   2.3 NM before 8U with 2.9 outside and 3.0 NM before 8T with 2.7 outside stayed on the inbound leg.
7. Turn anticipation OFF was not retested.

## 6. Driving lessons (additions)

- **Re-home the mouse at the start of a session** (`kln.ps1 -Rehome`): the stored `mousepos.txt` was stale, and the
  first jump's 4 minutes of clicks went nowhere. After the re-home three CRSR clicks in a row were lost while MSG
  worked at once; screenshot after each step, and take 3-5 shots 300-500 ms apart to get past the blink.
- A SET 1 jump keeps the heading until `Ok?`; the entered HDG then applies at once, but the take-home steering starts
  with a transient: with a heading change above about 100 deg the track first drifts 13-28 deg away from the leg for
  about 30 s (T5 at 239 kt, T6 at 119 kt) and the offset grows by 0.3 NM; with changes up to 30 deg it converges from
  the start. The intercept is 43-49 deg at 239 kt above 2.5 NM offset, shallowing to about 30 deg at 1.2 NM and 15 deg
  at 0.9; at 119 kt 45-72 deg, and with a large offset/distance ratio the aircraft simply heads at the waypoint.
- Consequence: the XTK at T cannot be placed better than +-0.4 NM from an 8 NM run-in; to put a chosen XTK at the
  decision point, jump 25-50 s before T (al - L of 1.5-3 NM at 239 kt, 0.8-1.5 at 119): the loss in the first 20-30 s
  is 0.1-0.3 NM. The same jump far before the waypoint is not possible: jumps under about 15 NM from the aircraft are
  ignored, so alternate waypoints and keep the aircraft's next leg in mind (T12 had to move from 8U to 8T).
- Jumps 2.3-4 NM before a waypoint worked at 8U, 8T and 8X but 3.55 NM before 8V re-oriented to the next leg.
- The take-home aircraft's TK reacts one display second before the DTK switch is shown (T2 354.26 vs 355.25).
- `jump.ps1` with `-Gs` costs about 4 min (GS 0 -> 240 clicks), without it 1.7-2.3 min; `go.ps1` applies `Ok?` and
  returns to NAV 1. Do not retype coordinates by hand (T11 got the wrong point); paste the `startpt.py` output.
- ETE on NAV 1 reads `0:01` for 1-2 minutes and `:59` for 59 s. Two recorders may overlap; `ev5.py`/`summ.py` work on a
  copy of `log.csv` while the recorder appends.

## 7. What was left behind

- KLN 89 trainer: running, maximized, NAV 1 shown, cursor off, flying SET 1 take-home at GS 120 (shown 121) on 8T -> 8P
  (31 NM to 8P at 22:43; it will continue to 8S and 8R), SET 1 HDG 304 as last entered, SET 4 turn anticipation
  ENABLED, several messages pending (`M` prompt: `ADJ NAV CRS` / `GPS Course is` from the turns). FPL 0 unchanged (8Z
  8Y 8X 8V 8U 8T 8P 8S 8R); user waypoints unchanged. The AVsoftech trainer was not used. VM display 1920x1200
  unchanged.
- Scratchpad `...\scratchpad\t\`: new `rec2.ps1`, `ev5.py`, `summ.py`, `tab.py`, screenshots `now2_*.png`,
  `panel.png`, `s*.png`, `final_*.png`; recordings `rec2\t2 t2b t3 t5 t6 t7 t8 t9 t10 t11 t12 t13 t14` (about 320 MB of
  PNG frames, every frame in its `ocr.json`; t2 and t9 hold no usable run). The earlier `rec\` folders are untouched.
- Repository: untouched (branch investigate-375-157). Nothing was posted to GitHub.
