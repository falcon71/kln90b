import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/** The six rows of the full page (SET 0 has no right half), without trailing blanks */
function rows(): string[] {
    return Screen.read().text().split('\n').slice(0, 6).map(r => r.trimEnd());
}

describe('SET 0 page, the database update (2b9f811)', () => {
    it('leaves the mode and the right page name out of the status line (2-5)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().row(6)).toBe('SET 0|        msg|     ');
    });

    // The steps follow the video https://youtu.be/7l57UDAuz8A, which could not be watched while writing this test, so
    // the rows are pinned as the code shows them today and carry no timestamps.
    it('walks through the update steps up to LOADER NOT READY (characterization)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');
        expect(rows()).toEqual([
            '      U P D A T E',
            '   D A T A   B A S E',
            '   O N   G R O U N D',
            '        O N L Y',
            '',
            '     KEY C70220BE',
        ]);

        await unit.panel.cursor('L');
        expect(rows()[3]).toBe('  UPDATE PUBLISHED DB');

        await unit.panel.ent();
        expect(rows()).toEqual([
            '      U P D A T E',
            '',
            '     INTERNATIONAL',
            '   DATA BASE EXPIRES',
            '       11 JUN 2026',
            '     U P D A T E ?',
        ]);

        await unit.panel.ent();
        // The page turns the cursor off while it redraws, one display tick later
        await vi.advanceTimersByTimeAsync(250);
        expect(unit.errors).toEqual([]);
        expect(rows()).toEqual([
            '      U P D A T E',
            '   D A T A   B A S E',
            '',
            '      L O A D E R',
            '   N O T   R E A D Y',
            '',
        ]);
        expect(Screen.read().status().left).toBe('SET 0');
    });
});
