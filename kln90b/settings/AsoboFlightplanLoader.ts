import {Flightplan, KLNLegType} from "../data/flightplan/Flightplan";
import {EventBus, Facility, ICAO, Wait} from "@microsoft/msfs-sdk";
import {KLNFacilityLoader} from "../data/navdata/KLNFacilityLoader";
import {Message, MessageHandler, OneTimeMessage} from "../data/MessageHandler";

interface AsoboFlightplan {
    arrivalWaypointsSize: number,
    departureWaypointsSize: number,
    waypoints: AsoboFlightplanLeg[],
}


interface AsoboFlightplanLeg {
    icao: string,
}

export class AsoboFlightplanLoader {
    static fpListenerInitialized = false;


    constructor(private readonly bus: EventBus, private readonly facilityLoader: KLNFacilityLoader, private messageHandler: MessageHandler) {
    }

    /**
     * Inits flight plan asobo sync
     */
    public static async init(): Promise<void> {
        return new Promise((resolve) => {
            if (AsoboFlightplanLoader.fpListenerInitialized) {
                resolve();
            } else {
                RegisterViewListener('JS_LISTENER_FLIGHTPLAN', () => {
                    AsoboFlightplanLoader.fpListenerInitialized = true;
                    resolve();
                });
            }
        });
    }


    public async loadAsoboFlightplan(): Promise<Flightplan> {
        console.log("loading asobo flightplan");
        await AsoboFlightplanLoader.init();
        Coherent.call('LOAD_CURRENT_ATC_FLIGHTPLAN');
        // Coherent.call('LOAD_CURRENT_GAME_FLIGHT');
        await Wait.awaitDelay(3000);

        const data = await Coherent.call('GET_FLIGHTPLAN') as AsoboFlightplan;

        console.log("asobo flightplan", data);

        const waypoints = this.filterProcedures(data);

        let messages: Message[] = [];

        for (let i = 30; i < waypoints.length; i++) { //I'm terribly sorry, but the KLN90B flightplans can only have a maximum of 30 legs
            messages.push(new OneTimeMessage([`WAYPOINT ${ICAO.getIdent(waypoints[i].icao)} DELETED`]));
        }

        if (messages.length > 10) {
            messages = messages.slice(0, 10);
            messages.push(new OneTimeMessage(["OTHER WAYPOINTS DELETED"]));
        }

        messages.forEach(this.messageHandler.addMessage);

        const promises: Promise<Facility>[] = waypoints.slice(0, 30).map(wpt => this.facilityLoader.getFacility(ICAO.getFacilityType(wpt.icao), wpt.icao));

        const legs = await Promise.all(promises);

        const fpl = new Flightplan(0, legs.map(f => ({wpt: f, type: KLNLegType.USER})), this.bus);
        console.log("flightplan 0 restored", fpl);
        return fpl;
    }

    /**
     * The real device removes all procedures after it has been turned off for more than 5 minutes.
     * This has several advantages: We keep the number of waypoints below 30 and we can't have unsupported procedures
     * @private
     * @param plan
     */
    private filterProcedures(plan: AsoboFlightplan): AsoboFlightplanLeg[] {
        if (plan.waypoints.length < 2) {
            return [];
        }

        // If there is no departure, start at index 1 (index 0 is always the "origin")
        // If there is a departure, start at the last departure wpt (a departure guarantees an origin, so the
        // departure itself starts at index 1 -> the last departure wpt is at [1 + departureWaypointsSize - 1]). The
        // reason we start here is to catch any airways that begin with the last departure wpt.
        const enrouteStart = plan.departureWaypointsSize <= 0
            ? 1
            : plan.departureWaypointsSize;
        // If there is no arrival, end with the second-to-last waypoint (we skip the last waypoint even if it is not the
        // destination airport because it will get handled elsewhere). If there is an arrival, then the last enroute
        // waypoint will be at index [length - 2 - arrivalWaypointsSize] (i.e. counting backwards from the end, we skip the
        // destination airport, then every waypoint in the arrival).
        const enrouteEnd = plan.arrivalWaypointsSize <= 0
            ? -1
            : -(plan.arrivalWaypointsSize + 1);
        return [plan.waypoints[0], ...plan.waypoints.slice(enrouteStart, enrouteEnd), plan.waypoints[plan.waypoints.length - 1]];
    }

}