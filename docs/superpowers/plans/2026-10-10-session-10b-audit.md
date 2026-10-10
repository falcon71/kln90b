# Session 10b: the audit's findings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** settle every finding of the Session 10b audit: harness helpers H1 to H13 with the tests moved onto them, the
stragglers, the pins of #93, #95 and #96, the debt D1 to D7, the component tests, and Session 11's plan text.

**Architecture:** a harness task builds every helper with its harness test and its `testing.md` section 4 paragraph,
alone. Six main tasks then run in parallel worktrees, each owning a disjoint set of test files by directory, moving its
files onto the helpers and writing the new tests of its area. An issues and close-out task finishes the session.

**Tech Stack:** TypeScript, Vitest (unit, render on happy-dom, flight), the project's headless harness in `test/harness/`.

**Spec:** [docs/superpowers/specs/2026-10-10-session-10b-audit-design.md](../specs/2026-10-10-session-10b-audit-design.md).
Inputs: [the findings](../specs/2026-10-09-session-10b-findings.md) and
[the inventory](../specs/2026-10-10-session-10b-inventory.md) (every copy with its file and line on 2026-10-10; confirm
each line before use). The design's task 1 is split here into tasks 1 and 2 by file name (the design allows it), so the
design's tasks 2 to 6 are tasks 3 to 7 here.

## Global Constraints

Every implementer and every reviewer gets these.

**Rules of the session.** `docs/test-coverage.md` section 2 (rules 1 to 27) and `CLAUDE.md` apply. In particular:

- **Spec or characterization (rules 6 to 8, `testing.md` section 5).** A spec test cites its source in a comment (a
  Pilot's Guide page such as `3-44`, the panel.xml contract, `docs/architecture.md`); a characterization test says
  "characterization" in its title or describe and carries **no** manual page. A describe titled with a page holds only
  spec tests of that page. Never assert a bug as correct: pin it with `it.fails('… (#NN)')`, or with
  `#NEW-<task>-<n>` when no issue exists (rule 23).
- **No manual text** in the repo, commits or reports (copyright): cite page numbers, paraphrase in your own words.
- **No behavior change** in `kln90b/` (rule 12). D6 is comments only.
- **Proof (rule 10 and the design's Proof section).** A new test or pin fails when its subject is broken in the working
  tree; restore and confirm `git diff` shows only intended changes. A moved test whose setup changes meaning (a drifted
  copy, a panel.xml value, an H3 filter, an H9 settle or ABC check, a changed H7 or show wait) is re-proven by the break
  its original commit recorded (`git log -S'<title words>' --format=%H%n%B -- <file>` finds the `Proof:` line) or by a
  break you choose when none is recorded. A rename without a change of meaning (H4, H6, H10, H12) needs the full suite
  green and one break per helper. Each pin's temporary fix is applied and the **full** suite run, so that a test
  elsewhere that uses the bug as its vehicle is found; report such tests, do not edit another task's files.
- **A test that turns red after its move** is a finding: report it, then correct the test or pin a code bug. Never loosen
  an assertion to make it pass.
- **Keep assertions.** A move replaces the setup or the reader, never what is asserted. A copy whose helper does not fit
  without changing an assertion stays, and the report says why. Ids marked `?` in the inventory are optional sites:
  move them when the helper fits as is.
- **American English**, no counts in prose for things that grow (`CLAUDE.md`, Writing), comment density like the
  surrounding code.

**Workflow (rules 21, 22).**

- Implementers of tasks 1 to 6 run in their own worktree (`isolation: "worktree"`). First:
  `git reset --hard tests-session-10b-audit` on the worktree's own (empty) branch; create the `node_modules` junction if
  it is missing (PowerShell: `New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules`).
- Run `npm test` and `npx tsc --noEmit` in full before committing; both must be clean (the expected failures are the
  `it.fails` pins).
- One commit per task plus one per fix round, never amended. The message lists one `Proof:` line per helper, per
  re-proven test and per new test or pin, and ends with
  `Co-Authored-By: <the model that wrote the commit> <noreply@anthropic.com>`. Write the commit message with a Bash
  heredoc (no BOM).
- Write the report to `.task-report.md` at the root of your worktree (Bash heredoc first, the Write tool as the
  fallback; never commit it). It lists: per file, what moved onto which helper and what stayed with its reason; every
  re-proof; every new test with spec or characterization; a **per-describe label audit** of every describe you added or
  changed (title, spec or characterization, any page number or source); every suspected bug with a reproduction. Reply
  with only the status, the head commit and your concerns.
- Do not edit `docs/test-coverage.md`, `docs/testing.md` (except task 0 and task 7) or another task's files. Do not file
  issues.

**File ownership (no two tasks touch one file).**

| task | owns |
|---|---|
| 0 | `test/harness/**`, new harness tests, `docs/testing.md` section 4 and the section 7 items it builds |
| 1 | `test/render/pages/*.test.ts` (top level), `test/render/pages/left/` files starting A to N, `test/render/pages/FiveSegmentPage.test.ts` (new) |
| 2 | `test/render/pages/left/` files starting O to Z |
| 3 | `test/render/pages/right/`, `test/unit/pages/right/Apt3ListPage.test.ts` (new) |
| 4 | `test/render/controls/**` |
| 5 | `test/render/*.test.ts` (top level), `test/render/data/**`, `test/render/services/` |
| 6 | `test/unit/**` (except task 3's new file), `test/flight/**`, `test/render/harness/` (existing files) |
| 7 | `docs/test-coverage.md`, `docs/testing.md` section 7, the design's issue rows |

**User decisions (already made):**

- H1 to H5 are built, and all of H6 to H13.
- D1 to D3 are fixed; D4 to D7 in full; D6 by a comment naming each coupling, without a production change.
- `FiveSegmentPage`, the APT 3 string table and `Apt3ListPageContainer` get tests; the `FourSegmentPage` ENT order goes
  to `testing.md` section 7.
- #96 is pinned with a handler count.
- The harness API, the task split, the proof rules and the defaults of the design are approved.

---

### Task 0: Harness helpers H1 to H13

**Goal:** every helper of the design exists in `test/harness/` with a harness test proven by a break and a paragraph in
`testing.md` section 4.

**Files:**
- Create: `test/harness/panelXml.ts`, `test/harness/readers.ts`, `test/harness/worldBoot.ts`, `test/harness/console.ts`
- Modify: `test/harness/boot.ts` (`NEAREST_SEARCH_WAIT_MS`, `HeadlessUnit.overlay`, the random spy restored at
  teardown, the comment on the `19_000` wait of `bootToSelfTest`), `test/harness/sim/random.ts`,
  `test/harness/sim/FakeSim.ts` (`writeCount`), `test/harness/flight/FrontPanel.ts` (`readMessages`, `directTo`, `show`,
  `confirmSet1AndReselect`, `enterDate`), `test/harness/render/screen.ts` (`inverse`, `pageRows`),
  `test/harness/render/superNav5.ts` (`showSuperNav5`, `superNav5OnLeg`, `superNav5OnArc`),
  `test/harness/render/mount.ts` (`mountedText`, `mountedRead`), `docs/testing.md` (section 4; section 7 items built)
- Test: `test/unit/harness/panelXml.test.ts`, `test/render/harness/readers.test.ts`,
  `test/render/harness/readMessages.test.ts`, `test/render/harness/worldBoot.test.ts`,
  `test/render/harness/frontPanelHelpers.test.ts`, `test/render/harness/consoleHelper.test.ts`, appended:
  `test/render/harness/screen.test.ts`, `test/render/harness/superNav5.test.ts`, `test/render/harness/mount.test.ts` (or
  the file that tests `mount` today), `test/unit/harness/fakes.test.ts`, `test/unit/harness/teardown.test.ts`

**Acceptance Criteria:**
- [ ] Every helper below exists with the given name and signature (a detail may change if the report says why).
- [ ] `test/unit/harness/panelXml.test.ts` parses every key of `PANEL_KEYS` with a non-default value through the real
      `KLN90BPlaneSettingsParser` and asserts the parsed setting differs from the default; it fails when a key in
      `PANEL_KEYS` is misspelled (proof).
- [ ] Each helper's harness test fails under a break of the helper (one `Proof:` line each).
- [ ] `Math.random` is restored after a boot's teardown (a harness test asserts it).
- [ ] No test outside `test/harness/` and the harness tests changes; `npm test` and `npx tsc --noEmit` clean.
- [ ] `docs/testing.md` section 4 has a paragraph per helper; section 7 loses only the items this task builds (the
      `messages(unit)` reader, the `userWaypoints` reader, the inverse reader, `unit.overlay()`, `sim.writeCount`) and
      says the copies are moved by the main tasks of Session 10b.

**Verify:** `npm test` → all files pass (the new harness tests included); `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: H1, the panel.xml builder.** Create `test/harness/panelXml.ts`:

```ts
/**
 * A PlaneHTMLConfig document for BootOptions.panelXml, built from the keys the parser reads
 * (kln90b/settings/KLN90BPlaneSettings.ts). A key is the parser's dotted path; the parser walks it tag by tag and
 * falls back to its default for a tag it does not find, so a misspelled key would test the default. The keys are
 * therefore a closed list, and test/unit/harness/panelXml.test.ts parses each one.
 */
export const PANEL_KEYS = [
    'TakeHomeMode', 'BasePath', 'VFROnly',
    'Input.AltimeterInterfaced', 'Input.ObsSource', 'Input.HeadingInput', 'Input.ElectricitySimVar',
    'Input.Airdata.IsInterfaced', 'Input.Airdata.BaroSource',
    'Input.FuelComputer.IsInterfaced', 'Input.FuelComputer.Unit', 'Input.FuelComputer.Type',
    'Input.FuelComputer.FOBTransmitted', 'Input.FuelComputer.FuelUsedTransmitted',
    'Input.ExternalSwitches.LegObsSwitchInstalled', 'Input.ExternalSwitches.AppArmSwitchInstalled',
    'Output.ObsTarget', 'Output.AltitudeAlertEnabled', 'Output.WriteGPSSimVars',
] as const;

export type PanelKey = typeof PANEL_KEYS[number];

export type PanelOptions = Partial<Record<PanelKey, string | number | boolean>> & {
    /** Raw XML placed under <Instrument> after the keys, for what the keys do not cover */
    extra?: string;
};

type Node = { [tag: string]: Node | string };

export function panelXml(o: PanelOptions = {}): string {
    for (const key of Object.keys(o)) {
        if (key !== 'extra' && !(PANEL_KEYS as readonly string[]).includes(key)) {
            throw new Error(`panelXml: ${key} is not a key the parser reads (PANEL_KEYS)`);
        }
    }
    const root: Node = {};
    for (const key of PANEL_KEYS) {
        const value = o[key];
        if (value === undefined) continue;
        const path = key.split('.');
        let node = root;
        for (const tag of path.slice(0, -1)) {
            if (node[tag] === undefined) node[tag] = {};
            node = node[tag] as Node;
        }
        node[path[path.length - 1]] = String(value);
    }
    const xml = (n: Node): string =>
        Object.entries(n).map(([tag, c]) => `<${tag}>${typeof c === 'string' ? c : xml(c)}</${tag}>`).join('');
    return `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>${xml(root)}${o.extra ?? ''}</Instrument></PlaneHTMLConfig>`;
}

/** No OBS course input: the unit reads the course from L:KLN90B_ObsSource 0 (the parser default is 1) */
export const NO_OBS = {'Input.ObsSource': 0} as const;
export const HEADING_INPUT = {'Input.HeadingInput': true} as const;
export const NO_GPS_SIMVARS = {'Output.WriteGPSSimVars': false} as const;
export const LEG_OBS_SWITCH = {'Input.ExternalSwitches.LegObsSwitchInstalled': true} as const;
export const NO_ALTIMETER = {'Input.AltimeterInterfaced': false} as const;
export const VFR_ONLY = {'VFROnly': true} as const;
export const AIRDATA = {'Input.Airdata.IsInterfaced': true} as const;
/** Explicit, because the parser default (true) is the open question #141 */
export const ALTITUDE_ALERT = (enabled: boolean) => ({'Output.AltitudeAlertEnabled': enabled}) as const;

/** An interfaced fuel computer; the rest of its keys only when given */
export function fuelComputer(o: { unit?: string, type?: string, fob?: boolean, fuelUsed?: boolean } = {}): PanelOptions {
    const out: PanelOptions = {'Input.FuelComputer.IsInterfaced': true};
    if (o.unit !== undefined) out['Input.FuelComputer.Unit'] = o.unit;
    if (o.type !== undefined) out['Input.FuelComputer.Type'] = o.type;
    if (o.fob !== undefined) out['Input.FuelComputer.FOBTransmitted'] = o.fob;
    if (o.fuelUsed !== undefined) out['Input.FuelComputer.FuelUsedTransmitted'] = o.fuelUsed;
    return out;
}
```

- [ ] **Step 2: H1 harness test.** Create `test/unit/harness/panelXml.test.ts` (the unit stage has `DOMParser`, as
  `test/unit/settings/KLN90BPlaneSettings.test.ts:46` shows). A `Record<PanelKey, …>` makes `tsc` demand a case for
  every key:

```ts
import {describe, expect, it} from 'vitest';
import {KLN90BPlaneSettingsParser, KLN90PlaneSettings} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {
    AIRDATA, ALTITUDE_ALERT, fuelComputer, HEADING_INPUT, LEG_OBS_SWITCH, NO_ALTIMETER, NO_GPS_SIMVARS, NO_OBS,
    PANEL_KEYS, PanelKey, panelXml, PanelOptions, VFR_ONLY,
} from '../../harness/panelXml';

const parse = (xml: string) =>
    new KLN90BPlaneSettingsParser().parsePlaneSettings(new DOMParser().parseFromString(xml, 'text/xml'));
const defaults = parse(panelXml());

// A value the parser does not default to, and where the parser puts the key
const CASES: Record<PanelKey, [string | number | boolean, (s: KLN90PlaneSettings) => unknown]> = {
    'TakeHomeMode': [true, s => s.takeHomeMode],
    'BasePath': ['custom/path', s => s.basePath],
    'VFROnly': [true, s => s.vfrOnly],
    'Input.AltimeterInterfaced': [false, s => s.input.altimeterInterfaced],
    'Input.ObsSource': [0, s => s.input.obsSource],
    'Input.HeadingInput': [true, s => s.input.headingInput],
    'Input.ElectricitySimVar': ['CIRCUIT ON:1', s => s.input.electricitySimVar],
    'Input.Airdata.IsInterfaced': [true, s => s.input.airdata.isInterfaced],
    'Input.Airdata.BaroSource': [1, s => s.input.airdata.baroSource],
    'Input.FuelComputer.IsInterfaced': [true, s => s.input.fuelComputer.isInterfaced],
    'Input.FuelComputer.Unit': ['LB', s => s.input.fuelComputer.unit],
    'Input.FuelComputer.Type': ['JetA1', s => s.input.fuelComputer.type],
    'Input.FuelComputer.FOBTransmitted': [false, s => s.input.fuelComputer.fobTransmitted],
    'Input.FuelComputer.FuelUsedTransmitted': [false, s => s.input.fuelComputer.fuelUsedTransmitted],
    'Input.ExternalSwitches.LegObsSwitchInstalled': [true, s => s.input.externalSwitches.legObsSwitchInstalled],
    'Input.ExternalSwitches.AppArmSwitchInstalled': [true, s => s.input.externalSwitches.appArmSwitchInstalled],
    'Output.ObsTarget': [1, s => s.output.obsTarget],
    'Output.AltitudeAlertEnabled': [false, s => s.output.altitudeAlertEnabled],
    'Output.WriteGPSSimVars': [false, s => s.output.writeGPSSimVars],
};

describe('panelXml (harness)', () => {
    it.each(PANEL_KEYS)('reaches the parser with %s', key => {
        const [value, read] = CASES[key];
        expect(read(defaults)).not.toEqual(value);
        expect(read(parse(panelXml({[key]: value})))).toEqual(value);
    });

    it('refuses a key the parser does not read', () => {
        expect(() => panelXml({'Input.ObsSorce': 0} as PanelOptions)).toThrow(/Input.ObsSorce/);
    });

    it('nests several keys under one parent', () => {
        const s = parse(panelXml({...NO_OBS, ...HEADING_INPUT, ...NO_ALTIMETER}));
        expect([s.input.obsSource, s.input.headingInput, s.input.altimeterInterfaced]).toEqual([0, true, false]);
    });

    it('sets what each preset names', () => {
        expect(parse(panelXml(NO_GPS_SIMVARS)).output.writeGPSSimVars).toBe(false);
        expect(parse(panelXml(LEG_OBS_SWITCH)).input.externalSwitches.legObsSwitchInstalled).toBe(true);
        expect(parse(panelXml(VFR_ONLY)).vfrOnly).toBe(true);
        expect(parse(panelXml(AIRDATA)).input.airdata.isInterfaced).toBe(true);
        expect(parse(panelXml(ALTITUDE_ALERT(false))).output.altitudeAlertEnabled).toBe(false);
        const fuel = parse(panelXml(fuelComputer({unit: 'IMP', type: 'JetB', fob: false, fuelUsed: false}))).input.fuelComputer;
        expect(fuel).toEqual({isInterfaced: true, unit: 'IMP', type: 'JetB', fobTransmitted: false, fuelUsedTransmitted: false});
    });

    it('places extra XML under the instrument', () => {
        expect(parse(panelXml({extra: '<VFROnly>true</VFROnly>'})).vfrOnly).toBe(true);
    });
});
```

  Run `npx vitest run test/unit/harness/panelXml.test.ts` → PASS. Proof: change `'Input.ObsSource'` in `PANEL_KEYS`
  and `CASES` to `'Input.ObsSorce'` → the `%s` case fails (the parser returns its default 1).

- [ ] **Step 3: H3, H4, H6, H10 readers.** Create `test/harness/readers.ts`:

```ts
import {Facility, FacilityType} from '@microsoft/msfs-sdk';
import {HeadlessUnit} from './boot';
import {KLNFlightplanLeg} from '../../kln90b/data/flightplan/Flightplan';

/**
 * The user waypoints of the unit's facility repository (user airports, VORs, NDBs, intersections and supplementary
 * waypoints alike), in repository order. With `type` only that facility type: FacilityType.USR is the supplementary
 * waypoints only.
 */
export function userWaypoints(unit: HeadlessUnit, type?: FacilityType): Facility[] {
    const out: Facility[] = [];
    unit.props.facilityRepository.forEach(f => out.push(f), type === undefined ? undefined : [type]);
    return out;
}

/** The message list as the MSG page would list it, each message's lines joined with a blank */
export const messages = (unit: HeadlessUnit): string[] =>
    unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

/** The message list with each message's lines kept apart */
export const messageLines = (unit: HeadlessUnit): string[][] =>
    unit.props.messageHandler.getMessages().map(m => m.message);

export const identsOf = (legs: readonly KLNFlightplanLeg[]): string[] => legs.map(l => l.wpt.icaoStruct.ident);

/** The idents of a flight plan of the unit, FPL 0 by default */
export const fplIdents = (unit: HeadlessUnit, idx = 0): string[] =>
    identsOf(unit.props.memory.fplPage.flightplans[idx].getLegs());

/** The ident of the active waypoint, undefined without one */
export const activeIdent = (unit: HeadlessUnit): string | undefined =>
    unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident;

/** ActiveWaypoint replaces the turn stack's array, so it is read fresh */
export const turnStackLength = (unit: HeadlessUnit): number =>
    unit.props.memory.navPage.activeWaypoint.turnStack.length;
```

  Confirm the import path of `KLNFlightplanLeg` (grep `export interface KLNFlightplanLeg` in `kln90b/`) and that
  `messageHandler.getMessages()` returns objects with `message: string[]`.

- [ ] **Step 4: readers harness test.** Create `test/render/harness/readers.test.ts`: boot with
  `savedUserWaypoints` (test/harness/storage.ts) holding one user VOR and one supplementary waypoint and assert
  `userWaypoints(unit)` has both idents and `userWaypoints(unit, FacilityType.USR)` only the supplementary one; add two
  `OneTimeMessage`s (one of two lines) and assert `messages` and `messageLines`; store `standardRoute()` as FPL 0 and
  FPL 3 and assert `fplIdents(unit)` and `fplIdents(unit, 3)` equal `['KAAA', 'ABC', 'KBBB']`; after `settle`,
  `activeIdent(unit)` is `'ABC'`; without a plan `activeIdent(unit)` is `undefined` and `turnStackLength(unit)` is 0. Proof: drop the type filter in `userWaypoints` → the USR assertion fails;
  join with `'|'` in `messages` → fails.

- [ ] **Step 5: H5, the full-page reader.** In `test/harness/render/screen.ts` add to `Screen`:

```ts
    /** The characters of a row shown inverse (mask I), in order: on a full page, the field under the cursor */
    public inverse(row: number): string {
        const mask = this.mask().split('\n')[row];
        return [...this.row(row)].filter((_, i) => mask[i] === 'I').join('');
    }

    /** The six text rows above the status line, each trimmed: the rows of a full page */
    public pageRows(): string[] {
        return this.text().split('\n').slice(0, 6).map(r => r.trim());
    }
```

  Append to `test/render/harness/screen.test.ts`: on the Database page after `bootToSelfTest` and APPROVE?
  (`cursorTo('R', 'APPROVE?')`, `ent()`), `Screen.read().inverse(5)` is `'ACKNOWLEDGE?'` and `pageRows()[1]` is
  `'DATA BASE EXPIRES'` (the literals of `test/render/pages/AiracPage.test.ts`; check them there). Proof: compare the
  mask with `'B'` in `inverse` → fails.

- [ ] **Step 6: H2, H7, H11 `show`, H13 `confirmSet1AndReselect` and `enterDate` on `FrontPanel`.** In
  `test/harness/flight/FrontPanel.ts` add:

```ts
    /**
     * Opens the MSG page and presses MSG until it closes (3-16; the status line's left field is empty while it shows),
     * then waits a second, so that the one-time messages read go. Returns the non-blank rows of every MSG page seen, in
     * order, each trimmed. Throws with the screen if the page is still open after `max` presses.
     */
    public async readMessages(max = 10): Promise<string[]> {
        const seen: string[] = [];
        await this.msg();
        for (let i = 0; this.screen().status().left === ''; i++) {
            if (i >= max) throw new Error(`readMessages: the MSG page did not close after ${max} presses\n${this.screen().dump()}`);
            seen.push(...this.screen().text().split('\n').slice(0, 6).map(r => r.trim()).filter(r => r !== ''));
            await this.msg();
        }
        await vi.advanceTimersByTimeAsync(1000);
        return seen;
    }

    /**
     * A Direct To the way a pilot enters one (3-27): D->, the ident typed on the left, ENT on the waypoint page that
     * confirms it, ENT to approve, then `waitMs` (default one second: one calculation tick).
     */
    public async directTo(ident: string, o: { waitMs?: number } = {}): Promise<void> {
        await this.dct();
        await this.enterIdent('L', ident);
        await this.ent();
        await this.ent();
        await vi.advanceTimersByTimeAsync(o.waitMs ?? 1000);
    }

    /** Selects a page, waits `waitMs` (default one second) and returns the six rows of that side */
    public async show(side: Side, name: string, o: { waitMs?: number } = {}): Promise<string[]> {
        await this.selectPage(side, name);
        await vi.advanceTimersByTimeAsync(o.waitMs ?? 1000);
        return this.screen().rows(side);
    }

    /** SET 1: CONFIRM?, ENT, then SET 2 and back to SET 1, so that the page reads the GPS again */
    public async confirmSet1AndReselect(): Promise<void> {
        await this.cursorTo('L', 'CONFIRM?');
        await this.ent();
        await this.selectPage('L', 'SET 2');
        await this.selectPage('L', 'SET 1');
    }

    /**
     * Enters a date in the open date editor on a side: the first click opens it with day 01, the first click on the
     * dashed month gives JAN and on a dashed year digit 0, so the day d takes d clicks, the month m (1 to 12) m clicks,
     * a year digit y + 1 clicks. The cursor must be on the day.
     */
    public async enterDate(side: Side, day: number, month: number, year: [number, number]): Promise<void> {
        await this.inner(side, day);
        await this.outer(side, 1);
        await this.inner(side, month);
        await this.outer(side, 1);
        await this.inner(side, year[0] + 1);
        await this.outer(side, 1);
        await this.inner(side, year[1] + 1);
    }
```

  (`enterDate` is `selectDate` of `test/render/controls/editors/DateEditor.test.ts:64-79` for either side; `enterDate('L',
  1, 1, [2, 7])` is the eleven steps of the #111 pin in `Set2Page.test.ts:20-30` after `cursor('L')`.)

- [ ] **Step 7: `FrontPanel` harness tests.** Create `test/render/harness/readMessages.test.ts`: after `bootUnit()` and
  `settle`, add two `OneTimeMessage`s; `readMessages()` returns their texts and afterwards
  `messageHandler.getMessages()` is `[]` and the status line's left field is not empty; `readMessages(0)` with an unread
  message rejects with `/did not close/` (the page cannot close in zero presses). Create
  `test/render/harness/frontPanelHelpers.test.ts`: `directTo('KBBB')` from a boot with `airport('KBBB', 47.2, 8.0)`
  makes KBBB active (`activeIdent`); `show('L', 'SET 2')` resolves to six rows equal to `Screen.read().rows('L')` with
  `SET 2` in the status line's left field; `enterDate` on SET 2 (`bootUnit({storage: {fastGpsAcquisition: false}, coldGps:
  true})`, `selectPage('L', 'SET 2')`, `cursor('L')`, `enterDate('L', 1, 1, [2, 7])`) shows `'  01 JAN 27'` on left row
  2; `confirmSet1AndReselect` on SET 1 leaves the cursor off and SET 1 shown. Proofs: skip the last `ent()` in
  `directTo` → fails; drop the `+ 1` of the year tens → fails; let `readMessages` return without the loop → fails.

- [ ] **Step 8: H8, Super NAV 5.** In `test/harness/render/superNav5.ts` add `showSuperNav5(unit, o: {waitMs?})`, which
  runs `selectPage('R', 'NAV 4')`, `selectPage('L', 'NAV 5')`, `inner('R', 1)`, waits `o.waitMs ?? 1000`, and throws
  with `Screen` text unless `unit.overlay() instanceof SuperNav5Page` (import from
  `kln90b/pages/left/SuperNav5Page`; confirm the path). Move `superNav5OnLeg(o)` and `superNav5OnArc(o)` there
  verbatim from `test/render/controls/selects/SuperNav5Field2Selector.test.ts:20-57` (the copies of Field1, Field2 and
  Field3 are byte-identical), replacing their last four lines with `await showSuperNav5(unit)`. Do not edit the selector
  test files (task 4 moves them). Append to `test/render/harness/superNav5.test.ts`: `showSuperNav5` on a settled
  standard route shows the overlay (`SuperNav5.read()` does not throw); with `vi.spyOn(unit, 'overlay').mockReturnValue(null)`
  installed before the call it rejects with `/showSuperNav5/` (restore the spy). Proof: remove the `instanceof` check →
  the rejecting test fails.

- [ ] **Step 9: H9 and H11 boots.** Create `test/harness/worldBoot.ts`:

```ts
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, BootOptions, HeadlessUnit, moveAircraft, settle} from './boot';
import {dtWorld, standardRoute} from './fixtures';
import {savedFlightplan} from './storage';
import {activeIdent} from './readers';

/**
 * Boots with the standard route (fixtures.ts) as FPL 0, at KAAA unless `position` is given, settles, and throws unless
 * ABC is active. `facilities` are added to the route's; `storage` is merged over the stored plan.
 */
export async function bootOnStandardRoute(opts: BootOptions = {}): Promise<HeadlessUnit> {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        ...opts,
        position: opts.position ?? {lat: kaaa.lat, lon: kaaa.lon},
        facilities: [kaaa, abc, kbbb, ...opts.facilities ?? []],
        storage: {...savedFlightplan(0, [kaaa, abc, kbbb]), ...opts.storage},
    });
    await settle(unit);
    if (activeIdent(unit) !== 'ABC') {
        throw new Error(`bootOnStandardRoute: the active waypoint is ${activeIdent(unit)}, not ABC`);
    }
    return unit;
}

/**
 * Boots in the D/T world (fixtures.ts, dtWorld) 0.1 degree north of KAAA with `legs` (default KAAA, ABC, DEF, KBBB)
 * stored as FPL 0 and, unless `fpl3` is false, as FPL 3; settles; with `moving` (default true) the aircraft flies due
 * north at 120 kt. `facilities`, when given, replaces the legs as the navdata, so it must contain them.
 */
export async function bootOnDtWorld(opts: BootOptions & { legs?: Facility[], fpl3?: boolean, moving?: boolean } = {}): Promise<HeadlessUnit> {
    const {legs: given, fpl3, moving, ...boot} = opts;
    const w = dtWorld();
    const legs = given ?? [w.kaaa, w.abc, w.def, w.kbbb];
    const position = boot.position ?? {lat: 47.1, lon: 10.0};
    const unit = await bootUnit({
        facilities: legs, ...boot, position,
        storage: {...savedFlightplan(0, legs), ...(fpl3 ?? true ? savedFlightplan(3, legs) : {}), ...boot.storage},
    });
    await settle(unit);
    if (moving ?? true) {
        await moveAircraft(unit, position, {groundspeedKt: 120, trackTrue: 0});
    }
    return unit;
}
```

  Check whether `airport()` facilities expose `lat`/`lon` (they do in `Dt1Page.test.ts` usage of `kaaa.lat`; confirm).
  Create `test/render/harness/worldBoot.test.ts`: `bootOnStandardRoute()` has ABC active and FPL 0
  `['KAAA', 'ABC', 'KBBB']`; with `storage: savedFlightplan(0, [kaaa])` (a plan whose only waypoint is KAAA) it rejects
  with `/not ABC/`; `bootOnDtWorld()` stores FPL 0 and FPL 3, `bootOnDtWorld({fpl3: false})` leaves FPL 3 empty, and
  `moving` gives a ground speed (`unit.props.sensors.in.gps.groundspeed` or the field the D/T tests read; confirm) near
  120. Proofs: remove the ABC check → the rejecting test fails; ignore `fpl3` → fails.

- [ ] **Step 10: H12 and H13 rest.**
    - `test/harness/render/mount.ts`: `export function mountedText(el: UiElement): string` (mount, `tick()`, `text()`)
      and `export function mountedRead(el: UiElement): {text: string, mask: string}` (mount, `tick()`, both).
    - `test/harness/boot.ts`: `export const NEAREST_SEARCH_WAIT_MS = 12_000;` with a comment that the nearest lists and
      the airspace alert search every 10 s (cite the code: grep the interval in `kln90b/data/navdata/NearestList.ts` and
      the airspace alert; state the file) and that 12 s leaves a search and its result; add
      `overlay(): SixLinePage | SevenLinePage | null` to `HeadlessUnit`, implemented as
      `(props.pageManager.getCurrentPage() as MainPage).getOverlayPage()`; add a comment to the `19_000` wait of
      `bootToSelfTest` (the Turn-On page shows for 17 s, 3-3; two seconds of margin for the self-test page).
    - `test/harness/sim/random.ts`: `seedRandom` returns the spy; `prepareBoot` keeps it in `LiveState`
      (`restoreRandom`) and `teardown` runs `restoreRandom()` as a step of `runAll`.
    - `test/harness/sim/FakeSim.ts`: `public writeCount(name: string): number`, counting `writes` whose name equals the
      normalized `name` (the normalizing function at line 34).
    - `test/harness/console.ts`: `muteConsoleError()`, moved verbatim from `test/render/harness/bootFailure.test.ts:13-18`
      (do not edit that file; task 6 moves it), with a doc comment that names both reasons (the error page and the SDK
      log errors with `console.error`).
    - Tests: `mountedText`/`mountedRead` on a `TextDisplay` (append to the existing mount harness test); `writeCount` in
      `test/unit/harness/fakes.test.ts` (a lower-case name counts the upper-case writes); `overlay()` in
      `test/render/harness/frontPanelHelpers.test.ts` (null on a booted unit, a `MessagePage` after `msg()` with a
      message); the random restore in `test/unit/harness/teardown.test.ts` or a render harness test (after
      `teardown()`, `vi.isMockFunction(Math.random)` is false); `muteConsoleError` in
      `test/render/harness/consoleHelper.test.ts` (a `console.error` inside the test is not passed on and the spy is
      restored after). One proof each.

- [ ] **Step 11: `testing.md`.** Section 4: one paragraph per helper in the style of the existing ones (what it does,
  when to use it, the pitfall it removes: H1 the silent default, H2 the unchecked close, H3 the type filter stated, H9
  the ABC check, H11 the FPL 3 choice). Section 7: remove the items this task builds (Session 10's `messages(unit)`,
  `unit.userWaypoints()`, inverse reader and `unit.overlay()` items; the `sim.writeCount` half of Session 4's counting
  item; Session 9b's `showSuperNav5` copies) and write once that the copies are moved by the main tasks of Session 10b.

- [ ] **Step 12: verify and commit.** `npm test`, `npx tsc --noEmit`, both clean. Commit with one `Proof:` line per
  helper.

```json:metadata
{"files": ["test/harness/panelXml.ts", "test/harness/readers.ts", "test/harness/worldBoot.ts", "test/harness/console.ts", "test/harness/boot.ts", "test/harness/sim/random.ts", "test/harness/sim/FakeSim.ts", "test/harness/flight/FrontPanel.ts", "test/harness/render/screen.ts", "test/harness/render/superNav5.ts", "test/harness/render/mount.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every helper exists with its name and signature", "panelXml harness test parses every PANEL_KEYS key and fails on a misspelled key", "each helper's harness test fails under a break", "Math.random restored after teardown", "no test outside the harness changes; npm test and tsc clean", "testing.md section 4 paragraph per helper; section 7 loses only the built items"], "modelTier": "standard"}
```

---

### Task 1: Pages, top level and left A to N; the FiveSegmentPage shell

**Goal:** the files below use the harness helpers and carry no straggler or debt item of the findings, and
`FiveSegmentPage` has characterization tests.

**Files:** (ids from the inventory's "Files by directory"; `?` = optional)
- Modify: `test/render/pages/AiracPage.test.ts` (H5), `CursorController.test.ts` (S4: `selectPage` instead of the fixed
  knob count at 14-15), `MainPage.test.ts` (D4, H2?, H8, H10?, H13a, H13e, S4: `selectPage` at 49-51; its `closeMsgPage`
  stays if `readMessages` does not fit its subject), `Nav2Page.test.ts` (D4, H13a), `ObsWarningPage.test.ts` (H1, H5),
  `PageManager.test.ts` (H10), `PageTreeController.test.ts` (H1, H7, H10), `VFROnlyPage.test.ts` (H1, H5),
  `WelcomePage.test.ts` (D4, comments only: the Turn-On timing is its subject)
- Modify: `test/render/pages/left/AltPage.test.ts` (H1), `Cal3Page.test.ts` (H1), `DirectToObs.test.ts` (H1, H6, H7?,
  H9, H10), `DirectToPage.test.ts` (H7, H9, H10, H13e), `DuplicateWaypointPage.test.ts` (H7?, H10?), `FplPage.test.ts`
  (H6, H7?, H9?, H13b?, S4: `cursorTo` at 516, 532 where the target text is unique; the missed-approach world
  `rnavWorld` stays and is reported for section 7), `Mod1Page.test.ts` (D4, H1, H9; D7: a comment on the #260 pin's
  `[0.3, 1]` check, about line 210, saying why both values are accepted), `Mod2Page.test.ts` (D5: a comment on the 30 s
  timeouts at 243 and 249 naming the 90 clicks; H1, H10), `Nav1Page.test.ts` (H7, H10), `Nav3Esa.test.ts` (H10),
  `Nav3Page.test.ts` (H1, H10), `Nav4Page.test.ts` (H1, H10), `Nav4Vnav.test.ts` (H4, H11s), `Nav5Page.test.ts` (H1,
  H7, H9, H10)
- Create: `test/render/pages/FiveSegmentPage.test.ts`

**Acceptance Criteria:**
- [ ] Every copy the inventory lists for these files is replaced by its helper, or the report names it with the reason
      it stays.
- [ ] Every bare wait of five digits or more in these files (inventory D4) is `NEAREST_SEARCH_WAIT_MS` or carries a
      comment saying what it waits for.
- [ ] `FiveSegmentPage.test.ts` holds, as characterizations driven on the self-test page (`bootToSelfTest`): the right
      scan with the right cursor on acting as the right inner knob (a field of `SelfTestRightPage` changes as with
      `inner('R', 1)`), the right scan with the cursor off doing what `rPage.scanRight()` does there, and the ENT order
      (a half page waiting for confirmation is served first; otherwise left, then right). Each fails under a break of
      the branch it holds (`FiveSegmentPage.tsx:141-152`, `handleEnter`).
- [ ] Moved tests re-proven per the Global Constraints; `npm test`, `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/render/pages/FiveSegmentPage.test.ts test/render/pages/AiracPage.test.ts` → PASS; then
`npm test` and `npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1:** Reset the worktree to `tests-session-10b-audit` (Global Constraints). Read `docs/testing.md` section
  4 (the helpers of task 0), the design, and the inventory sections of every id listed above.
- [ ] **Step 2: H1.** Replace each local panel.xml string or builder with `panelXml({...})` and the presets of
  `test/harness/panelXml.ts`, for example `const OBS_SOURCE_OFF = '<PlaneHTMLConfig>…<ObsSource>0</ObsSource>…'`
  becomes `panelXml(NO_OBS)`, and `panelXml(VFR_ONLY_PART, OBS_SWITCH_PART)` becomes
  `panelXml({...VFR_ONLY, ...LEG_OBS_SWITCH})`. A value equal to the parser default stays written out (it documents the
  test's premise). Re-prove each test whose panel.xml changed.
- [ ] **Step 3: the other helpers.** H5: `inverseText(row)` → `Screen.read().inverse(row)`, `pageRows()` →
  `Screen.read().pageRows()`; `approveSelfTestPage` and `expectVfrPage` stay local (two lines). H7: the four-step D->
  sequence → `unit.panel.directTo(ident, {waitMs})` with the wait the test had (a comment where it is not 1000). H9: a
  boot that stores `[kaaa, abc, kbbb]` and settles → `bootOnStandardRoute({...})` with the test's position and options;
  a test that asserted ABC active keeps or drops that line (the helper now throws). H10: `getActiveWpt()…ident` reads →
  `activeIdent(unit)` (mind `!` versus `?.`: an inline `!` that would throw on no active waypoint becomes an
  `expect(activeIdent(unit)).toBe(...)`). H6: `fplIdents(unit, idx)`. H4: `messages(unit)`. H11s: `unit.panel.show(side,
  page, {waitMs})`. H13a: `NEAREST_SEARCH_WAIT_MS`. H13e: `unit.overlay()`.
- [ ] **Step 4: FiveSegmentPage.** Read `kln90b/pages/FiveSegmentPage.tsx` and `kln90b/pages/right/SelfTestRightPage.tsx`
  (which fields, what the scan does with the cursor off there). Write the three characterizations; the describe says
  "characterization" and cites no manual page (the code comment names the KLN 89 trainer, but no observation is
  recorded). Proofs: delete the fall-through (`return false;` after the `if` of `EVT_R_SCAN_RIGHT`) → the cursor-on scan
  test fails; swap the left and right branches in `handleEnter` → the ENT order test fails.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit`; commit; write `.task-report.md`.

```json:metadata
{"files": ["test/render/pages/AiracPage.test.ts", "test/render/pages/CursorController.test.ts", "test/render/pages/MainPage.test.ts", "test/render/pages/Nav2Page.test.ts", "test/render/pages/ObsWarningPage.test.ts", "test/render/pages/PageManager.test.ts", "test/render/pages/PageTreeController.test.ts", "test/render/pages/VFROnlyPage.test.ts", "test/render/pages/WelcomePage.test.ts", "test/render/pages/left/AltPage.test.ts", "test/render/pages/left/Cal3Page.test.ts", "test/render/pages/left/DirectToObs.test.ts", "test/render/pages/left/DirectToPage.test.ts", "test/render/pages/left/DuplicateWaypointPage.test.ts", "test/render/pages/left/FplPage.test.ts", "test/render/pages/left/Mod1Page.test.ts", "test/render/pages/left/Mod2Page.test.ts", "test/render/pages/left/Nav1Page.test.ts", "test/render/pages/left/Nav3Esa.test.ts", "test/render/pages/left/Nav3Page.test.ts", "test/render/pages/left/Nav4Page.test.ts", "test/render/pages/left/Nav4Vnav.test.ts", "test/render/pages/left/Nav5Page.test.ts", "test/render/pages/FiveSegmentPage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every inventory copy in these files moved or named with a reason", "every bare long wait is the constant or commented", "FiveSegmentPage characterizations for scan with cursor on/off and ENT order, each proven", "moved tests re-proven; suite and tsc clean"], "modelTier": "standard"}
```

---

### Task 2: Pages, left O to Z; the #96 pin

**Goal:** the files below use the harness helpers and carry no straggler or debt item of the findings, and #96 is pinned
by a handler count.

**Files:**
- Modify: `test/render/pages/left/Oth10Page.test.ts` (H1), `Oth2Page.test.ts` (D4), `Oth3Page.test.ts` (H7, H10, S4:
  `cursorTo` at 148, 168, 184, 198; #96 pin), `Oth4Page.test.ts` (S4: `cursorTo` at 97, 114; #96 pin), `Oth5Page.test.ts`
  to `Oth9Page.test.ts` (H1: the three `fuelXml` meanings become `fuelComputer({...})` calls), `SelfTestLeftPage.test.ts`
  (H1), `Set0Page.test.ts` (H5?: its `rows()` trims the end only; move only if `pageRows()` keeps every assertion),
  `Set1Page.test.ts` (H4, H13c: `confirmSet1AndReselect`, S4: `cursorTo` at 128, 338), `Set2Page.test.ts` (H4, H13f/D3:
  the #111 pin's steps become `enterDate('L', 1, 1, [2, 7])`; S4: `cursorTo` at 240), `Set5Page.test.ts` (H1),
  `Set9Page.test.ts` (H1, `ALTITUDE_ALERT(b)`), `Sta1Page.test.ts` (S4: `bootToSelfTest` and `approveSelfTest`),
  `Sta4Page.test.ts` (D4), `Sta5Page.test.ts` (H9), `SuperNav.test.ts` (H13e, S4: `selectPage` to the page before and the
  last click with `panel.inner`), `SuperNav1Page.test.ts` (H5?: its local `pageRows` reads untrimmed rows, rename it if
  it stays; H7: `directToKddd` → `directTo('KDDD')`; H10, H13e), `SuperNav5Page.test.ts` (D4, H1, H7, H8:
  `showSuperNav5`, H9, H10, H13a, H13e), `Tri5Page.test.ts` (H9 at line 31 only; the `meridianRoute()` sites are not the
  standard route), `Tri6Page.test.ts` (H9)

**Acceptance Criteria:**
- [ ] Every copy the inventory lists for these files is replaced by its helper, or the report names it with the reason.
- [ ] Every bare long wait in these files is `NEAREST_SEARCH_WAIT_MS` or commented.
- [ ] #96: in `Oth3Page.test.ts` and `Oth4Page.test.ts`, a passing sibling asserts that
      `unit.props.bus.getTopicSubscriberCount(KLNFacilityRepository.SYNC_TOPIC)` rises by one while the page shows, and
      an `it.fails('… (#96)')` asserts that after leaving the page and showing it and leaving it twice more the count
      equals the count before the first visit. Proven by a temporary fix (an unsubscribe in the page's `destroy`) that
      turns the pin green and leaves the full suite otherwise unchanged.
- [ ] The #111 pin and its sibling in `PersistentMessages.test.ts` (task 5) both use `enterDate`; the pin still fails
      and its re-proof is recorded.
- [ ] `npm test`, `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/render/pages/left/Oth3Page.test.ts test/render/pages/left/Oth4Page.test.ts` → the #96
pins reported as expected failures, the siblings pass; then `npm test`, `npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1:** Reset the worktree; read `testing.md` section 4, the design and the inventory sections of the ids above.
- [ ] **Step 2:** Move the files onto the helpers as in the Global Constraints (H1 presets; `fuelComputer({unit: 'LB'})`
  for Oth7, `fuelComputer({fuelUsed: b})` for Oth8, `fuelComputer({fob: false})` plus raw keys for Oth5; re-prove each
  test whose panel.xml changed).
- [ ] **Step 3: #96.** The subject: `Oth3Page.tsx:36` subscribes to `KLNFacilityRepository.SYNC_TOPIC` in its
  constructor and never unsubscribes; pages are recreated on every knob step, so each visit leaves a handler. Source:
  the project's page lifecycle (`CLAUDE.md`, UI: pages are recreated on every knob step) — no manual page. The sibling
  holds that the count is observable:

```ts
const syncHandlers = (unit: HeadlessUnit) => unit.props.bus.getTopicSubscriberCount(KLNFacilityRepository.SYNC_TOPIC);

// Pages are recreated on every knob step (CLAUDE.md), so OTH 3 subscribes to the repository sync each time it shows.
// The sibling of the #96 pin below: the count rises while the page shows, so the pin's count is observable
it('subscribes to the repository sync while it shows (#96)', async () => {
    const unit = await bootUnit();
    const before = syncHandlers(unit);
    await unit.panel.selectPage('L', 'OTH 3');
    expect(syncHandlers(unit)).toBe(before + 1);
});

it.fails('leaves no repository sync handler behind once it is left (#96)', async () => {
    const unit = await bootUnit();
    await unit.panel.selectPage('L', 'NAV 1');
    const before = syncHandlers(unit);
    for (let i = 0; i < 3; i++) {
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.selectPage('L', 'NAV 1');
    }
    expect(syncHandlers(unit)).toBe(before);
});
```

  `selectPage` passes intermediate pages; if the count before already includes a handler from a page passed on the way,
  choose a start page and route that do not pass OTH 3 or OTH 4 and say so in a comment. Check the sibling's `+ 1`
  literally (it is a characterization of the subscription count, so the title must not claim a manual source). The
  same pair for OTH 4. Prove: temporarily store the subscription and call `.destroy()` on it in the page's `destroy()`
  → the pin passes; run the full suite with the fix; restore.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`; commit; write `.task-report.md`.

```json:metadata
{"files": ["test/render/pages/left/Oth10Page.test.ts", "test/render/pages/left/Oth2Page.test.ts", "test/render/pages/left/Oth3Page.test.ts", "test/render/pages/left/Oth4Page.test.ts", "test/render/pages/left/Oth5Page.test.ts", "test/render/pages/left/Oth6Page.test.ts", "test/render/pages/left/Oth7Page.test.ts", "test/render/pages/left/Oth8Page.test.ts", "test/render/pages/left/Oth9Page.test.ts", "test/render/pages/left/SelfTestLeftPage.test.ts", "test/render/pages/left/Set0Page.test.ts", "test/render/pages/left/Set1Page.test.ts", "test/render/pages/left/Set2Page.test.ts", "test/render/pages/left/Set5Page.test.ts", "test/render/pages/left/Set9Page.test.ts", "test/render/pages/left/Sta1Page.test.ts", "test/render/pages/left/Sta4Page.test.ts", "test/render/pages/left/Sta5Page.test.ts", "test/render/pages/left/SuperNav.test.ts", "test/render/pages/left/SuperNav1Page.test.ts", "test/render/pages/left/SuperNav5Page.test.ts", "test/render/pages/left/Tri5Page.test.ts", "test/render/pages/left/Tri6Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every inventory copy moved or named with a reason", "bare long waits are the constant or commented", "#96 pins with passing siblings on OTH 3 and OTH 4, proven by a temporary fix", "#111 pin uses enterDate and still fails", "suite and tsc clean"], "modelTier": "standard"}
```

---

### Task 3: Pages, right; the APT 3 string table and Apt3ListPageContainer

**Goal:** the right page tests use the harness helpers, and the APT 3 strings and the APT 3 container have tests.

**Files:**
- Modify: `test/render/pages/right/ActPage.test.ts` (H6, H7), `Apt1Page.test.ts` (D4, H11s, H13a), `Apt2Page.test.ts`
  (H11s), `Apt7Page.test.ts` (H6; S4: the missed-approach world stays, reported), `Apt8Page.test.ts` (H4, H6; S4 as
  Apt7), `Ctr1Page.test.ts` (H3 with `FacilityType.USR`, H6), `Dt1Page.test.ts` to `Dt4Page.test.ts` (H7, H11:
  `bootOnDtWorld`, `show`; Dt3's `directToOutsidePlan` stores FPL 0 only today — keep that with `fpl3: false` or
  re-prove the change; Dt4 D4, D5: a comment on the 30 s timeouts), `IntPage.test.ts` (H3 unfiltered, H11s, S4:
  `cursorTo` at 576 only if the target text is unique), `NdbPage.test.ts` (H3, H13a), `RefNaming.test.ts` (H3 with
  `FacilityType.USR`), `RefPage.test.ts` (H6), `SelfTestRightPage.test.ts` (D4, H1, H13f?), `SupPage.test.ts` (H10,
  H13b?, S4: `cursorTo` at 284 only if unique), `VorPage.test.ts` (H13a, S4: `blinkCycle` at 88 and 222),
  `VorUserWaypoint.test.ts` (H3, H7?, H10), `WaypointConfirmPage.test.ts` (H7?), `WaypointPage.test.ts` (D4, H13a)
- Create: `test/unit/pages/right/Apt3ListPage.test.ts`; Apt3ListPageContainer tests in
  `test/render/pages/right/Apt3Page.test.ts` or `Apt3UserPage.test.ts` (append to whichever already boots APT 3 on the
  matching facility) or a new `test/render/pages/right/Apt3ListPageContainer.test.ts`

**Acceptance Criteria:**
- [ ] Every copy the inventory lists for these files is replaced by its helper, or the report names it with the reason.
- [ ] Every bare long wait in these files is `NEAREST_SEARCH_WAIT_MS` or commented.
- [ ] `Apt3ListPage.test.ts` is a unit table over every `RunwaySurfaceType` and `RunwayLightingType` value except
      `Macadam` (#270): spec rows citing 3-44 for the materials 3-44 names (hard surface for concrete, asphalt, tarmac,
      brick and bituminous; turf, gravel, sand, dirt, ice, steel mats, shale, snow; L, LPC, LPT, blank for no lighting),
      characterization rows (in their own describe, no page number) for the SDK types 3-44 does not name. It fails when
      one mapping of the switch is changed.
- [ ] `Apt3ListPageContainer`: tests through APT 3 scans that the page shows the runway list of a database airport and
      then of a user airport (and back), per `changeFacility` and `getCurrentPage`; spec where 3-44 or 5-16 gives the
      rule, characterization otherwise; each fails under a break of the branch it holds.
- [ ] `npm test`, `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/unit/pages/right/Apt3ListPage.test.ts` → PASS; then `npm test` and `npx tsc --noEmit`
clean.

**Steps:**

- [ ] **Step 1:** Reset the worktree; read `testing.md` section 4, the design and the inventory sections.
- [ ] **Step 2:** Move the files onto the helpers (Global Constraints). The D/T files: `bootOnWorld(legs, facilities,
  moving, extra)` → `bootOnDtWorld({legs, facilities, moving, ...extra})`; `show(unit, left)` → `await
  unit.panel.selectPage('L', left); return unit.panel.show('R', 'D/T n')`; keep a two-line local `show` if it reads
  better, as long as it calls the helper.
- [ ] **Step 3: the APT 3 table.** The functions are `getKLNSurfaceString(runway)` and `getKLNLightingString(runway)` in
  `kln90b/pages/right/Apt3ListPage.tsx:140-184`; they read only `runway.surface` and `runway.lighting`, so a partial
  object cast to `AirportRunway` is enough. Spec rows, derived from 3-44 (the expected strings are the codes the guide
  lists; the lighting strings are padded to three cells by the code, which the page's column needs — assert `'L  '`):

```ts
import {describe, expect, it} from 'vitest';
import {AirportRunway, RunwayLightingType, RunwaySurfaceType} from '@microsoft/msfs-sdk';
import {getKLNLightingString, getKLNSurfaceString} from '../../../../kln90b/pages/right/Apt3ListPage';

const rwy = (o: Partial<AirportRunway>) => o as AirportRunway;

// 3-44: APT 3 shows a three-letter surface code per runway; hard surface covers asphalt, concrete, tarmac, brick and
// bitumen, and the guide lists turf, gravel, sand, dirt, ice, steel matting, shale and snow
describe('getKLNSurfaceString (3-44)', () => {
    it.each([
        [RunwaySurfaceType.Concrete, 'HRD'], [RunwaySurfaceType.Asphalt, 'HRD'], [RunwaySurfaceType.Tarmac, 'HRD'],
        [RunwaySurfaceType.Brick, 'HRD'], [RunwaySurfaceType.Bituminous, 'HRD'],
        [RunwaySurfaceType.Gravel, 'GRV'], [RunwaySurfaceType.Sand, 'SND'], [RunwaySurfaceType.Dirt, 'DRT'],
        [RunwaySurfaceType.Ice, 'ICE'], [RunwaySurfaceType.SteelMats, 'MAT'], [RunwaySurfaceType.Shale, 'SHL'],
        [RunwaySurfaceType.Snow, 'SNW'],
    ])('shows surface %s as %s (3-44)', (surface, code) => {
        expect(getKLNSurfaceString(rwy({surface}))).toBe(code);
    });
});
```

  Decide from 3-44 whether the grass types and hard turf as `TRF` are spec (the guide says turf) or characterization,
  and say why in the comment. Every other SDK value except `Macadam` goes in a `describe('getKLNSurfaceString,
  characterization of the SDK types 3-44 does not name', …)` asserting `''`. The lighting table: `FullTime` `'L  '`,
  `Frequency` `'LPC'`, `PartTime` `'LPT'`, `None` `'   '` as spec (3-44: blank for no lighting); `Unknown` `'   '` as
  characterization. Proof: map `Brick` to `''` → fails; swap `LPC` and `LPT` → fails.
- [ ] **Step 4: Apt3ListPageContainer.** Read `kln90b/pages/right/Apt3ListPageContainer.tsx` (`changeFacility`,
  `getCurrentPage`) and how APT 3 switches between the database airport's list and a user airport's (one runway, 5-16).
  Boot with one database airport with runways (`airport()` options or the spreads APT 3 tests use) and one user airport
  (`savedUserWaypoints` with a runway, see `Apt3UserPage.test.ts`), scan between them on APT 3 and assert the runway
  rows each shows. Prove each by breaking the branch (for example `changeFacility` keeping the old page).
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit`; commit; write `.task-report.md`.

```json:metadata
{"files": ["test/render/pages/right/ActPage.test.ts", "test/render/pages/right/Apt1Page.test.ts", "test/render/pages/right/Apt2Page.test.ts", "test/render/pages/right/Apt7Page.test.ts", "test/render/pages/right/Apt8Page.test.ts", "test/render/pages/right/Ctr1Page.test.ts", "test/render/pages/right/Dt1Page.test.ts", "test/render/pages/right/Dt2Page.test.ts", "test/render/pages/right/Dt3Page.test.ts", "test/render/pages/right/Dt4Page.test.ts", "test/render/pages/right/IntPage.test.ts", "test/render/pages/right/NdbPage.test.ts", "test/render/pages/right/RefNaming.test.ts", "test/render/pages/right/RefPage.test.ts", "test/render/pages/right/SelfTestRightPage.test.ts", "test/render/pages/right/SupPage.test.ts", "test/render/pages/right/VorPage.test.ts", "test/render/pages/right/VorUserWaypoint.test.ts", "test/render/pages/right/WaypointConfirmPage.test.ts", "test/render/pages/right/WaypointPage.test.ts", "test/unit/pages/right/Apt3ListPage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every inventory copy moved or named with a reason", "bare long waits are the constant or commented", "APT 3 string table: spec rows on 3-44, characterization rows otherwise, Macadam left out, proven", "Apt3ListPageContainer tests through APT 3 scans, proven", "suite and tsc clean"], "modelTier": "standard"}
```

---

### Task 4: Controls

**Goal:** the control tests use the harness helpers and carry no straggler or debt item of the findings.

**Files:**
- Modify: `test/render/controls/AirportCoordOrNearestView.test.ts` (H11s), `ErrorPage.test.ts` (H13b?),
  `FlightplanList.test.ts` (H6, H7 with `waitMs: 0`), `MessagePage.test.ts` (D4, H2: `readMessages`, which adds the
  close check its `readAll` lacked; H4?, H13a), `PageContainer.test.ts` (H6, H8, H13e), `StatusLine.test.ts` (D4, H1, H2:
  `readBootMessages` and the inline loops at 62-69 and 206-212 — the one at 206 must allow the persistent ADJ message to
  stay, so keep its own end check; H4?, H9), `SuperNav5Left.test.ts` (D4, H1, H2?, H8, H9, H13e), `SuperNav5Right.test.ts`
  (H8, H9, H13e), `WaypointDeleteListItem.test.ts` (H3 unfiltered)
- Modify: `test/render/controls/displays/` `AltitudeDisplay`, `BearingDisplay`, `DistanceDisplay`, `DurationDisplay`,
  `FuelDisplay`, `LatitudeDisplay`, `LongitudeDisplay`, `RoundedDistanceDisplay`, `SpeedDisplay`, `TemperatureDisplay`,
  `TimeDisplay` `.test.ts` (H12: `mountedText`), `ActiveArrow`, `DeviationBar`, `FlightplanArrow`, `SuperDeviationBar`
  `.test.ts` (H12?: `mountedRead`; `ActiveArrow.test.ts:85` D6: a comment naming the method it replaces on the state
  object and why), `NullDashes.test.ts` (S4: `mount` instead of `FSComponent.render` by hand)
- Modify: `test/render/controls/editors/` `BearingEditor`, `SpeedEditor` (H13c: `confirmSet1AndReselect`),
  `DateEditor` (H13f?: `enterDate`), `DistanceEditor`, `NdbFreqEditor`, `RadialEditor`, `VorFreqEditor` (H3?: single
  lookups; move only if `userWaypoints(unit).find(...)` reads as well), `FreetextEditor` (S4: `panel.powerOn()` instead
  of the raw `KLN90B_Power_On`), `LatLonEditor` (H13c at 304-307, S4: `mount` instead of the hand-rendered `text()`),
  `WaypointEditor` (H6, H7, H10, S4: `blinkCycle` at 23-27) `.test.ts`
- Modify: `test/render/controls/selects/` `FuelFieldset` (H1), `MapOrientationSelector` (H9), `NearestSelector` (D5:
  the 20 s timeout keeps its comment; H13a), `ObsDtkElement` (H1), `SuperNav5DirectToSelector` (H6, H8, H9),
  `SuperNav5Field1Selector`, `SuperNav5Field2Selector`, `SuperNav5Field3Selector` (H8: the local `superNav5OnLeg` and
  `superNav5OnArc` are deleted and imported from `test/harness/render/superNav5.ts`), `SuperNav5RangeSelector` (H8)
  `.test.ts`

**Acceptance Criteria:**
- [ ] Every copy the inventory lists for these files is replaced by its helper, or the report names it with the reason.
- [ ] Every bare long wait in these files is `NEAREST_SEARCH_WAIT_MS` or commented.
- [ ] The tests that now call `showSuperNav5` (which asserts the overlay) still pass; a test that turns red is reported.
- [ ] `npm test`, `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/render/controls` → PASS (pins as expected failures); then `npm test` and
`npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1:** Reset the worktree; read `testing.md` section 4, the design and the inventory sections.
- [ ] **Step 2:** Move the files onto the helpers (Global Constraints). H12 example: `const shown = (lat: number) => {
  const m = mount(new LatitudeDisplay(lat)); m.tick(); return m.text(); }` becomes `const shown = (lat: number) =>
  mountedText(new LatitudeDisplay(lat));`. H2: re-prove `MessagePage.test.ts`'s tests that used `readAll` (the move adds
  the close check, which can surface a test that never closed the page).
- [ ] **Step 3:** `npm test`, `npx tsc --noEmit`; commit; write `.task-report.md`.

```json:metadata
{"files": ["test/render/controls/AirportCoordOrNearestView.test.ts", "test/render/controls/ErrorPage.test.ts", "test/render/controls/FlightplanList.test.ts", "test/render/controls/MessagePage.test.ts", "test/render/controls/PageContainer.test.ts", "test/render/controls/StatusLine.test.ts", "test/render/controls/SuperNav5Left.test.ts", "test/render/controls/SuperNav5Right.test.ts", "test/render/controls/WaypointDeleteListItem.test.ts", "test/render/controls/displays/", "test/render/controls/editors/", "test/render/controls/selects/"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every inventory copy moved or named with a reason", "bare long waits are the constant or commented", "showSuperNav5 users still pass or are reported", "suite and tsc clean"], "modelTier": "standard"}
```

---

### Task 5: Render top level, data and services; the #95 pin and D2

**Goal:** these files use the harness helpers and carry no straggler or debt item of the findings; #95 is pinned and
D2 settled.

**Files:**
- Modify: `test/render/BrightnessManager.test.ts` (D4), `GpsAcquisition.test.ts` (D4, D5 keeps `SLOW`, H4, S4:
  `bootToSelfTest` for the cold-and-dark boots at 229-231, 30-35, 337-340, 349-350 where the test does not measure the
  Turn-On time itself), `HEvents.test.ts` (D4, H9, H10, S4: `Screen.read().status().mode` instead of the row 6 slice at
  427), `KLN90BCore.init.test.ts` (D4; D6: a comment at 63 naming the private `tickManager` coupling),
  `KLN90BCore.startup.test.ts` (H13b), `KLN90BCore.userDataConversion.test.ts` (H6), `PowerButton.test.ts` (H1),
  `SensorsOut.test.ts` (D4, H1, H9, H10; D7: a comment at about 363 saying why GPS COURSE TO STEER is only checked
  finite, if the existing comment does not), `SensorsOutSimVars.test.ts` (H1, H9 — its `bootOnRoute` does not settle
  today: re-prove if the move adds the settle, or keep it), `SimVarSync.test.ts` (D4, H1, H9, H10, H13d: `sim.writeCount`)
- Modify: `test/render/data/Messages.test.ts` (H1, H2, H4), `PersistentMessages.test.ts` (H1, H4, H13f/D3:
  `outOfDateBySet2` uses `enterDate('L', 1, 1, [2, 7])`), `VolatileMemory.test.ts` (D4, D5 keeps its comment, H6, H9),
  `flightplan/ActiveWaypoint.test.ts` (H1, H6, H7, H9, H10; S4: the VOR 36 world stays, reported; **D2**),
  `flightplan/DuplicateWaypoints.test.ts` (H7?, H10), `flightplan/FlightplanEdit.test.ts` (H4?, H6, H9, H10),
  `navdata/AirspaceAlert.test.ts` (D4, H1, H2?, H4, H13a, S4: `pointFrom` for the `moveAircraft` targets at 168 and 179),
  `navdata/KLNMagvar.test.ts` (H1, H4, H10, H11s), `navdata/NavCalculator.test.ts` (D4, H4?, H6, H7, H9, H10),
  `navdata/NearestList.test.ts` (D4, H8, H13a, H13e, S4: `recordMap` instead of the `drawLabel` spies at 79-83 and
  317-321; **#95 pin**), `navdata/NearestUtils.test.ts` (H11s)
- Modify: `test/render/services/KeyboardService.test.ts` (H3?: its region filter is a third meaning; keep with a
  comment if it does not fit), `KlnEfbLoader.test.ts` (H1, H3 with `FacilityType.USR`, H4, H6, H13d),
  `KlnEfbSaver.test.ts` (H1, H6, H9, H13b), `ModeController.test.ts` (H6, H9, H10), `ModeControllerApproach.test.ts`
  (H6, H7, H10, S4: `status().mode` at 262), `ModeControllerObs.test.ts` (H1, H4?, H6, H7?, H9, H10),
  `RollSteeringController.test.ts` (H1, H9, H10), `TemporaryWaypointDeleter.test.ts` (H3 with `FacilityType.USR`, H6,
  H7?, H10), `VnavObs.test.ts` (H10), `WTFlightplanSync.test.ts` (H1, H6, H9 with `magvar: 4` and the extra facility,
  H10, S4: the VOR 36 world stays, reported)

**Acceptance Criteria:**
- [ ] Every copy the inventory lists for these files is replaced by its helper, or the report names it with the reason.
- [ ] Every bare long wait in these files is `NEAREST_SEARCH_WAIT_MS` or commented.
- [ ] D2: `ActiveWaypoint.test.ts:155` asserts the deviation as 0 within a stated tolerance (and fails when the
      aircraft is moved off the course), or its title no longer claims a zero deviation.
- [ ] #95: in `NearestList.test.ts`, a passing sibling shows that the nearest list updates with a working search after
      a boot with the failing client's setup minus the failure; the `it.fails('… (#95)')` boots with a
      `MemoryFacilityClient` whose nearest search rejects once (built through `platform` as
      `test/render/harness/bootFailure.test.ts` builds a failing client), takes the rejection with
      `unit.takeRejections()`, moves a facility into range, waits two searches and asserts the list shows it. Proven by
      a temporary fix (a try/finally resetting `isCalculating` in `NearestList.tick`) with the full suite run.
- [ ] `npm test`, `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/render/data/navdata/NearestList.test.ts test/render/data/flightplan/ActiveWaypoint.test.ts`
→ PASS with the #95 pin as an expected failure; then `npm test`, `npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1:** Reset the worktree; read `testing.md` section 4, the design and the inventory sections.
- [ ] **Step 2:** Move the files onto the helpers (Global Constraints).
- [ ] **Step 3: D2.** Read the test at `ActiveWaypoint.test.ts:155`. If the setup puts the aircraft on the course, assert
  `expect(Math.abs(nav.xtkToActive)).toBeLessThan(0.01)` (state the tolerance's reason: the aircraft stands on the leg,
  so only rounding remains) and prove it by moving the aircraft 0.5 NM off the course; otherwise rename the title to
  what it holds.
- [ ] **Step 4: #95.** The subject: `NearestList.tick` (`kln90b/data/navdata/NearestList.ts:61`, `:81`, `:109`) is async,
  `TickController.tickCalc` does not await it, and a rejected `searchNearest` or `getFacility` leaves `isCalculating`
  true, so the list never updates again. Source: `docs/architecture.md` (Core: a calculation that throws is caught and
  the others go on) and the unit's nearest lists updating continuously (3-22). Build the client like
  `bootFailure.test.ts:62` does, with a counter so only the first search rejects. Before writing the pin, check whether
  a rejected search reaches the error page or only the rejection collector, and assert accordingly in the sibling, not
  the pin.
- [ ] **Step 5:** `npm test`, `npx tsc --noEmit`; commit; write `.task-report.md`.

```json:metadata
{"files": ["test/render/BrightnessManager.test.ts", "test/render/GpsAcquisition.test.ts", "test/render/HEvents.test.ts", "test/render/KLN90BCore.init.test.ts", "test/render/KLN90BCore.startup.test.ts", "test/render/KLN90BCore.userDataConversion.test.ts", "test/render/PowerButton.test.ts", "test/render/SensorsOut.test.ts", "test/render/SensorsOutSimVars.test.ts", "test/render/SimVarSync.test.ts", "test/render/data/", "test/render/services/"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every inventory copy moved or named with a reason", "bare long waits are the constant or commented", "D2 asserts the zero deviation within a tolerance or the title changes", "#95 pin with passing sibling, proven by a temporary fix", "suite and tsc clean"], "modelTier": "standard"}
```

---

### Task 6: Unit, flight and the existing harness tests; the #93 pin, D1, D6, D7

**Goal:** these files use the harness helpers; #93 is pinned; the #103 pin is sound; the couplings are named; the small
debt items are fixed.

**Files:**
- Modify: `test/unit/data/flightplan/ActiveWaypoint.test.ts`, `test/unit/data/flightplan/Flightplan.test.ts`,
  `test/unit/data/navdata/SidStar.test.ts`, `test/unit/services/FlightplanUtils.test.ts`,
  `test/unit/services/Flightplanloader.test.ts`, `test/unit/settings/UserFlightplanLoaderV1.test.ts`,
  `test/unit/settings/UserFlightplanLoaderV2.test.ts`, `test/unit/settings/UserFlightplanPersistor.test.ts` (H6u:
  `identsOf(legs)`; the (ident, type) pair forms stay), `test/unit/data/navdata/Database.test.ts` (H4?: a bare
  `MessageHandler`, keep), `test/unit/harness/navdata.test.ts` (S4: not the route world — keep, reported)
- Modify: `test/unit/settings/UserWaypointPersistor.test.ts` (**D1**), `test/unit/settings/UserWaypointV2.test.ts`
  (D7: line 100 asserts the restored ident, or its title says it is the setup sibling of the #98 pin),
  `test/unit/Hardware.test.ts` (D7: `sim.reset()` before the write at line 7, as its sibling at 22), D6 comments in
  `test/unit/services/Vnav.test.ts:268`, `test/unit/settings/RemarksManager.test.ts:141`,
  `test/unit/data/navdata/Scanlist.test.ts:12` (the misspelled private `listManangerJob`)
- Create: `test/unit/Sensors.test.ts` (#93)
- Modify: `test/flight/flights/dmeArc.test.ts` (H6), `duplicateWaypoint.test.ts`, `largeTurn.test.ts`,
  `waypointAlertTurn.test.ts` (H10: `turnStackLength` is for render units; a flight reads through its `Flight`, so
  keep the flight's own read unless it fits), `hsiToFromFlags.test.ts`, `turnDirection.test.ts` (H9: flights use
  `Flight`, not `bootUnit`; keep and report unless `standardRoute()` replaces typed coordinates),
  `test/flight/harness/boot.test.ts` (D4), `frontPanel.test.ts` (H6, S4: `standardRoute()`), `jump.test.ts` (H9, S4:
  `standardRoute()` and `pointFrom` instead of `GeoPoint.offset`), `monitor-finite.test.ts` (H1)
- Modify: `test/render/harness/` `airspaces`, `defaultNavdata` (D4, H13a), `approachWorld` (D4, H6, H10), `bootFailure`
  (H13b: `muteConsoleError` from `test/harness/console.ts`; D6: a comment at 62 naming the `KLNFacilityRepository.INSTANCE`
  coupling), `efb`, `insertLeg`, `procedures` (H6; procedures' filtered `idents` stays), `enterIdent` (D4, H9),
  `mapRecorder` (H8, H9), `pageTree`, `selfTestBoot`, `simVars`, `sounds` (H1), `power` (H1, H9?, S4: `standardRoute()`),
  `reboot` (H3, H6, S4: `savedUserWaypoints` instead of the hand-written `wpt0`), `screen` (H2), `superNav5` (H8, H13e),
  `timezone` (H11s) `.test.ts`

**Acceptance Criteria:**
- [ ] Every copy the inventory lists for these files is replaced by its helper, or the report names it with the reason.
- [ ] D1: the #103 pin's heavy setup has a passing sibling with the same setup that asserts what works today; the
      describe clears `FakeStorage` before it writes (`simEnv().storage.reset()` or the file's pattern); the
      `SetStoredData` spy is restored (`onTestFinished` or `afterEach`). The pin still fails; the sibling fails under a
      broken setup (proof).
- [ ] #93: `test/unit/Sensors.test.ts` builds `FuelComputer` with parsed settings (`panelXml(fuelComputer({unit,
      type}))` through `KLN90BPlaneSettingsParser`, `NUMBER OF ENGINES` 1 and `FUEL TOTAL QUANTITY WEIGHT EX1` set on
      the fake sim before construction), ticks, and reads `fob`. Passing sibling: with `L` and `GAL` of the same type
      the litres are the gallons times 3.785411784 (a US gallon in litres). Pin `it.fails('… (#93)')`: with `IMP` the
      FOB times 1.20095042 (an imperial gallon in US gallons) equals the `GAL` FOB of the same type, for JetA1 and for
      JetB (two pins or one `it.fails.each`, each case failing today; check). Source: the panel.xml contract
      (`Input.FuelComputer.Type` selects the fuel's weight per volume). Proven by a temporary fix (remove the overwrite
      at `Sensors.ts:91`).
- [ ] D6 and D7 items done as listed; `npm test`, `npx tsc --noEmit` clean.

**Verify:** `npx vitest run test/unit/Sensors.test.ts test/unit/settings/UserWaypointPersistor.test.ts` → PASS with the
pins as expected failures; then `npm test`, `npx tsc --noEmit` clean.

**Steps:**

- [ ] **Step 1:** Reset the worktree; read `testing.md` section 4, the design and the inventory sections.
- [ ] **Step 2:** Move the files onto the helpers (Global Constraints).
- [ ] **Step 3: D1.** Read `test/unit/settings/UserWaypointPersistor.test.ts:19`. Split the pin: the setup (save manager
  with load and autosave, repository, persistor) moves into a local function used by both the pin and a new passing
  sibling that asserts the part that works today (read the #103 issue body with the GitHub tools to see which part
  does). Reset the storage at the start of the describe, restore the spy.
- [ ] **Step 4: #93.** Read `kln90b/Sensors.ts:36-140`. Write the sibling and the pin as above. The conversion
  constants are independent of the code (the definitions of the US gallon, the litre and the imperial gallon), so the
  test does not use the SDK's fuel units for its expectation.
- [ ] **Step 5: D6, D7.** One comment per coupling, in the form "Reaches the private <member> of <class>: <why no public
  seam>; a rename there breaks this test". `Hardware.test.ts`: `simEnv().sim.reset()` (or the file's accessor) before
  line 7. `UserWaypointV2.test.ts:100`: assert the restored ident if the loader returns it, else retitle.
- [ ] **Step 6:** `npm test`, `npx tsc --noEmit`; commit; write `.task-report.md`.

```json:metadata
{"files": ["test/unit/", "test/flight/", "test/render/harness/", "test/unit/Sensors.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every inventory copy moved or named with a reason", "D1: #103 pin has a passing sibling, storage reset, spy restored", "#93 pin with passing sibling, proven by a temporary fix", "D6 coupling comments and D7 items done", "suite and tsc clean"], "modelTier": "standard"}
```

---

### Task 7: Issues and close-out

**Goal:** every placeholder is a filed issue, the session log and `testing.md` section 7 are written, Session 10b is
ticked and Session 11's steps cover the findings of section 6.

**Files:**
- Modify: `docs/test-coverage.md` (section 3: tick Session 10b, a result paragraph; Session 11's steps; section 4: the
  session log), `docs/testing.md` (section 7), any test file with a `#NEW-` placeholder (the replacement only)
- Modify: `docs/superpowers/specs/2026-10-10-session-10b-audit-design.md` (only if bugs were filed: an issue table)

**Acceptance Criteria:**
- [ ] Every `#NEW-<task>-<n>` is searched on GitHub (open and closed, several wordings), filed with the `bug` label per
      `CLAUDE.md` or merged into an existing issue, and replaced; `grep -rn "#NEW-" test/` finds nothing.
- [ ] `testing.md` section 7 names every copy the main tasks kept with its reason (from the reports), the
      missed-approach and VOR 36 world copies of findings section 4, and the `FourSegmentPage` ENT order; the items
      task 0 removed stay removed.
- [ ] Session 11's steps in `docs/test-coverage.md` gain, as text only: a dated trainer record in `testing.md` that
      keeps the `T<n>` ids with their session (or the comments rewritten); the session references in tests resolved by
      that record; the rules `testing.md` cites by number (rule 8, rule 13, the evidence rule) restated in its own
      words; the deletion of `docs/superpowers/` (specs, plans, `.tasks.json`, the findings and the inventory) with
      `test-coverage.md`; section 7 regrouped by area with the duplicate electricity item merged and the `Version` mock
      item naming `Sta3Page` and `Sta4Page`; step 4 exempting the harness self-test pin of `rejections.test.ts`; the two
      superseded triage rows (AIRAC last day, the #40 cache window) to confirm; the #213 claim not repeated; the
      controlling session's memory notes updated.
- [ ] The session log entry (section 4) states what was done per task, what was left and why, the start and end
      numbers of `npm test` and the coverage summary, and the items of the findings re-decided with a reason.
- [ ] `npm test`, `npx tsc --noEmit` clean.

**Verify:** `grep -rn "#NEW-" test/` → no output; `npm test` → all files pass; `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1:** Collect the main tasks' reports (`.task-report.md` of each worktree, or the controller's saved
  copies) and their suspected bugs.
- [ ] **Step 2:** File the bugs (search first; paraphrase manuals, cite pages; mark code-read findings as not reproduced
  in the sim). Issue edits and comments on existing issues are prepared as text for the controlling session to post with
  the maintainer's OK. Replace the placeholders in one commit (`references #NN, … Session 10b: replace the issue
  placeholders`).
- [ ] **Step 3:** Run `npm run coverage` and `npm test` for the log.
- [ ] **Step 4:** Write `testing.md` section 7, Session 11's steps, the result paragraph and tick of Session 10b, and the
  session log. Commit.

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "grep -rn \"#NEW-\" test/ ; npm test && npx tsc --noEmit", "acceptanceCriteria": ["no #NEW- placeholder left; bugs filed or merged", "testing.md section 7 names kept copies, world copies, FourSegmentPage ENT order", "Session 11 steps cover findings section 6", "session log written", "suite and tsc clean"], "modelTier": "standard"}
```
