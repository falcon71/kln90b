# Session 2 design: regression tests, unit and render stage

Session 2 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27), the session's task list (section 3) and the triage table (section 5). This design adds what
the tasks need beyond those rules. Branch: `tests-session-2-regressions`.

## Scope

- **In:** every triage row with verdict *testable* and stage *unit* or *render*. Also the unit or render half of the
  *flight + render* and *unit + render* rows (#27, #67 (b), #8, `d3228dd`). Also the #101 pin.
- **Out:** the flight halves (session 3), #102 (needs airspace boundaries) and #99 (session 8).
- **Coverage at the start**, on 2026-10-04: identical to the session 1 baseline in section 4 of `test-coverage.md`.
  No tests have been added since.

## Task 1: one unit per test (harness)

Today `bootUnit` throws on a second call in a file. After this task, every test may boot its own unit, and the unit is
torn down when the test ends.

**Teardown in place.** `bootUnit` registers `onTestFinished(teardown)`. Calling it outside a test (for example in
`beforeAll`) throws an error that says so. Teardown, in this order:

1. **Stops the old unit's timers**: `vi.clearAllTimers()`, then `vi.useRealTimers()`. The next `bootUnit` installs the
   fake clock again. Promises of the old unit that wait on a timer never resolve, which is harmless.
2. **Resets the fakes in place**, so that references held by the setup files and by `simEnv()` stay valid:
    - **`FakeSim.reset()`** clears values, writes, key events, unset reads, errors and game variables. It **keeps the
      registration table**, because SDK objects cache the ids from `SimVar.GetRegisteredId`. It also restarts the
      simulation clock.
    - `FakeStorage.reset()` clears the data.
    - `FakeCoherent.reset()` clears the calls and the replies.
    - The magnetic variation goes back to 0.
3. **Clears the singletons** through one harness module, `test/harness/singletons.ts`:
    - in the instrument: `KLNFacilityRepository.INSTANCE`, `KLN90BUserWaypointsSettings.INSTANCE`,
      `KLN90BUserFlightplansSettings.INSTANCE` and `KLN90BUserRemarkSettings.INSTANCE`;
    - in the SDK: `FlightPlanner.instances`, whose `"kln90b"` entry would otherwise give the next unit a planner bound
      to the old bus.

   The module reaches in with `as any`, and **throws if an expected static field is missing**, so a rename fails the
   harness instead of leaking state. Production code is unchanged.
4. **Blanks the DOM.** `bootUnit` already sets `document.body.innerHTML` on boot. Teardown empties it as well, so a
   leftover screen cannot be read.
5. **Releases the guard** that `bootUnit` keeps against two live units.

**Convenience.** `HeadlessUnit` gets `panel: FrontPanel`, built from `send` and `Screen.read`, so render tests drive
the knobs without constructing it. `Flight` keeps its own `panel` and may reuse this one.

**Harness test** (`test/render/harness/reboot.test.ts`). Two tests in one file:

- The first boots with a stored user waypoint and FPL 0, then changes the active waypoint.
- The second boots with empty storage. It asserts, with literals:
    - the repository is empty and FPL 0 has no legs;
    - `simEnv().sim.writes` holds only the second unit's writes, and the storage holds only the second unit's keys;
    - `FlightPlanner.getPlanner('kln90b', newBus)` is not the first unit's planner;
    - after advancing 5 s, a spy on a 1 Hz tickable of the first unit (kept from the first test) recorded no call.
- A third assertion calls the singleton reset with a missing field and expects it to throw.

The task proves each assertion holds by disabling the matching teardown step.

**Docs**, in the same task: the paragraph on isolation in `testing.md` section 3, the "One unit per test file" line in
section 6, and the entry in section 7. Also `architecture.md` Core 10 (the singletons paragraph) and rule 9 of
`test-coverage.md`, which still say one unit per file. `UserWaypointV2.test.ts` keeps its own bus. Unit tests that need
a fresh repository may call the singleton reset directly.

**Model:** Sonnet (rule 26). The design above leaves no open judgment. It runs alone, and tasks 2 to 6 branch from its
merged commit.

## Tasks 2 to 6: the batches

The row lists are in `test-coverage.md` section 3, session 2. Each batch implementer gets the following brief:

- **Read first:** `CLAUDE.md`, `docs/testing.md`, section 2 and section 5 (its rows) of `docs/test-coverage.md`, and
  this design.
- **Per row:**
    1. Confirm the reproduction against the code. The how / why column was written by reading the code and may be
       wrong.
    2. Write the test at the cheapest stage, in the folder mirroring the code under test, with the issue or commit in
       the test name. Render tests boot a unit in each `it` that needs one.
    3. Decide spec or characterization (`testing.md` section 5). A spec test cites the Pilot's Guide page or another
       allowed source. The page index is in Claude's local memory for this project (`pilots-guide-index.md`), never
       copied.
    4. Reintroduce the original bug by hand, see the test fail, restore, and check that `git diff` shows only the test.
    5. Commit the row alone (rule 22), with the proof line.
- **When a row cannot be done as written:** a new verdict with its reason in the report; a needs-harness row names the
  extension. A row whose bug is not fixed, or only half fixed, gets a pin `it.fails('… (#NEW-<task>-<n>)')` and a bug
  entry in the report (rule 23).
- **Test files:** `<Subject>.test.ts` in the mirrored folder. If two batches write the same new file, the controlling
  session keeps both sides when merging.
- **Not allowed:** editing `docs/test-coverage.md`, filing issues, changing behavior in `kln90b/` (rule 12 seams only,
  named in the commit), and touching another batch's rows.
- **Report:**
    - one line per row: the row, the test path, spec or characterization, the commit hash, and the verdict change if
      any;
    - then the suspected bugs, each with a reproduction, the observed and expected values, and the file and line;
    - then the worktree path and the branch name.

**Model:** Sonnet. An implementer that stalls, or whose fix rounds do not converge, is replaced by Opus on the same
worktree (rule 26).

## Reviews (rule 24)

The controlling session chooses each reviewer's model, Sonnet or Opus, by the complexity of the task (rule 26). Each
batch gets two reviewer subagents, in sequence, against `git log <session-branch>..<task-branch>` in the task's
worktree.

**The spec-compliance reviewer** checks the following:

- every assigned row has a commit, or a re-verdict with a reason;
- the test name carries the issue or commit;
- the stage and the folder are right;
- spec tests cite a page and characterization tests are labeled and cite none;
- no snapshot freezes a visible bug;
- the proof line is in the commit message;
- nothing outside the brief was touched.

**The code-quality reviewer** checks the following:

- assertion strength (rule 17), independently derived expectations, determinism, and no manual text or recorded
  navdata;
- **its own mutations** of the code under test, chosen by the reviewer and never announced. A surviving mutation is a
  finding. The reviewer restores the code and confirms a clean `git diff` before reporting.

Findings go to the same implementer through SendMessage, and both reviews run again until they pass. Task 1 gets the
same two reviews before the batches start.

## Task 7: issues and close-out (rules 23 and 27)

Inputs: the batch reports and the reviewers' findings that were classified as instrument bugs.

1. File the bugs per `CLAUDE.md`. Replace every `#NEW-` placeholder in `test/` with the issue number, one commit.
2. Tick the triage rows with their test paths, and apply the re-verdicts with their reasons.
3. Tick session 2's checkbox.
4. Write the session log entry with these parts:
    - what was done;
    - re-verdicts;
    - bugs filed;
    - fixes that could not be re-broken;
    - what was not covered;
    - coverage at the start and the end.
5. Run `npm test`, `npx tsc --noEmit`, `npm run coverage` and `grep -r "#NEW-" test/`.

Then the final review of the whole session runs on the controlling session's model, and the maintainer is asked to
approve the merge into `master` and the deletion of the task branches and worktrees.

## Risks

- **Leaked global state.** A singleton that task 1 does not know about would leak between boots in one file. The
  harness test catches the known ones. An unknown one shows up as a test that passes alone and fails in its file, which
  the reviewers are told to watch for.
- **Merge conflicts between batches.** These are limited to new test files of the same subject. Batches touch
  `kln90b/` only for named seams.
- **Fixes that cannot be re-broken.** An old fix may no longer reapply. The implementer reintroduces it by hand, and a
  fix that cannot be reintroduced is marked "not provable" with the reason (rule 11).
