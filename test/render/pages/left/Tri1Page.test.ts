import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {distanceNm} from '../../../harness/flight/geo';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The aircraft is at KAAA; KBBB lies one degree of latitude due south: true course 180, 60.107 NM on the sphere of
// geo.ts. At the default TAS of 150 kt in no wind that is 0.40072 h, 24.04 min.
const POS = {lat: 47.0, lon: 8.0};
const world = () => ({kaaa: airport('KAAA', POS.lat, POS.lon), kbbb: airport('KBBB', 46.0, 8.0)});

async function bootTri1(o: {
    magvar?: number, coldGps?: boolean, ff?: number, reserve?: number, tas?: number, windDirTrue?: number, windSpeed?: number
} = {}): Promise<HeadlessUnit> {
    const {kaaa, kbbb} = world();
    const unit = await bootUnit({facilities: [kaaa, kbbb], position: POS, magvar: o.magvar ?? 0, coldGps: o.coldGps});
    if (!o.coldGps) {
        await settle(unit);
    }
    // Fuel flow and reserve are volatile memory, read when the page is built
    Object.assign(unit.props.memory.triPage, {ff: o.ff ?? 0, reserve: o.reserve ?? 0});
    for (const key of ['tas', 'windDirTrue', 'windSpeed'] as const) {
        if (o[key] !== undefined) {
            unit.props.memory.triPage[key] = o[key]!;
        }
    }
    await unit.panel.selectPage('L', 'TRI 1');
    return unit;
}

/** 5-3, steps 3 to 6: cursor on, the ident, ENT to view the waypoint page, ENT to approve it. The cursor stays on. */
async function enterTo(unit: HeadlessUnit, ident: string): Promise<void> {
    await unit.panel.cursor('L');
    await unit.panel.type('L', ident);
    await unit.panel.ent();
    await unit.panel.ent();
}

/** Turns the outer knob until the cursor is on the cell at row, col */
async function cursorToCell(unit: HeadlessUnit, row: number, col: number): Promise<void> {
    for (let i = 0; i < 20; i++) {
        const f = unit.panel.focused('L');
        if (f.row === row && f.col === col) return;
        await unit.panel.outer('L', 1);
    }
    throw new Error(`no field at ${row},${col}\n${Screen.read().dump()}`);
}

/** Sets the digit under the cursor by turning the inner knob from its present value */
async function setDigit(unit: HeadlessUnit, digit: number): Promise<void> {
    await unit.panel.inner('L', digit - Number(unit.panel.focused('L').text));
}

describe('TRI 1 page (characterization)', () => {
    it('shows the trip from the present position to a waypoint with fuel flow and reserve (characterization)', async () => {
        const unit = await bootTri1({ff: 30, reserve: 25});
        await enterTo(unit, 'KBBB');
        await unit.panel.cursor('L');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "P.POS-KBBB 
            60nm 180°
          150kt   :24
          FF: 00030.0
          RES:00025.0
          F REQ  37.0"
        `);
    });

    // TRI 1 measures from the present position, so without a fix the page shows dashes
    it('shows no distance, bearing or time without a GPS fix (characterization)', async () => {
        const unit = await bootTri1({coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // The precondition: no fix yet
        await enterTo(unit, 'KBBB');
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['P.POS-KBBB ', '----nm ---°', '000kt --:--']);
    });
});

describe('TRI 1 page (5-3, 5-4)', () => {
    // 5-3, figure 5-8: after the waypoint is approved the page shows distance, bearing, ground speed and ETE. 5-2: the
    // bearing is magnetic. 60.107 NM rounds to 60; true 180 with 10 degrees east variation is 170 magnetic; no wind, so
    // the ground speed is the TAS of 150 kt and the ETE 24.04 min
    it('shows 60nm, the magnetic bearing 170 and 150kt for 24 minutes to a waypoint 60 NM due south (5-3)', async () => {
        const unit = await bootTri1({magvar: 10});
        await enterTo(unit, 'KBBB');
        expect(distanceNm(POS, {lat: 46.0, lon: 8.0})).toBeCloseTo(60.107, 3); // The derivation of the literals
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['P.POS-KBBB ', '  60nm 170°', '150kt   :24']);
    });

    // 5-2 and 5-3: the ground speed comes from the TAS and wind of TRI 0. TAS 200 with a wind from 180 at 25 kt on the
    // course 180 (a headwind, no crosswind) is 175 kt; 60.107 NM at 175 kt is 20.6 min
    it('shows the ground speed of the TRI 0 TAS and wind: 175kt and :21 (5-3)', async () => {
        const unit = await bootTri1({tas: 200, windDirTrue: 180, windSpeed: 25});
        await enterTo(unit, 'KBBB');
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['P.POS-KBBB ', '  60nm 180°', '175kt   :21']);
    });

    // 5-3: any ground speed may be entered instead of the TAS and wind result; the ETE follows it.
    // 60.107 NM at 120 kt is 30.05 min
    it('recomputes the ETE from a ground speed entered with the knobs: 120 kt gives :30 (5-3)', async () => {
        const unit = await bootTri1();
        await enterTo(unit, 'KBBB');
        await cursorToCell(unit, 2, 1);
        await setDigit(unit, 2); // 150 -> 120
        expect(Screen.read().rows('L')[2]).toBe('120kt   :30');
    });

    // 5-4, steps 7 to 9: fuel flow and reserve entered with the knobs give the fuel required, ETE times FF plus
    // reserve: 0.40072 h * 30 + 25 = 37.02
    it('shows F REQ 37.0 for 24 minutes at a fuel flow of 30 with a reserve of 25 (5-4)', async () => {
        const unit = await bootTri1();
        await enterTo(unit, 'KBBB');
        await cursorToCell(unit, 3, 7);
        await setDigit(unit, 3); // FF 00030.0
        await cursorToCell(unit, 4, 7);
        await setDigit(unit, 2);
        await unit.panel.outer('L', 1);
        await setDigit(unit, 5); // RES 00025.0
        expect(Screen.read().rows('L').slice(3)).toEqual(['FF: 00030.0', 'RES:00025.0', 'F REQ  37.0']);
    });

    // 5-5 and 5-6, figures 5-16 and 5-18: a fuel requirement of 100 or more is shown without the decimal.
    // 0.40072 h * 300 = 120.2
    it('shows F REQ 120 without a decimal for a fuel flow of 300 (5-5, 5-6)', async () => {
        const unit = await bootTri1();
        await enterTo(unit, 'KBBB');
        await cursorToCell(unit, 3, 6);
        await setDigit(unit, 3); // FF 00300.0
        expect(Screen.read().rows('L').slice(3)).toEqual(['FF: 00300.0', 'RES:00000.0', 'F REQ   120']);
    });

    // 5-4, step 9: fuel flow and reserve entered on TRI 1 are also those of TRI 3 and TRI 5
    it('shows the fuel flow and reserve entered on TRI 1 on TRI 3 and TRI 5 (5-4)', async () => {
        const unit = await bootTri1();
        await unit.panel.cursor('L');
        await cursorToCell(unit, 3, 7);
        await setDigit(unit, 3); // FF 00030.0
        await cursorToCell(unit, 4, 8);
        await setDigit(unit, 5); // RES 00005.0
        await unit.panel.cursor('L');

        await unit.panel.selectPage('L', 'TRI 3');
        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FF: 00030.0', 'RES:00005.0']);
        await unit.panel.selectPage('L', 'TRI 5');
        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FF: 00030.0', 'RES:00005.0']);
    });
});
