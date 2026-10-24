import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {setTriFigures} from '../../../harness/triSettings';

// KAAA to KBBB is due south (true 180, magnetic variation 0), 60 NM.
function world() {
    return {kaaa: airport('KAAA', 47.0, 8.0), kbbb: airport('KBBB', 46.0, 8.0)};
}

async function tri3(tas: number, windDirTrue: number, windSpeed: number): Promise<string[]> {
    const {kaaa, kbbb} = world();
    const unit = await bootUnit({facilities: [kaaa, kbbb]});
    // The TRI 0 values are user settings (#192) and the TRI 3 waypoints volatile memory; the page computes on construction
    setTriFigures(unit, {tas, windDirTrue, windSpeed});
    Object.assign(unit.props.memory.triPage, {tri3From: kaaa, tri3To: kbbb});
    await unit.panel.selectPage('L', 'TRI 3');
    expect(unit.errors).toEqual([]);
    return Screen.read().rows("L");
}

describe('TRI 3 ground speed from the TRI 0 TAS and wind (5-2, 5-5)', () => {
    it('shows the TAS as the ground speed in no wind', async () => {
        // 5-2: without wind the ground speed is the TAS. This also holds the setup of the pin below.
        const rows = await tri3(150, 0, 0);
        expect(rows[0]).toBe('KAAA -KBBB ');
        expect(rows[1]).toBe('  60nm 180°');
        expect(rows[2].slice(0, 5)).toBe('150kt');
    });

    it('shows 175kt for TAS 200 into a 25 kt headwind on a 180 course (5-2)', async () => {
        const rows = await tri3(200, 180, 25);
        expect(rows[2].slice(0, 5)).toBe('175kt');
    });

});

// 5-5 says only that the TAS and wind are applied to the direction of flight; neither page shows the crab or the
// no-solution case, so these are math and the 90B's own form.
describe('TRI 3 ground speed along the course (characterization, #167)', () => {
    // #167: the aircraft crabs into the wind to hold the course. A 30 kt direct crosswind on a 150 kt TAS needs a
    // wind correction of asin(30 / 150) = 11.5 deg, so the ground speed along the course is
    // 150 * cos(11.5 deg) = 147.0 kt. The pages passed the course as the heading, which gave 153 kt (the speed over
    // ground when flying heading 180 and drifting).
    it('shows 147kt for TAS 150 with a 30 kt crosswind on a 180 course (#167)', async () => {
        const rows = await tri3(150, 90, 30);
        expect(rows[2].slice(0, 5)).toBe('147kt');
    });

    // #167, math: TAS 20 and a wind of 50 kt from 045 on the course 180: the crosswind of 35 kt is stronger than the
    // TAS, so no heading holds the course and there is no ground speed. The ETE and the fuel follow as dashes. The
    // 90B's own dash form is a characterization (the KLN 89 shows dashes for values it cannot compute, #257)
    it('shows dashes for the ground speed, ETE and F REQ where the wind leaves no solution (characterization, #167)', async () => {
        const rows = await tri3(20, 45, 50);
        expect([rows[2], rows[5]]).toEqual(['---kt --:--', 'F REQ ---.-']);
    });

    // The no-route form stays 000: the dashes above are for a route with no solution, not for a missing route
    it('shows 000kt without a route (characterization, #167)', async () => {
        const unit = await bootUnit({facilities: []});
        await unit.panel.selectPage('L', 'TRI 3');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows("L")[2]).toBe('000kt --:--');
    });
});
