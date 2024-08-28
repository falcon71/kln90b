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
// noinspection JSUnusedGlobalSymbols

import {
    DisplayComponent,
    EventBus,
    Facility,
    FacilityLoader,
    FacilityRepository,
    FSComponent,
    HEventPublisher,
    ICAO,
    NodeReference,
    SimVarValueType,
    Subscription,
} from '@microsoft/msfs-sdk';

import '../KLN90B.scss';
import {PowerButton} from "./PowerButton";
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
import {KLNFacilityRepository} from "./data/navdata/KLNFacilityRepository";
import {UserWaypointPersistor} from "./settings/UserWaypointPersistor";
import {Scanlists} from "./data/navdata/Scanlist";
import {
    EVT_CLR,
    EVT_ENT,
    EVT_KEY,
    EVT_L_INNER_LEFT,
    EVT_L_INNER_RIGHT,
    EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT,
    EVT_R_INNER_LEFT,
    EVT_R_INNER_RIGHT,
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
import {ErrorEvent} from "./controls/ErrorPage";
import {SignalOutputFillterTick} from "./services/SignalOutputFillterTick";

export interface PropsReadyEvent {
    propsReady: PageProps;
}

/**
 * Congratulations on finding the primary class. This is how it all begins. The second most interesting class would be
 * MainPage. After that, PageTreeController will guide you to the individual screens.
 * Numbers like 1-12 reference a page in the manual that contains further information and reference:
 * https://www.bendixking.com/content/dam/bendixking/en/documents/document-lists/downloads-and-manuals/006-08773-0000-KLN-90B-Pilots-Guide.pdf
 */
class KLN90B extends BaseInstrument {
    private readonly bus = new EventBus();
    private keyboardEventSub: Subscription;

    private powerButton: PowerButton | undefined;
    private readonly hEventPublisher: HEventPublisher;
    private readonly settingSaveManager: KLN90BSettingSaveManager;

    private readonly mainScreen: NodeReference<DisplayComponent<any, any> | HTMLElement | SVGElement>;
    private readonly pageManager: PageManager;

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


    constructor() {
        super();

        this.mainScreen = FSComponent.createRef();

        this.userSettings = new KLN90BUserSettings(this.bus);
        this.settingSaveManager = new KLN90BSettingSaveManager(this.bus, this.userSettings);
        const saveKey = `${SimVar.GetSimVarValue('ATC MODEL', SimVarValueType.String)}.profile_1`;
        console.log(saveKey);
        this.settingSaveManager.load(saveKey);
        this.settingSaveManager.startAutoSave(saveKey);

        this.hEventPublisher = new HEventPublisher(this.bus);

        this.keyboardEventSub = this.bus.getSubscriber<KeyboardEvent>().on("keyboardevent").handle(this.handleKeyboardEvent.bind(this));

        this.pageManager = new PageManager();

    }

    get templateID(): string {
        return 'KLN90B';
    }


    get isInteractive(): boolean {
        return true;
    }


    Init() {
        super.Init();

        // noinspection JSIgnoredPromiseFromCall
        this.asyncInit();

    }

    /**
     * A callback for when sounds are done playing.  This is needed to support the sound server.
     * @param soundEventId The sound that got played.
     */
    public onSoundEnd(soundEventId: Name_Z): void {
        this.audioGenerator?.onSoundEnd(soundEventId);
    }

    connectedCallback(): void {
        super.connectedCallback();
    }

    onInteractionEvent(args: Array<string>): void {
        super.onInteractionEvent(args);
        try {
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

            this.hEventPublisher.dispatchHEvent(evt);
            this.pageManager.onInteractionEvent(evt);
        } catch (e) {
            console.error(e);
            if (e instanceof Error) {
                this.bus.getPublisher<ErrorEvent>().pub("error", e);
            }
        }

    }

    private async asyncInit() {
        //The xml is not available before init!
        this.planeSettings = new KLN90BPlaneSettingsParser().parsePlaneSettings(this.xmlConfig);

        const forceReadyToUse = this.isForceReadyToUse();

        console.log("forceReadyToUse", forceReadyToUse);

        this.pageManager.Init(this.bus, this.userSettings);
        this.powerButton = new PowerButton({
            bus: this.bus,
            userSettings: this.userSettings,
            planeSettings: this.planeSettings,
            pageManager: this.pageManager,
            forceReadyToUse: forceReadyToUse,
        });

        //From now on, the welcome page may be shown. This gives us time to initialize everything here.
        //Lots of coherent calls, might take a while


        this.audioGenerator = new AudioGenerator(this.bus, this.planeSettings);
        const sensors = new Sensors(this.bus, this.userSettings, this.planeSettings, this.audioGenerator, this.messageHandler);

        this.hEventPublisher.startPublish();
        console.log("KLN 90B ready to show welcome page");

        if (forceReadyToUse) {
            this.powerButton.forceReadyToUse();
        }

        let restoreSuccessFull = true;

        const facilityLoader = new KLNFacilityLoader(
            new FacilityLoader(FacilityRepository.getRepository(this.bus)),
            KLNFacilityRepository.getRepository(this.bus),
        );

        const scanlists = new Scanlists(facilityLoader);

        this.userWaypointPersistor = new UserWaypointPersistor(this.bus, facilityLoader.facilityRepo);
        try {
            this.userWaypointPersistor.restoreWaypoints();
        } catch (e) {
            restoreSuccessFull = false;
        }

        this.userFlightplanPersistor = new UserFlightplanPersistor(this.bus, facilityLoader, this.messageHandler, this.planeSettings);

        const nearestLists = new Nearestlists(facilityLoader, sensors, this.userSettings);
        const nearestUtils = new NearestUtils(facilityLoader);

        const lastActiveIcao: string | null = this.userSettings.getSetting("activeWaypoint").get();
        let lastActiveWaypoint: Facility | null = null;
        if (lastActiveIcao !== "") {
            try {
                lastActiveWaypoint = await facilityLoader.getFacility(ICAO.getFacilityType(lastActiveIcao), lastActiveIcao);
            } catch (e) {
                console.error(`Last active waypoint not found: ${lastActiveIcao}`, e);
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

        const memory = new VolatileMemory(this.bus, this.userSettings, facilityLoader, sensors, scanlists, flightplans, lastActiveWaypoint);


        const airspaceAlert = new AirspaceAlert(this.userSettings, sensors, this.messageHandler, facilityLoader, memory.navPage);
        const vnav = new Vnav(memory.navPage, sensors, flightplans[0]);

        const magvar = new KLNMagvar(sensors, memory.navPage);

        const modeController = new ModeController(this.bus, memory.navPage, flightplans[0], this.planeSettings, sensors, magvar);


        this.tickManager = new TickController(this.bus, [this.pageManager],
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
                new AltAlert(memory, this.planeSettings, sensors),
                new Timers(sensors, this.userSettings, memory.dtPage),
                vnav,
                this.messageHandler,
            ], [
                new SignalOutputFillterTick(sensors),
            ]);

        this.simvarSync = new SimVarSync(this.powerButton, this.planeSettings, this.tickManager, modeController, this.pageManager);

        const msa = new MSA();

        this.temporaryWaypointDeleter = new TemporaryWaypointDeleter(facilityLoader.facilityRepo, this.bus, flightplans);

        if (!restoreSuccessFull) {
            this.messageHandler.addMessage(new OneTimeMessage(["USER DATA LOST"]));
        }

        Promise.all([nearestUtils.init(), nearestLists.init(), airspaceAlert.init(), msa.init(this.planeSettings.basePath)]).then(() => {
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
                nearestLists: nearestLists,
                nearestUtils: nearestUtils,
                remarksManager: new RemarksManager(this.bus, this.userSettings),
                scanLists: scanlists,
                msa: msa,
                vnav: vnav,
                modeController: modeController,
                database: new Database(this.bus, sensors, this.messageHandler),
                magvar: magvar,
                sidstar: new SidStar(facilityLoader, sensors),
            };

            this.messageHandler.persistentMessages = buildPersistentMessages(props);

            console.log("Props ready", props);
            this.bus.getPublisher<PropsReadyEvent>().pub("propsReady", props);

            //this.bus.onAll(console.log);

        });
    }

    private handleKeyboardEvent(data: KeyboardEventData) {
        switch (data.keyCode) {
            case 13: //Enter
                this.onInteractionEvent([EVT_ENT]);
                break;
            case 33: // Page up
                switch (data.side) {
                    case "LEFT":
                        this.onInteractionEvent([EVT_L_INNER_RIGHT]);
                        break;
                    case "RIGHT":
                        this.onInteractionEvent([EVT_R_INNER_RIGHT]);
                        break;
                }
                break;
            case 34: // Page Down
                switch (data.side) {
                    case "LEFT":
                        this.onInteractionEvent([EVT_L_INNER_LEFT]);
                        break;
                    case "RIGHT":
                        this.onInteractionEvent([EVT_R_INNER_LEFT]);
                        break;
                }
                break;
            case 8: // Backspace
            case 35: // End
                switch (data.side) {
                    case "LEFT":
                        this.onInteractionEvent([EVT_L_OUTER_LEFT]);
                        break;
                    case "RIGHT":
                        this.onInteractionEvent([EVT_R_OUTER_LEFT]);
                        break;
                }
                break;
            case 36: // Home
                switch (data.side) {
                    case "LEFT":
                        this.onInteractionEvent([EVT_L_OUTER_RIGHT]);
                        break;
                    case "RIGHT":
                        this.onInteractionEvent([EVT_R_OUTER_RIGHT]);
                        break;
                }
                break;
            case 46: // Delete
                this.onInteractionEvent([EVT_CLR]);
                break;
            default:
                if (data.keyCode >= 48 && data.keyCode <= 57 || //Number row
                    data.keyCode >= 65 && data.keyCode <= 90) { //Letters
                    const key = String.fromCharCode(data.keyCode).toUpperCase();
                    this.onInteractionEvent([EVT_KEY + data.side + ":" + key]);
                } else if (data.keyCode >= 96 && data.keyCode <= 105) { //Numpad
                    const key = String(data.keyCode - 96);
                    this.onInteractionEvent([EVT_KEY + data.side + ":" + key]);
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

registerInstrument('kln-90b', KLN90B);