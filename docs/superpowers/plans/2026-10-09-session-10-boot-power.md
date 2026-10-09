# Session 10 (boot, power and the unit as a whole): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Tests of the lifecycle the sim exercises on every flight (the cold-and-dark boot, the self test, the power
cycle, the tick loops, the overlays, startup robustness and `KLN90BCore.init`), with spec tests where the manuals or the
KLN 89 trainer give the rule, labeled characterizations elsewhere, and pins for the bugs the research and the trainer
found, each proven to bite; plus two harness helpers (task 0).

**Architecture:**
- **Task 0** (harness) runs alone first: `bootToSelfTest()` and `recordSounds()`, with their harness tests and their
  `testing.md` paragraphs.
- **Tasks 1 to 5** are parallel batches, one per research area (A to E). Each runs in its own git worktree, reset to the
  session branch after task 0 has merged, starts from the research drafts, and ends in one commit (plus one per fix
  round). They share no file.
- **Task 6** files the issues and comments, replaces the placeholders, updates `testing.md` and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk`, the headless
harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-09-session-10-boot-power-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task. The
  design's rulings, its bug table and its controller's defaults override anything in the research reports.
- **Branches.** The session branch is `tests-session-10-boot-power`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`, which is stale:
    - Before anything else, run `git reset --hard tests-session-10-boot-power` on the (still empty) worktree branch.
    - Check `git log -1`: it must show the session branch's head, which the controller names in the dispatch.
    - If `node_modules` is missing, create it as a junction to `E:\msfs\kln90b\node_modules` (PowerShell:
      `New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules`). Never delete it
      recursively and never run `npm install`.
- **No behavior changes** in `kln90b/` (rule 12). A task that finds it needs a seam stops and reports.
- **Evidence rule** (the maintainer's): the 90B Pilot's Guide and its figures win; the KLN 89 trainer decides where the
  90B guide is silent; a behavior that exists only on the 89 (its two altitude pages, its take-home warning, its
  start-up order, its full-screen data base page) never becomes a pin.
- **Test names** carry the issue where there is one: `'… (#199)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<X>-<n>)')` (rule 23) with the placeholder of the design's bug table (`#NEW-A-1`, `#NEW-A-2`,
  `#NEW-B-1` to `#NEW-B-3`, `#NEW-C-1`, `#NEW-E-1` to `#NEW-E-4`). The research drafts already use these names; keep
  them.
- **Labels** (`testing.md` section 5, rules 6 and 7):
    - A **spec test** cites its source in a comment and in its title: a Pilot's Guide page (`3-7`), a figure
      (`figure 3-3`), the Installation Manual (`Installation Manual 2-68`), the maintenance manual (`maintenance manual
      PDF 97`, the page numbering the research used), a video timestamp the code cites, "checked in the KLN 89 trainer,
      2026-10-09" with the id (`T3`), the public contract (`CLAUDE.md`, `LVars.ts`, `HEvents.ts`), `docs/architecture.md`
      (Core 1, Core 2) for an architectural rule, or the fix commit for a regression test (`7b4465d`).
    - A **characterization test** has `characterization` in its `describe` or `it` title and carries no page number, no
      trainer and no photo citation, neither in its title nor in its comments.
    - A **pin** asserts the source and cites it. Its **passing sibling** is a test like any other: it cites the page its
      preconditions rest on, or it carries `characterization`.
    - A describe whose title says `characterization` holds only characterizations.
    - A trainer citation supports only what `research/trainer.md` records as observed (its key sequence, its
      direction). The trainer supports a rule; the literals (page names) come from the 90B page order (3-12, 3-13).
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `maintenance-manual-index.md`, `install-manual-index.md`, `reference-photos-index.md`). Cite page numbers, never
      copy manual text.
    - Before the review, the implementer reports a **per-describe label audit**: every describe and `it` title, its
      label (spec, characterization, pin, sibling) and its page or source.
- **Snapshots and assertions never hold a pinned bug** (rule 8). Known ones in this area: the stray `,` of the VFR only
  page (`#NEW-A-1`), the SYSTEM TIME UPDATED message of an engine-running boot (`#NEW-A-2`), the self-test RMI output
  with a variation (`#NEW-B-1`), `msg` on the self-test status line (`#NEW-B-2`), the running seconds after a time entry
  (`#NEW-B-3`), the Database page's four-digit year (#199), the unit turning off after less than 1.5 s without power
  (`#NEW-C-1`), the dead knobs and CRSR on the MSG page (`#NEW-E-1`), Super NAV 1 left over the DIR page (`#NEW-E-2`),
  the MSG page kept over D→ and ALT (`#NEW-E-3`), SET 0 left by the inner knob on its prompt (`#NEW-E-4`).
- **Expected values** are literals, or derived by hand (`test/harness/flight/geo.ts`, the ISA formula, the page order of
  3-12). Never derive them from the code under test or the SDK's flavor of the same formula.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure (screen rows, masks, the message list, the repository, the stored setting, the recorded sound
  ids), not substrings of a whole screen.
- **Flashing cells** read `F` on one display tick in four. Read them with `blinkCycle` (`test/harness/render/blink.ts`),
  never with one read whose phase decides the result. A test that asserts text only may ignore the mask.
- **Pins.**
    - Every `it.fails` has a passing sibling that asserts its heavy preconditions.
    - A pin is proven by fixing the bug temporarily and seeing the pin turn red, then restoring. The fix is named in the
      research report or in the task below.
    - **Vehicles (Session 9b's lesson).** With each pin's temporary fix applied, run the **whole** suite, not just the
      task's files. A test elsewhere that turns red uses the bug as its vehicle: it freezes the bug (rule 8). Fix it in
      your own files; report it when it is in a file you do not own. Task 1 owns the `#NEW-A-2` vehicles (below).
- **Proof per test (rule 10).**
    - Break the subject by hand: the break the research report recorded, and at least one break the implementer chooses
      itself.
    - Run the test, see it fail, restore, and check that `git diff` shows only test files.
    - Never commit the broken state.
- **Mutation runs.** A kill that appears only while other suites run in parallel is re-run alone before it counts.
  `vitest -t` takes a regular expression: escape `(`, `)`, `+`, `?` and `#` in a title used as a filter. Restore a
  mutated file from a byte copy, not with `sed` (CRLF).
- **Commits (rule 22).**
    - One commit per task, plus one per fix round, never amended.
    - The message lists every test as `- <test>: Proof: fails when <break>`, and every pin as
      `- <pin>: Proof: turns red with <fix>`.
    - It ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
    - Write the message with a Bash heredoc or `-m`: PowerShell `Set-Content` writes a byte order mark.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, `docs/testing.md`, `CLAUDE.md`, the harness under
  `test/harness/`, GitHub issues, and other tasks' files. Task 0 is the exception for the harness and `testing.md`, task
  6 for the documents and the issues, task 1 for the `#NEW-A-2` vehicle files listed in its task. A task that needs a
  change in a file it does not own reports it.
- **Copyright and data.** Never commit manual text, tables or figures, or navdata recorded from the sim. Facilities are
  invented. The KLN 89 trainer is cited as "the KLN 89 trainer"; its Chicago and Wisconsin waypoints never appear in
  tests. Short on-screen display strings (`APPROVE?`, `ACKNOWLEDGE?`, `SELF TEST IN PROGRESS`) are fine.
- **Research and scratch.**
    - The session scratchpad is
      `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\ef32cb9b-691f-4fbf-8b11-f09c69e8b0c2\scratchpad\`.
    - The reports are `research\A\research-A.md` to `research\E\research-E.md` and `research\trainer.md`; the drafts are
      in `research\<X>\drafts\test\…`, laid out like `test\` (research B also has `research-B.patch`, research C and D
      `drafts.diff`). The research worktrees under `E:\msfs\kln90b\.claude\worktrees\agent-*` hold the same drafts; never
      edit them.
    - Each report's item list (A1 to C2, L1 to R11, items 1 to 22, sections 1 to 6, items 1.1 to 1.21) gives per test:
      setup, expected literal, citation, the break that proves it. It is this plan's per-item list; the tasks below name
      only what changes.
    - The drafts ran green on the session branch before task 0, but they are starting points, not finished tests. Where
      a draft file is an existing test file with new tests appended, take the appended part and leave the existing
      tests as they are, except where a task says otherwise.
    - Do not copy the research's break lists or mutation ids into test comments.
    - Scratch scripts go only into `scratchpad\task-<N>\`.
- **CRLF.** The repo files are CRLF in the working tree; the drafts are partly LF. `sed -i` and `perl -i` under Git Bash
  rewrite edited lines as LF, so edit with the Edit tool (or write new files with the Write tool), and check `git diff`
  for line-ending noise before committing. Inline snapshots that Vitest writes into a CRLF file come out LF: normalize.
- **Line length.** Wrap test titles and comment lines at 120 characters.
- **Reports.** Implementers in a worktree write `.task-report.md` at the root of their own worktree (untracked, never
  committed), with the Bash tool (`cat > .task-report.md <<'EOF'`) or, if that fails, the Write tool. The report lists
  per item the test path, spec or characterization, any change of verdict with its reason, every suspected bug with a
  reproduction, every vehicle found under a pin's temporary fix, and the per-describe label audit. The reply to the
  controller is only the status, the head commit and the concerns.

**User decisions (already made):**
- A KLN 89 trainer round after the research, before the design (done: `research/trainer.md`, T1 to T12).
- `#NEW-A-2` (SYSTEM TIME UPDATED on every engine-running boot) is a bug: filed and pinned; `testing.md` section 6 is
  rewritten.
- `#NEW-C-1` (a power loss under one second restarts the unit) is a bug: filed and pinned; the maintenance manual's
  battery module is the spec.
- A small harness task 0: `bootToSelfTest()` and a sound recorder.
- Figure 3-3 shows SELF TEST IN PROGRESS inverse: that test is a spec test citing it.
- Evidence rule: the 90B guide and figures win; the 89 decides where the 90B guide is silent.
- The bug table, the controller's defaults, the task split, the models and the workflow of the design: approved.

---

### Task 0: harness

**Goal:** `bootToSelfTest()` and `recordSounds()`, each with a harness test and its paragraph in `testing.md`, without
changing what any existing test proves.

**Files:**
- Modify: `test/harness/boot.ts` (`bootToSelfTest`)
- Create: `test/harness/sounds.ts` (`recordSounds`)
- Create: `test/render/harness/selfTestBoot.test.ts`, `test/render/harness/sounds.test.ts`
- Modify: `docs/testing.md` (sections 4 and 7)

**Acceptance Criteria:**
- [ ] `bootToSelfTest(opts)` boots cold and dark whatever `opts.engineRunning` says, powers on, advances 19 s (the
  hand-written copies' wait) and returns the `HeadlessUnit` with the self-test page showing; it throws with
  `Screen.read().dump()` when the right half does not hold `APPROVE?`.
- [ ] `recordSounds(unit)` returns `{ids, finishAll}`: `ids` lists the sound ids requested on `sound_server_play_sound`
  after it was installed (not a cached earlier one), and `finishAll()` reports the end of the playing sound to the
  unit's `AudioGenerator` until no new sound is requested, at most 20 times.
- [ ] Harness tests: the self-test page shows after `bootToSelfTest` (left row `   OUT 315°`, right `APPROVE?`) and the
  unit is not on its main page; `bootToSelfTest` with a wait cut short throws (proven by a temporary 10 s wait). After
  APPROVE? with `Output.AltitudeAlertEnabled` true, `ids` is one `kln_short_beep` before `finishAll()` and five after
  (3-7); a recorder installed after a sound played starts empty.
- [ ] `testing.md` section 4 has a paragraph for each helper; section 7's Session 4 item on the self-test boot says the
  helper exists and the older copies stay.
- [ ] `npm test` green, `npx tsc --noEmit` clean, the counts in the report.

**Verify:** `npx vitest run test/render/harness/selfTestBoot.test.ts test/render/harness/sounds.test.ts` → all pass;
`npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree.** Reset to the session branch as the Global Constraints say; `npm test` must be green
  (2637 passed, 350 expected failures, 304 files).

- [ ] **Step 2: `bootToSelfTest`** in `test/harness/boot.ts`, after `bootUnit`:

```ts
/**
 * A cold-and-dark boot to the self-test page: the unit is powered on and the clock runs past the Turn-On page (17 s)
 * until the self-test page shows APPROVE?, which it does until it is approved (3-3 to 3-7). The hand-written copies of
 * this sequence in older tests stay as they are (testing.md section 7)
 */
export async function bootToSelfTest(opts: BootOptions = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({...opts, engineRunning: false});
    await unit.panel.powerOn();
    await vi.advanceTimersByTimeAsync(19_000);
    const screen = Screen.read();
    if (!screen.rows('R').some(r => r.trim() === 'APPROVE?')) {
        throw new Error(`bootToSelfTest: no APPROVE? on the self-test page after 19 s\n${screen.dump()}`);
    }
    return unit;
}
```

  Check the imports `boot.ts` already has (`vi`, `Screen`): add what is missing without creating an import cycle with
  `render/screen.ts` (if `screen.ts` imports `boot.ts`, put the helper in a new `test/harness/selfTest.ts` instead and
  say so in the report). Check that `rows('R')` works on the self-test page (a `FiveSegmentPage`); if `APPROVE?` sits in
  another row form, match what `cursorTo('R', 'APPROVE?')` finds.

- [ ] **Step 3: `recordSounds`** in `test/harness/sounds.ts`:

```ts
import {HeadlessUnit} from './boot';

/** The sounds a unit asked the sim to play, and a way to play them through */
export interface SoundRecorder {
    /** The sound ids requested on sound_server_play_sound since the recorder was installed, in order */
    readonly ids: string[];

    /**
     * Reports the end of the playing sound to the unit, as KLN90B.onSoundEnd does in the sim, until no new sound is
     * requested (at most 20 times), so that a pattern of several tones (AudioGenerator) plays through
     */
    finishAll(): void;
}

export function recordSounds(unit: HeadlessUnit): SoundRecorder {
    const ids: string[] = [];
    let installing = true;
    unit.props.bus.getSubscriber<any>().on('sound_server_play_sound').handle((id: string) => {
        if (!installing) ids.push(id);
    });
    installing = false;
    const audio = unit.props.sensors.out.audioGenerator;
    return {
        ids,
        finishAll() {
            for (let i = 0; i < 20 && ids.length > 0; i++) {
                const before = ids.length;
                audio.onSoundEnd({__Type: 'Name_Z', idLow: 0, idHigh: 0, str: ids[ids.length - 1]} as unknown as Name_Z);
                if (ids.length === before) return;
            }
        },
    };
}
```

  The `installing` flag drops a cached value that the bus hands a new subscriber at once (testing.md section 6); check
  whether this topic is cached at all and keep the flag only if it is (the harness test below decides). Read
  `kln90b/services/AudioGenerator.ts` and `test/render/services/AudioGenerator.test.ts` first: if the end of a sound
  must name the playing id, use the last requested id as above.

- [ ] **Step 4: Harness tests.** `selfTestBoot.test.ts`: `bootToSelfTest()` shows `   OUT 315°` on the left and
  `APPROVE?` on the right, and `unit.errors` is empty; a second test boots with a temporary wait of 10 s through a local
  copy (or `vi.spyOn`) and expects the throw, so the guard is proven (or prove the guard by breaking the helper by hand
  and record it). `sounds.test.ts` on the self-test page with `Output.AltitudeAlertEnabled` true: before ENT on
  APPROVE? `ids` is `[]`; after ENT `ids` is `['kln_short_beep']`; after `finishAll()` five `kln_short_beep` (3-7 step
  11); a recorder installed after the beeps starts with `[]`. Prove: `finishAll` as a no-op leaves one id.

- [ ] **Step 5: `testing.md`.** Section 4 (Render): `bootToSelfTest(opts)` and `recordSounds(unit)` with their use and
  limits. Section 7: in the Session 4 list, the item "The self-test page and the `"kln90b"` planner" says the self-test
  boot is now `bootToSelfTest` and the older copies (`SelfTestLeftPage.test.ts`, `SelfTestRightPage.test.ts`,
  `SensorsOut.test.ts`, `HEvents.test.ts`, `NavCalculator.test.ts`, `Button.test.ts`, `enterIdent.test.ts`) stay;
  tasks 1 and 2 move their own files onto it.

- [ ] **Step 6: Commit** with one `Proof:` line per item, then write `.task-report.md`.

```json:metadata
{"files": ["test/harness/boot.ts", "test/harness/sounds.ts", "test/render/harness/selfTestBoot.test.ts", "test/render/harness/sounds.test.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["bootToSelfTest boots cold, powers on, waits 19 s, throws without APPROVE?", "recordSounds records ids after install and finishAll plays a pattern through", "harness tests proven by breaks", "testing.md sections 4 and 7", "npm test green, tsc clean"], "modelTier": "standard"}
```

### Task 1: the Turn-On page and the start-up pages

**Goal:** The tests of research A in `WelcomePage.test.ts` and `StartupPages.test.ts`, with the pins `#NEW-A-1`,
`#NEW-A-2` and #199, and the `#NEW-A-2` vehicles moved off the bug.

**Files:**
- Create: `test/render/pages/WelcomePage.test.ts`, `test/render/pages/StartupPages.test.ts`
- Modify (the `#NEW-A-2` vehicles only): `test/render/data/Messages.test.ts`, `test/render/data/PersistentMessages.test.ts`,
  `test/render/data/navdata/AirspaceAlert.test.ts`, `test/render/data/navdata/KLNMagvar.test.ts`,
  `test/render/pages/left/Set1Page.test.ts`, `test/render/HEvents.test.ts`, `test/render/harness/screen.test.ts`
- Source drafts: `research/A/drafts/test/render/pages/*`

**Acceptance Criteria:**
- [ ] Every test of research A is in its file except B8 (the five beeps; task 2 has them, with A's "no beep without the
  altitude alert output" sibling) and B9 (the right page after power-on; task 3 has it).
- [ ] A7 (SELF TEST IN PROGRESS inverse) is a spec test citing figure 3-3 (the maintainer confirmed the figure); A4 (the
  cursor holds the Turn-On page) a spec test whose comment states the inference from 5-28; A6 stays a characterization.
- [ ] A5 (the Turn-On time) does not use `bootToSelfTest` (it measures the time); the tests that start on the self-test
  page or after APPROVE? use it where their wait is the standard one.
- [ ] Pins: `#NEW-A-1` (B6, 3-7, figure 3-22) with B5 as its sibling; `#NEW-A-2` (C2, B-3, B-4) with its sibling; #199
  (B3, 3-7) on the boot Database page.
- [ ] **The `#NEW-A-2` vehicles.** With the temporary fix below, these existing tests turned red in the controller's
  run because they use SYSTEM TIME UPDATED as the proof that "the list is the live one" or as the content of the MSG
  page: `Messages.test.ts` (two `SET FUEL ON BOARD` tests, and the boot-message reading at about line 30),
  `PersistentMessages.test.ts` (three ALTITUDE FAIL tests and MAGNETIC VAR INVALID at N 73.5),
  `AirspaceAlert.test.ts` (two), `KLNMagvar.test.ts` (two), `Set1Page.test.ts` (the CONFIRM? characterization at about
  line 194), `HEvents.test.ts` (the MSG button test at about line 230), `screen.test.ts` (the MSG page lines at about
  line 160). Each is changed so that it holds the same thing without the bug: the live-list guard asserts
  `POSITION DIFFERS FROM LAST POSITION BY >2NM` (empty storage: the last position is 0/0, a real message), or a message
  the test posts itself with `unit.props.messageHandler.addMessage(new OneTimeMessage([...]))`; the MSG page tests show
  a message the test posted. Every changed test is re-proven by its original break, and none of them turns red under
  the temporary fix any more. `GpsAcquisition.test.ts` mentions the message too: check it under the temporary fix and
  leave it if it stays green.
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/pages/WelcomePage.test.ts test/render/pages/StartupPages.test.ts
test/render/data test/render/HEvents.test.ts test/render/harness/screen.test.ts test/render/pages/left/Set1Page.test.ts`
→ all pass (pins as expected failures); `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say; check the head is the session branch after task 0's merge.
- [ ] **Step 2: Copy the drafts**; drop B8 and B9 (and any helper only they used); move the self-test boots onto
  `bootToSelfTest` where the wait is the standard 19 s.
- [ ] **Step 3: Labels:** A7 cites figure 3-3; A4's comment states the 5-28 inference; A6 keeps `characterization`.
- [ ] **Step 4: Pins.** `#NEW-A-1`: remove the comma at `VFROnlyPage.tsx:31`. `#NEW-A-2`: the temporary fix the
  controller used, in `Gps.powerChanged`, adds at least one hour at the first power-on:

```ts
// TEMPORARY, never committed: the first power-on adds back at least the hour the constructor took off
const add = (this as any).tmpFirst === undefined
    ? Math.max(evt.timeSincePowerChange, HOURS_TO_SECONDS * 1000) : evt.timeSincePowerChange;
(this as any).tmpFirst = false;
this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + add);
```

  (Research A's fix in `PowerButton.forceReadyToUse` also makes the screen start cold and turns unrelated tests red; use
  the GPS-side one.) #199: `{YYYY}` to `{YY}` in `Database.ts`.
- [ ] **Step 5: The vehicles.** Apply the `#NEW-A-2` temporary fix, run the whole suite, list every test that turns red
  besides the pin, change each as the Acceptance Criteria say, and run again under the fix until only the pin is red.
  Restore the fix. Do the same for `#NEW-A-1` and #199 (expected: no vehicle).
- [ ] **Step 6: Prove** every test by its research break and one of your own.
- [ ] **Step 7: Full suite, `tsc`, commit, report** with the label audit and the vehicle list.

```json:metadata
{"files": ["test/render/pages/WelcomePage.test.ts", "test/render/pages/StartupPages.test.ts", "test/render/data/Messages.test.ts", "test/render/data/PersistentMessages.test.ts", "test/render/data/navdata/AirspaceAlert.test.ts", "test/render/data/navdata/KLNMagvar.test.ts", "test/render/pages/left/Set1Page.test.ts", "test/render/HEvents.test.ts", "test/render/harness/screen.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research A tests in place minus B8 and B9", "A7 spec on figure 3-3, A4 inference stated, A6 characterization", "pins #NEW-A-1, #NEW-A-2, #199 with siblings, proven", "the #NEW-A-2 vehicles moved off the bug and re-proven", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 2: the self-test pages and outputs

**Goal:** The tests of research B in the two self-test page files, with research A's no-output beep sibling, the pins
`#NEW-B-1` to `#NEW-B-3`, on task 0's helpers.

**Files:**
- Modify: `test/render/pages/left/SelfTestLeftPage.test.ts`, `test/render/pages/right/SelfTestRightPage.test.ts` (append;
  keep the existing tests, and move their hand-written self-test boots onto `bootToSelfTest` where the wait is the
  standard one)
- Source drafts: `research/B/drafts/…` (or `research-B.patch`), and research A's `tonesAtApproval(false)` test from
  `research/A/drafts/test/render/pages/StartupPages.test.ts`

**Acceptance Criteria:**
- [ ] Every test of research B is in its file (L3, L5, L6, L9, L10, R1 to R9).
- [ ] L9 (the left knobs on the self-test page) is a characterization without the maintenance manual citation (the
  design: the manual describes the bench test mode).
- [ ] The five beeps (R8) and the no-beep sibling (research A's "gives no beep without the altitude alert output", 3-7)
  use `recordSounds` and `finishAll()`.
- [ ] Pins: `#NEW-B-1` (L6; 3-4, Installation Manual 2-68) with its sibling; `#NEW-B-2` (L10; figure 3-4, "checked in
  the KLN 89 trainer, 2026-10-09", T8 — T8 saw no message prompt during the 89's self test, without an OBS course) with
  its sibling.
- [ ] `#NEW-B-3` (new): on the self-test page before a fix (storage `fastGpsAcquisition: false`, as R5), enter a time
  and ENT; the pin asserts the seconds shown right after ENT are `00` (3-6, figures 3-15 to 3-17, "checked in the KLN 89
  trainer, 2026-10-09", T11: the clock starts from the entered hour and minute with the seconds at zero). Its passing
  sibling is R5 (the entered hour and minute show after ENT and the clock runs on). Read the seconds' cells from the
  row; find the row layout in the existing characterization first.
- [ ] The ALT row tests parse the number (the padding is log-only, the design).
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/pages/left/SelfTestLeftPage.test.ts
test/render/pages/right/SelfTestRightPage.test.ts` → all pass (pins as expected failures); `npm test` → no failures;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**; replace `onSelfTestPage`, `selfTestWithCourse`, `selfTestWithVariation` and
  `selfTestAsFigure` bodies by `bootToSelfTest(opts)` plus their own setup; replace the hand-rolled beep recorder by
  `recordSounds`.
- [ ] **Step 3: Relabel L9** as a characterization; add the no-beep sibling.
- [ ] **Step 4: Draft and prove `#NEW-B-3`.** Temporary fix: in `SelfTestRightPage.saveTime` (read it first) set the
  seconds of the new time to zero. The pin turns red under it; R5 stays green.
- [ ] **Step 5: Prove** every test by its research break and one of your own, every pin by its fix (`#NEW-B-1`:
  `nav.bearingToActive = this.magvar.magToTrue(130)` at `NavCalculator.ts:53`; `#NEW-B-2`: no
  `AdjustCourseToWithObsReadingMessage` while `navState.isSelfTestActive`), and run the whole suite under each fix for
  vehicles.
- [ ] **Step 6: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/pages/left/SelfTestLeftPage.test.ts", "test/render/pages/right/SelfTestRightPage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research B tests in place on bootToSelfTest", "L9 characterization", "five beeps and no-beep sibling on recordSounds", "pins #NEW-B-1, #NEW-B-2 with siblings", "#NEW-B-3 pin drafted and proven, R5 sibling", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 3: the power cycle and the power inputs

**Goal:** The tests of research C, with the pin `#NEW-C-1`, and the right page after power-on (3-8) in the new
`PageManager.test.ts`.

**Files:**
- Modify: `test/render/pages/right/Dt4Page.test.ts`, `test/render/pages/right/Ctr1Page.test.ts`,
  `test/render/BrightnessManager.test.ts`, `test/render/SimVarSync.test.ts` (append; keep the existing tests except the
  two waits below)
- Create: `test/render/pages/PageManager.test.ts`
- Source drafts: `research/C/drafts/test/…` (and `drafts.diff`)

**Acceptance Criteria:**
- [ ] Every drafted test of research C is in its file: item 7 (D/T 4 with SET 4 POWER, 4-13), item 10 (Center
  waypoints purged at power-off, 5-26), item 11 (the right page after power-on for a VOR, an NDB, an intersection and
  a user waypoint, 3-8, each with a decoy that sorts first), item 16 (the brightness preset, public contract `LVars.ts`),
  item 19 (the warm-up spec on 3-3 and the maintenance manual, and the dark-time characterization), item 21 (the 3 s
  sibling and the `#NEW-C-1` pin).
- [ ] No render pin of #171 (the unit-stage pin holds it); the D/T 4 draft's comment may point to #171.
- [ ] **`#NEW-C-1` vehicles in this task's own file:** the existing contract tests of `SimVarSync.test.ts` that turn the
  circuit off and wait only 1 s ("powers the unit up and down with the SimVar of panel.xml", "the index LVar switches
  the circuit at runtime") assert that a loss under 1.5 s turns the unit off, which the maintenance manual contradicts.
  Lengthen their wait to 3 s (beyond the ride-through), so that they hold the contract either way; re-prove each by its
  original break. They must stay green under the pin's temporary fix.
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/pages/right/Dt4Page.test.ts test/render/pages/right/Ctr1Page.test.ts
test/render/BrightnessManager.test.ts test/render/SimVarSync.test.ts test/render/pages/PageManager.test.ts` → all pass
(the pin as an expected failure); `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**; the new `PageManager.test.ts` sits beside the unit file of the same name in
  `test/unit/pages/` (different stage, no clash).
- [ ] **Step 3: The two waits** in `SimVarSync.test.ts`.
- [ ] **Step 4: Prove** every test by its research break and one of your own; the pin by research C's temporary
  debounce in `SimVarSync.tick` (report a loss only after 1.5 s continuous), and run the whole suite under it for
  vehicles (the two contract tests must now stay green).
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/pages/right/Dt4Page.test.ts", "test/render/pages/right/Ctr1Page.test.ts", "test/render/BrightnessManager.test.ts", "test/render/SimVarSync.test.ts", "test/render/pages/PageManager.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research C drafts in place (items 7, 10, 11, 16, 19, 21)", "no render pin of #171", "#NEW-C-1 pin with the 3 s sibling, proven", "the two 1 s contract waits lengthened and re-proven", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 4: the ticks, the composition root and startup robustness

**Goal:** The tests of research D: `TickController` at the unit stage, the scan LVar, `isInteractive`, the boot with
the sample and the minimal panel.xml, the calculation order, and the core-level Dukes regression test.

**Files:**
- Create: `test/unit/TickController.test.ts`, `test/render/KLN90BCore.init.test.ts`
- Modify: `test/unit/Hardware.test.ts`, `test/unit/KLN90B.test.ts`, `test/render/KLN90BCore.startup.test.ts` (append)
- Source drafts: `research/D/drafts/test/…` (and `drafts.diff`)

**Acceptance Criteria:**
- [ ] Every drafted test of research D is in its file: section 1 (rates, blink, order, power gate, disable, the
  repeated enable, the three catches), section 2 (the initial scan LVar write), section 3 (the calculation order against
  `docs/architecture.md` Core 2), section 4 (the `PageProps` members and the ten-second run, both panel.xml documents),
  section 5 (`isInteractive`), section 6a (H events before `init`, `7b4465d`).
- [ ] The spec sources are `docs/architecture.md` (Core 1, Core 2), the `TickController` class comment for the rates,
  the public contract for the LVar and the panel.xml sample, the fix commit for 6a. No test cites the maintenance
  manual's pages 43, 186 or 189 (the design: a lead).
- [ ] The signal-rate test stays within 2 s and says why (the fake timers round 62.5 ms to 62 ms, `testing.md`
  section 6).
- [ ] The core-level Dukes test spies on `KLN90BCore.prototype.init` and restores the spy (`onTestFinished` registered
  before the boot).
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/unit/TickController.test.ts test/unit/Hardware.test.ts test/unit/KLN90B.test.ts
test/render/KLN90BCore.init.test.ts test/render/KLN90BCore.startup.test.ts` → all pass; `npm test` → no failures;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**; append the three edited files' new parts.
- [ ] **Step 3: Check the order list** of the calculation tickables in `docs/architecture.md` Core 2 against the draft's
  literal; a difference is reported, not fixed in the doc (task 6 owns the docs).
- [ ] **Step 4: Prove** every test by its research break (research D sections 1 to 6 list them) and one of your own.
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/unit/TickController.test.ts", "test/unit/Hardware.test.ts", "test/unit/KLN90B.test.ts", "test/render/KLN90BCore.init.test.ts", "test/render/KLN90BCore.startup.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research D drafts in place (sections 1 to 6a)", "spec sources architecture.md, class comment, contract, fix commit; no maintenance manual page", "signal-rate test within 2 s", "Dukes spy restored", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 5: the overlays and the input routing

**Goal:** The tests of research E, with the trainer's verdicts, the pins `#NEW-E-1` to `#NEW-E-4`, and without the
`PageManager.test.ts` draft (task 3's).

**Files:**
- Modify: `test/render/pages/MainPage.test.ts`, `test/render/pages/left/DirectToPage.test.ts`,
  `test/render/pages/left/Set0Page.test.ts`, `test/render/controls/PageContainer.test.ts` (append; keep the existing
  tests)
- Source drafts: `research/E/drafts/test/render/…` (not `pages/PageManager.test.ts`)

**Acceptance Criteria:**
- [ ] Every drafted test of research E is in its file except item 1.19 (the right page after power-on; task 3).
- [ ] `#NEW-E-1`: the drafted knob pins (left outer clockwise, left inner clockwise, right outer clockwise on the MSG
  page) cite the body of closed #56 and "checked in the KLN 89 trainer, 2026-10-09", T3; literals from the 90B page
  order (3-12, 3-13), as the drafts derived them. A new pin: CRSR on the MSG page closes it and turns the left cursor on
  beneath (T4); its sibling holds the MSG page up over NAV 2 (3-16). CLR on the MSG page gets no test (ignored on the
  trainer and in the code; log-only).
- [ ] `#NEW-E-2` (item 1.10) as drafted.
- [ ] `#NEW-E-3` (item 1.11): the two pins cite 3-27, 3-55 and "checked in the KLN 89 trainer, 2026-10-09", T1 and T2;
  the D→ pin also asserts that a following ENT does not leave the DIR page for the nearest airport.
- [ ] `#NEW-E-4` (new): SET 0, the cursor on UPDATE PUBLISHED DB, one click of the inner knob clockwise, then one
  counterclockwise: the pin asserts the page stays SET 0 with the cursor on the prompt ("checked in the KLN 89 trainer,
  2026-10-09", T5: the inner knob did nothing on a prompt; its comment says T5 saw one prompt, `Copy FPL 0?`). Its
  sibling: SET 0 with the cursor on the prompt shows the prompt flashing and `ent` (the drafted 2-4 test, item 1.14).
- [ ] The pushed right page's knob tests (item 1.4) and the two keyboard tests (item 1.21) stay characterizations.
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/pages/MainPage.test.ts test/render/pages/left/DirectToPage.test.ts
test/render/pages/left/Set0Page.test.ts test/render/controls/PageContainer.test.ts` → all pass (pins as expected
failures); `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**, without `PageManager.test.ts`.
- [ ] **Step 3: Citations** of the `#NEW-E-1` and `#NEW-E-3` pins (the trainer ids); draft the CRSR pin and the
  `#NEW-E-4` pin.
- [ ] **Step 4: Prove** every test by its research break and one of your own, every pin by its fix (`#NEW-E-1`: before
  the `switch` in `MainPage.onInteractionEvent`, a knob or CRSR on the MSG page pops it and re-dispatches; `#NEW-E-2`:
  remove the Super NAV 1 instance from the overlay stack instead of the top; `#NEW-E-3`: pop the MSG page at the start
  of the DCT and ALT cases; `#NEW-E-4`: with an overlay's cursor on, a knob the field refuses is swallowed instead of
  popping the overlay). The fix of `#NEW-E-3` also turns `#NEW-E-2` red (the design says so); run the whole suite under
  each fix for vehicles.
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/pages/MainPage.test.ts", "test/render/pages/left/DirectToPage.test.ts", "test/render/pages/left/Set0Page.test.ts", "test/render/controls/PageContainer.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research E drafts in place minus item 1.19", "#NEW-E-1 knob pins cite #56 and T3, CRSR pin on T4", "#NEW-E-2 pin", "#NEW-E-3 pins cite T1 T2, ENT not to the nearest airport", "#NEW-E-4 pin on T5 with the 2-4 sibling", "characterizations 1.4 and 1.21", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 6: issues and close-out

**Goal:** File the issues and comments of the design, replace the placeholders, update `testing.md` and write the
session log with rule 18, in the main checkout on the session branch.

**Files:**
- Modify: every test file with a `#NEW-` placeholder (`grep -rln "#NEW-" test/`)
- Modify: `docs/testing.md` (sections 6 and 7)
- Modify: `docs/test-coverage.md` (the Session 10 checkbox and the session log entry in section 4)

**Acceptance Criteria:**
- [ ] Each placeholder of the design's bug table that a task pinned is one GitHub issue with the `bug` label, filed after
  a search of the open and closed issues; each body states what is wrong, the reproduction (input, observed, expected),
  the file and line, the impact, the suggested fix, the evidence (pages paraphrased, "checked in the KLN 89 trainer,
  2026-10-09" with the id), that it was found in the headless harness and not reproduced in the sim, and the pin's test
  name. `#NEW-E-1` references closed #56 (not reopened); `#NEW-A-2` names #211 as related; `#NEW-B-2` names #177.
- [ ] Comments on #171, #199 and #192 as the design lists, each naming its new pins or tests. No issue is edited or
  closed; an edit the design does not list needs the maintainer's explicit OK.
- [ ] The placeholders are replaced in one commit; `grep -r "#NEW-" test/` finds nothing.
- [ ] `testing.md` section 6: the paragraph "A booted engine-running unit starts with the MSG annunciator lit" rewritten:
  the SYSTEM TIME UPDATED half is the bug `#NEW-A-2` (its number), the POSITION DIFFERS half stays a fact. Section 7: the
  design's leads (research D's four), the reports' harness extensions not built, the leads of the task reports, no
  counts in prose.
- [ ] The session log entry (section 4 of `test-coverage.md`), in the 9b format: done per task, rulings, trainer
  results (T1 to T12), bugs filed, fixes that could not be re-broken, the coverage at start and end, not covered (rule
  18), workflow notes; the checkbox ticked.
- [ ] `npm test` green, `npx tsc --noEmit` clean, before and after the commits.

**Verify:** `grep -r "#NEW-" test/` → no output; `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1:** Collect the pins and their placeholders from the merged branch (`grep -rn "#NEW-" test/`) and the task
  reports.
- [ ] **Step 2:** Search and file each issue (pace the searches); comment on the known issues.
- [ ] **Step 3:** Replace the placeholders in one commit (`references #NN, …` subject).
- [ ] **Step 4:** Run the coverage report (`npm run coverage`) for the end numbers.
- [ ] **Step 5:** Update `testing.md`, write the log, tick the checkbox, commit.

```json:metadata
{"files": ["docs/testing.md", "docs/test-coverage.md"], "verifyCommand": "grep -r \"#NEW-\" test/ ; npm test && npx tsc --noEmit", "acceptanceCriteria": ["issues filed per the bug table", "comments on #171 #199 #192", "placeholders replaced, grep empty", "testing.md sections 6 and 7", "session log and checkbox", "suite green, tsc clean"], "modelTier": "frontier"}
```
