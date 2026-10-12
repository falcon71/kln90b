# ENT and CLR: design

Date: 2026-10-12. Issues: #118, #244, #248, #273, #284, #286, #307, #310, #316, #317, #333, #334, #335, #358, #359.
Branch: `ent-clr`.

The session started from the ENT and CLR issues the maintainer named (#118, #244, #273, #286, #307, #310, #316,
#335) and took in the related issues that share their code or their flow: #334 (tangled with #335), #333 (the same
MSG overlay branches), #317 (the third key on the DEL question of #316), #248 (the same `Set1Page.setWpt` as #244)
and #284 (the same `WaypointConfirmPage.enter` and INT page as #286). #358 was found while planning (the right page
of the OTH 3 question is popped unconditionally) and is fixed here because #316 and #317 would reach it. #291 (REF on
FPL 0) stays out: it is tangled with the cursor focus of #242 and needs its own session.

## 1. Evidence

**KLN 89 trainer, 2026-10-12** (this session; recorded in `docs/testing.md` section 8 with the fixes):
- **USR 2 without a reference VOR (#286).** A user waypoint about 2000 NM from every VOR of the demo database shows
  Ref, Rad and Dis as dashes. The cursor reaches all three. A typed radial or distance is accepted: the field shows it,
  the `Ent` prompt goes, the cursor moves on, and no message appears (medium confidence for the message: a very short
  one could have been missed). The waypoint does not move, and after leaving the page and coming back Rad and Dis are
  dashes again. High confidence otherwise.
- **SET 1 ident (#244).** With no edit open, CLR on the ident changes nothing (no blank field, no `Ent`, no waypoint
  page), and the ENT after it changes nothing either. During an open ident edit, CLR brings the old ident back.
  After an ident, ENT, ENT the cursor goes straight to `Ok?` (#248, confirming the 2026-10-07 check). High confidence.

**Earlier trainer checks**, each recorded in its issue and in `docs/testing.md` section 8: #307 (CLR during an open
edit, 2026-10-08), #310 (CLR while a typed FPL waypoint waits, 2026-10-08), #317 (the outer knob on a DEL question,
2026-10-08), #273 (CLR back to the approach and STAR lists, 2026-10-07, medium), #284 (the cursor on Rad after the
Ref approval, 2026-10-07), #333 and #335 (T1 to T4, 2026-10-09).

**Pilot's Guide:** 3-29 (CLR blanks the Direct To field), 4-2 (CLR while the waypoint page of a wrong FPL ident
shows), 4-5 and 5-20 (the DEL question on FPL pages and OTH 3), 3-14 (the right side returns to its page once a
waypoint page shown for a decision is answered), 3-18 (SET 1), 5-19 (INT and SUP creation by reference), 3-27, 3-39
and 3-55 (D-> and ALT), 3-32 (Super NAV 1), 3-12 and 3-13 (the page order), 6-5 (APT 7 and APT 8).

## 2. ENT errors reach the error page (#118)

ENT starts an async chain, and these places drop its promise without a catch: `MainPage` (`handleEnter`),
`SixLinePage.enter` (the overlays: SET 0, Super NAV 1, Super NAV 5), the `FourSegmentPage` and `FiveSegmentPage`
containers, `WelcomePage`, `FlightplanList` (the two `.then` chains after an item's `enter()` and
`confirmCurrentValue()`) and `DirectToPage` (`confirmCurrentValue()`). A throw on that path is an unhandled rejection
that never reaches the `ErrorPage`.

**Design.** A small helper, `reportErrors(promise, bus)`, attaches the same handling the synchronous try/catch in
`KLN90BCore.onInteractionEvent` gives the other keys: `console.error`, and `error` published on the bus for an
`Error`. It lives next to `ErrorEvent` in `controls/ErrorPage.tsx`. Each of the places above calls it on the promise
it drops today.

Deeper drops stay as they are and are documented in `docs/testing.md`: an async `enterCallback` that `Editor.enter`
and `WaypointEditor.currentValueConfirmed` do not await (for example `RefPage.calcRef`), `onCharChanged`, and the async
selections of APT 7 and APT 8. Catching those would mean awaiting them, which changes when ENT completes. The return types of `onInteractionEvent` stay
`boolean`; nothing about timing or order changes. (A central catch through a `boolean | Promise<boolean>` return type
was considered and rejected: a wider interface change, and a type that invites `if (onInteractionEvent(...))`.)

A future async ENT site could forget the helper; the harness's unhandled-rejection collector fails any test that
leaves one, which is the safety net.

**Docs.** `CLAUDE.md` and `docs/architecture.md` keep their sentence (input errors are shown) and lose nothing;
`docs/testing.md` drops the ENT trap in section 6 and answers the #118 question under "Boot, power and the unit as a
whole". The harness collector stays.

**Pins.** The #286 pin asserts only `takeRejections()` is empty. After this fix the throw becomes an `error` event
and that pin would pass for the wrong reason, so the #118 commit adds `expect(unit.errors).toEqual([])` to it.

## 3. Editors and waypoint approvals

**#307, CLR during an open edit.** `Editor.isClearAccepted()` returns `isEntered`, and `Editor.clear()` calls
`setEntered(false)` while an edit is open: the old value comes back, the `ent` prompt goes, the cursor stays on the
field, and a following ENT finds nothing to accept. Without an open edit, CLR is not accepted, as today.
`WaypointEditor` keeps its own CLR (blank the ident and wait for an ENT, 3-29) by default.

The pages that handle CLR themselves (Super NAV 5, SET 0, APT 7, APT 8, FPL with the cursor off) hold no editor that
can have an open edit while their CLR runs; ACT delegates to its inner page.

**CLR priority.** `MainPage` gives CLR to the left page first, so a left page that answers CLR wins over an open edit
on the right: FPL with its cursor off asks `DELETE FPL?` while the pilot meant to close a RAD entry on INT. As ENT
already does with `isEnterAccepted`, CLR goes first to a side whose focused field is entered (an open edit, a DEL
question, a waypoint waiting for approval), the left side when both are; otherwise the order stays left, then right.
The same rule applies to the `FiveSegmentPage` container.

**#244, CLR on the SET 1 WPT field.** `WaypointEditor` gets a constructor option that turns its blanking CLR off;
with it set, the editor falls back to the base `Editor` CLR of #307. SET 1 sets it. CLR during an open ident edit
then restores the old ident, CLR without an edit is not accepted (nothing changes), and `null` never reaches
`Set1Page.setWpt`. Direct To, the FPL pages and REF keep the blanking CLR.

**#248, the cursor to `CONFIRM?`.** When `Set1Page.setWpt` receives a waypoint, it focuses `CONFIRM?`. It is the last
field, so the `outerRight()` that `CursorController.enter` runs after a `Handled_Move_Focus` leaves it there. A test
holds this coupling.

**#310, CLR while a typed FPL waypoint waits for approval.** `FlightplanListItem.isClearAccepted()` and `clear()`
accept CLR while the item has no waypoint but its waypoint editor waits for a confirmation, and hand it to
`WaypointEditor.clear` (as the Direct To page does). The waypoint page closes and the blank position stays under the
cursor; the ENT that follows confirms the blank, which ends the insert and adds nothing
(`EditableFlightplan.insertLeg` rebuilds the rows from the plan). On the trailing blank row the cursor stays on that
row. An insert in the middle loses its row, so this ENT returns `Handled_Keep_Focus` and the cursor rests on the
waypoint that followed the insert instead of jumping past it. The host copies the editor's `isEntered` after
forwarding CLR.

**#286, RAD or DIS without a reference VOR.** `IntPage.setRad`/`setDist` and the same methods of `SupPage` keep the
typed value for display and change no position while the reference is `null`; they no longer read `this.ref!`. The
editor's `Handled_Move_Focus` moves the cursor on, as in the trainer. The kept value lives on the page, so it is gone
when the page is left, again as in the trainer. The creation path (`createIfReady`) is checked for the same
assumption.

**#284, the cursor to RAD after the REF approval.** `WaypointConfirmPage.enter` serves editors on the right side.
After `callingEditor.currentValueConfirmed()` returns `Handled_Move_Focus` (which pops the confirm page), it moves the
right page's cursor on with `outerRight()`, which is what `CursorController.enter` does on the left, but only when
the right page's focused field is the calling editor. `RefPage` does not mark its editor as right-side, and the REF to
FPL flow can bring a left editor to this page, so the side cannot be read from `pageSite`. This covers INT and SUP
(also inside ACT); on REF the editor is the only field, so the cursor stays; NAV 4's VNAV waypoint moves on to its
distance.

## 4. The DEL question (#358, #316, #317)

**#358, the right page popped twice.** `WaypointDeleteListItem` pops the right page whenever its question is withdrawn,
but a right knob may already have closed that page (it has no cursor, so `MainPage` pops it and hands the knob on);
the second pop throws `Cannot pop the base page`. One helper pops the page only while the right page is still the one
the item pushed; `setFocused`, `clear` and the `enter` of #316 use it.

**#316, ENT on OTH 3's question.** `WaypointDeleteListItem` overrides `enter`: while its question is open it pops the
waypoint page it pushed on the right, then deletes through `SimpleListItem.enter`. Its second CLR and the cursor
turned off already pop that page.

**#317, the outer knob on a question.** In `CursorController.outerRight`/`outerLeft`, when the focused field is
entered and refuses the knob (returns `false`), the controller unfocuses the field, which withdraws the question
(and on OTH 3 pops the right page), and then moves the cursor as usual. On the first or last field the question goes
and the cursor stays. `FlightplanListItem.outerRight`/`outerLeft` return `false` while `isDeleting` instead of passing
the knob to the waypoint editor.

Other fields also return `false` for the outer knob (`SelectField`, `NearestSelector`, `ObsDtkElement`, `Button`,
`FlightplanList`, the Mod 2 and OTH 5 pages). The plan checks each for an entered state other than a question, which
would now lose the cursor on an outer turn.

## 5. The MSG overlay (#334, #335, #333)

**#334, the super page removed by its instance.** `OverlayStack` gets `remove(type)`, which takes the super page of
that type out wherever it lies, and `checkIfSuperPageIsShown` uses it instead of `popOverlayPage()`. An MSG page above
a super page stays; the super page under it goes. This covers Super NAV 1, Super NAV 5 and SET 0.

**#335, D-> and ALT on the MSG page.** The `EVT_DCT` and `EVT_ALT` branches close the MSG page first when it is on
top; the rest of each branch is unchanged. On the 89 an ENT on a blank Direct page returns to the page before, while
the 90B stays; that difference stays out of scope, as in the issue.

**#333, the knobs and CRSR on the MSG page.** In the knob and CRSR branches of `MainPage.onInteractionEvent`, an MSG
page on top is popped and the event dispatched again, the pattern pushed pages already follow (#56). CLR on the MSG
page stays ignored (T4). Scanning on the MSG page was not observed and stays unchanged.

**Order.** #334 is fixed before #335: the #335 fix also turns the #334 pin red, so the other order would leave a red
commit.

## 6. APT 7 and APT 8 (#273)

Each CLR step back of `Apt7Page.clear` and `Apt8Page.clear` hands the rebuilt list page the entry chosen there, and
the page comes up with the cursor on, on that entry: on APT 7 the SID or STAR list, the runway list and the
transition list; on APT 8 the approach list and the IAF list. The trainer observed two of these returns (the approach
list from the waypoint list, the STAR list from the runway list); the pins cover the IAF and transition lists by
analogy. A cursor activated inside `redraw()` lands one field early (noted in the issue), so the focus is set once the
page's fields exist. The plan checks whether `ActPage` shows these pages in the ACT tree.

## 6b. CLR on a right-side waypoint awaiting approval (#359)

Found by the final whole-branch review and added to the session at the maintainer's request. While a waypoint editor
of a right page (REF on INT, SUP and REF, the VNAV waypoint of the right NAV 4) waits for the approval of its waypoint
page, the right page is the `WaypointConfirmPage`. It has no cursor and no CLR of its own, so the #307 priority cannot
see the open entry and CLR goes to the left page; with FPL 0 on the left and its cursor off, CLR asks `DELETE FPL?`.

**Design.** `SixLineHalfPage` gets `hasOpenEntry()`, by default its cursor controller's `hasEnteredField()`, and the
CLR priority of `MainPage` (and of the `FiveSegmentPage` container) asks the pages instead of their controllers.
`WaypointConfirmPage` answers `hasOpenEntry()` with true when its calling editor belongs to a right-side page (the
parent the confirmation was shown for is not the current left page), and its `clear()` then hands CLR to that editor,
whose own CLR applies (the default blanking CLR: the waypoint page goes, the field blanks and waits for ENT, as on
DIRECT TO, 3-29, and on FPL, #310). A left-side editor awaiting approval keeps its CLR as before (the left side holds
the entered field); the REF to FPL confirmation, whose calling editor is on the left with the left cursor off, keeps
its current CLR (that flow is #291's).

The behavior on the real unit is not recorded for REF; 4-2 step 7 (CLR on a wrong identifier's waypoint page) covers
the FPL case, so the tests are characterizations that state the analogy.

## 7. Testing

- One `fixes #NN` commit per issue, with its tests and doc changes, in this order: #118; #307, #244, #248, #310, #286,
  #284; #358, #316, #317; #334, #335, #333; #273; #359. Every commit keeps `npx tsc --noEmit`, `npm run build` and `npm test`
  green.
- Each fix turns its `it.fails` pin into `it`; the issue number stays in the name.
- New tests: an ENT error reaches the `error` topic and no rejection is left (#118, for the half pages and an
  overlay); SET 1 CLR without an edit changes nothing, and CLR during an open ident edit restores the ident (#244,
  2026-10-12 trainer); CLR closes an open edit on the right while FPL with its cursor off is on the left (#307); RAD
  and DIS without a reference on SUP (#286); the question withdrawn on the last field (#317); a right knob, then CRSR
  or a second CLR on the OTH 3 question, without an error (#358); an ENT that confirms the blank of a middle insert
  leaves the cursor on the following waypoint (#310).
- Labels follow `docs/testing.md` section 5: a test cites the manual page or the dated trainer check that says what it
  asserts, or it is a characterization.
- **Before the plan:** each issue's temporary fix is applied in a throwaway worktree and the whole suite is run, to
  find every test that depends on one of these bugs. The plan gives each affected test file one owner.

## 8. Not changed

No public contract changes: H events, LVars, panel.xml keys, GPS SimVars, the EFB sync and the persisted data stay
as they are, so the wiki needs no change.
