import {describe, expect, it, vi} from 'vitest';
import {superNav5OnArc, superNav5OnLeg, SuperNav5} from '../../../harness/render/superNav5';
import {storedSetting} from '../../../harness/storage';
import {SuperNav5Field2} from '../../../../kln90b/settings/KLN90BUserSettings';

// SuperNav5Field2Selector: the sixth line of the Super NAV 5 left column (left[5]): the desired track (with the OBS
// course element of ObsDtkElement), the bearing to the active waypoint or the radial from it, saved as the setting
// superNav5Field2. The world: 30 NM west of KDDD on the leg to it, track 090, a variation of 10 degrees east, so the
// true bearing to KDDD (089.46 by courseDeg of geo.ts) is 079 magnetic and the radial from KDDD 259. On the great
// circle of the leg the desired track there is the same 089.46 true.

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
