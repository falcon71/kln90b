import {DefaultUserSettingManager, EventBus, FacilityClient, ICAO} from "@microsoft/msfs-sdk";
import {KLN90BUserFlightplansSettings, KLN90BUserFlightplansTypes} from "./KLN90BUserFlightplans";
import {Flightplan, FlightplanEvents, KLNFlightplanLeg} from "../data/flightplan/Flightplan";
import {AsoboFlightplanLoader} from "./AsoboFlightplanLoader";
import {MessageHandler} from "../data/MessageHandler";
import {AsoboFlightplanSaver} from "./AsoboFlightplanSaver";
import {KLN90PlaneSettings} from "./KLN90BPlaneSettings";
import {Flightplanloader} from "../services/Flightplanloader";
import {KLNFacilityRepository} from "../data/navdata/KLNFacilityRepository";

/**
 * In the real unit, FPL 0 is also persisted: https://youtu.be/S1lt2W95bLA?t=181
 * We however load it from the simulator flightplan
 */
export class UserFlightplanPersistor extends Flightplanloader {
    private manager: DefaultUserSettingManager<KLN90BUserFlightplansTypes>;
    private asoboFlightplanSaver: AsoboFlightplanSaver = new AsoboFlightplanSaver();

    constructor(bus: EventBus, facilityLoader: FacilityClient, private readonly facilityRepository: KLNFacilityRepository, messageHandler: MessageHandler, private readonly planeSettings: KLN90PlaneSettings) {
        super(bus, facilityLoader, messageHandler);
        bus.getSubscriber<FlightplanEvents>().on("flightplanChanged").handle(this.persistFlightplan.bind(this));
        this.manager = KLN90BUserFlightplansSettings.getManager(bus);
    }

    public restoreAllFlightplan(): Promise<Flightplan[]> {
        const promises = Array(26).fill(undefined).map((_, i) => this.restoreFlightplan.bind(this)(i));
        return Promise.all(promises);
    }

    public async restoreFlightplan(idx: number): Promise<Flightplan> {
        if (idx === 0) {
            try {
                return new AsoboFlightplanLoader(this.bus, this.facilityLoader, this.facilityRepository, this.messageHandler).loadAsoboFlightplan();
            } catch (e) {
                console.log("Error restoring fpl 0", e);
                throw e;
            }
        }
        try {
            const setting = this.manager.getSetting(`fpl${idx - 1}`);

            const serialized = setting.get();
            console.log(`restoring flightplan ${idx}`, serialized);

            if (serialized === "") {
                return new Flightplan(idx, [], this.bus);
            }

            const serializedLegs = serialized.match(/.{1,19}/g)!.map(ICAO.stringV2ToValue);
            return await this.loadIcaos(serializedLegs, idx);
        } catch (e) {
            console.log(`Error restoring fpl ${idx}`, e);
            throw e;
        }
    }

    private persistFlightplan(fpl: Flightplan) {
        if (fpl.idx === 0 && this.planeSettings.output.writeGPSSimVars) {
            this.asoboFlightplanSaver.saveToAsoboFlightplan(fpl);
            return;
        }

        const setting = this.manager.getSetting(`fpl${fpl.idx - 1}`);

        let serialized = "";
        for (const leg of fpl.getLegs()) {
            serialized += this.serializeLeg(leg)
        }
        console.log("persisting flightplan", fpl, serialized);
        setting.set(serialized);
    }

    private serializeLeg(leg: KLNFlightplanLeg): string {
        return ICAO.valueToStringV2(leg.wpt.icaoStruct);
    }


}