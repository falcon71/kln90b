# VNAV a second time (#73, #418) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new angle restarts VNAV (#418); both NAV 4 pages show the same SEL, re-entering the same VNAV waypoint keeps
VNAV, and the NAV 4 inputs reset when a descent or climb ends or its waypoint stops being valid (#73).

**Architecture:** All behavior lives in `kln90b/services/Vnav.ts` (state machine, reset) and
`kln90b/pages/left/Nav4Page.tsx` (field callbacks, redraw). Tests at the unit stage (`Vnav` with a stub nav state) and
the render stage (a booted unit read from the 23×7 screen).

**Tech Stack:** TypeScript (target es2017), Vitest (unit, render, flight projects), MSFS Avionics Framework.

**Spec:** `docs/superpowers/specs/2026-10-24-vnav-second-time-design.md` (approved 2026-10-24). Read it first.

## Global Constraints

- Branch `fix-73-vnav-second-time` (already created, based on `master`). Never push.
- Commit messages: `fixes #418 <description>` and `fixes #73 <description>`, one commit per issue, each with its tests
  and doc changes; end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Manual references are page numbers (`5-8`, `C-1`); never copy Pilot's Guide text into code, tests, docs or commits.
- Test labels cite only what the source shows: the KLN 89 trainer shows the reset and the VS behavior; the AVsoftech
  KLN 90B trainer is third party and unreliable and is named as such; the 0.0 rule, the 90B mapping of the reset
  (angle null, FR = SEL) and the reset on a Direct To elsewhere / OBS / deletion are characterizations.
- `docs/kln89-trainer-record.md` blocks are dated records: add a new block, never edit an older one.
- American English. No counts of growing collections in prose.
- Before each commit: `npx tsc --noEmit` clean and `npm test` all green (full suite, not one project).

## Review Focus

1. A pilot typing SEL, the offset or FR before anything is programmed (`nav4VnavWpt` null) must never see the entries
   cleared by the reset. Pinned in Task 2 (`keeps the inputs while no VNAV waypoint is programmed`).
2. A programmed VNAV waypoint that is still valid while VNAV is Inactive or Armed must keep every input from tick to
   tick. Pinned in Task 2 (`keeps VNAV to a waypoint further ahead through a sequence`).
3. A tiny computed angle right after the reset (aircraft a few feet off SEL) must not start VNAV under the ANGLE cursor;
   one that shows -0.1 must. Pinned in Task 2 (the 0.0 pair).
4. Re-entering the waypoint NAV 4 shows by default (the active waypoint) must count as "the same". Pinned in Task 2's
   render test, which re-enters KDDD after VNAV stored it.
5. An angle edit while Armed (not only Active) must re-arm with the new angle. Pinned in Task 1 (`re-arms an armed
   VNAV at a new angle`).

---

### Task 0: Commit the design and this plan

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/specs/2026-10-24-vnav-second-time-design.md docs/superpowers/plans/2026-10-24-vnav-second-time.md
git commit -m "references #73 #418 design and plan for VNAV a second time"
```

---

### Task 1: #418, a new angle restarts VNAV

**Files:**
- Modify: `kln90b/services/Vnav.ts` (new public method next to `armVnav`)
- Modify: `kln90b/pages/left/Nav4Page.tsx` (`setVnavAngle`)
- Test: `test/unit/services/Vnav.test.ts` (describe `Vnav states`), `test/render/pages/left/Nav4Vnav.test.ts`

**Interfaces:**
- Produces: `Vnav.setAngle(angle: Degrees): void`: stores `navState.nav4VnavAngle = angle`, sets `state` to
  `Inactive`, then calls `armVnav()`. Task 2 does not change its signature.

- [ ] **Step 1: Write the failing unit tests** (in `Vnav states`, with the existing `dct` helper; numbers hand-derived
  in the file's header comment: 1 NM = 6076.12 ft)

```ts
// 5-8 step 5 (figures 5-26, 5-27): VNAV started at the displayed angle, then -1.8 entered: armed, 753.1 s to go (#418)
it('re-arms an active VNAV at a new angle (5-8, #418)', () => {
    const {vnav, nav} = dct({distToActive: 64.8, ind: 7500, offset: 2});
    vnav.armVnav();
    expect(vnav.state).toBe(VnavState.Active);
    vnav.setAngle(-1.8);
    expect(vnav.state).toBe(VnavState.Armed);
    expect(nav.nav4VnavAngle).toBe(-1.8);
    expect(vnav.timeToVnav).toBeCloseTo(753.1, 0);
    expect(vnav.advisoryAltitude).toBeNull();
});

// KLN 89 trainer 2026-10-24: a VS shallower than required, start behind the aircraft, gives a new advisory at once.
// 29 NM to the target at -1.0: 1900 + tan(1 deg) * 29 NM = 4975.7 ft (#418)
it('starts at once on a shallower angle whose start lies behind (KLN 89 trainer, #418)', () => {
    const {vnav} = dct({distToActive: 31, ind: 7500, offset: 2});
    vnav.armVnav();
    vnav.setAngle(-1.0);
    expect(vnav.state).toBe(VnavState.Active);
    expect(vnav.advisoryAltitude).toBeCloseTo(4975.7, 0);
});

// Review Focus 5: an armed VNAV takes the new angle too: -2.5 at 64.8 NM, 5600 / tan(2.5 deg) = 21.10 NM,
// (62.8 - 21.10) NM at 160 kt = 938 s (verify by hand before asserting)
it('re-arms an armed VNAV at a new angle (#418)', () => {
    const {vnav, nav} = dct({distToActive: 64.8, ind: 7500, offset: 2, angle: -1.8});
    vnav.armVnav();
    vnav.setAngle(-2.5);
    expect(vnav.state).toBe(VnavState.Armed);
    expect(nav.nav4VnavAngle).toBe(-2.5);
    expect(vnav.timeToVnav).toBeCloseTo(938, -1);
});

it('leaves VNAV inactive on an angle of 0.0 (characterization, #418)', () => {
    const {vnav} = dct({distToActive: 64.8, ind: 7500, offset: 2});
    vnav.armVnav();
    vnav.setAngle(0);
    expect(vnav.state).toBe(VnavState.Inactive);
});
```

- [ ] **Step 2: Write the failing render test** (in the first `describe('NAV 4 VNAV')` of `Nav4Vnav.test.ts`, with
  `bootAt` and `cursorToAngle`)

```ts
// 5-8 step 5 (figures 5-26, 5-27): the cursor on ANGLE starts VNAV at -0.8, the inner knob then enters -1.8 and the
// top line becomes VNV ARMED (the start 33.5 NM ahead, 831 s at 145 kt) (#418)
it('restarts VNAV at an angle entered after the cursor started it (5-8, #418)', async () => {
    const unit = await bootAt(64.8);
    await unit.panel.show('L', 'NAV 4');
    await cursorToAngle(unit);
    expect(Screen.read().rows('L')[0]).toBe('VNV 7500ft ');

    await unit.panel.inner('L', 1);
    await vi.advanceTimersByTimeAsync(1000);

    expect(Screen.read().rows('L')[0]).toBe('VNV ARMED  ');
    expect(unit.props.memory.navPage.nav4VnavAngle).toBe(-1.8);
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run test/unit/services/Vnav.test.ts test/render/pages/left/Nav4Vnav.test.ts`
Expected: the new tests FAIL (`setAngle` missing; the render test reads `VNV13900ft `).

- [ ] **Step 4: Implement `Vnav.setAngle(angle: Degrees): void`** in `Vnav.ts`, with a comment citing 5-8 and #418,
  and change `Nav4Page.setVnavAngle` to `this.props.vnav.setAngle(angle)`.

- [ ] **Step 5: Run the tests, then the full checks**

Run: `npx vitest run test/unit/services/Vnav.test.ts test/render/pages/left/Nav4Vnav.test.ts` → PASS.
Run: `npx tsc --noEmit` → no output; `npm test` → all green. The #194 characterizations stay green unchanged.

- [ ] **Step 6: Commit**

```bash
git add kln90b/services/Vnav.ts kln90b/pages/left/Nav4Page.tsx test/unit/services/Vnav.test.ts test/render/pages/left/Nav4Vnav.test.ts
git commit -m "fixes #418 restart VNAV at a new angle entered on NAV 4"
```
(Body: one paragraph on the cause, the #194 re-arm on every tick had covered the edit; the trainer observations.)

---

### Task 2: #73, both pages in sync, the same waypoint keeps VNAV, the inputs reset at the end

**Files:**
- Modify: `kln90b/services/Vnav.ts` (`tick`, `armVnav`, a private reset helper)
- Modify: `kln90b/pages/left/Nav4Page.tsx` (`redraw`, `setVnavWpt`)
- Test: `test/unit/services/Vnav.test.ts`, `test/render/pages/left/Nav4Vnav.test.ts`
- Docs: `docs/kln89-trainer-record.md` (new block at the end), `docs/architecture.md` (the `Vnav` paragraph)

**Interfaces:**
- Consumes: `Vnav.setAngle` (Task 1), unchanged.
- Produces: a private `Vnav.resetInputs(): void` that sets `nav4VnavAngle = null`, `nav4VnavDist = 0`,
  `nav4VnavWpt = null`, `nav4FromAlt = nav4SelectedAltitude`, and leaves `nav4SelectedAltitude` alone.

**Behavior (from the spec):**
- `tick`: when an active path reaches SEL (the existing climb/descent condition), go Inactive and `resetInputs()`.
- `tick`: when `nav4VnavWpt` is not null and `isValidVnavWpt` is false, go Inactive and `resetInputs()` (any state).
  When `nav4VnavWpt` is null, keep today's behavior (Inactive, nothing else touched).
- `armVnav`: start only when `Math.round(angle * 10) !== 0` (the angle as the field shows it); this replaces
  `angle !== 0`.
- `Nav4Page.redraw`: also `this.children.get("sel").setValue(this.props.memory.navPage.nav4SelectedAltitude)`.
- `Nav4Page.setVnavWpt`: after the validity check, if `ICAO.valueEquals(wpt.icaoStruct,
  this.props.vnav.getVnavWaypoint()?.icaoStruct)` store the waypoint and do not disarm; otherwise as today.
  (Guard the null case of `getVnavWaypoint()` explicitly.)

- [ ] **Step 1: Write the failing unit tests** (`Vnav states` unless noted)

  - `resets the inputs when the descent path reaches SEL (KLN 89 trainer, #73)`: the setup of
    `goes inactive when the path reaches SEL at the target`; after the tick at 1.9 NM:
    `state` Inactive, `nav4VnavAngle` null, `nav4VnavDist` 0, `nav4VnavWpt` null, `nav4FromAlt` 1900,
    `nav4SelectedAltitude` 1900.
  - `resets the inputs when the climb path reaches SEL (KLN 89 trainer, #73)`: the climb twin's setup; the same, with
    `nav4FromAlt` 9000 and SEL 9000.
  - Extend `drops a VNAV waypoint behind the active leg (5-9, C-1)` into an `it.each` over Armed and Active, with
    `offset: 2` and `fromAlt: 3000` in the stub, asserting also `nav4VnavAngle` null, `nav4VnavDist` 0, `nav4FromAlt`
    1900 (label: `... and resets the inputs (5-9, C-1, KLN 89 trainer, #73)`).
  - `keeps VNAV to a waypoint further ahead through a sequence (KLN 89 trainer, #73)`: `vnavFor` with `fplIdx: 1,
    active: WPT_B, distToActive: 20, ind: 7500, angle: -1.8, offset: 2`, `nav.nav4VnavWpt = WPT_C`, `armVnav()`; then
    the stub's active waypoint becomes index 2 / `WPT_C` (keep a reference to the options object and mutate it, or
    rebuild the stub's `activeWaypoint`), `tick()`: `state` not Inactive, `nav4VnavWpt` WPT_C, angle -1.8, offset 2.
  - `resets the inputs when a Direct To elsewhere ends VNAV (characterization, #73)`: `vnavFor({fplIdx: -1, active:
    WPT_A, ...})` with `nav4VnavWpt = WPT_B`, angle -1.8, offset 2, state Armed; `tick()`: Inactive and reset.
  - `keeps the inputs while no VNAV waypoint is programmed (#73)`: `dct({distToActive: 64.8, ind: null, fromAlt: 7500,
    offset: 2})` with `nav4VnavWpt` null; `tick()` twice: `nav4VnavDist` 2, `nav4FromAlt` 7500, `nav4VnavAngle` null.
  - The 0.0 pair, in `Vnav angle`: 30 NM before the waypoint, SEL 1900. IND 2040 (140 ft, 0.044 deg, shown 0.0):
    `armVnav()` leaves Inactive; IND 2070 (170 ft, 0.053 deg, shown -0.1): `armVnav()` gives Active. Label:
    `(characterization, #73)`; check both angles by hand first.

- [ ] **Step 2: Write the failing render tests** (`Nav4Vnav.test.ts`)

  - `shows a SEL entered on one side on the NAV 4 of the other side (#73)`: `bootAt(64.8)`, `show('L', 'NAV 4')`,
    `show('R', 'NAV 4')`, `cursor('L')` (lands on the first SEL digit), `inner('L', 1)`, advance 1000 ms: row 3 of both
    sides is `'SEL:11900ft'`. Comment: the AVsoftech KLN 90B trainer syncs both NAV 4 pages at once (the maintainer,
    2026-10-24; unreliable source); video 6 of #73.
  - `keeps VNAV when the same waypoint is entered again (#73)`: `bootAt(64.8)`, NAV 4 left, `cursorToAngle` (active
    `VNV 7500ft `), `outer('L', -3)` (the cursor on the `KDDD ` field), `enterIdent('L', 'KDDD')`, `ent()` (waypoint
    page), `ent()` (confirm), advance 1000 ms: `vnav.state` Active and row 0 matches `/^VNV [ 0-9]{5}ft/`. Comment: the
    maintainer's ruling 2026-10-24; the AVsoftech trainer kept VNAV (unreliable); video 5 of #73. If the editor needs
    a different key sequence to re-enter an unchanged ident, follow `FrontPanel.enterIdent`'s doc and record why.
  - `cancels VNAV when a different waypoint is entered (#73)`: in the `describe` of the #338 checks (FPL KAAA, MIDAA,
    KDDD, use `armedTo('KDDD')`), NAV 4 left, cursor to the waypoint field, enter `MIDAA`, ENT, ENT: `vnav.state`
    Inactive. Comment: the KLN 89 cancels on a step to another waypoint (trainer 2026-10-24).

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run test/unit/services/Vnav.test.ts test/render/pages/left/Nav4Vnav.test.ts`
Expected: the new tests FAIL; the different-waypoint test may already pass (it holds today's rule) — say so in the
report rather than forcing a failure.

- [ ] **Step 4: Implement the behavior listed above** in `Vnav.ts` and `Nav4Page.tsx`, with comments citing 5-8,
  C-1, the KLN 89 trainer (2026-10-06, 2026-10-24) and #73.

- [ ] **Step 5: Grep for tests that rely on kept inputs**

Run: `npx vitest run` after the change and read every failure. Look especially at the #338 describe in
`Nav4Vnav.test.ts`, `ModeController*` tests that touch VNAV, and any test that reads `nav4VnavAngle` or
`nav4VnavDist` after VNAV ended. A test that asserted a kept input after an invalid waypoint is updated with a comment
naming #73; report each one.

- [ ] **Step 6: Docs**

  - `docs/kln89-trainer-record.md`: a new block at the end, headed `**2026-10-24** (agent checks for #73 and #418,
    VNAV; the KLN 89 trainer and the third-party AVsoftech KLN 90B trainer)`, in the style of the neighboring blocks.
    Source: `C:\Users\denni\AppData\Local\Temp\claude\E--msfs-kln90b\fbf9dc1a-6663-4722-8847-2c1a538a1872\scratchpad\trainer73.md`
    (both sections). Cover: the VS turned while active (countdown or new advisory, never Inactive); the waypoint
    selector (a step away cancels at once and does not come back); the reset at a sequence of the VNAV waypoint, active
    and armed, and at the end of the path with an offset (from = selected, selected kept, active waypoint, offset +00,
    VS 0, GS kept; the 89 shows it at its next recompute); VNAV to a waypoint further ahead kept through a sequence;
    the AVsoftech results labelled unreliable (ARMED on an angle edit; ENT and the same ident kept VNAV; no end state,
    a trainer defect); the maintainer's AVsoftech observation that both NAV 4 pages sync at once; the outcome (#418
    filed and fixed, #73 fixed).
  - `docs/architecture.md`, the `Vnav` paragraph: one or two sentences: an angle entered on NAV 4 re-arms
    (`setAngle`); the end of the path or an invalid programmed waypoint resets the NAV 4 inputs (angle, offset,
    waypoint, FR = SEL); VNAV starts only on an angle that shows other than 0.0.

- [ ] **Step 7: Full checks**

Run: `npx tsc --noEmit` → no output; `npm test` → all green.

- [ ] **Step 8: Commit**

```bash
git add kln90b/services/Vnav.ts kln90b/pages/left/Nav4Page.tsx test/unit/services/Vnav.test.ts test/render/pages/left/Nav4Vnav.test.ts docs/kln89-trainer-record.md docs/architecture.md
git commit -m "fixes #73 sync both NAV 4 pages, keep VNAV on the same waypoint, reset the VNAV inputs at the end"
```
(Body: the three causes from the spec's Intent section, the rulings, the trainer evidence.)
