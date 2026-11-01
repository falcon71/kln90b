import {DefaultUserSettingManager, EventBus, FacilityClient, ICAO} from "@microsoft/msfs-sdk";
import {KLN90BUserFlightplansSettings, KLN90BUserFlightplansTypes} from "./KLN90BUserFlightplans";
import {Flightplan} from "../data/flightplan/Flightplan";
import {MessageHandler} from "../data/MessageHandler";
import {Flightplanloader} from "../services/Flightplanloader";
import {UserFlightplanLoader} from "./UserFlightplanPersistor";
import {decodeFlyOverTrailer} from "./FlyOverTrailer";


export class UserFlightplanLoaderV2 extends Flightplanloader implements UserFlightplanLoader {
    private manager: DefaultUserSettingManager<KLN90BUserFlightplansTypes>;

    constructor(bus: EventBus, facilityLoader: FacilityClient, messageHandler: MessageHandler) {
        super(bus, facilityLoader, messageHandler);
        this.manager = KLN90BUserFlightplansSettings.getManager(bus);
    }

    public restoreAllFlightplan(): Promise<Flightplan[]> {
        const promises = Array(26).fill(undefined).map((_, i) => this.restoreFlightplan.bind(this)(i));
        return Promise.all(promises);
    }

    private async restoreFlightplan(idx: number): Promise<Flightplan> {
        try {
            const setting = this.manager.getSetting(`fpl${idx}`);

            const serialized = setting.get();
            console.log(`restoring flightplan ${idx}`, serialized);

            if (serialized === "") {
                return new Flightplan(idx, [], this.bus);
            }

            // The legs are cells of 19 characters. What does not fill a cell is the fly-over trailer (#77)
            const trailerLength = serialized.length % 19;
            const legsLength = serialized.length - trailerLength;
            const serializedLegs = serialized.substring(0, legsLength).match(/.{19}/g)?.map(ICAO.stringV2ToValue) ?? [];
            const flyOver = decodeFlyOverTrailer(serialized.substring(legsLength), serializedLegs.length);
            return await this.loadIcaos(serializedLegs, idx, flyOver);
        } catch (e) {
            console.log(`Error restoring fpl ${idx}`, e);
            throw e;
        }
    }


}