# KLN 89 trainer: the turn angle where anticipation stops (#444, 2026-10-29 19:32-20:24)

Agent check in the KLN 89 trainer. The previous session found normal turn anticipation at 171.2 deg and a fly-over
(no anticipation) at 176.2 and 180 deg; this one narrows the threshold. Predictions as written before each pass:
[predictions.md](predictions.md). Nothing in the repository was changed, nothing was posted.

## Method

- **Geometry.** Inbound 8U -> 8T (28 NM, so the lead is 1.98 NM at 119 kt, the 60-s cap, not the half-leg cap).
  FPL 0 was temporarily 8Z 8Y 8X 8V 8U 8T 8N 8S 8R.
- **Temporary waypoint.** 8N was placed 12 NM after 8T so that the right turn at 8T has the wanted angle
  (`scripts/ang.py`). The angle is the great-circle course 8T -> 8N minus the course arriving at 8T on the inbound
  leg (299.82 deg true).
- **Other conventions.** An angle taken from the initial course of the inbound leg at 8U (300.22) is 0.40 deg larger.
  The trainer's whole-degree DTKs are listed too.
- **Passes.** 8N's coordinates were edited on its USR page between passes. Each pass was a jump on course 6 NM
  before 8T (HDG 304, 119 kt, SET 4 on), after a positioning jump onto the 8V-8U leg.
- **Reading.** I read the alert onset and the DTK switch on NAV 1 (`scripts/cls.py`).

## Passes

| file | 8N | turn at 8T (course arriving / initial course at 8U) | trainer DTKs | alert onset | DTK switch | plan |
|---|---|---|---|---|---|---|
| `t1_1735.csv` | N44 35.24 W089 21.54 | 173.48 / 173.88 | 304 -> 118 | 2.8 NM | 2.0 NM (= L), 24.8 s after the onset | **lead** |
| `t2_1750.csv` | N44 34.95 W089 21.72 | 175.00 / 175.40 | 304 -> 119 | 2.7 NM | 2.0 NM (= L), 24.5 s after | **lead** |
| `t3_1755.csv` | N44 34.85 W089 21.78 | 175.52 / 175.92 | 304 -> 120 | 1.2 NM, 38 s before 8T | at 8T (d 0.0) | **fly-over** |
| `t4_17525.csv` | N44 34.90 W089 21.75 | 175.26 / 175.66 | 304 -> 119 | 1.2 NM, 39 s before 8T | at 8T (d 0.0) | **fly-over** |

Earlier sessions add: 171.2 deg lead (8S); 176.2 and 180 deg fly-over (8U, 8T).

**Threshold: between 175.00 and 175.26 deg** with the course arriving at the waypoint (175.40-175.66 from the
initial course of the inbound leg). That is a bracket of 0.26 deg, consistent with a round **175 deg**: anticipation
up to 175, fly-over above. The trainer's whole-degree DTKs do not decide it: T2 (lead) and T4 (fly-over) both read
304 -> 119. So the unit compares finer-grained courses than its displayed DTKs. Whether the comparison is "> 175"
or ">= 175.x" cannot be told at this resolution. The 8N coordinates are entered to 0.01', which is 0.04 deg at
12 NM.

## The fly-over alert

- **Onset.** At 1.2 NM, 36-39 s before the waypoint at 119 kt: T3 20:06:16.6 against the sequencing at 20:06:54.9;
  T4 20:17:15.2 against 20:17:54.2. P3a/P1 of the previous session gave the same.
- **Course and steering.** Through the fly-over the DTK stays on the inbound course and line 2 stays the inbound XTK.
  The waypoint is sequenced when the distance reaches 0.0. The take-home then turns onto the outbound leg after
  passing the waypoint (a teardrop at 176-180 deg).
- **End.** The flashing ends about 1 s after the sequencing. T3: arrow off at 20:06:55.1, steady from 20:06:55.9.
  T4: off at 20:17:54.7, steady from 20:17:55.9. There is no run-out alert on the new leg.

## Restore and state left behind

- **8N removed.** The temporary user waypoint 8N was deleted from FPL 0 and then from the user waypoint list (OTH 4,
  `Del 8N ?`, ENT).
- **FPL 0** = 8Z 8Y 8X 8V 8U 8T 8S 8R, checked row by row. No existing user waypoint was edited.
- **Trainer:** SET 4 turn anticipation DISABLED, GS 120 (119 kt shown), flying 8S to 8R on NAV 1 with `Fly L/R`,
  SET 1 HDG 280. All recorders have finished; none is running.
- **SET 4 mishap.** At the first T1 attempt the SET group opened on SET 4, the page last used, and the jump keys
  toggled it. I set it back to ENABLED and checked it before the pass.