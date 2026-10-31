# KLN 90B architecture reference (fs2020, the 1.x line)

Detailed companion to [CLAUDE.md](../CLAUDE.md) for the `fs2020` branch. It covers the wiring that takes many files to
see, and **what this line lacks compared with master**, so that a backport can tell whether a master fix stands on
something that is not here. All paths are relative to the repo root, and the code lives under `kln90b/`. It describes
the code as of commit `0be7671f` (version 1.6b1); check the code when this document and the code disagree, and update
this document.

Master has its own, much longer `docs/architecture.md` (`git show master:docs/architecture.md`). The sections here keep
its numbering, so the two can be read side by side. Each section ends with **Not on this line**: master behavior that
does not exist here, with the master issue number it came with. Search this file for an issue number before a backport.

Comments such as `3-29` in the code are page numbers in the KLN 90B Pilot's Guide (006-08773-0000), the "manual".

# Part 1: Core

## Core 0. Debug hooks, branches and build

- Debug hooks:
    - `KLN90PlaneSettings.debugMode` is hard-coded to `false` in `KLN90BPlaneSettingsParser`; set it to true by hand. It
      skips the test pages (`WelcomePage` treats it like an engine-running start), gives instant brightness, makes
      `AudioGenerator` show `BEEP: n` on the status line, and shows ALM/TTF debug lines on STA 1.
    - `loggingEnabled = false` flags exist in `data/navdata/Scanlist.ts` and `services/RollSteeringController.ts`.
    - There is a commented-out `this.bus.onAll(console.log)` in `KLN90B.tsx`.
    - There is a lot of `console.log`.
    - The user setting `fastGpsAcquisition` (SET 10) **defaults to true** (`GPS_ACQUISITION_FAST`).
- The branch split from master at `38ae708f` (2025-01-27). The commits after it are backports: #43, #49, #84 (master's
  #76), #87, and the direct-to entry in the WT flight plan (`fccb21e8`).
- Build: `rollup.config.mjs` compiles `kln90b/KLN90B.tsx` and `KLN90B.scss` and writes `manifest.json` with the version.
  It copies nothing else: `KLN90B.html` and `Fonts/` sit at the repo root, and the package's `Assets/` folder (the fonts
  the SCSS loads from `./Assets/`, and `msa.json`) and `layout.json` are not in the repo. `KLN90B.css` at the root is a
  stale copy. See CLAUDE.md for the `tslib`, `build/` and `types/` caveats.

## Core 1. Startup and lifecycle

`KLN90B` (`kln90b/KLN90B.tsx`) is the whole instrument: a `BaseInstrument` holding the bus, the services, the pages and
the tick loops. It is registered with `registerInstrument('kln-90b', KLN90B)`, has `templateID` `'KLN90B'` and
`isInteractive` true, and forwards `onSoundEnd` to `AudioGenerator`. There is no `KLN90BCore`/`KLN90BPlatform` split:
the facility loader, the repository and the planner come straight from the SDK globals.

**constructor**:

- `new EventBus()` (a field), the single bus for everything. `Hardware` and `MessageHandler` are fields too.
- `KLN90BUserSettings(bus)` and `KLN90BSettingSaveManager`, then `load(saveKey)` and `startAutoSave(saveKey)` with
  `saveKey = "${SimVar 'ATC MODEL'}.profile_1"`. **All persistent data is per aircraft model.**
- `HEventPublisher`, the `keyboardevent` subscription (`handleKeyboardEvent`) and `PageManager`.

**Init()** calls `super.Init()` and then `asyncInit()`. The promise is ignored and nothing catches it.

**asyncInit()**, in order:

1. `KLN90BPlaneSettingsParser().parsePlaneSettings(this.xmlConfig)` ("The xml is not available before init!").
2. `forceReadyToUse = !!SimVar 'ENG COMBUSTION:1'`: an engine-running start skips the welcome and self-test pages.
3. `pageManager.Init(bus, userSettings)` renders the `PageContainer` and shows the `NullPage`.
4. `PowerButton` (it builds `BrightnessManager`), `AudioGenerator`, `Sensors` (it builds `GPS` and
   `KLNGPSSatComputer`), `hEventPublisher.startPublish()`, and `powerButton.forceReadyToUse()` when `forceReadyToUse`.
   No tick loop exists yet, so the Welcome page is drawn but does not tick until step 9.
5. Navdata: `new FacilityLoader(FacilityRepository.getRepository(bus))`, `KLNFacilityLoader(loader,
   KLNFacilityRepository.getRepository(bus))`, then `Scanlists`.
6. Persistence: `UserWaypointPersistor.restoreWaypoints()` (synchronous; a throw sets `restoreSuccessFull=false`), then
   `UserFlightplanPersistor`, `Nearestlists` and `NearestUtils`. The last active waypoint is loaded from the
   `activeWaypoint` setting (a V1 ICAO) with `getFacility`; a failure is only logged. Then
   `restoreAllFlightplan()`, which returns 26 `Flightplan`s; FPL 0 comes from the sim's flight plan (Core 4). If the
   waypoints already failed, the flight plans are not restored at all, and any failure gives 26 empty plans.
7. `VolatileMemory`, `WTFlightplanSync`, `AirspaceAlert`, `Vnav`, `KLNMagvar`, `ModeController`, then the
   `TickController` with all three tickable lists at once (Core 2), then `SimVarSync`, `MSA` and
   `TemporaryWaypointDeleter`. `USER DATA LOST` is added when a restore failed.
8. `Promise.all([nearestUtils.init(), nearestLists.init(), airspaceAlert.init(), msa.init(basePath)])`, then the
   **`PageProps`** are built (`RemarksManager`, `Database` and `SidStar` are created inline), `messageHandler
   .persistentMessages = buildPersistentMessages(props)` is set and **`propsReady`** is published. There is no
   `.catch`: a rejection or a call that never answers means `propsReady` never comes, and nothing reports it.

**`PageProps`** (interface in `pages/Page.tsx`) is passed to every page and control:
`ref, bus, userSettings, planeSettings, sensors, pageManager, messageHandler, hardware, memory (VolatileMemory),
facilityLoader, nearestLists, nearestUtils, scanLists, remarksManager, msa, vnav, modeController, database, magvar,
sidstar`. The facility repository is `facilityLoader.facilityRepo`. `PowerButton` and `WelcomePage` start with a reduced
`WelcomePageProps` (`bus, planeSettings, userSettings, pageManager, forceReadyToUse`) and swap in the full props when
`propsReady` arrives.

The SDK `EventBus` replays the last value of a cached topic to a late subscriber, so `VolatileMemory` and
`TickController` still see a `powerEvent` published before they existed.

**Power** (`PowerButton.ts`):

- Powered is `powerSwitchOn` (the knob, mirrored to `L:KLN90B_Power`) AND `electricityAvailable`. `SimVarSync` sets
  `electricityAvailable` every 100 ms from `Input.ElectricitySimVar`; if that option is empty, power is always
  available. Every change applies at once.
- The power and brightness H events are handled in the `PowerButton` constructor.
- On a power-on edge it increments the `powercycles` setting and shows `WelcomePage`; on a power-off edge it shows
  `NullPage`. Both publish **`powerEvent {isPowered, timeSincePowerChange}`**, measured with `Date.now()`.
- `lastPowerChangeTime` starts one hour in the past; `forceReadyToUse()` sets it to now and switches on.
- Subscribers to `powerEvent`, in subscription order: `PageContainer` (keyboard reset), `BrightnessManager` (CRT
  warm-up: `TIME_UNTIL_COLD` 10 min, `TIME_TO_WARM` 6 s, then a ramp), `GPS.powerChanged` (adds the off time to the
  clock on power-on), `Sensors.reset` (every edge: saves the position, resets the sat computer and stops the search,
  claims `GPS OVERRIDDEN`), `VolatileMemory.reset` (power-on only), `TickController`, `TemporaryWaypointDeleter`
  (every edge).

**Welcome and self-test flow**:

- `WelcomePage` waits `TEST_TIME = 17000` ms, a free cursor (the welcome lines can be edited) and `memory.isReady`,
  then shows `FiveSegmentPage(SelfTestLeftPage, SelfTestRightPage)`, or `TakehomePage` in a `FourSegmentPage` in
  take-home mode.
- With `forceReadyToUse` or `debugMode` it skips the wait, calls `gps.startGPSSearch()` and
  `gpsSatComputer.acquireAndUseSatellites()` and goes to `pageManager.startMainPage(props)`.
- `SelfTestLeftPage` sets `navPage.isSelfTestActive`. `SelfTestRightPage.approve()` clears it, beeps, calls
  `gps.startGPSSearch()` (the GPS searches only from here) and goes on to the VFR-only, OBS-warning and AIRAC pages.
- While `isSelfTestActive` is set: `NavCalculator` outputs fixed test values (XTK -2.5, DIS 34.5, DTK 315 mag, FROM,
  waypoint alert on), `RollSteeringController` sweeps 0 to -5 degrees of bank (with or without a heading input),
  `SensorsOut.setMode` writes `GPS APPROACH MODE = 3`, `L:KLN90B_AnnunTest` is set, and the status line lights the MSG
  annunciator.
- `VolatileMemory.isReady` is set once the waypoint pages' scan-list lookups have answered. A lookup that fails or never answers
  leaves the unit on the Turn-On page for good, with no error.

**Hot-swap disable**: `SimVarSync`'s 100 ms poll is the only reader of `L:KLN90B_Disabled`. `setDisabled` keeps the
state in its private `disabled` flag, calls `tickController.setEnabled(!disabled)` and `pageManager.resetKeyboard()`,
and when `writeGPSSimVars` is set writes `GPS OVERRIDDEN = !disabled`. The external LEG/OBS switch read is skipped
while disabled. H events are still handled.

**Input routing**: `KLN90B.onInteractionEvent(args)` calls `super`, handles the SCAN pull state
(`Hardware.isScanPulled`, mirrored to `L:KLN90B_RightScan`; while pulled, right-inner turns become
`EVT_R_SCAN_LEFT/RIGHT`), then `hEventPublisher.dispatchHEvent(evt)` and `pageManager.onInteractionEvent(evt)`. The
body is in a try/catch that publishes `error`. PC keyboard input is synthesized as `EVT_KEY + side + ":" + key` and
routed by `services/KeyboardService.routeKeyboardEvent`.

**Not on this line:** the `KLN90BCore`/`KLN90BPlatform` split and the tests; display ticks during the boot, the
self-test check of hung calls, `PendingCalls`, `TEST FAIL` and `selfTestFailure` (#416); `panelXmlErrors` (#145); the
V2 `activeWaypoint` and the `userDataFormat` migration (#415); the EFB route sync (#195); power ride-through (#332); the
GPS clock running on in sim time while off (#328); `navPage.isSelfTestApproved` (#330); `Hardware.isDisabled` and
dropping all input while disabled (#138); no `GPS OVERRIDDEN` claim while disabled (#350); the roll-steering self-test
gated on a heading input (#143).

## Core 2. Tick loops (`kln90b/TickController.ts`)

`TickController(bus, displayTickables, calcTickables, signalTickables)` runs three `window.setInterval` loops, **only
while the unit is powered AND enabled**. `KLN90B.asyncInit` builds it once with all three lists.

| constant                                 | tickables                                                                                                                                                                                     |
|------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `TICK_TIME_DISPLAY = 250` ms (4 Hz)      | `[pageManager]`; `tick(blink)`, `blink` true one tick in four                                                                                                                                  |
| `TICK_TIME_CALC = 1000` ms (1 Hz)        | `sensors, magvar, ndb/apt/vor NearestList, modeController, NavCalculator, airspaceAlert, HtAboveAirportAlert, AltAlert, Timers, vnav, messageHandler, RollSteeringController` (order matters) |
| `TICK_TIME_SIGNALS = 1000/16` ms (16 Hz) | `SignalOutputFillterTick(sensors)`, which writes `GPS WP CROSS TRK`                                                                                                                            |

- **Hard rule from the class doc: DOM manipulation happens only inside a display tick.** Handlers mutate state and the
  next `tick(blink)` renders it.
- Each tickable is wrapped in try/catch, which logs and publishes `error`. An async tick (`NearestList.tick`) is not
  awaited and its rejection is not caught. `NearestList` clears `isCalculating` only on success, so one failed search
  stops that list for good.
- The 16 Hz filter (`services/SignalOutputFilter.ts`) is a linear predictor: it takes the XTK in meters at 1 Hz and
  extrapolates it. It is not clamped and can overshoot.
- Expensive work throttles itself: `NearestList` and `AirspaceAlert` search every 10 s; `GPS` and `Timers` save every
  60 s. `SimVarSync` runs every 100 ms, always, even when powered off. `BrightnessManager` uses `Wait.awaitDelay`.
- The flight timer, the GPS clock in take-home mode and the XTK scale ramp integrate `TICK_TIME_CALC` per tick, so they
  assume the interval really fires at 1 Hz.
- `PageContainer`'s display tick also sets up the HTML keyboard input lazily, so keyboard mode works only once the
  display loop runs.

**Not on this line:** `addCalculations` and the boot-time display loop (#416); the rejection handler for async ticks
(#95); `NearestList`'s `finally` and the guard against searching before `init()` resolved (#424); the RC low-pass D-bar
filter clamped to two full scales (#158).

## Core 3. Sensors and GPS simulation

`Sensors` (`kln90b/Sensors.ts`) has `in: SensorsIn` (ticked at 1 Hz) and `out: SensorsOut` (writers). On every
`powerEvent` it calls `in.reset()` and `out.reset()`.

`SensorsIn.tick()`:

- `GPS DRIVES NAV1`; when true it reads `Nav OBS:{1|2}` by `Input.ObsSource`, else `obsMag = null`.
- `PLANE HEADING DEGREES GYRO` when the boolean `Input.HeadingInput` is set.
- Then `gps.tick()`, `fuelComputer.tick()` and `airdata.tick()`.

`FuelComputer` (only with `Input.FuelComputer.IsInterfaced`) reads `FUEL TOTAL QUANTITY WEIGHT`, `ENG FUEL FLOW PPH:n`
and `GENERAL ENG FUEL USED SINCE START:n`; with more than 2 engines everything is summed into engine 1. With the unit
`IMP`, the fuel type is ignored (`IMP_GALLON_FUEL` always). `Airdata` is the same as master: Gray-code altitude rounded
to 100 ft, or the full air-data set with `KOHLSMAN SETTING HG:{baroSource}`; the baro value persists in `barosetting`.

`GPS` (`kln90b/Gps.ts`) **simulates acquisition with the SDK 0.8 `GPSSatComputer`, then reads the true sim position.**
There is no position error, no noise and no RAIM.

- `KLNGPSSatComputer` (`// @ts-ignore extends GPSSatComputer`): 8 channels, sync role `'none'`, no SBAS groups. It
  overrides only `isAlmanacValid`: the almanac counts as valid when the unit's `internalTime` is within 10 minutes of
  the sim time, the private `distanceFromLastKnownPos` is under 60 NM (install manual) and the SDK's own check passes.
  When it is invalid the SDK falls back to its blind search.
- **Private SDK 0.8 internals** reached through `as any`: `simTime`, `distanceFromLastKnownPos`, `channels` (STA 1),
  `lastAlamanacTime` (saved as `lastAlmanacDownload`), `almanacProgress` and the satellites' `timeToAcquire` (debug
  lines of STA 1). They are not in SDK 2.x; a backported GPS change has to be checked against 0.8 itself.
- After its constructor the 0.8 computer reads time and position only from the bus: `GPS.tick` publishes `simTime` and
  `gps-position` on the shared bus and then calls `onUpdate()`, and does so only once `isStarted` is set.
- **The search starts at the self-test approval** (`gps.startGPSSearch()` from `SelfTestRightPage.approve`), or at once
  on an engine-running start. So no satellite is acquired during the self-test. `reset()` on every power event stops it.
- Timings (`GpsSearch` does not exist; these are the SDK options, read once at construction):

  | option                         | real                                  | FAST          |
  |--------------------------------|---------------------------------------|---------------|
  | `almanacExpireTime`            | 90 days (comment: the manual says 6 months) | same    |
  | `acquisitionTime`              | 90 ± 30 s                             | 10 ± 0.5 s    |
  | `acquisitionTimeWithEphemeris` | 60 ± 30 s                             | 10 ± 0.5 s    |
  | `acquisitionTimeout`           | 4 min                                 | 1 s           |
  | `ephemerisDownloadTime`        | 30 s                                  | 1 s           |
  | `almanacDownloadTime`          | 12.5 min                              | 1 s           |

  The ephemeris expiry is the SDK default (2 h). FAST downloads the almanac at construction; real starts from the saved
  `lastAlmanacDownload`. A change on SET 10 takes effect only after a reload.
- `isValid()` is true as soon as the SDK state is `SolutionAcquired` or `DiffSolutionAcquired`; `gpsAcquired()` runs
  from the `gps_system_state_changed_1` subscription. It can post `POSITION DIFFERS FROM LAST POSITION BY >2NM` and, for
  a time error over 10 minutes, `SYSTEM TIME UPDATED TO GPS TIME` and the `timeUpdatedEvent` (which `Database` uses to
  post DATA BASE OUT OF DATE). A 3-satellite plus altitude-aiding mode is a TODO.
- When valid, `coords` come from `PLANE LATITUDE/LONGITUDE` and `groundspeed` from `GROUND VELOCITY`; `trackTrue` is the
  bearing between successive fixes when GS >= 2 kt (`MIN_GROUND_SPEED_FOR_TRACK`, 3-35). When invalid the values freeze
  (4-13).
- `lastLatitude`, `lastLongitude` and `lastAlmanacDownload` are saved every 60 s and on every power event.
- Clock `timeZulu`: starts at `E:ABSOLUTE TIME` minus one hour plus a random ±2.5 s, and gets the off time
  (`timeSincePowerChange`, wall clock) added at each power-on. After a fix it is the sim time. There is no GPS week
  rollover emulation.
- STA 1 maps the SDK state directly (`Searching` INIT, `Acquiring` ACQ; NAV D, NAV or NAV A with a solution) and shows
  the true elevation. STA 5 builds a throw-away `GPSSatComputer` on a private bus for each prediction.
- `TakeHomeMode` (panel.xml): the unit dead-reckons from its last track and speed and shows the take-home page.

**Not on this line:** the start model `GpsSearch.ts` (ACQ, sky search, almanac search, inhibits) and the persisted
ephemeris (#62); search restarts after a date, time or position entry (#357); the SDK 2.3.3 `activeSimulationContext`
handling (#211); the STA 1 prediction (#213); the TRAN tick and `acceptForcedSolution` (#215); the long-lived RAIM
prediction context of STA 5; the week rollover (#63); the clock in sim time (#328); `L:KLN90B_HeadingInput` (#368) and a
SimVar name in `Input.HeadingInput` (#405); the `…EX1` fuel SimVar (#53, likely MSFS 2024 only); the IMP fuel-type fix
(#93); `timeUpdatedEvent` with a single subscriber (#175).

## Core 4. Output to the sim and the public aircraft contract

**`kln90b/HEvents.ts` and `kln90b/LVars.ts` are a public API for aircraft developers.** Never rename or remove them,
and keep their semantics stable. A backported one keeps master's name and meaning.

- H events (fired as `H:<name>`):
    - Power and brightness: `KLN90B_Power_Toggle`, `KLN90B_Brt_Inc`, `KLN90B_Brt_Dec`.
    - Buttons: `KLN90B_{MSG,DCT,CLR,ENT,ALT}_Push`.
    - Knobs: `KLN90B_{Left,Right}{Large,Small}Knob_{Left,Right}`, `KLN90B_{Left,Right}Cursor_Toggle`,
      `KLN90B_RightScan_Toggle`.
    - External switch: `KLN90B_ApprArm_Push`.
    - **Internal, not public**: `KLN90B_Internal_RightScan_Left/Right` and `KLN90B_Internal_Key:`.
- LVars, written by the unit:
    - `L:KLN90B_Power`, `L:KLN90B_RightScan`.
    - `L:KLN90B_GPS_WP_BEARING`: the RMI bearing, radians, magnetic. **Gated by `writeGPSSimVars`.**
    - `L:KLN90B_HSI_TF_FLAGS`: 0 = off, 1 = TO, 2 = FROM.
    - `L:KLN90B_RollCommand`: degrees, positive = left.
    - `L:KLN90B_IntegrityWarn` (#87): true when the GPS is not valid. Written inside `setPos`, so **gated**.
    - `L:KLN90B_MsgLight`, `L:KLN90B_WptLight`, `L:KLN90B_AnnunTest`.
- LVars, writable by aircraft:
    - `L:KLN90B_Brightness` (0 to 1): read once, in the `BrightnessManager` constructor (set to 1 if it is 0). Later
      writes by the aircraft are not polled.
    - `L:KLN90B_Disabled` (hot swap), polled every 100 ms.
    - `L:KLN90B_ObsSource`, `L:KLN90B_ObsTarget`, `L:KLN90B_ElectricitySimVarIndex` (only when
      `Input.ElectricitySimVar` has an index), `L:KLN90B_WriteGpsSimvars`. These override panel.xml values at runtime:
      `KLN90BPlaneSettingsParser` seeds them from the XML and `SimVarSync` reads them back every 100 ms into the mutable
      `planeSettings`. A change of `L:KLN90B_WriteGpsSimvars` also writes `GPS OVERRIDDEN`.

Writers live in `SensorsOut` and are called from `NavCalculator.setOutput()` every 1 Hz tick.

- **Gated** by `writeGPSSimVars`: `GPS OVERRIDDEN` (every tick); `GPS CDI SCALING`, `GPS IS ACTIVE FLIGHT PLAN`,
  `GPS IS ACTIVE WAY POINT`, `GPS OBS VALUE`; `GPS WP DESIRED TRACK`, `GPS WP TRACK ANGLE ERROR`, `GPS WP BEARING`
  (+TRUE), `GPS WP DISTANCE`, `GPS WP ETE/ETA`, `GPS ETE/ETA`; `GPS MAGVAR`, `GPS POSITION LAT/LON`, `GPS GROUND SPEED`,
  `GPS GROUND TRUE/MAGNETIC TRACK`; `GPS FLIGHT PLAN WP COUNT/INDEX`, `GPS WP NEXT/PREV …`, `GPS WP PREV VALID`;
  `GPS IS APPROACH ACTIVE`, `GPS APPROACH MODE` (0 ENR, 1 ARM, 2 APR, 3 self-test); the vertical outputs forced to 0.
- **Not gated**: `GPS WP CROSS TRK`, written at 16 Hz from the filter by `setFilteredOutputs` (0 until the filter has
  a value); `GPS COURSE TO STEER` (radians), written with the roll command; all other LVars; `K:VOR{1,2}_SET` when
  `obsTarget` is set and the GPS drives NAV1; the annunciator LVars (MSG from `StatusLine` in the display tick, WPT and
  the annunciator test from `NavCalculator`).
- The OBS mode is set through `K:GPS_OBS_ON/OFF` only when **no** external LEG/OBS switch is installed. With a switch,
  `SimVarSync` reads `GPS OBS ACTIVE` and calls `modeController.setExternalObsMode`.
- `SensorsOut.reset()` has the SimVar-zeroing code commented out because of an observed **CTD** when combined with
  `L:KLN90B_Disabled` and hot swapping. Read that comment before touching GPS SimVar resets. A power-off writes nothing:
  every output keeps its last value.
- **`WTFlightplanSync`** mirrors FPL 0 into an SDK `FlightPlanner` with id `"kln90b"` (`initSyncRole:'primary'`): plan
  0 is DF legs, data stops after the MAP or at an arc; plan 1 is a direct-to plan, created for every direct-to and
  deleted otherwise. `flightplanChanged` is gated by `writeGPSSimVars`, `activeWaypointChanged` is not. Nothing is
  mirrored until the first change after the boot.

**The sim's flight plan** (instead of master's EFB route sync):

- **Loading** (`settings/AsoboFlightplanLoader.ts`): at every instrument start `restoreFlightplan(0)` registers
  `JS_LISTENER_FLIGHTPLAN`, calls `LOAD_CURRENT_ATC_FLIGHTPLAN`, waits a fixed 3 s and calls `GET_FLIGHTPLAN`. The
  departure and arrival procedures are dropped (origin, en-route part, last waypoint are kept). A leg with a
  12-character ICAO is used as is; anything else becomes a temporary user waypoint (region `XY`, unique ident). Then
  `Flightplanloader.loadIcaos` keeps at most 30 legs and posts `WAYPOINT xxx DELETED` for the rest (at most 10, then
  `OTHER WAYPOINTS DELETED`). It is not gated by `writeGPSSimVars`. If the listener never answers, `asyncInit` hangs.
- **Saving** (`settings/AsoboFlightplanSaver.ts`): every `flightplanChanged` of FPL 0 with `writeGPSSimVars` set clears
  the sim's plan and rebuilds it with `SET_ORIGIN`, `SET_DESTINATION`, `ADD_WAYPOINT` and `ADD_CUSTOM_WAYPOINT` (user
  waypoints). `Flightplan.startBatchInsert/finishBatchInsert` keep a batch from flooding this async sync. FPL 0 is never
  stored in the unit's own settings.
- **File import** (`services/FplFileimporter.ts`, SET 10, a page the real unit does not have): when
  `/VFS/flightplan/kln/kln.pln` exists, SET 10 offers IMPORT FPL?; the `ATCWaypoint` entries are converted to ICAOs
  (user waypoints become temporary `XY` waypoints) and loaded into FPL 0 with `Flightplan.load`.

**Not on this line:** `KLN90B_Power_On`/`_Power_Off` (#51); the keyboard-toggle H events (#83); `L:KLN90B_XTK` (#158),
`L:KLN90B_AlertVolume` (#197), `L:KLN90B_HeadingInput` (#368); ungated `IntegrityWarn` and `GPS_WP_BEARING` (#124);
gated `GPS WP CROSS TRK` and `GPS COURSE TO STEER` (#126); the WT sync gate on the active waypoint (#142), its resync on
switching the output on and its disabled guard (#398); the power-off zeroing of the outputs and the D-bar discharge
(#135); the roll-steering heading-input gate and the no-path rule (#143, #373); the EFB route sync (`KlnEfbLoader`,
`KlnEfbSaver`, `EfbRouteResolver`, `fitEfbRoute`: #195, #187, #188, #353, #378).

## Core 5. Navigation logic

**Flight plan model: our own, deliberately not the SDK FlightPlanner** (`data/flightplan/Flightplan.ts`).

- `Flightplan(idx, legs, bus)` holds `KLNFlightplanLeg {wpt: Facility, type: KLNLegType(USER|SID|STAR|APP),
  parentFacility?, procedureName?: string, flyOver?, fixType?: KLNFixType(IAF|FAF|MAP|MAHP), askObs?, arcData?}`.
  `wpt` and `arcData` are mutable.
- 26 plans: index 0 is the active plan, 1 to 25 are stored. **Every plan, FPL 0 included, holds at most 30 legs, SID,
  STAR and approach legs included.** `insertLeg` throws at 30.
- `services/FlightplanUtils.insertLegIntoFpl`: below 30 legs, or for FPL 1 to 25, plain `insertLeg` (a throw is FPL
  FULL). FPL 0 with 30 legs deletes the leg at index 0, whatever it is, and inserts at `idx - 1`, unless the first leg is
  part of the active leg (C-1). Callers that insert several legs count their own index and do not follow the deletions,
  so from the second deletion on the legs land one slot too far back.
- `getLegs()` returns the **internal mutable array**. Mutations publish **`flightplanChanged`**;
  `startBatchInsert/finishBatchInsert` suppress the intermediate events. Subscribers are `UserFlightplanPersistor` and
  `WTFlightplanSync`. `delete()`, `removeProcedure(type)` and `removeProcedures()` do **not** publish.
- `load()` copies a plan without its procedures and `loadInverted` reverses it (FPL page).
- APT 7 and APT 8 `load`: `startBatchInsert`, `removeProcedure(type)` (a second procedure of a type replaces the first
  without a question), add the airport if it is missing (`Apt7AddPage`/`Apt8AddPage` ask first), then insert each leg
  through `insertLegIntoFpl`. There is no room check before the change: a throw shows FPL FULL and leaves the legs
  already inserted in the plan.
- The FPL 0 page inserts through `EditableFlightplan.insertLeg` → `insertLegIntoFpl`; a full plan deletes from the
  front without asking. `createLeg` copies type, `procedureName` and `parentFacility` from the row in front.

**`ActiveWaypoint`** (`data/flightplan/ActiveWaypoint.ts`, owned by `VolatileMemory.navPage.activeWaypoint`):

- It holds `from: {wpt, path: GeoCircle}`, `to: KLNFlightplanLeg`, `fplIdx` (-1 means a random direct-to or none),
  `isDirectTo` and `turnStack: TurnStackEntry[]`, where an entry is `(path, switchPoint, pathForDtk)`.
- API: `directTo`, `directToFlightplanIndex`, `cancelDirectTo`, `activateFpl0()` (the leg *closest* to the plane),
  `sequenceToNextWaypoint` (keeps the turn stack), `getFutureLegs`/`getDestination` (stop at the MAP),
  `getFollowingLeg`, `recalculatePath`, `clearTurnStack`.
- It publishes **`activeWaypointChanged`** on every `setActiveIdx` and persists the active ICAO (V1) to the
  `activeWaypoint` setting.
- `assertToMatchesFplIdx()` runs on every getter and compares by **instance**. On any mismatch (an insert or delete in
  front of the active leg, a deleted target) it calls `activateFpl0()`: the closest leg again, turn stack cleared, a
  Direct To to a plan waypoint cancelled. A random direct-to is never checked.
- `directTo` with a target in FPL 0 takes `legs[this.fplIdx]` with the index from *before* the call, so a Direct To to a
  plan waypoint other than the active one is replaced by the closest leg on the next getter; `DirectToPage` uses
  `directToFlightplanIndex` when it comes from an FPL 0 row, which avoids it.
- **Gotcha:** `CACHED_CIRCLE` is a module-level shared `GeoCircle` used as `from.path` for great-circle legs. It is
  mutated in place.

**`NavCalculator`** (`data/navdata/NavCalculator.ts`, 1 Hz), in tick order:

1. Self-test: fixed values, `xtkScale = 5`, `setOutput`, return.
2. GPS invalid: `setFlag()` (nulls the values and sets `xtkScale = 5`), `setOutput`, return.
3. The active leg (via the assert); none → `activateFpl0()`; still none → flag.
4. Distance (always direct, even for arcs, 6-18), distance to destination, bearing.
5. A leg without length (FROM equals TO) is sequenced and the tick returns **without** `setOutput`; on the last leg this
   repeats every tick and the outputs freeze.
6. ETE; at GS ≤ 2 it is null and the alert is off.
7. Turn-stack pop: the top (the array end) goes when the distance to its `switchPoint` is within one tick of travel or
   grows.
8. XTK (from the top of the turn stack during a turn, else the leg), DTK (the bearing at the closest point; `bearingForAP`
   equals the DTK on arcs, so the autopilot tracks DME arcs), TO/FROM (`|bearing - dtk| <= 90`). In OBS mode the DTK is
   the OBS course.
9. Sequencing and turns, then `setOutput()`. A new leg shows on the pages one tick after the decision.

Sequencing with turn anticipation (GS > 2, not OBS, `turnAnticipation` on, a following leg, the waypoint not fly-over,
the next waypoint not at the same position):

- r is the turn radius at the standard-rate bank limited to 25° (`bankeAngleForStandardTurn`, `services/KLNNavmath.ts`).
  The lead is r·tan(θ/2), **uncapped**. `distanceToTurn` is the direct distance to the waypoint minus the lead and a
  roll-in distance.
- Waypoint alert: time to turn ≤ 20 s (`WPT_ALERT_WITH_TURN_ANTI`) or a turn on the stack.
- Turn start: the stack is empty and `distanceToTurn` is within one tick of travel, or the alert is on and
  `distanceToTurn` stopped shrinking. If the lead is longer than the distance to the waypoint, it sequences at once
  without a turn (the #84 backport of master's #76). Otherwise it pushes the turn circle (ending at the waypoint offset
  along the next DTK by the lead) and, on top, the rest of the current leg up to the start of the turn. Both carry the
  next leg's path for the DTK, so the DTK switches at the turn start.
- The waypoint sequences when the alert is on and the direct distance to it stops decreasing (roughly abeam). The turn
  stack survives, so the alert stays on until the turn circle pops; no new turn starts while the stack is not empty.
- Without anticipation (or last leg, fly-over, duplicated next waypoint): alert at ETE ≤ 36 s
  (`WPT_ALERT_WITHOUT_TURN_ANTI`), sequence on FROM. The MAP is never sequenced. In OBS mode there is no alert and no
  sequencing.

**`ModeController`** (`services/ModeController.ts`):

- `NavMode {ENR_LEG, ENR_OBS, ARM_LEG, ARM_OBS, APR_LEG}` in `navPage.navmode`; scales 5, 1, 0.3.
- Auto-arm within 30 NM of the approach airport; the scale ramps from 5 to 1 over 30 s. ARM becomes APR when the FAF
  (only a leg with `fixType === FAF`) is active, within 2 NM, the MAP ahead and the track within 110° of FAF to MAP. In
  APR the scale is `dist_to_FAF * 0.35 + 0.3` while the FAF is active, then 0.3. `armApproachPressed` sets the scale at
  once; a disarm inside 30 NM is re-armed by the next tick.
- OBS is a direct-to from a synthetic user facility 1000 NM out on the reciprocal (`setObs`). The OBS course is stored
  **magnetic** in `navPage.obsMag`; `getObsTrue` converts with the VOR's published variation, else the variation at the
  aircraft. `setObs` returns early for an unchanged value. The indicator course is read every tick in OBS modes.
- `switchToEnrLegMode` re-activates the plan and makes a Direct To from the present position to the closest leg's TO
  waypoint (FROM side), or a Direct To from the old from point.

**`RollSteeringController`** (`services/RollSteeringController.ts`): an older Working Title style law on the from leg's
path with the DTK and XTK; 0 below 5 kt or without a from leg; no heading-input gate; writes `GPS COURSE TO STEER`
ungated. In OBS mode and on a GPS flag it is fed null DTK/XTK values.

**`Vnav`** (`services/Vnav.ts`): the Inactive/Armed/Active state machine on the `nav4*` fields of `navPage`, no sim
output. NAV 4 arms it on every tick while its cursor is on ANGLE; editing a field disarms.

**`KLNMagvar`** (`data/navdata/KLNMagvar.ts`): `MagVar.get` between 74°N and 60°S, else `navPage.userMagvar`, which
is set back to 0 on every tick inside the band.

**`SidStar`** (`data/navdata/SidStar.ts`): converts SDK procedures to KLN legs, keeps IAF/FAF/MAP/MAHP and the last
leg and drops step-downs, builds DME arc entries as temporary `XY` waypoints (`ArcData`), names approaches (R/V/N +
runway + suffix), and marks HA/HF/HM/PI legs fly-over with `askObs`. It rejects procedures with RF legs; RNAV approaches
only with the LNAV flag. `mergeAFsIfNecessary` merges any consecutive AF legs. The MAHP comes only from the sim's flag.
MOVE ? exists only on Super NAV 5, which changes `leg.arcData`/`leg.wpt` in place without a publish.

**Alerts**: `AirspaceAlert` searches every 10 s within 100 NM (100 results) for the 10-minute projection only, and is
inhibited in ARM/APR; its ceiling check compares against the floor (`minAlt`). `BoundaryUtils` uses only the vector
ends of `lods[0][0]` (no arcs or circles, no date line). `MSA` reads a 1° grid from `Assets/msa.json`. `AudioGenerator`
plays `kln_short_beep`/`kln_long_beep` when `altitudeAlertEnabled`.

**Not on this line:** 45 legs in FPL 0 with procedures on top (#221); the room question and `roomSteps`
(`MakeRoomPage`, `FplInsertMakeRoomPage`, `ProcedureMakeRoomPage`: #148, #222, #380, #385, #386); the replace pages
(#274); publishing on `removeProcedure(s)` (#347); the new sequencing and turn model (`SequencingGeometry`, capped lead
#404, 175° fly-over #444, off-leg regime and turn plan #157 #438 #439 #443, abeam turn and run-out #406, same-tick
redisplay #407, following-leg reset #408, bisector sequencing and one turn per waypoint #375); following plan edits in
front of the active leg (#440); `onArcEntryMoved` and MOVE ? in FPL 0 (#420, #441, #442, #134, #419); the Direct To
index fix (#68); a zero-length last leg navigated on the previous course (#120); the flag keeping the scale (#159); the
OBS waypoint alert (#147); `WaypointAlert.ts` and the alert constants (#372); `steeringPath` and `RollSteeringLaw`
(#373, #100); the OBS course stored true, its reference variation and `force` (#371, #425, #190); the OBS read-back
epsilon (#122, #261, #427); approach disarm (#139); the APR scale ramp (#163); IAF+FAF fixes (#129); re-activating the
plan leg on LEG mode (#155); VNAV arming once (#418) and an invalid VNAV waypoint (#73); AF merge rules (#131); IAF on
an arc (#382); a hold-derived MAHP (#220); the SUA 2 NM rule (#189), the ceiling check (#127), arcs in boundaries
(#209), duplicate areas (#410) and their power-on reset (#412).

## Core 6. Navdata access

- **Always go through `KLNFacilityLoader`.** It wraps the SDK `FacilityLoader`; `getFacility` checks the repository
  first, nearest sessions for airports, VORs and NDBs merge the repository (negative session ids) with Coherent, and
  `searchByIdent`/`findNearestFacilitiesByIdent` merge repository results. Boundary searches go straight to the SDK.
- **ICAOs are plain 12-character V1 strings everywhere** (SDK 0.8 has no `IcaoValue`). Helpers: `ICAO.getIdent`,
  `ICAO.getFacilityType`, `ICAO.getRegionCode`; `buildIcao(type, region, ident)` and `buildIcaoWithAirport`
  (`data/navdata/IcaoBuilder.ts`); `IcaoFixedLength.getIdent`.
- **`KLNFacilityRepository`**: a singleton with one `GeoKdTree` per type and the sync topic `KLNfacilityrepo_sync`
  (Add, Remove, DumpRequest, DumpResponse, Update). Region `XX` = user waypoint, `XY` = temporary. `addToRepo` throws
  "Repository is full" at 250 (`MAX_USER_WAYPOINTS`). Subscribers: `UserWaypointPersistor` and every scan list.
- `UniqueIdentGenerator`: the first 4 characters plus nothing or `A`-`Z`; null when all are taken.
- Temporary waypoints come from the sim's flight plan, the `.pln` import, SID/STAR arc entries, CTR 1 and REF.
  `TemporaryWaypointDeleter` deletes unused `XY` waypoints on every power event.
- Scan lists (`data/navdata/Scanlist.ts`): a moving window cache with a per-letter index, cancelled by random job ids,
  rebuilt when the repository changes.
- Nearest lists (`data/navdata/NearestList.ts`): 9 items, searched every 10 s within 500 NM; the VOR list takes only
  high and low altitude VORs; the airport filter comes from `nearestAptSurface`/`nearestAptMinRunwayLength`.
- `NearestUtils`: `getNearestVor` (100 NM, high/low/terminal) and `getAirspaces`, which keeps an airspace only if the
  search center is inside it and accumulates results across filters.
- `Database.isAiracCurrent`; `data/FirMap.ts`, `data/CountryMap.ts`; `data/Text.ts convertTextToKLNCharset`.

**Not on this line:** `IcaoValue` and every V2 ICAO helper (#415); `PendingCalls`/`trackFacilityClient` and the scan
list build generation (#416); `NearestVorSearch` and all VOR classes in the nearest list (#204); the 200 NM radius
(#207); `getAirspacesAt` and the airspace query queue (#102); `AirspaceAreas` (#410); sparing the active waypoint in the
temporary-waypoint cleanup (#193).

## Core 7. Persistence

- Settings are saved by `KLN90BSettingSaveManager` (four managers) under `"<ATC MODEL>.profile_1"`.
- **User settings** (`settings/KLN90BUserSettings.ts`): welcome1-4, powercycles, totalTime, timezone, barounit,
  barosetting, lastLatitude, lastLongitude, lastAlmanacDownload, nearestAptSurface, nearestAptMinRunwayLength,
  activeWaypoint, airspaceAlertEnabled, airspaceAlertBuffer, altAlertVolume, htAboveAptEnabled, htAboveAptOffset,
  turnAnticipation, nav5MapOrientation, nav5MapRange, the superNav5* keys, flightTimer, fastGpsAcquisition,
  **enableGlow** (this line only: SET 10 GLOW), and the cal* fields of the CAL pages.
- **User waypoints**: `wpt0`…`wpt249`, every slot rewritten on each Add, Remove or Update. **V1 format only**
  (`settings/UserWaypointPersistor.ts`): characters 0-11 the V1 ICAO, 12-19 latitude, 20-28 longitude (sign, degrees,
  minutes `00.00`, truncated), then by type: APT elevation in **meters** (`+00000`, -1 unknown), runway length in feet
  (`+00000`) and surface `H`/`S`/`-`; VOR frequency (`+000.00`) and magnetic variation (`+00`); NDB frequency
  (`+0000.0`); nothing for INT and USR. A restored airport gets a dummy runway `18-36`.
- **Flight plans**: `fpl0`…`fpl24` hold FPL 1 to 25 (`fpl{idx-1}`), each the concatenated 12-character ICAOs of all its
  legs. **FPL 0 is not stored**; it comes from and goes to the sim's flight plan (Core 4). With `writeGPSSimVars` off,
  a change of FPL 0 falls through to `getSetting("fpl-1")`.
- **Remarks**: `rmk0`…`rmk9` (`RemarksManager`), the ident unpadded plus three 11-character lines.
- A restore failure posts `USER DATA LOST` but does not overwrite the stored data; the next write does.
- **`VolatileMemory`** (`data/VolatileMemory.ts`) holds what pages need across a page change: the waypoint pages'
  `{facility, ident}`, `altPage` (alert on/off, warn 300), `dtPage`, `fplPage`, `navPage` (`NavPageState`: the self-test
  flag, the active waypoint, the nav mode, the nav values, `obsMag`, `xtkScale`, `waypointAlert`, the nav4 VNAV fields,
  `userMagvar`, …), `triPage`, `calPage`, `ctrPage`, `othPage` and `isReady`. **`reset()` runs at every power-on,
  however short the interruption** (`RESET_TIME` is declared but unused): it resets the ALT, DT, TRI (except fuel flow
  and reserve), VNAV, CAL, CTR and OTH state, the nav mode and `userMagvar`, removes the procedures of FPL 0 (without a
  publish), and sets each waypoint page to the first scan-list entry. It keeps `obsMag`, `xtkScale` and the active
  waypoint.
- Data written by the 2.x line (V2 strings, `fpl0` = FPL 0, padded remark idents) does not load here: a V2 airport
  record throws, which empties all waypoints and flight plans. This line must never write V2, and must keep reading V1.

**Not on this line:** the V1/V2 loaders, `SavedWaypoint` and the `userDataFormat` migration (#415); the persisted
TRI/OTH figures and waypoint-page selections (#192); the ALT alert settings (#259); airport elevation in feet (#449,
#450); `rmk10`…`rmk99` and blanking unused slots (#92); dropping a Direct To after a long power-off (#422); the
5-minute `RESET_TIME` rule (6-5); the CTR state (#348).

## Core 8. Aircraft configuration (panel.xml `PlaneHTMLConfig`)

`KLN90BPlaneSettingsParser` finds the `<Instrument>` whose `<Name>` is `KLN90B` and reads dotted paths. The default's
type decides the parse (booleans are `=== 'true'`, numbers `Number(text)`); there is no validation and no error page.
Keys and defaults:

| key                                              | default                                                  |
|--------------------------------------------------|----------------------------------------------------------|
| `TakeHomeMode`                                   | false                                                    |
| `BasePath`                                       | `html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B` |
| `VFROnly`                                        | false                                                    |
| `Input.AltimeterInterfaced`                      | true                                                     |
| `Input.ObsSource`                                | 1                                                        |
| `Input.HeadingInput`                             | false (boolean only)                                     |
| `Input.ElectricitySimVar`                        | "" (always powered)                                      |
| `Input.Airdata.IsInterfaced`                     | false                                                    |
| `Input.Airdata.BaroSource`                       | 0                                                        |
| `Input.FuelComputer.IsInterfaced`                | false                                                    |
| `Input.FuelComputer.Unit`                        | GAL                                                      |
| `Input.FuelComputer.Type`                        | Avgas                                                    |
| `Input.FuelComputer.FOBTransmitted`              | true                                                     |
| `Input.FuelComputer.FuelUsedTransmitted`         | true                                                     |
| `Input.ExternalSwitches.LegObsSwitchInstalled`   | false                                                    |
| `Input.ExternalSwitches.AppArmSwitchInstalled`   | false (parsed, never read)                               |
| `Output.ObsTarget`                               | 0                                                        |
| `Output.AltitudeAlertEnabled`                    | true                                                     |
| `Output.WriteGPSSimVars`                         | true                                                     |

`cfg/panel.xml` is the documented sample. The page tree drops OTH pages without air data or a fuel computer.

**Not on this line:** validation and `PanelXmlErrorPage` (#145); a SimVar name in `Input.HeadingInput` (#405);
`isBaroTransmitted` (#360); `AltitudeAlertEnabled` defaulting to false (#141); the effective map orientation (#368);
pruning APT 8 without an approach arm switch (#133).

## Core 9. Messages, status line and annunciators

- `MessageHandler` (`data/MessageHandler.ts`): `OneTimeMessage` and persistent messages; the 1 Hz tick drops invalid
  messages, adds persistent ones whose condition is true, and resets `seen` when it turns false. There is no `clear()`
  and nothing happens at power-off. `AirspaceAlertMessage`/`InsideAirspaceMessage` are one-time messages that stay while
  their condition holds.
- `buildPersistentMessages` (`data/PersistentMessages.ts`) chooses the course message once, from `obsTarget`:
  `ADJ NAV IND CRS TO xxx°` (forced for 10 s after a DTK change of more than 5°, then while a readable OBS differs by
  more than 5°, never in OBS mode) or the plain adjust-course message. `DatabaseOutOfDateMessage` has no latch.
- **Status line** (`controls/StatusLine.tsx`): the message type is the union **`KLNErrorMessage`** on the topic
  `statusLineMessage`, shown for `STATUS_MESSAGE_TIME = 5000` ms. Status-line messages are not added to the MSG page.
- **Annunciators**: the MSG light is written by the status line in the display tick (self-test on, unread flashing,
  read steady); the WPT light is steady, written in the calc tick from `navPage.waypointAlert`; the annunciator test
  follows `isSelfTestActive`.

**Not on this line:** messages cleared at power-off (#412, #351); single-subscriber time messages (#175); the self-test
gate of ADJ NAV IND CRS (#330) and its later rules (#177, #401, #434, #436); `ScratchpadMessage` and status-line texts on
the MSG page (#237); the flashing WPT light (#437).

## Core 10. Conventions and gotchas

- Event topics: `PowerEvent` (`PowerButton.ts`), `PropsReadyEvent` (`KLN90B.tsx`), `flightplanChanged`,
  `activeWaypointChanged`, `timeUpdatedEvent` (`Gps.ts`), `error` (`controls/ErrorPage.tsx`), `statusLineMessage` and
  `keyboardevent` (`controls/StatusLine.tsx`), `KLNfacilityrepo_sync`, `hEvent`.
- Shared caches mutated in place: `VEC3_CACHE`, `TO_GEOPOINT_CACHE` (`NavCalculator.ts`), `CACHED_CIRCLE`
  (`ActiveWaypoint.ts`), `GEOPOINTCACHE` (`KLNNavmath.ts`).
- Singletons: `KLNFacilityRepository.INSTANCE`, the user waypoint, flight plan and remark setting managers, the
  `"kln90b"` FlightPlanner.
- The error page has "OK and suppress further errors". `error` is published from `TickController` and
  `KLN90B.onInteractionEvent`.
- **Number formatting** uses `format` from the `numerable` package: masks such as `"00"`, `"000"`, `"00.00"`,
  `"000.00"`; a sign needs a `"+00"` mask and `{zeroFormat: "+00"}` so that zero keeps it; coordinates use
  `{rounding: "truncate", signedZero: true}`. Master replaced all of it with `data/NumberFormat.ts` (#447); a backport
  translates back.
- `types/msfstypes/` (gitignored) supplies the MSFS globals for `tsc`; there is no `global.d.ts`.

# Part 2: UI

## UI 0. Mount and startup chain

`PageManager.Init` renders `PageContainer` into `#InstrumentsContainer` and shows `NullPage`. `PageContainer` holds
`#pageContainer`, the hidden `<input class="keyboard">` and `ErrorPage`; `setCurrentPage` destroys the old page and
renders the new one. The `glow` class follows the `enableGlow` setting. The chain after a power-on: `WelcomePage` →
self-test (`FiveSegmentPage(SelfTestLeftPage, SelfTestRightPage)`) → `approve()` → VFR-only → OBS warning (only in OBS)
→ AIRAC page → `pageManager.startMainPage(props)`, which builds `MainPage` with the left and right pages pre-seeded
from `navPage.activeWaypoint.lastactiveWaypoint`.

## UI 1. Page model

- **Interfaces** (`pages/Page.tsx`): `UiElement`, `UIElementChildren` (get/set/walk/getallFlat/getall/forList),
  `NO_CHILDREN`, `Page`, `PageSide`, `PageProps`. They match master.
- **Base classes**: `SixLineHalfPage` and `FiveSegmentPage` (`pages/FiveSegmentPage.tsx`), `SixLinePage` and
  `FourSegmentPage` (`pages/FourSegmentPage.tsx`; ENT goes left control → right control → `page.enter()`),
  `SevenLinePage` (`pages/OneSegmentPage.tsx`, only Super NAV 5), `WaypointPage<T>` (`pages/right/WaypointPage.tsx`,
  with the `ScanHandler`).
- **`MainPage`** (`pages/MainPage.tsx`) keeps a `PageStack` per side, an `OverlayStack` for full-screen pages (MSG,
  Super NAV 1/5, SET 0) and two `PageTreeController`s. Re-rendering only sets flags; the DOM work happens in `tick`.
  Pages leaving a stack are not destroyed.
- **`PageTreeController`** (`pages/PageTreeController.ts`): `movePage` wraps, `moveSubpage` steps through sub-pages
  first, the slot is found with `instanceof`, `createPage = new type(props)`. The trees:
    - `LEFT_PAGE_TREE`: TRI 0-6, MOD 1-2, FPL 0-25, NAV 1, 2, 3, `Nav4LeftPage`, 5, CAL 1-7, STA 1-5, SET 1-10 and
      `Set0DummyPage`, OTH 1-10.
    - `RIGHT_PAGE_TREE`: CTR 1-2, REF, `ActPagePage`, D/T 1-4, NAV 1, 2, 3, `Nav4RightPage`, 5, APT 1-8, VOR, NDB, INT,
      SUP.
  The constructor prunes OTH pages (no air data, no fuel computer) with `splice` **on the shared module-level arrays**,
  so a second construction prunes again. The VFR-only branch removes nothing.
- Naming: `Fpl0Page`…`Fpl25Page` are trivial subclasses; temporary pages (DirectToPage, AltPage,
  DuplicateWaypointPage) have blank names. `Set10Page` is a sub-page wrapper (`Set10BasicPage` with GPS FAST, GLOW and
  IMPORT FPL?, `Set10ImportFplFilePage`, `Set10ImportFplFileErrorPage`); the real unit has no such page.

**Not on this line:** `buildTree` (#90); APT 8 pruning (#133); `replaceLeftBasePage` (#395); `isInRightStack` (#262);
destroying pages that leave a stack (#96); the CLR priority of an open entry in `FiveSegmentPage` (#307).

## UI 2. Input handling

- Event flow: H event → `KLN90B.onInteractionEvent` → `PageManager` → `MainPage.onInteractionEvent`.
- Return values: knob, CLR, CRSR and keyboard handlers return `boolean`; ENT returns `Promise<EnterResult>`
  (`Handled_Move_Focus`, `Handled_Keep_Focus`, `Not_Handled`).
- **`MainPage` dispatch**: keyboard input goes to the overlay's controllers when an overlay is shown, else to the half
  pages. With the cursor off, the knobs move through the page tree only when the base page is shown; on a pushed page
  they do nothing (no pop-and-redispatch), and on the MSG page they do nothing. CRSR toggles the side's cursor. CLR is
  `left.clear() || right.clear()`. MSG pushes `MessagePage` (or calls `msg()`), DCT pushes `DirectToPage` (or calls
  `directToPressed()`), ALT toggles `AltPage`, APPR ARM calls `modeController.armApproachPressed()`.
- **`CursorController`** (`pages/CursorController.ts`): fields are found depth-first in declaration order with
  `getallFlat().filter(isField && !isReadonly)`, where `isField` is `"isReadonly" in el`. The outer knob wraps from the
  last field to the first. ENT advances the cursor for every result except `Handled_Keep_Focus`, `Not_Handled`
  included. The cursor remembers its last field.
- **Keyboard mode**: a left click on the CRSR text of a side (cursor on, status line shown) focuses the hidden input;
  a right click, blur, cursor off or power event leaves it. `KLN90B.handleKeyboardEvent` maps Home/End (outer),
  PgUp/PgDn (inner), Enter, Delete (CLR), Backspace, letters and digits. Esc does not leave it.

**Not on this line:** pop-and-redispatch on pushed pages and the overlay knob rules (#56, #333, #336); the overlay
right cursor (#394); `cursorPressed` (#385); ENT pass-through (#262); the open-entry CLR priority (#307, #359, #383);
closing the MSG page on DCT/ALT (#335); the ALT field check (#399); keeping the cursor on `Not_Handled` (#354);
stopping at the page ends (#218); the start-field rules (#355); dropping a refused DEL question (#317).

## UI 3. Controls and rendering

- **Rendering**: text in `<pre>` with the custom font, inverse video through `Inverted`, flashing through `Blink` (every
  4th display tick). Glyphs are mapped onto spare code points (for example `Ш` super deviation bar, `η` deviation bar,
  `Æ` procedure marker, `Ê`/`Ó` Super NAV 5, `À`/`Á`/`Â` flight plan arrows). `data/Constants.ts` matches
  `KLN90B.scss`.
- **Tick discipline**: `PageContainer.tick` walks the children; pages that redraw set `requiresRedraw` in `tick`;
  `checkRef` guards DOM access. Some pages (OTH 3, OTH 4, Welcome) subscribe without keeping the subscription.
- **Controls** (`controls/`): displays (null renders as dashes; `SpeedDisplay` clamps to 0-999), `Editor<T>` with
  `convertFromValue`/`convertToValue`/`onCharChanged` (null gives INVALID ENT), editor fields, `SelectField`, the
  fieldsets, `WaypointSelector` and its subclasses, `Button(text, enter, clear?)`, `List` and the flight plan lists.
  **The first inner turn of every editor only enters it**; the outer knob wraps between characters.
- **Field declaration**: as on master (`pages/left/Set3Page.tsx`); numbers are formatted with `numerable`.
- **Canvas** (`controls/Canvas.tsx`): Bresenham lines, labels placed in 9 positions, used by NAV 5, Super NAV 5 and the
  APT 3 map. Map ranges are inline arrays in `Nav5Page`, `SuperNav5Page` and `SuperNav5RangeSelector`.

**Not on this line:** `CdiScaleField` (MOD 1/2 use a plain `SelectField`); `SelectField.displayOverride` (#257);
`FirstIdentEditorField`/`FirstCellSelectField` (#374); per-editor first-turn rules (#311); keeping blank ident cells
(#343); the flight plan arrow's nav flag check (#322); `data/MapRanges.ts` (#236).

## UI 4. Status line, messages, ENT confirmation, adding pages

- **StatusLine**: mode text, CRSR/KYBD indication, the ent → message → plain message order, the SET 0 special case. It
  also drives the MSG light.
- **MessagePage**: a `SixLinePage`, newest first, six lines per page; all messages are marked seen when it is built;
  ENT goes to APT 1 of the nearest airport.
- **Waypoint ENT confirmation** (`controls/editors/WaypointEditor.tsx`), Promise-based: ENT searches
  `findNearestFacilitiesByIdent` for exact matches (none: NO SUCH WPT; several: `DuplicateWaypointPage` resolves the
  pick), then `WaypointConfirmPage.showWaypointconfirmation` pushes the waypoint page on the right and the editor
  `await`s it; the confirm page's ENT pops itself and resolves. Turning the inner knob or typing cancels and pops the
  page. CLR blanks the field.
- **Dynamic lists**: `forList` → `listParent.refresh` → `cursorController.refreshChildren` → `focusIndex`; a refresh
  scrolls back to the top; FPL 0 keeps the active leg in view.
- **Adding a page**: as on master's recipe, except that the tree pruning acts on the shared arrays and all page state
  goes into `VolatileMemory`.

**Not on this line:** status-line texts on the MSG page (#237); the WPT light rule (#437); creating an unknown ident
from the confirmation (#262); `callingEditor`/`currentValueConfirmed` (#284); CLR on a right-side editor (#359); the REF
approval CLR (#291); `clearBlanks` (#244); keeping the scroll over a rebuild (#319); the procedure header rule (#239).

## UI 5. Styling (`KLN90B.scss`)

The variables, the screen arithmetic (860×388), the `@font-face` URLs (`./Assets/...`), `#InstrumentsContainer`,
`.glow`, the layout classes, `.keyboard` and `.inverted`/`.inverted-blink`/`.blink` match master. Only here: `.noGlow`
(Super NAV 5 right) and the runtime GLOW toggle. Not here: `.panelxmlerrorpage`, the black `kln-90b` background, the
split `super-nav5-right-controls-parent` class.

## UI 6. Conventions and gotchas

- Pages reach each other through `instanceof` (D/T 1 ↔ FPL, `DirectToPage` reads `Fpl0Page.getSelectedWaypoint` and
  `SuperNav5Page.getDirectToTarget`, the flight plan list opens APT 7/8).
- Read-only fields are hidden with `d-none`; `Button.setVisible` sets both visibility and `isReadonly`.
- Sub-page wrappers replace `children` and `cursorController` (D/T 1, APT 3, ACT, the waypoint confirm page, SET 10).
- Thrown errors are shown on the error page.
- Airport names are abbreviated inline in `Apt1Page.formatAirportName` (master: `data/AirportNameFormatter.ts`).
