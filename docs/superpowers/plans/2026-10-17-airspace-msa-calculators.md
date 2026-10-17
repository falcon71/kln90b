# Airspace, MSA and TRI/CAL calculators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone's fifteen issues (#102, #106, #166, #167, #181, #251, #254, #257, #314, #346, #352, #388,
#389, #390, #391), one `fixes #NN` commit each, on the branch `m7-airspace-calc`.

**Architecture:** Five lanes that touch disjoint files run in parallel; inside a lane the tasks run in order, each in a
fresh worktree that fast-forwards to the integration branch first, and each reviewed commit is cherry-picked onto
`m7-airspace-calc` at once. The airspace lane changes `NearestUtils` to one mirrored, queued search session; the
calculator lane adds one dash mechanism (`SelectField.displayOverride`) that the fieldsets and displays use for values
that do not fit.

**Tech Stack:** TypeScript (target es2017), MSFS avionics SDK 2.3.3 (`@microsoft/msfs-sdk`), FSComponent JSX, Vitest
(unit, render with happy-dom, flight), `numerable` for formatting.

**Spec:** `docs/superpowers/specs/2026-10-17-airspace-msa-calculators-design.md` (sections 1 to 6, and the amendments
of section 7, which win where they differ).

## Global Constraints

- **Worktree start.** Every task runs in a fresh worktree. First command: `git merge --ff-only m7-airspace-calc`
  (agent worktrees start at master's HEAD). If `node_modules` is missing, create it as a junction to
  `E:\msfs\kln90b\node_modules` (PowerShell `New-Item -ItemType Junction`). Never remove a worktree before removing its
  junction with `cmd //c rmdir <worktree>\node_modules`.
- **One commit per task**, message `fixes #NN <description>` (plain sentence, American English), with the test and doc
  changes of that issue in the same commit, and the attribution trailer your own environment gives you. No push, no
  GitHub writes, no edits outside the worktree.
- **Before the commit:** `npm test` (the FULL suite, not just the task's files), `npx tsc --noEmit` and
  `npm run build` all pass. Expected-fail pins of other issues stay expected-fail.
- **Vehicles.** Before writing the fix, apply it once and run the full suite: every test outside the task's files that
  changes result is a vehicle; report it and update it in the same commit with a comment saying why.
- **Every condition the task adds** (a guard, a branch, a range check, a clamp) is named in the report with the test
  that turns red when that one condition is dropped. The plan names these tests; if one does not bite, say so and add
  one that does.
- **Labels (test/README.md section 5).** A test title cites a Pilot's Guide page only for what that page literally
  shows. A KLN 89 trainer citation ("checked in the KLN 89 trainer, 2026-10-17") supports only what
  `docs/kln89-trainer-record.md` literally records for that date. The 90B's own dash forms per field, field widths and
  texts that no source shows are `(characterization)`. The AVsoftech trainer is never cited as a spec source. Never
  put a characterization in a describe whose title cites a page. An `it.fails` pin that the fix turns green becomes a
  plain `it` with its title kept (drop nothing but `.fails`).
- **Copyright.** Never quote the Pilot's Guide or the other manuals: cite page numbers and paraphrase.
- **Code rules (CLAUDE.md).** DOM changes only in display ticks; services keep no mutable state outside
  `VolatileMemory`/settings except the search plumbing named here; target es2017; comments cite the manual page or the
  issue; no counts in prose for things that grow.
- **Report.** Write `.task-report.md` at the root of your worktree with a Bash heredoc (never committed): the commit
  sha, the files changed, the conditions → tests table, the vehicles, a label audit (each `describe` you added or
  touched: its title, spec or characterization, every page number it cites), and the full-suite totals.

**User decisions (already made):**
- #352: besides the floor check, a Class B or C message shows only its upper limit (`BELOW <top>ft`).
- #102: option B, one session whose map mirrors the session's result, searches queued.
- #181: the exact sector walk, the parallels limited to the leg's latitude range.
- #257 family: a computed value that does not fit its field shows dashes; an editable field showing dashes holds no
  value, and a digit edit treats every digit as 0, then applies the turn. Positive temperatures use the sign cell as
  the hundreds digit; -100 and below show dashes.
- #254: the TRI 5 GS row shows the plan distance over the summed leg times.
- #388 to #391 join the milestone, each its own commit.
- AVsoftech results are recorded but unreliable.

## Lanes and order

| Lane | Tasks, in order |
|---|---|
| A1 airspace search | Task 1 (#102), Task 2 (#391), Task 3 (#251) |
| A2 boundaries and alert | Task 4 (#106), Task 5 (#352) |
| B ESA | Task 6 (#181) |
| C1 TRI and CAL values | Task 7 (#257), Task 8 (#314), Task 9 (#346), Task 10 (#389), Task 11 (#167), Task 12 (#254), Task 13 (#388) |
| C2 CAL 7 | Task 14 (#166), Task 15 (#390) |

Task 1 and Task 6 both touch `test/render/pages/left/Tri6Page.test.ts` (a comment at about line 39, the ESA snapshot
at about line 12): different hunks; the second cherry-pick resolves trivially if at all.

---

### Task 1: One airspace search session for every caller (#102)

**Goal:** `NearestUtils` keeps one boundary search session whose map mirrors the session's current result, runs its
searches one at a time, and offers `getAirspacesAt` (containing the point) and `getAirspaces` (unfiltered route
search); the route functions get one array per leg.

**Files:**
- Modify: `kln90b/data/navdata/NearestUtils.ts` (fields at about :32-35, `getAirspaces` at about :82-104)
- Modify: `kln90b/pages/left/Oth2Page.tsx:73`, `kln90b/controls/AirportCoordOrNearestView.tsx:248`
- Modify: `kln90b/services/AirspacesAlongRoute.ts:71,127`
- Test: `test/render/data/navdata/NearestUtils.test.ts`, `test/render/controls/AirportCoordOrNearestView.test.ts`,
  `test/render/services/AirspacesAlongRoute.test.ts`, `test/render/pages/right/Ctr1Page.test.ts`,
  `test/render/pages/right/Ctr2Page.test.ts`
- Modify (text about #102): `test/harness/fixtures.ts:133`, `test/README.md` (the `centerWorld` paragraph),
  `test/render/pages/left/Tri2Page.test.ts:10`, `test/render/pages/left/Tri6Page.test.ts:39`,
  `test/render/harness/airspaces.test.ts:44`, `test/render/pages/right/Ctr1Page.test.ts:234-235,323`,
  `test/render/pages/right/Ctr2Page.test.ts:11,41,166-168`

**Acceptance Criteria:**
- [ ] The nine #102 pins pass as plain tests: `AirportCoordOrNearestView.test.ts` (about :78, :97),
  `NearestUtils.test.ts` (about :91, :101), `AirspacesAlongRoute.test.ts` (about :86, :96, :114, :132),
  `Ctr1Page.test.ts` (about :239).
- [ ] The #362 characterization in `Ctr2Page.test.ts` (about :168) is updated: its precondition came from the bug.
- [ ] A new test shows that the second search starts only after the first finished, and one that a failed search does
  not stop the next one.
- [ ] No comment or README paragraph still describes the shared-session bug as present.

**Verify:** `npx vitest run test/render/data/navdata/NearestUtils.test.ts test/render/controls/AirportCoordOrNearestView.test.ts test/render/services/AirspacesAlongRoute.test.ts test/render/pages/right` → all pass; then `npm test` → no failures.

**Steps:**

- [ ] **Step 1: Write the queue tests** in `test/render/data/navdata/NearestUtils.test.ts` (a new describe at the end):

```ts
// #102: the boundary session reports each result as the difference from its previous search, and a large search can
// finish after a later one, so NearestUtils runs its airspace searches one at a time (characterization of the fix)
describe('NearestUtils airspace searches run one at a time (#102)', () => {
    type Result = {added: unknown[], removed: number[]};

    async function utilsWithSession(searchNearest: (...args: unknown[]) => Promise<Result>) {
        const unit = await bootUnit({});
        await settle(unit);
        const utils = unit.props.nearestUtils;
        (utils as unknown as {airspaceSession: unknown}).airspaceSession = {setFilter: () => undefined, searchNearest};
        return utils;
    }

    it('starts the second search only after the first one has finished (characterization)', async () => {
        const calls: string[] = [];
        let finishFirst!: () => void;
        const searchNearest = vi.fn()
            .mockImplementationOnce(() => {
                calls.push('start 1');
                return new Promise<Result>(resolve => finishFirst = () => {
                    calls.push('end 1');
                    resolve({added: [], removed: []});
                });
            })
            .mockImplementationOnce(() => {
                calls.push('start 2');
                return Promise.resolve({added: [], removed: []});
            });
        const utils = await utilsWithSession(searchNearest);

        const first = utils.getAirspaces(47, 8, 1000, 10, 0);
        const second = utils.getAirspaces(47, 8, 1000, 10, 0);
        await vi.advanceTimersByTimeAsync(100);
        expect(calls).toEqual(['start 1']);

        finishFirst();
        await Promise.all([first, second]);
        expect(calls).toEqual(['start 1', 'end 1', 'start 2']);
    });

    it('runs the next search after one that failed (characterization)', async () => {
        const searchNearest = vi.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('search failed')))
            .mockImplementationOnce(() => Promise.resolve({added: [], removed: []}));
        const utils = await utilsWithSession(searchNearest);

        await expect(utils.getAirspaces(47, 8, 1000, 10, 0)).rejects.toThrow('search failed');
        await expect(utils.getAirspaces(47, 8, 1000, 10, 0)).resolves.toEqual([]);
        expect(searchNearest).toHaveBeenCalledTimes(2);
    });
});
```

If `unit.props.nearestUtils` is not the name on `HeadlessUnit.props`, use the name `PageProps` gives it (see
`pages/Page.tsx`).

- [ ] **Step 2: Run them and the pins to see them fail**

Run: `npx vitest run test/render/data/navdata/NearestUtils.test.ts`
Expected: the first new test FAILS (both searches start at once); the #102 pins still report as expected fails.

- [ ] **Step 3: Implement** in `kln90b/data/navdata/NearestUtils.ts`. Remove the field `nearestAirspaces` and replace
  `getAirspaces` with:

```ts
    //#102: the map mirrors the session's current result (every added airspace in, every removed one out), and the
    //searches run one at a time: the session reports each result as the difference from its previous search, and
    //NearestLodBoundarySearchSession builds the boundaries of a search in a throttled queue, so a large search can finish
    //after a later one
    private readonly airspaceMap = new Map<number, LodBoundary>();
    private airspaceQueue: Promise<unknown> = Promise.resolve();

    /**
     * Returns the airspaces that contain the given point (OTH 2, the APT 1 airspace row)
     * @param lat
     * @param lon
     * @param maxItems
     * @param filter
     */
    public async getAirspacesAt(lat: number, lon: number, maxItems: number, filter: number): Promise<LodBoundary[]> {
        const found = await this.searchAirspaces(lat, lon, 0, maxItems, filter);
        //searchNearest only checks the bounding box, which can be huge like CANADA RVSM
        return found.filter(airspace => BoundaryUtils.isInside(airspace, lat, lon));
    }

    /**
     * Returns the airspaces whose bounding box meets the search circle, for the route searches (TRI 2, 4 and 6, CTR 1);
     * the caller checks the geometry
     * @param lat
     * @param lon
     * @param radius in meters
     * @param maxItems
     * @param filter
     */
    public getAirspaces(lat: number, lon: number, radius: number, maxItems: number, filter: number): Promise<LodBoundary[]> {
        return this.searchAirspaces(lat, lon, radius, maxItems, filter);
    }

    private searchAirspaces(lat: number, lon: number, radius: number, maxItems: number, filter: number): Promise<LodBoundary[]> {
        const run = async () => {
            this.airspaceSession!.setFilter(filter);
            const result = await this.airspaceSession!.searchNearest(lat, lon, radius, maxItems);
            for (const id of result.removed) {
                this.airspaceMap.delete(id);
            }
            for (const airspace of result.added) {
                this.airspaceMap.set(airspace.facility.id, airspace);
            }
            return [...this.airspaceMap.values()];
        };
        const search = this.airspaceQueue.then(run, run);
        this.airspaceQueue = search.catch(() => undefined);
        return search;
    }
```

`Oth2Page.tsx:73` becomes `this.props.nearestUtils.getAirspacesAt(lat, lon, 20, BitFlags.createFlag(BoundaryType.Center))`
and `AirportCoordOrNearestView.tsx:248` becomes `this.nearestUtils.getAirspacesAt(facility.lat, facility.lon, 100, BOUNDARY_FLAGS)`
(the airport row moves from a radius of 10 m to the point itself). In `services/AirspacesAlongRoute.ts` both
`Array(route.length - 1).fill([])` become `Array.from({length: route.length - 1}, (): LodBoundary[] => [])`.

- [ ] **Step 4: Turn the pins into plain tests, update the vehicle and the text.** Drop `.fails` from the nine pins
  (titles kept). Rewrite the #362 characterization in `Ctr2Page.test.ts` (about :166-168) for the fixed search and say
  in its comment that its old precondition came from #102. Rewrite every comment and README paragraph listed under
  Files that describes the shared session as a present bug, in the past tense or for the fixed behavior.

- [ ] **Step 5: Run the task's files, then the full suite, tsc and the build**

Run: `npx vitest run test/render/data/navdata/NearestUtils.test.ts test/render/controls/AirportCoordOrNearestView.test.ts test/render/services/AirspacesAlongRoute.test.ts test/render/pages/right`, then `npm test`, `npx tsc --noEmit`, `npm run build`
Expected: PASS everywhere; no other test changes (the inventory found only the Ctr2 vehicle).

Conditions → tests: the queue (`then(run, run)` → plain `then(run)` turns the failed-search test red; no queue at all
turns the first new test red); the mirror's `removed` loop and the `isInside` filter → the APT 1 and NearestUtils pins
(`does not show the type of the airport shown before`, `leaves the row blank for KOUT after KIN`).

- [ ] **Step 6: Commit** — `fixes #102 search airspaces through one session whose map mirrors its result, one search at a time, and test the point only where a point is asked about`

```json:metadata
{"files": ["kln90b/data/navdata/NearestUtils.ts", "kln90b/pages/left/Oth2Page.tsx", "kln90b/controls/AirportCoordOrNearestView.tsx", "kln90b/services/AirspacesAlongRoute.ts", "test/render/data/navdata/NearestUtils.test.ts", "test/render/controls/AirportCoordOrNearestView.test.ts", "test/render/services/AirspacesAlongRoute.test.ts", "test/render/pages/right/Ctr1Page.test.ts", "test/render/pages/right/Ctr2Page.test.ts", "test/harness/fixtures.ts", "test/README.md"], "verifyCommand": "npm test", "acceptanceCriteria": ["nine #102 pins pass as plain tests", "Ctr2 #362 characterization updated", "queue tests added and red without the queue", "no text describes the shared session as a present bug"], "modelTier": "standard"}
```

---

### Task 2: A route leg without length searches at its point (#391)

**Goal:** `splitLeg` returns one search at radius 0 for a leg of length zero instead of a radius of NaN.

**Files:**
- Modify: `kln90b/services/AirspacesAlongRoute.ts` (`splitLeg`, about :28-54)
- Test: `test/render/services/AirspacesAlongRoute.test.ts`

**Acceptance Criteria:**
- [ ] TRI 4 from KAAA to KAAA, with KAAA inside a restricted area, lists that area.
- [ ] Without the guard the new test is red.

**Verify:** `npx vitest run test/render/services/AirspacesAlongRoute.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing test** in `AirspacesAlongRoute.test.ts`, in the TRI 4 describe (5-5), with its own
  entry helper (TRI 3 with the same waypoint as FROM and TO):

```ts
    // 5-5: an area the route starts in belongs to the route; a route from a waypoint to itself has no length, and
    // splitLeg divided 0 by 0 into a search radius of NaN, which found nothing (#391)
    it('lists the area around a route from a waypoint to itself (5-5, #391)', async () => {
        const unit = await bootWith([squareAt('R-HERE', 0)]);
        await settle(unit);
        await unit.panel.selectPage('L', 'TRI 3');
        await unit.panel.cursor('L');
        await unit.panel.type('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.type('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.cursor('L');
        await unit.panel.selectPage('L', 'TRI 4');
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('L')[0]).toBe('KAAA -KAAA ');
        expect(areaRows()).toEqual(FIRST_AREA('R-HERE'));
    });
```

- [ ] **Step 2: Run it** — Run: `npx vitest run test/render/services/AirspacesAlongRoute.test.ts` — Expected: FAIL (no area listed).

- [ ] **Step 3: Implement.** In `splitLeg`, right after `dist` is computed:

```ts
    if (dist === 0) {
        //#391: a leg without length is searched at its point; the split below would divide 0 by 0, and
        //setAsGreatCircle has no circle through one point
        return [{fromIdx: idx, coord: from, searchRadius: 0}];
    }
```

- [ ] **Step 4: Run** the file, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the `dist === 0` guard → the new test.

- [ ] **Step 5: Commit** — `fixes #391 search a route leg without length at its point instead of with a radius of NaN`

```json:metadata
{"files": ["kln90b/services/AirspacesAlongRoute.ts", "test/render/services/AirspacesAlongRoute.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["TRI 4 KAAA to KAAA lists the area around KAAA", "test red without the guard"], "modelTier": "mechanical"}
```

---

### Task 3: OTH 2 looks up the Center again while it is shown (#251)

**Goal:** OTH 2 searches the Center of the present position every 10 s while shown, one search at a time, keeping the
old Center on screen until the new result arrives.

**Files:**
- Modify: `kln90b/pages/left/Oth2Page.tsx`
- Test: `test/render/pages/left/Oth2Page.test.ts`

**Acceptance Criteria:**
- [ ] The #251 pin (about :65) passes as a plain test.
- [ ] Over 21 s after the page is selected, exactly three Center searches run (at 0, 10 and 20 s).
- [ ] While a search hangs, no further search starts and the old Center stays on screen.

**Verify:** `npx vitest run test/render/pages/left/Oth2Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests** in `Oth2Page.test.ts`, in the describe of 3-52 (the cadence and the guard
  are characterizations, so give them their own describe):

```ts
// The 10 s cadence is the project's common search period (NAV 2, the nearest lists, the airspace alert); the KLN 89
// trainer's NRST CTR changed by itself within about 15 s of a boundary crossing (checked in the KLN 89 trainer,
// 2026-10-17), which does not fix a period
describe('OTH 2 page, how often it looks up the Center (characterization)', () => {
    it('searches when selected and then every 10 s (characterization)', async () => {
        const unit = await bootUnit({position: {lat: 47.0, lon: 8.0}, altitudeFt: 0, airspaces: ALPHA_BRAVO()});
        await settle(unit);
        const search = vi.spyOn(unit.props.nearestUtils, 'getAirspacesAt');
        await unit.panel.selectPage('L', 'OTH 2');

        await vi.advanceTimersByTimeAsync(9_000);
        expect(search).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(2_000);
        expect(search).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(search).toHaveBeenCalledTimes(3);
    });

    it('starts no search while one is still running and keeps showing the Center it has (characterization)', async () => {
        const unit = await bootUnit({position: {lat: 47.0, lon: 8.0}, altitudeFt: 0, airspaces: ALPHA_BRAVO()});
        await settle(unit);
        const search = vi.spyOn(unit.props.nearestUtils, 'getAirspacesAt');
        await unit.panel.selectPage('L', 'OTH 2');
        await vi.advanceTimersByTimeAsync(2_000);
        search.mockImplementation(() => new Promise(() => undefined)); // every later search hangs

        await moveAircraft(unit, {lat: 47.7, lon: 8.0}, {groundspeedKt: 150, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(25_000);

        expect(search).toHaveBeenCalledTimes(2);
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['ALPHA      ', 'CTR        ', '     118.55']);
    });
});
```

Drop `.fails` from the #251 pin.

- [ ] **Step 2: Run** — Run: `npx vitest run test/render/pages/left/Oth2Page.test.ts` — Expected: the pin and the first new test FAIL.

- [ ] **Step 3: Implement** in `Oth2Page.tsx` (import `TICK_TIME_DISPLAY` from `../../TickController`):

```ts
    private ticksToSearch = 0;
    private isSearching = false;

    tick(blink: boolean) {
        //#251, 3-52: the Center of the present position is looked up again every 10 s while the page is shown, one
        //search at a time, as NAV 2 does with its VOR
        this.ticksToSearch--;
        if (this.ticksToSearch <= 0 && !this.isSearching) {
            this.loadCenter();
        }
        super.tick(blink);
    }

    private loadCenter() {
        this.ticksToSearch = 10000 / TICK_TIME_DISPLAY;
        this.isSearching = true;
        this.props.nearestUtils.getAirspacesAt(this.props.sensors.in.gps.coords.lat, this.props.sensors.in.gps.coords.lon, 20, BitFlags.createFlag(BoundaryType.Center)).then(
            centers => {
                // ...the existing body, unchanged...
                this.requiresRedraw = true;
                this.isSearching = false;
            },
            () => {
                this.isSearching = false;
            },
        );
    }
```

The constructor keeps its `this.loadCenter()`. The Centers are replaced only when a result arrives, so the old one
stays shown meanwhile.

- [ ] **Step 4: Run** the file, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the countdown → `searches when selected and then every 10 s`; `!this.isSearching` → `starts no
search while one is still running`; the rejection handler: with it removed, a failed search would stop all later
ones; give it a test (a spy that rejects once, then a move, then BRAVO after 10 s) or report why it cannot bite.

- [ ] **Step 5: Commit** — `fixes #251 look up the Center of the present position every 10 s while OTH 2 is shown`

```json:metadata
{"files": ["kln90b/pages/left/Oth2Page.tsx", "test/render/pages/left/Oth2Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["#251 pin passes", "three searches in 21 s", "no search while one runs, old Center stays"], "modelTier": "standard"}
```

---

### Task 4: Paths and boundaries in one longitude range (#106)

**Goal:** `BoundaryUtils.getIntersections` unwraps the ring and the path around one reference longitude, and
`intersects` is `getIntersections(...).length > 0`.

**Files:**
- Modify: `kln90b/data/navdata/BoundaryUtils.ts` (`intersects` about :75-113, `getIntersections` about :115-137)
- Test: `test/unit/data/navdata/BoundaryUtils.test.ts`

**Acceptance Criteria:**
- [ ] Both #106 pins (about :47, :51) pass as plain tests.
- [ ] A box across 0° longitude is crossed by a path from 10 W to 10 E at 5 W and 5 E.
- [ ] A path across the date line far from a box around 0° does not intersect it.
- [ ] The existing date-line and hand-computed tests stay green.

**Verify:** `npx vitest run test/unit/data/navdata/BoundaryUtils.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the tests** in `BoundaryUtils.test.ts`. Move the two pins out of `known bugs` into a describe
  `the longitude range of the path and the box (#106)`, drop `.fails`, and add:

```ts
// A box from 5W to 5E, 10N to 20N: it does not cross the date line, its reference longitude is its middle, 0
const primeBox = new LodBoundary(airspace('PRIME', BoundaryType.Restricted, [[10, -5], [10, 5], [20, 5], [20, -5]]));

    it('returns both crossing points of a path from 10W to 10E through a box around 0 degrees (#106)', () => {
        const points = BoundaryUtils.getIntersections(primeBox, 15, -10, 15, 10);
        expect(points.map(p => p.lat)).toEqual([15, 15]);
        expect(points.map(p => p.lon).sort((a, b) => a - b)).toEqual([-5, 5]);
        expect(BoundaryUtils.intersects(primeBox, 15, -10, 15, 10)).toBe(true);
    });

    // The path from 170E to 170W is the short one across the date line, 20 degrees long; read as 170 to -170 it would
    // span the whole world through the box
    it('finds no intersection for a path across the date line with a box around 0 degrees (#106)', () => {
        expect(BoundaryUtils.intersects(primeBox, 15, 170, 15, -170)).toBe(false);
    });
```

Use `toBeCloseTo` per element if the computed longitudes are not exact.

- [ ] **Step 2: Run** — Expected: the pins and the last new test FAIL.

- [ ] **Step 3: Implement.** `intersects` becomes:

```ts
    /**
     * Returns true, if the flightpath crosses the airspace boundary
     */
    public static intersects(boundary: LodBoundary, lat1: number, lon1: number, lat2: number, lon2: number): boolean {
        return this.getIntersections(boundary, lat1, lon1, lat2, lon2).length > 0;
    }
```

In `getIntersections`, before the edge loop:

```ts
        //#106: the path and the ring are unwrapped into one continuous longitude range around the box, so that neither
        //the date line nor the prime meridian splits them. A box wider than 180 degrees is the code's sign of a box across
        //the date line (#9); its reference is 180, otherwise the middle of the box. GeoPoint normalizes the results.
        const left = boundary.facility.topLeft.long;
        const right = boundary.facility.bottomRight.long;
        const reference = right - left > 180 ? 180 : (left + right) / 2;
        const unwrap = (lon: number) => lon + 360 * Math.round((reference - lon) / 360);
        const pathLon1 = unwrap(lon1);
        const pathLon2 = pathLon1 + (((lon2 - lon1) % 360 + 540) % 360 - 180);
```

and in the loop `lon3 = unwrap(lod[current].end.lon)`, `lon4 = unwrap(lod[next].end.lon)`, calling
`getIntersectionBetweenTwoLines(lat1, pathLon1, lat2, pathLon2, lat3, lon3, lat4, lon4)`. `isInside` stays as it is.

- [ ] **Step 4: Run** the file, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the reference 180 for a date-line box → the pin `returns both crossing points of a path across
the date line`; the middle reference otherwise → `returns both crossing points of a path from 10W to 10E` (with 180
always, the box's ring breaks apart); the wrapped difference for the second longitude → `finds no intersection for a
path across the date line with a box around 0 degrees`.

- [ ] **Step 5: Commit** — `fixes #106 unwrap the path and the boundary into one longitude range around the box`

```json:metadata
{"files": ["kln90b/data/navdata/BoundaryUtils.ts", "test/unit/data/navdata/BoundaryUtils.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["both #106 pins pass", "prime meridian box crossed at 5W and 5E", "date-line path misses a box around 0", "existing tests green"], "modelTier": "standard"}
```

---

### Task 5: Class B and C are cylinders in the SUA alert (#352)

**Goal:** The vertical check skips the floor of a Class B or C area, and their messages show only the upper limit.

**Files:**
- Modify: `kln90b/data/navdata/AirspaceAlert.ts` (`isVerticallyInsideAirspace` about :140-160, `formatAirspaceAlertMessage` about :162-182)
- Test: `test/render/data/navdata/AirspaceAlert.test.ts`

**Acceptance Criteria:**
- [ ] At 1500 ft below a Class B sector from 3000 to 10000 ft the MSG page shows `INSIDE SPC USE AIRSPACE`, the name
  with `CL B`, and `BELOW 10000ft`; the same for Class C with `CL C`.
- [ ] At 5000 ft inside the Class B the text is the same; at 11000 ft (above ceiling and buffer) nothing.
- [ ] A restricted area below its floor stays silent (the existing test).

**Verify:** `npx vitest run test/render/data/navdata/AirspaceAlert.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests**, a new describe after `the vertical limits`, with a helper like `inside`
  that takes the type:

```ts
// 3-40: Class B and C (and CTA and TMA, not in the filter) are stored by their outer boundary as a cylinder, so every
// altitude below the upper limit counts as inside; figure 3-126 shows such an alert with the upper limit only
describe('Class B and C as cylinders (3-40, figure 3-126)', () => {
    async function insideOf(type: BoundaryType, altitudeFt: number) {
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt,
            airspaces: [airspace('B-TEST', type, box(46.9, 47.1, 7.9, 8.1), {minFt: 3000, maxFt: 10000})],
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        return sua(unit);
    }

    it('alerts below the floor of a Class B sector and shows only its ceiling (3-40, figure 3-126, #352)', async () => {
        expect(await insideOf(BoundaryType.ClassB, 1500)).toEqual(['INSIDE SPC USE AIRSPACE B-TEST            CL B BELOW 10000ft']);
    });

    it('alerts below the floor of a Class C sector and shows only its ceiling (3-40, figure 3-126, #352)', async () => {
        expect(await insideOf(BoundaryType.ClassC, 1500)).toEqual(['INSIDE SPC USE AIRSPACE B-TEST            CL C BELOW 10000ft']);
    });

    it('shows only the ceiling between the floor and the ceiling of a Class B sector (3-40, figure 3-126, #352)', async () => {
        expect(await insideOf(BoundaryType.ClassB, 5000)).toEqual(['INSIDE SPC USE AIRSPACE B-TEST            CL B BELOW 10000ft']);
    });

    it('does not alert above the ceiling and buffer of a Class B sector (3-39, 3-40)', async () => {
        expect(await insideOf(BoundaryType.ClassB, 11000)).toEqual([]);
    });
});
```

(`box` and `sua` are the file's existing helpers; check their names in the file.)

- [ ] **Step 2: Run** — Expected: the three `#352` tests FAIL (no message below the floor; `3000ft to 10000ft`).

- [ ] **Step 3: Implement** in `AirspaceAlert.ts`:

```ts
/**
 * 3-40: Class B and C are stored by their outer lateral boundary as a cylinder, so every altitude below the upper
 * limit counts as inside (#352)
 */
function isCylinder(airspace: BoundaryFacility): boolean {
    return airspace.type === BoundaryType.ClassB || airspace.type === BoundaryType.ClassC;
}
```

In `isVerticallyInsideAirspace` the floor condition becomes
`if (!isCylinder(airspace) && airspace.minAltType === BoundaryAltitudeType.MSL && indicatedAltitude < ...)`; the
ceiling check stays. In `formatAirspaceAlertMessage`:
`const lowLimit = !isCylinder(airspace) && airspace.minAltType === BoundaryAltitudeType.MSL ? ... : null;` with the
comment `//#352, figure 3-126: a cylinder shows its upper limit only`.

- [ ] **Step 4: Run** the file, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: `ClassB` in `isCylinder` → the Class B test at 1500 ft; `ClassC` → the Class C test; the floor
skip limited to cylinders → the existing `does not alert 1100 ft below the floor with a buffer of 1000 ft`; the
`lowLimit` change → the 5000 ft test.

- [ ] **Step 5: Commit** — `fixes #352 treat Class B and C as cylinders down to the surface and show only their upper limit`

```json:metadata
{"files": ["kln90b/data/navdata/AirspaceAlert.ts", "test/render/data/navdata/AirspaceAlert.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["Class B and C alert below the floor with BELOW 10000ft", "5000 ft shows the same text", "11000 ft silent", "restricted below floor silent"], "modelTier": "standard"}
```

---

### Task 6: The ESA of a leg counts every sector it touches (#181)

**Goal:** `MSA.getMSAFromTo` cuts the leg's great circle at every whole-degree meridian and parallel inside the leg
(parallels limited to the leg's latitude range, the vertex included) and samples start, end and each piece's middle.

**Files:**
- Modify: `kln90b/services/MSA.ts` (`getMSAFromTo` about :23-43; a new exported function `legLatitudeRange`)
- Test: `test/unit/services/MSA.test.ts`, `test/render/pages/left/Tri6Page.test.ts` (the ESA snapshot, about :12)

**Acceptance Criteria:**
- [ ] The #181 pin (about :129) passes as a plain test; the #97 test stays green.
- [ ] `legLatitudeRange` gives about 61.52 as the highest latitude of the leg 60N 0E to 60N 40E, and the endpoints'
  range where the vertex lies outside the leg.
- [ ] For a fixed list of legs, the ESA equals the highest MSA of a dense sampling of the leg (an independent oracle).
- [ ] The TRI 6 snapshot ESA is 11600, with a comment that the leg crosses 9 E at 47.73 N.

**Verify:** `npx vitest run test/unit/services/MSA.test.ts test/render/pages/left/Tri6Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the tests** in `MSA.test.ts` (the file loads the shipped `msa.json`; use its `msa` and `sector`
  helpers). Drop `.fails` from the #181 pin. Add:

```ts
import {GeoCircle, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {legLatitudeRange} from '../../../kln90b/services/MSA';

describe('legLatitudeRange', () => {
    // The great circle through 60N 0E and 60N 40E peaks halfway, at 20E: atan(tan 60 / cos 20) = 61.52 degrees
    it('reaches the vertex of a leg along a parallel', () => {
        const [min, max] = legLatitudeRange({lat: 60, lon: 0}, {lat: 60, lon: 40});
        expect(min).toBeCloseTo(60, 6);
        expect(max).toBeCloseTo(61.52, 2);
    });

    it('reaches the southern vertex in the southern hemisphere', () => {
        const [min, max] = legLatitudeRange({lat: -60, lon: 0}, {lat: -60, lon: 40});
        expect(min).toBeCloseTo(-61.52, 2);
        expect(max).toBeCloseTo(-60, 6);
    });

    it('is the range of the end points when the vertex lies outside the leg', () => {
        const [min, max] = legLatitudeRange({lat: 46, lon: 8}, {lat: 47, lon: 9});
        expect(min).toBeCloseTo(46, 6);
        expect(max).toBeCloseTo(47, 6);
    });
});

/** The independent oracle: the highest MSA of 20000 points along the great circle of the leg */
function denseEsa(from: {lat: number, lon: number}, to: {lat: number, lon: number}): number | null {
    const circle = new GeoCircle(new Float64Array(3), 0).setAsGreatCircle(from, to);
    const length = new GeoPoint(from.lat, from.lon).distance(to);
    const p = new GeoPoint(0, 0);
    let esa: number | null = 0;
    for (let i = 0; i <= 20000; i++) {
        circle.offsetDistanceAlong(from, length * i / 20000, p);
        const m = msa.getMSA(p);
        esa = m === null || esa === null ? null : Math.max(esa, m);
    }
    return esa;
}

describe('MSA.getMSAFromTo against a dense sampling of the leg (3-33, #181)', () => {
    it.each([
        ['30 NM south from 47.2N 8.5E', {lat: 47.2, lon: 8.5}, pointFrom({lat: 47.2, lon: 8.5}, 180, 30)],
        ['along 46.5N from 5.5E to 9.5E', {lat: 46.5, lon: 5.5}, {lat: 46.5, lon: 9.5}],
        ['60N 0E to 60N 40E over the vertex', {lat: 60, lon: 0}, {lat: 60, lon: 40}],
        ['diagonal 45.1N 6.9E to 47.9N 10.1E', {lat: 45.1, lon: 6.9}, {lat: 47.9, lon: 10.1}],
        ['across the date line at 52N', {lat: 52, lon: 175}, {lat: 53, lon: -170}],
        ['ABC to KBBB of the TRI 6 world', {lat: 47.5, lon: 8.9}, {lat: 48.2, lon: 9.2}],
    ])('gives the highest sector of %s (3-33, #181)', (_name, from, to) => {
        expect(msa.getMSAFromTo(from, to)).toBe(denseEsa(from, to));
    });
});
```

Check each listed leg against the oracle once: if a leg clips a sector by less than the oracle's spacing, replace it
with one that does not, and say so in the report. The ABC and KBBB coordinates must be the ones of the TRI 6 world in
`Tri6Page.test.ts`; correct them if they differ.

- [ ] **Step 2: Run** — Expected: the pin, the `legLatitudeRange` tests (not exported yet) and some oracle rows FAIL.

- [ ] **Step 3: Implement** in `MSA.ts` (import `GeoCircle`; `intermediatePoint` is then unused here, remove its
  import):

```ts
/**
 * Returns the lowest and the highest latitude of the great circle leg from coord0 to coord1: the end points, and the
 * vertex of the great circle where it lies inside the leg (#181)
 */
export function legLatitudeRange(coord0: LatLonInterface, coord1: LatLonInterface): [number, number] {
    let min = Math.min(coord0.lat, coord1.lat);
    let max = Math.max(coord0.lat, coord1.lat);
    const path = new GeoCircle(new Float64Array(3), 0).setAsGreatCircle(coord0, coord1);
    const length = new GeoPoint(coord0.lat, coord0.lon).distance(coord1);
    const n = path.center;
    const k = Math.sqrt(1 - n[2] * n[2]); // the cosine of the latitude of the circle's pole
    if (k > 1e-9) {
        //the northern vertex is the point of the circle closest to the north pole, the southern one its antipode
        const north = new Float64Array([-n[2] * n[0] / k, -n[2] * n[1] / k, k]);
        const south = new Float64Array([-north[0], -north[1], -north[2]]);
        const vertexLat = Math.asin(k) * Avionics.Utils.RAD2DEG;
        const alongNorth = path.distanceAlong(coord0, north, 1e-9);
        if (alongNorth > 0 && alongNorth < length) {
            max = Math.max(max, vertexLat);
        }
        const alongSouth = path.distanceAlong(coord0, south, 1e-9);
        if (alongSouth > 0 && alongSouth < length) {
            min = Math.min(min, -vertexLat);
        }
    }
    return [min, max];
}
```

and in the class:

```ts
    private readonly PATH = new GeoCircle(new Float64Array(3), 0);
    private readonly GRID_LINE = new GeoCircle(new Float64Array(3), 0);
    private readonly CROSSINGS = [new Float64Array(3), new Float64Array(3)];

    /**
     * 3-33: the ESA of a leg is the highest MSA of the 1-degree sectors it passes through. #181: the great circle of the
     * leg is cut at every whole-degree meridian and parallel it crosses; each piece between two cuts lies in one sector,
     * so its middle reads that sector
     */
    public getMSAFromTo(coord0: LatLonInterface, coord1: LatLonInterface): Feet | null {
        if (GeoPoint.equals(coord0, coord1)) {
            return this.getMSA(coord0);
        }
        const path = this.PATH.setAsGreatCircle(coord0, coord1);
        const length = this.GEOPOINTCACHE.set(coord0).distance(coord1);
        const cuts = [0, length];
        const addCuts = () => {
            const count = path.intersection(this.GRID_LINE, this.CROSSINGS);
            for (let i = 0; i < count; i++) {
                const along = path.distanceAlong(coord0, this.CROSSINGS[i], 1e-9);
                if (along > 0 && along < length) {
                    cuts.push(along);
                }
            }
        };

        //the parallels within the leg's latitudes (the vertex included), as small circles around the north pole
        const [minLat, maxLat] = legLatitudeRange(coord0, coord1);
        for (let lat = Math.max(-89, Math.ceil(minLat)); lat <= Math.min(89, Math.floor(maxLat)); lat++) {
            this.GRID_LINE.set(new Float64Array([0, 0, 1]), (90 - lat) * Avionics.Utils.DEG2RAD);
            addCuts();
        }
        //the meridians between the two longitudes, the short way round
        const dLon = ((coord1.lon - coord0.lon) % 360 + 540) % 360 - 180;
        const lonFrom = Math.min(coord0.lon, coord0.lon + dLon);
        const lonTo = Math.max(coord0.lon, coord0.lon + dLon);
        for (let lon = Math.ceil(lonFrom); lon <= Math.floor(lonTo); lon++) {
            const l = lon * Avionics.Utils.DEG2RAD;
            this.GRID_LINE.set(new Float64Array([-Math.sin(l), Math.cos(l), 0]), Math.PI / 2);
            addCuts();
        }

        cuts.sort((a, b) => a - b);
        let msa: number | null = 0;
        const sample = (along: number) => {
            const msa2 = this.getMSA(path.offsetDistanceAlong(coord0, along, this.GEOPOINTCACHE));
            msa = msa2 === null || msa === null ? null : Math.max(msa, msa2);
        };
        sample(0);
        sample(length);
        for (let i = 1; i < cuts.length; i++) {
            sample((cuts[i - 1] + cuts[i]) / 2);
        }
        return msa;
    }
```

Check the SDK signatures in `E:\msfs\msfs-avionics-mirror` (`GeoCircle.intersection`, `distanceAlong`,
`offsetDistanceAlong` returning the out point); adapt if they differ, keeping the behavior.

- [ ] **Step 4: Update the vehicle.** In `Tri6Page.test.ts` the ESA of the snapshot goes from 11400 to 11600; add a
  comment that the leg from ABC to KBBB crosses 9 E at 47.73 N into the sector from 47 N 9 E (11600), which the 40 NM
  steps used to miss (#181).

- [ ] **Step 5: Run** both files, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS. Also time
  `getMSAFromTo` over a 30 NM and a 3000 NM leg in a scratch script and put the numbers in the report.

Conditions → tests: the end sample → the #181 pin; the parallel cuts → the oracle rows (report which row goes red
without them); the meridian cuts → the oracle row `along 46.5N`; the vertex in `legLatitudeRange` → `reaches the
vertex of a leg along a parallel`; the `along > 0 && along < length` checks → `is the range of the end points when the
vertex lies outside the leg` for the vertex, and report for the cuts.

- [ ] **Step 6: Commit** — `fixes #181 take the ESA of a leg from every 1-degree sector its great circle passes through`

```json:metadata
{"files": ["kln90b/services/MSA.ts", "test/unit/services/MSA.test.ts", "test/render/pages/left/Tri6Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["#181 pin passes, #97 green", "legLatitudeRange vertex 61.52 and endpoint range", "ESA equals the dense oracle for the listed legs", "TRI 6 snapshot ESA 11600 with comment"], "modelTier": "frontier"}
```

---

### Task 7: Dashes for calculator values that do not fit (#257)

**Goal:** `SelectField` can show a text in place of its value; `SpeedFieldset` and `TempFieldset` show dashes for a
value that does not fit (a temperature of 100 to 999 with its hundreds digit in the sign cell) and edit a dashed field
from 0; `SpeedDisplay`, `formatDuration`, `TripFuelDisplay` and `RoundedDistanceDisplay` show their no-value form for
NaN, infinite, negative or too large values.

**Files:**
- Modify: `kln90b/controls/selects/SelectField.tsx`, `kln90b/controls/selects/SpeedFieldset.tsx`,
  `kln90b/controls/selects/TempFieldset.tsx`, `kln90b/controls/displays/SpeedDisplay.tsx`,
  `kln90b/controls/displays/DurationDisplay.tsx`, `kln90b/controls/displays/FuelDisplay.tsx` (`TripFuelDisplay`),
  `kln90b/controls/displays/RoundedDistanceDisplay.tsx`
- Test: `test/render/controls/selects/SpeedFieldset.test.ts`, `test/render/controls/selects/TempFieldset.test.ts`,
  `test/render/controls/displays/SpeedDisplay.test.ts`, `DurationDisplay.test.ts`, `FuelDisplay.test.ts`,
  `RoundedDistanceDisplay.test.ts`, `test/render/pages/left/Tri1Page.test.ts`, `test/render/pages/left/Tri3Page.test.ts`

**Acceptance Criteria:**
- [ ] CAL 5: 869 kt shows `   ---mph  `, 868 kt `   999mph  `; a stored 1150 mph opens as dashes; from the dashed mph,
  the hundreds turned up once give `100mph` and `087kt`, turned down once `900mph` and `782kt`.
- [ ] CAL 5: 40 °C shows `104°F`; -80 °C shows `---°F`; from 104 °F the tens turned up once give `010°F` and `-12°C`.
- [ ] The displays: `SpeedDisplay` 999.4 → `999`, 999.5 / NaN / -1 / Infinity → `---`; `formatDuration` NaN /
  Infinity / -60 → `--:--`; `TripFuelDisplay` 99999 → `99999`, 99999.5 / Infinity / NaN / -12 → `---.-`;
  `RoundedDistanceDisplay` (right) 9999 → `9999`, 9999.5 / NaN → `----`.
- [ ] TRI 3 with the GS typed to 0 shows F REQ `---.-`, with and without a fuel flow; TRI 1 to a waypoint 10500 NM away
  shows `----nm` and no error.

**Verify:** `npx vitest run test/render/controls test/render/pages/left` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests.** In `SpeedFieldset.test.ts` (CAL 5 host; the file's comment about #257 is
  rewritten for the ruling), a describe `a speed that does not fit (characterization, #257)`:

```ts
// #257: a computed value too large for its field shows dashes (the KLN 89 shows dashes for its CAL values out of
// range, checked in the KLN 89 trainer, 2026-10-17); the 90B's own form here is a characterization
describe('a speed that does not fit its three cells (characterization, #257)', () => {
    it('shows 999 mph for 868 kt and dashes for 869 kt (characterization)', async () => {
        const unit = await onKnots(867, 998);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 1); // 868 kt
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[5]).toBe('   999mph  ');
        await unit.panel.inner('L', 1); // 869 kt = 1000.03 mph
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[5]).toBe('   ---mph  ');
    });

    it('opens a stored 1150 mph as dashes (characterization)', async () => {
        await onKnots(999, 1150);
        expect(Screen.read().rows('L')[5]).toBe('   ---mph  ');
    });

    it('edits the dashed mph from 000: up gives 100 mph and 087 kt (characterization)', async () => {
        const unit = await onKnots(899, 1034.6);
        await unit.panel.outer('L', 3); // the hundreds of the mph
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(4)).toEqual(['   087kt   ', '   100mph  ']);
    });

    it('edits the dashed mph from 000: down gives 900 mph and 782 kt (characterization)', async () => {
        const unit = await onKnots(899, 1034.6);
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(4)).toEqual(['   782kt   ', '   900mph  ']);
    });
});
```

In `TempFieldset.test.ts` (its CAL 5 host, rows 1 and 2 for °C and °F): 40 °C entered shows `   104°F   `; -80 °C
shows `   ---°F   `; from 104 °F, cursor on the °F tens, inner +1 gives `   010°F   ` and `   -12°C   `; a stored 104 °F
opens as `104`. Title them `(characterization, #257)` except the 104 °F display, which the 89 cannot show either:
also a characterization. In the display test files, the cases of the acceptance criteria, each its own `it`, labeled
`(characterization, #257)`. In `Tri3Page.test.ts`: GS typed to 0 with FF 10 and with FF 0 → F REQ `---.-`
(`(characterization, #257)`; the KLN 89's CAL 2 showed `----` at GS 0). In `Tri1Page.test.ts`: a waypoint
`pointFrom(position, 0, 10500)` → row 1 starts `----nm`, `unit.errors` empty.

Grep the suite for tests that assert the old forms (`99999` as F REQ at GS 0, a blank F REQ, `999` for a clamped speed,
`010°F`, `115mph`) and treat each as a vehicle.

- [ ] **Step 2: Run** — Run: `npx vitest run test/render/controls test/render/pages/left` — Expected: the new tests FAIL.

- [ ] **Step 3: Implement `SelectField.displayOverride`**:

```ts
    /** #257: a text shown in place of the value (dashes, or a digit the value set does not hold), until cleared */
    public displayOverride: string | null = null;
```

`render()` and `tick()` show `this.displayOverride ?? this.valueSet[this.value]`.

- [ ] **Step 4: Implement `SpeedFieldset`**:

```ts
export class SpeedFieldset implements UiElement {
    readonly children: UIElementChildren<SpeedFieldsetTypes>;
    /** null while the field shows dashes: it holds no value, and an edit starts from 000 (#257) */
    private speed: Knots | null = null;

    constructor(speed: Knots | null, private readonly callback: (Speed: Knots) => void) {
        this.children = new UIElementChildren<SpeedFieldsetTypes>({
            Speed100: new SelectField(SPEED_SET, 0, this.saveSpeed100.bind(this)),
            Speed10: new SelectField(SPEED_SET, 0, this.saveSpeed10.bind(this)),
            Speed1: new SelectField(SPEED_SET, 0, this.saveSpeed1.bind(this)),
        });
        this.setSpeed(speed);
    }

    // render() and tick() unchanged

    /**
     * #257: a speed that does not fit the three cells (or none, or NaN) shows dashes
     */
    public setSpeed(speed: Knots | null): void {
        const rounded = speed === null ? NaN : Math.round(speed);
        if (!(rounded >= 0 && rounded <= 999)) {
            this.speed = null;
            this.showDigits(null);
            return;
        }
        this.speed = speed;
        this.showDigits(format(rounded, "000"));
    }

    private showDigits(digits: string | null): void {
        const fields = [this.children.get("Speed100"), this.children.get("Speed10"), this.children.get("Speed1")];
        fields.forEach((field, i) => {
            field.value = digits === null ? 0 : Number(digits.substring(i, i + 1));
            field.displayOverride = digits === null ? "-" : null;
        });
    }

    private saveSpeed100(newSpeed100: number): void {
        const oldSpeed = format(this.speed ?? 0, "000");
        this.save(Number(newSpeed100 + oldSpeed.substring(1)));
    }

    private saveSpeed10(newSpeed10: number): void {
        const oldSpeed = format(this.speed ?? 0, "000");
        this.save(Number(oldSpeed.substring(0, 1) + newSpeed10 + oldSpeed.substring(2)));
    }

    private saveSpeed1(newSpeed1: number): void {
        const oldSpeed = format(this.speed ?? 0, "000");
        this.save(Number(oldSpeed.substring(0, 2) + newSpeed1));
    }

    private save(speed: Knots): void {
        this.speed = speed;
        this.showDigits(format(speed, "000"));
        this.callback(speed);
    }
}
```

- [ ] **Step 5: Implement `TempFieldset`** the same way, with three states in `setTemp(temp: Celsius | null)`:
  `rounded = Math.round(temp)`; `-99..99` shows the sign cell (`-` or `0`) and two digits as today and holds the
  value; `100..999` holds no value (`this.temp = null`) and shows the three digits of `rounded` through
  `displayOverride` on all three cells (the sign cell shows the hundreds digit; its value stays 1, i.e. `0`); anything
  else (NaN, `<= -100`, `>= 1000`) shows `-` in all three cells and holds no value. The save methods read
  `Math.abs(this.temp ?? 0)` and the sign from the sign cell's value as today, then clear every override and show the
  new value. The constructor calls `setTemp`.

- [ ] **Step 6: Implement the displays.**

```ts
// SpeedDisplay.formatSpeed
        if (this.speed === null) {
            return "---";
        }
        const rounded = Math.round(this.speed);
        if (!(rounded >= 0 && rounded <= 999)) {
            return "---"; //#257: a speed that does not fit shows dashes, it was clamped to 999
        }
        return format(rounded, "0").padStart(3, " ");
```

```ts
// formatDuration, first lines
    if (duration === null || !Number.isFinite(duration) || duration < 0) {
        return "--:--"; //#257: NaN and negative durations too
    }
```

```ts
// TripFuelDisplay.formatFuel
        if (this.fuel === null || !(this.fuel >= 0) || Math.round(this.fuel) > 99999) {
            return "---.-"; //#257: a fuel that does not fit shows dashes, it was capped at 99999
        }
        //Compare the rounded value, 99.97 is shown as 100.0 otherwise
        if (Math.round(this.fuel * 10) / 10 >= 100) { //Number is too large for decimals
            return format(this.fuel, "00").padStart(5, " ");
        } else {
            return format(this.fuel, "0.0").padStart(5, " ");
        }
```

```ts
// RoundedDistanceDisplay.formatDistance
        if (this.distance === null) {
            return "----";
        }
        const rounded = Math.round(this.distance);
        if (!(rounded <= 9999)) {
            return this.align("----"); //#257: a distance that does not fit shows dashes, it overflowed the row
        }
        return this.align(format(rounded, "0").padStart(3, " "));
```

- [ ] **Step 7: Run** the task's files, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS;
  vehicles updated with a comment.

Conditions → tests: the `rounded >= 0 && <= 999` range of `SpeedFieldset` → `shows 999 mph for 868 kt and dashes for
869 kt`; the constructor's `setSpeed` → `opens a stored 1150 mph as dashes`; `this.speed ?? 0` with cleared overrides
→ the two edit tests; the three `TempFieldset` states → its three display tests and the edit test; each display
condition → its own case (NaN, Infinity, negative, too large; name which case goes red for each mutated condition).

- [ ] **Step 8: Commit** — `fixes #257 show dashes for a calculator value that does not fit its field, and edit a dashed field from zero`

```json:metadata
{"files": ["kln90b/controls/selects/SelectField.tsx", "kln90b/controls/selects/SpeedFieldset.tsx", "kln90b/controls/selects/TempFieldset.tsx", "kln90b/controls/displays/SpeedDisplay.tsx", "kln90b/controls/displays/DurationDisplay.tsx", "kln90b/controls/displays/FuelDisplay.tsx", "kln90b/controls/displays/RoundedDistanceDisplay.tsx", "test/render/controls/selects/SpeedFieldset.test.ts", "test/render/controls/selects/TempFieldset.test.ts", "test/render/controls/displays/SpeedDisplay.test.ts", "test/render/controls/displays/DurationDisplay.test.ts", "test/render/controls/displays/FuelDisplay.test.ts", "test/render/controls/displays/RoundedDistanceDisplay.test.ts", "test/render/pages/left/Tri1Page.test.ts", "test/render/pages/left/Tri3Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["CAL 5 mph dashes from 869 kt, edit from 000", "CAL 5 104 F shown, -112 dashed, edit from 000", "display cases dash for NaN, Infinity, negative, too large", "TRI 3 F REQ dashes at GS 0", "TRI 1 10500 NM shows ----nm"], "modelTier": "frontier"}
```

---

### Task 8: The CAL 4 angle shows dashes from 10 degrees (#314)

**Goal:** `VnavAngleFieldset` shows `-.-` for an angle that rounds to 10.0 or more (or none) and edits a dashed angle
from 0.0.

**Files:**
- Modify: `kln90b/controls/selects/VnavFieldsets.tsx` (`VnavAngleFieldset`, about :62-108)
- Test: `test/render/controls/selects/VnavFieldsets.test.ts`, `test/render/pages/left/Cal4Page.test.ts`

**Acceptance Criteria:**
- [ ] GS 60 and FPM 1100 show `ANGLE: -.-°` (the degree sign in the last cell); FPM 1060 shows `ANGLE: 9.9°`.
- [ ] A stored angle of 10.26 opens as `-.-`.
- [ ] From the dashed angle, the units turned up once give `ANGLE: 1.0°` and `FPM:   0100` at GS 60.
- [ ] The #314 pin (about :87, `#NEW-4-3` in its title becomes `#314`) passes as a plain test.

**Verify:** `npx vitest run test/render/controls/selects/VnavFieldsets.test.ts test/render/pages/left/Cal4Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests** in `VnavFieldsets.test.ts`, describe `VNAV angle fieldset`, labeled
  `(characterization, #314)` (no source shows the 90B's form): the three criteria above. 60 kt is 6076.1 ft/min;
  atan(1100 / 6076.1) = 10.26°, atan(1060 / 6076.1) = 9.90°; 1.0° at 60 kt is 106 ft/min, rounded to 100. Reach the
  angle cells on CAL 4 with `outer('L', 5)` from the first field (GS 3 cells, FPM 2 editable cells); check the focus
  with `unit.panel.focused('L')`.

- [ ] **Step 2: Run** — Expected: FAIL (`ANGLE: 1.° ` and no dashes).

- [ ] **Step 3: Implement** `VnavAngleFieldset` like `SpeedFieldset` of Task 7: `private angle: Degrees | null`;
  `setValue(angle: Degrees | null)` computes `tenths = angle === null ? NaN : Math.round(Math.abs(angle) * 10)`; if
  `!(tenths <= 99)` it sets `angle = null`, the sign text `" "`, both cells' value 0 and `displayOverride = "-"`;
  otherwise the digits come from `format(tenths / 10, "0.0")` with the overrides cleared. The constructor calls
  `setValue`. The save methods read `format(this.angle ?? 0, "+0.0", {zeroFormat: "+0.0"})`, then clear the overrides
  (show the new value) and call the callback. Comment: `//#314: an angle that does not fit the cells shows dashes`.

- [ ] **Step 4: Run** the files, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS. NAV 4 also uses
  this fieldset: report any NAV 4 test that changes as a vehicle.

Conditions → tests: `tenths <= 99` → the 10.26 and 9.90 tests; the constructor's `setValue` → the stored 10.26 test;
`this.angle ?? 0` with cleared overrides → the edit test.

- [ ] **Step 5: Commit** — `fixes #314 show dashes for a CAL 4 angle of 10 degrees or more`

```json:metadata
{"files": ["kln90b/controls/selects/VnavFieldsets.tsx", "test/render/controls/selects/VnavFieldsets.test.ts", "test/render/pages/left/Cal4Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["10.26 deg shows -.-, 9.90 shows 9.9", "stored 10.26 opens dashed", "edit from dashes gives 1.0 and 0100", "#314 pin passes"], "modelTier": "standard"}
```

---

### Task 9: The CAL 4 rate shows dashes from 10000 ft/min (#346)

**Goal:** `FpmFieldset` shows `----` for a rate of 10000 ft/min or more (or none) and edits a dashed rate from 0000.

**Files:**
- Modify: `kln90b/controls/selects/FpmFieldset.tsx`
- Test: `test/render/controls/selects/FpmFieldset.test.ts`

**Acceptance Criteria:**
- [ ] At GS 600, angle 9.2 shows `FPM:   9800`; angle 9.3 (9950 ft/min, rounded to 10000) shows `FPM:   ----` and
  stores 10000 in `cal4Fpm`.
- [ ] A stored 10500 opens as `----`.
- [ ] From the dashed rate, the thousands turned up once give `FPM:   1000`, `ANGLE: 0.9°` and `cal4Fpm` 1000 (not
  20500 as in the issue).

**Verify:** `npx vitest run test/render/controls/selects/FpmFieldset.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests** in `FpmFieldset.test.ts`, a describe `a rate that does not fit
  (characterization, #346)`. 600 kt is 60761 ft/min; tan 9.2° × 60761 = 9842 → 9800; tan 9.3° × 60761 = 9950 → 10000;
  atan(1000 / 60761) = 0.94°. Start from storage `{cal4GS: 600, cal4Fpm: 9800, cal4Angle: 9.2}`, cursor on the angle
  tenths (`outer('L', 6)` from GS; check the focus), inner +1.

- [ ] **Step 2: Run** — Expected: FAIL (`FPM:   1000` shown for 10000; the edit gives 2000).

- [ ] **Step 3: Implement** like `SpeedFieldset`: `private fpm: number | null`; `setFpm(fpm: number | null)` with
  `rounded = Math.round(fpm)`, `!(rounded >= 0 && rounded <= 9999)` → all four cells `displayOverride = "-"`, value 0,
  `fpm = null`; otherwise `format(rounded, "0000")` digits with the overrides cleared. The constructor calls `setFpm`.
  The save methods read `format(this.fpm ?? 0, "0000")` and clear the overrides. Comment
  `//#346: a rate that does not fit the four cells shows dashes; an edit starts from 0000, not from a hidden fifth digit`.
  `Cal4Page` stays as it is.

- [ ] **Step 4: Run** the file, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the range → the 9.2/9.3 test; the constructor → the stored 10500 test; `this.fpm ?? 0` → the edit
test.

- [ ] **Step 5: Commit** — `fixes #346 show dashes for a CAL 4 rate of 10000 ft/min or more and edit it from zero`

```json:metadata
{"files": ["kln90b/controls/selects/FpmFieldset.tsx", "test/render/controls/selects/FpmFieldset.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["9.2 deg 9800, 9.3 deg dashes and 10000 stored", "stored 10500 opens dashed", "edit from dashes gives 1000 and 0.9"], "modelTier": "standard"}
```

---

### Task 10: CAL 3 has no wind for a TAS that does not fit (#389)

**Goal:** CAL 3 treats a TAS that does not fit its three cells (CAL 2 can hand it more than 999 kt) as no TAS: its
TAS shows dashes (Task 7) and its wind rows show dashes.

**Files:**
- Modify: `kln90b/pages/left/Cal3Page.tsx` (`redraw`, about :76-91)
- Test: `test/render/pages/left/Cal3Page.test.ts`, `test/render/pages/left/Cal2Page.test.ts`

**Acceptance Criteria:**
- [ ] With `cal3Tas` 1063.5 CAL 3 shows `---` for TAS, the wind component, the wind direction and the wind speed.
- [ ] With `cal3Tas` 999 the wind rows show numbers.
- [ ] CAS 999, ALT 40000, TAT 0 on CAL 2 show `---kt` for TAS, and CAL 3 then shows dashes for TAS and wind.

**Verify:** `npx vitest run test/render/pages/left/Cal3Page.test.ts test/render/pages/left/Cal2Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests** (`(characterization, #389)`): boot with storage `{cal3Tas: 1063.5,
  cal3HeadingMag: 0}`, `moveAircraft` to 120 kt on track 000 as the file's `cal3` helper does, select CAL 3, read rows
  1, 3, 4 and 5; the sibling with 999. In `Cal2Page.test.ts`, enter CAS 999, ALT 40000, TAT 0 (or boot them from
  storage `cal2Cas`, `cal12IndicatedAltitude`, the TAT key the page uses), check `---kt`, then select CAL 3.

- [ ] **Step 2: Run** — Expected: the wind rows show numbers today.

- [ ] **Step 3: Implement** at the top of `Cal3Page.redraw`, after the heading:

```ts
        const tas = this.props.userSettings.getSetting('cal3Tas').get();
        if (!(Math.round(tas) <= 999)) {
            //#389: a TAS that does not fit the field (CAL 2 computes more than 999 kt) shows dashes and gives no wind
            this.children.get("windLabel").text = "HDWND";
            this.children.get("windComponent").speed = null;
            this.children.get("windDir").bearing = null;
            this.children.get("windSpeed").speed = null;
            return;
        }
```

and use `tas` in the three wind calls below.

- [ ] **Step 4: Run** the files, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the guard → the 1063.5 test (the 999 sibling holds the boundary).

- [ ] **Step 5: Commit** — `fixes #389 give CAL 3 no wind for a TAS from CAL 2 that does not fit its field`

```json:metadata
{"files": ["kln90b/pages/left/Cal3Page.tsx", "test/render/pages/left/Cal3Page.test.ts", "test/render/pages/left/Cal2Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["cal3Tas 1063.5 dashes TAS and wind", "cal3Tas 999 shows wind", "CAL 2 CAS 999 ALT 40000 TAT 0 shows ---kt and CAL 3 dashes"], "modelTier": "standard"}
```

---

### Task 11: The TRI ground speed along the course (#167)

**Goal:** `calculateGroundspeedAlongCourse` replaces the heading formula on TRI 1, 3 and 5 and returns null where the
wind leaves no solution or no forward speed; those pages then show GS, ETE and F REQ as dashes.

**Files:**
- Modify: `kln90b/data/Wind.ts`, `kln90b/pages/left/Tri1Page.tsx`, `kln90b/pages/left/Tri3Page.tsx`,
  `kln90b/pages/left/Tri5Page.tsx`
- Test: `test/unit/data/Wind.test.ts`, `test/render/pages/left/Tri3Wind.test.ts`,
  `test/render/pages/left/Tri1Page.test.ts`, `test/render/pages/left/Tri5Page.test.ts`

**Acceptance Criteria:**
- [ ] `calculateGroundspeedAlongCourse(150, 180, 30, 90)` ≈ 146.97; `(200, 180, 25, 180)` = 175;
  `(0, 180, 30, 0)` = 30 (tailwind at TAS 0, the clamp); `(20, 180, 50, 45)` = null (no solution);
  `(100, 180, 150, 180)` = null; `(100, 180, 100, 180)` = null.
- [ ] The #167 pin (`Tri3Wind.test.ts` about :39) passes as a plain test; TRI 3 with TAS 20 and 50 kt from 045 shows
  `---kt --:--` and F REQ `---.-`.
- [ ] TRI 1 and TRI 5 show 147 kt for TAS 150 with a 30 kt crosswind on a southbound course.
- [ ] A TRI page with no route still shows GS `000`.

**Verify:** `npx vitest run test/unit/data/Wind.test.ts test/render/pages/left` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests.** In `Wind.test.ts` replace `gives the ground speed for a heading (vector
  sum)` (the function goes) with the six cases of the first criterion, each its own `it`; the 5-2 headwind case keeps
  its page; the others are math (`(#167)`). In `Tri3Wind.test.ts` drop `.fails` and add the no-solution case. In
  `Tri1Page.test.ts` and `Tri5Page.test.ts` one crosswind case each (a waypoint 60 NM due south, TAS 150, wind 090 at
  30 kt → `147kt`).

- [ ] **Step 2: Run** — Expected: FAIL (the function does not exist; 153 kt).

- [ ] **Step 3: Implement** `Wind.ts` (remove `calculateGroundspeed`):

```ts
/**
 * #167, 5-2, 5-3: the ground speed along a course: the aircraft crabs into the wind to hold the course.
 * Returns null where the crosswind is stronger than the TAS (no heading holds the course) or no forward speed is left.
 * https://edwilliams.org/avform147.htm#Wind
 */
export function calculateGroundspeedAlongCourse(tas: Knots, course: Degrees, windspeed: Knots, windDirection: Degrees): Knots | null {
    const angle = (windDirection - course) * Avionics.Utils.DEG2RAD;
    const crosswind = windspeed * Math.sin(angle);
    const radicand = tas ** 2 - crosswind ** 2;
    if (radicand < -1e-6) {
        return null;
    }
    //the clamp absorbs rounding: sin(180 deg) is not exactly 0, which made a tailwind at TAS 0 the root of a negative
    const groundspeed = Math.sqrt(Math.max(0, radicand)) - windspeed * Math.cos(angle);
    return groundspeed > 0 ? groundspeed : null;
}
```

In TRI 1 and TRI 3: `this.gs = calculateGroundspeedAlongCourse(...)`;
`this.ete = this.gs === null ? null : this.dist / this.gs * HOURS_TO_SECONDS;` and
`this.children.get("gs").setSpeed(this.dist === null ? 0 : this.gs);` (no route keeps `000`; no solution shows
dashes). In TRI 5 (still the mean of the leg speeds; Task 12 changes that): if any leg's speed is null, `this.gs` and
`this.ete` are null; same `setSpeed` rule.

- [ ] **Step 4: Run** the files, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: `radicand < -1e-6` → `(20, 180, 50, 45)` (without it the tailwind part gives +35 kt); the clamp →
`(0, 180, 30, 0)`; `groundspeed > 0` → `(100, 180, 150, 180)` and `(100, 180, 100, 180)`; the page's
`this.dist === null ? 0` → the no-route test (find or add one per page); TRI 5's null leg → a TRI 5 no-solution case
(add it).

- [ ] **Step 5: Commit** — `fixes #167 compute the TRI ground speed along the course, and show dashes where the wind leaves no solution`

```json:metadata
{"files": ["kln90b/data/Wind.ts", "kln90b/pages/left/Tri1Page.tsx", "kln90b/pages/left/Tri3Page.tsx", "kln90b/pages/left/Tri5Page.tsx", "test/unit/data/Wind.test.ts", "test/render/pages/left/Tri3Wind.test.ts", "test/render/pages/left/Tri1Page.test.ts", "test/render/pages/left/Tri5Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["six unit cases", "#167 pin passes, no-solution dashes", "TRI 1 and TRI 5 147 kt", "no route keeps 000"], "modelTier": "standard"}
```

---

### Task 12: The TRI 5 ETE is the sum of the leg times (#254)

**Goal:** TRI 5 sums the leg times for the ETE and shows the plan distance over that time as its GS.

**Files:**
- Modify: `kln90b/pages/left/Tri5Page.tsx` (`setFpl`, about :91-106)
- Test: `test/render/pages/left/Tri5Page.test.ts`

**Acceptance Criteria:**
- [ ] The #254 pin (about :152) passes as a plain test (` 1:39`).
- [ ] The same plan shows `182kt`; the GS hundreds turned up give `282kt  1:04`, and back down `182kt  1:39`.

**Verify:** `npx vitest run test/render/pages/left/Tri5Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests** in the describe `TRI 5 ground speed with a wind that differs per leg`
  (5-6): drop `.fails` from the pin; add `shows the plan distance over the summed leg times as the GS, 182kt (#254)`
  (300 NM / 1.65 h = 181.8 kt; the guide does not say which GS the row shows, so title it `(characterization, #254)`)
  and the edit-and-restore case (300 / 282 h = 1:04; 300 / 182 h = 1:39), `(characterization, #254)`. Reach the GS
  hundreds with the cursor as `recomputes the ETE from a ground speed entered with the knobs` does.

- [ ] **Step 2: Run** — Expected: FAIL (`150kt  2:00`).

- [ ] **Step 3: Implement** the loop:

```ts
            const from = new GeoPoint(0, 0);
            let hours = 0;
            let noSolution = false;
            this.dist = 0;
            for (let i = 1; i < fplLegs.length; i++) {
                from.set(fplLegs[i - 1].wpt);
                const legDist = UnitType.GA_RADIAN.convertTo(from.distance(fplLegs[i].wpt), UnitType.NMILE);
                this.dist += legDist;
                const legGs = calculateGroundspeedAlongCourse(this.props.memory.triPage.tas, from.bearingTo(fplLegs[i].wpt), this.props.memory.triPage.windSpeed, this.props.memory.triPage.windDirTrue);
                if (legGs === null) {
                    noSolution = true;
                } else {
                    hours += legDist / legGs;
                }
            }

            //#254, 5-6: the ETE of the plan is the sum of the leg times, and the GS row is the distance over that time
            this.gs = noSolution ? null : this.dist / hours;
            this.ete = noSolution ? null : hours * HOURS_TO_SECONDS;
```

- [ ] **Step 4: Run** the file, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the sum of leg times → the pin; `dist / hours` → the 182kt test (the mean gives 150kt); the
`noSolution` path → Task 11's TRI 5 no-solution test.

- [ ] **Step 5: Commit** — `fixes #254 sum the leg times for the TRI 5 ETE and show the distance over that time as its ground speed`

```json:metadata
{"files": ["kln90b/pages/left/Tri5Page.tsx", "test/render/pages/left/Tri5Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["#254 pin passes", "GS row 182kt", "edit 282kt 1:04 and back 182kt 1:39"], "modelTier": "mechanical"}
```

---

### Task 13: A leg without length adds nothing to TRI 5 (#388)

**Goal:** TRI 5 skips a leg of length zero (the same waypoint twice), whose bearing is NaN.

**Files:**
- Modify: `kln90b/pages/left/Tri5Page.tsx` (the loop of Task 12)
- Test: `test/render/pages/left/Tri5Page.test.ts`

**Acceptance Criteria:**
- [ ] FPL 0 KAAA, KBBB, KBBB with TAS 150 and no wind shows the GS `150kt` and the ETE of KAAA to KBBB.
- [ ] FPL 0 KAAA, KAAA shows GS `---` and ETE ` 0:00`.

**Verify:** `npx vitest run test/render/pages/left/Tri5Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests** (`(characterization, #388)`; 5-6 says nothing on repeated waypoints), using
  `savedFlightplan(0, [kaaa, kbbb, kbbb])` and `savedFlightplan(0, [kaaa, kaaa])`. If the harness refuses such a plan,
  say so in the report and build it in `unit.props.memory.fplPage.flightplans[0]` instead.

- [ ] **Step 2: Run** — Expected: FAIL (`---kt --:--` after Task 7, `NaN` before).

- [ ] **Step 3: Implement** in the loop, right after `legDist`:

```ts
                if (legDist === 0) {
                    continue; //#388: a leg from a waypoint to itself has no course and takes no time
                }
```

A plan whose legs all have no length then gives `0 / 0` = NaN as GS, which Task 7's fieldset shows as dashes, and an
ETE of 0.

- [ ] **Step 4: Run** the file, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the `legDist === 0` skip → the KAAA, KBBB, KBBB test.

- [ ] **Step 5: Commit** — `fixes #388 skip a leg from a waypoint to itself in the TRI 5 sums`

```json:metadata
{"files": ["kln90b/pages/left/Tri5Page.tsx", "test/render/pages/left/Tri5Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["KAAA KBBB KBBB shows 150kt and the KAAA-KBBB ETE", "KAAA KAAA shows --- and 0:00"], "modelTier": "mechanical"}
```

---

### Task 14: CAL 7 computes for the date shown in its zone (#166)

**Goal:** `Sun.ts` takes the day of the year and the returned date from the stamp's own zone, and CAL 7 hands it the
date as shown in the selected zone.

**Files:**
- Modify: `kln90b/data/Sun.ts` (`calculateSunriseSet`, about :20-24 and :91), `kln90b/pages/left/Cal7Page.tsx` (`redraw`)
- Test: `test/unit/data/Sun.test.ts`, `test/render/pages/left/Cal7Page.test.ts`

**Acceptance Criteria:**
- [ ] The #166 pin (`Sun.test.ts` about :150) passes as a plain test.
- [ ] CAL 7 at KBBB (42 N 88 W), CST, at 02:00 UTC on 04 MAR 2026 (20:00 CST on 03 MAR) shows `03 MAR 26`,
  `RISE  06:24`, `SET   17:44`.

**Verify:** `npx vitest run test/unit/data/Sun.test.ts test/render/pages/left/Cal7Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing test** in `Cal7Page.test.ts`, describe `CAL 7 page (5-15)`:
  `computes rise and set for the date shown in the zone, in the evening when UTC is already on the next day (5-15, #166)`.
  Set the clock to 2026-03-04 02:00 UTC and the system zone to CST (the inventory's probes in the session scratchpad
  `inventory/probes/` show how), select CAL 7 and assert the three rows. The times are those the page shows at 08:00
  CST on 03 MAR, where the two dates agree (inventory probe). Drop `.fails` from the Sun.test pin.

- [ ] **Step 2: Run** — Expected: FAIL (`06:22`, `17:45`, the times of 04 MAR).

- [ ] **Step 3: Implement.** In `Sun.ts`:

```ts
function calculateSunriseSet(date: TimeStamp, coords: LatLonInterface, zenith: Degrees, isRise: boolean): TimeStamp | null {
    //#166, 5-15: the calendar date in the stamp's own zone is the day asked for, not the UTC date of the stamp
    //1. first calculate the day of the year
    const N = calcDayOfYear(date);
```

and the return becomes
`return TimeStamp.create(Date.UTC(date.getYear(), date.getMonth(), date.getDate()) + (hours * 60 + minutes) * 60000);`
(remove `utcDate` if unused). In `Cal7Page.redraw`:

```ts
            const timeZone = TIMEZONES[this.props.memory.calPage.cal7Timezone!];
            //#166: the date on the page is shown in the selected zone, and the times are for that date
            const date = this.props.memory.calPage.cal7DateZ!.atTimezone(timeZone);
            const sunrise = calculateSunrise(date, this.props.memory.calPage.cal7Wpt);
            const sunset = calculateSunset(date, this.props.memory.calPage.cal7Wpt);
```

Check the test `puts the sunrise and the sunset of ORD on the UTC day of the date` (a UTC stamp: unchanged).

- [ ] **Step 4: Run** the files, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: `calcDayOfYear(date)` → the Sun pin; CAL 7's `atTimezone(timeZone)` → the new CAL 7 test (with the
UTC stamp it gets 04 MAR).

- [ ] **Step 5: Commit** — `fixes #166 compute sunrise and sunset for the date shown in the selected zone`

```json:metadata
{"files": ["kln90b/data/Sun.ts", "kln90b/pages/left/Cal7Page.tsx", "test/unit/data/Sun.test.ts", "test/render/pages/left/Cal7Page.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["#166 pin passes", "CAL 7 20:00 CST 03 MAR shows 03 MAR 06:24 17:44"], "modelTier": "standard"}
```

---

### Task 15: CAL 7 keeps its date across a zone change (#390)

**Goal:** CAL 7 stores a calendar date (`cal7Date`), so a zone change and a return to the page keep the date as
entered; the date of first use is today in the selected zone.

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`cal7DateZ` → `cal7Date`, about :129, :221, :295),
  `kln90b/pages/left/Cal7Page.tsx`
- Test: `test/render/pages/left/Cal7Page.test.ts`, `test/render/controls/editors/DateEditor.test.ts` (about :71-85),
  `test/render/data/VolatileMemory.test.ts` (about :214, :234)

**Acceptance Criteria:**
- [ ] At 02:00 UTC on 04 MAR 2026 with the system zone UTC, CAL 7 shows `04 MAR 26`; the zone changed to CST leaves
  `04 MAR 26` and shows `RISE  06:22`, `SET   17:45`.
- [ ] Leaving CAL 7 and coming back still shows `04 MAR 26`.
- [ ] With the system zone CST at the same instant, the first use shows `03 MAR 26`.

**Verify:** `npx vitest run test/render/pages/left/Cal7Page.test.ts test/render/controls/editors/DateEditor.test.ts test/render/data/VolatileMemory.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the failing tests** in `Cal7Page.test.ts`: the zone change and the return (cite `5-15` for the
  date default and `checked in the KLN 89 trainer, 2026-10-17` for the zone change keeping the date and shifting the
  times, which the record shows), and the first-use date in the selected zone (5-15). The times of 04 MAR in CST at
  KBBB are 06:22 and 17:45 (inventory probe). Move the cursor to the zone field and turn it from UTC (index 0) to CST
  (index 7) with the inner knob.

- [ ] **Step 2: Run** — Expected: the zone change shows the times of 03 MAR (06:24, 17:44) and the return shows
  `03 MAR 26`.

- [ ] **Step 3: Implement.** `VolatileMemory`: `cal7Date: TimeStamp | null` (comment: the calendar date shown on CAL 7,
  a UTC midnight stamp used only for its year, month and day; #390), initialized and reset to null. `Cal7Page`:

```ts
        let zone = this.props.memory.calPage.cal7Timezone;
        if (zone === null) {
            zone = this.props.userSettings.getSetting("timezone").get();
            this.props.memory.calPage.cal7Timezone = zone;
        }

        let date = this.props.memory.calPage.cal7Date;
        if (date === null) {
            //5-15: the date defaults to today, in the zone the page shows
            const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[zone]);
            date = TimeStamp.createDate(now.getYear(), now.getMonth(), now.getDate());
            this.props.memory.calPage.cal7Date = date;
        }
```

`new DateEditor(this.props.bus, date, this.saveDate.bind(this))`;
`saveDate(date)` stores `TimeStamp.createDate(date.getYear(), date.getMonth(), date.getDate())`; `saveZone` changes
only the zone (#390: the date stays as entered); `redraw` computes with
`const d = this.props.memory.calPage.cal7Date!; const date = TimeStamp.createDate(d.getYear(), d.getMonth(), d.getDate(), timeZone);`.
Update the DateEditor and VolatileMemory tests for the new field name.

- [ ] **Step 4: Run** the files, then `npm test`, `npx tsc --noEmit`, `npm run build` — Expected: PASS.

Conditions → tests: the calendar date in `saveZone`/`redraw` → the zone change test; no conversion in the constructor
→ the return test; today in the selected zone → the first-use test.

- [ ] **Step 5: Commit** — `fixes #390 keep the CAL 7 date as entered when the zone changes and when the page is shown again`

```json:metadata
{"files": ["kln90b/data/VolatileMemory.ts", "kln90b/pages/left/Cal7Page.tsx", "test/render/pages/left/Cal7Page.test.ts", "test/render/controls/editors/DateEditor.test.ts", "test/render/data/VolatileMemory.test.ts"], "verifyCommand": "npm test", "acceptanceCriteria": ["zone change keeps 04 MAR and shows 06:22 17:45", "return keeps 04 MAR", "first use in CST shows 03 MAR"], "modelTier": "standard"}
```

---

## Close-out (controller, after all tasks)

- A final review of the whole branch at session level (every commit against the spec, labels, vehicles across files).
- `npm test`, `npx tsc --noEmit`, `npm run build` on the integration branch.
- Ask the maintainer to approve the merge into master; then merge locally, delete the branch and every worktree and
  `worktree-agent-*` branch (junction first; `git branch -d`, asking for `-D` only after checking the content, as the
  cherry-picked lane branches never reach master). No push.
