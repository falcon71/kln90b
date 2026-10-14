# NavCalculator, CDI scale and outputs: design

Date: 2026-10-14. Milestone 3. Issues: #120, #121, #143, #146, #147, #159, #160, #260, #368, #372. Branch:
`m3-navcalculator`.

The session started from the nine issues of the milestone (six bugs, two questions, one enhancement). The KLN 89
trainer check for the two questions found one more bug, filed as #372 (the alert for a waypoint without a turn) and
added to the milestone.

## 1. Evidence

**Maintainer rulings (2026-10-14).**
- #372: with turn anticipation on, a waypoint without a turn alerts about 15 s before it, as measured in the KLN 89
  trainer. The KLN 89 guide (3-35) gives 36 s like the 90B guide (3-29), so the 15 s is undocumented behavior of the
  unit, and the measurement wins.
- #143: without a heading input the unit gives no roll steering: `L:KLN90B_RollCommand` is 0, also on the self-test
  page. `GPS COURSE TO STEER` is exempt and keeps being written with or without a heading input: the default autopilot
  uses it and the side effects of holding it at 0 are unknown. The code says in a comment that this is deliberate.
- #368: heading input is an aircraft configuration parameter, not a failure. An aircraft (the A2A Comanche with the
  Aspen Evolution mod) may switch it on shortly after loading. While heading input is off, a map set to HDG up is drawn
  north up, but the user setting is **not** changed; only the pilot changes it. When the input comes back, the map is
  HDG up again. Pages pick their layout when they are built; a change takes effect at the next page build (heading
  input is switched at startup, not in flight).
- The design of sections 2 to 6 was approved in chat.

**KLN 89 trainer, 2026-10-14 (evening)** (agent report in the session scratchpad `trainer/report.md`; recorded in
`docs/kln89-trainer-record.md` by the first commit). SET 1 take-home, screen sampled about every 0.22 s. High
confidence unless noted. FPL 0 KMSN, BAE, BUU: DTK 097 into BAE, then 187, a 90° right turn; start about 20 NM out at
239 kt.
- Plan leg, turn anticipation (TA) on: the arrow started flashing 3.3 NM before BAE, the DTK switched to 187 at 1.8 NM,
  BAE was sequenced at 0.7 NM, the flashing went on about 25 s into the turn, then steady.
- Direct To BAE from its FPL 0 row, TA on (a 97° turn from the Direct To course): onset 3.6 NM, DTK switch 2.0 NM,
  sequenced to BAE - BUU at 0.8 to 0.9 NM, plan resumed. Onset to DTK switch was 22 to 23 s in both runs (#146).
- Direct To C29, outside FPL 0, TA on: onset 1.0 NM (ETE :14), no DTK switch, flashing stopped at 0.0 NM, FROM, no
  sequencing. At 121 kt: onset 0.5 NM (:14, medium-high). TA off: 2.4 NM (:36). Plan leg with TA off: onset 2.4 NM,
  DTK held to the waypoint, sequenced at it (#372).
- OBS mode, BAE active, OBS 090: TA on onset 1.0 NM (:14 to :15), nothing at 2.8 NM; TA off onset 2.4 NM (:35 to :37).
  Flashing stopped at 0.0 NM, FROM, BAE stayed active: no sequencing in OBS (#147).
- FPL 0 KMSN, BAE, BUU, BUU (accepted without a message), on BAE - BUU at 119 kt, TA on (medium-high): onset 0.5 NM
  (:14), stopped at 0.0 NM, then sequenced onto `BUU -> BUU` with DTK 187 kept. Past BUU the distance and ETE counted
  up, the bearing pointed back at BUU, the CDI stayed valid and centered (`Fly R 0.03nm` 3.3 NM past), no flag, no new
  message. TO/FROM showed FROM up to 1.8 NM past, then TO (unexplained) (#120, #372).

**AVsoftech KLN 90B trainer, 2026-10-14** (third-party, unreliable; weighed below the 89 and the guide). Plan leg and
Direct To a plan waypoint alike (about 2.1 NM onset at about 160 kt, sequenced at about 0.9 NM, plan resumed). Direct
To off plan: onset about 2.0 NM, still flashing 2.2 NM past. CDI scale: ENR cycles 5.00, 1.00, 0.30; arming at 37 NM
jumped to 1.00 at once, and 5.00 stayed selectable while armed beyond 30 NM and inside it. This contradicts 5-38 (in
the approach-arm mode nothing less sensitive than 1 NM can be selected) and 6-1 (armed beyond 30 NM the scale stays
5 NM until 30 NM), so it is not used.

**Pilot's Guide.** 3-29 (Direct To alert about 36 s), 4-8 and 4-9 (alert about 20 s before turn anticipation; 36 s
with TA off; guidance to the waypoint without TA), 5-35 (OBS: no automatic sequencing, no turn anticipation), 5-38
(CDI scale choices; nothing above 1 NM in the approach-arm mode), 6-1 and 6-3 (ARM within 30 NM, the 30 s change to
±1, ACTV ramps to ±0.3). Installation Manual 2-69 and 2-70 (roll steering needs a heading input; the self-test roll
pattern), and the heading input's use for HDG-up orientation.

**Inventory (2026-10-14).** Read-only, in a detached worktree at 7f0469e; report in the session scratchpad
`inventory/report.md`, patches beside it. Baseline: 3891 tests, all green (99 expected-fail pins), `tsc` clean. Each
suggested fix was measured alone and all together with the full suite; the combination changed exactly the union of
the single runs.
- #159: no other test changes. `VolatileMemory.reset` does not reset `xtkScale`; today `setFlag` and the self-test
  branch act as its power-on reset.
- #160 and #260: no other test changes. MOD 2 fails the #260 reproduction too (scale NaN, `GPS CDI SCALING` NaN,
  `CDI:±NM`); the same fix covers it.
- #120: no other test changes. The suggested fix leaves ETE null (the return comes before the ETE block). The branch is
  also hit by tests that recover through a next leg (`duplicateWaypoint.test.ts:33`, `:54`, `NavCalculator.test.ts:52`,
  `:70`, `ModeController.test.ts:244`, `KlnEfbSaver.test.ts:66`, `:264`, `:279`) and by the #67 tests in
  `test/render/data/flightplan/ActiveWaypoint.test.ts:150`, `:166`.
- #121: the issue's "an arc leg is always between" activates the arc for an aircraft on the same DME circle beside the
  next leg (R090 in the issue's setup); deciding by the angle along the arc is right in both directions. The pin's
  fixture builds a counterclockwise circle for a right arc (`ActiveWaypoint.test.ts:121`), while `SidStar.ts:640-647`
  reverses every arc that is not a left arc; with the fixture as it is, the angle fix does not turn the pin.
- #143 (the first variant, without the `GPS COURSE TO STEER` exemption): nine other tests fly or read on the roll
  command with the harness default `HeadingInput` false: `dmeArc.test.ts:68-71` (both arcs), `:109`;
  `firstFlight.test.ts:8`; `turnDirection.test.ts:16`; `waypointAlertTurn.test.ts:25`, `:82`;
  `SensorsOut.test.ts:517` (course to steer; unaffected by the approved design), `:538`.
- #368: `headingGyro` keeps its last value when the input goes off (`Sensors.ts:236-238`). The orientation selectors
  build their choices once per page and meet a stored HDG (index 3) with a three-entry list. NAV 5 and Super NAV 5
  rotate by `headingGyro ?? 0`.

## 2. CDI scale (#160, #260, #159)

### A. One field for MOD 1 and MOD 2 (#160)

A new `CdiScaleField` (extends `SelectField`, `kln90b/controls/selects/`) replaces the duplicated
`buildValidScales`/`getScaleIdx`/`setCDIScale` of `Mod1Page` and `Mod2Page`. It reads the nav state.

Choices by mode:
- ENR (LEG and OBS): 0.3, 1, 5.
- ARM (LEG and OBS): 0.3, 1, and 5 only while the scale is exactly 5 (armed beyond 30 NM, 6-1). Once the pilot or the
  30 s ramp leaves 5, it drops out and cannot be selected again (5-38).
- APR: 0.3.

The value shown is the step the scale is at or heading to: below 1 shows 0.30, from 1 to below 5 shows 1.00, 5 shows
5.00, and APR always shows 0.30 (so the activation tick, with the scale still exactly 1, is no longer blank). This
display rule for the ramps is a characterization.

### B. A knob click after a mode change (#260)

The field rebuilds its choices in its display tick and keeps the list it last displayed. A knob click steps within that
list and sets the scale from it, so a mode change between display ticks can no longer index into another mode's list.
Tests on MOD 1 (the pin) and MOD 2 (new).

### C. A NAV flag keeps the scale (#159)

`NavCalculator.setFlag` no longer sets `xtkScale = 5`. `VolatileMemory.reset` sets `xtkScale = 5`, so the power-on
value no longer depends on the flag. The self-test keeps its own 5.

## 3. NavCalculator alerts and the zero-length leg (#146, #372, #147, #120)

### A. Direct To a plan waypoint with a following leg (#146)

No code change: the code already anticipates the turn onto the next plan leg, which the 89 showed. A render test holds
it (alert about 20 s before the turn, DTK switch before the waypoint, plan resumed after it), citing the trainer check
of 2026-10-14 for what the 89 showed. The commit says `fixes #146`.

### B. A waypoint without a turn (#372)

In the branch without a turn to anticipate (no following leg, a fly-over, or a following copy of the same waypoint),
the alert is on while the waypoint is ahead (TO) and the ETE is at most 15 s with turn anticipation on, 36 s with it
off; a turn still being flown keeps it on (#156). After passing the waypoint (FROM) it is off. The existing test
`NavCalculator.test.ts:229` (36 s with TA on, citing 3-29) becomes a test of 15 s citing the trainer check; the 4-9
test (TA off, 36 s) stays. A plain last waypoint of FPL 0 (no duplicate) was not flown on the 89; it takes the same
branch and is a characterization, as is a fly-over waypoint.

### C. OBS mode (#147)

In OBS mode the same rule computes the alert (B); there is still no sequencing (5-35).

### D. A final zero-length leg (#120)

When the active leg's FROM and TO are the same waypoint and sequencing cannot advance (it is the last leg), the unit
keeps navigating on the course of the leg before it, as the 89 did: XTK and DTK from that leg's path, TO/FROM against
that DTK, distance, bearing and ETE to the waypoint as usual, and all outputs written (`setOutput`). The FROM-to-TO flip
the 89 showed 1.8 NM past is not modeled. A plan with no leg before it (`[KAAA, KAAA]`) leaves XTK, DTK and TO/FROM
null and keeps distance, bearing and ETE (characterization). A zero-length leg with a next leg keeps today's immediate
sequencing.

## 4. DME-arc leg activation (#121)

For an arc leg, `findClosestLegIdx` decides "between" by the angle along the arc circle: FROM and TO are projected onto
the circle, and the aircraft's closest point is between when its angle along the circle from FROM is at most TO's
(`GeoCircle.angleAlong`, in the circle's own direction). Great-circle legs keep the chord test. The pin's fixture gets
its circle in the direction `SidStar` builds for a right arc, and a new test puts the aircraft on the same DME circle
beside the next leg (R090 in the issue's setup) and expects the next leg.

## 5. Heading input (#368, then #143)

### A. `L:KLN90B_HeadingInput` (#368)

- A writable `L:KLN90B_HeadingInput` (Bool) in `LVars.ts`, "changes Input.HeadingInput from the panel.xml on the fly".
  The parser writes it after parsing (`KLN90BPlaneSettings.ts`), and `SimVarSync.tick` copies it into
  `input.headingInput`, like `L:KLN90B_ObsSource`.
- While heading input is off, `Sensors` sets `headingGyro` to null.
- **HDG up without heading input.** The stored orientation (`nav5MapOrientation`, `superNav5MapOrientation`) is never
  changed by the unit. While heading input is off and the setting is HDG up, NAV 5 and Super NAV 5 draw north up, and
  their orientation fields show `N^` (the choice lists are N, DTK, TK). Turning the knob on such a field changes the
  setting as any pilot choice does. When heading input is on again, the stored HDG up applies again.
- CAL 3, OTH 9 and the orientation choice lists keep picking their layout when the page is built; a change takes effect
  at the next page build.
- The `cfg/panel.xml` comment of `HeadingInput` says it is synced with `L:KLN90B_HeadingInput`.

### B. No roll steering without heading input (#143)

- `RollSteeringController` gets the plane settings. With heading input off, `L:KLN90B_RollCommand` is 0 (Installation
  Manual 2-69), also on the self-test page (the 2-70 pattern needs roll steering).
- `GPS COURSE TO STEER` is computed and written as today with or without heading input. A comment at the write states
  that this is a deliberate decision (the default autopilot uses it; holding it at 0 has unknown side effects).
- The flight harness (`Flight.start`) defaults to `HeadingInput` true: its coupled autopilot models an installation with
  roll steering. `SensorsOut.test.ts:538` sets heading input explicitly. New tests hold the roll command at 0 without
  heading input in navigation and on the self-test page, and `GPS COURSE TO STEER` still written without it.
- The `cfg/panel.xml` comment says roll steering (`L:KLN90B_RollCommand`) needs `HeadingInput`.

### C. Outside the repository (for the maintainer)

The wiki and the release notes are not in the repository. Drafts:
- **Release note (#143, #368):** `L:KLN90B_RollCommand` is now 0 unless the unit has a heading input
  (`Input.HeadingInput` true in panel.xml, or `L:KLN90B_HeadingInput` set to 1 at runtime), as on the real unit.
  `GPS COURSE TO STEER` is not affected. Aircraft that fly the roll command should enable the heading input.
- **Wiki, Autopilot:** the roll command needs a heading input (panel.xml `Input.HeadingInput` or
  `L:KLN90B_HeadingInput`); without it the value is 0. `GPS COURSE TO STEER` is written either way.
- **Wiki, panel.xml customization:** `Input.HeadingInput` is synced with the writable `L:KLN90B_HeadingInput`; it
  enables roll steering, HDG up on NAV 5 and Super NAV 5, and the heading on CAL 3 and OTH 9. A runtime change applies
  to a page when it is next shown; a stored HDG-up setting is kept and drawn north up while the input is off.

## 6. Tests, labels, docs and order

- Each fix commit turns its pins into passing tests (`it.fails` to `it`, the issue number kept in the title) and adds
  tests at the cheapest stage for what no pin holds (named in sections 2 to 5).
- **Labels.** A test cites only what its source literally shows. The trainer supports only what the 89 showed: one
  knob pair, no ARM/ACTV annunciation, no Super NAV 5, no external annunciators or indicators, no roll steering, no
  heading input. The 15 s onset, the OBS alert, the end at the waypoint and the zero-length-leg navigation cite the
  trainer check of 2026-10-14. The CDI scale display rule for ramps, the `[KAAA, KAAA]` case, the plain last waypoint,
  the page-build timing of #368 and the orientation fallback are characterizations. The AVsoftech trainer is cited by
  no test.
- Every implementer applies the fix, runs `npx tsc --noEmit` and the full `npm test` before committing, and greps the
  suite for tests that use the bug as a vehicle. Each fix gets a named mutation in its report.
- Each commit updates the docs lines that describe its bug (`grep -n '#NN' docs/ test/`), including `docs/architecture.md`
  where it describes the changed behavior.
- No manual text in code, tests, docs, commits or issues; page numbers and paraphrase only.
- **Branch and integration.** Integration branch `m3-navcalculator`. The first commit (docs only) adds the 2026-10-14
  evening trainer block to `docs/kln89-trainer-record.md`; dated blocks are never edited afterwards. Lanes work in
  worktrees that start with `git merge --ff-only m3-navcalculator` and are integrated linearly by cherry-pick. One
  `fixes #NN` commit per issue.

| Lane | Commits, in order | Owns |
|---|---|---|
| A. NavCalculator | #146, #372, #147, #120, #159 | `NavCalculator.ts`, `VolatileMemory.ts`, their tests |
| B. CDI scale | #160, #260 | `CdiScaleField`, `SelectField.tsx` (if it needs a setter), `Mod1Page.tsx`, `Mod2Page.tsx`, their tests |
| C. Arc activation | #121 | `ActiveWaypoint.ts`, `test/unit/data/flightplan/ActiveWaypoint.test.ts` |
| D. Heading input | #368, #143 | `LVars.ts`, `KLN90BPlaneSettings.ts`, `SimVarSync.ts`, `Sensors.ts`, `MapOrientationSelector.tsx`, `SuperNav5Right.tsx`, `Nav5Page.tsx`, `SuperNav5Page.tsx`, `Cal3Page.tsx`, `Oth9Page.tsx`, `RollSteeringController.ts`, `KLN90BCore.ts`, the flight harness, `cfg/panel.xml`, their tests |

The lanes share no source file. Test files that two lanes would touch are assigned by the plan.

**Close-out:** no issue is closed manually; the `fixes #NN` commits close them when the maintainer pushes. The trainer
observations of 2026-10-14 and the driving notes of the trainer agent also go into the project memory.

## 7. Out of scope

- #157 (a waypoint passed far abeam is never sequenced), #100 (the roll steering rework).
- The 89's FROM-to-TO flip 1.8 NM past a final zero-length leg.
- RAIM-dependent behavior (not modeled).
