# Waypoint Sequencing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make turn anticipation and waypoint sequencing follow the KLN 89 trainer: capped lead, bisector sequencing,
the off-course rules, fixing #404, #375 and #157.

**Architecture:** The geometry goes into a new pure module, `kln90b/data/navdata/SequencingGeometry.ts`, with unit tests.
The per-waypoint state (the latched turn plan, whether the waypoint's own turn has started) lives on `ActiveWaypoint`
and is cleared whenever the active waypoint changes. The turn-anticipation branch of `NavCalculator.tick` is rebuilt in
four steps on top of it, each step with flight tests whose expectations come from the trainer record.

**Tech Stack:** TypeScript (es2017), `@microsoft/msfs-sdk` (`GeoCircle`, `GeoPoint`, `NavMath`, `UnitType`), Vitest
(unit, render and flight stages).

**Spec:** `docs/superpowers/specs/2026-10-20-waypoint-sequencing-design.md` (read it first; this plan argues from it).
Trainer evidence: `docs/kln89-trainer-record.md` (block 2026-10-20) and `docs/kln89-trainer-data/2026-10-20/`.

## Global Constraints

- Work on the branch `investigate-375-157`; never push.
- `target: es2017`; the calculations stay at 1 Hz (`TICK_TIME_CALC`).
- No H event, LVar, panel.xml key or SimVar changes name or meaning (CLAUDE.md, public contract).
- Services keep no mutable state of their own: new state goes on `ActiveWaypoint` (or `NavPageState`) and is reset in
  `VolatileMemory.reset`.
- Angles are true unless the name says `Mag`; distances in NM unless the name says otherwise.
- Comments cite the trainer as "checked in the KLN 89 trainer, 2026-10-20" and Pilot's Guide pages (4-8, 4-9, 5-33).
  Never copy manual text.
- The roll-in distance (`distanceToAchieveBankAngleChange`) stays on top of the lead, with the comment the spec's 3.1
  describes (deliberate departure: 1 Hz calculation, autopilot and aircraft lag, user-reported overshoots, displayed
  and SimVar values cannot be split).
- The abeam turn gets the comment of spec 3.3 (faithful, only up to 4 NM off course in practice when hand flying, a
  coupled default autopilot steers back toward the waypoint until the bisector).
- Constants (exact values): lead cap 60 s of ground speed; half the inbound leg; on/off the leg 4.0 NM of |XTK| to the
  active leg; turn-plan gate 2.8 NM; decision 20 s of ground speed before the turn point; alerts 20 s (turn plan,
  unchanged `WPT_ALERT_WITH_TURN_ANTI`), 15 s before the abeam line (abeam plan), 36 s before the abeam line (off the
  leg).
- `xtkToActive >= 0` shows FLY L (`Nav3Page.tsx:135`): a right turn's abeam XTK is negative, a left turn's positive.
- Test expectations come from geometry and the trainer record, never from the code under test; a test near a
  threshold keeps clear of it (gate tests at 2.0 and 3.5 NM).
- Each commit: `npm test`, `npx tsc --noEmit` and `npm run build` pass; each ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. American English, no counts of growing collections in prose.
- Commit messages: `references #NN ...` while an issue is partly done, `fixes #NN ...` in the commit that completes it
  (the maintainer waived one-commit-per-issue for this work).

## Review Focus

1. **A leg activated inside the lead or past the decision point** (Direct To close to the waypoint, a FPL edit, a
   power-up): the waypoint is decided at once and, on the turn plan, the turn is flown, never skipped. Tests in Task 2
   (not skipped) and Task 4 (decided at once).
2. **The aircraft already past the bisector when the test arms** (an inside offset on a near-180° capped turn): it
   sequences at once, it does not stay stuck on the waypoint. Test in Task 3.
3. **A power cycle in the middle of a turn or after a decision:** no plan or own-turn flag survives. Test in Task 3.
4. **A previous turn still on the stack after sequencing** (#375's mechanism, #156): it keeps the alert on but can never
   sequence the next waypoint. The pinned `skippedLeg.test.ts` holds it (Task 3).
5. **DME arc ends and the MAP:** the turn at the end of an arc still starts from the DTK at the arc end, the MAP is
   never sequenced, fly-over and duplicated waypoints keep overflying. The existing `dmeArc.test.ts`,
   `duplicateWaypoint.test.ts` and the NavCalculator render tests (`no sequencing past the MAP`, `fly-over waypoint`)
   must stay green without loosening; a task that has to change one of them stops and reports instead.

---

### Task 1: Sequencing geometry

**Files:**
- Create: `kln90b/data/navdata/SequencingGeometry.ts`
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts` (`findClosestLegIdx`, `isPointOnCircleBetween`,
  `isPointOnArcBetween` move their segment logic into `segmentDistance`)
- Test: `test/unit/data/navdata/SequencingGeometry.test.ts`

**Interfaces:**
- Produces (all pure, no state, positions as `LatLonInterface`, results in NM unless noted):
  - `export const LEAD_CAP_TIME: Seconds = 60;`
  - `export interface TurnLead { lead: NauticalMiles; radius: NauticalMiles; }`
  - `export function turnLead(groundspeed: Knots, turnAngle: Degrees, inboundLeg: NauticalMiles): TurnLead` —
    r = `NavMath.turnRadius(gs, bankeAngleForStandardTurn(gs))` in NM; uncapped = r·tan(θ/2);
    lead = min(uncapped, gs·60 s, inboundLeg / 2); radius = lead < uncapped ? lead / tan(θ/2) : r. A turn angle of 0
    gives lead 0 and radius r.
  - `export function alongTrackDistance(path: GeoCircle, wpt: LatLonInterface, pos: LatLonInterface): NauticalMiles` —
    the distance along `path` from the projection of `pos` to the projection of `wpt`, positive before the waypoint
    and negative past it (use `path.closest` for both and `path.distanceAlong`; a value above half the circle is the
    negative side).
  - `export function bisectorSide(wpt: LatLonInterface, inboundDtk: Degrees, nextDtk: Degrees, pos: LatLonInterface): NauticalMiles` —
    the signed distance of `pos` from the bisector line: the great circle through `wpt` with bearing m + 90, where
    m = inboundDtk + NavMath.diffAngle(inboundDtk, nextDtk) / 2. Negative on the inbound side, positive past it
    (a point ahead of the waypoint on bearing m is positive).
  - `export function segmentDistance(from: LatLonInterface, to: LatLonInterface, arc: GeoCircle | undefined, pos: LatLonInterface): NauticalMiles` —
    the perpendicular distance to the leg while the foot lies between `from` and `to`, otherwise the distance to
    `from` (today's `findClosestLegIdx` rule; for an arc, today's `isPointOnArcBetween`). Unsigned.

- [ ] **Step 1: Write the failing unit tests** (expected values computed by hand from the textbook formulas, as
  literals; tolerance 0.01 NM unless noted)

```ts
describe('turnLead (KLN 89 trainer, 2026-10-20)', () => {
    it('is r·tan(θ/2) below the caps: 120° at 239 kt', () => {
        const t = turnLead(239, 120, 30);
        expect(t.lead).toBeCloseTo(3.09, 1);   // 25° bank radius 1.785 NM × tan 60°
        expect(t.radius).toBeCloseTo(1.785, 2);
    });
    it('caps the lead at 60 s of ground speed: 150° at 239 kt', () => {
        const t = turnLead(239, 150, 30);
        expect(t.lead).toBeCloseTo(3.983, 2);  // 239 / 60; uncapped 6.66
        expect(t.radius).toBeCloseTo(3.983 / Math.tan(75 * Math.PI / 180), 2);  // 1.067, tangent to both legs
    });
    it('caps the lead at half the inbound leg: 171° after 2.0 NM at 119 kt', () => {
        const t = turnLead(119, 171, 2.0);
        expect(t.lead).toBeCloseTo(1.0, 2);
        expect(t.radius).toBeCloseTo(1.0 / Math.tan(85.5 * Math.PI / 180), 3);
    });
    it('uses the standard-rate radius below 25° of bank: 120° at 119 kt', () => {
        expect(turnLead(119, 120, 30).lead).toBeCloseTo(1.09, 1);  // 0.628 NM × tan 60°
    });
});
// alongTrackDistance: a leg on course 090 through W (47 N, 9 E): 3 NM before W and 2 NM to the side → 3.0;
//   1 NM past W → -1.0.
// bisectorSide: inbound 090, next 000 (90° left) at W: 1 NM back along the inbound → -0.707; 1 NM out along the next
//   leg → +0.707; on bearing 315 from W (on the line) → 0 within 0.01.
// segmentDistance: leg A (47 N, 8 E) → B (47 N, 9 E): 2 NM north of the midpoint → 2.0; 3 NM east of B → the
//   distance to A (the "otherwise" rule as findClosestLegIdx has it today).
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project unit test/unit/data/navdata/SequencingGeometry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the four functions in `kln90b/data/navdata/SequencingGeometry.ts`**, and make
  `ActiveWaypoint.findClosestLegIdx` use `segmentDistance` (move `isPointOnCircleBetween`/`isPointOnArcBetween` into
  the module as non-exported helpers). Its comparison stays in the same unit, so its result does not change.

- [ ] **Step 4: Run the unit tests and the ActiveWaypoint tests**

Run: `npx vitest run --project unit test/unit/data/navdata/SequencingGeometry.test.ts test/unit/data/flightplan/ActiveWaypoint.test.ts`
Expected: PASS.

- [ ] **Step 5: Full checks and commit**

Run `npm test`, `npx tsc --noEmit`, `npm run build`. Commit: `references #404 #375 #157 add the sequencing geometry`.

---

### Task 2: Lead limits (#404)

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts` (turn-anticipation branch, around `:205-252`)
- Modify: `test/flight/flights/largeTurn.test.ts`, `test/flight/flights/rollSteering.test.ts` (expectations of the
  capped turns only, see Step 5)
- Modify: `docs/architecture.md` (the sequencing bullets, `:466-471`)
- Test: `test/flight/flights/turnLead.test.ts` (create)

**Interfaces:**
- Consumes: `turnLead` (Task 1).
- Produces: none for later tasks besides the behavior.

- [ ] **Step 1: Write the failing flight tests** in `turnLead.test.ts`. Each world is built with `airport()`/`vor()`
  and `pointFrom`, magvar 0, coupled autopilot, turn anticipation on (default). The roll-in is derived in the test from
  its definition, not imported: bank = min(atan(gs / 362.1), 25°), roll-in = bank / 5 °/s × gs / 3600.

```ts
it('starts a 171° turn at 239 kt 4.0 NM before the waypoint plus the roll-in (KLN 89 trainer, 2026-10-20, #404)', ...)
//   A 28 NM leg on course, start 12 NM before; DTK switch (angleBetween(dtk, nextCourse) < 1) at a straight
//   distance between 3.983 + 0.332 and 3.983 + 0.332 + 0.066 + 0.02 NM; the waypoint is still active then.
it('starts a 171° turn after a 2.0 NM leg at 119 kt 1.0 NM before the waypoint plus the roll-in, and flies it (#404)', ...)
//   Plan A, B, C, D with B 2.0 NM before C on the same course (B has no turn) and 171° at C; DTK switch at
//   1.0 + 0.120 to 1.0 + 0.120 + 0.033 + 0.02 NM from C; C stays active at the switch (no skip).
it('flies a Direct To activated inside the lead instead of skipping it (#404)', ...)
//   Standard route at 120 kt; Direct To ABC from 0.25 NM before it on the inbound course (inside 0.197 + 0.12):
//   one second later ABC is still active and turnStackLength(unit) > 0.
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project flight test/flight/flights/turnLead.test.ts`
Expected: FAIL (the 171° switch comes about 22.6 NM out; the short leg and the Direct To skip the waypoint).

- [ ] **Step 3: Implement in `NavCalculator.tick`**: take `{lead, radius}` from
  `turnLead(gs, turnAngle, inboundLeg)`, where `inboundLeg` is the distance from `fromLeg.wpt` to `toLeg.wpt` (for an
  arc, the arc length along `fromLeg.path`). Use `lead` where `turnAnticipationDistance` is used today and pass
  `radius` to `calculateTurnCircle`, so that start and end of the turn are `lead` before and after the waypoint. Remove
  the `turnAnticipationDistance > nav.distToActive` skip: the turn is pushed in every case. Add the roll-in comment
  of the Global Constraints at the roll-in term.

- [ ] **Step 4: Run the new tests**

Run: `npx vitest run --project flight test/flight/flights/turnLead.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the tests that encode the old rule, then run the suite**

- `largeTurn.test.ts` (#76): the 175° turn after a 10 NM leg at 120 kt is now capped at 2.0 NM (60 s); it is flown,
  not skipped. Rewrite it to assert the DTK switch at 2.0 + 0.120 to 2.0 + 0.120 + 0.033 + 0.02 NM before ABC with ABC
  still active, and keep its no-CDI-kick assertion (`xtkSteps < 0.05`). The comment cites the trainer record and #404.
- `rollSteering.test.ts`: S8e (150° at 120 kt, capped at 2.0) and S8f (150° at 240 kt, capped at 4.0) and S10/S11
  (150° at 120 kt) now fly a capped, tighter circle. Change only the numbers that move (overshoot, capture time,
  established XTK) to the new measured values, with a comment that the tighter circle is the trainer's (record
  2026-10-20) and that the aircraft cannot fly it at 25°, so the overshoot grows by design. The qualitative
  expectations (first bank into the turn, no reversal, no command against the turn) must stay; if one of those fails,
  stop and report.

Run: `npm test` — expected all green apart from these rewritten expectations, which now pass.

- [ ] **Step 6: Docs and commit**

Update `docs/architecture.md` `:466-471`: the lead formula with both caps and the roll-in on top, the tangent circle
when capped, no skip. Run `npx tsc --noEmit`, `npm run build`. Commit:
`fixes #404 cap the turn anticipation distance at 60 s of ground speed and half the inbound leg`.

---

### Task 3: Bisector sequencing of an anticipated turn (#375)

**Files:**
- Modify: `kln90b/data/flightplan/ActiveWaypoint.ts`, `kln90b/data/navdata/NavCalculator.ts`,
  `kln90b/data/VolatileMemory.ts` (`reset`)
- Modify: `test/flight/flights/skippedLeg.test.ts` (drop `.fails`), `docs/architecture.md`
- Test: `test/flight/flights/bisectorSequencing.test.ts` (create), `test/render/data/VolatileMemory.test.ts` (one test)

**Interfaces:**
- Consumes: `bisectorSide` (Task 1).
- Produces on `ActiveWaypoint`:
  - `public ownTurnStarted: boolean = false;` — the active waypoint's own anticipated turn has been pushed.
  - `public turnPlan: TurnPlan | null = null;` with `export enum TurnPlan { AT_LEAD, AT_ABEAM }` in
    `ActiveWaypoint.ts` (used from Task 4 on; declared here so the clearing lives in one place).
  - Both are cleared when the active index changes (`setActiveIdx`), in `clearTurnStack()`, and by `VolatileMemory.reset`
    (which calls `navPage.activeWaypoint.clearTurnStack()`).

- [ ] **Step 1: Write the failing tests**

```ts
// bisectorSequencing.test.ts
it('sequences a 171° turn at 239 kt where the aircraft crosses the bisector, before the waypoint (KLN 89 trainer, 2026-10-20)', ...)
//   World: inbound course 090 for 28 NM into W, outbound 279 (171° left). On course at 239 kt: at the sequencing the
//   bearing from W to the aircraft is within 2° of 274.5 (the bisector ray on the inside: 270 + (180 - 171) / 2; the
//   trainer showed 279.5 for its inbound 095), and the aircraft is more than 1 NM before W.
it('sequences at once when the aircraft is already past the bisector as its turn starts', ...)
//   Same world, the aircraft parallel 0.5 NM left of (inside) the inbound leg: the active waypoint changes within 2 s
//   of the DTK switch (it is not left active).
// VolatileMemory.test.ts
it('a power cycle clears the turn plan and the own-turn flag', ...)
//   Set ownTurnStarted = true and turnPlan = TurnPlan.AT_LEAD, power cycle as the file's other reset tests do; both are
//   false/null after.
```

Also change `it.fails` to `it` in `skippedLeg.test.ts` (#375).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project flight test/flight/flights/bisectorSequencing.test.ts test/flight/flights/skippedLeg.test.ts` and
`npx vitest run --project render test/render/data/VolatileMemory.test.ts`
Expected: FAIL (171° sequences later; skippedLeg still skips EDTW; the fields do not exist).

- [ ] **Step 3: Implement**

- Set `ownTurnStarted = true` where the turn is pushed.
- Replace the abeam test (`nav.waypointAlert && nav.distToActive >= this.lastDistanceToActive`) by
  `nav.activeWaypoint.ownTurnStarted && bisectorSide(toLeg.wpt, fromDtk, nextDtk, pos) >= 0` (still not for the MAP).
  The alert is no longer read by the sequencing.
- Add the fields, their clearing and the `VolatileMemory.reset` call.

- [ ] **Step 4: Run the tests**

Same commands as Step 2. Expected: PASS. Then `npm test`; `firstFlight.test.ts` (sequencing within 0.1 NM of ABC on a
35° turn) and `waypointAlertTurn.test.ts` must pass unchanged.

- [ ] **Step 5: Docs and commit**

`docs/architecture.md`: "It sequences when the plane is abeam" becomes the bisector rule, armed by the own turn.
Checks, then commit: `fixes #375 sequence an anticipated turn where the aircraft passes its bisector`.

---

### Task 4: The off-course turn start on the leg (|XTK| ≤ 4.0 NM)

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts`, `kln90b/data/flightplan/TurnStackEntry` (in `ActiveWaypoint.ts`)
- Modify: `test/render/data/navdata/NavCalculator.test.ts` (the #157 pin loses `.fails`), `test/README.md`
  (`:747-754`, the #157 pin is no longer a pin; keep the pattern described, naming the passing pair)
- Test: `test/flight/flights/offCourseSequencing.test.ts` (create)

**Interfaces:**
- Consumes: `turnLead`, `alongTrackDistance`, `bisectorSide` (Task 1); `ownTurnStarted`, `turnPlan`, `TurnPlan`
  (Task 3).
- Produces:
  - `TurnStackEntry` gets an optional constructor parameter `public readonly abeamTurnSign: number | null = null`:
    non-null marks the degenerate abeam turn (XTK = `abeamTurnSign × distToActive`, -1 for a right turn, +1 for a left
    turn). Such an entry is not popped by the end-of-turn test; `ActiveWaypoint` drops it when the active index
    changes.
  - Constants in `NavCalculator.ts`: `OFF_LEG_XTK = 4.0`, `TURN_PLAN_MAX_XTK = 2.8`, `TURN_DECISION_TIME = 20`
    (seconds), `WPT_ALERT_ABEAM_TURN = 15`, each with its trainer citation.

- [ ] **Step 1: Write the failing flight tests**

One world: A → W on course 065 for 30 NM, W → B on course 305 (a 120° left turn), magvar 0, 239 kt. Derived in the
test: L = 1.785 × tan 60° = 3.09, roll-in 0.332, turn point TP = 3.42, decision point DP = TP + 239 × 20 / 3600 = 4.75
(along-track before W). A helper `at(alongBeforeNm, xtkRightNm)` places points by `pointFrom`. Pilots are
`scriptedPath` lines through those points.

```ts
it('takes the turn plan at 2.0 NM off course and starts the turn at the lead distance along the track (KLN 89 trainer, 2026-10-20)', ...)
//   Path at(9.75, 7.0) → at(4.25, 1.5) → parallel at 1.5 NM right (outside of the turn; XTK 2.0 at DP): DTK switch
//   with the along-track distance between TP and TP + 0.066 + 0.05, and |XTK to the leg| > 1.0 at that moment; the
//   alert starts with the along-track distance between DP - 0.07 and DP + 0.02. (Alert timings are asserted as
//   along-track distances: on a converging track the seconds stretch, as in the trainer's T14.)
it('takes the abeam plan at 3.5 NM off course and keeps it although the cross track falls (KLN 89 trainer, 2026-10-20)', ...)
//   Line at(9.75, 8.5) → at(1.75, 0.5), then parallel at 0.5 NM right: no DTK switch before the abeam line, the switch
//   within one tick of it (along-track between -0.07 and +0.02); in the next ticks |XTK| equals the distance to W
//   within 0.02 with the FLY L sign of the left turn (xtk > 0); the alert was off at along-track 4.0 and started with
//   the along-track distance between 0.93 and 1.06 (15 s at 239 kt on the parallel track, 0.996 NM); W is sequenced
//   when the bearing from W to the aircraft is within 3° of 095, the outside bisector ray (m + 90 with
//   m = 065 - 120 / 2 = 005; the trainer's run C sequenced at 096 to 101 for the same geometry).
it('sequences on the abeam plan at the inside bisector before the abeam line (the maintainer\'s lead\'s call)', ...)
//   Mirror of the previous on the inside (left of the inbound leg) at 3.5 NM: W is sequenced with the along-track
//   distance still > 0 and no DTK switch before.
it('decides at once when a Direct To is made past the decision point', ...)
//   Direct To W from 4.27 NM before it (inside DP, outside TP): the Direct To leg has no cross track, so the turn plan
//   is set in the next tick (activeWaypoint.turnPlan === TurnPlan.AT_LEAD) and the turn starts at TP.
```

Change `it.fails` to `it` for the #157 pin in `NavCalculator.test.ts` (`passing a waypoint off course`): its 1.5 NM pass
is decided as the turn plan and sequences past the bisector.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project flight test/flight/flights/offCourseSequencing.test.ts` and
`npx vitest run --project render test/render/data/navdata/NavCalculator.test.ts`
Expected: FAIL (the straight-distance start, no abeam turn, no plan).

- [ ] **Step 3: Implement the on-the-leg branch.** With `legXtk = |legPath.distance(pos)|` in NM,
  `along = alongTrackDistance(legPath, toLeg.wpt, pos)`, `tp = lead + rollIn` and `aw = nav.activeWaypoint`:

```
if aw.turnPlan === null and along <= tp + gs × TURN_DECISION_TIME / 3600:
    aw.turnPlan = legXtk <= TURN_PLAN_MAX_XTK ? AT_LEAD : AT_ABEAM
if not aw.ownTurnStarted and turnStack empty:
    AT_LEAD  and along <= tp + gs × TICK_TIME_CALC / 3600 / 1000 → push the turn as today (start and end lead from W)
    AT_ABEAM and toFrom === FROM → push one entry: abeamTurnSign set, pathForDtk = next path; ownTurnStarted = true
alert = (AT_LEAD) or (AT_ABEAM and along / closure <= WPT_ALERT_ABEAM_TURN) or turnStack not empty
        where closure = gs × cos(track - DTK of the leg) / 3600 (no alert when closure <= 0)
sequence when (aw.ownTurnStarted or AT_ABEAM) and bisectorSide(W, fromDtk, nextDtk, pos) >= 0 (not the MAP)
```

The XTK step uses `abeamTurnSign × distToActive` when the top entry has `abeamTurnSign`; DTK stays `pathForDtk`. Roll
steering needs no change (a zero-radius turn steers on `pathForDtk` at once; check `steerOnPathForDtk` gets set). Remove
`lastDistanceToTurn` and `lastDistanceToActive` if unused. Comments: the latched decision with its gate (medium
confidence, between 2.69 and 2.93 NM in the trainer), and the abeam-turn comment of the Global Constraints.

- [ ] **Step 4: Run the tests**

Same commands as Step 2, expected PASS; then `npm test`. The render test `waypoint alert with turn anticipation (4-8)`
must pass unchanged (on course the decision point equals the old 20 s alert point).

- [ ] **Step 5: Docs and commit**

`test/README.md` `:747-754`; `docs/architecture.md` (the plan, the abeam turn, the alerts). Checks, then commit:
`references #157 start the turn off course by a decision 20 s before the turn point`.

---

### Task 5: Off the leg (|XTK| > 4.0 NM) and its alert (#157)

**Files:**
- Modify: `kln90b/data/navdata/NavCalculator.ts`, `kln90b/data/flightplan/ActiveWaypoint.ts`
- Modify: `docs/architecture.md`
- Test: `test/flight/flights/offCourseSequencing.test.ts` (extend)

**Interfaces:**
- Consumes: `segmentDistance` (Task 1); `ownTurnStarted`, `turnPlan` (Task 3); the on-the-leg branch (Task 4).
- Produces: `ActiveWaypoint.dropOwnTurn(): void` — empties the turn stack and clears `ownTurnStarted`, keeps
  `turnPlan`. Constant `WPT_ALERT_OFF_LEG = 36` in `NavCalculator.ts`.

- [ ] **Step 1: Write the failing flight tests** (same world helper as Task 4; a second world with a 150° right turn for
  the R6 case: L capped at 3.98 at 239 kt)

```ts
it('sequences at the abeam line when passed 6 NM off the leg on the outside, without a turn (KLN 89 trainer, 2026-10-20)', ...)
//   Parallel 6.0 NM right: no DTK switch and turnStackLength 0 up to the sequencing; the sequencing with the
//   along-track distance between -0.07 and +0.02; the alert started with the along-track distance between 2.32 and
//   2.45 (36 s at 239 kt on the parallel track).
it('sequences at the inside bisector when passed 9 NM off the leg on the inside', ...)
//   Parallel 9.0 NM left on the 120° world: sequenced with the bearing from W within 3° of 275, the inside bisector ray,
//   more than 4 NM from W, and no alert before it.
it('keeps the abeam plan when the aircraft passed the decision point more than 4 NM off the leg (R6)', ...)
//   150° right turn at 239 kt: line from 6.2 NM left converging to 3.0 NM left at the abeam line, so that the straight
//   distance is below L + roll-in for more than 10 s: no DTK switch before the abeam line, the switch within one tick of it.
it('drops its own turn when the aircraft goes more than 4 NM off the leg', ...)
//   Turn plan at 2.0 NM, then (ManualPilot, 25° away from the turn after the DTK switch) beyond 4.0 NM: DTK falls back
//   to the leg's and turnStackLength is 0 while beyond.
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run --project flight test/flight/flights/offCourseSequencing.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement the off-the-leg branch**, taken when `legXtk > OFF_LEG_XTK`:

```
if aw.ownTurnStarted: aw.dropOwnTurn()
if aw.turnPlan === null and along <= tp + gs × TURN_DECISION_TIME / 3600: aw.turnPlan = AT_ABEAM
alert = (the next leg's segment would become the closer one at the abeam line, i.e. the aircraft is on the outside
         of the turn) and along / closure <= WPT_ALERT_OFF_LEG, or a leftover turn on the stack
sequence when segmentDistance(next leg) <= segmentDistance(active leg) (not the MAP); for a Direct To the active leg
         runs from the Direct To start (fromLeg.wpt)
```

The side of the turn is the sign of the leg XTK against the turn direction (outside = the side away from the turn).

- [ ] **Step 4: Run the tests**, then `npm test`, `npx tsc --noEmit`, `npm run build`.

Expected: PASS, including the #157 render test and `skippedLeg.test.ts`.

- [ ] **Step 5: Docs and commit**

`docs/architecture.md`: the two regimes and the alerts. Commit:
`fixes #157 sequence a waypoint passed far off course as the KLN 89 trainer does`.
