import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/** A user intersection in the V2 format: type, region XX, 8 blanks, the ident padded to 8, latitude, longitude */
function userIntersection(ident: string): string {
    return `WXX        ${ident.padEnd(8, ' ')}+4730.00-00815.50`;
}

function userWaypoints(idents: string[]): Record<string, unknown> {
    const storage: Record<string, unknown> = {userDataFormat: 2};
    idents.forEach((ident, i) => storage[`wpt${i}`] = userIntersection(ident));
    return storage;
}

describe('OTH 3 page', () => {
    // The list shows five rows below the title, and the focused one must stay among them
    it('scrolls the list to keep the focused row visible (characterization) (9a17b5b)', async () => {
        const unit = await bootUnit({storage: userWaypoints(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'])});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');

        await unit.panel.outer('L', 5);

        const screen = Screen.read();
        expect(screen.half('L').split('\n').slice(1)).toEqual([
            'BBB   I    ',
            'CCC   I    ',
            'DDD   I    ',
            'EEE   I    ',
            'FFF   I    ',
        ]);
        const mask = screen.mask().split('\n');
        // Only the last visible row, FFF, is focused
        expect(mask[5].slice(0, 11)).toBe('IIIIIIIIIII');
        for (let row = 1; row <= 4; row++) {
            expect(mask[row].slice(0, 11)).not.toContain('I');
        }
    });

    // 5-20: CLR asks for the deletion of the focused waypoint, ENT confirms. 4-5: the cursor stays on the row
    it('keeps the cursor on the row of a deleted waypoint, which now shows the next one (#26)', async () => {
        const unit = await bootUnit({storage: userWaypoints(['AAA', 'BBB', 'CCC', 'DDD'])});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);

        await unit.panel.clr();

        expect(Screen.read().half('L').split('\n')[2]).toBe('DEL BBB   ?');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(screen.half('L').split('\n').slice(1, 4)).toEqual([
            'AAA   I    ',
            'CCC   I    ',
            'DDD   I    ',
        ]);
        const mask = screen.mask().split('\n');
        expect(mask[2].slice(0, 11)).toBe('IIIIIIIIIII');
        expect(mask[1].slice(0, 11)).not.toContain('I');
        expect(mask[3].slice(0, 11)).not.toContain('I');
    });
});
