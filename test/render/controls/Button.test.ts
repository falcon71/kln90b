import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {blinkCycle} from '../../harness/render/blink';
import {savedFlightplan} from '../../harness/storage';
import {intersection} from '../../harness/navdata/builders';

// Button (kln90b/controls/Button.tsx) is a one-field prompt: APPROVE?, ACKNOWLEDGE?, CONFIRM?, USE?, LOAD FPL 0?,
// DELETE FPL?, USER POS?. ENT runs its action; a hidden button is no cursor stop. The actions themselves are held by
// the page tests (FplPage.test.ts: USE?, USE? INVRT?, LOAD FPL 0?, DELETE FPL? and its CLR; Set1Page.test.ts: CONFIRM?)

/** The self-test page of a cold start, the cursor on APPROVE?; returns the row and the first cell of that button */
async function cursorOnApprove(): Promise<{row: number, col: number}> {
    const unit = await bootUnit({engineRunning: false});
    await unit.panel.powerOn();
    await vi.advanceTimersByTimeAsync(19_000); // the 17 s welcome page, then the self-test page
    await unit.panel.cursorTo('R', 'APPROVE?');
    const row = Screen.read().rows('R').findIndex(r => r.includes('APPROVE?'));
    return {row, col: Screen.read().rows('R')[row].indexOf('APPROVE?')};
}

describe('Button (3-11, 4-3)', () => {
    // 3-11 (figure 3-36) and the Introduction: the cursor over APPROVE? on the self-test page flashes: over one blink
    // cycle of the unit (four display ticks) the prompt is inverse and normal in turn. The guide gives no rate
    it('flashes under the cursor: APPROVE? of the self-test page (3-11, figure 3-36)', async () => {
        const {row, col} = await cursorOnApprove();

        const cycle = await blinkCycle(() => Screen.read().maskRows('R')[row].slice(col, col + 8));

        expect([...new Set(cycle)].sort()).toEqual(['FFFFFFFF', 'IIIIIIII']);
    });

    // 4-3, 4-4: on a numbered plan with waypoints the cursor goes from USE? one step to USE? INVRT? and from there to
    // the first waypoint; the prompts the page does not show (DELETE FPL?, LOAD FPL 0?) are no cursor stops
    it('is no cursor stop while hidden: USE?, USE? INVRT?, then the first waypoint of a numbered plan (4-3, 4-4)',
        async () => {
            const legs = [intersection('FX1AA', 47.0, 8), intersection('FX2AA', 47.1, 8)];
            const storage = savedFlightplan(4, legs);
            const unit = await bootUnit({facilities: legs, position: {lat: 46.5, lon: 8}, storage});
            await settle(unit);
            await unit.panel.selectPage('L', 'FPL 4');
            await unit.panel.cursor('L');

            const seen: string[] = [unit.panel.focused('L').text];
            for (let i = 0; i < 2; i++) {
                await unit.panel.outer('L', 1);
                seen.push(unit.panel.focused('L').text);
            }

            expect(seen).toEqual(['USE?', 'USE? INVRT?', 'FX1AA']);
        });
});

describe('Button (characterization)', () => {
    // The button under the cursor is inverse on three display ticks of four and normal on the fourth, the blink tick
    it('characterization: the button under the cursor is normal on one display tick in four, inverse on the others',
        async () => {
            const {row, col} = await cursorOnApprove();

            const cycle = await blinkCycle(() => Screen.read().maskRows('R')[row][col]);

            expect(cycle.sort()).toEqual(['F', 'I', 'I', 'I']);
        });
});
