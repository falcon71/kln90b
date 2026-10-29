# Predictions written before each pass (2026-10-29, the fly-over threshold, #444)

Known ([../check-1/](../check-1/report.md)): 171.2 deg (8S) normal turn anticipation; 176.2 deg (8U) and 180 deg fly-over (no
anticipation, no early sequencing, alert about 36-38 s before the waypoint, sequencing at the waypoint).
Method: inbound 8U -> 8T (28 NM), FPL 0 temporarily 8Z 8Y 8X 8V 8U 8T 8N 8S 8R with a temporary user waypoint 8N
12 NM after 8T, placed so that the right turn at 8T has the wanted angle (`scripts/ang.py`: angle = great-circle
course 8T -> 8N minus the course arriving at 8T, 299.82 true; the initial course of the inbound leg at 8U is 300.22,
so an angle from initial courses is 0.40 deg larger). 8N's coordinates are edited on its USR page between passes.
Each pass: land on course 6 NM before 8T (L 1.98 at 119 kt), HDG 304, SET 4 on.
- lead (anticipating): alert about 20 s of closure before the turn point (al about 2.6), DTK switch at al 1.98.
- fly-over: no switch at al 1.98; alert from about 1.2 NM (36-38 s), switch and sequencing at the waypoint.

## T1: 173.5 deg (written before the pass)
8N at N44 35.24 W089 21.54 (computed turn +173.48). Bracket (171.2, 176.2): no prediction beyond the two outcomes.

## T1 read (written after the pass)
173.5 deg (trainer DTKs 304 -> 118, i.e. 174 by the displayed integers): **lead**. Alert from 2.8 NM (19:45:14), DTK
switch at 2.0 NM (19:45:38.7, = L 1.98), 24.8 s after the alert onset, line 2 the arc. Bracket now (173.5, 176.2).
(A first T1 attempt went wrong: the SET group opened on SET 4 and the jump keys toggled it; SET 4 was checked
ENABLED afterwards and the jump redone; `t1_1735.csv` holds the good pass.)

## T2: 175.0 deg (written before the pass)
8N moved to N44 34.95 W089 21.72 (computed +175.00; the DTKs should read about 304 -> 119).

## T2 read (written after the pass)
175.0 deg (DTKs 304 -> 119): **lead**. Alert from 2.7 NM (19:55:23), switch at 2.0 NM (19:55:47.8), 24.5 s later.
Bracket now (175.0, 176.2).

## T3: 175.5 deg (written before the pass)
8N moved for a computed +175.5 (see below).

## T3 read (written after the pass)
175.5 deg (DTKs 304 -> 120): **fly-over**. Alert from 1.2 NM (20:06:16.6), no switch at 2.0 NM, DTK 304 until 8T was
reached, then 120; bracket now (175.0, 175.5).

## T4: 175.25 deg (written before the pass)
8N at N44 34.90 W089 21.75 (computed +175.26). If the displayed DTK reads 119, a lead turn would point at the unit
using whole-degree DTKs (175 vs 176).

## T4 read (written after the pass)
175.25 deg (computed +175.26; DTKs 304 -> 119, the same integers as the lead pass T2): **fly-over**. Alert from 1.2 NM
(20:17:15.2), no switch at 2.0 NM, 8T sequenced at the waypoint. The whole-degree DTKs do not decide it (175 by
the integers in both T2 and T4); the threshold lies in (175.00, 175.26] deg by the great-circle courses at 8T.
