import {KLNFacilityRepository} from "../data/navdata/KLNFacilityRepository";
import {EventBus, FacilityType, ICAO, UserFacility} from "@microsoft/msfs-sdk";
import {PowerEvent} from "../PowerButton";
import {Flightplan} from "../data/flightplan/Flightplan";
import {TEMPORARY_WAYPOINT} from "../data/navdata/IcaoBuilder";

export class TemporaryWaypointDeleter {

    constructor(private readonly repo: KLNFacilityRepository, bus: EventBus, private readonly flightplans: Flightplan[]) {
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.deleteUnusedTemporaryWaypoints.bind(this));
    }

    public static findUsageInFlightplans(icao: string, flightplans: Flightplan[]): number | null {
        for (const flightplan of flightplans) {
            if (flightplan.getLegs().some(leg => leg.wpt.icao === icao)) {
                return flightplan.idx;
            }
        }
        return null;
    }

    /**
     * 5-22
     * @private
     */
    private deleteUnusedTemporaryWaypoints() {
        console.log("Deleting unused waypoints");
        this.repo.forEach(fac => {
            const userFac = fac as UserFacility;
            //Region XY marks this as temporary. isTemporary can't be used, because that is not persisted
            if (ICAO.getRegionCode(userFac.icao) === TEMPORARY_WAYPOINT && TemporaryWaypointDeleter.findUsageInFlightplans(userFac.icao, this.flightplans) === null) {
                console.log("Deleting unused waypoint:", userFac);
                this.repo.remove(userFac);
            }
        }, [FacilityType.USR]);
    }

}