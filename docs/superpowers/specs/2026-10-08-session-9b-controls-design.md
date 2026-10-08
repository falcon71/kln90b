# Session 9b design: controls

Session 9b of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-9b-controls`.

## Scope

- **In:** the shared controls under `kln90b/controls/`, with `displays/`, `editors/` and `selects/`:
    - **A render test file per editor and select type**, driving the control with the knobs through the front panel on
      a page that hosts it, asserting the committed value (what the unit stores or shows after ENT or after the knob).
      The control file tests the control's own rules: the charset of each cell, the range, the refusal of an invalid
      value, the wrap at the ends of a cell, the cells the cursor visits, CLR, the keyboard where the control takes it.
      Where a page test of Sessions 8 or 9a already drives the control, the control still gets its own file (the
      maintainer's decision).
    - **A test file per display source file** (the maintainer's decision: a test per display, even where a page test
      already holds its format). Classes that share a source file share its test file (`FuelDisplay.test.ts` holds
      `TripFuelDisplay`, `OthFuelDisplay` and `FuelFlowDisplay`). Displays are mounted on their own (task 0's
      `mount()`), the cheapest stage that observes them.
    - `List` and `FlightplanList` scrolling, `WaypointDeleteListItem`, `Button`, `PageContainer`, `StatusLine`, `Blink`
      and `Inverted` masks, `MessagePage` with the pin of #191, `ErrorPage`, `CoordOrNearestView`,
      `AirportCoordOrNearestView`, `SuperNav5Left`, `SuperNav5Right`.
    - The controls' bugs that Session 9a pinned on pages (#277, #282, #288, #290) keep those pins; the control files
      pin the same issues again at control level where the control shows them.
    - Session 9a's leads for 9b (`docs/testing.md` sections 6 and 7): the decimal point of `NdbFreqEditor` and
      `DistanceEditor`, the status line's `ent` after an unread `msg`, the keyboard longitude below 100 degrees (#109).
- **Out:**
    - `Canvas.tsx`: the NAV 5, Super NAV 5 and APT 3 map tests hold it (98 % of statements). The label placement
      survivors of the research (labels over labels and over icons, `isLineVisible`) go to the log; no new map
      snapshot.
    - The self-test values and the boot sequence (Session 10). Task 5 may use the self-test page's APPROVE? as the host
      of the flashing `Button`, because no other page shows it; the test asserts the button only.
    - Take-home mode (unsupported, by the maintainer's decision); the SET 1 heading of #NEW-2-2 is tested on SET 1
      itself.
- **#40 is not a list fix.** Its commits (`8abd5f7`, `b135b3d`) touch only the scan code (`Scanlist`, `NearestList`,
  `WaypointPage`); the triage verdict "not testable" stands, and the cache window is held by `Scanlist.test.ts`. The fixes
  of list scrolling are `9a17b5b` (no issue) and #26 (`84a3008`), both held by `Oth3Page.test.ts`. The session log says
  so; no test cites #40.
- **Start state** on 2026-10-08: `npm test` 2122 passed and 279 expected failures in 241 files, `npx tsc --noEmit`
  clean. Coverage (statements): `kln90b/controls` 88.91 %, `controls/displays` 90.27 %, `controls/editors` 90.71 %,
  `controls/selects` 82.30 %. Below 60 %: `Blink.tsx` 0 %, `SuperDeviationBar.tsx` 53.3 %,
  `SuperNav5Field1Selector.tsx` 54.2 %, `FuelFieldset.tsx` 59.1 %.

## Research pass

Seven read-only agents worked in isolated worktrees (A: the editor base and the position, variation, date, time,
free-text and surface editors; B: the numeric and frequency editors; C: the waypoint editor and the selectors; D: the
fieldsets and the Super NAV 5 selectors; E: the lists, `Button` and `PageContainer`; F: the status line, the MSG and
error pages, the airport and coordinate views, Super NAV 5 left and right, `Canvas`; G: the displays). They read the code
and the Pilot's Guide through the local page index, drafted tests, ran each against a one-line break of its subject,
saw it fail and restored the tree; each pin was proven by a temporary fix. With each agent's drafts in place the full
suite was green and `tsc` clean. The reports are `research/research-A.md` to `research-G.md` in the session scratchpad,
the drafts `research/drafts-A/` to `drafts-G/` (also in the research worktrees). An eighth agent drove the KLN 89 trainer
(`research/trainer.md`, below). The plan carries the per-test setup, literals, citation and break; the implementer
confirms each by running it.

Findings that shape the tests:

- **The guide's figures are vector text.** Agent B read the inverse cells of figures 5-72 to 5-74 from the PDF's content
  streams: the open DIS and RAD fields are one inverse block with the decimal point inside. That settles the decimal
  point question of `testing.md` section 6 for DIS; the NDB frequency follows by extension (no figure shows its cursor).
- **One existing harness test freezes a bug** (rule 8): `test/render/harness/focused.test.ts:43` asserts the plain
  decimal point of the DIS field as a mask. Task 0 turns that line into a pin of `#NEW-0-1`.
- **The 9a lead "`ent` keeps the flashing inverse of an unread `msg`" is a harness misreading,** not a visible bug: CSS
  renders `.inverted-blink` without `.inverted` as normal text, while `Screen` reads it as `F`. Task 0 fixes the reader.
  The reverse case is a real bug (`#NEW-6-1`).
- **#109 is as wide as it reads.** The blank that entered `E 10°30.00'` on the SUP page in Session 9a came from
  `unit.panel.type`, which sends any character; the PC keyboard path (`KLN90BCore.handleKeyboardEvent`) maps only A to Z
  and 0 to 9, so no pilot can type a blank. Task 0 makes `type()` refuse what the keyboard cannot send.
- **`Screen.read()` drops a seventh row of a half page silently** (a full page throws). A creation block left visible
  under a waypoint page went unseen. A check that throws broke no existing test in the research's experiment.
- **Much of `FlightplanList` was unheld** before the drafts: six mutations survived the whole render stage (CLR on
  DELETE APR?, the inner knob on the procedure header, the cursor after the first waypoint of an empty plan, the focus
  after a deletion, an insert in front of a procedure, `refreshButtons` of an empty plan).
- **Flashing cells read `F` on one display tick in four.** The drafts sample a full cycle inline in several files;
  task 0 adds a sampler.
- **The Super NAV 5 selector drafts share helper modules** (`superNav5World.ts`, `arcWorld.ts`), and the NAV 3 and NAV 4
  leg world is copied five times; task 0 adds the fixtures.
- **The editor's autocompletion relies on the sim's search order:** `WaypointEditor.onCharChanged` asks for one result
  and `KLNFacilityLoader` sorts after that cut, so "digits before letters" (3-21) holds only because the fake returns
  sorted results. Unknown for the sim: a lead (`testing.md` section 7), not an issue.

## Trainer results

A trainer agent drove the KLN 89 trainer on 2026-10-08 (`research/trainer.md`; the maintainer started the VM). It
answered 31 of 35 questions; one was not done (duplicate idents), three cannot be asked on the 89 (the deleted
waypoint's page, the prompt while the MSG page shows, an airport below sea level). Paraphrased; high confidence unless
noted:

- **Editing:** the outer knob stops at the first and the last cell of an open edit (latitude, radial, date, an FPL 0
  ident); CLR during an open edit brings the old value back and keeps the cursor on the field, and a following ENT
  does nothing; CRSR during an edit turns the cursor off with the old value back; every cell wraps in both directions;
  ENT on a partly filled field counts the dashed cells as 0 (`20` and dashes gives 200.0); calculator values change
  without ENT.
- **Fields:** the open longitude edit shows the hundreds digit (`E008°`), the entered value is blank-padded
  (`E  8°00.00'`); the latitude tens offers 0 to 8 only, so 90° cannot be entered; the radial's hundreds and tens form
  one block 00 to 35, so 360.0 cannot be entered; SET 1 gives back the offered and the entered heading unchanged after
  confirmation (6°, 270°, 010°, also with a manual variation of 10°E); the ground speed is `005` open and `  5kt`
  entered; the remark charset holds a hyphen between 9 and the blank; millibars below 1000 show ` 993mB`; the seconds
  restart at 00 after a time entry.
- **Waypoints:** the first inner click of an ident entry gives `A` and the autocompletion; CLR during the flight plan
  confirmation returns to the blank position and the next ENT adds nothing; CLR during the Direct To confirmation, then
  ENT, cancels the Direct To.
- **Lists:** on a Del question the outer knob drops the question and moves the cursor (FPL and the user waypoint list),
  the inner knob opens an entry in front of the waypoint (FPL) or is ignored (user list); after a deletion the cursor is
  on the waypoint that moved up; the `?` sits in a fixed column; CLR twice on the approach header keeps the approach; the
  inner knob there opens an en route entry before it; an insertion in a scrolled FPL 0 keeps the page where it was.
- **Messages:** with an unseen message on the second MSG page, leaving the first page keeps the prompt flashing (#191);
  MSG with no messages shows `No Message`.
- **Displays:** an ETE below an hour on the trip calculator shows `0:31`; bearings go from 359 to 0 and never show 360;
  a position of exactly zero shows `N` and `E`.
- **The cursor comes back on the first field** when it is turned off and on. Pilot's Guide 4-3 (section 4.1.2, step 3)
  implies the 90B remembers the position while the page is not left; the 90B guide wins (below), so the code's
  remembered field stays correct.
- **Layouts that differ on the 89** (the longitude block 00 to 17, the radial block 00 to 35, the CAL 7 heading as one
  three-digit block, the CAL 3 minutes as one block) are notes, not pins.
- **Trainer state after the round:** the user waypoints, flight plans, Direct To and settings it used were removed or
  restored. It left the SET 1 position near KORD, a take-home heading of 10°, the clock about 8 minutes ahead, an expired
  CAL 3 alarm and the CAL 7 heading at 000°.

## Maintainer's decisions

- **Displays:** one test file per display (source file), even where page tests hold the format.
- **Trainer:** one round after the research and before the design (done, above).
- **Harness:** the larger task 0, plus the keyboard guard (below).
- **Evidence rule** (as in Session 9a): the 90B Pilot's Guide and its figures win; the KLN 89 trainer decides where the
  90B guide is silent; a layout that exists only on the 89 never becomes a pin.
- The task split (section Tasks), the bug table, the issue comments and the workflow: approved.

**The controller's defaults** (presented with the design, not objected to):

- **One issue per shared bug**, numbered by the lowest task that pins it; each pin carries the same number. A
  control-level pin of a bug a page already pins carries the page's issue number.
- **The editor base rules live in `Editor.test.ts`** (task 1): the outer knob at the ends of an open edit, CLR, CRSR,
  the cell wrap, ENT on a partly filled field, the keyboard auto-advance. Task 2 moves its base characterizations
  (CLR, cursor off, digit wrap, outer wrap on DIS) out of `DistanceEditor.test.ts` and hands them to task 1 through the
  plan; the DIS file keeps the DIS rules.
- **Trainer agreements become spec tests** citing "the KLN 89 trainer, 2026-10-08" (the CRSR restore, the wraps, ENT on
  a partly filled field, the radial 360.0 refusal, the Direct To cancel after CLR, the approach header's CLR and inner
  knob). Characterizations the trainer contradicts become pins.
- **The cursor position after CRSR off and on** is a spec test citing 4-3 on a numbered flight plan page (the code
  remembers the field); no pin, and the 89's first field is a note.
- **#NEW-1-1 and the latitude 90°00':** the 89 offers no 9 in the latitude tens, so the pins are N 90°30' refused and no
  `9` among the tens choices; the sibling is N 89°59.99' accepted. The longitude pin is E 180°30' refused; E 180°00' gets
  no test.
- **The #109 pin in `KeyboardService.test.ts`** asserts the longitude after ENT, not in the open field (which shows
  `#NEW-1-2`). Task 1 owns that edit.
- **`#NEW-6-3` (MSG with no messages):** task 6 looks for a 90B text in the guide (3-16, 3-23, the message appendix). A
  pin only if one is found; otherwise the issue is filed without a pin (an assertion that "some text" shows would be
  permissive).
- **`#NEW-4-4` (millibars below 1000) and #263 on `BearingDisplay`:** the implementer checks the 90B figures first; a
  90B figure that shows zero padding beats the 89. #263's pin asserts `000°` (the 90B pads bearings with zeros), not the
  89's `  0°`.
- **The #102 pins of APT 1's airspace row** live in `AirportCoordOrNearestView.test.ts` (task 6), and #102 gets a comment.
- **`ErrorPage` path tests** that inject throws through spies are characterizations and stay (#118 keeps the ENT path
  out).
- **Not added:** status line tests of `arm:nnn` and `apr-leg` (the mode field is held by Session 5 and 8 tests; a log
  line), the Super NAV 5 VNAV forms in the Field 1 file (held by `Nav4Vnav.test.ts` and `Vnav.test.ts`).
- **Citations the research called weak:** the CAL 6 time cells cite the trainer (T15, T4) instead of the self-test's
  3-6; the ENT-moves-the-cursor test cites the video the code cites; the OBS wrap across north cites the trainer
  observation recorded in #263; the `Set9Page.test.ts` wrap row (under 3-57, which says nothing of a wrap) gains the
  trainer citation (task 4).
- **Overlaps accepted:** `NullDashes.test.ts` stays as it is beside the per-display files; the hand-built
  `NavPageState` stubs of `ActiveArrow` and `FlightplanArrow` (cast through `unknown`) are accepted; the #266
  control pin in `DistanceDisplay.test.ts` says in its comment that a fix in the nearest views instead would leave it
  failing.
- **Log only:** the label placement survivors of `Canvas`; the fake's search order (L1 of research C); `FakeCoherent`'s
  no-op `on`, `off` and `trigger`; the untested tenth digit of `RadialEditor.convertFromValue` (every reachable radial
  meets #281); the NDB frequency range (190 to 1750 kHz) behind #277; the leads of each research report (section 5).

## Bugs to file

Placeholders per rule 23, numbered by the lowest task that pins them. Every one is searched on GitHub (open and closed)
before it is filed; the research searched the titles of all 301 issues and ran semantic searches.

| placeholder | research | where | what | expected | pinned by |
|---|---|---|---|---|---|
| `#NEW-0-1` | B-1 | `DistanceEditor.tsx:19`, `NdbFreqEditor.tsx:20` | the open DIS field and NDB frequency leave the decimal point outside the inverse block | one block over the whole field (5-19, figure 5-74; the NDB by extension of figures 5-72 to 5-74) | 0, 2 |
| `#NEW-1-1` | A-1, T9 | `LatitudeEditor.tsx:59`, `LongitudeEditor.tsx:145` | N 90°30' and E 180°30' are accepted; the latitude tens offers 9 | refused (C-1); the tens 0 to 8 (the trainer) | 1 |
| `#NEW-1-2` | A-2, T8 | `LongitudeEditor.tsx:18` | the open longitude edit shows a blank hundreds digit | `E008°` while open, `E  8°` entered (the trainer; related to #230 and #109) | 1 |
| `#NEW-1-3` | A-3, T12 | `EditorField.tsx:97-101` via `FreetextEditor` | a remark line cannot take a hyphen | the hyphen after 9 and before the blank (3-47, figure 3-144, the trainer); not on the Turn-On page (5-28) | 1 |
| `#NEW-1-4` | T1 | `Editor.outerRight`, `outerLeft` | the outer knob wraps inside an open edit | it stops at the first and the last cell (the trainer; related to #218) | 1, 3 |
| `#NEW-1-5` | T2 | `Editor` CLR | CLR during an open edit does nothing | the old value comes back, the cursor stays on the field (the trainer) | 1 |
| `#NEW-1-6` | T35, A lead | `LatitudeDisplay`, `LongitudeDisplay`, the two editors | exactly 0° shows `S` and `W` | `N` and `E` (the trainer) | 1, 7 |
| `#NEW-2-1` | B-2, T11 | `Set1Page.tsx:43,91-93,102` | CONFIRM? turns the SET 1 heading by the variation (080 comes back as 070) | the confirmed number comes back (3-19, the trainer) | 2 |
| `#NEW-3-1` | C-1, T18 | `FlightplanListItem.tsx:161-163`, `:218-220` | CLR while a typed waypoint awaits approval does nothing; ENT then adds it | the waypoint page goes, the position is blank, ENT adds nothing (4-2, the trainer) | 3 |
| `#NEW-3-2` | T6 | `WaypointEditor` first inner click | the first click blanks every cell | `A` and the autocompletion (the trainer) | 3 |
| `#NEW-4-1` | D-1 | `SuperNav5Field1Selector.tsx:82-94` | Super NAV 5 ETE shows `0:60` | `1:00` (3-36; references #223 and #184) | 4 |
| `#NEW-4-2` | D-2 | `SuperNav5Field1Selector.tsx:101-127` | Super NAV 5 XTK shows `.00NM` at 0.996 NM and `10.0NM` (seven cells) | `1.0NM` or `.99NM`; six cells (6-8, 6-9, figures 6-14 to 6-16) | 4 |
| `#NEW-4-3` | D-3 | `VnavFieldsets.tsx:79-86`, `Cal4Page.tsx:52-73` | a CAL 4 angle of 10° or more renders `ANGLE: 1.°` | the field keeps its cells and degree sign (5-12; related to #257) | 4 |
| `#NEW-4-4` | T16 | the millibar baro form (ALT, CAL 1) | 993 mB shows `0993` | ` 993` (the trainer), unless a 90B figure shows the zero | 4 |
| `#NEW-5-1` | E-1 | `WaypointDeleteListItem.tsx`, `ListItem.tsx:74-79` | after CLR and ENT on OTH 3 the deleted waypoint's page stays on the right | the right side returns to its previous page (5-20, 3-14; medium) | 5 |
| `#NEW-5-2` | T21, T22 | `FlightplanListItem`, `WaypointDeleteListItem` | the outer knob is ignored on a Del question | the question goes and the cursor moves (the trainer) | 5 |
| `#NEW-5-3` | T25 | OTH 4 Del text | `DEL M39 ?`: the `?` right after the ident | the `?` in a fixed column (the trainer) | 5 |
| `#NEW-5-4` | T28 | `FlightplanList` insertion | an insertion in a scrolled FPL 0 jumps to the top of the plan | the page stays (the trainer) | 5 |
| `#NEW-6-1` | F-1 | `StatusLine.tsx:111-131` | after an `ent` that ended in its blink phase the `msg` prompt is invisible | `msg` inverse and flashing while unread (3-16, figure 3-55) | 6 |
| `#NEW-6-2` | F-2 | `SuperNav5Left.tsx:104` | Super NAV 5 shows ENR-OBS as `ENR050` | `ENR:050` (5-32; medium) | 6 |
| `#NEW-6-3` | T30 | `MessagePage` | MSG with no messages shows an empty page | a text (the trainer: `No Message`); pinned only with a 90B text | 6 or none |
| `#NEW-7-1` | G-1 | `FlightplanArrow.tsx:40` | FPL 0 draws the active-leg symbol through a NAV flag | no symbol (4-7) | 7 |
| `#NEW-7-2` | G-2 | `SuperDeviationBar.tsx:32` | the Super NAV 1 bar scales ×11 a side; it misses the dots and lands past the outer dot at full scale | two cells per NM, on the dots (3-31, 3-32) | 7 |
| `#NEW-7-3` | T32, G-T1 | `DurationDisplay` on TRI 1, 3, 5 | an ETE below an hour shows `  :13` | `0:13` (figure 3-50, the trainer) | 7 |

**Issues without a pin:** a `question` on the Super NAV 5 `msg` prompt in normal video once all messages are read
(F-3: 3-16 and 3-36 by inference, the photos inconclusive); `#NEW-6-3` if no 90B text is found.

**Comments on known issues** (the issues task): #99 (the latitude and longitude editors drop a cell just below a whole
degree, `N 46°0.00'` on SET 1; pinned with #99), #102 (APT 1's airspace row depends on the airport shown before; two
pins), #109 (the ground speed and NDB frequency fields refuse a typed 0; the PC keyboard has no blank), #226 (TRI F REQ
shows `100.0` for 99.97; pinned with #226), #242 (on a numbered plan the cursor lands one position up after a deletion;
pinned with #242), #263 (`BearingDisplay` shows `360°` from 359.5, and the 89 never shows 360; pinned with #263), #191
(now pinned; the trainer confirmed it).

**Known issues pinned at control level:** #191, #225, #226, #223, #230, #99, #266, #255, #256, #245, #262, #276, #277,
#282, #288 (twice), #290 (twice), #109 (the speed and NDB fields).

## Tasks

Rules 20 to 22 apply. Each implementer gets its research report, its drafts, the trainer report and this design. It
moves the drafts onto the task 0 helpers, renames the research placeholders to the ones above, turns the
characterizations the trainer contradicts into pins and the ones it confirms into spec tests, re-proves every test in
its own worktree against the committed tree (by the break the report recorded and by at least one break it chooses
itself), and records one `Proof:` line per item in its commit. It reports a per-describe label audit (title, spec or
characterization, any page number or source) before the review. Each agent uses its own scratch folder (`task-<n>/` in
the session scratchpad).

- **Task 0, harness** (alone, before the others), each item with a harness test and its paragraph in `testing.md`:
    1. `mount(el)` (`test/harness/render/mount.ts`): renders a control into a detached element, returns `text()`,
       `mask()` (read like the screen) and `tick(blink)`; `testing.md` section 4 gets the exception that a mounted
       control, having no tick loop, is ticked by hand;
    2. a blink-cycle sampler over four display ticks (for `Screen` rows and for a mounted control), replacing the
       drafts' inline loops;
    3. `Screen` reads `.inverted-blink` without `.inverted` as a normal cell (CSS renders it so), not `F`;
    4. `Screen.read()` throws on a non-blank seventh row of a half page;
    5. `SuperNav5.focused()` and the fixtures `legWorld()` and `arcWorld()` (from the research D helper modules and the
       copies in `Nav3Page`, `Nav4Page`);
    6. the keyboard guard: `unit.panel.type` throws on a character the PC keyboard cannot send (anything but A to Z and
       0 to 9); the existing tests that type a blank (the SUP longitude row, the #277 pin and its sibling in
       `NdbPage.test.ts`, any harness test) enter those cells with the knobs instead, and the #277 pin is re-proven by
       its fix;
    7. `test/render/harness/focused.test.ts:43`: the mask line becomes a pin of `#NEW-0-1`, its sibling keeps the text;
    8. `testing.md`: sections 3, 4 and 6 (the decimal point paragraph rewritten: the plain point is `#NEW-0-1`; the
       keyboard path; the mask rule), section 7 (the research leads listed under Log only).
- **Task 1, the editor base and the position, variation, date, time, free-text and surface editors** (research A, plus
  the base characterizations from research B): pins `#NEW-1-1` to `#NEW-1-6` (`#NEW-1-6` on the editors), #99 (the
  editors), the #109 literal; trainer spec tests T3, T4, T5.
- **Task 2, the numeric and frequency editors** (research B): pins `#NEW-0-1`, `#NEW-2-1` (in `Set1Page.test.ts`), #277,
  #282, #288 (twice), #245, #109 (the speed and NDB fields); the radial 360.0 refusal as a spec test (T10).
- **Task 3, the waypoint editor and the selectors** (research C): pins `#NEW-3-1`, `#NEW-3-2`, `#NEW-1-4` (the ident's
  outer knob, E12), #290 (twice), #276, #262; the CRSR spec test on 4-3; the Direct To cancel (T19) as a spec test.
- **Task 4, the fieldsets and the Super NAV 5 selectors** (research D): on task 0's Super NAV 5 helpers and fixtures;
  pins `#NEW-4-1` to `#NEW-4-4`, #255, #256; the `Set9Page.test.ts` citation.
- **Task 5, the lists, `Button` and `PageContainer`** (research E): pins `#NEW-5-1` to `#NEW-5-4`, #242; the approach
  header (T26, T27) as spec tests.
- **Task 6, the status line, the MSG and error pages, the views, Super NAV 5 left and right** (research F): pins
  `#NEW-6-1`, `#NEW-6-2`, `#NEW-6-3` (if a 90B text is found), #191, #102 (twice).
- **Task 7, the displays** (research G): on task 0's `mount()`; pins `#NEW-7-1` to `#NEW-7-3`, `#NEW-1-6` (the
  displays), #225 (twice), #226 (three: the two of the draft and the TRI F REQ), #223 (twice), #230 (twice), #99
  (twice), #266, #263 (`BearingDisplay`).
- **Task 8, issues and close-out** (in the main checkout on the session branch, because it needs GitHub): the issues
  and comments above, the placeholders replaced in one commit, `testing.md` sections 6 and 7, the session log with rule
  18, and the checkbox. Issue edits (as opposed to comments and new issues) need the maintainer's explicit OK.

## Workflow

- **Models:** implementers on Sonnet (rule 26); a task whose implementer struggles is re-dispatched on Opus. Reviewers
  on Opus for tasks 1, 3, 5 and 6 and on Sonnet for the others; re-reviews on Sonnet. The final review of the session
  runs on the controlling session's model.
- **Worktrees:** each implementer resets its worktree branch to `tests-session-9b-controls` (after task 0 has merged)
  first; the controller checks the merge base before every review. Agent worktrees lack `node_modules`; a junction to
  the main checkout's is created, and removed with `rmdir` before `git worktree remove`, only after the maintainer
  approves the session. The research worktrees are cleaned up the same way.
- **Reports:** implementers write `.task-report.md` at the root of their own worktree (untracked) and reply with the
  status, the head commit and their concerns; reviewers write into `task-<n>/` of the session scratchpad. Commit
  messages without a byte order mark.
- **File owners:** every file has one task. Tasks 0 and 8 alone touch `testing.md` and the harness. Task 0 owns
  `focused.test.ts`, the blank-typing rows of `SupPage.test.ts` and `NdbPage.test.ts`; task 1 owns
  `KeyboardService.test.ts`; task 2 owns `Set1Page.test.ts`; task 4 owns `Set9Page.test.ts`. A task that needs a change
  in another task's file reports it instead.
- **Merge order:** by completion.
- **Done when:** every editor, select and display type has a test file, the log lists the gaps, `grep -r "#NEW-" test/`
  finds nothing, and `npm test` and `npx tsc --noEmit` are clean.
