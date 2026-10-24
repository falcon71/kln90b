# KLN 90B architecture reference

Detailed companion to [CLAUDE.md](../CLAUDE.md). It covers the big-picture wiring that takes many files to see.
All paths are relative to the repo root and the code lives under `kln90b/`. It describes the code as of v2.2.0
(commit `456356d`); check the code when this document and the code disagree, and update this document.
Automated tests are described in [test/README.md](../test/README.md).

- Part 1, **Core**: boot, tick loops, sensors/GPS, sim outputs, navigation, navdata, persistence, configuration,
  messages.
- Part 2, **UI**: pages, page trees, input routing, controls, rendering, styling.

Comments such as `3-29` in the code are page numbers in the KLN 90B Pilot's Guide (006-08773-0000), the "manual".

# Part 1: Core

## Core 0. Debug hooks and branches

- Debug hooks:
    - `KLN90PlaneSettings.debugMode` is hard-coded to `false` in `KLN90BPlaneSettingsParser`; set it to true by hand. It
      skips the test pages, gives instant brightness and makes `AudioGenerator` show `BEEP: n` on the status line.
    - A `loggingEnabled = false` flag exists in `Scanlist.ts`.
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
tests create `KLN90BCore` directly with a `FakePlatform` (test/README.md), which is the reason the split exists. The
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
3. `pageManager.Init(bus, userSettings)` creates the `PageContainer` and shows the `NullPage`. If the parser recorded
   invalid panel.xml values, they are published now as `panelXmlErrors`, because the page that shows them did not
   exist before. It then constructs `BrightnessManager` and `PowerSupply`.
   From here on, the WelcomePage can be shown while everything else initialises.
4. Constructs `AudioGenerator`, then `Sensors` (which builds `GPS` and the `KLNGPSSatComputer`), then calls
   `hEventPublisher.startPublish()`.
   If `forceReadyToUse` is set, it calls `powerSupply.forceReadyToUse()`.
5. Navdata: it asks the platform for the facility repository (`KLNFacilityRepository.getRepository(bus)`, a singleton)
   and the facility client (in the sim `new FacilityLoader(FacilityRepository.getRepository(bus))`), builds
   `KLNFacilityLoader(client, klnRepo)` from them, then `Scanlists`.
6. Persistence:
    - `UserWaypointPersistor.restoreWaypoints()`.
    - `UserFlightplanPersistor.restoreAllFlightplan()`, which returns 26 `Flightplan`s (index 0 to 25). On failure it
      creates empty plans and sets `restoreSuccessFull=false`, which later produces the `USER DATA LOST` message.
    - The last active waypoint is loaded from the `activeWaypoint` setting. **That setting is saved as an ICAO V2
      string** (`ICAO.valueToStringV2`; V1 cannot hold an airport of more than four characters, #415). The read accepts
      both: a V1 string of an older version (12 characters) is parsed as V1, anything else as V2. A stored V1 value is
      not rewritten at boot; it becomes V2 the next time the active waypoint is saved.
    - If `userDataFormat !== 2`, or when a restore failed, it re-persists everything in the V2 format and sets
      `userDataFormat=2` (see Core 7).
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
`PowerSupply` and `WelcomePage` start with a reduced `WelcomePageProps` and swap in the full props when `propsReady`
arrives.

**Power** (`PowerSupply.ts`):

- State is `powerSwitchOn` (the knob, mirrored to `L:KLN90B_Power`) AND `electricityAvailable`. `SimVarSync` sets
  `electricityAvailable` every 100 ms from `Input.ElectricitySimVar`; if that option is empty, power is always
  available.
- **Ride-through** (#332): a loss of `electricityAvailable` while the unit is powered is carried by the unit's battery
  module for `RIDE_THROUGH_TIME` (1.5 s, maintenance manual PDF 53, 54, 79, 107). Nothing changes meanwhile: no page, no
  `powerEvent`, no `powercycles` increment, and the power coming back ends it. When it runs out the loss applies as an
  ordinary power-off, so the `powerEvent` and its off time follow the actual power change, not the loss. The first
  reading, a loss while the knob is off and the knob itself act at once; turning the knob off during a ride-through
  ends it. `GPS OVERRIDDEN` stays claimed through it, because the running unit's `NavCalculator` claims it at 1 Hz.
- On a power-on edge, `PowerSupply` increments the `powercycles` setting, calls
  `pageManager.setCurrentPage(WelcomePage, props)` and publishes **`powerEvent {isPowered, timeSincePowerChange}`**.
- On a power-off edge, it shows the `NullPage` and publishes the same event.
- `lastPowerChangeTime` starts one hour in the past, so the unit is assumed to have been off for one hour.
- Subscribers to `powerEvent`:
    - `TickController` starts and stops its loops.
    - `BrightnessManager` simulates CRT warm-up from the off time: `TIME_UNTIL_COLD` / `TIME_TO_WARM`, then a ramp.
    - `Sensors.reset()`, which saves the position and resets the sat computer.
    - `GPS.powerChanged`, which advances the internal clock by the off time it measures itself in sim time
      (`E:ABSOLUTE TIME` at construction or the last power-off, `lastPowerOffTime`), not by `timeSincePowerChange`: that
      value is shaped for the CRT warm-up and is about 0 on a forced start (#328). The clock follows the sim's world
      time, as the satellites do, so a sim pause before the power-on does not put it off. At power-on it then starts
      the start model (`search.start`, Core 3); at power-off it ends it.
    - `VolatileMemory.reset()`, which runs on power-on only (see Core 7).
    - `TemporaryWaypointDeleter`.
- Welcome and self-test flow (lives in pages, summarised here for wiring): `WelcomePage.tick` waits `TEST_TIME=17000`
  ms, a free cursor and `memory.isReady`. It then goes to:
    - `FiveSegmentPage(SelfTestLeftPage, SelfTestRightPage)` normally. `SelfTestLeftPage` sets
      `navPage.isSelfTestActive = true` and `SelfTestRightPage` clears it at the approval, where it also sets
      `navPage.isSelfTestApproved`.
    - `TakehomePage` if `takeHomeMode` is set.
    - `pageManager.startMainPage(props)` directly if `forceReadyToUse` is set. This also calls
      `gpsSatComputer.acquireAndUseSatellites()` and sets `navPage.isSelfTestApproved` (a skipped self-test counts as
      approved).
- `navPage.isSelfTestApproved` is false from every power-on (`VolatileMemory.reset`) until then. Unlike
  `isSelfTestActive` it also covers the Turn-On page; ADJ NAV IND CRS is not evaluated before it (#330).
- While `isSelfTestActive` is set:
    - `NavCalculator` outputs fixed test values (XTK -2.5, DIS 34.5, DTK 315 mag, FROM, waypoint alert on).
    - `RollSteeringController` sweeps 0 to -5 degrees of bank, but only with a heading input (without one the roll
      command stays 0, 2-69, #143).
    - `SensorsOut.setMode` writes `GPS APPROACH MODE = 3` and `L:KLN90B_AnnunTest = true`, so external annunciators
      light up.

**Hot-swap disable**: the 100 ms poll of `SimVarSync` is the only reader of `L:KLN90B_Disabled`. `setDisabled` keeps
the state in `Hardware.isDisabled` (a unit taken out of the aircraft, not one switched off; its doc comment lists what a
disabled unit does), calls `tickController.setEnabled(false)` and `pageManager.resetKeyboard()`, and if
`writeGPSSimVars` is set it releases `GPS OVERRIDDEN` on the disable and claims it again on the resume. While
disabled nothing claims it, since `SensorsOut.reset()` skips its claim on a power change then (#350). The gates read
`Hardware.isDisabled`, never the LVar, so they lag it by at most one poll.

**Input routing**: the sim delivers H events as `BaseInstrument.onInteractionEvent(args)`.

- `KLN90B.onInteractionEvent` calls `super` and passes the event to `KLN90BCore.onInteractionEvent`. While
  `Hardware.isDisabled` is set it drops every event, the power and brightness events included (#138), so the power of a
  disabled unit follows only the electricity SimVar. Otherwise it handles the SCAN pull state (`Hardware.isScanPulled`,
  mirrored to `L:KLN90B_RightScan`).
  While SCAN is pulled, it remaps right-inner turns to the internal `EVT_R_SCAN_LEFT/RIGHT`.
- It then calls `hEventPublisher.dispatchHEvent([evt])`, which puts the event on the bus `hEvent` topic. `PowerSupply`
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
  its calculations at 1 Hz (from a video). The 16 Hz loop emulates the analog D-bar driver through
  `services/SignalOutputFilter`: the PWM deviation, clamped to two full scales, through the RC low-pass of the main
  module (51.1 kΩ × 4.7 µF, τ = 0.24 s; the class doc has the reading of the schematic). It filters the deviation in
  full scales and gives it back on the current scale, so it never overshoots and a scale change moves the needle
  smoothly (#158).
- **Hard rule from the class doc: DOM manipulation happens only inside a display tick, never directly in a state change
  or input handler.** Handlers mutate state and the next `tick(blink)` renders it.
- Each tickable is wrapped in try/catch, which logs the error and publishes `error`. **Async ticks** (`NearestList.tick`
  is `async`) are not awaited, but `tickCalc` attaches the same handler to the returned promise (#95), so their
  rejections reach the error page too. `NearestList` clears `isCalculating` in a `finally`, so a failed search does not
  stop the later ones.
- Expensive work throttles itself inside the 1 Hz tick: `NearestList` and `AirspaceAlert` search every 10 s (
  `NEAREST_TICK_TIME`, `ALERT_TICK_TIME`); `GPS` and `Timers` save every 60 s.
- Separate intervals: `SimVarSync` runs every 100 ms and always runs, even when powered off. `BrightnessManager` uses
  `Wait.awaitDelay` loops.
- Many quantities are integrated as `x += TICK_TIME_CALC/1000`: the flight timer, GPS time in take-home mode and the XTK
  scale ramp. They assume the interval really fires at 1 Hz, so sim-rate or pause effects are not modelled.

## Core 3. Sensors and GPS simulation

`Sensors` (`kln90b/Sensors.ts`) has `in: SensorsIn` (tick 1 Hz) and `out: SensorsOut` (writers). On `powerEvent` it
calls `in.reset()` and `out.reset()`, and on a power-off also `out.setPoweredOff()`.

`SensorsIn.tick()` reads:

- `GPS DRIVES NAV1`. When it is true, it reads `Nav OBS:{1|2}` according to `Input.ObsSource`. When it is false,
  `obsMag = null` ("the manual implies" OBS can only be read when the GPS is the nav source).
- `input.headingSimVar` while `input.headingInput` is set (`Input.HeadingInput` or `L:KLN90B_HeadingInput`), null
  otherwise (#368). It is `PLANE HEADING DEGREES GYRO` for `Input.HeadingInput` true, or the SimVar an aircraft with
  its own gyro names in the key instead (#405); the LVar switches the input but keeps the SimVar.
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
error or noise and no RAIM ("We have pretty all messages except for failures and RAIM problems"). STA 5 predicts
the satellite geometry at the destination and ETA with `gps.raimPrediction`, a long-lived SDK prediction context of the
main computer; RAIM failures are still not modeled.

- It wraps the SDK `GPSSatComputer` in `KLNGPSSatComputer` (`// @ts-ignore extends`). That class keeps every reach
  into **private SDK internals through `as any`**, so it may break on SDK upgrades:
    - `activeSimulationContext.channels` (STA 1). Since SDK 2.3.3 the receiver's time, position and last known position
      live in `activeSimulationContext` too; the unit no longer reads them (#211, replaced by the start model).
    - `lastAlamanacTime` (`getLastAlmanacTime()`, for the start model and the saved `lastAlmanacDownload`).
    - `satelliteTimingOptions` (`setAcquisitionTime()` and `setAcquisitionTimeWithEphemeris()`: the object is shared
      by all satellites, so the start model sets the acquisition times per power-on). Both throw if the SDK moves it.
    - The satellites' `data.lastEphemerisTime` (`restoreEphemeris()`, the persisted ephemeris; read back through the
      public `lastEphemerisTime` getter).
    - The SDK's `simTime` and `distanceFromLastKnownPos` are no longer read.
- **The start model** (`kln90b/GpsSearch.ts`, #62): what the unit believes decides how it searches. `GPS.powerChanged`
  calls `search.start(coords)` at power-on; on the next tick, once its prediction context is ready, it picks a mode
  from the stored position, the almanac age and the unit's own clock (`internalTime`). `GPS.tick` calls `search.tick()`
  before every `onUpdate()`, so inhibits and timings apply before the channel assignment.
    - **The clock is compared modulo the era**: the receiver keeps GPS time as the week modulo 1024 and the time of
      week, so `receiverTimeDifference` wraps every comparison of the unit's clock (almanac age, 10-minute tolerance)
      into ±512 weeks. The SDK's orbit propagation reduces the time to the week itself, so the prediction needs no
      mapping. A date that is off by whole eras, as after the rollover of #63, therefore still starts hot or warm.
    - **Acquisition (ACQ)**: the almanac is less than six months old by the unit's clock. A prediction context, set to
      the stored position and the unit's clock, gives the satellites the unit believes are up (5° mask, 5-30); every
      other satellite is inhibited. With the clock more than 10 minutes off (install manual 2-66) nothing may be
      acquired. A random acquisition time drawn per power-on (`WARM_ACQUISITION_MIN` to `_MAX`, 2 to 75 s) spreads the
      warm starts.
    - **Sky search**: ACQ has no fix after `GIVE_UP_TIME` (5 min, install manual 2-66). Inhibits are lifted, the last
      known position is erased and the almanac check reports invalid, so the SDK runs its blind search in PRN order
      (`BLIND_ACQUISITION`, 90 ± 30 s per satellite).
    - **Almanac search**: the almanac is six months old or more by the unit's clock, which also covers a clock that is
      years off (ORS 01 6-30). Blind search until one satellite is acquired (`ALMANAC_SEARCH_ACQUISITION`, 390 ± 60 s,
      calibrated so that the whole search lands near ORS 01's 20 minutes and the observed 21:36); all others are then
      inhibited while the SDK collects the almanac from it (12.5 min). Then ACQ with the right time. If the kept
      satellite is lost first, the inhibits are lifted and the blind search resumes.
    - **Idle**: the first fix (`gpsAcquired`), a forced acquisition (`acquireAndUseSatellites`: engine-running start,
      SET 10 FAST) and power-off end the model: inhibits are lifted and the acquisition time returns to
      `IDLE_ACQUISITION` (40 s). With `fastGpsAcquisition` the model never starts, nor in a session whose computer
      was built FAST (the SDK timings are fixed at construction).
    - `KLNGPSSatComputer.isAlmanacValid` reports the decision: ACQ true, almanac and sky search false, Idle the SDK's
      own check.
    - **Corrections during a search** (3-5, 3-17..3-19, #357). The Pilot's Guide gives the entry of the date and time
      or of the position as the remedy for a slow start. `GPS.reinitializeSearch()` copies the clock into
      `gpsSatComputer.internalTime` and calls `search.start(coords)` again, so the decision is made anew from the
      corrected values on the next tick. It is called by `SelfTestRightPage` (`saveDate`, `saveTime`), `Set2Page`
      (`saveDate`, `saveTime`) and `Set1Page.confirmPosition`, after the page has written the value. It does nothing
      with a fix (the satellites supply both) and in take-home. FAST has no start model, so only the SDK's last known
      position moves there (`Set1Page` still calls `syncLastKnownPosition`). The model restarts at once: whether the
      real unit restarts at once or at its next search cycle is not documented.
    - **STA 1** (`Sta1Page`, #213) shows what the unit knows, not the true sky. During ACQ without a fix it lists
      `search.predictedSatellites()` with the predicted elevation, constant through the acquisition. Otherwise it lists
      the channels; the elevation is the true one with a fix or once the satellite's orbit data is current
      (`GPS.simTimeUnix`), else `--`. A satellite below the horizon has no elevation and shows `--`.
    - Public SDK API used: `createPredictionContext`, `setSatelliteInhibit`, `syncLastKnownPosition` (the stored
      position within 100 NM of the present one, so the SDK's 2 NM hot-start rule works on it; else the present
      position), `eraseLastKnownPosition`, `eraseCachedEphemeris` (the harness's `coldGps`).
    - Beyond 100 NM the SDK's last known position is the present one, so its 2 NM rule would make every satellite with
      a current ephemeris hot. For that power-on the model sets the acquisition time with ephemeris to the warm draw
      (`setAcquisitionTimeWithEphemeris`), and `end()` puts back `HOT_ACQUISITION`: a start far from the stored
      position is warm, as one 50 NM away is.
- The computer has 8 channels and is driven manually: the computer reads the sim time and position SimVars itself, and
  `GPS.tick` calls `onUpdate()`. Sync role is `'none'`. SBAS is disabled by the emptied `gps_sbas.json`. Timing (#62):
  ephemeris download 30 s (one data frame) and expiry 2 h, acquisition with a current ephemeris 9 ± 3 s (a hot start
  has its fix before the 17 s self-test ends), almanac download 12.5 min, almanac expiry six months (3-17), timeout
  4 min. With `fastGpsAcquisition` all of these drop to about 1 to 10 s.
- `isValid()` is true one calculation tick after the receiver's first solution (`systemState` is `SolutionAcquired` or
  `DiffSolutionAcquired`), and stays true while that holds. The tick in between is TRAN (`isTransition()`, 5-29, #215).
  A forced acquisition (engine-running start, SET 10 FAST) is accepted at once, without TRAN
  (`acceptForcedSolution`, called by `KLNGPSSatComputer.acquireAndUseSatellites`). `gpsAcquired()` runs on acceptance.
  There is a TODO: 3-satellite plus altitude aiding is not modeled.
- **STA 1 state line** (`Sta1Page.stateText`, #215): NAV D, NAV A (whenever there is an altitude) or NAV when valid;
  TRAN in the transition tick; ACQ during the start model's acquisition, even when nothing can be acquired; INIT during
  the almanac and sky searches and before the first channel assignment.
- When valid, `coords` come from `PLANE LATITUDE/LONGITUDE` and `groundspeed` from `GROUND VELOCITY`.
    - `trackTrue` is the bearing between successive 1 Hz fixes, computed only when GS >= 2 kt (
      `MIN_GROUND_SPEED_FOR_TRACK`, 3-35). `getTrackTrueRespectingGroundspeed()` returns null below that.
    - When invalid, the last values are frozen (4-13).
- Last position, almanac time and ephemeris persist in the settings `lastLatitude`, `lastLongitude`,
  `lastAlmanacDownload` and `lastEphemeris` (`"prn:time,prn:time"`, restored into the SDK satellites at boot, so a new
  session within the 2 h of the ephemeris is a hot start).
- `gpsAcquired()` can post `POSITION DIFFERS FROM LAST POSITION BY >2NM`. If the time error is over 10 minutes it posts
  `SYSTEM TIME UPDATED TO GPS TIME` and publishes **`timeUpdatedEvent`** (SET 2 publishes it too; nothing subscribes
  since #175). The AIRAC-expired message is the persistent `DatabaseOutOfDateMessage` alone (Core 9).
- Internal clock `timeZulu` (`data/Time.ts TimeStamp`):
    - At construction it is set from `E:ABSOLUTE TIME` plus a random ±2.5 s. No hour is subtracted, and the hour
      `PowerSupply` assumes for the CRT warm-up is not used.
    - While the unit is off it runs on in sim time: at power-on the `E:ABSOLUTE TIME` elapsed since construction or the
      last power-off is added (#328). A sim pause has no real-world counterpart, so wall-clock time would put the clock
      off by the length of the pause.
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
        - `L:KLN90B_IntegrityWarn` (#87): true when the GPS is not valid.
        - `L:KLN90B_XTK` (#158): the ARINC 429 label 116 cross track in NM, positive = fly left, 0 without an
          active waypoint. Not smoothed, unlike `GPS WP CROSS TRK`.
        - `L:KLN90B_MsgLight`, `L:KLN90B_WptLight`, `L:KLN90B_AnnunTest`.
        - `L:KLN90B_AlertVolume` (#197): the SET 9 alert volume, 0 to 99, written by `AudioGenerator` at boot and on
          every change of `altAlertVolume`.
    - Writable by aircraft:
        - `L:KLN90B_Brightness` (0 to 1)
        - `L:KLN90B_Disabled` (hot swap)
        - `L:KLN90B_ObsSource`, `L:KLN90B_ObsTarget`, `L:KLN90B_HeadingInput`, `L:KLN90B_ElectricitySimVarIndex`,
          `L:KLN90B_WriteGpsSimvars`.
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
    - `GPS COURSE TO STEER` (radians; "real KLN does not have this"; `setRollCommand` writes the roll command LVar
      regardless; the course is 0 without a heading input, and without a path, #143)
    - `GPS MAGVAR`, `GPS POSITION LAT/LON`, `GPS GROUND SPEED`, `GPS GROUND TRUE/MAGNETIC TRACK`
    - `GPS FLIGHT PLAN WP COUNT/INDEX`, `GPS WP NEXT/PREV ID/LAT/LON`, `GPS WP PREV VALID`
    - `GPS IS APPROACH ACTIVE`, `GPS APPROACH MODE` (0 = ENR, 1 = ARM, 2 = APR, 3 = self-test)
    - Vertical outputs are forced to 0 (`GPS GSI SCALING`, `GPS HAS GLIDEPATH=false`, ...) because the KLN has no
      vertical guidance.
- `GPS WP CROSS TRK` is written at 16 Hz from the filter by `setFilteredOutputs`, which has the `writeGPSSimVars` check
  of its own: the filter is fed only through the gated `setXTK`.
- The OBS mode is set through key events `K:GPS_OBS_ON/OFF`, because the `GPS OBS ACTIVE` SimVar is effectively
  read-only. This happens only when **no** external LEG/OBS switch is installed. With a switch installed, `SimVarSync`
  *reads* `GPS OBS ACTIVE` and calls `modeController.setExternalObsMode`.
- **Not gated** by `writeGPSSimVars`:
    - All KLN LVars, `K:VOR{1,2}_SET` (when `obsTarget` is set and the GPS drives NAV1).
    - Annunciators: `setMessageLight` (called from `controls/StatusLine.tsx` in the display tick, flashing while there
      are unread messages) and `setWptAlertLight` / `setAnnunTest` (from NavCalculator).
- Other outputs:
    - `WTFlightplanSync` mirrors FPL 0 into an SDK `FlightPlanner` with id `"kln90b"` (`initSyncRole:'primary'`): plan 0
      is DF legs and plan 1 is a direct-to plan "like the Garmins". Data stops after the MAP or an arc ("Install manual:
      We do not return data after a fence"). This happens only when `writeGPSSimVars` is set, and `SimVarSync` calls `WTFlightplanSync.sync()` once when
      `L:KLN90B_WriteGpsSimvars` switches it on at runtime. While `Hardware.isDisabled` is set nothing is written,
      whatever asks for the sync, and `SimVarSync.setDisabled` syncs once on the resume (#398).
    - `KlnEfbSaver` answers EFB `avionicsRouteRequested` (only with `writeGPSSimVars` set); `KlnEfbLoader` loads
      `syncedAvionicsRoute` into FPL 0 (lat/lon legs become temporary user waypoints in region `XY`, except a leg whose
      `fixIcao` names, by region and ident, a user or temporary waypoint the unit holds: the saver sends those as lat/lon
      legs of type U, and they come back as themselves with the stored position, #187). While
      `Hardware.isDisabled` is set the request goes unanswered (#353) and the synced route is dropped (#188).
- The ticks that write the L:KLN90B_* outputs stop with the power, so `SensorsOut.setPoweredOff()` writes their zero
  state once on a power-off: `L:KLN90B_RollCommand` 0, `L:KLN90B_HSI_TF_FLAGS` 0 (flagged) and the MSG, WPT and annunciator
  test lights false, `L:KLN90B_IntegrityWarn` 0, `L:KLN90B_GPS_WP_BEARING` 0 and `L:KLN90B_XTK` 0, whatever `writeGPSSimVars` says. It also discharges the D-bar filter, so `GPS WP CROSS TRK` starts from 0 after the next power-on. A unit that is only disabled for hot swapping keeps its values, but a power-off while disabled zeroes them too.
- `SensorsOut.reset()` has the SimVar-zeroing code commented out because of an observed **CTD** when combined with
  `L:KLN90B_Disabled` and hot-swapping. Read that comment before touching GPS SimVar resets.

## Core 5. Navigation logic

**Flight plan model: our own, deliberately not the SDK FlightPlanner.** `data/flightplan/Flightplan.ts` says "the KLN
Flightplan really is dead simple".

- `Flightplan(idx, legs, bus)` holds
  `KLNFlightplanLeg {wpt: Facility, type: KLNLegType(USER|SID|STAR|APP), parentFacility?, procedure?: ProcedureInformation, flyOver?, fixType?: KLNFixType(IAF|FAF|MAP|MAHP), askObs?, arcData?: ArcData}`.
- There are 26 plans: index 0 is the active plan and 1 to 25 are stored. Each numbered plan holds 30 legs. FPL 0 holds
  30 en-route legs (type USER) and 45 legs in total, because SID, STAR and approach legs come on top of the en-route
  limit (#221, `legsFit`, `Flightplan.fits`); `insertLeg` throws past them. Use
  `services/FlightplanUtils.insertLegIntoFpl`, which deletes from the front of a full FPL 0 as `roomSteps` says (#148):
  one waypoint per step, an airport with the SID legs behind it, never a leg of the active leg (C-1). The insert index
  follows the deleted legs.
- The procedure loads of APT 7 and APT 8 (`load`) decide the room before they change FPL 0 (#222): `roomSteps` over the
  legs without the procedure being replaced, with the airport the load adds as en-route and the procedure legs on top.
  No room is FPL FULL with FPL 0 unchanged. When waypoints must go, `pages/left/ProcedureMakeRoomPage` (a subclass of
  the abstract `MakeRoomPage`) asks on the left once per waypoint; ENT on the last question deletes them and loads,
  CLR or CRSR cancels (#385). A load is one batch with one `flightplanChanged`, inserting with plain `insertLeg`.
- An insert on the FPL 0 page asks before it makes room (#380). The inner-knob click, typed key or ENT (3-15, only
  when it takes the waypoint of the right page) that would open an insert row or the entry of the blank position first
  calls `EditableFlightplan.askRoom` through the row (`FlightplanListItem` prop `askRoom`). The added leg is a SID or
  STAR leg in front of such a row (as `createLeg` copies the type), else en-route. When `roomSteps` says waypoints must
  go, `pages/left/FplInsertMakeRoomPage` (a second subclass of `MakeRoomPage`) asks on the left; ENT deletes one step,
  rebuilds the list with the cursor on the row the insert goes in front of (the new first waypoint when that one was
  deleted, #148) and repeats the action through the cursor controller, which asks again or opens the entry. A row not
  in the plan yet that asked (the en-route row an inner click on a procedure header creates, or the empty row of an
  ENT) is made again there as it was, so a header's row stays an en-route leg in front of the procedure. A row copied
  from a SID or STAR row is made again as an en-route row when that procedure went with the deleted legs (#386; an
  airport deleted from the front takes its SID, #148), as an insert in front of the new first waypoint is. CLR or CRSR
  cancels: the list is rebuilt with FPL 0 unchanged. The cursor stays on under the question and the rebuilt list keeps
  its index, so it stays on the waypoint, header or blank end where the insert was tried (checked in the KLN 89 trainer,
  2026-10-23, #385). When room cannot be made (C-1) nothing is asked: the entry opens and its ENT answers FPL FULL.
  The REF and CTR inserts keep the silent deletion of `insertLegIntoFpl`.
- Before `load` runs, `loadIfFplContainsApt` of APT 7 and APT 8 chooses the question (#274). A procedure of the type being
  loaded in FPL 0 (any approach for APT 8, a SID for a SID, a STAR for a STAR; also the same one) shows the replace page
  (`Apt8ReplacePage`, `Apt7ReplacePage`: `PRESS ENT TO REPLACE EXISTING APPROACH/SID/STAR`, a flashing `APPROVE?`). It
  is the only question: it also stands in for the question to add the airport, which `load` then adds. Otherwise a
  missing airport asks to add it (`Apt8AddPage`, `Apt7AddPage`). APPROVE? calls `load`, so the room check follows; CLR
  goes back to the waypoint preview with the cursor on LOAD IN FPL.
- Mutations publish **`flightplanChanged`**. `startBatchInsert/finishBatchInsert` suppress the intermediate events ("
  Would mess up the async asobo FPL sync"). Subscribers are `UserFlightplanPersistor` (persists every change) and
  `WTFlightplanSync`.
- `getLegs()` returns the **internal mutable array**.
- `removeProcedures()` keeps only USER legs, and `removeProcedure(type)` drops one kind. Both publish
  `flightplanChanged` when they removed a leg, so the planner mirror follows FPL 0 (#347). Procedures are never
  persisted.
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
  `isDirectTo` and `turnStack: TurnStackEntry[]`. `ownTurnStarted` (the active waypoint's own turn was pushed) and
  `turnPlan` (`TurnPlan.AT_LEAD`/`AT_ABEAM`, the decided turn start) belong to the active waypoint: they are cleared when
  the active index changes, by `clearTurnStack()` and by `VolatileMemory.reset`. The turn stack itself survives the
  sequencing, because the turn onto the next leg is still being flown.
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
  `activateFpl0()`. A flag does not change `navPage.xtkScale` (#159), and a power-up sets 5 NM again in
  `VolatileMemory.reset`.
- DIS is always the direct distance, even for arcs (6-18).
- A leg without length (FROM and TO are the same waypoint, so its path has no center) is sequenced at once when a next
  leg exists. The last one navigates on the course of the leg before it (#120, as the KLN 89 trainer does): XTK, DTK
  and TO/FROM come from that leg's path, and all outputs are written. With no leg before it, XTK, DTK and TO/FROM are
  null and the distance, bearing and ETE remain.
- XTK uses the top of the turn stack during turns (4-8) and the leg circle otherwise.
- DTK is the bearing at the closest point. `bearingForAP` equals the DTK on arcs, a workaround so the autopilot tracks
  DME arcs.
- TO/FROM is defined as `|bearing - dtk| <= 90`.
- In OBS mode there is no sequencing (5-35); the waypoint alert is still computed, as for a waypoint without a turn
  (#147).
- Sequencing (not in OBS mode, GS > 2):
    - With `turnAnticipation` on and the waypoint not fly-over or duplicated, it takes the lead from `turnLead`
      (`SequencingGeometry.ts`, #404, checked in the KLN 89 trainer, 2026-10-20). The lead is r·tan(θ/2), where r is the
      standard-rate radius with the bank limited to 25° (`bankeAngleForStandardTurn(gs)`, `services/KLNNavmath.ts`). It
      is capped at 60 s of ground speed (`LEAD_CAP_TIME`) and at half the inbound leg. The inbound leg
      (`inboundLegLength`) is the distance between the waypoints, along the arc for a DME arc, and from where a Direct To
      was activated.
    - The turn point is the lead plus the roll-in (`distanceToAchieveBankAngleChange`, the bank at 5 deg/s), measured
      along the track: the along-track distance to the waypoint (`alongTrackDistance`), which on course is the straight
      distance. The trainer adds no roll-in, so this is a deliberate departure: a 1 Hz calculation, autopilot lag, and
      SimVars that the display shares. Users reported overshoots before the roll-in was added.
    - Two regimes, chosen in every calculation by the cross track to the active leg's own path (not a turn circle)
      against `OFF_LEG_XTK` (4.0 NM, #157, checked in the KLN 89 trainer, 2026-10-20; not latched, so the regime can
      change from one calculation to the next). On the leg (|XTK| ≤ 4.0 NM) the turn plan, the turn start and the
      bisector sequencing below apply. Off the leg (`tickOffLeg`) there is no turn anticipation: a turn of the active
      waypoint's own that has started is dropped (`ActiveWaypoint.dropOwnTurn`, which keeps `turnPlan`, so the turn
      starts again by the plan once the aircraft is back on the leg), and a turn left over from the previous waypoint
      runs to its end. The waypoint is sequenced as soon as the next leg's segment is at least as close as the active
      leg's (`segmentDistance`, the measure of `findClosestLegIdx`; for a Direct To the active leg starts where it was
      activated): on the outside of the turn at the abeam line, on the inside at the inside bisector, however far from
      the waypoint. Not at the MAP.
    - The turn plan (`ActiveWaypoint.turnPlan`, #157, checked in the KLN 89 trainer, 2026-10-20) is decided once, at the
      first calculation within `TURN_DECISION_TIME` (20 s) of ground speed before the turn point along the track: with
      at most `TURN_PLAN_MAX_XTK` (2.8 NM) of cross track to the leg `AT_LEAD`, otherwise `AT_ABEAM`. It is latched
      until the active waypoint changes, and a leg that becomes active past the decision point is decided at once. The
      gate and the moment of the decision are known with medium confidence. It is also decided off the leg, where it is
      always `AT_ABEAM`, so an aircraft that comes back on the leg past the decision point turns at the abeam line.
    - On `AT_LEAD` the turn starts at the turn point along the track, whatever the cross track is by then.
    - On `AT_ABEAM` it starts at the abeam line (TO turns FROM) as the abeam turn, a turn of no size: one
      `TurnStackEntry` with `abeamTurnSign` set, whose XTK is that sign times the distance to the waypoint (FLY L for a
      left turn) and whose DTK is the next leg's. No end-of-turn test pops it; `ActiveWaypoint.setActiveIdx` drops it
      when the active waypoint changes. Roll steering steers on the next leg at once (the aircraft is farther from a
      circle of no size than its radius). This is the real unit's dogleg: it only happens when a waypoint is passed up
      to 4 NM off course, and a default autopilot coupled then steers back toward the waypoint until the bisector.
    - A capped turn is flown on the tighter circle that is tangent to both legs at the lead (radius lead / tan(θ/2)). The
      aircraft cannot fly that circle at 25° of bank, so it lags it. An uncapped turn uses the circle of radius r.
    - At the start of the turn plan's turn it pushes two `TurnStackEntry`s: the pre-turn straight segment (the roll-in)
      and the turn circle.
    - A leg that becomes active inside the lead (a Direct To, a short leg) starts its turn at once and flies it. The
      waypoint is no longer skipped; the #76 skip is gone.
    - The pre-turn segment ends at its switch point: within the tick ahead, or once the distance to the point grows.
    - The turn circle carries the turn's bisector (`TurnStackEntry.turnBisector`). It ends once the aircraft is past its
      midpoint and past the circle's end point (the lead past the waypoint) along the next leg, within the tick ahead.
      Past the midpoint means on the next leg's side of the bisector, with the GPS track within 90° of the next leg.
    - It also ends when the aircraft is more than `OFF_LEG_XTK` (4.0 NM) from the active leg: the inbound leg until the
      waypoint is sequenced, the next leg afterwards.
    - The midpoint condition keeps a turn near 180° from ending where it starts, where the start lies barely before the
      end point along the next leg. At 180° the start is the end point and the bisector runs along both legs: in the
      first calculations of the circle the aircraft is at the end point and not on the inbound side of the bisector, and
      only the track, still opposite the next leg, keeps the turn. After that the aircraft moves away from the end point
      along the next leg until the turn is nearly complete.
    - The end-point condition keeps a lagging aircraft from ending the turn as it moves away from the end point at first.
    - Measuring the 4.0 NM to the active leg keeps a fast aircraft, which starts the turn lead · sin θ from the next leg,
      from ending it at once.
    - The turn is pushed once per active waypoint: pushing it (`ActiveWaypoint.startOwnTurn`) sets `ownTurnStarted`, and
      a turn that ended while its waypoint is still active is not started again (#375), except one dropped off the leg
      (#157).
    - The waypoint's own turn supersedes a turn left over from the previous waypoint: at its turn point (by the plan) it
      replaces whatever is still on the stack. A leg shorter than the previous turn's lead plus this turn point otherwise
      delayed the turn, and the bisector sequencing it arms, until the previous circle ended (the final review of
      2026-10-21; no trainer evidence).
    - On the leg it sequences when the aircraft is past the bisector of the turn (`bisectorSide >= 0`), armed by
      `ownTurnStarted` or the plan `AT_ABEAM` (#375, checked in the KLN 89 trainer, 2026-10-20). On course that is the
      middle of the turn; for a big turn it lies well before the waypoint. It is a state, not a crossing, so an aircraft
      already past the line when the test arms sequences at once. On the inside of a turn on the abeam plan that can be
      before the abeam line, with no turn started (the design's call; not observed in the trainer). It does not read the
      waypoint alert, so a turn still on the stack from the previous waypoint cannot sequence the next one. Since a turn
      ends only past the bisector, a turn's normal end comes in or after the calculation that sequences its waypoint.
- Without turn anticipation, it sequences on FROM.
- **The MAP is never auto-sequenced.**
- Waypoint alert thresholds: on the turn plan from the decision, 20 s before the turn point along the track
  (`WPT_ALERT_WITH_TURN_ANTI`, which `TURN_DECISION_TIME` equals), while the aircraft is TO the waypoint (so it ends
  past the MAP, where no turn is started); on the abeam plan `WPT_ALERT_ABEAM_TURN` (15 s)
  before the abeam line at the along-track closure rate, none at the decision (checked in the KLN 89 trainer,
  2026-10-20); off the leg `WPT_ALERT_OFF_LEG` (36 s) before the abeam line at the closure rate on the outside of the
  turn and none on the inside, where the inside bisector sequences first (#157, checked in the KLN 89 trainer,
  2026-10-20). These two hold only before the abeam line, so they end past the MAP, where nothing is sequenced and no
  turn is started. All stay on while a turn is on the stack. Before a waypoint without a turn 15 s with turn anticipation
  on (`WPT_ALERT_NO_TURN_WITH_TURN_ANTI`, #372, measured in the KLN 89 trainer) or 36 s with it off
  (`WPT_ALERT_WITHOUT_TURN_ANTI`). The alert of a waypoint without a turn ends once the waypoint is behind (FROM),
  unless a turn is still being flown.
- At the end of the tick, after the sequencing, it publishes `navPage.steeringPath`, the path roll steering follows: the
  leg path without a turn (also the OBS leg, an arc's circle and, past a final leg without length, the leg before it),
  the turn circle (`turnStack[0]`) from the start of the lead-in, or the next leg (`pathForDtk`) once the aircraft was
  farther from the circle than its radius (`TurnStackEntry.steerOnPathForDtk`, kept until the entry pops). Null where
  XTK is null (#373, #100).
- `MAX_BANK_ANGLE = 25`. `HOURS_TO_SECONDS` is exported from here and widely imported.

**`ModeController`** (`services/ModeController.ts`, manual 5-36):

- Modes are `NavMode {ENR_LEG, ENR_OBS, ARM_LEG, ARM_OBS, APR_LEG}`, stored in `navPage.navmode`. `navPage.xtkScale` is
  5 (ENR), 1 (ARM) or 0.3 (APR).
- Auto-arm happens within 30 NM of the approach airport (the `parentFacility` of the first APP leg). The scale ramps 5
  to 1 over 30 s, also when the pilot arms with the GPS APR switch inside 30 NM. A press while armed disarms: the
  first APP leg is kept in `navPage.approachDisarmedLeg`, and the auto-arm skips that approach until the next press,
  or until the legs are another object (the approach was removed, replaced or loaded again). A power-up clears it.
- ARM becomes APR when the FAF is active (or the IAF copy of a fix that is IAF and FAF, `ActiveWaypoint.getActiveFafLeg()`),
  within 2 NM, the MAP is ahead and the track is within 110 deg of FAF to MAP. APR becomes 0.3 at the FAF ("Integrity
  check?" is a TODO; there is no RAIM). In APR the scale ramps from its value at the activation to 0.3 over the distance
  to the FAF left at the activation (capped at 1); both values are kept in `navPage.aprActivationScale` and
  `navPage.aprActivationDist`.
- `armApproachPressed()` is triggered from MainPage on `EVT_APPR_ARM`.
- **OBS mode is implemented as a direct-to from a synthetic user facility (`ICAO.value("U","XX",...)`) 1000 NM away on
  the reciprocal of the OBS** (`setObs`). `setObs` skips an unchanged course unless `force` is set (entering OBS and
  ACTIVATE force it). A course set on the unit (MOD 2, NAV 3, a Direct To in OBS) goes through `setObsOnUnit`, which
  also writes it to a driven indicator at once; otherwise the 1 Hz read-back of the indicator would replace it.
- For OBS on VORs, the magnetic variation is taken from the VOR's `magneticVariation`, negated ("Seems to be opposite to
  the magvar service").
- Status-line feedback: `NO APPROACH`, `NO ACTV WPT`.

**`RollSteeringController`** (1 Hz, after `NavCalculator`) applies one control law, `rollSteeringCommand` in
`services/RollSteeringLaw.ts`, to `navPage.steeringPath` (the roll steering design,
`docs/superpowers/specs/2026-10-19-roll-steering-design.md`). It writes `L:KLN90B_RollCommand` and, only with
`writeGPSSimVars`, `GPS COURSE TO STEER`. Without a heading input (`Input.HeadingInput`, also switched by
`L:KLN90B_HeadingInput`) the roll command is 0 (2-69, #143), also during the self-test, and so is
`GPS COURSE TO STEER` (the maintainer's decision, 2026-10-19: he held it at 0 in the sim and the default autopilot still
tracked the flight plan, so the sim's autopilot does not read it; the DTK goes to `GPS WP DESIRED TRACK`). Its class
comment gives the sources for the 1 Hz rate.

- The law (true angles, a left bank positive): XTK and the DTK abeam come from the path itself; the intercept is
  `atan(|XTK| / L)` with the look-ahead `L = GS x 30 s`, at most 45 degrees (both checked in the KLN 89 trainer,
  2026-10-19); the course to steer is the DTK less the intercept toward the path; the bank is 1.25 times the track
  error (the framework's `LNavRollSteerComputer`), at most `MAX_BANK_ANGLE` (25).
- On a curved path (turn circle, DME arc) the bank the circle needs at the ground speed is added, in full on the path
  and fading out within one turn radius at 25 degrees of bank.
- On the circle of an anticipated turn (`turnStack[0].path`, not a DME arc) the command never banks against the turn;
  that side is held at 0, so an aircraft inside the turn near its start gets no wrong-way bank (#100).
- Beyond 150 degrees of track error the turn direction is latched: the shorter way when the error first exceeds 150
  (`navPage.rollSteeringLatch`, with a copy of the path it was chosen on), so a turn does not reverse while the error
  passes 180 and XTK changes sign. It is cleared on another path, without a
  command and on a power cycle (`VolatileMemory.reset`).
- No command (0) without a steering path or an XTK, below 5 kt of ground speed (2-70), or without a heading input. The
  output is raw; the aircraft smooth it.

**`Vnav`** (`services/Vnav.ts`): NAV 4 advisory VNAV with the state machine `Inactive/Armed/Active`. It uses
`navPage.nav4*` fields and has no sim output. Bringing the cursor onto ANGLE starts it from Inactive (a cursor
resting there does not), and only on an angle that shows other than 0.0; an angle entered on ANGLE re-arms it
(`setAngle`, #418). When the path reaches SEL or a programmed VNAV waypoint stops being valid, it resets the NAV 4
inputs as the KLN 89 does: angle, offset and waypoint cleared, FR set to SEL (#73).

**`KLNMagvar`** (`data/navdata/KLNMagvar.ts`):

- Uses `MagVar.get(coords)` between 74°N and 60°S (5-44). Outside that band it uses the pilot-entered
  `navPage.userMagvar`, which resets to 0 when re-entering coverage. In OBS mode the active waypoint must lie inside
  the band too (5-44, #190): otherwise the variation counts as invalid, and `getMagvarForObs` references the OBS course
  to true north (or the variation entered on SET 2), also for an active VOR.
- Convention: DTK and bearings are stored **true**; `obsMag` and `getDtkOrObsMagnetic()` are magnetic, and the names say
  which.

**SID/STAR/approaches** (`data/navdata/SidStar.ts`):

- Converts SDK procedures into KLN legs. It keeps the IAF/FAF/MAP/MAHP and the last leg, drops step-downs, merges
  consecutive AF arcs around one navaid and radius (within 0.1 NM) and computes `ArcData` (VOR, radials, entry point,
  `GeoCircle`). Two arcs of different radius stay two arcs (#131): the first arc's end fix stays in the list and the
  second arc starts at a generated entry at its published beginning. An IAF on an arc that continues around the same
  navaid and radius is dropped like a step-down, and the arc entry carries the IAF (#382, 6-16, 6-17).
- The sim sets no MAHP flag, so the MAHP is derived: the hold (HA, HF or HM) that ends the missed approach gets the
  flag on the conversion's copy of the leg (#220). A missed approach that ends otherwise has none.
- The arc entry point is created as a temporary user waypoint in `XY` and recalculated from the current position (
  `recalculateArcEntryData`). MOVE ? on the entry (6-17, Super NAV 5 and FPL 0) goes through `moveArcEntry`
  (`services/FlightplanUtils.ts`), which stores the new entry with `Flightplan.setArcEntry` so that the `kln90b`
  flight planner follows (#134, #419).
- `isProcedureRecognized` filters out RNAV procedures as the real unit does.
- Approach names are formatted as `R/V/N + rwy + suffix + -IDENT`.
- Fix suffix glyphs are Latin-1 chars that map to custom font glyphs: IAF `à`, FAF `á`, MAP `ã`, MAHP `â`.

**Alerts:**

- `AirspaceAlert` (3-39) uses `NearestLodBoundarySearchSession` every 10 s with `SPECIAL_USE_AIRSPACE_FILTER`. It is
  inhibited in ARM/APR modes and posts `AirspaceAlertMessage` / `InsideAirspaceMessage`. It warns when the 10-minute
  projection of the track meets the area or the area is within 2 NM (`ALERT_DISTANCE_NM`, 3-40, B-1, #189), with the
  vertical check applied to both. The sim holds most areas two or three times, as boundaries with the same type, limits
  and vectors but other names and ids, so the alert works on one area per group of copies (`AirspaceAreas`, #410): the
  search session's per-id bookkeeping stays, `areas()` hands out the copy with the shortest name (ties by the lowest id),
  and the warned and entered areas are remembered by key (`airspaceAreaKey`), so a change of the shown copy posts no
  second message.
- AIRSPACE ALERT and INSIDE SPC USE AIRSPACE stay on the MSG page while their condition holds, and reading them does
  not remove them (#412). The warned and the entered areas live on `NavPageState` (`airspaceWarned`,
  `airspaceEntered`), each key mapped to the message posted for it, and are reset at power-on, so a condition that
  still holds posts its message again after a power cycle. Each check drops the keys of areas that left the search.
  Entering an area ends its alert, so leaving it within 2 NM alerts again. With the alert disabled on SET 8 or
  inhibited in ARM/APR both maps are cleared and the open messages go. Each message also tests the live position
  laterally on every message tick, so it goes at once when the aircraft enters (alert) or leaves (inside), before the
  next check. A message whose condition has failed stays invalid, so a check that finds the condition true again posts
  a new message (which flashes MSG), even when the aircraft was back across the edge before that check.
- `BoundaryUtils` (`isInside`, `intersects`, `getIntersections`, `distanceToBoundaryNm`) works on a polyline per
  boundary, built once on first use and cached per `LodBoundary`, over every shape of LOD 0. Lines stay single segments;
  arcs and circles are cut into chords at most `ARC_CHORD_TOLERANCE_NM` off the curve (#209). The point-in-polygon and
  the segment crossings are hand-written in the flat lat/lon plane, with date-line handling (#9, #106). The edge
  distance is measured in a flat plane around the point.
- `services/AirspacesAlongRoute` is used by pages.
- `AltAlert` (3-56) and `HtAboveAirportAlert` (3-58) beep through `AudioGenerator`, which uses SDK `SoundServer` with
  `kln_short_beep` / `kln_long_beep`. The aircraft `sound.xml` must define these, and they only work if
  `Output.AltitudeAlertEnabled` is set. `BaseInstrument.onSoundEnd` forwards to `AudioGenerator`. The SDK has no call
  that sets the volume of an instrument sound, so the SET 9 volume only reaches the sound if the aircraft maps
  `L:KLN90B_AlertVolume` to a Wwise RTPC on both sounds (#197).
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
- `Nearestlists` (`data/navdata/NearestList.ts`): APT/VOR/NDB lists with a 9-item maximum and a 200 NM radius (#207);
  the VOR list holds every VOR class (#204). The search runs every 10 s and bearing and distance update every 1 Hz. The
  airport filter comes from the `nearestAptSurface` and `nearestAptMinRunwayLength` settings, with `updateFilters()`
  called from pages.
- `NearestUtils`: nearest helpers for pages and airspaces. Every airspace search goes through one
  `NearestLodBoundarySearchSession`, which reports a result as the difference from its previous search. So the class
  mirrors the session in one map (every added airspace in, every removed one out) and runs the searches one at a time
  in a FIFO queue; each queued run sets its own type mask first (#102). The map is an `AirspaceAreas`, so every list
  holds one boundary per group of identical copies, under the shortest name (#410). `getAirspacesAt` (OTH 2, the APT 1
  airspace row) searches at radius 0 and keeps only the airspaces that contain the point (`BoundaryUtils.isInside`),
  because the SDK seems to only check the bounding box ("CANADA RVSM"). `getAirspaces` (TRI 2, 4 and 6, CTR 1) returns
  the airspaces whose box meets the search circle and leaves the geometry to the caller; TRI 2, 4 and 6 list an area
  once by its `airspaceAreaKey`, even when two leg searches hand out different copies of it. `getNearestLowHighVor` gives
  NAV 2 its low or high altitude VOR within 200 NM through a `NearestVorSearch` (`data/navdata/NearestVorSearch.ts`);
  NAV 2 calls it when it opens and every 10 s while it is shown, never while another page is (#204). OTH 2 looks up
  the Center of the present position through `getAirspacesAt` when it opens and every 10 s while it is shown, one
  lookup at a time (#251, 3-52).
- `Database` (`data/navdata/Database.ts`): AIRAC expiry from `FacilityLoader.getDatabaseCycles().current`;
  `isAiracCurrent()`.
- `FirMap.ts` (FIR code to 3-letter name) and `CountryMap.ts` (`STATEMAP`, `COUNTRYMAP`) are static lookup tables used
  by APT/WPT pages and the REF/CTR/TRI pages.
- `data/Text.ts convertTextToKLNCharset`: the display only supports `A-Z 0-9 space -`, and unknown characters are
  stripped.

## Core 7. Persistence

Everything goes through SDK **UserSettings saved by `UserSettingSaveManager`** (DataStore) under the key
`"<ATC MODEL>.profile_1"`. `KLN90BSettingSaveManager` concatenates four managers:

- `KLN90BUserSettings`: the typed keys that `KLN90BUserSettingsTypes` declares. These include `welcome1..4`, `powercycles`, `totalTime`, `timezone`, baro,
  `lastLatitude/Longitude`, `lastAlmanacDownload`, `lastEphemeris`, `activeWaypoint` (ICAO **V2** string; V1 from older
  versions is still read), alert settings (the ALT page's `altAlertEnabled` and `altAlertWarn` since #259, which a
  power cycle keeps), the TRI and OTH figures (`triTas`, `triWindDirTrue`, `triWindSpeed`, `triFuelFlow`, `triReserve`,
  `tri5Fpl`, `othReserve`, since #192, which a power cycle keeps), the last waypoint of each waypoint page
  (`aptPageWpt`, `vorPageWpt`, `ndbPageWpt`, `intPageWpt`, `supPageWpt`) and the TRI waypoints (`tri1To`, `tri3From`,
  `tri3To`), likewise since #192 and saved as ICAO **V2** strings (the V1 format is deprecated), `turnAnticipation`, the
  NAV 5 and Super NAV 5 layout, CAL page inputs, `fastGpsAcquisition` and `userDataFormat`.
- `KLN90BUserWaypointsSettings`: `wpt0..wpt249` (`MAX_USER_WAYPOINTS=250`).
- `KLN90BUserFlightplansSettings`: `fpl0..fpl25` (`NUM_FLIGHTPLANS=25`, inclusive loop).
- `KLN90BUserRemarkSettings`: `rmk0..rmk99` (`NUM_REMARKS=100`, the 100 airports of 3-47; `rmk10` and up since #92).
  `RemarksManager` writes the airports into the first slots on every save and empties the rest.
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
  produce V2. `UserWaypointPersistor.restoreWaypoints()` suspends the repository sync while the loader adds the stored
  waypoints, so a restore writes nothing back; the first change after it rewrites all slots from the repository.
- Restore errors cause empty plans and the `USER DATA LOST` message. The same block then writes the empty state over
  the stored data, so the corrupt data is lost once and the message shows once, as after a failed V1 conversion.
- `Flightplanloader.loadIcaos` (base class) truncates to 30 legs and emits `WAYPOINT xxx DELETED` messages (at most 10,
  then `OTHER WAYPOINTS DELETED`).
- Persist triggers: waypoints persist on any `KLNfacilityrepo_sync` Add/Remove/Update (all 250 slots are rewritten);
  flight plans persist on `flightplanChanged`.
- Remarks (`settings/RemarksManager.ts`): stored as `ident(blank-padded to 4 chars) + 3×11 chars`, keyed by airport ident; publishes
  `changed` (`RemarksChangedEvent`).
- **`VolatileMemory`** (`data/VolatileMemory.ts`) is not persisted. It holds RAM state for each page group:
  `aptPage/vorPage/ndbPage/intPage/supPage` (`WaypointPageState`), `dtPage`, `fplPage {flightplans}`, *
  *`navPage: NavPageState`** (the hub for nav results, mode, `activeWaypoint`, `isSelfTestActive`, NAV 4 VNAV inputs,
  `userMagvar`), `triPage` (the TRI waypoints), `calPage` and `ctrPage`.
    - **The rule (#192): `VolatileMemory` keeps only what the unit forgets at a power-on.** What the unit keeps over a
      power cycle is a user setting, which also survives a sim restart. State that must survive a page change but not a
      power cycle lives here, and a field added here has to be reset in `reset()`. A guard test
      (`test/render/data/VolatileMemory.test.ts`) writes a sentinel into every field of every page state, runs a
      power-on and expects each field back at its initial value, so a new field that is neither reset nor a setting fails
      it. That is why every field of a page state needs an initializer, which the class comment explains. The evidence
      for what the unit keeps is the trainer record of 2026-10-24 ([kln89-trainer-record.md](kln89-trainer-record.md)).
    - `reset()` runs on every power-on. It resets these fields, **removes procedures from FPL 0 when the unit was off
      for more than 5 minutes** (6-5; `timeSincePowerChange` of the power event), and restores each waypoint page's saved
      waypoint (the first scan-list entry when none is saved or it no longer resolves) and the TRI waypoints, setting
      `isReady` when done; WelcomePage waits on `isReady`. A waypoint shown at a nearest rank is saved, and restored, as
      the plain waypoint (the KLN 89 trainer did the same). It builds every scan list either way: a restored page needs
      the index for the scan past the last nearest rank (3-24) and for the fast scan.
    - **The 5-minute exception:** the pilot-entered magnetic variation (`navPage.userMagvar`) is kept over a power-off of
      up to 5 minutes and cleared after more (`RESET_TIME`, 6-5; the KLN 89 Pilot's Guide says so on 4-46 and 4-47, the
      90B guide is silent). A sim restart counts as long, because memory does not survive it and the first power-on
      reads as an hour off. It is the only page state that stays in memory over a power cycle (the plans and the active
      waypoint are persisted on their own path). The NAV 4 selected altitude, the OBS course and the Super NAV 5 range
      are reset at every power-on, and the derived navigation values start empty until the first calculation tick.
    - `ctrPage` keeps the left FPL page instance of the CTR computation (`lastFplPage`). CTR 1 and CTR 2 call
      `syncCtrState` (`pages/right/CtrState.ts`) in their display ticks and return to the start state when another
      instance is on the left (5-26).
      `computedLegs` is a copy of the plan's legs from the computation: when the plan's legs differ (count or instance),
      `syncCtrState` and CTR 1's insert ENT go back to the start state (#348), and a computation that finishes after such
      a reset is discarded. The insertion therefore needs no room check of its own; the computation checks `fits`.
      CTR 1 drops a crossing on a leg between two approach waypoints before it counts or creates anything
      (`mayAddWaypointBefore` in `services/FlightplanUtils.ts`, 6-7, #349). REF skips such legs when it looks for the
      closest leg, and gives INVALID REF when none is left (`RefPage.findClosestPoint`, 5-21, #377). A REF waypoint on
      the leg into the IAF is inserted as an en-route leg in front of the approach header (`insertRefWpt`).
- **Persistent messages** (`data/PersistentMessages.ts`) are condition-driven message objects. They are not stored; see
  Core 9.

## Core 8. Aircraft configuration (panel.xml `PlaneHTMLConfig`)

`settings/KLN90BPlaneSettings.ts`, `KLN90BPlaneSettingsParser.parsePlaneSettings(xmlConfig)`:

- It finds the `<Instrument>` whose `<Name>` is `KLN90B` and reads dotted paths with `getBoolean`, `getChoice` or
  `getString(tag, "Input.Airdata.IsInterfaced", default)`. A boolean must be exactly `true` or `false`, and a choice key
  (`ObsSource`, `ObsTarget`, `BaroSource`, `Unit`, `Type`) one of its documented values, both after trimming the
  whitespace around them. `BasePath` and `ElectricitySimVar` are free text. `Input.HeadingInput` (`getHeadingSimVar`)
  is `true`, `false` or a SimVar name (#405): a name starts with a letter, has a space or a colon and does not end in a
  colon, so a misspelled boolean is still rejected.
- An invalid value is never used (#145): the key gets its default, and the parser records one line in `problems`. So
  does `AppArmSwitchInstalled=true` on a `VFROnly` unit, which cannot have the switch (Installation Manual 2-6); the
  switch falls back to false. `KLN90BCore` publishes the lines as `panelXmlErrors`, and `controls/PanelXmlErrorPage`
  shows them to the aircraft developer; OK closes it and the unit runs on. The runtime override LVars are not checked.
- Keys of an interface that is not installed are ignored, not rejected: the fuel computer keys without
  `FuelComputer.IsInterfaced`, and `BaroSource` without `Airdata.IsInterfaced`. Code asks `isBaroTransmitted(settings)`
  instead of reading `baroSource` alone (#360).
- Keys and defaults:
    - `TakeHomeMode` = false
    - `BasePath` = `html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B`, used for asset URLs
    - `VFROnly` = false
    - `Input.AltimeterInterfaced` = true
    - `Input.ObsSource` = 1
    - `Input.HeadingInput` = false (true reads `PLANE HEADING DEGREES GYRO`; a SimVar name reads that SimVar, #405)
    - `Input.ElectricitySimVar` = `""`
    - `Input.Airdata.{IsInterfaced=false, BaroSource=0}`
    - `Input.FuelComputer.{IsInterfaced=false, Unit=GAL, Type=AVGAS, FOBTransmitted=true, FuelUsedTransmitted=true}`
    - `Input.ExternalSwitches.{LegObsSwitchInstalled=false, AppArmSwitchInstalled=false}`
    - `Output.{ObsTarget=0, AltitudeAlertEnabled=false, WriteGPSSimVars=true}` (`AltitudeAlertEnabled` was true before
      #141)
    - `debugMode` = false (hard-coded)
- The sample `cfg/panel.xml` sets `AltitudeAlertEnabled=false`, the default. An aircraft that wants the altitude alerter
  sets it to true and declares the `kln_short_beep` and `kln_long_beep` sounds.
- After parsing it writes the runtime-override LVars (Core 4). An `ElectricitySimVar` like `CIRCUIT ON:1` has its
  index replaced every 100 ms by `L:KLN90B_ElectricitySimVarIndex`.
- `KLN90PlaneSettings` is **mutable at runtime** through `SimVarSync`; code reads `planeSettings.input/output.*` live.
  Without a heading input a stored HDG up map orientation is drawn north up (`effectiveMapOrientation`, #368). The
  stored setting is never changed. A runtime change of the input applies to the orientation fields and to the CAL 3 and
  OTH 9 layout at the next page build, while the NAV 5 and Super NAV 5 maps follow the input at once.
- Consumers: `Sensors` (all inputs and outputs), `ModeController`, `NavCalculator.setMode` (writeObs),
  `PersistentMessages` (obsTarget chooses between `AdjustCourse...` variants; `AltitudeFailMessage`),
  `BrightnessManager`, `AudioGenerator`, `AltAlert`, `HtAboveAirportAlert`, `WTFlightplanSync`, `KlnEfbSaver`, `MSA` and
  `Gps` (basePath), and pages (`VFROnlyPage`, `SelfTestRightPage`, `PageTreeController`, `WelcomePage`).

## Core 9. Messages, status line and annunciators

- `data/MessageHandler.ts`: `Message {seen, message: string[], isConditionValid()}`.
    - `OneTimeMessage` stays valid until it is seen. `AirspaceAlertMessage` and `InsideAirspaceMessage` do not
      extend it: they are valid while their area is among the warned or entered areas of `NavPageState` and the live
      position is outside or inside the boundary (#412).
    - `MessageHandler` (a 1 Hz tickable) keeps `activeMessages`. Each tick it drops invalid messages, adds
      `persistentMessages` whose condition becomes true, and resets their `seen` flag when the condition goes false.
      `KLN90BCore` calls `clear()` at every power-off (also a loss of electricity): the active messages go and the
      persistent ones return once their condition holds. A read one returns read, because `clear()` keeps the `seen`
      flags (the maintainer's ruling, #351); one whose condition lapsed meanwhile is reset by the tick. `clear()` calls
      the optional `onPowerOff()` of each persistent message, for one that keeps state of the power-on in which it was
      posted.
    - `DatabaseOutOfDateMessage` latches at the change from current to expired (a SET 2 or self-test date, the GPS
      correcting the date, the end passing in flight) and holds until it is seen; its `onPowerOff()` drops the latch and
      the last validity, so a power-up with the date already past the end posts nothing (#175; KLN 89 trainer,
      2026-10-18).
    - Messages are added with `messageHandler.addMessage(new OneTimeMessage(["LINE1","LINE2"]))`; each line holds at
      most about 22 to 23 characters.
- `buildPersistentMessages(props)` creates: `AltitudeFailMessage`, `ArmGPSApproachMessage`, `DatabaseOutOfDateMessage`,
  `IfRequiredSelectObsMessage`, `MagvarMessage`, `Obs200NMMessage`, `PressAltToSetBaroMessage`, `VnavAlertMessage`, plus
  `AdjustCourseToWithObsReadingMessage` (`ADJ NAV IND CRS TO xxx°`) when `obsTarget===0`, otherwise
  `AdjustCourseMessage`. The former is not evaluated before the self-test is approved, and it takes the course at its
  first evaluation after the approval as the start, not as a DTK change that opens its 30 s window (#330).
- The MSG page (`controls/MessagePage.tsx`) shows newest first. `controls/StatusLine.tsx` shows the `MSG` indicator and
  drives `L:KLN90B_MsgLight` in the display tick: flashing while unread, steady while read, off when empty.
- **Status-line transient messages** are a separate channel. Publish `statusLineMessage` (`StatusLineMessageEvents`)
  with a `StatusLineMessage` literal; it is a typed string union in `StatusLine.tsx` (`"NO APPROACH"`,
  `"USR DB FULL"`, ...). Add new strings to the union.
    - Each one is also a `ScratchpadMessage` in the `MessageHandler`, so the MSG page lists it and the MSG light flashes
      for it (AVsoftech 90B trainer, 2026-10-24, #237). It never counts as read. `StatusLine` counts its 5 seconds from
      the first display tick in which the status line is visible, the clock runs on while Super NAV 5 hides it, and the
      message ends and is removed (`removeMessage`) only while the status line is visible. A newer message replaces the
      older one. `StatusLine.destroy` removes the entry.
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
    - the limits of FPL 0: 30 en-route waypoints and 45 legs in total (#221); the MAP is not auto-sequenced
    - SUA alerts treat everything as inside when there is no altitude input (3-40)
    - procedures are removed on power-on
    - only USER legs persist
    - RNAV SIDs and STARs are excluded
    - only `A-Z0-9 -` can be displayed
- **Deliberate non-real additions:** `GPS COURSE TO STEER`, the roll-steering LVar for the autopilot, `bearingForAP` on
  arcs, the fast GPS acquisition setting (default on) and keyboard mode. Missing on purpose or not implemented: RAIM,
  failures, 3-satellite plus altitude solutions, CTA/TMA in the SUA filter (TODO), and the third line of the SUA
  messages (the APT 4 reference for Class B/C and the controlling agency, #210: the sim's data has neither).
- **Event bus topics** are typed by interfaces declared next to their owner. There is no central file:
    - `PowerEvent.powerEvent` (`PowerSupply.ts`)
    - `PropsReadyEvent.propsReady` (`KLN90BCore.ts`)
    - `FlightplanEvents.flightplanChanged` (`Flightplan.ts`)
    - `ActiveWaypointChangedEvents.activeWaypointChanged` (`ActiveWaypoint.ts`)
    - `GPSEvents.timeUpdatedEvent` (`Gps.ts`)
    - `ErrorEvent.error` (`controls/ErrorPage.tsx`)
    - `PanelXmlErrorEvent.panelXmlErrors` (`controls/PanelXmlErrorPage.tsx`)
    - `StatusLineMessageEvents.statusLineMessage` and `KeyboardEvent.keyboardevent` (`controls/StatusLine.tsx`)
    - `RemarksChangedEvent.changed` (`RemarksManager.ts`)
    - `KLNfacilityrepo_sync`
    - SDK topic: `hEvent`
- **Units:** `data/Units.ts` has type aliases only (`Feet`, `NauticalMiles`, `Degrees`, `Knots`, `Seconds`, ...), for
  documentation. Internals use NM, knots and degrees (true unless the name says Mag). `GeoPoint.distance` returns GA
  radians, so convert with `UnitType.GA_RADIAN.convertTo(x, UnitType.NMILE)`. SimVar writes convert to meters, radians
  and m/s through `UnitType`/`SimVarValueType`.
- **Allocation hygiene:** module-level caches like `VEC3_CACHE`, `TO_GEOPOINT_CACHE` and `CACHED_CIRCLE` are reused, in
  SDK style. Beware of aliasing.
- **Global and singleton state:** `KLNFacilityRepository.INSTANCE`, the `KLN90BUser*Settings` managers (`INSTANCE ??=`),
  `FlightPlanner` id `"kln90b"`, and the `SimVar`/`Coherent` globals from `@microsoft/msfs-types`. Because of these
  singletons the tests run one headless unit per test (test/README.md). `global.d.ts` only
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
  `<input class="keyboard">` (keyboard mode), a `PanelXmlErrorPage` and an `ErrorPage`. `ErrorPage` shows any
  `ErrorEvent` published on the bus, and `PanelXmlErrorPage` the invalid panel.xml values (Core 8). The error page comes
  later in the DOM, so an exception shows on top.
- `PageManager.setCurrentPage(Type, props)` → `PageContainer.setCurrentPage`. This destroys the old Page, runs
  `FSComponent.buildComponent`, then `rerenderCurrentPage()` sets `innerHTML=""` and renders again.
- Startup sequence. Each step is a full Page:
    1. `PowerSupply.ts` → `WelcomePage`, or `NullPage` when powered off.
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
  sync the tree), `replaceLeftBasePage(page)` (the EFB load of FPL 0, #395: closes every page pushed on the left and
  the right-side children of the old base page, then sets the page as the left base page),
  `pushLeftPage/pushRightPage/pushPage(page,parent,side)`, `popLeftPage/popRightPage/popPage(side)`,
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
  `navPage`, `fplPage`, `dtPage`, `triPage`, ...) or in `userSettings` (the ALT page's ALERT and WARN, #259; what a
  power cycle keeps, such as the TRI and OTH figures, #192).
- The tree position is found with `instanceof` (`getPageIndices`). Every slot must therefore be a *distinct class*. That
  is why `Fpl0Page...Fpl25Page` are trivial subclasses of `FplPage({page:n})`, and why NAV 4 is split into
  `Nav4LeftPage`/`Nav4RightPage` (they differ in `getPageSide()`). Nav1/2/3/5 are the same classes in both trees.
- Plane-setting pruning happens in the constructor (`buildTree`), which filters a copy of the tree by page class.
  Without airdata it removes OTH 9/10; without a fuel computer it removes OTH 5-8. The module-level arrays are never
  changed, because every power-on, ACT visit and waypoint confirmation builds a new controller over them (#90).
  Without `Input.ExternalSwitches.AppArmSwitchInstalled` it removes APT 8 from the right tree, and so also ACT 8 (3-49,
  #133).
- `CustomPageTreeController` / `isCustomPageTreeController(page)` (`"pageTreeController" in page`). `ActPagePage` and
  `WaypointConfirmPage` own a private `PageTreeController(RIGHT_PAGE_TREE, innerPage, ...)`, so the right inner knob
  browses APT 1-8 (APT 1-7 without the approach arm switch) etc. *of that waypoint* instead of the main tree. They copy
  `name`/`numPages` from the inner page in `pageChanged`.

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
    - `Handled_Move_Focus` (the CursorController then calls `outerRight()` to advance to the next field; on the last
      field the cursor stays, because the outer knob stops at both ends of a page, 4-3, #218)
- The CursorController leaves the cursor where it is after `Not_Handled`: a field whose value changes as the knob turns
  has nothing to accept (#354). Only the self-test page builds its controller to move on after every ENT (3-6, 3-7).
- The top level ignores the result. Inside MainPage, "not handled" is meaningful.

### MainPage dispatch rules (`MainPage.onInteractionEvent`)

- **Order of precedence for knobs:** overlay page → cursor-active page → tree navigation. The MSG page is the
  exception: the knobs and CRSR close it first and act on the page beneath, and CLR on it is ignored (#333).
- Outer knob with cursor off: on the base page → `treeController.movePage(±1)`. On a pushed page (DCT, confirm, ...) → *
  *pop it and re-dispatch the same event** (KLN 89 trainer behaviour). An overlay is never popped that way: with its
  cursor on, the knob goes to its cursor controller, and a knob that the focused field refuses does nothing (#336; the
  KLN 89 trainer, 2026-10-09, T5, checked the inner knob on a prompt). With its cursor off, the MSG page closes and the
  knob acts on the page beneath (the MSG exception above, #56), and a super page passes the knob to the tree controller of its side.
- Inner knob with cursor off: `isCustomPageTreeController(page)` → `page.pageTreeController.moveSubpage`. Otherwise base
  page → `moveSubpage`, otherwise pop and re-dispatch.
- `EVT_R_SCAN_*`: with the right cursor off → `page.scanLeft/Right()`. With the cursor on it *falls through* to
  inner-knob behaviour. The cursor is the one the pilot sees (`isRightCursorActive()`): with an overlay shown, the
  overlay's own right cursor decides, not that of the right page beneath (#394).
- `EVT_R_SCAN` (the pull or push itself; `hardware.isScanPulled` is already toggled) →
  `SuperNav5Page.scanPulledChanged()` when Super NAV 5 shows, and not handled otherwise. On Super NAV 5 (#394): a pull
  with the menu open (its right cursor on) closes the menu and shows the scan window; CRSR while pulled opens the
  menu, the pulled knob then changes the menu's fields, and CRSR again closes it and shows the window; a push with the
  menu open changes nothing. While the menu hides the window (`SuperNav5Page.isScanWindowShown()` is false), the
  window keeps its waypoint but takes neither DCT (no Direct To suggestion), CLR (the map declutters instead) nor ENT.
- `EVT_L_CURSOR`/`EVT_R_CURSOR` → with an overlay shown, `toggleCursor()` of the overlay's cursor controller of that
  side. Otherwise `SixLineHalfPage.cursorPressed()` of that side, which toggles the cursor by default. `MakeRoomPage`
  overrides it to cancel its question as CLR does (checked in the KLN 89 trainer, 2026-10-23, #385).
- `EVT_ENT` → `handleEnter()`:
    1. If left `isEnterAccepted()` → left.enter; else if right accepts → right.enter. A waypoint editor that waits for
       its creation page on the right does not accept ENT, so ENT reaches that page (#262).
    2. Otherwise try left.enter, then right.enter.
    3. Overlays → `overlay.enter()`.
- `EVT_CLR` → the overlay's `clear()` if an overlay is shown. Otherwise the half pages: like ENT, a side that holds an
  open entry (`SixLineHalfPage.hasOpenEntry()`: by default a focused field that `isEntered`, that is an open edit or a
  DEL question) takes CLR first. A `WaypointConfirmPage` shown for an editor on the right side counts as an open entry
  too, because the right page has no cursor of its own while it waits for the approval (#359); the confirmation of a
  left-side editor does not, since the left cursor sits on that editor. So an open edit on the right is not overtaken
  by the left page answering CLR (FPL with its cursor off asks DELETE FPL?). That priority applies only to the half pages, never to an overlay. It goes
  to the right page only when the right side holds an open entry and the left does not; otherwise the order is left,
  then right (`left.clear() || right.clear()`). When both sides hold an open entry the left goes first. `FiveSegmentPage`
  does the same for its two halves (#307). APT 7 and APT 8 count a selection step (every step after the procedure list)
  as an open entry too, so it takes CLR before FPL 0's DELETE FPL? (#383). The room question on the left
  (`MakeRoomPage`, #222, #380) always counts as an open entry, so CLR cancels it also while the right page is on such
  a step (a procedure load into a full FPL 0 asks it from such a step; an FPL 0 insert can ask it next to one). The CLR of a
  waypoint editor whose creation page is open (`WaypointEditor.clear`, which closes an open entry on the right first,
  #307) asks `hasOpenEntry()` only of the creation page or a page pushed above it, so APT 7 and APT 8 never reach it.
- `EVT_MSG` → push `MessagePage`, or call `MessagePage.msg()` to page through. It pops itself after the last page.
- `EVT_DCT` → close the MSG page first if it is shown (#335), then push `DirectToPage` left, or `directToPressed()` if
  it is already shown (toggles ACTIVATE in OBS).
- `EVT_ALT` → close the MSG page first if it is shown (#335), then toggle `AltPage` left, plus `Nav4RightPage` right
  with its cursor forced active.
- `EVT_APPR_ARM` → `modeController.armApproachPressed()`.

### CursorController (`pages/CursorController.ts`)

- Each half page owns one; `SixLinePage` has `lCursorController` and `rCursorController`. `NO_CURSOR_CONTROLLER` is a
  shared instance for pages without fields. Built with `new CursorController(this.children)`.
- Fields are obtained by `children.getallFlat().filter(isField && !isReadonly)` and **recomputed on every call**.
  Toggling `isReadonly` (or `setVisible` on a `Button`) therefore adds or removes a field live.
- **Cursor order = depth-first insertion order of the children map.** Declaring children in a different order changes
  the CRSR sequence. Nested sub-page children (e.g. `Apt2Page.dbPage/userPage`) are included.
- `toggleCursor()` returns false when there are no fields, while `setCursorActive(true)` throws then. A page that turns
  its cursor on when it opens checks first that a field can take it (`AltPage` with the air data baro and altitude
  alerting disabled opens with the cursor off, #399). The cursor does not remember where it was: each time it
  comes on, `setCursorActive` starts it on the page's start field (`setDefaultCursorField(n)`,
  `setDefaultCursorFieldToLast()`), or on the field `setStartFieldProvider` names, which the list pages use for the top
  visible entry of a scrolled list (`List.topVisibleField`, #355). `focusIndex(i)` moves a cursor that is on.
- With the cursor on:
    - outer knob moves between fields, unless the focused field `isEntered`, in which case the field receives the outer
      knob (moving within an editor). An entered field that refuses the knob (a DEL question) is unfocused, which
      withdraws its question, and the cursor moves on; at the first or last field the question goes and the cursor stays
      (#317);
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
    - Every page is a `DisplayComponent`, and every way a page leaves calls its `destroy()` (#96): in `MainPage`,
      `PageStack.setCurrentPage` (the page it replaces), `pop` and `parentRemoved` (the pushed pages of a removed
      parent), `OverlayStack.pop` and `remove`, and `MainPage.destroy` at power-off, which destroys every page of the
      three stacks. `PageContainer.setCurrentPage` destroys the full page it replaces (the welcome page, the main
      page). `MainPage`, `FiveSegmentPage`, `FourSegmentPage` and `StatusLine` override it to destroy their
      children.
    - A page that subscribes to the bus keeps the `Subscription` and drops it in its `destroy()` (`Oth3Page`,
      `Oth4Page`, `WelcomePage`), so the page's recreation on every knob step adds no handler. Follow that pattern in a
      new page that subscribes.
    - No `onAfterRender` is used, except in `ErrorPage` and `PanelXmlErrorPage`.

### Element catalogue (`controls/`)

- **Displays** (`controls/displays/`, read-only `UiElement`s with public mutable value fields, rendered on tick):
    - `TextDisplay(text)`
    - `DistanceDisplay(length, nm)` (null → dashes, decimals dropped when too long; comments cite which manual page uses
      which length)
    - `BearingDisplay` (`"---°"`, `flash`)
    - `AltitudeDisplay`/`ElevationDisplay`, `SpeedDisplay`, `DurationDisplay`, `TimeDisplay`, `FuelDisplay`,
      `TemperatureDisplay`, `LatitudeDisplay`, `LongitudeDisplay`, `RoundedDistanceDisplay`
    - `DeviationBar`, `SuperDeviationBar`, `ActiveArrow` (flashes during waypoint alert, 3-29), `FlightplanArrow`
      (draws nothing while the navigation is flagged, 4-7, #322)
    - Convention: null value → dashes. A value that does not fit the field shows dashes as well: a negative speed, a rate
      of 10000 ft/min or more, a duration of 100 hours or more (#257).
- **Editors** (`controls/editors/`; manual 3-14, "jump in, edit char by char, confirm with ENT"):
    - `Editor<T>` is an abstract `Field` composed of `EditorField`s (char cells with a `charset`).
    - Subclass hooks: `convertFromValue(value): number[]` and `async convertToValue(raw): T|null`. Null → status
      `INVALID ENT` with `Handled_Keep_Focus`. Optional `onCharChanged()`.
    - The first inner-knob turn sets `isEntered` (fields reset to `DEFAULT_FIELD_VALUE`, cursor on char 0). The outer
      knob then moves between chars, the inner knob changes the char, and ENT validates and calls
      `enterCallback(value)`.
    - The starting click is per editor (#311, not in `Editor.setEntered`, so the numeric editors keep their first
      choice). `WaypointEditor` gives A clockwise and 9 counterclockwise in cell 0 and runs `onCharChanged()`, so the
      first identifier that begins with it is offered (KLN 89 trainer, 2026-10-08 and 2026-10-15). `FreetextEditor` gives
      an A when constructed with `firstClickGivesA`, which the remark lines of APT 5 do and the Turn-On page does not.
    - `setValue()` updates the display unless the editor is being edited.
    - Field classes in `EditorField.tsx`: `AlphabetEditorField` (space, A-Z, 0-9), `NumberEditorField` (
      `createWithMinMax`, `createWithBlankMax`), `MonthEditorField`, `NorthSouth/EastWest/RunwaySurfaceEditorField`.
    - `FirstIdentEditorField` is cell 0 of `WaypointEditor`: the knob and the keyboard skip the blank, so the wheel runs
      A to Z, 0 to 9 and round again (KLN 89 trainer, 2026-10-15, #374). It keeps the shared charset, so a blank first
      cell (an empty field, CLR on D->/FPL rows) still shows and every index is the shared one. A blank typed with the
      raw H event is refused (`WaypointEditor.refusesKey`) before an edit opens, by `WaypointEditor.keyboard` and by
      `FlightplanListItem.keyboard` (which opens the row's edit or inserts a row before it hands a key over), so a refused
      key changes nothing.
    - Concrete editors: Bearing, Date, Distance, Elevation, Freetext, Latitude, Longitude, Magvar, NdbFreq, Radial,
      RunwaySurface, Speed, Time, VorFreq, Waypoint.
- **Selects** (`controls/selects/`; immediate-effect fields, no ENT):
    - `SelectField(valueSet: string[], index, changedCallback)`: the inner knob cycles and calls back at once;
      `keyboard()` picks a value by its text.
    - `SelectField.displayOverride` is a text shown in place of the value (dashes, or a digit the value set does not
      hold) until it is cleared. A fieldset whose value does not fit shows dashes through it, holds no value (null) and
      edits from zero, so the dashes never leak a value from behind them (#257).
    - `CdiScaleField` is the CDI scale of MOD 1 and MOD 2: a `SelectField` over the scales the current mode allows (5-38,
      6-1) that shows the step the scale is at or ramping to. The choices are rebuilt at every display tick, and a click
      sets the scale from the list that was on the screen.
    - `*Fieldset` classes (`AltitudeFieldset`, `BaroFieldset`, `BearingFieldset`, `FpmFieldset`, `FuelFieldset`,
      `SpeedFieldset`, `TempFieldset`, `TimeFieldset`, `VolumeFieldset`, `VnavFieldsets`) are plain `UiElement`s with
      one `SelectField` per digit, so each digit is its own cursor stop. They offer `setValue`/`setReadonly`.
    - `WaypointSelector` (base of `AirportSelector`, `VorSelector`, `NdbSelector`, `IntersectionSelector`) is the
      per-character ident at the top of waypoint pages. Changing a char looks up and loads the facility immediately via
      callback. A character entered after a blank cell keeps the blank before it (`AB A`) and that ident is searched
      (KLN 89 trainer, 2026-10-15, #343). Cell 0 is a `FirstCellSelectField`: the knob and the keyboard skip the blank
      there (KLN 89 trainer, 2026-10-15, #374); the charset and its indices are the shared ones.
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
    - `Canvas`, `StatusLine`, `MessagePage`, `ErrorPage`, `PanelXmlErrorPage`, `PageContainer`, `CoordOrNearestView`,
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
  The value is typed `StatusLineMessage` (union: `INVALID ENT`, `DUP IDENT`, `NO APT WPTS`, `FPL FULL`, ...). It shows
  inverted for `STATUS_MESSAGE_TIME = 5000` ms (manual 3-10); the MSG page lists it too (see the status-line transient
  messages in Core 9, #237). Non-standard texts are cast `as any` (e.g.
  `` `d› CRS ${obs}` `` in `DirectToPage`).
- The status line also drives the annunciator `sensors.out.setMessageLight` (flashing or steady). It special-cases
  `"SET 0"` (blank mode and right name, 3-7).

### MessagePage (`controls/MessagePage.tsx`)

- A `SixLinePage` overlay. It builds pages from `messageHandler.getMessages()` (newest first, at most 6 lines per page)
  and marks the messages of a page `seen` when that page is shown, so a page the pilot never saw stays unread.
- `msg()` goes to the next page, popping at the end. `enter()` jumps to `Apt1Page` of the nearest airport (emergency
  nearest).
- Messages are added by services with `messageHandler.addMessage(new OneTimeMessage([...lines]))`.

### Waypoint ENT-confirmation flow (`controls/editors/WaypointEditor.tsx`, manual 3-14/3-15/3-28)

1. Props: `{...props, value, enterCallback, parent: this, pageSite?, offerCreation?}`. `parent` is the hosting half
   page, used for stack parenting. `pageSite` is the side where `DuplicateWaypointPage` appears. `offerCreation` is set
   only by `FlightplanListItem` (every FPL page) and `DirectToPage` (#262, step 9).
2. Inner knob → enter edit mode. Each char change runs `onCharChanged()`, which auto-completes the remaining chars from
   the first `searchByIdentWithIcaoStructs` match (3-14).
3. ENT → `convertToValue` → `findNearestFacilitiesByIdent`, filtered to exact ident matches:
    - none → `NO SUCH WPT`, or the creation page of step 9 when `offerCreation` is set;
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
   `callingEditor` and, when that editor is the right page's focused field (the REF field of SUP or INT), moves the
   right cursor on to the next field (#284).
7. Turning the inner knob or typing while waiting → `cancelAwaitingConfirmation()` (3-28). Outer knob is blocked while
   waiting. CLR → `confirmValue(null)`, which clears. When the editor is on the right side (REF of INT/SUP, the VNAV
   waypoint of NAV 4) the right page is the confirm page, which has no cursor: `WaypointConfirmPage.hasOpenEntry()`
   makes it take CLR first and `clear()` hands the key to the editor (#359). The REF to FPL confirmation keeps its
   CLR on the left: `FplPage.clear()` asks `EditableFlightplan.rejectRefApproval()` first, which rejects the waiting
   waypoint, because the focused row is not necessarily the waiting one. It reads the state of the rows
   (`FlightplanListItem.isAwaitingRefApproval()`) and lets CLR through once the row was re-entered (3-28) (#291). An
   editor with `clearBlanks: false` (the SET 1 ident) closes the edit instead and keeps the old value (#244).
8. Alternate method (3-15): ENT on a non-entered editor while a waypoint page is shown on the right adopts that
   waypoint.
9. Creation of an unknown ident (#262, 4-2, 5-16): with `offerCreation`, ENT on an ident in no database pushes
   `SupPage.createWaypointPage(props, {ident, onCreated})` on the right, with the editor's `parent` as its parent. The
   ident and the callback are a constructor argument, not props, so they do not reach the pages the SUP page's REF
   editor pushes. That page is in its CREATE NEW WPT AT: state, with the right cursor over USER POS?, and leaves
   `memory.supPage` alone. The editor stays entered and keeps the typed ident. While its creation page is on the right
   stack (`MainPage.isInRightStack`: shown, or covered by the REF approval or duplicate list it pushed, 5-19),
   `isEnterAccepted()` is false and `enter()` returns `Not_Handled`, so `handleEnter` passes ENT to the right side.
   Once the SUP page has stored the waypoint (not on USR DB FULL) it calls `onCreated`; the editor pops the creation
   page and runs `confirmValue` for the new waypoint, so its normal approval (step 4) follows. CLR on the left (the
   left has the open entry, so it takes CLR first) goes to the right page first when that page holds an open entry (a
   latitude being typed, a REF waypoint waiting for approval); otherwise it pops the creation page with the pages above
   it and leaves the field blank and not entered. `FlightplanListItem.clear` then ends the insert with
   `onInsertDone(idx, null, null)`. The inner knob, typing, turning the cursor off and leaving the page
   (`setEntered(false)`) pop the creation page too. The pages the editor pushes get `offerCreation: false`, so the REF
   editors of SUP and INT keep `NO SUCH WPT`.
10. `confirmCurrentValue()` starts confirmation directly. Used by `DirectToPage` (pre-filled from: the FPL 0 cursor
   waypoint → the Super NAV 5 target → the right waypoint page → the active waypoint, or the missed approach on a MAP
   FROM leg → blank) and by FPL inserts from the REF page (`FplWptEnterMode.CONFIRM`); the left cursor stays on until
   the approval or rejection (#291).

### Dynamic lists pattern (FPL, OTH, APT 7/8)

- Rebuild the item array, wrap it in `UIElementChildren.forList(items)`, then call `list.refresh(children)` *and*
  `cursorController.refreshChildren(children)`. Then `focusIndex()` if needed.
- `FplPage` creates its `CursorController(NO_CHILDREN)` first and passes it into `FlightplanList.build(...)`, which
  refreshes it.
- Newly inserted rows carry `enterMe: FplWptEnterMode` (`ROTATE_LEFT`, `ROTATE_RIGHT`, `ENTER`, `CONFIRM`, `KEYBOARD`)
  so the new row is auto-entered after the rebuild. A row marked `focusMe` gets the cursor after the rebuild; the room
  question of an FPL 0 insert uses it before it repeats the knob, key or ENT (#380).
- FPL 0 keeps the active leg in view (4-8), with the from waypoint on the page also when a procedure header lies between
  it and the active waypoint (figure 6-43; a Direct To has no from waypoint, #239). `getVisibleLegsIndices()` feeds the
  D/T pages.
- `List.refresh` resets the scroll offset to the top. `FlightplanList.refresh` keeps it over a rebuild, clamped so that
  the last waypoint stays in the last row, so an insertion leaves the page where it was (#319).

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
4. Keep any state that must survive re-selection in `VolatileMemory` (`kln90b/data/VolatileMemory.ts`), because the
   instance is recreated on every knob step, and reset it in `reset()`. State that the unit keeps over a power cycle is a
   user setting (`userSettings`) instead (#192).
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
- `.keyboard` (invisible full-screen input). `.errorpage` styles the JS error overlay, and the panel.xml error overlay
  `.panelxmlerrorpage` shares its look.
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
    - comments flag values that no manual page gives: the map scales of NAV 5 and Super NAV 5 are `MAP_RANGES`
      (`data/MapRanges.ts`), where 3-35 gives only the end points, 1 and 1000 NM, and the steps between are those of
      the AVsoftech KLN 90B trainer (unreliable), which the maintainer adopted (#236). A saved range that is not in the
      list loads as 40 NM (`knownMapRange`, the default of both settings).
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
