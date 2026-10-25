import {KLNFacilityRepository} from "../data/navdata/KLNFacilityRepository";
import {EventBus, FacilityType, ICAO, IcaoValue, UserFacility} from "@microsoft/msfs-sdk";
import {PowerEvent} from "../PowerSupply";
import {Flightplan} from "../data/flightplan/Flightplan";
import {TEMPORARY_WAYPOINT} from "../data/navdata/IcaoBuilder";
import {ActiveWaypoint} from "../data/flightplan/ActiveWaypoint";

export class TemporaryWaypointDeleter {

    constructor(private readonly repo: KLNFacilityRepository, bus: EventBus, private readonly flightplans: Flightplan[], private readonly activeWaypoint: ActiveWaypoint) {
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.deleteUnusedTemporaryWaypoints.bind(this));
    }

    public static findUsageInFlightplans(icao: IcaoValue, flightplans: Flightplan[]): number | null {
        for (const flightplan of flightplans) {
            if (flightplan.getLegs().some(leg => ICAO.valueEquals(leg.wpt.icaoStruct, icao))) {
                return flightplan.idx;
            }
        }
        return null;
    }

    /**
     * 5-22, 5-26. The active waypoint is spared, as OTH 3 refuses to delete it (ACTIVE WPT, C-1): a Direct To survives a short
     * power-off (#193, #422)
     * @private
     */
    private deleteUnusedTemporaryWaypoints() {
        console.log("Deleting unused waypoints");
        //getActiveWpt resolves a plan leg whose procedure the power-on just removed. With the GPS SimVars WTFlightplanSync has
        //already done so on the flightplanChanged of that removal; without them only this lookup does
        const active = this.activeWaypoint.getActiveWpt();
        this.repo.forEach(fac => {
            const userFac = fac as UserFacility;
            //Region XY marks this as temporary. isTemporary can't be used, because that is not persisted
            if (userFac.icaoStruct.region === TEMPORARY_WAYPOINT && TemporaryWaypointDeleter.findUsageInFlightplans(userFac.icaoStruct, this.flightplans) === null
                && (active === null || !ICAO.valueEquals(active.icaoStruct, userFac.icaoStruct))) {
                console.log("Deleting unused waypoint:", userFac);
                this.repo.remove(userFac);
            }
        }, [FacilityType.USR]);
    }

}