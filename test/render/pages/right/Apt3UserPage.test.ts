import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/** Types an ident into the right ident selector, which only takes keyboard events (FrontPanel.enterIdent cannot) */
async function typeIdent(unit: HeadlessUnit, ident: string): Promise<void> {
    for (const ch of ident) {
        unit.send(`KLN90B_Internal_Key:RIGHT:${ch}`);
        await vi.advanceTimersByTimeAsync(250);
    }
}

async function showApt3(unit: HeadlessUnit, ident: string): Promise<string[]> {
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    await typeIdent(unit, ident);
    await unit.panel.cursor('R');
    await unit.panel.selectPage('R', 'APT 3');
    return Screen.read().half('R').split('\n');
}

describe('APT 3 page of a user airport', () => {
    // f745fb3, b14db79: the model holds -10 m for a runway of unknown length. 5-17: the page edits the user runway
    it('shows the empty editors for a runway of unknown length (b14db79)', async () => {
        const unit = await bootUnit({storage: {userDataFormat: 2, wpt0: 'AXX        UAPT    +4700.00+00800.00-00001-00033-'}});
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
        const unit = await bootUnit({storage: {userDataFormat: 2, wpt0: 'AXX        UAPT    +4700.00+00800.00+01400+03200H'}});
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
