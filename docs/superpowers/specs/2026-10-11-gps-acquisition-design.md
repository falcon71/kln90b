# GPS acquisition, receiver states and RAIM prediction: design

Date: 2026-10-11. Issues: #62, #211, #213, #214, #215, #328. Branch: `gps-fixes`.

## 1. Evidence

The observations of real units beat the manuals (maintainer's rule for this work).

**Real KLN 90B timings (#62).** These come from an owner's notes; the maintainer keeps a copy with photos in the local
reference library.
- **Normal starts.** The almanac was current, the time right and the aircraft not moved, with no other
  difference between the runs. Four power-ons took 1:25, 0:32, 1:47 and 0:17.
- **Hot starts.** A power cycle with a current ephemeris reaches a fix in 0:17 nearly every time, power-on self-test
  included. The self-test page lasts 17 s in the simulator (`WelcomePage` `TEST_TIME`).
- **Wrong date.** Right after the self-test, before the first fix, the owner set the date on SET 2 to a wrong
  year, then cycled the power. The unit took 21:36 to find itself. It then showed `20 MAY 86` (the week
  rollover, #63) and navigated normally.
- **After the rollover.** After the unit had resolved the date to `20 MAY 86` (two eras back, #63), every later power
  cycle still found the satellites in 17 s, self-test included. The wrong date could be fixed only by entering the right
  date before the next fix, and waiting some hours for the ephemeris to expire gave a longer (warm) window for that.
- **SET 2 after a fix.** Once a satellite supplies the time, SET 2 edits snap back to GPS time (3-53, already
  modeled).

**Real-unit videos** (local reference library):
- **829 NM start.** The stored position was 829 NM from the real one. STA 1 showed **ACQ**, not a sky search.
  - It listed eight satellites with elevations predicted for the *stored* position. The elevations stayed constant
    for the whole acquisition.
  - Satellites not yet received showed `*`, SNR `00` and a numeric elevation. One predicted satellite was never
    received and was replaced after the fix.
  - TRAN appeared for about half a second, then NAV A with all eight satellites in use. The fix came 2:22 after
    power-on.
- **Second unit.** It showed NAV D with four satellites in use about 27 s after power-on.
- **Display details.**
  - The health column was always blank.
  - No elevation below 7° appeared.
  - STA 5 appears in no video.

**Manuals.**
- **Pilot's Guide, ORS 20:**
  - 3-5, 3-17: a correct time, date and position give a fix usually in under 2 minutes. Otherwise the unit looks
    for any satellite: typically 6 minutes, at most 12.
  - The almanac stays current for six months.
  - 5-29, 5-30: the STA 1 states are INIT, ACQ, TRAN, NAV, NAV A, NAV D, DEGRD and FAILR, and the elevation
    ranges from 5° to 90°.
- **Pilot's Guide, ORS 01** (a scan; the maintainer supplied the pages):
  - Its STA 1 list (6-29) also has `SRCH`. ORS 20 dropped it, and the project follows ORS 20.
  - The page after it (6-30) explains the search: an almanac six months old or more sends the receiver into the
    search-the-sky state. One received satellite is enough to collect a new almanac, and the search takes 20
    minutes. ORS 20 dropped that sentence and gives 6 typical, 12 at most instead (3-17). The observed 21:36 on newer
    receiver software (host 01515-0047) agrees with ORS 01, so ORS 01's 20 minutes win.
- **Install manual 2-66:** for the checkout, enter a position within 60 NM and a time within 10 minutes. STA 1 should
  then show ACQ and a fix within 5 minutes, typically 2. A search of the sky can take up to 15 minutes.

**GPS background.**
- **Ephemeris.** A receiver needs a satellite's ephemeris to use it in a fix. Each satellite repeats its ephemeris
  every 30 s, so collecting it takes at least about 18 s per satellite. The data stays usable for a few hours.
- **Almanac.** The almanac is coarse and valid for months, and it takes 12.5 minutes to collect in full.
- **Start types.**
  - Hot: a current ephemeris; the receiver only reacquires.
  - Warm: a current almanac, time and position; the receiver predicts which satellites are up and collects their
    ephemeris.
  - Cold: no usable prediction; the receiver searches the sky blindly. Contemporary 8-channel receivers (Trimble
    SVeeEight) search eight satellites at a time and move on after a timeout, as the SDK's sky search does.
- **A confidently wrong prediction costs time.** With a wrong clock or position the receiver searches satellites, and
  Doppler shifts, that are not there, and it falls back to a blind search only after it gives up.
- **The wrong date is an expired almanac.** The unit judges the almanac's age by its own clock. A clock years off
  makes a current almanac look years old, so the 21:36 start was a search of the sky for a new almanac (ORS 01:
  20 minutes), not a wrong-prediction case.
- **The receiver cannot tell GPS eras apart.** The satellites broadcast the GPS week only modulo 1024, and the
  receiver's clock keeps time the same way. A clock off by whole eras, which is what the date is after a rollover
  (#63), looks right to the receiver: the almanac is current and the clock matches, so power cycles stay hot or warm.

The KLN 89 trainer runs in take-home mode only and does not simulate the receiver. It gave nothing for this work.

## 2. Start model (#62)

**What the unit believes decides how it searches.** At every power-on the unit picks a start mode from its stored
data and its own clock.

1. **The almanac is not current by the unit's own clock** (six months or more between the stored almanac time and
   the unit's clock, both taken modulo the 1024-week GPS era, as the receiver keeps them) → **almanac search**
   (ORS 01 6-30). This covers both a really old almanac and a clock that is far off, such as a wrong date; a clock off
   by whole eras, as after a rollover (#63), is not far off to the receiver.
   - The SDK runs its PRN-order blind search until the first satellite is acquired.
   - All other satellites are then inhibited. One satellite is enough to collect the almanac, and the unit does not
     navigate on a blind fix.
   - The SDK collects the almanac from it (`almanacDownloadTime`, 12.5 minutes, kept as it is).
   - When the almanac is complete, the unit's clock is set from the satellite (GPS time; the week rollover of #63
     applies as today) and the model continues with ACQ (step 2), with the inhibits cleared and the SDK last-known
     position set to the present position.
2. Otherwise → **ACQ.**
   - A prediction context (`GPSSatComputer.createPredictionContext()`, public SDK API) is set to the *stored* position
     and the *unit's* clock, as it is, also when the clock is off by whole eras (the SDK reduces the time to the time of
     week before it propagates the orbits, so the same satellites are predicted). Its channel assignment gives the eight
     satellites the unit believes are best (the predicted set). The prediction uses a 5° elevation mask (5-30).
   - If the unit's clock is more than 10 minutes from the sim time (modulo the era), the Doppler predictions are wrong
     and nothing can be acquired in ACQ: the allowed set is empty. The 10 minutes come from install manual 2-66.
   - Otherwise the allowed set is the predicted set.
   - Every satellite outside the allowed set is inhibited on the main computer (`setSatelliteInhibit`, public).
   - The SDK last-known position is set so that the SDK's own 100 NM rule does not override the KLN decision: the
     stored position when it is within 100 NM of the present one (then the SDK's 2 NM hot-start rule works on it),
     otherwise the present position.
   - The SDK then acquires whatever is really in view within the allowed set. At 829 NM most of the predicted set
     overlaps the real sky, so the start stays ACQ, as in the video.
3. **Give-up.** If ACQ has no fix after `T_GIVE_UP` (5 minutes, the install manual's longest ACQ, 2-66), the unit
   switches to a **sky search**: all inhibits are cleared, the SDK last-known position is erased and the KLN almanac
   check reports invalid, so the SDK runs its PRN-order blind search. The almanac is current, so no almanac collection
   follows; the first blind fix is used. Give-up plus sky search stays within the 12 minutes of 3-17 for a wrong time
   or position.
4. **First fix.** The model ends: the inhibits are cleared and the SDK runs normally until the next power-on.

`KLNGPSSatComputer.isAlmanacValid` returns the decision of the model (ACQ: true; almanac search and sky search: false).
The almanac age check moves into the model, by the unit's clock (`internalTime`) as the original check did.

A new unit `kln90b/GpsSearch.ts` holds the model, the prediction context and the timers; `Gps.ts` stays the façade and
drives it from `powerChanged` and `tick`.

**Timing.**
- **Hot.** The SDK's `acquisitionTimeWithEphemeris` is tuned so that a hot start has its fix before the self-test ends
  (about 10 s).
- **Warm (the per-power-on factor).** A warm start's time is spread by one random factor drawn per power-on, which
  sets the SDK's `acquisitionTime` for that power-on. It stands for the effects common to all channels: oscillator
  warm-up and the phase of the 30 s data frame. The per-satellite randomness alone cannot spread the fourth-fastest
  of eight satellites from 0:32 to 1:47. Ephemeris collection stays 30 s.
- **Almanac search.** Blind search for one satellite, plus 12.5 minutes of almanac, plus a warm ACQ, lands near the
  20 minutes of ORS 01 and the observed 21:36. The blind search for that first satellite has its own acquisition time
  (`ALMANAC_SEARCH_ACQUISITION`, 390 ± 60 s), because the sky search's 90 ± 30 s would land the whole search near 15
  minutes. A receiver that does not trust its clock searches with no Doppler or time aid. The sky search keeps its own
  value, as it is already near its 12-minute bound. If the satellite is lost before the almanac is complete, the blind
  search resumes and the next satellite found is kept.
- **Give-up and the sky search.** 5 minutes of ACQ, plus the blind search of today (about 6 minutes), stays within 12
  (3-17).
- The exact numbers are tuning, held by the tests in section 7.

**Ephemeris memory.** The SDK keeps each satellite's ephemeris time over our power cycles within a sim session. Across
sessions, a new persisted setting key `lastEphemeris` (default empty, so older profiles load unchanged) stores the time
of the last ephemeris and the PRNs it covers. It is saved with `lastAlmanacDownload`; at boot it is written back into
those satellites. With the SDK's ephemeris expiry of 2 hours, a new flight at the same sim time and place within 2
hours is a hot start too.

**Unchanged.**
- `fastGpsAcquisition` (FAST, a simulator convenience): no model; the existing FAST characterizations hold.
- The engine-running start: `forceReadyToUse` calls `acquireAndUseSatellites()`, which ends the model at once.
- Take-home mode.
- The week rollover (#63).

**Private SDK reaches.**
- **New:** the SDK's private `satelliteTimingOptions` (the per-power-on `acquisitionTime`) and the satellites' private
  `data.lastEphemerisTime` (the persisted ephemeris). Each gets a tripwire test, like the existing ones.
- **No longer needed:** `simTime` and `distanceFromLastKnownPos`, read since #211.

## 3. The clock (#328, the clock half of #211)

- **#328.** The GPS keeps its own battery clock and no longer reads `PowerButton`'s assumed hour.
  - It records `Date.now()` at construction and at every power-off, and adds the real off time at power-on.
  - The constructor no longer subtracts the hour, and `powerChanged` no longer reads `timeSincePowerChange`.
  - `PowerButton` is unchanged, because `BrightnessManager` and `VolatileMemory` rely on its assumed hour.
  - A cold-and-dark start still advances the clock by the time the unit sat unpowered, and an engine-running start
    no longer posts SYSTEM TIME UPDATED.
- **#211, minimal fix in its own commit:**
  - `powerChanged` also sets `gpsSatComputer.internalTime`.
  - `isAlmanacValid` reads `activeSimulationContext.time` and computes the distance from the context's position and
    last-known position itself.
  - The `simTime` and `gps-position` publishes in `tick()`, which nothing reads since SDK 2.3.3, go.
  - The debug TTF line on STA 1 reads the moved field.
  - #62 later replaces the almanac check with the start model.

## 4. STA 1 (#213, #215)

**Satellites and elevation (#213):**

| Phase | Satellites listed | ELE |
|---|---|---|
| ACQ, before the first fix | the predicted set, with the SNR of the main computer's satellite of that PRN (`00` until acquired) | predicted for the stored position and the unit's clock, constant, as in the video |
| Navigating | the main computer's channels | the true elevation, `90 − zenith` (no `Math.abs`) |
| Almanac search or sky search, a satellite with no orbit data yet | the main computer's channels | `--°` (the receiver cannot know where it is; unknown values are dashes) |

**States (#215):**
- **INIT.** The receiver initializes after power-on, before it first assigns channels. INIT also covers the almanac
  search and the sky search: ORS 20 has no state of its own for them (the maintainer's decision; ORS 01's `SRCH` was
  dropped).
- **ACQ.** The ACQ mode of the start model, until the solution.
- **TRAN.** For one calculation tick between the SDK's first solution and the unit accepting the position: `isValid()`
  turns true one tick after the SDK solution. The video shows about half a second of TRAN.
- **NAV, NAV A, NAV D:**
  - NAV A stays as today: whenever there is an altitude, whatever the satellite count. The video shows NAV A with
    eight satellites in use, which answers point 3 of #215.
  - NAV D keeps today's case (a satellite still collecting ephemeris). An expired almanac is collected before the first
    fix (ORS 01 6-30), so NAV D needs no almanac case.
- DEGRD and FAILR stay unmodeled (no failures, no RAIM).

## 5. STA 5 RAIM prediction (#214)

- `Sta5Page` no longer builds its own `GPSSatComputer`. Since SDK 2.3.3 that computer ignores the published ETA and
  waypoint, and in the harness it never initializes.
- `GPS` owns one long-lived RAIM prediction context from the main computer. It is created once, because pages are
  rebuilt on every knob step.
- For each offset from −15 to +15 minutes the page calls `setPosition(wpt, 0, ETA + offset).predict()` after
  `awaitInit()`. It reads "available" as a PDOP of 0 or more, the criterion of today.
- The COMPUTING delay stays.

## 6. Commits and docs

**Commits.** One commit per issue (CLAUDE.md), each with its tests and doc changes, in this order: #328 → #211 → #62 →
#213 → #215 → #214. Each removes the `.fails` of its own pins, and only those.

**Docs:**
- `docs/architecture.md` Core 3 (the GPS paragraph and the private SDK internals) and Core 1 (the power-event
  subscribers).
- `docs/testing.md` section 6:
  - the list of SDK internals;
  - the #328 note on engine-running boots;
  - the STA 5 note;
  - the acquisition facts of the harness.
- The GPS bullet of `CLAUDE.md`.

The new persisted key adds to the public contract without changing an old key, so no wiki page changes.

## 7. Tests

Render stage, `test/render/GpsAcquisition.test.ts` and the STA page tests. The timings run over several seeds where
the result is random.

- **#328:** the existing pin turns red; a cold-and-dark start that waits before power-on keeps its clock right.
- **#211:** its pins turn red, then are rewritten by #62 where the model changes the expectation.
- **#62:**

  | Start | Expected |
  |---|---|
  | Hot (power cycle with current ephemeris) | fix before the self-test ends, every seed |
  | Warm | fix between 30 s and 2 min across seeds, with some seeds under 45 s and some over 90 s |
  | 829 NM from the stored position | STA 1 shows ACQ; fix within 5 minutes (install manual 2-66; the video gives 2:22) |
  | 80 NM | a warm start. The current 80 NM sky-search test changes: 60 NM is checkout advice, not a rule of the unit (the video) |
  | Clock 15 minutes off, position on another continent (almanac current) | ACQ gives up: not within 5 minutes, within 12 (3-17). The current 15-minute test keeps its 12-minute bound and gains the 5-minute floor |
  | Expired almanac (200 days), clock years off (the wrong date; 30 years, about 9 years from a whole era) | almanac search: not within 17 minutes, within 23 (ORS 01 6-30: 20 minutes; observed 21:36). The current 200-day test changes from "within 12" |
  | Clock exactly 1024 weeks off (after a rollover) | a warm start (30 s to 2 min) with the date staying in the old era; a power cycle with a current ephemeris is hot, one after 3 hours is warm (#63) |
  | Almanac search | only one channel is in use while the almanac is collected |
  | Persisted ephemeris | a reboot within 2 hours at the same place and time is a hot start; after more than 2 hours it is warm |

  Plus tripwires for the new private SDK reaches.
- **#213:**
  - the existing pin turns red;
  - ACQ shows the predicted elevations, and they stay constant;
  - a sky search shows `--°` for satellites without data;
  - navigating shows the true elevation.
- **#215:**
  - INIT during an almanac search and a sky search (the existing characterization stays);
  - ACQ on a warm start (the #211 pin);
  - TRAN for one tick;
  - the NAV A snapshot stays.
- **#214:**
  - STA 5 computes in the harness;
  - the bars, or the predicted PDOP if the ephemeris file has no coverage gap, differ between two times or places
    chosen to differ.
