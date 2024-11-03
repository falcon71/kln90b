import {FlightPlan} from "../data/flightplan/FlightPlan";
import {FacilityType, ICAO} from "@microsoft/msfs-sdk";

export class AsoboFlightplanSaver {

    public async saveToAsoboFlightplan(plan: FlightPlan): Promise<void> {
        try {
            console.log("saving asobo flightplan");
            await Coherent.call('SET_CURRENT_FLIGHTPLAN_INDEX', 0, true).catch((e: any) => console.warn("Error SET_CURRENT_FLIGHTPLAN_INDEX", e));
            await Coherent.call('CLEAR_CURRENT_FLIGHT_PLAN').catch((e: any) => console.warn("Error CLEAR_CURRENT_FLIGHT_PLAN", e));

            const legs = plan.getLegs();
            let globalIndex = 1;

            //The order is important. SET_DESTINATION clears all waypoints
            if (legs.length >= 0) {
                if (ICAO.getFacilityType(legs[0].wpt.icao) === FacilityType.Airport) {
                    console.log("SET_ORIGIN", legs[0].wpt.icao);
                    await Coherent.call('SET_ORIGIN', legs[0].wpt.icao, false);
                }

                const lastWptIcao = legs[legs.length - 1].wpt.icao;
                if (ICAO.getFacilityType(lastWptIcao) === FacilityType.Airport) {
                    console.log("SET_DESTINATION", lastWptIcao);
                    await Coherent.call('SET_DESTINATION', lastWptIcao, false);
                }


                for (let i = 0; i < legs.length; i++) {
                    const leg = legs[i];
                    const facType = ICAO.getFacilityType(leg.wpt.icao);
                    if (!(facType === FacilityType.Airport && (i === 0 || i === legs.length - 1))) {
                        if (facType === FacilityType.USR) {
                            console.log("ADD_CUSTOM_WAYPOINT", leg.wpt.icao, globalIndex);
                            await Coherent.call('ADD_CUSTOM_WAYPOINT', ICAO.getIdent(leg.wpt.icao), globalIndex, leg.wpt.lat, leg.wpt.lon, false);
                        } else {
                            console.log("ADD_WAYPOINT", leg.wpt.icao, globalIndex);
                            await Coherent.call('ADD_WAYPOINT', leg.wpt.icao, globalIndex, false);
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