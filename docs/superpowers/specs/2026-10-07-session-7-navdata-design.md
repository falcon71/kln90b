# Session 7 design: navdata and fragile code

Session 7 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-7-navdata`.

## Scope

- **In:** the seven items of Session 7:
    1. `KLNFacilityLoader` and `KLNFacilityRepository`;
    2. `NearestList`, `NearestUtils` and `Scanlist`;
    3. `Database`, `KLNMagvar`, `BoundaryUtils` and `AirspaceAlert`, with the pins of #189 and #190 that Session 6 left;
    4. `Gps.ts` and `KLNGPSSatComputer`;
    5. `PageTreeController`;
    6. `CursorController`;
    7. the `SidStar` conversion paths Session 3b left, and the placement of procedures in FPL 0 (APT 7, APT 8).

  Also the pins for the bugs the research found in these modules and in their direct callers. Where the cheapest
  observation of a module is through one page (SET 0, SET 2, INT, NAV 2, the VOR and APT pages, MSG), the test goes on
  that page.
- **Out:**
    - the pages themselves beyond the rows these tests read (Sessions 8 and 9). This includes the SET 2 magvar editor,
      STA 1, STA 5, and `getMagvarForCoordinates` on TRI 3 and D/T 3 (research C, Q3);
    - the force-ready SYSTEM TIME UPDATED message (Session 10, log only);
    - take-home mode (unsupported, by the maintainer's decision).
- **Start state** on 2026-10-07: `npm test` 1172 passed and 120 expected failures in 178 files, `npx tsc --noEmit` clean.
  Coverage of the area (statements):
    - below 80 %: `KLNFacilityRepository.ts` 64.5 %, `KLNFacilityLoader.ts` 74.2 %, `AirspaceAlert.ts` 76.5 %;
    - 80 to 95 %: `Scanlist.ts` 85.5 %, `NearestUtils.ts` 90.9 %, `CursorController.ts` 91.8 %, `BoundaryUtils.ts`
      92.1 %, `Gps.ts` 92.1 %, `SidStar.ts` 94.8 %;
    - above 95 %: `NearestList.ts` 98.3 %, `PageTreeController.ts` 98.4 %, and 100 % for `Database.ts` and
      `KLNMagvar.ts`.

## Research pass

Six read-only agents worked in isolated worktrees (A: the loader, the repository and `Database`; B: the nearest lists
and the scan list; C: `KLNMagvar`, `BoundaryUtils`, `AirspaceAlert`; D: `Gps.ts`; E: the page tree and the cursor; F:
`SidStar`). They read the code and the Pilot's Guide pages through the local page index. They wrote draft tests and ran
each against a one-line break of its subject, saw it fail, and restored the tree. They proved each pin by applying the
fix temporarily. The reports and drafts are in the session scratchpad (`research/research-A.md` to `research-F.md`,
`research/drafts-A/` to `drafts-F/`). With each agent's drafts in place the full suite was green and `tsc` clean. A
seventh agent drove the KLN 89 trainer (`research/trainer.md`, below). The plan carries the per-test setup, literals,
citation and break; the implementer confirms each by running it.

Findings that shape the tests:

- **The suite does not hold this area.** The coverage numbers come mostly from the boot running the code once.
    - `SidStar.ts` at 94.8 %: about 45 one-line breaks leave the whole suite green. Among them are every hold and
      procedure turn type of the OBS reminder, the approach header letters, the SID and STAR labels, three EFB contract
      fields (`procedureName`, `approachSuffix`, `runwayDesignator`), the three-arc merge and
      `getVorIfWithin30NMOfArc` (3-32, 6-18).
    - `KLNMagvar`, `BoundaryUtils` and `AirspaceAlert`: 38 breaks survive together. Today's tests hold only the floor
      buffer sign, the INSIDE message and the 10 s interval of the alert.
    - `Gps.ts`: over 20 breaks survive. Only the rollover (#63), the start at power-on (#61), the paused-sim track and the
      hot start (#87) are held. The `every()` checks of the #61 test pass vacuously on an empty channel list.
    - `PageTreeController`: five breaks survive. They are the group memory of 3-12, the `+` sub-page steps forward and
      backward, and NAV 2 after a direct-to. The existing walk tests (`PageTreeController.test.ts`, the `PAGE_CYCLES`
      loop of `selectPage.test.ts`) never require the knob to come back to the first page. A stuck last page passes,
      and so does a slot class that is a subclass of another.
    - The loader and the repository: user waypoints dropped from every nearest list, the All search finding SUP only, the
      Duplicate Waypoint order, the SET 3 runway filter on user airports, the update sync and the `XY` count toward 250
      all survive.
    - The nearest lists and the scan list: the nine-entry slice, the 1 s bearing and distance update, the terminal VOR
      filter, `findClosest`, the top-speed scan and `waypointsChanged` survive.
- **`coldGps: true` is a hot start.** The boot resets the computer after a forced acquisition, so a slow `coldGps` boot
  acquires in about 62 s whatever the almanac, the stored position or the clock. Time to first fix needs
  `engineRunning: false` and `powerOn()`.
- **The CAL 6 tests of `test/render/data/VolatileMemory.test.ts` flake under load.** They run 5 simulated minutes inside
  the render stage's default 5 s timeout, and four agents saw them time out (one in 11 of 125 runs with two suites in
  parallel). A mutation run under load can therefore report a false kill.
- **Existing tests that freeze a bug (rule 8):** `test/render/pages/left/Set0Page.test.ts:41-42` asserts the four-digit
  year of `#NEW-1-2`. It becomes the pin.
- **Independent sources:** hand-computed planar geometry for `BoundaryUtils` (named as such, because the code's edges are
  straight in lat/lon), the sorted ident lists built by construction for the scan list, the 3-17 and install manual 2-66
  acquisition figures, the page types and order of 3-12 and 3-13 for the trees.

## Maintainer's decisions

- **Circular airspaces** (`BoundaryUtils` ignores circles; the local AIRAC 2607 data has full circles for 25 to 55 % of
  the restricted, prohibited and warning shapes): an `enhancement` issue, no pin. `test/unit/harness/airspaces.test.ts:180`
  stays as the documented gap and cites the issue. The drafted circle pins of research C are not committed.
- **Almanac age:** 3-17 is the unit's own threshold ("considered current for up to six months"), so the 90 days of
  `Gps.ts:91` is a bug, pinned. The pin is proven together with the fix of `#NEW-4-1`, because today the check never
  passes.
- **Nearest search radius** (500 NM in the code, none in the 90B guide, 200 NM in the KLN 89 guide): a `question` issue;
  the 500 NM are characterized meanwhile.
- **Take-home mode:** unsupported. A log line covers the uncovered lines of `Gps.ts`, no tests.
- **Hold shapes in `SidStar`:** `#NEW-6-1` (`IF X` IAF then `HF X`: the OBS reminder is lost) is a bug, pinned.
  `#NEW-6-2` (`DF X` MAHP then `HM X`: the holding point twice) is a `question` issue; its drafted pin is not committed
  until the maintainer has looked at a sim approach.
- **A second KLN 90B in one aircraft** (the cross-instrument repository sync throws on a dump with several waypoints):
  an `enhancement` issue.
- **STA 5 RAIM prediction** (`#NEW-4-4`): a bug with a sim-check note, no pin (the page belongs to Session 9).
- **STA 1 receiver states** (a sky search shows INIT where the install manual says STS, TRAN never shows, NAV A with
  eight satellites whenever there is an altitude): characterized, plus one `question` issue.
- **The flaky CAL 6 tests:** fixed in task 0 with a per-test timeout.
- **The trainer:** the KLN 89 trainer decides the cursor wrap, the scan from a typed ident without a waypoint
  (`#NEW-2-2`), FPL FULL during a procedure load, the ACT group memory and evidence on the radius (see "Trainer
  results").

**The controller's defaults** (presented with the design, not objected to):

- **Bugs, filed and pinned** (rule 8): every bug of the table below except `#NEW-4-4`.
- **User waypoints in the nearest lists** are a spec test, not a characterization: 5-45 says the nearest airport, VOR
  and NDB functions work with user-defined waypoints when there is no database.
- **Characterizations without an issue:**
    - DME arc entries and EFB lat/lon temporaries count toward the 250 user waypoints;
    - the approach header letter R for a GPS approach, the circling form `V-A-KPRC` and the suffix form `R27Y-KPRC`;
    - the pilot-entered magnetic variation forgotten once back inside the area (`KLNMagvar.ts:51`);
    - the INSIDE and ALERT messages staying until read after the aircraft leaves or turns away.
- **One `enhancement` issue:** the Class B and C line `SEE <apt> APT 4 PAGE` (figure 3-126) and the controlling agency
  line (figure 3-125), which the sim's boundary data lacks.
- **Comments on existing issues:**
    - #133 and #90: the controller prunes the module-level `RIGHT_PAGE_TREE`, which every ACT visit and every waypoint
      confirmation hands to a new controller; a fix must copy the tree per controller, and the `!vfrOnly` condition at
      `PageTreeController.ts:139` is inverted against its own comment;
    - #190: the OBS course chosen on the switch is magnetic too (the second pin), and 5-35 item 6 (the published VOR
      variation) and 5-44 (true north) conflict for an active VOR outside the area;
    - #175: the reproduction on the GPS path.
- **Log only:** other avionics' user waypoints reaching the SUP list through the SDK `FacilityRepository` (needs a sim
  check); the exact 74.0 N and 60.0 S boundary; points on a boundary edge or vertex; the GPS-invalid gate of the airspace
  alert; multi-shape boundaries and arcs drawn as chords; the `isCalculating` flag of the nearest lists (the fake answers
  synchronously); the force-ready SYSTEM TIME message (Session 10).
- `CLAUDE.md` says `SidStar` "filters out RNAV procedures"; since #59 it filters RF legs and RNP AR only. The close-out
  corrects the wording.

## Bugs to file

Placeholders per rule 23, numbered by the task that pins them. Every one is searched on GitHub (open and closed) before
it is filed; candidates named by the research are listed.

| placeholder | research | where | what | expected |
|---|---|---|---|---|
| `#NEW-1-1` | A-1 | `KLNFacilityLoader.ts:406-412` | `tryGetFacility` and `getFacilities` reject on an unknown ICAO | null, as the SDK `FacilityClient` interface says; the `"kln90b"` planner's path calculation fails on one unknown fix |
| `#NEW-1-2` | A-2 | `Database.ts:18` | the database dates on the boot Database page and SET 0 show a four-digit year | two digits (figures 2-4, 3-24, 3-25); a regression of `22b4532` |
| `#NEW-2-1` | B-1 | `Scanlist.ts:203-287` | slow scanning through a list longer than the cache window skips waypoints (637 and 600 of 660) | every waypoint, one per click (3-21); caveat: the sim's `SEARCH_BY_IDENT` honors `maxItems` |
| `#NEW-2-2` | B-2 | `Scanlist.ts:303-309` | scanning clockwise from a typed ident without a waypoint goes backwards | the successor of the last waypoint the entry matched (3-21; checked in the KLN 89 trainer) |
| `#NEW-2-3` | B-3 | `Scanlist.ts:225-246` | after a user waypoint change, scanning back from ABC skips AB | AB; a residual of `d3228dd` |
| `#NEW-2-4` | B-4 | `NearestList.ts:206-210` | the nearest VOR list leaves out terminal and undefined-class VORs everywhere | the NAV 2 rule (3-8, 3-32) only on NAV 2; the VOR page (3-22, 3-49) and Super NAV 5 TLH (3-37) list them |
| `#NEW-2-5` | B-5 | `NearestList.ts:168-191` | HRD SFT leaves out snow runways | snow counts as soft (3-23) |
| `#NEW-2-6` | B-6 | `KLNFacilityLoader.ts:175`, `NearestUtils.ts:59-61` | a user VOR is never the nearest VOR (INT reference, nearest VOR list) | the closest VOR (3-50); related to #173 |
| `#NEW-3-1` | C-1 | `BoundaryUtils.ts:121-122` | `getIntersections` visits the first edge of a closed ring twice | each crossing once (latent; CTR 1 hides it) |
| `#NEW-4-1` | D-1 | `Gps.ts:51-61`, `Gps.ts:269-275` | the almanac check reads SDK fields that moved in 2.3.3, and the first tick after power-on runs an hour behind: every slow start is a sky search of about 6 minutes | a warm start under 2 minutes (3-17), at most 5 (3-8, install manual 2-66) |
| `#NEW-4-2` | D, Q1 | `Gps.ts:91` | the almanac expires after 90 days | six months (3-17) |
| `#NEW-4-3` | D-3 | `Sta1Page.tsx:133` | during a sky search STA 1 shows a satellite below the horizon with a high elevation | low priority; the pin goes with STA 1 in Session 9, the issue now |
| `#NEW-4-4` | D-4 | `Sta5Page.tsx:120-160` | the RAIM prediction computes every offset for the present time and position since SDK 2.3.3 | the ETA and the waypoint position (6-19, 6-20); sim check noted; no pin |
| `#NEW-5-1` | E-1 | `RefPage.tsx:36` | the page name is `"REF "`, four characters | five (CLAUDE.md) |
| `#NEW-5-2` | E-2 | `CursorController.ts:123`, `:68` | SET 2 throws on every display tick when the GPS gets its first fix while the cursor is on, or was on, the time field | no error; the cursor on the time zone, the only field left (3-53) |
| `#NEW-5-3` | trainer | `CursorController.ts` (the outer-knob handlers) | the cursor wraps from the last field to the first and back | it stops at the first and the last field (4-3; checked in the KLN 89 trainer) |
| `#NEW-6-1` | F-1 | `SidStar.ts:414-415` | `IF X` (IAF) followed by `HF X` or `PI X` drops the hold and its OBS reminder | IF REQUIRED SELECT OBS at that IAF (B-2, 6-10) |

Issues without a pin: the `question` issues on the radius, `#NEW-6-2`, the STA 1 states and FPL FULL during a procedure
load; the `enhancement` issues on
circles, a second KLN and the Class B/C lines; the pins of `#NEW-4-3` and `#NEW-4-4` are left to Session 9. The almanac
pin (`#NEW-4-2`) references `#NEW-4-1`.

## Trainer results

A trainer agent drove the KLN 89 trainer on 2026-10-07 (`research/trainer.md`; the maintainer started the VM). The
maintainer accepts the 89 trainer as the reference where the 90B guide is silent (CLAUDE.md). All answers have high
confidence.

- **Cursor wrap:** the outer knob stops at the first and the last cursor field (FPL 0 and SET 2); it never wraps and
  never leaves the page. 4-3 ("all the way counterclockwise" to USE?) agrees. The code wraps both ways, so the wrap is a
  bug (`#NEW-5-3`), pinned. The 89's first field is its status-column mode field, which the 90B pages do not have, so
  the pin asserts only that the cursor stays on the first and the last field of the page.
- **Scanning from an ident without a match:** the 89 offers no CREATE NEW WPT; it scans from the **last waypoint the
  entry matched** (the last autofill hit): clockwise to its successor, counterclockwise to its predecessor. Two cases
  tell this apart from scanning from the typed ident (`KLO` after the match KLNR gave KJVL counterclockwise). So
  `#NEW-2-2` stays a bug, with this expectation instead of the research draft's: the pin types an ident whose last match
  differs from its alphabetical neighbor and asserts the successor and the predecessor of the last match.
- **FPL FULL during an approach load:** the 89 does not count approach waypoints against its 20-waypoint limit (up to 35
  with procedures), and loaded the approach whole with 19 and with 20 en-route waypoints, without a message. The 90B
  guide gives 30 waypoints per plan (4-1) and says nothing about procedures. There is no direct 90B answer, so the
  partial load of today is characterized and a `question` issue carries the 89 evidence.
- **ACT group memory:** returning to the ACT type always shows ACT 1, while APT and SET remember their last page. The
  code builds a new controller on every ACT visit, so it agrees: a spec test citing the trainer.
- **Nearest radius:** the 89 lists only facilities within 200 NM and shows `No Nrst` beyond. The `question` issue on the
  500 NM radius carries this evidence; the 90B guide is still silent, so the characterization stays until the
  maintainer rules on the issue.

## Tasks

Rules 20 to 22 apply. Each implementer gets its research report and drafts as input. It re-proves every test in its own
worktree against the committed tree, by the break the report recorded and by at least one break it chooses itself, and
records one `Proof:` line per item in its commit.

- **Task 0, harness** (alone, before the others; Sonnet):
    - a per-test timeout for the two CAL 6 tests of `VolatileMemory.test.ts`, like `power.test.ts`;
    - `Leg.HF`, `Leg.HA` and `Leg.PI` in `test/harness/navdata/procedures.ts`, with a harness test in
      `test/unit/harness/`, in the style of the existing builders;
    - the doc comment of `BootOptions` in `test/harness/boot.ts:39-41`, which says a test can set the navdata cycle
      itself (it cannot: `bootUnit` overwrites it, and the SDK caches the cycle per file);
    - `testing.md`: `coldGps` is a hot start and time to first fix needs `engineRunning: false` and `powerOn()`
      (section 4), the load sensitivity of long render tests (section 6), and the SDK internals `Gps.ts` relies on
      (section 6, with the 2.3.3 move of `simTime` and `distanceFromLastKnownPos`).
- **Task 1, the loader, the repository and `Database`:** the drafts of research A
  (`test/unit/data/navdata/KLNFacilityLoader.test.ts` appended, new `KLNFacilityRepository.test.ts` and
  `Database.test.ts`), the user-waypoint nearest test as a spec test (5-45), and the `Set0Page.test.ts` row turned into
  the `#NEW-1-2` pin. Pins `#NEW-1-1`, `#NEW-1-2`.
- **Task 2, the nearest lists and the scan list:** the drafts of research B (`ScanlistWindow.test.ts`,
  `NearestListSurfaces.test.ts`, `NearestListScan.test.ts`, `IntPageRef.test.ts`, merged into the existing files where
  one exists for the subject), the NAV 2 terminal-VOR guard, the radius characterization, the #39 tests kept. The
  `#NEW-2-2` pin takes the trainer's expectation, not the draft's. Pins `#NEW-2-1` to `#NEW-2-6`.
- **Task 3, `KLNMagvar`, `BoundaryUtils`, `AirspaceAlert`:** the drafts of research C without the circle pins, the
  pins of #189 and #190 with their passing siblings, the airspace type names of 3-39. Pin `#NEW-3-1`.
- **Task 4, `Gps.ts`:** the draft `GpsAcquisition.test.ts` of research D (cold and warm acquisition, almanac,
  persistence, the 2 NM and 10 minute thresholds, the clock while invalid, the 2 kt track limit, SET 10 FAST, a non-empty
  channel list), the STA 1 state characterizations that the draft holds through the GPS. Pins `#NEW-4-1` (three) and
  `#NEW-4-2`.
- **Task 5, the page tree and the cursor:** the drafts of research E (`test/unit/pages/PageTreeController.test.ts` for
  the slot classes and the five-character names, `test/render/pages/PageTreeKnobs.test.ts` for the knobs and the group
  memory of 3-12, `test/unit/pages/CursorController.test.ts`, `test/render/pages/left/Set2Cursor.test.ts`), and the
  `walk-wrap.patch` to the two existing walk tests. The research's cursor-wrap characterization becomes the `#NEW-5-3`
  pin, and the ACT group memory a spec test (the trainer). Pins `#NEW-5-1`, `#NEW-5-2` (unit and render), `#NEW-5-3`.
- **Task 6, `SidStar` and the placement in FPL 0:** the drafts of research F (`SidStarS7.test.ts` merged into
  `SidStar.test.ts`, the amendment diff), using the `Leg.HF`, `Leg.HA` and `Leg.PI` builders of task 0, the APT 7 and
  APT 8 placement cases (an approach replacing the old one, the APT 8 REDUNDANT WPTS message, a STAR before an existing
  approach) and FPL FULL during a load as a characterization (the trainer gives no 90B answer). Pin `#NEW-6-1`.
- **Task 7, issues and close-out** (in the main checkout on the session branch, because it needs GitHub; Opus): the
  issues and comments above, the placeholders replaced in one commit, the `CLAUDE.md` wording, `testing.md` sections 6
  and 7 (the fragile spots below), the session log with rule 18, and the checkbox.

**Fragile spots for `testing.md`** (the close-out writes them): the SDK internals `Gps.ts` reads (after an upgrade, run
`GpsAcquisition.test.ts` first); the STA 5 `primary` computer, which cannot initialize in the harness; the fake's shared
ICAO objects, which hide reference comparisons (`6a6c634`, `NearestList.ts:89`; a cloning option would serve several
tests, but no test of this session needs it); `Oth3Page` subscribing to the repository and never unsubscribing; the dead
`fields` array of the `CursorController` constructor.

## Workflow

- **Models:** implementers start on Sonnet (rule 26); a task whose implementer struggles is re-dispatched on Opus.
  Reviewers run on Opus for tasks 4 and 6 and on Sonnet for the others; re-reviews on Sonnet. The final review of the
  session runs on the controlling session's model.
- **Worktrees:** each implementer resets its worktree branch to `tests-session-7-navdata` first; the controller checks
  the merge base before every review. The `node_modules` junction is removed with `rmdir` before `git worktree remove`,
  only after the maintainer approves the session; the research worktrees are cleaned up the same way.
- **Mutation runs:** with the timeout fix of task 0 in place, one run counts. A kill seen only while other suites run
  in parallel is re-run alone before it counts.
- **Reports:** implementers and reviewers write their reports with a Bash heredoc (the Write tool as the fallback) into
  `task-<n>/` of the session scratchpad, and commit messages without a byte order mark.
- **Merge order:** by completion. Tasks 1 to 6 share no file; tasks 0 and 7 alone touch `testing.md` and the harness.
- **Done when:** each item of the session has a test or a log line, the fragile spots are in `testing.md` sections 6 and
  7, `grep -r "#NEW-" test/` finds nothing, and `npm test` and `npx tsc --noEmit` are clean.
