# Mode Controller: OBS/LEG and Approach Arming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone-2 issues #153, #152, #155, #122, #154, #261, #151, #129, #139, #369, #162, #163, #190, #194
and #338 of the KLN 90B simulator, one commit per issue.

**Architecture:** Nearly all fixes sit in `kln90b/services/ModeController.ts`. Two new seams carry the OBS fixes:
`setObs(obsMag, force)` (re-lay an unchanged course on purpose) and `setObsOnUnit(obsMag, force)` (a course set on the
unit is also written to the indicator at once). One new helper, `ActiveWaypoint.getActiveFafLeg()`, carries the
IAF = FAF rule into the approach switch, the ACTV scale and the `ARM GPS APPROACH` message. A pilot-disarm record in
`NavPageState` stops the auto-arm; an activation record in `ModeController` drives the ACTV ramp. `KLNMagvar` and `Vnav`
get one local change each.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (stages unit, render,
flight; render runs on happy-dom with the headless unit of `test/harness`).

**Spec:** `docs/superpowers/specs/2026-10-14-mode-controller-design.md` (read it before any task: it holds the evidence,
the trainer results, the rulings and the reasons). The inventory with every measured temporary fix is
`C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\61a081f8-3538-407f-ab2c-a9da2e324472\scratchpad\inventory\report.md`
(read the section of your issue).

## Global Constraints

- **Branches.** The integration branch is `m2-mode-controller`. Each task works in its own worktree; its first command
  is `git merge --ff-only m2-mode-controller` (agent worktrees start at master's HEAD). The controller integrates a
  finished task by cherry-pick, so the history stays linear. Never push. Never commit on `master`.
- **One commit per issue**, with its tests and doc changes in the same commit, in the order of this plan. The subject is
  `fixes #NN <description>` (a plain sentence, American English, lowercase after the number). End the message with the
  Co-Authored-By line your own attribution instructions give you. Write commit messages without a BOM (Bash heredoc or
  `-m`). A commit that also changes a pin or comment of another issue says `references #NN` for it in the body.
- **Before every commit:** `npx tsc --noEmit` is clean and the WHOLE suite `npm test` is green (about one minute), not
  only the task's files. Every test whose result changes must be one the task names; any other change is a finding to
  report before committing (it may be a test that used the bug as its vehicle).
- **Pins:** a fixed bug's `it.fails(...)` becomes `it(...)`; the issue number stays in the title. Rewrite its comment so
  it describes the fixed behavior and its evidence, not the old bug.
- **Test labels (`docs/testing.md` section 5):** a test's title cites what supports its assertion: a Pilot's Guide page
  (`5-36`), a dated trainer check (`checked in the KLN 89 trainer, 2026-10-14`), or it says `characterization`. A
  citation supports only what that page or that trainer entry literally says. The 89 has one knob pair, no ARM or ACTV
  annunciation, no Super NAV 5 and no external indicator, so nothing about those comes from it. The maintainer's rulings
  (#162, #163, #194, the adjacency rule of #153) are characterizations. A characterization carries no page number, and
  a `describe` titled with a page holds spec tests only. Report, per new or changed `describe`/`it`, its title and
  whether it is spec or characterization.
- **Copyright:** the Pilot's Guide is copyrighted. Cite page numbers and paraphrase; never copy manual text (no run of
  more than a few words) into code, comments, docs, tests or commit messages.
- **Code style:** match the surrounding code (4-space indent, double quotes in `kln90b/`, single quotes in `test/`,
  `//` comments citing pages like `//5-36` or issues like `//#139`). `target: es2017`.
- **No counts in prose** for things that grow (tests, files, issues).
- **Do not fix other bugs on the side.** A new bug is reported to the controller, who files it.
- **Asserted literals are derived independently** (the spec, the trainer record, a hand computation, or
  `test/harness/flight/geo.ts`), never copied from the output of the code under test. If a literal below turns out
  wrong, report it with your derivation; do not silently change it.
- **Mutation check:** after the fix is green, break the fix once (revert its key line), confirm the new tests and the
  converted pins turn red, restore, and confirm `git diff` shows only the intended change. Report which tests went red.
- **Docs:** each commit updates the lines of `docs/testing.md`, `docs/architecture.md` and `test/harness/fixtures.ts`
  that describe its bug (find them with `grep -n '#NN' docs/ test/harness/`). The dated blocks of `docs/testing.md`
  section 8 are never edited.
- **Worktrees:** create a `node_modules` junction to the main checkout's
  (`New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules` in PowerShell). Never delete
  through it; the controller removes the junction (`cmd //c rmdir node_modules`) before removing the worktree.
- **Scratch files** go in your own folder
  `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\61a081f8-3538-407f-ab2c-a9da2e324472\scratchpad\task<N>\`.
- **Reports:** write your report with the Bash tool (`cat > '.task-report.md' <<'EOF'`) at the root of your worktree
  (untracked, never committed); if that is refused, return it in full as text.

**User decisions (already made):**
- The design of the spec, approved by the maintainer on 2026-10-14, and the spec as committed.
- #162: keep the immediate re-activation; hold it with a characterization; `fixes #162`.
- #163: ramp from the scale at activation to 0.3 over the distance left at activation, capped at 1; cases 2 and 3 stay.
- #194: an active VNAV keeps its path under the ANGLE cursor; the cursor starts VNAV from Inactive only.
- #190: an active VOR outside the area is referenced to true north too.
- FAF promotion only for an IAF copy directly followed by its FAF copy (#153), plus the missed-approach-hold case (6-19).
- The button arm inside 30 NM ramps over 30 s like the automatic arm (#139).
- #369 was filed and added to the milestone; the D-> case of #261 is fixed in the #261 commit (comment posted on #261).

---

## Tasks, order and file ownership

| Task | Commits, in order | Main files | Starts after |
|---|---|---|---|
| 0 | docs: trainer record 2026-10-14 | `docs/testing.md` section 8 | — (controller) |
| 1 | #153, #152, #155 | `ModeController.ts` (`switchToEnrLegMode`), `ModeControllerObs.test.ts` | Task 0 |
| 2 | #122, #154, #261 | `ModeController.ts` (`setObs`), `DirectToPage.tsx`, `Mod2Page.tsx`, `ObsDtkElement.tsx` | Task 1 |
| 3 | #151 | `ModeController.ts` (`forceSwitchToEnrObsMode`), seven collateral tests | Task 2 |
| 4 | #129, #139, #369 | `ActiveWaypoint.ts`, `ModeController.ts`, `VolatileMemory.ts`, `PersistentMessages.ts` | Task 3 |
| 5 | #162, #163 | `ModeController.ts` (ACTV scale), `ModeControllerApproach.test.ts` | Task 4 |
| 6 | #190 | `KLNMagvar.ts`, `ModeController.getMagvarForObs`, `KLNMagvar.test.ts` | Task 0 |
| 7 | #194, #338 | `Vnav.ts`, `Vnav.test.ts`, `Nav4Vnav.test.ts` | Task 0 |

Tasks 1 to 5 run one after the other (they share `ModeController.ts` and its tests). Tasks 6 and 7 run in parallel with
Task 1. Task 6 owns only `getMagvarForObs` in `ModeController.ts`; the controller resolves a textual conflict with
Task 3 (the neighboring `forceSwitchToEnrObsMode`) at cherry-pick.

---

### Task 0: Record the KLN 89 trainer checks of 2026-10-14

**Goal:** One docs commit that adds the 2026-10-14 block to `docs/testing.md` section 8, before any lane starts.

**Files:**
- Modify: `docs/testing.md` (section 8, a new block after the **2026-10-12** block, before `# 9.`)

**Acceptance Criteria:**
- [ ] A `**2026-10-14**` block with the five bullets below, paraphrased, with the issue numbers.
- [ ] No other line of `docs/testing.md` changes.

**Verify:** `git diff --stat` → only `docs/testing.md`; `git diff` shows only added lines.

**Steps:**

- [ ] **Step 1: Insert the block** after the last bullet of the `**2026-10-12**` block:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/testing.md
git commit -m "Record the KLN 89 trainer checks of 2026-10-14" -m "Co-Authored-By: <your attribution line>"
```

```json:metadata
{"files": ["docs/testing.md"], "verifyCommand": "git diff --stat HEAD~1", "acceptanceCriteria": ["2026-10-14 block with five paraphrased bullets", "no other line changes"], "modelTier": "mechanical"}
```

---

### Task 1: Returning to LEG (#153, #152, #155)

**Goal:** Three commits in `ModeController.switchToEnrLegMode`: FAF promotion for an adjacent IAF copy (#153), keeping the
active copy plus the missed-approach-hold promotion (#152), and the plan leg on the FROM side (#155).

**Files:**
- Modify: `kln90b/services/ModeController.ts` (`switchToEnrLegMode` ~91-109, new private `getFafCopyIdx`, remove
  `reorientFlightplanLeg` ~283-308 and imports it alone used)
- Test: `test/render/services/ModeControllerObs.test.ts` (pins :292 #153, :235 #152, :191 #155; the MAHP test :304;
  new test after the #153 pin)
- Docs: `grep -n '#153\|#152\|#155' docs/ test/harness/`

**Acceptance Criteria:**
- [ ] #153: OBS to LEG with the IAF copy of an IAF = FAF fix active makes the FAF copy (index 2) active; the unit then
  goes ACTV within 2 NM heading toward the fix.
- [ ] #152: OBS to LEG keeps the second copy of a waypoint that is twice in FPL 0 (index 3); the MAHP = FAF test stays
  green (index 2, FAF).
- [ ] #155: OBS to LEG on the FROM side re-activates the plan leg ABC - KBBB (not a direct-to), DTK the leg's course,
  XTK 2 NM.
- [ ] `reorientFlightplanLeg` is gone; `tsc` clean; full suite green; three `fixes` commits in this order.

**Verify:** `npx vitest run test/render/services/ModeControllerObs.test.ts` → all pass, no `it.fails` left for #152,
#153, #155; then `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#153): turn the pin into a test and add the follow-on test.** In `ModeControllerObs.test.ts`, change
  `it.fails('makes the FAF copy active when the IAF and the FAF are the same fix (#153)'` to `it(`, and rewrite its
  comment: 6-11 (the example procedure and its note): after the course reversal at a fix that is IAF and FAF, switching
  to LEG makes the FAF active. Add after it:

```ts
    // 6-11: LEG with the FAF active is what the approach needs to become active; 6-3: within 2 NM of the FAF, heading
    // toward it, the unit goes ACTV
    it('goes ACTV after the switch to LEG, within 2 NM of the fix and heading toward it (6-3, 6-11)', async () => {
        const {unit, aw} = await iafIsFafInObs();
        await legMode(unit);
        expect(aw.getActiveLeg()!.fixType).toBe(KLNFixType.FAF);

        await moveAircraft(unit, pointFrom(txo, 0, 1.5), {groundspeedKt: 120, trackTrue: 180});

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.APR_LEG);
    });
```

- [ ] **Step 2: run, expect the two tests to fail.** `npx vitest run test/render/services/ModeControllerObs.test.ts` →
  the #153 test fails at `expected 1 to be 2`; the new test fails (the IAF copy stays active, so no ACTV).

- [ ] **Step 3: implement.** In `switchToEnrLegMode`, replace the TO branch body
  (`const fromCoords ... this.navState.activeWaypoint.directTo(from, active);`) with:

```ts
            } else {
                const fromCoords: LatLonInterface = this.navState.activeWaypoint.getFromWpt()!;
                const from = UserFacilityUtils.createFromLatLon(ICAO.value("U", "XX", "", "d"), fromCoords.lat, fromCoords.lon, true);
                const activeIdx = this.navState.activeWaypoint.getActiveFplIdx();
                const fafIdx = activeIdx >= 0 ? this.getFafCopyIdx(activeIdx) : -1;
                if (fafIdx >= 0) {
                    this.navState.activeWaypoint.directToFlightplanIndex(from, fafIdx); //6-11: LEG makes the FAF active (#153)
                } else {
                    this.navState.activeWaypoint.directTo(from, active);
                }
            }
```

  and add the helper below `switchToEnrLegMode`:

```ts
    /**
     * 6-11: the index of the FAF copy when the leg at idx is the IAF copy of a fix that is IAF and FAF at once, -1
     * otherwise. Only an IAF copy directly followed by its FAF copy counts: where other legs lie between the two copies,
     * the unit sequences through them (#153)
     */
    private getFafCopyIdx(idx: number): number {
        const legs = this.fpl0.getLegs();
        const leg = legs[idx];
        const next = legs[idx + 1];
        if (leg.fixType === KLNFixType.IAF && next?.fixType === KLNFixType.FAF && ICAO.valueEquals(next.wpt.icaoStruct, leg.wpt.icaoStruct)) {
            return idx + 1;
        }
        return -1;
    }
```

- [ ] **Step 4: run** the file → pass; `npx tsc --noEmit && npm test` → green. Mutation check: return -1 from
  `getFafCopyIdx`; the #153 test and the new test go red; restore.

- [ ] **Step 5: docs and commit.** Update the lines `grep -n '#153' docs/ test/harness/` finds (e.g. `docs/testing.md`
  ~1287) to say the case is fixed. Commit `fixes #153 make the FAF copy active when returning to LEG at a fix that is IAF and FAF`.

- [ ] **Step 6 (#152): turn the pin into a test.** Change `it.fails('keeps the second copy of a waypoint that is twice
  in FPL 0 active (#152)'` to `it(`; its comment: 5-36 rule 1, the active waypoint stays; checked in the KLN 89 trainer,
  2026-10-14 (the second copy stayed active through OBS and back). Rewrite the comment of `secondAbcInObs` (it says the
  lookup finds the first copy) and of the MAHP test at :301-303 (it says the test passes only because of the first-copy
  lookup): the MAHP copy goes to the FAF copy by the 6-19 promotion. Run: the #152 test fails (`expected 1 to be 3`).

- [ ] **Step 7: implement.** Replace the TO branch again:

```ts
            } else {
                const fromCoords: LatLonInterface = this.navState.activeWaypoint.getFromWpt()!;
                const from = UserFacilityUtils.createFromLatLon(ICAO.value("U", "XX", "", "d"), fromCoords.lat, fromCoords.lon, true);
                const activeIdx = this.navState.activeWaypoint.getActiveFplIdx();
                if (activeIdx >= 0) {
                    const fafIdx = this.getFafCopyIdx(activeIdx);
                    //5-36: the active copy stays active (#152); 6-11, 6-19: the FAF copy for an IAF or holding point that is the FAF
                    this.navState.activeWaypoint.directToFlightplanIndex(from, fafIdx >= 0 ? fafIdx : activeIdx);
                } else {
                    this.navState.activeWaypoint.directTo(from, active);
                }
            }
```

  and extend `getFafCopyIdx` (update its doc comment to name 6-19 and the missed approach holding point):

```ts
    private getFafCopyIdx(idx: number): number {
        const legs = this.fpl0.getLegs();
        const leg = legs[idx];
        const next = legs[idx + 1];
        if (leg.fixType === KLNFixType.IAF && next?.fixType === KLNFixType.FAF && ICAO.valueEquals(next.wpt.icaoStruct, leg.wpt.icaoStruct)) {
            return idx + 1;
        }
        if (leg.fixType === KLNFixType.MAHP) {
            //6-19: the missed approach holding point is also the FAF, which lies earlier in the plan
            return legs.findIndex(l => l.fixType === KLNFixType.FAF && ICAO.valueEquals(l.wpt.icaoStruct, leg.wpt.icaoStruct));
        }
        return -1;
    }
```

- [ ] **Step 8: run** the file → pass, the MAHP test green; full suite green. Mutation check: make the MAHP branch
  return -1 → the MAHP test goes red (`expected 4 to be 2`); use `activeIdx` instead of `fafIdx >= 0 ? ...` → the #153
  test goes red; restore. Docs for #152; commit `fixes #152 keep the active copy of a waypoint that is twice in FPL 0 when returning to LEG`.

- [ ] **Step 9 (#155): turn the pin into a test.** Change `it.fails('re-activates the plan leg ABC - KBBB instead of a
  direct-to from the present position (#155)'` to `it(`; comment: 5-36 rules 1 and 2, and checked in the KLN 89
  trainer, 2026-10-06 (the plan leg came back with its DTK and its deviation, TO). Fix the sibling's comment "today and
  under the fix of the pin". Run: it fails.

- [ ] **Step 10: implement.** Replace the FROM branch:

```ts
            if (this.navState.toFrom === FROM && this.navState.activeWaypoint.getActiveFplIdx() !== -1) {
                //5-36: on the FROM side the unit re-orients on FPL 0 and the leg found by position becomes active as a plan leg (#155)
                this.navState.activeWaypoint.activateFpl0();
            } else {
```

  Delete `reorientFlightplanLeg` and every import only it used (check `GeoCircle`; keep what `setObs` and the approach
  code still use). `tsc` does not flag an unused private method, so check by `grep -n reorientFlightplanLeg kln90b`.

- [ ] **Step 11: run** the file and the full suite → green. Mutation check: put the old direct-to back → the #155 test
  goes red; restore. Docs for #155; commit `fixes #155 re-activate the plan leg on the FROM side when returning to LEG`.

```json:metadata
{"files": ["kln90b/services/ModeController.ts", "test/render/services/ModeControllerObs.test.ts", "docs/testing.md"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#153 FAF copy index 2 after LEG; ACTV within 2 NM afterwards", "#152 second copy index 3 kept; MAHP=FAF test green", "#155 plan leg ABC-KBBB, not DCT, XTK 2 NM", "reorientFlightplanLeg removed", "three fixes commits in order"], "modelTier": "standard"}
```

---

### Task 2: Applying the OBS course (#122, #154, #261)

**Goal:** `setObs` gets a `force` flag used on entering OBS (#122) and by ACTIVATE (#154); a new `setObsOnUnit` writes a
course set on the unit to the indicator at once (#261), including the Direct To in OBS and the course the unit chooses
on entering OBS with a driven indicator.

**Files:**
- Modify: `kln90b/services/ModeController.ts` (`setObs` ~148, `forceSwitchToEnrObsMode` ~207-228, new `setObsOnUnit`)
- Modify: `kln90b/pages/left/DirectToPage.tsx` (~114 ACTIVATE, ~119 D-> in OBS)
- Modify: `kln90b/pages/left/Mod2Page.tsx` (~157, ~162), `kln90b/controls/selects/ObsDtkElement.tsx` (~42, ~47)
- Test: `test/render/services/ModeController.test.ts` (pin :74), `test/render/pages/left/DirectToObs.test.ts` (pin :81,
  new D-> test), `test/render/pages/left/Mod2Page.test.ts` (pin :179, new entry test), `test/render/pages/left/Nav3Page.test.ts`
  (new driven-indicator test)
- Comments only: `test/render/data/flightplan/DuplicateWaypoints.test.ts:37`, `test/render/services/ModeController.test.ts:26`,
  `test/flight/flights/hsiToFromFlags.test.ts:24` (each says a course of 0 would return early)

**Acceptance Criteria:**
- [ ] #122: entering OBS with the indicator on 000 lays the course 000 through ABC (`isDctNavigation()` true, XTK
  about -7.77 NM).
- [ ] #154: ACTIVATE with OBS 050 measures the deviation through KBBB (about 24.5 NM), not 0.
- [ ] #261: with ObsSource 1 and ObsTarget 1, a course turned on MOD 2 or NAV 3 stays and `Nav OBS:1` follows; a D-> in
  OBS keeps the direct course and slews the indicator; entering OBS slews the indicator to the course the unit chose.
- [ ] The 1 Hz read-back in `tick` still skips an unchanged course (no `force` there).
- [ ] Three `fixes` commits in order; full suite green.

**Verify:** `npx vitest run test/render/services/ModeController.test.ts test/render/pages/left/DirectToObs.test.ts test/render/pages/left/Mod2Page.test.ts test/render/pages/left/Nav3Page.test.ts`
→ pass; `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#122): pin to test.** `it.fails('measures the deviation from an OBS course of 000 through the waypoint (#122)'`
  → `it(`; comment: 5-36, the course is whatever the indicator selects, 000 included. Run: it fails.

- [ ] **Step 2: implement.**

```ts
    /**
     * Sets the OBS course and lays it through the active waypoint. An unchanged course is skipped unless force is set:
     * the indicator is read every second (tick), and laying the same course again would make a new direct-to each time.
     * Entering OBS and ACTIVATE force it, because the course must be laid even when its number did not change (5-36,
     * 5-37; #122, #154)
     */
    public setObs(obsMag: Degrees, force: boolean = false): void {
        if (!force && obsMag === this.navState.obsMag) {
            return;
        }
```

  In `forceSwitchToEnrObsMode` both calls become forced: `this.setObs(this.sensors.in.obsMag, true);` and
  `this.setObs(this.magvar.trueToMag(obsTrue, magvar), true);`.

- [ ] **Step 3: run** → pass; full suite green (the inventory measured only the #122 and #154 pins changing under the
  plain removal; with `force` the #154 pin must stay a pin here). Update the three workaround comments listed under
  Files (assertions unchanged). Mutation check: drop `, true` in the ObsSource branch → the #122 test goes red; restore.
  Commit `fixes #122 lay an OBS course of 000 through the waypoint when entering OBS`.

- [ ] **Step 4 (#154): pin to test.** `it.fails('does not recenter the deviation: it is measured from the OBS course
  through the new waypoint (#154)'` → `it(`; comment: 5-37 (5.9.7), and checked in the KLN 89 trainer, 2026-10-14
  (course 045 kept, Fly L 37.5 NM after ACTIVATE). Run: fails.

- [ ] **Step 5: implement** in `DirectToPage.performDirectTo`:

```ts
                if (this.activateMode) {
                    //5-37: ACTIVATE keeps the course and lays it through the new waypoint, so the bar is not recentered (#154)
                    this.props.modeController.setObs(this.props.memory.navPage.obsMag, true);
                } else {
```

- [ ] **Step 6: run** → pass; full suite green. Mutation: drop `, true` → the #154 test red; restore. Commit
  `fixes #154 keep the deviation from the OBS course through the new waypoint after ACTIVATE`.

- [ ] **Step 7 (#261): pin to test and new tests.** `it.fails('keeps a course turned on MOD 2 and slews the indicator
  to it (5-35, #261)'` → `it(`; rewrite the describe's comment (the read-back order was the bug). Add in the same
  describe of `Mod2Page.test.ts`:

```ts
    // 5-36: with an indicator the unit drives, the unit chooses the course on the switch to OBS so that the deviation
    // stays, and 5-35: the indicator is slewed to it. The indicator stood on 120 before; the equator leg runs 090
    it('slews a driven indicator to the course the unit chooses on the switch to OBS (5-35, 5-36, #261)', async () => {
        const unit = await onEquatorLeg(panelXml({'Output.ObsTarget': 1}));
        unit.env.sim.applyObsKeyEvents = true;
        unit.env.sim.set('Nav OBS:1', 'degrees', 120);

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(Math.round(unit.props.memory.navPage.obsMag)).toBe(90);
        expect(Math.round(unit.env.sim.get('Nav OBS:1', 'degrees'))).toBe(90);
    });
```

  In `DirectToObs.test.ts`, describe `Direct To in OBS mode (5-37)`, add:

```ts
    // 5-37 (5.9.6): with an indicator the unit reads and drives (ObsSource 1, ObsTarget 1) the direct course is set and
    // the indicator slewed to it; the indicator's old course (120) must not come back at the next tick (#261)
    it('keeps the direct course and slews an indicator it reads and drives (5-37, #261)', async () => {
        const unit = await planInObs(offLeg, {obs: 120, panelXml: panelXml({'Output.ObsTarget': 1}), abc: abcE});
        unit.env.sim.applyObsKeyEvents = true;
        const nav = unit.props.memory.navPage;
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);

        expect(Math.abs(nav.obsMag - (courseDeg(offLeg, abc) - 10))).toBeLessThan(0.05); // 024.2 magnetic
        expect(Math.abs(unit.env.sim.get('Nav OBS:1', 'degrees') - (courseDeg(offLeg, abc) - 10))).toBeLessThan(0.5);
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05);
    });
```

  Note: `planInObs` sets the indicator before OBS; with ObsTarget 1 the unit chooses the course itself on entry, so
  the entry course is not 120. That does not matter for this test, which asserts after the D->. In `Nav3Page.test.ts`,
  next to `changes the OBS course with the inner knob under the cursor (5-35)` (:138), add a driven-indicator variant
  built from that test's setup with `panelXml({'Output.ObsTarget': 1})` (ObsSource left at its default 1),
  `unit.env.sim.applyObsKeyEvents = true`, the indicator set to the course the unit shows, three clicks right, two
  seconds, then `obsMag` and `Nav OBS:1` both 3 above the start. Title: `keeps a course turned on NAV 3 and slews a
  driven indicator to it (5-35, #261)`.

  Run all four: the pin, the D-> test and the NAV 3 test fail. **Run the entry test too and report its result**: if it
  passes before the fix, say so (it stays as a regression test, and the `setObsOnUnit(…, true)` change of Step 8 for
  the entry is then still made, but its mutation check is reported as not biting).

- [ ] **Step 8: implement.** In `ModeController`, below `setObs`:

```ts
    /**
     * A course set on the unit: MOD 2, NAV 3, Super NAV 5, a Direct To in OBS, and the course the unit chooses on entering
     * OBS with a driven indicator. 5-35, 5-37: a driven indicator is slewed to it, so the output is written at once;
     * otherwise the indicator's old course is read back at the next tick and replaces it (#261)
     */
    public setObsOnUnit(obsMag: Degrees, force: boolean = false): void {
        this.setObs(obsMag, force);
        this.sensors.out.setObs(this.navState.obsMag);
    }
```

  Callers: `Mod2Page.tsx` (~157, ~162) and `ObsDtkElement.tsx` (~42, ~47) call `setObsOnUnit` instead of `setObs`;
  `DirectToPage.tsx` (~119, the D-> branch, not ACTIVATE) calls `this.props.modeController.setObsOnUnit(obsMag)`;
  in `forceSwitchToEnrObsMode` the unit-chosen branch becomes
  `this.setObsOnUnit(this.magvar.trueToMag(obsTrue, magvar), true);` (the ObsSource branch, where the course is the
  indicator's own, stays `setObs(…, true)`). Do not change `Mod2Page.innerRight`'s `return false` (a side check of
  the controller, not part of this fix).

- [ ] **Step 9: run** → pass; full suite green. Mutation: make `setObsOnUnit` skip the `sensors.out.setObs` line → the
  pin, the D-> test, the NAV 3 test (and the entry test, if it bit) go red; restore. Docs (`grep -n '#261'`); commit
  `fixes #261 write a course set on the unit to a driven indicator at once`.

```json:metadata
{"files": ["kln90b/services/ModeController.ts", "kln90b/pages/left/DirectToPage.tsx", "kln90b/pages/left/Mod2Page.tsx", "kln90b/controls/selects/ObsDtkElement.tsx", "test/render/services/ModeController.test.ts", "test/render/pages/left/DirectToObs.test.ts", "test/render/pages/left/Mod2Page.test.ts", "test/render/pages/left/Nav3Page.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#122 course 000 laid through ABC, XTK about -7.77", "#154 XTK about 24.5 after ACTIVATE", "#261 MOD 2, NAV 3, D-> and OBS entry keep the course and slew Nav OBS:1", "tick read-back still skips unchanged course", "three fixes commits"], "modelTier": "standard"}
```

---

### Task 3: The course chosen on LEG to OBS (#151)

**Goal:** When the unit chooses the OBS course, it takes the bearing of the current path at the active waypoint, so the
deviation is kept on a long leg; the seven tests that hard-code the DTK at the aircraft get re-derived values.

**Files:**
- Modify: `kln90b/services/ModeController.ts` (`forceSwitchToEnrObsMode`, the unit-chosen branch)
- Test: `test/render/services/ModeControllerObs.test.ts` (pin :109, comment :45-47)
- Test (collateral, new expected values): `test/render/controls/SuperNav5Left.test.ts:85` (and the open #321 pin :97),
  `test/render/controls/selects/ObsDtkElement.test.ts:50`, `test/render/pages/left/Mod2Page.test.ts:238` and `:246`,
  `test/render/pages/left/Nav3Page.test.ts:113` and `:138`, `test/render/pages/left/SuperNav5Page.test.ts:583`, `:591`,
  `:600`

**Acceptance Criteria:**
- [ ] The #151 pin passes: |XTK| < 0.1 NM after OBS, 100 NM before EEE.
- [ ] The two #67 tests in `ActiveWaypoint.test.ts:150,166` stay green (the `isValid()` guard).
- [ ] Each collateral test asserts a value derived with `finalCourseDeg` from `test/harness/flight/geo.ts` (the course at
  the end of the leg), with the derivation in its comment.
- [ ] The "just below north" pair in `Mod2Page.test.ts` still starts from a course just below 090 and ends between 359.5
  and 360.

**Verify:** `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1: pin to test.** `it.fails('keeps the deviation of an aircraft on a long leg, 100 NM before the waypoint
  (#151)'` → `it(`; comment: 5-36 rule 2.ii, and checked in the KLN 89 trainer, 2026-10-14 (100 NM before the end of a
  136 NM leg the deviation stayed 0.02 NM). Rewrite the comment above `longLegInObs` and the one at :45-47 ("the leg's DTK
  at the aircraft") to say the course is the leg's course at the active waypoint. Run: fails (about 3.1 NM).

- [ ] **Step 2: implement** in `forceSwitchToEnrObsMode`:

```ts
        } else if (active !== null) {
            //5-36: the course of the current path at the active waypoint, so that the course laid through it is the leg
            //itself and the deviation is kept on any leg length (#151). A degenerate path (TO and FROM the same
            //waypoint, #67) falls back to the DTK or the bearing
            const fromPath = this.navState.activeWaypoint.getFromLeg()?.path;
            const pathCourse = fromPath !== undefined && fromPath.isValid() ? fromPath.bearingAt(active) : NaN;
            const obsTrue = isNaN(pathCourse) ? (this.navState.desiredTrack ?? this.navState.bearingToActive!) : pathCourse;

            const magvar = this.getMagvarForObs(active);
            this.setObsOnUnit(this.magvar.trueToMag(obsTrue, magvar), true);
        }
```

  (`setObsOnUnit(…, true)` is the line Task 2 left there; keep it.)

- [ ] **Step 3: run** the full suite. Expected red, and only these: the converted pin turns green; the seven collateral
  tests listed under Files fail. Anything else red is a finding: report it.

- [ ] **Step 4: re-derive the collateral expectations.** For each, compute the new course with
  `finalCourseDeg(from, to)` (true) less the variation the test uses, round as the display does, and put the derivation
  in the comment. The inventory saw: `SuperNav5Left` 050 → 051, `ObsDtkElement` 089 → 090, `Nav3Page` 089 → 090
  (twice), `SuperNav5Page` `Ù050°` → `Ù051°` (the precondition :583 and the two tests); verify each by your derivation.
  For the open #321 pin at `SuperNav5Left.test.ts:97`, change its `ENR:050` to the re-derived value so that it still
  fails for its own reason only (say `references #321` in the commit body).

  For `Mod2Page.test.ts` "MOD 2 OBS course just below north": the equator leg now gives exactly 090, so add a helper next
  to `onEquatorLeg`:

```ts
/** A leg just north of east, KAAA (0, 8) to ABC (0.003, 9), the aircraft on it at 8.4 E: the course at ABC is a hair
 * under 090, about 089.83 (the leg climbs 0.003 degrees of latitude over one degree of longitude) */
const onNearEquatorLeg = (xml?: string) => onLeg({lat: 0, lon: 8}, {lat: 0.003, lon: 9}, {lat: 0.0012, lon: 8.4}, xml);
```

  and use it in `turned90Left`, with a precondition right after `obsMode()`:

```ts
        const course = unit.props.memory.navPage.obsMag;
        expect(course).toBeGreaterThan(89.5); // Precondition: just below 090, so ninety clicks left end just below 360
        expect(course).toBeLessThan(90);
```

  Rename the first test `turns the course 90 degrees left from a leg just north of east (5-35)` and rewrite the
  describe's comment (it cites the equator course 89.99999914). Check with `finalCourseDeg({lat: 0, lon: 8}, {lat: 0.003,
  lon: 9})` that the course is between 89.5 and 90 before relying on it; if it is not, pick a latitude that gives about
  089.8 and report it. The `onLeg` comment ("true course exactly 090 or 000 everywhere") must stay true for the two old
  helpers; say in the new helper's comment that it is the exception.

- [ ] **Step 5: run** → full suite green. Mutation: replace `pathCourse` by `NaN` → the #151 test and the collateral
  tests go red; restore. Docs (`grep -n '#151'`); commit
  `fixes #151 choose the OBS course as the leg's course at the active waypoint`.

```json:metadata
{"files": ["kln90b/services/ModeController.ts", "test/render/services/ModeControllerObs.test.ts", "test/render/controls/SuperNav5Left.test.ts", "test/render/controls/selects/ObsDtkElement.test.ts", "test/render/pages/left/Mod2Page.test.ts", "test/render/pages/left/Nav3Page.test.ts", "test/render/pages/left/SuperNav5Page.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#151 pin passes, XTK < 0.1", "#67 tests stay green", "collateral expectations re-derived with finalCourseDeg", "near-north pair still tests just below north"], "modelTier": "standard"}
```

---

### Task 4: Approach arming (#129, #139, #369)

**Goal:** `ActiveWaypoint.getActiveFafLeg()` lets the IAF copy of an IAF = FAF fix count as the FAF for the ARM to APR
switch (#129); a pilot-disarm record stops the auto-arm and the button arm ramps the scale (#139); `ARM GPS APPROACH`
uses the helper (#369).

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (new `getActiveFafLeg`)
- Modify: `kln90b/services/ModeController.ts` (`checkSwitchAprArmToActive`, `adjustXtkScaleActive`,
  `armApproachPressed`, `checkSwitchEnrToArmMode`, `getApproachApt`, new `getFirstApproachLeg`)
- Modify: `kln90b/data/VolatileMemory.ts` (`NavPageState.approachDisarmedLeg`)
- Modify: `kln90b/data/PersistentMessages.ts` (`ArmGPSApproachMessage`)
- Test: `test/render/services/ModeController.test.ts` (pin :229 #129, new tests), `test/render/HEvents.test.ts` (pin :498
  #139), `test/render/services/ModeControllerApproach.test.ts` (:105, new tests), `test/unit/data/PersistentMessages.test.ts`
  (stub)
- Docs: `docs/architecture.md:422-426`, `docs/testing.md` (~971, ~1284, ~1341-1342), `test/harness/fixtures.ts:41-44`

**Acceptance Criteria:**
- [ ] #129: with the IAF copy active 1.55 NM before the fix, heading toward it, the unit goes APR; it sequences on to the
  MAP in APR at 0.3 without an error.
- [ ] #139: after the press inside 30 NM the unit stays ENR; a second press arms again with the scale ramping 5 to 1
  over about 30 s; loading the approach again re-arms automatically; `ARM GPS APPROACH` shows 2.9 NM before the FAF
  while disarmed.
- [ ] #369: `ARM GPS APPROACH` shows 2.5 NM before an IAF = FAF fix while disarmed with the IAF copy active.
- [ ] Three `fixes` commits in order; full suite green.

**Verify:** `npx vitest run test/render/services/ModeController.test.ts test/render/HEvents.test.ts test/render/services/ModeControllerApproach.test.ts test/unit/data/PersistentMessages.test.ts`
→ pass; `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#129): pin to test, plus a follow-on test.** `it.fails('switches to APR within 2 NM of the fix, heading
  toward it (#129)'` → `it(`; its describe comment: 6-3 lists an IAF/FAF fix as the active waypoint of the switch and
  6-10 has the switch 2 NM before such a fix. Add in that describe:

```ts
    // 6-3, 6-10: active at the IAF copy, the unit sequences over the zero-length IAF to FAF leg and on to the MAP, and the
    // scale is 0.3 past the FAF
    it('flies on in APR past the fix to the MAP at 0.3 (6-3, 6-10)', async () => {
        const {unit, txo} = await armedNearIafFaf();
        const nav = unit.props.memory.navPage;
        await moveAircraft(unit, pointFrom(txo, 0, 1.55), {groundspeedKt: 120, trackTrue: 180});
        expect(nav.navmode).toBe(NavMode.APR_LEG);

        await moveAircraft(unit, pointFrom(txo, 0, 0.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav.xtkScale).toBeGreaterThan(0.3);
        expect(nav.xtkScale).toBeLessThan(0.7); // On the ramp to 0.3, 0.5 NM before the fix

        await moveAircraft(unit, pointFrom(txo, 180, 1), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(3000);
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(nav.xtkScale).toBe(0.3);
        expect(unit.errors).toEqual([]);
    });
```

  Run: both fail.

- [ ] **Step 2: implement.** In `ActiveWaypoint`, after `getActiveLeg`:

```ts
    /**
     * 6-3, 6-10: the FAF leg while the FAF is the active waypoint, also when the active leg is the IAF copy of a fix that
     * is IAF and FAF at once (the next leg is the same fix typed FAF, #129). Null otherwise
     */
    public getActiveFafLeg(): KLNFlightplanLeg | null {
        const active = this.getActiveLeg();
        if (active === null) {
            return null;
        }
        if (active.fixType === KLNFixType.FAF) {
            return active;
        }
        const next = this.getFollowingLeg();
        if (active.fixType === KLNFixType.IAF && next?.fixType === KLNFixType.FAF && ICAO.valueEquals(next.wpt.icaoStruct, active.wpt.icaoStruct)) {
            return next;
        }
        return null;
    }
```

  In `ModeController.adjustXtkScaleActive` replace `const faf = this.navState.activeWaypoint.getActiveLeg(); if
  (faf?.fixType !== KLNFixType.FAF) {` with `const faf = this.navState.activeWaypoint.getActiveFafLeg(); if (faf ===
  null) {`; in `checkSwitchAprArmToActive` the same, with the comment `//6-3: only with the FAF active, or the IAF copy
  of a fix that is IAF and FAF (#129)`. The rest of both methods uses `faf.wpt` unchanged.

- [ ] **Step 3: run** → pass; full suite green. Mutation: make `getActiveFafLeg` return null for the IAF case → the pin
  and the follow-on test go red; restore. Docs: `docs/architecture.md:422-426` ("ARM becomes APR when the FAF is
  active" gets "or the IAF copy of a fix that is IAF and FAF"), `docs/testing.md` ~1284, `test/harness/fixtures.ts:41-44`.
  Commit `fixes #129 switch to APR at a fix that is IAF and FAF`.

- [ ] **Step 4 (#139): measure, then pin to test and new tests.** First apply only the code of Step 5 temporarily and
  run the full suite, to list the tests that assert the immediate ±1 of a button arm inside 30 NM (the spec asks for
  this measurement); report the list, then revert and continue with the tests. `it.fails('stays disarmed after the
  press 20 NM from the airport (#139)'` → `it(`. In `ModeControllerApproach.test.ts`, describe `GPS APR switch while
  armed`, rewrite `goes to ENR at +-5 on the press while armed (6-1)` to press with `unit.panel.press(...)` and assert
  ENR and 5 again after `await vi.advanceTimersByTimeAsync(3000)` (drop the "#139" remark from its comment), and add:

```ts
    // 6-1: a second press arms again; 6-1, 6-3: armed inside 30 NM, the scale changes from 5 to 1 over the next 30 s
    it('arms again at the second press inside 30 NM and ramps the scale to 1 over 30 s (6-1, 6-3)', async () => {
        const {unit} = await approachLoaded(20);
        expect(await scaleAfter(unit, 31)).toBe(1);
        await unit.panel.press('KLN90B_ApprArm_Push');
        expect(await scaleAfter(unit, 3)).toBe(5);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);

        await unit.panel.press('KLN90B_ApprArm_Push');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        const mid = await scaleAfter(unit, 15);
        expect(mid).toBeGreaterThan(1.5); // A ramp, not a jump
        expect(mid).toBeLessThan(4.5);
        expect(await scaleAfter(unit, 16)).toBe(1);
    });

    // B-1: with the approach disarmed, the unit reminds the pilot 3 NM before the FAF. The FAF FAFAA is 5 NM north of
    // KPRC, so 7.9 NM north is 2.9 NM before it
    it('shows ARM GPS APPROACH before the FAF with the approach disarmed (B-1)', async () => {
        const {w, unit} = await approachLoaded(20);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);

        await moveAircraft(unit, w.north(7.9), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(2000);

        expect(activeIdent(unit)).toBe('FAFAA');
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
        expect(messageLines(unit)).toContainEqual(['ARM GPS APPROACH']);
    });
```

  and a characterization describe at the end of the file:

```ts
describe('the pilot disarm and a new approach (characterization)', () => {
    // The disarm belongs to the approach that was loaded; the same approach loaded again is a new approach, which arms by
    // itself inside 30 NM (#139)
    it('arms by itself again when the approach is loaded again after the disarm (characterization, #139)', async () => {
        const {unit} = await approachLoaded(20);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(3000);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);

        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(3000);

        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
    });
});
```

  (import `messageLines` from `../../harness/readers`. If `loadProcedure('APT 8')` on a plan that already holds the
  approach asks to replace it, follow the prompts the way the existing APT 8 tests do; report the sequence.) Run: the
  pin, the second-press test and the message test fail; the reload test passes today (it holds the setup) and must
  still pass after the fix.

- [ ] **Step 5: implement.** `VolatileMemory.ts`, in `NavPageState` after `xtkScale` (add the type import of
  `KLNFlightplanLeg` from `./flightplan/Flightplan` if missing):

```ts
    public approachDisarmedLeg: KLNFlightplanLeg | null = null; //6-1: the first APP leg of FPL 0 when the pilot disarmed the approach (#139)
```

  `ModeController.ts`:

```ts
    public armApproachPressed() {
        let apt: AirportFacility | null;
        this.navState.approachDisarmedLeg = null; //6-1: every press ends a disarm (#139)
        switch (this.navState.navmode) {
            case NavMode.ENR_LEG:
                apt = this.getApproachApt();
                if (apt === null) {
                    this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APPROACH");
                } else {
                    this.navState.navmode = NavMode.ARM_LEG; //6-1, 6-3: inside 30 NM the scale ramps to 1 (adjustXtkScaleArm)
                }
                break;
            case NavMode.ARM_LEG:
                this.navState.navmode = NavMode.ENR_LEG;
                this.navState.xtkScale = 5;
                this.navState.approachDisarmedLeg = this.getFirstApproachLeg(); //6-1: disarmed until the next press (#139)
                break;
            case NavMode.ENR_OBS:
                apt = this.getApproachApt();
                if (apt === null) {
                    this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APPROACH");
                } else {
                    this.navState.navmode = NavMode.ARM_OBS; //6-1, 6-3: inside 30 NM the scale ramps to 1 (adjustXtkScaleArm)
                }
                break;
            case NavMode.ARM_OBS:
                this.navState.navmode = NavMode.ENR_OBS;
                this.navState.xtkScale = 5;
                this.navState.approachDisarmedLeg = this.getFirstApproachLeg(); //6-1: disarmed until the next press (#139)
                break;
            case NavMode.APR_LEG:
                this.navState.navmode = NavMode.ARM_LEG;
                this.navState.xtkScale = 1;
                break;
        }
    }
```

```ts
    private checkSwitchEnrToArmMode(apt: AirportFacility | null): void {
        const disarmed = this.navState.approachDisarmedLeg;
        if (disarmed !== null) {
            if (disarmed === this.getFirstApproachLeg()) {
                return; //6-1: the pilot disarmed this approach (#139)
            }
            this.navState.approachDisarmedLeg = null; //The approach was removed, replaced or loaded again
        }
        if (apt !== null && UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(apt), UnitType.NMILE) <= 30) {
            console.log("Moving to Arm mode");
            this.navState.navmode = this.navState.navmode === NavMode.ENR_OBS ? NavMode.ARM_OBS : NavMode.ARM_LEG;
        }
    }
```

```ts
    /**
     * If there is an approach in the Flightplan, then this will return the corresponding airport. Null otherwise
     */
    private getApproachApt(): AirportFacility | null {
        return this.getFirstApproachLeg()?.parentFacility ?? null;
    }

    private getFirstApproachLeg(): KLNFlightplanLeg | null {
        return this.fpl0.getLegs().find(leg => leg.type === KLNLegType.APP) ?? null;
    }
```

- [ ] **Step 6: run** → pass; full suite green. Mutation: skip the `return` in `checkSwitchEnrToArmMode` → the pin, the
  rewritten ENR test, the second-press test and the message test go red; put `xtkScale = 1` back in the ENR_LEG case →
  the second-press test goes red; make the record survive a new leg object (drop the `=== ` comparison, return whenever
  `disarmed !== null`) → the reload test goes red; restore each. Docs: `docs/architecture.md:422-426` (the auto-arm
  skips an approach the pilot disarmed), `docs/testing.md` ~971 and ~1341-1342 (the render test now exists). Commit
  `fixes #139 keep the approach disarmed after the pilot's press inside 30 NM`.

- [ ] **Step 7 (#369): the failing test.** In `ModeController.test.ts`, turn `armedNearIafFaf()` into
  `iafFafWorld(nmNorth: number)` (position `pointFrom(txo, 0, nmNorth)`), keep `armedNearIafFaf = () =>
  iafFafWorld(1.6)`, and add a describe:

```ts
// B-1: with the approach disarmed the unit reminds the pilot 3 NM before the FAF; at a fix that is IAF and FAF the IAF
// copy is the active waypoint there (6-10)
describe('ARM GPS APPROACH at a fix that is IAF and FAF (B-1, #369)', () => {
    it('shows ARM GPS APPROACH 2.5 NM before the fix with the IAF copy active and the approach disarmed (B-1, #369)', async () => {
        const {unit, txo} = await iafFafWorld(6);
        const nav = unit.props.memory.navPage;
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav.navmode).toBe(NavMode.ARM_LEG); // 11 NM from KPRC: armed by itself
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav.navmode).toBe(NavMode.ENR_LEG);

        await moveAircraft(unit, pointFrom(txo, 0, 2.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(2000);

        expect(nav.activeWaypoint.getActiveLeg()!.fixType).toBe(KLNFixType.IAF);
        expect(messageLines(unit)).toContainEqual(['ARM GPS APPROACH']);
    });
});
```

  (import `messageLines`). Run: fails.

- [ ] **Step 8: implement** in `PersistentMessages.ts`, `ArmGPSApproachMessage.isConditionValid`:

```ts
    public isConditionValid(): boolean {
        //B-1: near the FAF, also at the IAF copy of a fix that is IAF and FAF (#369)
        const faf = this.navstate.activeWaypoint.getActiveFafLeg();
        if (faf === null || !(this.navstate.navmode === NavMode.ENR_LEG || this.navstate.navmode === NavMode.ENR_OBS)) {
            return false;
        }

        return this.navstate.distToActive! <= 3;
    }
```

  In `test/unit/data/PersistentMessages.test.ts`, the stub `activeWaypoint` gets the helper so its existing tests keep
  their meaning:

```ts
        activeWaypoint: {
            getActiveLeg: () => w.activeLeg,
            getActiveFafLeg: () => w.activeLeg?.fixType === KLNFixType.FAF ? w.activeLeg : null,
        },
```

  Remove the `KLNFixType` import from `PersistentMessages.ts` if it becomes unused.

- [ ] **Step 9: run** → pass; full suite green. Mutation: use `getActiveLeg()` with the FAF test again → the #369 test
  goes red; restore. Commit `fixes #369 show ARM GPS APPROACH at a fix that is IAF and FAF`.

```json:metadata
{"files": ["kln90b/data/flightplan/ActiveWaypoint.ts", "kln90b/services/ModeController.ts", "kln90b/data/VolatileMemory.ts", "kln90b/data/PersistentMessages.ts", "test/render/services/ModeController.test.ts", "test/render/HEvents.test.ts", "test/render/services/ModeControllerApproach.test.ts", "test/unit/data/PersistentMessages.test.ts", "docs/architecture.md", "docs/testing.md", "test/harness/fixtures.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#129 APR at 1.55 NM with IAF copy active; on to MAP at 0.3", "#139 stays ENR after press; second press ramps 5 to 1; reload re-arms; ARM GPS APPROACH at 2.9 NM", "#369 ARM GPS APPROACH at 2.5 NM with IAF copy active", "three fixes commits"], "modelTier": "standard"}
```

---

### Task 5: The ACTV re-activation and scale (#162, #163)

**Goal:** A characterization for the re-activation after the GPS APR press (#162, no code change) and the ACTV scale
ramp from the activation (#163).

**Files:**
- Modify: `kln90b/services/ModeController.ts` (`checkSwitchAprArmToActive`, `adjustXtkScaleActive`, two private fields)
- Test: `test/render/services/ModeControllerApproach.test.ts` (move `armedBeforeFaf` and `flyTo` to file scope; new
  characterization describe; the existing characterization `ramps linearly with the distance to the FAF, 0.65 at 1 NM`;
  the comment of `goes to ARM at +-1 at the GPS APR press 1.5 NM before the FAF (6-1)`)

**Acceptance Criteria:**
- [ ] #162: one calculation tick after the press 1.5 NM before the FAF the unit is APR again with FAFAA active.
- [ ] #163: after activation at 1.95 NM the scale at 1 NM is 0.659; a late LEG switch at 1 NM gives 1.0 at activation
  and 0.65 at 0.5 NM; moving back 3 NM from the FAF gives exactly 1; a D-> to the FAF 1.5 NM before it gives ARM, then
  APR one tick later.
- [ ] The spec test `ramps the scale from 1 at 2 NM to 0.3 at the FAF, and keeps 0.3 to the MAP (6-3)` stays green
  unchanged.
- [ ] Two `fixes` commits; full suite green.

**Verify:** `npx vitest run test/render/services/ModeControllerApproach.test.ts` → pass; `npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#162).** Move `armedBeforeFaf` and `flyTo` from the describe `approach active and the CDI scale ramp to
  0.3 NM (6-3, 6-11)` to file scope (no behavior change). Rewrite the comment of `goes to ARM at +-1 at the GPS APR
  press 1.5 NM before the FAF (6-1)`: the press itself is 6-1; what follows is held by the characterization below
  (#162). Add a describe at the end of the file:

```ts
describe('ACTV before the FAF after a cancel (characterization)', () => {
    // The maintainer's ruling on #162: the conditions of the switch still hold before the FAF, so the unit is back in ACTV
    // at the next calculation tick
    it('is back in ACTV one calculation tick after the GPS APR press 1.5 NM before the FAF (characterization, #162)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.5);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        unit.send('KLN90B_ApprArm_Push');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);

        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(activeIdent(unit)).toBe('FAFAA');
    });
});
```

  Run → passes (no code change). Mutation: in `checkSwitchAprArmToActive` return early always → the test goes red;
  restore. Commit `fixes #162 hold the return to ACTV after the GPS APR press before the FAF`.

- [ ] **Step 2 (#163): tests first.** Change the existing characterization in `approach active ramp (characterization)`
  to:

```ts
    // The ramp runs from the scale at the activation (1) to 0.3 at the FAF over the distance left at the activation:
    // activated at 1.95 NM, the scale at 1 NM is 0.3 + 0.7 * 1 / 1.95 = 0.659 (characterization, #163)
    it('ramps linearly from the activation, 0.659 at 1 NM after activating at 1.95 NM (characterization, #163)', async () => {
        const {w, unit} = await approachLoaded(7.5);
        expect(await scaleAfter(unit, 31)).toBe(1);
        for (const nm of [5 + 1.95, 5 + 1]) {
            await moveAircraft(unit, w.north(nm), {groundspeedKt: 120, trackTrue: 180});
            await vi.advanceTimersByTimeAsync(1000);
        }

        expect(nav(unit).xtkScale).toBeCloseTo(0.659, 3);
    });
```

  and add to that describe:

```ts
    // A late switch to LEG at 1 NM: the unit goes ACTV at 1 NM and ramps from 1 to 0.3 over that 1 NM, so 0.5 NM before
    // the FAF the scale is 0.3 + 0.7 * 0.5 / 1 = 0.65 (characterization, #163)
    it('ramps from 1 over the last 1 NM after a late switch to LEG (characterization, #163)', async () => {
        const {w, unit} = await approachLoaded(7.5);
        expect(await scaleAfter(unit, 31)).toBe(1);
        await moveAircraft(unit, w.north(5 + 2.5), {groundspeedKt: 120, trackTrue: 180});
        unit.env.sim.set('Nav OBS:1', 'degrees', 180); // The final course, so the FAF stays on the TO side
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav(unit).navmode).toBe(NavMode.ARM_OBS);
        await moveAircraft(unit, w.north(5 + 1), {groundspeedKt: 120, trackTrue: 180});
        await unit.panel.selectPage('L', 'MOD 1');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(nav(unit).xtkScale).toBeCloseTo(1, 6); // 0.3 + 0.7 in floating point

        await moveAircraft(unit, w.north(5 + 0.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).xtkScale).toBeCloseTo(0.65, 3);
    });

    // Moving back away from the FAF in ACTV the scale stays at 1, not above it (characterization, #163)
    it('stays at 1 when the aircraft moves back 3 NM from the FAF in ACTV (characterization, #163)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.95);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        await moveAircraft(unit, w.north(5 + 3), {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(nav(unit).xtkScale).toBe(1);
    });

    // Case 2 of #163: a Direct To the FAF inside 2 NM in ACTV goes to ARM, and the next calculation tick activates again
    // (characterization, #163)
    it('goes ARM at a Direct To the FAF 1.5 NM before it and ACTV one tick later (characterization, #163)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.5);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        await unit.panel.directTo('FAFAA');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
    });
```

  If `unit.panel.directTo` advances the clock past a calculation tick, assert ARM right after the ENT instead (read how
  the existing `goes back to ARM at +-1 on a direct-to to the MAP (3-29)` test does it) and report. Run: the 0.659 test
  and the late-switch test fail, the move-back test fails (1.35); the D-> test passes today (it holds case 2 as is).

- [ ] **Step 3: implement.** In `ModeController`, two fields at the top of the class:

```ts
    //6-3, 6-11: the distance to the FAF and the scale when the unit went ACTV; the ramp to 0.3 runs from there (#163)
    private aprActivationDist = 2;
    private aprActivationScale = 1;
```

  In `checkSwitchAprArmToActive`, keep the distance in a variable and record it before switching:

```ts
        const fafDist = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(faf.wpt), UnitType.NMILE);
        if (fafDist > 2) {
            return; //Within 2 NM
        }
        ...
        console.log("Moving to Apr mode");
        //If all this has passed, we switch to approach active
        this.aprActivationDist = fafDist;
        this.aprActivationScale = Math.min(this.navState.xtkScale, 1);
        this.navState.navmode = NavMode.APR_LEG;
```

  and the end of `adjustXtkScaleActive`:

```ts
        const dist = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(faf.wpt), UnitType.NMILE);
        //From the scale at the activation to 0.3 at the FAF over the distance left at the activation, so a late switch
        //compresses the change (6-11); never above 1 when moving back out (#163)
        const ratio = this.aprActivationDist > 0 ? dist / this.aprActivationDist : 0;
        this.navState.xtkScale = Math.min(0.3 + (this.aprActivationScale - 0.3) * ratio, 1);
```

- [ ] **Step 4: run** → pass; the 6-3 spec test unchanged and green; full suite green. Mutation: record
  `aprActivationDist = 2` always → the 0.659 and late-switch tests go red; drop the `Math.min(…, 1)` → the move-back
  test goes red; restore. Docs (`grep -n '#163'`); commit `fixes #163 ramp the approach scale from the activation to the FAF`.

```json:metadata
{"files": ["kln90b/services/ModeController.ts", "test/render/services/ModeControllerApproach.test.ts", "docs/testing.md"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#162 APR again one tick after the press", "#163 0.659 at 1 NM; late switch 1 then 0.65; move back exactly 1; D-> ARM then APR", "6-3 spec ramp test unchanged and green", "two fixes commits"], "modelTier": "standard"}
```

---

### Task 6: True north outside the area (#190)

**Goal:** In OBS mode with the active waypoint outside N 74 / S 60 the variation is invalid: the message shows and the
course is referenced to true north, also for an active VOR.

**Files:**
- Modify: `kln90b/data/navdata/KLNMagvar.ts` (`isMagvarValid`, new private static `isInCoverage`)
- Modify: `kln90b/services/ModeController.ts` (`getMagvarForObs` only)
- Test: `test/render/data/navdata/KLNMagvar.test.ts` (pins :120, :130; new VOR test)

**Acceptance Criteria:**
- [ ] Both #190 pins pass: MAGNETIC VAR INVALID in OBS to KFAR (N 75), and the OBS course 000 (true north).
- [ ] A VOR at N 75 with a published variation of 10 E, active in OBS, gives the course 000 as well.
- [ ] `npm run build` prints the same count of circular dependencies as before (no new cycle).
- [ ] One `fixes #190` commit; full suite green.

**Verify:** `npx vitest run test/render/data/navdata/KLNMagvar.test.ts` → pass; `npx tsc --noEmit && npm test` → green;
`npm run build` → the circular-dependency count unchanged (compare with a build before the change).

**Steps:**

- [ ] **Step 1: pins to tests and the VOR test.** Both `it.fails(... (5-44, #190)'` → `it(`; rewrite their comments.
  Add to the describe:

```ts
    // 5-44: in OBS mode with the active waypoint outside the area the unit references to true north; this holds for an
    // active VOR too, although 5-35 has an active VOR use its own variation inside the area (the maintainer's reading of
    // the two pages for #190). VFAR at N 75 has a published variation of 10 E (the sim stores east as negative)
    it('references an active VOR outside the area to true north too (5-44, #190)', async () => {
        const vfar = vor('VFAR', 75.0, 8.0, {magneticVariation: -10});
        const unit = await bootUnit({
            facilities: [kaaa, vfar], position: {lat: 73.5, lon: 8.0}, magvar: 10, panelXml: OBS_SOURCE_OFF,
            storage: savedFlightplan(0, [kaaa, vfar]),
        });
        await settle(unit);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(activeIdent(unit)).toBe('VFAR');
        expect(unit.props.memory.navPage.obsMag).toBeCloseTo(0, 1);
    });
```

  (import `vor` from the builders if missing). Run: all three fail. Also run `npm run build` once now and note the
  circular-dependency count.

- [ ] **Step 2: implement** in `KLNMagvar.ts` (import `NavMode` next to `NavPageState`):

```ts
    /**
     * 5-44: the variation is valid inside N 74 / S 60, and in OBS mode only while the active waypoint lies inside too
     * (#190). The modes are compared directly; importing isObsMode would close an import cycle
     */
    public isMagvarValid() {
        if (!KLNMagvar.isInCoverage(this.lat)) {
            return false;
        }
        if (this.navState.navmode === NavMode.ENR_OBS || this.navState.navmode === NavMode.ARM_OBS) {
            const active = this.navState.activeWaypoint.getActiveWpt();
            return active === null || KLNMagvar.isInCoverage(active.lat);
        }
        return true;
    }

    private static isInCoverage(lat: number): boolean {
        return lat <= 74 && lat >= -60;
    }
```

  `tick()` stays as it is (it uses `isMagvarValid()`, so a variation entered on SET 2 in that state is kept, 5-44). In
  `ModeController.getMagvarForObs`:

```ts
    public getMagvarForObs(wpt: Facility | null) {
        if (!this.magvar.isMagvarValid()) {
            return this.magvar.getCurrentMagvar(); //5-44: true north (or the variation entered on SET 2), also for a VOR (#190)
        }
        if (wpt !== null && FacilityUtils.isFacilityType(wpt, FacilityType.VOR)) {
            return -(wpt as VorFacility).magneticVariation; //Seems to be opposite to the magvar service
        }
        return this.magvar.getCurrentMagvar();
    }
```

- [ ] **Step 3: run** → pass; full suite green; `npm run build` → the same circular-dependency count. If the count
  rises, the `NavMode` import is not erased in the build: compare against the numeric values with a comment instead and
  report. Mutation: drop the OBS branch of `isMagvarValid` → the three tests go red; move the validity check below the
  VOR branch → only the VOR test goes red; restore. Docs (`grep -n '#190'`); commit
  `fixes #190 reference to true north in OBS mode with the active waypoint outside the area`.

```json:metadata
{"files": ["kln90b/data/navdata/KLNMagvar.ts", "kln90b/services/ModeController.ts", "test/render/data/navdata/KLNMagvar.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["both #190 pins pass", "VOR at N 75 gives course 000", "no new circular dependency in npm run build", "one fixes #190 commit"], "modelTier": "standard"}
```

---

### Task 7: VNAV, the ANGLE cursor and OBS (#194, #338)

**Goal:** An active VNAV keeps its path while the cursor stays on ANGLE (#194); the cancel of a VNAV to a waypoint ahead
on LEG to OBS is held by a test (#338, no code change).

**Files:**
- Modify: `kln90b/services/Vnav.ts` (`armVnav` ~79-87)
- Test: `test/unit/services/Vnav.test.ts` (:272-290), `test/render/pages/left/Nav4Vnav.test.ts` (new tests)

**Acceptance Criteria:**
- [ ] #194: `armVnav` on an active VNAV with the aircraft 437 ft below the path leaves it Active with the angle -1.8; on
  NAV 4 with the cursor on ANGLE the top row stays `VNV 7400ft ` instead of a countdown.
- [ ] #338: VNAV armed to a waypoint after the active one goes Inactive on LEG to OBS, NAV 4 shows the active waypoint,
  no message is added, and LEG does not bring the waypoint back; VNAV to the active waypoint survives OBS.
- [ ] Two `fixes` commits; full suite green.

**Verify:** `npx vitest run test/unit/services/Vnav.test.ts test/render/pages/left/Nav4Vnav.test.ts` → pass;
`npx tsc --noEmit && npm test` → green.

**Steps:**

- [ ] **Step 1 (#194): tests first.** Replace the unit characterization `re-arms an active descent from the present
  altitude when armVnav runs again (characterization)` with:

```ts
    // The maintainer's ruling on #194: Nav4Page calls armVnav on every display tick while the cursor is over ANGLE, and an
    // active VNAV keeps its path. 29 NM before the target the path is at 7437.5 ft; the aircraft at 7000 ft is 437 ft
    // below it, where a new arming would wait 2.29 NM for the path (characterization, #194)
    it('keeps an active descent when armVnav runs again below the path (characterization, #194)', () => {
        let ind = 7500;
        const {vnav, nav} = dct({distToActive: 31, ind: 7500, offset: 2, angle: -1.8});
        // Reaches the private sensors of Vnav: vnavFor builds the sensors from a fixed altitude and the test changes it
        // between the two calls, with no public seam to hand Vnav a new altitude; a rename there breaks this test
        (vnav as any).sensors.in.airdata.getIndicatedAlt = () => ind;
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);
        ind = 7000;
        nav.distToActive = 31;

        vnav.armVnav();

        expect(vnav.state).toBe(VnavState.Active);
        expect(nav.nav4VnavAngle).toBe(-1.8);
    });
```

  In `Nav4Vnav.test.ts` add a describe:

```ts
describe('NAV 4 VNAV under the ANGLE cursor (characterization)', () => {
    // The maintainer's ruling on #194: with VNAV active, the cursor staying on ANGLE keeps the path. 31 NM west the path
    // is at 7437 ft (shown 7400); at 7000 ft, 437 ft below it, a new arming would count down instead
    it('keeps the advisory altitude with the aircraft below the path and the cursor on ANGLE (characterization, #194)', async () => {
        const unit = await bootAt(31, {angle: -1.8});
        unit.props.vnav.armVnav();
        expect((await unit.panel.show('L', 'NAV 4'))[0]).toBe('VNV 7400ft ');
        unit.env.sim.set('PRESSURE ALTITUDE', 'feet', 7000);

        await cursorToAngle(unit);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('L')[0]).toBe('VNV 7400ft ');
    });
});
```

  (If the SimVar the harness uses for the indicated altitude is not `PRESSURE ALTITUDE` in feet, use the one
  `bootUnit`'s `altitudeFt` sets; report it.) Run: both fail.

- [ ] **Step 2: implement** in `Vnav.armVnav`:

```ts
    public armVnav(): void {
        const angle = this.getAngle();
        //5-8: the cursor over ANGLE starts VNAV; an active VNAV keeps its path while the cursor stays there (#194)
        if (this.state === VnavState.Inactive && angle !== 0) {
```

- [ ] **Step 3: run** → pass; full suite green. Mutation: back to `!== VnavState.Armed` → both tests go red; restore.
  Docs (`grep -n '#194'`); commit `fixes #194 keep an active VNAV while the cursor stays on ANGLE`.

- [ ] **Step 4 (#338): tests.** In `Nav4Vnav.test.ts` add (import `intersection` from the builders, `NO_OBS` and
  `panelXml` from `../../../harness/panelXml`, `NavMode` and `VnavState` as needed):

```ts
// Checked in the KLN 89 trainer, 2026-10-14: VNAV to a waypoint after the active one is cancelled in OBS mode, the
// active waypoint is shown as the VNAV waypoint, no message comes, and LEG does not bring the programming back; VNAV to
// the active waypoint stays. MIDAA lies 50 NM west of KDDD on the leg, so it is the active waypoint 64.8 NM west
describe('VNAV and the switch to OBS (checked in the KLN 89 trainer, 2026-10-14, #338)', () => {
    const MIDAA = intersection('MIDAA', west(50).lat, west(50).lon);

    async function armedTo(target: 'KDDD' | 'MIDAA') {
        const unit = await bootUnit({
            facilities: [KAAA, MIDAA, KDDD], position: west(64.8), altitudeFt: 7500, panelXml: panelXml(NO_OBS),
            storage: savedFlightplan(0, [KAAA, MIDAA, KDDD]),
        });
        await settle(unit);
        await moveAircraft(unit, west(64.8), {groundspeedKt: 145, trackTrue: 90});
        const nav = unit.props.memory.navPage;
        nav.nav4SelectedAltitude = 1900;
        nav.nav4VnavDist = 2;
        nav.nav4VnavAngle = -1.8;
        nav.nav4VnavWpt = target === 'KDDD' ? KDDD : MIDAA;
        unit.props.vnav.armVnav();
        expect(unit.props.vnav.state).not.toBe(VnavState.Inactive); // Precondition: programmed
        return unit;
    }

    it('cancels VNAV to a waypoint after the active one, shows the active waypoint and adds no message', async () => {
        const unit = await armedTo('KDDD');
        const before = messages(unit);

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.vnav.state).toBe(VnavState.Inactive);
        const rows = await unit.panel.show('L', 'NAV 4');
        expect(rows[0]).toBe('VNV INACTV ');
        expect(rows[4]).toMatch(/^MIDAA/);
        expect(messages(unit)).toEqual(before);
    });

    it('does not bring the VNAV waypoint back on the switch to LEG', async () => {
        const unit = await armedTo('KDDD');
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        await unit.panel.selectPage('L', 'MOD 1');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(unit.props.vnav.state).toBe(VnavState.Inactive);
        expect((await unit.panel.show('L', 'NAV 4'))[4]).toMatch(/^MIDAA/);
    });

    it('keeps VNAV to the active waypoint through the switch to OBS', async () => {
        const unit = await armedTo('MIDAA');

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.vnav.state).not.toBe(VnavState.Inactive);
        expect(unit.props.memory.navPage.nav4VnavWpt!.icaoStruct.ident).toBe('MIDAA');
    });
});
```

  Check the row index of the waypoint line on NAV 4 against the first test of the file (`KDDD :-02nm` is row 4) and the
  `messages` comparison against how the file reads messages; adapt and report. Run: all three pass today (no code
  change; #185 implemented the cancel). Mutation: in `Vnav.isValidVnavWpt` drop `|| isObsMode(...)` → the first two go
  red, the third stays green; restore.

- [ ] **Step 5: docs and commit.** Update the issue references (`grep -n '#338\|#185' docs/`), commit
  `fixes #338 hold the VNAV cancel when switching to OBS with a VNAV waypoint ahead`.

```json:metadata
{"files": ["kln90b/services/Vnav.ts", "test/unit/services/Vnav.test.ts", "test/render/pages/left/Nav4Vnav.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#194 active VNAV stays Active below the path; NAV 4 keeps VNV 7400ft", "#338 cancel on OBS, active wpt shown, no message, not restored by LEG; active-wpt VNAV kept", "two fixes commits"], "modelTier": "standard"}
```

---

## Close-out (controller)

- [ ] Whole-branch review of `m2-mode-controller` against the spec (session level).
- [ ] Side checks of the spec, section 8: `Mod2Page.innerRight` returns `false` (find whether it has an effect, e.g. on
  the page tree, the way #238 had on Super NAV 5; file an issue if it does); the 89's arrow-only NAV 1 after a Direct To
  in OBS (file only with a 90B source).
- [ ] Update the project memory: the trainer observations of 2026-10-14 and the session lessons.
- [ ] After the maintainer approves: merge `m2-mode-controller` into `master` locally, delete it and every worktree and
  `worktree-agent-*` branch of the session (`git branch -d`; remove each node_modules junction first). No push; no
  issue is closed manually.
