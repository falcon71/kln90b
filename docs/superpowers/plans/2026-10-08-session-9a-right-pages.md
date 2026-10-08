# Session 9a (pages, right side): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A labeled characterization test for every page under `kln90b/pages/right/`, spec tests where the Pilot's
Guide (or the KLN 89 trainer) gives the rule, and pins for the bugs the research found, each proven to bite; plus the
harness extensions the maintainer chose (the larger task 0).

**Architecture:**
- **Task 0** (harness) runs alone first: the positioned IAF list in `Screen.read()`, the elevation unit of
  `savedUserWaypoints`, the runway ends of `airport()`, `selectPage` for a bare group name, a time zone reply, the
  `dtWorld()` and `centerWorld()` fixtures, a status-line message collector, `focused()` across a plain decimal point,
  and their `testing.md` notes.
- **Tasks 1 to 6** are parallel batches, one per research area (A to F). Each runs in its own git worktree, reset to the
  session branch after task 0 has merged, starts from the research drafts, and ends in one commit (plus one per fix
  round). They share no file.
- **Task 7** files the issues and comments, replaces the placeholders, updates `testing.md` and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the
headless harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-07-session-9a-right-pages-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task. The
  design's rulings, its bug table and its controller's defaults override anything in the research reports.
- **Branches.** The session branch is `tests-session-9-right-pages`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`, which is stale:
    - Before anything else, run `git reset --hard tests-session-9-right-pages` on the (still empty) worktree branch.
    - Check `git log -1`: it must show the session branch's head, which the controller names in the dispatch.
    - If `node_modules` is missing, create it as a junction to `E:\msfs\kln90b\node_modules` (PowerShell:
      `New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules`). Never delete it
      recursively and never run `npm install`.
- **No behavior changes** in `kln90b/` (rule 12). The one exception: task 1 and task 6 correct page citations in code
  comments (named in their tasks). A task that finds it needs a seam stops and reports.
- **Test names** carry the issue where there is one: `'… (#92)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23), with the numbers of the placeholder table below. The research drafts use
  `#NEW-A-n` to `#NEW-F-n`: rename them as the table says. A bug that several tasks pin keeps the one placeholder.
- **Labels** (`testing.md` section 5, rules 6 and 7):
    - A **spec test** cites the Pilot's Guide page in a comment and in its title (or "checked in the KLN 89 trainer,
      2026-10-07", or "a photo of a real unit" with the file name from the reference photo index).
    - A **characterization test** has `characterization` in its `describe` or `it` title and carries no page number, no
      trainer and no photo citation, neither in its title nor in its comments.
    - A **pin** asserts the manual (or the trainer, or the photo) and cites it. Its **passing sibling** is a test like
      any other: it cites the page its preconditions rest on, or it carries `characterization`.
    - A describe whose title says `characterization` holds only characterizations.
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `kln89-guide-index.md`, `reference-photos-index.md`). Cite page numbers, never copy manual text.
    - Before the review, the implementer reports a **per-describe label audit**: every describe and `it` title, its
      label (spec, characterization, pin, sibling) and its page or source.
- **Snapshots never contain a row that shows a pinned bug** (rule 8). These bugs show on many right pages; every
  snapshot avoids them or leaves the row out:
    - `#NEW-1-2`: the builder's default airport name `<IDENT> AIRPORT` reads `<IDENT> AIRPT` (an abbreviation inside a
      word). Give every airport in a snapshot an explicit `name` that no abbreviation of 3-26 touches (research A lists
      the replacements), or leave the name row out.
    - `#NEW-1-3`: a nearest distance below 10 NM. Snapshot nearest views at 10 NM or more.
    - `#NEW-3-6`: the true radial. Boot with `magvar: 0` (and VORs without a magnetic variation) where a radial shows,
      unless the radial is the subject.
    - `#NEW-3-8` and `#NEW-3-9`: the INT and SUP `DIS:` row (leading zeros, full-size `NM`). Leave the DIS row out of
      INT and SUP snapshots.
    - `#NEW-3-13`: a database NDB frequency on a whole kHz shows `.0`. Snapshot NDBs on a half kHz, or leave the
      frequency row out.
    - #223: a duration of `:60`. Use distances and speeds whose times stay clear of a whole hour.
    - #230 and #99: degrees below 10 and minutes near 60. Use positions with two-digit degrees and minutes away from
      `59.99'`.
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts` by hand. Never derive them from the
  code under test or the SDK's flavor of the same formula.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure (screen rows, the message list, the repository), not substrings of a whole screen.
- **Pins.**
    - Every `it.fails` has a passing sibling that asserts its heavy preconditions.
    - A pin is proven by fixing the bug temporarily and seeing the pin turn red, then restoring. The fix is named in the
      research report or in the task below.
- **Proof per test (rule 10).**
    - Break the subject by hand: the break the research report recorded, and at least one break the implementer chooses
      itself.
    - Run the test, see it fail, restore, and check that `git diff` shows only test files.
    - Never commit the broken state.
- **Mutation runs.** A kill that appears only while other suites run in parallel is re-run alone before it counts.
  `vitest -t` takes a regular expression: escape `(`, `)`, `+`, `?` and `#` in a title used as a filter.
- **Commits (rule 22).**
    - One commit per task, plus one per fix round, never amended.
    - The message lists every test as `- <test>: Proof: fails when <break>`, and every pin as
      `- <pin>: Proof: turns red with <fix>`.
    - It ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
    - Write the message with a Bash heredoc or `-m`: PowerShell `Set-Content` writes a byte order mark.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, `docs/testing.md`, `CLAUDE.md`, the harness under
  `test/harness/`, GitHub issues, and other tasks' files. Task 0 is the exception for the harness and `testing.md`, task
  7 for the documents and the issues.
- **Copyright and data.** Never commit manual text, tables or figures, or navdata recorded from the sim or read from a
  navigation database. Facilities are invented. The KLN 89 trainer is cited as "the KLN 89 trainer"; its Chicago and
  Wisconsin waypoints never appear in tests. Short on-screen display strings (`ELV`, `NO SUP WPTS`) are fine; an ordered
  list that mirrors a table of the guide is not (the abbreviation list of 3-26 is tested by a few words, never as the
  full list).
- **Research and scratch.**
    - The session scratchpad is
      `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\2d341c0e-c49c-4d18-b729-eef2126eaea9\scratchpad\`.
    - The reports are `research\research-A.md` to `research-F.md` and `research\trainer.md`; the drafts are in
      `research\drafts-A\test\…` to `research\drafts-F\test\…`, laid out like `test\`. The research worktrees under
      `E:\msfs\kln90b\.claude\worktrees\` hold the same drafts; never edit them.
    - Section 2 of each research report is the per-test table: setup, expected literal, citation, the break that proves
      it, the draft test's name. It is this plan's per-item list; the task below names only what changes.
    - The drafts ran green on the session branch before task 0, but they are starting points, not finished tests.
      Where a draft file is an existing test file with new describes appended, take the appended part and leave the
      existing tests as they are, except where a task says otherwise.
    - Do not copy the research's break lists or mutation ids into test comments.
    - Scratch scripts go only into `scratchpad\task-<N>\`, because the scratchpad is shared (the research round lost
      time to two agents writing the same `mut.sh`).
- **CRLF.** The repo files are CRLF; the drafts carry LF lines. `sed -i` and `perl -i` under Git Bash rewrite edited
  lines as LF, so edit with the Edit tool (or write new files with the Write tool), and check `git diff` for line-ending
  noise before committing.
- **Reports.** Implementers in a worktree write `.task-report.md` at the root of their own worktree (untracked, never
  committed), with the Bash tool (`cat > .task-report.md <<'EOF'`) or the Write tool. The report lists per item the test
  path, spec or characterization, any change of verdict with its reason, every suspected bug with a reproduction, and
  the per-describe label audit. The reply to the controller is only the status, the head commit and concerns.

**User decisions (already made):**
- "Split 9a / 9b": this session takes the right pages, Session 9b the controls.
- The trainer: "Yes, after research" (done; `research\trainer.md`).
- Nearest distances below 10 NM: "90B figures: pin" (`#NEW-1-3`).
- Harness: "Larger task 0".
- The name and city search of 3-24 to 3-26: "Name/City search is not available in the SDK, so it is impossible do this.
  Leave this out."
- 3-24: the cursor-off behavior is correct; only the parked-cursor case is a bug (the maintainer's question, answered
  in the session).
- Design part 1 (scope and tasks): "Yes, it looks right". Part 2 (bugs and rulings): "The rest looks good". "Spec
  approved, please write the plan".

## Placeholders

Each task uses the numbers its rows name. Task 7 files one issue per row (or, where its search finds one, a comment on
the existing issue) and replaces the placeholder everywhere.

| placeholder | research | kind | where it appears |
|---|---|---|---|
| `#NEW-1-1` | A-1 | bug (MILTRY/PRIVAT one cell left, touching the class) | pins, `Apt1Page.test.ts` |
| `#NEW-1-2` | A-2 | bug (name abbreviations inside words) | pins, `Apt1Page.test.ts`, including the existing row at line 171 |
| `#NEW-1-3` | A-3, C-3 | bug (nearest distance below 10 NM without its leading zero) | pins, `Apt1Page.test.ts` (task 1), `VorPage.test.ts`, `NdbPage.test.ts` (task 3) |
| `#NEW-1-4` | A-4 | bug (HF frequency `006.55`; may be latent) | pin, `Apt4Page.test.ts` |
| `#NEW-1-5` | A-5 | bug (the cursor parked on NR 1 does not follow the nearest) | pin, `Apt1Page.test.ts` |
| `#NEW-1-6` | A-7 | bug (APT 3 blank after scanning to an airport without runways); continues #38 | pin, `Apt3Page.test.ts` |
| `#NEW-1-Q1` | A-8 | question (macadam shows a blank surface) | issue only; the draft pin is dropped |
| `#NEW-2-1` | B-1, trainer T15 | bug (CLR on the APT 7 add question does nothing) | pin, `Apt7Page.test.ts` |
| `#NEW-2-2` | B-2 | bug (APT 7 runway list without `RW`) | pin, `Apt7Page.test.ts` |
| `#NEW-2-3` | B (B-T2), trainer T16 | bug (CLR back to the procedure or approach list turns the cursor off) | pins, `Apt7Page.test.ts`, `Apt8Page.test.ts` |
| `#NEW-2-4` | trainer T18 | bug (a second approach from APT 8 replaces the first without a question) | pin, `Apt8Page.test.ts` |
| `#NEW-3-1` | C-1 | bug (a VORTAC shows no `D`) | pin, `VorPage.test.ts` |
| `#NEW-3-2` | C-2 | bug (a VORTAC cannot be selected by its ident) | pin, `VorPage.test.ts` |
| `#NEW-3-3` | C-4 | bug (a user NDB frequency can never be entered) | pin, `NdbPage.test.ts` |
| `#NEW-3-4` | C-5 | bug (the refused variation stays after `IN ACT LIST`) | pin, `VorUserWaypoint.test.ts` |
| `#NEW-3-5` | C-6, D-2, trainer T2 | bug (a REF change does not recompute RAD and DIS) | pins, `IntPage.test.ts` (task 3), `SupPage.test.ts` (task 4) |
| `#NEW-3-6` | C-7, D-3, E-2, trainer T1 | bug (RAD true instead of magnetic with the VOR's variation) | pins, `IntPage.test.ts` (task 3), `SupPage.test.ts` (task 4), `RefPage.test.ts` (task 5) |
| `#NEW-3-7` | C-10, trainer T1 | bug (INT RAD measured at the intersection) | pin, `IntPage.test.ts` |
| `#NEW-3-8` | C-8, D-5, trainer T4 | bug (DIS with leading zeros) | pins, `IntPage.test.ts` (task 3), `SupPage.test.ts` (task 4) |
| `#NEW-3-9` | C-9, D-4, trainer T4 | bug (full-size `NM`) | pins, `IntPage.test.ts`, `test/render/harness/enterIdent.test.ts` (task 3), `SupPage.test.ts` (task 4) |
| `#NEW-3-10` | C-11, D-1, trainer T3 | bug (the cursor stays on REF after its approval) | pins, `IntPage.test.ts` (task 3), `SupPage.test.ts` (task 4) |
| `#NEW-3-11` | C-12 | bug (editing RAD or DIS of a user INT leaves the old lat/lon shown) | pin, `IntPage.test.ts` |
| `#NEW-3-12` | C-13 | bug (ENT on RAD or DIS throws without a reference VOR) | pin, `IntPage.test.ts` |
| `#NEW-3-13` | C-Q1, trainer T22 | bug (a database NDB on a whole kHz shows `.0`) | pin, `NdbPage.test.ts` |
| `#NEW-3-14` | trainer T5 | bug (DIS refuses 360 NM and more) | pin, `IntPage.test.ts` |
| `#NEW-4-1` | D-7 | bug (the refused waypoint after `USR DB FULL` shows as created) | pin, `SupPage.test.ts` |
| `#NEW-4-2` | D-6, trainer T8 | bug (a short ident's blank selector cell) | pin, `SupPage.test.ts` |
| `#NEW-5-1` | E-1 | bug (REF never inserts into FPL 0) | pins, `RefPage.test.ts` |
| `#NEW-5-2` | E-3 | bug (REF stores the bearing measured at the reference waypoint) | pin, `RefPage.test.ts` |
| `#NEW-5-3` | E-4, trainer T27 | bug (`NO SUP WPTS` posted by ACT and the REF confirmation) | pins, `ActPage.test.ts`, `RefPage.test.ts` |
| `#NEW-5-4` | E-5, trainer T26 | bug (the ACT arrow on every copy of the active waypoint) | pin, `ActPage.test.ts` |
| `#NEW-5-5` | E-6 | bug (ACT 8 shows the APT 8 title) | pin, `ActPage.test.ts` |
| `#NEW-5-6` | E-7 | bug (D/T 1 to 3 dashes during a D-> outside the plan) | pins, `Dt1Page.test.ts`, `Dt2Page.test.ts`, `Dt3Page.test.ts` |
| `#NEW-5-7` | E-8, trainer T23 | bug (D/T 3 shows the bearing as the DTK) | pins, `Dt3Page.test.ts` (two) |
| `#NEW-5-8` | E-9 | bug (D/T 4 without the Direct To symbol) | pin, `Dt4Page.test.ts` |
| `#NEW-5-9` | trainer T25 | bug, if confirmed (the ACT type letter column) | pin, `ActPage.test.ts`, only if the 90B ACT figures show a fixed column |
| `#NEW-6-1` | F-1 | bug (` 1 NEW WPTS`) | pin, `Ctr1Page.test.ts` |
| `#NEW-6-2` | F-2 | bug (CTR 2 does not revert) | pin, `Ctr2Page.test.ts` |

Known issues this session pins or comments without a placeholder: #92 (the APT 5 pin, a comment), #223 (D/T 1 and D/T 4
pins), #161 (the CTR 1 pin, a comment), #102 (the CTR recomputation pin, a comment), #38 (referenced by `#NEW-1-6`).

---

## Facts every batch needs (from the research pass)

**Boot and settle.**
- `bootUnit` boots force-ready with the GPS valid at once; `await settle(unit)` waits for the fix and two calculation
  ticks, so FPL 0 has activated. One calculation tick is `await vi.advanceTimersByTimeAsync(1000)`, one display tick
  250 ms; every panel click advances one display tick. The nearest lists search every 10 s, the first time on the tenth
  calculation tick, so a page that shows a nearest waypoint waits 12 s.
- `moveAircraft(unit, point, {groundspeedKt, trackTrue?})` gives the GPS a track and a ground speed, then holds the
  position. A held position with ground speed can sequence the leg, so keep the aircraft away from the next waypoint.
- The right page after boot is the SUP page, or the last active waypoint's page (`PageManager.startMainPage`).

**The default navdata.** Every boot also holds `ZZXA`, `ZZV`, `ZZN`, `ZZXIN` far away, so never give a test facility an
ident starting with `ZZ`, and choose idents that sort before them. There is no default user waypoint, so `NO SUP WPTS`
is real.

**The MSG annunciator is lit** on every engine-running boot (`testing.md` section 6). Assert `status().left` and
`status().right`; assert a message list exactly, never "any message". After task 0, the status-line messages a test
provokes are collected with the collector of item 7 (below).

**Reading the screen.**
- `Screen.read()` gives `rows(side)`, `maskRows(side)`, `half(side)`, `row(n)`, `status()` and `dump()`;
  `unit.panel.focused(side)` the one focused field `{row, col, text}` with the columns of the whole screen (the right
  half starts at column 12).
- After task 0, `Screen.read()` reads the whole APT 8 and ACT 8 IAF list (`.apt-8-iaf-list`), and `focused()` and
  `cursorTo` read the NDB frequency and DIS fields as one field across their plain decimal point.
- `Screen.read()` throws once a row is wider than its half page (#115 on ACT); a test of that reads the raw row with
  `readRows`.
- APT 3 draws a runway diagram on a canvas: `recordMap(names)` (installed before the boot) records it, and
  `downsampled(canvasToAscii(el))` gives a file snapshot.

**Waypoint pages.**
- `enterIdent('R', ident)` types into a waypoint selector with the knobs; the right cursor must be on.
  `unit.panel.cursorTo('R', 'USER POS?')` reaches a creation button.
- `savedUserWaypoints([...])` stores user waypoints; after task 0 `elevationFt` is in feet (it wrote meters before).
- After task 0, `airport()` names the runway ends right for any heading; before it, headings above 180 swapped the
  labels.
- `selectPage('R', 'ACT')` reaches the ACT page whatever the active waypoint is (after task 0); `selectPage('R', 'APT 7')`
  arrives from APT 8, so with SIDs and STARs it lands on the STAR page: select APT 6, then turn the inner knob forward.
- The time zone of APT 2 needs the reply of task 0 item 5; without it the row stays blank.

**Procedures.** `approachWorld()`, `withProcedures`, `sid`, `star`, `approach`, `Leg.*` and
`unit.panel.loadProcedure('APT 8')` (`testing.md` section 3). Every fix must be in the navdata.

**Center airspaces.** After task 0, `centerWorld()` gives three Centers stacked along 100 W with legs of about 300 NM,
which avoid #102 for one computation. A second computation in one unit meets #102 and is that issue's pin.

**Expected rejections.** An ENT that throws is an unhandled rejection; a test that provokes one takes it with
`unit.takeRejections()`, or the harness fails the test when it ends.

**Trainer citations.** The KLN 89 trainer was driven on 2026-10-07 (`research\trainer.md`). A spec test that rests on
it says "checked in the KLN 89 trainer, 2026-10-07" next to the 90B page where there is one. The maintainer accepts it
where the 90B guide is silent.

---

### Task 0: harness

**Goal:** The harness extensions of the design (items 1 to 9), each with a harness test and its paragraph in
`testing.md`, without changing what any existing test proves.

**Files:**
- Modify: `test/harness/render/screen.ts` (item 1)
- Modify: `test/harness/storage.ts` (item 2)
- Modify: `test/harness/navdata/builders.ts` (item 3)
- Modify: `test/harness/flight/FrontPanel.ts` (items 4 and 8)
- Create: `test/harness/timezone.ts` (item 5)
- Modify: `test/harness/fixtures.ts` (item 6)
- Create: `test/harness/statusLine.ts` (item 7)
- Modify: `docs/testing.md` (sections 3, 4 and 7)
- Test: `test/render/harness/screen.test.ts`, `test/render/harness/savedUserWaypoints.test.ts`,
  `test/unit/harness/navdata.test.ts`, `test/render/harness/selectPage.test.ts`, `test/render/harness/timezone.test.ts`
  (new), `test/unit/harness/worlds.test.ts` (new), `test/render/harness/statusLine.test.ts` (new),
  `test/render/harness/focused.test.ts` (new, item 8).
- Leave alone: `test/render/harness/enterIdent.test.ts` (task 3 owns it).

**Acceptance Criteria:**
- [ ] `Screen.read().rows('R')` of APT 8's IAF list with two IAFs shows the second IAF at cell 4 of row 2.
- [ ] `savedUserWaypoints([{kind: 'apt', …, elevationFt: 1400}])` stores `+00427` (meters), and APT 2 of that user
      airport shows an elevation of 1400 ft (within the unit's rounding).
- [ ] `airport('KXXX', …, {runwayHeading: 270})` has one runway with direction 90 and designation `09-27`;
      `runwayFix(apt, '27')` and `runwayFix(apt, '09')` both resolve, and 27's course is about 270.
- [ ] `selectPage('R', 'ACT')` ends on an ACT page when the active waypoint is an airport (its pages are `ACT 1` to
      `ACT 8`).
- [ ] `answerTimezone(standardHours, dstMonths)` makes APT 2 show its time zone row; without it the row stays blank.
- [ ] `dtWorld()` and `centerWorld()` exist with doc comments; a unit harness test checks their geometry with
      `flight/geo.ts`.
- [ ] `collectStatusMessages(unit)` returns the status-line messages published after it was called, not the cached
      last one.
- [ ] `focused('R')` reads a field whose two inverted runs are separated by one plain `.` as one field.
- [ ] `docs/testing.md` documents each item; section 7's CTR 1 lead is rewritten; existing tests are unchanged except
      where an item changes a literal they assert (named in the commit).
- [ ] `npm test` green and `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/render/harness test/unit/harness` → all green; then `npm test` → all green,
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: The positioned IAF list (item 1).** In `test/harness/render/screen.ts`, `Apt8IafList`
  (`kln90b/controls/List.tsx:157`) renders its rows inside `<div class="apt-8-iaf-list">`, which `KLN90B.scss:248`
  positions at one row down and sixteen cells from the screen's left edge, which is cell 4 of the right half. The DOM
  starts its second and later rows at the line start. Write the harness test first in `screen.test.ts`: boot with
  `approachWorld()` whose approach has a second IAF (research B's `iapWorld()` in
  `research\drafts-B\test\render\pages\right\Apt8Page.test.ts` builds it), select APT 8, CRSR, ENT on the approach, and
  assert `Screen.read().rows('R').slice(0, 3)` equals the title row, `'IAF 1 IAFAA'` and `'    2 IAFAB'` (take the
  title from the draft). Run it and see it fail (row 2 starts at cell 0). Then add to `readRows`, next to the
  `use-invert` branch:

```ts
/**
 * The IAF list of APT 8 and ACT 8 is positioned with CSS (KLN90B.scss .apt-8-iaf-list): the browser draws each of its
 * rows from the cell where the list starts, cell 4 of the right half, while the DOM starts its later rows at the line
 * start.
 */
const IAF_LIST_CELL = 4;

function positioned(rows: Cell[][], cell: number, read: () => void): void {
    const first = rows.length - 1;
    if (rows[first].length !== cell) {
        throw new Error(`Screen: the IAF list starts in cell ${rows[first].length}, not ${cell}`);
    }
    read();
    for (let r = first + 1; r < rows.length; r++) {
        rows[r].unshift(...Array.from({length: cell}, (): Cell => ({ch: ' ', attr: '.'})));
    }
}
```

```ts
        if (el.classList.contains('apt-8-iaf-list')) {
            positioned(rows, IAF_LIST_CELL, () => el.childNodes.forEach(c => walk(c, a, pre)));
            return;
        }
```

  Run the test again: green. Add a second test that the rows past the list's last row are unaffected (the page has
  none today; assert that the half has six rows and rows 3 to 5 are what the draft shows).

- [ ] **Step 2: The elevation of a saved user airport (item 2).** The V2 format stores the airport's `altitude`, which
  the model holds in meters (`UserWaypointPersistor.serializeApt`, `UserWaypointLoaderV2`); `savedUserWaypoints` wrote
  `elevationFt` unconverted. In `test/harness/storage.ts` convert:

```ts
            case 'apt': {
                const length = w.runwayLengthFt ?? UNKNOWN_RUNWAY_LENGTH_FT;
                const surface = w.surface ?? (w.runwayLengthFt === undefined ? '-' : 'H');
                // The format stores the elevation in meters, as the model holds it (UserWaypointPersistor.serializeApt)
                const elevationM = w.elevationFt === undefined ? UNKNOWN_ELEVATION_M : Math.round(w.elevationFt * 0.3048);
                s += signed(elevationM, 5) + signed(length, 5) + surface;
                break;
            }
```

  Find what the unit itself saves for an unknown elevation (read `Apt1Page.createAtUserPosition`, `Apt2UserPage` and the
  loader) and name the constant after it (`UNKNOWN_ELEVATION_M`); fix the type's doc comment, which says "-1 ft". Update
  the literals of `test/render/harness/savedUserWaypoints.test.ts` (1400 ft is `+00427`, 80 ft is `+00024`), and add a
  test that APT 2 of a user airport saved with `elevationFt: 1400` shows `1400` ft in its elevation row (the unit rounds
  meters back to feet, so the literal may be `01401`: derive it by hand, 427 m / 0.3048, and write the literal).
  `test/render/pages/right/Apt3UserPage.test.ts:32` passes 1400 and does not observe it; leave it.

- [ ] **Step 3: Runway ends (item 3).** `runwayDesignation` in `test/harness/navdata/builders.ts` always writes
  `lower-higher` (`09-27`), and the SDK reads `direction` as the heading of the first named end, so a heading of 270 put
  label 09 on the west-bound heading. Write the test first in `test/unit/harness/navdata.test.ts`: `airport('KXXX', 47,
  8, {runwayHeading: 270})` has `runways[0].direction` 90 and `designation` `'09-27'`, and
  `RunwayUtils.getOneWayRunwaysFromAirport(apt)` gives runway 27 with a course of 270 and runway 09 with 90; the same for
  heading 360 (`18-36`, direction 180). Then:

```ts
/** The heading of the runway's lower-numbered end, which the SDK reads as `direction` for a designation `09-27` */
function lowerEndHeading(heading: number): number {
    const own = Math.round(heading / 10) % 36 || 36;
    return own > 18 ? (heading + 180) % 360 : heading;
}
```

  and use `direction: lowerEndHeading(heading)` in `runway()`. Run the whole suite: the procedure tests use
  `runwayHeading: 270` (`test/unit/harness/procedures.test.ts:135`) and may change; an existing test that changes is
  reported in the commit with the reason (it asserted the swapped end), never silently re-snapshotted.

- [ ] **Step 4: `selectPage` for a bare group name (item 4).** The ACT page of an airport active waypoint names its
  pages `ACT 1` to `ACT 8`, so `selectPage('R', 'ACT')` looped. In `FrontPanel.selectPage`, after the outer knob has
  reached the group, return when the wanted name is a bare group (three characters after trimming):

```ts
        if (name.trim().length === 3) return; // a bare group ("ACT", "VOR"): whichever page of the group shows
```

  Test in `test/render/harness/selectPage.test.ts`: with an airport active (store `[kaaa, kbbb]` in FPL 0 with
  `savedFlightplan`, settle), `selectPage('R', 'ACT')` ends with `status().right` starting `ACT`. Update the method's doc
  comment.

- [ ] **Step 5: The time zone reply (item 5).** Create `test/harness/timezone.ts` from research A's local `timezone()`
  (`research\drafts-A\test\render\pages\right\Apt2Page.test.ts:28-37`):

```ts
import {simEnv} from './sim/install';

const HOUR = 3600 * 1000;

/**
 * Answers the sim's time zone call (GET_TIMEZONE_INFO, see TimezoneService.test.ts) for a zone of `standardHours` from
 * UTC that observes one hour of daylight saving time in the months `dstMonths` (0-based, UTC), or none. Without it the
 * call never resolves, like a sim with nothing attached, and APT 2 shows no time zone. The teardown clears it.
 */
export function answerTimezone(standardHours: number, dstMonths: number[] = []): void {
    simEnv().coherent.replies.set('GET_TIMEZONE_INFO', (datum: unknown) => {
        const dst = dstMonths.includes(new Date(datum as number).getUTCMonth());
        return {utcOffset: (standardHours + (dst ? 1 : 0)) * HOUR, dstActive: dst};
    });
}
```

  Check the import path of `simEnv` and the reply's argument against `TimezoneService.test.ts`. Test in
  `test/render/harness/timezone.test.ts`: APT 2 of an airport with `answerTimezone(-5)` shows the zone row the draft
  expects; without the call the row is blank.

- [ ] **Step 6: The fixtures (item 6).** Add to `test/harness/fixtures.ts`, as fresh objects on every call:
    - `dtWorld()`: research E's world (`research\drafts-E\test\render\pages\right\Dt1Page.test.ts:12-19`): KAAA 47.0 N,
      the VOR ABC 47.5 N, the intersection DEF 48.0 N, KBBB 48.5 N, all on 10 E; doc comment: four waypoints 0.5° apart
      on one meridian, about 30 NM per leg.
    - `centerWorld()`: research F's world (`research\drafts-F\test\render\pages\right\Ctr1Page.test.ts:9-38`): returns
      `{kaaa, kbbb, kccc, bgd, gck, centers}` where `centers` is the three Center airspaces (fresh each call), with F's
      doc comment on the 300 NM legs and #102 (paraphrased, no manual text).
  Test in `test/unit/harness/worlds.test.ts` with `flight/geo.ts`: `dtWorld()` legs are 30.0 ± 0.1 NM; in
  `centerWorld()` BGD is the only VOR within 100 NM of the crossing of 42.75 N on 100 W and GCK of 47.75 N; fresh objects
  per call.

- [ ] **Step 7: The status-line message collector (item 7).** Create `test/harness/statusLine.ts`:

```ts
import {StatusLineMessageEvents} from '../../kln90b/controls/StatusLine';
import {HeadlessUnit} from './boot';

/**
 * The status-line messages (`statusLineMessage`, controls/StatusLine.tsx) published from now on, in order. The bus calls
 * a new subscriber at once with the last cached message (testing.md section 6); that call is dropped.
 */
export function collectStatusMessages(unit: HeadlessUnit): string[] {
    const seen: string[] = [];
    unit.props.bus.getSubscriber<StatusLineMessageEvents>().on('statusLineMessage').handle(m => seen.push(m));
    seen.length = 0;
    return seen;
}
```

  Check the import paths. Test in `test/render/harness/statusLine.test.ts`: after an ENT that posts one message (an
  unknown ident on a page that posts `NO SUCH WPT`, or `NO SUP WPTS` by selecting the SUP page with no user waypoints),
  the list holds exactly that message once; a message published before the call is not in it.

- [ ] **Step 8: `focused()` across a plain decimal point (item 8).** `NdbFreqEditor` and `DistanceEditor` render their
  point as plain text while the digits around it are inverted, so `focusedRuns` found two runs. In `FrontPanel`, after
  collecting the runs of a row, merge two runs separated by exactly one cell that shows `.` with the normal attribute:

```ts
    /** Joins two runs of a row that one plain "." separates: the NDB frequency and DIS editors do not invert their point */
    private joinAcrossPoint(s: Screen, runs: Field[]): Field[] {
        const out: Field[] = [];
        for (const run of runs) {
            const prev = out[out.length - 1];
            const gap = prev === undefined ? -1 : prev.col + prev.text.length;
            if (prev !== undefined && prev.row === run.row && run.col === gap + 1
                && s.cell(run.row, gap).ch === '.' && s.cell(run.row, gap).attr === '.') {
                out[out.length - 1] = {row: prev.row, col: prev.col, text: prev.text + '.' + run.text};
            } else {
                out.push(run);
            }
        }
        return out;
    }
```

  and return `this.joinAcrossPoint(s, runs)` from `focusedRuns`. Test (write it first, see it throw): on the INT page of
  a user intersection being created by REF/RAD/DIS (research C's `IntPage.test.ts` drafts show the steps), with the
  cursor on DIS, `focused('R').text` is the whole field (`'___._'` before an entry) and `cursorTo('R', …)` stops there.
  Whether the real cursor covers the point is a Session 9b question; say so in `testing.md`.

- [ ] **Step 9: `testing.md` (item 9).** Section 3 "Reading the screen": the positioned IAF list. Section 3 "Navdata":
  `savedUserWaypoints` elevation in feet stored as meters; `airport()` runway ends; the fixtures `dtWorld()` and
  `centerWorld()` (with the 300 NM rule and #102). Section 4 "Render": `selectPage('R', 'ACT')` and the APT 7 note
  (arrives from APT 8, so it lands on the STAR page with SIDs and STARs); `answerTimezone`; `collectStatusMessages`;
  `focused()` across the point. Section 7: rewrite the CTR 1 (#161) bullet: one computation needs no OTH 2 detour with
  `centerWorld()`, a second one meets #102. American English, no counts of growing collections.

- [ ] **Step 10: Commit.** `npm test` and `npx tsc --noEmit` first. One commit (rule 22), message listing each item with
  its `Proof:` line (for a harness test: the harness change reverted makes it fail), and any existing test whose literal
  changed with the reason.

```json:metadata
{"files": ["test/harness/render/screen.ts", "test/harness/storage.ts", "test/harness/navdata/builders.ts", "test/harness/flight/FrontPanel.ts", "test/harness/timezone.ts", "test/harness/fixtures.ts", "test/harness/statusLine.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["IAF list rows at cell 4", "savedUserWaypoints elevation in feet stored as meters", "airport() runway ends right above 180", "selectPage bare group", "answerTimezone", "dtWorld and centerWorld fixtures", "collectStatusMessages", "focused across a plain point", "testing.md updated", "suite green, tsc clean"], "modelTier": "standard"}
```

---

### Task 1: APT 1 to APT 4

**Goal:** The APT 1 to APT 4 tests of research A on the task 0 harness, with the pins renamed and the rulings applied.

**Files:**
- Modify: `test/render/pages/right/Apt1Page.test.ts`, `Apt2Page.test.ts`, `Apt3Page.test.ts`, `Apt3UserPage.test.ts`
- Create: `test/render/pages/right/Apt4Page.test.ts`, `test/render/pages/right/__snapshots__/apt3Diagram.txt`
- Modify (comment only): `kln90b/pages/right/Apt1Page.tsx` (the `5-19` citation of `createIfReady` becomes `5-17`)

**Acceptance Criteria:**
- [ ] Every test of research A section 2 is present, or its omission is reported with the reason.
- [ ] Pins `#NEW-1-1`, `#NEW-1-2` (including the existing row of `Apt1Page.test.ts:171`, which becomes a pin; its
      passing remainder stays), `#NEW-1-3` (APT 1 nearest view), `#NEW-1-4`, `#NEW-1-5`, `#NEW-1-6`, each with a passing
      sibling.
- [ ] The draft pins `#NEW-A-6` (name search) and `#NEW-A-8` (macadam) are removed (the maintainer's decision and the
      `question` issue `#NEW-1-Q1`); the macadam test may stay as a characterization of the blank only if it is labeled
      and names no page.
- [ ] The existing test "follows the aircraft with the nr of the shown airport (d202f4a)" cites 3-24 for the cursor-off
      case (the airport stays, the rank counts up), and the `#NEW-1-5` pin's comment says that only the parked-cursor
      case is the bug; the pin cites 3-24 and the KLN 89 trainer.
- [ ] The #65 test's citation `5-19` becomes `5-17`.
- [ ] Each APT page (APT 1, APT 2 database and user, APT 3 map, list and user, APT 4) has a characterization snapshot.
- [ ] APT 2's time zone row is tested with `answerTimezone` (Session 6 deferred it).
- [ ] The drafts' workarounds are replaced by the task 0 helpers where one exists (elevation in feet, runway headings
      above 180 allowed, `answerTimezone`).

**Verify:** `npx vitest run test/render/pages/right/Apt1Page.test.ts test/render/pages/right/Apt2Page.test.ts test/render/pages/right/Apt3Page.test.ts test/render/pages/right/Apt3UserPage.test.ts test/render/pages/right/Apt4Page.test.ts`
→ all green (pins as expected failures); then `npm test`, `npx tsc --noEmit`.

**Steps:**

- [ ] **Step 1:** Reset the worktree (Global Constraints), read research A in full, the trainer report (T10 to T14) and
  the design.
- [ ] **Step 2:** Bring the drafts over (`research\drafts-A\test\render\pages\right\…`, the appended parts only for
  existing files), rename the placeholders, drop the two pins named above, and move the local `timezone()` to
  `answerTimezone`.
- [ ] **Step 3:** Apply the snapshot rules (Global Constraints): no `AIRPT`, no nearest distance below 10 NM in a
  snapshot.
- [ ] **Step 4:** Re-prove every test and pin (rule 10): the research's break and one of your own each; the fixes named
  in research A section 3 for the pins.
- [ ] **Step 5:** Write `.task-report.md` with the label audit; run `npm test` and `npx tsc --noEmit`; commit once with
  the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/right/Apt1Page.test.ts", "test/render/pages/right/Apt2Page.test.ts", "test/render/pages/right/Apt3Page.test.ts", "test/render/pages/right/Apt3UserPage.test.ts", "test/render/pages/right/Apt4Page.test.ts", "test/render/pages/right/__snapshots__/apt3Diagram.txt", "kln90b/pages/right/Apt1Page.tsx"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research A tests present", "pins #NEW-1-1 to #NEW-1-6 with siblings", "#NEW-A-6 and #NEW-A-8 pins dropped", "3-24 cursor-off citation", "5-17 citations", "characterization per APT page", "APT 2 time zone", "task 0 helpers used"], "modelTier": "standard"}
```

---

### Task 2: APT 5 to APT 8

**Goal:** The APT 5 to APT 8 tests of research B on the task 0 harness, with the trainer's verdicts turned into pins.

**Files:**
- Modify: `test/render/pages/right/Apt5Page.test.ts`, `Apt7Page.test.ts`, `Apt8Page.test.ts`
- Create: `test/render/pages/right/Apt6Page.test.ts`

**Acceptance Criteria:**
- [ ] Every test of research B section 2 is present, or its omission is reported with the reason.
- [ ] Pins `#NEW-2-1` (citing 6-5 and the KLN 89 trainer), `#NEW-2-2`, and the render pin of #92, each with a passing
      sibling.
- [ ] `#NEW-2-3`: the drafts' characterizations of the cursor turning off after CLR (APT 7 and APT 8) become pins that
      assert the cursor stays on the chosen entry (the KLN 89 trainer, medium; 6-5 for the step back).
- [ ] `#NEW-2-4`: the existing test "replaces the approach that FPL 0 already holds (6-7)" in `Apt8Page.test.ts` asserts
      the silent replacement, a bug by the trainer (rule 8). It becomes the pin: after LOAD IN FPL of a second approach,
      FPL 0 still holds the first approach (the unit has asked first); the trainer is the citation (the 90B guide
      describes replacing only through FPL 0, 6-7). Its preconditions (the first approach loaded) go in a passing
      sibling. Do not assert the question's text: the 90B wording is unknown.
- [ ] The IAF list is asserted whole with the task 0 reader (all IAF rows), and the local `statusMessages` helpers use
      `collectStatusMessages`.
- [ ] APT 6 keeps `NO FUEL`, `NO OXYGEN` and `NO FEE INFO` in its characterization snapshot, with a comment that they
      are the code's fixed texts because the sim supplies no service data (`Apt6Page.formatFuel`).
- [ ] Each APT page (APT 5 to APT 8) has a characterization snapshot.

**Verify:** `npx vitest run test/render/pages/right/Apt5Page.test.ts test/render/pages/right/Apt6Page.test.ts test/render/pages/right/Apt7Page.test.ts test/render/pages/right/Apt8Page.test.ts`
→ green with the pins as expected failures; then `npm test`, `npx tsc --noEmit`.

**Steps:**

- [ ] **Step 1:** Reset the worktree, read research B in full, the trainer report (T15 to T21) and the design.
- [ ] **Step 2:** Bring the drafts over, rename `#NEW-B-1` to `#NEW-2-1` and `#NEW-B-2` to `#NEW-2-2`, write the
  `#NEW-2-3` and `#NEW-2-4` pins and their siblings, move to the task 0 helpers.
- [ ] **Step 3:** Prove the new pins by a temporary fix: `#NEW-2-3` keep the cursor on in `clear()` of `Apt7Page` and
  `Apt8Page`; `#NEW-2-4` make the load refuse while FPL 0 holds an approach. Re-prove the rest (rule 10).
- [ ] **Step 4:** Write `.task-report.md` with the label audit; `npm test`, `npx tsc --noEmit`; commit once with the
  `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/right/Apt5Page.test.ts", "test/render/pages/right/Apt6Page.test.ts", "test/render/pages/right/Apt7Page.test.ts", "test/render/pages/right/Apt8Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research B tests present", "pins #NEW-2-1, #NEW-2-2, #92", "#NEW-2-3 pins from the characterizations", "#NEW-2-4 pin replaces the silent-replace test", "IAF list whole, collectStatusMessages", "APT 6 snapshot with the fixed texts", "characterization per APT page"], "modelTier": "standard"}
```

---

### Task 3: VOR, NDB and INT

**Goal:** The VOR, NDB and INT tests of research C on the task 0 harness, with the shared bugs under the session
placeholders and the trainer's verdicts applied.

**Files:**
- Modify: `test/render/pages/right/VorPage.test.ts`, `VorUserWaypoint.test.ts`, `IntPage.test.ts`
- Create: `test/render/pages/right/NdbPage.test.ts`
- Modify: `test/render/harness/enterIdent.test.ts` (the row at line 84 only)

**Acceptance Criteria:**
- [ ] Every test of research C section 2 is present, or its omission is reported with the reason.
- [ ] Renames: C-1 `#NEW-3-1`, C-2 `#NEW-3-2`, C-3 `#NEW-1-3`, C-4 `#NEW-3-3`, C-5 `#NEW-3-4`, C-6 `#NEW-3-5`, C-7
      `#NEW-3-6`, C-8 `#NEW-3-8`, C-9 `#NEW-3-9`, C-10 `#NEW-3-7`, C-11 `#NEW-3-10`, C-12 `#NEW-3-11`, C-13 `#NEW-3-12`,
      C-Q1 `#NEW-3-13` (now a pin, citing figures 3-153, 3-154 and the KLN 89 trainer).
- [ ] New pin `#NEW-3-14`: on the user intersection creation by REF/RAD/DIS, a DIS of `400.0` is accepted (figure 5-74
      shows three digits before the point; the KLN 89 trainer accepted 400.0 and 999.9); a passing sibling shows that a
      DIS below 360 is accepted.
- [ ] The radial pins cite the trainer's result (magnetic with the reference VOR's own variation) next to the guide.
- [ ] `test/render/harness/enterIdent.test.ts:84` no longer asserts `'DIS:___._NM'` as correct: the row becomes a
      `#NEW-3-9` pin (or the assertion leaves out the DIS row and a separate pin holds it), and the file's other tests
      are unchanged.
- [ ] VOR, NDB and INT each have a characterization snapshot (no DIS row on INT, no whole-kHz NDB frequency, no
      nearest distance below 10 NM).
- [ ] The drafts' mask workarounds for the NDB frequency and DIS fields use `focused()` and `cursorTo` after task 0.

**Verify:** `npx vitest run test/render/pages/right/VorPage.test.ts test/render/pages/right/VorUserWaypoint.test.ts test/render/pages/right/NdbPage.test.ts test/render/pages/right/IntPage.test.ts test/render/harness/enterIdent.test.ts`
→ green with the pins as expected failures; then `npm test`, `npx tsc --noEmit`.

**Steps:**

- [ ] **Step 1:** Reset the worktree, read research C in full, the trainer report (T1 to T6, T10, T22) and the design.
- [ ] **Step 2:** Bring the drafts over, rename, write `#NEW-3-14` and its sibling (temporary fix that proves it:
  `DistanceEditor.convertToValue` without the `>= 360` refusal), turn the `enterIdent.test.ts:84` row into a pin.
- [ ] **Step 3:** Re-prove every test and pin (rule 10).
- [ ] **Step 4:** Write `.task-report.md` with the label audit; `npm test`, `npx tsc --noEmit`; commit once with the
  `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/right/VorPage.test.ts", "test/render/pages/right/VorUserWaypoint.test.ts", "test/render/pages/right/NdbPage.test.ts", "test/render/pages/right/IntPage.test.ts", "test/render/harness/enterIdent.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research C tests present", "renames per table", "#NEW-3-14 pin with sibling", "radial pins cite the trainer", "enterIdent.test.ts:84 no longer freezes #NEW-3-9", "characterization per page without pinned rows", "task 0 focused() used"], "modelTier": "standard"}
```

---

### Task 4: SUP, the generic waypoint page and the confirmation page

**Goal:** The SUP, `WaypointPage` and `WaypointConfirmPage` tests of research D on the task 0 harness, with the bugs
shared with INT under task 3's placeholders.

**Files:**
- Create: `test/render/pages/right/SupPage.test.ts`, `test/render/pages/right/WaypointPage.test.ts`
- Modify: `test/render/pages/right/WaypointConfirmPage.test.ts`

**Acceptance Criteria:**
- [ ] Every test of research D section 2 is present, or its omission is reported with the reason.
- [ ] Renames: D-1 `#NEW-3-10`, D-2 `#NEW-3-5`, D-3 `#NEW-3-6`, D-4 `#NEW-3-9`, D-5 `#NEW-3-8`, D-6 `#NEW-4-2`, D-7
      `#NEW-4-1`. The SUP pins of the shared bugs assert the same expected behavior as task 3's INT pins (research C
      and D agree; the trainer settled the radial and the distance format).
- [ ] The empty SUP page (no user waypoints): its ident ` 0` and the creation choices are a spec test citing the KLN 89
      trainer (T7 showed `0` and the choices); the `NO SUP WPTS` message stays a separate spec test on C-2 (the 90B
      lists it; the 89 shows no message, so the trainer is not cited for it).
- [ ] `#NEW-4-2` cites 3-20 and the KLN 89 trainer (medium) for the first click giving `A`.
- [ ] SUP, the generic waypoint page (through the page research D chose) and the confirmation page each have a
      characterization snapshot (no DIS row on SUP).
- [ ] The drafts' `cursorTo('R', '___._')` and `cell(3, 16)` workarounds use task 0's `focused()`.

**Verify:** `npx vitest run test/render/pages/right/SupPage.test.ts test/render/pages/right/WaypointPage.test.ts test/render/pages/right/WaypointConfirmPage.test.ts`
→ green with the pins as expected failures; then `npm test`, `npx tsc --noEmit`.

**Steps:**

- [ ] **Step 1:** Reset the worktree, read research D in full, the trainer report (T1 to T4, T7 to T9) and the design.
- [ ] **Step 2:** Bring the drafts over, rename, apply the rulings above, move to the task 0 helpers.
- [ ] **Step 3:** Re-prove every test and pin (rule 10).
- [ ] **Step 4:** Write `.task-report.md` with the label audit; `npm test`, `npx tsc --noEmit`; commit once with the
  `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/right/SupPage.test.ts", "test/render/pages/right/WaypointPage.test.ts", "test/render/pages/right/WaypointConfirmPage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research D tests present", "renames per table, same expectations as task 3", "empty SUP page spec on the trainer", "#NEW-4-2 cites 3-20 and the trainer", "characterization per page", "task 0 focused() used"], "modelTier": "standard"}
```

---

### Task 5: REF, ACT and D/T 1 to D/T 4

**Goal:** The REF, ACT and D/T tests of research E on the task 0 harness, with the trainer's verdicts applied and the
D/T world from the fixture.

**Files:**
- Create: `test/render/pages/right/RefPage.test.ts`, `Dt1Page.test.ts`, `Dt2Page.test.ts`, `Dt4Page.test.ts`
- Modify: `test/render/pages/right/ActPage.test.ts`, `Dt3Page.test.ts`

**Acceptance Criteria:**
- [ ] Every test of research E section 2 is present, or its omission is reported with the reason.
- [ ] Renames: E-1 `#NEW-5-1`, E-2 `#NEW-3-6`, E-3 `#NEW-5-2`, E-4 `#NEW-5-3`, E-5 `#NEW-5-4`, E-6 `#NEW-5-5`, E-7
      `#NEW-5-6`, E-8 `#NEW-5-7`, E-9 `#NEW-5-8`; the #223 pins keep their number.
- [ ] `#NEW-5-6` is pinned on D/T 1, D/T 2 and D/T 3 (research E gives the expected rows for D/T 2 and D/T 3).
- [ ] `#NEW-5-7` cites 4-12, Appendix A and the KLN 89 trainer (T23: the leg DTK); `#NEW-5-4` and `#NEW-5-3` cite the
      trainer as well (T26, T27).
- [ ] The ACT type letter column: read the 90B ACT figures (4-10, 4-39 and the ACT figures of chapter 6). If they show
      the letter in the last column of the row, pin `#NEW-5-9` (with the trainer, T25, medium); otherwise report it and
      leave a log line for task 7. The existing order-only S-letter test stays.
- [ ] The existing NO ACTIVE WAYPOINT tests of `f95d1d7` cite the code's video reference as well as 4-10.
- [ ] The D/T files use `dtWorld()`; the IAF list on ACT 8 is read whole with the task 0 reader; `selectPage('R', 'ACT')`
      replaces the `outer('R', 3)` workaround.
- [ ] REF, ACT (and ACT 8), D/T 1 (FPL and other variant), D/T 2 (both), D/T 3 (both) and D/T 4 each have a
      characterization snapshot without a pinned row.

**Verify:** `npx vitest run test/render/pages/right/RefPage.test.ts test/render/pages/right/ActPage.test.ts test/render/pages/right/Dt1Page.test.ts test/render/pages/right/Dt2Page.test.ts test/render/pages/right/Dt3Page.test.ts test/render/pages/right/Dt4Page.test.ts`
→ green with the pins as expected failures; then `npm test`, `npx tsc --noEmit`.

**Steps:**

- [ ] **Step 1:** Reset the worktree, read research E in full, the trainer report (T23 to T27) and the design.
- [ ] **Step 2:** Bring the drafts over, rename, add the D/T 2 and D/T 3 pins of `#NEW-5-6`, decide `#NEW-5-9` from the
  figures, move to the task 0 helpers.
- [ ] **Step 3:** Re-prove every test and pin (rule 10).
- [ ] **Step 4:** Write `.task-report.md` with the label audit; `npm test`, `npx tsc --noEmit`; commit once with the
  `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/right/RefPage.test.ts", "test/render/pages/right/ActPage.test.ts", "test/render/pages/right/Dt1Page.test.ts", "test/render/pages/right/Dt2Page.test.ts", "test/render/pages/right/Dt3Page.test.ts", "test/render/pages/right/Dt4Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research E tests present", "renames per table", "#NEW-5-6 on D/T 1 to 3", "trainer citations", "#NEW-5-9 decided from the figures", "f95d1d7 tests cite the video", "dtWorld, IAF reader, selectPage ACT used", "characterization per page and variant"], "modelTier": "standard"}
```

---

### Task 6: CTR 1, CTR 2 and the self-test right page

**Goal:** The CTR and self-test tests of research F on `centerWorld()`, with the ALT row left out of the self-test
snapshot.

**Files:**
- Create: `test/render/pages/right/Ctr1Page.test.ts`, `Ctr2Page.test.ts`, `SelfTestRightPage.test.ts`
- Modify (comments only): `kln90b/pages/right/Ctr1Page.tsx`, `kln90b/pages/right/Ctr2Page.tsx` (class citation `5-21`
  becomes `5-25` to `5-27`)

**Acceptance Criteria:**
- [ ] Every test of research F section 2 is present, or its omission is reported with the reason.
- [ ] Renames: F-1 `#NEW-6-1`, F-2 `#NEW-6-2`; the #161 and #102 pins keep their numbers, each with a passing sibling.
- [ ] The CTR files use `centerWorld()` instead of their local world.
- [ ] The 28 + 2 = 30 legs test stays a spec test (5-26) and its comment says the limit check is dead until #161 is
      fixed; the `#NEW-6-2` pin asserts the start state of CTR 1 and CTR 2 (figure 5-90's state, the code's own empty
      page as the literal), and says so in a comment.
- [ ] The self-test right page has a characterization snapshot without the ALT row (figure 3-4 and photos of real units
      disagree; Session 10 decides). Research F's spec questions for Session 10 go into the report, not into tests.
- [ ] CTR 1 and CTR 2 each have a characterization snapshot (right half only; the status row's mask is the status
      line's business).

**Verify:** `npx vitest run test/render/pages/right/Ctr1Page.test.ts test/render/pages/right/Ctr2Page.test.ts test/render/pages/right/SelfTestRightPage.test.ts`
→ green with the pins as expected failures; then `npm test`, `npx tsc --noEmit`.

**Steps:**

- [ ] **Step 1:** Reset the worktree, read research F in full and the design.
- [ ] **Step 2:** Bring the drafts over, rename, move to `centerWorld()`, cut the ALT row, fix the two class comments.
- [ ] **Step 3:** Re-prove every test and pin (rule 10); research F's `f-batch*.sh` scripts show the breaks (copy what
  you need into `scratchpad\task-6\`).
- [ ] **Step 4:** Write `.task-report.md` with the label audit; `npm test`, `npx tsc --noEmit`; commit once with the
  `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/right/Ctr1Page.test.ts", "test/render/pages/right/Ctr2Page.test.ts", "test/render/pages/right/SelfTestRightPage.test.ts", "kln90b/pages/right/Ctr1Page.tsx", "kln90b/pages/right/Ctr2Page.tsx"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research F tests present", "renames, #161 and #102 pins with siblings", "centerWorld used", "30-leg spec and #NEW-6-2 comments", "self-test snapshot without ALT", "CTR snapshots", "class citations fixed"], "modelTier": "standard"}
```

---

### Task 7: issues and close-out

**Goal:** Every placeholder filed and replaced, the known issues commented, `testing.md` sections 6 and 7 updated, the
session log written and the checkbox ticked.

**Files:**
- Modify: every test file with a `#NEW-` placeholder
- Modify: `docs/testing.md` (sections 6 and 7), `docs/test-coverage.md` (section 3 checkbox, section 4 log)

**Acceptance Criteria:**
- [ ] Each placeholder of the table is filed per `CLAUDE.md` (searched open and closed issues first, `bug` label, file
      and line, reproduction, expected value with the page, impact, suggested fix, "found in the headless harness" or
      "by reading the code", never manual text), or commented on the issue the search finds. `#NEW-5-9` only if task 5
      confirmed it. `#NEW-1-Q1` as a `question`.
- [ ] Shared bugs are one issue naming every page (`#NEW-1-3`, `#NEW-3-5`, `#NEW-3-6`, `#NEW-3-8`, `#NEW-3-9`,
      `#NEW-3-10`); the control bugs (`#NEW-3-3`, `#NEW-3-8`, `#NEW-3-14`, `#NEW-4-2`) say Session 9b will add control
      tests.
- [ ] Comments on #92, #161, #102 and #38 (research B and F section 3 give the text to paraphrase).
- [ ] The placeholders are replaced in one commit; `grep -r "#NEW-" test/` finds nothing.
- [ ] `testing.md` section 6 gains the limitations the session found (APT 6's fixed service texts; the APT 8 and ACT 8
      IAF list placement; the decimal point the editors do not invert) and section 7 the leads (the design's log-only
      list).
- [ ] The session log (section 4 of `test-coverage.md`) follows the Session 8 entry's shape: done, rulings, review fix
      rounds, trainer results, bugs found and filed, fixes that could not be re-broken, coverage start and end, not
      covered (rule 18: the pages without a spec test, the name and city search, the leads, the 9b items), workflow
      notes; the 9a checkbox is ticked.
- [ ] `npm test` and `npx tsc --noEmit` clean.

**Verify:** `grep -rn "#NEW-" test/` → no output; `npm test` → green; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1:** Read the task reports and reviews of tasks 0 to 6, the design and the research reports' section 3.
- [ ] **Step 2:** Search and file the issues (pace the GitHub search at about ten calls a minute); record each number.
- [ ] **Step 3:** Replace the placeholders, run `npm test`, commit (`references #…` subject per `CLAUDE.md`).
- [ ] **Step 4:** Post the comments; update `testing.md`; run coverage (`npm run coverage`) for the log.
- [ ] **Step 5:** Write the session log, tick the checkbox, commit.

```json:metadata
{"files": ["docs/testing.md", "docs/test-coverage.md", "test/render/pages/right/", "test/render/harness/enterIdent.test.ts"], "verifyCommand": "grep -rn \"#NEW-\" test/ ; npm test && npx tsc --noEmit", "acceptanceCriteria": ["every placeholder filed or commented", "shared bugs one issue each", "comments on #92 #161 #102 #38", "placeholders replaced, grep empty", "testing.md sections 6 and 7", "session log and checkbox", "suite green, tsc clean"], "modelTier": "frontier"}
```

---

## Execution notes for the controller

- **Order.** Task 0 alone in the main checkout on the session branch (it touches the harness and `testing.md`), then
  its review and merge (it commits on the branch directly). Tasks 1 to 6 in parallel worktrees, each reset to the
  session branch's head after task 0; merge by completion; `npm test` and `tsc` after each merge. Task 7 in the main
  checkout last; its review is folded into the final whole-session review.
- **Models.** Implementers on Sonnet (rule 26); a struggling one is re-dispatched on Opus. Reviewers on Opus for tasks 1,
  3 and 5, Sonnet for 0, 2, 4 and 6; re-reviews on Sonnet. Task 7 on the controller's model. The final review on the
  controller's model.
- **Reviews (rule 24).** One reviewer per task: spec compliance, then code quality, then the mutation pass in the
  task's worktree (never naming mutations to the implementer). The reviewer checks every page citation against the
  Pilot's Guide index, greps the added comments for verbatim manual runs, and checks the per-describe label audit.
  Reviews go to `scratchpad\task-<N>\review.md`.
- **Merge base.** Before each review, check that the task branch's merge base is the session branch head after task 0.
- **Cleanup** only after the maintainer approves the session: remove each worktree's `node_modules` junction with
  `cmd //c rmdir` before `git worktree remove` (the research worktrees too), then delete the task branches with
  `git branch -d`.
