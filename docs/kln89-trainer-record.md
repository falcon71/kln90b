# KLN 89 trainer record

A dated record of the checks made on the KLN 89 trainer, the evidence that decides where the KLN 90B Pilot's Guide is
silent ([test/README.md](../test/README.md), section 5). Each block is true on its date: a new check adds a block, and an old
block is not edited. The trainer runs in a virtual machine that the maintainer starts. Each check is paraphrased, with
its confidence where it was not high and the issue it led to. The 89 has one knob pair, a four-line screen and its own
layout, so section 5 of the testing guide decides how far a check counts for the 90B.

A test cites a check as "checked in the KLN 89 trainer, *date*", and the checks of 2026-10-08 and 2026-10-09 by id as
well (`T4`). The two days have separate series that both start at T1, so a `T<n>` is read together with the date on
its line, in the comment above it or in the title of its `describe`.

**2026-10-06**
- With turn anticipation on, a waypoint passed about 3.5 NM abeam at 240 kt was sequenced (#157).
- After a Direct To a waypoint of FPL 0, inserting a waypoint in front of the target kept the Direct To on the target
  at its new index (#149).
- Right after power-up, D-> prefilled the active waypoint from a waypoint page and from NAV 1 (#119).
- OBS to LEG on the FROM side re-activated the plan leg with its DTK and kept the deviation, TO (#155); LEG to OBS on a
  short leg took the DTK and kept the deviation.
- The approach modes cannot be observed: ARM and ACTV are external annunciators the trainer does not draw, and its demo
  approach never armed (#162 and #163 stay open).
- VNAV (medium; the trainer recomputes VNAV only when a knob changes a value): with VNAV active, moving the cursor onto
  the vertical speed field changed nothing, while from Inactive the same move starts VNAV; 400 to 500 ft above the path
  VNAV stayed active. At the end of the descent the 89 goes Inactive and resets its inputs, and a new selected altitude
  starts a second VNAV at once, while the 90B code keeps the angle and the waypoint (#194, the comment on #73).
- The third-party AVsoftech KLN 90B trainer, which is unreliable: in APR before the FAF the GPS APR switch gave ARM, and
  APR was back within about 2 s, as in the code (#162).

**2026-10-07**
- The outer knob stops at the first and the last cursor field on FPL 0 and SET 2 and never wraps (#218).
- Scanning from an ident without a match offers no CREATE NEW WPT and scans from the last waypoint the entry matched
  (#202). Approach waypoints do not count against the 89's twenty, and an approach loaded whole without a message
  (#221). Returning to ACT always shows ACT 1, while APT and SET remember their page. NRST APT lists airports within
  200 NM only (#207).
- Durations never show `:60`, the hour rolls over; NAV 1 truncates the ETE to whole minutes (medium-high).
  Coordinates never show `60.00'`; from `59.99'` the next value is the next whole degree. Degrees below 10 are padded
  with blanks, with zeros only inside an open edit field (#230).
- SET 1: after the ident and two ENT the cursor goes straight to `Ok?` (#248); CLR then ENT on the ident has no visible
  effect (medium, #244).
- FPL pages: the waypoint before the active one goes to the top row (medium-high); a full plan has no blank position
  after its last waypoint (#241); approach waypoints are not stored when FPL 0 is copied; the `?` of the delete prompt
  stands in a fixed column after a five-cell ident field.
- OTH: the user waypoint list shows the lowest plan number, `0` for FPL 0, and an arrow at the active waypoint (#253);
  the remarks list is sorted by ident.
- OBS: one degree per click; north shows `000`, never `360`, and the course wraps (#263).
- DUPLICATE WAYPOINT: a header row with the ident and the column titles, then one row per waypoint (#258). A Direct To
  an unknown ident offers the creation of a user waypoint, not `NO SUCH WPT` (#262).
- Radials on the intersection and user waypoint pages are magnetic with the reference VOR's own variation, on display
  and on entry; four published intersections fit within 0.05° (#280, #281). A changed REF recomputes RAD and DIS at
  once (#279); after REF, ENT, ENT the cursor is on RAD (#284); distances are padded with blanks and carry the small
  `nm` (#282, #283); DIS accepts 400.0 and 999.9 (#288).
- The user waypoint page without user waypoints shows `0` and the creation choices without a message; the first click
  on a blank selector cell gives `A` (medium, #290).
- Nearest pages: with the cursor parked on the rank, the page follows the new nearest at rank 1 (#268); distances below
  10 NM show without a leading zero (#266, the 90B figures decide).
- Procedures: CLR on the question that adds a STAR and its airport returns to the waypoint list, and steps back one list
  at a time (#271); the cursor stays on the chosen procedure after CLR (medium, #273); a second approach asks before it
  replaces the first (#274); the cursor starts on the first procedure; an airport whose remark is blanked stays in the
  remarks list.
- NDB frequencies on a whole kHz show without `.0` (medium, #287). On FPL 0 the DTK beside the active waypoint is the
  leg's DTK (#297), a repeated active waypoint has no arrow at its second copy (#294), and the type letter sits in a
  fixed column (medium); ACT with nothing active shows its text and no message (#293).
- Not answerable on the 89: the map page, the fuel efficiency format, the alert values over a power cycle, names with
  words inside words and the APT 7 page order.

**2026-10-08** (the series T1 to T35)
- **T1:** the outer knob stops at the first and the last cell of an open edit, and the edit stays open (#306).
- **T2:** CLR during an open edit brings the old value back, the cursor stays on the field, and a following ENT does
  nothing (#307).
- **T3:** the cursor button during an open edit turns the cursor off with the old value back.
- **T4:** every cell and block wraps in both directions; calculator values change without ENT.
- **T5:** ENT on a partly filled field counts the dashed cells as 0.
- **T6:** the first inner click of an ident entry gives `A` and the first matching ident (#311).
- **T7:** after the cursor is turned off and on, the 89 comes back on the first field; a note, because 4-3 implies that
  the 90B remembers the field.
- **T8:** the open longitude edit shows the hundreds digit (`E008°`), and the entered value is padded with blanks
  (#304).
- **T9:** the latitude tens offer 0 to 8 only, so 90° cannot be entered (#303).
- **T10:** a radial of 360.0 cannot be entered; the largest is 359.9.
- **T11:** SET 1 gives back the offered and the entered heading unchanged after the confirmation (#309); the ground
  speed is `005` while open and `  5kt` entered (#245).
- **T12:** the remark charset has a hyphen between 9 and the blank (#305), and the first click on an empty remark line
  gives `A` (#311).
- **T13:** the variation tens offer 0 to 9; a manual variation of 0 shows a blank tens place.
- **T14:** the CAL 7 heading is one three-digit block that wraps between 359 and 000 (the layout is the 89's).
- **T15:** the CAL 3 hour wraps from 23 to 00; its minutes are one block (the layout is the 89's).
- **T16:** 993 mB shows with a blank in front (#315).
- **T17:** the seconds restart at 00 after a time entry.
- **T18:** CLR during the FPL 0 confirmation returns to the blank position with the cursor on it, and the next ENT adds
  nothing (#310).
- **T19:** CLR during the Direct To confirmation of a typed ident, then ENT, cancels the Direct To.
- **T20:** duplicate idents on a waypoint page: not done.
- **T21:** on an FPL delete question (a) the outer knob drops the question and moves the cursor on (#317), (b) the
  inner knob opens an entry in front of the waypoint, and (c) after ENT the cursor is on the waypoint that moved up
  (#242).
- **T22:** on the delete question of the user waypoint list (a) a second CLR drops it, (b) the outer knob drops it and
  moves the cursor to the entry above (#317), and (c) the inner knob is ignored (medium).
- **T23:** a scrolled list stays scrolled when the cursor is turned off; the cursor comes back on the top visible entry.
- **T24:** the 89 shows no waypoint page during a deletion (#316 rests on the 90B guide, medium).
- **T25:** the delete question's `?` stands in a fixed column (#318).
- **T26:** CLR twice on the approach header brings CHANGE APR? back and keeps the approach.
- **T27:** the inner knob on the approach header opens an en route entry in front of it.
- **T28:** an insertion in a scrolled FPL 0 leaves the page where it was (medium-high, #319).
- **T29:** with an unseen message on the second MSG page, leaving after the first page keeps the prompt flashing (#191).
- **T30:** MSG without messages shows a page with a one-line text of the 89's own (#325).
- **T31:** the prompt while the MSG page shows cannot be asked; the 89's MSG page covers the whole screen.
- **T32:** the trip calculator shows an ETE below an hour as `0:31` (#324).
- **T33:** an airport below sea level cannot be asked; the trainer's database has none.
- **T34:** a bearing goes from 359 to 0 and never shows 360 (medium-high), padded `  0°` (#263).
- **T35:** a position of exactly zero shows `N` and `E` (#308).

**2026-10-09** (the series T1 to T12)
- **T1:** D-> on the message page shows the Direct page at once and the message page is gone; the field holds the
  active waypoint, or is blank with none. ENT returns to the page before; no nearest airport is involved (#335).
- **T2:** ALT on the message page shows the first altitude page at once; leaving the altitude pages returns to the
  page shown before MSG (#335).
- **T3:** the knobs on the message page close it and act on the page beneath: the outer knob the page group, the inner
  knob the page (medium-high for the inner knob) (#333).
- **T4:** CLR on the message page is ignored; the cursor button closes it and brings back the page beneath with its
  cursor on (#333).
- **T5:** with the cursor on a prompt, the inner knob does nothing in either direction (medium, #336).
- **T6:** ALT, then D->, then CLR on the empty field returns to the altitude page; the 89's stacking of its two altitude
  pages differs.
- **T7:** the 89's power-on page shows for about 5 s; it says nothing about the 90B's Turn-On time.
- **T8:** no message prompt appeared while the 89's self-test page showed; it has no readable course and no status line
  there (#330).
- **T9:** not observable: the 89's self-test page has no baro or altitude field.
- **T10:** the 89's data base page is a full screen without mode or prompt; figure 3-24 shows a status line, and the
  90B guide decides.
- **T11:** opening the time entry clears it; after ENT the clock starts from the entered hour and minute with the
  seconds at zero (medium-high, #331).
- **T12:** everything changed was restored by a relaunch.

**2026-10-11**
- ENT that accepts a pending entry (the value in inverse with the `Ent` prompt) moves the cursor to the next field:
  SET 1 latitude, ground speed and heading, SET 2 date and time, the CAL 1 To ident, the user waypoint latitude.
- ENT on a field whose value changes as the knob turns does nothing, and the cursor stays: CAL 4 Ind, CAL 1 GS, the
  ALT 2 selected altitude, the APT 1 ident (#354). The maintainer saw the same on CAL 4.
- ENT that accepts the last field of SET 2 (Mag Var) leaves no cursor on the page: the next outer click changes the page
  group and the next inner click the page, as with the cursor off, while the status column still shows `*CRSR*`.
  Finishing a user waypoint turns the cursor off. The 90B guide decides for the last field of a page: the pilot turns
  the cursor off with CRSR after ENT (5-17, 3-47), so the cursor stays on (#218).
- Not observable: the 89's self-test page has no baro, so its ENT over the baro digits (3-6, 3-7) cannot be checked.
- The third-party AVsoftech KLN 90B trainer, which is unreliable: ENT on each self-test baro digit moved the cursor on
  to the next one and from the last to APPROVE?, whether the digit was changed or not.
- The maintainer: neither trainer remembers the cursor field. Turned off and on, the cursor starts on the page's first
  field; the AVsoftech trainer starts its self-test page on the baro and on the date after the cursor is turned off and
  on, and its Super NAV 5 always on the map scale (#355).
- Numbered flight plans (#356): CRSR puts the cursor on the first field on the page. That is the blank first waypoint
  of an empty plan, also right after `Delete FPL?` (CRSR skips `Copy FPL 0?`), and `Use?` on a plan with waypoints,
  whether the page was left or not, and also after a plan was built on the page from empty. Copying FPL 0 into a
  plan turns the cursor off. The 89 keeps its header on the top line while the rows below scroll, so it cannot show the
  case 4-3 describes. The unreliable AVsoftech trainer, whose header scrolls off as on the 90B, put the cursor on the
  top visible waypoint of a long plan built on the page.

**2026-10-12**
- SET 1 ident: with no edit open, CLR changes nothing (no blank field, no `Ent` prompt, no waypoint page) and the ENT
  after it changes nothing either; during an open ident edit CLR brings the old ident back (#244, like #307). After the
  ident, ENT, ENT the cursor goes straight to `Ok?` (#248).
- USR 2 of a user waypoint about 2000 NM from any VOR of the demo database: Ref, Rad and Dis are dashes and the cursor
  reaches all three. A typed radial or distance is accepted (the value shows, the `Ent` prompt goes, the cursor moves
  on, no message; the message is medium confidence) but the waypoint does not move, and after leaving the page Rad and
  Dis are dashes again (#286).
- ALT and the message page, run by the maintainer: ALT showed the first altitude page, MSG the message page, ALT the
  second altitude page, MSG again, ALT closed the altitude pages, MSG again, ALT showed the first altitude page once
  more. So ALT on the message page acts on the altitude page cycle beneath it, which the 90B, with its single ALT
  page, has as a toggle (#335).
- ETE minutes (#223): CAL 1 rounds to the nearest minute (every reading where rounding and truncation differ came out
  rounded, among them about 59.9 minutes shown as `1:00`); NAV 1 truncates (`0:03` for 3.7 to 3.5 NM at 59 kt, and the
  minute drops as the distance passes 3.0) and shows seconds below one minute (`:ss`). The 90B's figures round (5-7),
  so the unit keeps rounding everywhere; the 89's NAV 1 is recorded, not followed.
- Distances of 1000 NM and more (#341): a waypoint 1000 NM or more from its entered reference is accepted with no
  message; its distance shows as whole NM (`1323nm`, `8768nm`, `10011nm`). The four-digit distance places of the
  waypoint pages and the NAV 2 reference line show 1000 to 9999 NM as digits and dashes from 10000 NM on. Side finding
  (medium-high): the distances match the WGS-84 ellipsoid and the long-range bearings a sphere (#364).
- The variation of a reference that is not a VOR (#280): the radial is the true initial bearing at the reference minus
  the unit's own variation model at the reference's position (about 15.4 E for a user waypoint at 45 N 120 W; 4.2, 5.4
  and 3.8 W for an airport, an NDB and an intersection near Chicago; a user waypoint at the NDB's position gave the
  NDB's value). Any waypoint type is accepted as the reference.
- NAV 2 with the Ref set to a VOR far away (#339): the radial is the true initial bearing at the VOR minus the VOR's own
  published variation, rounded to whole degrees (309 NM from ORD: 86 shown, the final bearing at the aircraft would
  give 90; 427 NM from RHI: 116 shown, the final bearing 122).

**2026-10-14**
- VNAV programmed to a waypoint after the active one (FPL 0 KORD, KUGN, KENW, KMKE, KENW, KUGN active, VNAV to KMKE),
  then OBS: at the next VNAV recompute the state went inactive and the VNAV waypoint showed the active waypoint; no
  message. Back in LEG the programmed waypoint did not return. The same with the descent already active; VNAV to the
  active waypoint stayed active through OBS. The 89 recomputes VNAV only when an ALT 2 value is turned, so the cancel
  was seen at a recompute: a LEG, OBS, LEG round trip without one kept VNAV to KMKE (#338).
- ACTIVATE in OBS mode (D-> twice from FPL 0, then ENT) made the waypoint active, kept the course 045 and measured the
  deviation through the new waypoint (Fly L 37.5 NM); a plain Direct To in OBS centered the needle and changed the
  course (#154).
- A waypoint twice in FPL 0 (KENW at rows 3 and 5): with the second copy active, both by a Direct To from FPL 0 and by
  sequencing onto the leg KMKE - KENW, OBS and back to LEG kept the second copy active (#152).
- LEG to OBS 100 NM before the end of a 136 NM leg (KMSN to a user waypoint), centered (0.02 NM): the deviation stayed
  0.02 NM. The course shown was 097 against a DTK of 094 at the aircraft; setting 096, 097 and 098 by hand showed that
  the unit held a fraction, about 097.5 (#151).
- After a Direct To in OBS mode NAV 1 showed only the arrow before the waypoint, where a Direct To in LEG showed `D->`.
  Not used for the 90B.
- A Direct To in OBS mode to the same user waypoint about 100 NM away, from 5 NM north and 5 NM south of the old leg:
  the needle was centered at once (`Fly 0.00nm`). The course set was the bearing from the aircraft to the waypoint
  shown on NAV 1; setting the course by hand put the internal value at about 100.4 and 94.6, where the course of the
  direct path at the waypoint would be about 1.6° more. No CRS message was seen (no external indicator; frames 0.9 s
  apart) (#370).
- In OBS mode the bearings to that user waypoint ran 3 to 4° above those shown in LEG mode at the same position,
  consistent with the variation at the waypoint instead of at the aircraft (medium: the 89 shows no variation value).
  This also accounts for the 097 against a DTK of 094 in the #151 check above (#371).
- SET 1 ignored position changes of 1 to 5 NM (the entry showed for about a second, then reverted); changes of 28 NM
  and more applied.

**2026-10-14** (evening; SET 1 take-home, the screen sampled about every 0.22 s; FPL 0 KMSN, BAE, BUU: DTK 097 into
BAE, then 187, a 90° right turn; about 20 NM out at 239 kt unless noted)
- Plan leg with turn anticipation on: the arrow started flashing 3.3 NM before BAE, the DTK switched to 187 at 1.8 NM,
  BAE was sequenced at 0.7 NM, and the flashing went on about 25 s into the turn, then steady.
- Direct To BAE from its FPL 0 row, turn anticipation on (a 97° turn from the Direct To course): onset 3.6 NM, DTK switch
  2.0 NM, sequenced to BAE - BUU at 0.8 to 0.9 NM, the plan resumed. In both runs the onset came 22 to 23 s before the
  DTK switch (#146).
- Direct To C29, outside FPL 0, turn anticipation on: onset 1.0 NM (ETE :14), no DTK switch, the flashing stopped at
  0.0 NM, FROM, no sequencing; at 121 kt onset 0.5 NM (:14, medium-high). With turn anticipation off: 2.4 NM (:36). A
  plan leg with turn anticipation off: onset 2.4 NM, the DTK held to the waypoint, sequenced at it (#372).
- OBS mode, BAE active, OBS 090: onset 1.0 NM (:14 to :15) with turn anticipation on, nothing at 2.8 NM; 2.4 NM
  (:35 to :37) with it off. The flashing stopped at 0.0 NM, FROM, and BAE stayed active: no sequencing in OBS (#147).
- FPL 0 KMSN, BAE, BUU, BUU, accepted without a message; on BAE - BUU at 119 kt, turn anticipation on (medium-high):
  onset 0.5 NM (:14), stopped at 0.0 NM, then sequenced onto BUU - BUU with the DTK 187 kept. Past BUU the distance and
  the ETE counted up, the bearing pointed back at BUU, and the CDI stayed valid and centered (Fly R 0.03 NM 3.3 NM past),
  no flag and no new message. TO/FROM showed FROM up to 1.8 NM past, then TO, for no reason seen (#120, #372).
- The third-party AVsoftech KLN 90B trainer, which is unreliable: the plan leg and a Direct To a plan waypoint alike
  (onset about 2.1 NM at about 160 kt, sequenced at about 0.9 NM, the plan resumed); a Direct To off the plan alerted
  about 2.0 NM out and still flashed 2.2 NM past. Its CDI scale jumped to 1.00 on arming at 37 NM and let 5.00 be selected
  again while armed, which 5-38 and 6-1 rule out; not used (#160).

**2026-10-15** (an agent check; FPL 0 and FPL 25, the idents 80, 81, 8V to 8Z made unknown on purpose, all deleted
afterwards)
- An unknown ident entered with D->, on FPL 0 and on a numbered plan leads the same way: ENT replaces the right page with
  the creation choices `USR at:` / `User Pos L/L?` / `User Pos R/D?` / `Present Pos?`, and the left keeps the ident.
  `Present Pos?` and ENT, or a latitude and a longitude each closed with ENT, shows the new waypoint's page with `Ent`
  flashing; nothing is inserted yet. The next ENT inserts it, with the cursor on the next blank position at the end of
  the plan or on the following waypoint after an insert, or executes the Direct To. CLR on the creation choices creates
  nothing: D-> shows a blank ident field, a blank end position keeps the cursor, and an insert row is dropped with the
  cursor on the waypoint that followed it. CLR on the approval inserts nothing, but the user waypoint stays (#262).
- The outer knob moves the cursor past a blank cell of a short ident, on the USR page and in the D-> field. A character
  entered there stays in its cell with the blank before it (`8V A`, `80 A`), with no autofill; the unit searches that
  ident and offers to create it, and a user waypoint `80 A` was created from D-> (#343).
- FPL 0 with the leg from an en-route waypoint to the IAF of an approach loaded behind it (80, then RNAV 05 KUGN), the
  cursor off: the approach header takes the top row and the from waypoint is not shown; the cursor scrolls it back
  above the header. The 90B guide's figure 6-43 shows the from waypoint above the header, and the 90B follows the
  figure (#239).
- A numbered plan with the 89's twenty waypoints: the inner knob on a waypoint opens no insert row but asks to delete
  waypoint 1 to make room; ENT deletes it and opens the row, and the insert gives no message. The 90B answers a full
  plan with FPL FULL (C-1), so this is not used (#240, #241).
- The third-party AVsoftech KLN 90B trainer, which is unreliable: an unknown ident entered on FPL 0, a numbered plan or
  D-> brings up the SUP page's `CREATE NEW` / `WPT AT:` / `USER POS?` / `PRES POS?` on the right, for idents of two to
  five characters; its CLR and its D-> path misbehave there (#262). D/T 4 shows the Direct To symbol before the
  destination after a Direct To to the last waypoint of FPL 0 (medium-high, #298). The maintainer saw it also draw the
  arrow at the last copy of a destination that is twice in the plan while the first copy was active, which is taken
  for a fault of that trainer (#298). Its REF page refused both references tried, so it says nothing about #291.

**2026-10-15** (evening; the maintainer's observation, then an agent check; nothing stored)
- The first character of an identifier offers no blank: on the USR and APT 1 pages, in the D-> field, in an FPL 0
  insert and at the blank end position of FPL 0 the inner knob runs A to Z, 0 to 9 and back to A (Z to 0, 9 to A;
  counterclockwise A to 9, 0 to Z). Each step autofills the first identifier that starts with that character, or leaves
  the rest blank when there is none. From the second character on the blank sits between 9 and A, with no autofill
  while that character is blank (#374).
- On a fresh D-> field and at the blank end position of FPL 0 the first clockwise click gives A with the autofill of the
  first identifier starting with A; from an empty D-> field or FPL 0 position the first counterclockwise click gives 9
  (seen in the morning check of the same day) (#311).
- The first character of a remark line does offer a blank, after the hyphen: Z, 0 to 9, -, blank, A. The first
  clockwise click on a remark line clears it to A followed by blanks.

**2026-10-15** (night; agent checks of milestone 5 on both trainers; the 89's FPL 0 was restored afterwards)
- Every approach of the demo database (KMSN, KUGN, KMDZ, KMKE) lists four waypoints with the suffixes of the IAF, FAF,
  MAP and MAHP, the MAHP last; the APT 8 preview and FPL 0 agree. The holding point is listed once. Where the MAP is the
  navaid itself, that fix is listed twice, as the MAP and again as the MAHP (`MSNm`, then `MSNh`); where the MAP is a
  runway fix, the holding point follows it once. FPL 0 shows a `*NO WPT SEQ` row between the MAP and the MAHP (#220).
- With an approach in FPL 0, loading another approach, the same approach again, or an approach to an airport that is not
  in FPL 0 asks first whether to replace the existing approach, with APPROVE? flashing; for the other airport this is
  the only question. CLR goes back to the waypoint preview with the cursor on its add choice and leaves the approach in
  place; ENT replaces it and shows FPL 0 with the cursor off. Loading the first approach asks nothing (#274).
- APT 7 asks the same before replacing a STAR, also for the same STAR with another runway, with APPROVE? flashing; CLR
  goes back to the preview, ENT replaces the STAR and drops the waypoints that had been inserted into the old one. A STAR
  loaded while FPL 0 holds an approach asks nothing. The demo database has no SID (#274).
- FPL 0 holds 20 en-route waypoints and 35 in total with procedures, both limits applying on their own. An approach and
  a STAR loaded onto 20 en-route waypoints come on top, without a question and without deleting anything. A waypoint
  inserted in front of a STAR row opens at once with the `.` separator and counts only toward the 35; in front of an
  approach row the unit answers that the add is invalid. When an addition would pass either limit (an en-route insert
  at 20, a STAR insert at 35), the first inner-knob click, before any ident, asks to delete one waypoint to make room;
  ENT deletes waypoint 1 and opens the insert row, CLR cancels with the plan unchanged; one question per waypoint. No
  single procedure load in the database passes 35, so a load that needs room was not seen (#221, #222, #380).
- The third-party AVsoftech KLN 90B trainer, which is unreliable:
  - CTR 1 and CTR 2 go back to PRESS ENT TO COMPUTE CTR WPTS when the left page turns to another plan and back, and at
    once when a waypoint is deleted from the plan while CTR 1 offers the insertion; turning only the right page away and
    back keeps the computation. It never inserted a Center waypoint computed for an older plan (#301, #348).
  - Its approach replace question reads `PRESS ENT / TO REPLACE / EXISTING / APPROACH / APPROVE?` under the approach
    name, and the STAR one the same with `STAR`; both are asked for the same procedure too. CLR on the approach question
    returns to the preview with the cursor on LOAD IN FPL; ENT replaces it, FPL 0 stays on the left and the approach
    list comes back on the right with the cursor off. With FPL 0 holding an approach to another airport, the replace
    question was the only one. Its STAR question's CLR went to an empty transition page, and the replaced STAR's
    inserted waypoint stayed as an en-route waypoint; neither is used (#274).
  - An approach whose airport is not in a full FPL 0 of 30 asks, after the add or replace question, on the left page
    to delete waypoint 1 to make room, with CONTINUE?; the approach then comes on top (rows up to 35). It offered
    waypoint 1 even while it was the from waypoint of the active leg, and once moved a Direct To to another waypoint;
    both are taken for faults of that trainer. A STAR counted toward 30 there and was refused with FPL FULL; an insert
    into a full FPL 0 asked the same delete question on the first inner-knob click and then deleted two waypoints for
    one insert. These are not used either; the 89's two limits are (#221, #380).
  - The APT 8 previews end with one waypoint marked as the MAHP (#220).

**2026-10-16**
- On the USR page the reference VOR of a user waypoint moved north away from IMT stayed IMT, with radial and distance,
  up to 999.7 NM; at about 1000.7 NM and beyond Ref, Rad and Dis all showed dashes, as they did for a waypoint near the
  South Pole. The edge is also where the three-digit distance field runs out, so a search radius and a display limit
  cannot be told apart. The values were there within about 2 s of turning to the page. Tested in one direction only
  (#207).
- The third-party AVsoftech KLN 90B trainer, which is unreliable:
  - Its nearest airport list reached an isolated airport (Bermuda) from 186.8 NM east but not from 189.3 NM east, and
    from 217.1 NM north but not from about 218 NM north. Both edges fell on whole-degree lines, as if the search covered
    the aircraft's one-degree cell and three cells each way. Its VOR and NDB lists reached as far (#207).
  - With nothing in range it kept the old list with growing distances and no message, and it filled unused slots by
    repeating an entry; neither is used.
  - Its SUP page named the reference VOR at 136, 190 and about 1245 NM, with the distance dashed from 1000 NM on; its
    NAV 2 showed a VOR at 136.5 NM (#207).
  - APT 1 showed `WESTCHESTER` / `CO` for KHPN: a short form inside a longer word was not applied (#265).
- NAV 2 (present position from the nearest VOR) picks its VOR again by itself while the page stays shown: after another
  VOR became the nearer one, the page switched 1.4, 3.6 and 7 s later in three trials, which fits a choice made about
  every 8 to 10 s; radial and distance follow every second. It found a VOR 190 NM away and none at about 196 or 200 NM,
  where it shows dashes; after a position jump of about 1100 NM it kept the old VOR with its new distance for up to
  about 25 s. Medium-high confidence (#204).
- A VOR that is terminal in today's data (BJB; its class in the 1997 database is not known) was taken both by NAV 2 and
  as the Ref of a user waypoint, with a high altitude VOR about 20 NM away. Medium confidence; the 90B guide gives NAV 2
  a low or high altitude VOR, so this does not decide the 90B's NAV 2 (#204).

**2026-10-17**
- Special use airspace cannot be checked on this trainer: its self test reports no altitude input, the only altitude is
  the one typed on ALT 2, and NRST SUA found nothing at KORD (whose APT 3 lists `CL B`) or at Volk Field, with the SUA
  alert enabled or not; the demo database holds no special use airspace (#352).
- NRST CTR changed by itself from the Chicago Center (`127.00`/`132.10`) to the Minneapolis Center (`125.55`) while it
  stayed on screen, flown at about 940 kt across the boundary near W88°07' between N44°00' and N44°04'; the change came
  0 to about 15 s after the crossing. Its frequencies also changed by themselves at a sector change inside the Chicago
  Center. Whether it rechecks continuously or every few seconds could not be told. Medium-high confidence (#251).
- Values too large for their field show dashes; none was capped, cut or blanked (#257):
  - CAL 1's ETE has one hour digit: GS 17 gave `9:38`; GS 16 (10:15 h), GS 1 and GS 0 gave ` -:--`.
  - CAL 2's fuel required has four digits: 9627 and 9628 were shown; 10236, 10626 and GS 0 gave `----`. An ETE above
    9:59 did not blank the fuel.
  - CAL 6's TAS (CAS 999, 0 °C) showed `999` at Prs 29500 and `---kt` from 29600.
  - The exact edges (9:59, 9999) were not checked.
- CAL 1 from 92C (MSA 3200 in its cell) to 3D1 (3400 in the next cell north), 35 NM, gave `ESA 3400'`: the higher cell
  where the trip ends counts. The reverse direction was not tried. Medium-high confidence (#181).
- CAL 8: changing only the time zone left the date row as it was and shifted sunrise and sunset by exactly the zone
  offset (KIMT, 17 OCT: `1212`/`2303` UTC, `0612`/`1703` CST, `0112`/`1203` SST), also in SST, where the moment of the
  check was already the day before; no other day's times appeared (#166, #390). The first zone change turned the year
  `26` into `00`, which stayed; not used.
- The third-party AVsoftech KLN 90B trainer, which is unreliable:
  - CAL 5: 40 °C showed `104°F`, the sign cell carrying the hundreds digit; -80 °C showed `-11°F` (true -112, cut, not
    dashed); 868 kt showed `998MPH`, 869 kt `999MPH`, and from 899 kt the row was `---MPH`. Neither field takes more
    than three digits (#257).
  - CAL 4: the angle knob stops at 9.9; an angle of 10.0 or more (GS 60, FPM 1100) and GS 0 showed `-.-°`, while FPM
    1060 at GS 60 still showed 9.9; GS 600 at 9.3° showed `9950` and at 9.4° `FPM: ----`; FPM takes no entry above
    9999. A GS change recomputed the angle from the last FPM typed, not the one shown (#314, #346).
  - TRI 1 and TRI 3 at GS 0 showed `000KT --:--` and `F REQ -----` (#257).
  - Its TRI ground speed does not depend on the course (TAS 150 with 30 kt from 090 gave 171 kt on a southbound leg,
    and TRI 5 used that one speed for the whole plan), so it settles neither #167 nor #254.

**2026-10-17, second session**
- NAV 4 draws a VOR that is a waypoint of FPL 0 (BAE) once, as the route symbol with one label; with the VOR layer on
  or off no pixel differs there, and the layer adds only the VORs that are not on the route (#233).
- With the cursor on the CAL 1 ground speed, the pulled knob changed the field like the pushed-in knob (`001kt` to
  `002kt`), with no scan. Only this field was tried (#394).
- The maintainer's own check: with the map page's menu open, pulling the knob closed the menu and showed the scan window
  with the waypoints (#394).
- MSG with no message shows a page with only `No Message` on it until MSG is pressed again (#325).
- The third-party AVsoftech KLN 90B trainer, which is unreliable:
  - NAV 3 shows the cross track below 1 NM in hundredths with a leading zero and no blank after L or R (`FLY L0.31NM`,
    `FLY L0.04NM`, `FLY L0.86NM`, on the course `FLY L0.00NM`), from 1 NM in tenths after a blank (`FLY L 3.1NM`), and
    from 10 NM in tenths without the blank (`FLY L11.8NM`) (#231).
  - MSG with no message shows six blank rows and the status line only; CLR does nothing and MSG returns (#325).
  - Super NAV 5 shows the enroute OBS mode as `ENR300`, without a colon or a space, while the status line reads
    `ENR 300` (#321). The armed OBS mode was not tried.
  - Super NAV 5 draws a VOR of FPL 0 (ATY) once, as the route symbol with one label; the VOR layer changes nothing there
    (#233). An NDB of FPL 0 was not tried.
  - SET 0 shows no update prompt in the air, so #336 could not be checked there; on FPL 1 with the cursor on `USE?`, one
    click of the inner knob either way changed nothing (#336).
  - The map scales step 1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 60, 80, 120, 160, 240, 320, 480, 640 and 1000 NM, then AUTO
    (#236). AUTO showed 320 NM in every case tried, which is taken for a fault.
  - With the Super NAV 5 menu open, the right inner knob changed the VOR choice; pulling the knob closed the menu
    and showed the scan window on the active waypoint; a turn of the pulled knob stepped to the next waypoint of FPL 0;
    pushing it in closed the window and left the cursor off (#394).
  - The maintainer's own check: with the lasting message `OBS WPT > 200NM`, the Super NAV 5 prompt stayed in inverse
    video without flashing once the message was read, as the status line does (#326).

**2026-10-18**
- With the date inside the data base period at power-up, a SET 2 date after its end made the message prompt flash
  within about 1 s, and the message page listed the data base message once; after it was read the prompt was gone and
  the page showed no message. With the date already after the end at power-up, and after moving the SET 2 date back
  into the period, no message appeared (#175).
- A SET 2 time entry started the clock at the entered hour and minute with the seconds at `00` (#397).
- The date on the initialization page and the SET 2 date and time stay editable while the unit navigates (#125).
- Not observable on the 89: a lasting message over its relaunch (the condition does not survive the relaunch, #351),
  the altitude alert values (the 89 has no altitude alert, #259), an indicator course (no course input, #330).
- The third-party AVsoftech KLN 90B trainer, which is unreliable:
  - Its power button, off for about 10 s, twice: the read `OBS WPT > 200NM` stayed listed, and the prompt stayed steady
    in inverse video on the self-test page and after approval (#351).
  - ALT: `WARN:±500FT` with ALERT ON, and `ALERT: OFF` with `WARN:±700FT` behind it, both kept over a power cycle (#259).
  - The self-test page with no message and the HSI course well away from 315° showed no message prompt; messages that
    existed already did show there (#330).
  - After a time entry on the self-test page or on SET 2 the seconds kept running; its clock and hours were erratic
    (#331, #397).
  - It never showed a data base message, and its data base page ignored the entered date (#175).
  - The self-test date and time are editable; that page shows no GPS state (#125).
  - With a readable course off the desired track, `ADJ NAV IND CRS TO 224°` appeared about 6 s after the aircraft
    started moving and came back as new 2 to 3 s after it was read.

**2026-10-19** (an agent check; how the trainer's own moving aircraft intercepts and tracks the route; SET 1 take-home
with GS and HDG making the aircraft fly; FPL 0 BAE, C29, DLL, KMSN, BAE)
- Method: the unit's screen was recorded once a second and read into series of distance, GS, XTK, DTK or OBS course, TK
  and bearing. TK and DTK read to 1°, XTK to 0.1 NM from 1 NM and to 0.01 NM below. An offset was made with the OBS
  geometry: turning the OBS course by n° at distance D gives an XTK of D sin n. Big course changes were made with GS 0,
  because an OBS change at GS 0 does not move the aircraft. Medium-high confidence in the numbers (#100).
- Caveat for all of it: the moving aircraft is the trainer's own model, not necessarily what the roll steering output
  would make a real autopilot do. What the aircraft flew is recorded here apart from what it may mean.
- OBS-mode steering looked the same as Leg-mode steering: a Leg run (DTK 276, 6.0 NM right of the course) and an OBS run
  (5.4 NM left of it) were mirror images.
- From far off, starting parallel to the course, the intercept angle builds up to about 45° and does not exceed it:
  44° to 45° from 5 to 6 NM at 119 kt, held for the whole approach; 41° from 3.8 NM at 239 kt, held, never 45°. This is
  for the parallel starts only; the converging start below began steeper than 45°.
- The build-up from a parallel start is slow: a fast turn to about 25° (about 1.5° to 2° per second, ending abruptly),
  then 60 to 80 s more at about 0.5° per second to the 45°.
- The join: the roll-in began at about 50 s of closure before the course, at 1.1 NM at 119 kt and at 2.2 NM at 239 kt. It
  then closed without overshoot, the XTK keeping its sign down to 0.01 NM. In the join the track error fit
  atan(XTK / (GS × 30 s)): at 119 kt 0.99 NM gave 42° (formula 45°), 0.6 NM 31° (31°), 0.3 NM 17° (17°), 0.1 NM 6° (6°);
  at 239 kt 1.0 NM gave 27° (27°), 0.6 NM 17° (17°), 0.2 NM 6° (6°). The XTK halved about every 27 s at both speeds, so
  the join scales with time, not with distance.
- Small offsets gave shallow intercepts that depend on the history, not on the XTK alone: 0.51 NM at 121 kt peaked at 10°
  (built at about 0.3° per second, held while the XTK fell from 0.36 to 0.22 NM, no overshoot, 0.05 NM about 130 s after
  the offset); 0.31 NM at 239 kt reached only 2° to 3°. The 0.5 NM point of the far-off join run had 26°, and the 0.3 NM
  point of the 239 kt run 9°.
- Turn rates followed the speed: about 3° per second at 119 kt, about 2° per second at 239 kt, 4° to 5° per second in the
  reversal at 120 kt. That fits a rate limited near 25° of bank, with standard rate below it (standard rate at 239 kt
  would need about 33°).
- The course behind the aircraft (GS 0, OBS turned to the reciprocal, the aircraft 0.29 NM left of the new course, then
  GS 120): one continuous turn of about 200° toward the course line, with no change of direction. It crossed the line
  during the turn, overshot to 0.74 NM on the far side, and came back at about 15°, converging slowly (0.40 NM at 123 s and
  0.23 NM at 150 s after the start).
- Converging at 60° from 1.6 NM at 120 kt (the heading changed at once to 67° of convergence): it then turned right,
  shallowing the intercept at about 1° per second (51° at 0.95 NM, 33° at 0.6 NM, 17° at 0.3 NM, 8° at 0.1 NM), and did
  not cross; the XTK stayed one-signed. The track was steeper than 45° for a while, so no 45° cap was seen here.
- Turn anticipation (SET 4 on), DTK switch distance, then the delay before the aircraft turned:
  - C29, 70° right, 119 kt: the DTK switched at 0.5 NM; the turn began about 6 s later at 2.5° to 3° per second; the
    track overshot by 4°, decaying over about 60 s; XTK at most 0.15 NM; sequenced at 0.0 NM.
  - DLL, 164° right, 239 kt: the DTK switched at 4.0 NM; the turn began 4 to 7 s later at a steady 2° per second for
    76 s; it kept turning to 26° past the new course, 2.5 NM outside it, and took about 4.5 min to join; sequenced 2.9 NM
    before DLL.
  - KMSN, 51° left, 239 kt: the DTK switched at 0.9 to 1.0 NM; the turn began 4 to 6 s later at about 2° per second;
    sequenced at 0.2 NM; XTK at most 0.08 NM outside.
  - The turn began 4 to 7 s after the DTK switch in all three.
- Direct To snaps the heading: with 117° to turn at 239 kt, TK went from 093 to 335 within about 3 s, and with the
  waypoint 180° behind it flipped between two 1 s samples, the GS dipping briefly; no turn is modeled. Leg to OBS also
  snapped the track. The trainer therefore says nothing about the direction or rate of a Direct To turn.
- Probably the trainer's aircraft model and not the unit's steering: the slow build-up of the intercept and the 4 to 7 s
  delay before a turn (the history dependence points to a lagged aircraft, not to a fixed law of the XTK). Not settled.
  Artifacts: a one-sample jump of 8° to 12° in the TK 5 to 20 s into most turns, a 1° to 2° wrong-way drift at the start
  of the OBS run, and a few degrees of heading jump when SET 1 was restarted. No turn angle was flown at both speeds.
  The third-party AVsoftech trainer was not used.
- Left behind in the trainer: it is still running and flying GS 120 in OBS mode, OBS 151 to BAE, NAV 1 shown, one
  message pending unread. FPL 0 holds BAE, C29, DLL, KMSN, BAE, and SET 4 turn anticipation is now on (it was off). No
  user waypoints and no numbered flight plan were changed.

**2026-10-20** (three agent checks; waypoint sequencing and turn anticipation for #375, #157 and #76; SET 1 take-home
flying, SET 4 turn anticipation on unless noted; raw data and the reports in
[kln89-trainer-data/2026-10-20](kln89-trainer-data/2026-10-20/README.md))
- The turn starts (DTK switches to the next leg, the message prompt appears the same second) at a straight distance of
  r × tan(turn/2), r being the standard-rate radius with the bank limited to 25° (0.63 NM at 119 kt, 1.79 NM at 239 kt).
  No margin for the roll-in is added. Twelve on-course turns of 31° to 171° at both speeds.
- That distance is capped at 60 s of ground speed (4.0 NM at 239 kt, 2.0 NM at 119 kt, for 150° and 171°) and, after a
  short inbound leg, at half that leg (171° after 2.0 and 3.0 NM legs; medium). The turn is then flown; the waypoint is
  not skipped. This replaces the "uncapped" observation behind #76.
- The active waypoint changes when the aircraft crosses the bisector of the turn: for big turns well before the waypoint
  (3.2 NM before it for 171° at 239 kt). This is the "early skip" seen on large turns.
- The waypoint alert starts about 20 s (21 to 24 trainer s) before the turn start and keeps flashing until the turn is
  nearly complete.
- Off course (#157), all passes converging at 40° to 70°: the trainer always sequenced, up to 11 NM from the waypoint.
  What it does depends on the cross track to the active leg, against a fixed 4.0 NM at both speeds, evaluated every
  second (two direct transitions at 4.0 NM). Up to 4.0 NM the unit decides once, about 20 s before the turn point (the
  point at the lead distance before the waypoint on the inbound course), and keeps the decision. With the cross track
  at most about 2.8 NM then (medium: 2.69 and 2.83 NM turned there, 2.80 and 2.93 NM did not, at both speeds), the
  turn starts when the along-track distance to the waypoint equals the lead, whatever the cross track is by then, on
  either side of the turn; the on-course start above is the case without cross track. Otherwise, also when the
  aircraft was beyond 4.0 NM then, the turn starts when the waypoint is abeam, even after the cross track has fallen
  to 0.7 NM (third check, 12 runs). In the abeam case line 2 shows the distance to the waypoint as the cross track until the
  aircraft crosses the bisector, where the waypoint is sequenced 35 to 115 s later. The alert comes about 15 s before
  that abeam turn start. Beyond 4.0 NM there is no anticipation: the unit sequences once the next leg's segment is at
  least as close as the active one's, which is the abeam line on the outside of the turn and the bisector on the inside
  (medium-high), with the 36 s alert before an abeam sequencing and none before an inside one.
- Turn anticipation off: sequenced at the abeam line (1.2 NM off course).
- #375 (low to medium; the take-home aircraft cannot be flown past a waypoint toward the one after the next): after big
  turns the new waypoint stayed active while its distance grew during the flashing, as expected.
- Not settled: a parallel pass (the take-home aircraft always intercepts), the exact 2.8 NM gate and the moment of the
  decision, an inside pass that takes the abeam plan, whether the 4.0 NM depends on the CDI scale. The AVsoftech trainer was not used.
- Left behind in the trainer: it is still running, flying GS 120 on 8T to 8P, NAV 1 shown, several messages pending,
  SET 4 turn anticipation on.
  FPL 0 is now 8Z 8Y 8X 8V 8U 8T 8P 8S 8R (the old BAE, C29, DLL, KMSN, BAE was deleted), and the user waypoints 8P to
  8Z exist (8W skipped; 8Q is in no plan).

**2026-10-23** (agent checks; the KLN 89 trainer for #385, the third-party AVsoftech KLN 90B trainer for #383 and #386)
- AVsoftech KLN 90B trainer (unreliable), KAPA (its approaches have one IAF each, so no IAF list): with the right cursor
  on an APT 8 or APT 7 selection step (the approach waypoints, the approach and STAR replace questions, the STAR and SID
  transition lists, the STAR waypoints, the SID add question), CLR stepped the right page back, both with the left
  cursor off on FPL 0 and with it on a waypoint of FPL 0; neither DELETE FPL? nor DEL came. Right CRSR on a step turned
  the cursor off and went back to the procedure list. On the bare approach list CLR turned the right cursor off; on
  the STAR list it did nothing; neither is used (#383).
- KLN 89, full FPL 0 (20 en-route), the room question after an inner-knob click on waypoint 20: CRSR cancels it as CLR
  does, with FPL 0 unchanged and no insert row; the cursor stays on, on that waypoint (an outer knob then moved it).
  CLR gives the same. The outer and inner knobs do nothing while the question shows, and it has no timeout. Seen twice.
  The STAR insert at 35 was not checked (#385).
- AVsoftech KLN 90B trainer (unreliable): FPL 0 = KAPA, the SID PIKES2, en-route waypoints up to its limit of 29
  numbered waypoints plus the SID header. The inner knob on the first SID waypoint asked the room question (no FPL
  FULL); ENT deleted only KAPA and left the SID without its airport; the insert row opened one waypoint later, and the
  new waypoint became an en-route waypoint between two SID waypoints. Taken for a fault of that trainer; #148's rule
  stays (maintainer), recorded on #148. A repeat on the resulting plan deleted the SID header instead (#386).

**2026-10-24** (agent checks for #192, what a power cycle keeps; the KLN 89 trainer and the third-party AVsoftech KLN 90B
trainer, in two rounds; the VM was not started, stopped or reset)
- How the power was cycled. The KLN 89 trainer has no power switch: its only power cycle is closing the program and
  starting it again (10 to 20 s off, and once about 27 min). Every start runs the whole start-up. Whatever it keeps
  may come from its own data files (its take-home persistence) and not from the unit, so a "kept" is weaker evidence
  than a "reset", which the trainer must have done on purpose. Cycles of 20 s, 15 s and 27 min gave the same
  result: it does not model the time off. The AVsoftech trainer (unreliable, contradicts the Pilot's Guide in several
  places below) has a GPS PUSH ON button with a "turn off?" dialog; cycles of 15 s and 6 min 50 s gave the same result.
  Its simulation ran during both.
- KLN 89, reset at every power cycle (high): the VNAV selected altitude (ALT 2, entered twice, back to 0), the VNAV
  waypoint (back to the active waypoint), the VNAV offset (0), the departure and flight time on NAV 3 (high only with a
  caveat: the take-home ground speed came back 0 as well, so no new departure could start), the CAL 3 alarm time
  (cleared), the CAL 3 elapsed timer (restarted from power-on; the 89 guide says it counts since power-on), the mode
  (Leg; after OBS course 088 the OBS key offered the current DTK) and the manually entered magnetic variation (back to
  auto after 20 s). The last one is against the 89 guide (4-47: lost only after more than 5 minutes), so the trainer most
  likely does not model the time off. Medium: the page within the CAL group (back on CAL 1) and the CAL 7 TAS, which came
  back 0, possibly derived from the CAL 6 TAS, which was 0.
- KLN 89, kept: the CAL 1 trip waypoints (From and To), the CAL 1 and CAL 2 ground speed, the fuel flow, the reserve (once
  004 became 003, probably an entry slip; medium), the CAL 7 heading, the manually entered indicated altitude and the
  VNAV ground speed (all possibly its file).
- AVsoftech, kept (medium): the NAV 4 selected altitude, offset and angle, TRI 0 TAS and wind, the fuel flow, the
  reserve, the TRI 1 waypoint, the TRI 5 plan number, the departure time (its timer did not restart; low) and the OBS
  mode (low; the switch is latched in the trainer, it contradicts 3-3, and no OBS warning page appeared). It reset the
  CTR computation (agrees with 5-22 and 5-26) and showed the page of the active waypoint on the right (agrees with 3-8).
  Its TRI 3 waypoints came back inconsistent (the old first ident with the distance of the new one), a trainer defect.
  The KLN 90B magnetic variation line is outside its coverage logic (5-44), so it could not be checked there.
- Both trainers kept the fuel flow, the reserve and the trip waypoints. They disagree on the VNAV selected altitude,
  offset and the departure time; the AVsoftech trainer is the unreliable one. The simulation resets the selected
  altitude as the KLN 89 trainer did, twice with the same result; the AVsoftech trainer kept it.
- Round 2, the waypoint pages and the nearest rank. KLN 89: the last viewed waypoint of the APT, VOR, NDB and INT pages
  and the USR page came back, however it had been reached (scan, ident entry, creation, nearest rank). A page parked on a
  nearest rank (APT KCLI at rank 2, VOR GRB at rank 3) came back as the same waypoint, shown plain, without the nearest
  marker, and also when the ranking had changed before the power-off (KAUW entered at rank 2, rank 1 at the power-off,
  back as plain KAUW; high). The page number within the group was reset to 1 (APT 3 came back as APT 1). A deleted user
  waypoint left the USR page on the first or the preceding user waypoint (the deleted one was entry 0, so which is not
  known), also after a power-on (medium). While flying, a nearest page
  stayed on its airport and only the rank number changed (3-23, 3-24), so the unit does not follow the ranking; the mode
  with the cursor parked on the rank could not be reached in this trainer. A position re-initialization on SET 1 dropped
  the nearest mode and left the airport as a plain airport. The AVsoftech trainer brought the waypoint pages back on
  fixed idents at every start (an airport, an NDB, an intersection, a supplementary waypoint), neither the last viewed
  nor the last typed, and showed a nearest page as that fixed airport with its rank flag, 789 NM away. Trainer defect, no
  evidence. It did show the active waypoint on the page type of the right side at power-on again (3-8). It keeps the
  page number; the KLN 89 resets it, and the simulation follows the KLN 89 (no counterpart check on the 90B).
- No simulation bug came out of these checks, so nothing was filed.

**2026-10-24** (agent checks for #73 and #418, VNAV; the KLN 89 trainer and the third-party AVsoftech KLN 90B trainer;
the VM was not started, stopped or reset)
- KLN 89, the vertical speed turned on ALT 2 while VNAV was active (high): a steeper VS gave a countdown that matched
  the geometry (`Vnv in 02:41`), a VS shallower than required, so that the start lay behind, gave a new advisory
  altitude at once (`Vnv Alt 03000'`), and going steeper again from there went back to a countdown. VNAV never went
  Inactive and never kept the old path. The 89 recomputes only when a knob turns a value, as before.
- KLN 89, the VNAV waypoint (high): on ALT 2 it is a selector over the active waypoint and the FPL 0 waypoints after
  it, with no ident entry; ENT on the unchanged field changed nothing. The first step to another waypoint made VNAV
  Inactive at once, and stepping back did not bring it back; the cursor onto VS then started it again.
- KLN 89, the inputs after VNAV ends (high). An active VNAV and an armed one (countdown) whose waypoint was
  sequenced, and an active one whose path reached the selected altitude with an offset of -3 NM, all showed at the
  next recompute: Inactive, the indicated (from) altitude replaced by the selected one and editable again, the
  selected altitude kept, the waypoint field on the active waypoint, offset +00, VS 0, the ground speed kept. This
  confirms the end-of-path reset of 2026-10-06 and adds the sequence. With offset 0 the 89 may treat the passed
  waypoint as the end of the path; the screen does not tell the two apart. VNAV to a waypoint after the active one
  stayed active with all its inputs when the active waypoint was sequenced.
- The AVsoftech KLN 90B trainer, which is unreliable: an angle turned while VNAV was active gave `VNV ARMED` at once;
  ENT on the unchanged VNAV waypoint and the same ident typed again kept VNAV active (medium). Its VNAV is otherwise
  broken (the altitude only climbs, an entered angle never leaves ARMED, a SEL or offset change starts VNAV, the
  advisory runs below SEL and never ends), so it says nothing about the end of a descent. The maintainer saw on the
  same trainer that entries on NAV 4 show on both NAV 4 pages at once.
- Outcome: #418 filed and fixed (a new angle re-arms VNAV); #73 fixed (SEL shown on both NAV 4 pages, the same
  waypoint keeps VNAV, the inputs reset when the path ends or a programmed VNAV waypoint becomes invalid).

**2026-10-24** (AVsoftech KLN 90B trainer, which is unreliable, scratchpad messages, #237; the maintainer and an agent
checking screenshots, timings about 0.1 s; the VM was not involved)
- On Super NAV 5, GPS/APR posts `NO APPROACH`, invisible there, and the MSG light flashes indefinitely. MSG shows the
  message on the MSG page and on the status line; the MSG page keeps listing it after the status line clears, and the
  light goes off when the status line clears. Leaving Super NAV 5 for another page shows it on the status line for 5 s.
  Reading it does not stop the flashing. The message stays after its cause is gone.
- The 5 s run on a wall clock from the first time the status line shows the message, also while it is hidden again, and
  the expiry takes effect only while the status line is visible: closed at 2.3 s and reopened at 3.5 s, it cleared at
  5.1 s; reopened after 8.5 s, it cleared at once, still listed on the MSG page, light off.
- A message posted while the MSG page is open shows on the status line but is not added to the open page; reopening
  within the 5 s lists it.
- On the MSG page the entry is a single line at column 0, in normal video; the status line shows it inverse. With only
  read messages left after it clears, the light is steady.
- A second, different message within the 5 s replaces the text but clears 5 s after the first one's first display, and in
  the one usable sample only the first was listed (low). The same message twice gives one entry and no restart. The
  maintainer ruled the case too rare to trust the trainer on, so the simulation gives the second message its own 5 s and
  lists only it (pinned as a characterization test). The same message twice also replaces the entry and restarts its
  5 s there, as the status line always did; the trainer's no-restart is not copied.
- `D-> CRS 308` was listed as `D-> CRS`; in one sample the entry was listed below an older message. The simulation lists
  the text as the status line shows it and keeps the newest first, as for every message (the builder's call).
- The trainer has a DME arc (KFLD VORD 36) but answers CLR on it with `INVALID DEL` on FPL 0 and offers no MOVE ? on
  Super NAV 5 either, so it never implemented the function and says nothing about #134.
- The KLN 89 trainer does not list scratchpad messages on its message page; its scratchpad is always visible, so it
  never needs to (the maintainer).
- Outcome: #237 implemented for every status line message, as the 90B trainer shows it.
