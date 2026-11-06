# FAST GPS Hot Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FAST (SET 10) stops being a receiver with its own timings: at power-on it writes the true state into the
unit's memory and the REAL start model gives a hot start (#468).

**Architecture:** One new method on `GPS` writes the truth (position, clock, almanac, ephemeris) into the unit and the
SDK receiver. `powerChanged` calls it before `search.start` when FAST is selected; SET 10 calls it, then restarts the
search, when switched to FAST without a fix. The FAST branches of the SDK timings, of `GpsSearch.start` and of the
constructor's almanac call are removed, so FAST and REAL run the same receiver after the start.

**Tech Stack:** TypeScript, `@microsoft/msfs-sdk` `GPSSatComputer`, Vitest (render stage, headless unit).

**Spec:** `docs/superpowers/specs/2026-11-06-fast-gps-hot-start-design.md`

## Global Constraints

- `target: es2017`; no newer runtime features.
- Manual references stay; FAST is a simulator convenience (#46), not in the Pilot's Guide. Cite #468 and #62 in
  comments where behavior changes.
- No forced acquisition (`acquireAndUseSatellites`) for FAST anywhere. The engine-running start in `WelcomePage.tsx`
  keeps its own forced acquisition unchanged.
- The `fastGpsAcquisition` setting key, its default (`GPS_ACQUISITION_FAST = true`) and its meaning to the user stay
  (persisted user data).
- REAL keeps `POSITION DIFFERS FROM LAST POSITION BY >2NM` and `SYSTEM TIME UPDATED TO GPS TIME` unchanged.
- One commit for the issue: `fixes #468 <description>`, with its tests and doc changes (CLAUDE.md). Tasks may commit
  as `references #468 WIP …`; Task 3 squashes every commit after the plan commit into the one `fixes #468` commit.
- American English; no counts of growing collections in prose.
- `npx tsc --noEmit`, `npm run build` and `npm test` all pass at the end.

## Review Focus

- **First power-on of a session, before the SDK satellites have loaded:** `awaitInit().then` restores the saved
  ephemeris and would overwrite the FAST ephemeris; FAST must still be hot. Test in Task 1 (fresh boot, cold and dark,
  stored position 1000 NM away, power on at once).
- **The engine-running start with FAST:** the power event comes first (`PowerSupply.forceReadyToUse`), then the forced
  acquisition. With the truth written first, no `POSITION DIFFERS` message appears even with empty storage. Test in
  Task 1.
- **Jamming at a FAST power-on:** the truth is written, but a jammed unit acquires nothing. The #467 jamming tests,
  unpinned from REAL, cover it (Task 2).
- **SET 10 switched to FAST while the unit has a fix:** nothing changes, no re-search, the fix stays. Test in Task 2.
- **Take-home mode with FAST:** the dead-reckoned position must not jump to the sim position at power-on (take-home is
  unsupported, but must not break). The truth is not written in take-home; covered by a guard in the method, no test
  required (take-home bugs are not pinned).

---

### Task 1: The FAST initialization at power-on, one receiver for FAST and REAL

**Files:**
- Modify: `kln90b/Gps.ts` (constructor timings and almanac call, `powerChanged`, the `awaitInit().then`, new methods)
- Modify: `kln90b/GpsSearch.ts` (constructor parameter `isFast`, `start`, the `Idle` doc comment)
- Test: `test/render/GpsAcquisition.test.ts` (replace the `fast GPS acquisition (characterization)` describe)

**Interfaces:**
- Produces: `KLNGPSSatComputer.setEphemerisCurrent(time: number): void` sets every satellite's private
  `data.lastEphemerisTime` to `time` (same private access and throw-on-move pattern as `restoreEphemeris`).
- Produces: `GPS.initializeFromTruth(): void` (public). Does nothing in take-home mode. Otherwise, with `now` = the
  sim's current UNIX ms (`absoluteTimeToUNIXTime(E:ABSOLUTE TIME)`, the same time base the SDK uses for ephemeris and
  almanac validity):
  `coords` set to `PLANE LATITUDE`/`PLANE LONGITUDE`; `timeZulu` set to `now` exactly (no battery-clock random);
  `gpsSatComputer.internalTime = now`; `gpsSatComputer.downloadAlamanac(now)` (pass the time explicitly: the SDK
  default is its context time, stale before the first update); `gpsSatComputer.syncLastKnownPosition(coords)`;
  `gpsSatComputer.setEphemerisCurrent(now)`; and a flag so that the `awaitInit().then` callback, if it runs later,
  calls `setEphemerisCurrent` with the then-current sim time after `restoreEphemeris`.
- Produces: `GpsSearch` constructor becomes `(computer, allBlocked)`; `start` always sets `pendingStart`.

- [ ] **Step 1: Write the failing tests** in `test/render/GpsAcquisition.test.ts`, replacing the three FAST
  characterizations (their premises are gone). Use the file's `powerOnCold`, `secondsToFix`, `messages` helpers:
  - `'FAST: a power-on 1000 NM from the stored position has its fix in hot-start time (#468, #62: 0:17)'` — storage
    with a last position at least 1000 NM from the harness's sim position and `lastAlmanacDownload: START - 400 * DAY`,
    with the FAST default; power on (cold and dark); `expect(await secondsToFix(unit, 60)).toBeLessThanOrEqual(17)`
    (#62: a hot start has its fix by 0:17, self-test included; the SDK draws at most `HOT_ACQUISITION +
    HOT_ACQUISITION_RANGE / 2` = 12 s, plus the search's begin tick and TRAN); and
    `expect(messages(unit)).not.toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM')`,
    `.not.toContain('SYSTEM TIME UPDATED TO GPS TIME')`.
  - The same storage with `fastGpsAcquisition: false`: the start model runs an almanac search, `secondsToFix(unit, 60)`
    returns 60 (no fix). This is the control that shows the first test's speed comes from FAST.
  - `'FAST: the unit clock is set to the sim time at power-on (#468)'` — before power-on set `gps.timeZulu` 30 days back
    (as the B-2 test does); after power-on, before any fix, `gps.timeZulu.getTimestamp()` equals the sim UNIX ms.
  - `'FAST: the first power-on of a session is hot although the satellites load after it (#468)'` — boot
    `engineRunning: false`, power on without advancing time first; same bound as above; every satellite's
    `lastEphemerisTime` is within 2 h of the sim time once the fix is there.
  - `'FAST: an engine-running start with empty storage posts no POSITION DIFFERS (#468)'` — `bootUnit({})`, settle;
    `messages(unit)` does not contain the message. With `fastGpsAcquisition: false` and empty storage it does (control).
  - `'FAST and REAL use the same receiver timings (#468)'` — a REAL-built and a FAST-built unit report the same
    private `satelliteTimingOptions.acquisitionTimeout` (4 min) and `ephemerisDownloadTime` (30 s).

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project render test/render/GpsAcquisition.test.ts`
Expected: the FAST tests fail (FAST today has no start model: clock not reset, timings 1 s); the REAL controls pass.

- [ ] **Step 3: Implement**

In `Gps.ts`: drop every `fastGPS ?` branch of `timingOptions` (keep the REAL values), always call
`downloadAlamanac(lastAlmanacDownload)` in the constructor, drop the `fastGPS ||` and the "stays off until the next
session" comment from the `GpsSearch` construction, and in `powerChanged` on power-on call `initializeFromTruth()`
when `fastGpsAcquisition` is set, after the battery-clock update and before `search.start(this.coords)`. In
`GpsSearch.ts`: remove `isFast` and the early return; update the `SearchMode.Idle` comment (no longer "FAST
acquisition is selected"). Update the `acquireAndUseSatellites` doc comment in `Gps.ts` (SET 10 FAST no longer forces).

- [ ] **Step 4: Run them and see them pass**

Run: `npx vitest run --project render test/render/GpsAcquisition.test.ts` → all pass. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit** — `references #468 WIP FAST writes the true state at power-on`.

### Task 2: SET 10, the bank and jamming tests, the suite fallout

**Files:**
- Modify: `kln90b/Gps.ts` (new public method), `kln90b/pages/left/Set10Page.tsx` (`saveFastGpsAcquisition`)
- Test: `test/render/pages/left/Set10Page.test.ts`, `test/render/AntennaTilt.test.ts`,
  `test/render/failures/GpsJamming.test.ts`, `test/render/failures/GpsReceiverFailures.test.ts` (the SET 10 case at
  its line ~198), and every test the full suite turns red

**Interfaces:**
- Consumes: `GPS.initializeFromTruth()` (Task 1).
- Produces: `GPS.startFast(): void` — returns if `isValid()` or take-home; otherwise `initializeFromTruth()` then
  `search.start(this.coords)`. `Set10Page.saveFastGpsAcquisition` calls it on a switch to FAST instead of
  `acquireAndUseSatellites()`; a switch to REAL only saves the setting.

- [ ] **Step 1: Write the failing tests**
  - `Set10Page.test.ts`: `'switching to FAST during a search gives a hot-start fix, with no Unreachable satellite (#468)'`
    — `bootUnit({coldGps: true, storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 30}})`, select
    FAST on SET 10 (cursor, inner 1), then `secondsToFix` is within the hot bound of Task 1 and no satellite is in
    `GPSSatelliteState.Unreachable` at the fix. Copy `secondsToFix` locally or move it to a harness helper.
  - `Set10Page.test.ts`: `'switching to FAST with a fix changes nothing (#468)'` — default boot, settle; record the
    in-use PRNs and `coords`; switch to FAST; after two calculation ticks `gps.isValid()` stayed true at every tick and
    `search.mode` is `SearchMode.Idle`.
  - `AntennaTilt.test.ts`: run the existing "right bank loses the lowest satellite" scenario for both
    `fastGpsAcquisition` true and false (`describe.each`); for both, the lost satellite shows as searched (`*PP  00`,
    not `*PP-`), and is back in use within 30 s after the wings are level again. Keep `lastLatitude/lastLongitude` in
    `HOME` and fix the "Real timings keep…" comment.
  - `GpsJamming.test.ts`: remove `fastGpsAcquisition: false` from the jamming storage (lines ~35, 56, 295) and the
    comment at ~49 that explains the pin; the tests must keep passing as they are (a jammed FAST power-on acquires
    nothing).

- [ ] **Step 2: Run them and see the new SET 10 ones fail**

Run: `npx vitest run --project render test/render/pages/left/Set10Page.test.ts test/render/AntennaTilt.test.ts test/render/failures`

- [ ] **Step 3: Implement `GPS.startFast()` and the `Set10Page` change.**

- [ ] **Step 4: Run the full suite and triage every red test**

Run: `npm test`
For each failure decide by what the test is about, and say in the commit body which way each file went:
- It tests REAL behavior from a stored position, clock or almanac (a seeded timing, `POSITION DIFFERS` as the live-list
  guard of `test/README.md`, the B-2 `DATA BASE OUT OF DATE` tests that set the clock back): pin
  `fastGpsAcquisition: false` in its storage.
- It only needs a fix and its seeded timing moved: update the expected value from a fresh run, and only where the test
  says the number is a characterization.
- Anything else is a possible regression: stop and report it, do not adjust the test.

- [ ] **Step 5: Run `npm test`, `npx tsc --noEmit`, `npm run build`** — all green.

- [ ] **Step 6: Commit** — `references #468 WIP SET 10 FAST restarts the search from the truth; test fallout`.

### Task 3: Docs and the one commit

**Files:**
- Modify: `docs/architecture.md` (lines ~24, ~315–317, ~325, ~343), `docs/failures.md` (the `*xx-` paragraph from
  #467), `test/README.md` (lines ~82, ~454–456, ~883–887), `test/harness/boot.ts` (the `coldGps` doc comment: with
  FAST it is no longer fast — `coldGps` resets without a power-on, so no truth is written)

- [ ] **Step 1: Update the docs** to say: FAST writes the true state at every power-on and on a SET 10 switch without a
  fix, then the REAL start model gives a hot start; FAST and REAL share all timings; in FAST neither `POSITION DIFFERS`
  nor `SYSTEM TIME UPDATED` appears; an engine-running harness boot with FAST posts no `POSITION DIFFERS` any more, so
  the live-list guard needs `fastGpsAcquisition: false` with empty storage.
- [ ] **Step 2: Squash** every commit after the plan commit into one:
  `fixes #468 FAST GPS acquisition is a hot start from the true state at power-on, otherwise the same receiver as REAL`
  with the Co-Authored-By trailer. `npm test`, `npx tsc --noEmit`, `npm run build` green on the committed tree.
