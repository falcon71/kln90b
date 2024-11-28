import {
    FacilityType,
    FacilityUtils,
    FlightPlanRoute,
    FlightPlanRouteEnrouteLeg,
    FlightPlanRouteManager,
    FlightPlanRouteUtils,
} from "@microsoft/msfs-sdk";
import {Flightplan, KLNFlightplanLeg} from "../data/flightplan/Flightplan";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";

export class KlnEfbManager {

    constructor(private readonly options: KLN90PlaneSettings, private flightPlanRouteManager: FlightPlanRouteManager, private fpl0: Flightplan) {
        this.flightPlanRouteManager.avionicsRouteRequested.on(this.handleAvionicsRouteRequested.bind(this));
    }

    private handleAvionicsRouteRequested(sender: FlightPlanRouteManager, requestId: number): void {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }

        this.flightPlanRouteManager.replyToAvionicsRouteRequest(requestId, this.toEfbRoute())

    }

    private toEfbRoute(): FlightPlanRoute {
        const route = FlightPlanRouteUtils.emptyRoute();
        const legs = this.fpl0.getLegs();
        if (FacilityUtils.isFacilityType(legs[0].wpt, FacilityType.Airport)) {
            route.departureAirport = legs[0].wpt.icaoStruct;
        }
        const lastLeg = legs[legs.length - 1];
        if (FacilityUtils.isFacilityType(lastLeg.wpt, FacilityType.Airport)) {
            route.destinationAirport = lastLeg.wpt.icaoStruct;
        }
        route.enroute = legs.map(this.toEnrouteSegment);
        return route;
    }

    private toEnrouteSegment(leg: KLNFlightplanLeg): FlightPlanRouteEnrouteLeg {
        const segment = FlightPlanRouteUtils.emptyEnrouteLeg();
        segment.fixIcao = leg.wpt.icaoStruct;
        segment.hasLatLon = true;
        segment.lat = leg.wpt.lat;
        segment.lon = leg.wpt.lon;
        segment.name = leg.wpt.name;
        return segment;
    }


}