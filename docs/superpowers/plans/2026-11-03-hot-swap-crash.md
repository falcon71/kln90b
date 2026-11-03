# The hot-swap crash of the GPS SimVars' null state (#462) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write the null state of the GPS SimVars at every power change without the `WP COUNT` 0 / `WP INDEX` 1 pair that crashes MSFS 2024 at a hot swap.

**Architecture:** A guard in `SensorsOut.setWPIndex` keeps the written index at or below the count for every caller. `SensorsOut.reset()` calls the null setters again (the old commented-out list, with today's signatures, without the `K:GPS_OBS` event, plus `GPS WP CROSS TRK` 0). Docs carry the cause and the sim evidence.

**Tech Stack:** TypeScript on `@microsoft/msfs-sdk`, Vitest render stage (`test/render/`, happy-dom, the `FakeSim` write log).

**Spec:** `docs/superpowers/specs/2026-11-03-hot-swap-crash-design.md`

## Global Constraints

- One commit for the whole fix, message `fixes #462 <description>`, with its tests and docs in it (CLAUDE.md, "One commit per issue"). Tasks 1 to 4 do not commit; Task 5 does, after the sim check, so that its result is in the same commit.
- Normal operation unchanged: the existing suite stays green except the one test that pins the old behavior (Task 1 replaces it).
- The gate of `reset()` stays: nothing is written with `Output.WriteGPSSimVars` off or while `hardware.isDisabled`.
- No `K:GPS_OBS_ON`/`K:GPS_OBS_OFF` from the null state; the mode's null state is `GPS IS APPROACH ACTIVE` false and `GPS APPROACH MODE` 0.
- Manual references are cited by page (CMM 64-65); never copy manual text. American English. No counts of growing collections in prose.
- `target: es2017`; no `globalThis` in instrument code.

## Review Focus

- A power-off while disabled for hot swapping (aircraft power lost): no GPS SimVar may be written, not even `GPS OVERRIDDEN` (#350). Pinned in Task 1, step 1.
- A power-on after another GPS wrote the SimVars while the KLN was off: the KLN's power-on overwrites them with its null state before its first tick. Pinned in Task 1, step 1 (`overwrites a value another writer left`).
- A Direct To the last waypoint, then a power cycle: the index never exceeds the count in any write. Pinned in Task 1, step 1 (the invariant test).
- `Output.WriteGPSSimVars` off and a power cycle: no GPS SimVar written. Pinned in Task 1, step 1.
- The 16 Hz signal tick after power-on must not resurrect the old deviation: covered by the existing `GPS WP CROSS TRK after a power cycle (#158)` test.

---

### Task 1: The guard and the null state in `reset()`

**Files:**
- Modify: `kln90b/Sensors.ts` (`setWPIndex`, `reset`, the doc comment of `setPoweredOff`)
- Test: `test/render/SensorsOut.test.ts` (describe `outputs at power-off (public contract)` and a new describe)

**Interfaces:**
- Produces: `SensorsOut.setWPIndex(index: number, countTotal: number): void`, unchanged signature; writes `GPS FLIGHT PLAN WP INDEX` = `min(index + 1, countTotal)`, never below 0. `SensorsOut.reset(): void` writes the null state. #458 will reuse the same setters for a failed port.

- [ ] **Step 1: Write the failing tests**

In `describe('outputs at power-off (public contract)')`, replace `leaves the GPS SimVars alone: only GPS OVERRIDDEN is asserted again` with:

```ts
it('writes the null state of the GPS SimVars (#462)', async () => {
    const unit = await banking();
    const sim = unit.env.sim;
    expect(sim.get('GPS WP DISTANCE', 'meters')).toBeGreaterThan(0); // Preconditions: live values
    expect(sim.get('GPS FLIGHT PLAN WP COUNT', 'number')).toBe(3);
    expect(sim.get('GPS FLIGHT PLAN WP INDEX', 'number')).toBe(2);
    expect(sim.get('GPS WP CROSS TRK', 'nautical miles')).not.toBe(0);

    unit.send('KLN90B_Power_Off');
    await vi.advanceTimersByTimeAsync(3000);

    for (const [name, u] of [['GPS POSITION LAT', 'degrees'], ['GPS POSITION LON', 'degrees'], ['GPS GROUND SPEED', 'knots'],
        ['GPS WP DISTANCE', 'meters'], ['GPS WP DESIRED TRACK', 'radians'], ['GPS WP CROSS TRK', 'meters'],
        ['GPS IS ACTIVE WAY POINT', 'bool'], ['GPS IS ACTIVE FLIGHT PLAN', 'bool'], ['GPS WP NEXT LAT', 'degrees'],
        ['GPS WP PREV VALID', 'bool'], ['GPS WP ETE', 'seconds'], ['GPS COURSE TO STEER', 'number'],
        ['GPS IS APPROACH ACTIVE', 'bool'], ['GPS APPROACH MODE', 'enum'],
        ['GPS FLIGHT PLAN WP COUNT', 'number'], ['GPS FLIGHT PLAN WP INDEX', 'number']]) {
        expect(sim.get(name, u), name).toBe(0);
    }
    expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
});

it('writes no GPS SimVar and no K:GPS_OBS event while the unit stays off (#462)', async () => {
    const unit = await banking();
    unit.send('KLN90B_Power_Off');
    await vi.advanceTimersByTimeAsync(1000);
    const written = unit.env.sim.writes.length;
    const keys = unit.env.sim.keyEvents.length;

    await vi.advanceTimersByTimeAsync(10_000);

    expect(gpsWritesSince(unit, written)).toEqual([]);
    expect(unit.env.sim.keyEvents.slice(keys).map(k => k.name)).toEqual([]);
});

it('sends no K:GPS_OBS event at the power-off (#462)', async () => {
    const unit = await banking();
    await untilCalcTick(unit);
    const keys = unit.env.sim.keyEvents.length;

    unit.send('KLN90B_Power_Off');
    await vi.advanceTimersByTimeAsync(3000);

    expect(unit.env.sim.keyEvents.slice(keys).map(k => k.name).filter(n => n.includes('GPS_OBS'))).toEqual([]);
});

it('overwrites a value another writer left, at the power-on (#462)', async () => {
    const unit = await banking();
    unit.send('KLN90B_Power_Off');
    await vi.advanceTimersByTimeAsync(3000);
    unit.env.sim.set('GPS POSITION LAT', 'degrees', 12);
    unit.env.sim.set('GPS FLIGHT PLAN WP INDEX', 'number', 1);

    unit.send('KLN90B_Power_On');
    await vi.advanceTimersByTimeAsync(100); // before the first calculation tick

    expect(unit.env.sim.get('GPS POSITION LAT', 'degrees')).toBe(0);
    expect(unit.env.sim.get('GPS FLIGHT PLAN WP INDEX', 'number')).toBe(0);
});

it('writes the live GPS SimVars again after the power-on (#462)', async () => {
    const unit = await banking();
    unit.send('KLN90B_Power_Off');
    await vi.advanceTimersByTimeAsync(3000);
    unit.send('KLN90B_Power_On');
    await unit.panel.approveSelfTest();
    await settle(unit);

    expect(unit.env.sim.get('GPS WP DISTANCE', 'meters')).toBeGreaterThan(0);
    expect(unit.env.sim.get('GPS FLIGHT PLAN WP COUNT', 'number')).toBe(3);
});
```

Add to `zeroes the outputs of a unit that is switched off while it is disabled for hot swapping`: snapshot `written` before the circuit goes off, then `expect(gpsWritesSince(unit, written)).toEqual([])`.

Add, next to `writes the zero state also with Output.WriteGPSSimVars off`: `writes no GPS SimVar at a power cycle with Output.WriteGPSSimVars off (#462)`: boot with `NO_GPS_SIMVARS`, snapshot, power off 3 s, power on 2 s, `gpsWritesSince` is `[]`.

New describe `GPS FLIGHT PLAN WP INDEX never exceeds the count (#462)`:
- `setWPIndex keeps the index within the count`: on `bootUnit()`, call `unit.props.sensors.out.setWPIndex(i, n)` and read back the INDEX for `(0, 0)` → 0, `(-1, 0)` → 0, `(-1, 3)` → 0, `(0, 3)` → 1, `(2, 3)` → 3, `(3, 3)` → 3. Advance 0 ms between call and read is fine (the fake applies writes at once).
- `holds in every write through a Direct To the last waypoint and a power cycle`: `bootOnStandardRoute({magvar: 0})`, `unit.panel.directTo('KBBB')`, 3 s, power off 3 s, power on, `approveSelfTest`, `settle`. Walk `unit.env.sim.writes` in order, keep the last `GPS FLIGHT PLAN WP COUNT` value, and at every `GPS FLIGHT PLAN WP INDEX` write assert value ≤ that count; also assert at least one INDEX write equals 3 (the Direct To was written).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/render/SensorsOut.test.ts`
Expected: FAIL on `writes the null state…` (values live), `overwrites a value…` (12), `setWPIndex keeps…` (`(0, 0)` gives 1). The disabled, `WriteGPSSimVars` off, no-writes-while-off, K-event and invariant tests may already pass; they pin what must not change.

- [ ] **Step 3: Implement**

- `setWPIndex`: write `Math.max(0, Math.min(index + 1, countTotal))`. The comment above it says: the index is 1-based (index = count with the last waypoint active is safe), and an index above 0 with a count of 0 crashes MSFS 2024 when another GPS unit takes over in a hot swap (#462, sim tests 2026-11-03); so the index never exceeds the count.
- `reset()`: after `setGpsOverriden()`, call `setXTK(null, 5)`, write `GPS WP CROSS TRK` 0 through `this.interconnect.gps(this.interconnect.analogNav)` (only the 16 Hz signal tick writes it, and that stops at power-off; unpowered, the D-bar pin drops to 0 V at once, our reading of CMM 64-65, guess), `setObs(null)`, `setDesiredTrack(null, null, 0)`, `setWpBearing(null, null, 0)`, `setDistance(null)`, `setWPTETE(null, null)`, `setDestETE(null, null)`, `setPos(null, null, null, 0, false)`, `setWPIndex(-1, 0)`, `setPrevWpt(null)`, `setNextWpt(null)`, `setRollCommand(null, null)`, and write `GPS IS APPROACH ACTIVE` false (nav data port) and `GPS APPROACH MODE` 0 (approach lamps) directly instead of `setMode`, which would send `K:GPS_OBS_OFF`. Replace the old CTD comment by the cause and the evidence in a few lines (cases A to D of the spec, the FS2020 guesses that turned out wrong, the decision not to send `K:GPS_OBS_*`).
- `setPoweredOff` doc comment: the GPS SimVars get their null state in `reset()` (#462).

`setPos(…, false)` and `setRollCommand(null, null)` also write `L:KLN90B_IntegrityWarn` false and `L:KLN90B_RollCommand` 0 at power-on; the next tick writes the real values, and `setPoweredOff` writes the same at power-off, so this is harmless. `setXTK(null, 5)` writes `L:KLN90B_XTK` 0 likewise.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/render/SensorsOut.test.ts test/render/SensorsOutSimVars.test.ts test/render/Interconnect.test.ts test/render/SimVarSync.test.ts`
Expected: PASS.

### Task 2: The docs

**Files:**
- Modify: `docs/failures.md` (sections "A failed port in general", "Testing")
- Modify: `docs/sim-flight-record.md` (a new dated block; a trap in "Traps found")

- [ ] **Step 1: `docs/failures.md`**

In "A failed port in general": the null state of a port's GPS SimVars is what `SensorsOut.reset` writes at every power change (#462), limited to the port; it includes the guard (no index above the count), no `K:GPS_OBS` event, and `GPS WP CROSS TRK` 0. Remove "The power-off path stays as it is…". Replace the "hot-swap crash" bullet by: the cause (index above 0 with count 0, #462), that it is fixed in `setWPIndex` for every caller, and that the synthetic test ran on 2026-11-03 (link to the record). Add the observations #458 needs: a failed analog nav port drops the Duke's default autopilot from NAV to HDG and it stays in HDG after the repair; failed ARINC 429 nav data alone leaves it in NAV; with `GPS IS ACTIVE WAY POINT` false the sim reports `GPS WP DISTANCE` 0. In "Testing", the sim line becomes: a sim check of #458's failed ports with a hot swap to another GPS unit, before release.

- [ ] **Step 2: `docs/sim-flight-record.md`**

A block `**2026-11-03** (the #458 zeroing test and the #462 bisection: Turbine Duke, KTTS, GNS hot swap; a throwaway build whose console fails an output port, the debugger writing single SimVars)` with: flight 1 on the ground (each port's SimVars zero after about 1 s and stay; `WriteGPSSimVars` off writes none and the sim's own GPS takes over), the power cycle, the in-flight autopilot behavior, flight 2 (the Duke sets `L:KLN90B_Disabled` before the KLN powers on at load; swaps alone do not crash), and cases A to D with their pairs and results. Under "Traps found": the sim ignores the unit of a write to these GPS SimVars (a distance in nautical miles lands as meters, a magvar in degrees as radians), so a debugger write uses the SimVar's own unit; a value read back in the same evaluation as the write is the old one; `GPS WP NEXT ID`/`PREV ID` read back empty.

### Task 3: Verify and commit

- [ ] **Step 1:** `npx tsc --noEmit` → no output.
- [ ] **Step 2:** `npm test` → all green.
- [ ] **Step 3:** `npm run build` → completes; the usual circular-dependency and Sass warnings only.
- [ ] **Step 4:** Mutation check (CLAUDE.md): with the guard removed from `setWPIndex`, the `setWPIndex keeps…` and `overwrites a value…` tests fail; with `setMode(NavMode.ENR_LEG, …)` in place of the direct writes, the K-event test fails; with the `GPS WP CROSS TRK` write removed, `writes the null state…` fails. Restore; `git diff` shows only the intended change.
### Task 4: Sim check (the maintainer)

- [ ] Build the verified tree into the community folder (`buildTargetDir`), after asking.
- [ ] The maintainer loads the Duke, waits for a fix, switches the KLN off (the null state is written), then swaps to the GNS. Before the swap, read back `GPS FLIGHT PLAN WP COUNT`/`INDEX` (0/0) with the `sim-debugger` skill. Expected: no crash. Then swap back and switch the KLN on: live values return.
- [ ] Add the result to the 2026-11-03 block of `docs/sim-flight-record.md`.

### Task 5: Commit

```bash
git add kln90b/Sensors.ts test/render/SensorsOut.test.ts docs/failures.md docs/sim-flight-record.md
git commit -m "fixes #462 write the null state of the GPS SimVars at a power change, never an index above the count"
```
