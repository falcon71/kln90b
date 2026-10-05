# Session 4 design: the public contract

Session 4 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-4-contract`.

## Scope

- **In:** the five items of Session 4: the public H events, the LVars, the panel.xml keys, the GPS SimVars with the
  `"kln90b"` planner mirror, and the persisted user data. Also a default navdata fixture for the harness (task 1),
  requested by the maintainer, and the pins for the bugs the research found in these areas.
- **Out:**
    - invalid panel.xml values: the maintainer's decision is an enhancement issue and no test (below);
    - the roll steering algorithm (Session 5, #100); only the LVar contract (sign, zero, range) is tested here;
    - the effects of panel.xml keys that belong to the page sessions (HeadingInput, BaroSource, AltimeterInterfaced,
      the fuel computer units: Sessions 6, 8 and 9);
    - `TakeHomeMode`, which is implemented but not supported for aircraft authors: no per-key test and no
      documentation;
    - the `Internal_*` events, which are private (`KeyboardService.test.ts` covers `Internal_Key`).
- **Start state** on 2026-10-05: `npm test` 505 passed and 40 expected failures in 124 files, `npx tsc --noEmit` clean,
  coverage identical to the end of Session 3b.

## Research pass

Five read-only agents worked in isolated worktrees: H events, LVars, panel.xml with the GPS SimVars and the planner,
persisted user data, and the default navdata fixture. They read the code and the wiki pages (panel.xml customization,
External Hardware, External Annunciators, Autopilot, CDI/HSI, RMI, Hot Swapping, Accessing the Flight Plan), wrote draft
tests, ran each against a one-line break of its subject, saw it fail, and restored the tree. The reports are in the
session scratchpad; the plan carries the per-test setup, literals, citation and break. The implementer confirms each by
running it. The research drafts are starting points, not finished tests.

Findings that shape the tests:

- **A renamed H event passes the whole suite today.** The unit ignores an unknown event without a word, and nearly every
  test drives the panel through the `EVT_` constants of `HEvents.ts`, so changing a constant's value changes the tests
  with it. The sweep cannot see it either. Hence a unit-stage pin of every public name as a literal, and spec tests that
  send literals (`unit.panel.press('KLN90B_…')`), never the constants.
- **Parsing `cfg/panel.xml` alone proves little.** The sample sets all but two keys to their code default, so a wrong
  lookup path stays green. Hence one document per key, each compared against the whole defaults object with that one
  field changed.
- **Several breaks leave the whole suite green today:** FPL 25 dropped on load, "only USER legs are stored", the
  missing-facility and 30-leg handling on load, a V2 longitude of 100 degrees or more, the SUP and grass formats, the
  V1 `activeWaypoint` reader and writer, the remark save and load, the remarks manager dropped from the save manager,
  ApprArm and Power_Toggle, and the `"kln90b"` planner's arc-ahead branch.
- **One assertion per `it` where breaks could mask each other.** Vitest stops at the first failed assertion, so the
  self-test LVars and the GPS SimVar groups are split.

## Maintainer's decisions

- **Invalid panel.xml values** (a non-numeric number, a boolean other than `true`, an unknown enum): no test. File an
  `enhancement` issue: an invalid value should not load, and the unit should show a highly visible error so the
  aircraft developer notices it.
- **Wiki and code disagree:** ruled case by case.
    - `Output.AltitudeAlertEnabled` should default to **false** (the samples), not true (the code): a bug, pinned.
    - The `"kln90b"` planner must not be written while `WriteGPSSimVars` is off; today the active-waypoint path is
      ungated: a bug, pinned.
    - A unit disabled for hot swapping (`L:KLN90B_Disabled`) must ignore H events; today it processes them: a bug,
      pinned.
    - The `L:KLN90B_*` outputs must go to their zero state when the unit loses power (not when it is disabled, which
      stays a deliberate freeze, `61f6b61`): a bug, pinned.
    - The WPT annunciator is steady during the waypoint alert (the code cites a video), although 3-29 and 4-8 describe a
      flashing light: the test asserts steady, as a contract test.
    - Roll steering without a heading input: the installation manual (2-69) says the real unit gives none. A bug,
      pinned, and a comment on #100 that its rework should take the heading input into account.
    - `KLN90B_ApprArm_Push` works without `Input.ExternalSwitches.AppArmSwitchInstalled`, which nothing reads: a comment
      on #133, no pin. ApprArm is tested with the key at its default.
    - Doc fixes: the session corrects only comments: `LVars.ts` (the values 0, 1, 2 of `L:KLN90B_HSI_TF_FLAGS`; that
      Power_On and Power_Off set `L:KLN90B_Power` too) and the two test comments that claim `LVars.ts` documents the
      flag values. `cfg/panel.xml` stays as it is (BasePath is needed only in special cases). The wiki corrections are
      listed in the session log for the maintainer.
- **V1 and V2 restore failures.** A V1 restore that fails is followed by the conversion, which persists the empty state:
  one `USER DATA LOST` and a clean store. That is intended. A V2 restore that fails writes nothing, so `USER DATA LOST`
  shows on every boot until a user-waypoint change wipes all waypoints at once and each plan edit overwrites one plan.
  That is not intended: a bug, pinned. The intended behavior is V1's: persist the empty state once.
- **Default navdata** (task 1): on by default, `defaultNavdata: false` opts out.

## Task 1: the default navdata fixture (alone, before the others)

A real unit always has a database, so only `NO SUP WPTS` (no user waypoints) is a realistic empty-list message. Test
worlds that lack an airport, VOR, NDB or intersection show `NO APT WPTS`, `NO VOR WPTS`, `NO NDB WPTS` or
`NO INT WPTS` whenever the page of that type is constructed, for example when `selectPage('R', 'APT 1')` turns the knob
back from SUP through INT, NDB and VOR. The research measured 51 tests in 22 files that run into it. No test or harness
code works around the message today (every assertion made while it shows reads a field it does not cover), so there is
nothing to simplify; the fixture keeps tests in a realistic state, and keeps a future whole-screen snapshot from freezing
the message.

- **`defaultNavdata()`** in `test/harness/fixtures.ts`: an airport `ZZXA`, a VOR `ZZV`, an NDB `ZZN` and an intersection
  `ZZXIN` near 45 S 150 W, with `DEFAULT_NAVDATA_POSITION`. The position is more than 8000 NM from every test position;
  the widest search in the unit is 500 NM (`NearestList.ts`). The idents sort after every test ident, because the scan
  lists are in ident order and the APT, VOR, NDB and INT pages open on the first entry. They are unique across the
  types, so no DUPLICATE page appears. No user waypoint, no procedure.
- **`BootOptions.defaultNavdata`** (default true), merged in `prepareBoot`, so `bootUnit`, `bootUnitExpectingError` and
  `Flight.start` all get it. `World` does not contain the defaults. `MemoryFacilityClient` itself stays unchanged, because
  its direct users in the unit stage assert exact lists. A test facility with a default ident makes `bootUnit` throw.
- **Harness test** `test/render/harness/defaultNavdata.test.ts`: no `NO … WPTS` on the VOR, NDB, INT and APT 1 pages of
  a world that lacks the type; `NO SUP WPTS` kept; `defaultNavdata: false` shows `NO INT WPTS`; the APT pages open on
  the first test airport, not on `ZZXA`; the clash guard throws. Each case is proven against the fixture switched off or
  an ident that sorts first.
- **The one changed test:** the INT row of the `cursorTo` step-over `it.each` in `test/render/harness/enterIdent.test.ts`
  needs an empty INT page; it is dropped, because the SUP row holds the same harness behavior in a realistic state.
- **Re-proof:** the regression tests that ran in worlds lacking a type are re-proven by their original break with the
  fixture on: MainPage SCAN (`8e9a7c4`), SuperNav (`b7fd10a`, `44fb0a4`), Apt2 #35, Apt3 #38, Apt3User, VorPage
  `d3228dd` (#65 was re-proven by the research).
- **Docs:** `testing.md` section 3 (Navdata: the defaults, their idents and position, the opt-out, `ZZ` as a reserved
  prefix) and section 4 (the `cursorTo` bullet: the field-less cursor position exists only on an empty SUP page; the
  `Flight.start` options), the `FrontPanel.cursorTo` doc comment and the `World` ident rule.
- **Model:** Sonnet implementer, Sonnet reviewer.

## Tasks 2 to 7: the contract

Parallel, one implementer each in its own worktree, branched from the merged task 1 (rule 21).

### Task 2: H events

Files: `test/unit/HEvents.test.ts`, `test/unit/KLN90B.test.ts`, `test/render/HEvents.test.ts`. Contract source:
`HEvents.ts`, CLAUDE.md "Public contract with aircraft", the wiki page External Hardware.

- **Name pin** (unit): `toMatchObject` of `HEvents.ts` against the public names as literals (the `Internal_*` events are
  not part of it).
- **Adapter** (unit, `KLN90B.tsx`): `onInteractionEvent` forwards to the core, `Init` passes `xmlConfig` to
  `core.init`, `templateID` is `KLN90B`, `onSoundEnd` forwards. Static import of `kln90b/KLN90B` (a dynamic import takes
  about 2.7 s and timed out under load).
- **Sweep** (render), named a sweep (rule 17): every public event, sent as a literal to a fresh unit, in four states
  (main page, welcome page, self-test page, dark unit), publishes no error, logs no `console.error` and leaves no
  rejection. A fresh unit per event, because the power events end a sequential sweep.
- **Spec tests**, all sending literals: the left knobs (3-12, the manual's own CAL 1 to CAL 5 example and the wrap), the
  right knobs (3-13, a sequence of single steps and a wrap on D/T that survives the reversal mutations, not a two-page
  group), the cursor toggles (3-11, and the cursor ignored on a page without fields), MSG (3-16, back to the pages in
  view), ALT (3-55, 3-56), DCT in OBS mode alternating DIRECT TO and ACTIVATE (5-37), ENT recentering a direct-to and CLR
  cancelling it (3-29, 4-7), SCAN pushed and pulled with the RightScan LVar (3-13, 3-21), Power_Toggle (contract), and
  ApprArm: `NO APPROACH` without an approach (C-1), arm and disarm beyond 30 NM (6-1).
- **Pin:** pressing ApprArm within 30 NM disarms the approach, and the next calculation tick re-arms it (6-1, B-1;
  `ModeController.ts` `armApproachPressed` and `checkSwitchEnrToArmMode`). The arm-beyond-30-NM test is its passing
  sibling.
- Power_On, Power_Off, Brt_Inc and Brt_Dec are held by `PowerButton.test.ts` and `BrightnessManager.test.ts` already.
- **Reviewer:** Opus.

### Task 3: LVars

Files: `test/render/SimVarSync.test.ts` (new), `test/render/PowerButton.test.ts`,
`test/render/pages/left/SelfTestLeftPage.test.ts` (new `describe` blocks), `test/render/controls/StatusLine.test.ts`
(new), `test/render/services/RollSteeringController.test.ts` (new), `test/render/SensorsOut.test.ts` (a new power-off
block only). Contract source: `LVars.ts`, the wiki pages; manual pages where given.

- **Read-only outputs:** `L:KLN90B_Power` reports the switch, not the powered state (no electricity, the screen blank,
  the LVar 1); `L:KLN90B_RightScan` through the H event; `L:KLN90B_HSI_TF_FLAGS` TO then FROM past the last waypoint
  (3-31); the self-test LVars, one `it` each: MSG, WPT and annunciator test on, HSI flag FROM, the roll pattern 0 to 5
  degrees right and back (3-4, installation manual 2-69, 2-70), and all off after the approval; the MSG light flashing
  while a message is unread and dark once all are read (3-16, 3-59); the WPT light steady during the alert; the roll
  command 0 without a plan, 0 on the ground, positive for a leg to the left and negative to the right (Autopilot wiki),
  and the 30 degree cap (Autopilot wiki). A magnitude of 25 degrees, if asserted, is a characterization in its own `it`.
- **Writable overrides** (`SimVarSync.test.ts`): Disabled freezes the outputs and resumes at exactly one write per
  second, on the same page and active waypoint (Hot Swapping wiki); ObsSource 1 to 2 switches the OBS read; the
  ElectricitySimVar from panel.xml powers the unit on and off, and ElectricitySimVarIndex switches the circuit at runtime;
  ObsTarget 0 to 1 starts the `K:VOR1_SET` events and back to 0 stops them; WriteGpsSimvars 1 to 0 stops the writes and
  releases `GPS OVERRIDDEN`, and back to 1 resumes them. Do not use `GPS WP CROSS TRK` as the "stopped" probe (#126).
  Brightness is held by `BrightnessManager.test.ts`. Assert the screen, not the opacity, for power (#114).
- **Pins:** the outputs at power-off, one pin each for the roll command, the HSI flag, and the MSG, WPT and annunciator
  lights switched off on the self-test page (with a sibling asserting they are on before); an ElectricitySimVar with a
  prefix and no index (`L:MY_BUS`) never powers the unit (`KLN90BPlaneSettings.ts:97`, `SimVarSync.ts:31-35`); toggling
  WriteGpsSimvars while disabled sets `GPS OVERRIDDEN` to 1; H events change the page while disabled; the roll command
  is not 0 without a heading input (`Input.HeadingInput` false).
- **Reviewer:** Opus.

### Task 4: panel.xml keys

Files: `test/unit/settings/KLN90BPlaneSettings.test.ts`, `test/render/pages/left/Set9Page.test.ts` (new). Contract source:
`cfg/panel.xml`, the wiki page panel.xml customization, CLAUDE.md.

- The sample file read from disk lands in the right fields with the right types (DEFAULTS with the sample's two
  non-default values).
- Defaults: an empty document, a document whose only instrument is another one, a KLN90B instrument without keys, and
  another instrument before the KLN90B one. `altitudeAlertEnabled` is left out of these passing comparisons, so that no
  passing test asserts the code's default of true.
- Each key alone (table-driven, `TakeHomeMode` excluded): a document with only that key at a non-default value gives
  DEFAULTS with exactly that field changed.
- The LVar writes of the parser (ObsSource, ObsTarget, WriteGpsSimvars, ElectricitySimVarIndex as a number, no index
  write without a colon). `beforeEach` resets `simEnv().sim`, because a unit test has no teardown between parses.
- SET 9 shows the FEATURE DISABLED text with `AltitudeAlertEnabled` false, and the volume with it true (wiki).
- **Pin:** the default of `AltitudeAlertEnabled` is false.
- **Reviewer:** Sonnet.

### Task 5: GPS SimVars and the `"kln90b"` planner

Files: `test/render/SensorsOutSimVars.test.ts`, `test/render/SensorsOut.test.ts` (the gate block only),
`test/render/services/WTFlightplanSync.test.ts` (new), one added `it` at the end of `test/render/services/ModeController.test.ts`
and of `test/render/pages/left/SelfTestLeftPage.test.ts`. Contract source: CLAUDE.md, the wiki pages panel.xml
customization (the WriteGPSSimVars list), External Annunciators, Accessing the Flight Plan; the MSFS GPS SimVar units;
3-3 for the 5 NM enroute scale; 6-1 for ARM.

- **Render, not flight:** a held position 1 NM right of the standard route's first leg (`moveAircraft` with a track 10
  degrees right of the leg), expected values from `flight/geo.ts`. One `it` per group: position, speed and track;
  waypoint distance and bearings; desired track, OBS value, cross track (the sign follows the SDK `GpsSynchronizer`
  convention), CDI scaling; ETE and ETA for the waypoint and the destination; the flight plan count, index, previous
  and next waypoint; the mode, approach and vertical outputs. `GPS WP TRACK ANGLE ERROR`'s sign has no contract source:
  that assertion is a characterization in its own `it`.
- After a sequence, the index and the previous and next waypoints move on. `GPS APPROACH MODE` 1 in ARM and 2 in APR
  (with `GPS IS APPROACH ACTIVE`), 3 during the self-test. The `K:GPS_OBS_ON`/`OFF` key events in OBS and LEG mode, and
  none with `LegObsSwitchInstalled`.
- With `WriteGPSSimVars` off, no other `GPS …` variable and no `K:GPS…` event is written (a passing sibling that excludes
  the two of #126).
- **Planner:** mirrors FPL 0 (idents, coordinates, active leg); follows an FPL edit; a direct-to off the plan goes to
  plan 1; the missed approach is not sent before the MAP and is after it; with an arc ahead only the legs up to its entry
  are sent; on an arc the entry is dropped and the active index follows the sequence. Planner access as in
  `reboot.test.ts`.
- **Pins:** #126, one pin each for `GPS WP CROSS TRK` and `GPS COURSE TO STEER`; the planner written while
  `WriteGPSSimVars` is off, after the boot and after a sequence.
- **Merge order:** after task 3, because both add to `SensorsOut.test.ts` and `SelfTestLeftPage.test.ts`. Task 5's
  additions are separate `describe` or `it` blocks at the end of those files.
- **Reviewer:** Opus.

### Task 6: waypoint and flight-plan formats

Files: `test/unit/settings/UserFlightplanLoaderV2.test.ts` (new), `UserFlightplanPersistor.test.ts` (new),
`UserFlightplanLoaderV1.test.ts`, `UserWaypointV2.test.ts`, `UserWaypointV1.test.ts`, `UserWaypointPersistor.test.ts`,
`test/render/KLN90BCore.userDataConversion.test.ts`. Contract source: CLAUDE.md (persisted user data) and
`docs/architecture.md` Core 7. Expected strings are literals laid out by hand from the format, never produced by the
persistor.

- **Flight plans (V2):** every leg kind in FPL 0 and FPL 25 loads; only USER legs are stored; an empty plan stores `''`;
  a round trip; a missing facility is dropped with `WAYPOINT … DELETED`; more than 30 stored legs are cut to 30. V1
  `fpl24` lands in FPL 25.
- **Waypoints:** SUP in V1 and V2 (with the facility type and not temporary), grass, a negative VOR magnetic variation,
  a V2 longitude of 100 degrees or more, the trailing slots cleared after a delete (held today only by the #103 pin), the
  250th slot, the V1 NDB type, the V1 unknown runway.
- **Conversion (#47):** every waypoint kind and FPL 24 to FPL 25 converted; `activeWaypoint` read and written as V1.
- **Pin:** a failed V2 restore leaves the corrupt data in storage (one corrupt `wpt` slot and one valid `fpl`; after
  the boot all slots should be empty), with a passing sibling asserting `USER DATA LOST` on that boot.
- **Reviewer:** Sonnet.

### Task 7: remarks and the setting keys

Files: `test/unit/settings/RemarksManager.test.ts` (new), `test/render/pages/right/Apt5Page.test.ts` (new),
`test/unit/settings/KLN90BUserSettingsSaverManager.test.ts` (new), `test/render/pages/left/Set5Page.test.ts` (new).

- **Remarks:** the save and load literals (ident of 4, three lines of 11), an unknown airport gives three blank lines,
  APT 5 entry and display and the OTH 4 list (3-47).
- **Every stored key:** one exact pin of every key and default that `KLN90BSettingSaveManager.save` writes, with the
  `wpt`, `fpl` and `rmk` slots built from loops over the documented ranges (an exact pin is deliberate). Autosave never
  stores a default, so this runs in the unit stage after clearing `FakeStorage`.
- **Pins:** #92 (a deleted remark returns after a reload; an 11th airport throws), the remarks of an airport with a
  3-character ident are corrupted after a reload, #89 (SET 5 stores the HT ABOVE APT offset under
  `airspaceAlertBuffer`; a sibling asserts the knob sequence lands on the value).
- **Reviewer:** Sonnet.

Each implementer gets the brief of Session 3b: read `CLAUDE.md`, `docs/testing.md`, section 2 of
`docs/test-coverage.md`, this design and the plan's section for the task; reset the worktree to the session branch;
prove every test by breaking its subject and every pin by fixing the bug temporarily, and restore; one commit per task
plus one per fix round, never amending, with a `Proof: fails when …` line per test and a `Co-Authored-By` line naming
the model; placeholders `#NEW-<task>-<n>` for new bugs; no edits to `docs/test-coverage.md`, no issues filed, no
behavior change in `kln90b/` (rule 12 seams only, named in the commit); run the full `npm test` before committing;
write the report with a Bash heredoc. The break lists of the research and the plan stay out of the test comments.

**Models:** Sonnet implementers, re-dispatched on Opus if one stalls (rule 26). Reviewers as stated per task;
re-reviews after a fix round on Sonnet.

## Reviews and merging (rules 24 and 25)

- One reviewer per task in the task's worktree: spec compliance, then code quality, then its own mutation pass, never
  announced to the implementer. Every page citation is checked against the Pilot's Guide index, every contract test
  against the source it names.
- Findings go back to the same implementer; a scoped re-review follows each fix round.
- Merge order: task 1 first and alone, then 4, 6, 7, 2, 3, 5. `npm test` and `npx tsc --noEmit` after each merge.
- Junctions: before `git worktree remove`, the worktree's `node_modules` junction is removed with `rmdir`.

## Task 8: issues and close-out (rules 23 and 27)

1. **File** (search open and closed issues first; `bug` label unless stated):
    - the `L:KLN90B_*` outputs keep their last value at power-off;
    - an ElectricitySimVar with a prefix and no index never powers the unit;
    - toggling WriteGpsSimvars while disabled sets `GPS OVERRIDDEN`;
    - H events are processed while the unit is disabled;
    - ApprArm cannot disarm within 30 NM;
    - the remarks of a 3-character airport ident are corrupted after a reload;
    - the `AltitudeAlertEnabled` default;
    - the `"kln90b"` planner is written while `WriteGPSSimVars` is off;
    - roll steering is output without a heading input;
    - a failed V2 restore keeps the corrupt data, so `USER DATA LOST` shows on every boot (mention the alternative of
      restoring the valid records);
    - invalid panel.xml values (`enhancement`);
    - the 4-character placeholder ident in the 5-cell INT and SUP selectors, after checking the manual and the issues:
      file as a bug if the empty SUP page differs from the manual, otherwise record it in the log.
2. **Comment** on #100 (the new heading-input issue, and the wrong-way bank 5 NM left of the leg on a parallel track),
   #101 (data converted at the first boot stays wrong after the fix) and #133 (ApprArm works without
   `AppArmSwitchInstalled`).
3. Replace every `#NEW-` placeholder in one commit; `grep -r "#NEW-" test/` finds nothing.
4. Correct the comments: `LVars.ts` (the HSI flag values; Power_On and Power_Off set `L:KLN90B_Power`), and the test
   comments in `Sensors.test.ts` and `hsiToFromFlags.test.ts`.
5. `testing.md`: what the session found (the `sim.writes` names are upper case; key events have no effect in `FakeSim`;
   unit tests of the parser reset `FakeSim` themselves).
6. Tick Session 4's checkbox and write the session log: done, rulings, bugs filed, fixes that could not be re-broken,
   what is not covered (rule 18; below), the wiki corrections for the maintainer, coverage at the start and the end.
7. Run `npm test`, `npx tsc --noEmit` and `npm run coverage`.

Then the final review of the whole session runs on the controlling session's model, and the maintainer is asked to
approve the merge into `master` and the deletion of the task branches and worktrees.

**Not covered, known now** (the log adds what the tasks find): ApprArm in APR and in the OBS modes; the MSG light
steady while a persistent message is present; the doubled tick rate after a hot swap is held only jointly by two
guards; temporary (`XY`) waypoints round-tripped through storage; the 10-message cap of the flight-plan loader;
`GPS COURSE TO STEER`'s value; the XTK filter dynamics; the BasePath effect (it needs a `FakeXhr` mount); the effects of
the panel.xml keys owned by other sessions.

**Wiki corrections for the maintainer** (the log lists them): the `AltitudeAlertEnabled` default once the bug is fixed;
`GPS OBS ACTIVE` is set through `K:GPS_OBS_ON`/`OFF` and only without `LegObsSwitchInstalled`; ObsTarget writes only
while `GPS DRIVES NAV1`; the MSG light LVar flashes by itself; the HSI flag values; the sample code of Accessing the
Flight Plan (`flightplanner.getFlightPlan`, `activePlanIndex`, the from leg of plan 1 has no ident); the ElectricitySimVar
index syntax.

## Risks

- **No-op mutations on the knobs:** a cycle of two pages, or a step of two in a cycle of four, hides a reversed knob.
  The plan's sequences are single steps plus a wrap.
- **Status-line timing** is gone with task 1's fixture; a test that opts out must wait for the message to expire.
- **`altitudeAlertEnabled` in `toEqual`:** a passing test that compares the whole parsed object would freeze the bug.
  The defaults tests leave that field out; only the pin asserts it.
- **The #103 pin flips** under the slot-clearing break, which would read as "#103 fixed": task 6's slot test holds the
  clearing directly.
- **Shared files:** tasks 3 and 5 both add to `SensorsOut.test.ts` and `SelfTestLeftPage.test.ts`, in separate blocks;
  task 5 merges last.
- **Unit-stage `FakeSim` and `FakeStorage`** are not reset between tests of a file: the parser and key tests reset them
  in `beforeEach`.
