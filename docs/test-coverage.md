# Test coverage baseline plan

**This document is temporary.** It plans the sessions that build the project's test baseline, and it is retired by the
last session, which moves the permanent findings into [testing.md](testing.md) and deletes this file. Everything that
must outlive the plan (conventions, harness documentation, limitations) belongs in `testing.md`, not here.

How to use it: tell a session "Run session N as described in docs/test-coverage.md". The session reads this whole
document, [CLAUDE.md](../CLAUDE.md), [testing.md](testing.md) and [architecture.md](architecture.md), then follows
section 3 for that session. When it finishes, it ticks the session's checkbox, adds a session log entry (section 4) and
commits. All paths are relative to the repo root.

# 1. Goal and philosophy

The harness is complete and documented; the test suite is not. The goal is a **healthy baseline** that lets later
implementation work change code with confidence, built in the order that buys the most protection per hour.

- **The coverage percentage is a diagnostic, not a goal.** Coverage shows what nobody has looked at. It is never a
  target to climb, because the cheapest way to climb it is a snapshot of every page in its default state, which proves
  nothing about the real unit. Each session runs coverage at its start to find gaps and at its end for the log, and
  that is all.
- **Protect the places where a regression hurts users first:** the public contract with aircraft, persisted user data,
  navigation and sequencing, and the fixes for bugs that have bitten before. Pages come last.
- **A spec test beats a characterization test.** See the convention in `testing.md` section 5. Both are allowed, but a
  characterization test is labeled so nobody later mistakes it for evidence of correctness.
- **Everything the suite cannot see is written down.** The point of the final record is that someone reading a green
  bar knows how much to trust it.

# 2. Rules for every session

These apply to all sessions below. The rules in `CLAUDE.md` and `testing.md` apply as well; where this document repeats
them it is for the convenience of the session, and `testing.md` is the authority.

**Session mechanics**

1. Start on a new git branch named after the session (`tests-session-N-<topic>`), before the first edit.
2. Treat each session as an architectural path of the brainstorming skill. Rules 19 to 27 describe how it is run.
3. Run `npm test` and `npx tsc --noEmit` first. Both must be clean before any new work starts. If they are not, stop and
   report; do not fix unrelated failures as part of the session.
4. Run the coverage report (`npm run coverage`, added by session 1) and read it for the session's area before writing
   tests.
5. Finish by running `npm test` and `npx tsc --noEmit` again, ticking the session's checkbox in section 3, adding a
   session log entry in section 4 (date, branch, what was done, what was left and why) and committing this document.

**What a test is allowed to assert**

6. **Spec tests** assert the real unit's behavior with the Pilot's Guide page (or another source named in `CLAUDE.md`)
   cited in a comment, and an expected value derived independently of the code under test. Prefer these.
7. **Characterization tests** pin what the code does today, such as a page snapshot. They are allowed where no spec is
   at hand, and they are labeled as `testing.md` section 5 describes. A characterization test never carries a manual
   citation, because it does not claim to match the manual.
8. **When the code and the manual disagree, the test asserts the manual**, is written as `it.fails('… (#NN)')` and the
   bug is filed per `CLAUDE.md`. Never assert a bug as correct, not even in a characterization test: if a snapshot
   contains a visible bug, exclude that row or pin the bug separately.
9. **Use the cheapest stage** that can observe the behavior (`testing.md` section 1). One headless unit per test.

**Proving a test holds**

10. Every new test is verified by breaking its subject on purpose (`testing.md` section 5). For a regression test the
    break is the original bug: reintroduce it in the working tree, by hand when the old commit's diff no longer applies,
    confirm the test fails, restore, and confirm `git diff` shows only the intended changes. Never commit the broken
    state. Record in the log any fix that could not be re-broken and why.
11. A regression test that cannot fail for its bug is not done. Either make it bite or mark the item "not provable" in
    the triage table with the reason.

**What a session may change**

12. **Do not change behavior.** Small changes for testability (a constructor parameter for a dependency, exposing a
    seam,
    making a private helper reachable) are fine; the commit message says what changed and why.
13. **Harness extensions are fine when they unblock several tests.** One test is not worth a large extension: list the
    extension under `testing.md` section 7 instead. Session H exists for the large ones.
14. Every bug spotted goes to GitHub per `CLAUDE.md`, with an `it.fails` pin where a test can observe it. Do not fix
    bugs during a test session.
15. Never commit manual text, tables or screens, and never commit navdata recorded from the sim. Facilities in tests are
    invented (`testing.md` section 5).

**Avoiding false security**

16. Do not write a test whose only purpose is to raise the coverage number. A test must either state a spec, pin the
    current behavior of something that could plausibly break, or guard a past bug.
17. Permissive assertions (`toBeDefined`, `length > 0`, `not.toThrow` alone) are not a test of anything but the absence
    of a crash. Use them only for the "every H event is accepted without an error" style of sweep, and say so in the
    test name.
18. The session log says what was **not** covered in the session's area, so the final record in session 11 can be
    written from the logs.

**Workflow**

A session follows the skills of the superpowers plugin: brainstorming, writing-plans and subagent-driven development.
The one deliberate difference is rule 21. The *controlling session* is the one the maintainer talks to; it dispatches
subagents, relays their results and merges, but it neither implements nor reviews.

19. **Design, then plan.** The controlling session settles open questions with the maintainer and writes the design to
    `docs/superpowers/specs/<date>-session-N-<topic>-design.md`. The writing-plans skill turns it into
    `docs/superpowers/plans/<date>-session-N-<topic>.md`. Both are committed on the session branch and are deleted
    together with this document in session 11.
    - Before the plan is written, a read-only research pass looks at every item. Against the code, it checks the fix
      diff, whether the reproduction holds, and how to re-break the fix. Against the Pilot's Guide page index, it checks
      every planned spec or characterization label and every page citation. A planned characterization whose
      behavior the manual contradicts becomes a pin (rule 8).
    - The plan carries the result per item: setup, literals, citation and break. The implementer still confirms it,
      because the research reads the code without running it.
20. **Tasks.** The plan splits the work into tasks:
    - a harness task first, when the session needs a harness extension;
    - then the main tasks, batched by area of the code and sized so that one implementer finishes its batch in one
      context;
    - then an issues task and a close-out task, which may be one task.
21. **Parallel implementers in worktrees.** The main tasks run in parallel, one implementer subagent each, every one in its
    own git worktree (`isolation: "worktree"`) branched from the session branch. A harness task runs alone before them,
    because they build on it. Subagent-driven development runs implementers one at a time to avoid conflicts. Separate
    worktrees remove those conflicts, so this workflow runs them in parallel.
22. **Implementers commit per item**, with the one-line proof of rule 10 in the commit message, ending with a
    `Co-Authored-By` line that names the model that wrote the commit. They do not edit this document and do not file
    issues. They write their report to a file and reply with only the status, the head commit and their concerns. The
    report lists, for each item:
    - the test path, and whether the test is a spec or a characterization test;
    - any change of verdict, with its reason;
    - every suspected bug, with a reproduction.
23. **Placeholder issue numbers.** A pin for a bug that has no issue yet is named `'… (#NEW-<task>-<n>)'`, for example
    `#NEW-3-1`. The issues task then:
    - files each bug per `CLAUDE.md`, searching open and closed issues first, so that a bug two tasks found becomes one
      issue;
    - replaces the placeholders with the real numbers.

    The close-out then confirms that `grep -r "#NEW-" test/` finds nothing.
24. **One review per task, by a subagent.** When a task reports done, the controlling session dispatches one task
    reviewer against that task's commits. It returns two verdicts in order, spec compliance first and then code quality,
    and it runs the mutation pass in the same seat.
    - The mutation pass verifies the tests by mutation, in the task's worktree. It follows the mutation rules in the
      maintainer's global instructions: the mutations are never named to the implementer, a surviving mutation is a
      finding, and the reviewer restores the code and checks that `git diff` is clean.
    - The reviewer checks every page citation in the diff against the Pilot's Guide page index. This is a required
      check, not an item it may leave unverified.
    - A breach of this document's test rules is an Important finding, not a Minor one, so it is fixed inside the task.
      That covers: a test with neither a citation nor a characterization label, a wrong citation, a permissive or
      no-op assertion, and a frozen bug (rules 6 to 8 and 17).
    - The reviewer writes its full report to a file and replies with only its verdicts and the Important findings.
    - Findings go back to the same implementer. After a fix round, a scoped re-review checks only what the round
      changed, and the round repeats until the review passes.
25. **Merging.** The controlling session merges an approved task branch into the session branch, then runs `npm test`
    and `npx tsc --noEmit` on the result. Task branches and worktrees are deleted only at the end, after the maintainer
    approves the session (`CLAUDE.md`, Git). Nothing is pushed.
26. **Models.** Implementers start on Sonnet, and a task whose implementer struggles is re-dispatched on Opus. The
    controlling session chooses the reviewer's model per task by its complexity, Sonnet or Opus (session 2 ran this
    way). The final review of the whole session runs on the controlling session's model.
27. **Close-out** is the last task. It does the following:
    - ticks the session's items from the implementers' reports (for sessions 2 and 3, the triage table rows);
    - runs rule 5;
    - writes the session log, including rule 18.

    After it, a final review of the whole session runs, and then the maintainer is asked to approve the merge.

# 3. The sessions

Sessions 1 to 3 build the regression tests, because a bug that has bitten before has a known reproduction, a known
expected value and a built-in proof (the test fails on the old bug). Sessions 4 to 10 build the base coverage in order
of value. Session 11 retires this document. Session H is optional and scheduled by the maintainer when the triage
shows that it pays off.

A session that was interrupted is rerun with the same number until its checkbox is ticked.

## Session 1: coverage tooling and regression triage

- [x] done

**Goal:** know what is untested and which past bugs can be turned into tests, before writing any.

1. Install `@vitest/coverage-v8` as a dev dependency, add `"coverage": "vitest run --coverage"` to `package.json`, add
   `coverage/` to `.gitignore`, and configure coverage in `vitest.config.mts` to include `kln90b/**` only. Add the
   command to `testing.md` section 2.
2. Run it and record the per-directory summary in the session log as a dated record.
3. Triage the closed GitHub issues (`gh issue list --state closed --limit 500` or the GitHub MCP tools; include
   `wontfix`-style closures only if they describe a behavior that is now implemented) and the fix commits in
   `git log --oneline` (those mentioning `fixes`, `Fixes`, `references` or a `#NN`). Write the triage table into
   section 5 of this document: one row per candidate, with issue or commit, a one-line description, the cheapest stage
   that can observe it, and a verdict:
    - **testable** (the harness can observe it today),
    - **needs harness: <what>** (names the extension; these feed Session H),
    - **not testable** (sim-only rendering, hardware, glow, CSS; say why),
    - **superseded** (the behavior was later changed again; name the later commit),
    - **no behavior** (refactor, docs, build).
4. Order the testable rows by user impact (navigation and persistence first, display last). Write no tests in this
   session.

**Done when:** coverage runs, the table in section 5 exists with a verdict on every row, and the log has the baseline
numbers.

## Session 2: regression tests, unit and render stage

- [x] done

**Goal:** a test for every triage row with verdict *testable* whose stage is unit or render, in impact order.

1. For each row: write the test in the folder mirroring the code under test, cite the issue in the test name
   (`'… (#NN)'`), and cite the manual page when the issue is about matching the real unit.
2. Prove it bites (rules 10 and 11). Record the proof in the commit message in one line ("fails when the sign flip in
   `UserWaypointLoaderV2` is restored").
3. Tick the row in the triage table with the test file's path.
4. Any issue that turns out not to be fixed, or only half fixed, gets an `it.fails` pin and a new GitHub issue
   referencing the closed one (as #98 did for #78). #101 is pinned here; #102 waits for airspace boundaries.
5. For a row whose stage is *flight + render* or *unit + render*, this session writes the unit or render half. The
   flight half is left to session 3.

**Tasks** (rules 19 to 27):

1. **Harness: one unit per test.** Teardown in place: `bootUnit` tears its unit down at the end of the test. Teardown
   does the following:
    - stops the fake timers;
    - resets `FakeSim`, keeping its registration ids, because SDK objects cache them;
    - resets `FakeStorage`, `FakeCoherent` and the magnetic variation;
    - clears the singletons, both the instrument's and the SDK's `FlightPlanner`, and fails loudly if one has been
      renamed;
    - blanks the DOM.

   A harness test proves that a second boot sees nothing of the first. The task also updates rule 9 and `testing.md`.
2. **Persistence and settings (unit):** #36, #78, #47 with the #101 pin, `f745fb3`, `1781156`, `1676e56`, `c673dc2`,
   `7b4465d`.
3. **Navdata and services logic (unit, with two render halves):** #6, #59, #14, #28, `9ce23bf`, #9, `6a6c634`, #42,
   `e1e75d0`, `d3228dd`, `9adbf97`, #4, #8.
4. **Direct-to and FPL 0 (render):** `0031c11`, #43, `43d472b`, #12, #49, #81, the render halves of #67 (b) and #27.
5. **CAL, ALT, SET, overlays and editors (render):** #31, #54, #33, `ee0b000`, #56, #64, #46, `fb671c0`, `2b9f811`,
   #25, #75, `10c5a3d`, `f347a2c`, `8e9a7c4`.
6. **Public contract and pages (render):** `955b535`, #51, #52, #53, #5, #65, #72, `f95d1d7`, `8045b29`, `9a17b5b`,
   #35, #38, #26, `8c3b2e0`, `b7fd10a`.
7. **Issues and close-out** (rules 23 and 27).

**Done when:** every *testable* unit or render row is ticked or has been moved to another verdict with a reason.

## Session 3: regression tests, flight stage

- [x] done

**Goal:** the same for the rows whose stage is flight: sequencing, direct-to, turn handling, mode changes, alerts.

1. Follow `turnDirection.test.ts` for the shape: one test flies and records, a second judges the recording when the
   judgment is a bug pin.
2. Derive expected values from `test/harness/flight/geo.ts` and the manual, never from the instrument (`testing.md`
   section 5).
3. Flights are expensive to read when they fail. Keep each flight to one issue, and name the predicate in `flyUntil`.
4. Prove each test bites (rule 11) and tick the row.

**Tasks** (rules 19 to 27):

- **The harness task comes first.** It takes the harness items that `testing.md` section 7 lists from session 2 before
  any flight test is written:
    - restoring `Flight`'s `console.error` wrapper at the end of each flight. This is required, because flight files
      now hold several flights.
    - a typing helper on `FrontPanel`, a settle and GPS helper, and a reader for stored settings;
    - an exception-safe teardown that also resets `FakeXhr.requests`.
- **The batches are smaller than in session 2:** three or four flight rows each. A flight is slower to run and harder
  to read when it fails.

**Done when:** every *testable* flight row is ticked or re-verdicted with a reason.

## Session H (optional): harness extensions

- [ ] done

Scheduled by the maintainer after session 1 if enough rows carry *needs harness*. Candidates, from `testing.md`
section 7:

1. Procedure builders for `MemoryFacilityClient` (SIDs, STARs, approaches), so `SidStar.ts` and approach arming can be
   tested.
2. Nearest-search filters in `MemoryFacilityClient` (airport surface and length, VOR class).
3. Airspace boundaries in the navdata, for the SUA alert and `AirspacesAlongRoute`.
4. A `FrontPanel.enterIdent` that blanks the positions past a short ident.
5. A power-cycle helper (`engineRunning: false`, `FrontPanel.power()`), for #90 and the cold-and-dark pages.

Found by the session 1 triage (section 5):

6. A route manager in `FakePlatform` that can emit a synced EFB route, for #15 and `KlnEfbLoader` in Session 6.
7. A boot-failure helper: a boot that awaits the `error` event instead of `propsReady`, for #50.
8. A reader for the Super NAV 5 `<pre>` blocks, for `eef92e8`.
9. A paused aircraft (position frozen, ground speed kept), for the pause half of `43d472b`.

Each extension comes with its own harness test (`test/*/harness/`) and a paragraph in `testing.md` section 3. After
this session, the *needs harness* rows it unblocked become *testable* and are picked up by a rerun of session 2 or 3.

## Session 4: the public contract

- [ ] done

**Goal:** the interfaces `CLAUDE.md` says must never break, so a change that breaks an aircraft fails a test.

1. **H events** (`kln90b/HEvents.ts`): a sweep that sends every public event to a booted unit and asserts no error was
   published and no `console.error` occurred (rule 17 applies; name it a sweep). Then spec tests for the events with an
   observable effect on the screen or state: knobs, CLR, ENT, DCT, MSG, ALT, SCAN, power, brightness.
2. **LVars** (`kln90b/LVars.ts`): read-only outputs are written with the right value for a known state (roll command,
   annunciators, integrity warning); writable overrides change the behavior they document.
3. **panel.xml keys** (`settings/KLN90BPlaneSettings.ts`): parse `cfg/panel.xml`, the documented sample, and assert
   every key lands in the right setting with the right type; parse an empty document and assert the defaults; parse an
   invalid value and assert the fallback.
4. **GPS SimVars** (`SensorsOut` in `Sensors.ts`, `WTFlightplanSync`): with `WriteGPSSimVars` set, a short flight writes
   the documented SimVars with values matching the independent geometry. With it unset, nothing is written.
5. **Persisted user data**: round trips through `UserWaypointPersistor` and `UserFlightplanPersistor`, loading of
   hand-written V1 and V2 literal strings for waypoints and flight plans (`UserWaypointLoaderV1`,
   `UserFlightplanLoaderV1`, `UserFlightplanLoaderV2`), the V1 to V2 conversion (#47), remarks
   (`KLN90BUserRemarkSettings`, `RemarksManager`) and the user settings defaults and key names
   (`KLN90BUserSettings`, saved under `"<ATC MODEL>.profile_1"`). The expected strings are literals laid out from the
   format, as `UserWaypointV2.test.ts` does.

**Done when:** each of the five items has tests at the cheapest stage, and the log lists any key, event or LVar left
without a test.

## Session 5: navigation core

- [ ] done

**Goal:** the project's own navigation model, which is deliberately not the SDK's.

1. **`KLNNavmath`**: extend the existing tests to every exported function with textbook-derived expectations.
2. **Flight plan model** (`data/flightplan/`): the bounds (plan count, legs per plan), insert, delete, and the duplicate
   waypoint cases of #67, `ActiveWaypoint` and its turn stack, `FlightplanUtils`, `Flightplanloader`.
3. **`NavCalculator`**: DTK and XTK for a known leg, sequencing at closest approach (4-8), turn anticipation and the
   large-turn case of #76, the waypoint alert with and without turn anticipation, and the `GPS`-invalid path. Flight
   stage, following the proof flight.
4. **`ModeController`**: LEG to OBS and back, the OBS synthetic waypoint, ENR to ARM to APR scaling (as far as the
   harness allows without procedures; the rest is listed), and the direct-to flows of #43, #68 and #70.
5. **`RollSteeringController`** and the XTK output filter (`SignalOutputFilter`, `SignalOutputFillterTick`): the roll
   command for a known XTK and track error, and the filter's step response at the test clock's 62 ms rate
   (`testing.md` section 6 notes the rate).

**Done when:** each item has spec tests, and the log says which behaviors wait for Session H.

## Session 6: data and pure services

- [ ] done

**Goal:** the pure logic under `kln90b/data/` and `kln90b/services/` that unit tests cover cheaply.

1. **Formats and conversions:** `Conversions`, `Units`, `Time`, `Text` (the character set and the null-to-dashes rule),
   `Sun` (sunrise and sunset against a published almanac value for a known date and place), `Wind`, `CountryMap`,
   `FirMap`.
2. **Identifiers:** `IcaoBuilder`, `IcaoFixedLength`, `UniqueIdentGenerator` (user region `XX`, temporary region
   `XY`).
3. **Messages:** `MessageHandler` and `PersistentMessages` (a condition posts, clears and does not repeat), the MSG
   page entries listed in the Pilot's Guide that the harness can trigger.
4. **Services:** `Timers`, `TimezoneService`, `Vnav`, `MSA` (reads the grid through `FakeXhr`), `AltAlert`,
   `HtAboveAirportAlert`, `TemporaryWaypointDeleter`, `KlnEfbLoader` and `KlnEfbSaver` (route in, route out, through
   the `FakePlatform` route manager), `AudioGenerator` (what it asks the sim to play, not the sound).
5. **`VolatileMemory`**: what survives a page change and what a power cycle clears.

**Done when:** every module above has a test file or a line in the log saying why not.

## Session 7: navdata and fragile code

- [ ] done

**Goal:** the places the architecture notes call fragile, and the navdata layer every page depends on.

1. **`KLNFacilityLoader`**: merging the user repository with the sim database, a user waypoint shadowing a database
   ident, searches that hit both. **`KLNFacilityRepository`**: add, delete, persistence callbacks, the user and
   temporary regions.
2. **`NearestList`, `NearestUtils`, `Scanlist`**: ordering, the update interval, the #39 case (selected waypoint drops
   out of the nearest list), the heliport filter of #57 (needs the nearest filters from Session H; otherwise list it).
3. **`Database`**, `KLNMagvar`, `BoundaryUtils` (geometry against hand-computed cases), `AirspaceAlert` (as far as the
   harness allows without airspaces).
4. **`Gps.ts`**: acquisition time from cold and warm, almanac validity, the GPS week rollover (#63), the start of
   acquisition at power-on (#61). These reach into SDK internals, so a failing test after an SDK upgrade is the
   purpose.
5. **`PageTreeController`**: every slot in both trees is a distinct class (an `instanceof` collision is a bug), the
   outer and inner knob reach every page from every page, and the page name is exactly five characters.
6. **`CursorController`**: field discovery order follows declaration order, read-only fields are skipped, the cursor
   wraps as the manual describes.
7. **`SidStar`**: only with Session H; otherwise a unit test of the RNAV filter (#59) on a hand-built procedure object
   if the type allows, and a log entry.

**Done when:** each item has a test or a log line, and any fragile spot found during the session that is not in this
list is added to `testing.md` section 6 or 7.

## Session 8: pages, left side

- [ ] done

**Goal:** a render test per page under `kln90b/pages/left/` in a representative state, plus spec assertions where the
Pilot's Guide specifies the content.

1. One `describe` per page. The first test is a labeled characterization snapshot of the page in a representative state
   (a booted unit with a small world and, where the page needs it, a saved flight plan from `savedFlightplan`).
2. Add spec tests where the manual gives the rule: formats of distance, bearing, time and coordinates (#99 is pinned
   here if not already), the fields the cursor visits, what an editor accepts (the altitude editor cases of #54 and
   #55), and the status-line messages the page can raise.
3. Super NAV 5 cannot be read by `Screen` (`testing.md` section 6): snapshot its canvas with `canvasToAscii` and test
   its `<pre>` blocks by DOM text, or list it.
4. Work in tree order (NAV, FPL, SET, OTH, TRI, CAL, STA, MOD, then ALT, DIRECT TO and DUPLICATE). Stop when the
   context is spent; the log says where.

**Done when:** every left page has at least its characterization test and the log lists the pages without a spec test.

## Session 9: pages, right side, and controls

- [ ] done

**Goal:** the same for `kln90b/pages/right/`, then the shared controls.

1. Pages as in session 8: APT 1 to 8 (APT 3 has list, map and user variants), VOR, NDB, INT, SUP, REF, ACT, D/T 1 to 4
   (FPL and other variants), CTR, waypoint confirmation and the generic waypoint page. Pages that show procedures wait
   for Session H and are listed.
2. Controls (`kln90b/controls/`, `displays/`, `editors/`, `selects/`): a render test per editor and select type driving
   it with the knobs through the front panel, asserting the committed value. `List` and `FlightplanList` scrolling
   (#40), `WaypointDeleteListItem`, `StatusLine` messages, `Blink` and `Inverted` masks, `MessagePage`, `ErrorPage`
   showing a thrown error.

**Done when:** every right page has its characterization test, every editor and select type has a test, and the log
lists the gaps.

## Session 10: boot, power and the unit as a whole

- [ ] done

**Goal:** the lifecycle the sim exercises on every flight.

1. **Cold and dark boot** (`engineRunning: false`): the welcome page, the self-test pages and their values, the
   transition to ready, the power-on message sequence (`testing.md` section 6 describes what posts).
2. **Power cycle**: what `VolatileMemory` clears, what settings persist, the OTH page pruning of #90 (needs the power
   helper; Session H item 5).
3. **`TickController`**: the display runs at 4 Hz with blink every fourth tick, calculations at 1 Hz in order, nothing
   runs while powered off or hot-swap disabled (`Hardware.ts`).
4. **Overlay pages**: MSG, Super NAV 1, SET 0, the error page; pushing and popping, and the KLN 89 trainer rule that an
   unhandled knob pops the page (#56).
5. **Startup robustness**: events before initialization are ignored (the Dukes fix), an error during startup lands on
   the error page (#50), `BrightnessManager`, `KeyboardService` (#75), `SimVarSync`, `PowerButton`.
6. **`KLN90BCore.init`** with the sample `cfg/panel.xml` and with a minimal one: the services bag is complete, and no
   error is published.

**Done when:** each item has a test or a log line.

## Session 11: closing record and retirement

- [ ] done

**Goal:** leave `testing.md` as the single source of truth and remove this document.

1. Run the coverage report and `npm test`. Both are inputs, not targets.
2. Write a dated record into `testing.md` (a new section "Coverage record" before "Next steps") stating, per area of
   the source tree: covered by spec tests, covered by characterization only, untested and why. Use the session logs in
   section 4. Include the coverage summary as a dated record. No counts in prose except in that dated record.
3. Move every open *needs harness* and *not testable* row's substance into `testing.md` section 6 or 7 as a limitation
   or a next step, without the issue-by-issue table.
4. Make sure every `it.fails` pin references an open GitHub issue, and every bug found during the sessions has one.
5. Remove the pointer to this document from `testing.md` section 7, delete `docs/test-coverage.md`, and commit with a
   message that says the baseline plan is complete.

**Done when:** this file no longer exists and `testing.md` carries the record.

# 4. Session log

One entry per session run, newest first. Format: date, session, branch, what was done, what was left and why, the
coverage summary for the session's area at start and end. This is a dated record and is never edited afterwards; a
later run adds a new entry.

## 2026-10-04, session 3, branch `tests-session-3-flight`

**Done**
- **Harness task** (alone, first): `Flight` restores its `console.error` wrapper at the end of each flight; the teardown
  runs every step even when an earlier one threw and also empties `FakeXhr.requests`; `settle(unit)` waits for a fix and
  for FPL 0 to activate; `bootUnit({coldGps: true})` boots an engine-running unit without a fix; `storedSetting`
  reads a stored setting; `FrontPanel.type` types text. Each has a harness test that fails when it is disabled. The
  plan's list plus the cold-GPS option was the maintainer's decision.
- **Four batches**, in parallel worktrees branched after the harness task, each with a report and a combined review:
  sequencing and leg activation (#76, #41, #34, #19 with #22, the flight half of #27), OBS, direct-to and modes (#67 (a),
  `014293d`, #70, #29), GPS state (#61, #63, #87, #24) and SimVar outputs and scanning (`6be164c`, `1236025`,
  `07c6e37`, `92fbba1`, #39). All 18 session 3 rows are ticked in section 5 with their test paths. Every test was proven
  to bite by reintroducing its bug in the working tree.
- **Close-out:** the issues below, the placeholders replaced, `testing.md` sections 6 and 7 extended.

**Re-verdicts and rulings**
- **Rows go to their cheapest stage** (maintainer's decision, rule 9). Only the rows that need motion stay flight: #76,
  #19 with #27, the TO to FROM flip of #29, and the magnetic track of `6be164c`. #41 and #34 went to unit
  (`ActiveWaypoint.activateFpl0` with a fake position is the whole subject). #67 (a), `014293d`, #70, #39, #24, #87,
  #61, #63, the other half of `6be164c`, `1236025` and `07c6e37` went to render: the state is reached at rest, by panel
  input, by a teleport (`PLANE LATITUDE`) or by a direct call. Each reason is in its row.
- Two flight versions are not possible today, and the render versions prove the same thing: `92fbba1` (`Aircraft.writeTo`
  forces `GPS DRIVES NAV1` true every step) and #61 (`Flight.start` cannot start a cold unit).
- **Turn anticipation near 180° on a long leg starts about 14 NM early** (r tan(θ/2)). The real unit is uncapped too,
  so the maintainer ruled that it is not a bug. No issue, no pin.
- #41 is a characterization (the manual is silent); the trainer-sourced behavior (#76, #19, #27, #34) is a spec test
  citing the trainer and the fix commit; the era shift of #63 is a characterization and its same-era control a spec test
  (3-53).
- Review fix rounds: each task needed one, except task 5. Examples: the #63 epoch was pinned from one side only (a
  second boundary test was added), and the #76 test missed the XTK kick and the turn stack (now sampled).

**Bugs found and filed** (each pinned with `it.fails`):
- **#120:** the NaN-path early return in `NavCalculator.tick` skips `setOutput()`, so a zero-length last leg leaves all
  GPS outputs unwritten (continues #19 and #67).
- **#121:** `ActiveWaypoint.findClosestLegIdx` never uses the perpendicular distance on a DME-arc leg (continues #41).
- **#122:** `ModeController.setObs` returns when the course equals the stored `obsMag`, so OBS 000 keeps the leg path
  (5-36).
- **#123:** `L:KLN90B_ObsSource` switched to 0 at runtime leaves `sensors.in.obsMag` stale.
- **#124:** `L:KLN90B_IntegrityWarn` and `L:KLN90B_GPS_WP_BEARING` are not written when `Output.WriteGPSSimVars` is off
  (public contract); two pins, one per LVar.

**The question filed** (no `bug` label, no pin):
- **#125:** `SelfTestRightPage` builds its date and time editors without the read-only guard for a valid GPS that
  `Set2Page` has. Since #61 the fast-mode GPS can be valid while the self-test page is up. 3-53 says date and time
  cannot be changed while the satellite supplies them; what the real unit does on the self-test page is not known.

**Fixes that could not be re-broken**
- The `fac === undefined` guard of #39 (`WaypointPage.tsx:218`, `d202f4a`) survives every mutation at render stage when it
  is removed alone. Since `c2e7b8e` keeps the scan out of the nearest-list branch that can produce `undefined`, the
  guard is a second line of defense that no render test can reach. The scan fix itself (`facility.index > -1` at
  `WaypointPage.tsx:144` and `:177`) is held: removing it fails the ident, the coordinate rows and, scanning left,
  the `console.error` spy.
- Two assertions are not independent of their neighbors, and say so: the second check of the #63 rollover test fails
  together with the first when only `Gps.ts:192` is reverted (the valid-state tick runs in the same calculation
  tick), and the `unit.errors` assertion of the #67 (a) test stays empty under the break, so it is only a secondary
  assertion.

**Not covered**
- #23 (a STAR with a repeated fix) and the DME-arc half of #19 (`326da1a`) need procedure builders. The missed-approach
  scenario of #41 does too.
- The flight versions of `92fbba1` and #61 (see the re-verdicts).
- The neighbor mutations that survived review and are listed in the ledger as deferred: the ident-versus-coordinates
  guard of #27 (#22 with the default anticipation would catch it); the to/from else-branch at
  `ActiveWaypoint.ts:302` for an aircraft before A; the xtk bound of #67 (a), a characterized value inside a spec test;
  the planner `directToData` not asserted cleared (`WTFlightplanSync.ts:161`); the TO/FROM abeam boundary
  (<=90 versus <=135) unprobed; the 4-10 test not asserting that the plan resumed; the future-era `Math.abs` of
  `Gps.ts:291`; `setGpsOverriden` only with a fix (`NavCalculator.ts:306`); the `WriteGPSSimVars` gate in
  `SimVarSync.setDisabled`; the hard-coded clock start in `Gps.test.ts`.
- Harness minors from task 1: the trailing second of `settle` is not held by a test, the `FrontPanel.type` test passes
  with the first character only (autocomplete), and the second `consoleRestore` test is vacuous when run alone.

**Observed but not filed**
- The #67 (a) plan `[KAAA, KAAA]` logs "invalid path, sequencing to the next waypoint" at the boot of that test. Render
  tests do not fail on `console` output; it is the #19 guard working.
- An unguided aircraft in a flight with a zero-length leg curves, because the unit has no DTK for it.
- In the render tests, `selectPage('L', 'MOD 2')` plus ENT enters OBS without the left cursor.
- `FlightPlanner.getPlanner(id, bus)` does not type-check against the SDK (a required third options argument); the
  tests pass `{} as FlightPlannerOptions`, which the SDK ignores for an existing planner.

**Workflow notes.** The isolation worktrees were created at the old master commit `d449d11` instead of the session
branch, and each implementer reset its worktree to the session branch before starting (the four merge bases were
verified to be the same commit). A worktree-isolated agent could not write to the shared `.superpowers` path, so its
report was written inside the worktree and copied. Two reviewers collided on a shared scratch script name: one
mutation of task 3 ran once in the task 2 worktree and was restored at once, and the task 2 reviewer re-ran its
mutations. One combined reviewer per task (Opus for tasks 2 and 3, Sonnet for the others) and a scoped re-review after
each fix round. Implementer commits carry the trailer of the model that wrote them.

**Coverage at the start of the session** (identical to the end of session 2) **and at the end** (all tests green):

| directory                  | % stmts start | % stmts end | % lines start | % lines end |
|----------------------------|--------------:|------------:|--------------:|------------:|
| all files                  |         57.49 |       59.49 |         57.27 |       59.33 |
| `kln90b`                   |         74.90 |       77.45 |         74.60 |       77.22 |
| `kln90b/controls`          |         60.77 |       65.01 |         60.27 |       64.60 |
| `kln90b/controls/displays` |         72.34 |       72.94 |         71.73 |       72.36 |
| `kln90b/controls/editors`  |         75.80 |       75.80 |         75.22 |       75.22 |
| `kln90b/controls/selects`  |         54.67 |       54.96 |         52.68 |       52.99 |
| `kln90b/data`              |         73.91 |       76.63 |         73.44 |       76.27 |
| `kln90b/data/flightplan`   |         88.10 |       89.18 |         88.20 |       89.32 |
| `kln90b/data/navdata`      |         68.42 |       69.94 |         68.39 |       69.89 |
| `kln90b/pages`             |         61.42 |       62.42 |         60.81 |       61.83 |
| `kln90b/pages/left`        |         46.26 |       49.48 |         46.27 |       49.53 |
| `kln90b/pages/right`       |         44.29 |       44.97 |         45.13 |       45.82 |
| `kln90b/services`          |         41.06 |       45.91 |         40.10 |       45.23 |
| `kln90b/settings`          |         87.39 |       87.67 |         87.16 |       87.46 |

The suite at the start: 206 tests passed and 18 expected failures. At the end: 264 tests passed and 24 expected failures
(the pins), in 87 files.

## 2026-10-04, session 2, branch `tests-session-2-regressions`

**Done**
- **Harness task:** one unit per test. `bootUnit` tears its unit down at the end of the test (fake timers, `FakeSim`
  with its registration ids, `FakeStorage`, `FakeCoherent`, magnetic variation, singletons, DOM), with harness tests
  that prove a second boot sees nothing of the first. `testing.md` and rule 9 were updated.
- **Five batches**, in parallel worktrees branched after the harness task, each with its own report:
  persistence and settings (8 rows), navdata and services (13 rows), direct-to and FPL 0 (8 rows), CAL, ALT, SET,
  overlays and editors (14 rows), public contract and pages (15 rows). All 58 rows are ticked in section 5 with their
  test paths, which includes the unit and render halves of the mixed rows (#8, `d3228dd`, #27, #67). Every test was
  proven to bite by reintroducing its bug in the working tree.
- **Close-out:** the issues below, the placeholders replaced, `testing.md` sections 2, 6 and 7 extended with the
  harness traps found, rules 24 and 26 reworded to how the session ran.

**Re-verdicts.** None: every row stayed *testable*. Rulings and surprises worth recording:
- `1781156` is ticked with a pin (#103) instead of a guard: it regressed in `933479d`.
- `f4f5395` (the `Math.abs`) was expected to be unprovable and is provable, with a track of 090 (the sign of the
  angle behind is rounding noise at that heading).
- #28: the characterization cases for the names from 27 NM were dropped (rule 8: the manual states another form,
  6-6); the test keeps a shape check, and the form from 6-6 is pinned as #107.
- #54: only the hundreds digit is reachable with the cursor, as the row already said.

**Bugs found and filed** (each pinned with `it.fails` unless noted):
- **#103:** user waypoints are written to storage again while they are restored; `ignoreSync` moved into the loaders
  in `933479d` and nothing reads it (a regression of `1781156`).
- **#104:** the entry of a right-hand DME arc is named `10709ABC` after a recalculation (continues #18).
- **#105:** the scan list starts at the raw first search result, which can differ from the first entry in list order
  with duplicate idents (continues `d3228dd`).
- **#106:** `BoundaryUtils.intersects` mistakes a path across the prime meridian for a date-line crossing, and
  `getIntersections` ignores the date line (continues #9).
- **#107:** DME arc entry names beyond 26 NM do not follow 6-6 (continues #28; the maintainer may close it as
  intended).
- **#108:** a scan during the first scan-list fill leaves a hole in the cache.
- **#109:** keyboard entry cannot type the longitude hundreds digit "0", the date or the runway surface (the rest of
  #25); only the longitude is pinned.
- **#110:** the UTC timezone name has 12 characters, so SET 2 overflows with the default timezone.
- **#111:** the message typo RECYLCE.
- **#112:** OKT instead of OCT in the month editor.
- **#113:** `HpaBaroFieldset.saveBaro10` calls the callback twice.
- **#114:** Power_Off during the fade-in is undone by the running `BrightnessManager.powerUp`.
- **#115:** the type letter of an NDB lands beyond column 11 on the ACT page. The wide APT 1 and VOR rows seen by
  tasks 4 and 6 are only trailing blanks of the nearest selector, so one issue covers it.
- **#116:** the V1 loader's unknown-surface error names the wrong character (pin added in the close-out).
- **#117:** the scan-list job ids are random below 10000 and can collide (found by reading, no pin).

**Fixes that could not be re-broken:** none. Two tests do not guard what their name might suggest, and say so: the
#12 CLR plus ENT case is titled "sanity check, does not guard #12", and the V2 round-trip assertions that hold nothing
once #103 is fixed now carry a comment pointing at it. The unit half of the `f745fb3`/`b14db79` row
(`UserWaypointV2.test.ts`) stays green when the original bug is put back; only the render half
(`Apt3UserPage.test.ts`) fails, so that is the half that guards the fix.

**Not covered**
- The flight halves: #67 (a), the flight half of #27, and every flight row (session 3).
- #102 (it waits for airspace boundaries) and #99 (a pin is planned for session 8).
- The `getArcEntryData` half of `1ef2a35` and the other procedure rows (they need procedure builders).
- Neighbors the reviewers noted: the other `cal*` settings, CAL 2 barometer propagation, the left-side keyboard
  advance, the hPa tens value and the other altitude digit savers, the `List` scroll-up branch, rules 4 and 5 of the
  direct-to suggestion (the active waypoint and the blank page), the V1 latitude between -1 and 0, the grass surface,
  the in-memory runway length of -10 in `Apt3UserPage`, the rounding of the APT 2 elevation, the self-test GPS WP
  bearing, the rounding in `getArcEntryName`, the ident-only comparison in `Vnav`, and the drawing paths of NAV 5 other
  than `drawFlightplanLine`.

**Observed but not filed**
- Exactly 0 degrees shows S and W in the latitude and longitude editors. No source says N and E, and the project uses
  the `> 0` convention consistently (`LatitudeDisplay.tsx:33` too). The pin was removed.
- DCT at boot with an active waypoint opens a blank DIR page, because the blank boot page SUP counts as a waypoint
  page in view. Rule 3 of 3-27 reads exactly that way, so the code follows the manual as written; what the real unit
  pre-fills for a blank waypoint page is not stated. Filed as the question #119.
- `fastGpsAcquisition: false` still boots with a valid GPS: an engine-running unit calls `acquireAndUseSatellites()`
  in `WelcomePage.tsx:146`. A harness trap, documented in `testing.md`.
- An error thrown on the ENT path is an unhandled rejection, because `MainPage` does not await `handleEnter` (the call
  carries a deliberate "ignored promise" comment). It never reaches the error page, which the architecture notes say
  input errors do. The test that pressed ENT stays green; Vitest reports the unhandled error afterwards, fails the run
  and names the last test that ran. Documented as a harness trap; filed as the question #118.
- `persistAllWaypoints` logs every slot, and `BoundaryUtils.intersects` tests the first edge again in its last
  iteration (`% (lod.length - 1)`); neither changes a result.
- NAV 5 with a duplicate waypoint: only the `drawFlightplanLine` guard of #8 is observable; the other guards are not
  reached by that flight plan.

**Workflow notes.** The harness task ran alone; tasks 2 to 6 ran in parallel worktrees on Sonnet, and the controlling
session merged each after its review. Each task had one combined reviewer (spec compliance, then code quality, with
the mutation pass in the same seat; the controlling session chose its model per task) and a scoped re-review after
each fix round. Tasks 1, 3 and 6 each needed one fix round. Implementer commits carry the trailer of the model that
wrote them. A fresh worktree has no gitignored `types/` directory, so `npx tsc --noEmit` fails there until it is
copied (`testing.md` section 2).

**Coverage at the start of the session** (identical to the session 1 baseline, since session 1 added no tests) **and
at the end** (all tests green):

| directory                  | % stmts start | % stmts end | % lines start | % lines end |
|----------------------------|--------------:|------------:|--------------:|------------:|
| all files                  |         34.22 |       57.49 |         33.76 |       57.27 |
| `kln90b`                   |         68.53 |       74.90 |         68.32 |       74.60 |
| `kln90b/controls`          |         44.33 |       60.77 |         43.82 |       60.27 |
| `kln90b/controls/displays` |         54.40 |       72.34 |         53.72 |       71.73 |
| `kln90b/controls/editors`  |         53.99 |       75.80 |         52.90 |       75.22 |
| `kln90b/controls/selects`  |         26.18 |       54.67 |         25.65 |       52.68 |
| `kln90b/data`              |         65.21 |       73.91 |         64.40 |       73.44 |
| `kln90b/data/flightplan`   |         68.64 |       88.10 |         68.53 |       88.20 |
| `kln90b/data/navdata`      |         49.28 |       68.42 |         49.29 |       68.39 |
| `kln90b/pages`             |         37.82 |       61.42 |         36.89 |       60.81 |
| `kln90b/pages/left`        |         14.35 |       46.26 |         14.27 |       46.27 |
| `kln90b/pages/right`       |          7.20 |       44.29 |          7.33 |       45.13 |
| `kln90b/services`          |         36.09 |       41.06 |         34.83 |       40.10 |
| `kln90b/settings`          |         73.63 |       87.39 |         72.83 |       87.16 |

The suite at the end: 205 tests passed and 19 expected failures (the pins), in 71 files.

## 2026-10-03, session 1, branch `tests-session-1-triage`

**Done**
- **Coverage tooling:** `@vitest/coverage-v8` 5.0.3, `npm run coverage`, `coverage/` ignored, coverage limited to
  `kln90b/**` with the text and HTML reporters. Documented in `testing.md` section 2.
- **Triage:** the table in section 5 covers all 79 closed issues and every bug-fix commit on `master`. Duplicates
  share a row. Verdicts: 74 testable (19 unit, 35 render, 16 flight, 4 mixed), 14 needs harness, 4 superseded,
  9 not testable, 5 no behavior. These count rows, not issues; several rows bundle issues or commits.
- **Needs harness:** 8 rows wait for procedure builders. One row each waits for the nearest-search filters, airspace
  boundaries, an EFB route manager, a boot-failure helper, a Super NAV 5 reader and a paused aircraft. The last four
  were added to the Session H list.
- **How the triage was done:** four parallel subagents drafted rows from the issues, their comments and the fix
  diffs. The session then checked every verdict and stage against the harness. Key-driven page bugs were moved from
  flight to render, because `FrontPanel` needs no flight.
- **Review:** a review agent spot-checked the table against the issues, the diffs and the code. It found bug-fix
  commits whose subjects lack the keywords. The session then read every remaining subject on `master` and added rows
  for those commits. The review also corrected the `43d472b` reproduction (the old code passed when the target was
  the active leg) and several stage choices and citations.

**Bugs found and filed** (no pins yet; session 2 pins them):
- **#101:** the #78 fix (`6677fae`) narrowed the V1 longitude slice to two digits, so the V1-to-V2 conversion of #47
  moves user waypoints at 100° or more by thousands of miles, and persists the result.
- **#102:** the polygon filter of `133f4d8` in `NearestUtils.getAirspaces` drops airspaces that a TRI 2/4/6 route
  crosses unless a search center lies inside them. The same issue records the shared search session and the shared
  `fill([])` array in `AirspacesAlongRoute.ts`.

**Observed but not filed.** These are unverified or deliberate; session 7 should look at them:
- `BoundaryUtils` ignores circular airspaces (a TODO in the code). Since `133f4d8`, such an airspace can drop out of
  the nearest airspaces entirely. Needs real boundary data to confirm.
- `SidStar.getArcEntryName` can produce idents longer than five characters for navaid idents longer than three, or
  arcs of 200 NM or more.
- `ActiveWaypoint.assertToMatchesFplIdx` sets the FPL index to -1 without publishing `activeWaypointChanged`, so
  `WTFlightplanSync` may keep a stale index.
- `SensorsOut.reset` leaves the GPS SimVars at their last values while the unit is disabled (the `d3c5230`
  workaround; deliberate).

**Not covered in this session:** no tests were written (by design). Open issues were triaged only where a fix commit
references them (#68). The 1.x line on `fs2020` was not triaged beyond noting its backports.

**Coverage at the start of the session** (the first run; all tests green; the end is the same, since no tests were
added):

| directory                  | % stmts | % branch | % funcs | % lines |
|----------------------------|--------:|---------:|--------:|--------:|
| all files                  |   34.22 |    24.78 |   37.29 |   33.76 |
| `kln90b`                   |   68.53 |    46.36 |   76.19 |   68.32 |
| `kln90b/controls`          |   44.33 |    35.46 |   45.64 |   43.82 |
| `kln90b/controls/displays` |   54.40 |    40.42 |   58.66 |   53.72 |
| `kln90b/controls/editors`  |   53.99 |    37.01 |   57.93 |   52.90 |
| `kln90b/controls/selects`  |   26.18 |    16.40 |   31.75 |   25.65 |
| `kln90b/data`              |   65.21 |    39.28 |   65.06 |   64.40 |
| `kln90b/data/flightplan`   |   68.64 |    61.11 |   65.85 |   68.53 |
| `kln90b/data/navdata`      |   49.28 |    33.09 |   59.52 |   49.29 |
| `kln90b/pages`             |   37.82 |    26.72 |   45.35 |   36.89 |
| `kln90b/pages/left`        |   14.35 |    11.52 |   14.85 |   14.27 |
| `kln90b/pages/right`       |    7.20 |     5.97 |    8.00 |    7.33 |
| `kln90b/services`          |   36.09 |    22.04 |   57.01 |   34.83 |
| `kln90b/settings`          |   73.63 |    48.97 |   76.19 |   72.83 |

All 252 source files are in the report. 98 have code that no test runs, most of them pages: 39 in `pages/left` and 26
in `pages/right`. Two contain no statements at all.

# 5. Regression triage table

Filled by session 1, worked through by sessions 2 and 3. One row per candidate. Tick a row when its test is committed
and proven to bite, and add the test path. Change a verdict only with a reason in the row.

Sources: every closed issue, and every bug-fix commit on `master`. The commits were selected first by subject (fix,
references, an issue number) and then by reading every remaining subject on `master`. Features, releases, dependency
updates, docs and the test suite have no row. Duplicate issues and commits that share one fix share a row. Rows are grouped by verdict; the *testable* rows are in
order of user impact (navigation, persistence, the public contract, navdata logic, then pages and display). The
**how / why** column is the reproduction idea for *testable* rows and the reason for every other verdict. It was
written by reading the code, so session 2 or 3 confirms the reproduction before relying on it. `render` includes
key-driven page bugs: `FrontPanel` drives a booted unit without a flight.

| done | issue / commit | description | stage | verdict | how / why | test |
|------|----------------|-------------|-------|---------|-----------|------|
| x | #76 `e7cc3ca` (#71 duplicate) | A turn near 180° made the anticipation distance exceed the distance to the waypoint, and the HSI swung back and forth. Now the next leg is taken at once. | flight | testable | Three waypoints with a ~175° turn at the middle one: `activeIdent` advances once, and DTK switches once between the two leg courses from `geo.ts`. `turnDirection.test.ts` only flies 35° and pins #100. Done as a flight: a frozen aircraft does not reproduce it, so the flight stays. | `test/flight/flights/largeTurn.test.ts` |
| x | #41 `42099f3` | The "point between two points" check in `findClosestLegIdx` was wrong, so the wrong leg (even a missed-approach leg) was activated. | unit | testable | Dogleg FPL 0, aircraft abeam a later leg: the activated leg is the one at the true minimum distance (`geo.ts`). Activation runs at the first calculation tick, so a booted unit at a fixed position may be enough; try that before flying. Re-verdicted from flight to unit: `ActiveWaypoint.activateFpl0` with a fake position is the whole subject. The missed-approach scenario needs procedures and is not covered. | `test/unit/data/flightplan/ActiveWaypoint.test.ts` |
| x | #34 `2b06e54` | An FPL 0 with two or more waypoints flagged navigation when the aircraft was not abeam any leg. Now it always activates. | unit | testable | Setup as #41, aircraft far to the side and beyond the end: a leg is active and NAV is not flagged. Re-verdicted from flight to unit, as #41. | `test/unit/data/flightplan/ActiveWaypoint.test.ts` |
| x | #19 `3364def` (#22, #23 same fix) | Consecutive identical waypoints (also a REF waypoint on top of an FPL waypoint) gave a NaN path and threw when sequencing. | flight | testable | `savedFlightplan(0, [KAAA, ABC, ABC, KBBB])`, fly through ABC: no error, `activeIdent` ABC then KBBB, DTK finite. #22 variant: two facilities at the same coordinates. The DME-arc half (`326da1a`) is in a procedure-builder row. Done as a flight (#19 and #22 are one setup). The #23 variant (a STAR with a repeated fix) and the DME-arc half need procedures and are not covered. | `test/flight/flights/duplicateWaypoint.test.ts` |
| x | #27 `dbb01bf` | Duplicate waypoints: turn anticipation off, the label drawn once on the maps, the same DTK for both legs on DT 3 and OTH 3. | flight + render | testable | Flight as #19: the aircraft overflies ABC without an early turn. Render: DT 3 shows the same DTK on both legs. Session 2 did the render half; the flight half is left to session 3. Session 3 did the flight half, with the #19 setup. | `test/render/pages/right/Dt3Page.test.ts`, `test/flight/flights/duplicateWaypoint.test.ts` |
| x | #67 `3415417` | (a) The same waypoint twice plus OBS threw (null DTK). (b) A direct-to target deleted from FPL 0 re-activated a leg instead of staying a random direct-to. | render | testable | (a) `[KAAA, KAAA]`, OBS, fly: no error. (b) Direct-to a leg, delete it on FPL 0: still direct-to the same ident, no active FPL index. Session 2 did (b); the flight half (a) is left to session 3. Session 3 did (a) at render stage: OBS on `[KAAA, KAAA]` is reached at rest, so no flight is needed. | `test/render/data/flightplan/ActiveWaypoint.test.ts` |
| x | `0031c11`, `d8edd70` | Deleting waypoints from FPL 0 until fewer than two remain did not flag navigation, and left the FROM waypoint set. | render | testable | FPL 0 with two waypoints, the first leg active, delete one: navigation flagged, no active or FROM waypoint. | `test/render/data/flightplan/ActiveWaypoint.test.ts` |
| x | `014293d` | `ModeController` must tick before `NavCalculator`, so a changed OBS course is used in the same calculation. | render | testable | OBS mode, change the course: DTK equals the new course after exactly one calculation tick, not two. The tick list is now built in `KLN90BCore`. Re-verdicted from flight to render: a changed OBS course is enough, one `advanceTimersByTimeAsync(1000)` is one calculation tick. | `test/render/services/ModeController.test.ts` |
| x | #70 `748151c` | Sequencing after a direct-to threw: `activeWaypointChanged` fired before the data was set, so `WTFlightplanSync` read stale state. | render | testable | FPL KAAA-ABC-KBBB, direct-to ABC, fly through it: no error, KBBB active, and the SDK planner `"kln90b"` has the matching active leg (the stale state showed there). Prove by reverting the event order. Re-verdicted from flight to render: the direct-to and the sequencing are reached by panel input and a direct call. | `test/render/data/flightplan/ActiveWaypoint.test.ts` |
| x | #43 `ed17e0e` | Direct-to from the FPL 0 page to the second of two identical waypoints flew to the first. | render | testable | `[A, X, B, X]`, cursor on the second X, DCT, ENT: the active FPL index is 3. | `test/render/pages/left/DirectToPage.test.ts` |
| x | `43d472b` (open #68) | `ActiveWaypoint.directTo` read the previous index instead of the target's when the typed ident is in FPL 0. | render | testable | FPL KAAA-ABC-KBBB with ABC active, DCT, type KBBB, ENT: `activeIdent` KBBB, FPL index 2, no error. The target must differ from the active leg, or the old code reads the right leg by chance. The pause half of the commit is a needs-harness row. | `test/render/data/flightplan/ActiveWaypoint.test.ts` |
| x | #12 `2922907` (#30 duplicate) | On the direct-to page, CLR followed by the cursor (or ENT) threw "cannot pop the base page". | render | testable | No active waypoint, DCT, CLR, left cursor; separately DCT, CLR, ENT: no error, page usable. | `test/render/pages/left/DirectToPage.test.ts` |
| x | #49 `40bfbec` (#69 duplicate on 1.x) | DCT with no waypoint to suggest threw. | render | testable | Empty FPL 0, DCT: the page shows, no error. | `test/render/pages/left/DirectToPage.test.ts` |
| x | #81 `ea23a6e` | Changing the right page while a direct-to waypoint awaited confirmation, then the left cursor, threw and locked the unit. | render | testable | DCT, right outer knob, left cursor: no error, not the error page. | `test/render/pages/left/DirectToPage.test.ts` |
| x | `9adbf97` | VNAV rejected a direct-to waypoint that is not in FPL 0. | unit | testable | `Vnav.isValidVnavWpt` with a stub nav state whose active waypoint is a direct-to outside FPL 0: true for it, false for another waypoint. | `test/unit/services/Vnav.test.ts` |
| x | #4 `f6f62ec` | `Vnav.tick` threw when VNAV was armed or active and its waypoint had been cleared by a reset. | unit | testable | `Vnav` with a stub nav state, VNAV waypoint null, state Active: no throw, state Inactive. | `test/unit/services/Vnav.test.ts` |
| x | #8 `4cbe2b5`, `9f0b7e1` | Consecutive duplicate waypoints threw in `MSA.getMSAFromTo` (zero distance) and in the NAV 5 map drawing. | unit + render | testable | Unit: `getMSAFromTo(p, p)` equals `getMSA(p)` (MSA grid via `FakeXhr`). Render: NAV 5 with a duplicate in FPL 0, no error. | `test/unit/services/MSA.test.ts`, `test/render/pages/left/Nav3Page.test.ts`, `test/render/pages/left/Nav5Page.test.ts` |
| x | #36 `e09cc67` | User waypoints at 0° latitude or longitude lost their sign. | unit | testable | Extend `UserWaypointV2.test.ts`: a waypoint at 0°54.35'W stores `-00054.35` and restores to the same value; likewise 0°30'S. | `test/unit/settings/UserWaypointV2.test.ts` |
| x | #78 `6677fae` | Restored V2 user waypoints had their longitude sign flipped. | unit | testable | Held indirectly by the round trip in `UserWaypointV2.test.ts`; add a direct west-longitude assertion and a VOR or NDB case. The latitude half is #98 (pinned). The same commit broke V1 longitudes of 100° and more: pin #101. The V1 half is pinned as #101 (`it.fails`). | `test/unit/settings/UserWaypointV2.test.ts`, `test/unit/settings/UserWaypointV1.test.ts` |
| x | #47 `933479d` (`d0f5265` duplicate) | V1 user data (waypoints, flight plans) is converted to V2 at boot. | unit | testable | Hand-written V1 strings through `UserWaypointLoaderV1` and `UserFlightplanLoaderV1`, then a boot with V1 storage: V2 strings stored, `userDataFormat` 2. A longitude of 100° or more is pinned as #101. | `test/unit/settings/UserFlightplanLoaderV1.test.ts`, `test/unit/settings/UserWaypointV1.test.ts`, `test/render/KLN90BCore.userDataConversion.test.ts` |
| x | `f745fb3`, `b14db79` | A user airport runway of unknown length (stored as -1) was not recognized as unknown after a restore (unit conversion made it a fraction). | unit | testable | Persist a user airport without runway length, restore it: the length is negative and APT 3 (user) shows none. | `test/unit/settings/UserWaypointV2.test.ts`, `test/render/pages/right/Apt3UserPage.test.ts` |
| x | `1781156` | Loading user waypoints at boot wrote every one back to storage while importing. | unit | testable | Load V2 user waypoints through the persistor: `FakeStorage` sees no writes during the load. It regressed: `933479d` moved the `ignoreSync` flag into the loaders, where nothing reads it. It is pinned as #103 (`it.fails`) instead of guarded. | `test/unit/settings/UserWaypointPersistor.test.ts` |
| x | #31 `e0fec22` | CAL page values are kept in user settings instead of volatile memory. | render | testable | Edit CAL 1 BARO: the value is stored under the profile key and still shown after the page is recreated. The default value is a trainer-based choice: characterization only. | `test/render/pages/left/Cal1Page.test.ts` |
| x | #61 `179d37d` | GPS acquisition started only after the self-test instead of at power-on. | render | testable | `engineRunning: false`, fast acquisition: during the self-test the satellite computer has left idle. Re-verdicted from flight to render: `Flight.start` cannot start a cold unit, and a booted `engineRunning: false` unit shows the channels searching while the welcome page is up. The flight version is not covered. | `test/render/Gps.test.ts` |
| x | #63 `64c203d` | Simulates the GPS week rollover: a manual date in another 1024-week era stays shifted by whole eras after acquisition. | render | testable | Set the date ~20 years off before acquisition, acquire: the sim date minus the era difference × 1024 weeks, computed from the GPS epoch independently. A same-era date is unchanged. Re-verdicted from flight to render: the era shift is read from `gps.timeZulu` after a cold acquisition. | `test/render/Gps.test.ts` |
| x | #87 `8a16a33` | New LVar `L:KLN90B_IntegrityWarn`, set while there is no GPS solution. | render | testable | Boot with slow acquisition: true while acquiring, false once valid. Public contract. Re-verdicted from flight to render: a cold boot shows the LVar true, then false. | `test/render/SensorsOut.test.ts` |
| x | #29 `a0678fa` | New LVar `L:KLN90B_HSI_TF_FLAGS` (0 off, 1 TO, 2 FROM), also in OBS. | flight | testable | 1 before the waypoint, 2 after passing it in OBS, 0 with no active waypoint. Public contract. The TO to FROM flip flies; the 0 case is a render test (no active waypoint), so the row has both stages. | `test/flight/flights/hsiToFromFlags.test.ts`, `test/render/Sensors.test.ts` |
| x | #24 `66b0444` | After a hot swap another GPS reset `GPS OVERRIDDEN`; the unit now re-asserts it every calculation tick. | render | testable | Clear `GPS OVERRIDDEN` mid-flight: it is 1 again within two seconds. Re-verdicted from flight to render: clearing `GPS OVERRIDDEN` and one calculation tick is enough (the row said two seconds). The hot-swap and `WriteGPSSimVars` companions are render tests too. | `test/render/SensorsOut.test.ts` |
| x | `6be164c` (part) | `GPS MAGVAR` was written in degrees instead of radians; `GPS GROUND MAGNETIC TRACK` was added. | flight + render | testable | World magvar 4°, fly 090 true: `GPS MAGVAR` is 4° in radians, and the magnetic track matches an independent computation. The magnetic track flies; `GPS MAGVAR` is a render test. | `test/flight/flights/magneticTrack.test.ts`, `test/render/SensorsOutSimVars.test.ts` |
| x | `1236025` (part) | `GPS WP NEXT LON` and `PREV LON` were written with a string unit. | render | testable | Three-leg FPL 0: both SimVars equal the waypoint literals in degrees. Re-verdicted from flight to render: the SimVars are written at rest. | `test/render/SensorsOutSimVars.test.ts` |
| x | `07c6e37` | `Output.ObsTarget` wrote SimVars instead of the `K:VOR1_SET`/`K:VOR2_SET` key events. | render | testable | panel.xml `ObsTarget` 1, fly a leg: `sim.keyEvents` holds `K:VOR1_SET` with the magnetic DTK. Re-verdicted from flight to render: the key events are written at rest. | `test/render/SensorsOutSimVars.test.ts` |
| x | `92fbba1` | `Output.ObsTarget` set the NAV OBS even when the GPS was not the nav source. | render | testable | As the `07c6e37` row with `GPS DRIVES NAV1` false: no `K:VOR1_SET` key event. Re-verdicted from flight to render: `Aircraft.writeTo` forces `GPS DRIVES NAV1` true every 16 Hz step, so a flight cannot test it. The flight version is not covered. | `test/render/SensorsOutSimVars.test.ts` |
| x | `955b535` | During the self-test the course output was 130° (the RMI test value) instead of 315°. | render | testable | `engineRunning: false`, during the self-test: the desired-track output is 315° magnetic (3-4 gives OBS out 315°, RMI 130°). | `test/render/pages/left/SelfTestLeftPage.test.ts` |
| x | #51 `124b094` | New `KLN90B_Power_On`/`Power_Off` H events for hardware (idempotent). | render | testable | Power_Off: `L:KLN90B_Power` 0 and a blank screen; Power_On twice: one power-up only. Public contract. Power_Off during the fade-in is pinned as #114. | `test/render/PowerButton.test.ts` |
| x | #52 `5da8165` | `L:KLN90B_Brightness` became writable. | render | testable | Write 0.5 to the LVar: the display brightness follows; the brightness H events still change it. Public contract. | `test/render/BrightnessManager.test.ts` |
| x | #53 `66204f4` | Fuel on board is read from `FUEL TOTAL QUANTITY WEIGHT EX1`. | render | testable | `FOBTransmitted` on, set the EX1 SimVar: OTH 5 shows it. | `test/render/pages/left/Oth5Page.test.ts` |
| x | `1676e56` | `L:KLN90B_ElectricitySimVarIndex` was initialized with a string instead of a number. | unit | testable | Parse a panel.xml with `CIRCUIT SWITCH ON:2`: the LVar write is the number 2. | `test/unit/settings/KLN90BPlaneSettings.test.ts` |
| x | `c673dc2` | `L:KLN90B_RightScan` published the previous state instead of the current one. | unit | testable | `Hardware.setScanPulled(true)`: the last write of the LVar is true. | `test/unit/Hardware.test.ts` |
| x | `7b4465d` | H events before initialization crashed (the startup fix for the Dukes). | unit | testable | `PageManager.onInteractionEvent` before init: no throw, and the "not yet initialized" `console.error` is logged (spy on it; only `Flight` monitors `console.error`, the render harness does not fail on it). | `test/unit/pages/PageManager.test.ts` |
| x | #6 `117f548`, `4fa8cea`, `cc89fd4` | Approach filter: RNAV approaches only with LNAV and without RF legs; VOR, NDB and GPS approaches kept (`cc89fd4` restored dropped non-precision approaches). | unit | testable | Static `SidStar.isApproachRecognized` with hand-built approach literals of each kind. | `test/unit/data/navdata/SidStar.test.ts` |
| x | #59 `71481dc`, `b0c16cf` | RNP filtering removed; only RF-leg and RNP-AR procedures are filtered (`b0c16cf` also dropped the per-leg RNP check for approaches). SET 10 lost its PROCS option. | unit | testable | Same literals: `rnp > 0` accepted, `rnpAr` or an RF leg rejected. | `test/unit/data/navdata/SidStar.test.ts` |
| x | #14 `8da5eee` | Procedures with no recognized leg type were listed as empty. | unit | testable | Static `SidStar.isProcedureRecognized` with literals: only CA/VM legs gives false, one fix leg gives true. | `test/unit/data/navdata/SidStar.test.ts` |
| x | #28 `063a836` | DME-arc entry names for 27 NM and beyond produced garbage characters. | unit | testable | Private static `SidStar.getArcEntryName(navaid, radial, dist)` at 18, 26, 27, 30 and 100 NM. The names up to 26 NM follow 6-16; the forms from 27 NM follow the Jeppesen navdata convention the code cites, not the Pilot's Guide. The test checks only that those names have five characters, and the name from 6-6 is pinned as #107 (the maintainer may close it as intended). | `test/unit/data/navdata/SidStar.test.ts` |
| x | `9ce23bf`, `f4f5395`, `1ef2a35` (part) | Re-picking a DME-arc entry point could choose a point behind the aircraft (`f4f5395` made the angle check absolute); left-hand arcs used the wrong radial range. | unit | testable | Static `SidStar.recalculateArcEntryData` with a hand-built arc and stub sensors, both turn directions: the entry ahead of the aircraft, radials hand-computed. The `getArcEntryData` half of `1ef2a35` is not covered (it needs procedures); the right-hand recalculation is pinned as #104. | `test/unit/data/navdata/SidStar.test.ts` |
| x | #9 `103ea59` | `BoundaryUtils.isInside` and `intersects` were wrong for airspaces crossing the date line. | unit | testable | A hand-built `LodBoundary` across ±180°: points on both sides inside, a far point outside. The remaining date-line cases are pinned as #106. | `test/unit/data/navdata/BoundaryUtils.test.ts` |
| x | `6a6c634` | Scanning did nothing: the cache lookup compared ICAOs by reference, and an empty index set a bogus start. | unit | testable | Scanlist over a few airports, `getNext` with a structurally equal ICAO copy: the next ident of a hand-sorted list. Empty list: `init()` resolves to null. Duplicate idents at the start of the list and a scan during the first fill are pinned as #105 and #108. | `test/unit/data/navdata/Scanlist.test.ts` |
| x | #42 `07873c0`, `e1e75d0` (part) | Without user waypoints, rebuilding the empty scan index threw and left the unit in the self-test; `init` returned undefined. | unit | testable | Empty user scanlist: `init()` resolves to null. Every boot without user waypoints passes through it, so prove the test bites. | `test/unit/data/navdata/Scanlist.test.ts` |
| x | `d3228dd` (`b21118b` on 1.x) | With duplicate idents, scanning skipped facilities: the scan list did not search the current ident, and the waypoint selector did not sort by full ICAO. | unit + render | testable | Two VORs named ABC in different regions plus ABD: scanning from the first ABC visits the second ABC before ABD. | `test/unit/data/navdata/Scanlist.test.ts`, `test/render/pages/right/VorPage.test.ts` |
| x | `e1e75d0` (part) | The merged user and database search result was not sorted by ident, breaking the scan order. | unit | testable | User AAA and CCC, database BBB: `searchByIdentWithIcaoStructs` returns AAA, BBB, CCC. | `test/unit/data/navdata/KLNFacilityLoader.test.ts` |
| x | #39 `c2e7b8e`, `d202f4a` | Scanning threw after the shown nearest entry dropped off the nearest list; distance and bearing now revert to coordinates. | render | testable | APT 1 on nearest entry 1, fly until it leaves the list, scan: no error. Re-verdicted from flight to render: a teleport (`PLANE LATITUDE`) moves the aircraft off the list. The `fac === undefined` guard at `WaypointPage.tsx:218` cannot be re-broken alone: since `c2e7b8e` the scan never reaches it. | `test/render/pages/right/Apt1Page.test.ts` |
| x | #5 `bf08926`, `795356f` | Errors are shown on a full-screen error page with the stack; OK hides it, "OK and suppress" blocks later ones. | render | testable | Publish an error: the error page shows message and stack; OK hides it; suppress blocks the next. DOM, not `Screen`. | `test/render/controls/ErrorPage.test.ts` |
| x | #54 `5599e1f`, #55 `603ad0d` (same hunk) | Changing the hundreds or tens digit of an altitude corrupted the stored value. | render | testable | CAL 2 ALT 30000, change the hundreds digit: ALT 30100. Only the hundreds digit can be reached with the cursor (the tens and ones are read-only), so the tens half of the fix is not observable. #55's own report (ALT page stuck) was resolved by #56. | `test/render/controls/selects/AltitudeFieldset.test.ts` |
| x | #33 `439244d` | CAL page values propagate as on the KLN 89 trainer; viewing CAL 2 overwrote CAL 3 TAS. | render | testable | Change ALT on CAL 1: CAL 2 shows it. Open CAL 3 after CAL 2: TAS unchanged. Trainer-based: characterization unless a manual page supports it. | `test/render/pages/left/Cal2Page.test.ts` |
| x | `ee0b000` | Changing the baro setting threw (unbound callback). | render | testable | ALT page, change baro, ENT: no error, the barometer input holds the value. | `test/render/pages/left/AltPage.test.ts` |
| x | #56 `14972b6` | An overlay page that does not handle a knob is closed and the event re-dispatched; DCT stays open with the cursor off; ALT and DIR titles. | render | testable | ALT, outer knob: the page changes. ALT, DCT, cursor off, outer knob: DCT closes. The status line shows ALT and DIR. | `test/render/pages/MainPage.test.ts` |
| x | #64 `681181d` | The default date for date editors is 1 Jan 1988. | render | testable | SET 2 before acquisition, start an edit, ENT: 01 JAN 88. | `test/render/controls/editors/DateEditor.test.ts` |
| x | #65 `201f443` | Creating a user airport at the user position from APT 1 threw. | render | testable | APT 1, unknown ident, "create at user position", ENT: no error, lat/lon editors shown. | `test/render/pages/right/Apt1Page.test.ts` |
| x | #72 `3977549` (#88 on 1.x) | Creating an intersection with a REF waypoint threw with nested waypoint pages. | render | testable | INT or SUP, REF ident, ENT, confirm with ENT: no error, field filled. The issue is a video; confirm the steps. | `test/render/pages/right/IntPage.test.ts` |
| x | #46 `bca17fd` | The SET 10 page threw. | render | testable | Select SET 10: no error. | `test/render/pages/left/Set10Page.test.ts` |
| x | `fb671c0`, `74134be`, `9d1fe96` | SET 9 was named SET 7, SET 7 was named SET 8, and TRI 5 had the wrong page number. | render | testable | Select each: the status line shows the page's own name. | `test/render/pages/left/pageNames.test.ts` |
| x | `2b9f811` | Details of the SET 0 database update sequence and its status-line texts, corrected after a video of a real unit. | render | testable | Walk the SET 0 update: each step's screen. Source is the video the commit names (allowed by `CLAUDE.md`); cite its timestamps. The video was not watched, so no timestamps are cited; the status line is a spec (2-5 to 2-6, figures 2-2 to 2-8), the step rows are characterization. | `test/render/pages/left/Set0Page.test.ts` |
| x | `f95d1d7` | The ACT page did not refresh when the flight plan changed. | render | testable | ACT page shown, change FPL 0 (insert a waypoint): the ACT page lists it without a page change. The type letter of an NDB on this page is pinned as #115. | `test/render/pages/right/ActPage.test.ts` |
| x | `8045b29` | A waypoint confirmation page opened from the ACT page was shown like the ACT page. | render | testable | Enter a new ident from the ACT page: the confirmation page has the waypoint-page layout. Confirm the steps first. | `test/render/pages/right/WaypointConfirmPage.test.ts` |
| x | `8e9a7c4` | With SCAN pulled and the right cursor active, the inner knob scanned instead of changing the field (KLN 89 trainer behavior). | render | testable | Right cursor on an editable field, `EVT_R_SCAN_RIGHT`: the field value changes as with the inner knob. Trainer-based: characterization unless a manual page supports it. | `test/render/pages/MainPage.test.ts` |
| x | `9a17b5b` | Moving the cursor down past the last visible row of a list left the focused row one row below the visible area. | render | testable | A list taller than the page (OTH 3 with several user waypoints), cursor down to the bottom: the focused row is the last visible row. | `test/render/pages/left/Oth3Page.test.ts` |
| x | #35 `13d360b` | APT 2 showed the elevation in meters instead of feet. | render | testable | Airport at a known elevation in meters: APT 2 shows feet, rounded to 10. | `test/render/pages/right/Apt2Page.test.ts` |
| x | #38 `645c008` | APT 3 threw for an airport without runways. | render | testable | Airport without runways: APT 3 not offered, no error. | `test/render/pages/right/Apt3Page.test.ts` |
| x | #26 `84a3008` | Deleting an item on OTH 3 skipped the next item. | render | testable | Three user waypoints, delete the middle one: the cursor stays on that row, now showing the next waypoint. | `test/render/pages/left/Oth3Page.test.ts` |
| x | `f347a2c` | ENT stopped moving the cursor to the next field. | render | testable | Cursor on a select field, ENT: the inverted field moves on. | `test/render/pages/CursorController.test.ts` |
| x | #25 `96b3de3` | Keyboard mode works for all editor types. | render | testable | `KLN90B_Internal_Key` events into a number field (SUP lat/lon): the characters appear and the cursor advances. Half fixed: longitudes below 100 degrees and the date cannot be typed, pinned as #109. | `test/render/services/KeyboardService.test.ts` |
| x | #75 `4b11c06` | Escape leaves keyboard mode. | render | testable | Keyboard mode, a `keypress` Escape on the hidden input: mode off after the timeout. Holds the handler only, not how Coherent GT delivers the key. | `test/render/controls/PageContainer.test.ts` |
| x | `8c3b2e0` | The FPL leg did not blink while a waypoint awaited confirmation. | render | testable | FPL 0, enter an ident: `Screen.mask()` alternates F and I over the ident cells across blink phases. | `test/render/controls/editors/WaypointEditor.test.ts` |
| x | `10c5a3d` | The static characters of an editor (space, degree sign, dot) were not inverted when selected. | render | testable | Cursor on a lat/lon or date editor: the mask shows I on those cells. | `test/render/controls/editors/DateEditor.test.ts` |
| x | `b7fd10a`, `44fb0a4` | Super NAV 1 and Super NAV 5 threw without an active waypoint. | render | testable | No active waypoint, both sides NAV 1 (then NAV 5): no error. Super NAV 5 is checked by the error list only. | `test/render/pages/left/SuperNav.test.ts` |
| | #15 `34a9cb0` | Lat/lon waypoints of a sim route are imported as temporary SUP waypoints (now in `KlnEfbLoader`). | unit | needs harness: route manager in `FakePlatform` | `getRouteManager` never resolves; a stub that emits a synced route is needed (Session 6 needs it too). | |
| | #17 `e290ea4` | NAV 5 threw when drawing a DME arc. | render | needs harness: procedure builders | Needs a DME-arc leg in FPL 0. | |
| | #18 `15d9b35` | DME arcs were drawn and flown the wrong way round. | flight | needs harness: procedure builders | Left and right arcs. The fix carries the author's own doubt (the comment at `circle.reverse()` in `SidStar.ts`); related to #100. | |
| | #20 (no commit) | Wrong turn between two DME arcs whose end and entry coincide. | flight | needs harness: procedure builders | Closed as not reproducible after #21 (`1e1a8f5`). | |
| | #21 `1e1a8f5` | `GPS WP TRUE BEARING` is the desired track on a DME arc, so autopilots track the arc. | flight | needs harness: procedure builders | On an arc the SimVar equals DTK; on a great-circle leg it is the bearing to the waypoint. | |
| | `326da1a` (#19 reference) | Turn anticipation in a DME arc uses the DTK at the end of the arc. | flight | needs harness: procedure builders | Needs a DME-arc leg followed by a turn. | |
| | `633fdad` | Switching to APR-LEG uses a 110° course tolerance, not 70°. | flight | needs harness: procedure builders | Needs FAF and MAP legs; `savedFlightplan` does not store fix types. | |
| | `7fd640e` (part), `1ef2a35` (part) | Arcs ending at the IF lost their arc data; left-hand entry ranges during conversion; the Super NAV 5 arc-move state after ENT; degenerate dashed arc segments. | unit + render | needs harness: procedure builders | Private conversion paths, reachable only through SDK procedures. | |
| | `80631c8` | APT 7 and APT 8 were not redrawn after a waypoint confirmation page. | render | needs harness: procedure builders | The pages show procedures; without them there is little to redraw. | |
| | #57 `531b0f9` | Heliports and airports without runways are filtered from the nearest list and Super NAV 5. | unit | needs harness: nearest-search filters | `MemoryFacilityClient` ignores the airport filters. | |
| | `133f4d8` | Airspaces were selected by bounding box; now by polygon. | unit | needs harness: airspace boundaries | The fix over-filters the route searches: #102. Test both with the extension. | |
| | #50 `b4a4ff2` | Errors during startup are published instead of leaving the unit in the self-test. | unit | needs harness: boot-failure helper | `bootUnit` waits for `propsReady`; needs a variant with a throwing facility client that awaits the `error` event. | |
| | `eef92e8` | Super NAV 5 showed `--.-NM-` instead of `-.-NM-` without XTK. | render | needs harness: Super NAV 5 reader | `Screen` cannot read the page; needs a DOM query helper for its `<pre>` blocks. | |
| | `43d472b` (part) | The track is not recomputed while the sim is paused (identical positions). | flight | needs harness: paused aircraft | `Aircraft` always moves at its ground speed. | |
| | #7 `30f2216` | Import of `.fpl` files via SET 10. | — | superseded | `86a6d44` replaced it with the EFB route sync (`KlnEfbLoader`); see #15. | |
| | `6ed57d9` | The AIRAC cycle was treated as expired on its last day. | — | superseded | `22b4532` moved to the SDK AIRAC utilities. A boundary test of today's code belongs in Session 7. | |
| | `7fd640e` (part) | Direction parameter for arc drawing. | — | superseded | `15d9b35` (#18) removed it again. | |
| | `6be164c` (part) | Added `GPS WP TRACK ANGLE ERROR`. | — | superseded | `60452b9` switched its sign; Session 4 tests today's sign. | |
| | #3 `7e7ef5d`, `51fc6d2` | Popped-out panels showed the glow badly. | — | not testable | CSS and Coherent pop-out rendering. | |
| | #10 `6e1bf06` | The build injects the version into `manifest.json` and `Version.ts`. | — | not testable | Build pipeline; tests never run rollup. | |
| | #11 `2ff906d` | Larger font on the error screen. | — | not testable | CSS only. | |
| | #16 `c41bb6c`, `0f59f70` | Minifying removed (a minified name collided with a Coherent global). | — | not testable | Bundler configuration, visible only in Coherent GT. | |
| | #40 `8abd5f7`, `b135b3d` | Smoother scrolling through waypoint lists. | — | not testable | The speed-up is not observable; the fake navdata answers synchronously. The rewritten cache window (scrolling across its boundary in a long list) is observable and belongs to the `Scanlist` tests of Session 7. | |
| | `d3c5230` | A sim crash when hot swapping after `L:KLN90B_Disabled`; the zeroing of GPS SimVars is disabled. | — | not testable | The crash is inside the sim; the workaround is deliberate. | |
| | `7bb08f2`, `f09600f` | Flashing editor fields hid their letter; blink color. | — | not testable | CSS cascade; the mask is the same before and after. | |
| | `88f5620`, `87d5521` | Buttons sometimes cut off; the error page header on one line. | — | not testable | CSS only. | |
| | `0086363` | `GPS WP DESIRED TRACK` was overwritten in the sim by the track angle error write; the writes were reordered. | — | not testable | The overwrite is sim behavior; `FakeSim` keeps every SimVar separately, so both orders look the same. Session 4 tests the value itself. | |
| | #1, #2, #13, #44, #45, #48, #66, #79, #85 | Support threads, packaging, an empty report, an aircraft-side problem. | — | no behavior | No code change. | |
| | #32, #37, #58, #80 | Baro range check, OBS restart message, bank-hold SimVar, activating a leg with ENT twice. | — | no behavior | Closed as correct or not planned; no code change. | |
| | #84 `1e3e548` (fs2020) | Backport of the #76 turn fix to 1.x. | — | no behavior | Covered by the #76 row; the 1.x line has no tests. | |
| | `5cd2fa4`, `e1e75d0` (part), `1ef2a35` (part), `7fd640e` (part), `1236025` (part) | Compile fixes, imports, logging, a comment, `eteToDest` null instead of 0. | — | no behavior | Mechanical, or no observable difference. | |
| | `5cfa12f`, `f7f8ef1`, `456356d`, `26a307f`, `4695a3c` | Test-suite and documentation commits. | — | no behavior | Not instrument code. | |
