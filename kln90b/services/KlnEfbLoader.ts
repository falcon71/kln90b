import {
    DeepReadonly,
    EventBus,
    FacilityClient,
    FlightPlanRouteEnrouteLeg,
    FlightPlanRouteManager,
    ICAO,
    IcaoValue,
    ReadonlyFlightPlanRoute,
    UserFacility,
    UserFacilityType,
} from "@microsoft/msfs-sdk";
import {Flightplan} from "../data/flightplan/Flightplan";
import {MessageHandler} from "../data/MessageHandler";
import {Flightplanloader} from "./Flightplanloader";
import {MainPage} from "../pages/MainPage";
import {Fpl0Page} from "../pages/left/FplPage";
import {PageManager} from "../pages/PageManager";
import {getUniqueIdent} from "../data/navdata/UniqueIdentGenerator";
import {buildIcao, buildIcaoStruct, TEMPORARY_WAYPOINT} from "../data/navdata/IcaoBuilder";
import {StatusLineMessageEvents} from "../controls/StatusLine";
import {KLNFacilityRepository} from "../data/navdata/KLNFacilityRepository";

/**
 * Imports routes from the EFB into the KLN
 */
export class KlnEfbLoader extends Flightplanloader {

    constructor(protected readonly bus: EventBus, protected readonly facilityLoader: FacilityClient, protected messageHandler: MessageHandler, private readonly flightPlanRouteManager: FlightPlanRouteManager, private readonly fpl0: Flightplan, private readonly pageManager: PageManager, private readonly facilityRepository: KLNFacilityRepository) {
        super(bus, facilityLoader, messageHandler);
        this.flightPlanRouteManager.syncedAvionicsRoute.sub(this.loadRoute.bind(this));
    }

    private async loadRoute(route: ReadonlyFlightPlanRoute | null): Promise<void> {
        console.log("Loading route", route);

        const fpl = await this.doLoad(route);

        console.log("Route loaded", fpl);

        this.fpl0.load(fpl);

        //TODO would be nice, if we could add SID and STAR here

        const currentPage = this.pageManager.getCurrentPage();
        if (currentPage instanceof MainPage) { //We might still be on the self-test page
            currentPage.setLeftPage(new Fpl0Page(currentPage.props));
        }
    }


    private async doLoad(route: ReadonlyFlightPlanRoute | null): Promise<Flightplan> {
        if (route === null) {
            return new Flightplan(0, [], this.bus);
        }

        const icaos: IcaoValue[] = [];

        if (!ICAO.isValueEmpty(route.departureAirport)) {
            icaos.push(route.departureAirport);
        }

        for (const enroute of route.enroute) {
            const converted = await this.loadLeg(enroute);
            if (converted) {
                icaos.push(converted);
            }
        }

        if (!ICAO.isValueEmpty(route.destinationAirport)) {
            icaos.push(route.destinationAirport);
        }


        return this.loadIcaos(icaos);
    }

    private async loadLeg(enroute: DeepReadonly<FlightPlanRouteEnrouteLeg>): Promise<IcaoValue | null> {
        if (enroute.hasLatLon) {
            let ident = "CUST";
            if (!ICAO.isValueEmpty(enroute.fixIcao)) {
                ident = enroute.fixIcao.ident;
            }

            //Will be added as a temporary user waypoint
            const newIdent = await getUniqueIdent(ident, this.facilityLoader);

            if (newIdent === null) {
                return this.notFoundIcao(ident); //This waypoint will not be found and cause a WAYPOINT DELETED message
            }

            const facility: UserFacility = {
                icao: buildIcao('U', TEMPORARY_WAYPOINT, newIdent),
                icaoStruct: buildIcaoStruct('U', TEMPORARY_WAYPOINT, newIdent),
                name: "",
                lat: enroute.lat,
                lon: enroute.lon,
                region: TEMPORARY_WAYPOINT,
                city: "",
                isTemporary: false, //irrelevant, because this flag is not persisted
                userFacilityType: UserFacilityType.LAT_LONG,
            };
            console.log("Adding temporary user waypoint", facility);

            try {
                this.facilityRepository.add(facility);
                return facility.icaoStruct;
            } catch (e) {
                this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
                console.error(e);
                return this.notFoundIcao(ident); //This waypoint will not be found and cause a WAYPOINT DELETED message
            }


        } else if (!ICAO.isValueEmpty(enroute.fixIcao)) {
            return enroute.fixIcao;
        }
        return null;
    }


}