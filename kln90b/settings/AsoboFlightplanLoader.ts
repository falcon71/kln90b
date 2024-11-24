import {Flightplan} from "../data/flightplan/Flightplan";
import {ICAO, IcaoValue, UserFacility, UserFacilityType, Wait} from "@microsoft/msfs-sdk";
import {Flightplanloader} from "../services/Flightplanloader";
import {StatusLineMessageEvents} from "../controls/StatusLine";
import {getUniqueIdent} from "../data/navdata/UniqueIdentGenerator";
import {buildIcao, buildIcaoStruct, TEMPORARY_WAYPOINT} from "../data/navdata/IcaoBuilder";

interface AsoboFlightplan {
    arrivalWaypointsSize: number,
    departureWaypointsSize: number,
    waypoints: AsoboFlightplanLeg[],
}


interface AsoboFlightplanLeg {
    icao: string,
    ident: string,
    lla: LatLongAlt,
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
        const icaos: IcaoValue[] = [];

        for (const leg of this.filterProcedures(data)) {
            //It is important, that this code is synchronized, so the waypoint gets added to the facility, before the next getUniqueIdent is called
            const icao = await this.mapLeg(leg);
            if (icao !== null) {
                icaos.push(icao);
            }
        }

        return this.loadIcaos(icaos);
    }

    private async mapLeg(leg: AsoboFlightplanLeg): Promise<IcaoValue> {
        if (leg.icao.length == 12) {
            return ICAO.stringV1ToValue(leg.icao);
        }

        //Will be added as a temporary user waypoint
        const ident = await getUniqueIdent(leg.ident.toUpperCase(), this.facilityLoader);

        if (ident === null) {
            return this.notFoundIcao(leg.ident.substring(0, 5).toUpperCase());
        }

        // noinspection JSDeprecatedSymbols
        const facility: UserFacility = {
            icao: buildIcao('U', TEMPORARY_WAYPOINT, ident),
            icaoStruct: buildIcaoStruct('U', TEMPORARY_WAYPOINT, ident),
            name: "",
            lat: leg.lla.lat,
            lon: leg.lla.long,
            region: TEMPORARY_WAYPOINT,
            city: "",
            isTemporary: false, //irrelevant, because this flag is not persisted
            userFacilityType: UserFacilityType.LAT_LONG,
        };
        console.log("Adding temporary user waypoint", facility);

        try {
            this.facilityLoader.facilityRepo.add(facility);
            return facility.icaoStruct;
        } catch (e) {
            this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
            return this.notFoundIcao(leg.ident.substring(0, 5).toUpperCase());
        }

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