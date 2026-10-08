import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';

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

    // Control: the same page with a known length, so that the test above cannot be satisfied by a page that shows nothing
    it('shows the length and surface of a runway of known length (characterization)', async () => {
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
        for (let guard = 0; unit.panel.focused('R').text !== 'SFT'; guard++) {
            expect(guard).toBeLessThan(3);
            await unit.panel.inner('R', 1);
        }
        await unit.panel.ent();
        await unit.panel.cursor('R');

        expect(Screen.read().rows('R')[3]).toBe(" 02300' SFT");
        // Kept: APT 3 shows it again after a visit to APT 2
        await unit.panel.inner('R', -1);
        await unit.panel.inner('R', 1);
        expect(Screen.read().rows('R')[3]).toBe(" 02300' SFT");
    });
});
