import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {standardRoute} from '../harness/fixtures';
import {airport, intersection, vor} from '../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../harness/navdata/procedures';
import {Screen} from '../harness/render/screen';
import {savedFlightplan, storedSetting} from '../harness/storage';
import {pointFrom} from '../harness/flight/geo';
import {NavMode} from '../../kln90b/data/VolatileMemory';

// Every event below is sent as a string literal, never through the EVT_ constants or the FrontPanel shortcuts, which send
// the constants: the constants move with a renamed event, and the literals are the contract (CLAUDE.md, "Public
// contract with aircraft"; the wiki page External Hardware).

const BLANK_SCREEN = Array.from({length: 7}, () => ' '.repeat(23)).join('\n');

const PUBLIC_EVENTS = [
    'KLN90B_Brt_Inc', 'KLN90B_Brt_Dec', 'KLN90B_Power_Toggle', 'KLN90B_Power_On', 'KLN90B_Power_Off', 'KLN90B_MSG_Push',
    'KLN90B_DCT_Push', 'KLN90B_CLR_Push', 'KLN90B_ENT_Push', 'KLN90B_ALT_Push',
    'KLN90B_LeftCursor_Toggle', 'KLN90B_LeftLargeKnob_Left', 'KLN90B_LeftLargeKnob_Right', 'KLN90B_LeftSmallKnob_Left',
    'KLN90B_LeftSmallKnob_Right',
    'KLN90B_RightCursor_Toggle', 'KLN90B_RightLargeKnob_Left', 'KLN90B_RightLargeKnob_Right', 'KLN90B_RightSmallKnob_Left',
    'KLN90B_RightSmallKnob_Right', 'KLN90B_RightScan_Toggle',
    'KLN90B_ApprArm_Push',
];

// Contract: a sweep that accepts every public event in four states of the unit. Each event goes to a fresh unit, because
// the power events end a sequential sweep (every later event would go to the blank page). It checks that nothing throws,
// logs an error or leaves an unhandled rejection (the harness's strict collector). It cannot see a renamed or removed
// event, which the unit ignores without a word: the name pin in test/unit/HEvents.test.ts and the tests below, which
// send literals, hold the names.
describe('every public H event (sweep)', () => {
    async function expectNoError(unit: HeadlessUnit): Promise<void> {
        expect(unit.errors).toEqual([]);
        expect(unit.consoleErrors).toEqual([]);
    }

    it.each(PUBLIC_EVENTS)('accepts %s on the main page without an error (sweep)', async evt => {
        const unit = await bootUnit();

        unit.send(evt);
        await vi.advanceTimersByTimeAsync(2000);

        await expectNoError(unit);
    });

    it.each(PUBLIC_EVENTS)('accepts %s on the welcome page without an error (sweep)', async evt => {
        const unit = await bootUnit({engineRunning: false});
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(2000);
        // 3-3: the turn-on page; a timing change must not move this sweep to another state
        expect(Screen.read().row(0)).toBe(' GPS             ORS 20');

        unit.send(evt);
        await vi.advanceTimersByTimeAsync(2000);

        await expectNoError(unit);
    });

    it.each(PUBLIC_EVENTS)('accepts %s on the self-test page without an error (sweep)', async evt => {
        const unit = await bootUnit({engineRunning: false});
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(20_000);
        // The self-test is through and the unit waits for the database to be approved
        expect(Screen.read().rows('R')[5]).toBe('  APPROVE? ');

        unit.send(evt);
        await vi.advanceTimersByTimeAsync(2000);

        await expectNoError(unit);
    });

    it.each(PUBLIC_EVENTS)('accepts %s on a dark unit without an error (sweep)', async evt => {
        const unit = await bootUnit({engineRunning: false});
        expect(Screen.read().text()).toBe(BLANK_SCREEN);

        unit.send(evt);
        await vi.advanceTimersByTimeAsync(2000);

        await expectNoError(unit);
    });
});

// 3-12: the left outer knob selects the page group in the order TRI MOD FPL NAV CAL STA SET OTH, and the list wraps
describe('left knobs (3-12)', () => {
    it('the outer knob moves down the page groups clockwise and up counterclockwise', async () => {
        const unit = await bootUnit();
        expect(Screen.read().status().left).toBe('NAV 2');

        await unit.panel.press('KLN90B_LeftLargeKnob_Right');
        expect(Screen.read().status().left).toBe('CAL 1');

        await unit.panel.press('KLN90B_LeftLargeKnob_Left', 2);
        expect(Screen.read().status().left).toBe('FPL 0');
    });

    it('the outer knob wraps between the first and the last page group', async () => {
        const unit = await bootUnit();

        await unit.panel.press('KLN90B_LeftLargeKnob_Left', 3); // NAV, FPL, MOD, TRI
        expect(Screen.read().status().left).toBe('TRI 0');

        await unit.panel.press('KLN90B_LeftLargeKnob_Left');
        expect(Screen.read().status().left).toBe('OTH 1');

        await unit.panel.press('KLN90B_LeftLargeKnob_Right');
        expect(Screen.read().status().left).toBe('TRI 0');
    });

    // The manual's own example: from CAL 1 to CAL 5 is four steps clockwise or three counterclockwise
    it('the inner knob moves through the pages of the group and wraps', async () => {
        const unit = await bootUnit();
        await unit.panel.press('KLN90B_LeftLargeKnob_Right');
        expect(Screen.read().status().left).toBe('CAL 1');

        await unit.panel.press('KLN90B_LeftSmallKnob_Right', 4);
        expect(Screen.read().status().left).toBe('CAL 5');

        await unit.panel.press('KLN90B_LeftSmallKnob_Right', 3);
        expect(Screen.read().status().left).toBe('CAL 1');

        await unit.panel.press('KLN90B_LeftSmallKnob_Left', 3);
        expect(Screen.read().status().left).toBe('CAL 5');
    });
});

// 3-13: the right outer knob selects the page group in the order CTR REF ACT D/T NAV APT VOR NDB INT SUP, and the list wraps
describe('right knobs (3-13)', () => {
    it('the outer knob wraps from the last page group to the first and moves back', async () => {
        const unit = await bootUnit();
        expect(Screen.read().status().right).toBe('SUP');

        await unit.panel.press('KLN90B_RightLargeKnob_Right');
        expect(Screen.read().status().right).toBe('CTR 1');

        await unit.panel.press('KLN90B_RightLargeKnob_Left', 2); // SUP, INT
        expect(Screen.read().rightName()).toBe('INT  ');
    });

    // D/T has four pages. Single steps, then a wrap: a step of two in a group of four, or a group of two, would stay green
    // with the knob reversed
    it('the inner knob moves through the pages of the group and wraps', async () => {
        const unit = await bootUnit();
        await unit.panel.press('KLN90B_RightLargeKnob_Right', 4); // CTR, REF, ACT, D/T
        expect(Screen.read().status().right).toBe('D/T 1');

        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().status().right).toBe('D/T 2');

        await unit.panel.press('KLN90B_RightSmallKnob_Left');
        expect(Screen.read().status().right).toBe('D/T 1');

        await unit.panel.press('KLN90B_RightSmallKnob_Left');
        expect(Screen.read().status().right).toBe('D/T 4');
    });
});

// 3-13, 4-10: the ACT pages of an active airport (the page group that follows the active waypoint) are turned by the right inner
// knob like any group, but the ACT page keeps its own list of sub-pages, which MainPage steps through a separate branch
describe('right inner knob on the ACT pages (3-13)', () => {
    it('moves through the pages of the active airport and wraps', async () => {
        const {kaaa, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await settle(unit);
        await unit.panel.press('KLN90B_RightLargeKnob_Right', 3); // CTR, REF, ACT
        expect(Screen.read().status().right).toBe('ACT 1');
        expect(Screen.read().rows('R')[1]).toBe('KBBB AIRPT ');

        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().status().right).toBe('ACT 2');

        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().status().right).toBe('ACT+3');

        await unit.panel.press('KLN90B_RightSmallKnob_Left', 2);
        expect(Screen.read().status().right).toBe('ACT 1');

        await unit.panel.press('KLN90B_RightSmallKnob_Left');
        expect(Screen.read().status().right).toBe('ACT 8');
    });
});

// 3-11: the cursor button turns the cursor of that side on and off; a page without data entry ignores it
describe('cursor buttons (3-11)', () => {
    it('the left cursor button toggles the cursor of the left page', async () => {
        const unit = await bootUnit();
        await unit.panel.press('KLN90B_LeftLargeKnob_Left');
        expect(Screen.read().status().left).toBe('FPL 0');

        await unit.panel.press('KLN90B_LeftCursor_Toggle');
        expect(Screen.read().status().left).toBe('CRSR');
        expect(Screen.read().status().right).toBe('SUP');

        await unit.panel.press('KLN90B_LeftCursor_Toggle');
        expect(Screen.read().status().left).toBe('FPL 0');
    });

    it('the right cursor button toggles the cursor of the right page', async () => {
        const unit = await bootUnit();
        expect(Screen.read().status().right).toBe('SUP');

        await unit.panel.press('KLN90B_RightCursor_Toggle');
        expect(Screen.read().status().right).toBe('CRSR');
        expect(Screen.read().status().left).toBe('NAV 2');

        await unit.panel.press('KLN90B_RightCursor_Toggle');
        expect(Screen.read().status().right).toBe('SUP');
    });

    it('the left cursor button is ignored on a page without data entry', async () => {
        const unit = await bootUnit();
        expect(Screen.read().status().left).toBe('NAV 2');

        await unit.panel.press('KLN90B_LeftCursor_Toggle');

        expect(Screen.read().status().left).toBe('NAV 2');
        expect(Screen.read().maskRows('L')).toEqual(Array.from({length: 6}, () => '...........'));
        expect(unit.errors).toEqual([]);
    });
});

describe('MSG button (3-16)', () => {
    // 3-16: the message page shows the messages over the full width, and a second press returns to the pages in view. The
    // booted unit always holds the two messages of testing.md section 6
    it('shows the message page, and a second press returns to the pages in view', async () => {
        const unit = await bootUnit();

        await unit.panel.press('KLN90B_MSG_Push');

        const screen = Screen.read();
        expect(screen.status().left).toBe('');
        expect(screen.status().right).toBe('');
        // Two messages of two rows each. Unordered: the posting order of the two is not checked against 3-16 (newest first)
        const messages = [[0, 1], [2, 3]].map(([a, b]) => [screen.row(a).trimEnd(), screen.row(b).trimEnd()]);
        expect(messages).toContainEqual(['SYSTEM TIME UPDATED', ' TO GPS TIME']);
        expect(messages).toContainEqual(['POSITION DIFFERS FROM', ' LAST POSITION BY >2NM']);
        expect([screen.row(4).trim(), screen.row(5).trim()]).toEqual(['', '']);

        await unit.panel.press('KLN90B_MSG_Push');
        expect(Screen.read().status().left).toBe('NAV 2');
        expect(Screen.read().status().right).toBe('SUP');
    });
});

describe('ALT button (3-55, 3-56, 3-39)', () => {
    // 3-55, step 1: ALT pushed opens the baro and the altitude alert fields with the cursor on; 3-56, step 6 and 3-39: a
    // second press returns to the pages in view
    it('puts the cursor on the baro and the selected altitude, and a second press returns', async () => {
        const unit = await bootUnit();
        // NAV 4 shows TO : until an altitude input exists (5-7)
        await vi.advanceTimersByTimeAsync(5000);

        await unit.panel.press('KLN90B_ALT_Push');

        const screen = Screen.read();
        expect(screen.rows('L')[1]).toBe('BARO:29.92"');
        expect(screen.maskRows('L')[1]).toBe('.....II....');
        expect(screen.rows('R')[3]).toBe('SEL:00000ft');
        expect(screen.maskRows('R')[3]).toBe('....I......');
        expect(screen.status().left).toBe('CRSR');
        expect(screen.status().right).toBe('CRSR');

        await unit.panel.press('KLN90B_ALT_Push');
        expect(Screen.read().status().left).toBe('NAV 2');
        expect(Screen.read().status().right).toBe('SUP');
    });
});

describe('DCT, ENT and CLR buttons (3-29, 4-7, 5-37)', () => {
    const {kaaa, abc, kbbb} = standardRoute();

    /** Plan KAAA, ABC, KBBB with ABC active, the right side off the SUP page of the boot (an open DCT page is blank there, #119) */
    async function planWithAbcActive() {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        await unit.panel.press('KLN90B_RightLargeKnob_Left', 5); // SUP, INT, NDB, VOR, APT, NAV
        expect(Screen.read().rightName().slice(0, 3)).toBe('NAV'); // Any NAV page, not a waypoint page
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(false);
        return unit;
    }

    // 5-37 (5.9.7): in OBS mode a second press of the direct-to button turns DIRECT TO into ACTIVATE, and further presses alternate
    it('the DCT button alternates between DIRECT TO and ACTIVATE in OBS mode', async () => {
        const unit = await planWithAbcActive();
        await unit.panel.obsMode();

        await unit.panel.press('KLN90B_DCT_Push');
        expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: ');

        await unit.panel.press('KLN90B_DCT_Push');
        expect(Screen.read().rows('L')[0]).toBe('ACTIVATE:  ');

        await unit.panel.press('KLN90B_DCT_Push');
        expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: ');
    });

    // 3-29, steps 1 to 3: D-> shows the active waypoint, ENT confirms it, and the unit flies direct to it from where it is
    it('the ENT button confirms a direct-to to the active waypoint', async () => {
        const unit = await planWithAbcActive();

        await unit.panel.press('KLN90B_DCT_Push');
        expect(Screen.read().rows('L')[2]).toBe('   ABC     ');

        await unit.panel.press('KLN90B_ENT_Push');
        await vi.advanceTimersByTimeAsync(1000);

        const nav = unit.props.memory.navPage;
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
    });

    // 3-29 and 4-7: CLR cancels the direct-to page, and the following ENT confirms nothing
    it('the CLR button cancels a direct-to page', async () => {
        const unit = await planWithAbcActive();

        await unit.panel.press('KLN90B_DCT_Push');
        await unit.panel.press('KLN90B_CLR_Push');
        await unit.panel.press('KLN90B_ENT_Push');
        await vi.advanceTimersByTimeAsync(1000);

        const nav = unit.props.memory.navPage;
        expect(nav.activeWaypoint.isDctNavigation()).toBe(false);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });
});

describe('right scan knob (3-13, 3-21)', () => {
    /** Two VORs, ABC first; the VOR page of the right side shows ABC */
    async function onVorPage() {
        const unit = await bootUnit({facilities: [vor('ABC', 47.2, 8.2), vor('ABD', 47.1, 8.1)]});
        await unit.panel.selectPage('R', 'VOR  ');
        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');
        return unit;
    }

    // 3-13: the right inner knob pushed in turns the pages (VOR has one), pulled out it scans the waypoints; 3-21: the scan
    // steps through them in order. Another step within 350 ms would speed the scan up (WaypointPage SPEEDSTEP), so each
    // step waits
    it('toggling scan pulls the knob out, and the inner knob then scans the VORs in order', async () => {
        const unit = await onVorPage();

        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');

        await unit.panel.press('KLN90B_RightScan_Toggle');
        expect(unit.env.sim.lastWrite('L:KLN90B_RightScan')!.value).toBe(1);

        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().rows('R')[0]).toBe(' ABD D     ');
        await vi.advanceTimersByTimeAsync(400);

        await unit.panel.press('KLN90B_RightSmallKnob_Left');
        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');
        await vi.advanceTimersByTimeAsync(400);

        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().rows('R')[0]).toBe(' ABD D     ');
        await vi.advanceTimersByTimeAsync(400);
    });

    it('toggling scan again pushes the knob in, and the inner knob no longer scans', async () => {
        const unit = await onVorPage();
        await unit.panel.press('KLN90B_RightScan_Toggle');
        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().rows('R')[0]).toBe(' ABD D     ');
        await vi.advanceTimersByTimeAsync(400);

        await unit.panel.press('KLN90B_RightScan_Toggle');
        expect(unit.env.sim.lastWrite('L:KLN90B_RightScan')!.value).toBe(0);

        await unit.panel.press('KLN90B_RightSmallKnob_Right');
        expect(Screen.read().rows('R')[0]).toBe(' ABD D     ');
    });
});

describe('Power_Toggle H event (public contract)', () => {
    // The source is the doc comment of HEvents.ts and the wiki page External Hardware: Power_Toggle switches the unit off
    // when it is on and on when it is off (Power_On and Power_Off set it, PowerButton.test.ts, BrightnessManager.test.ts)
    it('switches the unit off, and a second press switches it on again', async () => {
        const unit = await bootUnit();
        // The brightness ramp of the boot has run out, and the save of the setting is deferred
        await vi.advanceTimersByTimeAsync(15_000);
        const cycles = storedSetting(unit, 'powercycles') as number;

        unit.send('KLN90B_Power_Toggle');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(Screen.read().text()).toBe(BLANK_SCREEN);

        unit.send('KLN90B_Power_Toggle');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(1);
        expect(storedSetting(unit, 'powercycles')).toBe(cycles + 1);
        // 3-3: the turn-on page
        expect(Screen.read().row(0)).toBe(' GPS             ORS 20');
    });
});

describe('approach arm button (6-1, C-1)', () => {
    // 6-1: the GPS APR switch arms the approach, and a press while armed disarms it. C-1: NO APPROACH is the message of an
    // attempt without an approach loaded
    it('says NO APPROACH and stays in ENR when no approach is loaded', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(1000);

        unit.send('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(250);

        expect(Screen.read().status().mode).toBe('NO APPROACH');
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
    });

    // The mode field of the status line, columns 6 to 12; the MSG annunciator sits beside it (columns 14 to 16), and the
    // booted unit keeps its boot messages unread
    const modeField = () => Screen.read().row(6).slice(6, 13);

    const kprc = airport('KPRC', 47.0, 8.0);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const fafPos = pointFrom(mapaa, 0, 5);
    const fafaa = intersection('FAFAA', fafPos.lat, fafPos.lon);

    /**
     * An RNAV approach to KPRC whose final runs FAFAA, 5 NM north of the MAP, to MAPAA (the IAF is the FAF itself). The
     * plan is ENRAA, KPRC with the approach loaded, the aircraft `nm` north of KPRC and ENRAA 20 NM north of the aircraft
     */
    async function approachLoaded(nm: number) {
        const position = pointFrom(kprc, 0, nm);
        const enrPos = pointFrom(position, 0, 20);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
                transitions: [{name: 'FAFAA', legs: [Leg.IF(fafaa, FixTypeFlags.IAF)]}],
                final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, fafaa, mapaa], position,
            storage: {...savedFlightplan(0, [enraa, apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    // 6-1: with the aircraft beyond 30 NM the switch arms without changing the scale, and a second press disarms
    it('arms and disarms with the approach 40 NM away, the scale staying at 5', async () => {
        const unit = await approachLoaded(40);
        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ENR_LEG);
        await vi.advanceTimersByTimeAsync(6000); // The status messages of the loaded procedure expire
        expect(modeField()).toBe('enr-leg');

        unit.send('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(2000);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        // 5-32: the mode field of the status line
        expect(modeField()).toBe('arm-leg');
        expect(nav.xtkScale).toBe(5);

        unit.send('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(2000);

        expect(nav.navmode).toBe(NavMode.ENR_LEG);
        expect(nav.xtkScale).toBe(5);
    });

    // The sibling of the pin: the setup works, the unit has armed on its own 20 NM from the airport, and the press disarms
    it('has armed on its own 20 NM from the airport and disarms at the press', async () => {
        const unit = await approachLoaded(20);
        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ARM_LEG);

        unit.send('KLN90B_ApprArm_Push');

        expect(nav.navmode).toBe(NavMode.ENR_LEG);
    });

    // #139. 6-1: a press while armed disarms the approach until the next press. B-1: ARM GPS APPROACH is the reminder for
    // an approach that was disarmed inside 30 NM. ModeController.tick calls checkSwitchEnrToArmMode on every tick in ENR, so
    // the unit arms again by itself within a second
    it.fails('stays disarmed after the press 20 NM from the airport (#139)', async () => {
        const unit = await approachLoaded(20);
        const nav = unit.props.memory.navPage;

        unit.send('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(3000);

        expect(nav.navmode).toBe(NavMode.ENR_LEG);
    });
});
