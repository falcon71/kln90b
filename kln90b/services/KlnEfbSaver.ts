import {
    ApproachUtils,
    FacilityType,
    FacilityUtils,
    FlightPlanRoute,
    FlightPlanRouteEnrouteLeg,
    FlightPlanRouteManager,
    FlightPlanRouteUtils,
    ICAO,
    RunwayUtils,
} from "@microsoft/msfs-sdk";
import {Flightplan, KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {isUserWaypoint} from "../pages/right/WaypointPage";

/**
 * Sends routes from the KLN to the EFB
 */
export class KlnEfbSaver {

    constructor(private readonly options: KLN90PlaneSettings, private readonly flightPlanRouteManager: FlightPlanRouteManager, private readonly fpl0: Flightplan) {
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
            legs.shift();
        }
        const lastLeg = legs[legs.length - 1];
        if (FacilityUtils.isFacilityType(lastLeg.wpt, FacilityType.Airport)) {
            route.destinationAirport = lastLeg.wpt.icaoStruct;
            legs.pop();
        }

        for (const leg of legs) {
            switch (leg.type) {
                case KLNLegType.USER:
                    route.enroute.push(this.toEnrouteSegment(leg));
                    break;
                case KLNLegType.STAR:
                    route.arrival = leg.procedure!.procedureName;
                    if (leg.procedure!.runwayNumber) {
                        route.destinationRunway.number = leg.procedure!.runwayNumber.toString();
                    }
                    if (leg.procedure!.runwayDesignator) {
                        route.destinationRunway.designator = RunwayUtils.getDesignatorLetter(leg.procedure!.runwayDesignator);
                    }
                    if (leg.procedure!.transition) {
                        route.arrivalTransition = leg.procedure!.transition;
                    }
                    break;
                case KLNLegType.SID:
                    route.departure = leg.procedure!.procedureName;
                    if (leg.procedure!.runwayNumber) {
                        route.departureRunway.number = leg.procedure!.runwayNumber.toString();
                    }
                    if (leg.procedure!.runwayDesignator) {
                        route.departureRunway.designator = RunwayUtils.getDesignatorLetter(leg.procedure!.runwayDesignator);
                    }
                    if (leg.procedure!.transition) {
                        route.departureTransition = leg.procedure!.transition;
                    }
                    break;
                case KLNLegType.APP:
                    route.approach.type = ApproachUtils.typeToName(leg.procedure!.approachType!);
                    if (leg.procedure!.approachSuffix) {
                        route.approach.suffix = leg.procedure!.approachSuffix;
                    }
                    if (leg.procedure!.runwayNumber) {
                        route.approach.runway.number = leg.procedure!.runwayNumber.toString();
                    }
                    if (leg.procedure!.runwayDesignator) {
                        route.approach.runway.designator = RunwayUtils.getDesignatorLetter(leg.procedure!.runwayDesignator);
                    }
                    if (leg.procedure!.transition) {
                        route.approachTransition = leg.procedure!.transition;
                    }
                    break;

            }
        }

        console.log("Sending route to EFB", route);

        return route;
    }

    private toEnrouteSegment(leg: KLNFlightplanLeg): FlightPlanRouteEnrouteLeg {
        if (leg.type !== KLNLegType.USER) {
            throw new Error("No procedures here!");
        }
        const segment = FlightPlanRouteUtils.emptyEnrouteLeg();
        if (isUserWaypoint(leg.wpt)) {
            segment.hasLatLon = true;
            segment.fixIcao = ICAO.value("U", leg.wpt.icaoStruct.region, leg.wpt.icaoStruct.airport, leg.wpt.icaoStruct.ident);
            segment.lat = leg.wpt.lat;
            segment.lon = leg.wpt.lon;
        } else {
            segment.fixIcao = leg.wpt.icaoStruct;
        }
        return segment;
    }


}