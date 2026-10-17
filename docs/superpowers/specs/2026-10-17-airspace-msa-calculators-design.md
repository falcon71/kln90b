# Airspace, MSA and TRI/CAL calculators: design

Date: 2026-10-17. Milestone "Airspace, MSA and TRI/CAL calculators". Issues: #102, #106, #166, #167, #181, #251, #254,
#257, #314, #346, #352, #388, #389, #390, #391. Branch: `m7-airspace-calc`.

The milestone held ten bugs and one question (#257). A read-only inventory measured every candidate fix against the full
suite and found four more bugs, which were filed as #388 to #391 and added to the milestone by the maintainer. A trainer
agent checked the KLN 89 trainer and the third-party AVsoftech KLN 90B trainer.

## 1. Evidence

**Maintainer rulings (2026-10-17).**
- #352: besides the floor check, a Class B or C message shows only its upper limit (`BELOW <top>ft`).
- #102: one search session whose map mirrors the session's result, searches queued (option B of the inventory).
- #181: the exact sector walk, limited to the leg's latitude range.
- #257, #314, #346, #389, #167: a computed value that does not fit its field shows dashes; an editable field showing
  dashes holds no value, and a digit edit starts from 0 (section 5A).
- #254: the TRI 5 GS row shows the plan distance over the summed leg times.
- #388 to #391 join the milestone, each as its own commit.
- The design was approved in chat in three sections (airspace, ESA and calculators, execution).

**KLN 89 trainer, 2026-10-17** (agent report in the session scratchpad `trainer/report.md`; recorded in
`docs/kln89-trainer-record.md`).
- K1 (#352): not testable. The trainer has no altitude input and its demo database holds no special use airspace.
- K2 (#251): NRST CTR changed from the Chicago to the Minneapolis Center by itself while it stayed on screen, flown
  across the boundary at about 940 kt; the change came 0 to about 15 s after the crossing. Medium-high confidence.
- K3 (#257): computed values that do not fit show dashes; nothing was capped, cut or blanked. CAL 1's ETE (one hour
  digit) showed ` -:--` from 10 h and at GS 0; CAL 2's fuel required showed `----` above 9999 and at GS 0; CAL 6's TAS
  showed `---kt` above 999. The exact edges (9:59, 9999) were not checked.
- K4 (#181): a 35 NM CAL 1 trip from a cell with MSA 3200 into one with 3400 gave ESA 3400.
- K5 (#390): changing only the CAL 8 zone left the date row as entered, and sunrise and sunset shifted by exactly the
  zone offset (no other day's times), also where the new zone's date of that instant was the day before.

**AVsoftech KLN 90B trainer, 2026-10-17** (third-party, unreliable).
- CAL 5: 40 °C shows `104°F` (the sign cell carries the hundreds digit); -80 °C shows `-11°F` (cut, not dashed); from
  899 kt the mph row is `---MPH`. Entries stop at three digits.
- CAL 4: the angle knob stops at 9.9; an angle of 10.0 or more shows `-.-°`; GS 600 at 9.4° shows `FPM: ----`
  (9.3° gives 9950); FPM takes no entry above 9999.
- TRI 1 and TRI 3 at GS 0: `000KT --:--` and `F REQ -----`.
- Its TRI wind math is broken (the ground speed does not depend on the course), so it settles neither #167 nor #254.

**Pilot's Guide.** 3-33 (MSA and ESA), 3-39 to 3-41 (special use airspace alert; 3-40: Class B, C, CTA and TMA are
stored as cylinders by their outer boundary; figure 3-126 shows an alert with an upper limit only), 3-42 (APT 1
airspace row), 3-52 (OTH 2: the Center for the present position), 5-2 to 5-6 (TRI 0 to TRI 6), 5-11 (CAL 2), 5-12
(CAL 3, CAL 4), 5-13 (CAL 5), 5-15 (CAL 7). The guide is silent on values out of range.

**SDK** (`@microsoft/msfs-sdk` 2.3.3, source in the avionics mirror). A nearest search session reports what was added
and removed since its previous search; a new filter takes effect at the next search. Sessions cannot be closed. The
`NearestLodBoundarySearchSession` builds its boundaries in a throttled queue per search, so a large search can finish
after a later one. The SDK's own `MapAirspaceLayer` uses one session with a mirrored map.

**Inventory (2026-10-17).** Read-only, detached worktree at master 4914b52; report and patches in the session
scratchpad `inventory/`. Baseline: tsc clean, 4219 tests pass, 46 expected fails. All candidate fixes together change
exactly the pins named below plus two other tests (the vehicles in 2A and 3); the effects add up.

## 2. Airspace search (#102, #391, #251)

**A. One session, two queries (#102).** `NearestUtils` keeps one `NearestLodBoundarySearchSession`. Its map mirrors the
session's current result: every `added` airspace goes in, every `removed` id comes out. All boundary searches of
`NearestUtils` run one at a time through a promise queue. The API is split:
- `getAirspacesAt(lat, lon, maxItems, filter)`: a search at radius 0 that returns only the airspaces whose shape
  contains the point (`BoundaryUtils.isInside`). Used by OTH 2 and by the APT 1 airspace row
  (`AirportCoordOrNearestView`), which moves from a radius of 10 m to 0.
- `getAirspaces(lat, lon, radius, maxItems, filter)`: the unfiltered result, for the route searches of TRI 2, 4 and 6
  and CTR 1 (`services/AirspacesAlongRoute.ts`). It keeps its name; CTR tests spy on it.
The same commit replaces `Array(n).fill([])` in both route functions with one array per leg. The pins in
`AirportCoordOrNearestView.test.ts`, `NearestUtils.test.ts`, `AirspacesAlongRoute.test.ts` and `Ctr1Page.test.ts`
become spec tests. Vehicle: the #362 characterization in `Ctr2Page.test.ts` (its precondition came from the bug). The
text that describes #102 changes with it: `test/harness/fixtures.ts`, the `centerWorld` paragraph of `test/README.md`,
and the comments in `Tri2Page.test.ts`, `Tri6Page.test.ts`, `render/harness/airspaces.test.ts`, `Ctr1Page.test.ts`
and `Ctr2Page.test.ts`. Spec: 3-42, 3-52, 5-3 to 5-6, 5-25 to 5-27.

**B. A leg without length (#391).** `splitLeg` uses at least one circle (`Math.max(1, ...)`), so a leg of length zero
searches at its start with radius 0 instead of NaN. After A.

**C. OTH 2 follows the aircraft (#251).** While shown, OTH 2 searches again every 10 s, the pattern of NAV 2 (a
countdown in the display ticks and an `isSearching` guard). It keeps showing the old Center until the new result
arrives. The pin in `Oth2Page.test.ts` becomes a spec test. Spec: 3-52; the KLN 89 check K2 supports that the page
updates while shown; the 10 s interval is the project's common search cadence, not observed. After A.

## 3. Boundaries and the alert (#106, #352)

**A. The date line (#106).** `BoundaryUtils.intersects` and `getIntersections` unwrap the ring and the path around one
reference longitude: 180 for a box that crosses the date line, otherwise the middle of the box. The path's second
longitude becomes its first plus the wrapped difference. `intersects` becomes `getIntersections(...).length > 0`.
`GeoPoint` normalizes the resulting longitudes. `isInside` stays as it is (#9). The issue's suggestion (360 added to
every negative longitude) does not fix its first case. Both pins in `BoundaryUtils.test.ts` become spec tests.

**B. Class B and C are cylinders (#352).** `AirspaceAlert.isVerticallyInsideAirspace` skips the floor check for
`BoundaryType.ClassB` and `ClassC`; the ceiling check with the SET 8 buffer stays. The INSIDE and ALERT messages of a
Class B or C show only the upper limit (`BELOW <top>ft`). CTA and TMA stay out of the filter (the existing TODO). Tests
beside the vertical-limit tests of `AirspaceAlert.test.ts`: a Class B sector at 1500 ft below its 3000 ft floor alerts,
with its text; the sibling at 5000 ft; a restricted area below its floor stays silent. Spec: 3-40 and figure 3-126.

## 4. The ESA of a leg (#181)

`MSA.getMSAFromTo` intersects the leg's great circle with the whole-degree meridians inside the leg and with the
whole-degree parallels inside the leg's latitude range, the vertex of the great circle included. It samples the start,
the end, and the midpoint between each pair of consecutive crossings, so every 1° sector the leg touches counts.
`getMSA` and the polar limits stay. The pin in `MSA.test.ts` becomes a spec test; the #97 test stays green. Vehicle:
the TRI 6 snapshot in `Tri6Page.test.ts`, whose ESA goes from 11400 to 11600 (the leg from ABC to KBBB crosses 9 E at
47.73 N into the 11600 sector). NAV 3 calls this for every remaining leg in every display tick, so the parallels are
limited to the leg's latitude range. Spec: 3-33; the KLN 89 check K4 shows a short trip taking its end cell's MSA.

## 5. The calculators

**A. Values that do not fit (#257).** Every numeric display and fieldset on CAL 1 to 7 and TRI 0 to 6 takes
`number | null` and decides for itself whether a value fits. Null, NaN, a negative value where the field has no sign,
or a value too large for the field's cells shows dashes in the field's own width (for example CAL 4 angle `-.-`, FPM
`----`; CAL 5 mph `---`; TRI GS `---`, distance `----`, ETE `--:--`, F REQ `-----`). A temperature field uses its sign
cell as the hundreds digit for a positive value (104 °F fits) and shows dashes from -100. An editable field that shows
dashes holds no value: a digit edit first treats every digit as 0, then applies the turn, and the result drives the
page's recalculation as if typed fresh. Values the code already shows within their field (CAL 1's pressure and density
altitude) stay as they are. The 90B's own dash forms per field are characterizations; the KLN 89 check K3 supports only
that out-of-range values show dashes. This commit comes before 5B to 5D.

**B. CAL 4 and the CAL 2 to CAL 3 carry (#314, #346, #389)**, one commit each, on 5A:
- #314: an angle that rounds to 10.0 or more shows `-.-`. The pin in `VnavFieldsets.test.ts` becomes a spec test.
- #346: a rate of 9950 ft/min or more (after `Cal4Page.setAngle` rounds it to 100) shows `----`, and a digit edit
  starts from 0, not from a hidden fifth digit.
- #389: CAL 2 shows a TAS above 999 as `---` and hands CAL 3 no TAS; CAL 3's TAS then shows dashes and its wind rows
  show dashes too.
Spec: 5-11, 5-12.

**C. Ground speed along a course (#167, #254, #388)**, in this order, on 5A:
- #167: `calculateGroundspeedAlongCourse(tas, course, windSpeed, windDir)` = sqrt(TAS² - crosswind²) - headwind, with
  the radicand clamped at 0. With no solution (crosswind above the TAS) or a result of 0 or less it returns null, and
  GS, ETE and F REQ show dashes. TRI 1, 3 and 5 use it; the old heading formula goes (CAL 3 and OTH 9 use the wind
  solvers). The pin in `Tri3Wind.test.ts` becomes a spec test. Spec: 5-2, 5-3, 5-5.
- #254: TRI 5's ETE is the sum of the leg times, and its GS row shows the plan distance over that time. An edit of the
  GS row still gives ETE = distance / GS. The pin in `Tri5Page.test.ts` becomes a spec test. Spec: 5-6.
- #388: a leg of length zero (the same waypoint twice) adds no distance and no time to TRI 5's sums.

**D. CAL 7 (#166, #390)**, in this order:
- #166: `VolatileMemory` stores CAL 7's date as a calendar date (year, month, day) instead of a UTC stamp, and
  `Sun.ts` computes sunrise and sunset for that calendar date in the selected zone. The pin in `Sun.test.ts` becomes a
  spec test (or moves with the change of signature).
- #390: a zone change leaves the date as entered, and the times follow the zone; re-entering the page no longer
  converts the date. Spec: 5-15; the KLN 89 check K5.

## 6. Execution

- Branch `m7-airspace-calc` from master. First commits: this design, the plan, and a dated block for the KLN 89 checks
  K2 to K5 in `docs/kln89-trainer-record.md`. The AVsoftech results stay in this design only.
- Lanes, each a chain of tasks in order; lanes run in parallel and touch disjoint files:
  - A1 airspace search: #102, #391, #251.
  - A2 boundaries and alert: #106, #352.
  - B ESA: #181.
  - C1 TRI and CAL values: #257, #314, #346, #389, #167, #254, #388.
  - C2 CAL 7: #166, #390.
- One fresh worktree agent per task, starting with `git merge --ff-only m7-airspace-calc`. Each task is one
  `fixes #NN` commit with its test and doc changes; after review it is cherry-picked onto the integration branch at
  once, so the lane's next task builds on it.
- Every condition a task adds has a named test that turns red when that condition is dropped; reviewers check by
  mutation. Test titles cite only what their source literally shows.
- Each task runs `npm test`, `npx tsc --noEmit` and `npm run build` before its commit.
- No public contract changes (H events, LVars, panel.xml keys, SimVars, persisted keys); no wiki change.
- Close-out: a final review of the whole branch, then a local merge into master once the maintainer approves. No push.

## 7. Amendments (2026-10-17, while writing the plan)

- **The trainer record.** The AVsoftech results go into the 2026-10-17 block of `docs/kln89-trainer-record.md` as well,
  marked unreliable, as earlier blocks do (section 6 said "this design only").
- **5A, the dash forms.** A field that does not fit shows the no-value form it already has: F REQ `---.-`
  (`TripFuelDisplay`), ETE `--:--`, distance `----`, speed `---`. The forms in 5A are examples, not new texts. The rule
  lives in the shared displays (`SpeedDisplay`, `DurationDisplay`, `TripFuelDisplay`, `RoundedDistanceDisplay`) and in
  `VnavAngleFieldset`, so it also reaches the other pages that use them (NAV 1, Super NAV 1 and 5, NAV 4, OTH 6 and 9,
  D/T 1 to 4). There a value out of range is either unreachable or overflowed its row before.
- **5A, a temperature with a hundreds digit.** A positive temperature of 100 or more is shown with the hundreds digit
  in the sign cell, but the field cannot be edited from there: a turn on any of its cells works as on a dashed field.
  The sign cell's own choices stay `-` and `0`.
- **5A to 5C, the split.** #257 adds the dash mechanism (`SelectField.displayOverride`) and applies it to
  `SpeedFieldset`, `TempFieldset` and the four displays. #314 applies it to `VnavAngleFieldset`, #346 to `FpmFieldset`,
  and #389 adds CAL 3's guard (a TAS that does not fit gives no wind). A TRI page with no route keeps showing GS `000`;
  only a speed without a solution shows dashes.
- **5C, #388.** A plan whose legs all have no length shows GS dashes and an ETE of `0:00`.
- **5D, the split.** #166 is the fix in `Sun.ts` (the day of the year and the returned date from the stamp's own
  zone) plus CAL 7 handing it the date as shown in the selected zone. #390 then stores the calendar date in
  `VolatileMemory` (`cal7Date`, replacing `cal7DateZ`), so a zone change and a return to the page keep the date as
  entered; the date of first use is today in the selected zone.
