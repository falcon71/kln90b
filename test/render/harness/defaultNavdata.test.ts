import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, NEAREST_SEARCH_WAIT_MS} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {defaultNavdata} from '../../harness/fixtures';
import {distanceNm} from '../../harness/flight/geo';

// Contract source: this harness (test/harness/fixtures.ts, defaultNavdata); no manual page
describe('default navdata (harness)', () => {
    // One test facility of every type. A case leaves out the type of its own page, so that only the default navdata of
    // that type can keep the page free of NO ... WPTS: the walk of the knob to a page passes the pages of the other
    // types, and a message they post would stay on the status line, so no other type may be missing
    const worldWithout = (type: 'APT 1' | 'VOR  ' | 'NDB  ' | 'INT  '): Facility[] => [
        ...(type === 'APT 1' ? [] : [airport('KAAA', 47.0, 8.0)]),
        ...(type === 'VOR  ' ? [] : [vor('ABC', 47.1, 8.1)]),
        ...(type === 'NDB  ' ? [] : [ndb('NDA', 47.1, 8.2)]),
        ...(type === 'INT  ' ? [] : [intersection('ALPHA', 47.1, 8.3)]),
    ];

    it.each([['VOR  '], ['NDB  '], ['INT  '], ['APT 1']] as const)('a world without the type shows no NO ... WPTS on the %s page', async page => {
        const unit = await bootUnit({facilities: worldWithout(page)});
        await unit.panel.selectPage('R', page);
        expect(Screen.read().status().mode).toBe('enr-leg msg');
    });

    it('keeps NO SUP WPTS, which a real unit without user waypoints shows', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.selectPage('R', 'SUP  ');
        expect(Screen.read().status().mode).toBe('NO SUP WPTS');
    });

    it('defaultNavdata: false boots the bare world', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)], defaultNavdata: false});
        await unit.panel.selectPage('R', 'INT  ');
        expect(Screen.read().status().mode).toBe('NO INT WPTS');
    });

    // The pages open on the first entry of their list, which is in ident order. The default of the type sorts after
    // the test facility, so the page shows the test facility
    it.each([
        ['APT 1', [airport('KBBB', 47.0, 8.0), airport('KAAA', 47.1, 8.0)], ' KAAA      '],
        ['VOR  ', [vor('ABC', 47.1, 8.0)], ' ABC D     '],
        ['NDB  ', [ndb('NDA', 47.1, 8.0)], ' NDA       '],
        ['INT  ', [intersection('ALPHA', 47.1, 8.0)], ' ALPHA     '],
    ] as const)('opens the %s page on the first test facility, not the default one', async (page, facilities, firstRow) => {
        const unit = await bootUnit({facilities: [...facilities]});
        await unit.panel.selectPage('R', page);
        expect(Screen.read().rows('R')[0]).toBe(firstRow);
    });

    it('refuses a test facility with a default ident', async () => {
        await expect(bootUnit({facilities: [vor('ZZV', 47.0, 8.0)]})).rejects.toThrow(/ZZV is an ident of the default navdata/);
    });

    it.each([
        ['an intersection named like the default VOR', intersection('ZZV', 47.0, 8.0), 'ZZV'],
        ['an airport named like the default NDB', airport('ZZN', 47.0, 8.0), 'ZZN'],
        ['a VOR named like the default intersection', vor('ZZXIN', 47.0, 8.0), 'ZZXIN'],
        ['an NDB named like the default airport', ndb('ZZXA', 47.0, 8.0), 'ZZXA'],
    ] as const)('refuses %s, whatever the type', async (_name, facility, ident) => {
        await expect(bootUnit({facilities: [facility]})).rejects.toThrow(new RegExp(`${ident} is an ident of the default navdata`));
    });

    // The nearest search reaches 500 NM (NearestList.ts), and the test positions lie in central Europe
    describe('far from the tests', () => {
        const TEST_POSITIONS = [{lat: 47.0, lon: 8.0}, {lat: 46.0, lon: 7.0}, {lat: 47.5, lon: 8.9}, {lat: 48.2, lon: 9.2}];

        it.each(defaultNavdata().map(f => [f.icaoStruct.ident, f] as const))('%s lies more than 500 NM from every test position', (_ident, facility) => {
            const distances = TEST_POSITIONS.map(p => distanceNm(p, {lat: facility.lat, lon: facility.lon}));
            expect(Math.min(...distances)).toBeGreaterThan(500);
        });

        it.each([['airport', 'aptNearestList', 'KAAA'], ['VOR', 'vorNearestList', 'ABC'], ['NDB', 'ndbNearestList', 'NDA']] as const)('the nearest %s list of a test world holds only the test facility', async (_type, list, ident) => {
            const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0), vor('ABC', 47.0, 8.0), ndb('NDA', 47.0, 8.0)]});
            await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
            expect(unit.props.nearestLists[list].getNearestList().map(w => w.facility.icaoStruct.ident)).toEqual([ident]);
        });
    });
});
