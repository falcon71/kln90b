import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';
import {vor} from '../../harness/navdata/builders';
import {CtrState, NavMode} from '../../../kln90b/data/VolatileMemory';
import {TimeStamp} from '../../../kln90b/data/Time';
import {CenterWaypoint} from '../../../kln90b/pages/right/Ctr1Page';

/** hh:mm of the simulated UTC clock, read from the fake Date and not from the unit */
const utcNow = () => new Date(Date.now()).toISOString().slice(11, 16);

async function cycle(unit: HeadlessUnit, offSeconds = 1) {
    await unit.panel.powerCycle({offSeconds});
    await unit.panel.approveSelfTest();
    await vi.advanceTimersByTimeAsync(2000);
}

describe('CAL 6 time (5-14)', () => {
    // 5-14: the first view of CAL 6 after the power-on shows the system time. The page is rebuilt on every knob step, so
    // what it shows on a later view comes from VolatileMemory
    it('keeps the time of its first view when the page is left and selected again (5-14)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'CAL 6');
        const first = utcNow();
        expect(Screen.read().rows('L')[1]).toBe(` ${first} UTC `);

        await vi.advanceTimersByTimeAsync(5 * 60_000);
        await unit.panel.selectPage('L', 'NAV 2');
        await unit.panel.selectPage('L', 'CAL 6');

        expect(utcNow()).not.toBe(first); // The precondition: the clock has moved on
        expect(Screen.read().rows('L')[1]).toBe(` ${first} UTC `);
    });

    it('shows the system time again at its first view after a power cycle (5-14)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'CAL 6');
        const first = utcNow();
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        await unit.panel.selectPage('L', 'NAV 2');

        await cycle(unit);
        await unit.panel.selectPage('L', 'CAL 6');

        expect(utcNow()).not.toBe(first);
        expect(Screen.read().rows('L')[1]).toBe(` ${utcNow()} UTC `);
    });
});

describe('the mode after a power cycle (3-3)', () => {
    // 3-3: the unit always powers up in ENR-LEG
    it('powers up in ENR-LEG after it was switched off in OBS (3-3)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);

        await cycle(unit);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(Screen.read().status().mode).toMatch(/^enr-leg/);
    });
});

describe('procedures over a power cycle (6-5, 6-23)', () => {
    /** Boots 40 NM north of KPRC and loads the approach of approachWorld() */
    async function approachLoaded() {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        return unit;
    }

    const procedureLegs = (unit: HeadlessUnit) =>
        unit.props.memory.fplPage.flightplans[0].getLegs().filter(l => l.procedure !== undefined).map(l => l.wpt.icaoStruct.ident);

    // 6-5: the approach is deleted when the unit was off for more than 5 minutes. Also the sibling of the #94 pin: the
    // approach was loaded before the cycle
    it('deletes the approach after 6 minutes off (6-5)', async () => {
        const unit = await approachLoaded();
        expect(procedureLegs(unit)).toContain('FAFAA');

        await cycle(unit, 6 * 60);

        expect(procedureLegs(unit)).toEqual([]);
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ENRAA', 'KPRC']);
    });

    // 6-5, 6-23: only more than 5 minutes off deletes the procedures
    it.fails('keeps the approach over a power cycle of 1 minute (6-5) (#94)', async () => {
        const unit = await approachLoaded();
        const before = procedureLegs(unit);

        await cycle(unit, 60);

        expect(procedureLegs(unit)).toEqual(before);
    });
});

describe('VolatileMemory over a power cycle (characterization)', () => {
    it('puts the page state back to its defaults at the power-on (characterization)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        const m = unit.props.memory;
        // Every field reset() lists, set to a value other than its default. nav4VnavWpt is a waypoint ahead in FPL 0, so
        // that Vnav.tick keeps it (it drops an invalid one itself)
        m.altPage.alertEnabled = true;
        m.altPage.alertWarn = 500;
        m.dtPage.flightTimer = 1234;
        m.dtPage.departureTime = TimeStamp.create(0);
        m.triPage.tas = 99;
        m.triPage.windSpeed = 20;
        m.triPage.windDirTrue = 270;
        m.triPage.tri1To = kbbb;
        m.triPage.tri3From = kaaa;
        m.triPage.tri3To = kbbb;
        m.triPage.tri5Fpl = 3;
        m.navPage.nav4VnavWpt = kbbb;
        m.navPage.nav4FromAlt = 5000;
        m.navPage.nav4VnavDist = 3;
        m.navPage.nav4VnavAngle = -3;
        m.calPage.cal6FromTimezone = 4;
        m.calPage.cal6ToTimezone = 5;
        m.calPage.cal7Wpt = abc;
        m.calPage.cal7DateZ = TimeStamp.create(0);
        m.calPage.cal7Timezone = 6;
        m.ctrPage.state = CtrState.DONE;
        m.ctrPage.lastFpl = m.fplPage.flightplans[0];
        m.ctrPage.waypoints = [{idx: 1} as unknown as CenterWaypoint]; // Only its presence is read here
        m.othPage.reserve = 45;
        await vi.advanceTimersByTimeAsync(2000);
        expect(m.navPage.nav4VnavWpt).toBe(kbbb); // The precondition: the unit keeps the seeded VNAV waypoint

        await cycle(unit);

        expect(m.altPage).toEqual({alertEnabled: false, alertWarn: 300});
        expect(m.dtPage.departureTime).toBeNull();
        expect(m.triPage).toMatchObject({tas: 150, windSpeed: 0, windDirTrue: 0, tri1To: null, tri3From: null, tri3To: null, tri5Fpl: 0});
        expect(m.navPage.nav4VnavWpt).toBeNull();
        expect(m.navPage.nav4VnavAngle).toBeNull();
        expect(m.navPage.nav4FromAlt).toBe(0);
        expect(m.navPage.nav4VnavDist).toBe(0);
        expect(m.calPage).toMatchObject({cal6FromTimezone: null, cal6ToTimezone: null, cal7Wpt: null, cal7DateZ: null, cal7Timezone: null});
        expect(m.ctrPage).toEqual({state: CtrState.NO_FPL, lastFpl: null, waypoints: []});
        expect(m.othPage.reserve).toBe(0);
        expect(m.isReady).toBe(true);
    });

    // KLNMagvar.tick sets the pilot's variation to 0 on every tick inside the primary coverage area, so the reset at
    // the power-on is visible only outside it
    it('forgets the pilot-entered magnetic variation outside the coverage area (characterization)', async () => {
        const unit = await bootUnit({position: {lat: 74.5, lon: 8.0}});
        await settle(unit);
        unit.props.memory.navPage.userMagvar = 7;
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.userMagvar).toBe(7); // The precondition: nothing else resets it here

        await cycle(unit);

        expect(unit.props.memory.navPage.userMagvar).toBe(0);
    });

    it('restarts the flight timer at the power-on (characterization)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.props.memory.dtPage.flightTimer = 1234;

        await unit.panel.powerCycle();

        expect(unit.props.memory.dtPage.flightTimer).toBe(0);
    });

    it('keeps the NAV 4 selected altitude and the fuel figures of TRI over a power cycle (characterization)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const m = unit.props.memory;
        m.navPage.nav4SelectedAltitude = 8000;
        m.triPage.ff = 12;
        m.triPage.reserve = 30;

        await cycle(unit);

        expect(m.navPage.nav4SelectedAltitude).toBe(8000);
        expect(m.triPage.ff).toBe(12);
        expect(m.triPage.reserve).toBe(30);
    });
});

describe('the waypoint pages (characterization)', () => {
    const abc = vor('ABC', 47.2, 8.0);
    const abd = vor('ABD', 47.3, 8.1);

    it('keeps the VOR the pilot selected when the page is left and selected again (characterization)', async () => {
        const unit = await bootUnit({facilities: [abc, abd], position: {lat: 47.0, lon: 8.0}});
        await settle(unit);
        await unit.panel.selectPage('R', 'VOR');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ABD');
        await unit.panel.cursor('R');
        expect(Screen.read().rows('R')[0].trim()).toMatch(/^ABD/);

        await unit.panel.selectPage('R', 'NDB');
        await unit.panel.selectPage('R', 'VOR');

        expect(Screen.read().rows('R')[0].trim()).toMatch(/^ABD/);
        expect(unit.props.memory.vorPage.ident).toBe('ABD');
    });

    it('opens the VOR page on the first VOR of the scan list after a power cycle (characterization)', async () => {
        const unit = await bootUnit({facilities: [abc, abd], position: {lat: 47.0, lon: 8.0}});
        await settle(unit);
        await unit.panel.selectPage('R', 'VOR');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ABD');
        await unit.panel.cursor('R');
        expect(unit.props.memory.vorPage.ident).toBe('ABD');

        await cycle(unit);

        expect(unit.props.memory.vorPage.ident).toBe('ABC');
    });
});
