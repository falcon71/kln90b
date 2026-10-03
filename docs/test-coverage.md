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
2. Run `npm test` and `npx tsc --noEmit` first. Both must be clean before any new work starts. If they are not, stop and
   report; do not fix unrelated failures as part of the session.
3. Run the coverage report (`npm run coverage`, added by session 1) and read it for the session's area before writing
   tests.
4. Commit in small steps, one area or one regression test per commit, with the attribution lines the session is given.
   Never merge; the maintainer merges after review.
5. Finish by running `npm test` and `npx tsc --noEmit` again, ticking the session's checkbox in section 3, adding a
   session log entry in section 4 (date, branch, what was done, what was left and why) and committing this document.
6. If the session runs out of context before its scope is done, it still does step 5. It leaves the checkbox unticked
   and writes what remains into the log. The next run of the same session continues from the log.

**What a test is allowed to assert**

7. **Spec tests** assert the real unit's behavior with the Pilot's Guide page (or another source named in `CLAUDE.md`)
   cited in a comment, and an expected value derived independently of the code under test. Prefer these.
8. **Characterization tests** pin what the code does today, such as a page snapshot. They are allowed where no spec is
   at hand, and they are labeled as `testing.md` section 5 describes. A characterization test never carries a manual
   citation, because it does not claim to match the manual.
9. **When the code and the manual disagree, the test asserts the manual**, is written as `it.fails('… (#NN)')` and the
   bug is filed per `CLAUDE.md`. Never assert a bug as correct, not even in a characterization test: if a snapshot
   contains a visible bug, exclude that row or pin the bug separately.
10. **Use the cheapest stage** that can observe the behavior (`testing.md` section 1). One headless unit per test file.

**Proving a test holds**

11. Every new test is verified by breaking its subject on purpose (`testing.md` section 5). For a regression test the
    break is the original bug: reintroduce it in the working tree, by hand when the old commit's diff no longer applies,
    confirm the test fails, restore, and confirm `git diff` shows only the intended changes. Never commit the broken
    state. Record in the log any fix that could not be re-broken and why.
12. A regression test that cannot fail for its bug is not done. Either make it bite or mark the item "not provable" in
    the triage table with the reason.

**What a session may change**

13. **Do not change behavior.** Small changes for testability (a constructor parameter for a dependency, exposing a seam,
    making a private helper reachable) are fine; the commit message says what changed and why.
14. **Harness extensions are fine when they unblock several tests.** One test is not worth a large extension: list the
    extension under `testing.md` section 7 instead. Session H exists for the large ones.
15. Every bug spotted goes to GitHub per `CLAUDE.md`, with an `it.fails` pin where a test can observe it. Do not fix
    bugs during a test session.
16. Never commit manual text, tables or screens, and never commit navdata recorded from the sim. Facilities in tests are
    invented (`testing.md` section 5).

**Avoiding false security**

17. Do not write a test whose only purpose is to raise the coverage number. A test must either state a spec, pin the
    current behavior of something that could plausibly break, or guard a past bug.
18. Permissive assertions (`toBeDefined`, `length > 0`, `not.toThrow` alone) are not a test of anything but the absence
    of a crash. Use them only for the "every H event is accepted without an error" style of sweep, and say so in the
    test name.
19. The session log says what was **not** covered in the session's area, so the final record in session 11 can be
    written from the logs.

# 3. The sessions

Sessions 1 to 3 build the regression tests, because a bug that has bitten before has a known reproduction, a known
expected value and a built-in proof (the test fails on the old bug). Sessions 4 to 10 build the base coverage in order
of value. Session 11 retires this document. Session H is optional and scheduled by the maintainer when the triage
shows that it pays off.

A session that was interrupted is rerun with the same number until its checkbox is ticked (rule 6).

## Session 1: coverage tooling and regression triage

- [ ] done

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

- [ ] done

**Goal:** a test for every triage row with verdict *testable* whose stage is unit or render, in impact order.

1. For each row: write the test in the folder mirroring the code under test, cite the issue in the test name
   (`'… (#NN)'`), and cite the manual page when the issue is about matching the real unit.
2. Prove it bites (rules 11 and 12). Record the proof in the commit message in one line ("fails when the sign flip in
   `UserWaypointLoaderV2` is restored").
3. Tick the row in the triage table with the test file's path.
4. Any issue that turns out not to be fixed, or only half fixed, gets an `it.fails` pin and a new GitHub issue
   referencing the closed one (as #98 did for #78).

**Done when:** every *testable* unit or render row is ticked or has been moved to another verdict with a reason.

## Session 3: regression tests, flight stage

- [ ] done

**Goal:** the same for the rows whose stage is flight: sequencing, direct-to, turn handling, mode changes, alerts.

1. Follow `turnDirection.test.ts` for the shape: one test flies and records, a second judges the recording when the
   judgment is a bug pin.
2. Derive expected values from `test/harness/flight/geo.ts` and the manual, never from the instrument (`testing.md`
   section 5).
3. Flights are expensive to read when they fail. Keep each flight to one issue, and name the predicate in `flyUntil`.
4. Prove each test bites (rule 11) and tick the row.

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

Each extension comes with its own harness test (`test/*/harness/`) and a paragraph in `testing.md` section 3. After
this session, the *needs harness* rows it unblocked become *testable* and are picked up by a rerun of session 2 or 3.

## Session 4: the public contract

- [ ] done

**Goal:** the interfaces `CLAUDE.md` says must never break, so a change that breaks an aircraft fails a test.

1. **H events** (`kln90b/HEvents.ts`): a sweep that sends every public event to a booted unit and asserts no error was
   published and no `console.error` occurred (rule 18 applies; name it a sweep). Then spec tests for the events with an
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
   context is spent (rule 6); the log says where.

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

(no entries yet)

# 5. Regression triage table

Filled by session 1, worked through by sessions 2 and 3. One row per candidate. Tick a row when its test is committed
and proven to bite, and add the test path. Change a verdict only with a reason in the row.

| done | issue / commit | description | stage | verdict | test |
|------|----------------|-------------|-------|---------|------|
| | | *filled by session 1* | | | |
