# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. **It is the
`fs2020` branch.** The `master` branch has its own, different CLAUDE.md.

## What this is

A simulation of the Bendix/King **KLN 90B** GPS for **Microsoft Flight Simulator 2020**: the 1.x line. It is written in
TypeScript on the MSFS Avionics Framework (`@microsoft/msfs-sdk` **0.8.0**, FSComponent JSX) and runs as an HTML gauge
in the Coherent GT browser. The project ships only the instrument; aircraft embed it through `panel.cfg`/`panel.xml`.

- Branches:
    - `fs2020` holds this 1.x line for MSFS 2020. Local work on it happens on `fs2020`.
    - `master` (GitHub's default branch is `main`) holds the 2.x line for MSFS 2024. That is where the project is
      developed. It split from `fs2020` at commit `38ae708f` (2025-01-27) and has moved far away since.
    - `switch-to-wt-flightplan`, `fuzzy-gps` and `analog-xtk-filter` are abandoned experiments.
- **This line is in maintenance.** It gets no new features, only **critical bug fixes and compatibility for aircraft
  developers**, backported from `master`. No refactors, no cleanups on the side, no "while we are here" fixes.
- **There are no automated tests on this branch, and none are added.** Do not port `test/`, Vitest or any test
  infrastructure from `master`.
- Goal, as on master: **faithful emulation of the real unit, including its quirks and limits.** The spec is the Pilot's
  Guide plus observed behavior of real units and the KLN 89 trainer.
- License is LGPL-3.0. User docs and the aircraft-developer docs are in the GitHub
  wiki (https://github.com/falcon71/kln90b/wiki). The wiki follows the 2.x line, so it can describe features this line
  does not have.

For the wiring that takes many files to see, and for what this line lacks compared with master, read
**[docs/architecture.md](docs/architecture.md)**.

## Commands

```bash
npm install            # after every switch from master: the dependencies differ
npm run build          # rollup -c → build/, ~8 s
npx tsc --noEmit       # type check only; clean, ~3 s
```

There is no `npm test` and no linter. `tsc` and the build are the only checks. There is no CI workflow on this branch.

- **`node_modules` is shared with master in the same checkout.** Master uses SDK 2.x, TypeScript 6 and Vitest; this
  branch uses SDK 0.8.0, TypeScript 5.4 and the `numerable` package. After switching to `fs2020`, run `npm install`
  (check `node_modules/@microsoft/msfs-sdk/package.json` says 0.8.0). Switching back to master needs `npm install` there
  again. A worktree needs its own `npm install`; never link master's `node_modules` into it.
- **`tsc` needs the local `types/` folder.** The MSFS globals (`BaseInstrument`, `SimVar`, `Avionics`,
  `registerInstrument`, …) come from `types/msfstypes/`, which is gitignored and exists only on the maintainer's machine.
  `tsconfig.json` has no `include`, so it picks the folder up. Without it `tsc` reports dozens of "Cannot find name"
  errors. A worktree needs a copy of it.
- Set the env var `buildTargetDir` to build straight into the sim's community folder. Without it the output goes to
  `build/`, which is gitignored. The build creates that folder when it is missing.
- **The build produces only part of the package**: `KLN90B.js` (+ map) and `KLN90B.css` in
  `html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/`, and `manifest.json` with the version injected. It does
  not copy `KLN90B.html` or the fonts (both at the repo root here), the `Assets/` folder (fonts, `msa.json`) or
  `layout.json`. They have to be in the target package already. (Master moved all of them into `resources/`.) The
  `KLN90B.css` at the repo root is a stale copy; the build compiles `KLN90B.scss`.
- The build prints about 18 "Circular dependencies" warnings. They are pre-existing and harmless; just don't add new
  cycles.
- The version in `package.json` (now `1.6b1`) must be **at most 6 characters**, because it is shown on the unit's
  screen. Don't change it unless the maintainer asks; releases are theirs.

## Backporting a fix from master

The usual request on this branch is "backport issue #NN to the 2020 version". Work through it in this order.

1. **Read the issue** on GitHub (the GitHub MCP tools; `falcon71/kln90b`) and find every master commit for it:
   ```bash
   git log master --format='%h %ad %s' --date=short -E --grep='#NN([^0-9]|$)'
   ```
   A fix is usually `fixes #NN …`. `references #NN pin: …` commits only add an `it.fails` test, so they have nothing
   to port, and `Session …` commits that name the issue are test-suite work. A fix can also be spread over a `references #NN` and a later `fixes #NN` commit. Read the master docs
   that come with it the same way: `git show master:docs/architecture.md`, `git show master:CLAUDE.md`, and the design
   notes under `docs/superpowers/specs/` on master.
2. **Check that the bug exists on fs2020.** Code written on master after the split (`38ae708f`) is not here, so the bug
   may not be either. Compare the master file with the fs2020 file (`git diff fs2020 master -- <path>`, `git log
   38ae708f..master -- <path>`), and trace the same input through the fs2020 code. A bug that cannot happen here needs
   no backport: say so and stop.
3. **Check what the fix stands on.** Master fixes often build on earlier master work that is not here (the sequencing
   rework, the start model of the GPS, the room question of FPL 0, `NumberFormat`, ICAO V2, …).
   [docs/architecture.md](docs/architecture.md) lists, per area, which master issues this line lacks; search it for the
   issue numbers the master commit and its comments name. If the fix needs any of them, do not port them silently:
   tell the maintainer what the fix needs and offer the options (port the prerequisite too, adapt the fix to the
   fs2020 code, or leave it).
4. **Decide whether it qualifies.** Only critical bug fixes (wrong navigation, crashes, errors on screen, lost user
   data) and aircraft compatibility (an H event, LVar, SimVar or panel.xml behavior that aircraft depend on) belong
   here. If the issue looks like neither, ask the maintainer before porting it.
5. **Branch.** Create a development branch from `fs2020` before the first edit, e.g. `fs2020-backport-NN`.
6. **Port.** Try `git cherry-pick -x <sha>` first. Drop every hunk under `test/`, `docs/`, `.claude/` and `.github/`,
   and the master CLAUDE.md. Where it conflicts, port by hand: the smallest change to the fs2020 code that has the same
   effect. Translate master-only helpers to what this branch uses:

   | master | fs2020 |
   |---|---|
   | `padInt(v, 3)`, `padFixed(v, 2, 1)`, `withSign(v, t)` (`data/NumberFormat.ts`, #447) | `format(v, "000")`, `format(v, "00.0")`, a `"+00"` mask with `{zeroFormat: "+00"}` (`numerable`) |
   | `IcaoValue`, `ICAO.value…`, `ICAO.valueToStringV2`, `facility.icaoStruct` | plain 12-character V1 ICAO strings, `ICAO.getIdent`, `buildIcao` (`data/navdata/IcaoBuilder.ts`) |
   | `KLN90BCore` / `KLN90BPlatform` | `KLN90B` in `KLN90B.tsx` does everything |
   | `PowerSupply` | `PowerButton` (no ride-through) |
   | `Hardware.isDisabled` | the private `disabled` flag in `SimVarSync` |
   | `StatusLineMessage` | `KLNErrorMessage` (same `statusLineMessage` topic) |
   | `props.facilityRepository` | `props.facilityLoader.facilityRepo` |
   | `KlnEfbLoader` / `KlnEfbSaver` (EFB route sync) | `AsoboFlightplanLoader` / `AsoboFlightplanSaver` (the sim's ATC flight plan) |
   | SDK 2.x API | check that the API exists in SDK 0.8.0 before using it (`node_modules/@microsoft/msfs-sdk/*.d.ts`, after `npm install`) |

   Keep master's manual-page comments (`3-29`) on the code you port.
7. **Verify.** `npx tsc --noEmit` and `npm run build` must be clean. There are no tests, so trace the fixed path
   through the fs2020 code by reading it, and tell the maintainer exactly what to check in MSFS 2020: the steps, and
   what they should see before and after. You cannot run the 2020 sim yourself. (The `sim-debugger` skill on master
   is for MSFS 2024 and is not on this branch.)
8. **Commit**, one commit per issue, with the fix and nothing else. The message is the master commit's first line with
   `(backported to 2020)` appended, then a blank line and `(cherry picked from commit <full master sha>)`, which
   `-x` adds for you and you add by hand when you ported by hand. A `fixes #NN` here closes nothing on GitHub, because
   only commits on the default branch close issues; never close or comment-close an issue yourself.
9. **Merge** into `fs2020` locally once the maintainer approves, then delete the development branch. Never push, never
   merge `master` into `fs2020` or `fs2020` into `master`, and never rebase `fs2020`.

The earlier backports are examples: `git log --format='%h %s' 38ae708f..fs2020` (#43, #49, #84, #87). #84 on fs2020
is the backport of master's #76; issue numbers of the two lines can differ when the maintainer filed a separate issue.

## Public contract with aircraft — do not break

Third-party aircraft for MSFS 2020 depend on these interfaces, and many aircraft ship for both sims. Never rename or
remove them or change what they mean. **A backported interface keeps exactly the name and meaning it has on master**,
so that an aircraft works with both lines (as `L:KLN90B_IntegrityWarn`, #87, did).

- **H events** in `kln90b/HEvents.ts`. Aircraft and hardware control the unit only through these. The `Internal_*`
  ones are private. This line lacks master's `KLN90B_Power_On`/`_Power_Off` (#51) and the keyboard toggles (#83).
- **LVars** in `kln90b/LVars.ts`. Some are read-only outputs and some are writable runtime overrides of panel.xml
  options.
- **panel.xml `PlaneHTMLConfig` keys**, parsed in `settings/KLN90BPlaneSettings.ts`. `cfg/panel.xml` is the sample.
- **GPS SimVars** written when `Output.WriteGPSSimVars` is set (`SensorsOut` in `Sensors.ts`). The SDK
  `FlightPlanner` id `"kln90b"` is mirrored from FPL 0 by `WTFlightplanSync`.
- **The sim's flight plan**: FPL 0 is loaded from the sim's ATC flight plan at every start (`AsoboFlightplanLoader`)
  and written back on every change when `Output.WriteGPSSimVars` is set (`AsoboFlightplanSaver`). SET 10 can import
  `/VFS/flightplan/kln/kln.pln` (`FplFileimporter`). Master replaced all of this with the EFB route sync; that does not
  exist here.
- **Persisted user data** (setting keys and the **V1** waypoint and flight-plan string formats). This line reads and
  writes only V1 and has no `userDataFormat`. Never write master's V2 formats here; add keys with defaults, never
  repurpose one.

## Architecture in brief

- **Boot:** `KLN90B.tsx` is a `BaseInstrument` that does everything itself (there is no `KLN90BCore` or platform
  split). Its constructor sets up the bus and the user settings, saved per aircraft model under
  `"<ATC MODEL>.profile_1"`. `Init()` starts `asyncInit()`, which parses panel.xml, creates `PowerButton`, the sensors,
  the navdata, the persistence, `VolatileMemory`, the services and the `TickController`, then publishes `propsReady`
  with **`PageProps`** (`pages/Page.tsx`), the single services bag every page and control receives. One `EventBus` is
  shared by everything. `asyncInit` has no error handling: a call that never answers leaves the unit on the Turn-On
  page with no error.
- **Ticks** (`TickController.ts`): the display runs at 4 Hz (blink = every 4th tick), the calculations at 1 Hz through
  an ordered list of tickables, and the XTK output filter at 16 Hz. They run only while powered and not
  hot-swap-disabled, and they exist only once `asyncInit` has built them.
  **DOM changes happen only inside display ticks** (`tick(blink)`/`redraw()`); input handlers only change state. This
  emulates the slow CRT.
- **Tick cost is the sim's frame time.** The sim stalls while instrument JS runs, so keep a 1 Hz tick cheap: throttle
  expensive work (the nearest and airspace searches run every 10 s) and reuse cached objects in hot paths.
- **GPS** (`Gps.ts`) wraps the SDK 0.8 `GPSSatComputer` (`KLNGPSSatComputer`). The search starts only when the self-test
  is approved (or at once on an engine-running start). Almanac validity adds a 10-minute clock and 60 NM position rule
  on top of the SDK's. Once there is a fix it uses the exact sim position; there is no noise and no RAIM. The wrapper
  reaches into private SDK 0.8 internals.
- **Navigation** uses the project's own model, deliberately *not* the SDK flight plan or LNAV.
    - `data/flightplan/`: 26 flight plans (FPL 0 is active) of **at most 30 legs each, procedures included**, and
      `ActiveWaypoint` with its turn stack.
    - `NavCalculator.ts` (1 Hz): DTK/XTK, sequencing and turn anticipation (the old algorithm), sim outputs.
    - `ModeController.ts`: ENR/ARM/APR and LEG/OBS modes. OBS is a direct-to from a synthetic waypoint 1000 NM away.
    - `SidStar.ts`: converts SDK procedures to KLN legs and filters out procedures with RF legs.
- **Navdata:** always go through `KLNFacilityLoader`. It merges `KLNFacilityRepository` (user waypoints of *any* type;
  ICAO region `XX` = user, `XY` = temporary) with the sim database.
- **UI:**
    - `MainPage.tsx` keeps a page stack for each side plus an overlay stack for full-screen pages
      (MSG, Super NAV 1/5, SET 0).
    - `PageTreeController.ts` defines `LEFT_PAGE_TREE`/`RIGHT_PAGE_TREE`. The outer knob selects the page group and the
      inner knob the page.
    - **Pages are recreated on every knob step**, so state that must survive a page change goes in `props.memory`
      (`VolatileMemory`), which is reset at every power-on. State the unit keeps over a power cycle is a user setting.
    - A tree slot is identified by `instanceof`, so every slot needs a distinct class (hence `Fpl0Page`…`Fpl25Page`).
- **Rendering:** DOM text in `<pre>` using the custom font `kln90b.ttf`, on a **23×7 character grid** (each half page
  is 11×6, and row 7 is the status line). Each character cell is 9×13 px scaled ×4, which gives the 860×388 screen.
    - Keep `data/Constants.ts` in sync with the variables in `KLN90B.scss`.
    - Special symbols are mapped onto spare Latin-1/Greek/Cyrillic code points.
    - `Canvas.tsx` draws the NAV 5/Super NAV 5/APT 3 maps with hand-drawn pixel lines.
- **Input:** H event → `KLN90B.onInteractionEvent` → `PageManager` → `MainPage`.
    - Knob, CLR and cursor handlers return `boolean` (handled or not). ENT returns `EnterResult`.
    - `CursorController` finds fields in the order the children are declared. It uses duck typing:
      `"isReadonly" in el` marks a field.

## Conventions

- **Manual references are the spec.** Comments like `3-29` or `5-36` are page numbers in the *KLN 90B Pilot's Guide*
  (006-08773-0000, a free download linked in the README). Comments may also cite the install or maintenance manual, a
  YouTube timestamp, or the KLN 89 trainer. Keep these references and carry them over in a backport.
- `target: es2017` is chosen for Coherent GT; don't rely on newer runtime features.
- Display text is uppercase, with only `A-Z 0-9 space -` from the database (`data/Text.ts`). Lowercase letters are small
  glyphs in the font (`nm`, `ft`, `ent`, `enr-leg`), so use them only where the real unit shows small text.
    - Page `name`s are 5 characters.
    - Fixed-width numbers use `format` from `numerable` with a mask (`format(v, "000")`) plus `padStart`/`padEnd`.
    - A null display value renders as dashes.
- Angles are stored **true** unless the name says `Mag` (the OBS course, `navPage.obsMag`, is stored magnetic here).
  Convert with `props.magvar`.
- Transient errors go to the status line: publish `statusLineMessage` with a `KLNErrorMessage` from the union in
  `controls/StatusLine.tsx`. MSG-page entries use `messageHandler.addMessage(new OneTimeMessage([...]))`, or a
  condition-driven message in `data/PersistentMessages.ts`.
- Exceptions in ticks or input are caught and shown on the on-screen `ErrorPage`. Async ticks and `asyncInit` are not
  caught.
- Commit messages: see step 8 of the backport recipe. Other commits are plain sentences. **One commit per issue.**

## Bugs go to GitHub issues

Report a bug you spot on GitHub (https://github.com/falcon71/kln90b/issues), as on master:

- **Check first whether it is already known**, in open *and* closed issues, with a few wordings. Most bugs of this
  line were found and fixed on master later; [docs/architecture.md](docs/architecture.md) names many of them by issue
  number. A bug that master fixed is a backport candidate, not a new issue: mention it to the maintainer instead.
- **A bug only this line has** (the sim's flight plan sync, SDK 0.8 behavior, SET 10 import, …) gets a new issue with
  the `bug` label. Say in the title that it is the 2020 version, and give a reproduction, the file and line on `fs2020`,
  the impact and a suggested fix.
- **Do not fix it on the side** of unrelated work. There are no tests here to pin it with.
- Cite manual pages in issues; never copy manual text into them (see below).

## Reference material (copyrighted — never commit)

The maintainer has the Pilot's Guide, the Installation Manual, the Component Maintenance Manual and photos of real units
locally. **These are copyrighted: never copy their text, tables, schematics or images into the repo,** whether as code
comments, docs or commit messages. Cite page numbers and paraphrase the behavior in your own words. When it exists,
Claude's local memory for this project holds a page index for these documents and their location.
