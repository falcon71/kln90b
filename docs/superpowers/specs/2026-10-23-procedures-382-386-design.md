# Procedure follow-ups #382 to #386: design

Date: 2026-10-23. Issues: #382, #383, #384, #385, #386 (all filed in the milestone 5 reviews). Branch:
`procedures-382-386`.

Five independent bugs left by milestone 5 (`docs/superpowers/specs/2026-10-15-procedures-full-plan-ctr-design.md`). Each
gets its own `fixes #NN` commit with its test, its doc changes and its trainer-record bullets (CLAUDE.md). The goal is the
real unit's behavior; where no source says, the rule is a characterization and the comment says so.

## 1. Evidence

**Real navdata (AIRAC 2607, queried, not copied).**
- #382: an IAF-flagged AF leg followed by an AF leg of the same arc (navaid and radius) occurs in 106 transitions of 66
  procedures at 24 airports; every such mid-arc fix is an IAF, never a FAF or MAP. Example RPMY ILS 27: a 12 DME arc of
  LGD flown clockwise, CRIZU (319) → BODIE (355) → ANIKA (056, the only IAF) → D077L (077); the ANIKA, BODIE and CRIZU
  transitions each start at their own fix.
- #384: the issue's shape (a hold whose leg before it ends at another fix, followed by a leg to the hold's fix) does not
  occur. The common shape (a transition ending in a hold at X, the final starting at X) is already handled by #219.

**Pilot's Guide.** 6-16..6-18: an arc is one line of IAFs; the unit joins it on the present radial (the arc start when
the radial is outside the arc), names the entry as 6-6 says, and the first waypoint of the arc carries the approach (i)
(figures on 6-17); step-down points on an arc are not in the database; MOVE? recomputes the entry. 6-5 (note): CLR
steps back through an approach selection at any time. 4-5: DELETE FPL? with the left cursor off. B-2, 6-10: the OBS
reminder before a hold or course reversal.

**KLN 89 trainer, 2026-10-23** (agent check; high confidence; repeated). Full FPL 0 (20 en-route), the room question
shown after the inner-knob click on waypoint 20:
- CRSR cancels the question like CLR: FPL 0 unchanged, no insert row, waypoint 1 kept, **the cursor stays on**, on the
  waypoint where the insert was tried (a following outer knob moved it).
- CLR gives the same result as CRSR, cursor on.
- The outer and inner knobs do nothing while the question is shown; it has no timeout.
- Not checked: the STAR insert at 35.

**AVsoftech KLN 90B trainer, 2026-10-23** (third-party, unreliable; agent check). KAPA: NDB 35R and RNAV 28 (single
IAF each, so the IAF list was not reached), STARs, SIDs.
- #383: with the right cursor on a selection step (approach preview, approach replace question, STAR transition list,
  STAR preview, STAR replace question, SID transition list, SID add question), CLR stepped the right page back both with
  the left cursor off and with the left cursor on a waypoint of FPL 0; DELETE FPL? and DEL never came. Right CRSR on a
  step turns the cursor off and returns to the procedure list, so a step with the right cursor off was not reachable.
  CLR on the bare approach list turned the right cursor off; on the STAR list it did nothing (not used).
- #386: full FPL 0 = KAPA, PIKES2 SID, en-route to 29 numbered waypoints; inner knob on the first SID waypoint asked
  the room question; ENT deleted only KAPA (the SID stayed without its airport); the row opened one waypoint later,
  as an en-route waypoint between two SID waypoints. Recorded on #148; the maintainer keeps #148's rule (the airport
  takes its SID legs) and takes the trainer's result for a fault of that trainer.

**Maintainer rulings (2026-10-23).**
- #382: option 2 below. A MOVEd arc entry stays the IAF.
- #383: option B. #386: option A. #385: CRSR cancels like CLR; the cursor-on result of CLR is folded into #385.
- #148's front-deletion rule stays.

## 2. #382 A flagged fix on a DME arc: the arc entry carries the IAF

**Approaches considered.**
1. Drop the mid-arc IAF; the arc stays one arc. No point carries the IAF mark when the transition's start fix has none.
2. **Chosen.** Drop it as 1 does, and give its IAF mark to the arc entry. Matches 6-16..6-17 (the arc's first waypoint
   carries the (i)) and what the conversion already does for a transition that starts on the arc (the entry takes the
   popped start fix's mark).
3. Keep it and split the arc in two. Lets the pilot pick it for Direct To, but an aircraft past it is sent back to the
   first arc's start (6-16's outside-the-arc rule), MOVE? past it gives NO INTRCPT, and no manual page splits an arc at
   a fix.
A hybrid (3 while the fix is ahead, 1 once behind) was dropped: it is in no source.

**Behavior.** In `SidStar.filterOutDuplicates`, an IAF-flagged AF leg followed by an AF leg of the same arc
(`SidStar.sameArc`) is dropped like an unflagged step-down, and `mergeAFsIfNecessary` runs the merged arc from the start
of the whole chain, as it does today for unflagged ones. The arc entry `convertToKLN` creates gets `KLNFixType.IAF` when
the start fix it replaces (today's `originalEntry?.fixType`) or any dropped fix of that arc was an IAF. The arc's end
fix keeps its own flags. MOVE? (`SuperNav5DirectToSelector.enter`) changes the same leg's position and arc data, so the
mark stays; a test holds that.

RPMY, BODIE transition, aircraft on radial 010 or 065: `D010L(i), D077L, …` / `D065L(i), D077L, …` (today
`D010L, D010L, D077L` with ANIKA lost).

**Out of scope.** A FAF or MAP on an arc followed by more of the same arc (not in the real data) keeps today's
handling. The 6-6 naming is unchanged.

**Tests.** `test/unit/data/navdata/SidStar.test.ts`: the pin `lists a flagged step-down fix on a DME arc once …` was
written for option 3 and is rewritten to option 2 (list `D260J, ARCEN, FAFAA, MAPAA`, the entry is the IAF); the
characterization `keeps a flagged step-down on one arc as one arc (characterization, #131, #382)` goes. Add a case with
the aircraft past the dropped fix, a chain of three arc legs with the IAF in the middle (the CRIZU shape), a transition
that starts with the IAF on the arc (unchanged), and MOVE? keeping the IAF mark (unit or render, whichever reaches
`SuperNav5DirectToSelector`).

## 3. #383 CLR during an APT 7 or APT 8 selection goes to the right page

**Approaches considered.**
- A: the side whose cursor is on takes CLR first (the issue's suggestion). With both cursors on CLR still goes left, so
  a FPL 0 waypoint under the left cursor gets DEL instead of the step back, against the AVsoftech case b.
- **B, chosen:** a selection step on APT 7 or APT 8 counts as an open entry, so the existing #307 rule (a side with an
  open entry takes CLR first) sends CLR to it. Touches only those pages; fits 6-5's "at any time" and both AVsoftech
  cases.

**Behavior.** `Apt8Page.hasOpenEntry()` and `Apt7Page.hasOpenEntry()` return true while a step that their `clear()`
answers is shown (every step after the procedure list: IAF, runway and transition lists, the preview, the add and
replace questions), in addition to the base rule. The left page still takes CLR first when it has an open entry
itself. `MainPage` and `FiveSegmentPage` (the same rule for super pages) are unchanged. ENT routing is unchanged.

**Out of scope.** CLR on the bare procedure list (the AVsoftech trainer turned the right cursor off) and right CRSR on a
step (it returned to the list there).

**Tests.** Render tests on APT 8 and APT 7 with FPL 0 on the left: (a) left cursor off, (b) left cursor on a waypoint;
CLR steps the right page back and the left page shows no DELETE FPL? / DEL. The workaround in `test/README.md` (move the
left page to NAV 1 before a CLR) is described as the old bug; tests that use it may stay. Update that README paragraph.

## 4. #384 A hold dropped for a following leg to the same fix leaves its OBS reminder

**One way.** In `filterOutDuplicates`, where a leg is dropped because the next leg goes to the same fix
(`nextIsSameWpt`) and the dropped leg is a hold or procedure turn (`shouldAskObs`), the next leg is added to
`askObsLegs`, the set #219 introduced. It is the leg kept for that fix (or, when it is an AF, the arc that
`addArcInfoIfPrevIsSame` keeps in its place; follow #381's `keepObsOfArcInPlaceOf`).

**Tests.** The pin `asks for OBS at a hold dropped because the next leg goes to the same fix (B-2, 6-10, #384)` becomes
`it`; the HLDAA row of the #219 characterization is asserted (askObs true) as the issue says.

## 5. #385 The room question: CRSR cancels like CLR, and the cursor stays on

**One way** (from the KLN 89 check). On `MakeRoomPage` (both subclasses):
- Left CRSR does what CLR does (`onCancel`); the question's cursor never goes off, so a knob can no longer pop it.
- The outer and inner knobs do nothing while it is shown (check that the cursor controller cannot move to the wpt
  display or anywhere else; the knob must not reach `MainPage`'s pop-and-redispatch path).
- `FplInsertMakeRoomPage` cancel: FPL 0 unchanged, a row the insert created is removed (as today), and **the FPL page's
  cursor stays on**, on the row where the insert was tried (the waypoint, or the header or blank end position for those
  inserts). Today it turns the cursor off.
- `ProcedureMakeRoomPage` cancel: unchanged apart from taking CRSR (it pops; nothing was changed).
How CRSR reaches the page (a page-level hook in `MainPage`'s `EVT_L_CURSOR`, or the page's cursor controller refusing
to toggle) is the builder's choice; prefer the smallest change that keeps the other pages' CRSR as it is.

**Tests.** Render: CRSR on the question for an FPL 0 insert, a header insert and a procedure load; CRSR then each knob;
the cursor-off test `turns the left cursor off after CLR on the question (characterization, #380)` becomes a cursor-on
test citing the 2026-10-23 trainer check, at the row of the insert. `docs/architecture.md` (the #380 paragraph: "CLR
turns the cursor off") changes with it. The KLN 89 results go into `docs/kln89-trainer-record.md` as a new
2026-10-23 block.

## 6. #386 An insert whose SID was deleted for room becomes an en-route waypoint

**Approaches considered.**
- **A, chosen:** in `EditableFlightplan.askRoom`'s `deleteAndContinue` (`controls/FlightplanList.tsx`), when the
  pending row is remade and its procedure (`pending.leg` copied from a SID or STAR row) is no longer in FPL 0 after the
  deletion, remake it as an en-route row (`leg` undefined), as a header insert is. This is what the direct path already
  gives (the insert lands in front of the new first waypoint, which is en-route), and matches the AVsoftech result's
  `:` separator.
- B: never delete the pending row's own airport (`keep`), FPL FULL instead. Rejected: the question says DELETING WPT 1,
  and the AVsoftech trainer asked and deleted.

**Behavior.** "No longer in FPL 0": no leg of FPL 0 has the same procedure and parent airport as `pending.leg`. The
room is computed again for the new type on the retry (an en-route row counts toward the 30), which `retry` already
does through `roomSteps(type)`; check that `type` is recomputed, not the SID type captured before the deletion.

**Tests.** Render, the issue's reproduction (FPL 0 = KPRC, a SID, en-route to 45 legs; ENT on the first SID waypoint
opens the row; inner knob; ENT): the new waypoint is an en-route leg at the front, KPRC and the SID are gone, no SID
header over it. A STAR-typed pending row whose STAR stays is unchanged. The AVsoftech bullets go into the 2026-10-23
block of `docs/kln89-trainer-record.md`.

## 6b. #413 The merged arc starts at its first segment when the arc's end fix is also the final's IF

Added to this batch by the maintainer on 2026-10-23, after the #382 review found it (pinned there with `it.fails`).
In the PHNY shape (the transition ends with an arc to X, the final starts with `IF X`) `filterOutDuplicates` keeps the
IF, `addArcInfoIfPrevIsSame` replaces it with the transition's AF, and `mergeAFsIfNecessary` is called with the IF's
index, so the walk never reaches the earlier segments of the arc. **One way:** start the walk at the AF leg actually
kept (`i - 1` when `addArcInfoIfPrevIsSame` returned the previous leg). The pin becomes `it`. Real data: MDST D29 SGO,
WMKP D22-Z KAPKO (with an IAF on the arc). Spec: 6-16, 6-18.

## 7. Order and constraints

- Commits: #384, #382 (`SidStar.ts`), #383 (`Apt7Page`, `Apt8Page`, `test/README.md`), #385 then #386 (both in
  `FlightplanList.tsx` and `FlightplanEdit.test.ts`). Each commit adds its own bullets to the 2026-10-23 trainer-record
  block (the first one that needs it creates the block).
- `npx tsc --noEmit`, `npm run build` and `npm test` green after each commit.
- No public contract changes (H events, LVars, panel.xml keys, SimVars, persisted formats).
- Manual references by page number only; nothing copied from the manuals; navdata identifiers only as examples.
