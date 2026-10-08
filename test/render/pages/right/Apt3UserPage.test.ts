import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints, storedSetting} from '../../../harness/storage';

async function showApt3(unit: HeadlessUnit, ident: string): Promise<string[]> {
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', ident);
    await unit.panel.cursor('R');
    await unit.panel.selectPage('R', 'APT 3');
    return Screen.read().rows('R');
}

describe('APT 3 page of a user airport', () => {
    // f745fb3, b14db79: the model holds -10 m for a runway of unknown length. 5-17: the page edits the user runway
    it('shows the empty editors for a runway of unknown length (5-17, b14db79)', async () => {
        const unit = await bootUnit({storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0}])});
        expect(await showApt3(unit, 'UAPT')).toEqual([
            ' UAPT      ',
            '           ',
            'RWY LEN    ',
            " _____' ___",
            '           ',
            '           ',
        ]);
    });

    // 5-17: a user airport has a single APT 3 page, also when the scan knob reaches it from the runway diagram of a
    // database airport (the page is not rebuilt, only told of the new airport)
    it('scans from the diagram of a database airport to a user airport (5-17)', async () => {
        const unit = await bootUnit({
            facilities: [airport('KAAA', 47.1, 8.0)],
            storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0}]),
            position: {lat: 47.0, lon: 8.0},
        });
        await unit.panel.selectPage('R', 'APT 3');
        expect(Screen.read().rows('R')[0]).toBe('           '); // the diagram of KAAA has no ident row
        expect(Screen.read().status().right).toBe('APT+3');
        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.scan();

        expect(Screen.read().rows('R')[0]).toBe(' UAPT      ');
        expect(Screen.read().status().right).toBe('APT 3');
        expect(unit.errors).toEqual([]);
    });
});

describe('APT 3 page of a stored user airport (characterization)', () => {
    // The same page with a known length, so that the test of the unknown length cannot be satisfied by a page that shows
    // nothing
    it('shows the length and surface of a runway of known length', async () => {
        const unit = await bootUnit({
            storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0, elevationFt: 1400, runwayLengthFt: 3200}]),
        });
        expect(await showApt3(unit, 'UAPT')).toEqual([
            ' UAPT      ',
            '           ',
            'RWY LEN    ',
            " 03200' HRD",
            '           ',
            '           ',
        ]);
    });
});

describe('APT 3 page of a new user airport', () => {
    /** FARM created at the present position (5-16), then APT 3 */
    async function farmOnApt3(): Promise<HeadlessUnit> {
        const unit = await bootUnit({position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'FARM');
        await unit.panel.cursorTo('R', 'PRES POS?');
        await unit.panel.ent();
        await unit.panel.selectPage('R', 'APT 3');
        return unit;
    }

    // 5-17 step 10, figure 5-61: a user airport has a single APT 3 page (no diagram, no APT+3) with dashes for the
    // runway length and surface below RWY LEN
    it('shows one APT 3 page with the dashed runway (5-17)', async () => {
        await farmOnApt3();

        expect(Screen.read().status().right).toBe('APT 3');
        expect(Screen.read().rows('R')).toEqual([
            ' FARM      ',
            '           ',
            'RWY LEN    ',
            " _____' ___",
            '           ',
            '           ',
        ]);
    });

    // 5-17 step 10, figure 5-62: the length is entered digit by digit and approved with ENT, which moves the cursor to
    // the surface; the inner knob selects HRD or SFT, ENT approves it
    it('stores an entered runway length and surface (5-17)', async () => {
        const unit = await farmOnApt3();
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', '_____');
        await unit.panel.type('R', '02300');
        await unit.panel.ent();
        expect(unit.panel.focused('R').text).toBe('___');
        // The length alone is saved already, with the surface still unset
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'wpt0')).toBe('AXX        FARM    +4700.00+01200.00-00001+02300-');
        for (let guard = 0; unit.panel.focused('R').text !== 'SFT'; guard++) {
            expect(guard).toBeLessThan(3);
            await unit.panel.inner('R', 1);
        }
        await unit.panel.ent();
        await unit.panel.cursor('R');

        expect(Screen.read().rows('R')[3]).toBe(" 02300' SFT");
        // The runway is saved with the user waypoint (a V2 string laid out by hand, docs/architecture.md Core 7): type A,
        // region XX, the ident padded to eight, latitude +4700.00, longitude +01200.00, the unknown elevation -1 m, the
        // length in feet and the surface letter S for a soft one. The unit saves a moment after the change.
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'wpt0')).toBe('AXX        FARM    +4700.00+01200.00-00001+02300S');
        // Kept: APT 3 shows it again after a visit to APT 2
        await unit.panel.inner('R', -1);
        await unit.panel.inner('R', 1);
        expect(Screen.read().rows('R')[3]).toBe(" 02300' SFT");
    });
});
