import {Facility, FacilityType, FlightPlanRoute, FlightPlanRouteUtils, ICAO, UserFacilityType, VorFacility} from '@microsoft/msfs-sdk';
import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {efbRoute} from '../../harness/platform';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';
import {savedFlightplan, savedUserWaypoints} from '../../harness/storage';
import {NO_GPS_SIMVARS, panelXml} from '../../harness/panelXml';
import {fplIdents, messages, userWaypoints} from '../../harness/readers';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {showSuperNav5} from '../../harness/render/superNav5';
import {MessagePage} from '../../../kln90b/controls/MessagePage';

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

        expect(fplIdents(unit)).toEqual(['KAAA', 'CUST', 'CUSTA', 'KBBB']);
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

        const entries = userWaypoints(unit, FacilityType.USR).map(fac => [fac.icaoStruct.ident, fac.icaoStruct.region, fac.lat, fac.lon]);

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
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({enroute: [abc, kbbb]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['ABC', 'KBBB']);
        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([]);
    });

    // The EFB may name a lat/lon point. The unit keeps the first four characters of the name and makes them unique
    // with the first free letter, as for CUST
    it('names a lat/lon leg after the first four characters of its name (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);

        unit.efb!.sync(namedLatLonRoute([{name: 'FARMS', lat: 47.1, lon: 8.1}, {name: 'FARMS', lat: 47.2, lon: 8.2}]));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['FARM', 'FARMA']);
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
        expect(fplIdents(unit)).toEqual(['KAAA', ...suffixes.map(s => `CUST${s}`), 'KBBB']);
        expect(messages(unit)).toContain('WAYPOINT CUST DELETED');
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

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
        expect(messages(unit)).toContain('WAYPOINT CUST DELETED');
    });

    // #195 (design §4): the destination keeps its place in the 30 en-route waypoints (4-1), so a route of 31 loses its
    // last en-route fix instead of its destination
    it('keeps the destination of a route of 31 and reports the last en-route fix deleted (#195)', async () => {
        const fixes = Array.from({length: 29}, (_, i) => intersection(`W${String(i + 1).padStart(2, '0')}`, 47.0 + i * 0.01, 8.5));
        const unit = await bootUnit({facilities: [kaaa, kbbb, ...fixes], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: fixes}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', ...fixes.slice(0, 28).map(f => f.icaoStruct.ident), 'KBBB']);
        expect(messages(unit)).toContain('WAYPOINT W29 DELETED');
        expect(messages(unit)).not.toContain('WAYPOINT KBBB DELETED');
    });

    // Appendix B: more than ten deleted waypoints give the first ten and OTHER WAYPOINTS DELETED, as loadIcaos does
    it('shows 10 deleted waypoints and OTHER WAYPOINTS DELETED for a longer cut', async () => {
        const fixes = Array.from({length: 45}, (_, i) => intersection(`W${String(i + 1).padStart(2, '0')}`, 47.0 + i * 0.01, 8.5));
        const unit = await bootUnit({facilities: [kaaa, kbbb, ...fixes], efb: true});
        await settle(unit);
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: fixes}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([
            'WAYPOINT W29 DELETED', 'WAYPOINT W30 DELETED', 'WAYPOINT W31 DELETED', 'WAYPOINT W32 DELETED',
            'WAYPOINT W33 DELETED', 'WAYPOINT W34 DELETED', 'WAYPOINT W35 DELETED', 'WAYPOINT W36 DELETED',
            'WAYPOINT W37 DELETED', 'WAYPOINT W38 DELETED', 'OTHER WAYPOINTS DELETED',
        ]);
        expect(fplIdents(unit)[29]).toBe('KBBB');
    });

    // #195 (design §6): the temporary waypoint of a lat/lon leg that the limit cuts is created, then removed again, so
    // that OTH 3 does not list a waypoint no plan uses
    it('removes the temporary waypoint of a cut lat/lon leg (#195)', async () => {
        const fixes = Array.from({length: 28}, (_, i) => intersection(`W${String(i + 1).padStart(2, '0')}`, 47.0 + i * 0.01, 8.5));
        const unit = await bootUnit({facilities: [kaaa, kbbb, ...fixes], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [...fixes, {lat: 47.5, lon: 8.6}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', ...fixes.map(f => f.icaoStruct.ident), 'KBBB']);
        expect(userWaypoints(unit)).toEqual([]);
        expect(messages(unit)).toContain('WAYPOINT CUST DELETED');
    });

    // #195 (design §6): only the waypoints this import added are removed. CUST, made by the first import, is in no
    // plan after the second, but stays until the power-on cleanup (5-22, TemporaryWaypointDeleter)
    it('keeps a temporary waypoint that existed before the import', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}]}));
        await vi.advanceTimersByTimeAsync(2000);
        expect(fplIdents(unit)).toEqual(['KAAA', 'CUST', 'KBBB']); // Precondition

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
        expect(userWaypoints(unit).map(f => [f.icaoStruct.ident, f.icaoStruct.region])).toEqual([['CUST', 'XY']]);
    });

    // Design §6: the import removes only the waypoints it created itself. FARM, a saved user waypoint (region XX) in
    // no plan, stays when the import removes the temporary waypoint of its cut lat/lon leg
    it('keeps a saved user waypoint in no plan through an import that cuts a lat/lon leg', async () => {
        const fixes = Array.from({length: 28}, (_, i) => intersection(`W${String(i + 1).padStart(2, '0')}`, 47.0 + i * 0.01, 8.5));
        const unit = await bootUnit({
            facilities: [kaaa, kbbb, ...fixes], efb: true,
            storage: savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}]),
        });
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [...fixes, {lat: 47.5, lon: 8.6}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain('WAYPOINT CUST DELETED'); // Precondition: the lat/lon leg was cut
        expect(userWaypoints(unit).map(f => [f.icaoStruct.ident, f.icaoStruct.region])).toEqual([['FARM', 'XX']]);
    });

    // Design §5: the departure and the destination are reported like any fix that cannot be found, and the rest loads
    it('reports a departure airport that is not in the database and loads the rest (#195)', async () => {
        const a = intersection('A', 47.2, 8.1);
        const unit = await bootUnit({facilities: [kbbb, a], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [a]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['A', 'KBBB']);
        expect(messages(unit)).toContain('WAYPOINT KAAA DELETED');
    });

    it('reports a destination airport that is not in the database and loads the rest (#195)', async () => {
        const a = intersection('A', 47.2, 8.1);
        const unit = await bootUnit({facilities: [kaaa, a], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [a]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'A']);
        expect(messages(unit)).toContain('WAYPOINT KBBB DELETED');
    });

    // Design §2: a PPOS leg is ignored, as before; the rest of the route loads and nothing is reported
    it('skips a PPOS leg (design §2)', async () => {
        const a = intersection('A', 47.2, 8.1);
        const unit = await bootUnit({facilities: [kaaa, kbbb, a], efb: true});
        await settle(unit);
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{ppos: true}, a]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'A', 'KBBB']);
        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([]);
    });

    // Design §6: the newest route wins. The first route is still resolving when the second arrives, so it neither
    // loads FPL 0 nor reports its unknown fix
    it('loads only the newest of two routes synced at once', async () => {
        const zzz = intersection('ZZZ', 47.2, 8.1); // not in the database
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [zzz]}));
        unit.efb!.sync(efbRoute({departure: kbbb, destination: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KBBB', 'KAAA']);
        expect(messages(unit)).not.toContain('WAYPOINT ZZZ DELETED');
    });

    // Design §6: the EFB clears the route (null) while the route before it is still resolving. FPL 0 ends empty and
    // the overtaken route reports nothing
    it('empties FPL 0 when null follows a route (design §6)', async () => {
        const zzz = intersection('ZZZ', 47.2, 8.1); // not in the database
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [zzz]}));
        unit.efb!.sync(null);
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual([]);
        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([]);
    });
});

// #195.1 (design §5): a point-bearing-distance leg (EDDF DKB180/15 WLD EDDM in #195) becomes a temporary waypoint
// like a named lat/lon leg
describe('EFB route import of point-bearing-distance legs (#195)', () => {
    const dkb = vor('DKB', 49.0, 10.0);
    const wld = intersection('WLD', 48.5, 10.5);

    async function syncPbd(facilities: Facility[], name: string): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb, wld, ...facilities], efb: true});
        await settle(unit);
        unit.efb!.sync(efbRoute({
            departure: kaaa, destination: kbbb,
            enroute: [{pbd: {reference: dkb, bearing: 180, distance: 15, name}}, wld],
        }));
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    // 15 NM due south of 49.0 N is 0.25° of latitude
    it('loads a point-bearing-distance leg as a temporary waypoint at the bearing and distance (#195)', async () => {
        const unit = await syncPbd([dkb], 'DKB180');

        expect(fplIdents(unit)).toEqual(['KAAA', 'DKB1', 'WLD', 'KBBB']);
        const wpt = unit.props.memory.fplPage.flightplans[0].getLegs()[1].wpt;
        expect(wpt.icaoStruct.region).toBe('XY');
        expect(wpt.icaoStruct.type).toBe('U');
        expect(wpt.lat).toBeCloseTo(48.75, 3);
        expect(wpt.lon).toBeCloseTo(10.0, 3);
        expect(userWaypoints(unit).map(f => f.icaoStruct.ident)).toEqual(['DKB1']);
    });

    // A bearing that is not symmetric: 15 NM due east of 49.0 N 10.0 E along the great circle (spherical, the SDK's
    // GeoPoint.offset) is 48.9994 N 10.3808 E
    it('places a point-bearing-distance waypoint east of its reference for a bearing of 090° (#195)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb, wld, dkb], efb: true});
        await settle(unit);

        unit.efb!.sync(efbRoute({
            departure: kaaa, destination: kbbb,
            enroute: [{pbd: {reference: dkb, bearing: 90, distance: 15, name: 'DKB090'}}, wld],
        }));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'DKB0', 'WLD', 'KBBB']);
        const wpt = unit.props.memory.fplPage.flightplans[0].getLegs()[1].wpt;
        expect(wpt.lat).toBeCloseTo(48.9994, 3);
        expect(wpt.lon).toBeCloseTo(10.3808, 3);
    });

    // The reference ident is DKB, which the VOR has, so the first free letter makes it DKBA
    it('names an unnamed point-bearing-distance waypoint after its reference (#195)', async () => {
        const unit = await syncPbd([dkb], '');

        expect(fplIdents(unit)).toEqual(['KAAA', 'DKBA', 'WLD', 'KBBB']);
    });

    it('drops a point-bearing-distance leg whose reference is not in the database (#195)', async () => {
        const unit = await syncPbd([], 'DKB180');

        expect(fplIdents(unit)).toEqual(['KAAA', 'WLD', 'KBBB']);
        expect(messages(unit)).toContain('WAYPOINT DKB1 DELETED');
        expect(userWaypoints(unit)).toEqual([]);
    });

    // The MSG page does not truncate: WAYPOINT, the ident and DELETED fit the 23 columns for up to 6 characters, so the
    // message names the four characters the waypoint would have had
    it('reports a long point-bearing-distance name by its first four characters (#195)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb, wld], efb: true});
        await settle(unit);
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({
            departure: kaaa, destination: kbbb,
            enroute: [{pbd: {reference: dkb, bearing: 180, distance: 15, name: 'DKB180/15'}}, wld],
        }));
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual(['WAYPOINT DKB1 DELETED']);
    });

    // The same when no letter is free for the waypoint: 27 legs take FARM and FARMA to FARMZ, the 28th is reported
    it('reports a long lat/lon name by its first four characters when no letter is free (#195)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        const before = messages(unit).length;
        const points = Array.from({length: 28}, (_, i) => ({name: 'FARMSTEAD', lat: 47.0 + i * 0.01, lon: 8.3}));

        unit.efb!.sync(namedLatLonRoute(points));
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual(['WAYPOINT FARM DELETED']);
    });
});

// #195.2 (design §5): an airway is expanded into its fixes (KMIA … KPASA Q118 BONNT … KORD in #195). Only the
// airway's exit and the fixes on either side are in the database; F1, F2 and F3 come from the airway alone
describe('EFB route import of airways (#195)', () => {
    const kmia = airport('KMIA', 25.8, -80.3);
    const kord = airport('KORD', 41.98, -87.9);
    const kpasa = intersection('KPASA', 26.5, -80.5);
    const f1 = intersection('F1', 27.0, -80.6);
    const f2 = intersection('F2', 27.5, -80.7);
    const hevan = intersection('HEVAN', 28.0, -80.8);
    const f3 = intersection('F3', 28.5, -80.9);
    const bonnt = intersection('BONNT', 30.0, -82.0);

    async function boot(facilities: Facility[] = []): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kmia, kord, kpasa, hevan, bonnt, ...facilities], efb: true});
        await settle(unit);
        return unit;
    }

    async function syncQ118(unit: HeadlessUnit): Promise<void> {
        unit.efb!.sync(efbRoute({departure: kmia, destination: kord, enroute: [kpasa, {fix: hevan, via: 'Q118'}, bonnt]}));
        await vi.advanceTimersByTimeAsync(2000);
    }

    it('expands an airway into its fixes (#195)', async () => {
        const unit = await boot();
        unit.navdata.addAirway('Q118', [kpasa, f1, f2, hevan, f3]);

        await syncQ118(unit);

        expect(fplIdents(unit)).toEqual(['KMIA', 'KPASA', 'F1', 'F2', 'HEVAN', 'BONNT', 'KORD']);
    });

    it('expands an airway flown against its listed order (#195)', async () => {
        const unit = await boot();
        unit.navdata.addAirway('Q118', [f3, hevan, f2, f1, kpasa]);

        await syncQ118(unit);

        expect(fplIdents(unit)).toEqual(['KMIA', 'KPASA', 'F1', 'F2', 'HEVAN', 'BONNT', 'KORD']);
    });

    // The sim gives a VOR on an airway as an intersection record with the VOR's ICAO; the leg is the VOR of the
    // database (with its frequency), as the SDK's Garmin route loader does
    it('loads a VOR on an airway as the VOR (#195)', async () => {
        const vvv = vor('VVV', 27.5, -80.7, {frequencyMHz: 113.9});
        const vvvOnAirway = {...intersection('VVV', 27.5, -80.7), icaoStruct: vvv.icaoStruct} as Facility;
        const unit = await boot([vvv]);
        unit.navdata.addAirway('Q118', [kpasa, f1, vvvOnAirway, hevan, f3]);

        await syncQ118(unit);

        expect(fplIdents(unit)).toEqual(['KMIA', 'KPASA', 'F1', 'VVV', 'HEVAN', 'BONNT', 'KORD']);
        const wpt = unit.props.memory.fplPage.flightplans[0].getLegs()[3].wpt;
        expect(wpt.icaoStruct.type).toBe('V');
        expect((wpt as VorFacility).freqMHz).toBe(113.9);
    });

    // A VOR on the airway that the database does not have is reported like any fix that cannot be found; the airway's
    // other fixes load
    it('reports a VOR on an airway that is not in the database (#195)', async () => {
        const vvvOnAirway = {...intersection('VVV', 27.5, -80.7), icaoStruct: vor('VVV', 27.5, -80.7).icaoStruct} as Facility;
        const unit = await boot();
        unit.navdata.addAirway('Q118', [kpasa, f1, vvvOnAirway, hevan, f3]);

        await syncQ118(unit);

        expect(fplIdents(unit)).toEqual(['KMIA', 'KPASA', 'F1', 'HEVAN', 'BONNT', 'KORD']);
        expect(messages(unit)).toContain('WAYPOINT VVV DELETED');
    });

    // Design §5: an airway the database does not have is flown direct to its exit, which loads, so nothing is reported
    it('flies direct to the exit fix of an airway that is not in the database (#195)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb, hevan], efb: true});
        await settle(unit);
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{fix: hevan, via: 'Q999'}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'HEVAN', 'KBBB']);
        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([]);
    });

    // Without a departure airport the airway leg is the first leg: nothing comes before it, so it goes direct to its
    // exit
    it('flies direct to the exit fix of an airway that is the first leg of a route without departure (#195)', async () => {
        const unit = await bootUnit({facilities: [kbbb, hevan], efb: true});
        await settle(unit);
        unit.navdata.addAirway('Q118', [kpasa, f1, f2, hevan, f3]);
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({destination: kbbb, enroute: [{fix: hevan, via: 'Q118'}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['HEVAN', 'KBBB']);
        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([]);
    });

    // The fix before the airway is the airport, which is not on it: the leg goes direct to its exit, and as the exit is
    // loaded nothing is reported
    it('flies direct to the exit fix when the airway has no entry (#195)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb, kpasa, hevan], efb: true});
        await settle(unit);
        unit.navdata.addAirway('Q118', [kpasa, f1, f2, hevan, f3]);
        const before = messages(unit).length;

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{fix: hevan, via: 'Q118'}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'HEVAN', 'KBBB']);
        expect(messages(unit).slice(before).filter(m => m.includes('DELETED'))).toEqual([]);
    });

    it('flies direct when the exit is the entry (#195)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb, kpasa], efb: true});
        await settle(unit);
        unit.navdata.addAirway('Q118', [kpasa, f1, f2, hevan, f3]);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [kpasa, {fix: kpasa, via: 'Q118'}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KPASA', 'KPASA', 'KBBB']);
    });

    // Expanded fixes are en-route fixes: they count toward the 30 (4-1) and are cut like any other
    it('cuts an expanded airway at the limit and keeps the destination (#195)', async () => {
        const fixes = Array.from({length: 40}, (_, i) => intersection(`X${String(i).padStart(2, '0')}`, 47.0 + i * 0.01, 8.5));
        const unit = await bootUnit({facilities: [kaaa, kbbb, fixes[0], fixes[39]], efb: true});
        await settle(unit);
        unit.navdata.addAirway('J40', fixes);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [fixes[0], {fix: fixes[39], via: 'J40'}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', ...fixes.slice(0, 28).map(f => f.icaoStruct.ident), 'KBBB']);
        expect(messages(unit)).toContain('WAYPOINT X28 DELETED');
    });
});

// Not gated by the power switch or by Output.WriteGPSSimVars: the loader imports whatever the EFB syncs (the saver, in
// contrast, answers only with WriteGPSSimVars on). These pin what the unit does today
describe('EFB route import without a gate (characterization)', () => {
    it('imports a route while the unit is powered off (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        await unit.panel.powerOff();
        expect(fplIdents(unit)).toEqual([]); // Precondition: nothing in FPL 0 before the sync

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    it('imports a route with WriteGPSSimVars off (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, panelXml: panelXml(NO_GPS_SIMVARS)});
        await settle(unit);
        expect(fplIdents(unit)).toEqual([]); // Precondition: nothing in FPL 0 before the sync

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
    });
});

// The Hot Swapping wiki page ("Hot Swapping and Package Detection") and LVars.ts LVAR_DISABLE: with L:KLN90B_Disabled
// set the device is disabled completely, so that another unit can take over. The EFB sync must not change its flight plan
describe('EFB route import while the unit is disabled for hot swapping (public contract)', () => {
    /** The unit is booted and settled, with SimVarSync having read the LVar */
    async function disabledUnit(disabled: boolean, storage?: Record<string, unknown>): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, storage});
        await settle(unit);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', disabled);
        await vi.advanceTimersByTimeAsync(300);
        return unit;
    }

    // The same route is imported with the LVar unset
    it('imports the route with the LVar unset', async () => {
        const unit = await disabledUnit(false);
        expect(fplIdents(unit)).toEqual([]); // Precondition of the disabled test as well: nothing in FPL 0 before the sync

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    // The other precondition: the LVar does disable the unit, its ticks stop (SimVarSync.test.ts)
    it('the disabled unit has stopped its ticks', async () => {
        const unit = await disabledUnit(false);
        await vi.advanceTimersByTimeAsync(2000);
        const before = unit.env.sim.writeCount('GPS WP DISTANCE');
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.env.sim.writeCount('GPS WP DISTANCE')).toBeGreaterThan(before); // The unit ticks while enabled

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        const frozenAt = unit.env.sim.writeCount('GPS WP DISTANCE');
        await vi.advanceTimersByTimeAsync(5000);

        expect(unit.env.sim.writeCount('GPS WP DISTANCE')).toBe(frozenAt);
    });

    it('does not import a route while the unit is disabled for hot swapping (#188)', async () => {
        const unit = await disabledUnit(true);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual([]);
    });

    // A flight plan that the disabled unit holds stays as it is, whatever the other GPS syncs: a different route and the
    // end of the synced route (null, which would empty FPL 0)
    it('leaves the flight plan of the disabled unit as it was (#188)', async () => {
        const unit = await disabledUnit(true, savedFlightplan(0, [kaaa, kbbb]));
        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']); // Precondition: restored

        unit.efb!.sync(efbRoute({departure: kbbb, destination: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);
        unit.efb!.sync(null);
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    // The temporary waypoints of a lat/lon leg are made while the route loads, so a dropped route leaves none
    it('adds no temporary waypoint for a route with a lat/lon leg while disabled (#188)', async () => {
        const unit = await disabledUnit(true);

        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.2, lon: 8.1}]}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(userWaypoints(unit)).toEqual([]);
        expect(fplIdents(unit)).toEqual([]);
    });

    // Public contract (CLAUDE.md "Public contract with aircraft"; the Hot Swapping wiki page): a disabled unit has no side
    // effects, so the route that arrives while it is disabled is dropped, not parsed. The SDK keeps the last synced route
    // in a Subject, but the loader does not read it again when the unit resumes
    it('does not import the dropped route when the unit resumes (public contract)', async () => {
        const unit = await disabledUnit(true);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);

        expect(fplIdents(unit)).toEqual([]);
    });

    // The disabled unit resumes where it left off (Hot Swapping wiki page): a dropped route does not switch the left page
    // to FPL 0, as an imported route does. The unit is on SET 5 before it is disabled
    it('resumes on the page it was on after a dropped route (public contract, #188)', async () => {
        const unit = await disabledUnit(false);
        await unit.panel.selectPage('L', 'SET 5');
        await vi.advanceTimersByTimeAsync(1000);
        const rowsBefore = Screen.read().rows('L');
        expect(Screen.read().status().left).toBe('SET 5'); // Precondition: not on the flight plan page

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);

        expect(Screen.read().status().left).toBe('SET 5');
        expect(Screen.read().rows('L')).toEqual(rowsBefore);
    });

    // The maintainer's ruling (#138): L:KLN90B_Disabled is read only by the 100 ms poll of SimVarSync, which keeps the
    // state on Hardware; the EFB gates read the kept state (#353), because reading the LVar is expensive. Ten polls in a
    // second, whatever the EFB sends
    it('reads L:KLN90B_Disabled only in the poll, also while the EFB requests and syncs routes (#353)', async () => {
        const unit = await disabledUnit(true);
        const read = vi.spyOn(SimVar, 'GetSimVarValue');

        unit.efb!.request();
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        unit.efb!.request();
        unit.efb!.sync(efbRoute({departure: kbbb, destination: kaaa}));
        await vi.advanceTimersByTimeAsync(1000);

        expect(read.mock.calls.filter(c => c[0] === 'L:KLN90B_Disabled').length).toBe(10);
    });

    // After the resume the next synced route is imported again: the disabled state does not stick
    it('imports a route synced after the unit resumed (#188)', async () => {
        const unit = await disabledUnit(true);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        unit.efb!.sync(efbRoute({departure: kbbb, destination: kaaa}));
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['KBBB', 'KAAA']);
    });
});

// Public contract (CLAUDE.md "Public contract with aircraft": the EFB route sync). The saver sends a user (XX) or
// temporary (XY) waypoint as a lat/lon leg named by its ICAO, always with the type U. The maintainer's ruling (#187): when
// the EFB syncs that leg back and the unit still holds the waypoint, it comes back as that waypoint, matched by region and
// ident whatever its type, with the position the unit holds; one it no longer holds is created anew as a temporary
// waypoint. The tests sync back exactly what the unit sent (whether the sim's EFB keeps the fixIcao is not known)
describe('EFB round trip of a user waypoint', () => {
    const farm = {icaoStruct: ICAO.value('U', 'XX', '', 'FARM')} as unknown as Facility;

    /** The route the unit answers the next request with, as a copy the EFB could sync back */
    function requestRoute(unit: HeadlessUnit): FlightPlanRoute {
        const before = unit.efb!.replies.length;
        unit.efb!.request();
        expect(unit.efb!.replies.length).toBe(before + 1);
        return JSON.parse(JSON.stringify(unit.efb!.replies[before].route));
    }

    async function syncBack(unit: HeadlessUnit, route: FlightPlanRoute): Promise<void> {
        unit.efb!.sync(route);
        await vi.advanceTimersByTimeAsync(2000);
    }

    /** FPL 0 KAAA, FARM (a user waypoint at 47.2 N 8.1 E), KBBB */
    async function bootWithFarm(): Promise<HeadlessUnit> {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {...savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}]), ...savedFlightplan(0, [kaaa, farm, kbbb])},
        });
        await settle(unit);
        return unit;
    }

    /** FPL 0 KAAA, FARM, KBBB; the route the unit answers with is synced back as the EFB got it */
    async function roundTrip(): Promise<HeadlessUnit> {
        const unit = await bootWithFarm();
        await syncBack(unit, requestRoute(unit));
        return unit;
    }

    /** The ICAO of each leg of FPL 0 in the SDK's V2 string form */
    const fpl0Icaos = (unit: HeadlessUnit) =>
        unit.props.memory.fplPage.flightplans[0].getLegs().map(l => ICAO.valueToStringV2(l.wpt.icaoStruct));

    // The setup of the pin: the route comes back with its three waypoints, the airports by their ICAO
    it('loads the route the unit sent with its three waypoints (the setup of #187)', async () => {
        const unit = await roundTrip();

        expect(fplIdents(unit).length).toBe(3);
        expect([fplIdents(unit)[0], fplIdents(unit)[2]]).toEqual(['KAAA', 'KBBB']);
    });

    it('loads a user waypoint that comes back from the EFB as that waypoint (#187)', async () => {
        const unit = await roundTrip();

        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => ICAO.valueToStringV2(l.wpt.icaoStruct)))
            .toEqual(['A          KAAA    ', 'UXX        FARM    ', 'A          KBBB    ']);
        expect(userWaypoints(unit, FacilityType.USR).map(f => f.icaoStruct.ident)).toEqual(['FARM']);
    });

    // Each leg is matched by its own ident: two user waypoints of the same region come back as themselves
    it('loads two user waypoints that come back from the EFB each as itself (#187)', async () => {
        const lake = {icaoStruct: ICAO.value('U', 'XX', '', 'LAKE')} as unknown as Facility;
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {
                ...savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}, {kind: 'sup', ident: 'LAKE', lat: 47.3, lon: 8.2}]),
                ...savedFlightplan(0, [kaaa, farm, lake, kbbb]),
            },
        });
        await settle(unit);

        await syncBack(unit, requestRoute(unit));

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXX        FARM    ', 'UXX        LAKE    ', 'A          KBBB    ']);
    });

    // The saver sends the user VOR UVR as U XX UVR (KlnEfbSaver.toEnrouteSegment), so the type of the leg is not the type
    // of the waypoint
    it('loads a user VOR that comes back from the EFB as that VOR (#187)', async () => {
        const uvr = {icaoStruct: ICAO.value('V', 'XX', '', 'UVR')} as unknown as Facility;
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: {
                ...savedUserWaypoints([{kind: 'vor', ident: 'UVR', lat: 47.2, lon: 8.1, freqMHz: 112.5, magvar: 2}]),
                ...savedFlightplan(0, [kaaa, uvr, kbbb]),
            },
        });
        await settle(unit);
        const route = requestRoute(unit);
        expect(route.enroute.map(l => ICAO.valueToStringV2(l.fixIcao))).toEqual(['UXX        UVR     ']); // Precondition: sent as U

        await syncBack(unit, route);

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'VXX        UVR     ', 'A          KBBB    ']);
        expect(userWaypoints(unit).map(f => f.icaoStruct.ident)).toEqual(['UVR']);
    });

    // A lat/lon leg of the EFB becomes the temporary waypoint CUST (region XY); the unit sends it back as U XY CUST
    it('loads a temporary waypoint that comes back from the EFB as that waypoint, over two round trips (#187)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        await syncBack(unit, efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.2, lon: 8.1}]}));
        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXY        CUST    ', 'A          KBBB    ']); // Precondition

        await syncBack(unit, requestRoute(unit));
        await syncBack(unit, requestRoute(unit));

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXY        CUST    ', 'A          KBBB    ']);
        expect(userWaypoints(unit).map(f => f.icaoStruct.ident)).toEqual(['CUST']);
    });

    // The waypoint the unit holds wins: a position changed on the way through the EFB is dropped
    it('keeps the position the unit holds when the EFB sends the user waypoint back elsewhere (#187)', async () => {
        const unit = await bootWithFarm();
        const route = requestRoute(unit);
        route.enroute[0].lat = 47.3;

        await syncBack(unit, route);

        const leg = unit.props.memory.fplPage.flightplans[0].getLegs()[1];
        expect(ICAO.valueToStringV2(leg.wpt.icaoStruct)).toBe('UXX        FARM    ');
        expect(leg.wpt.lat).toBeCloseTo(47.2, 6);
        expect(userWaypoints(unit).map(f => f.icaoStruct.ident)).toEqual(['FARM']);
    });

    // A user waypoint the unit no longer holds (deleted after the route went to the EFB) is created anew, as before the
    // fix: a temporary waypoint in region XY at the position of the leg, named after it because the ident is free
    it('creates a temporary waypoint for a user waypoint the unit no longer holds (#187)', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true});
        await settle(unit);
        const route = efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.2, lon: 8.1}]});
        route.enroute[0].fixIcao = ICAO.value('U', 'XX', '', 'FARM'); // As the unit sent it before FARM was deleted

        await syncBack(unit, route);

        const leg = unit.props.memory.fplPage.flightplans[0].getLegs()[1];
        expect(ICAO.valueToStringV2(leg.wpt.icaoStruct)).toBe('UXY        FARM    ');
        expect(leg.wpt.lat).toBeCloseTo(47.2, 6);
        expect(leg.wpt.lon).toBeCloseTo(8.1, 6);
    });

    // The match is by region and ident: a lat/lon leg that names a fix of the data base (an airport FARM, no user region)
    // is not the user waypoint FARM, and a leg in region XY is not the user waypoint FARM in region XX. Both become new
    // temporary waypoints with a unique name
    it('does not take a lat/lon leg of another region with the same ident for the user waypoint (#187)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: savedUserWaypoints([{kind: 'sup', ident: 'FARM', lat: 47.2, lon: 8.1}]),
        });
        await settle(unit);
        const route = efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.2}, {lat: 47.3, lon: 8.3}]});
        route.enroute[0].fixIcao = ICAO.value('A', '', '', 'FARM');
        route.enroute[1].fixIcao = ICAO.value('U', 'XY', '', 'FARM');

        await syncBack(unit, route);

        expect(fpl0Icaos(unit)).toEqual(['A          KAAA    ', 'UXY        FARMA   ', 'UXY        FARMB   ', 'A          KBBB    ']);
    });
});

// #395, the maintainer's ruling: the EFB load always wins. Every page pushed on the left closes with its right-side
// children, FPL 0 becomes the left base page with the cursor off, and an unfinished left entry is dropped; the right
// page keeps its own cursor and edits; only the MSG page stays on top. The EFB sync is part of the public contract, not
// of the real unit, so no manual page applies
describe('EFB route import over open pages (#395)', () => {
    /** The right half after the load: NAV 1 for the route KAAA-KBBB, the aircraft at the origin of the harness */
    const NAV1_ROWS = ['KAAA ›KBBB ', 'ηηηηηΟηηηηη', 'DIS  24.0nm', 'GS      0kt', 'ETE   --:--', 'BRG    000°'];

    async function boot(extra: Facility[] = []): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb, ...extra], efb: true});
        await settle(unit);
        return unit;
    }

    async function sync(unit: HeadlessUnit): Promise<void> {
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
        await vi.advanceTimersByTimeAsync(2000);
    }

    it('closes the creation page of an unknown D-> ident on the right (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('R')[2]).toBe('CREATE NEW '); // Precondition

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
        expect(Screen.read().rows('R')).toEqual(NAV1_ROWS); // The right half is drawn again
    });

    it('closes the ALT page and the NAV 4 page it pushed on the right (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.alt();

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
        await unit.panel.alt();
        await unit.panel.alt(); // one pair is pushed and closed again
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    it('closes the creation page of an FPL 0 insert, whose parent is the left base page (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('R')[2]).toBe('CREATE NEW '); // Precondition

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
        expect(Screen.read().rows('R')).toEqual(NAV1_ROWS);
    });

    // The pin of the order in replaceLeftBasePage: closing ALT removes its NAV 4 on the right and sets the flag to draw
    // the right half again. That flag must not keep the creation page, the child of the old base page FPL 0, from going
    it('closes the creation page of an FPL 0 insert with ALT open over it (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('R')[2]).toBe('CREATE NEW '); // Precondition
        await unit.panel.alt();
        expect(Screen.read().rows('R')[0]).toBe('VNV INACTV '); // Precondition: ALT pushed NAV 4 over the creation page

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
        expect(Screen.read().rows('R')).toEqual(NAV1_ROWS);
    });

    // Holds on today's code too: the D-> page is replaced by FPL 0 with the cursor off
    it('replaces the D-> page with FPL 0, the cursor off (#395)', async () => {
        const unit = await boot();
        await unit.panel.dct();

        await sync(unit);

        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['Á 1:KAAA   ', 'À 2:KBBB   ']);
    });

    it('makes FPL 0 the base of the left stack, not a page over the old base page (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.dct();
        await sync(unit);
        expect(Screen.read().status().left).toBe('FPL 0'); // Precondition

        await unit.panel.outer('L', 1);

        // The turn leaves FPL 0 for the next page group. Were the old base page (FPL 3, its cursor on) still beneath
        // FPL 0, the knob would pop FPL 0 and that page would take it (status left CRSR)
        expect(Screen.read().status().left).toBe('NAV 2');
    });

    // The pin of the loop count: two pages are pushed over the base page (D-> and the Duplicate Waypoint page it pushes
    // for the ident ABD), and both must close. With one pop only, the old base page (FPL 3, its cursor on) stays beneath
    // FPL 0, and the knob would pop FPL 0 and give the turn to that page
    it('closes two pushed left pages, D-> and its Duplicate Waypoint page (#395)', async () => {
        const unit = await boot([vor('ABD', 47.3, 8.1, {region: 'LS'}), vor('ABD', 48.5, 8.5, {region: 'ED'})]);
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'ABD');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('L')[0]).toBe(' ABD      2'); // Precondition: the Duplicate Waypoint page

        await sync(unit);
        expect(Screen.read().status().left).toBe('FPL 0');
        await unit.panel.outer('L', 1);

        expect(Screen.read().status().left).toBe('NAV 2');
    });

    // The pin of the order in popLeftPage: ALT pushes NAV 4 on the right as its child, D-> over ALT pushes the creation
    // page of an unknown ident as its own child. The first pop (D->) must not keep the second pop (ALT) from removing
    // NAV 4
    it('closes the right-side children of every page pushed on the left, ALT and D-> over it (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.alt();
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'QQQQ');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('R')[2]).toBe('CREATE NEW '); // Precondition

        await sync(unit);

        expect(Screen.read().status()).toEqual({left: 'FPL 0', mode: 'enr-leg msg', right: 'NAV 1'});
        expect(Screen.read().rows('R')).toEqual(NAV1_ROWS);
    });

    // Holds on today's code too: an unfinished insert on FPL 0 is dropped
    it('drops an unfinished entry on the left base page (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // starts an insert: 1:A
        expect(Screen.read().rows('L')[1]).toBe('  1:A      '); // Precondition

        await sync(unit);

        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['Á 1:KAAA   ', 'À 2:KBBB   ']);
    });

    // Holds on today's code too: the right page keeps its cursor and the character being edited
    it('keeps the cursor and the edit of the right page (#395)', async () => {
        const unit = await boot();
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.inner('R', 1);
        const edited = Screen.read().rows('R')[0];

        await sync(unit);

        expect(Screen.read().status()).toMatchObject({left: 'FPL 0', right: 'CRSR'});
        expect(Screen.read().rows('R')[0]).toBe(edited);
    });

    // Holds on today's code too: the MSG page stays on top, and FPL 0 is beneath it
    it('keeps the MSG page on top with FPL 0 beneath it (#395)', async () => {
        const unit = await boot();
        await unit.panel.msg();

        await sync(unit);

        expect(unit.overlay()).toBeInstanceOf(MessagePage);
        await unit.panel.msg();
        expect(Screen.read().status().left).toBe('FPL 0');
    });

    // Holds on today's code too: a super page shows only while its left page shows (MainPage.checkIfSuperPageIsShown)
    it('ends Super NAV 5 and SET 0 (#395)', async () => {
        const unit = await boot();
        await showSuperNav5(unit);
        await sync(unit);
        expect(unit.overlay()).toBeNull();
        expect(Screen.read().status().left).toBe('FPL 0');

        await unit.panel.selectPage('L', 'SET 0');
        await sync(unit);
        expect(unit.overlay()).toBeNull();
        expect(Screen.read().status().left).toBe('FPL 0');
    });
});
