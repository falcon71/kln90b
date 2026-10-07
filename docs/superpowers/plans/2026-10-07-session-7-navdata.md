# Session 7 (navdata and fragile code): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Tests that hold the navdata layer and the fragile code: the facility loader and repository, `Database`, the
nearest lists and the scan list, `KLNMagvar`, `BoundaryUtils`, the airspace alert, `Gps.ts`, the page tree, the cursor
controller and the `SidStar` conversion. Each test is proven to bite. Also pins for the bugs the research found, the
pins of #189 and #190, and a small harness task.

**Architecture:**
- **Task 0** (harness) runs alone first: a timeout fix for a flaky test, three `Leg` builders, a doc comment and
  `testing.md` notes.
- **Tasks 1 to 6** are parallel batches, one per research area (A to F). Each runs in its own git worktree, reset to the
  session branch after task 0 has merged, starts from the research drafts, and ends in one commit (plus one per fix
  round). They share no file.
- **Task 7** files the issues and comments, replaces the placeholders, corrects `CLAUDE.md`, updates `testing.md` and
  writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the
headless harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-07-session-7-navdata-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task.
- **Branches.** The session branch is `tests-session-7-navdata`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`, and the work then goes like this:
    - Before anything else, run `git reset --hard tests-session-7-navdata` on the (still empty) worktree branch.
    - Check `git log -1`: it must show the session branch's head, which the controller names in the dispatch.
    - If `node_modules` is missing, create it as a junction to `E:\msfs\kln90b\node_modules`
      (`cmd //c mklink /J node_modules E:\msfs\kln90b\node_modules`). Never delete it recursively.
- **No behavior changes** in `kln90b/` (rule 12). Testability seams only, each named in its commit message.
- **Test names** carry the issue where there is one: `'… (#190)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23), with the numbers fixed in the placeholder table below. The research
  drafts use the names `#NEW-A-n` to `#NEW-F-n`: rename them as the table says.
- **Labels** (`testing.md` section 5):
    - A **spec test** cites the Pilot's Guide page in a comment (or the Installation Manual page, or "checked in the
      KLN 89 trainer (2026-10-07)").
    - A **characterization test** has `characterization` in its `describe` or `it` title and no citation.
    - A **contract test** cites its source (`CLAUDE.md` "Public contract with aircraft", the EFB route sync) and needs
      neither.
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `install-manual-index.md`). Cite page numbers, never copy manual text.
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts` or by hand. Never derive them from the
  code under test or the SDK's flavor of the same formula. Setup may use SDK geometry. `BoundaryUtils` expectations are
  hand-computed in the lat/lon plane, and the test file says so.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure (the message list, screen rows), not substrings of a whole screen.
- **Pins.**
    - Every `it.fails` has a passing sibling that asserts its heavy preconditions.
    - A pin is proven by fixing the bug temporarily and seeing the pin turn red, then restoring. The fix is named per
      pin below or in the research report.
- **Proof per test (rule 10).**
    - Break the subject by hand: the break the research report recorded, and at least one break the implementer chooses
      itself.
    - Run the test, see it fail, restore, and check that `git diff` shows only test files.
    - Never commit the broken state.
- **Mutation runs.** After task 0 the suite has no known load flake. A kill that appears only while other suites run in
  parallel is re-run alone before it counts.
- **Commits (rule 22).**
    - One commit per task, plus one per fix round, never amended.
    - The message lists every test as `- <test>: Proof: fails when <break>`, and every pin as
      `- <pin>: Proof: turns red with <fix>`.
    - It ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
    - Write the message file with a Bash heredoc or use `-m`: PowerShell `Set-Content` writes a byte order mark.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, `docs/testing.md`, `CLAUDE.md`, GitHub issues, and other
  tasks' files. Task 0 is the exception for `testing.md`, task 7 for all of them.
- **Copyright and data.** Never commit manual text or navdata recorded from the sim. Facilities are invented. The KLN 89
  trainer is cited as "KLN 89 trainer"; its Chicago waypoints never appear in tests.
- **Research and scratch.**
    - The session scratchpad is
      `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\7e1bcdd0-f6fd-4714-a6c9-b51be02a8ba1\scratchpad\`.
    - The reports are `research\research-A.md` to `research-F.md` and `research\trainer.md`; the drafts are in
      `research\drafts-A\test\…` to `research\drafts-F\test\…`, laid out like `test\`. `drafts-E\walk-wrap.patch` and
      `drafts-F\test\unit\data\navdata\SidStar.test.ts.amend.diff` are patches to existing tests.
    - The drafts ran green on the session branch before task 0, but they are starting points, not finished tests.
    - Do not copy the research's break lists or mutation ids into test comments.
    - Scratch scripts go only into `scratchpad\task-<N>\`, because the scratchpad is shared.
- **CRLF.** The repo files are CRLF. `sed -i` and `perl -i` under Git Bash rewrite edited lines as LF, so edit with the
  Edit tool, and check `git diff` for line-ending noise before committing.
- **Reports** go to the scratchpad as `task-<N>\report.md`, written with the Bash tool (`cat > '<path>' <<'EOF'`). If
  the heredoc fails on text full of quotes, use the Write tool. Check with `ls -l` that the file exists. The report
  lists per item the test path, spec or characterization, any change of verdict with its reason, and every suspected
  bug with a reproduction. The reply to the controller is only the status, the head commit and concerns.

**User decisions (already made):**
- Circular airspaces: "Enhancement, no pin".
- Almanac age: "Six months, bug + pin".
- Nearest search radius: "Question issue" (characterize meanwhile).
- Take-home mode: "Unsupported, log only".
- Hold shapes: "F-1 bug, F-2 question".
- FPL FULL during a procedure load: decided by the trainer (no 90B answer): characterize plus a question issue.
- Trainer: "Dispatch an agent for all trainer work at the end of our QA" (done; `research\trainer.md`).
- Flaky CAL 6 tests: "Fix in harness task".
- A second KLN in one aircraft: "File an issue with the `enhancement` tag for this".
- STA 5 RAIM prediction: "Bug, sim check noted" (no pin).
- STA 1 states: "Characterize + question".
- The task split, the rulings and the controller's defaults of the spec: approved ("Yes, it looks good").
- "Spec approved, please write the plan".

## Placeholders

Each task uses only its own numbers. Task 7 files one issue per row and replaces the placeholder everywhere.

| placeholder | research | kind | where it appears |
|---|---|---|---|
| `#NEW-1-1` | A-1 | bug | pin, `KLNFacilityLoader.test.ts` |
| `#NEW-1-2` | A-2 | bug | pins, `Database.test.ts` and `Set0Page.test.ts` |
| `#NEW-1-3` | A, Q4 | enhancement (a second KLN 90B in one aircraft) | comment on the dump-response characterization |
| `#NEW-2-1` to `#NEW-2-6` | B-1 to B-6 | bugs | pins (task 2) |
| `#NEW-2-7` | B, Q1 | question (the nearest radius) | comment on the radius characterization |
| `#NEW-3-1` | C-1 | bug | pin, `BoundaryUtils.test.ts` |
| `#NEW-3-2` | C-2 | enhancement (circular airspaces) | comment at `test/unit/harness/airspaces.test.ts:180` |
| `#NEW-3-3` | C, Q8 | enhancement (Class B/C `SEE <apt> APT 4 PAGE`, agency line) | issue only |
| `#NEW-4-1` | D-1 | bug | three pins (task 4) |
| `#NEW-4-2` | D-2 | bug (references `#NEW-4-1`) | pin (task 4) |
| `#NEW-4-3` | D-3 | bug, low (STA 1 elevation below the horizon) | issue only |
| `#NEW-4-4` | D-4 | bug, sim check noted (STA 5) | issue only |
| `#NEW-4-5` | D, Q2 to Q4 | question (STA 1 states INIT/STS, TRAN, NAV A) | comment on the STA 1 characterization |
| `#NEW-5-1` | E-1 | bug | pin (task 5) |
| `#NEW-5-2` | E-2 | bug | pins, unit and render (task 5) |
| `#NEW-5-3` | trainer Q1 | bug (the cursor wraps) | pins (task 5) |
| `#NEW-6-1` | F-1 | bug | pin (task 6) |
| `#NEW-6-2` | F-2 | question (hold after the MAHP-flagged leg) | issue only; the draft pin is not committed |
| `#NEW-6-3` | F, Q4 + trainer Q3 | question (FPL FULL during a procedure load) | comment on the FPL FULL characterization |

---

## Facts every batch needs (from the research pass)

**Boot and settle.**
- `bootUnit` boots force-ready, and `await settle(unit)` waits for the GPS and for FPL 0 to activate.
- One calculation tick is `await vi.advanceTimersByTimeAsync(1000)`. The nearest lists search every 10 s, the first time
  on the tenth calculation tick, so a nearest test waits 12 s.
- Every boot also holds the default navdata (`ZZXA`, `ZZV`, `ZZN`, `ZZXIN`), so never give a test facility an ident
  starting with `ZZ`, and choose idents that sort before them.
- The MSG annunciator is lit on every engine-running boot (`testing.md` section 6), so a message test asserts the exact
  message list, not "any message".

**Unit tests without a boot** build their own `EventBus`. The repository is a singleton: clear it with
`clearStatic(KLNFacilityRepository, 'INSTANCE', false)` in `beforeEach` and build it on a new bus
(`KLNFacilityRepository.getRepository(bus)`). A loader over the fake database is
`new KLNFacilityLoader(new MemoryFacilityClient([...]) as unknown as ActualFacilityClient, repo)`. A test that reads the
navdata cycle clears `FacilityLoader.databaseCycleCache` (`clearStatic(FacilityLoader, 'databaseCycleCache', false)`)
and calls `simEnv().sim.reset()` first.

**Time to first fix.** `bootUnit({coldGps: true})` is a hot start (about 62 s whatever the almanac). A cold or warm
start is `bootUnit({engineRunning: false, storage})`, then `await unit.panel.powerOn()`; the GPS acquires while the
welcome and self-test pages run.

**Power cycle.** `await unit.panel.powerCycle({offSeconds})`, then `await unit.panel.approveSelfTest()`, then two
seconds.

**Messages.** Read them as a parsed list: `unit.props.messageHandler.getMessages()`, mapped to their text. Never use a
screen substring.

**Airspaces.** `airspace()` and `circularAirspace()` (`test/harness/navdata/airspaces.ts`) passed as
`BootOptions.airspaces`; the alert searches every 10 s; the `SDK` boundary queue needs the fake clock advanced.

**Procedures.** `test/harness/navdata/procedures.ts` (`Leg`, `approach`, `sid`, `star`, `withProcedures`,
`runwayFix`); after task 0 also `Leg.HF`, `Leg.HA` and `Leg.PI`. `approachWorld()` and
`await unit.panel.loadProcedure('APT 8')` after `settle`.

---

### Task 0: harness

**Goal:** Remove the CAL 6 load flake, add the hold and procedure-turn leg builders, correct the `BootOptions` comment on
the navdata cycle, and add the session's harness notes to `testing.md`.

**Files:**
- Modify: `test/render/data/VolatileMemory.test.ts` (the two tests of `describe('CAL 6 time (5-14)')`)
- Modify: `test/harness/navdata/procedures.ts` (the `Leg` object)
- Modify: `test/unit/harness/procedures.test.ts` (the options test)
- Modify: `test/harness/boot.ts:38-42` (the `start` doc comment)
- Modify: `docs/testing.md` (sections 3 "Procedures", 4 "Render", 6)

**Acceptance Criteria:**
- [ ] The two CAL 6 tests carry a per-test timeout of 20 000 ms; nothing else in the file changes.
- [ ] `Leg.HF`, `Leg.HA` and `Leg.PI` exist with the signature of `Leg.HM`, and the harness test asserts each option of
      each builder with a non-default value.
- [ ] The `start` comment of `BootOptions` no longer says that a test can set the navdata cycle; it says the cycle is
      fixed per test file.
- [ ] `testing.md` documents: `coldGps` is a hot start and time to first fix needs `engineRunning: false` plus
      `powerOn()`; long render tests need a per-test timeout; the SDK internals `Gps.ts` reads; the new builders.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: the CAL 6 timeout.** In `test/render/data/VolatileMemory.test.ts` give both tests of
  `describe('CAL 6 time (5-14)')` a third argument, as `test/render/harness/power.test.ts:120` does:

```ts
    it('keeps the time of its first view when the page is left and selected again (5-14)', async () => {
        // ... unchanged body ...
    }, 20_000); // Five simulated minutes with every tick: the 5 s default times out when the machine is busy
```

  and the same `}, 20_000);` for `'shows the system time again at its first view after a power cycle (5-14)'`.
  Proof: run the file three times in parallel with the whole render stage (`npx vitest run --project render` in two
  terminals); before the change a timeout is likely, after it none. Record the result in the report (a flake fix has no
  break to run).

- [ ] **Step 2: write the failing builder test.** In `test/unit/harness/procedures.test.ts`, inside
  `'passes the options of a leg into it'`, add (`LegType` imported from `@microsoft/msfs-sdk`):

```ts
        expect(Leg.HF(fix, 90, LegTurnDirection.Left, FixTypeFlags.IAF)).toMatchObject({type: LegType.HF, course: 90, turnDirection: LegTurnDirection.Left, fixTypeFlags: FixTypeFlags.IAF, fixIcaoStruct: fix.icaoStruct});
        expect(Leg.HA(fix, 270, LegTurnDirection.Left, FixTypeFlags.IAF)).toMatchObject({type: LegType.HA, course: 270, turnDirection: LegTurnDirection.Left, fixTypeFlags: FixTypeFlags.IAF, fixIcaoStruct: fix.icaoStruct});
        expect(Leg.PI(fix, 45, LegTurnDirection.Left, FixTypeFlags.IAF)).toMatchObject({type: LegType.PI, course: 45, turnDirection: LegTurnDirection.Left, fixTypeFlags: FixTypeFlags.IAF, fixIcaoStruct: fix.icaoStruct});
        expect(Leg.HF(fix, 90).turnDirection).toBe(LegTurnDirection.Right);
        expect(Leg.HF(fix, 90).fixTypeFlags).toBe(0);
```

  Run `npx vitest run test/unit/harness/procedures.test.ts`: it fails (`Leg.HF is not a function`).

- [ ] **Step 3: add the builders.** In `test/harness/navdata/procedures.ts`, after `HM`:

```ts
    HF: (fix: Fix, inboundMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.HF, fixIcaoStruct: icaoOf(fix), course: inboundMag, turnDirection: turn, fixTypeFlags: flags}),
    HA: (fix: Fix, inboundMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.HA, fixIcaoStruct: icaoOf(fix), course: inboundMag, turnDirection: turn, fixTypeFlags: flags}),
    /** A procedure turn; courseMag is the outbound course of the turn */
    PI: (fix: Fix, courseMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.PI, fixIcaoStruct: icaoOf(fix), course: courseMag, turnDirection: turn, fixTypeFlags: flags}),
```

  Run the test again: it passes. Break each builder once (drop `turnDirection`, pass `LegType.HM`) and see it fail.

- [ ] **Step 4: the boot comment.** Replace the `start` comment in `test/harness/boot.ts` with:

```ts
    /**
     * The fake clock's start. The navdata cycle is DEFAULT_NAVDATA_RANGE (see sim/clock.ts): bootUnit sets the game var
     * FLIGHT NAVDATA DATE RANGE itself, and the SDK caches the cycle for the life of the test file
     * (FacilityLoader.databaseCycleCache), so a start outside that cycle boots with an expired database (DATA BASE OUT
     * OF DATE message, MSG lit). A unit test that needs another cycle clears that cache and sets the game var itself.
     */
```

- [ ] **Step 5: `testing.md`.**
    - Section 3 "Procedures", first bullet: add `Leg.HF`, `Leg.HA`, `Leg.PI` (holds and a procedure turn, same
      arguments as `Leg.HM`) to the list.
    - Section 4 "Render", after the `settle` bullet, a new bullet: **Time to first fix.** `bootUnit({coldGps: true})`
      resets the GPS after a forced acquisition, so every satellite keeps its ephemeris and the last known position is
      the present one: it acquires in about 62 s (slow) whatever the almanac, the stored position or the clock, and
      cannot measure a cold or warm start. Boot with `engineRunning: false` and the stored position, almanac time and
      `fastGpsAcquisition` in `storage`, then `powerOn()`; the GPS acquires while the welcome and self-test pages run.
    - Section 6, a new bullet: **Long render tests need their own timeout.** The render stage keeps Vitest's 5 s default.
      A test that advances minutes of simulated time with every tick running can pass alone and time out while other
      suites load the machine, which makes a mutation run report a false kill. Give such a test a per-test timeout
      (`VolatileMemory.test.ts` CAL 6, `power.test.ts`).
    - Section 6, the bullet "SDK upgrades may require updating the fakes": add that `KLNGPSSatComputer` reads private
      fields of `GPSSatComputer` and the shape of `activeSimulationContext` (`channels`, the almanac time
      `lastAlamanacTime`), and that SDK 2.3.3 moved `simTime` and `distanceFromLastKnownPos` into
      `activeSimulationContext` without a type error (the reads go through `as any`); after an upgrade run
      `test/render/GpsAcquisition.test.ts` first (task 4 adds it).

- [ ] **Step 6: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/data/VolatileMemory.test.ts", "test/harness/navdata/procedures.ts", "test/unit/harness/procedures.test.ts", "test/harness/boot.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["CAL 6 tests have a 20 s per-test timeout", "Leg.HF/HA/PI exist with HM's signature and a harness test of every option", "BootOptions start comment corrected", "testing.md documents coldGps hot start, long-test timeout, Gps SDK internals, the builders", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 1: the loader, the repository and Database

**Goal:** Tests for `KLNFacilityLoader`, `KLNFacilityRepository` and `Database`, the pins `#NEW-1-1` and `#NEW-1-2`,
and the `Set0Page` row that freezes `#NEW-1-2` turned into a pin.

**Files:**
- Modify: `test/unit/data/navdata/KLNFacilityLoader.test.ts` (append; the existing test unchanged)
- Create: `test/unit/data/navdata/KLNFacilityRepository.test.ts`
- Create: `test/unit/data/navdata/Database.test.ts`
- Modify: `test/render/pages/left/Set0Page.test.ts:41-42`

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] User waypoints in the nearest lists are a spec test citing 5-45; the `removed` bookkeeping stays a
      characterization.
- [ ] `#NEW-1-1` and `#NEW-1-2` turn red under their fixes; each has a passing sibling.
- [ ] `Set0Page.test.ts` no longer asserts the four-digit year: the row is a `#NEW-1-2` pin, and the rest of the
      snapshot stays a characterization.
- [ ] The dump-response characterization carries the comment `// a second KLN 90B in one aircraft: #NEW-1-3`.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-A.md` sections 1 to 3. Copy
  `research\drafts-A\test\unit\data\navdata\{KLNFacilityLoader,KLNFacilityRepository,Database}.test.ts` to the same
  paths (the loader draft is the existing file with the new tests appended). Rename `#NEW-A-1` to `#NEW-1-1` and
  `#NEW-A-2` to `#NEW-1-2`.

- [ ] **Step 2: the loader** (`research-A.md` section 1, the table "Proposed tests"). Keep the drafts with these
  labels and literals:
    - numbers before letters across both sources (3-21): user K98, KAAF and database K99, KAAB; Airport search `K` →
      `K98 A XX, K99 A, KAAB A, KAAF A XX`.
    - a user waypoint of each type found only by the search of its type, `it.each` of six (3-21, 3-14).
    - found by the start of its ident, not by a match inside it (3-14): XAB, AB, ABC, A; User `AB` → `[AB, ABC]`.
    - every user match beyond `maxItems` (characterization).
    - Duplicate Waypoint, exact ident from both sources, nearest first (3-15): at N47 E8, user VOR D (47.1), database
      NDB D (47.5), INT D (49), VOR DA → `D V XX, D N K1, D W K1`; and nothing for an ident that only begins another.
    - same ident and type in both sources, each by its own ICAO (characterization).
    - `getFacility` rejects an unknown ICAO (characterization; it is the sibling of the pin).
    - **Pin `#NEW-1-1`**: `tryGetFacility(VOR, unknown)` resolves to null and `getFacilities([abc, unknown])` to
      `[abc, null]` (contract: the SDK `FacilityClient` interface). Fix: `.catch(() => null)` on the database call in
      `_tryGetFacility` (`KLNFacilityLoader.ts:406-412`).
    - **Change from the draft:** split the nearest-session test in two.
        - `merges user waypoints into the nearest VOR list (5-45)`: database DBV 47.1, user USV 47.2, radius 200 NM →
          `added` holds both. 5-45 says the nearest functions work with user-defined waypoints. Break: the repository
          session left out of the merge.
        - `reports a deleted user VOR as removed (characterization)`: then `{}`, remove USV → `{removed: [USV]}`.
    - SET 3 criteria on user airports, four cases (3-22, 3-23): UHRD 3000 ft asphalt, USFT 3000 grass, USHT 1900
      asphalt, UNEW length -10 → HRD 2000 `[UHRD]`; HRD SFT 2000 `[UHRD, USFT]`; HRD 1800 `[UHRD, USHT]`; HRD SFT 1000
      `[UHRD, USFT, USHT]`.

- [ ] **Step 3: the repository** (`research-A.md` section 2). New file; `beforeEach` clears the singleton, makes a new
  bus and collects the sync topic.
    - holds 250 and refuses the 251st (2-8, C-2).
    - temporary waypoints count toward the 250 (5-22, 5-26): 249 `XX` and one `XY`, the next `XX` add throws.
    - one sync event per change, Add, Update and Remove (characterization).
    - found at its new position after an update (characterization).
    - refuses to update a database waypoint (characterization).
    - one waypoint after re-adding the same ICAO (characterization).
    - forgets a removed waypoint everywhere (characterization).
    - keeps a database ident apart (characterization).
    - answers another instrument's dump request (characterization), with the comment
      `// a second KLN 90B in one aircraft: #NEW-1-3`.

- [ ] **Step 4: Database** (`research-A.md` section 3). New file; `beforeEach` clears `databaseCycleCache` and resets
  the sim; the game var `MAY14JUN11/26`.
    - current from 14 MAY 00:01 through 10 JUN 23:59 (2-3).
    - out of date from 11 JUN 00:01 and on 2027-01-01 (2-3).
    - judges the GPS time when no time is given (characterization).
    - the expiry date is the last valid day (2-4, 3-7): starts with `10 JUN`.
    - **Pin `#NEW-1-2`**: the expiry string is `'10 JUN 26'` (figures 2-4, 3-24, 3-25). Fix: `{YY}` in
      `Database.ts:18`. Sibling: the "last valid day" test.
    - DATA BASE OUT OF DATE posted for a time past the expiry, not for a time inside the cycle (B-2).

- [ ] **Step 5: `Set0Page.test.ts`.** Lines 41-42 assert `'       11 JUN 2026'` inside a characterization. Take that row
  out of the characterization (assert the other rows as before), and add next to it
  `it.fails('shows the database expiry with a two-digit year (3-7, #NEW-1-2)')` asserting the row with `11 JUN 26`.
  Work out the expected padding from the figures 3-24 and 3-25 (the date centered as in the figure) and say in the
  report which column you chose and why. Prove: the `{YY}` fix turns both `#NEW-1-2` pins red; if the padding differs
  after the fix, assert the padding the figure shows and note it in the report.

- [ ] **Step 6: verify and commit.** Run `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/unit/data/navdata/KLNFacilityLoader.test.ts", "test/unit/data/navdata/KLNFacilityRepository.test.ts", "test/unit/data/navdata/Database.test.ts", "test/render/pages/left/Set0Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "user waypoints in nearest lists are a spec test (5-45)", "pins #NEW-1-1 and #NEW-1-2 turn red under their fixes, each with a sibling", "Set0Page four-digit year row is a #NEW-1-2 pin", "dump-response characterization cites #NEW-1-3", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 2: the nearest lists and the scan list

**Goal:** Tests for `NearestList`, `NearestUtils` and `Scanlist`, the NAV 2 terminal-VOR guard, the radius
characterization, and the pins `#NEW-2-1` to `#NEW-2-6`, with `#NEW-2-2` asserting the trainer's behavior.

**Files:**
- Modify: `test/unit/data/navdata/Scanlist.test.ts` (append the drafts of `ScanlistWindow.test.ts`)
- Create: `test/unit/data/navdata/NearestListSurfaces.test.ts`
- Modify: `test/render/data/navdata/NearestList.test.ts` (append the drafts of `NearestListScan.test.ts`)
- Modify: `test/render/pages/right/IntPage.test.ts` (append the drafts of `IntPageRef.test.ts`)
- Modify or create: `test/render/pages/right/Apt1Page.test.ts` (the `#NEW-2-2` pins, see step 5)

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The pins `#NEW-2-1` to `#NEW-2-6` turn red under their fixes; each has a passing sibling.
- [ ] `#NEW-2-2` asserts the successor and the predecessor of the last waypoint the ident entry matched, not of the
      typed ident, citing 3-21 and the KLN 89 trainer.
- [ ] The NAV 2 test shows the nearest low or high VOR, not a nearer terminal one (3-8, 3-32), and fails when Terminal
      joins the list mask.
- [ ] The radius characterization carries the comment `// the radius is a question: #NEW-2-7`.
- [ ] The #39 tests of `Apt1Page.test.ts` are unchanged and still pass.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-B.md` sections 0 to 4. The drafts are in
  `research\drafts-B\test\…`. Merge them into the existing files the Files list names (one `describe` per draft file
  where that reads better), and rename `#NEW-B-n` to `#NEW-2-n`.

- [ ] **Step 2: nearest lists** (`research-B.md` 3.1 to 3.8).
    - puts the nearer NDB first after the aircraft moved (3-22): NAA 47.05 N, NBB 46.9 N, aircraft 47.0/8.0, then
      46.92 → `[' NBB   nr 1', ' NAA   nr 2']`. Break: the sort removed.
    - holds nine NDBs, the user NDB first (3-22, 5-45): NA0..NA8 from 47.05 N 0.05° apart, user QQ (XX) 47.01 N →
      `QQ nr 1`, `NA0 nr 2` … `NA7 nr 9`. Break: `slice(0, 10)`.
    - updates the distance within seconds (3-22): NDB page, NBB at nr 2, aircraft to 46.92, 1.5 s later row 6 is
      `'      1.2nm'`. Break: no `updateBearingDistance` between searches.
    - the nearest radius (characterization, with `// the radius is a question: #NEW-2-7`): an airport 450 NM away is
      `nr 1` when nothing is nearer. Break: radius 200 NM.
    - SET 3 surfaces (unit, `NearestListSurfaces.test.ts`, 3-23): every hard surface with HRD and HRD SFT, every soft
      surface with HRD SFT and none with HRD, the KMIX airport with an 800 ft asphalt and a 3000 ft grass runway.
      **Pin `#NEW-2-5`**: snow counts as soft (fix: `Snow` in the soft list, `NearestList.ts:168-191`). Keep the unit pin
      only (the research drafted a render copy too; leave it out).
    - VOR classes: **pins `#NEW-2-4`** (three: a terminal VOR listed, an undefined-class VOR listed, a terminal VOR drawn
      on Super NAV 5 with `VOR: TLH`; 3-22, 3-49, 3-37). Fix: Terminal and Unknown in the list mask of
      `NearestList.ts:206-210`. Sibling and guard: `shows the nearest low or high altitude VOR on NAV 2, not a nearer
      terminal VOR (3-8, 3-32)`, NAV 2 rows 3-4 `['HIG  180°fr', '     18.0nm']`.
    - **Pins `#NEW-2-6`** (3-50): INT REF takes a closer user VOR (`'REF:  QQV  '`), and the nearest VOR list lists a
      user VOR. Fix: both causes together (`KLNFacilityLoader.ts:175` with `BitFlags.createFlag`, and the nearer of the
      added results in `NearestUtils.getNearestVor`). Siblings: `takes the closest VOR` and `takes a closer terminal VOR`
      (3-50).

- [ ] **Step 3: the scan list** (`research-B.md` 3.10).
    - scans from K98 to KAAF and back (3-21).
    - the nearest list in front of the complete list on the NDB page (3-22): counterclockwise from the start of the
      complete list `' NCC   nr 3'`; at nr 1 it stays; clockwise from the last nearest the start of the complete list;
      at the end of the complete list it stays on `' ZZN       '`.
    - the user scan list sees a waypoint added after `init` (3-21).
    - the top-speed jumps (characterization).
    - **Pins `#NEW-2-1`** (3-21): 660 intersections, every one shown once clockwise from the first and counterclockwise
      from the last. Fix: `TARGET_CACHE_SIZE = 100000` (one window for everything). Sibling: a list that fits one refill
      scans completely.
    - **Pin `#NEW-2-3`** (3-21): NDBs AA, AB, ABC, ABD; ABC shown; a user waypoint change; counterclockwise → AB. Sibling:
      the same before any change. Fix: refill backwards from the first letter (it also turns #108 red; say so in the
      report).

- [ ] **Step 4: #39.** Run the #39 tests of `Apt1Page.test.ts` against two of their recorded breaks (the `index > -1`
  guard of `scanLeft`, and the removed entry not spliced in `NearestList.ts:91`) and record the result. No change to
  them.

- [ ] **Step 5: `#NEW-2-2` with the trainer's expectation.** The research draft asserted the waypoint after the typed
  ident; the KLN 89 trainer scans from the **last waypoint the ident entry matched** (checked in the KLN 89 trainer,
  2026-10-07: clockwise to its successor, counterclockwise to its predecessor). Write it at the render stage on APT 1:
    - World: airports KAAA, KBBB, KCCC, KDDD (invented, a few NM apart).
    - Enter `KCZ` with `unit.panel.enterIdent('R', 'KCZ')` (the entry matches KCCC at `KC`, then nothing at `KCZ`),
      cursor off, then one inner click clockwise (scan pulled, as `Apt1Page.test.ts` scans).
    - Passing sibling: after `KC` the page shows KCCC (the last match), and after `KCZ` it shows the CREATE NEW WPT
      state; read what the page shows and assert it.
    - `it.fails('scans clockwise to the waypoint after the last match (3-21, #NEW-2-2)')`: `KDDD`.
    - `it.fails('scans counterclockwise to the waypoint before the last match (3-21, #NEW-2-2)')`: `KBBB` (scanning from
      the typed ident would give KCCC, so this case tells the two readings apart).
    - Before writing the pins, run the two scans on the unchanged code and record what they show. If either already
      passes, it is a spec test, not a pin; say so in the report.
    - Prove: a temporary change that makes the scan start from the last matched waypoint turns the pins red. Describe the
      change in the report (it lives where the waypoint page keeps its facility, `WaypointPage.tsx`).
    - Keep the research's unit draft for `findClosest` only if it asserts something the trainer result still supports;
      otherwise leave it out and say why.

- [ ] **Step 6: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/unit/data/navdata/Scanlist.test.ts", "test/unit/data/navdata/NearestListSurfaces.test.ts", "test/render/data/navdata/NearestList.test.ts", "test/render/pages/right/IntPage.test.ts", "test/render/pages/right/Apt1Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "pins #NEW-2-1..6 turn red under their fixes, each with a sibling", "#NEW-2-2 asserts the trainer's last-match behavior", "NAV 2 terminal-VOR guard fails when Terminal joins the list mask", "radius characterization cites #NEW-2-7", "#39 tests unchanged and passing", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 3: KLNMagvar, BoundaryUtils and AirspaceAlert

**Goal:** Tests for `KLNMagvar`, `BoundaryUtils` and `AirspaceAlert` with the airspace message classes, the pins of
#189 and #190 with their siblings, and the pin `#NEW-3-1`; the circle gap stays documented and cites `#NEW-3-2`.

**Files:**
- Create: `test/render/data/navdata/KLNMagvar.test.ts`
- Modify: `test/render/data/navdata/AirspaceAlert.test.ts` (append the drafts of `AirspaceAlertSpec.test.ts`)
- Modify: `test/unit/data/navdata/BoundaryUtils.test.ts` (append the drafts of `BoundaryUtilsGeometry.test.ts`)
- Create: `test/unit/data/navdata/AirspaceAlert.test.ts` (the type names, from `AirspaceTypeName.test.ts`)
- Modify: `test/unit/harness/airspaces.test.ts:180` (a comment only)

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The #189 pin and the two #190 pins turn red under their temporary fixes; each has passing siblings for the setup.
- [ ] `#NEW-3-1` turns red under its fix.
- [ ] No circle pin is committed; `airspaces.test.ts:180` keeps its assertion and gains the comment
      `// circular airspaces are not implemented: #NEW-3-2`.
- [ ] `BoundaryUtils` tests say in the file that the expectations are hand-computed in the lat/lon plane.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-C.md` sections 1 to 3. The drafts are in
  `research\drafts-C\test\…`. Leave out every circle test (`#NEW-C-2`: the unit pair and the render pin). Rename
  `#NEW-C-1` to `#NEW-3-1`.

- [ ] **Step 2: KLNMagvar** (`research-C.md` section 1; render, `bootUnit({magvar: 10})`).
    - MAGNETIC VAR INVALID at S 60.5, not at S 59.5 (3-1, 5-44, B-2); the negative case also asserts the list is live.
    - the track true outside the area (5-44): settle at N 73.5, track 090 at 120 kt, NAV 3 `'TK     080°'`, then N 74.5:
      `'TK     090°'`.
    - the track with the pilot's variation (5-44): `navPage.userMagvar = 5` → `'TK     085°'`, no message (it writes the
      store SET 2 writes; the SET 2 editor is Session 8).
    - forgets the pilot's variation once back inside the area (characterization).
    - **#190 pins** (5-44): `kaaa` N 73.0, `kfar` N 75.0 on one meridian, FPL 0 `[kaaa, kfar]`, aircraft N 73.5,
      `ObsSource 0`, world 10 E, `unit.panel.obsMode()` and 2 s.
        - siblings: no message in Leg mode inside the area; the switch to OBS with KFAR active (ENR_OBS, the leg due
          north).
        - `it.fails('shows MAGNETIC VAR INVALID in OBS mode (5-44, #190)')`.
        - `it.fails('chooses the OBS course referenced to true north (5-44, #190)')`: `navPage.obsMag` close to 0.
        - Fix: in `isMagvarValid`, false in ENR_OBS and ARM_OBS when the active waypoint is above 74 or below -60
          (`research\drafts-C\proof-190.json`).

- [ ] **Step 3: BoundaryUtils** (`research-C.md` section 2; unit). Header comment: the expectations are hand-computed in
  the lat/lon plane, the plane the code works in; cases keep 0.1° from the edges, crossings sit on meridian edges.
    - `isInside` on a U open to the north, on a diamond with corners on 47.5 N, on a triangle (characterization, with
      independent expectations; no manual page).
    - `intersects` on the U.
    - `getIntersections` on the triangle as a set of points rounded to 0.001: `['47 8.5', '47.5 8.5']`, `['47.5 8.5']`,
      `['47.5 9']`, `[]`.
    - **Pin `#NEW-3-1`**: `returns each crossing point once`: the meridian path gives two points. Fix:
      `for (current = 0; current < lod.length - 1; current++)` with `next = current + 1` (`BoundaryUtils.ts:121-122`).
      Sibling: the set test above.

- [ ] **Step 4: AirspaceAlert** (`research-C.md` section 3; render). Aircraft 47 N 8 E, 1200 ft, `moveAircraft` at
  120 kt, then 12 s; limits 1000-18000 ft; `sua(unit)` = the MSG entries containing `AIRSPACE`, joined per message.
  Every row of the table "Proposed tests" except the circle pin, with its label as the table gives it:
    - spec rows: alerts 5 minutes before (3-40, B-1); the name, type and limits on the MSG page (3-39, figure 3-125);
      none 15 minutes before (3-40, B-1); none for an area whose floor is above (3-39); alerts when the track turns
      toward an area 1 NM away (3-40, B-1; the #189 sibling); INSIDE once in the area (3-40); the 3-41 buffer example
      (4100 inside, 3900 not); 300 ft below the floor with the default buffer (3-41); the AGL floor (3-39, figure 3-126);
      the AGL ceiling (3-39); every altitude inside without an altitude input (3-40); alerts inside a MOA (3-39); none
      inside a Class D (3-39); none with SET 8 disabled (3-41); none with the approach armed, none with it active, each
      with its ENR_LEG sibling (3-41).
    - characterizations: once over two searches; again after turning away and back; INSIDE removed once the aircraft
      left; INSIDE once over two searches; INSIDE again on a second entry; the long name cut; the `ABOVE` text.
    - **#189 pin**: `it.fails('alerts on a track along an area 1 NM away (3-40, B-1, #189)')`, area R-BESIDE with its
      west edge 1 NM east, track 000. Fix: `research\drafts-C\proof-189.json` (also warn when a 2 NM probe in any of 36
      directions crosses the boundary).
    - Unit, `AirspaceAlert.test.ts`: the type names of the nine SDK types (3-39), `it.each`.

- [ ] **Step 5: the circle gap.** Add `// circular airspaces are not implemented: #NEW-3-2` above the assertion at
  `test/unit/harness/airspaces.test.ts:180`. Do not change the assertion.

- [ ] **Step 6: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/data/navdata/KLNMagvar.test.ts", "test/render/data/navdata/AirspaceAlert.test.ts", "test/unit/data/navdata/BoundaryUtils.test.ts", "test/unit/data/navdata/AirspaceAlert.test.ts", "test/unit/harness/airspaces.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#189 and #190 pins turn red under their fixes, with siblings", "#NEW-3-1 turns red under its fix", "no circle pin; airspaces.test.ts:180 cites #NEW-3-2", "BoundaryUtils tests state the lat/lon plane method", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 4: Gps.ts

**Goal:** Tests for `Gps.ts` and `KLNGPSSatComputer`: acquisition from cold and warm, the almanac, persistence, the
thresholds of the two GPS messages, the clock while invalid, the 2 kt track limit, FAST acquisition, a non-empty channel
list, the STA 1 state as a characterization, and the pins `#NEW-4-1` (three) and `#NEW-4-2`.

**Files:**
- Create: `test/render/GpsAcquisition.test.ts`
- Modify: `test/render/Gps.test.ts` (the #61 test: `toHaveLength(8)`; the 2 kt tests)

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The three `#NEW-4-1` pins turn red with the fix of `research-D.md` section 0 (fix 1 and 2); `#NEW-4-2` turns red
      with that fix plus `almanacExpireTime` at 182 days; each has a passing sibling.
- [ ] The cold-start lower bounds are 180 s, not 120 s.
- [ ] The #61 test asserts eight channels, so an empty channel list fails it.
- [ ] The STA 1 snapshot is a characterization with the comment `// the receiver states are a question: #NEW-4-5`.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the draft.** Read `research-D.md` sections 0 to 2. Copy
  `research\drafts-D\test\render\GpsAcquisition.test.ts` to the same path. Rename `#NEW-D-1` to `#NEW-4-1` and
  `#NEW-D-2` to `#NEW-4-2`. The probes in `drafts-D\probes\` are not tests; leave them out.

- [ ] **Step 2: acquisition** (`research-D.md` 2.1; setup `bootUnit({engineRunning: false, storage: WARM})`, then
  `powerOn()`; `WARM = {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload:
  DEFAULT_START - 1 day}`; a 1 s loop measures the time to `isValid()`).
    - **Pins `#NEW-4-1`** (3-17, 3-8, install manual 2-66): a warm start is NAV ready within 300 s; it shows
      `'STATE   ACQ'` on STA 1 after the self-test; `gpsSatComputer.isAlmanacValid()` is true 5 s after power-on (the SDK
      tripwire). Fix: read `activeSimulationContext.time` and compute the distance from
      `activeSimulationContext.position` and `lastKnownPosition` (fix 1), and set `gpsSatComputer.internalTime` in
      `powerChanged` after the off time is added (fix 2).
    - Sibling: a start 3000 NM off shows `'STATE  INIT'` after the self-test (characterization, with
      `// the receiver states are a question: #NEW-4-5`).
    - Spec (3-5, 3-17; install manual 2-66): 3000 NM off, an almanac 200 days old, and a clock 15 minutes behind are each
      not ready at **180 s** (changed from the draft's 120 s: 3-17 gives "usually about six minutes" for these cases, and
      the warm start measures 119 s with the fix, so 180 s leaves margin both ways), and ready within 720 s. Break:
      `isAlmanacValid` always true.
    - **Pin `#NEW-4-2`** (3-17: six months): an almanac 120 days old is a warm start (< 300 s). Fix: the fix of
      `#NEW-4-1` plus `almanacExpireTime` at 182 days. The issue references `#NEW-4-1`; say in the test comment that the
      pin can turn red only together with that fix.

- [ ] **Step 3: the rest of the draft** (`research-D.md` 2.2 to 2.8), with the labels the report gives:
    - saves the time of the last almanac download at power-off (3-17).
    - eight channels (5-29): none in use before power-on, eight 5 s after. Also add `toHaveLength(8)` to the two
      `every()` checks of the #61 test in `Gps.test.ts`.
    - the 2 kt limit (3-32, 3-35): in `Gps.test.ts`, the jump 47/8 to 47.1/8.1 with magvar 4: at 2 kt NAV 3 row 2
      `'TK     030°'`, at 1.9 kt `'TK     ---°'`.
    - the clock runs on while the GPS searches (3-53).
    - SYSTEM TIME UPDATED TO GPS TIME at 15 minutes behind, not at 5 (B-4).
    - POSITION DIFFERS FROM LAST POSITION BY >2NM at 2.5 NM, not at 1.5 NM, and after a 3 NM move while off, not without
      a move (B-3).
    - saves the position at power-off (3-17); saves it within 60 s while powered (characterization).
    - DATA BASE OUT OF DATE when the GPS date overrides a pilot date (B-2), listed once 5 s after the fix; keep the
      draft's comment that ties the assertion to #175.
    - FAST acquisition NAV ready within 30 s (characterization); FAST chosen on SET 10 during the slow search gives a fix
      within 2 s (characterization).
    - the STA 1 snapshot after a force-ready boot (characterization; the tripwire for the SDK satellite shape), with the
      `#NEW-4-5` comment.

- [ ] **Step 4: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/GpsAcquisition.test.ts", "test/render/Gps.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "three #NEW-4-1 pins and #NEW-4-2 turn red under their fixes, with siblings", "cold-start lower bounds are 180 s", "#61 test asserts eight channels", "STA 1 snapshot is a characterization citing #NEW-4-5", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 5: the page tree and the cursor

**Goal:** Tests for `PageTreeController` and `CursorController`, the walk fix of two existing tests, the ACT group
memory, and the pins `#NEW-5-1`, `#NEW-5-2` (unit and render) and `#NEW-5-3`.

**Files:**
- Create: `test/unit/pages/PageTreeController.test.ts`
- Modify: `test/render/pages/PageTreeController.test.ts` (append the drafts of `PageTreeKnobs.test.ts`; the `walk`
  helper)
- Modify: `test/render/harness/selectPage.test.ts` (the `PAGE_CYCLES` loop)
- Create: `test/unit/pages/CursorController.test.ts`
- Modify: `test/render/pages/left/Set2Page.test.ts` (append the drafts of `Set2Cursor.test.ts`)

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The slot-class test fails when one slot class extends another (`Oth10Page extends Oth9Page`).
- [ ] After the walk fix, the existing walks fail when the last page of a group gets stuck and when the inner knob does
      not wrap forward.
- [ ] The ACT group memory is a spec test citing the KLN 89 trainer: returning to ACT shows ACT 1.
- [ ] The cursor wrap is the `#NEW-5-3` pin (it stops at the first and the last field), not a characterization.
- [ ] `#NEW-5-1`, `#NEW-5-2` and `#NEW-5-3` turn red under their fixes; each has a passing sibling.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-E.md` and `research\trainer.md` Q1 and Q4. The drafts are in
  `research\drafts-E\test\…`. Rename `#NEW-E-1` to `#NEW-5-1` and `#NEW-E-2` to `#NEW-5-2`.

- [ ] **Step 2: tree structure** (unit; `research-E.md` P1).
    - every slot has its own class and none is a subclass of another, left and right (the `CLAUDE.md` rule that a slot
      is found by `instanceof`; no manual page, cite `CLAUDE.md`). Break: `Oth10Page extends Oth9Page`.
    - the group sizes: left `[7, 2, 26, 5, 7, 5, 11, 10]` (3-12; SET has the fictitious SET 10), right
      `[2, 1, 1, 4, 5, 8, 1, 1, 1, 1]` (3-13).

- [ ] **Step 3: knobs** (render; `research-E.md` P2 to P4).
    - group memory (3-12, 3-13): left CAL 5 → STA → back is CAL 5; right D/T 3 → NAV 1 → back is D/T 3; the start page
      counts as viewed (3-8). Break: `movePage` opens every group on its first page.
    - NAV 2 after a direct-to put NAV 1 on the right (3-28, 3-12): inner +1 is NAV 2.
    - `+` sub-pages (3-9, 3-10, 3-44): APT 2 → the APT 3 diagram → the APT 3 list → APT 4; backwards into the list and the
      diagram (characterization).
    - page names: five characters for every slot, prefixes and numbers per 3-9, 3-12, 3-13; `SET10` and `"ACT  "` are
      characterizations.
    - **Pin `#NEW-5-1`**: `names the REF page with five characters`. Fix: `"REF  "` in `RefPage.tsx:36`.
    - **ACT group memory** (spec, "checked in the KLN 89 trainer (2026-10-07)"): with an active waypoint, ACT → inner to
      ACT 3 → outer to another group → back: ACT 1. Use the world of `test/render/HEvents.test.ts` "right inner knob on
      the ACT pages (3-13)". Break: a controller that remembers the ACT sub-page.

- [ ] **Step 4: the walk fix.** Apply `research\drafts-E\walk-wrap.patch` by hand with the Edit tool (it carries LF
  lines): `walk` in `test/render/pages/PageTreeController.test.ts` returns on the wrap and throws otherwise;
  `PAGE_CYCLES` in `test/render/harness/selectPage.test.ts` pushes the wrap and expects `[...cycle, cycle[0]]`. Prove:
  `Oth10Page extends Oth9Page` fails two #90 walks, and no forward wrap in `moveSubpage` fails every `PAGE_CYCLES` case.

- [ ] **Step 5: the cursor** (unit, synthetic page; `research-E.md` item 6). Keep the draft tests 1 to 3 and 5 to 9 with
  the labels the report gives (field order, read-only skipped, 3-11, the entered field, the inner knob, 4-3 memory, the
  list cases, ENT).
    - **Change from the draft:** test 4 (the wrap) becomes the pin `#NEW-5-3` (4-3; checked in the KLN 89 trainer,
      2026-10-07: the cursor stops at both ends):
        - `it.fails('stays on the last field when turned further clockwise (4-3, #NEW-5-3)')`: from `c` clockwise is
          `c`.
        - `it.fails('stays on the first field when turned further counterclockwise (4-3, #NEW-5-3)')`: from `a`
          counterclockwise is `a`.
        - Sibling: the clockwise and counterclockwise walks inside the list (`a` → `b` → `c`, `c` → `b` → `a`).
        - Fix: no wrap in the outer-knob handlers of `CursorController` (clamp at both ends).
    - **Pins `#NEW-5-2`** (unit, two): a field under the cursor turning read-only; the clamp of `CursorController.ts:123`.
      Fix: `Math.min(this.cursorField, fields.length - 1)` and a clamp in `getCurrentFocusedField()`.

- [ ] **Step 6: SET 2** (render; `research-E.md` "Render, SET 2"). The sibling (3-53: the date and time read-only after
  the fix, the cursor reaches the zone, no errors) and the two `#NEW-5-2` pins (the cursor on again on the same page
  after the fix; the cursor left on the time while the fix comes). Each pin takes the expected rejections or errors with
  `unit.takeRejections()` where the harness requires it; the sibling holds the setup.

- [ ] **Step 7: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/unit/pages/PageTreeController.test.ts", "test/render/pages/PageTreeController.test.ts", "test/render/harness/selectPage.test.ts", "test/unit/pages/CursorController.test.ts", "test/render/pages/left/Set2Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "slot-class test fails on a subclass slot", "walks fail on a stuck last page and a missing forward wrap", "ACT group memory spec test citing the KLN 89 trainer", "cursor wrap is the #NEW-5-3 pin", "#NEW-5-1..3 turn red under their fixes, with siblings", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 6: SidStar and the placement in FPL 0

**Goal:** Tests for the `SidStar` conversion paths Session 3b left and for the placement of procedures in FPL 0 by APT 7
and APT 8, FPL FULL during a load as a characterization, and the pin `#NEW-6-1`.

**Files:**
- Modify: `test/unit/data/navdata/SidStar.test.ts` (append the drafts of `SidStarS7.test.ts`; the amendment diff)
- Modify: `test/render/pages/right/Apt7Page.test.ts`, `test/render/pages/right/Apt8Page.test.ts` (the placement)

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The drafts use `Leg.HF`, `Leg.HA` and `Leg.PI` of task 0 instead of their local `legOf` helper.
- [ ] `#NEW-6-1` turns red under its fix and has a passing sibling; no `#NEW-6-2` pin is committed.
- [ ] APT 8 replacing an old approach, the APT 8 REDUNDANT WPTS message, a STAR before an existing approach and a SID
      whose airport is not in FPL 0 each have a render test citing their page.
- [ ] FPL FULL during an approach load is a characterization with the comment `// a question: #NEW-6-3`.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Read `research-F.md` sections 1 to 4 and `research\trainer.md` Q3. Merge
  `research\drafts-F\test\unit\data\navdata\SidStarS7.test.ts` into `SidStar.test.ts` (its own `describe` blocks), and
  apply `SidStar.test.ts.amend.diff` (the recalculated arc keeps its `endFacility`). Replace `legOf(LegType.HF, …)` and
  its siblings by `Leg.HF`, `Leg.HA` and `Leg.PI`. Rename `#NEW-F-1` to `#NEW-6-1`. Leave out the `#NEW-F-2` pin.

- [ ] **Step 2: the conversion** (`research-F.md` section 2, the table "Draft tests"), with the labels it gives:
    - the approach header for VOR, VOR/DME, NDB, NDB/DME, RNAV (6-5, figures 6-8 and 6-24, 3-49); GPS as R, runway 09
      padded, circling and suffix forms (characterization).
    - the approach legs in order with fix types (6-4, 6-5, 6-6, 6-7); every leg APP with parent and header (6-5, 6-7);
      the EFB fields (contract: the EFB route sync); final and missed alone (characterization).
    - `askObs` at HA, HF, HM, PI and not at FAF or MAP (B-2, 6-10, 6-14); at a hold after a TF to the same fix (same
      pages); fly-over (characterization); MAP and MAHP at one fix (characterization); IAF and FAF on one leg
      (characterization).
    - the three-arc merge (6-18, 6-16, 6-1); an arc ending at the FAF keeps it (6-6, 6-7); the arc entry referenced to
      the VOR (characterization).
    - the RF and enroute-transition filters (characterization).
    - SID and STAR order, types and headers (6-21, 6-22, 6-23, figures 6-35 to 6-43); a SID without a runway part
      (6-22); a STAR runway part (characterization); the EFB fields (contract).
    - `getVorIfWithin30NMOfArc` (3-32, 6-18).
    - **Pin `#NEW-6-1`** (B-2, 6-10): `it.fails('asks for OBS at an IAF whose hold follows it as a separate leg
      (#NEW-6-1)')`, transition `[Leg.IF(hldaa, FixTypeFlags.IAF), Leg.HF(hldaa, …)]`: HLDAA once, IAF, `askObs`
      true. Fix: when an unflagged HA, HF, HM or PI leg is dropped as a repeat of the last kept leg, give the kept leg its
      type (`SidStar.ts:414-415`; `research\drafts-F\apply-fix.mjs 1`). Sibling: the passing test of the common shape
      `TF X` then `HF X (IAF)`.

- [ ] **Step 3: the placement in FPL 0** (render; `research-F.md` "Placement in FPL 0"; no drafts). Use the setups of
  `Apt7Page.test.ts` and `Apt8Page.test.ts` and `approachWorld()`:
    - APT 8 replaces an approach already in FPL 0 (6-7): load one approach, then another; FPL 0 holds only the second.
      Break: `removeProcedure(APP)` at `Apt8Page.tsx:201` skipped.
    - APT 8 posts REDUNDANT WPTS IN FPL when an en-route waypoint is also in the approach (6-5): the exact message in the
      message list. Break: the check at `Apt8Page.tsx:219` skipped.
    - a STAR goes in before an approach already in FPL 0 (6-23). Break: `Apt7Page.tsx:442`.
    - a SID whose airport is not in FPL 0 puts the airport in first (6-22). Break: `Apt7Page.tsx:426`.
    - FPL FULL during an approach load (characterization, `// a question: #NEW-6-3`): FPL 0 filled so that fewer legs
      remain than the approach has; assert what FPL 0 holds and the message the unit shows. The 89 has no 90B answer
      (`research\trainer.md` Q3), so assert today's behavior without a citation.

- [ ] **Step 4: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/unit/data/navdata/SidStar.test.ts", "test/render/pages/right/Apt7Page.test.ts", "test/render/pages/right/Apt8Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "drafts use Leg.HF/HA/PI", "#NEW-6-1 turns red under its fix with a sibling; no #NEW-6-2 pin", "four placement render tests with citations", "FPL FULL characterization cites #NEW-6-3", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 7: issues and close-out

**Goal:** File the issues and comments, replace every placeholder, correct `CLAUDE.md`, update `testing.md`, write
the session log and tick the checkbox.

**Files:**
- Modify: every test file that holds a `#NEW-` placeholder
- Modify: `CLAUDE.md` (the `SidStar` bullet)
- Modify: `docs/testing.md` (sections 6 and 7)
- Modify: `docs/test-coverage.md` (the Session 7 checkbox and result; the session log)
- Modify: `docs/superpowers/plans/2026-10-07-session-7-navdata.md` (the task checkboxes)

**Acceptance Criteria:**
- [ ] Every row of the placeholder table is an issue (or, where a search finds it, a comment on the existing issue),
      each searched first in open and closed issues with several wordings.
- [ ] #133 and #90, #190 and #175 have the comments the spec lists.
- [ ] `grep -r "#NEW-" test/` prints nothing.
- [ ] `CLAUDE.md` says `SidStar` filters procedures with RF legs or RNP AR.
- [ ] `testing.md` sections 6 and 7 carry the fragile spots and gaps the spec lists.
- [ ] The session log has the coverage at the start and the end, the bugs filed, the rulings and the "not covered" list
      (rule 18).
- [ ] `npm test` and `npx tsc --noEmit` pass.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [ ] **Step 1: issues.** Runs in the main checkout on the session branch (GitHub access). For each row of the
  placeholder table: search open and closed issues (`mcp__github__search_issues`, repo `falcon71/kln90b`) with at least
  three wordings; file a new issue with the label the table gives (`bug`, `question`, `enhancement`) per `CLAUDE.md`
  "Bugs go to GitHub issues": what is wrong, the reproduction with observed and expected values, the file and line, the
  impact, a suggested fix, and the test that pins it. Cite manual pages; never copy manual text. Each issue also names
  its research source as "found in the headless harness" or "found by reading the code", and the KLN 89 trainer where it
  decided the case. `#NEW-2-6` references #173; `#NEW-4-2` references `#NEW-4-1`; `#NEW-2-3` mentions #108; `#NEW-2-1`
  and `#NEW-4-4` carry the sim-check caveat; `#NEW-2-7` and `#NEW-6-3` carry the trainer evidence.

- [ ] **Step 2: comments on existing issues.**
    - #133 and #90: the controller prunes the module-level `RIGHT_PAGE_TREE`, which every ACT visit
      (`ActPage.tsx:49`) and every waypoint confirmation (`WaypointConfirmPage.tsx:71`) hand to a new controller, so an
      in-place `splice(7, 1)` would remove one more APT page each time; a fix must copy the tree per controller; the
      condition `!this.props.planeSettings.vfrOnly` at `PageTreeController.ts:139` is inverted against its own comment.
    - #190: the OBS course chosen on the switch is magnetic too (the second pin); 5-35 item 6 (the published variation
      of an active VOR) and 5-44 (true north) conflict for an active VOR outside the area.
    - #175: the reproduction on the GPS path (a pilot date overridden by the GPS lists the message twice at the fix).

- [ ] **Step 3: replace the placeholders** in one commit (`references #…` for every issue), and check
  `grep -r "#NEW-" test/` prints nothing.

- [ ] **Step 4: `CLAUDE.md`.** In "Architecture in brief", the `SidStar.ts` bullet: "converts SDK procedures to KLN legs
  and filters out procedures with RF legs or RNP AR".

- [ ] **Step 5: `testing.md`.**
    - Section 6: the STA 5 `primary` satellite computer cannot initialize in the harness (its `SharedGlobal` never
      resolves), so STA 5 is untestable as it is; the fake hands out one ICAO object per facility in search results,
      nearest `added`/`removed` and `getFacility`, which hides reference comparisons (`6a6c634`, `NearestList.ts:89`).
    - Section 7: a cloning option for the fake's ICAO values (serves the two reference comparisons; no test of this
      session needed it); `Oth3Page` subscribes to the repository sync and never unsubscribes; the dead `fields` array
      of the `CursorController` constructor; take-home mode is unsupported and untested, by the maintainer's decision.
    - Replace the Session 5 note on the open trainer questions if this session answered any of them (it did not:
      #146 and #147 stay).

- [ ] **Step 6: the session log** in `docs/test-coverage.md` section 4, newest first, in the format of the Session 6
  entry: Done (per task), Rulings (the maintainer's and the controller's), Trainer results, Bugs found and filed (one
  line per issue with its pin), Fixes that could not be re-broken, the unheld code the research found (the survivor
  counts of the spec), Not covered (rule 18; the log-only items of the spec plus each task report's uncovered rest),
  Workflow notes, and the coverage table at the start (`scratchpad\coverage-start.txt`) and at the end (`npm run
  coverage`), plus the suite counts. Tick the Session 7 checkbox and add its "Result" paragraph in section 3.

- [ ] **Step 7: verify and commit.** `npm test`, `npx tsc --noEmit`, `grep -r "#NEW-" test/`, then commit.

```json:metadata
{"files": ["CLAUDE.md", "docs/testing.md", "docs/test-coverage.md", "docs/superpowers/plans/2026-10-07-session-7-navdata.md"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["every placeholder row filed or commented after a search", "comments on #133/#90, #190, #175", "no #NEW- left in test/", "CLAUDE.md SidStar wording corrected", "testing.md sections 6 and 7 updated", "session log complete with coverage and rule 18", "suite green"], "modelTier": "frontier"}
```

---

## Execution notes for the controller

- Dispatch task 0 alone; merge it; then tasks 1 to 6 in parallel, each told the session branch's head after the merge.
- Reviewers: Opus for tasks 4 and 6, Sonnet for the others; re-reviews on Sonnet. Each reviewer runs the mutation pass
  in the task's worktree, checks every page citation against the page index, and treats a breach of the test rules as
  Important (rule 24).
- Merge each approved task into `tests-session-7-navdata`, then run `npm test` and `npx tsc --noEmit` on the result.
- Task 7 runs in the main checkout on the session branch, after tasks 1 to 6 have merged.
- Then the final review of the whole session on the controller's model, then the maintainer's approval; only then the
  worktrees (research and task) and their branches are removed (`cmd //c rmdir <wt>\node_modules` first, then
  `git worktree remove`, then `git branch -d`).
