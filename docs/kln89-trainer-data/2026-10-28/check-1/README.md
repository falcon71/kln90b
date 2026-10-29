# KLN 89 trainer recordings, 2026-10-28

The raw data behind the trainer check of 2026-10-28 for #438 (the turn-plan gate), #439 (the abeam plan: late
normal-arc turn or zero-size turn at the abeam line) and #440 (edits in front of the active waypoint). The findings are
in [report.md](report.md); the checks this one builds on are `docs/kln89-trainer-data/2026-10-20/` and
`docs/kln89-trainer-data/2026-10-27/` in the repository.

## How the data was recorded

As on 2026-10-27: the KLN 89 trainer in the VM "Windows 98" (maximized, 1920x1200), SET 1 take-home flying, positions
set by SET 1 jumps to points computed on the inbound great circle (`scripts/startpt.py <from> <wpt> <NM before>
<+right/-left NM>`), heading set to the inbound DTK. The 2026-10-27 recorder scripts were still in that session's
scratchpad and were reused unchanged (`scripts/rec.ps1` 4 Hz VirtualBox COM screenshots of the unit's screen,
`scripts/ocr.py` + `tpl.json` dot-grid template OCR, `scripts/proc.py csv` frames to CSV). Each CSV keeps only the
frames whose text differs from the frame before; one recording per run, started just before the run's SET 1 jump, so
each file also holds the setup steps (SET 1, FPL 0, USR pages).

The trainer had been relaunched before this session (found on the take-home warning, GS 0, SET 4 turn anticipation
DISABLED). SET 4 turn anticipation was ENABLED for every run and DISABLED again at the end. GS 120 entered (119 kt
shown) for every run; no 239 kt run was flown. NAV 1 line 2 was switched from the CDI bar to `Fly L/R x.xx` (CRSR, CLR)
for the OCR.

Columns, glyphs and timing are those of the 2026-10-20 and 2026-10-27 files:

- `t_s`: seconds since the recorder of that run started (wall clock). The trainer runs about 6 % slow.
- `wall_clock`: the host's time of the frame.
- `line1` to `line4`: the 23 characters of each screen row as read: on NAV 1 `<dist>|<from> <arrow> <to>`,
  `<gs>|<XTK line>`, `<status>|DTK ... TK ...`, `NAV 1 |<bearing>To <ETE>`.
- `@` is the waypoint-alert arrow (blank in the off phase of its flashing), `#` an inverse cell (the message prompt in
  the status column, a field being edited), lowercase letters the small text, `?` a glyph the OCR did not recognize
  (edit fields, and an underlined `S` on FPL 0 reads as `1`).
- A message was pending for most of the session, so the status-column prompt `##` flashes in almost every frame and does
  not mark the turn start here; the turn start is the DTK change on NAV 1.

On FPL 0, SET 1 and USR pages the arrow is not drawn; the time of an FPL 0 edit is the frame where the page changed
after the final ENT, known to about 0.5 s; the first NAV 1 frame after an edit came 3 to 6 s later.

## Flight plan and user waypoints

FPL 0 at the start and the end: 8Z 8Y 8X 8V 8U 8T 8S 8R (positions in the 2026-10-27 README). During the session
waypoints were deleted and inserted again (see the run table); at the end the plan was checked row by row. 8Q, used in
one insert, is no longer the 2026-10-20 point: it is N44°32.00' W086°07.10', 138 NM east of 8T. No user waypoint was
created, changed or deleted; no numbered flight plan was touched.

Turns used (trainer DTKs, magnetic; L = the lead at 119 kt by the 2026-10-20 rule, r 0.63 NM, capped at 60 s of GS):

| waypoint | inbound | outbound | turn | L (NM) | arc radius (L / tan(turn/2)) |
|---|---|---|---|---|---|
| 8U | 065 (from 8V) | 305 to 8T | 120 L | 1.09 | 0.63 |
| 8T | 304 (from 8U) | 094 to 8S | 150 R | 1.98 (cap) | 0.53 |
| 8S | 095 (from 8T) | 284 to 8R | 171 L | 1.98 (cap) | 0.16 |

## Runs

"al" = along-track distance to the waypoint, "XTK@1.5" = cross track 1.5 NM along-track before the turn point
(al = L + 1.5), "nominal" = the decision point the unit uses today (al = L + 20 s of GS = L + 0.66 NM).

| file | content |
|---|---|
| `j1.csv` | technique tests: jump 7 NM before 8T, 2.0 left; cursor on NAV 1 and on FPL 0 do not stop the take-home steering; an aborted 8R insert; 8R deleted (the delete snapped the take-home heading to the DTK for a few seconds); then 8R re-inserted. No clean pass. |
| `p1.csv` | jump 2.2 NM before 8U, 2.0 right, heading change 124 deg: the take-home diverged (TK 076-091) and the unit switched DTK to 305 4 s after the jump with line 2 about 2.8-3.0 (not the arc, about the distance to the outbound leg line), alert flashing from the first frame. A jump artifact like run A of 2026-10-20; not used. |
| `r1.csv` | a15 repeat (jump 4.3 before 8T, 4.4 left): XTK@1.5 about 4.5, nominal 2.6: abeam plan, late normal-arc turn at al 0.91 |
| `r2.csv` | 8T, second jump 3.9 before (al 3.9), 3.0 left: XTK@1.5 2.97, nominal 1.82: abeam plan, late normal-arc turn at al 1.78 |
| `r3.csv` | 8T, al 3.9, 2.6 left: XTK@1.5 2.52, nominal 1.50: LEAD plan, alert at al 2.34, turn at al 1.95 |
| `r4.csv` | 8U, al 3.1, 3.2 right: XTK@1.5 3.08, nominal 1.71: abeam plan, late normal-arc turn at al 0.78 |
| `r5.csv` | 8T, al 3.9, 2.85 left: XTK@1.5 2.80, nominal 1.69: abeam plan, late normal-arc turn at al 1.90 |
| `q3a.csv` | #440 3a: 8T on course; 8V (two before the FROM 8U) deleted about 10 s into the turn (d 1.7) |
| `q3b.csv` | #440 3b: 8S on course; 8U deleted about 7 s after the 8S sequencing, during the run-out |
| `q3c.csv` | intended 3c, the edit did not fire (watcher bug); a second a15 repeat: abeam plan, late normal-arc turn at al 1.77 |
| `q3c2.csv` | #440 3c: a15 start (abeam plan, XTK@1.5 about 3.4); 8X deleted at al 2.3 with XTK 1.5 |
| `q3b2.csv` | #440 3b repeat: 8S on course; 8Y deleted about 1 s after the 8S sequencing |
| `q3e.csv` | #440 3e/3f, not in a turn: FROM 8U deleted 6.8 NM before 8T; 8U inserted again in front of the new FROM 8T; 8Q inserted between FROM 8T and TO 8S; 8Q deleted |
| `q3e2.csv` | #440 3e during a turn: FROM 8T deleted about 2 s after the 8S turn start; then the restoration inserts (8T, 8X, 8Y) and the end state |

Analysis tables: `etab.txt` (XTK at fixed along-track distances before the turn point, all passes of 2026-10-20,
2026-10-27 and today, made by `scripts/etab.py`), `q2tab.txt` (abeam-plan turn starts, `scripts/summ.py`).

Scripts in `scripts/`: the 2026-10-27 set (`kln.ps1`, `shot.ps1`, `rec.ps1`, `ocr.py`, `tpl.json`, `proc.py`,
`parse_lib.py`, `geo.py`, `startpt.py`, `jumpkeys.py`, `watch*.py`, ...), the 2026-10-20 `genjump.py`, and new:
`jump.ps1`/`go.ps1` (SET 1 jump and `Ok?`), `mon.py` (live monitor), `watch_d.py` (fire keys at a status-column
distance), `ana.py`/`summ.py` (local-frame reconstruction from distance and bearing, distance to the normal arc, key
moments of a pass), `tau.py`/`etab.py` (XTK before the turn point), `q3sum.py` (event list with edits, alert end). The
PNG frames are in `scripts/rec/` (about 230 MB; delete when no longer needed).
