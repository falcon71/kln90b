import {DefaultUserSettingManager, EventBus, FacilityClient, ICAO} from "@microsoft/msfs-sdk";
import {KLN90BUserFlightplansSettings, KLN90BUserFlightplansTypes} from "./KLN90BUserFlightplans";
import {Flightplan, FlightplanEvents, KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {MessageHandler} from "../data/MessageHandler";
import {Flightplanloader} from "../services/Flightplanloader";
import {KLN90BUserSettings} from "./KLN90BUserSettings";
import {UserFlightplanLoaderV2} from "./UserFlightplanLoaderV2";
import {UserFlightplanLoaderV1} from "./UserFlightplanLoaderV1";


export interface UserFlightplanLoader {
    restoreAllFlightplan(): Promise<Flightplan[]>;
}

/**
 * In the real unit, FPL 0 is also persisted: https://youtu.be/S1lt2W95bLA?t=181
 */
export class UserFlightplanPersistor extends Flightplanloader {
    private manager: DefaultUserSettingManager<KLN90BUserFlightplansTypes>;

    private v1Loader: UserFlightplanLoader;
    private v2Loader: UserFlightplanLoader;


    constructor(bus: EventBus, facilityLoader: FacilityClient, messageHandler: MessageHandler, private readonly userSettings: KLN90BUserSettings) {
        super(bus, facilityLoader, messageHandler);
        bus.getSubscriber<FlightplanEvents>().on("flightplanChanged").handle(this.persistFlightplan.bind(this));
        this.manager = KLN90BUserFlightplansSettings.getManager(bus);
        this.v1Loader = new UserFlightplanLoaderV1(bus, facilityLoader, messageHandler);
        this.v2Loader = new UserFlightplanLoaderV2(bus, facilityLoader, messageHandler);
    }

    public restoreAllFlightplan(): Promise<Flightplan[]> {
        if (this.userSettings.getSetting("userDataFormat").get() === 2) {
            return this.v2Loader.restoreAllFlightplan();
        } else {
            return this.v1Loader.restoreAllFlightplan();
        }


    }

    public persistFlightplan(fpl: Flightplan) {
        const setting = this.manager.getSetting(`fpl${fpl.idx}`);

        let serialized = "";
        for (const leg of fpl.getLegs()) {
            if (leg.type === KLNLegType.USER) {
                serialized += this.serializeLeg(leg);
            }
        }
        console.log("persisting flightplan", fpl, serialized);
        setting.set(serialized);
    }

    private serializeLeg(leg: KLNFlightplanLeg): string {
        return ICAO.valueToStringV2(leg.wpt.icaoStruct);
    }


}