# Airspace alert: circles and arcs (#209), the 2 NM rule (#189), duplicate areas (#410), message lifetime (#412): design

Date: 2026-10-22. Status: approved by the maintainer on the date it was committed.

## Intent

The special use airspace (SUA) alert and the airspace lists should work on the airspace data the sim really delivers.
Today three things break that:

- **#209:** `BoundaryUtils` reads only the end points of a boundary's vectors. A circle is two points, so it is never
  "inside" and never crossed, and an arc is replaced by its chord. A dump of the sim's own data (2026-10-22) confirmed
  that the sim hands out true arcs (`ArcCW`, `ArcCCW` with an `Origin`) and full circles (`Origin` plus `Circle`); it
  does not cut them into lines itself. Measured on real navdata (AIRAC 2607), a chord is more than 2 NM off the arc in
  3971 arcs, and up to 286 NM off at worst.
- **#189:** the alert implements only the 10-minute rule. 3-39 and 3-40 also alert within about 2 NM of an area. The
  2 NM rule needs the distance to the true edge, so it builds on #209.
- **#410:** the sim holds most areas two or three times, as separate boundaries with identical type, limits and
  vectors but different names (one Seattle Class B sector as `SEATTLE AREA P`, `ANM WA B SEATTLE (P)` and `SEATTLE`).
  The alert tracks areas by object, so one area posts one message per copy, and the TRI and CTR lists repeat it.
- **#412:** AIRSPACE ALERT and INSIDE SPC USE AIRSPACE are one-time messages that leave the MSG page once read. The
  maintainer decided (2026-10-22) that they stay while their condition holds, on the evidence of 3-16 and the AVsoftech
  trainer (below).

#210 (the Class B/C airport line and the controlling agency line) was researched in the same session and closed as not
planned; the research is in the issue. It changes nothing here except a line in `docs/architecture.md` (see Docs).

## Goals

- Every user of `BoundaryUtils` sees circles and arcs as what they are: the alert and the INSIDE message, APT 1 and
  OTH 2 (`NearestUtils.getAirspacesAt`), and the TRI 2/4/6 and CTR 1 lists (`AirspacesAlongRoute`), crossing points
  included.
- AIRSPACE ALERT also comes when the aircraft is within 2 NM of an area laterally and inside its altitude band plus the
  buffer (3-39, 3-40, B-1).
- One area gives one message and one list entry, however many copies the sim holds.
- Both airspace messages stay on the MSG page while their condition holds, read or not.

## Non-goals

- The #210 texts (closed as not planned).
- CTA, TMA and CAUT in `SPECIAL_USE_AIRSPACE_FILTER` (its TODO), and sim data with a wrong type (a Class E5 area typed
  Class C, non-US CTAs typed Class C).
- The 100-boundary limit of the alert's search. Copies use up places in it; merging copies does not win them back.
  Raising it is a separate decision.
- The "still closing in" TODO of `AirspaceAlertMessage`.
- Drawing airspaces anywhere (the unit draws none on NAV 5, 3-38).

## Anti-goals

- **A noticeable stall.** The sim freezes while instrument JS runs. The maintainer's bar: the worst-case work of one
  alert check, assumed 10 times slower in Coherent GT on a slow user PC than in Node on the maintainer's PC, must stay
  well under one 30 fps frame (33 ms).
- **Behavior beyond the real unit.** No invented hysteresis or margins; where the sources are silent, keep today's
  behavior.

## Constraints

- `target: es2017` (Coherent GT); no new dependencies.
- No public contract changes (H events, LVars, panel.xml, SimVars, persisted data).
- One commit per issue, each with its tests and docs: `fixes #209`, `fixes #189`, `fixes #410`, `fixes #412`. #189
  comes after #209.
- Test facilities stay invented; the licensed navdata and the sim dump stay out of the repo.
- Manual citations in comments and test titles follow `test/README.md` (spec vs. characterization labels).

## Approaches

### #209: how to handle arcs and circles

Measured by a throwaway benchmark (2026-10-22) on 26480 real airspaces in the sim's vector form, at the densest real
spots (100 boundaries within 100 NM), in Node on the maintainer's PC. One alert check = inside test, crossing test over
the 10-minute projection, and edge distance, for every boundary.

| Approach | Alert check, worst (ms) | Route search, 30 legs (ms) | Inside/outside wrong near arcs |
|---|---|---|---|
| Today's code | 0.06–0.19 | 0.26–1.98 | 40 % |
| A: chords, plus an exact circle case | 0.06–0.18 | 0.23–1.38 | 22 % |
| B: exact spherical math on the SDK's `GeoCircle`s | 0.39–0.65 | 1.77–3.49 (cached: 1.06–1.67) | 0.08 % |
| **C: arcs and circles cut once into a polyline (≤ 0.05 NM off), cached, today's flat math** | **0.05–0.34** | **0.12–1.12** | 0.5 % (only within 0.05 NM of the edge) |

- **A** is ruled out: it does not deliver arcs, and its edge distance is off by more than 2 NM on thousands of arcs.
- **B** passes for the alert, but the route search reaches about 35 ms at the 10× assumption without a cache, and it
  mixes spherical and flat geometry.
- **C is chosen** (the maintainer's rule: true arcs only if the cost is negligible). At 10× it is about 3 ms per alert
  check. Cutting costs 0.1–0.9 ms once per 100 boundaries, about what building the SDK's `LodBoundary` objects costs
  today, and about 35 KB of memory.

### #410: how to merge copies

1. **Merge copies where search results are collected (chosen).** The alert's own list and `NearestUtils`' shared list
   keep one area per group of identical copies. Fixes the messages, APT 1/OTH 2 and TRI/CTR at once.
2. Merge only in the alert's warned/entered bookkeeping: smaller, but TRI and CTR keep listing copies.
3. Match copies by similar names: fragile, `ANM WA B SEATTLE (P)` and `SEATTLE` share little text.

## Decisions

### #209: geometry on a cached polyline

- `BoundaryUtils` gains a cached polyline per boundary, built on first use (a `WeakMap` keyed by the `LodBoundary`, or
  equivalent, so it goes with the boundary). It is built from `lods[0]`, **every shape** of it (today only the first
  shape is read; the dump found one shape per boundary, but nothing guarantees it). Each vector runs along its
  `GeoCircle` from the previous end point to its own end: a great circle for a line, a small circle for an arc or a
  circle. Lines stay single segments; arcs and circles are cut so that no chord is more than 0.05 NM off the curve.
- `isInside`, `intersects` and `getIntersections` run today's flat algorithm over every shape of the polyline, with the
  date-line handling they have now (#9, #106).
- The SDK takes an arc's radius from its end point; in real data the start point is sometimes off that circle (median
  0.02 NM, max 1.36 NM). The polyline follows the SDK's circle, as the SDK does.

### #189: the 2 NM rule

- New `BoundaryUtils.distanceToBoundaryNm(boundary, lat, lon)`: the lateral distance from a point to the nearest edge of
  the polyline, over every shape.
- `AirspaceAlert.checkNearAirspaces` warns when the aircraft is vertically inside the band plus buffer (as today) and
  either the 10-minute projection crosses the area (as today) or the distance is 2 NM or less.
- **Re-alert:** unchanged. The code forgets an area as soon as its warning condition is false, and alerts again when it
  holds again. No margin is added. The AVsoftech KLN 90B trainer (third-party, unreliable; checked 2026-10-22) behaved
  the same way: one entry while the aircraft stayed within about 2 NM for over 3 minutes, gone at about 2.3–3.2 NM, and
  a new alert for the same area each time the condition held again (by proximity, by projection, or on leaving the
  area). It alerted at 0.88, 1.15 and 1.3 NM on tracks whose projection never entered the area, which supports the
  2 NM rule itself.

### #410: one area per group of copies

- **Identity:** an area key built from type, the minimum and maximum altitude and their types, and the vectors (type,
  rounded lat/lon, radius). Copies share the key; the dump found no copies that differ in geometry.
- **Where:** the alert's `nearAirspaces` and `NearestUtils`' `airspaceMap` keep their per-id bookkeeping (the search
  reports additions and removals by id) and hand out one representative per key.
- **Representative:** the copy with the shortest name, ties by lowest id. Short names tend to be the plain ones
  (`SEATTLE`, `RAINIER 2 MOA`, `R-6703I`). When the representative is removed but other copies stay, the next one
  takes over.
- **Alert bookkeeping:** `warnedAirspaces` and `enteredAirspaces` remember areas by key, not by object, so a change of
  representative does not post a second message.

### #412: messages that live with their condition

- AIRSPACE ALERT stays valid while the alert still warns of that area (the area's key is among the warned areas);
  INSIDE SPC USE AIRSPACE stays valid while the aircraft is inside the area (among the entered areas). Reading the
  message no longer removes it.
- **Entering an area ends its alert** (decided from the trainer, which replaced the alert with the INSIDE message and
  alerted again right after the aircraft left the area): an entered area is dropped from the warned areas, so leaving
  it within 2 NM posts a new AIRSPACE ALERT. Today's characterization test "removes AIRSPACE ALERT once the aircraft is
  in the area" keeps passing.
- **The live check stays** (my call, to keep today's timing): besides the list membership, each message keeps today's
  lateral test against the live GPS position on every message tick (AIRSPACE ALERT goes once laterally inside, INSIDE
  goes once laterally outside). The lists change only every 10 s; the live test makes the messages go at once, as today,
  and the characterization test "removes INSIDE SPC USE AIRSPACE once the aircraft has left the area" keeps passing.
- When the condition ends the message goes; when it holds again a new message is posted, as today, so MSG flashes
  again.
- **Power cycle** (my call): `MessageHandler.clear()` drops all messages at power-off, but the warned and entered areas
  live on the `AirspaceAlert` service and survive it, so a condition that still holds after power-on would never post
  again. The bookkeeping moves to `VolatileMemory` and is reset there at power-on (the maintainer's rule that services
  keep no mutable state), so the first check after power-on posts the messages again. A power-cycle test covers it.
- With the alert disabled on SET 8 or inhibited in ARM/APR (3-41), the checks stop running; the builder decides
  whether open messages then go at once or stay until the next check, keeping today's behavior where a test pins it.

## Tests

- `test/unit/harness/airspaces.test.ts:180` documents the circle gap (`isInside` false at the center) and flips.
- `test/render/data/navdata/AirspaceAlert.test.ts`, the `it.fails` pin for #189, turns into a passing test.
- New: unit tests for inside, crossing and distance on a circle and on an arc (with an arc vector in the harness's
  `airspace()` builder or a new one); a render test for INSIDE SPC USE AIRSPACE in a circular area; a render test for
  two copies of one area giving one message; a test that the 2 NM rule respects the vertical band; render tests that
  both airspace messages are still listed after the MSG page was read, and go when the condition ends (#412).
- A performance guard is not planned as a test (timing tests are flaky); the benchmark numbers above are the record.

## Docs

- `docs/architecture.md`: drop "circular airspaces" from the "missing on purpose" list, describe the cached polyline and
  the merge of copies in the airspace section, and add the #210 texts to the "missing on purpose" list.
- `test/README.md`: the note that the instrument ignores circular airspaces (#209).

## Left to the builder

- The exact cutting step, the cache's shape, and the rounding of the area key.
- Where the merge helper lives (shared by `AirspaceAlert` and `NearestUtils`).
