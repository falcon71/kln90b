import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {FacilityType, ICAO} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../kln90b/data/navdata/KLNFacilityRepository';
import {bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {airport, intersection, ndb, vor} from '../harness/navdata/builders';
import {Screen} from '../harness/render/screen';
import {fplIdents, messages, userWaypoints} from '../harness/readers';
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

        // The V2 writer adds the airport elevation in whole feet after the surface (#449): 1400 m are 4593.2 ft
        expect([0, 1, 2, 3, 4].map(i => storedSetting(unit, `wpt${i}`))).toEqual([
            'AXX        UAPT    +4700.00-00830.00+01400+03200H+04593',
            'VXX        UVOR    +4730.00+00854.00+114.30-02',
            'NXX        UNDB    +4800.00-00915.00+0345.0',
            'WXX        UINT    +4730.00-00815.50',
            'UXX        MYWPT   +4730.00+00815.00',
        ]);
        expect(storedSetting(unit, 'fpl25')).toBe('A          KAAA    UXX        MYWPT   NK2        XY      ');
        expect(storedSetting(unit, 'fpl24')).toBe('');
    });
});

// Core 7: the last active waypoint is saved as an ICAO V2 string, and a V1 string of an older version still restores
describe('the stored last active waypoint is an ICAO string', () => {
    const abc = vor('ABC', 47.2, 8, {region: 'K1'});

    it('restores a last active waypoint saved as ICAO V2 and opens its page at boot (#415)', async () => {
        const unit = await bootUnit({facilities: [abc], storage: {activeWaypoint: ICAO.valueToStringV2(abc.icaoStruct)}});

        expect(unit.props.memory.navPage.activeWaypoint.lastactiveWaypoint?.icaoStruct.ident).toBe('ABC');
        expect(Screen.read().rightName()).toBe('VOR  ');
        // The D marks a VOR with DME, which the builder's VOR is
        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');
        expect(unit.consoleErrors).toEqual([]);
    });

    it('still restores a last active waypoint saved as ICAO V1 by an older version (#415)', async () => {
        const unit = await bootUnit({facilities: [abc], storage: {activeWaypoint: 'VK1    ABC  '}});

        expect(unit.props.memory.navPage.activeWaypoint.lastactiveWaypoint?.icaoStruct.ident).toBe('ABC');
        expect(Screen.read().rightName()).toBe('VOR  ');
        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');
        expect(unit.consoleErrors).toEqual([]);
    });

    it('does not rewrite a stored V1 value at boot (#415)', async () => {
        const unit = await bootUnit({facilities: [abc], storage: {activeWaypoint: 'VK1    ABC  '}});
        await settle(unit);

        expect(storedSetting(unit, 'activeWaypoint')).toBe('VK1    ABC  ');
    });

    // The type letter Q is no facility type, so the string is well formed but names nothing the unit can load
    it('boots without a last active waypoint when the stored value is malformed (#415)', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => spy.mockRestore());
        const malformed = 'QK1        ABC     ';

        const unit = await bootUnit({facilities: [abc], storage: {activeWaypoint: malformed}});

        expect(unit.consoleErrors.map(args => args[0])).toEqual([`Last active waypoint not found: ${malformed}`]);
        expect(unit.props.memory.navPage.activeWaypoint.lastactiveWaypoint).toBeNull();
    });

    // B-4: a waypoint that is no longer in the database is reported as WAYPOINT ___ DELETED. That includes the active one
    it('reports a last active waypoint that is no longer in the database as WAYPOINT xxx DELETED (#421)', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => spy.mockRestore());

        const unit = await bootUnit({facilities: [], storage: {activeWaypoint: ICAO.valueToStringV2(abc.icaoStruct)}});

        expect(messages(unit).filter(m => m.includes('DELETED'))).toEqual(['WAYPOINT ABC DELETED']);
        expect(unit.props.memory.navPage.activeWaypoint.lastactiveWaypoint).toBeNull();
    });

    it('reports a last active waypoint saved as ICAO V1 that is no longer in the database (#421)', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => spy.mockRestore());

        const unit = await bootUnit({facilities: [], storage: {activeWaypoint: 'VK1    ABC  '}});

        expect(messages(unit).filter(m => m.includes('DELETED'))).toEqual(['WAYPOINT ABC DELETED']);
    });

    it('posts no message when the last active waypoint is restored (#421)', async () => {
        const unit = await bootUnit({facilities: [abc], storage: {activeWaypoint: ICAO.valueToStringV2(abc.icaoStruct)}});

        expect(messages(unit).filter(m => m.includes('DELETED'))).toEqual([]);
    });

    it('saves the active waypoint as ICAO V2 (#415)', async () => {
        const kaaa = airport('KAAA', 47, 8);
        const unit = await bootUnit({facilities: [kaaa, abc], position: {lat: 47.1, lon: 8}, storage: savedFlightplan(0, [kaaa, abc])});
        await settle(unit);

        // Type V, region K1, eight blanks for the airport, the ident padded to eight
        expect(storedSetting(unit, 'activeWaypoint')).toBe('VK1        ABC     ');
    });

    // The V1 string holds four characters of airport, so the save used to throw for a terminal waypoint of a longer ident
    it('saves an active waypoint that the V1 format cannot hold (#415)', async () => {
        const kaaa = airport('KAAA', 47, 8);
        const terminal = longAirportIntersection();
        const unit = await bootUnit({facilities: [kaaa, terminal], position: {lat: 47.1, lon: 8}, storage: savedFlightplan(0, [kaaa, terminal])});
        await settle(unit);

        expect(unit.errors).toEqual([]);
        expect(storedSetting(unit, 'activeWaypoint')).toBe('WK1LONGAPT TERM    ');
    });

    it('restores an active waypoint that the V1 format cannot hold (#415)', async () => {
        const terminal = longAirportIntersection();
        const unit = await bootUnit({facilities: [terminal], storage: {activeWaypoint: 'WK1LONGAPT TERM    '}});

        expect(unit.props.memory.navPage.activeWaypoint.lastactiveWaypoint?.icaoStruct).toEqual(terminal.icaoStruct);
        expect(unit.consoleErrors).toEqual([]);
    });
});

/** A terminal intersection of an airport with a seven character ident */
function longAirportIntersection() {
    return {...intersection('TERM', 47.2, 8, {region: 'K1'}), icaoStruct: ICAO.value('W', 'K1', 'LONGAPT', 'TERM')};
}

// Core 7: a failed restore replaces the plans by empty ones and posts USER DATA LOST. The maintainer ruled that the
// corrupt data is then wiped once from the saved data, as the V1 conversion does (#144).
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
        // The restore ran: the waypoint is in the repository and FPL 1 holds its leg
        const good = KLNFacilityRepository.getRepository(unit.props.bus).get(ICAO.value('W', 'XX', '', 'GOOD'));
        expect(good?.icaoStruct.ident).toBe('GOOD');
        expect(fplIdents(unit, 1)).toEqual(['KAAA']);
        expect(storedSetting(unit, 'fpl1')).toBe('A          KAAA    ');
    });

    it('wipes the corrupt waypoint and the plan from the saved data (#144)', async () => {
        const unit = await bootCorruptFile();

        expect(storedSetting(unit, 'wpt0')).toBe('');
        expect(storedSetting(unit, 'fpl1')).toBe('');
        expect(storedSetting(unit, 'userDataFormat')).toBe(2);
    });

    // A plan that cannot be read (a number where the V2 format has a string) fails the restore of the plans, and the
    // waypoints that were restored stay: only the plans are written over
    it('wipes an unreadable plan, and keeps the waypoints that were restored (#144)', async () => {
        const good = 'WXX        GOOD    +4700.00+00800.00';
        const unit = await bootUnit({
            facilities: [airport('KAAA', 47, 8)],
            storage: {userDataFormat: 2, wpt0: good, fpl1: 'A          KAAA    ', fpl3: 5},
        });
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.msg();
        expect(Screen.read().text().split('\n').map(row => row.trimEnd())).toContain('USER DATA LOST'); // the precondition

        expect(storedSetting(unit, 'wpt0')).toBe(good);
        expect(userWaypoints(unit, FacilityType.Intersection).map(w => w.icaoStruct.ident)).toEqual(['GOOD']);
        expect(storedSetting(unit, 'fpl1')).toBe('');
        expect(storedSetting(unit, 'fpl3')).toBe('');
    });

    // The wipe empties every slot, not only the ones that held something
    it('empties every stored slot, the last ones included (#144)', async () => {
        const unit = await bootUnit({
            facilities: [airport('KAAA', 47, 8)],
            storage: {userDataFormat: 2, wpt0: 'QXX        BAD     +4700.00+00800.00', wpt1: 'WXX        TWO     +4700.00+00800.00', fpl25: 'A          KAAA    '},
        });
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'wpt1')).toBe('');
        expect(storedSetting(unit, 'fpl25')).toBe('');
        expect(userWaypoints(unit)).toEqual([]);
    });

    // A restore that works leaves the data as it is, a plan included (the unit loses nothing by starting)
    it('leaves valid data alone and reports nothing lost (#144)', async () => {
        const stored = {userDataFormat: 2, wpt0: 'WXX        GOOD    +4700.00+00800.00', fpl2: 'A          KAAA    '};
        const unit = await bootUnit({facilities: [airport('KAAA', 47, 8)], storage: stored});
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'wpt0')).toBe(stored.wpt0);
        expect(storedSetting(unit, 'fpl2')).toBe(stored.fpl2);
        expect(messages(unit)).not.toContain('USER DATA LOST');
    });
});

// The same wipe as the conversion of a V1 file: a V1 file that cannot be restored is written over once, in the V2 format
describe('a failed V1 restore of the user data', () => {
    it('wipes the corrupt data, marks the file as version 2 and reports USER DATA LOST (#144)', async () => {
        const unit = await bootUnit({
            facilities: [airport('KAAA', 47, 8)],
            storage: {wpt0: 'QXX    BAD  +4700.00+00800.00', fpl0: 'A      KAAA '},
        });
        await vi.advanceTimersByTimeAsync(1000);

        expect(messages(unit)).toContain('USER DATA LOST');
        expect(storedSetting(unit, 'userDataFormat')).toBe(2);
        expect(storedSetting(unit, 'wpt0')).toBe('');
        expect(storedSetting(unit, 'fpl0')).toBe('');
    });
});
