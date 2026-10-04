import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

/** A key as the sim's keyboard sends it (KLN90BCore), followed by one display tick. Raw on purpose: the key event is the subject. */
async function type(unit: HeadlessUnit, key: string): Promise<void> {
    unit.send('KLN90B_Internal_Key:RIGHT:' + key);
    await vi.advanceTimersByTimeAsync(250);
}

/** The USER POS? page: an empty latitude editor on row 4 and an empty longitude editor on row 5, in the right half */
async function openUserPos(unit: HeadlessUnit): Promise<void> {
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', 'USER POS?');
    await unit.panel.ent();
}

describe('keyboard input for editors (characterization, sim-only feature, #25)', () => {
    it('types a latitude into the editor of the USER POS? page', async () => {
        const unit = await bootUnit();
        await openUserPos(unit);
        expect(Screen.read().rows('R')[4]).toBe("_ __°__.__'");
        expect(Screen.read().maskRows('R')[4]).toBe('IIIIIIIIII.');

        for (const key of ['N', '4', '7', '3', '0', '0', '0']) {
            await type(unit, key);
        }

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[4]).toBe("N 47°30.00'");
    });

    // Half-fixed #25: the hundreds digit of the longitude has the charset [" ", "1"], and a key is matched against the
    // whole entry, so "0" is rejected. A longitude below 100 degrees cannot be typed, and the cursor does not advance.
    it.fails('types a longitude below 100 degrees, with a 0 for the hundreds digit (#109)', async () => {
        const unit = await bootUnit();
        await openUserPos(unit);
        for (const key of ['N', '4', '7', '3', '0', '0', '0']) {
            await type(unit, key);
        }
        expect(Screen.read().rows('R')[4]).toBe("N 47°30.00'");
        await unit.panel.ent(); // accepts the latitude and moves on to the longitude
        expect(Screen.read().maskRows('R')[5]).toBe('IIIIIIIIII.');

        for (const key of ['E', '0', '0', '8', '3', '0', '0', '0']) {
            await type(unit, key);
        }

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[5]).toBe("E 08°30.00'");
    });
});
