import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// KAAA to KBBB is due south (true 180, magnetic variation 0), 60 NM.
function world() {
    return {kaaa: airport('KAAA', 47.0, 8.0), kbbb: airport('KBBB', 46.0, 8.0)};
}

async function tri3(tas: number, windDirTrue: number, windSpeed: number): Promise<string[]> {
    const {kaaa, kbbb} = world();
    const unit = await bootUnit({facilities: [kaaa, kbbb]});
    // TRI 0 values and the TRI 3 waypoints are volatile memory; the page computes on construction
    Object.assign(unit.props.memory.triPage, {tas, windDirTrue, windSpeed, tri3From: kaaa, tri3To: kbbb});
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

    // 5-2 and 5-3: the TRI ground speed is the TAS and wind applied to the direction of flight. A 30 kt direct
    // crosswind on a 150 kt TAS needs a wind correction of asin(30 / 150) = 11.5 deg, so the ground speed along the
    // course is 150 * cos(11.5 deg) = 147.0 kt. The pages pass the course as the heading of calculateGroundspeed,
    // which gives 153 kt (the speed over ground when flying heading 180 and drifting off course).
    it.fails('shows 147kt for TAS 150 with a 30 kt crosswind on a 180 course (#167)', async () => {
        const rows = await tri3(150, 90, 30);
        expect(rows[2].slice(0, 5)).toBe('147kt');
    });
});
