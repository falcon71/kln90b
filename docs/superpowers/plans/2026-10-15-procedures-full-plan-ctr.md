# Procedures, Full-Plan Loading and CTR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone-5 issues #221, #148, #222, #274, #380, #376, #219, #220, #131, #347, #301, #348, #349 and
#377 of the KLN 90B simulator, one commit per issue.

**Architecture:** Three lanes.
- **Lane A** gives FPL 0 two limits (30 en-route waypoints, 45 in total with procedures), deletes from the front by one
  rule, rewrites the APT 7 / APT 8 loads to decide the room before changing anything and to ask before deleting, adds
  the replace questions of APT 8 and APT 7, and asks before an FPL 0 insert deletes waypoint 1.
- **Lane B** fixes the procedure conversion in `SidStar.ts`: no writes into the SDK legs, the OBS reminder of a
  following hold, the derived MAHP, two arcs of different radius.
- **Lane C** publishes the procedure removal to the flight planner mirror, resets stale CTR computations, and keeps CTR 1
  and REF out of the approach.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`, FSComponent JSX), Vitest
(stages unit, render and flight; render runs on happy-dom with the headless unit of `test/harness`).

**Spec:** `docs/superpowers/specs/2026-10-15-procedures-full-plan-ctr-design.md`. Read it before any task: it holds the
evidence, the trainer results, the rulings and the reasons. The other inputs are in
`C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\44045505-19ff-4981-aacb-4b8c335f1ece\scratchpad\`:
- `inventory\report.md`: every candidate fix measured against the full suite (Parts 2 and 4), and the code answers
  (Part 3).
- `inventory\*.patch`: the measured patches (`room-first`, `t1-count`, `t2-loads`, `219`, `131`, `220a`,
  `347-onlyIfChanged`, `301`, `348-atEnt`, `349`, ...), a starting point and not a finished fix.
- `inventory\*-draft.test.ts.txt`, `inventory\tools\zzScratch.test.ts.txt`: draft reproductions.
- `trainer\report.md`: the trainer report (Parts 1 to 4).

## Global Constraints

- **Branches**
  - The integration branch is `m5-procedures`. It already holds the trainer record (de2cc9a) and the spec (a66b578).
  - Each task works in its own worktree. Its first command is `git merge --ff-only m5-procedures`, because agent
    worktrees start at master's HEAD.
  - The controller integrates a finished task by cherry-pick, so the history stays linear.
  - Never push. Never commit on `master`.
- **Commits**
  - One commit per issue, with its tests and doc changes in the same commit, in the order of this plan.
  - The subject is `fixes #NN <description>`: a plain sentence, American English, lowercase after the number. #221 and
    #220 are questions that need a fix, so they also say `fixes #NN`.
  - End the message with the Co-Authored-By line your own attribution instructions give you.
  - Write commit messages without a BOM (Bash heredoc or `-m`).
  - A commit that also changes a pin, a test or a comment of another issue says `references #NN` for it in the body.
- **Before every commit**
  - `npx tsc --noEmit` is clean.
  - The WHOLE suite `npm test` is green (about one minute), not only the task's files.
  - Every test whose result changes must be one the task names. Any other change is a finding to report before
    committing: it may be a test that used the bug or the old model as its vehicle.
  - Grep the suite for tests that depend on the bug you fix (`grep -rn '#NN' test/` and the names the task gives).
- **Pins**
  - A fixed bug's `it.fails(...)` becomes `it(...)`, and the issue number stays in the title.
  - Rewrite its comment so it describes the fixed behavior and its evidence, not the old bug.
- **Test labels** (`test/README.md` section 5)
  - A test's title cites what supports its assertion: a Pilot's Guide page (`4-4`), a figure, a dated trainer check
    (`checked in the KLN 89 trainer, 2026-10-15`), or it says `characterization`.
  - A citation supports only what that page or trainer entry literally shows. The KLN 89 check of 2026-10-15 (the
    "night" block of `docs/kln89-trainer-record.md`) shows: the 89's two limits (20 en-route, 35 in total) with
    approaches and STARs on top of the en-route limit; a STAR insert that counts only toward the total; the delete
    question on the first inner-knob click, one per waypoint, ENT deletes waypoint 1, CLR cancels; the replace question
    for an approach and a STAR (also for the same procedure, and the only question for an approach to an airport not in
    FPL 0), CLR back to the preview, ENT replaces; the MAHP last and once; the MAP at the navaid repeated as the MAHP.
    The 89 has one knob pair and its own page texts. The 90B's numbers (30, 45), the 90B's texts, anything on the 90B's
    second side, SIDs (the 89 database has none) and every AVsoftech observation are characterizations.
  - The maintainer's rulings (spec section 1) are characterizations. The AVsoftech trainer is cited by no test; a
    comment may say a characterization follows it.
  - A characterization carries no page number. A `describe` titled with a page holds spec tests only. Never put a test
    into a `describe` whose title cites a different source.
  - Report, per new or changed `describe`/`it`, its title and whether it is spec, trainer or characterization.
- **Copyright:** the manuals are copyrighted. Cite page numbers and paraphrase; never copy manual text (no run of more
  than a few words) into code, comments, docs, tests or commit messages. The AVsoftech screen texts used for the 90B
  pages come from a third-party trainer, not from a manual.
- **Code style**
  - Match the surrounding code: 4-space indent, double quotes in `kln90b/`, single quotes in `test/`.
  - Comments cite pages like `//4-4` and issues like `//#221`.
  - `target: es2017`.
- **State:** service classes keep no mutable state ([docs/architecture.md](../../architecture.md)); runtime state goes
  into `VolatileMemory`. Controls and pages may hold UI state; they are rebuilt with their page.
- **Distinct pages per context** (maintainer, 2026-10-15): the room question of a procedure load and the room question
  of an FPL 0 insert are two page classes. They may share an abstract base class.
- **No counts in prose** for things that grow (tests, files, issues, pages).
- **Do not fix other bugs on the side.** Report a new bug to the controller, who files it.
- **Asserted literals are derived independently:** from the spec, the trainer record, a figure, or a hand computation.
  Never copy them from the output of the code under test. If a literal below turns out wrong, report it with your
  derivation; do not silently change it. If a helper named below does not fit, adapt the setup and report it; the
  assertions stay.
- **Mutation check**
  1. After the fix is green, break the fix once (the mutation the task names, or revert its key line).
  2. Confirm the new tests and the converted pins turn red.
  3. Restore, and confirm `git diff` shows only the intended change.
  4. Report which tests went red. A mutation that leaves everything green is a finding. Report it; do not hide it.
- **Docs**
  - Each commit updates the lines of `docs/architecture.md`, `CLAUDE.md` (only its architecture summary),
    `test/README.md`, `docs/test-next-steps.md` and the `test/harness/` comments that describe its bug or the changed
    behavior. Find them with `grep -rn '#NN' docs/ test/` and the names the task gives.
  - Dated records are never edited: the `docs/kln89-trainer-record.md` blocks, `docs/test-coverage-record.md`, the specs
    and the plans.
- **Worktrees**
  - Create a `node_modules` junction to the main checkout's (PowerShell:
    `New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules`).
  - Never delete through it. The controller removes the junction (`cmd //c rmdir node_modules`) before removing the
    worktree.
- **Scratch files** go in your own folder
  `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\44045505-19ff-4981-aacb-4b8c335f1ece\scratchpad\task<N>\`.
- **Reports:** write your report with the Bash tool (`cat > '.task-report.md' <<'EOF'`) at the root of your worktree,
  untracked and never committed. If that is refused, return it in full as text.

**User decisions (already made):**
- The spec as committed (a66b578), approved by the maintainer on 2026-10-15.
- **#221:** FPL 0 holds at most 30 en-route waypoints and at most 45 legs in total; SID, STAR and approach legs come on
  top of the en-route limit. Numbered plans hold 30.
- **Making room:** an addition that would pass a limit asks first, one question per waypoint to delete; a procedure load
  deletes nothing until the last question is answered with ENT; CLR cancels with FPL 0 unchanged.
- **#380:** the FPL 0 insert asks with a page class of its own, not the procedure-load page (an abstract base for both is
  fine).
- **#274:** APT 8 asks before replacing an approach (any approach, also the same one), APT 7 before replacing a SID or a
  STAR; `APPROVE?` flashes.
- **#220:** the MAHP is derived only when the missed approach ends in a hold (HA, HF, HM).
- **#131:** two arcs of different radius stay two arcs; the first arc's end fix stays a list waypoint; the second arc
  starts at a generated entry at its published beginning.
- **#301/#348:** the CTR pages go back to their start state when the left page is left or the plan changes.

---

## Tasks, order and file ownership

| Task | Commit | Main files | Starts after |
|---|---|---|---|
| 1 | #221 | `Flightplan.ts`, `FlightplanUtils.ts`, `Ctr1Page.tsx` (two count lines), `Flightplan.test.ts`, `FlightplanUtils.test.ts`, `Apt8Page.test.ts`, `Apt7Page.test.ts`, `Ctr1Page.test.ts` | — |
| 2 | #148 | `FlightplanUtils.ts`, `FlightplanUtils.test.ts`, `FlightplanEdit.test.ts`, `Apt7Page.test.ts` | Task 1 |
| 3 | #222 | `Apt8Page.tsx`, `Apt7Page.tsx`, new `pages/left/MakeRoomPage.tsx`, new `pages/left/ProcedureMakeRoomPage.tsx`, `Apt8Page.test.ts`, `Apt7Page.test.ts` | Task 2 |
| 4 | #274 | `Apt8Page.tsx`, `Apt7Page.tsx`, `Apt8Page.test.ts`, `Apt7Page.test.ts` | Task 3 |
| 5 | #380 | new `pages/left/FplInsertMakeRoomPage.tsx`, `FlightplanList.tsx`, `FlightplanListItem.tsx`, `FlightplanEdit.test.ts` | Task 4 |
| 6 | #376 | `SidStar.ts`, `SidStar.test.ts`, `test/harness/navdata/procedures.ts` (comment) | — |
| 7 | #219 | `SidStar.ts`, `SidStar.test.ts` | Task 6 |
| 8 | #220 | `SidStar.ts`, `SidStar.test.ts` | Task 7 |
| 9 | #131 | `SidStar.ts`, `SidStar.test.ts` | Task 8 |
| 10 | #347 | `Flightplan.ts`, `WTFlightplanSync.test.ts` | lane A integrated |
| 11 | #301 | `Ctr1Page.tsx`, `Ctr2Page.tsx`, `VolatileMemory.ts`, new `pages/right/CtrState.ts`, `Ctr2Page.test.ts`, `VolatileMemory.test.ts` | Task 10 |
| 12 | #348 | `Ctr1Page.tsx`, `CtrState.ts`, `VolatileMemory.ts`, `Ctr1Page.test.ts`, `VolatileMemory.test.ts` | Task 11 |
| 13 | #349 | `FlightplanUtils.ts`, `Ctr1Page.tsx`, `Ctr1Page.test.ts` | Task 12 |
| 14 | #377 | `RefPage.tsx`, `RefPage.test.ts` | Task 13 |

- **Lane A** is Tasks 1 to 5, **lane B** is Tasks 6 to 9, **lane C** is Tasks 10 to 14. Within a lane the tasks run one
  after the other. Lanes A and B run in parallel; lane C starts once lane A is integrated (it needs Task 1's count in
  `Ctr1Page.tsx`, and `Flightplan.ts` / `FlightplanUtils.ts` belong to lane A until then).
- **Batching:** the controller may give Tasks 6 and 7, and Tasks 13 and 14, to one implementer each, with one commit
  per task.

---

### Task 1: #221 FPL 0 counts its en-route waypoints against 30 and all its legs against 45

**Goal:** In FPL 0 only en-route legs (type USER) count against 30; SID, STAR and approach legs come on top, up to 45
legs in total. Numbered plans keep 30. `insertLegIntoFpl` and CTR 1 use the same limits. The procedure loads of APT 7 /
APT 8 then load whole onto a plan with room for the procedure legs.

**Files:**
- Modify: `kln90b/data/flightplan/Flightplan.ts` (`MAX_LEGS` comment, new `MAX_FPL0_LEGS`, `countEnRouteLegs`,
  `legsFit`, `Flightplan.fits`, the check in `insertLeg`)
- Modify: `kln90b/services/FlightplanUtils.ts` (`insertLegIntoFpl`: the full test)
- Modify: `kln90b/pages/right/Ctr1Page.tsx:212` and `:246` (the two `> 30` checks)
- Test: `test/unit/data/flightplan/Flightplan.test.ts`, `test/unit/services/FlightplanUtils.test.ts`,
  `test/render/pages/right/Apt8Page.test.ts` (`:198`, `:243`, `:255`), `test/render/pages/right/Apt7Page.test.ts`
  (`:219`, `:230`, `:274`), `test/render/pages/right/Ctr1Page.test.ts`
- Docs: `docs/architecture.md:369-370`, `CLAUDE.md:90`, `test/harness/flightplan.ts:8`

**Acceptance Criteria:**
- [ ] `new Flightplan(0, 30 USER legs).insertLeg(i, APP leg)` succeeds (31 legs); a USER leg throws; a 46th leg of any
      type throws; a numbered plan still throws on its 31st leg with `Cannot have more than 30 legs!`.
- [ ] `insertLegIntoFpl` puts a STAR leg into an FPL 0 of 30 en-route and 2 STAR legs without deleting the first leg.
- [ ] The #221 characterization `Apt8Page.test.ts:198` becomes a spec test: the whole approach loads, no FPL FULL.
- [ ] A new render test loads an approach onto 30 en-route waypoints (FPL 0 of 35 legs, nothing deleted).
- [ ] The two #222 pins for an approach and a STAR become `it` tests of the order (`slice(-6)`), the setups assert 32
      legs with FILA first; the SID setup asserts 32 legs with KPRC once; the SID pin `:283` stays `it.fails`.
- [ ] A CTR 1 test inserts a Center waypoint into an FPL 0 whose en-route waypoints plus the new one fit while its total
      legs pass 30.

**Verify:** `npx vitest run test/unit/data/flightplan test/unit/services/FlightplanUtils.test.ts test/render/pages/right/Apt8Page.test.ts test/render/pages/right/Apt7Page.test.ts test/render/pages/right/Ctr1Page.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Unit tests of the limits.** In `test/unit/data/flightplan/Flightplan.test.ts` add (adapt imports to the
  file; `intersection` from `test/harness/navdata/builders`):

```ts
describe('the limits of a flight plan (#221)', () => {
    const fixes = (n: number, prefix = 'FX') => Array.from({length: n}, (_, i) => intersection(`${prefix}${String(i).padStart(2, '0')}`, 47, 8 + 0.01 * i));
    const legs = (n: number, type: KLNLegType, prefix?: string): KLNFlightplanLeg[] => fixes(n, prefix).map(wpt => ({wpt, type}));

    // Checked in the KLN 89 trainer, 2026-10-15: an approach and a STAR load on top of a plan whose en-route
    // waypoints are at the limit
    it('takes a procedure leg on top of 30 en-route waypoints in FPL 0 (checked in the KLN 89 trainer, 2026-10-15)', () => {
        const fpl0 = new Flightplan(0, legs(30, KLNLegType.USER), new EventBus());

        fpl0.insertLeg(30, legs(1, KLNLegType.APP, 'AP')[0]);

        expect(fpl0.getLegs()).toHaveLength(31);
    });

    // 4-1: a flight plan holds 30 waypoints
    it('refuses a 31st en-route waypoint in FPL 0 that also holds procedure legs (4-1)', () => {
        const fpl0 = new Flightplan(0, [...legs(30, KLNLegType.USER), ...legs(3, KLNLegType.APP, 'AP')], new EventBus());

        expect(() => fpl0.insertLeg(0, legs(1, KLNLegType.USER, 'NW')[0])).toThrow();
        expect(fpl0.getLegs()).toHaveLength(33);
    });

    // The 90B gives no total; 45 keeps the KLN 89's room of 15 for procedures above its en-route limit (maintainer)
    it('refuses a 46th leg of FPL 0 of any type (characterization)', () => {
        const fpl0 = new Flightplan(0, [...legs(30, KLNLegType.USER), ...legs(15, KLNLegType.STAR, 'ST')], new EventBus());

        expect(() => fpl0.insertLeg(31, legs(1, KLNLegType.STAR, 'SX')[0])).toThrow();
        expect(fpl0.getLegs()).toHaveLength(45);
    });

    it('takes a 45th leg of FPL 0 (characterization)', () => {
        const fpl0 = new Flightplan(0, [...legs(30, KLNLegType.USER), ...legs(14, KLNLegType.STAR, 'ST')], new EventBus());

        fpl0.insertLeg(31, legs(1, KLNLegType.STAR, 'SX')[0]);

        expect(fpl0.getLegs()).toHaveLength(45);
    });
});
```

  In `test/unit/services/FlightplanUtils.test.ts`, describe of the full FPL 0 (the one holding `:161`), add:

```ts
    // Checked in the KLN 89 trainer, 2026-10-15: a waypoint inserted in front of a STAR row of a plan whose en-route
    // waypoints are at the limit is a STAR waypoint and goes in without deleting anything
    it('inserts a STAR leg into FPL 0 with 30 en-route waypoints and keeps the first leg (checked in the KLN 89 trainer, 2026-10-15)', () => {
        const star = (ident: string): KLNFlightplanLeg => ({wpt: intersection(ident, 46.9, 8.1), type: KLNLegType.STAR});
        const {fpl0, aw} = build([...fullPlanLegs(), star('STRAA'), star('STRAB')], START);

        insertLegIntoFpl(fpl0, navState(aw, null), 31, star('STRAC'));

        expect(fpl0.getLegs()).toHaveLength(33);
        expect(identsOf(fpl0.getLegs())[0]).toBe('FIX00');
        expect(identsOf(fpl0.getLegs()).slice(30)).toEqual(['STRAA', 'STRAC', 'STRAB']);
    });
```

  Run both files. Expected: the new tests that take a leg over 30 fail (`Cannot have more than 30 legs!`), the
  refusals pass already or fail; note which.

- [ ] **Step 2: Implement the limits in `Flightplan.ts`.**

```ts
/**
 * The most en-route waypoints a flight plan holds (4-1, 4-4). A numbered plan holds only en-route waypoints, so this
 * is its whole size.
 */
export const MAX_LEGS = 30;

/**
 * #221: the most legs FPL 0 holds with its SID, STAR and approach legs, which come on top of the en-route limit (the
 * KLN 89 does the same with 20 and 35, checked in its trainer on 2026-10-15). The 90B gives no total; 45 keeps the
 * 89's room of 15 for procedures (maintainer ruling)
 */
export const MAX_FPL0_LEGS = 45;

/** #221: the en-route legs, the ones the pilot enters (procedure legs are SID, STAR, APP) */
export function countEnRouteLegs(legs: KLNFlightplanLeg[]): number {
    return legs.filter(leg => leg.type === KLNLegType.USER).length;
}

/**
 * #221: whether a plan with these legs takes `enRoute` more en-route legs and `procedure` more procedure legs.
 * FPL 0 (`fplIdx` 0) has both limits, a numbered plan only its size.
 */
export function legsFit(fplIdx: number, legs: KLNFlightplanLeg[], enRoute: number, procedure: number): boolean {
    const total = legs.length + enRoute + procedure;
    if (fplIdx !== 0) {
        return total <= MAX_LEGS;
    }
    return countEnRouteLegs(legs) + enRoute <= MAX_LEGS && total <= MAX_FPL0_LEGS;
}
```

  In the class:

```ts
    /** #221: whether this plan takes `enRoute` more en-route and `procedure` more procedure legs */
    public fits(enRoute: number, procedure: number): boolean {
        return legsFit(this.idx, this.legs, enRoute, procedure);
    }

    public insertLeg(idx: number, leg: KLNFlightplanLeg) {
        const enRoute = leg.type === KLNLegType.USER ? 1 : 0;
        if (!this.fits(enRoute, 1 - enRoute)) {
            throw new Error(`Cannot have more than ${MAX_LEGS} legs!`);
        }
        ...
```

- [ ] **Step 3: `insertLegIntoFpl`.** Replace the first test:

```ts
    const enRoute = leg.type === KLNLegType.USER ? 1 : 0;
    if (fpl.idx !== 0 || fpl.fits(enRoute, 1 - enRoute)) { //#221
        fpl.insertLeg(idx, leg);
        return;
    }
```

  Leave the deletion branch as it is (Task 2 replaces it). Import `KLNLegType`.

- [ ] **Step 4: CTR 1.** In `Ctr1Page.calculateCenterWaypoints` and `insertIntoFpl`, replace
  `fplLegs.length + n > 30` by `!fpl.fits(n, 0)` (the Center waypoints are en-route waypoints; 5-26). Comment `//5-26,
  #221: only the en-route waypoints count against 30, every leg against 45`.

- [ ] **Step 5: The render tests.**
  - `Apt8Page.test.ts:194-221`: the describe `APT 8 loading an approach into a full FPL 0 (characterization)` becomes
    `describe('APT 8 loading an approach on top of the en-route waypoints', ...)`. Its test becomes
    `it('loads the whole approach in front of the airport while the first leg is active (6-5, 6-7; checked in the KLN 89 trainer, 2026-10-15, #221)'`
    with the expected legs `[...fillers USER, IAFAA, IFAAA, FAFAA, SDFAA, MAPAA (APP), KPRC (USER)]`, the status mode
    not `FPL FULL`, no new message. Rewrite the comments: procedure legs come on top of the en-route waypoints, so the
    approach loads whole (the 89 check); its order is 6-5, 6-7.
  - Add to that describe:

```ts
    // 4-1: 30 en-route waypoints; the approach comes on top of them (checked in the KLN 89 trainer, 2026-10-15)
    it('loads an approach onto 30 en-route waypoints without deleting one (4-1; checked in the KLN 89 trainer, 2026-10-15, #221)', async () => {
        const w = approachWorld();
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FI${String(i).padStart(3, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position: {lat: 46.5, lon: 6.9},
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [...fillers, w.kprc]),
        });
        await settle(unit);
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(30); // Precondition: 30 en-route

        await unit.panel.loadProcedure('APT 8');

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(35);
        expect(legs[0][0]).toBe('FI000');
        expect(legs.slice(-6).map(l => l[0])).toEqual(['IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
        expect(Screen.read().status().mode).not.toBe('FPL FULL');
    });
```

  - `Apt8Page.test.ts:223-262` (describe `APT 8 loading an approach when FPL 0 has to make room`): rename the describe
    `APT 8 loading an approach onto 27 en-route waypoints`, rewrite its header comment (the approach legs come on top;
    nothing is deleted). The setup test becomes `it('loads all five approach waypoints without deleting a waypoint (checked in the KLN 89 trainer, 2026-10-15, #221)'`
    asserting `toHaveLength(32)`, `legs[0]` is `['FILA', USER]`, the five APP idents, KPRC once. The pin becomes
    `it('keeps the approach legs in order before the airport on top of the en-route waypoints (6-5, 6-7, #221)'` with
    `fpl0Legs(unit).slice(-6)`. Body says `references #222`.
  - The same for the STAR in `Apt7Page.test.ts:193-232` (`slice(-6)`, 32 legs, FILA first; title of the pin
    `'keeps the STAR legs in order before the airport on top of the en-route waypoints (6-23, #221)'`; the setup
    `'loads all five STAR waypoints without deleting a waypoint (checked in the KLN 89 trainer, 2026-10-15, #221)'`).
  - `Apt7Page.test.ts:274`: the setup of the SID now asserts `toHaveLength(32)` (30 fillers, KPRC, two SID legs; one
    filler went for the airport) and KPRC once. Its describe comment: the airport needs room, the SID legs do not. The
    pin `:283` stays `it.fails` (it needs Task 2).
- [ ] **Step 6: CTR 1 count test.** In `Ctr1Page.test.ts`, describe `CTR 1 page, the 30 waypoint limit (5-26)`, add a
  characterization (5-26 counts the waypoints of a plan; how it counts procedure legs is not said). Build FPL 0 with
  en-route waypoints plus an approach so that the en-route count plus the new Center waypoint(s) is at most 30 while
  all legs plus them are more than 30. Start from the world of `inventory\349-pin-draft.test.ts.txt` (KDDD with RNAV 36),
  but put the IAF north of the Center boundary (for example IAFDD 44.0 N) so that no crossing falls inside the
  approach, and the en-route part as `cluster(n)` plus KDDD with n chosen for the counts above. Assert the
  precondition (the number of crossings, `getLegs().length`), then ENT, ENT, `CTR WPT INSERTION COMPLETE` and the plan
  longer by the number of new waypoints. Title `'counts only the en-route waypoints of FPL 0 against 30 (characterization, #221)'`.
- [ ] **Step 7: Verify.** Run the Verify command and `npm test`, `npx tsc --noEmit`. Mutations:
  - `legsFit` for FPL 0 returns `total <= MAX_LEGS`: the trainer tests, the render loads and the CTR test go red.
  - `MAX_FPL0_LEGS = 46`: the 46th-leg test goes red.
- [ ] **Step 8: Docs and commit.**
  - `docs/architecture.md:369-370`: each numbered plan holds 30 legs; FPL 0 holds 30 en-route legs and 45 in total
    (`legsFit`); `insertLeg` throws past them.
  - `CLAUDE.md:90`: `26 flight plans (FPL 0 is active) of at most 30 en-route legs (FPL 0 up to 45 with procedures)`.
  - `test/harness/flightplan.ts:8`: a full FPL 0 is one with 30 en-route legs.
  - Commit `fixes #221 count only the en-route waypoints of FPL 0 against 30 and every leg against 45`, body
    `references #222` (the approach and STAR pins of #222 became #221 tests).

```json:metadata
{"files": ["kln90b/data/flightplan/Flightplan.ts", "kln90b/services/FlightplanUtils.ts", "kln90b/pages/right/Ctr1Page.tsx", "test/unit/data/flightplan/Flightplan.test.ts", "test/unit/services/FlightplanUtils.test.ts", "test/render/pages/right/Apt8Page.test.ts", "test/render/pages/right/Apt7Page.test.ts", "test/render/pages/right/Ctr1Page.test.ts", "docs/architecture.md", "CLAUDE.md", "test/harness/flightplan.ts"], "verifyCommand": "npx vitest run test/unit/data/flightplan test/unit/services/FlightplanUtils.test.ts test/render/pages/right/Apt8Page.test.ts test/render/pages/right/Apt7Page.test.ts test/render/pages/right/Ctr1Page.test.ts && npm test", "acceptanceCriteria": ["FPL 0 takes procedure legs over 30 en-route, refuses a 31st en-route and a 46th leg; numbered plans keep 30", "insertLegIntoFpl inserts a STAR leg into 30 en-route + 2 STAR without deletion", "Apt8:198 becomes a spec test loading the whole approach", "new test loads an approach onto 30 en-route (35 legs)", "#222 approach/STAR pins become #221 order tests, setups 32 legs; SID setup 32 legs; SID pin stays it.fails", "CTR 1 counts only en-route waypoints"], "modelTier": "standard"}
```

---

### Task 2: #148 delete from the front of FPL 0 by one rule, at the right index

**Goal:** `insertLegIntoFpl` makes room by deleting legs from the front of FPL 0 until both limits hold: one waypoint per
step, an airport taking its SID legs with it, never a leg of the active leg (C-1). The insert index is corrected by the
number of legs deleted, so a waypoint typed over the first row goes first, and the airport of a SID goes first.

**Files:**
- Modify: `kln90b/services/FlightplanUtils.ts` (new `roomSteps`, `deleteFrontLegs`; `insertLegIntoFpl`)
- Test: `test/unit/services/FlightplanUtils.test.ts` (pin `:240`), `test/render/data/flightplan/FlightplanEdit.test.ts`
  (pin `:148`), `test/render/pages/right/Apt7Page.test.ts` (SID pin `:283`)

**Acceptance Criteria:**
- [ ] The pins `FlightplanUtils.test.ts:240`, `FlightplanEdit.test.ts:148` and `Apt7Page.test.ts:283` are `it` and pass.
- [ ] `roomSteps` returns `[]` when the legs fit, the step sizes when room can be made, `null` when a leg to delete is
      part of the active leg or is the protected airport; it changes nothing.
- [ ] An airport at the front goes together with the SID legs that follow it, in one step.
- [ ] Every existing `FlightplanUtils.test.ts` test stays green, the throws included.

**Verify:** `npx vitest run test/unit/services/FlightplanUtils.test.ts test/render/data/flightplan/FlightplanEdit.test.ts test/render/pages/right/Apt7Page.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Convert the three pins** to `it` and rewrite their comments (4-4: the typed waypoint goes in front of
  the first one; 6-22, figure 6-38: the airport first, then the SID). The SID pin's body says `references #222`. Add to
  `FlightplanUtils.test.ts`:

```ts
describe('roomSteps, the legs that go to make room in FPL 0 (#148)', () => {
    const sidOf = (apt: Facility, ident: string): KLNFlightplanLeg =>
        ({wpt: intersection(ident, 47.0, 8.2), type: KLNLegType.SID, parentFacility: apt as AirportFacility});

    it('is empty when the legs fit (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs().slice(0, 29), START);
        expect(roomSteps(fpl0.getLegs(), navState(aw, null), 1, 0)).toEqual([]);
    });

    it('deletes one waypoint for one en-route waypoint in a full plan (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);
        expect(roomSteps(fpl0.getLegs(), navState(aw, null), 1, 0)).toEqual([1]);
        expect(fpl0.getLegs()).toHaveLength(30); // nothing changed
    });

    // An airport deleted from the front takes its SID: the SID would otherwise start the plan without its airport
    it('deletes the airport at the front together with the SID legs that follow it (characterization)', () => {
        const kdep = airport('KDEP', 46.9, 8.0);
        const legs = [{wpt: kdep, type: KLNLegType.USER}, sidOf(kdep, 'SIDAA'), sidOf(kdep, 'SIDAB'), ...fullPlanLegs().slice(0, 29)];
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 1, 0)).toEqual([3]);
    });

    // C-1: FPL FULL while the first waypoint is part of the active leg
    it('is null while the first leg is part of the active leg (C-1)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), pointFrom(START, 0, 2));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(roomSteps(fpl0.getLegs(), navState(aw, 3), 1, 0)).toBeNull();
    });

    it('is null when the protected airport would have to go (characterization)', () => {
        const legs = fullPlanLegs();
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 1, 0, legs[0].wpt)).toBeNull();
    });

    // The total of 45 (#221): 30 en-route and 15 STAR legs, one more STAR leg deletes the first waypoint
    it('deletes the first waypoint for a procedure leg past 45 legs (characterization)', () => {
        const star = Array.from({length: 15}, (_, i): KLNFlightplanLeg => ({wpt: intersection(`ST${String(i).padStart(3, '0')}`, 46.8, 8 + 0.01 * i), type: KLNLegType.STAR}));
        const legs = [...fullPlanLegs(), ...star];
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 0, 1)).toEqual([1]);
    });
});
```

  (Import `AirportFacility` and `roomSteps`; keep `fullPlanLegs`, `START`, `build`, `navState` of the file.) Run.
  Expected: FAIL (`roomSteps` does not exist; the pins fail).

- [ ] **Step 2: Implement in `FlightplanUtils.ts`.**

```ts
/**
 * #148: the index of the first leg of `legs` that must stay: legs before it may be deleted to make room. During a
 * Direct To every leg before the target may go, otherwise every leg before the from leg (C-1). With nothing active
 * every leg may go. When the active leg is not in `legs` (it goes with a procedure that is replaced) none may go.
 */
function firstLegThatMustStay(legs: KLNFlightplanLeg[], navState: NavPageState): number {
    const aw = navState.activeWaypoint;
    if (aw.getActiveFplIdx() === -1) {
        return legs.length;
    }
    const at = legs.indexOf(aw.getActiveLeg()!);
    if (at === -1) {
        return 0;
    }
    return aw.isDctNavigation() ? at : at - 1;
}

/**
 * #148: the legs that go from the front of FPL 0 so that `legs` take `enRoute` more en-route and `procedure` more
 * procedure legs (#221), as the number of legs per step: one step per waypoint, and an airport takes the SID legs that
 * follow it. [] when they fit; null when room cannot be made: a leg to delete is part of the active leg (C-1), or `keep`
 * (the airport of the procedure being loaded) would go. Changes nothing.
 */
export function roomSteps(legs: KLNFlightplanLeg[], navState: NavPageState, enRoute: number, procedure: number, keep: Facility | null = null): number[] | null {
    const mustStay = firstLegThatMustStay(legs, navState);
    const steps: number[] = [];
    let start = 0;
    while (!legsFit(0, legs.slice(start), enRoute, procedure)) {
        if (start >= legs.length) {
            return null;
        }
        const first = legs[start];
        if (keep !== null && ICAO.valueEquals(first.wpt.icaoStruct, keep.icaoStruct)) {
            return null;
        }
        let size = 1;
        if (first.type === KLNLegType.USER) {
            while (start + size < legs.length && legs[start + size].type === KLNLegType.SID
            && legs[start + size].parentFacility !== undefined
            && ICAO.valueEquals(legs[start + size].parentFacility!.icaoStruct, first.wpt.icaoStruct)) {
                size++;
            }
        }
        if (start + size > mustStay) {
            return null;
        }
        steps.push(size);
        start += size;
    }
    return steps;
}

/** #148: deletes `count` legs from the front of the plan */
export function deleteFrontLegs(fpl: Flightplan, count: number): void {
    for (let i = 0; i < count; i++) {
        fpl.deleteLeg(0);
    }
}

export function insertLegIntoFpl(fpl: Flightplan, navstate: NavPageState, idx: number, leg: KLNFlightplanLeg): void {
    const enRoute = leg.type === KLNLegType.USER ? 1 : 0;
    if (fpl.idx !== 0 || fpl.fits(enRoute, 1 - enRoute)) { //#221
        fpl.insertLeg(idx, leg);
        return;
    }

    const steps = roomSteps(fpl.getLegs(), navstate, enRoute, 1 - enRoute);
    if (steps === null) {
        throw new Error("First waypoint is part of the active leg");
    }
    const count = steps.reduce((sum, size) => sum + size, 0);
    deleteFrontLegs(fpl, count);
    fpl.insertLeg(Math.max(0, idx - count), leg); //#148: the index follows the deleted legs; in front of the first is 0
}
```

  Update the doc comment of `insertLegIntoFpl` (C-1, #148). Import `legsFit` and `ICAO`.

- [ ] **Step 3: Verify.** Run the Verify command, `npm test`, `npx tsc --noEmit`. Mutations:
  - `Math.max(0, idx - count)` → `idx - count`: the three pins go red.
  - Drop the SID-legs loop: the airport-with-SID test goes red.
  - `start + size > mustStay` → `start + size > mustStay + 1`: the C-1 test and `FlightplanUtils.test.ts`'s
    "refuses when the first leg is part of the active leg (C-1)" go red.
- [ ] **Step 4: Docs and commit.** `docs/architecture.md:370` names `roomSteps`. Commit
  `fixes #148 delete from the front of a full FPL 0 by one rule and insert at the corrected index`, body
  `references #222` (the SID pin).

```json:metadata
{"files": ["kln90b/services/FlightplanUtils.ts", "test/unit/services/FlightplanUtils.test.ts", "test/render/data/flightplan/FlightplanEdit.test.ts", "test/render/pages/right/Apt7Page.test.ts", "docs/architecture.md"], "verifyCommand": "npx vitest run test/unit/services/FlightplanUtils.test.ts test/render/data/flightplan/FlightplanEdit.test.ts test/render/pages/right/Apt7Page.test.ts && npm test", "acceptanceCriteria": ["pins FlightplanUtils:240, FlightplanEdit:148, Apt7:283 pass as it", "roomSteps returns [], step sizes or null and changes nothing", "an airport at the front goes with its SID legs", "existing FlightplanUtils tests green"], "modelTier": "standard"}
```

---

### Task 3: #222 procedure loads decide the room first and ask before deleting

**Goal:** APT 8 and APT 7 decide before changing anything whether the load fits: procedure legs never cause a deletion
of their own; room is needed for the airport the load adds and for the total. No room: FPL FULL, FPL 0 unchanged (the
old procedure included). Room needed: the left page asks once per waypoint to delete (`DELETING / WPT   n / TO MAKE /
ROOM IN / FLIGHTPLAN- / CONTINUE?`, `CONTINUE?` flashing); ENT on the last question deletes and loads; CLR cancels with
FPL 0 unchanged. The load is one batch with one `flightplanChanged`.

**Files:**
- Create: `kln90b/pages/left/MakeRoomPage.tsx` (abstract base), `kln90b/pages/left/ProcedureMakeRoomPage.tsx`
- Modify: `kln90b/pages/right/Apt8Page.tsx` (`load`), `kln90b/pages/right/Apt7Page.tsx` (`load`)
- Test: `test/render/pages/right/Apt8Page.test.ts`, `test/render/pages/right/Apt7Page.test.ts`

**Acceptance Criteria:**
- [ ] SID into a full FPL 0 without its airport, active leg 6: after the add question, the left page shows the room
      question with `WPT   1`; ENT gives `KPRC, SIDAA, SIDAB, FL01, ...` (32 legs); CLR instead leaves FPL 0 unchanged.
- [ ] `CONTINUE?` flashes (a blink cycle reads `F` once and `I` three times on its first cell).
- [ ] An approach to an airport not in a full FPL 0 whose first leg is active: FPL FULL, FPL 0 unchanged.
- [ ] An approach whose airport is missing from a full FPL 0 with room: the approach stands in front of the appended
      airport (35 legs).
- [ ] A load that needs two deletions asks twice (`WPT   1`, then `WPT   2`), and FPL 0 is unchanged after the first ENT.
- [ ] A load publishes `flightplanChanged` once.

**Verify:** `npx vitest run test/render/pages/right/Apt8Page.test.ts test/render/pages/right/Apt7Page.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** In `Apt7Page.test.ts`, describe `APT 7 loading a SID into a full FPL 0 that lacks its
  airport`: the helper `loadSidIntoFullPlan` gets a parameter `answer: 'ent' | 'clr' | null = 'ent'`. After the add
  question's ENT it reads the left page and answers. Rewrite the describe comment: the airport needs one en-route place,
  the unit asks before it deletes the first waypoint, the SID legs come on top. Add:

```ts
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    // The 90B wording follows the AVsoftech trainer; the KLN 89 asks the same in its own words (checked in the KLN 89
    // trainer, 2026-10-15). Nothing is deleted while the question shows
    it('asks on the left page to delete waypoint 1 before it adds the airport (characterization, #222)', async () => {
        const unit = await loadSidIntoFullPlan(null);

        expect(leftRows()).toEqual(['DELETING', 'WPT   1', 'TO MAKE', 'ROOM IN', 'FLIGHTPLAN-', 'CONTINUE?']);
        expect(unit.panel.focused('L')).toMatchObject({row: 5, text: 'CONTINUE?'});
        expect(fpl0Legs(unit)).toHaveLength(30);
        const cycle = await blinkCycle(() => Screen.read().cell(5, 0).attr);
        expect(cycle.sort()).toEqual(['F', 'I', 'I', 'I']);
    });

    it('leaves FPL 0 unchanged when the question is answered with CLR (characterization, #222)', async () => {
        const unit = await loadSidIntoFullPlan('clr');

        expect(fpl0Legs(unit).map(l => l[0])).toEqual(Array.from({length: 30}, (_, i) => `FL${String(i).padStart(2, '0')}`));
    });
```

  The setup test (`:274`) and the SID pin (`:283`, now `it`) use `loadSidIntoFullPlan()` with ENT; the setup asserts
  32 legs, `FL00` gone, KPRC once. (Check `focused('L').text` and the column of `CONTINUE?` against what the page
  renders; the row texts above are the spec. If the cursor's run covers trailing blanks, compare `.trim()`.)

  In `Apt8Page.test.ts` add a describe `APT 8 loading an approach into a full FPL 0 that lacks its airport`:

```ts
    async function bootFullWithoutKprc(position: { lat: number, lon: number }) {
        const w = approachWorld();
        const fillers = Array.from({length: 30}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position, panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, fillers),
        });
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KPRC');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18 (one transition)
        await unit.panel.ent(); // LOAD IN FPL: the add question
        await unit.panel.ent(); // APPROVE?
        return unit;
    }

    // C-1: FPL FULL while the first waypoint is part of the active leg; nothing of the load is done
    it('answers FPL FULL and leaves FPL 0 unchanged while the first leg is active (C-1, #222)', async () => {
        const unit = await bootFullWithoutKprc({lat: 46.5, lon: 6.9});
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('FPL FULL');
        expect(fpl0Legs(unit)).toHaveLength(30);
    });

    // 6-5, 6-7: the approach goes in front of its airport, also when the airport is added at the end
    it('puts the approach in front of the airport it adds to a full FPL 0 (6-5, 6-7, #222)', async () => {
        const unit = await bootFullWithoutKprc({lat: 46.5, lon: 7.12});
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6); // Precondition
        await unit.panel.ent(); // CONTINUE?
        await vi.advanceTimersByTimeAsync(1000);

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(35);
        expect(legs[0][0]).toBe('FL01');
        expect(legs.slice(-6).map(l => l[0])).toEqual(['IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
    });
```

  And a multi-question test (a characterization: the maintainer's ruling of one question per waypoint; the waypoint
  number names the waypoint that will go, since nothing is deleted before the last ENT):

```ts
    it('asks once per waypoint it has to delete and deletes nothing before the last ENT (characterization, #222)', async () => {
        const w = approachWorld();
        // An approach of 17 waypoints onto 29 fillers and KPRC: 47 legs, two over the 45
        const fixes = Array.from({length: 17}, (_, i) => intersection(`AP${String(i).padStart(3, '0')}`, 46.8, 7.5 + 0.02 * i));
        const longApp = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            final: [Leg.IF(fixes[0], FixTypeFlags.IAF), ...fixes.slice(1, 16).map(f => Leg.TF(f)), Leg.TF(fixes[16], FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: [longApp]});
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, ...fixes, ...fillers], position: {lat: 46.5, lon: 7.12}, panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [...fillers, kprc]),
        });
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6); // Precondition
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // the approach (no transition)
        await unit.panel.ent(); // LOAD IN FPL

        expect(leftRows()[1]).toBe('WPT   1');
        await unit.panel.ent();
        expect(leftRows()[1]).toBe('WPT   2');
        expect(fpl0Legs(unit)).toHaveLength(30); // nothing deleted yet
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(45);
        expect(legs[0][0]).toBe('FL02');
        expect(legs[44][0]).toBe('KPRC');
    });
```

  (Check that `SidStar` keeps all 17 legs: unflagged TF legs to different fixes are kept. If the approach list or the
  load needs other steps, adapt the clicks and report it; the assertions stay.)

  Add one test that counts `flightplanChanged` during a load (subscribe on `unit.props.bus` before `loadProcedure`,
  expect exactly 1 for the APT 8 load of `approachWorld()` onto ENRAA, KPRC).

  Run. Expected: FAIL.

- [ ] **Step 2: The pages.** `kln90b/pages/left/MakeRoomPage.tsx`:

```tsx
import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Button} from "../../controls/Button";
import {TextDisplay} from "../../controls/displays/TextDisplay";

type MakeRoomPageTypes = {
    wpt: TextDisplay,
    continue: Button,
}

/**
 * #222, #380: the question before waypoints are deleted from the front of FPL 0 to make room. The text follows the
 * AVsoftech 90B trainer (characterization); the KLN 89 asks the same on its own screen (checked in its trainer,
 * 2026-10-15). The cursor is on CONTINUE?, which flashes as every focused button does. Each context has its own
 * subclass (maintainer).
 */
export abstract class MakeRoomPage extends SixLineHalfPage {
    public readonly cursorController: CursorController;
    readonly children: UIElementChildren<MakeRoomPageTypes>;
    readonly name: string = "     ";

    protected constructor(props: PageProps, waypointNumber: number) {
        super(props);
        this.children = new UIElementChildren<MakeRoomPageTypes>({
            wpt: new TextDisplay(this.formatWpt(waypointNumber)),
            continue: new Button("CONTINUE?", () => this.onContinue()),
        });
        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    public render(): VNode {
        return (<pre>
            DELETING<br/>
            {this.children.get("wpt").render()}<br/>
            TO MAKE<br/>
            ROOM IN<br/>
            FLIGHTPLAN-<br/>
            {this.children.get("continue").render()}
        </pre>);
    }

    public clear(): boolean {
        this.onCancel();
        return true;
    }

    protected setWaypointNumber(n: number): void {
        this.children.get("wpt").text = this.formatWpt(n);
    }

    private formatWpt(n: number): string {
        return `WPT ${n.toString().padStart(3, " ")}`;
    }

    protected abstract onContinue(): void;

    protected abstract onCancel(): void;
}
```

  `kln90b/pages/left/ProcedureMakeRoomPage.tsx`:

```tsx
/**
 * #222: asks once per waypoint that a procedure load must delete from the front of FPL 0, numbering them from 1;
 * nothing is deleted before ENT on the last question, which calls `onContinue` of the load. CLR on any of them cancels.
 * Pushed on the left with the APT page as its parent.
 */
export class ProcedureMakeRoomPage extends MakeRoomPage {
    private asked = 1;

    constructor(props: PageProps, private readonly count: number, private readonly continueLoad: () => void) {
        super(props, 1);
    }

    protected onContinue(): void {
        if (this.asked < this.count) {
            this.asked++;
            this.setWaypointNumber(this.asked);
            return;
        }
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
        this.continueLoad();
    }

    protected onCancel(): void {
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
    }
}
```

  `Button.enter` returns `Handled_Move_Focus`; with one field the focus stays on CONTINUE?. Check that the second ENT
  still reaches the button (the cursor stays on it); if not, re-focus it in `onContinue` and say so.

- [ ] **Step 3: APT 8 `load`.** Split it into a room check and the load proper:

```ts
    private load(app: ApproachProcedure, iaf: ApproachTransition | null, legs: KLNFlightplanLeg[]): void {
        const facility = unpackFacility(this.facility)!;
        //#222: the room is decided before anything changes. The old approach goes in the same step, so its legs free
        //room; procedure legs never cause a deletion of their own (#221)
        const steps = this.roomFor(facility, legs);
        if (steps === null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL"); //C-1
            return;
        }
        if (steps.length === 0) {
            this.loadNow(app, iaf, legs, 0);
            return;
        }
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.pushLeftPage(new ProcedureMakeRoomPage(this.props, steps.length, () => {
            //A right knob step does not remove the question, so the room is checked again (#222)
            const now = this.roomFor(facility, legs);
            if (now === null) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL");
                return;
            }
            this.loadNow(app, iaf, legs, now.reduce((sum, size) => sum + size, 0));
        }), this);
    }

    private roomFor(facility: AirportFacility, legs: KLNFlightplanLeg[]): number[] | null {
        const remaining = this.props.memory.fplPage.flightplans[0].getLegs().filter(leg => leg.type !== KLNLegType.APP);
        const addAirport = !remaining.some(leg => ICAO.valueEquals(leg.wpt.icaoStruct, facility.icaoStruct));
        return roomSteps(remaining, this.props.memory.navPage, addAirport ? 1 : 0, legs.length, facility);
    }
```

  `loadNow(app, iaf, legs, deleteCount)` is today's `load` body with: `startBatchInsert`, `removeProcedure(APP)`,
  `deleteFrontLegs(fpl0, deleteCount)`, the airport appended with `fpl0.insertLeg(fpl0Legs.length, ...)` when missing,
  the REDUNDANT check, the legs inserted with plain `fpl0.insertLeg(idx++, leg)` (room is guaranteed), one
  `finishBatchInsert()`, then the pages as today. Remove both try/catch blocks and the second `finishBatchInsert` of the
  FPL FULL path (inventory finding 4). Keep `Apt8AddPage` and its `load` callback pointing at `load`.

- [ ] **Step 4: APT 7 `load`** the same way, with `type = this.getProcedureType()`: `remaining` drops the legs of
  `type`; the airport goes first for a SID (`insertLeg(0, ...)` after the deletions) and last otherwise; the index logic
  for the SID (after the airport) and the STAR (in front of an approach) stays.
- [ ] **Step 5: Verify.** Run the Verify command, `npm test`, `npx tsc --noEmit`. Mutations:
  - In `ProcedureMakeRoomPage.onContinue`, call `continueLoad()` on the first ENT: the two-question test goes red.
  - In `roomFor`, pass `0` instead of `legs.length`: the 17-waypoint test goes red (the load overflows; report what
    happens).
  - Skip the question (`loadNow` directly with the step sum): the question tests go red.
- [ ] **Step 6: Docs and commit.** `docs/architecture.md` (the APT 7/8 load paragraph, if there is one; else the
  `Flightplan` paragraph): loads decide the room first, `ProcedureMakeRoomPage` asks. Commit
  `fixes #222 decide the room of a procedure load before changing FPL 0 and ask before deleting waypoints`.

```json:metadata
{"files": ["kln90b/pages/left/MakeRoomPage.tsx", "kln90b/pages/left/ProcedureMakeRoomPage.tsx", "kln90b/pages/right/Apt8Page.tsx", "kln90b/pages/right/Apt7Page.tsx", "test/render/pages/right/Apt8Page.test.ts", "test/render/pages/right/Apt7Page.test.ts", "docs/architecture.md"], "verifyCommand": "npx vitest run test/render/pages/right/Apt8Page.test.ts test/render/pages/right/Apt7Page.test.ts && npm test", "acceptanceCriteria": ["SID into full FPL 0: room question WPT 1, ENT gives KPRC SIDAA SIDAB FL01.. (32), CLR leaves FPL 0 unchanged", "CONTINUE? flashes", "no room (first leg active): FPL FULL, FPL 0 unchanged", "approach whose airport is missing: approach before appended airport, 35 legs", "two deletions ask WPT 1 then WPT 2, nothing deleted before the last ENT", "one flightplanChanged per load"], "modelTier": "frontier"}
```

---

### Task 4: #274 APT 8 and APT 7 ask before replacing a procedure

**Goal:** When FPL 0 holds an approach (any), ENT on LOAD IN FPL on APT 8 shows `Apt8ReplacePage` (the approach name,
`PRESS ENT / TO REPLACE / EXISTING / APPROACH / APPROVE?`, the cursor on a flashing `APPROVE?`); when FPL 0 holds a
procedure of the type being loaded, APT 7 shows `Apt7ReplacePage` with `STAR` or `SID`. It is the only question (no add
question when the airport is missing). CLR goes back to the preview with the cursor on LOAD IN FPL; ENT continues with
the room check of Task 3 and the load.

**Files:**
- Modify: `kln90b/pages/right/Apt8Page.tsx` (`loadIfFplContainsApt`, `clear`, new `Apt8ReplacePage`)
- Modify: `kln90b/pages/right/Apt7Page.tsx` (`loadIfFplContainsApt`, `clear`, new `Apt7ReplacePage`)
- Test: `test/render/pages/right/Apt8Page.test.ts` (pin `:118`, `:130`), `test/render/pages/right/Apt7Page.test.ts`

**Acceptance Criteria:**
- [ ] The pin `does not replace the approach that FPL 0 already holds without asking (KLN 89 trainer, #274)` is `it`.
- [ ] With RNAV 18 loaded and VOR 09 chosen, LOAD IN FPL shows `['V09-KPRC', 'PRESS ENT', 'TO REPLACE', 'EXISTING',
      'APPROACH', 'APPROVE?']`, the cursor on APPROVE?, which flashes; FPL 0 still holds RNAV 18.
- [ ] ENT replaces it; the left page is FPL 0, the right the approach list (the right cursor as after any load today).
- [ ] CLR shows the VOR 09 preview with the cursor on LOAD IN FPL; FPL 0 unchanged.
- [ ] The same approach again asks too; an approach to an airport not in FPL 0 asks only to replace, and the airport is
      appended after ENT.
- [ ] APT 7: replacing a STAR asks `['ARR2-Æ', 'PRESS ENT', 'TO REPLACE', 'EXISTING', 'STAR', 'APPROVE?']`; a SID the
      same with `SID`; loading a STAR while FPL 0 holds an approach asks nothing.
- [ ] `:130` (CHANGE APR?) answers the question and still replaces.

**Verify:** `npx vitest run test/render/pages/right/Apt8Page.test.ts test/render/pages/right/Apt7Page.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** In `Apt8Page.test.ts`, describe `APT 8 putting an approach into FPL 0`:
  - Convert the pin; its comment: the 89 asks before it replaces (checked 2026-10-07 and 2026-10-15). It asserts
    FPL 0 unchanged after LOAD IN FPL.
  - Add (helper `bootWithFirstApproachLoaded` exists):

```ts
    // The 90B wording follows the AVsoftech trainer; that the unit asks, with APPROVE? flashing, is the KLN 89's
    // (checked in the KLN 89 trainer, 2026-10-15)
    it('asks to replace the existing approach with APPROVE? flashing (characterization, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent(); // VOR 09: the waypoints
        await unit.panel.ent(); // LOAD IN FPL

        expect(rows('R')).toEqual(['V09-KPRC', 'PRESS ENT', 'TO REPLACE', 'EXISTING', 'APPROACH', 'APPROVE?']);
        expect(unit.panel.focused('R').text.trim()).toBe('APPROVE?');
        const col = Screen.read().row(5).indexOf('APPROVE?');
        const cycle = await blinkCycle(() => Screen.read().cell(5, col).attr);
        expect(cycle.sort()).toEqual(['F', 'I', 'I', 'I']);
    });

    it('replaces the approach on APPROVE? and shows FPL 0 and the approach list (checked in the KLN 89 trainer, 2026-10-15, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['IAFBB', KLNLegType.APP], ['FAFBB', KLNLegType.APP], ['MAPAA', KLNLegType.APP],
            ['KPRC', KLNLegType.USER],
        ]);
        expect(Screen.read().status().left).toBe('FPL 0');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 18']);
    });

    it('goes back to the waypoints with the cursor on LOAD IN FPL on CLR (checked in the KLN 89 trainer, 2026-10-15, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.clr();

        expect(rows('R')).toEqual(['V09-KPRC', ' 1 IAFBBà', ' 2 FAFBBá', ' 3 MAPAAã', '', 'LOAD IN FPL']);
        expect(unit.panel.focused('R')).toEqual({row: 5, col: 12, text: 'LOAD IN FPL'});
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });

    it('asks before it loads the same approach again (checked in the KLN 89 trainer, 2026-10-15, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.outer('R', -1); // back to RNAV 18
        await unit.panel.ent(); // RNAV 18: its waypoints (one transition)
        await unit.panel.ent(); // LOAD IN FPL

        expect(rows('R').slice(1, 5)).toEqual(['PRESS ENT', 'TO REPLACE', 'EXISTING', 'APPROACH']);
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });
```

  - Add the other-airport case (checked in the KLN 89 trainer, 2026-10-15): FPL 0 `[ENRAA, KPRC]` with RNAV 18 loaded,
    a second airport `KQQQ` (not in FPL 0) with one approach; APT 8 of KQQQ, its approach, LOAD IN FPL: rows 1-4 are the
    replace question (not `TO ADD`); ENT gives `ENRAA, KPRC, <KQQQ approach legs>, KQQQ` (the KPRC approach gone, KQQQ
    appended, its approach in front of it). Build KQQQ and its fixes with `airport`, `intersection`, `approach`,
    `withProcedures`, as in `twoApproaches()`.
  - `:130` (CHANGE APR?): after `LOAD IN FPL` add `await unit.panel.ent(); // APPROVE? of the replace question (#274)`;
    the comment says 6-7's route asks too (the 89 check).
  - In `Apt7Page.test.ts`, a describe `APT 7 replacing a procedure`: a STAR world with two STARs ARR1 and ARR2 of KPRC
    (as `sidStarWorld` builds, or `star(...)` in `withProcedures`): load ARR1, then choose ARR2 → rows
    `['ARR2-Æ', 'PRESS ENT', 'TO REPLACE', 'EXISTING', 'STAR', 'APPROVE?']` (checked in the KLN 89 trainer, 2026-10-15,
    for the STAR; the 90B wording a characterization: split the assertion of the text into a characterization test as
    for APT 8); ENT replaces; CLR goes back to the ARR2 preview (cursor on LOAD IN FPL), FPL 0 unchanged. A SID case
    (`DEP1`, `DEP2`) as a characterization (`...'SID', 'APPROVE?'`). And `'asks nothing when a STAR is loaded while FPL 0 holds an approach (checked in the KLN 89 trainer, 2026-10-15, #274)'`
    (the existing `:83` test already loads a STAR after an approach: assert there that no replace question appears, or
    add the assertion to a copy).
  Run. Expected: FAIL.

- [ ] **Step 2: `Apt8ReplacePage`** in `Apt8Page.tsx`, built like `Apt8AddPage` (same props; `formatTitle()` on the
  first line):

```tsx
    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            PRESS ENT<br/>
            TO REPLACE<br/>
            EXISTING<br/>
            APPROACH<br/>
            {this.children.get("approve").render()}
        </pre>);
    }
```

  with `approve: new Button("  APPROVE? ", () => props.load(props.app, props.iaf, props.legs))`. In
  `loadIfFplContainsApt`, first:

```ts
        //#274: the unit asks before it replaces an approach, also the same one, and this is the only question (checked
        //in the KLN 89 trainer, 2026-10-15)
        if (fpl0Legs.some(leg => leg.type === KLNLegType.APP)) {
            this.currentApt8Page = new Apt8ReplacePage({...this.props, app, iaf, legs, load: this.load.bind(this)});
            this.requiresRedraw = true;
            return;
        }
```

  `clear()`: `Apt8ReplacePage` goes back to the preview exactly as `Apt8AddPage` does.
- [ ] **Step 3: `Apt7ReplacePage`** the same in `Apt7Page.tsx`, the fourth line `{type === SID ? "SID" : "STAR"}`, shown
  when FPL 0 holds a leg of `this.getProcedureType()`; `clear()` handles it like `Apt7AddPage` (step 4 → preview).
- [ ] **Step 4: Verify.** Run the Verify command, `npm test`, `npx tsc --noEmit`. Mutations:
  - Remove the replace branch of APT 8: the pin and the APT 8 question tests go red.
  - Let `clear()` ignore `Apt8ReplacePage` (fall through): the CLR test goes red.
  - Remove the APT 7 replace branch: the APT 7 tests go red.
- [ ] **Step 5: Commit** `fixes #274 ask before APT 8 replaces the approach and APT 7 the SID or STAR of FPL 0`.

```json:metadata
{"files": ["kln90b/pages/right/Apt8Page.tsx", "kln90b/pages/right/Apt7Page.tsx", "test/render/pages/right/Apt8Page.test.ts", "test/render/pages/right/Apt7Page.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/Apt8Page.test.ts test/render/pages/right/Apt7Page.test.ts && npm test", "acceptanceCriteria": ["pin Apt8:118 passes as it", "replace question rows with flashing APPROVE?, FPL 0 unchanged", "ENT replaces, FPL 0 left, approach list right", "CLR back to preview with cursor on LOAD IN FPL", "same approach asks; other airport asks only to replace and appends the airport", "APT 7 STAR and SID replace questions; STAR after an approach asks nothing", "CHANGE APR? test answers the question"], "modelTier": "standard"}
```

---

### Task 5: #380 an insert into a full FPL 0 asks before it deletes waypoint 1

**Goal:** On the FPL 0 page, the inner-knob click that would open an insert row (in front of a row, or on the blank
position at the end) first checks the limits for the leg it would insert (en-route, or SID/STAR in front of such a
row). If it does not fit and room can be made, the left page shows `FplInsertMakeRoomPage` (the text of Task 3's base,
`WPT   1`) instead; ENT deletes waypoint 1 (one step of `roomSteps`), asks again if that is not enough, and opens the insert
row in front of the same waypoint; CLR cancels with FPL 0 unchanged and the left cursor off. If room cannot be made the
row opens as today and ENT gives FPL FULL (C-1). REF and CTR inserts are unchanged.

**Files:**
- Create: `kln90b/pages/left/FplInsertMakeRoomPage.tsx`
- Modify: `kln90b/controls/FlightplanList.tsx` (`EditableFlightplan`: a room check before `createLeg` and before the
  blank entry opens), `kln90b/controls/FlightplanListItem.tsx` (`innerLeft`, `innerRight`, `enter`: ask the parent
  first)
- Test: `test/render/data/flightplan/FlightplanEdit.test.ts`

**Acceptance Criteria:**
- [ ] Full FPL 0 (30 en-route), active leg 21: cursor on the second waypoint, inner knob: the left page shows the
      question, FPL 0 still has 30 legs with FA00 first.
- [ ] ENT: FA00 is gone and the insert row is open in front of FA01; typing KNEW, ENT, ENT inserts it (30 legs).
- [ ] CLR: FPL 0 unchanged, the left cursor off (status `FPL 0`).
- [ ] The blank position at the end asks the same.
- [ ] `answers FPL FULL and leaves the plan alone while the first leg is active (C-1)` stays green unchanged.
- [ ] The FlightplanEdit tests that type into a full FPL 0 answer the question first and keep their assertions.

**Verify:** `npx vitest run test/render/data/flightplan/FlightplanEdit.test.ts test/render/pages/left` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** In `FlightplanEdit.test.ts`, describe `adding a waypoint to a full FPL 0`:

```ts
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    /** A full FPL 0, the aircraft 100 NM along it (active leg 21), the cursor on FA01, one inner-knob click */
    async function clickInFrontOfSecondWaypoint() {
        const unit = await bootFull(100);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.outer('L', 1); // FA01
        await unit.panel.inner('L', 1);
        return unit;
    }

    // The KLN 89 asks on the first inner-knob click, before any ident, and deletes nothing yet (checked in the KLN 89
    // trainer, 2026-10-15)
    it('asks before it deletes a waypoint on the first inner-knob click (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();

        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
        expect(leftRows()[5]).toBe('CONTINUE?');
    });

    // The 90B wording follows the AVsoftech trainer
    it('shows DELETING WPT 1 TO MAKE ROOM IN FLIGHTPLAN- CONTINUE? (characterization, #380)', async () => {
        await clickInFrontOfSecondWaypoint();

        expect(leftRows()).toEqual(['DELETING', 'WPT   1', 'TO MAKE', 'ROOM IN', 'FLIGHTPLAN-', 'CONTINUE?']);
    });

    it('deletes waypoint 1 on ENT and opens the insert row in front of the same waypoint (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();
        await unit.panel.ent();

        expect(fplIdents(unit)[0]).toBe('FA01');
        expect(fplIdents(unit)).toHaveLength(29);
        // the insert row is open above FA01: type the rest of the ident and approve
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);
        expect(fplIdents(unit).slice(0, 2)).toEqual(['KNEW', 'FA01']);
        expect(fplIdents(unit)).toHaveLength(30);
    });

    it('cancels with CLR and leaves FPL 0 unchanged (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();
        await unit.panel.clr();

        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
    });

    // The AVsoftech trainer turned the cursor off after CLR
    it('turns the left cursor off after CLR on the question (characterization, #380)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();
        await unit.panel.clr();

        expect(Screen.read().status().left).toBe('FPL 0');
    });

    it('asks at the blank position after the 30th waypoint as well (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await bootFull(100);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        for (let i = 0; unit.panel.focused('L').text.replace(/[_ ]/g, '') !== '' && i < 40; i++) {
            await unit.panel.outer('L', 1);
        }
        await unit.panel.inner('L', 1);

        expect(leftRows()[5]).toBe('CONTINUE?');
        expect(fplIdents(unit)).toHaveLength(30);
    });
```

  (`enterIdent` after ENT: the insert row is open as after a first click. If `enterIdent` expects a closed field,
  type with `inner`/`outer` or extend the helper, and report it; the assertions stay.)
  The vehicles: `drops the first leg to append once the first leg is no longer active (characterization)`,
  `puts a waypoint typed over the second row in front of it (4-4)`, `keeps a full plan at 30 legs by dropping the
  first leg (characterization)` and the #148 test now meet the question: in `typeKnewOver` and the append loop, after
  the first `inner('L', 1)` of `enterIdent`, answer it with ENT (add a step `await unit.panel.inner('L', 1); await
  unit.panel.ent();` before `enterIdent`, and keep their assertions). Grep the whole suite for other tests that add to a
  full FPL 0 through the page (`bootFull`, `FIXES`, 30-leg `savedFlightplan(0, ...)`, `appendToFpl0` on a full plan) and
  run the full suite after the fix to find them.
  Run. Expected: FAIL.

- [ ] **Step 2: `FplInsertMakeRoomPage`** (`kln90b/pages/left/FplInsertMakeRoomPage.tsx`), a subclass of `MakeRoomPage`:

```tsx
/**
 * #380: asked by the inner-knob click that would add a waypoint to a full FPL 0, before the insert row opens. ENT deletes
 * one waypoint from the front (one step of roomSteps) and hands back to the FPL page, which asks again or opens the row;
 * CLR cancels. Pushed on the left over the FPL 0 page (a context of its own, maintainer)
 */
export class FplInsertMakeRoomPage extends MakeRoomPage {
    constructor(props: PageProps, private readonly deleteAndContinue: () => void, private readonly cancel: () => void) {
        super(props, 1);
    }

    protected onContinue(): void {
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
        this.deleteAndContinue();
    }

    protected onCancel(): void {
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
        this.cancel();
    }
}
```

- [ ] **Step 3: The hook in `FlightplanList.tsx` / `FlightplanListItem.tsx`.**
  - `FlightplanListItem` gets a new prop `askRoom: (wptIdx: number, retry: () => void) => boolean`. In `innerLeft`,
    `innerRight` and `enter`, before `onCreate(...)` (a row with a waypoint) and before the editor of the blank entry
    opens (`wpt === null`, editor not entered), it calls `if (this.props.askRoom(this.props.wptIdx, () => <the same
    action again>)) return true;` (for `enter`, `return EnterResult.Handled_Keep_Focus`). Not for APP rows (they keep
    INVALID ADD) and not while an entry is open.
  - `EditableFlightplan.askRoom(wptIdx, retry)`: returns false unless the plan is FPL 0. The leg the insert would add is
    SID/STAR when the row it goes in front of is a SID/STAR row (as `createLeg` copies the type), else USER. `steps =
    roomSteps(this.flightplan.getLegs(), navState, enRoute, procedure)`; `[]` or `null` → return false (`null` keeps
    today's path: the row opens and ENT gives FPL FULL, C-1). Otherwise push `new FplInsertMakeRoomPage(props,
    deleteAndContinue, cancel)` on the left (parent null) and return true.
    - `deleteAndContinue`: `deleteFrontLegs(this.flightplan, steps[0])`, `syncLegsFromFlightplan()`, `buildList()`,
      put the focus on the row that was in front of (index `wptIdx - steps[0]`, or the blank entry), then call `retry`
      on the rebuilt row, which asks again if still needed or opens the insert row.
    - `cancel`: `this.cursorController.setCursorActive(false)`.
  - Trace the whole ENT path through `CursorController.enter` and `MainPage.handleEnter` before coding: the question is
    the left page while it shows, so ENT goes to it; after the pop the FPL page's cursor controller must still hold the
    focus you set (milestone 4 found a `focusMe` made inert by a later `Move_Focus`). Report how you placed the focus.
- [ ] **Step 4: Verify.** Run the Verify command, `npm test`, `npx tsc --noEmit`. Mutations:
  - `askRoom` returns false always: the question tests go red; the updated vehicles go red too (they now expect the
    question).
  - `deleteAndContinue` deletes `steps[0] + 1`: the ENT test goes red.
  - `cancel` does nothing: the cursor-off characterization goes red.
- [ ] **Step 5: Docs and commit.** `docs/architecture.md` (the FPL page / `FlightplanList` paragraph): the room question
  of an insert. Commit `fixes #380 ask before an insert into a full FPL 0 deletes waypoint 1`.

```json:metadata
{"files": ["kln90b/pages/left/FplInsertMakeRoomPage.tsx", "kln90b/controls/FlightplanList.tsx", "kln90b/controls/FlightplanListItem.tsx", "test/render/data/flightplan/FlightplanEdit.test.ts", "docs/architecture.md"], "verifyCommand": "npx vitest run test/render/data/flightplan/FlightplanEdit.test.ts test/render/pages/left && npm test", "acceptanceCriteria": ["first inner click on a full FPL 0 shows the question, FPL 0 unchanged", "ENT deletes FA00 and opens the insert row before FA01; KNEW inserted, 30 legs", "CLR leaves FPL 0 unchanged and the cursor off", "blank end position asks too", "C-1 FPL FULL test unchanged", "vehicles answer the question and keep their assertions"], "modelTier": "frontier"}
```

---

### Task 6: #376 the conversion never writes into the SDK legs

**Goal:** `getKLNApproachLegList` and `getKLNProcedureLegList` copy each leg once before filtering, so
`mergeAFsIfNecessary` and `addArcInfoIfPrevIsSame` change only copies. Converting a procedure twice, or a second
transition after the first, gives the same result as a fresh conversion.

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts` (the two list builders)
- Modify: `test/harness/navdata/procedures.ts:11-15` (the comment that SidStar writes into legs)
- Test: `test/unit/data/navdata/SidStar.test.ts`

**Acceptance Criteria:**
- [ ] Converting the PHNY-shaped approach (transition `[IF STFIX (IAF), AF ARC1E 10 NM 270→225]`, final `[IF ARC1E
      (IAF), TF FAFAA (FAF), TF MAPAA (MAP)]`, aircraft on radial 250 at 30 NM) twice gives `D250J, ARC1E, FAFAA, MAPAA`
      both times.
- [ ] The ARC1E transition of the second reproduction starts its arc at radial 225 (`D225J`) also after a conversion
      with the STFIX transition.
- [ ] The SDK leg objects are unchanged after a conversion (their `course` and `fixTypeFlags`).

**Verify:** `npx vitest run test/unit/data/navdata/SidStar.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** In `SidStar.test.ts`, inside `describe('SidStar conversion of procedures to KLN legs')` (it
  has `abc`, `fixAt`, `at`, `sidStar`, `kprc`, `LEFT`), add a describe
  `'a conversion leaves the procedure as the database has it (#376)'` with the two reproductions of #376 (copy them from
  `inventory\tools\zzScratch.test.ts.txt`, tests `3e ...`), asserting:

```ts
        it('converts the same approach and transition twice to the same legs (characterization, #376)', async () => {
            ... the PHNY-shaped approach of the issue ...
            const ss = sidStar(facs, at(250, 30));
            const first = await ss.getKLNApproachLegList(kprc, app, app.transitions[0]);
            const second = await ss.getKLNApproachLegList(kprc, app, app.transitions[0]);

            expect(identsOf(first)).toEqual(['D250J', 'ARC1E', 'FAFAA', 'MAPAA']);
            expect(identsOf(second)).toEqual(identsOf(first));
        });

        // 6-16: an arc entered from outside starts at its published beginning
        it('starts the arc of the second transition at its published beginning after the first was converted (6-16, #376)', async () => {
            ... the two-transition approach of the issue ...
            const ss = sidStar(facs, at(250, 30));
            await ss.getKLNApproachLegList(kprc, app, app.transitions[0]); // STFIX
            const legs = await ss.getKLNApproachLegList(kprc, app, app.transitions[1]); // ARC1E

            expect(identsOf(legs)[0]).toBe('D225J');
            expect(legs[0].arcData!.beginRadial).toBeCloseTo(225, 3);
        });

        it('leaves the course and the flags of the database legs unchanged (characterization, #376)', async () => {
            // twoTransitions: the approach of the second test; phny: the approach of the first
            await sidStar(facs, at(250, 30)).getKLNApproachLegList(kprc, twoTransitions, twoTransitions.transitions[0]);
            await sidStar(facs, at(250, 30)).getKLNApproachLegList(kprc, phny, phny.transitions[0]);

            expect(twoTransitions.finalLegs[0].course).toBe(225); // the final arc's published beginning
            expect(phny.transitions[0].legs[1].fixTypeFlags).toBe(0); // the transition's arc carries no flag
        });
```

  (`D250J`: the entry on the aircraft's radial 250 at 10 NM, J = 10, 6-6; `D225J`: the published beginning 225 at
  10 NM. Derive any other literal by hand.) Run. Expected: the second conversions FAIL.
- [ ] **Step 2: Fix.** In `getKLNApproachLegList` and `getKLNProcedureLegList`, push copies:
  `legs.push(...iaf.legs.map(leg => ({...leg})))` etc., with a comment `//#376: the legs belong to the facility the SDK
  caches, so the conversion works on copies`.
- [ ] **Step 3: Harness comment.** `test/harness/navdata/procedures.ts:11-15`: drop the claim that SidStar writes into
  legs (keep "every call returns a new object").
- [ ] **Step 4: Verify.** Run the file, `npm test`, `npx tsc --noEmit`. Mutation: remove the copies in
  `getKLNApproachLegList`: the three tests go red.
- [ ] **Step 5: Commit** `fixes #376 convert procedures on copies of the sim's legs`.

```json:metadata
{"files": ["kln90b/data/navdata/SidStar.ts", "test/unit/data/navdata/SidStar.test.ts", "test/harness/navdata/procedures.ts"], "verifyCommand": "npx vitest run test/unit/data/navdata/SidStar.test.ts && npm test", "acceptanceCriteria": ["second conversion equals the first (D250J ARC1E FAFAA MAPAA)", "ARC1E transition starts at D225J after STFIX", "SDK legs unchanged"], "modelTier": "mechanical"}
```

---

### Task 7: #219 a hold that follows its IAF keeps the OBS reminder

**Goal:** When `filterOutDuplicates` drops an unflagged HA, HF, HM or PI leg as a repeat of the last kept leg, the kept
leg asks for OBS (B-2, 6-10). A kept AF leg stays an arc.

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts` (`filterOutDuplicates`)
- Test: `test/unit/data/navdata/SidStar.test.ts` (pin `:869`)

**Acceptance Criteria:**
- [ ] The pin `asks for OBS at an IAF whose hold follows it as a separate leg (#219)` is `it` and passes.
- [ ] A new test: an arc ending at a fix followed by an unflagged hold at the same fix keeps its arc data and asks for
      OBS at the end fix.

**Verify:** `npx vitest run test/unit/data/navdata/SidStar.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** Convert the pin (comment: B-2, 6-10; the hold's OBS reminder moves to the kept leg). Add, in
  `describe('DME arcs in the conversion')` (it has `abc` and the arc helpers):

```ts
    // B-2, 6-10: the reminder before a waypoint that is the basis of a hold; the arc to it stays an arc. The arc carries
    // the IAF flag, so it is kept and the unflagged hold after it is dropped as a repeat (the #219 path)
    it('keeps an arc that ends at a hold fix an arc and asks for OBS at its end (B-2, 6-10, #219)', async () => {
        // transition: IF STFIX, AF HLDFX (the arc, IAF flag), HF HLDFX (unflagged); final: TF FAFAA (FAF), TF MAPAA (MAP)
        ...build it with the describe's abc, fixAt and Leg.AF(..., {flags: FixTypeFlags.IAF}); the aircraft outside the arc...
        const legs = await convert(...);
        const end = legs.find(l => l.wpt.icaoStruct.ident.trim() === 'HLDFX')!;
        expect(legs.some(l => l.arcData?.endFacility.icaoStruct.ident.trim() === 'HLDFX')).toBe(true);
        expect(end.askObs).toBe(true);
    });
```

  Run. Expected: FAIL.
- [ ] **Step 2: Fix.** Do not change leg types. `filterOutDuplicates` collects, besides the filtered list, a
  `Set<FlightPlanLeg>` of kept legs that ask for OBS; `convertToKLN` takes it and computes
  `askObs = this.shouldAskObs(leg.type) || askObsLegs.has(leg)` for every leg it pushes (for an AF, on the end-fix leg;
  `flyOver` follows `askObs` as today). In the `else` branch, when a leg is dropped because `isAlreadyLastInList` and
  its type is HA, HF, HM or PI:

```ts
                } else if (isAlreadyLastInList && this.shouldAskObs(leg.type)) {
                    //#219 B-2, 6-10: the dropped hold or procedure turn leaves its OBS reminder on the kept leg, which
                    //keeps its own type (an arc stays an arc)
                    askObsLegs.add(filtered[filtered.length - 1]);
                }
```

  Keep the existing keep branch unchanged. A second path loses the reminder in the same way by reading: an unflagged
  `AF X` followed by `HF X` is merged by `addArcInfoIfPrevIsSame` into the AF leg, whose type then asks for no OBS.
  It is not #219's shape (IF X); do not fix it here. Write a scratch test, and if it reproduces, report it to the
  controller, who files it.
- [ ] **Step 3: Verify.** Run the file, `npm test`, `npx tsc --noEmit`. Mutations: remove the `askObsLegs.add` (both
  tests red); compute `askObs` from the type alone in `convertToKLN` (both tests red).
- [ ] **Step 4: Commit** `fixes #219 keep the OBS reminder of a hold that follows its IAF as a separate leg`.

```json:metadata
{"files": ["kln90b/data/navdata/SidStar.ts", "test/unit/data/navdata/SidStar.test.ts"], "verifyCommand": "npx vitest run test/unit/data/navdata/SidStar.test.ts && npm test", "acceptanceCriteria": ["pin SidStar:869 passes as it", "arc ending at an unflagged hold stays an arc and asks OBS at its end"], "modelTier": "standard"}
```

---

### Task 8: #220 the MAHP is the hold that ends the missed approach

**Goal:** If the last leg of the missed approach is an HA, HF or HM leg with a fix, that leg is the MAHP (on the copy of
Task 6). The unflagged leg to the same fix before it is dropped as today, so the holding point shows once, with the MAHP
suffix and the OBS reminder. A missed approach that ends otherwise gets no MAHP. The sim's own MAHP bit is still honored.

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts` (`getKLNApproachLegList`)
- Test: `test/unit/data/navdata/SidStar.test.ts`

**Acceptance Criteria:**
- [ ] Missed approach `CA 270, DF MAHAA, HM MAHAA` without flags converts to `..., MAPAA (MAP), MAHAA (MAHP, askObs
      true)` with MAHAA once.
- [ ] Missed approach `CA 270, DF MAHAA` (no hold) gives MAHAA without a fix type.
- [ ] The characterization `lists the MAP and the holding point at the same fix as two waypoints` stays green.

**Verify:** `npx vitest run test/unit/data/navdata/SidStar.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** Add a describe `'the MAHP of a missed approach (#220)'` after
  `a missed approach that holds at the MAP (characterization)`:

```ts
describe('the MAHP of a missed approach (#220)', () => {
    // The sim sets no MAHP flag (the #220 comment: HKKI RNAV 24 ends CA, DF TEXAV, HM TEXAV). 6-5 to 6-7: the holding
    // point of the missed approach shows once with its suffix; 6-11: the OBS reminder before it. The KLN 89 lists it
    // once, last (checked in the KLN 89 trainer, 2026-10-15)
    it('makes the hold that ends the missed approach the MAHP and lists it once (6-5, 6-7, 6-11, #220)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType, l.askObs])).toEqual([
            ['FAFAA', KLNFixType.FAF, false], ['MAPAA', KLNFixType.MAP, false], ['MAHAA', KLNFixType.MAHP, true],
        ]);
    });

    // A missed approach that does not end in a hold gets no MAHP (maintainer ruling)
    it('marks no MAHP when the missed approach does not end in a hold (characterization, #220)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP], ['MAHAA', undefined],
        ]);
    });
});
```

  Run. Expected: the first FAILS (MAHAA has no fix type), the second passes (a guard).
- [ ] **Step 2: Fix.** In `getKLNApproachLegList`, after copying the missed legs (Task 6): find the last missed leg that
  `isLegSupported`; if its type is HA, HF or HM, `fixTypeFlags |= FixTypeFlags.MAHP` on the copy. Comment `//#220: the
  sim sets no MAHP flag; the hold that ends the missed approach is the MAHP (maintainer ruling)`.
- [ ] **Step 3: Verify.** Run the file, `npm test`, `npx tsc --noEmit`. Mutations: drop the type test (derive always):
  the no-hold test and `SidStar.test.ts:924` go red; drop the derivation: the first test goes red.
- [ ] **Step 4: Docs and commit.** `docs/architecture.md:476` (SidStar): the MAHP derived from a missed-approach hold.
  Commit `fixes #220 derive the MAHP from the hold that ends the missed approach`.

```json:metadata
{"files": ["kln90b/data/navdata/SidStar.ts", "test/unit/data/navdata/SidStar.test.ts", "docs/architecture.md"], "verifyCommand": "npx vitest run test/unit/data/navdata/SidStar.test.ts && npm test", "acceptanceCriteria": ["CA DF HM unflagged gives MAHAA once as MAHP with askObs", "no hold gives no MAHP", "MAP/holding-point characterization green"], "modelTier": "standard"}
```

---

### Task 9: #131 two arcs of different radius stay two arcs

**Goal:** Two AF legs merge only when their navaid is the same and their radius differs by at most 0.1 NM (step-downs
on one arc, 6-18). Otherwise the first arc ends at its own end fix, which stays a list waypoint, and the second arc gets
an entry waypoint at its published beginning (its begin radial and radius), named as 6-6 names arc entries.

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts` (`filterOutDuplicates` `bothAreAF`, `mergeAFsIfNecessary`, `convertToKLN`,
  `getArcEntryData`)
- Test: `test/unit/data/navdata/SidStar.test.ts` (pin `:719`, sibling `:702`)

**Acceptance Criteria:**
- [ ] The pin `flies the first arc at its own radius of 13 NM (#131)` is `it` and passes.
- [ ] The converted STAR is `D270M, ARC1E, D225J, ARC2E, FINAL`: the first arc (13 NM) ends at ARC1E, the second (10 NM)
      starts at `D225J` on radial 225.
- [ ] `consecutive arcs around the same navaid are one arc (a6acb5c)` and `flies three arcs around one navaid as one
      arc that ends at the FAF` stay green.

**Verify:** `npx vitest run test/unit/data/navdata/SidStar.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** Convert the pin (comment: 6-16 to 6-18; each arc at its published distance; how the unit joins
  two radii is not described, so the joining leg is a characterization). Add to the same describe:

```ts
        // 6-6: an arc entry is named D, the magnetic radial and the distance as a letter (M = 13, J = 10). The second
        // arc starts at its published beginning, joined to the end of the first by a straight leg (characterization)
        it('lists the first arc to ARC1E and the second from its beginning on radial 225 (characterization, #131)', async () => {
            const legs = await convertStar();

            expect(identsOf(legs)).toEqual(['D270M', 'ARC1E', 'D225J', 'ARC2E', 'FINAL']);
            const second = legs.find(l => l.arcData?.endFacility.icaoStruct.ident === 'ARC2E')!;
            expect(second.arcData!.beginRadial).toBeCloseTo(225, 3);
            expect(radiusNm(second)).toBeCloseTo(10, 1);
        });
```

  (`D270M`: the aircraft is on radial 270 at 25 NM, the first arc 270→225 at 13 NM, so its entry is on radial 270, 13 =
  M. Check the sibling `:702`: it asserts the second arc at 10 NM and ARC2E in the list; it stays.) Run. Expected: FAIL.
- [ ] **Step 2: Merge only one arc.** A helper `sameArc(a, b)`: `ICAO.valueEquals(a.originIcaoStruct,
  b.originIcaoStruct) && Math.abs(a.rho - b.rho) <= UnitType.NMILE.convertTo(0.1, UnitType.METER)`. `bothAreAF`
  becomes `leg.type === AF && next.type === AF && sameArc(leg, next)`; the loop of `mergeAFsIfNecessary` stops at the
  first previous AF that is not `sameArc` with the leg it follows. Note: `filterOutDuplicates` sees the list after
  `isLegSupported`, so the CI leg is already gone and the two AFs are adjacent.
- [ ] **Step 3: Keep ARC1E and enter arc 2 at its beginning.** In `convertToKLN`, for an AF leg: when the previous kept
  KLN leg is the end facility of an arc that ends at the previous leg (`klnLegs[n-2]?.arcData?.endFacility` is
  `klnLegs[n-1].wpt`), do not pop it; push the entry of this arc at its published beginning. Give `getArcEntryData` a
  parameter `atBeginning: boolean` that skips the aircraft-closest entry and uses `beginPoint` / `beginRadial`.
  Comment `//#131: a second arc of another radius starts at its published beginning; the first arc's end stays`.
- [ ] **Step 4: Verify.** Run the file, `npm test`, `npx tsc --noEmit`. Mutations: `sameArc` ignores `rho`: the pin and
  the new test go red; `atBeginning` ignored (closest point): the new test goes red (the entry name changes).
- [ ] **Step 5: Docs and commit.** `docs/architecture.md:476`: arcs merge only on one navaid and radius. Commit
  `fixes #131 keep two arcs of different radius around one navaid as two arcs`.

```json:metadata
{"files": ["kln90b/data/navdata/SidStar.ts", "test/unit/data/navdata/SidStar.test.ts", "docs/architecture.md"], "verifyCommand": "npx vitest run test/unit/data/navdata/SidStar.test.ts && npm test", "acceptanceCriteria": ["pin SidStar:719 passes as it", "STAR converts to D270M ARC1E D225J ARC2E FINAL with radii 13 and 10", "step-down merge tests green"], "modelTier": "standard"}
```

---

### Task 10: #347 removing a procedure updates the flight planner mirror

**Goal:** `Flightplan.removeProcedure` and `removeProcedures` publish `flightplanChanged` when they removed at least one
leg and publishing is enabled. `load` filters the procedures itself and publishes once.

**Files:**
- Modify: `kln90b/data/flightplan/Flightplan.ts` (`removeProcedures`, `removeProcedure`, `load`)
- Test: `test/render/services/WTFlightplanSync.test.ts`

**Acceptance Criteria:**
- [ ] DELETE APR with the active waypoint in front of the approach leaves plan 0 of the `"kln90b"` planner as
      `ENRBB, ENRAA, KPRC`.
- [ ] `GpsAcquisition.test.ts` stays green (no publish when nothing was removed).
- [ ] `load` publishes once.

**Verify:** `npx vitest run test/render/services/WTFlightplanSync.test.ts test/render/GpsAcquisition.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Test.** Add the draft `inventory\347-pin-draft.test.ts.txt` to `WTFlightplanSync.test.ts` as
  `it('drops the approach from plan 0 after DELETE APR (#347)'` in a describe of its own (the public contract: plan 0
  always matches FPL 0, CLAUDE.md and the wiki page Accessing the Flight Plan; not a manual page, so no page number),
  using the file's `plannerOf`/`identsOf`. Run. Expected: FAIL (plan 0 still holds the approach).
- [ ] **Step 2: Fix.**

```ts
    public removeProcedures(): void {
        this.removeLegs(leg => leg.type !== KLNLegType.USER);
    }

    public removeProcedure(type: KLNLegType): void {
        this.removeLegs(leg => leg.type === type);
    }

    /**
     * #347: removes the legs and publishes, so that the flight planner mirror follows. Only when legs went: a publish at
     * every power-on would rebuild the SDK planner for nothing
     */
    private removeLegs(predicate: (leg: KLNFlightplanLeg) => boolean): void {
        const kept = this.legs.filter(leg => !predicate(leg));
        if (kept.length === this.legs.length) {
            return;
        }
        this.legs = kept;
        if (this.publishingEnabled) {
            this.publisher.pub("flightplanChanged", this);
        }
    }

    public load(fpl: Flightplan) {
        this.legs = fpl.legs.filter(leg => leg.type === KLNLegType.USER);
        this.publisher.pub("flightplanChanged", this);
    }
```

- [ ] **Step 3: Verify.** Run the Verify command, `npm test`, `npx tsc --noEmit`. Mutations: drop the publish in
  `removeLegs` (the new test red); drop the "only when legs went" check (report whether `GpsAcquisition.test.ts:197` and
  `:203` go red, as the inventory measured).
- [ ] **Step 4: Docs and commit.** `docs/architecture.md:375`: `removeProcedures()` publishes when it removed legs.
  Commit `fixes #347 publish the removal of a procedure so the flight planner mirror follows FPL 0`.

```json:metadata
{"files": ["kln90b/data/flightplan/Flightplan.ts", "test/render/services/WTFlightplanSync.test.ts", "docs/architecture.md"], "verifyCommand": "npx vitest run test/render/services/WTFlightplanSync.test.ts test/render/GpsAcquisition.test.ts && npm test", "acceptanceCriteria": ["plan 0 is ENRBB ENRAA KPRC after DELETE APR", "GpsAcquisition green", "load publishes once"], "modelTier": "mechanical"}
```

---

### Task 11: #301 CTR 1 and CTR 2 reset when the flight plan page is left

**Goal:** `memory.ctrPage` stores the left FPL page instance of the computation. A shared check, run in the display
ticks of CTR 1 and CTR 2, resets the state when the left page is not that instance: CTR 1 offers the computation again,
CTR 2 shows its empty page.

**Files:**
- Create: `kln90b/pages/right/CtrState.ts` (the shared check)
- Modify: `kln90b/data/VolatileMemory.ts` (`CtrPageState.lastFplPage`, the default and the reset),
  `kln90b/pages/right/Ctr1Page.tsx` (`tick`), `kln90b/pages/right/Ctr2Page.tsx` (`tick`)
- Test: `test/render/pages/right/Ctr2Page.test.ts` (pin `:202`), `test/render/data/VolatileMemory.test.ts:188`

**Acceptance Criteria:**
- [ ] The pin `returns CTR 1 and CTR 2 to the start state when the plan page is left and selected again (5-26) (#301)`
      is `it` and passes.
- [ ] Turning only the right page away and back keeps the computation.
- [ ] `VolatileMemory.test.ts:188` expects `lastFplPage: null`.

**Verify:** `npx vitest run test/render/pages/right/Ctr1Page.test.ts test/render/pages/right/Ctr2Page.test.ts test/render/data/VolatileMemory.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** Convert the pin (comment: 5-26). Add to `Ctr2Page.test.ts`:

```ts
    // The AVsoftech trainer keeps the computation when only the right page is turned away and back
    it('keeps the computation when only the right page is turned away and back (characterization, #301)', async () => {
        const unit = await computed();
        await unit.panel.selectPage('R', 'REF');
        await unit.panel.selectPage('R', 'CTR 1');

        expect(right()[0]).toBe(' 2 NEW WPTS');
    });
```

  (`computed()` leaves two Center waypoints, BGD00 and GCK00.) Run. Expected: the pin FAILS.
- [ ] **Step 2: Implement.** `CtrPageState` gets `lastFplPage: FplPage | null` (import type only, to avoid a new
  cycle: `import type`). `kln90b/pages/right/CtrState.ts`:

```ts
/**
 * #301 5-26: the CTR pages go back to their start state once the flight plan page on the left is left. Pages are
 * recreated on every knob step, so another instance means the page was left. Run in the display ticks of CTR 1 and
 * CTR 2. Returns the FPL page on the left, or null.
 */
export function syncCtrState(props: PageProps): FplPage | null {
    const page = (props.pageManager.getCurrentPage() as MainPage).getLeftPage();
    const state = props.memory.ctrPage;
    if (!(page instanceof FplPage)) {
        resetCtrState(state, CtrState.NO_FPL, null, null);
        return null;
    }
    if (page !== state.lastFplPage) {
        resetCtrState(state, CtrState.FPL, page, props.memory.fplPage.flightplans[page.fplIdx]);
    }
    return page;
}

export function resetCtrState(state: CtrPageState, to: CtrState, page: FplPage | null, fpl: Flightplan | null): void {
    state.state = to;
    state.lastFplPage = page;
    state.lastFpl = fpl;
    state.waypoints = [];
}
```

  `Ctr1Page.tick` calls it first and draws from the state as today (replace its own reset blocks). `Ctr2Page` gets a
  `tick(blink)` that calls it and, when the waypoints went, sets `numPages = 1`, `requiresRedraw = true` and re-renders
  its empty page (follow how `Ctr2Page` renders: `render()` picks the empty page when `waypoints.length === 0`; a
  redraw of a different layout may need the page's own ref; report what you did). Keep `super.tick(blink)`.
  `VolatileMemory`: the default and `reset()` set `lastFplPage: null`.
- [ ] **Step 3: Verify.** Run the Verify command, `npm test`, `npx tsc --noEmit`. Mutations: compare `fplIdx` instead
  of the instance (the pin red); skip the call in `Ctr2Page.tick` (the pin red).
- [ ] **Step 4: Commit** `fixes #301 reset CTR 1 and CTR 2 when the flight plan page on the left is left`.

```json:metadata
{"files": ["kln90b/pages/right/CtrState.ts", "kln90b/data/VolatileMemory.ts", "kln90b/pages/right/Ctr1Page.tsx", "kln90b/pages/right/Ctr2Page.tsx", "test/render/pages/right/Ctr2Page.test.ts", "test/render/data/VolatileMemory.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/Ctr1Page.test.ts test/render/pages/right/Ctr2Page.test.ts test/render/data/VolatileMemory.test.ts && npm test", "acceptanceCriteria": ["pin Ctr2:202 passes as it", "right page round trip keeps the computation", "VolatileMemory test expects lastFplPage null"], "modelTier": "standard"}
```

---

### Task 12: #348 CTR resets when the plan changes after the computation

**Goal:** `memory.ctrPage` also stores a copy of the plan's leg list from the computation. `syncCtrState` (display
ticks) and CTR 1's insert ENT reset the state when the legs differ (count or instance). A computation that finishes
after a reset is discarded. The #161 room check at insertion goes.

**Files:**
- Modify: `kln90b/pages/right/CtrState.ts`, `kln90b/data/VolatileMemory.ts` (`computedLegs`),
  `kln90b/pages/right/Ctr1Page.tsx` (`calculateCenterWaypoints`, `enter`, `insertIntoFpl`)
- Test: `test/render/pages/right/Ctr1Page.test.ts` (`:346`), `test/render/data/VolatileMemory.test.ts`

**Acceptance Criteria:**
- [ ] The draft of #348 (`inventory\348-pin-draft.test.ts.txt`): after FB00 is inserted at index 0 between the two ENTs,
      FPL 1 is `FB00, KAAA, KBBB` and CTR 1 offers PRESS ENT TO COMPUTE.
- [ ] The same edit followed by a display tick resets CTR 1 before ENT.
- [ ] `Ctr1Page.test.ts:346` becomes the test of the edit between the two ENTs (back to the computation, nothing
      inserted).

**Verify:** `npx vitest run test/render/pages/right/Ctr1Page.test.ts test/render/pages/right/Ctr2Page.test.ts test/render/data/VolatileMemory.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** Turn the draft into `it('offers the computation again when the plan is edited between the two ENTs (characterization, #348)'`
  (assert FPL 1 `['FB00', 'KAAA', 'KBBB']` and CTR 1 `['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']`).
  Add a variant that advances one display tick (`await vi.advanceTimersByTimeAsync(250)`) after the edit and asserts
  CTR 1 shows PRESS ENT TO COMPUTE before any ENT. Rewrite `:346` into the same behavior for its 28-waypoint setup
  (nothing inserted, 29 legs, CTR 1 offers the computation), title
  `'characterization: offers the computation again when the plan has grown since the computation (#348)'`. These are
  characterizations: 5-27 describes a recomputation after a change, the reset itself follows the AVsoftech trainer.
  Run. Expected: FAIL.
- [ ] **Step 2: Implement.**
  - `CtrPageState.computedLegs: KLNFlightplanLeg[] | null` (default and reset `null`); `resetCtrState` clears it.
  - `calculateCenterWaypoints` stores `[...fpl.getLegs()]` at its start, and after every `await` returns without
    writing when `state.lastFplPage` or `state.computedLegs` changed (a reset happened meanwhile).
  - `syncCtrState`: when the state is CALCULATED (or FULL) and `legsChanged(state)`, reset to FPL.

```ts
function legsChanged(state: CtrPageState): boolean {
    const now = state.lastFpl?.getLegs() ?? [];
    const then = state.computedLegs ?? [];
    return now.length !== then.length || now.some((leg, i) => leg !== then[i]);
}
```

  - `Ctr1Page.enter`, case CALCULATED: `syncCtrState(this.props)` first; if the state is no longer CALCULATED, return
    `Handled_Keep_Focus` without inserting.
  - `insertIntoFpl`: remove the #161 room check (the plan is the computed one, which passed it); keep the comment's
    reference in the computation's check.
  - `VolatileMemory.test.ts:188`: add `computedLegs: null`.
- [ ] **Step 3: Verify.** Run the Verify command, `npm test`, `npx tsc --noEmit`. Mutations: `legsChanged` returns
  false (the tests red); drop the ENT-time check (the no-tick test red, the tick test stays green: report both).
- [ ] **Step 4: Commit** `fixes #348 reset CTR 1 when the plan changed after the Center waypoints were computed`.

```json:metadata
{"files": ["kln90b/pages/right/CtrState.ts", "kln90b/data/VolatileMemory.ts", "kln90b/pages/right/Ctr1Page.tsx", "test/render/pages/right/Ctr1Page.test.ts", "test/render/data/VolatileMemory.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/Ctr1Page.test.ts test/render/pages/right/Ctr2Page.test.ts test/render/data/VolatileMemory.test.ts && npm test", "acceptanceCriteria": ["edit between ENTs: FPL 1 FB00 KAAA KBBB, CTR 1 offers compute", "edit then a tick resets before ENT", "Ctr1:346 rewritten to the reset"], "modelTier": "standard"}
```

---

### Task 13: #349 CTR 1 never inserts a Center waypoint inside an approach

**Goal:** A shared helper says whether a waypoint may be added on the leg to plan index `toIdx`: not when the from and
the to leg are both approach legs (6-7). CTR 1 drops crossings on such legs.

**Files:**
- Modify: `kln90b/services/FlightplanUtils.ts` (new `mayAddWaypointBefore`), `kln90b/pages/right/Ctr1Page.tsx`
  (`calculateCenterWaypoints`)
- Test: `test/render/pages/right/Ctr1Page.test.ts`, `test/unit/services/FlightplanUtils.test.ts`

**Acceptance Criteria:**
- [ ] The draft of #349: FPL 0 KAAA, KDDD with RNAV 36 (IAFDD 41.0 N, FAFDD 44.5 N): CTR 1 computes ` 0 NEW WPTS` and
      the plan stays KAAA, IAFDD, FAFDD, MAPDD, KDDD.
- [ ] `mayAddWaypointBefore` is false between two APP legs, true into the IAF, true from the last approach leg to the
      airport, true on en-route legs.

**Verify:** `npx vitest run test/render/pages/right/Ctr1Page.test.ts test/unit/services/FlightplanUtils.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Tests.** Unit tests of the helper (four cases above; spec 6-7 for the two APP cases, characterization
  for the others). The draft `inventory\349-pin-draft.test.ts.txt` as
  `it('inserts no Center waypoint between two approach waypoints (6-7, #349)'` asserting CTR 1's first row
  `' 0 NEW WPTS'` after the computation and the plan unchanged after ENT. Run. Expected: FAIL.
- [ ] **Step 2: Implement.**

```ts
/**
 * #349, #377 6-7: whether a waypoint may be added on the leg to the plan index `toIdx`: not between two approach
 * waypoints. The leg into the IAF and the leg from the approach to the airport may take one
 */
export function mayAddWaypointBefore(legs: KLNFlightplanLeg[], toIdx: number): boolean {
    return !(legs[toIdx - 1]?.type === KLNLegType.APP && legs[toIdx]?.type === KLNLegType.APP);
}
```

  In `calculateCenterWaypoints`, filter `intersections` by `mayAddWaypointBefore(fplLegs, intersection.legIdx)` before
  the room check and the creation.
- [ ] **Step 3: Verify.** Run, `npm test`, `npx tsc --noEmit`. Mutation: the filter removed (the render test red).
- [ ] **Step 4: Commit** `fixes #349 insert no Center waypoint between the waypoints of an approach`.

```json:metadata
{"files": ["kln90b/services/FlightplanUtils.ts", "kln90b/pages/right/Ctr1Page.tsx", "test/render/pages/right/Ctr1Page.test.ts", "test/unit/services/FlightplanUtils.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/Ctr1Page.test.ts test/unit/services/FlightplanUtils.test.ts && npm test", "acceptanceCriteria": ["CTR 1 computes 0 NEW WPTS for a crossing inside the approach, plan unchanged", "mayAddWaypointBefore false between APP legs, true into IAF, from approach to airport, en route"], "modelTier": "mechanical"}
```

---

### Task 14: #377 REF never offers a waypoint inside an approach

**Goal:** `RefPage.findClosestPoint` skips legs on which `mayAddWaypointBefore` is false; with no leg left it gives
INVALID REF (5-21, C-1).

**Files:**
- Modify: `kln90b/pages/right/RefPage.tsx` (`findClosestPoint`)
- Test: `test/render/pages/right/RefPage.test.ts`

**Acceptance Criteria:**
- [ ] The draft of #377 (`inventory\ref-into-approach-draft.test.ts.txt`): REF TXK next to the IAFDD-FAFDD leg gives
      INVALID REF (no other leg has a perpendicular to TXK), FPL 0 unchanged, no row between IAFDD and FAFDD, no user
      waypoint TXKA created.
- [ ] Existing REF tests green.

**Verify:** `npx vitest run test/render/pages/right/RefPage.test.ts` → all pass; `npm test` → green.

**Steps:**

- [ ] **Step 1: Test.** Turn the draft into `it('offers no reference waypoint between two approach waypoints (6-7, #377)'`.
  Work out by hand which leg is the closest eligible one for TXK (47.5 N 10.3 E) in the draft's plan (KAAA 46.0 N,
  IAFDD 47.0 N, FAFDD 48.0 N, MAPDD 48.2 N, KDDD 48.3 N, all on 10 E): the eligible legs are KAAA→IAFDD (TXK's
  perpendicular falls beyond IAFDD, so it is out per #299) and MAPDD→KDDD (beyond as well), so the expected answer is
  `INVALID REF` on the status line with the plan unchanged and no user waypoint `TXKA` created. Verify that reasoning
  against `findClosestPoint`'s end checks before asserting; report if it differs. Run. Expected: FAIL.
- [ ] **Step 2: Fix.** In the loop of `findClosestPoint`, `if (!mayAddWaypointBefore(legs, i)) continue; //#377 6-7`.
- [ ] **Step 3: Verify.** Run, `npm test`, `npx tsc --noEmit`. Mutation: the `continue` removed (the test red).
- [ ] **Step 4: Commit** `fixes #377 offer no reference waypoint between the waypoints of an approach`.

```json:metadata
{"files": ["kln90b/pages/right/RefPage.tsx", "test/render/pages/right/RefPage.test.ts"], "verifyCommand": "npx vitest run test/render/pages/right/RefPage.test.ts && npm test", "acceptanceCriteria": ["REF TXK next to the approach gives INVALID REF, FPL 0 unchanged, no TXKA", "existing REF tests green"], "modelTier": "mechanical"}
```

---

## After the tasks

- The controller runs a final whole-branch review (session model), checks that no `#NEW-` placeholder or stale comment
  about the old limit remains (`grep -rn '30 legs\|insertLeg(idx - 1' kln90b test docs`), and runs `npm test`,
  `npx tsc --noEmit` and `npm run build` on the integrated branch.
- The maintainer approves before anything is merged into `master`. The wiki note on `GPS FLIGHT PLAN WP COUNT` (spec
  section 7) goes to the maintainer.
