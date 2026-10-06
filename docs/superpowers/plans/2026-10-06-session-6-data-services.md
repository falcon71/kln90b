# Session 6 (data and pure services): implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended)
> or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** Tests that hold the pure logic under `kln90b/data/` and `kln90b/services/`: the formats and conversions, the
identifiers, the messages, `VolatileMemory`, VNAV, MSA, the alerts, audio, the EFB services and the temporary-waypoint
deleter. Each test is proven to bite. Also pins for the bugs the research found, and the cross-track helper
`crossTrackNm` that replaces the hand-written copies in four tests.

**Architecture:**
- **Tasks 1 to 5** are five parallel batches, one per research area. Each runs in its own git worktree, reset to the
  session branch, starts from the research drafts, and ends in one commit (plus one per fix round). No task builds on
  another, so there is no harness task ahead of them.
- **Task 6** does the following:
    - files the issues and comments;
    - replaces the placeholders;
    - extends the public contract in `CLAUDE.md`;
    - updates `testing.md`;
    - writes the session log.
- The workflow is rules 19 to 27 of `docs/test-coverage.md`.

**Tech Stack:** TypeScript, Vitest (unit in Node; render and flight in happy-dom), `@microsoft/msfs-sdk`, the headless
harness in `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-06-session-6-data-services-design.md`

## Global Constraints

- **Rules.** `CLAUDE.md`, `docs/testing.md` and `docs/test-coverage.md` section 2 (rules 1 to 27) bind every task.
- **Branches.** The session branch is `tests-session-6-data-services`. Never `git push`. Never merge into `master`; the
  maintainer approves that at the end.
- **Worktree base (rule 21).** An isolation worktree starts at `origin/main`, and the work then goes like this:
    - Before anything else, run `git reset --hard tests-session-6-data-services` on the (still empty) worktree branch.
    - Check `git log -1`: it must show the session branch's head.
    - If `node_modules` is missing, create it as a junction to `E:\msfs\kln90b\node_modules`
      (`cmd //c mklink /J node_modules E:\msfs\kln90b\node_modules`). Never delete it recursively.
- **No behavior changes** in `kln90b/` (rule 12). Testability seams only, each named in its commit message.
- **Test names** carry the issue where there is one: `'… (#94)'`. A pin for a bug without an issue is
  `it.fails('… (#NEW-<task>-<n>)')` (rule 23), with the numbers fixed in this plan. The research drafts use other
  placeholder names (`#NEW-A-n`, `#NEW-B-n`, `#NEW-C-n`, `#NEW-D-n`): rename them as each task says.
- **Labels** (`testing.md` section 5):
    - A **spec test** cites the Pilot's Guide page in a comment (or the Installation Manual page, the USNO almanac, or a
      YouTube timestamp).
    - A **characterization test** has `characterization` in its `describe` or `it` title and no citation.
    - A **contract test** cites its source and needs neither. Sources: `CLAUDE.md` "Public contract with aircraft", the
      doc comments in `LVars.ts`, the wiki page by name, the SDK type `FlightPlanRoute`.
    - The page indexes are in `C:\Users\denni\.claude\projects\E--msfs-kln90b\memory\` (`pilots-guide-index.md`,
      `install-manual-index.md`). Cite page numbers, never copy manual text.
- **Expected values** are literals, or derived with `test/harness/flight/geo.ts` or by hand. Never derive them from the
  code under test or the SDK's flavor of the same formula. Setup may use SDK geometry.
- **Assertions.** No permissive assertions (rule 17). One subject per `it` where several breaks could mask each other.
  Assert parsed structure, not substrings of a whole screen.
- **Pins.**
    - Every `it.fails` has a passing sibling that asserts its heavy preconditions.
    - A pin is proven by fixing the bug temporarily and seeing the pin turn red, then restoring. The fix is named per
      pin below.
- **Proof per test (rule 10).**
    - Break the subject by hand. The break is named per test below or in the research report section the task names; a
      different real break is fine.
    - Run the test, see it fail, restore, and check that `git diff` shows only test files.
    - Never commit the broken state.
- **Commits (rule 22).**
    - One commit per task, plus one per fix round, never amended.
    - The message lists every test as `- <test>: Proof: fails when <break>`, and every pin as
      `- <pin>: Proof: turns red with <fix>`.
    - It ends with `Co-Authored-By: <the model that wrote it> <noreply@anthropic.com>`.
- **Before committing** run the whole suite (`npm test`) and `npx tsc --noEmit`, not just the task's files.
- **Implementers leave alone:** `docs/test-coverage.md`, `docs/testing.md`, `CLAUDE.md`, GitHub issues, and other
  tasks' files.
- **Copyright and data.** Never commit manual text or navdata recorded from the sim. Facilities are invented. Plain
  real coordinates are fine in the `Sun` tests (no facilities, no navdata). The KLN 89 trainer is cited as "KLN 89
  trainer"; its Chicago waypoints never appear in tests.
- **Research and scratch.**
    - The reports and drafts are in
      `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\a8156418-9754-4181-abf5-e4619cdf3926\scratchpad\`:
        - `research-A.md` (`drafts-A\test\…`), `research-B.md` (`drafts-B\test\…`), `research-C.md` (`drafts-C\…`,
          laid out like `test\`) and `research-D.md` (`drafts-D\…`, plus `drafts-D-modified.patch`);
        - `trainer-vnav.md` and `research-volume.md`.
    - The drafts ran green on the session branch, but they are starting points, not finished tests.
    - Do not copy the research's break lists into test comments.
    - Scratch scripts go only into `scratchpad\task-<N>\`, because the scratchpad is shared.
- **CRLF.** The repo files are CRLF. `sed -i` under Git Bash rewrites them as LF, so edit with the Edit tool.
- **Reports** go to the scratchpad as `report-task-<N>.md`, written with the Bash tool (`cat > '<path>' <<'EOF'`). If
  the heredoc fails on text full of quotes, use the Write tool. Check that the file exists. The reply to the controller
  is only the status, the head commit and concerns.

**User decisions (already made):**
- Sun: "Bug: pin 90°50'" (zenith 91 is a bug).
- Accented letters: "check this in the nav database… I don't think there are any accented letters". AIRAC 2607 has none
  in its navigation tables: no test, no issue.
- Countries: "App. D, modern for new". The Caribbean entries and the missing USA are bugs.
- Messages over a power cycle: "Bug: clear at power-off".
- ADJ NAV IND CRS TO window: "30s is right, this is a bug".
- Power-on reset: "characterize as is and create a Github question".
- VNAV re-arm under the ANGLE cursor: "Question issue" (after the KLN 89 trainer check).
- VNAV end of descent: "Comment on #73, no pin".
- HAA once per entry: "Characterize per entry".
- Temporary waypoints: "Characterize + question" (the power-on purge and the active waypoint).
- EFB user-waypoint round trip: "Bug, pin".
- EFB gating: "Bug. Power off is fine for usability, but it must not load while disabled".
- PBD legs, airways, the 30-waypoint cut: "Enhancement issue, characterize".
- SET 9 volume: "Enhancement: read-only LVar".
- EFB contract: "Add it to CLAUDE.md".
- MSA south of 56° S: "File this as an Enhancement… research if that data is freely available".
- "Spec approved, please write the plan".

---

## Facts every batch needs (from the research pass)

**Boot and settle.**
- `bootUnit` boots force-ready, and `await settle(unit)` waits for the GPS and for FPL 0 to activate.
- One calculation tick is `await vi.advanceTimersByTimeAsync(1000)`.
- Every boot also holds the default navdata (`ZZXA`, `ZZV`, `ZZN`, `ZZXIN`), so never give a test facility an ident
  starting with `ZZ`.
- The MSG annunciator is lit on every engine-running boot (`testing.md` section 6), so a message test asserts the exact
  message list, not "any message".

**Unit tests without a boot** build their own `EventBus`. They reset the fakes they write (`simEnv().sim.reset()`,
`simEnv().storage.data.clear()`). A test that fakes only `Date` uses `vi.useFakeTimers({toFake: ['Date']})` and restores
it in `afterEach`.

**Power cycle.**
- The sequence is `await unit.panel.powerCycle({offSeconds})`, then `await unit.panel.approveSelfTest()`, then two
  seconds.
- `VolatileMemory.reset` runs on every power-on, also at the boot. `TemporaryWaypointDeleter` runs on every power
  change, after `VolatileMemory`.

**Messages.** Read them as a parsed list: `unit.props.messageHandler.getMessages()`, mapped to their text. Never use a
screen substring.

**Hot-swap disable.** `sim.set('L:KLN90B_Disabled', 'bool', true)`. `SimVarSync` reads it at its next tick and stops
the tick controller (`test/render/SimVarSync.test.ts` shows the pattern).

**EFB.** `bootUnit({efb: true})` gives `unit.efb`, with `sync(route)` (pass a new object each time), `request()` and
`replies`. `efbRoute({departure, destination, enroute})` builds a route.

**Approach world.** `approachWorld()` from `test/harness/fixtures.ts`. Load the approach with
`await unit.panel.loadProcedure('APT 8')` after `settle`.

---

### Task 1: formats and conversions

**Goal:** Spec and characterization tests for `Conversions`, `Time`, `Text` and the display null dashes, `Sun`, `Wind`,
`CountryMap` and `FirMap`, and the pins `#NEW-1-1` to `#NEW-1-7`.

**Files:**
- Create: `test/unit/data/Conversions.test.ts`, `test/unit/data/Time.test.ts`, `test/unit/data/Text.test.ts`,
  `test/unit/data/Sun.test.ts`, `test/unit/data/Wind.test.ts`, `test/unit/data/CountryMap.test.ts`
- Create: `test/render/controls/displays/NullDashes.test.ts`
- Create: `test/render/pages/left/CalFigures.test.ts` (or merge its two tests into `Cal1Page.test.ts` and
  `Cal2Page.test.ts`)
- Create: `test/render/pages/left/Tri3Wind.test.ts`

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] `shortYearToLongYear` is split: a spec test for 00 to 87 → 2000 to 2087 (5-15) and a characterization for 88 to
      99 → 1988 to 1999 without a citation.
- [ ] The pins `#NEW-1-1` to `#NEW-1-7` turn red under their named fixes; each has a passing sibling.
- [ ] No test of accented letters.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Copy the nine files from `scratchpad\drafts-A\test\…` to the same paths. Read
  `research-A.md` sections 1 to 7 first. Leave out the drafts of task 2 (`IcaoBuilder`, `UniqueIdentGenerator`,
  `Timers`, `TimezoneService`, `RefNaming`, `VorUserWaypoint`). Rename the placeholders:

  | research | here |
  |---|---|
  | `#NEW-A-1` | `#NEW-1-1` |
  | `#NEW-A-2` | `#NEW-1-2` |
  | `#NEW-A-3` | `#NEW-1-3` |
  | `#NEW-A-4` | `#NEW-1-4` |
  | `#NEW-A-5` | `#NEW-1-5` |
  | `#NEW-A-6` | `#NEW-1-6` |
  | `#NEW-A-8` | `#NEW-1-7` |

- [ ] **Step 2: Conversions** (`research-A.md` section 1).
    - The ISA altitude cases: 9000/29.92 → 9001.2; 8500/30.04 → 8390.4 (5-10); 5000/29.42 → 5466.8; and back.
    - The CAL 1 figures to 100 ft (5-10).
    - Within 15 and 25 ft of exact ISA: this test, not the figures, holds the 118.6 coefficient.
    - The 118.6 ft per degree drift (characterization).
    - The CAL 2 figures 158/163/164 (5-11), and the exact-ISA TAS within 0.2 kt.
    - Breaks C1 to C11 as the report names them.
    - `CalFigures`: PRS 8400 and DEN 9300 (5-10, figure 5-33), TAS 158 (5-11, figure 5-34). Breaks: Cal1Page passes the
      indicated altitude; Cal2Page reads `cal1SAT`.

- [ ] **Step 3: Time** (`research-A.md` section 3).
    - The zone list and offsets (3-5) and the CAL 6 names (5-14), plus the other names (characterization).
    - The CAL 6 example: 09:56 PST = 17:56 UTC = 12:56 EST (5-14).
    - The date roll, `withDate`, `withTime`, `addSeconds`, `getSecondsSinceMidnight`, `createDate` and `createTime`
      (characterizations).
    - The `shortYearToLongYear` split of the acceptance criteria. Break T1 (`<= 86`) fails the spec half.
    - Breaks T1 to T12.

- [ ] **Step 4: Text and the dashes** (`research-A.md` section 4).
    - `'Winston-Salem 2'` → `'WINSTON-SALEM 2'` (3-47); `"St. John's Int'l"` → `'ST JOHNS INTL'` and
      `'A/B (C), D&E_F'` → `'AB C DEF'` (3-26). Breaks X1 to X4.
    - `NullDashes`: the eleven displays rendered with `FSComponent.render` into a `div`, `it.each`, title "a null value
      renders as dashes (characterization of the dash layouts)". Each break N1 to N11 (one dash replaced by `x`) turns
      exactly its own row red.

- [ ] **Step 5: Sun** (`research-A.md` section 5). Put the USNO URL pattern and the fetch date (2026-10-06) in the file
  header.
    - `it.each` at the explicit zenith 90 + 50/60, within 90 s of the published minute: 47 N 8 E 2024-06-21 03:33/19:27;
      34 S 151 E 2024-12-21 18:42/09:07; 60 N 25 E 2024-03-20 04:21/16:35 and 2024-03-21 04:18/16:38. Breaks S2, S3, S6,
      S7, S8, S9.
    - 70 N 20 E: no rise and no set at midsummer and at midwinter (USNO). Breaks S4, S5.
    - Pins:
        - `#NEW-1-1` the three KATL figures of 5-15 with the default zenith: 03 MAR 89 CST 06:04/17:35; 10 MAR 89 CST
          05:55/17:41; 10 MAR 89 EST 06:55/18:41. Fix: the default zenith `90 + 50 / 60`. All three turn red.
        - `#NEW-1-2` the same timestamp for 12:00:00 and 12:00:59 UTC on 3 MAR 1989. Fix: `Sun` returns
          `TimeStamp.create(dayStart + (h * 60 + m) * 60000)` instead of `withTime`.
        - `#NEW-1-3` the same CST rise at 08:00 and at 20:00 CST on 3 MAR 1989 (5-15: the date shown in the zone). Fix:
          `calcDayOfYear(date)` instead of `calcDayOfYear(utcDate)`.
    - Each pin needs a passing sibling. For `#NEW-1-1` that is the USNO test above. For `#NEW-1-2` and `#NEW-1-3`, a
      sibling asserting that the two inputs differ as described: the two stamps are 59 s apart, and 20:00 CST is the
      next UTC day.

- [ ] **Step 6: Wind and TRI 3** (`research-A.md` section 6).
    - The ground speed: (100, 090, 20 kt from 360) → 101.980; (100, 090, 30 from 045) → 81.593.
    - 200 kt into 25 kt → 175 kt (5-2).
    - The wind solved from TAS, heading, GS and track (5-12): 30 kt from 045; 20 kt from about 360, the result in 0 to
      360.
    - The headwind component (5-12): 21.213, 25, -20, 0.
    - Breaks W1 to W7.
    - `Tri3Wind` (KAAA 47 N 8 E, KBBB 46 N 8 E):
        - "shows the TAS as the ground speed in no wind": the pin's sibling;
        - 175 kt into a 25 kt headwind on 180 (5-2; break W1);
        - pin `#NEW-1-4` "shows 147kt for TAS 150 with a 30 kt crosswind on a 180 course" (5-2, 5-3; today 153). Fix:
          GS = sqrt(TAS² − (ws·sin(wd − crs))²) − ws·cos(wd − crs) in `Tri3Page`.

- [ ] **Step 7: CountryMap and FIRMAP** (`research-A.md` section 7). Facilities come from the builders, with invented
  idents.
    - Navaid by region: LS CHE, ED DEU, K3 USA, CY CAN (D-1 to D-3).
    - Airport by ident: LSZZ CHE, EGZZ GBR.
    - An unknown region gives three blanks (characterization).
    - State or province from the city: KS, SK, PQ (D-1), with the fallback (characterization).
    - FIRMAP: EDMM MUN, EDWW BRE, CZEG EDM, VTBB BAN, ZBPE BEI (D-3 to D-6); the three-cell padding with KZFW `FW `
      (characterization).
    - Pins:
        - `#NEW-1-5` a US airport (KAAA) is `USA`. Fix: idents starting with `K` map to the `K1` entry.
        - `#NEW-1-6` `it.fails.each` TD DMA, TR MSR, TT TTO, TU VGB, TV VCT, TX BMU. Fix: the corrected entries; all six
          turn red.
        - `#NEW-1-7` KZNY and KZWY are `NY ` (three cells). Fix: `'NY '`.
    - The siblings are the region and padding tests above.

- [ ] **Step 8: verify and commit.** Run `npm test` and `npx tsc --noEmit`, then make one commit with the `Proof:` lines.

```json:metadata
{"files": ["test/unit/data/Conversions.test.ts", "test/unit/data/Time.test.ts", "test/unit/data/Text.test.ts", "test/unit/data/Sun.test.ts", "test/unit/data/Wind.test.ts", "test/unit/data/CountryMap.test.ts", "test/render/controls/displays/NullDashes.test.ts", "test/render/pages/left/CalFigures.test.ts", "test/render/pages/left/Tri3Wind.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "shortYearToLongYear split into spec (87->2087) and characterization (88->1988)", "pins #NEW-1-1..7 turn red under their fixes, each with a sibling", "no accented-letter test", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 2: identifiers and time services

**Goal:** Tests for `IcaoBuilder`, `IcaoFixedLength`, `UniqueIdentGenerator`, `Timers` and `TimezoneService`, and the
pins `#NEW-2-1` (DEP runs with the clock), `#NEW-2-2` (REF five-character ident) and `#NEW-2-3` (user VOR stored as
SUP).

**Files:**
- Create: `test/unit/data/navdata/IcaoBuilder.test.ts`, `test/unit/data/navdata/UniqueIdentGenerator.test.ts`
- Create: `test/unit/services/Timers.test.ts`, `test/unit/services/TimezoneService.test.ts`
- Create: `test/render/pages/right/RefNaming.test.ts`, `test/render/pages/right/VorUserWaypoint.test.ts`

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The pins `#NEW-2-1`, `#NEW-2-2` and `#NEW-2-3` turn red under their named fixes; each has a passing sibling.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Copy the six files from `scratchpad\drafts-A\test\…`. Read `research-A.md`
  sections 8 to 12. Rename `#NEW-A-7` → `#NEW-2-1`, `#NEW-A-9` → `#NEW-2-2`, `#NEW-A-10` → `#NEW-2-3`.

- [ ] **Step 2: IcaoBuilder and IcaoFixedLength** (section 8).
    - `XX` for user waypoints and `XY` for temporary ones (contract: `CLAUDE.md` navdata, `docs/architecture.md` Core 7).
    - The V1 layout: `'VXX    ABC  '`, `'UXY    CUSTA'`.
    - The struct: type, region and ident filled, the airport empty.
    - The ident-only value and the five-cell padding with five blanks for null (characterization).
    - Breaks I1 to I6, L1 and L2.

- [ ] **Step 3: UniqueIdentGenerator** (section 9). Use a `MemoryFacilityClient` cast to `FacilityClient`, as
  `Scanlist.test.ts` does.
    - The first free letter: ABC → ABCA, then ABCB (5-22). Every facility type counts. ABCDE with ABCD taken → ABCDA
      (5-22).
    - Characterizations: the bare ident first; null after 27 names; QQQZ when only Z is free; the count past 09.
    - The first free number: ABC00, then ABC02 (5-26).
    - Breaks U1 to U8.
    - `RefNaming`: FPL 0 is KAAA–KBBB, an INT lies east of the leg, FPL 0 is on the left and REF on the right. Cursor,
      type the ident, ENT, ENT, then read the repository.
        - Sibling "appends the first free letter to a four-character ident": `['XY:ABCDA']`.
        - Pin `#NEW-2-2` "drops the fifth character and appends a letter (5-22)": today `['XY:ABCD']`. Fix: remove `''`
          from the suffixes. The sibling stays green. The real fix must keep the EFB's bare ident; the issue says so.

- [ ] **Step 4: Timers** (section 10). Use one `EventBus` and `KLN90BUserSettings` for the file, clear storage per test,
  and fake sensors `{in: {gps: {groundspeed, timeZulu}}}`.
    - RUN WHEN GS > 30KT: 29 kt twice → FLT 0, DEP null; 31 kt three times with a new time object per tick → FLT 3,
      DEP 15:03:00; 10 kt → FLT 3, DEP kept (4-13).
    - RUN WHEN POWER IS ON: counts from the first tick, DEP at once (4-13).
    - Exactly 30 kt counts (characterization of the boundary).
    - One second per tick, saved every 60 s (characterization).
    - Pin `#NEW-2-1` "keeps DEP when the GPS advances its time in place (4-13)". Fix: `departureTime =
      timeZulu.addSeconds(0)`, a copy.
    - Breaks R1 to R6.

- [ ] **Step 5: TimezoneService** (section 11). In a `describe` labeled characterization of the sim call, set
  `coherent.replies` and assert the `coherent.calls` literal and the passed-through answer. Breaks Z1 and Z2.

- [ ] **Step 6: the user VOR** (section 12). `VorUserWaypoint`: on the VOR page, cursor, ident QQQ, ENT, outer 2, type
  N4700000, ENT, type the longitude, ENT.
    - Sibling "stores the new waypoint in the user region". Break: region `'XQ'`.
    - Pins `#NEW-2-3` "is a VOR, not a supplementary waypoint (5-18)" and "is listed as V on OTH 3 (5-20)". Fix: `'U'` →
      `'V'` in `VorPage.tsx:215`.
    - The longitude came out as `W 00°00.00'` in the research probe. The tests do not depend on it, but mention it in
      the report if it reproduces.

- [ ] **Step 7: verify and commit.**

```json:metadata
{"files": ["test/unit/data/navdata/IcaoBuilder.test.ts", "test/unit/data/navdata/UniqueIdentGenerator.test.ts", "test/unit/services/Timers.test.ts", "test/unit/services/TimezoneService.test.ts", "test/render/pages/right/RefNaming.test.ts", "test/render/pages/right/VorUserWaypoint.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "pins #NEW-2-1, #NEW-2-2, #NEW-2-3 turn red under their fixes, each with a sibling", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 3: messages and VolatileMemory

**Goal:** Tests for `MessageHandler`, every persistent message, the messages the harness can trigger and
`VolatileMemory` over page changes and power cycles. Pins: `#NEW-3-1` (PRESS ALT with an air data baro), `#NEW-3-2`
(DATA BASE OUT OF DATE for one tick), `#NEW-3-3` (messages survive a power cycle), `#NEW-3-4` (the ADJ window is 10 s,
not 30 s) and #94.

**Files:**
- Create: `test/unit/data/MessageHandler.test.ts`, `test/unit/data/PersistentMessages.test.ts`
- Create: `test/render/data/PersistentMessages.test.ts`, `test/render/data/Messages.test.ts`,
  `test/render/data/VolatileMemory.test.ts`

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The 10 s ADJ window characterization of the draft is replaced by the pin `#NEW-3-4`, with a passing sibling.
- [ ] The pins `#NEW-3-1`, `#NEW-3-2` (unit and render), `#NEW-3-3`, `#NEW-3-4` and #94 turn red under their named
      fixes; each has a passing sibling.
- [ ] The report states whether the MSG page marks the messages of an unseen second page as read, with the scratch
      reproduction (not committed).
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Copy the five files from `scratchpad\drafts-B\test\…`. Read `research-B.md`
  completely; the tables there name every test, literal and break. Rename `#NEW-B-1` → `#NEW-3-1`, `#NEW-B-2` →
  `#NEW-3-2`, `#NEW-B-3` → `#NEW-3-3`. The #94 pin keeps `(#94)`.

- [ ] **Step 2: MessageHandler** (section 1 table, 8 tests). Breaks MH1 to MH7. MH1 (a repost every tick) and MH3 (`seen`
  never reset) are the ones the suite misses today: confirm that both fail here.

- [ ] **Step 3: PersistentMessages, unit stage** (section 2, unit table). Use stub props through
  `buildPersistentMessages` and a real `MessageHandler`, with pages faked by `Object.create(Cls.prototype)`. Every test
  asserts the exact message list.
    - Keep everything in the table except the 10 s window test. Replace it as follows:
        - Sibling "shows ADJ NAV IND CRS TO for the first 10 s after a DTK change of more than 5°, even on course
          (characterization)": shown at 9 s.
        - Pin `#NEW-3-4` "keeps ADJ NAV IND CRS TO for 30 s after a DTK change of more than 5°, even on course": still
          shown at 25 s, gone at 31 s. Cite the YouTube timestamps of the code comment (`PersistentMessages.ts:71`),
          which the maintainer re-checked. Fix: the window constant 10 → 30 s (`PersistentMessages.ts:70`).
    - Keep "ends the window once the message is read" and "does not open the window for 5°" (characterizations). Under
      the 30 s fix they must stay green; adjust their timings if they lie between 10 and 30 s.
    - Pin `#NEW-3-1` "does not show when an air data computer supplies the baro (6-8)" with the BaroSource 0 sibling.
      Fix: skip the message when `airdata.baroSource > 0`.
    - Pin `#NEW-3-2` (unit) "stays until it is read (B-2, 3-16)". Fix: latch until seen. Its comment says it is bound to
      the persistent class and goes if the fix deletes that class.
    - Only `Date` is faked here.

- [ ] **Step 4: PersistentMessages, render stage** (section 2, render table).
    - ALTITUDE FAIL, three cases (B-1).
    - MAGNETIC VAR INVALID at 74.5 N and not at 73.5 N (5-44, B-2).
    - PRESS ALT TO SET BARO on `approachWorld()` at 40 NM, APT 8, `moveAircraft` to 29 NM, ARM_LEG asserted; gone after
      `panel.alt()` (6-8, B-3).
    - DATA BASE OUT OF DATE after SET 2 `01 JAN 27` (B-2).
    - Pin `#NEW-3-2` (render) "lists the message once (B-2)": the copies per display tick over 2 s, maximum 1. Fix: the
      persistent DB message removed from the builder.

- [ ] **Step 5: Messages** (section 4, `Messages.test.ts`).
    - The newest message first (3-16).
    - Paging with messages of 1, 3 and 3 lines (3-16; break Mb `MAX_MESSAGE_HEIGHT = 7`).
    - SET FUEL ON BOARD: shown and not shown (B-4), and again after a power cycle (characterization). Break Mc.
    - Pin `#NEW-3-3` "does not keep an unread message of the previous power-on", with the sibling "holds the message
      before the cycle". Fix: clear the active list at the power-off. Remove the word "question" from the draft's title:
      the maintainer ruled it a bug.

- [ ] **Step 6: VolatileMemory** (section 3 table, `cycle()` = `powerCycle({offSeconds})` + `approveSelfTest()` + 2 s).
    - CAL 6 keeps its time over a page change and shows the system time again after a power cycle (5-14).
    - ENR-LEG after a power cycle in OBS (3-3).
    - The approach deleted after 6 minutes off (6-5), the sibling of the #94 pin.
    - Pin #94 "keeps the approach over a power cycle of 1 minute (6-5) (#94)". Fix:
      `if (evt.timeSincePowerChange > RESET_TIME)` around `removeProcedures()`.
    - The resets to the defaults (characterization), the user magvar at 74.5 N (characterization), the flight timer
      restart (characterization).
    - "keeps the NAV 4 selected altitude and the fuel figures of TRI over a power cycle (characterization)": keep it.
      The maintainer ruled "characterize as is", and task 6 files the question.
    - The VOR page selection over a page change and a power cycle (characterizations).

- [ ] **Step 7: the MSG page check** (not committed).
    - In a scratch render test, post enough messages for two MSG pages, open MSG, leave with ENT on the first page, and
      read `hasUnreadMessages()` and the MSG light.
    - Report whether the second page's messages became read (`MessagePage.buildPages` marks every message seen at
      construction; 3-16).
    - Delete the scratch test.

- [ ] **Step 8: verify and commit.**

```json:metadata
{"files": ["test/unit/data/MessageHandler.test.ts", "test/unit/data/PersistentMessages.test.ts", "test/render/data/PersistentMessages.test.ts", "test/render/data/Messages.test.ts", "test/render/data/VolatileMemory.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "10 s ADJ window characterization replaced by pin #NEW-3-4 with sibling", "pins #NEW-3-1, #NEW-3-2 (unit+render), #NEW-3-3, #NEW-3-4, #94 turn red under their fixes, each with a sibling", "report states the MSG page seen-marking result", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 4: VNAV, MSA, alerts and audio

**Goal:** Tests for `Vnav`, `MSA`, `AltAlert`, `HtAboveAirportAlert` and `AudioGenerator`, the pins `#NEW-4-1` to
`#NEW-4-8`, and the #89 and #97 pins.

**Files:**
- Modify: `test/unit/services/Vnav.test.ts` (append the `VnavPath` draft), `test/unit/services/MSA.test.ts` (append
  the `MSAGrid` draft)
- Create: `test/unit/services/AltAlert.test.ts`, `test/unit/services/HtAboveAirportAlert.test.ts`
- Create: `test/render/services/AudioGenerator.test.ts`, `test/render/services/VnavObs.test.ts`
- Create: `test/render/pages/left/Nav4Vnav.test.ts`, `test/render/pages/left/Nav3Esa.test.ts`

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] The VNAV re-arm test is a characterization. No end-of-path test asserts that the programmed angle or the VNAV
      waypoint is kept (#73).
- [ ] The pins `#NEW-4-1` to `#NEW-4-8`, #89 and #97 turn red under their named fixes; each has a passing sibling.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Copy the files from `scratchpad\drafts-C\` to their `test/` paths. Merge
  `unit/services/VnavPath.test.ts` into `Vnav.test.ts` and `unit/services/MSAGrid.test.ts` into `MSA.test.ts`, keeping
  the existing tests. Read `research-C.md` and the VNAV section of `trainer-vnav.md`. Rename `#NEW-C-n` → `#NEW-4-n` for
  n = 1 to 8.

- [ ] **Step 2: Vnav, unit stage** (section 1, unit table). The literals use 1 NM = 1852/0.3048 ft.
    - Angles −0.8149 and −0.8408 (5-7, 5-8); +0.873 for a climb.
    - Time 753.1 s, and advisory altitudes 7437.5 and 3809.5 (5-8); a climb of 4756.3.
    - Waypoint validity (5-9, C-1); `formatDuration` (5-8, 5-9).
    - Characterizations: the 10° limit; the end of the descent and of the climb (assert only the Inactive state); disarm
      forgets the angle; and "re-arms an active descent from the present altitude".
    - The re-arm characterization's comment says that the KLN 89 trainer kept an active VNAV when the cursor came onto
      its VS field, and that the question is filed. Do not cite a manual page.
    - Pin `#NEW-4-7` "never shows 60 seconds (5-8)". Fix: round the whole duration before splitting.

- [ ] **Step 3: Vnav, render stage** (`Nav4Vnav`, `VnavObs`). Use KAAA to KDDD, held at 145 kt and 7500 ft, SEL 1900,
  offset 2. Set the NAV 4 inputs on `props.memory.navPage` after `settle` and `moveAircraft`. `cursorToAngle` is cursor
  on plus six outer clicks; assert the focused cell `{row: 5, col: 7}`.
    - The NAV 4 rows at 64.8 NM (5-7, 5-8).
    - `VNV 7500ft` on starting (figure 5-26).
    - `VNV ARMED` more than ten minutes before; the countdown `VNV IN 3:35`; `VNV 7400ft` at 31 NM (figure 5-28).
    - VNV ALERT 60 s before, but not 150 s before and not with NAV 4 in view (B-4).
    - `VnavObs`: the sibling "accepts the active waypoint in OBS mode" and pin `#NEW-4-8` "rejects a waypoint ahead in
      FPL 0 in OBS mode (C-1)". Fix: an OBS check in `isValidVnavWpt`.

- [ ] **Step 4: MSA** (section 2). The grid is read with `fs` and anchored on Everest and Aconcagua.
    - The sectors and hemispheres; the change at a whole degree (3-33).
    - Characterizations: the corner; no MSA south of 56 S and from 75 N (the enhancement issue covers the south).
    - Legs and routes (3-33, #8), and the null and one-waypoint characterizations.
    - Pins:
        - `#NEW-4-5` 180 E reads the 180 W sector. Fix: `% 360` on the column.
        - `#NEW-4-4` the end sector of a short leg counts. Fix: also sample the end point.
        - #97 the highest sector a long leg crosses. Fix: the #97 fix in `intermediatePoint`, `Math.sin((1 - f) * d)`.
    - Each pin has its geometry sibling. A pin passing for the wrong reason was found in the research: keep every
      precondition in the sibling.
    - `Nav3Esa`:
        - "ESA with a waypoint after the active one" (3-33). Break: route ESA ignored in `Nav3Page`.
        - Pin `#NEW-4-6` "NAV 3 ESA on the last leg of FPL 0" with the setup sibling. Fix: `esaAlongRoute !== null ?` in
          `Nav3Page.tsx:127-128`.

- [ ] **Step 5: AltAlert** (section 3; stub memory, settings and sensors; one `tick()` per altitude).
    - The 3, 2 and 4 tones, climbing and descending, WARN 300 and 500, no deviation tones before SEL is reached, and a
      new SEL re-arms (3-55 to 3-57).
    - Silent with ALERT OFF, without an altitude input, or when disabled by the installation.
    - Characterizations: the rounding to 4960; the tones after a deviation; switched on inside the window.

- [ ] **Step 6: HtAboveAirportAlert** (section 4; stub nav state and settings).
    - Short, long, short; the 5 NM radius; the top at elevation + offset; once while inside (3-58).
    - Re-entry alerts again (characterization: the maintainer's per-entry ruling).
    - A VOR with an `altitude` field, so that only the type check guards; the three gates (3-58, 3-59).
    - The sibling where both settings agree.
    - Pins:
        - #89 the reading half. Fix: read `htAboveAptOffset`.
        - `#NEW-4-1` the field elevation in feet, with the 1800 ft sibling. Fix:
          `UnitType.METER.convertTo(altitude, UnitType.FOOT)`.
        - `#NEW-4-2` no alert without a distance. Fix: return when `distToActive` is null.

- [ ] **Step 7: AudioGenerator** (section 5; render stage; its own `EventBus`; listen on `sound_server_play_sound`).
    - Three short tones in order, nothing after the last (3-56); the ids `kln_short_beep` and `kln_long_beep` (contract:
      the project wiki's sound setup and #141); short, long, short in order (3-58); nothing when disabled by the
      installation (3-57).
    - Characterizations: `BEEP: 4` in debug mode; a new pattern replaces the rest of a playing one.
    - Pin `#NEW-4-3` "plays an asymmetric pattern in the given order". Cite the method's doc comment. Fix: `shift()` for
      `pop()`.

- [ ] **Step 8: verify and commit.**

```json:metadata
{"files": ["test/unit/services/Vnav.test.ts", "test/unit/services/MSA.test.ts", "test/unit/services/AltAlert.test.ts", "test/unit/services/HtAboveAirportAlert.test.ts", "test/render/services/AudioGenerator.test.ts", "test/render/services/VnavObs.test.ts", "test/render/pages/left/Nav4Vnav.test.ts", "test/render/pages/left/Nav3Esa.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "VNAV re-arm is a characterization; no end-of-path test asserts a kept angle or waypoint", "pins #NEW-4-1..8, #89, #97 turn red under their fixes, each with a sibling", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 5: EFB, temporary waypoints and the cross-track helper

**Goal:** Tests for `TemporaryWaypointDeleter`, `KlnEfbLoader` and `KlnEfbSaver`; the pins `#NEW-5-1` (runway 09),
`#NEW-5-2` (user-waypoint round trip) and `#NEW-5-3` (import while hot-swap disabled); and `crossTrackNm` in `geo.ts`
with its harness test, replacing the hand-written copies in four tests.

**Files:**
- Create: `test/render/services/TemporaryWaypointDeleter.test.ts`
- Modify: `test/render/services/KlnEfbLoader.test.ts`, `test/render/services/KlnEfbSaver.test.ts` (appended)
- Modify: `test/harness/flight/geo.ts` (`crossTrackNm`), `test/unit/harness/geo.test.ts` (appended)
- Modify: `test/render/pages/left/DirectToObs.test.ts`, `test/render/services/ModeControllerObs.test.ts`,
  `test/render/services/ModeController.test.ts`, `test/flight/flights/dmeArc.test.ts`

**Acceptance Criteria:**
- [ ] Every test passes or is an `it.fails` pin; each was run against its break and failed.
- [ ] `crossTrackNm(position, through, courseTrue)` exists in `geo.ts` (positive right of course, the whole great
      circle), with the five hand-derived harness tests.
- [ ] `grep -rn "Math.asin" test/render test/flight` finds no hand-written cross-track any more. The four refactored
      files keep their assertions and fail under their recorded breaks.
- [ ] The pins `#NEW-5-1`, `#NEW-5-2` and `#NEW-5-3` turn red under their named fixes; each has a passing sibling.
- [ ] `npm test` and `npx tsc --noEmit` pass; nothing under `kln90b/` changes.

**Verify:** `npm test && npx tsc --noEmit` → all pass, no type errors.

**Steps:**

- [ ] **Step 1: start from the drafts.** Copy `drafts-D\test\render\services\TemporaryWaypointDeleter.test.ts`, then
  apply `drafts-D-modified.patch` (`git apply`; on a CRLF mismatch, copy the full files from `drafts-D\` instead). Read
  `research-D.md` completely. Rename `#NEW-D-1` → `#NEW-5-1`, `#NEW-D-2` → `#NEW-5-2`.

- [ ] **Step 2: the deleter** (Part 1 section 1). Keep the helpers `userWaypoints`, `savedTemporary` and
  `temporaryIcao`.
    - Deleted at the power-off, checked before the power-on (5-22, 5-26). Breaks D1, D2.
    - Kept when FPL 3 holds it, and OTH 3 shows ` USER WPTS ` and `TMPB  S   3` (5-22, 5-20). Break D5.
    - A user waypoint kept (5-20). Break D4.
    - The purge at boot and of the DME-arc entry `D190J` at the power cycle that removes the approach
      (characterizations). Breaks D1, D3, D7.
    - Add the characterization "deletes a temporary waypoint that is the active direct-to target once no plan holds it,
      at the power cycle". Setup: a direct-to CUST, then an EFB re-sync without CUST, then a power cycle; CUST is gone
      from the repository. Task 6 files the question; the test does not name it.

- [ ] **Step 3: the loader** (Part 1 section 2). The EFB tests cite "`CLAUDE.md` Public contract with aircraft: the EFB
  route sync" (task 6 adds that entry).
    - No departure and destination, and nothing reported deleted (contract). Breaks L3, L3b.
    - Characterizations: the four-character name (FARM, FARMA; break L4); CUST to CUSTZ exhausted with
      `WAYPOINT CUST DELETED` (break L7).
    - USR DB FULL with 250 waypoints (C-2). Break L6.
    - The 31-waypoint route loses KBBB, with `WAYPOINT KBBB DELETED` (characterization; 4-1 is the 30 limit). Break
      `slice(0, 31)`.
    - Characterization "imports a route while the unit is powered off". Break: return early in `loadRoute` while
      powered off.
    - Characterization "imports a route with WriteGPSSimVars off". There is no gate to remove, so prove it with a temporary
      gate on `output.writeGPSSimVars` in `loadRoute`.
    - Pin `#NEW-5-2` "loads a user waypoint that comes back from the EFB as that waypoint", with its sibling. Fix: in
      `loadLeg`, a `fixIcao` of region `XX` that is in the repository is returned as is.
    - Pin `#NEW-5-3` "does not import a route while the unit is disabled for hot swapping": boot with `efb: true`, set
      `L:KLN90B_Disabled` true, advance past a `SimVarSync` tick, sync KAAA–KBBB; FPL 0 is unchanged. The sibling syncs
      the same route with the LVar unset and asserts that FPL 0 holds it, plus that the disabled unit stops its ticks
      (the `SimVarSync.test.ts` observation). Cite `LVars.ts` `LVAR_DISABLE` and the wiki page "Hot Swapping and Package
      Detection". Fix: return early in `loadRoute` when `SimVar.GetSimVarValue(LVAR_DISABLE, SimVarValueType.Bool)` is
      true.

- [ ] **Step 4: the saver** (Part 1 section 3; contract: the SDK `FlightPlanRoute`).
    - A database fix by ICAO without a position (break S4).
    - A user waypoint by position as `UXX        FARM    ` (breaks S5, S8).
    - The approach: RNAV, runway `18`, transition IAFAA, destination KPRC (breaks S7, S4).
    - The SID `DEP1`, runway `27`, departure KPRC.
    - The STAR `ARR1`, transition ENRAA (break S6), the sibling of pin `#NEW-5-1`.
    - No answer with `WriteGPSSimVars` off (characterization; break S1).
    - Pin `#NEW-5-1` "sends runway 09 of an approach as 09". Fix: `RunwayUtils.getNumberString(runwayNumber)` at
      `KlnEfbSaver.ts:82`; the runway 18 test stays green.

- [ ] **Step 5: crossTrackNm** (Part 2). Add the following to `geo.ts`, with a doc comment: signed, positive right of
  course, measured to the whole great circle through `through` on `courseTrue`.

  ```ts
  export function crossTrackNm(position: LatLon, through: LatLon, courseTrue: number): number {
      const d13 = distanceNm(through, position) / EARTH_RADIUS_NM;
      const b13 = courseDeg(through, position);
      return EARTH_RADIUS_NM * Math.asin(Math.sin(d13) * Math.sin((b13 - courseTrue) * RAD));
  }
  ```

  The harness tests use R = 6378100/1852 NM, so one degree of arc is 60.10737 NM:
    - (0, 1) from (0, 0) on 000 is +60.10737; (0, −1) is −60.10737; (0, 1) on 180 is −60.10737.
    - (2, 50) on 090 through (0, 0) is −120.21474; (−2, −120) is +120.21474; on 270 it is −120.21474.
    - (−10, 3) through (40, 0) on 000 is +177.58016; on 180 it is −177.58016.
    - Abeam at 47 N, a point 2 minutes of latitude north of an east-bound course through (47, 8) is −2.003579.
    - Flat earth: 0.6 NM north and 1.2 NM east of (47, 8) on 051 is 0.28890 ± 0.0005.

  Mutations: the sign flip fails all five tests; the bearing taken at the aircraft fails tests 2 and 3.

- [ ] **Step 6: the refactor** (Part 2, "Per-copy mapping").
    - `DirectToObs` and `ModeControllerObs`: `crossTrackNm(position, wpt, course)`, with the local function and the
      unused imports removed.
    - `ModeController`: `crossTrackNm(position, abc, 100 | 77 | 0)`; the comment of 014293d reads "The deviation from
      the course 100 through ABC".
    - `dmeArc`: `const off = crossTrackNm(f.aircraft, arcen, nextCourse);`.
    - Assertions unchanged.
    - Re-run each recorded break and confirm that the refactored test fails:
        - the #154 pin and the TO-side test (c2d3566);
        - 014293d and the #122 pin (6e9c90d), plus the new break `getObsTrue() - 179` for the #122 sibling;
        - both 326da1a breaks (90e690f, fabd141).
    - Record in the report that under the "fromDtk reversed on arcs" break the flown-through bound of `dmeArc` stays
      green, and that only the circle assertions hold it.

- [ ] **Step 7: verify and commit.**

```json:metadata
{"files": ["test/render/services/TemporaryWaypointDeleter.test.ts", "test/render/services/KlnEfbLoader.test.ts", "test/render/services/KlnEfbSaver.test.ts", "test/harness/flight/geo.ts", "test/unit/harness/geo.test.ts", "test/render/pages/left/DirectToObs.test.ts", "test/render/services/ModeControllerObs.test.ts", "test/render/services/ModeController.test.ts", "test/flight/flights/dmeArc.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["every test passes or is a pin, each proven against its break", "crossTrackNm in geo.ts with five hand-derived harness tests", "no hand-written cross-track left; refactored files fail under their recorded breaks", "pins #NEW-5-1, #NEW-5-2, #NEW-5-3 turn red under their fixes, each with a sibling", "suite green, kln90b unchanged"], "modelTier": "standard"}
```

---

### Task 6: issues and close-out

**Goal:** File the bugs, question and enhancement issues, comment on #73, #89, #94 and #97, replace the placeholders,
add the EFB route sync to the public contract in `CLAUDE.md`, update `testing.md` and write the session log.

**Files:**
- Modify: test files containing `#NEW-` placeholders
- Modify: `CLAUDE.md` ("Public contract with aircraft")
- Modify: `docs/testing.md`
- Modify: `docs/test-coverage.md` (section 3 checkbox, section 4 log)

**Acceptance Criteria:**
- [ ] Filed after a search of open and closed issues with several wordings:
    - the bugs `#NEW-1-1` to `#NEW-1-7`, `#NEW-2-1` to `#NEW-2-3`, `#NEW-3-1` to `#NEW-3-4`, `#NEW-4-1` to `#NEW-4-8`
      and `#NEW-5-1` to `#NEW-5-3` (`bug` label), plus the AIRSPACE ALERT 2 NM rule, MAGNETIC VAR INVALID in OBS mode,
      and the MSG page seen-marking if task 3 reproduced it;
    - three `question` issues;
    - three `enhancement` issues.
- [ ] #73, #89, #94 and #97 have their comments.
- [ ] `grep -r "#NEW-" test/` finds nothing.
- [ ] `CLAUDE.md` names the EFB route sync in "Public contract with aircraft".
- [ ] The session log has: done, rulings, trainer and research results, bugs filed, fixes not re-broken, not covered
      (rule 18), coverage at start and end, suite totals.
- [ ] `npm test`, `npx tsc --noEmit` and `npm run coverage` are clean.

**Verify:** `npm test && npx tsc --noEmit && grep -r "#NEW-" test/` → tests pass, no type errors, grep prints nothing.

**Steps:**

- [ ] **Step 1: file the bugs** (`bug` label).
    - Each issue states what is wrong, a reproduction with observed and expected values, file and line, the impact, a
      suggested fix and the pin's test name.
    - Cite manual pages; never copy manual text. Say "found in the headless harness, not reproduced in the sim".
    - The facts are in the research reports and the implementers' reports:
        - `#NEW-1-1` CAL 7 zenith 91 (5-15; USNO);
        - `#NEW-1-2` the seconds of the CAL 7 date;
        - `#NEW-1-3` the UTC date instead of the date in the zone (if a fix goes into `Cal7Page`, the pin moves to a
          CAL 7 render test);
        - `#NEW-1-4` TRI 1, 3 and 5 take the course as the heading;
        - `#NEW-1-5` US airports without a country (3-15);
        - `#NEW-1-6` six Caribbean regions (App. D);
        - `#NEW-1-7` FIR `NY` in two cells;
        - `#NEW-2-1` D/T 4 DEP runs with the GPS clock (4-13);
        - `#NEW-2-2` REF and five-character idents (5-22; the EFB's bare ident must stay);
        - `#NEW-2-3` a user VOR is stored as SUP (5-18);
        - `#NEW-3-1` PRESS ALT TO SET BARO with an air data baro (6-8);
        - `#NEW-3-2` DATA BASE OUT OF DATE lasts one tick (B-2; also the self-test date path);
        - `#NEW-3-3` messages survive a power cycle;
        - `#NEW-3-4` the ADJ NAV IND CRS TO window is 10 s instead of 30 s (the YouTube timestamps the code cites);
        - `#NEW-4-1` the HAA adds the elevation in meters (3-58; references #35, the same unit mix-up on APT 2);
        - `#NEW-4-2` the HAA alerts without a position;
        - `#NEW-4-3` audio patterns play backwards (latent);
        - `#NEW-4-4` the ESA of a leg misses its end (3-33; independent of #97);
        - `#NEW-4-5` longitude 180 reads the filler column;
        - `#NEW-4-6` NAV 3 ESA dashes on the last leg (3-33);
        - `#NEW-4-7` the VNAV countdown shows `m:60` (5-8; same kind as #99);
        - `#NEW-4-8` VNAV accepts a waypoint ahead in OBS mode (C-1);
        - `#NEW-5-1` runway numbers below 10 go to the EFB as one digit;
        - `#NEW-5-2` a user waypoint comes back from the EFB as a new temporary waypoint;
        - `#NEW-5-3` the EFB loader imports while hot-swap disabled (the maintainer: "it must not load while
          disabled"; importing while powered off is fine).
    - Also file, without pins:
        - AIRSPACE ALERT ignores the 2 NM rule (B-1, `AirspaceAlert.ts:126`; Session 7 pins it);
        - MAGNETIC VAR INVALID is missing in OBS mode with the active waypoint outside the coverage area (5-44,
          `KLNMagvar.ts:20-22`; Session 7);
        - the MSG page marks the messages of an unseen page as read (3-16; only if task 3 reproduced it).
- [ ] **Step 2: the `question` issues.**
    - What `VolatileMemory` keeps over a power cycle. Today it resets most NAV 4, TRI, ALT and D/T state on every
      power-on but keeps the NAV 4 selected altitude, the TRI fuel flow and reserve and the Super NAV 5 range. 5-14 and
      5-15 tie only CAL 6 and CAL 7 to turn-on, and #94 is the procedure half. Name the characterization tests.
    - Temporary waypoints. The code purges at power-on as well as at power-off (5-22, 5-26 name only power-off); the
      DME-arc entries depend on the power-on run. The purge also takes an active direct-to target that no plan holds,
      while OTH 3 refuses to delete the active waypoint (C-1).
    - An active VNAV re-arms from the present altitude every display tick while the cursor stays on ANGLE
      (`Nav4Page.tick`), so below the path it flips back to `VNV IN :ss`. The KLN 89 trainer kept the advisory altitude
      when the cursor came onto its VS field during an active VNAV (medium confidence: the trainer recomputes only when
      a knob turns, and below the path was not observable). 5-8 is silent. Name the characterization.
- [ ] **Step 3: the `enhancement` issues.**
    - EFB loader: point-bearing-distance legs are dropped without a message (the SDK's Garmin loader computes the
      point); airways (`via`) are flown direct to their exit fix; a route over 30 waypoints loses its tail, the
      destination included.
    - MSA and ESA south of 56° S: the grid (`msa.json`) ends there while the unit navigates to 60° S (3-1). Research
      whether a free data source exists.
    - A read-only `L:KLN90B_AlertVolume` (0 to 99, mirroring SET 9, written at boot and on change) that aircraft can
      wire to a `<WwiseRtpc LocalVar=…>` on their `kln_short_beep` and `kln_long_beep` `AvionicSounds`.
        - Use the facts of `research-volume.md`: the framework has no volume (`PLAY_INSTRUMENT_SOUND` takes only the
          id), and G3X has a fixed message volume.
        - Precondition: one sim test that MSFS 2024 accepts an LVar RTPC inside `AvionicSounds`.
        - The wiki pages to update.
        - The stale class comment of `AudioGenerator.ts` (`tone_altitude_alert_default`).
- [ ] **Step 4: comments.**
    - #73: the leads (after a descent ends, the programmed angle and the waypoint stay; with the cursor still on ANGLE
      the state cycles), and the KLN 89 trainer result (at the end of the descent it resets its inputs; a second VNAV
      starts after a new selected altitude).
    - #89: the reading half is pinned (test name).
    - #94: pinned (test name).
    - #97: pinned at the ESA level (test name).
- [ ] **Step 5: replace the placeholders** in one commit (`references #NN …` per issue in the message). Then
  `grep -r "#NEW-" test/` must find nothing.
- [ ] **Step 6: `CLAUDE.md`.** Add a bullet to "Public contract with aircraft": the EFB route sync through the SDK
  `FlightPlanRouteManager` (the synced route is loaded into FPL 0, and the route request is answered from FPL 0 in the
  SDK's `FlightPlanRoute` format). Check that the existing EFB tests' citation matches its wording.
- [ ] **Step 7: `testing.md`.**
    - Section 4 "Geometry for expectations": `crossTrackNm(position, through, courseTrue)`, signed, positive right of
      course, the whole great circle.
    - Section 6: `AudioGenerator` is observed at the bus level (`sound_server_play_sound`); the `PLAY_INSTRUMENT_SOUND`
      call needs a `Name_Z` fake and the in-game state.
    - Section 7: those two harness gaps (`Name_Z`; `savedUserWaypoints` writes region `XX` only, so the deleter tests lay
      out `XY` strings by hand); the `dmeArc` flown-through bound does not hold the arc reversal; anything the reports
      add.
- [ ] **Step 8: the session log** in `docs/test-coverage.md` section 4 (newest first); tick Session 6's checkbox.
    - Done per task; the maintainer's rulings; the trainer and volume results; the navdata check for accents.
    - The bugs filed; the fixes not re-broken; the 4-cell placeholder note extended to NDB (`VolatileMemory.ts:307`).
    - Not covered: the spec's list plus what the reports add.
    - The coverage at the start (the spec's start state) and at the end, per directory and for the files of the area.
    - The suite totals.
    - That the coverage of the area at the start hid unheld code (the boot ran it once).
- [ ] **Step 9: run the checks and commit.**

```json:metadata
{"files": ["CLAUDE.md", "docs/test-coverage.md", "docs/testing.md"], "verifyCommand": "npm test && npx tsc --noEmit && grep -r \"#NEW-\" test/", "acceptanceCriteria": ["bugs #NEW-1-1..7, #NEW-2-1..3, #NEW-3-1..4, #NEW-4-1..8, #NEW-5-1..3 filed after duplicate search, plus AIRSPACE ALERT 2 NM, MAGVAR OBS, MSG page seen (if reproduced)", "three question and three enhancement issues filed", "#73, #89, #94, #97 comments", "no #NEW- placeholders", "CLAUDE.md lists the EFB route sync", "session log complete", "checks clean"], "modelTier": "frontier"}
```

---

## Execution notes for the controller

- Dispatch tasks 1 to 5 at once, each with `isolation: "worktree"` on Sonnet. Give each the implementer brief of the
  spec and its task section.
- Check that each report file exists before dispatching its reviewer. The reviewers run on Sonnet for tasks 1 and 2 and
  on Opus for tasks 3 to 5; re-reviews run on Sonnet.
- Before reviewing, check each task's merge base: it must be the session branch head.
- Merge in the order 2, 1, 4, 5, 3, and run `npm test` and `npx tsc --noEmit` after each merge.
- Task 6 runs in the main checkout on the session branch (it needs GitHub), on Opus. Then comes the final review of the
  whole session.
- Worktrees and branches, including the four research worktrees and the trainer and volume agents' leftovers, are
  removed only after the maintainer approves. Remove the `node_modules` junction with `rmdir` first, use
  `git branch -d`, and afterwards check `ls node_modules | wc -l` in the main checkout (79 entries today).
