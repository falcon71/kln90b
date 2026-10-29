# KLN 89 trainer: near-reversal turns with a small inside offset (#443, 2026-10-29 18:20-19:30)

Agent check in the KLN 89 trainer. Question: at a near-reversal turn (170-180 deg) the inside bisector lies only a few
degrees off the inbound leg, so a small inside offset reaches it far before the waypoint. Does the unit then sequence
with no turn, as at 150 deg, or does it turn at the lead anyway? Predictions as written before each pass:
[predictions.md](predictions.md). Nothing in the repository was changed, nothing was posted, only the KLN 89 trainer
was used.

## Setup

- **Start.** The VM was powered off at my first check (18:20); I stopped and reported. The maintainer then started
  the VM, and I launched Kln89.exe inside it and maximized it.
- **Startup.** I acknowledged the startup pages and set NAV 1 line 2 to `Fly L/R`. FPL 0 checked row by row: 8Z 8Y
  8X 8V 8U 8T 8S 8R.
- **User waypoints**, checked on their USR pages: 8Z N43 30.00 W089 30.00, 8Y N43 44.00 W089 30.00, 8X N44 00.00
  W089 17.00, 8V N44 15.00 W089 30.00, 8U N44 26.00 W089 03.00, 8T N44 40.00 W089 37.00, 8S N44 40.00 W088 44.00,
  8R N44 44.00 W089 20.00.
- **Settings.** SET 4 turn anticipation ENABLED for the passes, GS 120 (119 kt shown).
- **Method.** As I3' ([../../inside/](../../inside/report.md)): a single SET 1 jump lands on the inbound leg just before the inside
  bisector line, with the heading 60 deg off the course toward the inside. The inside cross track grows about
  0.03 NM/s, so the aircraft crosses the line in flight a few seconds after the landing. The start points are
  computed with great circles (`scripts/bis.py`: equal cross track to the inbound and outbound lines). Turn angles
  are computed from the waypoint coordinates.

## Passes

| file | turn (where) | FPL 0 used | start | (i) sequenced at the crossing, no turn | (ii) turn at the lead | observed |
|---|---|---|---|---|---|---|
| `p4_150.csv` | 150 R (8T), control | original | 6 NM before, 0.3 right (inside), HDG 004 | - | expected | **turn at the lead** (al 2.00, alert 22.5 s before), sequencing at the turn's bisector. The 1.5-NM-away bisector line was never reached |
| `p2_171.csv` | 170.6 L (8S: 8T-8S-8R) | original | 6 NM before, 0.39 left (gap 0.15), HDG 034 | **observed** | - | 8S active at the landing (SET 1 frames, 3 s); 8S -> 8R active about 5 s after the landing, 6 NM before 8S, no turn, no alert |
| `p3a_180.csv` | 180 (8T: 8U-8T-8U) | 8U inserted after 8T | on course 6 NM before, HDG 304 | - | - | **neither**: no early sequencing, no turn at the lead; alert from 1.2 NM (about 38 s before); 8T sequenced at the waypoint (d 0.0), then DTK 124 and a left teardrop (XTK up to 0.96) |
| `p3b_180.csv` | 180 (8T) | same | 6 NM before, 0.4 right, HDG 004 | - | - | **neither**: as P3a, fly-over at the waypoint |
| `p1_176.csv` | 176.1 L (8U: 8X-8U-8Y) | 8V deleted, 8Y inserted after 8U | 6 NM before, 0.33 left (line about 0.20-0.25), HDG 325 | - | - | **neither**: inside XTK up to 0.72 (well past the line), no sequencing, no turn at the lead; alert from 1.2 NM; 8U sequenced at the waypoint, then DTK 210 and a left teardrop |
| `p5a_171short.csv` | 171.2 L (8S after a 2.5-NM leg from 8N) | temporary 8N inserted before 8S | on course 6 NM before 8S | - | **observed** | turn at the lead capped at half the leg (DTK switch at about 1.2-1.3 NM), alert from about 1.9 NM, 8S sequenced 6 s after the switch, overshoot 0.78. Matches the 2026-10-20 note |
| `p5b_171short.csv` | 171.2 L (8S after 2.5 NM) | same | 2.0 NM before 8S on 8N-8S, 0.115 left (gap 0.08), HDG 034 | **observed** | - | 8N-8S active at the landing (SET 1, 2 s); 8S -> 8R active 2 s after the landing, 0.75 NM before the capped turn point, no turn, no alert |

The first P5b try was ignored (a SET 1 jump of about 8 NM). Only its heading applied, so I repositioned and jumped
again. Its frames are in `scripts/rec/P5b`, not converted. Times are wall clock on the host.

## Reading

- **About 171 deg behaves like 150 deg.** On the inside the waypoint is sequenced at the bisector crossing with no
  turn, both after a long leg (P2, 6 NM before 8S) and after a 2.5-NM leg (P5b, before the capped turn point). On
  course, with no inside offset, the 171-deg turn after the short leg is flown at the capped lead (P5a).
- **At 176 and 180 deg there is no turn anticipation at all.** The unit neither sequences at the bisector (P1: 0.72
  NM inside, with the line at about 0.2) nor turns at the lead. The DTK stays on the inbound leg, the alert starts
  about 36-38 s before the waypoint (1.2 NM at 119 kt), and the waypoint is sequenced on reaching it (fly-over). Then
  the take-home reverses in a teardrop. This held on course (P3a) and with offsets (P3b, P1).
- **The threshold lies between 171.2 deg (normal) and 176.1 deg (fly-over).** Not bracketed further. A 173-174 deg
  turn would narrow it; for example 8Y 8T 8V (173.7 R) or 8V 8T 8Y (173.9 L), with one or two FPL edits.
- The 180-deg geometry has the outbound line on the inbound one, so "the next segment at least as close" is true from
  the start, and still nothing was sequenced early. Bisector sequencing either needs the aircraft strictly past the
  bisector, or does not apply when anticipation is off. P1 (176 deg, clearly past) suggests the second: above the
  threshold the turn is treated as a fly-over and there is no early sequencing.

## What I changed, and the restore

| step | FPL 0 change / waypoint change | restored |
|---|---|---|
| P3 | 8U inserted after 8T (8Z 8Y 8X 8V 8U 8T 8U 8S 8R); a mis-placed insert before 8T was canceled with CLR | 8U deleted |
| P1 | 8V deleted, 8Y inserted after 8U (8Z 8Y 8X 8U 8Y 8T 8U 8S 8R) | 8Y and 8U deleted, 8V inserted before 8U |
| P5 | temporary user waypoint 8N created at N44 40.01 W088 47.51 and inserted before 8S | 8N deleted from FPL 0, then the user waypoint deleted on OTH 4 (`Del 8N ?`, ENT) |

- **Trainer state left behind:** running, NAV 1 shown, cursor off, line 2 `Fly L/R`, take-home flying at GS 120
  (shown 119 kt) on 8S to 8R (16.4 NM to 8R at the end), SET 1 HDG 283. SET 4 turn anticipation DISABLED.
- **Restore checks:** FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R, checked row by row at the end. The existing user waypoints
  were not edited. No numbered flight plan was touched. The VM was not started, stopped or reset by me.