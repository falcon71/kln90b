# Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three test stages to the KLN 90B project (unit, screen rendering, simulated flights), each proven by one short realistic test, and document them.

**Architecture:** Vitest runs three projects. The unit project runs in Node; the render and flight projects run in happy-dom. All three install fakes for the sim's global APIs (the native SimVar layer, Coherent listeners, DataStore, coui:// XHR, magvar). A new composition root, `KLN90BCore`, takes a small `KLN90BPlatform` (navdata client, facility repository, EFB route manager), so tests boot the real instrument headless with an in-memory navdata source and fly it on Vitest fake timers with a kinematic aircraft and a coupled autopilot.

**Tech Stack:** TypeScript 6, Vitest 5 (Vite 8, Oxc transform), happy-dom 20, @napi-rs/canvas 1, `@microsoft/msfs-sdk` 2.3.

**Spec:** `docs/superpowers/specs/2026-10-03-test-harness-design.md`

## Global Constraints

- **No behavior change in production code.** The only production edits allowed are in Task 3 (composition-root extraction) and they must be verbatim moves plus the named substitutions. The public contract (H events in `kln90b/HEvents.ts`, LVars in `kln90b/LVars.ts`, panel.xml keys, GPS SimVars, persisted setting keys and the V1/V2 formats) must not change.
- **Bugs found while building are not fixed.** Check GitHub issues (`falcon71/kln90b`); if new, stop and report to the coordinator, who asks the user before filing. Pin known bugs with `it.fails(...)` and the issue number in the test name. Already filed: #97 (`intermediatePoint`), #98 (V2 latitude sign).
- `target: es2017` / `module: es2015` in `tsconfig.json` stay unchanged. Test code must type-check under them: **no top-level `await` and no `import.meta`** in test or harness files.
- `npx tsc --noEmit` must stay clean (it type-checks `test/` too). `npm run build` must still succeed with only the pre-existing warnings (about 18 circular-dependency warnings and a Sass legacy-API warning).
- Comments and docs: American English. No counts of things that grow (tests, fakes, files) in prose.
- Never copy text, tables or images from the KLN manuals into the repo; cite page numbers only (e.g. `3-14`).
- Commit messages: plain sentences, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never `git push`.
- One headless unit per test file (singletons: `KLNFacilityRepository`, the settings managers). Vitest isolates modules per file.
- Determinism: every boot uses the fake clock (default start `2026-06-01T12:00:00Z`) and a seeded `Math.random`.

**User decisions (already made):**
- Test runner: Vitest. DOM: happy-dom (not jsdom). Canvas: included from the start via @napi-rs/canvas, maps asserted as ASCII pixel art.
- Screen assertions: 23×7 text grid plus attribute mask.
- Assembly: scoped composition root (`KLN90BCore` + `KLN90BPlatform`); leaf code keeps calling `SimVar`, faked globally.
- Pilot: pluggable, coupled autopilot by default. Time: `fly()` (every tick) and `jump()` (slew-style, refuses to cross a waypoint).
- Navdata: synthetic builders; the memory source also accepts plain JSON. No in-sim recorder.
- Flight plan entry: front-panel driver in the proof flight; seeded storage available for other tests.
- Bugs: #97 and #98 are filed; pin, don't fix.

---

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.mts` | Three Vitest projects, scss redirect, FSComponent JSX factory, console filter |
| `test/harness/sim/staticGlobals.ts` | MSFS globals the SDK and the code need at load time (`BaseInstrument`, `registerInstrument`, `KeyCode`, `Utils`, …) |
| `test/harness/sim/units.ts` | Unit conversion for the SimVar fake |
| `test/harness/sim/FakeSim.ts` | The sim's native SimVar layer: registered ids, values, write log, `K:` events, game vars, derived time |
| `test/harness/sim/FakeCoherent.ts` | `Coherent`, `RegisterViewListener`, `RegisterGenericDataListener`; routes `setValueReg_*` to `FakeSim` |
| `test/harness/sim/FakeStorage.ts` | `GetStoredData`/`SetStoredData` in memory |
| `test/harness/sim/FakeXhr.ts` | `XMLHttpRequest` serving `coui://` from `resources/` |
| `test/harness/sim/install.ts` | `installSimFakes()` / `simEnv()` |
| `test/harness/sim/clock.ts` | `startFakeClock()` |
| `test/harness/sim/random.ts` | `seedRandom()` |
| `test/harness/setup/unit.ts`, `test/harness/setup/dom.ts` | Vitest setup files |
| `test/harness/navdata/builders.ts` | `airport()`, `vor()`, `ndb()`, `intersection()` |
| `test/harness/navdata/MemoryFacilityClient.ts` | In-memory replacement for the SDK `FacilityLoader` methods `KLNFacilityLoader` uses |
| `test/harness/platform.ts` | `FakePlatform` implementing `KLN90BPlatform` |
| `test/harness/storage.ts` | Seeded user data helpers |
| `test/harness/boot.ts` | `bootUnit()` → `HeadlessUnit` |
| `test/harness/render/screen.ts` | `Screen`: 23×7 text grid and mask from the DOM |
| `test/harness/render/canvas.ts` | Skia-backed `getContext('2d')`, `canvasToAscii()` |
| `test/harness/flight/Aircraft.ts` | Kinematic aircraft, writes the sim inputs |
| `test/harness/flight/pilots.ts` | `Pilot`, `coupledAutopilot()`, `ManualPilot`, `scriptedPath()` |
| `test/harness/flight/World.ts` | Navdata world for a flight |
| `test/harness/flight/geo.ts` | Independent great-circle math for expectations |
| `test/harness/flight/Recorder.ts` | 1 Hz flight recorder, JSONL + KML on failure |
| `test/harness/flight/Flight.ts` | `Flight.start`, `fly`, `flyUntil`, `jump`, monitors, `nav` view |
| `test/harness/flight/FrontPanel.ts` | Knob/button driver and helpers |
| `kln90b/KLN90BPlatform.ts` (new) | Platform interface + `SIM_PLATFORM` |
| `kln90b/KLN90BCore.ts` (new) | Composition root moved out of `KLN90B.tsx` |
| `kln90b/KLN90B.tsx` | Thin `BaseInstrument` adapter |
| `kln90b/data/navdata/KLNFacilityLoader.ts` | Constructor takes `ActualFacilityClient` |
| `docs/testing.md` (new) | Test documentation |

---

### Task 1: Vitest tooling and load-time globals

**Goal:** `npm test` runs a Vitest unit project that loads the SDK and project modules under Node.

**Files:**
- Modify: `package.json`, `package-lock.json`, `.gitignore`
- Create: `vitest.config.mts`, `test/harness/sim/staticGlobals.ts`, `test/harness/sim/install.ts`, `test/harness/setup/unit.ts`, `test/harness/setup/dom.ts`
- Test: `test/unit/harness/sdk.test.ts`

**Acceptance Criteria:**
- [ ] `npm test` exits 0 and reports the `unit` project test passing.
- [ ] `npx vitest run --project unit` runs only unit tests.
- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run build` succeeds (pre-existing warnings only).

**Verify:** `npm test` → `Test Files  1 passed`

**Steps:**

- [ ] **Step 1: Install dev dependencies**

```bash
npm install -D vitest@^5 happy-dom@^20 @napi-rs/canvas@^1
```

Then add scripts to `package.json` (keep `build`):

```json
"scripts": {
  "build": "npx rollup -c",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 2: Create `vitest.config.mts`**

```ts
import {defineConfig} from 'vitest/config';

const IGNORED_SCSS = '\0kln90b-ignored-scss';

/**
 * KLN90B.tsx imports KLN90B.scss for rollup. Tests need no styles, and compiling them would need sass-embedded, so
 * every .scss import resolves to an empty module.
 */
const ignoreScss = {
    name: 'kln90b-ignore-scss',
    enforce: 'pre' as const,
    resolveId: (id: string) => id.endsWith('.scss') ? IGNORED_SCSS : null,
    load: (id: string) => id === IGNORED_SCSS ? 'export default "";' : null,
};

export default defineConfig({
    plugins: [ignoreScss],
    // Same JSX factory as tsconfig.json: FSComponent, not React
    oxc: {jsx: {runtime: 'classic', pragma: 'FSComponent.buildComponent', pragmaFrag: 'FSComponent.Fragment'}},
    test: {
        // The instrument logs a lot. Set KLN_TEST_LOG=1 to see console.log/info output; stderr is always shown.
        onConsoleLog: (_log, type) => process.env.KLN_TEST_LOG === '1' || type === 'stderr' ? undefined : false,
        projects: [
            {
                extends: true,
                test: {name: 'unit', environment: 'node', include: ['test/unit/**/*.test.ts'], setupFiles: ['test/harness/setup/unit.ts']},
            },
            {
                extends: true,
                test: {name: 'render', environment: 'happy-dom', include: ['test/render/**/*.test.ts'], setupFiles: ['test/harness/setup/dom.ts']},
            },
            {
                extends: true,
                test: {
                    name: 'flight', environment: 'happy-dom', include: ['test/flight/**/*.test.ts'],
                    setupFiles: ['test/harness/setup/dom.ts'], testTimeout: 60_000,
                },
            },
        ],
    },
});
```

- [ ] **Step 3: Create `test/harness/sim/staticGlobals.ts`**

These are the MSFS globals the SDK touches at import time or the code reads as ambient constants. Values for `KeyCode` and `RunwayDesignator` come from `node_modules/@microsoft/msfs-types/js/common.d.ts`.

```ts
/**
 * MSFS globals that the SDK and the instrument use as ambient values. They are static: nothing here talks to the sim.
 * The stateful fakes (SimVars, Coherent, storage, XHR) are installed on top by install.ts.
 */
export function installStaticGlobals(g: any): void {
    // The SDK assigns SimVar.GetSimVarValue/SetSimVarValue onto this object at import time; FakeSim adds the native
    // layer to the same object. Never replace it after the SDK has loaded.
    g.SimVar ??= {};
    g.__registeredInstruments = new Map<string, unknown>();
    g.registerInstrument = (name: string, cls: unknown) => g.__registeredInstruments.set(name, cls);
    g.BaseInstrument = class {
        public xmlConfig: Document | undefined;

        Init(): void {
        }

        connectedCallback(): void {
        }

        onInteractionEvent(_args: string[]): void {
        }

        onSoundEnd(_id: unknown): void {
        }
    };
    g.RunwayDesignator = {
        RUNWAY_DESIGNATOR_NONE: 0, RUNWAY_DESIGNATOR_LEFT: 1, RUNWAY_DESIGNATOR_RIGHT: 2, RUNWAY_DESIGNATOR_CENTER: 3,
        RUNWAY_DESIGNATOR_WATER: 4, RUNWAY_DESIGNATOR_A: 5, RUNWAY_DESIGNATOR_B: 6,
    };
    g.Avionics = {Utils: {DEG2RAD: Math.PI / 180, RAD2DEG: 180 / Math.PI}};
    g.Utils = {
        Clamp: (n: number, min: number, max: number) => Math.min(max, Math.max(min, n)),
        // The sim translates localization keys; plain database text comes back unchanged.
        Translate: (key: string) => key,
    };
    g.KeyCode = {
        KEY_BACK_SPACE: 8, KEY_ENTER: 13, KEY_ESCAPE: 27, KEY_PAGE_UP: 33, KEY_PAGE_DOWN: 34, KEY_END: 35, KEY_HOME: 36,
        KEY_DELETE: 46, KEY_0: 48, KEY_9: 57, KEY_A: 65, KEY_Z: 90, KEY_NUMPAD0: 96, KEY_NUMPAD9: 105,
    };
    g.GameState = {mainmenu: 0, loading: 1, briefing: 2, ingame: 3};
    g.LatLongAlt = class {
        constructor(public lat = 0, public long = 0, public alt = 0) {
        }
    };
    // The EventBus sync waits for this listener; ours never becomes ready, so the bus stays local to this instrument.
    g.RegisterGenericDataListener = () => ({send: () => undefined, onDataReceived: () => undefined});
    g.requestAnimationFrame ??= (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16);
    g.cancelAnimationFrame ??= (id: ReturnType<typeof setTimeout>) => clearTimeout(id);
}
```

- [ ] **Step 4: Create `test/harness/sim/install.ts`, the setup files and `.gitignore` entry**

`test/harness/sim/install.ts` (Task 4 extends it):

```ts
import {installStaticGlobals} from './staticGlobals';

/** Installs the sim fakes into the globals. Runs once per test file from the Vitest setup files. */
export function installSimFakes(): void {
    installStaticGlobals(globalThis);
}
```

`test/harness/setup/unit.ts`:

```ts
import {installSimFakes} from '../sim/install';

installSimFakes();
```

`test/harness/setup/dom.ts` (Task 7 adds the canvas):

```ts
import {installSimFakes} from '../sim/install';

installSimFakes();
```

Append to `.gitignore`:

```
test/flight/__output__/
```

- [ ] **Step 5: Write the smoke test `test/unit/harness/sdk.test.ts`**

```ts
import {describe, expect, it} from 'vitest';
import {ICAO} from '@microsoft/msfs-sdk';
import {bankeAngleForStandardTurn} from '../../../kln90b/services/KLNNavmath';

describe('test harness', () => {
    it('loads the SDK and project modules under Node', () => {
        expect(ICAO.value('V', 'K1', '', 'ABC').ident).toBe('ABC');
        // Standard-rate bank angle, https://edwilliams.org/avform147.htm#Turns: 57.3 * atan(120 / 362.1) = 18.34°
        expect(bankeAngleForStandardTurn(120)).toBeCloseTo(18.34, 2);
        // Above 25° the unit limits the bank (MAX_BANK_ANGLE)
        expect(bankeAngleForStandardTurn(300)).toBe(25);
    });
});
```

- [ ] **Step 6: Run and check**

Run: `npm test` → Expected: `Test Files  1 passed (1)`.
Run: `npx tsc --noEmit` → Expected: no output. If `vitest.config.mts` causes a type error under `module: es2015`, add `"exclude": ["node_modules", "vitest.config.mts"]` to `tsconfig.json` (the config is still type-checked by Vitest when it loads) and note it in the commit message.
Run: `npm run build` → Expected: success with the pre-existing warnings only.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .gitignore vitest.config.mts test/
git commit -m "Added Vitest with a unit test project" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["package.json", "package-lock.json", ".gitignore", "vitest.config.mts", "test/harness/sim/staticGlobals.ts", "test/harness/sim/install.ts", "test/harness/setup/unit.ts", "test/harness/setup/dom.ts", "test/unit/harness/sdk.test.ts"], "verifyCommand": "npm test && npx tsc --noEmit && npm run build", "acceptanceCriteria": ["npm test exits 0 with the unit project test passing", "npx vitest run --project unit runs only unit tests", "npx tsc --noEmit is clean", "npm run build succeeds with only pre-existing warnings"], "modelTier": "mechanical"}
```

---

### Task 2: Unit proof tests (V2 user waypoints, #97 and #98 pins)

**Goal:** A realistic unit test of the persisted V2 user-waypoint format, plus `it.fails` pins for #97 and #98.

> **USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Files:**
- Test: `test/unit/settings/UserWaypointV2.test.ts`
- Test: `test/unit/services/KLNNavmath.test.ts`

**Acceptance Criteria:**
- [ ] `npx vitest run --project unit` reports the V2 format tests passing and exactly two expected failures (#97, #98).
- [ ] Expected values are literals, not computed by the code under test.
- [ ] No production file changed.

**Verify:** `npx vitest run --project unit` → `Tests  6 passed | 2 expected fail` (counts as of this task)

**Steps:**

- [ ] **Step 1: Write `test/unit/settings/UserWaypointV2.test.ts`**

The V2 layout is documented in `docs/architecture.md` (Core 7): 19-char `ICAO.valueToStringV2`, then lat `+DDMM.MM`, lon `+DDDMM.MM`, then type-specific fields.

```ts
import {beforeEach, describe, expect, it} from 'vitest';
import {AirportFacility, EventBus, Facility, FacilityType, ICAO, NdbFacility, RunwaySurfaceType, UnitType, VorFacility} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserWaypointsSettings} from '../../../kln90b/settings/KLN90BUserWaypoints';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {UserWaypointPersistor} from '../../../kln90b/settings/UserWaypointPersistor';
import {UserWaypointLoaderV2} from '../../../kln90b/settings/UserWaypointLoaderV2';

const bus = new EventBus();
const userSettings = new KLN90BUserSettings(bus);
userSettings.getSetting('userDataFormat').set(2);
const repo = KLNFacilityRepository.getRepository(bus);
// Persists every repository change into the wpt0..wpt249 settings, as in the instrument
new UserWaypointPersistor(bus, repo, userSettings);
const wptSettings = KLN90BUserWaypointsSettings.getManager(bus);

function storedSlot(i: number): string {
    return wptSettings.getSetting(`wpt${i}`).get();
}

function restoreFrom(...serialized: string[]): void {
    serialized.forEach((s, i) => wptSettings.getSetting(`wpt${i}`).set(s));
    new UserWaypointLoaderV2(bus, repo).restoreWaypoints();
}

function removeAll(): void {
    const all: Facility[] = [];
    repo.forEach(f => all.push(f));
    all.forEach(f => repo.remove(f));
}

beforeEach(removeAll);

describe('user waypoint V2 format', () => {
    it('serializes a user VOR', () => {
        const vor = {
            icao: '', icaoStruct: ICAO.value('V', 'XX', '', 'ABC'), name: '', lat: 47.5, lon: 8.9, region: 'XX', city: '',
            magvar: 0, freqMHz: 114.3, freqBCD16: 0, magneticVariation: 2, type: 0, vorClass: 0, navRange: 0,
            dme: null, ils: null, tacan: null, trueReferenced: false, alt: 0,
        } as unknown as VorFacility;
        repo.add(vor);
        expect(storedSlot(0)).toBe('VXX        ABC     +4730.00+00854.00+114.30+02');
    });

    it('restores a user VOR', () => {
        restoreFrom('VXX        ABC     +4730.00+00854.00+114.30+02');
        const vor = repo.get(ICAO.value('V', 'XX', '', 'ABC')) as VorFacility;
        expect(vor.lat).toBeCloseTo(47.5, 6);
        expect(vor.lon).toBeCloseTo(8.9, 6);
        expect(vor.freqMHz).toBeCloseTo(114.3, 6);
        expect(vor.magneticVariation).toBe(2);
    });

    it('round-trips a user airport with elevation and runway', () => {
        restoreFrom('AXX        KAAA    +4700.00-00830.00+01400+03200H');
        const apt = repo.get(ICAO.value('A', 'XX', '', 'KAAA')) as AirportFacility;
        expect(apt.lat).toBeCloseTo(47, 6);
        expect(apt.lon).toBeCloseTo(-8.5, 6);
        expect(apt.altitude).toBe(1400);
        expect(UnitType.METER.convertTo(apt.runways[0].length, UnitType.FOOT)).toBeCloseTo(3200, 3);
        expect(apt.runways[0].surface).toBe(RunwaySurfaceType.Asphalt);
        // Restoring re-persists through the repository sync, so the slot must hold the identical string again
        expect(storedSlot(0)).toBe('AXX        KAAA    +4700.00-00830.00+01400+03200H');
    });

    it('restores a user NDB', () => {
        restoreFrom('NXX        XY      +4800.00+00900.00+0345.0');
        const ndb = repo.get(ICAO.value('N', 'XX', '', 'XY')) as NdbFacility;
        expect(ICAO.getFacilityTypeFromValue(ndb.icaoStruct)).toBe(FacilityType.NDB);
        expect(ndb.freqMHz).toBeCloseTo(345, 6);
    });

    it.fails('restores a southern latitude (#98)', () => {
        restoreFrom('WXX        SOUTH   -1230.00+01015.00');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'SOUTH'))!;
        expect(wpt.lat).toBeCloseTo(-12.5, 6);
    });
});
```

- [ ] **Step 2: Write `test/unit/services/KLNNavmath.test.ts`**

```ts
import {describe, expect, it} from 'vitest';
import {intermediatePoint} from '../../../kln90b/services/KLNNavmath';

describe('intermediatePoint', () => {
    it('returns the start point for f = 0', () => {
        const p = intermediatePoint({lat: 50, lon: 8}, {lat: 51, lon: 10}, 0);
        expect(p.lat).toBeCloseTo(50, 6);
        expect(p.lon).toBeCloseTo(8, 6);
    });

    it.fails('returns the great-circle midpoint and end point (#97)', () => {
        // Expected values from https://edwilliams.org/avform147.htm#Intermediate, computed independently
        const mid = intermediatePoint({lat: 50, lon: 8}, {lat: 51, lon: 10}, 0.5);
        expect(mid.lat).toBeCloseTo(50.5043, 3);
        expect(mid.lon).toBeCloseTo(8.9894, 3);
        const end = intermediatePoint({lat: 50, lon: 8}, {lat: 51, lon: 10}, 1);
        expect(end.lat).toBeCloseTo(51, 3);
        expect(end.lon).toBeCloseTo(10, 3);
    });
});
```

- [ ] **Step 3: Run**

Run: `npx vitest run --project unit` → Expected: all non-`fails` tests pass, `2 expected fail`.
Run: `npx tsc --noEmit` → Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add test/unit
git commit -m "Added unit tests for the V2 user waypoint format and pinned #97 and #98" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/unit/settings/UserWaypointV2.test.ts", "test/unit/services/KLNNavmath.test.ts"], "verifyCommand": "npx vitest run --project unit && npx tsc --noEmit", "acceptanceCriteria": ["unit project: V2 format tests pass and exactly two expected failures (#97, #98)", "expected values are literals", "no production file changed"], "modelTier": "mechanical", "userGate": true, "tags": ["user-gate"]}
```

---

### Task 3: Extract the composition root (`KLN90BCore`, `KLN90BPlatform`)

**Goal:** Move the instrument's wiring out of `KLN90B.tsx` into `KLN90BCore`, with navdata, facility repository and EFB route manager supplied by a `KLN90BPlatform`, without changing behavior.

**Files:**
- Create: `kln90b/KLN90BPlatform.ts`, `kln90b/KLN90BCore.ts`
- Modify: `kln90b/KLN90B.tsx`, `kln90b/data/navdata/KLNFacilityLoader.ts:190`, `kln90b/PowerButton.ts:8`, `kln90b/pages/WelcomePage.tsx:20`

**Acceptance Criteria:**
- [ ] The `asyncInit` body in `KLN90BCore` equals the old one apart from the four named substitutions (checked by the script in Step 6).
- [ ] `handleKeyboardEvent` equals the old one apart from `this.onInteractionEvent(` → `this.dispatchInteractionEvent(`.
- [ ] `npx tsc --noEmit` clean; `npm run build` succeeds with pre-existing warnings only; `npm test` still green.
- [ ] No H event, LVar, panel.xml key, SimVar or setting key changed (`git diff` shows no edits in `HEvents.ts`, `LVars.ts`, `settings/`, `Sensors.ts`).

**Verify:** `npx tsc --noEmit && npm run build && npm test` → all succeed; Step 6 script prints `asyncInit moved verbatim` and `handleKeyboardEvent moved verbatim`

**Steps:**

- [ ] **Step 1: Narrow `KLNFacilityLoader`'s constructor type**

In `kln90b/data/navdata/KLNFacilityLoader.ts`, above the `KLNFacilityLoader` class, add:

```ts
/**
 * The part of the SDK FacilityLoader that KLNFacilityLoader uses. The sim passes the real FacilityLoader; tests pass
 * an in-memory source.
 */
export type ActualFacilityClient = Pick<FacilityLoader, 'getFacility' | 'searchByIdentWithIcaoStructs' | 'startNearestSearchSessionWithIcaoStructs' | 'awaitInitialization'>;
```

and change the constructor parameter `private readonly actualFacilityLoader: FacilityLoader` to `private readonly actualFacilityLoader: ActualFacilityClient`. Run `npx tsc --noEmit`; if any other member of `actualFacilityLoader` is used, add it to the `Pick` instead of changing call sites.

- [ ] **Step 2: Create `kln90b/KLN90BPlatform.ts`**

```ts
import {EventBus, FacilityLoader, FacilityRepository, FlightPlanRouteManager} from "@microsoft/msfs-sdk";
import {KLNFacilityRepository} from "./data/navdata/KLNFacilityRepository";
import {ActualFacilityClient} from "./data/navdata/KLNFacilityLoader";

/**
 * What KLN90BCore needs from its environment that is not reached through the sim's global APIs (SimVar, Coherent,
 * DataStore). The sim uses SIM_PLATFORM; tests supply fakes.
 */
export interface KLN90BPlatform {
    /**
     * The navdata source behind KLNFacilityLoader
     * @param bus
     */
    createFacilityClient(bus: EventBus): ActualFacilityClient;

    /**
     * The repository for user waypoints of any type
     * @param bus
     */
    getFacilityRepository(bus: EventBus): KLNFacilityRepository;

    /**
     * EFB route sync
     */
    getRouteManager(): Promise<FlightPlanRouteManager>;
}

export const SIM_PLATFORM: KLN90BPlatform = {
    createFacilityClient: (bus: EventBus) => new FacilityLoader(FacilityRepository.getRepository(bus)),
    getFacilityRepository: (bus: EventBus) => KLNFacilityRepository.getRepository(bus),
    getRouteManager: () => FlightPlanRouteManager.getManager(),
};
```

- [ ] **Step 3: Create `kln90b/KLN90BCore.ts` by moving code out of `KLN90B.tsx`**

Copy `kln90b/KLN90B.tsx` to `kln90b/KLN90BCore.ts`, then edit the copy:

1. Keep the license header. Remove `import '../KLN90B.scss';` and `// noinspection JSUnusedGlobalSymbols`. Remove the now-unused SDK imports `FacilityLoader`, `FacilityRepository`, `FlightPlanRouteManager`; add `import {KLN90BPlatform} from "./KLN90BPlatform";`. Keep every other import, including the `import KEY_… = KeyCode.…` lines.
2. Keep `export interface PropsReadyEvent` here.
3. Replace `class KLN90B extends BaseInstrument {` with `export class KLN90BCore {`, and give it this doc comment: "The instrument without the sim's BaseInstrument lifecycle: every service, the pages and the tick loops. KLN90B (the BaseInstrument) and the tests create one of these."
4. Change the fields `private readonly bus` and `private readonly pageManager` to `public readonly bus` and `public readonly pageManager` (tests read them). Leave all other fields as they are.
5. Replace the constructor signature `constructor() {` + `super();` with:

```ts
    /**
     * @param platform Navdata, the user waypoint repository and the EFB route manager
     * @param dispatchInteractionEvent Where keyboard input is re-dispatched to. KLN90B passes its own
     * onInteractionEvent, so these events pass through BaseInstrument.onInteractionEvent as before.
     */
    constructor(private readonly platform: KLN90BPlatform, private readonly dispatchInteractionEvent: (args: string[]) => void) {
```

   The rest of the constructor body stays verbatim.
6. Delete the `templateID` and `isInteractive` getters and `connectedCallback()` (they stay in the adapter).
7. Replace `Init() { super.Init(); this.asyncInit().catch(...) }` with:

```ts
    /**
     * Builds all services. The xml is not available before BaseInstrument.Init.
     * @param xmlConfig
     */
    public init(xmlConfig: Document): Promise<void> {
        return this.asyncInit(xmlConfig).catch(e => {
            this.bus.getPublisher<ErrorEvent>().pub("error", e);
        });
    }
```

8. `onSoundEnd(soundEventId: Name_Z)` stays verbatim.
9. In `onInteractionEvent(args: Array<string>)`, delete the first line `super.onInteractionEvent(args);` and make the method `public`. Everything else stays verbatim.
10. Change `private async asyncInit() {` to `private async asyncInit(xmlConfig: Document) {` and make exactly these substitutions inside its body (nothing else):
    - `this.xmlConfig` → `xmlConfig`
    - `KLNFacilityRepository.getRepository(this.bus)` → `this.platform.getFacilityRepository(this.bus)`
    - `new FacilityLoader(FacilityRepository.getRepository(this.bus))` → `this.platform.createFacilityClient(this.bus)` (keep it on its own line inside `new KLNFacilityLoader(…)`)
    - `FlightPlanRouteManager.getManager()` → `this.platform.getRouteManager()`
11. In `handleKeyboardEvent`, replace every `this.onInteractionEvent(` with `this.dispatchInteractionEvent(`.
12. `isForceReadyToUse()` stays verbatim. Delete the trailing `registerInstrument('kln-90b', KLN90B);`.

- [ ] **Step 4: Rewrite `kln90b/KLN90B.tsx` as the adapter**

Keep the license header verbatim, then:

```tsx
// noinspection JSUnusedGlobalSymbols

import '../KLN90B.scss';
import {KLN90BCore} from "./KLN90BCore";
import {SIM_PLATFORM} from "./KLN90BPlatform";

/**
 * Congratulations on finding the primary class. This is how it all begins: this class connects the instrument to the
 * sim's BaseInstrument lifecycle, and KLN90BCore builds everything else. The second most interesting class would be
 * MainPage. After that, PageTreeController will guide you to the individual screens.
 * Numbers like 1-12 reference a page in the manual that contains further information and reference:
 * https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08773-0000-KLN-90B-Pilots-Guide.pdf
 */
class KLN90B extends BaseInstrument {
    private readonly core = new KLN90BCore(SIM_PLATFORM, args => this.onInteractionEvent(args));

    get templateID(): string {
        return 'KLN90B';
    }


    get isInteractive(): boolean {
        return true;
    }


    Init() {
        super.Init();

        // noinspection JSIgnoredPromiseFromCall
        this.core.init(this.xmlConfig);
    }

    /**
     * A callback for when sounds are done playing.  This is needed to support the sound server.
     * @param soundEventId The sound that got played.
     */
    public onSoundEnd(soundEventId: Name_Z): void {
        this.core.onSoundEnd(soundEventId);
    }

    connectedCallback(): void {
        super.connectedCallback();
    }

    onInteractionEvent(args: Array<string>): void {
        super.onInteractionEvent(args);
        this.core.onInteractionEvent(args);
    }
}

registerInstrument('kln-90b', KLN90B);
```

- [ ] **Step 5: Update the two type imports of `PropsReadyEvent`**

`kln90b/PowerButton.ts:8`: `import {PropsReadyEvent} from "./KLN90B";` → `import {PropsReadyEvent} from "./KLN90BCore";`
`kln90b/pages/WelcomePage.tsx:20`: `import {PropsReadyEvent} from "../KLN90B";` → `import {PropsReadyEvent} from "../KLN90BCore";`

- [ ] **Step 6: Prove the move is verbatim**

Run (from the repo root, before committing):

```bash
node -e "
const {execSync} = require('child_process'); const fs = require('fs');
const body = (s, head) => { const i = s.indexOf('{', s.indexOf(head)); let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '{') d++; if (s[j] === '}' && --d === 0) break; } return s.slice(i, j + 1); };
const norm = s => s.replace(/\s+/g, ' ');
const oldSrc = execSync('git show HEAD:kln90b/KLN90B.tsx').toString(); const newSrc = fs.readFileSync('kln90b/KLN90BCore.ts', 'utf8');
const oldInit = norm(body(oldSrc, 'private async asyncInit()')).replace('this.xmlConfig', 'xmlConfig').replace('KLNFacilityRepository.getRepository(this.bus)', 'this.platform.getFacilityRepository(this.bus)').replace('new FacilityLoader(FacilityRepository.getRepository(this.bus))', 'this.platform.createFacilityClient(this.bus)').replace('FlightPlanRouteManager.getManager()', 'this.platform.getRouteManager()');
console.log(oldInit === norm(body(newSrc, 'private async asyncInit(xmlConfig: Document)')) ? 'asyncInit moved verbatim' : 'asyncInit DIFFERS');
const oldKbd = norm(body(oldSrc, 'private handleKeyboardEvent(')).split('this.onInteractionEvent(').join('this.dispatchInteractionEvent(');
console.log(oldKbd === norm(body(newSrc, 'private handleKeyboardEvent(')) ? 'handleKeyboardEvent moved verbatim' : 'handleKeyboardEvent DIFFERS');
"
```

Expected: `asyncInit moved verbatim` and `handleKeyboardEvent moved verbatim`. If either differs, fix the copy (do not edit the old code).

- [ ] **Step 7: Check**

Run: `npx tsc --noEmit` → clean. Run: `npm run build` → success, pre-existing warnings only (the circular-dependency count may change by the moved cycle through `KLN90B.tsx`; report the before/after count in the commit message). Run: `npm test` → green.
Run: `git diff --stat HEAD` → only the files listed in this task.

- [ ] **Step 8: Commit**

```bash
git add kln90b/KLN90BCore.ts kln90b/KLN90BPlatform.ts kln90b/KLN90B.tsx kln90b/data/navdata/KLNFacilityLoader.ts kln90b/PowerButton.ts kln90b/pages/WelcomePage.tsx
git commit -m "Moved the instrument wiring into KLN90BCore so tests can build it with fake navdata" -m "KLN90B is now a thin BaseInstrument adapter. KLN90BPlatform supplies the facility loader, the user waypoint repository and the EFB route manager. No behavior change." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["kln90b/KLN90BPlatform.ts", "kln90b/KLN90BCore.ts", "kln90b/KLN90B.tsx", "kln90b/data/navdata/KLNFacilityLoader.ts", "kln90b/PowerButton.ts", "kln90b/pages/WelcomePage.tsx"], "verifyCommand": "npx tsc --noEmit && npm run build && npm test", "acceptanceCriteria": ["asyncInit body equals the old one apart from the four named substitutions (Step 6 script prints 'asyncInit moved verbatim')", "handleKeyboardEvent equals the old one apart from the dispatch substitution (script prints 'handleKeyboardEvent moved verbatim')", "tsc clean, build succeeds with pre-existing warnings only, npm test green", "no edits in HEvents.ts, LVars.ts, settings/, Sensors.ts"], "modelTier": "standard"}
```

---

### Task 4: User check in the sim after the composition-root move

**Goal:** The maintainer confirms in MSFS 2024 that startup and input behave exactly as before Task 3.

> **USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Files:**
- None (manual check; build with `buildTargetDir` set to the Community package)

**Acceptance Criteria:**
- [ ] Cold-and-dark start: welcome page, then self-test with the test values, then the main page.
- [ ] Start with the engine running: main page directly (NAV 2 left).
- [ ] A direct-to to a waypoint works, and the CDI/HSI follows.
- [ ] A flight plan saved in FPL 1 is still there after a sim restart.
- [ ] Hot swap: setting `L:KLN90B_Disabled` to 1 stops the unit and 0 brings it back.
- [ ] Keyboard mode: clicking CRSR on the status line enters `KYBD`, and typed letters reach the field.

**Verify:** The user answers yes to each item (ask with AskUserQuestion; record the answers in the task).

**Steps:**

- [ ] **Step 1:** Ask the user to build (`npm run build` with `buildTargetDir` set) and run the checklist above in the sim. This task does not block Tasks 5–13; it must be closed before the branch is merged.
- [ ] **Step 2:** If any item fails, open a debugging round on Task 3 before merging; do not change behavior elsewhere to compensate.

```json:metadata
{"files": [], "verifyCommand": "", "acceptanceCriteria": ["cold-and-dark start shows welcome, self-test, main page", "engine-running start goes straight to the main page", "direct-to works and the CDI follows", "a saved FPL 1 survives a sim restart", "L:KLN90B_Disabled 1 stops and 0 restores the unit", "keyboard mode enters KYBD and typed letters reach the field"], "modelTier": "standard", "userGate": true, "tags": ["user-gate"]}
```

---

### Task 5: Sim fakes (SimVar native layer, Coherent, storage, XHR, clock, random)

**Goal:** Stateful fakes for every sim global the boot touches, unit-tested on their own.

**Files:**
- Create: `test/harness/sim/units.ts`, `test/harness/sim/FakeSim.ts`, `test/harness/sim/FakeCoherent.ts`, `test/harness/sim/FakeStorage.ts`, `test/harness/sim/FakeXhr.ts`, `test/harness/sim/clock.ts`, `test/harness/sim/random.ts`
- Modify: `test/harness/sim/install.ts`
- Test: `test/unit/harness/fakes.test.ts`

**Acceptance Criteria:**
- [ ] `SimVar.SetSimVarValue`/`GetSimVarValue` (the SDK's own implementations) round-trip through `FakeSim` with unit conversion.
- [ ] An impossible conversion is recorded in `sim.errors` (the SDK swallows exceptions in `GetSimVarValue`).
- [ ] `K:` writes land in `sim.keyEvents`, not in the values.
- [ ] `E:ABSOLUTE TIME` follows the fake clock.
- [ ] `GetStoredData` returns `""` for a missing key and `DataStore.get` then returns `undefined`.
- [ ] The XHR fake serves `resources/.../msa.json` with status 200.

**Verify:** `npx vitest run --project unit test/unit/harness/fakes.test.ts` → all pass

**Steps:**

- [ ] **Step 1: `test/harness/sim/units.ts`**

```ts
type Family = 'angle' | 'length' | 'speed' | 'time' | 'scalar';

/**
 * The units the instrument and the harness use, as [family, factor to the family's base unit]. A pair outside this
 * table cannot be converted, so a unit typo in the code under test is reported instead of reading a silent number.
 */
const UNITS: Record<string, [Family, number]> = {
    'degrees': ['angle', 1], 'degree': ['angle', 1],
    'radians': ['angle', 180 / Math.PI], 'radian': ['angle', 180 / Math.PI],
    'meters': ['length', 1], 'meter': ['length', 1], 'feet': ['length', 0.3048], 'foot': ['length', 0.3048],
    'nautical mile': ['length', 1852], 'nautical miles': ['length', 1852],
    'knots': ['speed', 1852 / 3600], 'knot': ['speed', 1852 / 3600], 'meters per second': ['speed', 1],
    'feet per minute': ['speed', 0.3048 / 60],
    'seconds': ['time', 1], 'hours': ['time', 3600],
    'number': ['scalar', 1], 'bool': ['scalar', 1], 'boolean': ['scalar', 1], 'enum': ['scalar', 1],
};

export function normalizeUnit(unit: string): string {
    return unit.trim().toLowerCase();
}

/**
 * Converts a value between units. Identical unit names always pass through, so units outside the table work as long
 * as reader and writer agree.
 * @throws Error if the units are unknown or of different families
 */
export function convertUnit(value: number, from: string, to: string): number {
    const f = normalizeUnit(from);
    const t = normalizeUnit(to);
    if (f === t) {
        return value;
    }
    const a = UNITS[f];
    const b = UNITS[t];
    if (a === undefined || b === undefined || a[0] !== b[0]) {
        throw new Error(`FakeSim: cannot convert from "${from}" to "${to}"`);
    }
    return value * a[1] / b[1];
}
```

- [ ] **Step 2: `test/harness/sim/FakeSim.ts`**

```ts
import {convertUnit, normalizeUnit} from './units';

export interface SimVarWrite {
    time: number;
    name: string;
    unit: string;
    value: number | string;
}

export interface KeyEventWrite {
    time: number;
    name: string;
    value: number;
}

interface Stored {
    unit: string;
    value: number | string;
}

interface Registration {
    name: string;
    key: string;
    unit: string;
}

/** Seconds from 0001-01-01 to 1970-01-01: E:ABSOLUTE TIME counts from year 1. */
const ABSOLUTE_TIME_OFFSET_S = 62135596800;

export function simVarKey(name: string): string {
    return name.trim().toUpperCase();
}

/**
 * The sim's native SimVar layer. The SDK replaces SimVar.GetSimVarValue/SetSimVarValue at import time with versions
 * built on SimVar.GetRegisteredId, simvar.getValueReg(_String) and Coherent.call('setValueReg_*'), so this is the layer
 * to fake. Writes by the instrument are logged; values set by the test or the aircraft model are not.
 */
export class FakeSim {
    public readonly writes: SimVarWrite[] = [];
    public readonly keyEvents: KeyEventWrite[] = [];
    /** Reads of variables nobody set (they return 0 or ""). Useful when wiring a new input. */
    public readonly unsetReads = new Set<string>();
    /** Conversion failures. The SDK catches exceptions in GetSimVarValue, so they are collected here for monitors. */
    public readonly errors: string[] = [];
    public readonly gameVars = new Map<string, string | number>();
    private readonly values = new Map<string, Stored>();
    private readonly registrations: Registration[] = [];
    private readonly registrationIds = new Map<string, number>();
    private simStartMs = 0;

    /** Sets a value as the sim or the aircraft model would. */
    public set(name: string, unit: string, value: number | boolean | string): void {
        this.values.set(simVarKey(name), {unit, value: typeof value === 'boolean' ? (value ? 1 : 0) : value});
    }

    /** Reads a value in the given unit, converting from the unit it was written in. */
    public get(name: string, unit: string): any {
        const key = simVarKey(name);
        const derived = this.derived(key, unit);
        if (derived !== undefined) {
            return derived;
        }
        const stored = this.values.get(key);
        if (stored === undefined) {
            this.unsetReads.add(key);
            return normalizeUnit(unit) === 'string' ? '' : 0;
        }
        if (typeof stored.value === 'string') {
            return stored.value;
        }
        try {
            return convertUnit(stored.value, stored.unit, unit);
        } catch (e) {
            this.errors.push(`${key}: ${(e as Error).message}`);
            throw e;
        }
    }

    public has(name: string): boolean {
        return this.values.has(simVarKey(name));
    }

    public lastWrite(name: string): SimVarWrite | undefined {
        const key = simVarKey(name);
        for (let i = this.writes.length - 1; i >= 0; i--) {
            if (this.writes[i].name === key) {
                return this.writes[i];
            }
        }
        return undefined;
    }

    /** Marks the start of the simulation for E:SIMULATION TIME. */
    public startClock(): void {
        this.simStartMs = Date.now();
    }

    /** Called by FakeCoherent for Coherent.call('setValueReg_Number' | '_Bool' | '_String', id, value). */
    public writeReg(id: number, value: number | boolean | string): void {
        const reg = this.registrations[id];
        const v = typeof value === 'boolean' ? (value ? 1 : 0) : value;
        const time = Date.now();
        if (reg.key.startsWith('K:')) {
            this.keyEvents.push({time, name: reg.key, value: Number(v)});
            return;
        }
        this.values.set(reg.key, {unit: reg.unit, value: v});
        this.writes.push({time, name: reg.key, unit: reg.unit, value: v});
    }

    /** Adds the native layer to the global SimVar object (created by staticGlobals) and defines simvar. */
    public install(g: any): void {
        Object.assign(g.SimVar, {
            GetRegisteredId: (name: string, unit: string) => this.register(name, unit),
            GetSimVarValueFastReg: (id: number) => this.readReg(id),
            GetSimVarValueFastRegString: (id: number) => String(this.readReg(id)),
            GetGameVarValue: (name: string) => this.gameVars.get(simVarKey(name)) ?? 0,
        });
        g.simvar = {
            getValueReg: (id: number) => this.readReg(id),
            getValueReg_String: (id: number) => String(this.readReg(id)),
        };
    }

    private register(name: string, unit: string): number {
        const cacheKey = `${simVarKey(name)}|${unit}`;
        let id = this.registrationIds.get(cacheKey);
        if (id === undefined) {
            id = this.registrations.length;
            this.registrations.push({name, key: simVarKey(name), unit});
            this.registrationIds.set(cacheKey, id);
        }
        return id;
    }

    private readReg(id: number): any {
        const reg = this.registrations[id];
        return this.get(reg.name, reg.unit);
    }

    private derived(key: string, unit: string): number | undefined {
        if (key === 'E:ABSOLUTE TIME') {
            return convertUnit(Date.now() / 1000 + ABSOLUTE_TIME_OFFSET_S, 'seconds', unit);
        }
        if (key === 'E:SIMULATION TIME') {
            return convertUnit((Date.now() - this.simStartMs) / 1000, 'seconds', unit);
        }
        return undefined;
    }
}
```

- [ ] **Step 3: `test/harness/sim/FakeCoherent.ts`**

```ts
import {FakeSim} from './FakeSim';

export interface CoherentCall {
    name: string;
    args: unknown[];
}

const SET_VALUE_REG = new Set(['setValueReg_Number', 'setValueReg_Bool', 'setValueReg_String']);

/**
 * Coherent and the view listeners. SimVar writes are routed to FakeSim; every other call is recorded and, unless a
 * reply is configured, never resolves, like a sim with nothing attached.
 */
export class FakeCoherent {
    public readonly calls: CoherentCall[] = [];
    public readonly replies = new Map<string, (...args: unknown[]) => unknown>();

    constructor(private readonly sim: FakeSim) {
    }

    public install(g: any): void {
        const call = (name: string, ...args: unknown[]): Promise<unknown> => {
            if (SET_VALUE_REG.has(name)) {
                this.sim.writeReg(args[0] as number, args[1] as number | boolean | string);
                return Promise.resolve();
            }
            this.calls.push({name, args});
            const reply = this.replies.get(name);
            return reply ? Promise.resolve(reply(...args)) : new Promise(() => undefined);
        };
        g.Coherent = {call, on: () => ({clear: () => undefined}), off: () => undefined, trigger: () => undefined};
        g.RegisterViewListener = () => ({
            on: () => undefined, off: () => undefined, call, trigger: () => undefined, unregister: () => undefined,
        });
    }
}
```

- [ ] **Step 4: `test/harness/sim/FakeStorage.ts` and `test/harness/sim/FakeXhr.ts`**

```ts
/**
 * GetStoredData/SetStoredData. The sim returns "" for a missing key: DataStore.get then fails to parse it and the
 * setting keeps its default. Returning null instead would set every setting to null.
 */
export class FakeStorage {
    public readonly data = new Map<string, string>();

    public install(g: any): void {
        g.GetStoredData = (key: string) => this.data.get(key) ?? '';
        g.SetStoredData = (key: string, value: string) => {
            this.data.set(key, value);
        };
        g.DeleteStoredData = (key: string) => {
            this.data.delete(key);
        };
    }
}
```

```ts
import fs from 'fs';
import path from 'path';

/** rollup copies resources/ into the package root, which is where coui:// URLs point. */
const RESOURCES = path.resolve(process.cwd(), 'resources');

/** XMLHttpRequest for coui:// URLs, served from resources/. Used by GPSSatComputer (ephemeris) and MSA. */
export class FakeXhr {
    public readonly requests: string[] = [];

    public install(g: any): void {
        const requests = this.requests;
        g.XMLHttpRequest = class FakeXMLHttpRequest {
            static readonly DONE = 4;
            public readyState = 0;
            public status = 0;
            public responseText = '';
            public response: unknown = '';
            public onreadystatechange: (() => void) | null = null;
            public onload: (() => void) | null = null;
            public onerror: (() => void) | null = null;
            private url = '';

            open(_method: string, url: string): void {
                this.url = url;
            }

            setRequestHeader(): void {
            }

            overrideMimeType(): void {
            }

            addEventListener(type: string, cb: () => void): void {
                if (type === 'load') this.onload = cb;
                if (type === 'error') this.onerror = cb;
                if (type === 'readystatechange') this.onreadystatechange = cb;
            }

            send(): void {
                requests.push(this.url);
                setTimeout(() => {
                    const file = path.join(RESOURCES, this.url.replace(/^coui:\/\//, ''));
                    try {
                        this.responseText = fs.readFileSync(file, 'utf8');
                        this.response = this.responseText;
                        this.status = 200;
                    } catch {
                        this.status = 404;
                    }
                    this.readyState = 4;
                    this.onreadystatechange?.();
                    if (this.status === 200) this.onload?.(); else this.onerror?.();
                }, 0);
            }
        };
    }
}
```

- [ ] **Step 5: `test/harness/sim/clock.ts`, `test/harness/sim/random.ts`, and the new `install.ts`**

```ts
import {vi} from 'vitest';
import {simEnv} from './install';

export const DEFAULT_START = new Date('2026-06-01T12:00:00Z');
/** Navdata cycle containing DEFAULT_START, in the format of the game var FLIGHT NAVDATA DATE RANGE */
export const DEFAULT_NAVDATA_RANGE = 'MAY15JUN12/26';

/** Switches to Vitest fake timers. Every interval of the instrument then runs on simulated time. */
export function startFakeClock(start: Date = DEFAULT_START): void {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame']});
    vi.setSystemTime(start);
    simEnv().sim.startClock();
}
```

```ts
import {vi} from 'vitest';

/**
 * Replaces Math.random with mulberry32, so the GPS clock jitter and the scan-list job ids repeat between runs.
 * @param seed
 */
export function seedRandom(seed: number): void {
    let a = seed >>> 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    });
}
```

Replace `test/harness/sim/install.ts` with:

```ts
import {installStaticGlobals} from './staticGlobals';
import {FakeSim} from './FakeSim';
import {FakeCoherent} from './FakeCoherent';
import {FakeStorage} from './FakeStorage';
import {FakeXhr} from './FakeXhr';

export interface SimEnvironment {
    sim: FakeSim;
    coherent: FakeCoherent;
    storage: FakeStorage;
    xhr: FakeXhr;
    /** Answers Facilities.getMagVar (degrees, east positive). Boots replace it with the world's magvar. */
    magvar: (lat: number, lon: number) => number;
}

let current: SimEnvironment | undefined;

/** Installs the sim fakes into the globals. Runs once per test file from the Vitest setup files. */
export function installSimFakes(): SimEnvironment {
    const g = globalThis as any;
    installStaticGlobals(g);
    const sim = new FakeSim();
    sim.install(g);
    const coherent = new FakeCoherent(sim);
    coherent.install(g);
    const storage = new FakeStorage();
    storage.install(g);
    const xhr = new FakeXhr();
    xhr.install(g);
    const env: SimEnvironment = {sim, coherent, storage, xhr, magvar: () => 0};
    g.Facilities = {getMagVar: (lat: number, lon: number) => env.magvar(lat, lon)};
    current = env;
    return env;
}

export function simEnv(): SimEnvironment {
    if (current === undefined) {
        throw new Error('installSimFakes() has not run; check setupFiles in vitest.config.mts');
    }
    return current;
}
```

- [ ] **Step 6: Write `test/unit/harness/fakes.test.ts`**

```ts
import {afterEach, describe, expect, it, vi} from 'vitest';
import {DataStore, SimVarValueType} from '@microsoft/msfs-sdk';
import {simEnv} from '../../harness/sim/install';

const {sim, storage} = simEnv();

afterEach(() => {
    vi.useRealTimers();
});

describe('FakeSim through the SDK SimVar functions', () => {
    it('converts a value the instrument writes in radians when read in degrees', () => {
        SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, Math.PI / 2);
        expect(sim.get('GPS WP DESIRED TRACK', 'degrees')).toBeCloseTo(90, 9);
        expect(sim.lastWrite('GPS WP DESIRED TRACK')).toMatchObject({unit: SimVarValueType.Radians});
    });

    it('lets the instrument read aircraft values in its own unit', () => {
        sim.set('PLANE ALTITUDE', 'feet', 1000);
        expect(SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Meters)).toBeCloseTo(304.8, 9);
    });

    it('reads strings and booleans', () => {
        sim.set('ATC MODEL', 'string', 'TEST');
        sim.set('GPS DRIVES NAV1', 'bool', true);
        expect(SimVar.GetSimVarValue('ATC MODEL', SimVarValueType.String)).toBe('TEST');
        // The sim answers booleans as 0/1; Number() keeps the test independent of whether the SDK coerces them
        expect(Number(SimVar.GetSimVarValue('GPS DRIVES NAV1', SimVarValueType.Bool))).toBe(1);
    });

    it('records an impossible conversion', () => {
        sim.set('SOME DISTANCE', 'feet', 1);
        SimVar.GetSimVarValue('SOME DISTANCE', SimVarValueType.Degree);
        expect(sim.errors).toEqual(['SOME DISTANCE: FakeSim: cannot convert from "feet" to "degrees"']);
    });

    it('logs key events separately from values', () => {
        SimVar.SetSimVarValue('K:GPS_OBS_ON', SimVarValueType.Number, 0);
        expect(sim.keyEvents.map(k => k.name)).toEqual(['K:GPS_OBS_ON']);
        expect(sim.has('K:GPS_OBS_ON')).toBe(false);
    });

    it('derives E:ABSOLUTE TIME from the clock', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        // 2026-06-01T12:00:00Z is 1780315200 s after 1970; E:ABSOLUTE TIME adds the 62135596800 s from year 1
        expect(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds)).toBe(1780315200 + 62135596800);
    });
});

describe('FakeStorage', () => {
    it('returns "" for a missing key so settings keep their defaults', () => {
        expect(GetStoredData('missing')).toBe('');
        expect(DataStore.get('missing')).toBeUndefined();
    });

    it('stores what DataStore writes', () => {
        DataStore.set('k', 42);
        expect(storage.data.get('k')).toBe('42');
        expect(DataStore.get('k')).toBe(42);
    });
});

describe('FakeXhr', () => {
    it('serves coui:// files from resources/', async () => {
        const req = new XMLHttpRequest();
        const done = new Promise<void>(resolve => req.onreadystatechange = () => resolve());
        req.open('GET', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/msa.json');
        req.send();
        await done;
        expect(req.status).toBe(200);
        expect(Array.isArray(JSON.parse(req.responseText))).toBe(true);
    });
});
```

Check the epoch literal before relying on it: `node -e "console.log(Date.UTC(2026,5,1,12)/1000)"` must print `1780315200`; if not, use the printed value.

- [ ] **Step 7: Run and commit**

Run: `npx vitest run --project unit` → all pass (plus the two expected failures). Run: `npx tsc --noEmit` → clean.

```bash
git add test/
git commit -m "Added fakes for the sim's SimVar, Coherent, storage and asset APIs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/harness/sim/units.ts", "test/harness/sim/FakeSim.ts", "test/harness/sim/FakeCoherent.ts", "test/harness/sim/FakeStorage.ts", "test/harness/sim/FakeXhr.ts", "test/harness/sim/clock.ts", "test/harness/sim/random.ts", "test/harness/sim/install.ts", "test/unit/harness/fakes.test.ts"], "verifyCommand": "npx vitest run --project unit && npx tsc --noEmit", "acceptanceCriteria": ["SDK SimVar functions round-trip through FakeSim with unit conversion", "impossible conversion recorded in sim.errors", "K: writes land in sim.keyEvents", "E:ABSOLUTE TIME follows the fake clock", "GetStoredData returns '' for missing keys and DataStore.get returns undefined", "XHR fake serves msa.json with status 200"], "modelTier": "standard"}
```

---

### Task 6: Fake navdata (builders, `MemoryFacilityClient`)

**Goal:** Synthetic facilities and an in-memory facility client that `KLNFacilityLoader` can use instead of the SDK `FacilityLoader`.

**Files:**
- Create: `test/harness/navdata/builders.ts`, `test/harness/navdata/MemoryFacilityClient.ts`
- Test: `test/unit/harness/navdata.test.ts`

**Acceptance Criteria:**
- [ ] `getFacility` resolves a known facility and rejects an unknown one (as the SDK does).
- [ ] `searchByIdentWithIcaoStructs` returns prefix matches of the requested type, sorted by ident.
- [ ] A nearest session reports facilities entering and leaving the radius as `added`/`removed` across calls.
- [ ] `KLNFacilityLoader` built on the client finds a builder VOR through `getFacility` and its nearest VOR session.

**Verify:** `npx vitest run --project unit test/unit/harness/navdata.test.ts` → all pass

**Steps:**

- [ ] **Step 1: `test/harness/navdata/builders.ts`**

The objects follow the shapes `UserWaypointLoaderV2` builds (`kln90b/settings/UserWaypointLoaderV2.ts`). Database facilities use a real-looking region (`K1`) and never `XX`/`XY`, which the instrument reserves for user and temporary waypoints.

```ts
import {
    AirportFacility, AirportFacilityDataFlags, AirportPrivateType, AirportRunway, FacilityFrequencyType, GpsBoolean, ICAO,
    IntersectionFacility, IntersectionType, LandingSystemCategory, NdbFacility, NdbType, RunwayLightingType,
    RunwaySurfaceType, UnitType, VorClass, VorFacility, VorType,
} from '@microsoft/msfs-sdk';

const DEFAULT_REGION = 'K1';

function emptyIls() {
    return {
        icao: '', icaoStruct: ICAO.emptyValue(), name: '', freqMHz: 0, freqBCD16: 0, type: FacilityFrequencyType.None,
        hasGlideslope: false, glideslopeAngle: 0, localizerCourse: 0, magvar: 0, hasBackcourse: false, glideslopeAlt: 0,
        glideslopeLat: 0, glideslopeLon: 0, lsCategory: LandingSystemCategory.None, localizerWidth: 0,
    };
}

function runwayDesignation(heading: number): string {
    const a = Math.round(heading / 10) % 36 || 36;
    const b = (a + 18 - 1) % 36 + 1;
    return `${String(Math.min(a, b)).padStart(2, '0')}-${String(Math.max(a, b)).padStart(2, '0')}`;
}

export interface AirportOptions {
    elevationFt?: number;
    runwayHeading?: number;
    runwayLengthFt?: number;
    surface?: RunwaySurfaceType;
    name?: string;
    city?: string;
}

export function airport(ident: string, lat: number, lon: number, opts: AirportOptions = {}): AirportFacility {
    const icaoStruct = ICAO.value('A', '', '', ident);
    const heading = opts.runwayHeading ?? 90;
    const runway: AirportRunway = {
        latitude: lat, longitude: lon, elevation: UnitType.FOOT.convertTo(opts.elevationFt ?? 0, UnitType.METER),
        direction: heading, designation: runwayDesignation(heading),
        length: UnitType.FOOT.convertTo(opts.runwayLengthFt ?? 5000, UnitType.METER), width: 30,
        surface: opts.surface ?? RunwaySurfaceType.Asphalt, lighting: RunwayLightingType.Unknown,
        designatorCharPrimary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
        designatorCharSecondary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
        primaryBlastpadLength: 0, primaryOverrunLength: 0, secondaryOverrunLength: 0, secondaryBlastpadLength: 0,
        primaryILSFrequency: emptyIls(), secondaryILSFrequency: emptyIls(),
        primaryElevation: 0, primaryThresholdLength: 0, secondaryElevation: 0, secondaryThresholdLength: 0,
    } as AirportRunway;
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: opts.name ?? `${ident} AIRPORT`, lat, lon,
        region: DEFAULT_REGION, city: opts.city ?? '', magvar: 0, airportPrivateType: AirportPrivateType.Public,
        fuel1: '', fuel2: '', bestApproach: '', radarCoverage: GpsBoolean.Unknown, airspaceType: 0, airportClass: 1,
        towered: false, frequencies: [], runways: [runway], departures: [], approaches: [], arrivals: [],
        altitude: UnitType.FOOT.convertTo(opts.elevationFt ?? 0, UnitType.METER),
        loadedDataFlags: AirportFacilityDataFlags.All, holdingPatterns: [], transitionAlt: 0, transitionLevel: 0, iata: '',
    } as unknown as AirportFacility;
}

export interface VorOptions {
    frequencyMHz?: number;
    /** As stored in the sim's VOR records; the instrument negates it (see Nav2Page) */
    magneticVariation?: number;
    region?: string;
    name?: string;
    type?: VorType;
}

export function vor(ident: string, lat: number, lon: number, opts: VorOptions = {}): VorFacility {
    const region = opts.region ?? DEFAULT_REGION;
    const icaoStruct = ICAO.value('V', region, '', ident);
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: opts.name ?? ident, lat, lon, region, city: '',
        magvar: 0, freqMHz: opts.frequencyMHz ?? 114.3, freqBCD16: 0, magneticVariation: opts.magneticVariation ?? 0,
        type: opts.type ?? VorType.VORDME, vorClass: VorClass.HighAltitude, navRange: 0, dme: null, ils: null,
        tacan: null, trueReferenced: false, alt: 0,
    } as unknown as VorFacility;
}

export function ndb(ident: string, lat: number, lon: number, opts: { frequencyKHz?: number; region?: string; name?: string } = {}): NdbFacility {
    const region = opts.region ?? DEFAULT_REGION;
    const icaoStruct = ICAO.value('N', region, '', ident);
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: opts.name ?? ident, lat, lon, region, city: '',
        magvar: 0, freqMHz: opts.frequencyKHz ?? 350, type: NdbType.H, range: 0, bfoRequired: false, alt: 0,
    } as unknown as NdbFacility;
}

export function intersection(ident: string, lat: number, lon: number, opts: { region?: string } = {}): IntersectionFacility {
    const region = opts.region ?? DEFAULT_REGION;
    const icaoStruct = ICAO.value('W', region, '', ident);
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: '', lat, lon, region, city: '', routes: [],
        nearestVorICAO: '', nearestVorICAOStruct: ICAO.emptyValue(), nearestVorType: VorType.Unknown,
        nearestVorFrequencyBCD16: 0, nearestVorFrequencyMHz: 0, nearestVorTrueRadial: 0, nearestVorMagneticRadial: 0,
        nearestVorDistance: 0, type: IntersectionType.Named,
    } as unknown as IntersectionFacility;
}
```

If `tsc` rejects an enum member (`VorClass.HighAltitude`, `AirportPrivateType.Public`), look up the enum in `node_modules/@microsoft/msfs-sdk/msfssdk.d.ts` and use an existing member; do not change the object shape.

- [ ] **Step 2: `test/harness/navdata/MemoryFacilityClient.ts`**

```ts
import {Facility, FacilitySearchType, FacilityType, GeoKdTree, GeoPoint, ICAO, IcaoValue, NearestSearchResults, UnitType} from '@microsoft/msfs-sdk';

const SEARCH_TYPES: Partial<Record<FacilitySearchType, FacilityType[]>> = {
    [FacilitySearchType.Airport]: [FacilityType.Airport],
    [FacilitySearchType.Vor]: [FacilityType.VOR],
    [FacilitySearchType.Ndb]: [FacilityType.NDB],
    [FacilitySearchType.Intersection]: [FacilityType.Intersection],
    [FacilitySearchType.User]: [FacilityType.USR],
};

const treeKey = (fac: Facility, out: Float64Array) => GeoPoint.sphericalToCartesian(fac, out);

/**
 * Nearest search with the same added/removed bookkeeping as KLNNearestRepoFacilitySearchSession. Filters are accepted
 * and ignored: every facility of the type is a candidate.
 */
class MemoryNearestSession {
    private readonly cachedResults = new Set<IcaoValue>();
    private searchId = 0;

    constructor(private readonly tree: GeoKdTree<Facility>, public readonly sessionId: number) {
    }

    public searchNearest(lat: number, lon: number, radiusMeters: number, maxItems: number): Promise<NearestSearchResults<IcaoValue, IcaoValue>> {
        const results = this.tree.search(lat, lon, UnitType.METER.convertTo(radiusMeters, UnitType.GA_RADIAN), maxItems, []);
        const added: IcaoValue[] = [];
        for (const fac of results) {
            if (!this.cachedResults.delete(fac.icaoStruct)) {
                added.push(fac.icaoStruct);
            }
        }
        const removed = Array.from(this.cachedResults);
        this.cachedResults.clear();
        results.forEach(f => this.cachedResults.add(f.icaoStruct));
        return Promise.resolve({sessionId: this.sessionId, searchId: this.searchId++, added, removed});
    }

    public setAirportFilter(): void {
    }

    public setExtendedAirportFilters(): void {
    }

    public setVorFilter(): void {
    }

    public setFilter(): void {
    }
}

/** Airspace searches find nothing: the fake world has no boundaries yet. */
class EmptyBoundarySession {
    private searchId = 0;

    constructor(public readonly sessionId: number) {
    }

    public searchNearest(): Promise<NearestSearchResults<never, number>> {
        return Promise.resolve({sessionId: this.sessionId, searchId: this.searchId++, added: [], removed: []});
    }

    public setBoundaryFilter(): void {
    }

    public setFilter(): void {
    }
}

/**
 * In-memory replacement for the SDK FacilityLoader methods that KLNFacilityLoader uses (see ActualFacilityClient).
 */
export class MemoryFacilityClient {
    private readonly byUid = new Map<string, Facility>();
    private readonly trees = new Map<FacilityType, GeoKdTree<Facility>>();
    private nextSessionId = 1;

    constructor(facilities: Facility[] = []) {
        facilities.forEach(f => this.add(f));
    }

    public add(fac: Facility): void {
        const type = ICAO.getFacilityTypeFromValue(fac.icaoStruct);
        this.byUid.set(ICAO.getUid(fac.icaoStruct), fac);
        let tree = this.trees.get(type);
        if (tree === undefined) {
            tree = new GeoKdTree(treeKey);
            this.trees.set(type, tree);
        }
        tree.insert(fac);
    }

    /**
     * Adds facilities from plain JSON (an array of facility objects). icaoStruct may be given as a V2 ICAO string.
     * @param json
     */
    public addJson(json: string | object[]): void {
        const list = (typeof json === 'string' ? JSON.parse(json) : json) as any[];
        for (const raw of list) {
            const icaoStruct = typeof raw.icaoStruct === 'string' ? ICAO.stringV2ToValue(raw.icaoStruct) : raw.icaoStruct;
            this.add({...raw, icaoStruct} as Facility);
        }
    }

    public all(): Facility[] {
        return Array.from(this.byUid.values());
    }

    public awaitInitialization(): Promise<void> {
        return Promise.resolve();
    }

    public getFacility(_type: FacilityType, icao: IcaoValue | string): Promise<Facility> {
        const value = typeof icao === 'string' ? (icao.length === 19 ? ICAO.stringV2ToValue(icao) : ICAO.stringV1ToValue(icao)) : icao;
        const fac = this.byUid.get(ICAO.getUid(value));
        return fac ? Promise.resolve(fac) : Promise.reject(new Error(`MemoryFacilityClient: no facility ${ICAO.tryValueToStringV2(value)}`));
    }

    public searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, maxItems = 40): Promise<IcaoValue[]> {
        const types = SEARCH_TYPES[filter];
        return Promise.resolve(this.all()
            .filter(f => f.icaoStruct.ident.startsWith(ident))
            .filter(f => types === undefined || types.includes(ICAO.getFacilityTypeFromValue(f.icaoStruct)))
            .map(f => f.icaoStruct)
            .sort((a, b) => a.ident.localeCompare(b.ident))
            .slice(0, maxItems));
    }

    public startNearestSearchSessionWithIcaoStructs(type: FacilitySearchType): Promise<any> {
        const id = this.nextSessionId++;
        if (type === FacilitySearchType.Boundary) {
            return Promise.resolve(new EmptyBoundarySession(id));
        }
        const facType = SEARCH_TYPES[type]?.[0];
        if (facType === undefined) {
            return Promise.reject(new Error(`MemoryFacilityClient: unsupported nearest search ${type}`));
        }
        let tree = this.trees.get(facType);
        if (tree === undefined) {
            tree = new GeoKdTree(treeKey);
            this.trees.set(facType, tree);
        }
        return Promise.resolve(new MemoryNearestSession(tree, id));
    }
}
```

- [ ] **Step 3: Write `test/unit/harness/navdata.test.ts`**

```ts
import {describe, expect, it} from 'vitest';
import {EventBus, FacilitySearchType, FacilityType, ICAO, UnitType} from '@microsoft/msfs-sdk';
import {airport, vor} from '../../harness/navdata/builders';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {KLNFacilityLoader, ActualFacilityClient} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';

const abc = vor('ABC', 47.5, 8.9);
const abd = vor('ABD', 48.5, 8.9);
const kaaa = airport('KAAA', 47.0, 8.0);
const client = new MemoryFacilityClient([abc, abd, kaaa]);
const nm = (n: number) => UnitType.NMILE.convertTo(n, UnitType.METER);

describe('MemoryFacilityClient', () => {
    it('resolves known facilities and rejects unknown ones', async () => {
        await expect(client.getFacility(FacilityType.VOR, abc.icaoStruct)).resolves.toBe(abc);
        await expect(client.getFacility(FacilityType.VOR, ICAO.value('V', 'K1', '', 'NOPE'))).rejects.toThrow(/no facility/);
    });

    it('searches by ident prefix and type', async () => {
        const vors = await client.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'AB');
        expect(vors.map(i => i.ident)).toEqual(['ABC', 'ABD']);
        const airports = await client.searchByIdentWithIcaoStructs(FacilitySearchType.Airport, 'AB');
        expect(airports).toEqual([]);
    });

    it('reports added and removed facilities between nearest searches', async () => {
        const session = await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        // ABC is 0.2° (12 NM) north of 47.3N; ABD is 72 NM north
        const first = await session.searchNearest(47.3, 8.9, nm(20), 10);
        expect(first.added.map((i: any) => i.ident)).toEqual(['ABC']);
        const second = await session.searchNearest(48.3, 8.9, nm(20), 10);
        expect(second.added.map((i: any) => i.ident)).toEqual(['ABD']);
        expect(second.removed.map((i: any) => i.ident)).toEqual(['ABC']);
    });

    it('serves KLNFacilityLoader', async () => {
        const loader = new KLNFacilityLoader(client as unknown as ActualFacilityClient, KLNFacilityRepository.getRepository(new EventBus()));
        await expect(loader.getFacility(FacilityType.VOR, abc.icaoStruct)).resolves.toBe(abc);
        const session = await loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        const result = await session.searchNearest(47.3, 8.9, nm(20), 10);
        expect(result.added.map(i => i.ident)).toEqual(['ABC']);
    });
});
```

- [ ] **Step 4: Run and commit**

Run: `npx vitest run --project unit` → pass. Run: `npx tsc --noEmit` → clean.

```bash
git add test/
git commit -m "Added synthetic navdata and an in-memory facility client for tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/harness/navdata/builders.ts", "test/harness/navdata/MemoryFacilityClient.ts", "test/unit/harness/navdata.test.ts"], "verifyCommand": "npx vitest run --project unit && npx tsc --noEmit", "acceptanceCriteria": ["getFacility resolves known and rejects unknown facilities", "ident search returns sorted prefix matches of the requested type", "nearest session reports added/removed across calls", "KLNFacilityLoader built on the client finds a builder VOR via getFacility and nearest search"], "modelTier": "standard"}
```

---

### Task 7: Headless boot (`FakePlatform`, `bootUnit`) and boot smoke test

**Goal:** `bootUnit()` builds the real instrument through `KLN90BCore` with the fakes and returns once `propsReady` fired.

**Files:**
- Create: `test/harness/platform.ts`, `test/harness/storage.ts`, `test/harness/boot.ts`
- Test: `test/flight/harness/boot.test.ts`

**Acceptance Criteria:**
- [ ] With the engine running, the unit reaches the main page (status line starts with `NAV 2`) and the GPS has a valid solution.
- [ ] No `error` event was published and `sim.errors` is empty.
- [ ] The unit wrote `GPS POSITION LAT`/`LON` matching the fake aircraft position.
- [ ] Calling `bootUnit()` twice in one file throws an explanatory error.

**Verify:** `npx vitest run --project flight test/flight/harness/boot.test.ts` → pass

**Steps:**

- [ ] **Step 1: `test/harness/platform.ts`**

```ts
import {EventBus, FlightPlanRouteManager} from '@microsoft/msfs-sdk';
import {KLN90BPlatform} from '../../kln90b/KLN90BPlatform';
import {ActualFacilityClient} from '../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from './navdata/MemoryFacilityClient';

export class FakePlatform implements KLN90BPlatform {
    constructor(public readonly navdata: MemoryFacilityClient) {
    }

    public createFacilityClient(_bus: EventBus): ActualFacilityClient {
        // MemoryFacilityClient implements these methods at runtime; the SDK's generic overload types are not worth
        // reproducing in a test double.
        return this.navdata as unknown as ActualFacilityClient;
    }

    public getFacilityRepository(bus: EventBus): KLNFacilityRepository {
        return KLNFacilityRepository.getRepository(bus);
    }

    public getRouteManager(): Promise<FlightPlanRouteManager> {
        // No EFB attached
        return new Promise(() => undefined);
    }
}
```

- [ ] **Step 2: `test/harness/storage.ts`**

```ts
import {Facility, ICAO} from '@microsoft/msfs-sdk';

/**
 * User data as saved by an earlier session, for BootOptions.storage: a flight plan in the V2 format
 * (docs/architecture.md, Core 7). Only USER legs are persisted, so pass database or user facilities, not procedures.
 */
export function savedFlightplan(idx: number, legs: Facility[]): Record<string, unknown> {
    return {userDataFormat: 2, [`fpl${idx}`]: legs.map(f => ICAO.valueToStringV2(f.icaoStruct)).join('')};
}
```

- [ ] **Step 3: `test/harness/boot.ts`**

```ts
import {vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {KLN90BCore, PropsReadyEvent} from '../../kln90b/KLN90BCore';
import {PageProps} from '../../kln90b/pages/Page';
import {ErrorEvent} from '../../kln90b/controls/ErrorPage';
import {simEnv, SimEnvironment} from './sim/install';
import {DEFAULT_NAVDATA_RANGE, startFakeClock} from './sim/clock';
import {seedRandom} from './sim/random';
import {MemoryFacilityClient} from './navdata/MemoryFacilityClient';
import {FakePlatform} from './platform';

export const MINIMAL_PANEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name></Instrument></PlaneHTMLConfig>';

export interface BootOptions {
    facilities?: Facility[];
    position?: { lat: number; lon: number };
    altitudeFt?: number;
    /** A PlaneHTMLConfig document; the parser defaults apply to everything it leaves out */
    panelXml?: string;
    /** User settings saved by an earlier session, by setting name (see storage.ts) */
    storage?: Record<string, unknown>;
    /** ENG COMBUSTION:1. True skips the welcome and self-test pages (KLN90BCore.isForceReadyToUse). Default true */
    engineRunning?: boolean;
    start?: Date;
    seed?: number;
    atcModel?: string;
    /** Magnetic variation in degrees east; a number for the whole world. Default 0 */
    magvar?: number | ((lat: number, lon: number) => number);
}

export interface HeadlessUnit {
    core: KLN90BCore;
    props: PageProps;
    env: SimEnvironment;
    navdata: MemoryFacilityClient;
    /** Errors published on the bus; the sim would show them on the error page */
    errors: Error[];
    send(evt: string): void;
}

let booted = false;

/**
 * Boots the real instrument headless and returns once propsReady fired. One unit per test file: the facility
 * repository and the settings managers are singletons.
 */
export async function bootUnit(opts: BootOptions = {}): Promise<HeadlessUnit> {
    if (booted) {
        throw new Error('bootUnit: one unit per test file (KLNFacilityRepository and the settings managers are singletons)');
    }
    booted = true;

    const env = simEnv();
    startFakeClock(opts.start);
    seedRandom(opts.seed ?? 1);

    const model = opts.atcModel ?? 'KLN TEST';
    const pos = opts.position ?? {lat: 47, lon: 8};
    const altitude = opts.altitudeFt ?? 0;
    const magvar = opts.magvar ?? 0;
    env.magvar = typeof magvar === 'function' ? magvar : () => magvar;
    env.sim.gameVars.set('FLIGHT NAVDATA DATE RANGE', DEFAULT_NAVDATA_RANGE);
    env.sim.set('ATC MODEL', 'string', model);
    env.sim.set('ENG COMBUSTION:1', 'bool', opts.engineRunning ?? true);
    env.sim.set('PLANE LATITUDE', 'degrees', pos.lat);
    env.sim.set('PLANE LONGITUDE', 'degrees', pos.lon);
    env.sim.set('PLANE ALTITUDE', 'feet', altitude);
    env.sim.set('PRESSURE ALTITUDE', 'feet', altitude);
    env.sim.set('GROUND VELOCITY', 'knots', 0);
    env.sim.set('GPS DRIVES NAV1', 'bool', true);
    // UserSettingSaveManager key format: persistent-setting.<save key>.<setting name>, with "<ATC MODEL>.profile_1"
    for (const [name, value] of Object.entries(opts.storage ?? {})) {
        env.storage.data.set(`persistent-setting.${model}.profile_1.${name}`, JSON.stringify(value));
    }

    document.body.innerHTML = '<div id="InstrumentsContainer"></div>';
    const navdata = new MemoryFacilityClient(opts.facilities ?? []);
    const core: KLN90BCore = new KLN90BCore(new FakePlatform(navdata), args => core.onInteractionEvent(args));
    const errors: Error[] = [];
    core.bus.getSubscriber<ErrorEvent>().on('error').handle(e => errors.push(e));
    let props: PageProps | undefined;
    core.bus.getSubscriber<PropsReadyEvent>().on('propsReady').handle(p => props = p);

    void core.init(new DOMParser().parseFromString(opts.panelXml ?? MINIMAL_PANEL_XML, 'text/xml'));
    for (let i = 0; i < 120 && props === undefined; i++) {
        await vi.advanceTimersByTimeAsync(250);
    }
    if (props === undefined) {
        throw new Error(`bootUnit: propsReady did not fire within 30 s. Errors: ${errors.map(String).join('; ')}`);
    }
    return {core, props, env, navdata, errors, send: evt => core.onInteractionEvent([evt])};
}
```

- [ ] **Step 4: Write `test/flight/harness/boot.test.ts`**

```ts
import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {vor} from '../../harness/navdata/builders';

describe('headless boot', () => {
    it('boots to the main page with a GPS solution', async () => {
        const unit = await bootUnit({facilities: [vor('ABC', 47.2, 8.0)], position: {lat: 47, lon: 8}});
        await vi.advanceTimersByTimeAsync(30_000);

        const statusLine = document.querySelector('.statusline')!.textContent!.replace(/ /g, ' ');
        expect(statusLine.startsWith('NAV 2')).toBe(true);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(unit.errors).toEqual([]);
        expect(unit.env.sim.errors).toEqual([]);
        expect(unit.env.sim.get('GPS POSITION LAT', 'degrees')).toBeCloseTo(47, 6);
        expect(unit.env.sim.get('GPS POSITION LON', 'degrees')).toBeCloseTo(8, 6);
    });

    it('allows only one unit per test file', async () => {
        await expect(bootUnit()).rejects.toThrow(/one unit per test file/);
    });
});
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run --project flight` → pass. Run: `npx tsc --noEmit` → clean.
If the boot hangs, compare with the reads in `unit.env.sim.unsetReads` and the calls in `unit.env.coherent.calls`; a new sim API the boot needs gets a fake in `test/harness/sim/`, never a change in `kln90b/`.

```bash
git add test/
git commit -m "Added a headless boot of the instrument for render and flight tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/harness/platform.ts", "test/harness/storage.ts", "test/harness/boot.ts", "test/flight/harness/boot.test.ts"], "verifyCommand": "npx vitest run --project flight && npx tsc --noEmit", "acceptanceCriteria": ["engine-running boot reaches the main page (status line starts with NAV 2) with a valid GPS solution", "no error events and sim.errors empty", "GPS POSITION LAT/LON match the fake aircraft position", "a second bootUnit() in one file throws"], "modelTier": "standard"}
```

---

### Task 8: Screen reader and canvas backing

**Goal:** `Screen.read()` turns the DOM into the 23×7 text grid and mask; every happy-dom canvas draws real pixels through Skia.

**Files:**
- Create: `test/harness/render/screen.ts`, `test/harness/render/canvas.ts`
- Modify: `test/harness/setup/dom.ts`
- Test: `test/render/harness/screen.test.ts`, `test/render/harness/canvas.test.ts`

**Acceptance Criteria:**
- [ ] The reader composes left page | right page | status line into 7 rows of exactly 23 cells, skips `d-none`, maps `&nbsp;` to space and `<br>` to a new row.
- [ ] The mask marks `inverted` as `I`, `blink` as `B`, `inverted-blink` as `F`.
- [ ] A row wider than its area throws with the row's text.
- [ ] A canvas `fillRect` shows up exactly in `canvasToAscii`, and `fillText` with `KLN90BMap` lights pixels only inside the text box.

**Verify:** `npx vitest run --project render` → pass

**Steps:**

- [ ] **Step 1: `test/harness/render/screen.ts`**

```ts
export type CellAttr = '.' | 'I' | 'B' | 'F';

export interface Cell {
    ch: string;
    attr: CellAttr;
}

const HALF_WIDTH = 11;
const FULL_WIDTH = 23;
const ROWS = 6;
/** The border between the half pages; the real screen draws a line there */
const SEPARATOR = '|';

function attrOf(el: Element, inherited: CellAttr): CellAttr {
    if (el.classList.contains('inverted-blink')) return 'F';
    if (el.classList.contains('blink')) return 'B';
    if (el.classList.contains('inverted')) return 'I';
    return inherited;
}

/** Text rows of an element as the font renders them: <br> starts a row, d-none subtrees are skipped. */
export function readRows(root: Element): Cell[][] {
    const rows: Cell[][] = [[]];
    const walk = (node: Node, attr: CellAttr) => {
        if (node.nodeType === 3) {
            for (const ch of node.textContent ?? '') {
                rows[rows.length - 1].push({ch: ch === ' ' ? ' ' : ch, attr});
            }
            return;
        }
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.classList.contains('d-none')) return;
        if (el.tagName === 'BR') {
            rows.push([]);
            return;
        }
        const a = attrOf(el, attr);
        el.childNodes.forEach(c => walk(c, a));
    };
    walk(root, '.');
    if (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
    return rows;
}

function fit(row: Cell[] | undefined, width: number, where: string): Cell[] {
    const r = row ?? [];
    if (r.length > width) {
        throw new Error(`Screen: ${where} is ${r.length} cells wide, more than ${width}: "${r.map(c => c.ch).join('')}"`);
    }
    return [...r, ...Array.from({length: width - r.length}, (): Cell => ({ch: ' ', attr: '.'}))];
}

/**
 * The 23×7 character screen as the pilot sees it, plus a mask of the inverse and flashing cells. Special glyphs stay as
 * the code points the KLN90B font maps them to (docs/architecture.md, UI 3).
 */
export class Screen {
    private constructor(private readonly grid: Cell[][]) {
    }

    public static read(container: Element | null = document.getElementById('pageContainer')): Screen {
        if (container === null) throw new Error('Screen: no #pageContainer; has the unit booted?');
        const visible = (sel: string) => {
            const el = container.querySelector(sel);
            return el !== null && el.closest('.d-none') === null ? el : null;
        };
        const statusEl = visible('.statusline');
        const status = fit(statusEl ? readRows(statusEl)[0] : [], FULL_WIDTH, 'status line');
        const left = visible('.left-page');
        const right = visible('.right-page');
        const full = visible('.full-page');
        const grid: Cell[][] = [];
        if (left && right) {
            const l = readRows(left);
            const r = readRows(right);
            for (let i = 0; i < ROWS; i++) {
                grid.push([...fit(l[i], HALF_WIDTH, `left row ${i}`), {ch: SEPARATOR, attr: '.'}, ...fit(r[i], HALF_WIDTH, `right row ${i}`)]);
            }
        } else if (full) {
            const clone = full.cloneNode(true) as Element;
            clone.querySelectorAll('.statusline').forEach(s => s.closest('pre')?.remove());
            const f = readRows(clone);
            for (let i = 0; i < ROWS; i++) grid.push(fit(f[i], FULL_WIDTH, `row ${i}`));
        } else {
            for (let i = 0; i < ROWS; i++) grid.push(fit([], FULL_WIDTH, 'blank row'));
        }
        grid.push(status);
        return new Screen(grid);
    }

    public text(): string {
        return this.grid.map(r => r.map(c => c.ch).join('')).join('\n');
    }

    public mask(): string {
        return this.grid.map(r => r.map(c => c.attr).join('')).join('\n');
    }

    public row(n: number): string {
        return this.grid[n].map(c => c.ch).join('');
    }

    public cell(row: number, col: number): Cell {
        return this.grid[row][col];
    }

    /** Text, a blank line and the mask; the format for snapshots and failure messages. */
    public dump(): string {
        return `${this.text()}\n\n${this.mask()}`;
    }

    /** Page name in the status line (columns 0-4); shows CRSR while the left cursor is on */
    public leftName(): string {
        return this.row(6).slice(0, 5);
    }

    /** Page name in the status line (columns 18-22); shows CRSR while the right cursor is on */
    public rightName(): string {
        return this.row(6).slice(18, 23);
    }

    /** One half of the screen (11 columns, 6 rows), for assertions about one page */
    public half(side: 'L' | 'R'): string {
        return this.grid.slice(0, ROWS).map(r => r.slice(side === 'L' ? 0 : 12, side === 'L' ? 11 : 23).map(c => c.ch).join('')).join('\n');
    }
}
```

- [ ] **Step 2: `test/harness/render/canvas.ts`**

```ts
import path from 'path';
import {Canvas as SkiaCanvas, createCanvas, GlobalFonts} from '@napi-rs/canvas';

const ASSETS = path.resolve(process.cwd(), 'resources/html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets');

/**
 * happy-dom has no 2D canvas (getContext('2d') returns null). This backs every canvas element with a Skia canvas of the
 * same size and registers the instrument's fonts under the names KLN90B.scss gives them.
 */
export function installCanvas(g: any): void {
    GlobalFonts.registerFromPath(path.join(ASSETS, 'kln90b.ttf'), 'KLN90B');
    GlobalFonts.registerFromPath(path.join(ASSETS, 'kln90b-map.ttf'), 'KLN90BMap');
    const backing = new WeakMap<object, SkiaCanvas>();
    g.HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
        if (type !== '2d') return null;
        let canvas = backing.get(this);
        if (canvas === undefined || canvas.width !== this.width || canvas.height !== this.height) {
            canvas = createCanvas(this.width, this.height);
            backing.set(this, canvas);
        }
        return canvas.getContext('2d');
    };
}

/**
 * The canvas as rows of '#' (lit) and '.' (dark). A pixel is lit when its alpha reaches the threshold, which keeps
 * Skia's antialiased text edges stable.
 * @param el
 * @param threshold 0-255
 */
export function canvasToAscii(el: HTMLCanvasElement, threshold = 128): string {
    const ctx = el.getContext('2d') as unknown as CanvasRenderingContext2D;
    const {data, width, height} = ctx.getImageData(0, 0, el.width, el.height);
    const rows: string[] = [];
    for (let y = 0; y < height; y++) {
        let row = '';
        for (let x = 0; x < width; x++) {
            row += data[(y * width + x) * 4 + 3] >= threshold ? '#' : '.';
        }
        rows.push(row);
    }
    return rows.join('\n');
}
```

Replace `test/harness/setup/dom.ts` with:

```ts
import {installSimFakes} from '../sim/install';
import {installCanvas} from '../render/canvas';

installSimFakes();
installCanvas(globalThis);
```

- [ ] **Step 3: Write `test/render/harness/screen.test.ts`**

```ts
import {describe, expect, it} from 'vitest';
import {Screen} from '../../harness/render/screen';

function mount(html: string): Element {
    document.body.innerHTML = `<div id="pageContainer">${html}</div>`;
    return document.getElementById('pageContainer')!;
}

const STATUS = '<pre><span class="statusline"><span>NAV 2</span>|<span>enr-leg</span> <span class="inverted">msg</span>|<span>SUP&nbsp;&nbsp;</span><br/></span></pre>';

describe('Screen', () => {
    it('composes both half pages and the status line', () => {
        mount(`<div><div class="left-page"><pre>PRESENT POS<br/><br/>ABC&nbsp;&nbsp;180°fr<br/></pre></div>`
            + `<div class="right-page"><pre><span class="d-none">HIDDEN</span>SUP<br/></pre></div>${STATUS}</div>`);
        const screen = Screen.read();
        expect(screen.text().split('\n')).toEqual([
            'PRESENT POS|SUP        ',
            '           |           ',
            'ABC  180°fr|           ',
            '           |           ',
            '           |           ',
            '           |           ',
            'NAV 2|enr-leg msg|SUP  ',
        ]);
        expect(screen.mask().split('\n')[6]).toBe('..............III......');
        expect(screen.leftName()).toBe('NAV 2');
        expect(screen.rightName()).toBe('SUP  ');
    });

    it('marks inverse, blinking and flashing-inverse cells', () => {
        mount(`<div><div class="left-page"><pre><span class="inverted">A</span><span class="blink">B</span>`
            + `<span class="inverted inverted-blink">C</span>D<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);
        // The separator column is a normal cell, so it shows as '.' in the mask
        expect(Screen.read().mask().split('\n')[0]).toBe('IBF....................');
    });

    it('throws when a row is wider than its half page', () => {
        mount(`<div><div class="left-page"><pre>TWELVE CHARS<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);
        expect(() => Screen.read()).toThrow(/left row 0 is 12 cells wide, more than 11: "TWELVE CHARS"/);
    });
});
```

- [ ] **Step 4: Write `test/render/harness/canvas.test.ts`**

```ts
import {describe, expect, it} from 'vitest';
import {canvasToAscii} from '../../harness/render/canvas';

function canvas(width: number, height: number): HTMLCanvasElement {
    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    return el;
}

describe('canvas backing', () => {
    it('draws exact pixels', () => {
        const el = canvas(6, 4);
        const ctx = el.getContext('2d')!;
        ctx.fillStyle = '#00D109';
        ctx.fillRect(1, 1, 3, 2);
        expect(canvasToAscii(el)).toBe(['......', '.###..', '.###..', '......'].join('\n'));
    });

    it('renders the map font inside the text box only', () => {
        const el = canvas(40, 12);
        const ctx = el.getContext('2d')!;
        ctx.fillStyle = '#00D109';
        ctx.font = '7px KLN90BMap';
        ctx.textBaseline = 'top';
        ctx.fillText('KLN', 2, 2);
        const rows = canvasToAscii(el).split('\n');
        const lit = rows.flatMap((r, y) => [...r].map((c, x) => ({c, x, y}))).filter(p => p.c === '#');
        expect(lit.length).toBeGreaterThan(10);
        // 3 glyphs of the 6-px map font start at x=2; nothing may be drawn left of x=2 or below row 11
        expect(lit.every(p => p.x >= 2 && p.x < 2 + 3 * 6 + 2 && p.y >= 2 && p.y < 11)).toBe(true);
    });
});
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run --project render` → pass. Run: `npx tsc --noEmit` → clean.

```bash
git add test/
git commit -m "Added a screen reader and a Skia-backed canvas for render tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/harness/render/screen.ts", "test/harness/render/canvas.ts", "test/harness/setup/dom.ts", "test/render/harness/screen.test.ts", "test/render/harness/canvas.test.ts"], "verifyCommand": "npx vitest run --project render && npx tsc --noEmit", "acceptanceCriteria": ["reader composes left|right|status into 7 rows of 23 cells, skips d-none, maps nbsp and br", "mask marks inverted I, blink B, inverted-blink F", "an overwide row throws with its text", "fillRect appears exactly in canvasToAscii; map-font text lights pixels only inside its box"], "modelTier": "standard"}
```

---

### Task 9: Render proof test (NAV 2)

**Goal:** A realistic render test: the NAV 2 page shows the radial and distance from the nearest VOR and the present position, as the manual describes (3-8 is cited by `DistanceDisplay` for the NAV 2 distance).

> **USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Files:**
- Test: `test/render/pages/Nav2Page.test.ts`

**Acceptance Criteria:**
- [ ] The left half page equals the literal rows in Step 1 of this plan task, derived from the test geometry, not from the code.
- [ ] The full 23×7 screen and its mask are pinned by an inline snapshot.

**Verify:** `npx vitest run --project render test/render/pages/Nav2Page.test.ts` → pass

**Steps:**

- [ ] **Step 1: Write the test**

Geometry: the VOR ABC is at 47.2°N 8.0°E with no magnetic variation, the aircraft at 47.0°N 8.0°E and the world magvar is 0. The aircraft is due south of the VOR on its meridian, so the radial is exactly 180°. 0.2° of latitude is 12.0 NM (1 NM ≈ 1 arc minute), shown as `12.0` in the 6-character distance field (`DistanceDisplay(6)`, one decimal below 10^4).

```ts
import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {vor} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';

describe('NAV 2 page', () => {
    it('shows radial and distance from the nearest VOR and the present position', async () => {
        await bootUnit({facilities: [vor('ABC', 47.2, 8.0, {magneticVariation: 0})], position: {lat: 47.0, lon: 8.0}});
        // The nearest VOR list searches every 10 s (NEAREST_TICK_TIME in NearestList.ts)
        await vi.advanceTimersByTimeAsync(12_000);

        const screen = Screen.read();
        expect(screen.half('L').split('\n')).toEqual([
            'PRESENT POS',
            '           ',
            'ABC  180°fr',
            '     12.0nm',
            "N 47°00.00'",
            "E 08°00.00'",
        ]);
        expect(screen.leftName()).toBe('NAV 2');
        expect(screen.dump()).toMatchInlineSnapshot();
    });
});
```

- [ ] **Step 2: Run, review the snapshot, commit**

Run: `npx vitest run --project render test/render/pages/Nav2Page.test.ts` → pass; Vitest writes the inline snapshot into the file on the first run. Read the snapshot: the right half must be the SUP page and the status line must read `NAV 2|enr-leg … |SUP  `. If the left half differs from the literal rows, do not change the literals to match; report the screen dump to the coordinator (it may be a bug or a wrong assumption in the geometry).
Run: `npx tsc --noEmit` → clean.

```bash
git add test/render/pages/Nav2Page.test.ts
git commit -m "Added a render test for the NAV 2 page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/render/pages/Nav2Page.test.ts"], "verifyCommand": "npx vitest run --project render test/render/pages/Nav2Page.test.ts && npx tsc --noEmit", "acceptanceCriteria": ["left half page equals the literal rows derived from the geometry", "full screen and mask pinned by an inline snapshot"], "modelTier": "standard", "userGate": true, "tags": ["user-gate"]}
```

---

### Task 10: Aircraft model and pilots

**Goal:** A kinematic aircraft that writes the sim inputs the unit reads, and pilots that command its bank.

**Files:**
- Create: `test/harness/flight/geo.ts`, `test/harness/flight/Aircraft.ts`, `test/harness/flight/pilots.ts`
- Test: `test/unit/harness/aircraft.test.ts`

**Acceptance Criteria:**
- [ ] Wings level at 120 kt for one hour along a meridian moves the aircraft 120 NM (checked with the independent formula in `geo.ts`).
- [ ] Bank changes at most at the roll rate and never exceeds the bank limit.
- [ ] Holding 18.34° of bank at 120 kt turns at the standard rate (3°/s within 0.05°/s).
- [ ] `coupledAutopilot()` turns `L:KLN90B_RollCommand` (positive = left, per `RollSteeringController.desiredBank`) into a right-positive bank.

**Verify:** `npx vitest run --project unit test/unit/harness/aircraft.test.ts` → pass

**Steps:**

- [ ] **Step 1: `test/harness/flight/geo.ts`** (independent of the SDK, for expectations)

```ts
/** Earth radius in NM used for expectations; the SDK's great-circle math uses a sphere as well. */
export const EARTH_RADIUS_NM = 3440.065;
const RAD = Math.PI / 180;

export interface LatLon {
    lat: number;
    lon: number;
}

/** Great-circle distance in NM (haversine) */
export function distanceNm(a: LatLon, b: LatLon): number {
    const dLat = (b.lat - a.lat) * RAD;
    const dLon = (b.lon - a.lon) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}

/** Initial great-circle course from a to b, degrees true */
export function courseDeg(a: LatLon, b: LatLon): number {
    const dLon = (b.lon - a.lon) * RAD;
    const y = Math.sin(dLon) * Math.cos(b.lat * RAD);
    const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dLon);
    return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Final course arriving at b on the great circle from a, degrees true */
export function finalCourseDeg(a: LatLon, b: LatLon): number {
    return (courseDeg(b, a) + 180) % 360;
}

export function norm360(deg: number): number {
    return ((deg % 360) + 360) % 360;
}
```

- [ ] **Step 2: `test/harness/flight/Aircraft.ts`**

```ts
import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {FakeSim} from '../sim/FakeSim';
import {norm360} from './geo';

const G = 9.80665;
const KNOT_MPS = 1852 / 3600;
const RAD = Math.PI / 180;

export interface AircraftInit {
    lat: number;
    lon: number;
    altitudeFt: number;
    groundspeedKt: number;
    trackTrue: number;
}

export interface AircraftOptions {
    /** Default 5°/s, the roll rate KLNNavmath assumes for turn anticipation */
    rollRateDegPerS?: number;
    /** Default 25° (MAX_BANK_ANGLE in NavCalculator.ts) */
    maxBankDeg?: number;
}

/**
 * A point mass flying coordinated turns at constant ground speed and altitude, with no wind. Bank is positive to the
 * right.
 */
export class Aircraft {
    public lat: number;
    public lon: number;
    public altitudeFt: number;
    public groundspeedKt: number;
    public trackTrue: number;
    public bankDeg = 0;
    private readonly rollRate: number;
    private readonly maxBank: number;

    constructor(init: AircraftInit, opts: AircraftOptions = {}) {
        this.lat = init.lat;
        this.lon = init.lon;
        this.altitudeFt = init.altitudeFt;
        this.groundspeedKt = init.groundspeedKt;
        this.trackTrue = init.trackTrue;
        this.rollRate = opts.rollRateDegPerS ?? 5;
        this.maxBank = opts.maxBankDeg ?? 25;
    }

    /**
     * Advances the aircraft.
     * @param dt seconds
     * @param commandedBankDeg positive = right
     */
    public step(dt: number, commandedBankDeg: number): void {
        const target = Math.max(-this.maxBank, Math.min(this.maxBank, commandedBankDeg));
        const maxChange = this.rollRate * dt;
        this.bankDeg += Math.max(-maxChange, Math.min(maxChange, target - this.bankDeg));
        const v = this.groundspeedKt * KNOT_MPS;
        if (v > 0.1) {
            const turnRateDeg = G * Math.tan(this.bankDeg * RAD) / v / RAD;
            this.trackTrue = norm360(this.trackTrue + turnRateDeg * dt);
        }
        this.moveAlongTrack(this.groundspeedKt * dt / 3600);
    }

    /** Moves along the current great circle and updates the track to the course at the new position. */
    public moveAlongTrack(nm: number): void {
        if (nm <= 0) return;
        const start = new GeoPoint(this.lat, this.lon);
        const end = new GeoPoint(this.lat, this.lon).offset(this.trackTrue, UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN));
        this.lat = end.lat;
        this.lon = end.lon;
        this.trackTrue = norm360(end.bearingTo(start) + 180);
    }

    /**
     * Writes the sim variables the unit reads (Sensors.ts, Gps.ts).
     * @param sim
     * @param magvar degrees east, for the gyro heading
     */
    public writeTo(sim: FakeSim, magvar: number): void {
        sim.set('PLANE LATITUDE', 'degrees', this.lat);
        sim.set('PLANE LONGITUDE', 'degrees', this.lon);
        sim.set('PLANE ALTITUDE', 'feet', this.altitudeFt);
        sim.set('PRESSURE ALTITUDE', 'feet', this.altitudeFt);
        sim.set('GROUND VELOCITY', 'knots', this.groundspeedKt);
        sim.set('AIRSPEED TRUE', 'knots', this.groundspeedKt);
        sim.set('PLANE HEADING DEGREES TRUE', 'degrees', this.trackTrue);
        sim.set('PLANE HEADING DEGREES GYRO', 'degrees', norm360(this.trackTrue - magvar));
        sim.set('PLANE BANK DEGREES', 'degrees', this.bankDeg);
        sim.set('GPS DRIVES NAV1', 'bool', true);
    }
}
```

- [ ] **Step 3: `test/harness/flight/pilots.ts`**

```ts
import {LVAR_ROLL_COMMAND} from '../../../kln90b/LVars';
import {FakeSim} from '../sim/FakeSim';
import {Aircraft} from './Aircraft';
import {courseDeg, distanceNm, LatLon} from './geo';

export interface PilotContext {
    sim: FakeSim;
    aircraft: Aircraft;
}

/** Commands the aircraft's bank, positive = right. Called at the aircraft's step rate. */
export interface Pilot {
    commandedBank(ctx: PilotContext): number;
}

/**
 * An autopilot coupled to the unit's roll steering output. L:KLN90B_RollCommand is positive to the left
 * (RollSteeringController.desiredBank) and 0 when the unit has no command, which holds the wings level.
 */
export function coupledAutopilot(): Pilot {
    return {commandedBank: ({sim}) => -sim.get(LVAR_ROLL_COMMAND, 'degrees')};
}

/** The test sets the bank directly, e.g. to leave the course on purpose. */
export class ManualPilot implements Pilot {
    public bank = 0;

    public commandedBank(): number {
        return this.bank;
    }
}

/** Flies direct to each point in turn, switching at 0.5 NM, independent of the unit. */
export function scriptedPath(points: LatLon[]): Pilot {
    let next = 0;
    return {
        commandedBank: ({aircraft}) => {
            while (next < points.length && distanceNm(aircraft, points[next]) < 0.5) next++;
            if (next >= points.length) return 0;
            const diff = ((courseDeg(aircraft, points[next]) - aircraft.trackTrue + 540) % 360) - 180;
            return Math.max(-25, Math.min(25, 1.25 * diff));
        },
    };
}
```

- [ ] **Step 4: Write `test/unit/harness/aircraft.test.ts`**

```ts
import {describe, expect, it} from 'vitest';
import {Aircraft} from '../../harness/flight/Aircraft';
import {coupledAutopilot} from '../../harness/flight/pilots';
import {FakeSim} from '../../harness/sim/FakeSim';
import {distanceNm} from '../../harness/flight/geo';

function fly(aircraft: Aircraft, seconds: number, bank: number): void {
    for (let i = 0; i < seconds * 16; i++) aircraft.step(1 / 16, bank);
}

describe('Aircraft', () => {
    it('flies 120 NM in one hour at 120 kt', () => {
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0});
        fly(a, 3600, 0);
        expect(distanceNm({lat: 0, lon: 0}, a)).toBeCloseTo(120, 1);
        expect(a.lon).toBeCloseTo(0, 6);
    });

    it('rolls at most at the roll rate and up to the limit', () => {
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0});
        fly(a, 1, 40);
        expect(a.bankDeg).toBeCloseTo(5, 6);
        fly(a, 10, 40);
        expect(a.bankDeg).toBe(25);
    });

    it('turns at the standard rate with standard-rate bank', () => {
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0});
        a.bankDeg = 18.34;
        fly(a, 10, 18.34);
        // g·tan(18.34°)/v at 120 kt = 3.0°/s
        expect(a.trackTrue / 10).toBeCloseTo(3.0, 1);
    });
});

describe('coupledAutopilot', () => {
    it('banks right for a negative (right) roll command', () => {
        const sim = new FakeSim();
        sim.set('L:KLN90B_RollCommand', 'degrees', -10);
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 0, groundspeedKt: 0, trackTrue: 0});
        expect(coupledAutopilot().commandedBank({sim, aircraft: a})).toBe(10);
    });
});
```

- [ ] **Step 5: Run and commit**

Run: `npx vitest run --project unit` → pass. Run: `npx tsc --noEmit` → clean.

```bash
git add test/
git commit -m "Added a kinematic aircraft and pilots for flight tests" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/harness/flight/geo.ts", "test/harness/flight/Aircraft.ts", "test/harness/flight/pilots.ts", "test/unit/harness/aircraft.test.ts"], "verifyCommand": "npx vitest run --project unit && npx tsc --noEmit", "acceptanceCriteria": ["120 kt for one hour moves 120 NM", "bank limited by roll rate and bank limit", "18.34° bank at 120 kt turns at 3°/s ±0.05", "coupledAutopilot negates the left-positive roll command"], "modelTier": "mechanical"}
```

---

### Task 11: Flight driver (`World`, `Flight`, monitors, recorder, `jump`)

**Goal:** `Flight.start()` boots the unit into a world with an aircraft and a pilot; `fly`, `flyUntil` and `jump` move time; monitors and a recorder observe the flight.

**Files:**
- Create: `test/harness/flight/World.ts`, `test/harness/flight/Recorder.ts`, `test/harness/flight/Flight.ts`
- Test: `test/flight/harness/flight.test.ts`, `test/flight/harness/jump.test.ts`, `test/flight/harness/monitor.test.ts`

**Acceptance Criteria:**
- [ ] Flying wings level for 60 s at 120 kt moves the aircraft 2.0 NM, and the unit's GPS position follows within 0.05 NM.
- [ ] `jump(nmBefore(active, 10))` ends 10 NM (±0.2) before the active waypoint with the GPS still valid.
- [ ] `jump` to a waypoint that is not the active one, or to within 3 NM of it, throws.
- [ ] A failing monitor makes `fly` throw with the monitor name and the sim time.
- [ ] On a failing test, `test/flight/__output__/<test>.jsonl` and `.kml` are written.

**Verify:** `npx vitest run --project flight` → pass

**Steps:**

- [ ] **Step 1: `test/harness/flight/World.ts`**

```ts
import {Facility} from '@microsoft/msfs-sdk';
import {LatLon} from './geo';

/** The navdata and magnetic variation a flight takes place in. Idents must be unique within a world. */
export class World {
    private readonly facilities: Facility[] = [];

    constructor(private readonly opts: { magvar?: number } = {}) {
    }

    public add(...facs: Facility[]): this {
        this.facilities.push(...facs);
        return this;
    }

    public get(ident: string): Facility {
        const found = this.facilities.filter(f => f.icaoStruct.ident === ident);
        if (found.length !== 1) throw new Error(`World: ${found.length} facilities named ${ident}`);
        return found[0];
    }

    public pos(ident: string): LatLon {
        const f = this.get(ident);
        return {lat: f.lat, lon: f.lon};
    }

    public all(): Facility[] {
        return [...this.facilities];
    }

    public magvar(_lat: number, _lon: number): number {
        return this.opts.magvar ?? 0;
    }
}
```

- [ ] **Step 2: `test/harness/flight/Recorder.ts`**

```ts
import fs from 'fs';
import path from 'path';
import {LatLon} from './geo';

export interface RecorderRow {
    t: number;
    lat: number;
    lon: number;
    altFt: number;
    gs: number;
    track: number;
    bank: number;
    nav: Record<string, unknown>;
    simvars: Record<string, number | string>;
    screen: string;
}

const OUTPUT = path.resolve(process.cwd(), 'test/flight/__output__');

/** One row per simulated second, written as JSONL and KML when a test fails. */
export class FlightRecorder {
    public readonly rows: RecorderRow[] = [];

    public record(row: RecorderRow): void {
        this.rows.push(row);
    }

    public write(testName: string, waypoints: (LatLon & { ident: string })[]): string {
        fs.mkdirSync(OUTPUT, {recursive: true});
        const base = path.join(OUTPUT, testName.replace(/[^A-Za-z0-9_-]+/g, '_'));
        fs.writeFileSync(`${base}.jsonl`, this.rows.map(r => JSON.stringify(r)).join('\n'));
        const coords = this.rows.map(r => `${r.lon},${r.lat},${(r.altFt * 0.3048).toFixed(1)}`).join(' ');
        const marks = waypoints.map(w => `<Placemark><name>${w.ident}</name><Point><coordinates>${w.lon},${w.lat},0</coordinates></Point></Placemark>`).join('');
        fs.writeFileSync(`${base}.kml`, `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${testName}</name>`
            + `<Placemark><name>track</name><LineString><altitudeMode>absolute</altitudeMode><coordinates>${coords}</coordinates></LineString></Placemark>${marks}</Document></kml>`);
        return base;
    }
}
```

- [ ] **Step 3: `test/harness/flight/Flight.ts`**

```ts
import {expect, onTestFailed, vi} from 'vitest';
import {NavMode} from '../../../kln90b/data/VolatileMemory';
import {bootUnit, BootOptions, HeadlessUnit} from '../boot';
import {Screen} from '../render/screen';
import {Aircraft, AircraftInit, AircraftOptions} from './Aircraft';
import {coupledAutopilot, Pilot} from './pilots';
import {World} from './World';
import {distanceNm} from './geo';
import {FlightRecorder} from './Recorder';
import {FrontPanel} from './FrontPanel';

export type JumpTarget = { kind: 'nmBefore'; ident: string; nm: number } | { kind: 'minutes'; minutes: number };
export const nmBefore = (ident: string, nm: number): JumpTarget => ({kind: 'nmBefore', ident, nm});
export const minutes = (m: number): JumpTarget => ({kind: 'minutes', minutes: m});

/** A jump must leave room for turn anticipation and the waypoint alert before the active waypoint. */
const MIN_REMAINING_NM = 3;
const PHYSICS_STEP_MS = 1000 / 16;

const MODE_NAMES: Record<number, string> = {
    [NavMode.ENR_LEG]: 'ENR-LEG', [NavMode.ENR_OBS]: 'ENR-OBS', [NavMode.ARM_LEG]: 'ARM-LEG',
    [NavMode.ARM_OBS]: 'ARM-OBS', [NavMode.APR_LEG]: 'APR-LEG',
};

const RECORDED_SIMVARS: [string, string][] = [
    ['GPS WP NEXT ID', 'string'], ['GPS WP DISTANCE', 'nautical miles'], ['GPS WP DESIRED TRACK', 'degrees'],
    ['GPS WP CROSS TRK', 'nautical miles'], ['L:KLN90B_RollCommand', 'degrees'], ['L:KLN90B_WptLight', 'bool'],
];

export interface FlightOptions extends Omit<BootOptions, 'facilities' | 'position' | 'altitudeFt' | 'magvar'> {
    world: World;
    aircraft: AircraftInit;
    aircraftOptions?: AircraftOptions;
    pilot?: Pilot;
}

export interface NavView {
    activeIdent: string | null;
    distNm: number | null;
    dtkTrue: number | null;
    xtkNm: number | null;
    toFrom: 'TO' | 'FROM' | null;
    mode: string;
    waypointAlert: boolean;
    xtkScale: number;
}

interface MonitorFailure {
    t: number;
    name: string;
    detail: string;
}

/**
 * A simulated flight: the headless unit, an aircraft, a pilot and the world. Time only moves in fly, flyUntil and jump.
 */
export class Flight {
    public readonly recorder = new FlightRecorder();
    public readonly panel: FrontPanel;
    public pilot: Pilot;
    private readonly monitors: { name: string; check: (f: Flight) => true | string }[] = [];
    private readonly failures: MonitorFailure[] = [];
    private readonly startMs: number;
    private consoleErrors = 0;

    private constructor(public readonly unit: HeadlessUnit, public readonly world: World, public readonly aircraft: Aircraft, pilot: Pilot) {
        this.pilot = pilot;
        this.startMs = Date.now();
        this.panel = new FrontPanel(evt => unit.send(evt), () => this.screen);
    }

    public static async start(opts: FlightOptions): Promise<Flight> {
        const {world, aircraft, aircraftOptions, pilot, ...boot} = opts;
        const unit = await bootUnit({
            ...boot, facilities: world.all(), position: {lat: aircraft.lat, lon: aircraft.lon}, altitudeFt: aircraft.altitudeFt,
            magvar: (lat, lon) => world.magvar(lat, lon),
        });
        const flight = new Flight(unit, world, new Aircraft(aircraft, aircraftOptions), pilot ?? coupledAutopilot());
        flight.installBuiltInMonitors();
        flight.installLoops();
        onTestFailed(() => {
            const name = expect.getState().currentTestName ?? 'flight';
            const base = flight.recorder.write(name, world.all().map(f => ({ident: f.icaoStruct.ident, lat: f.lat, lon: f.lon})));
            console.error(`Flight recorder written to ${base}.jsonl / .kml`);
        });
        await flight.flyUntil(() => unit.props.sensors.in.gps.isValid(), {timeout: 120, description: 'GPS solution'});
        return flight;
    }

    /** Seconds of simulated time since Flight.start */
    public get t(): number {
        return (Date.now() - this.startMs) / 1000;
    }

    public get sim() {
        return this.unit.env.sim;
    }

    public get screen(): Screen {
        return Screen.read();
    }

    public get nav(): NavView {
        const n = this.unit.props.memory.navPage;
        return {
            activeIdent: n.activeWaypoint.getActiveWpt()?.icaoStruct.ident ?? null,
            distNm: n.distToActive,
            dtkTrue: n.desiredTrack,
            xtkNm: n.xtkToActive,
            toFrom: n.toFrom === null ? null : (n.toFrom ? 'TO' : 'FROM'),
            mode: MODE_NAMES[n.navmode] ?? String(n.navmode),
            waypointAlert: n.waypointAlert,
            xtkScale: n.xtkScale,
        };
    }

    /**
     * Adds a check that runs once per simulated second. Return true when fine, otherwise a description.
     */
    public monitor(name: string, check: (f: Flight) => true | string): void {
        this.monitors.push({name, check});
    }

    /** Runs every tick for the given simulated time. */
    public async fly(seconds: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(seconds * 1000);
        this.throwIfFailed();
    }

    /** Flies until the predicate holds; returns the simulated seconds it took. */
    public async flyUntil(predicate: () => boolean, o: { timeout: number; description: string }): Promise<number> {
        const t0 = Date.now();
        while (!predicate()) {
            if (Date.now() - t0 > o.timeout * 1000) {
                throw new Error(`flyUntil: "${o.description}" not reached within ${o.timeout} s\n${this.screen.dump()}`);
            }
            await vi.advanceTimersByTimeAsync(250);
            this.throwIfFailed();
        }
        return (Date.now() - t0) / 1000;
    }

    /**
     * Slew-style jump: moves the aircraft along its current great circle and the clock forward without running the
     * ticks in between, then runs one second normally. Integrated values (flight timer, fuel) miss the jumped time.
     * @throws Error if the jump would cross or come within 3 NM of the active waypoint
     */
    public async jump(target: JumpTarget): Promise<void> {
        const active = this.nav.activeIdent;
        if (active === null) throw new Error('jump: no active waypoint');
        const toActive = distanceNm(this.aircraft, this.world.pos(active));
        let distance: number;
        if (target.kind === 'nmBefore') {
            if (target.ident !== active) {
                throw new Error(`jump: ${target.ident} is not the active waypoint (${active}); a jump must not cross a waypoint`);
            }
            distance = toActive - target.nm;
        } else {
            distance = this.aircraft.groundspeedKt * target.minutes / 60;
        }
        if (distance <= 0) throw new Error(`jump: nothing to jump (${distance.toFixed(2)} NM)`);
        if (toActive - distance < MIN_REMAINING_NM) {
            throw new Error(`jump: would end ${(toActive - distance).toFixed(2)} NM from ${active}, closer than ${MIN_REMAINING_NM} NM`);
        }
        this.aircraft.moveAlongTrack(distance);
        this.aircraft.writeTo(this.sim, this.world.magvar(this.aircraft.lat, this.aircraft.lon));
        vi.setSystemTime(Date.now() + distance / this.aircraft.groundspeedKt * 3600_000);
        await this.fly(1);
    }

    private installLoops(): void {
        setInterval(() => {
            const bank = this.pilot.commandedBank({sim: this.sim, aircraft: this.aircraft});
            this.aircraft.step(PHYSICS_STEP_MS / 1000, bank);
            this.aircraft.writeTo(this.sim, this.world.magvar(this.aircraft.lat, this.aircraft.lon));
        }, PHYSICS_STEP_MS);
        setInterval(() => this.everySecond(), 1000);
    }

    private everySecond(): void {
        for (const m of this.monitors) {
            const result = m.check(this);
            if (result !== true) this.failures.push({t: this.t, name: m.name, detail: result});
        }
        const simvars: Record<string, number | string> = {};
        for (const [name, unit] of RECORDED_SIMVARS) {
            if (this.sim.has(name)) simvars[name] = this.sim.get(name, unit);
        }
        let screen: string;
        try {
            screen = this.screen.text();
        } catch (e) {
            // An overwide row is a rendering bug; record it instead of throwing inside a timer
            screen = String(e);
            this.failures.push({t: this.t, name: 'screen readable', detail: screen});
        }
        const a = this.aircraft;
        this.recorder.record({
            t: this.t, lat: a.lat, lon: a.lon, altFt: a.altitudeFt, gs: a.groundspeedKt, track: a.trackTrue, bank: a.bankDeg,
            nav: {...this.nav}, simvars, screen,
        });
    }

    private installBuiltInMonitors(): void {
        const originalError = console.error;
        console.error = (...args: unknown[]) => {
            this.consoleErrors++;
            originalError(...args);
        };
        this.monitor('no error page', f => f.unit.errors.length === 0 || `error published: ${f.unit.errors.map(String).join('; ')}`);
        this.monitor('no SimVar unit errors', f => f.sim.errors.length === 0 || f.sim.errors.join('; '));
        this.monitor('no console.error', () => this.consoleErrors === 0 || `${this.consoleErrors} console.error call(s)`);
        this.monitor('GPS outputs finite', f => {
            for (const name of ['GPS WP DISTANCE', 'GPS WP DESIRED TRACK', 'GPS WP CROSS TRK', 'GPS GROUND SPEED']) {
                const w = f.sim.lastWrite(name);
                if (w !== undefined && typeof w.value === 'number' && !Number.isFinite(w.value)) return `${name} = ${w.value}`;
            }
            return true;
        });
    }

    private throwIfFailed(): void {
        if (this.failures.length > 0) {
            const lines = this.failures.slice(0, 5).map(f => `t=${f.t.toFixed(0)} s ${f.name}: ${f.detail}`);
            throw new Error(`Flight monitors failed:\n${lines.join('\n')}`);
        }
    }
}
```

`Flight` needs the front panel's raw events now; Task 12 adds the helpers to the same file. Create `test/harness/flight/FrontPanel.ts`:

```ts
import {vi} from 'vitest';
import {
    EVT_ALT, EVT_CLR, EVT_DCT, EVT_ENT, EVT_L_CURSOR, EVT_L_INNER_LEFT, EVT_L_INNER_RIGHT, EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT, EVT_MSG, EVT_POWER, EVT_R_CURSOR, EVT_R_INNER_LEFT, EVT_R_INNER_RIGHT, EVT_R_OUTER_LEFT,
    EVT_R_OUTER_RIGHT, EVT_R_SCAN,
} from '../../../kln90b/HEvents';
import {Screen} from '../render/screen';

export type Side = 'L' | 'R';

/** One display tick, so the screen shows the result of each click (DOM changes only in display ticks) */
const CLICK_MS = 250;

/** The unit's controls, driven through the same H events as the sim and the aircraft's hardware. */
export class FrontPanel {
    constructor(private readonly send: (evt: string) => void, private readonly screen: () => Screen) {
    }

    public async press(evt: string, times = 1): Promise<void> {
        for (let i = 0; i < times; i++) {
            this.send(evt);
            await vi.advanceTimersByTimeAsync(CLICK_MS);
        }
    }

    /** Outer knob; positive clicks turn right */
    public outer(side: Side, clicks: number): Promise<void> {
        const evt = side === 'L' ? (clicks > 0 ? EVT_L_OUTER_RIGHT : EVT_L_OUTER_LEFT) : (clicks > 0 ? EVT_R_OUTER_RIGHT : EVT_R_OUTER_LEFT);
        return this.press(evt, Math.abs(clicks));
    }

    /** Inner knob; positive clicks turn right */
    public inner(side: Side, clicks: number): Promise<void> {
        const evt = side === 'L' ? (clicks > 0 ? EVT_L_INNER_RIGHT : EVT_L_INNER_LEFT) : (clicks > 0 ? EVT_R_INNER_RIGHT : EVT_R_INNER_LEFT);
        return this.press(evt, Math.abs(clicks));
    }

    public cursor(side: Side): Promise<void> {
        return this.press(side === 'L' ? EVT_L_CURSOR : EVT_R_CURSOR);
    }

    public ent(): Promise<void> {
        return this.press(EVT_ENT);
    }

    public clr(): Promise<void> {
        return this.press(EVT_CLR);
    }

    public dct(): Promise<void> {
        return this.press(EVT_DCT);
    }

    public msg(): Promise<void> {
        return this.press(EVT_MSG);
    }

    public alt(): Promise<void> {
        return this.press(EVT_ALT);
    }

    public scan(): Promise<void> {
        return this.press(EVT_R_SCAN);
    }

    public power(): Promise<void> {
        return this.press(EVT_POWER);
    }
}
```

`screen` is unused until Task 12; keep the parameter so the constructor does not change.

- [ ] **Step 4: Write the harness tests**

`test/flight/harness/flight.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {vor} from '../../harness/navdata/builders';
import {distanceNm} from '../../harness/flight/geo';

describe('Flight', () => {
    it('flies wings level and the unit follows the position', async () => {
        const world = new World().add(vor('ABC', 47.5, 8.5));
        const flight = await Flight.start({world, aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90}, pilot: new ManualPilot()});
        const start = {lat: flight.aircraft.lat, lon: flight.aircraft.lon};
        await flight.fly(60);
        expect(distanceNm(start, flight.aircraft)).toBeCloseTo(2.0, 2);
        expect(distanceNm(flight.unit.props.sensors.in.gps.coords, flight.aircraft)).toBeLessThan(0.05);
        expect(flight.sim.get('GPS GROUND SPEED', 'knots')).toBeCloseTo(120, 0);
    });
});
```

`test/flight/harness/jump.test.ts` (uses a saved FPL 0, which the unit activates at the leg closest to the aircraft):

```ts
import {describe, expect, it} from 'vitest';
import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {Flight, nmBefore} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {courseDeg, distanceNm} from '../../harness/flight/geo';

describe('jump', () => {
    it('moves to a point before the active waypoint and refuses to cross it', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const abc = vor('ABC', 47.5, 8.9);
        const kbbb = airport('KBBB', 48.2, 9.2);
        const world = new World().add(kaaa, abc, kbbb);
        // 2 NM past KAAA on the first leg, so the closest leg (ActiveWaypoint.activateFpl0) is KAAA → ABC
        const leg1 = courseDeg(kaaa, abc);
        const start = new GeoPoint(kaaa.lat, kaaa.lon).offset(leg1, UnitType.NMILE.convertTo(2, UnitType.GA_RADIAN));
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
        });
        await flight.flyUntil(() => flight.nav.activeIdent === 'ABC', {timeout: 30, description: 'ABC active'});

        await expect(flight.jump(nmBefore('KBBB', 5))).rejects.toThrow(/not the active waypoint/);
        await expect(flight.jump(nmBefore('ABC', 1))).rejects.toThrow(/closer than 3 NM/);

        await flight.jump(nmBefore('ABC', 10));
        // jump() flies one second after the jump: 0.03 NM at 120 kt
        expect(Math.abs(distanceNm(flight.aircraft, abc) - 10)).toBeLessThan(0.2);
        expect(flight.unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(Math.abs(flight.nav.distNm! - distanceNm(flight.aircraft, abc))).toBeLessThan(0.1);
    });
});
```

`test/flight/harness/monitor.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {vor} from '../../harness/navdata/builders';

describe('monitors', () => {
    it('fail the flight with the monitor name and the sim time', async () => {
        const flight = await Flight.start({world: new World().add(vor('ABC', 47.5, 8.5)), aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0}});
        flight.monitor('always fails', () => 'on purpose');
        await expect(flight.fly(2)).rejects.toThrow(/t=\d+ s always fails: on purpose/);
    });
});
```

- [ ] **Step 5: Check the recorder output once by hand**

Temporarily add `expect(true).toBe(false)` at the end of the wings-level test, run `npx vitest run --project flight test/flight/harness/flight.test.ts`, confirm `test/flight/__output__/*.jsonl` and `*.kml` exist and the KML opens as XML, then remove the line and delete the output folder. `git status` must not show `__output__`.

- [ ] **Step 6: Run and commit**

Run: `npx vitest run --project flight` → pass. Run: `npx tsc --noEmit` → clean.
If the GPS loses its solution after `jump`, stop and report to the coordinator with the recorder output; do not reach into `KLNGPSSatComputer` to force it.

```bash
git add test/
git commit -m "Added the flight driver with fly, flyUntil, jump, monitors and a flight recorder" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/harness/flight/World.ts", "test/harness/flight/Recorder.ts", "test/harness/flight/Flight.ts", "test/harness/flight/FrontPanel.ts", "test/flight/harness/flight.test.ts", "test/flight/harness/jump.test.ts", "test/flight/harness/monitor.test.ts"], "verifyCommand": "npx vitest run --project flight && npx tsc --noEmit", "acceptanceCriteria": ["60 s at 120 kt moves 2.0 NM and the unit's GPS follows within 0.05 NM", "jump(nmBefore(active,10)) ends 10±0.2 NM before it with GPS valid", "jump to a non-active waypoint or within 3 NM throws", "failing monitor makes fly throw with name and sim time", "failing test writes __output__ JSONL and KML"], "modelTier": "frontier"}
```

---

### Task 12: Front-panel driver (`selectPage`, `enterIdent`, `appendToFpl0`)

**Goal:** Drive the unit through knob and button events only, including entering a flight plan on FPL 0 with waypoint confirmation.

**Files:**
- Modify: `test/harness/flight/FrontPanel.ts`
- Test: `test/flight/harness/frontPanel.test.ts`

**Acceptance Criteria:**
- [ ] `selectPage('L', 'FPL 0')` reaches FPL 0 from the default NAV 2 page, using only outer and inner knob events.
- [ ] `appendToFpl0(['KAAA', 'ABC', 'KBBB'])` leaves FPL 0 with exactly those legs in order (read from `memory.fplPage.flightplans[0].getLegs()`), and the left half page shows the three idents.
- [ ] The helpers send only H events from `kln90b/HEvents.ts` through `core.onInteractionEvent`; no page objects are touched.

**Verify:** `npx vitest run --project flight test/flight/harness/frontPanel.test.ts` → pass

**Steps:**

- [ ] **Step 1: Complete `test/harness/flight/FrontPanel.ts`**

How entry works (manual 3-14, code in `controls/editors/Editor.tsx`, `WaypointEditor.tsx`, `FlightplanListItem.tsx`): the first inner-knob click on a field enters edit mode; each further click steps the focused character through the charset (`AlphabetEditorField`: space, A-Z, 0-9, wrapping); the outer knob moves to the next character; after each change the editor auto-completes the rest from the first matching ident. A focused editor shows all its characters inverted, which is how the helper finds it on screen. ENT shows the waypoint for confirmation on the right side; a second ENT confirms and moves the cursor on.

```ts
import {vi} from 'vitest';
import {
    EVT_ALT, EVT_CLR, EVT_DCT, EVT_ENT, EVT_L_CURSOR, EVT_L_INNER_LEFT, EVT_L_INNER_RIGHT, EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT, EVT_MSG, EVT_POWER, EVT_R_CURSOR, EVT_R_INNER_LEFT, EVT_R_INNER_RIGHT, EVT_R_OUTER_LEFT,
    EVT_R_OUTER_RIGHT, EVT_R_SCAN,
} from '../../../kln90b/HEvents';
import {Screen} from '../render/screen';

export type Side = 'L' | 'R';

/** AlphabetEditorField.charset in kln90b/controls/editors/EditorField.tsx */
const ALPHABET = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
/** One display tick, so the screen shows the result of each click (DOM changes only in display ticks) */
const CLICK_MS = 250;

interface Field {
    row: number;
    col: number;
    text: string;
}

function sameName(shown: string, wanted: string): boolean {
    // With more than one sub-page, the status line shows "APT+3" for "APT 3"
    return shown === wanted || (shown[3] === '+' && shown.slice(0, 3) === wanted.slice(0, 3) && shown[4] === wanted[4]);
}

function steps(from: string, to: string): number {
    const a = ALPHABET.indexOf(from);
    const b = ALPHABET.indexOf(to);
    if (b < 0) throw new Error(`FrontPanel: "${to}" cannot be entered with the knob`);
    if (a < 0) return 1; // "_" (no value yet): one click enters or starts the field, then read again
    const forward = (b - a + ALPHABET.length) % ALPHABET.length;
    return forward <= ALPHABET.length / 2 ? forward : forward - ALPHABET.length;
}

/** The unit's controls, driven through the same H events as the sim and the aircraft's hardware. */
export class FrontPanel {
    constructor(private readonly send: (evt: string) => void, private readonly screen: () => Screen) {
    }

    public async press(evt: string, times = 1): Promise<void> {
        for (let i = 0; i < times; i++) {
            this.send(evt);
            await vi.advanceTimersByTimeAsync(CLICK_MS);
        }
    }

    /** Outer knob; positive clicks turn right */
    public outer(side: Side, clicks: number): Promise<void> {
        const evt = side === 'L' ? (clicks > 0 ? EVT_L_OUTER_RIGHT : EVT_L_OUTER_LEFT) : (clicks > 0 ? EVT_R_OUTER_RIGHT : EVT_R_OUTER_LEFT);
        return this.press(evt, Math.abs(clicks));
    }

    /** Inner knob; positive clicks turn right */
    public inner(side: Side, clicks: number): Promise<void> {
        const evt = side === 'L' ? (clicks > 0 ? EVT_L_INNER_RIGHT : EVT_L_INNER_LEFT) : (clicks > 0 ? EVT_R_INNER_RIGHT : EVT_R_INNER_LEFT);
        return this.press(evt, Math.abs(clicks));
    }

    public cursor(side: Side): Promise<void> {
        return this.press(side === 'L' ? EVT_L_CURSOR : EVT_R_CURSOR);
    }

    public ent(): Promise<void> {
        return this.press(EVT_ENT);
    }

    public clr(): Promise<void> {
        return this.press(EVT_CLR);
    }

    public dct(): Promise<void> {
        return this.press(EVT_DCT);
    }

    public msg(): Promise<void> {
        return this.press(EVT_MSG);
    }

    public alt(): Promise<void> {
        return this.press(EVT_ALT);
    }

    public scan(): Promise<void> {
        return this.press(EVT_R_SCAN);
    }

    public power(): Promise<void> {
        return this.press(EVT_POWER);
    }

    /** Selects a page by its status-line name, e.g. 'FPL 0' or 'NAV 1'. The cursor on that side must be off. */
    public async selectPage(side: Side, name: string): Promise<void> {
        const shown = () => side === 'L' ? this.screen().leftName() : this.screen().rightName();
        for (let i = 0; shown().slice(0, 3) !== name.slice(0, 3); i++) {
            if (i > 12) throw new Error(`selectPage: no page group ${name.slice(0, 3)}\n${this.screen().dump()}`);
            await this.outer(side, 1);
        }
        for (let i = 0; !sameName(shown(), name); i++) {
            if (i > 30) throw new Error(`selectPage: no page ${name}\n${this.screen().dump()}`);
            await this.inner(side, 1);
        }
    }

    /** Types an ident into the focused editor with the inner and outer knobs. Does not press ENT. */
    public async enterIdent(side: Side, ident: string): Promise<void> {
        for (let i = 0; i < ident.length; i++) {
            if (i > 0) await this.outer(side, 1);
            for (let guard = 0; ; guard++) {
                const current = this.focusedField(side).text[i] ?? ' ';
                if (current === ident[i]) break;
                if (guard > ALPHABET.length) throw new Error(`enterIdent: cannot reach "${ident[i]}" at ${i}\n${this.screen().dump()}`);
                await this.inner(side, steps(current, ident[i]));
            }
        }
    }

    /** Appends waypoints to FPL 0 with waypoint confirmation (two ENTs each), then turns the cursor off. */
    public async appendToFpl0(idents: string[]): Promise<void> {
        await this.selectPage('L', 'FPL 0');
        await this.cursor('L');
        for (let i = 0; this.focusedField('L').text.replace(/[_ ]/g, '') !== ''; i++) {
            if (i > 31) throw new Error(`appendToFpl0: no blank entry\n${this.screen().dump()}`);
            await this.outer('L', 1);
        }
        for (const ident of idents) {
            await this.enterIdent('L', ident);
            await this.ent();
            await this.ent();
        }
        await this.cursor('L');
    }

    /** The one run of inverted cells on a side, which is the focused field. */
    private focusedField(side: Side): Field {
        const s = this.screen();
        const [c0, c1] = side === 'L' ? [0, 11] : [12, 23];
        const runs: Field[] = [];
        for (let r = 0; r < 6; r++) {
            let c = c0;
            while (c < c1) {
                const highlighted = (col: number) => s.cell(r, col).attr === 'I' || s.cell(r, col).attr === 'F';
                if (highlighted(c)) {
                    const start = c;
                    while (c < c1 && highlighted(c)) c++;
                    runs.push({row: r, col: start, text: s.row(r).slice(start, c)});
                } else {
                    c++;
                }
            }
        }
        if (runs.length !== 1) {
            throw new Error(`FrontPanel: expected one focused field on side ${side}, found ${runs.length}\n${s.dump()}`);
        }
        return runs[0];
    }
}
```

If the observed behavior differs from the description above (for example the cursor starts on a different field, or the confirmation needs a different key), adapt the helper to what the screen shows and cite the manual page or code line in a comment. Do not change production code.

- [ ] **Step 2: Write `test/flight/harness/frontPanel.test.ts`**

```ts
import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {airport, vor} from '../../harness/navdata/builders';

describe('FrontPanel', () => {
    it('enters a flight plan on FPL 0', async () => {
        const world = new World().add(airport('KAAA', 47.0, 8.0), vor('ABC', 47.5, 8.9), airport('KBBB', 48.2, 9.2));
        const flight = await Flight.start({world, pilot: new ManualPilot(), aircraft: {lat: 47.0, lon: 8.0, altitudeFt: 3000, groundspeedKt: 0, trackTrue: 45}});

        await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);

        const legs = flight.unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);
        expect(legs).toEqual(['KAAA', 'ABC', 'KBBB']);
        const left = flight.screen.half('L');
        for (const ident of ['KAAA', 'ABC', 'KBBB']) expect(left).toContain(ident);
        expect(flight.screen.leftName()).toBe('FPL 0');
    });
});
```

- [ ] **Step 3: Run and commit**

Run: `npx vitest run --project flight` → pass. Run: `npx tsc --noEmit` → clean.

```bash
git add test/
git commit -m "Added a front-panel driver that enters flight plans with the knobs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/harness/flight/FrontPanel.ts", "test/flight/harness/frontPanel.test.ts"], "verifyCommand": "npx vitest run --project flight && npx tsc --noEmit", "acceptanceCriteria": ["selectPage reaches FPL 0 from NAV 2 using only knob events", "appendToFpl0 leaves FPL 0 with legs KAAA, ABC, KBBB in order and the idents on the left half page", "helpers send only HEvents through core.onInteractionEvent"], "modelTier": "frontier"}
```

---

### Task 13: Proof flight

**Goal:** A short realistic flight: enter KAAA → ABC → KBBB through the front panel, fly the turn at ABC with the coupled autopilot, jump most of the next leg, fly to KBBB, and check SimVars, screen and calculated values.

> **USER-ORDERED GATE — NON-SKIPPABLE.** This task was requested by the user in the current conversation. It MUST NOT be closed by walking around it, by declaring it "verified inline", or by substituting a cheaper check. Close only after every item in `acceptanceCriteria` has been re-validated independently, with output captured.

**Files:**
- Test: `test/flight/flights/firstFlight.test.ts`

**Acceptance Criteria:**
- [ ] The plan is entered with `flight.panel.appendToFpl0` (knob events only).
- [ ] The waypoint alert (`L:KLN90B_WptLight`) comes on before sequencing at ABC.
- [ ] Sequencing happens before the aircraft reaches ABC (turn anticipation): 0.1–2 NM from ABC.
- [ ] After sequencing, `GPS WP NEXT ID` is `KBBB`.
- [ ] |XTK| < 0.3 NM while more than 3 NM from the active waypoint and at least 120 s after sequencing (monitor).
- [ ] After `jump(nmBefore('KBBB', 10))` and flying on, DIS matches the independent great-circle distance within 0.15 NM, and DTK is within 1° of the independent final course ABC→KBBB.
- [ ] NAV 1 on screen shows `KBBB`.
- [ ] The test finishes in under 20 s wall time; the measured speed is printed.

**Verify:** `npx vitest run --project flight test/flight/flights/firstFlight.test.ts` → pass

**Steps:**

- [ ] **Step 1: Write the test**

Geometry: KAAA 47.0°N 8.0°E, ABC 47.5°N 8.9°E, KBBB 48.2°N 9.2°E, magvar 0. The course KAAA→ABC is about 51° and ABC→KBBB about 16°, a 35° left turn. At 120 kt the standard-rate turn radius is about 0.63 NM, so turn anticipation (`NavCalculator`, 4-8) sequences roughly 0.2–0.5 NM before ABC; the 0.1–2 NM window allows for the roll-in distance the unit adds.

```ts
import {describe, expect, it} from 'vitest';
import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {Flight, nmBefore} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {courseDeg, distanceNm, finalCourseDeg, norm360} from '../../harness/flight/geo';

describe('first flight', () => {
    it('flies KAAA - ABC - KBBB with the coupled autopilot', async () => {
        // performance.now is the wall clock: startFakeClock does not fake it
        const t0 = performance.now();
        const kaaa = airport('KAAA', 47.0, 8.0, {elevationFt: 1400});
        const abc = vor('ABC', 47.5, 8.9);
        const kbbb = airport('KBBB', 48.2, 9.2, {elevationFt: 1500});
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb);

        // Start on the first leg, 10 NM before ABC
        const leg1 = courseDeg(kaaa, abc);
        const start = new GeoPoint(abc.lat, abc.lon).offset(norm360(leg1 + 180), UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN));
        const flight = await Flight.start({world, aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1}});

        await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);
        await flight.flyUntil(() => flight.nav.activeIdent === 'ABC', {timeout: 30, description: 'ABC active'});

        let alertSeen = false;
        let lastSequence = flight.t;
        flight.monitor('waypoint alert before sequencing', f => {
            if (f.sim.get('L:KLN90B_WptLight', 'bool')) alertSeen = true;
            return true;
        });
        flight.monitor('on course outside turns', f => {
            const n = f.nav;
            if (n.activeIdent === null || n.xtkNm === null || n.distNm === null) return true;
            if (n.distNm <= 3 || f.t - lastSequence < 120) return true;
            return Math.abs(n.xtkNm) < 0.3 || `XTK ${n.xtkNm.toFixed(2)} NM`;
        });

        await flight.flyUntil(() => flight.nav.activeIdent === 'KBBB', {timeout: 15 * 60, description: 'sequencing to KBBB'});
        lastSequence = flight.t;
        expect(alertSeen).toBe(true);
        const distAtSequencing = distanceNm(flight.aircraft, abc);
        expect(distAtSequencing).toBeGreaterThan(0.1);
        expect(distAtSequencing).toBeLessThan(2);
        expect(flight.sim.get('GPS WP NEXT ID', 'string')).toBe('KBBB');

        await flight.fly(150);
        await flight.jump(nmBefore('KBBB', 10));
        await flight.flyUntil(() => flight.nav.distNm !== null && flight.nav.distNm <= 5, {timeout: 10 * 60, description: '5 NM to KBBB'});

        // 0.15 NM: one calc tick of lag at 120 kt (0.03 NM) plus the difference between the SDK's earth radius and ours
        expect(Math.abs(flight.nav.distNm! - distanceNm(flight.aircraft, kbbb))).toBeLessThan(0.15);
        const dtkError = Math.abs(((flight.nav.dtkTrue! - finalCourseDeg(abc, kbbb) + 540) % 360) - 180);
        expect(dtkError).toBeLessThan(1);

        await flight.panel.selectPage('L', 'NAV 1');
        expect(flight.screen.half('L')).toContain('KBBB');

        const wallMs = performance.now() - t0;
        console.warn(`[flight-speed] ${flight.t.toFixed(0)} simulated s in ${(wallMs / 1000).toFixed(1)} s wall (${(flight.t / (wallMs / 1000)).toFixed(0)}x)`);
        expect(wallMs).toBeLessThan(20_000);
    });
});
```

- [ ] **Step 2: Run**

Run: `npx vitest run --project flight test/flight/flights/firstFlight.test.ts` → pass, with a `[flight-speed]` line on stderr. Record the measured speed for the docs (Task 14).
If an assertion fails, read the recorder output in `test/flight/__output__/` before changing anything. A failure that shows a real instrument bug is reported to the coordinator (check GitHub issues first); assertions are not loosened to pass.

- [ ] **Step 3: Commit**

```bash
git add test/flight/flights/firstFlight.test.ts
git commit -m "Added the first simulated flight test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["test/flight/flights/firstFlight.test.ts"], "verifyCommand": "npx vitest run --project flight test/flight/flights/firstFlight.test.ts", "acceptanceCriteria": ["plan entered with panel.appendToFpl0", "L:KLN90B_WptLight on before sequencing at ABC", "sequencing 0.1-2 NM before ABC", "GPS WP NEXT ID is KBBB after sequencing", "|XTK|<0.3 NM outside turns (monitor)", "after jump: DIS within 0.15 NM of independent distance, DTK within 1° of independent final course", "NAV 1 shows KBBB", "under 20 s wall time with the speed printed"], "modelTier": "frontier", "userGate": true, "tags": ["user-gate"]}
```

---

### Task 14: Documentation

**Goal:** Document the three test stages for humans and agents, and update `CLAUDE.md` and `docs/architecture.md`.

**Files:**
- Create: `docs/testing.md`
- Modify: `CLAUDE.md`, `docs/architecture.md`

**Acceptance Criteria:**
- [ ] `docs/testing.md` covers the seven sections of Step 1 in this plan task, using the proof tests as worked examples and stating the measured flight speed from Task 13 as a dated measurement.
- [ ] `CLAUDE.md` no longer says there are no tests; it lists the test commands and points to `docs/testing.md`.
- [ ] `docs/architecture.md` Core 1 describes `KLN90BCore`, `KLN90BPlatform` and the adapter, and its "as of" line names the new commit.
- [ ] No counts of growing things in prose; American English; no manual text.

**Verify:** `grep -n "no automated tests" CLAUDE.md` → no match; `npm test` → green

**Steps:**

- [ ] **Step 1: Write `docs/testing.md`** with these sections (prose in the style of `docs/architecture.md`, short bullets, code examples from the real tests):

1. **Stages and when to use which.** Unit (`test/unit/`, Node): pure logic and data formats. Render (`test/render/`, happy-dom): what a page shows for a given state. Flight (`test/flight/`, happy-dom): behavior over time, guidance, sequencing, SimVar outputs. Rule: the cheapest stage that can observe the behavior.
2. **Running.** `npm test`; `npx vitest run --project unit|render|flight`; `npm run test:watch`; one file: `npx vitest run test/render/pages/Nav2Page.test.ts`; `KLN_TEST_LOG=1` shows the instrument's console output; `npx tsc --noEmit` stays the type check (Vitest does not type-check).
3. **How the harness works.** `KLN90BCore` + `KLN90BPlatform` + `FakePlatform`; the global fakes and what each emulates (`FakeSim` at the native SimVar layer and why: the SDK replaces `SimVar.GetSimVarValue` at import; `FakeCoherent`; `FakeStorage` and the `""` contract; `FakeXhr`; magvar; static globals); per-file isolation and the one-unit-per-file rule; the fake clock and seeded random; `MemoryFacilityClient` and the builders.
4. **Writing tests.** Unit: the V2 format test as the example. Render: `bootUnit`, advancing the clock instead of calling `tick()`, `Screen` API and mask legend (`.` `I` `B` `F`), `toMatchInlineSnapshot`, canvas and `canvasToAscii` with `toMatchFileSnapshot`. Flight: `World`, `Flight.start` options, pilots, `fly`/`flyUntil`/`jump` semantics and jump caveats, `FrontPanel` raw events and helpers, `savedFlightplan` for fast setup, monitors, the recorder output and opening the KML in Google Earth.
5. **Conventions.** Cite the manual page behind an expectation; derive expected values independently (never from the code under test); pin known bugs with `it.fails('… (#NN)')`; keep runs deterministic; never commit manual content or navdata recorded from the sim; a behavior change comes with a test at the cheapest stage that sees it.
6. **Limitations.** happy-dom is not Coherent GT (no layout, CSS or glow); Skia text pixels differ from the sim; synthetic navdata has no procedures and no airspaces, and nearest-search filters are ignored; no wind; `jump` skips integrated values; SDK upgrades may require updating the fakes and rechecking `KLNGPSSatComputer`; no CI. Measured speed: "On 2026-10-03 the first flight ran N simulated seconds in M s wall" (fill in from Task 13).
7. **Next steps.** A power-cycle flight test for #90 (OTH pages pruned again on each `MainPage` construction); procedure builders for approach tests; flip #97/#98 pins when fixed.

- [ ] **Step 2: Update `CLAUDE.md`**

In "## Commands", add after `npx tsc --noEmit …`:

```bash
npm test               # all tests (Vitest: unit, render, flight)
npx vitest run --project flight   # one stage
```

Replace the paragraph starting "**There are no automated tests, no linter and no CI.**" with:

"Tests live in `test/` and run with Vitest in three stages: unit (Node), render (happy-dom, reads the 23×7 screen) and flight (boots the whole unit headless and flies it on simulated time). See **[docs/testing.md](docs/testing.md)**. There is no linter and no CI; `tsc` and the build remain separate checks. Behavior changes should come with a test at the cheapest stage that can observe them."

In "## Architecture in brief", **Boot** bullet: replace "`KLN90B.tsx` (a `BaseInstrument`) runs `asyncInit()`." with "`KLN90B.tsx` (a thin `BaseInstrument`) creates `KLN90BCore`, whose `init()` builds everything; `KLN90BPlatform` supplies navdata, the facility repository and the EFB route manager (tests pass fakes)."

- [ ] **Step 3: Update `docs/architecture.md`**

- Line 4–5 ("It describes the code as of v2.2.0 (commit `d449d11`)"): change to the commit of Task 13 (`git rev-parse --short HEAD`).
- Core 1: replace "`KLN90B extends BaseInstrument` (`kln90b/KLN90B.tsx`) and is registered …" through the **constructor** heading with a paragraph: `KLN90B` is a thin adapter (`templateID`, `isInteractive`, `Init` → `core.init(xmlConfig)`, `onInteractionEvent` → `super` + `core.onInteractionEvent`, `onSoundEnd`); `KLN90BCore` (`kln90b/KLN90BCore.ts`) holds what used to be the instrument class; `KLN90BPlatform` (`kln90b/KLN90BPlatform.ts`) with `SIM_PLATFORM`. Then keep the existing constructor/Init/asyncInit descriptions, renaming `KLN90B` to `KLN90BCore` where they describe the moved code, and note that keyboard events are re-dispatched through the adapter.
- Core 10, "Global and singleton state": add "tests run one headless unit per file because of these singletons (docs/testing.md)".

- [ ] **Step 4: Check and commit**

Run: `grep -n "no automated tests" CLAUDE.md` → nothing. Run: `npm test` → green. Run: `npx tsc --noEmit` → clean.

```bash
git add docs/testing.md CLAUDE.md docs/architecture.md
git commit -m "Documented the test stages and the new composition root" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

```json:metadata
{"files": ["docs/testing.md", "CLAUDE.md", "docs/architecture.md"], "verifyCommand": "npm test && npx tsc --noEmit", "acceptanceCriteria": ["docs/testing.md covers the seven listed sections with the proof tests as examples and the dated speed measurement", "CLAUDE.md lists test commands and points to docs/testing.md; 'no automated tests' removed", "architecture.md Core 1 describes KLN90BCore, KLN90BPlatform and the adapter; 'as of' line updated", "no counts of growing things; American English; no manual text"], "modelTier": "standard"}
```

---

## Dependencies

- Task 2 ← Task 1
- Task 3 ← Task 1 (so `npm test` exists to re-run)
- Task 4 ← Task 3 (user gate; blocks the merge, not later tasks)
- Task 5 ← Task 1
- Task 6 ← Task 5, Task 3 (uses `ActualFacilityClient`)
- Task 7 ← Task 6
- Task 8 ← Task 5
- Task 9 ← Task 7, Task 8
- Task 10 ← Task 5
- Task 11 ← Task 7, Task 8, Task 10
- Task 12 ← Task 11
- Task 13 ← Task 12
- Task 14 ← Task 13
