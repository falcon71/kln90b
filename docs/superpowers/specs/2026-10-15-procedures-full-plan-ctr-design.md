# Procedures, full-plan loading and CTR: design

Date: 2026-10-15. Milestone 5. Issues: #131, #148, #219, #220, #221, #222, #274, #301, #347, #348, #349, #376, #377, #380.
Branch: `m5-procedures`.

The milestone held nine bugs and two questions (#220, #221). The inventory found two more bugs (#376, #377) and the
trainer checks a third (#380); the maintainer added all three. A read-only inventory measured every candidate fix
against the full suite, and a trainer agent checked the KLN 89 trainer and the third-party AVsoftech KLN 90B trainer.

## 1. Evidence

**Maintainer rulings (2026-10-15).**
- #131: two arcs on one navaid with different radii stay two arcs; the end of the first arc stays a list waypoint, and
  the second arc starts at a generated entry at its published beginning.
- #220: the MAHP is derived only when the missed approach ends in a hold (HA, HF, HM); that hold leg is the MAHP.
- #221: the KLN 89 model, scaled to the 90B: FPL 0 holds at most 30 en-route waypoints and at most **45** waypoints in
  total with SID, STAR and approach legs (the 89's 20 and 35, with its 15 waypoints of room for procedures kept). The 45
  is a characterization; no 90B source gives a total.
- Making room: an addition that would pass a limit asks first, one question per waypoint to delete; a procedure load
  deletes nothing until the last question is answered with ENT.
- #274 covers APT 7 too: replacing a SID or a STAR asks first, like the approach.
- #348/#301: back to the start state, as the AVsoftech trainer does.
- #380: its question page is a page class of its own, not the procedure-load page (an abstract base class for both is
  fine).
- `APPROVE?` and `CONTINUE?` flash, as every focused button does.
- Sections 2 to 6 were approved in chat.

**KLN 89 trainer, 2026-10-15** (recorded in `docs/kln89-trainer-record.md`, block "night"; agent report in the session
scratchpad `trainer/report.md`). High confidence.
- Approaches list IAF, FAF, MAP, MAHP with their suffixes, the MAHP last and once; a MAP at the navaid repeats that fix
  as the MAHP (`MSNm`, then `MSNh`).
- A replace question before an approach replaces the loaded one (also the same approach, and one to another airport,
  where it is the only question); the same on APT 7 for a STAR. CLR goes back to the preview with the cursor on the add
  choice; ENT replaces and shows FPL 0 with the cursor off. Replacing a STAR drops waypoints inserted into it.
- Two limits, 20 en-route and 35 in total. Approaches and STARs come on top of the 20. A waypoint inserted in front of a
  STAR row is a STAR waypoint (`.`) and counts only toward the total; in front of an approach row the add is invalid.
  Passing either limit asks, on the first inner-knob click and before any ident, to delete one waypoint to make room;
  ENT deletes waypoint 1, CLR cancels; one question per waypoint. No load in the demo database needed room.
- The demo database has no SID.

**AVsoftech KLN 90B trainer, 2026-10-15** (third-party, unreliable).
- CTR 1 and CTR 2 reset when the left page turns to another plan and back, and at once on a plan edit; a right-page
  round trip keeps the computation.
- Replace questions `PRESS ENT / TO REPLACE / EXISTING / APPROACH / APPROVE?` (and `STAR`) under the procedure name.
- A load whose airport is missing from a full FPL 0 asks on the left page `DELETING / WPT 1 / TO MAKE / ROOM IN /
  FLIGHTPLAN- / CONTINUE?`; an insert into a full FPL 0 asks the same on the first inner-knob click.
- Not used: it offered waypoint 1 while it was part of the active leg, moved a Direct To, counted a STAR toward 30,
  deleted two waypoints for one insert, and its STAR question's CLR went to an empty page.

**Pilot's Guide.** 4-1 (30 waypoints per plan), 4-4 (a waypoint may be added to a plan of fewer than 30), C-1 (FPL FULL
for a full plan whose first waypoint is part of the active leg; INVALID ADD; INVALID REF), 5-21, 5-22 (REF), 5-25 to
5-27 (CTR; NOT ENOUGH ROOM IN FPL), 6-5 to 6-7 (approach header, suffixes, no added or deleted approach waypoints, CHANGE
APR?, the approach in front of the airport), 6-10 and B-2 (the OBS reminder before a hold or course reversal), 6-16 to
6-18 (DME arcs, entry names, MOVE?, step-downs on one arc), 6-22, 6-23 (SID after and STAR before the airport; SID/STAR
waypoints may be added and deleted; changing the procedure drops those edits).

**Sim data (#220 comment, 2026-10-15).** The sim sets no `FixTypeFlags.MAHP` on any leg; HKKI RNAV 24 ends
`CA, DF TEXAV, HM TEXAV` with bit 32 on both TEXAV legs, which nothing reads.

**Inventory (2026-10-15).** Read-only, detached worktrees at 431da17; report and patches in the session scratchpad
`inventory/`. Baseline: 4003 tests (3930 pass, 73 expected fails), `tsc` clean.
- Pins: #131 `SidStar.test.ts:719`; #219 `SidStar.test.ts:869`; #148 `FlightplanUtils.test.ts:240`,
  `FlightplanEdit.test.ts:148`; #274 `Apt8Page.test.ts:118`; #222 `Apt8Page.test.ts:255`, `Apt7Page.test.ts:230`; SID
  pin naming #148 and #222 `Apt7Page.test.ts:283`; #301 `Ctr2Page.test.ts:202`. #221 is held by the characterization
  `Apt8Page.test.ts:198`.
- Vehicles: the counting change breaks the setups `Apt8Page.test.ts:243`, `Apt7Page.test.ts:219`, `:274` and the
  characterization `Apt8Page.test.ts:198` (each expects a 30-leg plan); the two #222 pins read `slice(24)` of what then is
  a 32-leg plan. #148's index fix alone breaks `Apt7Page.test.ts:274`. #301 changes `VolatileMemory.test.ts:188` (a
  whole-object `toEqual` of `ctrPage`). #348 checked at ENT changes `Ctr1Page.test.ts:346`, which uses an edit between
  the two ENTs to reach the #161 room check. Publishing from `removeProcedures` on every power-on shifts the seeded
  `GpsAcquisition.test.ts:197` and `:203` (the SDK planner draws random numbers); publishing only when legs were removed
  changes nothing.
- Clean alone (only their pins): #219 (but an AF kept leg must stay an arc), #131, #349, #220 variant (a).
- `ActiveWaypoint` follows FPL 0 lazily: on the next getter it keeps a Direct To by instance and otherwise re-picks the
  leg nearest the aircraft (`assertToMatchesFplIdx`). Deleting front legs keeps the active leg in normal geometry.
- The left FPL page instance is stable while the pilot stays on it (cursor, `refreshFpl`, pages pushed on the right);
  every knob step, a procedure load, USE? and the EFB load create a new one; a page pushed on the left is what
  `getLeftPage()` returns while it shows.
- Nothing else in the code has a fixed size of 30. With FPL 0 past 30, the GPS SimVars `GPS FLIGHT PLAN WP COUNT` and
  `WP INDEX` (`Sensors.ts:442-448`) report the larger numbers; row numbers pad to two digits.

## 2. Procedure conversion (#376, #219, #220, #131)

All in `kln90b/data/navdata/SidStar.ts`, tested in `test/unit/data/navdata/SidStar.test.ts`.

**A. No writes into the SDK legs (#376).** `getKLNApproachLegList` and `getKLNProcedureLegList` copy the leg list once
(`{...leg}` per leg) before filtering; `mergeAFsIfNecessary`, `addArcInfoIfPrevIsSame` and the later fixes change only
the copies. Tests convert the same procedure twice, and a second transition after the first, through one shared
facility object, and assert identical results (the two reproductions of #376).

**B. The OBS reminder of a hold that follows its fix (#219).** When `filterOutDuplicates` drops an unflagged HA, HF, HM or
PI leg as a repeat of the last kept leg, the kept leg asks for OBS. A kept AF leg stays an arc: its end waypoint gets
the reminder, its arc data is unchanged. Spec: B-2, 6-10.

**C. The MAHP (#220).** If the last leg of the missed approach is an HA, HF or HM leg with a fix, that leg is the MAHP
(on the copy). The unflagged leg to the same fix before it is then dropped as today, so the holding point shows once,
with the MAHP suffix and the OBS reminder (6-5 to 6-7, 6-11). A missed approach that ends otherwise gets no MAHP. The
sim's own MAHP bit is still honored. New tests use the sim's shape (no flags, `CA, DF X, HM X`); existing fixtures that
set `FixTypeFlags.MAHP` stay. The characterization that lists the MAP and the holding point at one fix twice
(`SidStar.test.ts:924`) matches the 89 check of 2026-10-15 (`MSNm`, `MSNh`).

**D. Two arcs of different radius (#131).** Two AF legs merge only when the navaid (`originIcaoStruct`) is the same and
the radius (`rho`) differs by at most 0.1 NM (step-downs on one arc, 6-18). Otherwise the first arc ends at its own end
fix, which stays a list waypoint, and the second arc gets an entry waypoint at its published beginning (its begin
radial and radius), named as 6-6 names arc entries; a straight leg joins the two. `convertToKLN` does not pop the end of
the previous arc for this second arc, and `getArcEntryData` gets a way to place the entry at the beginning instead of
abeam the aircraft. MOVE? (6-17) is unchanged. How the real unit joins two radii is not described (a characterization).

## 3. FPL 0 capacity and making room (#221, #148, #222, #380)

**A. Two limits (#221).** FPL 0 holds at most 30 en-route waypoints (legs of type USER) and at most 45 legs in total. A
numbered plan holds at most 30 (it has only en-route waypoints). A waypoint inserted in front of a SID or STAR row is a
SID or STAR leg, as today, and counts only toward the 45. `Flightplan.insertLeg` refuses a leg that would pass either
limit (the backstop); the limits live beside `MAX_LEGS`. CTR 1 counts both limits (section 6).

**B. Making room (#148).** An addition that would pass a limit deletes legs from the front of FPL 0, one waypoint at a
time, until both limits hold:
- "Waypoint 1" is the first leg. An airport deleted from the front takes the SID legs that follow it (same
  `parentFacility`) in the same step.
- The airport of the procedure being loaded is never deleted to make room.
- If a leg to delete is part of the active leg (the from or to leg; during a Direct To the target) the addition gives
  FPL FULL and nothing changes (C-1). With no active leg every leg may go.
- The insert index is corrected by the number of legs deleted in front of it (`Math.max(0, idx - k)`).
REF's insert keeps deleting without a question; the procedure loads (3C) and the FPL 0 insert (3E) ask first and then
delete by this rule. Spec: 4-4, C-1; the deletion itself is a characterization.

**C. Procedure loads (#222).** APT 8 and APT 7 decide the room before changing anything:
- Procedure legs never cause a deletion of their own; they count toward the 45. Room is needed for the airport the
  load adds (en-route) and for the total.
- The old procedure of the same type is removed in the same step, so its legs free room.
- If room cannot be made (3B): FPL FULL, FPL 0 unchanged, the old procedure included.
- If room is needed: after the add question (unchanged) or the replace question (section 4), the left page shows
  the room question once per waypoint to delete; ENT on the last one deletes them and loads; CLR on any of them cancels
  the load with FPL 0 unchanged. The right page stays where it is.
- The load is one batch: remove the old procedure, delete the front legs, add the airport (first for a SID, last
  otherwise), insert the legs in order (a SID after its airport, a STAR before an approach, an approach before its
  airport), one `flightplanChanged`. The FPL FULL path publishes once.
- Pages afterwards as today.
Spec: 6-5, 6-7, 6-22, 6-23 for the order. The room question, its text and the 45 are characterizations; the KLN 89
check covers procedures on top of the en-route limit.

**D. The room question pages.** An abstract base page draws `DELETING / WPT   1 / TO MAKE / ROOM IN / FLIGHTPLAN- /
CONTINUE?` (AVsoftech text) with the cursor on a flashing `CONTINUE?`. Two subclasses, one per context:
- the procedure-load page (3C), pushed on the left with the APT page as its parent; its ENT and CLR call back into the
  load. Because a right knob step does not remove it, ENT checks the room and C-1 again before deleting.
- the FPL 0 insert page (#380, 3E).

**E. Adding a waypoint to a full FPL 0 (#380).** On the FPL 0 page, the inner-knob click that would open an insert row
(in front of a row or at the blank end) first checks the limits for the leg it would insert (en-route or SID/STAR). If
it would not fit and room can be made, the insert page shows on the left instead; ENT deletes one waypoint (3B) and asks
again if one is not enough, then opens the insert row in front of the same waypoint; CLR cancels with the plan
unchanged and the cursor off (AVsoftech). If room cannot be made, the row opens as today and ENT gives FPL FULL (C-1,
#240's path). REF and CTR inserts are unchanged. Spec: the 89 check for the question and its place (first click, before
an ident); the 90B text and the cursor after CLR are characterizations.

## 4. Replace questions (#274)

- **APT 8.** When FPL 0 holds an approach (to any airport), ENT on LOAD IN FPL shows a new `Apt8ReplacePage`: the
  approach name, then `PRESS ENT / TO REPLACE / EXISTING / APPROACH / APPROVE?`, the cursor on a flashing `APPROVE?`. It
  comes for the same approach too, and it is the only question when the airport is missing.
- **APT 7.** The same with a new `Apt7ReplacePage` when FPL 0 holds a procedure of the type being loaded: `STAR` or
  `SID` in the fourth line. A SID load while a STAR is loaded (and the reverse) asks nothing.
- CLR goes back to the preview with the cursor on LOAD IN FPL; FPL 0 unchanged. ENT continues with the room check (3C)
  and the load; the pages afterwards as today.
- Spec: the 89 check for the approach and the STAR (the question, the same procedure, CLR back to the preview, ENT
  replaces). The 90B wording, the SID question and the cross-type case are characterizations.

## 5. The flight planner mirror (#347)

`Flightplan.removeProcedure` and `removeProcedures` publish `flightplanChanged` when they removed at least one leg and
publishing is enabled. `load` filters the procedures itself and publishes once. Test: the issue's render setup in
`test/render/services/WTFlightplanSync.test.ts` (plan 0 of the `"kln90b"` planner after DELETE APR).

## 6. CTR and REF (#301, #348, #349, #377)

**A. Stale computations (#301, #348).** `memory.ctrPage` also stores the left FPL page instance and a copy of the plan's
leg list from the computation. One shared check runs in the display ticks of CTR 1 and CTR 2 and at CTR 1's insert ENT:
when the left page is not that instance or the legs differ (by instance or count), the state goes back to the start
(CTR 1: PRESS ENT TO COMPUTE CTR WPTS; CTR 2: its empty page). A computation that finishes after such a reset is
discarded. The #161 room check at insertion becomes unreachable and goes; `Ctr1Page.test.ts:346` becomes the #348 test
(an edit between the two ENTs offers the computation again). `VolatileMemory.test.ts:188` takes the new keys. Spec: 5-26
for leaving the plan page; the reset on an edit is a characterization (AVsoftech).

**B. Room (with #221).** CTR 1 refuses with NOT ENOUGH ROOM IN FPL when the new Center waypoints (en-route) would pass 30
en-route or 45 in total (5-26); it never deletes.

**C. No waypoint inside an approach (#349, #377).** A shared helper says whether a waypoint may be added on a leg: not
when its from and to legs are both approach legs. CTR 1 drops crossings on such legs; REF skips them when it looks for
the closest leg and gives INVALID REF when no leg is left (5-21, C-1). The leg into the IAF and the leg from the missed
approach to the airport stay eligible. Spec: 6-7.

## 7. Commits, lanes and testing

- One commit per issue, `fixes #NN <description>`, with its tests, its doc changes and its pin turned into a spec test
  (the `it.fails` becomes `it`, the name keeps its citation). The first commit records the trainer checks; the second
  is this design; the plan follows.
- A commit keeps the suite green: it updates the tests that used its bug or the old model as their vehicle and says so
  in the message. #221 changes the premise of the two #222 pins for an approach and a STAR (FPL 0 no longer makes room
  for procedure legs): they become #221 spec tests of the order, and the commit says `references #222`; #148 turns the
  SID pin and says `references #222`; #222's commit is the load rewrite of 3C.
- Lanes, each file with one owner, integrated linearly by cherry-pick onto `m5-procedures`:
  - A: #221, #148, #222, #274, #380 (`Flightplan.ts`, `FlightplanUtils.ts`, `Apt7Page.tsx`, `Apt8Page.tsx`, the new
    pages, `FlightplanList.tsx`/`FlightplanListItem.tsx` for #380, the two count lines of `Ctr1Page.tsx`).
  - B, in parallel: #376, #219, #220, #131 (`SidStar.ts`).
  - C, after A: #347, #301, #348, #349, #377 (`Flightplan.ts` for #347, `Ctr1Page.tsx`, `Ctr2Page.tsx`,
    `VolatileMemory.ts`, `RefPage.tsx`, the helper in `FlightplanUtils.ts`).
- Each fix is tested at the cheapest stage that observes it. Every implementer runs the full `npm test` and
  `npx tsc --noEmit` before committing, and checks the suite for tests that depend on the bug it fixes (apply the fix,
  run everything).
- Labels: a citation supports only what its source shows. The 89 check covers the 89's behavior (two limits, the
  question and its place, the replace question for an approach and a STAR); the 90B numbers and texts, anything on the
  90B's second side, and every AVsoftech observation are characterizations. Comments cite page numbers and never copy
  manual text.
- Review verifies by mutation (break the fix, the test must fail), then a final whole-branch review. Nothing is merged
  before the maintainer approves.
- **Public contract:** FPL 0 may now hold more than 30 legs, so `GPS FLIGHT PLAN WP COUNT` and `WP INDEX` can pass 30.
  The wiki page on accessing the flight plan (and any page that states 30) needs a note; the maintainer edits the wiki.
