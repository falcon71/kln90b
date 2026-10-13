# Number Formatting, Radials and Editors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the milestone-7 issues #223, #337, #263, #361, #340, #230, #304, #245, #282, #302, #341, #287, #280, #339, #362, #363 and #365 of the KLN 90B simulator, one commit per issue.

**Architecture:** Three shared helpers carry most fixes: (A) leading zeros blank while an editor's edit is closed
(`Editor.setLeadingZeroCells`), (B) round, then wrap at north (`roundBearing` in `data/Coordinates.ts`), and (C) the
variation of a reference (`KLNMagvar.getReferenceMagvar`). An editor idle text (`Editor.idleText`) shows a whole
distance of 1000 NM and more and a database NDB on a whole kHz. The rest are local changes at the sites the spec names.

**Tech Stack:** TypeScript (target es2017), MSFS Avionics Framework (`@microsoft/msfs-sdk`, FSComponent JSX), Vitest
(stages unit, render, flight; render runs on happy-dom with the headless unit of `test/harness`).

**Spec:** `docs/superpowers/specs/2026-10-12-number-formatting-design.md` (read it before any task; it holds the
evidence, the trainer results and the reasons).

## Global Constraints

- **Branches.** The integration branch is `milestone-7-number-formatting`. Each lane (below) works in its own worktree
  on its own branch made from the integration branch at the lane's start; the controller merges a finished lane back.
  Never push. Never commit on `master`.
- **One commit per issue**, with its tests and doc changes in the same commit, in the order of this plan. The subject
  is `fixes #NN <description>` (a plain sentence, American English); the message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Write commit messages without a BOM (Bash heredoc or
  `-m`). A commit that also turns a pin of another issue into a passing test says `references #NN` for it in the body.
- **Before every commit:** `npx tsc --noEmit` is clean and the WHOLE suite `npm test` is green (about one minute). Not
  only the task's files. Every test whose result changes must be one the task names; any other change is a finding to
  report before committing (it may be a test that used the bug as its vehicle).
- **Pins:** a fixed bug's `it.fails(...)` becomes `it(...)`; the issue number stays in the name. Rewrite its comment so
  it describes the fixed behavior and its evidence, not the old bug ("The code rounds 359.5 up to 360" goes).
- **Test labels (docs/testing.md section 5):** a test's name cites what supports its assertion: a Pilot's Guide page
  (`3-18`), a dated trainer check (`checked in the KLN 89 trainer, 2026-10-12`), or it says `characterization`. A
  citation supports only what that page or that trainer entry literally says. The trainer's field layouts are the 89's;
  nothing about the 90B-only pages (Super NAV 5, CTR, OTH 6 efficiency) or about the 90B's cell layout comes from it.
  Analogies are characterizations. Never mix: a characterization carries no page number. Report, per new or changed
  `describe`/`it`, its title and whether it is spec or characterization.
- **Copyright:** the Pilot's Guide is copyrighted. Cite page numbers and paraphrase in your own words; never copy
  manual text (no run of more than a few words) into code, comments, docs, tests or commit messages.
- **Code style:** match the surrounding code (4-space indent, double quotes in `kln90b/`, single quotes in `test/`,
  `//` comments citing pages like `//3-18` or issues like `//#280`). `target: es2017`: no newer runtime features.
- **No counts in prose** for things that grow (tests, files, issues).
- **Do not fix other bugs on the side.** A new bug goes to a GitHub issue (the controller files it; report it).
- **Asserted literals are derived independently** (from the spec, the trainer record, a hand computation or the
  harness's own geometry `test/harness/flight/geo.ts`), never copied from the output of the code under test. The test
  code below gives the literals; harness calls may need small adaptations to the file's local helpers (read the
  sibling tests first). If a literal turns out wrong, report it with the derivation; do not silently change it.
- **Mutation check:** after the fix is green, break the fix once (revert its key line), confirm the new tests and the
  converted pins turn red, restore, and confirm `git diff` shows only the intended change. Report which tests went red.
- **Dated records stay.** The dated entries of `docs/testing.md` section 8 (2026-10-06 to 2026-10-12) are true on their
  date and are never edited. New trainer results go in as new bullets of the **2026-10-12** block (append at its end;
  when two lanes both append, the controller resolves the merge by keeping both bullets).
- **Worktrees:** the worktree has no `node_modules`; create a junction to the main checkout's
  (`New-Item -ItemType Junction -Path node_modules -Target E:\msfs\kln90b\node_modules` in PowerShell). Never delete
  through it; the controller removes the junction (`cmd //c rmdir node_modules`) before removing the worktree.
- **Reports:** write your report with the Bash tool (`cat > '<path>' <<'EOF'`) to `.task-report.md` at the root of
  your working tree (untracked, never committed); if that is refused, return it in full as text.

**User decisions (already made):**
- The design of the spec, sections 1 and 2, as approved by the maintainer on 2026-10-12.
- #223: round the total minutes, then split (the 90B's figures and the 89's CAL 1); the 89's NAV 1 truncation is
  recorded only.
- #304: the hundreds choices become 0 and 1 with a blank once entered; the #109 longitude pin becomes a passing test in
  that commit; a comment on #109 follows after the commits exist (controller, close-out).
- #361, #362, #363 and #365 (filed during brainstorming) are part of this milestone.
- #282: below 10 NM the tens place is blank too (figure 3-155 and the trainer, against figure 3-159).
- #341: whole NM, right-aligned in the five cells, for 999.95 NM and more.
- #287: right-aligned whole kHz for a database NDB (figure 3-153); a user NDB keeps its tenth.

---

## Lanes, task order and file ownership

Each lane is one implementer in one worktree, committing its tasks in order. Lanes 1 to 3 run in parallel from the
integration branch. Lane 4 starts after lane 3 is merged, lane 5 after lane 2 is merged.

| Lane | Task | Issue | Main files |
|---|---|---|---|
| 1 | 1 | #223 | `controls/displays/DurationDisplay.tsx` |
| 1 | 2 | #337 | `pages/left/Oth6Page.tsx` |
| 2 | 3 | #263 | `data/Coordinates.ts` (helper B), `controls/displays/BearingDisplay.tsx`, `pages/left/Mod2Page.tsx`, `controls/selects/ObsDtkElement.tsx`, `controls/SuperNav5Left.tsx`, `controls/StatusLine.tsx`, `pages/left/DirectToPage.tsx` |
| 2 | 4 | #361 | `controls/selects/SuperNav5Field2Selector.tsx`, `SuperNav5Field3Selector.tsx` (format only), `MapOrientationSelector.tsx`, `data/PersistentMessages.ts`, `controls/editors/BearingEditor.tsx` |
| 2 | 5 | #340 | `controls/editors/RadialEditor.tsx` |
| 3 | 6 | #230 | `controls/editors/Editor.tsx`, `EditorField.tsx` (helper A), `LatitudeEditor.tsx`, `LongitudeEditor.tsx`, `controls/displays/LatitudeDisplay.tsx`, `LongitudeDisplay.tsx` |
| 3 | 7 | #304 | `controls/editors/LongitudeEditor.tsx` |
| 3 | 8 | #245 | `controls/editors/SpeedEditor.tsx` |
| 4 | 9 | #282 | `controls/editors/DistanceEditor.tsx` |
| 4 | 10 | #302 | `controls/editors/DistanceEditor.tsx`, `NdbFreqEditor.tsx`, `test/harness/flight/FrontPanel.ts` |
| 4 | 11 | #341 | `controls/editors/Editor.tsx` (idle text), `DistanceEditor.tsx` |
| 4 | 12 | #287 | `controls/editors/NdbFreqEditor.tsx` |
| 5 | 13 | #280 | `data/navdata/KLNMagvar.ts` (helper C), `pages/right/IntPage.tsx`, `pages/right/SupPage.tsx` |
| 5 | 14 | #339 | `pages/left/Nav2Page.tsx`, `controls/selects/SuperNav5Field3Selector.tsx` (ARC), `pages/right/Ctr1Page.tsx` |
| 5 | 15 | #362 | `pages/right/Ctr1Page.tsx`, `pages/right/Ctr2Page.tsx` |
| 5 | 16 | #363 | `data/navdata/SidStar.ts` (`getArcEntryName` and its callers) |
| 5 | 17 | #365 | `data/navdata/SidStar.ts` (`getArcEntryData`), `test/harness/navdata/procedures.ts` (comment) |

All `kln90b/...` and `test/...` paths below are relative to the repo root. Line numbers are those of the integration
branch at commit `0d987fe`; recheck them, earlier tasks of the same lane move them.

---

### Task 1: Durations never show 60 minutes (#223)

**Goal:** `formatDuration` rounds the total minutes first and then splits off the hours, so 59.5 minutes after a whole hour show the next hour, never `:60`.

**Files:**
- Modify: `kln90b/controls/displays/DurationDisplay.tsx:40-57`
- Modify (pins to tests): `test/render/controls/displays/DurationDisplay.test.ts:51,55`, `test/render/pages/left/Nav1Page.test.ts:119`, `test/render/pages/left/Oth6Page.test.ts:90`, `test/render/pages/left/Tri3Page.test.ts:134`, `test/render/pages/right/Dt1Page.test.ts:134`, `test/render/pages/right/Dt4Page.test.ts:125`
- Modify: `docs/testing.md` section 8, the 2026-10-12 block (new bullet)

**Acceptance Criteria:**
- [ ] `formatDuration(59.7 * 60)` is `" 1:00"`, `formatDuration(119.56 * 60, true)` is `" 2:00"`, `formatDuration(26.6 * 60)` is `"  :27"` (rounding kept).
- [ ] The seven #223 pins are `it(...)` and assert only the rounded form (the next whole hour).
- [ ] The 2026-10-12 block of `docs/testing.md` section 8 records the CAL 1 rounding, the NAV 1 truncation, the seconds below a minute, and that the 90B keeps rounding (5-7, #223).
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/displays/DurationDisplay.test.ts test/render/pages/left/Nav1Page.test.ts test/render/pages/left/Oth6Page.test.ts test/render/pages/left/Tri3Page.test.ts test/render/pages/right/Dt1Page.test.ts test/render/pages/right/Dt4Page.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Turn the pins into tests of the rounded form.** In each of the seven pins replace `it.fails(` by `it(`
  and replace the either-or assertion by the rounded alternative only (the next whole hour, the first alternative each
  pin already accepts). Rename the two pins that say "or": `Tri3Page.test.ts:134` becomes
  `'shows 119.56 minutes as 2:00, not 1:60 (5-5, #223)'`; the others keep their names. Rewrite each comment: the unit
  rounds the minutes (the figures of 5-7, and the KLN 89 trainer's CAL 1, 2026-10-12), and the hour rolls over, so the
  minutes run from 00 to 59. Add to `DurationDisplay.test.ts`, in the describe of the two pins:

```ts
    // 5-7: the minutes are rounded, and the rounding carries into the hour: 59.7 minutes are 1:00 (#223)
    it('carries a rounded 60 minutes into the hour (5-7, #223)', () => {
        expect(formatDuration(59.7 * 60)).toBe(' 1:00');
        expect(formatDuration(119.56 * 60, true)).toBe(' 2:00');
        expect(formatDuration(59.4 * 60)).toBe('  :59');
    });
```

- [ ] **Step 2: Run them, expect red.** `npx vitest run test/render/controls/displays/DurationDisplay.test.ts` → the
  converted pins and the new test FAIL (`:60`).

- [ ] **Step 3: Fix `formatDuration`.** Replace the body after the null check:

```ts
export function formatDuration(duration: Seconds | null, tripForm: boolean = false): string {
    if (duration === null) {
        return "--:--";
    }
    //#223: round the total minutes first, so 59.5 minutes after a whole hour carry into the next hour instead of
    //showing :60. The figures of 5-7 round; the KLN 89 trainer's CAL 1 rounds too (2026-10-12)
    const totalMinutes = Math.round(duration / 60);
    if (totalMinutes / 60 >= 100) {
        return "--:--";
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${tripForm ? " 0" : "  "}:${format(minutes, "00")}`;
    } else {
        return `${hours.toString().padStart(2, " ")}:${format(minutes, "00")}`;
    }
}
```

- [ ] **Step 4: Run the Verify command**, expect all green. Then `npm test` (the inventory measured the rounded fix:
  only the seven pins change).

- [ ] **Step 5: Docs.** Append to the 2026-10-12 block of `docs/testing.md` section 8 (before `# 9. Next steps`):

```markdown
- ETE minutes (#223): CAL 1 rounds to the nearest minute (every reading where rounding and truncation differ came out
  rounded, among them about 59.9 minutes shown as `1:00`); NAV 1 truncates (`0:03` for 3.7 to 3.5 NM at 59 kt, and the
  minute drops as the distance passes 3.0) and shows seconds below one minute (`:ss`). The 90B's figures round (5-7),
  so the unit keeps rounding everywhere; the 89's NAV 1 is recorded, not followed.
```

- [ ] **Step 6: Mutation check** (put `Math.round` back to the raw `duration / 60`), restore, then commit:

```bash
git add kln90b/controls/displays/DurationDisplay.tsx test/render docs/testing.md
git commit -m "fixes #223 round the total minutes of a duration before splitting off the hours so it never shows 60 minutes" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: OTH 6 efficiency just below 10 stays in its field (#337)

**Goal:** OTH 6 compares the rounded efficiency with the cutoff of 10, so 9.95 to 9.99 NM/GAL shows `010` in the three cells instead of the four-character `10.0`.

**Files:**
- Modify: `kln90b/pages/left/Oth6Page.tsx:76-80`
- Test: `test/render/pages/left/Oth6Page.test.ts` (describe `OTH 6 page (characterization)`)

**Acceptance Criteria:**
- [ ] At 60 pph (10 GAL/HR) and 99.7 kt, row 4 of the left half reads ` NM/GAL 010`.
- [ ] At 99.4 kt it reads ` NM/GAL 9.9` (sibling).
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/pages/left/Oth6Page.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the tests** in the describe `OTH 6 page (characterization)` of `Oth6Page.test.ts`, after the
  `shows NM/GAL of 10 or more with leading zeros` test:

```ts
    // #337: 9.97 NM per gallon rounds to 10.0, which takes the three-digit form of 10 and more, so the row keeps the
    // eleven cells of the half page (the trainer has no efficiency, so the form is the code's own)
    it('characterization: shows 9.97 NM/GAL as 010 (#337)', async () => {
        const unit = await single({fobLb: 756, reserve: 0, groundspeedKt: 99.7, flowPph: 60});
        expect(unit.props.sensors.in.gps.groundspeed).toBeCloseTo(99.7, 1); // precondition: 9.97 NM/GAL

        expect(Screen.read().rows('L')[4]).toBe(' NM/GAL 010');
    });

    // Sibling of the #337 test: 9.94 NM per gallon keeps its tenth
    it('characterization: shows 9.94 NM/GAL as 9.9 (#337)', async () => {
        await single({fobLb: 756, reserve: 0, groundspeedKt: 99.4, flowPph: 60});

        expect(Screen.read().rows('L')[4]).toBe(' NM/GAL 9.9');
    });
```

- [ ] **Step 2: Run, expect red.** The first test fails (`Screen.read()` throws on the 12-cell row, or the row reads
  ` NM/GAL 10.0`); the sibling passes. If the precondition fails because the harness ground speed is not exactly the
  one set, pick the ground speed that gives an efficiency in [9.95, 10) and report it.

- [ ] **Step 3: Fix** `Oth6Page.redraw`:

```ts
            const efficiency = this.props.sensors.in.gps.groundspeed / ff;
            //#337: compare the rounded value, so 9.95 to 9.99 take the three-digit form of 10 and keep the field's cells
            if (Math.round(efficiency * 10) / 10 >= 10) {
                efficiencyString = format(Math.min(efficiency, 999), "000");
            } else {
                efficiencyString = format(efficiency, "0.0");
            }
```

- [ ] **Step 4: Run the Verify command and `npm test`**, mutation check (restore the raw comparison), then commit:

```bash
git add kln90b/pages/left/Oth6Page.tsx test/render/pages/left/Oth6Page.test.ts
git commit -m "fixes #337 compare the rounded OTH 6 efficiency with the cutoff so 9.95 to 9.99 NM/GAL keep the field's cells" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bearings and the OBS course at north show 000, never 360 (#263)

**Goal:** Add helper B, `roundBearing`, and use it in `BearingDisplay` and the five OBS course formatters, so 359.5 to 359.99 show `000`.

**Files:**
- Modify: `kln90b/data/Coordinates.ts` (add `roundBearing`)
- Create: `test/unit/data/Coordinates.test.ts`
- Modify: `kln90b/controls/displays/BearingDisplay.tsx:46`, `kln90b/pages/left/Mod2Page.tsx:214`, `kln90b/controls/selects/ObsDtkElement.tsx:105`, `kln90b/controls/SuperNav5Left.tsx:105,109`, `kln90b/controls/StatusLine.tsx:231,235`, `kln90b/pages/left/DirectToPage.tsx:121`
- Modify (pins to tests): `test/render/controls/displays/BearingDisplay.test.ts:57`, `test/render/pages/left/Mod2Page.test.ts:245`
- Test: `test/render/controls/selects/ObsDtkElement.test.ts`, `test/render/controls/SuperNav5Left.test.ts`, `test/render/controls/StatusLine.test.ts`, `test/render/pages/left/DirectToObs.test.ts`

**Acceptance Criteria:**
- [ ] `roundBearing(359.5)` is 0, `roundBearing(359.4)` is 359, `roundBearing(359.95, 1)` is 0, `roundBearing(359.94, 1)` is 359.9, `roundBearing(0.4)` is 0.
- [ ] `BearingDisplay(359.5)` draws `000°`; MOD 2 shows `OBS:000°` for a course of 359.7.
- [ ] NAV 3's OBS course, the Super NAV 5 mode field, the status line mode and the Direct To CRS message each show `000` for a magnetic course of 359.7, and `359` for 359.4.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/unit/data/Coordinates.test.ts test/render/controls/displays/BearingDisplay.test.ts test/render/pages/left/Mod2Page.test.ts test/render/controls/selects/ObsDtkElement.test.ts test/render/controls/SuperNav5Left.test.ts test/render/controls/StatusLine.test.ts test/render/pages/left/DirectToObs.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Unit test of the helper**, `test/unit/data/Coordinates.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {roundBearing} from '../../../kln90b/data/Coordinates';

// Bearings run from 000 to 359: north shows 000, never 360 (checked in the KLN 89 trainer, 2026-10-07 for the OBS
// course and 2026-10-08 for a bearing, #263). roundBearing rounds first and wraps after, so the format never sees 360
describe('roundBearing (checked in the KLN 89 trainer, 2026-10-07 and 2026-10-08, #263)', () => {
    it('wraps a bearing that rounds up to 360 to 0', () => {
        expect(roundBearing(359.5)).toBe(0);
        expect(roundBearing(359.99)).toBe(0);
    });

    it('keeps a bearing that rounds down', () => {
        expect(roundBearing(359.4)).toBe(359);
        expect(roundBearing(0.4)).toBe(0);
        expect(roundBearing(88.8)).toBe(89);
    });

    it('rounds to tenths with one decimal and wraps 360.0 to 0.0', () => {
        expect(roundBearing(359.95, 1)).toBe(0);
        expect(roundBearing(359.94, 1)).toBeCloseTo(359.9, 9);
        expect(roundBearing(12.34, 1)).toBeCloseTo(12.3, 9);
    });
});
```

- [ ] **Step 2: Convert the two pins** (`BearingDisplay.test.ts:57`, `Mod2Page.test.ts:245`) to `it(` and rewrite their
  comments (the trainer saw 359 then 0, never 360; the 90B pads with zeros). Add the four new tests below. Each sets
  the OBS course through the mode controller, as `DirectToPage` does, then waits for a display tick.

  In `ObsDtkElement.test.ts`, describe `OBS/DTK element`:

```ts
    // Checked in the KLN 89 trainer, 2026-10-07 (#263): north shows 000, never 360. An OBS course of 359.7 (from a DTK
    // with a fraction) is shown as 000; the sibling 359.4 as 359
    it('shows an OBS course of 359.7 as 000° (checked in the KLN 89 trainer, 2026-10-07, #263)', async () => {
        const unit = await nav3(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await unit.panel.selectPage('L', 'NAV 3');
        unit.props.modeController.setObs(359.7);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[1].slice(7, 11)).toBe('000°');
    });

    it('shows an OBS course of 359.4 as 359° (checked in the KLN 89 trainer, 2026-10-07, #263)', async () => {
        const unit = await nav3(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await unit.panel.selectPage('L', 'NAV 3');
        unit.props.modeController.setObs(359.4);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[1].slice(7, 11)).toBe('359°');
    });
```

  In `SuperNav5Left.test.ts` (use that file's way of showing Super NAV 5 in OBS mode; `superNav5OnLeg` of
  `test/harness/render/superNav5.ts` with `unit.panel.obsMode()` before or after it): the mode row of the left column
  (`SuperNav5.read().left[2]`) contains `Ê000` for `setObs(359.7)` and `Ê359` for `setObs(359.4)`. Name the pair
  `'shows the OBS course 359.7 in the mode field as 000 (checked in the KLN 89 trainer, 2026-10-07, #263)'` and
  `'... 359.4 ... as 359 ...'`; assert the whole row text (read it from the sibling first), not a substring.

  In `StatusLine.test.ts`: in OBS mode with `setObs(359.7)` the status line mode reads `enr:000` (followed by the
  file's usual message prompt, see the existing `toMatch(/^enr:[0-9]{3} msg$/)`; assert
  `expect(Screen.read().status().mode.slice(0, 7)).toBe('enr:000')`), and `enr:359` for 359.4. Same labels as above.

  In `DirectToObs.test.ts`, next to `shows CRS with the direct course when the unit reads a non-driven indicator`
  (same setup, `planInObs(offLeg, {obs: 50, abc: ...})`): give ABC a variation that makes the direct course 359.7
  magnetic, so the CRS message shows `000`:

```ts
    // #263: the direct course is 034.2 true; with a variation of 34.5 east at ABC it is 359.7 magnetic, which the CRS
    // message shows as 000 (north is 000, never 360: checked in the KLN 89 trainer, 2026-10-07)
    it('shows a direct course of 359.7 in the CRS message as 000 (checked in the KLN 89 trainer, 2026-10-07, #263)', async () => {
        const variation = courseDeg(offLeg, abc) + 0.3; // the direct course minus this is 359.7
        const abcNorth = vor('ABC', abc.lat, abc.lon, {magneticVariation: -variation});
        const unit = await planInObs(offLeg, {obs: 50, abc: abcNorth});
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('d› CRS 000');
    });
```

- [ ] **Step 3: Run the Verify command, expect red**: the helper test fails to import; the converted pins and the
  new 359.7 tests fail with `360`; the 359.4 siblings pass.

- [ ] **Step 4: Add the helper** to `kln90b/data/Coordinates.ts`:

```ts
/**
 * Rounds a bearing to the given decimals and wraps it into [0, 360): north is 000, never 360 (checked in the KLN 89
 * trainer, 2026-10-07 and 2026-10-08, #263). Round first and format after, so the format never rounds up to 360.
 * @param value a bearing in [0, 360)
 * @param decimals 0 for whole degrees, 1 for tenths
 */
export function roundBearing(value: Degrees, decimals: number = 0): Degrees {
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(value * factor) / factor;
    return rounded >= 360 ? rounded - 360 : rounded;
}
```

- [ ] **Step 5: Use it at the six sites** (import `{roundBearing}` from the relative path of `data/Coordinates`):
  - `BearingDisplay.formatBearing`: `` return `${format(roundBearing(this.bearing), "000")}°`; ``
  - `Mod2Page.getDisplayValue`: `` `${format(roundBearing(this.navState.obsMag), "000")}°` ``
  - `ObsDtkElement.getDisplayValue`: `` dtk === null ? "---°" : `${format(roundBearing(dtk), "000")}°` ``
  - `SuperNav5Left.getModeString`: both `format(this.props.memory.navPage.obsMag, "000")` become
    `format(roundBearing(this.props.memory.navPage.obsMag), "000")`
  - `StatusLine.getModeString`: the same two replacements
  - `DirectToPage`: `` `d› CRS ${format(roundBearing(obsMag), "000")}` ``

- [ ] **Step 6: Run the Verify command and `npm test`**, expect green. Mutation check: remove the wrap line of
  `roundBearing` (return `rounded`); the converted pins and every 359.7 test go red; restore.

- [ ] **Step 7: Commit**

```bash
git add kln90b/data/Coordinates.ts kln90b/controls kln90b/pages/left test/unit/data/Coordinates.test.ts test/render
git commit -m "fixes #263 round bearings and the OBS course before formatting them so north shows 000, never 360" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: More bearings at north show 000 (#361)

**Goal:** Use `roundBearing` in the Super NAV 5 fields 2 and 3, the NAV 5 orientation value, the `ADJ NAV IND CRS TO` message and the SET 1 track.

**Files:**
- Modify: `kln90b/controls/selects/SuperNav5Field2Selector.tsx:92`, `kln90b/controls/selects/SuperNav5Field3Selector.tsx:80`, `kln90b/controls/selects/MapOrientationSelector.tsx:67`, `kln90b/data/PersistentMessages.ts:65`, `kln90b/controls/editors/BearingEditor.tsx:23`
- Test: `test/render/controls/selects/SuperNav5Field2Selector.test.ts`, `SuperNav5Field3Selector.test.ts`, `MapOrientationSelector.test.ts`, `test/unit/data/PersistentMessages.test.ts`, `test/render/controls/editors/BearingEditor.test.ts`
- Modify: `docs/testing.md` (the lead about the Super NAV 5 fields 2 and 3 in section 9, about line 1431)

**Acceptance Criteria:**
- [ ] Super NAV 5 field 3 on TK shows `Ö000°` for a magnetic track of 359.6 and `Ö359°` for 359.4; field 2 on BRG shows `Ô000°` for a magnetic bearing of 359.6.
- [ ] The NAV 5 orientation on TK up shows `000°` for a magnetic track of 359.6.
- [ ] The message reads `ADJ NAV IND CRS TO 000°` for a magnetic DTK of 359.7.
- [ ] `BearingEditor` with the value 359.6 shows `000`, with 359.4 `359`.
- [ ] The docs lead "the Super NAV 5 fields 2 and 3 round 359.5 to 360 (#263's rule)" is gone.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/selects test/unit/data/PersistentMessages.test.ts test/render/controls/editors/BearingEditor.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the tests.** All are characterizations of #263's north rule (these fields are the 90B's own;
  the trainer checked the OBS course and a bearing): name them `'characterization: shows ... as 000° (#361)'`.

  `SuperNav5Field3Selector.test.ts` (world of the file: track 090 true; a variation of 90.4 east makes it 359.6
  magnetic, 90.6 east 359.4):

```ts
    // #361: a magnetic track of 359.6 is 000, the north rule of #263
    it('characterization: shows a magnetic track of 359.6 as Ö000° (#361)', async () => {
        await superNav5OnLeg({westNm: 30, magvar: 90.4, storage: {superNav5Field3: SuperNav5Field3.TK}});
        expect(field3()).toBe('Ö000°');
    });

    it('characterization: shows a magnetic track of 359.4 as Ö359° (#361)', async () => {
        await superNav5OnLeg({westNm: 30, magvar: 90.6, storage: {superNav5Field3: SuperNav5Field3.TK}});
        expect(field3()).toBe('Ö359°');
    });
```

  `SuperNav5Field2Selector.test.ts`: the same world, field 2 on BRG (`storage: {superNav5Field2: SuperNav5Field2.BRG}`;
  read the file's accessor for field 2). The bearing to KDDD is 089.46 true (the file's own comment); a variation of
  89.86 east makes it 359.6 magnetic: `Ô000°`; 90.06 east makes it 359.4: `Ô359°`.

  `MapOrientationSelector.test.ts`: TK up (`Nav5Orientation.TK_UP`, use the file's setup for the orientation value),
  track 090 true, a variation of 90.4 east: `000°`; 90.6 east: `359°`.

  `test/unit/data/PersistentMessages.test.ts`, describe `ADJ NAV IND CRS TO nnn, a readable indicator` (its `readable`
  setup has `w.dtkMag`):

```ts
    // #361: a DTK of 359.7 magnetic is named 000 in the message, the north rule of #263
    it('names a DTK of 359.7 as 000° (characterization, #361)', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        const w = quietWorld();
        w.dtkMag = 359.7;
        w.obsIn = 10; // more than 5 degrees off
        const h = harness(w);

        expect(h.tick()).toEqual(['ADJ NAV IND CRS TO 000°']);
    });
```

  `BearingEditor.test.ts` (a mounted editor, as `BearingDisplay.test.ts` mounts its display):

```ts
import {EventBus} from '@microsoft/msfs-sdk';
import {BearingEditor} from '../../../../kln90b/controls/editors/BearingEditor';
import {mountedText} from '../../../harness/render/mount';

describe('BearingEditor at north (characterization, #361)', () => {
    // The SET 1 track is magnetic in [0, 360); 359.6 is shown as 000, the north rule of #263, and a value the field
    // itself refuses (360) is never shown
    it('characterization: shows a track of 359.6 as 000 (#361)', () => {
        expect(mountedText(new BearingEditor(new EventBus(), 359.6, () => {}))).toBe('000');
    });

    it('characterization: shows a track of 359.4 as 359 (#361)', () => {
        expect(mountedText(new BearingEditor(new EventBus(), 359.4, () => {}))).toBe('359');
    });
});
```

- [ ] **Step 2: Run the Verify command, expect red** for every 359.6/359.7 test (`360`), green for the siblings.

- [ ] **Step 3: Fix the five sites** (import `roundBearing` from `data/Coordinates`):
  - `SuperNav5Field2Selector.formatDegrees`, `SuperNav5Field3Selector.formatDegrees`,
    `MapOrientationSelector.formatDegrees`: `` return `${format(roundBearing(degrees), "000")}°`; ``
  - `PersistentMessages.ts:65`: `` this.message = [`ADJ NAV IND CRS TO ${format(roundBearing(dtk), "000")}°`]; ``
  - `BearingEditor.convertFromValue`: `const numberString = format(roundBearing(radial), "000");`

- [ ] **Step 4: Docs.** In `docs/testing.md` section 9, the lead list of selectors and fieldsets, delete
  `the Super NAV 5 fields 2 and 3 round 359.5 to 360 (#263's rule);`.

- [ ] **Step 5: Verify, `npm test`, mutation check** (one site back to the raw value; its test goes red), commit:

```bash
git add kln90b test docs/testing.md
git commit -m "fixes #361 round the Super NAV 5 fields, the map orientation, ADJ NAV IND CRS and the SET 1 track before formatting so north shows 000" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: RAD just below north shows 000.0 (#340)

**Goal:** `RadialEditor` rounds the radial to tenths and wraps before formatting, so 359.95 to 359.99 show `000.0`.

**Files:**
- Modify: `kln90b/controls/editors/RadialEditor.tsx:27-35`
- Test: `test/render/controls/editors/RadialEditor.test.ts`, `test/render/pages/right/SupPage.test.ts`

**Acceptance Criteria:**
- [ ] A mounted `RadialEditor` with 359.97 shows `000.0`, with 359.94 `359.9`.
- [ ] The SUP page of a user waypoint whose true radial from the only VOR is about 359.97 (no variation) shows `RAD: 000.0°`.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/RadialEditor.test.ts test/render/pages/right/SupPage.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Write the tests.** In `RadialEditor.test.ts`:

```ts
describe('RadialEditor at north', () => {
    // The field takes 000.0 to 359.9 (checked in the KLN 89 trainer, 2026-10-08: no radial above 359.9) and north is
    // 000, never 360 (#263): a radial of 359.97 shows 000.0
    it('shows a radial of 359.97 as 000.0 (checked in the KLN 89 trainer, 2026-10-08, #340)', () => {
        expect(mountedText(new RadialEditor(new EventBus(), 359.97, () => {}))).toBe('000.0');
    });

    it('shows a radial of 359.94 as 359.9 (checked in the KLN 89 trainer, 2026-10-08, #340)', () => {
        expect(mountedText(new RadialEditor(new EventBus(), 359.94, () => {}))).toBe('359.9');
    });
});
```

  (import `mountedText` from `../../../harness/render/mount`). In `SupPage.test.ts`, the reproduction of the issue as a
  page test: a world of its own with USUP at 47.2 N 10.5 E and a VOR NNN 12 NM from USUP on the true course 179.97
  (`pointFrom({lat: 47.2, lon: 10.5}, 179.97, 12)` of `test/harness/flight/geo.ts`), no other VOR, no variation; the
  SUP page after the REF calculation (`REF_DELAY_MS`) reads row 2 `RAD: 000.0°`. Check first, with `courseDeg`, that
  the radial from NNN to USUP is in [359.95, 360) and report its value.

- [ ] **Step 2: Run, expect red** (`360.0`); the 359.94 sibling passes.

- [ ] **Step 3: Fix** `RadialEditor.convertFromValue`:

```ts
    protected convertFromValue(radial: number): Rawvalue {
        const numberString = format(roundBearing(radial, 1), "000.0"); //#340: north is 000.0, never 360.0
```

- [ ] **Step 4: Verify, `npm test`, mutation check, commit:**

```bash
git add kln90b/controls/editors/RadialEditor.tsx test/render
git commit -m "fixes #340 round the radial to tenths before formatting so a radial just below north shows 000.0" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Coordinates below 10 degrees are padded with blanks (#230)

**Goal:** Add helper A to the editor base, use it in the latitude and longitude editors, and pad the degrees of `LatitudeDisplay` and `LongitudeDisplay` with blanks.

**Files:**
- Modify: `kln90b/controls/editors/EditorField.tsx` (`isBlank`, `toString`)
- Modify: `kln90b/controls/editors/Editor.tsx` (`setLeadingZeroCells`, `applyLeadingBlanks`, calls in `applyValueToFields`, `setEntered`, `enter`)
- Modify: `kln90b/controls/editors/LatitudeEditor.tsx`, `kln90b/controls/editors/LongitudeEditor.tsx` (constructors)
- Modify: `kln90b/controls/displays/LatitudeDisplay.tsx:36`, `kln90b/controls/displays/LongitudeDisplay.tsx:37`
- Modify (pins to tests): `test/render/controls/displays/LatitudeDisplay.test.ts:40`, `LongitudeDisplay.test.ts:34`, `test/render/pages/Nav2Page.test.ts:94,101`
- Modify: `test/render/GpsAcquisition.test.ts:430` (expects `E  8°00.00'`)
- Test: `test/render/controls/editors/LatLonEditor.test.ts`

**Acceptance Criteria:**
- [ ] NAV 2 at 47° N 8° E shows row 5 `E  8°00.00'`; at 8°30' N it shows `N  8°30.00'`.
- [ ] A mounted `LatitudeEditor` with 8.5 shows `N  8°30.00`; a mounted `LongitudeEditor` with 8 shows `E  8°00.00`, with 108 `E108°00.00`, with 0 `E  0°00.00`.
- [ ] `GpsAcquisition.test.ts:430` expects `E  8°00.00'`.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/LatLonEditor.test.ts test/render/controls/displays test/render/pages/Nav2Page.test.ts test/render/GpsAcquisition.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests.** Convert the four pins to `it(`, rewrite their comments (the trainer, 2026-10-07: a degree below
  10 is padded with a blank once entered, zeros only in an open edit). Update `GpsAcquisition.test.ts:430` to
  `["N 47°00.00'", "E  8°00.00'"]` (the precondition now reads the fixed form). Add to `LatLonEditor.test.ts`:

```ts
describe('the degrees of an entered coordinate below 10 (checked in the KLN 89 trainer, 2026-10-07, #230)', () => {
    // The trainer pads a degree below 10 with a blank once the value is entered (W  8°, N  8°); only the open edit
    // field shows the zeros
    it('shows the latitude 8°30\' N as N  8°30.00 (checked in the KLN 89 trainer, 2026-10-07, #230)', () => {
        expect(mountedText(new LatitudeEditor(new EventBus(), 8.5, () => {}))).toBe('N  8°30.00');
    });

    it('shows the longitude 8° E as E  8°00.00 (checked in the KLN 89 trainer, 2026-10-07, #230)', () => {
        expect(mountedText(new LongitudeEditor(new EventBus(), 8, () => {}))).toBe('E  8°00.00');
    });

    it('keeps the zero of a longitude of 100 degrees or more (checked in the KLN 89 trainer, 2026-10-07, #230)', () => {
        expect(mountedText(new LongitudeEditor(new EventBus(), 108, () => {}))).toBe('E108°00.00');
    });

    it('characterization: shows the longitude 0° as E  0°00.00 (#230)', () => {
        expect(mountedText(new LongitudeEditor(new EventBus(), 0, () => {}))).toBe('E  0°00.00');
    });
});
```

  (Check the text a mounted editor gives with a sibling first, for example `mountedText(new LatitudeEditor(new
  EventBus(), 47.5, () => {}))`, which must read `N 47°30.00`; adapt the expected strings only if the editor's own
  cells differ from this layout, and report it.)

- [ ] **Step 2: Run, expect red** (`N 08°30.00`, `E 08°00.00`, the pins).

- [ ] **Step 3: Helper A.** In `EditorField`:

```ts
    /**
     * A leading zero of an entered value shows as a blank (helper A of the milestone-7 design). The value stays 0; only
     * the text changes. Set by the editor, never while its edit is open
     */
    public isBlank = false;
```

  and in `toString`:

```ts
    private toString() {
        if (this.value == null) {
            return "_".repeat(this.fieldLength());
        }
        return this.isBlank ? " ".repeat(this.fieldLength()) : this.charset[this.value];
    }
```

  In `Editor`:

```ts
    private leadingZeroCells: number[] = [];

    /**
     * The cells, in display order, whose zeros are blanked while the edit is closed: from the first up to the first cell
     * that is not 0. An open edit shows every cell as it is. Checked in the KLN 89 trainer: a degree below 10 shows a
     * blank once entered and its zeros while edited (2026-10-07, #230), the open longitude shows E008° (2026-10-08, #304)
     */
    protected setLeadingZeroCells(cells: number[]): void {
        this.leadingZeroCells = cells;
        this.applyLeadingBlanks();
    }

    private applyLeadingBlanks(): void {
        let leading = !this.isEntered;
        for (const i of this.leadingZeroCells) {
            const field = this.editorFields[i];
            leading = leading && field.value === 0;
            field.isBlank = leading;
        }
    }
```

  Call `this.applyLeadingBlanks()` at the end of `applyValueToFields`, at the end of `setEntered` (after
  `this.isEntered = isEntered;`), and in `enter()` right after `this.isEntered = false;`.

- [ ] **Step 4: Use it.** `LatitudeEditor` constructor, after `super(...)`: `this.setLeadingZeroCells([1]); //#230`.
  `LongitudeEditor` constructor, after `super(...)`: `this.setLeadingZeroCells([1, 2]); //#230` (the hundreds cell
  is still `createWithBlankMax(1)`; its blank has the value 0, so it counts as a leading zero).

- [ ] **Step 5: Displays.** `LatitudeDisplay.formatLatitude`:
  `const degreesString = String(degrees).padStart(2, " "); //#230: a degree below 10 is padded with a blank`;
  `LongitudeDisplay.formatLongitude`: `const degreesString = String(degrees).padStart(3, " "); //#230`.

- [ ] **Step 6: Verify, `npm test`** (expected changes: the four pins, the new tests, `GpsAcquisition.test.ts:430`;
  anything else is a finding). **Mutation check:** comment out the `setLeadingZeroCells` call of `LatitudeEditor`; the
  latitude editor test goes red; restore.

- [ ] **Step 7: Commit**

```bash
git add kln90b/controls test/render
git commit -m "fixes #230 pad the degrees of a coordinate below 10 with a blank once entered, keeping the zeros in an open edit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The open longitude edit shows its hundreds digit (#304)

**Goal:** The longitude hundreds cell offers 0 and 1, so the open edit shows `E008°`; the entered value keeps the blank through helper A, and a typed `0` is accepted (the longitude half of #109).

**Files:**
- Modify: `kln90b/controls/editors/LongitudeEditor.tsx:20`
- Modify (pins to tests): `test/render/controls/editors/LatLonEditor.test.ts:324`, `test/render/services/KeyboardService.test.ts:83` (#109)
- Modify: `test/render/pages/right/SupPage.test.ts:37-48` (`typeEastBelow100`: the precondition and its comment)
- Modify: `test/render/controls/editors/LatLonEditor.test.ts` (the characterization `offers two choices in the hundreds place, one of them a 1`, if its literals name the blank)

**Acceptance Criteria:**
- [ ] The #304 pin is an `it` and passes: the open edit shows `E008°`.
- [ ] The #109 keyboard pin is an `it` and passes (a typed `0` selects the hundreds 0).
- [ ] `shows a blank hundreds digit after a longitude below 100 degrees is entered (3-18, 5-17)` still passes.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/LatLonEditor.test.ts test/render/services/KeyboardService.test.ts test/render/pages/right/SupPage.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Convert the two pins** to `it(` and rewrite their comments: #304 (the trainer, 2026-10-08 T8: the open
  edit shows `E008°`); #109 (the hundreds cell now has a 0, so the keyboard can type it; the date and runway-surface
  half of #109 stays open). In `SupPage.test.ts` `typeEastBelow100`, the precondition becomes
  `expect(rightRows()[5].slice(0, 2)).toBe('E0');` and the comment says the open field shows the hundreds 0 (#304). If
  the characterization of the hundreds choices names a blank, change it to the choices 0 and 1 and keep it a
  characterization.

- [ ] **Step 2: Run, expect red** (the open edit shows `E 08°`).

- [ ] **Step 3: Fix** the hundreds cell of `LongitudeEditor`:

```ts
            NumberEditorField.createWithMinMax(0, 1), //#304: the open edit shows the hundreds 0 (E008°); helper A blanks it once entered
```

- [ ] **Step 4: Verify, `npm test`** (expected changes: the two pins and the edited precondition; the inventory
  measured this variant with no other dependent test). Mutation check: put `createWithBlankMax(1)` back; both pins go
  red. Commit:

```bash
git add kln90b/controls/editors/LongitudeEditor.tsx test/render
git commit -m "fixes #304 show the hundreds digit of an open longitude edit as 0 and blank it once entered" -m "The hundreds cell now offers 0 and 1, so the keyboard can type the 0: references #109 (its longitude pin becomes a passing test).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A parked aircraft's ground speed shows 0 KT (#245)

**Goal:** `SpeedEditor`'s hundreds becomes a plain 0 to 9 cell (the open edit shows `005`), and helper A blanks the hundreds and tens once entered (`  5`, `  0`).

**Files:**
- Modify: `kln90b/controls/editors/SpeedEditor.tsx:10` and constructor
- Modify (pins to tests): `test/render/controls/editors/SpeedEditor.test.ts:46` (#245), `:103` (#109 ground speed), `test/render/pages/left/Set1Page.test.ts:260`
- Modify: `test/render/controls/editors/SpeedEditor.test.ts` (the wrap tests and the characterization that name the blank hundreds)

**Acceptance Criteria:**
- [ ] SET 1 of a parked unit reads row 4 `  0 KT 000°`; an entered 5 kt reads `  5 KT`.
- [ ] The open edit shows the hundreds 0: after the first inner click the field reads `0__`.
- [ ] The hundreds cell wraps from 9 to 0; the tens wrap test reads `09_` then `00_`.
- [ ] The #109 ground-speed pin is an `it` expecting `095` while the edit is open.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/SpeedEditor.test.ts test/render/pages/left/Set1Page.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests.** Convert the #245 pins to `it(` (3-18, figures 3-57 to 3-60, and the trainer, 2026-10-08 T11:
  `005` while open, `  5kt` entered). Change the #109 pin to `it('types a ground speed below 100 KT with a leading 0 (#109)')`
  expecting `expect(unit.panel.focused('L').text).toBe('095')` (the open field shows its zeros, T11) and rewrite its
  comment. In the wrap test (checked in the trainer, 2026-10-08) the open field shows the hundreds 0: `'09_'` then
  `'00_'`, and the comment of its first click says the field opens with a 0. The characterization
  `wraps the hundreds cell from 9 to the blank` becomes `wraps the hundreds cell from 9 to 0` with `'9__'` then `'0__'`.
  Add:

```ts
    // Checked in the KLN 89 trainer, 2026-10-08 (T11): the open ground speed shows its zeros (005); the first click opens
    // the field with the hundreds 0
    it('opens the field with the hundreds 0 (checked in the KLN 89 trainer, 2026-10-08, #245)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('0__');
    });
```

- [ ] **Step 2: Run, expect red** (the pins, the wrap tests, the new test).

- [ ] **Step 3: Fix** `SpeedEditor`:

```ts
    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            new NumberEditorField(), //#245: the open field shows its zeros (005), checked in the KLN 89 trainer, 2026-10-08
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
        this.setLeadingZeroCells([0, 1]); //#245: 3-18, an entered speed has no leading zeros (  5, 0 KT as   0)
    }
```

- [ ] **Step 4: Verify, `npm test`.** This variant was not measured by the inventory: list every test whose result
  changes and report any outside this task's list as a finding before committing. Mutation check: drop the
  `setLeadingZeroCells` line; the #245 tests go red. Commit:

```bash
git add kln90b/controls/editors/SpeedEditor.tsx test/render
git commit -m "fixes #245 show the ground speed without leading zeros once entered and with its zeros in an open edit" -m "The hundreds cell now has a 0, so the keyboard can type it: references #109 (its ground speed pin becomes a passing test).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: DIS without leading zeros (#282)

**Goal:** `DistanceEditor` blanks its hundreds and tens through helper A once entered (`DIS: 12.0`, `DIS:  3.7`), keeping the zeros in an open edit (`048.1`).

**Files:**
- Modify: `kln90b/controls/editors/DistanceEditor.tsx` (constructor)
- Modify (pins to tests): `test/render/controls/editors/DistanceEditor.test.ts:95`, `test/render/pages/right/IntPage.test.ts:334`, `test/render/pages/right/SupPage.test.ts:440`
- Test: `test/render/controls/editors/DistanceEditor.test.ts`
- Modify: `docs/testing.md` section 9 (`The controls' bugs that the right pages showed (#282) ...`, about line 1417)

**Acceptance Criteria:**
- [ ] Mounted `DistanceEditor` texts: 3.7 → `  3.7`, 12.0 → ` 12.0`, 48.1 → ` 48.1`, 100.0 → `100.0`, 0.4 → `  0.4`.
- [ ] The three #282 pins are `it` and pass.
- [ ] The docs line about #282 in section 9 is removed.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/DistanceEditor.test.ts test/render/pages/right/IntPage.test.ts test/render/pages/right/SupPage.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests.** Convert the three pins (figures 3-155, 5-75, 5-76 and the trainer, 2026-10-07; figure 5-74
  shows the zero only in the open field). Add to `DistanceEditor.test.ts`:

```ts
describe('DistanceEditor, an entered distance (3-50, 5-19, #282)', () => {
    // Figures 5-75 and 5-76 show 48.1 and 21.6 after a blank, figure 3-155 shows 3.7 after two blanks (the trainer,
    // 2026-10-07, pads with blanks too); figure 3-159 shows 09.1, against the other two sources
    it.each([
        [3.7, '  3.7'],
        [12.0, ' 12.0'],
        [48.1, ' 48.1'],
        [100.0, '100.0'],
        [0.4, '  0.4'],
    ])('shows %f as "%s" (figures 3-155, 5-75, 5-76, #282)', (nm, text) => {
        expect(mountedText(new DistanceEditor(new EventBus(), nm, () => {}))).toBe(text);
    });
});
```

  (The mounted text is the four cells and the point; check a sibling first and report if the editor's cells give
  another layout.)

- [ ] **Step 2: Run, expect red.**

- [ ] **Step 3: Fix**, after `super(...)` in the `DistanceEditor` constructor:
  `this.setLeadingZeroCells([0, 1]); //#282: figures 3-155, 5-75, 5-76: blanks once entered, zeros in the open field (5-74)`.

- [ ] **Step 4: Docs.** Delete the line `- The controls' bugs that the right pages showed (#282) are pinned on the pages
  and at control level.` from section 9 of `docs/testing.md`.

- [ ] **Step 5: Verify, `npm test`** (the inventory measured only the three pins), mutation check, commit:

```bash
git add kln90b/controls/editors/DistanceEditor.tsx test/render docs/testing.md
git commit -m "fixes #282 show the INT and SUP distance without leading zeros once entered" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The decimal point inside the cursor (#302)

**Goal:** `DistanceEditor` and `NdbFreqEditor` invert their point with the field, as `RadialEditor` does; the harness's `FrontPanel.joinAcrossPoint` goes.

**Files:**
- Modify: `kln90b/controls/editors/DistanceEditor.tsx` (render, tick), `kln90b/controls/editors/NdbFreqEditor.tsx` (render, tick)
- Modify (pins to tests): `test/render/controls/editors/DistanceEditor.test.ts:73`, `NdbFreqEditor.test.ts:76`, `test/render/harness/focused.test.ts:56`
- Modify: `test/harness/flight/FrontPanel.ts:528-566` (remove `joinAcrossPoint` and its call)
- Modify: `docs/testing.md` (section 4 `focused(side)` paragraph about lines 602-605; section 6 bullet about lines 869-876)

**Acceptance Criteria:**
- [ ] The three #302 pins are `it` and pass (the DIS mask `....IIIII..`, the point inverse while the frequency is edited).
- [ ] `FrontPanel` has no `joinAcrossPoint`; `focused()` returns runs as they are.
- [ ] `docs/testing.md` no longer describes the plain point or `joinAcrossPoint`.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/DistanceEditor.test.ts test/render/controls/editors/NdbFreqEditor.test.ts test/render/harness/focused.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Convert the three pins** to `it(` (figure 5-74 for DIS; for the NDB frequency no figure shows the
  cursor, so that test extends the rule of figures 5-72 to 5-74 and its comment must say so; keep its title as the pin
  has it).

- [ ] **Step 2: Fix both editors** as `RadialEditor` does. `DistanceEditor`:

```tsx
    private dotRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}<span
            ref={this.dotRef}>.</span>{this.editorFields[3].render()}
        </span>);
    }

    tick(blink: boolean): void {
        super.tick(blink);
        if (!TickController.checkRef(this.dotRef)) {
            return;
        }
        if (this.isFocused) { //#302: figure 5-74, the cursor covers the point
            this.dotRef!.instance.classList.add("inverted");
        } else {
            this.dotRef!.instance.classList.remove("inverted");
        }
    }
```

  `NdbFreqEditor` the same, with the point between `editorFields[3]` and `editorFields[4]`. Add the imports
  (`NodeReference`, `TickController`) as `RadialEditor` has them.

- [ ] **Step 3: Remove the harness join.** In `test/harness/flight/FrontPanel.ts`, `focused` returns its runs without
  `this.joinAcrossPoint(s, runs)`; delete the method and the doc comment line that names it. Run
  `npx vitest run test/render/harness` to confirm nothing else relied on it.

- [ ] **Step 4: Docs.** In `docs/testing.md` section 4, delete from the `focused(side)` bullet the two sentences that
  begin `Two runs of inverted cells that one plain` and `The real cursor covers the point`. In section 6, delete the
  whole bullet `**The NDB frequency and DIS editors do not invert their decimal point, which is a bug (#302).**`.

- [ ] **Step 5: Verify, `npm test`, mutation check** (remove the `classList.add` of `DistanceEditor`; its pin and the
  harness pin go red), commit:

```bash
git add kln90b/controls/editors test/harness/flight/FrontPanel.ts test/render docs/testing.md
git commit -m "fixes #302 invert the decimal point of the DIS and NDB frequency fields with the cursor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: DIS of 1000 NM and more (#341)

**Goal:** Add the editor idle text, and show a distance of 999.95 NM or more as whole NM right-aligned in the five cells of DIS (`DIS: 1202nm`).

**Files:**
- Modify: `kln90b/controls/editors/Editor.tsx` (idle text: `idleText`, `tickIdleText`, the two refs)
- Modify: `kln90b/controls/editors/DistanceEditor.tsx` (render with the idle span, `idleText`, `convertFromValue` clamp, tick)
- Modify (pin to test): `test/render/pages/right/SupPage.test.ts:384`
- Test: `test/render/controls/editors/DistanceEditor.test.ts`
- Modify: `docs/testing.md` section 8, the 2026-10-12 block (new bullet)

**Acceptance Criteria:**
- [ ] Mounted `DistanceEditor` texts: 1202.2 → ` 1202`, 10011 → `10011`, 999.95 → ` 1000`, 999.94 → `999.9`.
- [ ] With the cursor on the field (not entered), the idle text is inverse: mask `IIIII`.
- [ ] The SUP page with the far REF FAR (1200 NM due north, figure in the existing test) reads row 3 `DIS: 1202nm`; the #341 pin is an `it` asserting that row.
- [ ] An open edit shows the cells (`0__._` after the first click), and a typed distance still stops at 999.9.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/DistanceEditor.test.ts test/render/pages/right/SupPage.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests.** Add to `DistanceEditor.test.ts`:

```ts
describe('DistanceEditor, a distance of 1000 NM or more (#341)', () => {
    // Checked in the KLN 89 trainer, 2026-10-12: a reference 1000 NM or more away is accepted, and the distance shows as
    // whole NM (1323nm, 10011nm), no dashes and no message. Where the digits sit in the 90B's five cells is the code's
    // own layout: right-aligned, as the tenths of a smaller distance end there
    it.each([
        [1202.2, ' 1202'],
        [10011, '10011'],
        [999.95, ' 1000'],
    ])('characterization: shows %f as "%s" (#341)', (nm, text) => {
        expect(mountedText(new DistanceEditor(new EventBus(), nm, () => {}))).toBe(text);
    });

    // Sibling: just below the cutoff the distance keeps its tenth
    it('characterization: shows 999.94 as 999.9 (#341)', () => {
        expect(mountedText(new DistanceEditor(new EventBus(), 999.94, () => {}))).toBe('999.9');
    });

    it('characterization: inverts the whole distance under the cursor (#341)', () => {
        const editor = new DistanceEditor(new EventBus(), 1202.2, () => {});
        const m = mount(editor);
        editor.setFocused(true);
        m.tick();

        expect(m.mask()).toBe('IIIII');
    });
});
```

  Convert the #341 pin in `SupPage.test.ts` to
  `it('shows the distance of a reference 1200 NM away in whole NM (checked in the KLN 89 trainer, 2026-10-12, #341)')`
  asserting `expect(rightRows()[3]).toBe('DIS: 1202nm');` with a comment: USUP at 47.2 N and FAR at 67.2 N on one
  meridian are 20 degrees apart, 1202.2 NM on the unit's sphere (6378100 m; 20 x 60.11 NM); the trainer shows whole
  NM from 1000 NM on; the cell layout is the code's own. Confirm the distance with `distanceNm` of
  `test/harness/flight/geo.ts` and report it. The label must not claim the layout from the trainer: if the reviewer
  sees the title cite the trainer for the right alignment, split the assertion into a spec test of the digits
  (`rightRows()[3].trim()` contains `1202`) and a characterization of the row.

- [ ] **Step 2: Run, expect red.**

- [ ] **Step 3: The idle text in `Editor`:**

```tsx
    /** The cells of an editor that has an idle text (render puts them in this span) */
    protected readonly cellsRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    /** The span that shows the idle text in place of the cells */
    protected readonly idleRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    /**
     * A text that the closed field shows in place of its cells, or null to show the cells (#341: a distance that does not
     * fit the cells). An open edit always shows the cells
     */
    protected idleText(): string | null {
        return null;
    }

    /** For editors that render cellsRef and idleRef: shows the idle text or the cells. Call it from tick() */
    protected tickIdleText(): void {
        if (!TickController.checkRef(this.cellsRef, this.idleRef)) {
            return;
        }
        const text = this.isEntered ? null : this.idleText();
        if (text === null) {
            this.idleRef.instance.classList.add("d-none");
            this.cellsRef.instance.classList.remove("d-none");
        } else {
            this.idleRef.instance.textContent = text;
            this.idleRef.instance.classList.remove("d-none");
            this.cellsRef.instance.classList.add("d-none");
            if (this.isFocused) {
                this.idleRef.instance.classList.add("inverted");
            } else {
                this.idleRef.instance.classList.remove("inverted");
            }
        }
    }
```

  (import `TickController` from `"../../TickController"`). Check that `Screen` skips `d-none` the way
  `DurationDisplay`'s hidden state relies on; if happy-dom keeps whitespace of the hidden span, report it.

- [ ] **Step 4: `DistanceEditor`:**

```tsx
    public render(): VNode {
        return (<span ref={this.containerRef}><span ref={this.cellsRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}<span
            ref={this.dotRef}>.</span>{this.editorFields[3].render()}
        </span><span ref={this.idleRef} class="d-none"></span></span>);
    }

    /**
     * #341: from 999.95 NM on the distance shows as whole NM (checked in the KLN 89 trainer, 2026-10-12), right-aligned
     * in the five cells (the code's own layout)
     */
    protected idleText(): string | null {
        if (this.value === null || this.value < 999.95) {
            return null;
        }
        return String(Math.round(this.value)).padStart(5, " ");
    }

    protected convertFromValue(distance: number): Rawvalue {
        const numberString = format(Math.min(distance, 999.9), "000.0"); //#341: the cells hold at most 999.9; idleText shows more
        ...
    }

    tick(blink: boolean): void {
        super.tick(blink);
        this.tickIdleText();
        ... (the #302 point inversion as before)
    }
```

- [ ] **Step 5: Docs.** Append to the 2026-10-12 block of `docs/testing.md` section 8:

```markdown
- Distances of 1000 NM and more (#341): a waypoint 1000 NM or more from its entered reference is accepted with no
  message; its distance shows as whole NM (`1323nm`, `8768nm`, `10011nm`). The four-digit distance places of the
  waypoint pages and the NAV 2 reference line show 1000 to 9999 NM as digits and dashes from 10000 NM on. Side finding
  (medium-high): the distances match the WGS-84 ellipsoid and the long-range bearings a sphere (#364).
```

- [ ] **Step 6: Verify, `npm test`, mutation check** (make `idleText` return null; the #341 tests go red), commit:

```bash
git add kln90b/controls/editors test/render docs/testing.md
git commit -m "fixes #341 show a reference distance of 1000 NM or more as whole NM in the DIS field" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: A database NDB on a whole kHz shows no tenth (#287)

**Goal:** `NdbFreqEditor` shows a read-only (database) NDB on a whole kHz as the integer right-aligned in its six cells (`FREQ    251`, figure 3-153); a user NDB keeps its tenth (figure 5-66).

**Files:**
- Modify: `kln90b/controls/editors/NdbFreqEditor.tsx` (render with the idle span, `idleText`, tick)
- Modify (pin to test): `test/render/pages/right/NdbPage.test.ts:95`
- Test: `test/render/controls/editors/NdbFreqEditor.test.ts`

**Acceptance Criteria:**
- [ ] The NDB page of OWI on 251 kHz reads row 3 `FREQ    251`; the #287 pin is an `it` asserting the whole row.
- [ ] A mounted read-only `NdbFreqEditor` with 251 shows `   251`, with 1025 `  1025`, with 251.5 ` 251.5`; not read-only with 251 ` 251.0`.
- [ ] The user NDB of figure 5-66 still shows `328.0` (the existing test stays green).
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/controls/editors/NdbFreqEditor.test.ts test/render/pages/right/NdbPage.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests.** Convert the #287 pin to `it(` with `expect(Screen.read().rows('R')[3]).toBe('FREQ    251')`
  (read the pin for the row index and the page setup; figure 3-153 shows the frequency right-aligned, ending in the
  last cell). Add to `NdbFreqEditor.test.ts`:

```ts
describe('NdbFreqEditor, a database NDB (3-50, #287)', () => {
    // Figure 3-153 (3-50): a database NDB on a whole kHz shows the integer, right-aligned; figure 5-66 (5-18): a user
    // NDB keeps its tenth. A database NDB is the read-only editor of the NDB page
    const readonly = (khz: number) => {
        const editor = new NdbFreqEditor(new EventBus(), khz, () => {});
        editor.isReadonly = true;
        return mountedText(editor);
    };

    it('shows a database NDB on 251 kHz as 251 (3-50, figure 3-153, #287)', () => {
        expect(readonly(251)).toBe('   251');
    });

    it('characterization: shows a database NDB on 1025 kHz as 1025 (#287)', () => {
        expect(readonly(1025)).toBe('  1025');
    });

    it('characterization: keeps the tenth of a database NDB on a half kHz (#287)', () => {
        expect(readonly(251.5)).toBe(' 251.5');
    });

    it('keeps the tenth of a user NDB on a whole kHz (5-18, figure 5-66, #287)', () => {
        expect(mountedText(new NdbFreqEditor(new EventBus(), 251, () => {}))).toBe(' 251.0');
    });
});
```

- [ ] **Step 2: Run, expect red.**

- [ ] **Step 3: Fix** `NdbFreqEditor` with the idle text of Task 11: wrap the cells and the point (Task 10's `dotRef`
  span) in `<span ref={this.cellsRef}>`, add `<span ref={this.idleRef} class="d-none"></span>`, call
  `this.tickIdleText()` in `tick`, and:

```ts
    /** #287: figure 3-153, a database NDB (the read-only field) on a whole kHz shows the integer, right-aligned */
    protected idleText(): string | null {
        if (!this.isReadonly || this.value === null || Math.abs(this.value - Math.round(this.value)) > 0.001) {
            return null;
        }
        return String(Math.round(this.value)).padStart(6, " ");
    }
```

- [ ] **Step 4: Verify, `npm test`** (the inventory's variant for database NDBs only changed nothing else), mutation
  check (drop the `isReadonly` condition: the user NDB tests go red, as the inventory measured), commit:

```bash
git add kln90b/controls/editors/NdbFreqEditor.tsx test/render
git commit -m "fixes #287 show a database NDB on a whole kHz without the point and tenth" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Magnetic radials on INT, SUP and REF (#280)

**Goal:** Add helper C, `KLNMagvar.getReferenceMagvar`, and make INT and SUP show and take RAD as the magnetic radial with the reference's variation (a VOR's own, otherwise the model at the reference's position).

**Files:**
- Modify: `kln90b/data/navdata/KLNMagvar.ts` (static `getReferenceMagvar`)
- Modify: `kln90b/pages/right/IntPage.tsx` (`calculateRadialAndDistance`, `setRad`, `setDist`, `createIfReady`, a `trueRadial` helper)
- Modify: `kln90b/pages/right/SupPage.tsx` (the same, plus the stored REF radial in `calculateRef`)
- Modify (pins to tests): `test/render/pages/right/IntPage.test.ts:295,480`, `SupPage.test.ts:408,418`, `RefPage.test.ts:210`
- Test: `test/render/pages/right/SupPage.test.ts` (a non-VOR reference; a radial typed before the REF)
- Modify: `docs/testing.md` section 8, the 2026-10-12 block (new bullet)

**Acceptance Criteria:**
- [ ] The five #280 pins are `it` and pass.
- [ ] SUP of USUP with the NDB XYN 18 NM due north as REF, a variation of 15° E north of 47.4° N and 4° E south of it: `RAD: 165.0°`.
- [ ] A radial of 350.0 typed before the REF ABC (10° E), then DIS 100.0, puts QQ at `N 48°39.82'`, `E 10°30.00'` (as the REF-first pin).
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/pages/right/IntPage.test.ts test/render/pages/right/SupPage.test.ts test/render/pages/right/RefPage.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests.** Convert the five pins to `it(` and rewrite their comments. Add to `SupPage.test.ts`:

```ts
    // Checked in the KLN 89 trainer, 2026-10-12: a reference that is not a VOR (an airport, an NDB, an intersection, a
    // user waypoint) gives the radial with the unit's variation model at the reference's position. Here the variation is
    // 15 E north of 47.4 N (the NDB XYN at 47.5 N) and 4 E south of it (USUP at 47.2 N, the aircraft at 46.8 N); the
    // radial from XYN to USUP is 180 true, so 165.0 (the local variation would give 176.0)
    it('takes the variation at the position of a reference that is not a VOR (checked in the KLN 89 trainer, 2026-10-12, #280)', async () => {
        const unit = await bootUnit({
            facilities: [abc(), ndb('XYN', 47.5, 10.5)], position: POSITION, storage: SUPS(),
            magvar: (lat: number) => lat > 47.4 ? 15 : 4,
        });
        await unit.panel.selectPage('R', 'SUP  ');
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS);
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'ABC');
        await unit.panel.enterIdent('R', 'XYN');
        await unit.panel.ent();
        await unit.panel.ent();

        expect(rightRows().slice(1, 3)).toEqual(['REF:  XYN  ', 'RAD: 165.0°']);
    });

    // #280: the page keeps the magnetic radial it shows and converts it with the reference in use when it moves the
    // waypoint, so a radial typed before the REF lands as one typed after it (the sibling is the REF-first test above)
    it('characterization: converts a radial typed before the REF with that REF\'s variation (#280)', async () => {
        const unit = await createNewQq({magvar: 4, vorVariation: 10});
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();
        await unit.panel.outer('R', -2); // RAD
        await unit.panel.type('R', '3500');
        await unit.panel.ent();
        await unit.panel.cursorTo('R', '_____'); // REF
        await unit.panel.enterIdent('R', 'ABC');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.cursorTo('R', '___._'); // DIS
        await unit.panel.type('R', '1000');
        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 48°39.82'", "E 10°30.00'"]);
    });
```

  (import `ndb` from the builders. The cursor moves are a sketch: confirm each field with `unit.panel.focused('R')`
  as the file's other creation tests do. If the 5-19 flow refuses a radial before the REF, report what it shows and
  drop the second test.)

- [ ] **Step 2: Run, expect red.**

- [ ] **Step 3: Helper C** in `KLNMagvar` (imports: `Facility`, `FacilityType`, `FacilityUtils`, `VorFacility` from
  the SDK):

```ts
    /**
     * The variation that turns a true radial from a reference into the magnetic radial the unit shows, east positive.
     * A VOR (database or user) uses its own published variation; any other waypoint the variation model at its position.
     * Checked in the KLN 89 trainer, 2026-10-07 (VOR, #280) and 2026-10-12 (airport, NDB, intersection, user waypoint)
     */
    public static getReferenceMagvar(ref: Facility): number {
        if (FacilityUtils.isFacilityType(ref, FacilityType.VOR)) {
            return -(ref as VorFacility).magneticVariation; //The sim stores a VOR's variation with west positive (Nav2Page)
        }
        return MagVar.get(ref);
    }
```

- [ ] **Step 4: INT and SUP.** In both pages `this.rad` is now the magnetic radial the page shows.
  `calculateRadialAndDistance`:

```ts
        //#280: the radial is magnetic, with the variation of the reference (5-44)
        this.rad = this.props.magvar.trueToMag(refCoords.bearingTo(intCoords), KLNMagvar.getReferenceMagvar(ref));
```

  `SupPage.calculateRef`, the stored REF waypoint: `this.rad = this.props.magvar.trueToMag(facility.reference1Radial!, KLNMagvar.getReferenceMagvar(ref));`
  (`reference1Radial` stays true where it is stored, `RefPage`). Add to both pages:

```ts
    /** #280: the page keeps the magnetic radial; the geometry needs the true one, converted with the reference in use */
    private trueRadial(radial: number): number {
        return this.props.magvar.magToTrue(radial, KLNMagvar.getReferenceMagvar(this.ref!));
    }
```

  and use it in every `offset(...)`: `setRad` (`refCoords.offset(this.trueRadial(radial), ...)`), `setDist`
  (`this.trueRadial(this.rad!)`) and `createIfReady` (`refCoords.offset(this.trueRadial(this.rad), ...)`).

- [ ] **Step 5: Docs.** Append to the 2026-10-12 block of `docs/testing.md` section 8:

```markdown
- The variation of a reference that is not a VOR (#280): the radial is the true initial bearing at the reference minus
  the unit's own variation model at the reference's position (about 15.4 E for a user waypoint at 45 N 120 W; 4.2, 5.4
  and 3.8 W for an airport, an NDB and an intersection near Chicago; a user waypoint at the NDB's position gave the
  NDB's value). Any waypoint type is accepted as the reference.
```

- [ ] **Step 6: Verify, `npm test`** (the inventory measured the VOR half: only the five pins), mutation check (use the
  local variation in `getReferenceMagvar` for the non-VOR branch: the NDB test goes red; the VOR pins go red with the
  VOR branch removed), commit:

```bash
git add kln90b/data/navdata/KLNMagvar.ts kln90b/pages/right test/render docs/testing.md
git commit -m "fixes #280 show and take the INT and SUP radial as magnetic with the variation of the reference" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The radial measured at the VOR (#339)

**Goal:** NAV 2, the Super NAV 5 ARC field and CTR 1 use the initial bearing at the VOR, not the final bearing at the aircraft or the new waypoint.

**Files:**
- Modify: `kln90b/pages/left/Nav2Page.tsx:78`, `kln90b/controls/selects/SuperNav5Field3Selector.tsx:51`, `kln90b/pages/right/Ctr1Page.tsx:296`
- Test: `test/render/pages/Nav2Page.test.ts`, `test/render/controls/selects/SuperNav5Field3Selector.test.ts`, `test/render/pages/right/Ctr1Page.test.ts`
- Modify: `test/harness/render/superNav5.ts` (`superNav5OnArc` takes an optional radial)
- Modify: `docs/testing.md` section 8, the 2026-10-12 block (new bullet)

**Acceptance Criteria:**
- [ ] NAV 2 with the only VOR ABC at 47 N 11 E and the aircraft 60 NM out on its initial course 090: row 2 `ABC  090°fr` (the final bearing would show 091).
- [ ] The Super NAV 5 ARC field shows the radial of the initial bearing at the arc VOR where the two candidates round to different degrees.
- [ ] CTR 1 stores `reference1Radial` equal to `courseDeg(vor, waypoint)` of the harness geometry within 0.01°.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/pages/Nav2Page.test.ts test/render/controls/selects/SuperNav5Field3Selector.test.ts test/render/pages/right/Ctr1Page.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests.** `Nav2Page.test.ts`:

```ts
describe('NAV 2, the radial of the nearest VOR', () => {
    // Checked in the KLN 89 trainer, 2026-10-12: the radial is the true initial bearing at the VOR (minus its own
    // variation), not the bearing measured at the aircraft. 60 NM east of ABC at 47 N the two differ by about 1.1
    // degrees: initial 090, final about 091.1
    it('shows the radial measured at the VOR (3-32, checked in the KLN 89 trainer, 2026-10-12, #339)', async () => {
        const abc = vor('ABC', 47.0, 11.0);
        await nav2At(pointFrom(abc, 90, 60), [abc]);

        expect(Screen.read().rows('L')[2]).toBe('ABC  090°fr');
    });
});
```

  (import `pointFrom` from `../../harness/flight/geo`; check with `finalCourseDeg` that the final-bearing candidate
  rounds to 091 and report it.) `SuperNav5Field3Selector.test.ts`: give `superNav5OnArc` an optional
  `radial` (default 225) used for `w.at(radial, 10)`; choose a fractional radial where `courseDeg(abc, at)` and
  `finalCourseDeg(abc, at)` round to different whole degrees (for example 225.55: about 225.55 and 225.42), and
  assert the ARC field shows the initial one: a characterization (`'characterization: shows the arc radial measured at
  the VOR (#339)'`; the trainer checked NAV 2 only). `Ctr1Page.test.ts`: after the computation, the stored
  `reference1Radial` of the first Center waypoint equals `courseDeg(bgd, waypoint)` within 0.01 (a characterization;
  BGD lies due north of the crossing in `centerWorld`, so also pick or move a VOR off the meridian, otherwise the two
  candidates agree and the test proves nothing; confirm the difference first).

- [ ] **Step 2: Run, expect red.**

- [ ] **Step 3: Fix** (import `GeoPoint` where missing):
  - `Nav2Page`: `const radialTrue = new GeoPoint(vor.lat, vor.lon).bearingTo(this.props.sensors.in.gps.coords); //#339: the radial is measured at the VOR`
  - `SuperNav5Field3Selector`: the same for the ARC radial
  - `Ctr1Page.createWpt`: `reference1Radial: new GeoPoint(closestVor.lat, closestVor.lon).bearingTo(intersection.intersection), //#339`

- [ ] **Step 4: Docs.** Append to the 2026-10-12 block of `docs/testing.md` section 8:

```markdown
- NAV 2 with the Ref set to a VOR far away (#339): the radial is the true initial bearing at the VOR minus the VOR's own
  published variation, rounded to whole degrees (309 NM from ORD: 86 shown, the final bearing at the aircraft would
  give 90; 427 NM from RHI: 116 shown, the final bearing 122).
```

- [ ] **Step 5: Verify, `npm test`, mutation check** (one site back to `bearingFrom`; its test goes red), commit:

```bash
git add kln90b test docs/testing.md
git commit -m "fixes #339 measure the NAV 2, Super NAV 5 ARC and CTR 1 radials at the VOR" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: CTR 2 converts with the VOR's variation (#362)

**Goal:** Each `CenterWaypoint` carries its reference VOR's variation (helper C), and CTR 2 converts the radial with it.

**Files:**
- Modify: `kln90b/pages/right/Ctr1Page.tsx` (`CenterWaypoint.refMagvar`, `createWpt`, `getWaypointIfExistsInFpl`, the loop at about lines 212-220)
- Modify: `kln90b/pages/right/Ctr2Page.tsx:92`
- Test: `test/render/pages/right/Ctr2Page.test.ts`
- Modify: `docs/testing.md` section 9, the CTR leads (about line 1360)

**Acceptance Criteria:**
- [ ] With 10° E at the aircraft and 4° E at BGD (stored `-4`), CTR 2 shows `BGD    176°` (true 180).
- [ ] The existing `shows the radial magnetic (5-26, 5-44)` (10° E everywhere, `170°`) still passes.
- [ ] The CTR lead no longer says CTR 2 converts with the variation at the present position.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/render/pages/right/Ctr2Page.test.ts test/render/pages/right/Ctr1Page.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Test** in `Ctr2Page.test.ts` next to `shows the radial magnetic (5-26, 5-44)`:

```ts
    // #362: the radial from the reference VOR is magnetic with that VOR's own variation, the rule of #280 (checked in the
    // KLN 89 trainer, 2026-10-07, on the INT and USR pages; CTR 2 is the 90B's own page, so this is a characterization).
    // 10 E at the aircraft, 4 E at BGD: the true radial 180 is 176, not the local 170
    it('characterization: converts the radial with the variation of the reference VOR (#362)', async () => {
        const unit = await computed({magvar: 10, vorMagneticVariation: -4});
        await unit.panel.inner('R', 1);

        expect(right()[2]).toBe('BGD    176°');
    });
```

- [ ] **Step 2: Run, expect red** (`170°`).

- [ ] **Step 3: Fix.** `CenterWaypoint` gets `refMagvar: number | null` (the variation of the reference VOR, east
  positive; null when the waypoint has no reference). `createWpt` sets
  `refMagvar: KLNMagvar.getReferenceMagvar(closestVor)`; `getWaypointIfExistsInFpl` sets `refMagvar: null`, and the
  loop that collects the waypoints fills it for an existing one:

```ts
            if (wpt !== null) {
                if (wpt.refMagvar === null && wpt.wpt.reference1IcaoStruct !== undefined) {
                    //#362: CTR 2 converts the radial with the reference VOR's own variation
                    const refVor = await this.props.facilityLoader.getFacility(FacilityType.VOR, wpt.wpt.reference1IcaoStruct);
                    wpt.refMagvar = KLNMagvar.getReferenceMagvar(refVor);
                }
                this.props.memory.ctrPage.waypoints.push(wpt);
            }
```

  `Ctr2Page`:
  `this.children.get("bearing").bearing = this.props.magvar.trueToMag(wpt.wpt.reference1Radial!, wpt.refMagvar ?? undefined); //#362`.

- [ ] **Step 4: Docs.** In the CTR leads of `docs/testing.md` section 9, replace
  `CTR 2 converts the radial with the variation at the present position, NAV 2 with the VOR's own (#280 rules the VOR's own for INT, SUP and REF);`
  by `CTR 2 and NAV 2 convert the radial with the VOR's own variation (#280, #362);`.

- [ ] **Step 5: Verify, `npm test`, mutation check** (pass `undefined` in `Ctr2Page`: the new test goes red), commit:

```bash
git add kln90b/pages/right test/render docs/testing.md
git commit -m "fixes #362 convert the CTR 2 radial with the variation of the reference VOR" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Arc entry names from the magnetic radial (#363)

**Goal:** The name of a DME arc entry waypoint uses the magnetic radial with the arc VOR's own variation, wrapped at north; the stored `reference1Radial` stays true.

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts` (`getArcEntryName` and its four call sites at about lines 173-174 and 641-642)
- Test: `test/unit/data/navdata/SidStar.test.ts`

**Acceptance Criteria:**
- [ ] `getArcEntryName('ABC', 359.6, 10)` is `D000J`.
- [ ] Converting the arc approach of the file (left arc 270 to 180) around an ABC with 10° E (stored `-10`), with the aircraft on the true radial 235, names the entry `D225J`, and its `reference1Radial` is close to 235.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/unit/data/navdata/SidStar.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests** in `SidStar.test.ts`. In the describe `SidStar.getArcEntryName`:

```ts
    // A radial just below north is named 000, never 360 (the north rule of #263): characterization, #363
    it('characterization: names an entry on the radial 359.6 D000J (#363)', () => {
        expect(getArcEntryName('ABC', 359.6, 10)).toBe('D000J');
    });
```

  In the describe `the entry of an arc (1ef2a35)`, a case with a variation (the arc fixes placed on the true radials
  280 and 190, the published radials 270 and 180 magnetic, ABC stored with `magneticVariation: -10`):

```ts
        // 6-6: the name carries the radial from the VOR, which is magnetic with the VOR's own variation (real-world
        // names match "true minus the station declination", the comment on #363). The aircraft is on the true 235 radial,
        // the magnetic 225, inside the arc
        it('names the entry after the magnetic radial (6-6, #363)', async () => {
            const abcE = vor('ABC', abc.lat, abc.lon, {magneticVariation: -10});
            const arcbg = fixAt('ARCBG', 280, 10);
            const arcen = fixAt('ARCEN', 190, 10);
            const app = approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG',
                    legs: [Leg.IF(arcbg, FixTypeFlags.IAF), Leg.AF(arcen, abcE, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LEFT}), Leg.TF(fafaa, FixTypeFlags.FAF)],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            });
            const legs = await convert([abcE, arcbg, arcen, fafaa, mapaa, kprc], at(235, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D225J');
            expect((legs[0].wpt as unknown as { reference1Radial: number }).reference1Radial).toBeCloseTo(235, 0);
        });
```

  Note: until Task 17 the published radials 270 and 180 are still read as true, so the true 235 lies inside them
  either way and this test holds only the name. (Check how the existing cases read the entry's facility; adapt
  `legs[0].wpt` to the file's own accessor.)

- [ ] **Step 2: Run, expect red** (`D360J`, `D235J`).

- [ ] **Step 3: Fix.** `getArcEntryName` formats `format(roundBearing(radial), "000")` in both branches, and its JSDoc
  says the radial is magnetic. At the call sites pass the magnetic radial; add to `SidStar`:

```ts
    /** 6-6: the name carries the magnetic radial from the arc VOR, with the VOR's own variation (#363) */
    private static magneticRadial(radial: Degrees, vor: VorFacility): Degrees {
        return MagVar.trueToMagnetic(radial, KLNMagvar.getReferenceMagvar(vor));
    }
```

  and call `this.getArcEntryName(arcData.vor.icaoStruct.ident, SidStar.magneticRadial(radial, arcData.vor), dist)` (in
  `recalculateArcEntryData`) and `SidStar.getArcEntryName(vor.icaoStruct.ident, SidStar.magneticRadial(radial, vor), dist)`
  (in `getArcEntryData`). Leave `reference1Radial: radial` (true).

- [ ] **Step 4: Verify, `npm test`, mutation check** (pass the true radial again: the new test goes red), commit:

```bash
git add kln90b/data/navdata/SidStar.ts test/unit/data/navdata/SidStar.test.ts
git commit -m "fixes #363 name DME arc entry waypoints after the magnetic radial from the VOR" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The published arc radials are magnetic (#365)

**Goal:** `getArcEntryData` converts the leg's `course` and `theta` to true with the arc VOR's own variation (unless `leg.trueDegrees`) before the start point, the in-arc test and the stored `beginRadial`/`endRadial`.

**Files:**
- Modify: `kln90b/data/navdata/SidStar.ts` (`getArcEntryData`, about lines 602-672)
- Modify: `test/harness/navdata/procedures.ts:35-36` (the `AF` comment)
- Test: `test/unit/data/navdata/SidStar.test.ts`

**Acceptance Criteria:**
- [ ] Around ABC with 10° E, a left arc published from 270 to 180 magnetic (190 to 280 true): the aircraft on the true radial 285 (magnetic 275, outside the arc) gets the entry at the published beginning: named `D270J`, at `pointFrom(abc, 280, 10)` within 1e-4 degrees.
- [ ] The aircraft on the true radial 275 (magnetic 265, inside) gets `D265J`.
- [ ] The stored `arcData.beginRadial` is 280 and `endRadial` 190 (true).
- [ ] A leg with `trueDegrees` set is used unconverted.
- [ ] `npx tsc --noEmit` clean, `npm test` green.

**Verify:** `npx vitest run test/unit/data/navdata/SidStar.test.ts` → all pass

**Steps:**

- [ ] **Step 1: Tests** in the describe `the entry of an arc (1ef2a35)`, built like the Task 16 case (a helper
  `arcApproachE(turn, fromMag, toMag, variationEast)` in the same describe that places ARCBG and ARCEN on the true
  radials `fromMag + variationEast` and `toMag + variationEast` and makes ABC with `magneticVariation: -variationEast`):

```ts
        // 6-16: outside the published arc the entry is its beginning. The published radials are magnetic (the SDK
        // converts a leg's course with the origin VOR's own variation): with 10 E, the left arc 270 to 180 magnetic
        // covers 190 to 280 true. The aircraft on the true 285 (magnetic 275) is outside: the entry is the beginning,
        // on the true 280, named after the magnetic 270. Read as true, the code put the beginning on the true 270
        // (named D260J by #363's magnetic name)
        it('enters a magnetic arc at its published beginning from outside (6-16, #365)', async () => {
            const {app, facs} = arcApproachE(LEFT, 270, 180, 10);
            const legs = await convert(facs, at(285, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D270J');
            const begin = pointFrom({lat: abc.lat, lon: abc.lon}, 280, 10);
            expect(Math.abs(legs[0].wpt.lat - begin.lat)).toBeLessThan(1e-4);
            expect(Math.abs(legs[0].wpt.lon - begin.lon)).toBeLessThan(1e-4);
            expect(legs[1].arcData!.beginRadial).toBeCloseTo(280, 6);
            expect(legs[1].arcData!.endRadial).toBeCloseTo(190, 6);
        });

        // The aircraft on the true 275 (magnetic 265) is inside the published arc: the entry is on its radial. Read as
        // true (180 to 270), the code took it for outside and gave the beginning, D260J
        it('enters a magnetic arc on the aircraft\'s radial from inside (6-16, #365)', async () => {
            const {app, facs} = arcApproachE(LEFT, 270, 180, 10);
            const legs = await convert(facs, at(275, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D265J');
        });
```

  (Read the existing cases for where the entry and the `arcData` sit in `legs`; the arc data may be on the entry's
  leg or the arc leg: adapt `legs[1]`.) And a `trueDegrees` case (a characterization: the SDK flag, no unit source):
  the same leg with `trueDegrees: true` (create it with `FlightPlan.createLeg({...Leg.AF(...), trueDegrees: true})` or
  set the field on the leg), the fixes on the true 270 and 180: the radials are used as given, so the aircraft on the
  true 275 is outside and the entry is the beginning on the true 270, named after the magnetic 260: `D260J`.

- [ ] **Step 2: Run, expect red.**

- [ ] **Step 3: Fix** in `getArcEntryData`, after the VOR is loaded:

```ts
        //#365: a leg's course and theta are magnetic unless trueDegrees; the SDK converts them with the origin VOR's own
        //variation (AbstractFlightPathLegCalculator.getLegMagVar), and so does the unit (6-16)
        const magvar = KLNMagvar.getReferenceMagvar(vor);
        const toTrue = (radial: number): number => convertedLeg.leg.trueDegrees ? radial : MagVar.magneticToTrue(radial, magvar);
        const beginRadial = toTrue(convertedLeg.leg.course);
        const endRadial = toTrue(convertedLeg.leg.theta);
```

  and use `beginRadial`/`endRadial` for the beginning point (`vorPoint.offset(beginRadial, ...)`), the in-arc test
  (`start`/`end`), the fallback radial (`radial = beginRadial`) and the stored `beginRadial`/`endRadial` of the
  `ArcData`. Leave the merge of consecutive arcs (`leg.course = prev.course`, about line 434) alone: it runs on the
  raw legs before the conversion.

- [ ] **Step 4: Harness comment.** In `test/harness/navdata/procedures.ts`, the `AF` comment says the radials are
  magnetic and SidStar converts them with the VOR's own variation (with the builders' default variation of 0 they are
  the true radials too).

- [ ] **Step 5: Verify, `npm test`, mutation check** (make `toTrue` return its input: the outside test goes red),
  commit:

```bash
git add kln90b/data/navdata/SidStar.ts test/unit/data/navdata/SidStar.test.ts test/harness/navdata/procedures.ts
git commit -m "fixes #365 convert the published DME arc radials to true with the VOR's variation before using them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Close-out (controller)

- Merge the lanes into `milestone-7-number-formatting` in the order of the lanes table; resolve the appends to the
  2026-10-12 block of `docs/testing.md` section 8 by keeping every bullet. After each merge: `npx tsc --noEmit`,
  `npm run build`, `npm test`.
- Final whole-branch review (session level).
- With the maintainer's OK: merge into `master`, delete the lane branches and worktrees (junction first), and post the
  comment on #109 (the longitude and ground speed halves are fixed by the #304 and #245 commits; the date and runway
  surface stay open). Never push; never close an issue manually.
