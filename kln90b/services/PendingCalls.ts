import {ICAO, IcaoValue} from '@microsoft/msfs-sdk';
import {ActualFacilityClient} from '../data/navdata/KLNFacilityLoader';

/** A facility call pending for longer than this is reported as hung (#416) */
export const HANG_TIME_MS = 60_000;

/** The description of the call the facility client makes once at its creation */
export const FACILITY_INITIALIZATION = "facility initialization";

export interface PendingCall {
    readonly description: string;
    readonly started: number;
}

/**
 * Lists the asynchronous calls that have been started and have not settled yet.
 *
 * The sim's facility database can leave a call pending forever. The unit would then wait silently on the Turn-On
 * page, so the page asks this list which call has hung and names it in the error it shows (#416, design 4.4).
 * It only observes: a tracked promise settles exactly as the original does.
 */
export class PendingCalls {
    private nextId = 0;

    /** The Map keeps insertion order, which is the start order */
    private readonly calls = new Map<number, PendingCall>();

    /** Records the call until the promise settles; returns a promise that settles exactly as `promise` does */
    public track<T>(description: string, promise: Promise<T>): Promise<T> {
        const id = this.nextId++;
        this.calls.set(id, {description, started: Date.now()});

        return promise.then(value => {
            this.calls.delete(id);
            return value;
        }, error => {
            this.calls.delete(id);
            throw error;
        });
    }

    /** The pending calls in start order (for tests and the error message) */
    public pending(): PendingCall[] {
        return Array.from(this.calls.values());
    }

    /**
     * The FACILITY_INITIALIZATION entry if it has been pending longer than HANG_TIME_MS (whenever it started);
     * else the oldest entry started at or after `since` that has; else null.
     * The initialization is a one-time call that every later call depends on, so it is named first.
     */
    public findHung(now: number, since: number): PendingCall | null {
        //Iterates the Map itself: this runs at 4 Hz on the Turn-On page and allocates nothing
        let oldest: PendingCall | null = null;
        for (const call of this.calls.values()) {
            if (now - call.started <= HANG_TIME_MS) {
                continue;
            }
            if (call.description === FACILITY_INITIALIZATION) {
                return call;
            }
            if (oldest === null && call.started >= since) {
                oldest = call;
            }
        }
        return oldest;
    }
}

function icaoText(icao: IcaoValue | string): string {
    return typeof icao === "string" ? icao : ICAO.tryValueToStringV2(icao);
}

/**
 * Returns a facility client that forwards every call to `client` and records it in `calls` until it settles.
 * It changes no result. The initialization is tracked from the creation, because nothing else starts it.
 */
export function trackFacilityClient(client: ActualFacilityClient, calls: PendingCalls): ActualFacilityClient {
    // Nobody owns this chain, so its rejection is swallowed here. The callers of awaitInitialization() see their own.
    calls.track(FACILITY_INITIALIZATION, client.awaitInitialization()).catch(() => undefined);

    const tracked = {
        getFacility: (type: unknown, icao: IcaoValue | string, ...rest: unknown[]) =>
            calls.track(`getFacility(${String(type)}, ${icaoText(icao)})`,
                (client.getFacility as (...args: unknown[]) => Promise<unknown>)(type, icao, ...rest)),
        getAirway: (name: string, type: number, icao: IcaoValue | string) =>
            calls.track(`getAirway(${JSON.stringify(name)}, ${type}, ${icaoText(icao)})`,
                (client.getAirway as (...args: unknown[]) => Promise<unknown>)(name, type, icao)),
        searchByIdentWithIcaoStructs: (filter: unknown, ident: string, maxItems?: number) =>
            calls.track(`searchByIdentWithIcaoStructs(${String(filter)}, ${JSON.stringify(ident)}, ${maxItems})`,
                (client.searchByIdentWithIcaoStructs as (...args: unknown[]) => Promise<unknown>)(filter, ident, maxItems)),
        startNearestSearchSessionWithIcaoStructs: (type: unknown) =>
            calls.track(`startNearestSearchSessionWithIcaoStructs(${String(type)})`,
                (client.startNearestSearchSessionWithIcaoStructs as (...args: unknown[]) => Promise<unknown>)(type)),
        awaitInitialization: () => client.awaitInitialization(),
    };

    // The SDK methods are generic and overloaded; the wrapper forwards the arguments untouched
    return tracked as unknown as ActualFacilityClient;
}
