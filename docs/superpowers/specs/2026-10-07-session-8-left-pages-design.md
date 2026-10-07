# Session 8 design: pages, left side

Session 8 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-8-left-pages`.

## Scope

- **In:** every page under `kln90b/pages/left/`, in tree order: NAV 1 to 5 with Super NAV 1 and Super NAV 5, FPL 0 and
  FPL 1 to 25, SET 0 to 10, OTH 1 to 10, TRI 0 to 6, CAL 1 to 7, STA 1 to 5, MOD 1 and 2, then ALT, DIRECT TO, DUPLICATE
  WAYPOINT and the self-test left page. Per page: a labeled characterization snapshot in a representative state, spec
  tests where the Pilot's Guide (or the KLN 89 trainer) gives the rule, and pins for the bugs found. Also the #99 pin
  (planned for this session since Session 2), the SET 2 magnetic variation editor that Session 7 left, and the pin of
  #213.
- **Out:**
    - STA 5's RAIM prediction (`testing.md` section 6, #214); only its defaults are tested.
    - The boot sequence and the self-test values (Session 10); the self-test page gets its snapshot only.
    - Take-home mode (unsupported, by the maintainer's decision). This includes the SET 1 track stored as true after
      CONFIRM? (`Set1Page.tsx:102`), which only matters there: a log line, no issue.
    - The right pages and the shared controls (Session 9), except where a left page is the cheapest observation of a
      control's bug (the duration, distance and temperature displays below).
- **Start state** on 2026-10-07: `npm test` 1411 passed and 154 expected failures in 186 files, `npx tsc --noEmit`
  clean. Coverage of `kln90b/pages/left` 70.95 % of statements; below 50 %: `Cal4Page.tsx` and `Cal5Page.tsx` 23.8 %,
  `DuplicateWaypointPage.tsx` 0 %, `Sta5Page.tsx` 37.3 %, `Set1Page.tsx` 41.7 %, `SuperNav5Page.tsx` 47.1 %.

## Research pass

Seven read-only agents worked in isolated worktrees (A: NAV 1 to 4 and Super NAV 1; B: NAV 5 and Super NAV 5; C: FPL 0
and FPL 1 to 25; D: SET 0 to 10; E: OTH 1 to 10 and STA 1 to 5; F: TRI 0 to 6 and CAL 1 to 7; G: MOD 1 and 2, ALT,
DIRECT TO, DUPLICATE WAYPOINT, the self-test page). They read the code and the Pilot's Guide pages through the local
page index, drafted tests, ran each against a one-line break of its subject, saw it fail, and restored the tree; each pin
was proven by a temporary fix. With each agent's drafts in place the full suite was green and `tsc` clean. The reports
and drafts are in the session scratchpad (`research/research-A.md` to `research-G.md`, `research/drafts-A/` to
`drafts-G/`; the drafts are also in the research worktrees). An eighth agent drove the KLN 89 trainer
(`research/trainer.md`, below). The plan carries the per-test setup, literals, citation and break; the implementer
confirms each by running it.

Findings that shape the tests:

- **The displays shared by many pages carry most of the bugs.** `DurationDisplay` shows `:60` and `h:60` (three agents
  found it independently), `DistanceDisplay` overflows its field when a value rounds up to the cutoff, `LongitudeDisplay`
  dashes have the latitude layout, `TempFieldset` loses the minus sign and `FpmFieldset` edits from a stale value.
  Each is pinned on the cheapest left page; the controls themselves are Session 9's.
- **Three existing tests freeze a bug** (rule 8) and become pins: the longitude dashes in
  `test/render/controls/displays/NullDashes.test.ts:31`, the direct-to row in
  `test/render/data/flightplan/ActiveWaypoint.test.ts:68` and `:99`, and the ALT warn reset in
  `test/render/data/VolatileMemory.test.ts:147` (its warn half only; whether ALERT ON/OFF survives a power cycle is
  unsettled). The NAV 2 test (`test/render/pages/Nav2Page.test.ts`) has neither a citation nor a characterization label, and its
  `E 08°` row is a bug by the trainer (below).
- **Harness gaps that block several tests:** `Screen.read()` cannot read a numbered FPL page with legs (the `.use-invert`
  overlay, `testing.md` section 7); the maps need a recorder of what `Canvas.tsx` draws; the fuel computer reads
  `NUMBER OF ENGINES` at construction, so four OTH test files set a SimVar before the boot; `enterIdent` does not start
  editing when the editor's first character already matches.

## Trainer results

A trainer agent drove the KLN 89 trainer on 2026-10-07 (`research/trainer.md`; the maintainer started the VM). The
maintainer accepts the 89 trainer as the reference where the 90B guide is silent. Paraphrased:

- **Durations:** the 89 never shows `:60`; the hour rolls over. It truncates the ETE to whole minutes (medium-high
  confidence). The pins accept either `:59` or the next whole hour, because the 90B figures of 5-7 suggest rounding.
- **Coordinates:** never `60.00'`; from `59.99'` the next value is the next whole degree (high). Rounding or truncation
  of the hundredths is unsettled, so the #99 pins accept both.
- **Degrees below 10** are blank-padded (`N  8°`), with zeros only inside an open edit field (high). A photo of a
  KLN 90 (not 90B) agrees. The code shows `E 08°`: a bug (see the defaults).
- **SET 1:** after the waypoint ident and two ENT the cursor goes straight to `Ok?` (the 90B CONFIRM?) (high). CLR then
  ENT on the ident has no visible effect; the old ident stays (medium).
- **FPL pages:** the page puts the waypoint before the active one in the top row (medium-high; the code agrees). A
  full plan shows no blank position after its last waypoint, and the cursor stops on the last (high). Approach
  waypoints are not stored when FPL 0 is copied into a numbered plan (high). The `?` of the delete prompt stands in a
  fixed column after a five-cell ident field (high; the code agrees).
- **OTH:** the user waypoint list shows the lowest plan number that uses a waypoint, `0` for FPL 0 (high); the remarks
  list is sorted by ident (high). Both agree with the code.
- **OBS:** one degree per click; north shows `000`, never `360`, and the course wraps (high).
- **DUPLICATE WAYPOINT:** a header row with the ident and a type/area label, then one row per waypoint (high).
- **Direct To an unknown ident** opens the user waypoint creation, not `NO SUCH WPT` (high).
- **Not answerable:** the map page (the trainer has none, so neither the NAV 5 cursor start nor the range list), the
  fuel efficiency format (no fuel flow input), and the alert values over a power cycle (no power cycle).

## Maintainer's decisions

- **The trainer:** one agent for all trainer questions before the design (done, above).
- **Evidence:** the guide's figures and photos of real units count as evidence for a bug with a pin, as for #199.
- **Map scales:** the trainer could not check them and the 89 guide gives only the end points; so the code's list is
  characterized and a `question` issue lists the scales the figures and photos show (1, 2, 3, 5, 10, 15, 20, 40, 60).
- **Super NAV 5 near the MAP:** figure 6-16's 1 NM scale agrees with the diagram rule of 3-38, so there is no conflict
  about the diagram. The figure is the spec for AUTO near the MAP: task 2 checks it with a missed-approach world and
  pins it if the code picks a larger scale.
- **NO INTRCPT:** the "scratch pad" of 6-18 is the status line. Appendix C lists the status-line messages and includes
  `NO INTRCEPT` (the code's spelling; 6-18 spells it without the E), and 5-36 calls the `CRS` message of the same list
  a scratch-pad message. Where it shows on Super NAV 5, which has no status line, is unknown: a `question` issue, no pin.

**The controller's defaults** (presented with the design; the maintainer may object to any):

- **Bugs, filed and pinned** (rule 8): every bug of the table below.
- **Degrees below 10** (`#NEW-1-8`): a bug, on the trainer's high-confidence answer and the KLN 90 photo; the `E 08°` row
  of `Nav2Page.test.ts` becomes its pin.
- **The ALT warn altitude** (`#NEW-7-2`): 3-55 says the pilot normally sets it only the first time altitude alerting is
  used, so the reset at power-on is a bug; the issue references #192.
- **Trainer answers that agree with the code are spec tests** citing the trainer: the FPL 0 scroll rule, the delete
  prompt's column, approach waypoints left out of a stored plan, the OTH 3 plan number, the OTH 4 order, the OBS step
  and wrap.
- **Characterizations without an issue:** SET 1 showing CONFIRM? with the cursor off (the code cites a video of a real
  unit); STA 3's version row (the version needs the room); OTH 6 NM/GAL of 10 or more with zeros, the OTH 6 RANGE
  dashes and the OTH 10 negative temperature format; TRI 3 taking the variation at the "from" waypoint; TRI 1 and TRI 2
  dashes without a fix; the MOD 2 colon after OBS in Leg mode (5-35 explains the colon; the installation of figures
  5-108 and 5-110 is unknown); the SET 2 MAG V columns (the figure is not exact enough for a column).
- **One `question` issue** for out-of-range calculator values: CAL 5 shows `010°F` for 104 °F and `115mph` for
  1150 mph, and the F REQ row is blank (NaN) at a ground speed of 0. These are not snapshotted (rule 8).
- **The TRI 5 ground speed** (`#NEW-6-1`): the pin asserts the ETE (the sum of the leg times); the ground speed row is
  left out of the snapshot until the fix decides what "average" means.
- **The SET 2 time zone sweep** is cut to a few zones (the first, the last, the wrap and CDT), because the full ordered
  list mirrors a table of the guide.
- **Known issues gain pins and comments, not new issues:** the SET 2 MAG V crash (research D-3) is a second
  reproduction of #217 (pin named `#217`, a comment on #217); deleting a numbered plan is the numbered-plan variant of
  #150 (pin named `#150`, a comment); the MOD 2 half of #160 is pinned under `#160`.
- **Log only:** the SET 1 track stored as true (take-home); the shaft glyph of a procedure header row on FPL 0 (the
  figures are illegible there); the `__:__` empty ETA of STA 5 (an editor glyph, Session 9); the `-0100` altitude of a
  low-confidence photo of the self-test page (Session 10); the TAS label of CAL 3 (`TAS` in the guide, `TAS:` in a photo
  of a possibly later version; the code follows the guide); CAL 1 showing `0700MB` for its 0.00" default in millibars
  (Session 2 characterized the default).

## Bugs to file

Placeholders per rule 23, numbered by the task that pins them; a bug pinned by several tasks keeps one placeholder.
Every one is searched on GitHub (open and closed) before it is filed. Related issues found by a first scan of the
titles are named; the close-out searches properly.

| placeholder | research | where | what | expected |
|---|---|---|---|---|
| `#NEW-1-1` | A-1, E-2, F-1 | `DurationDisplay.tsx:41-55` | durations show `:60` and `h:60` (NAV 1, OTH 6, TRI 3 and every other user) | the next whole hour or `:59` (5-7, 5-41, the trainer); like #99 and #184 |
| `#NEW-1-2` | A-2 | `LongitudeDisplay.tsx:31` | the longitude dashes have the latitude layout (`- --°`) | `----°--.--'` (figure 3-26, a photo) |
| `#NEW-1-3` | A-3 | `DeviationBar.tsx:72`, `SuperDeviationBar.tsx:59` | an operator precedence slip drops half of the bar next to the TO triangle | the whole bar |
| `#NEW-1-4` | A-4 | `DistanceDisplay.tsx:48-52` | a distance that rounds up to the cutoff overflows its field (`DIS  100.0nm`, `FLY L 10.0nm`) | the field's width (3-31, 3-32) |
| `#NEW-1-5` | A-5 | `Nav1Page.tsx:48,82`, `Nav3Page.tsx:48,89`, `SuperNav1Page.tsx:51,78` | the direct-to symbol is split (`d    ›KDDD`) | the symbol right before the ident (figures 3-97, 3-104, 5-21, a photo) |
| `#NEW-1-6` | A-6 | `Nav2Page.tsx:77` | a two-letter VOR ident moves the radial one cell left | the fixed columns (a photo, figure 3-103) |
| `#NEW-1-7` | A-7 | `Vnav.ts:36-37`, `Nav4Page.tsx:106-109` | VNAV started at zero ground speed shows `VNV INNaN:` | the advisory altitude (5-8) |
| `#NEW-1-8` | trainer | the lat/lon displays | degrees below 10 shown with a zero (`E 08°`) | blank-padded (the trainer, a KLN 90 photo) |
| `#NEW-2-1` | B-1 | `Nav5Page.tsx:38-45` | the NAV 5 cursor starts on the orientation | on the range scale (3-34) |
| `#NEW-2-2` | B-2 | `SuperNav5Page.tsx:371-376`, `:278-279` | a VOR or NDB of FPL 0 is labeled twice | once (figures 3-121, 3-122) |
| `#NEW-2-3` | B-3 | `SuperNav5Page.tsx:212-220` | AUTO uses only the distance to the waypoint after the active one; the active one can be off the map | the smallest scale showing both (3-36) |
| `#NEW-2-4` | maintainer | `SuperNav5Page.tsx` (AUTO) | near the MAP, AUTO counts the missed approach (to be confirmed in task 2) | 1 NM (figure 6-16) |
| `#NEW-3-1` | C-1 | `FlightplanList.tsx:613` | with a procedure header between the from and the active waypoint, FPL 0 scrolls the from waypoint off the page | the from waypoint with the tail of the leg symbol shown (4-7, 4-8, figure 6-43) |
| `#NEW-3-2` | C-2 | `FlightplanList.tsx:369-372` | after FPL FULL the refused waypoint stays as an extra row | the plan as stored (4-4, C-1) |
| `#NEW-3-3` | trainer | `FlightplanList` | a full numbered plan shows a blank 31st position | none; the cursor stops on the last waypoint (the trainer) |
| `#NEW-4-1` | D-1 | `Set1Page.tsx:73` | CLR then ENT on the SET 1 WPT field throws on the ENT path | no error, the old ident stays (the trainer) |
| `#NEW-4-2` | D-2 | `SpeedEditor.tsx` | SET 1 shows the ground speed ` 00 KT` | `0 KT` (figures 3-57 to 3-60) |
| `#NEW-4-3` | D-4 | `Set0Page.tsx:87-97` | repeated CLR never returns SET 0 to its starting page | the starting page, cursor off (2-5, figure 2-2) |
| `#NEW-4-4` | D-5 | `Set3Page.tsx:51` | the label `SURFACE` lacks its colon | `SURFACE:` (figures 3-73 to 3-75) |
| `#NEW-4-5` | trainer | `Set1Page.tsx` | after the waypoint's ENT the cursor moves to the latitude | to CONFIRM? (3-18 step 8, the trainer) |
| `#NEW-5-1` | E-1, F-3 | `Oth9Page.tsx:53`, `Cal3Page.tsx:57,66` | the wind direction lacks the true-north symbol | `°` and the true symbol, as TRI 0 shows it (5-43, 5-12, figures 5-37, 5-38, a photo) |
| `#NEW-5-2` | E-3 | `Oth8Page.tsx:67-71` | OTH 8 shows TOTAL `0` when the fuel used is not transmitted | dashes (5-41) |
| `#NEW-5-3` | E-4 | `Oth2Page.tsx:39` | OTH 2 keeps the old Center while it stays on screen | the Center of the present position (3-52) |
| `#NEW-5-4` | E-5 | `Oth4Page.tsx:36` | OTH 4 misses an airport whose remarks are saved again while it is shown | the airport listed (3-47) |
| `#NEW-5-5` | E (outside) | `RemarksManager.ts:28` | `Object(this.remarks).length` is undefined, so the 100-airport limit and RMKS FULL never trigger | the limit (3-47, C-2); check #92 first |
| `#NEW-6-1` | F-2 | `Tri5Page.tsx:96-105` | TRI 5 averages the leg ground speeds without weighting; the ETE is wrong | the sum of the leg times (5-6) |
| `#NEW-6-2` | F-4 | `FpmFieldset.tsx` (`setFpm`) | after an angle entry, an FPM digit edit starts from the old rate | the shown rate (5-12) |
| `#NEW-6-3` | F-5 | `TempFieldset.tsx:58-68` | a temperature typed sign first loses its minus (CAL 1, CAL 5) | the negative value (5-10, 5-13) |
| `#NEW-7-1` | G-1 | `DuplicateWaypointPage.tsx:50`, `:67-72` | no header row, five waypoints per page | the header and four waypoints (3-15, figures 3-52, 3-53, the trainer); see #168 |
| `#NEW-7-2` | G-2 | `VolatileMemory.ts:228` | the ALT warn altitude is reset to 300 ft at every power-on | kept (3-55); references #192 |
| `#NEW-7-3` | G-3 | `Mod1Page.tsx:31`, `:95-97`, `Mod2Page.tsx:39`, `:104-106` | a mode change with MOD 1 or 2 in view lets a knob click set the CDI scale to undefined, then NaN | the choices of the current mode (5-38); related to #159, #160 |
| `#NEW-7-4` | G-4 | `ModeController.ts:238`, `:258`, `NavCalculator.ts:309` | with an indicator read and driven (ObsSource and ObsTarget), a course set on MOD 2 is overwritten before it is sent | the course is sent to the indicator (5-35) |
| `#NEW-7-5` | G, trainer | `WaypointEditor.tsx:76` | an unknown ident on D-> (and on FPL, if task 3 confirms) gives `NO SUCH WPT` | the user waypoint creation (4-2 for FPL, the trainer for D->) |
| `#NEW-7-6` | G, trainer | the OBS displays | a fractional OBS course of 359.5 or more shows `360°` (to be confirmed reachable in task 7) | `000°` (the trainer); related to #122 |

Leads a task checks before pinning: `ObsDtkElement.innerRight` returns false, which may pop Super NAV 5 when the OBS is
turned there (task 2); the FPL half of `#NEW-7-5` (task 3). An unconfirmed lead becomes a log line.

Issues without a pin: the `question` issues on the map scales, NO INTRCPT on Super NAV 5 and the out-of-range calculator
values. Comments on #150, #160 and #217 (the new reproductions), and on #192 (the ALT warn).

## Tasks

Rules 20 to 22 apply. Each implementer gets its research report, its drafts and this design's rulings as input. It
re-proves every test in its own worktree against the committed tree, by the break the report recorded and by at least
one break it chooses itself, and records one `Proof:` line per item in its commit. It reports a per-describe label audit
(title, spec or characterization, any page number) before the review.

- **Task 0, harness** (alone, before the others):
    - `Screen.read()` reads the `.use-invert` overlay (research C's `harness.patch` and its harness tests), and
      `testing.md` loses the section 7 gap and gains the section 3 note;
    - `test/harness/render/mapRecorder.ts` (research B) with a harness test, and `downsampled()` moved into
      `test/harness/render/canvas.ts`;
    - a `simVars` boot option that sets SimVars before `init` (the fuel computer's `NUMBER OF ENGINES`), replacing the
      section 7 gap note;
    - an opt-in `FakeSim` option that applies `K:VOR1_SET` and `K:VOR2_SET` to `Nav OBS:1` and `:2`, as the sim does;
    - `enterIdent` starts editing when the editor's first character already matches (one click away and back, as the
      selector path does), and `cursorTo` throws at once when that side's cursor is off;
    - `testing.md` for each.
- **Task 1, NAV 1 to 4 and Super NAV 1** (research A): the snapshots, spec tests and pins `#NEW-1-1` (NAV 1) to
  `#NEW-1-8`, #99 (two); the existing `Nav2Page.test.ts` labeled and its `E 08°` row turned into the `#NEW-1-8` pin;
  `NullDashes.test.ts:31` and `ActiveWaypoint.test.ts:68`, `:99` turned into pins of `#NEW-1-2` and `#NEW-1-5`.
- **Task 2, NAV 5 and Super NAV 5** (research B): on the recorder of task 0; pins `#NEW-2-1` to `#NEW-2-4`; the scale
  list as a characterization; the `ObsDtkElement` lead.
- **Task 3, FPL 0 and FPL 1 to 25** (research C, without its harness part): the trainer's spec tests; pins `#NEW-3-1` to
  `#NEW-3-3`, the numbered-plan `#150`, and the FPL half of `#NEW-7-5` if confirmed.
- **Task 4, SET 0 to 10** (research D): the SET 2 magnetic variation editor with the knobs, SET 1's editors; pins
  `#NEW-4-1` to `#NEW-4-5` and the second `#217`; the time zone sweep cut down.
- **Task 5, OTH 1 to 10 and STA 1 to 5** (research E): on the `simVars` option; pins `#NEW-5-1` (OTH 9), `#NEW-5-2` to
  `#NEW-5-5`, `#NEW-1-1` (OTH 6), #213; the trainer's OTH 3 and OTH 4 spec tests; STA 5's defaults only.
- **Task 6, TRI 0 to 6 and CAL 1 to 7** (research F): pins `#NEW-6-1` to `#NEW-6-3`, `#NEW-1-1` (TRI 3), `#NEW-5-1`
  (CAL 3); out-of-range values left out of the snapshots.
- **Task 7, MOD 1 and 2, ALT, DIRECT TO, DUPLICATE WAYPOINT, the self-test page** (research G): on the key-event option
  for `#NEW-7-4`; pins `#NEW-7-1` to `#NEW-7-6` and the MOD 2 `#160`; `VolatileMemory.test.ts:147` turned into the
  `#NEW-7-2` pin; the trainer's OBS spec tests.
- **Task 8, issues and close-out** (in the main checkout on the session branch, because it needs GitHub): the issues and
  comments above, the placeholders replaced in one commit, `testing.md` sections 6 and 7 (the gaps below), the session
  log with rule 18, and the checkbox.

**Notes for `testing.md`** (the close-out writes them): the fuel computer and `NUMBER OF ENGINES` (now a boot option);
`selectPage` runs the side effects of the pages it passes (CAL 2 overwrites the CAL 3 TAS, #33); `selectPage` throws
once a row overflows, so an overflow pin selects its page first and reads the raw row; a local `focused` helper for
Super NAV 5 (`SuperNav5.read()` has no mask); `vitest -t` takes a regular expression.

## Workflow

- **Models:** implementers start on Sonnet (rule 26); a task whose implementer struggles is re-dispatched on Opus.
  Reviewers run on Opus for tasks 2, 3 and 7 and on Sonnet for the others; re-reviews on Sonnet. The final review of the
  session runs on the controlling session's model.
- **Worktrees:** each implementer resets its worktree branch to `tests-session-8-left-pages` (after task 0 has merged)
  first; the controller checks the merge base before every review. The `node_modules` junction is removed with `rmdir`
  before `git worktree remove`, only after the maintainer approves the session; the research worktrees are cleaned up
  the same way.
- **Reports:** implementers and reviewers write their reports with a Bash heredoc (the Write tool as the fallback) into
  `task-<n>/` of the session scratchpad, and commit messages without a byte order mark.
- **Merge order:** by completion. Tasks 1 to 7 share no file; tasks 0 and 8 alone touch `testing.md` and the harness.
  `NullDashes.test.ts`, `ActiveWaypoint.test.ts` and `VolatileMemory.test.ts` belong to tasks 1, 1 and 7.
- **Done when:** every left page has at least its characterization test, the log lists the pages without a spec test,
  `grep -r "#NEW-" test/` finds nothing, and `npm test` and `npx tsc --noEmit` are clean.
