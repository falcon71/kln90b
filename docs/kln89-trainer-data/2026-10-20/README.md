# KLN 89 trainer recordings, 2026-10-20

The raw data behind the three trainer checks of 2026-10-20 on waypoint sequencing and turn anticipation (#375, #157, #76).
Their summary is the 2026-10-20 block of [kln89-trainer-record.md](../../kln89-trainer-record.md); the three agent reports
are kept beside the data as they were written:

- [report-turn-anticipation.md](report-turn-anticipation.md): turn start, lead cap, half-leg limit, sequencing at the
  bisector, the first off-course passes (runs A to G).
- [report-off-course.md](report-off-course.md): the 4.0 NM cross-track rule for off-course passes (runs R1 to R8).
- [report-turn-start.md](report-turn-start.md): where the turn starts off course within 4.0 NM: the decision about
  20 s before the turn point, latched, with the 2.8 NM gate (runs T2 to T14). Its recording folder `rec2/t2b` is
  `t2.csv` here.

The reports name helper scripts and frame folders in a session scratchpad; those were not kept. These CSV files are what
was kept of the frames.

## How the data was recorded

The trainer ran in SET 1 take-home mode, SET 4 turn anticipation on unless a run says otherwise. A recorder took a
screenshot of the unit's screen every 250 ms, and a template OCR read the four text lines of every frame. Each CSV keeps
the frames whose screen text differs from the frame before, so every flash toggle is in it, at 4 Hz resolution.

Columns:

- `t_s`: seconds since the recorder started (wall clock). **The trainer runs about 6 % slow**: trainer seconds are
  about 0.94 × these seconds, and ground speeds shown as 239 and 119 kt covered ground at about 224 and 112 kt.
- `wall_clock`: the host's time of the frame.
- `line1` to `line4`: the 23 characters of each screen row as read. Mostly NAV 1, which reads
  `<dist>|<from> <arrow> <to>`, `<gs>|<XTK line>`, `<status>|DTK ... TK ...`, `NAV 1 |<bearing>To <ETE>`.

Glyphs: `@` is the waypoint-alert arrow between the idents (blank in the off phase of its flashing), `#` an inverse cell
of the flashing message prompt in the status column of line 3, `>`, `[`, `^`, `{`, `}` the trainer's symbol glyphs,
lowercase letters its small text (`nm`, `kt`, `d` for degrees), and `?` a glyph the OCR did not recognize (rare on NAV 1).
The other pages that show up (FPL 0, SET 1, SET 2, ...) are the setup steps between runs.

## Flight plan and user waypoints

FPL 0: 8Z 8Y 8X 8V 8U 8T 8S 8R, later with 8P inserted before 8S (8Q was inserted and removed for one run).
Turns from the trainer's own DTKs (magnetic): 8Y 31° right, 8X 62° left, 8V 92° right, 8U 120° left, 8T 150° right,
8S 171° left.

| ident | position |
|---|---|
| 8Z | N43°30.00' W089°30.00' |
| 8Y | N43°44.00' W089°30.00' |
| 8X | N44°00.00' W089°17.00' |
| 8V | N44°15.00' W089°30.00' |
| 8U | N44°26.00' W089°03.00' |
| 8T | N44°40.00' W089°37.00' |
| 8S | N44°40.00' W088°44.00' |
| 8R | N44°44.00' W089°20.00' |
| 8Q | N44°40.00' W088°46.81' (2.0 NM before 8S) |
| 8P | N44°40.00' W088°48.22' (3.0 NM before 8S) |

## Runs

| file | content |
|---|---|
| `run240.csv` | the whole plan flown on course at 239 kt: the six turns |
| `run120.csv` | the turns on course at 119 kt (SET 1 jumps to each), then off-course runs A (8V), B (8X), C (8U), an abandoned run, D (8T) |
| `q2b.csv` | turn anticipation OFF at 8U (1.2 NM off), runs E (8T, 6.9 NM, 119 kt), F (8T, 4.8 NM, 239 kt), G (abandoned), the 171° turn after the 2.0 NM leg from 8Q at 239 and 119 kt |
| `q2c.csv` | the 171° turn after the 3.0 NM leg from 8P, 119 kt |
| `r1.csv` | R1: 8T, 4.3 NM abeam, 119 kt |
| `r2.csv` | R2: 8T, 3.5 NM abeam, 119 kt (the 4.0 NM transition) |
| `r3.csv` | R3: 8V, 5.1 NM abeam, 119 kt |
| `r4.csv` | R4: 8T, 4.4 NM abeam, 239 kt |
| `r5.csv` | R5: abandoned (the jump re-oriented the plan to 8S - 8R) |
| `r6.csv` | R6: 8T, 3.0 NM abeam, 239 kt (the 4.0 NM transition) |
| `r7.csv` | R7: 8X, inside of the turn, sequenced 11.0 NM from it |
| `r8.csv` | R8: 8Y, inside of the turn, sequenced 1.4 NM before abeam |
| `t2.csv` | T2: 8Y 31°, 239 kt, inside, XTK 1.5 NM 20 s before the turn point: turned there |
| `t3.csv` | T3: 8U 120°, 239 kt, outside, 1.8 NM: turned at the turn point |
| `t5.csv` | T5: 8U 120°, 239 kt, outside, 5.3 NM (beyond 4.0): abeam |
| `t6.csv` | T6: 8T 150°, 119 kt, outside, 2.4 NM: turned at the turn point |
| `t7.csv` | T7: 8V 92°, 239 kt, outside, 2.9 to 3.0 NM: abeam |
| `t8.csv` | T8: 8U 120°, 239 kt, outside, 2.1 NM: turned at the turn point |
| `t9.csv` | T9: spoiled (the jump re-oriented the plan) |
| `t10.csv` | T10: 8X 62°, 239 kt, outside, 2.83 to 2.87 NM: turned at the turn point |
| `t11.csv` | T11: 8X 62°, 239 kt, outside, 3.9 NM: abeam |
| `t12.csv` | T12: 8T 150°, 239 kt, outside, 2.3 NM: turned at the turn point |
| `t13.csv` | T13: 8U 120°, 119 kt, outside, 2.80 NM: abeam |
| `t14.csv` | T14: 8T 150°, 119 kt, outside, 2.7 NM: turned at the turn point |

The times of each event (alert onset, DTK switch, sequencing) are in the raw logs of the reports, in the `t_s`
of these files.
