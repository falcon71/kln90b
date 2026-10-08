import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// The self-test values and the date, time, baro and APPROVE? entries are Session 10's (docs/test-coverage.md). This
// is the snapshot of the page as the unit shows it after a cold boot: the clock's start date (not October, #112) and
// the cursor on the first two digits of the baro. The altitude row (row 3) is left out of the snapshot and of its
// mask: how it is formatted is open, and Session 10 decides
describe('self-test right page (characterization)', () => {
    const withoutAltitudeRow = (rows: string[]) => rows.filter((_, i) => i !== 3);

    it('shows the date, time, baro and APPROVE? without the altitude row (characterization)', async () => {
        const unit = await bootUnit({engineRunning: false, magvar: 0});
        await unit.panel.powerOn();
        // A fixed wait: the self-test page follows the 17 s welcome page and stays until it is approved
        await vi.advanceTimersByTimeAsync(19_000);

        const s = Screen.read();
        expect([...withoutAltitudeRow(s.rows('R')), '', ...withoutAltitudeRow(s.maskRows('R'))].join('\n')).toMatchInlineSnapshot(`
          "DATE/TIME  
            01 JUN 26
          12:00:19UTC
          BARO:29.92"
            APPROVE? 

          ...........
          ...........
          ...........
          .....II....
          ..........."
        `);
        expect(s.status().right).toBe('CRSR');
        expect(unit.errors).toEqual([]);
    });
});
