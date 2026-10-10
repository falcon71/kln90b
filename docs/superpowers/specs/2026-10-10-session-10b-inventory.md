# Session 10b inventory of test code copies

Read-only research on branch `tests-session-10b-audit` (tree at `30b4a9c`), 2026-10-10. Input: sections 3, 4 and 5 of
`docs/superpowers/specs/2026-10-09-session-10b-findings.md` and section 4 of `docs/testing.md`. Every line number below was
read from the tree and checked against the file; the audit's counts were not trusted. Paths are relative to the repo root,
`test/harness/**` is the harness itself and is not listed as a user.

Ids: H1 to H13 are the helper items of section 5 of the findings, D4 and D5 the debt items of section 3, S4 the section 4
stragglers. Summary of results:

- **panel.xml tags (H1):** no misspelled tag and no wrong nesting was found in any test; the parser key set in
  `kln90b/settings/KLN90BPlaneSettings.ts` covers every tag the tests use. Several constants set a value that equals the parser
  default (listed under H1), so they cannot detect a misspelling later; and `AltitudeAlertEnabled` defaults to true in the code
  while #141 wants false.
- Audit counts that differ from the tree: H8 (13 files carry the sequence and more than three assert the overlay), H9 (the
  five `Tri5Page` sites that match the store pattern use `meridianRoute()`, not the standard route; the ABC-active assertion is
  in more files than NavCalculator and RollSteeringController), H13d (`sim.writeCount` does not exist yet, it is only proposed at
  `docs/testing.md:854`), H6/H10 (the readers are in about 30 and 35 render and flight files), D4 (68 bare calls in this scan
  including `test/harness/boot.ts:307`, against 66 in the audit).
- Method limits: greps over `test/` (350 `.ts` files) with several patterns per helper, then reading each site; a site that
  builds a panel.xml or reads idents through a name this scan did not think of could be missed. The unit-stage files are listed
  only where an item names them.

## H1. panel.xml builder and presets

Parser reference (`kln90b/settings/KLN90BPlaneSettings.ts:60-87`): `getOption` walks the dotted path with
`getElementsByTagName` per segment, starting at the `<Instrument>` whose `<Name>` is `KLN90B`. A missing tag, a tag
without its parent (`<ObsSource>` outside `<Input>`) or an unparsable value falls back silently to the default.
Defaults: VFROnly false, AltimeterInterfaced true, ObsSource 1, HeadingInput false, ElectricitySimVar "", Airdata
IsInterfaced false / BaroSource 0, FuelComputer IsInterfaced false / Unit GAL / Type Avgas / FOBTransmitted true /
FuelUsedTransmitted true, LegObsSwitchInstalled false, AppArmSwitchInstalled false, ObsTarget 0,
AltitudeAlertEnabled **true** (the code default; #141 says it should be false and is an `it.fails` pin at
`test/unit/settings/KLN90BPlaneSettings.test.ts:187`), WriteGPSSimVars true. `TakeHomeMode` is parsed but no test sets it.

**Tag check (the IMPORTANT item).** Every tag name found in every panel.xml string in `test/` (all files below plus
the parser test) is in the parser's key set, and every one sits under the parent the parser expects (`Input.*`,
`Output.*`, `Input.Airdata.*`, `Input.FuelComputer.*`, `Input.ExternalSwitches.*`, `VFROnly` directly under
`Instrument`). **No misspelled or wrongly nested tag was found.** Method: a grep of every `<Tag>` token in all files
that mention `PlaneHTMLConfig`, `panelXml` or `<Instrument>`, minus the parser's key set (empty result), plus reading
each builder's nesting by hand. The strings are well-formed XML in every builder (checked by reading; a malformed
document would also parse to defaults, so the harness test should parse each preset). Residual risks, not typos:

- Values equal to the parser default cannot show that the tag is read at all: `test/render/harness/sounds.test.ts:5`
  (`AltitudeAlertEnabled` true), `test/render/pages/left/Set9Page.test.ts:47` (`panelXml(true)`),
  `test/render/data/Messages.test.ts:88` (`FOBTransmitted` true), `test/render/pages/left/Oth8Page.test.ts:6`
  (`fuelXml(true)`, `FuelUsedTransmitted` true), `Oth9Page.test.ts:7` (`HeadingInput` false when the parameter is false).
  When #141 flips the default of `AltitudeAlertEnabled`, every test that omits the key and relies on the alert being
  on changes; a preset for "alert on" must set it explicitly.
- `test/render/harness/selfTestBoot.test.ts:6` and `sounds.test.ts:5` name the same tag with opposite values in two
  constants (`ALERT_OFF_XML`, `ALERT_ON_XML`).
- `OBS_SOURCE_OFF` (many constants) and `OBS_SOURCE_0` (`SuperNav5Page.test.ts:557`) are one value under two names.

### Files with a panel.xml string or builder

| file | lines | what it builds / tags and values |
|---|---|---|
| test/flight/harness/monitor-finite.test.ts | 9, 14 | `PANEL_XML`: Output.WriteGPSSimVars=false |
| test/render/controls/selects/FuelFieldset.test.ts | 102-104 | `FUEL_XML`: Input.FuelComputer.IsInterfaced=true |
| test/render/controls/selects/ObsDtkElement.test.ts | 16-17 | `OBS_SOURCE_OFF`: Input.ObsSource=0 (also imports MINIMAL_PANEL_XML at 2, 68, 79) |
| test/render/controls/StatusLine.test.ts | 136-137 | inline: Input.ObsSource=0 |
| test/render/controls/SuperNav5Left.test.ts | 18-19 | `OBS_SOURCE_OFF`: Input.ObsSource=0 |
| test/render/data/flightplan/ActiveWaypoint.test.ts | 137 | `OBS_SOURCE_OFF` inside a describe: Input.ObsSource=0 |
| test/render/data/Messages.test.ts | 22-23, 68, 77, 88, 99 | `panelXml(input)` (input only): FuelComputer IsInterfaced true/false + FOBTransmitted false/true |
| test/render/data/navdata/AirspaceAlert.test.ts | 272 | `noAltitude` inline: Input.AltimeterInterfaced=false |
| test/render/data/navdata/KLNMagvar.test.ts | 90 | `OBS_SOURCE_OFF` inside a describe: Input.ObsSource=0 |
| test/render/data/PersistentMessages.test.ts | 11-12, 18, 35, 46 | `panelXml(input)` (input only): AltimeterInterfaced=false (18), + Airdata.IsInterfaced=true (46); line 35 is a third local form, inline: VFROnly=true + AltimeterInterfaced=false |
| test/render/harness/pageTree.test.ts | 7-8, 23, 30 | `FUEL_COMPUTER_PANEL_XML` (FuelComputer.IsInterfaced), `AIRDATA_AND_FUEL_PANEL_XML` |
| test/render/harness/power.test.ts | 70, 98-99 | inline: VFROnly=true; inline: ExternalSwitches.LegObsSwitchInstalled=true |
| test/render/harness/selfTestBoot.test.ts | 6-7 | `ALERT_OFF_XML`: Output.AltitudeAlertEnabled=false |
| test/render/harness/simVars.test.ts | 4-5 | `FUEL_COMPUTER_XML`: FuelComputer.IsInterfaced=true |
| test/render/harness/sounds.test.ts | 5-6 | `ALERT_ON_XML`: Output.AltitudeAlertEnabled=true (the parser default) |
| test/render/pages/left/AltPage.test.ts | 69-70, 140-141 | inline: Airdata IsInterfaced=true + BaroSource=1; inline: AltitudeAlertEnabled=false |
| test/render/pages/left/Cal3Page.test.ts | 9 | `HEADING_INPUT_XML`: Input.HeadingInput=true |
| test/render/pages/left/DirectToObs.test.ts | 12-13, 44, 97, 124 | `panelXml(input, output = '')` (input and output): ObsSource=0; line 124 also Output.ObsTarget=1 |
| test/render/pages/left/Mod1Page.test.ts | 57-58 | `LEG_OBS_SWITCH`: ExternalSwitches.LegObsSwitchInstalled=true |
| test/render/pages/left/Mod2Page.test.ts | 9, 11-12, 161 | `panelXml(input)` (input only); `OBS_SOURCE_OFF` (ObsSource=0); `LEG_OBS_SWITCH`; line 161 inline Output.ObsTarget=1 |
| test/render/pages/left/Nav3Page.test.ts | 46 | `OBS_SOURCE_OFF` (also imports MINIMAL_PANEL_XML at 2, 106) |
| test/render/pages/left/Nav4Page.test.ts | 14 | `NO_ALTITUDE_INPUT`: AltimeterInterfaced=false |
| test/render/pages/left/Nav5Page.test.ts | 185 | `HEADING_INPUT_XML` (declared at 185, used 419, 431) |
| test/render/pages/left/Oth10Page.test.ts | 6-9 | `AIRDATA_XML`: Airdata.IsInterfaced + FuelComputer.IsInterfaced |
| test/render/pages/left/Oth5Page.test.ts | 8-10, 31-35 | `FUEL_PANEL_XML` (FuelComputer.IsInterfaced) and `fuelXml(fuel = '')` (fuel = inner XML after IsInterfaced, e.g. FOBTransmitted false at 123) |
| test/render/pages/left/Oth6Page.test.ts | 5-7 | `FUEL_PANEL_XML` (byte-identical to Oth5's) |
| test/render/pages/left/Oth7Page.test.ts | 6-10, 71 | `fuelXml(unit?)`: parameter is the Unit tag (LB at 71) |
| test/render/pages/left/Oth8Page.test.ts | 6-10 | `fuelXml(fuelUsedTransmitted: boolean)`: parameter is FuelUsedTransmitted |
| test/render/pages/left/Oth9Page.test.ts | 6-14 | `airdataXml(headingInput: boolean)`: HeadingInput + Airdata + FuelComputer |
| test/render/pages/left/SelfTestLeftPage.test.ts | 33, 142, 186-187 | `HEADING_INPUT_XML`; inline ObsSource=0; `OBS_TARGET_XML` (Output.ObsTarget=1) |
| test/render/pages/left/Set5Page.test.ts | 133-134 | inline: AltitudeAlertEnabled=false |
| test/render/pages/left/Set9Page.test.ts | 6-7 | `panelXml(alertEnabled: boolean)`: AltitudeAlertEnabled=boolean |
| test/render/pages/left/SuperNav5Page.test.ts | 16, 557 | `HEADING_INPUT_XML`; `OBS_SOURCE_0` inside a describe |
| test/render/pages/ObsWarningPage.test.ts | 8-12 | `VFR_ONLY`, `OBS_SWITCH`, `panelXml(...parts)` (parts go straight under `<Instrument>`, so the parts carry their own `<Input>`) |
| test/render/pages/PageTreeController.test.ts | 13-17 | `panelXml({airdata?, fuel?})` |
| test/render/pages/right/SelfTestRightPage.test.ts | 245-246, 275-276, 309-310 | `AIR_DATA_BARO_XML` (Airdata IsInterfaced + BaroSource=1), `NO_ALTITUDE_ALERT_XML`, `NO_ALTIMETER_XML` |
| test/render/pages/VFROnlyPage.test.ts | 8-11 | `VFR_ONLY`, `panelXml(...parts)` (same builder as ObsWarningPage) |
| test/render/PowerButton.test.ts | 72 | inline: Input.ElectricitySimVar=CIRCUIT ON:1 |
| test/render/SensorsOut.test.ts | 8, 217 | `NO_GPS_SIMVARS_XML`; `HEADING_INPUT_XML` inside a describe |
| test/render/SensorsOutSimVars.test.ts | 43, 355-356 | `obsPanelXml(target)` inside a describe (Output.ObsTarget); inline LegObsSwitchInstalled=true |
| test/render/services/KlnEfbLoader.test.ts | 190 | `panelXml` local: Output.WriteGPSSimVars=false |
| test/render/services/KlnEfbSaver.test.ts | 214 | `panelXml` local: Output.WriteGPSSimVars=false |
| test/render/services/ModeControllerObs.test.ts | 15-17 | `OBS_SOURCE_OFF`, `LEG_OBS_SWITCH` |
| test/render/services/RollSteeringController.test.ts | 7 | `HEADING_INPUT_XML` |
| test/render/services/WTFlightplanSync.test.ts | 31 | `NO_GPS_SIMVARS_XML` |
| test/render/SimVarSync.test.ts | 10-11, 114 | `xml(inner)` (inner goes under `<Instrument>`); `CIRCUIT_XML`; inline L:MY_AVIONICS_BUS |
| test/unit/settings/KLN90BPlaneSettings.test.ts | 50, 68, 98-117 | the parser's own test (`kln(inner)`, per-key `it.each`); it is the model for the harness test of the presets, not a copy to replace |

Imports of `MINIMAL_PANEL_XML` only (not a copy): `test/render/KLN90BCore.init.test.ts:3,29`,
`test/render/controls/selects/ObsDtkElement.test.ts:2`, `test/render/pages/left/Nav3Page.test.ts:2`. The sample file
`cfg/panel.xml` is read by `KLN90BCore.init.test.ts` (`SAMPLE_PANEL_XML`).

### Distinct (key, value) pairs and the files that use them

| key path | value | files | which |
|---|---|---|---|
| Input.ObsSource | 0 | 11 | StatusLine, SuperNav5Left, ObsDtkElement, ActiveWaypoint, KLNMagvar, DirectToObs, Mod2Page, Nav3Page, SelfTestLeftPage, SuperNav5Page, ModeControllerObs |
| Input.HeadingInput | true | 7 | SensorsOut, Cal3Page, Nav5Page, SelfTestLeftPage, SuperNav5Page, RollSteeringController, Oth9Page (param true/false) |
| Output.WriteGPSSimVars | false | 5 | monitor-finite, SensorsOut, KlnEfbLoader, KlnEfbSaver, WTFlightplanSync |
| Input.ExternalSwitches.LegObsSwitchInstalled | true | 6 | SensorsOutSimVars, harness/power, ObsWarningPage, Mod1Page, Mod2Page, ModeControllerObs |
| Input.AltimeterInterfaced | false | 4 | PersistentMessages, AirspaceAlert, Nav4Page, SelfTestRightPage |
| Output.AltitudeAlertEnabled | false / true | 6 | selfTestBoot (false), sounds (true), AltPage (false), Set5Page (false), Set9Page (both), SelfTestRightPage (false) |
| Input.FuelComputer.IsInterfaced | true (false once in Messages) | 11 | FuelFieldset, Messages, pageTree, simVars, PageTreeController, Oth5..Oth10 |
| Input.FuelComputer.FOBTransmitted | false (true once) | 2 | Messages, Oth5Page |
| Input.FuelComputer.FuelUsedTransmitted | true / false | 1 | Oth8Page |
| Input.FuelComputer.Unit | LB (GAL when absent) | 1 | Oth7Page |
| Input.Airdata.IsInterfaced | true | 7 | PersistentMessages, pageTree, PageTreeController, AltPage, Oth9Page, Oth10Page, SelfTestRightPage |
| Input.Airdata.BaroSource | 1 | 2 | AltPage, SelfTestRightPage |
| VFROnly | true | 4 | VFROnlyPage, ObsWarningPage, PersistentMessages, harness/power |
| Output.ObsTarget | 1 | 4 | Mod2Page, SelfTestLeftPage, SensorsOutSimVars (param), DirectToObs |
| Input.ElectricitySimVar | CIRCUIT ON:1, L:MY_AVIONICS_BUS | 2 | PowerButton, SimVarSync |
| Input.ExternalSwitches.AppArmSwitchInstalled | no test sets it outside the parser test | 0 | - |
| BasePath, Type, ObsSource 2, BaroSource 2, Unit KG, ... | | parser test only | KLN90BPlaneSettings.test.ts |

Combinations seen together: ObsSource=0 + ObsTarget=1 (DirectToObs:124); VFROnly + LegObsSwitchInstalled
(ObsWarningPage); VFROnly + AltimeterInterfaced=false (PersistentMessages:35); AltimeterInterfaced=false + Airdata
(PersistentMessages:46); Airdata + FuelComputer (Oth9, Oth10, PageTreeController, pageTree); HeadingInput + Airdata +
FuelComputer (Oth9).

### Drift between the local builders

Signatures: input only (Messages, PersistentMessages, Mod2Page); input and output (DirectToObs); `...parts` under
Instrument (VFROnlyPage, ObsWarningPage); `inner` under Instrument (SimVarSync); `{airdata, fuel}` (PageTreeController);
boolean for the alert (Set9Page); `fuelXml` with three different meanings of its parameter (Oth5: inner XML after
IsInterfaced; Oth7: the Unit text; Oth8: a boolean for FuelUsedTransmitted). Duplicated constants: `FUEL_PANEL_XML` in
Oth5 and Oth6; `HEADING_INPUT_XML` in seven files; `NO_GPS_SIMVARS_XML` in SensorsOut and WTFlightplanSync, with the
same string inline in monitor-finite, KlnEfbLoader and KlnEfbSaver.

## H2. readMessages (read every message off the MSG page)

Pattern: `await unit.panel.msg()`, then `for (i < 10 && Screen.read().status().left === '') await unit.panel.msg()`, then
`advanceTimersByTimeAsync(1000)`, then a check that nothing is left. The status line's left field is `''` while the
MSG page is shown, so the loop ends when the page closed. The audit's count of six files is confirmed; the table lists
each copy and the near-copies (fixed numbers of presses) that the helper could also serve.

| file | lines | note |
|---|---|---|
| test/render/controls/MessagePage.test.ts | 36-43 (`readAll`), used 63, 80 | **no check that the page closed** (the loop can run ten presses and fall through); end check `getMessages()` toEqual `[]` after the 1000 ms wait |
| test/render/data/Messages.test.ts | 12-19 (`readAll`), used 31, 44, 102 | asserts the page closed (`status().left` not `''`, line 17); end check `messages(unit)` toEqual `[]` |
| test/render/controls/StatusLine.test.ts | 119-125 (`readBootMessages`), used 223 | **no closed check**; end check `hasMessages()` false |
| test/render/controls/StatusLine.test.ts | 62-69 (inline) | presses `KLN90B_MSG_Push` raw (`unit.panel.press`), three fixed presses at 36-38 and a loop at 66; asserts the page closed (line 69); precondition asserts the ADJ NAV IND CRS message is on the page |
| test/render/controls/StatusLine.test.ts | 206-212 (inline) | uses `panel.msg()`, **no closed check**; end check: `getMessages()` equals the single ADJ message and `hasUnreadMessages()` false (the persistent message stays, so the helper must allow messages left) |
| test/render/harness/screen.test.ts | 165-171 | asserts the page closed (169, "precondition"); then adds a message; no empty-list check |
| test/render/pages/MainPage.test.ts | 288-293 (`closeMsgPage`), used 317 | different condition: `overlay(unit) instanceof MessagePage`, at most three presses, no throw if it stays open; the MSG page is the subject there, so it is probably not a candidate for the helper, but is the same idea |
| test/render/controls/SuperNav5Left.test.ts | 138-141 | fixed two presses ("the two boot messages fit one MSG page; the second press closes it"), wait 1000, `hasMessages()` false precondition |
| test/render/controls/StatusLine.test.ts | 36-38 | fixed three raw presses after `settle` (is dark once all messages are read) |
| test/render/data/navdata/AirspaceAlert.test.ts | 126-128, 206-208 | fixed two presses with a 1000 ms wait between; reads one alert, not the boot messages |

Drift: three different end checks (`getMessages()` empty, `hasMessages()` false, `messages(unit)` empty); only
Messages.test.ts and screen.test.ts and the StatusLine:66 copy assert the page closed; the waits are all 1000 ms. The
StatusLine:206 copy must tolerate one persistent message left, so the helper cannot always assert `getMessages()` empty.
Other tests only press MSG once to look at the page (NearestSelector.test.ts:19, NearestList.test.ts:28,
Apt1Page.test.ts:50/240/384/428, airspaces.test.ts:25/38, userDataConversion.test.ts:102/114, PersistentMessages.test.ts:64,
HEvents.test.ts:236/246 raw): those are the MSG-then-ENT nearest idiom or a single look and are not copies.

## H3. userWaypoints(unit, type?)

The facility repository is reached by two paths: `KLNFacilityRepository.getRepository(unit.props.bus)` and
`unit.props.facilityRepository` (the same object). `forEach(fn, types?)` takes an optional list of `FacilityType`s;
the user waypoints are stored in per-type maps keyed by the type in the ICAO, so a `[FacilityType.USR]` filter sees only
the supplementary (`U`) waypoints, not user airports, VORs, NDBs or intersections.

| file | lines | filter | access path | note |
|---|---|---|---|---|
| test/render/services/TemporaryWaypointDeleter.test.ts | 16-19 (`userWaypoints`) | USR | getRepository(bus) | returns `"ident region"` sorted |
| test/render/pages/right/Ctr1Page.test.ts | 271-277 (`userWaypoints`, inside a describe) | USR | props.facilityRepository | returns `"ident region"` sorted |
| test/render/pages/right/RefNaming.test.ts | 22 (inside a function) | USR | getRepository(bus) | returns `region:ident` in repository order (not sorted) |
| test/render/services/KlnEfbLoader.test.ts | 50, 284 | USR | getRepository(bus) | tuples `[ident, region, lat, lon]` and idents only |
| test/render/pages/right/IntPage.test.ts | 83-87 (`userWaypoints`), used 397 to 565 | none | getRepository(bus) | tuples `[type, region, ident, lat, lon]`; all types |
| test/render/pages/right/NdbPage.test.ts | 16-20 (`userWaypoints`), used 232, 247 | none | getRepository(bus) | tuples with `freqMHz` (`as any`) |
| test/render/pages/right/VorUserWaypoint.test.ts | 28-32 (`userWaypoints`), used 37 to 152; positions inline at 43 | none | getRepository(bus) | tuples `[region, ident, type]`; the `.filter(ident === QQQ)` at 152 |
| test/render/controls/WaypointDeleteListItem.test.ts | 21-25 (`userIdents`) | none | props.facilityRepository | idents sorted; includes the boot facilities if any were stored |
| test/render/harness/reboot.test.ts | 58-61 | none | props.facilityRepository | whole facilities, compared to `[]` |
| test/render/controls/editors/DistanceEditor.test.ts | 39-45 (`qqiLat`) | none | getRepository(bus) | single lookup by ident QQI |
| test/render/controls/editors/NdbFreqEditor.test.ts | 26-32 (`qqnFreq`) | none | getRepository(bus) | single lookup by ident QQN |
| test/render/controls/editors/RadialEditor.test.ts | 37-43 (`qqi`) | none | getRepository(bus) | single lookup by ident QQI |
| test/render/controls/editors/VorFreqEditor.test.ts | 26-32 (`qqvFreq`) | none | getRepository(bus) | single lookup by ident QQV |
| test/render/services/KeyboardService.test.ts | 35-42 (`storedLongitudes`) | region `XX` in the callback | getRepository(bus) | a third meaning: the region filter, no type filter |
| test/render/KLN90BCore.userDataConversion.test.ts | 118 | none | getRepository(bus) | `.get(ICAO.value(...))` by key, not a reader loop |
| test/render/data/navdata/NearestList.test.ts | 270, 347 | | getRepository(bus) | **writes** (`.add`) a user NDB or VOR, not a read |
| test/render/pages/right/IntPage.test.ts | 68 | | getRepository(bus) | **writes** a user VOR |
| test/render/pages/right/SupPage.test.ts | 84, 430, 443 | | getRepository(bus) | `.get`/`.size()` lookups, not a reader loop |

Unit-stage readers that build their own repository (`repo.forEach(f => all.push(f))`), not replaced by a `unit`-based
helper: `test/unit/settings/UserWaypointPersistor.test.ts:59`, `UserWaypointV1.test.ts:23`, `UserWaypointV2.test.ts:29`,
`test/unit/data/navdata/KLNFacilityRepository.test.ts:118`.

Drift in meaning: the USR-filtered copies (TemporaryWaypointDeleter, Ctr1Page, RefNaming, KlnEfbLoader) see only the
`U` waypoints; the unfiltered copies (IntPage, NdbPage, VorUserWaypoint, WaypointDeleteListItem, reboot) see user
airports, VORs, NDBs and intersections too; KeyboardService filters on region XX instead. Return shapes differ (strings,
tuples, whole facilities).

## H4. messages(unit)

Identical `const messages = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '))`:

| file | line | note |
|---|---|---|
| test/render/data/Messages.test.ts | 9 | |
| test/render/data/navdata/AirspaceAlert.test.ts | 48 | |
| test/render/data/navdata/KLNMagvar.test.ts | 12 | |
| test/render/data/PersistentMessages.test.ts | 9 | |
| test/render/GpsAcquisition.test.ts | 27 | the copy the StartupPages split joined |
| test/render/pages/left/Nav4Vnav.test.ts | 53 | |
| test/render/pages/left/Set1Page.test.ts | 175 | inside a describe |
| test/render/pages/left/Set2Page.test.ts | 102 | module level; line 35 is an inline form (below) |
| test/render/pages/right/Apt8Page.test.ts | 61 | renamed `messageList` |
| test/render/services/KlnEfbLoader.test.ts | 70 | renamed `messageTexts` |

Inline forms (the same map, not named): `test/render/data/flightplan/FlightplanEdit.test.ts:63,76`
(`toContain('USER DATA LOST')`), `test/render/controls/StatusLine.test.ts:213`, `test/render/data/navdata/NavCalculator.test.ts:45`
(keeps the line arrays, `m.message`), `test/render/pages/left/Set2Page.test.ts:35` (arrays, cast to `OneTimeMessage`),
`test/render/services/ModeControllerObs.test.ts:383` (arrays inside a local helper),
`test/render/controls/MessagePage.test.ts:42,99,111` (first line only, `m.message[0]`). Unit-stage forms on a bare
`MessageHandler` (no `unit`): `test/unit/services/Flightplanloader.test.ts:32` (`messagesOf`, joins with `|`),
`test/unit/settings/UserFlightplanLoaderV2.test.ts:71,82` (arrays), `test/unit/data/navdata/Database.test.ts:79` (`posted`).
No drift among the ten named copies (all join with a space); the arrays variants return `string[][]` and keep the
line structure, which a `messages(unit)` returning joined strings would lose, so the helper may need a second
form (`messageLines`).

## H5. Full-page readers (`inverseText`, `pageRows`, `approveSelfTestPage`, `expectVfrPage`)

| file | lines | what |
|---|---|---|
| test/render/pages/AiracPage.test.ts | 11-17 `approveSelfTestPage`, 19-20 `pageRows`, 22-28 `inverseText`; used 35 to 68 | |
| test/render/pages/VFROnlyPage.test.ts | 12-18 `approveSelfTestPage`, 20-21 `pageRows`, 23-29 `inverseText`, 32-40 `expectVfrPage` (inside the describe); used 45 to 61 | `approveSelfTestPage` and `pageRows` and `inverseText` byte-identical to the AiracPage copies |
| test/render/pages/ObsWarningPage.test.ts | 14-15 `pageRows`, 17-24 `expectVfrPage` (module level); used 39, 48 | `expectVfrPage` identical to the VFROnlyPage one; this file has no `approveSelfTestPage`: it boots with `bootToSelfTest` and presses `cursorTo('R', 'APPROVE?')` then ENT inline at 33-37, because it sets `GPS OBS ACTIVE` between the boot and the approval |
| test/render/pages/left/Set0Page.test.ts | 5-8 `rows()` | the same read with `trimEnd` instead of `trim` (SET 0 has no right half): a drift in what is trimmed |
| test/render/pages/left/SuperNav1Page.test.ts | 49 `pageRows` | **different meaning**: the six untrimmed rows of the page via `Screen.read().row(i)`; same name as the H5 helper, so a rename is needed if H5 is called `pageRows` |

Related inline mask readers (not copies of `inverseText`, but the same `mask().split('\n')[n]`):
`test/render/controls/StatusLine.test.ts:86`, `test/render/controls/MessagePage.test.ts:19`,
`test/render/pages/left/Set0Page.test.ts:79`, `test/render/pages/CursorController.test.ts:7`,
`test/render/controls/editors/FreetextEditor.test.ts:54`, `test/render/harness/screen.test.ts:366`. Other full-page
text reads that the helper `pageRows` does not replace (different slices, they test the screen reader itself):
`FreetextEditor.test.ts:29,34`, `power.test.ts:16`, `screen.test.ts:24,63,78,153,174`, `WelcomePage.test.ts:25,78`,
`KLN90BCore.userDataConversion.test.ts:104,116`, `AirspaceAlert.test.ts:88`.

## H6. fplIdents(unit, idx = 0)

The read is always `unit.props.memory.fplPage.flightplans[i].getLegs().map(l => l.wpt.icaoStruct.ident)`. Named
helpers first, then the inline forms. "(ident,type)" means `[l.wpt.icaoStruct.ident, l.type]` pairs (needs a second
helper or an option), "filtered" means a `.filter` before the map (not the same read).

### Named helpers (render and flight stage)

| file | lines | form |
|---|---|---|
| test/flight/flights/dmeArc.test.ts | 60 (`legIdents(flight)`), used 73 | takes a `Flight`, FPL 0 |
| test/render/controls/editors/WaypointEditor.test.ts | 275-276 (`fpl0`, inside a describe) | FPL 0 |
| test/render/controls/FlightplanList.test.ts | 15-16 (`idents(unit, fpl)`) | any FPL |
| test/render/controls/selects/SuperNav5DirectToSelector.test.ts | 33 (`fpl0Idents`), used 45, 80 | FPL 0; line 76-77 reads the first leg only (`const [entry] = ...getLegs()`) |
| test/render/data/flightplan/FlightplanEdit.test.ts | 17 (`legIdents`), used 97-152 | FPL 0 |
| test/render/data/navdata/NavCalculator.test.ts | 12-13 (`fpl0` returns legs, `idents` maps them) | FPL 0; also inline 313-314 |
| test/render/harness/procedures.test.ts | 13-14 (`fpl0` legs, `idents(unit, type)` **filtered** by `KLNLegType`) | not the plain read; inline forms at 56, 60, 115, 155, 208 |
| test/render/pages/left/FplPage.test.ts | 23 (`idents(unit, fpl)`) | any FPL |
| test/render/pages/right/Apt7Page.test.ts | 60 (`fpl0Legs`, used 78 to 582) | (ident,type); inline plain read at 53 |
| test/render/pages/right/Apt8Page.test.ts | 60 (`fpl0Legs`, used 101 to 242) | (ident,type); inline plain read at 53 |
| test/render/pages/right/Ctr1Page.test.ts | 12 (`idents(unit, fpl)`) | any FPL |
| test/render/pages/right/RefPage.test.ts | 79 (`idents(unit, idx)`) | any FPL |
| test/render/services/KlnEfbLoader.test.ts | 69 (`fpl0Idents`, used 99 to 275) | FPL 0; inline at 30-32 (`.map(l => l.wpt)` then idents), 281 (`ICAO.valueToStringV2`, a different read) |
| test/render/services/KlnEfbSaver.test.ts | 13 (`fpl0Idents`, used 35 to 221) | FPL 0 |
| test/render/services/WTFlightplanSync.test.ts | 29 (`klnIdents`), 27 (`identsOf(plan)`) | `klnIdents` is the FPL 0 read; `identsOf` reads an SDK `FlightPlan` (`l.leg.fixIcaoStruct.ident`), a different thing; inline `fpl1...` read at 135 |
| test/render/pages/right/ActPage.test.ts | 360 (plain), 459 (ident,type), 63-64 (`fpl0` the plan object, deletes legs) | inline |

### Inline forms (render and flight stage)

| file | lines |
|---|---|
| test/flight/harness/frontPanel.test.ts | 14, 28 |
| test/render/controls/PageContainer.test.ts | 168-169 (FPL 3) |
| test/render/data/flightplan/ActiveWaypoint.test.ts | 269 |
| test/render/data/VolatileMemory.test.ts | 96 plain; 85-86 (`procedureLegs`, filtered by `procedure !== undefined`) |
| test/render/harness/approachWorld.test.ts | 23-24 (also maps `fixType` at 26) |
| test/render/harness/efb.test.ts | 25-26, 39 |
| test/render/harness/insertLeg.test.ts | 17-19 (also maps `type`) |
| test/render/harness/reboot.test.ts | 34 |
| test/render/KLN90BCore.userDataConversion.test.ts | 120 (FPL 1) |
| test/render/pages/left/DirectToObs.test.ts | 161 |
| test/render/services/ModeController.test.ts | 219 |
| test/render/services/ModeControllerApproach.test.ts | 94 |
| test/render/services/ModeControllerObs.test.ts | 271, 328-329 |
| test/render/services/TemporaryWaypointDeleter.test.ts | 44, 59, 77 (FPL 3), 116, 174 |

Not the read: `FlightplanArrow.test.ts` and others only store plans. `flight.nav.activeIdent` (flight stage) is the
active waypoint, not the plan (H10).

### Unit stage (`identsOf(legs)` style on `Flightplan` objects built by the test)

| file | lines | form |
|---|---|---|
| test/unit/data/flightplan/ActiveWaypoint.test.ts | 146 (`identsOf(legs: KLNFlightplanLeg[])`), used 174, 195, 229; inline 175 | takes legs |
| test/unit/data/flightplan/Flightplan.test.ts | 15 (`idents(fpl)`) | takes a plan |
| test/unit/data/navdata/SidStar.test.ts | 303 (inside a describe), 510 (`idents(legs)`); inline (ident, fixType) pairs at 378, 385, 566, 617, 629, 643, 655, 682, 698, 743, 785 | takes legs |
| test/unit/services/Flightplanloader.test.ts | 33 (`identsOf(fpl)`) | takes a plan |
| test/unit/services/FlightplanUtils.test.ts | 135 (`identsOf(fpl)`), inline getFutureLegs reads 267, 280 | takes a plan |
| test/unit/settings/UserFlightplanLoaderV1.test.ts | 50, 64 plain; 74 (type, region, ident) | inline on `plans[i]` |
| test/unit/settings/UserFlightplanLoaderV2.test.ts | 56 (type, region, ident), 60, 70, 81 | inline on `plans[i]` |
| test/unit/settings/UserFlightplanPersistor.test.ts | 77 | inline on `plans[0]` |

Other `idents` lambdas that are **not** this read (search results or list rows): `test/unit/harness/navdata.test.ts:49`,
`test/unit/harness/nearestFilters.test.ts:9`, `test/unit/data/navdata/Scanlist.test.ts:196`,
`test/render/data/navdata/NearestList.test.ts:100`, `test/render/controls/WaypointDeleteListItem.test.ts:22`.
`test/unit/harness/worlds.test.ts:123,129` and `test/unit/harness/procedures.test.ts:25` read SDK procedure legs.

No drift in the read itself; the variants are the FPL index (0, any, 1, 3), the (ident, type) pair form, and
`identsOf`'s unit-stage input type (legs versus plan).

## H7. directTo(ident, {waitMs})

The sequence is `unit.panel.dct()`, `unit.panel.enterIdent('L', ident)`, `unit.panel.ent()` (the waypoint page of the
target, usually the APT 1 confirmation), `unit.panel.ent()` (approve), then a wait. Harness side: `FrontPanel.dct()` is
at `test/harness/flight/FrontPanel.ts:135`. Count of files with the full four-step sequence: 17 (audit confirmed).

### Full sequence (D->, ident, ENT, ENT)

| file | lines | wait after | note |
|---|---|---|---|
| test/render/controls/FlightplanList.test.ts | 189-192 | none | followed by `cursor('L')` (#82) |
| test/render/controls/editors/WaypointEditor.test.ts | 237-241 | 1000 | a second D-> at 243-247 types KSAT and stops at the confirmation page (partial) |
| test/render/data/flightplan/ActiveWaypoint.test.ts | 54-58 | 1000 | |
| test/render/data/navdata/NavCalculator.test.ts | 237-241 | 1000 | |
| test/render/pages/PageTreeController.test.ts | 131-135 | 1000 | |
| test/render/pages/left/Nav1Page.test.ts | 152-156 (`directToKddd`, local) | 1000 | |
| test/render/pages/left/SuperNav1Page.test.ts | 135-139 (`directToKddd`, local) | 1000 | same helper name and body as Nav1Page, in a second file |
| test/render/pages/left/Nav5Page.test.ts | 271-275 | 2000 | |
| test/render/pages/left/Oth3Page.test.ts | 160-164 | 1000 | |
| test/render/pages/left/SuperNav5Page.test.ts | 399-402, 455-459 | none (402: `moveAircraft` follows), 2000 (459) | |
| test/render/pages/right/ActPage.test.ts | 186-190 | 2000 | |
| test/render/pages/right/Dt1Page.test.ts | 94-98 (inside `directToOutsidePlan`) | 2000 | |
| test/render/pages/right/Dt2Page.test.ts | 102-106 (inside `directToOutsidePlan`) | 2000 | |
| test/render/pages/right/Dt3Page.test.ts | 174-178 (inside `directToOutsidePlan`) | 2000 | |
| test/render/pages/right/Dt4Page.test.ts | 99-103 (inside `directToOutsidePlan`) | 2000 | |
| test/render/services/ModeControllerApproach.test.ts | 201-205 | 1000 | |
| test/render/pages/left/DirectToPage.test.ts | 265-269 | 1000 | the page under test; most other D-> steps in this file are the subject itself |

Drift: the wait is 0 (FlightplanList, SuperNav5Page:402), 1000 (nine files) or 2000 (Nav5Page, SuperNav5Page:459, ActPage,
Dt1 to Dt4). Some call sites end after the first ENT (the confirmation page is the subject): `DuplicateWaypointPage.test.ts:22-26`
(one ENT, 500 ms), `WaypointConfirmPage.test.ts:162-165`, `DirectToPage.test.ts:403-404` (ident only).

### D-> then ENT only (the prefilled ident, no typing)

`ActiveWaypoint.test.ts:98-99, 191-192`, `DuplicateWaypoints.test.ts:26-27`, `FplPage.test.ts:137-138`,
`DirectToObs.test.ts:32-36 (+2000), 101-103, 115-117, 127-129, 147-148`, `VorUserWaypoint.test.ts:204-206`,
`ModeControllerObs.test.ts:216-217, 336-337`, `TemporaryWaypointDeleter.test.ts:109-111 (+2000)`,
`DirectToPage.test.ts:29-31, 252-254, 321-326`. These are a second form (`directTo()` without an ident) if the helper takes
the ident as optional; waits 500 to 2000.

## H8. Super NAV 5 (select R NAV 4, L NAV 5, inner R 1)

Sequence: `selectPage('R', 'NAV 4')`, `selectPage('L', 'NAV 5')`, `inner('R', 1)`, then a wait. Existing harness
reader: `SuperNav5.read()` in `test/harness/render/superNav5.ts` (throws if the overlay is not shown); the overlay class is
`SuperNav5Page`, read with `(unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()`.

| file | lines | wait after | asserts overlay is SuperNav5Page |
|---|---|---|---|
| test/render/controls/PageContainer.test.ts | 133-137 | none | yes (137) |
| test/render/controls/SuperNav5Left.test.ts | 25-31 `showSuperNav5` (local), used 66, 75, 84, 95, 125, 142 | 1000 | yes (30) |
| test/render/controls/SuperNav5Right.test.ts | 14-20 `showSuperNav5` (local), used 28 | 1000 | yes (19) |
| test/render/controls/selects/SuperNav5DirectToSelector.test.ts | 53-55, 94-96 (`scanOnStandardRoute`), 133-135 | none (a `scan()` follows, then 250) | no (the first `SuperNav5.read()` would throw) |
| test/render/controls/selects/SuperNav5Field1Selector.test.ts | 31-34 (`superNav5OnLeg`), 132-135 | 1000; 250 at 135 | no |
| test/render/controls/selects/SuperNav5Field2Selector.test.ts | 33-36 (`superNav5OnLeg`), 52-55 (`superNav5OnArc`) | 1000 | no |
| test/render/controls/selects/SuperNav5Field3Selector.test.ts | 32-35 (`superNav5OnLeg`), 51-54 (`superNav5OnArc`) | 1000 | no |
| test/render/controls/selects/SuperNav5RangeSelector.test.ts | 28-31 | 1000 | no |
| test/render/data/navdata/NearestList.test.ts | 86-90, 325-329 | 2000 | yes (90, 329) |
| test/render/harness/mapRecorder.test.ts | 97-100 | 1000 | no (asserts `map.drawn` after) |
| test/render/harness/superNav5.test.ts | 13-17, 34-38, 47-51, 59-63, 76-80 (a local factory) | 250 | yes at 17 only; the others rely on `SuperNav5.read()` or `Screen.read()` throwing |
| test/render/pages/MainPage.test.ts | 392-397 | 250 | no; the overlay is the subject, status line checked between the selects |
| test/render/pages/left/SuperNav5Page.test.ts | 19-25 `showSuperNav5` (local), used 59, 82, 287, 386, 404, 437, 461, 479, 493, 529, 573 | 1000 | yes (24) |

Files carrying the sequence: 13. Files that assert the overlay: PageContainer, SuperNav5Left, SuperNav5Right, NearestList,
superNav5 (harness), SuperNav5Page (and MainPage as its subject), more than the audit's three. Drift: wait after the
last click is none, 250, 1000 or 2000.

`superNav5OnLeg(o)` is a byte-identical body in `SuperNav5Field1Selector.test.ts:18-36`, `SuperNav5Field2Selector.test.ts:20-38`
and `SuperNav5Field3Selector.test.ts:19-37` (boots on `legWorld()`, `west(westNm)`, FPL 0 `[kaaa, kddd, keee]`, settle, moves
the aircraft `rightNm` right of the course at `groundspeedKt` ?? 120 on track 090, then the Super NAV 5 sequence, 1000 ms).
`superNav5OnArc(o)` is byte-identical in `SuperNav5Field2Selector.test.ts:44-57` and `SuperNav5Field3Selector.test.ts:43-56`
(`arcWorld()`, 225 radial 10 NM, `loadProcedure('APT 8')`, then the sequence, 1000 ms). Neither asserts the overlay.
`SuperNav5Page.test.ts:50-60` (`superNav5OnRoute`) and `SuperNav5Left.test.ts:59` (`enrouteObs`) build their own worlds and
call `showSuperNav5`.

## H9. bootOnStandardRoute(o?)

The standard route is `standardRoute()` from `test/harness/fixtures.ts:35` (`KAAA` 47.0/8.0, `ABC` 47.5/8.9, `KBBB`
48.2/9.2) stored as FPL 0 with `savedFlightplan(0, [kaaa, abc, kbbb])`. Files with exactly that store are in the table below
(the flight stage files at the top included). "settle" = the site calls `settle(unit)`. "pos" = position given.

| file | lines | local helper | settle | pos | magvar / panelXml / facilities | asserts ABC active |
|---|---|---|---|---|---|---|
| test/flight/flights/hsiToFromFlags.test.ts | 21 | none | (Flight start) | flight aircraft | magvar 0 | no |
| test/flight/flights/turnDirection.test.ts | 27 | none | (Flight start) | flight aircraft | | uses `flyUntilActive`-style waits |
| test/flight/harness/jump.test.ts | 19 | none | (Flight start) | flight aircraft | | `flyUntil activeIdent === ABC` |
| test/render/controls/selects/MapOrientationSelector.test.ts | 21 | | yes | KAAA | | no |
| test/render/controls/selects/SuperNav5DirectToSelector.test.ts | 91 | `scanOnStandardRoute` | yes | KAAA | | no |
| test/render/controls/StatusLine.test.ts | 51, 135, 202 | `onRoute` (132) | yes | default / default / default | magvar 4; ObsSource 0 at 135 | no |
| test/render/controls/SuperNav5Left.test.ts | 62 | `enrouteObs` | yes | default | ObsSource 0 | no |
| test/render/controls/SuperNav5Right.test.ts | 25 | `onRoute` (22) | yes | default | | no |
| test/render/data/flightplan/ActiveWaypoint.test.ts | 47, 90 | | yes | 47.1/8.0 | | 47: asserts `getActiveFplIdx() === 1` (ABC) right after the settle; 90: no ABC check |
| test/render/data/flightplan/FlightplanEdit.test.ts | 57, 160 | | no (57), yes (160) | 47.0/8.0 | 57 adds `wpt0: 'garbage'` | no |
| test/render/data/VolatileMemory.test.ts | 58, 113 | | yes | default | | no |
| test/render/harness/enterIdent.test.ts | 29 | | yes | KAAA | extra facility `vor('AAA', 47.3, 8.3)` | no |
| test/render/harness/mapRecorder.test.ts | 78, 115 | | yes | KAAA | | no |
| test/render/HEvents.test.ts | 282 | `planWithAbcActive` (277) | yes | 47.1/8.0 | | yes (287) |
| test/render/pages/left/DirectToObs.test.ts | 141 | `directToAbcFromFpl0` | yes | `pointBefore(kaaa, abc, 20)` | | no |
| test/render/pages/left/DirectToPage.test.ts | 119, 165 | `bootWithAbcActive` (116), `planOnFirstLeg` (162) | yes | 47.1/8.0 | | yes (122, 170) |
| test/render/pages/left/Mod1Page.test.ts | 65 | `onStandardRoute` (61) | yes | `pointBefore(kaaa, abc, 5)` | optional panelXml | no |
| test/render/pages/left/Nav5Page.test.ts | 177, 192, 268, 298 | `nav5OnRoute` (172) | yes | KAAA / `pointFrom(...)` | 268 and 298 add an extra facility `xyz`; 177 passes magvar and panelXml | 268: ident XYZ later, not ABC |
| test/render/pages/left/Sta5Page.test.ts | 34 | | yes | default | | no |
| test/render/pages/left/SuperNav5Page.test.ts | 55, 568 | `superNav5OnRoute` (50) | yes | KAAA | panelXml option; 568 ObsSource 0 | no |
| test/render/pages/left/Tri5Page.test.ts | 31 | | yes | default | | no |
| test/render/pages/left/Tri5Page.test.ts | 68, 82, 90, 98, 115 | `bootTri5` (14) | no (only when `coldGps` is false) | default | these five sites use `meridianRoute()` (line 12: KAAA 47.0/8.0, ABC 47.5/8.0, KBBB 48.0/8.0), **not** the standard route; they match the same store pattern but are a different world and are not candidates | no |
| test/render/pages/left/Tri6Page.test.ts | 14, 54 | | yes | default | 54 adds FPL 3 `[kccc, kddd]` | no |
| test/render/SensorsOut.test.ts | 166, 198, 225, 330 | `bootMovingOnRoute` (324) | yes | KAAA, KAAA, KAAA, `p` | magvar 0 / 0 / 0 / 4; HeadingInput at 225; panelXml param at 330 | yes at 347 |
| test/render/SensorsOutSimVars.test.ts | 19, 229 | `bootOnRoute` (17), `bootKnownState` (226) | **no** at 19, yes at 229 | KAAA | magvar param; panelXml param; 229 types nothing: stores `route.kaaa, route.abc, route.kbbb` | no |
| test/render/services/KlnEfbSaver.test.ts | 127 | | yes | default | `efb: true` | no |
| test/render/services/ModeController.test.ts | 22 | | yes | `pointBefore(kaaa, abc, 5)` | | no |
| test/render/services/ModeControllerObs.test.ts | 30, 130, 403 | | yes | various | panelXml OBS_SOURCE_OFF (30), LEG_OBS_SWITCH (403) | yes at 39 (30), 416 (403) |
| test/render/services/RollSteeringController.test.ts | 16 | `onRoute` (12) | yes | KAAA | magvar 0, panelXml param | yes (22) |
| test/render/services/WTFlightplanSync.test.ts | 40 | `bootOnRoute` (38) | yes | `pointBefore(kaaa, abc, 20)` | **magvar 4 and an extra facility `xray`** | no |
| test/render/SimVarSync.test.ts | 21 | `onRoute` (17) | yes | KAAA | magvar param | `activeIdent` helper at 29 |
| test/render/data/navdata/NavCalculator.test.ts | 111 | `onStandardRoute` (107) | yes | KAAA | storage param | **yes** (113, via the local `activeIdent`) |

Sites that store the standard route in another shape (not a plain `[kaaa, abc, kbbb]`): `NavCalculator.test.ts:233`
(`{kaaa, abc}` only), `SensorsOut.test.ts:138-141, 372` (`[kaaa, abc]`), `Oth5Page.test.ts:47,85` (`twinOnRoute`),
`DirectToPage.test.ts:20` (`[kaaa, abc, kbbb, abc]`), `DuplicateWaypoints.test.ts:19` (`[kaaa, abc, kbbb, abc, kbbb]`),
`ActiveWaypoint.test.ts:186` (`stdKaaa` etc.), `FlightplanArrow.test.ts:126`, `Nav3Page.test.ts:20`, `Nav5Page.test.ts:25`
(`[kaaa, abc, abc, kbbb]`), `ModeControllerObs.test.ts:209` (`[kaaa, abc, kbbb, abc]`). Types the standard coordinates by
hand instead of `standardRoute()`: `test/render/pages/left/FplPage.test.ts:14` (`route7()`), `test/render/SensorsOutSimVars.test.ts:11-14`
(module constants), `test/render/harness/power.test.ts:52-53`, `test/unit/harness/navdata.test.ts:10`,
`test/flight/harness/frontPanel.test.ts:9,22`, `test/flight/harness/jump.test.ts:12-13`, `test/render/HEvents.test.ts:166`
(a KBBB named BRAVO), `test/render/services/WTFlightplanSync.test.ts:55` (coordinates in the expectation).

Drift summary: the position (KAAA, 47.1/8.0, `pointBefore(...)`, default); settle or none (`SensorsOutSimVars:19`, `Tri5Page`
x5, `FlightplanEdit:57`); ABC-active assertion in NavCalculator, RollSteeringController, HEvents, DirectToPage (two sites),
ModeControllerObs, SensorsOut:347; magvar 0 / 4; extra facilities (`xray`, `AAA`, `xyz`); `panelXml` passed through.

## H10. activeIdent(unit) and turnStackLength

The read is `unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident` (null-safe form) or the same with
`!` (asserting). Flight tests already have `flight.nav.activeIdent` (`test/harness/flight/Flight.ts:42, 120`).

### Local named helpers

| file | line | name | form |
|---|---|---|---|
| test/render/data/navdata/NavCalculator.test.ts | 102 | `activeIdent(unit)` | `nav(unit).activeWaypoint.getActiveWpt()?.icaoStruct.ident`; also `turnStackLength` at 104 (used 270, 285, 330, 340, 390) |
| test/render/services/ModeControllerApproach.test.ts | 25 | `activeIdent(unit)` | same null-safe form |
| test/render/SimVarSync.test.ts | 29 | `activeIdent(unit)` | same null-safe form |
| test/render/SensorsOut.test.ts | 145 | `active()` (closure over `unit`, inside a test) | same null-safe form |

### Inline reads (an `expect(...getActiveWpt()...ident).toBe(...)` or a null check)

| file | lines |
|---|---|
| test/render/controls/editors/WaypointEditor.test.ts | 214, 242 (null checks at 228, 256) |
| test/render/data/flightplan/ActiveWaypoint.test.ts | 68, 115, 160, 210, 280 (null check at 35) |
| test/render/data/flightplan/DuplicateWaypoints.test.ts | 45 |
| test/render/data/flightplan/FlightplanEdit.test.ts | 121 |
| test/render/data/navdata/KLNMagvar.test.ts | 98, 120 |
| test/render/data/navdata/NavCalculator.test.ts | 60, 97 (through a local `activeWaypoint(unit)`) |
| test/render/harness/approachWorld.test.ts | 37 |
| test/render/HEvents.test.ts | 287, 318, 333 |
| test/render/pages/left/DirectToObs.test.ts | 51, 72, 160 |
| test/render/pages/left/DirectToPage.test.ts | 36, 122, 170, 241, 256, 272, 280, 372, 387 (null check at 68) |
| test/render/pages/left/Mod2Page.test.ts | 24 |
| test/render/pages/left/Nav1Page.test.ts | 30 |
| test/render/pages/left/Nav3Esa.test.ts | 34, 49, 62, 74 |
| test/render/pages/left/Nav3Page.test.ts | 29, 61 |
| test/render/pages/left/Nav4Page.test.ts | 22 |
| test/render/pages/left/Nav5Page.test.ts | 123, 160, 232, 251, 276 |
| test/render/pages/left/Oth3Page.test.ts | 132, 165, 181 |
| test/render/pages/left/SuperNav1Page.test.ts | 33 |
| test/render/pages/left/SuperNav5Page.test.ts | 438, 460, 481, 538, 550 |
| test/render/pages/PageManager.test.ts | 64 |
| test/render/pages/PageTreeController.test.ts | 136 |
| test/render/pages/right/SupPage.test.ts | 410 |
| test/render/pages/right/VorUserWaypoint.test.ts | 207 |
| test/render/SensorsOut.test.ts | 347 |
| test/render/SensorsOutSimVars.test.ts | 168, 200 |
| test/render/services/ModeController.test.ts | 119, 136, 148, 222 |
| test/render/services/ModeControllerObs.test.ts | 39, 105, 150, 168, 185, 197, 234, 288, 382, 416 |
| test/render/services/RollSteeringController.test.ts | 22, 47, 99, 135 |
| test/render/services/TemporaryWaypointDeleter.test.ts | 115 |
| test/render/services/VnavObs.test.ts | 29 |
| test/render/services/WTFlightplanSync.test.ts | 162, 168 |
| test/render/pages/MainPage.test.ts | 367 (null check only) |
| test/render/pages/left/DuplicateWaypointPage.test.ts | 103 (keeps the whole facility, not the ident) |

Drift: null-safe `?.` versus asserting `!`; the local helpers map to `undefined` for no active waypoint where the inline
`!` forms would throw. `turnStackLength` (read fresh each time because ActiveWaypoint replaces the array): NavCalculator.test.ts:104,
flight tests `test/flight/flights/duplicateWaypoint.test.ts:82`, `largeTurn.test.ts:35`, `waypointAlertTurn.test.ts:38`;
`dmeArc.test.ts:136` reads the turn itself, not the length.

## H11. D/T world boot and show(side, page)

All four D/T files use `dtWorld()` (`test/harness/fixtures.ts`; Dt3 also has a local `dtkWorld()`), place the aircraft at
47.1 N 10.0 E on the way to ABC, `settle`, then `moveAircraft` at 120 kt due north when moving.

| file | lines | helper | FPLs stored | note |
|---|---|---|---|---|
| test/render/pages/right/Dt1Page.test.ts | 14-25 `bootOnWorld(legs, facilities, moving, extra)`, 27-29 `bootMoving`, 31-36 `show(unit, left)`, 90-103 `directToOutsidePlan` | | **FPL 0 and FPL 3** (the same legs) | `directToOutsidePlan` goes through `bootMoving`, so it stores both |
| test/render/pages/right/Dt2Page.test.ts | 13-26 `bootOnWorld(moving, extra)`, 28 `bootMoving`, 30-35 `show`, 100-110 `directToOutsidePlan` | | **FPL 0 and FPL 3** | `directToOutsidePlan` goes through `bootOnWorld(true, [KCCC])`, stores both |
| test/render/pages/right/Dt3Page.test.ts | 62-71 `bootMoving()` (magvar 5, `dtkWorld`), 73-78 `show(unit, left)` (adds NAV 3), 166-181 `directToOutsidePlan` | | `bootMoving`: **FPL 0 and FPL 3**; `directToOutsidePlan` (line 170): **FPL 0 only** | the two helpers of the same file disagree |
| test/render/pages/right/Dt4Page.test.ts | 13-18 `bootMoving(legs, facilities)`, 20-25 `show(unit, left)`, 95-109 `directToOutsidePlan` (via `bootMoving`) | | **FPL 0 only** | `show` accepts only FPL 0 and NAV 2 (no FPL 3) |

The `show` helpers: select the left page, select the D/T page on the right, wait **1000 ms**, return `rows('R')`; the type
of `left` differs per file (`'FPL 0' | 'FPL 3' | 'NAV 2'`, plus `'NAV 3'` in Dt3, without FPL 3 in Dt4). Other helpers with
the same shape (select a page, wait, read rows) but a different page and wait (the "six others"):

| file | lines | helper | wait |
|---|---|---|---|
| test/render/controls/AirportCoordOrNearestView.test.ts | 19-24 `showApt1`, 27-33 `scanToNext` | R APT 1, rows R | 2000 |
| test/render/pages/right/Apt1Page.test.ts | 222-227 `showApt1` | R APT 1, rows R | 2000 |
| test/render/pages/right/Apt2Page.test.ts | 28-32 `showApt2` | R APT 2, rows R | 500 |
| test/render/harness/timezone.test.ts | 8-13 `zoneRow` | R APT 2, row 4 | 500 |
| test/render/pages/left/Nav4Vnav.test.ts | 38-43 `showNav4` | L NAV 4, rows L | 1000 |
| test/render/data/navdata/KLNMagvar.test.ts | 15-19 `nav3Track` | L NAV 3, row 2 | 1000 |
| test/render/data/navdata/NearestUtils.test.ts | 44-53 (inline, inside a function) | L OTH 2, rows L | 2000 |
| test/render/pages/right/IntPage.test.ts | 38-44 `refRow` | R INT, row 1 | 9000 (the REF calculation) |

## H12. mountedText(el)

`mount(el)`, `m.tick()`, `m.text()` as a `shown(...)` helper; mount lives in `test/harness/render/mount.ts`.

| file | lines | helper |
|---|---|---|
| test/render/controls/displays/AltitudeDisplay.test.ts | 6-11 | `shown(el: UiElement)`; also inline mounts at 54 |
| test/render/controls/displays/BearingDisplay.test.ts | 6-11 | `shown(bearing)` (builds `BearingDisplay`); inline `mount(d)` at 34, 41, 74, 85 |
| test/render/controls/displays/DistanceDisplay.test.ts | 5-10 | `shown(length, distance)`; inline at 123, 134 |
| test/render/controls/displays/DurationDisplay.test.ts | 9-14 | `shown(minutes)`; inline at 75, 86 |
| test/render/controls/displays/FuelDisplay.test.ts | 6-11 | `shown(el: UiElement)`; inline at 83 |
| test/render/controls/displays/LatitudeDisplay.test.ts | 5-10 | `shown(lat)`; inline at 85 |
| test/render/controls/displays/LongitudeDisplay.test.ts | 5-10 | `shown(lon)`; inline at 78 |
| test/render/controls/displays/RoundedDistanceDisplay.test.ts | 5-10 | `shown(alignment, distance)`; inline at 51, 62 |
| test/render/controls/displays/SpeedDisplay.test.ts | 6-11 | `shown(el: UiElement)`; inline at 52 |
| test/render/controls/displays/TemperatureDisplay.test.ts | 5-10 | `shown(celsius)`; inline at 38 |
| test/render/controls/displays/TimeDisplay.test.ts | 6-11 | `shown(time)`; inline at 33, 44 |

Same three-step read but returning text and mask (a `mountedMask`/`{text, mask}` form, not `mountedText`):
`ActiveArrow.test.ts:19-21`, `DeviationBar.test.ts:17-19`, `FlightplanArrow.test.ts:27-29`, `SuperDeviationBar.test.ts:16-18`
(and the `mountedCycle` forms at `ActiveArrow.test.ts:26-27`, `FlightplanArrow.test.ts:34-35`). The helper that fits these
is `{text, mask}` (the audit's list of eleven files is confirmed; the four above are an extension). Hand-rendered controls
(no `mount`) are in section "Section 4 stragglers" below. `Blink.test.ts`, `Inverted.test.ts` and `TextDisplay.test.ts` use
`mount` directly with assertions on the mask or text at once.

## H13. Small helpers

### H13a. The nearest-search wait (`advanceTimersByTimeAsync(12000)` or `12_000`)

The unit searches for nearest facilities and airspaces every 10 s, so tests wait 12 s. A suffix `c` marks a call with a
comment on the line or the line above (the explanation the other calls lack).

| file | lines |
|---|---|
| test/render/controls/MessagePage.test.ts | 31 |
| test/render/controls/selects/NearestSelector.test.ts | 18c |
| test/render/data/navdata/AirspaceAlert.test.ts | 20c, 64c, 228, 286, 299, 333, 373 (the file has eight more bare waits of `10000` at 108 to 214, see D4) |
| test/render/data/navdata/NearestList.test.ts | 27, 85, 176, 230, 233, 250, 271, 303, 324, 348, 363 |
| test/render/harness/airspaces.test.ts | 24c, 37 |
| test/render/harness/defaultNavdata.test.ts | 77 |
| test/render/pages/MainPage.test.ts | 328 |
| test/render/pages/Nav2Page.test.ts | 9, 17c |
| test/render/pages/left/SuperNav5Page.test.ts | 58c, 81, 286, 385 (written `12_000`) |
| test/render/pages/right/Apt1Page.test.ts | 49c, 70, 239, 383c, 427, 435 (`60` is `25000`, see D4) |
| test/render/pages/right/NdbPage.test.ts | 142c |
| test/render/pages/right/VorPage.test.ts | 181c |
| test/render/pages/right/WaypointPage.test.ts | 153c, 163 |

40 calls in 13 files in this scan (the audit's 40 is confirmed); 29 are bare in the sense of D4 (11 carry a comment). Other waits that exist
for the same search but are not literally `12000`: `Apt1Page.test.ts:60` (`25000`), the 2000 ms waits after
`showApt1`-style helpers (H11 table).

### H13b. muteConsoleError

Three identical copies (same body: `vi.spyOn(console, 'error').mockImplementation(() => undefined)` plus
`onTestFinished(() => spy.mockRestore())`, same comment "Registered before the boot ..."):

| file | lines | note |
|---|---|---|
| test/render/harness/bootFailure.test.ts | 13-18 (`muteConsoleError`), used 23, 34, 45 | doc comment: "The error page logs every error it shows" |
| test/render/KLN90BCore.startup.test.ts | 6-11, used 18, 42 | same doc comment |
| test/render/services/KlnEfbSaver.test.ts | 15-20, used 70, 83 | doc comment differs: "The SDK logs the handler error with console.error" |

Same idea under another name or inline: `test/render/controls/ErrorPage.test.ts:20-23` (`silenceConsoleError`, no mock-restore
comment), `test/render/harness/consoleErrors.test.ts:24, 38` (the harness's own tests of console error capture, probably
should stay), `test/render/pages/left/FplPage.test.ts:553-554` (inline, `quiet`), `test/render/pages/right/SupPage.test.ts:424-425`
(inline, `spy`), unit stage: `test/unit/pages/PageManager.test.ts:10`, `test/unit/TickController.test.ts:198, 211, 223`
(a bare `vi.spyOn(console, 'error')`, no `onTestFinished`, in the unit stage where the restore may be done elsewhere).

### H13c. confirmAndReselect (SET 1 CONFIRM?, then SET 2 and back to SET 1)

| file | lines | note |
|---|---|---|
| test/render/controls/editors/BearingEditor.test.ts | 22-28 (`confirmAndReselect`), used 42, 82 | `cursorTo('L', 'CONFIRM?')`, ENT, `selectPage` SET 2, SET 1 |
| test/render/controls/editors/SpeedEditor.test.ts | 19-25, used 44, 76 | byte-identical body |
| test/render/pages/left/Set1Page.test.ts | 311-317 (inside a describe), used 327, 341, 352 | byte-identical body; the doc comment says "track" where the other two say "GPS again" |
| test/render/controls/editors/LatLonEditor.test.ts | 85-86, 100-101, 129-130, 191-192 (CONFIRM? and ENT only), 304-307 (CONFIRM?, ENT, SET 2, SET 1, i.e. the whole sequence inline) | five inline presses; only 304 includes the reselect |
| test/render/pages/left/Set1Page.test.ts | 135-136, 208-209, 226-227, 242-243 | inline CONFIRM? and ENT without the reselect |

### H13d. writeCount and sim.writes filters

| file | lines | note |
|---|---|---|
| test/render/services/KlnEfbLoader.test.ts | 172 (`writeCount`), used 229-238 | `unit.env.sim.writes.filter(w => w.name === name.toUpperCase()).length` |
| test/render/SimVarSync.test.ts | 14 (`writeCount`), used 41-50, 206-216 | identical body |
| test/render/SensorsOutSimVars.test.ts | 59, 70 | `sim.writes.filter(w => w.name === 'VOR1_SET')` / `'VOR2_SET'`: literal already upper case, compared without `toUpperCase()` (the pitfall of testing.md; correct as written, but a rename of the literal would not be caught by the helper) |
| test/render/SensorsOut.test.ts | 340 | `sim.writes.map(w => w.name.toUpperCase()).filter(n => n.startsWith('GPS '))`, deduplicated and sorted: a different read (names written), not a count |
| test/render/harness/reboot.test.ts | 42 | `expect(env.sim.writes).toEqual([])` |

`docs/testing.md:854` proposes a `sim.writeCount(name)` ("would remove the pitfall"); it does not exist yet in
`test/harness/sim/FakeSim.ts` (grep finds no `writeCount` there), so the two copies above are the only implementations.

### H13e. overlay() / getOverlayPage()

`(unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()` in 10 files:

| file | lines | form |
|---|---|---|
| test/render/pages/MainPage.test.ts | 71-73 (`overlay(unit)`), used 171, 195, 204, 231, 241, 251, 271, 282, 289, 319, 369, 398, 402, 419 | named helper |
| test/render/pages/left/SuperNav5Page.test.ts | 24, 581 (`overlay`, inside a describe), used 589, 598 | inline and local helper |
| test/render/pages/left/SuperNav1Page.test.ts | 21, 142 | inline, `toBeInstanceOf(SuperNav1Page)` |
| test/render/pages/left/SuperNav.test.ts | 11 (`overlay`, local closure) | |
| test/render/pages/left/DirectToPage.test.ts | 291 | `... instanceof SuperNav1Page` in `superNav1Shown` |
| test/render/controls/PageContainer.test.ts | 137 (`main.getOverlayPage()`) | |
| test/render/controls/SuperNav5Left.test.ts | 30 | in `showSuperNav5` |
| test/render/controls/SuperNav5Right.test.ts | 19 | in `showSuperNav5` |
| test/render/data/navdata/NearestList.test.ts | 90, 329 | |
| test/render/harness/superNav5.test.ts | 17 | |

### H13f. The #111 date-entry steps (D3)

| file | lines | note |
|---|---|---|
| test/render/pages/left/Set2Page.test.ts | 18-31 (the #111 pin; steps 20-30) | `bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true})`, `selectPage('L', 'SET 2')`, `cursor('L')`, `inner 1`, `outer 1`, `inner 1`, `outer 1`, `inner 3`, `outer 1`, `inner 8`, assert row 2 `'  01 JAN 27'`, ENT |
| test/render/data/PersistentMessages.test.ts | 114-130 (`outOfDateBySet2`), used later in the describe | the same eleven steps and the same assertion; comment line 114 names the copy: "(the steps of Set2Page.test.ts)" |
| test/render/controls/editors/DateEditor.test.ts | 66-79 (`selectDate(unit, day, month, year)`) | an existing local helper that does the same click sequence (`inner day`, `outer`, `inner month`, `outer`, `inner year[0]+1`, `outer`, `inner year[1]+1`); `selectDate(unit, 1, 1, [2, 7])` equals the Set2/PersistentMessages steps |
| test/render/pages/right/SelfTestRightPage.test.ts | 134-150 (`takes a date entered before the GPS supplies one`) | the same clicks on the right half (`'R'`) for the Self Test page date, with different day/month/year |
| test/render/pages/left/Cal7Page.test.ts | 76-81 | partial entry (day and month only) on CAL 7 |

Drift: PersistentMessages and Set2Page share the cold-boot options and the date; DateEditor's helper takes the day,
month and year and is left-side only (`'L'`).

## D4. Waits of five digits or more without a comment on the line or the line above

Definition used: a call `advanceTimersByTimeAsync(...)` whose argument contains a numeric literal of five or more digits
(underscores ignored, so `12_000`, `10000`, `600_000` and `5 * 60_000` count; `5_000` does not), where the call line has no `//` or
`/*` after the call and the previous line is not a comment line. Produced by a script over every `.ts` file under `test/`.
Literals of exactly `12000` / `12_000` are the nearest-search wait (H13a); they are included here because they are bare.

| file | line:argument | note |
|---|---|---|
| test/flight/harness/boot.test.ts | 21: `30_000` |  |
| test/harness/boot.ts | 307: `19_000` | harness helper, not a test file |
| test/render/BrightnessManager.test.ts | 63: `11_000` |  |
| test/render/controls/MessagePage.test.ts | 31: `12000` | all are the nearest-search wait |
| test/render/controls/StatusLine.test.ts | 206: `15000` |  |
| test/render/controls/SuperNav5Left.test.ts | 42: `31_000` |  |
| test/render/data/navdata/AirspaceAlert.test.ts | 108: `10000`, 130: `10000`, 134: `10000`, 169: `10000`, 180: `10000`, 198: `10000`, 210: `10000`, 214: `10000`, 228: `12000`, 286: `12000`, 299: `12000`, 333: `12000`, 370: `31_000`, 373: `12000` | includes nearest-search waits (12000) |
| test/render/data/navdata/NavCalculator.test.ts | 476: `30_000`, 529: `18_500` |  |
| test/render/data/navdata/NearestList.test.ts | 27: `12000`, 85: `12000`, 176: `12000`, 230: `12000`, 233: `12000`, 250: `12000`, 271: `12000`, 303: `12000`, 324: `12000`, 348: `12000`, 363: `12000` | all are the nearest-search wait |
| test/render/data/VolatileMemory.test.ts | 30: `5 * 60_000`, 43: `5 * 60_000` |  |
| test/render/GpsAcquisition.test.ts | 287: `62_000`, 413: `60_000` |  |
| test/render/harness/airspaces.test.ts | 37: `12000` | all are the nearest-search wait |
| test/render/harness/approachWorld.test.ts | 34: `31_000` |  |
| test/render/harness/defaultNavdata.test.ts | 77: `12000` | all are the nearest-search wait |
| test/render/harness/enterIdent.test.ts | 205: `19_000` |  |
| test/render/HEvents.test.ts | 65: `20_000` |  |
| test/render/KLN90BCore.init.test.ts | 44: `10_000` |  |
| test/render/pages/left/Mod1Page.test.ts | 136: `35_000`, 188: `40_000` |  |
| test/render/pages/left/Oth2Page.test.ts | 72: `20_000` |  |
| test/render/pages/left/Sta4Page.test.ts | 41: `65_000` |  |
| test/render/pages/left/SuperNav5Page.test.ts | 81: `12_000`, 286: `12_000`, 385: `12_000` | all are the nearest-search wait |
| test/render/pages/MainPage.test.ts | 328: `12000` | all are the nearest-search wait |
| test/render/pages/Nav2Page.test.ts | 9: `12_000` | all are the nearest-search wait |
| test/render/pages/right/Apt1Page.test.ts | 60: `25000`, 70: `12000`, 239: `12000`, 427: `12000`, 435: `12000` | includes nearest-search waits (12000) |
| test/render/pages/right/Dt4Page.test.ts | 52: `600_000`, 69: `600_000`, 182: `10 * 60_000` |  |
| test/render/pages/right/SelfTestRightPage.test.ts | 161: `60_000` |  |
| test/render/pages/right/WaypointPage.test.ts | 163: `12000` | all are the nearest-search wait |
| test/render/pages/WelcomePage.test.ts | 94: `60_000`, 108: `30_000` |  |
| test/render/SensorsOut.test.ts | 28: `28_000`, 241: `19_000` |  |
| test/render/SimVarSync.test.ts | 48: `10_000`, 214: `10_000` |  |

Totals from this run: 89 calls with a literal of five digits or more, 68 without a comment on the line or the line above (the audit counted 66 on 2026-10-09; this scan also lists `test/harness/boot.ts:307` and `test/flight/harness/boot.test.ts:21`, and treats an expression such as `5 * 60_000` as one call), 21 with a comment.

Calls with a literal of five digits or more that already carry a comment (no action, listed so the constant can be applied there too):

| file | line:argument |
|---|---|
| test/render/BrightnessManager.test.ts | 46: `15_000` |
| test/render/controls/Button.test.ts | 16: `19_000` |
| test/render/controls/selects/NearestSelector.test.ts | 18: `12000` |
| test/render/controls/StatusLine.test.ts | 59: `15000` |
| test/render/data/navdata/AirspaceAlert.test.ts | 20: `12000`, 64: `12000` |
| test/render/data/navdata/NavCalculator.test.ts | 507: `35_000`, 538: `20_000` |
| test/render/harness/airspaces.test.ts | 24: `12000` |
| test/render/harness/display.test.ts | 8: `15_000` |
| test/render/HEvents.test.ts | 392: `15_000` |
| test/render/pages/left/SuperNav5Page.test.ts | 58: `12_000` |
| test/render/pages/Nav2Page.test.ts | 17: `12_000` |
| test/render/pages/right/Apt1Page.test.ts | 49: `12000`, 383: `12000` |
| test/render/pages/right/Dt4Page.test.ts | 188: `poweredOn + 5 * 60_000 - Date.now(` |
| test/render/pages/right/NdbPage.test.ts | 142: `12_000` |
| test/render/pages/right/VorPage.test.ts | 181: `12_000` |
| test/render/pages/right/WaypointPage.test.ts | 153: `12000` |
| test/render/pages/WelcomePage.test.ts | 55: `14_000 - 250` |
| test/render/PowerButton.test.ts | 28: `15_000` |

## D5. Per-test timeouts

Config: `vitest.config.mts:38` gives the flight project `testTimeout: 60_000`; the unit and render projects use the Vitest
default of 5 s. A scan for a numeric or constant timeout as the last argument of `it(...)`, for `{timeout: ...}` on tests and
for `vi.setConfig` found only the following. (`flyUntilActive(..., {timeout: N})` in the flight tests is a simulated-second
bound for the Flight harness, not a Vitest timeout. `power.test.ts:120` `18_000` is a `setTimeout` delay on the fake clock.)

| file | line | value | comment |
|---|---|---|---|
| test/render/controls/selects/NearestSelector.test.ts | 9 (`const TIMEOUT = 20_000`), used 34, 46, 56, 74 | 20 s | yes, lines 6-7 explain: every test advances 12 s with every tick running, the 5 s default times out on a busy machine |
| test/render/data/VolatileMemory.test.ts | 36, 51 | 20_000 | yes, on the same line: "Five simulated minutes with every tick: the 5 s default times out when the machine is busy" |
| test/render/pages/left/Mod2Page.test.ts | 243, 249 | 30_000 | **no** (the `turned90Left` helper clicks 90 times, "22.5 s of clicks" in its doc comment at ~231; the `it.fails` pin at 245 carries the same value) |
| test/render/pages/right/Dt4Page.test.ts | 57, 75, 194 | 30_000 | **no** comment at the line (57 and 75 advance `600_000` ms, 194 five-minute steps; testing.md section 6 justifies it) |
| test/render/GpsAcquisition.test.ts | 18 (`const SLOW = 60_000`), used 56, 63, 72, 82, 92, 100, 111, 122, 130, 139, 148, 155 | 60 s | yes, lines 16-17: "The acquisition tests simulate several minutes each: they carry their own timeout" |

Not seen with a timeout although they advance 12 s or more: every file of H13a other than NearestSelector (about 40
tests with the same wait, per the audit), `Mod1Page.test.ts:136` (`35_000`) and `:188` (`40_000`), `Sta4Page.test.ts:41` (`65_000`),
`WelcomePage.test.ts:94` (`60_000`), `SelfTestRightPage.test.ts:161` (`60_000`), `SuperNav5Left.test.ts:42` (`31_000`),
`approachWorld.test.ts:34` (`31_000`) (all in the render stage, so the 5 s default applies; the audit lists these as the
inconsistency).

## Section 4 stragglers (confirmed at the current tree)

Each item of section 4 of the findings was confirmed at the cited place unless a note says otherwise. "Line now" is the
line found on 2026-10-10.

| item | file | line now | what is there |
|---|---|---|---|
| mount by hand | test/render/controls/displays/NullDashes.test.ts | 17-21 `rendered(el)` | `FSComponent.render(el.render()!, host)` and `host.textContent` (no cell mapping, so no use of `mount`) |
| mount by hand | test/render/controls/editors/LatLonEditor.test.ts | 8-12 `text(editor)` | `FSComponent.render` and `host.textContent`; used for the text of an editor, also at lines 5-12 imports `VNode` |
| blinkCycle by hand | test/render/controls/editors/WaypointEditor.test.ts | 23-27 | loop of four display ticks (advance, then read) pushing `maskRows('L')[1].slice(4, 9)` (same file uses `blinkCycle` elsewhere) |
| blinkCycle by hand | test/render/pages/right/VorPage.test.ts | 88-92 and 222-226 | loop of four (read, then advance 250) pushing `maskRows('R')[0].slice(7, 11)` |
| recordMap | test/render/data/navdata/NearestList.test.ts | 79-83 and 317-321 (`superNav5Labels`) | `vi.spyOn(CoordinateCanvasDrawContext.prototype, 'drawLabel')` collecting labels |
| selectPage | test/render/pages/left/SuperNav.test.ts | 9-31 | raw `unit.send('KLN90B_LeftSmallKnob_Left')`, a loop of five `KLN90B_RightLargeKnob_Left`, then `RightSmallKnob_Left`, each with a 250 or 1000 ms wait; asserts `overlay()` is `SuperNav1Page`, then `SuperNav5Page` |
| Screen.status() | test/render/HEvents.test.ts | 427 | `Screen.read().row(6).slice(6, 13)` in `modeField` (inside the DCT, ENT and CLR describe) |
| Screen.status() | test/render/services/ModeControllerApproach.test.ts | 262 | `Screen.read().row(6).slice(6, 13)` matched with `/^arm:\d\d\d$/` |
| fixed knob counts | test/render/pages/MainPage.test.ts | 49-51 | `outer('R', -5)`, `inner('R', 3)`, then `rightName()` is `NAV 4` |
| fixed knob counts | test/render/pages/CursorController.test.ts | 14-15 | `outer('L', 1)` then `leftName()` is `CAL 1` |
| pointFrom | test/render/data/navdata/AirspaceAlert.test.ts | 51-53 (`NM_LON`, `NM_LAT`), used 74, 116, 143, 162, 168, 179 | flat-earth NM offsets; the `moveAircraft` targets are at 168 and 179 |
| bootToSelfTest and approveSelfTest | test/render/pages/left/Sta1Page.test.ts | 14-22 `skySearch` | `bootUnit({engineRunning: false, storage})`, `powerOn()`, `approveSelfTest()` by hand |
| bootToSelfTest and approveSelfTest | test/render/GpsAcquisition.test.ts | 229-231 (`posts no message on a cold-and-dark start`), also 30-35 `powerOnCold`, 337-340, 349-350 | `bootUnit({engineRunning: false, ...})`, `powerOn()`, `approveSelfTest()` |
| raw power-on | test/render/controls/editors/FreetextEditor.test.ts | 26-28 `onTurnOnPage` | `unit.send('KLN90B_Power_On')` then a 1000 ms wait |
| cursorTo fixed counts | test/render/pages/left/Oth3Page.test.ts | 148, 168, 184, 198 | `outer('L', 2)` (AVOR) and `outer('L', 4)` (AINT) with a trailing comment naming the target |
| cursorTo fixed counts | test/render/pages/left/Oth4Page.test.ts | 97, 114 | `outer('L', 2)` (KCCC) |
| cursorTo fixed counts | test/render/pages/left/Set2Page.test.ts | 240 | `outer('L', 2)` (the time zone) |
| cursorTo fixed counts | test/render/pages/left/Set1Page.test.ts | 128, 338 | `outer('L', 4)` (the track, the heading) |
| cursorTo fixed counts | test/render/pages/left/FplPage.test.ts | 516, 532 | `outer('L', 4)` |
| cursorTo fixed counts | test/render/pages/right/IntPage.test.ts | 576 | `outer('R', 6)` (five ident characters, REF, then RAD) |
| cursorTo fixed counts | test/render/pages/right/SupPage.test.ts | 284 | `outer('R', 5)` (the ident's five cells, then REF) |
| standardRoute() | test/flight/harness/frontPanel.test.ts | 9, 22 | types `airport('KAAA', 47.0, 8.0), vor('ABC', 47.5, 8.9), airport('KBBB', 48.2, 9.2)` in a `World` |
| standardRoute() | test/flight/harness/jump.test.ts | 11-13, 17 | the three facilities typed; `new GeoPoint(kaaa.lat, kaaa.lon).offset(leg1, UnitType.NMILE.convertTo(2, UnitType.GA_RADIAN))` at 17 instead of `pointFrom` |
| standardRoute() | test/render/harness/power.test.ts | 52-53 | `kaaa`, `abc` typed (no `kbbb`) |
| standardRoute() | test/unit/harness/navdata.test.ts | 10-12 | `abc` (47.5/8.9), `abd` and `kaaa` typed for the `MemoryFacilityClient` tests; not the same world as a route |
| savedUserWaypoints | test/render/harness/reboot.test.ts | 22 | `wpt0: 'WXX        USRA    +4730.00+00815.50'` written by hand beside `savedFlightplan(0, [kaaa, usra])` |
| world copy (missed approach) | test/render/pages/left/FplPage.test.ts | 162-? `rnavWorld()` | IAFAA 47.3/7.7, IFAAA 47.2/7.8, ... with a MAHAA hold |
| world copy (missed approach) | test/render/pages/right/Apt7Page.test.ts | 17-? (module level `iafaa`, `ifaaa`, `fafaa`, ...) | "Invented fixes, as in test/render/harness/procedures.test.ts" |
| world copy (missed approach) | test/render/pages/right/Apt8Page.test.ts | 17-? | the same module-level fixes as Apt7 |
| world copy (VOR 36 of KDST) | test/render/data/flightplan/ActiveWaypoint.test.ts | 240 `loadVorApproachAbeamFinal` | `airport('KDST', 47.0, 8.0)`, `intersection('MAPAA', 47.0, 8.0)`, VVV |
| world copy (VOR 36 of KDST) | test/render/services/WTFlightplanSync.test.ts | 189 `loadVorApproach` | the same world; the comment at 187 says "as in ActiveWaypoint.test.ts (#41)" |

Everything in section 4 was found at (or within a few lines of) the cited place; no item has moved to another file. The
justified items of the findings (`GpsAcquisition.test.ts:42`, `TempFieldset.test.ts:152`, `WelcomePage.test.ts`, the arc
worlds, `RefPage.test.ts:257`, `dmeArc.test.ts:163`) were not re-checked.


## Files by directory

Every affected test file, grouped as asked, with the ids of the sections above that touch it. An id with a trailing `?` means
a near-copy or an optional site (a different read, a fixed number of presses, a single lookup): assign it to the task that owns
the helper only if that task is willing to touch the file for a looser fit. `H11s` is the select-wait-read helper of other pages
(the "six others" of H11), `H6u` is the pure unit-stage `identsOf`, `H13a` to `H13f` are the parts of H13, `S4` is the section 4
stragglers table, `D4` the bare long waits and `D5` the per-test timeouts.

### Counts per directory

| directory | affected files |
|---|---|
| test/unit | 10 |
| test/flight | 10 |
| test/render/harness | 18 |
| test/render/*.test.ts (top level) | 10 |
| test/render/pages/*.test.ts (top level) | 9 |
| test/render/pages/left | 37 |
| test/render/pages/right | 20 |
| test/render/controls/** | 44 |
| test/render/data/** | 11 |
| test/render/services | 10 |
| all | 179 |

Of these, files carrying only `?` ids: 15.

### test/unit

test/unit/data/flightplan/ActiveWaypoint.test.ts: H6u

test/unit/data/flightplan/Flightplan.test.ts: H6u

test/unit/data/navdata/Database.test.ts: H4?

test/unit/data/navdata/SidStar.test.ts: H6u

test/unit/harness/navdata.test.ts: H9?, S4

test/unit/services/FlightplanUtils.test.ts: H6u

test/unit/services/Flightplanloader.test.ts: H4?, H6u

test/unit/settings/UserFlightplanLoaderV1.test.ts: H6u

test/unit/settings/UserFlightplanLoaderV2.test.ts: H4?, H6u

test/unit/settings/UserFlightplanPersistor.test.ts: H6u

### test/flight

test/flight/flights/dmeArc.test.ts: H6

test/flight/flights/duplicateWaypoint.test.ts: H10

test/flight/flights/hsiToFromFlags.test.ts: H9

test/flight/flights/largeTurn.test.ts: H10

test/flight/flights/turnDirection.test.ts: H9

test/flight/flights/waypointAlertTurn.test.ts: H10

test/flight/harness/boot.test.ts: D4

test/flight/harness/frontPanel.test.ts: H6, H9?, S4

test/flight/harness/jump.test.ts: H9, S4

test/flight/harness/monitor-finite.test.ts: H1

### test/render/harness

test/render/harness/airspaces.test.ts: D4, H13a

test/render/harness/approachWorld.test.ts: D4, H6, H10

test/render/harness/bootFailure.test.ts: H13b

test/render/harness/defaultNavdata.test.ts: D4, H13a

test/render/harness/efb.test.ts: H6

test/render/harness/enterIdent.test.ts: D4, H9

test/render/harness/insertLeg.test.ts: H6

test/render/harness/mapRecorder.test.ts: H8, H9

test/render/harness/pageTree.test.ts: H1

test/render/harness/power.test.ts: H1, H9?, S4

test/render/harness/procedures.test.ts: H6

test/render/harness/reboot.test.ts: H3, H6, S4

test/render/harness/screen.test.ts: H2

test/render/harness/selfTestBoot.test.ts: H1

test/render/harness/simVars.test.ts: H1

test/render/harness/sounds.test.ts: H1

test/render/harness/superNav5.test.ts: H8, H13e

test/render/harness/timezone.test.ts: H11s

### test/render/*.test.ts (top level)

test/render/BrightnessManager.test.ts: D4

test/render/GpsAcquisition.test.ts: D4, D5, H4, S4

test/render/HEvents.test.ts: D4, H9, H10, S4

test/render/KLN90BCore.init.test.ts: D4

test/render/KLN90BCore.startup.test.ts: H13b

test/render/KLN90BCore.userDataConversion.test.ts: H6

test/render/PowerButton.test.ts: H1

test/render/SensorsOut.test.ts: D4, H1, H9, H10

test/render/SensorsOutSimVars.test.ts: H1, H9, H10, H13d?

test/render/SimVarSync.test.ts: D4, H1, H9, H10, H13d

### test/render/pages/*.test.ts (top level)

test/render/pages/AiracPage.test.ts: H5

test/render/pages/CursorController.test.ts: S4

test/render/pages/MainPage.test.ts: D4, H2?, H8, H10?, H13a, H13e, S4

test/render/pages/Nav2Page.test.ts: D4, H13a

test/render/pages/ObsWarningPage.test.ts: H1, H5

test/render/pages/PageManager.test.ts: H10

test/render/pages/PageTreeController.test.ts: H1, H7, H10

test/render/pages/VFROnlyPage.test.ts: H1, H5

test/render/pages/WelcomePage.test.ts: D4

### test/render/pages/left

test/render/pages/left/AltPage.test.ts: H1

test/render/pages/left/Cal3Page.test.ts: H1

test/render/pages/left/DirectToObs.test.ts: H1, H6, H7?, H9, H10

test/render/pages/left/DirectToPage.test.ts: H7, H9, H10, H13e

test/render/pages/left/DuplicateWaypointPage.test.ts: H7?, H10?

test/render/pages/left/FplPage.test.ts: H6, H7?, H9?, H13b?, S4

test/render/pages/left/Mod1Page.test.ts: D4, H1, H9

test/render/pages/left/Mod2Page.test.ts: D5, H1, H10

test/render/pages/left/Nav1Page.test.ts: H7, H10

test/render/pages/left/Nav3Esa.test.ts: H10

test/render/pages/left/Nav3Page.test.ts: H1, H10

test/render/pages/left/Nav4Page.test.ts: H1, H10

test/render/pages/left/Nav4Vnav.test.ts: H4, H11s

test/render/pages/left/Nav5Page.test.ts: H1, H7, H9, H10

test/render/pages/left/Oth10Page.test.ts: H1

test/render/pages/left/Oth2Page.test.ts: D4

test/render/pages/left/Oth3Page.test.ts: H7, H10, S4

test/render/pages/left/Oth4Page.test.ts: S4

test/render/pages/left/Oth5Page.test.ts: H1

test/render/pages/left/Oth6Page.test.ts: H1

test/render/pages/left/Oth7Page.test.ts: H1

test/render/pages/left/Oth8Page.test.ts: H1

test/render/pages/left/Oth9Page.test.ts: H1

test/render/pages/left/SelfTestLeftPage.test.ts: H1

test/render/pages/left/Set0Page.test.ts: H5?

test/render/pages/left/Set1Page.test.ts: H4, H13c, S4

test/render/pages/left/Set2Page.test.ts: H4, H13f, S4

test/render/pages/left/Set5Page.test.ts: H1

test/render/pages/left/Set9Page.test.ts: H1

test/render/pages/left/Sta1Page.test.ts: S4

test/render/pages/left/Sta4Page.test.ts: D4

test/render/pages/left/Sta5Page.test.ts: H9

test/render/pages/left/SuperNav.test.ts: H13e, S4

test/render/pages/left/SuperNav1Page.test.ts: H5?, H7, H10, H13e

test/render/pages/left/SuperNav5Page.test.ts: D4, H1, H7, H8, H9, H10, H13a, H13e

test/render/pages/left/Tri5Page.test.ts: H9

test/render/pages/left/Tri6Page.test.ts: H9

### test/render/pages/right

test/render/pages/right/ActPage.test.ts: H6, H7

test/render/pages/right/Apt1Page.test.ts: D4, H11s, H13a

test/render/pages/right/Apt2Page.test.ts: H11s

test/render/pages/right/Apt7Page.test.ts: H6, S4

test/render/pages/right/Apt8Page.test.ts: H4, H6, S4

test/render/pages/right/Ctr1Page.test.ts: H3, H6

test/render/pages/right/Dt1Page.test.ts: H7, H11

test/render/pages/right/Dt2Page.test.ts: H7, H11

test/render/pages/right/Dt3Page.test.ts: H7, H11

test/render/pages/right/Dt4Page.test.ts: D4, D5, H7, H11

test/render/pages/right/IntPage.test.ts: H3, H11s, S4

test/render/pages/right/NdbPage.test.ts: H3, H13a

test/render/pages/right/RefNaming.test.ts: H3

test/render/pages/right/RefPage.test.ts: H6

test/render/pages/right/SelfTestRightPage.test.ts: D4, H1, H13f?

test/render/pages/right/SupPage.test.ts: H10, H13b?, S4

test/render/pages/right/VorPage.test.ts: H13a, S4

test/render/pages/right/VorUserWaypoint.test.ts: H3, H7?, H10

test/render/pages/right/WaypointConfirmPage.test.ts: H7?

test/render/pages/right/WaypointPage.test.ts: D4, H13a

### test/render/controls/**

test/render/controls/AirportCoordOrNearestView.test.ts: H11s

test/render/controls/ErrorPage.test.ts: H13b?

test/render/controls/FlightplanList.test.ts: H6, H7

test/render/controls/MessagePage.test.ts: D4, H2, H4?, H13a

test/render/controls/PageContainer.test.ts: H6, H8, H13e

test/render/controls/StatusLine.test.ts: D4, H1, H2, H4?, H9

test/render/controls/SuperNav5Left.test.ts: D4, H1, H2?, H8, H9, H13e

test/render/controls/SuperNav5Right.test.ts: H8, H9, H13e

test/render/controls/WaypointDeleteListItem.test.ts: H3

test/render/controls/displays/ActiveArrow.test.ts: H12?

test/render/controls/displays/AltitudeDisplay.test.ts: H12

test/render/controls/displays/BearingDisplay.test.ts: H12

test/render/controls/displays/DeviationBar.test.ts: H12?

test/render/controls/displays/DistanceDisplay.test.ts: H12

test/render/controls/displays/DurationDisplay.test.ts: H12

test/render/controls/displays/FlightplanArrow.test.ts: H12?

test/render/controls/displays/FuelDisplay.test.ts: H12

test/render/controls/displays/LatitudeDisplay.test.ts: H12

test/render/controls/displays/LongitudeDisplay.test.ts: H12

test/render/controls/displays/NullDashes.test.ts: S4

test/render/controls/displays/RoundedDistanceDisplay.test.ts: H12

test/render/controls/displays/SpeedDisplay.test.ts: H12

test/render/controls/displays/SuperDeviationBar.test.ts: H12?

test/render/controls/displays/TemperatureDisplay.test.ts: H12

test/render/controls/displays/TimeDisplay.test.ts: H12

test/render/controls/editors/BearingEditor.test.ts: H13c

test/render/controls/editors/DateEditor.test.ts: H13f?

test/render/controls/editors/DistanceEditor.test.ts: H3?

test/render/controls/editors/FreetextEditor.test.ts: S4

test/render/controls/editors/LatLonEditor.test.ts: H13c, S4

test/render/controls/editors/NdbFreqEditor.test.ts: H3?

test/render/controls/editors/RadialEditor.test.ts: H3?

test/render/controls/editors/SpeedEditor.test.ts: H13c

test/render/controls/editors/VorFreqEditor.test.ts: H3?

test/render/controls/editors/WaypointEditor.test.ts: H6, H7, H10, S4

test/render/controls/selects/FuelFieldset.test.ts: H1

test/render/controls/selects/MapOrientationSelector.test.ts: H9

test/render/controls/selects/NearestSelector.test.ts: D5, H13a

test/render/controls/selects/ObsDtkElement.test.ts: H1

test/render/controls/selects/SuperNav5DirectToSelector.test.ts: H6, H8, H9

test/render/controls/selects/SuperNav5Field1Selector.test.ts: H8

test/render/controls/selects/SuperNav5Field2Selector.test.ts: H8

test/render/controls/selects/SuperNav5Field3Selector.test.ts: H8

test/render/controls/selects/SuperNav5RangeSelector.test.ts: H8

### test/render/data/**

test/render/data/Messages.test.ts: H1, H2, H4

test/render/data/PersistentMessages.test.ts: H1, H4, H13f

test/render/data/VolatileMemory.test.ts: D4, D5, H6, H9

test/render/data/flightplan/ActiveWaypoint.test.ts: H1, H6, H7, H9, H10, S4

test/render/data/flightplan/DuplicateWaypoints.test.ts: H7?, H10

test/render/data/flightplan/FlightplanEdit.test.ts: H4?, H6, H9, H10

test/render/data/navdata/AirspaceAlert.test.ts: D4, H1, H2?, H4, H13a, S4

test/render/data/navdata/KLNMagvar.test.ts: H1, H4, H10, H11s

test/render/data/navdata/NavCalculator.test.ts: D4, H4?, H6, H7, H9, H10

test/render/data/navdata/NearestList.test.ts: D4, H8, H13a, H13e, S4

test/render/data/navdata/NearestUtils.test.ts: H11s

### test/render/services

test/render/services/KeyboardService.test.ts: H3?

test/render/services/KlnEfbLoader.test.ts: H1, H3, H4, H6, H13d

test/render/services/KlnEfbSaver.test.ts: H1, H6, H9, H13b

test/render/services/ModeController.test.ts: H6, H9, H10

test/render/services/ModeControllerApproach.test.ts: H6, H7, H10, S4

test/render/services/ModeControllerObs.test.ts: H1, H4?, H6, H7?, H9, H10

test/render/services/RollSteeringController.test.ts: H1, H9, H10

test/render/services/TemporaryWaypointDeleter.test.ts: H3, H6, H7?, H10

test/render/services/VnavObs.test.ts: H10

test/render/services/WTFlightplanSync.test.ts: H1, H6, H9, H10, S4

