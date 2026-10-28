# MOVE ? on a DME arc entry next to the active leg: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After MOVE ? on a DME arc entry, `ActiveWaypoint` uses the moved entry whether it is the leg before the active
leg (#420), the active waypoint (#442) or the leg after it (#441).

**Architecture:** `moveArcEntry` (`kln90b/services/FlightplanUtils.ts`) calls one new public method,
`ActiveWaypoint.onArcEntryMoved(idx)`, after `Flightplan.setArcEntry`. The method decides by `idx` relative to the active
index. `setArcEntry` keeps changing the leg in place.

**Tech Stack:** TypeScript, `@microsoft/msfs-sdk`, Vitest (unit, render, flight stages).

**Spec:** `docs/superpowers/specs/2026-10-28-arc-entry-move-design.md`

## Global Constraints

- Branch `arc-entry-move`. Three commits, one per issue, each `fixes #NN <description>` with its tests and doc changes,
  in the order of the tasks below. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never `git push`. Never close an issue.
- Cite Pilot's Guide pages (6-17, 6-18) and the issue numbers in comments; never copy manual text.
- `target: es2017`; no newer runtime features.
- American English; no counts of growing collections in prose.
- The turn rule is #408 rule (c): drop the waypoint's own started turn (`ownTurnStarted` and the stack), clear an
  `AT_LEAD` plan, keep an `AT_ABEAM` plan, keep a leftover of the previous waypoint's turn. That is exactly what the
  private `onFollowingLegChanged()` does today; reuse it, do not copy it.
- `recalculatePath()` stays public and unchanged (`test/render/data/navdata/NavCalculator.test.ts:738` calls it).

## Review Focus

- A Direct To to the arc entry (`idx === activeIdx`, `isDctNavigation()`): the path is rebuilt from the Direct To origin
  to the moved entry, and the turn rule applies. Test in Task 2.
- A Direct To to the waypoint after the entry (`idx === activeIdx - 1` while `isDctNavigation()`): `from` stays the
  Direct To origin. Test in Task 3.
- A Direct To outside FPL 0 (`getActiveFplIdx() === -1`): the method changes nothing and does not throw. Test in Task 1.
- An arc entry two or more legs away: no turn state and no `from` changes. Test in Task 1.
- The arc active with a turn still on the stack from the previous waypoint (the turn onto the arc): #420 leaves the
  stack and the plan alone. Test in Task 3.

---

### Task 1: The move tells ActiveWaypoint, and the entry after the active waypoint (#441)

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (new public method beside `recalculatePath`, ~line 344)
- Modify: `kln90b/services/FlightplanUtils.ts:135-138`
- Modify: `docs/architecture.md:502-513` (the #408 paragraph and the API list) and `:749-752` (the SidStar MOVE ? bullet)
- Test: `test/unit/data/flightplan/ActiveWaypoint.test.ts`, `test/flight/flights/dmeArc.test.ts:226-287`

**Interfaces:**
- Produces: `ActiveWaypoint.onArcEntryMoved(idx: number): void`. Called by `moveArcEntry` after `fpl.setArcEntry(idx, newData)`
  succeeded. `idx` is the index of the moved leg in FPL 0. Reads the active index through `getActiveFplIdx()`. Returns
  at once when it is -1. In this task: `idx === active` calls `recalculatePath()` (today's behavior moved out of
  `moveArcEntry`); `idx === active + 1` calls `onFollowingLegChanged()`; anything else does nothing.
- Produces (test fixture, file scope in `ActiveWaypoint.test.ts`): an arc route builder used by Tasks 2 and 3. Station
  `STN` at 47.0 N 8.0 E; the arc entry `PPP` on the 270 radial at 10 NM with `arcData` as in the existing `arcPlan()`
  (a right arc 270 to 000, the circle reversed), `QQQ` on the 000 radial at 10 NM, `RRR` 30 NM east of `QQQ`. Its
  argument is the user legs that come before the entry. A helper `movedArcData(radial)` returns a copy of the entry's
  `ArcData` (spread) with `entryFacility`, `beginPoint` and `beginRadial` for that radial at 10 NM and **the same
  `circle` object**, as `SidStar.recalculateArcEntryData` does. Moving the existing `arcPlan()` to file scope and
  building on it is fine.

- [ ] **Step 1: Write the unit tests** in a new `describe('ActiveWaypoint.onArcEntryMoved (6-17)')`:
  - `it('drops the own started turn and a lead plan when the entry after the active waypoint moves (#441)')`: legs
    `KAAA` (270 radial, 40 NM), `ABC` (270 radial, 20 NM), the arc route. Aircraft on the 270 radial at 30 NM;
    `activateFpl0()`; precondition `getActiveFplIdx() === 1`. `aw.startOwnTurn(entry)` with any `TurnStackEntry`,
    `aw.turnPlan = TurnPlan.AT_LEAD`. `fpl.setArcEntry(2, movedArcData(280))`, `aw.onArcEntryMoved(2)`. Expect
    `ownTurnStarted` false, `turnStack` `[]`, `turnPlan` null.
  - `it('keeps an abeam plan and a leftover of the previous turn when the entry after the active waypoint moves (#441)')`:
    the same, with `turnPlan = AT_ABEAM` and an entry pushed onto `turnStack` directly (not through `startOwnTurn`).
    Expect `turnPlan` `AT_ABEAM` and `turnStack` still `[entry]` (`toBe` the same object).
  - `it('changes nothing when an entry two legs after the active waypoint moves')`: legs `KAAA` (40 NM), `ABC` (25 NM),
    `DEF` (15 NM), the arc route, aircraft at 32 NM, active index 1. Own started turn and `AT_LEAD` set as above.
    `setArcEntry(3, …)`, `onArcEntryMoved(3)`. Expect `ownTurnStarted` true, the stack unchanged, `AT_LEAD`, and
    `getFromLeg()` the same object as before.
  - `it('changes nothing during a Direct To outside FPL 0')`: the #441 legs, `aw.directTo(fromHere(pos), off)` with a
    VOR not in the plan; precondition `getActiveFplIdx() === -1`; own started turn set. `onArcEntryMoved(2)` does not
    throw; the turn state and `getFromLeg()` are unchanged.

- [ ] **Step 2: Run them to see the first two fail and the last two pass**

  Run: `npx vitest run test/unit/data/flightplan/ActiveWaypoint.test.ts`
  Expected: all four fail with `onArcEntryMoved is not a function`.

- [ ] **Step 3: Implement `onArcEntryMoved(idx: number): void`** in `ActiveWaypoint.ts`, as in Interfaces, with a doc
  comment citing 6-17, #441 and the design. In `moveArcEntry`, replace the `if (idx === activeWpt.getActiveFplIdx())`
  block with `activeWpt.onArcEntryMoved(idx)`.

- [ ] **Step 4: Turn the flight pin green.** In `test/flight/flights/dmeArc.test.ts`, change
  `it.fails('drops the turn started onto the old entry when the entry is moved (#441)'` to `it(`. Reword the comment
  over the describe (`:226-228`) from "the unit does not notice" to the behavior: MOVE ? on the arc entry after the
  active waypoint drops the turn started onto the old entry, as an edit of the next leg does (#408).

- [ ] **Step 5: Run the tests**

  Run: `npx vitest run test/unit/data/flightplan/ActiveWaypoint.test.ts test/flight/flights/dmeArc.test.ts test/render/controls/FlightplanList.test.ts test/render/data/navdata/NavCalculator.test.ts`
  Expected: all pass. The #420 pin in `FlightplanList.test.ts` is still an `it.fails` and still passes as such.

- [ ] **Step 6: Update `docs/architecture.md`.** In the #408 paragraph add that MOVE ? on the arc entry after the
  active waypoint reaches the same handling through `onArcEntryMoved` (#441), because `setArcEntry` keeps the
  instance. Add `onArcEntryMoved` to the API list. In the SidStar bullet, say that `moveArcEntry` then tells
  `ActiveWaypoint.onArcEntryMoved` which leg moved.

- [ ] **Step 7: Type check, full suite, commit**

  Run: `npx tsc --noEmit` and `npm test`. Expected: clean, all green.
  Commit: `fixes #441 MOVE ? on the arc entry after the active waypoint drops the turn started onto the old entry`

### Task 2: The entry that is the active waypoint (#442)

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (`onArcEntryMoved`)
- Modify: `docs/architecture.md` (the same #408 paragraph)
- Test: `test/unit/data/flightplan/ActiveWaypoint.test.ts`, `test/flight/flights/dmeArc.test.ts`

**Interfaces:**
- Consumes: `onArcEntryMoved(idx)` and the arc route fixture from Task 1.
- Produces: in `onArcEntryMoved`, `idx === active` calls `recalculatePath()` and then `onFollowingLegChanged()`.

- [ ] **Step 1: Write the unit tests** in the Task 1 describe:
  - `it('drops the own started turn and a lead plan when the active entry moves, and rebuilds the path (#442)')`:
    legs `KAAA` (270 radial, 40 NM), the arc route. Aircraft on the 270 radial at 20 NM; `activateFpl0()`;
    precondition `getActiveFplIdx() === 1`, active ident `PPP`. Own started turn and `AT_LEAD` set. `setArcEntry(1,
    movedArcData(280))`, `onArcEntryMoved(1)`. Expect `ownTurnStarted` false, `turnStack` `[]`, `turnPlan` null,
    `getFromWpt()` ident `KAAA`, and the new entry on `getFromLeg()!.path` (`distance < NM(0.01)`).
  - `it('keeps an abeam plan and a leftover of the previous turn when the active entry moves (#442)')`: as Task 1's
    second test, for `idx` 1.
  - `it('applies the same rule to a Direct To to the entry (#442)')`: the same legs,
    `aw.directToFlightplanIndex(fromHere(pos), 1)`, own started turn and `AT_LEAD` set, move. Expect the turn state
    dropped as above, `isDctNavigation()` true, `getFromWpt()` the Direct To origin, the new entry on the path.

- [ ] **Step 2: Write the flight test** in `dmeArc.test.ts`, a new
  `describe('MOVE ? on the arc entry that is the active waypoint (#442)')`. Reuse the Task 1 flight's world and start.
  Generalize `inTurnToArcEntry` into a helper that takes the ident whose own turn to fly into and the seconds to fly
  after it started; for #442: fly until the entry `D184J` is active and `ownTurnStarted`, then 3 s more.
  - Control, `it('moves the active entry while its turn onto the arc has started (control of the #442 test)')`:
    `flight.nav.activeIdent` `D184J`, `ownTurnStarted` true, the stack not empty; `move()` returns true; the new
    entry is at least 0.2 NM from the old one (`distanceNm`). If it is less, fly longer into the turn, so the track
    meets the arc elsewhere.
  - `it('drops the turn started onto the old entry when the active entry is moved (#442)')`: keep the old stack
    entries, `move()`, `fly(1)`. Expect the active ident to be the moved entry's, none of the old entries on
    `aw.turnStack`, `ownTurnStarted` true (the aircraft is inside the new lead, so the new turn starts at once, as in
    #408 run a2), and the top entry's `turnBisector!.wpt` within 0.01 NM of the moved entry (`fpl0.getLegs()[2].wpt`).
    If the new turn does not start at once, report it instead of weakening the assertion.

- [ ] **Step 3: Run them to see them fail**

  Run: `npx vitest run test/unit/data/flightplan/ActiveWaypoint.test.ts test/flight/flights/dmeArc.test.ts`
  Expected: the first and third unit tests and the flight test fail (the turn state is kept); the abeam test and the
  control pass.

- [ ] **Step 4: Implement** the `idx === active` branch as in Interfaces. Extend the method's doc comment: the rule is
  the design's call for a moved active waypoint, not flown in the trainer, which offers no MOVE ? (#442).

- [ ] **Step 5: Run the tests**, the Task 1 command. Expected: all pass.

- [ ] **Step 6: Update `docs/architecture.md`**: the #408 paragraph says the same handling follows `recalculatePath`
  when the moved entry is the active waypoint (#442, the design's call).

- [ ] **Step 7: Type check, full suite, commit**

  Run: `npx tsc --noEmit` and `npm test`. Expected: clean, all green.
  Commit: `fixes #442 MOVE ? on the arc entry that is the active waypoint drops the turn started onto the old entry`

### Task 3: The entry behind the aircraft, the from waypoint of the active arc (#420)

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (`onArcEntryMoved`, `setFplData` ~line 370)
- Modify: `docs/architecture.md` (the `ActiveWaypoint` section, where `from` is described, ~line 496)
- Test: `test/unit/data/flightplan/ActiveWaypoint.test.ts`, `test/render/controls/FlightplanList.test.ts:579-605`

**Interfaces:**
- Consumes: `onArcEntryMoved(idx)` and the arc route fixture.
- Produces: in `onArcEntryMoved`, `idx === active - 1` and not `isDctNavigation()` sets `from` to a new object built by
  the rule `setFplData` uses. Extract that rule into a private helper used by both, e.g.
  `private fromLegOf(from: KLNFlightplanLeg, to: KLNFlightplanLeg): FromLeg` (an arc leg gives
  `{wpt, path: arcData.circle}`, any other leg the great circle in `CACHED_CIRCLE`). Only `from` changes: not `to`, not
  the Direct To flag, not the saved active waypoint, not the turn state.

- [ ] **Step 1: Write the unit tests** in the Task 1 describe:
  - `it('makes the moved entry the from waypoint of the active arc, with the arc as its path (#420)')`: legs `KAAA`
    (270 radial, 40 NM), the arc route. Aircraft on the arc at the 330 radial; `activateFpl0()`; precondition active
    ident `QQQ`, index 2, `getFromWpt()` ident `PPP`. Own started turn and `AT_LEAD` set. `setArcEntry(1,
    movedArcData(300))`, `onArcEntryMoved(1)`. Expect `getFromWpt()` to be `legs[1].wpt` (the moved facility),
    `getFromLeg()!.path` `toBe` `legs[1].arcData!.circle`, and `ownTurnStarted` true, the stack and `AT_LEAD`
    unchanged.
  - `it('keeps the Direct To origin as from when the entry before the Direct To waypoint moves (#420)')`:
    the same legs, `directToFlightplanIndex(fromHere(pos), 2)`, move index 1. Expect `getFromWpt()` the origin and
    `getFromLeg()` the same object as before the move.

- [ ] **Step 2: Turn the render pin green.** In `FlightplanList.test.ts`, change
  `it.fails('makes the moved entry the from waypoint of the active arc leg (#420)'` to `it(`. Add the assertion that
  the from path is still the arc: `getFromLeg()!.path.isGreatCircle()` false. Reword the control's comment
  (`:579-581`): the move makes the moved entry the from waypoint (#420, below), and the control holds the setup.

- [ ] **Step 3: Run them to see them fail**

  Run: `npx vitest run test/unit/data/flightplan/ActiveWaypoint.test.ts test/render/controls/FlightplanList.test.ts`
  Expected: the first unit test and the render test fail (`PPP`/`D225J` is still the from waypoint); the Direct To
  test passes.

- [ ] **Step 4: Implement** the helper, use it in `setFplData`, and add the `idx === active - 1` branch as in
  Interfaces.

- [ ] **Step 5: Run the tests**, the Task 1 command. Expected: all pass.

- [ ] **Step 6: Update `docs/architecture.md`**: where `from` is described, say it is a copy made at the activation,
  which MOVE ? on the entry of the active arc renews (#420).

- [ ] **Step 7: Type check, full suite, commit**

  Run: `npx tsc --noEmit` and `npm test`. Expected: clean, all green.
  Commit: `fixes #420 MOVE ? on the entry of the active arc makes the moved entry the from waypoint`
