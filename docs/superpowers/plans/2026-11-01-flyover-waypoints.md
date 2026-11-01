# Fly-over waypoints in flight plans (#77) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the pilot enters a terminal waypoint that a SID/STAR of its airport flies over, the unit asks EN ROUTE /
SID/STAR (4-2..4-3), a SID/STAR answer marks the leg `flyOver`, and the mark survives copies, power cycles and sim
sessions.

**Architecture:** Three layers: (1) a storage trailer on the V2 `fplN` string, read and written by the existing V2
loader and persistor; (2) a service that decides whether a fix is a SID/STAR fly-over of its own airport; (3) a new
left page `WaypointTypePage` that `FlightplanListItem` pushes at the approval ENT. Navigation is unchanged:
`NavCalculator` already skips turn anticipation for `toLeg.flyOver`.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`), Vitest (unit, render).

**Spec:** `docs/superpowers/specs/2026-11-01-flyover-waypoints-design.md`

## Global Constraints

- `target: es2017`: no `Array.prototype.flat`/`flatMap`, no `Object.fromEntries`, no `??=`.
- Display text uppercase from `A-Z 0-9 space - / ?`; a left page is 6 rows of 11 characters; page `name`s are exactly
  5 characters.
- Persisted user data is a public contract: `userDataFormat` stays 2, a plan without fly-over legs is saved exactly as
  before, and the V1/V2 loaders keep reading their old strings.
- Manual references are the spec: cite pages (`4-2`, `4-3`, figure 4-7a) in comments; never copy manual text. American
  English; no counts in prose for things that grow.
- Test labels: a title or comment cites a page only for what that page shows; everything else is a characterization
  (test/README.md section 5). Neither trainer showed this page (2026-11-01), so no title cites a trainer check.
- One commit per issue: the work lands as a single `fixes #77 …` commit (see "Finish").
- Every task ends with `npx tsc --noEmit` clean and `npm test` green.

## Review Focus

1. **ENT pressed again while the airport is still loading** → one type page, one inserted leg. Test in Task 3.
2. **The fix's airport is not in the database** → no question, the leg goes in en route. Test in Task 2.
3. **A damaged trailer** (wrong count, a non-base64 character, a remainder of 1 or 2 characters) → the legs load en
   route, nothing throws. Tests in Task 1.
4. **A stored waypoint that is no longer in the database** → the flags after it stay with their own legs. Test in
   Task 1.
5. **An insert in front of an existing waypoint, and an insert in front of a SID waypoint of FPL 0** → the flag lands
   on the new leg only; the SID insert is not asked. Tests in Task 3.

---

### Task 1: The fly-over trailer on stored flight plans

**Files:**
- Create: `kln90b/settings/FlyOverTrailer.ts`
- Modify: `kln90b/services/Flightplanloader.ts` (`loadIcaos`, `convertToKLNLeg`)
- Modify: `kln90b/settings/UserFlightplanLoaderV2.ts` (`restoreFlightplan`)
- Modify: `kln90b/settings/UserFlightplanPersistor.ts` (`persistFlightplan`)
- Modify: `docs/architecture.md` (Core 7, the `fpl{i}` bullet)
- Test: `test/unit/settings/FlyOverTrailer.test.ts` (new), `test/unit/settings/UserFlightplanLoaderV2.test.ts`,
  `test/unit/settings/UserFlightplanPersistor.test.ts`, `test/unit/services/Flightplanloader.test.ts`

**Interfaces:**
- Produces:
  - `encodeFlyOverTrailer(flags: boolean[]): string`: `''` when no flag is set; otherwise the count as two decimal
    digits, then `ceil(n / 6)` base64 characters (`A-Z a-z 0-9 + /`), bit `i % 6` of character `floor(i / 6)` is
    `flags[i]`.
  - `decodeFlyOverTrailer(trailer: string, legCount: number): boolean[]`: always `legCount` entries; all `false` when
    the trailer is empty, its count is not `legCount`, its length is not `2 + ceil(legCount / 6)`, or a character is
    not base64.
  - `Flightplanloader.loadIcaos(icaos: IcaoValue[], fplIdx = 0, flyOver: boolean[] = []): Promise<Flightplan>`:
    `flyOver[i]` belongs to `icaos[i]`; a leg gets `flyOver: true` only where it is `true` (other legs keep the shape
    `{wpt, type}`).

- [ ] **Step 1: Write the failing codec tests** in `test/unit/settings/FlyOverTrailer.test.ts`
  (characterization of our own format; cite the spec's Storage section in a header comment):

```ts
describe('fly-over trailer', () => {
    it('is empty when no leg is a fly-over', () => {
        expect(encodeFlyOverTrailer([])).toBe('');
        expect(encodeFlyOverTrailer([false, false])).toBe('');
    });
    it('writes the count and one base64 character per six legs, least significant bit first', () => {
        expect(encodeFlyOverTrailer([false, true, false])).toBe('03C');
        expect(encodeFlyOverTrailer([false, false, false, false, false, true])).toBe('06g');
        expect(encodeFlyOverTrailer([false, false, false, false, false, false, true])).toBe('07AB');
        expect(encodeFlyOverTrailer(Array(30).fill(true))).toBe('30/////');
    });
    it('reads back what it wrote', () => {
        expect(decodeFlyOverTrailer('03C', 3)).toEqual([false, true, false]);
        expect(decodeFlyOverTrailer('07AB', 7)).toEqual([false, false, false, false, false, false, true]);
    });
    it('reads no trailer as no fly-over', () => {
        expect(decodeFlyOverTrailer('', 2)).toEqual([false, false]);
    });
    it('ignores a trailer whose count, length or characters do not fit', () => {
        expect(decodeFlyOverTrailer('04C', 3)).toEqual([false, false, false]);
        expect(decodeFlyOverTrailer('03*', 3)).toEqual([false, false, false]);
        expect(decodeFlyOverTrailer('03CA', 3)).toEqual([false, false, false]);
        expect(decodeFlyOverTrailer('0', 1)).toEqual([false]);
    });
});
```

- [ ] **Step 2: Run** `npx vitest run test/unit/settings/FlyOverTrailer.test.ts` — expected FAIL (module missing).
- [ ] **Step 3: Implement** `encodeFlyOverTrailer` and `decodeFlyOverTrailer` in `kln90b/settings/FlyOverTrailer.ts`
  with a module constant for the base64 alphabet.
- [ ] **Step 4: Run** the same command — expected PASS.
- [ ] **Step 5: Write the failing loader, persistor and loadIcaos tests.** Reuse the 19-character literals of each file
  (`A_KAAA`, `V_ABC`, `N_XY`, `W_FIXA`):

```ts
// UserFlightplanLoaderV2.test.ts
const flags = (plan: Flightplan) => plan.getLegs().map(l => l.flyOver === true);

it('restores the fly-over flags of the trailer', async () => {
    settings.getSetting('fpl3').set(W_FIXA + V_ABC + '02C');
    const plans = await restore();
    expect(identsOf(plans[3].getLegs())).toEqual(['FIXA', 'ABC']);
    expect(flags(plans[3])).toEqual([false, true]);
});
it('keeps the flags with their legs when a stored waypoint is gone', async () => {
    settings.getSetting('fpl2').set(A_KAAA + 'VK1        GONE    ' + V_ABC + '03E');
    const plans = await restore();
    expect(identsOf(plans[2].getLegs())).toEqual(['KAAA', 'ABC']);
    expect(flags(plans[2])).toEqual([false, true]);
});
it('keeps the flag of leg 30 when a longer stored plan is cut', async () => {
    settings.getSetting('fpl4').set(A_KAAA.repeat(30) + V_ABC + '31AAAAgA');
    const plans = await restore();
    expect(plans[4].getLegs().length).toBe(30);
    expect(plans[4].getLegs()[29].flyOver).toBe(true);
    expect(flags(plans[4]).filter(f => f).length).toBe(1);
});
it('loads the legs en route when the trailer does not fit', async () => {
    settings.getSetting('fpl5').set(W_FIXA + V_ABC + '03C');
    const plans = await restore();
    expect(identsOf(plans[5].getLegs())).toEqual(['FIXA', 'ABC']);
    expect(flags(plans[5])).toEqual([false, false]);
});

// UserFlightplanPersistor.test.ts
it('appends the trailer only when a USER leg is a fly-over', () => {
    persistor().persistFlightplan(new Flightplan(5, [
        {wpt: fixa, type: KLNLegType.USER},
        {wpt: abc, type: KLNLegType.APP, flyOver: true},
        {wpt: xy, type: KLNLegType.USER, flyOver: true},
    ], bus));
    expect(settings.getSetting('fpl5').get()).toBe(W_FIXA + N_XY + '02C');
});
it('round trips a fly-over flag', async () => {
    const p = persistor();
    p.persistFlightplan(new Flightplan(6, [{wpt: fixa, type: KLNLegType.USER, flyOver: true}, {wpt: xy, type: KLNLegType.USER}], bus));
    const plans = await p.restoreAllFlightplan();
    expect(plans[6].getLegs().map(l => l.flyOver === true)).toEqual([true, false]);
});
```

  In `Flightplanloader.test.ts`, give `TestLoader.load` and the `load` helper a third argument `flyOver` passed to
  `loadIcaos(icaos, fplIdx, flyOver)`, and add: loading `[known(0), gone(1), known(2)]` with
  `[false, false, true]` gives `flyOver` `[undefined, true]` on the two loaded legs, and a leg without a flag has no
  `flyOver` key (`expect('flyOver' in fpl.getLegs()[0]).toBe(false)`).
- [ ] **Step 6: Run** `npx vitest run test/unit/settings test/unit/services/Flightplanloader.test.ts` — expected FAIL
  on the new tests only.
- [ ] **Step 7: Implement.**
  - `loadIcaos`: pass each icao's index into `convertToKLNLeg` before the filter, so the flags travel with the legs
    through the drop and the 30-leg cut.
  - `UserFlightplanLoaderV2.restoreFlightplan`: `trailerLength = serialized.length % 19`; the legs are the first
    `serialized.length - trailerLength` characters in 19-character cells (no more `.{1,19}` short chunk); the flags are
    `decodeFlyOverTrailer(trailer, cells.length)`.
  - `UserFlightplanPersistor.persistFlightplan`: the USER legs as today, then
    `encodeFlyOverTrailer(userLegs.map(l => l.flyOver === true))`.
  - `docs/architecture.md` Core 7: describe the trailer under the `fpl{i}` bullet (layout, the length rule that tells it
    from a plain V2 string, the downgrade behavior), and name `FlyOverTrailer.ts` under "Code".
- [ ] **Step 8: Run** `npx tsc --noEmit` and `npm test` — expected clean and PASS.
- [ ] **Step 9: Commit** `references #77 store the fly-over flags as a trailer on the V2 flight plan string`.

### Task 2: Which fixes are SID/STAR fly-overs

**Files:**
- Create: `kln90b/services/FlyOverWaypoints.ts`
- Modify: `test/harness/navdata/builders.ts` (`intersection` takes `opts.airport`)
- Test: `test/unit/services/FlyOverWaypoints.test.ts` (new)

**Interfaces:**
- Consumes: the harness `withProcedures`, `sid`, `star`, `Leg.TF(fix, flags, flyOver)` from
  `test/harness/navdata/procedures.ts`.
- Produces: `isSidStarFlyOver(fix: Facility, facilityLoader: KLNFacilityLoader): Promise<boolean>` — `true` only when
  the fix is an intersection (`ICAO.getFacilityTypeFromValue` is `FacilityType.Intersection`) whose
  `icaoStruct.airport` is not blank, and some leg of that airport's `departures` or `arrivals` (common legs, en-route
  transitions, runway transitions) has `flyOver` set and `ICAO.valueEquals(leg.fixIcaoStruct, fix.icaoStruct)`. The
  airport is loaded with `facilityLoader.getFacility(FacilityType.Airport, ICAO.value('A', '', '', airportIdent))`; a
  failed load gives `false`, never an exception.
- Produces (harness): `intersection(ident, lat, lon, opts: {region?: string; airport?: string})` puts `opts.airport`
  into the ICAO's airport field.

- [ ] **Step 1: Write the failing tests.** World: `KAAA` with a STAR `ARR1` (common legs `TF(DF1, 0, true)`,
  `TF(DF4)`; en-route transition `T1` with `TF(DF3, 0, true)`; a common leg `TF(ENR1, 0, true)`) and a SID `DEP1`
  (runway transition `09` with `TF(DF2, 0, true)`). DF1–DF4 are terminal fixes of KAAA in region `K1`; `ENR1` has no
  airport; `DF1X` is a fix `DF1` of KAAA in region `K2`, in no procedure; `DF9` is a terminal fix of `KZZZ`, an airport
  not in the database. Title the describe with 4-2..4-3 only for what the guide says (a flagged SID/STAR fly-over is
  asked); the selection rules are the maintainer's (design doc), so those `it`s are characterizations.

```ts
it('true for a terminal fix flown over in a STAR common leg', ...isSidStarFlyOver(df1) → true);
it('true for a terminal fix flown over only in a SID runway transition', ...(df2) → true);
it('true for a terminal fix flown over only in an en-route transition', ...(df3) → true);
it('false for a terminal fix its procedures fly only as an ordinary fix', ...(df4) → false);
it('false for a fix without an airport, though a procedure flies over it', ...(enr1) → false);
it('false for a fix of the same ident in another region', ...(df1x) → false);
it('false when the airport is not in the database', ...(df9) → false);
```

- [ ] **Step 2: Run** `npx vitest run test/unit/services/FlyOverWaypoints.test.ts` — expected FAIL (module missing).
- [ ] **Step 3: Implement** `isSidStarFlyOver` in `kln90b/services/FlyOverWaypoints.ts` and the builder option.
  Comment the function with 4-2..4-3 and the install manual's AFMS (p. 104) for the behavior, and #77 for the
  selection rule.
- [ ] **Step 4: Run** the test file — expected PASS; then `npx tsc --noEmit` and `npm test`.
- [ ] **Step 5: Commit** `references #77 tell whether a terminal fix is a SID/STAR fly-over of its airport`.

### Task 3: The waypoint type page at the approval ENT

**Files:**
- Create: `kln90b/pages/left/WaypointTypePage.tsx`
- Modify: `kln90b/controls/FlightplanListItem.tsx` (`enter`, `setFacility`, `clear`)
- Modify: `kln90b/controls/editors/WaypointEditor.tsx` (a getter for the waiting value)
- Modify: `docs/kln89-trainer-record.md` (a dated block for the 2026-11-01 check)
- Test: `test/render/pages/left/WaypointTypePage.test.ts` (new); one test in
  `test/render/data/flightplan/FlightplanEdit.test.ts`; one in `test/render/services/KlnEfbLoader.test.ts`

**Interfaces:**
- Consumes: `isSidStarFlyOver` (Task 2); the trailer format (Task 1) for the storage literal.
- Produces:
  - `WaypointEditor.pendingValue(): Facility | null` — the waypoint waiting for its approval, `null` otherwise.
  - `WaypointTypePage.ask(props: PageProps & {fix: Facility; parent: SixLineHalfPage}): Promise<boolean | null>` —
    pushes the page on the left (as `DuplicateWaypointPage.selectDuplicateWaypoint` does) and resolves `true` for
    SID/STAR, `false` for EN ROUTE, `null` for CLR; the page pops itself before resolving. `name` is `"     "` as on
    the duplicate page.

**Screen (figure 4-7a), left rows:** `'DF1        '`, `'  TYPE WPT '`, `'           '`, `'1 EN ROUTE?'`,
`'2 SID/STAR?'`, `'           '`. The cursor starts on `1 EN ROUTE?`; the left outer knob moves it between the two
lines; ENT answers. The waypoint page stays on the right meanwhile (the confirm page is popped only by the approval).

**Flow in `FlightplanListItem.enter`:** when the editor waits for an approval, its `pendingValue()` is not null and
this row's type is `KLNLegType.USER`, await `isSidStarFlyOver` before letting the editor confirm. While that check runs,
further ENTs return `EnterResult.Handled_Keep_Focus` and do nothing. If it is `false`, continue as today. If it is
`true`, return `Handled_Keep_Focus` and show `WaypointTypePage.ask`. On an answer, keep it for `setFacility` (which then
passes `{wpt, type: KLNLegType.USER, flyOver: true}` as the leg for SID/STAR, or `this.props.leg` as today), run the
editor's approval (`waypointEditor.enter()`), and when that returns `Handled_Move_Focus` without `insertRefused`, move
the cursor on with `this.props.cursorController.outerRight()`, as `retryKeyboard` does. On `null` (CLR), reject the
waypoint the way CLR during the approval does (4-2 step 7, this item's `clear()`).

**Trace the key routing first.** While the type page is the left page, the `WaypointConfirmPage` is still on the right
with this row's editor as `callingEditor`. `WaypointConfirmPage.hasOpenEntry()` compares its parent with
`mainPage.getLeftPage()`, which is now the type page, so CLR (and possibly ENT) would be routed to the right page and
reach the editor directly. Read `MainPage`'s ENT/CLR dispatch and make sure both keys reach `WaypointTypePage` while it
is shown; the CLR and two-ENT tests below must fail if they do not.

- [ ] **Step 1: Write the failing render tests** in `test/render/pages/left/WaypointTypePage.test.ts`. World: aircraft
  at 46.5 N 8 E; `KAAA` at 47 N 8 E with the STAR `ARR1` (common legs `TF(DF1, 0, true)`, `TF(DF4)`); `DF1`, `DF4`
  terminal fixes of KAAA near 47.1 N; `FX1AA`, `FX2AA` plain intersections. Boot with `savedFlightplan(4, [fx1])`
  (or `[fx1, fx2]`), select `FPL 4`, cursor on, outer knob to the blank position, `enterIdent('L', ident)`, `ent()`,
  `ent()`, then `vi.advanceTimersByTimeAsync(500)` as `DuplicateWaypointPage.test.ts` does. `flags(n)` is
  `unit.props.memory.fplPage.flightplans[n].getLegs().map(l => l.flyOver === true)`.

```ts
it('asks how DF1 is used after its approval (4-2..4-3, figure 4-7a)', ...
    expect(Screen.read().rows('L')).toEqual(['DF1        ', '  TYPE WPT ', '           ', '1 EN ROUTE?', '2 SID/STAR?', '           ']);
    expect(unit.panel.focused('L')).toEqual({row: 3, col: 0, text: '1 EN ROUTE?'});
    expect(fplIdents(unit, 4)).toEqual(['FX1AA']); // nothing inserted yet
it('marks DF1 as a fly-over on SID/STAR? and moves on to the next position (4-3)', ...
    outer('L', 1) → focused text '2 SID/STAR?'; ent →
    expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'DF1']); expect(flags(4)).toEqual([false, true]);
    expect(Screen.read().rows('L')[1]).toBe('  2:DF1    '); // the en route separator (design: model 1)
    expect(unit.panel.focused('L').text).toBe('     ');
    expect(storedSetting(unit, 'fpl4')).toBe(<V2 of FX1AA> + <V2 of DF1> + '02C');
it('inserts DF1 en route on EN ROUTE? (4-3)', ... ent → flags(4) [false, false]; stored string has no trailer
it('asks nothing for DF4, which the STAR flies as an ordinary fix (characterization)', ...
    after ent, ent: fplIdents ['FX1AA', 'DF4'], left rows show '  2:DF4    '
it('inserts nothing on CLR and shows the plan again (characterization, as 4-2 step 7)', ...
    clr → fplIdents ['FX1AA'], left rows are the FPL 4 page again
it('shows the question once and inserts once on two quick ENTs (characterization)', ...
    ent(); ent(); ent() (no timer advance between the approval ENTs), advance 500 ms, ent →
    fplIdents ['FX1AA', 'DF1']
it('marks only the inserted waypoint when DF1 goes in front of FX2AA (characterization)', ...
    plan [fx1, fx2], cursor on FX2AA, inner knob opens the insert, DF1, ent, ent, advance, outer 1, ent →
    fplIdents ['FX1AA', 'DF1', 'FX2AA'], flags(4) [false, true, false]
it('keeps the mark when the plan is copied into FPL 0 with USE? (characterization)', ...
    after the SID/STAR answer: outer knob to USE?, ent → flags(0) [false, true]
it('restores the mark at power-on (characterization)', ...
    boot with storage {userDataFormat: 2, fpl4: V2(fx1) + V2(df1) + '02C'} → flags(4) [false, true]
```

  In `FlightplanEdit.test.ts`, next to the existing "adding a waypoint in front of a SID waypoint of an FPL 0" setup,
  add: adding DF1-like terminal fly-over fix in front of a SID waypoint asks nothing (the new leg is a SID leg). In
  `KlnEfbLoader.test.ts` add: an EFB route with the terminal fly-over fix as an en-route fix loads it with
  `flyOver !== true` and shows no type page.
- [ ] **Step 2: Run** `npx vitest run test/render/pages/left/WaypointTypePage.test.ts` and the two other files —
  expected FAIL on the new tests (the EFB and SID tests may pass already; they guard the condition).
- [ ] **Step 3: Implement** `WaypointTypePage`, `WaypointEditor.pendingValue`, and the flow above in
  `FlightplanListItem`. Comment with 4-2..4-3 and figure 4-7a; mark the CLR and double-ENT behavior as our choice
  (design doc).
- [ ] **Step 4: Run** the tests — expected PASS; then `npx tsc --noEmit` and `npm test`.
- [ ] **Step 5: Add the trainer record block** to `docs/kln89-trainer-record.md` dated 2026-11-01: the 89 demo
  database has one STAR (TRUDO1 at KMKE) and no SIDs, and none of the entries tried (its STAR fixes, appended and
  inserted, and VORs) raised the waypoint type question; the AVsoftech 90B trainer (SWR, KAPA PIKES2/DANDD1 fixes)
  does not model it either. Follow the file's existing block style.
- [ ] **Step 6: Commit** `references #77 ask EN ROUTE or SID/STAR for a terminal fly-over waypoint`.

### Finish: one commit for #77

- [ ] Squash the three task commits into one: `git reset --soft <the commit that adds this plan>`, then commit with
  `fixes #77 ask EN ROUTE or SID/STAR for a terminal SID/STAR fly-over waypoint entered into a flight plan, and keep the
  choice in the saved plan`. The design and plan commits stay as they are.
- [ ] Check `git diff <the plan commit> HEAD --stat` lists the files of all three tasks, and `npm test` is green on
  the committed tree (`git status` clean).
