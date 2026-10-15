# Flight Plan Page and Waypoint Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone-4 issues #291, #242, #241, #240, #319, #239, #322, #289, #343, #262, #294 and #298 of the
KLN 90B simulator, one commit per issue.

**Architecture:** Three lanes.
- **Lane A** reworks `FlightplanList.tsx`: REF approval and cursor, the USE? field count, a full plan without a
  trailing blank, FPL FULL resync, the kept scroll offset, the from-waypoint anchor. It then fixes `FlightplanArrow`
  during a NAV flag.
- **Lane B** fixes the waypoint pages' USR DB FULL path, keeps a blank cell inside an ident, and builds the creation of
  a user waypoint from FPL pages and D-> on the SUP page.
- **Lane C** makes `ActiveArrow` compare plan indices on the waypoint pages and draws the D/T 4 destination symbol.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`, FSComponent JSX), Vitest
(stages unit, render and flight; render runs on happy-dom with the headless unit of `test/harness`).

**Spec:** `docs/superpowers/specs/2026-10-15-flightplan-entry-design.md`. Read it before any task: it holds the evidence,
the trainer results, the rulings and the reasons. The other inputs are in
`C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\06f7784b-dca0-46e8-b74d-21a1e6110687\scratchpad\`:
- `inventory\report.md`: every suggested fix measured against the full suite.
- `inventory\i<NNN>.patch`: the measured patches, a starting point and not a finished fix.
- `trainer\report.md`: the trainer report.

## Global Constraints

- **Branches**
  - The integration branch is `m4-flightplan-entry`. It already holds the trainer record (fb442f6) and the spec
    (fa3a286).
  - Each task works in its own worktree. Its first command is `git merge --ff-only m4-flightplan-entry`, because agent
    worktrees start at master's HEAD.
  - The controller integrates a finished task by cherry-pick, so the history stays linear.
  - Never push. Never commit on `master`.
- **Commits**
  - One commit per issue, with its tests and doc changes in the same commit, in the order of this plan.
  - The subject is `fixes #NN <description>`: a plain sentence, American English, lowercase after the number. #343 is a
    question that needs a fix, so it also says `fixes #343`.
  - End the message with the Co-Authored-By line your own attribution instructions give you.
  - Write commit messages without a BOM (Bash heredoc or `-m`).
  - A commit that also changes a pin or comment of another issue says `references #NN` for it in the body.
- **Before every commit**
  - `npx tsc --noEmit` is clean.
  - The WHOLE suite `npm test` is green (about one minute), not only the task's files.
  - Every test whose result changes must be one the task names. Any other change is a finding to report before
    committing: it may be a test that used the bug as its vehicle.
  - Grep the suite for tests that depend on the bug you fix (`grep -rn '#NN' test/` and the names the task gives).
- **Pins**
  - A fixed bug's `it.fails(...)` becomes `it(...)`, and the issue number stays in the title.
  - Rewrite its comment so it describes the fixed behavior and its evidence, not the old bug.
- **Test labels** (`test/README.md` section 5)
  - A test's title cites what supports its assertion: a Pilot's Guide page (`4-4`), a figure (`figure 5-85`), the photo
    (`photo 0283863.jpg`), a dated trainer check (`checked in the KLN 89 trainer, 2026-10-15`), or it says
    `characterization`.
  - A citation supports only what that page, photo or trainer entry literally shows. The KLN 89 has one knob pair, one
    cursor, no SUP page, no REF page, no D/T 4 and no FPL FULL, so nothing about those comes from it.
  - The maintainer's rulings (spec section 1) are characterizations. The AVsoftech trainer is cited by no test.
  - A characterization carries no page number. A `describe` titled with a page holds spec tests only. Never put a test
    into a `describe` whose title cites a different source.
  - Report, per new or changed `describe`/`it`, its title and whether it is spec, trainer or characterization.
- **Copyright:** the manuals are copyrighted. Cite page numbers and paraphrase; never copy manual text (no run of more
  than a few words) into code, comments, docs, tests or commit messages.
- **Code style**
  - Match the surrounding code: 4-space indent, double quotes in `kln90b/`, single quotes in `test/`.
  - Comments cite pages like `//4-7` and issues like `//#322`.
  - `target: es2017`.
- **State:** service classes keep no mutable state ([docs/architecture.md](../../architecture.md)). Controls and pages
  may hold UI state; they are rebuilt with their page.
- **No counts in prose** for things that grow (tests, files, issues, pages).
- **Do not fix other bugs on the side.** Report a new bug to the controller, who files it.
- **Asserted literals are derived independently:** from the spec, the trainer record, a figure, or a hand computation.
  Never copy them from the output of the code under test. If a literal below turns out wrong, report it with your
  derivation; do not silently change it. If a helper named below does not fit, adapt the setup and report it; the
  assertions stay.
- **Mutation check**
  1. After the fix is green, break the fix once (revert its key line).
  2. Confirm the new tests and the converted pins turn red.
  3. Restore, and confirm `git diff` shows only the intended change.
  4. Report which tests went red. A mutation that leaves everything green is a finding. Report it; do not hide it.
- **Docs**
  - Each commit updates the lines of `docs/architecture.md`, `test/README.md`, `docs/test-next-steps.md` and the
    `test/harness/` comments that describe its bug or the changed behavior. Find them with
    `grep -rn '#NN' docs/ test/` and the names the task gives.
  - Dated records are never edited: the `docs/kln89-trainer-record.md` blocks, `docs/test-coverage-record.md`, the specs
    and the plans.
- **Worktrees**
  - Create a `node_modules` junction to the main checkout's (PowerShell:
    `New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules`).
  - Never delete through it. The controller removes the junction (`cmd //c rmdir node_modules`) before removing the
    worktree.
- **Scratch files** go in your own folder
  `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\06f7784b-dca0-46e8-b74d-21a1e6110687\scratchpad\task<N>\`.
- **Reports:** write your report with the Bash tool (`cat > '.task-report.md' <<'EOF'`) at the root of your worktree,
  untracked and never committed. If that is refused, return it in full as text.

**User decisions (already made):**
- The spec as committed (fa3a286), approved by the maintainer on 2026-10-15.
- **#262:** the creation page is the SUP page in its CREATE NEW WPT AT: state, with the KLN 89's flow. Only the
  flight plan pages and D-> offer the creation; every other host keeps NO SUCH WPT.
- **#239:** figure 6-43 of the 90B guide wins over the KLN 89. The from waypoint stays on the page above a procedure
  header.
- **#343:** follow the KLN 89. A character after a blank cell keeps the gap; the ident with the blank is searched and
  can be created. If such a user waypoint does not survive persistence, stop and ask the maintainer before the fix
  lands.
- **#298:**
  - A Direct To to the destination, whether off the plan or to the last waypoint of FPL 0, shows the Direct To symbol
    (`d›`).
  - The active last leg of FPL 0 shows only the arrow (` ›`).
  - The arrow compares plan indices, so a first copy of the destination being active gives no arrow.
  - A test holds that a Direct To off the plan, with FPL 0 holding a plan, shows `d›<ident>`.

---

## Tasks, order and file ownership

| Task | Commit | Main files | Starts after |
|---|---|---|---|
| 1 | #291 | `FlightplanList.tsx`, `FlightplanListItem.tsx`, `RefPage.test.ts` | — |
| 2 | #242 | `FlightplanList.tsx`, `FplPage.test.ts`, `FlightplanList.test.ts` | Task 1 |
| 3 | #241 | `FlightplanList.tsx`, `FplPage.test.ts` | Task 2 |
| 4 | #240 | `FlightplanList.tsx`, `FplPage.test.ts` | Task 3 |
| 5 | #319 | `FlightplanList.tsx`, `FlightplanList.test.ts` | Task 4 |
| 6 | #239 | `FlightplanList.tsx`, `FplPage.test.ts` | Task 5 |
| 7 | #322 | `FlightplanArrow.tsx`, `FlightplanArrow.test.ts` | Task 6 |
| 8 | #289 | `Apt1Page.tsx`, `IntPage.tsx`, `NdbPage.tsx`, `SupPage.tsx`, `VorPage.tsx`, `SupPage.test.ts`, new `UsrDbFull.test.ts` | — |
| 9 | #343 | `WaypointSelector.tsx`, `WaypointSelector.test.ts`, `WaypointEditor.test.ts`, a persistence test | Task 8 |
| 10 | #262 | `WaypointEditor.tsx`, `FlightplanListItem.tsx`, `DirectToPage.tsx`, `SupPage.tsx`, `FplPage.test.ts`, `DirectToPage.test.ts`, `WaypointEditor.test.ts` | Tasks 1 to 7 and 9 integrated |
| 11 | #294 | `ActiveArrow.tsx`, `WaypointPage.tsx`, the waypoint pages, `ActPage.test.ts` | — |
| 12 | #298 | `Dt4Page.tsx`, `Dt4Page.test.ts` | Task 11 |

- **Lane A** is Tasks 1 to 7, **lane B** is Tasks 8 to 10, **lane C** is Tasks 11 and 12. Within a lane the tasks run
  one after the other, and the lanes run in parallel.
- **Shared files:**
  - `FplPage.test.ts` and `FlightplanListItem.tsx` are shared by lanes A and B. Task 10 therefore starts only after
    lane A is integrated.
  - The waypoint pages (`Apt1Page`, `IntPage`, `NdbPage`, `SupPage`, `VorPage`) are touched by lanes B and C in
    different places: the catch blocks in Task 8, the `ActiveArrow` constructor line in Task 11. The controller
    cherry-picks them in plan order. A conflict there is resolved by keeping both hunks.
- **Batching:** the controller may give Tasks 2, 4, 5 and 6 (and 7) to one implementer, with one commit each.

---

### Task 1: #291 REF inserts into FPL 0, the left cursor stays on during the approval

**Goal:** The REF page inserts its reference waypoint into FPL 0 too. The left cursor stays on while the waypoint waits
for approval and turns off once the waypoint is approved or rejected. CLR during the approval rejects it instead of
offering DEL.

**Files:**
- Modify: `kln90b/controls/FlightplanList.tsx` (`EditableFlightplan`: `insertLeg`, `createLeg`, the CONFIRM branch of
  `buildList`)
- Modify: `kln90b/controls/FlightplanListItem.tsx` (`clear`)
- Test: `test/render/pages/right/RefPage.test.ts`

**Acceptance Criteria:**
- [ ] The pins `RefPage.test.ts:141` and `:155` are converted to `it` and pass.
- [ ] After the approval on FPL 0 the left status shows `FPL 0` (the cursor is off), and FPL 0 is KAAA, TXKA, KBBB.
- [ ] CLR then ENT during the approval inserts nothing and deletes nothing, on FPL 0 and on FPL 2, and leaves the left
      cursor off.
- [ ] All the existing RefPage tests stay green, `:113` among them.

**Verify:** `npx vitest run test/render/pages/right/RefPage.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Convert the pins and add the tests.**
  - In `RefPage.test.ts`, turn `it.fails('inserts the reference waypoint into FPL 0 after the approval (5-21, #291)'`
    and `it.fails('keeps the left cursor on while the reference waypoint waits for approval (figure 5-85, #291)'` into
    `it`. Rewrite their comments: the cursor stays on until the approval, and the waypoint is inserted.
  - Add to `describe('REF page (characterization)')` (line 386):

```ts
    // The left cursor goes off after the approval on FPL 0 as on a numbered plan (figure 5-86 shows that case); #291
    it('turns the left cursor off after the approval on FPL 0 (characterization, #291)', async () => {
        const unit = await bootOnRef('FPL 0');
        await enterReference(unit, 'TXK');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, 0)).toEqual(['KAAA', 'TXKA', 'KBBB']);
        expect(Screen.read().status().left).toBe('FPL 0');
    });

    // CLR while the reference waypoint waits for its approval rejects it. It must not ask DEL for the waiting row,
    // whose ENT would delete the waypoint at that position of the plan (#291)
    it.each(['FPL 0', 'FPL 2'] as const)('rejects the reference waypoint with CLR on %s (characterization, #291)', async fpl => {
        const unit = await bootOnRef(fpl);
        await enterReference(unit, 'TXK');
        expect(Screen.read().status().right).toBe('SUP'); // precondition: the page of TXKA waits for approval

        await unit.panel.clr();
        await unit.panel.ent(); // the ENT that would answer a DEL question
        await vi.advanceTimersByTimeAsync(500);

        expect(fplIdents(unit, fpl === 'FPL 0' ? 0 : 2)).toEqual(['KAAA', 'KBBB']);
        expect(Screen.read().status().left).toBe(fpl);
    });
```

- [ ] **Step 2: Run them and see the new ones fail.** Run
  `npx vitest run test/render/pages/right/RefPage.test.ts`. Expected: the two converted pins and the new tests fail.
  (The FPL 2 CLR case may already pass. Note it in the report.)

- [ ] **Step 3: Implement in `FlightplanList.tsx`.** Start from `inventory\i291.patch`:
  - `EditableFlightplan` gets `private awaitingRefApproval = false; //#291`.
  - `createLeg` sets it when `enter === FplWptEnterMode.CONFIRM`.
  - A private `endRefApproval()` turns the cursor off once and clears the flag. It is called at the end of the
    `wpt === null` branch of `insertLeg`, after the successful `buildList()`, and in the FPL FULL catch.
  - The CONFIRM branch of `buildList` becomes `reportErrors(listItem.confirmCurrentValue(), this.props.bus);`.
  - Clear the pending mode once it has run: in `buildList`, store `const mode = leg.enterMe;`, set
    `leg.enterMe = undefined;`, and switch on `mode` inside `enterMethod`. A rebuild while the waypoint waits then
    does not show its page again. Comment: `//#291 the pending entry runs once`.

- [ ] **Step 4: Implement in `FlightplanListItem.clear`.** A row with `origWptIdx === -1`, `wpt !== null` and an
  entered editor is a reference waypoint waiting for approval. For it, CLR rejects the entry, through the same path as
  turning the cursor off:

```ts
        if (this.origWptIdx === -1 && this.waypointEditor.isEntered) {
            //#291: a reference waypoint waiting for its approval is rejected; it is not in the plan, so there is no DEL
            this.setFocused(false); //cancels the confirmation and ends the insert (onInsertDone with null)
            return true;
        }
```

  Place it after the `wpt === null` block and before the APP check. If `setFocused(false)` does not pop the
  confirmation page, use the editor's cancellation path instead and report which one you used.

- [ ] **Step 5: Verify.** Run the RefPage file, then `npm test` and `npx tsc --noEmit`. Mutation checks:
  - Restore `.then(_ => this.cursorController.setCursorActive(false))`. The two pins must go red.
  - Remove the new `clear` branch. The CLR tests must go red.
  - Remove the `enterMe = undefined`. No test is expected to observe it; say so in the report.

- [ ] **Step 6: Docs and commit.** `grep -rn '#291' docs/ test/` and update the lines that describe the old behavior.
  Commit: `fixes #291 insert the reference waypoint into FPL 0 after its approval and keep the left cursor on until then`.

```json:metadata
{"files": ["kln90b/controls/FlightplanList.tsx", "kln90b/controls/FlightplanListItem.tsx", "test/render/pages/right/RefPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/RefPage.test.ts && npm test", "acceptanceCriteria": ["pins RefPage:141 and :155 pass as it", "cursor off after approval on FPL 0", "CLR then ENT during approval changes no plan, FPL 0 and FPL 2", "existing RefPage tests green"], "modelTier": "standard"}
```

---

### Task 2: #242 USE? and USE? INVRT? count as two fields

**Goal:** On a numbered plan with waypoints, the cursor lands on the new blank entry after an inner-knob insert, and on
the waypoint that moved up after a deletion.

**Files:**
- Modify: `kln90b/controls/FlightplanList.tsx:148` (`FPLFirstLine.refreshButtons`)
- Test: `test/render/pages/left/FplPage.test.ts` (pin `:814`; the FPL FULL helper `insertIntoFullFpl5`, around
  `:690`), `test/render/controls/FlightplanList.test.ts` (pin `:312`)

**Acceptance Criteria:**
- [ ] The pins `FplPage.test.ts:814` and `FlightplanList.test.ts:312` are converted to `it` and pass.
- [ ] The helper `insertIntoFullFpl5` no longer works around #242: the conditional outer click and its comment are
      gone, and the precondition `cursorOnEntry()` holds without it.
- [ ] The RefPage tests stay green (Task 1 made them independent of #242).

**Verify:** `npx vitest run test/render/pages/left/FplPage.test.ts test/render/controls/FlightplanList.test.ts test/render/pages/right/RefPage.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Convert the two pins** to `it`. Rewrite their comments: the cursor is on the new entry (4-4), and on
  the waypoint that moved up (trainer 2026-10-08). Run them. Expected: FAIL.
- [ ] **Step 2: Fix.** In the last branch of `refreshButtons`, `return 2; //#242 USE? and USE? INVRT? are two fields`.
  Also update the doc comment ("Returns the number of active buttons") if it needs it.
- [ ] **Step 3: Simplify the helper.** In `insertIntoFullFpl5`, replace the `if (!cursorOnEntry()) {...}` block with
  nothing, so that `expect(cursorOnEntry()).toBe(true)` follows the inner click directly. Keep the comment about #311.
  Also adjust any comment elsewhere that cites #242 as the cause (`grep -rn '#242' test/ docs/`).
- [ ] **Step 4: Verify.** Run the three files and `npm test`. Mutation: `return 1` again. Both pins and the helper's
  precondition (so test `:722`) must go red.
- [ ] **Step 5: Commit** `fixes #242 put the cursor on the new entry and on the moved-up waypoint on a numbered plan`.

```json:metadata
{"files": ["kln90b/controls/FlightplanList.tsx", "test/render/pages/left/FplPage.test.ts", "test/render/controls/FlightplanList.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/FplPage.test.ts test/render/controls/FlightplanList.test.ts test/render/pages/right/RefPage.test.ts && npm test", "acceptanceCriteria": ["pins FplPage:814 and FlightplanList:312 pass as it", "helper insertIntoFullFpl5 has no #242 workaround", "RefPage green"], "modelTier": "mechanical"}
```

---

### Task 3: #241 a full numbered plan has no blank position after the 30th waypoint

**Goal:** A numbered plan with 30 waypoints has no trailing blank entry. The last-row logic of `FlightplanList` keeps the
last waypoint in the bottom row with or without a trailing blank entry. FPL 0 is unchanged.

**Files:**
- Modify: `kln90b/controls/FlightplanList.tsx`:
  - `EditableFlightplan.syncLegsFromFlightplan` (:516-519);
  - `FlightplanList.tick` (:609), `getRowChild` (:648), `calculateRequiredScrollIdx` (:658) and
    `isLastWaypointInView` (:678).
- Test: `test/render/pages/left/FplPage.test.ts` (the pin `:756`, the helper preconditions `:686`, `:722`)

**Acceptance Criteria:**
- [ ] The pin `shows no blank position after the 30th waypoint (... #241)` is converted to `it` and passes.
- [ ] A full FPL 5 with the cursor just turned on shows ` 30:FA29   ` in row 5.
- [ ] `FlightplanEdit.test.ts:84` and `:104` (full FPL 0) and the FPL FULL helper's preconditions stay green unchanged.
- [ ] No other test changes.

**Verify:** `npx vitest run test/render/pages/left/FplPage.test.ts test/render/controls/FlightplanList.test.ts test/flight` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Convert the pin and add the test.** Turn the pin into `it`. Add to the same describe
  (`FPL 1 to FPL 25 pages, a full plan`):

```ts
    // 4-3 step 10 and figure 4-9: with more than five waypoints the page shows the first four and then the last one.
    // A full plan has no blank position below its last waypoint, so the last row is the 30th waypoint (#241)
    it('shows the 30th waypoint in the last row of a full plan (4-3)', async () => {
        const fixes = FIXES31();
        const unit = await bootUnit({facilities: fixes, position: {lat: 46.5, lon: 8}, storage: savedFlightplan(5, fixes.slice(0, 30))});
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 5');
        await unit.panel.cursor('L');

        expect(left()[5]).toBe(' 30:FA29   ');
    });
```

  Run the file. Expected: the pin and the new test FAIL. (The new one may show ` 29:FA28` after a crude fix; on master
  it shows ` 30:FA29` too, because the blank is still there. If it already passes on master, keep it as the guard of
  the rework and say so.)

- [ ] **Step 2: No trailing blank on a full numbered plan.** In `syncLegsFromFlightplan`:

```ts
    private syncLegsFromFlightplan() {
        this.legs = this.flightplan.getLegs().map((l, idx) => ({wpt: l.wpt, origIdx: idx, leg: l}));
        //4-4: only a plan of fewer than 30 waypoints takes another one, so a full numbered plan has no blank position
        //(#241). FPL 0 keeps it: an addition to a full FPL 0 can make room by dropping the first waypoint (C-1)
        this.hasTrailingBlank = this.flightplan.idx === 0 || this.legs.length < MAX_LEGS;
        if (this.hasTrailingBlank) {
            this.legs.push({wpt: null, origIdx: -1});
        }
    }
```

  - Add `public hasTrailingBlank = true;` to `EditableFlightplan`.
  - Take `MAX_LEGS` from where `Flightplan.ts` defines the limit of 30. Grep `30` in `kln90b/data/flightplan/Flightplan.ts`.
    If no constant is exported, export one there rather than repeating the number.
  - Check C-1 for the comment's FPL 0 claim. If C-1 does not say that, drop that sentence and keep only "FPL 0 keeps
    it".

- [ ] **Step 3: Make the last-row logic independent of the trailing blank.** In `FlightplanList`:

```ts
    /** The index of the child shown in the last row while the end of the list is out of view: the last waypoint (4-8) */
    private lastWaypointChildIdx(numChildren: number): number {
        return this.editPlan.hasTrailingBlank ? numChildren - 2 : numChildren - 1;
    }

    /** The largest scroll offset that still shows the last waypoint in the last row */
    private maxScrollIdx(numChildren: number): number {
        return Math.max(this.lastWaypointChildIdx(numChildren) - (this.height - 1), 0);
    }
```

  - `getRowChild`: `return childList[this.lastWaypointChildIdx(childList.length)];` instead of
    `childList[childList.length - 2]`.
  - `calculateRequiredScrollIdx`: `if (focusedIdx < this.lastWaypointChildIdx(childList.length))` instead of
    `focusedIdx < childList.length - 2`.
  - `tick`: `Math.min(i - 1, this.maxScrollIdx(childList.length))` instead of `childList.length - this.height - 1`.
    It is the same value for FPL 0, which always has the blank.
  - `isLastWaypointInView` stays (`scrollIdx + 6 >= numChildren`): it asks whether everything left fits.

- [ ] **Step 4: Verify.** Run the files and `npm test`. The helper's precondition ` 31:FA29   ` after the inner click
  must hold: the new entry plus 30 waypoints, the last waypoint in the last row. Mutation checks:
  - Make `hasTrailingBlank` always true. The pin must go red.
  - Make `lastWaypointChildIdx` return `numChildren - 2` always. The new test or the helper precondition must go red.
- [ ] **Step 5: Docs and commit** `fixes #241 leave out the blank position after the 30th waypoint of a numbered plan`.

```json:metadata
{"files": ["kln90b/controls/FlightplanList.tsx", "kln90b/data/flightplan/Flightplan.ts", "test/render/pages/left/FplPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/FplPage.test.ts test/render/controls/FlightplanList.test.ts && npm test", "acceptanceCriteria": ["pin FplPage:756 passes as it", "full FPL 5 row 5 shows ' 30:FA29   '", "FlightplanEdit :84 :104 and the FPL FULL helper unchanged and green", "no other test changes"], "modelTier": "standard"}
```

---

### Task 4: #240 the page shows the plan as stored after FPL FULL

**Goal:** After FPL FULL the list is rebuilt from the plan, and the cursor is on the waypoint the insert was in front of.

**Files:**
- Modify: `kln90b/controls/FlightplanList.tsx` (`EditableFlightplan.insertLeg`, its catch)
- Test: `test/render/pages/left/FplPage.test.ts` (pin `:733`)

**Acceptance Criteria:**
- [ ] The pin `does not show the refused waypoint after FPL FULL (4-4, C-1, #240)` is converted to `it` and passes.
- [ ] After FPL FULL in `insertIntoFullFpl5` the focused field's text is `FA29 `.

**Verify:** `npx vitest run test/render/pages/left/FplPage.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Convert the pin and add the test.** Turn the pin into `it`, and update its comment. Add to the same
  describe:

```ts
    // After FPL FULL the cursor goes back to the waypoint the insert was in front of (#240)
    it('keeps the cursor on the waypoint the refused insert was in front of (characterization, #240)', async () => {
        const unit = await insertIntoFullFpl5();

        expect(unit.panel.focused('L').text).toBe('FA29 ');
    });
```

- [ ] **Step 2: Fix.** In the catch of `insertLeg`, after the message and `console.error(e)`:

```ts
            //4-4, C-1: nothing is added, the page shows the plan as stored (#240)
            this.syncLegsFromFlightplan();
            this.legs[idx].focusMe = true;
            this.buildList();
            this.endRefApproval();
```

  Keep `endRefApproval()` from Task 1 where Task 1 put it, but only once. `idx` is the position the entry was inserted
  at, so after the sync `legs[idx]` is the waypoint that followed it.
- [ ] **Step 3: Verify.** Run the file and `npm test`. Mutation: remove the sync and rebuild. The pin must go red.
  Remove only the `focusMe` line, and report where the cursor lands then.
- [ ] **Step 4: Commit** `fixes #240 show the plan as stored after FPL FULL`.

```json:metadata
{"files": ["kln90b/controls/FlightplanList.tsx", "test/render/pages/left/FplPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/FplPage.test.ts && npm test", "acceptanceCriteria": ["pin FplPage:733 passes as it", "focused text after FPL FULL is 'FA29 '"], "modelTier": "mechanical"}
```

---

### Task 5: #319 an insertion keeps the page where it was

**Goal:** A rebuild of the flight plan list keeps its scroll offset, clamped so that the last waypoint stays in the last
row.

**Files:**
- Modify: `kln90b/controls/FlightplanList.tsx` (`FlightplanList.refresh`)
- Test: `test/render/controls/FlightplanList.test.ts` (pin `:233`)

**Acceptance Criteria:**
- [ ] The pin `keeps the page where it was after an insertion (checked in the KLN 89 trainer, 2026-10-08, #319)` is
      converted to `it` and passes.
- [ ] No other test changes.

**Verify:** `npx vitest run test/render/controls/FlightplanList.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Convert the pin** to `it` and update its comment. Run it. Expected: FAIL.
- [ ] **Step 2: Fix:**

```ts
    public refresh(children: UIElementChildren<any>): void {
        const scrollIdx = this.scrollIdx; //#319 a rebuild keeps the page where it was (4-4, 4-8)
        super.refresh(children);
        if (this.children === children && scrollIdx > 0) {
            this.scrollIdx = Math.min(scrollIdx, this.maxScrollIdx(children.getall().length));
            this.redraw();
        }
    }
```

  (`super.refresh` sets `scrollIdx = 0` and returns early before the page is mounted. `this.children === children`
  tells that it went through.)
- [ ] **Step 3: Verify.** Run and `npm test`. Mutation: drop the restore. The pin must go red.
- [ ] **Step 4: Commit** `fixes #319 keep the page where it was after an insertion`.

```json:metadata
{"files": ["kln90b/controls/FlightplanList.tsx", "test/render/controls/FlightplanList.test.ts"], "verifyCommand": "npx vitest run test/render/controls/FlightplanList.test.ts && npm test", "acceptanceCriteria": ["pin FlightplanList:233 passes as it", "no other test changes"], "modelTier": "mechanical"}
```

---

### Task 6: #239 the from waypoint stays above a procedure header

**Goal:** With the cursor off, FPL 0 scrolls so that the from waypoint is on the page, also when a procedure header lies
between it and the active waypoint.

**Files:**
- Modify: `kln90b/controls/FlightplanList.tsx` (`FlightplanList.tick`)
- Test: `test/render/pages/left/FplPage.test.ts` (pin `:381`; the Direct To characterization `:199` stays)

**Acceptance Criteria:**
- [ ] The pin `shows the from waypoint with the tail above the header (4-7, 4-8, 6-23, #239)` is converted to `it` and
      passes.
- [ ] `FlightplanList.test.ts:198` (the first leg) and `FplPage.test.ts:199` (Direct To) stay green unchanged.

**Verify:** `npx vitest run test/render/pages/left/FplPage.test.ts test/render/controls/FlightplanList.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Convert the pin** to `it` and update its comment (figure 6-43; the KLN 89 differs, see the trainer record
  of 2026-10-15). Run it. Expected: FAIL.
- [ ] **Step 2: Fix**, as `inventory\i239c.patch`:

```ts
                if (child instanceof FlightplanListItem && child.origWptIdx === actIdx) {
                    //4-7, 4-8, figure 6-43: the from waypoint stays on the page, also with a procedure header between it
                    //and the active waypoint (#239). The first leg and a Direct To have no from waypoint in the plan
                    const fromIdx = actIdx > 0 && !this.activeWaypoint.isDctNavigation()
                        ? childList.findIndex(c => c instanceof FlightplanListItem && c.origWptIdx === actIdx - 1) : -1;
                    const anchor = fromIdx !== -1 ? fromIdx : i - 1;
                    const requiredScrollIdx = Math.max(Math.min(anchor, this.maxScrollIdx(childList.length)), 0); //not using clamp, the order is important
```

- [ ] **Step 3: Verify.** Run the files and `npm test`. Mutation checks:
  - Use `i - 1` again. The pin must go red.
  - Drop the `actIdx > 0` guard. `FlightplanList.test.ts:198` must go red.
  - Drop the Direct To guard. Report what changes; the inventory saw `FplPage.test.ts:199`.
- [ ] **Step 4: Commit** `fixes #239 keep the from waypoint on FPL 0 above a procedure header`.

```json:metadata
{"files": ["kln90b/controls/FlightplanList.tsx", "test/render/pages/left/FplPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/FplPage.test.ts test/render/controls/FlightplanList.test.ts && npm test", "acceptanceCriteria": ["pin FplPage:381 passes as it", "FlightplanList:198 and FplPage:199 green unchanged"], "modelTier": "mechanical"}
```

---

### Task 7: #322 no leg symbol on FPL 0 during a NAV flag

**Goal:** While the navigation is flagged, FPL 0 draws no symbol in front of any waypoint.

**Files:**
- Modify: `kln90b/controls/displays/FlightplanArrow.tsx:40-44`
- Test: `test/render/controls/displays/FlightplanArrow.test.ts` (pin `:152`; the `navState` mock at `:13`)

**Acceptance Criteria:**
- [ ] The pin `draws no leg symbol during a NAV flag (4-7, #322)` is converted to `it` and passes.
- [ ] A unit-level test holds that a Direct To arrow is not drawn while `distToActive` is null.
- [ ] The dead `activeIdx === null` check is gone.

**Verify:** `npx vitest run test/render/controls/displays/FlightplanArrow.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Mock and tests.**
  - Give `navState(...)` in the test file a `distToActive` field: a number by default, and a new optional parameter for
    null. Keep the existing calls working.
  - Convert the pin to `it`.
  - Add to `describe('FlightplanArrow (characterization)')`:

```ts
    // #322: during a NAV flag no arrow is drawn in front of the Direct To target either (4-7 names the leg symbol)
    it('draws no Direct To arrow while the navigation is flagged (characterization, #322)', () => {
        expect(arrow(1, navState(1, true, false, null)).text).toBe(' ');
    });
```

  (Adapt the argument list to how you extend `navState`.) Run. Expected: both FAIL.
- [ ] **Step 2: Fix:**

```ts
        //4-7: no symbol without usable navigation. distToActive is null only while the navigation is flagged
        //(NavCalculator.setFlag); toFrom is also null on a final zero-length leg, which still navigates (#120, #322)
        if (this.navPageState.distToActive === null) {
            this.ref.instance.innerText = " ";
            this.ref.instance.classList.remove("blink");
            return;
        }
        const activeIdx = this.navPageState.activeWaypoint.getActiveFplIdx();
```

  Then remove the `if (activeIdx === null)` branch and un-nest its `else`. Check in `NavCalculator.ts` that
  `distToActive` is set to null only in `setFlag`, and report if not.
- [ ] **Step 3: Verify.** Run and `npm test`. Mutation: remove the new check. The pin and the new test must go red.
- [ ] **Step 4: Commit** `fixes #322 draw no leg symbol on FPL 0 during a NAV flag`.

```json:metadata
{"files": ["kln90b/controls/displays/FlightplanArrow.tsx", "test/render/controls/displays/FlightplanArrow.test.ts"], "verifyCommand": "npx vitest run test/render/controls/displays/FlightplanArrow.test.ts && npm test", "acceptanceCriteria": ["pin FlightplanArrow:152 passes as it", "Direct To arrow blank while distToActive null", "dead activeIdx === null branch removed"], "modelTier": "mechanical"}
```

---

### Task 8: #289 a waypoint refused with USR DB FULL is not shown as created

**Goal:** On USR DB FULL every waypoint page stays in its creation state for that ident. There is no facility, and the
page memory and the cursor are untouched.

**Files:**
- Modify: the eight catch sites (the line of the `add` call):
  - `kln90b/pages/right/Apt1Page.tsx:246`, `:259`;
  - `IntPage.tsx:392`, `:427`;
  - `NdbPage.tsx:193`;
  - `SupPage.tsx:389`, `:416`;
  - `VorPage.tsx:243`.
- Test: `test/render/pages/right/SupPage.test.ts` (pin `:579`); create `test/render/pages/right/UsrDbFull.test.ts`

**Acceptance Criteria:**
- [ ] The pin `still offers to create the refused waypoint (C-2, 5-19, #289)` is converted to `it` and passes.
- [ ] For APT 1, VOR, NDB and INT, PRES POS? with 250 stored user waypoints:
  - shows `USR DB FULL`;
  - stores nothing;
  - leaves the page memory's facility null;
  - keeps the creation rows `CREATE NEW ` and `WPT AT:    ` on the page;
  - keeps the right cursor on.
- [ ] The SUP USER POS? path refuses the same way: after the longitude ENT, nothing is stored and the page memory's
      facility stays null.
- [ ] `RefPage`, `Ctr1Page` and `KlnEfbLoader` are unchanged.

**Verify:** `npx vitest run test/render/pages/right/UsrDbFull.test.ts test/render/pages/right/SupPage.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.**
  - Convert the pin.
  - Create `UsrDbFull.test.ts`. Reuse the setup of `createQqWithFullDatabase` in `SupPage.test.ts` (250 `sup` user
    waypoints from `savedUserWaypoints`, `muteConsoleError`). Read it and copy its boot options.

```ts
/** 250 user waypoints far away (the storage of createQqWithFullDatabase in SupPage.test.ts) */
async function bootWithFullDatabase(): Promise<HeadlessUnit> {
    muteConsoleError(); // the pages log the refusal
    const full = savedUserWaypoints(Array.from({length: 250}, (_, i) => ({
        kind: 'sup' as const, ident: `S${String(i).padStart(3, '0')}`, lat: 40 + i * 0.01, lon: 20,
    })));
    const unit = await bootUnit({facilities: [vor('ABC', 47.2, 8.0)], position: {lat: 47.0, lon: 8.0}, storage: full});
    expect(KLNFacilityRepository.getRepository(unit.props.bus).size()).toBe(250); // precondition
    return unit;
}

describe('waypoint pages with the user database full (C-2, 5-16, 5-19)', () => {
    // C-2: a user waypoint cannot be created while 250 are stored; the page still offers the creation for the ident
    it.each([
        ['APT 1', 'aptPage'], ['VOR  ', 'vorPage'], ['NDB  ', 'ndbPage'], ['INT  ', 'intPage'],
    ] as const)('refuses QQ on %s and still offers to create it (C-2, 5-19, #289)', async (page, memory) => {
        const unit = await bootWithFullDatabase();
        await unit.panel.selectPage('R', page);
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'QQ');
        await unit.panel.cursorTo('R', 'PRES POS?');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(screen.status().mode).toBe('USR DB FULL');
        expect(screen.rows('R')).toContain('CREATE NEW ');
        expect(screen.rows('R')).toContain('WPT AT:    ');
        expect(screen.status().right).toBe('CRSR');
        expect(KLNFacilityRepository.getRepository(unit.props.bus).size()).toBe(250);
        expect(unit.props.memory[memory].facility).toBeNull();
    });
});
```

  - Add a SUP USER POS? case to `SupPage.test.ts`, next to the pin: enter a latitude ENT and a longitude ENT, the way
    the file's other USER POS? tests do. Expect `USR DB FULL`, a size of 250, and `memory.supPage.facility` null.
  - Run. Expected: all new tests FAIL.
  - Check every page name against `PageTreeController`, and the memory field names against `VolatileMemory`.
- [ ] **Step 2: Fix every catch site**, as `inventory\i289.patch`:

```ts
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
            this.facility = null; //#289 C-2: the refused waypoint is not created, the page still offers it
            this.requiresRedraw = true;
            return;
        }
```

  - **On the USER POS? paths** (`createIfReady` and its equivalents), a page that keeps `userSupplementary` or the
    typed position goes on showing the entry. Report what each page shows after the refusal.
  - **Check that the memory and the cursor are untouched:** the `return` skips `memory.*.facility = ...` and
    `setCursorActive(false)`.
- [ ] **Step 3: Verify.** Run and `npm test`. Mutation: undo one site per page type in turn; its test must go red.
  Report the sites no test holds (expected: the USER POS? paths of APT 1 and INT).
- [ ] **Step 4: Commit** `fixes #289 keep offering the creation of a waypoint refused with USR DB FULL`.

```json:metadata
{"files": ["kln90b/pages/right/Apt1Page.tsx", "kln90b/pages/right/IntPage.tsx", "kln90b/pages/right/NdbPage.tsx", "kln90b/pages/right/SupPage.tsx", "kln90b/pages/right/VorPage.tsx", "test/render/pages/right/SupPage.test.ts", "test/render/pages/right/UsrDbFull.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/UsrDbFull.test.ts test/render/pages/right/SupPage.test.ts && npm test", "acceptanceCriteria": ["pin SupPage:579 passes as it", "APT 1, VOR, NDB, INT: USR DB FULL, 250 stored, memory facility null, creation rows, right cursor on", "SUP USER POS? path refuses the same way", "RefPage, Ctr1Page, KlnEfbLoader unchanged"], "modelTier": "standard"}
```

---

### Task 9: #343 a character entered after a blank cell keeps the gap

**Goal:** On the waypoint pages, a character entered in a cell beyond a blank cell stays in its cell (`AB A`), and that
exact ident is searched. A user waypoint with an embedded blank survives persistence.

**Files:**
- Modify: `kln90b/controls/selects/WaypointSelector.tsx` (`saveChar`)
- Test: `test/render/controls/selects/WaypointSelector.test.ts`, `test/render/controls/editors/WaypointEditor.test.ts`,
  and a persistence test next to the existing V2 loader tests (`grep -rln UserWaypointLoaderV2 test/`)

**Acceptance Criteria:**
- [ ] On APT 1 with the airport AB: the ident is `AB`, the cursor is on the fourth cell, and one inner click clockwise
      gives the ident `AB A`, with the creation rows `CREATE NEW ` / `WPT AT:    ` on the page.
- [ ] The D-> ident field (the `WaypointEditor`) shows `AB A` after the same entry, with no autofill.
- [ ] A user waypoint with the ident `AB A` saved and loaded through the V2 format keeps that ident and is found by
      ident. **If this fails, stop and report to the controller before any fix lands.**
- [ ] The tests `WaypointSelector.test.ts:128` and `:139` stay green.

**Verify:** `npx vitest run test/render/controls/selects/WaypointSelector.test.ts test/render/controls/editors/WaypointEditor.test.ts` plus the persistence test → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: The persistence test first.** Write it before anything else, and only then decide whether the fix may
  land:
  - Save a user waypoint `AB A` (a SUP is enough) through the project's persistor (`UserWaypointPersistor`), and load
    it back through `UserWaypointLoaderV2`, or boot a unit from storage built by the persistor.
  - Assert `icaoStruct.ident === 'AB A'`, and that `facilityLoader` finds it by that ident.
  - Title: `keeps a user waypoint whose ident holds a blank (checked in the KLN 89 trainer, 2026-10-15, #343)`. The 89
    created `80 A`.
  - If it fails, write `.task-report.md` with the failure and stop.
- [ ] **Step 2: Selector test.** In `WaypointSelector.test.ts`, add an APT 1 world with an airport `AB` and nothing
  whose ident starts with `AB A`:

```ts
    // The KLN 89 trainer (2026-10-15): a character entered after a blank cell stays in its cell, the blank before it is
    // kept, and the unit searches that ident and offers to create it (#343)
    it('keeps the blank before a character entered after it (checked in the KLN 89 trainer, 2026-10-15, #343)', async () => {
        const unit = await abWithCursorOnFourthCell(); // APT 1 shows AB, the cursor on the fourth ident cell
        expect(identRow().slice(1, 5)).toBe('AB  '); // precondition

        await unit.panel.inner('R', 1);

        expect(identRow().slice(1, 5)).toBe('AB A');
        expect(Screen.read().rows('R').slice(2, 4)).toEqual(['CREATE NEW ', 'WPT AT:    ']);
    });
```

  - The helper, next to `b19WithCursor`:

```ts
/** APT 1 of AB, the only airport starting with AB, the right cursor on the fourth ident cell (two past the B) */
async function abWithCursorOnFourthCell(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('AB', 47.2, 8.0)], position: {lat: 47.0, lon: 8.0}});
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', 'AB'); // or the knobs, if enterIdent moves the cursor past the ident
    // walk the outer knob until the cursor is on the fourth cell (column 16 of the screen, the ident starts at 13)
    while (unit.panel.focused('R').col < 16) {
        await unit.panel.outer('R', 1);
    }
    expect(unit.panel.focused('R').col).toBe(16); // precondition
    return unit;
}
```

  - Check the column of the ident in row 0 against `identRow()`'s existing uses, and adapt the `slice` if the ident
    starts elsewhere. The literal stays `AB A`.
  - The creation rows are the 90B page. If you think that part needs its own characterization title, split it off.
- [ ] **Step 3: Editor test.** In `WaypointEditor.test.ts`, add the same entry in the D-> field: type `AB` with the
  knobs, move to the fourth cell, and give one inner click. The field shows `AB A` and no autofill. Check whether this
  already passes on master (the editor's `onCharChanged` reads the fields with their blanks), and report it.
- [ ] **Step 4: Run.** Expected: the selector test FAILS (it shows `ABA`).
- [ ] **Step 5: Fix** `saveChar`:

```ts
    private saveChar(charIdx: number, idx: number): void {
        //#343: a character after a blank cell keeps the gap, checked in the KLN 89 trainer (2026-10-15)
        let enteredIdent = this.ident.padEnd(idx, " ").substring(0, idx) + CHARSET[charIdx];
```

  Check that the rest of `saveChar` and `applyIdentToFields` handle the embedded blank. `changedCallback(enteredIdent)`
  passes `AB A` to the page, which shows the creation.
- [ ] **Step 6: Verify.** Run and `npm test`. Mutation: drop the `padEnd`. The selector test must go red.
- [ ] **Step 7: Commit** `fixes #343 keep the blank before a character entered after it in a waypoint ident`.

```json:metadata
{"files": ["kln90b/controls/selects/WaypointSelector.tsx", "test/render/controls/selects/WaypointSelector.test.ts", "test/render/controls/editors/WaypointEditor.test.ts"], "verifyCommand": "npx vitest run test/render/controls/selects/WaypointSelector.test.ts test/render/controls/editors/WaypointEditor.test.ts && npm test", "acceptanceCriteria": ["APT 1 AB + inner on 4th cell gives 'AB A' and the creation rows", "D-> field shows 'AB A' without autofill", "user waypoint 'AB A' survives V2 save/load and is found by ident, else stop", "WaypointSelector :128 :139 green"], "modelTier": "standard"}
```

---

### Task 10: #262 an unknown ident on an FPL page or D-> creates a user waypoint on the SUP page

**Goal:** ENT on an ident that is in no database, on any FPL page or on D->, opens the SUP page's creation for that
ident on the right. Once the waypoint is created, its normal approval follows, and its ENT inserts it or executes the
Direct To. REF and every other host keep NO SUCH WPT.

**Files:**
- Modify: `kln90b/controls/editors/WaypointEditor.tsx` (a host option and the waiting-for-creation state; `enter`,
  `isEnterAccepted`, `clear`, `setEntered`)
- Modify: `kln90b/controls/FlightplanListItem.tsx` (sets the option; CLR on the creation ends the insert)
- Modify: `kln90b/pages/left/DirectToPage.tsx` (sets the option)
- Modify: `kln90b/pages/right/SupPage.tsx`: built as the creation page for a host, with the ident and a callback once
  the waypoint is stored
- Test: `test/render/pages/left/FplPage.test.ts` (pin `:846`), `test/render/pages/left/DirectToPage.test.ts` (pin
  `:430`), `test/render/controls/editors/WaypointEditor.test.ts` (pin `:408`)

**Acceptance Criteria:**
- [ ] The three pins are converted to `it` and pass.
- [ ] **The creation page.** ENT on `QQQQ` at FPL 0's blank position shows on the right:
  - the rows ` QQQQ      `, `           `, `CREATE NEW `, `WPT AT:    `, `USER POS?  `, `PRES POS?  ` (check the last
    two against `CreateWaypointMessage`);
  - the right cursor on;
  - the left row `  8:QQQQ   `.
- [ ] **Approval and insert, end of plan.**
  - PRES POS? ENT stores the user waypoint `QQQQ` and shows its page for approval: the right status `SUP`, row 0 `QQQQ`.
    FPL 0 is unchanged.
  - The next ENT appends `QQQQ` to FPL 0, and the cursor is on the next blank position.
- [ ] **Insert in front of a waypoint.** The same flow in front of ABC inserts `QQQQ` as waypoint 2, and the cursor is
      on `ABC  `.
- [ ] **CLR on the creation page.** Nothing is created and the plan is unchanged.
  - At the end position, the blank position keeps the cursor.
  - On an insert, the row goes and the cursor is on `ABC  `.
  - The right side shows its tree page again.
- [ ] **CLR on the approval.** Nothing is inserted, and `QQQQ` stays in the user database.
- [ ] **USER POS?** A typed latitude ENT and longitude ENT lead to the same approval, and its ENT inserts the waypoint.
- [ ] **A numbered plan.** On an empty FPL 3, the flow makes FPL 3 `['QQQQ']`.
- [ ] **D->.** The flow makes `QQQQ` the active waypoint. CLR on the creation page leaves the active waypoint as it was,
      shows a blank D-> field and creates nothing.
- [ ] **USR DB FULL** during the creation shows the message, keeps the creation page and leaves the plan unchanged.
- [ ] **Turning the left cursor off** during the creation removes the creation page and creates nothing.
- [ ] **Other hosts.** REF keeps `NO SUCH WPT` (the existing `WaypointEditor.test.ts:391` stays green), and so do CAL 7,
      NAV 4, SET 1, STA 5 and TRI (none set the option).

**Verify:** `npx vitest run test/render/pages/left test/render/controls/editors test/render/pages/right` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Read first.**
  - Spec section 3A, and the trainer report section Q1 (`trainer\report.md`).
  - `WaypointEditor.enter`, `confirmValue`, `currentValueConfirmed`, `cancelAwaitingConfirmation`.
  - `WaypointConfirmPage` (`showWaypointconfirmation`, `hasOpenEntry`, `clear`).
  - `MainPage.handleEnter` and the `EVT_CLR` branch (left first unless only the right has an open entry).
  - The `SupPage` creation paths (`createAtUserPosition`, `createIfReady`, `createAtPresentPosition`) and
    `CreateWaypointMessage`.
  - `inventory\i262.patch`: it passes the pins but is a dead end, because ENT goes back to the left editor.

- [ ] **Step 2: Write the tests.**
  - In `FplPage.test.ts`, replace the pin of `describe('FPL 0 page, an ident that is not in the database')` with the
    creation-page test. Add the flow tests to the same file in a new
    `describe('FPL pages, creating a user waypoint for an unknown ident')`.
  - Add the D-> tests to `DirectToPage.test.ts` (helper `unknownIdentEntered`, line 415).
  - Convert the keyboard pin in `WaypointEditor.test.ts` with the creation rows as its assertion.
  - Titles:
    - **Trainer:** the order of the steps, what is inserted or executed, the CLR outcomes for the plan and the
      database, and the cursor on the left, as the 89 showed them: `checked in the KLN 89 trainer, 2026-10-15`.
    - **Spec:** the creation rows are `4-2, 5-16`.
    - **Characterization:** the SUP type, the right cursor, the right side's page after CLR, USR DB FULL, the cursor
      turned off, and the numbered-plan row details.

  Core flow test, for the shape. `userWaypoints` and `fplIdents` come from `test/harness/readers.ts`:

```ts
    // The KLN 89 trainer (2026-10-15): the waypoint created for an unknown ident is inserted only after the approval
    // of its page, and the cursor moves on to the next blank position (#262)
    it('inserts the created waypoint after its approval (checked in the KLN 89 trainer, 2026-10-15, #262)', async () => {
        const unit = await cursorOnBlankPosition();
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent(); // the creation page
        await unit.panel.cursorTo('R', 'PRES POS?');

        await unit.panel.ent(); // creates QQQQ; its page waits for approval
        expect(userWaypoints(unit).map(w => w.icaoStruct.ident)).toContain('QQQQ');
        expect(fplIdents(unit, 0)).toEqual(route7().map(f => f.icaoStruct.ident)); // not inserted yet

        await unit.panel.ent();

        expect(fplIdents(unit, 0)).toEqual([...route7().map(f => f.icaoStruct.ident), 'QQQQ']);
        expect(unit.panel.focused('L').text.trim()).toBe('');
    });

    // The approval page of the created waypoint is its SUP page (characterization, #262)
    it('shows the SUP page of the created waypoint for approval (characterization, #262)', async () => {
        const unit = await cursorOnBlankPosition();
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent();
        await unit.panel.cursorTo('R', 'PRES POS?');

        await unit.panel.ent();

        expect(Screen.read().status().right).toBe('SUP');
        expect(Screen.read().rows('R')[0].trim()).toBe('QQQQ');
    });
```

  - For the insert in front of ABC, start like `puts the cursor on the new entry when the inner knob opens an insert on
    FPL 0 (4-4)`.
  - For the full database, reuse the 250-waypoint storage of Task 8's tests.
  - Run everything. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** Constraints on the design (the details are yours):
  - **The option.** `WaypointEditor` gets an option, e.g. `offerCreation?: boolean`, documented with `//#262 4-2`. Only
    `FlightplanListItem` and `DirectToPage` set it.
  - **Waiting for the creation.** On an unknown ident with the option set, the editor stays entered and keeps its
    fields. It enters a waiting-for-creation state and pushes a `SupPage` on the right, with
    `this.props.parent` as its parent:
    - the page is in its CREATE NEW state for the typed ident (trimmed at the end only, so `AB A` keeps its blank,
      #343);
    - its right cursor is on, over USER POS?;
    - its constructor posts no `NO SUP WPTS`;
    - pass the ident and a creation callback through the page's props. Do not overwrite `memory.supPage` when you can
      avoid it; if you must, say so in the report.
  - **ENT reaches the right page.** While the editor waits for the creation, `isEnterAccepted()` is false and `enter()`
    returns `Not_Handled`, so that `MainPage.handleEnter` passes ENT to the SUP page.
  - **Once the SUP page has stored the waypoint** (the successful `facilityRepository.add` in `createAtPresentPosition`
    and `createIfReady`), it calls the callback with the new facility. The editor then pops the creation page and calls
    its own `confirmValue(this.convertFromValue(facility), facility)`. That is the normal approval, whose ENT runs
    `enterCallback`, so the FPL insert and the D-> work as for a database waypoint.
  - **On USR DB FULL** (after Task 8) there is no callback, and the creation page stays.
  - **CLR, while the editor waits for the creation,** cancels it: the creation page is popped, nothing is created, and
    the editor leaves the entered state with a blank value and no pending confirmation.
    - `FlightplanListItem.clear` then ends the insert with `onInsertDone(wptIdx, null, null)`: the insert row goes, or
      the blank end position is rebuilt, and the cursor stays at its index.
    - On D-> the field is blank and the cursor stays on.
    - CLR reaches the left first, because the left has an entered field; check that it does.
  - **Turning the cursor off or leaving the page** (`setEntered(false)`, `setFocused(false)`) also pops the creation
    page.
  - **REF keeps NO SUCH WPT**, and REF's own SUP-page editor (`SupPage` `ref`) does not set the option.

- [ ] **Step 4: Verify.**
  - Run the three folders and `npm test`.
  - **Mutation checks:**
    - Drop the option on `DirectToPage`. The D-> tests must go red.
    - Make `isEnterAccepted()` true while waiting. The flow tests must go red.
    - Skip the callback. The approval and insert tests must go red.
  - **Grep for vehicles:** `grep -rn "NO SUCH WPT" test/` for any test that types an unknown ident on FPL or D-> and
    expects the message. Report each one, with why it changed.

- [ ] **Step 5: Docs and commit.**
  - Update `docs/architecture.md` if it describes the waypoint editor's NO SUCH WPT or the right page stack for
    confirmations.
  - No public contract changes, so no wiki page changes.
  - Commit `fixes #262 create a user waypoint on the SUP page for an unknown ident on the flight plan and D-> pages`.

```json:metadata
{"files": ["kln90b/controls/editors/WaypointEditor.tsx", "kln90b/controls/FlightplanListItem.tsx", "kln90b/pages/left/DirectToPage.tsx", "kln90b/pages/right/SupPage.tsx", "test/render/pages/left/FplPage.test.ts", "test/render/pages/left/DirectToPage.test.ts", "test/render/controls/editors/WaypointEditor.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left test/render/controls/editors test/render/pages/right && npm test", "acceptanceCriteria": ["three pins pass as it", "creation page rows and right cursor", "PRES POS? ENT stores and shows SUP approval, next ENT inserts, cursor next blank", "insert in front of ABC, cursor on ABC", "CLR on creation creates nothing, plan unchanged", "CLR on approval inserts nothing, waypoint stays", "USER POS? lat/lon path inserts", "numbered FPL 3 gets QQQQ", "D-> activates QQQQ; CLR keeps active waypoint", "USR DB FULL keeps creation page", "cursor off removes creation page", "REF and other hosts keep NO SUCH WPT"], "modelTier": "frontier"}
```

---

### Task 11: #294 the ACT arrow marks only the active copy of a waypoint

**Goal:** On the ACT pages the arrow shows only at the copy whose plan index is active. Other pages keep the ICAO
comparison.

**Files:**
- Modify: `kln90b/controls/displays/ActiveArrow.tsx`
- Modify: `kln90b/pages/right/WaypointPage.tsx` (a `getActiveArrowFplIdx()` helper)
- Modify: every waypoint page that builds an `ActiveArrow`: Apt1:92, Apt2:58, Apt3ListPageContainer:60, Apt4:59,
  Apt5:54, Apt6:52, Apt7:537, Apt8:297, Int:88, Ndb:63, Sup:81 and Vor:75. Check the list with
  `grep -rn "new ActiveArrow" kln90b/pages/right`.
- Test: `test/render/pages/right/ActPage.test.ts` (pin `:273`)

**Acceptance Criteria:**
- [ ] The pin `shows no arrow at the second copy of the active waypoint (4-10, the KLN 89 trainer, 2026-10-07, #294)`
      is converted to `it` and passes.
- [ ] For an airport twice in FPL 0 with the first copy active, ACT shows `›` in column 0 at the first copy and a blank
      at the second.
- [ ] `ActiveArrow.fplIdx` is public and mutable (Task 12 uses it).
- [ ] NAV 1, NAV 3, Super NAV 1, OTH 5 and D/T 1 to 3 keep the ICAO comparison, and their tests stay green.

**Verify:** `npx vitest run test/render/pages/right/ActPage.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** Convert the pin. Add next to it, with `bootOnAct` (line 108). The test fixes the copy that is
  active either way (by the leg or by a Direct To):

```ts
    // 4-10: the arrow marks the active waypoint; at a second copy in the plan it stays blank. The KLN 89 trainer
    // (2026-10-07) showed it for a VOR; this is the airport page (#294)
    it('shows the arrow only at the active copy of an airport (4-10, #294)', async () => {
        const {kaaa, abc, kbbb} = dtWorld();
        // FPL 0 KAAA, KBBB, ABC, KBBB; 0.1 degree north of KAAA the leg KAAA - KBBB is active, the first KBBB
        const unit = await bootOnAct([kaaa, kbbb, abc, kbbb], [kaaa, abc, kbbb]);
        expect(Screen.read().rows('R')[0]).toBe('› 2 KBBB  A'); // the ACT page opens on the active waypoint
        await unit.panel.scan();

        await unit.panel.inner('R', 2);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('R')[0]).toBe('  4 KBBB  A');
    });
```

  - The row format follows `'  1 KAAA  A'` in the scan test above the pin.
  - If the ACT row of an airport does not start the arrow in column 0, take the column from the pin's VOR row
    (`› 4 ABC D V`) and the APT 1 layout, and report it.
  - Label: 4-10 supports the arrow at the active waypoint. If you think "only at the active copy" needs the trainer,
    title it like the pin.
- [ ] **Step 2: Fix**, as `inventory\i294.patch`:
  - `ActiveArrow` gets `public fplIdx: number | null = null` as a third constructor parameter (`//#294`). When it is
    not null, the arrow shows only if `this.fplIdx === this.navPageState.activeWaypoint.getActiveFplIdx()`; otherwise
    it compares ICAOs as before.
  - `WaypointPage.getActiveArrowFplIdx()` returns `this.activeIdx > 0 ? this.activeIdx - 1 : null`.
  - Check how `activeIdx` is set: `ActPage.buildPage` passes `fplIdx + 1`, and 0 for a Direct To off the plan.
  - Every waypoint page passes `this.getActiveArrowFplIdx()`.
- [ ] **Step 3: Verify.** Run and `npm test`. Mutation checks:
  - Ignore `fplIdx` in `tick`. The pin and the new test must go red.
  - Pass `null` only from `Apt1Page`. The new test must go red.
- [ ] **Step 4: Commit** `fixes #294 mark only the active copy of a waypoint with the arrow on the ACT pages`.

```json:metadata
{"files": ["kln90b/controls/displays/ActiveArrow.tsx", "kln90b/pages/right/WaypointPage.tsx", "kln90b/pages/right/Apt1Page.tsx", "kln90b/pages/right/VorPage.tsx", "test/render/pages/right/ActPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/ActPage.test.ts && npm test", "acceptanceCriteria": ["pin ActPage:273 passes as it", "airport twice: arrow at the active copy only", "ActiveArrow.fplIdx public and mutable", "NAV 1, NAV 3, Super NAV 1, OTH 5, D/T 1-3 unchanged"], "modelTier": "standard"}
```

---

### Task 12: #298 D/T 4 marks a Direct To destination and the active destination

**Goal:** In the two cells in front of the destination ident, D/T 4 shows the Direct To symbol `d›` during a Direct To
to the destination, ` ›` while the last leg of FPL 0 is active, and blanks otherwise. The arrow is compared by plan
index.

**Files:**
- Modify: `kln90b/pages/right/Dt4Page.tsx`
- Test: `test/render/pages/right/Dt4Page.test.ts` (pin `:117`)

**Acceptance Criteria:**
- [ ] The pin `shows the Direct To symbol before a Direct To destination (photo 0283863.jpg, #298)` is converted to `it`
      and passes, with a precondition that FPL 0 holds its plan (exact `fplIdents`).
- [ ] Row 0 of D/T 4 in each case:

| Case | Row 0 |
|---|---|
| The last leg of FPL 0 active | ` ›KBBB  UTC` |
| A Direct To to the last waypoint of FPL 0 | `d›KBBB  UTC` |
| A Direct To to a middle waypoint | `  KBBB  UTC` |
| A destination twice in FPL 0, its first copy active | `  KBBB  UTC` |

- [ ] Other D/T 4 tests stay green, or the changes are reported. Expected: any test whose last leg is active now shows
      ` ›`.

**Verify:** `npx vitest run test/render/pages/right/Dt4Page.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.**
  - Convert the pin. In `directToOutsidePlan`, or in the pin, assert the plan first: e.g.
    `expect(fplIdents(unit, 0)).toEqual([...])` with the helper's legs.
  - Add the four cases to `describe('D/T 4 page (characterization)')` (line 137), each titled
    `(characterization, #298)`. These are maintainer rulings. With `bootMoving` and `dtWorld` (the aircraft 0.1 degree
    north of KAAA, so the first leg is active):

```ts
    // While the last leg of FPL 0 is active, its waypoint is the destination and the active waypoint: only the arrow
    // (maintainer ruling, #298)
    it('shows the arrow before the destination while the last leg is active (characterization, #298)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, kbbb], [kaaa, abc, def, kbbb]); // the first leg is the last leg
        expect(activeIdent(unit)).toBe('KBBB'); // precondition

        expect((await show(unit, 'FPL 0'))[0]).toBe(' ›KBBB  UTC');
    });

    // A Direct To to the last waypoint of FPL 0 shows the Direct To symbol, as off the plan (maintainer ruling, #298)
    it('shows the Direct To symbol after a Direct To to the last waypoint (characterization, #298)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);
        await unit.panel.directTo('KBBB', {waitMs: 2000});

        expect((await show(unit, 'FPL 0'))[0]).toBe('d›KBBB  UTC');
    });

    // A Direct To to a middle waypoint: the destination stays the last waypoint, which is not active (#298)
    it('shows blanks before the destination after a Direct To to a middle waypoint (characterization, #298)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);
        await unit.panel.directTo('ABC', {waitMs: 2000});

        expect((await show(unit, 'FPL 0'))[0]).toBe('  KBBB  UTC');
    });

    // The destination is twice in FPL 0 and its first copy is active: the arrow compares plan indices (maintainer
    // ruling, #298)
    it('shows no arrow before the destination while its first copy is active (characterization, #298)', async () => {
        const {kaaa, abc, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, kbbb, abc, kbbb], [kaaa, abc, kbbb]);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // precondition: the first KBBB

        expect((await show(unit, 'FPL 0'))[0]).toBe('  KBBB  UTC');
    });
```

  - Import `activeIdent` and `fplIdents` from `test/harness/readers.ts`.
  - If `directTo('KBBB')` does not make the plan's last leg active, find out what the D-> page does with a waypoint of
    FPL 0, and report it.

  Run. Expected: the new tests FAIL, except the middle-waypoint case, which already shows blanks.
- [ ] **Step 2: Fix.**
  - Replace the two leading `&nbsp&nbsp` in `render` with a `dct: TextDisplay` (one cell, `d` or a blank) and an
    `arrow: ActiveArrow` (one cell). Construct the arrow as `new ActiveArrow(null, this.props.memory.navPage, -1)`.
  - In `redraw` (or the place the ident is set), with `destLeg` the last future leg:

```ts
        const activeWaypoint = this.props.memory.navPage.activeWaypoint;
        const isDctToDest = activeWaypoint.isDctNavigation() && destLeg !== null && destLeg === activeWaypoint.getActiveLeg();
        //#298: d› for a Direct To to the destination (photo 0283863.jpg off the plan); the arrow alone while the last leg
        //of FPL 0 is active. The arrow compares plan indices, so a first copy of the destination gets none
        this.children.get("dct").text = isDctToDest ? "d" : " ";
        this.children.get("arrow").fplIdx = this.destinationFplIdx(destLeg);
```

  - `destinationFplIdx` returns the index of `destLeg` in FPL 0 (`fpl0.getLegs().indexOf(destLeg)`, which is -1 for an
    off-plan Direct To leg). `getActiveFplIdx()` is -1 for an off-plan Direct To too, so the arrow shows there.
  - Check what `getActiveFplIdx()` returns during a Direct To to the last plan waypoint (expected: its index), and with
    no plan and no Direct To (the arrow is blank because `getActiveWpt()` is null).
  - The arrow flashes with the waypoint alert through `ActiveArrow` (4-8 names the D/T pages).
- [ ] **Step 3: Verify.** Run and `npm test`. Mutation checks:
  - Always draw a blank `dct`. The pin and the Direct To to the last waypoint must go red.
  - Set `fplIdx` to the last index always. The first-copy case must go red.
- [ ] **Step 4: Commit** `fixes #298 show the Direct To symbol and the arrow before the destination on D/T 4`.

```json:metadata
{"files": ["kln90b/pages/right/Dt4Page.tsx", "test/render/pages/right/Dt4Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/Dt4Page.test.ts && npm test", "acceptanceCriteria": ["pin Dt4Page:117 passes as it with an exact FPL 0 precondition", "last leg active ' ›KBBB  UTC'", "D-> last 'd›KBBB  UTC'", "D-> middle '  KBBB  UTC'", "first copy active '  KBBB  UTC'", "other D/T 4 changes reported"], "modelTier": "standard"}
```

---

## After all tasks

The controller runs the final whole-branch review: full `npm test`, `npx tsc --noEmit`, `npm run build`, a label audit
of every new title, and a grep of the added comments for manual text. It then asks the maintainer before merging.
Nothing is merged, and no worktree or branch is deleted, before the maintainer approves.
