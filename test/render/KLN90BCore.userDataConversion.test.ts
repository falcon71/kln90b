import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {airport, ndb, vor} from '../harness/navdata/builders';
import {Screen} from '../harness/render/screen';
import {savedFlightplan, storedSetting} from '../harness/storage';

/** Boots with a file written by version 1: no userDataFormat, FPL 1 in fpl0 and 12 character ICAOs */
function bootVersion1File(): Promise<HeadlessUnit> {
    return bootUnit({
        facilities: [airport('KAAA', 47, 8), vor('ABC', 47.2, 8, {region: 'K1'})],
        storage: {wpt0: 'WXX    USRA +4730.00-00815.50', fpl0: 'A      KAAA VK1    ABC  '},
    });
}

describe('user data conversion at boot (#47)', () => {
    it('marks the file as version 2', async () => {
        const unit = await bootVersion1File();
        expect(storedSetting(unit, 'userDataFormat')).toBe(2);
    });

    it('rewrites the user waypoints in the version 2 format', async () => {
        const unit = await bootVersion1File();
        expect(storedSetting(unit, 'wpt0')).toBe('WXX        USRA    +4730.00-00815.50');
    });

    it('moves FPL 1 from fpl0 to fpl1 in the version 2 format', async () => {
        const unit = await bootVersion1File();
        expect(storedSetting(unit, 'fpl1')).toBe('A          KAAA    VK1        ABC     ');
    });

    it('empties fpl0, because FPL 0 was not saved in version 1', async () => {
        const unit = await bootVersion1File();
        expect(storedSetting(unit, 'fpl0')).toBe('');
    });
});

// Contract source: docs/architecture.md Core 7 (the V1 layouts, the migration at boot and the V2 layouts)
describe('user data conversion of every kind (#47)', () => {
    it('rewrites every waypoint kind in V2 and moves FPL 25 from fpl24 to fpl25', async () => {
        const unit = await bootUnit({
            facilities: [airport('KAAA', 47, 8), vor('ABC', 47.2, 8, {region: 'K1'}), ndb('XY', 47.3, 8.1, {region: 'K2'})],
            storage: {
                wpt0: 'AXX    UAPT +4700.00-00830.00+01400+03200H',
                wpt1: 'VXX    UVOR +4730.00+00854.00+114.30-02',
                wpt2: 'NXX    UNDB +4800.00-00915.00+0345.0',
                wpt3: 'WXX    UINT +4730.00-00815.50',
                wpt4: 'UXX    MYWPT+4730.00+00815.00',
                fpl24: 'A      KAAA ' + 'UXX    MYWPT' + 'NK2    XY   ',
            },
        });

        expect([0, 1, 2, 3, 4].map(i => storedSetting(unit, `wpt${i}`))).toEqual([
            'AXX        UAPT    +4700.00-00830.00+01400+03200H',
            'VXX        UVOR    +4730.00+00854.00+114.30-02',
            'NXX        UNDB    +4800.00-00915.00+0345.0',
            'WXX        UINT    +4730.00-00815.50',
            'UXX        MYWPT   +4730.00+00815.00',
        ]);
        expect(storedSetting(unit, 'fpl25')).toBe('A          KAAA    UXX        MYWPT   NK2        XY      ');
        expect(storedSetting(unit, 'fpl24')).toBe('');
    });
});

// Core 7: the last active waypoint is stored as an ICAO V1 string, whatever the format of the rest of the user data
describe('the stored last active waypoint is an ICAO V1 string', () => {
    it('reads activeWaypoint as V1 and opens its page at boot', async () => {
        const unit = await bootUnit({facilities: [vor('ABC', 47.2, 8, {region: 'K1'})], storage: {activeWaypoint: 'VK1    ABC  '}});

        expect(Screen.read().rightName()).toBe('VOR  ');
        // The D marks a VOR with DME, which the builder's VOR is
        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');
        expect(unit.consoleErrors).toEqual([]);
    });

    it('writes activeWaypoint as V1', async () => {
        const kaaa = airport('KAAA', 47, 8);
        const abc = vor('ABC', 47.2, 8, {region: 'K1'});
        const unit = await bootUnit({facilities: [kaaa, abc], position: {lat: 47.1, lon: 8}, storage: savedFlightplan(0, [kaaa, abc])});
        await settle(unit);

        expect(storedSetting(unit, 'activeWaypoint')).toBe('VK1    ABC  ');
    });
});

// Core 7: a failed restore replaces the plans by empty ones and posts USER DATA LOST. The maintainer ruled that the
// corrupt data is then wiped once from the saved data, as the V1 conversion does, which the V2 restore does not (#NEW-6-1).
describe('a failed V2 restore of the user data', () => {
    // Written by hand: savedFlightplan sets userDataFormat 2 as well, but its strings come from the SDK. The type letter Q
    // is no facility type, so the V2 waypoint loader throws "Unsupported facility type".
    const storage = {userDataFormat: 2, wpt0: 'QXX        BAD     +4700.00+00800.00', fpl1: 'A          KAAA    '};

    async function bootCorruptFile(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [airport('KAAA', 47, 8)], storage});
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    it('reports USER DATA LOST on the MSG page and logs no console error', async () => {
        const unit = await bootCorruptFile();
        await unit.panel.msg();

        expect(Screen.read().text().split('\n').map(row => row.trimEnd())).toContain('USER DATA LOST');
        expect(unit.consoleErrors).toEqual([]);
    });

    it('restores the same file without the corrupt record and reports nothing lost', async () => {
        const unit = await bootUnit({
            facilities: [airport('KAAA', 47, 8)],
            storage: {userDataFormat: 2, wpt0: 'WXX        GOOD    +4700.00+00800.00', fpl1: 'A          KAAA    '},
        });
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.msg();

        expect(Screen.read().text().split('\n').map(row => row.trimEnd())).not.toContain('USER DATA LOST');
        expect(storedSetting(unit, 'fpl1')).toBe('A          KAAA    ');
    });

    it.fails('wipes the corrupt waypoint and the plan from the saved data (#NEW-6-1)', async () => {
        const unit = await bootCorruptFile();

        expect(storedSetting(unit, 'wpt0')).toBe('');
        expect(storedSetting(unit, 'fpl1')).toBe('');
    });
});
