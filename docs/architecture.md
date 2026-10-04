# KLN 90B architecture reference

Detailed companion to [CLAUDE.md](../CLAUDE.md). It covers the big-picture wiring that takes many files to see.
All paths are relative to the repo root and the code lives under `kln90b/`. It describes the code as of v2.2.0
(commit `456356d`); check the code when this document and the code disagree, and update this document.
Automated tests are described in [testing.md](testing.md).

- Part 1, **Core**: boot, tick loops, sensors/GPS, sim outputs, navigation, navdata, persistence, configuration,
  messages.
- Part 2, **UI**: pages, page trees, input routing, controls, rendering, styling.

Comments such as `3-29` in the code are page numbers in the KLN 90B Pilot's Guide (006-08773-0000), the "manual".

# Part 1: Core

## Core 0. Debug hooks and branches

- Debug hooks:
    - `KLN90PlaneSettings.debugMode` is hard-coded to `false` in `KLN90BPlaneSettingsParser`; set it to true by hand. It
      skips the test pages, gives instant brightness and makes `AudioGenerator` show `BEEP: n` on the status line.
    - `loggingEnabled = false` flags exist in `Scanlist.ts` and `RollSteeringController.ts`.
    - There is a commented-out `this.bus.onAll(console.log)` in `KLN90BCore.ts`.
    - There is a lot of `console.log`.
    - The user setting `fastGpsAcquisition` (SET 10 page) **defaults to true** (`GPS_ACQUISITION_FAST`).
- Other branches: `switch-to-wt-flightplan` (abandoned; see Core 5), `fuzzy-gps` (Kalman-filtered GPS noise, "not
  working very well"), `analog-xtk-filter`, `fs2020`.

## Core 1. Startup and lifecycle

`KLN90B` (`kln90b/KLN90B.tsx`) is a thin adapter between the sim's `BaseInstrument` lifecycle and the instrument. It is
registered with `registerInstrument('kln-90b', KLN90B)`, and it has `templateID` `'KLN90B'` and `isInteractive` true.
It does the following: `Init()` calls `super.Init()` and then `core.init(xmlConfig)`; `onInteractionEvent` calls `super`
and then `core.onInteractionEvent`; `onSoundEnd` forwards to the core; and the core's re-dispatch callback is the
adapter's own `onInteractionEvent`.

`KLN90BCore` (`kln90b/KLN90BCore.ts`) holds what used to be the instrument class: the bus, the services, the pages and
the tick loops. Its constructor takes a `KLN90BPlatform` and the re-dispatch callback. `KLN90BPlatform`
(`kln90b/KLN90BPlatform.ts`) is what the core needs from outside the sim's global APIs (`SimVar`, `Coherent` and
`DataStore` stay global): `createFacilityClient(bus)`, `getFacilityRepository(bus)` and `getRouteManager()`. The sim
passes `SIM_PLATFORM`, which wraps the SDK `FacilityLoader`, `KLNFacilityRepository` and `FlightPlanRouteManager`. The
tests create `KLN90BCore` directly with a `FakePlatform` (testing.md), which is the reason the split exists. The
sections below say `KLN90BCore` where the code moved and `KLN90B` where the adapter still acts.

**constructor** of `KLN90BCore` (runs before the XML config is available):

- Creates `new EventBus()`, which is the single bus for everything.
- Creates `KLN90BUserSettings(bus)` and `KLN90BSettingSaveManager`, then calls `load(saveKey)` and
  `startAutoSave(saveKey)` with
  `saveKey = "${SimVar 'ATC MODEL'}.profile_1"`. **All persistent data is per aircraft model.**
- Creates `HEventPublisher` and `PageManager`.
- Subscribes to the `keyboardevent` topic (PC keyboard mode): `handleKeyboardEvent` maps keys to the knob and button
  event strings. It re-dispatches them through the callback it was given, so in the sim they pass through
  `KLN90B.onInteractionEvent` and `BaseInstrument.onInteractionEvent` as before.

**Init()** (`KLN90B.Init`, then `KLN90BCore.init`) calls `asyncInit(xmlConfig)`. Errors are published as the `error`
topic and rendered by `controls/ErrorPage` as a full-screen error page with a GitHub link.

**asyncInit()** does the following, in order:

1. `KLN90BPlaneSettingsParser().parsePlaneSettings(this.xmlConfig)`. "The xml is not available before init!"
2. `forceReadyToUse = !!SimVar 'ENG COMBUSTION:1'`. If an engine is running, this is a non-cold-and-dark start, so the
   unit skips the welcome and self-test pages.
3. `pageManager.Init(bus, userSettings)` creates the `PageContainer` and shows the `NullPage`. It then constructs
   `BrightnessManager` and `PowerButton`.
   From here on, the WelcomePage can be shown while everything else initialises.
4. Constructs `AudioGenerator`, then `Sensors` (which builds `GPS` and the `KLNGPSSatComputer`), then calls
   `hEventPublisher.startPublish()`.
   If `forceReadyToUse` is set, it calls `powerButton.forceReadyToUse()`.
5. Navdata: it asks the platform for the facility repository (`KLNFacilityRepository.getRepository(bus)`, a singleton)
   and the facility client (in the sim `new FacilityLoader(FacilityRepository.getRepository(bus))`), builds
   `KLNFacilityLoader(client, klnRepo)` from them, then `Scanlists`.
6. Persistence:
    - `UserWaypointPersistor.restoreWaypoints()`.
    - `UserFlightplanPersistor.restoreAllFlightplan()`, which returns 26 `Flightplan`s (index 0 to 25). On failure it
      creates empty plans and sets `restoreSuccessFull=false`, which later produces the `USER DATA LOST` message.
    - The last active waypoint is loaded from the `activeWaypoint` setting. **That setting is stored as an ICAO V1
      string**: `ICAO.valueToStringV1` / `getFacilityTypeFromStringV1`.
    - If `userDataFormat !== 2`, it re-persists everything in the V2 format and sets `userDataFormat=2` (see Core 7).
7. Constructs `VolatileMemory`, `WTFlightplanSync`, `AirspaceAlert`, `Vnav`, `KLNMagvar`, `ModeController`, then
   `TickController` (Core 2), then `SimVarSync`,
   `MSA`, `TemporaryWaypointDeleter` and `SidStar`. The platform's route manager (in the sim
   `FlightPlanRouteManager.getManager()`) then creates `KlnEfbSaver` and `KlnEfbLoader` (EFB route sync).
8. `Promise.all([nearestUtils.init(), nearestLists.init(), airspaceAlert.init(), msa.init(basePath)])` then builds the *
   *`PageProps`**,
   sets `messageHandler.persistentMessages = buildPersistentMessages(props)` and publishes **`propsReady`** with the
   props.

**`PageProps` is the central context object** (interface in `pages/Page.tsx`). It is passed to every page and control
and contains:
`ref, bus, userSettings, planeSettings, sensors, pageManager, messageHandler, hardware, memory (VolatileMemory), facilityLoader,
facilityRepository, nearestLists, nearestUtils, remarksManager, scanLists, msa, vnav, modeController, database, magvar, sidstar`.
`PowerButton` and `WelcomePage` start with a reduced `WelcomePageProps` and swap in the full props when `propsReady`
arrives.

**Power** (`PowerButton.ts`):

- State is `powerSwitchOn` (the knob, mirrored to `L:KLN90B_Power`) AND `electricityAvailable`. `SimVarSync` sets
  `electricityAvailable` every 100 ms from `Input.ElectricitySimVar`; if that option is empty, power is always
  available.
- On a power-on edge, `PowerButton` increments the `powercycles` setting, calls
  `pageManager.setCurrentPage(WelcomePage, props)` and publishes **`powerEvent {isPowered, timeSincePowerChange}`**.
- On a power-off edge, it shows the `NullPage` and publishes the same event.
- `lastPowerChangeTime` starts one hour in the past, so the unit is assumed to have been off for one hour.
- Subscribers to `powerEvent`:
    - `TickController` starts and stops its loops.
    - `BrightnessManager` simulates CRT warm-up from the off time: `TIME_UNTIL_COLD` / `TIME_TO_WARM`, then a ramp.
    - `Sensors.reset()`, which saves the position and resets the sat computer.
    - `GPS.powerChanged`, which advances the internal clock by the off time.
    - `VolatileMemory.reset()`, which runs on power-on only (see Core 7).
    - `TemporaryWaypointDeleter`.
- Welcome and self-test flow (lives in pages, summarised here for wiring): `WelcomePage.tick` waits `TEST_TIME=17000`
  ms, a free cursor and `memory.isReady`. It then goes to:
    - `FiveSegmentPage(SelfTestLeftPage, SelfTestRightPage)` normally. `SelfTestLeftPage` sets
      `navPage.isSelfTestActive = true` and `SelfTestRightPage` clears it.
    - `TakehomePage` if `takeHomeMode` is set.
    - `pageManager.startMainPage(props)` directly if `forceReadyToUse` is set. This also calls
      `gpsSatComputer.acquireAndUseSatellites()`.
- While `isSelfTestActive` is set:
    - `NavCalculator` outputs fixed test values (XTK -2.5, DIS 34.5, DTK 315 mag, FROM, waypoint alert on).
    - `RollSteeringController` sweeps 0 to -5 degrees of bank.
    - `SensorsOut.setMode` writes `GPS APPROACH MODE = 3` and `L:KLN90B_AnnunTest = true`, so external annunciators
      light up.

**Hot-swap disable**: `SimVarSync.setDisabled` reacts to `L:KLN90B_Disabled`. It calls
`tickController.setEnabled(false)` and `pageManager.resetKeyboard()`, and if `writeGPSSimVars` is set it toggles
`GPS OVERRIDDEN`.

**Input routing**: the sim delivers H events as `BaseInstrument.onInteractionEvent(args)`.

- `KLN90B.onInteractionEvent` calls `super` and passes the event to `KLN90BCore.onInteractionEvent`, which handles the
  SCAN pull state (`Hardware.isScanPulled`, mirrored to `L:KLN90B_RightScan`).
  While SCAN is pulled, it remaps right-inner turns to the internal `EVT_R_SCAN_LEFT/RIGHT`.
- It then calls `hEventPublisher.dispatchHEvent([evt])`, which puts the event on the bus `hEvent` topic. `PowerButton`
  listens there for power and brightness events.
- It also calls `pageManager.onInteractionEvent(evt)`, which handles everything else in pages and controls.
  `EVT_MSG/DCT/ALT/APPR_ARM` are handled in `pages/MainPage.tsx`.
- PC keyboard input is synthesised as `EVT_KEY + side + ":" + key`, for example `KLN90B_Internal_Key:LEFT:A`, and routed
  by `services/KeyboardService.routeKeyboardEvent`.

## Core 2. Tick loops (`kln90b/TickController.ts`)

`TickController(bus, displayTickables, calcTickables, signalTickables)` runs three `window.setInterval` loops. **They
only run while the unit is powered AND enabled.**

| constant                                 | rate                                                                         | tickables                                                                                                                                                                                                        |
|------------------------------------------|------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `TICK_TIME_DISPLAY = 250` ms (4 Hz)      | `DisplayTickable.tick(blink)`; `blink` is true one tick in four (1 Hz blink) | `[pageManager]`, which ticks the current page and controls                                                                                                                                                       |
| `TICK_TIME_CALC = 1000` ms (1 Hz)        | `CalcTickable.tick()`                                                        | `sensors, magvar, ndb/apt/vor NearestList, modeController, NavCalculator, airspaceAlert, HtAboveAirportAlert, AltAlert, Timers, vnav, messageHandler, RollSteeringController` (in this order; the order matters) |
| `TICK_TIME_SIGNALS = 1000/16` ms (16 Hz) | `CalcTickable.tick()`                                                        | `SignalOutputFillterTick(sensors)`, which writes the smoothed `GPS WP CROSS TRK`                                                                                                                                 |

- Rationale is given in the class doc: the real unit has a CRT redrawn line by line (maintenance manual p.43) and does
  its calculations at 1 Hz (from a video, and MM p.189). The 16 Hz loop emulates the analog filtering of the deviation
  output (MM p.186) through `services/SignalOutputFilter` (linear prediction smoothing).
- **Hard rule from the class doc: DOM manipulation happens only inside a display tick, never directly in a state change
  or input handler.** Handlers mutate state and the next `tick(blink)` renders it.
- Each tickable is wrapped in try/catch, which logs the error and publishes `error`. **Async ticks** (`NearestList.tick`
  is `async`) are not awaited, so their rejections escape this handler.
- Expensive work throttles itself inside the 1 Hz tick: `NearestList` and `AirspaceAlert` search every 10 s (
  `NEAREST_TICK_TIME`, `ALERT_TICK_TIME`); `GPS` and `Timers` save every 60 s.
- Separate intervals: `SimVarSync` runs every 100 ms and always runs, even when powered off. `BrightnessManager` uses
  `Wait.awaitDelay` loops.
- Many quantities are integrated as `x += TICK_TIME_CALC/1000`: the flight timer, GPS time in take-home mode and the XTK
  scale ramp. They assume the interval really fires at 1 Hz, so sim-rate or pause effects are not modelled.

## Core 3. Sensors and GPS simulation

`Sensors` (`kln90b/Sensors.ts`) has `in: SensorsIn` (tick 1 Hz) and `out: SensorsOut` (writers). On `powerEvent` it
calls `in.reset()` and `out.reset()`.

`SensorsIn.tick()` reads:

- `GPS DRIVES NAV1`. When it is true, it reads `Nav OBS:{1|2}` according to `Input.ObsSource`. When it is false,
  `obsMag = null` ("the manual implies" OBS can only be read when the GPS is the nav source).
- `PLANE HEADING DEGREES GYRO` if `Input.HeadingInput`.
- Then `gps.tick()`, `fuelComputer.tick()` and `airdata.tick()`.

`FuelComputer` (only if `Input.FuelComputer.IsInterfaced`) reads `FUEL TOTAL QUANTITY WEIGHT EX1`, `ENG FUEL FLOW PPH:n`
and `GENERAL ENG FUEL USED SINCE START:n`, and converts them to the configured unit and fuel density. The KLN only knows
1 or 2 engines; with more than 2 engines everything is summed into engine 1.

`Airdata`:

- Without an air-data computer but with `AltimeterInterfaced`, it reads `PRESSURE ALTITUDE` rounded to 100 ft ("Gray
  Code").
- With `Airdata.IsInterfaced` it reads full `PRESSURE ALTITUDE`, `KOHLSMAN SETTING HG:{baroSource}`, `AIRSPEED TRUE`,
  `AIRSPEED MACH`, `AMBIENT TEMPERATURE` and `TOTAL AIR TEMPERATURE`.
- `getIndicatedAlt()` = `pressureAlt2IndicatedAlt(pressureAltitude, barometer)`. The baro value persists in the user
  setting `barosetting`.

`GPS` (`kln90b/Gps.ts`) **simulates acquisition, then reads the true sim position once valid.** There is no position
error or noise and no RAIM ("We have pretty all messages except for failures and RAIM problems").

- It wraps the SDK `GPSSatComputer` in `KLNGPSSatComputer` (`// @ts-ignore extends`). That class accesses **private SDK
  internals through `as any`** (`simTime`, `distanceFromLastKnownPos`, `activeSimulationContext.channels`,
  `lastAlamanacTime`), so it may break on SDK upgrades.
    - `isAlmanacValid` additionally requires the internal clock to be within 10 minutes of sim time AND the last known
      position to be within 60 NM (both values from the install manual).
    - The computer has 8 channels. Timing: acquisition about 90 ± 30 s, ephemeris download 30 s, almanac download 12.5
      min, almanac expiry 90 days, timeout 4 min; with `fastGpsAcquisition` all of these drop to about 1 to 10 s. It is
      driven manually: `GPS.tick` publishes `simTime` and `gps-position` on the bus and then calls `onUpdate()`. Sync
      role is `'none'`. SBAS is disabled by the emptied `gps_sbas.json`.
- `isValid()` means `systemState` is `SolutionAcquired` or `DiffSolutionAcquired`. There is a TODO: 3-satellite plus
  altitude aiding is not modelled.
- When valid, `coords` come from `PLANE LATITUDE/LONGITUDE` and `groundspeed` from `GROUND VELOCITY`.
    - `trackTrue` is the bearing between successive 1 Hz fixes, computed only when GS >= 2 kt (
      `MIN_GROUND_SPEED_FOR_TRACK`, 3-35). `getTrackTrueRespectingGroundspeed()` returns null below that.
    - When invalid, the last values are frozen (4-13).
- Last position and almanac time persist in the settings `lastLatitude`, `lastLongitude` and `lastAlmanacDownload`.
- `gpsAcquired()` can post `POSITION DIFFERS FROM LAST POSITION BY >2NM`. If the time error is over 10 minutes it posts
  `SYSTEM TIME UPDATED TO GPS TIME` and publishes **`timeUpdatedEvent`**; `Database` listens and posts the AIRAC-expired
  message.
- Internal clock `timeZulu` (`data/Time.ts TimeStamp`):
    - At construction it is set from `E:ABSOLUTE TIME` plus a random ±2.5 s, minus one hour. `PowerButton` assumes one
      hour off, and the hour is added back on power-on.
    - **Deliberately emulates the GPS week-number rollover** (`calculateGPSTime`, 1024-week eras).
- `TakeHomeMode` (panel.xml option): the unit dead-reckons from its last track and speed instead of reading the sim, and
  shows the take-home page instead of the self-test.

## Core 4. Output to the sim and the public aircraft contract

**`kln90b/HEvents.ts` and `kln90b/LVars.ts` are a public API for aircraft developers.** The README tells them to use
only these. Never rename or remove them, and keep their semantics stable. Branch `fs2020` and MSFS 2024 aircraft depend
on them.

- H events (fired as `H:<name>`):
    - Power and brightness: `KLN90B_Power_Toggle`, `_Power_On`, `_Power_Off` ("for hardware"), `KLN90B_Brt_Inc`,
      `KLN90B_Brt_Dec`.
    - Buttons: `KLN90B_{MSG,DCT,CLR,ENT,ALT}_Push`.
    - Knobs: `KLN90B_{Left,Right}{Large,Small}Knob_{Left,Right}`, `KLN90B_{Left,Right}Cursor_Toggle`,
      `KLN90B_RightScan_Toggle`.
    - External switch: `KLN90B_ApprArm_Push`.
    - **Internal, not public**: `KLN90B_Internal_RightScan_Left/Right` and `KLN90B_Internal_Key:`.
- LVars:
    - Read-only for aircraft:
        - `L:KLN90B_Power`, `L:KLN90B_RightScan`
        - `L:KLN90B_GPS_WP_BEARING`: RMI bearing according to manual appendix A. Differs from `GPS WP BEARING`, which is
          optimised for the autopilot.
        - `L:KLN90B_HSI_TF_FLAGS`: 0 = off, 1 = TO, 2 = FROM.
        - `L:KLN90B_RollCommand`: degrees, positive = left.
        - `L:KLN90B_IntegrityWarn`: newest (#87); true when the GPS is not valid.
        - `L:KLN90B_MsgLight`, `L:KLN90B_WptLight`, `L:KLN90B_AnnunTest`.
    - Writable by aircraft:
        - `L:KLN90B_Brightness` (0 to 1)
        - `L:KLN90B_Disabled` (hot swap)
        - `L:KLN90B_ObsSource`, `L:KLN90B_ObsTarget`, `L:KLN90B_ElectricitySimVarIndex`, `L:KLN90B_WriteGpsSimvars`.
          These override panel.xml values at runtime: `KLN90BPlaneSettingsParser` seeds the LVars from the XML and
          `SimVarSync.tick` reads them back every 100 ms into the mutable `planeSettings` object.
- Wiki pages referenced in the comments (RMI, CDI-HSI, Autopilot, External-Annunciators, Hot-Swapping) document this
  contract.

Writers live in `SensorsOut` and are called from `NavCalculator.setOutput()` every 1 Hz tick. Most are gated by
`output.writeGPSSimVars`.

- **Gated** by `writeGPSSimVars`:
    - `GPS OVERRIDDEN` (set to true every tick)
    - `GPS CDI SCALING`, `GPS IS ACTIVE FLIGHT PLAN`, `GPS IS ACTIVE WAY POINT`, `GPS OBS VALUE`
    - `GPS WP DESIRED TRACK`, `GPS WP TRACK ANGLE ERROR`, `GPS WP BEARING` (+TRUE), `GPS WP DISTANCE`, `GPS WP ETE`,
      `GPS WP ETA`, `GPS ETE`, `GPS ETA`
    - `GPS MAGVAR`, `GPS POSITION LAT/LON`, `GPS GROUND SPEED`, `GPS GROUND TRUE/MAGNETIC TRACK`
    - `GPS FLIGHT PLAN WP COUNT/INDEX`, `GPS WP NEXT/PREV ID/LAT/LON`, `GPS WP PREV VALID`
    - `GPS IS APPROACH ACTIVE`, `GPS APPROACH MODE` (0 = ENR, 1 = ARM, 2 = APR, 3 = self-test)
    - Vertical outputs are forced to 0 (`GPS GSI SCALING`, `GPS HAS GLIDEPATH=false`, ...) because the KLN has no
      vertical guidance.
- `GPS WP CROSS TRK` is written at 16 Hz from the filter by `setFilteredOutputs`. It has no `writeGPSSimVars` check of
  its own; it is fed only through gated `setXTK`.
- The OBS mode is set through key events `K:GPS_OBS_ON/OFF`, because the `GPS OBS ACTIVE` SimVar is effectively
  read-only. This happens only when **no** external LEG/OBS switch is installed. With a switch installed, `SimVarSync`
  *reads* `GPS OBS ACTIVE` and calls `modeController.setExternalObsMode`.
- **Not gated** by `writeGPSSimVars`:
    - All KLN LVars, `GPS COURSE TO STEER` (radians; "real KLN does not have this"), `K:VOR{1,2}_SET` (when `obsTarget`
      is set and the GPS drives NAV1).
    - Annunciators: `setMessageLight` (called from `controls/StatusLine.tsx` in the display tick, flashing while there
      are unread messages) and `setWptAlertLight` / `setAnnunTest` (from NavCalculator).
- Other outputs:
    - `WTFlightplanSync` mirrors FPL 0 into an SDK `FlightPlanner` with id `"kln90b"` (`initSyncRole:'primary'`): plan 0
      is DF legs and plan 1 is a direct-to plan "like the Garmins". Data stops after the MAP or an arc ("Install manual:
      We do not return data after a fence"). This happens only when `writeGPSSimVars` is set.
    - `KlnEfbSaver` answers EFB `avionicsRouteRequested`; `KlnEfbLoader` loads `syncedAvionicsRoute` into FPL 0 (lat/lon
      legs become temporary user waypoints in region `XY`).
- `SensorsOut.reset()` has the SimVar-zeroing code commented out because of an observed **CTD** when combined with
  `L:KLN90B_Disabled` and hot-swapping. Read that comment before touching GPS SimVar resets.

## Core 5. Navigation logic

**Flight plan model: our own, deliberately not the SDK FlightPlanner.** `data/flightplan/Flightplan.ts` says "the KLN
Flightplan really is dead simple".

- `Flightplan(idx, legs, bus)` holds
  `KLNFlightplanLeg {wpt: Facility, type: KLNLegType(USER|SID|STAR|APP), parentFacility?, procedure?: ProcedureInformation, flyOver?, fixType?: KLNFixType(IAF|FAF|MAP|MAHP), askObs?, arcData?: ArcData}`.
- There are 26 plans: index 0 is the active plan and 1 to 25 are stored. Each holds a maximum of 30 legs; `insertLeg`
  throws. Use `services/FlightplanUtils.insertLegIntoFpl`, which drops leg 0 of FPL 0 when it is full (C-1).
- Mutations publish **`flightplanChanged`**. `startBatchInsert/finishBatchInsert` suppress the intermediate events ("
  Would mess up the async asobo FPL sync"). Subscribers are `UserFlightplanPersistor` (persists every change) and
  `WTFlightplanSync`.
- `getLegs()` returns the **internal mutable array**.
- `removeProcedures()` keeps only USER legs. Procedures are never persisted.
- Branch `switch-to-wt-flightplan` (commit 580c4e7, Nov 2024, "does not compile at all and will probably be abandoned")
  lists why the SDK `FlightPlan`/`LNavComputer` does not fit:
    - pseudo-legs for direct-to versus the 30-leg limit
    - arcs measured as direct distance
    - OBS mode
    - random direct-to
    - facility-per-leg needs
    - SDK classes reading real SimVars instead of the KLN's computed values
    - unwieldy segments
- `WTFlightplanSync` is the only bridge to the SDK flight plan, and it is output-only.

**`ActiveWaypoint`** (`data/flightplan/ActiveWaypoint.ts`, owned by `VolatileMemory.navPage.activeWaypoint`):

- It holds `from: {wpt, path: GeoCircle}`, `to: KLNFlightplanLeg`, `fplIdx` (-1 means a random direct-to or none),
  `isDirectTo` and `turnStack: TurnStackEntry[]`.
- API: `directTo`, `directToFlightplanIndex`, `cancelDirectTo`, `activateFpl0()` (chooses the *closest* leg to the
  plane, as checked against the KLN 89 trainer), `sequenceToNextWaypoint`, `getFutureLegs`/`getDestination` (stop at the
  MAP, 6-20), `getFollowingLeg`, `recalculatePath`.
- Emits **`activeWaypointChanged`** and persists the active waypoint ICAO to the `activeWaypoint` setting.
- `assertToMatchesFplIdx()` runs on every getter and compares by **instance** (not ICAO). If the user edited the plan,
  it re-activates or turns into a random direct-to.
- **Gotcha:** `CACHED_CIRCLE` is a module-level shared `GeoCircle` that is used as `from.path` for great-circle legs. It
  is mutated in place, so do not keep references expecting it to stay the same.

**`NavCalculator`** (`data/navdata/NavCalculator.ts`, 1 Hz) does all navigation math and then calls `setOutput()` to the
sim.

- It handles self-test and GPS-invalid by flagging all values to null. If there is no active leg it calls
  `activateFpl0()`.
- DIS is always the direct distance, even for arcs (6-18).
- XTK uses the top of the turn stack during turns (4-8) and the leg circle otherwise.
- DTK is the bearing at the closest point. `bearingForAP` equals the DTK on arcs, a workaround so the autopilot tracks
  DME arcs.
- TO/FROM is defined as `|bearing - dtk| <= 90`.
- Sequencing (not in OBS mode, GS > 2):
    - With `turnAnticipation` on and the waypoint not fly-over or duplicated, it computes the turn radius from
      `bankeAngleForStandardTurn(gs)` (`services/KLNNavmath.ts`; it assumes 5 deg/s roll rate,
      `distanceToAchieveBankAngleChange`).
    - At the turn start it pushes two `TurnStackEntry`s (the pre-turn straight segment and the turn circle).
    - It sequences when the plane is abeam (the distance starts increasing).
    - If the turn is too tight, it sequences immediately ("like KLN 89 trainer", fix #76).
- Without turn anticipation, it sequences on FROM.
- **The MAP is never auto-sequenced.**
- Waypoint alert thresholds: `WPT_ALERT_WITH_TURN_ANTI` / `WPT_ALERT_WITHOUT_TURN_ANTI = 36` s.
- `MAX_BANK_ANGLE = 25`. `HOURS_TO_SECONDS` is exported from here and widely imported.

**`ModeController`** (`services/ModeController.ts`, manual 5-36):

- Modes are `NavMode {ENR_LEG, ENR_OBS, ARM_LEG, ARM_OBS, APR_LEG}`, stored in `navPage.navmode`. `navPage.xtkScale` is
  5 (ENR), 1 (ARM) or 0.3 (APR).
- Auto-arm happens within 30 NM of the approach airport (the `parentFacility` of the first APP leg). The scale ramps 5
  to 1 over 30 s.
- ARM becomes APR when the FAF is active, within 2 NM, the MAP is ahead and the track is within 110 deg of FAF to MAP.
  APR becomes 0.3 at the FAF ("Integrity check?" is a TODO; there is no RAIM).
- `armApproachPressed()` is triggered from MainPage on `EVT_APPR_ARM`.
- **OBS mode is implemented as a direct-to from a synthetic user facility (`ICAO.value("U","XX",...)`) 1000 NM away on
  the reciprocal of the OBS** (`setObs`).
- For OBS on VORs, the magnetic variation is taken from the VOR's `magneticVariation`, negated ("Seems to be opposite to
  the magvar service").
- Status-line feedback: `NO APPROACH`, `NO ACTV WPT`.

**`RollSteeringController`** (1 Hz) is adapted from WT `LNavComputer`. It writes `L:KLN90B_RollCommand` and
`GPS COURSE TO STEER`.

- Cases: on track (proportional), no intercept (45-degree intercept), or optimal-bank intercept (at most 30 degrees).
- `adjustBankAngleForArc` and `ArcTurnController` exist but are unused.

**`Vnav`** (`services/Vnav.ts`): NAV 4 advisory VNAV with the state machine `Inactive/Armed/Active`. It uses
`navPage.nav4*` fields and has no sim output.

**`KLNMagvar`** (`data/navdata/KLNMagvar.ts`):

- Uses `MagVar.get(coords)` between 74°N and 60°S (5-44). Outside that band it uses the pilot-entered
  `navPage.userMagvar`, which resets to 0 when re-entering coverage.
- Convention: DTK and bearings are stored **true**; `obsMag` and `getDtkOrObsMagnetic()` are magnetic, and the names say
  which.

**SID/STAR/approaches** (`data/navdata/SidStar.ts`):

- Converts SDK procedures into KLN legs. It keeps the IAF/FAF/MAP/MAHP and the last leg, drops step-downs, merges
  consecutive AF arcs and computes `ArcData` (VOR, radials, entry point, `GeoCircle`).
- The arc entry point is created as a temporary user waypoint in `XY` and recalculated from the current position (
  `recalculateArcEntryData`).
- `isProcedureRecognized` filters out RNAV procedures as the real unit does.
- Approach names are formatted as `R/V/N + rwy + suffix + -IDENT`.
- Fix suffix glyphs are Latin-1 chars that map to custom font glyphs: IAF `à`, FAF `á`, MAP `ã`, MAHP `â`.

**Alerts:**

- `AirspaceAlert` (3-39) uses `NearestLodBoundarySearchSession` every 10 s with `SPECIAL_USE_AIRSPACE_FILTER`. It is
  inhibited in ARM/APR modes and posts `AirspaceAlertMessage` / `InsideAirspaceMessage`.
- `BoundaryUtils.isInside` is a hand-written point-in-polygon with dateline handling; it **ignores circular airspaces**.
- `services/AirspacesAlongRoute` is used by pages.
- `AltAlert` (3-56) and `HtAboveAirportAlert` (3-58) beep through `AudioGenerator`, which uses SDK `SoundServer` with
  `kln_short_beep` / `kln_long_beep`. The aircraft `sound.xml` must define these, and they only work if
  `Output.AltitudeAlertEnabled` is set. `BaseInstrument.onSoundEnd` forwards to `AudioGenerator`.
- `MSA` is a lat/lon 1-degree grid from `Assets/msa.json` (`[lat+56][lon+180]`); `getMSAForRoute` gives the ESA.
- `Timers` keeps the flight timer (GS >= 30 kt or power-on, depending on the `flightTimer` setting) and the persisted
  `totalTime`.

## Core 6. Navdata access

- **Always go through `KLNFacilityLoader`** (`data/navdata/KLNFacilityLoader.ts`, implements `FacilityClient`), not the
  SDK `FacilityLoader`.
    - `getFacility` checks `KLNFacilityRepository` first, then the real loader (`_tryGetFacility`).
    - Nearest search sessions for Airport/VOR/NDB merge repo results with Coherent results (
      `KLNCoherentNearestSearchSession`, `KLNNearestAirportFacilitySearchSession`, `KLNNearestVorSearchSession`; repo
      sessions use negative ids). `searchByIdentWithIcaoStructs` and `findNearestFacilitiesByIdent` are merged as well.
- `KLNFacilityRepository` (singleton, `getRepository(bus)`) is adapted from the SDK `FacilityRepository`.
    - The SDK version only supports USR facilities. **The KLN lets users create user waypoints of any type** (
      APT/VOR/NDB/INT/SUP); SUP corresponds to USR.
    - It keeps a `GeoKdTree` per type and supports `add`, `update(fac, mutator)`, `remove` and `forEach`.
    - It syncs across instruments on the bus topic **`KLNfacilityrepo_sync`** (`SYNC_TOPIC`), with
      Add/Remove/Update/DumpRequest/DumpResponse. `UserWaypointPersistor` and `Scanlist` listen to it.
- ICAO conventions (`data/navdata/IcaoBuilder.ts`):
    - User waypoints use region **`XX`** (`USER_WAYPOINT`).
    - **Temporary** waypoints (EFB lat/lon legs, arc entry points) use region **`XY`** (`TEMPORARY_WAYPOINT`).
      `TemporaryWaypointDeleter` deletes unused `XY` waypoints on every power event (5-22); the `isTemporary` flag is
      not persisted.
    - `buildIcao*` string variants are `@deprecated`; use `buildIcaoStruct*` (`IcaoValue`).
      `UniqueIdentGenerator.getUniqueIdent` appends letters or digits to avoid duplicates.
- `Scanlists` / `FacilityLoaderScanlist` (`data/navdata/Scanlist.ts`, 3-21) implement alphabetical scanning with
  outer-knob scrolling. Instead of holding all ICAOs, they keep a moving window cache filled by `searchByIdent`, plus an
  index of the first ident per letter. Async jobs are cancelled by a job id. `sync(icao)` re-centres the window.
- `Nearestlists` (`data/navdata/NearestList.ts`): APT/VOR/NDB lists with a 9-item maximum and a 500 NM radius. The
  search runs every 10 s and bearing and distance update every 1 Hz. The airport filter comes from the
  `nearestAptSurface` and `nearestAptMinRunwayLength` settings, with `updateFilters()` called from pages.
- `NearestUtils`: nearest helpers for pages and airspaces. It double-checks `BoundaryUtils.isInside`, because the SDK
  only checks the bounding box ("CANADA RVSM").
- `Database` (`data/navdata/Database.ts`): AIRAC expiry from `FacilityLoader.getDatabaseCycles().current`;
  `isAiracCurrent()`.
- `FirMap.ts` (FIR code to 3-letter name) and `CountryMap.ts` (`STATEMAP`, `COUNTRYMAP`) are static lookup tables used
  by APT/WPT pages and the REF/CTR/TRI pages.
- `data/Text.ts convertTextToKLNCharset`: the display only supports `A-Z 0-9 space -`, and unknown characters are
  stripped.

## Core 7. Persistence

Everything goes through SDK **UserSettings saved by `UserSettingSaveManager`** (DataStore) under the key
`"<ATC MODEL>.profile_1"`. `KLN90BSettingSaveManager` concatenates four managers:

- `KLN90BUserSettings`: about 55 typed keys. These include `welcome1..4`, `powercycles`, `totalTime`, `timezone`, baro,
  `lastLatitude/Longitude`, `lastAlmanacDownload`, `activeWaypoint` (ICAO **V1** string), alert settings,
  `turnAnticipation`, the NAV 5 and Super NAV 5 layout, CAL page inputs, `fastGpsAcquisition` and `userDataFormat`.
- `KLN90BUserWaypointsSettings`: `wpt0..wpt249` (`MAX_USER_WAYPOINTS=250`).
- `KLN90BUserFlightplansSettings`: `fpl0..fpl25` (`NUM_FLIGHTPLANS=25`, inclusive loop).
- `KLN90BUserRemarkSettings`: `rmk0..rmk9` (`NUM_REMARKS=10`).
- The setting key names and value formats are **backward-compatibility-critical**. Users keep data across versions. Add
  new keys with defaults; never repurpose old ones.

**Versioned user data formats** (`userDataFormat`; the default is 0, meaning V1). Both loaders must keep working:

- V1 (MSFS 2020 era):
    - User waypoints are a fixed-width string starting with a **12-char ICAO V1**, then lat `+DDMM.MM` and lon
      `+DDDMM.MM`, then type-specific fields: APT has altitude, runway length in ft and surface `H/S/-`; VOR has
      frequency and magvar; NDB has frequency.
    - Flight plans: setting `fpl{i-1}` stores FPL i (1 to 25); FPL 0 is not stored. The value is the concatenated
      12-char V1 ICAOs.
    - Code: `UserWaypointLoaderV1`, `UserFlightplanLoaderV1`.
- V2:
    - The same layout but with the **19-char `ICAO.valueToStringV2`**, so all field offsets shift by 7.
    - `fpl{i}` stores FPL i for 0 to 25, **including FPL 0**. Only USER legs are stored.
    - Code: `UserWaypointLoaderV2`, `UserFlightplanLoaderV2`.
- Migration in `KLN90BCore.asyncInit`: if the format is not 2, re-persist all waypoints and plans with the V2 writers, then
  set `userDataFormat=2`. Writers (`UserWaypointPersistor.serialize*`, `UserFlightplanPersistor.persistFlightplan`) only
  produce V2.
- Restore errors cause empty plans and the `USER DATA LOST` message.
- `Flightplanloader.loadIcaos` (base class) truncates to 30 legs and emits `WAYPOINT xxx DELETED` messages (at most 10,
  then `OTHER WAYPOINTS DELETED`).
- Persist triggers: waypoints persist on any `KLNfacilityrepo_sync` Add/Remove/Update (all 250 slots are rewritten);
  flight plans persist on `flightplanChanged`.
- Remarks (`settings/RemarksManager.ts`): stored as `ident(4 chars) + 3×11 chars`, keyed by airport ident; publishes
  `changed` (`RemarksChangedEvent`).
- **`VolatileMemory`** (`data/VolatileMemory.ts`) is not persisted. It holds RAM state for each page group:
  `aptPage/vorPage/ndbPage/intPage/supPage` (`WaypointPageState`), `altPage`, `dtPage`, `fplPage {flightplans}`, *
  *`navPage: NavPageState`** (the hub for nav results, mode, `activeWaypoint`, `isSelfTestActive`, NAV 4 VNAV inputs,
  `userMagvar`), `triPage`, `calPage`, `ctrPage` and `othPage`.
    - `reset()` runs on every power-on. It resets these fields, **removes procedures from FPL 0**, and re-initialises
      the first scan-list entry per type, setting `isReady` when done; WelcomePage waits on `isReady`.
- **Persistent messages** (`data/PersistentMessages.ts`) are condition-driven message objects. They are not stored; see
  Core 9.

## Core 8. Aircraft configuration (panel.xml `PlaneHTMLConfig`)

`settings/KLN90BPlaneSettings.ts`, `KLN90BPlaneSettingsParser.parsePlaneSettings(xmlConfig)`:

- It finds the `<Instrument>` whose `<Name>` is `KLN90B` and reads dotted paths with
  `getOption(tag, "Input.Airdata.IsInterfaced", default)`. Values are coerced by the type of the default; booleans
  compare equal to `'true'`.
- Keys and defaults:
    - `TakeHomeMode` = false
    - `BasePath` = `html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B`, used for asset URLs
    - `VFROnly` = false
    - `Input.AltimeterInterfaced` = true
    - `Input.ObsSource` = 1
    - `Input.HeadingInput` = false
    - `Input.ElectricitySimVar` = `""`
    - `Input.Airdata.{IsInterfaced=false, BaroSource=0}`
    - `Input.FuelComputer.{IsInterfaced=false, Unit=GAL, Type=AVGAS, FOBTransmitted=true, FuelUsedTransmitted=true}`
    - `Input.ExternalSwitches.{LegObsSwitchInstalled=false, AppArmSwitchInstalled=false}`
    - `Output.{ObsTarget=0, AltitudeAlertEnabled=true, WriteGPSSimVars=true}`
    - `debugMode` = false (hard-coded)
- Note that the sample `cfg/panel.xml` sets `AltitudeAlertEnabled=false`, while the code default is true.
- After parsing it writes the four runtime-override LVars (Core 4). An `ElectricitySimVar` like `CIRCUIT ON:1` has its
  index replaced every 100 ms by `L:KLN90B_ElectricitySimVarIndex`.
- `KLN90PlaneSettings` is **mutable at runtime** through `SimVarSync`; code reads `planeSettings.input/output.*` live.
- Consumers: `Sensors` (all inputs and outputs), `ModeController`, `NavCalculator.setMode` (writeObs),
  `PersistentMessages` (obsTarget chooses between `AdjustCourse...` variants; `AltitudeFailMessage`),
  `BrightnessManager`, `AudioGenerator`, `AltAlert`, `HtAboveAirportAlert`, `WTFlightplanSync`, `KlnEfbSaver`, `MSA` and
  `Gps` (basePath), and pages (`VFROnlyPage`, `SelfTestRightPage`, `PageTreeController`, `WelcomePage`).

## Core 9. Messages, status line and annunciators

- `data/MessageHandler.ts`: `Message {seen, message: string[], isConditionValid()}`.
    - `OneTimeMessage` stays valid until it is seen. `AirspaceAlertMessage` and `InsideAirspaceMessage` add geometric
      conditions.
    - `MessageHandler` (a 1 Hz tickable) keeps `activeMessages`. Each tick it drops invalid messages, adds
      `persistentMessages` whose condition becomes true, and resets their `seen` flag when the condition goes false.
    - Messages are added with `messageHandler.addMessage(new OneTimeMessage(["LINE1","LINE2"]))`; each line holds at
      most about 22 to 23 characters.
- `buildPersistentMessages(props)` creates: `AltitudeFailMessage`, `ArmGPSApproachMessage`, `DatabaseOutOfDateMessage`,
  `IfRequiredSelectObsMessage`, `MagvarMessage`, `Obs200NMMessage`, `PressAltToSetBaroMessage`, `VnavAlertMessage`, plus
  `AdjustCourseToWithObsReadingMessage` (`ADJ NAV IND CRS TO xxx°`) when `obsTarget===0`, otherwise
  `AdjustCourseMessage`.
- The MSG page (`controls/MessagePage.tsx`) shows newest first. `controls/StatusLine.tsx` shows the `MSG` indicator and
  drives `L:KLN90B_MsgLight` in the display tick: flashing while unread, steady while read, off when empty.
- **Status-line transient messages** are a separate channel. Publish `statusLineMessage` (`StatusLineMessageEvents`)
  with a `KLNErrorMessage` literal; it is a typed string union in `StatusLine.tsx` (`"NO APPROACH"`,
  `"USR DB FULL"`, ...). Add new strings to the union.
- The WPT alert light is steady (a video contradicts the manual's "flashing") and comes from `navPage.waypointAlert`.
  The annunciator test LVar and `GPS APPROACH MODE=3` are used during the self-test.

## Core 10. Conventions and gotchas

- **Manual references.** Comments like `3-29`, `5-36` or `6-20` are page numbers in the *KLN 90B Pilot's Guide* (
  006-08773-0000; linked in the README and the KLN90B.tsx class doc).
    - "Install manual" and "maintenance manual page N" refer to other Bendix/King documents.
    - Behaviour is also justified with YouTube timestamps and the "KLN 89 trainer". Preserve these references when
      editing; they are the spec.
- **Faithful emulation, including quirks:**
    - CRT warm-up and slow display; 1 Hz calculations
    - 90 s acquisition and almanac rules; the GPS week rollover
    - the 30-leg limit; the MAP is not auto-sequenced
    - SUA alerts treat everything as inside when there is no altitude input (3-40)
    - procedures are removed on power-on
    - only USER legs persist
    - RNAV SIDs and STARs are excluded
    - only `A-Z0-9 -` can be displayed
- **Deliberate non-real additions:** `GPS COURSE TO STEER`, the roll-steering LVar for the autopilot, `bearingForAP` on
  arcs, the fast GPS acquisition setting (default on) and keyboard mode. Missing on purpose or not implemented: RAIM,
  failures, 3-satellite plus altitude solutions, circular airspaces, and CTA/TMA in the SUA filter (TODO).
- **Event bus topics** are typed by interfaces declared next to their owner. There is no central file:
    - `PowerEvent.powerEvent` (`PowerButton.ts`)
    - `PropsReadyEvent.propsReady` (`KLN90BCore.ts`)
    - `FlightplanEvents.flightplanChanged` (`Flightplan.ts`)
    - `ActiveWaypointChangedEvents.activeWaypointChanged` (`ActiveWaypoint.ts`)
    - `GPSEvents.timeUpdatedEvent` (`Gps.ts`)
    - `ErrorEvent.error` (`controls/ErrorPage.tsx`)
    - `StatusLineMessageEvents.statusLineMessage` and `KeyboardEvent.keyboardevent` (`controls/StatusLine.tsx`)
    - `RemarksChangedEvent.changed` (`RemarksManager.ts`)
    - `KLNfacilityrepo_sync`
    - SDK topics: `hEvent`, `gps_system_state_changed_1`, `simTime`, `gps-position`
- **Units:** `data/Units.ts` has type aliases only (`Feet`, `NauticalMiles`, `Degrees`, `Knots`, `Seconds`, ...), for
  documentation. Internals use NM, knots and degrees (true unless the name says Mag). `GeoPoint.distance` returns GA
  radians, so convert with `UnitType.GA_RADIAN.convertTo(x, UnitType.NMILE)`. SimVar writes convert to meters, radians
  and m/s through `UnitType`/`SimVarValueType`.
- **Allocation hygiene:** module-level caches like `VEC3_CACHE`, `TO_GEOPOINT_CACHE` and `CACHED_CIRCLE` are reused, in
  SDK style. Beware of aliasing.
- **Global and singleton state:** `KLNFacilityRepository.INSTANCE`, the `KLN90BUser*Settings` managers (`INSTANCE ??=`),
  `FlightPlanner` id `"kln90b"`, and the `SimVar`/`Coherent` globals from `@microsoft/msfs-types`. Because of these
  singletons the tests run one headless unit per test (testing.md). `global.d.ts` only
  declares `*.scss`. `KeyCode.*` constants are ambient.
- **Error handling:** a try/catch around every tick and interaction publishes `error`, which shows the on-screen error
  page with an "OK and suppress further errors" button. Async code mostly uses `.catch(e => bus.pub("error"))` or
  `console.error`. Restore failures degrade to `USER DATA LOST`.
- Display geometry: 23×7 characters, 9×13 px each, ×4 zoom (`data/Constants.ts` must match `$zoom-factor`, `$charWidth`
  and so on in `KLN90B.scss`). The SCSS contains a `.dummy` font hack ("without this, the font is not loaded and can't
  be used in the canvas").

# Part 2: UI

## UI 0. Mount and startup chain

- `kln90b/KLN90B.tsx` `class KLN90B extends BaseInstrument`. It imports `../KLN90B.scss`, which rollup compiles to
  `KLN90B.css`.
- `pageManager.Init(bus, userSettings)` (`pages/PageManager.ts`) builds a `controls/PageContainer.tsx` and renders it
  with `FSComponent.render` into `document.getElementById('InstrumentsContainer')`. That element comes from
  `resources/html_ui/.../KLN90B/KLN90B.html`: `#Mainframe > #Electricity > #InstrumentsContainer`.
- `PageContainer` is permanent. It holds `#pageContainer.glow` (where the current Page goes), a transparent full-screen
  `<input class="keyboard">` (keyboard mode), and an `ErrorPage`. `ErrorPage` shows any `ErrorEvent` published on the
  bus.
- `PageManager.setCurrentPage(Type, props)` → `PageContainer.setCurrentPage`. This destroys the old Page, runs
  `FSComponent.buildComponent`, then `rerenderCurrentPage()` sets `innerHTML=""` and renders again.
- Startup sequence. Each step is a full Page:
    1. `PowerButton.ts` → `WelcomePage`, or `NullPage` when powered off.
    2. `WelcomePage.tick` waits about 15 s and for the `propsReady` bus event. It then goes to
       `FiveSegmentPage{SelfTestLeftPage, SelfTestRightPage}`, or to `FourSegmentPage{TakehomePage}` when
       `planeSettings.takeHomeMode` is set.
    3. `SelfTestRightPage.approve()` → `FourSegmentPage{VFROnlyPage | ObsWarningPage | AiracPage}`.
    4. → `pageManager.startMainPage(props)`, which builds `MainPage{lPage: Nav2Page, rPage: SupPage}`. If there is a
       last active waypoint, `rPage` is that waypoint's page instead (Apt4/Vor/Ndb/Int/Sup), and its
       `props.memory.*Page` is pre-seeded.
    5. With `forceReadyToUse` (engine running at load), `WelcomePage` goes straight to `startMainPage`.
- `PageProps` (`pages/Page.tsx`) is the single "services bag" passed to every page and many controls. It holds bus,
  userSettings, planeSettings, sensors, pageManager, messageHandler, hardware, memory (`VolatileMemory`),
  facilityLoader, facilityRepository, nearestLists, nearestUtils, scanLists, remarksManager, msa, vnav, modeController,
  database, magvar and sidstar. It is assembled in `KLN90BCore.asyncInit` and published as `propsReady`.

## UI 1. Page model

### Interfaces (`pages/Page.tsx`)

- `UiElement { children: UIElementChildren<any>; tick(blink); render(): VNode|null }`. Pages, controls and displays all
  implement it. The UI is a tree of `UiElement`s.
- `UIElementChildren<T>` wraps a named child map. It offers `get(key)`/`set` (typed through a
  `type XxxPageTypes = {...}` map), `walk(fn)` (recursive), `getallFlat()` (depth-first, in insertion order),
  `getall()`, and `static forList(list)` (keys become `i0..iN`). `NO_CHILDREN` is the empty singleton.
- `Page` is a *full screen* (top-level container). It adds `onInteractionEvent(evt): boolean`, `isEnterAccepted`,
  `isLeft/RightCursorActive`, `left/rightPageName`, `isMessagePageShown` and `hasStatusline`. Implemented by `MainPage`,
  `FiveSegmentPage`, `FourSegmentPage`, `NullPage` and `WelcomePage`.
- `PageSide { LeftPage, RightPage }`.

### Page base classes

| class             | file                           | what                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|-------------------|--------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `SixLineHalfPage` | `pages/FiveSegmentPage.tsx`    | One half-screen page (11 cols x 6 rows). Abstract `name`, `children`, `cursorController`, `render()`. Has `numPages`/`currentPage`/`setCurrentPage(n)` (clamped) for sub-pages, `scanLeft/scanRight()` (default false), `protected requiresRedraw` + `redraw()`, and `tick()` that calls `redraw()` once when flagged. **Almost every normal page extends this.**                                                                                                                                                                                                                                                                                               |
| `FiveSegmentPage` | same                           | A `Page` showing `lPage` + `rPage` (both `SixLineHalfPage`) + `StatusLine`. Has no page tree. Used for the self test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `SixLinePage`     | `pages/FourSegmentPage.tsx`    | Full-width 6-line page with its own `lCursorController`/`rCursorController`, plus `msg()` and `enter(): boolean`. Used for `MessagePage`, `SuperNav1Page`, `Set0Page` and the startup pages.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `FourSegmentPage` | same                           | A `Page` wrapping one `SixLinePage` + `StatusLine`. Its ENT order is left ctrl → right ctrl → `page.enter()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `SevenLinePage`   | `pages/OneSegmentPage.tsx`     | Full 7-line page with no status line. Used only by `SuperNav5Page`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `WaypointPage<T>` | `pages/right/WaypointPage.tsx` | `SixLineHalfPage` for APT/VOR/NDB/INT/SUP. Holds `facility` (a `T`, a `NearestWpt<T>` or null) and `ident`. Abstract `getMemory()` (e.g. `props.memory.aptPage`), `getScanlist()`, `getNearestList()`. Implements SCAN (`ScanHandler`, which speeds up the longer the knob is turned (3-21), then flows into or out of the nearest list) and `changeFacility()`. Props variants: `WaypointPageProps` (`facility`, a temporary or confirm display that does not write memory unless it is a NearestWpt) and `ActiveWaypointPageProps` (`facility`, `idx`, for the ACT page). Helpers: `unpackFacility`, `isNearestWpt`, `isWapointPage` (sic), `isUserWaypoint`. |

### MainPage (`pages/MainPage.tsx`): the real UI after startup

- `children = NO_CHILDREN`. MainPage ticks and renders everything itself. It owns:
    - `leftPageStack` / `rightPageStack` (`PageStack`). Element 0 is the knob-selected *base page*. Pushed entries carry
      a `parent` (`push(page, parent)`). `parentRemoved(parent)` drops children of a popped page from the *other* side's
      stack, e.g. the ALT page left pushes `Nav4RightPage` right with `parent=altPage`, and a waypoint confirm page on
      the right has the editor's page as parent.
    - `overlayPageStack` (`OverlayStack` of `SixLinePage | SevenLinePage`). Full-screen overlays: `MessagePage`,
      `SuperNav1Page`, `SuperNav5Page`, `Set0Page`. While shown, `leftRef`/`rightRef` get `d-none`.
    - `leftTreeController` / `rightTreeController` (`PageTreeController`).
- API used by pages: `getLeftPage/getRightPage/getOverlayPage`, `setLeftPage/setRightPage` (replace the base page and
  sync the tree), `pushLeftPage/pushRightPage/pushPage(page,parent,side)`, `popLeftPage/popRightPage/popPage(side)`,
  `pushOverlayPage/popOverlayPage`. Pages reach MainPage with `this.props.pageManager.getCurrentPage() as MainPage`.
  This cast is everywhere.
- Super pages, in `checkIfSuperPageIsShown()` (runs on every set/push/pop):
    - Both sides `instanceof Nav1Page` → push `SuperNav1Page`.
    - Both `Nav5Page` → `SuperNav5Page`.
    - Left is `Set0DummyPage` → `Set0Page` (SET 0 is full screen; the dummy only marks the tree position).
    - While a super page is shown, the knobs (cursor off) still move the underlying tree controllers.
- Rerender: setting a page only flags `rerenderLeftPage/RightPage/OverlayPage`. The actual `innerHTML=""` +
  `FSComponent.render(page.render())` happens in `MainPage.tick`.

### PageTreeController (`pages/PageTreeController.ts`)

- `LEFT_PAGE_TREE` (8 groups, outer knob): TRI(0-6), MOD(1-2), FPL(0-25), NAV(1-5, with `Nav4LeftPage`), CAL(1-7), STA(
  1-5), SET(1-10, then `Set0DummyPage`), OTH(1-10).
- `RIGHT_PAGE_TREE` (10 groups): CTR(1-2), REF, ACT (`ActPagePage`), D/T(1-4), NAV(1-5, with `Nav4RightPage`), APT(1-8),
  VOR, NDB, INT, SUP.
- `movePage(dir)` = outer knob (wraps around). `moveSubpage(dir)` = inner knob. It first steps through the current
  page's own `numPages`, then moves to the next or previous class in the group. Going backwards lands on that page's
  *last* sub-page.
- `subPageIndices` remembers the last sub-page per group.
- `createPage(type)` = `new type(this.props)`. **Pages are recreated on every knob step.** Instance state is lost, so
  durable state lives in `props.memory` (`VolatileMemory`: `aptPage`, `vorPage`, `ndbPage`, `intPage`, `supPage`,
  `navPage`, `fplPage`, `dtPage`, `triPage`, `altPage`, ...) or in `userSettings`.
- The tree position is found with `instanceof` (`getPageIndices`). Every slot must therefore be a *distinct class*. That
  is why `Fpl0Page...Fpl25Page` are trivial subclasses of `FplPage({page:n})`, and why NAV 4 is split into
  `Nav4LeftPage`/`Nav4RightPage` (they differ in `getPageSide()`). Nav1/2/3/5 are the same classes in both trees.
- Plane-setting pruning happens in the constructor through `splice` with hard-coded indices. Without airdata it removes
  OTH 9/10; without a fuel computer it removes OTH 5-8. **Gotchas:**
    - The indices must change if you insert pages into OTH.
    - It mutates the module-level const arrays and runs again for every new `MainPage` (each power-on), so repeated
      pruning is possible. Example: airdata interfaced but no fuel computer — the second construction's `splice(4,4)`
      would remove OTH 9/10.
    - The APT 8 line `tree[5].splice(7, 0)` removes nothing (deleteCount 0).
- `CustomPageTreeController` / `isCustomPageTreeController(page)` (`"pageTreeController" in page`). `ActPagePage` and
  `WaypointConfirmPage` own a private `PageTreeController(RIGHT_PAGE_TREE, innerPage, ...)`, so the right inner knob
  browses APT 1-8 etc. *of that waypoint* instead of the main tree. They copy `name`/`numPages` from the inner page in
  `pageChanged`.

### Naming conventions

- Class: `<Group><n>Page`, e.g. `Apt7Page`, `Nav5Page`, `Oth3Page`, `Ctr2Page`, `Dt4Page`, `Tri0Page`, `Set10Page`.
  Single-page groups have no number: `VorPage`, `NdbPage`, `IntPage`, `SupPage`, `RefPage`, `ActPagePage`.
- Variant halves composed inside a wrapper page:
    - `Dt1FplPage`/`Dt1OtherPage`. `Dt1Page.tick` swaps between them depending on whether the left page
      `instanceof FplPage`. It reassigns `children` and `cursorController` and sets `requiresRedraw`.
    - `Apt2DBPage`/`Apt2UserPage` (database vs user waypoint; both are children of `Apt2Page`, toggled with `d-none` +
      `isReadonly`).
    - `Apt3MapPage` + `Apt3ListPageContainer`/`Apt3ListPage`/`Apt3UserPage` (`Apt3Page` sums their `numPages`).
- Full-screen companions are prefixed `Super` (`SuperNav1Page`, `SuperNav5Page`, with controls `SuperNav5Left/Right`,
  `selects/SuperNav5*`).
- Startup: `WelcomePage`, `SelfTestLeftPage`/`SelfTestRightPage`, `TakehomePage`, `VFROnlyPage`, `ObsWarningPage`,
  `AiracPage`.
- Temporary pushed pages: `DirectToPage` (name `"DIR  "`), `AltPage`, `DuplicateWaypointPage` (name `"     "`),
  `WaypointConfirmPage`.
- `name` is exactly 5 chars and is shown in the status line: `"APT 2"`, `"D/T 1"`, `` `FPL${n.padStart(2)}` `` →
  `"FPL 0"`/`"FPL10"`. When `numPages > 1`, MainPage shows `name[0..3] + "+" + name[4]`, e.g. `"APT+3"`. This is the
  real unit's "+" multi-page indicator.

## UI 2. Input handling

### Event flow

1. MSFS H events → `KLN90B.onInteractionEvent(args)` → `KLN90BCore.onInteractionEvent(args)`. Event names are in
   `kln90b/HEvents.ts`, for example:
    - `KLN90B_LeftLargeKnob_Left` = `EVT_L_OUTER_LEFT`
    - `..SmallKnob..` = INNER
    - `KLN90B_LeftCursor_Toggle` = `EVT_L_CURSOR`
    - `EVT_ENT`, `EVT_CLR`, `EVT_MSG`, `EVT_DCT`, `EVT_ALT`, `EVT_R_SCAN`, `EVT_APPR_ARM`, power and brightness
    - internal ones: `EVT_R_SCAN_LEFT/RIGHT`, `EVT_KEY = "KLN90B_Internal_Key:"`
2. When `hardware.isScanPulled` (toggled by `EVT_R_SCAN`), right inner left/right is rewritten to
   `EVT_R_SCAN_LEFT/RIGHT`.
3. Then `hEventPublisher.dispatchHEvent` and `pageManager.onInteractionEvent(evt)` → `PageContainer` →
   `currentPage.onInteractionEvent(evt)`. Everything is wrapped in try/catch → `ErrorEvent` → `ErrorPage` overlay.

### Return-value convention

- Knob, CLR, CRSR and keyboard handlers return `boolean` (true = handled).
- ENT returns `Promise<EnterResult>` (`pages/CursorController.ts`), one of:
    - `Not_Handled`
    - `Handled_Keep_Focus` (stay on the field, e.g. invalid input or deleting a list item)
    - `Handled_Move_Focus` (the CursorController then calls `outerRight()` to advance to the next field)
- The top level ignores the result. Inside MainPage, "not handled" is meaningful.

### MainPage dispatch rules (`MainPage.onInteractionEvent`)

- **Order of precedence for knobs:** overlay page → cursor-active page → tree navigation.
- Outer knob with cursor off: on the base page → `treeController.movePage(±1)`. On a pushed page (DCT, confirm, ...) → *
  *pop it and re-dispatch the same event** (KLN 89 trainer behaviour). The same holds for overlays when their cursor
  controller returns false.
- Inner knob with cursor off: `isCustomPageTreeController(page)` → `page.pageTreeController.moveSubpage`. Otherwise base
  page → `moveSubpage`, otherwise pop and re-dispatch.
- `EVT_R_SCAN_*`: with the right cursor off → `page.scanLeft/Right()`. With the cursor on it *falls through* to
  inner-knob behaviour.
- `EVT_ENT` → `handleEnter()`:
    1. If left `isEnterAccepted()` → left.enter; else if right accepts → right.enter.
    2. Otherwise try left.enter, then right.enter.
    3. Overlays → `overlay.enter()`.
- `EVT_CLR` → `left.clear() || right.clear()` (or the overlay's).
- `EVT_MSG` → push `MessagePage`, or call `MessagePage.msg()` to page through. It pops itself after the last page.
- `EVT_DCT` → push `DirectToPage` left, or `directToPressed()` if it is already shown (toggles ACTIVATE in OBS).
- `EVT_ALT` → toggle `AltPage` left, plus `Nav4RightPage` right with its cursor forced active.
- `EVT_APPR_ARM` → `modeController.armApproachPressed()`.

### CursorController (`pages/CursorController.ts`)

- Each half page owns one; `SixLinePage` has `lCursorController` and `rCursorController`. `NO_CURSOR_CONTROLLER` is a
  shared instance for pages without fields. Built with `new CursorController(this.children)`.
- Fields are obtained by `children.getallFlat().filter(isField && !isReadonly)` and **recomputed on every call**.
  Toggling `isReadonly` (or `setVisible` on a `Button`) therefore adds or removes a field live.
- **Cursor order = depth-first insertion order of the children map.** Declaring children in a different order changes
  the CRSR sequence. Nested sub-page children (e.g. `Apt2Page.dbPage/userPage`) are included.
- `toggleCursor()` returns false when there are no fields. `setCursorActive` remembers the last `cursorField` (comment "
  4.1.2"). `setDefaultCursorField(n)` and `focusIndex(i)` are available.
- With the cursor on:
    - outer knob moves between fields, unless the focused field `isEntered`, in which case the field receives the outer
      knob (moving within an editor);
    - inner knob → `field.innerLeft/Right()`;
    - `enter()` → `field.enter()`;
    - `clear()` only if `field.isClearAccepted()`.
- `refreshChildren(children)` must be called when the child *instance set* changes (dynamic lists). `isEnterAccepted()`
  drives the blinking `ent` in the status line.
- `Field` interface = `CursorHandler` (`outerLeft/outerRight/innerLeft/innerRight/enter/clear/keyboard(key)`) +
  `UiElement` + `isFocused`, `isEntered`, `isReadonly`, `isEnterAccepted()`, `isClearAccepted()`, `setFocused()`.
- **Duck typing:** `isField(el)` is `"isReadonly" in el`. Similar checks: `isListItem` (`"isItemFocused" in el`),
  `isWapointPage` (`"facility" in page`), `isCustomPageTreeController` (`"pageTreeController" in page`). Adding a
  property with one of these names to an unrelated class changes routing.

### Keyboard mode (PC keyboard input)

- `PageContainer.setupKeyboard()` is driven by a left click on the status line row (`isWithinY(...,6)`) over the "CRSR"
  text: chars 1-5 for left, 18-22 for right. It only works while that side's cursor is active and the page
  `hasStatusline()`.
- The click focuses the invisible input (`Coherent.trigger('FOCUS_INPUT_FIELD')`), and the status line shows `KYBD`
  flashing. Right click, Esc, blur, or the cursor turning off leave keyboard mode (`resetKeyboard`).
- Key codes are published as bus `keyboardevent` (`KeyboardEventData{side,keyCode}`). `KLN90BCore.handleKeyboardEvent`
  maps them back to H events:
    - Enter → ENT
    - PgUp/PgDn → inner knob right/left
    - Backspace/End → outer left
    - Home → outer right
    - Del → CLR
    - A-Z/0-9/numpad → `EVT_KEY + side + ":" + key`
- `services/KeyboardService.routeKeyboardEvent` (called first in every `Page.onInteractionEvent`) →
  `cursorController.keyboard(key)` → `field.keyboard(key)`. If that returns true it auto-advances with `outerRight()`.

## UI 3. Controls and rendering

### Rendering technique

- Plain DOM text in `<pre>` blocks with the custom TTF font `KLN90B` (`resources/.../KLN90B/Assets/kln90b.ttf`). Each
  glyph is a 9x13 "pixel" cell scaled by `$zoom-factor: 4` (font-size 44px, line-height 52px). There is no canvas for
  text.
- Layout is a **character grid**. The JSX writes literal rows with `<br/>` and spaces as `&nbsp`, and values are padded
  with `padStart`/`padEnd` so columns line up.
    - Full screen: 23 cols x 7 rows (`$xChars`, `$yChars`).
    - Half page: 11 cols x 6 rows. `.left-page` sits at x=0; `.right-page` sits at x=11.5 chars, with a 1px left border
      plus half-char padding.
    - Row 7 is the status line (`.statusline`, `top = 6*charHeight`, border-top).
- Constants are mirrored in `kln90b/data/Constants.ts` (`ZOOM_FACTOR=4`, `CHAR_WIDTH=9`, `CHAR_HEIGHT=13`, `MARGIN_X=4`,
  `MARGIN_Y=3`, map font `CHAR_WIDTH_MAP=6`, `CHAR_HEIGHT_MAP=7`). **They must stay in sync with the SCSS.**
- The font maps special KLN glyphs onto spare Latin-1/Greek/Cyrillic code points:
    - `›` active-waypoint arrow (`displays/ActiveArrow`); `"d›"` is the direct-to symbol
    - `°`, `±`, `•`
    - `η θ ι` CDI scale dots (`displays/DeviationBar`)
    - `Ш Щ Ъ` super-NAV deviation bar
    - `Æ` the STAR label (`Apt7Page`, `SidStar`)
    - `ç` (STA 5 bars)
    - `Ê Ë Í Ì` mode glyphs (`SuperNav5Left`)
    - `Ó Ô Õ Ö Ø Ù Ð ‹` used in `SuperNav5*` selectors
    - Lowercase a-t and w exist as small glyphs and are used for units and status text (`nm`, `ft`, `fr`, `ent`, `msg`,
      `enr-leg`). Always write display text in uppercase except for these deliberate small letters.
- `data/Text.ts` `convertTextToKLNCharset()` strips everything except `A-Z 0-9 space -`. Use it for database strings
  such as city names.
- Inverse video: CSS class `inverted` (green background, black text). `Inverted` (`controls/Inverted.tsx`) is a JSX
  wrapper for static inverse text.
- Flashing: `TickController.tickDisplay` passes `blink=true` on every 4th 250 ms tick. Elements toggle `blink` (text
  transparent) or `inverted-blink` (cancels inverse) in their `tick(blink)`. `controls/Blink.tsx` is a flashing inverse
  text element. Focused `Button`/`ListItem`/editor chars use `inverted` + `inverted-blink`; a focused `SelectField` is
  steadily inverted.

### Tick / redraw discipline (important)

- `TickController.ts`: display tick 4 Hz (`TICK_TIME_DISPLAY=250`), calc tick 1 Hz, signals at 16 Hz.
- **The rule: DOM changes happen only inside `tick`/`redraw`, never in input handlers.** This emulates the slow CRT.
  Handlers mutate fields such as `textDisplay.text = ...`, `requiresRedraw = true` or `rerenderXxx = true`, and the next
  tick writes the DOM.
- Tick traversal: `PageContainer.tick` → `page.tick(blink)` + `page.children.walk(el => el.tick(blink))`. MainPage
  instead ticks the status line, then either the overlay or both half pages, each with `children.walk`.
- Pages with live data set `this.requiresRedraw = true` in `tick()` before `super.tick()` (Nav2Page, Nav4Page,
  Nav5Page). `render()` often sets `requiresRedraw = true`, because `render()` runs again every time the page is
  re-shown.
- Every control guards DOM access with `TickController.checkRef(ref...)`, because refs are null while not rendered (
  hidden list rows, page not yet mounted).
- Lifecycle:
    - `render()` builds the VNode, which may be called multiple times. `tick(blink)` handles updates. `redraw()` (
      SixLineHalfPage) handles flagged updates.
    - `destroy()` exists only on `DisplayComponent` Pages (`MainPage`, `FiveSegmentPage`, `FourSegmentPage`,
      `StatusLine`). Half pages are never destroyed; they are just dropped.
    - Half pages that subscribe to the bus (`Oth3Page`, `Oth4Page`) never unsubscribe. Each recreation adds a
      subscription, so this is a likely leak; avoid copying it.
    - No `onAfterRender` is used, except in `ErrorPage`.

### Element catalogue (`controls/`)

- **Displays** (`controls/displays/`, read-only `UiElement`s with public mutable value fields, rendered on tick):
    - `TextDisplay(text)`
    - `DistanceDisplay(length, nm)` (null → dashes, decimals dropped when too long; comments cite which manual page uses
      which length)
    - `BearingDisplay` (`"---°"`, `flash`)
    - `AltitudeDisplay`/`ElevationDisplay`, `SpeedDisplay`, `DurationDisplay`, `TimeDisplay`, `FuelDisplay`,
      `TemperatureDisplay`, `LatitudeDisplay`, `LongitudeDisplay`, `RoundedDistanceDisplay`
    - `DeviationBar`, `SuperDeviationBar`, `ActiveArrow` (flashes during waypoint alert, 3-29), `FlightplanArrow`
    - Convention: null value → dashes.
- **Editors** (`controls/editors/`; manual 3-14, "jump in, edit char by char, confirm with ENT"):
    - `Editor<T>` is an abstract `Field` composed of `EditorField`s (char cells with a `charset`).
    - Subclass hooks: `convertFromValue(value): number[]` and `async convertToValue(raw): T|null`. Null → status
      `INVALID ENT` with `Handled_Keep_Focus`. Optional `onCharChanged()`.
    - The first inner-knob turn sets `isEntered` (fields reset to `DEFAULT_FIELD_VALUE`, cursor on char 0). The outer
      knob then moves between chars, the inner knob changes the char, and ENT validates and calls
      `enterCallback(value)`.
    - `setValue()` updates the display unless the editor is being edited.
    - Field classes in `EditorField.tsx`: `AlphabetEditorField` (space, A-Z, 0-9), `NumberEditorField` (
      `createWithMinMax`, `createWithBlankMax`), `MonthEditorField`, `NorthSouth/EastWest/RunwaySurfaceEditorField`.
    - Concrete editors: Bearing, Date, Distance, Elevation, Freetext, Latitude, Longitude, Magvar, NdbFreq, Radial,
      RunwaySurface, Speed, Time, VorFreq, Waypoint.
- **Selects** (`controls/selects/`; immediate-effect fields, no ENT):
    - `SelectField(valueSet: string[], index, changedCallback)`: the inner knob cycles and calls back at once;
      `keyboard()` picks a value by its text.
    - `*Fieldset` classes (`AltitudeFieldset`, `BaroFieldset`, `BearingFieldset`, `FpmFieldset`, `FuelFieldset`,
      `SpeedFieldset`, `TempFieldset`, `TimeFieldset`, `VolumeFieldset`, `VnavFieldsets`) are plain `UiElement`s with
      one `SelectField` per digit, so each digit is its own cursor stop. They offer `setValue`/`setReadonly`.
    - `WaypointSelector` (base of `AirportSelector`, `VorSelector`, `NdbSelector`, `IntersectionSelector`) is the
      per-character ident at the top of waypoint pages. Changing a char looks up and loads the facility immediately via
      callback.
    - Also: `NearestSelector`, `MapOrientationSelector`, `SupplementarySelector`, `ObsDtkElement`,
      `CreateWaypointMessage` ("CREATE NEW WPT AT: USER POS? / PRES POS?" buttons, shown when the ident has no match),
      `SuperNav5Field1/2/3Selector`, `SuperNav5RangeSelector`, `SuperNav5DirectToSelector`.
- **Buttons, lists, misc:**
    - `Button(text, enterCallback, clearCallback?)` with `setVisible`.
    - `List(children, height 4|5|6)` auto-scrolls to the focused `ListItem`, with `refresh(children)`. Subclasses:
      `LastItemAlwaysVisibleList` (APT 7/8) and `Apt8IafList`.
    - `SimpleListItem<T>({value, fulltext, onEnter, onDelete, onBeforeDelete, deleteText})`. CLR → shows `DEL x ?`
      flashing → ENT confirms; CLR again cancels (4-5).
    - `WaypointDeleteListItem`.
    - `FlightplanList`/`FlightplanListItem`/`EditableFlightplan` (FPL pages).
    - `Canvas`, `StatusLine`, `MessagePage`, `ErrorPage`, `PageContainer`, `CoordOrNearestView`,
      `AirportCoordOrNearestView`, `SuperNav5Left/Right`.

### How a page declares fields (canonical shape; see `pages/left/Set3Page.tsx`, `pages/left/Nav2Page.tsx`)

```ts
type Set3PageTypes = { runwayLength: SelectField, runwaySurface: SelectField };
export class Set3Page extends SixLineHalfPage {
  public readonly cursorController; readonly children: UIElementChildren<Set3PageTypes>;
  readonly name = "SET 3";
  constructor(props: PageProps) { super(props);
    this.children = new UIElementChildren<Set3PageTypes>({ runwayLength: new SelectField(...), ... });
    this.cursorController = new CursorController(this.children); }   // or NO_CURSOR_CONTROLLER
  render() { return (<pre>NEAREST APT<br/>...{this.children.get("runwayLength").render()}'<br/>...</pre>); }
  protected redraw() { /* push new values into children */ }
}
```

### Canvas (`controls/Canvas.tsx`)

- `Canvas(CanvasSize.HALFPAGE | FULLPAGE)` is a `<canvas>` sized from the character constants (half page 11x6 chars;
  full page 17 chars minus 5px by 7 rows, to the right of the Super NAV 5 left column).
- `getDrawingContextWithCenterRange` (NAV 5 north up), `...WithOffsetCenterRangeRotation` (DTK/TK/HDG up, aircraft 3/4
  down) and `...WithBoundingBox` (APT 3 runway diagram) return a `CoordinateCanvasDrawContext` built on an SDK
  `MapProjection`. It offers `drawLine`, `drawFlightplanLine`, `drawFlightplanArrow`, `drawArc`, `drawArcWithArrow`,
  `drawLabel` and `drawIcon` in lat/lon, with `GeoCircleResampler` for great circles and arcs.
- `CanvasDrawContext` draws **manual Bresenham pixel lines**: the comment says antialiasing could not be disabled. Text
  uses `KLN90BMap` 7px. `drawLabel` tries 9 positions and picks the one with the fewest overdrawn pixels, using a
  `Bitset` occupancy map.
- Users: `Nav5Page`, `SuperNav5Page`, `Apt3MapPage`. The `.dummy` class on `#Mainframe` exists only to force-load the
  map font for canvas use.

## UI 4. Status line, messages, ENT confirmation, adding pages

### StatusLine (`controls/StatusLine.tsx`)

- Layout: `<5-char left name>|<11-char middle>|<5-char right name>` = 23 chars, inside `<pre><span class="statusline">`.
  It reads `props.screen` (the owning `Page`).
- Left and right fields show the page name, or inverted `CRSR` when the cursor is on, or flashing `KYBD` in keyboard
  mode. The middle shows the nav mode: `enr-leg`, `enr:123`, `arm-leg`, `arm:123` or `apr-leg`.
- After the mode comes:
    - `ent` flashing when `screen.isEnterAccepted()`;
    - else `msg` inverted (flashing while unread messages exist);
    - else `msg` plain while the message page is open.
- Short error messages: publish `bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO SUCH WPT")`.
  The value is typed `KLNErrorMessage` (union: `INVALID ENT`, `DUP IDENT`, `NO APT WPTS`, `FPL FULL`, ...). It shows
  inverted for `STATUS_MESSAGE_TIME = 5000` ms (manual 3-10). Non-standard texts are cast `as any` (e.g.
  `` `d› CRS ${obs}` `` in `DirectToPage`).
- The status line also drives the annunciator `sensors.out.setMessageLight` (flashing or steady). It special-cases
  `"SET 0"` (blank mode and right name, 3-7).

### MessagePage (`controls/MessagePage.tsx`)

- A `SixLinePage` overlay. It builds pages from `messageHandler.getMessages()` (newest first, at most 6 lines per page)
  and marks them `seen`.
- `msg()` goes to the next page, popping at the end. `enter()` jumps to `Apt1Page` of the nearest airport (emergency
  nearest).
- Messages are added by services with `messageHandler.addMessage(new OneTimeMessage([...lines]))`.

### Waypoint ENT-confirmation flow (`controls/editors/WaypointEditor.tsx`, manual 3-14/3-15/3-28)

1. Props: `{...props, value, enterCallback, parent: this, pageSite?}`. `parent` is the hosting half page, used for stack
   parenting. `pageSite` is the side where `DuplicateWaypointPage` appears.
2. Inner knob → enter edit mode. Each char change runs `onCharChanged()`, which auto-completes the remaining chars from
   the first `searchByIdentWithIcaoStructs` match (3-14).
3. ENT → `convertToValue` → `findNearestFacilitiesByIdent`, filtered to exact ident matches:
    - none → `NO SUCH WPT`;
    - several → `await DuplicateWaypointPage.selectDuplicateWaypoint()`. This pushes a list page and returns a Promise
      that resolves when a row is ENTed.
4. `confirmValue()` sets `isAwaitingConfirmation` (the editor chars flash through `EditorField.isParentBlink`, and the
   editor keeps `isEntered` to hold the cursor). It calls
   `WaypointConfirmPage.showWaypointconfirmation({...props, facility, callingEditor: this}, parent)`, which pushes onto
   the right stack.
5. `WaypointConfirmPage` picks `Apt1Page`/`NdbPage`/`VorPage`/`IntPage`/`SupPage` by facility type and wraps it in its
   own page tree (see section 1). It has no scan.
6. The status line shows flashing `ent`. A second ENT → `currentValueConfirmed()` pops the confirm page and calls
   `enterCallback(facility)`. ENT on the right side reaches `WaypointConfirmPage.enter()`, which delegates to
   `callingEditor`.
7. Turning the inner knob or typing while waiting → `cancelAwaitingConfirmation()` (3-28). Outer knob is blocked while
   waiting. CLR → `confirmValue(null)`, which clears.
8. Alternate method (3-15): ENT on a non-entered editor while a waypoint page is shown on the right adopts that
   waypoint.
9. `confirmCurrentValue()` starts confirmation directly. Used by `DirectToPage` (pre-filled from: the FPL 0 cursor
   waypoint → the Super NAV 5 target → the right waypoint page → the active waypoint, or the missed approach on a MAP
   FROM leg → blank) and by FPL inserts from the REF page (`FplWptEnterMode.CONFIRM`).

### Dynamic lists pattern (FPL, OTH, APT 7/8)

- Rebuild the item array, wrap it in `UIElementChildren.forList(items)`, then call `list.refresh(children)` *and*
  `cursorController.refreshChildren(children)`. Then `focusIndex()` if needed.
- `FplPage` creates its `CursorController(NO_CHILDREN)` first and passes it into `FlightplanList.build(...)`, which
  refreshes it.
- Newly inserted rows carry `enterMe: FplWptEnterMode` (`ROTATE_LEFT`, `ROTATE_RIGHT`, `ENTER`, `CONFIRM`, `KEYBOARD`)
  so the new row is auto-entered after the rebuild.
- FPL 0 keeps the active leg in view (4-8). `getVisibleLegsIndices()` feeds the D/T pages.

### Recipe: add a new page (as the existing code does it)

1. Create `kln90b/pages/left|right/XxxNPage.tsx`. Extend `SixLineHalfPage`, or `WaypointPage<T>` for a waypoint page (
   implement `getMemory`, `getScanlist`, `getNearestList`). Include:
    - a `type XxxNPageTypes`
    - `readonly name` (5 chars)
    - `children = new UIElementChildren<...>({...})`, in cursor order
    - `cursorController` (`new CursorController(this.children)` or `NO_CURSOR_CONTROLLER`)
    - `render()` as a `<pre>` within 11 x 6 chars
    - `redraw()`, and a `tick()` override if the data is live
    - multi-sub-page pages set `numPages` and override `setCurrentPage`
2. Import it in `pages/PageTreeController.ts` and insert the class into the right group of `LEFT_PAGE_TREE`/
   `RIGHT_PAGE_TREE`. It must be a unique class, so subclass if the same page sits in two slots.
3. If its presence depends on plane settings, add or fix the hard-coded `splice` indices in the `PageTreeController`
   constructor.
4. Keep any state that must survive re-selection in `VolatileMemory` (`kln90b/data/VolatileMemory.ts`) or in
   `userSettings`, because the instance is recreated on every knob step.
5. Temporary or modal pages are not put in the tree. They are pushed with
   `mainPage.pushLeftPage/pushRightPage(page, parent)` from an event or another page. Full-screen pages extend
   `SixLinePage` or `SevenLinePage` and are triggered through `pushOverlayPage`, or a dummy tree page plus
   `checkIfSuperPageIsShown`, as SET 0 does.
6. Hardware-key behaviour (MSG, D→, ALT) is hard-wired in `MainPage.onInteractionEvent`. A new button needs a constant
   in `HEvents.ts` and a `case` there.

## UI 5. Styling (`KLN90B.scss`)

- Variables: `$zoom-factor: 4`, `$xChars: 23`, `$yChars: 7`, `$charHeight: 13px`, `$charWidth: 9px`, `$xMargin: 4px`,
  `$yMargin: 3px`, `$green: #00D109` (also hard-coded in `Canvas` `fillStyle`).
- Screen arithmetic: (23x9 + 2x4) x 4 = **860**; (7x13 + 2x3) x 4 = **388**. This matches the `panel.cfg` `860,388`
  given in the README.
- Fonts: `@font-face KLN90B` → `./Assets/kln90b.ttf`; `KLN90BMap` → `./Assets/kln90b-map.ttf`. The source is
  `resources/html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/`, copied by rollup's
  `copyResourcesAndUpdateManifest`.
- `#InstrumentsContainer` sets font KLN90B at `11px*4`, line-height `13px*4`, green on black, with margins.
- `.glow` (on `#pageContainer`) = `blur(0.5px) drop-shadow(0 0 1px green) drop-shadow(0 0 10px green)`. The comments
  explain that the real unit never looks sharp and its glyphs bleed.
- Layout classes: `.left-page`, `.right-page` (border-left, x = 11.5 chars), `.full-page`, `.statusline` (fixed at row
  6, border-top), `.canvas-halfpage`/`.canvas-fullpage` (`image-rendering: pixelated`), `.super-nav5-*`,
  `.nav-5-bottom-controls`, `.apt-8-iaf-list`, `.offset-left-cursor`, `.use-invert` (negative-margin overlay trick for
  FPL "USE? INVRT?" in `FlightplanList.UseInvertButton`).
- State classes: `.inverted`, `.inverted-blink`, `.blink`, `.d-none`.
- `.keyboard` (invisible full-screen input). `.errorpage` styles the JS error overlay.
- Note: `.inverted-blink` and `.blink` must be declared after `.inverted` so they override it. The order is meaningful.

## UI 6. Conventions and gotchas

- **Comments like `3-14`, `4-5`, `5-2`, `3-29` are KLN 90B Pilot's Guide page numbers** (section-page; the code calls
  it "the manual"). Class doc comments usually cite the page that the page implements (`Set3Page` → 3-22,
  `DirectToPage` → 3-27, `FplPage` → 5-2). Other sources cited: the maintenance manual (tick rates, `TickController`),
  YouTube timestamps of real units, and the **KLN 89 trainer** for undocumented behaviour (pop-and-redispatch on knobs,
  ENT advances the cursor, scan with cursor on acts as the inner knob). Keep citing the source when emulating a quirk.
- Deliberate quirks:
    - laggy 4 Hz display;
    - status messages for 5 s;
    - `ent`/`msg` flashing;
    - outer knob closing temporary pages;
    - SCAN acceleration by event rate (`ScanHandler`, `SPEEDSTEP`);
    - the ACT page shows the last active waypoint or "NO ACTIVE WAYPOINT", and SCAN moves along FPL 0;
    - comments flag invented values ("I have no idea, which ranges the device supports" for the NAV 5 ranges).
- Formatting helpers: `format()` from npm `numerable` (`"000"`, `"0.0"`, `"00000"`, `"+00"`) plus `padStart`/`padEnd`.
  The display classes own the formatting rules. `Utils.Clamp` and `Utils.Translate` are MSFS globals. Unit type aliases
  come from `data/Units.ts` (`Feet`, `NauticalMiles`, `Degrees`). Magnetic conversion goes through
  `props.magvar.trueToMag/magToTrue`.
- Pages often reach across to each other through MainPage: `Dt1Page` checks the left page type; `Nav5Page` draws an icon
  for the right waypoint page; `DirectToPage` reads `Fpl0Page.getSelectedWaypoint()`/
  `SuperNav5Page.getDirectToTarget()`; `FlightplanList.changeProcedure` opens `Apt7Page`/`Apt8Page` on the right. Expect
  `instanceof` checks against concrete page classes, so renaming or splitting classes has ripple effects.
- Read-only toggling: hide sections with `classList d-none` in `redraw()` and set the matching fields
  `isReadonly = true` so the cursor skips them (`Apt2UserPage`). `Button.setVisible(false)` does both.
- Sub-page wrappers (`Dt1Page`, `Apt3Page`, `ActPagePage`, `WaypointConfirmPage`) replace `this.children` and
  `cursorController` at runtime and re-render into their own `ref` in `redraw()`. `Apt3Page` overrides
  `getCursorController()` instead.
- `CursorController.enter()` always advances on anything other than `Handled_Keep_Focus`. A field that wants to stay
  must return `Keep_Focus`.
- MainPage drops `props.lPage/rPage` after construction (sets them to null) so the instances can be freed. Do not read
  `this.props.lPage` in MainPage.
- `ErrorPage` catches exceptions from ticks and input and shows them on-screen. Thrown errors in pages are visible to
  the user, not silent.
