# GPS signal loss, bad geometry and RAIM: design

Date: 2026-11-01. Issue: #453 (a precondition for the failures of #366). Branch: `issue-453-gps-signal-loss`.

## 1. Intent

#453 asks whether the unit behaves as the Pilot's Guide describes when the GPS solution degrades or is lost, and
whether it posts the right messages. Today the unit only raises the NAV flag when the SDK reports no solution. It
posts no message, never shows DEGRD, never checks integrity at the switch to approach active, and cannot navigate on
three satellites plus altitude (the todo in `Gps.isValid`). The failures of #366 (receiver and satellite failures) will
rely on this reaction being right.

The maintainer's decisions for this work:

- **Only the reaction.** No new causes of a loss are simulated: no bank-angle masking, no historic constellation, no
  jamming. The only loss the sim produces on its own is bad satellite geometry, and the tests create the rest by
  inhibiting satellites.
- **Modern error levels only.** The photographed unit runs a later host software (`01515-0047` on STA 3), which the
  maintainer assumes was patched for the end of Selective Availability (SA, switched off on 2 May 2000). The unit
  never models SA, whatever the sim date.
- **STA 2 is drawn as on that unit**, not as in the ORS 20 figure (5-30).
- **Own receiver model** (section 4), chosen over count rules and over overriding the SDK.

## 2. Evidence

**Pilot's Guide (ORS 20).**
- 5-29, 5-30: a position needs four satellites, or three with an altitude input; enough satellites do not guarantee a
  usable geometry. The STA 1 states are INIT, ACQ, TRAN, NAV, NAV A (altitude in the solution), NAV D, DEGRD (position
  degraded) and FAILR. STA 2 shows the estimated position error.
- 4-13: after a NAV flag the flight timer keeps running if the ground speed was above 30 kt (already modeled).
- 6-1, 6-3: the approach modes tighten the integrity monitoring. ACTV needs, besides the existing conditions, integrity
  predicted at the FAF and the MAP and RAIM available at that moment.
- 6-19, 6-20: RAIM predicted unavailable at the FAF or MAP inhibits ACTV with a message pointing to STA 5. A loss of
  integrity or a satellite failure on the FAF to MAP leg flags the navigation, a missed approach is flown, and the unit
  asks for GPS APR to get navigation back.
- Appendix B, the messages this design covers (paraphrased):
  - B-4 SATELLITE COVERAGE INADEQUATE FOR NAV: the signals are not adequate for navigation, because there are too few
    satellites (counting the altitude input) or the geometry cannot place the aircraft within 3.8 NM.
  - B-3 RAIM NOT AVAILABLE CROSS CHECK POSITION: too few signals to compute integrity.
  - B-1 BAD SATELLITE GEOMETRY SEE EPE ON STA 2 PAGE: follows a RAIM-not-available notice; the geometry allows a
    position error larger than IFR use permits.
  - B-1 BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE: only in approach active, RAIM unavailable and the geometry
    degraded further; a NAV flag may follow in a couple of minutes.
  - B-3 RAIM NOT AVAILABLE APR MODE INHIBITED PREDICT RAIM ON STA 5: integrity predicted unavailable at the FAF or MAP;
    ACTV is refused until conditions improve.
  - B-3 PRESS GPS APR FOR NAV: after a NAV flag caused by RAIM in the approach mode; GPS APR restores navigation for the
    missed approach.
  - B-1 ALTITUDE FAIL already exists; it notes that the altitude helps the integrity calculation.
- Installation Manual, Appendix C (C-6 to C-8), the message troubleshooting table:
  - Only Altitude Fail is tied to the configuration: an IFR-configured unit must have an altitude. That is why
    `AltitudeFailMessage` is off for `VFROnly`.
  - The RAIM entries (RAIM position error, RAIM not available, the approach-inhibit message) carry no such condition.
    Their causes are the receiver, a satellite, obstructions, satellites too low or too high for a usable geometry, or
    a loss of sensitivity.
  - So the RAIM and geometry messages apply to VFR-only units as well.
- Maintenance Manual, the acquisition test: the coverage counts as adequate when the STA 2 error is below .124 NM, and
  STA 1 must then show NAV or NAV D. This does not contradict the error model of 5.1.
- Out of scope, for #366: RAIM POSITION ERROR (a faulty satellite), NO RCVR DATA, RCVR HARDWARE ERROR, the FAILR state.

**Real units.**
- A real-unit video shows NAV A with all eight satellites in use (`docs/superpowers/plans/2026-10-11-gps-acquisition.md`).
  The unit puts the altitude into the solution whenever it has one, not only when satellites are missing. Today's NAV A
  rule stays.
- Two photos of a newer unit (local reference library, `gps search/kmem-iap-1.jpg` and `kmem-star-2.jpg`, host software
  `01515-0047` per `status-3.jpg`) show STA 2 as `0.00NM` and a little later `0.01NM`: a leading zero, two decimals
  and full-size `NM`. A second unit in the same panel, without a fix, shows five underscores before `NM`.

**The simulator.** Scans of the SDK `GPSSatComputer` with the unit's own ephemeris file, 8 channels, a whole week (the
SDK reduces time to the time of week, so a week covers every date) on a 5° grid at sea level:
- The solution is never lost from geometry alone. At least six satellites are always visible.
- Typical HDOP: median 0.94, 90 % between 0.87 and 1.10.
- The worst geometry is near 64.5°S 52°W. Flying the real computer there from 2026-11-05 01:20Z, a tracked satellite
  sets at 01:50:35Z, the HDOP jumps from 1.05 to 4.64 with six satellites in use, and it falls back to 1.67 about 50 s
  later when a rising satellite is acquired. The fix stays valid. The case repeats every week. A similar case lies at
  64.5°S 128.5°E on 2026-11-07 near 13:41Z.
- RAIM slopes for that case (section 5.2): the worst satellite's slope is 10.7 without the altitude and 4.4 with a full-weight altitude row (the σ_ALT weighting
  of 5.1 gives less help). A
  normal sky over KMEM gives about 0.8.
- At exactly 90°N the SDK reports no solution although 14 satellites are visible (a singularity of its local frame;
  89.999°N is fine). Not handled here.

**The avionics framework.** G3X Touch: accuracy = HDOP × 1.96 × 3.23 m. G3000: HFOM = HDOP × 35 ft, and EPU = PDOP ×
0.4 NM. The Garmin SDK halves the DOPs when SBAS is active, which the KLN does not have.

**Web search.** The MSFS Garmin losses users reported in 2024 (LOI, "3 satellites then 2") came on long flights and were
fixed in Sim Update 15 ("GPS signal could degrade inappropriately during long flight sessions"). None was tied to
geometry.

## 3. Goals, non-goals, anti-goals

**Goals**
- The unit's own position solution: valid with four satellites, or with three plus the altitude input.
- A realistic estimated position error on STA 2, drawn as on the photographed unit.
- RAIM availability per flight phase, and the messages, states and approach behavior of section 2 built on it.
- STA 5 predicts with the same RAIM criterion.
- Tests that create every case: the bad-geometry case from the real constellation, and losses by inhibiting satellites.

**Non-goals**
- New causes of a loss (masking, jamming, failures). #366 and later issues add them.
- A fuzzy position (#402). The position stays the exact sim position whenever the solution is valid.
- The 90°N singularity of the SDK.
- POSITION DIFFERS FROM LAST POSITION BY >2NM after an in-flight reacquisition: that is #454, fixed on its own.

**Anti-goals**
- Hooking further into private SDK internals. The model reads only what `Gps.ts` and `GpsSearch.ts` already read
  (satellite states, positions, channels).
- Messages that flicker. A message that comes and goes every second because a satellite drops in and out for a moment is
  worse than none.
- A noticeable tick cost (CLAUDE.md "Tick cost is the sim's frame time").

## 4. Approaches

1. **Own receiver model (chosen).** A small module computes the unit's solution from the SDK's usable satellites, with
   the altitude as an extra measurement. It gives validity, HDOP, the error estimate and RAIM; everything else reads
   it. It covers every goal, ties the thresholds to the manual's limits, and leaves the SDK alone.
2. **Count rules only.** The SDK's solution stays the truth, RAIM is "five or more satellites, or four plus altitude",
   and bad geometry is the SDK's HDOP over a picked threshold. Cheaper, but three satellites plus altitude cannot work
   (the SDK needs four), and the thresholds would be arbitrary.
3. **Teach the SDK three satellites plus altitude** by overriding its private satellite selection. Rejected: it hooks a
   private SDK class, breaks on SDK upgrades, and still leaves RAIM to be built.

The SDK keeps everything it does today: the orbits (every 5 s, the `updateInterval` of `Gps.ts`), each satellite's
states, the channel assignment and its in-use marking (the `*` on STA 1). The only overlap is the 4×4 matrix the SDK
also inverts for its DOPs. With three usable satellites the SDK still marks them in use and only reports PDOP −1,
which is what lets the model add the altitude without touching the SDK.

## 5. Design

### 5.1 The receiver solution

A new module (name left to the builder, for example `kln90b/GpsSolution.ts`), owned by `GPS`.

- **Inputs.** The satellites the SDK has in use (`InUse`, `InUseDiffApplied`) and their line of sight from
  `position.get()` (zenith, azimuth; the same unit vectors as the SDK's `getLosMatrix`). The altitude input is present
  when `sensors.in.airdata.pressureAltitude` is not null.
- **Measurements.** Each satellite is one row `[x, y, z, 1]`, weighted 1 (σ_UERE). The altitude is one extra row
  `[0, 0, 1, 0]`, weighted σ_UERE / σ_ALT.
- **Error levels (my call).**
  - σ_UERE = 5 m: the textbook ranging error of a single-frequency receiver without SA. It reproduces the photos (see
    the error estimate below).
  - σ_ALT = 30 m: an encoder that reports in 100 ft steps (the gray code of `Sensors.ts`) plus the error of the
    altimeter setting.
- **Validity.** The weighted 4×4 normal matrix is invertible with at least four rows, of which at least three are
  satellites. So there are four satellites, or three plus the altitude. The solution is also invalid when the error
  estimate exceeds 3.8 NM (B-4). `GPS.isValid()`, the TRAN acceptance in `GPS.tick` and `acceptForcedSolution` use this
  validity instead of `hasSdkSolution()`.
- **Outputs.** `valid`, `hdop` (from the covariance, in units of σ_UERE), `epeNm`, the satellite count, whether the
  altitude is in use, and the RAIM result of 5.2.
- **Error estimate (EPE).** `EPE = 2 × HDOP × σ_UERE`, a 95 % figure, in NM. At HDOP 0.93 that is 0.005 NM, the rounding
  edge between `0.00` and `0.01`. The typical HDOP straddles it, as the photos show, and the bad-geometry case shows
  `0.03`. The framework's formulas fit worse: G3X Touch would almost always show `0.00`, G3000 almost always `0.01`.
- **Cost.** Recompute only when the set of satellites in use, their positions (every 5 s) or the altitude presence
  change; otherwise reuse the last result. One computation inverts a 4×4 matrix and forms the slopes over at most nine
  rows. Reuse arrays, as the SDK's geo classes do. Measure once with a throwaway benchmark (CLAUDE.md).
- **Keeping the SDK's search on track (my call).** While the model is valid and the SDK has no solution of its own
  (three satellites plus the altitude), `GPS.tick` passes the fix to `gpsSatComputer.syncLastKnownPosition`, a public
  method `GpsSearch` already uses. Without it the SDK's last known position stays where its own solution ended:
  - beyond 2 NM, a rising satellite is acquired without the hot timing;
  - beyond 100 NM, its line-of-sight filter drops every satellite without ephemeris, and the unit might never get
    back to four.

  A flight test recovers from three plus altitude after a long leg.
- **Check against the SDK.** Without the altitude row and with four or more satellites, the model's HDOP equals the
  SDK's `hdop` (verified for the bad case: both 4.58). A unit test holds this.

### 5.2 RAIM

- **Availability.** RAIM needs at least five measurements, the altitude counting as one, and a protection level within
  the alert limit of the flight phase.
- **Protection level.** The slope method: `HPL = max slope × σ_UERE × K`.
  - Slope of measurement i: `sqrt(H₀ᵢ² + H₁ᵢ²) / sqrt(Sᵢᵢ)`, with `H = (GᵀWG)⁻¹GᵀW` and `S = I − GH`.
  - K ≈ 5.3, a missed-detection probability of 0.001 (my call).
  - At modern error levels this is about 285 m in the bad-geometry case without altitude: inside every limit.
- **Alert limits by mode** (TSO-C129 values, my call):
  - ENR-LEG and ENR-OBS: 2 NM.
  - ARM: 1 NM.
  - APR ACTV: 0.3 NM.
- **Two causes the messages tell apart:**
  - too few measurements;
  - enough measurements, but the protection level exceeds the limit (geometry).

### 5.3 STA 1 and STA 2

- **STA 1 state line** (`Sta1Page.stateText`):
  - NAV, NAV A and NAV D as today, but driven by the model. NAV A shows whenever the altitude is in the solution.
  - New: **DEGRD** while the solution is valid but RAIM is unavailable for geometry (5.2). My call, low confidence: the
    manual gives only the name.
  - FAILR belongs to #366.
- **STA 2**, line 3, field five characters wide and right-aligned so that `NM` ends in the last column:
  - With a fix: `0.00NM` style, `d.dd` with full-size `NM`. The field never needs more, since the solution is invalid
    above 3.8 NM.
  - Without a fix: `_____NM`.
  - The builder checks the exact columns against the two photos (the maintainer has them) and that the font has the
    underscore glyph.
  - The page comment cites the photos and why they win over the 5-30 figure (section 1).

### 5.4 Messages

All are condition-driven persistent messages (`data/PersistentMessages.ts`), so they leave the MSG page when their
condition ends. The comment there saying RAIM messages are missing is updated. They apply to every installation,
VFR-only included: the Installation Manual ties only ALTITUDE FAIL to the IFR configuration (section 2).

- **Debounce (my call).** A condition must hold for a short time before its message posts, so that a satellite
  dropping in and out does not flicker (anti-goal). The project's `SustainedCondition` fits. Suggested: 10 s for the
  RAIM and geometry messages. SATELLITE COVERAGE INADEQUATE FOR NAV comes at once, together with the NAV flag it
  explains.
- **The table (my call where the manual is vague):**

  | Message | Condition |
  | --- | --- |
  | SATELLITE COVERAGE INADEQUATE FOR NAV | The solution is invalid after the unit had NAV since the last power-on. Not during the start-up search, where STA 1 already says INIT/ACQ |
  | RAIM NOT AVAILABLE CROSS CHECK POSITION | Valid solution, mode not APR ACTV, RAIM unavailable for either cause |
  | BAD SATELLITE GEOMETRY SEE EPE ON STA 2 PAGE | As above, and the cause is geometry. It follows the RAIM message, as B-1 says |
  | BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE | APR ACTV and RAIM unavailable for the 0.3 NM limit |
  | RAIM NOT AVAILABLE APR MODE INHIBITED PREDICT RAIM ON STA 5 | The last ACTV check refused the switch for integrity (5.5), and the gate is still checking: ARM, the FAF active, within 2 NM. It leaves once ACTV succeeds, the unit leaves ARM, or the gate stops checking (my call) |
  | PRESS GPS APR FOR NAV | The integrity flag of 5.5 is set. It leaves when the flag clears, however that happens |

### 5.5 Approach mode

- **The ACTV gate** (`ModeController.checkSwitchAprArmToActive`, which has an `//Integrity check?` placeholder). After
  the existing checks, ACTV also needs:
  - RAIM available now for the 0.3 NM limit;
  - RAIM predicted available for the 0.3 NM limit at the FAF and at the MAP, each at its ETA, through `raimPrediction`.
    These two predictions run once at the 2 NM point, not every tick.

  If either fails, the unit stays in ARM and posts the inhibit message. It retries on later ticks while still inside
  2 NM (6-20: "until conditions improve"). The retry rate is the builder's call; a prediction costs about 0.04 ms.
- **The integrity flag.** A new field in `VolatileMemory.navPage`, reset at power-on like the rest.
  - It is set in APR ACTV when RAIM has been unavailable for the 0.3 NM limit for 2 minutes (B-1's "a couple of
    minutes"; my call, low confidence), and immediately when the solution itself is lost.
  - While it is set, `NavCalculator` flags the navigation values as it does for an invalid position. The position, the
    ground speed and the nearest pages stay valid.
  - It is cleared when the mode leaves APR ACTV: GPS APR (which already goes to ARM, 6-20), Direct To, OBS.
- **STA 5** uses the RAIM criterion of 5.2 with the 0.3 NM limit, and the altitude row when the unit has an altitude
  input, instead of "a solution exists" (`Sta5Page.calculateRaim`).

### 5.6 Tests

At the cheapest stage that observes each behavior (CLAUDE.md):

- **Unit.** The solution math on fixed geometries with literal expectations, derived independently of the module:
  - the HDOP of a known constellation;
  - the three-plus-altitude case;
  - the singular case;
  - the slopes;
  - the model's HDOP equals the SDK's for the same satellites without the altitude.
- **Render: STA 2.** The `0.00NM` / `0.01NM` / `_____NM` lines.
- **Render: STA 1.**
  - NAV A with three satellites and an altitude: inhibit all but three.
  - INIT/ACQ, not NAV, with three and no altitude.
  - DEGRD in a geometry-limited case.
- **Render: the bad-geometry case.** Boot at 64.5°S 52°W at a fixed date (weekly repeat), fly through 01:50:35Z, and
  assert the HDOP jump and what it does and does not post. Prefer a literal start such as 2026-11-05T01:20:00Z, and
  note the weekly repeat in the test. This depends on the ephemeris file; a changed file must fail the test loudly.
- **Render: messages.** Each message of 5.4 appears and leaves with its condition, and the debounce holds (a 3 s drop
  posts nothing). Losses are created with `gpsSatComputer.setSatelliteInhibit`. Whether `raimPrediction` follows the
  parent's inhibits (`syncSatelliteInhibitWithParent`) decides how the STA 5 and ACTV tests inhibit; the builder
  checks.
- **Flight.** On an approach:
  - ACTV refused at 2 NM with the inhibit message when the prediction fails.
  - Starting ACTV, a RAIM loss produces the geometry message, then after the delay the flag and PRESS GPS APR FOR NAV.
  - GPS APR gives ARM with navigation back.

### 5.7 Docs

- `docs/architecture.md`: the GPS section and the STA 1 state line (NAV A, DEGRD).
- `test/README.md` if new harness helpers appear (for example a helper to inhibit all but N satellites).
- The public contract (CLAUDE.md) is unchanged: no H event, LVar, panel.xml key or persisted format changes. The GPS
  SimVars follow the NAV flag as today.

## 6. Left to the builder

- Module and helper names, and where the solution is cached.
- The exact debounce times within the bounds above, and the ACTV retry rate.
- The exact STA 2 columns, from the photos.
- Whether DEGRD also shows while the integrity flag is set (no evidence either way; keep it simple).
- The order of the commits on the branch; #453 ends in one `fixes #453` commit (CLAUDE.md, one commit per issue).
