# Session 10 design: boot, power and the unit as a whole

Session 10 of [docs/test-coverage.md](../../test-coverage.md). That document holds the rules every session follows
(section 2, rules 1 to 27) and the session's goal (section 3). This design adds what the tasks need beyond those rules.
Branch: `tests-session-10-boot-power`.

## Scope

- **In:** the six items of section 3:
    1. the cold-and-dark boot: the Turn-On page, the self-test pages and their values, the pages after APPROVE? (VFR
       only, OBS warning, the Database page), the first main page, the messages at power-on;
    2. the power cycle: what `VolatileMemory` clears, what survives, the purges at power-off, the #90 pruning;
    3. `TickController` and `Hardware.ts`: the rates, the blink, the calculation order, nothing while powered off or
       hot-swap disabled;
    4. the overlay pages (MSG, Super NAV 1, Super NAV 5, SET 0, the error page) and the pushed pages (ALT, DIR):
       pushing, popping, the #56 rule;
    5. startup robustness: the Dukes fix, #50, `BrightnessManager`, `KeyboardService` (#75), `SimVarSync`,
       `PowerButton`;
    6. `KLN90BCore.init` with the sample `cfg/panel.xml` and with the minimal one.
- **Already held, re-proven by the research and not duplicated:** the Dukes fix (`7b4465d`,
  `test/unit/pages/PageManager.test.ts`), both halves of #50 (`KLN90BCore.startup.test.ts`, `bootFailure.test.ts`), the
  #56 outer knob on a pushed left page (`MainPage.test.ts`), #75 (`PageContainer.test.ts`), the #90 pin and its siblings
  (`PageTreeController.test.ts`; nothing missing), the procedures purge after more than 5 minutes off and its #94 pin,
  ENR-LEG at power-up, STA 4, the display-tick throw reaching the error page.
- **Out:** take-home mode (unsupported, the maintainer's decision); `debugMode` (a constant with no panel.xml key); the
  real SDK objects of `SIM_PLATFORM`; a custom `BasePath` (`FakeXhr` serves the default path only).
- **Start state** on 2026-10-09: `npm test` 2637 passed and 350 expected failures in 304 files, `npx tsc --noEmit`
  clean. Coverage (statements): `KLN90B.tsx` 72.7 %, `KLN90BPlatform.ts` 25 %, `KLN90BCore.ts` 87.7 %,
  `BrightnessManager.ts` 86 %, `TickController.ts` 92.2 %, `WelcomePage.tsx` 80.4 %, `MainPage.tsx` 85.0 %,
  `PageManager.ts` 88.9 %, `KeyboardService.ts` 92.9 %, `PowerButton.ts` 98.1 %, `SimVarSync.ts` 100 %,
  `Hardware.ts` 100 % (branches 50 %).

## Research pass

Five read-only agents worked in isolated worktrees (A: the Turn-On page, the pages after APPROVE?, the messages at
power-on; B: the self-test pages and what the unit outputs during the self test; C: the power cycle and the power
inputs; D: the tick loops, `KLN90BCore.init`, `KLN90B.tsx`, startup robustness; E: the overlays, the input routing,
`KeyboardService`). They read the code and the manuals through the local page indexes, drafted tests, ran each against
a one-line break of its subject, saw it fail and restored the tree; each pin was proven by a temporary fix. With each
agent's drafts in place the full suite was green and `tsc` clean. The reports are `research/A/research-A.md` to
`research/E/research-E.md` in the session scratchpad, the drafts in `research/<X>/drafts/` (also in the research
worktrees). A sixth agent drove the KLN 89 trainer (`research/trainer.md`, below). The plan carries the per-test setup,
literals, citation and break; the implementer confirms each by running it.

Findings that shape the tests:

- **Large parts of the boot were unheld.** Each of these breaks left the whole suite green before the drafts: the
  Turn-On page's 17 s cut to 10 s; the left cursor no longer holding the Turn-On page; Turn-On lines 3 and 4 swapped
  or line 4 saved under the wrong key; the Database page's expiry texts swapped; the VFR page skipping the OBS warning;
  four beeps instead of five on APPROVE?; the start-page seed for an NDB, an intersection or a user waypoint (3-8); the
  self-test DTK computed true instead of magnetic (every test ran with a variation of 0); the Center waypoint region
  (5-26); the screen warm-up (`TIME_TO_WARM = 0`); the 16 Hz signal rate; the power gate of the tick loops (only the
  #135 pin flipped, for the wrong reason); the tick-side half of the #24 guard; the other tickables running after one
  throws; the signal tick's catch; the initial `L:KLN90B_RightScan` write; `messageHandler`'s place in the calculation
  order; eleven knob branches of `MainPage`; `isEnterAccepted` on an overlay; the hidden status line on Super NAV 5; the
  keyboard reset at power-off.
- **Three areas drafted the same test** of the right page after power-on (3-8) and two the five beeps; each has one
  owner below.
- **The self-test right page has no test of its fields' order**: the cursor walk, the time zone, the date and time
  entry before a fix and the baro correction of ALT are new.
- **The Dukes fix had no core-level test.** Re-broken, the pilot-visible failure is a unit that never comes up: the
  cached error reaches `ErrorPage` before it is rendered. Research D's draft holds it at the boot.
- **`testing.md` section 6 records a bug as a harness fact**: the SYSTEM TIME UPDATED message of every engine-running
  boot (#NEW-A-2, below).
- **The guide's text layer carries no inverse attribute.** The maintainer confirmed that figure 3-3 shows SELF TEST IN
  PROGRESS inverse, so that test is a spec test.

## Trainer results

A trainer agent drove the KLN 89 trainer on 2026-10-09 (`research/trainer.md`; the maintainer started the VM). The ids
T1 to T12 are the ones the test comments cite. Paraphrased; high confidence unless noted:

- **T1:** D→ on the message page shows the Direct page at once, and the message page is gone; the field holds the
  active waypoint, or is blank with none active. ENT confirms that Direct To and returns to the page before; no
  nearest airport is involved.
- **T2:** ALT on the message page shows the first altitude page at once; leaving the altitude pages returns to the page
  shown before MSG, not to the message page.
- **T3:** the knobs on the message page close it and act on the page beneath: from NAV 1 the outer knob clockwise gave
  the next group, counterclockwise the previous one, the inner knob the next or previous page of the group (the 89 has
  an undrawn NAV 4 page, which explains one inner click that showed nothing; medium-high for the inner knob).
- **T4:** CLR on the message page is ignored; CRSR closes it and brings back the page beneath with its cursor on.
- **T5:** with the cursor on `Copy FPL 0?` (an empty numbered plan) the inner knob does nothing in either direction. One
  prompt only.
- **T6:** the 89's ALT and Direct page stacking differs through its two altitude pages; a note, not a pin. ALT, then
  D→, then CLR on the empty field returns to the altitude page (agrees with the code).
- **T7:** the 89's power-on page shows for about 5 s and then waits for the take-home warning; it does not help with the
  90B's Turn-On time.
- **T8:** while the 89's Self Test page shows, no message prompt appeared (ten screenshots; the trainer shows no OBS
  course, so the readable-course case of #NEW-B-2 is not observed directly).
- **T9:** not observable: the 89's Self Test page has no baro or altitude field.
- **T10:** the 89's data base page is full screen with no mode or prompt; ENT goes on to the fuel page, then NAV 1. The
  90B figure 3-24 shows a status line; the 90B guide wins.
- **T11:** opening the time entry clears it; after ENT the clock starts from the entered hour and minute with the
  seconds at zero, and the time spent in the entry is not added (medium-high; agrees with Session 9b's T17).
- **T12:** everything the agent changed was restored or discarded by the relaunch. The trainer is back on the
  take-home warning of a fresh launch. This launch had an empty FPL 0 (the memory said it restores its own plan).

## Maintainer's decisions

- **Trainer:** one round after the research and before the design (done, above).
- **#NEW-A-2 is a bug:** filed and pinned; `testing.md` section 6 is rewritten as a known bug.
- **#NEW-C-1 is a bug:** filed and pinned; the maintenance manual's battery module is the spec.
- **Harness:** a small task 0 (below).
- **Figure 3-3 shows SELF TEST IN PROGRESS inverse:** the test is a spec test citing it.
- The bug table, the defaults, the task split and the workflow below: approved.
- **Evidence rule** (as in Sessions 9a and 9b): the 90B Pilot's Guide and its figures win; the KLN 89 trainer decides
  where the 90B guide is silent; a behavior that exists only on the 89 (its two altitude pages, its take-home warning,
  its start-up order) never becomes a pin.

**The controller's defaults** (presented with the design, not objected to):

- **Characterizations:** leaving the Turn-On page as soon as the cursor goes off after its time; the self-test page's
  left knobs doing nothing (the maintenance manual describes its bench test mode, another mode); the dark time's
  scaling with the off time; the pushed right page's knob rule (the 89 has one knob pair); the two keyboard tests of
  research E.
- **A spec test on an inference:** the left cursor holds the Turn-On page (5-28: the programming procedure cannot be
  done in the time the page shows alone); the comment states the inference.
- **Log only:** the ALT row's padding and case (the photos zero-pad, the guide's figures do not; the tests parse the
  number); whether a baro change takes effect before ENT (T9 cannot show it); the distance indicator's 0 KTS during the
  self test (Installation Manual 2-69); the Direct To and the active waypoint kept over a power cycle (the guide is
  silent); the 89's ALT and Direct page stacking (T6); CLR on the message page (ignored, as on the trainer); the line 1
  coverage text of the Database page; where the cursor goes after ENT on the fourth Turn-On line (5-28 is silent).
- **Leads for `testing.md` section 7, not issues** (research D, latent or possibly intended): `setupLoops` starts new
  intervals without clearing old ones (only the upstream dedup prevents a doubling); H events before `init()` are
  dropped, an early power-on included; an `error` published before `ErrorPage` is rendered still aborts the start-up;
  the `TickController` class comment cites the V2 maintenance manual's page 43 (Figure 9), which is printed page 55
  (Figure 10) in V3, and its pages 186 and 189 were not confirmed. The code is not changed (rule 12).
- **Brightness:** a value preset in `L:KLN90B_Brightness` before the boot is tested as public contract (`LVars.ts`
  documents the LVar as writable); the warm-up is a spec test on 3-3 and the maintenance manual.
- **The `PageProps` completeness test** of research D stays: `tsc` does not catch a member passed with `!` or
  `as any`.
- **Overlaps:** the right page after power-on (3-8) is research C's draft (the new `test/render/pages/PageManager.test.ts`,
  which also covers the in-session `ActiveWaypoint` save); research A's and E's versions are dropped. The five beeps are
  research B's draft, with research A's sibling "no beep without the altitude alert output"; research A's own beep test
  is dropped.
- **#171** is not pinned again at the render stage (the unit-stage pin holds it); the issue gets a comment.

## Bugs to file

Placeholders per rule 23, numbered by the research letter. Every one is searched on GitHub (open and closed) before it
is filed; the research searched the titles of all 326 issues and ran semantic searches.

| placeholder | research | where | what | expected | task |
|---|---|---|---|---|---|
| `#NEW-A-1` | A B6 | `VFROnlyPage.tsx:31` | a stray `,` at the start of the fourth row of the VFR only page | only the two texts (3-7, figure 3-22) | 1 |
| `#NEW-A-2` | A C2 | `PowerButton.forceReadyToUse` (`PowerButton.ts:99`), `Gps.ts:141-143` | every engine-running start posts SYSTEM TIME UPDATED TO GPS TIME and lights MSG: the GPS clock starts an hour behind and the hour is never added back | no message: a running unit needs no correction of more than 10 minutes (B-4); related, not the same: #211 | 1 |
| `#NEW-B-1` | B L6 | `NavCalculator.ts:53-54` | during the self test the RMI output (`L:KLN90B_GPS_WP_BEARING`, GPS WP BEARING) is 130° minus the variation | 130° (3-4, Installation Manual 2-68); `955b535` fixed the DTK on the line above the same way | 2 |
| `#NEW-B-2` | B L10, T8 | `PersistentMessages.ts:57-89` | ADJ NAV IND CRS TO 315° posts during the self test, so the status line reads `enr-leg msg` | `enr-leg` alone (figure 3-4, trainer T8); related, not the same: #177 | 2 |
| `#NEW-B-3` | B Q2, T11 | `SelfTestRightPage` time entry | the clock runs on through the time entry and keeps its running seconds at ENT | the clock starts at ENT from the entered time with the seconds at zero (3-6, trainer T11; medium) | 2 |
| `#NEW-C-1` | C 21 | `SimVarSync.ts:30-37` | an aircraft power loss under one second through `ElectricitySimVar` restarts the unit (Turn-On page, self test, power cycle count, procedures removed per #94) | the unit keeps operating; the switch-over cuts off after about 1.5 s (maintenance manual PDF 53, 54, 79); a fix needs longer waits in two contract tests of `SimVarSync.test.ts` | 3 |
| `#NEW-E-1` | E 1.9, T3, T4 | `MainPage.tsx` knob and CRSR branches | the knobs and CRSR do nothing on the MSG page | the MSG page closes and the knob acts on the page beneath; CRSR closes it and turns the cursor on beneath (the body of closed #56, trainer T3, T4); references #56 | 5 |
| `#NEW-E-2` | E 1.10 | `MainPage.tsx:677-699` (`checkIfSuperPageIsShown`) | Super NAV 1, MSG, D→: the MSG page is popped instead of Super NAV 1, which then covers the DIR page that has the cursor | the DIR page shows and Super NAV 1 is gone (3-27, 3-32); the fix of `#NEW-E-3` turns this pin red too | 5 |
| `#NEW-E-3` | E 1.11, T1, T2 | `MainPage.tsx:554-573` | D→ and ALT on the MSG page push their pages hidden under it; a following ENT goes to the nearest airport | the DIRECT TO page or the ALT page shows at once (3-27, 3-55, trainer T1, T2) | 5 |
| `#NEW-E-4` | E 1.16, T5 | `MainPage.tsx` overlay pop rule | with the cursor on SET 0's UPDATE PUBLISHED DB the inner knob leaves SET 0 and drops the update state | the inner knob does nothing on a prompt (trainer T5, one prompt; medium) | 5 |

**Comments on known issues** (the issues task): #171 (the visible effect reproduced on D/T 4 in a booted unit: DEP is
the time of the first fix after a cold start with SET 4 POWER), #199 (now also pinned on the boot Database page), #192
(the KLN 89 guide, 4-46 and 4-47, keeps a manually entered variation unless power was off for more than 5 minutes; the
90B guide is silent and `VolatileMemory.test.ts` holds the code's reset as a characterization).

**Known issue pinned again:** #199 (the boot Database page).

## Tasks

Rules 20 to 22 apply. Each implementer gets its research report, its drafts, the trainer report and this design. It
moves the drafts onto task 0's helpers, renames the research placeholders to the ones above, drops the drafts this
design assigns elsewhere, re-proves every test in its own worktree against the committed tree (by the break the report
recorded and by at least one break it chooses itself), and records one `Proof:` line per item in its commit. For every
bug it pins it applies the pin's temporary fix and runs the full suite, so that a test elsewhere that uses the bug as
its vehicle is found (Session 9b's lesson); it reports such tests instead of changing another task's file. A trainer
citation supports only what `research/trainer.md` records as observed. It reports a per-describe label audit (title,
spec or characterization, any page number or source) before the review. Each agent uses its own scratch folder
(`task-<n>/` in the session scratchpad).

- **Task 0, harness** (alone, before the others), each item with a harness test and its paragraph in `testing.md`:
    1. `bootToSelfTest(opts)` (`test/harness/boot.ts`): a cold-and-dark boot (`engineRunning: false`), `powerOn()`, and
       the clock advanced until the self-test page shows APPROVE?; it returns the `HeadlessUnit`. It takes the
       `BootOptions` (panel.xml, storage, `simVars`, `magvar`, position) and throws with the screen if APPROVE? does not
       show within a cap. The existing hand-written copies (`SelfTestLeftPage.test.ts`, `SelfTestRightPage.test.ts`,
       `SensorsOut.test.ts`, `HEvents.test.ts`, `NavCalculator.test.ts`, `Button.test.ts`, `enterIdent.test.ts`) stay as
       they are; tasks 1 and 2 move their own files onto the helper.
    2. `recordSounds(unit)` (a new `test/harness/sounds.ts`): it returns a recorder whose `ids` list the sound ids the
       unit requested on `sound_server_play_sound` since it was installed, and whose `finishAll()` reports the end of
       every requested sound (as `KLN90B.onSoundEnd` does in the sim), so that a sequence of beeps plays through. It replaces
       the hand-rolled recorder of the beep drafts.
    3. `testing.md` sections 4 (the two helpers) and 7 (the self-test boot item of the Session 4 list now exists).
- **Task 1, the Turn-On page and the start-up pages** (research A): `test/render/pages/WelcomePage.test.ts` and
  `test/render/pages/StartupPages.test.ts` (new). The SELF TEST IN PROGRESS test becomes a spec test citing figure
  3-3. Drop the right-page drafts (B9) and the five-beep draft (B8; its no-output sibling goes to task 2). Pins
  `#NEW-A-1`, `#NEW-A-2`, #199.
- **Task 2, the self-test pages and outputs** (research B, plus research A's no-output beep sibling):
  `SelfTestLeftPage.test.ts`, `SelfTestRightPage.test.ts`. Pins `#NEW-B-1`, `#NEW-B-2`, `#NEW-B-3` (new: drafted by
  the implementer from 3-6 and T11, with a passing sibling that the entered hour and minute show after ENT).
- **Task 3, the power cycle and the power inputs** (research C): `Dt4Page.test.ts`, `Ctr1Page.test.ts`,
  `BrightnessManager.test.ts`, `SimVarSync.test.ts`, and `test/render/pages/PageManager.test.ts` (new). Pin `#NEW-C-1`.
- **Task 4, the ticks, the composition root and startup robustness** (research D): `test/unit/TickController.test.ts`
  (new), `test/unit/Hardware.test.ts`, `test/unit/KLN90B.test.ts`, `test/render/KLN90BCore.init.test.ts` (new),
  `test/render/KLN90BCore.startup.test.ts`. No pins.
- **Task 5, the overlays and the input routing** (research E): `MainPage.test.ts`, `DirectToPage.test.ts`,
  `Set0Page.test.ts`, `PageContainer.test.ts`. Drop the `PageManager.test.ts` draft (task 3 owns it). Pins `#NEW-E-1`
  (the drafted knob pins plus a new CRSR pin from T4), `#NEW-E-2`, `#NEW-E-3`, `#NEW-E-4` (new: SET 0, cursor on
  UPDATE PUBLISHED DB, the inner knob both ways; the passing sibling holds the page with the cursor there). The
  #NEW-E-1 literals are derived from the 90B page order (3-12, 3-13); the trainer supports the rule, not the 89's
  page names.
- **Task 6, issues and close-out** (in the main checkout on the session branch, because it needs GitHub): the issues and
  comments above, the placeholders replaced in one commit, `testing.md` sections 6 (the MSG annunciator paragraph
  rewritten as `#NEW-A-2`) and 7 (the leads above and the tasks' leads), the session log with rule 18, and the
  checkbox. Issue edits (as opposed to comments and new issues) need the maintainer's explicit OK.

## Workflow

- **Models:** implementers on Sonnet (rule 26); a task whose implementer struggles is re-dispatched on Opus. Reviewers
  on Opus for tasks 2, 3 and 5 and on Sonnet for tasks 0, 1 and 4; re-reviews on Sonnet. The final review of the
  session runs on the controlling session's model.
- **Worktrees:** each implementer resets its worktree branch to `tests-session-10-boot-power` (after task 0 has merged)
  first; the controller checks the merge base before every review. Agent worktrees lack `node_modules`; a junction to
  the main checkout's is created, and removed with `rmdir` before `git worktree remove`, only after the maintainer
  approves the session. The research worktrees are cleaned up the same way.
- **Reports:** implementers write `.task-report.md` at the root of their own worktree (untracked) and reply with the
  status, the head commit and their concerns; reviewers write into `task-<n>/` of the session scratchpad. Commit
  messages without a byte order mark.
- **File owners:** every file has one task. Tasks 0 and 6 alone touch `testing.md` and the harness. A task that needs a
  change in another task's file reports it instead.
- **Merge order:** by completion.
- **Done when:** each of the six items has a test or a log line, `grep -r "#NEW-" test/` finds nothing, and `npm test`
  and `npx tsc --noEmit` are clean.
