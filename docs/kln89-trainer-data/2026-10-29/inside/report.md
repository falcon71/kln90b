# KLN 89 trainer: sequencing at the bisector on the inside of a turn, within 4.0 NM (2026-10-29, 16:30-17:09)

Agent check in the KLN 89 trainer. The maintainer restarted the trainer; I waited for its screen before touching the
VM. Question (from `docs/kln89-trainer-data/2026-10-29/analysis-4.md`): does an aircraft on the inside of a turn,
between the plan gate and 4.0 NM off the leg, on the abeam plan, get sequenced once it is past the bisector, far before
the waypoint? Predictions as written before each pass: [predictions.md](predictions.md). Scripts as in
`..` (the main 2026-10-29 check) (copied to `scripts/`); PNG frames in `scripts/rec/`. Nothing in the repository was changed,
nothing was posted, only the KLN 89 trainer was used.

## Setup

- **Fresh trainer start.** I acknowledged the startup pages (warning, self test, initialization, database, fuel) and
  set NAV 1 line 2 to `Fly L/R`. FPL 0 checked row by row: 8Z 8Y 8X 8V 8U 8T 8S 8R. User waypoints checked on their
  USR pages: 8T N 44 40.00 W 089 37.00, 8U N 44 26.00 W 089 03.00, 8S N 44 40.00 W 088 44.00 (8Z, 8Y, 8X, 8V and 8R
  were seen during the 28th's re-inserts). SET 4 turn anticipation ENABLED for the runs, GS 120 (119 kt shown).
- **Geometry.** 8T: inbound 304 from 8U, outbound 094 to 8S, a 150-deg RIGHT turn, so the inside is to the RIGHT of
  the inbound leg. I computed the cross-track to both great-circle lines for each start; the bisector is where the two
  are equal. Plan gate at 119 kt: 2.74 NM (83 s of GS).
- **Starts.** Every pass used a single SET 1 jump that changed the active leg, from 20 NM before 8U on the 8V-8U leg.

## Passes

| file | pass | start (NM before 8T, right) | plan at the landing | to the 8U-8T / 8T-8S lines | observed |
|---|---|---|---|---|---|
| `i1.csv` | I1 | 10.0, 3.3, HDG 304 | abeam (3.3) | 3.30 / 2.17 (past the bisector) | 8T-8S active from the first frame after the Ok?; 8T never active. The re-init picked the closest leg |
| `i2.csv` | I2 (control) | 6.0, 2.0, HDG 304 | lead (2.0) | 2.00 / 1.28 (past) | the same: 8T-8S active at once. The re-init pick does not depend on the plan |
| `i3a.csv` | I3'a | 12.6, 3.3, HDG 004 | abeam (3.3-3.4) | 3.30 / 3.47 (0.17 before the line) | 8U-8T active at the landing (SET 1 and the first NAV 1 frame: DTK 305, Fly L 3.4). **Sequenced 4 s after the landing**: 8T-8S active, DTK 094, Fly L 3.4, no turn, no alert |
| `i3b.csv` | I3'b | 9.0, 2.3, HDG 004 | lead (2.3-2.4) | 2.30 / 2.53 (0.23 before) | 8U-8T active at the landing (Fly L 2.4). **Sequenced 6 s after the landing**, no turn |
| `i3c.csv` | I3'c | 12.6, 3.2, HDG 004 | abeam (3.3-3.4) | 3.20 / 3.56 (0.36 before) | 8U-8T active for 9 s (NAV 1 frames for 4.5 s: DTK 305, Fly L 3.3-3.4). **Sequenced 9 s after the landing**, no turn |

## How I changed the briefed runs, and why

- **I1 and I2 (landing past the bisector).** These cannot answer the question. A SET 1 re-initialization picks the
  closest leg at once, so 8T is never active.
- **I3 as briefed** (3.3 inside at 14 NM, the line at 3.75) cannot cross in flight: the 119-kt take-home loses 1.3-1.9
  NM of XTK per NM, faster than the line approaches (0.27 NM per NM).
- **I3' instead.** I landed just before the line, with 8U-8T active, and a heading 60 deg to the right of the course
  (004, outward). For the few seconds before the take-home turns back, XTK grows about 0.03 NM/s while the gap closes
  about 1.9 times as fast. The aircraft therefore crosses the line in flight.
- **The timing confirms it.** The crossing times follow the gaps: 0.17, 0.23 and 0.36 NM gave sequencing after 4, 6
  and 9 s, as computed. The sequencing follows the crossing, not the re-initialization.
- **The 60-kt repeat** (item 4) was not needed.

## Answer

**Yes.** On the inside of the 150-deg turn at 8T, at 3.3-3.4 NM off the leg (between the 2.74 gate and 4.0), on the
abeam plan, 12-13 NM before the waypoint, the unit sequenced 8T as soon as the aircraft crossed the bisector. That is
outcome (i): no turn, no alert, the next leg (DTK 094) active, line 2 the XTK to it. The same happened on the lead
plan at 2.3 NM, 9 NM out (I3'b). So the sequencing at the bisector does not depend on the plan, and it applies within
4.0 NM as it does beyond. Confidence medium-high: three passes, timing consistent with the geometry, all within 4-9 s
after a jump landing. All crossings were at 119 kt and at 8T only.

## Trainer state left behind

- KLN 89 trainer running, NAV 1 shown, cursor off, line 2 `Fly L/R`, take-home flying at GS 120 (shown 119 kt) on
  8S to 8R (18.2 NM to 8R at the end), SET 1 HDG 280. SET 4 turn anticipation DISABLED.
- FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R, checked row by row at the end. No FPL edits, no user waypoint changed, no
  numbered flight plan touched, the VM not started, stopped or reset.