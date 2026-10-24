import {
    ApproachUtils,
    EventBus,
    Facility,
    FlightPlanRoute,
    FlightPlanRouteManager,
    FlightPlanRouteUtils,
    ReadonlyFlightPlanRoute,
    RunwayIdentifier,
    RunwayUtils,
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

/**
 * An enroute leg of an EFB route (the SDK's FlightPlanRouteEnrouteLeg):
 * - a database facility: its ICAO is the fix, flown direct;
 * - a lat/lon point, which the unit imports as a temporary waypoint;
 * - `pbd`: a point at a true bearing and a distance in NM from a reference facility (hasPointBearingDistance), with the
 *   name the EFB gives it (empty when left out);
 * - `fix` with `via`: the exit fix of the airway named `via`;
 * - `ppos`: a leg to the present position (isPpos).
 */
export type EfbEnrouteSpec =
    | Facility
    | { lat: number; lon: number }
    | { pbd: { reference: Facility; bearing: number; distance: number; name?: string } }
    | { fix: Facility; via: string }
    | { ppos: true };

export interface EfbRouteSpec {
    departure?: Facility;
    destination?: Facility;
    enroute?: EfbEnrouteSpec[];
    /** The name of the SID (the route's `departure`; here `departure` is the airport) */
    sid?: string;
    departureTransition?: string;
    /** The runway of the SID: '27', '09R' */
    departureRunway?: string;
    /** The name of the STAR */
    arrival?: string;
    arrivalTransition?: string;
    /** The runway of the STAR: '27', '09R' */
    destinationRunway?: string;
    /**
     * The approach as the EFB names it: an ApproachType global, the runway ('27', '27L', '' for circling) and the
     * suffix
     */
    approach?: { type: ApproachType; runway: string; suffix?: string };
    /** The IAF of the approach */
    approachTransition?: string;
}

/** A runway as the EFB names it: '09R' is the number '09' and the designator 'R' */
function runwayIdentifier(runway: string): RunwayIdentifier {
    return {...RunwayUtils.emptyIdentifier(), number: runway.slice(0, 2), designator: runway.slice(2)};
}

/** A route as the EFB syncs it, built on the SDK's empty route so that every field the unit may read exists */
export function efbRoute(spec: EfbRouteSpec): FlightPlanRoute {
    const route = FlightPlanRouteUtils.emptyRoute();
    if (spec.departure !== undefined) route.departureAirport = spec.departure.icaoStruct;
    if (spec.destination !== undefined) route.destinationAirport = spec.destination.icaoStruct;
    route.departure = spec.sid ?? '';
    route.departureTransition = spec.departureTransition ?? '';
    if (spec.departureRunway !== undefined) route.departureRunway = runwayIdentifier(spec.departureRunway);
    route.arrival = spec.arrival ?? '';
    route.arrivalTransition = spec.arrivalTransition ?? '';
    if (spec.destinationRunway !== undefined) route.destinationRunway = runwayIdentifier(spec.destinationRunway);
    if (spec.approach !== undefined) {
        route.approach = {
            ...ApproachUtils.emptyIdentifier(),
            type: ApproachUtils.typeToName(spec.approach.type),
            runway: runwayIdentifier(spec.approach.runway),
            suffix: spec.approach.suffix ?? '',
        };
    }
    route.approachTransition = spec.approachTransition ?? '';
    for (const point of spec.enroute ?? []) {
        const leg = FlightPlanRouteUtils.emptyEnrouteLeg();
        if ('icaoStruct' in point) {
            leg.fixIcao = point.icaoStruct;
        } else if ('pbd' in point) {
            leg.hasPointBearingDistance = true;
            leg.referenceIcao = point.pbd.reference.icaoStruct;
            leg.bearing = point.pbd.bearing;
            leg.distance = point.pbd.distance;
            leg.name = point.pbd.name ?? '';
        } else if ('via' in point) {
            leg.fixIcao = point.fix.icaoStruct;
            leg.via = point.via;
        } else if ('ppos' in point) {
            leg.isPpos = true;
        } else {
            leg.hasLatLon = true;
            leg.lat = point.lat;
            leg.lon = point.lon;
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
