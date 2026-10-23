# Airspace alert: circles and arcs, 2 NM rule, duplicate areas, message lifetime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The SUA alert and the airspace lists work on the sim's real airspace data: true circles and arcs (#209), the
2 NM rule (#189), one area per group of identical copies (#410), and airspace messages that stay while their condition
holds (#412).

**Architecture:** `BoundaryUtils` builds one cached polyline per `LodBoundary` (arcs and circles cut to ≤ 0.05 NM chord
error, every shape) and runs today's flat algorithms over it, plus a new edge distance. A new `AirspaceAreas` collection
merges copies by a geometric key where search results are collected (`AirspaceAlert`, `NearestUtils`). The alert's
warned and entered areas become key sets on `NavPageState`, reset at power-on, and the two messages become condition
messages.

**Tech Stack:** TypeScript (es2017), `@microsoft/msfs-sdk` (`LodBoundary`, `GeoCircle`, `GeoPoint`), Vitest (unit and
render stages).

**Spec:** `docs/superpowers/specs/2026-10-22-airspace-arcs-2nm-duplicates-design.md`

## Global Constraints

- Branch `airspace-arcs-2nm-duplicates`. One commit per issue, in this order: `fixes #209 …`, `fixes #189 …`,
  `fixes #410 …`, `fixes #412 …`; each holds its code, tests, comments and doc changes. Plus one small
  `references #210 …` doc commit (Task 1).
- Performance bar from the spec: the worst alert check must stay well under one 30 fps frame (33 ms) at 10× the Node
  time on the maintainer's PC. No per-tick allocation of polylines; the polyline is built once per boundary object.
- No public contract changes (H events, LVars, panel.xml keys, SimVars, persisted data).
- `target: es2017`; no new dependencies.
- Test labels per `test/README.md`: a test cites only what its source literally shows. The AVsoftech KLN 90B trainer
  (third-party, unreliable, checked 2026-10-22) is not a manual: tests resting on it carry `characterization` in the
  title and the source in a comment ("AVsoftech KLN 90B trainer, 2026-10-22"), no manual page.
- Never copy manual text, the licensed navdata or the sim dump into the repo. Test airspaces are invented.
- American English; no counts of growing collections in comments or docs.
- Run the full suite (`npm test`), `npx tsc --noEmit` and `npm run build` before each commit.

## Review Focus

- **An arc or circle whose start point lies off its circle** (real data: up to 1.36 NM) must not throw from
  `GeoCircle.angleAlong` → Task 1 has a unit test with an arc whose start is 0.5 NM off the circle.
- **Airspaces across the date line** must keep working with the polyline and the new distance → Task 1 keeps the
  existing date-line tests green; Task 2 adds a distance test on `dateLineBox`.
- **A boundary of several shapes** (the sim dump showed one shape per boundary, the SDK allows more) → Task 1 has a
  unit test with a polygon plus a separate circle in one facility.
- **The representative copy changes while an area is warned** (the copy with the shortest name leaves the search
  result first) → Task 3 has a render test: no second message.
- **The alert switched off on SET 8, or inhibited in ARM/APR, while a message is shown** → Task 4 decides that the key
  sets are cleared, so the messages go; one render test for SET 8.

---

### Task 1: Circles and arcs on a cached polyline (#209)

**Files:**
- Modify: `kln90b/data/navdata/BoundaryUtils.ts` (whole file)
- Modify: `test/harness/navdata/airspaces.ts` (new builder `arcSectorAirspace`; update the `circularAirspace` doc
  comment, which describes the gap)
- Test: `test/unit/data/navdata/BoundaryUtils.test.ts` (new describe), `test/unit/harness/airspaces.test.ts:172-182`
  (flip the known gap), `test/render/data/navdata/AirspaceAlert.test.ts` (new test),
  `test/render/controls/AirportCoordOrNearestView.test.ts` (new test)
- Docs: `docs/architecture.md` (the `BoundaryUtils` line in **Alerts**, and the "missing on purpose" list),
  `test/README.md` (the **Airspaces** paragraph and the #209 note)

**Interfaces:**
- Produces in `BoundaryUtils.ts`:
  - `export const ARC_CHORD_TOLERANCE_NM = 0.05`
  - `private static rings(boundary: LodBoundary): readonly (readonly LatLonInterface[])[]`: one closed ring (last point
    equals the first) per shape of `boundary.lods[0]`, cached in a module-level `WeakMap<LodBoundary, …>`. Task 2 uses
    it.
  - `isInside`, `intersects`, `getIntersections`: signatures unchanged.
- Produces in the harness: `arcSectorAirspace(name: string, type: BoundaryType, center: [number, number], radiusNm:
  number, fromBearing: number, toBearing: number, o?: AirspaceOptions & {startOffsetNm?: number}): BoundaryFacility`.
  A pie slice: `Start` at the center, `Line` to the point at `fromBearing` (moved `startOffsetNm` outward, default 0,
  for the off-circle case), `Origin` at the center (originId 1), `ArcCW` (originId 1) to the point at `toBearing`,
  `Line` back to the center. Bounding box: the full circle's box, as `circularAirspace` computes it.

- [ ] **Step 1: Write the failing tests**

In `test/unit/data/navdata/BoundaryUtils.test.ts`, a new `describe('circles and arcs (#209)')`. Use
`circularAirspace('CIRC', BoundaryType.Restricted, [47, 8], 10)` and `arcSectorAirspace('SECTOR',
BoundaryType.Restricted, [47, 8], 10, 0, 90)`, wrapped in `new LodBoundary(…)`, and `pointFrom` from
`test/harness/flight/geo.ts`; `C = {lat: 47, lon: 8}`, and two local helpers `at(p) = [p.lat, p.lon]` and
`path(a, b) = [a.lat, a.lon, b.lat, b.lon]` spread into the arguments. The arc cases are chosen so that a chord gives the opposite answer (the chord of a
90° arc passes 7.07 NM from the center):

```ts
expect(BoundaryUtils.isInside(circle, 47, 8)).toBe(true);
expect(BoundaryUtils.isInside(circle, ...at(pointFrom(C, 45, 9.8)))).toBe(true);
expect(BoundaryUtils.isInside(circle, ...at(pointFrom(C, 45, 10.2)))).toBe(false);
expect(BoundaryUtils.isInside(sector, ...at(pointFrom(C, 45, 9.8)))).toBe(true);
expect(BoundaryUtils.isInside(sector, ...at(pointFrom(C, 45, 10.2)))).toBe(false);
expect(BoundaryUtils.isInside(sector, ...at(pointFrom(C, 135, 5)))).toBe(false);
// A path from 9 to 11 NM on bearing 45 crosses the arc, not the chord
expect(BoundaryUtils.intersects(sector, ...path(pointFrom(C, 45, 9), pointFrom(C, 45, 11)))).toBe(true);
// A path through the circle's center, 20 NM west to 20 NM east: two crossings, each 10 NM from the center
const xs = BoundaryUtils.getIntersections(circle, ...path(pointFrom(C, 270, 20), pointFrom(C, 90, 20)));
expect(xs).toHaveLength(2);
for (const x of xs) expect(Math.abs(distanceNm(C, x) - 10)).toBeLessThan(0.06);
```

Plus:
- `'reads an arc whose start lies off its circle (#209)'`: `arcSectorAirspace(…, 0, 90, {startOffsetNm: 0.5})`;
  `isInside` at bearing 45, 9.8 NM is `true` and no exception is thrown.
- `'reads every shape of a boundary (#209)'`: a facility whose vectors are a square polygon around 47N 8E followed by
  an `Origin` + `Circle` of 5 NM around 47N 9E (build it with the harness's internal `facility()` or export a small
  `multiShapeAirspace()` helper); `isInside` at 47N 9E is `true`, at 47N 8E is `true`.

In `test/unit/harness/airspaces.test.ts`, the test at line 172-182 becomes `'builds a circular airspace that
BoundaryUtils sees as a circle (#209)'`: keep `lod.lods[0][0].length === 2`, assert `isInside(lod, 47.0, 8.0)` is
`true`; drop the "known gap" comment.

In `test/render/data/navdata/AirspaceAlert.test.ts`, inside `describe('SUA alert, vertical limits of an MSL airspace')`'s
neighbor, a new `describe('circular areas (3-39, 3-40, #209)')`:

```ts
it('shows INSIDE SPC USE AIRSPACE in a circular restricted area (3-39, 3-40, #209)', async () => {
    const unit = await bootUnit({position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
        airspaces: [circularAirspace('R-CIRCLE', BoundaryType.Restricted, [47.0, 8.0], 5, {minFt: 0, maxFt: 5000})]});
    await settle(unit);
    await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
    expect(sua(unit)).toEqual(['INSIDE SPC USE AIRSPACE R-CIRCLE          REST 0ft to 5000ft']);
});
```

In `test/render/controls/AirportCoordOrNearestView.test.ts`, beside `'shows CL C for an airport under a Class C
airspace (3-42)'`: `'shows CL C for an airport under a circular Class C airspace (3-42, #209)'`, same setup with a
`circularAirspace(…, BoundaryType.ClassC, <airport position>, 5)`, asserting row 3 is `'CL C       '`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/data/navdata/BoundaryUtils.test.ts test/unit/harness/airspaces.test.ts test/render/data/navdata/AirspaceAlert.test.ts test/render/controls/AirportCoordOrNearestView.test.ts`
Expected: the new circle and arc tests and the flipped harness test FAIL; the existing tests pass.

- [ ] **Step 3: Implement the polyline in `BoundaryUtils.ts`**

`rings(boundary)` walks each shape of `lods[0]`: the first element's `end` starts the ring. For each further element,
a great circle (`circle.isGreatCircle()`) adds its `end`. A small circle is cut: project the previous end onto the circle
(`circle.closest(prev, out)`), take the sweep `circle.angleAlong(projected, end, Math.PI)`; when the projected start and
the end are equal (a full circle shape), the sweep is 2π. Cut into `n = ceil(sweep / step)` chords with
`step = 2·acos(1 − tol/r)`, where `r` is the circle's radius in NM (`UnitType.GA_RADIAN`) and `tol` is
`ARC_CHORD_TOLERANCE_NM`; add the points with `circle.offsetAngleAlong(projected, sweep·k/n, out)`, ending exactly on
`end`. Close the ring. `isInside` and `getIntersections` keep their algorithms and their date-line handling (#9, #106)
and loop over every ring instead of `lods[0][0]`; `isInside` is true when the point is inside any ring. Remove the two
"todo … circle" comments.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the command of Step 2, then `npm test`.
Expected: all PASS, the date-line describes included.

- [ ] **Step 5: Update the docs**

`docs/architecture.md`, **Alerts**: `BoundaryUtils` works on a polyline per boundary, built once and cached, with arcs
and circles cut to at most `ARC_CHORD_TOLERANCE_NM` off the curve, over every shape. The "missing on purpose" list
drops "circular airspaces". `test/README.md`: the **Airspaces** paragraph names `arcSectorAirspace()`; the #209 note
about the instrument ignoring circles goes.

- [ ] **Step 6: Commit**

```bash
git add kln90b/data/navdata/BoundaryUtils.ts test/harness/navdata/airspaces.ts test/unit/data/navdata/BoundaryUtils.test.ts test/unit/harness/airspaces.test.ts test/render/data/navdata/AirspaceAlert.test.ts test/render/controls/AirportCoordOrNearestView.test.ts docs/architecture.md test/README.md
git commit -m "fixes #209 read circles and arcs of an airspace as curves, on a cached polyline over every shape"
```

- [ ] **Step 7: Record #210 as left out, and commit**

`docs/architecture.md`, "missing on purpose" list: add the third line of the SUA messages (the APT 4 reference for
Class B/C and the controlling agency, #210: the sim's data has neither).

```bash
git add docs/architecture.md
git commit -m "references #210 list the third line of the SUA messages as left out"
```

---

### Task 2: The 2 NM rule (#189)

**Files:**
- Modify: `kln90b/data/navdata/BoundaryUtils.ts` (new method)
- Modify: `kln90b/data/navdata/AirspaceAlert.ts:123-127` (the warn condition; remove the TODO)
- Test: `test/unit/data/navdata/BoundaryUtils.test.ts`, `test/render/data/navdata/AirspaceAlert.test.ts:171-187`

**Interfaces:**
- Consumes: `BoundaryUtils.rings` (Task 1), `circularAirspace`, `arcSectorAirspace`.
- Produces: `public static distanceToBoundaryNm(boundary: LodBoundary, lat: number, lon: number): number` (0 when the
  point is inside, else the lateral distance to the nearest edge of any ring); in `AirspaceAlert.ts`
  `const ALERT_DISTANCE_NM = 2` (3-40, B-1).

- [ ] **Step 1: Write the failing tests**

Unit, `describe('distanceToBoundaryNm (#189)')`:
- a square from `airspace()` around 47N 8E: a point 1 NM west of the west edge → `toBeCloseTo(1, 1)`; a point inside →
  `0`.
- the 10 NM circle: a point 12 NM from the center → within 0.06 of 2; the arc sector: a point at bearing 45, 11 NM →
  within 0.06 of 1 (a chord would give about 3.9).
- `dateLineBox` (top of the file): at 15N 178.9E → within 0.1 of `0.1 * 60 * Math.cos(15 * Math.PI / 180)`; at 15N
  179.5W → 0.

Render, `describe('AIRSPACE ALERT within 2 NM (3-40, B-1)')`:
- `it.fails('alerts on a track along the area 1 NM away (3-40, B-1, #189)')` becomes `it(…)`; drop `#189` from the
  sibling's comment that calls it "the pin".
- `'does not alert on a track along an area 3 NM away (3-40, B-1)'`: `box(47 - 12 * NM_LAT, 47 + 12 * NM_LAT, 8 + 3 *
  NM_LON, 8 + 10 * NM_LON)` named `R-FAR`, `flying(0, …)` → `[]`.
- `'does not alert along an area 1 NM away whose floor is above the aircraft and the buffer (3-39, 3-40)'`: `beside()`'s
  box with `{minFt: 5000, maxFt: 18000}` → `[]`.
- `'alerts beside a circular area 1 NM away (3-40, B-1, #189)'`: `circularAirspace('R-CIRCLE', BoundaryType.Restricted,
  [47.0, 8 + 11 * NM_LON], 10, LIMITS)`, `flying(0, …)` → `['AIRSPACE ALERT: R-CIRCLE          REST 1000ft to 18000ft']`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/data/navdata/BoundaryUtils.test.ts test/render/data/navdata/AirspaceAlert.test.ts`
Expected: the distance tests fail (no such method), the two alerting render tests fail; the no-alert tests pass.

- [ ] **Step 3: Implement**

`distanceToBoundaryNm`: `isInside` → 0; otherwise the minimum over all ring segments of the point-to-segment distance in
a local flat projection around the point (x = Δlon·cos(lat)·60, y = Δlat·60 NM, with the segment's longitudes unwrapped
around the point's longitude). In `checkNearAirspaces`: `warn = isVerticallyInside && (crosses the 10-minute projection
|| BoundaryUtils.distanceToBoundaryNm(airspace, lat, lon) <= ALERT_DISTANCE_NM)`. Re-alerting stays as it is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the command of Step 2, then `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**

`docs/architecture.md`, **Alerts**: the alert warns on the 10-minute projection or within 2 NM.

```bash
git add kln90b/data/navdata/BoundaryUtils.ts kln90b/data/navdata/AirspaceAlert.ts test/unit/data/navdata/BoundaryUtils.test.ts test/render/data/navdata/AirspaceAlert.test.ts docs/architecture.md
git commit -m "fixes #189 alert within 2 NM of a special use area, not only on the 10 minute projection"
```

---

### Task 3: One area per group of copies (#410)

**Files:**
- Create: `kln90b/data/navdata/AirspaceAreas.ts`
- Modify: `kln90b/data/navdata/AirspaceAlert.ts` (`nearAirspaces`, `warnedAirspaces`, `enteredAirspaces`,
  `refreshAirspaceList`, `checkNearAirspaces`)
- Modify: `kln90b/data/navdata/NearestUtils.ts:38,116-125` (`airspaceMap`)
- Modify: `test/harness/navdata/MemoryFacilityClient.ts` (new `removeAirspace`)
- Test: create `test/unit/data/navdata/AirspaceAreas.test.ts`; `test/render/data/navdata/AirspaceAlert.test.ts`;
  `test/render/data/navdata/NearestUtils.test.ts`
- Docs: `docs/architecture.md` (**Alerts**, and the `NearestUtils` paragraph)

**Interfaces:**
- Produces in `AirspaceAreas.ts`:
  - `export function airspaceAreaKey(facility: BoundaryFacility): string`: type, `minAlt`, `minAltType`, `maxAlt`,
    `maxAltType`, then every vector's type, lat and lon (5 decimals) and radius (whole meters).
  - `export class AirspaceAreas { add(boundary: LodBoundary): void; remove(id: number): void; areas(): LodBoundary[];
    keyOf(boundary: LodBoundary): string }`. `add`/`remove` keep today's per-id bookkeeping of the search session;
    `areas()` returns one boundary per key: the shortest `facility.name`, ties by the lowest `facility.id`.
- `AirspaceAlert` keeps `warnedAirspaces: Set<string>` and `enteredAirspaces: Set<string>` of keys (Task 4 moves them).

- [ ] **Step 1: Write the failing tests**

Unit (`AirspaceAreas.test.ts`, polygons from `airspace()`, all invented):
- two facilities with the same polygon, type and limits but names `R-4711 ALPHA` and `R-4711` have the same key; a
  third with other limits, another type, or one corner moved by 0.001° has a different key (three `it`s).
- `areas()` after adding both copies returns exactly the `R-4711` boundary; with equal name lengths the lower id wins.
- after `remove(<id of R-4711>)`, `areas()` returns the `R-4711 ALPHA` boundary; after removing both, `[]`.

Render (`AirspaceAlert.test.ts`, new `describe('copies of one area (#410)')`, the copies built by two `airspace()` calls
on the same `box(…)`):
- `'gives one AIRSPACE ALERT for two copies of an area, under the shortest name (#410)'` →
  `['AIRSPACE ALERT: R-4711            REST 1000ft to 18000ft']`, with copies `R-4711 ALPHA` and `R-4711` 5 minutes ahead.
- `'gives one INSIDE SPC USE AIRSPACE for two copies of an area (#410)'`, parked inside.
- `'gives no second AIRSPACE ALERT when the copy with the shortest name leaves the search (#410)'`: after the alert,
  remove the `R-4711` copy through `MemoryFacilityClient.removeAirspace` (add that harness method if it is missing,
  mirroring `addAirspace`), advance one alert period → still exactly one message.

Render (`NearestUtils.test.ts`): `'lists two copies of an area once (#410)'`: `getAirspacesAt` at a point inside two
copies returns one boundary, the shorter-named one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/unit/data/navdata/AirspaceAreas.test.ts test/render/data/navdata/AirspaceAlert.test.ts test/render/data/navdata/NearestUtils.test.ts`
Expected: the new tests FAIL (missing module, two messages, two boundaries).

- [ ] **Step 3: Implement**

`AirspaceAlert.nearAirspaces` and `NearestUtils.airspaceMap` become `AirspaceAreas`; their consumers iterate
`areas()`. `checkNearAirspaces` tracks warned and entered areas by `keyOf(airspace)` instead of by object. The message classes do
not change in this task. `MemoryFacilityClient` gains `removeAirspace(id: number): void`, the counterpart of
`addAirspace` (line 170): the next search reports the id as removed.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the command of Step 2, then `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**

`docs/architecture.md`: the alert and `NearestUtils` keep one area per group of identical copies (the sim holds most
areas two or three times), under the shortest name.

```bash
git add kln90b/data/navdata/AirspaceAreas.ts kln90b/data/navdata/AirspaceAlert.ts kln90b/data/navdata/NearestUtils.ts test/unit/data/navdata/AirspaceAreas.test.ts test/render/data/navdata/AirspaceAlert.test.ts test/render/data/navdata/NearestUtils.test.ts test/harness/navdata/MemoryFacilityClient.ts docs/architecture.md
git commit -m "fixes #410 merge identical copies of an airspace into one area for the alert and the airspace lists"
```

---

### Task 4: Airspace messages that live with their condition (#412)

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState` fields; `VolatileMemory.reset`)
- Modify: `kln90b/data/navdata/AirspaceAlert.ts` (key sets move to `navState`; entering ends the alert; disabled or
  inhibited clears the sets)
- Modify: `kln90b/data/MessageHandler.ts:83-108` (both airspace message classes)
- Test: `test/render/data/navdata/AirspaceAlert.test.ts`
- Docs: `docs/architecture.md` (**Alerts**)

**Interfaces:**
- Consumes: `AirspaceAreas.keyOf` (Task 3), `BoundaryUtils.isInside`.
- Produces on `NavPageState`: `public readonly airspaceWarnedKeys = new Set<string>()` and
  `public readonly airspaceEnteredKeys = new Set<string>()`, both cleared in `VolatileMemory.reset` on power-on.
- `AirspaceAlertMessage(message: string[], airspace: LodBoundary, key: string, sensors: Sensors, navState:
  NavPageState)` and `InsideAirspaceMessage(…same…)` implement `Message` directly (not `OneTimeMessage`):
  - AIRSPACE ALERT: valid while `navState.airspaceWarnedKeys.has(key)` and the live position is not laterally inside.
  - INSIDE SPC USE AIRSPACE: valid while `navState.airspaceEnteredKeys.has(key)` and the live position is laterally
    inside.

- [ ] **Step 1: Write the failing tests**

All in `test/render/data/navdata/AirspaceAlert.test.ts`, new `describe('airspace messages while their condition holds
(characterization, #412)')`, with a comment naming the source (AVsoftech KLN 90B trainer, 2026-10-22). Read the MSG
page with `unit.panel.msg()`, advance 1000 ms, `msg()` again, as the existing tests do:
- `'keeps AIRSPACE ALERT after it was read while the area is still ahead (characterization, #412)'`: `fiveMinutes()`;
  read; advance one alert period → `['AIRSPACE ALERT: R-AHEAD           REST 1000ft to 18000ft']`.
- `'keeps INSIDE SPC USE AIRSPACE after it was read while inside (characterization, #412)'`: `R-AROUND` around the
  aircraft; read; advance one period → `['INSIDE SPC USE AIRSPACE R-AROUND          REST 1000ft to 18000ft']`.
- `'alerts again on leaving an area within 2 NM (characterization, #412)'`: inside `R-AROUND` (`box(46.9, 47.1, 7.9,
  8.1)`), then `moveAircraft` to `{lat: 47.1 + NM_LAT, lon: 8.0}`, track 0, advance one period →
  `['AIRSPACE ALERT: R-AROUND          REST 1000ft to 18000ft']`.
- `'shows AIRSPACE ALERT again after a power cycle while the area is still ahead (characterization, #412)'`:
  `fiveMinutes()`; `powerCycle()`; `approveSelfTest()`; advance `NEAREST_SEARCH_WAIT_MS` →
  `['AIRSPACE ALERT: R-AHEAD           REST 1000ft to 18000ft']`.
- `'removes AIRSPACE ALERT when the alert is disabled on SET 8 (characterization, #412)'`: `fiveMinutes()`; set
  `unit.props.userSettings.getSetting('airspaceAlertEnabled')` to `false`; advance one period → `[]`.

The existing characterization tests around lines 189-247 and 153-168 must stay green unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/render/data/navdata/AirspaceAlert.test.ts`
Expected: the "keeps", "alerts again on leaving" and "power cycle" tests FAIL; the SET 8 test may already pass (the
read message is gone today); it guards the new code.

- [ ] **Step 3: Implement**

Move the key sets to `navState`, clear them in `VolatileMemory.reset` with a `//#412` comment. In
`checkNearAirspaces`, an entered area is also deleted from the warned keys. When `tick` returns early because the alert
is disabled (SET 8) or inhibited in ARM/APR (3-41), clear both key sets. Both messages implement `Message` with their
own `seen` field and the conditions of the Interfaces block; `OneTimeMessage` stays for other users.

- [ ] **Step 4: Run the tests to verify they pass**

Run: the command of Step 2, then `npm test`. Expected: all PASS.

- [ ] **Step 5: Commit**

`docs/architecture.md`, **Alerts**: AIRSPACE ALERT and INSIDE SPC USE AIRSPACE stay while their condition holds; the
warned and entered areas live on `NavPageState` and are reset at power-on.

```bash
git add kln90b/data/VolatileMemory.ts kln90b/data/navdata/AirspaceAlert.ts kln90b/data/MessageHandler.ts test/render/data/navdata/AirspaceAlert.test.ts docs/architecture.md
git commit -m "fixes #412 keep the airspace messages while their condition holds"
```
