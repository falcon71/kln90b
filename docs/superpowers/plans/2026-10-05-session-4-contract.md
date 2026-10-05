# Session 4 (the public contract): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Tests for the interfaces aircraft depend on (the public H events, the LVars, the panel.xml keys, the GPS
SimVars with the `"kln90b"` planner, the persisted user data), each proven to bite, pins for the contract bugs the
research found, and a default navdata fixture that keeps every test world realistic.

**Architecture:**
- **Task 1** adds the default navdata fixture to the harness. It runs alone, first.
- **Tasks 2 to 7** are six parallel batches, one per contract area. Each runs in its own git worktree reset to the
  session branch after task 1 is merged, and ends in one commit (plus one per fix round).
- **Task 8** files the issues, replaces the placeholders, corrects the comments and writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk`, the headless
harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-05-session-4-contract-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task.
- **Branches.** The session branch is `tests-session-4-contract`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`. Before anything else run
  `git reset --hard tests-session-4-contract` on the (still empty) worktree branch and check `git log -1`: it must show
  the session branch's head (task 1's merge for tasks 2 to 7). A missing `node_modules` is created as a junction to
  `E:\msfs\kln90b\node_modules` (never delete it recursively).
- **No behavior changes** in `kln90b/` (rule 12). Testability seams only, each named in its commit message. Task 8 may
  change comments only.
- **Test names** carry the issue or commit where there is one: `'… (#126)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23), numbered per task from 1.
- **Labels** (`testing.md` section 5):
    - A **contract test** cites its source in a comment: `CLAUDE.md` "Public contract with aircraft", the doc comments of
      `HEvents.ts` or `LVars.ts`, `cfg/panel.xml`, a wiki page by name (panel.xml customization, External Hardware,
      External Annunciators, Autopilot, CDI/HSI, RMI, Hot Swapping and Package Detection, Accessing the Flight Plan), or
      `docs/architecture.md` Core 7. It needs neither a manual page nor the word characterization.
    - A **spec test** cites the Pilot's Guide page (or the Installation Manual page) in a comment.
    - A **characterization test** has `characterization` in its `describe` or `it` title and no manual citation.
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `install-manual-index.md`, `maintenance-manual-index.md`). Cite page numbers, never copy manual text.
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts` or by hand, never from the code under
  test or the SDK's flavor of the same formula. Setup may use SDK geometry.
- **Send H events as literals** (`unit.panel.press('KLN90B_MSG_Push')`), never through the `EVT_` constants or the
  `FrontPanel` shortcuts, in every test of task 2 and wherever a test's subject is an event. The constants move with a
  renamed event.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure, not substrings of a whole screen.
- **Pins.** Every `it.fails` has a passing sibling that asserts its heavy preconditions. A pin is proven by fixing the
  bug temporarily (the fix is named per pin below) and seeing it turn red, then restoring.
- **Proof per test (rule 10).** Break the subject by hand (the break is named per test below; a different one is fine
  if it is a real break), run the test and see it fail, restore, check that `git diff` shows only test files. Never
  commit the broken state.
- **Commits (rule 22).** One commit per task, plus one per fix round, never amended. The message lists every test as
  `- <test>: Proof: fails when <break>` and ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, GitHub issues, other tasks' files and blocks.
- **Copyright and data.** Never commit manual text or navdata recorded from the sim. Facilities are invented.
- **Research.** The reports and drafts are in
  `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\cd60800c-659e-41b0-a93a-139d9fe9cdc4\scratchpad\`:
  `research-1-hevents.md`, `research-2-lvars.md` (drafts in `research-2-lvars-drafts\proposed.test.ts`),
  `research-3-panelxml-simvars.md`, `research-4-persistence.md` (drafts in `research-4-persistence-drafts\`),
  `research-5-default-navdata.md`. The drafts ran but are starting points, not finished tests. Do not copy the research's
  break lists into test comments.
- **Reports** go to the same scratchpad folder as `report-task-<N>.md`, written with the Bash tool
  (`cat > '<path>' <<'EOF'`); check that the file exists. The reply to the controller is only the status, the head commit
  and concerns.

**User decisions (already made):**
- Wiki and code disagreements are "ruled per case": AltitudeAlertEnabled "false is intended"; planner sync with
  WriteGPSSimVars off "Gate both (bug)"; input while disabled "Bug: ignore input"; outputs at power-off "Power-off only";
  WPT light "Steady is correct".
- Invalid panel.xml values: "Any invalid value should not load at all and produce a highly visible error message within
  the unit … Please file a new issue as an enhancement. No test for this today".
- Roll steering without heading input: "File a bug and add a comment to #100 referencing the new issue".
- ApprArm and `AppArmSwitchInstalled`: "Comment on #133".
- Doc fixes: "Only the comments. BasePath is only needed in very special cases … Do not document TakeHomeMode".
- V2 restore: a failed V2 restore should wipe corrupt data like V1 ("Yes, that looks right"): a bug, pinned.
- Default navdata fixture as a new task 1; opt-in or opt-out left to the controller (chosen: on by default,
  `defaultNavdata: false` opts out).
- "Spec approved": the eight tasks, Sonnet implementers, Opus reviewers for tasks 2, 3 and 5, Sonnet for 1, 4, 6 and 7.

---

## Facts every batch needs (from the research pass)

**Boot and settle.** `bootUnit` boots force-ready. `await settle(unit)` waits for the GPS and for FPL 0 to activate. One
calculation tick is `await vi.advanceTimersByTimeAsync(1000)`. After task 1 every boot also holds the default navdata
(`ZZXA`, `ZZV`, `ZZN`, `ZZXIN` near 45 S 150 W); never give a test facility an ident starting with `ZZ`.

**Moving the aircraft in a render test:** `await moveAircraft(unit, point, {groundspeedKt, trackTrue?})`. Afterwards
the position holds (a paused sim). A held position with ground speed can sequence the leg: keep the aircraft well away
from the next waypoint, or boot with `storage: {turnAnticipation: false}`.

**The standard route** (`standardRoute()` in `test/harness/fixtures.ts`): `kaaa` 47.0/8.0, `abc` 47.5/8.9 (a VOR),
`kbbb` 48.2/9.2. `savedFlightplan(0, [kaaa, abc, kbbb])` as `storage` stores it in FPL 0. Geometry from `flight/geo.ts`:
`pointBefore(from, to, nm)`, `pointFrom(p, bearingTrue, nm)`, `courseDeg`, `finalCourseDeg`, `distanceNm`.

**SimVars.** `unit.env.sim.lastWrite(name)` returns the last write (`.value`); `sim.writes` stores names in upper case,
so filter with `name.toUpperCase()`. `sim.keyEvents` lists the key events. `sim.set(name, unit, value)` sets an input.
Key events have no effect in `FakeSim` (`K:GPS_OBS_ON` does not change `GPS OBS ACTIVE`).

**Panel.xml options are nested elements**:
`<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><HeadingInput>true</HeadingInput></Input></Instrument></PlaneHTMLConfig>`,
passed as `bootUnit({panelXml})`.

**Unit stage.** No boot means no teardown: a unit test that writes `FakeSim` or `FakeStorage` resets them in
`beforeEach` (`simEnv().sim.reset()`, `simEnv().storage.data.clear()`), and builds its own `EventBus`.

---

### Task 1: default navdata fixture

**Goal:** Every `bootUnit`, `bootUnitExpectingError` and `Flight.start` world holds one airport, VOR, NDB and
intersection far from the tests unless it passes `defaultNavdata: false`, so no test sees the unrealistic `NO APT/VOR/
NDB/INT WPTS`; with a harness test, the docs, and the regression tests re-proven under it.

**Files:**
- Modify: `test/harness/fixtures.ts` (`DEFAULT_NAVDATA_POSITION`, `defaultNavdata()`)
- Modify: `test/harness/boot.ts` (`BootOptions.defaultNavdata`, merge and clash guard in `prepareBoot`)
- Modify: `test/harness/flight/FrontPanel.ts` (the `cursorTo` doc comment)
- Modify: `test/harness/flight/World.ts` (doc: idents must differ from the defaults)
- Modify: `test/render/harness/enterIdent.test.ts` (drop the INT row of the step-over `it.each`)
- Create: `test/render/harness/defaultNavdata.test.ts`
- Modify: `docs/testing.md` sections 3 and 4

**Acceptance Criteria:**
- [ ] With the fixture, no `NO APT WPTS`, `NO VOR WPTS`, `NO NDB WPTS` or `NO INT WPTS` is published anywhere in the
      suite; `NO SUP WPTS` still is.
- [ ] `defaultNavdata.test.ts` passes, and its cases fail as predicted with the fixture switched off and with a default
      airport ident that sorts first.
- [ ] `bootUnit` throws when a test facility has a default ident.
- [ ] The regression tests listed in step 5 still fail under their original breaks with the fixture on.
- [ ] `npm test` passes with the same totals as before minus the dropped `it.each` row plus the new harness tests; nothing
      under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: the fixture** in `test/harness/fixtures.ts` (extend the import line; `standardRoute` stays):

```ts
/** Where the default navdata lies: the South Pacific, far beyond the 500 NM nearest search of every test position */
export const DEFAULT_NAVDATA_POSITION = {lat: -45, lon: -150};

/**
 * One airport, VOR, NDB and intersection that bootUnit adds to every world (BootOptions.defaultNavdata), because a real
 * unit always has a database: without them, the APT, VOR, NDB and INT pages of a world that lacks the type post NO APT
 * WPTS, NO VOR WPTS, ... on the status line, a state no real unit shows. There is no user waypoint: NO SUP WPTS is real.
 *
 * The idents start with ZZ, so they sort after the idents of the tests (the scan lists are in ident order, and the APT,
 * VOR, NDB and INT pages open on the first entry), and they are unique across the types, so no DUPLICATE page appears.
 * They lie far from every test position, so the nearest lists, the maps and the INT reference VOR are unchanged.
 */
export function defaultNavdata(): Facility[] {
    const {lat, lon} = DEFAULT_NAVDATA_POSITION;
    return [
        airport('ZZXA', lat, lon),
        vor('ZZV', lat, lon + 0.1),
        ndb('ZZN', lat, lon + 0.2),
        intersection('ZZXIN', lat, lon + 0.3),
    ];
}
```

- [ ] **Step 2: the option** in `test/harness/boot.ts`. Add to `BootOptions`:

```ts
    /**
     * Adds the default navdata (fixtures.ts, defaultNavdata): one airport, VOR, NDB and intersection far away, so that
     * no scan list but SUP is empty, as in a real unit. False boots with exactly the facilities given. Default true
     */
    defaultNavdata?: boolean;
```

  In `prepareBoot`, replace the line that builds the `MemoryFacilityClient` from `opts.facilities`:

```ts
    const defaults = (opts.defaultNavdata ?? true) ? defaultNavdata() : [];
    const clash = (opts.facilities ?? []).filter(f => defaults.some(d => d.icaoStruct.ident === f.icaoStruct.ident));
    if (clash.length > 0) {
        throw new Error(`bootUnit: ${clash.map(f => f.icaoStruct.ident).join(', ')} is an ident of the default navdata (fixtures.ts); rename it or pass defaultNavdata: false`);
    }
    const navdata = new MemoryFacilityClient([...opts.facilities ?? [], ...defaults], opts.airspaces ?? []);
```

  Read `prepareBoot` first: keep any other use of `opts.facilities` (the procedure-fix check, `unit.navdata`) consistent
  with the merged list. `MemoryFacilityClient` itself stays unchanged. Check that `Flight.start` passes the option through
  its boot options, and name it in the `FlightOptions` doc if it lists the boot options. No import cycle: `fixtures.ts`
  imports only the builders.

- [ ] **Step 3: the harness test** `test/render/harness/defaultNavdata.test.ts` (contract source: this harness; label it
  as a harness test, no manual page):

```ts
describe('default navdata (harness)', () => {
    it.each([['VOR  '], ['NDB  '], ['INT  '], ['APT 1']])('a world without the type shows no NO ... WPTS on the %s page', async page => {
        const unit = await bootUnit({facilities: page === 'APT 1' ? [vor('ABC', 47.1, 8.0)] : [airport('KAAA', 47.0, 8.0)]});
        await unit.panel.selectPage('R', page);
        expect(Screen.read().status().mode).toBe('enr-leg msg');
    });

    it('keeps NO SUP WPTS, which a real unit without user waypoints shows', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.selectPage('R', 'SUP  ');
        expect(Screen.read().status().mode).toBe('NO SUP WPTS');
    });

    it('defaultNavdata: false boots the bare world', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)], defaultNavdata: false});
        await unit.panel.selectPage('R', 'INT  ');
        expect(Screen.read().status().mode).toBe('NO INT WPTS');
    });

    it('opens the APT pages on the first test airport, not the default one', async () => {
        const unit = await bootUnit({facilities: [airport('ZZIN', 47.0, 8.0), airport('KAAA', 47.1, 8.0)]});
        await unit.panel.selectPage('R', 'APT 1');
        expect(Screen.read().rows('R')[0]).toBe(' KAAA      ');
    });

    it('refuses a test facility with a default ident', async () => {
        await expect(bootUnit({facilities: [vor('ZZV', 47.0, 8.0)]})).rejects.toThrow(/ZZV is an ident of the default navdata/);
    });
});
```

  `'enr-leg msg'` relies on the boot's lit MSG annunciator (`testing.md` section 6); confirm the literal by running.
  Proof: with `defaultNavdata()` returning `[]`, the four `it.each` cases and the clash guard fail and the other three
  pass; with the default airport renamed `AAAA`, only the ordering case fails. Record both in the commit.

- [ ] **Step 4: the one changed test.** In `test/render/harness/enterIdent.test.ts` the step-over `it.each` (around line
  123, `[['SUP  '], ['INT  ']]`, "steps over the cursor position without a field on the %s page") fails on its INT row,
  because the INT page now shows `ZZXIN`. Drop the INT row; the SUP row holds the harness behavior on a realistic page
  (the field-less cursor position exists only on an empty INT or SUP page, from the 4-character placeholder `"0   "`
  that `VolatileMemory` stores for an empty list in a 5-cell selector). Fix the comment near line 52 if it still says
  that "the nearer facility … shows without any typing" (it is the alphabetically first). Update the `FrontPanel.cursorTo`
  doc comment (the SUP page without user waypoints, not INT).

- [ ] **Step 5: re-prove the regression tests that ran in worlds lacking a type** (rule 10, with the fixture on). Put
  each original bug back by hand, see the test fail, restore:
    - `test/render/pages/MainPage.test.ts`, the SCAN test of `8e9a7c4`;
    - `test/render/pages/left/SuperNav.test.ts` (`b7fd10a`, `44fb0a4`);
    - `test/render/pages/right/Apt2Page.test.ts` (#35), `Apt3Page.test.ts` (#38), `Apt3UserPage.test.ts`;
    - `test/render/pages/right/VorPage.test.ts` (`d3228dd`; the VOR list now ends with `ZZV` after `ABD`).

  The break of each is in its commit message (`git log --format=%B -S'<test name>' -- <file>`) or in the triage table
  of `docs/test-coverage.md` section 5. Report each result; a test that no longer bites is a finding for the controller,
  not something to fix silently.

- [ ] **Step 6: docs.** `testing.md` section 3, Navdata: a paragraph on the default navdata (what it holds, where, why
  the idents sort last, `defaultNavdata: false`, `ZZ` reserved for it, the clash guard, `MemoryFacilityClient` unchanged
  for unit tests). Section 4: the `cursorTo` bullet (the field-less position is on the SUP page without user waypoints);
  the `Flight.start` bullet lists `defaultNavdata` among the boot options it takes. `World.ts`: idents must also differ
  from the default navdata.

- [ ] **Step 7: verify and commit.** `npm test`, `npx tsc --noEmit`, one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/harness/fixtures.ts", "test/harness/boot.ts", "test/harness/flight/FrontPanel.ts", "test/harness/flight/World.ts", "test/render/harness/enterIdent.test.ts", "test/render/harness/defaultNavdata.test.ts", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["no NO APT/VOR/NDB/INT WPTS anywhere, NO SUP WPTS kept", "harness test passes and fails as predicted off and with a sort-first ident", "clash guard throws", "listed regression tests still bite", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 2: H events

**Goal:** A unit pin of every public H event name, a test of the `KLN90B.tsx` adapter, a sweep of every public event in
four states, spec tests of the events with an observable effect, all sent as literals, and the ApprArm re-arm pin.

**Files:**
- Create: `test/unit/HEvents.test.ts`
- Create: `test/unit/KLN90B.test.ts`
- Create: `test/render/HEvents.test.ts`

**Acceptance Criteria:**
- [ ] The name pin fails when the value of one constant in `HEvents.ts` changes; the sweep alone does not (say so in
      the report).
- [ ] The adapter test fails when `KLN90B.tsx` stops forwarding `onInteractionEvent` or `Init`.
- [ ] The sweep covers every public event in the four states, each on a fresh unit, and is named a sweep.
- [ ] Every spec test sends literals, cites its page or contract source, and fails under its break.
- [ ] The ApprArm pin is `it.fails('… (#NEW-2-1)')`, proven by a temporary fix, with a passing sibling.
- [ ] Report written.

**Verify:** `npx vitest run test/unit/HEvents.test.ts test/unit/KLN90B.test.ts test/render/HEvents.test.ts` → passes,
the pin as an expected failure.

**Steps:**

- [ ] **Step 1: the name pin** (unit, `test/unit/HEvents.test.ts`; contract: `HEvents.ts`, CLAUDE.md, wiki External
  Hardware): `import * as H from '../../kln90b/HEvents'` and `expect(H).toMatchObject({...})` with the public names as
  literals: `EVT_BRT_INC: 'KLN90B_Brt_Inc'`, `EVT_BRT_DEC: 'KLN90B_Brt_Dec'`, `EVT_POWER: 'KLN90B_Power_Toggle'`,
  `EVT_POWER_ON: 'KLN90B_Power_On'`, `EVT_POWER_OFF: 'KLN90B_Power_Off'`, `EVT_MSG: 'KLN90B_MSG_Push'`,
  `EVT_DCT: 'KLN90B_DCT_Push'`, `EVT_CLR: 'KLN90B_CLR_Push'`, `EVT_ENT: 'KLN90B_ENT_Push'`, `EVT_ALT: 'KLN90B_ALT_Push'`,
  `EVT_L_CURSOR: 'KLN90B_LeftCursor_Toggle'`, `EVT_L_OUTER_LEFT: 'KLN90B_LeftLargeKnob_Left'`,
  `EVT_L_OUTER_RIGHT: 'KLN90B_LeftLargeKnob_Right'`, `EVT_L_INNER_LEFT: 'KLN90B_LeftSmallKnob_Left'`,
  `EVT_L_INNER_RIGHT: 'KLN90B_LeftSmallKnob_Right'`, `EVT_R_CURSOR: 'KLN90B_RightCursor_Toggle'`,
  `EVT_R_OUTER_LEFT: 'KLN90B_RightLargeKnob_Left'`, `EVT_R_OUTER_RIGHT: 'KLN90B_RightLargeKnob_Right'`,
  `EVT_R_INNER_LEFT: 'KLN90B_RightSmallKnob_Left'`, `EVT_R_INNER_RIGHT: 'KLN90B_RightSmallKnob_Right'`,
  `EVT_R_SCAN: 'KLN90B_RightScan_Toggle'`, `EVT_APPR_ARM: 'KLN90B_ApprArm_Push'`. The `Internal_*` events are not part of
  it (they are private). Break: change `EVT_MSG`'s value.

- [ ] **Step 2: the adapter** (unit, `test/unit/KLN90B.test.ts`; contract: the adapter is how the sim delivers H events
  and the panel.xml document). **Static** import at the top (`import '../../kln90b/KLN90B';`; a dynamic import inside a
  test takes about 2.7 s and timed out under load). The fake `registerInstrument` of `test/harness/sim/staticGlobals.ts`
  stores the class in `globalThis.__registeredInstruments`:

```ts
const Cls = (globalThis as any).__registeredInstruments.get('kln-90b');
const inst = new Cls();   // builds a real KLN90BCore on SIM_PLATFORM; nothing is awaited
const fwd = vi.spyOn(inst.core, 'onInteractionEvent').mockImplementation(() => {});
inst.onInteractionEvent(['KLN90B_ENT_Push']);
expect(fwd).toHaveBeenCalledWith(['KLN90B_ENT_Push']);
```

  Separate `it`s: `onInteractionEvent` forwards; `Init()` with `inst.xmlConfig = doc` calls `core.init(doc)` (spy with
  `mockImplementation(() => Promise.resolve())`); `templateID` is `'KLN90B'` (what panel.cfg refers to); `onSoundEnd`
  forwards to `core.onSoundEnd`. The registered name `'kln-90b'` is part of the contract too. Breaks: remove
  `this.core.onInteractionEvent(args);` (`KLN90B.tsx:66`); remove `this.core.init(this.xmlConfig);` (`:49`).

- [ ] **Step 3: the sweep** (render, `test/render/HEvents.test.ts`; contract source as in step 1). A `PUBLIC_EVENTS`
  array of the 22 literals. Name it a sweep (rule 17):

```ts
describe('every public H event (sweep)', () => {
    it.each(PUBLIC_EVENTS)('accepts %s on the main page without an error (sweep)', async evt => {
        const unit = await bootUnit();
        unit.send(evt);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.errors).toEqual([]);
        expect(unit.consoleErrors).toEqual([]);
    });
});
```

  The same `it.each` on the welcome page (`bootUnit({engineRunning: false})`, `unit.panel.powerOn()`, 2 s), on the
  self-test page (the same, 20 s), and on a dark unit (`engineRunning: false`, no power). The harness's strict collector
  fails a rejection. A fresh unit per event (power events end a sequential sweep). The research ran all 88 boots in about
  6 s. Breaks: `case EVT_MSG: throw new Error("break");` in `MainPage.tsx`; the ENT path returns
  `Promise.reject(new Error("break"))`.

- [ ] **Step 4: the knobs** (render, same file). Use `unit.panel.press('<literal>', n)` and read `Screen.read().status()`.
    - **Left outer (3-12):** from NAV 2, `KLN90B_LeftLargeKnob_Right` gives `left === 'CAL 1'`; `KLN90B_LeftLargeKnob_Left`
      x2 gives `'FPL 0'`. Wrap: from NAV, `LeftLargeKnob_Left` x3 gives `'TRI 0'`, once more `'OTH 1'`,
      `LeftLargeKnob_Right` gives `'TRI 0'` again. Breaks: `leftTreeController.movePage(-1)` → `(1)` and
      `movePage(1)` → `(-1)` in `MainPage.tsx`.
    - **Left inner (3-12, the manual's own CAL example):** from CAL 1, `LeftSmallKnob_Right` x4 gives `'CAL 5'`, three
      more give `'CAL 1'`, `LeftSmallKnob_Left` x3 gives `'CAL 5'`. Breaks: `leftTreeController.moveSubpage(1)` ↔ `(-1)`.
    - **Right outer (3-13):** from SUP, `RightLargeKnob_Right` gives `right === 'CTR 1'` (the list wraps); then
      `RightLargeKnob_Left` x2 gives `rightName() === 'INT  '`.
    - **Right inner (3-13):** `RightLargeKnob_Right` x4 from SUP (CTR, REF, ACT, D/T) gives `'D/T 1'`; `RightSmallKnob_Right`
      gives `'D/T 2'`; `RightSmallKnob_Left` gives `'D/T 1'`, once more `'D/T 4'`. **No-op trap:** a two-page group, or
      a step of two in a four-page group, stays green with the knob reversed; keep these single steps plus the wrap.
      Breaks: `rightTreeController.movePage` and `moveSubpage` with the sign reversed (four breaks, each alone).

- [ ] **Step 5: cursors, MSG, ALT** (render, same file).
    - **Cursors (3-11):** `LeftLargeKnob_Left` to FPL 0, `KLN90B_LeftCursor_Toggle` gives `left === 'CRSR'`, again gives
      `'FPL 0'`. On SUP, `KLN90B_RightCursor_Toggle` gives `right === 'CRSR'`, again `'SUP'`. On NAV 2 the left cursor
      toggle leaves `'NAV 2'`, no `I` in `maskRows('L')`, `unit.errors` empty (3-11: a page without data entry ignores the
      button). Breaks: the L_CURSOR case toggles the right cursor; R_CURSOR returns false; drop
      `if (fields.length === 0) return false;` in `CursorController.toggleCursor`.
    - **MSG (3-16):** `KLN90B_MSG_Push` shows the MSG page (both page names blank in `status()`); its rows hold the two
      boot messages (`SYSTEM TIME UPDATED`/`TO GPS TIME` and `POSITION DIFFERS FROM`/`LAST POSITION BY >2NM`). Assert them
      as an unordered set of two-row messages unless you have checked the posting order against 3-16 (newest first). A
      second press gives `'NAV 2'` and `'SUP'` (3-16: back to the pages in view). Break:
      `return this.getOverlayPage()!.msg();` → `return true;`.
    - **ALT (3-55, 3-56, 3-39):** advance 5 s after boot (NAV 4 shows `TO :` before an altitude input exists, 5-7), then
      `KLN90B_ALT_Push`: `rows('L')[1] === 'BARO:29.92"'` with `maskRows('L')[1] === '.....II....'`,
      `rows('R')[3] === 'SEL:00000ft'` with `maskRows('R')[3] === '....I......'`, both status names `'CRSR'`; a second
      press gives `'NAV 2'` and `'SUP'`. Breaks: `if (leftPage instanceof AltPage)` → `if (false)`; drop
      `page.getCursorController().setCursorActive(true);`. Confirm the literals by running.

- [ ] **Step 6: DCT, ENT, CLR** (render, same file). World: `standardRoute()`, `storage: savedFlightplan(0, [kaaa, abc,
  kbbb])`, position 47.1/8.0, `settle`.
    - **DCT in OBS mode (5-37):** `unit.panel.obsMode()`, then `KLN90B_DCT_Push` gives `rows('L')[0] === 'DIRECT TO: '`,
      again `'ACTIVATE:  '`, again `'DIRECT TO: '`. Break: drop `this.activateMode = !this.activateMode;` in
      `DirectToPage.tsx`. (The plain "DCT shows a blank DIR page" is held by `DirectToPage.test.ts` #49; do not repeat it.)
    - **ENT recenters (3-29, steps 1-3):** move the right side off the SUP page first: `KLN90B_RightLargeKnob_Left` x5
      (SUP, INT, NDB, VOR, APT, NAV), because after power-up DCT on the boot SUP page opens blank (#119). `KLN90B_DCT_Push`:
      `rows('L')[2] === '   ABC     '`; `KLN90B_ENT_Push`, 1 s: the active ident is `'ABC'` and
      `memory.navPage.activeWaypoint.isDctNavigation()` is true.
    - **CLR cancels (3-29, 4-7):** after that direct-to, `DCT_Push`, `CLR_Push`, `ENT_Push`, 1 s: `isDctNavigation()` is
      false, the active ident still `'ABC'`.
    - Breaks: drop `this.handleEnter();` (MainPage); CLR returns false without clearing.

- [ ] **Step 7: SCAN, power, ApprArm** (render, same file).
    - **SCAN (3-13, 3-21):** `bootUnit({facilities: [vor('ABC', 47.2, 8.2), vor('ABD', 47.1, 8.1)]})`,
      `selectPage('R', 'VOR  ')`, row 0 `' ABC D     '`. Pushed in, `RightSmallKnob_Right` leaves row 0 (VOR is one page).
      `KLN90B_RightScan_Toggle`: `lastWrite('L:KLN90B_RightScan').value === 1`; `RightSmallKnob_Right` gives
      `' ABD D     '`; wait 400 ms (the scan speeds up on fast clicks, see `VorPage.test.ts`); `RightSmallKnob_Left` gives
      `' ABC D     '`; wait; `RightSmallKnob_Right` gives `' ABD D     '`; wait. Toggle again: the LVar 0, and
      `RightSmallKnob_Right` leaves `' ABD D     '`. Breaks: `KLN90BCore.ts:191` maps to `EVT_R_INNER_RIGHT` instead of
      the scan event; `:188` the same for left; drop `this.hardware.setScanPulled(false);` (`:195`).
    - **Power_Toggle (contract: HEvents.ts, wiki External Hardware):** boot, advance 15 s (the brightness ramp), read
      `storedSetting(unit, 'powercycles')` (advance first, the save is deferred). `KLN90B_Power_Toggle`, 1 s:
      `L:KLN90B_Power` 0 and seven blank rows of 23 cells. Again, 1 s: the LVar 1, `powercycles` one higher, `row(0) ===
      ' GPS             ORS 20'` (3-3). Break: `this.togglePowerSwitch();` → `this.setPowerOn();` in `PowerButton.ts`.
      (Power_On, Power_Off and Brt_* are held by `PowerButton.test.ts` and `BrightnessManager.test.ts`.)
    - **ApprArm without an approach (C-1):** default boot, `KLN90B_ApprArm_Push`: `status().mode === 'NO APPROACH'`,
      navmode stays `NavMode.ENR_LEG`. Breaks: drop the `NO APPROACH` publish (`ModeController.ts:41, 56`); drop
      `this.props.modeController.armApproachPressed();` (`MainPage.tsx:575`).
    - **ApprArm beyond 30 NM (6-1):** copy the approach world of `test/render/services/ModeController.test.ts` (KPRC
      47.0/8.0, an RNAV approach whose final runs FAFAA, 5 NM north of MAPAA, to MAPAA at the airport, FAFAA flagged IAF
      in its transition and FAF in the final; ENRAA 20 NM north of the aircraft), aircraft 40 NM north of KPRC,
      `storage: {...savedFlightplan(0, [enraa, kprc]), turnAnticipation: false}`. `settle`, `loadProcedure('APT 8')`, 2 s,
      navmode `ENR_LEG`, then 6 s more (the procedure's status messages expire): mode field `'enr-leg'`. `ApprArm_Push`,
      2 s: `ARM_LEG`, mode field `'arm-leg'` (5-32), `xtkScale` 5. Again, 2 s: `ENR_LEG`, `xtkScale` 5. Breaks: the ENR
      press sets `ENR_LEG` instead of `ARM_LEG` (`ModeController.ts:43`); the ARM press keeps `ARM_LEG` (`:50`).

- [ ] **Step 8: pin the re-arm (`#NEW-2-1`).** The same world with the aircraft 20 NM north of KPRC. Sibling (passing):
  after `loadProcedure` and 2 s the unit has armed on its own (`ARM_LEG`), and right after `ApprArm_Push` the navmode is
  `ENR_LEG`. Pin: 3 s after the press the navmode is still `ENR_LEG` (6-1: a press while armed disarms until the next
  press; B-1: `ARM GPS APPROACH` assumes a disarmed approach inside 30 NM). Today it is `ARM_LEG` again, because
  `ModeController.tick` calls `checkSwitchEnrToArmMode` (`ModeController.ts:233-237, 310`) every tick. Prove: a
  temporary flag set by `armApproachPressed` when it disarms, checked in `checkSwitchEnrToArmMode`; the pin turns red.

- [ ] **Step 9: report** (per test: path, label, break; the sweep's blind spot for renames; the pin with its proof).

```json:metadata
{"files": ["test/unit/HEvents.test.ts", "test/unit/KLN90B.test.ts", "test/render/HEvents.test.ts"], "verifyCommand": "npx vitest run test/unit/HEvents.test.ts test/unit/KLN90B.test.ts test/render/HEvents.test.ts", "acceptanceCriteria": ["name pin bites on a renamed value", "adapter test bites on dropped forwarding and Init", "sweep in four states on fresh units, named a sweep", "spec tests send literals, cite, bite", "ApprArm re-arm pin proven with sibling", "report written"], "modelTier": "standard"}
```

---

### Task 3: LVars

**Goal:** Tests that every read-only LVar is written with the right value for a known state and every writable LVar
changes the behavior it documents, plus pins for the outputs at power-off, the ElectricitySimVar prefix, `GPS
OVERRIDDEN` while disabled, input while disabled, and roll steering without a heading input.

**Files:**
- Create: `test/render/SimVarSync.test.ts`
- Create: `test/render/controls/StatusLine.test.ts`
- Create: `test/render/services/RollSteeringController.test.ts`
- Modify: `test/render/PowerButton.test.ts`
- Modify: `test/render/pages/left/SelfTestLeftPage.test.ts` (new `describe` blocks)
- Modify: `test/render/SensorsOut.test.ts` (a new `describe('outputs at power-off')` block only)

**Acceptance Criteria:**
- [ ] Each test cites its contract source or page and fails under its break.
- [ ] The self-test LVars are one `it` each; the report says which break turned which `it` red.
- [ ] The writable overrides each change behavior within one `SimVarSync` tick; the Disabled test counts exactly one
      output write per second after the resume.
- [ ] Pins `#NEW-3-1` onward, each proven by a temporary fix, each with a passing sibling.
- [ ] Report written.

**Verify:** `npx vitest run test/render/SimVarSync.test.ts test/render/controls/StatusLine.test.ts test/render/services/RollSteeringController.test.ts test/render/PowerButton.test.ts test/render/pages/left/SelfTestLeftPage.test.ts test/render/SensorsOut.test.ts`
→ passes, the pins as expected failures.

**Steps:**

Start from `research-2-lvars-drafts\proposed.test.ts`. Assert the screen, not the opacity, for power states: #114 lets
the opacity ramp on an unpowered unit.

- [ ] **Step 1: `L:KLN90B_Power` reports the switch** (`PowerButton.test.ts`; contract: `LVars.ts`, "position of the
  power switch … still off if electricity is not available"). `panelXml` with
  `<Input><ElectricitySimVar>CIRCUIT ON:1</ElectricitySimVar></Input>`, the circuit left unset; after 1 s row 0 is 23
  blanks and `lastWrite('L:KLN90B_Power').value === 1`. Break: in `PowerButton.ts:78` write
  `electricityAvailable && this.powerSwitchOn` to the LVar before `refreshPowerState()`.

- [ ] **Step 2: `L:KLN90B_RightScan` through the event.** Covered by task 2's SCAN test (the LVar is asserted there). Do
  not duplicate.

- [ ] **Step 3: `L:KLN90B_HSI_TF_FLAGS` TO then FROM** (`SensorsOut.test.ts` new block or `Sensors.test.ts`; contract:
  the values 0 flagged, 1 TO, 2 FROM follow the sim's `HSI TF FLAGS` convention, which task 8 adds to `LVars.ts`; 3-31
  for FROM past the last waypoint). FPL 0 `savedFlightplan(0, [kaaa, abc])`, boot at `pointBefore(kaaa, abc, 3)`,
  `settle`: ABC active, the LVar 1. `moveAircraft(unit, pointFrom(abc, finalCourseDeg(kaaa, abc), 3), {groundspeedKt: 0})`,
  1 s: ABC still active, the LVar 2. Break: `Sensors.ts:313` `toFrom === TO ? 1 : 2` → `1`.

- [ ] **Step 4: the self-test outputs** (`SelfTestLeftPage.test.ts`, a new `describe`; Pilot's Guide 3-4, Installation
  Manual 2-69 and 2-70). Panel.xml with `<HeadingInput>true</HeadingInput>` (so the roll pattern does not depend on the
  heading-input pin below). `bootUnit({engineRunning: false, magvar: 0, panelXml})`, `panel.powerOn()`, advance 19 s,
  the screen contains `APPROVE?`. Sample every 250 ms for 12 s (48 samples). **One `it` per LVar:** MsgLight all 1;
  WptLight all 1; AnnunTest all 1; HSI_TF_FLAGS all 2 (FROM); RollCommand min -5 and max 0 (0 to 5 degrees right and
  back, 2-70). A shared setup helper in the file is fine. After `panel.approveSelfTest()` and 2 s: AnnunTest, WptLight and
  RollCommand 0, one `it` each (2-69). Do not assert MsgLight there (the boot messages are pending). Breaks:
  `NavCalculator.ts:56` `waypointAlert = true` → `false` (WPT); `StatusLine.tsx:197` `true` → `false` (MSG);
  `NavCalculator.ts:324` `setAnnunTest(nav.isSelfTestActive)` → `(false)` and → `(true)`;
  `RollSteeringController.ts:21` `SELF_TEST_DIR_RIGHT = -1` → `1`.

- [ ] **Step 5: the MSG light while a message is unread** (`test/render/controls/StatusLine.test.ts`; 3-16, 3-59). Boot,
  `settle` (the boot always has unread messages), sample `L:KLN90B_MsgLight` over 8 display ticks (250 ms each): the set
  of values is `{0, 1}` (it flashes). `KLN90B_MSG_Push` x3 (read all, close), 1 s, sample 8 ticks: the set is `{0}`. Breaks:
  `StatusLine.tsx:200` `!blink` → `true`; `:205` `false` → `true`. The steady light while a persistent message stays is
  left untested (no cheap trigger).

- [ ] **Step 6: the WPT light is steady during the alert** (`SensorsOut.test.ts` new block or the flight
  `firstFlight.test.ts` already holds "on about 20 s before the turn, through the turn": read it first). If
  `firstFlight` already asserts it is 1 at every sample of the alert, add nothing and say so in the report. Otherwise add a
  render test: aircraft held 1 NM before ABC on the leg at 120 kt (`moveAircraft`), `turnAnticipation` on, sample over
  4 s: all 1 (contract: the maintainer's ruling and the code's cited video; 3-29 and 4-8 describe a flashing light, which
  the maintainer ruled against; say so in the comment).

- [ ] **Step 7: the roll command** (`test/render/services/RollSteeringController.test.ts`; contract: wiki Autopilot,
  `LVars.ts`). Panel.xml `<HeadingInput>true</HeadingInput>` in every test of this step.
    - No plan: boot, `settle`: `lastWrite('L:KLN90B_RollCommand').value === 0` (written, not unset).
    - On the ground: standard route, FPL KAAA ABC KBBB, at KAAA, ground speed 0: ABC active, the roll 0 (Installation
      Manual 2-70, roll steering needs ground speed).
    - Sign: `mid = pointBefore(kaaa, abc, 10)`, `dtk = courseDeg(mid, abc)`; `moveAircraft(unit, pointFrom(mid, dtk + 90,
      2), {groundspeedKt: 120, trackTrue: dtk})` gives roll > 0 (the leg is to the left; the wiki: positive is a left
      bank). `pointFrom(mid, dtk - 90, 2)` gives roll < 0. Separate `it`s. A magnitude assertion (25) is a
      characterization in its own `it`, titled so.
    - Range: `pointFrom(mid, dtk + 90, 0.3)`, 200 kt, `trackTrue: (dtk + 270) % 360`: the roll is -30 (`toBeCloseTo(-30,
      6)`; the wiki: at most 30 degrees once in range).
    - Breaks: `Sensors.ts:545` `Degree, 0)` → `Degree, 1)`; `:547` `bankAngle` → `-bankAngle`;
      `RollSteeringController.ts:148` the cap 30 → 45.

- [ ] **Step 8: the writable overrides** (`test/render/SimVarSync.test.ts`; contract: `LVars.ts`, the wiki pages
  panel.xml customization and Hot Swapping). `SimVarSync` reads every 100 ms; advance 300 ms after each write.
    - **Disabled:** on route, `settle`. Set `L:KLN90B_Disabled` 1, 300 ms, count the writes of `L:KLN90B_HSI_TF_FLAGS`;
      after 5 s no new writes. Set it 0, 300 ms, count; after 10 s exactly 10 new writes (1 Hz); `GPS OVERRIDDEN` 1
      again; the left page still NAV 2 and ABC still active. Breaks: `SimVarSync.ts:68` `setEnabled(!disabled)` →
      `setEnabled(true)`; a latch that never re-enables. The doubled tick rate of #24 is held only jointly by two guards
      (`SimVarSync.ts:62-64` and `TickController.ts:103-105`): removing both fails the count, either alone does not;
      say so in the report.
    - **ObsSource:** `Nav OBS:1` 51, `Nav OBS:2` 77, 2 s, `unit.props.sensors.in.obsMag` 51; write the LVar 2, 2 s, 77.
      Break: comment out `SimVarSync.ts:49`.
    - **ElectricitySimVar and its index:** panel.xml `CIRCUIT ON:1`; after the boot set `CIRCUIT ON:1` true, 2 s, row 0
      not blank (the unit powers up through the welcome page); set it false, 1 s, row 0 blank. Set it true again, write
      `L:KLN90B_ElectricitySimVarIndex` 2 (with `CIRCUIT ON:2` unset), 1 s, row 0 blank; set `CIRCUIT ON:2` true, 1 s, not
      blank. `bootUnit` cannot preset a SimVar before `init`, so the unit boots, loses power at the first sync and powers
      up when the test sets the circuit; that is fine. Breaks: comment out `SimVarSync.ts:38` (the electricity read);
      comment out `:34` (the index).
    - **ObsTarget:** on route, `magvar: 4`, default panel.xml: no `K:VOR1_SET`. Write the LVar 1, 2 s: only `K:VOR1_SET`
      events, the last value `courseDeg(kaaa, abc) - 4` (one decimal; confirm how the event value is recorded). Write 0,
      300 ms, count; after 3 s no new events. Break: comment out `SimVarSync.ts:50`.
    - **WriteGpsSimvars:** on route, `GPS OVERRIDDEN` 1. Write the LVar 0, 300 ms: `GPS OVERRIDDEN` 0; count the writes of
      `GPS WP DISTANCE`; after 5 s none new. Write 1, 3 s: `GPS OVERRIDDEN` 1 and new `GPS WP DISTANCE` writes. Do not use
      `GPS WP CROSS TRK` as the probe (#126). Breaks: comment out `SimVarSync.ts:54`; comment out `:55`.
    - Brightness is held by `BrightnessManager.test.ts`; nothing to add.

- [ ] **Step 9: pins.** Each with a passing sibling.
    - **Outputs at power-off (`#NEW-3-1` to `#NEW-3-5`)** (`SensorsOut.test.ts`, `describe('outputs at power-off')`).
      Contract: `LVars.ts` and the wiki pages Autopilot, CDI/HSI, External Annunciators; Installation Manual 2-69
      (annunciator outputs inactive unless driven). Setup A: standard route, `settle`, panel.xml HeadingInput true,
      `moveAircraft(pointFrom(mid, dtk + 90, 2), 120 kt, track dtk)`; sibling: the roll is 25 and the HSI flag 1.
      `KLN90B_Power_Off`, 3 s. Pins: the roll command is 0 (`#NEW-3-1`); the HSI flag is 0 (`#NEW-3-2`). Setup B: the
      self-test page as in step 4; sibling: MSG, WPT and AnnunTest are 1. `KLN90B_Power_Off`, 3 s. Pins, one each:
      MsgLight 0 (`#NEW-3-3`), WptLight 0 (`#NEW-3-4`), AnnunTest 0 (`#NEW-3-5`). Prove: write those zeros in
      `SensorsOut.reset` (`Sensors.ts:566-596`) temporarily; all five turn red. Disabled stays a freeze (`61f6b61`): do not
      pin it.
    - **ElectricitySimVar with a prefix (`#NEW-3-6`)** (`SimVarSync.test.ts`; contract: wiki panel.xml customization, any
      boolean SimVar, an index only after a colon). Panel.xml `<ElectricitySimVar>L:MY_AVIONICS_BUS</ElectricitySimVar>`,
      set `L:MY_AVIONICS_BUS` true, 2 s: row 0 is not blank. Today blank (the name becomes `L:NaN`,
      `KLN90BPlaneSettings.ts:97-99`, `SimVarSync.ts:31-35`). Sibling: the `CIRCUIT ON:1` test of step 8. Prove: detect
      the index with `/:(\d+)$/` in both places.
    - **`GPS OVERRIDDEN` while disabled (`#NEW-3-7`)** (contract: Hot Swapping wiki). `settle`, Disabled 1, 300 ms
      (sibling asserts `GPS OVERRIDDEN` 0), WriteGpsSimvars 0, 300 ms, 1, 300 ms. Pin: `GPS OVERRIDDEN` is still 0. Prove:
      skip the write in `SimVarSync.ts:53-56` while `this.disabled`.
    - **Input while disabled (`#NEW-3-8`)** (contract: Hot Swapping wiki, suspend and resume where it left off). Left page
      NAV 1 (`selectPage('L', 'NAV 1')`), Disabled 1, 300 ms, `KLN90B_LeftSmallKnob_Right` x2, Disabled 0, 2 s. Pin:
      `status().left === 'NAV 1'`. Today `'NAV 3'`. Sibling: without Disabled the same two clicks give `'NAV 3'`. Prove:
      return early from `KLN90BCore.onInteractionEvent` while `L:KLN90B_Disabled` reads 1.
    - **Roll steering without a heading input (`#NEW-3-9`)** (`RollSteeringController.test.ts`; Installation Manual 2-69:
      no roll steering output without heading). Default panel.xml (HeadingInput false), the sign setup of step 7. Pin: the
      roll is 0. Sibling: the step 7 sign tests (HeadingInput true). Prove: in `RollSteeringController` set the command to
      0 when `planeSettings.input.headingInput` is false.

- [ ] **Step 10: report** (per test: path, label, break; per pin: proof; the jointly held tick-rate guards).

```json:metadata
{"files": ["test/render/SimVarSync.test.ts", "test/render/controls/StatusLine.test.ts", "test/render/services/RollSteeringController.test.ts", "test/render/PowerButton.test.ts", "test/render/pages/left/SelfTestLeftPage.test.ts", "test/render/SensorsOut.test.ts"], "verifyCommand": "npx vitest run test/render/SimVarSync.test.ts test/render/controls/StatusLine.test.ts test/render/services/RollSteeringController.test.ts test/render/PowerButton.test.ts test/render/pages/left/SelfTestLeftPage.test.ts test/render/SensorsOut.test.ts", "acceptanceCriteria": ["read-only LVars tested against known states, each bites", "self-test LVars one it each", "writable overrides change behavior, Disabled resumes at 1 Hz", "pins #NEW-3-1 to #NEW-3-9 proven with siblings", "report written"], "modelTier": "standard"}
```

---

### Task 4: panel.xml keys

**Goal:** Unit tests that the sample panel.xml, the defaults, each key alone and the parser's LVar writes are what the
contract says, SET 9 showing the disabled altitude alert, and the pin for the `AltitudeAlertEnabled` default.

**Files:**
- Modify: `test/unit/settings/KLN90BPlaneSettings.test.ts`
- Create: `test/render/pages/left/Set9Page.test.ts`

**Acceptance Criteria:**
- [ ] The per-key table catches a renamed lookup path that the sample test misses (say so in the report).
- [ ] No passing test asserts `altitudeAlertEnabled === true` as a default.
- [ ] The pin is `it.fails('… (#NEW-4-1)')`, proven by a temporary fix, with a passing sibling.
- [ ] `TakeHomeMode` has no per-key test.
- [ ] Report written.

**Verify:** `npx vitest run test/unit/settings/KLN90BPlaneSettings.test.ts test/render/pages/left/Set9Page.test.ts` →
passes, the pin as an expected failure.

**Steps:**

- [ ] **Step 1: scaffold.** The file already has `// @vitest-environment happy-dom` (for `DOMParser`). Add
  `/// <reference types="node" />`, `readFileSync('cfg/panel.xml', 'utf8')` (Vitest runs at the repo root), and a
  `beforeEach` that resets `simEnv().sim`. A `parse(xml)` helper. `FuelUnit`/`FuelType` are const enums: write their
  values as literals (`'GAL'`, `'Avgas'`) with a cast.
  DEFAULTS literal (contract: the wiki page panel.xml customization and `cfg/panel.xml`), **without**
  `output.altitudeAlertEnabled`:

```ts
const DEFAULTS = {
    takeHomeMode: false, basePath: 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B', debugMode: false, vfrOnly: false,
    input: {
        altimeterInterfaced: true, obsSource: 1, headingInput: false, electricitySimVar: '',
        airdata: {isInterfaced: false, baroSource: 0},
        fuelComputer: {isInterfaced: false, unit: 'GAL', type: 'Avgas', fobTransmitted: true, fuelUsedTransmitted: true},
        externalSwitches: {legObsSwitchInstalled: false, appArmSwitchInstalled: false},
    },
    output: {obsTarget: 0, writeGPSSimVars: true},
};
/** The parsed settings without altitudeAlertEnabled, whose default is the pinned bug (#NEW-4-1) */
const withoutAltAlert = (s: KLN90PlaneSettings) => {
    const {altitudeAlertEnabled, ...output} = s.output;
    return {...s, output};
};
```

  A small `withField(path, value)` that returns a deep copy of DEFAULTS with one field changed keeps the per-key table
  readable.

- [ ] **Step 2: the sample** (contract: `cfg/panel.xml`). `withoutAltAlert(parse(sample))` equals DEFAULTS with
  `input.electricitySimVar = 'CIRCUIT ON:1'`; `typeof obsSource === 'number'`; `parse(sample).output.altitudeAlertEnabled
  === false` (the sample's value); `lastWrite('L:KLN90B_ElectricitySimVarIndex').value === 1`. Break:
  `return Number(textValue)` → `return textValue`.

- [ ] **Step 3: the defaults.** `withoutAltAlert(parse(x))` equals DEFAULTS for: `<PlaneHTMLConfig></PlaneHTMLConfig>`;
  a document whose only instrument is `<Name>AS530</Name>` with `VFROnly` true, `ObsSource` 2 and `WriteGPSSimVars` false
  (keys of another instrument do not leak); `<Instrument><Name>KLN90B</Name></Instrument>`. And another instrument
  (`AS530`, VFROnly true) **before** the KLN90B one (ObsSource 2) gives DEFAULTS with `obsSource` 2. Each also writes
  `L:KLN90B_ObsSource` 1, `L:KLN90B_ObsTarget` 0, `L:KLN90B_WriteGpsSimvars` 1 and no
  `L:KLN90B_ElectricitySimVarIndex`. Break: remove the `textContent === "KLN90B"` check in `getKLNInstrumentsTag`.

- [ ] **Step 4: each key alone** (`it.each`, contract: the wiki page). One document per key, only that key, at a
  non-default value; `withoutAltAlert(parse(doc))` equals DEFAULTS with exactly that field changed: BasePath
  `html_ui/Pages/VCockpit/Instruments/Foo/KLN`; VFROnly true; AltimeterInterfaced false; ObsSource 2; HeadingInput true;
  ElectricitySimVar `CIRCUIT SWITCH ON:3`; Airdata.IsInterfaced true; Airdata.BaroSource 2; FuelComputer.IsInterfaced
  true; Unit `KG`; Type `JetA1`; FOBTransmitted false; FuelUsedTransmitted false; LegObsSwitchInstalled true;
  AppArmSwitchInstalled true; ObsTarget 2; WriteGPSSimVars false. Two more cases for `AltitudeAlertEnabled`: `false`
  parses to false and `true` to true, each with the rest equal to DEFAULTS. `TakeHomeMode` is not a supported key: no
  case. Breaks: rename the `"Input.HeadingInput"` path (only its row fails; the sample test stays green); numbers as
  strings (ObsSource, BaroSource, ObsTarget fail).

- [ ] **Step 5: the parser's LVar writes** (contract: `LVars.ts`, the wiki's "synced with" notes). One document: ObsSource
  2, ElectricitySimVar `CIRCUIT ON:3`, ObsTarget 1, WriteGPSSimVars false: the last writes are ObsSource 2, ObsTarget 1,
  WriteGpsSimvars 0, ElectricitySimVarIndex 3 (a number). A second document with `ELECTRICAL MAIN BUS VOLTAGE` (no
  colon): no index write. Break: drop the `LVAR_OBS_SOURCE` write.

- [ ] **Step 6: SET 9** (`test/render/pages/left/Set9Page.test.ts`; contract: the wiki page panel.xml customization).
  `bootUnit({panelXml})` with `<Output><AltitudeAlertEnabled>false</AltitudeAlertEnabled></Output>`,
  `selectPage('L', 'SET 9')`, 1 s: `rows('L')[4] === ' FEATURE   '` and `rows('L')[5] === ' DISABLED  '` (confirm the
  rows by running). With `true`: the page shows the volume row instead (read the literal and assert it). Break:
  `Set9Page.tsx:43` condition → `if (true)`.

- [ ] **Step 7: pin the default (`#NEW-4-1`).** `parse('<PlaneHTMLConfig></PlaneHTMLConfig>').output.altitudeAlertEnabled
  === false` (the maintainer's ruling: the samples show false). Today true. Sibling: the defaults test of step 3. Prove:
  change the default at `KLN90BPlaneSettings.ts:86` to false; the pin turns red.

- [ ] **Step 8: report.**

```json:metadata
{"files": ["test/unit/settings/KLN90BPlaneSettings.test.ts", "test/render/pages/left/Set9Page.test.ts"], "verifyCommand": "npx vitest run test/unit/settings/KLN90BPlaneSettings.test.ts test/render/pages/left/Set9Page.test.ts", "acceptanceCriteria": ["sample, defaults, each key alone, LVar writes each bite", "no passing test asserts altitudeAlertEnabled true", "AltitudeAlertEnabled default pin proven with sibling", "no TakeHomeMode per-key test", "report written"], "modelTier": "standard"}
```

---

### Task 5: GPS SimVars and the `"kln90b"` planner

**Goal:** Render tests that the GPS SimVars match independent geometry for a known state, that nothing else is written
with `WriteGPSSimVars` off, and that the `"kln90b"` planner mirrors FPL 0 as documented; pins for #126 and for the
planner written while the option is off.

**Files:**
- Modify: `test/render/SensorsOutSimVars.test.ts`
- Modify: `test/render/SensorsOut.test.ts` (a new gate block only)
- Create: `test/render/services/WTFlightplanSync.test.ts`
- Modify: `test/render/services/ModeController.test.ts` (one `it` at the end)
- Modify: `test/render/pages/left/SelfTestLeftPage.test.ts` (one `it` at the end)

**Acceptance Criteria:**
- [ ] Each SimVar group is its own `it`, and each fails under its own break.
- [ ] `GPS WP TRACK ANGLE ERROR`'s sign is asserted only in an `it` labeled characterization.
- [ ] The planner tests cover mirror, edit, direct-to, the MAP fence, an arc ahead and the arc itself, each biting.
- [ ] Pins `#126` (two) and `#NEW-5-1`, `#NEW-5-2`, each proven by a temporary fix, each with a passing sibling.
- [ ] Merged after task 3; additions to the two shared files are separate blocks at the end.
- [ ] Report written.

**Verify:** `npx vitest run test/render/SensorsOutSimVars.test.ts test/render/SensorsOut.test.ts test/render/services/WTFlightplanSync.test.ts test/render/services/ModeController.test.ts test/render/pages/left/SelfTestLeftPage.test.ts`
→ passes, the pins as expected failures.

**Steps:**

- [ ] **Step 1: the common setup** (contract: `CLAUDE.md` GPS SimVars, the wiki page panel.xml customization with its
  WriteGPSSimVars list; the units are the MSFS GPS SimVar definitions):

```ts
const {kaaa, abc, kbbb} = standardRoute(); const MAGVAR = 4;
const onLeg = pointBefore(kaaa, abc, 20); const legCourse = courseDeg(onLeg, abc);   // about 50.75 true
const p = pointFrom(onLeg, legCourse + 90, 1);                                      // 1 NM right of the leg
const unit = await bootUnit({facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]), position: p, magvar: MAGVAR});
await settle(unit);
await moveAircraft(unit, p, {groundspeedKt: 120, trackTrue: (legCourse + 10) % 360});
await vi.advanceTimersByTimeAsync(4000);   // the 16 Hz XTK filter converges on a constant input
```

- [ ] **Step 2: the values, one `it` per group** (`SensorsOutSimVars.test.ts`, a new `describe`):
    - Position, speed, track: `GPS POSITION LAT/LON` = `p` (1e-6); `GPS GROUND SPEED` 120 kt (61.7333 m/s);
      `GPS MAGVAR` 4°; `GPS GROUND TRUE TRACK` = legCourse + 10, `GPS GROUND MAGNETIC TRACK` = that - 4. Break:
      `Sensors.ts:382` LON written with lat.
    - Waypoint: `GPS WP DISTANCE` = `distanceNm(p, abc)` (0.01 NM, in meters); `GPS WP TRUE BEARING` = `courseDeg(p,
      abc)`, `GPS WP BEARING` = that - 4.
    - Deviation and scale: `GPS WP DESIRED TRACK` = `courseDeg(onLeg, abc) - 4` (radians), `GPS OBS VALUE` the same (LEG
      mode); `GPS WP CROSS TRK` -1852 m (1 NM right; the sign follows the SDK `GpsSynchronizer`, which writes the negated
      XTK, cited as the convention); `GPS CDI SCALING` 9260 m (5 NM, 3-3). Breaks: `Sensors.ts:296` `-xtk` → `xtk`; `:290`
      the scaling written in NM; `NavCalculator.ts:310` the DTK passed as true.
    - Timing: `GPS WP ETE` = `distanceNm(p, abc) / 120 * 3600` (±1 s); `GPS ETE` = `(distanceNm(p, abc) + distanceNm(abc,
      kbbb)) / 120 * 3600` (±1 s); `GPS WP ETA` and `GPS ETA` = `(Date.now() % 86400000) / 1000 +` the ETE (±1.5 s; the
      fake clock). Breaks: `:429` GPS ETA writes `ete`; `NavCalculator.ts:314` the destination ETE = the active ETE.
    - Flight plan: `GPS FLIGHT PLAN WP COUNT` 3, `WP INDEX` 2, `GPS WP PREV VALID` 1, `PREV ID` KAAA, `NEXT ID` ABC,
      `NEXT LAT` 47.5, `PREV LAT` 47.0, `GPS IS ACTIVE FLIGHT PLAN` 1, `GPS IS ACTIVE WAY POINT` 1. Break: `:438`
      `index + 1` → `index`.
    - Mode and vertical: `GPS IS APPROACH ACTIVE` 0, `GPS APPROACH MODE` 0, `GPS HAS GLIDEPATH` 0, `GPS GSI SCALING`,
      `GPS VERTICAL ANGLE`, `GPS VERTICAL ANGLE ERROR`, `GPS VERTICAL ERROR` 0 (wiki: set to 0); the last `K:GPS_OBS*` key
      event is `K:GPS_OBS_OFF`. Break: `:505` ENR_LEG mode `0` → `1`.
    - **Characterization** (title says so): `GPS WP TRACK ANGLE ERROR` is -10° for a track 10° right of the DTK. Break:
      `:335` the `diffAngle` arguments swapped.
    - Confirm every literal by running; write the derived values as literals or `geo.ts` expressions, never from the
      unit.

- [ ] **Step 3: after a sequence.** Same setup, `unit.props.memory.navPage.activeWaypoint.sequenceToNextWaypoint()`,
  1 s: `WP INDEX` 3, `PREV ID` ABC, `PREV LON` 8.9, `NEXT ID` KBBB, `NEXT LAT` 48.2. Break: `NavCalculator.ts:319` calls
  `setPrevWpt` only while the active index < 2.

- [ ] **Step 4: approach mode and the OBS key events** (contract: wiki External Annunciators, 0 off, 1 ARM, 2 ACTV, 3
  self-test; 6-1).
    - `ModeController.test.ts`, one `it` at the end, reusing its `armedNearFaf()` setup: in ARM `GPS APPROACH MODE` 1 and
      `GPS IS APPROACH ACTIVE` 1; after its `flyOn` (APR) 2 and 1. Breaks: `Sensors.ts:521` ARM writes 0; `:537` APR
      writes 1.
    - `SelfTestLeftPage.test.ts`, one `it` at the end: during the self-test `GPS APPROACH MODE` 3. Break: `:505` writes a
      plain 0.
    - OBS mode (`sim.set('Nav OBS:1', 'degrees', 51)`, `panel.obsMode()`, 2 s): the last `K:GPS_OBS*` is `K:GPS_OBS_ON`.
      With `LegObsSwitchInstalled` true: no `K:GPS_OBS*` event at all, while `GPS WP NEXT ID` is ABC (the outputs run).
      Breaks: `Sensors.ts:509` ON → OFF; `NavCalculator.ts:322` `writeObs` forced true.

- [ ] **Step 5: the gate** (`SensorsOut.test.ts`, a new `describe` at the end; contract: the wiki WriteGPSSimVars list).
  Panel.xml `<Output><WriteGPSSimVars>false</WriteGPSSimVars></Output>`, the step 1 setup. Sibling: ABC active,
  `L:KLN90B_HSI_TF_FLAGS` 1, the set of written names starting with `GPS ` minus `GPS WP CROSS TRK` and
  `GPS COURSE TO STEER` is empty, and no `K:GPS` key event. Breaks: delete the guard of `setPos` (`Sensors.ts:372-374`);
  delete the guard of `setMode` (`:493-495`). Pins, one per variable: `lastWrite('GPS COURSE TO STEER')` is undefined
  (`'… (#126)'`); `lastWrite('GPS WP CROSS TRK')` is undefined (`'… (#126)'`). Prove: a `writeGPSSimVars` guard before the
  course-to-steer write (`Sensors.ts:550`) turns the first red; a guard at the top of `setFilteredOutputs` (`:321`) the
  second. Read the existing #124 block first and keep the style.

- [ ] **Step 6: the planner** (`test/render/services/WTFlightplanSync.test.ts`; contract: CLAUDE.md, the planner id
  `"kln90b"` mirrored from FPL 0, and the wiki page Accessing the Flight Plan). Access as in `reboot.test.ts`:
  `FlightPlanner.getPlanner('kln90b', unit.core.bus, {} as FlightPlannerOptions)`; idents
  `[...plan.legs()].map(l => l.leg.fixIcaoStruct.ident)`.
    - **Mirror:** the standard route, booted 20 NM before ABC: `activePlanIndex` 0, no plan 1, idents
      `[KAAA, ABC, KBBB]`, the legs' lat/lon `[[47, 8], [47.5, 8.9], [48.2, 9.2]]`, `activeLateralLeg` 1. Breaks: remove
      the `activeWaypointChanged` subscription (`WTFlightplanSync.ts:25`); lat taken from lon (`:135`).
    - **Edit:** `insertLeg(unit, 2, intersection('XRAY', 47.2, 8.7))` (XRAY among the facilities), 1 s:
      `[KAAA, ABC, XRAY, KBBB]`. Break: remove the `flightplanChanged` subscription (`:24`).
    - **Direct-to off the plan:** `KLN90B_DCT_Push`, `enterIdent('L', 'XRAY')`, ENT, ENT, 2 s: `activePlanIndex` 1; plan 1
      legs are an IF at the present position with ident `''` and XRAY at 47.2/8.7, `activeLateralLeg` 1; plan 0 still
      `[KAAA, ABC, KBBB]`. Break: remove `setActivePlanIndex(1)` (`:108`).
    - **MAP fence** (wiki: the missed approach is not available before the MAP): the VOR 36 KDST world of
      `ActiveWaypoint.test.ts` (#41), aircraft at `pointFrom(vvv, 200, 3)`, `loadProcedure('APT 8')`, 2 s: the KLN FPL 0
      is `[ENRAA, IFAAA, VVV, MAPAA, VVV, KDST]` with active index 2, the planner `[ENRAA, IFAAA, VVV, MAPAA]` with active
      2. Two `sequenceToNextWaypoint()` and 1 s (active 4, the missed-approach VVV): all six legs, active 4. Break:
      remove the MAP `return` (`:142`).
    - **Arc ahead** (wiki: waypoints after an arc are not available): the arc world of `SensorsOutSimVars.test.ts` plus
      an enroute fix `ENRWP` at `at(270, 30)`, FPL 0 `[ENRWP, KPRC]`, aircraft at `at(270, 25)`, `loadProcedure('APT 8')`:
      KLN `[ENRWP, D270J, ARCEN, FAFAA, MAPAA, KPRC]` active 1, planner `[ENRWP, D270J]` active 1. Break: remove the
      arc-ahead `return` (`:148`). Without this case that branch is unheld.
    - **On the arc** (wiki: waypoints before an arc are not available): the existing arc setup on the arc at
      `at(225, 10)`: KLN `[D225J, ARCEN, FAFAA, MAPAA, KPRC]` active 1, planner `[ARCEN, FAFAA, MAPAA]` active 0; after one
      sequence the same legs, active 1. Break: `idxForWt -= wtPlan.length` → `- 1` (`:151`).
    - Confirm every literal by running; the observed values above come from the research.
    - **Pins (`#NEW-5-1`, `#NEW-5-2`):** with `WriteGPSSimVars` false, after the boot and `settle` the planner's plan 0
      has no legs (`#NEW-5-1`); after a sequence it still has none (`#NEW-5-2`). Today `[KAAA, ABC, KBBB]` (the
      `activeIdxChanged` path at `WTFlightplanSync.ts:58-60` is not gated, while `flightplanChanged` at `:50-56` is).
      Sibling: an FPL edit with the option off is not mirrored (passes today). Prove: `if (!writeGPSSimVars) return;` at
      the top of `activeIdxChanged`; both pins turn red.

- [ ] **Step 7: report** (per test: path, label, break; the pins with proofs).

```json:metadata
{"files": ["test/render/SensorsOutSimVars.test.ts", "test/render/SensorsOut.test.ts", "test/render/services/WTFlightplanSync.test.ts", "test/render/services/ModeController.test.ts", "test/render/pages/left/SelfTestLeftPage.test.ts"], "verifyCommand": "npx vitest run test/render/SensorsOutSimVars.test.ts test/render/SensorsOut.test.ts test/render/services/WTFlightplanSync.test.ts test/render/services/ModeController.test.ts test/render/pages/left/SelfTestLeftPage.test.ts", "acceptanceCriteria": ["SimVar groups one it each, each bites", "track angle error sign only as characterization", "planner mirror, edit, direct-to, MAP fence, arc ahead, on arc each bite", "#126 pins and #NEW-5-1/2 proven with siblings", "shared-file additions are separate end blocks", "report written"], "modelTier": "standard"}
```

---

### Task 6: waypoint and flight-plan formats

**Goal:** Unit and render tests of the stored V1 and V2 strings that no test holds today (FPL 25, only USER legs, the
missing facility and the 30-leg cut, SUP, grass, negative magvar, V2 longitudes of 100° or more, slot clearing, the
250th slot, the V1 NDB type, the conversion of every kind, `activeWaypoint` as V1), and the pin for the failed V2
restore.

**Files:**
- Create: `test/unit/settings/UserFlightplanLoaderV2.test.ts`
- Create: `test/unit/settings/UserFlightplanPersistor.test.ts`
- Modify: `test/unit/settings/UserFlightplanLoaderV1.test.ts`
- Modify: `test/unit/settings/UserWaypointV2.test.ts`
- Modify: `test/unit/settings/UserWaypointV1.test.ts`
- Modify: `test/unit/settings/UserWaypointPersistor.test.ts`
- Modify: `test/render/KLN90BCore.userDataConversion.test.ts`

**Acceptance Criteria:**
- [ ] Every expected string is a literal laid out by hand from the format (`docs/architecture.md` Core 7), never produced
      by the persistor or `savedFlightplan`.
- [ ] Each test fails under its own break; the slot-clearing test fails under the break that also flips the #103 pin.
- [ ] The V2 restore pin is `it.fails('… (#NEW-6-1)')`, proven by a temporary fix, with a passing sibling.
- [ ] Report written.

**Verify:** `npx vitest run test/unit/settings test/render/KLN90BCore.userDataConversion.test.ts` → passes, the pins as
expected failures.

**Steps:**

Start from `research-4-persistence-drafts\` (`DraftUserFlightplanV2.test.ts`, `DraftUserWaypoint.test.ts`,
`DraftKLN90BCore.persistence.test.ts`). Contract source for every test: `CLAUDE.md` (persisted user data) and
`docs/architecture.md` Core 7.

- [ ] **Step 1: the flight-plan scaffold** (unit). Own `EventBus`; `KLNFacilityRepository.getRepository(bus)`;
  `new KLNFacilityLoader(new MemoryFacilityClient([airport('KAAA', 47, 8), vor('ABC', 47.2, 8, {region: 'K1'}),
  ndb('XY', 47.3, 8.1, {region: 'K2'}), intersection('FIXA', 47.4, 8.2, {region: 'K1'})]) as unknown as
  ActualFacilityClient, repo)`; a user SUP `ICAO.value('U', 'XX', '', 'MYWPT')` added to the repo. `beforeEach`:
  `settings.getAllSettings().forEach(s => s.set(''))`. V2 leg literals (19 cells: type, region (2), airport (8), ident
  (8)): `'A          KAAA    '`, `'VK1        ABC     '`, `'NK2        XY      '`, `'WK1        FIXA    '`,
  `'UXX        MYWPT   '`.

- [ ] **Step 2: V2 flight plans.**
    - `fpl0` = all five kinds, `fpl25` = ABC + KAAA: FPL 0 legs `[type, region, ident]` exact, FPL 25 (index 25) `[ABC,
      KAAA]`, FPL 1 empty (`UserFlightplanLoaderV2.test.ts`). Break: `Array(26)` → `Array(25)` (`UserFlightplanLoaderV2.ts:18`).
    - Persisting FPL 25 with legs USER KAAA, APP ABC, USER XY, USER MYWPT stores `fpl25 === A_KAAA + N_XY + U_MYWPT`
      (`UserFlightplanPersistor.test.ts`). Break: `if (leg.type === KLNLegType.USER || true)`.
    - An empty plan stores `''` (set `fpl3` to a leg first so the change is visible).
    - Round trip with `userDataFormat` 2: FIXA + MYWPT → the `fpl0` literal → `restoreAllFlightplan` → the idents.
      Break: `valueToStringV2` → `valueToStringV1` in `serializeLeg`.
    - Missing facility: `fpl2 = A_KAAA + 'VK1        GONE    ' + V_ABC` → legs `[KAAA, ABC]` and
      `messageHandler.getMessages().map(m => m.message)` equals `[['WAYPOINT GONE DELETED']]`. Break: the catch in
      `Flightplanloader.ts` rethrows.
    - 31 stored legs: `fpl4 = A_KAAA.repeat(30) + V_ABC` → 30 legs, no ABC, messages `[['WAYPOINT ABC DELETED']]`. Break:
      `icaos.slice(0, 30)` → `slice(0, 31)`.
    - V1 `fpl24 = 'A      KAAA ' + 'VK1    ABC  ' + 'NK2    XY   ' + 'WK1    FIXA ' + 'UXX    MYWPT'` → FPL 25 with the five
      kinds, FPL 24 empty (`UserFlightplanLoaderV1.test.ts`). Break: `fpl${idx === 25 ? 0 : idx - 1}` in
      `UserFlightplanLoaderV1.ts`.

- [ ] **Step 3: waypoints** (extend `UserWaypointV2.test.ts`, `UserWaypointV1.test.ts`, `UserWaypointPersistor.test.ts`).
    - SUP V2: `sup('MYWPT', 47.5, 8.25)` → `'UXX        MYWPT   +4730.00+00815.00'`; restored: lat/lon,
      `userFacilityType === UserFacilityType.LAT_LONG`, `isTemporary === false`. SUP V1: `'UXX    MYWPT+4730.00+00815.00'`,
      the same assertions. Break: V2 loader line 75 `deserializeSupplementary` → `deserializeIntersection` (only the type
      assertions catch it).
    - Grass V2: APT 1400 ft, 2500 ft grass → `'AXX        UAPT    +4700.00+00800.00+01400+02500S'`, restored grass, 2500 ft;
      V1 `'AXX    UAPT +4700.00+00800.00+01400+02500S'` → grass. Breaks: persistor `return "S"` → `"H"`; V2:299 and V1:292
      `Grass` → `Asphalt`.
    - Negative VOR magvar: `magneticVariation: -5` → `'VXX        ABC     +4730.00+00854.00+108.00-05'`, restored -5. Break:
      `format(Math.abs(wpt.magneticVariation), "+00")`.
    - V2 longitude of 100° or more: NDB at 35.25/139.75, 1700 kHz → `'NXX        XY      +3515.00+13945.00+1700.0'`;
      restore `'NXX        XY      +3515.00-13945.00+1700.0'` → lon -139.75, freq 1700. Break:
      `UserWaypointLoaderV2.ts:282` `substring(28, 31)` → `substring(29, 31)`.
    - Slot clearing (`UserWaypointPersistor.test.ts`): add ONE and TWO, remove TWO → `wpt0` is ONE's literal, `wpt1 ===
      ''`. Break: comment out `setting.set("")` in `persistAllWaypoints`; this also flips the #103 pin to passing, so the
      new test is what holds the clearing.
    - The 250th slot: after adding `W0..W249`, `wpt249 === 'UXX        W249    +4700.00+00800.00'` (choose coordinates
      that give this literal). Break: `MAX_USER_WAYPOINTS = 249`.
    - V1 NDB: `'NXX    XY   +4800.00-00915.00+0345.0'` → lat 48, lon -9.25, freq 345, `type === NdbType.H`. Break: V1
      line 71 `deserializeNdb` → `deserializeVor` (survives without the type assertion).
    - V1 unknown runway: `'AXX    UAPU +4700.00+00800.00-00001-00033-'` → altitude -1, the length a literal like V2's
      (`toBeCloseTo(-10.0584, 4)`), `WrightFlyerTrack`.

- [ ] **Step 4: the conversion and `activeWaypoint`** (render, `KLN90BCore.userDataConversion.test.ts`).
    - `bootUnit({facilities: [airport('KAAA', 47, 8), vor('ABC', 47.2, 8, {region: 'K1'}), ndb('XY', 47.3, 8.1, {region:
      'K2'})], storage: {wpt0: 'AXX    UAPT +4700.00-00830.00+01400+03200H', wpt1: 'VXX    UVOR +4730.00+00854.00+114.30-02',
      wpt2: 'NXX    UNDB +4800.00-00915.00+0345.0', wpt3: 'WXX    UINT +4730.00-00815.50', wpt4:
      'UXX    MYWPT+4730.00+00815.00', fpl24: 'A      KAAA ' + 'UXX    MYWPT' + 'NK2    XY   '}})` → `wpt0..4` =
      `'AXX        UAPT    +4700.00-00830.00+01400+03200H'`, `'VXX        UVOR    +4730.00+00854.00+114.30-02'`,
      `'NXX        UNDB    +4800.00-00915.00+0345.0'`, `'WXX        UINT    +4730.00-00815.50'`,
      `'UXX        MYWPT   +4730.00+00815.00'`; `fpl25` = `'A          KAAA    UXX        MYWPT   NK2        XY      '`;
      `fpl24` = `''`. Read them with `storedSetting`. Break: the fpl24 break of step 2.
    - `activeWaypoint` read as V1: `bootUnit({facilities: [vor('ABC', 47.2, 8, {region: 'K1'})], storage: {activeWaypoint:
      'VK1    ABC  '}})` → `rightName() === 'VOR  '` and an exact row 0 with ABC. Break: `KLN90BCore.ts:281` passes
      `ICAO.stringV2ToValue(lastActiveIcao)`.
    - `activeWaypoint` written as V1: `savedFlightplan(0, [kaaa, abc])`, position 47.1/8, `settle` →
      `storedSetting(unit, 'activeWaypoint') === 'VK1    ABC  '`. Break: `ActiveWaypoint.ts:267` `valueToStringV1` →
      `valueToStringV2`.

- [ ] **Step 5: pin the failed V2 restore (`#NEW-6-1`)** (render, same file; contract: Core 7 and the maintainer's
  ruling that a failed restore wipes the corrupt data once, as the V1 conversion does). `storage: {userDataFormat: 2,
  wpt0: 'QXX        BAD     +4700.00+00800.00', fpl1: 'A          KAAA    '}` with KAAA among the facilities (the
  unknown type `Q` makes the V2 loader throw `Unsupported facility type`). Sibling: the MSG page shows `USER DATA LOST`
  (read the MSG page rows) and `unit.consoleErrors` holds what it holds today (assert it exactly). Pin: after the boot and
  1 s, `storedSetting(unit, 'wpt0') === ''` and `storedSetting(unit, 'fpl1') === ''`. Today both keep their values.
  Prove: in `KLN90BCore.ts` run the persist block of the conversion also when `!restoreSuccessFull`; the pin turns red.
  Check whether `savedFlightplan` already sets `userDataFormat`; write the storage by hand here.

- [ ] **Step 6: report.**

```json:metadata
{"files": ["test/unit/settings/UserFlightplanLoaderV2.test.ts", "test/unit/settings/UserFlightplanPersistor.test.ts", "test/unit/settings/UserFlightplanLoaderV1.test.ts", "test/unit/settings/UserWaypointV2.test.ts", "test/unit/settings/UserWaypointV1.test.ts", "test/unit/settings/UserWaypointPersistor.test.ts", "test/render/KLN90BCore.userDataConversion.test.ts"], "verifyCommand": "npx vitest run test/unit/settings test/render/KLN90BCore.userDataConversion.test.ts", "acceptanceCriteria": ["literals laid out by hand", "each format test bites, slot clearing held directly", "V2 restore pin proven with sibling", "report written"], "modelTier": "standard"}
```

---

### Task 7: remarks and the setting keys

**Goal:** Tests of the remark format, the APT 5 and OTH 4 pages, an exact pin of every stored key and default, and
pins for #92, the 3-character ident and #89.

**Files:**
- Create: `test/unit/settings/RemarksManager.test.ts`
- Create: `test/render/pages/right/Apt5Page.test.ts`
- Create: `test/unit/settings/KLN90BUserSettingsSaverManager.test.ts`
- Create: `test/render/pages/left/Set5Page.test.ts`

**Acceptance Criteria:**
- [ ] The remark save, load and page tests each fail under their breaks.
- [ ] The key pin lists every key and default as literals (the `wpt`, `fpl` and `rmk` slots from loops over the
      documented ranges) and fails when a default changes, when a key is renamed consistently, and when the remarks are
      dropped from the save manager.
- [ ] Pins `#92` (two), `#NEW-7-1` and `#89`, each proven by a temporary fix, each with a passing sibling.
- [ ] Report written.

**Verify:** `npx vitest run test/unit/settings/RemarksManager.test.ts test/render/pages/right/Apt5Page.test.ts test/unit/settings/KLN90BUserSettingsSaverManager.test.ts test/render/pages/left/Set5Page.test.ts`
→ passes, the pins as expected failures.

**Steps:**

Start from `research-4-persistence-drafts\` (`DraftRemarksManager.test.ts`, `DraftApt5Page.test.ts`,
`DraftKLN90BUserSettings.test.ts`, `DraftSet5Page.test.ts`; drop its `console.warn` dump).

- [ ] **Step 1: remarks** (unit; contract: Core 7, ident 4 cells plus three lines of 11, slots `rmk0..rmk9`; 3-47 for
  the page behavior).
    - `saveRemarks('KAAA', ['FUEL 100LL ', 'CTAF 122.8 ', '           '])` → `rmk0 ===
      'KAAAFUEL 100LL CTAF 122.8            '`. Break: `set(joinedText + ident)`.
    - Load hand-written `rmk0 = 'KBBBLINE ONE   LINE TWO   LINE THREE '`, `rmk1 = 'KAAAA          B          C          '`
      → `getRemarks('KBBB')` the three lines, `getAirportsWithRemarks()` `['KAAA', 'KBBB']`, an unknown airport three
      11-space lines. Break: `/.{1,11}/g` → `/.{1,12}/g`.
    - **Pins #92:** delete then a new `RemarksManager` lists `[]` (today `['KAAA']`); 11 airports saved, a new manager
      lists 11 (today `saveRemarks` throws `Could not find setting with name rmk10`). Siblings: the save test above.
      Prove: clear the trailing slots in `saveAllRemarks` and raise `NUM_REMARKS` to 100 (3-47 allows 100); both turn red.
    - **Pin `#NEW-7-1`:** `saveRemarks('ABC', ['LINE ONE   ', 'LINE TWO   ', 'LINE THREE '])`, a new manager →
      `getAirportsWithRemarks()` `['ABC']` and the three lines. Today `['ABCL']`, the lines shifted
      (`RemarksManager.ts:63` reads `substring(0, 4)`, the save writes the ident unpadded at `:74`). Prove: save
      `ident.padEnd(4, ' ')` and load with `.trim()`.

- [ ] **Step 2: APT 5 and OTH 4** (render, `Apt5Page.test.ts`; 3-47). KAAA the only airport, position 47/8.
    - Entry: APT 5, right cursor, outer knob until the first remark line is focused (`cursorTo` or `focused('R')`),
      `panel.type('R', 'FUEL')`, ENT, cursor off → `storedSetting(unit, 'rmk0') === 'KAAA' + 'FUEL       ' + ' '.repeat(22)`,
      row 2 `'FUEL       '`, no errors.
    - Display: `storage: {rmk0: 'KAAAFUEL       CTAF       X          '}` → APT 5 rows 2..4 `['FUEL       ',
      'CTAF       ', 'X          ']`; left OTH 4 rows 0..1 `['APTS W/RMKS', 'KAAA       ']`.
    - Breaks: the save break and the load break of step 1.

- [ ] **Step 3: every stored key** (unit, `KLN90BUserSettingsSaverManager.test.ts`; contract: CLAUDE.md, setting keys
  are never renamed or repurposed). `simEnv().storage.data.clear()`, then
  `new KLN90BSettingSaveManager(bus, new KLN90BUserSettings(bus)).save('KLN TEST.profile_1')` (autosave never stores a
  default, so a boot cannot list them). `Object.fromEntries(simEnv().storage.data)` equals a literal map: keys
  `persistent-setting.KLN TEST.profile_1.<name>`, values `JSON.stringify(default)`: welcome1..welcome4 23 spaces;
  powercycles 0; totalTime 0; timezone 0; barounit true; barosetting 29.92; lastLatitude 0; lastLongitude 0;
  lastAlmanacDownload 0; nearestAptSurface true; nearestAptMinRunwayLength 1000; activeWaypoint ''; airspaceAlertEnabled
  true; airspaceAlertBuffer 500; altAlertVolume 99; htAboveAptEnabled false; htAboveAptOffset 800; turnAnticipation true;
  nav5MapOrientation 0; nav5MapRange 40; superNav5MapOrientation 0; superNav5MapRange 40; superNav5Field1 0;
  superNav5Field2 0; superNav5Field3 0; superNav5Vor 0; superNav5Ndb false; superNav5Apt false; flightTimer false;
  fastGpsAcquisition true; cal12IndicatedAltitude 0; cal12Barometer 0; cal1SAT 0; cal2Cas 0; cal2TAT 0; cal3Tas 0;
  cal3HeadingMag 0; cal4GS 0; cal4Fpm 0; cal4Angle 0; cal5TempC 0; cal5TempF 32; cal5SpeedKt 0; cal5SpeedMph 0;
  userDataFormat 0; plus `wpt0..wpt249`, `fpl0..fpl25`, `rmk0..rmk9`, each `'""'`, built with loops. Confirm every default
  against `KLN90BUserSettings.ts` by reading it, not by printing the save. Breaks: `htAboveAptOffset` 800 → 900; drop
  `klnUserRemarks` from the concat in `KLN90BUserSettingsSaverManager.ts`; rename `airspaceAlertBuffer` consistently in
  the definition and its users. When #92 is fixed with more remark slots, this pin changes on purpose (say so in a
  comment).

- [ ] **Step 4: pin #89** (render, `Set5Page.test.ts`; 3-58 for the HT ABOVE APT setting, contract: setting keys are
  never repurposed). `selectPage('L', 'SET 5')`, then with the left cursor: cursor on, inner +1 (ON), outer +1, inner
  +2 (the screen shows `+1000ft`), cursor off, advance 1 s. Sibling: left row 5 is `'  +1000ft  '` and
  `storedSetting(unit, 'htAboveAptEnabled') === true`. Pin: `storedSetting(unit, 'htAboveAptOffset') === 1000` and
  `storedSetting(unit, 'airspaceAlertBuffer')` is undefined. Today the offset lands under `airspaceAlertBuffer`
  (`Set5Page.tsx:97`). Prove: change `Set5Page.tsx:97` to `htAboveAptOffset`; the pin turns red. Confirm the knob
  sequence and the page citation by running and against the page index.

- [ ] **Step 5: report.**

```json:metadata
{"files": ["test/unit/settings/RemarksManager.test.ts", "test/render/pages/right/Apt5Page.test.ts", "test/unit/settings/KLN90BUserSettingsSaverManager.test.ts", "test/render/pages/left/Set5Page.test.ts"], "verifyCommand": "npx vitest run test/unit/settings/RemarksManager.test.ts test/render/pages/right/Apt5Page.test.ts test/unit/settings/KLN90BUserSettingsSaverManager.test.ts test/render/pages/left/Set5Page.test.ts", "acceptanceCriteria": ["remark save, load, APT 5 and OTH 4 tests bite", "exact key pin bites on default change, consistent rename and dropped remarks", "#92 (two), #NEW-7-1 and #89 pins proven with siblings", "report written"], "modelTier": "standard"}
```

---

### Task 8: issues and close-out

**Goal:** File the issues, comment on #100, #101 and #133, replace the placeholders, correct the comments, update
`testing.md` and write the session log.

**Files:**
- Modify: test files containing `#NEW-` placeholders
- Modify: `kln90b/LVars.ts` (comments only)
- Modify: `test/render/Sensors.test.ts`, `test/flight/flights/hsiToFromFlags.test.ts` (comments only)
- Modify: `docs/test-coverage.md` (section 3 checkbox, section 4 log)
- Modify: `docs/testing.md`

**Acceptance Criteria:**
- [ ] Filed after a search of open and closed issues with several wordings: the ten bugs of step 1 and the enhancement of step 2,
      plus any further bug the reports or reviews confirmed; the placeholder-ident finding filed or logged.
- [ ] #100, #101 and #133 have their comments.
- [ ] `grep -r "#NEW-" test/` finds nothing.
- [ ] The comment fixes are in, and `git diff` on `kln90b/` shows comment lines only.
- [ ] The session log has: done, rulings, bugs filed, fixes not re-broken, not covered (rule 18), the wiki corrections,
      coverage at start and end, suite totals.
- [ ] `npm test`, `npx tsc --noEmit` and `npm run coverage` are clean.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [ ] **Step 1: file the bugs** (`bug` label). For each: what is wrong, a reproduction with observed and expected values,
  file and line, impact, a suggested fix, the pin's test name. Cite manual and wiki pages, never copy manual text. Mark
  code-read findings as not reproduced in the sim.
    - The `L:KLN90B_*` outputs keep their last value at power-off (roll, HSI flag, MSG, WPT, annunciator test;
      `SensorsOut.reset`, `Sensors.ts:566-596`; Installation Manual 2-69). Not for Disabled (`61f6b61`).
    - An ElectricitySimVar with a prefix and no index never powers the unit (`KLN90BPlaneSettings.ts:97-99`,
      `SimVarSync.ts:31-35`).
    - Toggling WriteGpsSimvars while disabled sets `GPS OVERRIDDEN` (`SimVarSync.ts:53-56`).
    - H events are processed while the unit is disabled (`KLN90BCore.onInteractionEvent`; Hot Swapping wiki).
    - ApprArm cannot disarm within 30 NM (`ModeController.ts:49-52, 233-237, 310`; 6-1, B-1). Note the secondary
      observation: arming by the switch within 30 NM sets the scale at once instead of the 30 s ramp (6-1, 6-3), untested.
    - The remarks of an airport with a 3-character ident are corrupted after a reload (`RemarksManager.ts:63, 74`). Say
      whether an ident can exceed 4 characters (unchecked).
    - `Output.AltitudeAlertEnabled` defaults to true; the samples show false (`KLN90BPlaneSettings.ts:86`).
    - The `"kln90b"` planner is written while `WriteGPSSimVars` is off (`WTFlightplanSync.ts:50-60`).
    - Roll steering is output without a heading input (`RollSteeringController.ts`; Installation Manual 2-69). References
      #100.
    - A failed V2 restore keeps the corrupt data, so `USER DATA LOST` shows on every boot and the data is wiped piecemeal
      later (`KLN90BCore.ts:254-308`, `UserWaypointLoaderV2.ts:40-60`). Suggested fix: persist the empty state as the V1
      conversion does; mention restoring the valid records only as an alternative.
- [ ] **Step 2: file the enhancement** (`enhancement` label): an invalid panel.xml value (a non-numeric number, a boolean
  other than `true`, an unknown enum value) should not load, and the unit should show a highly visible error so the
  aircraft developer notices it (`KLN90BPlaneSettings.getOption`).
- [ ] **Step 3: the placeholder ident.** `VolatileMemory.ts:279, 297` store `"0   "` (4 cells) for an empty INT or SUP
  list in a 5-cell selector, which gives a cursor position that focuses nothing. Check the manual's empty SUP page and the
  issues; file a bug if the unit differs from the manual, otherwise record it in the log.
- [ ] **Step 4: comments.** #100: the new heading-input issue (its rework should use the heading input), and the
  wrong-way bank 5 NM left of the leg on a parallel track (roll +25, `GPS COURSE TO STEER` DTK + 250; the signed
  `xtk < 0.1` test in `RollSteeringController.ts`). #101: data converted at the first boot stays wrong after the fix,
  because the conversion saves it as V2. #133: `KLN90B_ApprArm_Push` arms and disarms with `AppArmSwitchInstalled` false,
  and the unit arms on its own at 30 NM; the External Annunciators wiki says the event requires the key.
- [ ] **Step 5: replace the placeholders** in one commit (`references #NN …` per issue in the message).
- [ ] **Step 6: comment fixes.** `kln90b/LVars.ts`: the `L:KLN90B_HSI_TF_FLAGS` values (0 flagged, 1 TO, 2 FROM) and that
  `H:KLN90B_Power_On` and `H:KLN90B_Power_Off` set `L:KLN90B_Power` too. The comments in `test/render/Sensors.test.ts`
  (around line 5) and `test/flight/flights/hsiToFromFlags.test.ts` (around line 13) that say `LVars.ts` documents the
  values become true with that change; reword them if they still overstate. Comments only.
- [ ] **Step 7: `testing.md`.** Section 6: key events have no effect in `FakeSim`; `sim.writes` names are upper case.
  Section 4 or 6: unit tests of the parser and the key pin reset `FakeSim` and `FakeStorage` themselves. Section 7: what
  the reports found as next steps.
- [ ] **Step 8: the session log** in `docs/test-coverage.md` section 4 (newest first), and tick Session 4's checkbox. Done
  per task; the maintainer's rulings; bugs filed; fixes not re-broken; not covered (from the spec: ApprArm in APR and the
  OBS modes, the MSG light steady for a persistent message, the doubled tick rate held only jointly, `XY` waypoints
  through storage, the 10-message cap, `GPS COURSE TO STEER`'s value, the XTK filter dynamics, the BasePath effect, the
  key effects owned by other sessions; plus what the reports add); the wiki corrections for the maintainer (the
  `AltitudeAlertEnabled` default once fixed, `GPS OBS ACTIVE` via `K:GPS_OBS_ON/OFF` and only without
  `LegObsSwitchInstalled`, ObsTarget only while `GPS DRIVES NAV1`, the MSG light LVar flashes by itself, the HSI flag
  values, the Accessing the Flight Plan sample code, the ElectricitySimVar index syntax); the coverage table at the start
  (identical to Session 3b's end) and at the end; the suite totals.
- [ ] **Step 9: run the checks and commit.**

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md", "kln90b/LVars.ts", "test/render/Sensors.test.ts", "test/flight/flights/hsiToFromFlags.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["ten bugs and the enhancement filed after duplicate search", "placeholder-ident finding filed or logged", "#100, #101, #133 comments added", "no #NEW- placeholders", "comment-only changes in kln90b", "session log complete", "checks clean"], "modelTier": "frontier"}
```
