import {Flightplan} from "../data/flightplan/Flightplan";
import {Wait} from "@microsoft/msfs-sdk";
import {Flightplanloader} from "../services/Flightplanloader";

interface AsoboFlightplan {
    arrivalWaypointsSize: number,
    departureWaypointsSize: number,
    waypoints: AsoboFlightplanLeg[],
}


interface AsoboFlightplanLeg {
    icao: string,
}

export class AsoboFlightplanLoader extends Flightplanloader {
    static fpListenerInitialized = false;


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

        const icaos = this.filterProcedures(data).map(leg => leg.icao);

        return this.loadIcaos(icaos);
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