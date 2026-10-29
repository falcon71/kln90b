# KLN 89 trainer: confirmation runs of the third analysis and the drift test (2026-10-29)

Agent check in the KLN 89 trainer (VM "Windows 98", SET 1 take-home flying, SET 4 turn anticipation on for the runs).
It flies the four runs of `../2026-10-28/analysis/analysis-3.md` section 6 and then a drift test. Predictions as written
before each pass, with the first reading after it: [predictions.md](predictions.md). Scripts as in the earlier
sessions, copied to `scripts/` (new: `trig.py`, fire keys at a status distance on any page). PNG frames in
`scripts/rec/`, about 195 MB. Nothing in the repository was changed, nothing was posted, only the KLN 89 trainer
was used.

Candidates: **H4** = decided at the first calculation after the leg becomes active or the position is re-initialized,
lead iff XTK <= about 80 s of GS (5.31 NM at 239 kt, 2.64 at 119), uncapped, latched; **H4+4.0** = H4 with abeam
latched when a leg change lands above 4.0; **R-A** = one decision 45 s before the turn point with the same gate.
Notation as before (al-L = NM before the turn point; lead = alert about 20 s of closure before L and the DTK switch
at al = L; abeam = neither, then Rule 2 or the zero turn).

## Files

| file | pass | GS | start | plan |
|---|---|---|---|---|
| `t7r.csv` | 1: T7 repeat | 239 | 8V, single jump from 8T-8S (leg change), landing al-L 5.58 with 6.0 left | abeam, zero turn at the abeam line |
| `g50.csv` | 3a: gate 5.0 | 239 | 8T, single jump from 8V-8U (leg change), landing al-L 3.82 with 5.0 left | abeam, Rule 2 flip after L |
| `g48a.csv` | 3b, failed | 239 | jumped out of the 8U turn in progress, heading 302, recorder ran out | not used |
| `g48.csv` | 3b: gate 4.8 | 239 | 8T, single jump from 8V-8U (leg change), landing al-L 3.73 with 4.8 left | lead |
| `t8r.csv` | 2: T8 replica | 239 | 8U, single jump from 8T-8S (leg change), landing al-L 4.70 with 4.5 right | lead |
| `s1c1.csv` | 4: S1 clean 1 | 119 | 8T, single jump from 8V-8U (leg change), landing al-L 3.63 with 2.9 left | lead-looking, masked |
| `s1c2.csv` | 4: S1 clean 2 | 119 | 8T, as 1 but landing al-L 2.06 with 2.9 | abeam, flip just before L |
| `d1.csv` | drift D1 | 239 | normal sequencing at 8U, then 8T moved (N 44 48.50, W 089 30.00) at 1.6 NM before the old turn point | abeam, zero turn at the abeam line |
| `d2.csv` | drift D2 | 239 | as D1, 8T moved at about 5 NM before the old turn point | abeam, Rule 2 flip after L |

## The four runs

| run | XTK: landing / 45 s (al-L 3.0 at 239, 1.49 at 119) / 2.1 / 1.5 / L | observed | H4 (80 s) | H4+4.0 | R-A |
|---|---|---|---|---|---|
| 1 T7 repeat (8V) | 6.0 / 4.80 / 4.08 / 3.44 / 2.05 | **abeam**: no alert and no switch at L; zero-turn alert 15.5 s before the abeam line; switch at the abeam line, line 2 0.97 = d; 0.99 reached 1.25 s before the line, so no flip | abeam: fits | abeam: fits | lead: **refuted** |
| 3a gate 5.0 (8T) | 5.0 / about 4.95 / 4.50 / 4.07 / 2.76 | **abeam**: no switch at L; first 0.99 at al-L -2.63, switch 9.0 s later at al 0.76 (before the abeam line), line 2 from 0.82 to 2.70 (the arc), alert with it | lead (5.0 < 5.31): **refuted**; the gate is below 5.0 | abeam: fits | lead: **refuted** |
| 3b gate 4.8 (8T) | 4.8 / 4.70 / 4.12 / 3.40 / 1.77 | **lead**: alert at al-L 0.91, 19.75 s before the switch at al 4.02 = L (XTK 1.70), line 2 the arc, sequencing at 290, alert end 3.92 past | lead: fits | abeam: **refuted** | lead: fits |
| 2 T8 replica (8U) | 4.5 / 3.80 / 2.84 / 2.14 / 1.20 | **lead**: alert at al-L 1.11, 20.25 s before the switch at al 3.08 = L (XTK 1.20), line 2 the arc, alert end 3.10 past | lead: fits | abeam: **refuted** | lead: fits |
| 4 S1 clean, pass 1 (8T, 119 kt) | 2.9 / 0.73 / 1.27 / 0.73 / 0.21 | lead-looking: alert 22.25 s before the switch at L, but XTK < 1.0 from al-L 1.88 | abeam then flip before L: fits | - | lead: fits | 
| 4 S1 clean, pass 2 | 2.9 (al-L 2.06) / 2.70 / 2.90 / 2.70 / 0.84 | **abeam**: no alert before the switch; switch at L 9.75 s after the first 0.99 (al-L 0.19), alert with it | abeam: fits | - | abeam (2.70 > 2.64 by one display step): fits |

**Verdicts.**
- **R-A is refuted** by runs 1 and 3a: lead predicted with 4.80 and 4.95 at 45 s, both abeam. That is decisive.
- **H4+4.0 is refuted** by runs 3b and 2: leg changes with 4.8 and 4.5, both lead.
- **H4's mechanism fits all six usable passes**: decided at the landing, latched, no later window needed.
- **H4's gate does not fit at 239 kt.** A leg change gives lead with 4.8 and abeam with 5.0, so **G(239) is in
  [4.8, 5.0) NM, i.e. 72-75 s of GS**. That is below 80 s (5.31) and below the bracket the analysis gave (78-85 s).
  With the earlier sessions: G(60) in [1.30, 1.48) (78-89 s), G(119) in [2.7, 2.8) (82-85 s), G(239) in [4.8, 5.0)
  (72-75 s). One time constant does not fit all three speeds within these brackets. The 239-kt gate is relatively
  lower, so it is not proportional to the ground speed above 119 kt. The landing values are the entered offsets, read
  back on NAV 1 to 0.1 NM.
- **Run 4 was not decisive** after two passes, so it cannot separate H4 from R-A at 119 kt. Pass 1: the 119-kt
  take-home converged before 45 s, and the flip is masked. Pass 2: it stayed on the gate at 45 s (2.70), where both
  predict abeam. R-A is refuted by runs 1 and 3a anyway.
- **Rule 2 at 239 kt, first observations.** 3a flipped 9.0 s after the first 0.99 frame and D2 12.0 s after it, both
  with line 2 jumping to the arc distance and the alert on with the switch, after L and before the abeam line. Run 1
  reached 0.99 only 1.25 s before the abeam line and took the zero turn. This fits R2-A (1.0 NM, a check every 12 s
  or so) at 239 kt.

## Drift test

Goal: activate the leg normally at a sequencing with XTK near 0, then get well off it without a SET 1 jump.

**What I tried, and why the plain drift did not work.**
- *SET 1 heading change without a position change.* An earlier ignored jump (01:22, g48a.csv) showed what happens: a
  heading entered without an applied position is flown (TK 305 on a 094 leg). The take-home then turns back, at about
  1.3 deg/s, so the excursion stays small. Every SET 1 `Ok?` is also a candidate re-initialization under H4. I did not
  use it. In that episode the unit switched the active leg to 8S-8R 50 s after the `Ok?`, unexplained.
- *OBS excursion.* Not flown. The return to LEG is a likely activation, and with the take-home steering to the OBS
  course an abeam outcome could not be told from a re-decision.
- *Geometry.* Not flown. Every pass today and before shows the take-home intercepting at 40-60 deg from any offset,
  so no geometry leaves a large XTK at the next waypoint without a jump.
- *Moving the active TO waypoint (used).* The trainer lets a user waypoint in FPL 0 be edited on its USR page, both
  latitude and longitude, also while it is the active TO. 8T was recorded first at N 44 40.00, W 089 37.00 and
  restored to exactly that after each pass (read back on the USR page).

**D1 (239 kt).** Setup: on course 7 NM before 8U, then a normal sequencing at 8U (XTK 0.04). On 8U-8T, I moved 8T to
N 44 48.50, W 089 30.00 at 1.6 NM before the old turn point; the new geometry is inbound 324, 145 R, L 3.98.
- Right after the edit: XTK 7.3. The take-home converged to about 5.5 at 45 s before the new turn point and 3.6-4.0
  at L.
- Observed: no switch at L, the zero-turn alert about 15 s before the abeam line, the switch at the abeam line with
  line 2 = d. **Abeam.**
- H4 with the plan latched at the sequencing, and edits not re-deciding, predicted lead: **refuted**.

**D2 (239 kt).** The same, with the edit at about al-L 6 (first NAV 1 frame: XTK 6.2 at al-L 5.66).
- XTK history: 5.00 at al-L 3.5, **4.55 at 45 s (al-L 3.0)**, **3.80 at 2.1**, 3.17 at 1.5, 1.87 at L (never below
  1.0 before L).
- Observed: no switch at L; the first 0.99 at al-L -1.57; switch 12.0 s later, line 2 from 0.76 to 1.80 (the arc),
  alert with it. **Abeam**, then the Rule 2 flip.
- A decision in flight at 45 s or 2.1 NM before the turn point would have seen 4.55 and 3.80, below the 239-kt gate
  (4.8-5.0), and given lead: **refuted**.
- D2 fits two readings: the TO edit re-decides like a re-initialization (XTK 6.2 at the edit), or a decision 53 s or
  more before the turn point (XTK 5.0 at al-L 3.5).

**What this says about drift in flight.** Neither pass held a lead plan through the excursion. Both are consistent with
H4 if an edit of the active TO waypoint counts as a re-initialization. Unlike FPL deletes of flown waypoints, which
never changed the plan, this edit changes the TO itself. The pure drift case remains untested: a leg activated with
XTK 0 and left later by flying alone. The take-home always re-intercepts, and every means of moving the aircraft or the
leg is itself a candidate re-initialization.

## Trainer state left behind

- KLN 89 trainer running, NAV 1 shown, cursor off, line 2 `Fly L/R`, take-home flying at GS 120 (shown 121 kt) on
  8S to 8R (17.8 NM to 8R at the end), SET 1 HDG 280, a message pending. SET 4 turn anticipation DISABLED.
- FPL 0 = 8Z 8Y 8X 8V 8U 8T 8S 8R, checked row by row at the end. No FPL edits this session.
- User waypoint 8T: moved twice (D1, D2) to N 44 48.50, W 089 30.00 and restored each time to N 44 40.00, W 089 37.00;
  read back on the USR page after the final restore. 8R's latitude was re-entered with its unchanged value (44 44.00)
  once, to test whether editing is allowed. No other user waypoint was touched, no numbered flight plan was touched,
  and the VM was not started, stopped or reset.