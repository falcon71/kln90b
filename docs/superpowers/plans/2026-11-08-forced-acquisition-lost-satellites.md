# A forced acquisition keeps a lost satellite searched (#469) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the forced acquisition of an engine-running start, a satellite whose signal is lost stays `None` in its
channel and is searched, so that the fix returns in the reacquisition time once the signals come back.

**Architecture:** One change in `KLNGPSSatComputer.wrapReachability` (`kln90b/Gps.ts`): a lost satellite's
`updateState` runs the SDK's unforced path (`forceAcquireAndUse` false). The forced update passes a delta time of 0, so
the unforced `None` branch neither acquires nor times out. Comments and characterization tests that state the old
`Unreachable` marking are updated.

**Tech Stack:** TypeScript, `@microsoft/msfs-sdk` (`GPSSatComputer`, `GPSSatellite`), Vitest (render stage, happy-dom).

**Spec:** `docs/superpowers/specs/2026-11-08-forced-acquisition-lost-satellites-design.md`

## Global Constraints

- `target: es2017`; the wrapper allocates nothing per call (tick cost, CLAUDE.md).
- FAST (#468) and the reachable satellites' forced `DataCollected` are not changed.
- One commit for the fix, its tests and its doc changes: `fixes #469 …` (CLAUDE.md, one commit per issue).
- American English; no counts for things that grow in comments or docs.

## Review Focus

- STA 1 right after an engine-running start inside a jammer: every channel shows a searched row, none the
  `Unreachable` glyph (`Sta1Page.tsx:245`). Pinned in Task 1, Step 1 (third test).
- A partial loss at the forced acquisition (10 dB rise): the lost low satellites stay `None` in their channels while the
  high ones are acquired. Pinned by the updated `SatelliteReachability.test.ts` test (Task 1, Step 1).
- A forced acquisition the SDK delays until its satellites are loaded runs through the same wrapper: no `Unreachable`
  there either. Pinned by the updated test at `SatelliteReachability.test.ts:333`.
- The control: an engine-running start without loss still acquires at once (existing test at
  `SatelliteReachability.test.ts:142`, unchanged).
- A satellite lost in a later calculation tick is unaffected: the unforced path is what it ran already (existing #467
  tests in `SatelliteReachability.test.ts`).

---

### Task 1: The unforced path for a lost satellite in the forced update

**Files:**
- Modify: `kln90b/Gps.ts:130-181` (`acquireAndUseSatellites` doc, `wrapReachability`), `kln90b/Gps.ts:897-900`
  (`startFast` doc)
- Test: `test/render/failures/GpsJamming.test.ts:459-509`, `test/render/SatelliteReachability.test.ts:91-139, 331-350`
- Comments only: `test/render/pages/left/Set10Page.test.ts:57, 65`

**Interfaces:**
- Consumes: `KLNGPSSatComputer.wrapReachability(isLost: (prn: number) => boolean): void`, unchanged signature.
- Produces: nothing new.

- [ ] **Step 1: Turn the pins and characterizations into the new behavior**

`GpsJamming.test.ts:492`: `it.fails(...)` → `it(...)`, name without the `(#469)` pin suffix (keep `#469` in the comment
above it, rewritten to state the behavior: the lost satellites stay searched in their channels, so the fix returns after
`IDLE_ACQUISITION` plus TRAN). The body and bound stay as they are.

`GpsJamming.test.ts:462` ("an engine-running start inside a stored jammer's effect acquires nothing"): update the
comment at 460 (no longer "makes a lost satellite Unreachable"); in the spy, also record per forced acquisition the
satellites that are `Unreachable` and the channel states; add:

```ts
expect(atForcedUnreachable).toEqual([[]]); // A lost satellite is searched, never Unreachable (#469)
```

and, after the first `afterCalcTick`, with STA 1 selected (already selected at the top):

```ts
const rows = await satelliteRows(unit);
expect(rows.map(prnOf)).toEqual(inChannels(unit));
expect(rows).toEqual(rows.map(r => searchedRow(unit, prnOf(r))));
```

(the same helpers the jammed-in-flight test above uses at 453-455).

`SatelliteReachability.test.ts:93` (26 dB rise): the comment says the lost satellites stay searched in their channels;
replace `unreachable: …length` with the channel states and assert:

```ts
expect(atForced[0].unreachable).toEqual([]);              // PRNs now, not a count
expect(atForced[0].inChannel.length).toBeGreaterThan(0);  // The channels were given from the geometry
expect(atForced[0].inChannel.filter(s => s !== GPSSatelliteState.None)).toEqual([]);
```

`SatelliteReachability.test.ts:138` (10 dB): `weakInChannel.filter(s => s.state !== GPSSatelliteState.None)` →
`toEqual([])`, and add `expect(sats.filter(s => s.state === GPSSatelliteState.Unreachable)).toEqual([])`.

`SatelliteReachability.test.ts:348` (delayed forced acquisition, every satellite lost):
`expect(states.filter(s => s === GPSSatelliteState.Unreachable)).toEqual([])`, plus
`expect(gps.gpsSatComputer.getChannels().filter(c => c !== null).length).toBeGreaterThan(0)` and every channel's state
`None`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project render test/render/failures/GpsJamming.test.ts test/render/SatelliteReachability.test.ts`
Expected: the #469 test fails (`secondsToFix` about 242 > bound); the `Unreachable` assertions fail with the lost PRNs
listed; the rest passes.

- [ ] **Step 3: Implement in `wrapReachability`**

In the lost branch, call `original.call(this, simTime, deltaTime, distanceFromLastKnownPos, false)` inside the existing
strength-0 window. Rewrite the doc comment: a lost satellite runs the SDK's unforced update, also in a forced update,
where the delta time of 0 leaves a searched satellite `None` in its channel (#469); cite `GPSSat.ts`
`updateStateTracked`. Update `acquireAndUseSatellites`' doc (drop "The forced path makes a lost satellite Unreachable";
say a lost satellite stays searched in its channel) and `startFast`'s doc (FAST forces nothing because it runs the
normal search from the true state, the same receiver as REAL, not because of `Unreachable`). Same for the comments in
`Set10Page.test.ts:57, 65`.

- [ ] **Step 4: Run them and see them pass**

Run: the command of Step 2. Expected: all pass.

- [ ] **Step 5: The whole suite and the checks**

Run: `npx tsc --noEmit`, `npm test`, `npm run build`.
Expected: tsc clean, every test green (no new `it.fails` passing unexpectedly), build with only the known warnings.
`grep -rn "Unreachable" kln90b/Gps.ts test/` shows no remaining claim that the forced path marks a lost satellite.

- [ ] **Step 6: Commit**

```bash
git add kln90b/Gps.ts test/render/failures/GpsJamming.test.ts test/render/SatelliteReachability.test.ts test/render/pages/left/Set10Page.test.ts
git commit -m "fixes #469 a forced acquisition keeps a lost satellite searched in its channel instead of Unreachable"
```
