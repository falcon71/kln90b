# Power cycle issues #192, #332, #400: design

Date: 2026-10-24. Issues: #192 (question), #332 (bug), #400 (bug). Branch: `power-cycle`.

Three issues about what a power cycle does. Each fix is its own `fixes #NN` commit with its tests, its doc changes and
its trainer-record block (CLAUDE.md); a plain rename commit comes before #332.

## 1. Intent

**#192, the rule (maintainer, 2026-10-24).** `VolatileMemory` must be what its name says. State the real unit keeps over
a power cycle must be a **user setting**, because only user settings survive a sim restart. Everything else is reset at
every power-on. One exception: state the unit keeps only over a **short** interruption (off for 5 minutes or less, 6-5)
stays in `VolatileMemory` behind the `RESET_TIME` check, and **a sim restart always counts as more than 5 minutes**
(`PowerButton` already starts with an off time of one hour).

So after this change a power cycle of more than 5 minutes and a sim restart leave the unit in the same state.

**#332.** A loss of the aircraft power of under about 1.5 s must not restart the unit; its battery module carries it.

**#400.** A power-off during the self-test must not leave the self-test outputs on at the next Turn-On page.

**Non-goals.** State held by services outside `VolatileMemory` (AltAlert, Vnav, Timers caches) is not audited here. A
battery charge model (a discharged pack, repeated dropouts) is not built. The page shown within a page group after a
power-on (the 89 opens CAL on CAL 1) is not changed.

**Anti-goals.** Breaking persisted user data (new keys get defaults; no key is repurposed). Changing the meaning of the
panel.xml `ElectricitySimVar` beyond the ride-through. Randomness in the ride-through.

## 2. Evidence

**Pilot's Guide (KLN 90B).** 3-3: the unit always powers up in ENR-LEG with ±5 NM. 3-8: after the start-up the right
side shows the page of the last active waypoint (APT 4 for an airport). 4-13: SET 4 "run when power is on" counts from
power-on. 5-14, 5-15: CAL 6 and CAL 7 tie their first view to the turn-on. 5-22, 5-26: reference and center waypoints
not in a plan are purged at power-off. 6-5, 6-23: procedures are deleted from FPL 0 after more than 5 minutes off.
**KLN 89 Pilot's Guide** 4-46, 4-47: a manually entered magnetic variation is kept over a power cycle unless the unit
was off for more than 5 minutes (the 90B guide is silent, 5-44).

**Maintenance manual (#332).** PDF 53, 54 and the battery module test on PDF 107: the unit operates through an aircraft
power interruption of up to 1 s with no flag or abnormal indication. PDF 79: the battery switch-over is ended by an RC
timer, nominally about 1.5 s; power coming back before it expires resets the circuit.

**KLN 89 trainer, 2026-10-24** (agent check; relaunch is its only power cycle; 20 s, 15 s and 27 min off gave identical
results, so it does not model the off time). What it keeps may be the trainer's own data file, but what it resets it
resets deliberately:
- Reset: VNAV selected altitude (to 0, two entries), VNAV waypoint (to the active), VNAV offset (to 0), departure and
  flight time, the CAL 3 alarm, the elapsed timer (restarts), the manual magnetic variation (back to auto after 20 s,
  against 4-47), LEG/OBS mode (Leg; the old OBS course is not offered), the page within the CAL group (CAL 1).
- Kept: trip waypoints (CAL 1 From/To), GS, fuel flow, reserve, CAL 7 heading, the manual indicated altitude, the VNAV
  GS, and **the last viewed waypoint of the APT and VOR pages** (40D, DLL).
- CAL 7 TAS came back 0, possibly re-derived from CAL 6.

**AVsoftech KLN 90B trainer, 2026-10-24** (third-party, unreliable; power button; 15 s and 6 min 50 s off, identical):
keeps NAV 4 selected altitude, offset and angle, TRI 0 TAS and wind, fuel flow, reserve, the TRI 1 waypoint, the TRI 5
plan number, the departure time and the OBS mode (against 3-3). Resets the CTR computation (agrees with 5-22, 5-26). The
right side comes up on the active waypoint (agrees with 3-8); its APT page came back on an older airport, neither the
last viewed nor clearly the first of the scan list.

**Round 2, waypoint pages and nearest rank, 2026-10-24** (same agent, same caveats).
- KLN 89: a page on a nearest rank came back as the **same waypoint, plain**, without the nearest marker (APT KCLI at
  rank 2, VOR GRB at rank 3); also when the ranking had changed before the power-off (KAUW entered at rank 2, rank 1 at
  the power-off, came back as plain KAUW). While flying, a nearest page stayed on its airport and only the rank number
  changed (3-23, 3-24; the parked-on-NR mode could not be reached in this trainer). Waypoints reached by ident entry
  (NDB DAF), by scan (INT AGOMY) and by creation (USR 7) were all kept. A deleted user waypoint left the USR page on the
  first entry, the same after a power-on. The page number within the group was reset (APT 3 came back as APT 1).
- AVsoftech: not usable here. Its waypoint pages come back on fixed idents at every power-on (KAPA, BAJ, HAAGN, A), not
  the last viewed nor the last typed; a nearest page came back as "KAPA NR 2". Trainer defect. 3-8 was confirmed again
  (the active VOR on the right side).

## 3. Approaches

**#192.**
- **A (chosen):** each field the unit keeps becomes a user setting with a default; the page reads and writes the
  setting. Short-interruption fields stay in `VolatileMemory` behind `RESET_TIME`. Everything else is reset in
  `reset()`. A guard test holds the rule for fields added later.
- B (dropped): a generic "persisted fields" layer inside `VolatileMemory`. More machinery for a handful of fields, and it
  blurs the line #192 wants drawn.

**#332.**
- **A (chosen):** the ride-through lives in the class that models the unit's power, renamed from `PowerButton` to
  `PowerSupply` (it models the knob's ON/OFF, the aircraft power and the battery module, as the maintenance manual
  divides the hardware). A loss starts a 1.5 s timer; power back within it cancels the timer.
- B (dropped): a tick counter in `SimVarSync`. Simpler, but it hides the battery in a SimVar reader.

**#400.** One way: clear the flag in `reset()`.

## 4. The decided how

### 4.1 #400

`VolatileMemory.reset` sets `navPage.isSelfTestActive = false`. Render test from the issue: `bootToSelfTest`, power
cycle, wait to the Turn-On page; `isSelfTestActive` is false and the GPS outputs are not the self-test values
(`GPS APPROACH MODE`, `GPS WP DESIRED TRACK`, the distance). Lands first; it is independent of the rest.

### 4.2 Rename `PowerButton` → `PowerSupply` (plain commit)

File `kln90b/PowerSupply.ts`, class `PowerSupply`; `PowerEvent` and `PowerEventData` move with it; fields named
`powerButton` become `powerSupply`; the test file `test/render/PowerButton.test.ts` becomes `PowerSupply.test.ts`.
Living docs (`docs/architecture.md`, `test/README.md`, `docs/test-next-steps.md`) follow; dated records (plans, specs,
reviews, the coverage record) keep the old name. Nothing here is public contract. The brightness H events stay in the
class: they come from the same BRT/PUSH ON knob.

### 4.3 #332 ride-through

In `PowerSupply.setElectricityAvailable`:
- **The first reading** (the first call after construction) applies at once, so a unit that loads without power does
  not show 1.5 s of Turn-On page.
- **A loss while the unit is powered** starts a ride-through of exactly **1.5 s** (PDF 79, nominal; covers the 1 s
  guarantee of PDF 53, 54). The unit keeps running: no page change, no power event, no power-cycle count. If power is
  back within it, the ride-through ends and nothing happened. If it expires, the unit turns off as today.
- **A loss while the unit is off** (knob off) applies at once; there is nothing to carry.
- **The knob** (`Power`, `Power_On`, `Power_Off` H events) acts at once as today. Turning it off during a ride-through
  turns the unit off and ends the ride-through. Turning it on during a loss does not power the unit.
- The off time reported in `timeSincePowerChange` counts from the moment the unit actually turned off (the end of the
  ride-through).
- No randomness, no battery charge model; repeated short losses are each carried.

Everything the power event drives follows the actual power change, not the loss. `GPS OVERRIDDEN` stops the sim's own
GPS calculations, so while the unit is installed and allowed to write the GPS SimVars it must stay on at all times,
powered or not (maintainer, 2026-10-24). That holds through a ride-through: the unit is running, and
`NavCalculator.tick` claims the flag at 1 Hz as it does today (#24). When the ride-through runs out, the power event
claims it once more (`SensorsOut.reset`), as at every power change today. The hot swapping contract (release and claim
through `L:KLN90B_Disabled`) does not change.

Tests: the existing pin `rides through a 0.5 s loss…` in `test/render/SimVarSync.test.ts` turns from `it.fails` into
`it`; its sibling (3 s loss turns it off) stays. Add: a loss of 1.4 s is carried and one of 1.6 s is not (the
boundary); the knob turned off during a ride-through turns the unit off at once; the first reading at boot applies at
once. The contract tests that wait 3 s after a loss stay green. Two tests in the hot-swapping block of
`SimVarSync.test.ts` change: `the sibling: a loss of the aircraft power claims the GPS of an enabled unit at once`
waits beyond the ride-through (and its name drops "at once"); `reads L:KLN90B_Disabled only in the poll, also when the
aircraft power changes (#350)` uses a loss longer than 1.5 s, so that it still exercises a power change.

The wiki page *panel.xml customization* (ElectricitySimVar) gets a sentence that a loss under 1.5 s is carried by the
unit's battery: the text is drafted for the maintainer, who edits the wiki.

### 4.4 #192 the field split

| Field (today) | Today | After | Key / note |
|---|---|---|---|
| `triPage.ff`, `triPage.reserve` | kept (power cycle only) | **user setting** | `triFuelFlow`, `triReserve` |
| `triPage.tas`, `windDirTrue`, `windSpeed` | reset | **user setting** | `triTas` (150), `triWindDirTrue`, `triWindSpeed` |
| `triPage.tri1To`, `tri3From`, `tri3To` | reset | **user setting** | `tri1To`, `tri3From`, `tri3To`: ICAO strings |
| `triPage.tri5Fpl` | reset | **user setting** | `tri5Fpl` |
| `othPage.reserve` | reset | **user setting** | `othReserve`; no trainer has OTH: by analogy with the TRI reserve |
| APT/VOR/NDB/INT/SUP page waypoint | first of the scan list | **user setting** (see 4.5) | `aptPageWpt`, `vorPageWpt`, `ndbPageWpt`, `intPageWpt`, `supPageWpt`: ICAO strings |
| `navPage.nav4SelectedAltitude` | kept (power cycle only) | **reset to 0** | behavior change (89 trainer) |
| `navPage.userMagvar` | reset | **kept if off ≤ 5 min** | stays in `VolatileMemory`, behind `RESET_TIME` (89 guide 4-46, 4-47) |
| `navPage.obsMag` | kept | **reset to 0** | the mode is Leg after power-on (3-3); the 89 does not offer the old course |
| `navPage.superNav5ActualRange` | kept | **reset to 40** | a cache of the auto range, not pilot state |
| the derived nav values (`xtkToActive`, `distToActive`, `desiredTrack`, `toFrom`, `waypointAlert`, `steeringPath`, …) | kept | **reset to their initial values** | recomputed by the first calculation tick |
| NAV 4 VNAV waypoint, angle, from-altitude, offset; D/T; CAL 6/7; CTR; nav mode | reset | reset | unchanged |
| procedures in FPL 0 | kept if off ≤ 5 min | unchanged | 6-5 |
| `fplPage.flightplans`, `navPage.activeWaypoint` | persisted on their own path | unchanged | not `VolatileMemory` state in the sense of #192 |

Setting keys are new, added with defaults equal to today's defaults. Names follow the existing style (`cal3Tas`,
`altAlertWarn`). An ICAO string is written as V2 (`ICAO.valueToStringV2`); V1 is deprecated (maintainer, 2026-10-24; the V1 `activeWaypoint` is #415).

**Numbers** are read and written through `props.userSettings` by the pages (TRI 0-6, OTH 5, OTH 6); the fields leave
`TriPageState` and `OthPageState`.

**Waypoints** need a resolved `Facility` on the page, and resolving is asynchronous. The resolved facility stays in
`VolatileMemory` as a cache: every write goes through one setter that also writes the setting, and `reset()` resolves
it again from the setting at every power-on. A power-on therefore always rebuilds the cache from the setting, which makes
it the same as a sim restart. A saved waypoint that no longer resolves (a deleted user waypoint, a temporary `XY`
waypoint the power-on deleted, another database) gives `null` for the TRI fields and the first of the scan list for the
waypoint pages; the setting is then cleared.

### 4.5 Waypoint pages (in scope at the maintainer's request, 2026-10-24)

The maintainer put the waypoint pages into #192 and asked for the trainer checks of round 2. Each waypoint page type
keeps the waypoint it last showed, over power cycles and sim restarts. Evidence: the KLN 89 trainer kept the last
shown waypoint of every waypoint page type over relaunches of every length, however it was reached, while it reset other
state it could have kept; the AVsoftech trainer restores fixed idents (a defect). The 3-8 start-up override is
unchanged: the page type of the last active waypoint shows the active waypoint (`PageManager.startMainPage`), and that
also becomes the saved waypoint of that page type. The last match of the ident entry (#202) is still forgotten at every
power-on.

"Last showed" means the facility the page state holds, written wherever it is written today (`Apt1Page`, the waypoint
page scans and ident entries, `WaypointPage.changeFacility` and its constructor, `FlightplanList`,
`PageManager.startMainPage`). The page state may hold a `NearestWpt` (a page parked on a nearest rank follows the
re-ranking in its tick, 3-24, #268; the constructor shows the nearest emergency airport): the setting saves the
unwrapped facility, and only when its ICAO changes, so a re-rank writes at most once per change and a steady tick
writes nothing. A power-on restores it as a plain facility, not as a nearest rank: the KLN 89 trainer does exactly
that, also when the ranking changed before the power-off (round 2). A saved waypoint that no longer exists falls back to
the first of the scan list, as the 89 showed for a deleted user waypoint. The page number within the group is not saved
(the 89 came back on APT 1).

### 4.6 The guard test

One render test holds the rule for every field, including ones added later: boot a unit, set every pilot-settable field
of `VolatileMemory` and every new setting to a non-default value, power-cycle it with more than 5 minutes off; then boot
a second unit from the first one's saved user data (`BootOptions.storage`) and compare the two `VolatileMemory`s. They
must be equal. It must fail when a field is added to a page state and neither reset nor made a setting; the test's own
mutation pass proves that.

### 4.7 Tests that change

In `test/render/data/VolatileMemory.test.ts` the characterizations of #192 become spec tests citing the evidence above:
- `puts the page state back to its defaults…`: the TRI and OTH fields leave its list; `obsMag`, the derived values, the
  Super NAV 5 range and `nav4SelectedAltitude` join it.
- `keeps the NAV 4 selected altitude and the fuel figures of TRI…` splits: the selected altitude is reset (89 trainer);
  the fuel figures are kept, now over a sim restart as well.
- `forgets the pilot-entered magnetic variation…` becomes two tests: kept after 1 minute off, forgotten after 6 (4-47).
- `opens the VOR page on the first VOR of the scan list after a power cycle` becomes: opens it on the last VOR shown.
- `restarts the flight timer at the power-on` stays and drops "(characterization)" (4-13, 89 trainer).
New: each new setting survives a sim restart (a boot from the saved data); a saved waypoint that no longer resolves
falls back.

### 4.8 Docs

- `docs/kln89-trainer-record.md`: a 2026-10-24 block with the two trainers' results (in the #192 commit).
- `docs/architecture.md`: the power section (#332, the rename) and `VolatileMemory` (#192).
- CLAUDE.md, UI section: "state that must survive goes in `props.memory`" becomes: survives a page change →
  `props.memory`; survives a power cycle → a user setting (with the 5-minute exception).
- #192 gets a closing comment summarizing the decisions only through its `fixes #192` commit (it closes when the
  maintainer pushes); no manual close.

## 5. Left to the builder

- The exact helper shapes (one waypoint-setting setter, how pages reach the settings).
- How the guard test enumerates and compares fields, as long as it fails on an unreset new field.
- Whether the derived nav values are reset field by field or by rebuilding a fresh state object, as long as
  `activeWaypoint` and the flight plans are untouched.
