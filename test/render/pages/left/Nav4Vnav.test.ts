import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';
import {pointFrom} from '../../../harness/flight/geo';

// 5-7 to 5-9: advisory VNAV on NAV 4, set up after the Pilot's Guide example (figures 5-21 to 5-28): 64.8 NM to the
// destination at 7500 ft, SEL 1900 ft and an offset of 2 NM, so the VNAV target is 62.8 NM away and 5600 ft below.
// Invented world: KDDD, with KAAA 100 NM west of it; the aircraft holds a position on the leg west of KDDD at 145 kt.
// IND is the SimVar PRESSURE ALTITUDE (default baro 29.92, IND = pressure altitude).
//
// Hand-derived values (1 NM = 1852 / 0.3048 = 6076.12 ft):
// - displayed angle: atan(5600 / (62.8 * 6076.12)) = 0.84 deg, shown -0.8 (figure 5-25);
// - with the angle -1.8 the descent needs 5600 / tan(1.8 deg) = 178195 ft = 29.33 NM before the target;
//   at 145 kt one NM takes 24.83 s.

const KDDD = airport('KDDD', 47.0, 9.0);
const KAAA = airport('KAAA', 47.0, 9.0 - 100 / 60 / Math.cos(47 * Math.PI / 180));
/** The point `nm` west of KDDD, on the leg from KAAA */
const west = (nm: number) => pointFrom(KDDD, 270, nm);

/** Boots on the leg KAAA to KDDD at 7500 ft, `nm` west of KDDD at 145 kt, with SEL, offset and angle preset */
async function bootAt(nm: number, opts: { angle?: number | null } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KDDD], position: west(nm), altitudeFt: 7500,
        storage: savedFlightplan(0, [KAAA, KDDD]),
    });
    await settle(unit);
    await moveAircraft(unit, west(nm), {groundspeedKt: 145, trackTrue: 90});
    const nav = unit.props.memory.navPage;
    nav.nav4SelectedAltitude = 1900;
    nav.nav4VnavDist = 2;
    nav.nav4VnavAngle = opts.angle ?? null;
    return unit;
}

/** NAV 4 on the left, one second for the page to show the latest calculation */
async function showNav4(unit: HeadlessUnit): Promise<string[]> {
    await unit.panel.selectPage('L', 'NAV 4');
    await vi.advanceTimersByTimeAsync(1000);
    return Screen.read().rows('L');
}

/** Left cursor on, outer knob to the first ANGLE digit (six steps from SEL, see the field order of Nav4Page) */
async function cursorToAngle(unit: HeadlessUnit): Promise<void> {
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 6);
    expect(unit.panel.focused('L')).toMatchObject({row: 5, col: 7});
    await vi.advanceTimersByTimeAsync(1000);
}

const messages = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

describe('NAV 4 VNAV', () => {
    // 5-7, 5-8 (figures 5-22 to 5-25): before VNAV is started the page shows VNV INACTV, IND, SEL, the active
    // waypoint with the offset, and the angle that would reach SEL at the offset point
    it('shows VNV INACTV and the angle to the target (5-7, 5-8)', async () => {
        const unit = await bootAt(64.8);

        expect(await showNav4(unit)).toEqual([
            'VNV INACTV ',
            '           ',
            'IND 07500ft',
            'SEL:01900ft',
            'KDDD :-02nm',
            'ANGLE:-0.8°',
        ]);
    });

    // 5-8 (figure 5-26): bringing the cursor over ANGLE starts VNAV at the displayed angle; the top line shows the
    // advisory altitude, which at the start is the present altitude
    it('starts VNAV at the displayed angle when the cursor is over ANGLE (5-8)', async () => {
        const unit = await bootAt(64.8);
        await showNav4(unit);

        await cursorToAngle(unit);

        expect(Screen.read().rows('L')[0]).toBe('VNV 7500ft ');
    });

    // 5-8 (figure 5-27): with a programmed angle the top line shows VNV ARMED while the descent starts in more than
    // ten minutes: 62.8 - 29.33 = 33.47 NM before the start, 831 s at 145 kt
    it('shows VNV ARMED more than ten minutes before the descent (5-8)', async () => {
        const unit = await bootAt(64.8, {angle: -1.8});
        unit.props.vnav.armVnav();

        expect((await showNav4(unit))[0]).toBe('VNV ARMED  ');
    });

    // 5-8: less than ten minutes before the start the top line counts down. 40 NM west of KDDD the target is 38 NM
    // away, the start 38 - 29.33 = 8.67 NM, 215.3 s at 145 kt: 3:35
    it('counts down to the descent less than ten minutes before it (5-8)', async () => {
        const unit = await bootAt(40, {angle: -1.8});
        unit.props.vnav.armVnav();

        expect((await showNav4(unit))[0]).toBe('VNV IN 3:35');
    });

    // 5-8 step 7 (figure 5-28): past the start the top line shows the advisory altitude. 31 NM west the target is 29 NM
    // away: 1900 + tan(1.8 deg) * 29 * 6076.12 = 7437 ft, shown in hundreds
    it('shows the advisory altitude once the descent has started (5-8)', async () => {
        const unit = await bootAt(31, {angle: -1.8});
        unit.props.vnav.armVnav();

        expect((await showNav4(unit))[0]).toBe('VNV 7400ft ');
    });

    // 5-8 step 6, B-4: about 90 s before the descent the message prompt flashes and the MSG page holds VNV ALERT.
    // 33.75 NM west the start is 33.75 - 2 - 29.33 = 2.42 NM ahead, 60 s; NAV 1 is on the left, so NAV 4 is not in view.
    it('posts VNV ALERT about 90 s before the descent (5-8, B-4)', async () => {
        const unit = await bootAt(33.75, {angle: -1.8});
        unit.props.vnav.armVnav();
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().leftName()).not.toBe('NAV 4');
        expect(messages(unit)).toContain('VNV ALERT');
    });

    // The sibling of the alert test: 150 s before the descent (6.04 NM, 37.37 NM west) there is no alert yet
    it('posts no VNV ALERT 150 s before the descent (5-8)', async () => {
        const unit = await bootAt(37.37, {angle: -1.8});
        unit.props.vnav.armVnav();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.vnav.timeToVnav).toBeGreaterThan(140);
        expect(messages(unit)).not.toContain('VNV ALERT');
    });

    // B-4: the message is not shown while NAV 4 is in view
    it('posts no VNV ALERT while NAV 4 is in view (B-4)', async () => {
        const unit = await bootAt(33.75, {angle: -1.8});
        unit.props.vnav.armVnav();
        await showNav4(unit);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.vnav.timeToVnav).toBeLessThan(90);
        expect(messages(unit)).not.toContain('VNV ALERT');
    });
});
