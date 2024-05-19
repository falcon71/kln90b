import {Flightplan, KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {Message, MessageHandler, OneTimeMessage} from "../data/MessageHandler";
import {EventBus, ICAO} from "@microsoft/msfs-sdk";
import {KLNFacilityLoader} from "../data/navdata/KLNFacilityLoader";

export abstract class Flightplanloader {
    public constructor(protected readonly bus: EventBus, protected readonly facilityLoader: KLNFacilityLoader, protected messageHandler: MessageHandler) {
    }

    /**
     * Converts the list of icaos into a KLN flightplan. It will keep the number of legs below 30 and it will ignore
     * wapoints that can no longer be found. Messages will be generated for each deleted waypoint
     * @param icaos
     * @param fplIdx
     * @protected
     */
    protected async loadIcaos(icaos: string[], fplIdx: number = 0): Promise<Flightplan> {
        let messages: Message[] = [];

        for (let i = 30; i < icaos.length; i++) { //I'm terribly sorry, but the KLN90B flightplans can only have a maximum of 30 legs
            messages.push(new OneTimeMessage([`WAYPOINT ${ICAO.getIdent(icaos[i])} DELETED`]));
        }

        const promises = icaos.slice(0, 30).map(this.convertToKLNLeg.bind(this));
        const legs = await Promise.all(promises);

        messages.push(...(legs.filter(l => l instanceof OneTimeMessage) as OneTimeMessage[]));
        if (messages.length > 10) {
            messages = messages.slice(0, 10);
            messages.push(new OneTimeMessage(["OTHER WAYPOINTS DELETED"]));
        }
        messages.forEach(this.messageHandler.addMessage.bind(this.messageHandler));

        const fpl = new Flightplan(fplIdx, legs.filter(l => !(l instanceof OneTimeMessage)) as KLNFlightplanLeg[], this.bus);
        console.log("loaded flightplan", fpl);
        return fpl;
    }

    private async convertToKLNLeg(icao: string): Promise<KLNFlightplanLeg | OneTimeMessage> {
        try {
            const facility = await this.facilityLoader.getFacility(ICAO.getFacilityType(icao), icao);
            return {wpt: facility, type: KLNLegType.USER};
        } catch (e) {
            console.error(`Error converting ${icao}`, e);
            return new OneTimeMessage([`WAYPOINT ${ICAO.getIdent(icao)} DELETED`]);
        }
    }
}