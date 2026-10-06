import {Facility, FacilityType, FlightPlanRoute, FlightPlanRouteUtils, ICAO, UserFacilityType} from '@microsoft/msfs-sdk';
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';
import {savedFlightplan, savedUserWaypoints} from '../../harness/storage';
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

    // Public contract (CLAUDE.md "Public contract with aircraft": the EFB route sync, #15, 34a9cb0): the temporary
    // waypoints of the route are in the facility repository, where the waypoint lookup finds them.
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

const fpl0Idents = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);
const messageTexts = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

/** A route whose enroute legs are lat/lon points named by the ICAO the EFB gives them (efbRoute leaves that ICAO empty) */
function namedLatLonRoute(points: { name: string; lat: number; lon: number }[]): FlightPlanRoute {
    const route = FlightPlanRouteUtils.emptyRoute();
    for (const p of points) {
        const leg = FlightPlanRouteUtils.emptyEnrouteLeg();
        leg.hasLatLon = true;
        leg.lat = p.lat;
        leg.lon = p.lon;
        leg.fixIcao = ICAO.value('U', '', '', p.name);
        route.enroute.push(leg);
    }
    return route;
}

describe('EFB route import (KlnEfbLoader)', () => {
    // Public contract (CLAUDE.md "Public contract with aircraft": the EFB route sync). In the SDK's FlightPlanRoute an
    // empty departure or destination ICAO means the route has none, so the plan is the enroute fixes, and nothing is
    // reported deleted
    it('loads a route without departure and destination as its enroute fixes, and reports nothing deleted', async () => {
        const abc = vor('ABC', 47.2, 8.1);
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], efb: true});
        await settle(unit);
        const before = messageTexts(unit).length;

        unit.efb!.sync(efbRoute({enroute: [abc, kbbb]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['ABC', 'KBBB']);
        expect(messageTexts(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([]);
    });

    // The EFB may name a lat/lon point. The unit keeps the first four characters of the name and makes them unique
    // with the first free letter, as for CUST
    it('names a lat/lon leg after the first four characters of its name (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);

        unit.efb!.sync(namedLatLonRoute([{name: 'FARMS', lat: 47.1, lon: 8.1}, {name: 'FARMS', lat: 47.2, lon: 8.2}]));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['FARM', 'FARMA']);
    });

    // CUST and CUSTA to CUSTZ are the 27 names the unit tries. The 28th lat/lon leg finds them all taken and is dropped
    // with the message of a waypoint that cannot be found
    it('drops a lat/lon leg that finds CUST to CUSTZ taken, with WAYPOINT CUST DELETED (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        const points = Array.from({length: 28}, (_, i) => ({lat: 47.0 + i * 0.01, lon: 8.3}));

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: points}));
        await vi.advanceTimersByTimeAsync(2000);

        const suffixes = ['', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
        expect(fpl0Idents(unit)).toEqual(['KAAA', ...suffixes.map(s => `CUST${s}`), 'KBBB']);
        expect(messageTexts(unit)).toContain('WAYPOINT CUST DELETED');
    });

    /** The route KAAA, a lat/lon leg, KBBB synced into a unit whose user data base holds 250 waypoints */
    async function syncLatLonLegIntoFullUserDataBase(): Promise<HeadlessUnit> {
        const full = Array.from({length: 250}, (_, i) => ({kind: 'sup' as const, ident: `U${String(i).padStart(3, '0')}`, lat: 46 + i * 0.001, lon: 9}));
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, storage: savedUserWaypoints(full)});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}]}));
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    // C-2: USR DB FULL when a user waypoint is to be created while the user data base holds 250
    it('shows USR DB FULL when the lat/lon leg needs a waypoint and the user data base holds 250 waypoints (C-2)', async () => {
        const unit = await syncLatLonLegIntoFullUserDataBase();

        expect(Screen.read().status().mode).toBe('USR DB FULL');
    });

    // What the import does with the leg it could not create: it is dropped and reported like a waypoint that cannot be found
    it('drops the lat/lon leg and reports WAYPOINT CUST DELETED when the user data base is full (characterization)', async () => {
        const unit = await syncLatLonLegIntoFullUserDataBase();

        expect(fpl0Idents(unit)).toEqual(['KAAA', 'KBBB']);
        expect(messageTexts(unit)).toContain('WAYPOINT CUST DELETED');
    });

    // The loader keeps the first 30 waypoints of a longer route, so the destination of a route of 31 is the one reported
    // deleted
    it('keeps the first 30 waypoints of a route of 31 and reports the destination deleted (characterization)', async () => {
        const fixes = Array.from({length: 29}, (_, i) => intersection(`W${String(i + 1).padStart(2, '0')}`, 47.0 + i * 0.01, 8.5));
        const unit = await bootUnit({facilities: [kaaa, kbbb, ...fixes], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: fixes}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['KAAA', ...fixes.map(f => f.icaoStruct.ident)]);
        expect(messageTexts(unit)).toContain('WAYPOINT KBBB DELETED');
    });
});

/** FakeSim stores the names in upper case */
const writeCount = (unit: HeadlessUnit, name: string): number => unit.env.sim.writes.filter(w => w.name === name.toUpperCase()).length;

// Not gated by the power switch or by Output.WriteGPSSimVars: the loader imports whatever the EFB syncs (the saver, in
// contrast, answers only with WriteGPSSimVars on). These pin what the unit does today
describe('EFB route import without a gate (characterization)', () => {
    it('imports a route while the unit is powered off (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        await unit.panel.powerOff();
        expect(fpl0Idents(unit)).toEqual([]); // Precondition: nothing in FPL 0 before the sync

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    it('imports a route with WriteGPSSimVars off (characterization)', async () => {
        const panelXml = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><WriteGPSSimVars>false</WriteGPSSimVars></Output></Instrument></PlaneHTMLConfig>';
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, panelXml});
        await settle(unit);
        expect(fpl0Idents(unit)).toEqual([]); // Precondition: nothing in FPL 0 before the sync

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['KAAA', 'KBBB']);
    });
});

// The Hot Swapping wiki page ("Hot Swapping and Package Detection") and LVars.ts LVAR_DISABLE: with L:KLN90B_Disabled
// set the device is disabled completely, so that another unit can take over. The EFB sync must not change its flight plan
describe('EFB route import while the unit is disabled for hot swapping (public contract)', () => {
    /** The unit is booted and settled, with SimVarSync having read the LVar */
    async function disabledUnit(disabled: boolean): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', disabled);
        await vi.advanceTimersByTimeAsync(300);
        return unit;
    }

    // The sibling of the pin: the same route is imported with the LVar unset
    it('the sibling: imports the route with the LVar unset', async () => {
        const unit = await disabledUnit(false);
        expect(fpl0Idents(unit)).toEqual([]); // Precondition of the pin as well: nothing in FPL 0 before the sync

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    // The other precondition of the pin: the LVar does disable the unit, its ticks stop (SimVarSync.test.ts)
    it('the sibling: the disabled unit has stopped its ticks', async () => {
        const unit = await disabledUnit(false);
        await vi.advanceTimersByTimeAsync(2000);
        const before = writeCount(unit, 'GPS WP DISTANCE');
        await vi.advanceTimersByTimeAsync(3000);
        expect(writeCount(unit, 'GPS WP DISTANCE')).toBeGreaterThan(before); // The unit ticks while enabled

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        const frozenAt = writeCount(unit, 'GPS WP DISTANCE');
        await vi.advanceTimersByTimeAsync(5000);

        expect(writeCount(unit, 'GPS WP DISTANCE')).toBe(frozenAt);
    });

    it.fails('does not import a route while the unit is disabled for hot swapping (#188)', async () => {
        const unit = await disabledUnit(true);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fpl0Idents(unit)).toEqual([]);
    });
});

// Public contract (CLAUDE.md "Public contract with aircraft": the EFB route sync). The saver sends a user waypoint as a
// lat/lon leg named by its user ICAO (U, XX, ident). When the EFB syncs that route back, the loader makes every lat/lon
// leg a new temporary waypoint, so FARM comes back as FARMA in region XY next to FARM
describe('EFB round trip of a user waypoint', () => {
    /** FPL 0 KAAA, FARM (a user waypoint), KBBB; the route the unit answers with is synced back as the EFB got it */
    async function roundTrip(): Promise<HeadlessUnit> {
        const farm = {icaoStruct: ICAO.value('U', 'XX', '', 'FARM')} as unknown as Facility;
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {...savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}]), ...savedFlightplan(0, [kaaa, farm, kbbb])},
        });
        await settle(unit);
        unit.efb!.request();
        expect(unit.efb!.replies.length).toBe(1);
        unit.efb!.sync(JSON.parse(JSON.stringify(unit.efb!.replies[0].route)));
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    // The setup of the pin: the route comes back with its three waypoints, the airports by their ICAO
    it('loads the route the unit sent with its three waypoints (the setup of #187)', async () => {
        const unit = await roundTrip();

        expect(fpl0Idents(unit).length).toBe(3);
        expect([fpl0Idents(unit)[0], fpl0Idents(unit)[2]]).toEqual(['KAAA', 'KBBB']);
    });

    it.fails('loads a user waypoint that comes back from the EFB as that waypoint (#187)', async () => {
        const unit = await roundTrip();

        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => ICAO.valueToStringV2(l.wpt.icaoStruct)))
            .toEqual(['A          KAAA    ', 'UXX        FARM    ', 'A          KBBB    ']);
        const users: string[] = [];
        KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => users.push(f.icaoStruct.ident), [FacilityType.USR]);
        expect(users).toEqual(['FARM']);
    });
});
