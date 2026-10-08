import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {blinkCycle, mountedCycle} from '../../harness/render/blink';
import {mount} from '../../harness/render/mount';
import {Screen} from '../../harness/render/screen';
import {Blink} from '../../../kln90b/controls/Blink';
import {BearingDisplay} from '../../../kln90b/controls/displays/BearingDisplay';

describe('blinkCycle (harness)', () => {
    /** SET 1 with the left cursor on and one inner click: the first cell of the field in row 1 flashes while edited */
    async function editedField() {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1);
        return unit;
    }

    it('reads the screen once after each of four display ticks of a booted unit', async () => {
        await editedField();
        const started = Date.now();
        const times: number[] = [];

        const cycle = await blinkCycle(() => {
            times.push(Date.now() - started);
            return Screen.read().text();
        });

        expect(cycle).toHaveLength(4);
        expect(times).toEqual([250, 500, 750, 1000]);
    });

    it('sees the flashing cell in one read of four, whatever the phase the cycle starts in', async () => {
        await editedField();

        for (let phase = 0; phase < 4; phase++) {
            const cycle = await blinkCycle(() => Screen.read().maskRows('L')[1]);

            expect(cycle.filter(m => m === '.....FIIII.')).toHaveLength(1);
            expect(cycle.filter(m => m === '.....IIIII.')).toHaveLength(3);
            // One more display tick shifts the start of the next cycle by one phase
            await vi.advanceTimersByTimeAsync(250);
        }
    });
});

describe('mountedCycle (harness)', () => {
    it('ticks a mounted control four times, the fourth with blink, and reads after each', () => {
        const el = new BearingDisplay(null);
        const m = mount(el);
        const tick = vi.spyOn(el, 'tick');

        const reads = mountedCycle(m, () => m.text());

        expect(tick.mock.calls).toEqual([[false], [false], [false], [true]]);
        expect(reads).toEqual(['---°', '---°', '---°', '---°']);
    });

    it('sees a Blink text hidden on one tick in four', () => {
        const m = mount(new Blink('PUSH'));

        expect(mountedCycle(m, () => m.mask())).toEqual(['IIII', 'IIII', 'IIII', 'BBBB']);
    });
});
