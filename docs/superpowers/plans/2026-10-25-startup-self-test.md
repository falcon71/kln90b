# Start-up Self-Test (#416) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The unit never sits on the Turn-On page silently: a failed first waypoint recovers, a failed scan list build or a facility call hung for 60 s fails the start-up self-test (`TEST FAIL`, `DATA BASE CHECKSUM ERR`, the error page), and a power cycle is the retry.

**Architecture:** A `PendingCalls` tracker records every facility call in flight (through a decorator around the SDK facility client) and the `msa.json` request. `WelcomePage.tick` (the real unit's internal test) checks it while the unit is not ready and fails the test on a call pending for over 60 s; `VolatileMemory.reset` fails it on a scan list that cannot be built. `VolatileMemory` numbers its power-ons so late answers of an earlier one change nothing. The `TickController` is built before the first await of `KLN90BCore.asyncInit` so the check runs during the whole boot.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (unit, render stages).

**Spec:** `docs/superpowers/specs/2026-10-25-startup-self-test-design.md` (read it first; section numbers below refer to it).

## Global Constraints

- The hang threshold is exactly **60 s** per call (`HANG_TIME_MS = 60_000`), measured with `Date.now()`.
- The MSG text is exactly `DATA BASE CHECKSUM ERR`; the Self Test page text is exactly `TEST FAIL`, flashing, in place of `ANNUN    ON` on the left page's last row.
- No public contract changes: no H event, LVar, panel.xml key, SimVar or persisted setting is added, renamed or repurposed.
- No automatic retries. No timeout that changes a call's result or rejection: the tracker only bookkeeps.
- `target: es2017`: TypeScript downlevels syntax, but no newer runtime APIs (for example no `Promise.allSettled`).
- Manual references in comments: Pilot's Guide 3-3, 3-4 (Turn-On, Self Test, TEST FAIL), the message list for `DATA BASE CHECKSUM ERR`; maintenance manual pages 1011 (Turn-On ~15 s) and 1022 (troubleshooting). Cite page numbers only; never copy manual text.
- American English in comments and docs. No counts of things that grow in prose.
- **Commits:** each task commits on the branch `issue-416-startup-test` as `WIP #416 <task name>`. Task 5 squashes all task commits into one commit `fixes #416 ...` (CLAUDE.md: one commit per issue). End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git push`.

## Review Focus

1. **The pilot is editing a welcome line (left cursor on) when the test fails** → the error page appears at once, the Turn-On page stays until the cursor is off, then goes to `TEST FAIL`. Test in Task 4.
2. **A call that hangs after the unit left the Turn-On page** (main page shown) → no failure, no error, ever: the check runs only on the Turn-On page while not ready. Test in Task 4.
3. **A failed test, then a power cycle before APPROVE?, with navdata that now answers** → the second power-on shows `ANNUN    ON`, and the MSG page has no `DATA BASE CHECKSUM ERR` (the power-off cleared it). Test in Task 4 (the retry test).
4. **Take-home mode with a failed test** → the Take-Home warning first, then the Self Test page with `TEST FAIL`. Test in Task 4.
5. **A slow but answering start-up** (a call answering after 50 s) → passes the test, `ANNUN    ON`, no error. Test in Task 4.

---

### Task 1: The pending-call tracker and the tracked facility client

**Files:**
- Create: `kln90b/services/PendingCalls.ts`
- Test: `test/unit/services/PendingCalls.test.ts`

**Interfaces:**
- Consumes: `ActualFacilityClient` from `kln90b/data/navdata/KLNFacilityLoader.ts` (a `Pick` of the SDK `FacilityLoader`: `getFacility`, `getAirway`, `searchByIdentWithIcaoStructs`, `startNearestSearchSessionWithIcaoStructs`, `awaitInitialization`).
- Produces:
  ```ts
  export const HANG_TIME_MS = 60_000;
  export const FACILITY_INITIALIZATION = "facility initialization";
  export interface PendingCall { readonly description: string; readonly started: number; }
  export class PendingCalls {
      /** Records the call until the promise settles; returns a promise that settles exactly as `promise` does */
      track<T>(description: string, promise: Promise<T>): Promise<T>;
      /** The pending calls in start order (for tests and the error message) */
      pending(): PendingCall[];
      /** The FACILITY_INITIALIZATION entry if it has been pending longer than HANG_TIME_MS (whenever it started);
       *  else the oldest entry started at or after `since` that has; else null */
      findHung(now: number, since: number): PendingCall | null;
  }
  export function trackFacilityClient(client: ActualFacilityClient, calls: PendingCalls): ActualFacilityClient;
  ```

- [ ] **Step 1: Write the failing tests** in `test/unit/services/PendingCalls.test.ts` (fake timers, `vi.useFakeTimers()`; build a deferred helper `deferred<T>()` returning `{promise, resolve, reject}`):
  - `lists a pending call with its description and start, and removes it when it resolves`: `track('a', d.promise)`; `pending()` equals `[{description: 'a', started: Date.now()}]`; after `d.resolve(5)` and `await`, the tracked promise resolves to `5` and `pending()` is `[]`.
  - `removes a call that rejects and passes the rejection through unchanged`: tracked promise rejects with the same `Error` instance; `pending()` is `[]`.
  - `finds no hung call at exactly 60 s and finds it after`: `findHung(start + 60_000, 0)` is `null`; `findHung(start + 60_001, 0)` is the entry.
  - `ignores calls started before since`: entry started at t=0, `findHung(70_000, 1)` is `null`.
  - `names the oldest hung call`: two hung entries `'first'` (t=0) and `'second'` (t=1000); `findHung(70_000, 0).description` is `'first'`.
  - `names the facility initialization first, whenever it started`: an initialization entry started at t=0 and a call `'x'` at t=1000; `findHung(70_000, 5000)` has description `FACILITY_INITIALIZATION`.
  - `trackFacilityClient tracks the initialization from its creation`: a stub client whose `awaitInitialization` never settles; after `trackFacilityClient(stub, calls)`, `pending()` contains `FACILITY_INITIALIZATION`; with a resolving one it is gone after `await`.
  - `trackFacilityClient describes each call`: with a stub whose methods return never-settling promises, calling each method lists exactly these descriptions (the enums print as their numbers):
    - `getFacility(FacilityType.Intersection, ICAO.value('W', 'K1', '', 'ZZXIN'))` → `getFacility(<FacilityType.Intersection>, <ICAO.tryValueToStringV2 of it>)`; a string ICAO argument is printed as given.
    - `searchByIdentWithIcaoStructs(FacilitySearchType.Intersection, 'K', 1)` → `searchByIdentWithIcaoStructs(<n>, "K", 1)`.
    - `startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor)` → `startNearestSearchSessionWithIcaoStructs(<n>)`.
    - `getAirway('V1', 2, icao)` → `getAirway("V1", 2, <icao V2>)`.
  - `trackFacilityClient passes results and rejections through`: a resolving stub's `getFacility` resolves to the stub's facility object (same instance); a rejecting one rejects with the same `Error`.

- [ ] **Step 2: Run them to verify they fail**
  Run: `npx vitest run test/unit/services/PendingCalls.test.ts`
  Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement `kln90b/services/PendingCalls.ts`.** A `Map<number, PendingCall>` keyed by an incrementing id (insertion order is start order). `track` attaches one `then(onValue, onError)` that deletes the entry and returns the value or rethrows, and returns that chain (no side chain, so no extra unhandled rejection). `trackFacilityClient` returns an object implementing `ActualFacilityClient` that forwards each method through `calls.track(description, client.method(...))`; at creation it tracks `client.awaitInitialization()` under `FACILITY_INITIALIZATION` and catches that internal chain's rejection (no caller owns it); its own `awaitInitialization()` forwards untracked. Class doc comment: why it exists (#416, design 4.4), and that it changes no result.

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `npx vitest run test/unit/services/PendingCalls.test.ts` → PASS. Run `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**
  ```bash
  git add kln90b/services/PendingCalls.ts test/unit/services/PendingCalls.test.ts
  git commit -m "WIP #416 the pending-call tracker"
  ```

### Task 2: Display ticks from the start of the boot, and the tracker wired in

**Files:**
- Modify: `kln90b/TickController.ts` (constructor arrays, new `addCalculations`)
- Modify: `kln90b/KLN90BCore.ts` (`asyncInit`: build order, tracker, msa)
- Modify: `kln90b/pages/WelcomePage.tsx` (`WelcomePageProps`), `kln90b/pages/Page.tsx` (`PageProps`)
- Test: `test/unit/TickController.test.ts`, `test/render/KLN90BCore.init.test.ts`

**Interfaces:**
- Consumes: Task 1 `PendingCalls`, `trackFacilityClient`.
- Produces:
  - `TickController.addCalculations(calcTickables: CalcTickable[], signalTickables: CalcTickable[]): void` — appends to the lists the running loops iterate; the constructor keeps its signature.
  - `WelcomePageProps.pendingCalls: PendingCalls` and `PageProps.pendingCalls: PendingCalls` (the same instance, held by `KLN90BCore` as `private readonly pendingCalls = new PendingCalls()`).

- [ ] **Step 1: Write the failing tests**
  - `test/unit/TickController.test.ts`, new test `runs calculations added after construction, in order, from the next tick (#416)`: a controller built with `[]` calc and `[]` signals, powered; `tickCalc()` runs nothing; after `addCalculations([a, b], [s])`, `tickCalc()` runs `a` then `b` and `tickSignals()` runs `s`.
  - New harness entry in `test/harness/boot.ts`: `export async function startUnit(opts: BootOptions = {}, waitMs = 1000): Promise<FailedBoot>` — `prepareBoot`, `core.init`, then `vi.advanceTimersByTimeAsync(waitMs)`, waiting for nothing; it returns the same shape as `bootUnitExpectingError` (the boot stays marked incomplete). Document it in `test/README.md` next to `bootUnitExpectingError`.
  - `test/render/KLN90BCore.init.test.ts`, new test `ticks the Turn-On page while the boot waits on its first lookup (#416)`: engine running, storage `activeWaypoint` = the V2 ICAO string of a default-navdata facility (`test/harness/fixtures.ts`), `vi.spyOn(MemoryFacilityClient.prototype, 'getFacility')` returning `new Promise(() => undefined)` for that ident (others call through), `vi.spyOn(WelcomePage.prototype, 'tick')`; `startUnit()`; expect the spy called at least once and `propsReady` not fired (subscribe on `core.bus` before the wait, or check that no `PageProps` arrived).
  - The existing test `runs the calculation tickables in the documented order` must still pass unchanged.

- [ ] **Step 2: Run them to verify they fail**
  Run: `npx vitest run test/unit/TickController.test.ts test/render/KLN90BCore.init.test.ts`
  Expected: the two new tests FAIL (`addCalculations` is not a function; no display tick before props).

- [ ] **Step 3: Implement.**
  - `TickController`: `calcTickables` and `signalTickables` become mutable arrays; `addCalculations` pushes into them. Doc comment: the display loop is built early so the Turn-On page's self-test runs during the boot (#416).
  - `KLN90BCore.asyncInit`: right after `const sensors = new Sensors(...)` and before `forceReadyToUse` powers the unit, `this.tickManager = new TickController(this.bus, [this.pageManager], [], [])`. Where it is built today, call `this.tickManager.addCalculations([...the same list, same order...], [new SignalOutputFillterTick(sensors)])`. The facility client becomes `trackFacilityClient(this.platform.createFacilityClient(this.bus), this.pendingCalls)`. `msa.init(...)` in the final `Promise.all` becomes `this.pendingCalls.track("msa.json", msa.init(this.planeSettings.basePath))`. `pendingCalls` goes into the `PowerSupply` props and the `PageProps` object.
  - `getRouteManager()` stays untracked (spec 4.4).

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `npx vitest run test/unit/TickController.test.ts test/render/KLN90BCore.init.test.ts` → PASS. Then `npm test` → all green (the early display ticks must not break any existing test), `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**
  ```bash
  git add -A kln90b test
  git commit -m "WIP #416 display ticks from the start of the boot, tracker wired in"
  ```

### Task 3: The power-on reset: recovery, failure, and the power-on numbering

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`reset`, `restoreOr`, remove `setFirstApt/Vor/Ndb/Intersection/Supplementary`, `WaypointPageState.restore`, `TriPageState.restore`, new `selfTestFailure`)
- Modify: `kln90b/data/SavedWaypoint.ts` (`restore`)
- Modify: `kln90b/data/navdata/Scanlist.ts` (`FacilityLoaderScanlist.init`, `rebuildIndex`, `waypointsChanged`)
- Test: `test/render/data/VolatileMemory.test.ts`, `test/unit/data/navdata/Scanlist*.test.ts` (whichever file tests `FacilityLoaderScanlist`; find it with `grep -rl FacilityLoaderScanlist test`)

**Interfaces:**
- Produces:
  - `VolatileMemory.selfTestFailure: Error | null` — null at every power-on (set in `reset` with `isReady = false`); set by the reset to the first unrecovered failure of the current power-on (a scan list build that rejects, or any rejection of the reset's `Promise.all`); a non-`Error` reason is wrapped in `new Error(String(reason))`. Task 4 reads and writes it.
  - `SavedWaypoint.restore(loader: FacilityClient, isCurrent: () => boolean = () => true): Promise<T | null>` — clears the setting only when `isCurrent()`.
  - `WaypointPageState.restore(loader, isCurrent = () => true)` and `TriPageState.restore(loader, isCurrent = () => true)` — write page state only when `isCurrent()`.
  - `FacilityLoaderScanlist.init()` — unchanged signature; a later `init` (or waypoint sync) wins over an earlier build still running; a rejected `init` leaves the list empty (`isEmpty()` true, `getNext` returns null) and rethrows.

- [ ] **Step 1: Write the failing tests** (render stage, in `test/render/data/VolatileMemory.test.ts`, following the existing #416 pin's spy style):
  - The pin `leaves the Turn-On page when the first waypoint of the INT scan list does not load (#416)` becomes `it(...)` and also asserts `unit.props.memory.selfTestFailure` is `null` and the INT page state is empty (`intPage.facility === null`, `intPage.ident === '0   '`).
  - Siblings, one `it.each` over APT / VOR / NDB (the default navdata's idents from `test/harness/fixtures.ts`): the page starts empty with ident `'0   '` (APT), `'0  '` (VOR), `'0   '` (NDB) — the values today's `setFirstX(null)` writes — and the unit shows NAV 2.
  - `fails the self-test of the power-on when a scan list cannot be built (#416)`: `searchByIdentWithIcaoStructs` rejects for `FacilitySearchType.Intersection`; after settling: `memory.selfTestFailure` is the rejection's `Error`, `memory.isReady` is true, `unit.takeRejections()` is `[]`, the INT scan list `isEmpty()`.
  - `keeps a page's restored waypoint when its scan list cannot be built (#416)`: storage `intPageWpt` = the saved V2 of ZZXIN (`savedOf`), INT search rejects → `intPage.facility.icaoStruct.ident` is `'ZZXIN'`.
  - `writes no page state and no setting from a late answer of an earlier power-on (#416)`: storage `tri1To` = saved V2 of a default facility; the first `getFacility` for it returns a deferred, later ones call through. Power-on (engine running boot), `panel.powerCycle()`, settle; then `deferred.reject(new Error('timed out'))` (what the SDK's null becomes in `KLNFacilityLoader`), settle. Expect `storedSetting(unit, 'tri1To')` unchanged and `memory.triPage.tri1To?.icaoStruct.ident` the facility's ident, and `memory.isReady` true.
  - `sets isReady only for the current power-on (#416)`: the first power-on's INT `'Z'` search is a deferred; power cycle; the second power-on completes (`isReady` true); resolving the first deferred with `[]` afterwards leaves the INT scan list non-empty and `isReady` true.
  - Scanlist unit tests (stub `FacilityClient`): `a rejected init leaves the list empty and rethrows`; `a later init wins over an earlier build that finishes last` (first build's searches deferred, second build completes, then the first resolves with other ICAOs → `start()` returns the second build's first ICAO).

- [ ] **Step 2: Run them to verify they fail**
  Run: `npx vitest run test/render/data/VolatileMemory.test.ts` and the Scanlist test file.
  Expected: the new tests FAIL (`selfTestFailure` undefined, unhandled rejection collected, setting cleared, stale build wins).

- [ ] **Step 3: Implement.**
  - `VolatileMemory`: a private power-on counter; `reset` takes `const powerOn = ++this.powerOnCount` and `const isCurrent = () => powerOn === this.powerOnCount`, sets `selfTestFailure = null`.
  - `restoreOr(page, scanlist, type: FacilityType, emptyIdent: string, isCurrent)` replaces the five `setFirstX` methods: restore the saved waypoint and build the scan list in parallel; a scan list rejection is recorded as `selfTestFailure` (first one wins, current power-on only) and treated as no first waypoint; if nothing was restored, load the first waypoint with `getFacility(type, first)`, a rejection logged with `console.warn` and treated as none (#416, spec 4.1); then, only if `isCurrent()`, set `page.facility` and `page.ident` (the facility's ident, or `emptyIdent`). Calls: APT `FacilityType.Airport, "0   "`; VOR `FacilityType.VOR, "0  "`; NDB `FacilityType.NDB, "0   "`; INT `FacilityType.Intersection, "0   "`; SUP `FacilityType.USR, "0   "`.
  - The reset's `Promise.all(...)`: `.then` sets `isReady` only if current; a `.catch` records the reason as `selfTestFailure` if current and none is set (spec 4.1a).
  - `SavedWaypoint.restore`, `WaypointPageState.restore`, `TriPageState.restore` get the `isCurrent` parameter as in Interfaces; `reset` and `restoreOr` pass it.
  - `FacilityLoaderScanlist`: a build generation; the index is built into a local array and assigned only while its generation is current; `init` on rejection empties the index and the cache (`invalidateCache`) when current, then rethrows; `waypointsChanged` takes a new generation too and catches its build's rejection with a `console.warn` (today it is an unhandled promise).
  - Comments cite #416 and the spec sections; keep the existing #192, #202, #422 comments.

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `npx vitest run test/render/data/VolatileMemory.test.ts` and the Scanlist test file → PASS; `npm test` → all green; `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**
  ```bash
  git add -A kln90b test
  git commit -m "WIP #416 the power-on reset recovers, fails the self-test, and numbers its power-ons"
  ```

### Task 4: The self-test on the Turn-On page and TEST FAIL

**Files:**
- Modify: `kln90b/pages/WelcomePage.tsx` (`tick`, the failure)
- Modify: `kln90b/pages/left/SelfTestLeftPage.tsx` (`TEST FAIL`)
- Modify: `kln90b/controls/Blink.tsx` (a non-inverse variant)
- Modify: `test/harness/boot.ts` (`bootUnitExpectingError` waits up to 70 s instead of 30 s; update its doc comment)
- Test: `test/render/pages/WelcomePage.test.ts` (new `describe('the start-up self-test (#416)')`), `test/render/KLN90BCore.startup.test.ts` (the hangs in `asyncInit`)

**Interfaces:**
- Consumes: Task 1 `PendingCalls.findHung`, `HANG_TIME_MS`, `FACILITY_INITIALIZATION`; Task 2 `props.pendingCalls`; Task 3 `memory.selfTestFailure`.
- Produces: `Blink` constructor `new Blink(contents: string, inverted = true)` (existing callers unchanged).

Behavior to build (spec 4.2), decided here:
- `WelcomePage` holds `private failure: Error | null`. In every `tick`, while `failure` is null: with the props there and `memory.selfTestFailure` set, that is the failure; else, unless the props are there and `memory.isReady`, `pendingCalls.findHung(Date.now(), propsThere ? this.startTime : -Infinity)` gives the hung call, and the failure is a new `Error`:
  - for `FACILITY_INITIALIZATION`: `Start-up self-test failed: the sim's facility initialization has not completed for <s> s`
  - otherwise: `Start-up self-test failed: <description> has not answered for <s> s` (`<s>` = whole seconds pending).
  A new failure is published once on the `error` topic (`ErrorEvent`).
- The page leaves when (the 17 s have passed or `forceReadyToUse`) and the left cursor is off and the props are there and (`memory.isReady` or `failure` is set). On leaving with a failure: `memory.selfTestFailure` is set to it if still null, `messageHandler.addMessage(new OneTimeMessage(["DATA BASE CHECKSUM ERR"]))`, and the Self Test page is shown (the Take-Home warning first in take-home mode) **also with `forceReadyToUse`**, where `acquireAndUseSatellites()` still runs but `isSelfTestApproved` is not set. Without a failure everything is as today.
- `SelfTestLeftPage` renders its last row as `TEST FAIL  ` (left-aligned, padded to 11) in a non-inverse `Blink` when `memory.selfTestFailure !== null` at construction, else `ANNUN    ON` as today; it ticks the `Blink`.

- [ ] **Step 1: Write the failing tests** (spies on `MemoryFacilityClient.prototype` as in the #416 pin; `never = () => new Promise(() => undefined)`; the default intersection ZZXIN is the INT scan list's only entry, so a hang of `searchByIdentWithIcaoStructs(FacilitySearchType.Intersection, 'Z', ...)` hangs the INT build after the props):
  - `fails the self-test when a scan list search hangs for 60 s (cold start)`: `bootUnit({engineRunning: false})`, `panel.powerOn()`, INT `'Z'` search hangs. At 59 s: `unit.errors` is empty and the Turn-On page shows. At 61 s: `unit.errors` has one error whose message contains `searchByIdentWithIcaoStructs(` and `"Z"`; the Self Test page shows, its left last row is `TEST FAIL  ` and not `ANNUN    ON`, and over four display ticks the `TEST FAIL` cells read `B` in some ticks and `.` in others (never `I`). `panel.approveSelfTest()`, then `panel.readMessages()` contains `DATA BASE CHECKSUM ERR`.
  - `shows the failed Self Test page with the engine running`: `bootUnit()` (engine running), same hang; at 61 s the Self Test page shows `TEST FAIL` (not the main page), `memory.navPage.isSelfTestApproved` is false.
  - `fails the self-test at once when a scan list cannot be built`: INT search rejects; cold start; at 19 s the Self Test page shows `TEST FAIL`; one error, the rejection.
  - `passes a slow start-up whose calls answer within 60 s` (Review Focus 5): INT `'Z'` search answers the real result after `setTimeout` 50 s; cold start; at 52 s `ANNUN    ON`, no error.
  - `retries by a power cycle` (Review Focus 3): INT `'Z'` hangs on its first call only; fail at 61 s; `panel.powerCycle()`; at 19 s after the power-on `ANNUN    ON`, no new error, and after `approveSelfTest` `readMessages()` does not contain `DATA BASE CHECKSUM ERR`. A second variant where it hangs on every call fails again (`TEST FAIL`) on the second power-on, 61 s after it — the call left over from the first power-on does not fail it earlier (assert no `TEST FAIL` and one error only at 40 s).
  - `publishes the failure while the pilot edits a welcome line, and leaves once the cursor is off` (Review Focus 1): cold start, left CRSR on the Turn-On page before 60 s; at 61 s one error and still the Turn-On page; CRSR off → next ticks show `TEST FAIL`.
  - `does not fail for a call that hangs after the Turn-On page` (Review Focus 2): engine running, main page shown, then `getFacility` hangs for every call; advance 120 s with a page change that looks a waypoint up; no error.
  - `goes through the Take-Home warning to TEST FAIL` (Review Focus 4): panel.xml with take-home mode (see `cfg/panel.xml` for the key), INT hang; at 61 s the Take-Home warning; ENT → `TEST FAIL`.
  - In `test/render/KLN90BCore.startup.test.ts`, `describe('a hang during the boot (#416)')`:
    - `shows the error page for a hung last-active-waypoint lookup and stays on the Turn-On page`: storage `activeWaypoint` = a default facility's V2, its `getFacility` hangs; `bootUnitExpectingError()`; `errorPage()` contains `getFacility(`; the screen's row 0 is ` GPS             ORS 20`.
    - the same for `startNearestSearchSessionWithIcaoStructs` hanging (message contains it) and for `msa.json` (`vi.spyOn(MSA.prototype, 'init').mockReturnValue(never())`, message contains `msa.json`).
    - `names the facility initialization when it never completes`: `awaitInitialization` and `startNearestSearchSessionWithIcaoStructs` both never settle; the error contains `facility initialization`.
    - `goes to TEST FAIL when a call hung before the props answers later`: the last-active lookup is a deferred; after the error, resolve it; within 2 s the Self Test page shows `TEST FAIL` (engine running) and no second error is published.

- [ ] **Step 2: Run them to verify they fail**
  Run: `npx vitest run test/render/pages/WelcomePage.test.ts test/render/KLN90BCore.startup.test.ts`
  Expected: the new tests FAIL (no error, the Turn-On page stays).

- [ ] **Step 3: Implement** the behavior above in `WelcomePage.tick`, `SelfTestLeftPage`, `Blink`, and the 70 s wait of `bootUnitExpectingError`. Comments: 3-3, 3-4 for the Turn-On page as the internal test and `TEST FAIL`; maintenance manual 1022 for reading MSG after APPROVE?; the `DATA BASE CHECKSUM ERR` message list reference; #416 and the spec.

- [ ] **Step 4: Run the tests to verify they pass**
  Run: `npx vitest run test/render/pages/WelcomePage.test.ts test/render/KLN90BCore.startup.test.ts` → PASS; `npm test` → all green; `npx tsc --noEmit` → clean; `npm run build` → succeeds without new circular-dependency warnings beyond the existing ones.

- [ ] **Step 5: Commit**
  ```bash
  git add -A kln90b test
  git commit -m "WIP #416 the start-up self-test on the Turn-On page and TEST FAIL"
  ```

### Task 5: Docs, full verification, one commit

**Files:**
- Modify: `docs/architecture.md` (Core 1: the boot builds the `TickController` early, the tracker, the self-test on the Turn-On page, `TEST FAIL`, the power cycle as the retry; Core 2: `addCalculations`; the `VolatileMemory.reset` description: power-on numbering, `selfTestFailure`, the first-waypoint recovery)
- Modify: `test/README.md` only if Task 2 added a harness entry or Task 4's 70 s wait needs mentioning.

- [ ] **Step 1: Update the docs** as listed; describe the code, not the history. `docs/test-coverage-record.md` stays (dated record).
- [ ] **Step 2: Verify everything**
  Run: `npx tsc --noEmit` → clean; `npm test` → all green; `npm run build` → succeeds.
- [ ] **Step 3: Squash the task commits into one**
  ```bash
  git reset --soft <the commit of this plan>
  git commit -m "fixes #416 The start-up self-test fails instead of hanging on the Turn-On page: a facility call pending for 60 s or a scan list that cannot be built shows TEST FAIL and DATA BASE CHECKSUM ERR, a power cycle retries, and a first waypoint that does not load leaves its page empty

  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  ```
  Check with `git log --oneline -4` that the branch reads: design, plan, the one `fixes #416` commit.
