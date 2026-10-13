import {describe, expect, it, vi} from 'vitest';
import {HeadlessUnit, moveAircraft} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {bootOnStandardRoute} from '../../../harness/worldBoot';

// MapOrientationSelector: the NAV 5 orientation, a select whose text is the choice with the up arrow while the
// cursor is on it and the orientation's value otherwise. Host: NAV 5 on the left (row 5, columns 0 to 3), saved as
// the setting nav5MapOrientation. Super NAV 5 uses its own selector in the menu (SuperNav5Page.test.ts).
// Nav5Page.test.ts holds the choices, the values per orientation and the variation; this file holds the commit
// through the knob.

/**
 * The standard route KAAA, ABC, KBBB in FPL 0, the aircraft at KAAA, NAV 5 on the left,
 * the cursor on the orientation
 */
async function onOrientation(): Promise<HeadlessUnit> {
    const unit = await bootOnStandardRoute();
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.cursor('L');
    await unit.panel.cursorTo('L', 'N^');
    return unit;
}

describe('map orientation selector', () => {
    // 3-34, 3-35: the inner knob selects DTK up; once the cursor moves to the range scale the field shows the desired
    // track (the first leg KAAA to ABC, 049.6 by geo.ts, so 050) instead of the choice, and the choice is kept
    it('commits DTK up and shows the desired track once the cursor moves on (3-34, 3-35)', async () => {
        const unit = await onOrientation();
        await unit.panel.inner('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 5, col: 0, text: 'DTK^'});
        await unit.panel.outer('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('050°');
        expect(storedSetting(unit, 'nav5MapOrientation')).toBe(1);
    });

    // 3-35: turning the cursor off with the cursor button replaces the choice with the value as well
    it('shows the desired track after the cursor is turned off (3-35)', async () => {
        const unit = await onOrientation();
        await unit.panel.inner('L', 1);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('050°');
        expect(Screen.read().maskRows('L')[5].slice(0, 4)).toBe('....');
    });
});

describe('map orientation selector at north (characterization, #361)', () => {
    /** TK up on NAV 5, the aircraft at KAAA on the true track 090 with the given variation (east), away from the cursor */
    async function trackUp(magvar: number): Promise<HeadlessUnit> {
        const unit = await bootOnStandardRoute({storage: {nav5MapOrientation: 2}, magvar});
        await unit.panel.selectPage('L', 'NAV 5');
        await moveAircraft(unit, {lat: 47.0, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    // #361: a magnetic track of 359.6 is 000, the north rule of #263
    it('characterization: shows a magnetic track of 359.6 as 000° (#361)', async () => {
        await trackUp(90.4);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('000°');
    });

    it('characterization: shows a magnetic track of 359.4 as 359° (#361)', async () => {
        await trackUp(90.6);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('359°');
    });
});

describe('map orientation selector (characterization)', () => {
    // The guide lists the choices and says nothing about the ends of the list; the code wraps: from N up the inner knob
    // turned back gives TK up (no heading input), which is committed
    it('wraps from N up back to TK up (characterization)', async () => {
        const unit = await onOrientation();
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.panel.focused('L').text).toBe('TK^ ');
        expect(storedSetting(unit, 'nav5MapOrientation')).toBe(2);
    });
});
