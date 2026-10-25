import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {FacilitySearchType, FacilityType, ICAO} from '@microsoft/msfs-sdk';
import {
    FACILITY_INITIALIZATION,
    HANG_TIME_MS,
    PendingCalls,
    trackFacilityClient,
} from '../../../kln90b/services/PendingCalls';
import {ActualFacilityClient} from '../../../kln90b/data/navdata/KLNFacilityLoader';

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return {promise, resolve, reject};
}

/** A stub client: every method returns what `make` returns, so tests choose whether and how the calls settle. */
function stubClient(make: () => Promise<unknown>): ActualFacilityClient {
    return {
        getFacility: () => make(),
        getAirway: () => make(),
        searchByIdentWithIcaoStructs: () => make(),
        startNearestSearchSessionWithIcaoStructs: () => make(),
        awaitInitialization: () => make(),
    } as unknown as ActualFacilityClient;
}

const never = () => new Promise<never>(() => undefined);

describe('PendingCalls', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('lists a pending call with its description and start, and removes it when it resolves', async () => {
        vi.setSystemTime(1234);
        const calls = new PendingCalls();
        const d = deferred<number>();
        const tracked = calls.track('a', d.promise);

        expect(calls.pending()).toEqual([{description: 'a', started: 1234}]);

        d.resolve(5);
        await expect(tracked).resolves.toBe(5);
        expect(calls.pending()).toEqual([]);
    });

    it('removes a call that rejects and passes the rejection through unchanged', async () => {
        const calls = new PendingCalls();
        const d = deferred<number>();
        const error = new Error('boom');
        const tracked = calls.track('a', d.promise);

        d.reject(error);
        await expect(tracked).rejects.toBe(error);
        expect(calls.pending()).toEqual([]);
    });

    it('finds no hung call at exactly 60 s and finds it after', () => {
        const calls = new PendingCalls();
        calls.track('a', never());

        expect(calls.findHung(HANG_TIME_MS, 0)).toBeNull();
        expect(calls.findHung(HANG_TIME_MS + 1, 0)).toEqual({description: 'a', started: 0});
    });

    it('ignores calls started before since', () => {
        const calls = new PendingCalls();
        calls.track('a', never());

        expect(calls.findHung(70_000, 1)).toBeNull();
    });

    it('names the oldest hung call', () => {
        const calls = new PendingCalls();
        calls.track('first', never());
        vi.setSystemTime(1000);
        calls.track('second', never());

        expect(calls.findHung(70_000, 0)!.description).toBe('first');
    });

    it('names the facility initialization first, whenever it started', () => {
        const calls = new PendingCalls();
        calls.track(FACILITY_INITIALIZATION, never());
        vi.setSystemTime(1000);
        calls.track('x', never());

        expect(calls.findHung(70_000, 5000)!.description).toBe(FACILITY_INITIALIZATION);
    });

    it('does not name a facility initialization that has not been pending long enough', () => {
        const calls = new PendingCalls();
        vi.setSystemTime(50_000);
        calls.track(FACILITY_INITIALIZATION, never());

        expect(calls.findHung(70_000, 0)).toBeNull();
    });
});

describe('trackFacilityClient', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(0);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('tracks the initialization from its creation', async () => {
        const calls = new PendingCalls();
        trackFacilityClient(stubClient(never), calls);
        expect(calls.pending().map(c => c.description)).toEqual([FACILITY_INITIALIZATION]);

        const resolving = new PendingCalls();
        trackFacilityClient(stubClient(() => Promise.resolve()), resolving);
        await Promise.resolve();
        await Promise.resolve();
        expect(resolving.pending()).toEqual([]);
    });

    it('does not leave a rejection of the initialization unhandled', async () => {
        const unhandled = vi.fn();
        process.on('unhandledRejection', unhandled);
        const calls = new PendingCalls();
        trackFacilityClient(stubClient(() => Promise.reject(new Error('init'))), calls);
        vi.useRealTimers();
        await new Promise(resolve => setTimeout(resolve, 10));
        process.off('unhandledRejection', unhandled);

        expect(unhandled).not.toHaveBeenCalled();
        expect(calls.pending()).toEqual([]);
    });

    it('describes each call', () => {
        const calls = new PendingCalls();
        const client = trackFacilityClient(stubClient(never), calls);
        const icao = ICAO.value('W', 'K1', '', 'ZZXIN');
        const v2 = ICAO.tryValueToStringV2(icao);
        const described = () => calls.pending().map(c => c.description).filter(d => d !== FACILITY_INITIALIZATION);

        client.getFacility(FacilityType.Intersection, icao);
        client.getFacility(FacilityType.Airport, 'ABC');
        client.searchByIdentWithIcaoStructs(FacilitySearchType.Intersection, 'K', 1);
        client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        client.getAirway('V1', 2, icao);

        expect(described()).toEqual([
            `getFacility(${FacilityType.Intersection}, ${v2})`,
            `getFacility(${FacilityType.Airport}, ABC)`,
            `searchByIdentWithIcaoStructs(${FacilitySearchType.Intersection}, "K", 1)`,
            `startNearestSearchSessionWithIcaoStructs(${FacilitySearchType.Vor})`,
            `getAirway("V1", 2, ${v2})`,
        ]);
        // The enums print as their runtime values: FacilityType is a string enum, FacilitySearchType a numeric one
        expect(described()[0]).toMatch(/^getFacility\(INT, /);
        expect(described()[2]).toMatch(/^searchByIdentWithIcaoStructs\(\d+, "K", 1\)$/);
    });

    it('passes results and rejections through', async () => {
        const facility = {icaoStruct: ICAO.value('W', 'K1', '', 'ZZXIN')};
        const ok = trackFacilityClient({
            ...stubClient(never),
            getFacility: () => Promise.resolve(facility),
        } as unknown as ActualFacilityClient, new PendingCalls());
        await expect(ok.getFacility(FacilityType.Intersection, 'x')).resolves.toBe(facility);

        const error = new Error('nope');
        const bad = trackFacilityClient({
            ...stubClient(never),
            getFacility: () => Promise.reject(error),
        } as unknown as ActualFacilityClient, new PendingCalls());
        await expect(bad.getFacility(FacilityType.Intersection, 'x')).rejects.toBe(error);
    });

    it('calls the methods on the wrapped client, so its own state stays reachable', async () => {
        class Client {
            private readonly answer = 'from this';

            public getFacility() { return Promise.resolve(this.answer); }

            public getAirway() { return Promise.resolve(this.answer); }

            public searchByIdentWithIcaoStructs() { return Promise.resolve(this.answer); }

            public startNearestSearchSessionWithIcaoStructs() { return Promise.resolve(this.answer); }

            public awaitInitialization() { return Promise.resolve(this.answer); }
        }
        const client = trackFacilityClient(new Client() as unknown as ActualFacilityClient, new PendingCalls());

        await expect(client.getFacility(FacilityType.Airport, 'x')).resolves.toBe('from this');
        await expect(client.getAirway('V1', 2, 'x')).resolves.toBe('from this');
        await expect(client.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'K', 1)).resolves.toBe('from this');
        await expect(client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor)).resolves.toBe('from this');
        await expect(client.awaitInitialization()).resolves.toBe('from this');
    });

    it('forwards every argument to the wrapped client unchanged', async () => {
        const getFacility = vi.fn(() => Promise.resolve('facility'));
        const getAirway = vi.fn(() => Promise.resolve('airway'));
        const searchByIdentWithIcaoStructs = vi.fn(() => Promise.resolve('search'));
        const startNearestSearchSessionWithIcaoStructs = vi.fn(() => Promise.resolve('session'));
        const client = trackFacilityClient({
            getFacility,
            getAirway,
            searchByIdentWithIcaoStructs,
            startNearestSearchSessionWithIcaoStructs,
            awaitInitialization: () => Promise.resolve(),
        } as unknown as ActualFacilityClient, new PendingCalls());
        const icao = ICAO.value('W', 'K1', '', 'ZZXIN');

        await expect(client.getFacility(FacilityType.VOR, icao, 7)).resolves.toBe('facility');
        await expect(client.getAirway('V1', 2, icao)).resolves.toBe('airway');
        await expect(client.searchByIdentWithIcaoStructs(FacilitySearchType.Ndb, 'KAB', 9)).resolves.toBe('search');
        await expect(client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Intersection)).resolves.toBe('session');

        expect(getFacility.mock.calls).toEqual([[FacilityType.VOR, icao, 7]]);
        expect(getAirway.mock.calls).toEqual([['V1', 2, icao]]);
        expect(searchByIdentWithIcaoStructs.mock.calls).toEqual([[FacilitySearchType.Ndb, 'KAB', 9]]);
        expect(startNearestSearchSessionWithIcaoStructs.mock.calls).toEqual([[FacilitySearchType.Intersection]]);
    });

    it('forwards awaitInitialization untracked', async () => {
        const calls = new PendingCalls();
        const client = trackFacilityClient(stubClient(() => Promise.resolve()), calls);
        const before = calls.pending().length;

        const p = client.awaitInitialization();
        expect(calls.pending().length).toBe(before);
        await p;
    });
});
