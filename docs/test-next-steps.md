# Test next steps

The open work on the test suite: harness gaps, leads that were seen and not confirmed or not filed, and what to do
when a pinned bug is fixed. Section numbers refer to the [testing guide](../test/README.md).

Gathered from the baseline sessions (2026-10-03 to 2026-10-10) and grouped by area. A harness gap is built only when
several tests need it (section 5); a gap that serves one test is listed here instead.

## Harness

- **Copies of helpers that stayed, and why** (when a helper was built, the tests that carried a copy moved onto it; a
  copy stays where the helper would change what the test asserts or needs a world it does not build):
    - `readMessages` opens the page and asserts that it closed, so `MainPage.test.ts` keeps `closeMsgPage` (it closes
      the MSG page with a Direct To page pushed over it, presses at most three times and never throws). Bare
      `MessageHandler` readers stay where no unit exists: `messagesOf` in `Flightplanloader.test.ts` (it joins with a
      bar, where `messages(unit)` joins with a blank), the arrays of `UserFlightplanLoaderV2.test.ts` and `posted()` in
      `Database.test.ts`. The two `m.message[0]` reads of `MessagePage.test.ts` stay: one asserts with `not.toContain`
      and the other sits inside a pin, so a move could not be proven.
    - `showSuperNav5` has no hook between its selects, so the status line test of `MainPage.test.ts` keeps its own
      sequence. `selectPage` cannot be used with an overlay shown, so `SuperNav.test.ts` reaches Super NAV 1 and 5 with
      the knobs. `MainPage.test.ts` has local `superNav1` and `names` (copies from `SuperNav1Page.test.ts`) and a
      `bootNearKbbb` copied from `MessagePage.test.ts`; a Super NAV 1 helper would replace them. `Screen.read()`
      throws on Super NAV 5, so the 3-36 test reads the status line's DOM element.
    - `activeIdent` returns undefined, where the null checks of `MainPage.test.ts`, `DirectToPage.test.ts`,
      `WaypointEditor.test.ts` and `ActiveWaypoint.test.ts` assert `null`.
    - `directTo` types an ident and confirms. The sequences with a prefilled ident or that stop at the confirmation
      page stay: `DirectToObs.test.ts`, `DuplicateWaypointPage.test.ts`, `FplPage.test.ts`, `VorUserWaypoint.test.ts`,
      `WaypointConfirmPage.test.ts`, `ActiveWaypoint.test.ts`, `DuplicateWaypoints.test.ts`,
      `ModeControllerObs.test.ts`, `TemporaryWaypointDeleter.test.ts` and the second Direct To of
      `WaypointEditor.test.ts`.
    - `confirmSet1AndReselect` reselects the page, so the inline CONFIRM? and ENT sites stay where the test asserts the
      status line between the two presses (`Set1Page.test.ts`) or reads the GPS position directly
      (`LatLonEditor.test.ts`). `mountedText` ticks once, so the display tests that change a value after the render and
      read before and after the tick keep `mount()`.
    - `Set0Page.test.ts` keeps its `rows()` (it trims the end only, and the assertions hold the leading blanks) and its
      reader of the status row's mask; `SuperNav1Page.test.ts` keeps `untrimmedRows`.
    - `userWaypoints` is unfiltered in the tests whose user waypoints are intersections, and `KeyboardService.test.ts`
      filters on region XX, a third meaning.
    - The reads of idents with their types stay as pairs or triples (`fpl0Legs` of `ActPage.test.ts`,
      `Apt7Page.test.ts` and `Apt8Page.test.ts`, the pair reads of `SidStar.test.ts`, the triples of the V1 and V2
      flight plan loader tests, the filtered reader of `procedures.test.ts`, the `legs` read for the fix type in
      `approachWorld.test.ts`, and `VolatileMemory.test.ts`'s `procedureLegs`), as does the SDK `identsOf(plan)` of
      `WTFlightplanSync.test.ts`.
    - `AirspaceAlert.test.ts` presses MSG twice with a wait between them and lays out its box edges with flat-earth
      offsets that are not `moveAircraft` targets; `SensorsOutSimVars.test.ts` filters `sim.writes` on a literal that is
      already upper case; the keyed storage read of `KLN90BCore.userDataConversion.test.ts`;
      `test/unit/harness/navdata.test.ts` has its own `abc`, `abd` and `kaaa`; `ObsDtkElement.test.ts` keeps the parser
      default through `MINIMAL_PANEL_XML`; `Apt3Page.test.ts` keeps its surface and lighting `it.each` beside the unit
      table.
    - The cold boot to the self-test page is `bootToSelfTest` (section 4); the older copies in `HEvents.test.ts`,
      `NavCalculator.test.ts`, `Button.test.ts` and `enterIdent.test.ts` stay as written. Boots whose timing or state
      is the subject stay too: `GpsAcquisition.test.ts` (it measures from the power-on), the cold-GPS tests of the D/T
      page files, `WelcomePage.test.ts`, and `hsiToFromFlags.test.ts` and `turnDirection.test.ts`, which start through
      `Flight.start`.
    - The `"kln90b"` planner is read through `FlightPlanner.getPlanner('kln90b', …)` in `WTFlightplanSync.test.ts`,
      `ActiveWaypoint.test.ts` and `reboot.test.ts`.
    - The power-off helper `offFor()` is local to `BrightnessManager.test.ts`.
    - `expectFlashing` (a prompt that flashes on the same tick of each of two blink cycles) is written out in
      `StatusLine.test.ts` and `MessagePage.test.ts` (`expectPromptFlashing`) and inline in `SuperNav5Left.test.ts`.
      `SuperNav5.read()` has no mask, so the Super NAV 5 prompt tests read `.super-nav5-mgs-range` with `readRows`, and
      `SuperNav5Page.test.ts` keeps its focused-field helpers (`focusedIn`, `focusedLeft`, `focusedRight`), which also
      read the right menu.
- **Shared worlds.** `standardRoute()`, `approachWorld()`, `legWorld()`, `arcWorld()`, `dtWorld()` and `centerWorld()`
  exist (section 3). The copies written before them stay, and some differ in detail, so check one before replacing it:
  the approach worlds with IAF = FAF in `ModeController.test.ts` and `HEvents.test.ts` (#129); the missed approach
  world (IAFAA at 47.3 N 7.7 E with a MAHAA hold) in `FplPage.test.ts` (`rnavWorld`), `Apt7Page.test.ts` and
  `Apt8Page.test.ts`; the MAP world with a missed approach leg in `NavCalculator.test.ts`, `SuperNav5Page.test.ts` and
  `DirectToPage.test.ts`, and the IAF = FAF and MAHP = FAF approaches of `ModeControllerObs.test.ts` (#153); the VOR 36
  world of KDST in `ActiveWaypoint.test.ts` and `WTFlightplanSync.test.ts`; the KDDD world in `Nav1Page.test.ts`,
  `Nav3Page.test.ts`, `Nav4Page.test.ts`, `Nav4Vnav.test.ts` and `SuperNav1Page.test.ts`; and the DME arc world in
  `SuperNav5DirectToSelector.test.ts`, `SensorsOutSimVars.test.ts`, `WTFlightplanSync.test.ts`, `dmeArc.test.ts` and
  others. A missed approach option of `approachWorld()` would replace the approach copies. Own worlds that are not the
  standard route stay by design: `DirectToPage.test.ts` (other coordinates, the frequency in a snapshot),
  `DirectToObs.test.ts`'s `planInObs` (a VOR with a published variation), `FplPage.test.ts`'s `bootRoute` and
  `route7()`, the BRAVO world of `HEvents.test.ts`, the `[kaaa, abc]` worlds of `SensorsOut.test.ts`,
  `SensorsOutSimVars.test.ts`'s `bootOnRoute` (no settle), `Tri5Page.test.ts`'s `meridianRoute()`, the intersection
  worlds of `SuperNav5Page.test.ts`, the obsMode boot of `power.test.ts` and the garbage `wpt0` of
  `FlightplanEdit.test.ts`.
- **A boot that leaves an `ElectricitySimVar` unit dark from the start.** The `simVars` boot option sets SimVars before
  `init` (section 4), but the circuit tests of `SimVarSync.test.ts` and `PowerButton.test.ts` still boot powered, lose
  power at the first `SimVarSync` tick and wait 3 s for the unit to go dark, beyond the ride-through a fix of #332 may
  add.
- **Sampling an LVar.** Tests sample an LVar over display ticks with a hand-written loop (`SimVarSync.test.ts`,
  `StatusLine.test.ts`, `SelfTestLeftPage.test.ts`). A sampling helper would remove the pitfall; the counting half is
  `sim.writeCount(name)` (section 3).
- **A blink phase probe.** The #320 test finds the blink phase through `L:KLN90B_MsgLight`, which is dark on those ticks
  only while a message is unread; a `blinkPhase()` on the unit would not need a message.
- **A `beforeInit(core)` boot option.** The test of H events before `init()` spies on `KLN90BCore.prototype.init`.
- **The `Version` mock.** STA 3 shows the placeholder of `kln90b/Version.ts`, which `Screen` refuses, so the tests that
  show or pass STA 3 mock the module: `selectPage.test.ts`, `Sta3Page.test.ts` and `Sta4Page.test.ts`. The harness
  could set the placeholder up.
- **`airport()` options** for frequencies, runway lighting, the private type and radar coverage. The APT 1, APT 3 and
  APT 4 tests spread the facility or patch `runways[i].lighting`.
- **`savedUserWaypoints` writes region `XX` only.** The temporary-waypoint tests lay out the `XY` strings by hand
  (`savedTemporary` in `TemporaryWaypointDeleter.test.ts`); an `XY` option would replace them.
- **Options of the fake navdata** (section 6): a cloning option that hands out a copy of the `IcaoValue` per call, which
  would make the reference comparisons observable (`Scanlist`, fixed in `6a6c634`, and the nearest list removal at
  `NearestList.ts:107`, which a break survives); a `getFacility` that checks its type argument; and a search that returns
  matches in insertion order, which would show whether the code orders the autocompletion itself (also unobservable
  with the instant fake: `WaypointEditor.onCharChanged` has no guard against a stale result, and
  `WaypointEditor.convertToValue` looks for the exact ident among the first 99 results only).
- **A recording `FakeCoherent`**: a `trigger` that records its calls and an `emit` for the `on` handlers would hold the
  keyboard focus and the click outside the instrument (section 6).
- **No `Name_Z` fake and no in-game state.** A test that sees `PLAY_INSTRUMENT_SOUND` itself would need both (section
  6).
- **A `FakeXhr` mount.** `FakeXhr` serves `resources/` only at the default path, so a custom `BasePath` fails the boot.
- **Flights cannot test the nav-source gate or a cold start, by decision.** `Aircraft.writeTo` forces
  `GPS DRIVES NAV1` true on every 16 Hz step, and `Flight.start` waits for a fix. Render tests prove both behaviors
  (`92fbba1` in `SensorsOutSimVars.test.ts`, #61 in `Gps.test.ts`); lifting either would need an `Aircraft` option
  or a start that does not wait.
- `Flight.syncDisplay` throws when DIS changed in every display tick; no test covers that throw.
- `restoreMocks: true` in `vitest.config.mts` was considered and declined: tests restore their own spies.
- **`vitest -t` takes a regular expression.** Titles with `(`, `)`, `+`, `?` or `#` (every pin and most citations)
  need escaping in a filtered run, which matters for a mutation pass.
- **The glyphs of the font have no table.** `docs/architecture.md` lists the code points of the special symbols but not
  what each one draws; the tests name them by the code's constants or in comments.

## Navigation and navdata

- **Approach arming** (the ARM and APR scale ramps), the waypoint alert without turn anticipation and the GPS-invalid
  path are held at the render stage, where a held position plus `moveAircraft` observes them; flights would only add the
  motion. **ARM GPS APPROACH** is tested at the unit stage (`PersistentMessages.test.ts`) and in a booted unit
  (`ModeControllerApproach.test.ts`, with the approach disarmed by the pilot's press, #139).
- **The flown-through bound of `dmeArc.test.ts` does not hold the arc reversal.** With `fromDtk` reversed on arc legs
  the monitor's bound north of the leg stays green (0.895 NM against a radius of 1.012 NM); only the circle-center
  assertion fails. A tighter bound, or a monitor on the arc's radius, would hold it twice.
- The XTK expectations of `ModeController.test.ts`, `ModeControllerObs.test.ts` and `DirectToObs.test.ts` come from
  `crossTrackNm` and are exact, while their 0.05 NM tolerances date from an approximation. They could be tightened.
- **Surviving mutations near past fixes:** the 110° limit of `checkSwitchAprArmToActive` is held only between 100° and
  120°; a halved roll-in distance
  (`NavCalculator.ts:190`) survives the lower bound of the DME arc flight; the flag copy of `addArcInfoIfPrevIsSame`
  (`SidStar.ts:455`) has no arc whose fix carries other flags; the two halves of the SET 3 hard-surface filter
  (`NearestList.ts:173` and `:205-213`) and the two polygon guards of the SUA alert (`AirspaceAlert.ts:109`,
  `MessageHandler.ts:87`) cover each other.
- **CTR tests with `centerWorld()`:** its legs are 300 NM, so each Center is met by a search from inside it. The #102
  test in `Ctr1Page.test.ts` computes twice in one unit on purpose, and the tests of the 30 waypoint limit there use
  one computation.
- CTR leads: a recomputation without insertion creates a new user waypoint with the next number (BGD00, then BGD01),
  and the orphans count against the limit until power-off (a computation discarded by #348 leaves its new waypoints the same way); a crossing without a VOR within 1000 NM, or without a free
  number, is dropped silently; when the first waypoint lies in no Center the first crossing is dropped
  (`AirspacesAlongRoute.cleanup`); `getWaypointIfExistsInFpl` compares coordinates with `===`; CTR 2 and NAV 2 convert the
  radial with the VOR's own variation (#280, #362); the status line shows `msg` for one display tick after CTR 1 is
  selected.

## Pages

- **The ENT order of `FourSegmentPage` is not tested**, by decision. The shell is the full-page frame of the Database
  page and the OBS warning, whose pages have no cursor fields, so most of its knob switch cannot be reached. Take-home
  mode and `TakehomePage` are out of scope (`Gps.ts:154-165`, an undocumented panel.xml key): a probe found that a
  cold-and-dark unit in take-home never gets a fix and that the position dead-reckons a straight line on the SET 1 track
  instead of following the plan (5-46, 3-19); no issue was filed.
- **The `FiveSegmentPage` tests are characterizations**: no trainer check is recorded for the SCAN rule its code comment
  names. The comment on the left branch of `handleEnter` (`FiveSegmentPage.tsx:222`) says the right half has priority
  when it waits for confirmation, while the code serves the left half first; the test holds the code's order.
- **The `fields` array of the `CursorController` constructor is dead** (`CursorController.ts:62-63`, behind
  `@ts-ignore`): the field list is recomputed on every call. It looks like a cache, so do not rely on it.
- **A blank Direct page:** ENT on the 89's Direct page with a blank field returns to the page before
  ([the trainer record](kln89-trainer-record.md), 2026-10-09, T1), while the 90B code stays on the DIR page. The 90B
  guide was not checked for the case, and the #335 tests do not assert it.
- **Left page leads** (seen and not confirmed or not filed):
    - FPL 0 shows an empty top row when the active waypoint is the first one; the guide's figures do not show the case
      (a trainer question). `DirectToPage.test.ts` reads rows 1 to 5 around it.
    - An XTK of exactly 0 shows `-.-` on NAV 3 (`Nav3Page.tsx:55,95` treat 0 as no value); unreachable in practice.
    - CAL 2's `setTemp` writes the CAL 1 temperature too; 5-11 does not say whether the pages share it.
    - The ` 0` in the top row of an empty SUP page is also the trainer's behavior and is a spec test.
- **Right page leads** (seen and not confirmed or not filed):
    - On the page of a user airport, typing the ident of a database airport on the first character switches APT 3 to the
      diagram page of the airport that character matches, and that page has no cursor controller, so the entry cannot go
      on. Whether the real unit keeps the cursor there is not known.
    - INT and SUP show dashes for REF, RAD and DIS for the first seconds of every visit (`REF_CALCULATION_TIME`, a
      deliberate debounce); the trainer shows them with the ident at once.
    - The trainer shows a radial of 0 as `360.0`; the code shows `000.0`, which figure 5-94's zero padding supports for
      the 90B (a characterization holds it).
    - `Apt3ListPage.buildRunwayList` sorts the facility's shared `runways` array in place (`Apt3ListPage.tsx:126`); no
      visible effect found.
    - With no waypoint of a type at all (`defaultNavdata: false`) the VOR, NDB and INT pages show the ident `0`.
    - Editing the latitude or longitude of a stored user intersection leaves REF, RAD and DIS describing the old
      position until the page is left. After a USER POS? entry the SUP page shows the typed longitude, not the stored
      one (seen only through a mutation).
    - The right outer knob during a waypoint confirmation leaves the left editor waiting for a page that is gone.
    - NAV 2 with the aircraft exactly on its VOR shows the ident and `°fr` without a radial and logs an invalid heading.
    - `VolatileMemory` starts the SUP ident as a `0` and four blanks, while `setFirstSupplementary` writes a `0` and
      three; harmless.
    - APT pages: `Apt4Page.render` does not set `requiresRedraw`; `Apt1Page` builds a dead `type` child; APT 4 shows its
      constructor text for one display tick at power-on; APT 2 truncates half-hour time zones; the `aptPage` memory
      writes of `PageManager.startMainPage` are redundant.
    - APT 7 decides on raw transition counts while it lists the recognized ones; an IAF number of ten or more has no
      blank before the name (`Apt8Page.tsx:514`); the IAF list is not filtered by recognition; the cursor on APPROVE? of
      the add question is only characterized.
    - D/T 1 and D/T 2 beside another page hide the last-waypoint block when the active waypoint is the last one (4-12 is
      silent). After LOAD IN FPL on ACT 8 the ACT page switches to the new active waypoint (the guide is silent).
    - The code comment at `Apt8Page.tsx:373` quotes a sentence of 6-4 nearly word for word; it should be paraphrased.

## Controls

- **The 4-3 cursor tests** (where the cursor comes on over a numbered plan, #355) sit in `WaypointEditor.test.ts`,
  though their subject is `CursorController`; they could move to `FplPage.test.ts` or a `CursorController` test file.
- **Leads** (seen and not confirmed or not filed):
    - Editors: `FreetextEditor.convertFromValue` drops a cell for a stored character outside its charset;
      `MagvarEditor` enters 0°W as -0 and cuts a variation of 100° or more to two digits (polar VORs only);
      `ElevationEditor` has no sign, so a user airport below sea level cannot get its elevation; `VorFreqEditor` takes
      any 10 kHz step (113.13), while VOR channels are 50 kHz apart (the guide gives no rule); a user elevation is saved
      in whole meters, so a change of 1 ft is not observable.
    - Selectors and fieldsets: `VorSelector` leaves out TACAN-only stations (2-1 and 2-2 name VORs only); the OBS taken
      from the DTK keeps its fraction (089.46) while the field shows 089, and the CDI follows the fraction (5-35 is
      silent); the inches cell of `BaroFieldset` caps at 30.99 while millibars reach 1099; `OthFuelFieldset` shows a
      rounded value and rebuilds from one with a fraction; `SuperNav5RangeSelector` builds its index with `indexOf`, -1 for a stored
      scale outside its list;
      `AltitudeFieldset` shows `00000` below sea level, while a low-confidence photo of the self-test page shows a
      negative altitude; `ModObsElement.innerRight` (MOD 2) and `FuelOnBoardSelect.innerRight` return `false` while
      `innerLeft` returns `true` (no visible effect; the Super NAV 5 case, #238, is fixed in `ObsDtkElement`).
    - Lists: figures 4-4 and 4-5 read `LOAD INVRT?` in the PDF's text layer while the first waypoint of an empty plan is
      entered, where the code shows LOAD FPL 0? (worth a look at the printed page); the procedure header hides the arrow
      column while focused, and whether its text starts in column 0 or 1 was not checked; `SimpleListItem.tick` toggles
      `inverted-blink` twice for an entered item (redundant).
    - Status line, MSG page and views: `MessagePage.enter` with an empty nearest list keeps the MSG page, while the
      comment at `MessagePage.tsx:53` reads as if the unit removes it; `AirportCoordOrNearestView.loadAirspace` resolves
      late and writes against the airport shown then, so a quick scan could show the previous airport's class;
      `ErrorPage.showError` writes the error text with `innerHTML`, unescaped.
    - Displays: the `targetLetterIndex == 9` branches of both deviation bars are dead; `formatDuration` is exported but
      used only in its file; a negative OTH fuel clamps to 0; single-digit temperatures keep a zero (the trainer could
      not answer); the Super NAV 1 FLAG row draws 22 cells instead of 23.
    - The trainer brings the cursor back on the first field after it is turned off and on, and on the top visible entry
      of a scrolled list ([the trainer record](kln89-trainer-record.md), 2026-10-08, T7 and T23; 2026-10-11). The code
      does the same (#355): a page's start field holds every time the cursor comes on, and the list pages start on the
      top visible entry while scrolled, which also explains why 4-3 sends a pilot back to USE? after building a long
      plan.
- **Gaps left by the flight plan entry fixes** (code held by reading, not by a test; paraphrased from the milestone 4
  review):
    - #291: the run-once clearing of a pending CONFIRM entry (`enterMe`) is not held. It shows only when `createLeg` runs
      while a REF row waits. The keyboard re-entry of a waiting REF row is untested too; the knob path is.
    - #294: no ACT test for INT, NDB, SUP or an APT 2 to n page; the wiring of the arrow is mechanical, so a test there
      would repeat the VOR and APT 1 ones.
    - #262, creation page:
        - A creation page that left the right stack (right cursor off, outer knob) makes the left CLR take the #310
          blank-waits-for-ENT path. Untested.
        - CLR on a duplicate-waypoint list above the creation page cancels the whole creation. Untested.
        - A second CLR on D-> after a canceled creation goes through the existing D-> CLR path, while the KLN 89 left
          the D-> page there ([the trainer record](kln89-trainer-record.md), 2026-10-15): a lead for a trainer check.
    - #343: a character in a later cell of an all-blank ident gives an ident that starts with a blank, and a waypoint
      page can create a user waypoint of it; the V2 loader trims it on reload. The knob no longer dials a blank into the
      first cell (#374), but an empty ident still starts with one. A lead for a trainer check before an issue is filed.
    - #311: the first click on a Turn-On line (5-28) still gives a blank, while the remark lines of APT 5 give an A
      (`FreetextEditor`'s `firstClickGivesA`). Neither the guide nor the KLN 89 trainer record says what the first click
      on a Turn-On line gives. A lead for a check.
    - #311: the remark line's first click is recorded clockwise only (an A). The unit gives the A counterclockwise too;
      the 89 might give the blank or the hyphen there, by analogy with the wheel (Z, 0 to 9, hyphen, blank, A). The cells
      after the A show as underscores in the 90B, while the only record of them, the evening block, says blanks. A trainer
      question for the counterclockwise first click and for what the other cells show.

## Boot, power and the unit as a whole

- **Code notes** (latent or possibly intended, so questions rather than bugs; the code is unchanged):
    - `TickController.setupLoops` starts new intervals without clearing the old ones. Only the dedup upstream
      (`PowerButton` publishes a power event on a change only, `SimVarSync` dedups its enable and disable) keeps a second
      power-on event from doubling every loop, the symptom of #24. That early return of `PowerButton.refreshPowerState`
      (`PowerButton.ts:118`) is not run by any test.
    - H events sent before `KLN90BCore.init()` are dropped (`7b4465d`), an early power-on included: `KLN90B_Power_On`
      before `init()` leaves a cold-and-dark unit off. The `hEvent` topic is also dropped until
      `hEventPublisher.startPublish()`. Whether an aircraft's early power-on should be kept is open.
    - An `error` published on the bus before `pageManager.Init` builds the `ErrorPage` still aborts the start-up: the
      bus caches it, `ErrorPage.showError` runs before the page is rendered and throws, `init()` rejects and the unit
      never comes up. No path publishes one today; a `showError` deferred to `onAfterRender` would be safe.
    - The class comment of `TickController` cites page 43 of the maintenance manual (Figure 9), which is the V2
      manual's numbering; in V3 the figure is printed page 55 (Figure 10). Its pages 186 and 189 were not confirmed.
    - `platform.getRouteManager().then(...)` in `KLN90BCore` has no catch; a rejection is an unhandled rejection
      (`bootFailure.test.ts` takes it), not an error-page error.
- **Leads** (seen and not confirmed or not filed):
    - Start-up pages: `docs/architecture.md` (UI 0) says the Turn-On page waits about 15 s, the code 17 s (the tests hold 14 to
      19 s), and the code comment "page 84" is the V2 maintenance manual's numbering of the printed page 1011;
      `VFROnlyPage` renders a `<div>` where the other start-up pages use `<pre>`; figure 3-22 shows the VFR page's status
      line without a mode, the code `enr-leg ent`; `VFROnlyPage.acknowledge` taking the OBS branch always is an
      equivalent mutant, because the OBS warning moves on by itself with the switch in LEG; the coverage text on line
      1 of the Database page and the cursor after ENT on the fourth Turn-On line (5-28 is silent) are not asserted.
    - Self test: `POSITION DIFFERS`
      posts while the self-test page shows with empty storage, and whether a real unit posts it before APPROVE? is not known; the ALT row's padding and the case of `ft`; whether a
      baro change takes effect before ENT; the distance indicator's 0 KTS and 0 MIN of Installation Manual 2-69; a time
      entry in a time zone other than UTC.
    - Power cycle: `Timers` saves the total time every 60 s and not at power-off, so STA 4 loses up to 59 s when the sim
      closes; `PowerButton` counts the first cold power-on as an hour off (intended);
      `SimVarSync` ignores the LEG/OBS switch while disabled (read again at the resume); the Direct To and the active
      waypoint survive a power cycle unchanged, while 3-8 only says the last waypoint's page shows; the
      `memory.<x>Page.ident` writes of `PageManager.startMainPage` are equivalent, because `WaypointPage` uses the ident
      only when the facility cannot be read.
    - Overlays: a last active waypoint of a facility type `PageManager.ts:100` does not handle (a VIS fix of an approach)
      would throw at power-on, if it can be stored at all; the right scan branches read the base right page's cursor
      while an overlay shows; the overlay orders without MSG (ALT over DIR, DIR over ALT, ALT twice) have no source and
      are not frozen; the error page lives outside the overlay stack, so a knob turned while it shows reaches the page
      beneath, and it stays over a power cycle.

## Across the suite

- **Flip the pins when the bugs are fixed:** remove `.fails` from the tests that `grep -rn "it.fails" test/` lists, each
  of which names its issue. A fix that touches other tests: a fix of #332 with a ride-through above about 1.5 s needs
  the 3 s waits of the circuit tests raised.
- **Open questions for the KLN 89 trainer** (the maintainer starts the VM): duplicate idents on a waypoint
  page (2026-10-08, T20, not done), and the empty top row of FPL 0 with the first waypoint active (above). #162 and
  #163 are no open questions: the trainer shows neither ARM nor ACTV, so the maintainer's rulings settle them and the
  tests hold them as characterizations.
  What the 90B shows on an empty MSG page (#325), the prompt while the MSG page shows and an airport below sea level
  cannot be asked on the 89. The Super NAV 5 prompt once all messages are read is
  the question #326.
- **Debug `console.log` calls** left in the code: `Apt3MapPage.tsx:30`, `TemporaryWaypointDeleter.ts:27` and `:32`,
  `WaypointPage.tsx:46` and `WaypointPage.getScrollSpeed`, `SupPage.tsx`, the constructors of the waypoint pages
  (`ActPage.tsx:43`, `Apt1Page.tsx:78`, `Apt6Page.tsx:43`, `IntPage.tsx:71`, `NdbPage.tsx:55`, `VorPage.tsx:58`,
  `WaypointConfirmPage.tsx:41` and others), `Apt7Page.load`, `Apt8Page.load`, `EditorField`, `WaypointSelector`,
  `formatAirportType`, `StatusLine.destroy`, and the constructor, `saveDate` and `saveTime` of `SelfTestRightPage`. A
  cleanup commit, if wanted.
- **Premises that no assertion needs** (dropping them leaves the tests green; a test that needs one must assert
  something that depends on it): `NO_OBS` in `DirectToObs.test.ts`, `Mod2Page.test.ts`, `Nav3Page.test.ts`, the route
  boot of `StatusLine.test.ts` and the Leg-mode test of `ObsDtkElement.test.ts`; `AIRDATA` and `fuelComputer()` in
  three name tests of `PageTreeController.test.ts`; `HEADING_INPUT` in `SelfTestLeftPage.test.ts`, `SensorsOut.test.ts`
  and `RollSteeringController.test.ts`; the `FOBTransmitted` and `IsInterfaced` values of two `Messages.test.ts` tests;
  `WriteGPSSimVars` off in the `KlnEfbLoader.test.ts` import (the import is not gated); the `FacilityType.USR` filter in
  `KlnEfbLoader.test.ts` and `TemporaryWaypointDeleter.test.ts`. Hygiene that no assertion holds: the `storage.reset()`
  and the spy restore of the #103 file, the `sim.reset()` of the first `Hardware.test.ts` test, and `muteConsoleError` in
  the `ErrorPage`, `SupPage` and `bootFailure` tests.
- **Waits that no assertion needs** (a shorter wait leaves the tests green; each has a comment that names what it is
  for): the default of `directTo` and of `show`, the waits after `showSuperNav5` in `superNav5.test.ts` and
  `mapRecorder.test.ts`, the 2000 ms of `Nav5Page.test.ts`, the 250 ms of `SuperNav5Field1Selector.test.ts`, the 31 s
  of `SuperNav5Left.test.ts`'s `armed()` and of `approachWorld.test.ts`, the 30 s boot of
  `test/flight/harness/boot.test.ts`, the 25 s of `Apt1Page.test.ts`'s `dropEntry` and the 2 NM start of
  `jump.test.ts`.
- **Review notes left as they are:** the INT REF read-only mutant survives one test of `IntPage.test.ts`;
  `Sensors.test.ts` does not hold the type-dependent volume of its passing tests (the #93 tests do); `Screen.inverse`
  accepts any non-normal cell; the tick of `mountedText` and the trim of `writeCount` are unheld; `NearestList.test.ts`
  reads the last frame of the map only; `Mod1Page.test.ts` words the 5-38 note as "offers 1 and 0.3 only", an
  inference; the spies of `superNav5.test.ts` and `frontPanelHelpers.test.ts` are restored after the assertion, not in
  `finally`; `KLN90BCore.init.test.ts` cannot see whether the sample panel.xml keys are parsed (a parser that ignores
  `Input.ElectricitySimVar` survives, because the test sets the SimVar itself); `isTurnOnPage` of
  `WelcomePage.test.ts` reads the ORS text of the top row; the wait-cut test of `selfTestBoot.test.ts` passes on any
  throw with the helper's message; the CTR test of `Ctr1Page.test.ts` does not hold the flight plan check of
  `TemporaryWaypointDeleter` (its own test file does); `firstFlight.test.ts` survives a DIS row rounded to whole NM;
  the MOVE? test of Super NAV 5 does not hold `leg.arcData = newData` (`SuperNav5DirectToSelector.tsx:101`); the plan
  number of OTH 3 is seen for plan 0 only.
- **Describes without a label in the title** that predate the label rule: `FplPage` (FPL 1 to FPL 25), `Mod1Page`,
  `Mod2Page`, `DirectToPage`, `AltPage`, `FlightplanList`, `WaypointDeleteListItem`, `DateEditor`, `WaypointEditor`,
  `FuelFieldset`, `ObsDtkElement`, the Super NAV 5 selectors and the four tests of
  `test/render/data/navdata/AirspaceAlert.test.ts:28-45`. Each of their tests cites a page, a commit or a trainer
  check.
- **Costs to keep in mind:** the H event sweep boots a fresh unit for every public event in four states, and
  `test/unit/KLN90B.test.ts` imports the whole instrument statically, which is slow at collection (a dynamic import
  timed out under load).
