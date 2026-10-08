import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {courseDeg} from '../../harness/flight/geo';
import {SuperNav5} from '../../harness/render/superNav5';
import {savedFlightplan, storedSetting} from '../../harness/storage';
import {MainPage} from '../../../kln90b/pages/MainPage';
import {SuperNav5Page} from '../../../kln90b/pages/left/SuperNav5Page';

/**
 * NAV 5 on both sides. The right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows
 * NAV 5
 */
async function showSuperNav5(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('R', 'NAV 4');
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.inner('R', 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav5Page);
}

async function onRoute(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        facilities: [kaaa, abc, kbbb], storage: {...savedFlightplan(0, [kaaa, abc, kbbb]), ...storage},
    });
    await settle(unit);
    await showSuperNav5(unit);
    return unit;
}

describe('Super NAV 5 menu (3-37)', () => {
    // 3-37: the right inner knob selects on the VOR, NDB, APT and orientation lines of the menu. The choice is a user
    // setting the unit keeps: the stored values are the persisted setting keys (CLAUDE.md, public contract), VOR as the
    // index of OFF, H, LH, TLH, NDB and APT as booleans, the orientation as the index of N, DTK, TK, HDG
    it('stores each choice of the menu (3-37)', async () => {
        const unit = await onRoute({superNav5Apt: true}); // APT starts ON, so that a choice of OFF is stored too
        await unit.panel.cursor('R');

        await unit.panel.inner('R', 1); // VOR: OFF to H
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 1); // NDB: OFF to ON
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 1); // APT: ON to OFF
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 1); // north up to DTK up
        await vi.advanceTimersByTimeAsync(1000);

        expect(SuperNav5.read().right!.slice(0, 3)).toEqual(['ÜVOR:  H', 'ÝNDB: ON', 'ŸAPT:OFF']);
        expect([
            storedSetting(unit, 'superNav5Vor'), storedSetting(unit, 'superNav5Ndb'),
            storedSetting(unit, 'superNav5Apt'), storedSetting(unit, 'superNav5MapOrientation'),
        ]).toEqual([1, true, false, 1]);
    });

    // 3-34, 3-35, 3-37: an orientation shows its value; with desired track up that is the DTK, here the magnetic course
    // of the leg KAAA to ABC with no variation. Figure 3-119 shows the value before the orientation symbol
    it('shows the desired track before the DTK-up symbol (3-35, 3-37, figure 3-119)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await onRoute({superNav5MapOrientation: 1});
        await unit.panel.cursor('R');

        const dtk = Math.round(courseDeg(kaaa, abc));
        expect(dtk).toBe(50); // the literal below follows from the geometry, not from the unit
        expect(SuperNav5.read().right![3]).toBe(' 050°Ó^'); // figure 3-119: the symbol follows the degree sign directly
    });
});
