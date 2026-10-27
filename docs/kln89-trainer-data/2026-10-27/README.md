# KLN 89 trainer recordings, 2026-10-27

The raw data behind the trainer check of 2026-10-27 on the end of the waypoint alert (#406), flight plan edits next to
the active waypoint (#408) and same-second display updates (#407). The findings are in [report.md](report.md); the
earlier check this one builds on is [../2026-10-20/](../2026-10-20/README.md).

## How the data was recorded

As on 2026-10-20: the KLN 89 trainer in the VM "Windows 98", SET 1 take-home flying, positions set by SET 1 jumps to
points computed on the inbound great circle (along-track distance before the waypoint, cross-track offset). The
recorder was rebuilt for this session: a background PowerShell loop took a VirtualBox COM screenshot of the unit's
screen every 250 ms, a template OCR on the dot grid (23 cells of 7 dots, 4 text lines) read every frame, and each CSV
keeps only the frames whose text differs from the frame before. One recording per run, started just before the run's
SET 1 jump, so each file also holds the setup steps (SET 1, FPL 0, USR and message pages).

SET 4 turn anticipation was ENABLED for runs a1 to a11 and DISABLED for a12. GS was 120 entered (shown 119 kt) except in
a1, where it was cut to 10 kt after the sequencing and later restored.

Columns, glyphs and timing are those of the 2026-10-20 files:

- `t_s`: seconds since the recorder of that run started (wall clock). **The trainer runs about 6 % slow**, so trainer
  seconds are about 0.94 x these seconds, and 119 kt shown covered about 0.031 NM per wall second.
- `wall_clock`: the host's time of the frame.
- `line1` to `line4`: the 23 characters of each screen row as read: on NAV 1
  `<dist>|<from> <arrow> <to>`, `<gs>|<XTK line>`, `<status>|DTK ... TK ...`, `NAV 1 |<bearing>To <ETE>`.
- `@` is the waypoint-alert arrow (blank in the off phase of its flashing), `#` an inverse cell (the message prompt in
  the status column, or a field being edited), `>`, `[`, `^` the trainer's symbol glyphs, lowercase letters its small
  text (`nm`, `kt`, `d` for degrees), `?` a glyph the OCR did not recognize. The `?` cells are almost all in edit fields
  (SET 1 digits under the cursor, underlined FPL 0 rows) and on the message page; the NAV 1 rows read clean.

What the OCR cannot show: on the FPL 0, USR and SET 1 pages the arrow is not drawn, so the alert state is visible only on
NAV 1; the status column (distance, active waypoint, message prompt) is visible on every page. The time of an FPL 0 edit
is therefore the frame where the page changed after the final ENT, known to about 1 s.

## Flight plan and user waypoints

FPL 0 for this session: 8Z 8Y 8X 8V 8U 8T 8S 8R (the user waypoints of 2026-10-20). 8P is no longer the 2026-10-20
point (a later session redefined it at N44°36.00' W086°07.10'), so it was left out, and 8T is followed directly by 8S
on the same course 094. No user waypoint was created or changed. Positions:

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

Turns used (trainer DTKs, magnetic; L = the lead at 119 kt by the 2026-10-20 rule, standard-rate radius 0.63 NM, capped
at 60 s of GS = 1.98 NM):

| waypoint | inbound | outbound | turn | L (NM) |
|---|---|---|---|---|
| 8V | 332 (from 8X) | 064 to 8U | 92 R | 0.65 |
| 8V | 332 | 018 to 8R (inserted) | 46 R | 0.27 |
| 8V | 332 | 353 to 8T (8U deleted) | 21 R | 0.12 |
| 8V | 332 | 184 to 8Y (inserted) | 148 R | 1.98 (cap) |
| 8U | 064 (from 8V) | 305 to 8T | 120 L | 1.08 |
| 8U | 064 | 049 to 8S (8T deleted) | 16 L | 0.09 |
| 8T | 304 (from 8U) | 094 to 8S | 150 R | 1.98 (cap) |
| 8T | 304 | 076 to 8R | 132 R | 1.41 |
| 8S | 094 (from 8T) | 283 to 8R | 171 L | 1.98 (cap) |

## Runs

| file | content |
|---|---|
| `a1.csv` | 8U on course: GS cut to 10 kt right after the sequencing, kept there about 3 min, then restored (#406, question 2) |
| `a2.csv` | 8V on course: 8R inserted after 8V 5 s after the turn start (#408, question 5) |
| `a3.csv` | 8U on course: 8T deleted at 1.4 NM, before the turn start, alert onset not seen (#408, question 4) |
| `a4.csv` | 8V on course: alert onset seen on NAV 1, then 8U deleted at 1.1 NM, before the turn start (#408, question 4) |
| `a5.csv` | 8U on course: 8T deleted about 6 s after the turn start (#408, question 6) |
| `a6.csv` | 8V on course: alert onset seen, then 8Y inserted after 8V at 0.9 NM, a new lead longer than the distance left (#408, question 4) |
| `a7.csv` | 8U on course: 8S (two waypoints down) deleted 7 s after the turn start, the control (#408, question 8) |
| `a8.csv` | 8T, 3.3 NM left of the inbound leg at the jump, abeam plan; 8S inserted after 8T at along-track 0.7 NM (#408, question 7) |
| `a9.csv` | 8S on course: 8R, the last waypoint, deleted 3 s after the turn start, so 8S became the last waypoint (#408, question 6) |
| `a10.csv` | 8T, 3.3 NM left, jump 0.14 NM before the lead: turned at the lead; then 8R inserted after 8T during that turn (#408, question 7) |
| `a11.csv` | 8V, 2.7 NM left: 8Y inserted after 8V before any turn; the edit sequenced 8V at once (#408) |
| `a12.csv` | 8U on course, SET 4 turn anticipation DISABLED: sequencing at the waypoint (#407, question 9) |

Follow-up of the same evening (20:28-21:05, [report-2.md](report-2.md)): SET 4 turn anticipation ENABLED for these
runs and DISABLED again afterwards; FPL 0 as above at the start and the end. All four at 8T (inbound 304 from 8U,
outside = left of the leg), each reached by two SET 1 jumps (first to 5 NM before 8U, then to the start point) with
HDG 304 set:

| file | content |
|---|---|
| `a13.csv` | jump 4.3 NM along-track before 8T, 3.6 NM left; XTK 1.7 at the nominal decision point; turn at al = L without an alert; 8R inserted after 8T during the turn (question 7, priority 1, failed precondition) |
| `a14.csv` | jump 4.3 before, 4.4 left; XTK 2.0-2.1 at the decision point, no alert; 8R inserted after 8T at al 2.0 with XTK 1.5, before any turn (priority 1, failed precondition) |
| `a15.csv` | same start as a14, no edit: the control for the plan taken at XTK 2.0 |
| `a16.csv` | next leg 8R (8R inserted after 8T beforehand), jump 3.0 before, 3.8 left: abeam plan; 8S inserted after 8T at al 0.6 with XTK 1.0 (priority 2, the a8 repeat) |

The event times (alert onset and end, turn start, sequencing, edits) are in the reports, in the `t_s` of these files.
The recorder scripts and the frame folders were in that session's scratchpad (`trainer\`: `rec.ps1`, `kln.ps1`,
`shot.ps1`, `ocr.py` + `tpl.json`, `proc.py`, `parse_lib.py`, `geo.py`, `startpt.py`, `jumpkeys.py`, `watch.py`,
`watch_al.py`, `alertend2.py`, `sameframe.py`, `flash.py`) and were not kept.
