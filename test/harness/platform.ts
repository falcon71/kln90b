import {
    EventBus,
    Facility,
    FlightPlanRoute,
    FlightPlanRouteManager,
    FlightPlanRouteUtils,
    ReadonlyFlightPlanRoute,
    SubEvent,
    Subject,
} from '@microsoft/msfs-sdk';
import {KLN90BPlatform} from '../../kln90b/KLN90BPlatform';
import {ActualFacilityClient} from '../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from './navdata/MemoryFacilityClient';

/**
 * The EFB side of FlightPlanRouteManager as the unit uses it (KlnEfbLoader, KlnEfbSaver): a synced route, and route
 * requests the unit answers. The members are those of the SDK's FlightPlanRouteManager (see msfssdk.d.ts).
 */
export class FakeRouteManager {
    public readonly syncedAvionicsRoute = Subject.create<ReadonlyFlightPlanRoute | null>(null);
    public readonly avionicsRouteRequested = new SubEvent<FakeRouteManager, number>();
    public readonly replies: { requestId: number; route: ReadonlyFlightPlanRoute }[] = [];
    private nextId = 1;

    /** Emits a route as the EFB would; pass a new object each time (Subject compares by identity) */
    public sync(route: ReadonlyFlightPlanRoute | null): void {
        this.syncedAvionicsRoute.set(route);
    }

    /** Asks the unit for its route, as the EFB does; returns the request id */
    public request(): number {
        const id = this.nextId++;
        this.avionicsRouteRequested.notify(this, id);
        return id;
    }

    public replyToAvionicsRouteRequest(requestId: number, route: ReadonlyFlightPlanRoute): Promise<void> {
        this.replies.push({requestId, route});
        return Promise.resolve();
    }
}

export interface EfbRouteSpec {
    departure?: Facility;
    destination?: Facility;
    /** A database facility (its ICAO is the fix) or a lat/lon point, which the unit imports as a temporary waypoint */
    enroute?: (Facility | { lat: number; lon: number; name?: string })[];
}

/** A route as the EFB syncs it, built on the SDK's empty route so that every field the unit may read exists */
export function efbRoute(spec: EfbRouteSpec): FlightPlanRoute {
    const route = FlightPlanRouteUtils.emptyRoute();
    if (spec.departure !== undefined) route.departureAirport = spec.departure.icaoStruct;
    if (spec.destination !== undefined) route.destinationAirport = spec.destination.icaoStruct;
    for (const point of spec.enroute ?? []) {
        const leg = FlightPlanRouteUtils.emptyEnrouteLeg();
        if ('icaoStruct' in point) {
            leg.fixIcao = point.icaoStruct;
        } else {
            leg.hasLatLon = true;
            leg.lat = point.lat;
            leg.lon = point.lon;
            leg.name = point.name ?? '';
        }
        route.enroute.push(leg);
    }
    return route;
}

export class FakePlatform implements KLN90BPlatform {
    /**
     * @param navdata the facilities the unit sees
     * @param routeManager the EFB; without one getRouteManager never resolves, like a sim with no EFB attached
     * @param overrides replace methods of this platform, for example a facility client that fails (bootUnitExpectingError)
     */
    constructor(public readonly navdata: MemoryFacilityClient, private readonly routeManager?: FakeRouteManager, overrides: Partial<KLN90BPlatform> = {}) {
        Object.assign(this, overrides);
    }

    public createFacilityClient(_bus: EventBus): ActualFacilityClient {
        // MemoryFacilityClient implements these methods at runtime; the SDK's generic overload types are not worth
        // reproducing in a test double.
        return this.navdata as unknown as ActualFacilityClient;
    }

    public getFacilityRepository(bus: EventBus): KLNFacilityRepository {
        return KLNFacilityRepository.getRepository(bus);
    }

    public getRouteManager(): Promise<FlightPlanRouteManager> {
        if (this.routeManager === undefined) {
            // No EFB attached
            return new Promise(() => undefined);
        }
        // The unit uses only the members FakeRouteManager has
        return Promise.resolve(this.routeManager as unknown as FlightPlanRouteManager);
    }
}
