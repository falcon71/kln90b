# Flight plan page and waypoint entry: design

Date: 2026-10-15. Milestone 4. Issues: #239, #240, #241, #242, #262, #289, #291, #294, #298, #319, #322, #343. Branch:
`m4-flightplan-entry`.

The milestone holds eleven bugs and one question (#343). A read-only inventory measured every suggested fix against the
full suite, and a trainer agent checked the KLN 89 trainer and the third-party AVsoftech KLN 90B trainer.

## 1. Evidence

**Maintainer rulings (2026-10-15).**
- #262: the creation page is the SUP page in its CREATE NEW WPT AT: state, with the KLN 89's flow (section 3A). Only
  the flight plan pages and D-> offer the creation; every other host of the waypoint editor keeps NO SUCH WPT.
- #239: the 90B guide's figure 6-43 wins over the KLN 89, which shows the header on top and hides the from waypoint.
- #343: the 90B follows the KLN 89: a character entered after a blank cell keeps the gap, and the ident with the blank
  is searched and can be created.
- #298: D/T 4 shows the Direct To symbol for a Direct To, whether to a waypoint off the plan or to the last waypoint of
  FPL 0. While the last leg of FPL 0 is active, it shows only the arrow. The arrow compares plan indices, not ICAOs, so
  that a destination that is twice in the plan gets no arrow while its first copy is active. (The maintainer saw the
  AVsoftech trainer draw that arrow and takes it for a fault of that trainer.)
- The designs of sections 2 to 5 were approved in chat.

**KLN 89 trainer, 2026-10-15** (agent report in the session scratchpad `trainer/report.md`; recorded in
`docs/kln89-trainer-record.md` by the first commit). High confidence.
- Unknown ident, the same on D->, FPL 0 and a numbered plan: ENT replaces the right page with the creation choices
  (`USR at:` / `User Pos L/L?` / `User Pos R/D?` / `Present Pos?`), and the left keeps the ident. `Present Pos?` ENT, or
  latitude ENT and longitude ENT, shows the new waypoint's page with `Ent` flashing; nothing is inserted yet. The next
  ENT inserts it, with the cursor on the next blank position at the end or on the following waypoint after an insert, or
  executes the Direct To. CLR on the creation choices: nothing is created; D-> shows a blank ident field, a blank end
  position keeps the cursor, an insert row is dropped with the cursor on the following waypoint. CLR on the approval:
  nothing is inserted, the user waypoint stays created.
- A character entered after a blank cell stays in its cell (`8V A`), with no autofill; the unit searches that ident and
  offers creation, and created `80 A`.
- FPL 0 with an approach header between the from waypoint and the active IAF: the header takes the top row (not used,
  see the #239 ruling).
- A full numbered plan (twenty on the 89): the inner knob asks to delete waypoint 1 to make room. Not used: the 90B
  gives FPL FULL (C-1).

**AVsoftech KLN 90B trainer, 2026-10-15** (third-party, unreliable). The unknown-ident creation page is the SUP page
with `CREATE NEW` / `WPT AT:` / `USER POS?` / `PRES POS?`, for idents of two to five characters (medium). D/T 4 shows
the Direct To symbol before the last waypoint of FPL 0 after a Direct To to it (medium-high). Its CLR does nothing on the
creation page and its D-> to a new waypoint does not execute; not used. Its REF page refused both references tried.

**Earlier trainer checks** (in the record): 2026-10-07, ACT shows no arrow at the second copy of the active waypoint
(#294), a full plan of twenty has no blank position (#241); 2026-10-08, an insertion keeps the page where it was (#319,
medium-high), and after a deletion on a numbered plan the cursor is on the waypoint that moved up (#242).

**Pilot's Guide.** 4-2 (an unknown ident on the flight plan page brings up a page that creates a user waypoint), 4-4
(insert; fewer than 30 waypoints), 4-7 (the leg symbol: head at the to waypoint, tail at the from waypoint, not shown
without usable navigation), 4-8 (the page follows the active leg; the last waypoint always shown; the blank position at
the end of FPL 0), 4-10 (the ACT pages), 4-13 (D/T 4), 5-16, 5-17 (CREATE NEW WPT AT: USER POS? / PRES POS?; lat/lon
entry), 5-19, 5-21, 5-22 and figures 5-85, 5-86 (REF), 6-23 figure 6-43 (the from waypoint above a procedure header),
C-1 (FPL FULL), C-2 (USR DB FULL; NO SUCH WPT on REF). Photo 0283863.jpg (D/T 4 after a Direct To off the plan).

**Inventory (2026-10-15).** Read-only, detached worktree at 4a631a7; report in the session scratchpad
`inventory/report.md`, patches beside it. Baseline: 3921 tests (3831 pass, 90 expected fails), `tsc` clean. No `#NEW-`
placeholders are left in the suite.
- Clean alone (only their own pins change): #322, #319, #298, #294, #289, #262 (but see 3A), #240.
- #242 also turns 11 REF tests (`RefPage.test.ts:113`, `:191`, `:210`, `:221`, `:233`, `:250`, `:284`, `:301`, `:326`,
  the `it.each` at `:365`): they pass only because #242 puts the focus on the wrong entry. With #291 applied too they
  pass. So #291 lands first.
- #291's fix alone turns only its two pins, but leaves an untested hazard: with the left cursor on during the approval,
  CLR offers `DEL` on the pending row and ENT deletes the real leg at that index. The `enterMe: CONFIRM` also stays on the
  leg and every `buildList` runs it again.
- #241's crude fix breaks `FlightplanEdit.test.ts:104` (a full FPL 0 needs its blank slot) and the FPL FULL helper's
  precondition (`FplPage.test.ts:686`, test `:722`); the numbered-only variant shows `29:FA28` in the last row instead
  of `30:FA29` (untested), because `getRowChild`, `calculateRequiredScrollIdx` and `isLastWaypointInView` assume a
  trailing blank entry (`childList.length - 2`).
- #239's suggested anchor matches the trailing blank (`origIdx -1`) on the first leg (`FlightplanList.test.ts:198`) and
  changes the Direct To characterization `FplPage.test.ts:199`. With `actIdx > 0 && !isDctNavigation()` only the pin
  changes.
- #262's suggested push passes its three pins but is a dead end: the pushed SUP page posts NO SUP WPTS, and
  `MainPage.handleEnter` gives ENT to the still-entered left editor, which pushes another SUP page. The pins assert only
  "not NO SUCH WPT".
- #289: eight faulty catch sites (the line of the `add` call): `Apt1Page:246`, `:259`, `IntPage:392`, `:427`,
  `NdbPage:193`, `SupPage:389`, `:416`, `VorPage:243`. Correct already: `RefPage:128`, `Ctr1Page:315`,
  `KlnEfbLoader:114`.
- #322: the `activeIdx === null` branch is dead (`getActiveFplIdx()` starts at -1). `toFrom` is also null on the #120
  zero-length final leg, where navigation goes on; `distToActive === null` comes only from `NavCalculator.setFlag`.
- All fixes together, without #241: exactly the 14 pins change. With the crude #241 also `FplPage.test.ts:722`, and the
  #240 pin stays green for the wrong reason (its helper breaks).

## 2. Flight plan list (#291, #242, #241, #240, #319, #239, #322)

All in `kln90b/controls/FlightplanList.tsx`, except #322 (`kln90b/controls/displays/FlightplanArrow.tsx`).

**A. REF into FPL 0 (#291).** The CONFIRM path no longer turns the left cursor off when the confirmation page appears.
The left cursor stays on while the reference waypoint waits for approval (figure 5-85) and turns off once the approval
or the rejection is done (figure 5-86). While it waits, CLR rejects it: the pending row goes, nothing is inserted, the
cursor turns off; CLR never offers `DEL` on the pending row. The pending insert runs once: `enterMe` is cleared after it
has run. The rejection by CLR is a characterization; 5-21 describes only the approval.

**B. USE? and USE? INVRT? (#242).** `FPLFirstLine.refreshButtons` returns 2 for a numbered plan with waypoints. After an
inner-knob insert the cursor is on the new blank entry (4-4); after a deletion on the waypoint that moved up (checked in
the KLN 89 trainer, 2026-10-08).

**C. A full numbered plan (#241).** A numbered plan with 30 waypoints has no blank position after the last one (4-4;
checked in the KLN 89 trainer, 2026-10-07). The last-row logic (`getRowChild`, `calculateRequiredScrollIdx`,
`isLastWaypointInView`) is reworked so that it does not assume a trailing blank entry: the last waypoint stays in the
bottom row (4-8) with and without one. FPL 0 keeps its blank slot unchanged (`FlightplanEdit.test.ts:84`, `:104`). The
FPL FULL test helper (`insertIntoFullFpl5`) is reworked in the same commit.

**D. After FPL FULL (#240).** The catch in `insertLeg` rebuilds the list from the plan as stored (4-4, C-1). The cursor
goes back to the waypoint the insert was in front of (a characterization).

**E. The scroll offset over a rebuild (#319).** A rebuild keeps the scroll offset, clamped with the list's own rule, on
every path (insert, delete, abort, procedure removal). With the cursor on, the list still scrolls to the focused field;
with the cursor off on FPL 0, the page still follows the active leg (4-8). Spec: 4-4, 4-8 and the check of 2026-10-08.

**F. The from waypoint above a procedure header (#239).** The FPL 0 scroll anchors on the row of the from waypoint (the
`FlightplanListItem` with `origWptIdx === actIdx - 1`) when `actIdx > 0` and no Direct To is flown; otherwise it keeps
`i - 1` (4-7, 4-8, figure 6-43). The KLN 89's other view is recorded, not followed.

**G. No leg symbol during a NAV flag (#322).** While the navigation is flagged (`distToActive === null`, set only by
`NavCalculator.setFlag`), FPL 0 draws no symbol in front of any waypoint (4-7). The dead `activeIdx === null` branch is
replaced by this check. The unit-test `navState` mock gains the field. `ActiveArrow` on the other pages is unchanged:
4-7 is about FPL 0.

## 3. Waypoint entry (#262, #289, #343)

**A. Creating an unknown waypoint from FPL pages and D-> (#262).**
- `WaypointEditor` gets a host option (e.g. `offerCreation`), set only by `FlightplanListItem` (every FPL) and
  `DirectToPage`. Without it the editor keeps NO SUCH WPT; the REF test `posts NO SUCH WPT for an identifier in no
  database (C-2)` holds that.
- ENT on an unknown ident: the left entry stays entered and keeps the typed ident. The SUP page is pushed on the right
  with the left page as its parent (as the waypoint confirmation is), in its `CREATE NEW` / `WPT AT:` / `USER POS?` /
  `PRES POS?` state for that ident (4-2, 5-16), the right cursor on over `USER POS?`.
- While the creation page is up, ENT goes to it, not to the left editor. `PRES POS?` ENT creates the waypoint;
  `USER POS?` opens the latitude and longitude entry, each closed with ENT (5-17); REF/RAD/DIS work as the SUP page
  already allows (5-18, 5-19).
- When the SUP page has stored the waypoint, the creation page is replaced by the normal confirmation of the new
  waypoint (its page with `ent` flashing, as for a database waypoint). ENT approves: on an FPL the waypoint is inserted
  and the cursor moves on as for a database waypoint; on D-> the Direct To is executed.
- CLR on the creation page: nothing is created; the FPL entry returns to its blank state (a blank end position keeps the
  cursor; an insert row is dropped, the cursor on the following waypoint); the D-> ident field is blank, the cursor on.
- CLR on the approval: nothing is inserted; the user waypoint stays created.
- USR DB FULL during the creation: the message posts and the creation page stays (3B).
- Turning the left cursor off or leaving the page removes the creation page with its parent.
- The pins become flow tests that assert the rows on both sides. Citations: 4-2 for the FPL creation page; the KLN 89
  trainer (2026-10-07, 2026-10-15) for the order of the steps and the CLR outcomes as the 89 showed them. The SUP type,
  the right cursor and the routing of ENT between the sides are characterizations (the 89 has one knob pair and no SUP).

**B. USR DB FULL (#289).** In all eight faulty catch sites (section 1), on USR DB FULL the page stays in its creation
state for that ident: no facility, the page memory and the cursor untouched (C-2, 5-19). One test per page type (APT,
INT, NDB, SUP, VOR), plus the existing SUP pin.

**C. A character after a blank cell (#343).** `WaypointSelector.saveChar` keeps the gap: the ident is padded with blanks
up to the cell, so `AB` with an `A` in cell 4 is `AB A`. That exact ident is searched, there is no autofill match, and
the page offers the creation for it (checked in the KLN 89 trainer, 2026-10-15). A test checks the same entry in the
D->/FPL editor (`WaypointEditor`), which the 89 showed in its D-> field. A round-trip test checks that a user waypoint
with an embedded blank survives the V2 persistence and the facility loader. **If it does not, the implementer stops and
the maintainer decides before the fix lands.**

## 4. Display pages (#294, #298)

**A. The ACT arrow (#294).** `ActiveArrow` takes an optional plan index; when it is given, the arrow shows only if it
equals `getActiveFplIdx()`. The waypoint pages pass the plan index they were built with (`idx - 1` when `idx > 0`,
otherwise none; inventory list of sites: Apt1, Apt2, Apt3ListPageContainer, Apt4 to Apt8, Int, Ndb, Sup, Vor). Pages
without a plan index (NAV 1, NAV 3, Super NAV 1, OTH 5, D/T 1 to 3) keep the ICAO comparison. Spec: 4-10 and the check of
2026-10-07. Tests: the pin (VOR) and one more page type (APT).

**B. D/T 4 (#298).** The two cells in front of the destination ident:
- the Direct To symbol (`d›`, as on the DIRECT TO page and NAV 1) during a Direct To whose target is the destination:
  off the plan (photo 0283863.jpg) or the last waypoint of FPL 0 (maintainer ruling);
- the arrow (`›`) while the leg to the last waypoint of FPL 0 is active, compared by plan index (maintainer ruling);
- blanks otherwise, including a Direct To to a middle waypoint of FPL 0 (the destination row then stays the last
  waypoint) and a first copy of the destination being active.
A test holds that a Direct To off the plan with FPL 0 holding a plan shows the Direct To symbol before that waypoint
(maintainer ruling). The ruled cases are characterizations unless the photo shows them.

## 5. Commits, lanes and testing

- One commit per issue, `fixes #NN <description>`, with its tests, its doc changes and the pin turned into a spec test
  (the `it.fails` becomes `it`, the name keeps its citation). The first commit records the trainer checks of
  2026-10-15; the second is this design; the plan follows.
- Lanes, each file with one owner, integrated linearly by cherry-pick onto `m4-flightplan-entry`:
  - A: `FlightplanList.tsx` in the order #291, #242, #241, #240, #319, #239; then #322 (`FlightplanArrow.tsx`).
  - B: #289, then #262 (both touch `SupPage.tsx`), then #343.
  - C: #294, then #298.
- Each fix is tested at the cheapest stage that observes it (mostly render). Every implementer runs the full `npm test`
  and `npx tsc --noEmit` before committing, and greps the suite for tests that depend on the bug it fixes.
- Labels: a citation supports only what its source shows. A trainer citation covers only what the 89 showed; anything
  about the 90B's second side, the SUP type, D/T 4 or REF is a characterization. Comments cite page numbers and never
  copy manual text.
- Review verifies by mutation (break the fix, the test must fail), then a final whole-branch review. Nothing is merged
  before the maintainer approves.
