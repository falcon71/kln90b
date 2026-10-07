import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, BootOptions, HeadlessUnit, settle} from '../../../harness/boot';
import {distanceNm, pointFrom} from '../../../harness/flight/geo';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// KAAA to KBBB is one degree of latitude due south: true course 180, 60.107 NM on the sphere of geo.ts, 24.04 min at
// the default TAS of 150 kt in no wind.
const kaaa = () => airport('KAAA', 47.0, 8.0);
const kbbb = () => airport('KBBB', 46.0, 8.0);

async function bootTri3(facilities: Facility[], o: BootOptions = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, ...o});
    if (!o.coldGps) {
        await settle(unit);
    }
    await unit.panel.selectPage('L', 'TRI 3');
    return unit;
}

/** 5-5, steps 2 to 8: cursor on, the "from" ident, ENT, ENT, the "to" ident, ENT, ENT, cursor off */
async function enterRoute(unit: HeadlessUnit, from: string, to: string): Promise<void> {
    await unit.panel.cursor('L');
    await unit.panel.type('L', from);
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.type('L', to);
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.cursor('L');
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

describe('TRI 3 page (characterization)', () => {
    it('shows the trip between two waypoints with fuel flow and reserve (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa(), kbbb()]});
        await settle(unit);
        Object.assign(unit.props.memory.triPage, {ff: 30, reserve: 25}); // volatile memory, read when the page is built
        await unit.panel.selectPage('L', 'TRI 3');
        await enterRoute(unit, 'KAAA', 'KBBB');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "KAAA -KBBB 
            60nm 180°
          150kt   :24
          FF: 00030.0
          RES:00025.0
          F REQ  37.0"
        `);
    });

    // The page takes the variation of the magnetic bearing at the "from" waypoint: 10 E at KAAA, 0 at KBBB and 10 W
    // at the aircraft, so 170, 180 and 190 tell them apart
    it('takes the magnetic variation of the bearing at the "from" waypoint (characterization)', async () => {
        const magvar = (lat: number) => (lat > 46.5 ? 10 : lat < 45.5 ? -10 : 0);
        const unit = await bootTri3([kaaa(), kbbb()], {position: {lat: 45.0, lon: 8.0}, magvar});
        expect(unit.props.magvar.getCurrentMagvar()).toBe(-10); // The precondition: the aircraft's own variation
        await enterRoute(unit, 'KAAA', 'KBBB');
        expect(Screen.read().rows('L')[1]).toBe('  60nm 170°');
    });
});

describe('TRI 3 page (5-5)', () => {
    // 5-5, steps 2 to 5: the cursor comes on over the "from" ident; after the "from" waypoint page is approved it is
    // over the "to" ident
    it('puts the cursor over "from" first and over "to" once "from" is approved (5-5)', async () => {
        const unit = await bootTri3([kaaa(), kbbb()]);
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: '     '});
        await unit.panel.type('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 6, text: '     '});
        expect(Screen.read().rows('L')[0]).toBe('KAAA -     ');
    });

    // 5-5: TRI 3 needs no GPS. The distance, bearing, ground speed and ETE of figure 5-16 without a fix: 60.107 NM,
    // true 180 (variation 0), the TAS of 150 kt, 24.04 min
    it('shows distance, bearing, ground speed and ETE without a GPS fix (5-5)', async () => {
        const unit = await bootTri3([kaaa(), kbbb()], {coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // The precondition: no fix
        await enterRoute(unit, 'KAAA', 'KBBB');
        expect(distanceNm({lat: 47.0, lon: 8.0}, {lat: 46.0, lon: 8.0})).toBeCloseTo(60.107, 3);
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['KAAA -KBBB ', '  60nm 180°', '150kt   :24']);
    });

    // 5-5: any ground speed may be entered instead of the TAS and wind result; the ETE follows it.
    // 60.107 NM at 120 kt is 30.05 min
    it('recomputes the ETE from a ground speed entered with the knobs: 120 kt gives :30 (5-5)', async () => {
        const unit = await bootTri3([kaaa(), kbbb()]);
        await enterRoute(unit, 'KAAA', 'KBBB');
        await unit.panel.cursor('L');
        await cursorToCell(unit, 2, 1);
        expect(unit.panel.focused('L').text).toBe('5');
        await unit.panel.inner('L', -3); // 150 -> 120
        expect(Screen.read().rows('L')[2]).toBe('120kt   :30');
    });
});

describe('TRI 3 ETE just under an hour', () => {
    // 148.9 NM at 150 kt is 0.99267 h, 59.56 min
    const far = () => {
        const p = pointFrom({lat: 47.0, lon: 8.0}, 180, 148.9);
        return airport('KBBB', p.lat, p.lon);
    };

    // 5-5: the sibling of the pin below. The route and the ground speed it relies on: 148.9 NM at the TAS of 150 kt
    it('shows 149nm and 150kt for a trip of 148.9 NM (5-5)', async () => {
        const unit = await bootTri3([kaaa(), far()]);
        await enterRoute(unit, 'KAAA', 'KBBB');
        const rows = Screen.read().rows('L');
        expect(rows[1]).toBe(' 149nm 180°');
        expect(rows[2].slice(0, 5)).toBe('150kt');
    });

    // 5-5, figures 5-12 to 5-16: the ETE is hours and minutes, h:mm. 59.56 minutes is 1:00 rounded or :59 truncated,
    // never 60 minutes (the same kind as #99 and #184). The page numbers show the h:mm form only; that the real unit
    // never shows :60 was checked in the KLN 89 trainer, 2026-10-07
    it.fails('shows 59.56 minutes as 1:00 or :59, not :60 (5-5, #NEW-1-1)', async () => {
        const unit = await bootTri3([kaaa(), far()]);
        await enterRoute(unit, 'KAAA', 'KBBB');
        expect([' 1:00', '  :59']).toContain(Screen.read().rows('L')[2].slice(6));
    });
});
