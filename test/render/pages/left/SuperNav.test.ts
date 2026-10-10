import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {SuperNav1Page} from '../../../../kln90b/pages/left/SuperNav1Page';
import {SuperNav5Page} from '../../../../kln90b/pages/left/SuperNav5Page';

describe('Super NAV pages', () => {
    // 3-32: NAV 1 on both sides makes Super NAV 1, 3-36: NAV 5 on both sides Super NAV 5
    it('show without an active waypoint and without an error (b7fd10a, 44fb0a4)', async () => {
        const unit = await bootUnit();
        // The left page is NAV 2 and the right page SUP. The page before NAV 1 is selected on the right (passing no page
        // that makes a Super NAV page), and the last click, one inner step back to NAV 1 on the right, is the one that
        // completes NAV 1 on both sides
        await unit.panel.selectPage('R', 'NAV 2');
        await unit.panel.selectPage('L', 'NAV 1');
        await unit.panel.inner('R', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.overlay()).toBeInstanceOf(SuperNav1Page);
        expect(unit.errors).toEqual([]);

        // NAV 5 is the page before NAV 1 on both sides
        await unit.panel.inner('L', -1);
        await unit.panel.inner('R', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.overlay()).toBeInstanceOf(SuperNav5Page);
        expect(unit.errors).toEqual([]);
    });
});
