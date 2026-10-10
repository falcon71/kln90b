import {describe, expect, it, vi} from 'vitest';
import {superNav5OnArc, superNav5OnLeg, SuperNav5} from '../../../harness/render/superNav5';
import {storedSetting} from '../../../harness/storage';
import {SuperNav5Field3} from '../../../../kln90b/settings/KLN90BUserSettings';

// SuperNav5Field3Selector: the bottom line of the Super NAV 5 left column (left[6]): the actual track, the bearing to
// the active waypoint or the radial from it, saved as the setting superNav5Field3, and the arc radial near a DME arc.
// The world: 30 NM west of KDDD on the leg to it, track 090 true, a variation of 10 degrees east (track 080 magnetic;
// the bearing to KDDD 089.46 true by courseDeg of geo.ts, 079 magnetic; the radial 259).

const field3 = () => SuperNav5.read().left[6];

describe('Super NAV 5 field 3', () => {
    // 3-36: the bottom line offers the actual track, magnetic: 090 true is 080
    it('shows the magnetic track: 080 (3-36)', async () => {
        await superNav5OnLeg({westNm: 30, magvar: 10, storage: {superNav5Field3: SuperNav5Field3.TK}});
        expect(field3()).toBe('Ö080°');
    });

    // 3-36: the radial from the active waypoint: 259
    it('shows the radial from the active waypoint: 259 (3-36)', async () => {
        await superNav5OnLeg({westNm: 30, magvar: 10, storage: {superNav5Field3: SuperNav5Field3.RAD}});
        expect(field3()).toBe('Õ259°');
    });

    // 3-38 (figure 3-124): without ground speed the track is dashes
    it('shows dashes for the track without ground speed (3-38)', async () => {
        await superNav5OnLeg({westNm: 30, groundspeedKt: 0, storage: {superNav5Field3: SuperNav5Field3.TK}});
        expect(field3()).toBe('Ö---°');
    });

    // 3-36: the choice is made with the left cursor on the bottom line and kept: TK to BRG
    it('commits the choice of the bottom line: TK to BRG (3-36)', async () => {
        const unit = await superNav5OnLeg({westNm: 30, magvar: 10, storage: {superNav5Field3: SuperNav5Field3.TK}});
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -1);
        expect(SuperNav5.focused()).toEqual([' TK   ']);
        await unit.panel.inner('L', 1);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'superNav5Field3')).toBe(SuperNav5Field3.BRG);
        expect(field3()).toBe('Ô079°');
    });

    // 6-18: within 30 NM of a DME arc the bottom line shows the radial of the arc's VOR at the aircraft, whatever is
    // chosen: on the 225 radial at 10 NM. The radial is the VOR's (variation 0), not the area's 10 degrees (the
    // radial rule of #280)
    it('shows the arc radial 225 on a DME arc with TK chosen (6-18)', async () => {
        await superNav5OnArc({magvar: 10, storage: {superNav5Field3: SuperNav5Field3.TK}});
        expect(field3()).toBe('Ø225°');
    });
});
