import {FacilityType, ICAO, UserFacilityType} from '@microsoft/msfs-sdk';
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

// KlnEfbLoader (kln90b/services) imports the route the EFB syncs into FPL 0. The harness test efb.test.ts holds the
// first lat/lon leg (one CUST in region XY at the given position); this holds what it leaves out: a second lat/lon leg
// (the ident made unique), the user facility itself, the repository entries and the OTH 3 list.
describe('EFB route import of lat/lon legs (34a9cb0, #15)', () => {
    async function bootWithTwoLatLonLegs() {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}, {lat: 47.2, lon: 8.2}]}));
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    // Public contract (CLAUDE.md "Public contract with aircraft": the EFB route sync). A lat/lon leg becomes a temporary
    // user waypoint of the type LAT_LONG in region XY, and the second one gets a unique ident.
    it('turns two lat/lon legs into temporary user waypoints CUST and CUSTA in FPL 0 (#15)', async () => {
        const unit = await bootWithTwoLatLonLegs();

        const legs = unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt);

        expect(legs.map(w => w.icaoStruct.ident)).toEqual(['KAAA', 'CUST', 'CUSTA', 'KBBB']);
        const given = [{lat: 47.1, lon: 8.1}, {lat: 47.2, lon: 8.2}];
        for (const [i, point] of given.entries()) {
            const wpt = legs[i + 1];
            expect(wpt.icaoStruct.region).toBe('XY');
            expect(wpt.icaoStruct.type).toBe('U');
            expect((wpt as any).userFacilityType).toBe(UserFacilityType.LAT_LONG);
            expect({lat: wpt.lat, lon: wpt.lon}).toEqual(point);
        }
    });

    it('registers both temporary waypoints in the facility repository, in region XY (#15)', async () => {
        const unit = await bootWithTwoLatLonLegs();
        const repository = KLNFacilityRepository.getRepository(unit.props.bus);

        const entries: [string, string, number, number][] = [];
        repository.forEach(fac => entries.push([fac.icaoStruct.ident, fac.icaoStruct.region, fac.lat, fac.lon]), [FacilityType.USR]);

        expect(entries.sort()).toEqual([['CUST', 'XY', 47.1, 8.1], ['CUSTA', 'XY', 47.2, 8.2]]);
        const cust = repository.get(ICAO.value('U', 'XY', '', 'CUST'));
        expect(cust).toBeDefined();
        expect(cust!.region).toBe('XY');
    });

    // 5-20: OTH 3 lists the user waypoints with their type (S for a supplementary waypoint) and the number of the flight
    // plan that uses them
    it('lists the temporary waypoints on OTH 3 as supplementary waypoints used in plan 0 (#15)', async () => {
        const unit = await bootWithTwoLatLonLegs();

        await unit.panel.selectPage('L', 'OTH 3');

        expect(Screen.read().rows('L').slice(0, 3)).toEqual([' USER WPTS ', 'CUST  S   0', 'CUSTA S   0']);
    });
});
