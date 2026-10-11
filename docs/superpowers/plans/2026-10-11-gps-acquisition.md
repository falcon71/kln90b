# GPS Acquisition, Receiver States and RAIM Prediction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the GPS issues #328, #211, #62, #213, #215 and #214. The unit's GPS clock, its time to first fix, the STA 1
page and the STA 5 RAIM prediction then behave like the real KLN 90B.

**Architecture:**
- `kln90b/Gps.ts` stays the façade around the SDK `GPSSatComputer` (subclassed as `KLNGPSSatComputer`).
- A new `kln90b/GpsSearch.ts` holds the start model of #62. At each power-on it decides how the receiver searches, using
  public SDK API where there is some: prediction contexts, satellite inhibits, the last known position.
- STA 1 and STA 5 read from `GPS` and the model.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework `@microsoft/msfs-sdk` 2.3.3, FSComponent JSX,
Vitest (unit / render / flight stages).

**Spec:** `docs/superpowers/specs/2026-10-11-gps-acquisition-design.md`. Read it first; it holds the evidence and the
reasoning. The readable SDK source is at `E:\msfs\msfs-avionics-mirror\src\sdk\instruments\GPSSat.ts`.

## Global Constraints

- **One commit per issue** (CLAUDE.md): each task below is exactly one commit, `fixes #NN <description>`. It carries
  its own tests and doc changes. Never bundle two issues, and never spread one fix over several commits.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git push`.
- **Manual references are the spec.** Cite page numbers (`3-17`, `5-30`, install manual `2-66`, ORS 01 `6-30`) in
  comments. **Never copy manual text, the owner's notes or video content** into the repo; paraphrase.
- American English. No counts in prose for things that grow.
- `target: es2017`: no newer runtime features.
- Display text is uppercase; STA 1 rows are 11 characters wide. A row wider than the half page makes `Screen.read()` throw.
- **Persisted user data:** add keys with defaults; never change an existing key's meaning.
- **Each task ends with the whole suite green:** `npx tsc --noEmit` clean and `npm test` all passing. Each removes the
  `.fails` of its own issue's pins, and only those.
- A test that advances simulated minutes carries its own timeout (`SLOW = 60_000`, `VERY_SLOW = 240_000`).
- Vitest: one live unit per test (`bootUnit` refuses a second boot).
- Timing values in this plan are starting values. Where a test needs tuning, change only the constants named in the
  task, stay inside the bounds the tests state, and record the final values in `docs/architecture.md` Core 3.

**User decisions (already made):**
- "The timings from #62 were taken in a real KLN 90B, so the observed values beat the values from the manual."
- Slow starts split by cause. A wrong clock or a far position (almanac current) means ACQ, give-up, then a sky search,
  within 12 minutes (3-17). An almanac 6 months or more old *by the unit's own clock* (which covers the wrong date)
  means an almanac search of about 20 minutes (ORS 01 6-30; observed 21:36).
- The ephemeris is persisted across sim sessions (a new setting key, default empty).
- STA 1 shows **INIT** during the almanac search and the sky search; no STS or SRCH (ORS 20 dropped SRCH).
- NAV A stays as today: shown whenever there is an altitude (real-unit video: NAV A with all eight satellites in use).
- One commit per issue, order #328 → #211 → #62 → #213 → #215 → #214.

---

## File map

| File | Change | Tasks |
|---|---|---|
| `kln90b/Gps.ts` | battery clock (1); almanac check fix and dead publishes removed (2); timing options, `GpsSearch` wiring, ephemeris persistence, private-SDK helpers on `KLNGPSSatComputer` (3); `simTimeUnix` (4); TRAN acceptance (5); RAIM prediction context (6) | 1-6 |
| `kln90b/GpsSearch.ts` | **new**: the start model | 3 |
| `kln90b/settings/KLN90BUserSettings.ts` | new key `lastEphemeris` | 3 |
| `kln90b/pages/left/Sta1Page.tsx` | debug TTF field (2); satellite rows and elevation (4); states (5) | 2, 4, 5 |
| `kln90b/pages/left/Sta5Page.tsx` | prediction through `gps.raimPrediction` | 6 |
| `test/harness/boot.ts` | `coldGps` also erases the cached ephemeris | 3 |
| `test/render/GpsAcquisition.test.ts` | pins and the new timing tests | 1, 2, 3, 5 |
| `test/render/pages/left/Sta1Page.test.ts` | fixture moves to the almanac search; #213 tests; #215 tests | 3, 4, 5 |
| `test/render/pages/left/Sta5Page.test.ts` | prediction tests | 6 |
| `test/unit/settings/KLN90BUserSettingsSaverManager.test.ts` | the new key in the exact pin | 3 |
| `docs/architecture.md`, `docs/testing.md`, `CLAUDE.md` | doc updates per task | 1-6 |
| `docs/superpowers/specs/2026-10-11-gps-acquisition-design.md` | `T_GIVE_UP` value, if tuned | 3 |

---

### Task 1: Fix #328, the GPS battery clock

**Goal:** The GPS clock starts at the sim time and advances by the real time the unit was off, measured by `GPS` itself,
so that an engine-running start no longer begins an hour behind.

**Files:**
- Modify: `kln90b/Gps.ts` (constructor around lines 140-145, `powerChanged` around lines 269-275, imports)
- Test: `test/render/GpsAcquisition.test.ts` (describe `messages at power-on (B-3, B-4)` and `the system clock without a fix (3-53)`)
- Docs: `docs/architecture.md` (Core 1 power-event subscribers, Core 3 "Internal clock"), `docs/testing.md` section 6 (the #328 note on engine-running boots)

**Acceptance Criteria:**
- [ ] `posts no message on an engine-running start at the stored position (B-3, B-4, #328)` passes without `.fails`.
- [ ] A new test: a cold-and-dark unit left unpowered for 30 minutes and then switched on has `timeZulu` within 3.5 s of `Date.now()`.
- [ ] `Gps.ts` no longer reads `timeSincePowerChange` and no longer subtracts an hour; `PowerButton.ts` is unchanged.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/GpsAcquisition.test.ts` → all pass; then `npm test` → all pass.

**Steps:**

- [ ] **Step 1: Write the failing tests.** In `test/render/GpsAcquisition.test.ts`, change the pin in describe
  `messages at power-on (B-3, B-4)` from `it.fails(` to `it(`. Update its comment to say that the GPS clock no longer
  depends on PowerButton's assumed hour. Then add to describe `the system clock without a fix (3-53)`:

```ts
    // 3-53: the internal battery clock runs while the unit is off. A cold-and-dark unit that stays unpowered for half an
    // hour is right when it is switched on (#328: the GPS measures the off time itself, PowerButton's assumed hour is
    // for the CRT warm-up)
    it('keeps the time over 30 minutes unpowered before the first power-on (3-53, #328)', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {lastLatitude: 47, lastLongitude: 8}});
        await vi.advanceTimersByTimeAsync(30 * MINUTE);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(2000);

        // The tolerance: the unit's clock starts up to 2.5 s off (Gps.ts constructor) and lags by up to one 1 s tick
        expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(3500);
    }, SLOW);
```

- [ ] **Step 2: Run, confirm the pin fails.** Run `npx vitest run test/render/GpsAcquisition.test.ts -t "engine-running start"`.
  Expected: FAIL, the message list holds `SYSTEM TIME UPDATED TO GPS TIME`. The new 30-minute test passes today:
  PowerButton's 1 h plus the 30 min cancel the constructor's hour. It is the guard for Step 3.

- [ ] **Step 3: Implement.** In `kln90b/Gps.ts`:
  - Add a field next to `gpsStartTime`:
    ```ts
    private lastPowerOffTime: number = Date.now(); //Real time of the last power-off. The battery clock runs on while the unit is off (3-53)
    ```
  - In the constructor, replace the comment and the `- HOURS_TO_SECONDS` line with:
    ```ts
        //We assume that the internal clock kept the time fairly accurate since it has last been running
        const timeRandom = Math.random() * 5 - 2.5;
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) + timeRandom);
    ```
  - Replace `powerChanged` with:
    ```ts
    private powerChanged(evt: PowerEventData) {
        if (evt.isPowered) {
            //Ticks are not running, when we are powered off. The battery clock counts the off time itself:
            //PowerButton's timeSincePowerChange is shaped for the CRT warm-up and is about 0 on a forced start (#328)
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + Date.now() - this.lastPowerOffTime);
            this.gpsStartTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        } else {
            this.lastPowerOffTime = Date.now();
        }
    }
    ```
  - Remove the now unused `HOURS_TO_SECONDS` import.

- [ ] **Step 4: Run the tests.** `npx vitest run test/render/GpsAcquisition.test.ts` → all pass. Then do a mutation
  check by hand: put back `+ evt.timeSincePowerChange` in place of the own off time. The 30-minute test must fail,
  because the clock is an hour ahead. Restore, and confirm with `git diff` that only the intended changes remain.

- [ ] **Step 5: Docs.**
  - `docs/architecture.md` Core 1: the `GPS.powerChanged` subscriber bullet says that it advances the clock by the
    real off time it measures itself (`lastPowerOffTime`), not by `timeSincePowerChange`.
  - Core 3, "Internal clock": at construction the clock is set from `E:ABSOLUTE TIME` plus a random ±2.5 s. There is
    no hour subtracted any more, and PowerButton's assumed hour is not used.
  - `docs/testing.md` section 6, the bullet "A booted engine-running unit starts with the MSG annunciator lit": remove
    the sentences on #328 and SYSTEM TIME UPDATED. Keep the POSITION DIFFERS fact and the advice on which message
    tests use as a guard.

- [ ] **Step 6: Full check and commit.**
  - Run `npx tsc --noEmit` and `npm test`; both must be clean.
  - Search the tests for anything that relied on SYSTEM TIME UPDATED after an engine-running boot:
    `grep -rn "SYSTEM TIME UPDATED" test`. Fix any test that relied on it per the testing.md advice.

```bash
git add kln90b/Gps.ts test/render/GpsAcquisition.test.ts docs/architecture.md docs/testing.md
git commit -m "fixes #328 let the GPS battery clock measure its own off time instead of PowerButton's assumed hour

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Fix #211, the almanac check reads the moved SDK fields

**Goal:** `KLNGPSSatComputer.isAlmanacValid` works again on SDK 2.3.3, and the receiver's clock (`internalTime`) is
right on the first update after power-on. A warm start is then ACQ, not a 6-minute sky search.

**Files:**
- Modify: `kln90b/Gps.ts` (`KLNGPSSatComputer.isAlmanacValid`, `powerChanged`, `tick`, constructor publishers, imports)
- Modify: `kln90b/pages/left/Sta1Page.tsx:109` (debug TTF line)
- Test: `test/render/GpsAcquisition.test.ts`
- Docs: `docs/architecture.md` Core 3, `docs/testing.md` section 6 (the SDK-internals bullet)

**Acceptance Criteria:**
- [ ] These four pins pass without `.fails`: `a warm start is NAV ready within 5 minutes of power-on (#211)`; `a warm start shows ACQ on STA 1 right after the self-test (#211)`; `a warm start considers its almanac valid (#211)`; `a start with an almanac 120 days old is a warm start (3-17: six months) (#211)`.
- [ ] A new test: a unit switched off for 3 hours (ephemeris expired) and on again at the same place is NAV ready within 5 minutes.
- [ ] `Gps.ts` no longer reads `this.simTime` or `this.distanceFromLastKnownPos`, and no longer publishes `simTime` or `gps-position`.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/GpsAcquisition.test.ts` → all pass; `npm test` → all pass.

**Steps:**

- [ ] **Step 1: Tests.** In `test/render/GpsAcquisition.test.ts`:
  - Change the four `#211` pins from `it.fails(` to `it(`.
  - Update the file header comment: the check reads `activeSimulationContext`, and `powerChanged` sets `internalTime`.
  - Add to describe `GPS time to first fix, slow acquisition`:

```ts
    // 3-17: after a power cycle at the same place with the clock right the almanac makes it a warm start. Three hours off
    // expire the ephemeris (SDK: 2 hours), so the cached ephemeris does not mask the almanac check. The receiver's own
    // clock (internalTime) must be right on the first update after power-on, or the check fails exactly when the
    // channels are assigned (#211)
    it('a power cycle of 3 hours at the same place is NAV ready within 5 minutes (3-17, #211)', async () => {
        const unit = await powerOnCold(WARM);
        expect(await secondsToFix(unit, 720)).toBeLessThan(720);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(3 * 60 * MINUTE);
        await unit.panel.powerOn();

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);
```

- [ ] **Step 2: Run, confirm the failures.** Run `npx vitest run test/render/GpsAcquisition.test.ts -t "warm start|120 days|3 hours"`.
  Expected: the four pins FAIL (`isAlmanacValid` is NaN-false). The 3-hour test FAILS too: the sky search takes
  about 6 minutes.

- [ ] **Step 3: Implement.** In `kln90b/Gps.ts`, replace `KLNGPSSatComputer.isAlmanacValid` with:

```ts
    public isAlmanacValid(simTime?: number): boolean {
        //Yeah, we're cheating: since SDK 2.3.3 the receiver's time and position live in its simulation context (#211)
        const context = (this as any).activeSimulationContext;

        if (simTime === undefined) {
            simTime = context.time as number;
        }

        //The context computes its own distanceFromLastKnownPos only after this check has been read, so we compute it here
        const lastKnownPosition = context.lastKnownPosition as GeoPoint;
        const distanceFromLastKnownPos = lastKnownPosition.isValid() ? (context.position as GeoPoint).distance(lastKnownPosition) : Infinity;

        return Math.abs(this.internalTime - simTime) < 10 * 60 * 1000 //The KLN cannot find the satellites from the almanac, if the internal clock is off by more than 10 minutes (10 Minutes are mentioned in the install manual)
            && distanceFromLastKnownPos < 0.0174221163 // 60 nautical miles, mentioned in the Install manual
            && super.isAlmanacValid(simTime);  //Actual validity
    }
```

  - In `powerChanged`, inside `if (evt.isPowered)`, after the `timeZulu` update, add:
    `this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp(); //The receiver reads it on the first update, before tick refreshes it (#211)`
  - In `tick()`, remove the lines `this.clockPublisher.pub('simTime', actualUnixTime);` and
    `this.gnssPublisher.pub('gps-position', new LatLongAlt(lat, lon, alt));`. Since SDK 2.3.3 the computer reads the
    SimVars itself. Remove `const alt = ...` if it is now unused.
  - Remove the fields `clockPublisher` and `gnssPublisher`, their constructor assignments, and the imports
    `ClockEvents`, `GNSSEvents` and `Publisher` if they are unused.
  - In `kln90b/pages/left/Sta1Page.tsx` (debug branch), read `(sat as any).data.timeToAcquire` instead of
    `(sat as any).timeToAcquire`. The field moved into the satellite's private data in 2.3.3.

- [ ] **Step 4: Run.** `npx vitest run test/render/GpsAcquisition.test.ts` → all pass. The 80 NM sky-search test keeps
  passing; it now holds the 60 NM clause, as its comment predicted. Update that comment: "Today the whole almanac
  check is dead (#211)…" becomes a plain statement that it holds the KLN's own 60 NM clause.

- [ ] **Step 5: Mutation check.** Replace `context.time` by `(this as any).simTime` (the old field). The four pins and
  the 3-hour test must go red. Then remove the `internalTime` line in `powerChanged`; the 3-hour test must go red.
  Restore both and confirm with `git diff`.

- [ ] **Step 6: Docs.**
  - `docs/architecture.md` Core 3: in the list of private SDK internals, replace `simTime` and
    `distanceFromLastKnownPos` with `activeSimulationContext.time`, `.position` and `.lastKnownPosition`.
  - In the same section, "It is driven manually: `GPS.tick` publishes `simTime` and `gps-position`…" becomes: the
    computer reads the sim time and position SimVars itself; `GPS.tick` calls `onUpdate()`.
  - `docs/testing.md` section 6, the "SDK upgrades may require updating the fakes" bullet: the same field list. Remove
    "which no type error reports (#211; three pins hold it)" and say instead that `GpsAcquisition.test.ts` holds the
    fields.

- [ ] **Step 7: Full check and commit.** Run `npx tsc --noEmit` and `npm test`; fix any test that depended on the dead
  check (for example a test that assumed every slow start is a sky search) by re-reading its comment and citing 3-17.

```bash
git add kln90b/Gps.ts kln90b/pages/left/Sta1Page.tsx test/render/GpsAcquisition.test.ts docs/architecture.md docs/testing.md
git commit -m "fixes #211 read the receiver's time and position from the SDK 2.3.3 simulation context and set its clock at power-on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Fix #62, the start model

**Goal:** Real acquisition (SET 10 REAL) follows the spec's start model. The time to first fix (TTFF) then matches the
real unit.

| Start | Time to first fix |
|---|---|
| Hot | before the 17 s self-test ends |
| Warm | 30 s to 2 min, spread per power-on |
| 829 NM off | ACQ, within 5 min |
| Wrong clock or far position | ACQ gives up, then a sky search: 5 to 12 min |
| Almanac 6 months or more old by the unit's clock | almanac search, 14 to 25 min |

The ephemeris also persists across sim sessions.

**Files:**
- Create: `kln90b/GpsSearch.ts`
- Modify: `kln90b/Gps.ts`
- Modify: `kln90b/settings/KLN90BUserSettings.ts` (type block near line 63, definitions near line 159)
- Modify: `test/harness/boot.ts:305` (`coldGps`) and its option doc comment (lines 57-61)
- Test: `test/render/GpsAcquisition.test.ts`, `test/render/pages/left/Sta1Page.test.ts`, `test/unit/settings/KLN90BUserSettingsSaverManager.test.ts`
- Docs: `docs/architecture.md` Core 3, `docs/testing.md` section 4 ("Time to first fix" bullet) and section 6, the GPS bullet of `CLAUDE.md`, the spec (only if `GIVE_UP_TIME` changes)

**Acceptance Criteria:**
- [ ] Hot: for seeds 1-5, a power cycle of 10 minutes at the same place has its fix in under 17 s.
- [ ] Persisted ephemeris: a cold-and-dark boot with `lastEphemeris` 30 minutes old has its fix in under 17 s; with 3 hours old, in 30 s or more.
- [ ] Warm: for seeds 1-8, the fix comes 30 to 120 s after power-on. One named seed is under 45 s and one named seed over 90 s.
- [ ] 829 NM north of the stored position: fix within 5 minutes.
- [ ] 80 NM: fix within 5 minutes (the old 80 NM sky-search test is replaced).
- [ ] Clock 15 minutes behind, and stored position at the antipode (−47, −172): no fix within 5 minutes, fix within 12.
- [ ] Almanac 200 days old, and clock 39 years behind: no fix within 14 minutes, fix within 25.
- [ ] Almanac search: 6 minutes after power-on exactly one channel holds a satellite, and there is no fix.
- [ ] `lastEphemeris` is saved at power-off as `prn:time` pairs and restored into the SDK satellites at boot (tripwire test).
- [ ] FAST acquisition and the engine-running start behave as before (the existing characterizations pass).
- [ ] `KLN90BUserSettingsSaverManager.test.ts` lists `lastEphemeris: ''`.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/GpsAcquisition.test.ts test/render/pages/left/Sta1Page.test.ts` → all pass; `npm test` → all pass.

**Steps:**

- [ ] **Step 1: The setting key.** In `kln90b/settings/KLN90BUserSettings.ts`:
  - Add `lastEphemeris: string;` after `lastAlmanacDownload: number;` in `KLN90BUserSettingsTypes`.
  - Add the definition after the `lastAlmanacDownload` definition:
    ```ts
                {
                    name: "lastEphemeris", //"prn:time,prn:time": the ephemeris in the receiver's memory, by satellite (#62)
                    defaultValue: "",
                },
    ```
  - In `test/unit/settings/KLN90BUserSettingsSaverManager.test.ts`, add `lastEphemeris: '',` after `lastAlmanacDownload: 0,`.

- [ ] **Step 2: Write the failing tests.** In `test/render/GpsAcquisition.test.ts`:
  - Extend `powerOnCold` with a seed:
    ```ts
    async function powerOnCold(storage: Record<string, unknown>, clockOffsetMs = 0, seed = 1): Promise<HeadlessUnit> {
        const unit = await bootUnit({engineRunning: false, storage, seed});
    ```
  - Add `const VERY_SLOW = 240_000;` next to `SLOW`.
  - Add the antipode and the PRNs in view at the boot position and time (from the STA 1 snapshot in this file):
    ```ts
    /** The antipode of the boot position 47/8: no satellite is in view from both */
    const ANTIPODE = {lastLatitude: -47, lastLongitude: -172};
    /** The satellites in view at 47/8 at the fake clock's start (the STA 1 snapshot below) */
    const IN_VIEW = [1, 8, 10, 14, 16, 21, 23, 27];
    const ephemeris = (time: number) => IN_VIEW.map(prn => `${prn}:${time}`).join(',');
    ```
  - Replace these tests:
    - `characterization: a start 3000 NM from the stored position shows INIT on STA 1 right after the self-test`;
    - `a start 3000 NM from the stored position is not NAV ready within 3 minutes, and is within 12 (3-5, 3-17)`;
    - `a start 80 NM from the stored position is not NAV ready within 3 minutes, and is within 12 (…)`;
    - `a start with an almanac 200 days old is not NAV ready within 3 minutes, and is within 12 (3-17)`;
    - `a start with the clock 15 minutes behind is not NAV ready within 3 minutes, and is within 12 (…)`.

    The replacements go inside describe `GPS time to first fix, slow acquisition`:

```ts
    // #62, a real unit: a power cycle with a current ephemeris has its fix in 0:17, power-on self-test included. The
    // self-test page lasts 17 s (WelcomePage TEST_TIME). The SDK keeps the ephemeris over a power cycle in one session
    it.each([1, 2, 3, 4, 5])('seed %d: a power cycle with a current ephemeris has its fix before the self-test ends (#62)', async seed => {
        const unit = await powerOnCold(WARM, 0, seed);
        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(10 * MINUTE);
        await unit.panel.powerOn();

        expect(await secondsToFix(unit, 30)).toBeLessThan(17);
    }, SLOW);

    // #62: the receiver keeps its ephemeris in battery memory, so a new session within the ephemeris' life is hot too
    it('a boot with an ephemeris 30 minutes old in memory has its fix before the self-test ends (#62)', async () => {
        const unit = await powerOnCold({...WARM, lastEphemeris: ephemeris(START - 30 * MINUTE)});

        expect(await secondsToFix(unit, 30)).toBeLessThan(17);
    }, SLOW);

    // The sibling: an ephemeris 3 hours old has expired (SDK: 2 hours), so the start is warm
    it('a boot with an ephemeris 3 hours old in memory is a warm start (#62)', async () => {
        const unit = await powerOnCold({...WARM, lastEphemeris: ephemeris(START - 180 * MINUTE)});

        expect(await secondsToFix(unit, 300)).toBeGreaterThanOrEqual(30);
    }, SLOW);

    // #62, a real unit with a current almanac, the time right and the aircraft not moved: 1:25, 0:32, 1:47. The
    // ephemeris must be collected (at least about 18 s of a 30 s frame), so nothing is faster than about 30 s
    it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %d: a warm start has its fix 30 s to 2 minutes after power-on (#62)', async seed => {
        const unit = await powerOnCold(WARM, 0, seed);
        const seconds = await secondsToFix(unit, 300);

        expect(seconds).toBeGreaterThanOrEqual(30);
        expect(seconds).toBeLessThanOrEqual(120);
    }, SLOW);

    // #62: the observed warm starts spread from 0:32 to 1:47 under the same conditions; the spread is real
    it(`seed ${FAST_WARM_SEED}: a warm start can be as fast as 45 s (#62: 0:32)`, async () => {
        const unit = await powerOnCold(WARM, 0, FAST_WARM_SEED);

        expect(await secondsToFix(unit, 300)).toBeLessThan(45);
    }, SLOW);

    it(`seed ${SLOW_WARM_SEED}: a warm start can take over 90 s (#62: 1:47)`, async () => {
        const unit = await powerOnCold(WARM, 0, SLOW_WARM_SEED);

        expect(await secondsToFix(unit, 300)).toBeGreaterThan(90);
    }, SLOW);

    // A real-unit video: started 829 NM from its stored position, the unit searched the satellites predicted for the
    // stored position (ACQ), most of which were in view, and had its fix in 2:22 (install manual 2-66: ACQ within 5
    // minutes). The 60 NM of 2-66 is checkout advice, not a rule of the unit
    it('a start 829 NM from the stored position is NAV ready within 5 minutes (install manual 2-66, #62)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 47 + 829 / 60});

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    it('a start 80 NM from the stored position is NAV ready within 5 minutes (install manual 2-66, #62)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 47 + 80 / 60});

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // 3-17: with a wrong time or position the unit looks for any satellite, up to 12 minutes. It first searches the
    // satellites it predicts, gives up when they are not there, then searches the sky
    it('a start with the clock 15 minutes behind is not NAV ready within 5 minutes, and is within 12 (install manual 2-66, 3-17)', async () => {
        const unit = await powerOnCold(WARM, -15 * MINUTE);

        expect(await secondsToFix(unit, 300)).toBe(300);
        expect(await secondsToFix(unit, 420)).toBeLessThan(420);
    }, SLOW);

    it('a start at the antipode of the stored position is not NAV ready within 5 minutes, and is within 12 (3-17)', async () => {
        const unit = await powerOnCold({...WARM, ...ANTIPODE});

        expect(await secondsToFix(unit, 300)).toBe(300);
        expect(await secondsToFix(unit, 420)).toBeLessThan(420);
    }, SLOW);

    // ORS 01 6-30: an almanac six months old or more makes the receiver search the sky and collect a new almanac from
    // one satellite, 20 minutes; a real unit with a wrong date took 21:36 (#62). The age counts by the unit's own clock
    it('a start with an almanac 200 days old is not NAV ready within 14 minutes, and is within 25 (ORS 01 6-30, #62)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});

        expect(await secondsToFix(unit, 840)).toBe(840);
        expect(await secondsToFix(unit, 660)).toBeLessThan(660);
    }, VERY_SLOW);

    it('a start with the clock 39 years behind is not NAV ready within 14 minutes, and is within 25 (ORS 01 6-30, #62)', async () => {
        const unit = await powerOnCold(WARM, -39 * 365.25 * DAY);

        expect(await secondsToFix(unit, 840)).toBe(840);
        expect(await secondsToFix(unit, 660)).toBeLessThan(660);
    }, VERY_SLOW);

    // ORS 01 6-30: one satellite is enough to collect the almanac; the unit does not navigate while it collects
    it('collects the almanac from one satellite during an almanac search (ORS 01 6-30)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});
        await vi.advanceTimersByTimeAsync(6 * MINUTE);
        const gps = unit.props.sensors.in.gps;

        expect(gps.gpsSatComputer.getChannels().filter(c => c !== null)).toHaveLength(1);
        expect(gps.isValid()).toBe(false);
    }, SLOW);

    // INIT covers the almanac search: ORS 20 (5-29) has no state of its own for it (ORS 01 had SRCH)
    it('shows INIT on STA 1 right after the self-test during an almanac search (5-29)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(Screen.read().rows('L')[0]).toBe('STATE  INIT');
    }, SLOW);
```

  - Add near `WARM` the two constants, set after Step 6:
    ```ts
    /** Seeds whose warm start lands at the ends of the observed spread (found by the probe of the plan, Task 3 Step 6) */
    const FAST_WARM_SEED = 0;
    const SLOW_WARM_SEED = 0;
    ```
  - In describe `GPS data kept over a power-off`, add:

```ts
    // #62: the receiver keeps the ephemeris in battery memory; the forced acquisition of an engine-running boot collects
    // it for the satellites in view
    it('saves the ephemeris of the satellites in view at power-off (#62)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(1000);

        const saved = String(storedSetting(unit, 'lastEphemeris')).split(',').map(e => e.split(':').map(Number));
        expect(saved.map(([prn]) => prn)).toEqual(IN_VIEW);
        for (const [, time] of saved) {
            expect(time).toBeGreaterThanOrEqual(START);
            expect(time).toBeLessThan(START + 60_000);
        }
    });

    // The tripwire for the private SDK field the restore writes (satellite data.lastEphemerisTime, read back through the
    // public getter)
    it('restores the saved ephemeris into the receiver at boot (#62)', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...WARM, lastEphemeris: `8:${START - MINUTE}`}});
        await vi.advanceTimersByTimeAsync(1000);

        const sat = unit.props.sensors.in.gps.gpsSatComputer.getSatellites().find(s => s.prn === 8)!;
        expect(sat.lastEphemerisTime).toBe(START - MINUTE);
    });
```

  - Change the fixture of the test `runs on while the GPS searches (3-53)` (describe `the system clock without a fix`)
    from `{...WARM, lastLatitude: 0, lastLongitude: 0}` to `{...WARM, lastAlmanacDownload: START - 200 * DAY}`. An
    almanac search has no fix after 60 s.
  - Remove the comment line `// the receiver states are a question: #215` where it refers to the deleted 3000 NM test.

  In `test/render/pages/left/Sta1Page.test.ts`:
  - Rename `skySearch()` to `almanacSearch()` and its storage to
    `{fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 200 * 24 * 3600 * 1000}`.
  - Update its doc comment: an almanac search, a blind search in PRN order (ORS 01 6-30).
  - Rename the describe to `STA 1 page during an almanac search`, and replace "sky search" with "almanac search" in
    the test names and comments. Keep the `.fails` on the #213 pin; Task 4 removes it.

- [ ] **Step 3: Run, confirm the failures.** Run `npx vitest run test/render/GpsAcquisition.test.ts`.
  - Expected FAIL: the hot tests (60 s with ephemeris today), the persisted-ephemeris tests (no key yet), the
    warm-spread tests (seed constants 0), the almanac-search tests (no model), the antipode and 15-minute floors where
    they acquire early, and the save/restore tests.
  - `npx vitest run test/unit/settings` passes after Step 1.

- [ ] **Step 4: Create `kln90b/GpsSearch.ts`.**

```ts
import {GeoPoint, GPSPredictionContext, GPSPredictionSatellite, GPSSatelliteState, LatLonInterface, UnitType} from "@microsoft/msfs-sdk";
import type {KLNGPSSatComputer} from "./Gps";

export const enum SearchMode {
    /** No start in progress: the unit navigates, FAST acquisition is selected, or the start was forced. The SDK runs on its own */
    Idle,
    /** 3-17, 5-29: the receiver searches the satellites its almanac predicts for the stored position and its own clock */
    Acquisition,
    /** ORS 01 6-30: the almanac is too old. Blind search for one satellite, then collect a new almanac from it */
    AlmanacSearch,
    /** The predicted satellites were not there: blind search with the current almanac (3-17: at most 12 minutes) */
    SkySearch,
}

const SIX_MONTHS = 182 * 24 * 60 * 60 * 1000; //3-17, the same as the SDK almanacExpireTime in Gps.ts
const CLOCK_TOLERANCE = 10 * 60 * 1000; //Install manual 2-66: the time must be right within 10 minutes for ACQ
const SDK_LAST_KNOWN_POSITION_LIMIT = UnitType.NMILE.convertTo(100, UnitType.GA_RADIAN); //The SDK's own rule in its channel assignment
const ELEVATION_MASK_DEG = 5; //5-30: the elevation ranges from 5 to 90 degrees
/** Install manual 2-66: ACQ has its fix within 5 minutes; without one the predicted satellites are not there */
export const GIVE_UP_TIME = 5 * 60 * 1000;

/** The warm-start acquisition time is drawn once per power-on: oscillator warm-up and the phase of the 30 s data frame are common to all channels (#62) */
export const WARM_ACQUISITION_MIN = 2 * 1000;
export const WARM_ACQUISITION_MAX = 75 * 1000;
export const WARM_ACQUISITION_RANGE = 6 * 1000;
/** No start in progress: a satellite reacquired in flight, or the harness's coldGps (a reset without a power-on) */
export const IDLE_ACQUISITION = 40 * 1000;
/** A blind search knows neither Doppler nor which satellites are up */
export const BLIND_ACQUISITION = 90 * 1000;
export const BLIND_ACQUISITION_RANGE = 60 * 1000;

const ACQUIRED_STATES = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);

const elevationDeg = (sat: GPSPredictionSatellite): number => 90 - UnitType.RADIAN.convertTo(sat.position.get()[0], UnitType.DEGREE);

/**
 * #62: what the unit believes decides how it searches. At every power-on it picks a start mode from its stored position,
 * its almanac and its own clock. See docs/superpowers/specs/2026-10-11-gps-acquisition-design.md
 */
export class GpsSearch {
    public mode: SearchMode = SearchMode.Idle;

    private readonly prediction: GPSPredictionContext;
    private predictionReady = false;
    private pendingStart: GeoPoint | null = null;
    private storedPosition = new GeoPoint(0, 0);
    private predicted: GPSPredictionSatellite[] = [];
    private modeStartTime = 0;
    private almanacTimeAtStart: number | undefined = undefined;
    private keptPrn: number | null = null;

    constructor(private readonly computer: KLNGPSSatComputer, private readonly isFast: () => boolean) {
        this.prediction = computer.createPredictionContext();
        this.prediction.awaitInit().then(() => this.predictionReady = true);
    }

    /** Power-on: the receiver starts from the position it had at power-off. The mode is decided on the next tick */
    public start(storedPosition: LatLonInterface): void {
        this.end();
        if (this.isFast()) {
            return; //FAST is a simulator convenience (#46): the SDK runs on its own with short timings
        }
        this.pendingStart = new GeoPoint(storedPosition.lat, storedPosition.lon);
    }

    /** First fix, forced acquisition or power-off: the SDK runs on its own until the next power-on */
    public end(): void {
        this.pendingStart = null;
        this.predicted = [];
        this.keptPrn = null;
        if (this.mode !== SearchMode.Idle) {
            this.inhibitAllExcept(null);
            this.computer.setAcquisitionTime(IDLE_ACQUISITION, WARM_ACQUISITION_RANGE);
        }
        this.mode = SearchMode.Idle;
    }

    /** The satellites the unit predicts during ACQ, for STA 1 (#213) */
    public predictedSatellites(): readonly GPSPredictionSatellite[] {
        return this.predicted;
    }

    /**
     * Called by GPS.tick before the computer's onUpdate, so that inhibits and timings apply to the channel assignment.
     * @param simTime The sim time, UNIX ms
     * @param present The aircraft position
     * @param unitTime The unit's own clock, UNIX ms
     */
    public tick(simTime: number, present: LatLonInterface, unitTime: number): void {
        if (this.pendingStart !== null) {
            if (!this.predictionReady) {
                return;
            }
            this.storedPosition = this.pendingStart;
            this.pendingStart = null;
            this.begin(simTime, present, unitTime);
            return;
        }

        switch (this.mode) {
            case SearchMode.Acquisition:
                if (simTime - this.modeStartTime >= GIVE_UP_TIME) {
                    this.startBlindSearch(SearchMode.SkySearch, simTime);
                }
                break;
            case SearchMode.AlmanacSearch:
                this.tickAlmanacSearch(simTime, present);
                break;
        }
    }

    private begin(simTime: number, present: LatLonInterface, unitTime: number): void {
        const almanacTime = this.computer.getLastAlmanacTime();
        //ORS 01 6-30: an almanac six months old or more must be collected again. The unit judges the age by its own clock,
        //so a clock that is years off makes a current almanac look expired (the wrong date of #62)
        if (almanacTime === undefined || Math.abs(unitTime - almanacTime) >= SIX_MONTHS) {
            this.startBlindSearch(SearchMode.AlmanacSearch, simTime);
        } else {
            this.startAcquisition(simTime, present, unitTime, Math.abs(unitTime - simTime) <= CLOCK_TOLERANCE);
        }
    }

    /**
     * @param believedTime The time the unit believes it is
     * @param canAcquire false when the clock is off by more than the tolerance: the Doppler predictions are wrong and
     * no predicted satellite can be acquired
     */
    private startAcquisition(simTime: number, present: LatLonInterface, believedTime: number, canAcquire: boolean): void {
        this.prediction.setPosition(this.storedPosition.lat, this.storedPosition.lon, 0, believedTime).predict();
        this.predicted = this.prediction.getSatellites().filter(s => s.sbasGroup === undefined
            && ACQUIRED_STATES.has(s.state.get())
            && elevationDeg(s) >= ELEVATION_MASK_DEG);

        this.inhibitAllExcept(canAcquire ? new Set(this.predicted.map(s => s.prn)) : new Set());

        //The SDK ignores almanac and position beyond 100 NM from its last known position; the KLN decision above replaces
        //that rule. Within it, the stored position keeps the SDK's 2 NM rule for a hot start working
        const presentPoint = new GeoPoint(present.lat, present.lon);
        const storedNearby = this.storedPosition.distance(presentPoint) < SDK_LAST_KNOWN_POSITION_LIMIT;
        this.computer.syncLastKnownPosition(storedNearby ? this.storedPosition : presentPoint);

        const warm = WARM_ACQUISITION_MIN + Math.random() * (WARM_ACQUISITION_MAX - WARM_ACQUISITION_MIN);
        this.computer.setAcquisitionTime(warm, WARM_ACQUISITION_RANGE);

        this.mode = SearchMode.Acquisition;
        this.modeStartTime = simTime;
    }

    private startBlindSearch(mode: SearchMode.AlmanacSearch | SearchMode.SkySearch, simTime: number): void {
        this.predicted = [];
        this.keptPrn = null;
        this.inhibitAllExcept(null);
        this.computer.eraseLastKnownPosition();
        this.computer.setAcquisitionTime(BLIND_ACQUISITION, BLIND_ACQUISITION_RANGE);
        this.almanacTimeAtStart = this.computer.getLastAlmanacTime();
        this.mode = mode;
        this.modeStartTime = simTime;
    }

    private tickAlmanacSearch(simTime: number, present: LatLonInterface): void {
        if (this.keptPrn === null) {
            const acquired = this.computer.getChannels()
                .filter(s => s !== null && ACQUIRED_STATES.has(s.state.get()))
                .map(s => s!.prn)
                .sort((a, b) => a - b);
            if (acquired.length > 0) {
                //ORS 01 6-30: one satellite is enough to collect the almanac
                this.keptPrn = acquired[0];
                this.inhibitAllExcept(new Set([this.keptPrn]));
            }
        } else if (this.computer.getLastAlmanacTime() !== this.almanacTimeAtStart) {
            //The almanac is complete, and the satellite has given the time: predict with the right time from here on
            this.startAcquisition(simTime, present, simTime, true);
        }
    }

    /** @param allowed The PRNs the receiver may track, or null to lift every inhibit */
    private inhibitAllExcept(allowed: Set<number> | null): void {
        for (const sat of this.computer.getSatellites()) {
            this.computer.setSatelliteInhibit(sat.prn, allowed !== null && !allowed.has(sat.prn));
        }
    }
}
```

  `GpsSearch` imports the class only as a type: `import type` avoids a runtime import cycle.

- [ ] **Step 5: Wire it into `kln90b/Gps.ts`.**
  - `KLNGPSSatComputer` gets these members. They keep every private SDK reach in this one class:

```ts
    public search: GpsSearch | undefined = undefined; //Set by GPS after construction

    public isAlmanacValid(simTime?: number): boolean {
        switch (this.search?.mode ?? SearchMode.Idle) {
            case SearchMode.Acquisition:
                return true; //The start model has decided (#62)
            case SearchMode.AlmanacSearch:
            case SearchMode.SkySearch:
                return false;
            default:
                return super.isAlmanacValid(simTime);
        }
    }

    /** The forced acquisition of an engine-running start or of SET 10 FAST ends the start model */
    public acquireAndUseSatellites(): void {
        this.search?.end();
        super.acquireAndUseSatellites();
    }

    /** The time the receiver last completed an almanac, sim time. Private in the SDK */
    public getLastAlmanacTime(): number | undefined {
        return (this as any).lastAlamanacTime;
    }

    /** Sets the SDK's acquisition time without ephemeris. Its timing options are private; the satellites share the object */
    public setAcquisitionTime(mean: number, range: number): void {
        const options = (this as any).satelliteTimingOptions;
        if (options === undefined) {
            throw new Error("GPSSatComputer.satelliteTimingOptions moved: recheck Gps.ts after the SDK upgrade");
        }
        options.acquisitionTime = mean;
        options.acquisitionTimeRange = range;
    }

    /** Puts a stored ephemeris back into the receiver (#62). The time is private satellite data in the SDK */
    public restoreEphemeris(entries: [number, number][]): void {
        for (const [prn, time] of entries) {
            const sat = this.getSatellites().find(s => s.prn === prn);
            if (sat !== undefined) {
                (sat as any).data.lastEphemerisTime = time;
            }
        }
    }
```

  - Remove the #211 body of `isAlmanacValid` (the 10-minute and 60 NM clauses now live in the model). Move the
    #211 comment about `activeSimulationContext` to the `docs/architecture.md` update.
  - Change `class KLNGPSSatComputer` to `export class KLNGPSSatComputer` (GpsSearch imports the type).
  - Timing options for REAL (keep the FAST values exactly as they are):

```ts
            timingOptions: { //3-17, #62
                almanacExpireTime: 182 * 24 * 60 * 60 * 1000, //Six months
                ephemerisExpireTime: 2 * 60 * 60 * 1000,
                acquisitionTime: fastGPS ? 10 * 1000 : IDLE_ACQUISITION, //GpsSearch sets it per power-on
                acquisitionTimeRange: fastGPS ? 1000 : WARM_ACQUISITION_RANGE,
                acquisitionTimeWithEphemeris: fastGPS ? 10 * 1000 : 9 * 1000, //#62: a power cycle with a current ephemeris has its fix in 0:17, self-test included
                acquisitionTimeRangeWithEphemeris: fastGPS ? 1000 : 6 * 1000,
                acquisitionTimeout: fastGPS ? 1000 : 4 * 60 * 1000,
                ephemerisDownloadTime: fastGPS ? 1000 : 30000, //30 Seconds, one data frame
                almanacDownloadTime: fastGPS ? 1000 : 750000, //12.5 minutes
            },
```

  - Fields and wiring in `GPS`:
    ```ts
    public readonly search: GpsSearch;
    ```
    In the constructor, **right after `this.gpsSatComputer = new KLNGPSSatComputer(...)` and before the bus
    subscriptions.** A subscription added after a topic was published is called at once with the cached value
    (testing.md section 6), so `powerChanged` may run during construction and must find `search` set:
    ```ts
        this.search = new GpsSearch(this.gpsSatComputer, () => this.userSettings.getSetting("fastGpsAcquisition").get());
        this.gpsSatComputer.search = this.search;
    ```
    And after `this.gpsSatComputer.init();`:
    ```ts
        const savedEphemeris = parseEphemeris(userSettings.getSetting("lastEphemeris").get());
        this.gpsSatComputer.awaitInit().then(() => this.gpsSatComputer.restoreEphemeris(savedEphemeris));
    ```
    `powerChanged` also uses `this.coords`, which the constructor sets later. If a cached power event can reach
    `powerChanged` before `coords` exists, guard the call with `if (this.coords !== undefined)`; check by booting the
    harness (`npx vitest run test/render/GpsAcquisition.test.ts`).
    With, at module level:
    ```ts
    /** "prn:time,prn:time" (setting lastEphemeris) */
    function parseEphemeris(saved: string): [number, number][] {
        return saved === "" ? [] : saved.split(",").map(e => e.split(":").map(Number) as [number, number]);
    }
    ```
  - In `tick()`, in the non-take-home branch, before `this.gpsSatComputer.onUpdate();`:
    `this.search.tick(actualUnixTime, {lat, lon}, this.gpsSatComputer.internalTime);`
  - In `gpsAcquired()`, at the start: `this.search.end(); //The first fix ends the start model (#62)`.
  - In `powerChanged`: in the powered branch, after `internalTime` is set, add `this.search.start(this.coords);`. In
    the unpowered branch, add `this.search.end();`.
  - In `savePosition()`, add:
    ```ts
        this.userSettings.getSetting("lastEphemeris").set(this.gpsSatComputer.getSatellites()
            .filter(s => s.lastEphemerisTime !== undefined)
            .map(s => `${s.prn}:${s.lastEphemerisTime}`)
            .join(","));
    ```
  - Imports: `import {GpsSearch, IDLE_ACQUISITION, SearchMode, WARM_ACQUISITION_RANGE} from "./GpsSearch";`.
  - If the build reports a new circular dependency, it comes from the two-way import. Check that `GpsSearch.ts` uses
    `import type` only; the type-only import is erased at compile time.

- [ ] **Step 6: The harness and the seed probe.**
  - In `test/harness/boot.ts`, change `if (opts.coldGps) props.sensors.in.gps.reset();` to:
    ```ts
        if (opts.coldGps) {
            props.sensors.in.gps.reset();
            props.sensors.in.gps.gpsSatComputer.eraseCachedEphemeris(); //Without it the ephemeris of the forced acquisition makes it a hot start of about 10 s
        }
    ```
  - Update the `coldGps` doc comment: it is a warm search with no ephemeris, about 70 s slow (`IDLE_ACQUISITION`
    plus 30 s of ephemeris). The `settle` cap of 120 s keeps a margin.
  - Then probe the warm-start spread. Write a throwaway test file in the scratchpad, not in the repo: run the warm
    start `powerOnCold(WARM, 0, seed)` for seeds 1-30 and print each `secondsToFix(unit, 300)`. Do this by temporarily
    adding an `it.each` to `GpsAcquisition.test.ts` with `console.log`, then removing it.
  - Pick the lowest seed under 45 s as `FAST_WARM_SEED` and the lowest seed over 90 s as `SLOW_WARM_SEED`.
  - If no seed in 1-30 is under 45 s, lower `WARM_ACQUISITION_MIN`. If none is over 90 s, raise
    `WARM_ACQUISITION_MAX`, but not above 85 s (warm must stay ≤ 120 s for seeds 1-8).

- [ ] **Step 7: Run and tune.** Run `npx vitest run test/render/GpsAcquisition.test.ts test/render/pages/left/Sta1Page.test.ts`.

  | Failing test | Change only |
  |---|---|
  | hot | `acquisitionTimeWithEphemeris` (9 s) and its range |
  | warm bounds | `WARM_ACQUISITION_MIN` / `WARM_ACQUISITION_MAX` (redo the probe of Step 6) |
  | 15-minute / antipode over 12 minutes | first `GIVE_UP_TIME` down to 4 minutes (the 4 min acquisition timeout); then `BLIND_ACQUISITION` |
  | almanac search under 14 or over 25 minutes | `BLIND_ACQUISITION` (the time to the first satellite) |
  | 829 NM fails | report it; do not tune. It means the predicted set overlaps the real sky too little: check the 5° mask and that `predicted` uses the stored position |

  If `GIVE_UP_TIME` changes, update spec section 2 step 3 to the new value with its reason, and commit the spec with
  this task.

- [ ] **Step 8: Mutation checks.** Restore each mutation afterwards and confirm with `git diff`.

  | Mutation | Must fail | Must stay green |
  |---|---|---|
  | (a) `begin` judges the almanac age by `simTime` instead of `unitTime` | the 39-years test | the 200-days test |
  | (b) `canAcquire` always `true` | the 15-minute test (fixes too early) | the antipode test |
  | (c) `inhibitAllExcept(null)` in `startAcquisition` instead of the allowed set | the antipode test (SDK finds the real satellites) | |
  | (d) the `setAcquisitionTime(warm, …)` line removed | the spread seeds | |
  | (e) the almanac search skips `keptPrn` (no inhibit after the first satellite) | the one-channel test and the 14-minute floor | |
  | (f) `restoreEphemeris` not called | the 30-minutes-old persisted test and the restore tripwire | |

  Report any mutation that leaves the suite green as a finding.

- [ ] **Step 9: Docs.**
  - `docs/architecture.md` Core 3: rewrite the GPS bullets for the start model.
    - `GpsSearch` and its modes; the timing values (final, after tuning); the persisted `lastEphemeris`.
    - The private SDK reaches: `lastAlamanacTime`, `satelliteTimingOptions`, the satellite `data.lastEphemerisTime`,
      `activeSimulationContext.channels`. `simTime` and `distanceFromLastKnownPos` are gone.
    - The public API it uses: `createPredictionContext`, `setSatelliteInhibit`, `syncLastKnownPosition`,
      `eraseLastKnownPosition`, `eraseCachedEphemeris`.
    - Add `lastEphemeris` to the persisted keys.
  - `docs/testing.md`:
    - Section 4, "Time to first fix": `coldGps` erases the cached ephemeris and acquires in about 70 s (slow). For hot,
      warm, ACQ-give-up and almanac-search starts, boot cold and dark with the storage, and use `seed` for the spread.
    - Section 6, the SDK-internals bullet: the same field list as architecture.md.
  - `CLAUDE.md`, the **GPS** bullet: it models hot, warm and almanac-search starts from the stored position, almanac,
    ephemeris and clock (`GpsSearch.ts`), and the GPS week rollover.

- [ ] **Step 10: Full check and commit.**
  - Run `npx tsc --noEmit`, `npm test` and `npm run build`. The build must print no new circular-dependency warning
    compared with master; compare the counts.
  - Fix any further test that broke because a slow start now behaves per the spec: update its expectation with the
    citation, or move it to `coldGps`/FAST if acquisition is not its subject.

```bash
git add kln90b/GpsSearch.ts kln90b/Gps.ts kln90b/settings/KLN90BUserSettings.ts test docs CLAUDE.md
git commit -m "fixes #62 model hot, warm and almanac-search starts from the stored position, almanac, ephemeris and clock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fix #213, the STA 1 elevation column

**Goal:** STA 1 shows predicted elevations during ACQ, the true elevation when the receiver knows the orbit, and `--°`
for a satellite it searches blindly. It never shows a satellite below the horizon as high in the sky.

**Files:**
- Modify: `kln90b/pages/left/Sta1Page.tsx`
- Modify: `kln90b/Gps.ts` (a public `simTimeUnix`)
- Test: `test/render/pages/left/Sta1Page.test.ts`

**Acceptance Criteria:**
- [ ] `shows no elevation of 5 degrees or more for a satellite below the horizon (5-30, #213)` passes without `.fails`.
- [ ] A new test: during an almanac search, every satellite without orbit data shows `--` in the ELE field.
- [ ] A new test: 829 NM from the stored position, during ACQ, STA 1 lists the predicted satellites with the elevation the prediction gives for the stored position, unchanged 30 s later, and at least one differs from the true elevation by 3° or more.
- [ ] The STA 1 snapshot after an engine-running boot (`GpsAcquisition.test.ts`) is unchanged.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/pages/left/Sta1Page.test.ts test/render/GpsAcquisition.test.ts` → all pass; `npm test` → all pass.

**Steps:**

- [ ] **Step 1: Tests.** In `test/render/pages/left/Sta1Page.test.ts`:
  - Change the #213 pin from `it.fails(` to `it(`, and update its comment: below-horizon satellites without data show
    dashes.
  - Add:

```ts
    // #213: during the almanac search the receiver cannot know where a satellite it searches blindly stands; unknown
    // values are dashes
    it('shows dashes for the elevation of satellites without orbit data during an almanac search (#213)', async () => {
        const unit = await almanacSearch();
        const sats = unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
        const withoutData = sats.filter(s => s.lastEphemerisTime === undefined).map(s => s.prn);
        expect(withoutData.length).toBeGreaterThan(0);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => withoutData.includes(prn));

        expect(shown.map(([, ele]) => ele)).toEqual(withoutData.map(() => '--'));
    });
```

  - Add a new describe:

```ts
// A real-unit video: started 829 NM from its stored position, STA 1 showed ACQ with the satellites the almanac predicts
// for the stored position and their predicted elevations, constant through the acquisition; not yet received ones with
// a * and SNR 00 (#213)
describe('STA 1 page during ACQ', () => {
    const STORED_LAT = 47 + 829 / 60;

    async function acquisition(): Promise<HeadlessUnit> {
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: STORED_LAT, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        return unit;
    }

    it('shows the predicted elevations, unchanged 30 s later, not the true ones (#213)', async () => {
        const unit = await acquisition();
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);
        const predicted = new Map(gps.search.predictedSatellites().map(p =>
            [p.prn, Math.round(90 - p.position.get()[0] * 180 / Math.PI)]));

        const first = (await satelliteRows(unit)).map(prnAndEle);
        await vi.advanceTimersByTimeAsync(30_000);
        const later = (await satelliteRows(unit)).map(prnAndEle);

        expect(first.map(([prn]) => prn)).toEqual([...predicted.keys()].sort((a, b) => a - b));
        for (const [prn, ele] of first) {
            expect(Math.abs(Number(ele) - predicted.get(prn)!)).toBeLessThanOrEqual(1);
        }
        expect(later).toEqual(first);
        const truth = (prn: number) => {
            const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === prn)!;
            return 90 - sat.position.get()[0] * 180 / Math.PI;
        };
        expect(first.some(([prn, ele]) => Math.abs(Number(ele) - truth(prn)) >= 3)).toBe(true);
    }, 60_000);
});
```

  Add `vi` to the vitest import.

- [ ] **Step 2: Run, confirm the failures.** Run `npx vitest run test/render/pages/left/Sta1Page.test.ts`.
  - The #213 pin and the dashes test FAIL: `|90 - zenith|` is shown.
  - The ACQ test FAILS: the page lists the channels, not the predicted set.

- [ ] **Step 3: Implement.**
  - In `kln90b/Gps.ts`, add `public simTimeUnix: number = 0;` to `GPS`, and set `this.simTimeUnix = actualUnixTime;`
    at the start of `tick()`.
  - In `kln90b/pages/left/Sta1Page.tsx`, replace `getSats()` and `drawSat()` by a row model. Keep the state switch
    as is (Task 5 changes it); its NAV D check reads `rows`.

```ts
type SatRow = {
    prn: number,
    state: GPSSatelliteState,
    signalStrength: number,
    /** Degrees above the horizon, or null when the receiver does not know where the satellite stands */
    ele: number | null,
};

const toElevation = (zenith: number): number | null => {
    const ele = 90 - UnitType.RADIAN.convertTo(zenith, UnitType.DEGREE);
    return ele >= 0 ? ele : null;
};
```

```ts
    private getRows(): SatRow[] {
        const gps = this.props.sensors.in.gps;
        const byPrn = (a: SatRow, b: SatRow) => a.prn - b.prn;

        if (gps.search.mode === SearchMode.Acquisition && !gps.isValid()) {
            //A real-unit video: during ACQ the page lists the satellites predicted for the stored position and the unit's
            //clock, with the predicted elevation (#213)
            return gps.search.predictedSatellites().map(p => {
                const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === p.prn);
                return {
                    prn: p.prn,
                    state: sat?.state.get() ?? GPSSatelliteState.None,
                    signalStrength: sat?.signalStrength.get() ?? 0,
                    ele: toElevation(p.position.get()[0]),
                };
            }).sort(byPrn);
        }

        const sats = gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
        return sats.map(sat => ({
            prn: sat.prn,
            state: sat.state.get(),
            signalStrength: sat.signalStrength.get(),
            //A satellite searched blindly has no known position until its orbit data is in (#213)
            ele: gps.isValid() || sat.isCachedEphemerisValid(gps.simTimeUnix) ? toElevation(sat.position.get()[0]) : null,
        })).sort(byPrn);
    }
```

  - `drawSat(row: SatRow | undefined)` keeps today's switch on `row.state`; `sat.prn` becomes `row.prn`, and
    `sat.signalStrength.get()` becomes `row.signalStrength`.
  - The ELE field is `row.ele === null ? "--" : format(row.ele, "00")`.
  - Replace every `this.getSats()` with `this.getRows()`. The NAV D check becomes
    `rows.some(r => r.state === GPSSatelliteState.Acquired)`.
  - The debug branch reads the satellites through `gps.gpsSatComputer.getChannels()` directly.
  - Imports: `SearchMode` from `"../../GpsSearch"`.

- [ ] **Step 4: Run.** Run `npx vitest run test/render/pages/left/Sta1Page.test.ts test/render/GpsAcquisition.test.ts`;
  all pass, and the snapshot is unchanged.

- [ ] **Step 5: Mutation checks.** Restore each afterwards and confirm with `git diff`.
  - (a) Put back `Math.abs(90 - …)`: the pin must fail.
  - (b) Drop the `isCachedEphemerisValid` clause: the dashes test must fail.
  - (c) Make `getRows` ignore the ACQ branch: the ACQ test must fail.

- [ ] **Step 6: Docs and commit.**
  - In `docs/architecture.md`, describe STA 1 under Core 3 if pages are covered there; otherwise leave the docs
    unchanged. Check with `grep -n "STA 1" docs/architecture.md`.
  - Run `npx tsc --noEmit` and `npm test`.

```bash
git add kln90b/pages/left/Sta1Page.tsx kln90b/Gps.ts test/render/pages/left/Sta1Page.test.ts docs
git commit -m "fixes #213 show predicted elevations during ACQ and dashes for satellites searched blindly on STA 1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Fix #215, the STA 1 receiver states

**Goal:** STA 1 shows the receiver states that ORS 20 lists (5-29):
- INIT before the first channel assignment and during the almanac and sky searches;
- ACQ during the start model's ACQ, even when nothing can be acquired;
- TRAN for one calculation tick between the SDK solution and the unit accepting it;
- NAV, NAV A and NAV D as today.

**Files:**
- Modify: `kln90b/Gps.ts` (acceptance of the solution, `isValid`, `isTransition`, `gpsAcquired` trigger, forced acquisition)
- Modify: `kln90b/pages/left/Sta1Page.tsx` (state line)
- Test: `test/render/pages/left/Sta1Page.test.ts`, `test/render/GpsAcquisition.test.ts`
- Docs: `docs/architecture.md` Core 3 (`isValid`), `docs/testing.md` if it describes `isValid` timing

**Acceptance Criteria:**
- [ ] A new test: STA 1 shows `STATE  TRAN` on the calculation tick of the SDK's first solution, while `isValid()` is false. One second later `isValid()` is true and the state is NAV or NAV A.
- [ ] A new test: a warm start with the clock 15 minutes behind shows `STATE   ACQ` on STA 1 right after the self-test.
- [ ] The almanac-search INIT test (Task 3) and the ACQ test (#211) still pass. The engine-running snapshot still shows `STATE NAV A`.
- [ ] An engine-running boot is valid right after `settle` (the existing tests), and a forced acquisition is accepted at once, without TRAN.
- [ ] The #215 question comments in the tests are removed or replaced by the decisions.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/pages/left/Sta1Page.test.ts test/render/GpsAcquisition.test.ts` → all pass; `npm test` → all pass.

**Steps:**

- [ ] **Step 1: Tests.** In `test/render/pages/left/Sta1Page.test.ts`, add:

```ts
// 5-29, 5-30: the transition state means enough satellites are tracked but no position is produced yet. A real-unit video
// shows it for about half a second between ACQ and NAV A; the unit accepts the position one calculation tick after the
// receiver has its solution (#215)
describe('STA 1 receiver states (5-29)', () => {
    it('shows TRAN on the tick of the first solution, NAV one second later (5-29, #215)', async () => {
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        const sdkSolution = () => gps.gpsSatComputer.state === GPSSystemState.SolutionAcquired;
        for (let i = 0; i < 600 && !sdkSolution(); i++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(sdkSolution()).toBe(true);
        await vi.advanceTimersByTimeAsync(250); //one display tick

        expect(gps.isValid()).toBe(false);
        expect(Screen.read().rows('L')[0]).toBe('STATE  TRAN');

        await vi.advanceTimersByTimeAsync(1000);
        expect(gps.isValid()).toBe(true);
        expect(Screen.read().rows('L')[0]).toMatch(/^STATE (  NAV|NAV A|NAV D)$/);
    }, 60_000);

    // The start model searches the satellites it predicts even when its clock is too far off to acquire them; the
    // receiver is in its acquisition state, not initializing (5-29)
    it('shows ACQ during an acquisition that cannot succeed, the clock 15 minutes behind (5-29, #215)', async () => {
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
            beforePowerOn: u => {
                const gps = u.props.sensors.in.gps;
                gps.timeZulu = TimeStamp.create(gps.timeZulu.getTimestamp() - 15 * 60 * 1000);
            },
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
    }, 60_000);
});
```

  `bootToSelfTest` may not have a `beforePowerOn` hook; check `test/harness/boot.ts:324`. If it lacks one, build the
  unit the way `powerOnCold` in `GpsAcquisition.test.ts` does, and put this test in `GpsAcquisition.test.ts`:
  - `bootUnit({engineRunning: false, storage})`;
  - shift `gps.timeZulu`;
  - `unit.panel.powerOn()`;
  - advance 19 s (`bootToSelfTest` does the same);
  - `approveSelfTest()`.

  Imports: `GPSSystemState` from the SDK, `vi`, and `TimeStamp` from `../../../../kln90b/data/Time` (fix the depth for
  the file you use).

  Check the exact widths of the expected rows: the state field is 5 characters after `STATE ` (`" TRAN"`, `"  ACQ"`).

  In `GpsAcquisition.test.ts`, remove the comment lines `// the receiver states are a question: #215` and update the
  describe comment of `STA 1 page with a fix (characterization)`: NAV A shows whenever there is an altitude, as on a
  real unit with all eight satellites in use (decided in #215).

- [ ] **Step 2: Run, confirm the failures.** The TRAN test FAILS, because the unit is valid on the same tick. The ACQ
  test FAILS: with every satellite inhibited the SDK reports `Searching`, which shows INIT.

- [ ] **Step 3: Implement in `kln90b/Gps.ts`.**
  - Remove the `gps_system_state_changed_1` subscription from the constructor; acceptance replaces it.
  - Add fields:
    ```ts
    private solutionAccepted = false; //5-29: the unit accepts the receiver's solution one calculation tick after it appears (TRAN)
    private inTransition = false;
    ```
  - Add:
    ```ts
    private hasSdkSolution(): boolean {
        const state = this.gpsSatComputer.systemState.get();
        return state === GPSSystemState.SolutionAcquired || state === GPSSystemState.DiffSolutionAcquired;
    }

    /** 5-29: enough satellites are tracked, but the unit has not accepted the position yet */
    public isTransition(): boolean {
        return this.inTransition;
    }

    /** The forced acquisition of an engine-running start or SET 10 FAST is accepted at once, without TRAN */
    public acceptForcedSolution(): void {
        if (this.hasSdkSolution() && !this.solutionAccepted) {
            this.solutionAccepted = true;
            this.inTransition = false;
            this.gpsAcquired();
        }
    }
    ```
  - Change `isValid()` to `return this.solutionAccepted && this.hasSdkSolution();` and keep its TODO comment on
    3 satellites plus altitude.
  - In `tick()`, non-take-home branch, right after `this.gpsSatComputer.onUpdate();`:
    ```ts
            if (!this.hasSdkSolution()) {
                this.solutionAccepted = false;
                this.inTransition = false;
            } else if (!this.solutionAccepted) {
                if (this.inTransition) {
                    this.solutionAccepted = true;
                    this.inTransition = false;
                    this.gpsAcquired();
                } else {
                    this.inTransition = true;
                }
            }
    ```
  - In `KLNGPSSatComputer.acquireAndUseSatellites()`, after `super.acquireAndUseSatellites();`, call
    `this.onForcedAcquisition?.();`. Add the field `public onForcedAcquisition: (() => void) | undefined = undefined;`.
    In the `GPS` constructor, set it to `() => this.acceptForcedSolution()`.
  - In `powerChanged`'s unpowered branch, set `this.solutionAccepted = false; this.inTransition = false;`.

- [ ] **Step 4: Implement in `kln90b/pages/left/Sta1Page.tsx`.** Replace the state `switch` with:

```ts
    private stateText(rows: SatRow[]): string {
        const gps = this.props.sensors.in.gps;
        if (gps.isValid()) {
            if (rows.some(r => r.state === GPSSatelliteState.Acquired)) {
                return "NAV D";
            }
            return this.props.sensors.in.airdata.pressureAltitude === null ? "  NAV" : "NAV A";
        }
        if (gps.isTransition()) {
            return " TRAN";
        }
        switch (gps.search.mode) {
            case SearchMode.Acquisition:
                return "  ACQ";
            case SearchMode.AlmanacSearch:
            case SearchMode.SkySearch:
                return " INIT"; //ORS 20 has no state of its own for a search of the sky (ORS 01 had SRCH)
        }
        return gps.gpsSatComputer.state === GPSSystemState.Acquiring ? "  ACQ" : " INIT";
    }
```

  Use `this.children.get("line0").text = \`STATE ${this.stateText(rows)}\`;`.

- [ ] **Step 5: Run.** Run `npx vitest run test/render/pages/left/Sta1Page.test.ts test/render/GpsAcquisition.test.ts`,
  then `npm test`. Tests that read `isValid()` on the exact tick of a slow-start acquisition may now see it a second
  later; `secondsToFix` shifts by 1 s.
  - Re-check the bounds of the Task 3 timing tests; the hot `< 17` must still hold.
  - If it no longer holds, lower `acquisitionTimeWithEphemeris` by 1 s (Task 3 tuning rule) in this commit, and say so
    in the commit body.

- [ ] **Step 6: Mutation checks.** Restore each afterwards.
  - (a) Accept on the first tick (set `solutionAccepted = true` where `inTransition = true` is set): the TRAN test must
    fail.
  - (b) Map `SearchMode.Acquisition` to INIT: the ACQ test must fail, and the warm-start ACQ pin of #211 must stay green.

- [ ] **Step 7: Docs and commit.**
  - `docs/architecture.md` Core 3: replace the `isValid()` bullet. It is true one calculation tick after the receiver's
    first solution (TRAN, 5-29); a forced acquisition is accepted at once.
  - `gpsAcquired()` runs on acceptance.
  - Run `npx tsc --noEmit` and `npm test`.

```bash
git add kln90b/Gps.ts kln90b/pages/left/Sta1Page.tsx test docs
git commit -m "fixes #215 show INIT, ACQ and TRAN on STA 1 from the start model and accept the position one tick after the solution

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Fix #214, STA 5 RAIM prediction

**Goal:** STA 5 predicts at the destination and the ETA. It uses one long-lived prediction context of the main
computer instead of a second `GPSSatComputer`, which ignores time and place since SDK 2.3.3 and never initializes in
the harness.

**Files:**
- Modify: `kln90b/Gps.ts` (`public readonly raimPrediction`)
- Modify: `kln90b/pages/left/Sta5Page.tsx` (`calculateRaim`, imports)
- Test: `test/render/pages/left/Sta5Page.test.ts`
- Docs: `docs/testing.md` section 6 (the "STA 5 cannot be tested" bullet), `docs/architecture.md` if it mentions STA 5

**Acceptance Criteria:**
- [ ] A new test (standard route, destination KBBB): after the COMPUTING delay, row 4 of the left page shows seven availability bars `'  èèèèèèè  '`.
- [ ] A new test: the prediction runs at KBBB's latitude and longitude, for the seven times ETA −15 to +15 minutes in steps of 5, with the middle one at the ETA's hh:mm.
- [ ] A new test: the prediction context gives a different PDOP at 47/8 and at −47/−172 for the same time.
- [ ] `Sta5Page.tsx` no longer constructs a `GPSSatComputer` or an `EventBus`.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/pages/left/Sta5Page.test.ts` → all pass; `npm test` → all pass.

**Steps:**

- [ ] **Step 1: Tests.** In `test/render/pages/left/Sta5Page.test.ts`, replace the comment block above the second
  describe; the prediction is testable now. Add to that describe:

```ts
    async function onStandardRouteAtSta5() {
        const {abc, kbbb} = standardRoute();
        const unit = await bootOnStandardRoute();
        const here = {lat: 47.01, lon: 8.02};
        await moveAircraft(unit, here, {groundspeedKt: 120, trackTrue: 50});
        const eta = new Date(Date.now() + (distanceNm(here, abc) + distanceNm(abc, kbbb)) / 120 * 3600 * 1000);
        const hhmm = `${String(eta.getUTCHours()).padStart(2, '0')}:${String(eta.getUTCMinutes()).padStart(2, '0')}`;
        return {unit, kbbb, hhmm};
    }

    // 6-20: after COMPUTING the page shows seven bars from -15 to +15 minutes, above the line where RAIM is available.
    // The constellation of the harness covers the destination at every offset
    it('shows RAIM available at all seven offsets after computing (6-20, #214)', async () => {
        const {unit} = await onStandardRouteAtSta5();
        await unit.panel.selectPage('L', 'STA 5');
        await vi.advanceTimersByTimeAsync(11_000);

        expect(Screen.read().rows('L')[4]).toBe('  èèèèèèè  ');
    });

    // 6-19, 6-20: the prediction is for the destination at the ETA, not for here and now (#214)
    it('predicts at the destination for the ETA and the six offsets around it (6-20, #214)', async () => {
        const {unit, kbbb, hhmm} = await onStandardRouteAtSta5();
        const setPosition = vi.spyOn(unit.props.sensors.in.gps.raimPrediction, 'setPosition');
        await unit.panel.selectPage('L', 'STA 5');
        await vi.advanceTimersByTimeAsync(11_000);

        const calls = setPosition.mock.calls;
        expect(calls).toHaveLength(7);
        for (const [lat, lon] of calls) {
            expect(lat).toBeCloseTo(kbbb.lat, 6);
            expect(lon).toBeCloseTo(kbbb.lon, 6);
        }
        const times = calls.map(c => c[3]);
        expect(times.map(t => t - times[3])).toEqual([-15, -10, -5, 0, 5, 10, 15].map(m => m * 60_000));
        expect(new Date(times[3]).toISOString().slice(11, 16)).toBe(hhmm);
    });
```

  Add another describe:

```ts
// The prediction context computes the satellite geometry where and when it is told (#214)
describe('the RAIM prediction context', () => {
    it('gives a different PDOP at 47/8 and at its antipode for the same time (#214)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const prediction = unit.props.sensors.in.gps.raimPrediction;
        await prediction.awaitInit();

        const pdop = (lat: number, lon: number) => prediction.setPosition(lat, lon, 0, Date.now()).predict().getDops()[0];
        const here = pdop(47, 8);
        const antipode = pdop(-47, -172);

        expect(here).toBeGreaterThan(0);
        expect(antipode).toBeGreaterThan(0);
        expect(antipode).not.toBeCloseTo(here, 3);
    });
});
```

  Imports: `vi` from vitest.

  If row 4 does not read `'  èèèèèèè  '`, check how `TextDisplay` pads, and adjust only the padding in the expected
  string: the inline snapshot above shows the row as `'  ççççççç  '` before computing.

- [ ] **Step 2: Run, confirm the failures.** `raimPrediction` does not exist, so the tests fail to compile or fail;
  the bars test shows `é` today.

- [ ] **Step 3: Implement.**
  - `kln90b/Gps.ts`: add `public readonly raimPrediction: GPSPredictionContext;`. In the constructor, right after the
    `GpsSearch` is created (before the bus subscriptions), add
    `this.raimPrediction = this.gpsSatComputer.createPredictionContext(); //STA 5 (6-20): one context for the life of the unit; pages are rebuilt on every knob step`.
    Import `GPSPredictionContext`.
  - `kln90b/pages/left/Sta5Page.tsx`, replace the body of `calculateRaim` after `this.children.get("result").text = " COMPUTING";` with:

```ts
        const wpt = this.wpt;
        const prediction = this.props.sensors.in.gps.raimPrediction;

        this.refDebounce.schedule(async () => { //we need to simulate the calculation time anyway
            await prediction.awaitInit();
            let result = "";
            for (let timeOffset = -15; timeOffset <= 15; timeOffset += 5) {
                //6-19, 6-20: the satellite geometry at the destination at the ETA and around it (#214)
                prediction.setPosition(wpt.lat, wpt.lon, 0, actualTimeStamp + timeOffset * 60 * 1000).predict();
                const isRaimAvailable = prediction.getDops()[0] >= 0; //A position solution exists

                result += isRaimAvailable ? "è" : "é";
            }

            this.children.get("result").text = "  " + result;
        }, RAIM_CALCULATION_TIME);
```

  - Remove the temporary bus, the publishers, the `GPSSatComputer` construction and the `console.log`. Remove the
    unused imports: `ClockEvents`, `EventBus`, `GNSSEvents`, `GPSSatComputer`, `GPSSystemState`.

- [ ] **Step 4: Run.** `npx vitest run test/render/pages/left/Sta5Page.test.ts` → all pass.

- [ ] **Step 5: Mutation checks.** Restore each afterwards.
  - (a) Pass the aircraft position (`this.props.sensors.in.gps.coords`) instead of `wpt`: the call test must fail.
  - (b) Pass `Date.now()` instead of the ETA time: the call test must fail.
  - (c) Drop `.predict()`: the PDOP test must stay green (it calls predict itself), and the bars test must fail or stay
    green. Record which; this probes whether the bars test sees the prediction at all. If it stays green, say so in the
    report as a finding.

- [ ] **Step 6: Docs and commit.**
  - `docs/testing.md` section 6: replace the bullet "STA 5 cannot be tested as it is" with a short note. STA 5 predicts
    through `gps.raimPrediction`, a prediction context of the main computer, and the harness tests it.
  - Mention the prediction context in `docs/architecture.md` Core 3, next to the RAIM sentence ("There is no position
    error or noise and no RAIM"): STA 5 predicts with the SDK prediction context; RAIM failures are still not modeled.
  - Run `npx tsc --noEmit` and `npm test`.

```bash
git add kln90b/Gps.ts kln90b/pages/left/Sta5Page.tsx test/render/pages/left/Sta5Page.test.ts docs
git commit -m "fixes #214 predict RAIM on STA 5 at the destination and ETA through a prediction context of the main receiver

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
