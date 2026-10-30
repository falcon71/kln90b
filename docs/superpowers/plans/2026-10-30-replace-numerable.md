# Replace numerable (#447) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix #448, then replace every `format()` from `numerable` with two handwritten functions and drop the
dependency, proven faster by a throwaway before/after benchmark.

**Architecture:** `kln90b/data/NumberFormat.ts` exports `padInt` and `padFixed`. Every call site is rewritten to them,
or to plain `String()`/`padStart` where it already rounds. Signed persistence fields put their own sign in front. A
benchmark in the session scratchpad replays the call sites' patterns on recorded values against numerable before any
change, and against the new code after it, and compares both outputs.

**Tech Stack:** TypeScript (es2017 target), Vitest (unit, render), Node 26 (runs `.ts` with type stripping) for the
benchmark.

**Spec:** `docs/superpowers/specs/2026-10-30-replace-numerable-design.md`

## Global Constraints

- Same output as numerable for every value the unit actually passes. NaN, null, Infinity and a forced `+` on a value
  that rounds to zero but is not zero need not match.
- The V1/V2 user waypoint strings stay byte-identical for real inputs (public contract, CLAUDE.md). One exception is
  deliberate: see Task 4.
- The benchmark and the differential check live in the scratchpad
  (`C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\c38eae6f-9d1d-421e-80b4-b0b877654640\scratchpad\bench447\`)
  and are never committed. The baseline runs **before** any #447 code change.
- Commits: one `fixes #448 ...` commit (Task 1), then one `fixes #447 ...` commit for everything else. Tasks 3 to 5 may
  make WIP commits on the branch for review. Task 5 squashes them with `git reset --soft` onto the #448 commit. Commit
  messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never `git push`. Branch: `447-replace-numerable`.
- Keep manual page references in comments that are touched; American English.

## Review Focus

- APT 4 comm frequencies on 25 kHz / 8.33 kHz channels (`128.075` → `128.08`): decimal halves that binary cannot hold
  must round up as numerable did. Pinned in Task 3.
- Negative values that round to zero: `padInt(-0.3, 2)` is `00` with no sign (temperature), while the persisted latitude
  −0.4° still writes `-00`. Pinned in Tasks 3 and 4.
- Carries at the rounding boundary (`9.96` → `10.0` for 1/1, `0.996` → `1.00`) and values wider than the padding
  (`1234` for 3 digits): no cut, no lost digit. Pinned in Task 3.
- Persistence records (lat/lon truncation, `-00001` altitude, zero coordinates, south of the equator by less than a
  degree): held by the existing literal tests in `test/unit/settings/UserWaypointV2.test.ts`, which must stay green
  unchanged.
- Fieldsets that cut the formatted string into digit cells (`substring` offsets in Fuel, Baro, Altitude, Fpm, Speed,
  Temp, Time, Vnav, Volume, Bearing fieldsets): the string length and layout must not move. Held by the render tests
  under `test/render/controls/selects/` and by the differential check.

---

### Task 1: Fix #448, CAL 4 / NAV 4 angle edits below 0.05°

**Files:**
- Modify: `kln90b/controls/selects/VnavFieldsets.tsx` (`saveAngle1`, `saveAngle01`, about lines 118-126)
- Test: `test/render/controls/selects/VnavFieldsets.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Write the failing tests** in the `VNAV angle fieldset` describe, using the file's `onAngle` helper.
  The setup is CAL 4 at GS 300 kt and FPM 10, where atan(10 / 30380) ≈ 0.019° shows `ANGLE: 0.0°`.

```ts
// #448: an angle that is not 0 but shows 0.0 (CAL 4 at 300 kt and 10 ft/min, 0.019 degrees) takes a digit edit
// like any other angle (5-12)
it('takes 3.0 from the units digit of an angle that shows 0.0 (#448)', async () => {
    const unit = await onAngle({cal4GS: 300, cal4Fpm: 10, cal4Angle: 0.019});
    expect(Screen.read().rows('L')[4]).toBe('ANGLE: 0.0°');
    await unit.panel.inner('L', 3);
    await vi.advanceTimersByTimeAsync(1000);

    expect(storedSetting(unit, 'cal4Angle')).toBe(3);
    expect(Screen.read().rows('L')[4]).toBe('ANGLE: 3.0°');
});

it('takes 0.3 from the tenths digit of an angle that shows 0.0 (#448)', async () => {
    const unit = await onAngle({cal4GS: 300, cal4Fpm: 10, cal4Angle: 0.019});
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 3);
    await vi.advanceTimersByTimeAsync(1000);

    expect(storedSetting(unit, 'cal4Angle')).toBe(0.3);
    expect(Screen.read().rows('L')[4]).toBe('ANGLE: 0.3°');
});
```

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx vitest run --project render test/render/controls/selects/VnavFieldsets.test.ts`
  Expected: both new tests FAIL. The first gets 30 and `-.-`, the second gets 0.03 and `0.0`. Every other test passes.

- [ ] **Step 3: Fix `saveAngle1`/`saveAngle01`.** Build the new angle arithmetically, without `format`. The sign is
  `this.angle < 0 ? -1 : 1` (a null angle counts as 0). The current tenths are `Math.round(Math.abs(angle) * 10)`,
  split into units and tenths. Replace the edited digit and `save(sign * (units * 10 + tenths) / 10)`. Add a comment
  that cites #448.

- [ ] **Step 4: Run the file, then the whole suite.**
  Run: `npx vitest run --project render test/render/controls/selects/VnavFieldsets.test.ts`, then `npm test`
  and `npx tsc --noEmit`.
  Expected: all PASS, tsc clean.

- [ ] **Step 5: Commit** the test and the fix:
  `fixes #448 an angle below 0.05 degrees on CAL 4 and NAV 4 takes a digit edit as 3.0 or 0.3 instead of 30 or 0.03`

### Task 2: Baseline benchmark and golden outputs (throwaway, before any #447 change)

**Files (scratchpad `bench447\`, never in the repo):**
- Create: `bench447/workload.mjs`: the entries and a seeded generator
- Create: `bench447/bench.mjs`: the runner, `node bench.mjs before|after`
- Output: `bench447/golden.json` (values plus numerable outputs) and `bench447/before.txt`

**Interfaces:**
- Produces: `golden.json` = `{[entry: string]: {values: number[], outputs: string[]}}`, and a `bench.mjs` whose
  `after` mode Task 5 fills in with the same entry names.

- [ ] **Step 1: Write `workload.mjs`.** It has one entry per (pattern, options, value range) the call sites use. Each
  entry has a name, a numerable call `v => format(v, pattern, options)` and 2,000 values from a seeded PRNG
  (mulberry32, fixed seed) plus the grid values listed. Load numerable from
  `E:/msfs/kln90b/node_modules/numerable` through `createRequire`. Entries:

| Entry | Pattern / options | Values |
|---|---|---|
| bearing | `000` | integers 0-359 |
| int2 | `00` | integers 0-59 |
| int2Cont | `00` | continuous 0-99.4 |
| int0 | `0` | continuous 0-99999 |
| int4 | `0000` | integers 0-9999, continuous 700-1099 |
| int5 | `00000` | integers 0-99999 |
| fix1 | `0.0` | continuous 0-9.94, and every tenth 0.0-9.9 |
| fix1w2 | `00.0` | continuous 0-99.94 |
| fix1w3 | `000.0` | continuous 0-999.9, and every tenth 0-359.9 |
| fix1w4 | `0000.0` | NDB 190.0-1750.0 in 0.5 steps |
| fix1w5 | `00000.0` | continuous 0-99999.9 |
| fix2 | `0.00` | continuous 0-0.999, and every hundredth 0.00-0.99 |
| fix2w2 | `00.00` | continuous 0-59.999; baro 22.00-30.99 in 0.01 steps |
| fix2w3 | `000.00` | every 5 kHz channel 118.000-136.990; VOR 108.00-117.95 in 0.05 steps |
| temp | `-00` | continuous −60 to +50 |
| lat | `+00` truncate, zeroFormat `+00`, signedZero | continuous −89.99 to 89.99; 0; −0.4; 0.4 |
| lon | `+000` same options | continuous −179.99 to 179.99; 0; −0.4 |
| tz | `+00` same options | −12 to 14 in 0.25 steps |
| alt | `+00000`, zeroFormat `+00000` | integers −1 to 15000 |
| rwy | `+00000`, zeroFormat `+00000` | feet = continuous meters 1-5000 × 3.28084 |
| vorFreq | `+000.00` | VOR 108.00-117.95 in 0.05 steps |
| magvar | `+00` | integers −30 to 30 |
| ndbFreq | `+0000.0` | NDB 190.0-1750.0 in 0.5 steps |

- [ ] **Step 2: Write `bench.mjs`.** The `before` mode writes `golden.json`, then times each entry. Warm up for 200
  rounds over all values, then measure 20 runs of 200 rounds with `process.hrtime.bigint()`. Report the median
  ns/call per entry and for the whole mix, and keep a running sink of the outputs' lengths so V8 cannot drop the
  calls. The `after` mode stays a stub until Task 5.

- [ ] **Step 3: Run the baseline.** Run: `node bench.mjs before > before.txt` in `bench447`.
  Expected: `golden.json` exists with every entry, and `before.txt` lists ns/call per entry plus the total.

- [ ] **Step 4: Confirm the repo is untouched.** `git status` shows nothing from the benchmark.

### Task 3: `NumberFormat.ts` and its unit test

**Files:**
- Create: `kln90b/data/NumberFormat.ts`
- Test: `test/unit/data/NumberFormat.test.ts`

**Interfaces:**
- Produces:
  - `padInt(value: number, digits: number): string`: rounded to an integer, halves away from zero. The magnitude
    is padded with `0` to `digits`, and `-` goes in front of a negative result that is not 0. Wider values are not
    cut.
  - `padFixed(value: number, intDigits: number, decimals: number): string`: the same with `decimals` places
    after a `.`.

- [ ] **Step 1: Write the failing test** with literal expectations. Each line is one `expect`, grouped into `it`s
  named after the rule they hold:

```ts
// padInt
expect(padInt(7, 3)).toBe('007');        expect(padInt(0, 2)).toBe('00');
expect(padInt(2.5, 1)).toBe('3');        expect(padInt(-2.5, 1)).toBe('-3');     // halves away from zero
expect(padInt(-5, 2)).toBe('-05');       expect(padInt(-0.3, 2)).toBe('00');     // no sign on a rounded zero
expect(padInt(1234, 3)).toBe('1234');    expect(padInt(359.4, 3)).toBe('359');
// padFixed
expect(padFixed(0.25, 1, 2)).toBe('0.25'); expect(padFixed(9.96, 1, 1)).toBe('10.0');  // carry
expect(padFixed(0.996, 1, 2)).toBe('1.00'); expect(padFixed(1.45, 1, 1)).toBe('1.5');
expect(padFixed(1.005, 1, 2)).toBe('1.01'); expect(padFixed(128.075, 3, 2)).toBe('128.08'); // decimal halves (APT 4)
expect(padFixed(128.015, 3, 2)).toBe('128.02'); expect(padFixed(29.92, 2, 2)).toBe('29.92');
expect(padFixed(3.5, 4, 1)).toBe('0003.5'); expect(padFixed(-1.25, 1, 1)).toBe('-1.3');
expect(padFixed(-0.04, 1, 1)).toBe('0.0'); expect(padFixed(12345.6, 2, 1)).toBe('12345.6');
```

- [ ] **Step 2: Run it.** Run: `npx vitest run --project unit test/unit/data/NumberFormat.test.ts`
  Expected: FAIL, the module does not exist.

- [ ] **Step 3: Implement both functions** in `kln90b/data/NumberFormat.ts`. The rounding is the one part the tests
  do not fully determine, so use exactly this:
  `const scaled = Math.round(Math.abs(value) * 10 ** decimals * (1 + 2 * Number.EPSILON))`. Split it into an
  integer part and a fraction with integer arithmetic, and pad with `padStart`. No allocation beyond the result
  strings. JSDoc says what the functions are for, and that the rounding nudge exists for decimal halves such as the
  APT 4 comm channels (3-45).

- [ ] **Step 4: Run it.** Same command. Expected: PASS. Then `npx tsc --noEmit` is clean.

- [ ] **Step 5: WIP commit** of the module and the test.

### Task 4: Persistence and signed call sites

**Files:**
- Modify: `kln90b/settings/UserWaypointPersistor.ts` (lines 109-173), `kln90b/pages/right/Apt2Page.tsx`
  (`formatTimezoneOffset`), `kln90b/controls/displays/TemperatureDisplay.tsx`,
  `kln90b/controls/selects/VnavFieldsets.tsx` (the remaining `format` in `setValue`)
- Test: `test/unit/settings/UserWaypointV2.test.ts`

**Interfaces:** consumes `padInt`, `padFixed` (Task 3).

- [ ] **Step 1: Write the test for the one deliberate change.** numerable wrote a user VOR's magnetic variation of
  exactly 0 as `00`, because `+00` had no `zeroFormat`. Both forms load as 0, since the V1 and V2 loaders read the
  field with `Number()`. The new code writes `+00`, the same width as every other variation. Add this next to the
  existing VOR tests, modeled on `serializes and restores a negative magnetic variation of a VOR`:
  `serializes a magnetic variation of 0 as +00 and restores it as 0`, which expects the slot
  `'VXX        ABC     +4730.00+00854.00+108.00+00'` and a restored `magneticVariation` of `0`.

- [ ] **Step 2: Run it.** Run: `npx vitest run --project unit test/unit/settings/UserWaypointV2.test.ts`.
  Expected: the new test FAILS (slot ends in `00`), and every other test passes.

- [ ] **Step 3: Rewrite the signed callers.** The sign is `value < 0 ? "-" : "+"` on the raw value, followed by the
  magnitude.
  - lat/lon and the APT 2 time zone: `padInt(Math.trunc(Math.abs(v)), 2 or 3)`. With the raw-value sign, −0.4°
    keeps `-00`.
  - Altitude and runway length: `padInt(Math.abs(v), 5)`.
  - Minutes: `padFixed(minutes, 2, 2)`. Frequencies: `padFixed(f, 3, 2)` and `padFixed(f, 4, 1)`.
  - Magvar: `padInt(Math.abs(v), 2)`.
  - `TemperatureDisplay`: `padInt(t, 2).padStart(3, " ")`.
  - `VnavAngleFieldset.setValue`: `padFixed(tenths / 10, 1, 1)`.
  - Remove the `numerable` imports from these files.

- [ ] **Step 4: Run.** Run: `npx vitest run --project unit test/unit/settings`, then
  `npx vitest run --project render test/render/controls/selects/VnavFieldsets.test.ts`.
  Expected: all PASS, with the existing literal slot strings unchanged.

- [ ] **Step 5: WIP commit.**

### Task 5: All other call sites, dependency removal, docs, after-benchmark

**Files:**
- Modify: every remaining file `grep -rln 'from "numerable"' kln90b` lists (displays, editors, fieldsets, pages,
  `PersistentMessages.ts`, `Vnav.ts`, `SidStar.ts`, `UniqueIdentGenerator.ts`, `StatusLine.tsx`, `SuperNav5Left.tsx`,
  `AirportCoordOrNearestView.tsx`)
- Modify: `package.json`, `package-lock.json` (`npm uninstall numerable`), `CLAUDE.md` (Conventions: "Fixed-width
  output uses `padInt`/`padFixed` from `data/NumberFormat.ts` plus `padStart`/`padEnd`"), `docs/architecture.md`
  (the formatting-helpers line)
- Scratchpad: `bench447/bench.mjs` `after` mode

**Interfaces:** consumes `padInt`, `padFixed`.

- [ ] **Step 1: Rewrite the call sites.** `format(v, "0…0")` with n zeros becomes `padInt(v, n)`, and
  `format(v, "0…0.0…0")` becomes `padFixed(v, i, d)`. Where the value is already a rounded integer and the pattern is
  `"0"` (`SpeedDisplay`, `RoundedDistanceDisplay`, `FuelDisplay`, `Oth5Page`, the APT 4 kHz form), use `String(v)`.
  Where a site rounds only to feed the formatter, simplify it, but leave the range checks and the null/NaN guards in
  place. `format(v, "0.00").substring(1)` stays a substring of `padFixed(v, 1, 2)`. Keep every `padStart`/`padEnd`
  and every substring offset.

- [ ] **Step 2: Confirm nothing imports numerable.** Run: `grep -rn numerable kln90b test`. Expected: no output.

- [ ] **Step 3: Full check.** Run: `npx tsc --noEmit`, `npm test`, `npm run build`. Expected: tsc clean, all tests
  PASS, and the build has no new circular-dependency warnings (compare the count with master).

- [ ] **Step 4: Write the `after` mode** of `bench.mjs`. Import `E:/msfs/kln90b/kln90b/data/NumberFormat.ts`, which
  Node 26 strips. Give each entry the expression its call site now uses (for example lat:
  `v => (v < 0 ? "-" : "+") + padInt(Math.trunc(Math.abs(v)), 2)`). Run it over `golden.json`'s values and compare
  each output with the golden one. Any mismatch prints the entry, value, old and new output. The one expected
  mismatch is `magvar` at 0 (`00` → `+00`, Task 4). Then time it the same way as `before`.

- [ ] **Step 5: Run before and after back to back** while numerable is still installed:
  `node bench.mjs before > before2.txt; node bench.mjs after > after.txt`.
  Expected: no mismatch except `magvar` 0, and `after` faster per call in every entry and in total. Report the table
  (entry, numerable ns/call, new ns/call, factor).

- [ ] **Step 6: Remove the dependency.** Run `npm uninstall numerable`, then `npm test` and `npm run build` again.
  Expected: PASS. `package-lock.json` no longer lists numerable.

- [ ] **Step 7: Update the docs** (CLAUDE.md, `docs/architecture.md`). Leave the dated plans in
  `docs/superpowers/plans/` alone.

- [ ] **Step 8: Squash and commit.** Run `git reset --soft <the #448 commit>`, then commit everything as
  `fixes #447 replace numerable with padInt and padFixed`, with the benchmark table in the body. `git status` must
  show nothing from `bench447`.
