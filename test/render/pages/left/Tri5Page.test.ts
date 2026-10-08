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

async function bootTri5(facilities: Facility[], storage: Record<string, unknown>, o: { coldGps?: boolean, tas?: number } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, storage, coldGps: o.coldGps});
    if (!o.coldGps) {
        await settle(unit);
    }
    if (o.tas !== undefined) {
        unit.props.memory.triPage.tas = o.tas; // volatile memory, read when the page is built
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
        // Row 2 (the ground speed and the ETE) is left out until the average of the leg speeds is decided (#254)
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
    // GPS. 60.107 NM at 150 kt is 24.04 min. The ETE cells are read by the #NEW-7-3 tests below. This test is their
    // sibling: it holds the plan, distance and ground speed they rely on
    it('shows FPL 0 from its first to its last waypoint, 60nm at 150kt, without a GPS fix (5-6)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const unit = await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]), {coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // The precondition: no fix
        expect(distanceNm(kaaa, abc) + distanceNm(abc, kbbb)).toBeCloseTo(60.107, 3); // The derivation of the literals
        const rows = Screen.read().rows('L');
        expect([rows[0], rows[1], rows[2].slice(0, 5)]).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '150kt']);
    });

    // 3-15, figure 3-50 (180kt 0:13 on the trip page) and the KLN 89 trainer, 2026-10-08 (the trip page showed ETE
    // 0:31): below an hour the trip pages keep the hour digit. 24.04 min; the code draws two blanks and :24. The same
    // pin as on TRI 3 (DurationDisplay.test.ts) and TRI 1: a fix that wires one page only is caught by the others.
    it.fails(
        'shows an ETE below an hour as 0:24 (3-15, checked in the KLN 89 trainer, 2026-10-08, #NEW-7-3)',
        async () => {
            const {kaaa, abc, kbbb} = meridianRoute();
            await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]), {coldGps: true});
            expect(Screen.read().rows('L')[2].slice(6)).toBe(' 0:24');
        },
    );

    // 5-6, figure 5-19 (ETE 3:53): the sibling of the pin, hours and minutes. TAS 50 kt: 60.107 NM is 72.13 min
    it('shows an ETE of an hour or more as hours and minutes: 50 kt gives 1:12 (5-6)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const unit = await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]), {coldGps: true, tas: 50});
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '050kt  1:12']);
    });

    // 5-6: any ground speed may be entered instead of the average of the plan; the ETE follows it.
    // 60.107 NM at 50 kt is 72.13 min
    it('recomputes the ETE from a ground speed entered with the knobs: 50 kt gives 1:12 (5-6)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const unit = await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]));
        await unit.panel.cursor('L');
        for (let i = 0; i < 10 && unit.panel.focused('L').row !== 2; i++) {
            await unit.panel.outer('L', 1);
        }
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 0, text: '1'}); // the hundreds digit of the ground speed
        await unit.panel.inner('L', -1); // 150 -> 050
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '050kt  1:12']);
    });

    // 5-6, steps 2 and 3: the cursor comes on over the flight plan number, and the inner knob selects the plan.
    // FPL 3 is KCCC to KDDD, half a degree north: 30.054 NM (the ETE cells are the business of the #NEW-7-3 tests)
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
        const rows = Screen.read().rows('L');
        expect([rows[0], rows[1], rows[2].slice(0, 5)]).toEqual(['FP 3   30nm', 'KCCC -KDDD ', '150kt']);
    });
});

describe('TRI 5 ground speed with a wind that differs per leg', () => {
    // KAAA, 30 NM north to KBBB, then 270 NM south to KCCC: 300 NM. TAS 150 and a wind from 360 at 50 kt give 100 kt
    // north and 200 kt south, without crosswind (so #167 plays no part)
    function windRoute() {
        const a = {lat: 47.0, lon: 8.0};
        const b = pointFrom(a, 0, 30);
        const c = pointFrom(b, 180, 270);
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
    it('shows FPL 0 from KAAA to KCCC, 300 NM (5-6)', async () => {
        await bootWindRoute();
        expect(Screen.read().rows('L').slice(0, 2)).toEqual(['FP 0  300nm', 'KAAA -KCCC ']);
    });

    // 5-6: the TAS and wind are applied to each leg of the plan, and the page gives the ETE of the plan. 30 NM at
    // 100 kt and 270 NM at 200 kt take 0.3 h + 1.35 h = 99 min (an average ground speed of 300 / 1.65 = 182 kt). The
    // page averages the two leg speeds without weighting them by distance, 150 kt, and shows 120 min. Above an hour,
    // so that the expected form does not depend on #NEW-7-3
    it.fails('shows the ETE of the plan as the sum of the leg times, 1:39 (5-6, #254)', async () => {
        await bootWindRoute();
        expect(Screen.read().rows('L')[2].slice(6)).toBe(' 1:39');
    });
});
