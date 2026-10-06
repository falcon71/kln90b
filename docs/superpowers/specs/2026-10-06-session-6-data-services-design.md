# Session 6 design: data and pure services

Session 6 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-6-data-services`.

## Scope

- **In:** the six items of Session 6:
    - formats and conversions (`Conversions`, `Units`, `Time`, `Text` with the null-to-dashes rule of the displays,
      `Sun`, `Wind`, `CountryMap`, `FirMap`);
    - identifiers (`IcaoBuilder`, `IcaoFixedLength`, `UniqueIdentGenerator`);
    - messages (`MessageHandler`, `PersistentMessages`, the Appendix B messages the harness can trigger);
    - the services (`Timers`, `TimezoneService`, `Vnav`, `MSA`, `AltAlert`, `HtAboveAirportAlert`,
      `TemporaryWaypointDeleter`, `KlnEfbLoader`, `KlnEfbSaver`, `AudioGenerator`);
    - `VolatileMemory`;
    - the cross-track helper `crossTrackNm` and the refactor of its hand-written copies.

  Also the pins for the bugs the research found in these modules and in their direct callers. Where the cheapest
  observation of a module is through one page (CAL 1/2, TRI 3, REF, VOR, NAV 3, NAV 4), the test goes on that page.
- **Out:**
    - the pages themselves beyond the rows these tests read (Sessions 8 and 9);
    - the MSG page (Session 9), except the order and paging tests that observe the handler;
    - AIRSPACE ALERT and `KLNMagvar` (Session 7): their bugs are filed here and pinned there;
    - settings persistence over a power cycle and #90 (Session 10).
- **Start state** on 2026-10-06: `npm test` 905 passed and 83 expected failures in 151 files, `npx tsc --noEmit` clean.
  Coverage of the area (statements):
    - 0 %: `Sun.ts`, and `Units.ts` (type aliases only, no runtime code);
    - below 50 %: `AltAlert.ts` 23.3 %, `UniqueIdentGenerator.ts` 42.1 %, `Vnav.ts` 49.4 %;
    - 50 to 85 %: `KlnEfbSaver.ts` 50 %, `Conversions.ts` 66.7 %, `HtAboveAirportAlert.ts` 66.7 %, `CountryMap.ts` 75 %,
      `AudioGenerator.ts` 78.9 %, `Time.ts` 82.9 %, `MessageHandler.ts` 84.6 %, `KlnEfbLoader.ts` 84.8 %;
    - 85 % and above: `IcaoBuilder.ts` 85.7 %, `TemporaryWaypointDeleter.ts` 85.7 %, `PersistentMessages.ts` 87.3 %,
      `MSA.ts` 89.2 %, `VolatileMemory.ts` 97.5 %, and 100 % for `Text`, `Wind`, `FirMap`, `Timers`,
      `TimezoneService` and `IcaoFixedLength`.

## Research pass

Four read-only agents worked in isolated worktrees:
- A: formats, identifiers, `Timers`, `TimezoneService`;
- B: messages and `VolatileMemory`;
- C: VNAV, MSA, the two alerts, audio;
- D: the EFB services, the deleter and the cross-track helper.

They read the code and the Pilot's Guide pages through the local page index. They wrote draft tests, ran each against a
one-line break of its subject, saw it fail, and restored the tree. They proved each pin by applying the fix temporarily.
The reports and drafts are in the session scratchpad (`research-A.md` to `research-D.md`, `drafts-A/` to `drafts-D/`, D
also `drafts-D-modified.patch`). With each agent's drafts in place the full suite was green and `tsc` clean. The plan
carries the per-test setup, literals, citation and break; the implementer confirms each by running it.

Findings that shape the tests:

- **The suite does not hold this area.** The coverage numbers come mostly from the boot running the code once.
    - Every one-line break of these left the whole suite green: `Conversions`, `Time` (except
      `getSecondsSinceMidnight`), `Text` (except the blank), `Sun`, `Wind`, `CountryMap`, `FirMap`, `Timers`,
      `TimezoneService`, `AltAlert`, `HtAboveAirportAlert`, `AudioGenerator`, and every VNAV break (angle, offset, time,
      advisory, the NAV 4 title, the VNV ALERT threshold and suppression).
    - The same holds for:
        - 24 of 29 breaks of the persistent messages (only OBS WPT > 200NM and the readable-HSI half of ADJ NAV IND
          CRS TO are held);
        - 21 of 25 breaks of `VolatileMemory.reset` (nothing holds what a power cycle clears);
        - the deleter switched off entirely;
        - five breaks of the EFB loader and six of the saver (the SID, STAR and approach mapping had no test).
- **The null-to-dashes rule is not in `Text.ts`.** Each display in `kln90b/controls/displays/` returns its own dashes.
  Seven of the eleven layouts are unheld. The layouts have no manual table, so the test is a characterization.
- **Independent sources:**
    - USNO almanac values for `Sun` (URLs and values in research A), and the CAL 1/2 figures of 5-10 and 5-11.
    - The `Conversions` coefficients: an exact-ISA computation, because the CAL 1 figures alone are too coarse.
    - The 5-7 to 5-9 VNAV example worked by hand.
    - The MSA grid read with `fs` and anchored on geography (Everest, Aconcagua), never through `MSA.ts`.
    - The wind triangle as a hand-computed vector sum.
- **`AudioGenerator` needs the render stage.** The SDK `SoundServer` reads `window`. The test listens on the bus topic
  `sound_server_play_sound`. Seeing `PLAY_INSTRUMENT_SOUND` itself would need a `Name_Z` fake and the in-game state,
  which one file would use (rule 13: listed, not built).
- **The cross-track copies:**
    - Those in `DirectToObs.test.ts`, `ModeControllerObs.test.ts` and `dmeArc.test.ts` equal
      `crossTrackNm(position, through, course)` to 3e-13, with no sign flip.
    - The two copies in `ModeController.test.ts` measured the angle at the aircraft, an approximation 0.004 to 0.022 NM
      off. The unit's own XTK equals `crossTrackNm` to 1e-11, so the refactor makes those expectations exact; their
      literals and tolerances still hold.
    - Every recorded break of the four files still fails the refactored tests.
    - A pre-existing gap: under the "fromDtk reversed on arcs" break the flown-through bound of `dmeArc.test.ts` stays
      green. Only the circle assertions hold it, and that is recorded in the log, not fixed.

## Maintainer's decisions

- **Sun:** the zenith of 91 is a bug; the standard 90°50' is the spec.
- **Accented letters:** not a case. The newest real navdata (AIRAC 2607) has no non-ASCII character in any navigation
  table (LSZH is `ZURICH`), so there is no test and no issue. The sim's own copy of the navdata was not checked.
- **Country codes:** Appendix D where it lists the country; modern codes are fine for states that did not exist in 1997.
  The six Caribbean entries and the missing USA are bugs; the other modern codes stay.
- **Messages:**
    - Messages surviving a power cycle are a bug (clear at power-off).
    - The forced window of ADJ NAV IND CRS TO is 30 s (the maintainer re-checked the video), so the code's 10 s is a bug.
- **Power-on reset:** every reset and every kept value of `VolatileMemory` (the NAV 4 selected altitude, the TRI fuel
  flow and reserve, the Super NAV 5 range) is characterized as is, with a GitHub question to research later.
- **VNAV re-arm on the ANGLE cursor:** a characterization plus a `question` issue, after the trainer check (see
  "Results that came in after the design"). VNAV at the end of the path: a comment on #73, no pin.
- **HAA:** the alert once per entry into the cylinder is a characterization.
- **Temporary waypoints:**
    - The power-off purge is the spec (5-22, 5-26).
    - The power-on purge and the purge of an active temporary waypoint are characterizations, plus one question issue.
- **EFB:**
    - The user-waypoint round trip (FARM back as FARMA) is a bug, pinned.
    - Importing while hot-swap disabled (`L:KLN90B_Disabled`) is a bug, pinned. Importing while powered off is fine,
      for usability, and is a characterization, as are the saver's `WriteGPSSimVars` gate and the loader's import with
      it off.
    - PBD legs dropped silently and airways flown direct: one enhancement issue. The 30-waypoint cut that loses the
      destination is a characterization.
    - The EFB route sync is added to the public contract list in `CLAUDE.md`, and the EFB tests cite it.
- **MSA south of 56° S:** an enhancement issue (the dataset has no more data; whether a free source exists is to be
  researched). The dashes there are a characterization.
- **The SET 9 alert volume** (stored, never used): an enhancement issue for a read-only LVar (see "Results that came in
  after the design").

**The controller's defaults** (presented to the maintainer with the design, not objected to):
- These are characterizations: the flight timer at exactly 30 kt (4-13 is ambiguous), VNAV at the end of the path, the
  tones after a deviation, a VFR-only unit without ALTITUDE FAIL, and the display dash layouts.
- ARM GPS APPROACH is tested at the unit stage only while #139 stands.
- The `Sun` tests use plain real coordinates (no facilities).
- `shortYearToLongYear` is split: a spec test for 87 → 2087 (5-15), and a characterization without a citation for
  88 → 1988.
- `>2NM` stays as it is.
- The 4-cell placeholder ident also exists for NDB (`VolatileMemory.ts:307`); the log extends the note, and no issue is
  filed.
- No `Name_Z` fake and no `XY` option for `savedUserWaypoints` (rule 13: each serves one file; `testing.md` section 7
  lists both).

## Results that came in after the design (trainer, volume)

- **VNAV (trainer agent, done; `trainer-vnav.md`; KLN 89 trainer, 2026-10-06):**
    - **Re-arm:** with VNAV active, moving the cursor onto the VS field (the 89's equivalent of ANGLE) changed nothing,
      and the advisory altitude stayed. From Inactive, the same move starts VNAV. The confidence is medium, because the
      trainer updates VNAV only when a knob turns, and an aircraft below the path could not be produced. 400 to 500 ft
      above the path, VNAV stayed active with the path altitude.
        - **The maintainer's ruling:** a `question` issue. Today's re-arm (an active VNAV below the path flips back to
          `VNV IN :ss`) is held as a characterization.
    - **End of descent:** the 89 goes Inactive and resets its inputs: the from-altitude becomes the target, the offset
      0 and the VS 0. A second VNAV then starts at once after the selected altitude is changed. The 90B code goes
      Inactive but keeps the programmed angle and the waypoint.
        - **The maintainer's ruling:** a comment on #73 with this result, and no pin. The end-of-path tests assert only
          the Inactive state, never the kept angle or waypoint, so that no possible cause of #73 is frozen.
- **Alert volume (research agent, done; `research-volume.md`):**
    - The framework cannot set a volume: `PLAY_INSTRUMENT_SOUND` takes only the sound id. Working Title's G3X shows its
      message volume as a fixed, disabled control.
    - An aircraft can drive the loudness itself, with a `<WwiseRtpc LocalVar=…>` on its `kln_short_beep` and
      `kln_long_beep` `AvionicSounds` and a volume curve in its Wwise package.
    - **The maintainer's ruling:** one `enhancement` issue to add a read-only `L:KLN90B_AlertVolume`. It mirrors SET 9
      (0 to 99, written at boot and on change), with the sound.xml snippet for the wiki. One test in the sim must first
      confirm that MSFS 2024 accepts an LVar RTPC inside `AvionicSounds`.
    - A side note for the issue: the class comment of `AudioGenerator.ts` still names `tone_altitude_alert_default`.

## Tasks 1 to 5 (parallel)

All five run at once, one implementer each in its own worktree, reset to the session branch first (rule 21). No task
builds on another, so there is no harness task ahead of them. Placeholders for new bugs are `#NEW-<task>-<n>` (rule 23).
Each task starts from its research drafts. A draft is a starting point: the implementer re-runs every break and every
proof.

### Task 1: formats and conversions (research A, sections 1 to 7)

Files:
- unit: `test/unit/data/Conversions.test.ts`, `Time.test.ts`, `Text.test.ts`, `Sun.test.ts`, `Wind.test.ts`,
  `CountryMap.test.ts` (with the FIRMAP tests);
- render: `test/render/controls/displays/NullDashes.test.ts`, `test/render/pages/left/CalFigures.test.ts` (or merged
  into `Cal1Page.test.ts` and `Cal2Page.test.ts`), `test/render/pages/left/Tri3Wind.test.ts`.

What it covers:
- **Conversions:** the CAL 1 and CAL 2 figures (5-10, 5-11), within 15 and 25 ft of exact ISA, and the TAS within
  0.2 kt. The avform density-altitude drift is a characterization.
- **Time:** the zone list and offsets (3-5), the CAL 6 names and the example (5-14), and the `TimeStamp` operations as
  characterizations. Year 87 → 2087 is spec (5-15); 88 → 1988 is a characterization.
- **Text:** the character set (3-47, 3-26).
- **Displays:** the null dash layouts of the eleven displays (characterization).
- **Sun:** the USNO values at 90°50', and no rise or set at 70° N.
- **Wind:** the wind triangle, 5-2, 5-12.
- **Countries:** `CountryMap` and `FIRMAP` against Appendix D.

Pins:
- `#NEW-1-1` CAL 7 uses zenith 91 (the KATL figures of 5-15);
- `#NEW-1-2` the seconds of the stored date change the result;
- `#NEW-1-3` the UTC date is used instead of the date in the zone (unit pin on `Sun`; if the fix goes into
  `Cal7Page`, the issue says the pin moves with it);
- `#NEW-1-4` TRI 1, 3 and 5 take the course as the heading (`Tri3Wind`, 147 kt);
- `#NEW-1-5` a US airport has no country;
- `#NEW-1-6` six Caribbean regions;
- `#NEW-1-7` FIR `NY` is two cells.

Reviewer: Sonnet.

### Task 2: identifiers and time services (research A, sections 8 to 12)

Files: `test/unit/data/navdata/IcaoBuilder.test.ts` (with `IcaoFixedLength`), `UniqueIdentGenerator.test.ts`,
`test/unit/services/Timers.test.ts`, `TimezoneService.test.ts`, `test/render/pages/right/RefNaming.test.ts`,
`test/render/pages/right/VorUserWaypoint.test.ts`.

What it covers:
- **IcaoBuilder:** `XX` and `XY` (contract), the V1 layout, and the ident-only value and the padding as
  characterizations.
- **UniqueIdentGenerator:** the first free letter and number (5-22, 5-26); the bare ident first, `null` after 27 names
  and the count past 09 as characterizations.
- **Timers:** DEP and FLT (4-13); the 30 kt boundary and the total time as characterizations.
- **TimezoneService:** the sim call (characterization).

Pins:
- `#NEW-2-1` D/T 4 DEP runs with the GPS clock (`Timers` keeps the GPS time object);
- `#NEW-2-2` REF names a five-character ident without a letter (5-22; the EFB's bare ident must stay, so the issue
  names that constraint);
- `#NEW-2-3` a user VOR from the VOR page is stored as a SUP waypoint (`VorPage.tsx:215`; repository and OTH 3).

Reviewer: Sonnet.

### Task 3: messages and VolatileMemory (research B)

Files:
- unit: `test/unit/data/MessageHandler.test.ts`, `test/unit/data/PersistentMessages.test.ts`;
- render: `test/render/data/PersistentMessages.test.ts`, `test/render/data/Messages.test.ts`,
  `test/render/data/VolatileMemory.test.ts`.

What it covers:
- **MessageHandler:**
    - post once, keep while the condition holds, drop when it ends, new again when it returns (3-16);
    - posting order (characterization).
- **PersistentMessages, unit stage:**
    - the thresholds of ARM GPS APPROACH, IF REQUIRED SELECT OBS, MAGNETIC VAR INVALID, VNV ALERT and PRESS ALT TO SET
      BARO (B-1 to B-4, 6-8, 5-44);
    - ADJ NAV IND CRS and ADJ NAV IND CRS TO, with the window changed to the 30 s pin below;
    - characterizations where the manual is silent.
- **PersistentMessages, render stage:** ALTITUDE FAIL, MAGNETIC VAR INVALID at 74.5° N, PRESS ALT TO SET BARO on
  `approachWorld()`, and DATA BASE OUT OF DATE after SET 2.
- **MSG page:** the newest message first, paging (3-16), and SET FUEL ON BOARD (B-4).
- **VolatileMemory:**
    - CAL 6 over a page change and a power cycle (5-14);
    - ENR-LEG at power-up (3-3);
    - the approach deleted after 6 minutes off (6-5);
    - the other resets, and the kept values, as characterizations;
    - the VOR page selection over a page change and a power cycle (characterization).

Pins:
- `#NEW-3-1` PRESS ALT TO SET BARO shows with an air data baro (6-8);
- `#NEW-3-2` DATA BASE OUT OF DATE lasts one tick (the unit pin "stays until read" and the render pin "lists it once";
  the unit pin's comment says it is bound to the persistent class and goes if the fix deletes that class);
- `#NEW-3-3` messages survive a power cycle;
- `#NEW-3-4` the ADJ NAV IND CRS TO window is 10 s instead of 30 s (the 10 s characterization of the draft becomes this
  pin, with a passing sibling inside 10 s);
- #94 procedures removed on a short power cycle.

Also: reproduce, by a scratch render test, whether the MSG page marks the messages of a page the pilot never reached as
seen (research B, section 1). Report it with the reproduction; do not pin it (Session 9).

Reviewer: Opus.

### Task 4: VNAV, MSA, alerts and audio (research C)

Files:
- unit: `test/unit/services/Vnav.test.ts` (appended from `VnavPath`), `test/unit/services/MSA.test.ts` (appended from
  `MSAGrid`), `test/unit/services/AltAlert.test.ts`, `test/unit/services/HtAboveAirportAlert.test.ts`;
- render: `test/render/services/AudioGenerator.test.ts`, `test/render/services/VnavObs.test.ts`,
  `test/render/pages/left/Nav4Vnav.test.ts`, `test/render/pages/left/Nav3Esa.test.ts`.

What it covers:
- **Vnav:** angle, distance, arming, activation, advisory, climb, waypoint validity (5-7 to 5-9, C-1); NAV 4 titles and
  VNV ALERT (5-8, B-4). The re-arm of an active VNAV under the ANGLE cursor is a characterization (question issue).
  The end-of-path tests (characterizations) assert the Inactive state only, not the kept angle or waypoint (#73).
- **MSA:** sectors, hemispheres, bounds, legs and routes (3-33). South of 56° S is a characterization.
- **AltAlert:** 3, 2 and 4 tones (3-55 to 3-57); after a deviation and switched on inside the window are
  characterizations.
- **HtAboveAirportAlert:** radius, top, once inside, the gates (3-58, 3-59); re-entry is a characterization.
- **AudioGenerator:** tone order and chaining, ids (contract: the wiki and #141), the install gate (3-57).

Pins:
- `#NEW-4-1` the HAA adds the elevation in meters;
- `#NEW-4-2` the HAA alerts without a position;
- `#NEW-4-3` a pattern plays backwards (latent);
- `#NEW-4-4` the ESA of a leg misses its end;
- `#NEW-4-5` longitude 180 reads the filler column;
- `#NEW-4-6` NAV 3 ESA dashes on the last leg;
- `#NEW-4-7` the VNAV countdown shows `m:60`;
- `#NEW-4-8` VNAV accepts a waypoint ahead in OBS mode;
- #89 the reading half;
- #97 at the ESA level.

Reviewer: Opus.

### Task 5: EFB, temporary waypoints and the cross-track helper (research D)

Files:
- `test/render/services/TemporaryWaypointDeleter.test.ts` (new);
- `test/render/services/KlnEfbLoader.test.ts` and `KlnEfbSaver.test.ts` (appended);
- `test/harness/flight/geo.ts` (`crossTrackNm`) and `test/unit/harness/geo.test.ts` (appended);
- refactored: `test/render/pages/left/DirectToObs.test.ts`, `test/render/services/ModeControllerObs.test.ts`,
  `test/render/services/ModeController.test.ts`, `test/flight/flights/dmeArc.test.ts`.

What it covers:
- **Deleter:** the purge at power-off, a temporary waypoint a numbered plan holds kept, a user waypoint kept (5-22,
  5-26, 5-20); the purge at boot and of the DME-arc entry at power-on as characterizations.
- **Loader:**
    - contract: no departure and destination;
    - USR DB FULL (C-2);
    - characterizations: the four-character name, CUST to CUSTZ exhausted, the 30-waypoint cut, the import while
      powered off and with `WriteGPSSimVars` off.
- **Saver:** the database fix by ICAO, the user waypoint by position, the approach, the SID and the STAR (contract);
  no answer with `WriteGPSSimVars` off (characterization).
- **`crossTrackNm`:**
    - the five hand-derived harness tests: the equator, a meridian, the vector derivation, abeam at 47° N, flat earth;
    - the four refactored files with their assertions unchanged, each re-run under its recorded break;
    - the #122 sibling gets the new break `getObsTrue() - 179`.

Pins:
- `#NEW-5-1` runway numbers below 10 go out as one digit;
- `#NEW-5-2` a user waypoint comes back from the EFB as a new temporary waypoint;
- `#NEW-5-3` the loader imports a route while the unit is disabled for hot swapping (`L:KLN90B_Disabled` set; the
  sibling imports with it unset).

The EFB tests cite the public contract of `CLAUDE.md`, which task 6 extends to name the EFB route sync.

Reviewer: Opus.

## Implementer brief (all tasks)

Read `CLAUDE.md`, `docs/testing.md`, section 2 of `docs/test-coverage.md`, this design, the plan's section for the task
and the task's research report and drafts. Then:

- **Setup:** reset the worktree to the session branch (`git reset --hard tests-session-6-data-services`) and check the
  head. If `node_modules` is missing, link it with a junction.
- **Proofs:** prove every test by breaking its subject and every pin by fixing the bug temporarily, then restore.
- **Commits:** one commit per task plus one per fix round, never amending. A `Proof: fails when …` line per test and a
  `Co-Authored-By` line naming the model.
- **Placeholders:** `#NEW-<task>-<n>`.
- **Do not:** edit `docs/test-coverage.md` or `docs/testing.md`, file issues, or change behavior in `kln90b/` (rule 12
  seams only, named in the commit).
- **Before committing:** run the full `npm test` and `npx tsc --noEmit`.
- **Report:** write it with the Bash tool and check that it exists.
- **Shared scratchpad:** keep scratch scripts in the task's own scratchpad folder (`scratchpad/task-<n>/`), because the
  scratchpad is shared and research A lost a script to another agent.
- **Break lists:** the break lists of the research and the plan stay out of the test comments.

**Models:** Sonnet implementers, re-dispatched on Opus if one stalls (rule 26). Reviewers as stated per task; re-reviews
after a fix round on Sonnet.

## Reviews and merging (rules 24 and 25)

- One reviewer per task in the task's worktree: spec compliance, then code quality, then its own mutation pass, never
  announced to the implementer. Every page citation is checked against the Pilot's Guide index.
- Findings go back to the same implementer; a scoped re-review follows each fix round.
- Merge order: 2, 1, 4, 5, 3. Task 5 touches existing tests of Sessions 4 and 5, and task 3 the power-cycle path many
  tests use. Run `npm test` and `npx tsc --noEmit` after each merge.
- Junctions: before `git worktree remove`, remove the worktree's `node_modules` junction with `rmdir`. That includes the
  four research worktrees.

## Task 6: issues and close-out (rules 23 and 27)

1. **File** (search open and closed issues first; label `bug` unless stated):
    - the bugs of tasks 1 to 5 (`#NEW-1-1` to `#NEW-5-3`);
    - AIRSPACE ALERT ignores the 2 NM rule (B-1; `AirspaceAlert.ts:126`; pin in Session 7);
    - MAGNETIC VAR INVALID is missing in OBS mode with the active waypoint outside the coverage area (5-44;
      `KLNMagvar.ts:20-22`; Session 7);
    - the MSG page seen-marking, if task 3 reproduced it;
    - `question` issues: the power-on reset of `VolatileMemory` (what the real unit keeps); the power-on purge of
      temporary waypoints and the purge of an active one; the re-arm of an active VNAV under the ANGLE cursor (the
      trainer evidence and its limits);
    - `enhancement` issues: PBD legs and airways in the EFB loader; MSA and ESA south of 56° S (the data source);
    - an `enhancement` issue for the read-only `L:KLN90B_AlertVolume` (see "Results that came in after the design").
2. **Comment:**
    - #73: the VNAV leads (the angle and waypoint kept after the descent ends) and the trainer's end-of-descent reset
      and second VNAV;
    - #89: the reading half is pinned;
    - #94: pinned;
    - #97: pinned at the ESA level.
3. Replace every `#NEW-` placeholder in one commit; `grep -r "#NEW-" test/` finds nothing.
4. **`CLAUDE.md`:** add the EFB route sync (`FlightPlanRouteManager`: the synced route in, the route request out) to
   "Public contract with aircraft".
5. **`testing.md`:**
    - section 4: `crossTrackNm` in "Geometry for expectations";
    - section 6 or 7: the AudioGenerator bus-level observation and the missing `Name_Z` fake, `XY` waypoints laid out by
      hand, and the `dmeArc` bound that does not hold the arc reversal.
6. **Close Session 6:** tick its checkbox and write the session log: done, rulings, trainer and research results, bugs
   filed, fixes that could not be re-broken, what is not covered (rule 18), and coverage at the start and the end.
7. Run `npm test`, `npx tsc --noEmit` and `npm run coverage`.

Then the final review of the whole session runs on the controlling session's model, and the maintainer is asked to
approve the merge into `master` and the deletion of the task branches and worktrees.

**Not covered, known now** (the log adds what the tasks find):
- `Units.ts` (type aliases only).
- The APT 2 time zone line (Session 9).
- The REF flow's second ENT showing `NO SUP WPTS` (research A, unverified; Session 9).
- AIRSPACE ALERT and the airspace message subclasses (Session 7).
- IF REQUIRED SELECT OBS and VNV ALERT at the render stage (unit only).
- The double evaluation of persistent conditions per tick (no observable effect).
- The `KLNMagvar` limits.
- The `PLAY_INSTRUMENT_SOUND` call itself (no `Name_Z` fake).
- The full `COUNTRYMAP` and `FIRMAP` tables against Appendix D (spot checks only).
- The `dmeArc` flown-through bound under the arc reversal.

## Risks

- **Shared files:** tasks are disjoint in files except that task 5 refactors four existing tests of Sessions 4 and 5.
  Task 1's `CalFigures`/`Tri3Wind` and task 4's `Nav4Vnav`/`Nav3Esa` are new files in `test/render/pages/left/`.
- **Pins on the power cycle:** `#NEW-3-3`, #94 and the deleter tests all cycle power. Each pin keeps its heavy setup in a
  passing sibling.
- **Fake `Date` at the unit stage:** the ADJ window and `Sun` tests fake only `Date` and restore it in `afterEach`.
- **Shared scratchpad:** each task writes only into its own scratchpad folder.
- **CRLF:** the repo files are CRLF. `sed -i` under Git Bash rewrites them as LF, so edit with the Edit tool.
