import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/** Air data and a fuel computer, so the air data pages are OTH 9 and OTH 10, optionally a heading input */
function airdataXml(headingInput: boolean): string {
    return '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>'
        + `<HeadingInput>${headingInput}</HeadingInput>`
        + '<Airdata><IsInterfaced>true</IsInterfaced></Airdata>'
        + '<FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer>'
        + '</Input></Instrument></PlaneHTMLConfig>';
}

/** The number on a row after its label, and the unit or symbol after the number */
const parse = (row: string): { label: string; value: string; unit: string } | string => {
    const m = /^([A-Z]+)\s+(\.?\d+)(\D*)$/.exec(row);
    return m === null ? `no match: "${row}"` : {label: m[1], value: m[2], unit: m[3]};
};

describe('OTH 9 page (characterization)', () => {
    it('characterization: TAS and Mach without a heading input', async () => {
        const unit = await bootUnit({panelXml: airdataXml(false)});
        unit.env.sim.set('AIRSPEED TRUE', 'knots', 187);
        unit.env.sim.set('AIRSPEED MACH', 'mach', 0.29);
        await unit.panel.selectPage('L', 'OTH 9');
        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " AIR DATA  
          TAS   187kt
          MACH    .29
                     
                     
                     "
        `);
    });
});

describe('OTH 9 page, air data (5-43)', () => {
    // 5-43: TAS in knots and the Mach number, as the figure shows them (Mach without the leading zero)
    it('shows the true airspeed in knots and the Mach number (5-43)', async () => {
        const unit = await bootUnit({panelXml: airdataXml(false)});
        unit.env.sim.set('AIRSPEED TRUE', 'knots', 187);
        unit.env.sim.set('AIRSPEED MACH', 'mach', 0.29);
        await unit.panel.selectPage('L', 'OTH 9');
        await vi.advanceTimersByTimeAsync(1500);

        const rows = Screen.read().rows('L');
        expect([parse(rows[1]), parse(rows[2])]).toEqual([
            {label: 'TAS', value: '187', unit: 'kt'},
            {label: 'MACH', value: '.29', unit: ''},
        ]);
        // No wind rows without a heading input
        expect(rows.slice(3).map(r => r.trim())).toEqual(['', '', '']);
    });
});

/**
 * OTH 9 with a heading input: TAS 100 kt, the true heading 000 (magnetic 350 with 10 degrees east variation), and the
 * aircraft moving at the groundspeed and true track the wind gives. The wind triangle is a vector sum: the ground vector
 * is the air vector plus the wind vector (the wind blows toward its direction plus 180).
 * - Wind from 030 at 20 kt: wind vector N -17.3205, E -10.0; ground vector N 82.6795, E -10.0, so GS 83.282 kt and
 *   track 353.103; headwind component 20 cos 30 = 17.3 kt.
 * - Wind from 210 at 20 kt: wind vector N 17.3205, E 10.0; ground vector N 117.3205, E 10.0, so GS 117.746 kt and
 *   track 4.872; tailwind component 17.3 kt.
 */
async function windAt(groundspeedKt: number, trackTrue: number): Promise<HeadlessUnit> {
    const unit = await bootUnit({panelXml: airdataXml(true), magvar: 10});
    unit.env.sim.set('AIRSPEED TRUE', 'knots', 100);
    unit.env.sim.set('AIRSPEED MACH', 'mach', 0.15);
    unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 350);
    await settle(unit);
    await moveAircraft(unit, {lat: 47.02, lon: 8.0}, {groundspeedKt, trackTrue});
    await unit.panel.selectPage('L', 'OTH 9');
    await vi.advanceTimersByTimeAsync(1500);
    return unit;
}

describe('OTH 9 page, wind (5-43)', () => {
    // 5-43: with a heading input the page adds the headwind or tailwind component and the wind, its direction relative
    // to true north, and its speed
    it('shows the headwind component and the wind relative to true north (5-43)', async () => {
        await windAt(83.282, 353.103);

        const rows = Screen.read().rows('L');
        expect(parse(rows[3])).toEqual({label: 'HDWND', value: '17', unit: 'kt'});
        // The direction only: the symbol after it is the pin below
        expect((parse(rows[4]) as { value: string }).value).toBe('030');
        expect(rows[5].trim()).toBe('20kt');
    });

    // 5-43: the airspeed rows stay above the wind rows when the heading input is installed
    it('shows the true airspeed and the Mach number above the wind rows (5-43)', async () => {
        await windAt(83.282, 353.103);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['TAS   100kt', 'MACH    .15']);
    });

    it('shows the tailwind component and the wind relative to true north (5-43)', async () => {
        await windAt(117.746, 4.872);

        const rows = Screen.read().rows('L');
        expect(parse(rows[3])).toEqual({label: 'TLWND', value: '17', unit: 'kt'});
        expect((parse(rows[4]) as { value: string }).value).toBe('210');
        expect(rows[5].trim()).toBe('20kt');
    });

    // 5-43, the figures: the wind direction carries the true-north symbol after the degree sign, the same symbol as the
    // wind on TRI 0 (5-2, figures 5-1 to 5-5), which Tri0Page renders as ¥. The setup is the headwind test above
    it.fails('marks the wind direction as true with the true-north symbol (5-43, #249)', async () => {
        await windAt(83.282, 353.103);

        expect(Screen.read().rows('L')[4]).toBe('WIND  030°¥');
    });
});
