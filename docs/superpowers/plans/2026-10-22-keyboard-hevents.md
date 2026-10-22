# Keyboard Mode H Events and Cheap Keyboard Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two public H events that toggle keyboard mode per side (#83), and a typed `0` for blank cells plus `H`/`S` for
the runway surface (#109).

**Architecture:** `KLN90BCore.onInteractionEvent` catches the two new events. If that side's cursor is off, it first
sends the side's CRSR event to `PageManager`, then calls one `PageContainer.toggleKeyboard(side)` that shares its entry
code with the existing left-click handler. #109 changes `EditorField.keyboard` and overrides it on
`RunwaySurfaceEditorField`.

**Tech Stack:** TypeScript, MSFS Avionics Framework (FSComponent), Vitest (render stage, happy-dom).

**Spec:** `docs/superpowers/specs/2026-10-22-keyboard-hevents-design.md`

## Global Constraints

- H events are public contract: names exactly `KLN90B_LeftKeyboard_Toggle` and `KLN90B_RightKeyboard_Toggle`.
- One commit per issue: `fixes #83 …` and `fixes #109 …`, each with its tests and its README change. End each commit
  message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `target: es2017`; American English; no counts for growing collections in prose.
- Keyboard mode is the project's own feature (no manual page): tests citing no page are named `characterization:` or
  carry the issue number.
- Leaving keyboard mode stays as it is: Escape, right click, cursor off, power off.

## Review Focus

1. **The cursor already on:** the H event must not send CRSR (that would turn the cursor off); it only enters keyboard
   mode. Test in Task 1.
2. **The unit switched off:** the H event must not take the sim's keyboard (no display tick runs to give it back). Test
   in Task 1.
3. **The MSG page shown:** CRSR closes it and acts on the page beneath; keyboard mode then enters on that page. Test in
   Task 1.
4. **Ident and remark cells:** their charset starts with a blank *and* holds a `0`; a typed `0` must stay `0`, not the
   blank. Test in Task 2.
5. **Super NAV 5 (no status line):** the cursor may come on, keyboard mode must not. Test in Task 1.

---

### Task 1: Keyboard mode H events (#83)

**Files:**
- Modify: `kln90b/HEvents.ts` (two constants in a new `//KEYBOARD` block above `//External Devices`)
- Modify: `kln90b/controls/PageContainer.tsx` (shared entry code, `toggleKeyboard`, click handler uses it)
- Modify: `kln90b/pages/PageManager.ts` (pass-through)
- Modify: `kln90b/KLN90BCore.ts:188-230` (`onInteractionEvent`)
- Modify: `README.md` (Keyboard Mode section: one sentence naming the two H events)
- Test: `test/render/controls/PageContainer.test.ts` (new `describe('keyboard mode H events (#83)')`)

**Interfaces:**
- Produces: `EVT_L_KEYBOARD = "KLN90B_LeftKeyboard_Toggle"`, `EVT_R_KEYBOARD = "KLN90B_RightKeyboard_Toggle"`;
  `PageContainer.toggleKeyboard(side: 'LEFT' | 'RIGHT'): void`; `PageManager.toggleKeyboard(side: 'LEFT' | 'RIGHT'): void`.

- [ ] **Step 1: Write the failing tests** in the new describe block. Use `unit.panel.press(EVT_L_KEYBOARD)` and the
  file's existing `input()`, `key()`, `tick()` helpers. Do **not** call `input().focus()` in these tests: the code must
  focus the input itself.

```ts
it('characterization: with the cursor off, the H event turns the cursor on and enters keyboard mode (#83)', async () => {
    const unit = await bootUnit();
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.press(EVT_L_KEYBOARD);
    expect(Screen.read().status().left).toBe('KYBD');
    expect(document.activeElement).toBe(input());
    await key(75); // K
    expect(unit.panel.focused('L').text[0]).toBe('K');
});
it('characterization: with the cursor on, the H event enters keyboard mode and keeps the cursor on (#83)', ...);
    // emptyFpl0(), press → isLeftKeyboardActive true, status left 'KYBD'
it('characterization: pressed again, the H event leaves keyboard mode and the cursor stays on (#83)', ...);
    // press twice → isLeftKeyboardActive false, status left 'CRSR', activeElement not input()
it('characterization: the other side\'s H event moves keyboard mode across (#83)', ...);
    // emptyFpl0(), press L, press R → left false + status left 'CRSR'; right true + status right 'KYBD'
it('characterization: the H event closes the MSG page like CRSR and enters keyboard mode beneath (#83)', ...);
    // unit.panel.msg() (assert the MSG page is shown as a precondition), press R → right true, status right 'KYBD'
it('characterization: the H event does not enter keyboard mode on Super NAV 5 (#83)', ...);
    // showSuperNav5 as in the click test, press L → isLeftKeyboardActive false
it('characterization: the H event does nothing while the unit is off (#83)', ...);
    // unit.panel.powerOff(), press L → isLeftKeyboardActive false, activeElement not input(), unit.errors []
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run test/render/controls/PageContainer.test.ts`
Expected: the new tests fail (the event is unknown, nothing happens); the existing ones pass.

- [ ] **Step 3: Implement**
  - `HEvents.ts`: the two constants.
  - `PageContainer`: move the body of the click's entry (clear the value, leave the other side, set the flag,
    `Coherent.trigger('FOCUS_INPUT_FIELD', …)`, `Coherent.on('mousePressOutsideView', …)`) into one private method
    that also calls `this.keyboardRef.instance.focus()` (the spike showed this works in the sim). Both click branches
    call it; their conditions (cursor on, `hasStatusline()`, not already active, the cell region) stay.
    `toggleKeyboard(side)`: active on that side → `resetKeyboard()`; else if that side's cursor is on and
    `hasStatusline()` → enter; else nothing.
  - `KLN90BCore.onInteractionEvent`: after `hEventPublisher.dispatchHEvent`, for the two events: if the side's cursor
    is off (`pageManager.getCurrentPage().isLeftCursorActive()` / `isRightCursorActive()`), call
    `pageManager.onInteractionEvent(EVT_L_CURSOR / EVT_R_CURSOR)`; then `pageManager.toggleKeyboard(side)`; return
    without passing the toggle event to the pages. If the unit-off test fails, guard on power there.
  - `README.md`: one sentence in Keyboard Mode that the H events `KLN90B_LeftKeyboard_Toggle` and
    `KLN90B_RightKeyboard_Toggle` do the same for hardware such as a Stream Deck, turning the cursor on if needed, and
    leave keyboard mode when pressed again.

- [ ] **Step 4: Run the file, then everything**

Run: `npx vitest run test/render/controls/PageContainer.test.ts`, then `npx tsc --noEmit` and `npm test`
Expected: all pass; tsc clean.

- [ ] **Step 5: Commit** `fixes #83 add H events that toggle keyboard mode for the left and the right side`

### Task 2: A typed 0 for a blank cell, H and S for the runway surface (#109)

**Files:**
- Modify: `kln90b/controls/editors/EditorField.tsx` (`EditorField.keyboard`, `RunwaySurfaceEditorField`)
- Modify: `README.md` (Keyboard Mode mapping: the 0 and the H/S keys)
- Test: `test/render/controls/editors/EditorField.test.ts` (new), `NdbFreqEditor.test.ts`, `MagvarEditor.test.ts`,
  `RunwaySurfaceEditor.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.

- [ ] **Step 1: Write the failing tests**
  - `NdbFreqEditor.test.ts`: `it.fails('types a frequency below 1000 kHz with a leading 0 (#109)')` becomes `it(...)`;
    update its comment (the fix, not "today the 0 is refused").
  - `MagvarEditor.test.ts`, new describe `magnetic variation editor keyboard (#109)`:
    `it('types 09E as a variation of +9, the 0 taking the blank tens (#109)')`: `onSet2Magvar()`,
    `type('L', '09E')`, `ent()` → `userMagvar` is `9`, `line6().slice(7)` is `' 9°E'`, `unit.errors` `[]`.
  - `RunwaySurfaceEditor.test.ts`, new describe `runway surface editor keyboard (#109)`: for `[['H','HRD','H'],
    ['S','SFT','S']]`: `farmOnApt3()`, `cursorTo('R', '___')`, `type('R', key)` → `surface()` is the shown value;
    `ent()`, `cursor('R')`, advance 1000 ms → last letter of `storedSetting(unit, 'wpt0')` is the stored letter.
  - `EditorField.test.ts` (direct field tests, no unit boot):
    - `NumberEditorField.createWithBlankMax(1).keyboard('0')` → `true`, `value` `0`.
    - `new AlphabetEditorField().keyboard('0')` → `true`, `charset[value]` is `'0'` (Review Focus 4).
    - `new RemarkEditorField().keyboard('0')` → `charset[value]` is `'0'`.
    - `NumberEditorField.createWithMinMax(0, 1).keyboard('0')` → `charset[value]` is `'0'`.
    - `new RunwaySurfaceEditorField()`: `'H'` → `charset[value]` `'HRD'`; `'S'` → `'SFT'`; `'D'` → `false`.
    - `new MonthEditorField().keyboard('J')` → `false` (out of scope, stays refused).

- [ ] **Step 2: Run them and see the new ones fail**

Run: `npx vitest run test/render/controls/editors`
Expected: the NDB, magvar, runway surface and the blank/H/S field tests fail; the rest pass.

- [ ] **Step 3: Implement**
  - `EditorField.keyboard`: when the key is not an entry, the key is `'0'` and the first entry is all blanks, select
    entry 0. Only when `'0'` is not itself an entry, so ident and remark cells keep their `0`.
  - `RunwaySurfaceEditorField.keyboard`: `'H'` and `'S'` select the entry they start; other keys fall back to the base.
  - Comments cite #109 and say the keyboard is the project's own feature.
  - `README.md` mapping: a bullet that `0` also types a blank digit and `H`/`S` the runway surface.

- [ ] **Step 4: Run the folder, then everything**

Run: `npx vitest run test/render/controls/editors`, then `npx tsc --noEmit` and `npm test`
Expected: all pass; tsc clean.

- [ ] **Step 5: Commit** `fixes #109 type a 0 into a blank cell and H or S into the runway surface`
