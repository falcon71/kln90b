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
    it('shows the empty editors for a runway of unknown length (b14db79)', async () => {
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
