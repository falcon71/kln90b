---
name: sim-debugger
description: Check the KLN 90B in the running MSFS 2024 sim through the Coherent GT debugger. Use it to read SimVars and LVars, read the unit's screen, load navdata (airports, VORs, NDBs, intersections) from the sim's database, or evaluate JavaScript in an instrument page. Use it when a question about behavior or navdata is cheaper to answer in the sim than to reason out, but always ask first, because the developer has to start the sim.
---

# Checking the unit in the running sim

With the sim running in developer mode, the Coherent GT debugger lists every instrument page at
`http://127.0.0.1:19999` (set `SIMDBG_HOST` for another address). `simdbg.mjs` next to this file talks to it. Run it from
the repository root:

```bash
node .claude/skills/sim-debugger/simdbg.mjs <command> [options]
```

## Ask first

- **The developer starts the sim, never you.** When a check in the sim would answer a question, offer it and wait.
  Do not probe the port to find out whether the sim happens to be running.
- **Reading is fine once the developer has agreed to a check:** SimVars, LVars, the screen, navdata, the DOM.
- **Anything that changes state needs an OK for that action:** `SimVar.SetSimVarValue`, H events, key or knob input,
  `Coherent.trigger`, calls into the unit's code, editing the DOM. The script has no write commands on purpose. A
  write goes through `eval`, after you have said what it will do.
- An evaluation runs on the instrument's JavaScript thread, and the sim waits for it like for any tick (CLAUDE.md, tick
  cost). Keep expressions small and never loop or poll inside the page.

## Commands

| Command | What it does |
|---|---|
| `pages` | Lists the inspectable pages with their id and title. |
| `simvar <name> <unit> [<name> <unit>…]` | Reads SimVars or LVars, e.g. `simvar "NAV OBS:1" degrees "L:KLN90B_Power" bool`. |
| `screen [--mask]` | Prints the 23×7 screen as the render tests read it; `--mask` adds the mask of inverse (`I`), flashing (`F`) and hidden (`B`) cells. |
| `facility <ident> [--type A\|V\|N\|W] [--region RR] [--out file]` | Loads an airport (default), VOR, NDB or intersection from the sim's navdata as the SDK receives it. |
| `eval <expression>` | Evaluates a synchronous expression and prints the value. |
| `async <expression>` | Evaluates an expression that returns a promise and prints what it resolves to, e.g. a `Coherent.call`. |

Options: `--page <id or title text>` picks the page (default: the one whose title contains `KLN90B`), `--timeout <ms>`
for `async` and `facility` (default 10000).

## What to know

- **One inspector per page.** The server resets every further connection to a page that already has an inspector,
  for example the developer's own debugger window. The script then says so. SimVars are global, so `--page VLogic` still
  reads them; the screen and the unit's own page need the developer to close their inspector.
- **The unit's code is not reachable.** Rollup bundles the SDK and the unit into one closure without globals. What a
  page shows you is the DOM, the global Coherent and SimVar APIs, and its view listeners. Read the unit's state through
  the screen and the LVars (`kln90b/LVars.ts`).
- **`screen` uses the test reader.** It transpiles `test/harness/render/screen.ts` with the project's TypeScript and runs
  it in the page, so the sim and the render tests read the screen the same way. Special symbols show as the code points
  the font maps them to (docs/architecture.md). A reader error is the same rendering error a render test would report.
- **Facilities** are searched by ident first. Several matches end with the list of regions, so pick one with
  `--region`; airport idents are unique and need none. An airport with all its data is a few hundred KB of JSON: write
  it with `--out` into the scratchpad and read the parts you need instead of printing it. Names and cities of airports
  are localization keys (`TT:AIRPORTEK.KBFI.name`). The load goes through the page's own facility listener with a
  handler that is removed again; the unit's FacilityLoader ignores the reply because it has no request queued for it.
  User waypoints live in the unit's own repository and cannot be loaded this way.
- **Large values slow the sim.** Keep results to a few hundred KB; return the fields you need rather than whole
  objects.
- The protocol is an old WebKit inspector protocol: `Runtime.evaluate` has no `awaitPromise`, so `async` parks its
  result in `window.__simdbg` and collects it with a second evaluate, then deletes it. Node's built-in `WebSocket` is
  closed by the server, which is why the script carries its own minimal client.
