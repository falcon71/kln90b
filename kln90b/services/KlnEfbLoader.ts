import {EventBus, Facility, FacilityClient, FlightPlanRouteManager, ReadonlyFlightPlanRoute} from "@microsoft/msfs-sdk";
import {Flightplan} from "../data/flightplan/Flightplan";
import {MessageHandler, OneTimeMessage} from "../data/MessageHandler";
import {Flightplanloader} from "./Flightplanloader";
import {MainPage} from "../pages/MainPage";
import {Fpl0Page} from "../pages/left/FplPage";
import {PageManager} from "../pages/PageManager";
import {KLNFacilityRepository} from "../data/navdata/KLNFacilityRepository";
import {Hardware} from "../Hardware";
import {EfbRouteResolver} from "./EfbRouteResolver";
import {fitEfbRoute} from "./EfbRouteFit";
import {TemporaryWaypointDeleter} from "./TemporaryWaypointDeleter";
import {SidStar} from "../data/navdata/SidStar";

/**
 * Imports routes from the EFB into the KLN. The route is resolved first (EfbRouteResolver), then fitted into the
 * limits of FPL 0 in one step (fitEfbRoute, #195). FPL 0 gets the SID, STAR and approach of the route where APT 7/8
 * would have let the pilot load them (#378)
 */
export class KlnEfbLoader extends Flightplanloader {

    private readonly resolver: EfbRouteResolver;
    private readonly fpl0: Flightplan;
    /** Counts the imports, so that one overtaken by a newer route can tell */
    private loadOpId = 0;

    constructor(protected readonly bus: EventBus, protected readonly facilityLoader: FacilityClient, protected messageHandler: MessageHandler, private readonly flightPlanRouteManager: FlightPlanRouteManager, private readonly flightplans: Flightplan[], private readonly pageManager: PageManager, private readonly facilityRepository: KLNFacilityRepository, private readonly hardware: Hardware, sidstar: SidStar) {
        super(bus, facilityLoader, messageHandler);
        this.fpl0 = flightplans[0];
        this.resolver = new EfbRouteResolver(bus, facilityLoader, facilityRepository, sidstar);
        this.flightPlanRouteManager.syncedAvionicsRoute.sub(this.loadRoute.bind(this));
    }

    private async loadRoute(route: ReadonlyFlightPlanRoute | null): Promise<void> {
        if (this.hardware.isDisabled) { //#188. The state SimVarSync keeps, not the LVar (#353)
            //A route that is synced for the GPS that replaced the KLN must not change the FPL 0 of the suspended KLN. The route is dropped, not loaded on resume
            console.log("Ignoring route, because the unit is disabled for hot swapping");
            return;
        }

        const opId = ++this.loadOpId;
        console.log("Loading route", route);

        if (route === null) {
            this.fpl0.load(new Flightplan(0, [], this.bus));
            this.showFpl0();
            return;
        }

        const resolved = await this.resolver.resolve(route);
        if (opId !== this.loadOpId) {
            //Design §6: the newest route wins. This one neither loads FPL 0 nor reports anything
            console.log("Route overtaken by a newer one", route);
            return;
        }

        const fit = fitEfbRoute(resolved);
        console.log("Route loaded", fit.legs);
        this.fpl0.loadLegs(fit.legs); //#378: with the procedures

        this.removeUnusedWaypoints(resolved.createdWaypoints);
        this.addDeletedMessages(fit.deleted.map(ident => new OneTimeMessage([`WAYPOINT ${ident} DELETED`])));
        this.showFpl0();
    }

    private showFpl0(): void {
        const currentPage = this.pageManager.getCurrentPage();
        if (currentPage instanceof MainPage) { //We might still be on the self-test page
            currentPage.replaceLeftBasePage(new Fpl0Page(currentPage.props));
        }
    }

    /**
     * Design §6: removes the waypoints this import created that no flight plan uses, the temporary waypoints of legs
     * the fit cut and the DME arc entries of procedures it cut or skipped, so that OTH 3 does not list them. Nothing
     * else in the repository is touched: a waypoint that was there before, or that the pilot creates while the route
     * resolves, stays (the power-on cleanup, 5-22, takes the unused temporary ones)
     */
    private removeUnusedWaypoints(created: Facility[]): void {
        for (const fac of created) {
            if (TemporaryWaypointDeleter.findUsageInFlightplans(fac.icaoStruct, this.flightplans) === null) {
                console.log("Removing the temporary waypoint of a cut leg", fac);
                this.facilityRepository.remove(fac);
            }
        }
    }
}
