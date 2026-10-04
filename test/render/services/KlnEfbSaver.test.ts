import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport} from '../../harness/navdata/builders';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

const fpl0Idents = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);

/** The SDK logs the handler error with console.error; keep it out of the test output */
function muteConsoleError(): void {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Registered before the boot, so it runs after the teardown has put the spy back
    onTestFinished(() => spy.mockRestore());
}

async function bootWithRoute(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
    await settle(unit);
    unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.5, lon: 8.5}]}));
    await vi.advanceTimersByTimeAsync(2000);
    return unit;
}

// KlnEfbSaver sends FPL 0 to the EFB on request. The source is the EFB route sync of the public contract (CLAUDE.md),
// not a manual page.
describe('KlnEfbSaver', () => {
    it('answers a route request with the airports of FPL 0 as departure and destination', async () => {
        const unit = await bootWithRoute();
        expect(fpl0Idents(unit)).toEqual(['KAAA', 'CUST', 'KBBB']);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
        const route = unit.efb!.replies[0].route;
        expect(route.departureAirport.ident).toBe('KAAA');
        expect(route.destinationAirport.ident).toBe('KBBB');
        expect(route.enroute.map(leg => [leg.lat, leg.lon])).toEqual([[47.5, 8.5]]);
    });

    // toEfbRoute() takes the airports off the array getLegs() returns, which is the internal leg array of FPL 0
    it.fails('a route request leaves FPL 0 unchanged (#NEW-3-1)', async () => {
        const unit = await bootWithRoute();

        unit.efb!.request();

        expect(fpl0Idents(unit)).toEqual(['KAAA', 'CUST', 'KBBB']);
    });

    // The preconditions of the two pins below, which an it.fails would hide if they broke
    it('starts from an empty FPL 0, and from one that holds only an airport after a synced route', async () => {
        const unit = await bootUnit({efb: true, facilities: [kaaa]});
        await settle(unit);
        expect(fpl0Idents(unit)).toEqual([]);

        unit.efb!.sync(efbRoute({departure: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['KAAA']);
    });

    // toEfbRoute() reads legs[0] and then the last leg without checking that a leg is left. The SDK's SubEvent catches the
    // TypeError and logs it with console.error, so nothing is thrown at the EFB and it never gets an answer
    it.fails('a route request with an empty FPL 0 is answered with an empty route (#NEW-3-2)', async () => {
        muteConsoleError();
        const unit = await bootUnit({efb: true});
        await settle(unit);
        expect(fpl0Idents(unit)).toEqual([]);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
    });

    it.fails('a route request with only an airport in FPL 0 is answered (#NEW-3-2)', async () => {
        muteConsoleError();
        const unit = await bootUnit({efb: true, facilities: [kaaa]});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);
        expect(fpl0Idents(unit)).toEqual(['KAAA']);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
    });
});
