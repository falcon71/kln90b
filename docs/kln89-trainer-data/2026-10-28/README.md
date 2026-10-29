# KLN 89 trainer recordings, 2026-10-28

The raw data behind the trainer checks of 2026-10-28 on the turn-plan decision (#438), the abeam plan's late normal
turn (#439) and edits in front of the active waypoint (#440). The findings are in the reports of the three checks and
the analyses between them; the record entry is the 2026-10-28 block of
[../../kln89-trainer-record.md](../../kln89-trainer-record.md). The checks build on
[../2026-10-20/](../2026-10-20/README.md) and [../2026-10-27/](../2026-10-27/README.md), and continue in
[../2026-10-29/](../2026-10-29/README.md).

## Layout

The checks and analyses alternated: each analysis proposed rules and runs, and the next check flew them.

| folder | what |
|---|---|
| [check-1/](check-1/report.md) | the first check: the decision moment and gate (Q0 to Q2), the late turn, #440 edits (Q3) |
| [analysis/analysis-1.md](analysis/analysis-1.md) | first analysis: candidates R1-A, R1-B (decision 1.5 NM before the turn point) and R2-A, R2-B |
| [check-2/](check-2/report.md) | runs W, P, Z', G' and the #440 runs 3a', 3b', 3d |
| [analysis/analysis-2.md](analysis/analysis-2.md), [third-speed.md](analysis/third-speed.md) | second analysis (C1: 45 s before the turn point) and the design of the 60-kt passes |
| [check-3/](check-3/report.md) | runs Y, V, S and the 60-kt passes (flown from 22:12 to 00:03 on 2026-10-29) |
| [analysis/analysis-3.md](analysis/analysis-3.md) | third analysis (H4: decided at the leg's activation or a re-initialization) |

The rules of the earlier analyses were refuted by the later checks; the state reached is in
[../2026-10-29/analysis-4.md](../2026-10-29/analysis-4.md). Each report's predictions were written before each pass
(`predictions.md` where present).

## How the data was recorded

As on 2026-10-27: the KLN 89 trainer in the VM "Windows 98", SET 1 take-home flying, positions set by SET 1 jumps, a
4 Hz screen recorder with a template OCR, one CSV per pass keeping the frames whose text changed. The columns, glyphs
and the trainer's slow clock (about 6 %) are those described in [../2026-10-27/README.md](../2026-10-27/README.md).
SET 4 turn anticipation was on for the runs. FPL 0 was 8Z 8Y 8X 8V 8U 8T 8S 8R throughout; waypoints deleted for the
edit runs were inserted again with the same idents in the same order.

The recorder and geometry scripts and the screen frames (about 200 MB per check) were not kept; where a report names
`scripts/`, it means them.
