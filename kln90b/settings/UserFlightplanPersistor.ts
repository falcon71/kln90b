import {
    DefaultUserSettingManager,
    EventBus,
    FlightPlan,
    FlightPlanLegEvent,
    FlightPlanner,
    LegDefinition,
} from "@microsoft/msfs-sdk";
import {KLN90BUserFlightplansSettings, KLN90BUserFlightplansTypes} from "./KLN90BUserFlightplans";
import {KLNFacilityLoader} from "../data/navdata/KLNFacilityLoader";
import {AsoboFlightplanLoader} from "./AsoboFlightplanLoader";
import {MessageHandler} from "../data/MessageHandler";
import {AsoboFlightplanSaver} from "./AsoboFlightplanSaver";
import {KLN90PlaneSettings} from "./KLN90BPlaneSettings";
import {Flightplanloader} from "../services/Flightplanloader";

/**
 * In the real unit, FPL 0 is also persisted: https://youtu.be/S1lt2W95bLA?t=181
 * We however load it from the simulator flightplan
 */
export class UserFlightplanPersistor extends Flightplanloader {
    private manager: DefaultUserSettingManager<KLN90BUserFlightplansTypes>;
    private asoboFlightplanSaver: AsoboFlightplanSaver = new AsoboFlightplanSaver();


    constructor(bus: EventBus, private readonly flightPlanner: FlightPlanner, facilityLoader: KLNFacilityLoader, messageHandler: MessageHandler, private readonly planeSettings: KLN90PlaneSettings) {
        super(facilityLoader, messageHandler);
        flightPlanner.onEvent('fplLegChange').handle(this.persistFlightplan.bind(this));
        this.manager = KLN90BUserFlightplansSettings.getManager(bus);
    }

    public restoreAllFlightplan(): Promise<FlightPlan[]> {
        const promises = Array(26).fill(undefined).map((_, i) => this.restoreFlightplan.bind(this)(i));
        return Promise.all(promises);
    }

    public async restoreFlightplan(idx: number): Promise<FlightPlan> {
        if (idx === 0) {
            try {
                return new AsoboFlightplanLoader(this.facilityLoader, this.messageHandler).loadAsoboFlightplan();
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
                return this.flightPlanner.createFlightPlan(idx);
            }

            const serializedLegs = serialized.match(/.{1,12}/g)!;
            return await this.loadIcaos(this.flightPlanner.createFlightPlan(idx), serializedLegs);
        } catch (e) {
            console.log(`Error restoring fpl ${idx}`, e);
            throw e;
        }
    }

    private persistFlightplan(e: FlightPlanLegEvent) {
        const fpl = this.flightPlanner.getFlightPlan(e.planIndex);
        if (fpl.planIndex === 0 && this.planeSettings.output.writeGPSSimVars) {
            this.asoboFlightplanSaver.saveToAsoboFlightplan(fpl);
            return;
        }

        const setting = this.manager.getSetting(`fpl${fpl.planIndex - 1}`);

        let serialized = "";
        for (const leg of fpl.legs()) {
            serialized += this.serializeLeg(leg)
        }
        console.log("persisting flightplan", fpl, serialized);
        setting.set(serialized);
    }

    private serializeLeg(leg: LegDefinition): string {
        return leg.leg.fixIcao;
    }


}