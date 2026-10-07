import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

/** Boots with KAAA and KBBB (60 NM due south), enters them on TRI 3 with the keyboard and selects TRI 4 */
async function tri4(o: { coldGps?: boolean } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0), airport('KBBB', 46.0, 8.0)], coldGps: o.coldGps});
    if (!o.coldGps) {
        await settle(unit);
    }
    await unit.panel.selectPage('L', 'TRI 3');
    await unit.panel.cursor('L');
    await unit.panel.type('L', 'KAAA');
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.type('L', 'KBBB');
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.cursor('L');
    await unit.panel.selectPage('L', 'TRI 4');
    await vi.advanceTimersByTimeAsync(2000); // The airspace search is asynchronous
    return unit;
}

describe('TRI 4 page (characterization)', () => {
    it('shows the ESA between the two waypoints of TRI 3 (characterization)', async () => {
        const unit = await tri4();
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "KAAA -KBBB 
          ESA 11400ft
                     
                     
                     
                     "
        `);
    });
});

describe('TRI 4 page (5-5)', () => {
    // 5-5: TRI 3 and TRI 4 need no GPS; step 9 and figure 5-17: TRI 4 shows the route of TRI 3 and its ESA
    it('shows the route of TRI 3 and an ESA line without a GPS fix (5-5)', async () => {
        const unit = await tri4({coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // The precondition: no fix
        const rows = Screen.read().rows('L');
        expect(rows[0]).toBe('KAAA -KBBB ');
        expect(rows[1]).toMatch(/^ESA [ 0-9]{4}[0-9]ft$/);
    });
});
