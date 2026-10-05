import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('SET 3 page', () => {
    /** The surface field is the second field of the page: the outer knob moves the cursor from the length to it */
    async function pickSecondSurfaceOption(unit: HeadlessUnit): Promise<void> {
        await unit.panel.selectPage('L', 'SET 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(2000);
    }

    // 3-22 to 3-23: the surface options of the nearest airport criteria are HRD SFT and HRD
    it('stores hard surface only for the second surface option', async () => {
        const unit = await bootUnit();

        await pickSecondSurfaceOption(unit);

        expect(storedSetting(unit, 'nearestAptSurface')).toBe(false); // hard surface only
    });

    // Set3Page.tsx labels the second option "SFT", but it stores hard surface only: a pilot who picks "SFT" is told soft
    // surface and gets hard surface only
    it.fails('labels the hard surface only option HRD (#132)', async () => {
        const unit = await bootUnit();

        await pickSecondSurfaceOption(unit);

        const row = Screen.read().rows('L')[5];
        expect(row).toContain('HRD');
        expect(row).not.toContain('SFT');
    });
});
