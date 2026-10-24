# MOVE ? on FPL 0, the planner after a move, scratchpad messages on the MSG page: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CLR/ENT on a DME arc entry in FPL 0 moves the arc intercept (#134); the `"kln90b"` planner follows a moved
entry (#419); every scratchpad message is also an MSG-page entry that flashes the MSG light until the status line has
shown it for 5 s (#237).

**Architecture:** The arc move becomes one helper in `services/FlightplanUtils.ts`, called by the Super NAV 5 window and
a new MOVE state of `FlightplanListItem`; #419 makes that helper go through a new publishing `Flightplan` method. For
#237, `StatusLine` adds a `ScratchpadMessage` to `MessageHandler` for each message it receives, runs its clock on the
display tick and removes it once it has been visible for 5 s.

**Tech Stack:** TypeScript, `@microsoft/msfs-sdk`, FSComponent JSX, Vitest (render stage, happy-dom).

**Spec:** `docs/superpowers/specs/2026-10-24-arc-move-and-scratchpad-messages-design.md`

## Global Constraints

- Branch `fix-134-237-arc-move-scratchpad`. One commit per issue, each with its tests and doc changes:
  `fixes #134 …`, `fixes #419 …`, `fixes #237 …`, every message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- `target: es2017`; no newer runtime features. DOM changes only inside display ticks; input handlers change state only.
- Cite manual pages in comments (6-17, 6-18, 3-10, 3-16, 4-5, C-2) and the trainer as "AVsoftech 90B trainer,
  2026-10-24"; never copy manual text. American English. No counts in prose for things that grow.
- Do not rename or change the meaning of H events, LVars, panel.xml keys, persisted data. `L:KLN90B_MsgLight` keeps its
  meaning (it follows the MSG prompt); it now also flashes for a scratchpad message.
- Checks after every task: `npx tsc --noEmit` clean, `npm test` green (all stages), `npm run build` succeeds with no new
  circular-dependency warning.
- A booted unit has unread boot messages (test/README.md section 6): tests about the light read them first with
  `unit.panel.readMessages()`.

## Review Focus

- **A screen change while a scratchpad message shows** (the welcome and take-home screens have their own status line):
  the entry must not stay in the MSG list forever. Task 3, test "drops the entry when its status line is destroyed".
- **Power cycle with a scratchpad message up:** no entry survives into the next power-on. Task 3, test "drops the
  scratchpad entry at a power cycle".
- **MOVE ? and the inner knob:** an approach row answers the inner knob with `INVALID ADD`; with the question up the
  knob must also withdraw it, not leave a question that ENT later acts on. Task 1, test "withdraws MOVE ? and refuses
  the add when the inner knob turns" (Claude's call, the spec is silent).
- **MOVE ? with no intercept on FPL 0:** the question must go and the plan stay as it was. Task 1, test "shows NO
  INTRCEPT…".
- **Super NAV 5 after the helper move:** the existing `SuperNav5DirectToSelector.test.ts` cases are the guard; they must
  pass unchanged in Task 1.

---

### Task 1: MOVE ? on FPL 0 (#134)

**Files:**
- Modify: `kln90b/services/FlightplanUtils.ts` (new export)
- Modify: `kln90b/controls/selects/SuperNav5DirectToSelector.tsx:98-117` (call the helper)
- Modify: `kln90b/controls/FlightplanListItem.tsx` (MOVE state, row, CLR/ENT/knobs)
- Modify: `kln90b/controls/FlightplanList.tsx:338-343, 559-573` (`moveArcEntry` callback)
- Test: `test/render/controls/FlightplanList.test.ts` (new describe)

**Interfaces:**
- Produces: `moveArcEntry(bus: EventBus, fpl: Flightplan, idx: number, activeWpt: ActiveWaypoint, sensors: Sensors): boolean`
  in `kln90b/services/FlightplanUtils.ts`. `idx` is the leg's index in `fpl`, the leg has `arcData`. Recomputes with
  `SidStar.recalculateArcEntryData`; on `null` publishes `statusLineMessage` `"NO INTRCEPT"` and returns false;
  otherwise writes the new `arcData` and `wpt = newData.entryFacility` to the leg, calls `activeWpt.recalculatePath()`
  when `idx === activeWpt.getActiveFplIdx()`, returns true. (Task 2 changes how the leg is written.)
- Produces: `FlightplanListItemProps.onMoveArc: (idx: number) => void` (idx = the item's `wptIdx`), and
  `FlightplanList.moveArcEntry(idx: number): void`.

- [ ] **Step 1: Write the failing tests** in `test/render/controls/FlightplanList.test.ts`, a new
  `describe('FlightplanList, MOVE ? on a DME arc entry (6-17, #134)')` built on `arcWorld()` from
  `test/harness/fixtures.ts`.
  Setup function `moveQuestion(track = 10)`: `bootUnit({facilities: w.facilities, position: w.at(225, 10), storage:
  savedFlightplan(0, [w.kprc]), panelXml: panelXml(APR_ARM_SWITCH)})`, `settle`, `loadProcedure('APT 8')`, precondition
  `fplIdents(unit)` = `['D225J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']`; then as in `SuperNav5DirectToSelector.test.ts`:
  `moveAircraft(unit, w.at(200, 15), {groundspeedKt: 0})`, `moveAircraft(unit, pointFrom(w.at(200, 15), track, 0.05),
  {groundspeedKt: 120})`; `selectPage('L', 'FPL 0')`, `cursor('L')`, `cursorTo('L', 'D225Jà')`, `clr()`.
  Tests and their assertions (`left = () => Screen.read().rows('L')`):
  - `asks MOVE ? over the whole row on CLR on the arc entry (6-17, #134)`: `unit.panel.focused('L').text` is
    `'MOVE      ?'` with `col: 0`; the row flashes like DEL (inverse on the three steady display ticks of a
    `blinkCycle`, the blink tick different; assert the mask of the row over one cycle); `fplIdents` unchanged.
  - `withdraws MOVE ? on a second CLR (6-17, 4-5, #134)`: after `clr()` the focused text is `'D225Jà'`, no row contains
    `MOVE`, `fplIdents` unchanged.
  - `withdraws MOVE ? when the outer knob turns (#317, #134)`: after `outer('L', 1)` no row contains `MOVE`, the
    focused text is `'ARCEN'` with its suffix as the row shows it, `fplIdents` unchanged.
  - `withdraws MOVE ? and refuses the add when the inner knob turns (#134)`: after `inner('L', 1)`:
    `collectStatusMessages` saw `['INVALID ADD']`, no row contains `MOVE`; a following `ent()` leaves `fplIdents`
    unchanged.
  - `moves the entry to the intercept of the present track on ENT (6-17, #134)`: after `ent()` and 500 ms:
    `fplIdents` = `['D205J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']`, `courseDeg(w.abc, entry.wpt)` ≈ 205.05 (1 digit),
    `distanceNm(w.abc, entry.wpt)` ≈ 10 (2 digits), the focused text is `'D205Jà'`, no row contains `MOVE`,
    `unit.errors` = `[]`.
  - `shows NO INTRCEPT when the present track misses the arc (6-18, #134)`: `moveQuestion(330)` (the track of 330 misses
    the circle, as the Super NAV 5 test notes), `ent()`: `collectStatusMessages` saw `['NO INTRCEPT']`, `fplIdents`
    unchanged, no row contains `MOVE`.
  - `keeps INVALID DEL on CLR on an approach waypoint that starts no arc (4-5, #134)`: cursor on `FAFAA`'s row, `clr()`:
    `collectStatusMessages` saw `['INVALID DEL']`, no row contains `MOVE`.

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run test/render/controls/FlightplanList.test.ts`
  Expected: the new tests FAIL (CLR gives `INVALID DEL`); the existing ones pass.

- [ ] **Step 3: Add `moveArcEntry` to `FlightplanUtils.ts`** with the body moved from
  `SuperNav5DirectToSelector.enter`; the selector's `enter` calls it with `this.flightplan`, `this.idx`. Its "how does
  this work?" comment goes; #237 answers it (Task 3 adds the reference there).

- [ ] **Step 4: Add the MOVE state to `FlightplanListItem`**, beside `isDeleting`: `isMoving`, offered only when
  `this.props.fplIdx === 0` and `this.props.leg?.arcData !== undefined`. Render a second question span like `delRef`
  with the text `MOVE      ?` (11 cells, `?` last), shown and flashing in `tick` exactly as `delRef` is.
  - `clear()`: on an APP leg with `arcData`, toggle `isMoving` (and `isEntered`, as DEL does) instead of `INVALID DEL`;
    other APP legs keep `INVALID DEL`.
  - `enter()`: with `isMoving`, call `this.props.onMoveArc(this.props.wptIdx)`, reset the state, return
    `EnterResult.Handled_Keep_Focus`. `isEnterAccepted()` includes `isMoving`.
  - `outerLeft/outerRight`: return false with `isMoving`, as with `isDeleting` (#317).
  - `innerLeft/innerRight`: with `isMoving`, reset it, then the existing `INVALID ADD`.
  - `setFocused`: resets `isMoving` like `isDeleting`.

- [ ] **Step 5: Add `FlightplanList.moveArcEntry(idx)`**: `const leg = this.legs[idx]`; call `moveArcEntry(this.props.bus,
  this.flightplan, leg.origIdx, this.props.memory.navPage.activeWaypoint, this.props.sensors)`; then, as `deleteLeg`
  does, `syncLegsFromFlightplan()`, `this.legs[idx].focusMe = true`, `buildList()`. Pass it as `onMoveArc` where the
  items are built; numbered plans pass it too (they hold no arc legs, so it is never offered).

- [ ] **Step 6: Run the tests**

  Run: `npx vitest run test/render/controls/FlightplanList.test.ts test/render/controls/selects/SuperNav5DirectToSelector.test.ts`
  Expected: all PASS. Then `npx tsc --noEmit`, `npm test`, `npm run build` (Global Constraints).

- [ ] **Step 7: Commit**

  ```bash
  git add kln90b/services/FlightplanUtils.ts kln90b/controls/selects/SuperNav5DirectToSelector.tsx kln90b/controls/FlightplanListItem.tsx kln90b/controls/FlightplanList.tsx test/render/controls/FlightplanList.test.ts
  git commit -m "fixes #134 MOVE ? on the arc entry in FPL 0, the arc move shared with Super NAV 5"
  ```

### Task 2: the planner follows a moved arc entry (#419)

**Files:**
- Modify: `kln90b/data/flightplan/Flightplan.ts` (new method)
- Modify: `kln90b/services/FlightplanUtils.ts` (`moveArcEntry` uses it)
- Test: `test/render/services/WTFlightplanSync.test.ts` (new describe)

**Interfaces:**
- Consumes: `moveArcEntry` (Task 1).
- Produces: `Flightplan.setArcEntry(idx: number, arcData: ArcData): void`: sets `legs[idx].arcData = arcData` and
  `legs[idx].wpt = arcData.entryFacility`, then publishes `flightplanChanged` when `publishingEnabled`, as `insertLeg`
  does. `ArcData` is imported from `data/navdata/SidStar`; if that import adds a circular-dependency warning, move the
  `ArcData` interface into `Flightplan.ts` and re-export it from `SidStar.ts`.

- [ ] **Step 1: Write the failing tests** in `WTFlightplanSync.test.ts`,
  `describe('the "kln90b" flight planner after the entry of a DME arc is moved (6-17, #419)')`, on `arcWorld()` with
  the setup of Task 1 (track 010; `Output.WriteGPSSimVars` is on by default):
  - `follows an entry moved on Super NAV 5 (#419)`: precondition `identsOf(plan)[0]` = `'D225J'`; the Super NAV 5 flow of
    `SuperNav5DirectToSelector.test.ts` (scan, `inner('R', -1)`, `clr()`, `ent()`, 500 ms); then `identsOf(plan)[0]` =
    `'D205J'` and its `[leg.lat, leg.lon]` equal the FPL 0 leg's `wpt` coordinates.
  - `follows an entry moved on FPL 0 (#419)`: the same, through FPL 0 (`cursorTo('L', 'D225Jà')`, `clr()`, `ent()`).

- [ ] **Step 2: Run them and see them fail**

  Run: `npx vitest run test/render/services/WTFlightplanSync.test.ts`
  Expected: the new tests FAIL with `'D225J'`.

- [ ] **Step 3: Add `setArcEntry` and use it in `moveArcEntry`** in place of the two direct writes; keep
  `recalculatePath()` after it. Check that `ActiveWaypoint`'s `from`/`to` still refer to the same leg object after the
  write (they are leg objects, mutated in place; if not, recalculate after updating them).

- [ ] **Step 4: Run the tests**

  Run: `npx vitest run test/render/services/WTFlightplanSync.test.ts test/render/controls/FlightplanList.test.ts test/render/controls/selects/SuperNav5DirectToSelector.test.ts`
  Expected: all PASS. Then the Global Constraints checks.

- [ ] **Step 5: Commit**

  ```bash
  git add kln90b/data/flightplan/Flightplan.ts kln90b/services/FlightplanUtils.ts test/render/services/WTFlightplanSync.test.ts
  git commit -m "fixes #419 publish the moved DME arc entry so that the kln90b flight planner follows it"
  ```

### Task 3: scratchpad messages on the MSG page (#237)

**Files:**
- Modify: `kln90b/data/MessageHandler.ts` (new class, new method)
- Modify: `kln90b/controls/StatusLine.tsx` (entry, clock, light unchanged)
- Modify: `kln90b/services/FlightplanUtils.ts` (comment at the `NO INTRCEPT` publish)
- Modify: `docs/kln89-trainer-record.md` (dated block), `docs/architecture.md` if it describes the status line messages
- Test: `test/unit/data/MessageHandler.test.ts`, `test/render/controls/StatusLine.test.ts`

**Interfaces:**
- Produces: `class ScratchpadMessage implements Message` in `MessageHandler.ts`: `constructor(text: string)`,
  `message = [text]`; `get seen(): boolean` returns false, `set seen(v)` ignores it; `elapsedMs: number | null = null`
  (null until the first visible display tick); `ended = false`; `isConditionValid()` returns `!this.ended`.
- Produces: `MessageHandler.removeMessage(message: Message): void` (drops it from the active list).
- `STATUS_MESSAGE_TIME` (5000) stays in `StatusLine.tsx`.

- [ ] **Step 1: Write the failing unit tests** in `test/unit/data/MessageHandler.test.ts`:
  - `a scratchpad message never counts as read (#237)`: add one, set `seen = true`: `hasUnreadMessages()` is true.
  - `removes a message at once with removeMessage (#237)`: add two, remove one: `getMessages()` holds only the other,
    before any `tick()`.
  - `drops an ended scratchpad message at the next tick (#237)`: add, `ended = true`, `tick()`: `hasMessages()` false.

- [ ] **Step 2: Write the failing render tests** in `test/render/controls/StatusLine.test.ts`, a new
  `describe('scratchpad messages on the MSG page (AVsoftech 90B trainer, 2026-10-24, #237)')`. Boot with
  `panelXml(APR_ARM_SWITCH)` and no flight plan, `settle`, `readMessages()`; the trigger is
  `unit.panel.press(EVT_APPR_ARM)` (`kln90b/HEvents.ts`), which posts `NO APPROACH` in ENR-LEG without an approach
  (`ModeController.armApproachPressed`). Every press advances 250 ms; times below are from the press. The light reader
  is the file's `msgLightOverTwoSeconds`; `status = () => Screen.read().status().mode`.
  - `flashes the MSG light while it shows and goes dark when it clears (#237)`: light over the first two seconds
    `{0, 1}`; at 6 s `status()` is not `'NO APPROACH'`, light `{0}`, `messages(unit)` lacks `'NO APPROACH'`.
  - `lists it on the MSG page and keeps it there after the status line clears (#237)`: `msg()` at once: MSG page row 0
    trimmed is `'NO APPROACH'`, `status()` is `'NO APPROACH'`; at 6 s row 0 is still `'NO APPROACH'` and `status()` is
    not.
  - `keeps the light flashing after the MSG page has shown it (#237)`: `msg()`, `msg()` (closed) within 1 s: light over
    the next two seconds `{0, 1}`.
  - `keeps the light flashing on Super NAV 5 past 5 s (#237)`: `showSuperNav5(unit)`, press, advance 10 s: light `{0, 1}`,
    `messages(unit)` contains `'NO APPROACH'`, `SuperNav5.read().msg` is `'msg'`.
  - `counts the 5 s from the first display, also while Super NAV 5 hides it (#237)`: on Super NAV 5, press, `msg()`
    (t = 0, `status()` `'NO APPROACH'`), advance 1750 ms, `msg()` (back on Super NAV 5), advance 750 ms, `msg()` (about
    3 s): `status()` `'NO APPROACH'`; at about 4.5 s still; at about 5.5 s not, and the MSG page row 0 still
    `'NO APPROACH'`. (A clock restarted at the second display would still show it at 5.5 s.)
  - `clears at once when the status line returns after more than 5 s, still listed (#237)`: on Super NAV 5, press,
    `msg()`, `msg()` (closed) after 1 s, advance 8 s (light `{0, 1}` there), `msg()`: MSG page row 0 `'NO APPROACH'`,
    `status()` not `'NO APPROACH'` after that press's tick, light `{0}`.
  - `does not add a message posted while the MSG page is open to the open page (#237)`: `msg()` (blank page), press:
    `status()` `'NO APPROACH'`, rows 0 to 5 blank; `msg()` to close and `msg()` again within the 5 s: row 0
    `'NO APPROACH'`.
  - `drops the scratchpad entry at a power cycle (#237)`: press, `unit.panel.powerCycle()`, `approveSelfTest()` as the
    harness requires: `messages(unit)` lacks `'NO APPROACH'`.
  - `drops the entry when its status line is destroyed (#237)`: press; destroy the main screen's status line through a
    screen change (`unit.props.pageManager.setCurrentPage(NullPage, {})` is acceptable here): `messages(unit)` lacks
    `'NO APPROACH'` before any calculation tick.
  - `characterization: a second message replaces the first, with its own 5 s, and only it is listed (#237)`: press, at
    3 s publish `'INVALID ENT'` on `statusLineMessage` through the bus; at 7 s `status()` is `'INVALID ENT'` and
    `messages(unit)` contains `'INVALID ENT'` but not `'NO APPROACH'`; at 8.5 s `status()` is neither. Comment: the
    AVsoftech 90B trainer instead clears the second message 5 s after the first one's first display, and in its one
    usable sample listed only the first; too rare to trust the trainer on (the maintainer, 2026-10-24).

- [ ] **Step 3: Run them and see them fail**

  Run: `npx vitest run test/unit/data/MessageHandler.test.ts test/render/controls/StatusLine.test.ts`
  Expected: the new tests FAIL; the existing ones pass.

- [ ] **Step 4: Add `ScratchpadMessage` and `removeMessage`** (Interfaces above).

- [ ] **Step 5: Rework the scratchpad in `StatusLine`**: replace `statusLineMessage`/`statusLineMessageTimer` with
  `private scratchpad: ScratchpadMessage | null`.
  - `showMessage(text)`: end and `removeMessage` the current entry, create a new one, `addMessage` it.
  - `tick`: when the entry has `elapsedMs === null` and `isVisible`, set it to 0; when not null, add
    `TICK_TIME_DISPLAY`; when `isVisible` and `elapsedMs >= STATUS_MESSAGE_TIME`, end it, `removeMessage` it, set
    `scratchpad = null`. Do this before the light and prompt logic, so both see the removal on the same tick. A message
    posted on a visible page must stay on screen exactly as long as before (the existing status-line tests hold that).
  - `destroy()`: end and remove the current entry.
  - The display reads `scratchpad.message[0]`; the light and `msg` prompt logic stays as it is.

- [ ] **Step 6: Comment and record**: at the `NO INTRCEPT` publish in `moveArcEntry`, reference 6-18 and that the
  message reaches the MSG page while Super NAV 5 hides the status line (#237). Add a dated block "2026-10-24, AVsoftech
  KLN 90B trainer (unreliable), scratchpad messages" to `docs/kln89-trainer-record.md` with the observations of the
  spec's Evidence section, in the record's style. Update `docs/architecture.md` where it describes status line or MSG
  messages, if it does.

- [ ] **Step 7: Run the tests**

  Run: `npx vitest run test/unit/data/MessageHandler.test.ts test/render/controls/StatusLine.test.ts test/render/controls/MessagePage.test.ts`
  Expected: all PASS. Then the Global Constraints checks. An existing test that now fails because a scratchpad message
  flashes the light or appears in `messages(unit)` is updated only where it contradicts the spec; list each such change
  in the report.

- [ ] **Step 8: Commit**

  ```bash
  git add kln90b/data/MessageHandler.ts kln90b/controls/StatusLine.tsx kln90b/services/FlightplanUtils.ts docs/kln89-trainer-record.md docs/architecture.md test/unit/data/MessageHandler.test.ts test/render/controls/StatusLine.test.ts
  git commit -m "fixes #237 list every scratchpad message on the MSG page and flash the MSG light until the status line has shown it for 5 seconds"
  ```

## After the tasks

- The wiki page External Annunciators describes the MSG light; the maintainer decides whether it needs a note that a
  scratchpad message now flashes it too.
