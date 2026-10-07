import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

/** The focused field after each of `clicks` outer-knob steps, starting with the field the cursor comes on at */
async function cursorStops(unit: HeadlessUnit, clicks: number): Promise<string[]> {
    const stops: string[] = [];
    for (let i = 0; i < clicks; i++) {
        const f = unit.panel.focused('L');
        stops.push(`${f.row},${f.col} ${f.text}`);
        await unit.panel.outer('L', 1);
    }
    return stops;
}

describe('TRI 0 page (characterization)', () => {
    it('shows the TAS and wind estimates of a fresh unit (characterization)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'TRI 0');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " TRIP PLAN 
           ESTIMATES 
                     
          TAS:  150kt
          WIND: 000°¥
                000kt"
        `);
    });
});

describe('TRI 0 page (5-2)', () => {
    // 5-2, steps 3 to 7: the cursor goes over the TAS digits, then the first two digits of the wind direction as one
    // field, then its last digit, then the wind speed digits
    it('moves the cursor over the TAS digits, the wind direction in two parts and the wind speed digits (5-2)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'TRI 0');
        await unit.panel.cursor('L');

        expect(await cursorStops(unit, 9)).toEqual([
            '3,6 1', '3,7 5', '3,8 0', // TAS 150
            '4,6 00', '4,8 0', // wind direction 000
            '5,6 0', '5,7 0', '5,8 0', // wind speed 000
            '3,6 1', // and around again
        ]);
    });

    // 5-2, figures 5-2 to 5-5: TAS 200, wind 180 at 25 kt entered with the knobs. The text of 5-2 then gives about
    // 175 kt on TRI 3 for a route with a bearing of 180: 200 kt into a 25 kt headwind (magnetic variation 0 here, so
    // the bearing is the true course)
    it('takes a TAS of 200 and a wind of 180 at 25 kt from the knobs and applies them on TRI 3 (5-2)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const kbbb = airport('KBBB', 46.0, 8.0); // due south
        const unit = await bootUnit({facilities: [kaaa, kbbb]});
        await unit.panel.selectPage('L', 'TRI 0');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // TAS hundreds 1 -> 2
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -5); // TAS tens 5 -> 0
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 18); // wind direction 00 -> 18
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', 2); // wind speed tens 0 -> 2
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 5); // wind speed ones 0 -> 5
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(3)).toEqual(['TAS:  200kt', 'WIND: 180°¥', '      025kt']);

        // The waypoints of TRI 3 are not the subject: they are set in volatile memory, as the pilot would on TRI 3
        Object.assign(unit.props.memory.triPage, {tri3From: kaaa, tri3To: kbbb});
        await unit.panel.selectPage('L', 'TRI 3');
        expect(Screen.read().rows('L')[2].slice(0, 5)).toBe('175kt');
    });
});
