# The start-up self-test: no silent hang on the Turn-On page (#416, widened): design

Date: 2026-10-25. Issue: #416 (bug), widened by the maintainer to every way the unit can stay on the Turn-On page.
Branch: `issue-416-startup-test`.

A project. One commit, `fixes #416`, with its tests and doc changes (CLAUDE.md: one commit per issue).

## 1. Intent

The maintainer has seen the unit stay on the Turn-On page for good, rarely, in the sim; a sim restart cured it. The
theory is that the facility loaders can get stuck at the start of a sim session. Today nothing tells the user: no error,
no message, nothing to report.

The goal: **the unit never sits on the Turn-On page silently.** Every case in which it can stay there is either

- **recoverable**: the unit recovers and carries on, or
- **not recoverable**: the user is told. From then on the behavior is undefined.

The maintainer's rulings in the brainstorming (2026-10-25):

- A lookup that *fails* (rejects) is recovered where the unit stays fully capable (a first waypoint of a scan list that
  does not load). A failure that would leave the unit degraded for the rest of the power-on (a scan list that cannot be
  built) fails the self-test instead, so the pilot cycles the power to get the full unit back.
- A lookup that *hangs* (never settles) goes straight to a failure. **No automatic retries**; they can be added later if
  it turns out to happen more often than expected.
- A hang is a single call that has not settled within **60 s**, measured per call, not for the whole boot. The SDK
  itself treats a confirmed facility request that has been pending for 60 s as timed out. A slow PC whose start-up keeps
  making progress never trips it.
- The failure is emulated as the real unit's failed self-test (below), and the developer error page appears as well,
  naming the call that hung, so that user reports say where it stopped.
- With the engine running (the self-test is skipped today), a failed test **shows the Self Test page anyway**, so the
  pilot sees it.

## 2. Evidence: what the real unit does

- Pilot's Guide 3-3: the Turn-On page is shown while the unit runs its internal test, and it is always replaced by the
  Self Test page when the test is complete. Maintenance manual page 1011: the Turn-On page times out after about 15 s.
- Pilot's Guide 3-4: a passed test shows `ANNUN ON` at the bottom left of the Self Test page; a failed one shows a
  flashing `TEST FAIL` there instead. The pilot recycles the power; a unit that still shows `TEST FAIL` needs repair and
  should not be used for navigation. The unit is not locked: the pilot can go on.
- Maintenance manual page 1022 (troubleshooting): when the unit shows FAIL, the technician approves the date and the
  database pages and then reads the MSG page to identify the failure.
- Pilot's Guide, the message list (chapter 6): `DATA BASE CHECKSUM ERR` is posted when the database fails its internal
  test at power-on. It is the closest real message to "the navdata does not answer".
- The AVsoftech KLN 90B trainer does not open the MSG page on the Self Test page. That agrees with the maintenance
  manual: MSG is read after APPROVE?. The unit already behaves this way (`EVT_MSG` is handled only in `MainPage`).

## 3. Today: what the Turn-On page waits for

`WelcomePage.tick` leaves the Turn-On page when `TEST_TIME` (17 s) has passed (or at once with the engine running or in
debug mode), the left cursor is off, and `arePropsReady`: `propsReady` has been published **and** `memory.isReady` is
set.

- **`propsReady`** is published at the end of `KLN90BCore.asyncInit`, which runs once per instrument load. On the way it
  awaits the last active waypoint (`facilityLoader.getFacility`, `KLN90BCore.ts:316`), the flight plan restore
  (`restoreAllFlightplan`, a facility load per leg) and then `Promise.all` of `nearestUtils.init()`,
  `nearestLists.init()`, `airspaceAlert.init()` (nearest search session starts) and `msa.init()` (an XHR of
  `msa.json`). A rejection of `asyncInit` or of that `Promise.all` already reaches the error page. A call that never
  settles leaves the unit on the Turn-On page silently.
- **`memory.isReady`** is set at the end of `VolatileMemory.reset` at every power-on, after `Promise.all` of the five
  `restoreOr` (the saved page waypoint, the scan list build `scanlist.init()`, which runs dozens of ident searches, and
  `setFirstApt/Vor/Ndb/Intersection/Supplementary`) and `triPage.restore`. The `Promise.all` has no `catch`.
    - #416: `setFirstApt/Vor/Ndb/Intersection` call `getFacility` without a `try`; a rejection rejects the
      `Promise.all`, `isReady` stays false, the rejection is unhandled, no error page.
    - A rejection of `scanlist.init()` (an ident search that rejects) does the same.
    - `SavedWaypoint.restore` and `TriPageState.restore` never reject.
    - A call that never settles leaves the unit on the Turn-On page silently.
- **The SDK** (`FacilityLoader`, msfs-avionics-mirror `src/sdk/navigation/FacilityLoader.ts`): every Coherent facility
  call first awaits the static `initListener()`, which waits for `RegisterViewListener('JS_LISTENER_FACILITY')` to call
  back. If it never does, every facility load, ident search and search session start waits forever, and the promise is
  cached statically, so nothing in the session can retry it. A single facility request whose answer is lost waits until
  the same ICAO is requested again after 10 s (validity unconfirmed) or 60 s (confirmed); then the old request is
  resolved with null and a new one is dispatched.

## 4. Behavior

### 4.1 Recovered: a lookup that fails

- **The first waypoint of an APT, VOR, NDB or INT scan list does not load (#416).** The page starts empty for this
  power-on (ident `0` padded as today, no facility), as `setFirstSupplementary` already does for SUP. Handled in one
  place, in `restoreOr`, which catches a rejection of `setFirst(first)` and calls `setFirst(null)`; the inline catch of
  `setFirstSupplementary` is removed.
- It is logged with `console.warn`, as the SUP case is today. No message, no error page: the unit is fully usable, and
  the next power-on tries the first waypoint again.

### 4.1a Not recovered: a lookup that fails and leaves the unit degraded

- **A scan list build fails** (`scanlist.init()` rejects). That list would be empty or incomplete for the rest of the
  power-on, a degradation the pilot cannot see. The maintainer's ruling: it **fails the self-test** (4.2) at once, when
  the rejection arrives, without waiting 60 s, so the pilot cycles the power to get the full unit back. The error page
  shows the rejection. The page keeps its saved waypoint when that one restored; only a page with nothing restored
  starts empty as in 4.1. The rest of the reset goes on, so the unit reaches the Self Test page as a failed unit does.
- **Any other rejection in `VolatileMemory.reset`** fails the self-test the same way. None is expected today
  (`SavedWaypoint.restore` and `TriPageState.restore` never reject), so this is the catch on the reset's `Promise.all`
  that today is missing: nothing in the reset can be an unhandled rejection that leaves the unit on the Turn-On page.

### 4.2 Not recovered: a call that hangs during the start-up

**The self-test.** While the unit is on the Turn-On page and not ready, the page checks at every display tick whether a
tracked call (4.4) has been pending for more than 60 s. The first time it finds one in a power-on, **the self-test has
failed** (a failed lookup of 4.1a fails it the same way, at once):

- The developer error page is published once (the `error` topic), naming the call that hung, its arguments and how long
  it has been pending; when the pending call is the SDK's facility initialization, the message says that the sim's
  facility listener never came up. Example: `Start-up self-test failed: searchByIdentWithIcaoStructs(INT, "K") has not
  answered for 60 s`.
- **If the props are there** (`propsReady` was published; the hang is in `VolatileMemory.reset`): the unit goes on as a
  failed real unit does.
    - `DATA BASE CHECKSUM ERR` is posted on the MSG page (a one-time message).
    - The Turn-On page is left for the Self Test page (or the Take-Home warning first in take-home mode, as today), with
      a flashing `TEST FAIL` in place of `ANNUN ON` on the left page. Everything else on the Self Test page is as today.
    - **With the engine running the Self Test page is shown too**; GPS acquisition is still forced as today
      (`acquireAndUseSatellites`), but the test is not counted as approved: the pilot approves it with APPROVE?.
    - APPROVE? leads on as today (VFR warning, OBS warning or database page, then the main page), where MSG shows the
      message.
    - The page states that the hung calls were building stay as they were; scan lists may be empty or incomplete. This
      is the undefined behavior the maintainer accepted.
- **If the props are not there** (the hang is in `asyncInit`): the unit stays on the Turn-On page under the error page.
  There are no services to run any other page on, and `asyncInit` runs once per sim session, so nothing can retry it.
  The pilot's remedy is a sim restart.
- The left cursor rule stays: the Turn-On page is not left while the pilot edits a welcome line. The failure is detected
  and the error page published regardless.
- **The first failure in a power-on decides it.** A hang found before the props are there whose call answers later,
  so that the props arrive after all, still leads to the Self Test page with `TEST FAIL` and the message. A real
  unit's failed test does not turn into a pass. The failed state belongs to the power-on: the `WelcomePage` instance
  (one per power-on) holds it until `VolatileMemory` exists, and hands it on when it leaves the Turn-On page.
- **The check needs display ticks from the start of the boot.** Today `TickController` is built after the two awaits
  of `asyncInit` (the last active waypoint and the flight plan restore), so a hang there would never be checked. The
  `TickController` is built before the first await, with its display and signal tickables; the calculation tickables
  are handed to it once they exist. Display ticks before that point tick only the Turn-On page, which needs nothing
  else (it also lets the pilot edit a welcome line during that time, which today does not tick).

### 4.3 Retry: a power cycle

The Pilot's Guide's remedy for `TEST FAIL` (recycle the power) is the retry. Nothing automatic is added.

- A power-on runs `VolatileMemory.reset` again, which issues fresh lookups. A single lost answer recovers this way (a new
  ident search is a new Coherent call; the SDK re-dispatches a facility request for the same ICAO after its timeout), and
  the unit passes its self-test. A facility listener that never came up fails again: the unit needs a sim restart, as a
  real unit that still shows `TEST FAIL` needs repair.
- The message is gone after the power-off (`KLN90BCore` clears the messages at every power-off) and is posted again only
  if the test fails again.
- **Calls left pending from an earlier power-on do not fail the next one.** Once the props are there, only calls started
  in the current power-on count. Before the props are there, every pending call counts: the boot itself is still
  waiting on them, so a power cycle during a stuck `asyncInit` shows the error page again once the call is over 60 s old.
- **Late answers of an earlier power-on change nothing.** `VolatileMemory.reset` numbers its power-ons; a `restoreOr`,
  `triPage.restore` or the final `isReady` of an earlier power-on that settles after a newer power-on began writes no
  page state, **no user setting**, and does not set `isReady`. The same guard keeps today's quick off-and-on from mixing
  two resets. The settings matter because the retry itself produces such a late answer: when the new power-on asks for
  the same ICAO, the SDK resolves the old hung request with null, `KLNFacilityLoader.getFacility` throws, and
  `SavedWaypoint.restore` of the old power-on would clear the saved waypoint. The waypoint pages save it again through
  their `facility` setter, but `TriPageState.restore` does not, so TRI 1 and TRI 3 would lose their waypoints for good.
  `SavedWaypoint.restore` (or its callers) therefore clears a setting only for the current power-on.
- The `Scanlist` build of an earlier power-on may still be running when the next one starts its own; the later build must
  win (the builder decides how: a generation check in `FacilityLoaderScanlist.init`/`rebuildIndex`, or not starting a
  second build while one runs and awaiting it).

### 4.4 What is tracked

A thin decorator around the SDK facility client (`ActualFacilityClient`, what `KLN90BPlatform.createFacilityClient`
returns) records every call while it is pending: the method, a short description of its arguments, and the time it
started (`Date.now()`, as the Turn-On page's own timer). It changes no result and no rejection; it only bookkeeps. It
covers `getFacility`, `searchByIdentWithIcaoStructs`, `startNearestSearchSessionWithIcaoStructs` and `getAirway`. The
repository lookups of user waypoints are synchronous underneath and are not tracked.

**The facility initialization.** Nothing in the unit calls `awaitInitialization` today, and the boot does not start to
wait for it (that would change control flow, which approach A was rejected for). Instead the tracker calls the SDK
client's `awaitInitialization()` once, when it is created, and lists it as a pending entry named "facility
initialization" until it resolves. It counts like any other entry. When it is among the entries over 60 s, it is the one
the error page names: in the sim every other call is then only waiting on it. An initialization that never completes
while every call still answers (possible only with a test double) leaves the unit ready, and nothing fails: the unit is
not stuck.

**Which pending entries count.** Once the props are there, every tracked entry started in the current power-on counts,
not only the calls `VolatileMemory.reset` waits on: the scan lists' background job, the EFB route load and the lookups of
the calculation ticks count too. A plain decorator cannot tell callers apart, and a facility call that has not answered
for 60 s is a fault of the navdata whoever made it (a hung background job of a scan list would later hang the scanning
itself, which awaits it). A slow but working start-up still never trips it, since every single call answers within
60 s. The initialization entry counts in every power-on until it resolves. Before the props are there, every pending
entry counts (4.3).

The `msa.json` request registers itself with the same tracker under the name `msa.json`.

Not tracked: `platform.getRouteManager()` (it does not block the start-up, and with no EFB it never resolves: the tests'
`FakePlatform` returns such a promise on purpose), and the nearest searches of the calculation tick (not part of the
start-up).

The tracker lives in `KLN90BCore`, is created before `PowerSupply`, and reaches the Turn-On page through
`WelcomePageProps` (and so `PageProps`). The check itself lives in `WelcomePage`: the Turn-On page is the real unit's
internal test. The failed state of the current power-on lives in `VolatileMemory` (reset at every power-on, as
`isSelfTestApproved` is), so the Self Test page can read it.

Cost: one map insert and delete per facility call. The check at 4 Hz scans the pending calls only while the Turn-On page
is shown and the unit is not ready.

### 4.5 Unchanged

- A rejection of `asyncInit` or of its final `Promise.all` reaches the error page as today; it is not turned into
  `TEST FAIL` (the props are not there).
- An exception before `PageManager.Init` (panel.xml parsing) is out of scope: the screen is blank, not the Turn-On page.
- The Self Test page of a passed test, the 17 s, and the engine-running start that passes its test.

## 5. Approaches

- **B. A watchdog on the Turn-On page, fed by a tracker on the facility client (chosen).** It cannot be defeated by a
  catch on the boot path, it stays off the result path, it fires only when the unit is actually stuck, and its messages
  name the call. The maintainer first disliked putting the check and its state into `WelcomePage`, then chose it: that
  is what the real unit does on this page. The names are calls rather than boot steps, which is enough for a report.
- **A. A deadline wrapper at every start-up await** (a race against a 60 s timer that rejects with a named error). Not
  chosen: it changes control flow, and several catches on the boot path swallow everything (`SavedWaypoint.restore`
  never rejects; the last active waypoint's catch posts `WAYPOINT xxx DELETED`). Each would need to let the timeout
  through, or a hang would turn into a false recovery or a false message, and every future catch on the path would carry
  the same trap.
- **A global timeout in `KLNFacilityLoader` for every call, at all times.** Dropped: it changes in-flight behavior far
  beyond this issue.
- **Automatic retries.** Not now (maintainer): the power cycle is the retry.

## 6. Tests

All in the render stage, where the boot and the Turn-On page run on fake timers (`test/harness/boot.ts`); a hang is a
facility client method that returns a promise that never settles.

- **#416** (`test/render/data/VolatileMemory.test.ts`): the `it.fails` pin becomes a plain test: the INT page starts
  empty, the unit shows NAV 2, no rejection, `isReady`, no `TEST FAIL`. Siblings: the same for APT, VOR and NDB.
- **A hang after the props** (scan list build or a first waypoint that never answers): no error before 60 s; after it
  the error page names the call, the Self Test page shows `TEST FAIL` (and not `ANNUN ON`), and after APPROVE? and the
  database page the MSG page shows `DATA BASE CHECKSUM ERR`. Once with a cold start (17 s), once with the engine running
  (the Self Test page is shown, not skipped).
- **No false failure:** a call that answers after 50 s (slow, not hung) passes the test; a call that is slow but each
  call of a long build answers within 60 s passes.
- **A hang in `asyncInit`** (the last active waypoint, the flight plan restore, a search session start, `msa.json`):
  the error page names the call after 60 s and the Turn-On page stays. The harness's `bootUnitExpectingError` waits only
  30 s and needs a longer wait or a variant.
- **The facility initialization never completes** and the calls wait on it, as in the sim: the error page names the
  initialization, not the oldest call.
- **A hang found before the props whose call answers later:** the props arrive, and the unit goes to the Self Test page
  with `TEST FAIL` and the message.
- **The power cycle:** a call that hangs once and answers on the next power-on: the second power-on passes and shows no
  `TEST FAIL` and no message, and the late answer of the first power-on changes no page state and no setting (TRI 1
  and TRI 3 keep their saved waypoints). A hang that persists fails again on the second power-on.
- **A scan list build that rejects** (4.1a): the error page shows the rejection, the Self Test page shows `TEST FAIL`
  without a 60 s wait, the MSG page shows `DATA BASE CHECKSUM ERR`, no unhandled rejection; the page keeps its saved
  waypoint when that one restored, and starts empty when nothing restored. A power cycle with a build that works passes.
- **The tracker** (unit): a pending call is listed with its name and start; it is removed when it resolves and when it
  rejects; results and rejections pass through unchanged.

## 7. Docs

- `docs/architecture.md`, Core 1: the Welcome and self-test flow (the self-test, the tracker, `TEST FAIL`, the retry by
  power cycle), and Core 7 (`VolatileMemory.reset`, the power-on numbering) where it describes the reset.
- `docs/test-coverage-record.md` line 126 names `TEST FAIL` as not modeled; it is a dated record and stays, a later
  record says it is.
- No public contract changes (no H event, LVar, panel.xml key, SimVar or persisted setting).

## 8. Calls made in the write-up (for the maintainer to check)

Settled by the designer after the builder check, not discussed in the brainstorming:

- The `TickController` is built before the first await of `asyncInit`, so the check runs during the whole boot (4.2).
- Every tracked call of the current power-on counts, not only those the reset waits on (4.4).
- The facility initialization is tracked by the tracker itself and named first (4.4).
- The first failure in a power-on decides it, also when the hung call answers later (4.2).
- A late answer of an earlier power-on writes no user setting either; this protects TRI 1 and TRI 3 (4.3).
- A page whose saved waypoint restored keeps it when its scan list build fails (4.1a).
- Any unexpected rejection in the reset fails the self-test like a failed scan list build (4.1a).

## 9. Left to the builder

- The names and shapes of the tracker, its interface and the failed-test flag.
- How the Self Test page renders the flashing `TEST FAIL` (the existing `Blink` control or the blink tick).
- How the later scan list build wins over an earlier one still running (4.3).
- The exact wording of the error page message, within the content 4.2 gives.
