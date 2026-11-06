# Satellite Signal (#467) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every GPS satellite its own SNR from physical causes (antenna tilt, transmit power by block, fade,
estimate jitter, minus jamming) and make losing a satellite to a weak signal the receiver's normal behavior, with jamming
only lowering the signal.

**Architecture:** `kln90b/GpsSignal.ts` becomes the signal model: pure functions plus a `SatelliteSignals` service ticked
by `GPS.tick`. Its lost flag reaches the SDK through each satellite's reachability (a wrapper around
`GPSSatellite.updateState`), never through inhibits. The block of each PRN comes from `gps_ephemeris.json`, which the
build now generates from committed RINEX and IGS metadata sources.

**Tech Stack:** TypeScript (es2017 target for the instrument), `@microsoft/msfs-sdk` GPSSatComputer, Vitest (unit,
render, flight), rollup, Node 26 type stripping for the build-time generator.

**Spec:** `docs/superpowers/specs/2026-11-06-satellite-signal-design.md` (approved 2026-11-06). Read it first; this plan
argues from it and does not repeat its reasons.

## Global Constraints

- Work on branch `467-satellite-signal`. **No commits until Task 7**: the whole change is one `fixes #467` commit
  (CLAUDE.md: one commit per issue), with the spec and this plan in it. Never `git push`.
- Instrument code targets es2017 (Coherent GT); no newer runtime features in `kln90b/`.
- The signal tick allocates nothing: typed arrays, index loops, no closures or arrays per call (`countAllocations` in
  `test/harness/allocation.ts` checks it).
- No new panel.xml key, LVar, H event, setting or storage key.
- Constants: `ZENITH_SNR = 50`, `SLOPE = 12`, `BACKLOBE_SNR = 25`, `LOCK_LOSS_SNR = 30`, `ACQUIRE_SNR = 35`; fade sigma in
  flight `0.3 + 0.9 × (1 − clamp(e_a/45°))`, tau 20 s; on the ground `0.5 + 1.5 × (1 − clamp(e_a/45°))`, tau 120 s;
  jitter sigma `min(1.5, 0.15 × 10^((45 − s)/20))`.
- Block offsets (dB): `GPS-IIF` +1.0, `GPS-IIR-M` +0.5, `GPS-IIR-B` 0, `GPS-IIR-A` −1.0, `GPS-IIIA` −1.5 at a local
  elevation ≤ 30°, linear to −4.0 at ≥ 50°. Unknown or missing block: 0.
- MSFS signs: `PLANE BANK DEGREES` positive = left, `PLANE PITCH DEGREES` positive = nose down. The model's attitude is
  bank right positive, pitch up positive.
- The generator files are `.mts`, self-contained (no relative imports between them), erasable TypeScript only (no
  enums, no parameter properties, no namespaces), because `rollup.config.mjs` loads them through Node's type stripping.
- Comments cite the Installation Manual (2-1, C-7), the Pilot's Guide (5-29, 5-30) and the papers in the spec, in our
  own words. American English. No counts in prose for things that grow (user CLAUDE.md).
- Tests verify by mutation in review (user CLAUDE.md); do not name planned mutations to implementers.

## Review Focus

1. **A satellite straight overhead or with a NaN angle (#456)**: the SDK can give a NaN hour angle; the SNR must be a
   number (the floor), never NaN, and STA 1 must not show `NaN`. Test in Task 3.
2. **A paused sim or a sim-clock jump**: no fade step and no jitter draw when `dt` is 0, negative or larger than
   `MAX_TRIGGER_STEP_S`; STA 1 holds still while paused. Test in Task 4.
3. **A power cycle while satellites are lost**: `reset()` clears the lost set and the fades, and the unit reacquires.
   Test in Task 4 (unit) and Task 5 (render, a power cycle under a stored finished jamming ramp then repaired).
4. **A satellite without a block** (an SBAS entry, a PRN missing from the metadata): offset 0, no throw in the
   instrument; the generator, by contrast, throws. Tests in Tasks 1 and 3.
5. **The engine-running boot's forced acquisition before any signal tick**: the lost set must be computed (level antenna
   in tests, the stored jamming level) before the SDK forces satellites into use. Test in Task 5.

---

### Task 0: Baseline measurement of jamming (throwaway)

Before any code change, measure what the issue complains about, so Task 6 can report before and after.

**Files:**
- Create (temporary, deleted at the end of this task): `test/render/failures/JammingBaseline.tmp.test.ts`

- [ ] **Step 1: Write the measurement** using the `jammedFlight()` setup of `test/render/failures/GpsJamming.test.ts`
  (copy the helper; ramp 240 s to 26 dB, wander at its default). For seeds 1 to 5 (`bootUnit({seed})`), step one
  calculation tick at a time for 300 s and record per second: satellites in the unit's solution, `raimStatus(gps.solution,
  halForMode(mode))`, `gps.isValid()`, and whether `RAIM NOT AVAILABLE CROSS CHECK POSITION` is on the MSG list. Log per
  seed: time of the first loss, time RAIM is first lost while the fix holds, time the fix is lost, the length of the
  RAIM-lost-with-fix window, whether the message appeared.
- [ ] **Step 2: Run it** with `KLN_TEST_LOG=1 npx vitest run --project render JammingBaseline` and save the table to
  `C:\Users\denni\AppData\Local\Temp\claude\06312e64377e4729\c1af4e01-e3c9-48b8-ac45-120fb94657a9\scratchpad\jamming-baseline.md`.
- [ ] **Step 3: Keep the file** for Task 6 (it reruns it), but do not commit it; Task 6 deletes it.

### Task 1: Ephemeris sources and generator

**Files:**
- Create: `ephemeris/brdc1820.22n` (copy of `E:\msfs\msfs-avionics-mirror\src\workingtitle-instruments-gns\html_ui\Assets\Data\gps_ephemeris.txt`, byte for byte)
- Create: `ephemeris/igs_satellite_metadata.snx` (from `https://files.igs.org/pub/station/general/igs_satellite_metadata.snx`, as published; a copy downloaded on 2026-11-06, release 2441, 277829 bytes, is in the scratchpad `igs/` folder)
- Create: `ephemeris/README.md`
- Create: `tools/ephemeris/ephemeris.mts`
- Create: `test/unit/tools/ephemeris.test.ts`
- Modify: `tsconfig.json` (`include` gains `"tools/**/*"`)

**Interfaces:**
- Produces (`tools/ephemeris/ephemeris.mts`):
  - `interface EphemerisEntry` — the fields of today's JSON entries (`epoch {year, month, day, hour, minute, second}`,
    `svClock {bias, drift, driftRate}`, `iodeIssueEphemeris`, `crs`, `deltaN`, `m0`, `cuc`, `eEccentricity`, `cus`,
    `sqrtA`, `toeTimeEphemeris`, `cic`, `omegaL`, `cis`, `i0`, `crc`, `omegaS`, `omegaLDot`, `idot`,
    `codesOnL2Channel`, `gpsWeekNumber`, `l2PDataFlag`, `svAccuracy`, `svHealth`, `tgd`, `iodeIssueClock`,
    `transmissionTimeOfMessage`) plus `block: string`.
  - `parseRinexNavigation(text: string): RinexRecord[]` with `RinexRecord = {prn: number, epoch: Date (UTC), entry: Omit<EphemerisEntry, 'block'>}`, in file order.
  - `parseSatelliteMetadata(text: string): SatelliteMetadata` with `SatelliteMetadata.blockOf(prn: number, at: Date): string` — throws when no SVN carried the PRN at that time, or the SVN has no block.
  - `buildEphemeris(rinexText: string, metadataText: string): Record<string, EphemerisEntry>` — first record per PRN in file order (the rule of today's file), keys are the PRN as a string, in ascending PRN order.
  - `serializeEphemeris(e: Record<string, EphemerisEntry>): string` — `JSON.stringify(e, null, 2)` plus a final newline.
  - `generateEphemerisJson(sourceDir: string): string` — reads the single `*.??n` file and `igs_satellite_metadata.snx` in `sourceDir`; throws unless there is exactly one RINEX file.
  - `export const EPHEMERIS_SOURCE_DIR = 'ephemeris'` (relative to the repo root).

**Format notes the signatures do not settle:**
- RINEX 2 navigation: header ends at the line containing `END OF HEADER`; then 8 lines per record. Line 1: PRN in
  columns 1–2, `yy mm dd hh mm ss.s` in 3–22 (yy < 80 → 2000+yy), then three 19-character fields (clock bias, drift,
  drift rate). Lines 2–8: four 19-character fields each from column 4 (fewer on the last line). Numbers use `D` as
  the exponent letter. Lines 2–8 map, in order, to: (iodeIssueEphemeris, crs, deltaN, m0), (cuc, eEccentricity, cus,
  sqrtA), (toeTimeEphemeris, cic, omegaL, cis), (i0, crc, omegaS, omegaLDot), (idot, codesOnL2Channel,
  gpsWeekNumber, l2PDataFlag), (svAccuracy, svHealth, tgd, iodeIssueClock), (transmissionTimeOfMessage). `epoch.year`
  stays the two-digit year as today's JSON has it; `epoch.second` is the truncated integer.
- SINEX: blocks run from `+NAME` to `-NAME`; data lines start with a space, comment lines with `*`. Split data lines on
  whitespace. `SATELLITE/IDENTIFIER`: `SVN COSPAR SatCat Block comment…`. `SATELLITE/PRN`: `SVN ValidFrom ValidTo PRN
  comment…`. Times are `YYYY:DOY:SSSSS`; `0000:000:00000` as ValidTo means open-ended. Use only SVNs and PRNs starting
  with `G`. Valid when `from <= at < to`.

- [ ] **Step 1: Copy the two source files and write the README.** The README cites the RINEX as the CDDIS daily GPS
  broadcast ephemeris `brdc1820.22n` (2022-07-01, day 182), obtained via the MSFS Avionics Framework repository, and
  acknowledges CDDIS; it attributes `igs_satellite_metadata.snx` to the International GNSS Service (IGS) and its
  contributing organizations (prepared by DLR; Steigenberger & Montenbruck, IGS Satellite Metadata File Description
  1.10, doi:10.57677/metadata-sinex), per the IGS Data and Product Disclaimer and Terms of Use of 5 August 2020. It says
  how to update: replace the RINEX file with one `brdcDDD0.YYn` (exactly one in the folder) and fetch a current SINEX
  when satellites were launched since; the build regenerates the JSON.
- [ ] **Step 2: Write the failing tests** in `test/unit/tools/ephemeris.test.ts` (import with the `.mjs` spelling:
  `'../../../tools/ephemeris/ephemeris.mjs'`):
  - `parseRinexNavigation` on a two-record inline sample gives the PRNs, epochs and a few literal fields, including a
    `D` exponent and a negative value.
  - `parseSatelliteMetadata` on an inline sample with two SVNs that carried the same PRN at different times returns the
    right block before and after the handover, treats `0000:000:00000` as open-ended, and throws for a time no SVN
    covers.
  - `buildEphemeris` on the committed sources: 32 keys `'1'`…`'32'`; PRN 1's entry equals the literal entry of today's
    `resources/.../gps_ephemeris.json` for PRN 1 (copy its values into the test as literals) plus
    `block: 'GPS-IIF'`; blocks literal for PRN 2 `'GPS-IIR-B'`, 4 `'GPS-IIIA'`, 5 `'GPS-IIR-M'`, 13 `'GPS-IIR-A'`,
    28 `'GPS-IIR-A'`.
  - `buildEphemeris` with a SINEX that lacks one PRN's SVN throws, naming the PRN.
  - `generateEphemerisJson` on a temp folder with two RINEX files throws.
- [ ] **Step 3: Run** `npx vitest run --project unit tools/ephemeris` — expected FAIL (module missing).
- [ ] **Step 4: Implement** `tools/ephemeris/ephemeris.mts` to the interfaces above.
- [ ] **Step 5: Run the tests** — expected PASS.
- [ ] **Step 6: Full regression against today's file** (one-off, not committed): a scratch Node script that parses
  today's `resources/html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_ephemeris.json` and
  `buildEphemeris(...)` and compares every field of every PRN with `===`. Expected: no difference except the added
  `block`. If a value differs (for example PRN 8's `svAccuracy` 2.82842707634), report it in the task report with the
  RINEX text of that field; the RINEX value wins.
- [ ] **Step 7: `npx tsc --noEmit`** — expected clean.

### Task 2: The build and the test harness use the generated ephemeris

**Files:**
- Create: `tools/ephemeris/layout.mts`
- Create: `test/unit/tools/layout.test.ts`
- Modify: `rollup.config.mjs` (the resource-copy plugin)
- Modify: `test/harness/sim/FakeXhr.ts`
- Delete: `resources/html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_ephemeris.json`
- Modify: `test/render/GpsSolution.test.ts:117` (the comment that names the resources file)

**Interfaces:**
- Consumes: `generateEphemerisJson`, `EPHEMERIS_SOURCE_DIR` (Task 1).
- Produces:
  - `withFileSize(layoutText: string, path: string, size: number): string` in `tools/ephemeris/layout.mts` — returns the
    layout JSON with that entry's `size` replaced; keeps every other entry and the entry's `date`; throws when the
    path has no entry.
  - `export const EPHEMERIS_PACKAGE_PATH = 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_ephemeris.json'` in `layout.mts`.

- [ ] **Step 1: Write the failing tests** for `withFileSize`: the size of the named entry changes to the given number
  (parse the result and assert on the entry, not the raw text); another entry and the `date` are unchanged; an unknown
  path throws.
- [ ] **Step 2: Run** `npx vitest run --project unit tools/layout` — expected FAIL.
- [ ] **Step 3: Implement `withFileSize`.** Parse, change, `JSON.stringify(layout, null, 2)`; keep the file's trailing
  newline convention.
- [ ] **Step 4: Extend the rollup plugin** in `rollup.config.mjs`: after `fs.cpSync('resources', …)`, write
  `generateEphemerisJson(EPHEMERIS_SOURCE_DIR)` to `${outputPath}/${EPHEMERIS_PACKAGE_PATH}` and rewrite
  `${outputPath}/layout.json` with `withFileSize(…, EPHEMERIS_PACKAGE_PATH, Buffer.byteLength(json, 'utf8'))`. Import
  the two modules as `./tools/ephemeris/ephemeris.mts` and `./tools/ephemeris/layout.mts`.
- [ ] **Step 5: FakeXhr** serves a URL ending in `Assets/gps_ephemeris.json` from `generateEphemerisJson`, generated once
  per process and cached in a module-level variable; every other URL as before. Update its doc comment.
- [ ] **Step 6: Delete the committed JSON** and fix the comment in `GpsSolution.test.ts`.
- [ ] **Step 7: Run** `npm run build`, then check with a one-liner that the size in `build/layout.json` for
  `EPHEMERIS_PACKAGE_PATH` equals the byte size of `build/html_ui/.../Assets/gps_ephemeris.json`. Expected: equal.
- [ ] **Step 8: Run** `npx tsc --noEmit` and `npm test`. Expected: clean, and all tests pass as before (the generated
  data equals the old data plus `block`). If Vite cannot resolve the `.mjs` → `.mts` spelling, switch the test imports
  to the `.mts` spelling with `allowImportingTsExtensions` and report it.

### Task 3: The pure signal functions

**Files:**
- Modify: `kln90b/GpsSignal.ts`
- Modify: `test/unit/GpsSignal.test.ts` (replace the `satelliteSnr` tests)
- Create: `test/unit/GpsSignalBlocks.test.ts` (the guard over the generated ephemeris)

**Interfaces:**
- Consumes: `generateEphemerisJson` (Task 1) in the guard test only.
- Produces (all exported from `kln90b/GpsSignal.ts`, which imports nothing from the project):
  - constants `ZENITH_SNR`, `SLOPE`, `BACKLOBE_SNR`, `LOCK_LOSS_SNR`, `ACQUIRE_SNR`, `FADE_TAU_AIR_S`,
    `FADE_TAU_GROUND_S`, `MASK_ZENITH_RAD` (85°, moved from GpsFailures).
  - `interface AntennaAttitude {headingTrueDeg: number; pitchUpDeg: number; bankRightDeg: number; onGround: boolean}`
    and `const LEVEL_ATTITUDE: Readonly<AntennaAttitude>` (all 0, in flight).
  - `antennaSinElevation(zenithRad: number, hourAngleRad: number, attitude: Readonly<AntennaAttitude>): number` —
    the spec's formula with `e = 90° − zenith`, `A = −hourAngle`; returns −1 for `zenith >= 90°`; NaN in → NaN out.
  - `antennaCurveSnr(sinAntennaElevation: number): number` — `max(BACKLOBE_SNR, ZENITH_SNR + SLOPE·log10(s))` for
    `s > 0`; `BACKLOBE_SNR` for `s <= 0` and NaN.
  - `KNOWN_BLOCKS: readonly string[]` — the five IGS names.
  - `blockOffsetDb(block: string | undefined, sinLocalElevation: number): number`.
  - `fadeSigmaDb(sinAntennaElevation: number, onGround: boolean): number`.
  - `jitterSigmaDb(snr: number): number`.
- Removes: `satelliteSnr`, `MIN_SNR` (their users are rewritten in Task 5).

- [ ] **Step 1: Write the failing tests** in `test/unit/GpsSignal.test.ts`, literal expectations:
  - `antennaCurveSnr(sin 10°)` ≈ 40.9, `sin 30°` ≈ 46.4, `sin 90°` = 50; `0`, `−0.5`, `NaN` → 25; `sin 0.3°` → 25.
  - `antennaSinElevation` (convert with `asin` and compare degrees, `toBeCloseTo(…, 6)`): level → `e`; heading 0,
    pitch up 10°, satellite at 30° due north (hour angle 0) → 20°, due south (hour angle π) → 40°; heading 0, bank right
    25°, satellite at 20° due east (hour angle −π/2) → 45°, due west (hour angle π/2) → −5°; heading 90°, bank right
    25°, satellite at 20° due south (hour angle π) → 45°, due north (hour angle 0) → −5° (holds the `A − ψ`
    dependence); zenith 95° → −1; NaN hour angle → NaN.
  - `blockOffsetDb`: `'GPS-IIF'` → 1, `'GPS-IIR-M'` → 0.5, `'GPS-IIR-B'` → 0, `'GPS-IIR-A'` → −1, `'GPS-IIIA'` at 20° →
    −1.5, at 40° → −2.75, at 60° → −4, `undefined` → 0, `'GPS-IIIF'` → 0.
  - `fadeSigmaDb`: `sin 0°` in flight 1.2, on ground 2.0; `sin 50°` in flight 0.3, on ground 0.5; `sin 22.5°` in flight
    0.75.
  - `jitterSigmaDb`: 45 → 0.15, 35 → ≈0.474, 30 → ≈0.843, 10 → 1.5.
- [ ] **Step 2: The guard test** `test/unit/GpsSignalBlocks.test.ts`: every entry of `JSON.parse(generateEphemerisJson(
  EPHEMERIS_SOURCE_DIR))` has a `block` that `KNOWN_BLOCKS` includes (report the PRNs that fail, not just a boolean).
- [ ] **Step 3: Run** `npx vitest run --project unit GpsSignal` — expected FAIL.
- [ ] **Step 4: Implement** the functions in `kln90b/GpsSignal.ts`; rewrite its header comment for the new model
  (antenna plane, Installation Manual 2-1; the sources of the offsets and the floor).
- [ ] **Step 5: Run the unit tests** — expected PASS. `tsc` will fail in `GpsFailures.ts` and `Sta1Page.tsx` until
  Task 5; that is expected here.

### Task 4: The `SatelliteSignals` service

**Files:**
- Modify: `kln90b/GpsSignal.ts` (add the class)
- Create: `test/unit/SatelliteSignals.test.ts`

**Interfaces:**
- Consumes: everything Task 3 produces.
- Produces:
  - `interface SignalReceiverView {satellites(): readonly GPSSatellite[]}`
  - `sdkBlockOf(sat: GPSSatellite): string | undefined` — `(sat as any).data?.ephemeris?.block` when it is a string.
  - `class SatelliteSignals`:
    - `constructor(receiver: SignalReceiverView, random: () => number, blockOf: (sat: GPSSatellite) => string | undefined = sdkBlockOf)`
    - `public fadeScale = 1; public jitterScale = 1;`
    - `tick(simTimeS: number, attitude: Readonly<AntennaAttitude>, jammingDb: number): void` — `dt` by the rule of
      `GpsFailures.tick` (first tick, step back, or more than `MAX_SIGNAL_STEP_S` = 60: 0). `MAX_SIGNAL_STEP_S` is
      exported from `GpsSignal.ts`, which must not import `failures/FailureTrigger.ts` (it would pull in the tick and
      power modules); a unit test asserts it equals `MAX_TRIGGER_STEP_S`. For each satellite: compute the SNR; draw `z` from N(0,1) the first time a PRN is computed after a reset;
      with `dt > 0` advance `z` and add a fresh jitter draw; then apply the lock rule with the SDK state of the
      satellite (`Acquired`, `DataCollected`, `InUse`, `InUseDiffApplied` count as tracked).
    - `refresh(attitude: Readonly<AntennaAttitude>, jammingDb: number): void` — the same without counting time or
      drawing jitter.
    - `reset(): void` — lost flags, `z` and the computed flags cleared; the next tick counts nothing.
    - `snr(prn: number): number` — the last computed value (0 when never computed).
    - `isLost(prn: number): boolean`.
  - State in typed arrays of length 256 indexed by PRN; the Box-Muller pair cached as in `GpsFailures.normal()`.

- [ ] **Step 1: Write the failing tests** (fake satellites like `GpsFailures.test.ts`'s `sat()` helper, with a block via
  the injected `blockOf`; a seeded `mulberry32` from `test/harness/sim/random.ts`):
  - With `fadeScale = 0` and `jitterScale = 0`: an IIF satellite at 30°, level, in flight → `snr` = 46.4 + 1 (to 1e-9
    via the functions); with `jammingDb = 10` → 10 lower.
  - Lock rule (moved from `GpsFailures.test.ts`, same thresholds): a tracked satellite at exactly 30 is kept, just
    below 30 lost; a lost one stays lost just below 35 and is back at exactly 35; an untracked one is lost while below
    35; `Acquired` and `DataCollected` count as tracked. Set the SNR through `jammingDb` with scales 0.
  - Attitude: a satellite at 15° due west, banked right 25°, is lost; level again it comes back only once its SNR
    reaches 35.
  - Fade: over a seeded run of 20 000 ticks at 1 s in flight at 0° antenna elevation (scale 1, jitter 0), the sample
    standard deviation of `snr − deterministic part` is within 1.2 ± 0.1 and the lag-20 autocorrelation within
    `exp(−1) ± 0.1`; on the ground the lag-120 autocorrelation within `exp(−1) ± 0.1`.
  - Jitter: with fade 0, at an SNR of about 30 the sample standard deviation over 20 000 ticks is within 0.84 ± 0.05.
  - `dt` rule: the first tick, a step back and a jump of 10 hours draw no jitter and do not move `z` (the SNR equals the
    one before); `refresh` neither.
  - `reset` clears the lost set and the fade (a fresh `z` is drawn on the next computation).
  - A satellite with no block gets offset 0 and does not throw; one with a NaN position gets `BACKLOBE_SNR` plus fade.
  - `countAllocations(() => signals.tick(…))` after a warm-up tick: every count 0.
- [ ] **Step 2: Run** `npx vitest run --project unit SatelliteSignals` — expected FAIL.
- [ ] **Step 3: Implement** the class.
- [ ] **Step 4: Run** — expected PASS.

### Task 5: Wire the signal model into the receiver, the failures, the search and STA 1

**Files:**
- Create: `kln90b/AntennaAttitude.ts` — `interface AntennaAttitudeSource {read(out: AntennaAttitude): void}`,
  `class SimVarAntennaAttitude` (reads `PLANE HEADING DEGREES TRUE`, `PLANE PITCH DEGREES` → negated,
  `PLANE BANK DEGREES` → negated, `SIM ON GROUND`), `LEVEL_ANTENNA: AntennaAttitudeSource` (writes `LEVEL_ATTITUDE`).
- Modify: `kln90b/KLN90BPlatform.ts` — add `createAntennaAttitude(): AntennaAttitudeSource` (sim: `SimVarAntennaAttitude`)
  and `createSignalRandom(): () => number` (sim: `Math.random`).
- Modify: `kln90b/KLN90BCore.ts:301`, `kln90b/Sensors.ts:330-333` — pass both to `GPS`.
- Modify: `kln90b/Gps.ts` — `GPS` and `KLNGPSSatComputer`.
- Modify: `kln90b/failures/GpsFailures.ts`, `kln90b/GpsSearch.ts`, `kln90b/pages/left/Sta1Page.tsx`.
- Modify: `test/harness/platform.ts` (`FakePlatform`: `LEVEL_ANTENNA`; signal random `mulberry32(7)` created per
  platform, independent of the seeded `Math.random`, so the SDK's seeded draws do not shift).
- Modify tests: `test/unit/failures/GpsFailures.test.ts`, `test/unit/GpsSearch.test.ts`,
  `test/render/failures/GpsJamming.test.ts`, `test/render/failures/GpsReceiverFailures.test.ts`,
  `test/render/GpsAcquisition.test.ts` (STA 1 characterization), and whatever else the full run turns red.
- Create: `test/render/SatelliteReachability.test.ts`

**Interfaces:**
- Consumes: Tasks 3 and 4.
- Produces:
  - `GPS.signals: SatelliteSignals` (public readonly).
  - `GPS` constructor gains `antenna: AntennaAttitudeSource, signalRandom: () => number` after `measurement`.
  - `KLNGPSSatComputer.wrapReachability(isLost: (prn: number) => boolean): void` — wraps each satellite's public
    `updateState` once so that a lost satellite is seen with `data.signalStrength = 0` during that call and the SDK's
    value is restored in a `finally`; throws `"GPSSatellite data moved: recheck Gps.ts after the SDK upgrade"` if
    `data` or `signalStrength` is missing. Called from `GPS` once `awaitInit()` resolves (the same `then` as
    `restoreEphemeris`).
  - `KLNGPSSatComputer.onBeforeForcedAcquisition: (() => void) | undefined` replaces its `failures` field; GPS sets it to
    `failures.refreshLevel()`, read the antenna, `signals.refresh(attitude, failures.jammingDb)`.
  - `GpsFailures`: removes `jamBlocked`, `isBlocked`, `isJammed`, `jammedRows`, `refreshBlocks`, `updateBlocks`,
    `LOCK_LOSS_SNR`, `ACQUIRE_SNR`; adds `refreshLevel(): void` (load the cached values if needed and set the level,
    counting no time, drawing nothing).
  - `GpsSearch` constructor: `(computer, isFast, allBlocked)` — the per-satellite `blocked` callback goes.

- [ ] **Step 1: Write the failing render tests** in `test/render/SatelliteReachability.test.ts`:
  - **The SDK hook holds**: engine-running boot with a fix; make one satellite in use lost with a spy on
    `gps.signals.isLost` that returns true for its PRN (the wrapper must call `isLost` through the object, so the spy
    takes effect); after one calculation tick its SDK
    state is `None`, it is still in its channel (`getChannels()`), it is out of the unit's solution, and STA 1 shows its
    row as `*PP  00 EE°`; spy removed, it is `InUse` again within 20 s.
  - **Forced acquisition**: an engine-running boot with a stored finished jamming ramp leaves no satellite in use
    (state not `InUse`) right after the boot, before any calculation tick (the existing GpsJamming case, now through
    reachability).
  - **No signal inhibits**: during jamming with satellites lost, `inhibitedSatellitePrnCodes` is empty.
- [ ] **Step 2: Run** them — expected FAIL (`signals` missing).
- [ ] **Step 3: Implement the wiring** as in the Interfaces block. In `GPS.tick` the order is `failures.tick`, read
  the antenna into a reused `AntennaAttitude`, `signals.tick(simTime, attitude, failures.jammingDb)`, the search, its
  inhibits, the SDK update, the solution. `powerChanged` calls `signals.reset()` beside `failures.reset()`.
  `updateSolution` leaves a satellite out when `failures.receiverFailed || signals.isLost(prn)`. Take-home mode does not
  tick the signals.
- [ ] **Step 4: STA 1**: the SNR column reads `gps.signals.snr(prn)`; the state override and the added rows of lost
  satellites go; the `failures.jamming` branch of the state becomes "a satellite in a channel is lost and above
  `MASK_ZENITH_RAD`" → `  ACQ`. Keep the receiver-failure branches. Update the 5-29/5-30 comments.
- [ ] **Step 5: Run** `npx tsc --noEmit` and the new tests — expected PASS.
- [ ] **Step 6: Run** `npm test` and update what turned red. For each changed expectation, the task report names the
  test, the old and new value, and the physical reason (for example: "PRN 14 at 10° is a GPS-IIIA, now 39 instead of
  41"; "a satellite at 2° is no longer acquired, below 35"). Jamming tests keep their intent (lowest satellites lost
  first, searched rows `*xx 00`, RAIM lost while the fix holds then the fix, ACQ after the ramp, repair) with the
  inhibit-based assertions rewritten to SDK states and `isLost`. Do not loosen an assertion to make it pass; if an
  intent no longer holds, stop and report.
- [ ] **Step 7: Run** `npm test` and `npx tsc --noEmit` — expected clean.

### Task 6: Antenna tilt in the tests, and the jamming spread

**Files:**
- Modify: `test/harness/boot.ts` — option `antennaAttitude?: boolean`: "Reads the antenna's attitude from the SimVars
  (SimVarAntennaAttitude) instead of a level antenna. A createAntennaAttitude in platform wins. Default false".
- Modify: `test/harness/flight/Aircraft.ts:91-94` — write `PLANE BANK DEGREES` as `-bankDeg` (MSFS: positive left), and
  write `PLANE PITCH DEGREES` 0 and `SIM ON GROUND` false; fix the class comment.
- Create: `test/render/AntennaTilt.test.ts`
- Modify: `test/render/failures/GpsJamming.test.ts` (one spread test)
- Delete: `test/render/failures/JammingBaseline.tmp.test.ts` after the rerun

- [ ] **Step 1: Write the failing tests** in `test/render/AntennaTilt.test.ts` (engine-running boot at 47/8,
  `antennaAttitude: true`, satellites from the generated ephemeris; pick the lowest satellite in use and its azimuth
  from the SDK at the start of the test, and bank the aircraft so that satellite is on the high-wing side):
  - **Bank loses the low satellite on the outside of the turn**: set `PLANE HEADING DEGREES TRUE` so the satellite is 90°
    to one side, set `PLANE BANK DEGREES` to 30 toward the other side (remember MSFS's sign); within 2 calculation ticks
    `signals.isLost(prn)` is true and STA 1 shows it `*PP  00`; the satellites on the low-wing side are not lost.
  - **Level again it returns**: bank 0; it is `InUse` again within 20 s.
  - **The MSFS sign**: the same bank with the opposite sign loses a satellite on the other side, not this one.
  - **Pitch**: nose up 20° (`PLANE PITCH DEGREES` −20) weakens a low satellite ahead and strengthens one behind (SNR
    compared with fade and jitter scales at 0).
  - **The default test platform keeps the antenna level** whatever the SimVars say: without `antennaAttitude`, bank 60°
    loses nothing.
- [ ] **Step 2: Run** — expected FAIL (option missing).
- [ ] **Step 3: Implement** the boot option and the `Aircraft` sign fix.
- [ ] **Step 4: Jamming spread test** in `GpsJamming.test.ts`: with the seeded default run of `jammedFlight()`, the
  first and the last loss of the satellites in view are at least 60 s apart (assert on the recorded loss times; derive
  the bound from the measured run, below the value measured, with the measured value in a comment).
- [ ] **Step 5: Rerun the Task 0 measurement** on the new code (adapt it to `isLost`) and add the "after" columns to
  `jamming-baseline.md`. Then delete the temporary test file.
- [ ] **Step 6: Run** `npm test`, `npx tsc --noEmit` — expected clean; the flight stage passes unchanged (its antenna
  is level).

### Task 7: Docs, final checks, commit

**Files:**
- Modify: `docs/failures.md` (jamming: the level only; the lock rule belongs to the receiver's signal model)
- Modify: `docs/architecture.md` (GPS paragraph: the signal model, reachability, the generated ephemeris)
- Modify: `CLAUDE.md` (GPS bullet: one sentence; Commands: `resources/layout.json` is static except the ephemeris's
  size, which the build writes; the ephemeris sources in `ephemeris/` and how to update them)
- Modify: `test/README.md` if it lists harness options (`antennaAttitude`)

- [ ] **Step 1: Write the doc changes.**
- [ ] **Step 2: Run** `npx tsc --noEmit`, `npm test`, `npm run build`, and the layout size check of Task 2 Step 7.
  Expected: clean, all pass, sizes equal. Confirm `git status` shows no stray files (no scratch scripts, no
  `JammingBaseline.tmp.test.ts`).
- [ ] **Step 3: Commit** everything, the spec and this plan included, as one commit:

```bash
git add -A
git commit -m "fixes #467 each satellite gets its own SNR from the antenna tilt, its block's transmit power, a fade and the estimate jitter; signal loss is normal receiver behavior and jamming only lowers the signal

<a paragraph with the before/after jamming measurement from jamming-baseline.md, and the expectations that changed and why>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Prepare the issue comment** (the measurement table, whether `RAIM NOT AVAILABLE` appeared) and show it to
  the maintainer; post it only with their OK.
