# Display pages (Super NAV 5, MSG, OTH and overlays) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone's issues (#96, #231, #233, #236, #321, #325, #326, #336, #393, #394, #395, #396), one commit
each (`fixes #NN`, and `references #325` for the one without a code change), on the branch `m9-display-pages`.

**Architecture:** Three lanes that touch disjoint files run in parallel, and #394 runs last because it touches files of
two lanes. Inside a lane the tasks run in order, each in a fresh worktree that fast-forwards to the integration branch
first, and each reviewed commit is cherry-picked onto `m9-display-pages` at once. Lane A gives pages a lifecycle
(`destroy()` on every way a page leaves) and builds the EFB load and the overlay knob rule on it; lane B fixes Super NAV
5; lane C fixes NAV 3, D/T 2 and the MSG page.

**Tech Stack:** TypeScript (target es2017), MSFS avionics SDK (`@microsoft/msfs-sdk`), FSComponent JSX, Vitest (unit,
render with happy-dom, flight), `numerable` for formatting.

**Spec:** `docs/superpowers/specs/2026-10-17-display-pages-design.md` (sections 1 to 5, and the amendments of section
6, which win where they differ).

## Global Constraints

- **Worktree start.** Every task runs in a fresh worktree. First command: `git merge --ff-only m9-display-pages`
  (agent worktrees start at master's HEAD). If `node_modules` is missing, create it as a junction to
  `E:\msfs\kln90b\node_modules` (PowerShell `New-Item -ItemType Junction`). Never remove a worktree yourself. If you
  must remove a junction, use `powershell -NoProfile -Command "(Get-Item -LiteralPath '<wt>\node_modules').Delete()"`,
  check that `<wt>\node_modules` is gone, and STOP if it is not. Never run `git worktree prune`.
- **One commit per task**, message `fixes #NN <description>` (plain sentence, American English; Task 11 uses
  `references #325`), with the test and doc changes of that issue in the same commit, and the attribution trailer your
  own environment gives you. No push, no GitHub writes, no edits outside the worktree.
- **Before the commit:** `npm test` (the FULL suite), `npx tsc --noEmit` and `npm run build` all pass. `tsc` inside a
  junction worktree can report a false `registerInstrument` error: if it does, say so in the report; the controller
  runs `tsc` in the main checkout after the cherry-pick. Expected-fail pins of other issues stay expected-fail.
- **Vehicles.** Before writing the fix, apply it once and run the full suite: every test outside the ones this plan
  names that changes result is a vehicle; report it and update it in the same commit with a comment saying why. The
  plan names the vehicles that the controller measured.
- **Every condition the task adds** (a guard, a branch, a call, an option) is named in the report with the test that
  turns red when that one condition is dropped. The plan names these tests; if one does not bite, say so and add one
  that does. Where the plan says a condition cannot be reached by a pilot, say in the report that it stays untested.
- **Labels (test/README.md section 5).** A test title cites a Pilot's Guide page or figure only for what that page
  literally shows. A KLN 89 trainer citation ("checked in the KLN 89 trainer, 2026-10-17") supports only what
  `docs/kln89-trainer-record.md` literally records in its blocks for that date. The AVsoftech trainer is never a spec
  source: what only it shows is `(characterization)`, and the comment says "the AVsoftech trainer (unreliable)". A
  ruling of the maintainer is cited as "(the maintainer's ruling, #NN)" in a comment, and its test title cites the
  issue. Never put a characterization in a describe whose title cites a page, nor a test in a describe whose title
  cites a different source. An `it.fails` pin that the fix turns green becomes a plain `it` with its title kept (drop
  nothing but `.fails`).
- **Copyright.** Never quote the Pilot's Guide or the other manuals: cite page numbers and paraphrase.
- **Code rules (CLAUDE.md).** DOM changes only in display ticks; state that must survive goes into `VolatileMemory`
  or settings; target es2017; comments cite the manual page or the issue; no counts in prose for things that grow.
- **Report.** Write `.task-report.md` at the root of your worktree with a Bash heredoc (never committed): the commit
  sha, the files changed, the conditions → tests table, the vehicles, a label audit (each `describe` and `it` you added
  or touched: its title, spec or characterization, every page number it cites), and the full-suite totals.

**User decisions (already made):**
- #393, #394, #395 and #396 are in the milestone, each its own commit.
- #236: the AVsoftech list 1 2 3 5 7 10 15 20 30 40 60 80 120 160 240 320 480 640 1000; a saved range not in it loads
  as 40.
- #231: below 1 NM NAV 3 shows hundredths in the photo's form, `FLY R0.09nm`.
- #321: the status line keeps `enr:`/`arm:`; the Super NAV 5 mode row shows `ENR300` and `ARM300` (no colon, no
  space); the OBS field colon is #396 (`OBS:241` without the degree sign where the course can be entered on the unit).
- #325: keep the blank page; no code change.
- #326: steady inverse once read (the maintainer's check on the AVsoftech trainer with `OBS WPT > 200NM`).
- #394: Super NAV 5 only: a pull with the menu open closes it and shows the scan window; CRSR while pulled opens the
  menu (the pulled knob then changes its fields) and CRSR again closes it; a push with the menu open does nothing.
- #395: the EFB load always wins (spec 2B and amendment 6).
- AVsoftech results are recorded but unreliable.

## Lanes and order

| Lane | Tasks, in order |
|---|---|
| A pages and stacks | Task 1 (#96), Task 2 (#395), Task 3 (#336) |
| B Super NAV 5 | Task 4 (#233), Task 5 (#236), Task 6 (#326), Task 7 (#321), Task 8 (#396) |
| C NAV 3, D/T 2, MSG | Task 9 (#231), Task 10 (#393), Task 11 (#325) |
| last | Task 12 (#394), after Task 3 and Task 8 |

Shared files: Task 1 and Task 3 both edit `kln90b/pages/MainPage.tsx` (lane A, in order); Task 12 edits it again after
them. Tasks 4, 5 and 12 edit `kln90b/pages/left/SuperNav5Page.tsx` and its test file (in order). Tasks 6, 7, 8 edit
`test/render/controls/SuperNav5Left.test.ts` (in order).

Test helpers used below (all exist): `bootUnit`, `settle`, `HeadlessUnit` (`test/harness/boot.ts`); `unit.panel` (the
`FrontPanel`: `selectPage`, `cursor`, `inner`, `outer`, `ent`, `clr`, `dct`, `msg`, `alt`, `scan`, `enterIdent`,
`cursorTo`, `obsMode`, `readMessages`, `powerCycle`, `approveSelfTest`); `Screen.read()` with `rows(side)`, `row(n)`,
`status()` (`{left, mode, right}`); `unit.overlay()`; `unit.efb!.sync(efbRoute({...}))` (`test/harness/platform.ts`);
`showSuperNav5`, `SuperNav5.read()` (`test/harness/render/superNav5.ts`); `recordMap` (`test/harness/render/mapRecorder.ts`);
`storedSetting`, `savedFlightplan` (`test/harness/storage.ts`); `bootOnStandardRoute`, `bootOnDtWorld`
(`test/harness/worldBoot.ts`). `MainPage` is `unit.props.pageManager.getCurrentPage() as MainPage`.

---

### Task 1: Pages that leave are destroyed (#96)

**Goal:** Every way a page leaves calls its `destroy()`, and OTH 3, OTH 4 and the welcome page drop their bus
subscription there, so that no page that was left keeps a handler.

**Files:**
- Modify: `kln90b/pages/MainPage.tsx` (`PageStack.pop`, `setCurrentPage`, `parentRemoved` at about :49-89, a new
  `destroyAll`; `OverlayStack.pop`, `remove` at about :102-116, a new `destroyAll`; `MainPage.destroy` at about :785)
- Modify: `kln90b/pages/left/Oth3Page.tsx:37`, `kln90b/pages/left/Oth4Page.tsx:37`, `kln90b/pages/WelcomePage.tsx:82`
- Test: `test/render/pages/left/Oth3Page.test.ts`, `test/render/pages/left/Oth4Page.test.ts`,
  `test/render/pages/MainPage.test.ts`, `test/render/pages/WelcomePage.test.ts`

**Acceptance Criteria:**
- [ ] The pins `leaves no repository sync handler behind once it is left (#96)` (Oth3Page.test.ts) and
  `leaves no remarks handler behind once it is left (#96)` (Oth4Page.test.ts) pass as plain `it`s.
- [ ] New tests show `destroy()` on a popped left page and on its right-side child (ALT twice), on a closed overlay
  (MSG twice), on a removed super page (Super NAV 5 left by the inner knob), and on every stack at power-off.
- [ ] A power cycle leaves the `propsReady` subscriber count unchanged from one cycle to the next.
- [ ] No other test changes (measured: only the two pins).

**Verify:** `npx vitest run test/render/pages/MainPage.test.ts test/render/pages/WelcomePage.test.ts test/render/pages/left/Oth3Page.test.ts test/render/pages/left/Oth4Page.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the new tests** at the end of `test/render/pages/MainPage.test.ts` (add the imports it lacks:
  `vi` from vitest, `KLNFacilityRepository` from `../../../kln90b/data/navdata/KLNFacilityRepository`, `showSuperNav5`
  from `../../harness/render/superNav5`):

```ts
// #96: pages are recreated on every knob step (CLAUDE.md), so a page that is left must be destroyed, or the handlers it
// subscribed keep it alive. These are properties of the code, not of the real unit; no manual page applies
describe('MainPage destroys the pages that leave (#96)', () => {
    const main = (unit: HeadlessUnit) => unit.props.pageManager.getCurrentPage() as MainPage;

    it('destroys the ALT page and the NAV 4 page it pushed on the right when ALT closes them (#96)', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();
        const alt = vi.spyOn(main(unit).getLeftPage(), 'destroy');
        const nav4 = vi.spyOn(main(unit).getRightPage(), 'destroy');

        await unit.panel.alt(); // pops the ALT page; its right-side child goes with it (PageStack.parentRemoved)

        expect(alt).toHaveBeenCalledTimes(1);
        expect(nav4).toHaveBeenCalledTimes(1);
    });

    it('destroys the MSG page when it closes (#96)', async () => {
        const unit = await bootUnit();
        await unit.panel.msg();
        expect(unit.overlay()).toBeInstanceOf(MessagePage); // Precondition
        const msg = vi.spyOn(unit.overlay()!, 'destroy');

        await unit.panel.msg();

        expect(unit.overlay()).toBeNull();
        expect(msg).toHaveBeenCalledTimes(1);
    });

    it('destroys Super NAV 5 when the left side leaves NAV 5 (#96)', async () => {
        const unit = await bootUnit();
        await showSuperNav5(unit);
        const sn5 = vi.spyOn(unit.overlay()!, 'destroy');

        await unit.panel.inner('L', -1); // NAV 4 on the left: the super page ends (OverlayStack.remove)

        expect(unit.overlay()).toBeNull();
        expect(sn5).toHaveBeenCalledTimes(1);
    });

    it('destroys the pages of every stack at power-off (#96)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'NAV 1');
        const before = unit.props.bus.getTopicSubscriberCount(KLNFacilityRepository.SYNC_TOPIC);
        await unit.panel.selectPage('L', 'OTH 3'); // OTH 3 subscribes to the repository sync
        await unit.panel.msg(); // an overlay over it
        const right = vi.spyOn(main(unit).getRightPage(), 'destroy');
        const overlay = vi.spyOn(unit.overlay()!, 'destroy');

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(right).toHaveBeenCalledTimes(1);
        expect(overlay).toHaveBeenCalledTimes(1);
        expect(unit.props.bus.getTopicSubscriberCount(KLNFacilityRepository.SYNC_TOPIC)).toBe(before);
    });
});
```

  And at the end of `test/render/pages/WelcomePage.test.ts` (it imports `bootUnit` already):

```ts
// #96: every power-on builds a new welcome page, which subscribes to propsReady; the page it replaces must leave no
// handler behind. A property of the code; no manual page applies
describe('welcome page subscription (#96)', () => {
    it('leaves the propsReady handler count unchanged from one power cycle to the next (#96)', async () => {
        const unit = await bootUnit();
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        const afterFirst = unit.props.bus.getTopicSubscriberCount('propsReady');

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(unit.props.bus.getTopicSubscriberCount('propsReady')).toBe(afterFirst);
    });
});
```

- [ ] **Step 2: Run them and the pins to see them fail**

Run: `npx vitest run test/render/pages/MainPage.test.ts test/render/pages/WelcomePage.test.ts test/render/pages/left/Oth3Page.test.ts test/render/pages/left/Oth4Page.test.ts`
Expected: the five new tests FAIL (destroy not called; the counts grow); the two pins pass as expected fails.

- [ ] **Step 3: Implement.** In `PageStack`:

```ts
    public pop(): SixLineHalfPage {
        if (this.isBasePageShown()) {
            throw new Error("Cannot pop the base page");
        }
        const page = this.stack.pop()!.page;
        page.destroy(); //#96
        return page;
    }

    public setCurrentPage(page: SixLineHalfPage): void {
        this.stack[this.stack.length - 1].page.destroy(); //#96: every caller passes a new page
        this.stack[this.stack.length - 1] = {page, parent: null};
    }

    public parentRemoved(parent: SixLineHalfPage): boolean {
        const lengthBefore = this.stack.length;
        this.stack.filter(p => p.parent === parent).forEach(p => p.page.destroy()); //#96
        this.stack = this.stack.filter(p => p.parent !== parent);
        return this.stack.length !== lengthBefore;
    }

    /** Power off (#96) */
    public destroyAll(): void {
        this.stack.forEach(p => p.page.destroy());
        this.stack = [];
    }
```

  In `OverlayStack`: `pop` destroys the page it pops (`const page = this.stack.pop()!; page.destroy(); //#96 return
  page;`), `remove` calls `this.stack[idx].destroy(); //#96` before the splice, and a `destroyAll()` like the one above
  (`this.stack.forEach(p => p.destroy()); this.stack = [];`). `MainPage.destroy`:

```ts
    public destroy(): void {
        //#96 power off
        this.leftPageStack.destroyAll();
        this.rightPageStack.destroyAll();
        this.overlayPageStack.destroyAll();
        this.statusLine.destroy();
        super.destroy();
    }
```

  `Oth3Page` and `Oth4Page` keep the `Subscription` that `handle(...)` returns in `private readonly subscription:
  Subscription` (import `Subscription` from `@microsoft/msfs-sdk`) and add:

```ts
    public destroy(): void {
        this.subscription.destroy(); //#96
        super.destroy();
    }
```

  `WelcomePage` does the same with `private propsReadySub: Subscription | undefined` (propsReady is cached by the bus,
  so `handle` runs `setProps` before it returns) and `this.propsReadySub?.destroy(); //#96` in its `destroy()`.

- [ ] **Step 4: Flip the pins.** Drop `.fails` from the two #96 pins; keep their titles and comments.

- [ ] **Step 5: Run the task's files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: all green.

- [ ] **Step 6: Commit** `fixes #96 destroy every page that leaves a stack, and drop the bus subscriptions of OTH 3, OTH 4 and the welcome page in destroy()`

**Conditions → tests:** pop → ALT test (`alt`); parentRemoved → ALT test (`nav4`); setCurrentPage → the two pins;
OverlayStack.pop → MSG test; OverlayStack.remove → Super NAV 5 test; MainPage.destroy, left stack → power-off test
(count), right stack → power-off test (`right`), overlay stack → power-off test (`overlay`); Oth3/Oth4 → their pins;
WelcomePage → the welcome test.

```json:metadata
{"files": ["kln90b/pages/MainPage.tsx", "kln90b/pages/left/Oth3Page.tsx", "kln90b/pages/left/Oth4Page.tsx", "kln90b/pages/WelcomePage.tsx", "test/render/pages/MainPage.test.ts", "test/render/pages/WelcomePage.test.ts", "test/render/pages/left/Oth3Page.test.ts", "test/render/pages/left/Oth4Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/MainPage.test.ts test/render/pages/WelcomePage.test.ts test/render/pages/left/Oth3Page.test.ts test/render/pages/left/Oth4Page.test.ts && npm test", "acceptanceCriteria": ["both #96 pins pass as plain tests", "destroy() is called on pop, parentRemoved, overlay pop, overlay remove and every stack at power-off", "the propsReady count is constant across power cycles", "no other test changes"], "modelTier": "standard"}
```

---

### Task 2: The EFB load replaces the left base page (#395)

**Goal:** An EFB route closes every pushed left page with its right-side children, removes the right-side children of
the old left base page, and shows FPL 0 as the left base page with its cursor off.

**Files:**
- Modify: `kln90b/pages/MainPage.tsx` (a new public `replaceLeftBasePage` next to `setLeftPage`, about :220)
- Modify: `kln90b/services/KlnEfbLoader.ts:55`
- Test: `test/render/services/KlnEfbLoader.test.ts`

**Acceptance Criteria:**
- [ ] With the creation page of an unknown D-> ident on the right, with ALT open, and with the creation page of an FPL
  0 insert on the right, the load leaves FPL 0 on the left and the right side's own page (NAV 1) with its cursor off.
- [ ] With the plain D-> page, an edit pending on the left base page, an edit on the right page, MSG, Super NAV 5 or SET
  0 open, the tests hold the ruled result (they pass today too; amendment 6).
- [ ] No other test changes (measured: none).

**Verify:** `npx vitest run test/render/services/KlnEfbLoader.test.ts test/render/harness/efb.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the tests** at the end of `test/render/services/KlnEfbLoader.test.ts` (imports to add:
  `showSuperNav5` from `../../harness/render/superNav5`, `MessagePage` from `../../../kln90b/controls/MessagePage`).
  The literals below were read from a probe of this exact setup (session scratchpad `measure/zz-probe395.test.ts`):

```ts
// #395, the maintainer's ruling: the EFB load always wins. Every page pushed on the left closes with its right-side
// children, FPL 0 becomes the left base page with the cursor off, and an unfinished left entry is dropped; the right
// page keeps its own cursor and edits; only the MSG page stays on top. The EFB sync is part of the public contract, not
// of the real unit, so no manual page applies
describe('EFB route import over open pages (#395)', () => {
    async function boot(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        return unit;
    }

    async function sync(unit: HeadlessUnit): Promise<void> {
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);
    }

    it('closes the creation page of an unknown D-> ident on the right (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('R')[2]).toBe('CREATE NEW '); // Precondition

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    it('closes the ALT page and the NAV 4 page it pushed on the right (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.alt();

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
        await unit.panel.alt();
        await unit.panel.alt(); // one pair is pushed and closed again
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    it('closes the creation page of an FPL 0 insert, whose parent is the left base page (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('R')[2]).toBe('CREATE NEW '); // Precondition

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
    });

    // Holds on today's code too: the D-> page is replaced by FPL 0 with the cursor off
    it('replaces the D-> page with FPL 0, the cursor off (#395)', async () => {
        const unit = await boot();
        await unit.panel.dct();

        await sync(unit);

        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['Á 1:KAAA   ', 'À 2:KBBB   ']);
    });

    // Holds on today's code too: an unfinished insert on FPL 0 is dropped
    it('drops an unfinished entry on the left base page (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // starts an insert: 1:A
        expect(Screen.read().rows('L')[1]).toBe('  1:A      '); // Precondition

        await sync(unit);

        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['Á 1:KAAA   ', 'À 2:KBBB   ']);
    });

    // Holds on today's code too: the right page keeps its cursor and the character being edited
    it('keeps the cursor and the edit of the right page (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.inner('R', 1);
        const edited = Screen.read().rows('R')[0];

        await sync(unit);

        expect(Screen.read().status()).toMatchObject({left: 'FPL 0', right: 'CRSR'});
        expect(Screen.read().rows('R')[0]).toBe(edited);
    });

    // Holds on today's code too: the MSG page stays on top, and FPL 0 is beneath it
    it('keeps the MSG page on top with FPL 0 beneath it (#395)', async () => {
        const unit = await boot();
        await unit.panel.msg();

        await sync(unit);

        expect(unit.overlay()).toBeInstanceOf(MessagePage);
        await unit.panel.msg();
        expect(Screen.read().status().left).toBe('FPL 0');
    });

    // Holds on today's code too: a super page shows only while its left page shows (MainPage.checkIfSuperPageIsShown)
    it('ends Super NAV 5 and SET 0 (#395)', async () => {
        const unit = await boot();
        await showSuperNav5(unit);
        await sync(unit);
        expect(unit.overlay()).toBeNull();
        expect(Screen.read().status().left).toBe('FPL 0');

        await unit.panel.selectPage('L', 'SET 0');
        await sync(unit);
        expect(unit.overlay()).toBeNull();
        expect(Screen.read().status().left).toBe('FPL 0');
    });
});
```

- [ ] **Step 2: Run to see the first three fail.** Expected: they FAIL (on today's code the right side keeps the
  creation page or NAV 4 with the right cursor on: `right: 'CRSR'`); the other five pass.

- [ ] **Step 3: Implement** in `MainPage` next to `setLeftPage`:

```ts
    /**
     * #395, the maintainer's ruling: the EFB load always wins. Every page pushed on the left closes (with its right-side
     * children), the right-side children of the old base page go too, and the page becomes the left base page
     */
    public replaceLeftBasePage(page: SixLineHalfPage): void {
        while (!this.leftPageStack.isBasePageShown()) {
            this.popLeftPage();
        }
        this.rerenderRightPage = this.rightPageStack.parentRemoved(this.leftPageStack.getCurrentPage()) || this.rerenderRightPage;
        this.setLeftPage(page);
    }
```

  and in `KlnEfbLoader.loadRoute`: `currentPage.replaceLeftBasePage(new Fpl0Page(currentPage.props));`.

- [ ] **Step 4: Run the file, then `npm test`, `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 5: Commit** `fixes #395 close the pushed left pages and the right-side children of the old base page when the EFB route loads FPL 0`

**Conditions → tests:** the pop loop → D-> unknown-ident test and ALT test; `parentRemoved` of the old base page →
the FPL 0 insert test; the `KlnEfbLoader` call → all three.

```json:metadata
{"files": ["kln90b/pages/MainPage.tsx", "kln90b/services/KlnEfbLoader.ts", "test/render/services/KlnEfbLoader.test.ts"], "verifyCommand": "npx vitest run test/render/services/KlnEfbLoader.test.ts test/render/harness/efb.test.ts && npm test", "acceptanceCriteria": ["the unknown D-> creation page, the ALT NAV 4 page and the FPL 0 insert creation page are gone after the load, right shows NAV 1 with the cursor off", "the five ruling tests hold", "no other test changes"], "modelTier": "standard"}
```

---

### Task 3: A knob an overlay's cursor field refuses does nothing (#336)

**Goal:** While an overlay's cursor is on, a knob its focused field refuses is swallowed instead of closing the overlay.

**Files:**
- Modify: `kln90b/pages/MainPage.tsx` (the eight overlay sites in `onInteractionEvent`, about :359, :384, :409, :434,
  :459, :487, :523, :559)
- Test: `test/render/pages/left/Set0Page.test.ts`

**Acceptance Criteria:**
- [ ] The pin `keeps SET 0 and the cursor on the prompt when the inner knob turns (2-5, T5, #336)` passes as a plain `it`.
- [ ] No other test changes (measured: only the pin); the #238 test in `SuperNav5Page.test.ts` stays green.

**Verify:** `npx vitest run test/render/pages/left/Set0Page.test.ts test/render/pages/left/SuperNav5Page.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Implement.** At each of the eight sites, replace the pop-and-redispatch branch with a call that keeps
  the result unused, for example the left inner knob:

```ts
                if (this.overlayPageStack.isShown()) {
                    if (this.getOverlayPage()!.lCursorController.cursorActive) {
                        //#336: with the cursor on, a knob the field refuses does nothing, as on the half pages (the
                        //KLN 89 trainer, 2026-10-09, T5). The pop of #56 stays for the cursor off
                        this.getOverlayPage()!.lCursorController.innerRight();
                        return true;
                    } else if (this.isSuperPageShown()) {
```

  Do the same for `outerLeft`, `outerRight`, `innerLeft`, `innerRight` on `lCursorController` and `rCursorController`.
  Keep the KLN 89 comment once per group, not eight times.

- [ ] **Step 2: Drop `.fails` from the pin**, keep its title; update its comment's last sentence (the code no longer
  pops the page).

- [ ] **Step 3: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 4: Commit** `fixes #336 keep an overlay when its cursor field refuses a knob`

**Conditions → tests:** the left inner sites (both directions) → the pin. The other six sites have no reachable case:
the only overlay field that refuses a knob is SET 0's left Button, and `CursorController.outerLeft/outerRight` refuse
only without a focused field. Say so in the report.

```json:metadata
{"files": ["kln90b/pages/MainPage.tsx", "test/render/pages/left/Set0Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/Set0Page.test.ts test/render/pages/left/SuperNav5Page.test.ts && npm test", "acceptanceCriteria": ["the #336 pin passes as a plain test", "the #238 test stays green", "no other test changes"], "modelTier": "mechanical"}
```

---

### Task 4: A route VOR or NDB is drawn once on Super NAV 5 (#233)

**Goal:** `drawNearestList` skips the icon and the label of a VOR or NDB that is a waypoint of FPL 0, compared by ICAO.

**Files:**
- Modify: `kln90b/pages/left/SuperNav5Page.tsx` (`drawNearestList` at about :377, its calls at about :176 and :179)
- Test: `test/render/pages/left/SuperNav5Page.test.ts` (the VOR tests at about :250-322)

**Acceptance Criteria:**
- [ ] The pin `labels a VOR of FPL 0 once with the VORs on (3-37, #233)` passes as a plain `it`.
- [ ] The three vehicles are rewritten: `draws the VORs of the class VOR: %s selects (3-37)` (no `)` for ABC) and the
  sibling `labels a VOR of FPL 0 with the VORs off, and draws it as a nearest VOR with VOR: H (3-37)`.
- [ ] A new test with a distinct copy of the route VOR's facility labels it once (holds the ICAO comparison).
- [ ] A new characterization: an NDB of FPL 0 with NDB: ON is drawn and labeled once.

**Verify:** `npx vitest run test/render/pages/left/SuperNav5Page.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Implement:**

```ts
        if (!this.isDecluttered && this.vorSetting.get() !== SuperNav5VOR.OFF) {
            this.drawNearestList(ctx, this.props.nearestLists.vorNearestList.getNearestList().filter(this.filterNearestVor.bind(this)), ")", legs);
        }
        if (!this.isDecluttered && this.ndbSetting.get()) {
            this.drawNearestList(ctx, this.props.nearestLists.ndbNearestList.getNearestList(), "(", legs);
        }
```

```ts
    private drawNearestList(ctx: CoordinateCanvasDrawContext, waypoints: NearestWpt<Facility>[], icon: string, legs: KLNFlightplanLeg[]) {
        for (const wpt of waypoints) {
            //3-37, figures 3-121 and 3-122, #233: a waypoint of FPL 0 is drawn and labeled once, by the flight plan, as
            //drawAirports does for airports. By ICAO: the plan and the nearest list load their facilities separately
            if (legs.some(leg => ICAO.valueEquals(leg.wpt.icaoStruct, wpt.facility.icaoStruct))) {
                continue;
            }
            ctx.drawIcon(wpt.facility, icon);
            ctx.drawLabel(wpt.facility, wpt.facility.icaoStruct.ident);
        }
    }
```

- [ ] **Step 2: Rewrite the vehicles.** In the `it.each` of the VOR classes the route VOR ABC is no longer a `)` icon:
  `expect(vors).toEqual([...idents].sort());`, and its comment adds: "ABC, a VOR of FPL 0, is drawn by the route only
  (checked in the KLN 89 trainer, 2026-10-17, on its NAV 4 map; #233)". Replace the sibling with:

```ts
    // The sibling of the test below. 3-37: the route labels ABC once with the VORs off; checked in the KLN 89 trainer,
    // 2026-10-17 (#233): with the VORs on, a VOR of FPL 0 gets no VOR symbol, only the route's
    it('labels a VOR of FPL 0 once and draws no VOR symbol at it, with the VORs off and with VOR: H (3-37, checked in the KLN 89 trainer, 2026-10-17)', async () => {
        const off = await superNav5OnRoute();
        expect(labels(off.map.drawn).filter(l => l === 'ABC')).toEqual(['ABC']);
        await off.unit.panel.cursor('R');
        await off.unit.panel.inner('R', 1); // OFF to H
        await off.unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(500);

        expect(labels(off.map.drawn).filter(l => l === 'ABC')).toEqual(['ABC']);
        expect(off.map.drawn).not.toContain('icon ) ABC');
        expect(off.map.drawn).toContain('icon @ ABC');
    });
```

- [ ] **Step 3: Add the ICAO test and the NDB characterization** after the pin:

```ts
    // #233: the plan and the nearest list can hold different objects for the same facility (they are loaded at
    // different times), so the plan's VOR is found by its ICAO. Here the plan holds a copy of ABC
    it('labels a VOR of FPL 0 once when the plan holds another object for it (#233)', async () => {
        const {unit, map} = await superNav5OnRoute({storage: {superNav5Vor: 1}});
        const leg = unit.props.memory.fplPage.flightplans[0].getLegs().find(l => l.wpt.icaoStruct.ident === 'ABC')!;
        leg.wpt = {...leg.wpt};
        await vi.advanceTimersByTimeAsync(500);

        expect(labels(map.drawn).filter(l => l === 'ABC')).toEqual(['ABC']);
    });

    // 3-37 shows a route VOR only; an NDB of FPL 0 is drawn once by analogy (#233). No trainer drew one
    it('labels an NDB of FPL 0 once with the NDBs on (characterization, #233)', async () => {
        const w = world();
        const map = recordMap({KAAA: w.kaaa, AB: w.ab, KBBB: w.kbbb});
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
            storage: {...savedFlightplan(0, [w.kaaa, w.ab, w.kbbb]), superNav5Ndb: true},
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await showSuperNav5(unit);

        expect(labels(map.drawn).filter(l => l === 'AB')).toEqual(['AB']);
        expect(map.drawn).not.toContain('icon ( AB');
    });
```

  If the NDB test does not reach Super NAV 5 with AB in the nearest list, check `world()`: AB lies 0.05° N, 0.15° E of
  KAAA, which is inside the NDB nearest radius. The characterization must not sit in a describe whose title cites a
  page: if the surrounding describe is `Super NAV 5 page`, give it its own `describe('Super NAV 5 page (characterization)
  …')` block or put it into the existing characterization describe at about :60.

- [ ] **Step 4: Drop `.fails` from the pin**, run the file, then `npm test`, `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 5: Commit** `fixes #233 draw a VOR or NDB of FPL 0 once on Super NAV 5, by the flight plan`

**Conditions → tests:** the skip → the pin and the sibling; ICAO instead of identity → the copy test; the NDB call
gets `legs` → the NDB characterization.

```json:metadata
{"files": ["kln90b/pages/left/SuperNav5Page.tsx", "test/render/pages/left/SuperNav5Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/SuperNav5Page.test.ts && npm test", "acceptanceCriteria": ["the #233 pin passes as a plain test", "the VOR class tests and the sibling expect no VOR symbol at ABC", "the copy test holds the ICAO comparison", "the NDB of FPL 0 is labeled once and has no NDB symbol"], "modelTier": "standard"}
```

---

### Task 5: One map range list, from the AVsoftech trainer (#236)

**Goal:** NAV 5, the Super NAV 5 range selector and Super NAV 5's AUTO use one list, 1 2 3 5 7 10 15 20 30 40 60 80
120 160 240 320 480 640 1000 NM, and a saved range that is not in it becomes 40.

**Files:**
- Create: `kln90b/data/MapRanges.ts`
- Modify: `kln90b/pages/left/Nav5Page.tsx:21,41,237-239`, `kln90b/pages/left/SuperNav5Page.tsx:38,225`,
  `kln90b/controls/selects/SuperNav5RangeSelector.tsx:6,12-24`
- Test: `test/render/pages/left/Nav5Page.test.ts` (about :205), `test/render/pages/left/SuperNav5Page.test.ts` (about
  :97-115 and the `Super NAV 5 AUTO scale` describe), `test/render/controls/selects/SuperNav5RangeSelector.test.ts`
  (its header comment names the list as a characterization of #236)

**Acceptance Criteria:**
- [ ] The two range characterizations step through the new list.
- [ ] A saved `nav5MapRange` 25 shows `40` on NAV 5 and is saved as 40; a saved `superNav5MapRange` 100 shows `40` on
  Super NAV 5 and is saved as 40.
- [ ] AUTO picks 7 NM for a Direct To waypoint 6.5 NM north.
- [ ] The setting keys and their meaning are unchanged (public contract).

**Verify:** `npx vitest run test/render/pages/left/Nav5Page.test.ts test/render/pages/left/SuperNav5Page.test.ts test/render/controls/selects/SuperNav5RangeSelector.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Create `kln90b/data/MapRanges.ts`:**

```ts
/**
 * The map scales of NAV 5 and Super NAV 5 in NM. 3-35 gives only the end points, 1 and 1000 NM; the steps between them
 * are those of the AVsoftech KLN 90B trainer, which the maintainer adopted (#236). Figure 6-15 shows the 7 NM scale.
 */
export const MAP_RANGES: readonly number[] = [1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 60, 80, 120, 160, 240, 320, 480, 640, 1000];

/** The default of the settings nav5MapRange and superNav5MapRange (KLN90BUserSettings) */
export const DEFAULT_MAP_RANGE = 40;

/**
 * #236: a range saved by a version with another list (25 or 100 NM) is not in MAP_RANGES and becomes the default, so
 * that the field shows a value and the map is drawn at the scale it shows
 */
export function knownMapRange(range: number): number {
    return MAP_RANGES.includes(range) ? range : DEFAULT_MAP_RANGE;
}
```

- [ ] **Step 2: Use it.**
  - `Nav5Page`: `const RANGES = MAP_RANGES.map(r => r.toString().padStart(4, " "));`; in the constructor, before the
    children: `this.rangeSetting.set(knownMapRange(this.rangeSetting.get())); //#236`.
  - `SuperNav5RangeSelector`: `const RANGES = ["AUTO", ...MAP_RANGES.map(r => r.toString().padEnd(4, " "))];`; in
    `build`, before `new`: `if (rangeSetting.get() !== 0) { rangeSetting.set(knownMapRange(rangeSetting.get())); //#236 }`.
  - `SuperNav5Page`: drop its `RANGES` and use `MAP_RANGES` in `calculateAutoRange` (`MAP_RANGES.find((r) => r >=
    distance) ?? 1000`).
  - Remove the three "I have no idea, which ranges the device supports" comments.

- [ ] **Step 3: Update the characterizations.** Their comments say the list is the AVsoftech trainer's as the
  maintainer reported it on #236 (unreliable trainer; 3-35 gives the end points). Expected lists:
  - Super NAV 5 (21 reads): `'AUTO', '1', '2', '3', '5', '7', '10', '15', '20', '30', '40', '60', '80', '120', '160',
    '240', '320', '480', '640', '1000', 'AUTO'`.
  - NAV 5 (20 reads): `'1', '2', '3', '5', '7', '10', '15', '20', '30', '40', '60', '80', '120', '160', '240', '320',
    '480', '640', '1000', '1'`.
  Update the header comment of `SuperNav5RangeSelector.test.ts` and the comment above the AUTO describe ("The list
  between them is not known") to say the list is now the trainer's.

- [ ] **Step 4: Add the tests.** In `Nav5Page.test.ts` (with the characterization's helper `nav5OnRoute`):

```ts
    // #236, the maintainer's ruling: a saved range that is not in the list (an earlier version offered 25 and 100 NM)
    // loads as the default, 40 NM, and is saved so
    it('loads a saved range of 25 NM, which the list does not have, as 40 NM (#236)', async () => {
        const {unit} = await nav5OnRoute({storage: {nav5MapRange: 25}});

        expect(Screen.read().rows('L')[5]).toBe('N^       40'); // today: 'N^       25'
        await vi.advanceTimersByTimeAsync(2000);
        expect(storedSetting(unit, 'nav5MapRange')).toBe(40);
    });
```

  (the row was read from a probe: north up, the range right-aligned). In `SuperNav5Page.test.ts`, the same for Super NAV 5:

```ts
    // #236, the maintainer's ruling: a saved range that is not in the list loads as 40 NM
    it('loads a saved range of 100 NM, which the list does not have, as 40 NM (#236)', async () => {
        const {unit} = await superNav5OnRoute({storage: {superNav5MapRange: 100}});

        expect(SuperNav5.read().range.trim()).toBe('40');
        await vi.advanceTimersByTimeAsync(2000);
        expect(storedSetting(unit, 'superNav5MapRange')).toBe(40);
    });
```

  and in the `Super NAV 5 AUTO scale` describe:

```ts
    // 3-36: AUTO takes the smallest scale that shows the Direct To waypoint; figure 6-15 shows the 7 NM scale, which the
    // waypoint 6.5 NM north needs (without it, 10)
    it('takes the 7 NM scale for a Direct To waypoint 6.5 NM away (3-36, figure 6-15)', async () => {
        const dct = fix('AAAE', 0, 6.5);
        const unit = await bootUnit({facilities: [dct], position: P, storage: {superNav5MapRange: 0}});
        await settle(unit);
        await unit.panel.directTo('AAAE', {waitMs: 2000});
        await showSuperNav5(unit);

        expect(SuperNav5.read().range.trim()).toBe('7');
    });
```

- [ ] **Step 5: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Vehicles measured by the
  inventory: only the two characterizations.

- [ ] **Step 6: Commit** `fixes #236 offer the map scales of the AVsoftech trainer on NAV 5 and Super NAV 5, and load a saved scale that is not in the list as 40 NM`

**Conditions → tests:** the NAV 5 list → its characterization; the selector list → its characterization; AUTO's list →
the 7 NM test; `knownMapRange` in Nav5Page → the 25 NM test; in the selector's `build` → the 100 NM test; the `!== 0`
guard (AUTO stays AUTO) → the existing AUTO tests (`storage: {superNav5MapRange: 0}`; dropping the guard turns 0 into
40).

```json:metadata
{"files": ["kln90b/data/MapRanges.ts", "kln90b/pages/left/Nav5Page.tsx", "kln90b/pages/left/SuperNav5Page.tsx", "kln90b/controls/selects/SuperNav5RangeSelector.tsx", "test/render/pages/left/Nav5Page.test.ts", "test/render/pages/left/SuperNav5Page.test.ts", "test/render/controls/selects/SuperNav5RangeSelector.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/Nav5Page.test.ts test/render/pages/left/SuperNav5Page.test.ts test/render/controls/selects/SuperNav5RangeSelector.test.ts && npm test", "acceptanceCriteria": ["both range characterizations step through the new list", "saved 25 (NAV 5) and 100 (Super NAV 5) show and save 40", "AUTO picks 7 NM for a waypoint 6.5 NM away", "setting keys unchanged"], "modelTier": "standard"}
```

---

### Task 6: The Super NAV 5 msg prompt stays inverse once read (#326)

**Goal:** Once every message is read and one remains, the Super NAV 5 prompt shows `msg` steady in inverse video, as
the status line does.

**Files:**
- Modify: `kln90b/controls/SuperNav5Left.tsx:82-84`
- Test: `test/render/controls/SuperNav5Left.test.ts` (the `Super NAV 5 message prompt (3-16, 3-36)` describe)

**Acceptance Criteria:**
- [ ] With the lasting message `ADJ NAV IND CRS TO 046°` read, the map prompt reads `msg III` on every display tick of
  two seconds.
- [ ] The unread (flashing) and no-message tests stay green.

**Verify:** `npx vitest run test/render/controls/SuperNav5Left.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the test** in the message prompt describe (add the imports `standardRoute` is already there;
  `courseDeg` from `../../harness/flight/geo`, `messages` from `../../harness/readers`):

```ts
    // 3-16: a message whose condition needs action keeps the prompt on, not flashing, once it is read; 3-36 puts the same
    // prompt on the map. The condition is a wrong external course, as in the status line test (StatusLine.test.ts)
    it('keeps msg steady in inverse video once read while the condition stays (3-16, 3-36)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 4});
        unit.env.sim.set('Nav OBS:1', 'degrees', courseDeg(kaaa, abc) - 4 + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 10 s in which the message shows whatever the course is
        await unit.panel.readMessages();
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS TO 046°']); // Preconditions
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
        await showSuperNav5(unit);

        const [first, second] = await mapPromptCycles();
        expect(new Set([...first, ...second])).toEqual(new Set(['msg III']));
    });
```

- [ ] **Step 2: Run it to see it fail** (`msg ...`).

- [ ] **Step 3: Implement** the read branch:

```ts
            } else {
                //3-16, #326: once read, the prompt stays on in inverse video without flashing, as on the status line
                this.msgRef.instance.classList.add("inverted");
                this.msgRef.instance.classList.remove("inverted-blink");
            }
```

- [ ] **Step 4: Check the second condition.** The `remove("inverted-blink")` matters only when Super NAV 5 was shown
  while the message was unread. Try a second test: show Super NAV 5 first (unread, flashing), read the messages with
  `readMessages()` (the MSG page opens over Super NAV 5 and closes), then expect `msg III` on every tick. Run it with
  the `remove` dropped. If it does not turn red reliably (the last tick before MSG decides), drop the extra test and
  say in the report that this condition stays untested.

- [ ] **Step 5: Run the file, then `npm test`, `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 6: Commit** `fixes #326 keep the Super NAV 5 msg prompt steady in inverse video once every message is read`

**Conditions → tests:** `add("inverted")` → the new test; `remove("inverted-blink")` → Step 4.

```json:metadata
{"files": ["kln90b/controls/SuperNav5Left.tsx", "test/render/controls/SuperNav5Left.test.ts"], "verifyCommand": "npx vitest run test/render/controls/SuperNav5Left.test.ts && npm test", "acceptanceCriteria": ["the read prompt reads msg III on every tick", "the unread and no-message tests stay green"], "modelTier": "mechanical"}
```

---

### Task 7: The Super NAV 5 mode row shows the OBS modes without a colon (#321)

**Goal:** `SuperNav5Left.getModeString` shows `ARM241` like `ENR241`: no colon and no space in either OBS mode.

**Files:**
- Modify: `kln90b/controls/SuperNav5Left.tsx:108`
- Test: `test/render/controls/SuperNav5Left.test.ts` (the `Super NAV 5 mode row (5-32)` describe at about :56-104)

**Acceptance Criteria:**
- [ ] A spec test: in the approach-arm OBS mode with the course from the external indicator (`Nav OBS:1` 180), the row
  reads `ARM180` (6-12, 6-14, figures 6-20 and 6-22).
- [ ] The measured vehicle `shows ARM: and the OBS course in the approach-arm OBS mode (5-32)` (NO_OBS) becomes a
  characterization of `ARM180`, outside the `(5-32)` describe.
- [ ] The #321 pin becomes a characterization of `ENR051` (the AVsoftech trainer, unreliable; by analogy with ARM).
- [ ] `StatusLine` keeps `enr:`/`arm:` (its tests stay green).

**Verify:** `npx vitest run test/render/controls/SuperNav5Left.test.ts test/render/controls/StatusLine.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the spec test** in a new describe after the `(5-32)` one:

```ts
// 6-12 and 6-14, figures 6-20 and 6-22: Super NAV 5 in the approach-arm OBS mode with the course set on the external
// indicator shows ARM and the course with no colon and no space (the 5-32 table is the status line's form)
describe('Super NAV 5 mode row in the OBS modes (6-12, 6-14)', () => {
    it('shows ARM and the course without a colon in the approach-arm OBS mode (6-12, 6-14, figures 6-20 and 6-22)', async () => {
        const {unit} = await armed();
        unit.env.sim.set('Nav OBS:1', 'degrees', 180); // the final course of approachWorld(), magvar 0
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${ARM}180`);
    });
});
```

  `armed()` boots with the default OBS source (`Input.ObsSource` 1), so the course comes from `Nav OBS:1`. Check the
  precondition that the unit is in ARM_OBS (`unit.props.memory.navPage.navmode`); if MOD 2 + ENT does not enter it with
  an external source, find the path the unit takes with an external OBS (5-34) and say so in the report.

- [ ] **Step 2: Move the vehicle and the pin** into a describe `Super NAV 5 mode row in the OBS modes (characterization)`:

```ts
    // The maintainer's ruling (#321): the row has no colon in either OBS mode, also where the course can be entered on
    // the unit (NO_OBS), a case no figure shows
    it('characterization: shows ARM and the course without a colon without an OBS input (#321)', async () => {
        const {unit} = await armed(NO_OBS);
        await unit.panel.obsMode();
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[2]).toBe(`${ARM}180`);
    });

    // The AVsoftech trainer (unreliable) shows ENR300 in the enroute OBS mode; by analogy with figures 6-20 and 6-22
    // (#321, which expected ENR:)
    it('characterization: shows ENR and the course without a colon or a space in the enroute OBS mode (#321)', async () => {
        const {unit} = await enrouteObs();

        expect(SuperNav5.read().left[2]).toBe(`${ENR}051`);
    });
```

  Delete the old `it.fails` pin and the old ARM spec test from the `(5-32)` describe. The sibling `shows ENR and the OBS
  course in the enroute OBS mode (sibling of #321) (5-32)` stays as it is (titles are kept).

- [ ] **Step 3: Run to see the spec test and the ARM characterization fail** (`Í:180`).

- [ ] **Step 4: Implement:** `` return `Í${format(roundBearing(this.props.memory.navPage.obsMag), "000")}`; `` with the
  comment `//6-12, 6-14 (figures 6-20, 6-22): no colon on Super NAV 5, unlike the status line (#321)`; add the same
  comment reference to the ENR case.

- [ ] **Step 5: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 6: Commit** `fixes #321 show both OBS modes on the Super NAV 5 mode row without a colon (ARM180, figures 6-20 and 6-22); the issue's expected ENR:050 was wrong`

**Conditions → tests:** the ARM colon removed → the spec test and the ARM characterization.

```json:metadata
{"files": ["kln90b/controls/SuperNav5Left.tsx", "test/render/controls/SuperNav5Left.test.ts"], "verifyCommand": "npx vitest run test/render/controls/SuperNav5Left.test.ts test/render/controls/StatusLine.test.ts && npm test", "acceptanceCriteria": ["ARM180 spec test with the external OBS input", "the NO_OBS ARM test and the #321 pin are characterizations of ARM180 and ENR051 outside the (5-32) describe", "the status line keeps its colons"], "modelTier": "mechanical"}
```

---

### Task 8: The Super NAV 5 OBS field shows a colon where the course can be entered (#396)

**Goal:** On Super NAV 5 (field 2 on DTK, OBS mode) the course shows as `OBS:241` without the degree sign where
`canObsBeEntered()` holds, and as `OBS241°` otherwise; NAV 3 is unchanged.

**Files:**
- Modify: `kln90b/controls/selects/ObsDtkElement.tsx` (constructor, `getDisplayValue`, `canObsBeEntered` becomes
  public)
- Modify: `kln90b/controls/selects/SuperNav5Field2Selector.tsx` (constructor, the DTK case of `tick`)
- Test: `test/render/controls/SuperNav5Left.test.ts`, `test/render/pages/left/SuperNav5Page.test.ts` (the `Super NAV 5
  OBS course` describe at about :570, measured vehicles)

**Acceptance Criteria:**
- [ ] In the approach-arm OBS mode with the external OBS input, field 2 reads `Ù180°` (spec: 5-35, 6-12, 6-14).
- [ ] Without an OBS input, field 2 reads `Ù:051` (characterization: 5-35 note and the cell count, #396).
- [ ] The two `Super NAV 5 OBS course` tests assert the course digits only.
- [ ] NAV 3's `shows OBS: with the course in OBS mode without an external indicator (3-32, 5-35, 5-36)` stays green.

**Verify:** `npx vitest run test/render/controls/SuperNav5Left.test.ts test/render/pages/left/SuperNav5Page.test.ts test/render/pages/left/Nav3Page.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the tests** in `SuperNav5Left.test.ts`, a describe `Super NAV 5 OBS field (5-35, 6-12, 6-14)` and
  one `Super NAV 5 OBS field (characterization)`:

```ts
// 5-35: a colon after OBS means the course can be entered on the unit; figures 6-20 and 6-22 (6-12, 6-14) show the
// field where the course is set on the external indicator: OBS, the course and its degree sign, no colon
describe('Super NAV 5 OBS field (5-35, 6-12, 6-14)', () => {
    // The figures' case: the approach-arm OBS mode with the course from the external indicator (armed() keeps the
    // default OBS source, Nav OBS:1), as in the mode row test of Task 7
    it('shows OBS, the course and its degree sign without a colon where the course comes from the external indicator (5-35, 6-12, 6-14)', async () => {
        const {unit} = await armed();
        unit.env.sim.set('Nav OBS:1', 'degrees', 180);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        await showSuperNav5(unit);

        expect(SuperNav5.read().left[5]).toBe('Ù180°');
    });
});

// The maintainer's reading of 5-35 (#396): where the course can be entered, the colon follows OBS; the six cells of the
// column leave no room for the degree sign then. No figure shows this case
describe('Super NAV 5 OBS field (characterization)', () => {
    it('characterization: shows OBS: and the course without a degree sign where the course can be entered (#396)', async () => {
        const {unit} = await enrouteObs(); // NO_OBS
        await vi.advanceTimersByTimeAsync(1000);

        expect(SuperNav5.read().left[5]).toBe('Ù:051');
    });
});
```

  Check that `left[5]` is field 2 with the default `superNav5Field2` (DTK); the existing `onObsCourse` in
  `SuperNav5Page.test.ts` reads it there.

- [ ] **Step 2: Run to see the characterization fail** (`Ù051°`); the spec test passes today (it holds the other
  branch).

- [ ] **Step 3: Implement.** `ObsDtkElement`:

```ts
    /**
     * @param withoutDegreeWhenEditable Super NAV 5 (#396): where the course can be entered, the colon after OBS takes the
     * cell of the degree sign
     */
    constructor(private readonly planeSettings: KLN90PlaneSettings,
                private readonly sensors: Sensors,
                private readonly navState: NavPageState,
                private readonly modeController: ModeController,
                private readonly withoutDegreeWhenEditable: boolean = false) {
    }
```

```ts
    private getDisplayValue(): string {
        const dtk = this.modeController.getDtkOrObsMagnetic();
        const degree = this.withoutDegreeWhenEditable && this.canObsBeEntered() ? "" : "°";
        return dtk === null ? `---${degree}` : `${format(roundBearing(dtk), "000")}${degree}`;
    }
```

  and `public canObsBeEntered()`. `SuperNav5Field2Selector`: `new ObsDtkElement(planeSettings, sensors, state,
  modeController, true)`, and the DTK case:

```ts
                case SuperNav5Field2.DTK:
                    //4-9; 5-35, #396: the colon after OBS says the course can be entered on the unit
                    if (this.modeController.isObsModeActive()) {
                        this.ref.instance.textContent = this.children.get("obsdtk").canObsBeEntered() ? "Ù:" : "Ù";
                    } else {
                        this.ref.instance.textContent = "Ó";
                    }
                    break;
```

- [ ] **Step 4: Update the vehicles** in `SuperNav5Page.test.ts` `Super NAV 5 OBS course`: add

```ts
/** The OBS course of field 2 without its label, colon and degree sign; the form of the field is #396's (SuperNav5Left.test.ts) */
const obsCourse = () => SuperNav5.read().left[5].replace(/^Ù:?/, '').replace('°', '');
```

  and assert `obsCourse()` `'051'`, `'050'`, `'052'`, and `focusedLeft().map(s => s.replace('°', ''))` `['051']`.

- [ ] **Step 5: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 6: Commit** `fixes #396 show OBS: without the degree sign on Super NAV 5 where the course can be entered on the unit`

**Conditions → tests:** the colon from `canObsBeEntered` → the spec test (always a colon) and the characterization
(never one); `withoutDegreeWhenEditable` → the characterization; the option off for NAV 3 → NAV 3's `shows OBS: with
the course in OBS mode without an external indicator (3-32, 5-35, 5-36)`. The `---` form without a course has no
reachable case (OBS mode needs an active waypoint); say so in the report.

```json:metadata
{"files": ["kln90b/controls/selects/ObsDtkElement.tsx", "kln90b/controls/selects/SuperNav5Field2Selector.tsx", "test/render/controls/SuperNav5Left.test.ts", "test/render/pages/left/SuperNav5Page.test.ts"], "verifyCommand": "npx vitest run test/render/controls/SuperNav5Left.test.ts test/render/pages/left/SuperNav5Page.test.ts test/render/pages/left/Nav3Page.test.ts && npm test", "acceptanceCriteria": ["armed OBS with the external input: field 2 reads U180 with degree", "no OBS input: field 2 reads U:051", "the two OBS course vehicles assert digits only", "NAV 3 OBS test stays green"], "modelTier": "standard"}
```

---

### Task 9: NAV 3 shows the cross track below 1 NM in hundredths (#231)

**Goal:** NAV 3 gives the cross track the four cells after `FLY L`/`FLY R`: `0.xx` below 1 NM (`FLY R0.09nm`), and the
blank plus today's three-cell form otherwise.

**Files:**
- Modify: `kln90b/controls/displays/DistanceDisplay.tsx` (constructor, `formatDistance`)
- Modify: `kln90b/pages/left/Nav3Page.tsx:55,71`
- Test: `test/render/pages/left/Nav3Page.test.ts` (:69-89, measured vehicles), `test/render/controls/displays/DistanceDisplay.test.ts`

**Acceptance Criteria:**
- [ ] 0.09 NM left of the course reads `FLY R0.09nm` (the photo); 0.3 NM right reads `FLY L0.30nm`.
- [ ] From 1 NM the row is unchanged: `FLY L 2.7nm`, `FLY L  10nm` and the #226 tests stay green.
- [ ] Unit tests of the option: `0.09`, `0.99` at 0.994, ` 1.0` at 0.996, ` 9.9`, `  12`, ` -.-`.
- [ ] The two NAV 3 characterizations take the new form; the #231 one becomes a test of the photo.

**Verify:** `npx vitest run test/render/pages/left/Nav3Page.test.ts test/render/controls/displays/DistanceDisplay.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the unit tests** in `DistanceDisplay.test.ts`:

```ts
/** The cells of the NAV 3 cross track (four cells, hundredths below 1 NM, #231) */
const shownXtk = (distance: number | null): string => mountedText(new DistanceDisplay(4, distance, false, true));

// #231, the maintainer's ruling after a photo of a real unit (TCAS,_GPS_and_Altitude_Alerter_(250504914).jpg, FLY
// R0.09NM): below 1 NM the cross track takes the blank after L or R and shows hundredths with a zero in front; from
// 1 NM it keeps the blank and the three-cell form of 3-32
describe('DistanceDisplay, the NAV 3 cross track (#231)', () => {
    it('shows hundredths below 1 NM in four cells (#231)', () => {
        expect(shownXtk(0.09)).toBe('0.09');
        expect(shownXtk(0.994)).toBe('0.99');
    });

    it('shows a tenth after a blank from 1 NM, also where hundredths round up to 1 (#231)', () => {
        expect(shownXtk(0.996)).toBe(' 1.0');
        expect(shownXtk(9.94)).toBe(' 9.9');
    });

    it('shows whole NM from 10 NM and dashes without a value after the blank (#231)', () => {
        expect(shownXtk(12.3)).toBe('  12');
        expect(shownXtk(null)).toBe(' -.-');
    });
});
```

- [ ] **Step 2: Run to see them fail** (the fourth argument does not exist yet: tsc error or the 4-cell forms).

- [ ] **Step 3: Implement** in `DistanceDisplay` (add `@param hundredthsBelowOne` to the doc comment, and `4: 3-32 XTK
  NAV 3 page with hundredths below 1 NM (#231)` to the examples):

```ts
    constructor(public length: number, public distance: NauticalMiles | null = null, private readonly leadingZero: boolean = false,
                private readonly hundredthsBelowOne: boolean = false) {
    }
```

```ts
    private formatDistance(): string {
        //#231: the NAV 3 cross track uses the blank in front of its three cells for hundredths below 1 NM
        const cells = this.hundredthsBelowOne ? this.length - 1 : this.length;
        if (this.distance === null) {
            return ".-".padStart(cells, "-").padStart(this.length, " ");
        }
        if (this.hundredthsBelowOne && Math.round(this.distance * 100) / 100 < 1) {
            return format(this.distance, "0.00");
        }

        const cutoff = 10 ** (cells - 2);
        //Compare the rounded value, 99.97 is shown as 100.0 otherwise, one cell too long
        if (Math.round(this.distance * 10) / 10 >= cutoff) { //Number is too large for decimals
            return format(this.distance, "00").padStart(this.length, " ");
        } else {
            return format(this.distance, this.leadingZero ? "00.0" : "0.0").padStart(this.length, " ");
        }
    }
```

  `Nav3Page`: `flyDist: new DistanceDisplay(4, ..., false, true)` and the row `FLY {flyDir}{flyDist}nm` (the blank
  between them goes into the display).

- [ ] **Step 4: Update the NAV 3 tests.** The whole-page characterization's row 3 becomes `'FLY L0.30nm'`. Replace the
  #231 characterization with:

```ts
describe('NAV 3 page, the cross track below 1 NM (#231)', () => {
    // A photo of a real unit (TCAS,_GPS_and_Altitude_Alerter_(250504914).jpg) shows FLY R0.09NM: hundredths with a zero
    // in front and no blank after R. Figure 3-105 (3-32) shows tenths; the maintainer ruled for the photo (#231)
    it('reads FLY R0.09nm 0.09 NM left of the course (#231)', async () => {
        await nav3OnLeg(-0.09);

        expect(Screen.read().rows('L')[3]).toBe('FLY R0.09nm');
    });

    it('reads FLY L0.30nm 0.3 NM right of the course (#231)', async () => {
        await nav3OnLeg(0.3);

        expect(Screen.read().rows('L')[3]).toBe('FLY L0.30nm');
    });
});
```

  Update the comment of `DistanceDisplay.test.ts` at about :63-66 (the #226 test) that names #231. The three-cell spec
  tests of `DistanceDisplay` stay (other users, and the class default).

- [ ] **Step 5: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Measured vehicles: exactly the
  two NAV 3 characterizations.

- [ ] **Step 6: Commit** `fixes #231 show the NAV 3 cross track below 1 NM in hundredths, as a photo of a real unit shows`

**Conditions → tests:** `cells` for the cutoff → `  12` (with `length` the cutoff would be 100: `12.3`); the null
padding → ` -.-`; the hundredths branch → `0.09`; the rounding to hundredths → `0.996` gives ` 1.0` (without it,
`1.00`); NAV 3's flag → the two NAV 3 tests; the template without the blank → the NAV 3 tests (`FLY L 0.30nm`
otherwise).

```json:metadata
{"files": ["kln90b/controls/displays/DistanceDisplay.tsx", "kln90b/pages/left/Nav3Page.tsx", "test/render/pages/left/Nav3Page.test.ts", "test/render/controls/displays/DistanceDisplay.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/Nav3Page.test.ts test/render/controls/displays/DistanceDisplay.test.ts && npm test", "acceptanceCriteria": ["FLY R0.09nm at 0.09 NM left and FLY L0.30nm at 0.3 NM right", "rows from 1 NM unchanged", "the option's unit tests 0.09, 0.99, 1.0, 9.9, 12, -.-", "the two NAV 3 characterizations updated"], "modelTier": "standard"}
```

---

### Task 10: A cross track or ETE of exactly 0 is a value (#393)

**Goal:** NAV 3 shows a cross track of exactly 0 as `0.00`, and D/T 2 shows an ETA for an ETE of exactly 0.

**Files:**
- Modify: `kln90b/pages/left/Nav3Page.tsx:55,95`, `kln90b/pages/right/Dt2OtherPage.tsx:60,109`
- Test: `test/render/pages/left/Nav3Page.test.ts`, `test/render/pages/right/Dt2Page.test.ts`

**Acceptance Criteria:**
- [ ] With `xtkToActive` exactly 0, NAV 3 reads `FLY L0.00nm`.
- [ ] With `eteToActive` exactly 0, D/T 2 beside NAV 2 shows the current time as the ETA of the active waypoint.

**Verify:** `npx vitest run test/render/pages/left/Nav3Page.test.ts test/render/pages/right/Dt2Page.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the tests.** An exact 0 is rare in flight (the start of a Direct To), so the tests pin the value
  on the nav state; the 1 Hz calculation writes are ignored:

```ts
/** Holds a NavPageState field at a value: the calculation's writes are ignored */
function hold<K extends keyof NavPageState>(state: NavPageState, key: K, value: NavPageState[K]): void {
    Object.defineProperty(state, key, {get: () => value, set: () => undefined, configurable: true});
}
```

  (import `NavPageState` from `../../../../kln90b/data/VolatileMemory`). NAV 3:

```ts
    // #393: 0 is a cross track, not a missing one. The form is #231's; the AVsoftech trainer (unreliable) shows FLY L0.00NM
    // on the course
    it('characterization: reads FLY L0.00nm with a cross track of exactly 0 (#393)', async () => {
        const unit = await nav3OnLeg(0.3);
        hold(unit.props.memory.navPage, 'xtkToActive', 0);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[3]).toBe('FLY L0.00nm');
    });
```

  D/T 2 (with the file's `show` helper; the clock starts at 12:00:00 UTC):

```ts
    // #393: an ETE of 0 is a value: the ETA is now
    it('characterization: shows the current time as the ETA of an ETE of exactly 0 (#393)', async () => {
        const unit = await bootOnDtWorld();
        hold(unit.props.memory.navPage, 'eteToActive', 0);

        expect((await show(unit, 'NAV 2'))[2]).toBe('   12:00UTC');
    });
```

  If `12:00` is off by the boot time, read the expected time from the unit's clock the way `Dt2Page.test.ts` does
  elsewhere, never from the page under test.

- [ ] **Step 2: Run to see them fail** (`FLY L -.-nm`; the ETA row dashed).

- [ ] **Step 3: Implement:** `navState.xtkToActive !== null ? Math.abs(navState.xtkToActive) : null` (both sites,
  comment `//#393: 0 is a value`) and `navState.eteToActive !== null ? now.addSeconds(navState.eteToActive) : null` (both
  sites).

- [ ] **Step 4: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Measured: no other test changes.

- [ ] **Step 5: Commit** `fixes #393 show a cross track and an ETE of exactly 0 as values on NAV 3 and D/T 2`

**Conditions → tests:** NAV 3's constructor site and `redraw` site: the test reads after a display tick, which runs
`redraw`, so it holds the `redraw` site; the constructor site shows only until the first tick, so make the NAV 3 test
also check the first frame (hold the value before `selectPage('L', 'NAV 3')` in a second test) or say in the report
that the constructor site stays untested. D/T 2: the same for its two sites.

```json:metadata
{"files": ["kln90b/pages/left/Nav3Page.tsx", "kln90b/pages/right/Dt2OtherPage.tsx", "test/render/pages/left/Nav3Page.test.ts", "test/render/pages/right/Dt2Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/Nav3Page.test.ts test/render/pages/right/Dt2Page.test.ts && npm test", "acceptanceCriteria": ["NAV 3 reads FLY L0.00nm with xtkToActive exactly 0", "D/T 2 shows the current time as ETA with eteToActive exactly 0"], "modelTier": "mechanical"}
```

---

### Task 11: MSG with no message shows a blank page (#325)

**Goal:** A characterization test holds the blank MSG page the maintainer kept; no code change.

**Files:**
- Test: `test/render/controls/MessagePage.test.ts`

**Acceptance Criteria:**
- [ ] With every message read, MSG shows the MSG page with six blank rows.
- [ ] The commit is `references #325`.

**Verify:** `npx vitest run test/render/controls/MessagePage.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the test** (the file has `readAll` and `msgRows`):

```ts
// #325, the maintainer's ruling: with no message, MSG shows a blank page, as the AVsoftech trainer (unreliable) does;
// the KLN 89 trainer shows No Message there (docs/kln89-trainer-record.md, 2026-10-17)
describe('MSG page without a message (characterization)', () => {
    it('characterization: shows a blank page when every message has been read (#325)', async () => {
        const unit = await bootUnit();
        await readAll(unit);

        await unit.panel.msg();

        expect(unit.overlay()).toBeInstanceOf(MessagePage);
        expect(msgRows()).toEqual(['', '', '', '', '', '']);
    });
});
```

  (import `MessagePage` from `../../../kln90b/controls/MessagePage`).

- [ ] **Step 2: Run it** (it passes today), then `npm test`.

- [ ] **Step 3: Commit** `references #325 hold the blank MSG page without a message, as the maintainer ruled`

```json:metadata
{"files": ["test/render/controls/MessagePage.test.ts"], "verifyCommand": "npx vitest run test/render/controls/MessagePage.test.ts && npm test", "acceptanceCriteria": ["MSG with no message shows the MSG page with six blank rows", "commit message references #325"], "modelTier": "mechanical"}
```

---

### Task 12: The pulled right knob on Super NAV 5 (#394)

**Goal:** With an overlay shown, its own right cursor decides whether the pulled knob scans or acts on the field; on
Super NAV 5 a pull with the menu open closes the menu, the scan window hides while the menu is open, and a push with
the menu open does nothing.

**Files:**
- Modify: `kln90b/pages/MainPage.tsx` (the `EVT_R_SCAN_LEFT`/`EVT_R_SCAN_RIGHT` cases at about :508 and :544, a new
  `EVT_R_SCAN` case, a private helper; import `EVT_R_SCAN`)
- Modify: `kln90b/pages/left/SuperNav5Page.tsx` (a new `scanPulledChanged`, the `directTo` child's constructor call)
- Modify: `kln90b/controls/selects/SuperNav5DirectToSelector.tsx` (constructor, `tick`)
- Test: `test/render/pages/left/SuperNav5Page.test.ts`

**Acceptance Criteria:**
- [ ] Menu open (right CRSR), pull: the menu closes and the scan window shows `ABC   `.
- [ ] Pulled, CRSR: the menu opens and the scan window hides; the pulled inner knob changes the VOR field (OFF to H);
  CRSR again closes the menu and shows the scan window.
- [ ] Pulled with the menu open, push: the menu stays open with the cursor on; pull again: the menu closes and the
  window shows.
- [ ] The existing scan tests (`scans FPL 0 in the window of the pulled right inner knob (3-38)`, the Direct To from
  the window) stay green.

**Verify:** `npx vitest run test/render/pages/left/SuperNav5Page.test.ts test/render/pages/MainPage.test.ts` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the tests** in `SuperNav5Page.test.ts`, a new describe after the scan tests:

```ts
// #394: the maintainer's check on the KLN 89 trainer and the AVsoftech trainer, 2026-10-17 (docs/kln89-trainer-record.md):
// pulling the knob with the map menu open closes the menu and shows the scan window. The CRSR transitions and the push
// are the maintainer's ruling (#394). A cursor field takes the pulled knob like the pushed-in one (checked in the KLN 89
// trainer, 2026-10-17, on CAL 1)
describe('Super NAV 5 menu and the pulled right knob (#394)', () => {
    const menuValue = () => focusedRight().join('').trim();

    it('closes the menu and shows the scan window when the knob is pulled with the menu open (checked in the KLN 89 trainer, 2026-10-17, #394)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.cursor('R');
        expect(SuperNav5.read().right).not.toBeNull(); // Precondition

        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);

        expect(SuperNav5.read().right).toBeNull();
        expect(SuperNav5.read().directTo).toBe('ABC   ');
    });

    it('opens the menu with CRSR while pulled, and the pulled knob changes its field (#394)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.scan();
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(250);
        expect(SuperNav5.read().directTo).toBeNull();
        expect(menuValue()).toBe('OFF');

        await unit.panel.inner('R', 1);

        expect(menuValue()).toBe('H');
    });

    it('closes the menu again with CRSR while pulled and shows the scan window (#394)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.scan();
        await unit.panel.cursor('R');
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(250);

        expect(SuperNav5.read().right).toBeNull();
        expect(SuperNav5.read().directTo).toBe('ABC   ');
    });

    it('keeps the menu open when the knob is pushed in, and closes it when it is pulled again (#394)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.scan();
        await unit.panel.cursor('R');
        await unit.panel.scan(); // pushed in
        await vi.advanceTimersByTimeAsync(250);
        expect(SuperNav5.read().right).not.toBeNull();
        await unit.panel.inner('R', 1);
        expect(menuValue()).toBe('H'); // the cursor is still on the field

        await unit.panel.scan(); // pulled again
        await vi.advanceTimersByTimeAsync(250);

        expect(SuperNav5.read().right).toBeNull();
        expect(SuperNav5.read().directTo).not.toBeNull();
    });
});
```

  Check the first value of the menu with the default settings (`superNav5Vor` 0 = OFF) against the existing test
  `opens the menu on the VOR selection and closes it with the right cursor (3-37)`.

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement.** `MainPage`:

```ts
    /** The right cursor the pilot sees: the overlay's while one is shown, else the right page's (#394) */
    private shownRightCursorController(): CursorController {
        return this.overlayPageStack.isShown() ? this.getOverlayPage()!.rCursorController : this.getRightPage().getCursorController();
    }
```

  (use the type the overlay pages declare for `rCursorController`), and in `onInteractionEvent`:

```ts
            case EVT_R_SCAN: {
                //#394: Super NAV 5 closes its menu when the knob is pulled
                const overlay = this.getOverlayPage();
                if (overlay instanceof SuperNav5Page) {
                    overlay.scanPulledChanged();
                    return true;
                }
                return false;
            }
            case EVT_R_SCAN_LEFT:
                //#394: with an overlay shown, its own right cursor decides
                if (!this.shownRightCursorController().cursorActive) {
```

  (the same change in `EVT_R_SCAN_RIGHT`). `SuperNav5Page`:

```ts
    /**
     * #394, the maintainer's check on the KLN 89 trainer and the AVsoftech trainer (2026-10-17): pulling the right knob
     * while the menu is open closes the menu, and the scan window shows. Pushing it in changes nothing
     */
    public scanPulledChanged(): void {
        if (this.props.hardware.isScanPulled && this.rCursorController.cursorActive) {
            this.rCursorController.setCursorActive(false);
        }
    }
```

  and the child: `new SuperNav5DirectToSelector(..., this.props.sensors, () => this.rCursorController.cursorActive)`.
  `SuperNav5DirectToSelector` takes `private readonly isMenuOpen: () => boolean` as its last constructor parameter, and
  in `tick` the pulled branch shows the window only while the menu is closed:

```ts
        if (this.hardware.isScanPulled) {
            if (!this.isInitialized) {
                this.legs = this.flightplan.getLegs();
                this.idx = this.activeWpt.getActiveFplIdx();
                if (this.idx === -1 && this.legs.length > 0) {
                    this.idx = 0;
                }
                this.isInitialized = true;
            }
            //#394: the open menu takes the place of the scan window; the window keeps its waypoint
            if (this.isMenuOpen()) {
                this.ref.instance.classList.add("d-none");
            } else {
                this.ref.instance.classList.remove("d-none");
            }
```

  and the rest of the branch as it is.

- [ ] **Step 4: Run the file, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Measured: the `MainPage` scan
  change alone changes no existing test.

- [ ] **Step 5: Commit** `fixes #394 close the Super NAV 5 menu when the right knob is pulled, and let the pulled knob change the menu fields while the menu is open`

**Conditions → tests:** the `EVT_R_SCAN` case → the first test; `isScanPulled` in `scanPulledChanged` → the push test
(the menu would close on the push); `cursorActive` there → no reachable failure (closing a closed menu changes
nothing), say so; `shownRightCursorController` in `EVT_R_SCAN_RIGHT` → the second test (`H`); in `EVT_R_SCAN_LEFT` →
add a test that turns the pulled knob left on the menu (`OFF` to `TLH`, read from a probe); the window hidden while the menu is open → the second test (`directTo` null); shown again → the third
test.

```json:metadata
{"files": ["kln90b/pages/MainPage.tsx", "kln90b/pages/left/SuperNav5Page.tsx", "kln90b/controls/selects/SuperNav5DirectToSelector.tsx", "test/render/pages/left/SuperNav5Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/SuperNav5Page.test.ts test/render/pages/MainPage.test.ts && npm test", "acceptanceCriteria": ["a pull with the menu open closes it and shows the scan window on ABC", "CRSR while pulled opens the menu, hides the window, and the pulled knob changes the VOR field", "CRSR again closes the menu and shows the window", "a push with the menu open keeps it, a second pull closes it", "the existing scan tests stay green"], "modelTier": "frontier"}
```

---

## Close-out (controller)

- After every task: cherry-pick the reviewed commit onto `m9-display-pages`, run `npx tsc --noEmit` in the main
  checkout, and record the task state in the `.tasks.json`.
- A final review of the whole branch (label audit across files, vehicles in other files, a mutation pass of the
  conditions above).
- Report to the maintainer; merge locally into master only after approval; then delete `m9-display-pages` and the
  `worktree-agent-*` branches (`git branch -d`; ask before `-D` for branches whose pre-squash commits never reach master).
- The maintainer closes #325 as not planned; the `fixes #NN` commits close the others when the maintainer pushes.
