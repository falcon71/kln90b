# Session 9b (controls): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A test file for every editor, select and display type under `kln90b/controls/`, plus the lists, the status
line, the MSG and error pages and the views, with spec tests where the Pilot's Guide (or the KLN 89 trainer) gives the
rule, labeled characterizations elsewhere, and pins for the bugs the research and the trainer found, each proven to bite;
plus the harness extensions the maintainer chose (task 0).

**Architecture:**
- **Task 0** (harness) runs alone first: `mount()`, a blink-cycle sampler, the `inverted-blink` mask rule, the
  seventh-row check, `SuperNav5.focused()` with the `legWorld()` and `arcWorld()` fixtures, the keyboard guard of
  `unit.panel.type`, the `#NEW-0-1` pin in `focused.test.ts`, and their `testing.md` notes.
- **Tasks 1 to 7** are parallel batches, one per research area (A to G). Each runs in its own git worktree, reset to the
  session branch after task 0 has merged, starts from the research drafts, and ends in one commit (plus one per fix
  round). They share no file.
- **Task 8** files the issues and comments, replaces the placeholders, updates `testing.md` and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the
headless harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-08-session-9b-controls-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task. The
  design's rulings, its bug table and its controller's defaults override anything in the research reports.
- **Branches.** The session branch is `tests-session-9b-controls`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`, which is stale:
    - Before anything else, run `git reset --hard tests-session-9b-controls` on the (still empty) worktree branch.
    - Check `git log -1`: it must show the session branch's head, which the controller names in the dispatch.
    - If `node_modules` is missing, create it as a junction to `E:\msfs\kln90b\node_modules` (PowerShell:
      `New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules`). Never delete it
      recursively and never run `npm install`.
- **No behavior changes** in `kln90b/` (rule 12). A task that finds it needs a seam stops and reports.
- **Evidence rule** (the maintainer's): the 90B Pilot's Guide and its figures win; the KLN 89 trainer decides where the
  90B guide is silent; a layout that exists only on the 89 (its two-digit blocks: the longitude 00 to 17, the radial 00
  to 35, the CAL 7 heading as one block, the CAL 3 minutes as one block) never becomes a pin.
- **Test names** carry the issue where there is one: `'… (#277)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23) with the numbers of the design's bug table. The research drafts use
  `#NEW-A-n` to `#NEW-G-n`: rename them as each task below says. A bug that several tasks pin keeps the one placeholder.
- **Labels** (`testing.md` section 5, rules 6 and 7):
    - A **spec test** cites the Pilot's Guide page in a comment and in its title, or "checked in the KLN 89 trainer,
      2026-10-08" (this session's round, `research/trainer.md`, T1 to T35), or "checked in the KLN 89 trainer,
      2026-10-07" (an observation recorded in an issue, such as #263's), or "a photo of a real unit" with the file name
      from the reference photo index.
    - A **characterization test** has `characterization` in its `describe` or `it` title and carries no page number, no
      trainer and no photo citation, neither in its title nor in its comments.
    - A **pin** asserts the manual (or the trainer, or the photo) and cites it. Its **passing sibling** is a test like
      any other: it cites the page its preconditions rest on, or it carries `characterization`.
    - A describe whose title says `characterization` holds only characterizations.
    - A pin whose citation supports only an extension of the guide's rule says so in its comment (the NDB frequency of
      `#NEW-0-1`).
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `kln89-guide-index.md`, `reference-photos-index.md`). Cite page numbers, never copy manual text.
    - Before the review, the implementer reports a **per-describe label audit**: every describe and `it` title, its
      label (spec, characterization, pin, sibling) and its page or source.
- **The trainer's verdicts** (`research/trainer.md`, its closing table) change the drafts:
    - a draft **characterization the trainer confirms** becomes a spec test citing the trainer (T3, T4, T5, T10, T19,
      T21 b and c, T22 a and c, T23's scroll, T26, T27);
    - a draft **characterization the trainer contradicts** becomes a pin with the design's placeholder (T1, T2, T6, T16,
      T21 a, T22 b, T25, T28, T32, T34, T35);
    - **T7 and T23's cursor position** are not pins: 4-3 (section 4.1.2, step 3) implies the 90B remembers the cursor
      field while the page is not left, so the code's remembered field is a spec test on 4-3 (task 3).
- **Snapshots never contain a row or a cell that shows a pinned bug** (rule 8). Known ones that controls show: #99 and
  #230 (degrees below 10, minutes near 60), #223 and `#NEW-4-1` (a duration of `:60`), #226 and `#NEW-4-2` (a distance
  that rounds up to its cutoff), #266 (a nearest distance below 10 NM), `#NEW-0-1` (the plain decimal point in an open DIS
  or NDB frequency mask), `#NEW-1-2` (the open longitude field), `#NEW-1-6` (exactly 0° of latitude or longitude),
  #263 and the `BearingDisplay` 360 (a bearing from 359.5).
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts` by hand. Never derive them from the
  code under test or the SDK's flavor of the same formula.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure (screen rows, masks, the repository, the stored setting), not substrings of a whole screen.
- **Flashing cells** read `F` on one display tick in four. Read them with task 0's `blinkCycle` (a booted unit) or
  `mountedCycle` (a mounted control), never with one read whose phase decides the result. A test that asserts text only
  may ignore the mask.
- **The keyboard guard.** After task 0, `unit.panel.type` refuses anything but `A` to `Z` and `0` to `9`, as the PC
  keyboard path does (`KLN90BCore.handleKeyboardEvent`). A draft that types a blank (`type('R', ' 95')`) enters that cell
  with the knobs instead. A test of the raw H event (`KLN90B_Internal_Key`) presses it with `unit.panel.press` and says
  in a comment that only an aircraft's H event can send that character.
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
  `vitest -t` takes a regular expression: escape `(`, `)`, `+`, `?` and `#` in a title used as a filter. The research
  runners (`research/tmp-C/mut.mjs`, `research/tmp-D/mut.mjs`, `research/tmp-F/mut.cjs`: a JSON list of literal
  replacements, restoring each file byte for byte) may be copied into the task's own scratch folder.
- **Commits (rule 22).**
    - One commit per task, plus one per fix round, never amended.
    - The message lists every test as `- <test>: Proof: fails when <break>`, and every pin as
      `- <pin>: Proof: turns red with <fix>`.
    - It ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
    - Write the message with a Bash heredoc or `-m`: PowerShell `Set-Content` writes a byte order mark.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, `docs/testing.md`, `CLAUDE.md`, the harness under
  `test/harness/`, GitHub issues, and other tasks' files. Task 0 is the exception for the harness and `testing.md`, task
  8 for the documents and the issues. A task that needs a change in a file it does not own reports it.
- **Copyright and data.** Never commit manual text, tables or figures, or navdata recorded from the sim or read from a
  navigation database. Facilities are invented. The KLN 89 trainer is cited as "the KLN 89 trainer"; its Chicago and
  Wisconsin waypoints never appear in tests. Short on-screen display strings (`INVALID ENT`, `NO SUCH WPT`) are fine.
- **Research and scratch.**
    - The session scratchpad is
      `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\dbf91e7f-2b6e-4dc4-a237-24999463a7a2\scratchpad\`.
    - The reports are `research\research-A.md` to `research-G.md` and `research\trainer.md`; the drafts are in
      `research\drafts-A\test\…` to `research\drafts-G\test\…`, laid out like `test\`. The research worktrees under
      `E:\msfs\kln90b\.claude\worktrees\agent-*` hold the same drafts; never edit them.
    - Section 2 of each research report is the per-test table: setup, expected literal, citation, the break that proves
      it, the draft test's name. It is this plan's per-item list; the tasks below name only what changes.
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
  reproduction, and the per-describe label audit. The reply to the controller is only the status, the head commit and
  the concerns.

**User decisions (already made):**
- Displays: one test file per display (source file), even where page tests already hold the format.
- A KLN 89 trainer round after the research, before the design (done: `research/trainer.md`).
- Harness: the larger task 0, plus the keyboard guard that changes the existing tests typing a blank.
- Evidence rule: the 90B guide and figures win; the 89 decides where the 90B guide is silent.
- The task split, the bug table (with F-3 as a question and the comments on #99, #102, #109, #226, #242, #263), the
  models and the workflow of the design: approved.

---

### Task 0: harness

**Goal:** The harness extensions of the design (items 1 to 8), each with a harness test and its paragraph in
`testing.md`, without changing what any existing test proves.

**Files:**
- Create: `test/harness/render/mount.ts` (item 1; from `research/drafts-G/test/harness/render/mount.ts`)
- Create: `test/harness/render/blink.ts` (item 2)
- Modify: `test/harness/render/screen.ts` (items 3 and 4)
- Modify: `test/harness/render/superNav5.ts` (item 5)
- Modify: `test/harness/fixtures.ts` (item 5)
- Modify: `test/harness/flight/FrontPanel.ts` (item 6)
- Modify: `test/render/pages/right/SupPage.test.ts` (item 6: the rows at about lines 199, 217 and 500 that type a blank)
- Modify: `test/render/pages/right/NdbPage.test.ts` (item 6: the #277 pin and its sibling at about lines 243 and 254)
- Modify: `test/render/harness/focused.test.ts` (item 7)
- Modify: `docs/testing.md` (sections 3, 4, 6 and 7; item 8)
- Test: `test/render/harness/mount.test.ts` (new), `test/render/harness/blink.test.ts` (new),
  `test/render/harness/screen.test.ts`, `test/render/harness/superNav5.test.ts`, `test/unit/harness/worlds.test.ts`,
  `test/render/harness/type.test.ts` (new, or the existing harness file that tests `type`)

**Acceptance Criteria:**
- [ ] `mount(new BearingDisplay(null)).text()` is `'---°'`, and `mount(el).tick(true)` calls the control's `tick(true)`.
- [ ] `blinkCycle(read)` advances four display ticks (250 ms each) and returns the four reads; `mountedCycle(m, read)`
  ticks a mounted control four times, the fourth with `blink = true`, and returns the four reads.
- [ ] `Screen` reads a cell whose element has `inverted-blink` without `inverted` (itself or inherited) as it reads the
  same cell without `inverted-blink`; a cell with both reads `F` as before.
- [ ] `Screen.read()` throws on a half page with a non-blank seventh row, naming the side and the row's text; blank rows
  past the sixth stay tolerated.
- [ ] `SuperNav5.focused()` returns the text of the inverted run(s) of the Super NAV 5 left column, without the `msg`
  prompt, with no-break spaces turned back into blanks.
- [ ] `legWorld()` returns fresh `KDDD`, `KAAA` (200 NM west on 270) and `KEEE` (30 NM east), plus `west(nm)`;
  `arcWorld()` returns fresh `abc`, `at(bearing, nm)`, the arc fixes, `fafaa`, `mapaa` and `kprc` with the arc approach.
  Both have a unit test of their geometry against `geo.ts`.
- [ ] `unit.panel.type('R', ' ')` throws with a message naming `KLN90BCore.handleKeyboardEvent`; letters and digits pass.
- [ ] The SUP rows and the #277 pin and sibling enter their blank cells with the knobs; the #277 pin is re-proven by its
  fix (the `NdbFreqEditor.convertToValue` concatenation of research B) and its sibling stays green.
- [ ] `focused.test.ts:43`'s mask assertion is an `it.fails('… (5-19, figure 5-74, #NEW-0-1)')` with a passing sibling
  that keeps the text assertion.
- [ ] `testing.md` documents each item; the decimal point paragraph of section 6 says the plain point is `#NEW-0-1`.
- [ ] `npm test` green, `npx tsc --noEmit` clean, the counts in the report.

**Verify:** `npx vitest run test/render/harness test/unit/harness` → all pass; `npm test` → no failures;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree.** Reset to the session branch as the Global Constraints say; `npm test` must be green
  (2122 passed, 279 expected failures, 241 files, plus the design commit).

- [ ] **Step 2: `mount()`.** Copy `research/drafts-G/test/harness/render/mount.ts` to `test/harness/render/mount.ts`:

```ts
import {FSComponent} from '@microsoft/msfs-sdk';
import {UiElement} from '../../../kln90b/pages/Page';
import {readRows} from './screen';

/** A control rendered on its own, outside a booted unit */
export interface Mounted {
    /** The cells as the font renders them, rows joined with a newline (d-none subtrees left out, as on the screen) */
    text(): string;

    /** The attributes of those cells: `.` normal, `I` inverted, `B` blinking, `F` flashing inverse */
    mask(): string;

    /** One display tick of the control; `blink` is the tick on which flashing elements blink (every 4th) */
    tick(blink?: boolean): void;
}

/**
 * Renders a display or control into a detached element, the way a page renders its children, so that a test can read
 * the control's own format without booting a unit. There is no tick loop: a control whose text changes only on a
 * display tick is ticked by the test with `tick()` (testing.md section 4).
 */
export function mount(el: UiElement): Mounted {
    const host = document.createElement('div');
    FSComponent.render(el.render()!, host);
    const rows = () => readRows(host);
    return {
        text: () => rows().map(r => r.map(c => c.ch).join('')).join('\n'),
        mask: () => rows().map(r => r.map(c => c.attr).join('')).join('\n'),
        tick: (blink = false) => el.tick(blink),
    };
}
```

  `readRows` must be exported from `screen.ts` (it is, for `superNav5.ts`). Harness test `mount.test.ts`: a
  `BearingDisplay(null)` reads `---°`; a `TextDisplay` whose value is set after the render shows the new text only
  after `tick()` (prove: drop the `tick` call and see the old text).

- [ ] **Step 3: the blink-cycle sampler** in `test/harness/render/blink.ts`:

```ts
import {vi} from 'vitest';
import {Mounted} from './mount';

/** One display tick of a booted unit (TickController: 4 Hz) */
const DISPLAY_TICK_MS = 250;

/**
 * Reads the screen on four consecutive display ticks of a booted unit, one blink cycle (the display blinks on every
 * fourth tick), so a flashing cell is seen in both phases whatever the phase at the start.
 */
export async function blinkCycle<T>(read: () => T): Promise<T[]> {
    const reads: T[] = [];
    for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(DISPLAY_TICK_MS);
        reads.push(read());
    }
    return reads;
}

/** The same for a mounted control: four ticks, the fourth the blink tick */
export function mountedCycle<T>(m: Mounted, read: () => T): T[] {
    const reads: T[] = [];
    for (let i = 0; i < 4; i++) {
        m.tick(i === 3);
        reads.push(read());
    }
    return reads;
}
```

  Check the display tick interval in `kln90b/TickController.ts` and use its value. Harness test `blink.test.ts`: on a
  booted unit with the left cursor on an editor (SET 1, one inner click), `blinkCycle(() => Screen.read().maskRows('L'))`
  holds one read with `F` in the flashing cell and three without; a mounted `Blink`-wrapped text shows one hidden phase
  in four (prove both by changing the cycle length to 3).

- [ ] **Step 4: the mask rule** in `screen.ts`. `attrOf` returns `F` for `inverted-blink` only when the element is (or
  inherits) inverted; otherwise `inverted-blink` changes nothing. Read `KLN90B.scss` first (`.inverted`,
  `.inverted-blink`, `.blink`, their order) and write the rule the CSS gives; the research (F, section 5) found that
  `.inverted-blink` without `.inverted` renders normal text, and that `.blink` set later wins the color. Sketch:

```ts
function attrOf(el: Element, inherited: CellAttr): CellAttr {
    const inverted = el.classList.contains('inverted') || inherited === 'I' || inherited === 'F';
    if (el.classList.contains('inverted-blink') && inverted) return 'F';
    if (el.classList.contains('blink')) return 'B';
    if (el.classList.contains('inverted')) return 'I';
    return inherited;
}
```

  Harness test in `screen.test.ts`: a `<span class="inverted-blink">` alone reads `.`, with `inverted` reads `F`. Then
  run the whole suite: a test that changes is a test that read the stale class (the 9a lead on `ent`); report each one
  and keep its assertion only if the new reading is what the screen shows.

- [ ] **Step 5: the seventh row** in `Screen.read()`: after `readHalf(left)` and `readHalf(right)`, throw when a half has
  a row past index 5 with a visible character or a non-normal cell:

```ts
const overflow = (rows: Cell[][], side: string) => {
    const extra = rows.slice(ROWS).find(r => r.some(c => c.ch !== ' ' || c.attr !== '.'));
    if (extra) throw new Error(`Screen: the ${side} half has a row past the sixth: "${extra.map(c => c.ch).join('')}"`);
};
```

  Harness test: a half page with seven rows of text throws; one with a blank seventh row reads. The whole suite stays
  green (the research's experiment found no test that hits it).

- [ ] **Step 6: Super NAV 5** in `superNav5.ts` and `fixtures.ts`:

```ts
/** The focused field(s) of the Super NAV 5 left column: the inverted runs, without the msg prompt */
focused(container: Element | null = document.getElementById('pageContainer')): string[] {
    if (container === null) throw new Error('SuperNav5.focused: no #pageContainer; has the unit booted?');
    return [...container.querySelectorAll('.super-nav5-left-controls .inverted')]
        .filter(e => e.closest('.d-none') === null && e.closest('.super-nav5-mgs-range') === null)
        .map(e => e.textContent!.replace(/\u00a0/g, ' '));
},
```

  `legWorld()` and `arcWorld()` in `fixtures.ts`, built from `research/drafts-D/test/render/controls/selects/
  superNav5World.ts` and `arcWorld.ts` as pure worlds (fresh objects on every call, no boot): the doc comment states
  the geometry as the Nav3Page comment does. The boot sequences (`superNav5OnLeg`, `superNav5OnArc`) stay in task 4's
  test files. The existing copies in `Nav3Page.test.ts`, `Nav4Page.test.ts`, `SuperNav5DirectToSelector.test.ts` and
  others stay as they are (a log line in `testing.md` section 7). Harness tests: `superNav5.test.ts` reads the focused
  field after the left cursor is turned on; `worlds.test.ts` checks `KAAA` 200 NM from `KDDD` on 270 and `abc` to the
  arc fixes at 10 NM with `geo.ts`.

- [ ] **Step 7: the keyboard guard** in `FrontPanel.type`:

```ts
public async type(side: Side, text: string): Promise<void> {
    for (const ch of text) {
        // KLN90BCore.handleKeyboardEvent passes only A to Z and 0 to 9 to the editors: a pilot cannot type anything else
        if (!/^[A-Z0-9]$/.test(ch)) {
            throw new Error(`type: '${ch}' cannot be typed on the PC keyboard (KLN90BCore.handleKeyboardEvent); `
                + 'turn the knobs, or press the H event itself');
        }
        await this.press(`KLN90B_Internal_Key:${side === 'L' ? 'LEFT' : 'RIGHT'}:${ch}`);
    }
}
```

  Read `KLN90BCore.handleKeyboardEvent` first and allow exactly what it passes (the numpad digits are digits). Then fix
  the tests that type a blank: the SUP rows (`'E 103000'`, `'E 103600'`) enter the longitude's blank hundreds cell with
  the knobs (cursor on the cell, inner knob until the blank shows) and type the rest; the #277 pin and its sibling in
  `NdbPage.test.ts` (`' 3280'`) enter the blank thousands cell the same way. Re-prove each changed test by its original
  break (the pin by the #277 fix of research B, section 3) and record the proofs. Run the whole suite to find any other
  caller (a typed `-`, `.` or blank throws now).

- [ ] **Step 8: `focused.test.ts:43`.** The mask line `'....III.I..'` asserts the plain decimal point of the DIS field
  (`#NEW-0-1`, figure 5-74 shows one inverse block with the point inside). Move the mask assertion into
  `it.fails('… covers the decimal point of the DIS field (5-19, figure 5-74, #NEW-0-1)')` asserting the mask with the
  point inverted (`'....IIIII..'`, through `blinkCycle` if the cell flashes), and keep the text assertion in the existing
  test. Prove the pin with research B's temporary fix (`research/tmp-B/DistanceEditor.fixpoint.tsx`: the point in its
  own span, inverted like `RadialEditor`'s).

- [ ] **Step 9: `testing.md`.**
    - Section 3 (Reading the screen): the `inverted-blink` rule; the seventh-row check.
    - Section 4: `mount()` and the exception that a mounted control is ticked by hand (the rule "do not call tick()"
      stays for booted units); `blinkCycle` and `mountedCycle`; `SuperNav5.focused()`; `legWorld()` and `arcWorld()`;
      `type()` refuses what the keyboard cannot send, and a cell that needs a blank is entered with the knobs.
    - Section 6: the decimal point paragraph rewritten: the plain point of `DistanceEditor` and `NdbFreqEditor` is a bug
      (`#NEW-0-1`, figure 5-74), `focused()` still joins two runs across one plain point until it is fixed.
    - Section 7: remove the Session 8 lead about Super NAV 5's local focus helpers (now `SuperNav5.focused()`); add the
      leg world copies that remain; the research leads the design lists under "Log only" are task 8's.

- [ ] **Step 10: Commit** with one `Proof:` line per item, then write `.task-report.md`.

```json:metadata
{"files": ["test/harness/render/mount.ts", "test/harness/render/blink.ts", "test/harness/render/screen.ts", "test/harness/render/superNav5.ts", "test/harness/fixtures.ts", "test/harness/flight/FrontPanel.ts", "test/render/pages/right/SupPage.test.ts", "test/render/pages/right/NdbPage.test.ts", "test/render/harness/focused.test.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["mount() renders and ticks a control", "blinkCycle and mountedCycle sample four ticks", "inverted-blink without inverted reads normal", "a non-blank seventh half row throws", "SuperNav5.focused() and legWorld()/arcWorld() with tests", "type() refuses non A-Z0-9 and the blank-typing tests use the knobs, #277 re-proven", "focused.test.ts mask line is the #NEW-0-1 pin", "testing.md updated", "npm test green, tsc clean"], "modelTier": "standard"}
```

### Task 1: the editor base and the position, variation, date, time, free-text and surface editors

**Goal:** The tests of research A, plus the base-class characterizations of research B, turned by the trainer's
verdicts into spec tests and pins, in the editor files below.

**Files:**
- Create: `test/render/controls/editors/Editor.test.ts`, `TimeEditor.test.ts`, `MagvarEditor.test.ts`,
  `FreetextEditor.test.ts`, `RunwaySurfaceEditor.test.ts`
- Modify: `test/render/controls/editors/LatLonEditor.test.ts`, `DateEditor.test.ts` (append; keep the existing tests)
- Modify: `test/render/services/KeyboardService.test.ts` (the #109 pin's literal, below)
- Source drafts: `research/drafts-A/test/render/controls/editors/*`; from `research/drafts-B/…/DistanceEditor.test.ts`
  only its base-class tests (CLR, the cursor turned off, the digit wrap, the outer wrap, the keyboard auto-advance;
  research B section 2, DistanceEditor)

**Acceptance Criteria:**
- [ ] Every test of research A section 2 is in its file, renamed: `#NEW-A-1` → `#NEW-1-1`, `#NEW-A-2` → `#NEW-1-2`,
  `#NEW-A-3` → `#NEW-1-3`; the #99 editor pin carries `#99`.
- [ ] `#NEW-1-1`: the sibling is N 89°59.99' accepted (not N 90°00'); a second pin asserts that the latitude tens offers
  no `9` (the trainer, T9); E 180°30' refused is a pin; E 180°00' has no test.
- [ ] `#NEW-1-2` is asserted on the open field (`E008°`, the trainer T8) and, as a spec test, the entered value keeps
  its blank hundreds (3-18, figure 3-57).
- [ ] `#NEW-1-3`: the remark charset has `-` between `9` and the blank (the trainer T12, 3-47, figure 3-144); the
  Turn-On page charset test (5-28) stays green.
- [ ] `Editor.test.ts` holds the base rules: the outer knob at the last and the first cell of an open edit stops
  (`#NEW-1-4`, two pins, the trainer T1); CLR during an open edit brings the old value back with the cursor on the field
  (`#NEW-1-5`, the trainer T2); CRSR during an edit restores the old value (spec, the trainer T3); every cell wraps (spec,
  the trainer T4); ENT on a partly filled field counts the dashed cells as 0 (spec, the trainer T5); the keyboard
  auto-advance wrap (characterization).
- [ ] `#NEW-1-6`: the latitude and longitude editors show a value of exactly 0 as `N` and `E` (pins, the trainer T35),
  each with a sibling at a small nonzero value.
- [ ] The #109 pin in `KeyboardService.test.ts` asserts the longitude after ENT (`E  8°30.00'`, blank-padded as 3-18
  figure 3-57 shows), not in the open field; it is re-proven by a fix that lets the keyboard enter the hundreds.
- [ ] The magnetic variation display form stays a characterization (figures 5-64 and 5-136 differ; the trainer T13 is
  only a note); the time editor's seconds (T17) get no pin.
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/controls/editors test/render/services/KeyboardService.test.ts` → all pass (the
pins as expected failures); `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say; check the head is the session branch after task 0's merge.
- [ ] **Step 2: Copy the drafts** of research A into `test/render/controls/editors/` (new files) or append their new
  describes (existing files), and move research B's base-class tests from its `DistanceEditor.test.ts` draft into
  `Editor.test.ts` (they stay on the DIS field if that shows them best; the host page is free).
- [ ] **Step 3: Apply the trainer's verdicts** to every draft characterization of the base rules (the bullets of the
  Acceptance Criteria): T1 and T2 become pins, T3, T4 and T5 spec tests citing "checked in the KLN 89 trainer,
  2026-10-08". Expected values for the pins: the cursor stays on the last (first) cell after one more outer click, with
  the edit still open; after CLR the field shows the value before the edit and is no longer being edited.
- [ ] **Step 4: Move flashing-cell reads onto `blinkCycle`** (`flashingColumns()` of the draft `Editor.test.ts` is
  replaced by it).
- [ ] **Step 5: The `#NEW-1-6` pins:** the host is SET 1 or a user waypoint's position entry; set the value to exactly
  0 (enter `N 00°00.00'` with the knobs), ENT, and assert the hemisphere letter of the shown value.
- [ ] **Step 6: The #109 literal** in `KeyboardService.test.ts`.
- [ ] **Step 7: Prove** every test by its research break and one of your own, every pin by its fix (`#NEW-1-4`: clamp
  the cursor index in `Editor.outerRight`/`outerLeft`; `#NEW-1-5`: restore the editor's value on CLR; `#NEW-1-6`:
  `>= 0` for the hemisphere).
- [ ] **Step 8: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/controls/editors/Editor.test.ts", "test/render/controls/editors/LatLonEditor.test.ts", "test/render/controls/editors/DateEditor.test.ts", "test/render/controls/editors/TimeEditor.test.ts", "test/render/controls/editors/MagvarEditor.test.ts", "test/render/controls/editors/FreetextEditor.test.ts", "test/render/controls/editors/RunwaySurfaceEditor.test.ts", "test/render/services/KeyboardService.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research A tests in place, placeholders renamed", "#NEW-1-1 sibling N 89 59.99 and the tens pin", "#NEW-1-2 open field pin and entered value spec", "#NEW-1-3 hyphen pin", "base rules in Editor.test.ts: #NEW-1-4, #NEW-1-5 pins; T3, T4, T5 specs", "#NEW-1-6 editor pins", "#109 literal after ENT", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 2: the numeric and frequency editors

**Goal:** The tests of research B in one file per editor, with the SET 1 heading pins in `Set1Page.test.ts`.

**Files:**
- Create: `test/render/controls/editors/BearingEditor.test.ts`, `DistanceEditor.test.ts`, `ElevationEditor.test.ts`
  (with `RunwayLengthEditor`), `SpeedEditor.test.ts`, `RadialEditor.test.ts`, `VorFreqEditor.test.ts`,
  `NdbFreqEditor.test.ts`
- Modify: `test/render/pages/left/Set1Page.test.ts` (append the describe 'SET 1 heading with a magnetic variation')
- Source drafts: `research/drafts-B/test/…`

**Acceptance Criteria:**
- [ ] Every test of research B section 2 is in its file except the base-class tests of `DistanceEditor` (CLR, the cursor
  turned off, the digit wrap, the outer wrap, the keyboard auto-advance), which task 1 holds; `DistanceEditor.test.ts`
  keeps the DIS rules.
- [ ] Placeholders renamed: `#NEW-B-1` → `#NEW-0-1` (the DIS pin cites 5-19, figure 5-74; the NDB pin says in its
  comment that it extends figures 5-72 to 5-74, no figure shows the NDB cursor), `#NEW-B-2` → `#NEW-2-1` (3-19, and
  "checked in the KLN 89 trainer, 2026-10-08": the confirmed heading comes back unchanged).
- [ ] Control-level pins: #277 (the stored NDB frequency in the repository), #282 (DIS after ENT), #288 (two: the
  hundreds cell, the refusal), #245 (5 KT after ENT), #109 (the speed and NDB fields refuse a typed `0`).
- [ ] The radial 360.0 refusal is a spec test ("checked in the KLN 89 trainer, 2026-10-08": no radial above 359.9 can be
  entered).
- [ ] No draft types a blank (the keyboard guard): those cells are entered with the knobs.
- [ ] Flashing-cell reads use `blinkCycle`; the VOR band tests stay characterizations.
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/controls/editors test/render/pages/left/Set1Page.test.ts` → all pass (pins as
expected failures); `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**; leave out the base-class tests of the DIS draft (task 1 has them).
- [ ] **Step 3: Rename the placeholders** and apply the trainer verdicts (T10 the radial spec; T11 confirms the
  `#NEW-2-1` pins; T4 confirms the digit wrap: the characterizations of the digit wrap that stay in your files become
  spec tests citing the trainer).
- [ ] **Step 4: Replace typed blanks** (`type(' 95')` and the like) by knob entry; keep the #109 pins, which type `0`.
- [ ] **Step 5: Prove** every test by its research break and one of your own, every pin by its fix (research B
  section 3: the `#NEW-0-1` fix files `tmp-B/DistanceEditor.fixpoint.tsx` and `NdbFreqEditor.fixpoint.tsx`;
  `#NEW-2-1`: `gps.trackTrue = this.props.magvar.magToTrue(this.track)`).
- [ ] **Step 6: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/controls/editors/BearingEditor.test.ts", "test/render/controls/editors/DistanceEditor.test.ts", "test/render/controls/editors/ElevationEditor.test.ts", "test/render/controls/editors/SpeedEditor.test.ts", "test/render/controls/editors/RadialEditor.test.ts", "test/render/controls/editors/VorFreqEditor.test.ts", "test/render/controls/editors/NdbFreqEditor.test.ts", "test/render/pages/left/Set1Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research B tests in place minus the base-class tests", "#NEW-0-1 and #NEW-2-1 pins renamed and cited", "control pins #277 #282 #288x2 #245 #109", "radial 360.0 spec on the trainer", "no typed blanks", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 3: the waypoint editor and the selectors

**Goal:** The tests of research C: `WaypointEditor.test.ts` appended, one file per selector type, `NearestSelector`
and `CreateWaypointMessage`.

**Files:**
- Modify: `test/render/controls/editors/WaypointEditor.test.ts` (append; keep the existing test)
- Create: `test/render/controls/selects/WaypointSelector.test.ts`, `AirportSelector.test.ts`, `VorSelector.test.ts`,
  `NdbSelector.test.ts`, `IntersectionSelector.test.ts`, `SupplementarySelector.test.ts`, `NearestSelector.test.ts`,
  `CreateWaypointMessage.test.ts`
- Source drafts: `research/drafts-C/test/render/controls/…`

**Acceptance Criteria:**
- [ ] Every test of research C section 2 is in its file; `#NEW-C-1` → `#NEW-3-1`.
- [ ] `#NEW-3-1` (E8) asserts the trainer's result (T18): after CLR the waypoint page is gone, the position is blank with
  the cursor on it, and the following ENT leaves the plan unchanged (4-2, "checked in the KLN 89 trainer, 2026-10-08").
- [ ] E11 (the editor's first inner click) is the pin `#NEW-3-2`: the first click shows `A` in the first cell and the
  autocompletion of the first ident starting with `A` (the trainer T6); its sibling holds the cursor on the editor.
- [ ] E12 (the outer knob past the fifth character) is a pin of `#NEW-1-4` (the trainer T1).
- [ ] The cursor position after CRSR off and on is a spec test on a numbered flight plan page citing 4-3 (section 4.1.2,
  step 3: the cursor is where the pilot left it while the page was not left).
- [ ] The Direct To cancel after CLR during the confirmation, then ENT, is a spec test (the trainer T19).
- [ ] Control-level pins: #290 (two), #276, #262.
- [ ] The draft that read the DOM rows to see the creation block uses `Screen.read()` where task 0's seventh-row check
  now makes that safe, or says why not.
- [ ] `NearestSelector.test.ts` gives its long test a per-test timeout (testing.md section 6).
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/controls/editors/WaypointEditor.test.ts test/render/controls/selects` → all
pass (pins as expected failures); `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**; the eight selector files are new, `WaypointEditor.test.ts` gets the appended part.
- [ ] **Step 3: Rename and apply the trainer verdicts** (E8, E11, E12, the 4-3 spec, T19).
- [ ] **Step 4: Prove** every test by its research break and one of your own, every pin by its fix (`#NEW-3-1`: the
  fix of research C section 3; `#NEW-3-2`: make the first click step to the first charset entry after the blank;
  `#NEW-1-4`: clamp the index in `Editor.outerRight`).
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/controls/editors/WaypointEditor.test.ts", "test/render/controls/selects/WaypointSelector.test.ts", "test/render/controls/selects/AirportSelector.test.ts", "test/render/controls/selects/VorSelector.test.ts", "test/render/controls/selects/NdbSelector.test.ts", "test/render/controls/selects/IntersectionSelector.test.ts", "test/render/controls/selects/SupplementarySelector.test.ts", "test/render/controls/selects/NearestSelector.test.ts", "test/render/controls/selects/CreateWaypointMessage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research C tests in place, #NEW-3-1 renamed", "E8 asserts the trainer result", "#NEW-3-2 first click pin", "E12 pin #NEW-1-4", "4-3 cursor spec", "T19 spec", "#290x2 #276 #262 pins", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 4: the fieldsets and the Super NAV 5 selectors

**Goal:** The tests of research D on task 0's Super NAV 5 helpers and fixtures.

**Files:**
- Create: `test/render/controls/selects/SelectField.test.ts`, `BaroFieldset.test.ts`, `BearingFieldset.test.ts`,
  `FpmFieldset.test.ts`, `FuelFieldset.test.ts`, `SpeedFieldset.test.ts`, `TempFieldset.test.ts`,
  `TimeFieldset.test.ts`, `VnavFieldsets.test.ts`, `VolumeFieldset.test.ts`, `MapOrientationSelector.test.ts`,
  `ObsDtkElement.test.ts`, `SuperNav5Field2Selector.test.ts`, `SuperNav5Field3Selector.test.ts`,
  `SuperNav5RangeSelector.test.ts`
- Modify: `test/render/controls/selects/AltitudeFieldset.test.ts`, `SuperNav5Field1Selector.test.ts`,
  `SuperNav5DirectToSelector.test.ts` (append; keep the existing tests)
- Modify: `test/render/pages/left/Set9Page.test.ts` (the citation of its wrap row only)
- Leave: `test/unit/controls/selects/BaroFieldset.test.ts` (#113) as it is
- Source drafts: `research/drafts-D/test/render/controls/selects/*` (not its helper modules)

**Acceptance Criteria:**
- [ ] Every test of research D section 2 is in its file; the draft helper modules are gone: the files use
  `SuperNav5.focused()`, `legWorld()` and `arcWorld()` (task 0) and keep their short boot sequences locally.
- [ ] Placeholders: `#NEW-D-1` → `#NEW-4-1`, `#NEW-D-2` → `#NEW-4-2` (two pins), `#NEW-D-3` → `#NEW-4-3`.
- [ ] `#NEW-4-4`: before pinning, check the 90B figures for a millibar value below 1000 (ALT page, CAL 1, 3-18 area;
  the index). No 90B figure with a zero: a pin asserting ` 993` ("checked in the KLN 89 trainer, 2026-10-08", T16) with
  a sibling at 1013. A 90B figure with the zero: a spec test on that figure, no pin, and the report says so.
- [ ] Control-level pins #255 and #256 assert the committed setting.
- [ ] The digit wrap of every fieldset and "a calculator value changes without ENT" are spec tests citing the trainer
  (T4); the CAL 6 hour wrap cites the trainer (T15, T4); which cells the CAL 6 cursor visits is a characterization (the
  89's minutes are one block); the OBS wrap across north cites the trainer observation recorded in #263 (2026-10-07).
- [ ] `Set9Page.test.ts`: its wrap row's comment adds "checked in the KLN 89 trainer, 2026-10-08" next to 3-57 (3-57
  does not speak of the wrap); nothing else in the file changes.
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/controls/selects test/render/pages/left/Set9Page.test.ts` → all pass (pins as
expected failures); `npm test` → no failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**, replacing `superNav5World.ts` and `arcWorld.ts` by the fixtures and the local boot
  sequences, and `focusedLeft()` by `SuperNav5.focused()`.
- [ ] **Step 3: Rename, add `#NEW-4-4`, apply the trainer verdicts and the citations** of the Acceptance Criteria.
- [ ] **Step 4: Prove** every test by its research break and one of your own, every pin by its fix (research D
  section 3; `#NEW-4-4`: format the millibars with a blank instead of the zero).
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/controls/selects/SelectField.test.ts", "test/render/controls/selects/AltitudeFieldset.test.ts", "test/render/controls/selects/BaroFieldset.test.ts", "test/render/controls/selects/BearingFieldset.test.ts", "test/render/controls/selects/FpmFieldset.test.ts", "test/render/controls/selects/FuelFieldset.test.ts", "test/render/controls/selects/SpeedFieldset.test.ts", "test/render/controls/selects/TempFieldset.test.ts", "test/render/controls/selects/TimeFieldset.test.ts", "test/render/controls/selects/VnavFieldsets.test.ts", "test/render/controls/selects/VolumeFieldset.test.ts", "test/render/controls/selects/MapOrientationSelector.test.ts", "test/render/controls/selects/ObsDtkElement.test.ts", "test/render/controls/selects/SuperNav5Field1Selector.test.ts", "test/render/controls/selects/SuperNav5Field2Selector.test.ts", "test/render/controls/selects/SuperNav5Field3Selector.test.ts", "test/render/controls/selects/SuperNav5RangeSelector.test.ts", "test/render/controls/selects/SuperNav5DirectToSelector.test.ts", "test/render/pages/left/Set9Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research D tests in place on the task 0 helpers", "#NEW-4-1..3 renamed, #NEW-4-4 per the 90B figure check", "#255 #256 committed-setting pins", "trainer wrap specs and citations", "Set9Page citation only", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 5: the lists, `Button` and `PageContainer`

**Goal:** The tests of research E, turned by the trainer's verdicts into spec tests and pins.

**Files:**
- Create: `test/render/controls/List.test.ts`, `FlightplanList.test.ts`, `WaypointDeleteListItem.test.ts`,
  `Button.test.ts`
- Modify: `test/render/controls/PageContainer.test.ts` (append; keep the #75 test)
- Source drafts: `research/drafts-E/test/render/controls/*`

**Acceptance Criteria:**
- [ ] Every test of research E section 2 is in its file; `#NEW-E-1` → `#NEW-5-1` (5-20, 3-14).
- [ ] F14 (FPL) and W5 (the OTH user waypoint list): the outer knob on a Del question drops the question and moves the
  cursor: pins `#NEW-5-2` ("checked in the KLN 89 trainer, 2026-10-08", T21 a, T22 b).
- [ ] L7 (the OTH 4 Del text): the `?` in a fixed column, pin `#NEW-5-3` (the trainer T25); the fixed column is the one
  the FPL and OTH 3 Del texts use.
- [ ] F7 (an insertion while FPL 0 is scrolled): the page stays, pin `#NEW-5-4` (the trainer T28).
- [ ] F11 is the #242 pin (a deletion on a numbered plan leaves the cursor on the waypoint that moved up; the trainer
  T21 c agrees).
- [ ] Spec tests citing the trainer: the inner knob on an FPL Del question opens an entry in front of the waypoint (T21
  b); CLR again drops the question on the user list (T22 a) and the inner knob is ignored there (T22 c); the list stays
  scrolled when the cursor is turned off (T23, L3); CLR twice on the approach header keeps the approach (T26, F13); the
  inner knob on the header opens an en route entry before the approach (T27, F12).
- [ ] B1 (the flashing button) may use the self-test page's APPROVE? and asserts the button only.
- [ ] Blink sampling uses `blinkCycle`; no test cites #40 (the design: its commits are scan code; the list fixes are
  `9a17b5b` and #26).
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/controls/List.test.ts test/render/controls/FlightplanList.test.ts
test/render/controls/WaypointDeleteListItem.test.ts test/render/controls/Button.test.ts
test/render/controls/PageContainer.test.ts` → all pass (pins as expected failures); `npm test` → no failures;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**; append the new part of `PageContainer.test.ts`.
- [ ] **Step 3: Rename and apply the trainer verdicts** of the Acceptance Criteria.
- [ ] **Step 4: Prove** every test by its research break and one of your own, every pin by its fix (`#NEW-5-1`: the
  `enter()` override of research E section 3; `#NEW-5-2`: let the outer knob clear the question and move; `#NEW-5-3`:
  pad the ident to the fixed column; `#NEW-5-4`: keep the scroll offset on insertion; #242: `refreshButtons` returns 2).
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/controls/List.test.ts", "test/render/controls/FlightplanList.test.ts", "test/render/controls/WaypointDeleteListItem.test.ts", "test/render/controls/Button.test.ts", "test/render/controls/PageContainer.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research E tests in place, #NEW-5-1 renamed", "#NEW-5-2 pins F14 and W5", "#NEW-5-3 pin L7", "#NEW-5-4 pin F7", "#242 pin F11", "trainer specs T21b T22a T22c T23 T26 T27", "no #40 citation", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 6: the status line, the MSG and error pages, the views, Super NAV 5 left and right

**Goal:** The tests of research F, with the trainer's verdicts and the design's rulings on F-3 and `#NEW-6-3`.

**Files:**
- Modify: `test/render/controls/StatusLine.test.ts`, `ErrorPage.test.ts` (append; keep the existing tests)
- Create: `test/render/controls/MessagePage.test.ts`, `Blink.test.ts`, `Inverted.test.ts`,
  `AirportCoordOrNearestView.test.ts`, `SuperNav5Left.test.ts`, `SuperNav5Right.test.ts`
- Source drafts: `research/drafts-F/test/render/controls/*`

**Acceptance Criteria:**
- [ ] Every test of research F section 2 is in its file; `#NEW-F-1` → `#NEW-6-1`, `#NEW-F-2` → `#NEW-6-2`.
- [ ] `#NEW-F-3` has no pin (the design: a `question` issue); its draft pin is removed, and a sibling that only served it
  goes too (the report says which).
- [ ] The #191 pin cites 3-16 and "checked in the KLN 89 trainer, 2026-10-08" (T29).
- [ ] `#NEW-6-3`: search the 90B guide (3-16, 3-23, the message appendix through the index) for what the MSG page shows
  without messages. A 90B text found: a pin asserting it, with a sibling. None: no test, and the report says where you
  looked.
- [ ] The #102 pins (two) stay in `AirportCoordOrNearestView.test.ts`.
- [ ] The prompt sampling helpers of the drafts (`promptOverTwoSeconds`, `mapPromptOverTwoSeconds`) use `blinkCycle`
  (twice for two seconds), and the `ent` mask tests read through task 0's mask rule (no need to read the messages first
  where that was only a workaround; say which).
- [ ] `ErrorPage` path tests with injected throws are characterizations.
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/controls/StatusLine.test.ts test/render/controls/ErrorPage.test.ts
test/render/controls/MessagePage.test.ts test/render/controls/Blink.test.ts test/render/controls/Inverted.test.ts
test/render/controls/AirportCoordOrNearestView.test.ts test/render/controls/SuperNav5Left.test.ts
test/render/controls/SuperNav5Right.test.ts` → all pass (pins as expected failures); `npm test` → no failures;
`npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**; append to the two existing files.
- [ ] **Step 3: Rename, drop the F-3 pin, search for `#NEW-6-3`'s 90B text,** move the sampling onto `blinkCycle`.
- [ ] **Step 4: Prove** every test by its research break and one of your own, every pin by its fix (research F
  section 3: `#NEW-6-1` `classList.remove("blink")` in the msg branch; `#NEW-6-2` the colon; #191 marking a message
  seen when its page shows).
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/controls/StatusLine.test.ts", "test/render/controls/ErrorPage.test.ts", "test/render/controls/MessagePage.test.ts", "test/render/controls/Blink.test.ts", "test/render/controls/Inverted.test.ts", "test/render/controls/AirportCoordOrNearestView.test.ts", "test/render/controls/SuperNav5Left.test.ts", "test/render/controls/SuperNav5Right.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research F tests in place, #NEW-6-1 #NEW-6-2 renamed", "F-3 pin removed", "#191 cites the trainer", "#NEW-6-3 per the 90B text search", "#102 pins kept", "sampling on blinkCycle", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 7: the displays

**Goal:** One test file per display source file, mounted with task 0's `mount()`, from research G, with the trainer's
verdicts.

**Files:**
- Create: `test/render/controls/displays/ActiveArrow.test.ts`, `AltitudeDisplay.test.ts`, `BearingDisplay.test.ts`,
  `DeviationBar.test.ts`, `DistanceDisplay.test.ts`, `DurationDisplay.test.ts`, `FlightplanArrow.test.ts`,
  `FuelDisplay.test.ts`, `LatitudeDisplay.test.ts`, `LongitudeDisplay.test.ts`, `RoundedDistanceDisplay.test.ts`,
  `SpeedDisplay.test.ts`, `SuperDeviationBar.test.ts`, `TemperatureDisplay.test.ts`, `TextDisplay.test.ts`,
  `TimeDisplay.test.ts`
- Leave: `test/render/controls/displays/NullDashes.test.ts` as it is
- Source drafts: `research/drafts-G/test/render/controls/displays/*` (the draft `mount.ts` is task 0's)

**Acceptance Criteria:**
- [ ] Every test of research G section 2 is in its file, on `test/harness/render/mount.ts`.
- [ ] Placeholders: `#NEW-G-1` → `#NEW-7-1` (4-7), `#NEW-G-2` → `#NEW-7-2` (two pins, 3-31, 3-32), `#NEW-G-3` → `#226`
  (TRI F REQ 99.97).
- [ ] `#NEW-7-3`: an ETE below an hour on the trip pages (TRI 1, 3, 5) shows `0:13` (figure 3-50; "checked in the KLN 89
  trainer, 2026-10-08", T32): a pin on the display as the trip pages use it, with a sibling above an hour. The NAV 1 and
  D/T forms without the hour digit stay as they are (their own figures).
- [ ] #263 on `BearingDisplay`: a bearing from 359.5 shows `000°`, never `360°` (the trainer T34 for "never 360"; the
  zero-padded form from the 90B figures); the pin carries `#263`, with a sibling at 359.4.
- [ ] `#NEW-1-6` on `LatitudeDisplay` and `LongitudeDisplay`: exactly 0 shows `N` and `E` (the trainer T35); siblings at
  a small nonzero value.
- [ ] The known pins of the draft keep their numbers: #225 (two), #226 (two plus the F REQ), #223 (two), #230 (two),
  #99 (two), #266 (its comment says a fix in the nearest views would leave it failing).
- [ ] The elevation below sea level stays a characterization (the trainer could not answer T33).
- [ ] Label audit, proofs, `npm test` green, `tsc` clean.

**Verify:** `npx vitest run test/render/controls/displays` → all pass (pins as expected failures); `npm test` → no
failures; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Worktree** as the Global Constraints say.
- [ ] **Step 2: Copy the drafts**, importing `mount` from `test/harness/render/mount.ts` and `mountedCycle` from
  `test/harness/render/blink.ts` where a draft samples a blink cycle.
- [ ] **Step 3: Rename and add the pins** of the Acceptance Criteria (`#NEW-7-3`, #263, `#NEW-1-6`); their draft
  characterizations of the same values go (rule 8).
- [ ] **Step 4: Prove** every test by its research break and one of your own, every pin by its fix (research G
  section 3; `#NEW-7-3`: the hour digit below an hour in the trip format; #263: `Math.round(x) % 360`; `#NEW-1-6`:
  `>= 0` for the hemisphere).
- [ ] **Step 5: Full suite, `tsc`, commit, report** with the label audit.

```json:metadata
{"files": ["test/render/controls/displays/ActiveArrow.test.ts", "test/render/controls/displays/AltitudeDisplay.test.ts", "test/render/controls/displays/BearingDisplay.test.ts", "test/render/controls/displays/DeviationBar.test.ts", "test/render/controls/displays/DistanceDisplay.test.ts", "test/render/controls/displays/DurationDisplay.test.ts", "test/render/controls/displays/FlightplanArrow.test.ts", "test/render/controls/displays/FuelDisplay.test.ts", "test/render/controls/displays/LatitudeDisplay.test.ts", "test/render/controls/displays/LongitudeDisplay.test.ts", "test/render/controls/displays/RoundedDistanceDisplay.test.ts", "test/render/controls/displays/SpeedDisplay.test.ts", "test/render/controls/displays/SuperDeviationBar.test.ts", "test/render/controls/displays/TemperatureDisplay.test.ts", "test/render/controls/displays/TextDisplay.test.ts", "test/render/controls/displays/TimeDisplay.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["research G tests in place on mount()", "#NEW-7-1, #NEW-7-2 renamed, #NEW-G-3 as #226", "#NEW-7-3 trip ETE pin", "#263 BearingDisplay pin", "#NEW-1-6 display pins", "known pins kept", "label audit, proofs, suite green"], "modelTier": "standard"}
```

### Task 8: issues and close-out

**Goal:** File the issues and comments of the design, replace the placeholders, update `testing.md` and write the
session log with rule 18, in the main checkout on the session branch.

**Files:**
- Modify: every test file with a `#NEW-` placeholder (`grep -rln "#NEW-" test/`)
- Modify: `docs/testing.md` (sections 6 and 7)
- Modify: `docs/test-coverage.md` (the Session 9b checkbox and the session log entry in section 4)

**Acceptance Criteria:**
- [ ] Each placeholder of the design's bug table that a task pinned is one GitHub issue with the `bug` label, filed after
  a search of the open and closed issues; each body states what is wrong, the reproduction (input, observed, expected),
  the file and line, the impact, the suggested fix, the evidence (pages paraphrased, "checked in the KLN 89 trainer,
  2026-10-08"), that it was found in the headless harness and not reproduced in the sim, and the pin's test name.
- [ ] `#NEW-6-3` filed with or without a pin as task 6 reported; the F-3 `question` issue filed without a pin.
- [ ] Comments on #99, #102, #109, #191, #226, #242, #263 as the design lists, each naming its new pins. No issue is
  edited or closed; an edit the design does not list needs the maintainer's explicit OK.
- [ ] The placeholders are replaced in one commit; `grep -r "#NEW-" test/` finds nothing.
- [ ] `testing.md` section 6 and 7: the limits and leads of the session (the design's "Log only" list, the reports'
  leads, the harness gaps not built), no counts in prose.
- [ ] The session log entry (section 4 of `test-coverage.md`), in the 9a format: done per task, rulings, trainer
  results, bugs filed, fixes that could not be re-broken, the coverage at start and end, not covered (rule 18), workflow
  notes; the checkbox ticked.
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
{"files": ["docs/testing.md", "docs/test-coverage.md"], "verifyCommand": "grep -r \"#NEW-\" test/ ; npm test && npx tsc --noEmit", "acceptanceCriteria": ["issues filed per the bug table", "#NEW-6-3 and the F-3 question filed", "comments on #99 #102 #109 #191 #226 #242 #263", "placeholders replaced, grep empty", "testing.md sections 6 and 7", "session log and checkbox", "suite green, tsc clean"], "modelTier": "frontier"}
```
