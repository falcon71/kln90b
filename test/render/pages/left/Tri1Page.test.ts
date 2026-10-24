import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {distanceNm, pointFrom} from '../../../harness/flight/geo';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {setTriFigures, TriFigures} from '../../../harness/triSettings';

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
    // The figures are user settings (#192), read when the page is built
    const figures: TriFigures = {ff: o.ff ?? 0, reserve: o.reserve ?? 0};
    for (const key of ['tas', 'windDirTrue', 'windSpeed'] as const) {
        if (o[key] !== undefined) {
            figures[key] = o[key];
        }
    }
    setTriFigures(unit, figures);
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
        // The ETE cells are left out: their form below an hour has tests of its own (#324)
        const rows = Screen.read().rows('L');
        expect([rows[0], rows[1], rows[2].slice(0, 5), ...rows.slice(3)]).toEqual([
            'P.POS-KBBB ',
            '  60nm 180°',
            '150kt',
            'FF: 00030.0',
            'RES:00025.0',
            'F REQ  37.0',
        ]);
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
    // the ground speed is the TAS of 150 kt. The ETE cells are read by the #324 tests below. This test is their
    // sibling: it holds the distance, bearing and ground speed they rely on (the ETE is 24.04 min)
    it('shows 60nm, the magnetic bearing 170 and 150kt to a waypoint 60 NM due south (5-3)', async () => {
        const unit = await bootTri1({magvar: 10});
        await enterTo(unit, 'KBBB');
        expect(distanceNm(POS, {lat: 46.0, lon: 8.0})).toBeCloseTo(60.107, 3); // The derivation of the literals
        const rows = Screen.read().rows('L');
        expect([rows[0], rows[1], rows[2].slice(0, 5)]).toEqual(['P.POS-KBBB ', '  60nm 170°', '150kt']);
    });

    // 3-15, figure 3-50 (180kt 0:13 on the trip page) and the KLN 89 trainer, 2026-10-08 (the trip page showed ETE
    // 0:31): below an hour the trip pages keep the hour digit. 60.107 NM at 150 kt is 24.04 min. The same test as on
    // TRI 3 (DurationDisplay.test.ts) and TRI 5: a fix that wires one page only is caught by the others.
    it(
        'shows an ETE below an hour as 0:24 (3-15, checked in the KLN 89 trainer, 2026-10-08, #324)',
        async () => {
            const unit = await bootTri1();
            await enterTo(unit, 'KBBB');
            expect(Screen.read().rows('L')[2].slice(6)).toBe(' 0:24');
        },
    );

    // 5-3, figure 5-8 (ETE 1:08): the sibling of the pin, hours and minutes. TAS 50 kt: 60.107 NM is 72.13 min
    it('shows an ETE of an hour or more as hours and minutes: 50 kt gives 1:12 (5-3)', async () => {
        const unit = await bootTri1({tas: 50});
        await enterTo(unit, 'KBBB');
        const rows = Screen.read().rows('L');
        expect([rows[1], rows[2]]).toEqual(['  60nm 180°', '050kt  1:12']);
    });

    // 5-2 and 5-3: the ground speed comes from the TAS and wind of TRI 0. TAS 200 with a wind from 180 at 20 kt on the
    // course 180 (a headwind, no crosswind) is 180 kt
    it('shows the ground speed of the TRI 0 TAS and wind: 180kt (5-3)', async () => {
        const unit = await bootTri1({tas: 200, windDirTrue: 180, windSpeed: 20});
        await enterTo(unit, 'KBBB');
        const rows = Screen.read().rows('L');
        expect([rows[0], rows[1], rows[2].slice(0, 5)]).toEqual(['P.POS-KBBB ', '  60nm 180°', '180kt']);
    });

    // 5-3: any ground speed may be entered instead of the TAS and wind result; the ETE follows it.
    // 60.107 NM at 50 kt is 72.13 min
    it('recomputes the ETE from a ground speed entered with the knobs: 50 kt gives 1:12 (5-3)', async () => {
        const unit = await bootTri1();
        await enterTo(unit, 'KBBB');
        await cursorToCell(unit, 2, 0);
        await setDigit(unit, 0); // 150 -> 050
        expect(Screen.read().rows('L')[2]).toBe('050kt  1:12');
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

// #257: a distance that does not fit the four cells shows dashes (the KLN 89 shows dashes for its CAL values out of
// range, checked in the KLN 89 trainer, 2026-10-17); the 90B's own form is a characterization. A waypoint 10500 NM
// away overflowed the row before, which the harness reports as an error.
describe('TRI 1, a distance that does not fit (characterization, #257)', () => {
    it('shows ----nm for a waypoint 10500 NM away (characterization, #257)', async () => {
        const far = pointFrom(POS, 0, 10500);
        const unit = await bootUnit({
            facilities: [airport('KAAA', POS.lat, POS.lon), airport('KFAR', far.lat, far.lon)], position: POS, magvar: 0,
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'TRI 1');
        expect(distanceNm(POS, far)).toBeCloseTo(10500, 0); // The precondition: the waypoint is 10500 NM away
        await enterTo(unit, 'KFAR');
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect(rows[0]).toBe('P.POS-KFAR ');
        expect(rows[1].slice(0, 6)).toBe('----nm');
    });
});

// #167: the TAS and wind are applied to the direction of flight: the aircraft crabs into the wind to hold the course
// (5-3 says only that the result applies to the direction of flight; the crab and the dashes are math and the 90B's
// own form, so they are characterizations).
describe('TRI 1 ground speed along the course (characterization, #167)', () => {
    // The course is 180. TAS 150 and a wind from 090 at 30 kt: sqrt(150^2 - 30^2) = 146.97 kt, 60.107 NM in 24.54 min (shown as 0:25).
    // The heading formula gave 153 kt
    it('shows 147kt for TAS 150 with a 30 kt crosswind (characterization, #167)', async () => {
        const unit = await bootTri1({tas: 150, windDirTrue: 90, windSpeed: 30});
        await enterTo(unit, 'KBBB');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['  60nm 180°', '147kt  0:25']);
    });

    // TAS 20 against a 35 kt crosswind (50 kt from 045 on the course 180): no heading holds the course
    it('shows dashes for the ground speed, ETE and F REQ where the wind leaves no solution (characterization, #167)', async () => {
        const unit = await bootTri1({tas: 20, windDirTrue: 45, windSpeed: 50, ff: 10});
        await enterTo(unit, 'KBBB');
        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect([rows[1], rows[2], rows[5]]).toEqual(['  60nm 180°', '---kt --:--', 'F REQ ---.-']);
    });

    // 5-3 shows only that any ground speed may be entered instead of the TAS and wind result; the rest is the math.
    // After a route without a solution the ground speed is dashed; the inner knob edits it from 000 (#257) and the ETE
    // and the fuel come back: 60.107 NM at 100 kt is 36.06 min, 0.601 h * 10 = 6.0
    it('brings the ETE and F REQ back when a ground speed is entered after a route with no solution (characterization, #167)', async () => {
        const unit = await bootTri1({tas: 20, windDirTrue: 45, windSpeed: 50, ff: 10});
        await enterTo(unit, 'KBBB');
        await cursorToCell(unit, 2, 0);
        await unit.panel.inner('L', 1); // the hundreds digit: 000 -> 100
        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect([rows[2], rows[5]]).toEqual(['100kt  0:36', 'F REQ   6.0']);
    });
});

// Persisted user data (CLAUDE.md "Public contract with aircraft"): the fuel flow and reserve are the user settings
// triFuelFlow and triReserve, kept over a power cycle by the trainers (2026-10-24) and so over a sim restart (#192)
describe('TRI 1 fuel flow and reserve as user settings (#192)', () => {
    it('saves the TRI 1 fuel flow and reserve in the user settings (#192)', async () => {
        const unit = await bootTri1();
        await unit.panel.cursor('L');
        await cursorToCell(unit, 3, 7);
        await setDigit(unit, 1);
        await cursorToCell(unit, 3, 8);
        await setDigit(unit, 2);
        await cursorToCell(unit, 4, 7);
        await setDigit(unit, 3);
        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FF: 00012.0', 'RES:00030.0']);
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'triFuelFlow')).toBe(12);
        expect(storedSetting(unit, 'triReserve')).toBe(30);
    });

    it('shows the stored fuel flow and reserve on TRI 1 at a new boot (#192)', async () => {
        const unit = await bootUnit({storage: {triFuelFlow: 12, triReserve: 30}});
        await unit.panel.selectPage('L', 'TRI 1');

        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FF: 00012.0', 'RES:00030.0']);
    });
});
