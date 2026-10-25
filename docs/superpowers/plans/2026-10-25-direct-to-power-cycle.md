# Direct To over a power cycle (#422) and the purge of the active waypoint (#193) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a power-off of more than 5 minutes the unit drops an active Direct To and comes back on an FPL 0 leg,
still opening on the old target's page; the purge of temporary waypoints spares the active waypoint.

**Architecture:** `VolatileMemory.reset` copies the last active waypoint for the start page and, after a long
power-off, calls a new `ActiveWaypoint.dropDirectTo()` that leaves no active leg; `NavCalculator` then activates the
closest FPL 0 leg as at a sim restart. `TemporaryWaypointDeleter` gets the `ActiveWaypoint` and skips its waypoint.

**Tech Stack:** TypeScript (es2017), MSFS Avionics Framework, Vitest render stage (happy-dom, headless unit).

**Spec:** `docs/superpowers/specs/2026-10-25-direct-to-power-cycle-design.md`

## Global Constraints

- Branch `trainer-checks-193-422`; no merge and no push (the maintainer approves the merge).
- Two commits, in this order: `fixes #422 …`, then `fixes #193 …`; each with its tests and doc changes (CLAUDE.md).
  Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- The 5-minute check is the existing `evt.timeSincePowerChange > RESET_TIME` in `VolatileMemory.reset`.
- Off for 5 minutes or less: the Direct To is kept (unchanged code path).
- Public contract unchanged: the `activeWaypoint` setting keeps its V2 format; the SDK planner mirror
  (`WTFlightplanSync`) follows through the existing `activeWaypointChanged` event.
- Manual references in comments: 3-3, 3-8, 3-29, 6-5, 5-22, 5-26, C-1; trainer checks cited as "checked in the KLN 89
  trainer, 2026-10-25" and "AVsoftech KLN 90B trainer, 2026-10-25 (maintainer)".
- American English; no counts of growing collections in prose.

## Review Focus

- **The leg is activated before the database page is acknowledged.** The start page must still show the old target.
  Task 1 has a test that waits on the database page until the new leg is active.
- **A Direct To to an approach waypoint over a long power-off.** The procedures are removed and the Direct To dropped in
  the same reset; the unit must come back on the remaining FPL 0 leg without an error. Task 1 test.
- **FPL 0 with fewer than two waypoints.** The unit comes up flagged (AVsoftech, maintainer 2026-10-25). Task 1 test.
- **A stale procedure leg after a long power-off.** A plan leg (not a Direct To) to a DME arc entry waypoint whose
  approach the reset removed must not protect that waypoint from the purge. Task 2 test.
- **The power-off run of the purge.** At the power-off the Direct To is still active, so its target must survive that
  run too, not only the power-on run. Task 2's short-cycle test covers both runs.

---

### Task 1: Drop the Direct To after a long power-off (#422)

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (new method next to `cancelDirectTo`, ~line 151)
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState` field; `reset()` ~line 326-381)
- Modify: `kln90b/pages/PageManager.ts:63` (`startMainPage`)
- Modify: `docs/kln89-trainer-record.md` (new block at the end)
- Modify: `docs/architecture.md` (~line 806-810, the 5-minute exception; ~line 975-977, `startMainPage`)
- Modify: `docs/superpowers/specs/2026-10-25-direct-to-power-cycle-design.md` only if the build departs from it
- Test: `test/render/data/VolatileMemory.test.ts` (describe `the Direct To over a power cycle (#422)`, ~line 84)

**Interfaces:**
- Produces: `ActiveWaypoint.dropDirectTo(): void`. No-op unless `isDctNavigation()`; otherwise leaves no active leg
  (`getActiveWpt()` null, `getActiveFplIdx()` -1, `isDctNavigation()` false) and publishes `activeWaypointChanged` with
  -1. It does not write the `activeWaypoint` setting. The private `flag()` does exactly this (its
  `saveLastActiveWaypoint()` is a no-op once nothing is active), so the body is `if (this.isDirectTo) this.flag();`.
- Produces: `NavPageState.startPageWaypoint: Facility | null`, initialized `= null` (the #192 guard needs an
  initializer), set to `lastactiveWaypoint` in the `NavPageState` constructor, and set to
  `this.navPage.activeWaypoint.lastactiveWaypoint` at the top of the powered branch of `reset()`, before anything else.

- [ ] **Step 1: Write the failing tests** in the existing `#422` describe, which already has the `kaaa`/`kbbb`/`kccc`
  airports, `directToOutsideFpl0()` and the precondition sibling. Replace the `it.fails` pin with a plain `it` and add
  the rest. The file's `cycle(unit, offSeconds)` helper powers off, approves the self-test and waits 2 s.

```ts
it('drops the Direct To after a power-off of more than 5 minutes and comes back on the leg to KBBB (KLN 89 trainer 2026-10-25, #422)', async () => {
    const unit = await directToOutsideFpl0();
    const aw = unit.props.memory.navPage.activeWaypoint;
    await cycle(unit, 600);
    expect(aw.isDctNavigation()).toBe(false);
    expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
});

it('keeps the Direct To over a power-off of 5 minutes or less (6-5, AVsoftech KLN 90B trainer 2026-10-25, #422)', async () => {
    const unit = await directToOutsideFpl0();
    const aw = unit.props.memory.navPage.activeWaypoint;
    await cycle(unit, 60);
    expect(aw.isDctNavigation()).toBe(true);
    expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KCCC');
});
```

  `opens on the page of the dropped Direct To target although the leg to KBBB is already active (3-8, KLN 89 trainer
  2026-10-25, #422)`: `directToOutsideFpl0()`, `unit.panel.powerCycle({offSeconds: 600})`, then do by hand what
  `approveSelfTest()` does, with a pause on the data base page: advance 1 s at a time until `Screen.read().text()`
  contains `APPROVE?` (cap 30 s), `unit.panel.cursorTo('R', 'APPROVE?')`, `unit.panel.ent()`, advance until the text
  contains `ACKNOWLEDGE?`, advance 5 s more, assert the precondition `activeIdent(unit) === 'KBBB'` (import
  `activeIdent` from `../../harness/readers`), then `unit.panel.ent()` and advance 1 s. Assert
  `Screen.read().status().right` is `'APT 4'` and `Screen.read().rows('R')[0].slice(1).split(' ')[0]` is `'KCCC'`
  (the airport case of 3-8, as `test/render/pages/PageManager.test.ts` reads it).

  `drops a Direct To to an approach waypoint with the approach after a power-off of more than 5 minutes (6-5, #422)`:
  `const unit = await approachLoadedAt(40)` (the file's helper; FPL 0 ENRAA, approach, KPRC),
  `await unit.panel.directTo('FAFAA')`, precondition `aw.isDctNavigation()` true and active ident `FAFAA`;
  `cycle(unit, 600)`; assert `unit.errors` equals `[]`, `fplIdents(unit)` equals `['ENRAA', 'KPRC']`,
  `aw.isDctNavigation()` false, active ident `KPRC`.

  `comes up flagged when FPL 0 has fewer than two waypoints after a power-off of more than 5 minutes (AVsoftech KLN 90B
  trainer 2026-10-25, #422)`: `bootUnit({facilities: [kccc], position: {lat: 47.1, lon: 8.0}})`, `settle`,
  `directTo('KCCC')`, precondition `isDctNavigation()` true; `cycle(unit, 600)`; assert `aw.getActiveWpt()` is null and
  `aw.isDctNavigation()` false.

  Update the describe's comment: the AVsoftech check (short power-off keeps it, a restart drops it) joins the KLN 89
  evidence, and the pin is gone.

- [ ] **Step 2: Run them and see the right ones fail**

  Run: `npx vitest run --project render test/render/data/VolatileMemory.test.ts -t "#422"`
  Expected: the drop, start-page (on its `APT 4`/`KCCC` assertion or the `KBBB` precondition), approach and flagged
  tests FAIL; the precondition sibling and the short power-off test PASS.

- [ ] **Step 3: Implement**
  - `ActiveWaypoint.dropDirectTo()` as in Interfaces, with a doc comment citing #422 and 6-5.
  - `NavPageState.startPageWaypoint` as in Interfaces, with a comment: 3-8, the page shown first after the power-on;
    copied before the power-on can activate a new leg, which overwrites `lastactiveWaypoint` (#422).
  - In `reset()`, inside the existing `if (evt.timeSincePowerChange > RESET_TIME)` block that removes the procedures,
    after `removeProcedures()`: `this.navPage.activeWaypoint.dropDirectTo();` with a comment citing the two trainer
    checks of 2026-10-25 and that `NavCalculator` activates the closest FPL 0 leg as at a sim restart.
  - `PageManager.startMainPage` reads `props.memory.navPage.startPageWaypoint` instead of
    `activeWaypoint.lastactiveWaypoint`.

- [ ] **Step 4: Run the #422 tests and the whole file**

  Run: `npx vitest run --project render test/render/data/VolatileMemory.test.ts`
  Expected: all PASS, including `resets every field of the page states at a power-on (#192)` (the guard checks
  `startPageWaypoint` too: the reset overwrites the sentinel with the boot's last active waypoint, null).

- [ ] **Step 5: Verify by mutation.** Revert one change at a time, run the file, restore, and check `git diff`:
  - `dropDirectTo()` call removed → the drop, approach and flagged tests fail; the short power-off test stays green.
  - `PageManager` back to `lastactiveWaypoint` → the start-page test fails. If it stays green, the leg was not active
    before the start page was chosen: lengthen the pause on the data base page until the precondition holds.
  - The `RESET_TIME` condition dropped (call it on every power-on) → the short power-off test fails.

- [ ] **Step 6: Docs**
  - `docs/kln89-trainer-record.md`, new block `**2026-10-25** (the maintainer's checks in the third-party AVsoftech KLN
    90B trainer, which is unreliable, for #422; the VM was running)`: turning the unit off and on quickly kept the
    Direct To; closing the program and starting it again dropped it and activated FPL 0; with fewer than two
    waypoints in the flight plan the unit came up flagged after a restart. The maintainer adopted it as the 5-minute
    rule (6-5). Outcome: #422.
  - `docs/architecture.md`: in the 5-minute exception, add that `reset()` drops an active Direct To after more than
    5 minutes (`ActiveWaypoint.dropDirectTo`, #422) and `NavCalculator` activates the closest FPL 0 leg; at
    `startMainPage`, say it opens on `navPage.startPageWaypoint`, the waypoint active at the power-off, copied by
    `reset()`.

- [ ] **Step 7: Full check and commit**

  Run: `npx tsc --noEmit` (clean) and `npm test` (all pass; the expected-fail count drops by one, the #422 pin).

```bash
git add kln90b/data/flightplan/ActiveWaypoint.ts kln90b/data/VolatileMemory.ts kln90b/pages/PageManager.ts \
  test/render/data/VolatileMemory.test.ts docs/kln89-trainer-record.md docs/architecture.md
git commit -m "fixes #422 A Direct To is dropped after a power-off of more than 5 minutes; the start page still shows its target"
```

### Task 2: The purge spares the active waypoint (#193)

**Files:**
- Modify: `kln90b/services/TemporaryWaypointDeleter.ts` (constructor, `deleteUnusedTemporaryWaypoints`)
- Modify: `kln90b/KLN90BCore.ts:386` (pass `memory.navPage.activeWaypoint`; comment on the subscription order)
- Modify: `docs/architecture.md` (~line 711, the purge)
- Test: `test/render/services/TemporaryWaypointDeleter.test.ts`

**Interfaces:**
- Consumes: `ActiveWaypoint.dropDirectTo()` from Task 1 (through the power-on reset).
- Produces: `TemporaryWaypointDeleter` constructor
  `(repo: KLNFacilityRepository, bus: EventBus, flightplans: Flightplan[], activeWaypoint: ActiveWaypoint)`.

- [ ] **Step 1: Write the failing tests.** Replace `deletes a temporary waypoint that is the active direct-to target
  once no plan holds it (characterization)` with two tests on the same set-up (EFB route with CUST, D-> CUST, re-sync
  without CUST, the three precondition asserts):
  - `keeps a temporary waypoint that is the active Direct To target over a power cycle of 5 minutes or less, also when
    no plan holds it (C-1, #193)`: `powerCycle()` (1 s), `approveSelfTest()`, advance 2 s; assert
    `userWaypointNames(unit)` equals `['CUST XY']` and `activeIdent(unit)` is `'CUST'`.
  - `deletes the former Direct To target at the power-on after more than 5 minutes off, once the Direct To is dropped
    (5-22, 5-26, #422, #193)`: `powerCycle({offSeconds: 600})`, `approveSelfTest()`, advance 2 s; assert
    `userWaypointNames(unit)` equals `[]` and `unit.props.memory.navPage.activeWaypoint.isDctNavigation()` is false.

  Add `does not spare the entry waypoint of a DME arc on a plan leg that the power-on removed with its approach (5-22,
  #193)`: the world of the existing DME arc test plus `enr = intersection('ENRAA', at(190, 30).lat, at(190, 30).lon)`,
  boot at `at(190, 20)` with `savedFlightplan(0, [enr, kprc])`, `loadProcedure('APT 8')`; preconditions
  `userWaypointNames` `['D190J XY']`, `activeIdent` `'D190J'`, `isDctNavigation()` false (if another leg is active,
  move the boot position along radial 190 until D190J is); `powerCycle({offSeconds: 600})`, `approveSelfTest()`; assert
  `fplIdents(unit)` `['ENRAA', 'KPRC']` and `userWaypointNames(unit)` `[]`.

  Relabel the other two characterizations (the purge at the boot, the DME arc entry waypoint) from
  `(characterization)` to `(#193)`, and change the file's comment above them: the power-on purge is the run that
  applies the power-off deletion of 5-22 and 5-26, answered in #193.

- [ ] **Step 2: Run them and see the right ones fail**

  Run: `npx vitest run --project render test/render/services/TemporaryWaypointDeleter.test.ts`
  Expected: the short power cycle test FAILS (`[]` instead of `['CUST XY']`); the long one and the new DME arc test
  PASS already (nothing spares yet), so they hold the guard against an over-wide skip.

- [ ] **Step 3: Implement.** Store the `ActiveWaypoint`; in `deleteUnusedTemporaryWaypoints`, read
  `this.activeWaypoint.getActiveWpt()` once before the loop and skip a facility whose `icaoStruct` equals the active
  one's (`ICAO.valueEquals`). Use `getActiveWpt()`, not a field read: it resolves a plan leg that the reset's
  `removeProcedures()` left stale, so a removed arc entry waypoint is not taken for active. Comment: C-1 (OTH 3
  refuses ACTIVE WPT), #193. In `KLN90BCore`, pass `memory.navPage.activeWaypoint` and add a comment that the deleter
  must be built after `VolatileMemory`, whose power-on reset removes the procedures and drops the Direct To before the
  purge runs (#94, #422).

- [ ] **Step 4: Run the file**

  Run: `npx vitest run --project render test/render/services/TemporaryWaypointDeleter.test.ts`
  Expected: all PASS.

- [ ] **Step 5: Verify by mutation.** Revert one change at a time, run the file, restore, check `git diff`:
  - the skip removed → the short power cycle test fails;
  - the skip reading the active leg's waypoint without `getActiveWpt()`'s resolution (a temporary public field read)
    → the new DME arc test fails;
  - Task 1's `dropDirectTo()` call removed from `reset()` → the long power-off test fails (the purge then still sees
    CUST as active).

- [ ] **Step 6: Docs.** `docs/architecture.md` ~line 711: the purge spares the active waypoint (#193), and relies on
  running after `VolatileMemory.reset` at the power-on.

- [ ] **Step 7: Full check and commit**

  Run: `npx tsc --noEmit` (clean), `npm test` (all pass), `npm run build` (succeeds; no new circular-dependency
  warning beyond the pre-existing ones).

```bash
git add kln90b/services/TemporaryWaypointDeleter.ts kln90b/KLN90BCore.ts \
  test/render/services/TemporaryWaypointDeleter.test.ts docs/architecture.md
git commit -m "fixes #193 The purge of temporary waypoints spares the active waypoint"
```
