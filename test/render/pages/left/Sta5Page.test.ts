import {describe, expect, it} from 'vitest';
import {bootUnit, moveAircraft, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {distanceNm} from '../../../harness/flight/geo';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

describe('STA 5 page (characterization)', () => {
    it('characterization: the defaults before a prediction on a unit with no flight plan', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 5');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "RAIM STATUS
          DEST:      
          ETA:  __:__
                  UTC
            ççççççç  
          -15  0  •15"
        `);
    });
});

// The prediction itself cannot be tested: Sta5Page builds its own GPSSatComputer with the sync role 'primary', which
// never finishes init() in the harness, so every offset comes out as not available (testing.md section 6, #214). The
// defaults of the entry fields and the COMPUTING text come before the prediction and can be tested.
describe('STA 5 page, the defaults of the RAIM prediction (6-20)', () => {
    // 6-20: the destination defaults to the last waypoint of the active flight plan when it holds no approach, the time
    // to the current ETA there, and the page shows COMPUTING while it calculates. The ETA is derived from geo.ts: the
    // great-circle distance to ABC, then ABC to KBBB, at 120 kt, from the present time (UTC, the default time zone)
    it('defaults to the last waypoint of FPL 0 and its ETA, and shows COMPUTING (6-20)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        const here = {lat: 47.01, lon: 8.02};
        await moveAircraft(unit, here, {groundspeedKt: 120, trackTrue: 50});
        const eta = new Date(Date.now() + (distanceNm(here, abc) + distanceNm(abc, kbbb)) / 120 * 3600 * 1000);
        const hhmm = `${String(eta.getUTCHours()).padStart(2, '0')}:${String(eta.getUTCMinutes()).padStart(2, '0')}`;

        await unit.panel.selectPage('L', 'STA 5');

        const rows = Screen.read().rows('L');
        expect(rows.slice(1, 5)).toEqual(['DEST: KBBB ', `ETA:  ${hhmm}`, '        UTC', ' COMPUTING ']);
    });
});
