# Mode controller: OBS/LEG and approach arming: design

Date: 2026-10-14. Milestone 2. Issues: #122, #129, #139, #151, #152, #153, #154, #155, #162, #163, #190, #194, #261,
#338, #369. Branch: `m2-mode-controller`.

The session started from the fourteen issues of the milestone (nine bugs, five questions). The inventory found one
more bug of the #129 kind, filed as #369 (`ARM GPS APPROACH` misses a fix that is IAF and FAF) and added to the
milestone, and a wider symptom of #261 (a Direct To in OBS mode loses its course to the indicator's read-back),
recorded as a comment on #261 and fixed with it.

## 1. Evidence

**Maintainer rulings (2026-10-14).**
- #162: keep the immediate re-activation after the GPS APR press before the FAF; hold it with a characterization and
  close the question.
- #163: in ACTV the scale ramps from the scale at activation to 0.3 over the distance left at activation, capped at 1.
  Cases 2 (a Direct To the FAF inside 2 NM re-activates) and 3 (a pilot-selected 0.3 is kept) stay as they are.
- #194: follow the trainer: the ANGLE cursor starts VNAV from Inactive only.
- #190: an active VOR outside the variation area is referenced to true north too (5-44 wins over 5-35).
- The design (sections 2 to 5) was approved in chat, including FAF promotion only for adjacent copies, the ramp on a
  button arm inside 30 NM, filing #369 and the comment on #261.

**KLN 89 trainer, 2026-10-14** (this session; to be recorded in `docs/testing.md` section 8 with the fixes). High
confidence unless noted. FPL 0 KORD, KUGN, KENW, KMKE, KENW unless noted.
- **VNAV beyond the active waypoint, then OBS (#338).** VNAV to KMKE (KUGN active), counting down; OBS; at the next
  VNAV recompute the status became Inactive and the VNAV waypoint showed the active waypoint KUGN. No message. Back to
  LEG, KMKE did not come back. The same in a descent already active. VNAV to the active waypoint stayed active through
  OBS. Limit: the 89 recomputes VNAV only when an ALT 2 value is turned, so the cancel was seen at a recompute, not at
  the mode press; a LEG-OBS-LEG round trip without a recompute kept VNAV to KMKE.
- **ACTIVATE in OBS (#154).** OBS 045, KUGN active, Fly L 16.4 NM; FPL 0 cursor on KMKE, D->, D-> (`ACTIVATE:`), ENT:
  KMKE active, course 045 kept, Fly L 37.5 NM. A plain Direct To in OBS gave Fly R 0.00 NM and the course 006.
- **A waypoint twice in FPL 0 (#152).** The second KENW (row 5) active, by a Direct To from FPL 0 and, separately, by
  sequencing onto the leg KMKE - KENW: it stayed active through OBS and back to LEG; row 3 was never activated.
- **LEG to OBS on a long leg (#151).** FPL 0 KMSN, user waypoint at the position of KMKG (about 136 NM), the aircraft
  100 NM before it on the great circle, centred (Fly R 0.02 NM, DTK 94): after OBS, Fly R 0.02 NM, course shown 097,
  held internally with a fraction (about 097.5, found by setting 096, 097 and 098 by hand). The deviation was kept; the
  course was not the DTK at the aircraft.
- Side note, not part of this milestone: in OBS mode the 89's NAV 1 shows only the arrow (`-> KMKE`) after a Direct
  To, where a Direct To in LEG shows `D->`.

**Earlier trainer checks** (`docs/testing.md` section 8): OBS to LEG on the FROM side re-activates the plan leg with
the leg's DTK and keeps the deviation (2026-10-06, #155); with VNAV active, moving the cursor onto the VS field
changed nothing (2026-10-06, medium, #194). The 89 shows neither ARM nor ACTV, so no trainer evidence exists for
#129, #139, #162, #163 or #369.

**Pilot's Guide.** 5-35 (OBS entry with the colon; slewed indicators; a VOR uses its published variation), 5-36
(LEG to OBS keeps the deviation when the unit chooses the course; OBS to LEG keeps the active waypoint and re-orients
on the FROM side), 5-37 (Direct To in OBS sets the course when the pointer is driven; ACTIVATE does not recentre),
5-38, 5-44 (true north outside N 74 / S 60, also for an active waypoint in OBS mode), 5-8 (VNAV starts with the cursor
on ANGLE), 6-1 (ARM within 30 NM, the 30 s scale change, the GPS APR switch disarms and cancels ACTV), 6-3 (ACTV
conditions, the ramp to 0.3 over the last 2 NM), 6-10 and 6-11 (IAF = FAF, the course reversal in OBS, LEG makes the
FAF active; a late LEG switch compresses the ramp), 6-19 (missed approach holding fix = FAF), B-1 (`ARM GPS
APPROACH`).

**Real-world navdata, AIRAC 2607.** Of the approaches the unit loads (no RF legs, no RNP AR), 715 at 577 airports have
a transition whose IAF is the FAF (mostly VOR and NDB, 5 RNAV). In 436 the two copies are next to each other in the
loaded plan; in 279 (mostly Canada, e.g. FRALY, RUBTU, FRALY) another fix lies between them. No leg is coded IAF and
FAF at once. The missed approach holding fix is the FAF in 537 approaches. Caveat: the sim compiles its own navdata,
which may split or flag legs differently.

**Inventory and temporary fixes (2026-10-14).** Baseline 3857 tests, all green, `tsc` clean. Every suggested fix was
applied on its own and all together, with the full suite each time; the combination fails exactly the sum of the
single runs (no interactions).
- #151 changes seven tests outside its pin that hard-code the DTK at the aircraft as the OBS course:
  `SuperNav5Left.test.ts:85` (and the open #321 pin at :97 hard-codes `ENR:050`), `ObsDtkElement.test.ts:50`,
  `Mod2Page.test.ts:238` (its sibling :246 stays green but would no longer test "just below north"),
  `Nav3Page.test.ts:113` and `:138`, `SuperNav5Page.test.ts:591` and `:600` (precondition at :583). Without an
  `isValid()` guard on the path it also breaks the two #67 tests in `ActiveWaypoint.test.ts:150,166`.
- #152 alone breaks `makes the FAF copy active when the missed approach holding point is the FAF`
  (`ModeControllerObs.test.ts:304`), which passes today only because the first copy is the FAF.
- Removing the `setObs` early return (#122 variant a) fixes #122 and #154, but `tick` would then rewrite the active
  waypoint every second in OBS: `activeWaypointChanged`, the SDK flight plan in `WTFlightplanSync`, the persisted
  `activeWaypoint` setting and the turn stack. Skipping only in OBS with the same course (variant b) needs the course to
  be chosen before the mode switch, which un-fixes the #190 course pin, and does not fix #154.
- #261's fix applied at `DirectToPage.tsx:119` too fixes the Direct To case (scratch test: indicator on 120, D-> ABC
  gave `obsMag` 120 and 18 NM deviation before, 090 and centred after).
- #129's rule is also missing in `PersistentMessages.ts:135` (#369).
- `ModeControllerApproach.test.ts:105` is written around #139.

## 2. Applying the OBS course

### A. `setObs(obsMag, force = false)`

The early return stays for an unchanged course unless `force` is set. Every call that changes the course on purpose
or changes the waypoint the course runs through passes `force`:
- `forceSwitchToEnrObsMode` (entering OBS), which fixes **#122**;
- ACTIVATE in `DirectToPage.performDirectTo`, which fixes **#154**.

The 1 Hz read-back in `tick` and the knob handlers keep the early return.

### B. `setObsOnUnit(obsMag)` (#261)

A course set on the unit (MOD 2 and `ObsDtkElement`, i.e. NAV 3 and Super NAV 5, and the Direct To in OBS mode) goes
through a new `ModeController` method that calls `setObs` and then writes the OBS output at once
(`sensors.out.setObs`), so the indicator is slewed before the next read-back. With a pointer the unit only reads
(`ObsTarget` 0) the extra write sends nothing new; `NavCalculator` stays the regular writer. The Direct To case gets its
own test in the #261 commit.

### C. The course chosen on LEG to OBS (#151)

When the unit chooses the course, it takes the bearing of the current path at the active waypoint (the course the leg
arrives with), so the course through the waypoint is the leg itself and the deviation is kept on any leg length. The
existing fallback stays for a path that is not valid (TO and FROM the same waypoint, #67). The seven tests listed in
section 1 get their expected courses re-derived in the same commit; `Mod2Page.test.ts:238` gets a geometry whose new
course is still just below north, so it keeps testing the north rule.

### D. True north for an active waypoint outside the area (#190)

`KLNMagvar.isMagvarValid()` also returns false in an OBS mode when the active waypoint lies outside N 74 / S 60. It
compares the nav mode with the `const enum` values directly instead of importing `isObsMode`, which would close an
import cycle. `ModeController.getMagvarForObs` checks validity before the VOR branch, so an out-of-area VOR is also
referenced to true north (the maintainer's ruling). The reset of `userMagvar` in `KLNMagvar.tick` keeps keying on the
aircraft position only.

## 3. Returning to LEG

### A. FAF promotion (#153, then #152)

**#153 first.** In the TO branch of `switchToEnrLegMode`, when the active leg is typed IAF and the next FPL 0 leg is the
same fix (ICAO) typed FAF, the FAF copy is activated by its index (6-11). Today's first-copy rule still covers the
missed approach hold = FAF case, so every test stays green.

**#152 next.** The TO branch keeps the active copy (`directToFlightplanIndex` with the active index) instead of the
first leg with that ICAO. To keep 6-19, the same commit adds the second promotion: when the active leg is the missed
approach holding fix and the approach's FAF is the same fix, the FAF copy becomes active. The test at
`ModeControllerObs.test.ts:304` stays green.

**Adjacent copies only.** Promotion applies to an IAF copy directly followed by its FAF copy. Where another fix lies
between them (the 279 approaches of section 1), the course reversal is coded as legs the unit sequences, and
promoting would skip them. This is a characterization; no source shows the non-adjacent case.

### B. The FROM side (#155)

The FROM branch keeps `activateFpl0()` and the `obsMag` reset and drops the Direct To from the present position, so the
leg found by position stays active as a plan leg. `reorientFlightplanLeg` becomes dead code and goes.

## 4. Approach arming and the CDI scale

### A. `getActiveFaf()` (#129, then #369)

A helper `ActiveWaypoint.getActiveFafLeg()` returns the FAF leg when the FAF copy is active, or when the active leg is
an IAF copy whose next FPL 0 leg is the same fix typed FAF; null otherwise. `ActiveWaypoint` already holds FPL 0, and
both `ModeController` and `PersistentMessages` reach it through the nav state.
- **#129** introduces it in `checkSwitchAprArmToActive` and `adjustXtkScaleActive`. A new test follows the unit past the
  activation on the IAF copy: the sequencing over the zero-length IAF to FAF leg, and the scale ramp continuing.
- **#369** uses it in `ArmGPSApproachMessage`. It comes after #139, which makes ENR mode near the FAF reachable.

### B. The pilot's disarm (#139)

`armApproachPressed` in ARM-LEG and ARM-OBS records the first APP leg object of FPL 0 at the moment of the disarm. The
automatic arm in `tick` is skipped while FPL 0's first APP leg is still that same object. The next press clears the
record, and so does removing, replacing or reloading the approach (a new leg object), including a different approach
at the same airport.

The same commit changes the button arm in ENR inside 30 NM: it no longer sets ±1 at once but leaves the scale to the
30 s ramp of `adjustXtkScaleArm`, as the automatic arm does (6-1, 6-3). This case becomes reachable only with the
disarm. The plan measures which tests assert the immediate ±1 before the commit.

### C. #162

No code change. A characterization holds that the unit is back in ACTV one calculation tick after the GPS APR press
1.5 NM before the FAF. The commit says `fixes #162`.

### D. The ACTV scale ramp (#163)

On the switch to ACTV, `ModeController` records the distance to the FAF and the scale at that moment (at most 1). In ACTV
the scale is `0.3 + (s0 - 0.3) * dist / d0`, capped at 1, with today's early return for a scale already at 0.3 (case 3)
and the 0.3 past the FAF unchanged. Without a recorded activation (a test that sets the mode directly) the values
default to 2 NM and 1, so the usual activation at 2 NM gives exactly today's `0.35 * dist + 0.3`. A late LEG switch at
1 NM ramps 1 to 0.3 over that 1 NM (6-11's compressed change); moving back out stays at 1 (characterization). Case 2
gets a characterization. The commit says `fixes #163`.

## 5. VNAV

**#194.** `Vnav.armVnav` starts VNAV only from Inactive; an Active VNAV keeps its path and advisory altitude while the
cursor stays on ANGLE, and Armed is unchanged. The characterization `re-arms an active descent from the present
altitude when armVnav runs again` in `test/unit/services/Vnav.test.ts` becomes a test of the new rule citing the trainer
check of 2026-10-06 (medium confidence, as recorded).

**#338.** No code change: since #185, `Vnav.tick` clears a VNAV waypoint that is not the active one in OBS mode and
goes Inactive, NAV 4 then shows the active waypoint, nothing is posted, and LEG does not restore it, which is what the
89 showed. A test holds it, citing the trainer check of 2026-10-14 for what the 89 showed (cancel, the active waypoint
shown, no message, not restored) and nothing more; that the cancel happens at once rather than at a recompute is a
characterization. The commit says `fixes #338`.

## 6. Tests, labels and docs

- Each fix commit turns its pins into passing tests (`it.fails` to `it`, the issue number kept in the title) and adds
  tests at the cheapest stage for what no pin holds (named in sections 2 to 5).
- **Labels.** A test cites only what its source literally shows. The trainer supports only what the 89 showed: it has
  one knob pair, no ARM or ACTV annunciation, no Super NAV 5, no external indicator. IAF/FAF adjacency, the activation
  ramp formula, the disarm record and the cap at 1 are characterizations.
- Every implementer applies the fix and runs the full suite before committing, and greps the suite for tests that use
  the bug as a vehicle.
- Each commit updates the docs that describe its bug: `docs/architecture.md:422-426` (#129, #139) and the
  `docs/testing.md` lines the inventory listed (around 971, 1284, 1287, 1341-1342; recheck before editing), and adds
  its part of the 2026-10-14 trainer record to `docs/testing.md` section 8 (#151, #152, #154, #338).
- No manual text in code, tests, docs, commits or issues; page numbers and paraphrase only.

## 7. Tasks and order

One `fixes #NN` commit per issue, in this order within each lane. Lanes integrate linearly (cherry-pick) onto
`m2-mode-controller`; every lane worktree starts with `git merge --ff-only m2-mode-controller`.

| Lane | Commits, in order | Owns |
|---|---|---|
| A. Mode controller | #153, #152, #155, #122, #154, #261, #151, #129, #139, #369, #162, #163 | `ModeController.ts` (except `getMagvarForObs`), `DirectToPage.tsx`, `Mod2Page.tsx`, `ObsDtkElement.tsx`, `PersistentMessages.ts`, their tests |
| B. Variation | #190 | `KLNMagvar.ts`, `ModeController.getMagvarForObs`, `KLNMagvar.test.ts` |
| C. VNAV | #194, #338 | `Vnav.ts`, `Nav4Page.tsx`, the VNAV tests |

Lane A is long and sequential; the plan may split it into several tasks run one after the other. Lanes B and C run in
parallel with it. `docs/testing.md` is edited by all three lanes; each commit touches only its own lines, and conflicts
are resolved at integration.

**Close-out:** no issue is closed manually; the `fixes #NN` commits close them when the maintainer pushes. The trainer
observations of 2026-10-14 also go into the project memory.

## 8. Side checks and out of scope

The plan checks these and files an issue where a bug is confirmed; none is fixed in this milestone:
- `Mod2Page.innerRight` returns `false` while the other handlers return `true` (the shape of the closed #238); no effect
  seen yet.
- The 89 shows only the arrow on NAV 1 after a Direct To in OBS mode. A 90B issue needs a 90B source; the 89 alone is
  not enough.

Out of scope: #321 (Super NAV 5 mode row; its pin's expected course moves with #151 and is updated there), the
non-adjacent IAF = FAF shape, and RAIM-dependent ACTV conditions (not modeled).
