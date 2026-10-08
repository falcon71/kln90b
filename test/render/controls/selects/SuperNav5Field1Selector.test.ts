import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {legWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {SuperNav5} from '../../../harness/render/superNav5';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {SuperNav5Field1} from '../../../../kln90b/settings/KLN90BUserSettings';

// SuperNav5Field1Selector: the fifth line of the Super NAV 5 left column (left[4] of SuperNav5.read()): ETE, XTK or
// VNAV, chosen with the left cursor and saved as the setting superNav5Field1. SuperNav5Page.test.ts holds the choices
// and the cursor's visit; this file holds the formats of each choice and the commit.

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

const field1 = () => SuperNav5.read().left[4];

describe('Super NAV 5 field 1', () => {
    // 3-36, 5-9 steps 3 and 4: the left cursor, the outer knob counterclockwise to the third line from the bottom, the
    // inner knob to the next choice: ETE to XTK, which is kept with the cursor off
    it('commits the choice of the fifth line: ETE to XTK (3-36, 5-9)', async () => {
        const unit = await superNav5OnLeg({westNm: 30, rightNm: 0.32, storage: {superNav5Field1: SuperNav5Field1.ETE}});
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -3);
        expect(SuperNav5.focused()).toEqual(['ETE   ']);
        await unit.panel.inner('L', 1);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'superNav5Field1')).toBe(SuperNav5Field1.XTK);
        expect(field1().slice(0, 5)).toBe('.32NM'); // the format of the test below
    });

    // 3-36 (figure 3-118): the ETE in hours and minutes after the ETE symbol, 0:03 for 6 NM at 120 kt
    it('shows the ETE as 0:03 for 6 NM at 120 kt (3-36)', async () => {
        await superNav5OnLeg({westNm: 6, storage: {superNav5Field1: SuperNav5Field1.ETE}});
        expect(field1()).toBe('Ð0:03');
    });

    // 3-38 (figure 3-124): without ground speed the ETE is dashes
    it('shows dashes for the ETE without ground speed (3-38)', async () => {
        await superNav5OnLeg({westNm: 6, groundspeedKt: 0, storage: {superNav5Field1: SuperNav5Field1.ETE}});
        expect(field1()).toBe('Ð-:--');
    });

    // 3-36: the ETE is hours and minutes: 150 NM at 120 kt is 1:15
    it('shows the ETE of one hour and a quarter for 150 NM at 120 kt (3-36)', async () => {
        await superNav5OnLeg({westNm: 150, storage: {superNav5Field1: SuperNav5Field1.ETE}});
        expect(field1()).toBe('Ð1:15');
    });

    // The sibling of the pin below: 119.8 NM at 120 kt is 59.9 min (3594 s) to KDDD
    it('reaches an ETE of 59.9 minutes (3-36)', async () => {
        const unit = await superNav5OnLeg({westNm: 119.8, storage: {superNav5Field1: SuperNav5Field1.ETE}});
        expect(unit.props.memory.navPage.eteToActive!).toBeCloseTo(3594, 0);
        expect(field1().startsWith('Ð0:')).toBe(true);
    });

    // 3-36: the ETE is hours and minutes, so the minutes run from 00 to 59. 59.9 minutes show 0:60 today
    // (SuperNav5Field1Selector.formatEte rounds the minutes after splitting off the hours, the error of #223 in another
    // function). Whether the unit rounds or truncates is open (#223), so both forms pass.
    it.fails('never shows 60 minutes in the ETE (3-36, #NEW-4-1)', async () => {
        await superNav5OnLeg({westNm: 119.8, storage: {superNav5Field1: SuperNav5Field1.ETE}});
        expect(['Ð1:00', 'Ð0:59']).toContain(field1());
    });

    // 6-8, 6-9 (figures 6-14 to 6-16): below 1 NM the cross track shows hundredths without the leading zero, then NM
    // and an arrow; 0.32 NM right of the course reads .32NM
    it('shows a cross track of 0.32 NM as .32NM (6-8)', async () => {
        await superNav5OnLeg({westNm: 30, rightNm: 0.32, storage: {superNav5Field1: SuperNav5Field1.XTK}});
        expect(field1().slice(0, 5)).toBe('.32NM');
    });

    // The sibling of the pins below: 0.996 NM and 9.97 NM right of the course are reached
    it.each([0.996, 9.97])('reaches %f NM right of the course (6-8)', async (nm) => {
        const unit = await superNav5OnLeg({westNm: 30, rightNm: nm, storage: {superNav5Field1: SuperNav5Field1.XTK}});
        expect(unit.props.memory.navPage.xtkToActive!).toBeCloseTo(nm, 2);
        expect(field1().endsWith('NM‹')).toBe(true);
    });

    // 6-8 (figures 6-14 to 6-16): 0.996 NM is a cross track of about one NM; the field shows .00NM today, a cross
    // track of zero (formatXtk formats the hundredths of 0.996, which round to 1.00, and cuts the 1). Expected:
    // 1.0NM (rounded) or .99NM (truncated).
    it.fails('does not show 0.996 NM as .00NM (6-8, #NEW-4-2)', async () => {
        await superNav5OnLeg({westNm: 30, rightNm: 0.996, storage: {superNav5Field1: SuperNav5Field1.XTK}});
        expect(['1.0NM‹', '.99NM‹']).toContain(field1());
    });

    // 6-8: just below 10 NM the tenths round up to 10.0 and the field takes seven cells (10.0NM‹), one more than the
    // six of the line (the test "is six cells wide" below holds that width). Expected: 010NM‹ (the code's own form
    // from 10 NM) or 9.9NM‹.
    it.fails('keeps a cross track of 9.97 NM in six cells (6-8, #NEW-4-2)', async () => {
        await superNav5OnLeg({westNm: 30, rightNm: 9.97, storage: {superNav5Field1: SuperNav5Field1.XTK}});
        expect(['010NM‹', '9.9NM‹']).toContain(field1());
    });

    // 5-9 step 5: without a VNAV problem the line shows V OFF
    it('shows V OFF without a VNAV problem (5-9)', async () => {
        await superNav5OnLeg({westNm: 30, storage: {superNav5Field1: SuperNav5Field1.VNAV}});
        expect(field1()).toBe('V OFF');
    });
});

// The harness test superNav5.test.ts holds the text of the field without an active waypoint ("-.-NM-") as a
// characterization. This holds the width of the field, which the text must not exceed.
describe('Super NAV 5 field 1 set to XTK without a cross track (eef92e8)', () => {
    // 6-8: the cross track field is six cells wide, the width of the other entries of the field (ETE and VNAV)
    it('is six cells wide', async () => {
        const unit = await bootUnit({storage: {superNav5Field1: SuperNav5Field1.XTK}});
        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1); // NAV 5 on both sides is Super NAV 5
        await vi.advanceTimersByTimeAsync(250);

        const field = SuperNav5.read().left[4];

        expect(field.length).toBe(6);
    });
});

describe('Super NAV 5 field 1 cross track arrow (characterization)', () => {
    // The arrow follows the side of the course the aircraft is on: right of the course it is ‹, left of it ›
    const arrows: [number, string][] = [[0.32, '‹'], [-0.32, '›']];
    it.each(arrows)('points the arrow %f NM off the course as %s (characterization)', async (nm, arrow) => {
        await superNav5OnLeg({westNm: 30, rightNm: nm, storage: {superNav5Field1: SuperNav5Field1.XTK}});
        expect(field1()).toBe(`.32NM${arrow}`);
    });
});
