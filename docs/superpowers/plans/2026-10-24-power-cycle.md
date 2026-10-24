# Power cycle issues #192, #332, #400 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a power cycle does what the real unit does: the self-test flag is cleared (#400), a short aircraft power loss
is carried by the battery module (#332), and `VolatileMemory` holds only state the unit forgets, with everything it
keeps moved to user settings (#192).

**Architecture:** #400 is one line in `VolatileMemory.reset`. #332 renames `PowerButton` to `PowerSupply` and adds a
1.5 s ride-through timer to it. #192 moves the kept numbers to user settings read by the pages, keeps the kept waypoints
as resolved facilities in `VolatileMemory` behind accessors that save their ICAO string to a setting, and resets every
other field at power-on, held by a generic sentinel guard test.

**Tech Stack:** TypeScript, MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (render stage, happy-dom, fake
timers).

**Spec:** `docs/superpowers/specs/2026-10-24-power-cycle-design.md` (read it; this plan argues from it).

## Global Constraints

- Branch `power-cycle`; never `git push`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- One commit per issue: `fixes #400 …`, a plain rename commit, `fixes #332 …`, `fixes #192 …`. Each with its tests and
  doc changes. The #192 tasks (5-8) make WIP commits that Task 8 squashes into one.
- `target: es2017`; no new circular dependencies (the build prints the existing ~18; compare the count).
- American English; no counts in prose for things that grow; cite Pilot's Guide pages (`3-3`), maintenance manual PDF
  pages (`PDF 79`) and the trainer record; never copy manual text.
- New setting keys get defaults equal to today's defaults; no key is repurposed.
- Ride-through: exactly **1.5 s**, no randomness.
- Short-interruption state is kept only when `timeSincePowerChange <= RESET_TIME` (5 min); a sim restart counts as long.
- Every task ends green on `npx tsc --noEmit` and `npm test`.

## Review Focus

1. A saved waypoint setting that does not resolve (garbage string, a waypoint of another database) must boot without an
   error page, console error or unhandled rejection, falling back to the first of the scan list (Task 6).
2. A temporary waypoint (region `XY`) saved as a page's waypoint is deleted at power-on by `TemporaryWaypointDeleter`;
   the page must fall back, not show a dangling waypoint or reject (Task 6).
3. A flapping circuit (loss 1 s, power 0.1 s, loss 1 s, power) must be carried every time: the timer restarts, never
   accumulates or sticks (Task 3).
4. A short loss while the unit is disabled for hot swapping must leave `GPS OVERRIDDEN` released (#350) and the unit
   suspended (Task 3).
5. A page parked on a nearest rank must not write its setting on every tick: only when the shown facility's ICAO
   changes (Task 6).

---

### Task 1: #400 clear the self-test flag at power-on

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`reset`)
- Test: `test/render/pages/left/SelfTestLeftPage.test.ts`

- [ ] **Step 1: Write the failing test** (in a new `describe('a power-off during the self-test (#400)')`)

```ts
it('outputs no self-test values on the Turn-On page after a power-off during the self-test (#400)', async () => {
    const unit = await bootToSelfTest({magvar: 0});
    const from = unit.env.sim.writes.length;
    await unit.panel.powerCycle();
    await vi.advanceTimersByTimeAsync(5000); // the Turn-On page (17 s, WelcomePage TEST_TIME)

    expect(unit.props.memory.navPage.isSelfTestActive).toBe(false);
    const after = unit.env.sim.writes.slice(from);
    expect(after.filter(w => w.name === 'GPS APPROACH MODE' && w.value === 3)).toEqual([]);
    expect(after.filter(w => w.name === 'GPS WP DESIRED TRACK' && Math.abs(w.value - 315) < 0.1)).toEqual([]);
});
```
Check the shape of `sim.writes` entries in `test/harness/sim/FakeSim.ts` (and the unit of `GPS WP DESIRED TRACK` writes)
and adapt the filters; the intent is: no self-test value is written after the power cycle.
Confirm in the test that the screen shows the Turn-On page (row 0 `' GPS             ORS 20'`) as a precondition.

- [ ] **Step 2: Run it, expect FAIL** — `npx vitest run test/render/pages/left/SelfTestLeftPage.test.ts` (isSelfTestActive true).
- [ ] **Step 3:** in `reset`, `this.navPage.isSelfTestActive = false;` next to the `isSelfTestApproved` line, comment
  `//A power-off during the self-test ends it (#400)`.
- [ ] **Step 4: Run it, expect PASS;** then `npm test` and `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `fixes #400 end the self-test at a power-off, so the next Turn-On page outputs no self-test values`.

### Task 2: rename `PowerButton` to `PowerSupply`

**Files:**
- Move: `kln90b/PowerButton.ts` → `kln90b/PowerSupply.ts` (`git mv`); class `PowerSupply`
- Move: `test/render/PowerButton.test.ts` → `test/render/PowerSupply.test.ts`
- Modify: every importer (`grep -rn PowerButton kln90b test`), `KLN90BCore.ts` field `powerButton` → `powerSupply`,
  `SimVarSync.ts` constructor parameter likewise
- Docs: `docs/architecture.md`, `test/README.md`, `docs/test-next-steps.md` (living docs). Dated records (`docs/superpowers/`,
  `docs/test-coverage-record.md`, `docs/kln89-trainer-record.md`) keep the old name.

**Interfaces:**
- Produces: `PowerSupply` (same public methods as before), `PowerEvent`, `PowerEventData` exported from `kln90b/PowerSupply.ts`.

- [ ] **Step 1:** rename; add a class doc comment: models the unit's power path, the BRT/PUSH ON knob (ON/OFF and the
  brightness events it carries), the aircraft power and the battery module (maintenance manual PDF 53, 54).
- [ ] **Step 2:** `npx tsc --noEmit`, `npm test`, `npm run build` (circular-dependency count unchanged); `grep -rn PowerButton kln90b test docs/architecture.md test/README.md docs/test-next-steps.md` is empty.
- [ ] **Step 3: Commit** `Rename PowerButton to PowerSupply: it models the knob, the aircraft power and the battery module.`

### Task 3: #332 ride-through of a short aircraft power loss

**Files:**
- Modify: `kln90b/PowerSupply.ts` (`setElectricityAvailable`, `setPowerSwitch`, new private state)
- Test: `test/render/SimVarSync.test.ts`; `docs/architecture.md` (power section)

**Interfaces:**
- Consumes: `PowerSupply` (Task 2).
- Produces: `export const RIDE_THROUGH_TIME = 1500;` in `PowerSupply.ts` (ms; comment: maintenance manual PDF 79, nominal; covers the 1 s of PDF 53, 54 and 107).

Behavior (spec 4.3): the first call applies at once; a loss while powered starts a `window.setTimeout` of
`RIDE_THROUGH_TIME`, during which nothing changes (no page, no power event, no `powercycles` increment); power back
cancels it; expiry applies the loss as today (the off time counts from then); a loss while unpowered applies at once;
the knob off during a ride-through turns the unit off and cancels the timer; no randomness.

- [ ] **Step 1: Tests** in `describe('aircraft power interruptions (maintenance manual)')`, using its `onCircuit()`:
  - Turn the pin `rides through a 0.5 s loss…` from `it.fails` into `it` (name unchanged) and update its comment.
  - `it('rides through a loss of 1.4 s (maintenance manual, PDF 79) (#332)')`: loss 1400 ms, power back, +2000 ms →
    `status().left` is `'NAV 2'`, `powercycles` unchanged.
  - `it('turns the unit off after a loss of 1.6 s (maintenance manual, PDF 79) (#332)')`: loss 1600 ms → all rows blank;
    power back +2000 ms → row 0 `' GPS             ORS 20'`, `powercycles` + 1.
  - `it('rides through repeated short losses (#332)')`: three times (loss 1000 ms, power 100 ms), then +2000 ms → `'NAV 2'`, `powercycles` unchanged.
  - `it('turns the unit off at once when the knob is turned off during a ride-through (#332)')`: loss, +500 ms,
    `unit.panel.powerOff()`, +100 ms → all rows blank; circuit back +2000 ms → still blank (knob off).
  - In `describe('ElectricitySimVar and L:KLN90B_ElectricitySimVarIndex (public contract)')`:
    `it('applies the first reading at once: a unit booted without aircraft power stays dark (#332)')`: `bootUnit({panelXml: CIRCUIT_XML})`, +200 ms → row 0 blank.
  - Hot-swap block: the test `the sibling: a loss of the aircraft power claims the GPS of an enabled unit at once`
    becomes `…claims the GPS of an enabled unit when the ride-through ends` and waits 2000 ms; the test
    `reads L:KLN90B_Disabled only in the poll, also when the aircraft power changes (#350)` uses a loss of 2000 ms and
    power back 1000 ms, expecting 30 reads; new `it('stays released through a short power loss while disabled (#350, #332)')`:
    disabled, loss 1000 ms, back, +2000 ms → `GPS OVERRIDDEN` 0 (as its neighbor `stays released when the aircraft power goes off and comes back (#350)` asserts).
- [ ] **Step 2: Run** `npx vitest run test/render/SimVarSync.test.ts`: the new ride-through tests FAIL, the 1.6 s and first-reading tests may pass already.
- [ ] **Step 3: Implement** in `PowerSupply`: `private rideThrough: number | null = null;`, `private hasElectricityReading = false;`; logic as above. Comment each rule with its source.
- [ ] **Step 4: Run** the file, then `npm test` (the contract tests that wait 3 s stay green), `npx tsc --noEmit`.
- [ ] **Step 5: Docs:** `docs/architecture.md` power section: the ride-through and that the power event follows the actual power change.
- [ ] **Step 6: Commit** `fixes #332 carry an aircraft power loss of up to 1.5 s on the battery module`.
- [ ] **Step 7:** write the wiki sentence for the maintainer into the session's final report (not the repo): on the
  panel.xml customization page under ElectricitySimVar, that a loss shorter than 1.5 s is carried by the unit's battery
  module and does not turn it off.

### Task 4: move `unpackFacility` and `isNearestWpt` to the data layer

**Files:**
- Modify: `kln90b/data/navdata/NearestList.ts` (gains both functions, unchanged), `kln90b/pages/right/WaypointPage.tsx`
  (removes them, re-exports: `export {unpackFacility, isNearestWpt} from "../../data/navdata/NearestList";`)

Why: `VolatileMemory` needs them (Task 6) and must not import `WaypointPage.tsx`, which imports `VolatileMemory` (a new cycle).

- [ ] **Step 1:** move; `npx tsc --noEmit`; `npm run build` (cycle count unchanged); `npm test`.
- [ ] **Step 2: WIP commit** `WIP #192 move unpackFacility to NearestList`.

### Task 5: #192 the kept numbers become user settings

**Files:**
- Modify: `kln90b/settings/KLN90BUserSettings.ts` (keys below), `kln90b/data/VolatileMemory.ts` (`TriPageState` loses
  `tas`, `windDirTrue`, `windSpeed`, `ff`, `reserve`, `tri5Fpl`; `OthPageState` and `othPage` are removed; `reset` stops
  touching them), `kln90b/pages/left/Tri0Page.tsx` … `Tri6Page.tsx`, `Oth5Page.tsx`, `Oth6Page.tsx`
- Test: `test/render/data/VolatileMemory.test.ts`, `test/render/pages/left/Tri*.test.ts` / `Oth*.test.ts` where they set
  `memory.triPage.*` (`grep -rn "triPage\.\(tas\|wind\|ff\|reserve\|tri5Fpl\)\|othPage" test`)

**Interfaces:**
- Produces: user setting keys (type, default): `triTas` (number, 150), `triWindDirTrue` (number, 0), `triWindSpeed`
  (number, 0), `triFuelFlow` (number, 0), `triReserve` (number, 0), `tri5Fpl` (number, 0), `othReserve` (number, 0).
  Each with a comment `//TRI … kept over a power cycle (trainers 2026-10-24, docs/kln89-trainer-record.md, #192)`.
  Pages read `this.props.userSettings.getSetting('triFuelFlow').get()` and write with `.set(…)`.

- [ ] **Step 1: Tests** (render), each a pair as in `AltPage.test.ts` `ALT page ALERT and WARN as user settings (#259)`:
  - `it('saves the TRI 1 fuel flow and reserve in the user settings (#192)')`: enter FF and RES on TRI 1 through the
    panel; +1000 ms; `storedSetting(unit, 'triFuelFlow')` and `'triReserve'` are the entered values.
  - `it('shows the stored fuel flow and reserve on TRI 1 at a new boot (#192)')`: `bootUnit({storage: {triFuelFlow: 12, triReserve: 30}})`, select TRI 1 → the FF and RES fields show 12 and 30.
  - The same pair for TRI 0 TAS and wind (`triTas: 170, triWindDirTrue: 20, triWindSpeed: 30`), TRI 5 plan
    (`tri5Fpl: 3`) and OTH 5 reserve (`othReserve: 45`, panel with a fuel computer interfaced, as the OTH tests boot).
  - Replace the characterization `keeps the NAV 4 selected altitude and the fuel figures of TRI over a power cycle`
    with `it('keeps the TRI and OTH figures over a power cycle (trainers 2026-10-24, #192)')`: set every new setting to a
    non-default value, `cycle(unit, 6 * 60)`, all unchanged.
- [ ] **Step 2: Run** them: FAIL (keys missing / pages read memory).
- [ ] **Step 3: Implement** the keys and the page changes; remove the fields from `TriPageState`/`OthPageState` and `reset`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`.
- [ ] **Step 5: WIP commit** `WIP #192 TRI and OTH figures as user settings`.

### Task 6: #192 the kept waypoints

**Files:**
- Create: `kln90b/data/SavedWaypoint.ts`
- Modify: `kln90b/settings/KLN90BUserSettings.ts`, `kln90b/data/VolatileMemory.ts` (`WaypointPageState` and
  `TriPageState` become classes; `reset` restores from the settings)
- Test: `test/render/data/VolatileMemory.test.ts` (new `describe('the waypoint pages over a power cycle and a sim restart (#192)')`
  and `describe('the TRI waypoints over a sim restart (#192)')`)

**Interfaces:**
- Consumes: `unpackFacility`, `isNearestWpt` from `data/navdata/NearestList.ts` (Task 4).
- Produces:
  - Setting keys (string, default `""`): `aptPageWpt`, `vorPageWpt`, `ndbPageWpt`, `intPageWpt`, `supPageWpt`, `tri1To`,
    `tri3From`, `tri3To`. Value: `ICAO.valueToStringV1(facility.icaoStruct)`, `""` for none.
  - `class SavedWaypoint<T extends Facility>`: `constructor(setting: UserSetting<string>)`; `save(facility: T | null): void`
    (writes only when the string differs); `restore(loader: FacilityClient): Promise<T | null>` (resolves with
    `ICAO.getFacilityTypeFromStringV1` + `getFacility`, as `KLN90BCore` restores `activeWaypoint`; on `""`, a throw or a
    wrong type: saves `""`, returns null; never rejects).
  - `class WaypointPageState<T>` (replaces the interface; same public members `facility`, `ident`, `lastMatch`):
    `facility` is a get/set accessor over a private field; the setter stores the value and calls
    `saved.save(unpackFacility(value))`. Every existing write site (`WaypointPage.changeFacility` and constructor,
    `Apt1Page`, `IntPage`, `NdbPage`, `SupPage`, `VorPage`, `FlightplanList`, `PageManager.startMainPage`) is unchanged.
  - `class TriPageState` with `tri1To`, `tri3From`, `tri3To` as accessors over `SavedWaypoint`s.
  - `reset`: each waypoint page restores its saved waypoint (plain facility, ident from it); if null, the first of the
    scan list as today (`setFirstApt` …). TRI waypoints restore or become null. `isReady` after all of them.

- [ ] **Step 1: Tests:**
  - `it('saves the waypoint the VOR page shows (#192)')`: select a VOR by scanning; +1000 ms; `storedSetting(unit, 'vorPageWpt')` is `ICAO.valueToStringV1(vor.icaoStruct)`.
  - `it('shows the saved VOR at a new boot (trainer 2026-10-24) (#192)')`: `storage: {vorPageWpt: <second VOR of the fixtures>}`, the active waypoint an airport → the VOR page shows that VOR, not the first of the scan list. Same pair for APT (active waypoint a VOR), NDB, INT, SUP.
  - `it('restores a waypoint shown at a nearest rank as the plain waypoint (trainer 2026-10-24) (#192)')`: APT page on
    nearest rank 2 (NRST), power cycle → the APT page shows that airport, `isNearestWpt(memory.aptPage.facility)` false.
  - `it('writes the setting of a page parked on a nearest rank only when the waypoint changes (#192)')`: park on a rank,
    spy on the `aptPageWpt` setting's `set`, advance 10 s without movement → 0 calls.
  - `it('falls back to the first of the scan list when the saved waypoint does not resolve (#192)')`:
    `storage: {aptPageWpt: 'garbage', vorPageWpt: ICAO.valueToStringV1(<a VOR not in the navdata>)}` → the pages show
    the first of their scan lists; `unit.consoleErrors` holds no new entry from this; no rejections.
  - `it('falls back when the saved user waypoint was a temporary one (#192)')`: a temporary (`XY`) waypoint on the SUP
    page, power cycle → the SUP page shows the first of its scan list; no rejections.
  - `it('shows the last active waypoint on its page type at the start-up (3-8) (#192)')`: saved `vorPageWpt` A, active
    waypoint VOR B → the right side shows B.
  - `it('keeps the TRI 1 and TRI 3 waypoints over a sim restart (trainers 2026-10-24) (#192)')`: the saves and a boot
    from `storage: {tri1To, tri3From, tri3To}` → `memory.triPage` holds them.
  - Flip the characterization `opens the VOR page on the first VOR of the scan list after a power cycle` to
    `it('opens the VOR page on the last VOR shown after a power cycle (trainer 2026-10-24) (#192)')`.
- [ ] **Step 2: Run** them: FAIL.
- [ ] **Step 3: Implement** `SavedWaypoint`, the two classes, the keys and the restore in `reset`.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npm run build` (cycle count unchanged).
- [ ] **Step 5: WIP commit** `WIP #192 waypoint pages and TRI waypoints as user settings`.

### Task 7: #192 the reset list and the guard

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`reset`)
- Test: `test/render/data/VolatileMemory.test.ts`

Changes in `reset` (spec 4.4): `nav4SelectedAltitude = 0`; `obsMag = 0`; `superNav5ActualRange = 40`; the derived nav
values back to their declared initial values (`xtkToActive`, `distToActive`, `eteToActive`, `distToDest`, `eteToDest`,
`bearingToActive`, `bearingForAP`, `desiredTrack`, `steeringPath`, `toFrom` → null; `waypointAlert` → false;
`approachDisarmedLeg` already); `userMagvar = 0` only when `evt.timeSincePowerChange > RESET_TIME` (comment: KLN 89
Pilot's Guide 4-46, 4-47; the 90B guide is silent, 5-44).

- [ ] **Step 1: Tests:**
  - The guard: `it('resets every field of the page states at a power-on (#192)')`. Generic, no field list:
    ```ts
    const SENTINEL = {sentinel: true};
    // Not page state in the sense of #192: persisted on their own path, or the maps reset() clears (checked below)
    const KEPT = new Set(['flightplans', 'activeWaypoint', 'airspaceWarned', 'airspaceEntered']);
    ```
    For every own key of `memory` ending in `Page`, every own key of that object not in `KEPT` and not holding a
    `SavedWaypoint` (`instanceof`, the link to the setting) is set to `SENTINEL`; add an entry to both airspace maps; then
    `memory.reset({isPowered: true, timeSincePowerChange: 6 * 60 * 1000})`, wait for `memory.isReady`; expect no key
    to hold `SENTINEL` (report `page.key` in the message) and both maps empty. The private backing fields of the
    accessors are own keys and are covered by this.
  - `it('forgets the NAV 4 selected altitude at a power-on (KLN 89 trainer 2026-10-24) (#192)')`.
  - The magnetic variation (outside the coverage area, as the existing test boots at lat 74.5):
    `it('keeps the pilot-entered magnetic variation over a power-off of 1 minute (KLN 89 guide 4-47) (#192)')` (`cycle(unit, 60)` → 7) and
    `it('forgets the pilot-entered magnetic variation after more than 5 minutes off (KLN 89 guide 4-47) (#192)')` (`cycle(unit, 6 * 60)` → 0), replacing the characterization.
  - Drop "(characterization)" from `puts the page state back to its defaults…` and `restarts the flight timer…` and add
    their sources (3-3, 4-13, 5-14, 5-22, the trainer record); remove the TRI/OTH fields from the first one's list.
- [ ] **Step 2: Run:** the guard FAILS naming `navPage.nav4SelectedAltitude`, `navPage.obsMag`, … (confirm it names the
  fields expected; that is its own first mutation check).
- [ ] **Step 3: Implement** the `reset` changes.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`. Then prove the guard: delete one reset line (say `obsMag`), run
  the guard → red naming it; restore; `git diff` shows only intended changes.
- [ ] **Step 5: WIP commit** `WIP #192 reset list and guard`.

### Task 8: #192 docs and the squash

**Files:**
- Modify: `docs/kln89-trainer-record.md` (a 2026-10-24 block: both rounds, from the session scratchpad report
  `trainer-power-cycle-report.md`, in the file's existing style, caveats kept), `docs/architecture.md` (`VolatileMemory`:
  the rule, the 5-minute exception, the saved waypoints), `CLAUDE.md` (UI section: "state that must survive goes in
  `props.memory` (`VolatileMemory`) or in user settings" becomes: state that must survive a page change goes in
  `props.memory`; state the unit keeps over a power cycle is a user setting; short-interruption state stays in memory
  behind the 5-minute check)
- Memory (outside the repo): update `state-in-volatile-memory.md` with the #192 rule.

- [ ] **Step 1:** write the docs.
- [ ] **Step 2:** `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 3: Squash** the WIP commits of Tasks 4-8: `git reset --soft <the #332 commit>` then one commit
  `fixes #192 keep only forgotten state in VolatileMemory: what the unit keeps over a power cycle is a user setting`
  with a body listing the moved, reset and short-interruption fields and the evidence. `git log --oneline` shows four
  commits on top of the design commit: #400, rename, #332, #192.
