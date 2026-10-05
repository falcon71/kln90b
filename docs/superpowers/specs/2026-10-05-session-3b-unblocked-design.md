# Session 3b design: regression tests for the rows Session H unblocked

Session 3b of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27), the session's goal and batches (section 3) and the triage table (section 5). This design
adds what the tasks need beyond those rules. Branch: `tests-session-3b-unblocked`.

## Scope

- **In:** every triage row that Session H turned from *needs harness* into *testable* (#15, #17, #18, #20, #21,
  `326da1a`, `633fdad`, `7fd640e` with `1ef2a35`, `80631c8`, #57, `133f4d8`, #50, `eef92e8`), the pause half of
  `43d472b`, #23, the #41 missed approach, the open bugs #90 and #102, and the `SidStar` flagged-repeat rule that
  Session H found unheld. Also the pins for the bugs the research pass found in these areas (below).
- **Out:** the SUA alert beyond its existing #127 pin (Session 7 item 3), and everything other sessions own.
- **Start state** on 2026-10-05: `npm test` 440 passed and 29 expected failures in 110 files, `npx tsc --noEmit` clean,
  coverage identical to the end of Session H.

## Research pass

Four read-only agents (navigation and procedures, nearest and airspaces, start-up and import, displays) worked in
isolated worktrees. They read each fix diff, ran draft tests on clean code, put the original bug back by hand, saw
each draft fail, and restored the tree. Every citation below was checked against the Pilot's Guide. A fifth agent
queried a real navigation database (AIRAC 2607) to settle whether consecutive DME arcs with different navaids or radii
occur (below). The plan carries the per-row setup, literals and break; the implementer confirms each by running it.

## Maintainer's decisions

- **#90 part 2 (APT 8 never removed):** no pin. File a question issue: 3-49 and the Installation Manual tie APT 8 to an
  approach-capable installation, which the panel.xml key `Input.ExternalSwitches.AppArmSwitchInstalled` describes and
  nothing reads. Removing APT 8 by default would change most aircraft configurations, so it needs research first.
- **Bugs to file and pin:** the co-located IAF/FAF that never switches to APR, `SidStar.hasDuplicates` comparing ICAOs
  by reference, the merged radius of `AF, CI, AF` (below), and the SET 3 label (below).
- **MOVE? on the FPL 0 page** (6-17 says it works from Super NAV 5 or FPL 0; only Super NAV 5 has it): a new issue with
  the `enhancement` label, no pin.
- **Consecutive DME arcs.** The research found that `SidStar` merges two consecutive AF legs without comparing navaid or
  radius. The maintainer doubted that real data has such pairs, and the database check confirmed it for legs that are
  adjacent in the data: no pair with a different navaid or radius, in SIDs, STARs or approaches, and none across the
  transition-to-final boundary. But five real STARs have `AF, CI, AF` on one navaid with two radii. `isLegSupported`
  drops the fixless CI leg before the duplicate filter runs, so the two arcs become adjacent and are merged with the
  second arc's radius; the first arc is flown about 3 NM off its published radius. That case is filed as a bug and
  pinned at unit stage. The sim's own representation of those CI legs was not checked; the issue says so.
- **#102:** the close-out adds a comment to the open issue with the APT 1 reproduction (below).
- **Harness:** a small harness task runs first (rule 13), because two helpers serve tests in three tasks.

## Verdicts per row

| row | stage | label | notes |
|-----|-------|-------|-------|
| #18 flown direction | flight | spec 6-16 to 6-18 | right arc and a left control; the predicate that bites is a distance band around the arc radius (under the break the aircraft spirals inward, it does not fly the arc backwards) |
| #18 drawn direction | render | spec 6-17 | NAV 5 canvas, `#` pixels per quarter around the centre; the full revert of `15d9b35` only moved the arrowhead, so the test holds today's one-line break (`circle.reverse()`) |
| `326da1a` | flight | spec 6-18, 4-8 | needs a tight geometry (5 NM radius, 180 kt); at 10 NM and 120 kt the break moves the turn start by about 0.06 NM, inside any honest tolerance |
| #21 | render | public contract | `GPS WP TRUE BEARING` is the DTK on an arc and the bearing to the waypoint on a great-circle leg; the second case is the unchanged half |
| `633fdad` | render | spec 6-3 (100° intercept activates); characterization (the 110° limit, 120° stays ARM) | the 110° choice is the maintainer's; no pin |
| #23 | render | spec 6-5 and B-3, plus the KLN 89 trainer and `3364def` | a STAR repeating the last en-route fix: `REDUNDANT WPTS`, sequencing through the repeat, no error |
| #41 missed approach | render | characterization, like the existing #41 tests | under the old rule the missed-approach leg back to the FAF/MAHP is activated |
| `1ef2a35`/`7fd640e` (a) arc ending at the IF | unit | spec 6-16, 6-17 | `SidStar.getKLNApproachLegList` with a hand-built approach |
| (b) left-hand entry ranges | unit | spec 6-16 | the `getArcEntryData` half of `1ef2a35` |
| (c) Super NAV 5 MOVE? state after ENT | render | spec 6-17 | a left arc, so that #104 (right-arc recalculation) does not interfere |
| (d) degenerate dashed segment, `endPoint` versus `endFacility` | — | not provable | ran: the canvas is identical with both guards removed |
| `SidStar` flagged-repeat rule | unit | spec 6-10, 6-11 | a co-located IAF and FAF stay two entries |
| #17 | render | characterization (pixel snapshot) plus no errors | the end fix 3 NM off the arc circle; the original exception needs the pre-#18 `Canvas.tsx`, so the two proofs are the one-line edit (pixels) and the two-file restore (the error) |
| #20 | — | not provable | no fix of its own; the symptom came from the sim autopilot, which the harness does not model; #21's render test holds the SimVar |
| #57 | render | spec 3-22, 3-23 (a heliport cannot meet the SET 3 runway criteria) | nearest list, nine slots with a nearer hidden heliport, Super NAV 5 labels (a `drawLabel` spy) |
| SET 3 criteria (same code as #57) | render | spec 3-22, 3-23 | minimum length and surface change the nearest list |
| `133f4d8` | render | spec 3-52 (OTH 2), 3-42 (APT 1) | a right triangle whose bounding box holds a point the triangle does not; the `OUTSIDE ARTCC` text is the unit's own (the page cites a video), so the outside case is commented as such |
| #102 `fill([])` array | — | not provable | the mutation changes no visible output |
| #15 | render | contract (EFB route sync), spec 5-20 (OTH 3 plan number) | the harness test `efb.test.ts` already fails under the main break; the new test adds the OTH 3 plan number and the repository entries |
| #50 | render | the fix commit | the harness test `bootFailure.test.ts` holds the `propsReady` catch; the new test holds the `init()` catch, which no test holds today |
| `80631c8` | render | spec 3-14, 3-49 | both APT 7 and APT 8, each failing under its own one-line break |
| `eef92e8` | render | width spec 6-8, string characterization | the harness test `superNav5.test.ts` already fails under the break; the new test adds the field width |
| `43d472b` pause half | render | spec 3-32 | the track is computed once and holds, with no NaN on NAV 3, in the track SimVars or in `console.error` |

Labels follow `testing.md` section 5: a characterization carries the word in its title and no manual citation; a
contract test cites its contract source.

## Pins (`it.fails`)

Each pin keeps its heavy setup in a passing sibling (`testing.md` section 5). A new bug's pin is named
`'… (#NEW-<task>-<n>)'` until the issues task replaces the placeholder.

- **#90 part 1:** an air-data-only unit (`Input.Airdata.IsInterfaced`, no fuel computer) keeps OTH 5 and OTH 6 after a
  power cycle (5-39, 5-42). Today the second `PageTreeController` splices the shared tree again and they vanish.
  Siblings: the same unit before the cycle, and the other three interface configurations after a cycle.
- **#102:** TRI 2 with a 5 NM restricted area 32 NM along a 40 NM leg; TRI 2 with the area at the leg midpoint (missed
  through the shared search session); TRI 4; TRI 6 (5-4 to 5-6). And the APT 1 airport type row (3-42), which depends on
  the airport shown before: a Class B area added for an airport inside it is shown for an airport outside it next, and
  the reverse order hides it. Siblings: an area containing the present position, and each airport in its own boot.
- **New bugs:**
    - a co-located IAF/FAF never switches ARM to APR 2 NM before the fix, because the IAF copy is the active waypoint and
      `ModeController` accepts only a FAF (6-3, 6-10); sibling: the IAF active and ARM;
    - `SidStar.hasDuplicates` compares ICAO structs by reference, so `REDUNDANT WPTS IN FPL` (6-5, B-3) is skipped when
      the loader returns a fresh object;
    - `AF, CI, AF` on one navaid with two radii is merged into one arc with the second radius;
    - SET 3 labels the hard-surface-only option `SFT`; 3-23 names the options `HRD SFT` and `HRD`.

## Task 1: harness (alone, before the batches)

1. **`FrontPanel.loadProcedure('APT 7' | 'APT 8', {ident?})`.** Selects the page on the right, enters the airport ident
   when one is given (the APT pages open on the first airport of the scan list), turns the cursor on, presses ENT on the
   first entry and ENT on LOAD IN FPL, turns the cursor off, and advances the clock until FPL 0 shows the loaded legs
   (the scroll happens at the next calculation tick).
2. **`moveAircraft(unit, point, {groundspeedKt})`** in `test/harness/`: sets `GROUND VELOCITY` and `PLANE LATITUDE`/
   `PLANE LONGITUDE` in one synchronous step, then advances one calculation tick, so that the GPS computes a track from
   the jump. Holding still afterwards is the paused sim (`Gps.ts` keeps the last track while the position holds).
3. **The Center frequency name.** `airspace()` gives the frequency a `name` (an option, defaulting to the airspace
   name), because OTH 2 reads it and throws without it.

Each helper gets a harness test in the matching `harness/` folder that fails when the helper is disabled, and a
paragraph in `testing.md` section 3 or 4. The existing tests are not moved onto the new helpers in this session.

**Model:** Sonnet. The reviewer is Sonnet.

## Tasks 2 to 6: the batches

Parallel, one implementer each in its own worktree, branched from the merged task 1 (rule 21).

| task | area | rows | pins |
|------|------|------|------|
| 2 | `SidStar` conversion (unit, `test/unit/data/navdata/SidStar.test.ts`) | arc ending at the IF, left-hand entry ranges, the flagged-repeat rule, a same-navaid arc merge (6-18, the intended merge) | `hasDuplicates` by reference; `AF, CI, AF` merged radius |
| 3 | approaches in FPL 0 (render) | #23 (new `test/render/data/navdata/NavCalculator.test.ts`), #41 missed approach (`test/render/data/flightplan/ActiveWaypoint.test.ts`), `633fdad` (`test/render/services/ModeController.test.ts`), the co-located IAF/FAF sequencing sibling | co-located IAF/FAF and APR |
| 4 | DME arcs flown and shown | #18 flown and `326da1a` (one flight file), #18 drawn and #17 (`test/render/pages/left/Nav5Page.test.ts`), #21 (`test/render/SensorsOutSimVars.test.ts`), MOVE? after ENT (Super NAV 5) | none |
| 5 | nearest lists and airspaces (render) | #57, the SET 3 criteria, `133f4d8` (OTH 2, APT 1) | SET 3 label; the #102 pins |
| 6 | start-up, import and displays (render) | #15 (`test/render/services/KlnEfbLoader.test.ts`), #50 (`test/render/KLN90BCore.startup.test.ts`), `80631c8`, `eef92e8`, the pause half of `43d472b` | #90 part 1 |

**Deviation from the batch list in `test-coverage.md`:** #17 moves from the displays batch to task 4, because it
shares the NAV 5 arc setup and `Nav5Page.test.ts` with #18 drawn; and the start-up and displays batches are one task,
because both are small.

Each implementer gets this brief:
- **Read first:** `CLAUDE.md`, `docs/testing.md`, section 2 of `docs/test-coverage.md` and the task's rows in section 5,
  this design, and the plan's section for the task. The research drafts in the scratchpad are starting points, not
  finished tests.
- **Per row:** confirm the setup, write the test at the stated stage in the folder mirroring the code under test with
  the issue or commit in the name, put the original bug back by hand, see the test fail, restore, and check that
  `git diff` is clean. A pin is proven by fixing the bug temporarily and seeing it turn red.
- **Flights:** one issue per flight, a named predicate in every `flyUntil`, expectations from `flight/geo.ts`.
- **Commit once per task**, plus once per fix round, never amending. The message has one `Proof: fails when …` line per
  row and a `Co-Authored-By` line naming the model.
- **Not allowed:** editing `docs/test-coverage.md`, filing issues, changing behavior in `kln90b/` (rule 12 seams only,
  named in the commit), touching another task's rows.
- **Report** to a file: per row the test path, spec or characterization, any re-verdict and why, and every suspected
  bug with a reproduction. The reply to the controlling session is only the status, the head commit and concerns.

**Models:** Sonnet implementers, re-dispatched on Opus if one stalls (rule 26). Reviewers: Opus for tasks 2, 3 and 4
(conversion logic, mode switching, flights), Sonnet for tasks 1, 5 and 6.

## Reviews and merging (rules 24 and 25)

- One combined reviewer per task: spec compliance, then code quality, with the mutation pass in the same seat and in
  the task's worktree. The mutations are the reviewer's own and never announced to the implementer.
- Every page citation in the diff is checked against the Pilot's Guide index.
- Findings go back to the same implementer; a scoped re-review follows each fix round.
- The controlling session merges each approved task into the session branch and runs `npm test` and
  `npx tsc --noEmit` after each merge.

## Task 7: issues and close-out (rules 23 and 27)

1. Search open and closed issues, then file with the `bug` label: the co-located IAF/FAF, `hasDuplicates`, the `AF, CI,
   AF` merged radius (with the five STARs as evidence and the unchecked sim representation), the SET 3 label. File the
   APT 8 question (no `bug` label) and the MOVE? enhancement (`enhancement` label). Add the APT 1 reproduction to #102 as
   a comment. Replace every `#NEW-` placeholder in one commit.
2. Tick the triage rows with their test paths; re-verdict #20, `7fd640e`(d) and the #102 `fill([])` array as not
   provable, with the reasons above; say in the #15, #50 and `eef92e8` rows which half the harness test holds.
3. Tick Session 3b's checkbox and write the session log: done, re-verdicts, bugs filed, fixes that could not be
   re-broken, what is not covered (rule 18), coverage at the start and the end. Not covered includes: the SUA alert's two
   polygon guards cover each other (a box-only mutation of either survives; Session 7 item 3); the stale track that
   `ModeController.checkSwitchAprArmToActive` reads at rest (not reproduced); the throw when the aircraft is exactly over
   an arc's VOR (only at zero distance, not practical); the no-op `nextDtk` change of `15d9b35`.
4. Update `testing.md` (sections 3, 4 and 7) for what the session found.
5. Run `npm test`, `npx tsc --noEmit`, `npm run coverage` and `grep -r "#NEW-" test/`.

Then the final review of the whole session runs on the controlling session's model, and the maintainer is asked to
approve the merge into `master` and the deletion of the task branches and worktrees.

## Risks

- **Tight geometry.** `326da1a` bites only with a 5 NM arc at 180 kt, and the #17 pixels only with the end fix 3 NM off
  the circle. The plan records why, so a later "simplification" of the setup does not quietly stop the test biting.
- **A held position with ground speed can sequence a leg** (the turn starts while the distance does not decrease). Render
  tests that move the aircraft keep it more than one turn-start time from the waypoint, or turn anticipation off.
- **Mid-arc activation is the open bug #121.** Arc tests boot on the arc at the entry, or load at a position where the
  arc leg is the closest.
- **#104** makes a right-arc entry name wrong after a recalculation, so the MOVE? test uses a left arc.
- **Merge conflicts.** The tasks write to different files except `testing.md`, which only task 1 and task 7 touch.
