import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {distanceNm, pointFrom} from '../../../harness/flight/geo';
import {airport, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

// Two legs of half a degree of latitude each along the meridian 8 E, due north: 30.054 NM each, 60.107 NM in all,
// 24.04 min at the default TAS of 150 kt in no wind.
const meridianRoute = () => ({kaaa: airport('KAAA', 47.0, 8.0), abc: vor('ABC', 47.5, 8.0), kbbb: airport('KBBB', 48.0, 8.0)});

async function bootTri5(facilities: Facility[], storage: Record<string, unknown>, o: { coldGps?: boolean } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, storage, coldGps: o.coldGps});
    if (!o.coldGps) {
        await settle(unit);
    }
    await unit.panel.selectPage('L', 'TRI 5');
    return unit;
}

describe('TRI 5 page (characterization)', () => {
    it('shows the analysis of FPL 0 with fuel flow and reserve (characterization)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        Object.assign(unit.props.memory.triPage, {ff: 30, reserve: 25}); // volatile memory, read when the page is built
        await unit.panel.selectPage('L', 'TRI 5');
        expect(unit.errors).toEqual([]);
        // Row 2 (the ground speed and the ETE) is left out until the average of the leg speeds is decided (#NEW-6-1)
        expect(Screen.read().rows('L').filter((_, i) => i !== 2)).toMatchInlineSnapshot(`
          [
            "FP 0   91nm",
            "KAAA -KBBB ",
            "FF: 00030.0",
            "RES:00025.0",
            "F REQ  43.2",
          ]
        `);
    });
});

describe('TRI 5 page of one waypoint (characterization)', () => {
    // The plan has one waypoint: there is no last waypoint and no distance. The ground speed row is left out
    it('shows the first waypoint and dashes for the distance and the fuel of a plan of one waypoint (characterization)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const unit = await bootTri5([kaaa], savedFlightplan(0, [kaaa]));
        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect(rows[0]).toBe('FP 0 ----nm');
        expect(rows[1]).toBe('KAAA -     ');
        expect(rows[5]).toBe('F REQ ---.-');
    });
});

describe('TRI 5 page (5-6)', () => {
    // 5-6, step 3 and figure 5-18: the first and last waypoints of the plan, its total distance and ETE. TRI 5 needs no
    // GPS. 60.107 NM at 150 kt is 24.04 min
    it('shows FPL 0 from its first to its last waypoint, 60nm in :24, without a GPS fix (5-6)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const unit = await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]), {coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // The precondition: no fix
        expect(distanceNm(kaaa, abc) + distanceNm(abc, kbbb)).toBeCloseTo(60.107, 3); // The derivation of the literals
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '150kt   :24']);
    });

    // 5-6: any ground speed may be entered instead of the average of the plan; the ETE follows it.
    // 60.107 NM at 120 kt is 30.05 min
    it('recomputes the ETE from a ground speed entered with the knobs: 120 kt gives :30 (5-6)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const unit = await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]));
        await unit.panel.cursor('L');
        for (let i = 0; i < 10 && unit.panel.focused('L').row !== 2; i++) {
            await unit.panel.outer('L', 1);
        }
        await unit.panel.outer('L', 1); // the tens digit of the ground speed
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 1, text: '5'});
        await unit.panel.inner('L', -3); // 150 -> 120
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '120kt   :30']);
    });

    // 5-6, steps 2 and 3: the cursor comes on over the flight plan number, and the inner knob selects the plan.
    // FPL 3 is KCCC to KDDD, half a degree north: 30.054 NM, 12.02 min
    it('selects FPL 3 with the inner knob on the flight plan number (5-6)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const kccc = airport('KCCC', 47.0, 8.0);
        const kddd = airport('KDDD', 47.5, 8.0);
        const unit = await bootTri5([kaaa, abc, kbbb, kccc, kddd],
            {...savedFlightplan(0, [kaaa, abc, kbbb]), ...savedFlightplan(3, [kccc, kddd])});
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 2, text: ' 0'});
        await unit.panel.inner('L', 3);
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 2, text: ' 3'});
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['FP 3   30nm', 'KCCC -KDDD ', '150kt   :12']);
    });
});

describe('TRI 5 ground speed with a wind that differs per leg', () => {
    // KAAA, 10 NM north to KBBB, then 90 NM south to KCCC: 100 NM. TAS 150 and a wind from 360 at 50 kt give 100 kt
    // north and 200 kt south, without crosswind (so #167 plays no part)
    function windRoute() {
        const a = {lat: 47.0, lon: 8.0};
        const b = pointFrom(a, 0, 10);
        const c = pointFrom(b, 180, 90);
        return {kaaa: airport('KAAA', a.lat, a.lon), kbbb: airport('KBBB', b.lat, b.lon), kccc: airport('KCCC', c.lat, c.lon)};
    }

    async function bootWindRoute(): Promise<HeadlessUnit> {
        const {kaaa, kbbb, kccc} = windRoute();
        const unit = await bootUnit({facilities: [kaaa, kbbb, kccc], storage: savedFlightplan(0, [kaaa, kbbb, kccc])});
        await settle(unit);
        Object.assign(unit.props.memory.triPage, {tas: 150, windDirTrue: 0, windSpeed: 50});
        await unit.panel.selectPage('L', 'TRI 5');
        return unit;
    }

    // 5-6: the sibling of the pin below. The plan and its total distance
    it('shows FPL 0 from KAAA to KCCC, 100 NM (5-6)', async () => {
        await bootWindRoute();
        expect(Screen.read().rows('L').slice(0, 2)).toEqual(['FP 0  100nm', 'KAAA -KCCC ']);
    });

    // 5-6: the TAS and wind are applied to each leg of the plan, and the page gives the ETE of the plan. 10 NM at
    // 100 kt and 90 NM at 200 kt take 0.1 h + 0.45 h = 33 min (an average ground speed of 100 / 0.55 = 182 kt). The
    // page averages the two leg speeds without weighting them by distance, 150 kt, and shows 40 min
    it.fails('shows the ETE of the plan as the sum of the leg times, :33 (5-6, #NEW-6-1)', async () => {
        await bootWindRoute();
        expect(Screen.read().rows('L')[2].slice(6)).toBe('  :33');
    });
});
