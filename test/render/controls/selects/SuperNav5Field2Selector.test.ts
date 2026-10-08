import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {arcWorld, legWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {SuperNav5} from '../../../harness/render/superNav5';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {SuperNav5Field2} from '../../../../kln90b/settings/KLN90BUserSettings';

// SuperNav5Field2Selector: the sixth line of the Super NAV 5 left column (left[5]): the desired track (with the OBS
// course element of ObsDtkElement), the bearing to the active waypoint or the radial from it, saved as the setting
// superNav5Field2. The world: 30 NM west of KDDD on the leg to it, track 090, a variation of 10 degrees east, so the
// true bearing to KDDD (089.46 by courseDeg of geo.ts) is 079 magnetic and the radial from KDDD 259. On the great
// circle of the leg the desired track there is the same 089.46 true.

/**
 * Boots in the leg world on the leg to KDDD, `westNm` west of it and `rightNm` right of the course (south), moving at
 * `groundspeedKt` on track 090, and shows Super NAV 5 (NAV 5 on both sides; the right side first, its shorter way
 * passes NAV 5)
 */
async function superNav5OnLeg(o: {
    westNm: number, rightNm?: number, groundspeedKt?: number, storage?: Record<string, unknown>, magvar?: number,
}): Promise<HeadlessUnit> {
    const {kaaa, kddd, keee, west} = legWorld();
    const start = west(o.westNm);
    const unit = await bootUnit({
        facilities: [kaaa, kddd, keee], position: start, magvar: o.magvar,
        storage: {...savedFlightplan(0, [kaaa, kddd, keee]), ...o.storage},
    });
    await settle(unit);
    const right = o.rightNm ?? 0;
    const at = pointFrom(start, right >= 0 ? 180 : 0, Math.abs(right));
    await moveAircraft(unit, at, {groundspeedKt: o.groundspeedKt ?? 120, trackTrue: 90});
    await unit.panel.selectPage('R', 'NAV 4');
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.inner('R', 1);
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

/**
 * Boots in the arc world on the 225 radial of the left arc, loads the approach (the arc is active) and shows Super
 * NAV 5
 */
async function superNav5OnArc(o: { storage?: Record<string, unknown>, magvar?: number } = {}): Promise<HeadlessUnit> {
    const w = arcWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.at(225, 10), magvar: o.magvar,
        storage: {...savedFlightplan(0, [w.kprc]), ...o.storage},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    await unit.panel.selectPage('R', 'NAV 4');
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.inner('R', 1);
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

const field2 = () => SuperNav5.read().left[5];

describe('Super NAV 5 field 2', () => {
    // 3-36: the sixth line offers the bearing to the active waypoint; magnetic, 079 here
    it('shows the magnetic bearing to the active waypoint: 079 (3-36)', async () => {
        await superNav5OnLeg({westNm: 30, magvar: 10, storage: {superNav5Field2: SuperNav5Field2.BRG}});
        expect(field2()).toBe('Ô079°');
    });

    // 3-36: or the radial from the active waypoint, the reciprocal of the bearing: 259
    it('shows the radial from the active waypoint: 259 (3-36)', async () => {
        await superNav5OnLeg({westNm: 30, magvar: 10, storage: {superNav5Field2: SuperNav5Field2.RAD}});
        expect(field2()).toBe('Õ259°');
    });

    // 3-36: or the desired track of the leg, magnetic: the leg KAAA to KDDD runs 089.46 true at the aircraft, 079
    // magnetic
    it('shows the desired track: 079 (3-36)', async () => {
        await superNav5OnLeg({westNm: 30, magvar: 10, storage: {superNav5Field2: SuperNav5Field2.DTK}});
        expect(field2()).toBe('Ó079°');
    });

    // 3-36: the choice is made with the left cursor, two lines up from the bottom, and kept: DTK to BRG
    it('commits the choice of the sixth line: DTK to BRG (3-36)', async () => {
        const unit = await superNav5OnLeg({westNm: 30, magvar: 10, storage: {superNav5Field2: SuperNav5Field2.DTK}});
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -2);
        expect(SuperNav5.focused()).toEqual(['DTK   ']);
        await unit.panel.inner('L', 1);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'superNav5Field2')).toBe(SuperNav5Field2.BRG);
        expect(field2()).toBe('Ô079°');
    });

    // 6-18: during a DME arc the sixth line shows the desired track whatever is chosen. On the 225 radial of a left
    // (counterclockwise) arc the track is the tangent, 225 - 90 = 135 (no variation in this world)
    it('shows the desired track 135 on a DME arc with BRG chosen (6-18)', async () => {
        await superNav5OnArc({storage: {superNav5Field2: SuperNav5Field2.BRG}});
        expect(field2()).toBe('Ó135°');
    });
});
