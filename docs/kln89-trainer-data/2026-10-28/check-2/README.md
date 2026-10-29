# KLN 89 trainer recordings, 2026-10-28 evening (19:31-21:24)

The raw data behind the verification runs W, P, Z and G of the #438/#439 analysis
(`../analysis/analysis-1.md`, section 5) and the #440 follow-up runs 3b', 3a' and 3d. The findings are in
[report.md](report.md); the predictions as written before each pass, with the first reading after it, are in
[predictions.md](predictions.md). The morning's session this one builds on is `../check-1/`.

## How the data was recorded

As in the morning session, with its scripts copied unchanged into `scripts/` (`rec.ps1` 4 Hz VirtualBox COM
screenshots of the unit's screen, `ocr.py` + `tpl.json` template OCR, `proc.py csv` frames to CSV, `kln.ps1` COM mouse,
`jump.ps1`/`go.ps1`/`genjump.py` SET 1 jumps, `startpt.py` start points on the inbound great circle, `watch_d.py` fire
keys at a status-column distance or ident, `ana.py` local-frame reconstruction). New here: `pass.py` (key moments of
one pass: alert onset, first XTK <= 0.99 frame, XTK at fixed al-L, switch, sequencing, alert end), `after.py` (frames
on the new leg with the along-track distance past the old waypoint), `blink.py` (arrow and message-prompt state per
frame), `waitstr.py` (wait for a screen string), `jump2.ps1` (SET 1 jump that keeps GS and heading).

The KLN 89 trainer in the VM "Windows 98" was found running (take-home flying, GS 120, 8S to 8R, SET 4 off, NAV 1
line 2 on `Fly L/R`). SET 4 turn anticipation was ENABLED for every run and DISABLED again at the end.

CSV columns, glyphs and timing as in the morning files: `t_s` seconds since that recorder started (wall clock; the
trainer runs about 6 % slow), `wall_clock`, `line1`..`line4` the 23 screen characters per row; `@` the waypoint arrow
(blank in the off phase of its flashing), `#` inverse cells, lowercase the small text. Only frames whose text differs
from the frame before are kept. A message was pending all session, so the status-column prompt `##` flashes in almost
every frame. The prompt and the alert arrow blink on the same clock: during an alert every frame without `##` also
has the arrow blank; with the arrow steady, frames without `##` still show `@` (see `scripts/blink.py`).

Two display facts used throughout: XTK of 1.0 NM and more is shown with 0.1 NM resolution (`1.0nm`), below that
with 0.01 (`0.99nm`); and on the FPL 0, SET 1 and USR pages the arrow is not drawn, so passes with an FPL edit have
a gap of 4-7 s in the NAV 1 frames around the edit.

SET 1 jumps of up to about 9 NM were ignored (d1, and the final restore); jumps of 15 NM and more applied.

## Flight plan and waypoints

FPL 0 at the start and the end: 8Z 8Y 8X 8V 8U 8T 8S 8R (positions in
`docs/kln89-trainer-data/2026-10-27/README.md`; checked row by row at the end). During the session flown waypoints
were deleted and inserted again with the same idents in the same order (8X twice, 8Y, 8Z and 8V once each;
see the run table). No user waypoint was created, changed or deleted; no numbered flight plan was touched.

Turns (trainer DTKs, magnetic; L and the arc radius rho by the 2026-10-20 rule):

| waypoint | inbound | outbound | turn | 119 kt: L, rho | 239 kt: L, rho |
|---|---|---|---|---|---|
| 8U | 065 (from 8V) | 305 to 8T | 120 L | 1.09, 0.63 | - |
| 8T | 304 (from 8U) | 094 to 8S | 150 R | 1.98, 0.53 | 3.98, 1.07 |

## Runs

al = along-track distance to the waypoint, XTK = NAV 1 line 2 before the switch, al-L = distance before the turn
point. Landing = the first NAV 1 frame after the SET 1 jump.

| file | run | GS | content |
|---|---|---|---|
| `w.csv` | W | 119 | 8T, landing al 4.95 (al-L 2.96), 3.2 NM left. Lead plan: alert at al 2.60, switch at al 1.95 = L |
| `p1.csv` | P1 | 119 | 8T, r2 repeat: landing al 3.73, 3.0 left. Abeam plan; late normal-arc start 4.0 s after the first XTK <= 0.99 frame |
| `p2.csv` | P2 | 119 | same start; late start after 10.5 s |
| `p3.csv` | P3 | 119 | same start; late start after 10.0 s |
| `b1.csv` | 3b' pass 1 | 119 | 8U on course; 8X deleted 1.8 s after the 8U sequencing (the delete is at t 288.0) |
| `a1.csv` | 3a' at 119 | 119 | 8T, T6 replica (al 3.73, 2.3 left, HDG 290); 8Y deleted at status distance 2.2 (t 222.8), NAV 1 back at t 227.0 with the turn already on. Inconclusive |
| `d1.csv` | - | 119 | failed 3d start: the 9.3 NM SET 1 jump was ignored; no pass |
| `d2.csv` | 3d | 119 | 8U, run C replica (al 1.83, 3.5 right); zero-size turn at the abeam line; 8Z deleted 1.75 s after the sequencing (t 263.75) |
| `b2.csv` | 3b' pass 2 | 119 | as b1; delete at t 287.0 |
| `z.csv` | Z' | 239 | 8T (Z re-planned, see report): landing al 6.0 (al-L 2.0), 3.6 left. Lead plan: alert at al-L 1.47 with XTK 3.5, switch at al 3.99 = L with XTK 2.5 |
| `a2.csv` | 3a'' | 239 | Z' repeated (landing al-L 2.34, 3.65 left; alert at al-L 1.47 with 3.5); 8V deleted about 4 s into the turn (t 140.4), XTK to the inbound leg about 2.4 |
| `g.csv` | G' | 239 | 8T flown in: landing al 7.26 (al-L 3.28), 3.9 left; XTK 3.20 at al-L 1.5. Lead plan: alert at al-L 1.13, switch at al 3.95 = L with XTK 1.9 |

Each recording starts just before the run's second SET 1 jump (or its only jump), so the files also hold the SET 1
entry and, for the #440 runs, the FPL 0 delete and the re-inserts. The PNG frames are in `scripts/rec/` (about
200 MB; delete when no longer needed); `scripts/rec/<run>/ocr.json` caches the OCR.
