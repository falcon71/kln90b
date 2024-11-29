import {
    AirportFacility,
    FacilityClient,
    FlightPlanRouteManager,
    ICAO,
    ReadonlyFlightPlanRoute,
    RunwayUtils,
} from "@microsoft/msfs-sdk";
import {Flightplan, KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {Message, MessageHandler, OneTimeMessage} from "../data/MessageHandler";
import {SidStar} from "../data/navdata/SidStar";

/**
 * Imports routes from the EFB into the KLN
 */
export class KlnEfbLoader {

    constructor(private readonly flightPlanRouteManager: FlightPlanRouteManager, private readonly fpl0: Flightplan, private readonly facilityLoader: FacilityClient, private readonly messageHandler: MessageHandler, private readonly sidstar: SidStar) {
        this.flightPlanRouteManager.syncedAvionicsRoute.sub(this.loadRoute.bind(this));
    }

    private async loadRoute(route: ReadonlyFlightPlanRoute | null): Promise<void> {
        console.log("Loading route", route);

        let idx = 0;
        let messages: Message[] = [];


        this.fpl0.startBatchInsert();
        this.fpl0.delete();

        if (route === null) {
            return;
        }

        if (!ICAO.isValueEmpty(route.departureAirport)) {
            const departure = await this.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(route.departureAirport), route.departureAirport);
            const ret = this.tryInsert(idx, {
                wpt: departure,
                type: KLNLegType.USER,
            });
            if (ret instanceof OneTimeMessage) {
                this.messageHandler.addMessage(ret);
            } else {
                idx++;
            }
        }

        for (const enroute of route.enroute) {
            if (!ICAO.isValueEmpty(enroute.fixIcao)) {
                const enrouteWpt = await this.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(enroute.fixIcao), enroute.fixIcao);
                const ret = this.tryInsert(idx, {
                    wpt: enrouteWpt,
                    type: KLNLegType.USER,
                });
                if (ret instanceof OneTimeMessage) {
                    this.messageHandler.addMessage(ret);
                } else {
                    idx++;
                }
            }
        }


        if (!ICAO.isValueEmpty(route.destinationAirport)) {
            const destination = await this.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(route.destinationAirport), route.destinationAirport) as AirportFacility;

            if (route.arrival !== "") {
                const arrivalProcedure = destination.arrivals.find(a => a.name === route.arrival);

                if (arrivalProcedure) {
                    const arrivalTransition = arrivalProcedure.enRouteTransitions.find(t => t.name === route.arrivalTransition);
                    const runwayTransition = arrivalProcedure.runwayTransitions.find(t => t.runwayNumber.toString() == route.destinationRunway.number && RunwayUtils.getDesignatorLetter(t.runwayDesignation) == route.destinationRunway.designator);
                    const arrivalLegs = await this.sidstar.getKLNProcedureLegList(destination, arrivalProcedure, KLNLegType.STAR, runwayTransition ?? null, arrivalTransition ?? null);
                    for (const arrivalLeg of arrivalLegs) {
                        const ret = this.tryInsert(idx, arrivalLeg);
                        if (ret instanceof OneTimeMessage) {
                            //TODO FPL FULL
                            this.messageHandler.addMessage(ret);
                        } else {
                            idx++;
                        }
                    }

                }

            }


            const ret = this.tryInsert(idx, {
                wpt: destination,
                type: KLNLegType.USER,
            });
            if (ret instanceof OneTimeMessage) {
                this.messageHandler.addMessage(ret);
            } else {
                idx++;
            }
        }
        this.fpl0.finishBatchInsert();

        if (messages.length > 10) {
            messages = messages.slice(0, 10);
            messages.push(new OneTimeMessage(["OTHER WAYPOINTS DELETED"]));
        }
        messages.forEach(this.messageHandler.addMessage.bind(this.messageHandler));

        console.log("Route loaded", this.fpl0);
        //TODO refresh FPL 0 page, if it is currently displayed!
    }

    private tryInsert(idx: number, leg: KLNFlightplanLeg): Message | null {
        if (idx + 1 >= 30) {
            return new OneTimeMessage([`WAYPOINT ${leg.wpt.icaoStruct.ident} DELETED`])
        }

        this.fpl0.insertLeg(idx++, leg);
        return null;
    }


}