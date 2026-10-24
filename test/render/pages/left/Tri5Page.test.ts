import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {distanceNm, pointFrom} from '../../../harness/flight/geo';
import {airport, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {setTriFigures, TriFigures} from '../../../harness/triSettings';
import {bootOnStandardRoute} from '../../../harness/worldBoot';

// Two legs of half a degree of latitude each along the meridian 8 E, due north: 30.054 NM each, 60.107 NM in all,
// 24.04 min at the default TAS of 150 kt in no wind.
const meridianRoute = () => ({kaaa: airport('KAAA', 47.0, 8.0), abc: vor('ABC', 47.5, 8.0), kbbb: airport('KBBB', 48.0, 8.0)});

async function bootTri5(
    facilities: Facility[], storage: Record<string, unknown>,
    o: { coldGps?: boolean, tas?: number, windDirTrue?: number, windSpeed?: number, ff?: number } = {},
): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, storage, coldGps: o.coldGps});
    if (!o.coldGps) {
        await settle(unit);
    }
    const figures: TriFigures = {};
    for (const key of ['tas', 'windDirTrue', 'windSpeed', 'ff'] as const) {
        if (o[key] !== undefined) {
            figures[key] = o[key]; // a user setting (#192), read when the page is built
        }
    }
    setTriFigures(unit, figures);
    await unit.panel.selectPage('L', 'TRI 5');
    return unit;
}

describe('TRI 5 page (characterization)', () => {
    it('shows the analysis of FPL 0 with fuel flow and reserve (characterization)', async () => {
        const unit = await bootOnStandardRoute();
        setTriFigures(unit, {ff: 30, reserve: 25}); // user settings (#192), read when the page is built
        await unit.panel.selectPage('L', 'TRI 5');
        expect(unit.errors).toEqual([]);
        // Row 2 is 91.23 NM at 150 kt (no wind), 36.49 min: 0:36 (the GS row is characterization, #254)
        expect(Screen.read().rows('L')).toMatchInlineSnapshot(`
          [
            "FP 0   91nm",
            "KAAA -KBBB ",
            "150kt  0:36",
            "FF: 00030.0",
            "RES:00025.0",
            "F REQ  43.2",
          ]
        `);
    });
});

describe('TRI 5 page of a waypoint repeated in the plan (characterization, #388)', () => {
    // A leg from a waypoint to itself has no length and no course (its bearing is NaN). It adds no time, so the plan
    // keeps the ground speed and the ETE of its one real leg: KAAA to KBBB, 60.107 NM at 150 kt is 24.04 min
    it('skips a leg from KBBB to KBBB: 150kt and 0:24 for KAAA to KBBB (characterization, #388)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const kbbb = airport('KBBB', 48.0, 8.0);
        const unit = await bootTri5([kaaa, kbbb], savedFlightplan(0, [kaaa, kbbb, kbbb]), {coldGps: true});
        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect([rows[0], rows[1], rows[2]]).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '150kt  0:24']);
    });

    // A plan of two waypoints that are the same: no leg has a length, so the plan has no ground speed (dashes) and
    // no time. The ETE is 0:00, the sum of no leg times
    it('shows dashes for the GS and 0:00 for the ETE of a plan KAAA to KAAA (characterization, #388)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const unit = await bootTri5([kaaa], savedFlightplan(0, [kaaa, kaaa]), {coldGps: true});
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('---kt  0:00');
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
    // GPS. 60.107 NM at 150 kt is 24.04 min. The ETE cells are read by the #324 tests below. This test is their
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
    // 0:31): below an hour the trip pages keep the hour digit. 24.04 min. The same test as on TRI 3
    // (DurationDisplay.test.ts) and TRI 1: a fix that wires one page only is caught by the others.
    it(
        'shows an ETE below an hour as 0:24 (3-15, checked in the KLN 89 trainer, 2026-10-08, #324)',
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
    // FPL 3 is KCCC to KDDD, half a degree north: 30.054 NM (the ETE cells are the business of the #324 tests)
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
        setTriFigures(unit, {tas: 150, windDirTrue: 0, windSpeed: 50});
        await unit.panel.selectPage('L', 'TRI 5');
        return unit;
    }

    // 5-6: the plan and its total distance, the context of the #254 tests below
    it('shows FPL 0 from KAAA to KCCC, 300 NM (5-6)', async () => {
        await bootWindRoute();
        expect(Screen.read().rows('L').slice(0, 2)).toEqual(['FP 0  300nm', 'KAAA -KCCC ']);
    });

    // The sum of the leg times is the maintainer's ruling for #254, not a rule of the guide. 5-6 applies the TAS and wind
    // to each leg and calls the ground speed the average of the plan, but does not say how the legs are weighted. Here
    // 30 NM at 100 kt and 270 NM at 200 kt take 0.3 h + 1.35 h = 99 min, 1:39 (an average ground speed of
    // 300 / 1.65 = 182 kt). The distance over the mean of the leg speeds (150 kt) would give 2:00, the value the page
    // showed before #254. The ETE is above an hour, where it has the h:mm form that every page uses
    it('shows the ETE of the plan as the sum of the leg times, 1:39 (characterization, #254)', async () => {
        await bootWindRoute();
        expect(Screen.read().rows('L')[2].slice(6)).toBe(' 1:39');
    });

    // The GS row shows the plan distance over the summed leg times: 300 NM / 1.65 h = 181.8 kt, shown as 182kt. 5-6 calls
    // it the average of the plan but not how it is weighted, so the weighting is the maintainer's ruling (#254)
    it('shows the plan distance over the summed leg times as the GS, 182kt (characterization, #254)', async () => {
        await bootWindRoute();
        expect(Screen.read().rows('L')[2]).toBe('182kt  1:39');
    });

    // The GS hundreds turned up and back down: 300 NM / 282 kt is 1.064 h, 1:04, and 300 NM / 182 kt is 1:39 again.
    // The cursor reaches the hundreds digit as in the test above (characterization, #254)
    it('recomputes the ETE from the GS edited up and back: 282kt 1:04, then 182kt 1:39 (characterization, #254)', async () => {
        const unit = await bootWindRoute();
        await unit.panel.cursor('L');
        for (let i = 0; i < 10 && unit.panel.focused('L').row !== 2; i++) {
            await unit.panel.outer('L', 1);
        }
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 0, text: '1'}); // the hundreds digit of the ground speed
        await unit.panel.inner('L', 1); // 182 -> 282
        expect(Screen.read().rows('L')[2]).toBe('282kt  1:04');
        await unit.panel.inner('L', -1); // 282 -> 182
        expect(Screen.read().rows('L')[2]).toBe('182kt  1:39');
    });
});

// #167: the TAS and wind are applied to the direction of each leg: the aircraft crabs into the wind to hold the
// course. 5-6 says only that the wind applies to each leg; the crab and the dashes are math and the 90B's own form.
describe('TRI 5 ground speed along the course (characterization, #167)', () => {
    // Both legs run due north. TAS 150 and a wind from 090 at 30 kt: sqrt(150^2 - 30^2) = 146.97 kt on each leg,
    // 60.107 NM in 24.54 min (shown as 0:25). The heading formula gave 153 kt
    it('shows 147kt for TAS 150 with a 30 kt crosswind (characterization, #167)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const unit = await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]),
            {coldGps: true, tas: 150, windDirTrue: 90, windSpeed: 30});
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '147kt  0:25']);
    });

    // The wind applies to each leg in the direction of that leg (math). Both legs run due north into a wind from 360
    // at 25 kt: a headwind of 25 kt, 125 kt on each leg (a reversed leg course gives 175 kt). 60.107 NM in 28.85 min
    it('shows 125kt for TAS 150 into a 25 kt headwind on both legs (characterization, #167)', async () => {
        const {kaaa, abc, kbbb} = meridianRoute();
        const unit = await bootTri5([kaaa, abc, kbbb], savedFlightplan(0, [kaaa, abc, kbbb]),
            {coldGps: true, tas: 150, windDirTrue: 0, windSpeed: 25});
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['FP 0   60nm', 'KAAA -KBBB ', '125kt  0:29']);
    });

    // TAS 20, wind from 090 at 25 kt. A leg of 30 NM west has a tailwind (45 kt), a leg of 30 NM north a 25 kt
    // crosswind above the TAS (no solution). One leg without a solution leaves the whole plan without one, whichever
    // leg it is
    async function bootTwoLegs(firstCourse: number, secondCourse: number): Promise<string[]> {
        const a = {lat: 47.0, lon: 8.0};
        const b = pointFrom(a, firstCourse, 30);
        const c = pointFrom(b, secondCourse, 30);
        const [kaaa, kbbb, kccc] = [airport('KAAA', a.lat, a.lon), airport('KBBB', b.lat, b.lon), airport('KCCC', c.lat, c.lon)];
        const unit = await bootTri5([kaaa, kbbb, kccc], savedFlightplan(0, [kaaa, kbbb, kccc]),
            {coldGps: true, tas: 20, windDirTrue: 90, windSpeed: 25, ff: 10});
        expect(unit.errors).toEqual([]);
        return Screen.read().rows('L');
    }

    it('shows dashes where the last leg has no solution (characterization, #167)', async () => {
        const rows = await bootTwoLegs(270, 0);
        expect([rows[1], rows[2], rows[5]]).toEqual(['KAAA -KCCC ', '---kt --:--', 'F REQ ---.-']);
    });

    it('shows dashes where the first leg has no solution (characterization, #167)', async () => {
        const rows = await bootTwoLegs(0, 270);
        expect([rows[1], rows[2], rows[5]]).toEqual(['KAAA -KCCC ', '---kt --:--', 'F REQ ---.-']);
    });

    // The no-route form stays 000: dashes are for a route with no solution, not for a plan of one waypoint
    it('shows 000kt --:-- for a plan of one waypoint (characterization, #167)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        await bootTri5([kaaa], savedFlightplan(0, [kaaa]));
        expect(Screen.read().rows('L')[2]).toBe('000kt --:--');
    });
});

// Persisted user data (CLAUDE.md "Public contract with aircraft"): the plan number of TRI 5 and TRI 6 is the user setting
// tri5Fpl, kept over a power cycle by the AVsoftech trainer (2026-10-24, unreliable) and so over a sim restart (#192)
describe('TRI 5 plan number as a user setting (#192)', () => {
    it('saves the TRI 5 plan number in the user settings (#192)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'TRI 5');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 3);
        expect(Screen.read().rows('L')[0].slice(0, 4)).toBe('FP 3');
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'tri5Fpl')).toBe(3);
    });

    // FPL 3 is KCCC to KDDD, half a degree north: 30.054 NM. FPL 0 is empty, so the page shows FPL 3 only when it reads the
    // stored number (the heading alone would also come from a plan 0 analysis under a plan 3 select field)
    it('shows the stored plan number on TRI 5 at a new boot and analyzes that plan (#192)', async () => {
        const kccc = airport('KCCC', 47.0, 8.0);
        const kddd = airport('KDDD', 47.5, 8.0);
        const unit = await bootTri5([kccc, kddd], {tri5Fpl: 3, ...savedFlightplan(3, [kccc, kddd])});
        await vi.advanceTimersByTimeAsync(1000);

        const rows = Screen.read().rows('L');
        expect([rows[0], rows[1], rows[2].slice(0, 5)]).toEqual(['FP 3   30nm', 'KCCC -KDDD ', '150kt']);
        expect(storedSetting(unit, 'tri5Fpl')).toBe(3); // showing the page does not overwrite it
    });
});

// Persisted user data: the fuel flow and reserve entered on TRI 5 are the user settings triFuelFlow and triReserve (#192)
describe('TRI 5 fuel flow and reserve as user settings (#192)', () => {
    it('saves the TRI 5 fuel flow and reserve in the user settings (#192)', async () => {
        const unit = await bootTri5([], {});
        await unit.panel.cursor('L');
        for (let i = 0; i < 20 && !(unit.panel.focused('L').row === 3 && unit.panel.focused('L').col === 7); i++) {
            await unit.panel.outer('L', 1);
        }
        await unit.panel.inner('L', 4); // FF tens 0 -> 4
        for (let i = 0; i < 20 && !(unit.panel.focused('L').row === 4 && unit.panel.focused('L').col === 8); i++) {
            await unit.panel.outer('L', 1);
        }
        await unit.panel.inner('L', 7); // RES units 0 -> 7
        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FF: 00040.0', 'RES:00007.0']);
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'triFuelFlow')).toBe(40);
        expect(storedSetting(unit, 'triReserve')).toBe(7);
    });
});
