/**
 * @license
 *     KLN 90B for MSFS
 *     Copyright (C) 2023 falcon71
 *
 *     This program is free software: you can redistribute it and/or modify
 *     it under the terms of the GNU Lesser General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 *
 *     This program is distributed in the hope that it will be useful,
 *     but WITHOUT ANY WARRANTY; without even the implied warranty of
 *     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *     GNU Lesser General Public License for more details.
 *
 *     You should have received a copy of the GNU Lesser General Public License
 *     along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import {
    DisplayComponent,
    EventBus,
    Facility,
    FSComponent,
    HEventPublisher,
    ICAO,
    IcaoValue,
    NodeReference,
    SimVarValueType,
    Subscription,
} from '@microsoft/msfs-sdk';

import {KLN90BPlatform} from "./KLN90BPlatform";
import {PowerSupply, PowerEvent} from "./PowerSupply";
import {KLN90BSettingSaveManager} from "./settings/KLN90BUserSettingsSaverManager";
import {PageProps} from "./pages/Page";
import {PageManager} from "./pages/PageManager";
import {TickController} from "./TickController";
import {KLN90BPlaneSettingsParser, KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {Sensors} from "./Sensors";
import {VolatileMemory} from "./data/VolatileMemory";
import {NearestUtils} from "./data/navdata/NearestUtils";
import {RemarksManager} from "./settings/RemarksManager";
import {Nearestlists} from "./data/navdata/NearestList";
import {KLNFacilityLoader} from "./data/navdata/KLNFacilityLoader";
import {UserWaypointPersistor} from "./settings/UserWaypointPersistor";
import {Scanlists} from "./data/navdata/Scanlist";
import {
    EVT_CLR,
    EVT_ENT,
    EVT_KEY,
    EVT_L_CURSOR,
    EVT_L_INNER_LEFT,
    EVT_L_KEYBOARD,
    EVT_L_INNER_RIGHT,
    EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT,
    EVT_R_CURSOR,
    EVT_R_INNER_LEFT,
    EVT_R_INNER_RIGHT,
    EVT_R_KEYBOARD,
    EVT_R_OUTER_LEFT,
    EVT_R_OUTER_RIGHT,
    EVT_R_SCAN,
    EVT_R_SCAN_LEFT,
    EVT_R_SCAN_RIGHT,
} from "./HEvents";
import {MessageHandler, OneTimeMessage} from "./data/MessageHandler";
import {NavCalculator} from "./data/navdata/NavCalculator";
import {AirspaceAlert} from "./data/navdata/AirspaceAlert";
import {AudioGenerator} from "./services/AudioGenerator";
import {HtAboveAirportAlert} from "./services/HtAboveAirportAlert";
import {KLN90BUserSettings} from "./settings/KLN90BUserSettings";
import {AltAlert} from "./services/AltAlert";
import {UserFlightplanPersistor} from "./settings/UserFlightplanPersistor";
import {Hardware} from "./Hardware";
import {Timers} from "./services/Timers";
import {MSA} from "./services/MSA";
import {Vnav} from "./services/Vnav";
import {TemporaryWaypointDeleter} from "./services/TemporaryWaypointDeleter";
import {ModeController} from "./services/ModeController";
import {Database} from "./data/navdata/Database";
import {KLNMagvar} from "./data/navdata/KLNMagvar";
import {buildPersistentMessages} from "./data/PersistentMessages";
import {Flightplan} from "./data/flightplan/Flightplan";
import {SidStar} from "./data/navdata/SidStar";
import {SimVarSync} from "./SimVarSync";
import {KeyboardEvent, KeyboardEventData} from "./controls/StatusLine";
import {KeyboardSide} from "./controls/PageContainer";
import {ErrorEvent} from "./controls/ErrorPage";
import {PanelXmlErrorEvent} from "./controls/PanelXmlErrorPage";
import {SignalOutputFillterTick} from "./services/SignalOutputFillterTick";
import {RollSteeringController} from "./services/RollSteeringController";
import {KlnEfbSaver} from "./services/KlnEfbSaver";
import {KlnEfbLoader} from "./services/KlnEfbLoader";
import {WTFlightplanSync} from "./services/WTFlightplanSync";
import {BrightnessManager} from "./BrightnessManager";
import {PendingCalls, trackFacilityClient} from "./services/PendingCalls";
import KEY_ENTER = KeyCode.KEY_ENTER;
import KEY_PAGE_UP = KeyCode.KEY_PAGE_UP;
import KEY_PAGE_DOWN = KeyCode.KEY_PAGE_DOWN;
import KEY_BACK_SPACE = KeyCode.KEY_BACK_SPACE;
import KEY_END = KeyCode.KEY_END;
import KEY_HOME = KeyCode.KEY_HOME;
import KEY_DELETE = KeyCode.KEY_DELETE;
import KEY_A = KeyCode.KEY_A;
import KEY_0 = KeyCode.KEY_0;
import KEY_9 = KeyCode.KEY_9;
import KEY_Z = KeyCode.KEY_Z;
import KEY_NUMPAD0 = KeyCode.KEY_NUMPAD0;
import KEY_NUMPAD9 = KeyCode.KEY_NUMPAD9;

export interface PropsReadyEvent {
    propsReady: PageProps;
}

/**
 * The instrument without the sim's BaseInstrument lifecycle: every service, the pages and the tick loops. KLN90B (the
 * BaseInstrument) and the tests create one of these.
 */
export class KLN90BCore {
    public readonly bus = new EventBus();
    private keyboardEventSub: Subscription;

    private powerSupply: PowerSupply | undefined;
    private readonly hEventPublisher: HEventPublisher;
    private readonly settingSaveManager: KLN90BSettingSaveManager;

    private readonly mainScreen: NodeReference<DisplayComponent<any, any> | HTMLElement | SVGElement>;
    public readonly pageManager: PageManager;

    private tickManager: TickController | undefined;
    private userWaypointPersistor: UserWaypointPersistor | undefined;
    private userFlightplanPersistor: UserFlightplanPersistor | undefined;
    private hardware: Hardware = new Hardware();
    private simvarSync: SimVarSync | undefined;

    private audioGenerator: AudioGenerator | undefined;
    private readonly userSettings: KLN90BUserSettings;
    private temporaryWaypointDeleter: TemporaryWaypointDeleter | undefined;
    private readonly messageHandler: MessageHandler = new MessageHandler();
    private planeSettings: KLN90PlaneSettings | undefined;
    private wtFlightplanSync: WTFlightplanSync | undefined;
    private efbSaver: KlnEfbSaver | undefined;
    private efbLoader: KlnEfbLoader | undefined;
    /** The facility calls and the data file the boot waits on, so that the Turn-On page can name the one that hangs (#416) */
    private readonly pendingCalls = new PendingCalls();


    /**
     * @param platform Navdata, the user waypoint repository and the EFB route manager
     * @param dispatchInteractionEvent Where keyboard input is re-dispatched to. KLN90B passes its own
     * onInteractionEvent, so these events pass through BaseInstrument.onInteractionEvent as before.
     */
    constructor(private readonly platform: KLN90BPlatform, private readonly dispatchInteractionEvent: (args: string[]) => void) {
        this.mainScreen = FSComponent.createRef();

        this.userSettings = new KLN90BUserSettings(this.bus);
        this.settingSaveManager = new KLN90BSettingSaveManager(this.bus, this.userSettings);
        const saveKey = `${SimVar.GetSimVarValue('ATC MODEL', SimVarValueType.String)}.profile_1`;
        console.log(saveKey);
        this.settingSaveManager.load(saveKey);
        this.settingSaveManager.startAutoSave(saveKey);

        this.hEventPublisher = new HEventPublisher(this.bus);

        this.bus.getSubscriber<PowerEvent>().on("powerEvent").handle(evt => {
            if (!evt.isPowered) {
                this.messageHandler.clear();
            }
        });

        this.keyboardEventSub = this.bus.getSubscriber<KeyboardEvent>().on("keyboardevent").handle(this.handleKeyboardEvent.bind(this));

        this.pageManager = new PageManager();

    }

    /**
     * Builds all services. The xml is not available before BaseInstrument.Init.
     * @param xmlConfig
     */
    public init(xmlConfig: Document): Promise<void> {
        return this.asyncInit(xmlConfig).catch(e => {
            this.bus.getPublisher<ErrorEvent>().pub("error", e);
        });
    }

    /**
     * A callback for when sounds are done playing.  This is needed to support the sound server.
     * @param soundEventId The sound that got played.
     */
    public onSoundEnd(soundEventId: Name_Z): void {
        this.audioGenerator?.onSoundEnd(soundEventId);
    }

    public onInteractionEvent(args: Array<string>): void {
        try {
            if (this.hardware.isDisabled) {
                //#138, the maintainer's ruling: a unit taken out for hot swapping takes no input, the power and brightness
                //events included. The keyboard is re-dispatched through here, so it is ignored as well
                return;
            }

            let evt = args[0];

            if (this.hardware.isScanPulled) {
                switch (evt) {
                    case EVT_R_INNER_LEFT:
                        evt = EVT_R_SCAN_LEFT;
                        break;
                    case EVT_R_INNER_RIGHT:
                        evt = EVT_R_SCAN_RIGHT;
                        break;
                    case EVT_R_SCAN:
                        console.log("Scanmode off");
                        this.hardware.setScanPulled(false);
                        break;
                }
            } else {
                switch (evt) {
                    case EVT_R_SCAN:
                        console.log("Scanmode on");
                        this.hardware.setScanPulled(true);
                        break;
                }
            }
            console.log(args[0], evt);

            this.hEventPublisher.dispatchHEvent([evt]);
            switch (evt) {
                case EVT_L_KEYBOARD:
                    this.toggleKeyboard('LEFT');
                    return;
                case EVT_R_KEYBOARD:
                    this.toggleKeyboard('RIGHT');
                    return;
            }
            this.pageManager.onInteractionEvent(evt);
        } catch (e) {
            console.error(e);
            if (e instanceof Error) {
                this.bus.getPublisher<ErrorEvent>().pub("error", e);
            }
        }

    }

    private async asyncInit(xmlConfig: Document) {

        //The xml is not available before init!
        const planeSettingsParser = new KLN90BPlaneSettingsParser();
        this.planeSettings = planeSettingsParser.parsePlaneSettings(xmlConfig);

        const forceReadyToUse = this.isForceReadyToUse();

        console.log("forceReadyToUse", forceReadyToUse);

        this.pageManager.Init(this.bus, this.userSettings);
        if (planeSettingsParser.problems.length > 0) { //The page that shows them only exists after Init
            this.bus.getPublisher<PanelXmlErrorEvent>().pub("panelXmlErrors", planeSettingsParser.problems);
        }

        const brightnessManager = new BrightnessManager(this.bus, this.planeSettings);
        this.powerSupply = new PowerSupply({
            bus: this.bus,
            userSettings: this.userSettings,
            planeSettings: this.planeSettings,
            pageManager: this.pageManager,
            forceReadyToUse: forceReadyToUse,
            pendingCalls: this.pendingCalls,
        }, brightnessManager);


        //From now on, the welcome page may be shown. This gives us time to initialize everything here.
        //Lots of coherent calls, might take a while


        this.audioGenerator = new AudioGenerator(this.bus, this.planeSettings, this.userSettings);
        const sensors = new Sensors(this.bus, this.userSettings, this.planeSettings, this.audioGenerator, this.messageHandler, this.hardware);

        //The display ticks run from the start of the boot, so that the Turn-On page shows and checks the boot while it is
        //still under way (#416). The calculations are added once their services exist
        this.tickManager = new TickController(this.bus, [this.pageManager], [], []);

        this.hEventPublisher.startPublish();
        console.log("KLN 90B ready to show welcome page");

        if (forceReadyToUse) {
            this.powerSupply.forceReadyToUse();
        }

        let restoreSuccessFull = true;

        const facilityRepository = this.platform.getFacilityRepository(this.bus);

        const facilityLoader = new KLNFacilityLoader(
            trackFacilityClient(this.platform.createFacilityClient(this.bus), this.pendingCalls),
            facilityRepository,
        );

        const scanlists = new Scanlists(facilityLoader, this.bus);

        this.userWaypointPersistor = new UserWaypointPersistor(this.bus, facilityRepository, this.userSettings);
        try {
            this.userWaypointPersistor.restoreWaypoints();
        } catch (e) {
            restoreSuccessFull = false;
        }

        this.userFlightplanPersistor = new UserFlightplanPersistor(this.bus, facilityLoader, this.messageHandler, this.userSettings);

        const nearestLists = new Nearestlists(facilityLoader, sensors, this.userSettings);
        const nearestUtils = new NearestUtils(facilityLoader);

        const lastActiveIcao: string | null = this.userSettings.getSetting("activeWaypoint").get();
        let lastActiveWaypoint: Facility | null = null;
        if (lastActiveIcao !== "") {
            let lastActiveValue: IcaoValue | null = null;
            try {
                //Versions before #415 saved an ICAO V1 string (12 characters), later ones a V2 string (19 characters). A stored
                //V1 value stays as it is until the active waypoint is saved the next time, which is always V2
                lastActiveValue = lastActiveIcao.length === ICAO.EMPTY_V1.length ? ICAO.stringV1ToValue(lastActiveIcao) : ICAO.stringV2ToValue(lastActiveIcao);
                lastActiveWaypoint = await facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(lastActiveValue), lastActiveValue);
            } catch (e) {
                console.error(`Last active waypoint not found: ${lastActiveIcao}`, e);
                //B-4, #421: a waypoint that is no longer in the database is reported, which the active one is as well
                if (lastActiveValue !== null) {
                    this.messageHandler.addMessage(new OneTimeMessage([`WAYPOINT ${lastActiveValue.ident} DELETED`]));
                }
            }
        }

        let flightplans: Flightplan[];
        if (restoreSuccessFull) {
            try {
                flightplans = await this.userFlightplanPersistor.restoreAllFlightplan();
            } catch (e) {
                flightplans = Array(26).fill(null).map((_, idx) => new Flightplan(idx, [], this.bus));
                restoreSuccessFull = false;
                console.error(e);
            }
        } else {
            flightplans = Array(26).fill(null).map((_, idx) => new Flightplan(idx, [], this.bus));
        }

        const userDataFormat = this.userSettings.getSetting("userDataFormat");
        if (userDataFormat.get() !== 2 || !restoreSuccessFull) {
            //Convert to V2, or write the empty state over data that could not be restored, so that it is lost once
            this.userWaypointPersistor.persistAllWaypoints();
            for (const plan of flightplans) {
                this.userFlightplanPersistor.persistFlightplan(plan);
            }
            userDataFormat.set(2);
        }


        const memory = new VolatileMemory(this.bus, this.userSettings, facilityLoader, sensors, scanlists, flightplans, lastActiveWaypoint);

        this.wtFlightplanSync = new WTFlightplanSync(this.bus, facilityLoader, this.planeSettings, memory.navPage.activeWaypoint, this.hardware);

        const airspaceAlert = new AirspaceAlert(this.userSettings, sensors, this.messageHandler, facilityLoader, memory.navPage);
        const vnav = new Vnav(memory.navPage, sensors, flightplans[0]);

        const magvar = new KLNMagvar(sensors, memory.navPage);

        const modeController = new ModeController(this.bus, memory.navPage, flightplans[0], this.planeSettings, sensors, magvar);


        this.tickManager.addCalculations(
            [
                sensors,
                magvar,
                nearestLists.ndbNearestList,
                nearestLists.aptNearestList,
                nearestLists.vorNearestList,
                modeController,
                new NavCalculator(sensors, memory, magvar, this.userSettings, modeController, this.planeSettings),
                airspaceAlert,
                new HtAboveAirportAlert(memory.navPage, this.planeSettings, sensors, this.userSettings),
                new AltAlert(memory, this.planeSettings, sensors, this.userSettings),
                new Timers(sensors, this.userSettings, memory.dtPage),
                vnav,
                this.messageHandler,
                new RollSteeringController(sensors, memory, this.planeSettings),
            ], [
                new SignalOutputFillterTick(sensors),
            ]);

        this.simvarSync = new SimVarSync(this.powerSupply, this.planeSettings, this.tickManager, modeController, this.pageManager, brightnessManager, this.wtFlightplanSync, this.hardware);

        const msa = new MSA();

        //After VolatileMemory, whose power-on reset removes the procedures and drops the Direct To before the purge runs (#94, #422)
        this.temporaryWaypointDeleter = new TemporaryWaypointDeleter(facilityRepository, this.bus, flightplans, memory.navPage.activeWaypoint);

        if (!restoreSuccessFull) {
            this.messageHandler.addMessage(new OneTimeMessage(["USER DATA LOST"]));
        }

        const sidstar = new SidStar(facilityLoader, facilityRepository, sensors);

        this.platform.getRouteManager().then(manager => {
            this.efbSaver = new KlnEfbSaver(this.planeSettings!, manager, flightplans[0], this.hardware);
            this.efbLoader = new KlnEfbLoader(this.bus, facilityLoader, this.messageHandler, manager, flightplans, this.pageManager, facilityRepository, this.hardware, sidstar);
        });

        Promise.all([nearestUtils.init(), nearestLists.init(), airspaceAlert.init(), this.pendingCalls.track("msa.json", msa.init(this.planeSettings.basePath))]).then(() => {
            const props: PageProps = {
                ref: this.mainScreen,
                bus: this.bus,
                userSettings: this.userSettings,
                planeSettings: this.planeSettings!,
                sensors: sensors,
                pageManager: this.pageManager,
                messageHandler: this.messageHandler,
                hardware: this.hardware,
                memory: memory,
                facilityLoader: facilityLoader,
                facilityRepository: facilityRepository,
                nearestLists: nearestLists,
                nearestUtils: nearestUtils,
                remarksManager: new RemarksManager(this.bus, this.userSettings),
                scanLists: scanlists,
                msa: msa,
                vnav: vnav,
                modeController: modeController,
                database: new Database(sensors),
                magvar: magvar,
                sidstar: sidstar,
                pendingCalls: this.pendingCalls,
            };

            this.messageHandler.persistentMessages = buildPersistentMessages(props);

            console.log("Props ready", props);
            this.bus.getPublisher<PropsReadyEvent>().pub("propsReady", props);

            //this.bus.onAll(console.log);

        }).catch(e => {
            this.bus.getPublisher<ErrorEvent>().pub("error", e);
        });
    }

    /**
     * #83: the keyboard H event of a side. A cursor that is off is turned on first with that side's CRSR, under its
     * rules, then keyboard mode is entered under the rules of the left click on the CRSR field, or left when it is on.
     * The MSG page is closed first: the cursor beneath it decides, and one that is on stays on
     */
    private toggleKeyboard(side: KeyboardSide) {
        this.pageManager.closeMessagePage();
        const page = this.pageManager.getCurrentPage();
        const cursorActive = side === 'LEFT' ? page.isLeftCursorActive() : page.isRightCursorActive();
        if (!cursorActive) {
            this.pageManager.onInteractionEvent(side === 'LEFT' ? EVT_L_CURSOR : EVT_R_CURSOR);
        }
        this.pageManager.toggleKeyboard(side);
    }

    private handleKeyboardEvent(data: KeyboardEventData) {
        switch (data.keyCode) {
            case KEY_ENTER:
                this.dispatchInteractionEvent([EVT_ENT]);
                break;
            case KEY_PAGE_UP:
                switch (data.side) {
                    case "LEFT":
                        this.dispatchInteractionEvent([EVT_L_INNER_RIGHT]);
                        break;
                    case "RIGHT":
                        this.dispatchInteractionEvent([EVT_R_INNER_RIGHT]);
                        break;
                }
                break;
            case KEY_PAGE_DOWN:
                switch (data.side) {
                    case "LEFT":
                        this.dispatchInteractionEvent([EVT_L_INNER_LEFT]);
                        break;
                    case "RIGHT":
                        this.dispatchInteractionEvent([EVT_R_INNER_LEFT]);
                        break;
                }
                break;
            case KEY_BACK_SPACE:
            case KEY_END:
                switch (data.side) {
                    case "LEFT":
                        this.dispatchInteractionEvent([EVT_L_OUTER_LEFT]);
                        break;
                    case "RIGHT":
                        this.dispatchInteractionEvent([EVT_R_OUTER_LEFT]);
                        break;
                }
                break;
            case KEY_HOME:
                switch (data.side) {
                    case "LEFT":
                        this.dispatchInteractionEvent([EVT_L_OUTER_RIGHT]);
                        break;
                    case "RIGHT":
                        this.dispatchInteractionEvent([EVT_R_OUTER_RIGHT]);
                        break;
                }
                break;
            case KEY_DELETE:
                this.dispatchInteractionEvent([EVT_CLR]);
                break;
            default:
                if (data.keyCode >= KEY_0 && data.keyCode <= KEY_9 || //Number row
                    data.keyCode >= KEY_A && data.keyCode <= KEY_Z) { //Letters
                    const key = String.fromCharCode(data.keyCode).toUpperCase();
                    this.dispatchInteractionEvent([EVT_KEY + data.side + ":" + key]);
                } else if (data.keyCode >= KEY_NUMPAD0 && data.keyCode <= KEY_NUMPAD9) { //Numpad
                    const key = String(data.keyCode - 96);
                    this.dispatchInteractionEvent([EVT_KEY + data.side + ":" + key]);
                }
        }
    }

    /**
     * True if this is not a cold and dark start. The KLN90B should be started running and ready to use
     * @private
     */
    private isForceReadyToUse(): boolean {
        return !!SimVar.GetSimVarValue("ENG COMBUSTION:1", SimVarValueType.Bool);
    }


}