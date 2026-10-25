# OBS Mode Measured at the Active Waypoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In OBS mode the unit sets, holds, shows and steps the course in the frame of the active waypoint, as the KLN 89 does (#370, #371, #425).

**Architecture:** The OBS line stays what `ModeController.setObs` lays today (a great circle through the active waypoint with the course at the waypoint). A shared function gives the course at the waypoint of the great circle from the aircraft (the Direct To course and the OBS-mode bearing). `ModeController` gains display helpers for the bearing and the track, takes the OBS variation at the active waypoint, and finally holds the course true and derives the magnetic course.

**Tech Stack:** TypeScript (es2017), `@microsoft/msfs-sdk` (`GeoPoint`, `MagVar`, `NavMath`), Vitest (unit and render stages).

**Spec:** `docs/superpowers/specs/2026-10-25-obs-waypoint-frame-design.md`. The evidence is the two 2026-10-25 OBS blocks at the end of `docs/kln89-trainer-record.md`.

## Global Constraints

- Branch `obs-waypoint-frame`; tasks run in order, each on top of the previous one. Never `git push`.
- One commit per issue: Task 1 = `fixes #370 ...`, Task 2 = `fixes #371 ...`, Task 3 = `fixes #425 ...`, each with its tests and doc changes. End each commit message with the attribution trailer the harness gives you.
- The outputs to the aircraft keep their meaning: `L:KLN90B_GPS_WP_BEARING`, `GPS WP BEARING`, `GPS WP DESIRED TRACK`, `GPS WP TRACK ANGLE ERROR`, `GPS MAGVAR` (`NavCalculator.setOutput`, `SensorsOut`). The OBS output to the indicator is the unit's magnetic OBS course.
- Angles are stored true unless the name says `Mag`. The variation is east positive (`MagVar.trueToMagnetic(true, var) = true - var`); a VOR's `magneticVariation` is west positive (`KLNMagvar.getReferenceMagvar` flips it).
- Calculation-tick work reuses cached `GeoPoint`s, no allocation per tick (CLAUDE.md, tick cost).
- `target: es2017`; American English; no counts of growing collections in prose; never copy manual text, cite pages (`5-37`) and paraphrase.
- Test labels: a KLN 89 trainer citation ("checked in the KLN 89 trainer, 2026-10-25") only for what the 89 showed: the OBS course a Direct To sets, the OBS line, the OBS variation at the waypoint, the NAV 1 bearing and NAV 1 track in OBS mode, ACTIVATE and a SET 2 change keeping the true course, the knob landing on the whole degree. The 90B's own pages (Super NAV 1, NAV 3, Super NAV 5, the map label), the `CRS` message and the indicator rules are the 90B's (cite 5-37 where it says it) or `characterization` by analogy. A describe titled with a citation holds only tests of that source. Report a per-describe label audit (title, spec or characterization, citation) with each task.
- Before each commit: `npx tsc --noEmit` clean, the whole `npm test` green, `npm run build` succeeds. Grep the whole suite for tests that read or write what the task changes (`obsMag`, `getMagvarForObs`, the switched displays) and update them in the same task.

## Review Focus

1. The aircraft exactly at the active waypoint in OBS mode (distance 0): the bearing helpers must give a number or null, never `NaN` on screen, and no error (Task 2 test).
2. An OBS course near north after a variation change or a knob click: shows `000`, never `360`, and a click up from a course shown `000` gives `001` (#263; Task 3 test).
3. The aircraft outputs in OBS mode: `L:KLN90B_GPS_WP_BEARING` stays the initial bearing at the aircraft with the aircraft's variation (Task 2 test).
4. A read indicator whose course round-trips through true and back must not re-lay the course every second (#122; Task 3 test).
5. A power cycle in OBS mode: the new state fields are reset at a power-on (the #192 guard in `test/render/data/VolatileMemory.test.ts` holds it; Tasks 2 and 3 add their fields to `VolatileMemory`'s power-on reset).

---

### Task 1: The Direct To in OBS mode sets the course at the waypoint (#370)

**Files:**
- Create: `kln90b/data/navdata/ObsGeometry.ts`
- Modify: `kln90b/pages/left/DirectToPage.tsx:117-124` (the plain Direct To branch in OBS mode)
- Test: `test/unit/data/navdata/ObsGeometry.test.ts` (new), `test/render/pages/left/DirectToObs.test.ts`

**Interfaces:**
- Produces: `export function courseAtWaypoint(position: LatLonInterface, wpt: LatLonInterface): Degrees` in `kln90b/data/navdata/ObsGeometry.ts`: the course, true, at `wpt` of the great circle from `position` (its final course), normalized to [0, 360). Uses one module-level cached `GeoPoint`: `normalizeHeading(cache.set(wpt).bearingTo(position) + 180)`.

- [ ] **Step 1: Write the failing unit test** `test/unit/data/navdata/ObsGeometry.test.ts`

Geometry of #370: `kaaa` at 47.0 N 8.0 E, `eee = pointFrom(kaaa, 90, 150)`, `onLeg = pointBefore(kaaa, eee, 100)`, `position = pointFrom(onLeg, courseDeg(onLeg, eee) - 90, 5)` (helpers from `test/harness/flight/geo.ts`).

```ts
it('is the final course of the great circle from the position, not the initial bearing', () => {
    expect(courseAtWaypoint(position, eee)).toBeCloseTo(finalCourseDeg(position, eee), 6); // 095.54
    expect(Math.abs(courseAtWaypoint(position, eee) - courseDeg(position, eee))).toBeGreaterThan(1.5); // 093.76
});
it('wraps into [0, 360) for a course just west of north', () => { /* position south-east of a waypoint so the final course is about 359; expect >= 0 and < 360 and close to finalCourseDeg */ });
```

- [ ] **Step 2: Run it, expect FAIL** (module not found): `npx vitest run test/unit/data/navdata/ObsGeometry.test.ts`

- [ ] **Step 3: Implement `courseAtWaypoint`** as in the Interfaces block.

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Turn the #370 pin into a test** in `test/render/pages/left/DirectToObs.test.ts`

`it.fails('centers the deviation after a long Direct To in OBS mode (5-37, #370)')` becomes `it(...)`; rewrite its comment: 5-37 (the Direct To selects the course from the present position to the waypoint and centers the deviation); checked in the KLN 89 trainer, 2026-10-25 (the course set is the direct path's course at the waypoint). Add, in the same describe, using `longDirectToEee()`:

```ts
it('sets the course of the direct path at EEE (5-37, #370)', async () => {
    const {nav} = await longDirectToEee();
    // the aircraft's position at the Direct To is the boot position of longDirectToEee; return it from the helper
    expect(Math.abs(nav.obsMag - finalCourseDeg(position, eee))).toBeLessThan(0.05); // 095.54, variation 0; the initial bearing would be 093.76
});
```

and a `CRS` test on the same long geometry with a read, non-driven indicator (`Input.ObsSource` 1 as in `shows CRS with the direct course when the unit reads a non-driven indicator`): `expect(Screen.read().status().mode).toBe('d› CRS 096°')` (the initial bearing would give `094`). Title it as the 90B's message (5-37, C-1), not as a trainer check.

- [ ] **Step 6: Run `npx vitest run test/render/pages/left/DirectToObs.test.ts`, expect the new tests and the former pin to FAIL.**

- [ ] **Step 7: In `DirectToPage.performDirectTo`** replace `this.props.sensors.in.gps.coords.bearingTo(waypoint)` by `courseAtWaypoint(this.props.sensors.in.gps.coords, waypoint)`; keep the comment style and cite 5-37 and #370 there.

- [ ] **Step 8: Run the file again, expect PASS.** The short-geometry tests of the same describe compare with `courseDeg(offLeg, abc)` within 0.05°; where the convergence over 10 NM breaks that, change the expectation to `finalCourseDeg(offLeg, abc)` and keep the tolerance.

- [ ] **Step 9: Whole suite, tsc, build; commit**

```bash
git add kln90b/data/navdata/ObsGeometry.ts kln90b/pages/left/DirectToPage.tsx test/unit/data/navdata/ObsGeometry.test.ts test/render/pages/left/DirectToObs.test.ts
git commit -m "fixes #370 A Direct To in OBS mode sets the course of the direct path at the waypoint"
```

---

### Task 2: The OBS variation at the active waypoint, and the bearing and track in OBS mode (#371)

**Files:**
- Modify: `kln90b/services/ModeController.ts` (`getMagvarForObs`, two new helpers)
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState.bearingAtActive`, its power-on reset next to `bearingToActive`)
- Modify: `kln90b/data/navdata/NavCalculator.ts` (set `bearingAtActive` where `bearingToActive` is set: line 125, the self-test values at line 90, `setFlag`)
- Modify the displays: `kln90b/pages/left/Nav1Page.tsx:92`, `kln90b/pages/left/SuperNav1Page.tsx:88`, `kln90b/pages/left/Nav3Page.tsx:93`, `kln90b/controls/selects/SuperNav5Field2Selector.tsx:77-81`, `kln90b/controls/selects/SuperNav5Field3Selector.tsx:58-64` (gains a `ModeController` constructor parameter; its `build` call in `kln90b/controls/SuperNav5Left.tsx:42`), `kln90b/controls/selects/MapOrientationSelector.tsx:55`, `kln90b/controls/SuperNav5Right.tsx:64`
- Modify: `docs/architecture.md` (the `KLNMagvar` section, around line 666)
- Test: `test/render/services/ModeControllerObs.test.ts`, `test/render/pages/left/Nav1Page.test.ts`, `test/render/pages/left/Nav3Page.test.ts`, `test/render/pages/left/SuperNav1Page.test.ts`, `test/render/pages/left/SuperNav5Page.test.ts`, the LVar output test file that already covers `L:KLN90B_GPS_WP_BEARING` (grep for `LVAR_GPS_WP_BEARING`)

**Interfaces:**
- Consumes: `courseAtWaypoint` (Task 1).
- Produces:
  - `NavPageState.bearingAtActive: Degrees | null = null` — true; the course at the active waypoint of the great circle from the aircraft; computed in the calculation tick with `bearingToActive` and null whenever it is.
  - `ModeController.getMagvarForObs(wpt: Facility | null): number` — unchanged signature. Invalid variation (5-44): `getCurrentMagvar()` as today. Valid and `wpt === null`: `getCurrentMagvar()`. Valid otherwise: `KLNMagvar.getReferenceMagvar(wpt)` (a VOR's published variation, any other waypoint `MagVar.get` at its position).
  - `ModeController.getBearingToActiveMag(): Degrees | null` — OBS mode: `trueToMag(bearingAtActive, getMagvarForObs(active))`; LEG: `trueToMag(bearingToActive)`.
  - `ModeController.getTrackMag(): Degrees | null` — the track `gps.getTrackTrueRespectingGroundspeed()`; OBS mode: magnetic with `getMagvarForObs(active)`; LEG: with the current variation.
  - The radial fields of Super NAV 5 show `(getBearingToActiveMag() + 180) % 360` through their existing `toRadial`.

The test world for the displays: `Nav1Page.test.ts`'s KDDD world (KDDD 47.0 N 9.0 E, KAAA 200 NM west on the 270 great circle, `west(nm)` on the leg), with the variation **10° E within 1 NM of KDDD and 0 elsewhere**: `magvar: (lat, lon) => distanceNm({lat, lon}, KDDD) < 1 ? 10 : 0`, and `panelXml(NO_OBS)` so the unit chooses the course. At `west(64.8)`, track 090 true: in LEG mode BRG 088.8 true → `089°`, TK `090°`; after OBS the course chosen is 090 true at KDDD → `080` magnetic, the bearing at KDDD is 090.0 true → `080°`, the track 090 true → `080°`, the radial `260°`. A unit using the initial bearing with the waypoint's variation would show `079°`; one using the bearing at the waypoint with the aircraft's variation `090°`.

- [ ] **Step 1: Write the failing tests**
  - `ModeControllerObs.test.ts`: replace `with the variation at the aircraft for an active airport (10 E)` by `with the variation at the active airport, not at the aircraft (10 E at KBBB)`: `twoNmRight(kbbb, (lat, lon) => distanceNm({lat, lon}, kbbb) < 1 ? 10 : 0)` (`twoNmRight` takes the magvar function as its `magvar`), `expect(Math.abs(nav.obsMag - (trueCourse - 10))).toBeLessThan(0.2)` and the 2 NM kept; cite 5-35 and the trainer, 2026-10-25. Add `keeps the published variation of an active VOR where the model gives another (5-35)`: the VOR ABC with `magneticVariation: -10`, the model 3 everywhere, `expect(...obsMag - (trueCourse - 10))` within 0.2.
  - `Nav1Page.test.ts`, a new describe `NAV 1 page in OBS mode (#371)` (trainer 2026-10-25: the bearing at the waypoint with its variation): row 5 is `BRG    089°` in LEG (precondition), then `await unit.panel.obsMode()` and 1 s: `BRG    080°`. Also: the aircraft exactly at KDDD in OBS mode shows a number or dashes in row 5 (no `NaN`) and `unit.errors` is empty.
  - Characterizations by analogy (one each, same world): NAV 3 `TK     080°` in OBS (`TK     090°` in LEG); Super NAV 1 `BRG  080°`; Super NAV 5 field 2 BRG `Ô080°`, field 3 TK `Ö080°`, a RAD field `Õ260°`; the TK-up orientation label `080°`. Follow how each page's existing tests select it and read it.
  - The output stays: in OBS mode on the same world, `L:KLN90B_GPS_WP_BEARING` is 088.8° in radians within 0.1° (the initial bearing with the aircraft's variation 0).

- [ ] **Step 2: Run them, expect the new ones to FAIL** (`080` expected, `089`/`090` or `079` shown). The output test and the aircraft-at-KDDD test are guards that pass before the change too.

- [ ] **Step 3: Implement** `getMagvarForObs`, `bearingAtActive` (field, reset, NavCalculator: line 125 via `courseAtWaypoint(this.sensors.in.gps.coords, toLeg.wpt)`, the self-test sets it to the same value as `bearingToActive`, `setFlag` nulls it), the two helpers, and switch the listed displays to them. The map's rotation (`Nav5Page`, `SuperNav5Page`) stays true and untouched.

- [ ] **Step 4: Run the new tests, expect PASS; then the whole suite.** The #190 tests in `test/render/data/navdata/KLNMagvar.test.ts` must stay green unchanged (invalid variation: true north or the SET 2 value, a VOR too).

- [ ] **Step 5: Update `docs/architecture.md`** (`KLNMagvar`): in OBS mode with a valid variation the OBS course uses the variation at the active waypoint (a VOR its published one); the NAV 1 family of displays takes the bearing and track from `ModeController.getBearingToActiveMag`/`getTrackMag`; the aircraft outputs keep the aircraft's frame.

- [ ] **Step 6: tsc, whole suite, build; commit**

```bash
git commit -m "fixes #371 OBS mode uses the variation at the active waypoint, and NAV 1 shows the bearing and track in its frame"
```

---

### Task 3: Hold the OBS course true; a knob click lands on a whole degree (#425)

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState.obsMag` → `obsTrue`, reset)
- Modify: `kln90b/services/ModeController.ts` (`setObs`, `setObsOnUnit`, `getObsTrue`, `getDtkOrObsMagnetic`, `switchToEnrLegMode`, `forceSwitchToEnrObsMode`, `tick`; new methods below)
- Modify: `kln90b/pages/left/DirectToPage.tsx:113-126`, `kln90b/controls/selects/ObsDtkElement.tsx:46-53`, `kln90b/pages/left/Mod2Page.tsx:125-132,184`, `kln90b/controls/StatusLine.tsx:264,268`, `kln90b/controls/SuperNav5Left.tsx:110,115`
- Modify: `docs/architecture.md:672` (the `obsMag` convention)
- Test: `test/render/pages/left/DirectToObs.test.ts`, `test/render/pages/left/Mod2Page.test.ts`, `test/render/controls/selects/ObsDtkElement.test.ts`, `test/render/data/navdata/KLNMagvar.test.ts`, and every test that reads or writes `navPage.obsMag` (grep: about a dozen files)

**Interfaces:**
- Consumes: `getMagvarForObs`, `courseAtWaypoint` (Tasks 1, 2).
- Produces (`ModeController`):
  - `NavPageState.obsTrue: Degrees = 0` — the OBS course, true; reset to 0 at a power-on and by `switchToEnrLegMode`.
  - `getObsTrue(): Degrees` — returns `navState.obsTrue`.
  - `getObsMag(): Degrees` — `trueToMag(obsTrue, getMagvarForObs(active))`, normalized to [0, 360). Every reader of the old `navState.obsMag` uses it, and `getDtkOrObsMagnetic()` returns it in OBS mode.
  - `setObsTrue(obsTrue: Degrees, force = false): void` — today's `setObs` body on a true course (store, lay through the active waypoint). The unforced guard skips a course equal to the held one.
  - `setObs(obsMag: Degrees, force = false): void` — a magnetic course (indicator, knob, tests): `setObsTrue(magToTrue(obsMag, getMagvarForObs(active)), force)`.
  - `setObsTrueOnUnit(obsTrue: Degrees, force = false)` and `setObsOnUnit(obsMag: Degrees, force = false)` — as their counterparts, then `sensors.out.setObs(getObsMag())`.
  - `stepObs(clicks: 1 | -1): void` — `setObsOnUnit(normalizeHeading(roundBearing(getObsMag()) + clicks))`: the shown course ± 1 as a whole magnetic degree. `ObsDtkElement.innerLeft/innerRight` and `Mod2Page.innerLeft/innerRight` call it (their return values unchanged).
- The callers: `forceSwitchToEnrObsMode` uses `setObsTrueOnUnit(obsTrue, true)` for the course it chooses (no conversion), `setObs(obsIn, true)` for a read indicator as today. `DirectToPage`: ACTIVATE → `setObsTrueOnUnit(getObsTrue(), true)` (the true course laid through the new waypoint, the output written at once so a driven indicator is slewed before the next read, #261); the plain Direct To → `setObsTrueOnUnit(courseAtWaypoint(...), true)`, and the `CRS` message shows `getObsMag()`.
- The indicator in `tick` (ENR-OBS and ARM-OBS): a course read from the indicator is taken only when it differs from the unit's magnetic course (`getObsMag()`), and, with a driven indicator (`planeSettings.output.obsTarget !== 0`), also from the last course sent (`sensors.out.obsOut`): a driven indicator still showing what the unit sent is not a pilot's change. "Differs" means more than a round-trip epsilon of 1e-6°, so that a magnetic course converted to true and back does not count as a change.

Test worlds: the standard route (`standardRoute()`: KAAA 47.0/8.0 airport, ABC 47.5/8.9 VOR, KBBB 48.2/9.2 airport) with ABC as `vor('ABC', abc.lat, abc.lon, {magneticVariation: -10})` (10° E), the model 0, FPL 0 KAAA, ABC, KBBB, the aircraft `pointBefore(kaaa, abc, 5)`; `directToKbbbFromFpl0(unit, true)` in `DirectToObs.test.ts` does the ACTIVATE.

- [ ] **Step 1: Write the failing tests**
  - `DirectToObs.test.ts`, in `ACTIVATE in OBS mode (5-37)` or a new describe titled for the trainer check: ObsSource 0, ABC (10° E) active, `unit.props.modeController.setObsOnUnit(50)` (060 true); ACTIVATE KBBB: `getObsTrue()` within 1e-6 of 60, `getObsMag()` within 1e-6 of 60 (KBBB 0°), `xtkToActive` within 0.05 of `crossTrackNm(position, kbbb, 60)` (a kept magnetic 050 would give `crossTrackNm(position, kbbb, 50)`; assert the two differ by more than 1 NM). Cite the trainer, 2026-10-25 (second OBS block).
  - The same with a read, non-driven indicator (`obs: 50`, ObsSource 1, ObsTarget 0): after the ACTIVATE and 2 s the indicator's 050 is the course, `getObsMag()` within 1e-6 of 50 and the deviation from 050 through KBBB (5-37: ACTIVATE keeps the selected course, here the indicator's).
  - The same with an indicator the unit reads and drives (ObsSource 1, `Output.ObsTarget` 1, `unit.env.sim.applyObsKeyEvents = true`): after 2 s `getObsTrue()` ≈ 60, `Nav OBS:1` ≈ 60 within 0.5, the deviation from 060 (#261, #425).
  - An unchanged read indicator does not re-lay the course: ObsSource 1, an active waypoint with a variation of 7.3° (a conversion that does not round-trip exactly), indicator 050; spy on `activeWaypoint.directToFlightplanIndex` and `directTo` after entering OBS; 5 s later neither was called.
  - `Mod2Page.test.ts`: LEG to OBS (ObsSource 0) on the standard leg KAAA - ABC with ABC at 0° (course 051.03 at ABC); one click up: `getObsMag()` within 1e-6 of 52; from 051.03 again one click down: 50 (trainer 2026-10-25: the shown course ± 1). In `ObsDtkElement.test.ts` the same once through NAV 3 or Super NAV 5 (characterization by analogy). And at north: `setObsOnUnit(359.6)` shows `000`, one click up gives `getObsMag()` 1.
  - `KLNMagvar.test.ts`, the #190 world (OBS mode with the active waypoint outside the area): enter a variation on SET 2 with the course held: the course shown changes by the entered variation and `xtkToActive` stays within 0.05 (5-44; the trainer, 2026-10-25, kept the line on a SET 2 change).

- [ ] **Step 2: Run them, expect FAIL** (ACTIVATE keeps 050, the click gives 52.03, the SET 2 entry moves the deviation). The unchanged-indicator test is a guard and passes before the change too (today's guard compares the magnetic course exactly); the read-indicator ACTIVATE test passes before too (the indicator wins either way); say so in their comments.

- [ ] **Step 3: Implement** the Interfaces block: the field, the methods, the callers, the indicator rule, every reader of `obsMag` switched to `getObsMag()`.

- [ ] **Step 4: Run the new tests, expect PASS. Then update the remaining tests that read `navPage.obsMag`** to `unit.props.modeController.getObsMag()` (or `getObsTrue()` where the test is about the true course) and write courses through `setObs`/`setObsOnUnit`. Keep their assertions' values; a value that has to change is a finding to report, not to absorb.

- [ ] **Step 5: Update `docs/architecture.md:672`**: the OBS course is held true in `obsTrue`; the magnetic course is `getObsMag()`, derived with the OBS variation; the knob steps the shown course.

- [ ] **Step 6: tsc, whole suite, build; commit**

```bash
git commit -m "fixes #425 The OBS course is held true; ACTIVATE keeps the line and a knob click lands on the whole degree"
```
