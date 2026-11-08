# GPS jamming and spoofing from simulated transmitters (#465)

## Intent

#460 built jamming as a level that ramps up over 3 to 6 minutes, and left spoofing unbuilt. The maintainer wants both to
be **simulated from physical causes, not scripted** (2026-11-06, 2026-11-07): a jammer and a spoofer are transmitters on
the ground with a place and a power, and everything the pilot sees comes out of the distance, the line of sight, the
antenna and the receiver's normal rules. Jamming and spoofing active at the same time must combine through the same
physics, with no rule for the combination.

The second aim is that a pilot who switches the failure on **sees it work**: the transmitter is placed where its effect
is about to show, and replaced by a new one once the aircraft has left it.

This design replaces the model proposed in the issue body and in its comment of 2026-11-06 where they differ. What it
keeps from them is listed under "Kept from the issue". Where the issue and `docs/failures.md` differ, this design wins,
and the jamming and spoofing sections of `docs/failures.md` are rewritten in the same commit.

Page numbers are the KLN 90B Pilot's Guide, "IM" the Installation Manual. Every constant marked "guess" is our own
choice; change it when a source turns up.

## Goals

- One transmitter model for jamming and spoofing: a place, a power, path loss over distance, the radio horizon, and the
  aircraft antenna's gain toward the transmitter.
- Every transmitter's power adds to the receiver's noise floor; the existing lock rule (lost below SNR 30, acquired at
  35, IM C-7, #467) decides what the receiver tracks, for real and fake satellites alike.
- Jamming creeps in: satellites go weakest first, over minutes to tens of minutes, and come back on a descent below the
  jammer's horizon.
- Spoofing hits: the real satellites are drowned by the spoofer's own power, a short phase mixes real and fake
  satellites into a wandering wrong position with `RAIM POSITION ERROR`, then the unit is captured at the false position
  and the false time.
- The receiver computes a mixed solution from real and fake ranges as a real receiver does, with detection but no
  exclusion.
- Placement that makes the failure visible, on the ground and in flight, and a new transmitter after the aircraft has
  left the old one.
- The general `SYSTEM TIME UPDATED TO GPS TIME` check while a fix is held (B-4).

## Non-goals

- Jamming or spoofing the other GPS units of the aircraft (ruled out in `docs/failures.md`, "Other GPS units").
- Regional triggers from real-world jamming and spoofing areas (out of scope in `docs/failures.md`).
- Terrain masking. The horizon is that of a smooth earth; mountains between the transmitter and the aircraft are not
  modeled.
- A spoofer that moves its false position over time (seen around Smolensk). One fixed false position per spoofer.
- A spoofer that ramps its power to drag a known receiver off (a "carry-off"). It targets one receiver; civil aircraft
  meet broadcast spoofers.
- Fault exclusion. The KLN 90B detects (`RAIM POSITION ERROR` / `CROSS CHECK POSITION`, B-3) and does not exclude, as
  the faulty satellite of #460 already assumes.

## Anti-goals

- A scripted phase: no timer, no "jam first, then spoof" sequence, no rule keyed on "spoofing" or "jamming" in the
  receiver, the solution or STA 1. They key on signal levels and on which signal a channel tracks.
- A rule for the combination of jamming and spoofing.
- A failure that changes how the unit behaves while failures are off. Three exceptions are decided by the maintainer,
  each a plausible behavior of the real unit that hardly occurs in normal operation:
  - the general time check (it also fires when the pilot changes the sim's time of day during a fix);
  - the restart of the search after a loss of the fix when the unit's belief is far off (see "Recovery"; without a
    failure only a sim time change makes the belief that far off);
    - **Decided during implementation (2026-11-07):** the wording above is wrong. Without a failure the far-off-belief
      restart is reached by a teleport, a slew or a move on the map of 100 NM or more that loses the fix, not by a sim
      time change: a sim time jump during a fix does not lose the fix (the general time check posts its message and the
      clock follows).
  - the sky search after 5 minutes in flight without a fix and without the predicted satellites (see "Recovery";
    without a failure a loss of every satellite for 5 minutes does not happen in flight).

## Background (research, 2026-11-07)

- A jammer or a spoofer is at full power within milliseconds of being switched on. What a pilot experiences as a
  ramp comes from flying closer. A receiver loses a satellite as soon as its SNR crosses the lock threshold.
- Broadcast spoofers are not aimed at civil aircraft; aircraft are collateral. No source reports spoofers that cycle
  between jamming and spoofing. Crew reports (OPSGROUP, 2023) show long continuous encounters (a 777 shown stationary
  over Tel Aviv for 30 minutes), capture up to 200 to 250 NM from the false location, the EPU climbing from 0.1 to 60 to
  over 99 NM "in quick order" before the position jumps, UTC shifts of 2, 8 and 12 hours, and GPS that came back only
  after a power cycle on the ground.
- A receiver that tracks real satellites does not switch to a stronger fake signal by itself: its loops stay on the
  real correlation peaks, and its channels are busy. Broadcast spoofers are overpowered: their total power raises the
  noise floor until the real satellites are lost (Wesson et al., power monitoring; GPS World on AGC monitoring). The
  receiver's next search then finds the fake signals.
- Each fake signal is noise for the others, so a receiver reports a high but limited SNR for every fake satellite,
  the same for all of them whatever their elevation. Spoofing detectors look for exactly that.
- A jammed A321 went from 8 tracked satellites to 1 in about 15 minutes at 450 kt (Felux et al., NAVIGATION 71(3),
  2024).

Sources: [OPSGROUP GPS spoofing update, 2023-11-08](https://ops.group/blog/gps-spoofing-update-08nov2023/);
[UT Radionavigation Lab, spoofing in the Middle East](https://radionavlab.ae.utexas.edu/gps-spoofing-affecting-civilians-in-the-middle-east/);
[Lo et al., GNSS spoofing in Russia 2023-2024](https://web.stanford.edu/group/scpnt/gpslab/pubs/papers/Lo_ION_ITM_2025_Russia_Spoofing.pdf);
[Wesson et al., power and distortion monitoring](https://arxiv.org/pdf/1702.06554);
[GPS World, detecting false signals with AGC](https://www.gpsworld.com/government/detecting-false-signals-automatic-gain-control-12804);
[Felux et al., jamming impacts on aviation](https://navi.ion.org/content/71/3/navi.657).

## Approaches considered

1. **A fake receiver beside the SDK's (chosen by the maintainer).** The SDK's `GPSSatComputer` keeps the real sky as
   today. A new part of our own models the fake satellites: a `GPSPredictionContext` at the false position and time
   gives the fake sky, our own acquisition times acquire the fake satellites, and the 8 channels are shared. The
   solution and STA 1 are built from the merged channels. Most new code, but every rule is ours and testable, and the
   SDK is touched only through the inhibits and the reachability wrapper that exist already.
2. **Fake signals laid over the SDK's own channels.** Each PRN carries a real and a fake signal and a channel locks onto
   the winner. Less code, but the SDK only ever assigns channels from the real sky at the true position: a fake
   satellite that is not up in the real sky could never be acquired, so capture would use only the few PRNs the two
   skies share, and STA 1 would show the real elevations. Rejected.
3. **A second SDK `GPSSatComputer` for the fake sky.** It reads `PLANE LATITUDE` itself and cannot share 8 channels with
   the first. Rejected.
4. **Our own receiver in place of the SDK's.** The most faithful, but it redoes the tested work of #62, #453, #467 and
   #468. Far beyond this issue. Rejected.

## The design

### Transmitters

A transmitter is a jammer or a spoofer. Each active failure (`gpsJamming`, `gpsSpoofing`) has at most one transmitter
at a time; with both failures active there are two independent transmitters, each with its own place and its own
replacement.

- **Place:** a latitude and longitude on the ground, at the ground level of the aircraft's surroundings, with an antenna
  mast of 100 ft (guess).
- **Power:** a number that, with the path loss, gives the transmitter's level at the aircraft. It is drawn at the
  transmitter's generation (see "Power").
- **Spoofer only:** the false position, the time shift and a clock offset (see "The fake signals").
- **Reference altitude:** the highest height above ground seen since the transmitter was generated, at least 10,000 ft.
  It is stored with the transmitter, so a power cycle or a new session does not forget a climb.

**The level at the aircraft,** in dB relative to the receiver's thermal noise floor:

```
J = power - 20 × log10(distance) - diffractionLoss(distance, heights) + antennaGainDb(direction of the transmitter)
```

- `distance` is the slant range; the horizontal range is enough for the loss term at these distances (builder's call).
- **The radio horizon** for the mast height `h_t` and the aircraft's height above ground `h_a`, both in feet:
  `d_h = 1.23 × (sqrt(h_t) + sqrt(h_a))` NM (4/3 earth radius). About 16 NM on the ground, 99 NM at 5,000 ft, 135 NM at
  10,000 ft, 242 NM at FL350.
  - **Decided at the final review (2026-11-08):** on the ground it is about 12 NM, not 16: 1.23 × sqrt(100) = 12.3 NM for
    the 100 ft mast and an aircraft at 0 ft above the ground, as the code computes.
- **The diffraction loss** is 0 within the horizon and rises steeply beyond it, so that a transmitter does not appear at
  a hard edge but comes in over a band of a few NM to a few tens of NM, depending on the altitude. Its exact form is the
  builder's (a simplification of the smooth-earth term of ITU-R P.526 is the obvious source); it must be continuous and
  increasing with the distance beyond the horizon.
- **The antenna gain toward the transmitter** uses the antenna curve of #467 (`GpsSignal.ts`): the gain in dB is
  `antennaCurveSnr(sin e_a) - ZENITH_SNR`, where `e_a` is the transmitter's elevation above the antenna's plane, from
  its azimuth and its (slightly negative) local elevation and the aircraft's heading, pitch and bank. In level flight
  the transmitter is below the antenna's plane and gets the floor, -25 dB. **Banking toward the transmitter raises it,
  banking away lowers it.** `antennaSinElevation` returns -1 for anything below the local horizon (the earth blocks a
  satellite); a ground transmitter below the local horizon is not blocked, so it needs a variant without that rule.
  - **Decided at the final review (2026-11-08):** the satellite curve's floor at the antenna's plane is wrong for a
    ground transmitter. Real top-mounted L1 antennas are about 8 to 11 dB under the zenith at the horizon (the minimum
    gains of RTCA DO-301 and ICAO Annex 10: -7 dBic at 0 degrees, -5.5 at 5, -4 at 10, against +2 to +4 at the zenith)
    and roll off gradually below it toward the -20 to -25 dB of the EEC 337 measurements near the nadir. With the floor,
    a transmitter near the horizon was at -25 dB in level flight and a bank of 10 to 30 degrees toward it jumped 14 to
    21 dB. A gain of its own for a ground transmitter (`transmitterGainDb`): above the plane the curve's, but at least
    -12 dB; at and below it -12 dB less 0.5 dB per degree of depression, but at least -25 dB (both guesses). A bank of
    20 degrees toward a jammer now raises its level by about 6 to 8 dB (one or two satellites), and banking away lowers
    it. Near the nadir the floor remains, so a high aircraft is shielded from a transmitter it overflies.
- The height above ground is the sim's `PLANE ALT ABOVE GROUND`, read once per calculation tick (the tick-cost rule of
  CLAUDE.md). Height above ground rather than above sea level, so that a jet parked at a high airport gets the ground
  case.
  - **Decided at the final review (2026-11-08):** it is read, with `PLANE ALTITUDE` for the ground's elevation, only
    while a jamming or spoofing failure is in effect, so that with failures off the unit reads the SimVars it read
    before this design (anti-goals).

### Power

The power is drawn so that each kind behaves as reported:

- **Jammers are power-limited.** The power is drawn so that, in level flight and within line of sight, the distance at
  which the jamming takes the weakest typical satellite (a noise rise of about 7 dB, a satellite at SNR 37 dropping to
  30) is 100 to 250 NM (guess, from the issue). From there, the satellites go one by one as the distance shrinks, about
  a factor 2.8 in distance from the first to the last, which at realistic speeds is minutes to tens of minutes (the
  table in the issue comment). For a jet the horizon often limits first, so the jammer arrives over the diffraction band
  and then creeps.
  - **Decided at the final review (2026-11-08):** the factor 2.8 was wrong for the model. From the first loss (a rise of
    7 dB) to the last (a rise of about 21 dB, a satellite at SNR 51 dropping to 30) the level rises by about 14.9 dB,
    which the free-space spreading alone gives over a factor of about 5.6 in line-of-sight distance; with the floor gain
    the jet flight of the tests saw its first loss at 122 NM and its last at 27 NM. With the gain toward a ground
    transmitter (above, "Transmitters") the power is calibrated in level flight at FL350 (`CALIBRATION_AGL_FT`, our
    choice), in the line-of-sight geometry with the horizon left out, with the gain at the jammer's depression at the
    drawn distance, so the first-loss distance at FL350 stays as drawn within the horizon, and the placement and the
    leave edges, solved with the gain at each distance's depression, stay by the effect. Near the jammer the roll-off
    toward the nadir eats most of what the shorter distance gives: the same jet flight now loses its weakest satellite
    at 121 NM, the weak ones by 74 NM, and the strong ones only within about 10 NM, the last at 4.5 NM.
  - **Decided at the final review (2026-11-08):** the maintainer widened the draws to 100 to 600 NM (guess). With the
    gain toward a ground transmitter, a jet at FL350 flying at a jammer drawn at 100 to 250 NM kept its strong
    satellites until 10 NM from it or closer (one drawn at 150 NM took the fix about 7 NM out), while the reports
    (Baltic, Eastern Mediterranean, Felux et al. 2024) show a total loss over wide areas. A draw beyond the horizon of
    FL350 (about 242 NM) is taken as if in line of sight, which makes a strong jammer limited by the horizon: it takes
    its first satellites near the horizon and its last much farther out than a weak one. Measured in the headless unit,
    a jet at FL350 flying at a jammer drawn at 600 NM loses the first satellite at 245 NM, the fix at 146 NM and the
    last satellite at 113 NM; one drawn at 400 NM, the fix at 90 NM and the last at 63 NM; a prop at 8,000 ft loses
    every satellite within a few NM of its 122 NM horizon. On the ground a strong jammer within the ground horizon takes
    every satellite at once, as the weakest draw already did.
- **Spoofers are horizon-limited.** The power is drawn high enough that the real satellites are drowned (see "The fake
  signals") well beyond any radio horizon the aircraft can have (guess: capture would reach 300 to 600 NM within line of
  sight). The horizon and the diffraction band therefore decide where a spoofer takes effect: abruptly, in a short mixed
  phase, as crews report. At FL350 that is about 242 NM, in line with the reports of capture 200 to 250 NM from the false
  location.
  - **Decided at the final review (2026-11-08):** calibrated as the jammer is, in level flight at FL350 with the gain at
    the spoofer's depression at the drawn distance (the line-of-sight geometry, the horizon left out). Its edges move by
    under a NM.

### The noise floor and the real satellites

Every transmitter's level adds to the noise floor. With `J` the jammer's level and `F` the sum over the fake signals of
their levels (all as power ratios over the thermal noise, in the receiver's bandwidth), the noise rise is
`10 × log10(1 + J + F)` dB.

- A real satellite's SNR is today's (antenna curve, block offset, fade, jitter, #467) minus the noise rise. The rise
  takes the place of #460's `jammingDb`; the ramp (`rampS`, `finalDb`, `elapsedS`) and the wander
  (`JAMMING_WANDER_SIGMA_DB`, `JAMMING_WANDER_TAU_S`) go. The variation now comes from the antenna's attitude toward
  the transmitter and the satellites' own fades.
- The lock rule of #467 is unchanged: a tracked satellite is lost below 30, an untracked one is acquired at 35 or more.

### The fake signals

A spoofer is a GPS signal simulator for a receiver standing still at the **false position** at the **false time**.

- **The false position** is drawn at the spoofer's generation, 30 to 150 NM from the transmitter at a random bearing
  (guess; the issue measured it from the aircraft, but a broadcast spoofer shows every aircraft the same place, and the
  reports place it near the transmitter, as Tel Aviv and Ein Shemer are).
  - **Snapped to an airport** (maintainer, 2026-11-07), as crews report Tel Aviv and Beirut: a nearest-airport search
    of the sim's database around the drawn point, through `KLNFacilityLoader`'s nearest airport session and its
    extended filters, for a hard surface and a longest runway of at least 1500 m. The nearest match within a search
    radius of the drawn point (guess: 30 NM) gives the false position (its reference point) and the false altitude (its
    elevation). User waypoints (ICAO region `XX`, `XY`) are not candidates.
  - Without a match, the drawn point is used, at the ground elevation under the aircraft at the spoofer's generation
    (`PLANE ALTITUDE` minus `PLANE ALT ABOVE GROUND`; maintainer, 2026-11-07). The elevation of an arbitrary point is
    not known, and the ground under the aircraft is the closest estimate of the region's: sea level would put a spoofer
    near a high airport, Denver say, thousands of feet off.
  - The search is asynchronous. The spoofer sends nothing until it has resolved; at an in-flight placement nothing is
    noticeable there yet, and on the ground the delay is a fraction of a second. Its result is stored with the spoofer,
    so a session start does not search again.
    - **Decided at the final review (2026-11-08):** a search that never answers left the spoofer silent for good. One
    that has not answered after 30 s of sim time (guess) is given up for the drawn point at the ground elevation of the
    generation, and a late answer is ignored.
  - The tests pass a fake facility repository (`KLN90BPlatform`), as for the other navdata.
- **The time shift** is drawn at the generation, 2 to 12 hours, either sign (from the crew reports).
- **The spoofer's clock offset** is drawn at the generation, uniform within 1 ms (about 300 km of range). It is common
  to every fake signal, so it disappears into the receiver's clock once every satellite is fake, and it matters only in
  the mixed phase.
- **The fake sky** is a `GPSPredictionContext` at the false position and the false time. It gives the PRNs above the
  false position's horizon and their directions there. With a shift of hours it is largely another set of satellites.
  It is predicted again only when the false time has moved enough to change it (every few seconds of sim time, as the
  SDK moves its satellites every 5 s), never every tick.
- **Every fake signal arrives over the same path**, so each has the same level, the spoofer's level at the aircraft
  divided among the fake satellites (the builder chooses how the power is split; it is a constant per spoofer).
- **A fake satellite's SNR** is that level over the noise of the thermal floor, the jammer and **the other fake
  signals**: `S_fake - 10 × log10(1 + J + (n - 1) × f)`, with `f` one fake signal's level and `n` the fake signals
  present. The self-noise caps it: with 8 fake satellites the SNR levels off at about 51 to 54, uniform, so STA 1 shows
  a flat, high column (the builder checks the cap lands in that range with the receiver bandwidth chosen). The fake
  satellites get the receiver's estimate jitter as any satellite; a common fade on the spoofer's path is the builder's
  call.
  - **Decided at the final review (2026-11-08):** the "receiver bandwidth" of the fake SNR (60 dB-Hz) is physically the
    spectral separation of one C/A code from the noise of the others, as the fake signals are C/A codes on the same
    carrier (about 61.8 dB-Hz for C/A on C/A, Betz). The constant is named so (`SPECTRAL_SEPARATION_DBHZ`); its value
    is kept.
- **Line of sight:** a spoofer beyond its horizon and diffraction band sends nothing measurable.

The consequences need no rule:

- **Jamming and spoofing together:** the jammer's `J` lowers the fake satellites as it lowers the real ones. Near a
  strong spoofer and far from the jammer the unit is captured; near a strong jammer the fakes are drowned too and there
  is no fix; in between, a captured unit can lose its fake fix to the jammer and regain it.
- **Overpowering:** close in, `F` drowns every real satellite, which is why capture happens.

### The fake receiver and the shared channels

The unit has 8 channels (`channelCount` in `Gps.ts`). Each channel tracks one PRN, and the signal a channel locks onto
is either that PRN's real signal or that PRN's fake signal.

- **The belief** is the position the unit navigates on (`GPS.coords`) and its clock (`GPS.timeZulu`), not a
  captured/not-captured flag (our call). A mixed solution moves it like any solution.
- **What the receiver searches** comes from its belief: the PRNs its almanac puts in the sky at the believed position
  and time.
  - While the belief is near the truth, those are the PRNs the SDK assigns to channels.
  - Once the belief is near the false position and time (captured), they are the fake sky's PRNs, and fake PRNs that
    are not in the real sky get channels too.
  - After a sky search (see "Recovery") the receiver searches every PRN.
- **One symmetric search rule** (our call): a channel searching PRN X locks whichever signal of X, real or fake, is at
  35 or more and the stronger of the two. A channel already tracking a signal keeps it until the lock rule loses it: a
  tracking loop does not jump to another correlation peak. So real satellites can come back while the unit is captured,
  as fake ones can come in while it is not.
- **Shared PRNs.** Before a sky search, the fake signals the receiver can find are those of the PRNs that are up in both
  the believed (true) sky and the fake sky. How many there are depends on the time shift: with about 6 hours roughly a
  third of the visible satellites, with about 12 hours almost none (the satellites are back where they were in space and
  the earth has turned half a revolution under them). With few shared PRNs the drowned receiver has no fix and finds
  little, until its sky search finds the rest of the fake sky.
- **Acquisition of a fake satellite** takes the times of the start model and the SDK as for any satellite: a channel
  that searches a PRN the receiver's belief predicts correctly acquires it in the hot or warm time, otherwise in the
  idle or blind time (`GpsSearch.ts`). "Correctly" is judged against the fake signal's own truth (the false position and
  time): at a power cycle while captured, the stored false position and clock agree with the fake signals, so the fake
  satellites come back with a hot start, as the issue decided.
  - **Decided during implementation (2026-11-07):** during an almanac search of the start model a fake satellite takes
    the almanac search's acquisition time (`ALMANAC_SEARCH_ACQUISITION`), as a real satellite does there; the sky
    search's blind time applies only to a sky search.
  - **Decided during implementation (2026-11-07):** the hot start on the fakes holds with REAL acquisition only. With
    FAST acquisition (the default, #468) a power-on writes the true state into the memory, so inside a spoofer a power
    cycle is no hot start on the fakes, and the capture after it, like that of a continued session, shows `POSITION
    DIFFERS FROM LAST POSITION BY >2NM` (see "Kept from the issue").
- **A fake satellite is lost** by the lock rule like any satellite (below 30 while tracked).
- **Never more than 8.** A channel that tracks a fake satellite is not available to the SDK. The mechanism is the
  builder's; the constraints are that the SDK stays untouched except through the inhibits and the reachability wrapper
  that exist already (`GpsSearch.applyInhibits`, `KLNGPSSatComputer.wrapReachability`), that the SDK's channel count
  is fixed at its construction, and that STA 1 shows exactly 8 channels. This is the largest technical risk of the
  design; **the builder spikes it first** (a throwaway prototype that shows a fake satellite taking a channel and
  releasing it) before the plan's later tasks build on it.
  - **Decided during implementation (2026-11-07):** a real satellite that the SDK timed out to `Unreachable` while it
    sat in a channel a fake satellite claimed is made searchable again once the claim is gone and its own signal is not
    lost (`FakeReceiver.freeHeld`, `forgetUnreachableSatellite`). The real receiver never searched it there; without
    this the SDK would keep a healthy satellite out of its channel assignment for an hour. A claim never leaves a real
    satellite `Unreachable`.
- **Decided during implementation (2026-11-07): a receiver failure silences the fake receiver too.** No signal reaches a
  dead antenna or receiver (`gpsAntenna`, `gpsReceiver`), so the fake satellites get no level: no fake satellite claims
  a channel and no fake row enters the solution while the receiver has failed.
- **The fallback: our own copy of the SDK's receiver** (maintainer, 2026-11-07). If the spike shows the SDK inadequate,
  needing too many workarounds, the GPS computer code (`GPSSat.ts` of the SDK) is taken into the project and modified
  as needed. The SDK is MIT-licensed with an MSFS-only addendum, so the copy keeps its license notice. Only then, not
  preemptively: the builder reports the spike's finding before taking that step.

### The solution

Every satellite a channel tracks and holds in use is a row of the solution, real or fake, in the order the receiver
holds them. `computeGeometry` already builds the rows `G` (line of sight and clock) and `C = (GᵀG)⁻¹`.

- **Two claimed states.** Each signal claims a receiver state: a real signal the true position and time, a fake signal
  the false position (on the ground there) and the false time plus the spoofer's clock offset.
  - **Decided at the final review (2026-11-08):** a fake signal also travels the spoofer's own path, the slant range
    from the spoofer to the aircraft, on top of the range it claims, so every fake row's claimed range includes it, and
    so does the false state that the fake rows define. It is common to every fake row: captured, it goes into the clock
    (at most a few ms) and the ground speed stays 0; in the mixed phase the aircraft's speed toward the spoofer enters
    the velocity error. Its rate is its own (below, "The velocity error"), its change since the last update.
- **The reference state** of a solution is the state claimed by most of its satellite rows, the true one on a tie (our
  call). Rows that claim it carry no range error; the others carry the error `b_i` below. The solution is the
  reference state moved by `-C·Gᵀ·b`, a least-squares fit linearized about it. Its errors of up to a few km against
  the exact fit are far below what the mixed phase moves the position by.
- **A row's line of sight** is the direction of that PRN from the reference state: in the real sky (the SDK's position)
  when the reference is the true state, in the fake sky at the false position when it is the false state.
- **A row's range error** is the range its signal claims minus the range from the reference state, less the whole
  milliseconds the receiver resolved for the row. It resolves them when the row enters the solution, placing the row's
  code phase within ±0.5 ms (±150 km) of the range the reference state predicts, as it knows its clock from the other
  satellites; and again when the reference state changes, as its time base changes then (refined while planning,
  2026-11-07: resolving against the reference state rather than the belief keeps a solution whose rows all claim one
  state exactly consistent). Between those moments the row is tracked continuously, so its error drifts with the
  difference between the claimed and the predicted range rates (a few hundred m/s for a fake row) and does not wrap. The range from an
  elevation follows from the orbit radius and the earth's radius; the builder computes it allocation-free. The faulty
  satellite's bias stays as #460 built it, on real rows.
  - **Decided at the final review (2026-11-08):** the resolution of the whole milliseconds against the reference state
    is an explicit receiver assumption: a receiver that resolves its code phases from its own time and position (coarse
    time) places a row within half a millisecond of the range it predicts. A receiver that took the transmit time from
    the decoded time of week would instead reject such a row.
- **The altitude row.** With an altitude input (NAV A, 5-29) the altitude is a row of the solution, as today. The fake
  signals describe a receiver on the ground at the false position, so the altitude input disagrees with them by the
  aircraft's height above that ground (about 10 km at FL350, against the altitude row's 30 m). The altitude row's error
  is the difference between the altitude input and the reference state's altitude (the true altitude for the true
  state, the false altitude for the false state). It is treated as any row's error: it moves the solution
  (mostly vertically) and enters the residual test (maintainer, 2026-11-07: the realistic outcome).
- **The position error** is `-C·Gᵀ·b` (north and east from the coefficients `computeGeometry` writes), added to the
  measurement as `FailingMeasurement` adds the faulty satellite's bias today, now over every row with an error. When the
  reference state is the true state, the measurement strategy (`GpsMeasurement`) still gives its position as today;
  when it is the false state, the false position takes its place.
- **The velocity error** follows in the same way from the range-rate errors `ḃ`: fake rows carry the fake Doppler of a
  receiver standing still, real rows the true Doppler. When the reference state is the true state, the true velocity is
  moved by the fake rows; when it is the false state, a velocity of 0 is moved by the real rows. The ground speed and
  the track come from that velocity.
  - **Decided during implementation (2026-11-07):** the range-rate error of a row is the rate of its claimed range
    minus the rate of the range from the reference state, each rate taken from that range's own steps and held between
    them, not the change of the row's error from one tick to the next. The SDK and the fake sky move their satellites
    in 5 s steps that are out of phase, so the difference between ticks spiked at one step and was 0 at the others.
- **The clock** of a solution is the reference state's time, moved by the clock component of `C·Gᵀ·b` (under a
  millisecond). So the unit takes the false time once most rows are fake, and the true time back once most are real.
- **Every row from one state:** the solution is exactly that state. Every row fake (captured): the false position,
  ground speed 0, no track change, the false time. Every row real: the true state, as today. The EPE comes from the
  geometry of the rows. Without an altitude input the fake rows are consistent and RAIM sees nothing; with one, the
  altitude row disagrees and RAIM detects it (see "RAIM detection").
- **The receiver gives up on nothing.** No residual-scaled EPE and no gross residual limit (maintainer, 2026-11-07,
  option A: the receiver was built for selective availability, not spoofing). The EPE stays geometry-only, as today.

### RAIM detection

RAIM detects a bad range from the **residuals** `r = b - G·(C·Gᵀ·b)` of the solution, as a real receiver's RAIM does,
with a test statistic against a threshold for the redundancy (the builder picks the statistic and the threshold, for
example the sum of squared residuals in units of `SIGMA_UERE_M` against a chi-square bound; guess).

- While RAIM is available (`raimStatus`, at least 5 measurements) and the test fails, `RAIM POSITION ERROR` /
  `CROSS CHECK POSITION` shows (B-3), with the consequences #460 gave the faulty satellite: `L:KLN90B_IntegrityWarn`,
  approach active cannot be entered, in approach active the NAV flag and `PRESS GPS APR FOR NAV`.
- With 4 measurements there is no RAIM, and the wrong position goes undetected.
- **Captured with an altitude input:** the altitude row disagrees with the fake rows, so while RAIM is available a
  captured unit in flight shows `RAIM POSITION ERROR` for as long as it is captured. Without an altitude input, and on
  the ground near the spoofer, RAIM sees nothing. This overturns the issue's "RAIM sees nothing" for NAV A installations
  (maintainer, 2026-11-07).
  - **Decided at the final review (2026-11-08):** on the ground near the spoofer with an altitude input, RAIM sees
    nothing only while the false airport's elevation is within roughly 500 ft of the field's: the altitude input
    disagrees with the false altitude by the difference.
- **The faulty satellite uses the same test** in place of its threshold `FAULT_DETECTION_BIAS_M`, so that one rule
  detects every bad range. Its detection now depends on the geometry as it does in a real receiver. The `faultDetected`
  readers (`NavCalculator`, `ModeController`, `PersistentMessages`) read the one result.

### What the pilot sees

- **Jamming:** satellites go weakest first as the aircraft closes in; the EPE grows, RAIM is lost (`RAIM NOT AVAILABLE`
  emerges when RAIM stays lost for more than 10 s before the fix goes), then the fix goes. Turns toward the jammer make
  it worse. A descent below the jammer's horizon brings GPS back; a climb takes it away again.
- **Flying toward a spoofer:** at the horizon the real satellites lose SNR fast; in the mixed phase the position wanders
  by several to tens of NM with `RAIM POSITION ERROR` (silently with 4 measurements), the ground speed and track are
  wrong, and fixes come and go as the geometry changes. Then every real satellite is drowned. If the two skies share
  enough PRNs the fake satellites are acquired within a minute or two; with few shared PRNs the unit has no fix until
  its sky search (see "Recovery") finds the fake sky, 5 to about 15 minutes later. Then the unit is captured: the false
  position, ground speed 0, a normal EPE, a flat high SNR on STA 1, and `SYSTEM TIME UPDATED TO GPS TIME` from the time
  shift. With an altitude input it also shows `RAIM POSITION ERROR` while RAIM is available; without one, RAIM is fine.
- **Flying out of a spoofer:** the fake satellites fade below 30 and are lost. Real satellites of the PRNs the receiver
  searches (the fake sky's, from its false belief) can come back into a mixed phase, and with enough of them the true
  position returns directly. Otherwise the real satellites come back slowly (see "Recovery"). At the true fix the true
  time returns with `SYSTEM TIME UPDATED`.
- **Both:** whatever the levels give.

### Recovery

The start model (`GpsSearch`) exists because the SDK's receiver is omniscient: it always assigns the satellites that
are really up. The start model steps in where the real receiver would not know them. Today it runs only from a power-on
or a pilot's entry. Two rules extend it to a loss of the fix in flight; neither is a spoofing rule.

- **A far-off belief.** When the unit loses its fix while its belief is far from the truth of the real sky (its clock
  off by more than the start model's 10 minutes, or its position beyond the SDK's 100 NM, the limits `GpsSearch`
  already uses), the receiver starts its search again from that belief, as at a power-on: `GpsSearch.start` with the
  believed position and clock. The start model then finds what it finds at a power-on with such a memory: the predicted
  satellites are not there, and after its give-up time it searches the sky. That is the slow recovery after a spoofer.
  Within those limits a loss of the fix reacquires as today.
- **No fix for 5 minutes.** When the unit has had no fix for the start model's give-up time (`GIVE_UP_TIME`, 5 minutes,
  IM 2-66) and the satellites it predicts are not there, the receiver gives up on its prediction and searches the whole
  sky, as the start model already does after a power-on (3-17: at most 12 minutes). This is how a receiver drowned by a
  spoofer whose sky shares few PRNs with the believed one finds the fake sky (maintainer, 2026-11-07). It also applies
  after a long loss to jamming or an antenna failure, whose recovery may then take longer, which is plausible for the
  real unit. Without a failure it does not happen in flight.
  - **Decided during implementation (2026-11-07):** the lost-fix sky search first makes the satellites the SDK had
    marked `Unreachable` searchable again (`KLNGPSSatComputer.forgetUnreachable`, public SDK API only). The SDK leaves
    such a satellite out of its channel assignment for an hour, also one whose signal the receiver lost although it is
    up; a sky search searches every PRN. The rule applies on the ground too.
  - **Decided at the final review (2026-11-08):** the lost-fix sky search keeps the receiver's belief. A jammed
    receiver's clock and position stay right; erasing the SDK's last known position and using the blind time for every
    satellite brought the fix back 50 s to 12 minutes after four satellites were back, where Felux et al. (NAVIGATION
    71(3), 2024) show an A321 back about 2 minutes after the interference ended, on its own. The sky search searches
    every PRN with no inhibit of its choice, but the SDK keeps its last known position, its almanac and the idle and hot
    acquisition times. The SDK's own channel handling needs two more steps there: it gives up on a satellite it searched
    in vain for 4 minutes for an hour, and fills a channel it has nothing in view for with satellites in PRN order,
    below the horizon too. So during this sky search the Unreachable marks are forgotten in every tick, and a satellite
    below the horizon in a channel (the SDK's geometric line of sight standing in for the receiver's almanac at a belief
    this close to the truth) is inhibited until the SDK has taken it out of the channels. The fix now returns about
    40 s after four satellites are back (the idle acquisition time). STA 1 still shows INIT. The fake receiver keeps its
    blind time in a sky search, so the capture by a spoofer whose sky shares few PRNs with the believed one still takes
    its 5 to 15 minutes; the far-off belief still restarts the start model, and the power-on sky search is unchanged.

### Placement

The effect of a transmitter at a place and an altitude is measured by one quantity:

- for a jammer, the noise rise of its `J` alone;
- for a spoofer, whether its fake signals would reach the acquisition threshold (fake SNR 35).

The **edge** of a transmitter at a height above ground is the horizontal distance at which that quantity just reaches a
small threshold (guess: a 1 dB noise rise for a jammer; fake SNR 35 for a spoofer), with the path loss, the horizon and
the diffraction band, in level flight. The builder solves it numerically once per use (a bisection is fine); it is not
a per-tick cost.

- **Failure switched on while on the ground** (the sim's on-ground flag): the transmitter is placed 2 to 15 NM away at
  a random bearing (guess for the lower bound; the maintainer set "under 15 NM"). The effect is there at once: a jammer
  takes the satellites within seconds; a spoofer drowns the real satellites at once, and the receiver acquires the fake
  ones within a minute or two when the skies share enough PRNs, otherwise after its sky search (see "Recovery").
  - **Decided during implementation (2026-11-07):** the distance is drawn from 2 NM to the smaller of 15 NM and the
    ground radio horizon (about 12 NM for the 100 ft mast and an aircraft on the ground). Beyond the horizon, at up to
    15 NM, the diffraction loss weakened the effect, against "the effect is there at once", and kept the transmitter
    out of the line of sight the design assumes there.
- **Failure switched on in flight, and every new transmitter:** the transmitter is placed just inside the edge at the
  **present** height above ground, so that its effect is not yet noticeable and becomes so as the aircraft closes in:
  ahead on the aircraft's track, with a random offset of the bearing (guess: within ±30 degrees) and of the distance
  (guess: 90 to 100 % of the edge). Present height, not the reference altitude, so that a prop at 5,000 ft is not
  placed 36 NM beyond its own horizon.
  - **Decided during implementation (2026-11-07):** the distance is drawn by the effect, not as a share of the edge:
    between the edge at the present height in level flight (a jammer's noise rise of 1 dB, a spoofer's fake SNR of 35)
    and the distance of a slightly stronger effect (a noise rise of 3 dB, a fake SNR of 38; guesses). In the
    diffraction band beyond the radio horizon 10 % of the distance is tens of dB, so "90 to 100 % of the edge" made a new
    transmitter noticeable at once (a spoofer at FL350 placed at 90 % of its edge raised the noise floor by 22 dB, which
    drowns every real satellite).
- **On the ground with no track**, or below 2 kt (3-35), the bearing is random.
- **Leaving:** a transmitter is left once the horizontal distance exceeds its edge at the **reference altitude**
  (max(10,000 ft, the highest height above ground seen since its generation)). Then a new one is generated at once by
  the rules above. A descent below the horizon never generates a new one: the old transmitter comes back on the climb.
  - **Decided during implementation (2026-11-07):** a spoofer is left only once its fake SNR at the reference altitude
    would be below 25 (`LOCK_LOSS_SNR` − 5; guess), so that the lock rule has lost its fake satellites before it is
    replaced and the aircraft has fully left its range. At its edge (fake SNR 35) a captured unit would still track
    them. A jammer's leave edge stays its edge, the 1 dB noise rise.
- **A session start** with an active failure loads the stored transmitter; if the aircraft is beyond its edge at the
  reference altitude, a new one is generated by the rules above, so a session continued in the same area keeps its
  transmitter.
- **The repair** removes the transmitter at once. For a spoofer the fake satellites go at once and the unit recovers as
  when flying out.

### Kept from the issue

- **The general time check.** In every calculation tick with a fix, when the GPS time differs from the unit's clock by
  more than 10 minutes (B-4), `SYSTEM TIME UPDATED` / `TO GPS TIME` shows and `timeUpdatedEvent` is published. Today
  the check runs only in `GPS.gpsAcquired`. It also fires when the pilot changes the sim's time of day during a fix
  (accepted by the maintainer).
  - **Decided during implementation (2026-11-07):** the unit's clock runs on over a hot-swap disable as it does over a
    power-off (3-53): the first calculation tick after the disable adds the stopped sim time. Otherwise a disable of
    more than 10 minutes posted `SYSTEM TIME UPDATED` at the resume with failures off.
  - **Decided at the final review (2026-11-08):** a power-off while still disabled (the aircraft's electricity going
    away, as a disabled unit takes no input) adds the disabled time at the power-off; the power-on adds the off time as
    before. Before, the disabled time was lost from the clock.
- **The SDK's last known position** (`syncLastKnownPosition`) always gets the true position, also where `Gps.tick`
  syncs it today for a fix with three satellites and the altitude. A false position beyond 100 NM would send the SDK
  into a blind search.
  - **Decided during implementation (2026-11-07):** "always" holds while the unit has a fix: there `Gps.tick` never
    gives the SDK the false position. At a power-on the start model (`GpsSearch`, #62) gives the SDK the stored
    position, which is the false one after a capture, but only within 100 NM of the present position, so that #62's
    2 NM hot-start rule stays honest; beyond 100 NM it gives the present one. So the SDK never sees a position more
    than 100 NM off.
- **The stored position** is the false one while captured, as for any position the unit navigates on. A session
  continued with the same spoofer shows no `POSITION DIFFERS FROM LAST POSITION BY >2NM`; one with a new spoofer does.
  - **Decided at the final review (2026-11-08):** the hot reacquisition of the fake satellites (above, "Acquisition of a
    fake satellite") holds for a power cycle with REAL acquisition, not for a new session: the unit's clock starts from
    the sim's time (`E:ABSOLUTE TIME`) and the fake ephemeris is not stored.
- **Everything the unit outputs uses the position it navigates on**, the false or mixed one included, the GPS SimVars
  too.
- Take-home mode has no receiver failures (#460): jamming and spoofing do nothing there.
- FAST acquisition (#468) sets the memory to the true state at a power-on. Inside a spoofer's range that makes the
  receiver search the real sky's PRNs and meet their fake signals; whatever follows emerges from the rules above.
  - **Decided during implementation (2026-11-07):** with FAST, the default, a power cycle inside a spoofer is therefore
    not a hot start on the fakes, and a continued session shows `POSITION DIFFERS FROM LAST POSITION BY >2NM` at the
    capture: the stored false position is overwritten by the true one at the power-on. "A session continued with the
    same spoofer shows no `POSITION DIFFERS`" above holds with REAL acquisition only.

### Persistence

The values of an active failure are stored in its setting text (`Failures.values`/`setValues`, numbers only).

- `gpsJamming`: the transmitter's latitude and longitude, its power, and the reference altitude.
- `gpsSpoofing`: the same, plus the false latitude, longitude and altitude, the time shift and the clock offset.
- The reference altitude is saved when it grows, at most every few seconds of climb.
- Values that do not parse (a hand-edited profile) are drawn anew by the placement rules, as #460 does for unusable
  values. #460's jamming ramp was never released, so no stored ramp values need handling (maintainer, 2026-11-07).
- New keys only; `gpsSpoofing` is a new failure key (its setting is new).

### The catalog

`gpsSpoofing` is added to `kln90b/failures/FailureCatalog.ts`: FLR name `SPOOFING`, manual only (`random: false`), no
TEST FAIL, may always fail, as the table in `docs/failures.md` already lists it. (The issue assumed #460 had added it; it
did not.)

### Tick cost

- The fake sky's `predict()` only every few seconds of sim time, not every tick.
- The edge solve only at a generation and when the reference altitude grows.
- The per-tick work is a handful of transmitter levels, the fake satellites' SNRs (at most the fake sky's PRNs), and
  the range errors of the rows in the solution. Allocation-free in the hot path, as the rest of the receiver.
- The bar of CLAUDE.md holds: the worst case of one calculation tick's work, assumed 10× slower than Node on the
  maintainer's PC, stays well under 33 ms. The plan includes a throwaway benchmark.

## Testing

At the cheapest stage that can observe each behavior (CLAUDE.md, `test/README.md`):

- **Unit:** the path loss, the horizon and the diffraction loss (monotone, 0 within the horizon); the antenna gain toward
  a transmitter in level flight, banked toward and away; the noise rise; the fake SNR cap and its uniformity; the
  edge solve; placement on the ground, in flight ahead on the track, and with no track; the leave rule with the
  reference altitude (no new transmitter after a descent below the horizon); the persistence round trip and the
  redraw of unusable values; the range error's wrap and drift; the mixed solution's position error against a hand
  computation; the reference state (majority, tie); the whole milliseconds fixed at acquisition and the error's drift
  without a new wrap; the residual RAIM test for one bad row, several bad rows, an all-fake solution without an altitude
  row (nothing detected) and with one (detected); the faulty satellite under the new test; the shared PRNs of two skies
  for shifts of about 6 and 12 hours.
- **Flight:** flying into a jammer's range (satellites lost one by one, then the fix, the time scale against the issue
  comment's table) and descending below its horizon; flying into a spoofer (the real satellites drowned, the mixed
  phase with `RAIM POSITION ERROR`, capture with the false position, ground speed 0 and `SYSTEM TIME UPDATED`), once
  with many shared PRNs and once with few (capture only after the sky search); capture with and without an altitude
  input (`RAIM POSITION ERROR` only with it); flying out (slow recovery, the time message); a new transmitter ahead
  after leaving; jamming and spoofing together (the spoofer captured far from the jammer, no fix near it); a power cycle
  while captured (hot start on the fakes); a session started inside and outside the range; the repair of each; a total
  loss to jamming for over 5 minutes (the sky search, then the recovery after leaving the jammer).
- **Render:** STA 1 with the fake satellites, their flat SNR and their fake-sky elevations once captured; STA 1 in the
  mixed phase.
- **The general time check:** the message at a sim time jump during a fix, nothing at a normal tick.
- **Existing tests:** the jamming tests of #460 that pin the ramp are rewritten for the distance model; the faulty
  satellite tests are adjusted for the residual test. With failures off, the existing suite stays green, apart from what
  the decided exceptions in the anti-goals touch.
- **Sim, before release:** a spoofed KLN beside a Working Title GNS, which keeps its true position; a jammer approached
  in a jet and in a prop.

## Documentation

- `docs/failures.md`: the jamming and spoofing sections rewritten from this design; the catalog row for `gpsSpoofing`
  marked built; the persistence paragraph; item 2 of "What the code needs first" removed; the testing paragraph.
- `docs/architecture.md` and the GPS paragraph of `CLAUDE.md`: the transmitters, the fake receiver and the mixed
  solution, replacing "spoofing is #465".
- The wiki (the maintainer updates it): the failures page gets the spoofing scenario, the advice to practice jamming and
  spoofing without a second GPS unit to cross-check with, and what a pilot sees in each.

## Left to the builder

- The diffraction loss's form, the receiver bandwidth for the noise sums, and the split of a spoofer's power among its
  fake signals, within the requirements above.
- The mechanism by which a fake satellite takes and releases a channel (spiked first).
- The RAIM test statistic and threshold.
- Where the new code lives (for example a transmitter module and a fake-receiver module under `kln90b/failures/` or
  beside `GpsSignal.ts`), as long as the pure math stays importable without cycles, as `GpsSignal.ts` and
  `GpsSolution.ts` are.
- How the commits are split; per CLAUDE.md the implementation is one `fixes #465` commit, and design and plan commits
  `references #465`.
