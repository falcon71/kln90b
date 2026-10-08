import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

/**
 * APT 3 of the user airport FARM created at the present position (5-16, 5-17): RWY LEN above, the length and the
 * surface on row 3 (` _____' ___`). The surface is stored with the user waypoint (wpt0): the last letter of the V2
 * string is H for a hard and S for a soft surface, - for none (docs/architecture.md Core 7).
 */
async function farmOnApt3(): Promise<HeadlessUnit> {
    const unit = await bootUnit({position: {lat: 47.0, lon: 12.0}});
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', 'FARM');
    await unit.panel.cursorTo('R', 'PRES POS?');
    await unit.panel.ent();
    await unit.panel.selectPage('R', 'APT 3');
    expect(Screen.read().rows('R')[3]).toBe(" _____' ___");
    await unit.panel.cursor('R');
    return unit;
}

const surface = () => Screen.read().rows('R')[3].slice(8);

describe('runway surface editor (5-17)', () => {
    // 5-17 step 10, figure 5-62: the inner knob selects HRD (hard) or SFT (soft), and nothing else
    it('offers HRD and SFT (5-17)', async () => {
        const unit = await farmOnApt3();
        await unit.panel.cursorTo('R', '___');

        const seen = new Set<string>();
        for (let i = 0; i < 3; i++) {
            await unit.panel.inner('R', 1);
            seen.add(surface());
        }

        expect(unit.errors).toEqual([]);
        expect([...seen].sort()).toEqual(['HRD', 'SFT']);
    });

    // 5-17 step 10: ENT approves the surface, which is stored with the user airport; HRD is the letter H
    it('stores a hard surface entered after the length (5-17)', async () => {
        const unit = await farmOnApt3();
        await unit.panel.cursorTo('R', '_____');
        await unit.panel.type('R', '02300');
        await unit.panel.ent(); // the cursor moves to the surface
        await unit.panel.inner('R', 1); // the first click gives HRD
        expect(surface()).toBe('HRD');
        await unit.panel.ent();
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[3]).toBe(" 02300' HRD");
        expect(storedSetting(unit, 'wpt0')).toBe('AXX        FARM    +4700.00+01200.00-00001+02300H');
    });

    // 5-17 step 10: the surface approved with ENT is what the airport's page shows from then on. The page is built
    // again from the stored airport when it is shown again, so the editor converts the stored surface back into its
    // choice.
    for (const [clicks, shown] of [[1, 'HRD'], [2, 'SFT']] as const) {
        it(`shows the stored ${shown} surface when the page is shown again (5-17)`, async () => {
            const unit = await farmOnApt3();
            await unit.panel.cursorTo('R', '_____');
            await unit.panel.type('R', '02300');
            await unit.panel.ent(); // the cursor moves to the surface
            await unit.panel.inner('R', clicks);
            await unit.panel.ent();
            await unit.panel.cursor('R');
            await vi.advanceTimersByTimeAsync(1000);

            await unit.panel.selectPage('R', 'APT 2');
            await unit.panel.selectPage('R', 'APT 3');

            expect(unit.errors).toEqual([]);
            expect(Screen.read().rows('R')[3]).toBe(` 02300' ${shown}`);
        });
    }
});

describe('runway surface editor (characterization)', () => {
    // The cursor turned off during a surface edit drops it: the dashes come back
    it('drops a surface edit when the cursor is turned off', async () => {
        const unit = await farmOnApt3();
        await unit.panel.cursorTo('R', '___');
        await unit.panel.inner('R', 2);
        expect(surface()).toBe('SFT');

        await unit.panel.cursor('R');

        expect(unit.errors).toEqual([]);
        expect(surface()).toBe('___');
    });

    // A surface can be entered before the length: the length stays dashed, the surface is stored (the last letter of
    // the string; the unknown length before it is the persistor's, not this editor's)
    it('stores a soft surface entered before the length', async () => {
        const unit = await farmOnApt3();
        await unit.panel.cursorTo('R', '___');
        await unit.panel.inner('R', 2); // HRD, SFT
        await unit.panel.ent();
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[3]).toBe(" _____' SFT");
        expect(String(storedSetting(unit, 'wpt0')).slice(-1)).toBe('S');
    });
});
