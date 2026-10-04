import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';

/** User intersections at 47°30.00'N 8°15.50'W; where they are does not matter to the list */
function userWaypoints(idents: string[]): Record<string, unknown> {
    return savedUserWaypoints(idents.map(ident => ({kind: 'int', ident, lat: 47.5, lon: -(8 + 15.5 / 60)})));
}

describe('OTH 3 page', () => {
    // The list shows five rows below the title, and the focused one must stay among them
    it('scrolls the list to keep the focused row visible (characterization) (9a17b5b)', async () => {
        const unit = await bootUnit({storage: userWaypoints(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'])});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');

        await unit.panel.outer('L', 5);

        const screen = Screen.read();
        expect(screen.rows('L').slice(1)).toEqual([
            'BBB   I    ',
            'CCC   I    ',
            'DDD   I    ',
            'EEE   I    ',
            'FFF   I    ',
        ]);
        const mask = screen.maskRows('L');
        // Only the last visible row, FFF, is focused
        expect(mask[5]).toBe('IIIIIIIIIII');
        for (let row = 1; row <= 4; row++) {
            expect(mask[row]).not.toContain('I');
        }
    });

    // 5-20: CLR asks for the deletion of the focused waypoint, ENT confirms. 4-5: the cursor stays on the row
    it('keeps the cursor on the row of a deleted waypoint, which now shows the next one (#26)', async () => {
        const unit = await bootUnit({storage: userWaypoints(['AAA', 'BBB', 'CCC', 'DDD'])});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);

        await unit.panel.clr();

        expect(Screen.read().rows('L')[2]).toBe('DEL BBB   ?');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(screen.rows('L').slice(1, 4)).toEqual([
            'AAA   I    ',
            'CCC   I    ',
            'DDD   I    ',
        ]);
        const mask = screen.maskRows('L');
        expect(mask[2]).toBe('IIIIIIIIIII');
        expect(mask[1]).not.toContain('I');
        expect(mask[3]).not.toContain('I');
    });
});
