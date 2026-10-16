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
