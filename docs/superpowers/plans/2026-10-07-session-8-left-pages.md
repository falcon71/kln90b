# Session 8 (pages, left side): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A labeled characterization test for every page under `kln90b/pages/left/`, spec tests where the Pilot's Guide
(or the KLN 89 trainer) gives the rule, and pins for the bugs the research found, among them the #99 pins planned since
Session 2, the SET 2 magnetic variation editor Session 7 left and the pin of #213. Each test is proven to bite.

**Architecture:**
- **Task 0** (harness) runs alone first: the `.use-invert` overlay in `Screen.read()`, the map recorder, a `simVars`
  boot option, an opt-in `FakeSim` option for the course key events, two `FrontPanel` fixes and their `testing.md`
  notes.
- **Tasks 1 to 7** are parallel batches, one per research area (A to G). Each runs in its own git worktree, reset to the
  session branch after task 0 has merged, starts from the research drafts, and ends in one commit (plus one per fix
  round). They share no file.
- **Task 8** files the issues and comments, replaces the placeholders, updates `testing.md` and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the
headless harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-07-session-8-left-pages-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task. The
  design's rulings, its bug table and its controller's defaults override anything in the research reports.
- **Branches.** The session branch is `tests-session-8-left-pages`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`, and the work then goes like this:
    - Before anything else, run `git reset --hard tests-session-8-left-pages` on the (still empty) worktree branch.
    - Check `git log -1`: it must show the session branch's head, which the controller names in the dispatch.
    - If `node_modules` is missing, create it as a junction to `E:\msfs\kln90b\node_modules` (PowerShell:
      `cmd /c mklink /J node_modules E:\msfs\kln90b\node_modules`). Never delete it recursively and never run
      `npm install`.
- **No behavior changes** in `kln90b/` (rule 12). Nothing in this session needs a seam; a task that finds it needs one
  stops and reports.
- **Test names** carry the issue where there is one: `'… (#99)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23), with the numbers fixed in the placeholder table below. The research
  drafts use `#NEW-A-n` to `#NEW-G-n`: rename them as each task says. A bug that several tasks pin keeps the one
  placeholder of the table (`#NEW-1-1` on NAV 1, OTH 6 and TRI 3; `#NEW-5-1` on OTH 9 and CAL 3).
- **Labels** (`testing.md` section 5, rules 6 and 7):
    - A **spec test** cites the Pilot's Guide page in a comment and in its title (or the install manual page, or
      "checked in the KLN 89 trainer, 2026-10-07").
    - A **characterization test** has `characterization` in its `describe` or `it` title and carries no page number and
      no trainer citation, neither in its title nor in its comments.
    - A **contract test** cites its source (`CLAUDE.md` "Public contract with aircraft": panel.xml keys, persisted
      setting keys) and needs neither.
    - A **pin** asserts the manual (or the trainer) and cites it. Its **passing sibling** is a test like any other: it
      cites the page its preconditions rest on, or it carries `characterization`; "the setup of #…" alone is not a label.
    - A describe whose title says `characterization` holds only characterizations; a spec test never sits inside it.
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `kln89-guide-index.md`, `reference-photos-index.md`). Cite page numbers, never copy manual text.
    - Before the review, the implementer reports a **per-describe label audit**: every describe and `it` title, its
      label (spec, characterization, contract, pin, sibling) and its page or source.
- **Snapshots never contain a row that shows a pinned bug** (rule 8). Each task names the rows its snapshots leave out.
  The bugs `#NEW-1-1` (a duration of `:60`) and `#NEW-1-8` (a degree below 10 written with a zero, `E 08°`) show on many
  pages and need care everywhere: a snapshot uses positions and times that avoid both.
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts`, the standard atmosphere or the wind
  triangle by hand. Never derive them from the code under test or the SDK's flavor of the same formula.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure (screen rows, the message list, stored settings), not substrings of a whole screen.
- **Pins.**
    - Every `it.fails` has a passing sibling that asserts its heavy preconditions.
    - A pin is proven by fixing the bug temporarily and seeing the pin turn red, then restoring. The fix is named per pin
      below or in the research report.
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
    - Write the message file with a Bash heredoc or use `-m`: PowerShell `Set-Content` writes a byte order mark.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, `docs/testing.md`, `CLAUDE.md`, the harness under
  `test/harness/`, GitHub issues, and other tasks' files. Task 0 is the exception for the harness and `testing.md`,
  task 8 for the documents and the issues.
- **Copyright and data.** Never commit manual text, tables or figures, or navdata recorded from the sim. Facilities are
  invented. The KLN 89 trainer is cited as "the KLN 89 trainer"; its Chicago and Wisconsin waypoints never appear in
  tests. Short on-screen display strings (`DIS`, `TYPE AREA`, a message text) are fine; an ordered list that mirrors a
  table of the guide is not (hence the cut SET 2 sweep of task 4).
- **Research and scratch.**
    - The session scratchpad is
      `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\fa108a48-5550-4c3d-8248-a0c9098c9f1e\scratchpad\`.
    - The reports are `research\research-A.md` to `research-G.md` and `research\trainer.md`; the drafts are in
      `research\drafts-A\test\…` to `research\drafts-G\test\…`, laid out like `test\`. `drafts-C\harness.patch` is the
      screen reader change of task 0.
    - The drafts ran green on the session branch before task 0, but they are starting points, not finished tests.
      Where a draft file is an existing test file with new describes appended, take the appended part and leave the
      existing tests as they are, except where a task says otherwise.
    - Do not copy the research's break lists or mutation ids into test comments.
    - Scratch scripts go only into `scratchpad\task-<N>\`, because the scratchpad is shared.
- **CRLF.** The repo files are CRLF. The drafts and `harness.patch` carry LF lines. `sed -i` and `perl -i` under Git Bash
  rewrite edited lines as LF, so edit with the Edit tool (or write new files with the Write tool), and check `git diff`
  for line-ending noise before committing.
- **Reports** go to the scratchpad as `task-<N>\report.md`, written with the Bash tool (`cat > '<path>' <<'EOF'`). If
  the heredoc fails on text full of quotes, use the Write tool. Check with `ls -l` that the file exists. The report lists
  per item the test path, spec or characterization, any change of verdict with its reason, every suspected bug with a
  reproduction, and the per-describe label audit. The reply to the controller is only the status, the head commit and
  concerns.

**User decisions (already made):**
- The trainer: "one agent for all trainer questions before the design" (done; `research\trainer.md`).
- Evidence: "the guide's figures and photos of real units count as evidence for a bug with a pin, as for #199".
- Map scales: "the code's list is characterized and a `question` issue lists the scales the figures and photos show".
- Super NAV 5 near the MAP: "the figure is the spec for AUTO near the MAP: task 2 checks it with a missed-approach world
  and pins it if the code picks a larger scale".
- NO INTRCPT on Super NAV 5: "a `question` issue, no pin".
- The task split, the rulings and the controller's defaults of the design: approved.
- "Design approved, please write the plan".

## Placeholders

Each task uses the numbers its rows name. Task 8 files one issue per row (or, where its search finds one, a comment on
the existing issue) and replaces the placeholder everywhere. A row marked "if confirmed" is filed only when its task
confirms the bug; otherwise the task reports it and the session log gets a line.

| placeholder | research | kind | where it appears |
|---|---|---|---|
| `#NEW-1-1` | A-1, E-2, F-1 | bug (`DurationDisplay` shows `:60`; like #99 and #184) | pins, `Nav1Page.test.ts` (task 1), `Oth6Page.test.ts` (task 5), `Tri3Page.test.ts` (task 6) |
| `#NEW-1-2` | A-2 | bug (longitude dashes) | pins, `Nav2Page.test.ts` and `NullDashes.test.ts` (task 1) |
| `#NEW-1-3` | A-3 | bug (half a deviation bar next to TO) | pin, `Nav1Page.test.ts` |
| `#NEW-1-4` | A-4 | bug (a distance rounding up to the cutoff overflows) | pins, `Nav1Page.test.ts`, `Nav3Page.test.ts` |
| `#NEW-1-5` | A-5 | bug (the direct-to symbol split) | pins, `Nav1Page.test.ts`, `SuperNav1Page.test.ts`, `ActiveWaypoint.test.ts` (two) |
| `#NEW-1-6` | A-6 | bug (a two-letter VOR moves the NAV 2 radial) | pin, `Nav2Page.test.ts` |
| `#NEW-1-7` | A-7 | bug (`VNV INNaN:` at zero ground speed) | pin, `Nav4Page.test.ts` |
| `#NEW-1-8` | trainer Q3 | bug (degrees below 10 with a zero) | pins, `Nav2Page.test.ts` (task 1) |
| `#NEW-2-1` | B-1 | bug (NAV 5 cursor start) | pin, `Nav5Page.test.ts` |
| `#NEW-2-2` | B-2 | bug (a VOR or NDB of FPL 0 labeled twice) | pin, `SuperNav5Page.test.ts` |
| `#NEW-2-3` | B-3 | bug (AUTO ignores the active waypoint) | pin, `SuperNav5Page.test.ts` |
| `#NEW-2-4` | maintainer | bug, if confirmed (AUTO near the MAP) | pin, `SuperNav5Page.test.ts` |
| `#NEW-2-5` | B Q4, maintainer | question (the map scales between 1 and 1000 NM) | comments on the scale-list characterizations, `Nav5Page.test.ts` and `SuperNav5Page.test.ts` |
| `#NEW-2-6` | B Q5, maintainer | question (where NO INTRCPT shows on Super NAV 5) | issue only |
| `#NEW-2-7` | A, B (the `ObsDtkElement.innerRight` lead) | bug, if confirmed (the OBS knob on Super NAV 5) | pin, `SuperNav5Page.test.ts` |
| `#NEW-3-1` | C-1 | bug (FPL 0 scrolls the from waypoint off above a header) | pin, `FplPage.test.ts` |
| `#NEW-3-2` | C-2 | bug (the refused waypoint stays after FPL FULL) | pin, `FplPage.test.ts` |
| `#NEW-3-3` | trainer Q7 | bug (a blank 31st position in a full numbered plan) | pin, `FplPage.test.ts` |
| `#NEW-4-1` | D-1, trainer Q5b | bug (CLR then ENT on the SET 1 WPT field throws) | pin, `Set1Page.test.ts` |
| `#NEW-4-2` | D-2 | bug (SET 1 ground speed ` 00 KT`) | pin, `Set1Page.test.ts` |
| `#NEW-4-3` | D-4 | bug (repeated CLR never ends the SET 0 update) | pin, `Set0Page.test.ts` |
| `#NEW-4-4` | D-5 | bug (`SURFACE` without its colon) | pin, `Set3Page.test.ts` |
| `#NEW-4-5` | trainer Q5a | bug (SET 1 cursor to the latitude, not CONFIRM?) | pin, `Set1Page.test.ts` |
| `#NEW-5-1` | E-1, F-3 | bug (the wind direction without the true-north symbol) | pins, `Oth9Page.test.ts` (task 5), `Cal3Page.test.ts` (task 6) |
| `#NEW-5-2` | E-3 | bug (OTH 8 TOTAL `0` without the fuel used output) | pins, `Oth8Page.test.ts` (two) |
| `#NEW-5-3` | E-4 | bug (OTH 2 keeps the old Center) | pin, `Oth2Page.test.ts` |
| `#NEW-5-4` | E-5 | bug (OTH 4 misses a re-added airport) | pin, `Oth4Page.test.ts` |
| `#NEW-5-5` | E (outside) | bug (the RMKS FULL guard never triggers); check #92 first | pin, `test/unit/settings/RemarksManager.test.ts` |
| `#NEW-6-1` | F-2 | bug (TRI 5 averages leg ground speeds) | pin, `Tri5Page.test.ts` |
| `#NEW-6-2` | F-4 | bug (CAL 4 FPM edited from a stale value) | pin, `Cal4Page.test.ts` |
| `#NEW-6-3` | F-5 | bug (a temperature typed sign first loses its minus) | pins, `Cal1Page.test.ts`, `Cal5Page.test.ts` |
| `#NEW-6-4` | F Q3, Q4 | question (out-of-range calculator values: `010°F`, `115mph`, a blank F REQ) | issue only |
| `#NEW-7-1` | G-1, trainer Q13 | bug (no header row, five waypoints); see #168 | pin, `DuplicateWaypointPage.test.ts` |
| `#NEW-7-2` | G-2 | bug (the ALT warn altitude reset at power-on); references #192 | pins, `AltPage.test.ts`, `VolatileMemory.test.ts` |
| `#NEW-7-3` | G-3 | bug (MOD 1/MOD 2 CDI scale undefined after a mode change); related to #159, #160 | pin, `Mod1Page.test.ts` |
| `#NEW-7-4` | G-4 | bug (a course set on MOD 2 overwritten by the indicator) | pin, `Mod2Page.test.ts` |
| `#NEW-7-5` | G, trainer Q14 | bug (`NO SUCH WPT` instead of the user waypoint creation) | pins, `DirectToPage.test.ts` (task 7), `FplPage.test.ts` if task 3 confirms the FPL half |
| `#NEW-7-6` | G, trainer Q11 | bug (an OBS course of 359.5 or more shows `360°`; a probe while the plan was written reached it); related to #122 | pin, `Mod2Page.test.ts` |

Known issues this session pins or comments without a placeholder: #99 (the latitude and the longitude pin, `Nav2Page.test.ts`), #150 (the
numbered-plan pin in `FplPage.test.ts`, and a comment), #160 (the MOD 2 pin in `Mod2Page.test.ts`, and a comment),
#213 (the STA 1 pin), #217 (the SET 2 MAG V pin in `Set2Page.test.ts`, and a comment), #192 (a comment).

---

## Facts every batch needs (from the research pass)

**Boot and settle.**
- `bootUnit` boots force-ready with the GPS valid at once; `await settle(unit)` waits for the fix and two calculation
  ticks, so FPL 0 has activated. `bootUnit({coldGps: true})` boots without a fix (about 62 s to acquire);
  `engineRunning: false` boots dark until `unit.panel.powerOn()`.
- One calculation tick is `await vi.advanceTimersByTimeAsync(1000)`, one display tick 250 ms. Every panel click advances
  one display tick. The nearest lists search every 10 s, the first time on the tenth calculation tick, so a page that
  shows a nearest VOR waits 12 s.
- `moveAircraft(unit, point, {groundspeedKt, trackTrue?})` gives the GPS a track and a ground speed, then holds the
  position (a paused sim). A held position with ground speed can sequence the leg, so keep the aircraft away from the
  next waypoint.

**The default navdata.** Every boot also holds `ZZXA`, `ZZV`, `ZZN`, `ZZXIN` far away, so never give a test facility an
ident starting with `ZZ`, and choose idents that sort before them. An unknown ident for a "no such waypoint" test is
one that no facility of the world has, for example `QQQQ`.

**The MSG annunciator is lit** on every engine-running boot (`testing.md` section 6), so a status-line assertion reads
`status().left` and `status().right`, and a message test asserts the exact message list
(`unit.props.messageHandler.getMessages().map(m => m.message.join(' '))`), never "any message". The mode field shows
`msg` after the mode; assert it only where it is the subject.

**Reading the screen.**
- `Screen.read()` gives `rows(side)`, `maskRows(side)`, `half(side)`, `row(n)`, `status()` and `dump()`;
  `unit.panel.focused(side)` the one focused field `{row, col, text}` with the columns of the whole screen (the right
  half starts at column 12).
- After task 0, `Screen.read()` reads a numbered FPL page with waypoints (the `USE?` overlay).
- `Screen.read()` throws once a row is wider than its half page, and so does `selectPage`, which reads the screen. A pin
  of an overflow (`#NEW-1-4`) selects its page first, then moves into the overflow, and its sibling reads the raw row
  with `readRows(document.querySelector('.left-page')!)`.
- NAV 5 and Super NAV 5 draw on a canvas. After task 0, `recordMap(names)` (`test/harness/render/mapRecorder.ts`,
  installed **before** the boot) records what the map draws per redraw: `drawn` (`'icon 2 ABC'`, `'label ABC ABC'`,
  `'arrow KAAA ABC'`, `'line ABC KBBB'`) and `pixels` (`[symbol, x, y]` in map pixels). `downsampled(canvasToAscii(el))`
  (`test/harness/render/canvas.ts`) gives one character per 4×4 block for a file snapshot.
- Super NAV 5 has no status line and is not a text grid: read it with `SuperNav5.read()`
  (`{left, msg, range, right, directTo}`); its cursor needs a local `focused` helper over the `.inverted` spans (research
  B; the reader has no mask). `selectPage` cannot end on Super NAV 5: select the page before it and turn the last click
  with `unit.panel.inner`. Super NAV 1 is reached with `selectPage('L', 'NAV 1')`, then `selectPage('R', 'NAV 1')`.
- STA 3 shows the version: mock `kln90b/Version.ts` in the test file as `test/render/harness/selectPage.test.ts` does.
- The blink phase changes the mask; if a test is flaky on `B` or `F` cells, assert the text only.

**The fuel computer.** It reads `NUMBER OF ENGINES` once, in its constructor (`Sensors.ts`). After task 0 a test boots
with `bootUnit({panelXml, simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 2}]})`; without it the unit
counts no real engine and every fuel flow and fuel used is 0. OTH 5 to OTH 8 exist only with a fuel computer in
panel.xml, OTH 9 and OTH 10 only with air data (`PageTreeController.ts:135`). Avgas in US gallons is 6 lb per gallon
(the SDK's autogas gallon).

**The course key events.** After task 0, `unit.env.sim.applyObsKeyEvents = true` makes `K:VOR1_SET` and `K:VOR2_SET`
set `Nav OBS:1` and `Nav OBS:2`, as the sim does; the teardown turns it off. Without it key events are only recorded.

**`selectPage` side effects.** `selectPage` turns the knobs through the pages on its way, and each page it passes is
built and runs its own code:
- On the way from CAL 1 to CAL 3 it shows CAL 2, which overwrites the CAL 3 TAS (#33), so a CAL 3 test enters the TAS
  with the knobs.
- The TRI pages read their volatile memory (`unit.props.memory.triPage`) when they are built, so a test seeds it before
  `selectPage`.

**`enterIdent` and `cursorTo`.** After task 0, `enterIdent` starts the edit of an editor that already shows the first
character (the NAV 4 VNAV waypoint), and `cursorTo` throws at once when that side's cursor is off. `cursorTo` compares
trimmed text, so `' OFF'` is passed as `'OFF'`.

**Expected rejections.** An ENT that throws is an unhandled rejection; a test that provokes one takes it with
`unit.takeRejections()`, or the harness fails the test when it ends.

**Durations and coordinates near the boundary.** The trainer showed that the KLN 89 never shows `:60` or `60.00'`; the
hour and the degree roll over. Whether the 90B rounds or truncates is unsettled, so the `#NEW-1-1` and #99 pins accept
both readings (`:59` or the next whole hour; `59.99'` or the next whole degree).

**Degrees below 10.** The trainer showed them blank-padded (`N  8°`), with zeros only inside an open edit field; the
code shows `E 08°`, which is `#NEW-1-8`. Tests outside task 1's pins use positions with two-digit degrees.

**Trainer citations.** The KLN 89 trainer was driven on 2026-10-07 (`research\trainer.md`). A spec test that rests on it
says "checked in the KLN 89 trainer, 2026-10-07" in its title or comment, next to the 90B page where there is one. A KLN
89 result is weaker evidence than a 90B page, and the maintainer accepts it where the 90B guide is silent.

**Long tests.** The render stage keeps Vitest's 5 s default. A test that advances minutes of simulated time needs a
per-test timeout (the CAL 6 tests of `VolatileMemory.test.ts` have `20_000`). None of the drafts needs one; the CAL 6
drafts advance no time.

---

### Task 0: harness

**Goal:** Let `Screen.read()` read a numbered FPL page with waypoints, add the map recorder and move `downsampled()` into
the harness, add the `simVars` boot option and the opt-in course key events of `FakeSim`, make `enterIdent` start the
edit of an editor that already shows the first character and `cursorTo` refuse to run with the cursor off, and document
each in `testing.md`.

**Files:**
- Modify: `test/harness/render/screen.ts` (the `.use-invert` overlay in `readRows`)
- Modify: `test/render/harness/screen.test.ts` (append the overlay describe)
- Create: `test/harness/render/mapRecorder.ts`
- Create: `test/render/harness/mapRecorder.test.ts`
- Modify: `test/harness/render/canvas.ts` (append `downsampled`)
- Modify: `test/render/pages/left/Nav5Page.test.ts` (the local `downsampled` removed and imported; nothing else)
- Modify: `test/harness/boot.ts` (`BootOptions.simVars`, `prepareBoot`)
- Create: `test/render/harness/simVars.test.ts`
- Modify: `test/harness/sim/FakeSim.ts` (`applyObsKeyEvents`)
- Modify: `test/unit/harness/fakes.test.ts` (a new describe)
- Modify: `test/harness/flight/FrontPanel.ts` (`enterIdent`, `cursorTo`)
- Modify: `test/render/harness/enterIdent.test.ts` (two new tests; the longitude rows of the selector `it.each`)
- Modify: `docs/testing.md` (sections 3, 4 and 7)

**Acceptance Criteria:**
- [x] `Screen.read()`, `selectPage`, `focused` and `cursorTo` work on FPL 3 with waypoints; the overlay tests and the
      booted FPL 3 test pass, and each fails with the overlay branch removed except the one whose overlay is hidden.
- [x] `recordMap` records the last complete redraw by name and pixel and still draws; `downsampled` lives in
      `canvas.ts`, and `Nav5Page.test.ts` imports it with its tests unchanged and green.
- [x] `bootUnit({simVars})` sets SimVars before `KLN90BCore.init`, after the boot's own: a fuel computer booted with
      `NUMBER OF ENGINES` 2 counts two engines, and one booted without counts one.
- [x] `FakeSim.applyObsKeyEvents` is off by default and after `reset()`; on, `K:VOR1_SET` and `K:VOR2_SET` set
      `Nav OBS:1` and `Nav OBS:2`.
- [x] `enterIdent` enters `AAA` over the NAV 4 VNAV waypoint `ABC`; `cursorTo` with the cursor off throws without a
      click.
- [x] The selector `it.each` of `enterIdent.test.ts` no longer asserts the `E 09°` rows (`#NEW-1-8`, rule 8).
- [x] `testing.md` documents each change; the section 7 notes on the `.use-invert` gap and on SimVars before `init` are
      replaced.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: the `USE?` overlay** (research C, part 1; `research\drafts-C\harness.patch`). `FlightplanList.tsx`
  renders `USE? INVRT?` and then, in a `<span class="use-invert">`, the `USE?` button, which `KLN90B.scss` pulls back
  eleven cells over the first four cells of `USE? INVRT?`. Apply the patch's hunks for `test/harness/render/screen.ts`
  and `test/render/harness/screen.test.ts` by hand with the Edit tool (the patch is LF). In `screen.ts`, after
  `attrOf`:

```ts
/**
 * How far the USE? button of a numbered flight plan is pulled back over `USE? INVRT?`: a negative CSS margin of eleven
 * cells (KLN90B.scss .use-invert, FlightplanList.tsx UseInvertButton), so it covers the first four cells of its row.
 */
const USE_INVERT_SHIFT = 11;

/**
 * Reads the text that `read` adds to the current row as an overlay that starts USE_INVERT_SHIFT cells further left,
 * over cells already in the row. An inverted or flashing overlay cell replaces the cell below. A normal overlay cell has
 * no background of its own, so it shows the cell below, which must then be normal too: over an inverted cell its green
 * glyph would cover the black one and fill the cell green, which `UseInvertButton.tick` hides the USE? button to avoid
 * (FlightplanList.tsx). Both must be the same character, since the screen cannot show two glyphs in one cell. Either
 * case is a rendering bug and throws.
 */
function overlay(rows: Cell[][], read: () => void): void {
    const row = rows[rows.length - 1];
    const end = row.length;
    const count = rows.length;
    read();
    if (rows.length !== count) throw new Error('Screen: a line break inside the USE? overlay (.use-invert)');
    const cells = row.splice(end);
    if (cells.length === 0) return;
    const at = end - USE_INVERT_SHIFT;
    if (at < 0 || at + cells.length > end) {
        throw new Error(`Screen: the USE? overlay "${cells.map(c => c.ch).join('')}" does not lie over its row "${row.map(c => c.ch).join('')}"`);
    }
    cells.forEach((cell, i) => {
        const below = row[at + i];
        if (cell.ch !== below.ch) {
            throw new Error(`Screen: the USE? overlay shows "${cell.ch}" over "${below.ch}" in cell ${at + i}`);
        }
        if (cell.attr !== '.') {
            row[at + i] = cell;
        } else if (below.attr !== '.') {
            throw new Error(`Screen: the USE? overlay draws a normal "${cell.ch}" over an inverted cell ${at + i}`);
        }
    });
}
```

  and in `readRows`, right before `el.childNodes.forEach(c => walk(c, a, pre));`:

```ts
        if (el.classList.contains('use-invert')) {
            overlay(rows, () => el.childNodes.forEach(c => walk(c, a, pre)));
            return;
        }
```

  Append the patch's describe `'Screen, the USE? overlay of a numbered flight plan'` to `screen.test.ts` (with the
  imports of `savedFlightplan` and `standardRoute`): USE? INVRT? read once with a normal overlay; the cursor on USE?
  (`IIII.......`); a flashing overlay (`FFFF.......`); the cursor on USE? INVRT? with the overlay hidden
  (`IIIIIIIIIII`); throws for a normal overlay over inverted cells, for other characters (`LOAD` over `USE?`) and for
  an overlay left of its row; and the booted unit: FPL 3 with KAAA, ABC, KBBB, `selectPage('L', 'FPL 3')`, the rows
  `['USE? INVRT?', '  1:KAAA   ', '  2:ABC    ', '  3:KBBB   ', '  4:       ', '           ']`, `cursor` focuses
  `{row: 0, col: 0, text: 'USE?'}`, one outer click `{row: 0, col: 0, text: 'USE? INVRT?'}`.
  Predicted: with the overlay branch removed every test of the describe fails except the one with the hidden overlay
  (the old reader reads it right). Research C also recorded `USE_INVERT_SHIFT = 10`, "the overlay always replaces",
  "never replaces" and "no character check", each failing exactly the tests that hold that rule, and the instrument
  break of `UseInvertButton.tick` no longer hiding USE? (`FlightplanList.tsx:78`), which fails the booted test. Run
  them.

- [x] **Step 2: the map recorder and `downsampled`** (research B, "How the maps are observed").
    - Copy `research\drafts-B\test\harness\render\mapRecorder.ts` to `test/harness/render/mapRecorder.ts` with the
      Write tool. It exports `recordMap(names: Record<string, LatLonInterface> = {})`, which wraps the drawing methods of
      `CoordinateCanvasDrawContext` (`drawIcon`, `drawLabel`, `drawFlightplanLine`, `drawFlightplanArrow`, `drawLine`,
      `fill`) and `CanvasDrawContext.drawIcon` with pass-through spies restored by `onTestFinished`, and returns
      `{drawn, pixels, reset()}`. A point is named after the first entry of `names` it equals to 1e-6 degrees, else
      `lat,lon` with four decimals.
    - Append to `test/harness/render/canvas.ts`, and remove the local function of the same name from
      `test/render/pages/left/Nav5Page.test.ts` (import it there with `canvasToAscii`):

```ts
/**
 * The maps draw in blocks of ZOOM_FACTOR (4) canvas pixels (Canvas.tsx), so one character per block keeps every drawn
 * pixel and makes a map snapshot readable: a block is lit when any of its pixels is. Takes the output of canvasToAscii;
 * a block cut off at the right or bottom edge counts the pixels it has.
 */
export function downsampled(ascii: string, block = 4): string {
    const rows = ascii.split('\n');
    const out: string[] = [];
    for (let y = 0; y < rows.length; y += block) {
        let line = '';
        for (let x = 0; x < rows[y].length; x += block) {
            let lit = false;
            for (let dy = 0; dy < block && !lit; dy++) {
                lit = rows[y + dy]?.slice(x, x + block).includes('#') === true;
            }
            line += lit ? '#' : '.';
        }
        out.push(line);
    }
    return out.join('\n') + '\n';
}
```

    - Create `test/render/harness/mapRecorder.test.ts` (these literals ran green against the real map):

```ts
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {recordMap} from '../../harness/render/mapRecorder';
import {canvasToAscii, downsampled} from '../../harness/render/canvas';

describe('recordMap (harness)', () => {
    /** NAV 5 on the left, north up at 40 NM, no flight plan: the map draws only the aircraft, at its center */
    async function nav5(names: Parameters<typeof recordMap>[0] = {}) {
        const map = recordMap(names);
        const unit = await bootUnit({position: {lat: 47, lon: 8}});
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);
        return map;
    }

    // The map is 99 x 78 map pixels (the 396 x 312 canvas in blocks of 4); the aircraft at its center, rounded to a
    // whole map pixel
    it('records the symbols of the last complete redraw with their point and pixel', async () => {
        const map = await nav5();

        expect(map.drawn).toEqual(['icon $ 47.0000,8.0000']);
        expect(map.pixels).toEqual([['$', 50, 39]]);
    });

    it('names a point after the entry of names it equals', async () => {
        const map = await nav5({HOME: {lat: 47, lon: 8}});

        expect(map.drawn).toEqual(['icon $ HOME']);
    });

    // The spies pass every call on: the canvas still shows the aircraft diamond around the center
    it('still draws: the canvas shows the aircraft symbol', async () => {
        await nav5();

        const lit = downsampled(canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement)).split('\n')
            .flatMap((row, y) => [...row].map((c, x) => c === '#' ? `${x},${y}` : '')).filter(c => c !== '');
        expect(lit).toEqual(['49,36', '48,37', '49,37', '50,37', '47,38', '48,38', '49,38', '50,38', '51,38', '47,39', '48,39',
            '49,39', '50,39', '51,39', '48,40', '49,40', '50,40', '49,41']);
    });

    it('forgets the last frame on reset until the map draws again', async () => {
        const map = await nav5();

        map.reset();
        expect(map.drawn).toEqual([]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(map.drawn).toEqual(['icon $ 47.0000,8.0000']);
    });
});

describe('downsampled (harness)', () => {
    it('gives one character per block, lit when any pixel of the block is, also for a cut-off block', () => {
        expect(downsampled(['#.......', '........', '........', '........', '.....#..'].join('\n'))).toBe('#.\n.#\n');
    });
});
```

  Predicted: before the two files exist the test file fails to import. Prove the recorder with your own breaks (a spy
  that does not call the original fails "still draws"; a `fill` wrapper that does not end the frame fails the others).

- [x] **Step 3: the `simVars` boot option.** In `test/harness/boot.ts`, add to `BootOptions` after `platform`:

```ts
    /**
     * SimVars set before KLN90BCore.init, after the ones bootUnit sets itself (so they win), for values the unit reads
     * only while it is built: the fuel computer reads NUMBER OF ENGINES in its constructor (Sensors.ts)
     */
    simVars?: { name: string; unit: string; value: number | boolean | string }[];
```

  and in `prepareBoot`, right after `env.sim.set('GPS DRIVES NAV1', 'bool', true);`:

```ts
    for (const v of opts.simVars ?? []) {
        env.sim.set(v.name, v.unit, v.value);
    }
```

  Create `test/render/harness/simVars.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';

const FUEL_COMPUTER_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><FuelComputer><IsInterfaced>true</IsInterfaced>'
    + '</FuelComputer></Input></Instrument></PlaneHTMLConfig>';

describe('bootUnit simVars (harness)', () => {
    // The fuel computer reads NUMBER OF ENGINES once, in its constructor (Sensors.ts), so only a value set before
    // KLN90BCore.init reaches it
    it('sets a SimVar before the unit is built: the fuel computer counts two engines', async () => {
        const unit = await bootUnit({panelXml: FUEL_COMPUTER_XML, simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 2}]});

        expect(unit.props.sensors.in.fuelComputer.numberOfEngines).toBe(2);
    });

    it('leaves the fuel computer at one engine without the option', async () => {
        const unit = await bootUnit({panelXml: FUEL_COMPUTER_XML});

        expect(unit.props.sensors.in.fuelComputer.numberOfEngines).toBe(1);
    });

    it('sets its values after the ones bootUnit sets, so a test can override one', async () => {
        const unit = await bootUnit({simVars: [{name: 'GPS DRIVES NAV1', unit: 'bool', value: false}]});

        expect(unit.env.sim.get('GPS DRIVES NAV1', 'bool')).toBe(0);
    });
});
```

  Predicted without the option: the first and the third test fail, the second passes (it holds the default).

- [x] **Step 4: the course key events of `FakeSim`.** In `test/harness/sim/FakeSim.ts`, above `ABSOLUTE_TIME_OFFSET_S`:

```ts
/** The key events that set a course SimVar when FakeSim.applyObsKeyEvents is on */
const OBS_KEY_EVENTS: Record<string, string> = {'K:VOR1_SET': 'NAV OBS:1', 'K:VOR2_SET': 'NAV OBS:2'};
```

  after `gameVars`:

```ts
    /**
     * Off by default: key events only go to keyEvents. On, K:VOR1_SET and K:VOR2_SET set Nav OBS:1 and Nav OBS:2 to
     * their value in degrees, as the sim does, for a test of an indicator the unit drives (ObsTarget). reset() turns it
     * off again.
     */
    public applyObsKeyEvents = false;
```

  `this.applyObsKeyEvents = false;` as the last line of `reset()`, and in `writeReg`:

```ts
        if (reg.key.startsWith('K:')) {
            this.keyEvents.push({time, name: reg.key, value: Number(v)});
            const obs = OBS_KEY_EVENTS[reg.key];
            if (this.applyObsKeyEvents && obs !== undefined) {
                this.set(obs, 'degrees', Number(v));
            }
            return;
        }
```

  In `test/unit/harness/fakes.test.ts`, before `describe('FakeSim through the SDK SimVar functions'`:

```ts
describe('FakeSim, the course key events (applyObsKeyEvents)', () => {
    afterEach(() => sim.reset());

    it('records K:VOR1_SET without moving Nav OBS:1 by default', () => {
        sim.reset();
        SimVar.SetSimVarValue('K:VOR1_SET', SimVarValueType.Number, 93);

        expect(sim.keyEvents.map(k => k.name)).toEqual(['K:VOR1_SET']);
        expect(sim.has('Nav OBS:1')).toBe(false);
    });

    it('sets Nav OBS:1 and Nav OBS:2 from K:VOR1_SET and K:VOR2_SET when on, as the sim does', () => {
        sim.reset();
        sim.applyObsKeyEvents = true;
        SimVar.SetSimVarValue('K:VOR1_SET', SimVarValueType.Number, 93);
        SimVar.SetSimVarValue('K:VOR2_SET', SimVarValueType.Number, 271);

        expect(sim.get('Nav OBS:1', 'degrees')).toBe(93);
        expect(sim.get('Nav OBS:2', 'degrees')).toBe(271);
        expect(sim.keyEvents.map(k => [k.name, k.value])).toEqual([['K:VOR1_SET', 93], ['K:VOR2_SET', 271]]);
    });

    it('turns the option off again on reset, so the next unit starts without it', () => {
        sim.applyObsKeyEvents = true;
        sim.reset();

        expect(sim.applyObsKeyEvents).toBe(false);
    });
});
```

  Predicted without the option: the second and third test fail, the first passes.

- [x] **Step 5: `enterIdent` and `cursorTo`** (research A and B, "Harness gaps"). In `FrontPanel.enterIdent`, replace
  the editor loop with:

```ts
        for (let i = 0; i < ident.length; i++) {
            if (i > 0) await this.outer(side, 1);
            const turned = await this.setChar(side, i, ident[i], ALPHABET);
            if (i === 0 && !turned) {
                // The first character showed the wanted letter already, so no click started the edit (Editor.innerRight:
                // the first click enters the editor), and the outer knob would leave the field. Start it as a pilot
                // would, with one click, and set the character again.
                await this.inner(side, 1);
                await this.setChar(side, 0, ident[0], ALPHABET);
            }
        }
```

  and at the start of `cursorTo`:

```ts
        // A page name in the status field means the cursor is off: the outer knob would turn the pages, and the search
        // would end on another page. (The self-test pages show no name there.)
        const status = this.screen().status()[side === 'L' ? 'left' : 'right'];
        if (status !== '' && status !== 'CRSR' && status !== 'KYBD') {
            throw new Error(`cursorTo: the ${side} cursor is off (the status line shows ${status}); turn it on first\n${this.screen().dump()}`);
        }
```

  In `test/render/harness/enterIdent.test.ts` (imports `settle`, `savedFlightplan`, `standardRoute`):
    - in `describe('in an editor')`, before `'enters an ident that fills the editor'`:

```ts
        // The first knob click on an editor starts the edit (Editor.innerRight); while the editor is not in its edit, the
        // outer knob moves the page cursor to the next field (CursorController.outerRight). When the field already shows
        // the first character, enterIdent clicks once anyway, as a pilot would. NAV 4 shows the active waypoint ABC as
        // its VNAV waypoint, and the page has more fields after it.
        it('starts the edit when the editor already shows the first character: AAA over ABC on NAV 4', async () => {
            const {kaaa, abc, kbbb} = standardRoute();
            const unit = await bootUnit({
                facilities: [kaaa, abc, kbbb, vor('AAA', 47.3, 8.3)], position: {lat: kaaa.lat, lon: kaaa.lon},
                storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            });
            await settle(unit);
            await unit.panel.selectPage('L', 'NAV 4');
            await unit.panel.cursor('L');
            await unit.panel.cursorTo('L', 'ABC');
            const at = unit.panel.focused('L'); // the precondition: the VNAV waypoint field, first character A

            await unit.panel.enterIdent('L', 'AAA');

            expect(Screen.read().row(at.row).slice(at.col, at.col + 5)).toBe('AAA  ');
            expect(unit.panel.focused('L')).toEqual({row: at.row, col: at.col, text: 'AAA  '});
        });
```

    - in `describe('focused and cursorTo')`, before `'throws with the screen when the field is not within the clicks'`:

```ts
        it('throws at once when the cursor of that side is off, without turning the pages', async () => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
            await unit.panel.selectPage('R', 'APT 1');
            const outer = vi.spyOn(unit.panel, 'outer');

            await expect(unit.panel.cursorTo('R', 'USER POS?')).rejects.toThrow(/the R cursor is off/);
            expect(outer).not.toHaveBeenCalled();
            expect(Screen.read().status().right).toBe('APT 1');
        });
```

    - the selector `it.each` (`'enters an ident on the %s page'`) asserts the rows of the page shown at 48 N 9 E, whose
      longitude row is `E 09°00.00'`, the zero of `#NEW-1-8`. Drop that last literal from each of the three rows and
      assert `Screen.read().rows('R').slice(0, 5)`, with a comment that the longitude row is left out because of
      `#NEW-1-8` (the latitude row still shows the typed facility).
  Predicted with the old `FrontPanel`: the NAV 4 test throws `enterIdent: cannot reach "A" at 1`; the `cursorTo` test
  fails because the old code turns the outer knob twenty times and throws `no field "USER POS?"`. A DIRECT TO page does
  not show the gap (its single field takes the outer knob back to itself), which is why the test uses NAV 4.

- [x] **Step 6: `testing.md`.**
    - Section 3, "The composition root", step 1 of `bootUnit()`: after the SimVars a booting unit reads, "then the
      test's own `simVars` (section 4), which win".
    - Section 3, "The global fakes", the `FakeSim` bullet **Key events have no effect**: keep it for every key event,
      and add that `sim.applyObsKeyEvents = true` makes `K:VOR1_SET` and `K:VOR2_SET` set `Nav OBS:1` and `Nav OBS:2`
      as the sim does, for a test of an indicator the unit drives (`ObsTarget`); `reset()` turns it off, so it lasts
      one test.
    - Section 3, "Reading the screen": the patch's bullet on the `USE?` overlay of a numbered flight plan (the reader
      lays the text of a `.use-invert` element over the cells it covers; other characters, or a normal overlay over
      inverted cells, throw).
    - Section 4, "Render", a new bullet after `storedSetting`: **SimVars the unit reads while it is built.**
      `bootUnit({simVars: [{name, unit, value}]})` sets them before `KLN90BCore.init`, after the boot's own. The fuel
      computer reads `NUMBER OF ENGINES` only in its constructor, so a fuel test with two engines boots with it.
    - Section 4, the **Canvas pages** bullet: `recordMap(names)` (`render/mapRecorder.ts`), installed before the boot,
      records per redraw what NAV 5, Super NAV 5 and APT 3 draw (`drawn`, `pixels`, `reset()`), with points named after
      the facilities given; and `downsampled()` (`render/canvas.ts`) for a map file snapshot.
    - Section 4, the `flight.panel` bullets: `enterIdent` in an editor that already shows the first character clicks
      once to start the edit; `cursorTo` throws at once when that side's status field shows a page name (the cursor is
      off), because the outer knob would turn the pages.
    - Section 7: remove the bullet **`Screen.read()` cannot read a numbered FPL page with legs**; replace the sub-bullet
      **SimVars before `init`** with a line that the `simVars` boot option (section 4) now exists and that the
      electricity tests (`SimVarSync.test.ts`, `PowerButton.test.ts`) still take the detour of a powered boot.

- [x] **Step 7: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines (each
  harness test against the removal of its harness code, as predicted above, plus the research C breaks).

```json:metadata
{"files": ["test/harness/render/screen.ts", "test/render/harness/screen.test.ts", "test/harness/render/mapRecorder.ts", "test/render/harness/mapRecorder.test.ts", "test/harness/render/canvas.ts", "test/render/pages/left/Nav5Page.test.ts", "test/harness/boot.ts", "test/render/harness/simVars.test.ts", "test/harness/sim/FakeSim.ts", "test/unit/harness/fakes.test.ts", "test/harness/flight/FrontPanel.ts", "test/render/harness/enterIdent.test.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["Screen.read reads FPL 3 with waypoints; overlay tests fail without the overlay branch except the hidden one", "recordMap records and still draws; downsampled moved to canvas.ts", "simVars sets SimVars before init: fuel computer counts two engines", "applyObsKeyEvents off by default and after reset, on moves Nav OBS:1/2", "enterIdent enters AAA over ABC on NAV 4; cursorTo throws with the cursor off", "enterIdent selector it.each no longer asserts E 09 rows", "testing.md sections 3, 4, 7 updated", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 1: NAV 1 to NAV 4 and Super NAV 1

**Goal:** Characterization and spec tests for NAV 1, NAV 2, NAV 3, NAV 4 and Super NAV 1, the pins `#NEW-1-1` to
`#NEW-1-8` and #99 (latitude and longitude), the existing NAV 2 test labeled, and the existing rows that freeze
`#NEW-1-2`, `#NEW-1-5` and `#NEW-1-8` turned into pins or taken out.

**Files:**
- Create: `test/render/pages/left/Nav1Page.test.ts`
- Modify: `test/render/pages/Nav2Page.test.ts` (the existing test labeled, its longitude row out; append)
- Modify: `test/render/pages/left/Nav3Page.test.ts` (append)
- Create: `test/render/pages/left/Nav4Page.test.ts`
- Create: `test/render/pages/left/SuperNav1Page.test.ts`
- Modify: `test/render/controls/displays/NullDashes.test.ts:31` (the `LongitudeDisplay` row)
- Modify: `test/render/data/flightplan/ActiveWaypoint.test.ts:68`, `:99` (the direct-to rows)
- Modify: `test/render/pages/right/Apt1Page.test.ts:81`, `:95`, `:109` (the longitude rows)
- Modify: `test/render/controls/editors/LatLonEditor.test.ts:19-20` (the longitudes)

**Acceptance Criteria:**
- [x] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [x] The pins `#NEW-1-1` to `#NEW-1-8` and the #99 pins turn red under their fixes; each has a passing sibling.
- [x] The existing test of `Nav2Page.test.ts` carries `characterization` and no longer asserts `E 08°00.00'`; that row
      is a `#NEW-1-8` pin expecting `E  8°00.00'`.
- [x] `NullDashes.test.ts` no longer asserts the longitude dashes `- --°--.--'`; a `#NEW-1-2` pin expects
      `----°--.--'`.
- [x] `ActiveWaypoint.test.ts` no longer asserts `'d    ›KBBB '`; each of the two tests has a `#NEW-1-5` pin beside it.
- [x] No test of the task asserts a degree below 10 written with a zero or a duration of `:60`.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: start from the drafts.** Read `research-A.md` and `research\trainer.md` Q1 to Q3. Copy
  `research\drafts-A\test\render\pages\left\{Nav1Page,Nav4Page,SuperNav1Page}.test.ts` to the same paths; from
  `drafts-A\…\Nav2Page.test.ts` and `drafts-A\…\left\Nav3Page.test.ts` take the appended describes. Rename `#NEW-A-1` to
  `#NEW-1-1` and so on: `#NEW-A-n` becomes `#NEW-1-n` for each n of the drafts.

- [x] **Step 2: NAV 1** (`Nav1Page.test.ts`; world: KDDD at 47 N 9 E, KAAA 200 NM west of it on the great circle that
  leaves KDDD on 270 true, FPL 0 KAAA, KDDD, the aircraft `nm` west of KDDD with `moveAircraft`; boot 5 NM further west
  and select NAV 1 before moving, because the DIS pin makes the screen unreadable).
    - `NAV 1 page (characterization)`: the leg, the bar, DIS, GS, ETE and BRG on an FPL 0 leg; `half('L')`
      `KAAA ›KDDD `, `ηηηηηΟηηηηη`, `DIS  64.8nm`, `GS    145kt`, `ETE     :27`, `BRG    089°`. Break: ETE floor rounding.
    - `shows DIS, GS and ETE as in the manual's VNAV example (5-7, 3-31)` (spec, figures 5-21 and 5-22): 64.8 NM at
      145 kt, rows 2 to 5; 26.8 min is `:27` and BRG 088.8 true (by hand) is `089°`. Breaks: `format(minutes, "00",
      {rounding: "floor"})` (`:26`); the hour shown at 0. The trainer's NAV 1 truncated; the 90B figure is the spec here.
    - `shows whole NM from 100 NM on and an ETE in hours and minutes (3-31)` (figure 3-97): 150.4 NM at 145 kt,
      `DIS   150nm`, `ETE    1:02`. Breaks: the cutoff `10**(length-1)`; hours not padded.
    - `shows BRG magnetic (3-31)`: magvar 10 E, `BRG    079°`. Break: BRG without `trueToMag`.
    - Sibling `reaches an ETE of 59.7 minutes (3-31)`: 99.5 NM at 100 kt, `ete/60` about 59.7, `DIS  99.5nm`,
      `GS    100kt`, the ETE label only. **Pin** `it.fails('never shows 60 minutes in the ETE (3-31, 5-7, #NEW-1-1)')`:
      accepts `ETE    1:00` or `ETE     :59` (today `  :60`). Fix: round the total minutes first
      (`Math.round(duration / 60)`) in `DurationDisplay.formatDuration`.
    - Sibling `reaches a distance of 99.97 NM (3-31)`: the left page is a `Nav1Page`, the raw DOM row starts `DIS `
      (`readRows`). **Pin** `it.fails('keeps DIS in its four cells just below 100 NM (3-31, #NEW-1-4)')`: accepts
      `DIS   100nm` or `DIS  99.9nm` (today `DIS  100.0nm`). Fix: compare the rounded value with the cutoff in
      `DistanceDisplay.tsx:48-52`.
    - `NAV 1 page, direct-to`: sibling `shows the active waypoint after the arrow on a direct-to (3-31)`: right status
      `NAV 1`, `rows('R')[0].slice(5)` is `›KDDD `. **Pin** `it.fails('draws the Direct To symbol directly in front of
      the waypoint (3-31, figure 3-97, #NEW-1-5)')`: `    d›KDDD `. Fix: right-align the `d` of the direct-to origin.
    - `NAV 1 deviation bar`: sibling `reaches 0.55 NM left of the course flying TO (3-31)`: XTK about -0.55, TO, scale 5,
      row length 11. **Pin** `it.fails('draws the whole bar next to the TO triangle (3-31, #NEW-1-3)')`: `ηηηηηΥΑηηηη`
      (today `ηηηηηΥηηηηη`). Fix: `(this.to ? TO_LETTERS[9] : FROM_LETTERS[9]) + targetChar` (`DeviationBar.tsx:72`).
    - The characterization at 64.8 NM shows `:27`, not near an hour; no snapshot holds `:60`.

- [x] **Step 3: NAV 2** (`test/render/pages/Nav2Page.test.ts`; `nav2At(position, facilities, magvar)` boots and waits
  12 s).
    - **The existing test** (`describe('NAV 2 page')`, `'shows radial and distance from the nearest VOR and the present
      position'`) has neither a citation nor a label. Retitle it `(characterization)`, take the longitude row
      `E 08°00.00'` out of its `toEqual` and its `dump()` snapshot (snapshot the dump without row 5), and keep the rest.
    - **Pin** `it.fails('shows a longitude below 10 degrees with a blank, not a zero (checked in the KLN 89 trainer,
      2026-10-07, #NEW-1-8)')`: the same boot (ABC at 47.2/8.0, the aircraft at 47/8), row 5 `E  8°00.00'`. The comment
      names the trainer (degrees below 10 blank-padded once entered, zeros only in an open edit field) and the photo of a
      KLN 90 in `reference-photos-index.md`. Sibling: the characterization above. Fix: pad the degrees with blanks in
      `LongitudeDisplay` (and `LatitudeDisplay`).
    - **Pin** `it.fails('shows a latitude below 10 degrees with a blank, not a zero (checked in the KLN 89 trainer,
      2026-10-07, #NEW-1-8)')`: `nav2At({lat: 8.5, lon: 47})`, row 4 `N  8°30.00'`. Sibling `reads a position 8°30' north
      (3-32)`: the GPS latitude is 8.5 and row 5 is `E 47°00.00'` (figure 3-103 format).
    - `NAV 2 page (characterization)`: S 33°30.25', W 122°15.50', ABC 0.3° north: `ABC  180°fr`, `     18.0nm`,
      `S 33°30.25'`, `W122°15.50'`. Breaks: the longitude width; minutes `00.0`.
    - `shows latitude and longitude in degrees and minutes to the hundredth (3-8, 3-32)` (figures 3-27, 3-103): the same
      position. Breaks: longitude `padStart(4)`; minutes `00.0`.
    - `shows the radial from the VOR in the station's magnetic variation (3-32)`: ABC declared 10 E
      (`magneticVariation: -10`), magvar 3, `ABC  170°fr`. The comment says that a radial is referenced to the station's
      own variation (the definition of a VOR radial). Break: `trueToMag(radialTrue)` at the aircraft (`177°`).
    - Sibling `shows the radial of a three-letter VOR in cells 5 to 8 (3-32)`: `ABC  180°fr`. **Pin**
      `it.fails('shows the radial of a two-letter VOR in cells 5 to 8 (3-32, #NEW-1-6)')`: `AB   180°fr` (today
      `AB  180°fr`); evidence a photo of a real unit and figure 3-103. Fix: `ident.padEnd(3)` (`Nav2Page.tsx:77`).
    - `NAV 2 coordinates next to a whole degree (#99)`: `justBelow = {lat: 48 - 1e-6, lon: 11 - 1e-6}`. Sibling `reads a
      position just below a whole degree (3-32)`: GPS coordinates, rows start `N 4` and `E 1`. `shows 00.00 minutes just
      above a whole degree (3-8, 3-32)`: `N 48°00.00'`, `E 11°00.00'`. **Pins** `it.fails('never shows 60 minutes of
      latitude (3-8, 3-32, #99)')` (accepts `N 48°00.00'` or `N 47°59.99'`) and `it.fails('never shows 60 minutes of
      longitude (3-8, 3-32, #99)')` (accepts `E 11°00.00'` or `E 10°59.99'`). Fix per pin: round each to 1/6000° before
      the split; each fix alone turns only its own pin red.
    - `NAV 2 before the first fix (3-8)`: `shows the reference VOR, the distance and the latitude as dashes (3-8)`
      (`coldGps`; figure 3-26 and a photo): rows 0-4 `PRESENT POS`, blank, `---  ---°fr`, `   ----.-nm`,
      `- --°--.--'`. Break: the distance dashes. **Pin** `it.fails('shows the longitude dashes in the cells of the three
      degree digits (3-8, #NEW-1-2)')`: row 5 `----°--.--'`. Fix: `LongitudeDisplay.tsx:31`.

- [x] **Step 4: NAV 3** (append to `Nav3Page.test.ts`; KDDD, KAAA 200 NM west, KEEE 30 NM east, FPL 0 KAAA, KDDD, KEEE so
  the ESA avoids #183; the aircraft 30 NM west of KDDD, `rightNm` south of the course, 120 kt; `ObsSource 0` where the OBS
  is entered).
    - `NAV 3 page (characterization)`: `KAAA ›KDDD `, `DTK    089°`, `TK     090°`, `FLY L 0.3nm`, `MSA 15900ft`,
      `ESA 15900ft`. Break: the L/R swap.
    - `shows OBS: with the course in OBS mode without an external indicator (3-32, 5-35, 5-36)` (figure 3-105):
      `OBS:   089°`. Break: the label always `OBS `.
    - `shows OBS without the colon when the course comes from the external indicator (5-35)`: default panel,
      `Nav OBS:1` 100, `OBS    100°`. Break: the label always `OBS:`.
    - `changes the OBS course with the inner knob under the cursor (5-35)` (figures 5-113, 5-114): focus
      `{row: 1, col: 7, text: '089°'}`, +2 → `OBS:   091°`, -3 → `OBS:   088°`. Break: `innerRight` +2.
    - `reads FLY L 0.3nm 0.3 NM right of the course (3-32)`. Break: the L/R swap.
    - Sibling `reaches 9.97 NM right of the course (3-32)`: XTK about 9.97, raw row starts `FLY L `. **Pin**
      `it.fails('keeps the cross track in its three cells just below 10 NM (3-32, #NEW-1-4)')` (figures 3-104, 3-105):
      accepts `FLY L  10nm` or `FLY L 9.9nm` (today `FLY L 10.0nm`). Fix: the `DistanceDisplay` fix of step 2.

- [x] **Step 5: NAV 4** (`Nav4Page.test.ts`; KDDD, KAAA 100 NM west, KEEE 30 NM east, FPL 0 KAAA, KDDD, KEEE; the
  aircraft 40 NM west of KDDD at 7500 ft, no ground speed).
    - `NAV 4 page (characterization)`: the right variant, `VNV INACTV`, `IND 07500ft`, `SEL:00000ft`, `KDDD :-00nm`,
      `ANGLE:-1.8°`, `maskRows` with `I` at row 3 col 4. Break: `Alt10` not read-only.
    - `enters SEL in 100 ft steps from the first SEL digit (3-55, 5-7)`: first focus `{3, 4, '0'}`; +1000 and +900 →
      `SEL:01900ft`, `nav4SelectedAltitude` 1900, `IND 07500ft`; the next outer step `{4, 0, 'KDDD '}`. Break:
      `Alt10.isReadonly = false`.
    - `labels the altitudes FR and TO and lets FR be entered without an altitude input (5-7)`: `AltimeterInterfaced`
      false; rows start `FR`, `TO`; first focus row 2. Breaks: `setReadonly(true)`; the label `IND `.
    - `accepts a waypoint ahead in FPL 0 (5-9, C-1)`: KEEE entered and confirmed (ENT, ENT): `nav4VnavWpt` KEEE, row 4
      `KEEE `. **Change from the draft:** enter it with `unit.panel.enterIdent` (task 0 fixed the editor that shows
      `KDDD`), not `unit.panel.type`. Break: validity limited to the active index.
    - `refuses a waypoint behind the aircraft with INVALID VNV (5-9, C-1)`: KAAA, `status().mode` `INVALID VNV`, the
      VNAV waypoint stays KDDD. Break: the validity check removed.
    - `NAV 4 VNAV started at zero ground speed`: sibling `starts VNAV at zero ground speed (5-8)`: GS 0, the state is not
      Inactive, row 0 starts `VNV `. **Pin** `it.fails('shows the advisory altitude when VNAV starts at zero ground speed
      (5-8, #NEW-1-7)')` (figure 5-26): `VNV 7500ft ` (today `VNV INNaN: `). Fix: `if (!(this.timeToVnav > 0))`
      (`Vnav.ts:36-37`).
    - The below-sea-level IND (research A Q5) is not tested; the report says so.

- [x] **Step 6: Super NAV 1** (`SuperNav1Page.test.ts`; the NAV 1 world, reached by `selectPage('L', 'NAV 1')`, then
  `selectPage('R', 'NAV 1')`).
    - `Super NAV 1 page (characterization)`: rows 0-5 `      KAAA ›KDDD       `, ` Ш Ш Ш Ш Ш Ў Ш Ш Ш Ш Ш `,
      `DIS  64.8nm   ETE   :27`, `GS    145kt   BRG  089°`, two blank rows. Break: ETE null.
    - `shows DIS, ETE, GS and BRG as in the manual's VNAV example (3-32, 5-7)` (figure 5-21): rows 2 and 3.
    - `shows the IAF suffix of the active waypoint, which NAV 1 does not show (6-6)`: `approachWorld()`, 20 NM north of
      KPRC, `loadProcedure('APT 8')`, IAFAA active: NAV 1 `ENRAA›IAFAA`; Super NAV 1 after the arrow `IAFAAà`. Break: the
      suffix dropped.
    - Sibling `shows the active waypoint after the arrow on a direct-to (3-32)`. **Pin** `it.fails('draws the Direct To
      symbol directly in front of the waypoint (3-31, figure 3-97, 3-32, #NEW-1-5)')`: row 0 trimmed matches
      `/d›KDDD$/` (today `      d    ›KDDD`). Fix in `SuperNav1Page.tsx:51,78`.

- [x] **Step 7: the existing rows that freeze bugs** (rule 8).
    - `NullDashes.test.ts:31`: take the `LongitudeDisplay` row out of the `it.each` (the describe is a characterization
      of the dash layouts) and add beside it `it.fails('LongitudeDisplay shows its dashes in the cells of the three
      degree digits (3-8, #NEW-1-2)')` asserting `----°--.--'`, citing figure 3-26 and the photo. Its sibling is the
      `LatitudeDisplay` row (the same rendering path). Prove: the fix turns this pin and the NAV 2 pin red.
    - `ActiveWaypoint.test.ts:68` and `:99`: in both tests (spec tests citing 3-28 and 4-10) replace
      `expect(screen.rows('R')[0]).toBe('d    ›KBBB ')` by `expect(screen.rows('R')[0].slice(5)).toBe('›KBBB ')` (the
      arrow and the ident, which the bug leaves right). Move each test's setup into a local helper and add beside each
      an `it.fails('… shows the Direct To symbol right before KBBB on NAV 1 (3-31, figure 3-97, #NEW-1-5)')` asserting
      `    d›KBBB `; the passing test is its sibling. Prove: the `#NEW-1-5` fix turns both red.
    - `Apt1Page.test.ts:81`, `:95`, `:109` (characterizations of the airport shown after the entry dropped off the
      nearest list) assert `E 08°00.00'`, the zero of `#NEW-1-8`. Remove the three longitude assertions and add one
      comment that the longitude row is left out because of `#NEW-1-8` and the latitude row holds the coordinates.
    - `LatLonEditor.test.ts:19-20` (a spec test of the hemisphere letter, 3-18) asserts `E 08°30.00` for an editor that
      is not being edited. Use 18.5 and -18.5 (`E 18°30.00`, `W 18°30.00`): the hemisphere stays the subject and the
      zero leaves the test.
    - `test/render/services/KeyboardService.test.ts:50` (the #109 pin) types into an open edit field, where the trainer
      saw zeros; leave it as it is.

- [x] **Step 8: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/left/Nav1Page.test.ts", "test/render/pages/Nav2Page.test.ts", "test/render/pages/left/Nav3Page.test.ts", "test/render/pages/left/Nav4Page.test.ts", "test/render/pages/left/SuperNav1Page.test.ts", "test/render/controls/displays/NullDashes.test.ts", "test/render/data/flightplan/ActiveWaypoint.test.ts", "test/render/pages/right/Apt1Page.test.ts", "test/render/controls/editors/LatLonEditor.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#NEW-1-1..8 and #99 pins turn red under their fixes, with siblings", "existing NAV 2 test labeled; its E 08 row is a #NEW-1-8 pin", "NullDashes longitude row is a #NEW-1-2 pin", "ActiveWaypoint direct-to rows are #NEW-1-5 pins", "no assertion of a zero-padded degree below 10 or a :60 duration", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 2: NAV 5 and Super NAV 5

**Goal:** Characterization and spec tests for NAV 5 and Super NAV 5 on the map recorder of task 0, the pins `#NEW-2-1` to
`#NEW-2-3`, the AUTO scale near the MAP checked (`#NEW-2-4`), the scale lists as characterizations naming the question
`#NEW-2-5`, and the `ObsDtkElement.innerRight` lead checked (`#NEW-2-7`).

**Files:**
- Modify: `test/render/pages/left/Nav5Page.test.ts` (append; the existing tests unchanged)
- Create: `test/render/pages/left/SuperNav5Page.test.ts`
- Create: `test/render/pages/left/__snapshots__/nav5Route.txt`, `test/render/pages/left/__snapshots__/superNav5Route.txt`

**Acceptance Criteria:**
- [x] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [x] The pins `#NEW-2-1` to `#NEW-2-3` turn red under their fixes; each has a passing sibling.
- [x] AUTO 0.3 NM before the MAP of a world with a missed approach is either a spec test showing `1` (6-9, figure 6-16)
      or the pin `#NEW-2-4` with a sibling; the report says which.
- [x] The OBS knob turned right on Super NAV 5 in OBS mode is either a spec test or the pin `#NEW-2-7`; the report says
      which.
- [x] The full scale list of each map is a characterization with the comment
      `// the scales between 1 and 1000 NM are a question: #NEW-2-5`.
- [x] No snapshot or literal shows a VOR or NDB of FPL 0 labeled twice; the menu's ` 000° N^` row is not asserted
      under a spec title.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: start from the drafts.** Read `research-B.md`, `research\trainer.md` Q4 and Q15 (the trainer has no map)
  and the design's "Maintainer's decisions". From `research\drafts-B\test\render\pages\left\Nav5Page.test.ts` take only
  the describes under the "Session 8 research drafts" banner (leave out the banner), and import `downsampled` from
  `test/harness/render/canvas.ts` (task 0 moved it) and `recordMap` from `test/harness/render/mapRecorder.ts`. Copy
  `SuperNav5Page.test.ts` without its local `downsampled`. Copy the two `__snapshots__` files. Rename `#NEW-B-1` to
  `#NEW-2-1`, `#NEW-B-2` to `#NEW-2-2`, `#NEW-B-3` to `#NEW-2-3`. The map-font characters are asserted as code points
  with a comment naming the glyph (`$` diamond, `#` aircraft, `%` star, `+`, `@` square, `&` airport, `)` VOR, `(` NDB).

- [x] **Step 2: NAV 5** (`nav5OnRoute()`: the standard route in FPL 0, the aircraft at KAAA, NAV 5 left, the recorder
  with KAAA, ABC, KBBB).
    - `NAV 5 page (characterization)`: FPL 0 north up at 40 NM, the aircraft 10 NM along the first leg; `rows('L')` and
      `maskRows('L')` inline (row 5 `N^       40`), the canvas file snapshot `nav5Route.txt`. Break: the FPL label
      `(i + 1)` → `(i + 2)` (`Nav5Page.tsx:218`).
    - `draws the FPL 0 waypoints by number, the active leg as an arrow and the next leg as a line (3-34, 3-35)`: `drawn`
      equals `arrow KAAA ABC`, `line ABC KBBB`, `icon 1 KAAA`, `icon 2 ABC`, `icon 3 KBBB`, `icon $ KAAA`. Break: the
      active leg drawn as a line (`Nav5Page.tsx:158`).
    - `marks an off-plan Direct To waypoint with the star and draws the arrow to it (3-34)` (figure 3-109): D-> XYZ;
      `arrow KAAA XYZ` in `drawn`, icons `% XYZ`, `1 KAAA`, `2 ABC`, `3 KBBB`, `$ KAAA`. Break: `"%"` → `"+"`
      (`Nav5Page.tsx:208`). Whether route lines are drawn during an off-plan Direct To is not asserted (research B Q6).
    - `marks the waypoint of the page on the right with "+" (3-35)` (figure 3-117): first call `icon + XYZ`. Break:
      `instanceof WaypointPage && false` (`Nav5Page.tsx:127`).
    - `draws north up with the range from the aircraft to the top (3-35)`: range 10, map 99×78, center (49.5, 39), a
      waypoint 8 NM north at y 7.8 and 8 NM east at x 80.7 (±1 px, by hand). Break: the range doubled (`:71`).
    - `draws desired track up with the course pointing up (3-34, 3-35)`: DTK 060, range 10, the aircraft at (49.5, 58.5),
      the waypoint 8 NM ahead at (49.5, 11.7). Break: rotation `dtk ?? 0` → `0` (`:75`).
    - `draws the aircraft symbol track up (3-35)`: after `moveAircraft` (120 kt, 090) only `icon # 47.0500,8.0500`.
      Break: `"#"` → `"$"` (`:231`).
    - `draws nothing track up while the aircraft stands still (3-35, 3-38)`: GS 0, no frame, no lit pixel, orientation
      `---°`. Break: `if (tk === null)` → `if (false)` (`:79`).
    - `shows north up / desired track up as the orientation value (3-34, 3-35)` (`it.each`): `N^  `; DTK `050°` (KAAA to
      ABC is 049.6 by `geo.ts`). `shows the actual track as the orientation value track up (3-35)` (figure 3-115):
      `090°`. `shows the heading as the orientation value heading up (3-35)`: `HeadingInput`, gyro 123, `123°`. Breaks:
      the DTK case shows the track; the TK case shows the DTK; heading null.
    - `offers the orientations without / with a heading input (3-34, 3-35)` (`it.each`): `N^  `, `DTK^`, `TK^ ` (+ `HDG^`),
      wrapping to `N^  `. Break: HDG always offered.
    - `visits the orientation and the range scale with the cursor (3-34)`: CRSR shown; the fields `{5, 0, 'N^  '}` and
      `{5, 7, '  40'}`; the third click is back on the first. Break: the range read-only. This is the sibling of the pin.
    - **Pin** `it.fails('puts the cursor on the range scale first (3-34, #NEW-2-1)')` (figure 3-110): first focused field
      `{row: 5, col: 7, text: '  40'}`. Fix: `setDefaultCursorField(1)` after the `CursorController`.
    - `offers range scales from 1 to 1000 NM (3-35)` (figures 3-110, 3-116): over the inner clicks the smallest is 1, the
      largest 1000, and 15 and 40 are offered. Break: `"1000"` removed.
    - **New** `NAV 5 range scales (characterization)`: the whole list in inner-knob order from 1 to 1000 as the code
      offers it, with the comment `// the scales between 1 and 1000 NM are a question: #NEW-2-5`. Break: a scale removed
      from the middle.

- [x] **Step 3: Super NAV 5** (the standard route plus a low VOR LOW, a high VOR HIG, the NDB AB and the airport KAAB a few
  NM from KAAA; a local `focused` helper over the `.inverted` spans, skipping `msg` and turning U+00A0 back into blanks).
    - `Super NAV 5 page (characterization)`: every layer on, ABC replaced by the intersection ABCDE (a VOR of FPL 0 would
      be labeled twice, `#NEW-2-2`), the aircraft 10 NM along the leg at 120 kt, the 15 NM scale; `SuperNav5.read()`
      inline (`37.5 È`, `ABCDE`, `Ê-Ë`, ` 120 É`, `Ð0:19`, `Ó051°`, `Ö050°`, `msg`, `15  `) and `superNav5Route.txt`.
      Break: the airport symbol `&` → `@`. Check that the ETE shown is not near a whole hour (`#NEW-1-1`).
    - `visits the map scale and the three configurable lines with the left cursor (3-36)`: `40  `, then
      counterclockwise ` TK   `, `DTK   `, `ETE   `, back to `40  `; DIS, the ident, the mode and GS are never focused.
      Break: `lCursorController.setDefaultCursorField(1)`.
    - `offers the choices of the fifth / sixth / seventh line (3-36)` (`it.each`): ETE/XTK/VNAV, DTK/BRG/RAD,
      TK/BRG/RAD, wrapping. Break: field 3 `"RAD` → `"BRG`.
    - `puts AUTO between the 1 and the 1000 NM scale (3-36)`: from `1`, inner left `AUTO`, again `1000`. Break: AUTO
      removed from the head of `SuperNav5RangeSelector`'s list.
    - **New** `Super NAV 5 range scales (characterization)`: the whole list in inner-knob order, AUTO included, with the
      same `#NEW-2-5` comment. Break: a scale removed from the middle.
    - `opens the menu on the VOR selection and closes it with the right cursor (3-37)`: VOR LH, NDB ON, APT OFF; the
      focus walks `[' LH'], [' ON'], ['OFF'], [' N^'], [' LH']`; `right` shows `ÜVOR: LH`, `ÝNDB: ON`, `ŸAPT:OFF`; the
      right cursor again → `right` null. **Change from the draft:** leave the fourth menu row ` 000° N^` out of this
      spec test (the guide's menu figures show only a track value there) and assert it in a characterization of its own,
      `shows the north-up menu row as 000° N^ (characterization)`. Breaks: the right cursor's default field 1;
      `SuperNav5Right` never adds `d-none`.
    - `offers the menu choices without / with a heading input (3-37, 3-34)` (`it.each`): VOR {OFF, H, LH, TLH}; NDB and
      APT {OFF, ON}; three or four orientations. Breaks: ` LH` removed; HDG always offered.
    - `draws the VORs of the class VOR: OFF / H / LH selects (3-37)` (`it.each`): `)` icons none / HIG, ABC / HIG, LOW,
      ABC. Breaks: the H filter low-altitude; LH high-altitude only.
    - `draws the nearest NDBs and airports with their identifiers (3-37)`: icons `( AB`, `& KAAB`; labels `AB, KAAB, KAAA,
      ABC, KBBB` (the FPL airport KAAA once). Breaks: `(` → `)`; the FPL airport filter removed.
    - `labels the FPL 0 waypoints with their identifiers (3-37)`: `arrow KAAA ABC`, `line ABC KBBB`, `@` plus a label
      per waypoint, `$ KAAA`. Break: the FPL `drawLabel` removed.
    - Sibling `labels a VOR of FPL 0 with the VORs off, and draws it as a nearest VOR with VOR: H (3-37)`. **Pin**
      `it.fails('labels a VOR of FPL 0 once with the VORs on (3-37, #NEW-2-2)')` (figures 3-121, 3-122): the labels of
      ABC in one frame are `['ABC']`. Fix: skip the nearest label of a facility in FPL 0, as `drawAirports` does
      (`SuperNav5Page.tsx:371-376`).
    - `declutters with CLR and restores with CLR again (3-38)`: after CLR the labels are `KAAA, ABC, KBBB` and the arrow
      stays; a second CLR restores the list. Break: the toggle in `clear()` removed.
    - `scans FPL 0 in the window of the pulled right inner knob (3-38)`: `ABC   ` inverted; +1, +1, -1, -1, -1 →
      `KBBB  `, `KBBB  `, `ABC   `, `KAAA  `, `KAAA  `; knob in → null. Breaks: the scan wraps; the window opens on
      leg 0.
    - `offers the waypoint of the scan window on the DIRECT TO page (3-27, 3-38)`: window `KBBB  `, D->: row 0
      `DIRECT TO:`, row 2 `KBBB`. Break: `getDirectToTarget` returns null.
    - `draws the runways of a nearby airport at the 1 / 2 / 3 NM scale (3-38)` (`it.each`): KAAB with 09-27 (6000 ft)
      and 18-36 (4000 ft): 1 NM labels 09, 27, 18, 36; 2 NM 09, 27; 3 NM `& KAAB`, no numbers. Breaks: `range <= 1` →
      `<= 0`; → `<= 2`; the diagram at `range <= 3`.
    - `flashes the active identifier during the waypoint alert (3-29, 4-8)`: D-> ABC, 0.5 NM out at 120 kt,
      `waypointAlert` true; the idents over eight display ticks are {`ABC`, empty}. Break: `waypointAlert && blink` →
      `false && blink`.
    - `AUTO scale`: `takes the smallest scale that shows the waypoint after the active one (3-36)` (active 3 NM N, next
      17 NM N: `20`); `takes the smallest scale that shows the Direct To waypoint (3-36)` (7 NM N: `10`). The literals
      use only scales of the guide's figures and photos. Sibling `activates the far waypoint before the near one (3-36)`
      (active AAAB 17 NM N, following AAAC 4 NM NE). **Pin** `it.fails('takes a scale that shows the active waypoint when
      the next one is nearer (3-36, #NEW-2-3)')`: `20` (today `5`). Fix: `Math.max(distToActive ?? 0,
      distanceToFollowing)` (`SuperNav5Page.tsx:212-220`).

- [x] **Step 4: AUTO near the MAP (`#NEW-2-4`).** Build an approach with a missed approach leg away from the MAP
  (`approachWorld()` has none: copy the MAP world of the MAP tests in `test/render/data/navdata/NavCalculator.test.ts`,
  the third copy, which task 8 notes). Put the aircraft 0.3 NM before the MAP on the final course with the MAP active,
  Super NAV 5 on AUTO. 6-9 (figure 6-16) shows the 1 NM scale there. Run it on the unchanged code first:
    - if the range shows `1`, it is the spec test `takes the 1 NM scale 0.3 NM before the MAP (6-9, figure 6-16)`; no
      pin, and the report says that `#NEW-2-4` is not confirmed;
    - if it shows a larger scale, write the sibling `flies to the MAP with the missed approach after it (6-9)` (MAP
      active, AUTO selected, the first missed approach waypoint follows) and the pin `it.fails('takes the 1 NM scale 0.3
      NM before the MAP (6-9, figure 6-16, #NEW-2-4)')`. Prove it with AUTO ignoring the legs after the MAP and record
      the scale it showed.

- [x] **Step 5: the `ObsDtkElement` lead (`#NEW-2-7`).** `ObsDtkElement.innerRight` returns false
  (`ObsDtkElement.tsx:47`), and `MainPage.tsx:438-443` pops an overlay page whose handler returns false. With
  `ObsSource 0` (the OBS can be entered, 5-34, 5-35), the standard route, `obsMode()`, Super NAV 5 and the left cursor on
  the line that shows the OBS course, turn the left inner knob one click right:
    - if Super NAV 5 stays and the course is one degree more, write that as the spec test `turns the OBS course with the
      inner knob on Super NAV 5 (5-34, 5-35)`, and the report says the lead is not confirmed;
    - if the page pops, write the sibling `turns the OBS course down with the inner knob on Super NAV 5 (5-34, 5-35)`
      (one click left: one degree less, the page stays) and the pin `it.fails('turns the OBS course up with the inner
      knob and stays on Super NAV 5 (5-34, 5-35, #NEW-2-7)')`. Fix: `innerRight` returns true.

- [x] **Step 6: not covered.** The report lists what research B left (no weather, terrain or SUA, which no break can
  reach; OBS drawing; TK and HDG up in pixels; no lines past the MAP; the arc on Super NAV 5; DTK flashing) and
  NO INTRCPT, which is the question `#NEW-2-6` and gets no test.

- [x] **Step 7: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/left/Nav5Page.test.ts", "test/render/pages/left/SuperNav5Page.test.ts", "test/render/pages/left/__snapshots__/nav5Route.txt", "test/render/pages/left/__snapshots__/superNav5Route.txt"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#NEW-2-1..3 turn red under their fixes, with siblings", "AUTO near the MAP is a spec test or the #NEW-2-4 pin", "the OBS knob on Super NAV 5 is a spec test or the #NEW-2-7 pin", "scale lists characterized with the #NEW-2-5 comment", "no double VOR label in snapshots; menu north-up row not under a spec title", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 3: FPL 0 and FPL 1 to FPL 25

**Goal:** Characterization and spec tests for FPL 0 and the numbered plans on the overlay reader of task 0, the trainer's
answers as spec tests, the pins `#NEW-3-1` to `#NEW-3-3` and the numbered-plan `#150`, and the FPL half of `#NEW-7-5`
checked.

**Files:**
- Create: `test/render/pages/left/FplPage.test.ts`

**Acceptance Criteria:**
- [x] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [x] `#NEW-3-1`, `#NEW-3-2`, `#NEW-3-3` and the `#150` pin turn red under their fixes; each has a passing sibling.
- [x] The FPL 0 scroll rule, the `?` column of the DEL prompt and the approach waypoints left out of a stored plan are
      spec tests citing the KLN 89 trainer next to their 90B pages.
- [x] No test asserts a blank 31st position of a full plan; FPL FULL is reached by inserting a waypoint.
- [x] An unknown ident entered on FPL 0 is either the `#NEW-7-5` pin with a sibling or a log line; the report says
      which.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: start from the draft.** Read `research-C.md` part 2 (part 1 is task 0) and `research\trainer.md` Q6 to
  Q9. Copy `research\drafts-C\test\render\pages\left\FplPage.test.ts`. Rename `#NEW-C-1` to `#NEW-3-1` and `#NEW-C-2`
  to `#NEW-3-2`. The glyphs are asserted as code points with a comment: `À` the head of the leg symbol, `Á` the tail,
  `Â` the shaft on a header row, `›` the direct-to arrow, `à á ã â` the suffixes -i, -f, -m, -h. Header rows are read
  with column 0 sliced off (the shaft glyph on a header row is a log line: the figures are illegible there).

- [x] **Step 2: FPL 0** (`route7()`: KAAA, ABC, KBBB, DEFAA, EFGAA, KCCC, GHIAA, the aircraft at 47.2/8.3 on the first
  leg).
    - `FPL 0 page (characterization)`: the left half and its mask: `Á 1:KAAA`, `À 2:ABC`, 3, 4, 5, ` 7:GHIAA`, mask all
      `.`. Breaks: the head glyph (`FlightplanArrow.tsx:49`); the tail glyph (`:62`); the last-waypoint rule
      (`FlightplanList.tsx:645`); the auto-scroll (`:614`).
    - `marks the from waypoint with the tail and the active waypoint with the head of the leg symbol (4-7)`: column 0
      `['Á ', 'À ', '  ', …]`, rows `Á 1:KAAA   `, `À 2:ABC    `.
    - `keeps the active leg in view and the last waypoint at the bottom of a long plan (4-3, 4-8)`: twelve fixes FB00 to
      FB11, the aircraft 22 NM along: `Á 5:FB04`, `À 6:FB05`, row 5 ` 12:FB11`, no FB10.
    - **New, from the trainer** `puts the waypoint before the active one in the top row after a Direct To (4-8, checked
      in the KLN 89 trainer, 2026-10-07)`: `route7()`, the cursor on waypoint 3 while it shows in row 2, D->, ENT, ENT,
      the cursor off (#82 leaves it on), one second: row 0 is waypoint 2 and row 1 the direct-to target with `›`. Break:
      the scroll index `i` instead of `i - 1` (`FlightplanList.tsx:613`).
    - `shows the approach header, the approach waypoints without colon and the fix suffixes (6-5, 6-6, 6-7)`: rows
      ` 1:ENRAA`, `R27-KPRC`, ` 2 IAFAAà`, ` 3 IFAAA`, ` 4 FAFAAá`, ` 7:KPRC`; with the cursor on MAHAA `  4 FAFAAá`,
      `  5 MAPAAã`, `*NO WPT SEQ`, `  6 MAHAAâ`. Break: the approach separator `":"` (`FlightplanListItem.tsx:78`).
    - `answers INVALID ADD to the inner knob on an approach waypoint and leaves the plan alone (C-1, 6-7)`. Break: the
      APP guard of `innerRight` (`:142`).
    - `answers INVALID DEL to CLR on an approach waypoint and leaves the plan alone (C-1, 6-7)`. Break: the APP guard of
      `clear` (`:221`).
    - `separates the number of a SID waypoint with a period (6-23)`: ` 1:KPRC`, ` 2.DEPAA`, ` 3.ENRAA`, ` 4:`. Break:
      `"."` → `":"` (`:82`).
    - Sibling `flies from ENRAA to the IAF with the approach header between them (4-7, 6-23)`: active index 1, not DCT,
      status `FPL 0`, a row `À 2 IAFAAà`. **Pin** `it.fails('shows the from waypoint with the tail above the header
      (4-7, 4-8, 6-23, #NEW-3-1)')` (figure 6-43): rows 0-2 `Á 1:ENRAA  `, the header `R18-KPRC`, `À 2 IAFAAà `. Fix:
      anchor the scroll on the from waypoint's row (`FlightplanList.tsx:613`).

- [x] **Step 3: FPL 1 to FPL 25** (the same seven waypoints stored in FPL 3; every test runs on task 0's reader).
    - `FPL 1 to FPL 25 pages (characterization)`: `USE? INVRT?`, `  1:KAAA` to `  4:DEFAA`, `  7:GHIAA`, mask all `.`.
    - `shows USE? INVRT?, the first four waypoints and the last one (4-3)` (figure 4-9; number columns figures 4-35,
      6-8). Break: the last-waypoint rule.
    - `puts the cursor on USE? and one step on on USE? INVRT? (4-3, 4-4)`. Break: the cursor starts on waypoint 1
      (`FplPage.tsx:50`).
    - `activates the plan in its order with USE? and shows FPL 0 (4-4)` (figure 4-12). Break: `useFpl` calls
      `loadInverted` (`FplPage.tsx:118`).
    - `activates the plan in reverse order with USE? INVRT? (4-4)` (figure 4-13). Break: `useInvertedFpl` calls `load`
      (`:107`).
    - `leaves the numbered plan alone when a waypoint of the activated FPL 0 is deleted (4-1, 4-4)`. Break: `load`
      shares the array (the copy and the procedure filter removed, `Flightplan.ts:112-113`; removing only the copy is a
      no-op mutation).
    - `shows LOAD FPL 0? on an empty plan and turns the cursor on over the blank first waypoint (4-2, 4-6)` (figures 4-2,
      4-3, 4-26): `LOAD FPL 0?`, `  1:       `, focus `{1, 4, '     '}`. Break: `cursorField = 0` (`FplPage.tsx:51`).
    - `stores FPL 0 in an empty numbered plan with LOAD FPL 0? (4-6)` (figures 4-27, 4-28): FPL 7 KAAA, ABC, KBBB, status
      `FPL 7`. Breaks: `loadFpl0` does nothing (`FplPage.tsx:99`); the cursor stays on (`FlightplanList.tsx:406`).
    - `stores FPL 0 without its approach waypoints (4-6, 6-5, 6-23, checked in the KLN 89 trainer, 2026-10-07)`: FPL 7
      ENRAA, KPRC; FPL 0 keeps its approach. **Change from the draft:** now a spec test with the trainer (research C Q5).
      Break: `load` keeps the procedures (`Flightplan.ts:113`).
    - `deletes a numbered plan with CLR and ENT (4-5)` (figures 4-23, 4-24): `DELETE FPL?` focused, then the plan empty,
      `LOAD FPL 0?`, status `FPL 3`. Break: `deleteFpl` does not delete (`FlightplanList.tsx:522`). This is the sibling
      of the next pin.
    - **Pin** `it.fails('saves the deleted numbered plan as empty (#150)')`: the stored `fpl3` is `''` (contract:
      persisted user data). Fix: `Flightplan.delete` publishes `flightplanChanged`. Task 8 comments on #150.
    - `keeps the numbered plan when DELETE FPL? is answered with CLR (4-5)`. Break: `cancelDeleteAll` (`:158`).
    - `deletes a waypoint of a numbered plan with CLR and ENT (4-5, checked in the KLN 89 trainer, 2026-10-07)` (figures
      4-20, 4-21): **change from the draft:** row 3 is exactly `DEL KBBB  ?` (the `?` in a fixed column after a five-cell
      ident field, the trainer; the code agrees), not the regex that accepted both positions; after ENT `  3:DEFAA`,
      `  4:EFGAA`, `  6:GHIAA`. Break: ENT on DEL does nothing (`FlightplanListItem.tsx:167`).
    - `keeps the waypoint when DEL is answered with CLR (4-5)`. Break: the second CLR (`:226`).

- [x] **Step 4: a full numbered plan** (FPL 5 with FA00 to FA29; research C tests 24 and 25 and the trainer Q7).
    - **Change from the draft:** the draft reached FPL FULL through the blank ` 31:` position, which is the bug
      `#NEW-3-3`. Reach it by inserting instead (4-4): the cursor on ` 30:FA29`, the inner knob opens an insert in front
      of it, enter FA30, ENT, ENT.
    - `refuses a 31st waypoint with FPL FULL (4-4, C-1)`: status mode `FPL FULL`, FPL 5 still FA00 to FA29 in order,
      `unit.errors` empty (the unit logs the exception with `console.error`; quiet it as `testing.md` section 4 says if
      the output disturbs). Breaks: 31 legs allowed (`Flightplan.ts:62`); the cursor start.
    - **Pin** `it.fails('does not show the refused waypoint after FPL FULL (4-4, C-1, #NEW-3-2)')`: walking the cursor
      over the plan, no row shows FA30 and the rows show FA00 to FA29 in order. Fix: `this.syncLegsFromFlightplan();
      this.buildList();` in the catch of `EditableFlightplan.insertLeg` (`FlightplanList.tsx:369-372`). Run it on the
      insert path first; if the phantom row does not appear there, keep the draft's path for this pin alone, say so in
      the report, and keep the ` 31:` row out of every assertion.
    - Sibling `shows FA29 as the last waypoint of a full plan (4-4)`: walking the cursor over the plan from `USE?`, the
      rows seen include ` 30:FA29`. **Pin** `it.fails('shows no blank position after the 30th waypoint (4-4, checked in
      the KLN 89 trainer, 2026-10-07, #NEW-3-3)')`: no row seen during the walk starts ` 31:`. The walk is a fixed number
      of outer clicks over the fields, so it does not depend on #218. Fix: no blank entry when the plan holds 30.

- [x] **Step 5: the FPL half of `#NEW-7-5`.** 4-2 says an ident not in the database, entered on the FPL page, opens the
  page that creates a user waypoint. On FPL 0, cursor on the blank position, `enterIdent('L', 'QQQQ')`, ENT:
    - if the status line shows `NO SUCH WPT`, write the sibling `shows the typed unknown ident on FPL 0 (4-2)` (the row
      shows QQQQ before ENT) and the pin `it.fails('offers to create a user waypoint for an unknown ident (4-2,
      #NEW-7-5)')`: no `NO SUCH WPT`, and the right side shows the creation rows `CREATE NEW ` and `WPT AT:    ` (the
      layout the SUP page shows for an unknown ident, `enterIdent.test.ts`). Prove it by a temporary change in
      `WaypointEditor.tsx:76`;
    - if the unit already offers the creation, write it as the spec test of 4-2 and say in the report that the FPL half
      is not a bug.

- [x] **Step 6: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/left/FplPage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#NEW-3-1..3 and the #150 pin turn red under their fixes, with siblings", "scroll rule, DEL ? column, approach left out of a stored plan are spec tests citing the trainer", "no assertion of a blank 31st position; FPL FULL reached by inserting", "unknown ident on FPL 0 is the #NEW-7-5 pin or a log line", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 4: SET 0 to SET 10

**Goal:** Tests for SET 0 to SET 9 (SET 10 is held already), the SET 2 magnetic variation editor driven with the knobs,
SET 1's editors, the pins `#NEW-4-1` to `#NEW-4-5` and the SET 2 MAG V pin of #217, and the SET 2 time zone sweep cut to
its first and last zone, the wrap and CDT.

**Files:**
- Modify: `test/render/pages/left/Set0Page.test.ts` (append)
- Create: `test/render/pages/left/Set1Page.test.ts`
- Modify: `test/render/pages/left/Set2Page.test.ts` (append)
- Modify: `test/render/pages/left/Set3Page.test.ts` (append)
- Create: `test/render/pages/left/Set4Page.test.ts`
- Modify: `test/render/pages/left/Set5Page.test.ts` (append)
- Create: `test/render/pages/left/Set6Page.test.ts`, `Set7Page.test.ts`, `Set8Page.test.ts`
- Modify: `test/render/pages/left/Set9Page.test.ts` (append)

**Acceptance Criteria:**
- [x] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [x] `#NEW-4-1` to `#NEW-4-5` and the SET 2 MAG V `#217` pin turn red under their fixes; each has a passing sibling.
- [x] `#NEW-4-1` asserts no error and the old ident kept; `#NEW-4-5` asserts the cursor on CONFIRM? after the
      waypoint's second ENT.
- [x] The SET 1 tests use a position and a waypoint with two-digit longitudes; no snapshot holds `E 0n°`.
- [x] The SET 2 zone tests assert UTC, the last zone of 3-5, the wrap back to UTC and CDT, not the ordered list.
- [x] No characterization carries a page number or a KLN 89 citation.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: start from the drafts.** Read `research-D.md` and `research\trainer.md` Q5. From
  `research\drafts-D\test\render\pages\left\` copy the new files and take the appended describes of the others. Rename
  `#NEW-D-1` to `#NEW-4-1`, `#NEW-D-2` to `#NEW-4-2`, `#NEW-D-4` to `#NEW-4-3`, `#NEW-D-5` to `#NEW-4-4`, and
  `#NEW-D-3` to `#217`. The existing pins (#199, #217, #110, #111, #112, #132, #89, #141) stay as they are. Persisted
  keys a knob changes are read with `storedSetting` (contract: the setting keys, `CLAUDE.md`).

- [x] **Step 2: SET 0.**
    - `goes back from the expiry to UPDATE PUBLISHED DB with one CLR (characterization)`: SET 0, cursor, ENT (row 5
      `     U P D A T E ?`), CLR: rows `['      U P D A T E', '   D A T A   B A S E', '', '  UPDATE PUBLISHED DB', '', '']`,
      status `CRSR`. Break: `this.step -= 2` in `clear()`.
    - **Pin** `it.fails('ends the update on the starting page after repeated CLR (2-5, #NEW-4-3)')`: two more CLR, status
      `SET 0` (cursor off) and rows 0-3 with `O N   G R O U N D` / `O N L Y` (figure 2-2); the KEY row is not asserted.
      Fix: at step 0 with the cursor on, CLR turns the cursor off and returns true (`Set0Page.tsx:87-97`).

- [x] **Step 3: SET 1** (`Set1Page.test.ts`). **Change from the draft:** the draft's position (47.5, 8.25) and KAAA
  (47.1, 8.0) show `E 08°…`, the zero of `#NEW-1-8`. Use the position 47.5 N 11.25 E and KAAA at 47.1 N 11.0 E: the
  literals become `E 11°15.00'` and, after the waypoint, `N 47°06.00'`, `E 11°00.00'` (0.1° is 6.00', by hand).
    - `SET 1 page (characterization)`: the left rows without row 4 (`#NEW-4-2`) and the mask: `INIT POSN`, `WPT:`,
      `N 47°30.00'`, `E 11°15.00'`, `CONFIRM?`. CONFIRM? with the cursor off is the code's (it cites a video of a real
      unit) and stays a characterization without an issue. Break: the initial latitude `+ 1`.
    - `turns the cursor on over the WPT field (3-18)` (figure 3-58): `{row: 1, col: 5, text: '     '}`. Break: the WPT
      editor read-only.
    - `takes the position of a confirmed waypoint (3-18)` (figures 3-59, 3-60): `enterIdent('L', 'KAAA')`, ENT (right
      status `APT 1`, rows 1-3 unchanged), ENT (the waypoint's position). Break: `lat.setValue` dropped in `setWpt`.
      This is the sibling of `#NEW-4-5`.
    - **Pin** `it.fails('moves the cursor to CONFIRM? once the waypoint is confirmed (3-18, checked in the KLN 89
      trainer, 2026-10-07, #NEW-4-5)')`: after the second ENT `focused('L').text.trim()` is `CONFIRM?` (3-18 step 8 and
      the trainer: straight to it; the code moves to the latitude). Fix: focus CONFIRM? after `setWpt`.
    - `takes a latitude entered with the knobs (3-18)`: N, 4, 6, 0, ENT → row 2 `N 46°00.00'`. Break: `Editor.enter`
      no longer commits.
    - `SET 1 CONFIRM? before the first fix (characterization)`: `posts no position message at the first fix without an
      initialization` (cold boot, the stored last position the aircraft's: no `POSITION DIFFERS FROM LAST POSITION BY
      >2NM`, but `SYSTEM TIME UPDATED TO GPS TIME`); `turns the cursor off, and the first fix compares with the confirmed
      position` (N 46°00.00', 90 NM south, `cursorTo('L', 'CONFIRM?')`, ENT, status `SET 1`, then the message).
      **Change from the draft:** drop the KLN 89 guide reference from the comment of this characterization. Breaks:
      `this.lat = lat!` dropped in `setLat`; `setCursorActive(false)` dropped in `confirmPosition`.
    - **Pin** `it.fails('shows the ground speed of a parked aircraft as 0 KT (3-18, #NEW-4-2)')` (figures 3-57 to 3-60):
      row 4 `  0 KT 000°`. Fix: the tens digit of `SpeedEditor` blank for zero. Sibling: the characterization.
    - **Pin** `it.fails('keeps the old ident without an error after CLR and ENT on the WPT field (checked in the KLN 89
      trainer, 2026-10-07, #NEW-4-1)')`: **change from the draft:** first confirm KAAA (ident, ENT, ENT), turn the cursor
      off and on again (the WPT field, `KAAA `), then CLR, ENT; assert `unit.takeRejections()` and `unit.errors` empty,
      row 1 `WPT: KAAA  ` and rows 2-3 KAAA's position. Sibling: `puts the cursor back on the confirmed WPT field (3-18)`
      (the same setup up to CLR: focus `{1, 5, 'KAAA '}`). Fix: `setWpt` keeps the old waypoint on null
      (`Set1Page.tsx:73`).

- [x] **Step 4: SET 2** (append to `Set2Page.test.ts`).
    - `shows no variation line inside the area, and the cursor stays on the time zone (5-44)` (figure 5-133): row 5
      blank; after `outer 1` the focus `{3, 8, 'UTC'}`. Breaks: the line shown inside; the MAG V field editable inside.
    - `takes a variation entered with the knobs outside the area (5-44, B-2)`: boot N 74.5, magvar 10, track 090
      (MAGNETIC VAR INVALID posted); cursor, outer 1, inner 2, outer, inner 1, outer, inner 2 (W), ENT: NAV 3 row 2
      `TK     100°` (090 true and 10 W, by hand), the message gone. **Change from the draft:** the row is asserted as
      `/^MAG V\s+10°W$/` (figure 5-134 is not exact enough for a column), and the exact row `MAG V  10°W` goes into a
      characterization of its own (`shows the variation as MAG V  10°W (characterization)`). Break: `saveMagvar` stores
      the negative.
    - Sibling `hides the variation line again back inside the area (5-44)`: cursor off, `moveAircraft` to N 73.5, row 5
      blank, no errors. **Pin** `it.fails('stays usable when the aircraft enters the area with the cursor on line 6
      (5-44, #217)')`: the cursor on `{5, 7, '10°W'}`, then back inside; today `isEnterAccepted` of undefined on every
      display tick. Fix: turn the cursor off before the focused field turns read-only. Task 8 comments on #217.
    - `shows the time in Central Daylight Time, five hours behind UTC (3-54)` (figure 3-170): `12:00 UTC`, inner 8 →
      `07:00 CDT`, row 4 `CENTRAL DAY`, stored `timezone` 8 (contract: the index is the persisted value). Breaks: the
      CDT offset; `saveTimezone` writing 0.
    - **Change from the draft:** replace the sweep of every zone by `offers UTC first, the last zone of 3-5 one click
      counterclockwise, and UTC again one click on (3-5)`: from `12:00 UTC`, inner -1 shows the last zone of the list on
      3-5 with its offset, inner +1 shows `12:00 UTC` again. Take the last zone and its offset from 3-5 yourself, not
      from the code. Break: a zone inserted at the end.
    - `sets the time in the selected zone (3-54)` (figures 3-171 to 3-174): cold GPS, cursor, outer 2, inner 8 (CDT),
      outer -1, hour 18, minutes 3 and 7, ENT → `18:37 CDT`, GPS time UTC `[1, 23, 37]`. Break: `saveTime` from UTC.

- [x] **Step 5: SET 3 to SET 9.**
    - SET 3: `SET 3 page (characterization)` (rows 0-3 and 5; row 4 is the pin), `turns the cursor on over the minimum
      length (3-22)` (`{3, 6, '1000'}`), `reaches 5000 ft in steps of 100 ft (3-22)` (inner 40, `      5000'`, stored
      5000). **Pin** `it.fails('labels the surface row SURFACE: (3-22, #NEW-4-4)')` (figures 3-73 to 3-75): row 4
      `SURFACE:   `. Fix: the colon (`Set3Page.tsx:51`). Sibling: the characterization.
    - SET 4: characterization; `switches to RUN WHEN POWER IS ON with the inner knob (4-13)` (figure 4-54, stored
      `flightTimer` true); `offers RUN WHEN POWER IS ON on a unit booted with it (4-13)`. Breaks: the initial index
      swapped; `saveFlightTimer` inverted.
    - SET 5: characterization (OFF); `offers offsets up to 2000 ft (3-58)` (`  + 800ft  `, inner 12 → `  +2000ft  `; the
      row only, the stored key is #89); `shows FEATURE DISABLED and takes no cursor when the installation disables the
      alert (3-57, 3-59)` (panel.xml `AltitudeAlertEnabled` false; also contract). Breaks: `"20"` dropped; the cursor
      controller built regardless.
    - SET 6: characterization; `disables turn anticipation with the inner knob (4-9)` (figure 4-36; stored and live
      false); `shows DISABLE on a unit booted with turn anticipation off (4-9)`. Breaks: the initial index; the save
      inverted.
    - SET 7: characterization (`"`, INCHES); `switches to millibars with the inner knob (5-10)` (figure 5-32: `MB`,
      `MILLIBARS`, stored `barounit` false); `shows the CAL 1 altimeter setting in millibars (5-10)` (`cal12Barometer:
      29.92`, CAL 1 `BARO:29.92"` → `BARO:1013MB`; 29.92 × 33.8639 = 1013.2 by hand). Breaks: the save inverted; the
      text on change; the initial text. CAL 1's `0700MB` for its 0.00" default stays out (a log line).
    - SET 8: characterization (`   ±00500ft`); `hides the buffer when the alert is disabled (3-41)` (figure 3-129);
      `sets the buffer digit by digit (3-41)` (figures 3-131, 3-132: `   ±01000ft`, stored 1000); `steps the buffer by
      100 ft and never puts the cursor on the tens or the units (3-41)` (columns 4, 5, 6 of row 5; stored 600; five
      more clicks never focus columns 7 or 8, whether the knob wraps or stops, #218). Breaks: d-none `add` → `remove`;
      the buffer `+100`; the enable save inverted; the initial index; the tens digit a cursor field.
    - SET 9: `sets the volume 02 digit by digit (3-57)` (figure 3-181: `    02     `, stored `altAlertVolume` 2). Break:
      `saveVolume1` digit order.
    - SET 10: nothing (fictitious page, held by `Set10Page.test.ts` and `GpsAcquisition.test.ts`); the report lists it
      among the pages without a spec test.

- [x] **Step 6: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/left/Set0Page.test.ts", "test/render/pages/left/Set1Page.test.ts", "test/render/pages/left/Set2Page.test.ts", "test/render/pages/left/Set3Page.test.ts", "test/render/pages/left/Set4Page.test.ts", "test/render/pages/left/Set5Page.test.ts", "test/render/pages/left/Set6Page.test.ts", "test/render/pages/left/Set7Page.test.ts", "test/render/pages/left/Set8Page.test.ts", "test/render/pages/left/Set9Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#NEW-4-1..5 and the SET 2 MAG V #217 pin turn red under their fixes, with siblings", "#NEW-4-1 expects no error and the old ident; #NEW-4-5 expects CONFIRM?", "SET 1 uses two-digit longitudes", "zone tests: UTC, the last zone, the wrap, CDT", "no citation on a characterization", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 5: OTH 1 to OTH 10 and STA 1 to STA 5

**Goal:** Tests for OTH 1 to OTH 10 and STA 1 to STA 5 on the `simVars` option of task 0, the pins `#NEW-5-1` (OTH 9),
`#NEW-5-2` to `#NEW-5-5`, `#NEW-1-1` (OTH 6) and #213, the trainer's OTH 3 and OTH 4 answers as spec tests, and STA 5's
defaults only.

**Files:**
- Create: `test/render/pages/left/Oth1Page.test.ts`, `Oth2Page.test.ts`, `Oth4Page.test.ts`, `Oth6Page.test.ts`,
  `Oth7Page.test.ts`, `Oth8Page.test.ts`, `Oth9Page.test.ts`, `Oth10Page.test.ts`
- Modify: `test/render/pages/left/Oth3Page.test.ts`, `test/render/pages/left/Oth5Page.test.ts` (append)
- Create: `test/render/pages/left/Sta1Page.test.ts`, `Sta2Page.test.ts`, `Sta3Page.test.ts`, `Sta4Page.test.ts`,
  `Sta5Page.test.ts`
- Modify: `test/unit/settings/RemarksManager.test.ts` (append the `#NEW-5-5` pin)

**Acceptance Criteria:**
- [x] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [x] `#NEW-5-1` to `#NEW-5-5`, `#NEW-1-1` and #213 turn red under their fixes; each has a passing sibling.
- [x] The OTH 3 plan number (the lowest plan, `0` for FPL 0) and the OTH 4 order by ident are spec tests citing the KLN
      89 trainer.
- [x] No test sets `NUMBER OF ENGINES` with `simEnv()`; every fuel boot uses `simVars`.
- [x] OTH 6 NM/GAL of 10 or more, the OTH 6 RANGE dashes and the OTH 10 negative temperature are characterizations; no
      snapshot holds an endurance of `:60` or a wind direction without its symbol.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: start from the drafts.** Read `research-E.md` and `research\trainer.md` Q10. Copy the drafts of
  `research\drafts-E\test\render\pages\left\` (append the OTH 3 and OTH 5 describes). Rename `#NEW-E-1` to `#NEW-5-1`,
  `#NEW-E-2` to `#NEW-1-1`, `#NEW-E-3` to `#NEW-5-2`, `#NEW-E-4` to `#NEW-5-3`, `#NEW-E-5` to `#NEW-5-4`. **Change from
  the drafts:** replace every `simEnv().sim.set('NUMBER OF ENGINES', …)` before a boot by
  `bootUnit({…, simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: n}]})`.

- [x] **Step 2: OTH 1 to OTH 4.**
    - OTH 1: `OTH 1 page (characterization)`, the empty page `NO NEAREST` / `FSS` (the sim has no FSS data). Break: `FSS`
      → `FSX`. 3-52's FSS pages cannot be tested; the report lists OTH 1 among the pages without a spec test.
    - OTH 2: `OTH 2 page (characterization)`: six sectors of one Center, five frequencies, one repeated: `TEST CENTER`,
      `CTR`, `118.55`, `124.00`, `127.20`, `132.85`. Breaks: sort descending; dedup removed. Use short Center names (cut
      at 11). `names the Center of the new position when the page is selected again after a move (3-52)` (ALPHA around
      47/8 at 118.55, BRAVO around 47.7/8 at 132.85; `BRAVO`, `CTR`, `132.85`) is the sibling of the pin
      `it.fails('names the Center of the new position while the page stays selected (3-52, #NEW-5-3)')`. Fix: reload
      the Center periodically (`Oth2Page.tsx:39`).
    - OTH 3 (append): `OTH 3 page (characterization)` (one user waypoint of each kind stored out of order, AVOR in FPL 6);
      `lists the user waypoints by kind, then by ident, with the type letter and the plan number (5-20)` (`AAPT A`,
      `BAPT A`, `AVOR V 6`, `AND N`, `AINT I`, `ASUP S`); `refuses to delete a waypoint used in a flight plan with USED IN
      FPL (5-20, C-2)`; `refuses to delete the active waypoint with ACTIVE WPT (C-1)`; `shows the page of the waypoint on
      the right while it asks for the deletion (5-20)` (figure 5-79: `DEL AINT  ?`, right status `INT`). Breaks as
      research E records (the VOR sort index, the ident compare, the plan number constant, the message, the active check,
      the confirmation page).
    - **New, from the trainer** `shows 0 for a waypoint of FPL 0 and the lowest plan number of several (5-20, checked
      in the KLN 89 trainer, 2026-10-07)`: AINT in FPL 0 but not the active waypoint (FPL 0 KAAA, KBBB, AINT, the
      aircraft at KAAA), ASUP in FPL 4 and FPL 2: `AINT I 0` and `ASUP S 2`. Break: the highest plan number instead of
      the lowest.
    - OTH 4: `OTH 4 page (characterization)` (remarks of KCCC, KAAA, KBBB saved after the boot); **new, from the
      trainer** `lists the airports with remarks sorted by ident (3-47, checked in the KLN 89 trainer, 2026-10-07)`
      (saved KCCC, KAAA, KBBB, listed KAAA, KBBB, KCCC). Break: no sort in `getAirportsWithRemarks`. `deletes the remarks
      of the airport under the cursor with CLR and ENT (3-47)`. Breaks: `deleteRemark` a no-op; the refresh a no-op.
      Sibling `lists an airport whose remarks were saved while the page is shown (3-47)` (KCCC appears); **pin**
      `it.fails('lists an airport again when its remarks are saved anew while the page is shown (3-47, #NEW-5-4)')`.
      Fix: drop `.whenChanged()` (`Oth4Page.tsx:36`).

- [x] **Step 3: OTH 5 to OTH 10** (a twin, 90 and 84 pph, 756 lb = 126 GAL, FPL 0 KAAA ABC KBBB, `moveAircraft` to
  47.01/8.02 at 120 kt where a route ETE is needed).
    - OTH 5 (append): characterization (` KBBB   GAL`, `FOB     126`, `REQD     22`, `L FOB   104`, `RES:  00000`,
      `EXTRA   104`); `shows REQD, L FOB and EXTRA from the fuel flow, the ETE along the route and the reserve (5-39,
      5-40)` (ETE from `geo.ts`, REQD 21.8, L FOB 104.2, RES 30, EXTRA 74.2); `shows the destination with the active arrow
      when it is the active waypoint (5-39)` and its sibling `… without the arrow while an earlier waypoint is active
      (5-39)`; `puts the cursor on RES first when the fuel on board is transmitted (5-40)`; `sets the fuel on board with
      the inner knob when FOB shows a colon (5-40)`; `enters the reserve digit by digit, and OTH 6 shows the same reserve
      (5-40, 5-41)`. Breaks as research E records.
    - OTH 6: characterizations `126 GAL on board, 15 GAL/HR, no reserve, 120 kt` (` ENDUR 8:24`, ` RANGE 1008`,
      ` NM/GAL 8.0`) and `dashes without fuel flow` (`--:--`, `--.-`, `---`: the RANGE dashes are a characterization
      without an issue). **New** characterization `shows NM/GAL of 10 or more with leading zeros (characterization)`
      (for example 120 kt at 10 GAL/HR; assert the row the code shows). Spec `shows ENDUR, RANGE and NM/GAL from the fuel
      on board, the reserve, the fuel flow and the ground speed (5-41)` (50 GAL, RES 20, 10 GAL/HR, 75 kt: ` ENDUR 3:00`,
      ` RANGE  225`, ` NM/GAL 7.5`). Sibling `shows the endurance in hours and minutes (5-41)` (49 GAL: ` 4:54`); **pin**
      `it.fails('never shows 60 minutes of endurance (5-41, #NEW-1-1)')` (49.95 GAL at 10 GAL/HR: accepts ` 4:59` or
      ` 5:00`). Fix: the `DurationDisplay` fix of task 1.
    - OTH 7: characterizations of the twin and the single; `shows each engine and the total of a twin, in the fuel unit
      per hour (5-41)` (15, 14, 29, `GAL/HR`); `shows only the total of a single, in the configured unit (5-41, 5-39)`
      (LB, 75 pph). Breaks: the total of engine 1 only; the twin layout for a single; the unit fixed.
    - OTH 8: characterizations (17, 16, 33 GAL; 12 GAL); `shows the fuel used by each engine and the total of a twin
      (5-41)`; sibling `shows dashes for each engine of a twin when the fuel used is not transmitted (5-41)`; **pins**
      `it.fails('shows dashes for the total of a twin when the fuel used is not transmitted (5-41, #NEW-5-2)')` and
      `it.fails('shows dashes for a single when the fuel used is not transmitted (5-41, #NEW-5-2)')`. Fix: return early
      from `redraw` without the output (`Oth8Page.tsx:67-71`).
    - OTH 9 (air data and a fuel computer; `HeadingInput`; magvar 10, gyro 350 = 000 true): characterization without a
      heading input (`TAS   187kt`, `MACH    .29`); `shows the true airspeed in knots and the Mach number (5-43)`;
      `shows the headwind component and the wind relative to true north (5-43)` (wind from 030 at 20 by a vector sum:
      `HDWND 17kt`; the direction asserted without the symbol cell, so the test does not depend on the pin);
      `shows the tailwind component … (5-43)` (from 210: `TLWND 17kt`). **Pin** `it.fails('marks the wind direction as
      true with the true-north symbol (5-43, #NEW-5-1)')` (figures on 5-43 and the TRI 0 figures of 5-2, a photo):
      `WIND  030°¥`. Fix: `WIND&nbsp&nbsp{windDir}¥` (`Oth9Page.tsx:53`). No snapshot holds the wind row.
    - OTH 10: characterization at 12340 ft, SAT 8, TAT 12 (`PRS 12300ft`, `DEN 12400ft`); **new** characterization
      `shows a negative temperature as -09°C (characterization)`; `shows SAT and TAT in degrees Celsius and the pressure
      altitude to the nearest 100 ft (5-43)` (6460 ft → 6500; SAT 20, TAT 26); `shows the density altitude to the nearest
      100 ft (5-43, 5-10)` (9000 ft at 5 °C → 9900, the CAL 1 figures; the 5-43 figure's DEN is not used as a literal).

- [x] **Step 4: `#NEW-5-5`** (`test/unit/settings/RemarksManager.test.ts`; the unit stage is the cheapest, and the
  stored slots are #92's, ten today). In a new describe `remarks of a 101st airport (3-47, C-2)`:
    - Sibling `holds the remarks of 100 airports (3-47)`: a manager whose private `remarks` map is seeded with 100
      airports (`(manager as unknown as {remarks: Record<string, [string, string, string]>}).remarks`; the slots cannot
      hold them, #92), `getAirportsWithRemarks()` has length 100.
    - **Pin** `it.fails('refuses the remarks of a 101st airport with RMKS FULL (3-47, C-2, #NEW-5-5)')`: the same seed,
      `saveRemarks('KZZA', …)` throws `RMKS FULL`. Today the guard `Object(this.remarks).length` is undefined, so the
      save goes on and fails on a missing slot. Fix: `Object.keys(this.remarks).length >= 100`
      (`RemarksManager.ts:28`). Task 8 checks #92 before filing.

- [x] **Step 5: STA 1 to STA 5.**
    - STA 1 (cold and dark, slow acquisition, stored position 0/0, right after the self-test): `marks every satellite as
      not used in the solution during a sky search (5-30)` (all eight rows start with `*`); `has a second page, STA+1,
      with eight satellites (5-29)`. Sibling `lists satellites below the horizon during a sky search (5-30)` (no fix; the
      SDK's zenith angle puts PRNs 2 to 7 below the horizon). **Pin** `it.fails('shows no elevation of 5 degrees or more
      for a satellite below the horizon (5-30, #213)')` (today PRN 2 shows `83°`, PRN 4 `31°`). Fix: `90 - zenith`
      without `Math.abs`, shown as `--` below 5. A fix that prints a negative number overflows the row and turns the pin
      green for the wrong reason; the comment says so.
    - STA 2: characterizations with a fix (`      .04nm`) and without (`      .--nm`); no spec test (5-30 gives only the
      figure).
    - STA 3 (the `Version` mock): characterization `HOST SW`, `2.2.0`, `RCVR SW`, `02`, blank, `OBS CAL 100` (the
      version on its own row is the project's layout, without an issue).
    - STA 4: characterization (1234 h 30 min, 567 cycles → `    1234 HR`, `     568`); `counts the total operating time
      in hours while the unit is on (5-31)`; `adds one power cycle when the unit is turned off and on (5-31)`.
    - STA 5: only `defaults to the last waypoint of FPL 0 and its ETA, and shows COMPUTING (6-20)` (`DEST: KBBB`, the ETA
      from `Date.now()` and the `geo.ts` ETE, `UTC`, ` COMPUTING `); the prediction is untestable (#214), and the result
      row and the `__:__` empty ETA are not asserted.

- [x] **Step 6: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/left/Oth1Page.test.ts", "test/render/pages/left/Oth2Page.test.ts", "test/render/pages/left/Oth3Page.test.ts", "test/render/pages/left/Oth4Page.test.ts", "test/render/pages/left/Oth5Page.test.ts", "test/render/pages/left/Oth6Page.test.ts", "test/render/pages/left/Oth7Page.test.ts", "test/render/pages/left/Oth8Page.test.ts", "test/render/pages/left/Oth9Page.test.ts", "test/render/pages/left/Oth10Page.test.ts", "test/render/pages/left/Sta1Page.test.ts", "test/render/pages/left/Sta2Page.test.ts", "test/render/pages/left/Sta3Page.test.ts", "test/render/pages/left/Sta4Page.test.ts", "test/render/pages/left/Sta5Page.test.ts", "test/unit/settings/RemarksManager.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#NEW-5-1..5, #NEW-1-1 and #213 turn red under their fixes, with siblings", "OTH 3 plan number and OTH 4 order are spec tests citing the trainer", "fuel boots use simVars", "OTH 6 NM/GAL, RANGE dashes, OTH 10 negative temperature are characterizations; no :60 or wind row in snapshots", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 6: TRI 0 to TRI 6 and CAL 1 to CAL 7

**Goal:** Tests for TRI 0 to TRI 6 and CAL 1 to CAL 7, the pins `#NEW-6-1` to `#NEW-6-3`, `#NEW-1-1` (TRI 3) and
`#NEW-5-1` (CAL 3), with the out-of-range calculator values and the TRI 5 ground speed kept out of the snapshots.

**Files:**
- Create: `test/render/pages/left/Tri0Page.test.ts`, `Tri1Page.test.ts`, `Tri2Page.test.ts`, `Tri3Page.test.ts`,
  `Tri4Page.test.ts`, `Tri5Page.test.ts`, `Tri6Page.test.ts`
- Modify: `test/render/pages/left/Cal1Page.test.ts`, `test/render/pages/left/Cal2Page.test.ts` (append)
- Create: `test/render/pages/left/Cal3Page.test.ts`, `Cal4Page.test.ts`, `Cal5Page.test.ts`, `Cal6Page.test.ts`,
  `Cal7Page.test.ts`

**Acceptance Criteria:**
- [x] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [x] `#NEW-6-1` to `#NEW-6-3`, `#NEW-1-1` and `#NEW-5-1` turn red under their fixes; each has a passing sibling.
- [x] No snapshot holds `010°F`, `115mph`, a blank F REQ at a ground speed of 0, the TRI 5 ground speed row, the CAL 3
      wind direction or the CAL 7 rise and set.
- [x] TRI 3 taking the variation at the "from" waypoint and TRI 1/TRI 2 dashes without a fix are characterizations.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: start from the drafts.** Read `research-F.md`. Copy the drafts of `research\drafts-F\test\render\pages\left\`
  (append the CAL 1 and CAL 2 describes). Rename `#NEW-F-1` to `#NEW-1-1`, `#NEW-F-2` to `#NEW-6-1`, `#NEW-F-3` to
  `#NEW-5-1`, `#NEW-F-4` to `#NEW-6-2`, `#NEW-F-5` to `#NEW-6-3`. Seed `unit.props.memory.triPage` before `selectPage`.

- [x] **Step 2: TRI 0 to TRI 4.**
    - TRI 0: `shows the TAS and wind estimates of a fresh unit (characterization)`; `moves the cursor over the TAS digits,
      the wind direction in two parts and the wind speed digits (5-2)` (stops `3,6 1`, `3,7 5`, `3,8 0`, `4,6 00`,
      `4,8 0`, `5,6` to `5,8`); `takes a TAS of 200 and a wind of 180 at 25 kt from the knobs and applies them on TRI 3
      (5-2)` (`TAS:  200kt`, `WIND: 180°¥`, `      025kt`; TRI 3 `175kt`).
    - TRI 1 (KAAA at 47/8, KBBB one degree south, 60.107 NM by `geo.ts`, 24.04 min at 150 kt): characterizations `shows
      the trip from the present position to a waypoint with fuel flow and reserve` (FF 30, RES 25 seeded) and `shows no
      distance, bearing or time without a GPS fix` (rows 0-2 only: `----nm ---°`, `000kt --:--`; the F REQ row at GS 0
      is blank, `#NEW-6-4`, and stays out); spec `shows 60nm, the magnetic bearing 170 and 150kt for 24 minutes to a
      waypoint 60 NM due south (5-3)` (figure 5-8, 5-2); `recomputes the ETE from a ground speed entered with the knobs:
      120 kt gives :30 (5-3)`; `shows F REQ 37.0 for 24 minutes at a fuel flow of 30 with a reserve of 25 (5-4)`; `shows
      F REQ 120 without a decimal for a fuel flow of 300 (5-5, 5-6)`; `shows the fuel flow and reserve entered on TRI 1
      on TRI 3 and TRI 5 (5-4)`.
    - TRI 2 (KBBB 40 NM north; 5 × 5 NM areas around the present position, #102): characterization (`ESA 11400ft`,
      `R-ONE`, ` REST`); `shows the waypoint entered on TRI 1 and an ESA line (5-4)` (figure 5-11); `spreads three
      areas over two pages named TRI+2, turned with the inner knob (5-4)`. The routes keep their end in a sector already
      sampled, so no snapshot holds #181.
    - TRI 3: characterizations `shows the trip between two waypoints with fuel flow and reserve` and `takes the magnetic
      variation of the bearing at the "from" waypoint` (10 E at KAAA, 0 at KBBB, 10 W at the aircraft: `  60nm 170°`;
      without an issue); spec `puts the cursor over "from" first and over "to" once "from" is approved (5-5)` and
      `shows distance, bearing, ground speed and ETE without a GPS fix (5-5)` (figure 5-16). Sibling `shows 149nm and
      150kt for a trip of 148.9 NM (5-5)`; **pin** `it.fails('shows 59.56 minutes as 1:00 or :59, not :60 (5-5,
      #NEW-1-1)')`. Fix: the `DurationDisplay` fix of task 1.
    - TRI 4: characterization; `shows the route of TRI 3 and an ESA line without a GPS fix (5-5)` (figure 5-17).

- [x] **Step 3: TRI 5 and TRI 6.**
    - TRI 5: `shows the analysis of FPL 0 with fuel flow and reserve (characterization)` on `standardRoute()`; **change
      from the draft:** leave row 2 (the ground speed and the ETE) out of the snapshot until the fix decides what
      "average" means. Spec `shows FPL 0 from its first to its last waypoint, 60nm in :24, without a GPS fix (5-6)`
      (figure 5-18; no wind, so every reading of the ground speed gives 150 kt) and `selects FPL 3 with the inner knob on
      the flight plan number (5-6)`. Sibling `shows FPL 0 from KAAA to KCCC, 100 NM (5-6)`; **pin**
      `it.fails('shows the ETE of the plan as the sum of the leg times, :33 (5-6, #NEW-6-1)')` (10 NM north at 100 kt and
      90 NM south at 200 kt: 33 min; the pin asserts the ETE only). Fix: sum `legDist / legGs` (`Tri5Page.tsx:96-105`).
    - TRI 6: characterizations `shows the ESA of FPL 0` and `shows only the plan number for a plan of one waypoint`;
      `shows the flight plan selected on TRI 5 (5-6)` (figures 5-19, 5-20: `FP 3`, `R-CCC`, ` REST`).

- [x] **Step 4: CAL 1 to CAL 4.**
    - CAL 1 (append): characterization (9000 ft, 29.92", 5 °C: `PRS  9000ft`, `DEN  9900ft`); `moves the cursor over
      three IND digits, then BARO, then TEMP (5-10)`; `takes -5 C from the sign digit and shows DEN 8700ft at 9000 ft and
      29.92" (5-10)` (ISA by hand, DA 8743); `takes BARO in millibars when SET 7 selects them: 1017MB gives PRS 8400ft
      and DEN 9300ft (5-10)` (`cal12Barometer` seeded, so `0700MB` never shows). Sibling `shows TEMP -05 after the sign
      and then the last digit are set (5-10)`; **pin** `it.fails('shows DEN 8700ft for -5 C entered sign first (5-10,
      #NEW-6-3)')`. Fix: the sign from the sign field (`TempFieldset.tsx:58-68`).
    - CAL 2 (append): characterization (`TAS   163kt`); `moves the cursor over CAS, ALT, BARO and TEMP (5-11)`; `shows
      the altimeter setting entered on CAL 1 (5-11)`; `keeps its own temperature when the temperature on CAL 1 is changed
      (5-11)`.
    - CAL 3 (the TAS entered with the knobs, because `selectPage` passes CAL 2, #33): characterization of rows 0-3 and 5
      (row 4, the wind direction, is the pin); `shows TLWND 20kt and a wind from 180 at 20 kt for 120 kt over the ground
      at TAS 100 (5-12)`; `converts the magnetic heading to true and shows the wind from 010 true at 20 kt, HDWND 20kt
      (5-12)`; `leaves line three blank and takes the heading from the heading input (5-12)`. **Pin**
      `it.fails('marks the wind direction as true: WIND  180°¥ (5-12, #NEW-5-1)')` (figures 5-37, 5-38, a photo). Fix:
      two blanks and `¥` (`Cal3Page.tsx:57`, `:66`). The `TAS` label stays as the guide shows it (a log line).
    - CAL 4: characterization (160 kt, 800 ft/min); `shows ANGLE 2.6, 2.8 and 1.8 for the figures' ground speeds and
      rates (5-12)` (figures 5-39 to 5-41); `shows FPM 0500 for an angle of 1.8 at 160 kt (5-12)`. Sibling `shows FPM 1500
      after the thousands digit of 0500 is set to 1 (5-12)`; **pin** `it.fails('shows ANGLE 5.3 for the 1500 ft/min
      shown (5-12, #NEW-6-2)')`. Fix: `this.fpm = Fpm` in `FpmFieldset.setFpm`.

- [x] **Step 5: CAL 5 to CAL 7.**
    - CAL 5: characterization of a fresh unit (`000°C`, `032°F`, `000kt`, `000mph`); `converts 25 C to 077°F (5-13)`
      (figure 5-43); `converts 50 F to 010°C (5-13)`; `converts -40 C to -40°F (5-10, 5-13)`; `converts 145 kt to
      167mph (5-13)` (figure 5-44); `converts 115 mph to 100kt (5-13)` (figure 5-42). Sibling `shows -40°C when the sign
      is set before the digits (5-10)`; **pin** `it.fails('converts -40 C entered sign first to -40°F (5-10, 5-13,
      #NEW-6-3)')`. Values above three digits (`010°F` for 104 °F, `115mph` for 1150 mph) appear in no assertion; they
      are the question `#NEW-6-4`.
    - CAL 6 (start 17:56 UTC, `timezone: 7`, CST; no time advanced): characterization; `shows 11:56 CST on top and 17:56
      UTC below at its first view (5-14)` (figure 5-45); `converts 09:56 PST to 12:56 EST with the zones selected by the
      knobs (5-14)` (figures 5-46 to 5-48); `changes the other time when the top or the bottom time is entered (5-14)`.
    - CAL 7 (FPL 0 KAAA 41 N 87 W to KBBB 42 N 88 W): characterization of rows 0-3 (rise and set are #164 and stay
      out); `defaults to the destination of FPL 0, today and the system zone (5-15)`; `shows rise and set an hour later
      in EST than in CST (5-15)` (figures 5-51, 5-52); `changes rise and set only when the new date is entered with ENT
      (5-15)` (later by 115 to 140 min, derived 128).

- [x] **Step 6: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/left/Tri0Page.test.ts", "test/render/pages/left/Tri1Page.test.ts", "test/render/pages/left/Tri2Page.test.ts", "test/render/pages/left/Tri3Page.test.ts", "test/render/pages/left/Tri4Page.test.ts", "test/render/pages/left/Tri5Page.test.ts", "test/render/pages/left/Tri6Page.test.ts", "test/render/pages/left/Cal1Page.test.ts", "test/render/pages/left/Cal2Page.test.ts", "test/render/pages/left/Cal3Page.test.ts", "test/render/pages/left/Cal4Page.test.ts", "test/render/pages/left/Cal5Page.test.ts", "test/render/pages/left/Cal6Page.test.ts", "test/render/pages/left/Cal7Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#NEW-6-1..3, #NEW-1-1 and #NEW-5-1 turn red under their fixes, with siblings", "no out-of-range value, blank F REQ, TRI 5 GS row, CAL 3 wind row or CAL 7 rise/set in snapshots", "TRI 3 variation point and TRI 1/2 no-fix dashes are characterizations", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 7: MOD, ALT, DIRECT TO, DUPLICATE WAYPOINT, self-test

**Goal:** Tests for MOD 1, MOD 2, ALT, DIRECT TO, DUPLICATE WAYPOINT and the self-test left page (its snapshot only), the
pins `#NEW-7-1` to `#NEW-7-6` and the MOD 2 pin of #160, the ALT warn row of
`VolatileMemory.test.ts` turned into a `#NEW-7-2` pin, and the trainer's OBS answers as spec tests.

**Files:**
- Modify: `test/render/pages/left/Mod1Page.test.ts` (append)
- Create: `test/render/pages/left/Mod2Page.test.ts`
- Modify: `test/render/pages/left/AltPage.test.ts` (append)
- Modify: `test/render/pages/left/DirectToPage.test.ts` (append)
- Create: `test/render/pages/left/DuplicateWaypointPage.test.ts`
- Modify: `test/render/pages/left/SelfTestLeftPage.test.ts` (append)
- Modify: `test/render/data/VolatileMemory.test.ts:147` (the `altPage` assertion; a new pin)

**Acceptance Criteria:**
- [x] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [x] `#NEW-7-1` to `#NEW-7-5` and the MOD 2 `#160` pin turn red under their fixes; each has a passing sibling.
- [x] `#NEW-7-6` is a pin with a sibling that asserts the course in `[359.5, 360)`.
- [x] The `#NEW-7-4` pin uses `FakeSim.applyObsKeyEvents`, not a wrapper of `keyEvents.push`.
- [x] The OBS step of one degree per click, north shown as `000°` and the wrap are spec tests citing the KLN 89 trainer.
- [x] `VolatileMemory.test.ts` no longer asserts `alertWarn: 300`; its `alertEnabled` half is unchanged.
- [x] The self-test page has its characterizations only; the DIRECT TO snapshot leaves out the right page's longitude
      row.
- [x] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [x] **Step 1: start from the drafts.** Read `research-G.md` and `research\trainer.md` Q11 to Q14. Copy
  `research\drafts-G\test\render\pages\left\{Mod2Page,DuplicateWaypointPage}.test.ts` and take the appended describes of
  the others. Rename `#NEW-G-1` to `#NEW-7-1`, `#NEW-G-2` to `#NEW-7-2`, `#NEW-G-3` to `#NEW-7-3`, `#NEW-G-4` to
  `#NEW-7-4`. **Change from the draft:** in `Mod2Page.test.ts` replace the wrapper of `sim.keyEvents.push` by
  `unit.env.sim.applyObsKeyEvents = true` (task 0).

- [x] **Step 2: MOD 1** (the standard route, 5 NM before ABC, ENR-OBS for the characterization).
    - `MOD 1 page (characterization)`: `PRESS ENT / TO ACTIVATE / / LEG / / CDI:±5.00NM` with the mask.
    - `shows ACTIVE MODE, LEG and CDI:±5.00NM in ENR-LEG, without the ent prompt (5-32)` (figure 5-107, 5-33);
      `selects ±5.00, ±1.00 and ±0.30 NM with the cursor on the CDI scale (5-38)` (figures 5-120, 5-121);
      `offers only ±1.00 and ±0.30 NM in the approach-arm mode (5-38)`; `shows PRESS GPS CRS FOR in OBS with the external
      switch, and ENT keeps OBS (5-33)` (figure 5-110; the spy on `switchToEnrLegMode`).
    - Sibling `armed at 25 NM with MOD 1 in view, the field shows ±1.00 NM (5-38)`; **pin** `it.fails('keeps a valid CDI
      scale when the knob turns after the unit armed with MOD 1 in view (5-38, #NEW-7-3)')`: one click, `xtkScale` in
      `[0.3, 1]` and `GPS CDI SCALING` finite. Fix: clamp the index in `setCDIScale` (or rebuild the choices per redraw).

- [x] **Step 3: MOD 2** (a leg due east along the equator, KAAA 0/8 to ABC 0/9, the aircraft at 8.4 E; the OBS taken is
  090 by construction).
    - `MOD 2 page (characterization)`: `ACTIVE MODE / / / OBS 070° / / CDI:±5.00NM` (ObsSource 1, `Nav OBS:1` 70).
    - **New** `shows OBS ---° without a colon in ENR-LEG with the default installation (characterization)`: the colon in
      Leg mode is a characterization without an issue (5-35 ties the colon to entry; the installation of figures 5-108
      and 5-110 is unknown).
    - `shows PRESS ENT TO ACTIVATE, OBS ---° and the ent prompt in ENR-LEG (5-33)` (figure 5-108; row 3 without its
      fourth cell); `enters ENR-OBS with ENT and shows OBS:090° and enr:090 (5-32, 5-33, 5-35, 5-36)`; `puts the cursor
      on the OBS course first and moves it to the CDI scale with the outer knob (5-35, 5-38)`; `reads the course from the
      indicator without a colon and keeps the cursor off it (5-35)`; `shows PRESS GPS CRS FOR in ENR-LEG with the external
      switch, and ENT keeps LEG (5-33)`.
    - **Change from the draft:** `steps the OBS course one degree per click` becomes the spec test `steps the OBS course
      one degree per click (5-35, checked in the KLN 89 trainer, 2026-10-07)`: +3 → `OBS:093°`, mode `enr:093`; -5 →
      `OBS:088°`.
    - **New, from the trainer** `shows north as 000° and wraps between 000° and 359° (5-35, checked in the KLN 89
      trainer, 2026-10-07)`: `ObsSource 0`, a leg due north along a meridian (KAAA 0/8 to ABC 1/8, the aircraft at
      0.4/8); the precondition `obsMag` is exactly 0 and row 3 is `OBS:000°   `; one click left `OBS:359°   `, one click
      right `OBS:000°   `. (A probe while this plan was written saw exactly these values.) Break: the course not
      normalized after the knob.
    - **`#NEW-7-6`** (trainer: north shows `000`, never `360`): on the equator leg with `ObsSource 0` the OBS taken is
      89.99999914…, so 90 clicks left give 359.99999914…, which row 3 shows as `OBS:360°   ` (the probe saw it; one more
      click right shows `OBS:001°   `). Sibling `turns the course 90 degrees left from the equator leg (5-35)`: `obsMag`
      in `[359.5, 360)`. **Pin** `it.fails('shows a course just below north as 000° (5-35, checked in the KLN 89
      trainer, 2026-10-07, #NEW-7-6)')`: row 3 `OBS:000°   `. Fix: normalize the rounded course in the OBS display
      (360 shows as 000). Ninety clicks are 22.5 s of simulated time; give the test a per-test timeout if it needs one.
    - Sibling `OBS:090° with a colon and the cursor on the course with a driven indicator (5-35)` (ObsTarget 1,
      `Nav OBS:1` 90, `applyObsKeyEvents`); **pin** `it.fails('keeps a course turned on MOD 2 and slews the indicator to
      it (5-35, #NEW-7-4)')`: 3 clicks, 2 s, `obsMag` 93 and `Nav OBS:1` 93. Fix: `sensors.out.setObs` right after the
      knob.
    - Sibling `armed 40 NM from the airport by the switch, MOD 2 shown (6-1)`; **pin** `it.fails('shows CDI:±5.00NM when
      armed by the switch 40 NM from the airport (5-38, 6-1, #160)')`. Fix: ARM choices `[0.3, 1, 5]` in `Mod2Page`.
      Task 8 comments on #160.

- [x] **Step 4: ALT and `VolatileMemory.test.ts`.**
    - `ALT page (characterization)`: ALERT ON with the cursor on it (` ALTITUDE`, blank, `BARO:29.92"`,
      `ALERT: ON ›`, `WARN:±300ft`, blank; the ON field `IIII`); `shows the baro setting of the altimeter and skips it
      with the cursor` (air data and `BaroSource 1`, 30.12 then 29.85).
    - `steps the cursor through the three baro positions to ALERT (3-55)`; `starts the cursor on the two leading
      digits of the millibar baro (3-39)`; `shows the arrow after ON and the WARN line (3-55)` (figure 3-178);
      `offers the warn altitudes 200 to 900 ft in 100 ft steps (3-55)`; `shows ALERT OFF and keeps the cursor off it when
      the installation disables altitude alerting (3-57)` (the OFF row compared with collapsed blanks: its spacing is
      unsettled).
    - Sibling `WARN 500 ft, a power cycle, and the WARN line shown again (3-55)`; **pin** `it.fails('keeps the WARN
      altitude of 500 ft over a power cycle (3-55, #NEW-7-2)')`: row 4 `WARN:±500ft`. Fix: drop the `alertWarn` reset
      (`VolatileMemory.ts:228`).
    - `VolatileMemory.test.ts:147`: replace `expect(m.altPage).toEqual({alertEnabled: false, alertWarn: 300})` by
      `expect(m.altPage.alertEnabled).toBe(false)` (whether ALERT ON/OFF survives is unsettled, so that half stays as it
      is), and add after the test `it.fails('keeps the ALT warn altitude over a power cycle (3-55, #NEW-7-2)')`: boot,
      `settle`, `m.altPage.alertWarn = 500`, `cycle(unit)`, `alertWarn` 500. The characterization is its sibling. Prove:
      the fix turns both `#NEW-7-2` pins red and leaves the characterization green.

- [x] **Step 5: DIRECT TO and DUPLICATE WAYPOINT.**
    - `DIRECT TO page (characterization)`: the active waypoint ABC awaiting confirmation with its VOR page on the right.
      **Change from the draft:** the draft snapshots the whole `dump()`, whose right page shows `E 08°00.00'`
      (`#NEW-1-8`). Snapshot `half('L')`, `status()` and `rows('R').slice(0, 5)`.
    - `puts the cursor over the blank identifier when there is no active waypoint (3-27)` (figure 3-87); `takes the
      waypoint page on the right, and one ENT makes it the Direct To waypoint (3-27, 3-28, 3-29)`; `returns both sides to
      their pages when D-> was pressed with NAV 1 on the left (3-28, 3-29)`; `cancels a Direct To with D->, CLR, ENT and
      returns to the flight plan (3-29, 4-7)`; sibling `MAPAA active and the aircraft on its FROM side (3-27)` and `offers
      the first waypoint of the missed approach (3-27)` (the MAP world of `NavCalculator.test.ts`, a copy task 8 notes).
    - **`#NEW-7-5`**: sibling `shows the typed unknown ident on the DIRECT TO page (3-27)` (D->, `enterIdent('L',
      'QQQQ')`: row 2 shows QQQQ, no facility QQQQ exists); **pin** `it.fails('offers to create a user waypoint for an
      unknown ident (checked in the KLN 89 trainer, 2026-10-07, #NEW-7-5)')`: after ENT the status line does not show
      `NO SUCH WPT`, and the right side shows `CREATE NEW ` and `WPT AT:    ` (the creation rows of the SUP page). Fix: a
      temporary change in `WaypointEditor.tsx:76` that opens the creation page.
    - DUPLICATE WAYPOINT (five `ABD`: VOR LS, NDB LF, VOR ED, NDB LI, INT LO at about 18, 72, 92, 135 and 170 NM from
      47 N 8 E): `DUPLICATE WAYPOINT page (characterization)` (row 0 ` ABD      4` and the item lines with masks, the
      first four waypoints, the line positions left out because of the pin); `the world: the five ABD lie at increasing
      distance (3-15)` (`geo.ts`); `shows the identifier and the number of waypoints that have it (3-15)`; `lists the
      waypoints closest first, with number, type and country (3-15)` (figure 3-52: `1 VOR CHE?`, `2 NDB FRA?`,
      `3 VOR DEU?`, `4 NDB ITA?`); `starts the cursor on the first waypoint and moves it to the fifth with the outer knob
      (3-15)` (figure 3-53); `shows the selected waypoint and makes it the Direct To waypoint with two ENT (3-15)`
      (figure 3-54; assert the latitude row only).
    - Sibling `five waypoints named ABD open the page with the count 5 (3-15)`; **pin** `it.fails('shows the header TYPE
      AREA in row 1 and four waypoints in rows 2 to 5 (3-15, checked in the KLN 89 trainer, 2026-10-07, #NEW-7-1)')`
      (figures 3-52, 3-53; the trainer's header row with the type and area titles). Fix: a header row and `List`
      height 4.

- [x] **Step 6: the self-test page.** **Change from the draft:** the design gives the self-test page its snapshot only
  (the self-test values are Session 10's). Keep `self-test left page (characterization)` (`Nav OBS:1` 242:
  `DIS  34.5NM`, the bar, `OBS IN 242°`, `   OUT 315°`, `RMI    130°`, `ANNUN    ON`) and `shows OBS IN ---° when the
  unit reads no indicator (characterization)`. Leave out the three spec tests of the draft (OBS IN following the
  indicator, ANNUN ON, the D-bar half scale); the report lists them for Session 10.

- [x] **Step 7: verify and commit.** `npm test` and `npx tsc --noEmit`, then one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/render/pages/left/Mod1Page.test.ts", "test/render/pages/left/Mod2Page.test.ts", "test/render/pages/left/AltPage.test.ts", "test/render/pages/left/DirectToPage.test.ts", "test/render/pages/left/DuplicateWaypointPage.test.ts", "test/render/pages/left/SelfTestLeftPage.test.ts", "test/render/data/VolatileMemory.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "#NEW-7-1..5 and the MOD 2 #160 pin turn red under their fixes, with siblings", "#NEW-7-6 pinned with a sibling asserting the course in [359.5, 360)", "#NEW-7-4 uses applyObsKeyEvents", "OBS step, 000 and wrap are spec tests citing the trainer", "VolatileMemory warn half is a #NEW-7-2 pin; alertEnabled half unchanged", "self-test page characterizations only; DIRECT TO snapshot without the longitude row", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 8: issues and close-out

**Goal:** File the issues and comments, replace every placeholder, update `testing.md`, write the session log and tick
the checkbox.

**Files:**
- Modify: every test file that holds a `#NEW-` placeholder
- Modify: `docs/testing.md` (sections 6 and 7)
- Modify: `docs/test-coverage.md` (the Session 8 checkbox and result; the session log)
- Modify: `docs/superpowers/plans/2026-10-07-session-8-left-pages.md` (the task checkboxes)

**Acceptance Criteria:**
- [x] Every row of the placeholder table is an issue or, where a search finds one, a comment on the existing issue,
      each searched first in open and closed issues with several wordings; a row marked "if confirmed" whose task did
      not confirm it is a log line, not an issue.
- [x] #150, #160, #217 and #192 have the comments the design lists; #92, #168 and #122 were read before `#NEW-5-5`,
      `#NEW-7-1` and `#NEW-7-6` were filed.
- [x] `grep -r "#NEW-" test/` prints nothing.
- [x] `testing.md` sections 6 and 7 carry the design's notes, and the section 7 line that #99 has no pin is gone.
- [x] The session log has the coverage at the start and the end, the bugs filed, the rulings, the trainer results and
      the "not covered" list with the pages without a spec test (rule 18).
- [x] `npm test` and `npx tsc --noEmit` pass.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [x] **Step 1: issues.** Runs in the main checkout on the session branch (GitHub access). For each row of the
  placeholder table: search open and closed issues (`mcp__github__search_issues`, repo `falcon71/kln90b`) with at least
  three wordings, paced at about ten searches a minute; file a new issue with the label the table gives (`bug` or
  `question`) per `CLAUDE.md` "Bugs go to GitHub issues": what is wrong, the reproduction with observed and expected
  values, the file and line, the impact, a suggested fix, and the test that pins it. Cite manual pages; never copy manual
  text. Each issue names its source ("found in the headless harness" or "found by reading the code"), and the KLN 89
  trainer where it decided the case. Per row:
    - `#NEW-1-1` references #99 and #184 (the same family, other functions) and lists every user of `DurationDisplay`.
    - `#NEW-1-8` names the trainer and the KLN 90 photo, and that the editors (SET 1, the waypoint pages) show the same
      zero when not being edited; the open edit field keeps its zeros.
    - `#NEW-2-4` and `#NEW-2-7` only if task 2 confirmed them; `#NEW-7-6` is related to #122.
    - `#NEW-2-5` (`question`): the scales of the guide's figures and photos (1, 2, 3, 5, 10, 15, 20, 40, 60) against the
      code's list; the trainer has no map, and the KLN 89 guide gives only the end points.
    - `#NEW-2-6` (`question`): 6-18 puts NO INTRCPT in the scratch pad, Appendix C lists it among the status-line
      messages (spelled `NO INTRCEPT`, the code's spelling), 5-36 calls the `CRS` message of that list a scratch-pad
      message; Super NAV 5 has no status line.
    - `#NEW-5-5`: read #92 first (its slot limit of ten). If #92 already names the dead guard, comment on #92, rename the
      pin to `#92` and file nothing; otherwise file it with a reference to #92.
    - `#NEW-6-4` (`question`): CAL 5 shows `010°F` for 104 °F and `115mph` for 1150 mph; F REQ is blank (NaN) at a
      ground speed of 0 (and would read `99999` with a fuel flow, from the code).
    - `#NEW-7-1`: read #168 (a US airport without a country) first and reference it.
    - `#NEW-7-2` references #192; `#NEW-7-3` references #159 and #160; `#NEW-7-5` names both halves if task 3 confirmed
      the FPL one.
- [x] **Step 2: comments on existing issues.**
    - #150: deleting a numbered plan with DELETE FPL? is not saved either (`Flightplan.delete` publishes nothing); the
      pin in `FplPage.test.ts`.
    - #160: the MOD 2 half is pinned in `Mod2Page.test.ts`.
    - #217: the second reproduction on SET 2 (the cursor on the MAG V line when the aircraft enters the coverage area),
      the pin in `Set2Page.test.ts`; a fix in `CursorController` would cover both.
    - #192: the ALT warn altitude reset at every power-on (`#NEW-7-2`, its issue number).
- [x] **Step 3: replace the placeholders** in one commit (`references #…` for every issue), and check
  `grep -r "#NEW-" test/` prints nothing.
- [x] **Step 4: `testing.md`.**
    - Section 6: **the fuel computer reads `NUMBER OF ENGINES` once, while it is built**: a test without the `simVars`
      option counts no real engine and sees every fuel flow and fuel used as 0; OTH 5 to OTH 10 exist only with the
      matching interfaces. **`selectPage` runs the pages it passes:** each is built and runs its side effects (CAL 2
      overwrites the CAL 3 TAS on the way from CAL 1, #33; the TRI pages read their memory when built, so a test seeds
      it first). **`selectPage` throws once a row overflows**, because it reads the screen: an overflow pin selects its
      page first and reads the raw row with `readRows`.
    - Section 7: **Super NAV 5's cursor** is read by local `focused` helpers over the `.inverted` spans in
      `SuperNav5Page.test.ts`, because `SuperNav5.read()` has no mask; a `focused` field in the reader would replace them.
      **`vitest -t` takes a regular expression**: titles with `(`, `)`, `+`, `?` or `#` need escaping in a filtered run.
      The MAP world with a missed approach now has its third and fourth copies (tasks 2 and 7; the "Shared worlds"
      bullet). Remove the line that #99 has no pin yet. Add the leads the tasks reported and did not confirm.
- [x] **Step 5: the session log** in `docs/test-coverage.md` section 4, newest first, in the format of the Session 7
  entry: Done (per task), Rulings (the maintainer's decisions and the controller's defaults of the design, plus the
  changes the plan made to the drafts), Trainer results, Bugs found and filed (one line per issue with its pins),
  Fixes that could not be re-broken, Not covered (rule 18: the design's log-only items, each task report's uncovered
  rest, and **the pages without a spec test**), Workflow notes, and the coverage table at the start
  (`scratchpad\coverage-start.txt`) and at the end (`npm run coverage`), with the files of `kln90b/pages/left` below 50 %
  at the start and their end values, plus the suite counts. Tick the Session 8 checkbox and add its "Result" paragraph
  in section 3.
- [x] **Step 6: the plan's checkboxes.** Tick the task checkboxes of this plan.
- [x] **Step 7: verify and commit.** `npm test`, `npx tsc --noEmit`, `grep -r "#NEW-" test/`, then commit.

```json:metadata
{"files": ["docs/testing.md", "docs/test-coverage.md", "docs/superpowers/plans/2026-10-07-session-8-left-pages.md"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["every placeholder row filed or commented after a search; unconfirmed rows are log lines", "comments on #150, #160, #217, #192; #92, #168, #122 read first", "no #NEW- left in test/", "testing.md sections 6 and 7 updated; #99 no-pin line removed", "session log complete with coverage, rulings, trainer results, rule 18 and the pages without a spec test", "suite green"], "modelTier": "frontier"}
```

---

## Execution notes for the controller

- Dispatch task 0 alone and merge it into `tests-session-8-left-pages`; run `npm test` and `npx tsc --noEmit` on the
  result. Then dispatch tasks 1 to 7 in parallel worktrees, each told the session branch's head after the merge; each
  implementer resets its worktree branch to it first, and the controller checks the merge base before every review.
- Implementers start on Sonnet (rule 26); a task whose implementer struggles is re-dispatched on Opus. Each reports the
  per-describe label audit in its report before the review.
- Reviewers: Opus for tasks 2, 3 and 7, Sonnet for tasks 0, 1, 4, 5 and 6; re-reviews on Sonnet. Each reviewer:
    - runs the mutation pass in the task's worktree (the mutations are never named to the implementer; a survivor is a
      finding; it restores the code and checks that `git diff` is clean);
    - checks every page citation in the diff against `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\pilots-guide-index.md`;
    - greps the added comments for verbatim runs of manual text;
    - checks the label audit against the diff: a test with neither a citation nor a characterization label, a citation
      on a characterization, a spec test inside a characterization describe, a permissive assertion and a frozen bug in a
      snapshot are Important findings (rule 24).
- Merge each approved task by completion into the session branch, then run `npm test` and `npx tsc --noEmit` on the
  result.
- Task 8 runs on Opus in the main checkout on the session branch, after tasks 1 to 7 have merged.
- Then the final review of the whole session on the controller's model, then the maintainer's approval. Only then the
  cleanup: for every task worktree and the research worktrees of agents A to G and the trainer agent,
  `cmd //c rmdir <wt>\node_modules` first (it removes the junction, not the target), then `git worktree remove <wt>`,
  then `git branch -d` for each `worktree-agent-*` branch (`git worktree list` first; read `git log <base>..<branch>`
  for any branch that `-d` refuses).
