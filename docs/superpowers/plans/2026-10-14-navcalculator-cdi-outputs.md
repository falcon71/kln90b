# NavCalculator, CDI Scale and Outputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone-3 issues #146, #372, #147, #120, #159, #160, #260, #121, #368 and #143 of the KLN 90B
simulator, one commit per issue.

**Architecture:** Four independent lanes. Lane A changes `NavCalculator.tick` (one alert rule for a waypoint without a
turn, used in OBS mode too; navigation on the incoming course for a final zero-length leg; no scale reset on a flag).
Lane B replaces the duplicated CDI scale code of MOD 1 and MOD 2 with one `CdiScaleField`. Lane C decides "between" on
a DME arc by the angle along the arc. Lane D adds the runtime override `L:KLN90B_HeadingInput` and gates the roll
command on the heading input.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (stages unit, render,
flight; render runs on happy-dom with the headless unit of `test/harness`).

**Spec:** `docs/superpowers/specs/2026-10-14-navcalculator-cdi-outputs-design.md` (read it before any task: it holds the
evidence, the trainer results, the rulings and the reasons). The inventory with every measured temporary fix is
`C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\4504cfcf-106e-4a37-9f00-529791e52565\scratchpad\inventory\report.md`;
the trainer report is `...\scratchpad\trainer\report.md` in the same session folder.

## Global Constraints

- **Branches.** The integration branch is `m3-navcalculator`. Each task works in its own worktree; its first command is
  `git merge --ff-only m3-navcalculator` (agent worktrees start at master's HEAD). The controller integrates a finished
  task by cherry-pick, so the history stays linear. Never push. Never commit on `master`.
- **One commit per issue**, with its tests and doc changes in the same commit, in the order of this plan. The subject is
  `fixes #NN <description>` (a plain sentence, American English, lowercase after the number). End the message with the
  Co-Authored-By line your own attribution instructions give you. Write commit messages without a BOM (Bash heredoc or
  `-m`). A commit that also changes a pin or comment of another issue says `references #NN` for it in the body.
- **Before every commit:** `npx tsc --noEmit` is clean and the WHOLE suite `npm test` is green (about one minute), not
  only the task's files. Every test whose result changes must be one the task names; any other change is a finding to
  report before committing (it may be a test that used the bug as its vehicle).
- **Pins:** a fixed bug's `it.fails(...)` becomes `it(...)`; the issue number stays in the title. Rewrite its comment so
  it describes the fixed behavior and its evidence, not the old bug.
- **Test labels (`test/README.md` section 5):** a test's title cites what supports its assertion: a Pilot's Guide page
  (`5-38`), an Installation Manual page (`2-69`), a dated trainer check (`checked in the KLN 89 trainer, 2026-10-14`), or
  it says `characterization`. A citation supports only what that page or that trainer entry literally says. The 89 has
  one knob pair, no ARM/ACTV annunciation, no Super NAV 5, no external annunciators or indicators, no roll steering and
  no heading input, so nothing about those comes from it. The maintainer's rulings and the CDI display rule for the ramps
  are characterizations. The AVsoftech trainer is cited by no test. A characterization carries no page number, and a
  `describe` titled with a page holds spec tests only. Report, per new or changed `describe`/`it`, its title and whether
  it is spec, trainer or characterization.
- **Copyright:** the manuals are copyrighted. Cite page numbers and paraphrase; never copy manual text (no run of more
  than a few words) into code, comments, docs, tests or commit messages.
- **Code style:** match the surrounding code (4-space indent, double quotes in `kln90b/`, single quotes in `test/`,
  `//` comments citing pages like `//5-38` or issues like `//#372`). `target: es2017`.
- **State:** service classes keep no mutable state; runtime state goes on the nav state in `VolatileMemory` and is reset
  in `VolatileMemory.reset` where it belongs to a power cycle.
- **No counts in prose** for things that grow (tests, files, issues, LVars).
- **Do not fix other bugs on the side.** A new bug is reported to the controller, who files it.
- **Asserted literals are derived independently** (the spec, the trainer record, a hand computation, or
  `test/harness/flight/geo.ts`), never copied from the output of the code under test. If a literal below turns out
  wrong, report it with your derivation; do not silently change it.
- **Mutation check:** after the fix is green, break the fix once (revert its key line), confirm the new tests and the
  converted pins turn red, restore, and confirm `git diff` shows only the intended change. Report which tests went red.
- **Docs:** each commit updates the lines of `docs/architecture.md`, `test/README.md`, `docs/test-next-steps.md` and
  `test/harness/` comments that describe its bug or the changed behavior (find them with `grep -n '#NN' docs/ test/` and
  the names the task gives). Dated records (`docs/kln89-trainer-record.md` blocks, `docs/test-coverage-record.md`,
  the specs and plans) are never edited.
- **Worktrees:** create a `node_modules` junction to the main checkout's
  (`New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules` in PowerShell). Never delete
  through it; the controller removes the junction (`cmd //c rmdir node_modules`) before removing the worktree.
- **Scratch files** go in your own folder
  `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\4504cfcf-106e-4a37-9f00-529791e52565\scratchpad\task<N>\`.
- **Reports:** write your report with the Bash tool (`cat > '.task-report.md' <<'EOF'`) at the root of your worktree
  (untracked, never committed); if that is refused, return it in full as text.

**User decisions (already made):**
- The spec as committed (b6ad3ed), approved by the maintainer on 2026-10-14.
- #372: with turn anticipation on, a waypoint without a turn alerts about 15 s before it (the KLN 89 trainer's
  measurement wins over 3-29 and the KLN 89 guide's 3-35).
- #143: without a heading input `L:KLN90B_RollCommand` is 0, also on the self-test page; `GPS COURSE TO STEER` is
  written as today with or without heading input, with a code comment saying this is deliberate.
- #368: the unit never changes the stored map orientation; while heading input is off a stored HDG up is drawn north up
  and its field shows N up; a runtime change takes effect at the next page build.
- #120: a final zero-length leg navigates on the incoming leg's course (as the 89 did); without an incoming leg XTK, DTK
  and TO/FROM are null.
- The flight harness defaults to `HeadingInput` true.

---

## Tasks, order and file ownership

| Task | Commits, in order | Main files | Starts after |
|---|---|---|---|
| 0 | docs: trainer record 2026-10-14 evening | `docs/kln89-trainer-record.md` | — (controller) |
| 1 | #146, #372, #147 | `NavCalculator.ts` (alert), `NavCalculator.test.ts`, `SuperNav5Page.test.ts:400-409`, new flight test | Task 0 |
| 2 | #120, #159 | `NavCalculator.ts` (zero-length leg, `setFlag`), `VolatileMemory.ts`, `NavCalculator.test.ts`, `duplicateWaypoint.test.ts` | Task 1 |
| 3 | #160, #260 | new `CdiScaleField.tsx`, `Mod1Page.tsx`, `Mod2Page.tsx`, `Mod1Page.test.ts`, `Mod2Page.test.ts` | Task 0 |
| 4 | #121 | `ActiveWaypoint.ts`, `test/unit/data/flightplan/ActiveWaypoint.test.ts` | Task 0 |
| 5 | #368 | `LVars.ts`, `KLN90BPlaneSettings.ts`, `SimVarSync.ts`, `Sensors.ts`, `KLN90BUserSettings.ts`, `MapOrientationSelector.tsx`, `SuperNav5Right.tsx`, `Nav5Page.tsx`, `SuperNav5Page.tsx`, `cfg/panel.xml`, new `test/render/HeadingInput.test.ts`, `KLN90BPlaneSettings.test.ts` | Task 0 |
| 6 | #143 | `RollSteeringController.ts`, `KLN90BCore.ts`, `test/harness/flight/Flight.ts`, `RollSteeringController.test.ts`, `SensorsOut.test.ts`, `SelfTestLeftPage.test.ts`, `HeadingInput.test.ts` | Task 5 |

Tasks 1 to 2 (lane A) and 5 to 6 (lane D) run one after the other; lanes A, B, C and D run in parallel. No source or
test file has two owners. `SuperNav5Page.test.ts` belongs to Task 1 (one test); Task 5 puts its Super NAV 5 test in
the new `test/render/HeadingInput.test.ts`.

---

### Task 0: Record the KLN 89 trainer checks of 2026-10-14 (evening)

**Goal:** One docs commit that adds the evening block of 2026-10-14 to `docs/kln89-trainer-record.md`, before any lane
starts.

**Files:**
- Modify: `docs/kln89-trainer-record.md` (a new block at the end, after the last bullet of the `**2026-10-14**` block)

**Acceptance Criteria:**
- [ ] A `**2026-10-14** (evening)` block with the bullets below, paraphrased, with the issue numbers.
- [ ] No other line of the file changes.

**Verify:** `git diff --stat HEAD~1` → only `docs/kln89-trainer-record.md`; `git diff HEAD~1` shows only added lines.

**Steps:**

- [ ] **Step 1: Append the block** at the end of the file:

```markdown

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
```

- [ ] **Step 2: Commit**

```bash
git add docs/kln89-trainer-record.md
git commit -m "Record the evening KLN 89 trainer check of 2026-10-14 (#146, #147, #372, #120)" -m "Co-Authored-By: <your attribution line>"
```

```json:metadata
{"files": ["docs/kln89-trainer-record.md"], "verifyCommand": "git diff --stat HEAD~1", "acceptanceCriteria": ["2026-10-14 evening block with the paraphrased bullets", "no other line changes"], "modelTier": "mechanical"}
```

---

### Task 1: The waypoint alert (#146, #372, #147)

**Goal:** Three commits in `NavCalculator.tick`: a flight test for the Direct To a plan waypoint (#146, no code change),
one alert rule for a waypoint without a turn (#372), and the same rule in OBS mode (#147).

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts` (constants :16-18, the sequencing block :164-252, a new private method)
- Create: `test/flight/flights/directToPlanWaypoint.test.ts`
- Test: `test/render/data/navdata/NavCalculator.test.ts` (the 3-29 describe :226-245; new describes after it),
  `test/render/pages/left/SuperNav5Page.test.ts` (:400-409 only)
- Docs: `docs/architecture.md` (the alert thresholds ~416, the sequencing bullets ~407-415), `docs/test-next-steps.md`
  (~291-292, the open trainer questions #146 and #147)

**Acceptance Criteria:**
- [ ] #146: a flight test flies a Direct To ABC from FPL 0 (KAAA, ABC, KBBB) and shows the DTK switching to the next
  leg before ABC, the alert 15 to 25 s before that switch, and KBBB active afterwards as a plan leg (not a Direct To).
- [ ] #372: with turn anticipation on, a Direct To ABC outside the plan alerts at 0.4 NM (12 s) and not at 0.6 NM (18 s)
  at 120 kt, and the alert is off 0.2 NM past ABC; with turn anticipation off it alerts at 1.1 NM and not at 1.3 NM; the
  last waypoint of FPL 0 with turn anticipation on follows the 15 s rule.
- [ ] #147: in OBS mode toward ABC the alert is off at 0.6 NM, on at 0.4 NM, off 0.2 NM past, and ABC stays active
  (turn anticipation on); with it off: off at 1.3, on at 1.1 NM.
- [ ] `SuperNav5Page.test.ts`'s alert test still passes from 0.4 NM.
- [ ] `tsc` clean; full suite green; three `fixes` commits in this order.

**Verify:** `npx vitest run test/render/data/navdata/NavCalculator.test.ts test/flight/flights/directToPlanWaypoint.test.ts test/render/pages/left/SuperNav5Page.test.ts`
→ all pass; then `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#146): write the flight test.** Create `test/flight/flights/directToPlanWaypoint.test.ts`. It follows
  `firstFlight.test.ts` (read it first; `flight.panel` is the `FrontPanel`, whose `directTo(ident)` types the ident and
  approves it, and a typed Direct To a waypoint of FPL 0 takes its place in the plan, `ActiveWaypoint.test.ts` render
  stage :58):

```ts
import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, distanceNm, pointBefore} from '../../harness/flight/geo';

// #146: a Direct To a waypoint of FPL 0 that has a following leg is flown like the plan leg: the turn onto the next leg
// is anticipated, the alert comes about 20 s before the turn (4-8), and the plan resumes after the waypoint (4-10).
// Checked in the KLN 89 trainer, 2026-10-14: the DTK switched to the next leg 2.0 NM before the waypoint, the alert came
// 22 to 23 s before that, and the next leg was a plan leg afterwards. A plain Direct To would alert about 36 s before
// the waypoint and switch only there.
describe('a Direct To a waypoint of FPL 0 with a following leg (#146)', () => {
    it('anticipates the turn onto the next leg and alerts about 20 s before it (checked in the KLN 89 trainer, 2026-10-14, #146)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
        const start = pointBefore(kaaa, abc, 10);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)},
        });
        await flight.flyUntilActive('ABC', {timeout: 30});
        await flight.panel.directTo('ABC');
        const aw = flight.unit.props.memory.navPage.activeWaypoint;
        expect(aw.isDctNavigation()).toBe(true); // Preconditions: a Direct To, and ABC is the plan's ABC
        expect(aw.getActiveFplIdx()).toBe(1);

        let alertOnAt: number | null = null;
        flight.monitor('waypoint alert before the turn', f => {
            if (alertOnAt === null && f.sim.get('L:KLN90B_WptLight', 'bool')) alertOnAt = f.t;
            return true;
        });

        const leg2 = courseDeg(abc, kbbb);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || angleBetween(flight.nav.dtkTrue, leg2) < 1,
            {timeout: 600, description: 'start of the turn at ABC'});
        // The DTK switched while ABC was still active, before ABC: the turn is anticipated (4-8). The bounds are those
        // of firstFlight.test.ts for the same 34° turn at 120 kt (0.20 NM of lead plus up to 0.12 NM to roll in)
        expect(flight.nav.activeIdent).toBe('ABC');
        const distAtTurnStart = distanceNm(flight.aircraft, abc);
        expect(distAtTurnStart).toBeGreaterThan(0.2);
        expect(distAtTurnStart).toBeLessThan(0.45);
        // About 20 s before the turn (the 89: 22 to 23 s). A plain Direct To would have alerted 36 s before ABC, about
        // 26 s before this turn start, so the upper bound excludes it
        expect(alertOnAt).not.toBeNull();
        const alertLead = flight.t - alertOnAt!;
        expect(alertLead).toBeGreaterThan(15);
        expect(alertLead).toBeLessThan(25);

        // 4-10: the plan resumes: KBBB is the next plan leg, not a Direct To
        await flight.flyUntilActive('KBBB', {timeout: 60});
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.isDctNavigation()).toBe(false);
    });
});
```

- [ ] **Step 2: run it.** `npx vitest run test/flight/flights/directToPlanWaypoint.test.ts` → PASS (no code change: the
  code already anticipates the turn). Mutation check: in `NavCalculator.tick` make the turn-anticipation branch
  require `nav.activeWaypoint.isDctNavigation() === false`; the test must go red (the DTK no longer switches early);
  restore. If `flight.panel.directTo` does not work in the flight stage (it advances fake timers), report it and use
  the flight harness's own way of pressing keys (`flight.panel.press`), keeping the assertions.

- [ ] **Step 3: docs and commit.** In `docs/test-next-steps.md` ~291-292 drop #146 from the open trainer questions (it is
  answered by the 2026-10-14 check). Commit `fixes #146 hold the anticipated turn after a Direct To a waypoint of FPL 0 with a following leg`.

- [ ] **Step 4 (#372): rewrite the 3-29 describe and add the tests.** In `NavCalculator.test.ts` replace the describe
  `waypoint alert on a Direct To (3-29)` (:226-245, including its comment) with:

```ts
// #372: with turn anticipation on, a waypoint without a turn to anticipate alerts about 15 s before it, and the alert
// ends once the waypoint is passed. Checked in the KLN 89 trainer, 2026-10-14: a Direct To outside the plan alerted 1.0 NM
// out at 239 kt and 0.5 NM out at 121 kt (ETE :14 both times) and stopped at the waypoint; with turn anticipation off it
// alerted 2.4 NM out at 239 kt (36 s). The guides give about 36 s for a Direct To (3-29) without this distinction; the
// maintainer ruled for the measured 15 s. At 120 kt 15 s are 0.5 NM: off at 0.6 NM (18 s), on at 0.4 NM (12 s).
describe('waypoint alert on a Direct To outside the flight plan (checked in the KLN 89 trainer, 2026-10-14)', () => {
    /** A Direct To ABC from 5 NM before it, ABC not in any plan; the aircraft then held on the line to ABC at 120 kt */
    async function directToAbc(turnAnticipation: boolean) {
        const {kaaa, abc} = standardRoute();
        const start = pointBefore(kaaa, abc, 5);
        const unit = await bootUnit({facilities: [kaaa, abc], position: start, storage: {turnAnticipation}});
        await settle(unit);
        await unit.panel.directTo('ABC');
        expect(nav(unit).activeWaypoint.isDctNavigation()).toBe(true); // Preconditions
        expect(activeIdent(unit)).toBe('ABC');
        expect(nav(unit).activeWaypoint.getActiveFplIdx()).toBe(-1);
        const at = (nmBefore: number) => moveAircraft(unit, pointBefore(start, abc, nmBefore), {groundspeedKt: 120, trackTrue: courseDeg(start, abc)});
        return {unit, abc, start, at};
    }

    it('starts about 15 s before the waypoint with turn anticipation on (checked in the KLN 89 trainer, 2026-10-14, #372)', async () => {
        const {unit, at} = await directToAbc(true);

        await at(0.6);
        expect(nav(unit).waypointAlert).toBe(false);

        await at(0.4);
        expect(nav(unit).waypointAlert).toBe(true);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(1);
    });

    it('ends once the waypoint is passed (checked in the KLN 89 trainer, 2026-10-14, #372)', async () => {
        const {unit, abc, start, at} = await directToAbc(true);
        await at(0.4);
        expect(nav(unit).waypointAlert).toBe(true); // Precondition: the alert is on

        // 0.2 NM past ABC, 6 s: inside 15 s of the waypoint, but behind it
        await moveAircraft(unit, pointFrom(abc, finalCourseDeg(start, abc), 0.2), {groundspeedKt: 120, trackTrue: finalCourseDeg(start, abc)});
        expect(activeIdent(unit)).toBe('ABC'); // nothing to sequence to
        expect(nav(unit).toFrom).toBe(false); // FROM
        expect(nav(unit).waypointAlert).toBe(false);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);
    });

    // 36 s at 120 kt are 1.2 NM: off at 1.3 NM (39 s), on at 1.1 NM (33 s)
    it('starts about 36 s before the waypoint with turn anticipation off (checked in the KLN 89 trainer, 2026-10-14)', async () => {
        const {unit, at} = await directToAbc(false);

        await at(1.3);
        expect(nav(unit).waypointAlert).toBe(false);

        await at(1.1);
        expect(nav(unit).waypointAlert).toBe(true);
    });
});

// The last waypoint of FPL 0 has no turn to anticipate either and takes the same branch; the 89 was flown only toward a
// waypoint followed by a copy of itself (see the #120 tests), so this case is a characterization of the same rule
describe('waypoint alert at the last waypoint of FPL 0 with turn anticipation on (characterization)', () => {
    it('starts about 15 s before the last waypoint (characterization, #372)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc], position: pointBefore(kaaa, abc, 5), storage: savedFlightplan(0, [kaaa, abc])});
        await settle(unit);
        expect(activeIdent(unit)).toBe('ABC'); // Precondition: ABC is active and the last waypoint
        expect(nav(unit).activeWaypoint.getActiveFplIdx()).toBe(1);
        const leg = finalCourseDeg(kaaa, abc);

        await moveAircraft(unit, pointBefore(kaaa, abc, 0.6), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(false);

        await moveAircraft(unit, pointBefore(kaaa, abc, 0.4), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(true);
    });
});
```

  Add `pointFrom` to the geo import if it is missing (it is imported today). In `SuperNav5Page.test.ts` (:400-404)
  change the comment and the position of `flashes the active identifier during the waypoint alert (3-29, 4-8)`: the
  aircraft moves at 120 kt 0.4 NM before ABC, 12 s out, inside the 15 s alert of a Direct To with turn anticipation on
  (#372); `pointFrom(w.abc, 180, 0.4)`. (0.5 NM is exactly 15 s and would sit on the boundary.) Keep its title.

- [ ] **Step 5: run, expect red.** `npx vitest run test/render/data/navdata/NavCalculator.test.ts` → the 15 s test
  fails at 0.6 NM (`expected true to be false`), the "ends once passed" test fails (`expected true to be false`), the
  last-waypoint test fails at 0.6 NM; the 36 s test passes.

- [ ] **Step 6: implement.** In `NavCalculator.ts`: import `TO` beside `FROM` from `../VolatileMemory`; the constants
  become

```ts
//4-8
const WPT_ALERT_WITH_TURN_ANTI = 20;
//4-9: with turn anticipation disabled
const WPT_ALERT_WITHOUT_TURN_ANTI = 36;
//#372: a waypoint without a turn while turn anticipation is enabled. Checked in the KLN 89 trainer, 2026-10-14; the
//guide gives 36 s for a Direct To (3-29) without this distinction
const WPT_ALERT_NO_TURN_WITH_TURN_ANTI = 15;
```

  replace the assignment in the branch without a turn (today
  `nav.waypointAlert = nav.eteToActive! <= WPT_ALERT_WITHOUT_TURN_ANTI || nav.activeWaypoint.turnStack.length > 0;`
  with its comment line above it) by

```ts
                nav.waypointAlert = this.isAlertWithoutTurn();
```

  and add, above `calculateTurnCircle`:

```ts
    /**
     * The waypoint alert for a waypoint without a turn to anticipate: no following leg, a fly-over, a waypoint followed by
     * a copy of itself, or turn anticipation off. It ends once the waypoint is passed (#372). The turn onto the last leg
     * is still being flown after the sequencing, so the alert stays on until it ends (#156)
     */
    private isAlertWithoutTurn(): boolean {
        const nav = this.memory.navPage;
        const alertTime = this.turnAnticipation.get() ? WPT_ALERT_NO_TURN_WITH_TURN_ANTI : WPT_ALERT_WITHOUT_TURN_ANTI;
        return (nav.toFrom === TO && nav.eteToActive! <= alertTime) || nav.activeWaypoint.turnStack.length > 0;
    }
```

- [ ] **Step 7: run** the three files of Verify → pass; `npx tsc --noEmit && npm test` → green. Measured in the
  inventory: this change alone turns only the old 36 s test (now rewritten). Mutation check: make `alertTime` always
  `WPT_ALERT_WITHOUT_TURN_ANTI`, and separately drop `nav.toFrom === TO &&`; report which tests go red each time;
  restore.

- [ ] **Step 8: docs and commit.** `docs/architecture.md` ~416: the thresholds are 20 s before an anticipated turn,
  15 s (turn anticipation on) or 36 s (off) before a waypoint without a turn, and that alert ends once the waypoint is
  behind. Commit `fixes #372 alert about 15 s before a waypoint without a turn with turn anticipation on, and end the alert at the waypoint`.

- [ ] **Step 9 (#147): write the OBS tests.** Add after the describes of Step 4:

```ts
// #147: in OBS mode there is no sequencing (5-35), but the waypoint alert works as for a waypoint without a turn.
// Checked in the KLN 89 trainer, 2026-10-14: in OBS mode toward the active waypoint the arrow flashed from 1.0 NM at
// 239 kt with turn anticipation on (ETE :14) and from 2.4 NM with it off, stopped at the waypoint, and the waypoint
// stayed active. The OBS course is the one the unit chooses on entering OBS: the leg's course at ABC (5-36).
describe('waypoint alert in OBS mode (checked in the KLN 89 trainer, 2026-10-14)', () => {
    async function obsTowardAbc(turnAnticipation: boolean) {
        const {unit, kaaa, abc} = await onStandardRoute({turnAnticipation});
        const leg = finalCourseDeg(kaaa, abc);
        await moveAircraft(unit, pointBefore(kaaa, abc, 5), {groundspeedKt: 120, trackTrue: leg});
        await unit.panel.obsMode();
        expect(unit.props.modeController.isObsModeActive()).toBe(true); // Precondition
        const at = (nmBefore: number) => moveAircraft(unit, pointBefore(kaaa, abc, nmBefore), {groundspeedKt: 120, trackTrue: leg});
        return {unit, kaaa, abc, leg, at};
    }

    it('starts about 15 s before the active waypoint and ends past it, with turn anticipation on (checked in the KLN 89 trainer, 2026-10-14, #147)', async () => {
        const {unit, abc, leg, at} = await obsTowardAbc(true);

        await at(0.6);
        expect(nav(unit).waypointAlert).toBe(false);
        await at(0.4);
        expect(nav(unit).waypointAlert).toBe(true);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(1);

        await moveAircraft(unit, pointFrom(abc, leg, 0.2), {groundspeedKt: 120, trackTrue: leg});
        expect(activeIdent(unit)).toBe('ABC'); // 5-35: no sequencing in OBS mode
        expect(nav(unit).waypointAlert).toBe(false);
    });

    it('starts about 36 s before the active waypoint with turn anticipation off (checked in the KLN 89 trainer, 2026-10-14, #147)', async () => {
        const {unit, at} = await obsTowardAbc(false);

        await at(1.3);
        expect(nav(unit).waypointAlert).toBe(false);
        await at(1.1);
        expect(nav(unit).waypointAlert).toBe(true);
    });
});
```

  Run: both fail at the "on" assertion (`expected false to be true`), because OBS mode sets the alert to false today.

- [ ] **Step 10: implement.** Replace the start of the sequencing block

```ts
        //waypoint sequencing
        const waypointSequencingAllowed = !this.modeController.isObsModeActive();
        if (waypointSequencingAllowed && this.sensors.in.gps.groundspeed > 2) {
```

  by

```ts
        //waypoint sequencing
        if (this.modeController.isObsModeActive()) {
            //5-35: no sequencing in OBS mode; the alert as for a waypoint without a turn (#147, checked in the KLN 89
            //trainer, 2026-10-14)
            nav.waypointAlert = this.sensors.in.gps.groundspeed > 2 && this.isAlertWithoutTurn();
        } else if (this.sensors.in.gps.groundspeed > 2) {
```

  (the closing `} else { nav.waypointAlert = false; }` stays). Run → pass; full suite green. Mutation check: set the OBS
  branch back to `nav.waypointAlert = false`; both OBS tests go red; restore.

- [ ] **Step 11: docs and commit.** `docs/architecture.md`: the sequencing bullets say OBS mode computes the alert
  without sequencing; `docs/test-next-steps.md`: drop #147 from the open trainer questions. Commit
  `fixes #147 alert the active waypoint in OBS mode`.

```json:metadata
{"files": ["kln90b/data/navdata/NavCalculator.ts", "test/flight/flights/directToPlanWaypoint.test.ts", "test/render/data/navdata/NavCalculator.test.ts", "test/render/pages/left/SuperNav5Page.test.ts", "docs/architecture.md", "docs/test-next-steps.md"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#146 flight test: DTK switches 0.2-0.45 NM before ABC, alert 15-25 s before, KBBB plan leg after", "#372: Direct To off plan TA on off 0.6/on 0.4 NM, off 0.2 NM past; TA off off 1.3/on 1.1 NM; last waypoint 15 s", "#147: OBS alert TA on off 0.6/on 0.4/off past with ABC active; TA off off 1.3/on 1.1", "three fixes commits in order, full suite green"], "modelTier": "standard"}
```

---

### Task 2: The zero-length leg and the flag (#120, #159)

**Goal:** Two commits: a final zero-length leg navigates on the incoming course and writes all outputs (#120), and a
NAV flag keeps the CDI scale while a power-up restores 5 NM (#159).

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts` (`tick` :84-108 and the XTK/DTK lines :130-158; `setFlag` :285-299;
  a new private method), `kln90b/data/VolatileMemory.ts` (`reset`, after `navmode`)
- Test: `test/flight/flights/duplicateWaypoint.test.ts` (pin :131 and its comment :102-106),
  `test/render/data/navdata/NavCalculator.test.ts` (new describe for #120; the #159 describe :481-578)
- Docs: `docs/architecture.md` (the NavCalculator section: the NaN-path guard if described, the flag), `test/README.md`
  if it describes the #120 behavior (`grep -n '#120\|#159' docs/ test/`)

**Acceptance Criteria:**
- [ ] #120: with FPL 0 KAAA, ABC, ABC and the aircraft 0.2, 0.5 and 1 NM past ABC on the leg's course, the second ABC
  (index 2) is active, the DTK is the course of KAAA - ABC at ABC (within 0.1°), XTK under 0.01 NM, FROM, the distance
  and ETE count up, `GPS WP DESIRED TRACK` is written and NAV 1 is not flagged.
- [ ] #120: with FPL 0 KAAA, KAAA, XTK, DTK and TO/FROM are null and distance, bearing and ETE are set; the pin
  `duplicateWaypoint.test.ts:131` passes.
- [ ] #159: the three pins pass; a power cycle restores 5 NM before the self-test page.
- [ ] Every test that recovers through a next leg (inventory section 4) stays green; `tsc` clean; full suite green.

**Verify:** `npx vitest run test/render/data/navdata/NavCalculator.test.ts test/flight/flights/duplicateWaypoint.test.ts`
→ all pass; `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#120): write the tests.** Add to `NavCalculator.test.ts` (after the GPS invalid describe):

```ts
// #120: past the last waypoint of a plan that ends in the same waypoint twice, the active leg has no length. Checked in
// the KLN 89 trainer, 2026-10-14 (FPL 0 KMSN, BAE, BUU, BUU): the unit sequenced onto BUU - BUU and kept the DTK of the
// leg before; the distance and the ETE counted up, the bearing pointed back at BUU, the CDI stayed valid and centered,
// FROM. (It showed TO from 1.8 NM past for no reason seen; that is not modeled, and the test stays within 1 NM.)
describe('a plan that ends in the same waypoint twice (checked in the KLN 89 trainer, 2026-10-14)', () => {
    it('keeps navigating on the course of the leg before past the waypoint (checked in the KLN 89 trainer, 2026-10-14, #120)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc], position: pointBefore(kaaa, abc, 5), magvar: 0, storage: savedFlightplan(0, [kaaa, abc, abc])});
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 1');
        const leg = finalCourseDeg(kaaa, abc);
        for (const before of [2, 1, 0.5]) {
            await moveAircraft(unit, pointBefore(kaaa, abc, before), {groundspeedKt: 120, trackTrue: leg});
        }

        for (const past of [0.2, 0.5, 1]) {
            await moveAircraft(unit, pointFrom(abc, leg, past), {groundspeedKt: 120, trackTrue: leg});
            await vi.advanceTimersByTimeAsync(500);
            expect(nav(unit).activeWaypoint.getActiveFplIdx()).toBe(2);
            expect(angleBetween(nav(unit).desiredTrack, leg)).toBeLessThan(0.1);
            expect(Math.abs(nav(unit).xtkToActive!)).toBeLessThan(0.01);
            expect(nav(unit).toFrom).toBe(false); // FROM
            expect(nav(unit).distToActive!).toBeCloseTo(past, 2);
            expect(nav(unit).eteToActive!).toBeCloseTo(past / 120 * 3600, 0);
            expect(angleBetween(unit.env.sim.get('GPS WP DESIRED TRACK', 'degrees'), leg)).toBeLessThan(0.1); // magvar 0: magnetic = true
            expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(2); // FROM, not flagged
            expect(Screen.read().rows('L')[1]).not.toContain('F L A G');
        }
        expect(unit.errors).toEqual([]);
    });

    // A plan of one waypoint twice has no leg before the zero-length leg. What the unit shows then is not known; it keeps
    // what it can compute (characterization)
    it('has no XTK, DTK or TO/FROM with no leg before, but distance, bearing and ETE (characterization, #120)', async () => {
        const {kaaa} = standardRoute();
        const start = pointFrom(kaaa, 270, 5);
        const unit = await bootUnit({facilities: [kaaa], position: start, storage: savedFlightplan(0, [kaaa, kaaa])});
        await settle(unit);
        await moveAircraft(unit, start, {groundspeedKt: 120, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).activeWaypoint.getActiveFplIdx()).toBe(1);
        expect(nav(unit).xtkToActive).toBeNull();
        expect(nav(unit).desiredTrack).toBeNull();
        expect(nav(unit).toFrom).toBeNull();
        expect(nav(unit).distToActive!).toBeCloseTo(5, 2);
        expect(angleBetween(nav(unit).bearingToActive, courseDeg(start, kaaa))).toBeLessThan(0.1);
        expect(nav(unit).eteToActive!).toBeCloseTo(5 / 120 * 3600, 0);
        expect(unit.env.sim.get('GPS WP DISTANCE', 'nautical miles')).toBeCloseTo(5, 2);
    });
});
```

  Check `angleBetween`'s signature in `test/harness/flight/geo.ts` (it takes `number | null`). A scratch run of this
  setup with the Step 3 code (2026-10-14) showed index 2, a DTK within 0.01° of the leg's course, XTK 0, FROM, the
  distance and ETE counting up, `L:KLN90B_HSI_TF_FLAGS` 2 and NAV 1 unflagged. In `duplicateWaypoint.test.ts` change `it.fails('keeps the GPS position outputs current while the aircraft moves (#120)'`
  to `it(` and rewrite the describe comment (:102-106): the plan's only leg has no length and no leg lies before it, so
  the unit keeps distance, bearing and ETE and writes all outputs; with a leg before, it navigates on that leg's course
  (NavCalculator.test.ts).

- [ ] **Step 2: run, expect red.** Both new tests fail (the first at `desiredTrack`, null today; the second at
  `eteToActive` or `GPS WP DISTANCE`, never written today); the converted pin fails (the outputs are never written).

- [ ] **Step 3: implement.** In `NavCalculator.tick`, move the `//ETE` block (today after the invalid-path check) up so it
  runs right before the check, and replace the check

```ts
        if (!this.modeController.isObsModeActive() && isNaN(fromLeg.path.center[0])) { //Happens when FROM and TO are the same waypoint
            console.warn("invalid path, sequencing to the next waypoint", fromLeg);
            nav.activeWaypoint.sequenceToNextWaypoint();
            return;
        }
```

  by

```ts
        let legPath = fromLeg.path;
        if (!this.modeController.isObsModeActive() && isNaN(fromLeg.path.center[0])) { //Happens when FROM and TO are the same waypoint
            const idx = nav.activeWaypoint.getActiveFplIdx();
            nav.activeWaypoint.sequenceToNextWaypoint();
            if (nav.activeWaypoint.getActiveFplIdx() !== idx) {
                console.warn("invalid path, sequencing to the next waypoint", fromLeg);
                return;
            }
            //#120: the last leg has no length. The unit keeps navigating on the course of the leg before it (checked in
            //the KLN 89 trainer, 2026-10-14); without a leg before, only distance, bearing and ETE remain
            const incoming = this.getIncomingPath(idx);
            if (incoming === null) {
                nav.xtkToActive = null;
                nav.desiredTrack = null;
                nav.toFrom = null;
                nav.bearingForAP = nav.bearingToActive;
                nav.waypointAlert = false;
                this.setOutput();
                return;
            }
            legPath = incoming;
        }
```

  then use `legPath` instead of `fromLeg.path` in exactly three places: the XTK line
  (`fromLeg.path.distance(...)`), the DTK path (`... .pathForDtk : fromLeg.path;`) and `if (fromLeg.path.isGreatCircle())`.
  The turn-anticipation code keeps `fromLeg.path` (it is not reached for a zero-length leg: the following leg is null).
  Add above `calculateTurnCircle`:

```ts
    /**
     * #120: the path of the FPL 0 leg that ends where the zero-length leg at idx starts, null if there is none or it has
     * no length either
     */
    private getIncomingPath(idx: number): GeoCircle | null {
        if (idx < 2) {
            return null;
        }
        const legs = this.memory.navPage.activeWaypoint.fpl0.getLegs();
        const from = legs[idx - 2];
        const to = legs[idx - 1];
        const path = from.arcData === undefined ? GeoCircle.createGreatCircle(from.wpt, to.wpt) : from.arcData.circle;
        return isNaN(path.center[0]) ? null : path;
    }
```

- [ ] **Step 4: run** → pass; full suite green. Measured (scratch, 2026-10-14): this change turns only the #120 pin;
  the tests that recover through a next leg (inventory section 4: `duplicateWaypoint.test.ts:33`, `:54`,
  `NavCalculator.test.ts:52`, `:70`, `ModeController.test.ts:244`, `KlnEfbSaver.test.ts:66`, `:264`, `:279`) stay green.
  Mutation check: return `null` from `getIncomingPath` always (the first new test goes red); and remove the
  `this.setOutput()` of the null branch (the pin and the second test go red); restore.

- [ ] **Step 5: docs and commit.** `docs/architecture.md`, the NavCalculator section: a zero-length leg with a next leg
  is sequenced at once; the last one navigates on the incoming leg's course. Commit
  `fixes #120 keep navigating and writing the outputs on a final zero-length leg`.

- [ ] **Step 6 (#159): turn the pins and add the power test.** In the describe `CDI scale selected on MOD 1 (5-38)`
  (:481) rewrite its comment (the flag keeps the scale; nothing in the guide resets it), change the three
  `it.fails('... (#159)'` to `it(`, and rewrite the comment above the ARM pin (it explains the old blank). Add to the
  describe:

```ts
    // A power-up starts at 5 NM again (VolatileMemory.reset): the scale is unit state, not a setting. On the welcome
    // page, before the self-test, which sets 5 NM on its own (characterization)
    it('restores 5 NM at a power-up, before the self-test (characterization, #159)', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await moveAircraft(unit, pointBefore(kaaa, abc, 20), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});
        await selectOneNm(unit);
        expect(nav(unit).xtkScale).toBe(1); // Precondition

        await unit.panel.powerCycle();
        await vi.advanceTimersByTimeAsync(2000);

        expect(nav(unit).isSelfTestActive).toBe(false); // still the welcome page
        expect(nav(unit).xtkScale).toBe(5);
    });
```

  Read `FrontPanel.powerCycle` and the welcome page timing first; if 2 s after `powerCycle` is not on the welcome page,
  pick a time that is (the welcome page lasts several seconds) and say so in the report.

- [ ] **Step 7: run, expect red.** The three pins as `it` fail (scale 5). The power test may pass today (if the GPS is
  flagged during the welcome page, `setFlag` sets 5) or fail (if the fix survives the power cycle); either is fine: it
  must pass after Step 8, and the Step 9 mutation must turn it red. Report which it was.

- [ ] **Step 8: implement.** In `NavCalculator.setFlag` delete `nav.xtkScale = 5;`. In `VolatileMemory.reset`, after
  `this.navPage.navmode = NavMode.ENR_LEG;`, add

```ts
        this.navPage.xtkScale = 5; //A power-up starts at 5 NM, a NAV flag keeps the scale (#159)
```

- [ ] **Step 9: run** → all pass; full suite green (inventory: removing the line alone turns only the three pins).
  Mutation check: remove the `reset` line (the power test goes red), then put `nav.xtkScale = 5` back into `setFlag`
  (the three tests go red); restore.

- [ ] **Step 10: docs and commit.** `docs/architecture.md`: the flag does not change the scale; a power-up sets 5.
  Commit `fixes #159 keep the CDI scale over a NAV flag`.

```json:metadata
{"files": ["kln90b/data/navdata/NavCalculator.ts", "kln90b/data/VolatileMemory.ts", "test/render/data/navdata/NavCalculator.test.ts", "test/flight/flights/duplicateWaypoint.test.ts", "docs/architecture.md"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#120 KAAA ABC ABC: idx 2, DTK incoming course, XTK~0, FROM, dist/ETE count up, outputs written, NAV 1 not flagged", "#120 KAAA KAAA: XTK/DTK/TO-FROM null, dist/bearing/ETE set; pin passes", "#159 three pins pass; power cycle restores 5 NM", "two fixes commits, full suite green"], "modelTier": "standard"}
```

---

### Task 3: One CDI scale field for MOD 1 and MOD 2 (#160, #260)

**Goal:** Two commits: a shared `CdiScaleField` with the mode's choices and the shown step (#160), then the choices
rebuilt per display tick with a knob click mapped through the list shown (#260).

**Files:**
- Create: `kln90b/controls/selects/CdiScaleField.tsx`
- Modify: `kln90b/pages/left/Mod1Page.tsx` (:5-9 imports, :14, :31, :79, :82-110), `kln90b/pages/left/Mod2Page.tsx`
  (:5-8 imports, :21, :40, :89, :92-120)
- Test: `test/render/pages/left/Mod1Page.test.ts` (pins :48, :201; new tests), `test/render/pages/left/Mod2Page.test.ts`
  (pin :307; new test)
- Docs: `docs/architecture.md` if it describes the MOD pages' scale choices (`grep -n 'MOD 1\|Mod1Page\|cdiScale' docs/`)

**Acceptance Criteria:**
- [ ] #160: armed by the switch 40 NM out, MOD 1 and MOD 2 show `CDI:±5.00NM`; in APR the field shows 0.30 even while
  the scale is exactly 1, and 1.00 during the ARM ramp.
- [ ] #260: with MOD 1 or MOD 2 in view while the unit arms, a knob click leaves the scale at 0.3 or 1 and
  `GPS CDI SCALING` finite; armed beyond 30 NM, after one click from 5.00 to 1.00 the knob offers only 0.30 and 1.00.
- [ ] `Mod1Page`/`Mod2Page` have no `buildValidScales`, `getScaleIdx` or `setCDIScale` left; `tsc` clean; full suite green.

**Verify:** `npx vitest run test/render/pages/left/Mod1Page.test.ts test/render/pages/left/Mod2Page.test.ts` → all pass;
`npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#160): write the tests.** In `Mod1Page.test.ts`, change the #160 pin (:48) to `it(` with the title
  `shows CDI:±5.00NM when armed by the switch 40 NM from the airport (5-38, 6-1, #160)` and rewrite its comment (armed
  beyond 30 NM the scale stays 5 NM, 6-1, and MOD 1 shows the scale in use, 5-38). Add a new describe at the end of
  `Mod1Page.test.ts` for the APR display (the field mounted on its own, so the activation tick can be set up exactly):

```ts
import {CdiScaleField} from '../../../../kln90b/controls/selects/CdiScaleField';
import {NavPageState} from '../../../../kln90b/data/VolatileMemory';
import {mountedText} from '../../../harness/render/mount';

// In APR the scale ramps from 1 to 0.3 NM over the last 2 NM to the FAF (6-3). The field shows 0.30 throughout, also on
// the tick of the activation, where the scale is still exactly 1 (characterization: the guide shows no value for the
// ramp)
describe('CDI scale field in APR (characterization)', () => {
    const field = (navmode: NavMode, xtkScale: number) => new CdiScaleField({navmode, xtkScale} as unknown as NavPageState);

    it('shows 0.30 in APR with the scale still exactly 1 (characterization, #160)', () => {
        expect(mountedText(field(NavMode.APR_LEG, 1))).toBe('0.30');
    });

    it('shows 0.30 in APR during the ramp (characterization, #160)', () => {
        expect(mountedText(field(NavMode.APR_LEG, 0.65))).toBe('0.30');
    });

    it('shows 1.00 during the ARM ramp from 5 to 1 NM (characterization, #160)', () => {
        expect(mountedText(field(NavMode.ARM_LEG, 3))).toBe('1.00');
    });
});
```

  (merge the imports with the file's existing ones; `NavMode` is imported already). In `Mod2Page.test.ts` change the
  #160 pin (:307) to `it(` and rewrite its comment the same way. Run: the two pins fail; the mounted tests fail to compile
  until `CdiScaleField` exists.

- [ ] **Step 2: implement.** Create `kln90b/controls/selects/CdiScaleField.tsx` (this version keeps today's
  construction-time value set and maps a click through the current mode's list; Step 6 changes that for #260):

```tsx
import {format} from "numerable";
import {SelectField} from "./SelectField";
import {NavMode, NavPageState} from "../../data/VolatileMemory";

/**
 * 5-38: the scales the pilot can select in the current mode. In the approach-arm mode nothing less sensitive than 1 NM,
 * except the 5 NM the unit keeps while armed beyond 30 NM (6-1); once left, it cannot be selected again (#160)
 */
function selectableScales(nav: NavPageState): number[] {
    switch (nav.navmode) {
        case NavMode.ENR_LEG:
        case NavMode.ENR_OBS:
            return [0.3, 1, 5];
        case NavMode.ARM_LEG:
        case NavMode.ARM_OBS:
            return nav.xtkScale >= 5 ? [0.3, 1, 5] : [0.3, 1];
        case NavMode.APR_LEG:
            return [0.3];
    }
}

/**
 * The scale the field shows: the step the scale is at or ramping to. The ARM ramp (5 to 1) shows 1.00, and APR always
 * 0.30, also on the tick of the activation, where the scale is still exactly 1 (characterization, #160)
 */
function shownScale(nav: NavPageState): number {
    if (nav.navmode === NavMode.APR_LEG || nav.xtkScale < 1) {
        return 0.3;
    }
    return nav.xtkScale < 5 ? 1 : 5;
}

const formatScale = (scale: number): string => format(scale, "0.00");

/**
 * The CDI scale field of MOD 1 and MOD 2 (5-38)
 */
export class CdiScaleField extends SelectField {

    constructor(private readonly navState: NavPageState) {
        const scales = selectableScales(navState);
        super(scales.map(formatScale), scales.indexOf(shownScale(navState)), idx => navState.xtkScale = selectableScales(navState)[idx]);
    }

    public tick(blink: boolean): void {
        this.value = selectableScales(this.navState).indexOf(shownScale(this.navState));
        super.tick(blink);
    }
}
```

  In `Mod1Page.tsx` and `Mod2Page.tsx`: the children type `cdiScale: SelectField` becomes `cdiScale: CdiScaleField`;
  the construction becomes `cdiScale: new CdiScaleField(this.props.memory.navPage),`; delete the line
  `this.children.get("cdiScale").value = this.getScaleIdx();` from `redraw`, and delete `buildValidScales`,
  `setCDIScale` and `getScaleIdx`. Replace the `SelectField` import by
  `import {CdiScaleField} from "../../controls/selects/CdiScaleField";` and remove imports left unused (`format` and
  `NavMode` in `Mod1Page.tsx`; in `Mod2Page.tsx` check each of `format`, `NavMode`, `NavPageState` before removing — some
  are still used by `ModObsElement`).

- [ ] **Step 3: run** → the #160 pins and the mounted tests pass; the #260 pin (`Mod1Page.test.ts:201`) is still an
  expected fail (it must be: this version still maps a click through the current mode's list). Full suite green.
  Mutation check: make the ARM list always `[0.3, 1]` (the two pins go red), and make `shownScale` return 1 for an exact
  1 in APR (the first mounted test goes red); restore.

- [ ] **Step 4: docs and commit.** Commit `fixes #160 show the CDI scale on MOD 1 and MOD 2 while armed beyond 30 NM and at the APR activation`.

- [ ] **Step 5 (#260): write the tests.** In `Mod1Page.test.ts` change the #260 pin (:201) to `it(` and rewrite its
  comment (the field keeps the list it showed; a click steps within it). Add to the describe
  `MOD 1 CDI scale field with an approach loaded 40 NM from the airport`:

```ts
    // 5-38: in the approach-arm mode nothing less sensitive than 1 NM can be selected. Once the pilot leaves the 5 NM the
    // unit kept beyond 30 NM, only 1.00 and 0.30 are offered (the order of the choices is a characterization)
    it('offers only 1.00 and 0.30 once the pilot leaves 5.00 while armed beyond 30 NM (5-38, #260)', async () => {
        const unit = await approachLoaded40();
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await unit.panel.selectPage('L', 'MOD 1');
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L').text).toBe('5.00'); // Precondition: armed at 5 NM

        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(500);
        expect(unit.props.memory.navPage.xtkScale).toBe(1);

        const seen = new Set<string>();
        for (let i = 0; i < 4; i++) {
            await unit.panel.inner('L', 1);
            await vi.advanceTimersByTimeAsync(500);
            seen.add(unit.panel.focused('L').text);
            expect(unit.props.memory.navPage.xtkScale).not.toBe(5);
        }
        expect([...seen].sort()).toEqual(['0.30', '1.00']);
    });
```

  Add a MOD 2 test to `Mod2Page.test.ts`, as a new describe at the end of the file (`moveAircraft` and `NavMode` may need
  importing; check the file's imports). On MOD 2 the CDI field is not necessarily the first cursor field, so the helper
  moves the cursor onto it:

```ts
// 5-38 note: as on MOD 1 (Mod1Page.test.ts): MOD 2 is in view while the unit arms within 30 NM and ramps to 1 NM; a knob
// click then leaves 1 or 0.3 NM, and the CDI output stays a number
describe('MOD 2 CDI scale when the unit arms with the page in view', () => {
    /** MOD 2 in view 40 NM north, then the aircraft moves to 25 NM: the unit arms and ramps to 1 NM; the cursor on the scale */
    async function armedWithMod2InView() {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await unit.panel.selectPage('L', 'MOD 2');
        await moveAircraft(unit, w.north(25), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(40_000); // The unit arms within 30 NM and ramps the scale to 1 NM in 30 s (6-1, 6-3)
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', '1.00');
        return unit;
    }

    it('keeps a valid CDI scale when the knob turns after the unit armed with MOD 2 in view (5-38, #260)', async () => {
        const unit = await armedWithMod2InView();
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG); // Preconditions
        expect(unit.panel.focused('L').text).toBe('1.00');

        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(2000);

        expect([0.3, 1]).toContain(unit.props.memory.navPage.xtkScale);
        expect(Number.isFinite(unit.env.sim.get('GPS CDI SCALING', 'meters'))).toBe(true);
    });
});
```

  Run: the three #260 tests fail (scale NaN after the click, or a third value offered; the inventory reproduced the
  MOD 2 case).

- [ ] **Step 6: implement.** Replace the class body of `CdiScaleField` by

```tsx
export class CdiScaleField extends SelectField {
    private readonly shown: { scales: number[] };

    constructor(private readonly navState: NavPageState) {
        const shown = {scales: selectableScales(navState)};
        //#260: a knob click sets the scale from the list the pilot saw, not from the list of a mode that changed since
        super(shown.scales.map(formatScale), shown.scales.indexOf(shownScale(navState)), idx => navState.xtkScale = shown.scales[idx]);
        this.shown = shown;
    }

    public tick(blink: boolean): void {
        //The choices follow the mode at every display tick (#260)
        this.shown.scales = selectableScales(this.navState);
        this.valueSet = this.shown.scales.map(formatScale);
        this.value = this.shown.scales.indexOf(shownScale(this.navState));
        super.tick(blink);
    }
}
```

  (`valueSet` is `protected` in `SelectField`, so no change there.) This exact version compiled and, together with Step 2,
  turned exactly the three CDI pins in a scratch run (2026-10-14).

- [ ] **Step 7: run** → pass; full suite green. Mutation check: map the click through `selectableScales(navState)` again
  (the three #260 tests go red); restore.

- [ ] **Step 8: docs and commit.** Commit `fixes #260 keep the CDI scale valid when the mode changes with MOD 1 or MOD 2 in view`.

```json:metadata
{"files": ["kln90b/controls/selects/CdiScaleField.tsx", "kln90b/pages/left/Mod1Page.tsx", "kln90b/pages/left/Mod2Page.tsx", "test/render/pages/left/Mod1Page.test.ts", "test/render/pages/left/Mod2Page.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#160 MOD 1/2 show CDI:±5.00NM armed 40 NM out; APR shows 0.30 at scale 1; ARM ramp shows 1.00", "#260 MOD 1 and MOD 2 knob click after arming keeps 0.3 or 1 and finite GPS CDI SCALING; after leaving 5 only 0.30/1.00 offered", "no buildValidScales/getScaleIdx/setCDIScale in the pages", "two fixes commits, full suite green"], "modelTier": "standard"}
```

---

### Task 4: Activating a DME-arc leg (#121)

**Goal:** One commit: `findClosestLegIdx` decides "between" on an arc leg by the angle along the arc, with the pin's
fixture fixed to the direction production builds.

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (`findClosestLegIdx` :296-326, a new private method and module
  caches)
- Test: `test/unit/data/flightplan/ActiveWaypoint.test.ts` (`arcPlan` :105-122, the pin :137, a new test)
- Docs: `test/README.md:301` (mentions #121)

**Acceptance Criteria:**
- [ ] The fixture's arc circle is reversed as `SidStar` builds a right arc (`SidStar.ts:640-647`), and its sibling test
  still passes.
- [ ] Aircraft on the arc at R330: the arc leg (index 1) is activated (the pin passes).
- [ ] Aircraft on the same DME circle outside the arc at R090: the leg Q - R (index 2) is activated.
- [ ] `tsc` clean; full suite green.

**Verify:** `npx vitest run test/unit/data/flightplan/ActiveWaypoint.test.ts` → all pass; `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1: fix the fixture and write the test.** In `arcPlan`, the arc runs clockwise from the 270 to the 000
  radial, a right arc, which production builds as the reversed circle; change
  `circle: GeoCircle.createFromPoint(station, NM(10)),` to

```ts
            // A right arc (270 to 000 clockwise): SidStar reverses the circle of every arc that is not a left arc
            circle: GeoCircle.createFromPoint(station, NM(10)).reverse(),
```

  (check that `GeoCircle.reverse()` returns the circle in the SDK, `node_modules/@microsoft/msfs-sdk` or
  E:\msfs\msfs-avionics-mirror; otherwise reverse in a statement before). Change the pin's `it.fails(` to `it(` and
  rewrite the describe comment: on a DME arc the closest point lies on the small circle, and it is between FROM and TO
  when its angle along the arc is no larger than TO's. Add after the pin:

```ts
    // The other side of the rule: on the same DME circle but outside the arc's span, beside the leg Q to R, the aircraft
    // is on that leg. Deciding "always between" for an arc leg would activate the arc here (#121)
    it('activates the leg Q to R when the aircraft is on the DME circle outside the arc, at the 090° radial (#121)', () => {
        const {station, legs} = arcPlan();
        const aw = activeWaypointOver(legs, pointFrom(station, 90, 10));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(2);
    });
```

  The describe's title carries no page; these tests follow the #41 rule (the leg the aircraft is on), as the describe
  above does.

- [ ] **Step 2: run.** The R330 test fails (index 2), the R090 test passes today (index 2); the sibling passes.

- [ ] **Step 3: implement.** In `ActiveWaypoint.ts` add module-level caches next to the existing ones
  (`const ARC_FROM_CACHE = new GeoPoint(0, 0); const ARC_TO_CACHE = new GeoPoint(0, 0);`), change the between test in
  `findClosestLegIdx` to

```ts
            const between = from.arcData === undefined
                ? this.isPointOnCircleBetween(tempFromGeoPoint, to, tempClosestGeoPoint)
                : this.isPointOnArcBetween(circle, from.wpt, to, tempClosestGeoPoint);
            if (between) {
```

  and add below `isPointOnCircleBetween`:

```ts
    /**
     * #121: checks if a point of a DME arc lies between from and to, by the angle along the arc's circle in its own
     * direction. The chord test of isPointOnCircleBetween needs a great circle; the ends need not lie exactly on the
     * arc's circle, so they are projected onto it first
     */
    private isPointOnArcBetween(circle: GeoCircle, from: LatLonInterface, to: LatLonInterface, pointToCheck: GeoPoint): boolean {
        circle.closest(from, ARC_FROM_CACHE);
        circle.closest(to, ARC_TO_CACHE);
        return circle.angleAlong(ARC_FROM_CACHE, pointToCheck, Math.PI) <= circle.angleAlong(ARC_FROM_CACHE, ARC_TO_CACHE, Math.PI) + GeoCircle.ANGULAR_TOLERANCE;
    }
```

  (`angleAlong(start, end, tolerance?, equalityTolerance?)`, msfssdk.d.ts ~7076; the tolerance `Math.PI` keeps it from
  throwing for a point slightly off the circle.)

- [ ] **Step 4: run** → pass; full suite green (inventory: the angle variant with the production-shaped circle activates
  the arc at R330 and Q - R at R090; no other test changes). Mutation check: replace the arc branch by `true` (the R090
  test goes red), and by the chord test (the R330 pin goes red); restore.

- [ ] **Step 5: docs and commit.** `test/README.md:301`: activation in the middle of an arc is no longer a known bug.
  Commit `fixes #121 activate a DME-arc leg by the angle along the arc`.

```json:metadata
{"files": ["kln90b/data/flightplan/ActiveWaypoint.ts", "test/unit/data/flightplan/ActiveWaypoint.test.ts", "test/README.md"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["fixture circle reversed as SidStar builds right arcs; sibling passes", "R330 on the arc activates index 1 (pin passes)", "R090 on the DME circle outside the arc activates index 2", "one fixes commit, full suite green"], "modelTier": "standard"}
```

---

### Task 5: `L:KLN90B_HeadingInput` (#368)

**Goal:** One commit: a writable LVar that switches `Input.HeadingInput` at runtime, a null heading while the input is
off, and a north-up fallback for a stored HDG up that never changes the setting.

**Files:**
- Modify: `kln90b/LVars.ts` (writable section), `kln90b/settings/KLN90BPlaneSettings.ts` (import :2, LVar writes
  :128-130), `kln90b/SimVarSync.ts` (imports :4-11, `tick` :49-50), `kln90b/Sensors.ts` (:236-238),
  `kln90b/settings/KLN90BUserSettings.ts` (after the `Nav5Orientation` enum :18-23),
  `kln90b/controls/selects/MapOrientationSelector.tsx` (:8, :15-21), `kln90b/controls/SuperNav5Right.tsx` (:31, :58),
  `kln90b/pages/left/Nav5Page.tsx` (:70, :225), `kln90b/pages/left/SuperNav5Page.tsx` (:143, :385), `cfg/panel.xml:9`
- Create: `test/render/HeadingInput.test.ts`
- Test: `test/unit/settings/KLN90BPlaneSettings.test.ts` (`expectDefaultLVars` :50-57, `seeds the synced LVars` :167-175),
  a new unit test file `test/unit/settings/effectiveMapOrientation.test.ts`
- Docs: `docs/architecture.md` (~180 the heading read; ~588 keys; the runtime-override LVars of Core 4 and the
  `KLN90PlaneSettings` section — say "the runtime-override LVars", no count)

**Acceptance Criteria:**
- [ ] The parser writes `L:KLN90B_HeadingInput` (0 by default, 1 with `HeadingInput` true); `SimVarSync` copies it into
  `input.headingInput` every 100 ms.
- [ ] Setting the LVar to 1 at runtime makes `sensors.in.headingGyro` follow `PLANE HEADING DEGREES GYRO`; setting it to
  0 makes it null.
- [ ] Without heading input and a stored HDG up, NAV 5 shows `N^` in its orientation field, draws the north-up plane
  symbol at the aircraft, and the stored `nav5MapOrientation` stays 3; Super NAV 5 the same with
  `superNav5MapOrientation`; with the input on again (at the next page build) HDG up applies.
- [ ] `tsc` clean; full suite green.

**Verify:** `npx vitest run test/render/HeadingInput.test.ts test/unit/settings/` → all pass; `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1: write the tests.** In `KLN90BPlaneSettings.test.ts`: add to `expectDefaultLVars`
  `expect(sim.lastWrite('L:KLN90B_HeadingInput')!.value).toBe(0);` (and update its doc comment: no count), and add
  `<HeadingInput>true</HeadingInput>` to the `<Input>` of `seeds the synced LVars from the keys` with
  `expect(sim.lastWrite('L:KLN90B_HeadingInput')!.value).toBe(1);`. Create
  `test/unit/settings/effectiveMapOrientation.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {effectiveMapOrientation, Nav5Orientation} from '../../../kln90b/settings/KLN90BUserSettings';

// #368: HDG up needs a heading input. Without one the map is drawn north up; the stored setting is the pilot's and is
// not changed (characterization of the maintainer's ruling)
describe('effectiveMapOrientation (characterization)', () => {
    it.each([
        [Nav5Orientation.NORTH_UP, false, Nav5Orientation.NORTH_UP],
        [Nav5Orientation.DTK_UP, false, Nav5Orientation.DTK_UP],
        [Nav5Orientation.TK_UP, false, Nav5Orientation.TK_UP],
        [Nav5Orientation.HDG_UP, false, Nav5Orientation.NORTH_UP],
        [Nav5Orientation.HDG_UP, true, Nav5Orientation.HDG_UP],
        [Nav5Orientation.TK_UP, true, Nav5Orientation.TK_UP],
    ])('maps %s with heading input %s to %s (characterization, #368)', (stored, headingInput, expected) => {
        expect(effectiveMapOrientation(stored, headingInput)).toBe(expected);
    });
});
```

  Create `test/render/HeadingInput.test.ts`:

```ts
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../harness/boot';
import {HEADING_INPUT, panelXml} from '../harness/panelXml';
import {storedSetting} from '../harness/storage';
import {Screen} from '../harness/render/screen';
import {recordMap} from '../harness/render/mapRecorder';
import {showSuperNav5} from '../harness/render/superNav5';
import {bootOnStandardRoute} from '../harness/worldBoot';
import {standardRoute} from '../harness/fixtures';

// Public contract (LVars.ts, the wiki page panel.xml customization): L:KLN90B_HeadingInput is the runtime override of
// Input.HeadingInput, synced like L:KLN90B_ObsSource (SimVarSync.test.ts)
describe('L:KLN90B_HeadingInput (public contract)', () => {
    it('switches the heading input on and off at runtime (#368)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 123);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.headingGyro).toBeNull(); // Precondition: the default panel.xml has no heading input

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.planeSettings.input.headingInput).toBe(true);
        expect(unit.props.sensors.in.headingGyro).toBe(123);

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 0);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.planeSettings.input.headingInput).toBe(false);
        expect(unit.props.sensors.in.headingGyro).toBeNull();
    });
});

// #368: a stored HDG up without a heading input is drawn north up, and the stored setting is kept for when the input
// returns (an aircraft may switch the input on shortly after loading). North up draws the plane symbol "$" at the
// aircraft, the rotated orientations "#" (Nav5Page.drawPlaneIcon). Characterization of the maintainer's ruling.
describe('HDG up without a heading input (characterization)', () => {
    it('NAV 5 shows N^, draws north up and keeps the stored HDG up (characterization, #368)', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({storage: {nav5MapOrientation: 3}});
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('N^  ');
        expect(map.drawn).toContain('icon $ AC');
        expect(storedSetting(unit, 'nav5MapOrientation')).toBe(3);
    });

    it('NAV 5 is HDG up again once the input is on, at the next page build (characterization, #368)', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({storage: {nav5MapOrientation: 3}});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 90);
        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(map.drawn).toContain('icon # AC');
        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('090°');
    });

    it('Super NAV 5 draws north up and keeps the stored HDG up (characterization, #368)', async () => {
        const {kaaa} = standardRoute();
        const map = recordMap({AC: kaaa});
        const unit = await bootOnStandardRoute({storage: {superNav5MapOrientation: 3}});
        await showSuperNav5(unit);
        await vi.advanceTimersByTimeAsync(2000);

        expect(map.drawn).toContain('icon $ AC');
        expect(storedSetting(unit, 'superNav5MapOrientation')).toBe(3);
    });
});
```

  Read `MapOrientationSelector.test.ts` and `Nav5Page.test.ts` first: if the unfocused field shows `N^` with other
  padding, or the heading value with a variation applied (`magvar` of the boot), adjust the literal with your
  derivation and report it; the `090°` literal assumes the boot's magnetic variation leaves a magnetic heading of 90
  as is (the field shows the gyro value, which is magnetic). Confirm by reading `recordMap` that the plane symbol is
  recorded as `icon $ <name>` at the aircraft's position (the boot position KAAA, named `AC`).

- [ ] **Step 2: run, expect red.** The parser tests fail (no write), the runtime test fails at `toBeNull` or at `true`,
  the first and third orientation tests fail at `icon $ AC` (today a null heading is treated as 0 and drawn rotated with
  `#`), the unit test fails to compile.

- [ ] **Step 3: implement.**
  - `LVars.ts`, writable section, after `LVAR_OBS_TARGET`:

```ts
export const LVAR_HEADING_INPUT = "L:KLN90B_HeadingInput"; // Changes Input.HeadingInput from the panel.xml on the fly. Roll steering and HDG up on NAV 5 need it
```

  - `KLN90BPlaneSettings.ts`: import `LVAR_HEADING_INPUT`, and after the `LVAR_OBS_TARGET` write:
    `SimVar.SetSimVarValue(LVAR_HEADING_INPUT, SimVarValueType.Bool, options.input.headingInput);`
  - `SimVarSync.ts`: import it, and after the `obsTarget` line:
    `this.settings.input.headingInput = !!SimVar.GetSimVarValue(LVAR_HEADING_INPUT, SimVarValueType.Bool);`
  - `Sensors.ts`:

```ts
        if (this.options.input.headingInput) {
            this.headingGyro = SimVar.GetSimVarValue('PLANE HEADING DEGREES GYRO', SimVarValueType.Degree);
        } else {
            this.headingGyro = null; //The input can be switched off at runtime (#368)
        }
```

  - `KLN90BUserSettings.ts`, after the `Nav5Orientation` enum:

```ts
/**
 * #368: HDG up needs a heading input. Without one the map is drawn north up; the stored setting is the pilot's and is kept
 * for when the input returns (an aircraft may switch it on after loading)
 */
export function effectiveMapOrientation(orientation: Nav5Orientation, headingInput: boolean): Nav5Orientation {
    return orientation === Nav5Orientation.HDG_UP && !headingInput ? Nav5Orientation.NORTH_UP : orientation;
}
```

  - `Nav5Page.tsx` and `SuperNav5Page.tsx`: both `switch (this.orientationSetting.get()) {` become
    `switch (effectiveMapOrientation(this.orientationSetting.get(), this.props.planeSettings.input.headingInput)) {`
    (import the function beside `Nav5Orientation`).
  - `SuperNav5Right.tsx`: the `orientation` field's initial value and the `switch` in `getOrientationValue` use
    `effectiveMapOrientation(this.orientationSetting.get(), ...planeSettings.input.headingInput)`.
  - `MapOrientationSelector.tsx`: the private constructor takes the initial `value: number` as its second parameter and
    passes it to `super`; `build` passes
    `effectiveMapOrientation(orientationSetting.get(), options.input.headingInput)`.
  - `cfg/panel.xml:9`: the comment becomes `true, when the KLN receives heading input. Needed for roll steering and HDG up. Synced with L:KLN90B_HeadingInput`.

  These changes compiled and changed no existing test in a scratch run (2026-10-14).

- [ ] **Step 4: run** → pass; full suite green. Mutation check: drop the `else` in `Sensors.ts` (the runtime test goes
  red), remove the `SimVarSync` line (the runtime test goes red), make `effectiveMapOrientation` return `orientation`
  (the unit test and the orientation tests go red); restore.

- [ ] **Step 5: docs and commit.** `docs/architecture.md`: ~180 the heading is read while `input.headingInput` is set,
  null otherwise; the keys list (~588) and the runtime-override LVars (Core 4, the `KLN90PlaneSettings` section) name
  `L:KLN90B_HeadingInput` without a count ("the runtime-override LVars"). Commit
  `fixes #368 add L:KLN90B_HeadingInput to switch the heading input at runtime`.

```json:metadata
{"files": ["kln90b/LVars.ts", "kln90b/settings/KLN90BPlaneSettings.ts", "kln90b/SimVarSync.ts", "kln90b/Sensors.ts", "kln90b/settings/KLN90BUserSettings.ts", "kln90b/controls/selects/MapOrientationSelector.tsx", "kln90b/controls/SuperNav5Right.tsx", "kln90b/pages/left/Nav5Page.tsx", "kln90b/pages/left/SuperNav5Page.tsx", "cfg/panel.xml", "test/render/HeadingInput.test.ts", "test/unit/settings/KLN90BPlaneSettings.test.ts", "test/unit/settings/effectiveMapOrientation.test.ts", "docs/architecture.md"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["parser writes L:KLN90B_HeadingInput; SimVarSync copies it", "runtime LVar 1 -> headingGyro follows the gyro; 0 -> null", "no heading + stored HDG: NAV 5 shows N^, plane symbol $, setting stays 3; Super NAV 5 the same; input on again -> HDG up", "one fixes commit, full suite green"], "modelTier": "standard"}
```

---

### Task 6: No roll steering without heading input (#143)

**Goal:** One commit: `L:KLN90B_RollCommand` is 0 without heading input (self-test included) while
`GPS COURSE TO STEER` is still written; the flight harness defaults to heading input on.

**Files:**
- Modify: `kln90b/services/RollSteeringController.ts` (constructor :44, every `setRollCommand` call, a new private
  method), `kln90b/KLN90BCore.ts` (:349, the construction), `test/harness/flight/Flight.ts` (`start` :84-91),
  `cfg/panel.xml:9` (the comment, after Task 5)
- Test: `test/render/services/RollSteeringController.test.ts` (pin :98 and its describe comment :84-86; new tests),
  `test/render/SensorsOut.test.ts` (:530-545), `test/render/pages/left/SelfTestLeftPage.test.ts` (new describe),
  `test/render/HeadingInput.test.ts` (one new test)
- Docs: `docs/architecture.md` (~126 the self-test roll sweep; the flight harness section if it names the panel.xml),
  `test/README.md` (the flight section ~546-680: the default panel.xml of `Flight.start`), `docs/test-next-steps.md:290`

**Acceptance Criteria:**
- [ ] Without heading input, 2 NM off the leg at 120 kt, `L:KLN90B_RollCommand` is 0 and `GPS COURSE TO STEER` is the
  45° intercept course (leg course − 45°, radians); with heading input it banks as before.
- [ ] Without heading input the self-test writes 0 throughout; with it, the 0 to 5° right pattern stays.
- [ ] Switching `L:KLN90B_HeadingInput` to 1 at runtime gives the roll command.
- [ ] The nine flight/render vehicles of the inventory pass (flight harness default `HeadingInput` true; `SensorsOut.test.ts:538`
  sets it); `tsc` clean; full suite green.

**Verify:** `npx vitest run test/render/services/RollSteeringController.test.ts test/render/SensorsOut.test.ts test/render/pages/left/SelfTestLeftPage.test.ts test/render/HeadingInput.test.ts`
→ all pass; `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1: write the tests.** In `RollSteeringController.test.ts` change `it.fails('is 0 (#143)'` to
  `it('is 0 (2-69, #143)'` and rewrite the describe comment (:84-86): without a heading input the unit gives no roll
  steering (Installation Manual 2-69), so the command is 0. Add to that describe:

```ts
    // GPS COURSE TO STEER is not an output of the real unit (the code adds it), and the default autopilot reads it. The
    // maintainer decided to keep writing it without a heading input (characterization): the 45° intercept course of the
    // leg, as in SensorsOut.test.ts
    it('still writes GPS COURSE TO STEER, the intercept course (characterization, #143)', async () => {
        const {unit, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        const cts = unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number;
        expect(cts).toBeCloseTo(((dtk - 45 + 360) % 360) * Math.PI / 180, 2);
    });
```

  In `SelfTestLeftPage.test.ts` add after the describe `self-test LVar outputs (spec)`:

```ts
// Installation Manual 2-69: without a heading input there is no roll steering output at all, so the self-test pattern
// of 2-70 is not sent either (#143)
describe('self-test roll command without a heading input (spec)', () => {
    it('L:KLN90B_RollCommand is 0 throughout (2-69, #143)', async () => {
        const unit = await bootToSelfTest({magvar: 0});
        expect(await sampleSelfTest(unit, 'L:KLN90B_RollCommand', 'degrees')).toEqual(Array(48).fill(0));
    });
});
```

  (`sampleSelfTest` takes the unit type of `onSelfTestPage`; widen its parameter type to `HeadlessUnit` if `tsc`
  complains, importing it from `../../../harness/boot`.) In `HeadingInput.test.ts` add to the public-contract describe:

```ts
    // The roll command follows the runtime override: with the input switched on, the unit banks toward the leg (#143)
    it('gives roll steering once switched on at runtime (2-69, #143)', async () => {
        const {kaaa, abc} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(onLeg, abc);
        const unit = await bootOnStandardRoute({magvar: 0});
        await moveAircraft(unit, pointFrom(onLeg, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0); // Precondition: no heading input

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 1);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeGreaterThan(0); // left bank, toward the leg
    });
```

  (import `moveAircraft` and `pointBefore`, `pointFrom`, `courseDeg` from `../harness/flight/geo`.) In
  `SensorsOut.test.ts:538` (`L:KLN90B_RollCommand is still written, as an output of the unit`) boot with
  `panelXml({...NO_GPS_SIMVARS, ...HEADING_INPUT})` and add to its comment that roll steering needs the heading input
  (2-69, #143); import `HEADING_INPUT`.

- [ ] **Step 2: run, expect red.** The converted pin, the self-test test and the runtime test fail (25, the pattern,
  the precondition); the course-to-steer test passes today (it must keep passing).

- [ ] **Step 3: implement.** `RollSteeringController`: the constructor gets
  `private readonly planeSettings: KLN90PlaneSettings` as third parameter (import from `../settings/KLN90BPlaneSettings`);
  every `this.sensors.out.setRollCommand(` in the class becomes `this.setOutput(`; add

```ts
    /**
     * Installation Manual 2-69: without a heading input the unit gives no roll steering, so L:KLN90B_RollCommand is 0,
     * also during the self-test (#143). GPS COURSE TO STEER is written either way: a deliberate decision, because the
     * default autopilot reads it and holding it at 0 has unknown side effects
     */
    private setOutput(bankAngle: number | null, desiredTrack: number | null): void {
        this.sensors.out.setRollCommand(this.planeSettings.input.headingInput ? bankAngle : null, desiredTrack);
    }
```

  `KLN90BCore.ts`: pass the plane settings to `new RollSteeringController(...)`. `test/harness/flight/Flight.ts`
  `start`: pass `panelXml: boot.panelXml ?? panelXml(HEADING_INPUT)` to `bootUnit` (import from `../panelXml`), with the
  comment: the coupled autopilot flies on the roll command, which needs a heading input (2-69, #143), so a flight has
  one unless the test gives its own panel.xml. `cfg/panel.xml:9`: the comment names roll steering (Task 5 wrote the
  sentence; keep it).

- [ ] **Step 4: run** → pass; full suite green, including the inventory's nine vehicles (`dmeArc.test.ts:68-71`, `:109`,
  `firstFlight.test.ts:8`, `turnDirection.test.ts:16`, `waypointAlertTurn.test.ts:25`, `:82`, `SensorsOut.test.ts:517`,
  `:538`) and the flight test of Task 1. Mutation check: make `setOutput` pass `bankAngle` unconditionally (the pin, the
  self-test test and the runtime precondition go red); remove the Flight default (the flight vehicles go red); restore.

- [ ] **Step 5: docs and commit.** `docs/architecture.md` ~126: the self-test sweep is sent only with a heading input;
  `test/README.md` flight section: `Flight.start` boots with `HeadingInput` true unless given a panel.xml;
  `docs/test-next-steps.md:290`: the note about #143 is done. Commit
  `fixes #143 give no roll steering without a heading input`, with a body that says `GPS COURSE TO STEER` is kept on
  purpose and `references #368`.

```json:metadata
{"files": ["kln90b/services/RollSteeringController.ts", "kln90b/KLN90BCore.ts", "test/harness/flight/Flight.ts", "cfg/panel.xml", "test/render/services/RollSteeringController.test.ts", "test/render/SensorsOut.test.ts", "test/render/pages/left/SelfTestLeftPage.test.ts", "test/render/HeadingInput.test.ts", "docs/architecture.md", "test/README.md", "docs/test-next-steps.md"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["no heading input: roll command 0, GPS COURSE TO STEER the intercept course", "self-test without heading input: 0 throughout; with it the pattern stays", "runtime LVar 1 gives roll steering", "the nine inventory vehicles pass with the Flight default HeadingInput true", "one fixes commit, full suite green"], "modelTier": "standard"}
```

---

## Close-out (controller)

- After all tasks: one final whole-branch review (session level), then the maintainer's approval before merging
  `m3-navcalculator` into `master` locally (no push); delete the branch and every worktree (junctions first) with
  `git branch -d`.
- Hand the maintainer the release note and wiki drafts of spec section 5C.
- Update the project memory: the trainer observations of 2026-10-14 evening and the trainer agent's driving notes
  (SET 1 GS fast entry, FPL 0 cursor order, AVsoftech 1:1 mouse at 1024x768), and the trainer state left behind (89:
  FPL 0 KMSN, BAE, BUU, BUU; AVsoftech: FPL 0 KABR, ATY, KETH with the VORD 35 approach, paused, display 1024x768).
