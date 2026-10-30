# A SID or STAR replaced by one of the same length (#445) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A SID or STAR replaced by one of the same length, while the aircraft flies from its last fix, activates the closest leg exactly as a replacement of a different length does.

**Architecture:** One condition in `ActiveWaypoint.assertToMatchesFplIdx` changes: the early return also requires that the leg in front of the active waypoint is still `fromPlanLeg`. Otherwise the check falls through into the existing Direct To branch and #440 code unchanged.

**Tech Stack:** TypeScript (target es2017), Vitest unit stage.

**Spec:** `docs/superpowers/specs/2026-10-30-same-length-procedure-replacement-design.md`

## Global Constraints

- Branch `fix-445-same-length-procedure`; never push (the maintainer pushes).
- The design and this plan go in one plain commit first, as the project's earlier designs did; the fix is then one `fixes #445 …` commit with the code, its tests and the `test/README.md` change (CLAUDE.md, one commit per issue).
- American English; no counts of growing collections in prose; no manual text copied (cite pages only).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npx tsc --noEmit`, `npm run build` and `npm test` must all pass before the fix commit.

## Review Focus

1. A Direct To to a plan waypoint while the leg in front of it is replaced: it keeps its origin, its target and its turn state (it never passes the new check and must go on to the Direct To branch).
2. A procedure replaced while the active leg is further down the plan, the FROM untouched: nothing changes, the leftover turn entries and the plan included (the new check must not fire when the FROM's leg is still the same instance).
3. The STAR case: a STAR replaced in front of the first approach fix, the approach legs kept (`Apt7Page.loadNow` inserts the STAR before the approach).
4. The turn state after a same-length replacement is cleared as `activateFpl0` clears it, the run-out of an abeam turn included.

Each line has its test in Task 1.

---

### Task 1: The leg in front of the active waypoint is checked by instance (#445)

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts:498` (the first early return of `assertToMatchesFplIdx`) and its comment
- Test: `test/unit/data/flightplan/ActiveWaypoint.test.ts` (the `describe` of #445 at the end of the file)
- Modify: `test/README.md:768-772` (the paragraph "Pin known bugs with `it.fails`")

**Interfaces:**
- Consumes: existing `ActiveWaypoint` API (`activateFpl0`, `directToFlightplanIndex`, `getActiveLeg`, `getActiveFplIdx`, `getFromWpt`, `getFromLeg`, `isDctNavigation`, `turnStack`, `turnPlan`, `startOwnTurn`), `Flightplan` batch API (`startBatchInsert`, `removeProcedure`, `insertLeg`, `finishBatchInsert`), the test file's helpers (`activeWaypointWith`, `user`, `fromHere`, `A`–`D`, `NM`, `pointFrom`, `intersection`, `identsOf`).
- Produces: nothing other code uses.

- [ ] **Step 1: Rework the #445 describe into regression tests**

In the #445 describe:
- Add the local helpers the other describes define for themselves: `anyTurn()` and `runOut()` as in the #440 describe (lines 632-638), and `app(wpt, fixType)` as in the `getActiveFafLeg` describe (line 309), plus `star(ident, p)` built like `sid` with `KLNLegType.STAR`.
- Give `replaceSid` a hook `replaceSid(beforeBatch: (aw: ActiveWaypoint) => void = () => {})`, called after `activateFpl0` and the `before` snapshot, before `startBatchInsert`.
- Turn the comment above the describe from a pin into a regression test (the bug, what the fix checks; no "a fix that … turns the pin red").
- Keep the control sibling as it is. The first test below replaces the `it.fails` pin under its own name, as a plain `it`.

Tests (names and assertions; the geometry of the STAR test may be adjusted if its precondition fails, keeping STB2 15° off STA2 as seen from DEF):

```ts
it('makes the new SID\'s last fix the FROM when the active SID is replaced by one of the same length (#445)', () => {
    const {aw} = replaceSid();
    // As NavCalculator.updateActiveLeg reads it: the active leg first, which runs assertToMatchesFplIdx, then the FROM
    expect(aw.getActiveLeg()!.wpt.icaoStruct.ident).toBe('ABC');
    expect(aw.getFromWpt()!.icaoStruct.ident).toBe('SIDB2');
    expect(aw.getActiveFplIdx()).toBe(3);
    // The path is the great circle SIDB2 - ABC: a point 10 NM from B toward SIDB2 lies on it
    expect(Math.abs(aw.getFromLeg()!.path.distance(pointFrom(B, 300, 10)))).toBeLessThan(NM(0.01));
});

it('clears the turn state, the run-out included, as a replacement of a different length does (#445)', () => {
    const {aw} = replaceSid(aw => {
        aw.turnStack.push(runOut());
        aw.turnPlan = TurnPlan.AT_ABEAM;
    });
    expect(aw.getActiveFplIdx()).toBe(3);
    expect(aw.turnStack).toEqual([]);
    expect(aw.turnPlan).toBeNull();
});

it('makes the new STAR\'s last fix the FROM when the STAR in front of the first approach fix is replaced by one of the same length (#445)', () => {
    // KAAA ABC STA1 STA2 DEF(IAF) GHI(FAF); the aircraft 10 NM along STA2 - DEF, so DEF (index 4) is active from STA2
    const legs = [user(A), user(B), star('STA1', pointFrom(C, 225, 30)), star('STA2', pointFrom(C, 180, 20)),
        app(C, KLNFixType.IAF), app(D, KLNFixType.FAF)];
    const {aw, fpl} = activeWaypointWith(legs, pointFrom(C, 180, 10));
    aw.activateFpl0();
    expect(aw.getActiveFplIdx()).toBe(4); // Precondition: DEF is active, from STA2
    expect(aw.getFromWpt()!.icaoStruct.ident).toBe('STA2');
    const iaf = fpl.getLegs()[4];

    fpl.startBatchInsert();
    fpl.removeProcedure(KLNLegType.STAR);
    fpl.insertLeg(2, star('STB1', pointFrom(B, 270, 20)));
    fpl.insertLeg(3, star('STB2', pointFrom(C, 195, 20)));
    fpl.finishBatchInsert();

    expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'ABC', 'STB1', 'STB2', 'DEF', 'GHI']);
    expect(aw.getActiveLeg()).toBe(iaf);
    expect(aw.getFromWpt()!.icaoStruct.ident).toBe('STB2');
});

it('keeps a Direct To to the first en-route waypoint when the SID in front of it is replaced by one of the same length', () => {
    const position = pointFrom(B, 315, 10);
    const origin = fromHere(position);
    let leftover: TurnStackEntry | undefined;
    const {aw} = replaceSid(aw => {
        aw.directToFlightplanIndex(origin, 3);
        leftover = anyTurn();
        aw.turnStack.push(leftover);
        aw.turnPlan = TurnPlan.AT_LEAD;
    });
    expect(aw.getActiveFplIdx()).toBe(3);
    expect(aw.isDctNavigation()).toBe(true);
    expect(aw.getFromWpt()).toBe(origin);
    expect(aw.turnStack).toEqual([leftover]);
    expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
});

it('changes nothing when the SID is replaced while an en-route leg further down is active', () => {
    // KAAA SIDA1 SIDA2 ABC DEF GHI with the aircraft 20 NM along ABC - DEF: DEF (index 4) is active from ABC
    // Same SID swap as replaceSid; the FROM's leg (ABC) is the same instance afterwards
    // Before the batch: turnStack.push(leftover = anyTurn()), turnPlan = AT_LEAD, from = aw.getFromLeg()
    // After: getActiveFplIdx() === 4, getFromLeg() toBe(from), turnStack toEqual([leftover]), turnPlan AT_LEAD
});
```

The last test is built inline (its own legs and position `pointFrom(B, 0, 20)`, precondition `getActiveFplIdx() === 4` and FROM `ABC`), with the batch of `replaceSid`; the comment lines above give its assertions.

- [ ] **Step 2: Run the tests and check which fail**

Run: `npx vitest run --project unit test/unit/data/flightplan/ActiveWaypoint.test.ts`
Expected: exactly three fail, the SID FROM test, the turn-state test and the STAR test (the old FROM is kept, the turn state with it). The control sibling, the Direct To test and the "changes nothing" test pass. If the STAR test fails at its precondition instead, fix the geometry before going on.

- [ ] **Step 3: Extend the early return in `assertToMatchesFplIdx`**

The condition at `ActiveWaypoint.ts:498` becomes

```ts
if (this.fplIdx < legs.length && this.to === legs[this.fplIdx] && legs[this.fplIdx - 1] === this.fromPlanLeg) {
```

Rewrite the comment above it to say: the active waypoint and the leg its FROM was made from are both compared by instance (the instance remark that is there now stays); #445: a procedure replaced by one of the same length leaves the active waypoint at its index, and only the leg in front of it shows the edit; a Direct To never passes (its `fromPlanLeg` is null) and goes to the Direct To branch below, which finds the target where it was. Nothing else in the method changes.

- [ ] **Step 4: Run the file's tests**

Run: `npx vitest run --project unit test/unit/data/flightplan/ActiveWaypoint.test.ts`
Expected: all pass.

- [ ] **Step 5: Prove the former pin**

Restore the old condition (drop `&& legs[this.fplIdx - 1] === this.fromPlanLeg`), run Step 4's command, and see the SID FROM test fail; restore the fix and check that `git diff` shows only the intended changes.

- [ ] **Step 6: Update `test/README.md`**

In the paragraph "Pin known bugs with `it.fails`": the suite may hold none at a given time again; name the #445 pin (the commit that added it, `a2ea5616`, in `test/unit/data/flightplan/ActiveWaypoint.test.ts`, with the sibling that holds its preconditions) and the #440 pin (commit `7ca2612b`) as examples from the history, removed with their fixes.

- [ ] **Step 7: Run all checks**

Run: `npx tsc --noEmit`, then `npm run build`, then `npm test`
Expected: tsc clean; the build prints only the known circular-dependency and Sass warnings; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add kln90b/data/flightplan/ActiveWaypoint.ts test/unit/data/flightplan/ActiveWaypoint.test.ts test/README.md
git commit -m "fixes #445 a SID or STAR replaced by one of the same length activates the closest leg instead of keeping the old FROM"
```

(with the Co-Authored-By line from Global Constraints)
