# Session 10b design: the audit's findings before the close-out

Session 10b of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal and items (section 3). The research is the audit recorded in
[the findings](2026-10-09-session-10b-findings.md); this design settles its open scope and assigns the work. Branch:
`tests-session-10b-audit`.

## Start state

On 2026-10-10 at `30b4a9c`: `npm test` 313 files, 2732 passed, 365 expected failures; `npx tsc --noEmit` clean.
Coverage of `kln90b/`: statements 92.82 %, branches 87.36 %, functions 91.94 %, lines 92.78 %, the same as in the
findings.

## Research

The session starts from the findings instead of a research pass of its own (section 3). The controlling session
confirmed against the code and the documents:

- **#96 is pinnable cheaply.** The SDK `EventBus` has `getTopicSubscriberCount(topic)`, so the leak of
  `KLNFacilityRepository.SYNC_TOPIC` handlers by OTH 3 and OTH 4 can be counted.
- **APT 3 codes (3-44, PDF page 66).** The guide lists the lighting codes (L, LPC, LPT, blank for none) and the surface
  codes, and names the materials that count as hard surface (asphalt, concrete, tarmac, brick and bitumen among them);
  blank means the surface is unknown. The SDK's `RunwaySurfaceType` has no clay, so CLY cannot occur. The SDK types the
  guide does not name (coral, oil treated, planks, the water types and others) fall to the default branch.
- **The `FiveSegmentPage` SCAN fall-through** (`FiveSegmentPage.tsx`, the right scan with the cursor on acting as the
  inner knob) has a code comment naming the KLN 89 trainer as its source, but no recorded trainer observation.
- A read-only inventory agent maps every copy each helper replaces to its file and line
  (`inventory.md` in the session scratchpad). The plan assigns files to tasks from it.

## Maintainer's decisions

- **Harness:** H1 to H5 (required) and all of H6 to H13 are built.
- **Debt:** D1 to D3 (required) and D4 to D7 in full: the named nearest-search wait and a comment on every other bare
  long wait (D4); unjustified per-test timeouts dropped, the others justified in a comment (D5); a comment naming each
  coupling to a private member, without a production change (D6); all small items of D7 fixed.
- **Components:** `FiveSegmentPage` and the APT 3 string table (required), and `Apt3ListPageContainer`. The ENT order of
  `FourSegmentPage` is not tested and goes to `testing.md` section 7.
- **#96:** pinned with a handler count.
- The harness API, the task split, the proof rules and the defaults below: approved.

## Harness (task 0)

Each helper gets a harness test and a paragraph in `testing.md` section 4. Names are binding for the plan; the
implementer may adjust a signature detail it reports.

- **H1. `panelXml(opts)`** in its own file `test/harness/panelXml.ts` (`MINIMAL_PANEL_XML` stays in `boot.ts`). Its keys are the parser's own dotted
  paths (`'VFROnly'`, `'Input.ObsSource'`, `'Output.WriteGPSSimVars'`), typed as a literal union derived from a
  `PANEL_KEYS` tuple, with values of string, number or boolean, and an `extra` string for raw XML a test needs beyond
  the keys. Named presets are objects to spread: `NO_OBS` (`Input.ObsSource` 0), `HEADING_INPUT`, `NO_GPS_SIMVARS`,
  `LEG_OBS_SWITCH`, `NO_ALTIMETER`, `VFR_ONLY` and a `fuelComputer(o)` function. The harness test parses every key of
  `PANEL_KEYS` with a non-default value through the real `KLN90BPlaneSettingsParser` and asserts that the setting changed,
  and asserts the setting each preset changes. A key the parser does not read then fails in the harness test instead of
  leaving a test on the default.
- **H2. `unit.panel.readMessages(max)`** on `FrontPanel`: presses MSG until the MSG page closes, returns the texts of the
  pages it saw in order, throws with the screen if the page has not closed after `max` presses, and waits one second.
- **H3. `userWaypoints(unit, type?)`**: the facilities of `unit.props.facilityRepository`, filtered by facility type when
  `type` is given. A migrated test that filtered on `FacilityType.USR` passes the type, so the meaning is stated.
- **H4. `messages(unit)`**: the texts of the message handler's list.
- **H5. `Screen.inverse(row)`** (the inverse characters of a full-width row) and **`Screen.pageRows()`** (the six rows of
  a full page, trimmed). `approveSelfTestPage` and `expectVfrPage` stay two-line locals unless the implementer finds a
  third user.
- **H6. `fplIdents(unit, idx = 0)`** and a pure **`identsOf(legs)`** in `test/harness/flightplan.ts`.
- **H7. `unit.panel.directTo(ident, {waitMs = 1000})`**: D→, the ident, ENT, and the wait. A test that needs another
  wait passes it with a comment.
- **H8.** In `test/harness/render/superNav5.ts`: **`showSuperNav5(unit)`** (NAV 4 on the right, NAV 5 on the left, the
  right inner knob), which throws unless the overlay is the Super NAV 5 page; **`superNav5OnLeg(o)`** and
  **`superNav5OnArc(o)`**, moved from the field selector tests.
- **H9. `bootOnStandardRoute(opts)`**: stores `standardRoute()` as FPL 0, boots, settles, and throws unless ABC is
  active. Magvar, extra facilities and the other boot options come through `opts`.
- **H10. `activeIdent(unit)`** and **`turnStackLength(unit)`**.
- **H11. `bootOnDtWorld({fpl3?, moving?})`** on the existing `dtWorld()` fixture, and **`unit.panel.show(side, page)`**
  (select the page, wait, return the half's rows).
- **H12. `mountedText(el)`** in `test/harness/render/mount.ts`: mount, one display tick, the text.
- **H13.** `NEAREST_SEARCH_WAIT_MS` (the nearest list searches every 10 s, with margin), `muteConsoleError()`,
  `confirmSet1AndReselect(unit)` (SET 1 CONFIRM?, then the page reselected), `sim.writeCount(name)` on `FakeSim` (it
  upper-cases the name), `unit.overlay()` on `HeadlessUnit`, and `enterSet2Date(unit, date)` for the #111 steps of D3.

Task 0 moves no test files except the harness tests of the helpers themselves. It removes from `testing.md` section 7
only the items it builds; the copies left behind are the main tasks' business.

## Tasks

Rules 20 to 22 apply. Every test file has exactly one owner, by directory:

| task | owns | items |
|---|---|---|
| 0 | `test/harness/**`, new harness tests, `testing.md` section 4 | the helpers above |
| 1 | `test/render/pages/left/`, the top-level `test/render/pages/*.test.ts` | moves and stragglers in its files; `test/render/pages/FiveSegmentPage.test.ts` (new); the #96 pin; the Set2Page half of D3 |
| 2 | `test/render/pages/right/`, `test/unit/pages/right/Apt3ListPage.test.ts` (new) | moves and stragglers; the `Apt3ListPageContainer` tests; the APT 3 string table |
| 3 | `test/render/controls/**` | moves and stragglers |
| 4 | the top-level `test/render/*.test.ts`, `test/render/data/**`, `test/render/services/` | moves and stragglers; the #95 pin; D2; the PersistentMessages half of D3 |
| 5 | `test/unit/**` (except task 2's new file), `test/flight/**`, the existing tests in `test/render/harness/` and `test/unit/harness/`, `test/flight/harness/` | moves and stragglers; the #93 pin; D1; D6; D7 |
| 6 | issues and close-out: `docs/test-coverage.md`, `testing.md` section 7 | below |

If the inventory shows that a task is too large for one context, the plan splits it by file name, not by helper. The
plan splits task 1 into two tasks (left pages A to N with the top-level page files, and O to Z), so its numbering runs
one higher from there.

- **Task 0** runs alone. Tasks 1 to 5 run in parallel worktrees after it is merged. Task 6 runs last.
- **New component tests:**
    - `FiveSegmentPage`: the right scan with the cursor on acting as the inner knob, the scan with the cursor off, and the
      ENT order (a half page waiting for confirmation first, then left, then right), driven on the self-test page.
      Characterizations, because no source beyond the code comment is recorded.
    - The APT 3 string table: a unit table. Spec rows (3-44) for the materials the guide names and for the lighting
      codes; characterization rows for the SDK types the guide does not name and for the turf mapping of the grass types
      if the implementer finds 3-44 does not settle it. Macadam is left out (#270).
    - `Apt3ListPageContainer`: the switch between the database runway list and the user airport's, through APT 3 scans.
      Spec where 3-44 or 5-16 gives the rule, characterization otherwise.
- **Pins:**
    - #93 (task 5): with `Input.FuelComputer.Unit` IMP and a JetB type, the fuel unit follows the type. Unit stage on the
      `FuelComputer` of `Sensors.ts`, with a passing sibling for the GAL path. Source: the panel.xml contract.
    - #95 (task 4): a `MemoryFacilityClient` whose nearest search rejects once; after the rejection (taken with
      `unit.takeRejections()`) and a working search, the nearest list updates again. A passing sibling holds the setup.
      Source: `docs/architecture.md` and `CLAUDE.md` (the unit keeps working; errors reach the error page).
    - #96 (task 1): the subscriber count of `KLNFacilityRepository.SYNC_TOPIC` after leaving OTH 3 and OTH 4 a few times
      equals the count before; the passing sibling asserts that the count rises while the page shows, so the count is
      observable.
- **Task 6:** files every `#NEW-<task>-<n>` placeholder per rule 23; writes the session log; updates `testing.md` section
  7 (the resolved copy items leave it, the copies kept with a reason are named, `FourSegmentPage`'s ENT order is added);
  ticks section 3; and carries item 6: Session 11's steps in `test-coverage.md` gain the gaps of findings section 6 (a
  dated trainer record for the `T<n>` ids, the rules `testing.md` cites by number restated in its own words, the deletion
  of `docs/superpowers/`, the regrouping of section 7 by area, the exemption of the harness self-test pin of
  `rejections.test.ts` from step 4, the two superseded triage rows to confirm, the stale #213 claim, and the controlling
  session's memory notes). Only the plan's text changes; the work stays with Session 11.

## Proof

- **Moved tests:** a move whose setup changes meaning (a drifted copy, a panel.xml tag, an H3 filter, an H9 settle, a
  changed H7 wait) is re-proven by the break its original commit recorded (`Proof:` lines in `git log`), or by a break
  the implementer chooses when none is recorded. A rename without a change of meaning (H4, H6, H10, H12) needs the full
  suite green and one break per helper per task. The commit lists one `Proof:` line per helper and per re-proven test.
- **New tests and pins:** rule 10; each pin's temporary fix is run against the full suite, so that a test elsewhere that
  uses the bug as its vehicle is found.
- **A test that turns red after its move** (for example a corrected tag that was testing the default) is a finding: the
  implementer reports it and corrects the test, or pins a code bug with a `#NEW-` placeholder. It never loosens an
  assertion to make it pass.
- **Citations:** 3-44 was checked against the PDF by the controlling session. Reviewers check every page citation in
  their diff against the Pilot's Guide index (rule 24).
- **Implementers** report a per-describe label audit (title, spec or characterization, any page number) before review,
  write their report to `.task-report.md` at the root of their worktree, and run the full `npm test` and `npx tsc
  --noEmit` before committing.

## Out of scope

- The work of Session 11 itself (the coverage record, the trainer record, the deletion of the plan).
- Production code changes beyond rule 12; D6 is comments only.
- The `FourSegmentPage` ENT order (section 7), take-home mode.
