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

describe('SET 3 page (characterization)', () => {
    // Row 4 is left out: its label is the #NEW-4-4 pin below
    it('shows the default criteria with the cursor off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 3');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').filter((_, i) => i !== 4)).toMatchInlineSnapshot(`
          [
            "NEAREST APT",
            " CRITERIA  ",
            "MIN LENGTH:",
            "      1000'",
            "    HRD SFT",
          ]
        `);
        expect(Screen.read().maskRows('L')).toMatchInlineSnapshot(`
          [
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
          ]
        `);
    });
});

describe('SET 3 minimum runway length (3-22)', () => {
    // 3-22, step 2: the cursor comes on over the minimum runway length
    it('turns the cursor on over the minimum length (3-22)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 3');
        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 3, col: 6, text: '1000'});
    });

    // 3-22, step 3: 1000 ft to 5000 ft in steps of 100 ft, so 40 clicks from 1000 ft reach 5000 ft. The length is the
    // persisted setting nearestAptMinRunwayLength (CLAUDE.md "Public contract with aircraft": setting keys).
    it('reaches 5000 ft in steps of 100 ft (3-22)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 3');
        await unit.panel.cursor('L');

        await unit.panel.inner('L', 40);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[3]).toBe("      5000'");
        expect(storedSetting(unit, 'nearestAptMinRunwayLength')).toBe(5000);
    });

    // Figures 3-73 to 3-75 label the surface row SURFACE: with a colon, like MIN LENGTH: above it; Set3Page.tsx renders
    // SURFACE without one. The sibling is the characterization above, which holds the other rows of the page.
    it.fails('labels the surface row SURFACE: (3-22, #NEW-4-4)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 3');

        expect(Screen.read().rows('L')[4]).toBe('SURFACE:   ');
    });
});
