# Failures: the internal battery and the loss of user data (#461)

Part 4 of #366. The specification is the section Battery of [docs/failures.md](../../failures.md); this design says how
it is built and settles what that section left open. Page numbers without a prefix are the KLN 90B Pilot's Guide.

## Intent

The unit's lithium cell keeps the user memory while the unit is off (CMM) and lasts three to five years (B-2). The
simulation ages it over the years of sim time, warns before it is empty, and, once it has failed, loses the user memory
at every power-on, as a real unit with a dead cell does. A pilot who sees `BATTERY LOW` learns what the warning means;
one who ignores it, or whose battery is failed on FLR 3, loses the waypoints, the flight plans and the clock, and meets
the GPS week rollover that a real KLN 90B can show after such a loss (a real pilot with a real unit confirmed to the
maintainer that the rollover happens and is hard to correct).

## Goals

- The battery state: the health (0 to 100 %) and the latest sim date seen, aged forward only at each session start.
- FLR 1 shows the health; `SERVICE?` installs a new battery.
- `BATTERY LOW: SERVICE` / `REQUIRED TO PREVENT` / `LOSS OF USER DATA` at 1.5 % or less, and while failed.
- The failure: random only at 0 %, manual at any health, failed until repaired.
- At every power-on while failed, the first of a session included: the user memory is wiped in memory and in storage,
  the clock starts at 1 JAN 1988, the STA 4 counters restart, and `USER DATA LOST` shows.

## Non-goals

- No change to the failure framework beyond what the battery needs (the catalog, the trigger, the FLR pages exist).
- No charge model of the battery module's ride-through (`PowerSupply.RIDE_THROUGH_TIME`): it is a different part.
- Nothing about the unit's EEPROM (#459) or the failure state changes at a wipe.

## Anti-goals (the maintainer's, 2026-11-08)

- **Nothing is wiped while the unit is on.** A battery that fails, from FLR 3 or the MTBF trigger, changes nothing until
  the next power-on. A pilot who repairs it before then (FLR 2, or FLR 1 `SERVICE?`) keeps every setting and all user
  data. The wipe happens only at a power-on, and only if the battery is failed at that moment.
- **A unit that has never stored anything is not a wiped unit.** The first start of the KLN in a new aircraft (no stored
  user data) counts as a unit fresh from service: a new battery (100 %) and a clock taken from the sim date, as today, so
  the first fix is in the current GPS era. The 1988 clock belongs to a loss of the user memory only. The existing restore
  failure of a corrupt profile (`USER DATA LOST` in `KLN90BCore.asyncInit`) keeps its present behavior too.
- With MTBF off, the battery never failed and a health above 1.5 %, nothing changes: every existing test stays green.

## Constraints

- Persisted user data is public contract (CLAUDE.md): only new keys with defaults; `userDataFormat` is never reset.
- The tick budget (CLAUDE.md): the battery adds no work to the ticks except a persistent message condition, which reads
  two settings.
- `target: es2017`.
- The wipe must run before `GPS.powerChanged`, which subscribed to `powerEvent` first (docs/failures.md, Battery, FAST).

## Approaches

1. **A `userMemoryLost` event published just before the power-on (chosen).** At a power-on `PowerSupply` asks whether
   the battery is failed; if so it publishes `userMemoryLost` on the bus, synchronously, before it counts the power
   cycle and before `powerEvent`. Every holder of user memory resets itself in its handler. Bus publishes run their
   handlers in order, so the order against the power-on handlers is guaranteed by construction, for the first power-on
   of a session and every later one alike.
2. Clear the storage and run the restore again. One loading path, but the restore builds new `Flightplan` objects while
   FPL 0 is shared by every service, and it is async, so the power-on would race it. Rejected.
3. Wipe at session load for the first power-on, and the runtime path for later ones. It reuses the restore failure
   branch, but it is two paths, and it wipes at load even when the unit is never switched on. Rejected.

The maintainer chose 1 (2026-11-08).

## The design

### The battery state

- Two new keys in `KLN90BFailureSettings` (the failure simulation's own settings, which no wipe reaches):
  `batteryHealth` (number, percent, default 100) and `batteryDate` (number, the latest `E:ABSOLUTE TIME` seen in
  seconds, default 0 = never seen). The defaults mean a new battery, as docs/failures.md, Persistence, requires.
- A stateless service `failures/Battery.ts` over these settings, beside `Failures` (the same pattern: the state is the
  saved settings). It answers the health, the percent FLR 1 shows (`Math.ceil(health)`, so `0` only at exactly 0), whether
  it is low (`health <= 1.5` or the `battery` failure active), and it services (health 100). The failure itself stays
  the catalog key `battery` in `Failures` (fail, repair, active).

### Aging

- Once per session, when the failure services are built at the start of `KLN90BCore.asyncInit` (before `Sensors`, so
  nothing reads the health earlier).
- The rule, a pure exported function so that the unit tests need no boot:
  - `batteryDate` is 0 (a first session with this feature, or a new installation): set it to now; no aging.
  - now after `batteryDate`: the health drops by `years × rate`, `years` the difference in seconds over
    365.25 × 86 400, `rate` drawn uniformly from 20 to 33.333… % a year for this step (B-2, a life of 5 to 3 years),
    stopping at 0; `batteryDate` becomes now.
  - now at or before `batteryDate`: nothing. A date set back neither recharges nor moves the latest date back.
- The random source is injectable (a parameter with `Math.random` as the default), as the trigger's is.
- Time changes during a session do not age it.

### The failure in the catalog

- The catalog entry `battery`: FLR name `BATTERY`, `testFail: false`, no ports, `message: null` and `detection: null`
  (its message is `USER DATA LOST` at the power-on, a one-time message, not a detected condition), eligible always.
- Random only at 0 %: the entry is `random: true`, and the random candidates leave it out while the health is above 0.
  How the catalog says so is left to the builder (a field on the definition that `Failures.randomCandidates` asks, say);
  the catalog stays the source of truth, and `Failures` must be able to read the health for it.
- FLR 3 lists it while it is not active (eligible always) and fails it at any health. FLR 2 repairs the failure only:
  the health stays where it is, so a battery at 0 % may be drawn again by the trigger. `SERVICE?` repairs every failure
  and sets the health to 100 %; it keeps `batteryDate`.

### `BATTERY LOW`

- A persistent message (`data/PersistentMessages.ts`) with the three lines of docs/failures.md, valid while the battery
  is low (above). It follows the rule of the unit's own failures and is posted no earlier than the first navigation page
  of a power-on (`memory.failureDetection.mainPageShown`). The builder's call: it is no failure detection of the
  framework, so it reads the battery service directly rather than `FailureDetector`.

### The wipe

**When.** In `PowerSupply.refreshPowerState`, when the unit becomes powered, before `powercycles` is counted and before
`powerEvent` is published: if the `battery` failure is active, `userMemoryLost` is published (not cached, so that a
subscriber built later is not handed it; such a subscriber reads the wiped storage instead). Only a real power-on: the
battery module's ride-through and the hot-swap resume publish no power event and wipe nothing. Never at the moment of a
failure, nor at any other time while the unit is on.

`PowerSupply` needs to know whether the battery is failed. It is built after `Failures` in `asyncInit`, so it can be
given the failure service (or a query) in its props.

**What each holder does in its `userMemoryLost` handler:**

- **The storage** (one place, a small `UserMemory` module, say): every key of `KLN90BUserSettings` goes back to its
  default except `userDataFormat` and `fastGpsAcquisition`; every slot of the user waypoints, the flight plans and the
  remarks goes back to "". The failure settings and the EEPROM settings are not touched. This covers the welcome text,
  the last position, the almanac and ephemeris times, the STA 4 counters (`powercycles`, `totalTime`), the active
  waypoint and the waypoint pages' saved waypoints.
  - **Why `userDataFormat` is kept:** it says the stored slots are V2, and the persistors always write V2. The user data
    entered after a wipe is saved as V2; a value reset to 0 would make the next session read it with the V1 loaders.
- **The user waypoints** in `KLNFacilityRepository` (ICAO region `XX`): removed. The repository is a singleton that
  exists before the first power-on.
- **The flight plans**: each of the 26 `Flightplan` objects is emptied in place (`delete()`), which publishes
  `flightplanChanged`, so the SDK planner mirror and the persistence follow.
  - **A route synced from the EFB** follows the same rule as every other data (the maintainer, 2026-11-08: a feature,
    and the rule that nothing is lost while the unit runs): a route that is in FPL 0 at the power-on, synced while the
    unit was off at a cold-and-dark start, is wiped with it. A route synced after the power-on is new data and loads as
    always; at an engine-running start the route manager resolves after the boot's power-on, so its route stays.
    `KlnEfbLoader` needs no change.
- **The active waypoint** (`ActiveWaypoint`): the direct-to and the procedure leg are dropped, there is no active leg,
  and `lastactiveWaypoint` becomes null.
- **The remarks** (`RemarksManager`): the in-memory map is emptied.
- **`Timers`**: its cached `totalTime` becomes 0.
- **The GPS** (`Gps.ts`):
  - the clock: `timeZulu` and the receiver's `internalTime` are set to **1 JAN 1988 00:00:00 UTC** (the year the
    unit's date editors default to, `DateEditor`), and `lastPowerOffTime` is set to now, so that the off-time carry of
    `powerChanged` adds nothing to it;
  - the receiver's memory: the almanac and every satellite's ephemeris are erased through the SDK's public
    `GPSSatComputer.eraseAlamanac()` and `eraseCachedEphemeris()`; no private access is needed. At an engine-running
    start the wipe usually comes before the satellites are loaded, and the constructor's `awaitInit().then(...)` would
    then restore the ephemeris it parsed from the settings before the wipe. The wipe therefore sets a pending flag, as
    FAST does with `ephemerisFromTruthPending`, and the late restore erases instead of restoring;
  - the position: no stored position. `coords` is set to the default of the settings (0, 0) and a flag says that there
    is no stored position for this power-on, which suppresses `POSITION DIFFERS FROM LAST POSITION BY >2NM` at the first
    fix (B-3: there is nothing to compare with). The flag ends with the first fix or the next power-on.
  - In REAL, `powerChanged` then starts the search from this memory: no almanac, so an almanac search
    (`GpsSearch.begin`, ORS 01 6-30, about 20 minutes). Entering the date, the time or the position (3-5, 3-17 to 3-19)
    does not shorten it, as a receiver without an almanac must collect one first (the existing start model; docs/failures.md
    said otherwise and is corrected). What the pilot's date entry on SET 2 does fix is the era: the first fix computes
    the date in the era of the unit's clock (`calculateGPSTime`), so with the 1988 clock and a sim date in 2026 it comes
    out two eras early, about 1987, and with a date entered in the current era it comes out right. `SYSTEM TIME UPDATED
    TO GPS TIME` follows as for any large correction.
  - **FAST does nothing at a power-on with a wipe** (the maintainer, 2026-11-08). FAST stands for a unit that was just
    on, whose hot start works from a current memory; a wiped memory has none, so there is no position, no almanac and
    the 1988 clock, and the receiver runs the same almanac search as in REAL. `powerChanged` skips
    `initializeFromTruth` at such a power-on. The wait is accepted: the battery's failure is one of the worst the
    project simulates, and `BATTERY LOW` warned the pilot long before. This changes what docs/failures.md (Battery,
    #468) says about FAST and is corrected there.
  - The builder's call, from the same reading: switching SET 10 to FAST later in that power-on (`GPS.startFast`) does
    not restore the memory from the truth either. The next power-on is normal again if the battery was repaired.
  - **An engine-running start keeps its forced acquisition** (`WelcomePage`, `acquireAndUseSatellites`; the maintainer,
    2026-11-08): it stands for a unit that was on before the session started, which would have collected its almanac by
    then. In REAL and FAST alike it gives the instant fix, and that fix computes its date in the era of the 1988 clock:
    the rollover date.
- **`USER DATA LOST`**: a one-time message posted by the wipe, which clears the message list first. After a power-off
  the list is empty anyway; at the first power-on of a session it can hold messages the boot's restore posted about the
  data the wipe just erased (`WAYPOINT xxx DELETED` for the last active waypoint, the flight plan loader's messages),
  which are void now. A restore that is still running when the wipe comes posts nothing more (see the boot below).
- **`VolatileMemory.reset`** treats a power-on with a wipe as a long interruption (the `RESET_TIME` branches: the
  procedures, the direct-to and the pilot's magnetic variation go), because the RAM that carries a short interruption
  is held by the same battery. How it learns of the wipe is left to the builder (it subscribes to `userMemoryLost` and
  keeps a flag for the reset that follows, say). The waypoint pages and the TRI waypoints restore nothing, as their
  saved waypoints are gone, and show the first of their scan lists.
- **STA 4** then shows the counters from 0, with this power-on counted: `PowerSupply` counts it after the wipe, so the
  power cycles read 1.

**The first power-on of a session.** The same event does it, whatever the timing against the boot:

- An engine-running start powers on in `asyncInit` (`forceReadyToUse`) before the user waypoints and the flight plans
  are restored. The wipe clears the storage, and the restore that follows reads empty slots. The services built after
  it (`VolatileMemory`, `Timers`, `RemarksManager`, `ActiveWaypoint`) read the wiped storage. `userDataFormat` is 2, so
  the boot rewrites nothing, and the restore does not fail, so it posts no second `USER DATA LOST`.
- A cold-and-dark power-on while `asyncInit` still awaits the active waypoint or the flight plan restore could see
  plans parsed from the slots before the wipe come back after it. `asyncInit` therefore notices a wipe that happened
  during its awaits (a counter it compares, say) and then starts with empty plans and no active waypoint, and posts
  none of the restore's messages.

**The date 1988 and the database.** `Database.isAiracCurrent` counts a date before the end of the cycle as current, so
a clock in 1987 or 1988 posts no `DATA BASE OUT OF DATE`.

### FLR 1

- `BATTERY` followed by the percent, right-aligned in three characters (`BATTERY 100`, `BATTERY  42`, `BATTERY   0`),
  read-only, refreshed in the display tick (only `SERVICE?` changes it during a session).
- `SERVICE?` (`Flr1Page.serviced`) also services the battery.

### Kept, for clarity

The failure state, the battery state, the EEPROM calibration, `userDataFormat` and `fastGpsAcquisition`.

## Testing

Each behavior at the cheapest stage that observes it (CLAUDE.md):

- **Unit**: the aging rule (first session, forward, set back, equal date, the rate's bounds with the random source at 0
  and near 1, the stop at 0, a date years ahead); the percent rounded up; the low threshold at 1.5 % and for a failed
  battery at 100 %; the random candidates with and without the battery at 0 %; the storage wipe (each kept key kept,
  each other key at its default, every slot empty, the failure and EEPROM settings untouched); the GPS's receiver-memory
  methods.
- **Render**: FLR 1 shows the health and `SERVICE?` sets 100; `BATTERY LOW` with its lines; `USER DATA LOST`.
- **Booted unit, simulated time**:
  - a power-on within a session with the battery failed: the user waypoint, a flight plan, a remark, the welcome text
    and the last position gone from memory and storage; the STA 4 counters at 0 and 1 cycle; `USER DATA LOST`; the Self
    Test page shows the 1988 date; an almanac search in REAL and in FAST alike, no `POSITION DIFFERS`, and after the
    first fix the date two eras early; SET 10 switched to FAST in that power-on restores nothing;
  - an engine-running start with the battery failed: the forced fix, on the rollover date; a route synced from the EFB
    after that power-on stays;
  - a cold-and-dark start with the battery failed and a route synced from the EFB before the power-on: FPL 0 empty
    after the power-on;
  - the kept settings: REAL stays REAL, `userDataFormat` stays 2, the failure and the EEPROM settings unchanged;
  - **the anti-goal**: the battery failed while on wipes nothing while on; repaired before the power-off, the next
    power-on keeps everything;
  - the first power-on of a session with a failure stored by an earlier session, cold and dark and engine-running;
  - the ride-through and the hot-swap resume wipe nothing;
  - **the anti-goal**: a first-ever start (empty storage) is no wipe and has the clock of the sim date;
  - data entered after a wipe survives the next session once the battery is repaired.

## Docs

- `docs/failures.md`: the Status names the battery as built; "What the code needs first" item 1 and the default date in
  "Left to the implementation" go, and the Battery section gets the default date, the two anti-goals and the facts
  above that it lacks (the event, FAST). If #366 then has nothing left, the two sections are removed as they say.
- `docs/architecture.md`: the `userMemoryLost` event in the power-on order.
- The wiki page for the failures (the maintainer updates it): the battery.

## Left to the builder

- The names of the new module and methods, and how the catalog marks "random only at 0 %".
- How `VolatileMemory` and `asyncInit` learn of a wipe.
- The split into the commit (one commit, `fixes #461`, with its tests and docs).
