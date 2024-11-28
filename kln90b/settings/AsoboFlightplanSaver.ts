import {Flightplan} from "../data/flightplan/Flightplan";
import {FacilityType, FacilityUtils, ICAO} from "@microsoft/msfs-sdk";

export class AsoboFlightplanSaver {

    public async saveToAsoboFlightplan(plan: Flightplan): Promise<void> {
        try {
            console.log("saving asobo flightplan");
            await Coherent.call('SET_CURRENT_FLIGHTPLAN_INDEX', 0, true).catch((e: any) => console.warn("Error SET_CURRENT_FLIGHTPLAN_INDEX", e));
            await Coherent.call('CLEAR_CURRENT_FLIGHT_PLAN').catch((e: any) => console.warn("Error CLEAR_CURRENT_FLIGHT_PLAN", e));

            const legs = plan.getLegs();
            let globalIndex = 1;

            //The order is important. SET_DESTINATION clears all waypoints
            if (legs.length >= 0) {
                if (FacilityUtils.isFacilityType(legs[0].wpt, FacilityType.Airport)) {
                    console.log("SET_ORIGIN", legs[0].wpt.icaoStruct);
                    await Coherent.call('SET_ORIGIN', legs[0].wpt.icaoStruct, false);
                }

                const lastWpt = legs[legs.length - 1].wpt;
                if (FacilityUtils.isFacilityType(lastWpt, FacilityType.Airport)) {
                    console.log("SET_DESTINATION", lastWpt.icaoStruct);
                    await Coherent.call('SET_DESTINATION', lastWpt.icaoStruct, false);
                }


                for (let i = 0; i < legs.length; i++) {
                    const leg = legs[i];
                    const facType = ICAO.getFacilityTypeFromValue(leg.wpt.icaoStruct);
                    if (!(facType === FacilityType.Airport && (i === 0 || i === legs.length - 1))) {
                        if (facType === FacilityType.USR) {
                            console.log("ADD_CUSTOM_WAYPOINT", leg.wpt.icaoStruct, globalIndex);
                            await Coherent.call('ADD_CUSTOM_WAYPOINT', leg.wpt.icaoStruct.ident, globalIndex, leg.wpt.lat, leg.wpt.lon, false);
                        } else {
                            console.log("ADD_WAYPOINT", leg.wpt.icaoStruct, globalIndex);
                            await Coherent.call('ADD_WAYPOINT', leg.wpt.icaoStruct, globalIndex, false);
                        }
                        globalIndex++;
                    }
                }

            }

            Coherent.call('RECOMPUTE_ACTIVE_WAYPOINT_INDEX').catch((e: any) => console.warn("Error RECOMPUTE_ACTIVE_WAYPOINT_INDEX", e));
            console.log("flightplan 0 saved");
        } catch (e) {
            console.warn("Error writing fpl 0", e);
        }
    }
}