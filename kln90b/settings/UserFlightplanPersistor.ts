import {DefaultUserSettingManager, EventBus, ICAO} from "@microsoft/msfs-sdk";
import {KLN90BUserFlightplansSettings, KLN90BUserFlightplansTypes} from "./KLN90BUserFlightplans";
import {Flightplan, FlightplanEvents, KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {KLNFacilityLoader} from "../data/navdata/KLNFacilityLoader";
import {AsoboFlightplanLoader} from "./AsoboFlightplanLoader";
import {MessageHandler, OneTimeMessage} from "../data/MessageHandler";
import {AsoboFlightplanSaver} from "./AsoboFlightplanSaver";
import {KLN90PlaneSettings} from "./KLN90BPlaneSettings";

/**
 * In the real unit, FPL 0 is also persisted: https://youtu.be/S1lt2W95bLA?t=181
 * We however load it from the simulator flightplan
 */
export class UserFlightplanPersistor {
    private manager: DefaultUserSettingManager<KLN90BUserFlightplansTypes>;
    private asoboFlightplanSaver: AsoboFlightplanSaver = new AsoboFlightplanSaver();


    constructor(private readonly bus: EventBus, private readonly facilityLoader: KLNFacilityLoader, private readonly messageHandler: MessageHandler, private readonly planeSettings: KLN90PlaneSettings) {
        bus.getSubscriber<FlightplanEvents>().on("flightplanChanged").handle(this.persistFlightplan.bind(this));
        this.manager = KLN90BUserFlightplansSettings.getManager(bus);
    }

    public restoreAllFlightplan(): Promise<Flightplan[]> {
        const promises = Array(26).fill(undefined).map((_, i) => this.restoreFlightplan.bind(this)(i));
        return Promise.all(promises);
    }

    public async restoreFlightplan(idx: number): Promise<Flightplan> {
        if (idx === 0) {
            return new AsoboFlightplanLoader(this.bus, this.facilityLoader, this.messageHandler).loadAsoboFlightplan();
        }

        const setting = this.manager.getSetting(`fpl${idx - 1}`);

        const serialized = setting.get();
        console.log(`restoring flightplan ${idx}`, serialized);

        if (serialized === "") {
            return new Flightplan(idx, [], this.bus);
        }

        const serializedLegs = serialized.match(/.{1,12}/g)!;
        const promises = serializedLegs.map(this.deserializeLeg.bind(this));
        const legs = await Promise.all(promises);

        const fpl = new Flightplan(idx, legs.filter(l => l !== null) as any, this.bus);
        console.log(`flightplan ${idx} restored`, fpl);
        return fpl;
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
        return leg.wpt.icao;
    }

    private async deserializeLeg(serialized: string): Promise<KLNFlightplanLeg | null> {
        try {
            const facility = await this.facilityLoader.getFacility(ICAO.getFacilityType(serialized), serialized);
            return {wpt: facility, type: KLNLegType.USER};
        } catch (e) {
            this.messageHandler.addMessage(new OneTimeMessage([`WAYPOINT ${ICAO.getIdent(serialized)} DELETED`]));
            //todo OTHER WAYPOINTS DELETED?
        }
        return null;
    }

}