# Session 9a design: pages, right side

Session 9a of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-9-right-pages`.

## Scope

- **The split.** The maintainer split Session 9 in two: 9a (this session) covers the pages under
  `kln90b/pages/right/`, and 9b covers the shared controls (`kln90b/controls/`), the old item 2 of Session 9.
  `test-coverage.md` section 3 carries both.
- **In:** APT 1 to APT 8 (APT 2 with its database and user variants, APT 3 with its map, list and user variants), VOR,
  NDB, INT, SUP, REF, ACT (with ACT 7 and ACT 8), D/T 1 to D/T 4 (the FPL and other variants), CTR 1 and CTR 2, the
  waypoint confirmation page and the generic `WaypointPage` (SCAN, the nearest list, the page memory, the user waypoint
  creation). Per page: a labeled characterization snapshot in a representative state, spec tests where the Pilot's Guide
  (or the KLN 89 trainer) gives the rule, and pins for the bugs found. Also a harness task (below).
- **Out:**
    - The shared controls themselves (Session 9b), except where a right page is the cheapest observation of a
      control's bug: those bugs are pinned on the page and 9b references the same issues.
    - The self-test values and the boot sequence (Session 10); the self-test right page gets its characterization
      snapshot only, without the ALT row (below).
    - Take-home mode (unsupported, by the maintainer's decision).
    - The name and city search of 3-24 to 3-26: the SDK offers no such search, so it cannot be built; no issue, a log
      line only (the maintainer's decision).
- **Items earlier sessions deferred to Session 9:** the APT 2 time zone line (Session 6; task 0's time zone reply and
  task 1), the REF flow's second ENT that posts `NO SUP WPTS` and inserts nothing (seen by Session 6's research, now
  `#NEW-5-1` and `#NEW-5-3`), and the CTR 1 pin of #161 (Session 5; task 6). The MSG page seen-marking (#191) is a
  control and goes to Session 9b.
- **Start state** on 2026-10-07: `npm test` 1785 passed and 211 expected failures in 225 files, `npx tsc --noEmit`
  clean. Coverage of `kln90b/pages/right` 67.73 % of statements; below 50 %: `Ctr1Page.tsx` 33.7 %, `Apt4Page.tsx`
  40.9 %, `IntPage.tsx` 44.7 %, `NdbPage.tsx` 47.8 %.

## Research pass

Six read-only agents worked in isolated worktrees (A: APT 1 to 4; B: APT 5 to 8; C: VOR, NDB, INT; D: SUP, the generic
waypoint page, the confirmation page; E: REF, ACT, D/T 1 to 4; F: CTR 1 and 2, the self-test right page). They read
the code and the Pilot's Guide pages through the local page index, drafted tests, ran each against a one-line break of
its subject, saw it fail and restored the tree; each pin was proven by a temporary fix. With each agent's drafts in
place the full suite was green and `tsc` clean. The reports and drafts are in the session scratchpad
(`research/research-A.md` to `research-F.md`, `research/drafts-A/` to `drafts-F/`; the drafts are also in the research
worktrees). A seventh agent drove the KLN 89 trainer (`research/trainer.md`, below). The plan carries the per-test
setup, literals, citation and break; the implementer confirms each by running it.

Findings that shape the tests:

- **INT and SUP share most of their code** (`IntPage.tsx` is a near copy of `SupPage.tsx`), and REF and ACT reach the
  SUP page's code. So several bugs show on two to four pages: each is one issue, pinned on every page that shows it.
- **Some bugs live in controls Session 9b owns** (`NdbFreqEditor`, `DistanceEditor`, `WaypointSelector`). Each is pinned
  on the right page where the user sees it.
- **Two existing tests freeze a bug** (rule 8) and become pins: `test/render/pages/right/Apt1Page.test.ts:171` (the
  airport name abbreviated inside a word, `#NEW-1-2`) and `test/render/harness/enterIdent.test.ts:84` (the full-size
  `NM`, `#NEW-3-9`). The #65 test in `Apt1Page.test.ts` cites 5-19 where the page is 5-17.
- **The harness misleads in places:** `savedUserWaypoints({kind: 'apt', elevationFt})` writes meters; `airport()` puts
  the runway designations on the wrong ends for headings above 180; the time zone call has no reply, so APT 2's time
  zone row is always blank; `Screen.read()` cannot place the APT 8 and ACT 8 IAF list (`position: fixed` at column 16);
  `selectPage` cannot reach ACT when the active waypoint is an airport (its pages are ACT 1 to ACT 8); `focused()` and
  `cursorTo` throw on the NDB frequency and DIS editors, whose decimal point is not inverted.
- **CTR is testable without the OTH 2 detour** that `testing.md` section 7 describes, for one computation: with legs of
  about 300 NM, every Center is first returned by a search whose center lies inside it, which sidesteps the shared
  search session of #102. A second computation in one unit still meets #102, so a test that computes twice is its pin.

## Trainer results

A trainer agent drove the KLN 89 trainer on 2026-10-07 (`research/trainer.md`; the maintainer started the VM). The
maintainer accepts the 89 trainer as the reference where the 90B guide is silent. Paraphrased; high confidence unless
noted:

- **Radials** on the INT and user waypoint pages are magnetic, using the reference VOR's own variation: the true initial
  bearing at the VOR minus the VOR's published variation, on display and for an entry. Four published intersections fit
  within 0.05°; the bearing measured at the intersection is off by half a degree or more, and the local variation would
  be off by several degrees.
- A changed Ref recomputes Rad and Dis at once; after Ref, ENT, ENT the cursor is on Rad; Ref, Rad and Dis appear with
  the ident (no delay); distances are blank-padded with the small `nm`; Dis accepts 400.0 and 999.9.
- The user waypoint page with no user waypoints shows `0` and the creation choices without a message; the first click on
  a blank selector cell gives `A` (medium); a waypoint type's page keeps its waypoint over a change of type.
- **Nearest:** with the cursor parked on the rank, the page follows the new nearest at rank 1 (3-24); distances below
  10 NM show without a leading zero (the 90B figures show one; see the rulings).
- **Procedures:** CLR on the question that adds a STAR and the airport goes back to the waypoint list, and CLR goes back
  one step on each list; the cursor stays on the chosen procedure after CLR (medium, by analogy); runways align in one
  column; loading a second approach from APT 8 asks to replace the existing one; the cursor starts on the first
  procedure; an airport whose remarks are blanked stays in the remarks list.
- **NDB** frequencies on a whole kHz show without `.0` (medium).
- **FPL 0 and ACT:** the Dtk beside the active waypoint is the leg's DTK, not the bearing; a repeated active waypoint
  has no arrow at its second occurrence; ACT with nothing active shows its text and no message; the type letter sits in
  a fixed column (medium); no Direct To symbol on the 89's ETA line (its layout differs from D/T 4).
- **Not answerable:** airport names with words inside words (KHPN, KPHF are not in the trainer's database), the APT 7
  page order (no airport there has both SIDs and STARs). CTR and the self-test have no 89 counterpart.
- The trainer agent deleted the trainer's user waypoints (one, GCO, possibly stock data) and FPL 1 to FPL 5 (filler
  plans of Sessions 7 and 8), and blanked the KMKE remark.

## Maintainer's decisions

- **The split** into 9a (right pages) and 9b (controls).
- **The trainer:** one agent for all trainer questions after the research, before the design (done, above).
- **Nearest distances below 10 NM:** the four 90B figures (3-71, 3-76, 3-134, 3-154) win over the 89 trainer, whose
  nearest page has another layout: a bug with pins on the APT, VOR and NDB nearest views; the issue notes the 89.
- **Harness:** the larger task 0 (below).
- **Name and city search:** out of scope, impossible with the SDK; no issue.
- **3-24, case by case:** the cursor-off behavior (the shown airport stays and its rank counts up) is correct and gets a
  spec test; only the parked-cursor case is the bug.
- The bug table, the controller's defaults below and the task split: approved.

**The controller's defaults** (presented with the design; the maintainer did not object):

- **Bugs in controls** visible on a right page are pinned there (`#NEW-3-3`, `#NEW-3-8`, `#NEW-3-14`, `#NEW-4-2`);
  Session 9b references the same issues.
- **One issue per shared bug,** naming every page; each page's pin carries the same number.
- **APT 6** keeps `NO FUEL`, `NO OXYGEN` and `NO FEE INFO` in its snapshot: they are the code's deliberate placeholders
  (`Apt6Page.formatFuel` notes that the sim's fuel fields are always empty). A log line says so.
- **The self-test ALT row** stays out of the snapshot: figure 3-4 and photos of real units format it differently;
  Session 10 decides.
- **The ACT type letter column** (trainer, medium): task 5 checks the 90B ACT figures; a pin if they also show a fixed
  column, a log line otherwise.
- **`#NEW-5-8`** (D/T 4) is a pin on the photo of a real unit (the Session 8 ruling: photos count as evidence).
- **`#NEW-1-4`** (HF) is a bug on 3-45 even if the sim's data may never carry HF frequencies; the issue says so.
- **Macadam** shows a blank surface on APT 3: a `question` issue, no pin (the guide does not name macadam).
- **Log only:** the debug `console.log` calls (`WaypointPage`, `SupPage`, `IntPage`, `VorPage`, `NdbPage`, `Apt6Page`,
  `ActPage`, `WaypointConfirmPage`, `EditorField`, `WaypointSelector`); INT's delay before Ref, Rad and Dis show (a
  deliberate debounce, the 89 shows them at once); the 89 showing `360.0` for a radial of 0; `Apt3ListPage` sorting the
  shared runway array in place; the `NearestList` removal loop that skips an adjacent entry; the CTR leads (orphaned
  Center waypoints after a recomputation, crossings dropped without a VOR within 100 NM, a first waypoint outside every
  Center); the `ent` of the status line keeping the flashing inverse of an unread `msg` (Session 9b).
- **Code comments:** task 6 corrects the `5-21` class citations of `Ctr1Page` and `Ctr2Page` (5-25 to 5-27); task 1
  corrects the `5-19` citation of the #65 test and of `Apt1Page.createIfReady` (5-17). Comments only.

## Bugs to file

Placeholders per rule 23, numbered by the lowest task that pins them; a bug pinned by several tasks keeps one
placeholder. Every one is searched on GitHub (open and closed) before it is filed; the research searched the titles of
all issues and found none of them.

| placeholder | research | where | what | expected | pinned by |
|---|---|---|---|---|---|
| `#NEW-1-1` | A-1 | `AirportCoordOrNearestView.tsx:234` | MILTRY and PRIVAT start one cell left and touch the airspace class (`CL BMILTRY`) | the class left, the type right (3-42) | 1 |
| `#NEW-1-2` | A-2 | `Apt1Page.tsx:358-393` | name abbreviations replace inside words (WCHESTER, NEWPT, AIRPT) and a deleted THE leaves a blank | whole words only (3-26, figures 3-71, 3-84) | 1 |
| `#NEW-1-3` | A-3, C-3 | `DistanceDisplay` via `AirportCoordOrNearestView`, `CoordOrNearestView` | a nearest distance below 10 NM shows ` 4.1nm` | `04.1nm` (figures 3-71, 3-76, 3-134, 3-154; the 89 differs) | 1, 3 |
| `#NEW-1-4` | A-4 | `Apt4Page.tsx:148` | an HF frequency shows `006.55` | `6547`, kHz without a point (3-45); may be latent | 1 |
| `#NEW-1-5` | A-5 | `WaypointPage.tsx:121-137` | with the cursor parked on NR 1 the page keeps the old airport (the held object's index is rewritten in place) | the nearest airport at NR 1 (3-24, the trainer) | 1 |
| `#NEW-1-6` | A-7 | `Apt3Page.tsx:75-85` | scanning from the runway diagram to an airport without runway data leaves the page blank | the runway note (3-44); continues #38 | 1 |
| `#NEW-2-1` | B-1 | `Apt7Page.tsx:160-166` | CLR on the add question does nothing (`step` 4 becomes 3, no `case 3`) | back to the waypoint list (6-5, the trainer) | 2 |
| `#NEW-2-2` | B-2 | `Apt7Page.tsx:693` | the runway list of a SID or STAR lacks `RW` | `RW09`, `RW27L` (figure 6-35) | 2 |
| `#NEW-2-3` | B (B-T2) | `Apt7Page`, `Apt8Page` `clear()` | CLR back to the procedure or approach list turns the cursor off | the cursor stays on the chosen entry (the trainer, medium) | 2 |
| `#NEW-2-4` | trainer T18 | `Apt8Page` load | a second approach loaded from APT 8 replaces the first silently | a replace question first (the trainer; the guide is silent) | 2 |
| `#NEW-3-1` | C-1 | `VorPage.tsx:70,109,134` | a VORTAC shows no `D` | `D` (3-49, figures 3-151, 3-152) | 3 |
| `#NEW-3-2` | C-2 | `VorSelector.tsx:13` | a VORTAC typed on the VOR page is taken as unknown | the VORTAC's page (3-14, 3-49) | 3 |
| `#NEW-3-3` | C-4 | `NdbFreqEditor.convertToValue` | the digits are added as numbers; every user NDB frequency gives `INVALID ENT` | ` 328.0` accepted (5-18, figure 5-66) | 3 |
| `#NEW-3-4` | C-5 | `VorPage.tsx:168-171` | after `IN ACT LIST` the refused variation stays on the page | the stored variation (C-1) | 3 |
| `#NEW-3-5` | C-6, D-2 | `IntPage.tsx:208`, `SupPage.tsx:204-207` | a REF entered on an existing waypoint keeps the old RAD and DIS | recomputed from the new REF (3-50, 3-51, figure 3-158, the trainer) | 3, 4 |
| `#NEW-3-6` | C-7, D-3, E-2, F | `IntPage.tsx:231`, `SupPage.tsx` (display and entry) | RAD is the true bearing | magnetic with the reference VOR's variation (5-44, figures 5-67, 5-76, 5-85, 5-92, a photo, the trainer) | 3, 4, 5 |
| `#NEW-3-7` | C-10 | `IntPage.tsx:231` | RAD is the final bearing at the intersection | the initial bearing at the VOR (the trainer's numbers) | 3 |
| `#NEW-3-8` | C-8, D-5 | `DistanceEditor.tsx` (first field) | DIS shows leading zeros (`012.0`) | ` 12.0` (figures 5-75, 5-76, a photo, the trainer) | 3, 4 |
| `#NEW-3-9` | C-9, D-4 | `IntPage.tsx:125`, `SupPage.tsx:117` | `NM` in full-size letters | the small `nm` (figures 3-155 to 3-159, the trainer) | 3, 4 |
| `#NEW-3-10` | C-11, D-1 | `WaypointConfirmPage.tsx:96-104` | after the Ref approval of a right-side editor the cursor stays on REF | on RAD (5-19 step 8, the trainer) | 3, 4 |
| `#NEW-3-11` | C-12 | `IntPage.tsx` `setRad`, `setDist` | editing RAD or DIS of a stored user intersection leaves the old lat/lon on the page | the new position (5-19) | 3 |
| `#NEW-3-12` | C-13 | `IntPage.tsx` `setRad`, `setDist` | ENT on RAD or DIS throws when no reference VOR is known | no throw (the Session 8 ruling on #243) | 3 |
| `#NEW-3-13` | C-Q1 | `NdbPage` frequency display | a database NDB on a whole kHz shows `251.0` | `251` (figures 3-153, 3-154, the trainer, medium) | 3 |
| `#NEW-3-14` | trainer T5 | `DistanceEditor.convertToValue` | DIS refuses 360 NM and more (copied from the radial editor) | up to 999.9 (figure 5-74, the trainer) | 3 |
| `#NEW-4-1` | D-7 | `SupPage.tsx:355-361`, `:382-388` (same in INT, VOR, NDB) | after `USR DB FULL` the refused waypoint shows as created and D-> can make it active | not created (C-2) | 4 |
| `#NEW-4-2` | D-6 | `WaypointSelector.tsx:44` | a short ident's blank cells have index -1: no cursor shows, the first click gives `0` | a blank cell whose first click gives `A` (3-20, the trainer) | 4 |
| `#NEW-5-1` | E-1 | `FlightplanList.tsx:487`, `WaypointEditor.tsx:232-235` | REF never inserts into FPL 0: turning the left cursor off cancels the confirmation (hidden on numbered plans by #242) | inserted after the approval, the left cursor on meanwhile (5-21, figures 5-85, 5-86) | 5 |
| `#NEW-5-2` | E-3 | `RefPage.tsx:123` | REF stores the bearing measured at the reference waypoint | the radial measured at the VOR (5-22) | 5 |
| `#NEW-5-3` | E-4 | `SupPage.tsx:69-71` | `NO SUP WPTS` is posted by ACT and by the REF confirmation page | only when the SUP page type is selected (C-2, the trainer) | 5 |
| `#NEW-5-4` | E-5 | `ActiveArrow.tsx:30` | the ACT arrow marks every copy of the active waypoint | only the active one (4-10, the trainer) | 5 |
| `#NEW-5-5` | E-6 | `Apt8Page.tsx:300` | ACT 8 shows the APT 8 title | the ACT header (a photo; figure 4-39 for ACT 3) | 5 |
| `#NEW-5-6` | E-7 | `Dt1FplPage.tsx:179,195`, `Dt2FplPage.tsx:198,214`, `Dt3FplPage.tsx:182-202` | dashes beside FPL 0 during a D-> outside the plan | blank (4-11, 4-12, figure 4-44) | 5 |
| `#NEW-5-7` | E-8 | `Dt3FplPage.tsx:128`, `Dt3OtherPage.tsx:97` | D/T 3 shows the bearing as the active waypoint's DTK | the leg's DTK (4-12, Appendix A, the trainer) | 5 |
| `#NEW-5-8` | E-9 | `Dt4Page.tsx:198` | no Direct To symbol before a Direct To destination | the symbol (a photo of a real unit) | 5 |
| `#NEW-6-1` | F-1 | `Ctr1Page.tsx:103`, `:159` | one Center waypoint shows ` 1 NEW WPTS` | ` 1 NEW WPT` (figure 5-96) | 6 |
| `#NEW-6-2` | F-2 | `Ctr2Page.tsx` | CTR 2 keeps the waypoints of a plan page that was left | back to the start state (5-26) | 6 |

**Known issues pinned and commented:** #92 (APT 5 shows RMKS FULL for an eleventh airport; a comment), #223 (two pins,
D/T 1 and D/T 4), #161 (pinned without the OTH 2 detour; a comment with the geometry and the numbered-plan case), #102
(the CTR recomputation of 5-27; a comment), #38 (referenced by `#NEW-1-6`).

**Issues without a pin:** a `question` on the macadam surface (A-8).

## Tasks

Rules 20 to 22 apply. Each implementer gets its research report, its drafts, the trainer report and this design. It
moves the drafts onto the task 0 helpers, renames the research placeholders to the ones above, re-proves every test in
its own worktree against the committed tree (by the break the report recorded and by at least one break it chooses
itself), and records one `Proof:` line per item in its commit. It reports a per-describe label audit (title, spec or
characterization, any page number) before the review. Each agent uses its own scratch folder (`task-<n>/` in the
session scratchpad) for helper scripts; the research round lost time to a shared script name.

- **Task 0, harness** (alone, before the others), each with a harness test and its paragraph in `testing.md`:
    1. `Screen.read()` lays the rows of the positioned `.apt-8-iaf-list` element where the screen shows them (APT 8,
       ACT 8), as it does for `.use-invert`;
    2. `savedUserWaypoints` takes the elevation of a user airport in feet and converts it (it writes meters today);
       existing users are checked;
    3. `airport()` (and `runwayFix`) names the runway ends right for headings above 180;
    4. `selectPage` reaches the ACT page when its pages are named `ACT 1` to `ACT 8`;
    5. an opt-in time zone reply, so APT 2 can show its time zone row;
    6. fixtures `dtWorld()` (the D/T pages) and `centerWorld()` (the CTR pages, with the 300 NM rule in its doc comment);
    7. a status-line message collector (the APT 5 and APT 8 drafts carry local copies);
    8. `focused()` and `cursorTo` read a field whose plain decimal point separates two inverted runs (the NDB frequency
       and DIS editors);
    9. `testing.md` section 7: the CTR 1 lead rewritten (no OTH 2 detour for one computation), and the note that
       `selectPage` reaches APT 7 from APT 8, so with SIDs and STARs it lands on the STAR page.
- **Task 1, APT 1 to APT 4** (research A): pins `#NEW-1-1` to `#NEW-1-6`; the cursor-off spec test of 3-24; the existing
  `Apt1Page.test.ts:171` row turned into the `#NEW-1-2` pin; the citation fixes above.
- **Task 2, APT 5 to APT 8** (research B): pins `#NEW-2-1` to `#NEW-2-4` and the render pin of #92; the IAF list read
  with task 0's reader.
- **Task 3, VOR, NDB and INT** (research C): pins `#NEW-1-3` (VOR, NDB), `#NEW-3-1` to `#NEW-3-14`; the row of
  `test/render/harness/enterIdent.test.ts:84` turned into the `#NEW-3-9` pin.
- **Task 4, SUP, the generic waypoint page and the confirmation page** (research D): pins `#NEW-3-5`, `#NEW-3-6`,
  `#NEW-3-8`, `#NEW-3-9`, `#NEW-3-10` (SUP), `#NEW-4-1`, `#NEW-4-2`; the ` 0` of an empty SUP page as a spec test on the
  trainer.
- **Task 5, REF, ACT and D/T 1 to D/T 4** (research E): pins `#NEW-3-6` (REF), `#NEW-5-1` to `#NEW-5-8` (`#NEW-5-6` on
  D/T 1, D/T 2 and D/T 3), #223 (D/T 1, D/T 4); the ACT type letter column per the default; the NO ACTIVE WAYPOINT
  tests of `f95d1d7` cite the video of the code as well as 4-10.
- **Task 6, CTR 1, CTR 2 and the self-test right page** (research F): on `centerWorld()`; pins `#NEW-6-1`, `#NEW-6-2`,
  #161, #102; the self-test snapshot without the ALT row; the CTR class citations.
- **Task 7, issues and close-out** (in the main checkout on the session branch, because it needs GitHub): the issues and
  comments above, the placeholders replaced in one commit, `testing.md` sections 6 and 7, the session log with rule 18,
  and the checkbox.

## Workflow

- **Models:** implementers on Sonnet (rule 26); a task whose implementer struggles is re-dispatched on Opus. Reviewers
  on Opus for tasks 1, 3 and 5 and on Sonnet for the others; re-reviews on Sonnet. The final review of the session runs
  on the controlling session's model.
- **Worktrees:** each implementer resets its worktree branch to `tests-session-9-right-pages` (after task 0 has merged)
  first; the controller checks the merge base before every review. Agent worktrees may lack `node_modules`; a junction to
  the main checkout's is created, and removed with `rmdir` before `git worktree remove`, only after the maintainer
  approves the session. The research worktrees are cleaned up the same way.
- **Reports:** implementers write `.task-report.md` at the root of their own worktree (untracked) and reply with the
  status, the head commit and their concerns; reviewers write into `task-<n>/` of the session scratchpad. Commit
  messages without a byte order mark.
- **Merge order:** by completion. Tasks 1 to 6 share no file; tasks 0 and 7 alone touch `testing.md` and the harness.
  `enterIdent.test.ts` belongs to task 3.
- **Done when:** every right page has at least its characterization test, the log lists the pages without a spec test,
  `grep -r "#NEW-" test/` finds nothing, and `npm test` and `npx tsc --noEmit` are clean.
