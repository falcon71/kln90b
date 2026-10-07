import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// The tests pass STA 3 on the way back to STA 4, and STA 3 shows the version, which the build injects into Version.ts
// (testing.md section 4)
vi.mock('../../../../kln90b/Version', () => ({VERSION: '2.2.0'}));

const HOUR = 3600;

describe('STA 4 page (characterization)', () => {
    it('characterization: the stored operating time and power cycles', async () => {
        const unit = await bootUnit({storage: {totalTime: 1234 * HOUR + 1800, powercycles: 567}});
        await unit.panel.selectPage('L', 'STA 4');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "TOTAL TIME 
              1234 HR
          PWR CYCLES 
               568   
                     
                     "
        `);
    });
});

describe('STA 4 page, operating time and power cycles (5-31)', () => {
    /** The two numbers of STA 4: the total time in hours and the power cycles */
    const numbers = (): number[] => {
        const rows = Screen.read().rows('L');
        return [Number(/^\s*(\d+) HR$/.exec(rows[1])?.[1]), Number(rows[3].trim())];
    };

    // 5-31: the total operating time is shown in whole hours, and it counts while the unit is on: 1234 h 59 min 50 s
    // stored, a minute of operation later the page shows 1235 hours
    it('counts the total operating time in hours while the unit is on (5-31)', async () => {
        const unit = await bootUnit({storage: {totalTime: 1234 * HOUR + 3590, powercycles: 567}});
        await unit.panel.selectPage('L', 'STA 4');
        expect(numbers()[0]).toBe(1234);

        await vi.advanceTimersByTimeAsync(65_000);
        await unit.panel.selectPage('L', 'STA 3');
        await unit.panel.selectPage('L', 'STA 4');

        expect(numbers()[0]).toBe(1235);
    });

    // 5-31: PWR CYCLES counts the times the unit has been turned on, so a power cycle adds one
    it('adds one power cycle when the unit is turned off and on (5-31)', async () => {
        const unit = await bootUnit({storage: {totalTime: 1234 * HOUR, powercycles: 567}});
        await unit.panel.selectPage('L', 'STA 4');
        const before = numbers()[1];

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 4');

        expect([before, numbers()[1]]).toEqual([568, 569]);
    });
});
