import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

describe('fake EFB route manager (harness)', () => {
    it('has no EFB unless asked for', async () => {
        const unit = await bootUnit();
        expect(unit.efb).toBeUndefined();
    });

    // KlnEfbLoader (kln90b/services): the route of the EFB replaces FPL 0, and a lat/lon point is imported as a
    // temporary user waypoint (region XY). Source is the EFB route sync of the public contract, no manual page.
    it('puts a synced route into FPL 0 and shows it', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.5, lon: 8.5}]}));
        await vi.advanceTimersByTimeAsync(2000);

        const legs = unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt);
        expect(legs.map(w => w.icaoStruct.ident)).toEqual(['KAAA', 'CUST', 'KBBB']);
        expect(legs[1].icaoStruct.region).toBe('XY');
        expect([legs[1].lat, legs[1].lon]).toEqual([47.5, 8.5]);
        expect(Screen.read().leftName()).toBe('FPL 0');
    });

    it('takes a database facility on the enroute leg as it is', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({enroute: [kbbb, kaaa]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KBBB', 'KAAA']);
    });

    it('records the answer to a route request, with the id of the request', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        const id = unit.efb!.request();

        expect(unit.efb!.replies.map(r => r.requestId)).toEqual([id]);
        expect(unit.efb!.replies[0].route.departureAirport.ident).toBe('KAAA');
        expect(unit.efb!.replies[0].route.destinationAirport.ident).toBe('KBBB');
    });
});
