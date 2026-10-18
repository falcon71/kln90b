# Power, hot swap, persistence and messages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone's issues (#92, #101, #125, #138, #141, #175, #187, #259, #330, #331, #350, #351, #353,
#397, #398, #399), one commit each (`fixes #NN`), plus one harness commit, on the branch `m10-power-persistence`.

**Architecture:** Three lanes that touch disjoint files run in parallel, and #141 runs last because its vehicles sit in
files of two lanes. Inside a lane the tasks run in order, each in a fresh worktree that fast-forwards to the
integration branch first, and each reviewed commit is cherry-picked onto `m10-power-persistence` at once. Lane H keeps
the hot swap state on `Hardware` and gates input and outputs on it, then fixes the EFB round trip; lane P decouples the
seeded harness from the number of user settings, then fixes remarks, the ALT alert persistence, the V1 longitudes and
the ALT page cursor; lane M fixes the persistent messages and the time entries.

**Tech Stack:** TypeScript (target es2017), MSFS avionics SDK (`@microsoft/msfs-sdk`), FSComponent JSX, Vitest (unit,
render with happy-dom, flight), `numerable` for formatting.

**Spec:** `docs/superpowers/specs/2026-10-18-power-hotswap-persistence-messages-design.md`. Where this plan differs
from the spec, the plan wins: it was built and measured task by task in scratch worktrees before it was written
(section "Measured deviations from the spec" below).

## Global Constraints

- **Worktree start.** Every task runs in a fresh worktree. First command: `git merge --ff-only m10-power-persistence`
  (agent worktrees start at master's HEAD). If `node_modules` is missing, create it as a junction to
  `E:\msfs\kln90b\node_modules` (PowerShell `New-Item -ItemType Junction`). Never remove a worktree yourself. If you
  must remove a junction, use `powershell -NoProfile -Command "(Get-Item -LiteralPath '<wt>\node_modules').Delete()"`,
  check that `<wt>\node_modules` is gone, and STOP if it is not. Never run `git worktree prune`. `git stash` writes the
  repository's shared stash: do not use it.
- **One commit per task**, message `fixes #NN <description>` (plain sentence, American English; Task 6 is a plain
  sentence without an issue), with the test and doc changes of that issue in the same commit, and the attribution
  trailer your own environment gives you. No push, no GitHub writes, no edits outside the worktree.
- **Before the commit:** `npm test` (the FULL suite), `npx tsc --noEmit` and `npm run build` all pass. `tsc` inside a
  junction worktree can report a false `registerInstrument` error: if it does, say so in the report; the controller
  runs `tsc` in the main checkout after the cherry-pick. Expected-fail pins of other issues stay expected-fail.
- **The code in this plan was measured.** Each task's code passed the full suite in a scratch branch on top of the
  tasks before it in its lane. Use it as given. If it does not apply or a test result differs from the plan (another
  lane's commit came in between), stop and report the difference before changing anything.
- **Suite totals** in the task sections are those of the lane's own scratch run (each lane measured from the
  branch base without the other lanes), so after the cherry-picks the absolute counts differ; what must hold is that
  only the tests the task names change.
- **Vehicles.** Before writing the fix, apply it once and run the full suite: every test outside the ones this plan
  names that changes result is a vehicle; report it and update it in the same commit with a comment saying why.
- **Every condition the task adds** (a guard, a branch, a call, a flag, an argument) is named in the report with the
  test that turns red when that one condition is dropped. The plan's "Conditions → tests" tables give the measured
  mutations; rerun them and report the result. Where the plan says a mutation cannot bite, say so in the report.
- **Labels (test/README.md section 5).** A test title cites a Pilot's Guide page or figure only for what that page
  literally shows. A KLN 89 trainer citation ("checked in the KLN 89 trainer, 2026-10-18") supports only what
  `docs/kln89-trainer-record.md` literally records in its block for that date (older dates likewise). The AVsoftech
  trainer is never a spec source: what only it shows is `(characterization)`, and the comment says "the AVsoftech
  trainer (unreliable)". A ruling of the maintainer is cited as "(the maintainer's ruling, #NN)" in a comment, and its
  test title cites the issue. Hot swap gates and the persistence of keys are engineering properties of the public
  contract: they cite the issue, no page. Never put a characterization in a describe whose title cites a page, nor a
  test in a describe whose title cites a different source. An `it.fails` pin that the fix turns green becomes a plain
  `it` with its title kept (drop nothing but `.fails`).
- **Copyright.** Never quote the Pilot's Guide or the other manuals: cite page numbers and paraphrase.
- **Code rules (CLAUDE.md).** DOM changes only in display ticks; runtime state in `VolatileMemory` or settings, except
  the hot swap state, which is device state on `Hardware` (the maintainer's ruling); target es2017; comments cite the
  manual page or the issue; no counts in prose for things that grow.
- **Public contracts.** No H event, LVar, panel.xml key or SimVar is renamed or removed. Changed on purpose: the hot
  swap behavior (#138, #350, #353, #398), the default of `Output.AltitudeAlertEnabled` (#141), new user setting keys
  with defaults (`rmk10` to `rmk99` for #92, `altAlertEnabled` and `altAlertWarn` for #259).
- **Report.** Write `.task-report.md` at the root of your worktree with a Bash heredoc (never committed): the commit
  sha, the files changed, the conditions → tests table with the mutation results, the vehicles, a label audit (each
  `describe` and `it` you added or touched: its title, spec or characterization, every page number it cites), and the
  full-suite totals.

**User decisions (already made):**
- #138: while disabled every H event is ignored, the power and brightness events included; the power then follows
  only the electricity SimVar.
- Hot swap state: `SimVarSync`'s 100 ms poll is the only reader of `L:KLN90B_Disabled`; the state lives on `Hardware`
  (a unit taken out of the aircraft is physical device state), and the field's doc comment says so and lists what a
  disabled unit does.
- `L:KLN90B_Brightness` keeps being applied while disabled; an EFB import that started before the disable may finish.
- #259: the AVsoftech trainer kept WARN and ALERT ON/OFF over a power cycle, so both become user settings.
- #101: fix the loader; the release notes say converted data stays wrong. No repair code.
- #141: the default becomes false.
- #187: a lat/lon leg naming a held user (XX) or temporary (XY) waypoint comes back as that waypoint, whatever the type,
  with the stored position; a deleted one is created anew.
- #175: the latch fix (one copy, kept until read, none when the validity did not change).
- #330: ADJ NAV IND CRS is not evaluated until the self-test is approved (Turn-On page and self-test page).
- #351: a read persistent message stays read over a power cycle.
- #125: the self-test page stays editable while the GPS is valid; SET 2 keeps its lock (3-53).
- #397, #398 and #399 are in the milestone, each its own commit; #399 lands before #141.

## Lanes and order

| Lane | Tasks, in order |
|---|---|
| H hot swap and EFB | Task 1 (#138), Task 2 (#350), Task 3 (#353), Task 4 (#398), Task 5 (#187) |
| P persistence and ALT | Task 6 (harness re-seed), Task 7 (#92), Task 8 (#259), Task 9 (#101), Task 10 (#399) |
| M messages and time | Task 11 (#175), Task 12 (#330), Task 13 (#351), Task 14 (#331), Task 15 (#397), Task 16 (#125) |
| last | Task 17 (#141), after lanes P and M |

Shared files across lanes: `kln90b/KLN90BCore.ts` (lane H: `onInteractionEvent`, the `Sensors`, `SimVarSync`,
`WTFlightplanSync` and EFB constructors; lane P Task 8: the `new AltAlert(...)` line; lane M Task 11: the
`new Database(...)` line) — different hunks, the cherry-pick merges them. `docs/architecture.md` is touched by several
tasks in different sections. Task 17's vehicles include `SelfTestRightPage.test.ts` › `approving the self-test page
(spec)` › `plays five short beeps (3-7)`, a file lane M also changes; re-measure Task 17 on the integration branch after
both lanes.

Test helpers used below (all exist unless a task creates them): `bootUnit`, `settle`, `HeadlessUnit`
(`test/harness/boot.ts`); `unit.panel` (the `FrontPanel`: `selectPage`, `cursor`, `inner`, `outer`, `ent`, `clr`,
`dct`, `msg`, `alt`, `scan`, `enterIdent`, `cursorTo`, `obsMode`, `readMessages`, `powerCycle`, `approveSelfTest`);
`Screen.read()` with `rows(side)`, `row(n)`, `status()`; `unit.efb` (`test/harness/platform.ts`); `panelXml`,
`AIRDATA`, `ALTITUDE_ALERT` (`test/harness/panelXml.ts`); `storedSetting` (`test/harness/storage.ts`);
`bootOnStandardRoute` (`test/harness/worldBoot.ts`); `messages`, `messageLines` (`test/harness/readers.ts`).

## Measured deviations from the spec

- **2A (Task 1).** The doc comment says a disabled unit writes none of the GPS outputs the aircraft reads, and names the
  zeroed `L:KLN90B_*` outputs at a loss of power as the exception (a kept public-contract test). The comment lands with
  the flag in Task 1 and describes the gates Tasks 2 to 4 add. A test counts the reads of `L:KLN90B_Disabled` (ten per
  second, the poll's) and is the only test that bites a gate reading the LVar instead of the flag.
- **2E (Task 4).** The #398 tests live in `WTFlightplanSync.test.ts`, where the planner helpers are.
- **3A (Task 6).** The re-seed moves the GPS draws once: the seeded warm-start tests take seeds 12 (38 s) and 34
  (105 s) instead of 15 and 4.
- **3E (Task 5).** No explicit XX/XY filter: the facility repository holds only user and temporary waypoints.
- **3F (Task 8).** `AltPage` shows ALERT ON only when the installation has the alerter as well (3-57); all
  `AltAlert.test.ts` tests change through their rig.
- **4A (Task 11).** The latch is reset at the power-off through an optional `Message.onPowerOff()` that
  `MessageHandler.clear()` calls; without it an unread copy came back after a power cycle, and a data base that expired
  while the unit was off posted at power-on (the KLN 89 showed no message at a power-up past the end). `Database`'s
  constructor loses the bus and the message handler.
- **4D (Task 13).** `clear()` keeps its loop (it calls `onPowerOff()`) and drops only the `seen` reset.
- **#399 (Task 10)** is new; **#330 (Task 12)** is wider than spec 4B (the maintainer's ruling above).

---

### Task 1: A disabled unit ignores every H event, and the disabled state lives on Hardware (#138)

**Goal:** `Hardware.isDisabled` holds the hot swap state, set only by `SimVarSync.setDisabled` (the only reader of
`L:KLN90B_Disabled`), and `KLN90BCore.onInteractionEvent` returns first thing while it is set, so no H event reaches
the unit, the power and brightness events included.

**Files:**
- Modify: `kln90b/Hardware.ts` (new field `isDisabled` with its doc comment)
- Modify: `kln90b/SimVarSync.ts` (constructor takes `hardware`; the `disabled` field goes; `tick` and `setDisabled`
  read and write `hardware.isDisabled`)
- Modify: `kln90b/KLN90BCore.ts` (`onInteractionEvent` at about :188; the `new SimVarSync(...)` call at about :354)
- Modify: `docs/architecture.md` (the "Hot-swap disable" paragraph and the first "Input routing" bullet, about :131-138)
- Test: `test/render/SimVarSync.test.ts` (describe `H events while the unit is disabled (public contract)`)
- Test (vehicle): `test/render/SensorsOut.test.ts` (`banking()` and one test of `outputs at power-off (public contract)`)

**Acceptance Criteria:**
- [ ] The pin `are ignored: the left page is still NAV 1 after the resume (#138)` passes as a plain `it`.
- [ ] While disabled, `KLN90B_Power_Off` leaves the unit on after the resume (L:KLN90B_Power 1, NAV 1 shown, the power
  cycle count unchanged); `KLN90B_RightScan_Toggle` writes no `L:KLN90B_RightScan` and leaves the right inner knob a
  page knob; `KLN90B_Brt_Dec` changes neither `L:KLN90B_Brightness` nor the opacity.
- [ ] `L:KLN90B_Disabled` is read exactly ten times a second (the poll) while H events arrive.
- [ ] The vehicle `zeroes the outputs of a unit that is switched off while it is disabled for hot swapping` switches off
  through `Input.ElectricitySimVar` and still passes; no other test changes.
- [ ] The doc comment of `Hardware.isDisabled` states the maintainer's interpretation (taken out of the aircraft, not
  switched off) and what a disabled unit does.

**Verify:** `npx vitest run test/render/SimVarSync.test.ts test/render/SensorsOut.test.ts test/unit/Hardware.test.ts` →
all pass; then `npm test` → 4447 tests, 23 expected fail, no failures.

**Steps:**

- [ ] **Step 1: Write the tests.** In `test/render/SimVarSync.test.ts`, replace the whole describe `H events while the
  unit is disabled (public contract)` (and its comment) at the end of the file with:

```ts
// The Hot Swapping wiki page: a disabled unit suspends and resumes where it left off, so the input meant for the unit
// that replaced it must not reach it. The maintainer's ruling (#138): while the unit is disabled every H event is
// ignored, the power and brightness events included; its power then follows only the electricity SimVar
describe('H events while the unit is disabled (public contract)', () => {
    async function disable(unit: HeadlessUnit): Promise<void> {
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
    }

    async function resume(unit: HeadlessUnit): Promise<void> {
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
    }

    it('the sibling: two clicks of the left inner knob move NAV 1 to NAV 3', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('L', 'NAV 1');

        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await unit.panel.press('KLN90B_LeftSmallKnob_Right');

        expect(Screen.read().status().left).toBe('NAV 3');
    });

    it.fails('are ignored: the left page is still NAV 1 after the resume (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('L', 'NAV 1');
        await disable(unit);

        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await resume(unit);

        expect(Screen.read().status().left).toBe('NAV 1');
    });

    // The sibling of the next test: on an enabled unit KLN90B_Power_Off switches the unit off and writes the switch LVar
    it('the sibling: KLN90B_Power_Off switches an enabled unit off', async () => {
        const unit = await bootOnStandardRoute();

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);
    });

    it('ignores KLN90B_Power_Off: the unit is still on after the resume (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('L', 'NAV 1');
        const cycles = unit.props.userSettings.getSetting('powercycles').value;
        await disable(unit);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);
        await resume(unit);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(1);
        expect(Screen.read().status().left).toBe('NAV 1');
        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles);
    });

    // The scan knob is pulled by KLN90B_RightScan_Toggle, which writes L:KLN90B_RightScan and makes the right inner knob
    // the scan knob (KLN90BCore.onInteractionEvent)
    it('ignores the scan toggle: neither L:KLN90B_RightScan nor the right inner knob changes (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('R', 'NAV 1');
        await disable(unit);
        const scanWrites = unit.env.sim.writeCount('L:KLN90B_RightScan');

        await unit.panel.scan();
        await resume(unit);

        expect(unit.env.sim.writeCount('L:KLN90B_RightScan')).toBe(scanWrites);
        expect(unit.props.hardware.isScanPulled).toBe(false);
        await unit.panel.press('KLN90B_RightSmallKnob_Right'); // A page step, not a scan
        expect(Screen.read().status().right).toBe('NAV 2');
    });

    it('ignores the brightness events: L:KLN90B_Brightness and the screen stay as they were (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await vi.advanceTimersByTimeAsync(5000); // the fade-in of the boot is done
        const opacity = unit.display.opacity();
        expect(unit.env.sim.get('L:KLN90B_Brightness', 'number')).toBe(1); // Precondition: full brightness
        await disable(unit);

        await unit.panel.press('KLN90B_Brt_Dec', 2);
        await resume(unit);

        expect(unit.env.sim.get('L:KLN90B_Brightness', 'number')).toBe(1);
        expect(unit.display.opacity()).toBe(opacity);
    });

    // The maintainer's ruling: L:KLN90B_Disabled is read only by the 100 ms poll of SimVarSync, which keeps the state on
    // Hardware; the gates read the kept state, because reading the LVar is expensive. Ten polls in a second, whatever
    // input arrives
    it('reads L:KLN90B_Disabled only in the poll, also while H events arrive (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await disable(unit);
        const read = vi.spyOn(SimVar, 'GetSimVarValue');

        await unit.panel.press('KLN90B_LeftSmallKnob_Right', 4); // 4 clicks of 250 ms: one second
        await unit.panel.press('KLN90B_ENT_Push', 4);

        expect(read.mock.calls.filter(c => c[0] === 'L:KLN90B_Disabled').length).toBe(20);
    });
});
```

  In `test/render/SensorsOut.test.ts` (the vehicle; a disabled unit now ignores `KLN90B_Power_Off`): import
  `BootOptions` from `'../harness/boot'` next to `bootToSelfTest`, let `banking` take boot options, and switch the one
  test off through the circuit:

```ts
    /** Setup A: banking towards the leg, 2 NM right of the course, the leg to the left. `opts` adds to the boot */
    async function banking(opts: BootOptions = {}) {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({panelXml: panelXml(HEADING_INPUT), magvar: 0, ...opts});
```

```ts
    // The freeze exists so that the unit resumes where it left off; a unit that is off has nothing to resume (maintainer).
    // A disabled unit ignores the power H events (#138, the maintainer's ruling), so it is switched off by the aircraft
    // power, Input.ElectricitySimVar
    it('zeroes the outputs of a unit that is switched off while it is disabled for hot swapping', async () => {
        const unit = await banking({
            panelXml: panelXml({...HEADING_INPUT, 'Input.ElectricitySimVar': 'CIRCUIT ON:1'}),
            simVars: [{name: 'CIRCUIT ON:1', unit: 'bool', value: 1}],
        });
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeCloseTo(25, 6); // Precondition: frozen

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
```

  (the three `expect`s that follow stay as they are).

- [ ] **Step 2: Run to see them fail.** `npx vitest run test/render/SimVarSync.test.ts test/render/SensorsOut.test.ts`.
  Expected: `ignores KLN90B_Power_Off`, `ignores the scan toggle` and `ignores the brightness events` FAIL; the pin
  passes as an expected fail; the two siblings, the reads test (no code reads the LVar on input yet) and the vehicle
  pass.

- [ ] **Step 3: Implement.** `kln90b/Hardware.ts`, below `isScanPulled`:

```ts
    /**
     * True while the unit is disabled for hot swapping (L:KLN90B_Disabled; the wiki page Hot Swapping and Package
     * Detection). A disabled unit is one that has been taken out of the aircraft, not one that is switched off, so the
     * flag is the physical state of the device and lives here, beside the scan knob. While it is set the unit:
     * - takes no input: no H event reaches it, the power and brightness events included, so its power follows only
     *   the electricity SimVar of panel.xml (#138, the maintainer's ruling);
     * - writes none of the GPS outputs the aircraft reads: no GPS SimVars, no GPS OVERRIDDEN claim, no "kln90b" flight
     *   planner, no EFB reply and no EFB route import. A loss of power still writes the zeroed L:KLN90B_* outputs;
     * - runs no ticks;
     * - resumes where it left off when it is put back.
     *
     * Only SimVarSync.setDisabled sets it, from its 100 ms poll of L:KLN90B_Disabled, which is the only read of that
     * LVar. Every gate reads this flag, never the LVar (the maintainer's ruling: reading the LVar is expensive), and lags
     * the LVar by at most one poll.
     */
    public isDisabled: boolean = false;
```

  `kln90b/SimVarSync.ts`: add `import {Hardware} from "./Hardware";`, delete `private disabled: boolean = false;`, add
  `private readonly hardware: Hardware` as the last constructor parameter, and change `tick` and `setDisabled`:

```ts
        //The only read of L:KLN90B_Disabled: everything else reads hardware.isDisabled (#138)
        this.setDisabled(!!SimVar.GetSimVarValue(LVAR_DISABLE, SimVarValueType.Bool));

        if (this.settings.input.externalSwitches.legObsSwitchInstalled && !this.hardware.isDisabled) {
```

```ts
            if (!this.hardware.isDisabled) { //A disabled unit has released the GPS for hot swapping, setDisabled claims it again
```

```ts
    private setDisabled(disabled: boolean): void {
        if (disabled === this.hardware.isDisabled) {
            return;
        }

        this.hardware.isDisabled = disabled;
```

  (the rest of `setDisabled` stays). `kln90b/KLN90BCore.ts`, first thing inside the `try` of `onInteractionEvent`:

```ts
            if (this.hardware.isDisabled) {
                //#138, the maintainer's ruling: a unit taken out for hot swapping takes no input, the power and brightness
                //events included. The keyboard is re-dispatched through here, so it is ignored as well
                return;
            }
```

  and pass `this.hardware` as the last argument of `new SimVarSync(...)`.

- [ ] **Step 4: Flip the pin.** Drop `.fails` from `are ignored: the left page is still NAV 1 after the resume (#138)`;
  keep its title.

- [ ] **Step 5: Docs.** In `docs/architecture.md` replace the "Hot-swap disable" paragraph and the first "Input routing"
  bullet with:

```md
**Hot-swap disable**: the 100 ms poll of `SimVarSync` is the only reader of `L:KLN90B_Disabled`. `setDisabled` keeps
the state in `Hardware.isDisabled` (a unit taken out of the aircraft, not one switched off; its doc comment lists what a
disabled unit does), calls `tickController.setEnabled(false)` and `pageManager.resetKeyboard()`, and if
`writeGPSSimVars` is set it toggles `GPS OVERRIDDEN`. The gates read `Hardware.isDisabled`, never the LVar, so they lag
it by at most one poll.
```

```md
- `KLN90B.onInteractionEvent` calls `super` and passes the event to `KLN90BCore.onInteractionEvent`. While
  `Hardware.isDisabled` is set it drops every event, the power and brightness events included (#138), so the power of a
  disabled unit follows only the electricity SimVar. Otherwise it handles the SCAN pull state (`Hardware.isScanPulled`,
  mirrored to `L:KLN90B_RightScan`).
```

- [ ] **Step 6: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: all green, 4447 tests,
  23 expected fail.

- [ ] **Step 7: Commit** `fixes #138 ignore every H event while the unit is disabled for hot swapping, and keep the disabled state on Hardware`

**Conditions → tests:**

| Condition | Mutation | Red |
|---|---|---|
| the gate in `onInteractionEvent` | `if (false)` | the pin, `ignores KLN90B_Power_Off`, `ignores the scan toggle`, `ignores the brightness events` (siblings, reads test, vehicle stay green, as predicted) |
| the gate covers the power events | let `KLN90B_Power_Off` pass | `ignores KLN90B_Power_Off` only |
| the gate covers the brightness events | let `KLN90B_Brt_Dec` pass | `ignores the brightness events` only |
| the gate covers the scan toggle | let `KLN90B_RightScan_Toggle` pass | `ignores the scan toggle` only |
| the gate reads the flag, not the LVar | `if (SimVar.GetSimVarValue('L:KLN90B_Disabled', ...))` | `reads L:KLN90B_Disabled only in the poll ...` only |
| `setDisabled` stores the state on `Hardware` | drop `this.hardware.isDisabled = disabled` | `ignores KLN90B_Power_Off`, the scan and brightness tests, and `L:KLN90B_Disabled ... freezes the outputs and resumes ...` |

The LEG/OBS-switch gate in `tick` only changes its source (local variable → flag, the same value after
`setDisabled`); it has no test today (docs/test-next-steps.md lists it) and this task adds none.

**Vehicles:** `test/render/SensorsOut.test.ts` "outputs at power-off (public contract) zeroes the outputs of a unit that
is switched off while it is disabled for hot swapping" went red (it switched off with `KLN90B_Power_Off`); it now
switches off through `Input.ElectricitySimVar` and passes. It still bites: dropping `this.out.setPoweredOff()` in
`Sensors.reset` turns it red. No other test changed (full-suite comparison with the baseline JSON).

```json:metadata
{"files": ["kln90b/Hardware.ts", "kln90b/SimVarSync.ts", "kln90b/KLN90BCore.ts", "docs/architecture.md", "test/render/SimVarSync.test.ts", "test/render/SensorsOut.test.ts"], "verifyCommand": "npx vitest run test/render/SimVarSync.test.ts test/render/SensorsOut.test.ts test/unit/Hardware.test.ts && npm test", "acceptanceCriteria": ["the #138 pin passes as a plain test", "Power_Off, the scan toggle and Brt_Dec are ignored while disabled", "L:KLN90B_Disabled is read only by the poll", "the SensorsOut vehicle switches off through the circuit and passes", "no other test changes"], "modelTier": "standard"}
```

---

---

### Task 2: A power change while disabled does not claim GPS OVERRIDDEN (#350)

**Goal:** `SensorsOut.reset()` skips its `GPS OVERRIDDEN` claim while `Hardware.isDisabled` is set, so a loss or return
of the aircraft power leaves the GPS to the unit that replaced the KLN; the resume in `SimVarSync.setDisabled` still
claims it.

**Files:**
- Modify: `kln90b/Sensors.ts` (`SensorsOut` constructor and `reset()` at about :261 and :598; `Sensors` constructor at
  about :638)
- Modify: `kln90b/KLN90BCore.ts` (the `new Sensors(...)` call at about :261)
- Modify: `docs/architecture.md` (the "Hot-swap disable" paragraph)
- Test: `test/render/SimVarSync.test.ts` (describe `GPS OVERRIDDEN while the unit is disabled (public contract)`)

**Acceptance Criteria:**
- [ ] With the unit disabled, the aircraft power (`Input.ElectricitySimVar`) going off for 3 s and on again for 3 s
  leaves `GPS OVERRIDDEN` at 0 throughout.
- [ ] The resume after that claims it (1); a loss of the aircraft power claims it at once on an enabled unit (sibling).
- [ ] No other test changes (measured: none).

**Verify:** `npx vitest run test/render/SimVarSync.test.ts test/render/SensorsOut.test.ts` → all pass; then `npm test`
→ 4450 tests, 23 expected fail, no failures.

**Steps:**

- [ ] **Step 1: Write the tests** at the end of the describe `GPS OVERRIDDEN while the unit is disabled (public
  contract)` in `test/render/SimVarSync.test.ts`, after `still follows WriteGpsSimvars while the unit is enabled`
  (`CIRCUIT_XML` is defined at the top of the file), and change the describe's comment to name #350:

```ts
// The Hot Swapping wiki page: a disabled unit does not claim the GPS (GPS OVERRIDDEN 0, see SensorsOut.test.ts #24), and
// neither toggling WriteGpsSimvars (#137) nor a power change (#350) changes that.
```

```ts
    // A power change claims the GPS at once (SensorsOut.reset). The aircraft power is Input.ElectricitySimVar; a disabled
    // unit ignores the power H events (#138), so the circuit is its only power path
    const onCircuit = () => bootOnStandardRoute({panelXml: CIRCUIT_XML, simVars: [{name: 'CIRCUIT ON:1', unit: 'bool', value: 1}]});

    it('the sibling: a loss of the aircraft power claims the GPS of an enabled unit at once', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('GPS OVERRIDDEN', 'bool', false); // As another device would

        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });

    it('stays released when the aircraft power goes off and comes back (#350)', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });

    it('claims the GPS on the resume after the aircraft power went off and came back while disabled (#350)', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });
```

- [ ] **Step 2: Run to see it fail.** `npx vitest run test/render/SimVarSync.test.ts`. Expected: `stays released when
  the aircraft power goes off and comes back (#350)` FAILS (1 after the loss); the sibling and the resume test pass.

- [ ] **Step 3: Implement** in `kln90b/Sensors.ts`: add `import {Hardware} from "./Hardware";`; `SensorsOut` takes
  `private readonly hardware: Hardware` as its last constructor parameter (a parameter property, so it is set before
  the constructor's own `this.reset()`); `Sensors` takes `hardware: Hardware` as its last constructor parameter and
  passes it on (`this.out = new SensorsOut(options, audioGenerator, hardware);`). `SensorsOut.reset()` begins:

```ts
    public reset() {
        //#350: a unit disabled for hot swapping has released the GPS to the unit that replaced it, so a power change does
        //not claim it. SimVarSync.setDisabled claims it again on the resume
        if (!this.options.output.writeGPSSimVars || this.hardware.isDisabled) {
            return;
        }
```

  In `KLN90BCore.asyncInit`: `new Sensors(this.bus, this.userSettings, this.planeSettings, this.audioGenerator,
  this.messageHandler, this.hardware)`.

- [ ] **Step 4: Docs.** In the "Hot-swap disable" paragraph of `docs/architecture.md`, replace its last sentence with:

```md
`writeGPSSimVars` is set it toggles `GPS OVERRIDDEN`: that is the only claim of the GPS while disabled, since
`SensorsOut.reset()` skips its claim on a power change then (#350). The gates read `Hardware.isDisabled`, never the LVar,
so they lag it by at most one poll.
```

- [ ] **Step 5: Run the file, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: all green, 4450 tests,
  23 expected fail.

- [ ] **Step 6: Commit** `fixes #350 keep GPS OVERRIDDEN released on a power change while the unit is disabled for hot swapping`

**Conditions → tests:**

| Condition | Mutation | Red |
|---|---|---|
| `|| this.hardware.isDisabled` in `SensorsOut.reset()` | drop it | `stays released when the aircraft power goes off and comes back (#350)` only (the sibling and the resume test stay green, as predicted) |

The resume test is not satisfied by a calculation tick: making `setDisabled` write only the release (no claim on the
resume) turns it red, together with the #137 resume test.

**Vehicles:** none (measured).

```json:metadata
{"files": ["kln90b/Sensors.ts", "kln90b/KLN90BCore.ts", "docs/architecture.md", "test/render/SimVarSync.test.ts"], "verifyCommand": "npx vitest run test/render/SimVarSync.test.ts test/render/SensorsOut.test.ts && npm test", "acceptanceCriteria": ["a circuit loss and return while disabled keeps GPS OVERRIDDEN 0", "the resume claims it", "no other test changes"], "modelTier": "mechanical"}
```

---

---

### Task 3: A disabled unit leaves the EFB route request unanswered (#353)

**Goal:** `KlnEfbSaver.handleAvionicsRouteRequested` returns while `Hardware.isDisabled` is set, and
`KlnEfbLoader.loadRoute` (#188) reads the same flag instead of `L:KLN90B_Disabled`.

**Files:**
- Modify: `kln90b/services/KlnEfbSaver.ts` (constructor, `handleAvionicsRouteRequested` at about :25)
- Modify: `kln90b/services/KlnEfbLoader.ts` (imports, constructor, `loadRoute` at about :36)
- Modify: `kln90b/KLN90BCore.ts` (the `new KlnEfbSaver(...)` and `new KlnEfbLoader(...)` calls at about :367)
- Modify: `docs/architecture.md` (the `KlnEfbSaver`/`KlnEfbLoader` bullet, about :366)
- Test: `test/render/services/KlnEfbSaver.test.ts`, `test/render/services/KlnEfbLoader.test.ts`

**Acceptance Criteria:**
- [ ] With the unit disabled a route request gets no reply; after the resume the next request is answered with FPL 0.
- [ ] `L:KLN90B_Disabled` is read exactly ten times a second while the EFB requests and syncs routes.
- [ ] The #188 tests of `KlnEfbLoader.test.ts` stay green (they hold the loader on the flag).
- [ ] No other test changes (measured: none).

**Verify:** `npx vitest run test/render/services/KlnEfbSaver.test.ts test/render/services/KlnEfbLoader.test.ts` → all
pass; then `npm test` → 4453 tests, 23 expected fail, no failures.

**Steps:**

- [ ] **Step 1: Write the tests.** In `test/render/services/KlnEfbSaver.test.ts`, right after `leaves a route request
  unanswered with WriteGPSSimVars off (characterization)`:

```ts
    // The Hot Swapping wiki page ("Hot Swapping and Package Detection") and LVars.ts LVAR_DISABLE: a unit disabled for
    // hot swapping has handed its outputs to the GPS that replaced it, so that GPS answers the EFB, not the KLN (#353)
    it('leaves a route request unanswered while the unit is disabled for hot swapping (#353)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        unit.efb!.request();

        expect(unit.efb!.replies).toEqual([]);
    });

    // The gate is the disabled state and nothing wider: the unit answers again once it is put back
    it('answers a route request again after the resume (#353)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        unit.efb!.request();
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        const before = unit.efb!.replies.length;

        unit.efb!.request();

        expect(unit.efb!.replies.length).toBe(before + 1);
        const route = unit.efb!.replies[before].route;
        expect(ICAO.valueToStringV2(route.departureAirport)).toBe(ICAO.valueToStringV2(kaaa.icaoStruct));
        expect(ICAO.valueToStringV2(route.destinationAirport)).toBe(ICAO.valueToStringV2(kbbb.icaoStruct));
    });
```

  In `test/render/services/KlnEfbLoader.test.ts`, in the describe `EFB route import while the unit is disabled for hot
  swapping (public contract)`, before `imports a route synced after the unit resumed (#188)`:

```ts
    // The maintainer's ruling (#138): L:KLN90B_Disabled is read only by the 100 ms poll of SimVarSync, which keeps the
    // state on Hardware; the EFB gates read the kept state (#353), because reading the LVar is expensive. Ten polls in a
    // second, whatever the EFB sends
    it('reads L:KLN90B_Disabled only in the poll, also while the EFB requests and syncs routes (#353)', async () => {
        const unit = await disabledUnit(true);
        const read = vi.spyOn(SimVar, 'GetSimVarValue');

        unit.efb!.request();
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        unit.efb!.request();
        unit.efb!.sync(efbRoute({departure: kbbb, destination: kaaa}));
        await vi.advanceTimersByTimeAsync(1000);

        expect(read.mock.calls.filter(c => c[0] === 'L:KLN90B_Disabled').length).toBe(10);
    });
```

- [ ] **Step 2: Run to see them fail.** Expected: `leaves a route request unanswered while the unit is disabled for hot
  swapping (#353)` FAILS (one reply) and the reads test FAILS (the loader reads the LVar on each sync: 12); `answers a
  route request again after the resume (#353)` passes.

- [ ] **Step 3: Implement.** `kln90b/services/KlnEfbSaver.ts`: `import {Hardware} from "../Hardware";`, the constructor
  takes `private readonly hardware: Hardware` last, and:

```ts
    private handleAvionicsRouteRequested(sender: FlightPlanRouteManager, requestId: number): void {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (this.hardware.isDisabled) {
            //#353: the GPS that replaced the unit for hot swapping answers the EFB
            return;
        }

        this.flightPlanRouteManager.replyToAvionicsRouteRequest(requestId, this.toEfbRoute())

    }
```

  `kln90b/services/KlnEfbLoader.ts`: drop `SimVarValueType` from the SDK import and the `LVAR_DISABLE` import, add
  `import {Hardware} from "../Hardware";`, add `private readonly hardware: Hardware` as the last constructor parameter,
  and in `loadRoute` replace the LVar read:

```ts
        if (this.hardware.isDisabled) { //#188. The state SimVarSync keeps, not the LVar (#353)
```

  (its comment lines and body stay). In `KLN90BCore.asyncInit`: `new KlnEfbSaver(this.planeSettings!, manager,
  flightplans[0], this.hardware)` and `new KlnEfbLoader(this.bus, facilityLoader, this.messageHandler, manager,
  flightplans[0], this.pageManager, facilityRepository, this.hardware)`.

- [ ] **Step 4: Docs.** In `docs/architecture.md` replace the `KlnEfbSaver` bullet with:

```md
    - `KlnEfbSaver` answers EFB `avionicsRouteRequested` (only with `writeGPSSimVars` set); `KlnEfbLoader` loads
      `syncedAvionicsRoute` into FPL 0 (lat/lon legs become temporary user waypoints in region `XY`). While
      `Hardware.isDisabled` is set the request goes unanswered (#353) and the synced route is dropped (#188).
```

- [ ] **Step 5: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: all green, 4453 tests,
  23 expected fail.

- [ ] **Step 6: Commit** `fixes #353 leave the EFB route request unanswered while the unit is disabled for hot swapping`

**Conditions → tests:**

| Condition | Mutation | Red |
|---|---|---|
| the saver gate | `if (false)` | `leaves a route request unanswered while the unit is disabled ... (#353)` only (the resume sibling stays green, as predicted) |
| the saver gate is no wider than the disabled state | `if (true)` | `answers a route request again after the resume (#353)` and every route-request test of the file |
| the saver reads the flag | `SimVar.GetSimVarValue('L:KLN90B_Disabled', 'bool')` | the reads test only |
| the loader reads the flag | back to the LVar read | the reads test only |
| the loader gate (#188, now on the flag) | `if (false)` | the five #188/public-contract tests of the disabled describe in `KlnEfbLoader.test.ts` |

**Vehicles:** none (measured).

```json:metadata
{"files": ["kln90b/services/KlnEfbSaver.ts", "kln90b/services/KlnEfbLoader.ts", "kln90b/KLN90BCore.ts", "docs/architecture.md", "test/render/services/KlnEfbSaver.test.ts", "test/render/services/KlnEfbLoader.test.ts"], "verifyCommand": "npx vitest run test/render/services/KlnEfbSaver.test.ts test/render/services/KlnEfbLoader.test.ts && npm test", "acceptanceCriteria": ["no reply while disabled", "a reply after the resume", "the LVar is read only by the poll during EFB traffic", "the #188 tests stay green", "no other test changes"], "modelTier": "mechanical"}
```

---

---

### Task 4: The "kln90b" flight planner is not written while disabled (#398)

**Goal:** `WTFlightplanSync` writes nothing while `Hardware.isDisabled` is set, whatever asks for the sync (the
`L:KLN90B_WriteGpsSimvars` switch-on in `SimVarSync.tick`, a change of FPL 0, an active waypoint change), and
`SimVarSync.setDisabled(false)` mirrors FPL 0 once when `writeGPSSimVars` is on.

**Files:**
- Modify: `kln90b/services/WTFlightplanSync.ts` (import, constructor, the `sync()` doc comment,
  `syncToWTFlightplan` at about :72)
- Modify: `kln90b/SimVarSync.ts` (`setDisabled`)
- Modify: `kln90b/KLN90BCore.ts` (the `new WTFlightplanSync(...)` call at about :326)
- Modify: `docs/architecture.md` (the `WTFlightplanSync` bullet, about :361)
- Test: `test/render/services/WTFlightplanSync.test.ts`

**Acceptance Criteria:**
- [ ] While disabled, switching `L:KLN90B_WriteGpsSimvars` from 0 to 1 leaves plan 0 empty, and a change of FPL 0
  leaves plan 0 as it was.
- [ ] The resume mirrors FPL 0 with one write; with the option switched off while disabled it writes nothing.
- [ ] A power-on after more than 5 minutes off while disabled (through the circuit) removes the approach from FPL 0 but
  not from plan 0; the resume removes it from plan 0.
- [ ] No other test changes (measured: none).

**Verify:** `npx vitest run test/render/services/WTFlightplanSync.test.ts test/render/SimVarSync.test.ts` → all pass;
then `npm test` → 4459 tests, 23 expected fail, no failures.

**Steps:**

- [ ] **Step 1: Write the tests** in `test/render/services/WTFlightplanSync.test.ts`. A new describe between the
  describes `the "kln90b" flight planner on the standard route` and `the "kln90b" flight planner behind a fence`:

```ts
// The Hot Swapping wiki page and the doc comment of Hardware.isDisabled: a unit disabled for hot swapping writes no
// outputs, the "kln90b" planner included, whatever asks for the sync (#398). The planner was not written meanwhile, so
// the resume mirrors FPL 0 once, when Output.WriteGPSSimVars is on
describe('the "kln90b" flight planner while the unit is disabled for hot swapping (public contract)', () => {
    const {kaaa, abc} = standardRoute();
    const xray = intersection('XRAY', 47.2, 8.7);
    const bootOnRoute = (xml?: string) => bootOnStandardRoute({facilities: [xray], position: pointBefore(kaaa, abc, 20), panelXml: xml});

    async function setDisabled(unit: HeadlessUnit, disabled: boolean): Promise<void> {
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', disabled);
        await vi.advanceTimersByTimeAsync(300);
    }

    // The sibling is 'mirrors FPL 0 at once when L:KLN90B_WriteGpsSimvars goes from 0 to 1' above
    it('writes nothing when L:KLN90B_WriteGpsSimvars goes from 0 to 1 while disabled (#398)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        await setDisabled(unit, true);

        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual([]);
    });

    // The sibling is 'follows an edit of FPL 0' above
    it('does not mirror a change of FPL 0 while disabled (#398)', async () => {
        const unit = await bootOnRoute();
        await setDisabled(unit, true);

        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    it('mirrors FPL 0 once on the resume (#398)', async () => {
        const unit = await bootOnRoute();
        await setDisabled(unit, true);
        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);
        const planner = plannerOf(unit);
        const writes = vi.spyOn(planner, 'getFlightPlan'); // WTFlightplanSync.writeFpl0 gets plan 0 once per write

        await setDisabled(unit, false);

        expect(writes).toHaveBeenCalledTimes(1);
        expect(identsOf(planner.getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
    });

    it('mirrors FPL 0 on the resume after the option went on while disabled (#398)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        await setDisabled(unit, true);
        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        await setDisabled(unit, false);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    // With Output.WriteGPSSimVars off the unit does not write the planner (#142), and the resume does not either
    it('writes nothing on the resume when L:KLN90B_WriteGpsSimvars went to 0 while disabled (#398)', async () => {
        const unit = await bootOnRoute();
        await setDisabled(unit, true);
        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);

        await setDisabled(unit, false);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });
});
```

  In the describe `the "kln90b" flight planner after a procedure leaves FPL 0`, let `bootWithApproach` power the unit
  through the circuit on request:

```ts
    /**
     * FPL 0 of ENRBB, ENRAA and KPRC with the APT 8 approach loaded; the approach legs precede the airport. `power`
     * powers the unit through Input.ElectricitySimVar CIRCUIT ON:1, on at the boot
     */
    async function bootWithApproach(power?: 'circuit'): Promise<HeadlessUnit> {
```

```ts
            storage: savedFlightplan(0, [enrbb, enraa, kprc]),
            panelXml: panelXml(power === 'circuit' ? {...APR_ARM_SWITCH, 'Input.ElectricitySimVar': 'CIRCUIT ON:1'} : APR_ARM_SWITCH),
            simVars: power === 'circuit' ? [{name: 'CIRCUIT ON:1', unit: 'bool', value: 1}] : [],
        });
```

  and add, as the last test of that describe (after `keeps the approach in plan 0 over a power cycle of 1 minute
  (#347)`):

```ts
    // #398: a unit disabled for hot swapping writes no outputs. Its power follows the circuit (it ignores the power H
    // events, #138), and the power-on after more than 5 minutes off removes the approach from FPL 0 (6-5, 6-23) while it
    // is disabled. The planner keeps the approach until the resume mirrors FPL 0
    it('mirrors the removal of the approach at the power-on only when the unit is put back (#398)', async () => {
        const unit = await bootWithApproach('circuit');
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(360_000);
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(fplIdents(unit)).toEqual(['ENRBB', 'ENRAA', 'KPRC']); // FPL 0 has lost the approach
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(MIRRORED_APPROACH);

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['ENRBB', 'ENRAA', 'KPRC']);
    });
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run test/render/services/WTFlightplanSync.test.ts`. Expected FAIL:
  `writes nothing when ... goes from 0 to 1 while disabled`, `does not mirror a change of FPL 0 while disabled`,
  `mirrors FPL 0 once on the resume` (no write at the resume) and `mirrors the removal of the approach ...`; the other
  two new tests pass.

- [ ] **Step 3: Implement.** `kln90b/services/WTFlightplanSync.ts`: `import {Hardware} from "../Hardware";`, the
  constructor takes `private readonly hardware: Hardware` last, the doc comment of `sync()` gains a sentence, and
  `syncToWTFlightplan` begins with the gate:

```ts
    /**
     * Mirrors FPL 0 right away. L:KLN90B_WriteGpsSimvars switches the option on at runtime, and the planner would stay
     * empty or stale until the next change otherwise. SimVarSync also calls it when the unit is put back after hot
     * swapping (#398).
     */
```

```ts
    private syncToWTFlightplan(klnPlan: Flightplan, activeIdx: number) {
        if (this.hardware.isDisabled) {
            //#398: a unit disabled for hot swapping writes no outputs, whatever asks for the sync. SimVarSync syncs once
            //when it is put back
            return;
        }
        this.writeFpl0(klnPlan, activeIdx);
```

  `kln90b/SimVarSync.ts`, the end of `setDisabled`:

```ts
        if (this.settings.output.writeGPSSimVars) {
            SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, !disabled); //Allows other devices to write GPS vars
            if (!disabled) {
                this.wtFlightplanSync.sync(); //#398: the planner was not written while the unit was disabled
            }
        }
```

  In `KLN90BCore.asyncInit`: `new WTFlightplanSync(this.bus, facilityLoader, this.planeSettings,
  memory.navPage.activeWaypoint, this.hardware)`.

- [ ] **Step 4: Docs.** In `docs/architecture.md`, the `WTFlightplanSync` bullet ends:

```md
      We do not return data after a fence"). This happens only when `writeGPSSimVars` is set, and `SimVarSync` calls `WTFlightplanSync.sync()` once when
      `L:KLN90B_WriteGpsSimvars` switches it on at runtime. While `Hardware.isDisabled` is set nothing is written,
      whatever asks for the sync, and `SimVarSync.setDisabled` syncs once on the resume (#398).
```

- [ ] **Step 5: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: all green, 4459 tests,
  23 expected fail.

- [ ] **Step 6: Commit** `fixes #398 write nothing to the kln90b flight planner while the unit is disabled for hot swapping, and mirror FPL 0 once on the resume`

**Conditions → tests:**

| Condition | Mutation | Red |
|---|---|---|
| the gate in `syncToWTFlightplan` | `if (false)` | `writes nothing when ... from 0 to 1 while disabled`, `does not mirror a change of FPL 0 while disabled`, `mirrors the removal of the approach ...` (the three resume tests stay green, as predicted) |
| the sync on the resume | drop the `sync()` call | `mirrors FPL 0 once on the resume`, `mirrors FPL 0 on the resume after the option went on ...`, `mirrors the removal of the approach ...` |
| the resume sync only with `writeGPSSimVars` | move it out of the `writeGPSSimVars` block | `writes nothing on the resume when L:KLN90B_WriteGpsSimvars went to 0 while disabled` only |
| `if (!disabled)` around the resume sync | `if (true)` | none: an equivalent mutant, because `setDisabled` sets `hardware.isDisabled` first and `sync()` writes nothing while it is set. Kept for reading; say so in the report |

Reachability: a pilot cannot change FPL 0 while disabled (H events are ignored, Task 1), so the `insertLeg` test stands
for the paths the pilot does not drive; the power-on procedure removal is the one a pilot reaches (through the
aircraft power), and the `WriteGpsSimvars` switch-on is the aircraft's.

**Vehicles:** none (measured).

```json:metadata
{"files": ["kln90b/services/WTFlightplanSync.ts", "kln90b/SimVarSync.ts", "kln90b/KLN90BCore.ts", "docs/architecture.md", "test/render/services/WTFlightplanSync.test.ts"], "verifyCommand": "npx vitest run test/render/services/WTFlightplanSync.test.ts test/render/SimVarSync.test.ts && npm test", "acceptanceCriteria": ["no planner write while disabled from the LVar switch-on, an FPL 0 change or the power-on procedure removal", "one write on the resume with the option on, none with it off", "no other test changes"], "modelTier": "standard"}
```

---

---

### Task 5: A user or temporary waypoint comes back from the EFB as itself (#187)

**Goal:** `KlnEfbLoader.loadLeg` returns, for a lat/lon leg whose `fixIcao` matches by region and ident a waypoint of
the facility repository (user XX or temporary XY, any type), that waypoint with its stored position; any other lat/lon
leg becomes a new temporary waypoint as before.

**Files:**
- Modify: `kln90b/services/KlnEfbLoader.ts` (`Facility` import, `loadLeg` at about :86, a new private
  `findHeldWaypoint`)
- Modify: `docs/architecture.md` (the `KlnEfbSaver`/`KlnEfbLoader` bullet)
- Test: `test/render/services/KlnEfbLoader.test.ts` (describe `EFB round trip of a user waypoint`)

**Acceptance Criteria:**
- [ ] The pin `loads a user waypoint that comes back from the EFB as that waypoint (#187)` passes as a plain `it`.
- [ ] Two user waypoints come back each as itself; a user VOR (sent as U XX) comes back as V XX; a temporary waypoint
  stays CUST over two round trips; a position changed in the EFB is dropped for the stored one.
- [ ] A user waypoint the unit no longer holds becomes a temporary waypoint of that name at the leg's position; a leg
  naming an airport FARM or an XY FARM does not match the user waypoint FARM (FARMA, FARMB).
- [ ] No other test changes (measured: only the pin), including the characterization `names a lat/lon leg after the
  first four characters of its name (characterization)`.

**Verify:** `npx vitest run test/render/services/KlnEfbLoader.test.ts test/render/services/KlnEfbSaver.test.ts
test/render/harness/efb.test.ts` → all pass; then `npm test` → 4465 tests, 22 expected fail, no failures.

**Steps:**

- [ ] **Step 1: Write the tests.** In `test/render/services/KlnEfbLoader.test.ts`, replace the describe `EFB round trip
  of a user waypoint` and its comment with (the file imports `FlightPlanRoute`, `Facility`, `FacilityType`, `ICAO`,
  `efbRoute`, `savedFlightplan`, `savedUserWaypoints`, `fplIdents`, `userWaypoints` already):

```ts
// Public contract (CLAUDE.md "Public contract with aircraft": the EFB route sync). The saver sends a user (XX) or
// temporary (XY) waypoint as a lat/lon leg named by its ICAO, always with the type U. The maintainer's ruling (#187): when
// the EFB syncs that leg back and the unit still holds the waypoint, it comes back as that waypoint, matched by region and
// ident whatever its type, with the position the unit holds; one it no longer holds is created anew as a temporary
// waypoint. The tests sync back exactly what the unit sent (whether the sim's EFB keeps the fixIcao is not known)
describe('EFB round trip of a user waypoint', () => {
    const farm = {icaoStruct: ICAO.value('U', 'XX', '', 'FARM')} as unknown as Facility;

    /** The route the unit answers the next request with, as a copy the EFB could sync back */
    function requestRoute(unit: HeadlessUnit): FlightPlanRoute {
        const before = unit.efb!.replies.length;
        unit.efb!.request();
        expect(unit.efb!.replies.length).toBe(before + 1);
        return JSON.parse(JSON.stringify(unit.efb!.replies[before].route));
    }

    async function syncBack(unit: HeadlessUnit, route: FlightPlanRoute): Promise<void> {
        unit.efb!.sync(route);
        await vi.advanceTimersByTimeAsync(2000);
    }

    /** FPL 0 KAAA, FARM (a user waypoint at 47.2 N 8.1 E), KBBB */
    async function bootWithFarm(): Promise<HeadlessUnit> {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {...savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}]), ...savedFlightplan(0, [kaaa, farm, kbbb])},
        });
        await settle(unit);
        return unit;
    }

    /** FPL 0 KAAA, FARM, KBBB; the route the unit answers with is synced back as the EFB got it */
    async function roundTrip(): Promise<HeadlessUnit> {
        const unit = await bootWithFarm();
        await syncBack(unit, requestRoute(unit));
        return unit;
    }

    /** The ICAO of each leg of FPL 0 in the SDK's V2 string form */
    const fpl0Icaos = (unit: HeadlessUnit) =>
        unit.props.memory.fplPage.flightplans[0].getLegs().map(l => ICAO.valueToStringV2(l.wpt.icaoStruct));

    // The setup of the pin: the route comes back with its three waypoints, the airports by their ICAO
    it('loads the route the unit sent with its three waypoints (the setup of #187)', async () => {
        const unit = await roundTrip();

        expect(fplIdents(unit).length).toBe(3);
        expect([fplIdents(unit)[0], fplIdents(unit)[2]]).toEqual(['KAAA', 'KBBB']);
    });

    it.fails('loads a user waypoint that comes back from the EFB as that waypoint (#187)', async () => {
        const unit = await roundTrip();

        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => ICAO.valueToStringV2(l.wpt.icaoStruct)))
            .toEqual(['A          KAAA    ', 'UXX        FARM    ', 'A          KBBB    ']);
        expect(userWaypoints(unit, FacilityType.USR).map(f => f.icaoStruct.ident)).toEqual(['FARM']);
    });

    // Each leg is matched by its own ident: two user waypoints of the same region come back as themselves
    it('loads two user waypoints that come back from the EFB each as itself (#187)', async () => {
        const lake = {icaoStruct: ICAO.value('U', 'XX', '', 'LAKE')} as unknown as Facility;
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {
                ...savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}, {kind: 'sup', ident: 'LAKE', lat: 47.3, lon: 8.2}]),
                ...savedFlightplan(0, [kaaa, farm, lake, kbbb]),
            },
        });
        await settle(unit);

        await syncBack(unit, requestRoute(unit));

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXX        FARM    ', 'UXX        LAKE    ', 'A          KBBB    ']);
    });

    // The saver sends the user VOR UVR as U XX UVR (KlnEfbSaver.toEnrouteSegment), so the type of the leg is not the type
    // of the waypoint
    it('loads a user VOR that comes back from the EFB as that VOR (#187)', async () => {
        const uvr = {icaoStruct: ICAO.value('V', 'XX', '', 'UVR')} as unknown as Facility;
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {
                ...savedUserWaypoints([{kind: 'vor', ident: 'UVR', lat: 47.2, lon: 8.1, freqMHz: 112.5, magvar: 2}]),
                ...savedFlightplan(0, [kaaa, uvr, kbbb]),
            },
        });
        await settle(unit);
        const route = requestRoute(unit);
        expect(route.enroute.map(l => ICAO.valueToStringV2(l.fixIcao))).toEqual(['UXX        UVR     ']); // Precondition: sent as U

        await syncBack(unit, route);

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'VXX        UVR     ', 'A          KBBB    ']);
        expect(userWaypoints(unit).map(f => f.icaoStruct.ident)).toEqual(['UVR']);
    });

    // A lat/lon leg of the EFB becomes the temporary waypoint CUST (region XY); the unit sends it back as U XY CUST
    it('loads a temporary waypoint that comes back from the EFB as that waypoint, over two round trips (#187)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        await syncBack(unit, efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.2, lon: 8.1}]}));
        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXY        CUST    ', 'A          KBBB    ']); // Precondition

        await syncBack(unit, requestRoute(unit));
        await syncBack(unit, requestRoute(unit));

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXY        CUST    ', 'A          KBBB    ']);
        expect(userWaypoints(unit).map(f => f.icaoStruct.ident)).toEqual(['CUST']);
    });

    // The waypoint the unit holds wins: a position changed on the way through the EFB is dropped
    it('keeps the position the unit holds when the EFB sends the user waypoint back elsewhere (#187)', async () => {
        const unit = await bootWithFarm();
        const route = requestRoute(unit);
        route.enroute[0].lat = 47.3;

        await syncBack(unit, route);

        const leg = unit.props.memory.fplPage.flightplans[0].getLegs()[1];
        expect(ICAO.valueToStringV2(leg.wpt.icaoStruct)).toBe('UXX        FARM    ');
        expect(leg.wpt.lat).toBeCloseTo(47.2, 6);
        expect(userWaypoints(unit).map(f => f.icaoStruct.ident)).toEqual(['FARM']);
    });

    // A user waypoint the unit no longer holds (deleted after the route went to the EFB) is created anew, as before the
    // fix: a temporary waypoint in region XY at the position of the leg, named after it because the ident is free
    it('creates a temporary waypoint for a user waypoint the unit no longer holds (#187)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        const route = efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.2, lon: 8.1}]});
        route.enroute[0].fixIcao = ICAO.value('U', 'XX', '', 'FARM'); // As the unit sent it before FARM was deleted

        await syncBack(unit, route);

        const leg = unit.props.memory.fplPage.flightplans[0].getLegs()[1];
        expect(ICAO.valueToStringV2(leg.wpt.icaoStruct)).toBe('UXY        FARM    ');
        expect(leg.wpt.lat).toBeCloseTo(47.2, 6);
        expect(leg.wpt.lon).toBeCloseTo(8.1, 6);
    });

    // The match is by region and ident: a lat/lon leg that names a fix of the data base (an airport FARM, no user region)
    // is not the user waypoint FARM, and a leg in region XY is not the user waypoint FARM in region XX. Both become new
    // temporary waypoints with a unique name
    it('does not take a lat/lon leg of another region with the same ident for the user waypoint (#187)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}]),
        });
        await settle(unit);
        const route = efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.2}, {lat: 47.3, lon: 8.3}]});
        route.enroute[0].fixIcao = ICAO.value('A', '', '', 'FARM');
        route.enroute[1].fixIcao = ICAO.value('U', 'XY', '', 'FARM');

        await syncBack(unit, route);

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXY        FARMA   ', 'UXY        FARMB   ', 'A          KBBB    ']);
    });
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run test/render/services/KlnEfbLoader.test.ts`. Expected FAIL: the
  two-waypoint, user VOR, temporary waypoint and moved-waypoint tests (each comes back as a new XY waypoint); the pin
  passes as an expected fail; the setup sibling, the deleted-waypoint and the other-region tests pass (they hold what
  must not change).

- [ ] **Step 3: Implement** in `kln90b/services/KlnEfbLoader.ts`: add `Facility` to the SDK import; `loadLeg` begins:

```ts
    private async loadLeg(enroute: DeepReadonly<FlightPlanRouteEnrouteLeg>): Promise<IcaoValue | null> {
        if (enroute.hasLatLon) {
            const held = this.findHeldWaypoint(enroute.fixIcao);
            if (held !== undefined) {
                return held.icaoStruct;
            }

            let ident = "CUST";
```

  and, after `loadLeg`:

```ts
    /**
     * #187, the maintainer's ruling: KlnEfbSaver sends a user (region XX) or temporary (region XY) waypoint as a lat/lon
     * leg whose fixIcao names it, always with the type U. When the EFB syncs that leg back and the unit still holds the
     * waypoint, the leg is that waypoint, matched by region and ident whatever its type, with the position the unit
     * holds. The repository holds only user and temporary waypoints, so a database fix never matches
     */
    private findHeldWaypoint(fixIcao: DeepReadonly<IcaoValue>): Facility | undefined {
        let held: Facility | undefined = undefined;
        this.facilityRepository.forEach(fac => {
            if (fac.icaoStruct.region === fixIcao.region && fac.icaoStruct.ident === fixIcao.ident) {
                held = fac;
            }
        });
        return held;
    }
```

- [ ] **Step 4: Flip the pin.** Drop `.fails` from `loads a user waypoint that comes back from the EFB as that waypoint
  (#187)`; keep its title.

- [ ] **Step 5: Docs.** In `docs/architecture.md`, the `KlnEfbSaver`/`KlnEfbLoader` bullet (as Task 3 left it) becomes:

```md
    - `KlnEfbSaver` answers EFB `avionicsRouteRequested` (only with `writeGPSSimVars` set); `KlnEfbLoader` loads
      `syncedAvionicsRoute` into FPL 0 (lat/lon legs become temporary user waypoints in region `XY`, except a leg whose
      `fixIcao` names, by region and ident, a user or temporary waypoint the unit holds: the saver sends those as lat/lon
      legs of type U, and they come back as themselves with the stored position, #187). While
      `Hardware.isDisabled` is set the request goes unanswered (#353) and the synced route is dropped (#188).
```

- [ ] **Step 6: Run the files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: all green, 4465 tests,
  22 expected fail.

- [ ] **Step 7: Commit** `fixes #187 load a user or temporary waypoint that comes back from the EFB as that waypoint`

**Conditions → tests:**

| Condition | Mutation | Red |
|---|---|---|
| the held waypoint is returned | `if (false)` around `return held.icaoStruct` | the pin, the two-waypoint, user VOR, temporary waypoint and moved-waypoint tests (deleted, other-region and setup tests stay green, as predicted) |
| the region must match | compare the ident only | `does not take a lat/lon leg of another region ...` only |
| the ident must match | compare the region only | `loads two user waypoints ... each as itself` and `does not take a lat/lon leg of another region ...` |

**Vehicles:** none (measured: only the pin changed).

```json:metadata
{"files": ["kln90b/services/KlnEfbLoader.ts", "docs/architecture.md", "test/render/services/KlnEfbLoader.test.ts"], "verifyCommand": "npx vitest run test/render/services/KlnEfbLoader.test.ts test/render/services/KlnEfbSaver.test.ts test/render/harness/efb.test.ts && npm test", "acceptanceCriteria": ["the #187 pin passes as a plain test", "user waypoints of any type and temporary waypoints come back as themselves with the stored position", "a waypoint the unit no longer holds, or a leg of another region, becomes a new temporary waypoint", "no other test changes"], "modelTier": "standard"}
```

---

### Task 6: The seeded random sequence starts again after the user settings are built

**Goal:** `bootUnit` starts the seeded `Math.random` sequence again right after the `KLN90BCore` constructor has built
the user settings, so that the number of setting keys no longer moves the GPS draws; the two seeded warm-start tests
get seeds that give the timings their titles state.

**Files:**
- Modify: `test/harness/sim/random.ts` (split out `mulberry32`)
- Modify: `test/harness/boot.ts` (the seed doc comment at about :55, `prepareBoot` at about :213 and :274)
- Modify: `test/render/GpsAcquisition.test.ts:28-30` (`FAST_WARM_SEED`, `SLOW_WARM_SEED`)
- Modify: `test/README.md` (section 3, "Isolation and time", the `Math.random` bullet)
- Test: `test/render/harness/teardown.test.ts` (describe `Math.random across a boot (harness)`)

**Acceptance Criteria:**
- [ ] A boot whose settings construction draws 90 more numbers draws, at the start of `init`, the first value of the
  seeded sequence (`0.011704753153026104` for seed 7).
- [ ] `GpsAcquisition.test.ts` "seed 12: a warm start can be as fast as 45 s (#62: 0:32)" and "seed 34: a warm start
  can take over 90 s (#62: 1:47)" pass, and stay green with `NUM_REMARKS = 100` applied temporarily (90 more keys).
- [ ] No other test changes (measured: the seed 15 test was the only one that changed; it is replaced by the seed 12
  test).

**Verify:** `npx vitest run test/render/harness/teardown.test.ts test/render/GpsAcquisition.test.ts test/unit/harness/fakes.test.ts` → all pass; then `npm test` → 4443 tests, no failures.

**Steps:**

- [ ] **Step 1: Write the harness test** at the end of the describe `Math.random across a boot (harness)` in
  `test/render/harness/teardown.test.ts`. The imports become:

```ts
import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {UserSettingSaveManager} from '@microsoft/msfs-sdk';
import {bootUnit, teardown} from '../../harness/boot';
import {KLN90BCore} from '../../../kln90b/KLN90BCore';
import {simEnv} from '../../harness/sim/install';
```

  and the new test, after `is the seeded generator while the unit lives and the real one again after the teardown`:

```ts
    // The SDK's UserSetting draws Math.random once per setting it builds, so every new setting key would shift each later
    // draw, the GPS start times of the seeded tests in GpsAcquisition.test.ts among them. bootUnit starts the sequence
    // again once the KLN90BCore constructor has built the settings
    it('starts the sequence again from the seed once the user settings are built, however many draws building them took', async () => {
        // 90 more draws while the settings are loaded, as 90 more setting keys would make
        const load = UserSettingSaveManager.prototype.load;
        const loadSpy = vi.spyOn(UserSettingSaveManager.prototype, 'load').mockImplementation(function (this: UserSettingSaveManager, key: string) {
            for (let i = 0; i < 90; i++) {
                Math.random();
            }
            load.call(this, key);
        });
        const init = KLN90BCore.prototype.init;
        let firstInInit: number | undefined;
        const initSpy = vi.spyOn(KLN90BCore.prototype, 'init').mockImplementation(function (this: KLN90BCore, xml: Document) {
            firstInInit = Math.random();
            return init.call(this, xml);
        });
        onTestFinished(() => {
            loadSpy.mockRestore();
            initSpy.mockRestore();
        });

        await bootUnit({seed: 7});

        expect(loadSpy).toHaveBeenCalledTimes(1); // Precondition: the extra draws ran inside the constructor
        // The first draw of mulberry32 from seed 7, computed once outside the harness from the published algorithm
        expect(firstInInit).toBe(0.011704753153026104);
    });
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run test/render/harness/teardown.test.ts`
Expected: the new test FAILS (`firstInInit` is a later draw of the sequence); the other two pass.

- [ ] **Step 3: Implement.** `test/harness/sim/random.ts` becomes:

```ts
import {Mock, vi} from 'vitest';

/**
 * The mulberry32 generator, started at seed
 * @param seed
 * @returns a function that returns the next draw in [0, 1)
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Replaces Math.random with mulberry32, so the GPS clock jitter and the scan-list job ids repeat between runs.
 * @param seed
 * @returns the spy, which the teardown of a boot restores so that Math.random is the real one again. bootUnit starts it
 * again from the seed with mockImplementation(mulberry32(seed)) once the user settings are built
 */
export function seedRandom(seed: number): Mock<() => number> {
    return vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
}
```

  In `test/harness/boot.ts`: the import becomes `import {mulberry32, seedRandom} from './sim/random';`; the `seed`
  option of `BootOptions` gets the doc comment
  `/** The seed of Math.random (sim/random.ts); the sequence starts again from it once the user settings are built. Default 1 */`;
  in `prepareBoot` the seeding becomes

```ts
    const seed = opts.seed ?? 1;
    const randomSpy = seedRandom(seed);
    state.restoreRandom = () => randomSpy.mockRestore();
```

  and right after `const core: KLN90BCore = new KLN90BCore(...)`:

```ts
    // The constructor built the user settings, and the SDK's UserSetting draws Math.random once per setting. Starting
    // the sequence again here keeps every later draw (the GPS jitter and start times) independent of the number of
    // setting keys, so a new key does not move the seeded tests
    randomSpy.mockImplementation(mulberry32(seed));
```

- [ ] **Step 4: Re-seed the two warm-start tests.** With the re-seed, seed 15 has its fix after 60 s (the test wants
  under 45 s) and seed 4 after 91 s (one second over its bound). A probe of seeds 1 to 40 (boot cold with the `WARM`
  storage, power on, count the seconds to `gps.isValid()`) gave 12 → 38 s and 34 → 105 s. In
  `test/render/GpsAcquisition.test.ts`:

```ts
/**
 * Seeds whose warm start lands at the ends of the observed spread. Found by a probe of seeds 1 to 40 on 2026-10-18, after
 * the harness began to start the sequence again once the user settings are built (test/harness/boot.ts): seed 12 had
 * its fix after 38 s, seed 34 after 105 s
 */
const FAST_WARM_SEED = 12;
const SLOW_WARM_SEED = 34;
```

  (The test titles are built from the constants: they now read "seed 12: ..." and "seed 34: ...".)

- [ ] **Step 5: Update `test/README.md`**, section 3 "Isolation and time", the `Math.random` bullet:

```md
- `Math.random` is replaced by a seeded generator (`sim/random.ts`, default seed 1), so the GPS clock jitter repeats
  between runs. A test that needs another jitter passes `seed`. The SDK's `UserSetting` draws once per setting it
  builds, so `bootUnit` starts the sequence again from the seed once the `KLN90BCore` constructor has built the user
  settings: a new setting key does not move the GPS draws of the seeded tests. The teardown puts the real
  `Math.random` back, so a later unit test of the file sees the real generator.
```

- [ ] **Step 6: Prove the decoupling, then restore.** Set `NUM_REMARKS = 100` in
  `kln90b/settings/KLN90BUserRemarkSettings.ts` (90 more keys), run
  `npx vitest run test/render/GpsAcquisition.test.ts` → all 79 pass (seed 12 and seed 34 included);
  `git checkout -- kln90b` and confirm `git status` shows only this task's files.

- [ ] **Step 7: Run `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: 4443 tests, all green.

- [ ] **Step 8: Commit** `Start the seeded random sequence again once the user settings are built, so that a new setting key does not move the GPS draws of the seeded tests`

**Conditions → tests:**

| condition | mutation | red |
|---|---|---|
| the re-seed after the constructor | delete the `randomSpy.mockImplementation(mulberry32(seed))` line | teardown.test.ts "starts the sequence again ..."; GpsAcquisition "seed 12 ..." and "seed 34 ..." |
| the re-seed uses the boot's seed | `mulberry32(1)` instead of `mulberry32(seed)` | the same three |

Stayed green as predicted: "is the seeded generator while the unit lives and the real one again after the teardown"
and the other 77 GpsAcquisition tests.

**Vehicles:** `GpsAcquisition.test.ts` "seed 15: a warm start can be as fast as 45 s (#62: 0:32)" (60 s with the
re-seed): replaced by seed 12. "seed 4 ... over 90 s" still passed at 91 s; it was moved to seed 34 for margin. No
other test changed.

```json:metadata
{"files": ["test/harness/sim/random.ts", "test/harness/boot.ts", "test/render/GpsAcquisition.test.ts", "test/render/harness/teardown.test.ts", "test/README.md"], "verifyCommand": "npx vitest run test/render/harness/teardown.test.ts test/render/GpsAcquisition.test.ts test/unit/harness/fakes.test.ts && npm test", "acceptanceCriteria": ["the first draw in init is the seed's first value despite 90 extra draws in the constructor", "the seed 12 and seed 34 warm-start tests pass, also with 90 more keys", "no other test changes"], "modelTier": "standard"}
```

---

---

### Task 7: The remarks of up to 100 airports (#92)

**Goal:** `RMKS FULL` only for the remarks of a new airport when 100 airports hold remarks; 100 remark slots
(`rmk10` to `rmk99` new, default `""`); every save empties the slots after the last airport, so a deleted remark does
not come back.

**Files:**
- Modify: `kln90b/settings/RemarksManager.ts` (`saveRemarks` :27-42, `saveAllRemarks` :70-77)
- Modify: `kln90b/settings/KLN90BUserRemarkSettings.ts:9`
- Modify: `docs/architecture.md` (Core 7, the `KLN90BUserRemarkSettings` bullet)
- Test: `test/unit/settings/RemarksManager.test.ts`, `test/render/pages/right/Apt5Page.test.ts`,
  `test/unit/settings/KLN90BUserSettingsSaverManager.test.ts`

**Acceptance Criteria:**
- [ ] The pins `does not bring a deleted remark back after a reload (#92)`, `keeps the remarks of an 11th airport after
  a reload (#92)`, `refuses the remarks of a 101st airport with RMKS FULL (3-47, C-2, #92)` (RemarksManager.test.ts) and
  `accepts the remarks of an 11th airport without RMKS FULL (3-47, C-2, #92)` (Apt5Page.test.ts) pass as plain `it`s.
- [ ] In a full list a change and a delete of a listed airport work (unit and APT 5), a delete of an unlisted airport
  does not throw, and a 101st airport on APT 5 shows `RMKS FULL` and is not stored.
- [ ] The exact key pin lists `rmk0` to `rmk99`.
- [ ] No other test changes (measured: the four pins and the key pin; the seeded GPS tests stay green thanks to Task 6).

**Verify:** `npx vitest run test/unit/settings test/render/pages/right/Apt5Page.test.ts test/render/pages/left/Oth4Page.test.ts` → all pass; then `npm test` → 4448 tests, no failures.

**Steps:**

- [ ] **Step 1: Write the tests.** In `test/unit/settings/RemarksManager.test.ts`: the header comment says
  `rmk0 to rmk99` instead of `rmk0 to rmk9`; the comment above `keeps the remarks of ten airports after a reload`
  becomes `// Ten airports were all the slots there were before #92`. Replace the describe
  `remarks of a 101st airport (3-47, C-2)` (with its local `managerWith100Airports`, which filled the private map
  because the slots could not hold 100 airports) by:

```ts
/** A manager loaded from 100 stored slots, the airports K000 to K099, laid out by hand from the format (Core 7) */
function managerWith100Airports(): RemarksManager {
    for (let i = 0; i < 100; i++) {
        setSlot(i, `K${String(i).padStart(3, '0')}X          ${' '.repeat(22)}`);
    }
    return new RemarksManager(bus, userSettings);
}

describe('remarks of a 101st airport (3-47, C-2)', () => {
    // 3-47: the unit holds the remarks of up to 100 airports. This is the sibling of the pin below: the same manager
    it('holds the remarks of 100 airports (3-47)', () => {
        const manager = managerWith100Airports();

        expect(manager.getAirportsWithRemarks()).toHaveLength(100);
        expect(manager.getRemarks('K099')).toEqual(['X          ', '           ', '           ']);
    });

    // C-2: the message RMKS FULL says that the remarks of another airport do not fit. Today the guard reads the length
    // of an object that has none, so it never fires and the save goes on to a slot that does not exist
    it.fails('refuses the remarks of a 101st airport with RMKS FULL (3-47, C-2, #92)', () => {
        const manager = managerWith100Airports();

        expect(() => manager.saveRemarks('KZZA', ['X          ', '           ', '           '])).toThrow('RMKS FULL');
        expect(manager.getAirportsWithRemarks()).toHaveLength(100);
        expect(manager.getAirportsWithRemarks()).not.toContain('KZZA');
    });
});

// 3-47 gives room for the remarks of 100 airports and C-2 names RMKS FULL for one more. A change or a delete of an
// airport that is listed adds no airport, so it fits a full list (the note on #92)
describe('remarks of an airport in a full list (#92)', () => {
    it('changes the remarks of an airport in a full list, and keeps the change after a reload (#92)', () => {
        const manager = managerWith100Airports();

        manager.saveRemarks('K050', ['CHANGED    ', '           ', '           ']);

        expect(new RemarksManager(bus, userSettings).getRemarks('K050')).toEqual(['CHANGED    ', '           ', '           ']);
    });

    it('deletes the remarks of an airport in a full list, which makes room for another (#92)', () => {
        const manager = managerWith100Airports();

        manager.deleteRemarks('K050');
        manager.saveRemarks('KZZA', ['X          ', '           ', '           ']);

        const reloaded = new RemarksManager(bus, userSettings).getAirportsWithRemarks();
        expect(reloaded).toHaveLength(100);
        expect(reloaded).not.toContain('K050');
        expect(reloaded).toContain('KZZA');
    });

    // OTH 4 deletes only listed airports and APT 5 always saves its three lines, so a pilot cannot reach this; the
    // method is public, and a delete never overflows the list
    it('accepts the delete of an airport without remarks in a full list (#92)', () => {
        const manager = managerWith100Airports();

        expect(() => manager.deleteRemarks('KZZA')).not.toThrow();
        expect(manager.getAirportsWithRemarks()).toHaveLength(100);
    });
});
```

  (The pin keeps `.fails` until Step 4; its comment says "Today", which Step 4 leaves, as the title is kept.)

  In `test/render/pages/right/Apt5Page.test.ts`, between the describe `APT 5 remarks of an 11th airport (#92)` and
  `APT 5 page (characterization)`:

```ts
/** The stored slots of 100 airports with remarks, K000 to K098 and then last, laid out by hand from the format (Core 7) */
const fullList = (last: string) => Object.fromEntries(Array.from({length: 100}, (_, i) =>
    [`rmk${i}`, (i === 99 ? last : `K${String(i).padStart(3, '0')}`) + 'X' + ' '.repeat(32)]));

/** Enters MOTEL in the first remark line of KAAA on APT 5 and returns the status line messages published meanwhile */
async function enterMotel(unit: HeadlessUnit): Promise<string[]> {
    const seen = collectStatusMessages(unit);
    await unit.panel.selectPage('R', 'APT 5');
    await unit.panel.cursor('R');
    await cursorToRow(unit, 2);
    await unit.panel.type('R', 'MOTEL');
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(1000);
    return seen;
}

describe('APT 5 remarks in a full list (3-47, C-2)', () => {
    // 3-47: remarks for up to 100 airports; C-2: RMKS FULL when the remarks of one more airport do not fit
    it('refuses the remarks of a 101st airport with RMKS FULL (3-47, C-2)', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}, storage: fullList('K099')});

        expect(await enterMotel(unit)).toEqual(['RMKS FULL']);
        expect(unit.props.remarksManager.getAirportsWithRemarks()).not.toContain('KAAA');
    });
});

// 3-47 and C-2 leave a change of a listed airport in a full list allowed, as it adds no airport (the note on #92)
describe('APT 5 remarks of an airport in a full list (#92)', () => {
    it('changes the remarks of an airport in a full list without RMKS FULL (#92)', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}, storage: fullList('KAAA')});

        expect(await enterMotel(unit)).toEqual([]);
        expect(storedSetting(unit, 'rmk99')).toBe('KAAAMOTEL      ' + ' '.repeat(22));
    });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/unit/settings/RemarksManager.test.ts test/render/pages/right/Apt5Page.test.ts`
Expected (measured): the three unit pins and the APT 5 pin pass as expected fails. FAIL: every unit test that uses
`managerWith100Airports` ("holds the remarks of 100 airports (3-47)", "changes the remarks of an airport in a full list,
and keeps the change after a reload (#92)", "deletes the remarks of an airport in a full list, which makes room for
another (#92)", "accepts the delete of an airport without remarks in a full list (#92)"), because `rmk10` does not
exist yet and `setSlot` throws; and on APT 5 "refuses the remarks of a 101st airport with RMKS FULL (3-47, C-2)" and
"changes the remarks of an airport in a full list without RMKS FULL (#92)", because only ten slots load.

- [ ] **Step 3: Implement.** `kln90b/settings/KLN90BUserRemarkSettings.ts:9`:

```ts
//3-47: the remarks of up to 100 airports, one slot each. rmk10 to rmk99 were added for #92 and default to ""
export const NUM_REMARKS = 100;
```

  `RemarksManager.saveRemarks`, the start up to the `if` that stores or deletes:

```ts
    public saveRemarks(ident: string, remarks: [string, string, string]) {
        const hasRemarks = remarks[0] || remarks[1] || remarks[2];
        //3-47, C-2: the remarks of up to 100 airports. Only a new airport can overflow the list; a change or a delete of
        //an airport in a full list always fits (#92)
        if (hasRemarks && !this.remarks.hasOwnProperty(ident) && Object.keys(this.remarks).length >= NUM_REMARKS) {
            throw new Error("RMKS FULL");
        }
        if (hasRemarks) {
            this.remarks[ident] = remarks;
        } else {
            delete this.remarks[ident];
        }
```

  `RemarksManager.saveAllRemarks`:

```ts
    private saveAllRemarks() {
        let i = 0;
        for (const ident in this.remarks) {
            const joinedText = this.remarks[ident].join("");
            this.manager.getSetting(`rmk${i}`).set(ident.padEnd(4, " ") + joinedText);
            i++;
        }
        //#92: the slots after the last airport are emptied, or a deleted airport's remarks come back at the next load
        for (; i < NUM_REMARKS; i++) {
            this.manager.getSetting(`rmk${i}`).set("");
        }
    }
```

  `docs/architecture.md`, Core 7:

```md
- `KLN90BUserRemarkSettings`: `rmk0..rmk99` (`NUM_REMARKS=100`, the 100 airports of 3-47; `rmk10` and up since #92).
  `RemarksManager` writes the airports into the first slots on every save and empties the rest.
```

- [ ] **Step 4: Flip the pins and update the key pin.** Drop `.fails` from the three unit pins and the APT 5 pin
  (titles kept). In `test/unit/settings/KLN90BUserSettingsSaverManager.test.ts` the header's last sentence becomes
  `#92 added the remark slots rmk10 to rmk99 (3-47: the remarks of 100 airports).` (replacing "When #92 is fixed with
  more remark slots, the `rmk` slots below change on purpose."), and the slot loop
  `for (let i = 0; i < 100; i++) expected[`${PREFIX}rmk${i}`] = '""';` (was `i < 10`), with the comment on the loops
  kept.

- [ ] **Step 5: Run the task's files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: 4448 tests,
  all green (Task 6 keeps the seeded GPS tests green; without it they fail here).

- [ ] **Step 6: Commit** `fixes #92 keep the remarks of up to 100 airports: RMKS FULL only for a new airport in a full list, 100 remark slots, and the unused slots emptied on every save`

**Conditions → tests:**

| condition | mutation | red |
|---|---|---|
| `hasRemarks &&` in the guard | drop it | unit "accepts the delete of an airport without remarks in a full list (#92)" |
| `!this.remarks.hasOwnProperty(ident) &&` | drop it | unit "changes the remarks of an airport in a full list ..."; APT 5 "changes the remarks ... without RMKS FULL (#92)" |
| `>= NUM_REMARKS` | `> NUM_REMARKS` | unit pin "refuses the remarks of a 101st airport ... (3-47, C-2, #92)"; APT 5 "refuses the remarks of a 101st airport with RMKS FULL (3-47, C-2)" |
| `NUM_REMARKS = 100` | back to 10 | key pin; unit 11th-airport pin; "holds the remarks of 100 airports (3-47)"; the 101st pin; the three full-list unit tests; APT 5 11th-airport pin; APT 5 change test |
| emptying the unused slots | delete the `set("")` in the loop | unit pin "does not bring a deleted remark back after a reload (#92)" |

Stayed green as predicted: under the `hasOwnProperty` mutation the full-list delete test (a delete has no remarks, so
the guard is skipped); under `NUM_REMARKS = 10` the APT 5 101st test (ten loaded airports are a full list too); under the
slot-emptying mutation the full-list delete test (100 airports rewrite all 100 slots).

**Vehicles:** `KLN90BUserSettingsSaverManager.test.ts` "saves every key under persistent-setting.<ATC MODEL>.profile_1
with its default" (the exact key pin; its comment anticipated this). No other test changed.

```json:metadata
{"files": ["kln90b/settings/RemarksManager.ts", "kln90b/settings/KLN90BUserRemarkSettings.ts", "docs/architecture.md", "test/unit/settings/RemarksManager.test.ts", "test/render/pages/right/Apt5Page.test.ts", "test/unit/settings/KLN90BUserSettingsSaverManager.test.ts"], "verifyCommand": "npx vitest run test/unit/settings test/render/pages/right/Apt5Page.test.ts test/render/pages/left/Oth4Page.test.ts && npm test", "acceptanceCriteria": ["the four #92 pins pass as plain tests", "RMKS FULL only for a new airport in a full list; change and delete work in a full list", "the key pin lists rmk0 to rmk99", "no other test changes"], "modelTier": "standard"}
```

---

---

### Task 8: The ALT page's ALERT and WARN over a power cycle (#259)

**Goal:** The ALT page's ALERT ON/OFF and WARN altitude become the user settings `altAlertEnabled` (default false) and
`altAlertWarn` (default 300 ft); `AltPageState` and its reset at the power-on go. `AltPage` and `AltAlert` read and
write the settings.

**Files:**
- Modify: `kln90b/settings/KLN90BUserSettings.ts` (type at :78, definitions after `altAlertVolume` at :196)
- Modify: `kln90b/data/VolatileMemory.ts` (`AltPageState` :35-38, the field :189-192, `reset` :262-263)
- Modify: `kln90b/pages/left/AltPage.tsx` (:33-40, `redraw` :66-78, `setAlertEnabled`/`setAlertWarn` :84-92)
- Modify: `kln90b/services/AltAlert.ts` (constructor :22, :27, :57), `kln90b/KLN90BCore.ts:345`
- Modify: `docs/architecture.md` (Core 7 user settings bullet; the `VolatileMemory` field lists in Core 7 and UI)
- Test: `test/render/pages/left/AltPage.test.ts`, `test/render/data/VolatileMemory.test.ts`,
  `test/unit/services/AltAlert.test.ts`, `test/unit/settings/KLN90BUserSettingsSaverManager.test.ts`

**Acceptance Criteria:**
- [ ] The pins `keeps the WARN altitude of 500 ft over a power cycle (3-55, #259)` (AltPage.test.ts) and `keeps the
  ALT warn altitude over a power cycle (3-55, #259)` (VolatileMemory.test.ts, rewritten against the setting) pass as
  plain `it`s.
- [ ] ALERT ON survives a power cycle; ALERT OFF survives with WARN 700 behind it; the page stores both settings; a new
  boot with stored settings shows them; an installation without altitude alerting shows ALERT OFF even with ON stored.
- [ ] The key pin lists `altAlertEnabled: false` and `altAlertWarn: 300`.
- [ ] No other test changes than the vehicles below (measured).

**Verify:** `npx vitest run test/unit/services/AltAlert.test.ts test/unit/settings test/render/data/VolatileMemory.test.ts test/render/pages/left/AltPage.test.ts` → all pass; then `npm test` → 4453 tests, no failures.

**Steps:**

- [ ] **Step 1: Write the new tests** in `test/render/pages/left/AltPage.test.ts`. In the describe `ALT page (spec)`,
  after `shows ALERT OFF and keeps the cursor off it when the installation disables altitude alerting (3-57)`:

```ts
    // 3-57 note: the same with ALERT ON stored from a time the installation had altitude alerting (#259 keeps it)
    it('shows ALERT OFF without the WARN line when the installation disables altitude alerting and ON is stored (3-57)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(ALTITUDE_ALERT(false)),
            storage: {altAlertEnabled: true, altAlertWarn: 500},
        });
        await unit.panel.alt();

        expect(Screen.read().rows('L')).toEqual([' ALTITUDE  ', 'BARO:29.92"', 'ALERT:  OFF', '           ', '           ', '           ']);
    });
```

  The comment above the describe `ALT page WARN altitude over a power cycle` becomes:

```ts
// 3-55 step 4: the pilot normally enters the warn altitude only the first time altitude alerting is used, so the unit
// keeps it (the user setting altAlertWarn since #259). The AVsoftech trainer (unreliable) kept WARN 500 over a power cycle
```

  and at the end of the file:

```ts
// The maintainer's ruling (#259): ALERT ON/OFF is kept over a power cycle, as the WARN altitude is. The AVsoftech
// trainer (unreliable) kept both, ON with WARN 500 and OFF with WARN 700 behind it. The guide does not say
describe('ALT page ALERT over a power cycle (#259)', () => {
    /** The ALT page closed, a power cycle of one second, the self-test approved, and the ALT page opened again */
    async function cycleToAlt(unit: HeadlessUnit) {
        await unit.panel.alt();
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.alt();
    }

    it('keeps ALERT ON over a power cycle (#259)', async () => {
        const unit = await bootUnit({panelXml: panelXml(ALTITUDE_ALERT(true))});
        await alertOn(unit);

        await cycleToAlt(unit);

        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['ALERT: ON ›', 'WARN:±300ft']);
    });

    it('keeps ALERT OFF over a power cycle, with the WARN altitude behind it (#259)', async () => {
        const unit = await bootUnit({panelXml: panelXml(ALTITUDE_ALERT(true))});
        await alertOn(unit);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4); // WARN 700
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', -1); // ALERT OFF
        expect(Screen.read().rows('L')[2]).toBe('ALERT:  OFF'); // The precondition: the WARN line is hidden

        await cycleToAlt(unit);

        expect(Screen.read().rows('L')[2]).toBe('ALERT:  OFF');
        await unit.panel.alt(); // Closes the page; alertOn opens it again
        await alertOn(unit);
        expect(Screen.read().rows('L')[4]).toBe('WARN:±700ft');
    });
});

// Persisted user data (CLAUDE.md "Public contract with aircraft", docs/architecture.md Core 7): ALERT and WARN are the
// user settings altAlertEnabled and altAlertWarn (#259), saved per aircraft model, so they survive a sim restart too
describe('ALT page ALERT and WARN as user settings (#259)', () => {
    it('saves ALERT ON and WARN 500 in the user settings (#259)', async () => {
        const unit = await bootUnit({panelXml: panelXml(ALTITUDE_ALERT(true))});
        await alertOn(unit);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 2); // WARN 500
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'altAlertEnabled')).toBe(true);
        expect(storedSetting(unit, 'altAlertWarn')).toBe(500);
    });

    it('shows the stored ALERT ON and WARN 500 at a new boot (#259)', async () => {
        const unit = await bootUnit({panelXml: panelXml(ALTITUDE_ALERT(true)), storage: {altAlertEnabled: true, altAlertWarn: 500}});
        await unit.panel.alt();

        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['ALERT: ON ›', 'WARN:±500ft']);
    });
});
```

  The new tests state `ALTITUDE_ALERT(true)` already, so Task 17 (#141) does not have to touch them.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run test/render/pages/left/AltPage.test.ts`
Expected: FAIL: "keeps ALERT ON over a power cycle (#259)", "keeps ALERT OFF over a power cycle, with the WARN altitude
behind it (#259)" (WARN back at 300), "saves ALERT ON and WARN 500 in the user settings (#259)" and "shows the stored
ALERT ON and WARN 500 at a new boot (#259)"; the WARN pin passes as an expected fail. The stored-ON 3-57 test passes
before Step 3, because nothing reads the key yet; it holds the installation condition of `isAlertOn` (see the table).

- [ ] **Step 3: Implement.** `KLN90BUserSettingsTypes`, after `altAlertVolume: number;`:

```ts
    altAlertEnabled: boolean;
    altAlertWarn: number;
```

  and after the `altAlertVolume` definition:

```ts
            {
                //ALT page ALERT ON/OFF, kept over a power cycle (the maintainer's ruling, #259)
                name: "altAlertEnabled",
                defaultValue: false,
            },
            {
                //ALT page WARN in ft; 3-55: entered only the first time altitude alerting is used, so it is kept (#259)
                name: "altAlertWarn",
                defaultValue: 300,
            },
```

  `VolatileMemory.ts`: delete the interface `AltPageState`, the field `altPage` and the two lines
  `this.altPage.alertEnabled = false;` and `this.altPage.alertWarn = 300;` in `reset`.

  `AltPage.tsx`, the constructor's children and read-only flags:

```ts
        this.children = new UIElementChildren<AltPageTypes>({
            baro: BaroFieldsetFactory.createBaroFieldSet(this.props.sensors.in.airdata.barometer, this.props.userSettings, this.saveBaro.bind(this)),
            alert: new SelectField([" OFF", "ON ›"], this.isAlertOn() ? 1 : 0, this.setAlertEnabled.bind(this)),
            warn: new SelectField(["2", "3", "4", "5", "6", "7", "8", "9"], this.props.userSettings.getSetting("altAlertWarn").get() / 100 - 2, this.setAlertWarn.bind(this)),
        });

        this.children.get("baro").setReadonly(isBaroTransmitted(this.props.planeSettings));

        this.children.get("alert").isReadonly = !this.props.planeSettings.output.altitudeAlertEnabled;
        this.children.get("warn").isReadonly = !this.isAlertOn();
```

  `redraw`:

```ts
    protected redraw() {
        super.redraw();

        if (this.isAlertOn()) {
            this.brRef.instance.classList.remove("d-none");
            this.warnRef.instance.classList.remove("d-none");
        } else {
            this.brRef.instance.classList.add("d-none");
            this.warnRef.instance.classList.add("d-none");
        }
    }
```

  and the end of the class:

```ts
    /**
     * ALERT ON/OFF is a user setting (#259). 3-57: an installation without altitude alerting shows OFF, whatever was
     * stored while it had it
     */
    private isAlertOn(): boolean {
        return this.props.planeSettings.output.altitudeAlertEnabled && this.props.userSettings.getSetting("altAlertEnabled").get();
    }

    private setAlertEnabled(enabled: number) {
        this.props.userSettings.getSetting("altAlertEnabled").set(enabled === 1);
        this.children.get("warn").isReadonly = !this.isAlertOn();
        this.requiresRedraw = true;
    }

    private setAlertWarn(warn: number) {
        this.props.userSettings.getSetting("altAlertWarn").set((warn + 2) * 100);
    }
```

  `AltAlert.ts`: add `import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";`, the constructor becomes
  `constructor(private memory: VolatileMemory, private settings: KLN90PlaneSettings, private sensors: Sensors, private readonly userSettings: KLN90BUserSettings) {`,
  the first guard reads `if (!this.userSettings.getSetting("altAlertEnabled").get() || indicatedAlt === null || !this.settings.output.altitudeAlertEnabled) {`
  and the REACHED case `if (!this.isAltWithinWindow(roundetAlt, this.selectedAltitude, this.userSettings.getSetting("altAlertWarn").get())) {`.
  `KLN90BCore.ts:345`: `new AltAlert(memory, this.planeSettings, sensors, this.userSettings),`.

  `docs/architecture.md`: in Core 7 the `KLN90BUserSettings` bullet's "alert settings," becomes "alert settings\n  (the
  ALT page's `altAlertEnabled` and `altAlertWarn` since #259, which a power cycle keeps),"; in the `VolatileMemory`
  bullet of Core 7 drop `` `altPage`, `` from the field list; in the UI section's "durable state lives in" sentence drop
  `` `altPage`, `` and end it with "or in `userSettings` (the ALT page's ALERT and WARN, #259)."

- [ ] **Step 4: Update the vehicles and flip the pins** (each measured; `tsc` also flags the first five):
  - `AltPage.test.ts` "shows the arrow after ON and the WARN line (3-55)": the last line becomes
    `expect(unit.props.userSettings.getSetting('altAlertEnabled').get()).toBe(true); // #259: ALERT is a user setting`.
  - `AltPage.test.ts` "offers the warn altitudes 200 to 900 ft in 100 ft steps (3-55)": the loop line becomes
    ``seen.add(`${Screen.read().rows('L')[4]} ${unit.props.userSettings.getSetting('altAlertWarn').get()}`); // #259: a user setting``.
  - `AltPage.test.ts` pin: drop `.fails` from `keeps the WARN altitude of 500 ft over a power cycle (3-55, #259)`.
  - `VolatileMemory.test.ts` "puts the page state back to its defaults at the power-on (characterization)" (the #192
    characterization): delete `m.altPage.alertEnabled = true;`, `m.altPage.alertWarn = 500;` and
    `expect(m.altPage.alertEnabled).toBe(false); // Whether the on/off switch survives is not settled`; the comment above
    the assignments ends "... (it drops an invalid one itself). The ALT page's ALERT and WARN are user settings since
    #259, which reset() does not touch (the test below)".
  - `VolatileMemory.test.ts` pin, rewritten against the setting (the field it read is gone, so it would have turned red
    for the wrong reason):

```ts
// 3-55 step 4: the pilot normally enters the warn altitude only the first time altitude alerting is used, so the unit
// keeps it. Since #259 it is the user setting altAlertWarn, which the power-on leaves alone; the ALT page tests show it
describe('the ALT warn altitude over a power cycle', () => {
    it('keeps the ALT warn altitude over a power cycle (3-55, #259)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const warn = unit.props.userSettings.getSetting('altAlertWarn');
        warn.set(500);
        await vi.advanceTimersByTimeAsync(2000);
        expect(warn.get()).toBe(500); // The precondition: nothing else resets it

        await cycle(unit);

        expect(warn.get()).toBe(500);
    });
});
```

  - `AltAlert.test.ts` (all twelve tests fail through the rig, which has no settings): imports add
    `import {EventBus} from '@microsoft/msfs-sdk';` and
    `import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';`; the header's first sentence ends
    "ALERT ON/OFF and WARN are set on the ALT page and kept in the user settings\n// altAlertEnabled and altAlertWarn
    (#259), SEL on NAV 4"; the rig becomes:

```ts
interface Rig {
    alert: AltAlert;
    /** The tone counts requested so far, one entry per alert */
    tones: number[];
    /** Sets IND and runs one calculation tick */
    at: (indFt: number | null) => void;
    memory: { navPage: { nav4SelectedAltitude: number } };
    /** The ALT page's ALERT and WARN (#259) */
    userSettings: KLN90BUserSettings;
}

function rig(opts: { sel: number, warn?: number, alertEnabled?: boolean, installed?: boolean }): Rig {
    const memory = {
        navPage: {nav4SelectedAltitude: opts.sel},
    };
    // #259: ALERT and WARN are user settings. The rig's own bus keeps the tests of this file apart
    const userSettings = new KLN90BUserSettings(new EventBus());
    userSettings.getSetting('altAlertEnabled').set(opts.alertEnabled ?? true);
    userSettings.getSetting('altAlertWarn').set(opts.warn ?? 300);
    let ind: number | null = null;
    const tones: number[] = [];
    const sensors = {
        in: {airdata: {getIndicatedAlt: () => ind}},
        out: {audioGenerator: {shortBeeps: (n: number) => tones.push(n)}},
    } as unknown as Sensors;
    const settings = {output: {altitudeAlertEnabled: opts.installed ?? true}} as unknown as KLN90PlaneSettings;
    const alert = new AltAlert(memory as unknown as VolatileMemory, settings, sensors, userSettings);
    return {
        alert, tones, memory, userSettings, at: (v) => {
            ind = v;
            alert.tick();
        },
    };
}
```

    and in "gives three tones at once when switched on within 1000 ft of SEL (characterization)"
    `r.memory.altPage.alertEnabled = true;` becomes `r.userSettings.getSetting('altAlertEnabled').set(true);`.
  - `KLN90BUserSettingsSaverManager.test.ts`: after `altAlertVolume: 99,` add `altAlertEnabled: false, // #259` and
    `altAlertWarn: 300, // #259`.

- [ ] **Step 5: Run the task's files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: 4453 tests,
  all green.

- [ ] **Step 6: Commit** `fixes #259 keep the ALT page's ALERT and WARN over a power cycle as the user settings altAlertEnabled and altAlertWarn`

  After the cherry-pick the controller comments on #192 that the ALT page is decided (#259: both kept as user
  settings). The implementer makes no GitHub write.

**Conditions → tests:**

| condition | mutation | red |
|---|---|---|
| `isAlertOn`: the installation | `return this.props.userSettings...` only | "shows ALERT OFF without the WARN line when the installation disables altitude alerting and ON is stored (3-57)" |
| `setAlertEnabled` writes the setting | delete the `set(enabled === 1)` line | 8 AltPage tests, among them "keeps ALERT ON", "keeps ALERT OFF", "saves ALERT ON and WARN 500", the WARN pin |
| `setAlertWarn` writes the setting | delete its line | "offers the warn altitudes ...", the WARN pin, "keeps ALERT OFF ... 700", "saves ALERT ON and WARN 500" |
| the WARN field starts from the setting | constant `1` (300 ft) | the WARN pin, "keeps ALERT OFF ... 700", "shows the stored ALERT ON and WARN 500 at a new boot" |
| `warn.isReadonly = !this.isAlertOn()` | `= false` | "shows ALERT OFF and keeps the cursor off it when the installation disables altitude alerting (3-57)" |
| `AltAlert` reads `altAlertEnabled` | drop that guard | AltAlert "stays silent with ALERT OFF (3-55)" |
| `AltAlert` reads `altAlertWarn` | constant 300 | AltAlert "gives four tones on a deviation below SEL with WARN 500 (3-56)" |
| no reset of WARN at the power-on (the bug back) | a `powerEvent` handler in `VolatileMemory` that sets `altAlertWarn` to 300 | AltPage WARN pin, "keeps ALERT OFF ... 700", "shows the stored ... at a new boot", VolatileMemory pin |
| no reset of ALERT at the power-on | the same handler setting `altAlertEnabled` to false | "keeps ALERT ON over a power cycle (#259)", "shows the stored ... at a new boot" |
| `altAlertWarn` default 300 | 400 | key pin; 8 AltPage tests that read ±300 or step from it |
| `altAlertEnabled` default false | true | key pin; 6 AltPage tests whose cursor or rows assume OFF |

Stayed green as predicted: under the `altAlertEnabled` guard mutation in `AltAlert`, "gives three tones at once when
switched on within 1000 ft of SEL (characterization)" (its first tick already beeps three times, and its expectation
`[3]` holds either way: that test does not hold the guard; "stays silent with ALERT OFF" does).

**Vehicles (measured):** `AltAlert.test.ts` all twelve (the rig), `KLN90BUserSettingsSaverManager.test.ts` key pin,
`VolatileMemory.test.ts` "puts the page state back to its defaults at the power-on (characterization)", `AltPage.test.ts`
"shows the arrow after ON and the WARN line (3-55)" and "offers the warn altitudes 200 to 900 ft in 100 ft steps (3-55)".
The VolatileMemory pin did not change result (it stayed an expected fail, now for the wrong reason, `altPage`
undefined), so it is rewritten as above. No flight test changed.

```json:metadata
{"files": ["kln90b/settings/KLN90BUserSettings.ts", "kln90b/data/VolatileMemory.ts", "kln90b/pages/left/AltPage.tsx", "kln90b/services/AltAlert.ts", "kln90b/KLN90BCore.ts", "docs/architecture.md", "test/render/pages/left/AltPage.test.ts", "test/render/data/VolatileMemory.test.ts", "test/unit/services/AltAlert.test.ts", "test/unit/settings/KLN90BUserSettingsSaverManager.test.ts"], "verifyCommand": "npx vitest run test/unit/services/AltAlert.test.ts test/unit/settings test/render/data/VolatileMemory.test.ts test/render/pages/left/AltPage.test.ts && npm test", "acceptanceCriteria": ["both #259 pins pass as plain tests", "ALERT ON and OFF and WARN survive a power cycle and a new boot", "an installation without alerting shows OFF", "the key pin lists the two new keys", "only the measured vehicles change"], "modelTier": "standard"}
```

---

---

### Task 9: V1 longitudes of 100° or more (#101)

**Goal:** `UserWaypointLoaderV1.deserializeLon` reads the three degree digits at 21-23 again.

**Files:**
- Modify: `kln90b/settings/UserWaypointLoaderV1.ts:268-274`
- Test: `test/unit/settings/UserWaypointV1.test.ts`

**Acceptance Criteria:**
- [ ] The pin `restores a V1 longitude of 100° or more (#101)` passes as a plain `it`.
- [ ] A new test restores 139°15'E as 139.25.
- [ ] No other test changes (measured).

**Verify:** `npx vitest run test/unit/settings/UserWaypointV1.test.ts` → all pass; then `npm test` → 4454 tests, no failures.

**Steps:**

- [ ] **Step 1: Write the test** after the pin in `test/unit/settings/UserWaypointV1.test.ts`:

```ts
    // The east of the issue's reproduction: 139 degrees 15 minutes east
    it('restores an eastern V1 longitude of 100° or more (#101)', () => {
        restoreV1('WXX    EAST +3400.00+13915.00');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'EAST'))!;
        expect(wpt.lon).toBeCloseTo(139.25, 6);
    });
```

- [ ] **Step 2: Run it to see it fail.** `npx vitest run test/unit/settings/UserWaypointV1.test.ts` → the new test
  FAILS (39.25); the pin passes as an expected fail.

- [ ] **Step 3: Implement.** `deserializeLon`:

```ts
    private deserializeLon(str: string): number {
        const sign = str.substring(20, 21) == '-' ? -1 : 1;
        //#101: the three degree digits follow the sign at 20 (the 1.x serializer wrote them with "+000"). Unlike V2, the
        //slice never held the sign
        const degrees = Number(str.substring(21, 24));
        const minutes = Number(str.substring(24, 29)) / 60;

        return sign * (degrees + minutes);
    }
```

- [ ] **Step 4: Flip the pin** (drop `.fails`, title kept).

- [ ] **Step 5: Run `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: 4454 tests, all green.

- [ ] **Step 6: Commit** `fixes #101 read the three degree digits of a V1 longitude, so that a user waypoint at 100 degrees or more keeps its position in the conversion`

  Release notes (final report): waypoints already converted by 2.2 or later stay wrong (the maintainer's ruling, #101:
  no repair code).

**Conditions → tests:**

| condition | mutation | red |
|---|---|---|
| the slice starts at 21 | `substring(22, 24)` (the bug) | the pin, the eastern test |
| the slice leaves the sign out | `substring(20, 24)` | the pin, "restores an intersection with a western longitude (#47)", "restores an airport with altitude, runway length and surface (#47)", "restores an NDB with its position and frequency" |

**Vehicles:** none.

```json:metadata
{"files": ["kln90b/settings/UserWaypointLoaderV1.ts", "test/unit/settings/UserWaypointV1.test.ts"], "verifyCommand": "npx vitest run test/unit/settings/UserWaypointV1.test.ts && npm test", "acceptanceCriteria": ["the #101 pin passes as a plain test", "139 degrees 15 minutes east restores as 139.25", "no other test changes"], "modelTier": "standard"}
```

---

---

### Task 10: The ALT page opens with the cursor off when no field can take it (#399)

**Goal:** `AltPage` turns its cursor on only when the baro or ALERT can take it, so the ALT key opens the page (the
altimeter's baro, `ALERT: OFF`, the cursor off) instead of throwing on an installation with an air data baro and
altitude alerting disabled. A local fix, as SET 5 and SET 9 decide their cursor in the page for FEATURE DISABLED;
`CursorController` is unchanged.

**Order:** built and measured after Task 9 and before Task 17 (#141); it applies and passes after Task 17 too
(measured). With it first, Task 17's `ALTITUDE_ALERT(true)` in the BaroFieldset vehicle is no longer needed (see
notes).

**Files:**
- Modify: `kln90b/pages/left/AltPage.tsx:37-43` (the constructor)
- Modify: `docs/architecture.md` (CursorController section, the `toggleCursor()` bullet, about :957)
- Test: `test/render/pages/left/AltPage.test.ts` (a helper and a describe before the `3-55 step 4` comment of `ALT page
  WARN altitude over a power cycle`)

**Acceptance Criteria:**
- [ ] With `AIRDATA`, `Input.Airdata.BaroSource` 1 and `ALTITUDE_ALERT(false)`, ALT shows the rows `' ALTITUDE  '`,
  `'BARO:30.12"'`, `'ALERT:  OFF'` and three blank rows, nothing inverse on the left, `ALT` as the left page name, and
  `unit.errors` empty.
- [ ] The left CRSR on that page leaves the cursor off without an error.
- [ ] The cursor still starts on the baro with altitude alerting disabled (3-57 test) and on ALERT with the air data
  baro (characterization).

**Verify:** `npx vitest run test/render/pages/left/AltPage.test.ts` → 18 passed; then `npm test` → 4439 passed | 17
expected fail (4456) (measured on top of Task 9).

**Steps:**

- [ ] **Step 1: The tests.** In `test/render/pages/left/AltPage.test.ts` (it already imports `HeadlessUnit`, `AIRDATA`,
  `ALTITUDE_ALERT`, `panelXml`), insert before the comment `// 3-55 step 4: the pilot normally enters the warn altitude
  ...`:

```ts
/**
 * A unit whose air data computer sends the baro setting (BaroSource 1), with 30.12" on the altimeter, and whose
 * installation disables altitude alerting
 */
async function airdataBaroWithoutAlerting(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        panelXml: panelXml({...AIRDATA, 'Input.Airdata.BaroSource': 1, ...ALTITUDE_ALERT(false)}),
        simVars: [{name: 'KOHLSMAN SETTING HG:1', unit: 'inches of mercury', value: 30.12}],
    });
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

// #399: the baro comes from the altimeter and ALERT cannot be changed, so no field can take the cursor and the page
// opens with it off. What the page shows is the ALT page of 3-39 and 3-55 (the baro and ALERT) with OFF for an
// installation without altitude alerting (3-57)
describe('ALT page with the air data baro and altitude alerting disabled (#399)', () => {
    it('opens with the altimeter\'s baro, ALERT: OFF and the cursor off (#399)', async () => {
        const unit = await airdataBaroWithoutAlerting();
        await unit.panel.alt();

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        expect(screen.rows('L')).toEqual([' ALTITUDE  ', 'BARO:30.12"', 'ALERT:  OFF', '           ', '           ', '           ']);
        expect(screen.maskRows('L').join('')).toMatch(/^\.+$/); // Nothing inverse: no field under a cursor
        expect(screen.status().left).toBe('ALT'); // The page name, where the cursor would show CRSR
    });

    // The left CRSR finds no field either: the cursor stays off and nothing throws
    it('keeps the cursor off at the left CRSR (#399)', async () => {
        const unit = await airdataBaroWithoutAlerting();
        await unit.panel.alt();
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().maskRows('L').join('')).toMatch(/^\.+$/);
        expect(Screen.read().status().left).toBe('ALT');
    });
});
```

- [ ] **Step 2: Run to see them fail.** `npx vitest run test/render/pages/left/AltPage.test.ts` → 2 failed (`unit.errors`
  holds `The cursor cannot be set, there are no fields`), 16 passed.

- [ ] **Step 3: Implement.** In `kln90b/pages/left/AltPage.tsx` replace the end of the constructor, from
  `this.children.get("baro").setReadonly(...)` on:

```ts
        const baroReadonly = isBaroTransmitted(this.props.planeSettings);
        const alertReadonly = !this.props.planeSettings.output.altitudeAlertEnabled;
        this.children.get("baro").setReadonly(baroReadonly);

        this.children.get("alert").isReadonly = alertReadonly;
        this.children.get("warn").isReadonly = !this.isAlertOn();

        this.cursorController = new CursorController(this.children);
        //#399: with the baro from the air data and no altitude alerting no field can take the cursor (WARN is read-only
        //while ALERT is off), so the page opens with the cursor off
        if (!baroReadonly || !alertReadonly) {
            this.cursorController.setCursorActive(true);
        }
    }
```

- [ ] **Step 4: The architecture doc.** In `docs/architecture.md`, CursorController section, the bullet that starts
  with `toggleCursor()` begins:

```markdown
- `toggleCursor()` returns false when there are no fields, while `setCursorActive(true)` throws then. A page that turns
  its cursor on when it opens checks first that a field can take it (`AltPage` with the air data baro and altitude
  alerting disabled opens with the cursor off, #399). The cursor does not remember where it was: each time it
```

  (the rest of the bullet unchanged).

- [ ] **Step 5: Run the file, then `npm test` (4439 passed | 17 expected fail, 4456), `npx tsc --noEmit`, `npm run
  build`.**

- [ ] **Step 6: Commit** `fixes #399 open the ALT page with the cursor off when no field can take it, so that the ALT key works with the air data baro and altitude alerting disabled`

**Conditions → tests** (measured on the commit, over every file that opens the ALT page: `AltPage.test.ts`,
`BaroFieldset.test.ts`, `MainPage.test.ts`, render and unit `PersistentMessages.test.ts`, `KlnEfbLoader.test.ts`,
`HEvents.test.ts`):

| Condition | Mutation | Red |
|---|---|---|
| a field can take the cursor | `if (true)` (the old constructor) | 2: both #399 tests |
| the baro can take it | `if (!alertReadonly)` | 1: `shows ALERT OFF and keeps the cursor off it when the installation disables altitude alerting (3-57)` |
| ALERT can take it | `if (!baroReadonly)` | 1: `shows the baro setting of the altimeter and skips it with the cursor (characterization)` |
| the cursor turned on at all | `if (false)` | 33, among them the ALT page spec tests, the baro fieldset tests and the pushed-page knob tests of `MainPage.test.ts` |

Predicted green and stayed green: the #399 tests under the two sub-condition mutations (with both fields read-only
either sub-condition is false).

**Vehicles:** none (full-suite diff on top of Task 9: only the two new tests).

```json:metadata
{"files": ["kln90b/pages/left/AltPage.tsx", "docs/architecture.md", "test/render/pages/left/AltPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/AltPage.test.ts && npm test", "acceptanceCriteria": ["ALT opens without an error, the cursor off, with the air data baro and ALERT OFF", "CRSR leaves the cursor off there", "the cursor still starts on the baro or ALERT when one can take it"], "modelTier": "mechanical"}
```

---

### Task 11: DATA BASE OUT OF DATE is listed once and stays until it is read (#175)

**Goal:** `DatabaseOutOfDateMessage` latches at the change from current to expired and holds until it is seen; the
data base posts no one-time copy of its own any more. One copy on every path (SET 2, the self-test date entry, the GPS
correcting the date, the end passing in flight), none when the validity did not change (no stacking), none at a
power-up with the date already past the end, gone once read.

**Files:**
- Modify: `kln90b/data/PersistentMessages.ts:143-161` (the `DatabaseOutOfDateMessage` class)
- Modify: `kln90b/data/MessageHandler.ts:6-10` (the `Message` interface), `:55-60` (`clear()`)
- Modify: `kln90b/data/navdata/Database.ts` (the whole file: no subscription, constructor `(sensors)`)
- Modify: `kln90b/KLN90BCore.ts:391` (`new Database(sensors)`)
- Modify: `docs/architecture.md:284-286` (GPS, `timeUpdatedEvent`) and `:688-690` (Core 9, messages)
- Test: `test/unit/data/PersistentMessages.test.ts` (the `DATA BASE OUT OF DATE` describe, about :371-403)
- Test: `test/render/data/PersistentMessages.test.ts` (from the `DATA BASE OUT OF DATE after a date entered on SET 2
  (B-2)` describe, about :106, to the end of the file)
- Test: `test/render/GpsAcquisition.test.ts` (the `DATA BASE OUT OF DATE after the GPS sets the date (B-2)` describe,
  about :753-776)
- Test: `test/unit/data/navdata/Database.test.ts` (constructor calls; the `DATA BASE OUT OF DATE on a time update`
  describe is deleted)

**Acceptance Criteria:**
- [ ] The unit pin `stays until it is read (B-2, 3-16) (#175)` and the render pin `lists the message once (B-2) (#175)`
  are plain `it` with their titles kept, and pass.
- [ ] After a SET 2 date past the end the MSG list holds the message exactly once at every display tick, unread; after
  `readMessages()` it is gone while the data base stays out of date.
- [ ] A second SET 2 date past the end leaves one copy; two SET 2 time entries while the date is already past the end
  leave none; a boot already past the end lists none, and SET 2 back into the period lists none.
- [ ] A self-test date past the end lists it once, unread, through the approval.
- [ ] From the GPS fix that moves the date past the end, it is listed once at every display tick, unread.
- [ ] An unread copy does not come back after a power cycle; a data base that expired while the unit was off posts
  nothing at the power-on.
- [ ] `Database` has no `timeUpdatedEvent` subscription and no message handler.

**Verify:** `npx vitest run test/unit/data/PersistentMessages.test.ts test/render/data/PersistentMessages.test.ts test/render/GpsAcquisition.test.ts test/unit/data/navdata/Database.test.ts`
→ all pass; then `npm test` → 4429 passed | 22 expected fail (4451).

**Steps:**

- [ ] **Step 1: Convert the unit pin and add the unit tests.** In `test/unit/data/PersistentMessages.test.ts`, replace
  the pin `it.fails('stays until it is read (B-2, 3-16) (#175)', ...)` and its comment (the end of the
  `DATA BASE OUT OF DATE` describe) with:

```ts
    // B-2, 3-16: a message is there for the pilot to read. Before #175 the condition was true for one calculation tick
    // only, so the message was gone a second later, unread, and the MSG prompt with it. The data base expiring while the
    // unit runs is this path: the stub turns from current to expired between two ticks
    it('stays until it is read (B-2, 3-16) (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        h.tick();
        expect(h.tick()).toEqual([DB_TEXT]);
        expect(h.handler.hasUnreadMessages()).toBe(true);
    });

    // Checked in the KLN 89 trainer, 2026-10-18: after the message was read, the prompt was gone and the message page
    // showed no message. The data base stays out of date, so only the read ends it
    it('is gone once it is read, while the data base stays out of date (checked in the KLN 89 trainer, 2026-10-18) (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        expect(h.tick()).toEqual([DB_TEXT]);
        h.handler.getMessages()[0].seen = true; // What the MSG page does when it shows the message

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // The maintainer's ruling (#176): the unit loses its messages at the power-off, and MessageHandler.clear is the
    // power-off. The KLN 89 check of 2026-10-18 showed no message at a power-up with the date already past the end; it
    // did not try an unread message over the power cycle, so the title cites the issues only
    it('is not listed again after a power cycle with the message unread (#175, #176)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        expect(h.tick()).toEqual([DB_TEXT]); // Precondition: listed, unread
        h.handler.clear();

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // Checked in the KLN 89 trainer, 2026-10-18: with the date already past the end at power-up there was no message.
    // Here the data base expires while the unit is off, so the last tick before the power-off saw it current
    it('is not posted at a power-on after the data base expired while the unit was off (checked in the KLN 89 trainer, 2026-10-18) (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        h.handler.clear();
        w.dbCurrent = false;

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });

    // The maintainer's ruling (#175): a new change from current to expired after the read posts it again, once
    it('is posted again when the data base becomes out of date again after the read (#175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        h.tick();
        h.handler.getMessages()[0].seen = true;
        expect(h.tick()).toEqual([]); // Precondition: gone once read
        w.dbCurrent = true;
        h.tick();
        w.dbCurrent = false;

        expect(h.tick()).toEqual([DB_TEXT]);
        expect(h.handler.hasUnreadMessages()).toBe(true);
    });
});
```

  The two characterizations above it (`is posted at the tick the data base becomes out of date`, `is not posted for a
  data base that was out of date from the start`) stay as they are.

- [ ] **Step 2: Rewrite the render tests.** In `test/render/data/PersistentMessages.test.ts` add `bootToSelfTest` to the
  boot import (`import {bootToSelfTest, bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';`) and
  replace everything from `describe('DATA BASE OUT OF DATE after a date entered on SET 2 (B-2)'` to the end of the file
  with:

```ts
const DB_TEXT = 'DATA BASE OUT OF DATE ALL DATA MUST BE CONFIRMED BEFORE USE';

/** How often the data base message is listed */
const dbCopies = (unit: HeadlessUnit) => messages(unit).filter(m => m === DB_TEXT).length;

/** How often the message is listed, at every display tick over two seconds */
async function countsOverTwoSeconds(unit: HeadlessUnit): Promise<number[]> {
    const counts: number[] = [];
    for (let i = 0; i < 8; i++) {
        counts.push(dbCopies(unit));
        await vi.advanceTimersByTimeAsync(250);
    }
    return counts;
}

/**
 * A unit whose GPS has no fix yet, so that the SET 2 date and time can be entered (3-53), with SET 2 shown and the
 * cursor on the date. A booted unit has a fix at once, and the date is read-only with a fix
 */
async function onSet2(start?: Date): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true, start});
    await unit.panel.selectPage('L', 'SET 2');
    await unit.panel.cursor('L');
    return unit;
}

/** Enters a date on SET 2 (the steps of enterDate, as in Set2Page.test.ts), then ENT */
async function set2Date(unit: HeadlessUnit, day: number, month: number, year: [number, number], expected: string) {
    await unit.panel.cursorTo('L', Screen.read().rows('L')[2].trim());
    await unit.panel.enterDate('L', day, month, year);
    expect(Screen.read().rows('L')[2]).toBe(`  ${expected}`);
    await unit.panel.ent();
}

/** Enters 01 JAN 27 on SET 2, after the expiration of the data base */
async function outOfDateBySet2() {
    const unit = await onSet2();
    await set2Date(unit, 1, 1, [2, 7], '01 JAN 27');
    return unit;
}

describe('DATA BASE OUT OF DATE after a date entered on SET 2 (B-2)', () => {
    // The sibling of the pin: the message is posted and stays, unread
    it('posts the message and keeps it unread (B-2)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages(unit).filter(m => m === DB_TEXT)).toHaveLength(1);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);
    });

    // B-2 names one message. Before #175 the one-time message of Database.onGPSAcquired and the persistent
    // DatabaseOutOfDateMessage both fired, so for one calculation tick the MSG page listed it twice
    it('lists the message once (B-2) (#175)', async () => {
        const unit = await outOfDateBySet2();

        expect(Math.max(...await countsOverTwoSeconds(unit))).toBe(1);
    });
});

describe('DATA BASE OUT OF DATE after a date entered on the self-test page (B-2)', () => {
    // B-2 lists the message after a date entered at the self-test. The self-test entry publishes no time update, so the
    // persistent message is the one source; before #175 it was gone a second later, unread
    it('posts the message and keeps it unread through the approval (B-2)', async () => {
        const unit = await bootToSelfTest({storage: {fastGpsAcquisition: false}});
        await unit.panel.cursorTo('R', '01 JUN 26');
        await unit.panel.enterDate('R', 1, 1, [2, 7]);
        expect(Screen.read().text()).toContain('01 JAN 27'); // Precondition: the date as entered
        await unit.panel.ent();
        expect(await countsOverTwoSeconds(unit)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(5000);

        expect(dbCopies(unit)).toBe(1);
        expect(unit.props.messageHandler.getMessages().find(m => m.message.join(' ') === DB_TEXT)!.seen).toBe(false);
    });
});

// Checked in the KLN 89 trainer, 2026-10-18: a SET 2 date after the end of the data base made the message prompt flash
// and the message page list the message once; after it was read the prompt was gone and the page showed no message.
// With the date already after the end at power-up, and after a SET 2 date moved back into the period, no message
describe('DATA BASE OUT OF DATE (checked in the KLN 89 trainer, 2026-10-18)', () => {
    it('is listed once, and gone once it is read (checked in the KLN 89 trainer, 2026-10-18) (#175)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(3000);
        expect(dbCopies(unit)).toBe(1);

        const read = await unit.panel.readMessages();
        await vi.advanceTimersByTimeAsync(3000);

        expect(read).toContain('DATA BASE OUT OF DATE'); // Precondition: the MSG page showed it
        expect(dbCopies(unit)).toBe(0);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
        expect(unit.props.database.isAiracCurrent()).toBe(false); // The data base is still out of date
    });

    it('is not posted with the date already past the end at power-up, nor when SET 2 moves it back into the period (checked in the KLN 89 trainer, 2026-10-18)', async () => {
        const unit = await onSet2(new Date('2026-07-01T12:00:00Z'));
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.props.database.isAiracCurrent()).toBe(false); // Precondition: past the end from the start
        expect(dbCopies(unit)).toBe(0);

        await set2Date(unit, 1, 6, [2, 6], '01 JUN 26');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.database.isAiracCurrent()).toBe(true);
        expect(dbCopies(unit)).toBe(0);
    });
});

// The maintainer's ruling (#175): one copy on every path, and none when the validity of the data base did not change.
// Before the fix every SET 2 entry past the end added a copy
describe('DATA BASE OUT OF DATE, one copy (#175)', () => {
    // The maintainer's ruling (#176): the unit loses its messages at the power-off. The date is still past the end at
    // the power-on, where the KLN 89 check of 2026-10-18 showed no message; it did not try an unread message over the
    // power cycle, so the title cites the issues only
    it('is not listed again after a power cycle with the message unread (#175, #176)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(3000);
        expect(dbCopies(unit)).toBe(1); // Precondition: listed, unread
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.database.isAiracCurrent()).toBe(false); // Precondition: still past the end
        expect(dbCopies(unit)).toBe(0);
    });

    it('lists one copy after a second SET 2 date past the end (#175)', async () => {
        const unit = await outOfDateBySet2();
        await vi.advanceTimersByTimeAsync(3000);
        expect(dbCopies(unit)).toBe(1); // Precondition

        await set2Date(unit, 1, 2, [2, 7], '01 FEB 27');
        await vi.advanceTimersByTimeAsync(3000);

        expect(dbCopies(unit)).toBe(1);
    });

    it('lists none after SET 2 time entries while the date is already past the end (#175)', async () => {
        const unit = await onSet2(new Date('2026-07-01T12:00:00Z'));
        await vi.advanceTimersByTimeAsync(2000);
        for (let n = 0; n < 2; n++) {
            await unit.panel.cursorTo('L', Screen.read().rows('L')[3].slice(0, 5));
            await unit.panel.inner('L', 1); // Opens the entry on hour 00
            await unit.panel.ent();
            await vi.advanceTimersByTimeAsync(3000);
        }

        expect(unit.props.sensors.in.gps.timeZulu.getHours()).toBe(0); // Precondition: the entries were taken
        expect(dbCopies(unit)).toBe(0);
    });
});
```

- [ ] **Step 3: The GPS path.** In `test/render/GpsAcquisition.test.ts`, in `posts when the GPS moves the date past the
  end of the data base (B-2)`, delete the comment line `// #175: for one tick the message is listed twice ...` (keep
  the `advanceTimersByTimeAsync(5000)` and the assertion), and add after that test:

```ts
    // B-2 names one message, and 3-16 keeps it until read. Before #175 the one-time message of Database.onGPSAcquired and
    // the persistent message were both listed at the fix
    it('lists it once at every display tick from the fix on, unread (B-2, 3-16) (#175)', async () => {
        const unit = await bootUnit({engineRunning: false, start: AFTER_CYCLE, storage: {lastLatitude: 47, lastLongitude: 8}});
        const gps = unit.props.sensors.in.gps;
        gps.timeZulu = TimeStamp.create(gps.timeZulu.getTimestamp() - 30 * DAY);
        await unit.panel.powerOn();
        expect(await secondsToFix(unit, 60)).toBeLessThan(60);

        const counts: number[] = [];
        for (let i = 0; i < 20; i++) {
            counts.push(messages(unit).filter(m => m === TEXT).length);
            await vi.advanceTimersByTimeAsync(250);
        }

        expect(counts).toEqual(new Array(20).fill(1));
        expect(unit.props.messageHandler.getMessages().find(m => m.message.join(' ') === TEXT)!.seen).toBe(false);
    });
```

- [ ] **Step 4: Run to see them fail.** `npx vitest run test/unit/data/PersistentMessages.test.ts
  test/render/data/PersistentMessages.test.ts test/render/GpsAcquisition.test.ts` → 7 red (measured): `stays until it
  is read`, `is not posted at a power-on after the data base expired while the unit was off`, `lists the message once`,
  `posts the message and keeps it unread through the approval`, `lists one copy after a second SET 2 date past the
  end`, `lists none after SET 2 time entries ...`, `lists it once at every display tick from the fix on ...`. The other
  new tests pass already today (they hold the sides the fix must not break).

- [ ] **Step 5: Implement the latch.** In `kln90b/data/PersistentMessages.ts` replace the `DatabaseOutOfDateMessage`
  class with:

```ts
/**
 * B-2: posted when the data base becomes out of date while the unit is on: a date entered on SET 2 or the self-test
 * page, the GPS correcting the date, or the end of the data base passing in flight. It is the only source of this
 * message (#175).
 */
class DatabaseOutOfDateMessage implements Message {

    public message: string[] = ["DATA BASE OUT OF DATE", "ALL DATA MUST BE", "CONFIRMED BEFORE USE"];
    public seen: boolean = false;
    private wasValid: boolean = false;
    private latched: boolean = false;

    constructor(private readonly daabase: Database) {
    }


    public isConditionValid(): boolean {
        const dbValidNow = this.daabase.isAiracCurrent();
        if (this.wasValid && !dbValidNow) {
            //3-16: it stays until the pilot has read it. MessageHandler.tick asks a listed message twice per tick, so the
            //change from current to expired sets a latch instead of being the condition itself (#175)
            this.latched = true;
        }
        this.wasValid = dbValidNow;

        if (this.seen) {
            //Gone once read; only a new change from current to expired brings it back (KLN 89 trainer, 2026-10-18)
            this.latched = false;
        }

        return this.latched;
    }

    public onPowerOff(): void {
        //A date already past the end at power-up posts nothing (KLN 89 trainer, 2026-10-18), so the next power-on
        //starts as the first one did (#175)
        this.latched = false;
        this.wasValid = false;
    }
}
```

  In `kln90b/data/MessageHandler.ts` extend the interface and call the hook in `clear()` (the `seen` reset stays here;
  Task 13 removes it):

```ts
export interface Message {
    seen: boolean;
    readonly message: string[];
    isConditionValid: () => boolean;
    /**
     * Called by MessageHandler.clear when the unit is switched off, for a persistent message that keeps state of the
     * power-on in which it was posted
     */
    onPowerOff?: () => void;
}
```

```ts
    public clear(): void {
        this.activeMessages = [];
        for (const message of this.persistentMessages) {
            message.seen = false;
            message.onPowerOff?.();
        }
    }
```

- [ ] **Step 6: Drop the one-time copy.** `kln90b/data/navdata/Database.ts` becomes:

```ts
import {TimeStamp} from "../Time";
import {AiracCycleFormatter, FacilityLoader} from "@microsoft/msfs-sdk";
import {Sensors} from "../../Sensors";


export class Database {


    public readonly expirationDateString: string;
    private readonly expirationTimestamp: TimeStamp;

    /**
     * DATA BASE OUT OF DATE is the persistent DatabaseOutOfDateMessage alone; the data base posts no copy of its own on
     * a time update (#175)
     */
    constructor(private sensors: Sensors) {
        const airac = FacilityLoader.getDatabaseCycles().current;

        this.expirationTimestamp = TimeStamp.create(airac.expirationTimestamp);
        this.expirationDateString = AiracCycleFormatter.create('{expMinus({dd} {MON} {YY})}')(airac);

        console.log("airac", airac, this.expirationTimestamp);
    }

    public isAiracCurrent(time: TimeStamp = this.sensors.in.gps.timeZulu): boolean {
        return time.getTimestamp() <= this.expirationTimestamp.getTimestamp();
    }


}
```

  `kln90b/KLN90BCore.ts:391`: `database: new Database(sensors),`. `Gps` and `Set2Page` keep publishing
  `timeUpdatedEvent` (nothing subscribes now; the topic stays declared in `Gps.ts`).

- [ ] **Step 7: The Database unit file (vehicles).** In `test/unit/data/navdata/Database.test.ts`: imports become
  `import {FacilityLoader} from '@microsoft/msfs-sdk';` (drop `EventBus`), drop the `MessageHandler, OneTimeMessage`
  and `GPSEvents` imports, drop `let bus`, `let handler` and their two lines in `beforeEach`, replace every
  `new Database(bus, sensors, handler)` with `new Database(sensors)`, and delete the whole describe
  `DATA BASE OUT OF DATE on a time update` (its two tests went with the subscription; the render tests of Step 2 and 3
  hold the paths it described).

- [ ] **Step 8: Docs.** `docs/architecture.md`, the GPS bullet (about :284):

```markdown
- `gpsAcquired()` can post `POSITION DIFFERS FROM LAST POSITION BY >2NM`. If the time error is over 10 minutes it posts
  `SYSTEM TIME UPDATED TO GPS TIME` and publishes **`timeUpdatedEvent`** (SET 2 publishes it too; nothing subscribes
  since #175). The AIRAC-expired message is the persistent `DatabaseOutOfDateMessage` alone (Core 9).
```

  and in Core 9, after `... They return unread, which is this project's choice and not a fact from the manuals.`:

```markdown
      fact from the manuals. `clear()` also calls the optional `onPowerOff()` of each persistent message, for one that
      keeps state of the power-on in which it was posted.
    - `DatabaseOutOfDateMessage` latches at the change from current to expired (a SET 2 or self-test date, the GPS
      correcting the date, the end passing in flight) and holds until it is seen; its `onPowerOff()` drops the latch and
      the last validity, so a power-up with the date already past the end posts nothing (#175; KLN 89 trainer,
      2026-10-18).
```

- [ ] **Step 9: Run the files, then `npm test` (4429 passed | 22 expected fail), `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 10: Commit** `fixes #175 latch DATA BASE OUT OF DATE until it is read and drop the data base's one-time copy, so that every path lists it once`

**Conditions → tests** (measured by mutation; each restored, `git diff` clean):

| Condition | Mutation | Red |
|---|---|---|
| the latch is set at the change | `latched = true` dropped | 13: every posting test, unit and render |
| the latch is the condition | latch lasts one evaluation (`const shown = latched; latched = false; return shown;`, the bug) | 8: the unit pin, the render pin's sibling, self-test, GPS ×2, KLN 89 read, power cycle (render), second SET 2 date |
| `seen` clears the latch | `if (seen) latched = false` dropped | 3: unit `is gone once it is read`, unit `is posted again ...`, render `is listed once, and gone once it is read` |
| `onPowerOff` drops the latch | `latched = false` dropped from it | 2: unit and render `is not listed again after a power cycle with the message unread (#175, #176)` |
| `onPowerOff` drops the last validity | `wasValid = false` dropped from it | 1: unit `is not posted at a power-on after the data base expired while the unit was off` |
| `clear()` calls `onPowerOff` | the call dropped | 3: the three above |
| no one-time copy | a `timeUpdatedEvent` subscriber in `KLN90BCore` that posts the old `OneTimeMessage` when past the end | 8: the render pin and its sibling, GPS ×2, KLN 89 read, power cycle (render), both `one copy (#175)` tests |

Predicted green and stayed green: under the `seen` mutation the power-cycle tests; under the `onPowerOff` latch
mutation the expired-while-off test; under the one-time-copy mutation the self-test test (the self-test entry
publishes no time update) and every unit test.

**Vehicles:** `test/unit/data/navdata/Database.test.ts` `DATA BASE OUT OF DATE on a time update` › `is posted when the
new time is past the expiration (B-2)` and `is not posted for a time inside the cycle (B-2)`: deleted with the
subscription (the second would pass vacuously). No other test changed result (full-suite diff against the baseline).

```json:metadata
{"files": ["kln90b/data/PersistentMessages.ts", "kln90b/data/MessageHandler.ts", "kln90b/data/navdata/Database.ts", "kln90b/KLN90BCore.ts", "docs/architecture.md", "test/unit/data/PersistentMessages.test.ts", "test/render/data/PersistentMessages.test.ts", "test/render/GpsAcquisition.test.ts", "test/unit/data/navdata/Database.test.ts"], "verifyCommand": "npx vitest run test/unit/data/PersistentMessages.test.ts test/render/data/PersistentMessages.test.ts test/render/GpsAcquisition.test.ts test/unit/data/navdata/Database.test.ts && npm test", "acceptanceCriteria": ["both #175 pins are plain tests and pass", "one copy on SET 2, self-test, GPS and expiry paths, unread until read, gone once read", "no stacking on repeated SET 2 entries, none when already past the end", "no copy after a power cycle", "Database has no timeUpdatedEvent subscription"], "modelTier": "standard"}
```

---

---

### Task 12: ADJ NAV IND CRS is not evaluated before the self-test is approved (#330)

**Goal:** A new `NavPageState.isSelfTestApproved` (false from every power-on, true at the approval and on the start-ups
that skip the self-test) keeps `AdjustCourseToWithObsReadingMessage` from being evaluated on the Turn-On page and on
the self-test page (the maintainer's ruling, 2026-10-18). The first evaluation after the approval takes the course as
the start-up course: it opens no 30 s window (#177) and ends a window left from before the power-off.

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState`: the field after `isSelfTestActive`, about :71; `reset()`:
  one line after `this.navPage.userMagvar = 0;`, about :289)
- Modify: `kln90b/pages/right/SelfTestRightPage.tsx` (`approve()`, about :146)
- Modify: `kln90b/pages/WelcomePage.tsx` (the `forceReadyToUse` branch of `tick`, about :153)
- Modify: `kln90b/data/PersistentMessages.ts` (`buildPersistentMessages`, about :35; the class, about :50-63)
- Modify: `docs/architecture.md` (the welcome and self-test flow, about :117-123; the persistent-message list, about
  :700)
- Test: `test/unit/data/PersistentMessages.test.ts` (the `World` stub; the `readable()` comment; the first-DTK
  characterization; a new describe at the end)
- Test: `test/render/pages/left/SelfTestLeftPage.test.ts` (imports; the pin at about :289 and a new test after it; a
  new describe at the end)

**Acceptance Criteria:**
- [ ] The pin `shows enr-leg without msg (figure 3-4; checked in the KLN 89 trainer, 2026-10-09, T8) (#330)` is a plain
  `it` with its title kept, and passes.
- [ ] Without a readable indicator (`NO_OBS`) the self-test page shows `enr-leg` without `msg` for 30 s and the list is
  empty.
- [ ] From the power-on (cold and dark, standard route, indicator on 242°) until the self-test page shows `APPROVE?`,
  and for 30 s in all, no ADJ NAV IND CRS is listed.
- [ ] Approved at once (no wait on the self-test page): with the indicator on 242° `ADJ NAV IND CRS TO 050°` is listed
  and stays for 40 s; with the indicator on 050° none is listed within 40 s.
- [ ] After a power cycle the message is not listed on the Turn-On or self-test page (25 s), and is listed again after
  the approval.
- [ ] An engine-running boot (the self-test skipped) lists `ADJ NAV IND CRS TO 050°` with the indicator on 242°, and
  none within 40 s with the indicator on 050°.
- [ ] Unit: no message while not approved (the same world approved shows it); the course at the approval, at the first
  evaluation of a skipped self-test and at the approval after a power cycle opens no window; a window from before the
  power-off ends at the approval.

**Verify:** `npx vitest run test/unit/data/PersistentMessages.test.ts test/render/pages/left/SelfTestLeftPage.test.ts`
→ all pass; then `npm test` → 4442 passed | 21 expected fail (4463) (measured on top of Task 11).

**Steps:**

- [ ] **Step 1: The unit stub.** In `test/unit/data/PersistentMessages.test.ts` add `selfTestApproved: boolean;` to
  `interface World` (after `baroSource`), `selfTestApproved: true,` to `quietWorld()` (after `baroSource: 0,`), and to the
  `navPage` stub in `harness()` after the `userMagvar` getter:

```ts
        get isSelfTestApproved() {
            return w.selfTestApproved;
        },
```

- [ ] **Step 2: The unit tests.** In the `readable()` helper of `ADJ NAV IND CRS TO nnn, a readable indicator`, replace
  the comment of `h.tick();` (no code change):

```ts
        h.tick(); // The first DTK is the start-up course and opens no force window (#330); 31 s keep a window closed anyway
```

  Replace the characterization `opens the window at the first DTK, even on course (characterization)` with (title
  kept; it is a vehicle, see below):

```ts
    // Since #330 the course at the first evaluation after the approval is the start-up course and opens no window, so
    // the first DTK here comes after a start-up without one, as at a Direct To after a start-up without a flight plan
    it('opens the window at the first DTK, even on course (characterization)', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        const w = quietWorld();
        const h = harness(w);
        expect(h.tick()).toEqual([]); // The start-up, without a DTK
        w.dtkMag = 3;
        w.obsIn = 3;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 003°']);
    });
```

  Append at the end of the file:

```ts
describe('ADJ NAV IND CRS TO nnn before the self-test is approved', () => {
    const atNoon = () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    };

    // Figure 3-4: the self-test page with the indicator on 242° against the fixed course of 315° and no message prompt.
    // The maintainer's ruling (#330) widens this to the whole time before the approval, the Turn-On page included. The
    // same world after the approval shows the message, so the approval is what lets it through
    it('is not evaluated before the approval, with the indicator off the course (figure 3-4) (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 315;
        w.obsIn = 242;
        w.selfTestApproved = false;
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);

        w.selfTestApproved = true;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 315°']);
    });

    // #330: the start-up is no DTK change. The DTK of 046° at the approval opens no 30 s window (#177) for a pilot whose
    // indicator is already on it
    it('takes the course at the approval as no DTK change, so it opens no 30 s window (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.selfTestApproved = false;
        const h = harness(w);
        expect(h.tick()).toEqual([]);
        w.selfTestApproved = true;
        w.dtkMag = 46;
        w.obsIn = 46;

        expect(h.tick()).toEqual([]);
    });

    // #330: the engine-running start skips the self-test and counts as approved; its first course is the start-up
    // course as well
    it('takes the first course of a start that skips the self-test as no DTK change (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 46;
        w.obsIn = 46;

        expect(harness(w).tick()).toEqual([]);
    });

    // #330: every power-on starts anew. The last course of the previous power-on (046°) is not compared with the DTK at
    // the next approval (100°), so that DTK opens no window either
    it('takes the course at the approval after a power cycle as no DTK change (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 46;
        w.obsIn = 46;
        const h = harness(w);
        expect(h.tick()).toEqual([]); // Precondition: the start-up course opens no window
        w.selfTestApproved = false; // The next power-on
        expect(h.tick()).toEqual([]);
        w.dtkMag = 100;
        w.obsIn = 100;
        w.selfTestApproved = true;

        expect(h.tick()).toEqual([]);
    });

    // #330: a window opened by a DTK change before a power-off does not show after the approval of the next power-on,
    // although its 30 s have not run out
    it('ends a window from before the power-off at the approval (#330)', () => {
        atNoon();
        const w = quietWorld();
        w.dtkMag = 46;
        w.obsIn = 46;
        const h = harness(w);
        h.tick();
        w.dtkMag = 100;
        w.obsIn = 100;
        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 100°']); // Precondition: the DTK change opened the window
        w.selfTestApproved = false; // The next power-on
        expect(h.tick()).toEqual([]);
        vi.advanceTimersByTime(5_000);
        w.selfTestApproved = true;

        expect(h.tick()).toEqual([]);
    });
});
```

- [ ] **Step 3: The render tests.** In `test/render/pages/left/SelfTestLeftPage.test.ts` replace the import of
  `bootToSelfTest` and add three imports:

```ts
import {BootOptions, bootToSelfTest, bootUnit, HeadlessUnit} from '../../../harness/boot';
import {HEADING_INPUT, NO_OBS, panelXml} from '../../../harness/panelXml';
import {Screen} from '../../../harness/render/screen';
import {messages} from '../../../harness/readers';
import {standardRoute} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
```

  Replace the pin and its comment (the end of the `self-test page status line (spec)` describe) with:

```ts
    // Before #330 the persistent ADJ NAV IND CRS TO 315° compared the fixed self-test course with the indicator and
    // posted during the self-test, so msg followed enr-leg. The KLN 89 trainer showed no message prompt on its self-test
    // page (T8); it has no readable course there and no status line, so this is its rule and not its readable-course
    // case. The AVsoftech trainer (unreliable) showed no prompt either with its course well away from 315°
    it('shows enr-leg without msg (figure 3-4; checked in the KLN 89 trainer, 2026-10-09, T8) '
        + '(#330)', async () => {
        await selfTestAsFigure();

        expect(Screen.read().status().mode).toBe('enr-leg');
    });

    // T8's own case: the 89 reads no course. Before #330 the first self-test course opened the 30 s window of the
    // message (#177), so msg showed for most of the first half minute of the page
    it('shows enr-leg without msg without a readable indicator (checked in the KLN 89 trainer, 2026-10-09, T8) (#330)', async () => {
        const unit = await bootToSelfTest({magvar: 0, storage: {lastLatitude: 47, lastLongitude: 8}, panelXml: panelXml(NO_OBS)});
        const modes: string[] = [];
        for (let i = 0; i < 30; i++) {
            modes.push(Screen.read().status().mode);
            await vi.advanceTimersByTimeAsync(1000);
        }

        expect(new Set(modes)).toEqual(new Set(['enr-leg']));
        expect(messages(unit)).toEqual([]);
    });
});
```

  and append at the end of the file:

```ts
/**
 * A unit at KAAA with the standard route KAAA, ABC, KBBB as FPL 0 (DTK 050°, magvar 0) and an indicator it reads on
 * `obsIn`
 */
function onStandardRoute(obsIn: number): BootOptions {
    const {kaaa, abc, kbbb} = standardRoute();
    return {
        magvar: 0,
        facilities: [kaaa, abc, kbbb],
        storage: {lastLatitude: 47, lastLongitude: 8, ...savedFlightplan(0, [kaaa, abc, kbbb])},
        simVars: [{name: 'Nav OBS:1', unit: 'degrees', value: obsIn}],
    };
}

/** The self-test page of `onStandardRoute(obsIn)`, approved at once */
async function approvedOnStandardRoute(obsIn: number): Promise<HeadlessUnit> {
    const unit = await bootToSelfTest(onStandardRoute(obsIn));
    await unit.panel.approveSelfTest();
    await vi.advanceTimersByTimeAsync(2000); // Two calculation ticks: the self-test course gives way to the DTK
    expect(Math.round(unit.props.modeController.getDtkOrObsMagnetic()!)).toBe(50); // Precondition: the leg to ABC
    return unit;
}

/** The ADJ NAV IND CRS messages listed at every second for the next `seconds` */
async function adjustMessagesFor(unit: HeadlessUnit, seconds: number): Promise<string[]> {
    const seen = new Set<string>();
    for (let i = 0; i < seconds; i++) {
        messages(unit).filter(m => m.startsWith('ADJ NAV IND CRS')).forEach(m => seen.add(m));
        await vi.advanceTimersByTimeAsync(1000);
    }
    return [...seen];
}

const approveShows = () => Screen.read().rows('R').some(r => r.trim() === 'APPROVE?');

describe('ADJ NAV IND CRS around the self-test', () => {
    // The maintainer's ruling (#330): the message is not evaluated before the self-test is approved, on the Turn-On page
    // as well as on the self-test page. Before, the Turn-On page computed the DTK of 050° and listed the message from
    // about 13 s after the power-on
    it('is not listed from the power-on until the approval, with the indicator off the DTK (#330)', async () => {
        const unit = await bootUnit({...onStandardRoute(242), engineRunning: false});
        await unit.panel.powerOn();

        expect(await adjustMessagesFor(unit, 30)).toEqual([]);
        expect(approveShows()).toBe(true); // Precondition: not yet approved
    });

    // B-1: with a readable indicator the message shows while the course differs from the DTK by more than 5°
    it('shows ADJ NAV IND CRS TO 050° right after the approval with the indicator off the DTK (B-1)', async () => {
        const unit = await approvedOnStandardRoute(242);

        expect(await adjustMessagesFor(unit, 40)).toEqual(['ADJ NAV IND CRS TO 050°']);
        expect(messages(unit)).toContain('ADJ NAV IND CRS TO 050°'); // Still there after 40 s: the course differs
    });

    // #330: the start-up is no DTK change, so the DTK at the approval opens no 30 s window (#177) for a pilot whose
    // indicator is already on it
    it('shows no ADJ NAV IND CRS right after the approval with the indicator on the DTK (#330)', async () => {
        const unit = await approvedOnStandardRoute(50);

        expect(await adjustMessagesFor(unit, 40)).toEqual([]);
    });

    // #330: every power-on waits for its own approval. The listed message goes with the power-off (MessageHandler.clear)
    // and does not come back on the Turn-On page or the self-test page of the next power-on, only after its approval
    it('is not listed again before the approval of the next power-on (#330)', async () => {
        const unit = await approvedOnStandardRoute(242);
        expect(messages(unit)).toContain('ADJ NAV IND CRS TO 050°'); // Precondition: listed after the first approval

        await unit.panel.powerCycle();
        expect(await adjustMessagesFor(unit, 25)).toEqual([]);
        expect(approveShows()).toBe(true); // Precondition: not yet approved

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit)).toContain('ADJ NAV IND CRS TO 050°');
    });

    // #330: the engine-running start skips the Turn-On and self-test pages (WelcomePage, forceReadyToUse), and a
    // skipped self-test counts as approved
    it('shows ADJ NAV IND CRS TO 050° on an engine-running start, which skips the self-test (#330)', async () => {
        const unit = await bootUnit(onStandardRoute(242));

        expect(await adjustMessagesFor(unit, 10)).toEqual(['ADJ NAV IND CRS TO 050°']);
    });

    // #330: on the engine-running start too, the first DTK is the start-up course and opens no 30 s window (#177)
    it('shows no ADJ NAV IND CRS on an engine-running start with the indicator on the DTK (#330)', async () => {
        const unit = await bootUnit(onStandardRoute(50));
        await vi.advanceTimersByTimeAsync(2000);
        expect(Math.round(unit.props.modeController.getDtkOrObsMagnetic()!)).toBe(50); // Precondition: the leg to ABC

        expect(await adjustMessagesFor(unit, 40)).toEqual([]);
    });
});
```

- [ ] **Step 4: Run to see them fail.** `npx vitest run test/unit/data/PersistentMessages.test.ts
  test/render/pages/left/SelfTestLeftPage.test.ts` → 11 failed | 79 passed (measured on Task 11): the five new unit
  tests, the pin, the no-indicator test, `is not listed from the power-on until the approval ...`, `shows no ADJ NAV IND
  CRS right after the approval ...`, `is not listed again before the approval of the next power-on` and `shows no ADJ
  NAV IND CRS on an engine-running start ...`. Predicted and measured green before the fix: `shows ADJ NAV IND CRS TO
  050° right after the approval ... (B-1)`, `shows ADJ NAV IND CRS TO 050° on an engine-running start ...` and the
  first-DTK characterization.

- [ ] **Step 5: Implement.** In `kln90b/data/VolatileMemory.ts`, `NavPageState`, after `isSelfTestActive`:

```ts
    /**
     * False from the power-on until the self-test is approved. The start-ups that skip the self-test (the
     * engine-running boot, debugMode) count as approved. ADJ NAV IND CRS is not evaluated before (#330)
     */
    public isSelfTestApproved: boolean = false;
```

  and in `reset()` after `this.navPage.userMagvar = 0;`:

```ts
        this.navPage.isSelfTestApproved = false; //Every power-on runs the self-test again (#330)
```

  In `kln90b/pages/right/SelfTestRightPage.tsx`, `approve()`:

```ts
    private approve(): void {
        this.props.memory.navPage.isSelfTestActive = false;
        this.props.memory.navPage.isSelfTestApproved = true;
```

  In `kln90b/pages/WelcomePage.tsx`, the `forceReadyToUse` branch of `tick` (it covers `debugMode` too):

```ts
                //We got no time for that
                this.props.sensors.in.gps.gpsSatComputer.acquireAndUseSatellites();
                this.props.memory.navPage.isSelfTestApproved = true; //A skipped self-test counts as approved (#330)
                this.props.pageManager.startMainPage(this.props);
```

  In `kln90b/data/PersistentMessages.ts`, `buildPersistentMessages`:

```ts
        messages.push(new AdjustCourseToWithObsReadingMessage(props.sensors, props.modeController, props.memory.navPage));
```

  and in the class (`NavPageState` is already imported):

```ts
    private lastCourse: number | null = null;
    private validUntil: number = 0;
    private atStartUp = true; //Until the first evaluation after the self-test is approved (#330)


    constructor(private readonly sensors: Sensors, private readonly modeController: ModeController, private readonly navState: NavPageState) {
    }


    public isConditionValid(): boolean {
        if (!this.navState.isSelfTestApproved) {
            //#330: not evaluated before the self-test is approved, neither on the Turn-On page nor on the self-test page,
            //whose fixed course is part of the check and not a course to set (figure 3-4)
            this.atStartUp = true;
            return false;
        }

        //This message has two conditions. They must both be here, otherwise this message could be shown twice
        const dtk = this.modeController.getDtkOrObsMagnetic();
        if (this.atStartUp) {
            //#330: the course at the approval is where the unit starts, not a DTK change, so it opens no 30 s window,
            //and a window from before the power-off is over
            this.atStartUp = false;
            this.forceShow = false;
            this.lastCourse = dtk;
        }
        if (dtk === null || this.modeController.isObsModeActive()) {
            return false;
        }
```

  (the rest of the method unchanged).

- [ ] **Step 6: The architecture doc.** In `docs/architecture.md`, the welcome and self-test flow, replace the first
  and third sub-bullets and add a bullet after the list:

```markdown
    - `FiveSegmentPage(SelfTestLeftPage, SelfTestRightPage)` normally. `SelfTestLeftPage` sets
      `navPage.isSelfTestActive = true` and `SelfTestRightPage` clears it at the approval, where it also sets
      `navPage.isSelfTestApproved`.
    - `TakehomePage` if `takeHomeMode` is set.
    - `pageManager.startMainPage(props)` directly if `forceReadyToUse` is set. This also calls
      `gpsSatComputer.acquireAndUseSatellites()` and sets `navPage.isSelfTestApproved` (a skipped self-test counts as
      approved).
- `navPage.isSelfTestApproved` is false from every power-on (`VolatileMemory.reset`) until then. Unlike
  `isSelfTestActive` it also covers the Turn-On page; ADJ NAV IND CRS is not evaluated before it (#330).
```

  and in the `buildPersistentMessages(props)` bullet:

```markdown
  `AdjustCourseToWithObsReadingMessage` (`ADJ NAV IND CRS TO xxx°`) when `obsTarget===0`, otherwise
  `AdjustCourseMessage`. The former is not evaluated before the self-test is approved, and it takes the course at its
  first evaluation after the approval as the start, not as a DTK change that opens its 30 s window (#330).
```

- [ ] **Step 7: Run the files, then `npm test` (4442 passed | 21 expected fail, 4463), `npx tsc --noEmit`, `npm run
  build`.**

- [ ] **Step 8: Commit** `fixes #330 do not evaluate ADJ NAV IND CRS before the self-test is approved, on the Turn-On page as well as on the self-test page, and take the course at the approval as no DTK change`

**Conditions → tests** (measured on the commit; files `PersistentMessages.test.ts` and `SelfTestLeftPage.test.ts`):

| Condition | Mutation | Red |
|---|---|---|
| the approval guard | `if (false)` | 9: unit `is not evaluated before the approval ...`, `takes the course at the approval as no DTK change ...`, `... after a power cycle ...`, `ends a window from before the power-off ...`; the pin; the no-indicator test; `is not listed from the power-on until the approval ...`; `shows no ADJ NAV IND CRS right after the approval ...`; `is not listed again before the approval of the next power-on` |
| the guard re-arms the start-up | `this.atStartUp = true` dropped | 2: unit `... after a power cycle as no DTK change`, `ends a window from before the power-off ...` |
| the start-up takes the course | `this.lastCourse = dtk` dropped | 5: unit `takes the course at the approval ...`, `takes the first course of a start that skips ...`, `... after a power cycle ...`; render `shows no ADJ NAV IND CRS right after the approval ...`, `shows no ADJ NAV IND CRS on an engine-running start ...` |
| the start-up ends an old window | `this.forceShow = false` dropped | 1: unit `ends a window from before the power-off at the approval` |
| the start-up comes before the null/OBS return | start-up only with a DTK outside OBS | 1: the characterization `opens the window at the first DTK, even on course` |
| the start-up is consumed | `this.atStartUp = false` dropped | 8: six #177/window characterizations, the first-DTK characterization, `ends a window ...` |
| the start-up at construction | `atStartUp = false` initially | 3: unit `takes the first course of a start that skips ...`, `... after a power cycle ...`; render `shows no ADJ NAV IND CRS on an engine-running start ...` |
| the power-on resets the approval | `reset()` line dropped | 1: `is not listed again before the approval of the next power-on` |
| the approval sets the flag | `approve()` line dropped | 2: `shows ADJ NAV IND CRS TO 050° right after the approval ... (B-1)`, `is not listed again before ...` |
| the skipped self-test sets the flag | `WelcomePage` line dropped | 1 in these files: `shows ADJ NAV IND CRS TO 050° on an engine-running start ...` (the engine-running tests elsewhere that read the message, e.g. `StatusLine.test.ts`, go red too) |

Comparison, not a condition: the guard on `isSelfTestActive` instead (lane M's narrower rule) turns exactly `is not
listed from the power-on until the approval ...` and `is not listed again before the approval ...` red, the two tests
of the widened ruling.

Predicted green and stayed green: `shows ADJ NAV IND CRS TO 050° right after the approval (B-1)` and the
engine-running `050°` test under every mutation of `PersistentMessages.ts` in the table (the indicator is off the DTK,
so the second part shows the message whatever the window does).

**Vehicles:** `PersistentMessages.test.ts` › `ADJ NAV IND CRS TO nnn, a readable indicator` › `opens the window at the
first DTK, even on course (characterization)` (red with the fix: the first evaluation is now the start-up; it gets a
start-up tick without a DTK first, title kept, comment says why). The `readable()` comment changes (the test results do
not). Full-suite diff otherwise: only the new tests and the pin.

```json:metadata
{"files": ["kln90b/data/VolatileMemory.ts", "kln90b/pages/right/SelfTestRightPage.tsx", "kln90b/pages/WelcomePage.tsx", "kln90b/data/PersistentMessages.ts", "docs/architecture.md", "test/unit/data/PersistentMessages.test.ts", "test/render/pages/left/SelfTestLeftPage.test.ts"], "verifyCommand": "npx vitest run test/unit/data/PersistentMessages.test.ts test/render/pages/left/SelfTestLeftPage.test.ts && npm test", "acceptanceCriteria": ["the #330 pin is a plain test and passes", "no ADJ NAV IND CRS from the power-on until the approval, also after a power cycle", "after an immediate approval the message shows off the DTK and not on it", "an engine-running start counts as approved"], "modelTier": "standard"}
```

---

---

### Task 13: A read persistent message stays read over a power cycle (#351)

**Goal:** `MessageHandler.clear()` empties the list and keeps every `seen` flag (the maintainer's ruling, #351). It
still calls `onPowerOff()` (Task 11). A persistent message whose condition holds at the first tick after the power-on
comes back read; one whose condition lapsed is reset by `tick` as today.

**Files:**
- Modify: `kln90b/data/MessageHandler.ts` (`clear()` and its doc comment)
- Modify: `docs/architecture.md` (Core 9, the sentence on the return of persistent messages)
- Test: `test/unit/data/MessageHandler.test.ts` (the characterization in `MessageHandler.clear (#176)` moves to a new
  describe)
- Test: `test/render/data/Messages.test.ts` (the characterization in `messages at the power-off (#176)` moves to a new
  describe)
- Test: `test/unit/data/PersistentMessages.test.ts` (the `DATA BASE OUT OF DATE` describe: the interaction with Task 11)

**Acceptance Criteria:**
- [ ] ALTITUDE FAIL (NO_ALTIMETER) read before a power cycle is listed after it with `seen` true and no unread message.
- [ ] Unit: a read persistent message returns read while its condition holds; one whose condition lapsed returns new;
  an unread one returns unread.
- [ ] A DATA BASE OUT OF DATE read just before the power-off does not come back.
- [ ] `clear()` still calls `onPowerOff()`: the Task 11 power-cycle tests stay green.

**Verify:** `npx vitest run test/unit/data/MessageHandler.test.ts test/unit/data/PersistentMessages.test.ts test/render/data/Messages.test.ts`
→ all pass; then `npm test` → 4437 passed | 21 expected fail (4458).

**Steps:**

- [ ] **Step 1: The unit tests.** In `test/unit/data/MessageHandler.test.ts` delete
  `lets a persistent message return unread at the next tick while its condition holds, and not otherwise
  (characterization)` from the `MessageHandler.clear (#176)` describe, and add after that describe:

```ts
describe('MessageHandler.clear and the seen flags (#351)', () => {
    // The maintainer's ruling (#351): a read persistent message whose condition still holds after the power-on comes
    // back read. One whose condition ended meanwhile is new again when it returns, as at any other time (3-16)
    it('lets a read persistent message return read at the next tick while its condition holds, and new once it lapsed (#351)', () => {
        const handler = new MessageHandler();
        const holds = new Condition('HOLDS');
        const ends = new Condition('ENDS');
        handler.persistentMessages = [holds, ends];
        holds.valid = true;
        ends.valid = true;
        handler.tick();
        readAll(handler);
        expect(handler.hasUnreadMessages()).toBe(false);

        handler.clear();
        expect(handler.hasMessages()).toBe(false);
        ends.valid = false;
        handler.tick();

        expect(texts(handler)).toEqual(['HOLDS']);
        expect(holds.seen).toBe(true);
        expect(handler.hasUnreadMessages()).toBe(false);

        ends.valid = true;
        handler.tick();

        expect(texts(handler)).toEqual(['HOLDS', 'ENDS']);
        expect(ends.seen).toBe(false);
    });

    // #351: clear() keeps the seen flag as it is, so an unread message is not made read either
    it('lets an unread persistent message return unread (#351)', () => {
        const handler = new MessageHandler();
        const holds = new Condition('HOLDS');
        handler.persistentMessages = [holds];
        holds.valid = true;
        handler.tick();

        handler.clear();
        handler.tick();

        expect(texts(handler)).toEqual(['HOLDS']);
        expect(handler.hasUnreadMessages()).toBe(true);
    });
});
```

- [ ] **Step 2: The render test.** In `test/render/data/Messages.test.ts` delete `bring a persistent message back
  unread when its condition holds again (characterization)` from `messages at the power-off (#176)` (it cites a
  different source than that describe now) and add at the end of the file:

```ts
describe('a read message over a power cycle (#351)', () => {
    // The maintainer's ruling (#351): a persistent message (ALTITUDE FAIL without an altitude input) that was read
    // before the power-off and whose condition still holds after the power-on comes back read, so msg does not flash.
    // The AVsoftech trainer (unreliable) kept a read OBS WPT > 200NM read over its power button; the KLN 89 could not
    // show it (the condition does not survive its relaunch)
    it('bring a read persistent message back read when its condition still holds (#351)', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_ALTIMETER)});
        await settle(unit);
        await unit.panel.readMessages(); // the persistent message stays after it is read
        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit)).toEqual(['ALTITUDE FAIL']); // the precondition: persistent and read
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain('ALTITUDE FAIL');
        expect(unit.props.messageHandler.getMessages().find(m => m.message[0] === 'ALTITUDE FAIL')!.seen).toBe(true);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
    });
});
```

- [ ] **Step 3: The interaction with the #175 latch.** In `test/unit/data/PersistentMessages.test.ts`, in the
  `DATA BASE OUT OF DATE` describe, before `is posted again when the data base becomes out of date again after the
  read (#175)`:

```ts
    // The rulings of #351 (a read message keeps its seen flag over a power cycle) and #175 (the latch) together: the
    // pilot reads the message and the unit is switched off before the next tick. The read clears the latch at the first
    // tick, and the power-off clears it too, so it does not come back, read or unread
    it('stays gone over a power cycle right after it is read (#351, #175)', () => {
        const w = quietWorld();
        const h = harness(w);
        h.tick();
        w.dbCurrent = false;
        expect(h.tick()).toEqual([DB_TEXT]);
        h.handler.getMessages()[0].seen = true;
        h.handler.clear();

        expect(h.tick()).toEqual([]);
        expect(h.tick()).toEqual([]);
    });
```

- [ ] **Step 4: Run to see them fail** (`lets a read persistent message return read ...` and the render test).

- [ ] **Step 5: Implement.** In `kln90b/data/MessageHandler.ts` drop ONLY the `message.seen = false;` line; the loop
  stays, because it calls `onPowerOff()` (removing the whole loop turns three Task 11 tests red):

```ts
    /**
     * A message describes the power-on in which it was posted, so the unit loses them all when it is switched off.
     * The persistent messages come back at the next tick when their condition holds. A read one comes back read: its
     * seen flag is kept (the maintainer's ruling, #351). One whose condition has lapsed by the first tick after the
     * power-on has its seen flag reset by tick, as at any other time.
     */
    public clear(): void {
        this.activeMessages = [];
        for (const message of this.persistentMessages) {
            message.onPowerOff?.();
        }
    }
```

- [ ] **Step 6: Docs.** `docs/architecture.md` Core 9, the `MessageHandler` bullet: its last three lines (from
  `persistent ones return once their condition holds.` to `... the power-on in which it was posted.`, as Task 11 left
  them) become:

```markdown
      persistent ones return once their condition holds. A read one returns read, because `clear()` keeps the `seen`
      flags (the maintainer's ruling, #351); one whose condition lapsed meanwhile is reset by the tick. `clear()` calls
      the optional `onPowerOff()` of each persistent message, for one that keeps state of the power-on in which it was
      posted.
```

- [ ] **Step 7: Run the files, then `npm test` (4437 passed | 21 expected fail), `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 8: Commit** `fixes #351 keep a read persistent message read over a power cycle while its condition holds`

**Conditions → tests:**

| Condition | Mutation | Red |
|---|---|---|
| `seen` kept by `clear()` | `message.seen = false;` restored | 2: unit `lets a read persistent message return read ...`, render `bring a read persistent message back read ...` |
| the loop kept for `onPowerOff()` | the whole loop removed (the inventory's 351.patch shape) | 3: the Task 11 power-cycle tests (unit ×2, render ×1) |
| `seen` untouched, not set | `message.seen = true;` in the loop | 1: `lets an unread persistent message return unread (#351)` |

The interaction test `stays gone over a power cycle right after it is read (#351, #175)` holds a property with two
independent mechanisms (the kept `seen` clears the latch at the first tick; `onPowerOff()` clears it at the power-off):
dropping either alone leaves it green (measured, and predicted); dropping both (the `seen` reset restored AND the
latch kept by `onPowerOff`) turns it red, with `is not listed again after a power cycle with the message unread`.

**Vehicles:** the two characterizations above, rewritten as tests of the ruling and moved to describes that cite #351:
`test/unit/data/MessageHandler.test.ts` › `MessageHandler.clear (#176)` › `lets a persistent message return unread at
the next tick while its condition holds, and not otherwise (characterization)`; `test/render/data/Messages.test.ts` ›
`messages at the power-off (#176)` › `bring a persistent message back unread when its condition holds again
(characterization)`. Nothing else changed result.

```json:metadata
{"files": ["kln90b/data/MessageHandler.ts", "docs/architecture.md", "test/unit/data/MessageHandler.test.ts", "test/render/data/Messages.test.ts", "test/unit/data/PersistentMessages.test.ts"], "verifyCommand": "npx vitest run test/unit/data/MessageHandler.test.ts test/unit/data/PersistentMessages.test.ts test/render/data/Messages.test.ts && npm test", "acceptanceCriteria": ["a read persistent message returns read after a power cycle", "a lapsed one returns new, an unread one unread", "clear() still calls onPowerOff", "a read data base message stays gone over a power cycle"], "modelTier": "mechanical"}
```

---

---

### Task 14: A time entry on the self-test page starts the clock at the full minute (#331)

**Goal:** A `TimeStamp` helper `withEnteredTime(hours, minutes)` keeps the date and zone and sets the seconds and
milliseconds to zero; `SelfTestRightPage.saveTime` uses it.

**Files:**
- Modify: `kln90b/data/Time.ts:114-119` (the helper after `withTime`)
- Modify: `kln90b/pages/right/SelfTestRightPage.tsx:139`
- Test: `test/unit/data/Time.test.ts` (the `TimeStamp` describe)
- Test: `test/render/pages/right/SelfTestRightPage.test.ts` (the pin at about :279)

**Acceptance Criteria:**
- [ ] The pin `starts the clock with the seconds at zero when the time is entered (3-6; checked in the KLN 89 trainer,
  2026-10-09, T11) (#331)` is a plain `it` with its title kept, and passes.
- [ ] `withEnteredTime(23, 5)` on 1994-08-03 08:10:14.500 CST is 1994-08-03 23:05:00.000, zone CST; the old stamp is
  unchanged.
- [ ] `withTime` is unchanged (its characterization stays green).

**Verify:** `npx vitest run test/unit/data/Time.test.ts test/render/pages/right/SelfTestRightPage.test.ts` → all pass;
then `npm test` → 4439 passed | 20 expected fail (4459).

**Steps:**

- [ ] **Step 1: The unit test**, in the `TimeStamp` describe of `test/unit/data/Time.test.ts`, before `addSeconds and
  getSecondsSinceMidnight count seconds (characterization)`:

```ts
    // 3-6: the pilot enters hours and minutes only. The KLN 89 started its clock at the entered hour and minute
    // with the seconds at zero (checked in the KLN 89 trainer, 2026-10-09, T11; on SET 2, 2026-10-18). The zone is kept,
    // as withTime keeps it
    it('withEnteredTime keeps the date and the zone and starts at the full minute (3-6; checked in the KLN 89 trainer, 2026-10-09, T11) (#331)', () => {
        const t = TimeStamp.create(Date.UTC(1994, 7, 3, 8, 10, 14, 500), zone('CST'));
        const entered = t.withEnteredTime(23, 5);

        expect(entered.getTimestamp()).toBe(Date.UTC(1994, 7, 3, 23, 5, 0, 0));
        expect(entered.tz.code).toBe('CST');
        expect(t.getTimestamp()).toBe(Date.UTC(1994, 7, 3, 8, 10, 14, 500)); // A new stamp; the old one is unchanged
    });
```

- [ ] **Step 2: Convert the pin:** `it.fails('starts the clock with the seconds at zero when the time is entered '` →
  `it('starts the clock with the seconds at zero when the time is entered '` (title and body unchanged).

- [ ] **Step 3: Run to see them fail** (the unit test does not compile without the helper: `withEnteredTime is not a
  function`; the pin reads the running seconds).

- [ ] **Step 4: Implement** the helper in `kln90b/data/Time.ts`, after `withTime`:

```ts
    /**
     * The clock after a time entry of the pilot (3-6; #331, #397): the date stays, the hours and minutes are the entered ones,
     * and the clock starts at the full minute, with the seconds and milliseconds at zero (KLN 89 trainer, 2026-10-09,
     * T11) (#331)
     */
    public withEnteredTime(hours: number, minutes: number): TimeStamp {
        const datePortion = this.getTimestamp() - (this.getTimestamp() % DAY);

        return new TimeStamp(new Date(datePortion + hours * HOUR + minutes * MINUTE), this.tz);
    }
```

  and in `SelfTestRightPage.saveTime`:

```ts
        const newDate = oldDate.withEnteredTime(date.getHours(), date.getMinutes()); //3-6: the seconds start at 00 (#331)
```

- [ ] **Step 5: Run the files, then `npm test` (4439 passed | 20 expected fail), `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 6: Commit** `fixes #331 start the clock at the full minute after a time entry on the self-test page`

**Conditions → tests:**

| Condition | Mutation | Red |
|---|---|---|
| seconds at zero | the helper adds `this.getSeconds() * SECOND` | 2: the unit test, the pin |
| milliseconds at zero | the helper adds `this.getMilliseconds()` | 1: the unit test (the screen shows no milliseconds; the render pin stays green, as predicted) |
| the zone kept | `UTC` instead of `this.tz` | 1: the unit test |
| the page uses the helper | `withTime` again in `saveTime` | 1: the pin |

**Vehicles:** none.

```json:metadata
{"files": ["kln90b/data/Time.ts", "kln90b/pages/right/SelfTestRightPage.tsx", "test/unit/data/Time.test.ts", "test/render/pages/right/SelfTestRightPage.test.ts"], "verifyCommand": "npx vitest run test/unit/data/Time.test.ts test/render/pages/right/SelfTestRightPage.test.ts && npm test", "acceptanceCriteria": ["the #331 pin is a plain test and passes", "withEnteredTime zeroes seconds and milliseconds and keeps date and zone", "withTime unchanged"], "modelTier": "mechanical"}
```

---

---

### Task 15: A time entry on SET 2 starts the clock at the full minute (#397)

**Goal:** `Set2Page.saveTime` uses `withEnteredTime` (Task 14).

**Files:**
- Modify: `kln90b/pages/left/Set2Page.tsx:147`
- Test: `test/render/pages/left/Set2Page.test.ts` (a new describe at the end)

**Acceptance Criteria:**
- [ ] With no fix (`fastGpsAcquisition` false, `coldGps`), 20:00 entered on SET 2 and ENT pressed just after the clock
  stepped to a non-zero second, the time row reads `20:00:00` right after ENT.

**Verify:** `npx vitest run test/render/pages/left/Set2Page.test.ts` → all pass; then `npm test` → 4440 passed | 20
expected fail (4460).

**Steps:**

- [ ] **Step 1: The test**, at the end of `test/render/pages/left/Set2Page.test.ts`:

```ts
/**
 * Advances in 50 ms steps until the unit's clock has stepped to its next second, so that the next step is a second away
 * (the same wait as untilClockSteps in SelfTestRightPage.test.ts, for the #331 twin of this test)
 */
async function untilClockSteps(unit: HeadlessUnit) {
    const seconds = () => unit.props.sensors.in.gps.timeZulu.getSeconds();
    const before = seconds();
    for (let i = 0; seconds() === before; i++) {
        if (i >= 40) throw new Error('untilClockSteps: the clock did not step within 2 s');
        await vi.advanceTimersByTimeAsync(50);
    }
}

describe('SET 2 time entry (checked in the KLN 89 trainer, 2026-10-18)', () => {
    // 3-53 makes the time editable only while no satellite supplies it, hence the cold GPS. Checked in the KLN 89 trainer, 2026-10-18: a
    // SET 2 time entry started the clock at the entered hour and minute with the seconds at 00. The seconds are their
    // own cells of the time row, `20:00:32UTC`: columns 6 and 7 of the left half. The ENT is pressed just after the
    // clock steps, so that the seconds are read before the next step, which would show 01
    it('starts the clock with the seconds at zero when the time is entered (checked in the KLN 89 trainer, 2026-10-18) (#397)', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // the time
        await unit.panel.inner('L', 21); // the first click opens the entry on hour 00, so 21 clicks give 20
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[3].slice(0, 5)).toBe('20:00'); // Precondition: the entry
        await untilClockSteps(unit);
        expect(unit.props.sensors.in.gps.timeZulu.getSeconds()).not.toBe(0); // Precondition: a zero would prove nothing
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // Precondition: no satellite time replaces it

        await unit.panel.ent();

        expect(Screen.read().rows('L')[3].slice(0, 8)).toBe('20:00:00');
    });
});
```

  (`HeadlessUnit`, `vi`, `Screen` and `bootUnit` are imported already.)

- [ ] **Step 2: Run to see it fail** (`20:00:` and the running seconds).

- [ ] **Step 3: Implement** in `Set2Page.saveTime`:

```ts
        const newDate = oldDate.withEnteredTime(date.getHours(), date.getMinutes()); //the seconds start at 00 (checked in the KLN 89 trainer, 2026-10-18; #397)
```

- [ ] **Step 4: Run the file, then `npm test` (4440 passed | 20 expected fail), `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 5: Commit** `fixes #397 start the clock at the full minute after a time entry on SET 2`

**Conditions → tests:** SET 2 uses the helper → `withTime` again: 1 red, the new test (the #331 pin and the unit test
stay green, as predicted).

**Vehicles:** none.

```json:metadata
{"files": ["kln90b/pages/left/Set2Page.tsx", "test/render/pages/left/Set2Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/left/Set2Page.test.ts && npm test", "acceptanceCriteria": ["SET 2 time entry shows 20:00:00 right after ENT"], "modelTier": "mechanical"}
```

---

---

### Task 16: The self-test date and time stay editable while the GPS is valid (#125)

**Goal:** No code change. A characterization in `SelfTestRightPage.test.ts` holds the maintainer's decision: the
self-test page takes date and time entries while the GPS is valid; SET 2 keeps its lock (3-53). The commit closes the
question.

**Files:**
- Test: `test/render/pages/right/SelfTestRightPage.test.ts` (import `untilCalcTick`; a new describe before
  `const AIR_DATA_BARO_XML`)

**Acceptance Criteria:**
- [ ] With the default fast acquisition the GPS is valid on the self-test page; a time entry 16:27 is shown right after
  ENT, the satellite time (`12:00`) is back one second later, and the cursor reaches the date.
- [ ] The test turns red when the SET 2 lock is added to the self-test page (the inventory's 125.patch).

**Verify:** `npx vitest run test/render/pages/right/SelfTestRightPage.test.ts` → all pass; then `npm test` → 4441
passed | 20 expected fail (4461).

**Steps:**

- [ ] **Step 1: The test.** Import: `import {BootOptions, bootToSelfTest, HeadlessUnit, untilCalcTick} from
  '../../../harness/boot';`. Before `const AIR_DATA_BARO_XML = ...`:

```ts
// #125, decided by the maintainer: the self-test page keeps its date and time editable while the GPS is valid, and SET 2
// keeps its lock (3-53). Both trainers took a date and time entry on their power-up page (the KLN 89 and the AVsoftech
// trainer, which is unreliable, 2026-10-18). With a valid GPS the next calculation tick puts the satellite time back
describe('self-test right page entries while the GPS is valid (characterization)', () => {
    it('takes a time entry, which the GPS time replaces at the next calculation tick, and offers the date (#125) (characterization)', async () => {
        const unit = await onSelfTestPage();
        expect(unit.props.sensors.in.gps.isValid()).toBe(true); // Precondition: the fast acquisition has a fix by now
        await enterTime1627(unit);
        await untilCalcTick(unit); // The next calculation tick is 750 to 1000 ms away, past the display tick of ENT

        await unit.panel.ent();
        expect(Screen.read().rows('R')[2].slice(0, 5)).toBe('16:27');

        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('R')[2].slice(0, 5)).toBe('12:00');
        await backTo(unit, '01 JUN 26'); // The date is a cursor field too
        expect(unit.errors).toEqual([]);
    });
});
```

- [ ] **Step 2: Check that it bites.** Apply the SET 2 guard to the self-test page by hand (in the constructor after
  `setReadonly(isBaroTransmitted(...))` and in `redraw()` after the seconds:
  `if (this.props.sensors.in.gps.isValid()) { this.children.get("date").isReadonly = true; this.children.get("time").isReadonly = true; }`),
  run the file: the new test is red (with six existing cursor and snapshot tests); with the guard in `redraw()` only, it
  is red too. Restore; `git diff` shows only the test.

- [ ] **Step 3: Run the file, then `npm test` (4441 passed | 20 expected fail), `npx tsc --noEmit`, `npm run build`.**

- [ ] **Step 4: Commit** `fixes #125 hold that the self-test date and time stay editable while the GPS is valid, while SET 2 keeps its lock (3-53)`

**Conditions → tests:** no condition is added. The alternative (the lock): constructor and redraw → 7 red, among them
the new test; redraw only → 4 red, among them the new test.

**Vehicles:** none.

```json:metadata
{"files": ["test/render/pages/right/SelfTestRightPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/SelfTestRightPage.test.ts && npm test", "acceptanceCriteria": ["a characterization holds that the self-test time and date are editable while the GPS is valid", "it turns red under the SET 2 lock"], "modelTier": "mechanical"}
```

---

### Task 17: The altitude alerter is off by default (#141)

**Goal:** `Output.AltitudeAlertEnabled` defaults to false. Every test that relied on the old default states
`ALTITUDE_ALERT(true)`; the parser tests hold the new default in `DEFAULTS`; the docs state it.

Built last, on top of Tasks 6-10 (measured on Tasks 6-9 and again with Task 10; in the real run also after lane M; lane M adds tests to
`test/render/pages/right/SelfTestRightPage.test.ts` and `test/render/pages/left/Set2Page.test.ts`. The only #141 vehicle
in those files is `SelfTestRightPage.test.ts`, describe `approving the self-test page (spec)`, test `plays five short
beeps (3-7)`; Set2Page.test.ts has none). Re-measure the vehicles after the merge: a test lane M or H added that boots
with the default and turns ALERT on, opens SET 5/SET 9 volume, or records beeps needs the same treatment.

**Files:**
- Modify: `kln90b/settings/KLN90BPlaneSettings.ts:110`
- Modify: `test/harness/panelXml.ts` (the `ALTITUDE_ALERT` doc comment), `docs/architecture.md` (the parser defaults
  list and the note below it), `test/README.md` (`recordSounds` and `panelXml` paragraphs of section 4)
- Test: `test/unit/settings/KLN90BPlaneSettings.test.ts`, `test/unit/harness/panelXml.test.ts`, and the vehicles:
  `test/render/controls/selects/{SelectField,VolumeFieldset}.test.ts`,
  `test/render/pages/left/{AltPage,Set5Page,Set8Page,Set9Page}.test.ts`,
  `test/render/pages/right/SelfTestRightPage.test.ts`

**Acceptance Criteria:**
- [ ] The pin `defaults AltitudeAlertEnabled to false (#141)` passes as a plain `it`.
- [ ] `DEFAULTS` of the parser tests holds `altitudeAlertEnabled: false`, and the per-key table has the row
  `Output.AltitudeAlertEnabled` with `true`.
- [ ] Every vehicle below states `ALTITUDE_ALERT(true)` (or the parser test the new default) and passes.
- [ ] `docs/architecture.md`, `test/harness/panelXml.ts` and `test/README.md` state the false default.

**Verify:** `npx vitest run test/unit/settings/KLN90BPlaneSettings.test.ts test/unit/harness/panelXml.test.ts test/render/pages/left test/render/controls/selects test/render/pages/right/SelfTestRightPage.test.ts` → all pass; then `npm test` → 4453 tests, no failures.

**Steps:**

- [ ] **Step 1: Apply the fix once and measure.** `KLN90BPlaneSettings.ts:110`:
  `altitudeAlertEnabled: this.getBoolean(instrumentsTag, "Output.AltitudeAlertEnabled", false),`. Run `npm test`:
  measured on Tasks 6-9, 33 tests change (the pin and the 32 vehicles below; the inventory's 31 plus the #259 WARN pin,
  which became a plain test in Task 8). Every new test of Task 8 states `ALTITUDE_ALERT(true)` already.

- [ ] **Step 2: Parser tests.** In `test/unit/settings/KLN90BPlaneSettings.test.ts`:
  - `DEFAULTS.output` becomes `{obsTarget: 0, altitudeAlertEnabled: false, writeGPSSimVars: true}`; delete the helper
    `withoutAltAlert` with its comment, and unwrap every call: `withoutAltAlert(x)` → `x` (eleven calls; the tests then
    compare the whole parsed object).
  - In `each key alone`, add the row
    `['Output.AltitudeAlertEnabled', '<Output><AltitudeAlertEnabled>true</AltitudeAlertEnabled></Output>', 'output.altitudeAlertEnabled', true],`
    after the `Output.ObsTarget` row, and delete the separate `it.each` "Output.AltitudeAlertEnabled %s is read and
    nothing else changes" with its comment (its `false` row is now the default, so it could not fail).
  - "uses the default for an invalid AltitudeAlertEnabled and records the problem":

```ts
        // #141: the default is false
        it('uses the default for an invalid AltitudeAlertEnabled and records the problem', () => {
            const {settings, problems} = parseWithProblems(kln('<Output><AltitudeAlertEnabled>no</AltitudeAlertEnabled></Output>'));

            expect(settings).toEqual(DEFAULTS);
            expect(problems).toEqual(['Output.AltitudeAlertEnabled: "no" is not true or false. The default false is used.']);
        });
```

  - The pin:

```ts
    // The maintainer's ruling (#141): false is intended, as the wiki sample and cfg/panel.xml show. An aircraft that
    // omits the key gets no altitude alerter, and SET 9 shows FEATURE DISABLED
    it('defaults AltitudeAlertEnabled to false (#141)', () => {
        expect(parse('<PlaneHTMLConfig></PlaneHTMLConfig>').output.altitudeAlertEnabled).toBe(false);
    });
```

  In `test/unit/harness/panelXml.test.ts`: the `CASES` entry becomes
  `'Output.AltitudeAlertEnabled': [true, s => s.output.altitudeAlertEnabled],` (a value the parser does not default
  to), and in "sets what each preset names" the line before the `ALTITUDE_ALERT(false)` line is
  `expect(parse(panelXml(ALTITUDE_ALERT(true))).output.altitudeAlertEnabled).toBe(true);`.

- [ ] **Step 3: Render vehicles.** In each of `SelectField.test.ts`, `VolumeFieldset.test.ts`, `Set5Page.test.ts`,
  `Set8Page.test.ts`, `Set9Page.test.ts` and `AltPage.test.ts`, after the imports (import
  `{ALTITUDE_ALERT, panelXml} from '../../../harness/panelXml'` where the file lacks it: SelectField, VolumeFieldset,
  Set8):

```ts
// #141: the parser default of Output.AltitudeAlertEnabled is false, so a test that needs the altitude alerter states it
const ALERT_INSTALLED = panelXml(ALTITUDE_ALERT(true));
```

  and these boots get `panelXml: ALERT_INSTALLED` (`bootUnit()` → `bootUnit({panelXml: ALERT_INSTALLED})`,
  `bootUnit({storage...})` → `bootUnit({panelXml: ALERT_INSTALLED, storage...})`):
  - `SelectField.test.ts`: `onVolume` (holds all six vehicles: "wraps a digit from 9 to 0 and from 0 to 9 (checked in
    the KLN 89 trainer, 2026-10-08, T4)", "keeps the value and the cursor on ENT (checked in the KLN 89 trainer,
    2026-10-11, #354)", and the four of `select field (characterization)`).
  - `VolumeFieldset.test.ts`: all four tests ("visits the tens and the units of the volume (3-57)", "takes 52 digit by
    digit (3-57)", "wraps the units digit of the volume (checked in the KLN 89 trainer, 2026-10-08, T4)", "takes the
    lowest volume 00 (3-57)").
  - `Set5Page.test.ts`: the four tests of `SET 5 height above airport alert offset (#89)`, "shows the alert off with
    the cursor off", the two of `SET 5 offset while the alert is off (characterization)`, and "offers offsets up to 2000
    ft (3-58)" (not the 3-57 FEATURE DISABLED test).
  - `Set8Page.test.ts`: "leaves the SET 5 offset alone when the buffer changes (#89)".
  - `Set9Page.test.ts`: "sets the volume 02 digit by digit (3-57)", and the characterization, whose title loses "by
    default": `it('characterization: the alert volume with the alert enabled', ...)` (it no longer shows the default).
  - `AltPage.test.ts`: "shows the barometer, ALERT ON and the WARN line with the cursor on ALERT (characterization)",
    "steps the cursor through the three baro positions to ALERT (3-55)", "shows the arrow after ON and the WARN line
    (3-55)", "offers the warn altitudes 200 to 900 ft in 100 ft steps (3-55)", and `warn500ThenCycle` (holds "WARN 500
    ft, a power cycle, and the WARN line shown again (3-55)" and "keeps the WARN altitude of 500 ft over a power cycle
    (3-55, #259)"); in "shows the baro setting of the altimeter and skips it with the cursor (characterization)" the
    panel becomes `panelXml({...AIRDATA, 'Input.Airdata.BaroSource': 1, ...ALTITUDE_ALERT(true)})`.

  `BaroFieldset.test.ts` stays unchanged: with Task 10 (#399) in, its 1000 MB test passes on the default
  installation (measured).

  `SelfTestRightPage.test.ts`, describe `approving the self-test page (spec)`, "plays five short beeps (3-7)":
  `const unit = await onSelfTestPage({panelXml: panelXml(ALTITUDE_ALERT(true))}); // #141: the alert audio is off by default`.

- [ ] **Step 4: Docs.** `test/harness/panelXml.ts`, the doc comment of `ALTITUDE_ALERT`:

```ts
/**
 * The parser default is false (#141). A test that needs the alerter states ALTITUDE_ALERT(true), and one of an
 * installation without it states false, so that the precondition is in the test
 */
```

  `docs/architecture.md`, the parser defaults:

```md
    - `Output.{ObsTarget=0, AltitudeAlertEnabled=false, WriteGPSSimVars=true}` (`AltitudeAlertEnabled` was true before
      #141)
```

  and the note below the list:

```md
- The sample `cfg/panel.xml` sets `AltitudeAlertEnabled=false`, the default. An aircraft that wants the altitude alerter
  sets it to true and declares the `kln_short_beep` and `kln_long_beep` sounds.
```

  `test/README.md`, the end of the `recordSounds` paragraph:

```md
  for sounds only when the panel.xml of the boot sets `Output.AltitudeAlertEnabled` to true (it defaults to false,
  #141), so a test of the sounds states `ALTITUDE_ALERT(true)`.
```

  and the end of the `panelXml` paragraph:

```md
  from the default, so a misspelled entry of the list fails there. The altitude alert is a function so that a test
  states either value: the parser default is false (#141), and a test that needs the alerter states
  `ALTITUDE_ALERT(true)`.
```

- [ ] **Step 5: Run the task's files, then `npm test`, `npx tsc --noEmit`, `npm run build`.** Expected: 4453 tests
  (one fewer: the two-row `it.each` became one table row), all green.

- [ ] **Step 6: Commit** `fixes #141 default Output.AltitudeAlertEnabled to false, as the documented panel.xml samples show, and state the alerter in the tests that need it`

  Release notes and the wiki page panel.xml customization (maintainer): aircraft that relied on the alerter without
  the key must now set `Output.AltitudeAlertEnabled` to true.

**Conditions → tests:**

| condition | mutation | red |
|---|---|---|
| the parser default false | back to `true` | the pin; panelXml "reaches the parser with Output.AltitudeAlertEnabled"; every `DEFAULTS` comparison of KLN90BPlaneSettings.test.ts (40 tests) |

Stayed green as predicted under that mutation: "the sample cfg/panel.xml parses to the defaults, except the
electricity SimVar" (the sample sets false explicitly) and every render vehicle (they now state their installation).

**Vehicles (measured on top of Task 9; the BaroFieldset test of that measurement drops out once Task 10 is in):** panelXml.test.ts "reaches the parser with Output.AltitudeAlertEnabled";
KLN90BPlaneSettings.test.ts "uses the default for an invalid AltitudeAlertEnabled and records the problem";
SelfTestRightPage.test.ts "plays five short beeps (3-7)"; SelectField.test.ts ×6; VolumeFieldset.test.ts ×4; AltPage.test.ts ×7 (the six of the inventory and the #259
WARN pin of Task 8); Set5Page.test.ts ×8; Set8Page.test.ts ×1; Set9Page.test.ts ×2.

```json:metadata
{"files": ["kln90b/settings/KLN90BPlaneSettings.ts", "test/harness/panelXml.ts", "docs/architecture.md", "test/README.md", "test/unit/settings/KLN90BPlaneSettings.test.ts", "test/unit/harness/panelXml.test.ts", "test/render/controls/selects/SelectField.test.ts", "test/render/controls/selects/VolumeFieldset.test.ts", "test/render/pages/left/AltPage.test.ts", "test/render/pages/left/Set5Page.test.ts", "test/render/pages/left/Set8Page.test.ts", "test/render/pages/left/Set9Page.test.ts", "test/render/pages/right/SelfTestRightPage.test.ts"], "verifyCommand": "npx vitest run test/unit/settings/KLN90BPlaneSettings.test.ts test/unit/harness/panelXml.test.ts test/render/pages/left test/render/controls/selects test/render/pages/right/SelfTestRightPage.test.ts && npm test", "acceptanceCriteria": ["the #141 pin passes as a plain test", "DEFAULTS holds altitudeAlertEnabled false", "every vehicle states ALTITUDE_ALERT(true)", "the docs state the false default"], "modelTier": "standard"}
```

---

## Close-out (controller, after Task 17)

- A final review of the whole branch (`git diff master..m10-power-persistence`), then a local merge into master once the
  maintainer approves. No push.
- A comment on #192 that the ALT page is decided: ALERT and WARN are user settings since #259 (the AVsoftech trainer
  kept both over a power cycle; the maintainer's ruling).
- For the maintainer (not done by the agents): the wiki pages Hot Swapping and Package Detection (#138, #350, #353,
  #398: a disabled unit ignores every H event including power and brightness, does not claim GPS OVERRIDDEN, leaves
  the EFB request unanswered, does not write the "kln90b" planner and mirrors FPL 0 once on the resume), panel.xml
  customization (#141, the false default), FAQ for the EFB sync (#187); release notes for #141, #101 (data converted by
  2.2 or later stays wrong), the hot swap changes, and the new setting keys of #92 and #259.
- #400 (found while drafting; no milestone) is not part of this plan.
