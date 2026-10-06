# Session 5 design: navigation core

Session 5 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-5-navigation`.

## Scope

- **In:** the five items of Session 5: `KLNNavmath`; the flight plan model (`Flightplan`, `FlightplanUtils`,
  `Flightplanloader`, `ActiveWaypoint`, the #67 duplicates); `NavCalculator`; `ModeController` (LEG/OBS, the approach
  modes, direct-to); the roll steering pin and the XTK output filter. Also a shared approach-world fixture (task 1) and
  the pins for the bugs the research found in these areas.
- **Out:**
    - the roll steering algorithm beyond one pin (maintainer: pins only, because #100 plans a rework);
    - the four approach-scale questions (below): one `question` issue, no tests;
    - the cancel of APR ACTV by the GPS APR switch before the FAF: treated as intended for now, a `question` issue;
    - the MOD and NAV 3 page details beyond the one MOD 1 pin (Session 8);
    - the `USE? INVRT?` overlay that `Screen.read()` cannot read on numbered FPL pages: a harness gap for
      `testing.md` section 7, because no Session 5 test needs a numbered plan with legs.
- **Start state** on 2026-10-06: `npm test` 768 passed and 60 expected failures in 139 files, `npx tsc --noEmit` clean.
  Coverage of the area: `NavCalculator.ts` 98.85 % statements (most branches run but are not held, below),
  `ActiveWaypoint.ts` 96.62 %, `Flightplan.ts` 86.48 %, `ModeController.ts` 61.7 %, `RollSteeringController.ts`
  87.77 %, `FlightplanUtils.ts` 72.22 %, `Flightplanloader.ts` 88 %, `KLNNavmath.ts` and `SignalOutputFilter.ts` 100 %.

## Research pass

Four read-only agents worked in isolated worktrees: A (nav math and the flight plan model), B (`ActiveWaypoint`
direct-to flows and LEG/OBS), C (`NavCalculator`), D (approach modes, the #100 pin, the XTK filter). They read the code
and the Pilot's Guide pages through the local page index, wrote draft tests, ran each against a one-line break of its
subject, saw it fail, and restored the tree. The reports and the drafts are in the session scratchpad
(`research-A.md` to `research-D.md`, `drafts-A/`, `research-B-drafts/`, `NavCalculatorC.test.ts`,
`waypointAlertTurn.test.ts`, `drafts-D/`). The plan carries the per-test setup, literals, citation and break; the
implementer confirms each by running it. The drafts are starting points, not finished tests.

Findings that shape the tests:

- **Most of `NavCalculator`'s branches are run but not held.** Each of these breaks leaves the whole current suite
  green: SET 6 ignored, the 36 s alert changed to 20 s, the 20 s alert changed to 15 s or 24 s, the fly-over flag
  ignored, all three MAP guards removed, the GPS-invalid branch removed, both 2 kt thresholds, the self-test DIS 34.5
  and XTK sign, the alert's turn-stack term, and `setFlag`'s alert and scale resets. The coverage number (98.85 %) hides
  this; the session log says so.
- **Render is enough for nearly everything.** A held position plus `moveAircraft` observes DTK, XTK, the alerts at
  independently computed distances, the sequencing cases, and both approach ramps (the 5-to-1 ramp is time-based, the
  1-to-0.3 ramp distance-based). One flight is needed: the waypoint alert staying on through a turn until its end
  (0.33 s wall).
- **`intermediatePoint` (#97) has no property that holds today except f = 0.** The permissive "computes the midpoint
  without throwing" sibling goes; the pin is split per fraction with a passing sibling that ties the expectation
  (`flight/geo.ts`) to the avform literals.
- **The XTK filter belongs in the unit stage**, at `SignalOutputFilter` with only `Date` faked, updates every 1000 ms
  and samples every 62 ms. A fix that extrapolates only while the measured rate keeps its sign turns the overshoot pin
  red and keeps the ramp characterization green, so the two rulings do not conflict.
- **The existing approach world (`ModeController.test.ts`, copied in `HEvents.test.ts`) cannot reach APR** (IAF = FAF,
  #129), and without a step-down fix past the FAF the "no re-activation past the FAF" test cannot fail. Hence the
  fixture of task 1.

## Trainer checks

The maintainer ran the KLN 89 trainer and the AVsoftech KLN 90B trainer in the VM; the session drove them. Results
(paraphrased; the 89 is the reference, the AVsoftech trainer an unreliable independent interpretation):

- **Abeam sequencing (KLN 89):** with turn anticipation on, a waypoint passed about 3.5 NM abeam at 240 kt was
  sequenced to the next leg. The code never sequences when the alert distance is not reached (more than about 1 NM
  abeam at 120 kt): a bug.
- **Direct-to target index (KLN 89):** after a direct-to an FPL 0 waypoint with legs behind it, inserting a waypoint in
  front of the target kept the direct-to on the target at its new index, with the cumulative distances of the later
  waypoints. The code turns it into a random direct-to: a bug.
- **#119 (KLN 89):** right after power-up DCT prefilled the active waypoint, both from the APT page (3-27 rule 3) and
  from NAV 1 (rule 4). The unit shows a blank page: a bug; the question issue is relabeled.
- **OBS to LEG on the FROM side (KLN 89):** the unit re-activated the plan leg (DTK of the leg, the 2 NM deviation kept,
  TO). The code makes a direct-to from the present position (deviation 0, DTK = bearing): a bug.
- **GPS APR cancel before the FAF (AVsoftech):** the press gave ARM, and APR was back within about 2 s, as in the code.
  Ruled intended for now; a `question` issue records it.
- **Approach scales (KLN 89):** not observable. ARM and ACTV show only on external annunciators the trainer does not
  draw, and ±5 NM stayed selectable while flying 9 NM from the FAF of a loaded approach, so the trainer never armed
  (likely its expired demo database).

## Maintainer's decisions

- Roll steering: pins only (the wrong-way bank, #100).
- XTK filter: the step overshoot is a bug (pin); the ramp tracking is a characterization.
- Abeam sequencing, the direct-to index shift, OBS to LEG on the FROM side and #119: bugs per the trainer.
- #82: pin it, drop the `CRSR` assertion from the #43 test in `DirectToPage.test.ts` (it freezes the state figure 4-42
  contradicts), and comment the headless reproduction on #82.
- APR cancel before the FAF: intended for now; a `question` issue with the findings.
- The four approach-scale cases (a late OBS-to-LEG switch jumps the scale instead of compressing the ramp, 6-11; a
  direct-to the FAF inside 2 NM is back in APR after one tick; a pilot-selected 0.3 becomes about 1.0 when APR
  activates; the scale exceeds 1 when the aircraft moves back beyond 2 NM in APR): one `question` issue, no tests.

## Task 1: the approach-world fixture (alone, before the others)

- **`approachWorld()`** in `test/harness/fixtures.ts`: research D's RNAV approach to `KPRC` (47.0 N, 8.0 E) from the
  north, final course 180: IAF `IAFAA` 10 NM and IF `IFAAA` 5 NM north of the FAF, FAF `FAFAA` 5 NM north of the MAP, a
  step-down fix `SDFAA` 2.5 NM north of the MAP, MAP `MAPAA` at the airport, an enroute fix `ENRAA` 60 NM north, plus a
  missed approach so that the MAP is not the last leg. Fresh objects on every call, idents that sort before the default
  navdata, every fix in the navdata (`bootUnit`'s procedure check). It returns the facilities and the named points the
  tests position by.
- **Harness test** `test/render/harness/approachWorld.test.ts`: `loadProcedure('APT 8')` loads it into FPL 0 with the
  expected legs and fix types, and a flight along the final course reaches APR at 2 NM (so the world can serve the APR
  tests); each case proven against a deliberately broken fixture.
- The existing copies (`ModeController.test.ts`, `HEvents.test.ts`, the arc worlds) stay; `testing.md` section 7
  keeps its "shared worlds" bullet updated.
- **Model:** Sonnet implementer, Sonnet reviewer.

## Tasks 2 to 5: the navigation core

Parallel, one implementer each in its own worktree, branched from the merged task 1 (rule 21). Placeholders for new
bugs are `#NEW-<task>-<n>` (rule 23).

### Task 2: nav math and the flight plan model (research A)

Files: `test/unit/services/KLNNavmath.test.ts` (replaced), `test/unit/data/flightplan/Flightplan.test.ts` (new),
`test/unit/services/FlightplanUtils.test.ts` (new), `test/unit/services/Flightplanloader.test.ts` (new),
`test/render/data/flightplan/FlightplanEdit.test.ts` (new), `test/render/data/flightplan/DuplicateWaypoints.test.ts`
(new).

- **KLNNavmath:** `intermediatePoint` pins per fraction (0.25, 0.5, 0.75, 1) and an on-segment pin, with a passing
  sibling tying `geo.ts` to the avform literals (#97); `bankeAngleForStandardTurn` against the physical standard-rate
  derivation (tolerance 0.15 degree, the 25 degree cap from about 169 kt); `distanceToAchieveBankAngleChange` as a
  characterization (the 5 degree per second rate has no source).
- **Flightplan:** insert and delete with one publish, the 31st leg refused (4-1, 4-4), batch insert publishing once
  (characterization of the API), `removeProcedures`/`removeProcedure` (6-5, 6-23), `load` without procedures and
  without touching the source (4-1, 4-4, 4-6), `loadInverted` (4-4), 26 plans indexed 0 to 25 (4-1).
- **FlightplanUtils:** `calcDistToDestination` with leg lengths laid out by `pointFrom` (4-11, 6-20; the MAP fence;
  a direct-to inside and outside the plan); `insertLegIntoFpl` on a full FPL 0 (the first leg makes room; `FPL FULL`
  when the first waypoint is on the active leg, C-1).
- **Flightplanloader:** the 30-leg cut, `WAYPOINT x DELETED` (B-4), exactly ten named then `OTHER WAYPOINTS DELETED`
  for more than ten (B-3; the order is a characterization).
- **FPL 0 page:** `FPL FULL` on the status line; the plan delete; the #67 gap (OBS on the second copy of a duplicated
  waypoint keeps index 3; `Nav OBS:1` set to 90 because an unset course hits #122).
- **Pins:** `#NEW-2-1` a waypoint typed over row 1 of a full FPL 0 lands before the last waypoint (unit and UI);
  `#NEW-2-2` an insert in front of an in-plan direct-to target makes it a random direct-to (trainer-confirmed; passing
  sibling in leg mode); `#NEW-2-3` DELETE FPL? is not saved (`Flightplan.delete()` does not publish).
- **Reviewer:** Sonnet.

### Task 3: ActiveWaypoint, LEG/OBS and direct-to in OBS (research B)

Files: `test/unit/data/flightplan/ActiveWaypoint.test.ts` (appended), `test/render/services/ModeControllerObs.test.ts`
(new), `test/render/pages/left/DirectToObs.test.ts` (new), `test/render/pages/left/DirectToPage.test.ts` (the #43
assertion only).

- **ActiveWaypoint (unit):** cancel re-finds the closest leg (characterization of the leg choice; the cancel is 3-29,
  4-11); a direct-to an FPL 0 waypoint skips the earlier ones and resumes (4-10); a random direct-to never resumes
  (4-10); the last leg; the MAP as destination (6-20); a direct-to clears the turn stack and saves `activeWaypoint`
  (characterization); an FPL edit re-activates by position (characterization).
- **LEG/OBS (render):** LEG to OBS keeps a 2 NM deviation (5-36); `NO ACTV WPT` (C-1); OBS to LEG on the TO side
  (5-36); the MAHP = FAF case works (6-11, 6-19 notes); the VOR's published variation in OBS (5-35);
  `OBS WPT > 200NM` (B-3); the external GPS CRS switch back to LEG (5-33).
- **Direct-to in OBS (render):** ACTIVATE keeps the OBS (5-37), a direct-to sets the OBS to the course and centres,
  `CRS xxx` with a non-driven indicator, a driven indicator gets `K:VOR1_SET` (5-37, C-1).
- **#82 and #43:** the `status().left === 'CRSR'` assertion of the #43 test is removed (its index assertion stays); the
  #82 pin (an ENT after the direct-to inserts nothing; 4-11, figure 4-42).
- **Pins:** `#NEW-3-1` LEG to OBS moves the deviation on a long leg (5-36); `#NEW-3-2` OBS to LEG activates the first
  copy of a duplicated waypoint (5-36); `#NEW-3-3` OBS to LEG at an IAF = FAF keeps the IAF copy (6-11); `#NEW-3-4`
  ACTIVATE in OBS recentres (5-37; the fix must also satisfy the #122 pin); `#NEW-3-5` OBS to LEG on the FROM side
  makes a direct-to instead of re-activating the plan leg (5-36, trainer-confirmed; replaces research B's
  characterization 3.5); #82; #119 (DCT after power-up prefills the active waypoint, 3-27 rules 3 and 4).
- **Reviewer:** Opus.

### Task 4: NavCalculator (research C)

Files: `test/render/data/navdata/NavCalculator.test.ts` (appended), `test/flight/flights/waypointAlertTurn.test.ts`
(new).

- **Render:** `FLY L`/`FLY R` and the NAV 1 bar (3-32, 3-31); DIS as a chord on an arc (6-18); the 36 s alert with
  SET 6 off (4-9) and for an off-plan direct-to with SET 6 on (3-29); the 20 s alert between independently derived
  bounds (4-8); no early DTK switch and FROM-flip sequencing without turn anticipation (4-9); fly-over (4-2, 4-3); the
  MAP with and without turn anticipation (6-7); the GPS-invalid path (NAV 1 `FLAG` and dashes, the HSI flag, the WPT
  light off; 3-31, 3-59); below 2 kt no ETE and no sequencing (characterization); the self-test DIS 34.5 and XTK (3-4,
  read late because of the filter overshoot).
- **Flight:** the waypoint alert stays on through the turn until it ends (4-8, 4-9 and the video the code cites; the
  maintainer's steady-light ruling), with the light read one calculation tick after the sequencing.
- **Pins:** `#NEW-4-1` a NAV flag (or no active waypoint) resets a selected CDI scale to 5 (5-38); `#NEW-4-2` the WPT
  light goes out at the sequencing onto the last leg while the turn is still flown (judged from the recording of the
  flight above); `#NEW-4-3` a waypoint passed more than about 1 NM abeam is never sequenced with turn anticipation on
  (trainer-confirmed; passing sibling with SET 6 off).
- **Reviewer:** Opus.

### Task 5: approach modes, the #100 pin and the XTK filter (research D)

Files: `test/render/services/ModeControllerApproach.test.ts` (new), `test/render/pages/left/Mod1Page.test.ts` (new),
`test/render/services/RollSteeringController.test.ts` (appended), `test/unit/services/SignalOutputFilter.test.ts`
(new).

- **Approach modes (render, on `approachWorld()`):** ENR stays ±5 beyond 30 NM; ARM at 30 NM and the 5-to-1 ramp over
  30 s (6-1, 6-3); the linear shape as a characterization; ARM by the switch at 40 NM keeps ±5 until 30 NM (6-1); the
  approach deleted returns to ENR ±5 (6-7); APR at 2 NM and the 1-to-0.3 ramp to the FAF, 0.3 to and past the MAP (6-3,
  6-7); the linear shape as a characterization; the GPS APR press past the FAF goes to ARM ±1 and stays (6-1, 6-3); a
  direct-to to the MAP goes to ARM ±1 (3-29); OBS in ACTV goes to ARM in OBS ±1 (6-3, 5-32). The press before the FAF:
  only the passing sibling (ARM ±1 at the press, 6-1); no pin (ruled intended).
- **MOD 1:** pin `#NEW-5-2` the CDI field shows `CDI:±NM` without a value in ARM beyond 30 NM (5-38); passing sibling in
  ENR. (Mod2Page has the same code; the issue names both.)
- **Roll steering:** pin #100, the wrong-way bank 5 NM left of the leg on a parallel track (`HeadingInput` true so that
  the pin survives the fix of #143); passing sibling holding the preconditions. No other roll steering test.
- **XTK filter (unit):** passing sibling; pin `#NEW-5-1` the output overshoots a step (the largest sample at most the
  target); characterization of the ramp tracking without lag, judged from 3 s on.
- **Reviewer:** Opus.

Each implementer gets the brief of Session 4: read `CLAUDE.md`, `docs/testing.md`, section 2 of
`docs/test-coverage.md`, this design and the plan's section for the task; reset the worktree to the session branch;
prove every test by breaking its subject and every pin by fixing the bug temporarily, and restore; one commit per task
plus one per fix round, never amending, with a `Proof: fails when …` line per test and a `Co-Authored-By` line naming
the model; placeholders `#NEW-<task>-<n>`; no edits to `docs/test-coverage.md`, no issues filed, no behavior change in
`kln90b/` (rule 12 seams only, named in the commit); run the full `npm test` before committing; write the report with
the Bash tool, and check that it exists. The break lists of the research and the plan stay out of the test comments.

**Models:** Sonnet implementers, re-dispatched on Opus if one stalls (rule 26). Reviewers as stated per task;
re-reviews after a fix round on Sonnet.

## Reviews and merging (rules 24 and 25)

- One reviewer per task in the task's worktree: spec compliance, then code quality, then its own mutation pass, never
  announced to the implementer. Every page citation is checked against the Pilot's Guide index.
- Findings go back to the same implementer; a scoped re-review follows each fix round.
- Merge order: task 1 first and alone, then 2, 4, 5, 3 (task 3 touches an existing render test of another session).
  `npm test` and `npx tsc --noEmit` after each merge.
- Junctions: before `git worktree remove`, the worktree's `node_modules` junction (if any) is removed with `rmdir`.

## Task 6: issues and close-out (rules 23 and 27)

1. **File** (search open and closed issues first; `bug` label unless stated): the bugs of tasks 2 to 5
   (`#NEW-2-1` to `#NEW-2-3`, `#NEW-3-1` to `#NEW-3-5`, `#NEW-4-1` to `#NEW-4-3`, `#NEW-5-1`, `#NEW-5-2`), citing the
   trainer where it confirmed the behavior; a `question` issue for the APR cancel before the FAF (the AVsoftech
   observation, 6-1, the AFMS); a `question` issue listing the four approach-scale cases. Check whether `Ctr1Page`'s
   missing catch on a full plan is reachable and file it if it is.
2. **Comment** on #82 (the headless reproduction and the #43 assertion removed); relabel #119 as a bug with the trainer
   result; comment on #100 that the wrong-way case is now pinned; comment on #122 that `#NEW-3-4` shares the early
   return.
3. Replace every `#NEW-` placeholder in one commit; `grep -r "#NEW-" test/` finds nothing.
4. `testing.md`: the approach-world fixture (section 3), the `USE? INVRT?` reader gap and the shared worlds (section 7),
   the filter's unit setup if it becomes a pattern.
5. Tick Session 5's checkbox and write the session log: done, rulings, trainer checks, bugs filed, fixes that could not
   be re-broken, what is not covered (rule 18; below), coverage at the start and the end.
6. Run `npm test`, `npx tsc --noEmit` and `npm run coverage`.

Then the final review of the whole session runs on the controlling session's model, and the maintainer is asked to
approve the merge into `master` and the deletion of the task branches and worktrees.

**Not covered, known now** (the log adds what the tasks find):

- Roll steering beyond the #100 pin (by decision); the arc bank adjustment (`adjustBankAngleForArc`, unused).
- The four approach-scale cases and the APR cancel before the FAF (question issues).
- Open questions for a later trainer check (#146, #147): the alert time for a direct-to an FPL 0 waypoint that has a following leg
  (the code anticipates the turn and alerts 20 s before it; 3-29 says 36 s without distinguishing); the alert in OBS
  mode (the code forces it off; 5-35 is silent).
- `CRS xxx` also shows with ObsSource 0 (5-37 gives it only for a non-driven indicator showing the unit); the
  published variation of an approach waypoint in OBS (5-35, only VORs are handled); the loader's message cap applies per
  plan; `FPL FULL` also shows for a full numbered plan (C-1 names only the active-leg case).
- The turn-circle geometry on a great-circle leg (only the arc case is held); the end-of-turn detection beyond the
  flight; the stale `lastDistanceToActive`/`lastDistanceToTurn` after an activation (no reproduction found).
- Numbered flight plans with legs on the FPL pages (the `USE? INVRT?` reader gap).
- `ActiveWaypoint`'s shared `CACHED_CIRCLE` aliases only across two instances, which the singletons rule out.

## Risks

- **Pins that share a root:** `#NEW-3-4` and #122 both sit on `setObs`'s early return; `#NEW-3-2`'s naive fix breaks the
  MAHP = FAF spec test and `#NEW-3-3`. The plan states the fix used to prove each pin.
- **Filter timing:** the self-test outputs are read late because the filter overshoot (`#NEW-5-1`) would otherwise make
  the XTK assertion depend on the tick phase.
- **Light reads at the sequencing tick:** the alert is computed for the old waypoint in the tick that sequences; the
  flight reads one calculation tick later.
- **Unset `Nav OBS:1`** makes `setObs` return early (#122): OBS tests set a non-zero course.
- **Shared files:** task 3 changes `DirectToPage.test.ts`; task 4 appends to `NavCalculator.test.ts`; task 2 and task 3
  both add to `test/render/data/flightplan/` and `test/unit/data/flightplan/` but in different files except
  `ActiveWaypoint.test.ts` (task 3 only). Task 3 merges last.
