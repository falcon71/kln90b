import {Flightplan, KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {Message, MessageHandler, OneTimeMessage} from "../data/MessageHandler";
import {EventBus, FacilityClient, ICAO, IcaoValue} from "@microsoft/msfs-sdk";
import {buildIcaoStructIdentOnly} from "../data/navdata/IcaoBuilder";

export abstract class Flightplanloader {
    protected constructor(protected readonly bus: EventBus, protected readonly facilityLoader: FacilityClient, protected messageHandler: MessageHandler) {
    }

    /**
     * Converts the list of icaos into a KLN flightplan. It will keep the number of legs below 30 and it will ignore
     * wapoints that can no longer be found. Messages will be generated for each deleted waypoint
     * @param icaos
     * @param fplIdx
     * @protected
     */
    protected async loadIcaos(icaos: IcaoValue[], fplIdx: number = 0): Promise<Flightplan> {
        let messages: Message[] = [];

        for (let i = 30; i < icaos.length; i++) { //I'm terribly sorry, but the KLN90B flightplans can only have a maximum of 30 legs
            messages.push(new OneTimeMessage([`WAYPOINT ${icaos[i].ident} DELETED`]));
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

    /**
     * This waypoint will not be found and cause a WAYPOINT DELETED message
     * @param ident
     * @protected
     */
    protected notFoundIcao(ident: string): IcaoValue {
        return buildIcaoStructIdentOnly(ident);
    }

    private async convertToKLNLeg(icao: IcaoValue): Promise<KLNFlightplanLeg | OneTimeMessage> {
        try {
            const facility = await this.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(icao), icao);
            return {wpt: facility, type: KLNLegType.USER};
        } catch (e) {
            console.error(`Error converting ${icao}`, e);
            return new OneTimeMessage([`WAYPOINT ${icao.ident} DELETED`]);
        }
    }
}