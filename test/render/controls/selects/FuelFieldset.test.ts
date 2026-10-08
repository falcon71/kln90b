import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// TripFuelFieldset: a fuel amount of five digits and tenths around a fixed point (the fuel flow and reserve of TRI 1,
// TRI 3 and TRI 5, volatile memory triPage.ff and triPage.reserve). OthFuelFieldset: five digits, no tenths (the
// reserve of OTH 5, volatile memory othPage.reserve). Hosts here: TRI 3 (FF on row 3, RES on row 4) and OTH 5 (RES on
// row 4).

// KAAA to KBBB is one degree of latitude due south: 60.107 NM, 24.04 min at the default TAS of 150 kt in no wind
const kaaa = () => airport('KAAA', 47.0, 8.0);
const kbbb = () => airport('KBBB', 46.0, 8.0);

/** TRI 3 from KAAA to KBBB with the fuel flow and reserve in memory, the cursor on the first digit of FF */
async function onTri3Ff(ff: number, reserve: number): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [kaaa(), kbbb()]});
    await settle(unit);
    Object.assign(unit.props.memory.triPage, {ff, reserve}); // read when the page is built
    await unit.panel.selectPage('L', 'TRI 3');
    await unit.panel.cursor('L');
    await unit.panel.type('L', 'KAAA');
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.type('L', 'KBBB');
    await unit.panel.ent();
    await unit.panel.ent();
    for (let i = 0; i < 20 && !(unit.panel.focused('L').row === 3 && unit.panel.focused('L').col === 4); i++) {
        await unit.panel.outer('L', 1);
    }
    expect(unit.panel.focused('L')).toMatchObject({row: 3, col: 4});
    return unit;
}

describe('trip fuel fieldset', () => {
    // 5-4 steps 7 to 9 (figures 5-9, 5-10; 3-14 figure 3-39): the fuel flow is entered digit by digit; its five digits
    // and the tenths are cursor positions, the point is not; then comes the reserve
    it('visits the five digits and the tenths, not the point, then the reserve (5-4)', async () => {
        const unit = await onTri3Ff(30, 25);
        const seen = [unit.panel.focused('L')];
        for (let i = 0; i < 6; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L'));
        }
        expect(seen.map(f => `${f.row},${f.col} ${f.text}`)).toEqual([
            '3,4 0', '3,5 0', '3,6 0', '3,7 3', '3,8 0', '3,10 0', '4,4 0',
        ]);
    });

    // 5-4 (figure 5-9): the fuel flow 30.0 turned to 32.0 with its units digit; F REQ is the flow over 24.04 min plus
    // the reserve: 32 * 0.40072 + 25 = 12.82 + 25 = 37.8
    it('takes a fuel flow of 32.0 from the units digit: F REQ 37.8 (5-4)', async () => {
        const unit = await onTri3Ff(30, 25);
        await unit.panel.outer('L', 4);
        await unit.panel.inner('L', 2);

        expect(Screen.read().rows('L').slice(3)).toEqual(['FF: 00032.0', 'RES:00025.0', 'F REQ  37.8']);
        expect(unit.props.memory.triPage.ff).toBe(32);
    });

    // 5-4: the tenths: 30.0 to 30.5, the tenths first and then the tens to 40.5, so that a digit that overwrote another
    // would show; F REQ 40.5 * 0.40072 + 25 = 41.2
    it('takes the tenths and keeps them when the tens change: 40.5 (5-4)', async () => {
        const unit = await onTri3Ff(30, 25);
        await unit.panel.outer('L', 5);
        await unit.panel.inner('L', 5);
        await unit.panel.outer('L', -2);
        await unit.panel.inner('L', 1);

        expect(Screen.read().rows('L').slice(3)).toEqual(['FF: 00040.5', 'RES:00025.0', 'F REQ  41.2']);
        expect(unit.props.memory.triPage.ff).toBe(40.5);

        // and the units keep them too: 41.5, F REQ 41.5 * 0.40072 + 25 = 41.6
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L').slice(3)).toEqual(['FF: 00041.5', 'RES:00025.0', 'F REQ  41.6']);
        expect(unit.props.memory.triPage.ff).toBe(41.5);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The units
    // digit of 30.0 turned down one click is 9 (39.0), and up one click is 0 again
    it('wraps the units digit of the fuel flow (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onTri3Ff(30, 25);
        await unit.panel.outer('L', 4);
        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L')[3]).toBe('FF: 00039.0');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[3]).toBe('FF: 00030.0');
    });

    // 5-4: the highest digit keeps the others: 00030.0 to 10030.0
    it('keeps the lower digits when the ten-thousands digit changes (5-4)', async () => {
        const unit = await onTri3Ff(30, 25);
        await unit.panel.inner('L', 1);

        expect(Screen.read().rows('L')[3]).toBe('FF: 10030.0');
        expect(unit.props.memory.triPage.ff).toBe(10030);
    });
});

const FUEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><FuelComputer>'
    + '<IsInterfaced>true</IsInterfaced>'
    + '</FuelComputer></Input></Instrument></PlaneHTMLConfig>';

describe('OTH fuel fieldset', () => {
    // 5-40: the reserve on OTH 5 is five whole digits; the cursor starts on it when the fuel on board is transmitted
    // and visits the five digits
    it('visits the five digits of the OTH 5 reserve (5-40)', async () => {
        const unit = await bootUnit({panelXml: FUEL_XML});
        await unit.panel.selectPage('L', 'OTH 5');
        await unit.panel.cursor('L');
        const seen = [unit.panel.focused('L')];
        for (let i = 0; i < 4; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L'));
        }
        expect(seen.map(f => `${f.row},${f.col}`)).toEqual(['4,6', '4,7', '4,8', '4,9', '4,10']);
    });

    // 5-40: the highest digit keeps the lower ones: 00045 to 10045, units and tens first
    it('keeps the lower digits when the ten-thousands digit changes: 10045 (5-40)', async () => {
        const unit = await bootUnit({panelXml: FUEL_XML});
        await unit.panel.selectPage('L', 'OTH 5');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4);
        await unit.panel.inner('L', 5);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 4);
        await unit.panel.outer('L', -3);
        await unit.panel.inner('L', 1);

        expect(Screen.read().rows('L')[4]).toBe('RES:  10045');
        expect(unit.props.memory.othPage.reserve).toBe(10045);
    });
});
