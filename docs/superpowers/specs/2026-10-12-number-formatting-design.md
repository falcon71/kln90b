# Number formatting, radials and editors: design

Date: 2026-10-12. Milestone 7. Issues: #223, #230, #245, #263, #280, #282, #287, #302, #304, #337, #339, #340, #341,
#361, #362, #363, #365. Branch: `milestone-7-number-formatting`.

The session started from the thirteen issues of the milestone. An inventory of the code found three more bugs of the
same kind, filed as #361 (more formatters that show 360), #362 (CTR 2 converts with the local variation) and #363
(arc entry names built from the true radial). Checking #363 found #365 (the published arc radials are magnetic but
used as true). The maintainer added all four to the milestone. Also filed, outside the milestone: #364 (the 89
measures distances on the WGS-84 ellipsoid; enhancement).

## 1. Evidence

**KLN 89 trainer, 2026-10-12** (this session; recorded in `docs/testing.md` section 8 with the fixes). High
confidence unless noted.
- **ETE minutes (#223).** CAL 1 rounds to the nearest minute: from the present position to an airport 94.9 NM away,
  all fourteen readings where rounding and truncation differ came out rounded, among them GS 95 kt showing `1:00` for
  about 59.9 minutes and GS 19 kt showing `5:00` for about 299.6 minutes. NAV 1 truncates: in flight at 59 kt,
  `3.7nm` to `3.5nm` showed `0:03` and the minute dropped exactly as the distance went from 3.0 to 2.9. Below one
  minute NAV 1 shows seconds (`:ss`).
- **The NAV 2 radial (#339).** With the Ref set to a VOR 309 NM and one 427 NM away, the radial shown is the true
  initial bearing at the VOR minus the VOR's own published variation, rounded to a whole degree (85.6 shown as 86, and
  115.7 as 116; the final bearing at the aircraft would give 90 and 122).
- **The variation of a reference that is not a VOR (#280).** The radial is the true initial bearing at the reference
  minus the unit's own variation model at the reference's position. A user waypoint at 45° N 120° W as the reference
  gave about 15.4° E. An airport, an NDB and an intersection near Chicago gave 4.2°, 5.4° and 3.8° W, and a user
  waypoint at the NDB's exact position gave the NDB's value. Not the true bearing, not the variation at the present
  position, not the target's. Any waypoint type is accepted as the reference.
- **Distances of 1000 NM and more (#341).** No refusal, no message, no dashes in the reference distance field: it
  shows whole NM (`1323nm`, `8768nm`, `10011nm`). The bearing and distance line of the waypoint pages and the NAV 2
  Ref line show 1000 to 9999 NM as four digits and dashes from 10000 NM on.
- **Side finding (#364, medium-high):** the 89's distances match the WGS-84 ellipsoid, its long-range bearings a
  sphere. Not part of this milestone.

**Earlier trainer checks** (`docs/testing.md` section 8): degrees below 10 are padded with blanks, with zeros only in
an open edit (2026-10-07, #230); the open longitude edit shows the hundreds digit, `E008°`, and the entered value
blanks it (2026-10-08 T8, #304); SET 1 shows the ground speed `005` while open and `  5kt` entered (T11, #245);
distances on INT and USR pages are padded with blanks (2026-10-07, #282); north shows `000`, never `360`, for the OBS
course (2026-10-07) and for a bearing moving across north (2026-10-08, #263); a radial of 360.0 cannot be entered
(T10, #340); radials from a VOR are magnetic with the VOR's own variation (2026-10-07, #280); NDB frequencies on a whole
kHz show without `.0` (2026-10-07, medium, #287).

**Pilot's Guide.** 3-50 (figure 3-153: a database NDB on a whole kHz, right-aligned in the field; figure 3-155: the
distance below 10 NM with blank hundreds and tens), 5-18 (figure 5-66: a user NDB keeps its tenth), 5-19 (figure
5-74: the open DIS field is one inverse block with the point inside; figures 5-75 and 5-76: the entered distance
padded with blanks), 3-18 (the SET 1 ground speed), 5-7 (the ETE figures; the existing tests derive rounding from
them), 5-41 (OTH 6), 5-25 to 5-27 (CTR 1 and CTR 2), 6-6 (DME arc waypoint names: the radial from the reference VOR),
6-16 and 6-17 (the arc entry waypoint), 5-44 (the magnetic reference).

**Real-world navdata (#363).** In AIRAC 2607, the radial in the name of `D<radial><letter>` fixes at VORs with a
station declination of 8° or more matched the true bearing minus the declination for 1528 of 1745 fixes and the true
bearing for 1 (the comment on #363). The SDK converts a leg's magnetic course with the origin VOR's own variation
(`AbstractFlightPathLegCalculator.getLegMagVar`), which is the basis of #365.

**Inventory and temporary fixes (2026-10-12).** Every fix was applied on its own and together, with the full suite
run each time. The only test that depends on one of these bugs outside its pins is
`test/render/GpsAcquisition.test.ts:430` (`E 08°00.00'`, #230). #337, #339 and #340 have no pin. Four of the six OBS
formatters of #263, the latitude editor's blank tens and every site of #361 are held by no test. The hundreds digit
of #304 must stay blank once the value is entered: with a plain 0/1 cell 38 tests break, with the blank kept none do,
and the #109 keyboard pin (`test/render/services/KeyboardService.test.ts:83`) passes. `reference1Radial` is not
persisted (`UserWaypointPersistor.serializeSupplementary` writes ident, latitude and longitude only), so no persisted
format changes.

## 2. Shared helpers

Each helper lands in the commit of the first issue that needs it.

### A. Leading zeros blank while the edit is closed (`Editor`, `EditorField`)

An editor declares a run of leading cells (indices in display order). While the editor is not entered, the cells of
the run show a blank for a value of 0, from the first cell of the run up to the first cell that is not 0. The stored
value and the cell values do not change; only the text a cell renders does. An open edit shows every cell as it is,
so the zeros come back while editing. A cell whose charset already has a blank at index 0
(`createWithBlankMax`) needs nothing.

- **#230** (introduces it): `LatitudeEditor` tens; `LongitudeEditor` tens (the hundreds stays `createWithBlankMax(1)`
  in this commit, so its blank already counts as a leading zero for the run).
- **#304:** the `LongitudeEditor` hundreds becomes `createWithMinMax(0, 1)` and joins the run; the open edit shows
  `E008°`, the entered value `E  8°`. A typed `0` is now accepted, which fixes the longitude half of #109: its pin
  becomes a passing test in this commit (`references #109` in the body); the date and runway-surface half of #109
  stays open.
- **#245:** the `SpeedEditor` hundreds becomes a plain 0 to 9 cell; hundreds and tens form the run (`  0`, `  5`;
  `005` while open).
- **#282:** the `DistanceEditor` hundreds and tens form the run (`DIS:  3.7nm`, `DIS: 12.0nm`, `DIS:048.1` while open).

The displays need no helper: `LatitudeDisplay` and `LongitudeDisplay` pad the degrees with blanks (#230).

### B. Round, then wrap at north (`roundBearing`)

`roundBearing(value, decimals = 0)` in `kln90b/data/Coordinates.ts` (next to `splitDegreesMinutes`, which follows the
same rule of rounding before the format): rounds to the given decimals and wraps 360 to 0. Callers keep their
`format()`. 359.5 gives 0, 359.4 gives 359; with one decimal 359.95 gives 0.0.

- **#263** (introduces it): `BearingDisplay`, `Mod2Page`, `ObsDtkElement`, `SuperNav5Left`, `StatusLine`,
  `DirectToPage`.
- **#361:** `SuperNav5Field2Selector`, `SuperNav5Field3Selector`, `MapOrientationSelector`, `PersistentMessages` (the
  course of `ADJ NAV IND CRS TO`), `BearingEditor` (the SET 1 track).
- **#340:** `RadialEditor.convertFromValue` with one decimal.
- **#363:** the radial in the arc entry name.

### C. The variation of a reference (`KLNMagvar.getReferenceMagvar`)

`getReferenceMagvar(ref: Facility): number`, in the sign convention of the magvar service (east positive): for a VOR
(database or user) `-ref.magneticVariation`, its own published variation; for any other facility the variation model
at the reference's position (`getMagvarForCoordinates`). Radials from a reference are shown and taken as
`trueToMag(trueRadial, getReferenceMagvar(ref))` and `magToTrue(magRadial, getReferenceMagvar(ref))`.

- **#280** (introduces it): INT, SUP, and through SUP the RAD of a REF waypoint.
- **#362:** CTR 2. **#363** and **#365:** the arc VOR.

NAV 2 and the Super NAV 5 ARC field already convert with the VOR's own variation and only ever have a VOR; they may
use the helper but need not.

## 3. Per issue

**#223, durations.** `formatDuration` rounds the total minutes first, then splits off the hours; the 100-hour check
applies to the rounded total. This keeps the rounding the existing tests derive from 5-7 and agrees with the 89's
CAL 1. The 89's NAV 1 truncates; the 90B's own figures rule, so NAV 1 keeps rounding, and the truncation is recorded
in `docs/testing.md` section 8 as a note. The pins accept both forms and turn into tests of the rounded form.

**#230, coordinates below 10°.** The displays pad the degrees with blanks (`N  8°30.00'`, `E  8°00.00'`); the
editors use helper A. `GpsAcquisition.test.ts:430` expects `E  8°00.00'` from this commit on.

**#245, ground speed 0.** Helper A, see above.

**#263, OBS course and bearings at north.** Helper B at the six sites. New tests for `ObsDtkElement`,
`SuperNav5Left`, `StatusLine` and `DirectToPage`, which nothing holds today.

**#280, magnetic radials on INT, SUP and REF.** INT and SUP keep `this.rad` as the magnetic radial the page shows:
`calculateRadialAndDistance` converts the true initial bearing with helper C; a stored REF waypoint's
`reference1Radial` (true) is converted the same way when the SUP page reads it. Every geometric use (`setRad`,
`setDist`, `createIfReady`) converts `this.rad` to true with the variation of the REF in use at that moment, so a
radial typed before the REF is not converted with the wrong reference. The REF page keeps storing the true radial.

**#282, DIS without leading zeros.** Helper A. Figure 3-159 shows a zero in the tens below 10 NM, figure 3-155 and the
trainer a blank; the blank wins (two sources against one).

**#287, database NDB on a whole kHz.** While the editor is read-only (a database NDB) and the frequency is a whole kHz,
the field shows the integer right-aligned in its six cells (`FREQ    251`, figure 3-153). A user NDB keeps its tenth
(figure 5-66). A database NDB on a half kHz keeps today's form (a characterization; no source shows it). This uses
the idle text of the #341 entry below, so #287 comes after #341.

**#302, the point inside the cursor.** `DistanceEditor` and `NdbFreqEditor` put the point in a span with a ref and
invert it with the field in `tick()`, as `RadialEditor` does. The harness helper `FrontPanel.joinAcrossPoint` and its
mentions in `docs/testing.md` go.

**#337, OTH 6 efficiency.** Compare the rounded efficiency with the cutoff, `Math.round(efficiency * 10) / 10 >= 10`,
so 9.97 shows `010`. A characterization (the trainer has no fuel efficiency page).

**#339, the radial measured at the VOR.** NAV 2, the Super NAV 5 ARC field and CTR 1 use the initial bearing at the
VOR (`new GeoPoint(vor.lat, vor.lon).bearingTo(point)`). The trainer shows it for NAV 2; the ARC field and CTR 1
follow by analogy (characterizations).

**#340, RAD at north.** Helper B with one decimal.

**#341, DIS of 1000 NM and more.** Editors get an optional idle text: while the editor is not entered and the text is
not null, the field shows that text in place of its cells (inverted with the field when focused). `DistanceEditor`
returns `Math.round(distance)` right-aligned in its five cells for a distance of 999.95 NM or more (`DIS: 1323nm`,
`DIS:10011nm`). The trainer settles whole NM without refusal; the cell layout is ours (a characterization). A typed
distance still stops at 999.9.

**#361, more bearings at north.** Helper B at the five sites, each with a new test (characterizations of the north
rule of #263: these fields do not exist on the 89).

**#362, CTR 2 with the VOR's variation.** CTR 1 records the reference VOR's variation (helper C) with each
`CenterWaypoint`, also for a waypoint it finds already in the plan; CTR 2 converts `reference1Radial` with it. A
characterization of #280's rule.

**#363, arc entry names.** The name uses `roundBearing(trueToMag(radial, getReferenceMagvar(vor)))`; the stored
`reference1Radial` stays true.

**#365, published arc radials.** `getArcEntryData` converts `leg.course` and `leg.theta` to true with the arc VOR's
own variation unless `leg.trueDegrees`, before the start point, the in-arc test and the stored
`beginRadial`/`endRadial`. Then the fallback radial of the entry is true as well, and #363's conversion names it
correctly.

## 4. Tests, labels and docs

- Each fix commit turns its pins into passing tests (`it.fails` to `it`, the issue number kept in the title) and adds
  tests at the cheapest stage for what no pin holds (listed in section 3).
- **Labels.** A test cites only what its source literally shows. The trainer supports only what the 89 showed: its
  field layouts are the 89's, and nothing about the 90B's second side or the 90B-only pages (Super NAV 5, CTR, OTH 6
  efficiency) comes from it. Analogies are characterizations.
- Each commit updates the `docs/testing.md` lines that describe its bug (the inventory lists them: around lines 604,
  869, 1087, 1095, 1099-1101, 1110, 1127, 1131, 1159, 1360, 1417, 1431; recheck before editing) and adds its part of
  the 2026-10-12 trainer record to section 8 (#223, #280, #339, #341).
- No manual text in code, tests, docs, commits or issues; page numbers and paraphrase only.

## 5. Tasks and order

One worktree implementer per task, one owner per source file, one `fixes #NN` commit per issue in the order given.

| Task | Commits, in order | Starts after |
|---|---|---|
| 1. Durations and efficiency | #223, #337 | — |
| 2. Bearing formatting | #263 (helper B), #361, #340 | — |
| 3. Editors I | #230 (helper A), #304, #245 | — |
| 4. Editors II | #282, #302, #341 (idle text), #287 | task 3 merged |
| 5. Radials | #280 (helper C), #339, #362, #363, #365 | task 2 merged |

`RadialEditor` belongs to task 2 and `DistanceEditor`/`NdbFreqEditor` to task 4; `IntPage`/`SupPage` belong to task 5
only. Tasks 1 to 3 run in parallel and merge in any order; tasks 4 and 5 branch from the branch after their
prerequisite merged.

**Close-out:** the comment on #109 (its longitude half is fixed by the #304 commit; the date and runway-surface half
stays open), posted after the commit exists. No issue is closed manually: the `fixes #NN` commits close them when the
maintainer pushes.

## 6. Out of scope

- NAV 1 seconds below a minute and ETE truncation (89 behavior, contradicted by the 90B's figures): recorded, not
  implemented.
- #364 (ellipsoid distances).
- The date and runway-surface keyboard entry of #109.
- The other displays of 1000 NM and more (the bearing and distance lines, NAV 2): unchanged.
