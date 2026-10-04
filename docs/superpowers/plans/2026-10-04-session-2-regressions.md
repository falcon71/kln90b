# Session 2 regression tests: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A regression test for every *testable* unit and render row of the triage table in `docs/test-coverage.md`
section 5. Each test is proven to bite on its original bug, preceded by a harness extension that allows one unit per
test.

**Architecture:**
- **Task 1** makes `bootUnit` tear its unit down at the end of each test, so that one file can hold many boots.
- **Tasks 2 to 6** are five parallel batches. Each runs in its own git worktree and writes one commit per triage row.
- **Task 7** files the bugs found, fills in the issue numbers, ticks the table and closes the session.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest 5 (unit in Node; render in happy-dom), `@microsoft/msfs-sdk` 2.3.3, the headless
harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-04-session-2-regressions-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task.
- **Branches.** The session branch is `tests-session-2-regressions`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **No behavior changes** in `kln90b/` (rule 12). The only exceptions are the testability seams that rule 12 names,
  and the commit message names each one.
- **Test names** carry the issue or commit: `'… (#36)'` or `'… (e09cc67)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23). An existing open issue is pinned with its own number, `(#101)`.
- **Spec or characterization.**
    - A spec test cites the Pilot's Guide page, or another source `CLAUDE.md` allows, in a comment.
    - A characterization test has `characterization` in its `describe` or `it` title and no manual citation.
    - The page index is in Claude's local memory, `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\pilots-guide-index.md`.
      Cite page numbers and never copy manual text.
- **Expected values** are literals derived independently of the code under test: laid out by hand from the format, or
  computed with `test/harness/flight/geo.ts` or by hand. Never take them from the function under test.
- **Assertions.** No permissive assertions (rule 17). Assert parsed state or exact screen rows, not substrings of the
  whole screen.
- **Proof per row (rule 10).**
    1. Reintroduce the original bug by hand in the working tree.
    2. Run the test and see it fail.
    3. Restore the code and check that `git diff` shows only the test.
    4. Put the proof in the commit message in one line, for example `Proof: fails when Apt3UserPage checks length === -10`.
    - Never commit the broken state.
    - A fix that cannot be re-broken is reported as "not provable" with the reason.
- **Commits.** One commit per row, with a message that names the row (`references #36 …` or `Regression test for
  e09cc67 …`), then the proof line, then `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **What implementers leave alone (rule 22):** `docs/test-coverage.md`, GitHub issues, and other batches' rows.
- **Copyright.** Never commit manual text or navdata recorded from the sim. Facilities are invented (`KAAA`, `ABC`).

**User decisions (already made):**
- "All 58 rows, parallel batches."
- "Harness extension first", approach A: teardown in place.
- "Create five tasks for the main jobs which will then run in parallel. They can commit per row."
- "Once the tasks are done, you dispatch a review agent for the commits of the tasks as the subagent driven workflow
  dictates. You do not run the reviews yourself."
- "Filing issues becomes another task, just as the close out at the end."
- Pin placeholders `#NEW-<task>-<n>`, filled at close-out.
- The workflow rules apply to every session, in section 2 of `test-coverage.md`.
- "Implementation starts with Sonnet." The controlling session chooses the reviewer model (Sonnet or Opus) per task by
  its complexity. An implementer that struggles is re-dispatched on Opus.

---

## Facts every batch needs (from the research pass, verified by reading code)

Every render test uses these.

**Boot and front panel**
- `const unit = await bootUnit({...})` boots the unit. After task 1, each `it` may boot its own unit, and task 1 adds
  `unit.panel` (a `FrontPanel`).
- `unit.errors` collects errors that ticks and synchronous H-event handling publish on the `error` bus.

**ENT errors are invisible.** `MainPage` calls `handleEnter()` without awaiting it (`MainPage.tsx:540`, `709-724`).
A throw on the ENT path becomes an unhandled rejection and never reaches `unit.errors`. Vitest reports it and fails
the run, but the test itself can pass. Every ENT path therefore also asserts a visible effect: a page name or model
state.

**Render tests do not fail on `console.error`.** Use `vi.spyOn(console, 'error')` when that is the signal.

**DCT at boot has no suggestion.**
- The boot right page is SUP with no facility, so DCT from NAV 2 opens a blank DIR page and no confirmation page
  (`DirectToPage.tsx:150-154`).
- To get a suggestion and a pushed confirmation page, press DCT from FPL 0 with the left cursor on a leg.

**`FrontPanel.enterIdent`**
- It works on `WaypointEditor` fields (FPL, REF, DCT).
- It does **not** work on the ident selectors of the APT, VOR, NDB, INT and SUP pages: only one cell is highlighted
  there, and the call throws.
- Type into those selectors with keyboard events instead: `unit.send('KLN90B_Internal_Key:RIGHT:Z')`, then advance
  250 ms. The side's cursor must be on, and the cursor advances one field after each key.

**`selectPage` and page names**
- `selectPage` stops at the first page whose name matches. Do not use it to test page names.
- While a cursor is on, the status line shows `CRSR` and `leftName()`/`rightName()` are shifted by one cell. Read the
  names with both cursors off, or read `row(6)`.

**Bus subscriptions replay the last value.** A `bus.getSubscriber().on(topic).handle()` added after boot is called once
at once with the cached value (for example `powerEvent {isPowered: true}`).

**Timing**
- Display ticks run every 250 ms, and `blink` is true one tick in four. Calculation ticks run once per second.
- The GPS is valid within about 12 s of boot. Until then the FPL does not activate. Wait for it:

  ```ts
  for (let i = 0; i < 120 && !unit.props.sensors.in.gps.isValid(); i++) await vi.advanceTimersByTimeAsync(1000);
  await vi.advanceTimersByTimeAsync(2000);
  ```

**SET 2 overflows.** With the default timezone (`"CORD UNIV/Z "`, 12 characters), SET 2 cannot be read: `Screen.read()`
throws. Any test whose page path passes SET 2 boots with `storage: {timezone: 1}`. Task 5 pins the bug.

**Unit stage**
- Unit tests run in Node: there is no fake clock, `DOMParser` or `document`. Add `// @vitest-environment happy-dom`
  at the top of a unit file that needs `DOMParser`.
- Promises resolve on real timers, so a plain `await` is enough.

**Active waypoint API.** `const aw = unit.props.memory.navPage.activeWaypoint` offers `getActiveWpt()`,
`getActiveLeg()`, `getActiveFplIdx()` (-1 for none or a random direct-to), `isDctNavigation()` and `getFromWpt()`. FPL
0 is `unit.props.memory.fplPage.flightplans[0].getLegs()`.

**FPL 0 page**
- Navigation: `outer('L', -1)` from NAV 2.
- Cursor: it starts on leg 0, and `outer('L', n)` moves to leg n.
- Deleting a leg: `clr()` shows `DEL <ident> ?`, then `ent()`. CLR with the cursor off asks to delete the whole plan,
  so never do that.
- Row text: an arrow, the leg number padded to 2, `:`, then the 5-character ident. The arrows are `À` for the active
  leg, `Á` for FROM, `›` for the direct-to target, and a blank otherwise. Leg i is on row i+1.

**User waypoint strings (V2).**
- Layout: a 19-character ICAO (`type` + `XX` + 8 blanks + the ident padded to 8), then `±DDMM.mm` and `±DDDMM.mm`.
- Examples: `'WXX        USRA    +4730.00-00815.50'`, `'VXX        ABC     +4730.00+00854.00+114.30+02'`,
  `'AXX        UAPT    +4700.00+00800.00-00001-00033-'`.
- Seed them with `storage: {userDataFormat: 2, wpt0: '…', wpt1: '…'}`.

---

### Task 1: one unit per test (harness)

**Goal:** `bootUnit` may be called once per test, and the unit is torn down when the test ends. A second boot in the
same file sees nothing of the first. Also add the missing `ApproachType` global that task 3 needs.

**Files:**
- Create: `test/harness/singletons.ts`
- Create: `test/render/harness/reboot.test.ts`
- Create: `test/unit/harness/singletons.test.ts`
- Modify:
    - `test/harness/boot.ts` (guard, teardown, `panel`)
    - `test/harness/sim/FakeSim.ts`, `test/harness/sim/FakeStorage.ts`, `test/harness/sim/FakeCoherent.ts` (`reset()`)
    - `test/harness/sim/staticGlobals.ts` (`ApproachType`)
    - `test/flight/harness/boot.test.ts`
    - `test/flight/flights/turnDirection.test.ts` (comment only)
- Modify docs:
    - `docs/testing.md`: section 3 "Isolation and time", section 6 "One unit per test file.", section 7, and the
      sentences in sections 3 and 4 that say "one unit per test file"
    - `docs/architecture.md`: Core 10, the "Global and singleton state" bullet
    - `docs/test-coverage.md`: rule 9 ("One headless unit per test file" becomes "One headless unit per test")

**Acceptance Criteria:**
- [ ] Two tests in `reboot.test.ts` each boot a unit. The second sees an empty repository, an empty FPL 0, no remarks,
  a new `FlightPlanner` and no SimVar writes, stored data or Coherent calls of the first. None of the first unit's
  ticks run after teardown.
- [ ] `clearStatic` throws when the named static field does not exist (`singletons.test.ts`).
- [ ] Each assertion in `reboot.test.ts` was seen to fail with its teardown step disabled. Note in the commit message
  which steps need a combined break (see Step 6).
- [ ] `bootUnit` called twice in one test rejects with `/one unit per test/`; called outside a test, it throws a
  message that says so.
- [ ] `globalThis.ApproachType` exists with the values of `@microsoft/msfs-types/js/simplane.d.ts`.
- [ ] `npm test` and `npx tsc --noEmit` are clean, and the docs no longer say "one unit per test file".

**Verify:** `npx vitest run test/render/harness/reboot.test.ts test/unit/harness/singletons.test.ts test/flight/harness/boot.test.ts`
→ all pass. Then `npm test` → all pass, and `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Write the failing harness tests**

`test/unit/harness/singletons.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {clearStatic} from '../../harness/singletons';

describe('singleton reset (harness)', () => {
    it('clears a static field', () => {
        class Owner {
            public static INSTANCE: object | undefined = {};
        }
        clearStatic(Owner, 'INSTANCE', true);
        expect(Owner.INSTANCE).toBeUndefined();
    });

    it('throws when a required field does not exist, so a renamed singleton fails loudly', () => {
        class Owner {
            public static RENAMED: object | undefined = {};
        }
        expect(() => clearStatic(Owner, 'INSTANCE', true)).toThrow(/Owner\.INSTANCE does not exist/);
    });

    it('skips a missing field that was never created', () => {
        class Owner {
        }
        expect(() => clearStatic(Owner, 'INSTANCE', false)).not.toThrow();
    });
});
```

`test/render/harness/reboot.test.ts`:

```ts
import {describe, expect, it, vi} from 'vitest';
import {Facility, FlightPlanner, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {simEnv} from '../../harness/sim/install';
import {airport} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);
let first: HeadlessUnit;
let firstPlanner: FlightPlanner;

/** The two tests run in order: the second checks that the teardown after the first left nothing behind. */
describe('one unit per test (harness)', () => {
    it('boots a unit with user data, remarks and a flight plan', async () => {
        first = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.2, lon: 8.0},
            storage: {...savedFlightplan(0, [kaaa, kbbb]), wpt0: 'WXX        USRA    +4730.00+00815.50'},
        });
        first.props.remarksManager.saveRemarks('KAAA', ['REMARK ONE ', '           ', '           ']);
        firstPlanner = FlightPlanner.getPlanner('kln90b', first.core.bus);

        expect(first.props.facilityRepository.get(ICAO.value('W', 'XX', '', 'USRA'))!.icaoStruct.ident).toBe('USRA');
        expect(first.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'KBBB']);
        expect(first.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA']);
    });

    it('gives the next test a unit that sees nothing of the first', async () => {
        const env = simEnv();
        // Teardown ran when the first test ended
        expect(document.getElementById('pageContainer')).toBeNull();
        expect(env.sim.writes).toEqual([]);
        expect(env.sim.has('PLANE LATITUDE')).toBe(false);
        expect(env.storage.data.size).toBe(0);
        expect(env.coherent.calls).toEqual([]);

        const oldTick = vi.spyOn(first.props.messageHandler, 'tick');
        const second = await bootUnit({facilities: [kaaa], position: {lat: 47.0, lon: 8.0}});
        await vi.advanceTimersByTimeAsync(5_000);

        expect(oldTick).not.toHaveBeenCalled();
        const userWaypoints: Facility[] = [];
        second.props.facilityRepository.forEach(f => userWaypoints.push(f));
        expect(userWaypoints).toEqual([]);
        expect(second.props.facilityRepository).not.toBe(first.props.facilityRepository);
        expect(second.props.memory.fplPage.flightplans[0].getLegs()).toEqual([]);
        expect(second.props.remarksManager.getAirportsWithRemarks()).toEqual([]);
        expect(FlightPlanner.getPlanner('kln90b', second.core.bus)).not.toBe(firstPlanner);
        expect(second.errors).toEqual([]);
    });
});
```

In `test/flight/harness/boot.test.ts`, replace the second test with:

```ts
    it('allows only one live unit per test', async () => {
        await bootUnit();
        await expect(bootUnit()).rejects.toThrow(/one unit per test/);
    });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run test/render/harness/reboot.test.ts test/unit/harness/singletons.test.ts`

Expected: FAIL. `singletons.ts` does not exist, and the second `bootUnit` throws "one unit per test file".

- [ ] **Step 3: Add `reset()` to the fakes**

In `FakeSim` (keep `registrations` and `registrationIds`: SDK objects cache the ids returned by
`SimVar.GetRegisteredId`):

```ts
    /** Back to an empty sim for the next unit. Keeps the registration ids, because SDK objects cache them. */
    public reset(): void {
        this.writes.length = 0;
        this.keyEvents.length = 0;
        this.unsetReads.clear();
        this.errors.length = 0;
        this.gameVars.clear();
        this.values.clear();
        this.simStartMs = 0;
    }
```

In `FakeStorage`:

```ts
    public reset(): void {
        this.data.clear();
    }
```

In `FakeCoherent`:

```ts
    public reset(): void {
        this.calls.length = 0;
        this.replies.clear();
    }
```

- [ ] **Step 4: Create `test/harness/singletons.ts`**

```ts
import {FlightPlanner} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserWaypointsSettings} from '../../kln90b/settings/KLN90BUserWaypoints';
import {KLN90BUserFlightplansSettings} from '../../kln90b/settings/KLN90BUserFlightplans';
import {KLN90BUserRemarkSettings} from '../../kln90b/settings/KLN90BUserRemarkSettings';

/**
 * Sets a private static singleton field back to undefined. A required field that does not exist throws, so a renamed
 * singleton fails here instead of leaking into the next unit. With TypeScript's class fields for es2017 a declared but
 * never assigned static does not exist, so a boot that failed early passes required = false.
 */
export function clearStatic(owner: Function, field: string, required: boolean): void {
    if (!Object.prototype.hasOwnProperty.call(owner, field)) {
        if (!required) return;
        throw new Error(`resetSingletons: ${owner.name}.${field} does not exist. Was it renamed? Update test/harness/singletons.ts`);
    }
    (owner as any)[field] = undefined;
}

/**
 * Clears the singletons a booted unit creates, so the next bootUnit builds fresh ones on its own bus. FlightPlanner keeps
 * its planners by id; without this the next unit would get the "kln90b" planner bound to the old bus.
 */
export function resetSingletons(required: boolean): void {
    clearStatic(KLNFacilityRepository, 'INSTANCE', required);
    clearStatic(KLN90BUserWaypointsSettings, 'INSTANCE', required);
    clearStatic(KLN90BUserFlightplansSettings, 'INSTANCE', required);
    clearStatic(KLN90BUserRemarkSettings, 'INSTANCE', required);
    const planners = (FlightPlanner as any).instances;
    if (!(planners instanceof Map)) {
        throw new Error('resetSingletons: FlightPlanner.instances is not a Map. Did the SDK change? Update test/harness/singletons.ts');
    }
    planners.clear();
}
```

- [ ] **Step 5: Teardown, guard and `panel` in `test/harness/boot.ts`**

- Import `onTestFinished` from vitest, plus `FrontPanel` (`./flight/FrontPanel`), `Screen` (`./render/screen`) and
  `resetSingletons` (`./singletons`).
- Replace `let booted = false;` and the guard with:

```ts
/** The unit of the running test, if any: its boot state decides how strictly teardown checks the singletons */
let live: { completed: boolean } | undefined;

/**
 * Ends the unit of the test that just finished: stops its clock, empties the sim fakes in place (setup files and simEnv()
 * keep their references), clears the singletons and the DOM.
 */
function teardown(): void {
    const state = live;
    vi.clearAllTimers();
    vi.useRealTimers();
    const env = simEnv();
    env.sim.reset();
    env.storage.reset();
    env.coherent.reset();
    env.magvar = () => 0;
    resetSingletons(state?.completed ?? false);
    document.body.innerHTML = '';
    live = undefined;
}
```

- At the top of `bootUnit`, replace the old guard:

```ts
    if (live !== undefined) {
        throw new Error('bootUnit: one unit per test; this test already booted one (the singletons allow one live unit)');
    }
    try {
        onTestFinished(teardown);
    } catch (e) {
        throw new Error(`bootUnit: call it inside a test (it, not beforeAll or the module body); the unit is torn down when the test ends. ${e}`);
    }
    const state = {completed: false};
    live = state;
```

- After `propsReady` fired, set `state.completed = true;`.
- Add `panel: FrontPanel;` to `HeadlessUnit` with the doc comment "The front panel, driven through H events like an
  aircraft's hardware". Return `panel: new FrontPanel(evt => core.onInteractionEvent([evt]), () => Screen.read())`.
- Update the `bootUnit` doc comment: one unit per test, torn down when the test ends.
- Check whether vitest's `onTestFinished` throws outside a test, or only warns. If it does not throw, detect "outside a
  test" another way (`expect.getState().currentTestName === undefined`) and throw.

- [ ] **Step 6: Run the tests, then prove each assertion bites**

Run: `npx vitest run test/render/harness/reboot.test.ts test/unit/harness/singletons.test.ts test/flight/harness/boot.test.ts`

Expected: PASS.

Then disable one teardown step at a time, see the matching assertion fail, and restore:

| Step disabled | Assertion that must fail |
|---|---|
| `document.body.innerHTML = ''` | `#pageContainer` is null |
| `env.sim.reset()` | `writes` is empty, `PLANE LATITUDE` is unset |
| `env.storage.reset()` | storage is empty (and probably the FPL 0 and remarks assertions) |
| `env.coherent.reset()` | `calls` is empty |
| the `KLNFacilityRepository` line | the user waypoint list is empty, and the repository is not the same object |
| the flight plans manager line | FPL 0 is empty (the old manager keeps its values when the empty storage loads) |
| the remarks manager line | no remarks |
| `planners.clear()` | the planner is not the first one |

**The timer step is a no-op on its own.** `startFakeClock` calls `vi.useFakeTimers()`, and vitest uninstalls the old
clock before it installs a new one. So also replace `vi.useFakeTimers` in `startFakeClock` with a version that keeps
the old clock when one is installed. Only then must `oldTick` fail. Record that in the commit message.

If an assertion survives its break, report it. Do not weaken the test.

- [ ] **Step 7: Add `ApproachType` to `staticGlobals.ts`**

Next to `g.RunwayDesignator`, with the values of `node_modules/@microsoft/msfs-types/js/simplane.d.ts` (`declare enum
ApproachType`):

```ts
    g.ApproachType = {
        APPROACH_TYPE_UNKNOWN: 0, APPROACH_TYPE_GPS: 1, APPROACH_TYPE_VOR: 2, APPROACH_TYPE_NDB: 3, APPROACH_TYPE_ILS: 4,
        APPROACH_TYPE_LOCALIZER: 5, APPROACH_TYPE_SDF: 6, APPROACH_TYPE_LDA: 7, APPROACH_TYPE_VORDME: 8,
        APPROACH_TYPE_NDBDME: 9, APPROACH_TYPE_RNAV: 10, APPROACH_TYPE_LOCALIZER_BACK_COURSE: 11,
    };
```

Read the `.d.ts` to confirm each value before you commit.

- [ ] **Step 8: Docs**

- **`testing.md` section 3, "Isolation and time":** every test may boot its own unit with `bootUnit`. The unit is torn
  down when the test ends: its timers stop, the sim fakes are reset in place (`FakeSim` keeps its registration ids),
  the singletons in `test/harness/singletons.ts` are cleared, and the DOM is emptied. One live unit at a time. A
  singleton added to the instrument must be added to `singletons.ts`.
- **`testing.md`:** mention `unit.panel` where `FrontPanel` is described.
- **`testing.md` section 6:** replace "One unit per test file." with the same limit stated per test, plus one
  sentence: an unknown singleton shows up as a test that passes alone and fails in its file.
- **`architecture.md` Core 10:** "the tests run one headless unit per test (testing.md)".
- **`test-coverage.md`:** rule 9.
- **`turnDirection.test.ts`:** the comment says "One flight per file (bootUnit)". Reword it to explain the
  record-then-judge shape without the per-file reason.

- [ ] **Step 9: Full suite, then commit**

Run: `npm test` → all pass. `npx tsc --noEmit` → no output.

```bash
git add test/harness test/render/harness/reboot.test.ts test/unit/harness/singletons.test.ts test/flight docs/testing.md docs/architecture.md docs/test-coverage.md
git commit -m "One headless unit per test instead of per file

bootUnit tears its unit down when the test ends: fake timers stopped, FakeSim/
FakeStorage/FakeCoherent reset in place (FakeSim keeps its registration ids),
the instrument singletons and the SDK FlightPlanner map cleared, DOM emptied.
HeadlessUnit gains panel. Adds the ApproachType static global for SidStar.

Proof: each reboot.test.ts assertion fails with its teardown step disabled;
the old-tick assertion needs the fake clock kept across boots as well.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Batch tasks 2 to 6: the common brief

Every batch implementer works in its own worktree, branched from the session branch after task 1 was merged. For
each row of its task, in the order listed:

1. Read the row in `docs/test-coverage.md` section 5 and its specification below. **Confirm the reproduction against
   the code**: both were written by reading code and may be wrong.
2. Write the test in the listed file. Use `unit.panel` for the knobs. Several tests may share a file now, each `it`
   with its own boot.
3. Run it and see it pass: `npx vitest run <file>`.
4. Apply the **break**, which is the original bug reintroduced by hand. See the test fail for the right reason, not a
   setup error. Restore, and check that `git diff` shows only the test.
5. Run `npx tsc --noEmit`, then commit the row alone with the proof line.

When something does not go to plan:
- **A row cannot be done as specified:** do not force it. Write the reason into the report as a proposed re-verdict
  (*needs harness: …*, *not provable: …*, *not testable: …*).
- **A suspected bug is confirmed:** add an `it.fails('… (#NEW-<task>-<n>)')` pin that states the correct behavior.
  Commit it, and add the bug to the report with a reproduction (input, observed and expected values, file:line).
- **A suspected bug cannot be confirmed:** report it as unconfirmed, with what you observed.

At the end, run `npm test` and `npx tsc --noEmit` in the worktree. Then report:
- one line per row: the row, the test path, spec or characterization, the commit hash, and any re-verdict with its
  reason;
- the bugs, as above;
- the worktree path and the branch name.

---

### Task 2: persistence and settings (unit, with two render halves)

**Goal:** A proven regression test, or a pin, for each of #36, #78, #101, #47, `f745fb3`/`b14db79`, `1781156`,
`1676e56`, `c673dc2` and `7b4465d`.

**Files:**
- Modify: `test/unit/settings/UserWaypointV2.test.ts`
- Create:
    - `test/unit/settings/UserWaypointV1.test.ts`
    - `test/unit/settings/UserFlightplanLoaderV1.test.ts`
    - `test/unit/settings/UserWaypointPersistor.test.ts`
    - `test/unit/settings/KLN90BPlaneSettings.test.ts`
    - `test/unit/Hardware.test.ts`
    - `test/unit/pages/PageManager.test.ts`
    - `test/render/KLN90BCore.userDataConversion.test.ts`
    - `test/render/pages/right/Apt3UserPage.test.ts`

**Acceptance Criteria:**
- [ ] Each of the listed rows has a commit with a proof line, or a reported re-verdict.
- [ ] The #101 pin is `it.fails('… (#101)')`, and it fails (turns red) when `UserWaypointLoaderV1.ts:275` reads
  `substring(21, 24)`.
- [ ] The `1781156` regression is pinned as `#NEW-2-1` and reported, with "regressed by `933479d`" as its re-verdict.
- [ ] `npm test` and `npx tsc --noEmit` are clean in the worktree.

**Verify:** `npx vitest run test/unit/settings test/unit/Hardware.test.ts test/unit/pages test/render/KLN90BCore.userDataConversion.test.ts test/render/pages/right/Apt3UserPage.test.ts`
→ all pass, with the pins counted as expected fails.

**Rows:**

- [ ] **#36 `e09cc67`: sign of user waypoints at 0°.** In `UserWaypointV2.test.ts`:
    - **West:** add an intersection `{icao:'', icaoStruct: ICAO.value('W','XX','','ZERO'), name:'', lat: 47.5, lon: -(54.35/60), region:'XX', city:'', routes: []}`.
      Expect `storedSlot(0)` to be `'WXX        ZERO    +4730.00-00054.35'`. Restoring that string gives lon ≈
      -0.9058333 and lat 47.5.
    - **South:** ident `SZERO`, lat -0.5, lon 8. Expect `'WXX        SZERO   -0030.00+00800.00'`, and the restore
      gives lat -0.5. This is a plain test, not a pin: #98 only hits latitudes of 1° and more.
    - **Break:**
        - Serializer: remove `signedZero: true` at `UserWaypointPersistor.ts:149` and `:162`.
        - Restore: `UserWaypointLoaderV2.ts` lon at 282-285 becomes `const degrees = Number(str.substring(27, 31)); return degrees + (degrees >= 0 ? minutes : -minutes);`.
        - The #98 pin may flip during the break; that is expected.
- [ ] **#78 `6677fae`: longitude sign of V2 restores.**
    - Restore `'VXX        ABC     +4730.00-00830.00+114.30+02'`: lon -8.5.
    - Restore `'NXX        XY      +4800.00-00915.00+0345.0'`: lon -9.25 and frequency 345.
    - **Break:** `UserWaypointLoaderV2.ts:282` back to `substring(27, 31)` and `:285` to
      `sign * (degrees + (degrees >= 0 ? minutes : -minutes))`.
- [ ] **#101 (open): V1 longitudes of 100° and more.** Create `UserWaypointV1.test.ts`.
    - **Setup:** as in the V2 file, but leave `userDataFormat` at 0 and build **no** `UserWaypointPersistor`. Add a
      helper `restoreV1(...s)` that sets the `wpt{i}` slots and calls
      `new UserWaypointLoaderV1(bus, repo).restoreWaypoints()`.
    - **V1 layout:** a 12-character ICAO (`type` + region(2) + airport(4) + ident padded to 5), lat `±DDMM.mm` at
      12-19, lon `±DDDMM.mm` at 20-28. Then airport altitude at 29-34, length at 35-40 and surface at 41; VOR frequency
      at 29-35 and magvar at 36-38; NDB frequency at 29-35.
    - **Pin:** `it.fails('restores a V1 longitude of 100° or more (#101)')`: restore `'WXX    WEST +3400.00-11830.00'`,
      expect lon -118.5. Today it is -18.5.
    - **Plain tests, proven with the same break:**
        - `'WXX    USRA +4730.00-00815.50'` gives lon -8.258333 and lat 47.5.
        - `'WXX    SOUTH-1230.00+01015.00'` gives lat -12.5.
        - `'VXX    ABC  +4730.00+00854.00+114.30+02'` gives frequency 114.3 and magvar 2.
        - `'AXX    UAPT +4700.00-00830.00+01400+03200H'` gives altitude 1400, runway 3200 ft and Asphalt.
    - **Proof that the pin bites:** temporarily change `:275` to `substring(21, 24)`; the `it.fails` must turn red.
- [ ] **#47 `933479d`: V1 to V2 conversion at boot.**
    - **Unit, `UserFlightplanLoaderV1.test.ts`:**
        - Build `KLNFacilityLoader(new MemoryFacilityClient([airport('KAAA',47,8), vor('ABC',47.2,8,{region:'K1'})]), repo)`.
        - Set the `fpl0` setting to `'A      KAAA VK1    ABC  '` (24 characters; V1 `fpl0` stores FPL 1).
        - `await new UserFlightplanLoaderV1(bus, loader, new MessageHandler()).restoreAllFlightplan()`: 26 plans,
          plan 0 empty, plan 1 legs `['KAAA','ABC']` with ABC in region `K1`.
        - Then `persistFlightplan(plans[1])` through a `UserFlightplanPersistor`: setting `fpl1` is
          `'A          KAAA    VK1        ABC     '`.
    - **Render, `KLN90BCore.userDataConversion.test.ts`:**
        - Boot with `facilities: [airport('KAAA',47,8), vor('ABC',47.2,8,{region:'K1'})]` and
          `storage: {wpt0: 'WXX    USRA +4730.00-00815.50', fpl0: 'A      KAAA VK1    ABC  '}`, with no
          `userDataFormat`.
        - With `k = 'persistent-setting.KLN TEST.profile_1.'`, expect in `unit.env.storage.data`:
            - `k+'userDataFormat'` is `'2'`;
            - `JSON.parse(k+'wpt0')` is `'WXX        USRA    +4730.00-00815.50'`;
            - `JSON.parse(k+'fpl1')` is `'A          KAAA    VK1        ABC     '`;
            - `JSON.parse(k+'fpl0')` is `''`.
    - **Break:** make both persistors always use the V2 loader (`UserWaypointPersistor.ts:49-53` and
      `UserFlightplanPersistor.ts:34-38`). That is the original symptom.
    - **Caution:** deleting only the conversion block in `KLN90BCore.ts:300-308` leaves `wpt0` green, because of the
      `1781156` regression. Note this in the report.
- [ ] **`f745fb3`, `b14db79`: user runway of unknown length.**
    - **Unit, in the V2 file:** add the user airport UAPT (lat 47, lon 8, altitude -1,
      `runways: [{length: -10, surface: RunwaySurfaceType.WrightFlyerTrack, …}]`, with the other runway fields as
      `airport()` in `test/harness/navdata/builders.ts` builds them).
        - `storedSlot(0)` is `'AXX        UAPT    +4700.00+00800.00-00001-00033-'`.
        - Restoring it gives a length below 0, close to -10.0584 m.
    - **Render, `Apt3UserPage.test.ts`:**
        - Boot with `storage: {userDataFormat: 2, wpt0: 'AXX        UAPT    +4700.00+00800.00-00001-00033-'}`.
        - Show APT 3 for UAPT: right cursor, type `U`,`A`,`P`,`T` with `KLN90B_Internal_Key:RIGHT:`, then cursor off and
          `selectPage('R','APT 3')`. Confirm the path.
        - Expect the runway-length row to show the empty-editor underscores, not a number. Copy the exact row from
          `dump()` once and check it against `Apt3UserPage.tsx:107-126`.
    - **Break:** `Apt3UserPage.tsx:115` becomes `rwy.length === -10`. The unit half does not bite this break; only the
      render half proves the row.
- [ ] **`1781156`: user waypoint restore writes storage. This regressed and is still open.**
    - In `UserWaypointPersistor.test.ts`, preload `simEnv().storage.data` with:
        - `'persistent-setting.KLN TEST.profile_1.userDataFormat'` = `'2'`;
        - `…wpt0` = `JSON.stringify('VXX        ABC     +4730.00+00854.00+114.30+02')`;
        - `…wpt1` = `JSON.stringify('WXX        USRA    +4730.00-00815.50')`.
    - Build `KLN90BSettingSaveManager(bus, userSettings)`, then `load('KLN TEST.profile_1')` and
      `startAutoSave('KLN TEST.profile_1')`, then `new UserWaypointPersistor(bus, repo, userSettings)`.
    - `const spy = vi.spyOn(globalThis as any, 'SetStoredData')`, then `p.restoreWaypoints()`.
    - Pin `it.fails('does not write storage while restoring (1781156) (#NEW-2-1)')`. Expect `spy` not to have been
      called, and `repo.get(ICAO.value('W','XX','','USRA'))!.icaoStruct.ident` to be `'USRA'`.
    - **Proof that the pin bites:** temporarily set `this.ignoreSync = true` around the delegation in
      `UserWaypointPersistor.restoreWaypoints`, with `try`/`finally`.
    - **Report it as a bug:** `933479d` moved `ignoreSync` into the loaders, where nothing reads it. The comments at
      `UserWaypointV2.test.ts:62` and `:71` describe the bug as intended; mention them in the report.
- [ ] **`1676e56`: the ElectricitySimVar index is a number.**
    - In `KLN90BPlaneSettings.test.ts`, start with `// @vitest-environment happy-dom`.
    - Parse `'<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ElectricitySimVar>CIRCUIT SWITCH ON:2</ElectricitySimVar></Input></Instrument></PlaneHTMLConfig>'`
      with `new KLN90BPlaneSettingsParser().parsePlaneSettings(...)`.
    - Expect `simEnv().sim.lastWrite('L:KLN90B_ElectricitySimVarIndex')!.value` `toBe(2)`, the number and not the
      string.
    - **Break:** drop `Number(...)` at `KLN90BPlaneSettings.ts:98`.
- [ ] **`c673dc2`: `L:KLN90B_RightScan` is the current state.**
    - In `Hardware.test.ts`: `const hw = new Hardware(); hw.setScanPulled(true)`, then expect `lastWrite` value 1.
    - Then `hw.setScanPulled(false)`, and expect 0.
    - **Break:** in `Hardware.ts:12-17`, write the LVar before the assignment, with `this.isScanPulled`.
- [ ] **`7b4465d`: H events before initialization.**
    - In `PageManager.test.ts`: `const err = vi.spyOn(console, 'error').mockImplementation(() => {})`.
    - Expect `() => new PageManager().onInteractionEvent(EVT_ENT)` not to throw.
    - Expect `err` to have been called with `'Event KLN90B_ENT_Push ignored, we are not yet initialized!'`.
    - Add the happy-dom docblock if importing `PageManager` fails in Node.
    - **Break:** `PageManager.ts:39-45` body becomes `this.container!.onInteractionEvent(evt);`.

```json:metadata
{"files": ["test/unit/settings/UserWaypointV2.test.ts", "test/unit/settings/UserWaypointV1.test.ts", "test/unit/settings/UserFlightplanLoaderV1.test.ts", "test/unit/settings/UserWaypointPersistor.test.ts", "test/unit/settings/KLN90BPlaneSettings.test.ts", "test/unit/Hardware.test.ts", "test/unit/pages/PageManager.test.ts", "test/render/KLN90BCore.userDataConversion.test.ts", "test/render/pages/right/Apt3UserPage.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every listed row has a commit with a proof line or a reported re-verdict", "#101 pinned as it.fails and proven to flip", "1781156 pinned as #NEW-2-1 and reported", "npm test and tsc clean in the worktree"], "modelTier": "standard"}
```

---

### Task 3: navdata and services logic (unit, with two render halves)

**Goal:** A proven regression test, or a pin, for each of #6, #59, #14, #28, `9ce23bf`/`f4f5395`/`1ef2a35`, #9,
`6a6c634`, #42, `e1e75d0`, `d3228dd`, `9adbf97`, #4 and #8.

**Files:**
- Create:
    - `test/unit/data/navdata/SidStar.test.ts`
    - `test/unit/data/navdata/BoundaryUtils.test.ts`
    - `test/unit/data/navdata/Scanlist.test.ts`
    - `test/unit/data/navdata/KLNFacilityLoader.test.ts`
    - `test/unit/services/Vnav.test.ts`
    - `test/unit/services/MSA.test.ts`
    - `test/render/pages/right/VorPage.test.ts`
    - `test/render/pages/left/Nav3Page.test.ts` (and `Nav5Page.test.ts` if the NAV 5 half bites)

**Acceptance Criteria:**
- [ ] Each of the listed rows has a commit with a proof line, or a reported re-verdict.
- [ ] The suspected bugs N1 to N4 below are each confirmed and pinned (`#NEW-3-<n>`), or reported as not confirmed.
- [ ] `npm test` and `npx tsc --noEmit` are clean in the worktree.

**Verify:** `npx vitest run test/unit/data test/unit/services test/render/pages/right/VorPage.test.ts test/render/pages/left/Nav3Page.test.ts`
→ all pass, with the pins counted as expected fails.

**Notes**
- `ApproachType` is a global after task 1.
- Reach private statics with `(SidStar as unknown as {getArcEntryName(n: string, r: number, d: number): string}).getArcEntryName(...)`.
- Call `recalculateArcEntryData` as `SidStar.recalculateArcEntryData(...)`, because it uses `this`.
- Unit tests have real timers.

**Rows:**

- [ ] **#6 `117f548`, `4fa8cea`, `cc89fd4`: the approach filter.**
    - **Literal builders:**
        - `leg(type, rnp = 0)` = `{type, rnp, fixIcaoStruct: ICAO.value('W','K1','','FIXAA')}`.
        - `app({...})` with fields `approachType`, `rnavTypeFlags`, `rnpAr`, `missedApproachRnpAr`, `transitions`,
          `finalLegs` (default `[IF, TF]`) and `missedLegs` (default `[TF]`), cast `as unknown as ApproachProcedure`.
    - **`it.each`, expected values:**
        - RNAV with flags LNAV|LNAVVNAV (3) and no RF: true.
        - RNAV with flags 10 (no LNAV bit): false.
        - RNAV with flags 0: false (characterization).
        - RNAV with LNAV and an RF leg in `finalLegs`, a transition, or `missedLegs`: false each.
        - GPS, VOR, VORDME, NDB, NDBDME: true.
        - ILS, LOCALIZER, LDA, SDF, LOCALIZER_BACK_COURSE: false.
        - VOR with an RF leg: false.
    - **Citations:** look up the non-precision approach pages for the citation. The LNAV-bit rule is the code's
      convention, so it is characterization.
    - **Breaks:**
        - Delete the RNAV case (`SidStar.ts:220-222`).
        - Make `:222` `return true`.
        - Delete `return true` at `:228`.
- [ ] **#59 `71481dc`, `b0c16cf`: no RNP filtering.**
    - **Approaches:** RNAV with LNAV and all legs at `rnp = 555.6` m: true. VOR with a leg at `rnp = 1852`: true.
      `rnpAr: true`: false. `missedApproachRnpAr: true`: false.
    - **Procedure literal** `{enRouteTransitions: [], runwayTransitions: [], commonLegs: [leg(TF, 1852)], rnpAr: false}`:
      `isProcedureRecognized` gives true. With `rnpAr: true` it gives false.
    - **Break:** put the deleted B-RNAV check back. Before `:215` add
      `const cert = UnitType.NMILE.convertTo(5, UnitType.METER)`, and return false if any leg has
      `rnp > 0 && rnp < cert`. Do the same in `isProcedureRecognized`.
- [ ] **#14 `8da5eee`: a procedure needs a recognized leg.**
    - `{enRouteTransitions: [], runwayTransitions: [{legs: [CA, VM]}], commonLegs: [], rnpAr: false}`, with CA and VM
      built with `fixIcaoStruct: ICAO.emptyValue()`: false.
    - Add a TF leg with fix FIXAA to `commonLegs`: true.
    - Optional, two runway transitions: `(p, rwy04)` is false and `(p, rwy31)` is true.
    - **Break:** `:236` becomes `return SidStar.procHasNoRFLegs(proc) && !proc.rnpAr;`.
- [ ] **#28 `063a836`: DME-arc entry names.** Call `getArcEntryName('ABC', 45, d)`:

    | d | Expected | Kind |
    |---|---|---|
    | 18 | `'D045R'` | spec, 6-16 |
    | 26 | `'D045Z'` | spec, 6-16 |
    | 27 | `'ABC27'` | characterization, the Jeppesen convention the code cites |
    | 30 | `'ABC30'` | characterization |
    | 100 | `'00ABC'` | characterization |

    - **Break:** the body becomes the old letter-only form,
      ``return `D${format(radial, "000")}${[' ', 'A', …, 'Z'][Math.round(dist)]}`;``.
- [ ] **`9ce23bf`, `f4f5395`, `1ef2a35`: recalculating the arc entry.**
    - **Sensors stub:** `{in: {gps: {coords: new GeoPoint(lat, lon), getTrackTrueRespectingGroundspeed: () => 0}}} as unknown as Sensors`.
    - **Arc:** VOR `vor('ABC', 0, 0)` and a 10 NM arc:
      `new GeoCircle(GeoPoint.sphericalToCartesian({lat:0, lon:0}, new Float64Array(3)), 10 / EARTH_RADIUS_NM)`, with
      `EARTH_RADIUS_NM` from `test/harness/flight/geo.ts`.
    - **Aircraft:** lat = -3/R rad (**-0.0499107°**), lon = 5/R rad (**0.0831845°**), track 000.
    - **Hand-computed intersections:** at lat ±0.1440798°. The radial is 29.99993° ahead and 150.00007° behind.
    - **Left-hand arc** (`beginRadial 170`, `endRadial 10`, `turnDirection Left`; circle not reversed):
        - entry ident `'D030J'`;
        - `reference1Radial` close to 30 (3 decimals);
        - `reference1Distance` close to 10;
        - entry lat 0.14408 and lon 0.08318, to 1e-5.
    - **Right-hand arc** (`10`, `170`, `Right`; circle built with `.reverse()`, as `getArcEntryData` does): assert the
      radial 30 in a normal test.
    - Null track: `getTrackTrueRespectingGroundspeed: () => null` returns null.
    - **Breaks:**
        - Delete the filter at `:148`. The result becomes `D150J`.
        - Replace `:157-166` with `const start = arcData.beginRadial, end = arcData.endRadial;`. The result becomes
          null.
    - **`f4f5395` (`Math.abs`)** probably cannot be made to bite with hand-built geometry: the point behind lies on the
      track's great circle, and its sign is rounding noise. Try several tracks. If none bites, report it as "not
      provable" with that reason.
    - **N1, suspected bug:** for the right-hand arc, the distance reads the reversed circle's radius, about 10809 NM,
      and the name is `10709ABC`. If confirmed, pin `it.fails('names a right-hand arc entry D030J (#NEW-3-1)')`. It
      was introduced by `15d9b35` (#18).
- [ ] **#9 `103ea59`: the date line in `BoundaryUtils`.**
    - **Literal:** `{facility: {topLeft: {lat:20, long:-179}, bottomRight: {lat:10, long:179}}, lods: [[[{end:{lat:10,lon:179}}, {end:{lat:10,lon:-179}}, {end:{lat:20,lon:-179}}, {end:{lat:20,lon:179}}, {end:{lat:10,lon:179}}]]]} as unknown as LodBoundary`.
    - **Expected:**
        - `isInside(b, 15, 179.5)` true; `(b, 15, -179.5)` true; `(b, 15, 0)` false; `(b, 15, 178)` false;
          `(b, 15, -178)` false.
        - `intersects(b, 15, 178, 15, -178)` true; `intersects(b, 15, 170, 15, 175)` false.
    - **Comment in the test:** the bounding-box convention is the code's assumption, not verified against sim data.
    - **Break:** remove the date-line handling (`BoundaryUtils.ts:17-20` and the use of `wpt1Lon`/`wpt2Lon` in
      `isInside`; `:81-87` and `:97-102` in `intersects`).
    - **N3, suspected bug:** `intersects(b, 15, -10, 15, 10)` returns true, and `getIntersections` has no date-line
      handling. Pin `#NEW-3-3` if confirmed.
- [ ] **`6a6c634`: ICAO comparison in `Scanlist`.**
    - Build `new FacilityLoaderScanlist(FacilitySearchType.Airport, new MemoryFacilityClient([airport('KAAA',47,8), airport('KAAB',47.1,8), airport('KAAC',47.2,8)]) as unknown as FacilityClient, new EventBus())`,
      then `await init()`.
    - `getNext(ICAO.value('A','','','KAAB'), 1)` gives KAAC; with `-1` it gives KAAA.
      `getNext(ICAO.value('A','','','KAAC'), 1)` gives null.
    - **Empty list:** `await expect(list2.init()).resolves.toBeNull()`, **then** `await (list2 as any).listManangerJob`.
      Without awaiting the private job, the bug is only an unhandled rejection.
    - **Breaks:** `:141` and `:209` back to `icaoListCache.indexOf(...)`; `:93-95` back to
      `this.lastIcao = this.index[0];`.
- [ ] **#42 `07873c0`, `e1e75d0`: empty user scan list.**
    - Repository with no user waypoints; `new FacilityLoaderScanlist(FacilitySearchType.User, new KLNFacilityLoader(new MemoryFacilityClient([]), repo), bus)`.
    - `init()` resolves to null, then await `listManangerJob`, and `start()` is null.
    - **Breaks:** remove the `if` at `:366`. Separately, make `:97` and `:104` `return this.index[0];`.
- [ ] **`e1e75d0`: merged search results are sorted.**
    - Repository VORs `AAA` and `AAC` in region `XX`; database `vor('AAB',47.2,8)`.
    - `searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'A', 100)` gives idents `['AAA','AAB','AAC']`.
    - The table's AAA/BBB/CCC version needs the prefix `''`, which the unit never uses.
    - **Break:** delete the sort at `KLNFacilityLoader.ts:304`.
- [ ] **`d3228dd`: scanning duplicate idents.**
    - **Unit:** `vor('ABC',47,8,{region:'K1'})`, `vor('ABC',40,-100,{region:'K2'})` and `vor('ABD',47.1,8.1)`, scan
      type Vor. `getNext(ICAO.value('V','K1','','ABC'), 1)` gives ABC in region K2, then ABD. The K1-before-K2 order
      is the code's convention (characterization); the spec part is that every facility is visited (3-21).
    - **Render, `VorPage.test.ts`:**
        - Boot with `vor('ABC',47.3,8.3,{region:'K2',name:'ABC SOUTH',frequencyMHz:117.0})`,
          `vor('ABC',47.2,8.2,{region:'K1',name:'ABC NORTH',frequencyMHz:116.0})` and `vor('ABD',47.1,8.1)`, in that
          order.
        - `selectPage('R','VOR  ')`, then `cursor('R')`, type A,B,C with keyboard keys, `cursor('R')`.
        - Row 1 is `ABC NORTH`. Then `scan()` and `inner('R',1)`: `ABC SOUTH`. Advance more than 350 ms, then
          `inner('R',1)`: `ABD`.
    - **Breaks:**
        - Scanlist: compute `getNextIdentForSearch(ident, -1)` at the top of the loop at `:226`, and remove it at
          `:231` and `:245`.
        - Selector: delete the sort at `WaypointSelector.tsx:105`.
    - **N2, suspected bug:** `rebuildIndex` takes the raw search order for the first entry of each letter (`:359`).
      Pin `#NEW-3-2` if confirmed.
- [ ] **`9adbf97`: VNAV accepts a direct-to outside FPL 0.**
    - Stubs: `navState = {activeWaypoint: {getActiveFplIdx: () => -1, getActiveWpt: () => vor('ABC',47,8)}}` and
      `fpl0.getLegs()` = `[{wpt: airport('KAAA',46,7)}, {wpt: airport('KBBB',48,9)}]`.
    - `isValidVnavWpt` on a structural copy of `vor('ABC',47,8)` is true; on `vor('ABD',47.1,8.1)` false; on KAAA
      false. Cite C-1, as the code does.
    - **Break:** in `Vnav.ts:104-106`, restore the else branch that checks FPL 0.
- [ ] **#4 `f6f62ec`: `Vnav.tick` with the waypoint cleared.**
    - Realistic stubs:
        - `nav4VnavWpt: null`, the active FPL index 1, `distToActive 5`, `nav4VnavAngle -3`,
          `nav4SelectedAltitude 1000`, `nav4FromAlt 3000`;
        - sensors with `gps.groundspeed 120` and `airdata.getIndicatedAlt()` = 3000.
    - `it.each([Active, Armed])`: after `tick()` the state is Inactive, and `nav4VnavWpt`, `advisoryAltitude` and
      `timeToVnav` are null.
    - **Break:** `:28` becomes `nav4VnavWpt !== null && !isValidVnavWpt(...)`.
- [ ] **#8 `4cbe2b5`, `9f0b7e1`: duplicate consecutive waypoints.**
    - **Unit, `MSA.test.ts`:** `await new MSA().init('html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B')`.
      p = {lat 47.5, lon 8.5}. `getMSA(p)` is 11400, read from `resources/…/Assets/msa.json` at row 103, column 188
      (characterization of the data). `getMSAFromTo(p, {...p})` is also 11400.
    - **Break:** delete `MSA.ts:24-26`.
    - **Render:**
        - NAV 3 with `savedFlightplan(0, [kaaa, abc, abc, kbbb])`, positioned on leg KAAA-ABC. `Nav3Page` calls
          `getMSAForRoute`. Expect `unit.errors` to be `[]` and the ESA row to be a number, copied once from `dump()`.
        - The same MSA break must produce an error.
        - **N4, suspected:** with SDK 2.3.3 the NAV 5 drawing half probably no longer throws. Try the `Canvas.tsx`
          guard break on NAV 5. If it stays green, report the NAV 5 half as "no longer observable" with that reason.

```json:metadata
{"files": ["test/unit/data/navdata/SidStar.test.ts", "test/unit/data/navdata/BoundaryUtils.test.ts", "test/unit/data/navdata/Scanlist.test.ts", "test/unit/data/navdata/KLNFacilityLoader.test.ts", "test/unit/services/Vnav.test.ts", "test/unit/services/MSA.test.ts", "test/render/pages/right/VorPage.test.ts", "test/render/pages/left/Nav3Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every listed row has a commit with a proof line or a reported re-verdict", "N1-N4 pinned as #NEW-3-n or reported unconfirmed", "npm test and tsc clean in the worktree"], "modelTier": "standard"}
```

---

### Task 4: direct-to and FPL 0 (render)

**Goal:** A proven regression test for each of `0031c11`/`d8edd70`, #43, `43d472b`, #12, #49, #81, #67 (b) and the
render half of #27.

**Files:**
- Create:
    - `test/render/pages/left/DirectToPage.test.ts`
    - `test/render/data/flightplan/ActiveWaypoint.test.ts`
    - `test/render/pages/right/Dt3Page.test.ts`

**Acceptance Criteria:**
- [ ] Each of the listed rows has a commit with a proof line, or a reported re-verdict.
- [ ] Every ENT path asserts a visible effect besides `unit.errors`.
- [ ] `npm test` and `npx tsc --noEmit` are clean in the worktree.

**Verify:** `npx vitest run test/render/pages/left/DirectToPage.test.ts test/render/data/flightplan test/render/pages/right/Dt3Page.test.ts`
→ all pass.

**Common setup:**
- Facilities: `kaaa = airport('KAAA',47.0,8.0)`, `abc = vor('ABC',47.2,8.0)`, `kbbb = airport('KBBB',47.4,8.0)`.
- Position 47.1/8.0 lies on leg KAAA-ABC, so after the GPS wait the active FPL index is 1.

**Rows:**

- [ ] **`0031c11`, `d8edd70`: deleting legs until fewer than two remain** (`ActiveWaypoint.test.ts`).
    - Boot with `savedFlightplan(0, [kaaa, kbbb])` at 47.2/8.0. After the GPS wait, the active index is 1 (KBBB).
    - Keys: `outer('L',-1)`, `cursor('L')`, `outer('L',1)`, `clr()`, `ent()`, `cursor('L')`, advance 2000.
    - Expect:
        - `unit.errors` is `[]`;
        - `getActiveWpt()` is null, `getActiveFplIdx()` is -1, `isDctNavigation()` is false, and `getFromWpt()` is
          null;
        - FPL 0 has 1 leg;
        - left row 1 is `'  1:KAAA   '` (confirm against `dump()`).
    - **Breaks:**
        - `0031c11`: `ActiveWaypoint.ts:113` becomes `return null;`. The row then shows `Á`.
        - `d8edd70`: delete line 233. `getFromWpt()` is then KAAA.
- [ ] **#43 `ed17e0e`: DCT to the second of two identical waypoints** (`DirectToPage.test.ts`).
    - Plan `[kaaa, abc, kbbb, abc]`; GPS wait. The active index is 1, the first ABC.
    - Keys: `outer('L',-1)`, `cursor('L')`, `outer('L',3)`, `dct()`, `ent()`, advance 1000.
    - Expect:
        - `getActiveFplIdx()` is 3, `isDctNavigation()` true, ident `'ABC'`;
        - `rightName()` is `'NAV 1'`;
        - left row 4 starts with `'› 4:ABC'`;
        - `unit.errors` is `[]`.
    - **Break:** `DirectToPage.tsx:102-106` becomes `activeWaypoint.directTo(from, waypoint);` only.
- [ ] **`43d472b`: `directTo` read the old index** (`ActiveWaypoint.test.ts`).
    - Plan `[kaaa, abc, kbbb]`; GPS wait. The active index is 1 (ABC).
    - Keys: `dct()` (a blank DIR page), `enterIdent('L','KBBB')`, `ent()` (the APT 1 confirmation), `ent()`, advance
      1000.
    - Expect: ident `'KBBB'`, index 2, `isDctNavigation()` true, `leftName()` `'NAV 2'`, `rightName()` `'NAV 1'`,
      `unit.errors` `[]`.
    - Do not use the FPL 0 cursor route: it bypasses the line under test.
    - **Break:** `ActiveWaypoint.ts:79` `legs[fplIdx]` becomes `legs[this.fplIdx]`. The result is ABC and index -1,
      without a throw.
- [ ] **#12 `2922907`: CLR then cursor on the DIR page** (`DirectToPage.test.ts`).
    - Boot with no storage. `dct()`, `clr()`, `cursor('L')`.
    - Expect `unit.errors` `[]`, `leftName()` `'DIR  '`, and left row 0 `'DIRECT TO: '`.
    - Add a separate `dct()`, `clr()`, `ent()` sanity test: `leftName()` is `'NAV 2'` and `getActiveWpt()` is null.
      It does **not** bite #12; say so in its name.
    - **Break:** `WaypointEditor.tsx:280`: call `popRightPage()` unconditionally.
- [ ] **#49 `40bfbec`: DCT with nothing to suggest** (`DirectToPage.test.ts`).
    - Boot with no storage, then `dct()`.
    - Expect `unit.errors` `[]`, `leftName()` `'CRSR'` (read through `row(6)`, see the trap), and the left half:
      `'DIRECT TO: '` followed by five blank rows.
    - **Break:** `FlightplanList.tsx:49` becomes `return "wpt" in wapoint;`.
- [ ] **#81 `ea23a6e`: right page changed during DCT confirmation** (`DirectToPage.test.ts`). The table's reproduction
  is wrong: it needs a DCT with a suggestion.
    - Boot with `savedFlightplan(0, [kaaa, kbbb])`.
    - Keys: `outer('L',-1)`, `cursor('L')` (on KAAA), then `dct()`. The right page should start with `'APT'`.
    - `outer('R',1)`, then `cursor('L')`.
    - Expect `unit.errors` `[]`, `leftName()` `'DIR  '` and `rightName()` `'CTR 1'`.
    - `cursor('L')` again: still no errors, and the cursor is on.
    - **Break:** `WaypointEditor.tsx:280` becomes `if (this.valueToConfirm !== null)`.
- [ ] **#67 `3415417` (b): a deleted direct-to target stays a random direct-to** (`ActiveWaypoint.test.ts`).
    - Plan `[kaaa, abc, kbbb]`; GPS wait.
    - Keys: `outer('L',-1)`, `cursor('L')`, `outer('L',2)`, `dct()`, `ent()`. Precondition: index 2 and a direct-to.
    - Then `clr()`, `ent()`, advance 1000.
    - Expect: ident `'KBBB'`, index -1, `isDctNavigation()` true, FPL 0 has 2 legs, `unit.errors` `[]`.
    - **Break:** delete `ActiveWaypoint.ts:338-342`.
- [ ] **#27 `dbb01bf` (render half): D/T 3 with duplicates** (`Dt3Page.test.ts`).
    - Facilities on lon 8.0: KAAA at 47.6, ABC (VOR) at 47.4, DEF (intersection) at 47.2, KBBB at 47.0.
    - Plan `[kaaa, abc, def, def, kbbb]`, position 47.5/8.0 (ABC active), magvar 0.
    - Keys: GPS wait, `outer('L',-1)` (FPL 0, cursor off), `selectPage('R','D/T 3')`, advance 2000.
    - Expect the right half:

      ```
      DIS     DTK
      (blank)
        6    180°
       18    180°
       18    180°
       30    180°
      ```

      The distances are 6.0108 NM per 0.1° on the `GA_RADIAN` sphere, so 6, 18 and 30 after rounding. Confirm the
      padding once against `dump()`.
    - Also expect `vi.spyOn(console,'error')` not to have been called.
    - **Break:** `Dt3FplPage.tsx:133-140`: keep only the else body. Row 4 then shows `' 18    °'`.

```json:metadata
{"files": ["test/render/pages/left/DirectToPage.test.ts", "test/render/data/flightplan/ActiveWaypoint.test.ts", "test/render/pages/right/Dt3Page.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every listed row has a commit with a proof line or a reported re-verdict", "ENT paths assert a visible effect", "npm test and tsc clean in the worktree"], "modelTier": "standard"}
```

---

### Task 5: CAL, ALT, SET, overlays and editors (render)

**Goal:** A proven regression test, or a pin, for each of #31, #54, #33, `ee0b000`, #56, #64, #46,
`fb671c0`/`74134be`/`9d1fe96`, `2b9f811`, #25, #75, `10c5a3d`, `f347a2c` and `8e9a7c4`.

**Files:**
- Create:
    - `test/render/pages/left/Cal1Page.test.ts`
    - `test/render/pages/left/Cal2Page.test.ts`
    - `test/render/controls/selects/AltitudeFieldset.test.ts`
    - `test/render/pages/left/AltPage.test.ts`
    - `test/render/pages/MainPage.test.ts`
    - `test/render/controls/editors/DateEditor.test.ts`
    - `test/render/pages/left/Set10Page.test.ts`
    - `test/render/pages/left/pageNames.test.ts`
    - `test/render/pages/left/Set0Page.test.ts`
    - `test/render/services/KeyboardService.test.ts`
    - `test/render/controls/PageContainer.test.ts`
    - `test/render/pages/CursorController.test.ts`

**Acceptance Criteria:**
- [ ] Each of the listed rows has a commit with a proof line, or a reported re-verdict.
- [ ] The suspected bugs below are each confirmed and pinned (`#NEW-5-<n>`), or reported as not confirmed.
- [ ] `npm test` and `npx tsc --noEmit` are clean in the worktree.

**Verify:** `npx vitest run test/render/pages test/render/controls test/render/services` → all pass, with the pins
counted as expected fails.

**Navigation from boot:**
- Left: `outer('L',1)` is CAL 1, `outer('L',3)` is SET 1, `outer('L',-3)` is TRI 0.
- Right: `outer('R',-5)` is NAV 1, then `inner('R',3)` is NAV 4.
- Fields are taken in declaration order, and the cursor starts at field 0.
- Storage keys look like `persistent-setting.KLN TEST.profile_1.<name>`. The SDK autosaves on every `set()`.

**Rows:**

- [ ] **#31 `e0fec22`: CAL values are persisted** (`Cal1Page.test.ts`, two tests).
    - **(a) Edit and store:**
        - `outer('L',1)`; row 2 is `'BARO:00.00"'`.
        - `cursor('L')`, `outer('L',3)`, `inner('L',-2)`, `outer('L',1)`, `inner('L',-1)`, `outer('L',1)`,
          `inner('L',2)`, `cursor('L')`.
        - Expect `cal12Barometer` to be 29.92 and the storage key `'29.92'`. Then CAL 1 row 2 is `'BARO:29.92"'`.
    - **(b) Restore at boot:** boot with `storage: {cal12Barometer: 29.92}`, then `outer('L',1)`: row 2 is
      `'BARO:29.92"'`.
    - "Still shown after the page is recreated" does not bite, because volatile memory survives that too.
    - **Kind:** characterization (a trainer choice).
    - **Break:** in `KLN90BUserSettingsSaverManager.ts:14`, filter out the `cal*` settings.
- [ ] **#54/#55 `5599e1f`: the hundreds digit of an altitude** (`AltitudeFieldset.test.ts`).
    - CAL 2 (`outer('L',1)`, `inner('L',1)`), then `cursor('L')`, `outer('L',3)`, `inner('L',3)` (30000),
      `outer('L',2)`, `inner('L',1)`.
    - Expect `cal12IndicatedAltitude` 30100.
    - After `cursor('L')` and `inner('L',-1)`: CAL 1 row 1 is `'IND:30100ft'`. Do not assert CAL 2's own row: it
      reads 30100 even with the bug.
    - Spec, 5-11.
    - **Break:** `AltitudeFieldset.tsx:76` back to `oldAlt.substring(1, 2)`.
- [ ] **#33 `439244d`: CAL value propagation** (`Cal2Page.test.ts`). The table's reproduction is wrong in both halves.
    - **(a)** On CAL 2: `cursor('L')`, `outer('L',3)`, `inner('L',1)`. Row 2 is `'ALT:10000ft'`. Then `cursor('L')`,
      `inner('L',-1)`: CAL 1 row 1 is `'IND:10000ft'`.
    - **(b)** On CAL 3: `cursor('L')`, `inner('L',1)`. Row 1 is `'TAS   100kt'`. Then `cursor('L')`, view CAL 2, back
      to CAL 3: row 1 is `'TAS   000kt'` and `cal3Tas` is 0.
    - **Kind:** characterization (trainer, #33).
    - **Breaks:** remove `Cal2Page.tsx:70` (a); remove `:60` (b).
- [ ] **`ee0b000`: baro change on the ALT page** (`AltPage.test.ts`).
    - `alt()`, `inner('L',1)`.
    - Expect `unit.errors` `[]`, `sensors.in.airdata.barometer` 30.92, and left row 1 `'BARO:30.92"'`. After 1 s, the
      `barosetting` setting and the storage key are 30.92.
    - **Break:** remove `.bind(this)` at `AltPage.tsx:31`.
- [ ] **#56 `14972b6`: overlays pop and re-dispatch** (`MainPage.test.ts`).
    - **A:** `alt()`, `cursor('L')`. Names are `'ALT  '` / `'CRSR '`. Then `outer('L',1)`: names `'CAL 1'` /
      `'SUP  '`.
    - **B:** `dct()`, `cursor('L')`. `leftName()` is `'DIR  '` and row 0 is `'DIRECT TO:'`. Then `outer('L',1)`:
      `'CAL 1'`.
    - `unit.errors` is `[]` in both.
    - **Kind:** characterization (trainer).
    - **Breaks:** delete the pop-and-re-dispatch else blocks in `MainPage.tsx` (for example 351-355). Put the
      pop-on-cursor-off back in `DirectToPage.tick`. Set the names back to five blanks.
- [ ] **#64 `681181d`: the default date is 1 Jan 1988** (`DateEditor.test.ts`).
    - Boot with `storage: {fastGpsAcquisition: false, timezone: 1}`. Precondition: the GPS is not valid.
    - SET 2 (`outer('L',3)`, `inner('L',1)`), `cursor('L')`: row 2 is `'  01 JUN 26'`.
    - `inner('L',1)`: row 2 is `'  01 ___ __'`. Then `ent()`.
    - Expect row 2 `'  01 JAN 88'`, and the GPS time is 1988-01-01.
    - **Kind:** characterization.
    - **Break:** `Editor.tsx:116` `?? 0`.
- [ ] **`10c5a3d`: static editor characters are inverted** (`DateEditor.test.ts`, same boot options).
    - SET 2 with the cursor on: the row 2 mask, columns 0-10, is `'..IIIIIIIII'`.
    - **Break:** delete `DateEditor.tsx:60-61`. The mask becomes `'..II.III.II'`.
- [ ] **#46 `bca17fd`: the SET 10 page** (`Set10Page.test.ts`).
    - Boot with `storage: {timezone: 1}`, then `outer('L',3)`, `inner('L',-2)`.
    - Expect `unit.errors` `[]`, `leftName()` `'SET10'`, and row 0 `'GPS:   FAST'`.
    - **Kind:** characterization; the page is fictitious.
    - **Break:** add `{(this.children as any).get("importFlightplan").render()}` back into `Set10Page.tsx`'s `<pre>`.
- [ ] **`fb671c0`, `74134be`, `9d1fe96`: page names** (`pageNames.test.ts`).
    - Boot with `storage: {timezone: 1}`. Do not use `selectPage`.
    - `outer('L',3)`, then `inner('L',1)` nine times, reading `leftName()` after each:
      `['SET 1','SET 2',…,'SET 9','SET10']`.
    - TRI: `outer('L',-3)` from NAV 2, then six inner clicks: `['TRI 0',…,'TRI 6']`.
    - Cite 3-57 (SET 9) and 5-6 (TRI 5). Check SET 7's page before citing it.
    - **Break:** put the old names back (`Set9Page` `"SET 7"`, `Set7Page` `"SET 8"`, `Tri5Page` `"TRI 3"`).
- [ ] **`2b9f811`: the SET 0 update sequence** (`Set0Page.test.ts`).
    - `outer('L',3)`, `inner('L',-1)` opens the full-page overlay. Walk the steps:
        - **Step 0** rows: `'      U P D A T E'`, `'   D A T A   B A S E'`, `'   O N   G R O U N D'`, `'        O N L Y '`,
          `''`, `'     KEY C70220BE'`. Status row `'SET 0|        msg|     '`.
        - **`cursor('L')`:** row 3 is `'  UPDATE PUBLISHED DB'`.
        - **`ent()`:** rows `'      U P D A T E'`, `''`, `'     INTERNATIONAL'`, `'   DATA BASE EXPIRES'`, the date (copy
          it from `dump()`), `'     U P D A T E ?'`.
        - **`ent()` again:** `'      L O A D E R'` and `'   N O T   R E A D Y'`, and `leftName()` is `'SET 0'`.
    - Cite 3-7 for the status line. The source for the steps is the video https://youtu.be/7l57UDAuz8A: watch it and
      cite timestamps. If it cannot be watched, label the step rows characterization and say so in the report.
    - **Break:** remove the SET 0 conditions in `StatusLine.tsx:147-151` and `187-189`.
- [ ] **#25 `96b3de3`: keyboard input for all editors** (`KeyboardService.test.ts`).
    - `cursor('R')`, `outer('R',5)` (USER POS?), `ent()`. Right row 4 is `"_ __°__.__'"`, and its mask is
      `'IIIIIIIIII.'`.
    - Send `KLN90B_Internal_Key:RIGHT:` + `N`,`4`,`7`,`3`,`0`,`0`,`0`, advancing 250 ms each. Row 4 is `"N 47°30.00'"`.
    - **Kind:** characterization (a sim-only feature).
    - **Break:** the body of `Editor.keyboard` (`Editor.tsx:186-198`) becomes `return false;`.
    - **Suspected, half-fixed #25:** characters cannot be typed into fields whose charset entries are longer than one
      character: the DateEditor day and month, and the longitude hundreds digit, so "0" fails below 100°. Pin
      `#NEW-5-<n>` if confirmed; it references #25.
- [ ] **#75 `4b11c06`: Escape leaves keyboard mode** (`PageContainer.test.ts`).
    - `cursor('R')`, then `const input = document.querySelector('input.keyboard') as HTMLInputElement`.
    - `input.dispatchEvent(new MouseEvent('mousedown', {button: 0, screenX: 700, screenY: 350}))`, then
      `input.focus()` (needed in happy-dom; it stands in for Coherent's focus), then advance 250 ms.
    - `isRightKeyboardActive()` is true and `rightName()` is `'KYBD '`.
    - `input.dispatchEvent(new KeyboardEvent('keypress', {keyCode: 27}))`, advance 250 ms: inactive and `'CRSR '`.
    - **Kind:** characterization. The test holds the handler only, not how Coherent delivers the key.
    - **Break:** delete `PageContainer.tsx:162-169`.
- [ ] **`f347a2c`: ENT moves the cursor** (`CursorController.test.ts`).
    - CAL 1, `cursor('L')`: the row 1 mask, columns 0-10, is `'....I......'`. After `ent()` it is `'.....I.....'`.
    - Cite the YouTube short in the code comment (https://www.youtube.com/shorts/9We5fcd2-VE).
    - **Break:** `CursorController.ts:213` becomes `} else if (result === EnterResult.Handled_Move_Focus) {`.
- [ ] **`8e9a7c4`: with SCAN pulled and the cursor on, the knob changes the field** (`MainPage.test.ts`, a separate
  `it`).
    - NAV 4 on the right, `cursor('R')`: row 3 is `'SEL:00000ft'`.
    - `scan()`, `inner('R',1)`: row 3 is `'SEL:10000ft'` and `nav4SelectedAltitude` is 10000.
    - **Kind:** characterization (trainer).
    - **Break:** drop the `if (!…cursorActive)` guard at `MainPage.tsx:499-505`.
- [ ] **Other suspected bugs** found by the research. Confirm each, pin it where a test can observe it
  (`#NEW-5-<n>`), and report:
    - the UTC timezone name has 12 characters (`Time.ts:10`), so SET 2 overflows;
    - `"OKT"` instead of `"OCT"` (`EditorField.tsx:135`);
    - the typo `"RECYLCE"` (`Set2Page.tsx:134` and `151`);
    - `HpaBaroFieldset.saveBaro10` calls the callback twice (`BaroFieldset.tsx:135-136`);
    - exactly 0° shows S/W in the lat and lon editors (`value > 0`).

```json:metadata
{"files": ["test/render/pages/left/Cal1Page.test.ts", "test/render/pages/left/Cal2Page.test.ts", "test/render/controls/selects/AltitudeFieldset.test.ts", "test/render/pages/left/AltPage.test.ts", "test/render/pages/MainPage.test.ts", "test/render/controls/editors/DateEditor.test.ts", "test/render/pages/left/Set10Page.test.ts", "test/render/pages/left/pageNames.test.ts", "test/render/pages/left/Set0Page.test.ts", "test/render/services/KeyboardService.test.ts", "test/render/controls/PageContainer.test.ts", "test/render/pages/CursorController.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every listed row has a commit with a proof line or a reported re-verdict", "suspected bugs pinned as #NEW-5-n or reported unconfirmed", "npm test and tsc clean in the worktree"], "modelTier": "standard"}
```

---

### Task 6: public contract and pages (render)

**Goal:** A proven regression test for each of `955b535`, #51, #52, #53, #5, #65, #72, `f95d1d7`, `8045b29`,
`9a17b5b`, #35, #38, #26, `8c3b2e0` and `b7fd10a`/`44fb0a4`.

**Files:**
- Create:
    - `test/render/pages/left/SelfTestLeftPage.test.ts`
    - `test/render/PowerButton.test.ts`
    - `test/render/BrightnessManager.test.ts`
    - `test/render/pages/left/Oth5Page.test.ts`
    - `test/render/controls/ErrorPage.test.ts`
    - `test/render/pages/right/Apt1Page.test.ts`
    - `test/render/pages/right/IntPage.test.ts`
    - `test/render/pages/right/ActPage.test.ts`
    - `test/render/pages/right/WaypointConfirmPage.test.ts`
    - `test/render/pages/left/Oth3Page.test.ts`
    - `test/render/pages/right/Apt2Page.test.ts`
    - `test/render/pages/right/Apt3Page.test.ts`
    - `test/render/controls/editors/WaypointEditor.test.ts`
    - `test/render/pages/left/SuperNav.test.ts`

**Acceptance Criteria:**
- [ ] Each of the listed rows has a commit with a proof line, or a reported re-verdict.
- [ ] `npm test` and `npx tsc --noEmit` are clean in the worktree.

**Verify:** `npx vitest run test/render` → all pass.

**Rows:**

- [ ] **`955b535`: the course output during the self-test is 315°** (`SelfTestLeftPage.test.ts`).
    - Boot with `engineRunning: false, magvar: 0`. Send `KLN90B_Power_On`, advance 19 s.
    - The left half contains `'   OUT 315°'` and `'RMI    130°'`.
    - `GPS WP DESIRED TRACK` in degrees is close to 315; `GPS OBS VALUE` close to 315; `L:KLN90B_GPS_WP_BEARING` in
      degrees close to 130; `unit.errors` `[]`.
    - Spec, 3-4.
    - **Break:** `NavCalculator.ts:49` becomes `nav.desiredTrack = 130;`.
- [ ] **#51 `124b094`: `Power_On`/`Power_Off`** (`PowerButton.test.ts`).
    - `powercycles` is 1 after boot.
    - `KLN90B_Power_On`: still 1, no new write of `L:KLN90B_POWER`, NAV 2 still shown.
    - `KLN90B_Power_Off`: the LVar is 0, the screen text is empty, and `#InstrumentsContainer` opacity is `'0'`.
    - `Power_On` twice: `powercycles` is 2, the LVar writes since Power_Off are exactly `[0, 1]`, and row 0 is the
      welcome page's (`WelcomePage.tsx:128`; copy it from `dump()`).
    - **Kind:** characterization of the public contract.
    - **Breaks:** delete `PowerButton.ts:48-53`. Separately, map both events to `togglePowerSwitch()`.
- [ ] **#52 `5da8165`: `L:KLN90B_Brightness` is writable** (`BrightnessManager.test.ts`).
    - Advance 5 s. `sim.set('L:KLN90B_Brightness','number',0.5)`, advance 300 ms: opacity ≈ 0.5.
    - `KLN90B_Brt_Inc`: about 0.55. `Brt_Dec` twice: about 0.45.
    - **Kind:** characterization (the `LVars.ts:25` contract).
    - **Break:** delete `SimVarSync.ts:57`.
- [ ] **#53 `66204f4`: fuel on board from EX1** (`Oth5Page.test.ts`).
    - `panelXml` with `<Input><FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer></Input>`.
    - Set `FUEL TOTAL QUANTITY WEIGHT EX1` to 300 pounds and the decoy `FUEL TOTAL QUANTITY WEIGHT` to 600 pounds.
    - `selectPage('L','OTH 5')`, advance 1.5 s: row 1 is `'FOB      50'` (300 lb at 6 lb/gal) and row 0 ends with
      `'GAL'`.
    - **Break:** drop `' EX1'` at `Sensors.ts:115`.
- [ ] **#5 `bf08926`: the error page** (`ErrorPage.test.ts`).
    - Publish `new Error('boom')` on the bus `error` topic.
    - `.errorpage` is not `d-none`. `.errormessage` text starts with `'Error: boom'`, and its HTML contains `<br>`
      followed by the second stack line.
    - `ok.click()`: hidden. Publish again: shown. `suppress.click()`: hidden. A third error stays hidden.
    - **Kind:** characterization (not part of the real unit).
    - **Breaks:** delete `ErrorPage.tsx:52`; separately, delete `:66`.
- [ ] **#65 `201f443`: user airport at the user position** (`Apt1Page.test.ts`).
    - `selectPage('R','APT 1')`, `cursor('R')`, then send `KLN90B_Internal_Key:RIGHT:Z` four times.
    - Move the outer knob to `USER POS?`, with a guard of 8, then `ent()`.
    - Expect `unit.errors` `[]`, `rightName()` `'CRSR'`, highlighted cells on half row 4 (lat) and none on row 5, and
      row 0 containing `'ZZZZ'`.
    - `outer('R',1)`: still no errors, and the highlight moves to row 5.
    - Spec, 5-19, for the cursor going to the latitude.
    - **Break:** revert the three hunks: `Apt1Page.tsx:101` back to the bound method; `setFacility` unconditional after
      170, deleting 175 and 181; delete 228.
- [ ] **#72 `3977549`: REF entry through the confirmation page** (`IntPage.test.ts`). The old bug ignored the second
  ENT rather than throwing.
    - Facilities: `intersection('INTA',47.1,8.0)`, `vor('ABC',47.2,8.0)`, `vor('XYZ',48.5,8.0)`.
    - `selectPage('R','INT')`, advance 9 s, `cursor('R')`, `outer('R',5)`, type X,Y,Z with keyboard keys, `ent()`:
      `rightName()` is `'VOR  '`.
    - `ent()`: `unit.errors` `[]`, `rightName()` `'CRSR'`, and right row 1 `'REF:  XYZ  '`.
    - Spec, 3-14 to 3-15.
    - **Break:** `WaypointConfirmPage.isEnterAccepted` returns false, and delete `enter()` (`:92-104`).
- [ ] **`f95d1d7`: the ACT page refreshes** (`ActPage.test.ts`).
    - Facilities `airport('KAAA',47.0,7.9)` and `airport('KBBB',47.0,8.3)`, position 47.0/8.0.
    - `selectPage('R','ACT  ')`: rows 2 and 4 are `'NO ACTIVE  '` and `'WAYPOINT   '`.
    - `insertLegIntoFpl` KAAA at 0, then KBBB at 1, into FPL 0 (`services/FlightplanUtils`). Advance 3 s.
    - No `'NO ACTIVE'` any more; row 0 contains `'KBBB'` and `' 2 '`; `rightName()` is `'ACT 1'`.
    - Spec, 4-10.
    - **Break:** delete `ActPage.tsx:141-153`.
- [ ] **`8045b29`: the confirmation page from ACT has the waypoint-page layout** (`WaypointConfirmPage.test.ts`).
    - Plan `[kaaa, inta]` with INTA ahead; `vor('ABC')` near and `vor('XYZ')` far.
    - First record the plain VOR page's row 0 for XYZ.
    - Then on ACT (INTA active): `cursor('R')` (lands on REF), advance 9 s, type XYZ, `ent()`.
    - Row 0 equals the recorded one, with no `' 2 '` index; `unit.errors` `[]`.
    - Spec, 3-14.
    - **Break:** delete `WaypointConfirmPage.tsx:81-83`.
- [ ] **`9a17b5b`: the list scrolls to keep the focus visible** (`Oth3Page.test.ts`).
    - Seven user intersections, AAA to GGG, as V2 strings.
    - `selectPage('L','OTH 3')`, `cursor('L')`, `outer('L',5)`.
    - Rows 1-5 are `'BBB   I    '` to `'FFF   I    '`. Mask row 5, columns 0-10, is `'IIIIIIIIIII'`, and rows 1-4 have no
      `I`.
    - **Kind:** characterization.
    - **Break:** remove the `+ 1` at `List.tsx:62`.
- [ ] **#26 `84a3008`: deleting on OTH 3 keeps the row** (`Oth3Page.test.ts`, a second `it`).
    - Four user intersections AAA, BBB, CCC, DDD. `cursor('L')`, `outer('L',1)`, `clr()`: row 2 is `'DEL BBB   ?'`.
    - `ent()`: rows 1-3 are AAA, CCC, DDD, and the highlight is on row 2.
    - Spec, 5-20 and 4-5.
    - **Break:** `ListItem.tsx:80` back to `Handled_Move_Focus`, and `CursorController.enter` back to
      `if (result !== Handled_Keep_Focus) this.outerRight();`.
- [ ] **#35 `13d360b`: APT 2 elevation in feet** (`Apt2Page.test.ts`).
    - Only `airport('KAAA',47.1,8.0,{elevationFt: 1234})`. `selectPage('R','APT 2')`: row 3 is `'ELV  1230ft'`.
    - Spec: look up the APT 2 page.
    - **Break:** `Apt2Page.tsx:245` back to `Math.round(apt.altitude / 10) * 10`. The row then shows 380.
- [ ] **#38 `645c008`: APT 3 without runways** (`Apt3Page.test.ts`). The table is wrong: APT 3 is offered, without
  the map.
    - `{...airport('KAAA',47.1,8.0), runways: []}`. `selectPage('R','APT 3')`.
    - Expect `unit.errors` `[]`, `rightName()` `'APT 3'`, and rows 2-4 `'  RUNWAY   '`, `' DATA NOT  '`,
      `' AVAILABLE '`.
    - **Kind:** characterization.
    - **Break:** `Apt3UserPage.getRunway` back to `facility!.runways[0]` with the `rwy.length` check. Or remove
      `|| facility.runways.length == 0` at `Apt3MapPage.tsx:26`.
- [ ] **`8c3b2e0`: an FPL leg awaiting confirmation blinks** (`WaypointEditor.test.ts`).
    - `selectPage('L','FPL 0')`, `cursor('L')`, `enterIdent('L','KAAA')`, `ent()` (awaiting; `rightName()` is
      `'APT 1'`).
    - Over four 250 ms advances, the mask on the ident cells is `'IIIII'` three times and `'FFFFF'` once.
    - Spec, 3-14.
    - **Break:** delete `WaypointEditor.tsx:109`.
- [ ] **`b7fd10a`, `44fb0a4`: Super NAV 1 and 5 without an active waypoint** (`SuperNav.test.ts`).
    - `KLN90B_LeftSmallKnob_Left` once, then `KLN90B_RightLargeKnob_Left` five times.
    - The overlay is a `SuperNav1Page` and `unit.errors` is `[]`.
    - Then `LeftSmallKnob_Left` and `RightSmallKnob_Left`: the overlay is a `SuperNav5Page`, and still no errors.
    - Spec, 3-31, for the trigger.
    - **Break:** `getIdent()` in `SuperNav1Page.tsx:91-97` and `SuperNav5Left.tsx:91-97` uses `getActiveLeg()!` again.

```json:metadata
{"files": ["test/render/pages/left/SelfTestLeftPage.test.ts", "test/render/PowerButton.test.ts", "test/render/BrightnessManager.test.ts", "test/render/pages/left/Oth5Page.test.ts", "test/render/controls/ErrorPage.test.ts", "test/render/pages/right/Apt1Page.test.ts", "test/render/pages/right/IntPage.test.ts", "test/render/pages/right/ActPage.test.ts", "test/render/pages/right/WaypointConfirmPage.test.ts", "test/render/pages/left/Oth3Page.test.ts", "test/render/pages/right/Apt2Page.test.ts", "test/render/pages/right/Apt3Page.test.ts", "test/render/controls/editors/WaypointEditor.test.ts", "test/render/pages/left/SuperNav.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every listed row has a commit with a proof line or a reported re-verdict", "npm test and tsc clean in the worktree"], "modelTier": "standard"}
```

---

### Task 7: issues and close-out

**Goal:**
- File every confirmed bug from tasks 2 to 6.
- Replace every `#NEW-` placeholder with its issue number.
- Tick the triage table and write the session log.
- Document the harness traps found in `testing.md`.
- Leave the session branch green.

**Files:**
- Modify:
    - `docs/test-coverage.md` (section 3 checkbox, section 4 log, section 5 table)
    - `docs/testing.md` (section 6 limitations, section 7 next steps)
    - the test files that contain `#NEW-` pins

**Acceptance Criteria:**
- [ ] Every confirmed bug is a GitHub issue with the `bug` label. Open *and* closed issues were searched first, and a
  bug two tasks found is one issue.
- [ ] `grep -rn "#NEW-" test/` prints nothing, and every pin names an open issue.
- [ ] Every session 2 row in the triage table is ticked with its test path, or carries a new verdict with a reason.
- [ ] Session 2's checkbox is ticked.
- [ ] The section 4 log entry for session 2 has these parts:
    - what was done;
    - re-verdicts;
    - bugs filed;
    - fixes that could not be re-broken;
    - what was not covered;
    - coverage at the start (equal to the session 1 baseline) and at the end.
- [ ] `testing.md` section 6 names these harness traps:
    - ENT errors become unhandled rejections;
    - `enterIdent` does not work on the waypoint selectors;
    - names are shifted while `CRSR` is shown;
    - subscriptions replay the last value.

  Section 7 lists the extensions they suggest.
- [ ] `npm test`, `npx tsc --noEmit` and `npm run coverage` run clean on the session branch.

**Verify:** `grep -rn "#NEW-" test/ ; npm test ; npx tsc --noEmit` → no grep output, all tests pass, no tsc output.

**Steps:**

- [ ] **Step 1:** Collect the bug lists from the five reports and the reviewers' findings classified as instrument
  bugs. Deduplicate them.
- [ ] **Step 2:** File each bug per `CLAUDE.md`.
    - Search open and closed issues with several wordings first.
    - A bug that continues a closed issue references it (as #98 does #78).
    - Cite manual pages; never copy manual text.
    - Record the mapping from placeholder to issue number.
- [ ] **Step 3:** Replace each placeholder in `test/`. Run `npm test`; the pins stay expected fails. Commit:
  `Replaced the session 2 pin placeholders with their issues`.
- [ ] **Step 4:** Tick the triage rows with their test paths. Apply each re-verdict with its reason in the how / why
  column. Tick session 2's checkbox.
- [ ] **Step 5:** Run `npm run coverage` and record the per-directory table. Write the section 4 entry, dated, newest
  first.
- [ ] **Step 6:** Add the harness traps to `testing.md` sections 6 and 7.
- [ ] **Step 7:** Run `npm test` and `npx tsc --noEmit`, then commit: `Completed session 2 of the test coverage plan`.

```json:metadata
{"files": ["docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "grep -rn \"#NEW-\" test/ ; npm test && npx tsc --noEmit", "acceptanceCriteria": ["confirmed bugs filed after duplicate search", "no #NEW- placeholders remain", "triage rows ticked or re-verdicted", "session log written with coverage start/end", "harness traps documented", "npm test, tsc, coverage clean"], "modelTier": "standard"}
```

---

## Execution order

1. Task 1 runs alone on the session branch, then gets its spec-compliance review and its code-quality review.
2. Tasks 2 to 6 run in parallel, in worktrees branched from the session branch after task 1.
3. Each batch gets its two reviews in sequence. Fix rounds go to the same implementer. The controlling session merges
   each approved branch into the session branch, then runs `npm test` and `npx tsc --noEmit`.
4. Task 7 runs after all five batches are merged.
5. The final review of the whole session runs on the controlling session's model, and then the maintainer is asked to
   approve.
