# Session 3 design: regression tests, flight stage

Session 3 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27), the session's task list (section 3) and the triage table (section 5). This design adds what
the tasks need beyond those rules. Branch: `tests-session-3-flight`.

## Scope

- **In:** every open triage row with verdict *testable* and stage *flight*: #76, #41, #34, #19 (with #22), the flight
  half of #27, #67 (a), `014293d`, #70, #61, #63, #87, #29, #24, `6be164c` (part), `1236025` (part), `07c6e37`,
  `92fbba1` and #39. Also the pins for the suspected bugs the research pass found in these areas (below).
- **Out:** the *needs harness* rows (procedures, airspaces, the paused aircraft and the others Session H lists).
- **Coverage at the start**, on 2026-10-04: identical to the end of session 2 in section 4 of `test-coverage.md`.
  Tests and `tsc` were clean (206 passed, 18 expected failures).

## Stages: the cheapest stage wins (maintainer's decision)

A read-only research pass ran every row in a scratch copy of the repo, with draft tests and the original bugs put back
by hand. Each draft test failed under its break. Only five rows need motion. The others are re-verdicted to a cheaper
stage, with the reason recorded in the row (rule 9):

| stage  | rows | why not flight |
|--------|------|----------------|
| flight | #76, #19 + #27 (one setup), #29 (the TO to FROM flip), `6be164c` (the magnetic track) | — |
| render | #67 (a), `014293d`, #70, #39, #24, #87, #61, #63, `6be164c` (MAGVAR), `1236025`, `07c6e37`, `92fbba1`, #29 (the 0 case) | the state is reached at rest, by panel input, by a teleport (`PLANE LATITUDE`) or by a direct call |
| unit   | #41, #34 | `ActiveWaypoint.activateFpl0` with a fake position is the whole subject |

Two flight versions are not possible today, and the render versions prove the same thing:
- `92fbba1`: `Aircraft.writeTo` writes `GPS DRIVES NAV1` true at 16 Hz.
- #61: `Flight.start` waits for a fix, but a cold unit has none.

**Labels.** Behavior whose source is the KLN 89 trainer (#76, #19, #27, the position independence of #34) is a spec
test that cites the trainer and the fix commit, as `CLAUDE.md` allows. #41 is a characterization (the manual is silent,
and the issue itself asks what is right). The era shift of #63 is a characterization (the Pilot's Guide does not mention
the rollover); its same-era control is a spec test (3-53). Public-contract rows cite their contract source
(`testing.md` section 5).

**Ruled by the maintainer:** on a long leg, a turn near 180° starts about 14 NM before the waypoint (r·tan(θ/2)). The real
unit does not cap this either, so it is not a bug and gets no pin.

## Task 1: harness (alone, before the batches)

The items that `testing.md` section 7 lists from session 2, plus a cold-GPS boot option (maintainer's decision):

1. **`Flight` restores `console.error`.** `Flight.start` registers `onTestFinished` to put back the original it wrapped.
   Without this, a file with several flights nests the wrappers.
2. **Exception-safe teardown.** Each teardown step in `test/harness/boot.ts` runs even if an earlier one threw. The
   first error is rethrown after all steps ran. The steps run through a small exported runner, so a unit test can prove
   the behavior without a failing test. Teardown also empties `FakeXhr.requests`.
3. **`settle(unit)`** in `test/harness/boot.ts`: advances the clock until the GPS is valid (with a cap that throws), then
   two seconds more, so that FPL 0 has activated and the display shows it. It replaces the `waitForGps` loops that tests
   copy. Existing tests keep their loops.
4. **`bootUnit({coldGps: true})`:** an engine-running boot whose GPS has no fix when `bootUnit` returns. It calls
   `props.sensors.in.gps.reset()` before returning, which is the workaround tests use today. It is independent of the
   `fastGpsAcquisition` setting.
5. **`storedSetting(unit, name)`** in `test/harness/storage.ts`: the parsed value stored under
   `persistent-setting.<ATC MODEL>.profile_1.<name>`, or `undefined` when the key is absent.
6. **`FrontPanel.type(side, text)`:** sends `KLN90B_Internal_Key:<LEFT|RIGHT>:<char>` per character, one display tick
   each, as the tests now hand-roll it.

Each item gets a harness test in the matching `harness/` folder, proven by disabling the item. The docs change in the
same task: `testing.md` sections 3 and 4 describe the helpers, and section 7 drops what this task did. Not included:
`restoreMocks: true`, because the existing tests restore their own spies.

**Model:** Sonnet. The reviewer is Sonnet.

## Tasks 2 to 5: the batches

Parallel, one implementer each in its own worktree, branched from the merged task 1 (rule 21).

| task | area | rows | suspected bugs to confirm and pin |
|------|------|------|-----------------------------------|
| 2 | sequencing and leg activation | #76 (flight), #19 with #22 and #27 (flight, one setup), #41 and #34 (unit) | A: the NaN-path early return in `NavCalculator.tick` skips `setOutput`, so the GPS outputs go stale while a zero-length leg is active. B: `findClosestLegIdx` never takes the perpendicular distance on a DME-arc leg. |
| 3 | OBS, direct-to and modes | #67 (a), `014293d`, #70 (render), #29 (flight, plus render for 0) | C: `ModeController.setObs` returns early when the course equals the stored `obsMag`, so OBS 000 keeps the leg path. D: `L:KLN90B_ObsSource` set to 0 at runtime leaves `sensors.in.obsMag` stale. |
| 4 | GPS state | #61, #63, #87, #24 (render) | E: `L:KLN90B_IntegrityWarn` and `L:KLN90B_GPS_WP_BEARING` are not written when `Output.WriteGPSSimVars` is off. |
| 5 | GPS SimVar outputs and scanning | `6be164c` (MAGVAR render, magnetic track flight), `1236025`, `07c6e37`, `92fbba1`, #39 (render) | none |

The plan carries the research result per row: setup, literals, citation and the break. The implementer confirms each by
running it, because the research ran in a scratch copy. Each suspected bug is checked first. A bug that reproduces gets
an `it.fails('… (#NEW-<task>-<n>)')` pin and an entry in the report; one that does not is reported as not reproduced.

Each batch implementer gets the following brief:
- **Read first:** `CLAUDE.md`, `docs/testing.md`, section 2 of `docs/test-coverage.md` and its rows in section 5, this
  design, and the plan's section for the task.
- **Per row:** confirm the setup, write the test at the stated stage in the folder mirroring the code under test with
  the issue or commit in the name, and put the original bug back by hand. See the test fail, restore, and check that
  `git diff` is clean. Then commit the row alone with the proof line (rule 22).
- **Flights:** one issue per flight, a named predicate in every `flyUntil`, and the two-test shape of
  `turnDirection.test.ts` where the judgment is a pin.
- **Not allowed:** editing `docs/test-coverage.md`, filing issues, changing behavior in `kln90b/` (rule 12 seams only,
  named in the commit), touching another batch's rows.
- **Report** to a file: one line per row (test path, spec or characterization, commit, any re-verdict and why), then
  the suspected bugs with reproduction, observed and expected values and file:line, then the worktree path and branch.
  The reply to the controlling session is only the status, the head commit and concerns.

**Model:** Sonnet. An implementer that stalls is replaced by Opus on the same worktree (rule 26).

## Reviews and merging (rules 24 and 25)

- One combined reviewer per task: spec compliance first, then code quality, with the mutation pass in the same seat
  and in the task's worktree. Mutations are the reviewer's own and never announced.
- Every page citation in the diff is checked against the Pilot's Guide index.
- Reviewer models: Opus for tasks 2 and 3 (navigation logic and the long flights), Sonnet for tasks 1, 4 and 5.
- Findings go back to the same implementer. A scoped re-review follows each fix round.
- The controlling session merges each approved task into the session branch and runs `npm test` and `npx tsc --noEmit`
  after each merge.

## Task 6: issues and close-out (rules 23 and 27)

1. File the confirmed bugs per `CLAUDE.md`, after searching open and closed issues, with the `bug` label. Replace every
   `#NEW-` placeholder in `test/` with its number in one commit.
2. File a **question** issue (no `bug` label, no pin): the self-test page builds its date and time editors without the
   read-only guard that SET 2 has, and since #61 the fast-mode GPS can be valid while the self-test page is up. 3-53 says
   the date and time cannot be changed while a satellite supplies them; what the real unit does on the self-test page
   is not known.
3. Tick the triage rows with their test paths and apply the stage re-verdicts with their reasons.
4. Tick session 3's checkbox and write the session log entry: done, re-verdicts, bugs filed, fixes that could not be
   re-broken, what was not covered (rule 18), coverage at the start and the end.
5. Update `testing.md` section 7 for anything the session found (for example the `GPS DRIVES NAV1` override in
   `Aircraft.writeTo` and the cold-start path missing in `Flight.start`).
6. Run `npm test`, `npx tsc --noEmit`, `npm run coverage` and `grep -r "#NEW-" test/`.

Then the final review of the whole session runs on the controlling session's model, and the maintainer is asked to
approve the merge into `master` and the deletion of the task branches and worktrees.

## Risks

- **Flight timing.** Assertions on seeded acquisition times or on the second a tick falls are fragile. The research
  marks which ones to avoid (the `Acquiring` state of #61, `isValid()` near the end of the turn-on page). Implementers
  assert bounds derived from physics or generous windows, never a measured second.
- **Breaks that the error monitor alone catches.** Several breaks throw (#27, #70). Each test also asserts a
  non-throwing symptom, so a later change that stops the throw but keeps the bug still fails it.
- **Merge conflicts.** The batches write to different files: task 2 to a new unit file and new flights, task 3 to
  `test/render/data/flightplan/ActiveWaypoint.test.ts` and the OBS files, tasks 4 and 5 to their own files. A conflict can
  only come from two tasks choosing the same new file name; the controlling session keeps both sides.
