# Display pages (Super NAV 5, MSG, OTH and overlays): design

Date: 2026-10-17. Milestone "Display pages – Super NAV 5, MSG, OTH and overlays" (GitHub milestone 9). Issues: #96,
#231, #233, #236, #321, #325, #326, #336, #393, #394, #395, #396. Branch: `m9-display-pages`.

The milestone held five bugs (#96, #233, #321, #325, #336) and three questions (#231, #236, #326). A read-only inventory
measured every candidate fix against the full suite and found three more bugs, filed as #393 to #395 and added to the
milestone at the maintainer's request. The research for #321 found #396, filed and added the same way.

## 1. Evidence

**Maintainer rulings (2026-10-17).**
- #393, #394, #395 and #396 join the milestone, each as its own commit.
- #236: the AVsoftech trainer's list. A saved range that is not in the list loads as the default, 40 NM.
- #231: hundredths below 1 NM in the photo's form (`FLY R0.09nm`).
- #321: the 5-35 colon rule belongs to the OBS field, not to the mode annunciation. The status line always shows the
  OBS modes with a colon (5-32). The Super NAV 5 mode row shows `ENR300` and `ARM300`: no colon, no space. The OBS
  field on Super NAV 5 shows the colon (and drops the degree sign) only where the course can be entered on the unit
  (#396). A research agent checked this reading against the guides (below).
- #325: keep the blank page (the AVsoftech trainer shows one). No code change.
- #326: steady inverse once every message is read. The maintainer saw this on the AVsoftech trainer with a lasting
  `OBS WPT > 200NM` message; treated as high confidence.
- #394: limited to Super NAV 5, as the maintainer observed on the KLN 89 trainer (2026-10-17) and as the AVsoftech
  trainer shows (A8): pulling the right knob while the menu is open closes the menu and opens the small scan window.
  CRSR while pulled closes the scan window and opens the menu; the right knob (still pulled) then selects and changes
  the menu fields as usual. CRSR again closes the menu and shows the scan window. Pushing the knob in while the menu
  is open does nothing; pulling it out again closes the menu and shows the scan window.
- #395: the EFB load always wins (edge cases in section 2).
- The design was approved in chat (sections 1 and 2, then #321).

**KLN 89 trainer, 2026-10-17** (trainer agent; report in the session scratchpad `trainer/report.md`).
- K1 (#233): BAE, a VOR of FPL 0, is drawn once on NAV 4, as the route symbol with one label. With the VOR layer on
  or off no pixel differs at BAE; the layer adds only VORs that are not on the route.
- K3 (#394): with the cursor on the CAL 1 ground speed, the pulled knob changed the field like the pushed-in knob.
  Only this field was tried; this is the rule `MainPage` already has for half pages.
- For #325 the 89 shows `No Message` on an otherwise blank page; for #231 it shows hundredths (an earlier check).
- The maintainer's own check (#394): pulling the knob on the 89's map page with its menu open closed the menu and
  showed the scan window.

**AVsoftech KLN 90B trainer, 2026-10-17** (third-party, unreliable).
- A1 (#231): NAV 3 `FLY L0.31NM`, `FLY L0.04NM`, `FLY L0.86NM` below 1 NM (hundredths, a leading zero, no blank after
  L/R), `FLY L 3.1NM` from 1 NM, `FLY L11.8NM` from 10 NM, `FLY L0.00NM` on the course.
- A2 (#325): MSG with no messages shows six blank rows and the status line only.
- A4 (#321): Super NAV 5 mode row `ENR300` in the enroute OBS mode; the status line `ENR 300`.
- A5 (#233): a route VOR is drawn once, as the route symbol with one label; the VOR layer changes nothing there.
- A6 (#336): SET 0 has no prompt in the air. On FPL 1 with the cursor on `USE?`, one inner-knob click either way did
  nothing.
- A7 (#236): the scale steps match the maintainer's list; AUTO always showed 320 (broken, not used).
- A8 (#394): menu open, right inner knob changes VOR TLH to LH; pulling closes the menu and shows the scan field
  `ATY`; a pulled click scans to `CYS`; pushing in leaves the cursor off.

**Pilot's Guide.**
- 2-5, figure 2-3 (SET 0 prompt; #336).
- 3-16 (the message prompt flashes while unread, stays on once read), 3-36 (the same prompt on the Super NAV 5 map;
  #326).
- 3-32, figure 3-105 (NAV 3 cross track in tenths; #231; overruled by the photo below).
- 3-35 (range end points 1 and 1000 NM; #236).
- 3-37, figures 3-121 and 3-122 (a flight plan VOR labeled once with the VORs on; #233).
- 5-32 (annunciation table with `ENR:274`, `ARM:259`; Super NAV 5 shows the mode on the left side), 5-35 (the colon
  after OBS on MOD 2, NAV 3 and Super NAV 5 means the course can be entered on the unit), 6-12 and 6-14 (figures 6-20
  and 6-22: Super NAV 5 in the approach-arm OBS mode, course set on the external indicator, mode row `ARM241`/`ARM068`
  with no colon and no space, course line `OBS241°`/`OBS068°`). Status lines with a colon: figures 3-23, 5-113, 5-114,
  5-116 to 5-119. No figure shows Super NAV 5 in the enroute OBS mode or with an enterable OBS course.

**Real-unit photo.** `TCAS,_GPS_and_Altitude_Alerter_(250504914).jpg`: NAV 3 `FLY R0.09NM` (#231).

**Cell layout.** The Super NAV 5 left column is 6 cells; the small-letter glyphs (ENR, ARM, OBS, DTK, ...) are 2 cells
each. `OBS241°` fills the column; an editable `OBS:241` fits only without the degree sign.

**Inventory (2026-10-17).** Read-only, detached worktree at master 8cb06da; report and patches in the session
scratchpad `inventory/`. Baseline: 4358 tests pass, 29 expected fails; tsc and build clean. The candidate fixes of all
original issues together change exactly the tests named below; the effects add up.

## 2. Pages, stacks and knobs (#96, #395, #336, #394)

**A. Pages that leave are destroyed (#96).** `Oth3Page`, `Oth4Page` and `WelcomePage` keep their `Subscription` and
destroy it in `destroy()`. Every way a page leaves calls its `destroy()`: `PageStack.setCurrentPage` (only when the
page really changes), `PageStack.pop`, `PageStack.parentRemoved`, `OverlayStack.pop` and `remove`, and
`MainPage.destroy` for every page on its three stacks (power off). No page that stays alive or is shown again is on
these paths (inventory). The two pins in `Oth3Page.test.ts` and `Oth4Page.test.ts` become tests of the expectation.
New tests hold each other path: a pushed page that leaves through `pop`, a right-side child removed through
`parentRemoved`, an overlay closed, a power cycle that keeps the OTH 3 handler count constant, and `WelcomePage`'s
`propsReady` count across power cycles. No manual source; these are engineering properties, labeled without page
numbers.

**B. The EFB load replaces the base page (#395).** `PageStack` gets a method that replaces the base page and pops
every page above it; `MainPage` uses it for the left side so that the right-side children of the popped pages go
through `parentRemoved`, and `KlnEfbLoader` calls it. Behavior (the maintainer's ruling): every pushed left page
closes (D->, ALT, make-room, and their right-side children, such as the waypoint creation page an unknown D-> ident
opens); FPL 0 becomes the left base page with its cursor off, and any unfinished left entry, pushed or on the base
page, is dropped. On the right only children of the closed left pages go; the right page's own cursor and edits stay.
An overlay (MSG, SET 0, Super NAV 1 or 5) stays on top with FPL 0 beneath it; Super NAV 5 ends when FPL 0 replaces
NAV 5, through the existing super-page check. Tests for each case: D-> open; D-> with an unknown ident and the creation
page open on the right; ALT open (no NAV 4 left on the right, and the next ALT pushes one pair); a left base page with
the cursor on and an edit pending; the right page editing at the same time; MSG or SET 0 open; Super NAV 5 open. After
A, because the replaced pages are destroyed.

**C. A knob an overlay's cursor field refuses does nothing (#336).** At the eight overlay sites of
`MainPage.onInteractionEvent`, while the overlay's cursor is on, a knob the cursor field refuses returns `true` instead
of popping the overlay. Normal and pushed half pages already behave so (inventory probe on FPL 7). The #56 rule
(cursor off) stays. The pin in `Set0Page.test.ts` becomes a spec test (2-5, figure 2-3; the KLN 89 check T5 of
2026-10-09 and AVsoftech A6 support only that a prompt under the cursor ignores the inner knob on a normal page). #238
is fixed already; its test is unaffected.

**D. The pulled knob on Super NAV 5 (#394).** Two parts:
- `MainPage`'s `EVT_R_SCAN_LEFT`/`EVT_R_SCAN_RIGHT` cases decide by the overlay's own right cursor when an overlay is
  shown, not by the right half page beneath it. With the overlay's right cursor on, the pulled knob acts on that field
  like the inner knob (the existing half-page rule; KLN 89 K3).
- Super NAV 5 reacts to the pull itself (`EVT_R_SCAN` reaches the pages after `KLN90BCore` toggles
  `hardware.isScanPulled`): a pull with the menu open turns the right cursor off and shows the scan window; a push
  with the menu open changes nothing; CRSR while pulled opens the menu and hides the scan window, CRSR again closes
  the menu and shows the scan window. The scan window shows only while the knob is pulled and the menu is closed.
One render test per transition, with the maintainer's KLN 89 check and AVsoftech A8 cited only for what they showed
(the pull closing the menu, the scan field appearing, the pulled turn scanning); the CRSR transitions rest on the
maintainer's ruling. After C and after section 3A to 3E (it touches `MainPage.tsx` and the Super NAV 5 files).

## 3. Super NAV 5 (#233, #236, #326, #321, #396)

**A. A route VOR or NDB is drawn once (#233).** `SuperNav5Page.drawNearestList` skips the icon and the label of a VOR
or NDB that is a waypoint of FPL 0, compared by ICAO (`ICAO.valueEquals`) as `drawAirports` does. The pin becomes a
spec test (3-37, figures 3-121 and 3-122). The three tests that expect the VOR symbol at a route VOR
(`draws the VORs of the class VOR: H selects (3-37)`, `... VOR: LH selects (3-37)` and the pin's sibling
`labels a VOR of FPL 0 with the VORs off, and draws it as a nearest VOR with VOR: H (3-37)`) are rewritten: the route
VOR gets the route symbol only (KLN 89 K1, AVsoftech A5). A test with two distinct facility objects of equal ICAO holds
the ICAO comparison (an identity comparison passes in the harness otherwise). An NDB of FPL 0 gets the same test.

**B. The range list (#236).** One shared list, 1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 60, 80, 120, 160, 240, 320, 480,
640 and 1000 NM, used by `Nav5Page`, `SuperNav5RangeSelector` and Super NAV 5's AUTO. The settings keep their meaning
(the NM value, 0 for AUTO); a loaded value that is not in the list becomes the setting's default, 40. The two range
characterizations in `Nav5Page.test.ts` and `SuperNav5Page.test.ts` take the new list (the AVsoftech trainer, as the
maintainer reported on #236; 3-35 gives the end points). New tests: a saved 25 and a saved 100 load as 40 on both
pages, and AUTO picks 7 NM where 5 NM is too small and 10 NM is not needed.

**C. The msg prompt once read (#326).** `SuperNav5Left.tick` keeps the inverse video and removes only the blink in the
read branch, as `StatusLine` does. New test in `SuperNav5Left.test.ts` (3-16, 3-36; the maintainer's AVsoftech check).

**D. The mode row (#321).** `SuperNav5Left.getModeString` drops the colon of `ARM_OBS` (`Í241`), so both OBS modes show
no colon and no space. `ENR_OBS` already does. `StatusLine` keeps its colons. Tests: `ARM241` as a spec test (6-12 and
6-14, figures 6-20 and 6-22); the #321 pin (`ENR:`) becomes a characterization of `ENR300` (by analogy with ARM, and
AVsoftech A4); its passing sibling stays. The two #263 characterizations stay as they are. The commit is
`fixes #321` and says that the issue's expected `ENR:050` was wrong.

**E. The OBS field colon (#396).** On Super NAV 5 only (field 2 on DTK, OBS mode), where `canObsBeEntered()` holds,
the course shows as `OBS:241` (colon, no degree sign; dashes `---` without a value); otherwise as `OBS241°` as today.
NAV 3 keeps its own label and the degree sign (figure 5-113). The non-editable form is a spec test (6-12, 6-14); the
editable form is a characterization (5-35 note and the cell count; no figure shows it). After D (same file area).

## 4. NAV 3, D/T 2 and MSG (#231, #393, #325)

**A. NAV 3 below 1 NM (#231).** Below 1 NM after rounding to hundredths, the cross track fills the four cells after
`FLY L`/`FLY R` with `0.xx` (`FLY R0.09nm`); from 1 NM the row is unchanged (`FLY L 3.1nm`). A value that rounds to
1.00 shows `FLY L 1.0nm`. The change is opt-in for NAV 3 (the other `DistanceDisplay` users keep their formats). The
#231 characterization and the whole-page NAV 3 characterization take the new form; the first becomes a spec test
citing the photo. Figure 3-105 is named in a comment as the conflicting source.

**B. A value of exactly 0 (#393).** `Nav3Page` (`xtkToActive`) and `Dt2OtherPage` (`eteToActive`) compare with
`!== null`. Tests: NAV 3 on the course shows `FLY L0.00nm` (AVsoftech A1 showed this form; a characterization); D/T 2
with an ETE of 0 shows the current time as ETA. After A.

**C. MSG with no messages (#325).** No code change. A characterization test in `MessagePage.test.ts` holds the blank
page (six blank rows, the status line), citing AVsoftech A2. The commit is `references #325`; the maintainer closes the
issue as not planned.

## 5. Execution

- Branch `m9-display-pages` from master. First commits: this design, the plan, and a dated 2026-10-17 block in
  `docs/kln89-trainer-record.md` with the KLN 89 checks (K1, K3, the maintainer's pull check) and the AVsoftech results
  marked unreliable, as earlier blocks do.
- Lanes, each a chain of tasks in order, touching disjoint files; lanes run in parallel:
  - A pages and stacks: #96, #395, #336.
  - B Super NAV 5: #233, #236, #326, #321, #396.
  - C NAV 3 and MSG: #231, #393, #325.
  - Then #394, after A and B.
- One fresh worktree agent per task, starting with `git merge --ff-only m9-display-pages`. Each task is one commit
  (`fixes #NN`, or `references #325`) with its test and doc changes; after review it is cherry-picked onto the
  integration branch at once, so the lane's next task builds on it.
- Every condition a task adds has a named test that turns red when that condition is dropped; reviewers check by
  mutation. Test titles cite only what their source literally shows; trainer and maintainer observations are cited
  only for what they observed.
- Each task runs `npm test`, `npx tsc --noEmit` (in the main checkout after the cherry-pick) and `npm run build`
  before its commit.
- Public contracts: the map range settings keep their keys and meaning (#236 only maps unknown values to the default);
  no H event, LVar, panel.xml key or SimVar changes; no wiki change.
- Close-out: a final review of the whole branch, then a local merge into master once the maintainer approves. No push.
