# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A simulation of the Bendix/King **KLN 90B** GPS for **Microsoft Flight Simulator 2024**. It is written in TypeScript on
the MSFS Avionics Framework (`@microsoft/msfs-sdk`, FSComponent JSX) and runs as an HTML gauge in the Coherent GT
browser. The project ships only the instrument; aircraft embed it through `panel.cfg`/`panel.xml`.

- Branches: local work happens on `master` and GitHub's default branch is `main`. Both carry the 2.x line for MSFS 2024.
    - `fs2020` holds the 1.x MSFS 2020 line.
    - `switch-to-wt-flightplan`, `fuzzy-gps` and `analog-xtk-filter` are abandoned experiments.
- Goal: **faithful emulation of the real unit, including its quirks and limits.** The spec is the Pilot's Guide plus
  observed behaviour of real units and the KLN 89 trainer. "Improving" behaviour beyond the real unit is usually wrong.
- License is LGPL-3.0. User docs and the aircraft-developer docs are in the GitHub
  wiki (https://github.com/falcon71/kln90b/wiki).

For the wiring that takes many files to see, read **[docs/architecture.md](docs/architecture.md)**.

## Commands

```bash
npm install
npm run build          # rollup -c → build/ (a complete MSFS community package), ~7 s
npx tsc --noEmit       # type check only; currently clean, ~3 s
npm test               # all tests (Vitest: unit, render, flight)
npx vitest run --project flight   # one stage
```

- Set the env var `buildTargetDir` to build straight into the sim's community folder (e.g.
  `.../Community/falcon71-kln90b`).
  Without it the package goes to `build/`, which is gitignored.
- The build compiles `kln90b/KLN90B.tsx` and `KLN90B.scss` into
  `html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/`.
  It copies `resources/` verbatim and injects the `package.json` version into `manifest.json` and `kln90b/Version.ts`.
- The build prints about 18 "Circular dependencies" warnings and a Sass legacy-API deprecation warning. Both are
  pre-existing and harmless; just don't add new cycles.
- `resources/layout.json` is static and is not regenerated. If you add or rename an asset file, update it by hand.
- The version in `package.json` must be **at most 6 characters**, because it is shown on the unit's screen.

Tests live in `test/` and run with Vitest in three stages: unit (Node), render (happy-dom, reads the 23×7 screen) and
flight (boots the whole unit headless and flies it on simulated time). See **[docs/testing.md](docs/testing.md)**. There
is no linter and no CI; `tsc` and the build remain separate checks. Behavior changes should come with a test at the
cheapest stage that can observe them.

## Public contract with aircraft — do not break

Many third-party aircraft (A2A, Black Square, bagolu, …) depend on these interfaces. Never rename or remove them or
change what they mean; add new ones instead:

- **H events** in `kln90b/HEvents.ts`. Aircraft and hardware control the unit only through these. The `Internal_*` ones
  are private.
- **LVars** in `kln90b/LVars.ts`. Some are read-only outputs and some are writable runtime overrides of panel.xml
  options.
- **panel.xml `PlaneHTMLConfig` keys**, parsed in `settings/KLN90BPlaneSettings.ts`. `cfg/panel.xml` is the documented
  sample.
- **GPS SimVars** written when `Output.WriteGPSSimVars` is set (`SensorsOut` in `Sensors.ts`). The SDK `FlightPlanner`
  id `"kln90b"`
  is mirrored from FPL 0 by `WTFlightplanSync`.
- **Persisted user data** (setting keys, the V1/V2 waypoint and flight-plan string formats). Users keep their data
  across
  versions. Add keys with defaults; never repurpose a key or break the V1 loaders.
- If you change any of these, the wiki pages (panel.xml customization, External Annunciators, Autopilot, RMI,
  CDI/HSI, Hot Swapping, Accessing the Flight Plan) need the same change.

## Architecture in brief

- **Boot:** `KLN90B.tsx` (a thin `BaseInstrument`) creates `KLN90BCore`, whose `init()` builds everything;
  `KLN90BPlatform` supplies navdata, the facility repository and the EFB route manager (tests pass fakes). `init()`
  parses panel.xml, builds the sensors, navdata and persistence, then `VolatileMemory` and the services. It then
  publishes `propsReady` with **`PageProps`**
  (`pages/Page.tsx`), the single services bag every page and control receives. One `EventBus` is shared by everything.
  User settings are saved per aircraft model under the key `"<ATC MODEL>.profile_1"`.
- **Ticks** (`TickController.ts`): the display runs at 4 Hz (blink = every 4th tick), the calculations at 1 Hz through
  an ordered list of tickables, and the XTK output filter at 16 Hz. They run only while powered and not
  hot-swap-disabled.
  **DOM changes happen only inside display ticks** (`tick(blink)`/`redraw()`); input handlers only change state. This
  emulates the slow CRT.
- **GPS** (`Gps.ts`) wraps the SDK `GPSSatComputer` to model acquisition time, almanac validity and the GPS week
  rollover.
  Once there is a fix it uses the exact sim position; there is no noise and no RAIM. The wrapper reaches into private
  SDK internals, so recheck it after SDK upgrades.
- **Navigation** uses the project's own model, deliberately *not* the SDK flight plan or LNAV.
    - `data/flightplan/`: 26 flight plans (FPL 0 is active) of at most 30 legs, and `ActiveWaypoint` with its turn
      stack.
    - `NavCalculator.ts` (1 Hz): DTK/XTK, sequencing and turn anticipation, sim outputs.
    - `ModeController.ts`: ENR/ARM/APR and LEG/OBS modes. OBS is a direct-to from a synthetic waypoint 1000 NM away.
    - `SidStar.ts`: converts SDK procedures to KLN legs and filters out RNAV procedures.
- **Navdata:** always go through `KLNFacilityLoader`. It merges `KLNFacilityRepository` (user waypoints of *any* type;
  ICAO region `XX` = user, `XY` = temporary) with the sim database.
- **UI:**
    - `MainPage.tsx` keeps a page stack for each side plus an overlay stack for full-screen pages
      (MSG, Super NAV 1/5, SET 0).
    - `PageTreeController.ts` defines `LEFT_PAGE_TREE`/`RIGHT_PAGE_TREE`. The outer knob selects the page group and the
      inner knob the page.
    - **Pages are recreated on every knob step**, so state that must survive goes in `props.memory` (`VolatileMemory`)
      or in user settings.
    - A tree slot is identified by `instanceof`, so every slot needs a distinct class (hence `Fpl0Page`…`Fpl25Page`).
- **Rendering:** DOM text in `<pre>` using the custom font `kln90b.ttf`, on a **23×7 character grid** (each half page
  is 11×6, and row 7 is the status line). Each character cell is 9×13 px scaled ×4, which gives the 860×388 screen.
    - Keep `data/Constants.ts` in sync with the variables in `KLN90B.scss`.
    - Special symbols are mapped onto spare Latin-1/Greek/Cyrillic code points.
    - `Canvas.tsx` draws the NAV 5/Super NAV 5/APT 3 maps with hand-drawn pixel lines.
- **Input:** H event → `KLN90B.onInteractionEvent` → `PageManager` → `MainPage`.
    - Knob, CLR and cursor handlers return `boolean` (handled or not). ENT returns `EnterResult`.
    - A pushed page that does not handle a knob is popped and the event is dispatched again (KLN 89 trainer behaviour).
    - `CursorController` finds fields in the order the children are declared. It uses duck typing:
      `"isReadonly" in el` marks a field.

## Conventions

- **Manual references are the spec.** Comments like `3-29` or `5-36` are page numbers in the *KLN 90B Pilot's Guide*
  (006-08773-0000, a free download linked in the README). Comments may also cite the install or maintenance manual, a
  YouTube timestamp, or the KLN 89 trainer. Keep these references and add one when you implement or change behaviour.
- `target: es2017` is chosen for Coherent GT; don't rely on newer runtime features.
- Display text is uppercase, with only `A-Z 0-9 space -` from the database (`data/Text.ts`). Lowercase letters are small
  glyphs in the font (`nm`, `ft`, `ent`, `enr-leg`), so use them only where the real unit shows small text.
    - Page `name`s are exactly 5 characters.
    - Fixed-width output uses `format()` from `numerable` plus `padStart`/`padEnd`.
    - A null display value renders as dashes.
- Angles are stored **true** unless the name says `Mag`. Convert with `props.magvar`.
- Transient errors go to the status line: publish `statusLineMessage` with a `KLNErrorMessage` from the union in
  `controls/StatusLine.tsx`. MSG-page entries use `messageHandler.addMessage(new OneTimeMessage([...]))`, or a
  condition-driven message in `data/PersistentMessages.ts`.
- Exceptions in ticks or input are caught and shown on the on-screen `ErrorPage`. Async ticks are not caught.
- Commit messages are `fixes #NN <description>` or `references #NN <description>` for GitHub issues, and plain
  sentences otherwise.

## Reference material (copyrighted — never commit)

The maintainer has the Pilot's Guide, the Installation Manual, the Component Maintenance Manual and photos of real units
locally. **These are copyrighted: never copy their text, tables, schematics or images into the repo,** whether as code
comments, docs or commit messages. Cite page numbers and paraphrase the behaviour in your own words. When it exists,
Claude's local memory for this project holds a page index for these documents and their location.
