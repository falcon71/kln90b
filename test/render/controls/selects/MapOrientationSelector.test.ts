import {describe, expect, it, vi} from 'vitest';
import {HeadlessUnit, moveAircraft} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {bootOnStandardRoute} from '../../../harness/worldBoot';
import {bootUnit, settle} from '../../../harness/boot';
import {legWorld, variationNear} from '../../../harness/fixtures';
import {NO_OBS, panelXml} from '../../../harness/panelXml';
import {savedFlightplan} from '../../../harness/storage';

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

describe('map orientation selector in OBS mode (characterization, #371)', () => {
    // By analogy with the NAV 1 track of the KLN 89 trainer (2026-10-25): the track-up value is magnetic with the
    // variation of the active waypoint in OBS mode. The world of the NAV 1 test: 64.8 NM west of KDDD on the leg to it,
    // track 090 true, the variation 10 E within 1 NM of KDDD and 0 elsewhere: 090 in LEG mode, 080 in OBS mode
    async function trackUp(obs: boolean): Promise<HeadlessUnit> {
        const {kaaa, kddd, west} = legWorld();
        const unit = await bootUnit({
            facilities: [kaaa, kddd], position: west(64.8), magvar: variationNear(kddd, 10), panelXml: panelXml(NO_OBS),
            storage: {...savedFlightplan(0, [kaaa, kddd]), nav5MapOrientation: 2},
        });
        await settle(unit);
        if (obs) {
            await unit.panel.obsMode();
        }
        await unit.panel.selectPage('L', 'NAV 5');
        await moveAircraft(unit, west(64.8), {groundspeedKt: 145, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    // The sibling of the OBS test below: the same world in LEG mode, where the aircraft's variation applies
    it('characterization: shows the track at the variation of the aircraft in LEG mode, 090 for 090 true', async () => {
        await trackUp(false);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('090°');
    });

    it('characterization: shows the track at the variation of the waypoint, 080 for 090 true', async () => {
        await trackUp(true);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('080°');
    });
});
