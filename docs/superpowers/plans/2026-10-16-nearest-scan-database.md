# Nearest lists, scan lists and database pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the thirteen issues of milestone 6 (#95, #105, #128, #201, #202, #203, #204, #206, #207, #265, #268, #270, #342), one `fixes #NN` commit each.

**Architecture:** Three lanes, each file with one owner. Lane A rewrites the scan list cache (`Scanlist.ts`); lane B fixes the nearest lists and the reference VOR (`NearestList.ts`, `NearestUtils.ts`, the repository VOR filter, NAV 2, APT 3 surfaces); lane C fixes the waypoint pages and names (`WaypointPage.tsx`, `VolatileMemory.ts`, a new `AirportNameFormatter`, `CountryMap.ts`). Lane C's last task (#202) also touches `Scanlist.ts` and runs after lane A is integrated.

**Tech Stack:** TypeScript (target es2017, Coherent GT), `@microsoft/msfs-sdk` 2.3.3, Vitest (unit, render, flight stages), the project's headless harness under `test/harness/`.

**Spec:** `docs/superpowers/specs/2026-10-16-nearest-scan-database-design.md` (read it first; it holds the evidence and the rulings). The inventory's candidate patches, measured against the full suite, are in the controller's scratchpad `inventory/` (`C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\68818454-a7e3-49ed-8813-db92482fa677\scratchpad\inventory\`); each task below carries the code it needs, adjusted where the design differs from a patch.

## Global Constraints

- **Branch and lanes.** The integration branch is `m6-nearest-scan` (at `cdc1c2c` or later). An agent worktree starts at master's HEAD, so every lane's first command is `git merge --ff-only m6-nearest-scan` (lane C's Task 13: `git merge --ff-only` the integration branch after lane A was cherry-picked onto it). Never `git push`. Never merge into master.
- **node_modules.** A worktree gets `node_modules` as a junction to `E:\msfs\kln90b\node_modules` (PowerShell `New-Item -ItemType Junction -Path <wt>\node_modules -Target E:\msfs\kln90b\node_modules`). Before any `git worktree remove`, remove the junction alone (`cmd //c rmdir <wt>\\node_modules`) and check `ls E:/msfs/kln90b/node_modules | wc -l` is still large.
- **One commit per issue**, subject `fixes #NN <description>` (American English, lower-case start after the number). The commit holds the fix, its tests, its pin turned into a spec test (`it.fails` → `it`, the test name keeps its citation and issue number), and every test that used the bug as its vehicle (say so in the message body). Do not add your own `Co-Authored-By` line from this plan; use the attribution your own session instructions give.
- **Before every commit:** `npx tsc --noEmit` clean and the FULL `npm test` green (all three stages). Apply your fix, run everything, and look for tests in other files that relied on the bug.
- **Baseline (2026-10-16, aca297a):** 4137 tests, 4071 passed, 66 expected fail, 0 failures.
- **es2017:** no `String.prototype.replaceAll`, no `Array.prototype.at`, no optional catch binding in new code beyond what the codebase already uses; `RegExp` with `\b` and the `g` flag is fine.
- **Runtime state** lives in `kln90b/data/VolatileMemory.ts` and is reset in `VolatileMemory.reset` (maintainer rule). Service classes keep no new mutable state, except the result mirror of `NearestUtils` (spec 4D) and the scan list cache (navdata caches, like today).
- **Labels.** A citation supports only what its source literally shows. A test whose `describe` or name cites a page (`3-26`) or a trainer check asserts only what that source shows; the 90B's own numbers and texts where the guide is silent (200 NM, 1000 NM, the formatter's order of rules, the 22-character threshold) are characterizations and say so. AVsoftech observations are characterizations. Never put a characterization in a describe titled with a page citation. Comments cite page numbers; never copy manual text (the guide, install or maintenance manual are copyrighted). The maintainer's rulings are cited as "maintainer ruling, #NN".
- **Every condition a fix adds has a test that fails without that condition alone** (name it in your report). Assert literals, parsed structure (rows), never a substring over a whole screen.
- **No counts in prose** for growing collections in comments or docs.
- **Report.** Write your report to `.task-report.md` at the root of your worktree with the Bash tool (`cat > .task-report.md <<'EOF' … EOF`; never commit it): what changed, the tests added or converted with their file:line, a per-describe label audit (title, spec or characterization, citation), each added condition with the test that holds it, the vehicles you changed and why, `tsc` and `npm test` totals.
- **Public contract** (CLAUDE.md): nothing changes. Do not rename or remove H events, LVars, panel.xml keys, SimVars or persisted keys.

**User decisions (already made):**
- #207: the nearest APT/VOR/NDB lists search a 200 NM circle (maintainer, 2026-10-16).
- #207: the INT/SUP reference VOR follows the KLN 89 trainer: 1000 NM (maintainer asked for the 89 as the reference; trainer check 2026-10-16).
- #270: macadam counts as HRD on APT 3, and the SET 3 surface filter also admits macadam (folded into #270).
- #206/#204: a user VOR is never the NAV 2 VOR; NAV 2 keeps low/high only.
- #265: implement whole-word matching plus the 3-26 length and first-word rules, in a new class of its own that is unit tested.
- #342: the country comes from `facility.region`; an empty or unknown region, user airports (`XX`) included, gives three blanks.
- #387 (accented letters): closed as not planned; the database has no accented letters (comment in `Text.ts`, a45040b). Do not touch it.

---

## Lane A: scan list (`kln90b/data/navdata/Scanlist.ts`)

Owner of `Scanlist.ts`, `test/unit/data/navdata/Scanlist.test.ts`, `test/render/harness/enterIdent.test.ts` and any new scan list test file. Tasks 1, 2, 3 in order, one agent.

### Task 1: #105 the scan list index in list order

**Goal:** The index entry of every starting character is the first entry of that character in list order, and the last index entry is the last waypoint in list order even when the last character has more waypoints than one search returns.

**Files:**
- Modify: `kln90b/data/navdata/Scanlist.ts` (`rebuildIndex` at about `:358-380`, new private helpers, a constant `MAX_IDENT_LENGTH`)
- Test: `test/unit/data/navdata/Scanlist.test.ts` (the #105 pin at about `:283`; a new test for the last entry)
- Modify (vehicle): `test/render/harness/enterIdent.test.ts:104`

**Acceptance Criteria:**
- [ ] `starts at the first of two VORs with the same ident in list order (#105)` is an `it` and passes (K1 before K2 although K2 was inserted first).
- [ ] A new test: with more than 1000 intersections whose idents start with `Z` and a fake that honors `maxItems`, `getNext(<first Z entry>, MAX_SCROLL_SPEED)` returns the last one in list order (`ZZZZZ`). It fails on the current code (the old last-entry search is cut at 1000).
- [ ] `enterIdent.test.ts` "runs the search when the selector already shows the typed characters" still tells a search from none, without relying on the fresh page showing the K2 VOR.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/unit/data/navdata/Scanlist.test.ts test/render/harness/enterIdent.test.ts` → all pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Turn the pin into a spec test and add the last-entry test.** In `Scanlist.test.ts`, change `it.fails('starts at the first of two VORs with the same ident in list order (#105)'` to `it(` and update its comment (the index now takes the first in list order). Add, in a new describe `FacilityLoaderScanlist index (#105)`:

```ts
// The top-speed jump goes to the index entries: the first waypoint of each character and the very last waypoint.
// With more waypoints of the last character than one search returns, the last one must still be found (#105).
it('jumps at top speed to the last waypoint of a character with more waypoints than one search returns (#105)', async () => {
    const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const facilities: Facility[] = [];
    for (let i = 0; i < 1100; i++) {
        // ZA000 to ZA0UJ: 1100 idents that sort before ZZZZZ
        const ident = 'ZA' + CH[Math.floor(i / 1296) % 36] + CH[Math.floor(i / 36) % 36] + CH[i % 36];
        facilities.push(intersection(ident, 47 + i * 0.0001, 8));
    }
    facilities.push(intersection('ZZZZZ', 46.9, 8));
    const list = await scanlist(FacilitySearchType.Intersection, facilities);

    const last = await list.getNext(ICAO.value('W', 'K1', '', 'ZA000'), MAX_SCROLL_SPEED);

    expect(last?.ident).toBe('ZZZZZ');
});
```

(Check `intersection()`'s default region in `test/harness/navdata/builders.ts` and use it in the `ICAO.value` call; the jump compares idents only, so the region does not decide the result.)

- [ ] **Step 2: Run the two tests, expect both to fail** (`npx vitest run test/unit/data/navdata/Scanlist.test.ts -t "#105"`): the pin shows K2, the jump returns the 1000th Z entry instead of ZZZZZ.

- [ ] **Step 3: Implement.** In `Scanlist.ts`, below `MAX_SCROLL_SPEED`:

```ts
//No ident is longer. A prefix of this length cannot be divided into longer prefixes
const MAX_IDENT_LENGTH = 5;
//The results asked for when the index looks for a first or last waypoint
const INDEX_SEARCH_SIZE = 1000;
```

Replace `rebuildIndex` with:

```ts
private async rebuildIndex(): Promise<IcaoValue[]> {
    this.index = [];
    for (let i = 0; i < CHARSET.length; i++) {
        const res = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, CHARSET[i], 1);
        if (res.length > 0) {
            //#105: with duplicate idents the search may return any of them. The index holds the first in list order
            const sameIdent = await this.searchExactIdent(res[0].ident);
            this.index.push(sameIdent.length > 0 ? sameIdent[0] : res[0]);
        }
    }

    //Now we just need to find the very last navaid
    if (this.index.length > 0) {
        const lastResult = this.index[this.index.length - 1];
        const lastEntry = await this.findLastInListOrder(lastResult.ident.substring(0, 1));
        if (lastEntry !== null && !ICAO.valueEquals(lastEntry, lastResult)) {
            this.index.push(lastEntry);
        }
    }

    this.log("index", this.index);
    return this.index;
}

/**
 * The waypoints with exactly this ident, in list order
 */
private async searchExactIdent(ident: string): Promise<IcaoValue[]> {
    const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, INDEX_SEARCH_SIZE);
    return results.filter(icao => icao.ident === ident).sort(this.listSortFunction);
}

/**
 * #105: the last waypoint in list order whose ident starts with the prefix. A search that returns INDEX_SEARCH_SIZE
 * results may have been cut (whether the sim honors maxItems is not known), so the longest group is searched then,
 * from the last character down.
 */
private async findLastInListOrder(prefix: string): Promise<IcaoValue | null> {
    const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, prefix, INDEX_SEARCH_SIZE);
    if (results.length < INDEX_SEARCH_SIZE || prefix.length >= MAX_IDENT_LENGTH) {
        const sorted = results.slice().sort(this.listSortFunction);
        return sorted.length > 0 ? sorted[sorted.length - 1] : null;
    }
    for (let i = CHARSET.length - 1; i >= 0; i--) {
        const last = await this.findLastInListOrder(prefix + CHARSET[i]);
        if (last !== null) {
            return last;
        }
    }
    //No longer ident exists: the prefix is an ident of its own
    const sameIdent = await this.searchExactIdent(prefix);
    return sameIdent.length > 0 ? sameIdent[sameIdent.length - 1] : null;
}
```

`listSortFunction` is used unbound today (`.sort(this.listSortFunction)`); keep it that way only if it does not use `this` (check; bind it otherwise).

- [ ] **Step 4: Run the Scanlist tests, expect PASS.** Then the full `npm test`: `enterIdent.test.ts:104` fails (its precondition expects the fresh VOR page on `ABC SOUTH`, the K2 VOR, which was the bug). Rework it so that it still proves the search runs: for example, scan once clockwise first so that the page shows `ABC SOUTH` (K2, second in list order), then enter `ABC` and expect `ABC NORTH` (K1, the search result). Keep its describe and intent; update its comment.

- [ ] **Step 5: tsc, full suite, commit.**

```bash
npx tsc --noEmit && npm test
git add kln90b/data/navdata/Scanlist.ts test/unit/data/navdata/Scanlist.test.ts test/render/harness/enterIdent.test.ts
git commit -m "fixes #105 start the scan list index at the first waypoint in list order and find the true last one" -m "enterIdent.test.ts relied on the fresh VOR page showing the second of two duplicate idents; it now scans there first."
```

```json:metadata
{"files": ["kln90b/data/navdata/Scanlist.ts", "test/unit/data/navdata/Scanlist.test.ts", "test/render/harness/enterIdent.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#105 pin is a passing it", "top-speed jump reaches ZZZZZ past a cut search", "enterIdent vehicle reworked", "tsc clean, npm test green"], "modelTier": "standard"}
```

### Task 2: #203 the shorter ident in the backward refill

**Goal:** After a user waypoint change, scanning counterclockwise from `ABC` shows `AB`: the backward refill searches the shorter ident itself before the prefix in front of it.

**Files:**
- Modify: `kln90b/data/navdata/Scanlist.ts` (backward half of `startListManager`, about `:225-248`; new `getPreviousSearch`)
- Test: `test/unit/data/navdata/Scanlist.test.ts` (pin `scans counterclockwise from ABC to AB (#203)` at about `:386`)

**Acceptance Criteria:**
- [ ] The #203 pin is an `it` and passes; its sibling `scans counterclockwise from ABC to AB before any change` still passes.
- [ ] A new test: NDBs `A`, `A0`, `A1` (an ident that is a prefix of the next ones, with a `0` after it), after a user waypoint change, shown `A1`, two counterclockwise steps show `A0` then `A`.
- [ ] The #108 tests (about `:72`, `:81`) and the #117 tests stay green.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/unit/data/navdata/Scanlist.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Convert the pin** (`it.fails` → `it`, update its comment) **and add the `A`/`A0`/`A1` test** in the same describe (`FacilityLoaderScanlist after a user waypoint change`), built the way the pin is built (same helpers: publish `KLNFacilityRepository.SYNC_TOPIC`, `sync` to the shown waypoint, step with `getNext(…, -1)` then `sync`). Expected rows: `['A0', 'A']`.
- [ ] **Step 2: Run, expect the pin and the new test to fail.**
- [ ] **Step 3: Implement** (the inventory's `203.patch`): in the backward loop declare `let exact = false;`, replace both `ident = this.getNextIdentForSearch(ident!, -1);` with `[ident, exact] = this.getPreviousSearch(ident);`, and add only the exact-ident matches when `exact`:

```ts
this.cacheValidFromIdent = ident;
const exactIdent: string = ident;
this.icaoListCache = this.addResultToCache(exact ? results.filter(icao => icao.ident === exactIdent) : results);
sizeBeforeCurrent += this.icaoListCache.length - sizeBefore;
[ident, exact] = this.getPreviousSearch(ident);
```

```ts
/**
 * #203: the search that comes before the prefix (or the exact ident) going towards the beginning of the list. Before
 * the prefix AB0 comes the ident AB itself, which sorts before every longer ident, and only then the prefix AA.
 * Returns the ident to search and whether only that exact ident is wanted.
 */
private getPreviousSearch(ident: string): [string | null, boolean] {
    if (ident.length > 1 && ident.endsWith(CHARSET[0])) {
        return [ident.substring(0, ident.length - 1), true];
    }
    return [this.getNextIdentForSearch(ident, -1), false];
}
```

- [ ] **Step 4: Run the file, then the full suite. Expect PASS.**
- [ ] **Step 5: Commit.**

```bash
git add kln90b/data/navdata/Scanlist.ts test/unit/data/navdata/Scanlist.test.ts
git commit -m "fixes #203 search the shorter ident itself when the scan list refills towards the beginning"
```

```json:metadata
{"files": ["kln90b/data/navdata/Scanlist.ts", "test/unit/data/navdata/Scanlist.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#203 pin is a passing it", "A/A0/A1 counterclockwise test passes", "#108 and #117 tests green", "tsc clean, npm test green"], "modelTier": "mechanical"}
```

### Task 3: #201 the scan list cache window

**Goal:** Scanning slowly through a list longer than the cache window shows every waypoint once in both directions, whether or not the sim honors `maxItems`, and also when the sim returns new ICAO objects for every search.

**Files:**
- Modify: `kln90b/data/navdata/Scanlist.ts` (`startListManager`, `invalidateCache`, `cleanupCache`, the bound fields; new constants `SEARCH_SIZE`, `mayBeCut`)
- Test: `test/unit/data/navdata/Scanlist.test.ts` (the two #201 pins at about `:353`, `:362`; the #117 vehicles at about `:140-167`, `:188-207`)
- Create: `test/unit/data/navdata/ScanlistStress.test.ts`

**Acceptance Criteria:**
- [ ] Both #201 pins are `it` and pass.
- [ ] `ScanlistStress.test.ts` passes for three fakes: one that honors `maxItems` (the plain `MemoryFacilityClient`), one that ignores it, one that returns fresh ICAO objects; each scans clockwise from the first, counterclockwise from the last, clockwise again, then after a user waypoint change counterclockwise from the middle, and sees every waypoint exactly once in list order.
- [ ] A test: shown `ZZZZB`, after a user waypoint change (cache invalidated and refilled), a counterclockwise step shows `ZZZZA` (the `"ZZZZ"` sentinel is gone).
- [ ] A test: with the fresh-copy fake, a prefix searched twice leaves no duplicate in the scan (covered by the stress test; name the assertion).
- [ ] The three #117 tests sync to waypoints that are not cached yet (as the sibling at about `:170` does with `KAAD`/`KAAE`) and still prove what their titles say.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/unit/data/navdata/` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the stress test file** (based on the inventory's `ScanStress.scratch.test.ts`; keep it under a few seconds):

```ts
import {describe, expect, it} from 'vitest';
import {EventBus, Facility, FacilityClient, FacilitySearchType, ICAO, IcaoValue} from '@microsoft/msfs-sdk';
import {FacilityLoaderScanlist} from '../../../../kln90b/data/navdata/Scanlist';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {intersection} from '../../../harness/navdata/builders';

/** The scan list's private background job (misspelled in Scanlist.ts); see Scanlist.test.ts managerJob */
const managerJob = (list: FacilityLoaderScanlist) => (list as unknown as { listManangerJob: Promise<void> | null }).listManangerJob;

/** A sim that returns every match, whatever maxItems asks for */
class IgnoringMaxItemsClient extends MemoryFacilityClient {
    public searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, _maxItems?: number): Promise<IcaoValue[]> {
        return super.searchByIdentWithIcaoStructs(filter, ident, 1_000_000);
    }
}

/** A sim that returns new ICAO objects for every search, as Coherent does */
class FreshCopyClient extends MemoryFacilityClient {
    public searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, maxItems?: number): Promise<IcaoValue[]> {
        return super.searchByIdentWithIcaoStructs(filter, ident, maxItems).then(r => r.map(i => ICAO.value(i.type, i.region, i.airport, i.ident)));
    }
}

/** A deterministic pseudo-random generator, so that the world is the same in every run */
function random(seed: number): () => number {
    return () => {
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
}

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Idents of two to five characters on three first letters, so that prefix groups are larger than the cache window;
 * some idents are prefixes of others (AB, ABC) and some exist twice in two regions.
 */
function world(size: number, seed: number): Facility[] {
    const r = random(seed);
    const idents = new Set<string>();
    while (idents.size < size) {
        const length = 2 + Math.floor(r() * 4);
        let ident = 'ABK'[Math.floor(r() * 3)];
        for (let i = 1; i < length; i++) ident += CHARS[Math.floor(r() * (i < 2 ? 6 : 36))];
        idents.add(ident);
        if (r() < 0.1 && ident.length > 2) idents.add(ident.substring(0, ident.length - 1));
    }
    const facilities: Facility[] = [];
    let i = 0;
    for (const ident of idents) {
        facilities.push(intersection(ident, 47 + (i++) * 0.0001, 8));
        if (r() < 0.03) facilities.push(intersection(ident, 40 + i * 0.0001, -100, {region: 'K2'}));
    }
    return facilities;
}

const listOrder = (a: IcaoValue, b: IcaoValue) => a.ident === b.ident ? ICAO.valueToStringV2(a).localeCompare(ICAO.valueToStringV2(b)) : a.ident.localeCompare(b.ident);
const key = (icao: IcaoValue) => ICAO.valueToStringV2(icao);

/** Scans one slow step at a time from `from`, as WaypointPage does (getNext, then sync), and returns what is shown */
async function scan(list: FacilityLoaderScanlist, from: IcaoValue, direction: number, max: number): Promise<string[]> {
    list.sync(from);
    await managerJob(list);
    const shown: string[] = [];
    let current: IcaoValue | null = from;
    while (current !== null && shown.length < max) {
        shown.push(key(current));
        current = await list.getNext(current, direction);
        if (current !== null) list.sync(current);
    }
    return shown;
}

// 3-21: turning the knob slowly steps through the waypoints one at a time, in alphabetical order. The list is longer
// than the scan list's cache window, and the sim may or may not honor maxItems (#201)
describe.each([
    ['honors maxItems', (f: Facility[]) => new MemoryFacilityClient(f)],
    ['ignores maxItems', (f: Facility[]) => new IgnoringMaxItemsClient(f)],
    ['returns fresh ICAO objects', (f: Facility[]) => new FreshCopyClient(f)],
])('FacilityLoaderScanlist over a long list, the sim %s (3-21, #201)', (_name, makeClient) => {
    it('shows every waypoint once in list order, both ways and after a user waypoint change', async () => {
        const facilities = world(3000, 1);
        const icaos = facilities.map(f => f.icaoStruct).sort(listOrder);
        const sorted = icaos.map(key); // list order, each waypoint once: the expectation
        const bus = new EventBus();
        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, makeClient(facilities) as unknown as FacilityClient, bus);
        await list.init();
        await managerJob(list);

        expect(await scan(list, icaos[0], 1, sorted.length + 5)).toEqual(sorted);
        expect(await scan(list, icaos[icaos.length - 1], -1, sorted.length + 5)).toEqual([...sorted].reverse());
        expect(await scan(list, icaos[0], 1, sorted.length + 5)).toEqual(sorted);

        bus.getPublisher<any>().pub(KLNFacilityRepository.SYNC_TOPIC, {});
        const middle = Math.floor(icaos.length / 2);
        expect(await scan(list, icaos[middle], -1, middle + 5)).toEqual(sorted.slice(0, middle + 1).reverse());
    });
});
```

`toEqual(sorted)` also proves that no waypoint is shown twice (the fresh-copy fake would show a duplicate there). Check how `Scanlist.test.ts` publishes `KLNFacilityRepository.SYNC_TOPIC` (payload shape) and do the same. If 3000 idents take longer than about 5 s per case, use 2500; the list must stay well above `MAXIMUM_CACHE_SIZE` (1500).

- [ ] **Step 2: Convert the two #201 pins to `it`. Run `npx vitest run test/unit/data/navdata/`; expect the pins and the stress cases to fail** (the inventory's baseline: hundreds of waypoints missing in every case).

- [ ] **Step 3: Implement** (the inventory's `201+203.patch` minus what Task 2 already did, plus the sentinel). In `Scanlist.ts`:

```ts
//The number of results asked for in each search that fills the cache. Whether the sim honors maxItems is not known: a
//search that returns this many or more may have been cut, so its prefix is not taken as complete (#201)
const SEARCH_SIZE = TARGET_CACHE_SIZE / 2 + 100;
```

Fields:

```ts
//#201: the first ident the cache encompasses; every ident from it up to the current waypoint is cached. null: nothing
private cacheValidFromIdent: string | null = null;
//#201: every ident below this one, down to cacheValidFromIdent, is in the cache. null: up to the end of the list
private cacheValidBelowIdent: string | null = "0";
```

`invalidateCache` sets `cacheValidFromIdent = null; cacheValidBelowIdent = "0";`. Every comparison with `cacheValidFromIdent` treats `null` as "nothing cached" (for example `this.cacheValidFromIdent !== null && this.cacheValidFromIdent.localeCompare(ident) <= 0`). Where the code needs the first cached ident after a prune, use `this.icaoListCache[0].ident`.

Backward half (keeps Task 2's `exact`):

```ts
if (this.cacheValidFromIdent !== null && this.cacheValidFromIdent.localeCompare(ident) <= 0) {
    [ident, exact] = this.getPreviousSearch(ident);
    continue;
}
this.log(`${this.facilitySearchType} : Searching for ${ident}`);
const sizeBefore = this.icaoListCache.length;
const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, SEARCH_SIZE);
if (jobId !== this.lastManangerJobId) {
    this.log(`${this.facilitySearchType}: filling of list canceled`);
    return;
}
if (!exact && this.mayBeCut(results, ident)) {
    //#201: the scan needs the last idents of this prefix. Search its longer prefixes, from the last one
    ident = ident + CHARSET[CHARSET.length - 1];
    continue;
}
this.cacheValidFromIdent = ident;
const exactIdent: string = ident;
this.icaoListCache = this.addResultToCache(exact ? results.filter(icao => icao.ident === exactIdent) : results);
sizeBeforeCurrent += this.icaoListCache.length - sizeBefore;
[ident, exact] = this.getPreviousSearch(ident);
```

Beginning prune:

```ts
//#201: the cut falls between two idents, so that every waypoint of the first ident kept stays. The last entry stays too
let start = sizeBeforeCurrent - MAXIMUM_CACHE_SIZE / 2;
while (start < listIndex && this.icaoListCache[start].ident === this.icaoListCache[start - 1].ident) {
    start++;
}
this.icaoListCache = this.icaoListCache.slice(start);
this.cacheValidFromIdent = this.icaoListCache[0].ident;
```

Forward half:

```ts
//#201: the walk starts with the prefix of the current ident itself, whose longer idents may be missing after a prune
let ident: string | null = lastIcao.ident;
while (sizeAfterCurrent < targetSizeForExtension) {
    if (ident === null) { //End of the list
        break;
    }
    const upperIdent: string | null = this.getNextIdentForSearch(ident, 1);
    if (this.cacheValidBelowIdent === null || (upperIdent !== null && upperIdent.localeCompare(this.cacheValidBelowIdent) <= 0)) {
        ident = upperIdent;
        continue;
    }
    this.log(`${this.facilitySearchType} : Searching for ${ident}`);
    const sizeBefore = this.icaoListCache.length;
    const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, SEARCH_SIZE);
    if (jobId !== this.lastManangerJobId) {
        this.log(`${this.facilitySearchType}: filling of list canceled`);
        return;
    }
    if (this.mayBeCut(results, ident)) {
        //#201: take this ident itself, then search its longer prefixes, from the first one
        const prefix: string = ident;
        this.icaoListCache = this.addResultToCache(results.filter(icao => icao.ident === prefix));
        sizeAfterCurrent += this.icaoListCache.length - sizeBefore;
        ident = prefix + CHARSET[0];
        this.cacheValidBelowIdent = ident;
        continue;
    }
    this.icaoListCache = this.addResultToCache(results);
    sizeAfterCurrent += this.icaoListCache.length - sizeBefore;
    this.cacheValidBelowIdent = upperIdent;
    ident = upperIdent;
}
```

End prune:

```ts
//#201: the cut falls between two idents. Everything below the first ident dropped stays in the cache
let end = listIndex + MAXIMUM_CACHE_SIZE / 2;
while (end > listIndex + 1 && this.icaoListCache[end - 1].ident === this.icaoListCache[end].ident) {
    end--;
}
this.cacheValidBelowIdent = this.icaoListCache[end].ident;
this.icaoListCache = this.icaoListCache.slice(0, end);
```

Helpers:

```ts
/**
 * #201: a search that returned SEARCH_SIZE results or more may have been cut at maxItems, unless its prefix cannot be
 * divided any further
 */
private mayBeCut(results: IcaoValue[], prefix: string): boolean {
    return results.length >= SEARCH_SIZE && prefix.length < MAX_IDENT_LENGTH;
}

private cleanupCache(cache: IcaoValue[]): IcaoValue[] {
    //#201: a prefix may be searched again. The sim returns new objects each time, so equal ICAOs are found by their uid
    const byUid = new Map<string, IcaoValue>();
    for (const icao of cache) {
        byUid.set(ICAO.getUid(icao), icao);
    }
    const unique: IcaoValue[] = [];
    byUid.forEach(icao => unique.push(icao));
    return unique.sort(this.listSortFunction);
}
```

Replace every remaining `cacheValidToIdent` (log lines included). `targetSizeForExtension` stays as the loop bound.

- [ ] **Step 4: Add the sentinel test** to `Scanlist.test.ts` (new describe `FacilityLoaderScanlist idents after ZZZZ (#201)`): intersections `AAAAA`, `ZZZZA`, `ZZZZB`; after `init`, `sync(ZZZZB)` and wait for the job, then publish a user waypoint change (`KLNFacilityRepository.SYNC_TOPIC`, which invalidates the cache and refills it around `ZZZZB` with the old `"ZZZZ"` bound), wait for the job, and `getNext(ZZZZB, -1)` returns `ZZZZA`. With the old sentinel the backward refill skips every ident from `ZZZZ` up and the step shows `AAAAA`; check it fails with the sentinel put back and passes without.

- [ ] **Step 5: Run the navdata unit tests, then the full suite.** The #117 tests at about `:140-167` and `:188-207` fail (they sync to cached `KAAB`/`KAAC` and waited on searches the new bounds no longer make). Change them to sync to waypoints that are not cached yet (add `KAAD`, `KAAE`… as the sibling at about `:170` does, or a list longer than the window) so that a second job really starts while the first one still waits; keep their titles and what they prove (the cancellation by job id).

- [ ] **Step 6: tsc, full suite, commit.**

```bash
git add kln90b/data/navdata/Scanlist.ts test/unit/data/navdata/Scanlist.test.ts test/unit/data/navdata/ScanlistStress.test.ts
git commit -m "fixes #201 keep every waypoint in the scan list cache across its window edges, whether or not the sim honors maxItems" -m "The #117 job tests synced to waypoints that were already cached and relied on wasted searches; they now sync to uncached ones."
```

```json:metadata
{"files": ["kln90b/data/navdata/Scanlist.ts", "test/unit/data/navdata/Scanlist.test.ts", "test/unit/data/navdata/ScanlistStress.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#201 pins pass as it", "stress test passes for the three fakes", "ZZZZ sentinel test passes", "#117 tests reworked and green", "tsc clean, npm test green"], "modelTier": "frontier"}
```

---

## Lane B: nearest lists and the VOR reference

Owner of `kln90b/TickController.ts`, `kln90b/data/navdata/NearestList.ts`, `kln90b/data/navdata/KLNFacilityLoader.ts`, `kln90b/data/navdata/NearestUtils.ts`, `kln90b/pages/left/Nav2Page.tsx`, `kln90b/KLN90BCore.ts` (the tick list), `kln90b/pages/right/Apt3ListPage.tsx`, and the tests `test/render/data/navdata/NearestList.test.ts`, `test/render/pages/right/IntPage.test.ts`, `test/unit/data/navdata/NearestListSurfaces.test.ts`, `test/render/pages/right/Apt3Page.test.ts`, `test/unit/pages/right/Apt3ListPage.test.ts`, `test/unit/TickController.test.ts`. Do not touch `test/harness/navdata/builders.ts` (lane C owns it). Tasks 4 to 9 in order, one agent.

### Task 4: #95 a failed nearest search

**Goal:** A rejected nearest search no longer freezes the list and shows on the error page; a facility that cannot be loaded is left out while the others of the same search are listed.

**Files:**
- Modify: `kln90b/data/navdata/NearestList.ts` (`tick` about `:71-110`)
- Modify: `kln90b/TickController.ts` (`tickCalc` about `:75-86`)
- Test: `test/render/data/navdata/NearestList.test.ts` (the two #95 pins at about `:420`, `:428`; a new test)

**Acceptance Criteria:**
- [ ] Both #95 pins are `it` and pass.
- [ ] A new test: a search reports two NDBs, one of which the client cannot load (its `getFacility`/`tryGetFacility` gives nothing for that ICAO); the list holds the other one. It fails on the current code (the whole batch is lost).
- [ ] `CalcTickable.tick` stays `void` (widening it breaks `test/unit/TickController.test.ts:21`).
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/data/navdata/NearestList.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Convert the pins; add the unloadable-facility test** in the describe `the nearest NDB list after a rejected search (#95)`. Build the client like `clientForNdbSearch`: wrap the client so that loading the NDB `NBD` fails the way an unknown ICAO fails in `KLNFacilityLoader` (read `KLNFacilityLoader._tryGetFacility` to see which method of the actual client it calls, and make that one answer `null` for `NBD`), with `NAA` 3 NM and `NBD` 4 NM north of the aircraft. After two searches, expect `ndbNearestList.getNearestList()` idents `['NAA']`. Title: `lists the NDBs it can load when one of a search cannot be loaded (3-22, #95)`.
- [ ] **Step 2: Run, expect the three to fail.**
- [ ] **Step 3: Implement.** `NearestList.tick`:

```ts
//This stuff is very expensive, and is only run every 10 seconds
this.isCalculating = true;
this.tickTimer = 0;
try {
    await this.search();
} finally {
    //#95: a failed search must not stop every later search
    this.isCalculating = false;
}
```

and a private `search()` with the old body (radius unchanged in this task), the removal loop going backwards, and the added facilities loaded one by one:

```ts
for (const removedIcao of diff.removed) {
    for (let i = this.nearestList.length - 1; i >= 0; i--) {
        if (ICAO.valueEquals(this.nearestList[i].facility.icaoStruct, removedIcao)) {
            this.nearestList[i].index = -1;
            this.nearestList.splice(i, 1);
        }
    }
}

//#95: a facility that cannot be loaded is left out; the others of the same search are listed
const addedFacilities = await Promise.all(diff.added.map(addedIcao => this.facilityLoader.tryGetFacility(this.facilityType, addedIcao)));
for (const addedFacility of addedFacilities) {
    if (addedFacility === null) {
        continue;
    }
    this.nearestList.push({facility: addedFacility as any, bearingToTrue: 0, distance: 0, index: 0});
}
this.updateBearingDistance();
```

`TickController.tickCalc`:

```ts
public tickCalc(): void {
    for (const tickable of this.calcTickables) {
        try {
            //#95: an async tick (NearestList) returns a promise; its rejection must reach the error page too
            const result: unknown = tickable.tick();
            if (result instanceof Promise) {
                result.catch(this.handleError.bind(this));
            }
        } catch (e) {
            this.handleError(e);
        }
    }
}

private handleError(e: unknown): void {
    console.error(e);
    if (e instanceof Error) {
        this.bus.getPublisher<ErrorEvent>().pub("error", e);
    }
}
```

- [ ] **Step 4: Run the file, the full suite.** The pins call `unit.takeRejections()`; if the harness now complains that there is nothing to take, adjust the helper (the rejection is handled now), keeping the setup test `the failing client rejects one NDB search` meaningful.
- [ ] **Step 5: Commit.**

```bash
git add kln90b/data/navdata/NearestList.ts kln90b/TickController.ts test/render/data/navdata/NearestList.test.ts
git commit -m "fixes #95 keep the nearest lists searching after a failed search and show the failure on the error page"
```

```json:metadata
{"files": ["kln90b/data/navdata/NearestList.ts", "kln90b/TickController.ts", "test/render/data/navdata/NearestList.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#95 pins pass as it", "unloadable NDB test passes", "CalcTickable.tick stays void", "tsc clean, npm test green"], "modelTier": "standard"}
```

### Task 5: #207 the search radii

**Goal:** The nearest APT, VOR and NDB lists search 200 NM; the reference VOR of INT, SUP and CTR 1 searches 1000 NM.

**Files:**
- Modify: `kln90b/data/navdata/NearestList.ts` (the radius in `search()`, as a named constant)
- Modify: `kln90b/data/navdata/NearestUtils.ts` (`getNearestVor`, about `:53`, as a named constant)
- Test: `test/render/data/navdata/NearestList.test.ts` (the characterization at about `:276-283`), `test/render/pages/right/IntPage.test.ts`

**Acceptance Criteria:**
- [ ] The 450 NM characterization is replaced by two tests in a describe `the nearest list radius (characterization; KLN 89 guide and trainer, maintainer ruling #207)`: an airport 198 NM away (3.3 degrees of latitude) is listed as nr 1; one 204 NM away (3.4 degrees) is not listed.
- [ ] Two INT page tests in a describe `INT page reference VOR distance (characterization; KLN 89 trainer 2026-10-16, #207)`: INTA at 47.1 N 8.0 E with a VOR 16.5 degrees north (990 NM) shows that VOR as REF; with the VOR 17.0 degrees north (1020 NM) the REF row shows what the page shows when no VOR is found (read `IntPage.redraw` and the #286 test for the exact row). Both fail with the old 100 NM in one direction (the 990 NM test) and with no limit in the other (the 1020 NM test).
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/data/navdata/NearestList.test.ts test/render/pages/right/IntPage.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the four tests.** Nearest list:

```ts
// The 90B guide gives no radius for the nearest lists (3-22). The KLN 89 guide and trainer stop at 200 NM, the
// AVsoftech 90B trainer at about 190 to 220 NM; the maintainer ruled 200 NM (#207). 3.3 degrees of latitude are 198 NM
describe('the nearest list radius (characterization; KLN 89 guide and trainer, maintainer ruling #207)', () => {
    it('lists an airport 198 NM away as nr 1 when nothing is nearer', async () => {
        const unit = await bootUnit({facilities: [airport('KFAR', 50.3, 8.0)], position: POSITION});

        expect(await nearestRows(unit)).toEqual([' KFAR  nr 1']);
    });

    it('leaves out an airport 204 NM away', async () => {
        const unit = await bootUnit({facilities: [airport('KFAR', 50.4, 8.0)], position: POSITION});

        expect(await nearestRows(unit)).toEqual([]);
    });
});
```

INT page (use `refRow` and `inta()` of that file; INTA is at 47.1 N):

```ts
// The 90B guide gives no limit for the reference VOR (3-50). The KLN 89 trainer named the closest VOR up to 999.7 NM and
// showed none from about 1000.7 NM (2026-10-16, one direction). 16.5 degrees of latitude are 990 NM, 17.0 are 1020 NM
describe('INT page reference VOR distance (characterization; KLN 89 trainer 2026-10-16, #207)', () => {
    it('takes a VOR 990 NM away', async () => {
        const unit = await bootUnit({facilities: [inta(), vor('FAR', 63.6, 8.0)], position: {lat: 47.0, lon: 8.0}});

        expect(await refRow(unit)).toBe('REF:  FAR  ');
    });

    it('takes no VOR 1020 NM away', async () => {
        const unit = await bootUnit({facilities: [inta(), vor('FAR', 64.1, 8.0)], position: {lat: 47.0, lon: 8.0}});

        expect(await refRow(unit)).toBe('REF:  -----');
    });
});
```

`'REF:  -----'` is the expected row of the page without a reference VOR with the cursor off (a null value renders as dashes); confirm it by running this test on the unchanged code, where the 1020 NM VOR is not found either, and use the literal the page shows. `inta` is defined inside the `INT page reference VOR (3-50)` describe today, so move it to file scope or define it again.

- [ ] **Step 2: Run; expect the 204 NM test and the 990 NM test to fail.**
- [ ] **Step 3: Implement.** `NearestList.ts`:

```ts
//#207: the 90B guide gives no radius; the KLN 89's is 200 NM, and the maintainer ruled the same
const NEAREST_SEARCH_RADIUS_NM = 200;
```

used as `UnitType.NMILE.convertTo(NEAREST_SEARCH_RADIUS_NM, UnitType.METER)`. `NearestUtils.ts`:

```ts
//#207: the KLN 89 trainer shows the closest VOR as the reference up to 1000 NM (2026-10-16)
const REFERENCE_VOR_RADIUS_NM = 1000;
```

- [ ] **Step 4: Run, then the full suite. Expect PASS.**
- [ ] **Step 5: Commit.**

```bash
git add kln90b/data/navdata/NearestList.ts kln90b/data/navdata/NearestUtils.ts test/render/data/navdata/NearestList.test.ts test/render/pages/right/IntPage.test.ts
git commit -m "fixes #207 search the nearest lists 200 NM and the reference VOR 1000 NM around"
```

```json:metadata
{"files": ["kln90b/data/navdata/NearestList.ts", "kln90b/data/navdata/NearestUtils.ts", "test/render/data/navdata/NearestList.test.ts", "test/render/pages/right/IntPage.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["198 NM listed, 204 NM not", "990 NM VOR is REF, 1020 NM shows the no-reference row", "tsc clean, npm test green"], "modelTier": "standard"}
```

### Task 6: #128 the repository VOR filter compares flags

**Goal:** The repository VOR filter compares the flag of a VOR's class and type with the masks, so a user VOR with a real class is filtered like a database VOR.

**Files:**
- Modify: `kln90b/data/navdata/KLNFacilityLoader.ts` (`KLNNearestVorSearchSession.setVorFilter`, about `:174-177`)
- Test: `test/render/data/navdata/NearestList.test.ts`

**Acceptance Criteria:**
- [ ] A new test: a repository VOR `QQV` (region `XX`, class `LowAlt`, type `VOR`) 1.2 NM north and the database VOR `HIG` (high altitude, 18 NM) give the VOR page nearest rows `QQV` nr 1 and `HIG` nr 2 (read the exact row strings from the page: a plain VOR shows no `D`). It fails on the current code (`2 & mask` is 0).
- [ ] A new guard test: a repository VOR of class `HighAlt` and type `TACAN` (not in the type mask) 1.2 NM north is not listed (rows `HIG` nr 1 only), so the flag compare still filters.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/data/navdata/NearestList.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the tests** in the describe `VOR classes in the nearest VOR list` (they cite 5-45 for user waypoints in the nearest functions, like the user VOR pin), adding the repository VOR the way the `lists a user VOR (#206)` pin does (`KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQV', 47.02, 8.0, {region: 'XX', vorClass: VorClass.LowAlt, type: VorType.VOR}))`).
- [ ] **Step 2: Run, expect the LowAlt test to fail.**
- [ ] **Step 3: Implement:**

```ts
public setVorFilter(classMask: number, typeMask: number): void {
    //#128: the masks are flags (1 << value), as for the sim's session
    this.repoSearchSession.seFacilityFilter(f => BitFlags.isAny(BitFlags.createFlag(f.vorClass), classMask)
        && BitFlags.isAny(BitFlags.createFlag(f.type), typeMask));
    this.coherentSearchSession.setVorFilter(classMask, typeMask);
}
```

- [ ] **Step 4: Run, full suite, expect PASS** (the #206 pins stay `it.fails` and green).
- [ ] **Step 5: Commit.**

```bash
git add kln90b/data/navdata/KLNFacilityLoader.ts test/render/data/navdata/NearestList.test.ts
git commit -m "fixes #128 compare the flags of a user VOR's class and type with the nearest VOR masks"
```

```json:metadata
{"files": ["kln90b/data/navdata/KLNFacilityLoader.ts", "test/render/data/navdata/NearestList.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["LowAlt/VOR repository VOR listed", "a type outside the mask rejected", "tsc clean, npm test green"], "modelTier": "mechanical"}
```

### Task 7: #204 every VOR class in the nearest VOR list; NAV 2 keeps low/high

**Goal:** The nearest VOR list (VOR page, Super NAV 5) holds terminal, low, high and undefined-class VORs; NAV 2 shows the nearest low or high VOR from a list of its own, also when nine nearer VORs are terminal.

**Files:**
- Modify: `kln90b/data/navdata/NearestList.ts` (`VorNearestList.initFilters`; a new `LowHighVorNearestList`; `Nearestlists` gets `lowHighVorNearestList` and inits it)
- Modify: `kln90b/KLN90BCore.ts` (the calc tick list at about `:338-340` gets the new list)
- Modify: `kln90b/pages/left/Nav2Page.tsx` (about `:63-70`)
- Test: `test/render/data/navdata/NearestList.test.ts` (the three #204 pins at about `:303`, `:307`, `:326`; the NAV 2 guard at about `:348`; a new NAV 2 test)

**Acceptance Criteria:**
- [ ] The three #204 pins are `it` and pass; the NAV 2 guard `shows the nearest low or high altitude VOR on NAV 2, not a nearer terminal VOR (3-8, 3-32)` passes.
- [ ] A new NAV 2 test: nine terminal VORs within 6 NM and `HIG` (high altitude) 18 NM north: NAV 2 shows `HIG  180°fr` / `     18.0nm`. It fails if NAV 2 takes its VOR from the shared nine-entry list.
- [ ] The DME-arc exception (3-32) still comes first (existing tests stay green).
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/data/navdata/NearestList.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Convert the three pins; add the NAV 2 test** next to the guard (same setup as the guard: `bootUnit`, `NEAREST_SEARCH_WAIT_MS`, `selectPage('L', 'NAV 2')`, rows 2 and 3), the nine terminal VORs at distinct positions (for example 47.0 + 0.01·i N, 8.05 E for i = 1..9; never two facilities at identical coordinates, the harness's kd tree fails on them), idents `T01`…`T09`.
- [ ] **Step 2: Run; expect the pins and the new NAV 2 test to fail.**
- [ ] **Step 3: Implement.** `NearestList.ts`:

```ts
export class VorNearestList extends NearestList<FacilitySearchType.Vor, VorFacility> {
    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor]): void {
        //#204: the list holds VORs of every class (3-22, 3-49; Super NAV 5 TLH, 3-37). NAV 2 has its own list
        session.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt), BitFlags.createFlag(VorClass.Terminal), BitFlags.createFlag(VorClass.Unknown)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );
    }
}

/**
 * 3-8, 3-32: NAV 2 shows the nearest low or high altitude VOR, never a terminal one. A list of its own, so that a low or
 * high VOR behind nine nearer terminal VORs is still found (#204)
 */
export class LowHighVorNearestList extends VorNearestList {
    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor]): void {
        session.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );
    }
}
```

`Nearestlists`: add `public readonly lowHighVorNearestList: LowHighVorNearestList;`, construct it like `vorNearestList`, add it to `init()`'s `Promise.all`. `KLN90BCore.ts`: add `nearestLists.lowHighVorNearestList` to the calc tickables after `nearestLists.vorNearestList`. `Nav2Page.tsx`:

```ts
if (vor === null) {
    //3-8, 3-32: the nearest low or high altitude VOR (#204)
    const nearestVors = this.props.nearestLists.lowHighVorNearestList.getNearestList();
    if (nearestVors.length > 0) {
        vor = nearestVors[0].facility;
    }
}
```

Check that test fakes of `Nearestlists` (grep the tests for `nearestLists:` or `vorNearestList`) get the new field where they need it.

- [ ] **Step 4: Run, full suite, expect PASS.**
- [ ] **Step 5: Commit.**

```bash
git add kln90b/data/navdata/NearestList.ts kln90b/KLN90BCore.ts kln90b/pages/left/Nav2Page.tsx test/render/data/navdata/NearestList.test.ts
git commit -m "fixes #204 list VORs of every class nearest and give NAV 2 a low and high altitude list of its own"
```

```json:metadata
{"files": ["kln90b/data/navdata/NearestList.ts", "kln90b/KLN90BCore.ts", "kln90b/pages/left/Nav2Page.tsx", "test/render/data/navdata/NearestList.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#204 pins pass as it", "NAV 2 guard green", "NAV 2 finds HIG behind nine terminal VORs", "tsc clean, npm test green"], "modelTier": "standard"}
```

### Task 8: #206 user VORs as the nearest VOR

**Goal:** A user VOR (class and type Unknown) takes part in the nearest VOR list and is the INT/SUP reference when it is the closest; it never becomes the NAV 2 VOR.

**Files:**
- Modify: `kln90b/data/navdata/KLNFacilityLoader.ts` (`setVorFilter`)
- Modify: `kln90b/data/navdata/NearestUtils.ts` (`init` class mask; `getNearestVor`; the result mirror; serialization)
- Test: `test/render/data/navdata/NearestList.test.ts` (pin `lists a user VOR (#206)` at about `:332`), `test/render/pages/right/IntPage.test.ts` (pin `takes a closer user VOR (#206)` at about `:66`)

**Acceptance Criteria:**
- [ ] Both #206 pins are `it` and pass.
- [ ] A new INT test: a database VOR `NER` 3 NM from INTA and a user VOR `QQV` 9 NM from INTA, the user VOR added after the database one: REF is `NER` (the nearer one, not the last added). It fails on the old "keep the last added" code.
- [ ] A new NAV 2 test (maintainer ruling): a user VOR 1.2 NM away and `HIG` 18 NM: NAV 2 shows `HIG`.
- [ ] A test that concurrent `getNearestVor` calls for two positions each return their own nearest VOR (unit level on `NearestUtils` with a `KLNFacilityLoader` over a `MemoryFacilityClient`, or render level through two INT computations; pick the cheaper one that fails without the serialization).
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/data/navdata/NearestList.test.ts test/render/pages/right/IntPage.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Convert the pins; write the three new tests** (labels: the INT ones in `INT page reference VOR (3-50)` cite 3-50 and 5-45; the NAV 2 one cites 3-8, 3-32 and "maintainer ruling, #206"; the concurrency test is a characterization of the code's contract, no page).
- [ ] **Step 2: Run; expect them to fail** (the concurrency test may pass by luck on the old code; if so, make it deterministic, for example by delaying the first search's facility load in the fake).
- [ ] **Step 3: Implement.** `setVorFilter`:

```ts
public setVorFilter(classMask: number, typeMask: number): void {
    //#128: the masks are flags (1 << value), as for the sim's session. #206: a user VOR has the type Unknown (the user
    //waypoint loaders, the VOR page); it takes part anyway (5-45). Its class Unknown is filtered by the class mask
    this.repoSearchSession.seFacilityFilter(f => BitFlags.isAny(BitFlags.createFlag(f.vorClass), classMask)
        && (f.type === VorType.Unknown || BitFlags.isAny(BitFlags.createFlag(f.type), typeMask)));
    this.coherentSearchSession.setVorFilter(classMask, typeMask);
}
```

`NearestUtils.init`: the class mask gets `BitFlags.createFlag(VorClass.Unknown)` (3-50: the closest VOR, of any class). `getNearestVor`:

```ts
//The results of vorSession, which reports only what was added and removed, by ICAO uid
private readonly vorResults = new Map<string, VorFacility>();
//#206: the session's diffs must apply in order, so one search runs at a time
private vorSearch: Promise<unknown> = Promise.resolve();

public getNearestVor(lat: Latitude, lon: Longitude): Promise<VorFacility | null> {
    const search = this.vorSearch.then(() => this.searchNearestVor(lat, lon));
    this.vorSearch = search.catch(() => undefined);
    return search;
}

private async searchNearestVor(lat: Latitude, lon: Longitude): Promise<VorFacility | null> {
    const distanceMeters = UnitType.NMILE.convertTo(REFERENCE_VOR_RADIUS_NM, UnitType.METER);
    const diff = await this.vorSession!.searchNearest(lat, lon, distanceMeters, 1);
    for (const icao of diff.removed) {
        this.vorResults.delete(ICAO.getUid(icao));
    }
    const added = await Promise.all(diff.added.map(icao => this.facilityLoader.tryGetFacility(FacilityType.VOR, icao)));
    for (const vor of added) {
        if (vor !== null) {
            this.vorResults.set(ICAO.getUid(vor.icaoStruct), vor);
        }
    }

    //#206: the session merges the nearest VOR of the database and the nearest user VOR: the nearer one is the reference
    let nearest: VorFacility | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const vor of this.vorResults.values()) {
        const distance = GeoPoint.distance(lat, lon, vor.lat, vor.lon);
        if (distance < nearestDistance) {
            nearest = vor;
            nearestDistance = distance;
        }
    }
    return nearest;
}
```

(Keep the `Latitude`/`Longitude` types the file uses today; `GeoPoint` and `ICAO` come from the SDK import.) The NAV 2 list from Task 7 has the low/high class mask, so the flag compare keeps user VORs (class Unknown) out of it.

- [ ] **Step 4: Run, full suite, expect PASS.**
- [ ] **Step 5: Commit.**

```bash
git add kln90b/data/navdata/KLNFacilityLoader.ts kln90b/data/navdata/NearestUtils.ts test/render/data/navdata/NearestList.test.ts test/render/pages/right/IntPage.test.ts
git commit -m "fixes #206 let user VORs be the nearest VOR, in the list and as the INT and SUP reference"
```

```json:metadata
{"files": ["kln90b/data/navdata/KLNFacilityLoader.ts", "kln90b/data/navdata/NearestUtils.ts", "test/render/data/navdata/NearestList.test.ts", "test/render/pages/right/IntPage.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#206 pins pass as it", "nearer database VOR wins over a later user VOR", "user VOR never on NAV 2", "concurrent calls each get their own nearest", "tsc clean, npm test green"], "modelTier": "standard"}
```

### Task 9: #270 macadam is a hard surface

**Goal:** APT 3 shows a macadam runway as `HRD`, and the SET 3 surface filter admits macadam with HRD and with HRD SFT (maintainer ruling).

**Files:**
- Modify: `kln90b/pages/right/Apt3ListPage.tsx` (`getKLNSurfaceString`, about `:141-171`)
- Modify: `kln90b/data/navdata/NearestList.ts` (`AirportNearestList.getSurfaceMask`, about `:168-202`, both cases)
- Test: `test/render/pages/right/Apt3Page.test.ts` (characterization at about `:79`), `test/unit/pages/right/Apt3ListPage.test.ts`, `test/unit/data/navdata/NearestListSurfaces.test.ts`

**Acceptance Criteria:**
- [ ] `Apt3Page.test.ts`: `shows a blank surface for a macadam runway` becomes `shows HRD for a macadam runway (maintainer ruling, #270)` expecting the HRD row (read the row layout from the sibling tests).
- [ ] `Apt3ListPage.test.ts`: a separate describe or row for Macadam → `HRD` labeled with the maintainer ruling (not under the 3-44 title); `lists every SDK surface type … in one of the tables` covers Macadam too (the exception goes).
- [ ] `NearestListSurfaces.test.ts`: a database airport whose only runway is 3000 ft macadam is in the nearest list with HRD and with HRD SFT (maintainer ruling, #270); both fail without the mask change.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/pages/right/Apt3Page.test.ts test/unit/pages/right/Apt3ListPage.test.ts test/unit/data/navdata/NearestListSurfaces.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write and change the tests.** In `NearestListSurfaces.test.ts`:

```ts
// The maintainer ruled macadam a hard surface (#270), as the SDK classes it (RunwayUtils.getSurfaceCategory)
describe('nearest airport surfaces, macadam (maintainer ruling, #270)', () => {
    const macadam = () => [airport('MACA', 47.01, 8.0, {runways: [{lengthFt: 3000, surface: RunwaySurfaceType.Macadam}]})];

    it('admits a macadam runway with HRD', async () => {
        expect(await nearestAirports(macadam(), SURFACE_HRD)).toEqual(['MACA']);
    });

    it('admits a macadam runway with HRD SFT', async () => {
        expect(await nearestAirports(macadam(), SURFACE_HRD_SFT)).toEqual(['MACA']);
    });
});
```

In `Apt3ListPage.test.ts`, remove the Macadam comment and the exception of the completeness test, and add:

```ts
// The maintainer ruled macadam a hard surface (#270); the guide does not name it (3-44)
describe('getKLNSurfaceString, macadam (maintainer ruling, #270)', () => {
    it('shows Macadam as HRD', () => {
        expect(getKLNSurfaceString(rwy({surface: RunwaySurfaceType.Macadam}))).toBe('HRD');
    });
});
```

and make the completeness test's expected list include Macadam (`[...SPEC_SURFACES.map(([s]) => s), RunwaySurfaceType.Macadam, ...BLANK_SURFACES]` against all values).

- [ ] **Step 2: Run; expect the new tests to fail.**
- [ ] **Step 3: Implement.** `Apt3ListPage.tsx`: `case RunwaySurfaceType.Macadam: //#270: the maintainer ruled macadam a hard surface, as the SDK classes it` in the HRD group. `NearestList.ts`: add `BitFlags.createFlag(RunwaySurfaceType.Macadam),` to the hard part of both the HRD SFT and the HRD masks, with the same comment.
- [ ] **Step 4: Run, full suite, expect PASS.**
- [ ] **Step 5: Commit.**

```bash
git add kln90b/pages/right/Apt3ListPage.tsx kln90b/data/navdata/NearestList.ts test/render/pages/right/Apt3Page.test.ts test/unit/pages/right/Apt3ListPage.test.ts test/unit/data/navdata/NearestListSurfaces.test.ts
git commit -m "fixes #270 count macadam as a hard surface on APT 3 and in the nearest airport filter"
```

```json:metadata
{"files": ["kln90b/pages/right/Apt3ListPage.tsx", "kln90b/data/navdata/NearestList.ts", "test/render/pages/right/Apt3Page.test.ts", "test/unit/pages/right/Apt3ListPage.test.ts", "test/unit/data/navdata/NearestListSurfaces.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["APT 3 shows HRD for macadam", "unit table holds Macadam as HRD under the ruling", "nearest list admits macadam with HRD and HRD SFT", "tsc clean, npm test green"], "modelTier": "mechanical"}
```

---

## Lane C: waypoint pages and names

Owner of `kln90b/data/CountryMap.ts`, `test/harness/navdata/builders.ts`, `kln90b/data/AirportNameFormatter.ts` (new), `kln90b/pages/right/Apt1Page.tsx`, `kln90b/pages/right/WaypointPage.tsx`, `kln90b/data/VolatileMemory.ts`, and the tests `test/unit/data/CountryMap.test.ts`, `test/unit/data/AirportNameFormatter.test.ts` (new), `test/render/pages/right/Apt1Page.test.ts`, `test/render/controls/AirportCoordOrNearestView.test.ts`, `test/unit/data/VolatileMemory.test.ts`. Tasks 10, 11, 12 in order, then Task 13 after lane A is integrated.

### Task 10: #342 the country from the facility's region

**Goal:** The Duplicate Waypoint page (and APT 2's fallback) names the country from `facility.region` for every facility; an empty or unknown region gives three blanks.

**Files:**
- Modify: `kln90b/data/CountryMap.ts` (`getCountry`, about `:335-346`)
- Modify: `test/harness/navdata/builders.ts` (`AirportOptions.region`, default K1)
- Test: `test/unit/data/CountryMap.test.ts` (pin at about `:45`; vehicles at about `:18`, `:37`, `:81`)

**Acceptance Criteria:**
- [ ] The #342 pin is an `it`, sets its regions explicitly (`B19` and `K00` in `K6`) and passes.
- [ ] New tests: `93F` in `K4` is `USA`; `ETAR` in `ED` is `DEU`; `KIG` with region `''` gives `'   '`; a user airport (region `XX`) gives `'   '`; an airport `MT99` in `K1` is `USA` (not HTI).
- [ ] The three vehicles set their regions (`LS`, `EG`, `LK`, `PA`) and become spec tests of the region rule (titles name 3-15 or D-1 to D-3, not the ident).
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/unit/data/CountryMap.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Builder option** (`builders.ts`): `/** The facility's region (Facility.region, filled by the sim since SU2). Default K1 */ region?: string;` in `AirportOptions`, and `region: opts.region ?? DEFAULT_REGION` in `airport()`.
- [ ] **Step 2: Tests.** Convert the pin (add `{region: 'K6'}`), rewrite the vehicles with explicit regions, add the new cases, for example:

```ts
// 3-15: each entry carries its country. The sim gives every facility its ICAO region since SU2, airports too (the
// maintainer's examples, #342)
it('names the country of an airport by its region (3-15, #342)', () => {
    expect(getCountry(airport('93F', 40, -100, {region: 'K4'}))).toBe('USA');
    expect(getCountry(airport('ETAR', 49.4, 7.6, {region: 'ED'}))).toBe('DEU');
    expect(getCountry(airport('MT99', 46.5, -110, {region: 'K1'}))).toBe('USA');
});

it('leaves three blanks for an airport without a region (#342)', () => {
    expect(getCountry(airport('KIG', -5, 145, {region: ''}))).toBe('   ');
});

// User airports carry the region XX, which names no country (maintainer ruling, #342)
it('leaves three blanks for a user airport (maintainer ruling, #342)', () => {
    expect(getCountry(airport('FARM', 47, 8, {region: 'XX'}))).toBe('   ');
});
```

- [ ] **Step 3: Run; expect the pin and the `MT99`, `XX` cases to fail.**
- [ ] **Step 4: Implement:**

```ts
export function getCountry(facility: Facility) {
    //3-15 shows the country of each entry. #342: the sim gives every facility its ICAO region since SU2, an airport too
    //(93F: K4, ETAR: ED), although the ICAO value of an airport has none. Some airports have no region (KIG)
    const region = facility.region ?? "";
    return COUNTRYMAP.hasOwnProperty(region) ? COUNTRYMAP[region] : "   ";
}
```

Remove the unused imports (`FacilityType`, `FacilityUtils`). Check `getRegionOrCountry` still reads well (its comment may mention the ident rule).

- [ ] **Step 5: Run, full suite** (other files may use `airport()` and the Duplicate Waypoint page; the default K1 keeps them USA), **commit.**

```bash
git add kln90b/data/CountryMap.ts test/harness/navdata/builders.ts test/unit/data/CountryMap.test.ts
git commit -m "fixes #342 take the country of every facility from its region" -m "Three CountryMap characterizations of the ident rule now set their regions and test the region rule."
```

```json:metadata
{"files": ["kln90b/data/CountryMap.ts", "test/harness/navdata/builders.ts", "test/unit/data/CountryMap.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#342 pin passes with explicit regions", "93F/ETAR/MT99/KIG/XX cases pass", "vehicles use regions", "tsc clean, npm test green"], "modelTier": "mechanical"}
```

### Task 11: #265 airport names as 3-26 shortens them

**Goal:** A new `AirportNameFormatter` shortens only names too long for APT 1's two name rows, by whole words, keeping a first word of eight characters or fewer, deleting CITY OF, GREATER and THE, and leaving no stray blank.

**Files:**
- Create: `kln90b/data/AirportNameFormatter.ts`
- Create: `test/unit/data/AirportNameFormatter.test.ts`
- Modify: `kln90b/pages/right/Apt1Page.tsx` (remove `formatAirportName`, call the formatter at about `:88` and `:185`)
- Test: `test/render/pages/right/Apt1Page.test.ts` (the four #265 pins at about `:194`, `:356`, `:362`, `:369`; the spec it.each at about `:343-351`)
- Modify (vehicle): `test/render/controls/AirportCoordOrNearestView.test.ts:54`

**Acceptance Criteria:**
- [ ] Unit tests of the formatter cover: a name of 22 characters is unchanged and one of 23 is shortened; a first word of 8 characters is kept and one of 9 is shortened; a listed word inside a longer word stays (WESTCHESTER); every occurrence of a word is shortened; CITY OF, GREATER and THE are deleted, also as the first word; no double or leading blank; punctuation is gone.
- [ ] The four render pins are `it` and pass; the THE pin uses a name long enough to be shortened (`THE HARTSFIELD ATLANTA INTERNATIONAL` → rows `HARTSFIELD ` / `ATLANTA INT`).
- [ ] The it.each `abbreviates the words of %s (3-26)` uses names longer than 22 characters; a new render test shows `FORT SMITH REGIONAL` whole (it fits).
- [ ] `AirportCoordOrNearestView.test.ts:54` expects `'KOUT AIRPOR'` / `'T          '` or gives KOUT an explicit name.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/unit/data/AirportNameFormatter.test.ts test/render/pages/right/Apt1Page.test.ts test/render/controls/AirportCoordOrNearestView.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Write the unit tests.** Labels: the rules themselves are 3-26; the 22-character threshold (the two rows of figure 3-85), the order of the rules and the application of all of them once a name is too long are characterizations, so put them in their own describe.

```ts
import {describe, expect, it} from 'vitest';
import {AirportNameFormatter} from '../../../kln90b/data/AirportNameFormatter';

const format = (name: string) => AirportNameFormatter.format(name);

// 3-26: names too long for the display are shortened: the compass words, Point, Port, Fort, Saint and General get short
// forms, City of, Greater and The are deleted, punctuation goes, International and Regional are shortened; the first
// word stays unless it is longer than eight characters
describe('AirportNameFormatter (3-26)', () => {
    it('shortens the listed words of a long name', () => {
        expect(format('ALPHA NORTH SAINT REGIONAL INTERNATIONAL')).toBe('ALPHA N ST REG INT');
    });

    it('shortens every occurrence of a word', () => {
        expect(format('FORT WORTH SAINT PAUL SAINT JOHN FIELD')).toBe('FORT WORTH ST PAUL ST JOHN FIELD');
    });

    it('keeps a listed word inside a longer word', () => {
        expect(format('WESTCHESTER COUNTY INTERNATIONAL AIRPORT')).toBe('WESTCHESTER COUNTY INT AIRPORT');
    });

    it('keeps a first word of eight characters', () => {
        expect(format('NORTHERN COLORADO REGIONAL AIRPORT')).toBe('NORTHERN COLORADO REG AIRPORT');
    });

    it('shortens a first word of nine characters', () => {
        expect(format('SOUTHEAST TEXAS REGIONAL AIRPORT')).toBe('SE TEXAS REG AIRPORT');
    });

    it('deletes THE, also as the first word, without a blank', () => {
        expect(format('THE HARTSFIELD ATLANTA INTERNATIONAL')).toBe('HARTSFIELD ATLANTA INT');
    });

    it('deletes CITY OF and GREATER', () => {
        expect(format('CITY OF COLORADO SPRINGS MUNICIPAL')).toBe('COLORADO SPRINGS MUNICIPAL');
        expect(format('GREATER BUFFALO INTERNATIONAL')).toBe('BUFFALO INT');
    });

    it('removes punctuation', () => {
        expect(format("St. Mary's County Regional Airport")).toBe('ST MARYS COUNTY REG AIRPORT');
    });
});

// Where 3-26 is silent: a name is too long when it does not fit APT 1's two name rows of eleven (figure 3-85), and
// then every rule applies
describe('AirportNameFormatter thresholds (characterization)', () => {
    it('keeps a name of 22 characters whole', () => {
        expect(format('ALPHA NORTH REGIONAL X')).toBe('ALPHA NORTH REGIONAL X');
    });

    it('shortens a name of 23 characters', () => {
        expect(format('ALPHA NORTH REGIONAL XY')).toBe('ALPHA N REG XY');
    });

    it('keeps THE in a name that fits', () => {
        expect(format('THE HARTSFIELD')).toBe('THE HARTSFIELD');
    });

    it('collapses blanks in a name that fits', () => {
        expect(format('KCCC  AIRPORT')).toBe('KCCC AIRPORT');
    });
});
```

Count every literal (the 22/23 pair must be exactly 22 and 23 characters after conversion) before relying on it. `ST MARYS COUNTY REG AIRPORT`: `St. Mary's County Regional Airport` is 34 characters, so it is shortened; its first word `ST` is kept; check the expectation against the rules once more.

- [ ] **Step 2: Run, expect FAIL** (module missing).
- [ ] **Step 3: Implement** `kln90b/data/AirportNameFormatter.ts`:

```ts
import {convertTextToKLNCharset} from "./Text";

/** APT 1 shows a name in two rows of eleven (figure 3-85) */
const NAME_LENGTH = 22;
/** 3-26: the first word is usually kept unless it is longer than this */
const FIRST_WORD_KEPT_LENGTH = 8;

/** 3-26, in this order (NORTHWEST before NORTH, NORTHERN before NORTH) */
const SHORT_FORMS: [string, string][] = [
    ["NORTHWEST", "NW"], ["NORTHEAST", "NE"], ["SOUTHWEST", "SW"], ["SOUTHEAST", "SE"],
    ["NORTHERN", "N"], ["NORTH", "N"], ["EASTERN", "E"], ["EAST", "E"],
    ["SOUTHERN", "S"], ["SOUTH", "S"], ["WESTERN", "W"], ["WEST", "W"],
    ["POINT", "PT"], ["PORT", "PT"], ["FORT", "FT"], ["SAINT", "ST"], ["GENERAL", "GEN"],
    ["INTERNATIONAL", "INT"], ["REGIONAL", "REG"],
];
/** 3-26: deleted words */
const DELETED_WORDS = ["CITY OF", "GREATER", "THE"];

/**
 * The airport name as APT 1 shows it (3-26). The person's-initials rule of 3-26 is not implemented: a person's name
 * cannot be told from other words.
 */
export class AirportNameFormatter {
    public static format(rawName: string): string {
        const name = AirportNameFormatter.collapse(convertTextToKLNCharset(rawName));
        if (name.length <= NAME_LENGTH) {
            return name;
        }

        let shortened = name;
        for (const word of DELETED_WORDS) {
            shortened = shortened.replace(AirportNameFormatter.wholeWord(word), "");
        }
        shortened = AirportNameFormatter.collapse(shortened);

        const firstBlank = shortened.indexOf(" ");
        const firstWord = firstBlank === -1 ? shortened : shortened.substring(0, firstBlank);
        const rest = firstBlank === -1 ? "" : shortened.substring(firstBlank);
        const first = firstWord.length > FIRST_WORD_KEPT_LENGTH ? AirportNameFormatter.shorten(firstWord) : firstWord;
        return AirportNameFormatter.collapse(first + AirportNameFormatter.shorten(rest));
    }

    private static shorten(text: string): string {
        for (const [word, shortForm] of SHORT_FORMS) {
            text = text.replace(AirportNameFormatter.wholeWord(word), shortForm);
        }
        return text;
    }

    private static wholeWord(word: string): RegExp {
        return new RegExp(`\\b${word}\\b`, "g");
    }

    private static collapse(text: string): string {
        return text.replace(/ {2,}/g, " ").trim();
    }
}
```

`Apt1Page.tsx`: delete `formatAirportName` and its `convertTextToKLNCharset` import if unused; call `AirportNameFormatter.format(Utils.Translate(facility.name))` at both places; keep `multiline`.

- [ ] **Step 4: Run the unit tests, expect PASS.** Then convert the four render pins: the THE pin's name becomes `THE HARTSFIELD ATLANTA INTERNATIONAL` with rows `['HARTSFIELD ', 'ATLANTA INT']` (slice 1..3), its comment explains that only a name too long is shortened. Rewrite the it.each with long names, for example `['FORT SMITH REGIONAL AIRPORT DISTRICT', ['FORT SMITH ', 'REG AIRPORT']]` (FORT is the first word and stays; check the cut after 22) and `['SAINT CLAIR COUNTY INTERNATIONAL', ['SAINT CLAIR', ' COUNTY INT']]` (compute the rows from the formatter's output and the 11-cell split; they must be literals in the test). Add `shows FORT SMITH REGIONAL whole because it fits (3-26)` with rows `['FORT SMITH ', 'REGIONAL   ']`. Fix the vehicle in `AirportCoordOrNearestView.test.ts:54` (the default name `KOUT AIRPORT` now shows `KOUT AIRPOR` / `T          `).
- [ ] **Step 5: tsc, full suite, commit.**

```bash
git add kln90b/data/AirportNameFormatter.ts test/unit/data/AirportNameFormatter.test.ts kln90b/pages/right/Apt1Page.tsx test/render/pages/right/Apt1Page.test.ts test/render/controls/AirportCoordOrNearestView.test.ts
git commit -m "fixes #265 shorten only long airport names, by whole words and keeping a short first word, in a formatter of its own" -m "AirportCoordOrNearestView.test.ts snapshotted the harness default name with the bug (KOUT AIRPT)."
```

```json:metadata
{"files": ["kln90b/data/AirportNameFormatter.ts", "test/unit/data/AirportNameFormatter.test.ts", "kln90b/pages/right/Apt1Page.tsx", "test/render/pages/right/Apt1Page.test.ts", "test/render/controls/AirportCoordOrNearestView.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["formatter unit tests cover thresholds, whole words, every occurrence, deletions, blanks, punctuation", "four render pins pass as it", "it.each uses long names; FORT SMITH REGIONAL shown whole", "vehicle fixed", "tsc clean, npm test green"], "modelTier": "standard"}
```

### Task 12: #268 the cursor parked on the rank follows the new nearest

**Goal:** With the cursor parked on the rank of a nearest page, the page shows whatever waypoint holds that rank on every tick.

**Files:**
- Modify: `kln90b/pages/right/WaypointPage.tsx` (`tick` about `:122-138`, `changeFacility`)
- Test: `test/render/pages/right/Apt1Page.test.ts` (pin at about `:472`)

**Acceptance Criteria:**
- [ ] The #268 pin is an `it` and passes; the sibling `keeps the cursor on the rank while the nearest list changes (3-24)` asserts the rank exactly (`nr 1`, not `/^nr [12]$/`).
- [ ] The cursor-off spec test `follows the aircraft with the nr of the shown airport (3-24, d202f4a)` stays green.
- [ ] A new test: parked on nr 1, the nearest list shrinks below the parked rank (or the page is parked on nr 2 and the list loses an entry): the page shows the last entry instead of an error.
- [ ] A new test: parked on nr 1, one scan step clockwise shows nr 2, and the page then follows rank 2 as the list changes.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/pages/right/Apt1Page.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Convert the pin, tighten the sibling, write the two new tests** with the helpers of that describe (`parkOnNr1ThenMove`), labels 3-24 (the KLN 89 trainer citation only where the trainer showed it: following at rank 1).
- [ ] **Step 2: Run; expect the pin and the scan-then-follow test to fail.**
- [ ] **Step 3: Implement** (the #268 part of the inventory's `202+268.patch`):

```ts
//#268: the rank the cursor is parked on (3-24), null while the cursor is elsewhere. The cursor does not survive a
//new page, so neither does the rank
private parkedRank: number | null = null;
```

```ts
tick(blink: boolean) {
    super.tick(blink);
    const nearestSelector = this.children.get("nearestSelector");
    if (isNearestWpt(this.facility) && nearestSelector && (nearestSelector as NearestSelector).isFocused) {
        //3-24 the waypoint will be continuously updated: the page shows whatever waypoint holds the parked rank (#268)
        if (this.parkedRank === null) {
            this.parkedRank = this.facility.index;
        }
        const nearestList: NearestWpt<T>[] = this.getNearestList()!.getNearestList() as any;
        const idx = Math.min(this.parkedRank, nearestList.length - 1);
        if (idx > -1) {
            const newFacility = nearestList[idx];
            if (newFacility != this.facility) {
                this.changeFacility(newFacility);
            }
        }
    } else {
        this.parkedRank = null;
    }
}
```

In `changeFacility`'s facility branch, after the sync:

```ts
if (this.parkedRank !== null && isNearestWpt(fac)) {
    this.parkedRank = fac.index; //A scan with the cursor parked moves the rank (#268)
}
```

- [ ] **Step 4: Run, full suite (APT, VOR, NDB nearest pages share the code), expect PASS.**
- [ ] **Step 5: Commit.**

```bash
git add kln90b/pages/right/WaypointPage.tsx test/render/pages/right/Apt1Page.test.ts
git commit -m "fixes #268 follow the waypoint at the parked rank while the cursor stays on it"
```

```json:metadata
{"files": ["kln90b/pages/right/WaypointPage.tsx", "test/render/pages/right/Apt1Page.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#268 pin passes as it", "sibling asserts nr 1 exactly", "shrinking list shows the last entry", "scan while parked moves the followed rank", "tsc clean, npm test green"], "modelTier": "standard"}
```

### Task 13: #202 scan from the last match of a typed ident

**Goal:** A scan from a typed ident that matches no waypoint starts from the last waypoint the entry matched; without a last match, a clockwise scan goes to the first waypoint after the typed ident.

**Runs after lane A (Tasks 1-3) is integrated:** first `git merge --ff-only m6-nearest-scan` (the controller says when).

**Files:**
- Modify: `kln90b/data/VolatileMemory.ts` (`WaypointPageState.lastMatch`, the five page states, `reset`)
- Modify: `kln90b/pages/right/WaypointPage.tsx` (`scanLeft`, `scanRight`, `changeFacility`, new `getScanStart`)
- Modify: `kln90b/data/navdata/Scanlist.ts` (`findClosest`)
- Test: `test/render/pages/right/Apt1Page.test.ts` (pins at about `:207`, `:214`), `test/unit/data/navdata/Scanlist.test.ts` (a new `findClosest` test), `test/unit/data/VolatileMemory.test.ts` (whole-object expectations of the page states, if any)

**Acceptance Criteria:**
- [ ] Both #202 pins are `it` and pass.
- [ ] A new unit test: intersections `AAA`, `BBB`, `CCC`; `getNext(ICAO.value('W', <region>, '', 'BBC'), 1)` returns `CCC` and `getNext(…'BBC', -1)` returns `BBB` (the clockwise one fails on the current `findClosest`).
- [ ] A new test that a power cycle clears the last match (unit test on `VolatileMemory.reset`, or a render test: type `KCZ`, power cycle, the page memory's `lastMatch` is null).
- [ ] A new render test that a typed ident that matches again clears the last match: after `KCZ` back to `KC` (KCCC shown) and on to `KD` (KDDD), a scan from a non-matching `KDZ` goes from KDDD, not KCCC.
- [ ] `tsc` clean, full `npm test` green.

**Verify:** `npx vitest run test/render/pages/right/Apt1Page.test.ts test/unit/data/navdata/Scanlist.test.ts test/unit/data/VolatileMemory.test.ts` → pass; then `npm test`.

**Steps:**

- [ ] **Step 1: Convert the pins; write the three new tests** (labels: 3-21 and the KLN 89 trainer of 2026-10-07 for scanning from the last match; the `findClosest` unit test cites 3-21; the power-cycle test is a characterization of the state rule).
- [ ] **Step 2: Run; expect them to fail.**
- [ ] **Step 3: Implement** (the #202 part of the inventory's `202+268.patch`). `VolatileMemory.ts`:

```ts
export interface WaypointPageState<T extends Facility> {
    facility: T | NearestWpt<T> | null,
    ident: string,
    /**
     * #202: the last waypoint the ident entry matched, while the typed ident matches none. A scan starts from it (3-21,
     * KLN 89 trainer 2026-10-07)
     */
    lastMatch: T | null,
}
```

`lastMatch: null` in `aptPage`, `vorPage`, `ndbPage`, `intPage`, `supPage`; in `reset`, before the `setFirst*` calls:

```ts
//#202: a power cycle forgets the last match of the ident entry
this.aptPage.lastMatch = null;
this.vorPage.lastMatch = null;
this.ndbPage.lastMatch = null;
this.intPage.lastMatch = null;
this.supPage.lastMatch = null;
```

`WaypointPage.tsx`: `scanLeft`/`scanRight` call `this.scanHandler.scanLeft(this.getScanStart())` / `scanRight(this.getScanStart())`;

```ts
/**
 * The waypoint a scan starts from: the one shown, else the last one the ident entry matched (#202, 3-21, KLN 89
 * trainer 2026-10-07), else the typed ident
 */
private getScanStart(): IcaoValue {
    const fac = unpackFacility(this.facility);
    if (fac) {
        return fac.icaoStruct;
    }
    const lastMatch = this.getMemory().lastMatch;
    return lastMatch ? lastMatch.icaoStruct : buildIcaoStructIdentOnly(this.ident.padEnd(5, " "));
}
```

In `changeFacility`, the string branch first:

```ts
//#202: a typed ident that matches nothing replaces the last match. Nested pages call this again with the memory
//already cleared, so the memory decides
const memoryFacility = unpackFacility(this.getMemory().facility);
if (memoryFacility !== null) {
    this.getMemory().lastMatch = memoryFacility;
}
```

and in the facility branch `this.getMemory().lastMatch = null;`. `Scanlist.findClosest`:

```ts
/**
 * Happens, when the user has selected an ident, that does not exist. Returns the position in the cache from which a
 * step in the given direction reaches the next closest entry: clockwise the first entry after the ident, counterclockwise
 * the last one before it (#202)
 */
private findClosest(icao: IcaoValue, direction: number): number {
    let firstAfter = this.icaoListCache.findIndex(testIcao => testIcao.ident.localeCompare(icao.ident) > 0);
    if (firstAfter === -1) {
        firstAfter = this.icaoListCache.length;
    }
    return direction > 0 ? firstAfter - 1 : firstAfter;
}
```

Check the edge cases with the cache's `Utils.Clamp(listIndex + direction, …)` in `getNext`: before the first entry clockwise gives index 0; after the last counterclockwise gives the last; past the end clockwise gives null.

- [ ] **Step 4: Run, full suite.** `VolatileMemory.test.ts` may compare page states as whole objects: add `lastMatch: null` there (say so in the message).
- [ ] **Step 5: Commit.**

```bash
git add kln90b/data/VolatileMemory.ts kln90b/pages/right/WaypointPage.tsx kln90b/data/navdata/Scanlist.ts test/render/pages/right/Apt1Page.test.ts test/unit/data/navdata/Scanlist.test.ts test/unit/data/VolatileMemory.test.ts
git commit -m "fixes #202 scan from the last waypoint the ident entry matched, and clockwise from a typed ident to the next one"
```

```json:metadata
{"files": ["kln90b/data/VolatileMemory.ts", "kln90b/pages/right/WaypointPage.tsx", "kln90b/data/navdata/Scanlist.ts", "test/render/pages/right/Apt1Page.test.ts", "test/unit/data/navdata/Scanlist.test.ts", "test/unit/data/VolatileMemory.test.ts"], "verifyCommand": "npx tsc --noEmit && npm test", "acceptanceCriteria": ["#202 pins pass as it", "findClosest clockwise/counterclockwise from BBC", "power cycle clears lastMatch", "a new match clears lastMatch", "tsc clean, npm test green"], "modelTier": "standard"}
```

---

## Task 14: Integrate, review the whole branch, hand over

**Goal:** All thirteen fixes on `m6-nearest-scan`, linear, each commit green, reviewed as a whole; the maintainer decides the merge.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-16-nearest-scan-database.md.tasks.json` (task states)
- Possibly: `docs/test-next-steps.md` or `test/README.md` if a rule changed (only if a task's report says so)

**Acceptance Criteria:**
- [ ] The lane commits are cherry-picked onto `m6-nearest-scan` in task order (A: 1-3; B: 4-9; C: 10-12; then 13), no merge commits; `git log --oneline master..m6-nearest-scan` shows one `fixes #NN` commit per issue plus the record, the `#387` note, the spec and the plan.
- [ ] Every commit builds: for each `fixes` commit, `npx tsc --noEmit` and `npm test` green (at least at the lane tips and the branch tip; every commit if time allows).
- [ ] `npm run build` succeeds at the tip.
- [ ] A final whole-branch review (session-level model) with mutation checks per fix; findings fixed as `--fixup` commits folded with `GIT_EDITOR=true git rebase --autosquash --autostash master`, checked with a before-tag and `git diff --quiet <tag>` for unintended changes.
- [ ] All worktrees removed (junctions first), `node_modules` intact.
- [ ] Nothing merged into master before the maintainer's approval; no push.

**Verify:** `git log --oneline master..m6-nearest-scan` → one fixes commit per issue; `npx tsc --noEmit && npm test && npm run build` → clean, green, built.

**Steps:**

- [ ] **Step 1:** Cherry-pick each lane's commits in order; run `tsc` and `npm test` after each lane.
- [ ] **Step 2:** Dispatch the final review; fold fixes by fixup and autosquash.
- [ ] **Step 3:** Remove worktrees (junction first), check `node_modules`, update the task states, and ask the maintainer to approve the merge (and `-D` for the `worktree-agent-*` branches whose commits were squashed).

```json:metadata
{"files": ["docs/superpowers/plans/2026-10-16-nearest-scan-database.md.tasks.json"], "verifyCommand": "npx tsc --noEmit && npm test && npm run build", "acceptanceCriteria": ["linear branch, one fixes commit per issue", "tsc, tests and build green at the tip", "final review findings folded", "worktrees removed, node_modules intact", "no merge before approval"], "modelTier": "frontier"}
```
