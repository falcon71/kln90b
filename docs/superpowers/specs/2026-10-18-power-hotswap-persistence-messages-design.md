# Power, hot swap, persistence and messages: design

Date: 2026-10-18. Milestone "Power, hot swap, persistence and messages" (GitHub milestone 10). Issues: #92, #101,
#125, #138, #141, #175, #187, #259, #330, #331, #350, #351, #353, #397, #398. Branch: `m10-power-persistence`.

The milestone held eleven bugs and two questions (#125, #351). A read-only inventory measured every candidate fix
against the full suite and found more bugs; at the maintainer's request #397 and #398 were filed and added to the
milestone, and two more cases went as comments on #175 (stacked copies after repeated SET 2 entries) and #187 (user
waypoints of other types, temporary waypoints). A fifth candidate, a blanked remark keeping its airport on OTH 4, is
not a bug: the KLN 89 record shows an airport whose remark is blanked staying in the remarks list.

## 1. Evidence

**Maintainer rulings (2026-10-18).**
- #138: while the unit is disabled for hot swapping, every H event is ignored, the power and brightness events
  included. Its power then follows only the electricity SimVar.
- Hot swap state: `L:KLN90B_Disabled` is read only by `SimVarSync`'s 100 ms poll, which keeps the state; the gates read
  the kept state, never the SimVar (reading it again is expensive).
- #259: test in the trainers whether the value is kept at all; if it is, it becomes a user setting. The AVsoftech
  trainer kept it, and ALERT ON/OFF too: both become user settings in #259.
- #101: fix the loader and say in the release notes that data converted already stays wrong. No repair code.
- #141: the default becomes false (public panel.xml contract; release notes and the wiki page panel.xml customization).
- #175: the latch fix, decided after the trainer check.
- #187: a lat/lon leg naming a user (XX) or temporary (XY) waypoint the unit still holds comes back as that waypoint,
  matched by region and ident whatever the type, with the unit's stored position. A deleted one is created anew.
- #351: a read persistent message stays read over a power cycle.
- #125: the self-test page stays editable while the GPS is valid; SET 2 keeps its lock (3-53).
- The new bugs: #397 and #398 filed into this milestone; the #175 and #187 cases as comments.
- Sections A and B were approved in chat; section C was settled by the four answers above.

**KLN 89 trainer, 2026-10-18** (trainer agent; report in the session scratchpad `trainer/report.md`).
- SET 2 date moved past the data base end (init date inside it): a flashing message prompt within about 1 s, one entry
  on the message page; after reading it the prompt was gone and the page had no message. With the date already past
  the end at power-up, and after moving SET 2 back into the period, no message (#175).
- SET 2 time entry: the seconds start at 00 at ENT (high; #397). The 2026-10-09 check T11 saw the same on the
  initialization page (#331).
- The initialization date and the SET 2 date and time stay editable while the unit navigates (#125).
- Not observable: a lasting message over its relaunch (the condition does not survive it, #351), the altitude alert
  (the 89 has none, #259), an indicator course (#330).

**AVsoftech KLN 90B trainer, 2026-10-18** (third-party, unreliable).
- Its power button, off for about 10 s: the read `OBS WPT > 200NM` stayed listed and the prompt stayed steady in
  inverse on the self-test page and after approval, twice (#351).
- ALT: WARN 500 with ALERT ON, and ALERT OFF with WARN 700 behind it, both kept over a power cycle (#259).
- Self-test page with no message and the HSI course well away from 315°: no message prompt (#330). Messages that exist
  already show there.
- Time entries on the self-test page and SET 2: the seconds kept running (its clock and hours are erratic; the KLN 89
  decides, #331, #397).
- It never showed a data base message; its data base page ignores the date (#175).
- The self-test date and time are editable; it shows no GPS state on that page (#125).

**Pilot's Guide.** 3-6 (self-test time entry: hours and minutes), 3-16 (the prompt flashes while a message is unread),
3-47 (remarks for 100 airports), 3-53 (SET 2 date and time locked while the satellites supply them), 3-55 (the warn
altitude entered only the first time), figure 3-4 (the self-test page without a message prompt), B-2 (the data base
message after a date entry), C-2 (RMKS FULL).

**Inventory (2026-10-18).** Detached worktree at master 7228811; report, patches and probes in the session scratchpad
`inventory/`. Baseline: 4442 tests pass, among them 24 `it.fails` (23 pins and one harness self-test). Every pin of
this milestone still fails; #350 and #353 have none yet but reproduce in a probe. The candidate fixes together change
the tests named below; their effects add up, with one interaction (section 4).

## 2. Hot swap (#138, #350, #353, #398)

**A. The kept state.** `Hardware` (`kln90b/Hardware.ts`) gets `isDisabled`, beside `isScanPulled`: being swapped out
is the device's physical state, and `Hardware` exists from the construction of `KLN90BCore`, before every consumer.
`SimVarSync` receives `hardware`, sets `hardware.isDisabled` in `setDisabled` and drops its own `disabled` field. It
stays the only reader of `L:KLN90B_Disabled`. The gates lag the LVar by at most one 100 ms poll, as the tick
controller and the GPS release already do. Introduced in the #138 commit.

**B. H events (#138).** `KLN90BCore.onInteractionEvent` returns first thing while `hardware.isDisabled`: no scan
remap, no `hEvent` publish, no `PageManager`. The pin becomes a spec test of the public contract (the maintainer's
ruling). New tests: a `Power_Off` H event while disabled leaves the unit on after the resume; the scan toggle while
disabled changes neither `L:KLN90B_RightScan` nor the remap; a brightness event changes nothing. Vehicle:
`SensorsOut.test.ts` "zeroes the outputs of a unit that is switched off while it is disabled for hot swapping" switches
off through `Input.ElectricitySimVar` instead.

**C. GPS OVERRIDDEN on a power change (#350).** `SensorsOut.reset()` skips `setGpsOverriden()` while disabled
(`Sensors` passes `hardware` to `SensorsOut`). The claim on the resume stays in `SimVarSync.setDisabled`. Tests next to
the #137 tests in `SimVarSync.test.ts`: the circuit off and on while disabled keeps `GPS OVERRIDDEN` 0 (the H event path
is closed by B and is tested there), and the resume claims it. No existing test changes.

**D. The EFB route request (#353).** `KlnEfbSaver.handleAvionicsRouteRequested` returns early while disabled.
`KlnEfbLoader.loadRoute` (#188) reads the same flag instead of the LVar. A spec test next to "leaves a route request
unanswered with WriteGPSSimVars off (characterization)" in `KlnEfbSaver.test.ts`; the #188 test holds the loader.

**E. The flight planner (#398).** `WTFlightplanSync` writes nothing while disabled, whatever asks it (the
`WriteGpsSimvars` toggle in `SimVarSync.tick`, a flight plan change such as the procedure removal at a power-on after
more than 5 minutes off). `SimVarSync.setDisabled(false)` syncs once when `writeGPSSimVars` is on. Tests: the toggle
while disabled writes nothing; a flight plan change while disabled writes nothing; the resume writes FPL 0 once.

Order: #138 (A and B), #350, #353, #398, then #187 (same loader file).

## 3. Persistence and the EFB (#92, #101, #141, #187, #259)

**A. The seeded random sequence (plain commit, before #92 and #259).** The SDK's `UserSetting` draws `Math.random()`
once per setting it builds, so every new key shifts the seeded sequence the harness sets before the boot.
`GpsAcquisition.test.ts` "seed 15 ... 45 s" and "seed 4 ... over 90 s" fail with #92 (90 keys) and #259 (two keys).
The harness re-seeds right after the user settings are built, so the GPS draws no longer depend on the number of keys.
The two seeded tests are checked against their stated timings and re-seeded if needed.

**B. Remarks (#92), one commit.**
- `saveRemarks` refuses with `RMKS FULL` only a new ident with remarks when 100 airports hold remarks
  (`Object.keys(...).length`); changing or deleting the remarks of a listed airport always works.
- `NUM_REMARKS` becomes 100: the new keys `rmk10` to `rmk99` default to "", no key changes meaning.
- `saveAllRemarks` writes "" to every unused slot, so a deleted remark does not come back.
- The three unit pins and the APT 5 pin become spec tests (3-47, C-2). The exact key-list pin in
  `KLN90BUserSettingsSaverManager.test.ts` takes the new keys. New tests: a change and a delete in a full list work.

**C. V1 longitudes (#101).** `UserWaypointLoaderV1.deserializeLon` reads `substring(21, 24)`. The pin becomes a test.
The final report names it for the release notes: data converted by 2.2 or later stays wrong.

**D. The alerter default (#141).** `Output.AltitudeAlertEnabled` defaults to false. The 31 tests that relied on the
old default (ALT, SET 5, SET 8, SET 9, the field components, the self-test beeps, the parser and harness tests; list in
the inventory) state `ALTITUDE_ALERT(true)` or the key explicitly. `docs/architecture.md`, `test/harness/panelXml.ts`
and `test/README.md` state the new default. The pin becomes a test. Last task of the milestone (it touches files of
sections 3 and 4).

**E. The EFB round trip (#187).** `KlnEfbLoader.loadLeg`: a lat/lon leg whose `fixIcao` has region XX or XY and an
ident that the facility repository holds comes back as that waypoint, whatever type `fixIcao` names (the saver sends
every user waypoint as type U), with the stored position. Otherwise a new temporary waypoint, as today. Tests: user
waypoint FARM (the pin), a user VOR, a temporary waypoint over two round trips, a moved waypoint (stored position
wins), a deleted waypoint (created anew), and an airport ICAO with the same ident that is not user data.

**F. The ALT alert (#259).** Two new user settings, `altAlertEnabled` (default false) and `altAlertWarn` (default 300),
replace `AltPageState`; `VolatileMemory.reset` no longer touches them. `AltPage` and `AltAlert` read and write the
settings. Tests: WARN 500 and ALERT ON survive a power cycle (3-55 for WARN; the AVsoftech trainer, unreliable, for
both), ALERT OFF survives with the WARN behind it, and a new boot with stored settings shows them. Vehicles: the key-list
pin, three `AltAlert.test.ts` tests that set the memory field, `AltPage.test.ts` "offers the warn altitudes 200 to 900
ft in 100 ft steps (3-55)", and the #192 characterization in `VolatileMemory.test.ts`, which no longer asserts ALERT
OFF. The VolatileMemory pin is rewritten against the settings (the field it read is gone, so it would turn red for the
wrong reason). A comment on #192 records that ALT is
decided.

## 4. Messages and the self-test (#175, #330, #331, #351, #397, #125)

**A. DATA BASE OUT OF DATE (#175).** `DatabaseOutOfDateMessage` latches at the change from current to expired and
holds until it is seen; `Database` no longer posts its one-time copy on `timeUpdatedEvent`. The latch tolerates
`MessageHandler.tick` evaluating a listed persistent message twice per tick. Result: one copy on every path (SET 2,
self-test entry, the GPS correction, expiry while running), kept until read, and none when the validity did not change
(no stacking). Both pins become spec tests (B-2, 3-16; the KLN 89 check). Vehicle: `Database.test.ts` "is posted when
the new time is past the expiration (B-2)" moves to the persistent message or goes with the subscription. New tests: a
repeated SET 2 entry lists one copy; a date already past the end lists none.

**B. ADJ NAV IND CRS during the self-test (#330).** `AdjustCourseToWithObsReadingMessage` gets the nav page state and
returns false while `isSelfTestActive`, before `lastCourse` is touched. The pin becomes a spec test (figure 3-4; KLN 89
T8; AVsoftech). New tests: after approval with a readable indicator off the DTK the message shows; with the indicator on
the DTK it does not.

**C. Seconds at a time entry (#331, #397).** A helper on `TimeStamp` sets hours and minutes with the seconds and
milliseconds at zero. `SelfTestRightPage.saveTime` uses it (#331), then `Set2Page.saveTime` (#397), one commit each.
The #331 pin becomes a spec test (3-6; KLN 89 T11); #397 gets a spec test in `Set2Page.test.ts` (3-53; KLN 89, 2026-10-18).

**D. A read message over a power cycle (#351).** `MessageHandler.clear()` empties the list and no longer resets
`seen`. A persistent message whose condition still holds at the first tick after the power-on is listed again as read;
one whose condition lapsed is reset by `tick` as today. The two characterizations (`MessageHandler.test.ts`,
`Messages.test.ts`) become tests of the ruling (AVsoftech, unreliable, cited for what it showed).

**E. The self-test date and time (#125).** No code change. A characterization in `SelfTestRightPage.test.ts` holds
that the date and time are entered on the self-test page while the GPS is valid (both trainers accept the entry on
their power-up page). The commit `fixes #125` closes the question.

Order: #175, #330, #351 (messages), #331, #397, #125 (self-test and SET 2).

## 5. Execution

- Branch `m10-power-persistence` from master. First commits: this design and a dated 2026-10-18 block in
  `docs/kln89-trainer-record.md` (KLN 89 results; AVsoftech results marked unreliable), then the plan.
- Lanes touch disjoint files and run in parallel:
  - H hot swap: #138, #350, #353, #398, #187.
  - P persistence: the harness re-seed, #92, #259, #101.
  - M messages and self-test: #175, #330, #351, #331, #397, #125.
  - Then #141, after P and M.
- One fresh worktree agent per task, starting with `git merge --ff-only m10-power-persistence`. Each task is one
  commit (`fixes #NN`; the harness commit a plain sentence) with its test and doc changes; after review it is
  cherry-picked onto the integration branch at once.
- Every condition a task adds has a named test that turns red when the condition is dropped; reviewers check by
  mutation in the implementer's worktree. Test titles cite only what their source literally shows: the 90B guide pages,
  the KLN 89 for what it observed, the AVsoftech as unreliable, the maintainer's rulings as rulings.
- Each task runs `npm test`, `npx tsc --noEmit` (in the main checkout after the cherry-pick) and `npm run build`.
- Public contracts: #138, #350, #353 and #398 change hot swap behavior (no H event, LVar or key renamed); #141 changes
  a panel.xml default; #92 and #259 add user setting keys with defaults. The wiki pages Hot Swapping and Package
  Detection and panel.xml customization need the same changes; the maintainer edits the wiki. Release notes: #141,
  #101, the hot swap changes.
- Close-out: a final review of the whole branch, then a local merge into master once the maintainer approves. No push.
