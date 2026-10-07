import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';
import {pointFrom} from '../../../harness/flight/geo';

// An invented world: KDDD, KAAA 100 NM west of it and KEEE 30 NM east of it. FPL 0 is KAAA, KDDD, KEEE, and the
// aircraft is on the leg to KDDD, 40 NM west of it, at 7500 ft (IND is the SimVar PRESSURE ALTITUDE at the default baro).
const KDDD = airport('KDDD', 47.0, 9.0);
const KAAA = airport('KAAA', pointFrom(KDDD, 270, 100).lat, pointFrom(KDDD, 270, 100).lon);
const KEEE = airport('KEEE', pointFrom(KDDD, 90, 30).lat, pointFrom(KDDD, 90, 30).lon);
const NO_ALTITUDE_INPUT = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><AltimeterInterfaced>false</AltimeterInterfaced></Input></Instrument></PlaneHTMLConfig>';

async function onLeg(panelXml?: string): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KDDD, KEEE], position: pointFrom(KDDD, 270, 40), altitudeFt: 7500, panelXml,
        storage: savedFlightplan(0, [KAAA, KDDD, KEEE]),
    });
    await settle(unit);
    expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KDDD'); // Precondition
    return unit;
}

describe('NAV 4 page (characterization)', () => {
    it('shows VNV INACTV with the cursor on SEL, on the right side', async () => {
        const unit = await onLeg();
        await unit.panel.selectPage('R', 'NAV 4');
        await unit.panel.cursor('R');

        const screen = Screen.read();
        expect(screen.half('R')).toMatchInlineSnapshot(`
          "VNV INACTV 
                     
          IND 07500ft
          SEL:00000ft
          KDDD :-00nm
          ANGLE:-1.8°"
        `);
        expect(screen.maskRows('R')).toMatchInlineSnapshot(`
          [
            "...........",
            "...........",
            "...........",
            "....I......",
            "...........",
            "...........",
          ]
        `);
    });
});

describe('NAV 4 page', () => {
    // 3-55 step 1 and 5-7 step 3 (figures 5-23, 5-24): with an altitude input IND is the aircraft's altitude and not
    // editable, the cursor starts on the first digit of SEL, and SEL is entered in 100 ft steps, so the cursor reaches
    // the ten-thousands, thousands and hundreds digits only. The next outer step goes to the waypoint row.
    it('enters SEL in 100 ft steps from the first SEL digit (3-55, 5-7)', async () => {
        const unit = await onLeg();
        await unit.panel.selectPage('L', 'NAV 4');
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '0'});

        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 6, text: '0'});
        await unit.panel.inner('L', 9);
        await vi.advanceTimersByTimeAsync(1000);

        const rows = Screen.read().rows('L');
        expect(rows[2]).toBe('IND 07500ft');
        expect(rows[3]).toBe('SEL:01900ft');
        expect(unit.props.memory.navPage.nav4SelectedAltitude).toBe(1900);

        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 0, text: 'KDDD '});
    });

    // 5-7 note: without an altitude input the fields are labeled FR and TO, and the present altitude is entered in FR,
    // so the cursor starts on FR
    it('labels the altitudes FR and TO and lets FR be entered without an altitude input (5-7)', async () => {
        const unit = await onLeg(NO_ALTITUDE_INPUT);
        await unit.panel.selectPage('L', 'NAV 4');
        await unit.panel.cursor('L');

        const rows = Screen.read().rows('L');
        expect(rows[2].slice(0, 2)).toBe('FR');
        expect(rows[3].slice(0, 2)).toBe('TO');
        expect(unit.panel.focused('L')?.row).toBe(2);
    });

    // 5-9, C-1: in Leg mode the VNAV waypoint must be the active waypoint or one ahead of it in FPL 0. KEEE, after the
    // active KDDD, is accepted.
    it('accepts a waypoint ahead in FPL 0 (5-9, C-1)', async () => {
        const unit = await onLeg();
        await unit.panel.selectPage('L', 'NAV 4');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.enterIdent('L', 'KEEE');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.nav4VnavWpt?.icaoStruct.ident).toBe('KEEE');
        expect(Screen.read().rows('L')[4].slice(0, 5)).toBe('KEEE ');
    });

    // C-1: a waypoint behind the aircraft, here the FROM waypoint KAAA, is refused with INVALID VNV on the status line,
    // and the VNAV waypoint stays the active one
    it('refuses a waypoint behind the aircraft with INVALID VNV (5-9, C-1)', async () => {
        const unit = await onLeg();
        await unit.panel.selectPage('L', 'NAV 4');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.enterIdent('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();

        expect(Screen.read().status().mode).toBe('INVALID VNV');
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.vnav.getVnavWaypoint()?.icaoStruct.ident).toBe('KDDD');
    });
});

// The settled unit holds its position with no ground speed. The displayed angle is the one that reaches SEL (0 ft) at
// KDDD, so the descent starts where the aircraft is: the distance to the start is zero, and zero over zero ground speed
// is no number.
describe('NAV 4 VNAV started at zero ground speed', () => {
    async function cursorOverAngle(): Promise<HeadlessUnit> {
        const unit = await onLeg();
        await unit.panel.selectPage('L', 'NAV 4');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 6);
        expect(unit.panel.focused('L')).toMatchObject({row: 5, col: 7});
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    // The setup sibling of the pin: no ground speed, the cursor over ANGLE, VNAV is no longer inactive
    it('starts VNAV at zero ground speed (5-8)', async () => {
        const unit = await cursorOverAngle();

        expect(unit.props.sensors.in.gps.groundspeed).toBe(0);
        expect(unit.props.vnav.state).not.toBe(0); // VnavState.Inactive
        expect(Screen.read().rows('L')[0].startsWith('VNV ')).toBe(true);
    });

    // 5-8 (figure 5-26): bringing the cursor over ANGLE starts VNAV at the displayed angle, and the top line shows the
    // advisory altitude, at the start the present altitude. The code computes the time to the start as 0 / 0 and shows
    // VNV INNaN: instead.
    it.fails('shows the advisory altitude when VNAV starts at zero ground speed (5-8, #NEW-1-7)', async () => {
        await cursorOverAngle();

        expect(Screen.read().rows('L')[0]).toBe('VNV 7500ft ');
    });
});
