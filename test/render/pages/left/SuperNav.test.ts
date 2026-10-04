import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {MainPage} from '../../../../kln90b/pages/MainPage';
import {SuperNav1Page} from '../../../../kln90b/pages/left/SuperNav1Page';
import {SuperNav5Page} from '../../../../kln90b/pages/left/SuperNav5Page';

describe('Super NAV pages', () => {
    // 3-31: NAV 1 on both sides makes Super NAV 1, NAV 5 on both sides Super NAV 5
    it('show without an active waypoint and without an error (b7fd10a, 44fb0a4)', async () => {
        const unit = await bootUnit();
        const overlay = () => (unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage();

        // The left page is NAV 2 and the right page SUP. NAV 1 is one step on the left, and five on the right
        unit.send('KLN90B_LeftSmallKnob_Left');
        await vi.advanceTimersByTimeAsync(250);
        for (let i = 0; i < 5; i++) {
            unit.send('KLN90B_RightLargeKnob_Left');
            await vi.advanceTimersByTimeAsync(250);
        }
        await vi.advanceTimersByTimeAsync(1000);

        expect(overlay()).toBeInstanceOf(SuperNav1Page);
        expect(unit.errors).toEqual([]);

        // NAV 5 is the page before NAV 1 on both sides
        unit.send('KLN90B_LeftSmallKnob_Left');
        await vi.advanceTimersByTimeAsync(250);
        unit.send('KLN90B_RightSmallKnob_Left');
        await vi.advanceTimersByTimeAsync(1000);

        expect(overlay()).toBeInstanceOf(SuperNav5Page);
        expect(unit.errors).toEqual([]);
    });
});
