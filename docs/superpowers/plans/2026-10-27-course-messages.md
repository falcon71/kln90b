# Course Messages and the Waypoint Alert at a Turn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ADJ NAV IND CRS TO nnn°`, `ADJ NAV IND CRS`, the WPT light and the Super NAV 5 ident behave per installation
case as the design describes (#437, #401, #434, #436, #435).

**Architecture:** The WPT light moves from the 1 Hz `NavCalculator.setOutput` to the 4 Hz `StatusLine.tick`, which has the
blink, and flashes except during a turn. A small `SustainedCondition` counts "held for more than 12 s" in GPS time for both
course messages. `NavCalculator` marks the tick on which the DTK takes the next leg by itself (`legChangeDtkDelta`), and one
`AdjustCourseToMessage` decides the readable and the unreadable case per tick. The Direct To page stops setting the course of
a readable, undriven indicator.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (unit, render, flight).

**Spec:** `docs/superpowers/specs/2026-10-26-course-messages-design.md`

## Global Constraints

- Work on the branch `adj-nav-ind-crs`. Never `git push`.
- One commit per issue, with its tests and comments, in this order: `fixes #437`, `fixes #401`, `fixes #434`, `fixes #436`,
  `fixes #435`. Each message is `fixes #NN <plain sentence>` and ends with the line
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- "More than 12 s" is measured in GPS time, `sensors.in.gps.timeZulu.getTimestamp()` (milliseconds), never `Date.now()`.
  `Gps` replaces the `timeZulu` object on some ticks, so read it through `sensors.in.gps` every time.
- Thresholds: TO message more than 5° (`> 5`); plain message more than 0.5° (`> 0.5`); 12 s means `now - since > 12_000`.
- Comments cite Pilot's Guide pages (4-8, 4-9, B-1, 3-16, 3-29, 5-37), the KA 90 manual pages (3-43, 3-45), the videos
  and the issue numbers as the spec does. Never copy manual text.
- American English. No counts in prose for things that grow.
- `L:KLN90B_WptLight` keeps its name; it now flashes (the maintainer's decision). No new LVar, H event or panel.xml key.
- Every field added to `NavPageState` gets an initializer and a reset in `VolatileMemory.reset` (the guard test in
  `test/render/data/VolatileMemory.test.ts` fails otherwise).
- Do not add circular imports; the build prints the pre-existing ones.
- Before each commit: `npx tsc --noEmit` clean, and the stage tests named in the task green. Before the last commit:
  `npm test` and `npm run build` green.

## Review Focus

1. **The sim is paused** with a readable course off the DTK: GPS time stands still, so no message may post during the pause;
   it posts more than 12 s of GPS time after the course went off. Pinned in Task 2 (`SustainedCondition`).
2. **GPS time jumps** (a time entered on SET 2 before the fix, the correction at the fix, a changed sim time or a high sim
   rate): a backward jump or one forward of more than 60 s restarts the count instead of posting at once. Pinned in Task 2.
3. **The CDI is switched away from GPS** while a readable TO message is listed: the case becomes unreadable, the message
   goes, and nothing is posted until a leg change. Pinned in Task 4.
4. **`Output.ObsTarget` changes at run time** (`L:KLN90B_ObsTarget`): the TO message goes when it becomes 1 or 2, and the
   plain message is evaluated from then on. Pinned in Task 2 and Task 3.
5. **Two leg changes in a row** in the unreadable case (short legs, the second turn starting before the first message is
   read): the number follows the new DTK and the removal follows the turn now being flown. Pinned in Task 4.

---

### Task 1: The WPT light and the Super NAV 5 ident at a turn (#437)

**Files:**
- Create: `kln90b/data/navdata/WaypointAlert.ts`
- Modify: `kln90b/controls/StatusLine.tsx:194-206` (write the WPT light beside the MSG light)
- Modify: `kln90b/data/navdata/NavCalculator.ts:635` (remove the `setWptAlertLight` call and its comment)
- Modify: `kln90b/controls/SuperNav5Left.tsx:67`
- Modify: `kln90b/LVars.ts:24` (comment: flashes during the alert before a turn and before a waypoint without a turn, steady
  during the turn and on the self-test, as the real light does; like `L:KLN90B_MsgLight` the aircraft adds no flash of its own)
- Test: `test/render/SensorsOut.test.ts:265-305`, `test/render/controls/SuperNav5Left.test.ts`,
  `test/flight/flights/waypointAlertTurn.test.ts`, `test/flight/flights/firstFlight.test.ts:25,47`,
  `test/flight/flights/directToPlanWaypoint.test.ts:31`

**Interfaces:**
- Produces, in `kln90b/data/navdata/WaypointAlert.ts`:
  - `isWaypointAlertSteady(nav: NavPageState): boolean`: `nav.isSelfTestActive || nav.activeWaypoint.turnStack.length > 0`
    (4-8: steady from the start of the turn; Installation Manual 2-69: lit during the self-test).
  - `isWptLightOn(nav: NavPageState, blink: boolean): boolean`: `nav.waypointAlert && (isWaypointAlertSteady(nav) || !blink)`,
    the `!blink` pattern of the MSG light. Import `NavPageState` with `import type`.

- [ ] **Step 1: Write the failing tests**

In `SensorsOut.test.ts`, replace `is 1 at every sample while the alert is on` (and the ruling comment above the describe,
which the maintainer has reversed) with:

```ts
it('flashes before the turn (4-8, #437)', async () => {
    // the same 24 samples from 0.8 NM to 0.6 NM before ABC as before; the turn starts about 0.3 NM before ABC
    expect(alerts).toEqual(Array(24).fill(true));
    expect(turnStacks).toEqual(Array(24).fill(0));      // turnStackLength(unit) at each sample
    expect(new Set(samples)).toEqual(new Set([0, 1]));
});
it('is steady during the turn (4-8, #437)', async () => {
    // advance the aircraft past the turn start (about 0.3 NM before ABC) until turnStackLength(unit) > 0, then 8 display ticks
    expect(samples).toEqual(Array(8).fill(1));
});
```

In `SuperNav5Left.test.ts`, a describe `Super NAV 5 active ident at a turn (4-8, #437)` with
`flashes the active ident before the turn` (over `blinkCycle`, the ident cell text takes both the ident and blanks) and
`shows the active ident steady during the turn` (every read shows the ident).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/render/SensorsOut.test.ts test/render/controls/SuperNav5Left.test.ts`
Expected: FAIL: the light samples are all 1 before the turn; the ident blanks during the turn.

- [ ] **Step 3: Implement**

Create `WaypointAlert.ts` with the two functions. In `StatusLine.tick`, next to the MSG light:
`this.props.sensors.out.setWptAlertLight(isWptLightOn(this.props.memory.navPage, blink))`, with a comment citing 4-8, 3-29,
the Tu-154 video (https://youtu.be/S1lt2W95bLA, t=2245) and #437. Remove the write from `NavCalculator.setOutput`. In
`SuperNav5Left.tick` blank the ident only when `waypointAlert && !isWaypointAlertSteady(nav) && blink` (4-8). Update the
`LVars.ts` comment.

- [ ] **Step 4: Update the flight tests that read the light once per second**

The flights sample once per second, which can fall on the dark phase of a flashing light every time. In
`firstFlight.test.ts:25` and `directToPlanWaypoint.test.ts:31`, detect the start of the alert with `f.nav.waypointAlert`
instead of the LVar. `firstFlight.test.ts:47` (light 1 at the start of the turn) stays. In `waypointAlertTurn.test.ts`, the
monitor asserts `light() === 1` only while `turnStackLength(flight.unit) > 0`; rename it
`WPT light steady through the turn at ABC` and update the comment at line 21-24 (the light flashes before the turn, #437).

- [ ] **Step 5: Run the tests**

Run: `npx vitest run test/render/SensorsOut.test.ts test/render/controls/SuperNav5Left.test.ts test/render/controls/StatusLine.test.ts`
then `npx vitest run --project flight`
Expected: PASS. The power-off and self-test tests in `SensorsOut.test.ts` (setup B, lights lit) stay green.

- [ ] **Step 6: Commit**

`fixes #437 The WPT light flashes before an anticipated turn and goes steady when the turn starts`

---

### Task 2: `SustainedCondition` and the plain message after 12 s (#401)

**Files:**
- Create: `kln90b/data/SustainedCondition.ts`
- Test: `test/unit/data/SustainedCondition.test.ts`
- Modify: `kln90b/data/PersistentMessages.ts:21-41` (build both course messages always), `:106-129` (`AdjustCourseMessage`)
- Test: `test/unit/data/PersistentMessages.test.ts` (harness, describe `ADJ NAV IND CRS, a driven indicator`),
  `test/render/data/PersistentMessages.test.ts`

**Interfaces:**
- Produces `export class SustainedCondition` in `kln90b/data/SustainedCondition.ts`:
  - `constructor(durationMs: number)`
  - `update(holds: boolean, now: number): boolean`: true once `holds` has been true without a break and `now - since >
    durationMs`. Calls with the same `now` give the same answer (MessageHandler calls twice per tick). A `now` below the last
    one, or more than `MAX_TIME_STEP = 60_000` above it, restarts the count at `now` (Review Focus 2; 60 s, not a few
    seconds, so that a high sim rate does not restart it every tick).
  - `satisfy(now: number): void`: counts the condition as held for longer than the duration from `now` on.
  - `restart(now: number): void`: the count starts again at `now`.
  - `reset(): void`: forgets the count.
- Produces `export const COURSE_MESSAGE_DELAY = 12_000` in `PersistentMessages.ts` (KA 90 manual 3-43, 3-45; by analogy for a
  driven indicator, the maintainer, 2026-10-26).
- Produces in the unit test harness: `World.gpsTime: number` (ms, start `Date.UTC(2026, 5, 1, 12)`), `obsTarget` read through a
  getter so a test can change it between ticks, `sensors.in.gps.timeZulu.getTimestamp()` returning `w.gpsTime`, and
  `tickSeconds(h, w, seconds): string[]`, which runs `seconds` ticks with `w.gpsTime += 1000` before each and returns the
  messages after the last.

- [ ] **Step 1: Write the failing tests for `SustainedCondition`**

```ts
it('holds after more than the duration, not at it', ...)            // update(true, t0..t0+12000) false; t0+13000 true
it('starts again after a break', ...)                               // true 10 s, false once, true 12 s: false
it('gives the same answer twice at the same time', ...)
it('does not advance while the time stands still (the sim paused)', ...) // update(true, t0) x 100: false
it('restarts on a backward jump of the time', ...)                  // held 11 s, then now - 1 h: false for the next 12 s
it('restarts on a jump forward of more than 60 s', ...)             // held 5 s, then +2 h: false at that tick
it('is satisfied at once after satisfy', ...)                       // satisfy(t0); update(true, t0) true
it('counts again from restart', ...)                                // held 20 s, restart(t), false until t + 13 s
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/data/SustainedCondition.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `SustainedCondition`**

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run test/unit/data/SustainedCondition.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the plain message**

In the unit harness add `gpsTime`, the `obsTarget` getter and `tickSeconds`. Rewrite `driven()` to tick for a given number of
seconds. Tests in `ADJ NAV IND CRS, a driven indicator`:

```ts
it('shows after more than 12 s at 0.6 degrees off, to either side (B-1, #401)')   // [] after 12 s, ['ADJ NAV IND CRS'] after 13 s
it('does not show for an indicator that follows within 12 s (#401)')             // 0.6 off for 5 s, then on: [] through 30 s
it('stays listed once read while the indicator is off (3-16)')                   // seen = true, still listed, hasUnread false
it('goes as soon as the indicator is within 0.5 degrees (B-1)')
it('is evaluated from the tick Output.ObsTarget changes to 1 (#401)')            // obsTarget 0 -> 1 at run time, 13 s later listed
```

Keep `does the same for the second indicator target`, `does not show at 0.4 degrees off`, `compares across north`,
`does not show without a course read back` with the 13 s wait.

In `test/render/data/PersistentMessages.test.ts`, the reproduction of #401 as a spec test:
`posts no ADJ NAV IND CRS while the unit slews a driven indicator through a sequencing (#401)`: `bootUnit` engine running with
`panelXml({'Output.ObsTarget': 1})`, FPL 0 KAAA, ABC, KBBB, 4 NM before ABC, `Nav OBS:1` at 50,
`env.sim.applyObsKeyEvents = true`, flown at 240 kt along KAAA-ABC and on along ABC-KBBB, `messages(unit)` sampled every 250 ms:
none contains `ADJ NAV IND CRS`.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run test/unit/data/PersistentMessages.test.ts test/render/data/PersistentMessages.test.ts`
Expected: FAIL: the message shows on the first tick, and for about 1 s at each slew.

- [ ] **Step 7: Implement**

`AdjustCourseMessage(sensors, navState, planeSettings)` keeps a `SustainedCondition(COURSE_MESSAGE_DELAY)`. Per call: not
before `isSelfTestApproved` (#330), not with `planeSettings.output.obsTarget === 0`, not without `obsOut` or `obsMag`; in each
of these cases `reset()` and false. Otherwise `update(|diffAngle(obsOut, obsMag)| > 0.5, gps time)`.
`buildPersistentMessages` adds both course messages always (the run-time `ObsTarget`, `SimVarSync`); the TO message returns
false while `obsTarget !== 0` (give `AdjustCourseToWithObsReadingMessage` that guard now; Task 3 replaces the class). Cite
B-1, the KA 90 manual and #401 in the comment.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --project unit` then `npx vitest run --project render`
Expected: PASS.

- [ ] **Step 9: Commit**

`fixes #401 With a driven course indicator, ADJ NAV IND CRS waits until the indicator has been off for more than 12 s`

---

### Task 3: The leg-change marker and the readable case (#434)

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts:152` (fields), `:405-420` (reset)
- Modify: `kln90b/data/navdata/NavCalculator.ts` (top of `tick`, the Leg-mode DTK branch at `:209-215`, the calls of
  `startOwnTurn` and `sequenceToNextWaypoint`)
- Modify: `kln90b/data/PersistentMessages.ts:45-104` (`AdjustCourseToWithObsReadingMessage` becomes `AdjustCourseToMessage`)
- Test: `test/render/data/navdata/NavCalculator.test.ts`, `test/unit/data/PersistentMessages.test.ts`,
  `test/render/controls/StatusLine.test.ts:47-70,170-185`, `test/render/controls/SuperNav5Left.test.ts:198-260`,
  `test/render/pages/left/SelfTestLeftPage.test.ts:339-430`, `test/render/pages/left/Nav4Vnav.test.ts:319`

**Interfaces:**
- Consumes: `SustainedCondition`, `COURSE_MESSAGE_DELAY`, the harness additions of Task 2.
- Produces on `NavPageState`:
  - `legChangePending: boolean = false`: set by `NavCalculator` right after each `activeWaypoint.startOwnTurn(...)` (the lead
    and the abeam turn) and right after each `sequenceToNextWaypoint()` made while `activeWaypoint.ownTurnStarted` was false
    before the call and the active index changed (a sequencing without a turn, also the off-leg one of `tickOffLeg`). Not for
    the bisector sequencing after an own turn (the DTK switched at the turn start) and not for the invalid-path sequencing at
    `:150`, which happens before the DTK is computed.
  - `legChangeDtkDelta: Degrees | null = null`: at the top of `NavCalculator.tick` take `legChangePending` into a local, set it
    false and set `legChangeDtkDelta = null`; in the Leg-mode DTK branch, when the local was true and the previous
    `nav.desiredTrack` was not null, `legChangeDtkDelta = |diffAngle(previous desiredTrack, new dtk)|`. So it is non-null on
    exactly the tick whose DTK is the first of a leg change (the DTK switches the tick after the turn is pushed).
  - Both reset in `VolatileMemory.reset` (false, null).
- Produces `class AdjustCourseToMessage(sensors, modeController, navState, planeSettings)` with the readable rules below; its
  unreadable branch (`obsMag === null`) keeps today's forced-window code unchanged until Task 4.
- Produces in the unit harness: `World.legChangeDtkDelta: number | null`, `World.turnStackLength: number`, exposed as
  `navPage.legChangeDtkDelta` and `navPage.activeWaypoint.turnStack.length`.

- [ ] **Step 1: Write the failing marker tests** (render, `NavCalculator.test.ts`, describe
  `the leg-change marker (4-8, #434, #436)`, stepping 1 s at a time and reading `nav(unit).legChangeDtkDelta` after each)

```ts
it('marks the tick the DTK takes the next leg at an anticipated turn, once (4-8)')  // one non-null value, ≈ 34 (toBeCloseTo 0), DTK of that tick = leg 2
it('marks the sequencing without turn anticipation (4-9)')                          // storage turnAnticipation: false
it('does not mark a Direct To')                                                     // D-> KBBB: null on every tick
it('does not mark the bisector sequencing after the turn')                          // only the turn-start tick is marked
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/render/data/navdata/NavCalculator.test.ts`
Expected: FAIL (`legChangeDtkDelta` undefined).

- [ ] **Step 3: Implement the marker** as in Interfaces, and the reset in `VolatileMemory.reset`.

- [ ] **Step 4: Run the marker tests and the guard**

Run: `npx vitest run test/render/data/navdata/NavCalculator.test.ts test/render/data/VolatileMemory.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing readable-case tests** (unit, describe `ADJ NAV IND CRS TO nnn, a readable indicator`;
  delete the forced-window tests of this describe: `keeps ... for 30 s ... (#177)`, `closes the window at 30 s`,
  `starts a new 30 s window`, `ends the window once the message is read`, `does not open the window ...`,
  `opens the window ...` x3, `opens the window at the first DTK`)

```ts
it('shows after more than 12 s at 6 degrees off the DTK (B-1, KA 90 manual 3-43, 3-45)')   // [] at 12 s; ['ADJ NAV IND CRS TO 046°'] at 13 s
it('shows after more than 12 s at 6 degrees off on the other side (B-1)')
it('does not show at 5 degrees off the DTK (B-1)')
it('does not show when the indicator comes back within 12 s')                              // off 5 s, on, off 10 s: [] throughout
it('goes on the next tick once the indicator is within 5 degrees')
it('shows at once at a leg change with the indicator more than 5 degrees off the new DTK (4-8, B-1)') // legChangeDtkDelta 34 for one tick
it('does not show at a leg change with the indicator on the new DTK')
it('shows nothing after a DTK change with the indicator on the new course')                 // dtk and obsIn both 100: [] for 40 s
it('goes once read and comes back after more than 12 s if still off (the maintainer, 2026-10-27)') // seen at t; [] to t+12; listed unread at t+13
it('is not restarted by a DTK change while the indicator stays off')                       // off 8 s, dtk 46 -> 60 (no leg change), listed at 13 s
it('names a DTK of 359.7 as 000° (characterization, #361)')
it('does not show in OBS mode (B-1)')
it('goes when Output.ObsTarget changes to 1')                                             // Review Focus 4
```

Rewrite the describe `ADJ NAV IND CRS TO nnn before the self-test is approved` for the readable case: not evaluated before
the approval; listed 13 s after the approval with the indicator off; nothing at the approval with the indicator on; a message
listed before a power-off is gone after the next approval and not back before 13 s. The tests that are about the 30 s window
(`... opens no 30 s window`, `ends a window from before the power-off`) move to Task 4 in their unreadable form.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run test/unit/data/PersistentMessages.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement `AdjustCourseToMessage`, readable branch**

Per call, in this order: not approved or `obsTarget !== 0`, or no DTK, or OBS mode: forget all state, false. Set the text
from the live magnetic DTK. With `obsMag !== null`:

```ts
const off = Math.abs(NavMath.diffAngle(dtk, obsMag)) > 5;
if (this.seen) {                       // removed once read; counted again from the read (the maintainer, 2026-10-27)
    this.offTimer.restart(now);
    return false;
}
if (this.navState.legChangeDtkDelta !== null && off) {
    this.offTimer.satisfy(now);        // 4-8 with B-1: a leg change posts at once
}
return this.offTimer.update(off, now);
```

`MessageHandler` sets `seen = false` once the message is invalid, so it comes back unread. Comments cite B-1, 4-8, 3-16, the
KA 90 manual 3-43/3-45, the AVsoftech checks (docs/kln89-trainer-record.md, 2026-10-26) and #434.

- [ ] **Step 8: Move the render tests off the read-stays behavior**

`StatusLine.test.ts` (`is steady while a persistent message stays ...`, `keeps msg steady in inverse video once read ...`)
and `SuperNav5Left.test.ts` (`keeps msg steady when the unread message lapses ...`, `keeps msg steady in inverse video once
read ...`) need a message that stays read (3-16). Use the driven plain message: `bootOnStandardRoute({magvar: 4, panelXml:
panelXml({'Output.ObsTarget': 1})})`, `Nav OBS:1` 30° off the DTK, wait 15 s, expect `ADJ NAV IND CRS`; setting `Nav OBS:1`
back to `sensors.out.obsOut` ends it. In `SelfTestLeftPage.test.ts`, waits shorter than 13 s after the approval or an
engine-running start become 15 s; the expectations stay. In `Nav4Vnav.test.ts:319` check the comment still holds.

- [ ] **Step 9: Run the tests**

Run: `npx vitest run --project unit` then `npx vitest run --project render`
Expected: PASS.

- [ ] **Step 10: Commit**

`fixes #434 With a readable course, ADJ NAV IND CRS TO follows the indicator: at once at a leg change, otherwise after 12 s`

---

### Task 4: The unreadable case (#436)

**Files:**
- Modify: `kln90b/data/PersistentMessages.ts` (`AdjustCourseToMessage`, the `obsMag === null` branch; remove `lastCourse`,
  `validUntil`, `forceShow`, `atStartUp` and every `Date.now()`)
- Create: `test/flight/flights/courseMessageTurn.test.ts`
- Test: `test/unit/data/PersistentMessages.test.ts`

**Interfaces:**
- Consumes: `navPage.legChangeDtkDelta`, `navPage.activeWaypoint.turnStack`, the harness of Tasks 2 and 3.

- [ ] **Step 1: Write the failing unit tests** (describe `ADJ NAV IND CRS TO nnn, an unreadable indicator`, `w.obsIn = null`)

```ts
it('shows at a leg change of more than 5 degrees (4-8)')                    // delta 34, turnStackLength 1: listed that tick
it('does not show at a leg change of 5 degrees (4-8)')
it('stays through the turn and goes when the turn ends (4-8, the Tu-154 and CV580 videos)') // turnStackLength 1 for 40 s, then 0
it('goes once read, also during the turn (the maintainer, 2026-10-27)')
it('does not come back after it was read')
it('does not show at a DTK change that is no leg change, a Direct To (the Tu-154 video, 43:52)') // dtk 46 -> 100, delta null
it('characterization: stays without a turn until read (low confidence, the maintainer, 2026-10-27)') // turnStackLength 0: listed after 300 s
it('takes the new DTK and the new turn at a second leg change while listed')      // Review Focus 5
it('goes when the course can be read again, and the readable rules apply')        // obsIn set while listed
it('drops a readable message when the course can no longer be read and posts nothing without a leg change') // Review Focus 3
it('does not show in OBS mode (5-37)')
```

Add the unreadable forms of the #330 tests: nothing is posted at the approval or at an engine-running start; a message
posted by a leg change before a power-off is gone after the next approval.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/data/PersistentMessages.test.ts`
Expected: FAIL (the 30 s window posts at any DTK change and ignores the turn).

- [ ] **Step 3: Implement the unreadable branch**

```ts
if (this.seen) {                       // removed once read, for good
    this.posted = false;
    return false;
}
const delta = this.navState.legChangeDtkDelta;
if (delta !== null && delta > 5) {     // 4-8: at the leg change, the WPT light going steady at a turn
    this.posted = true;
    this.endsWithTurn = this.navState.activeWaypoint.turnStack.length > 0;
} else if (this.posted && this.endsWithTurn && this.navState.activeWaypoint.turnStack.length === 0) {
    this.posted = false;               // the end of the turn, the WPT light going off
}
return this.posted;
```

The readable branch resets `posted`; the unreadable branch resets `offTimer`. Comments cite 4-8, B-1, the two videos with
their times, the maintainer's rulings of 2026-10-27 (no message at a Direct To; no automatic removal without a turn, low
confidence) and #436.

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run test/unit/data/PersistentMessages.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the flight test** (`courseMessageTurn.test.ts`, `panelXml({...HEADING_INPUT, ...NO_OBS})`, the standard
  route as in `waypointAlertTurn.test.ts`, `messages(flight.unit)` read each second)

```ts
it('posts ADJ NAV IND CRS TO at the start of the turn and removes it at its end (4-8, #436)')
// before the turn: no 'ADJ NAV IND CRS TO'; from the tick after the turn starts (DTK of leg 2) to the last tick with
// turnStackLength > 0: listed with the DTK of leg 2; one tick after the turn stack is empty: gone
it('characterization: keeps it after a sequencing without turn anticipation until read (#436)')   // turnAnticipation: false; listed 60 s after the sequencing
it('posts nothing at a Direct To in Leg mode (the Tu-154 video, 43:52, #436)')                   // D-> KBBB, 30 s, nothing
```

- [ ] **Step 6: Run the flight test**

Run: `npx vitest run test/flight/flights/courseMessageTurn.test.ts`
Expected: PASS (the implementation is already in place; if a test fails, the marker or the branch is wrong, not the test).

- [ ] **Step 7: Run the stages and commit**

Run: `npx vitest run --project unit`, `--project render`, `--project flight`
Expected: PASS.

`fixes #436 Without a readable course, ADJ NAV IND CRS TO follows the leg change and the turn instead of a 30 s window`

---

### Task 5: A Direct To and ACTIVATE leave a readable course alone (#435)

**Files:**
- Modify: `kln90b/services/ModeController.ts:270-276` (helpers), `kln90b/pages/left/DirectToPage.tsx:113-131`
- Test: `test/render/pages/left/DirectToObs.test.ts`

**Interfaces:**
- Produces on `ModeController`:
  - `isObsReadFromIndicator(): boolean`: `planeSettings.output.obsTarget === 0 && sensors.in.obsMag !== null`.
  - `trueToObsMag(obsTrue: Degrees): Degrees`: the true course in magnetic with the OBS variation of the active waypoint
    (`getMagvarForObs`); `getObsMag()` becomes `this.trueToObsMag(this.navState.obsTrue)`.

- [ ] **Step 1: Write the failing tests** (describe `OBS mode with an indicator the unit reads (5-35, 5-37, #122, #261)`)

```ts
it('keeps the indicator course at the Direct To itself, before the next tick (5-37, #435)')
// planInObs(offLeg, {obs: 50, abc: abcE}), D-> ABC, ENT, no time advance:
// getObsMag() 50 (±1e-6); no K:VOR1_SET written; the status line still shows 'd› CRS 024°'
it('lays the indicator course through the new waypoint at a Direct To with the same variation (#435)')
// planInObs(offLeg, {obs: 50}) with an ABC of the same variation, D-> ABC, ENT, 1 s:
// |xtkToActive - crossTrackNm(offLeg, abc, 50)| < 0.05 (the straight direct leg would give 0)
it('keeps the indicator course at the ACTIVATE itself, before the next tick (5-37, #435)')
// planInObs(position, {obs: 50, abc: abc10E}), directToKbbbFromFpl0(unit, true), no time advance: getObsMag() 50
```

The existing `shows CRS with the direct course when the unit reads a non-driven indicator` (`d› CRS 024°`), `shows CRS with
the course at the waypoint after a long direct to` (`d› CRS 096°`) and the driven and unreadable Direct To tests stay as they
are.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/render/pages/left/DirectToObs.test.ts`
Expected: FAIL: the course is the direct course (024.3) until the next tick, and the leg stays the straight one.

- [ ] **Step 3: Implement**

In `DirectToPage.performDirectTo`, OBS mode: when `modeController.isObsReadFromIndicator()`, both ACTIVATE and Direct To call
`modeController.setObs(sensors.in.obsMag, true)` (lays the indicator's course through the new active waypoint, writes no
output), and the Direct To publishes `d› CRS` with
`trueToObsMag(courseAtWaypoint(coords, waypoint) ?? getObsTrue())`. Otherwise the code stays as it is (unreadable and driven:
`setObsTrueOnUnit`, `d› CRS` for `obsTarget === 0`). Comment: 5-37, the maintainer's ruling of 2026-10-26 (the indicator's
course is the input), #370, #426, #435.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/render/pages/left/DirectToObs.test.ts` then `npm test`, `npx tsc --noEmit`, `npm run build`
Expected: all PASS; the build prints only the pre-existing warnings.

- [ ] **Step 5: Commit**

`fixes #435 A Direct To or ACTIVATE in OBS mode keeps the course of a readable indicator the unit cannot drive`
