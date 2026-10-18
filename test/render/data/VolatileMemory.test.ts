import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {APR_ARM_SWITCH, panelXml} from '../../harness/panelXml';
import {savedFlightplan} from '../../harness/storage';
import {fplIdents} from '../../harness/readers';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {Screen} from '../../harness/render/screen';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {AirportFacility, Facility} from '@microsoft/msfs-sdk';
import {Leg, star, withProcedures} from '../../harness/navdata/procedures';
import {pointFrom} from '../../harness/flight/geo';
import {CtrState, NavMode} from '../../../kln90b/data/VolatileMemory';
import {TimeStamp} from '../../../kln90b/data/Time';
import {CenterWaypoint} from '../../../kln90b/pages/right/Ctr1Page';
import {FplPage} from '../../../kln90b/pages/left/FplPage';

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

        await vi.advanceTimersByTimeAsync(5 * 60_000); // Five minutes: the hh:mm of the page moves on
        await unit.panel.selectPage('L', 'NAV 2');
        await unit.panel.selectPage('L', 'CAL 6');

        expect(utcNow()).not.toBe(first); // The precondition: the clock has moved on
        expect(Screen.read().rows('L')[1]).toBe(` ${first} UTC `);
    }, 20_000); // Five simulated minutes with every tick: the 5 s default times out when the machine is busy

    it('shows the system time again at its first view after a power cycle (5-14)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'CAL 6');
        const first = utcNow();
        await vi.advanceTimersByTimeAsync(5 * 60_000); // As above: the hh:mm moves on before the cycle
        await unit.panel.selectPage('L', 'NAV 2');

        await cycle(unit);
        await unit.panel.selectPage('L', 'CAL 6');

        expect(utcNow()).not.toBe(first);
        expect(Screen.read().rows('L')[1]).toBe(` ${utcNow()} UTC `);
    }, 20_000); // Five simulated minutes with every tick: the 5 s default times out when the machine is busy
});

describe('the mode after a power cycle (3-3)', () => {
    // 3-3: the unit always powers up in ENR-LEG
    it('powers up in ENR-LEG after it was switched off in OBS (3-3)', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);

        await cycle(unit);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(Screen.read().status().mode).toMatch(/^enr-leg/);
    });
});

/** Boots `nm` NM north of KPRC and loads the approach of approachWorld() */
async function approachLoadedAt(nm: number) {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(nm),
        panelXml: panelXml(APR_ARM_SWITCH),
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    return unit;
}

describe('procedures over a power cycle (6-5, 6-23)', () => {
    const approachLoaded = () => approachLoadedAt(40);

    const procedureLegs = (unit: HeadlessUnit) =>
        unit.props.memory.fplPage.flightplans[0].getLegs().filter(l => l.procedure !== undefined).map(l => l.wpt.icaoStruct.ident);

    // 6-5: the approach is deleted when the unit was off for more than 5 minutes
    it('deletes the approach after 6 minutes off (6-5)', async () => {
        const unit = await approachLoaded();
        expect(procedureLegs(unit)).toContain('FAFAA');

        await cycle(unit, 6 * 60);

        expect(procedureLegs(unit)).toEqual([]);
        expect(fplIdents(unit)).toEqual(['ENRAA', 'KPRC']);
    });

    // 6-5, 6-23: only more than 5 minutes off deletes the procedures
    it('keeps the approach over a power cycle of 1 minute (6-5) (#94)', async () => {
        const unit = await approachLoaded();
        const before = procedureLegs(unit);
        expect(before).toContain('FAFAA'); // the precondition: there is something to keep

        await cycle(unit, 60);

        expect(procedureLegs(unit)).toEqual(before);
        expect(fplIdents(unit)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
    });

    // The limit is "more than 5 minutes" (6-5): just under it keeps the approach and just over it deletes it
    it('keeps the approach just under 5 minutes off (6-5) (#94)', async () => {
        const unit = await approachLoaded();
        const before = procedureLegs(unit);
        expect(before).toContain('FAFAA'); // the precondition: there is something to keep

        await cycle(unit, 299);

        expect(procedureLegs(unit)).toEqual(before);
    }, 20_000);

    it('deletes the approach just over 5 minutes off (6-5) (#94)', async () => {
        const unit = await approachLoaded();
        expect(procedureLegs(unit)).toContain('FAFAA');

        await cycle(unit, 301);

        expect(procedureLegs(unit)).toEqual([]);
        expect(fplIdents(unit)).toEqual(['ENRAA', 'KPRC']);
    }, 20_000);

    // 6-5: "more than 5 minutes", so exactly 5 minutes keeps the procedures. The time off reaches the memory as
    // timeSincePowerChange of the power event (PowerButton); the whole-second cycles above cannot hit the millisecond
    it('keeps the approach at exactly 5 minutes off and deletes it a millisecond later (6-5) (#94)', async () => {
        const unit = await approachLoaded();
        const before = procedureLegs(unit);

        unit.props.memory.reset({isPowered: true, timeSincePowerChange: 300_000});
        expect(procedureLegs(unit)).toEqual(before);

        unit.props.memory.reset({isPowered: true, timeSincePowerChange: 300_001});
        expect(procedureLegs(unit)).toEqual([]);
    });

    // A power-off does not delete anything: the procedures go, if at all, at the next power-on
    it('keeps the approach while the unit is off (6-5) (#94)', async () => {
        const unit = await approachLoaded();
        const before = procedureLegs(unit);

        unit.props.memory.reset({isPowered: false, timeSincePowerChange: 10 * 60_000});

        expect(procedureLegs(unit)).toEqual(before);
    });

    // 6-23: the same rule holds for a STAR (and a SID, which the same call removes)
    it('keeps a STAR and the approach after 1 minute off and deletes both after 6 minutes (6-5, 6-23) (#94)', async () => {
        const w = approachWorld();
        const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
        const straa = intersection('STRAA', east(30).lat, east(30).lon);
        const strab = intersection('STRAB', east(12).lat, east(12).lon);
        const kprc = withProcedures(w.kprc, {approaches: [...w.kprc.approaches], arrivals: [star('ARR1', {common: [Leg.IF(straa), Leg.TF(strab)]})]});
        const unit = await bootUnit({
            facilities: [kprc, w.enraa, w.iafaa, w.ifaaa, w.fafaa, w.sdfaa, w.mapaa, straa, strab], position: w.north(40),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [w.enraa, kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await unit.panel.loadProcedure('APT 7');
        const before = procedureLegs(unit);
        expect(before).toEqual(['STRAA', 'STRAB', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA']); // the precondition

        await cycle(unit, 60);
        expect(procedureLegs(unit)).toEqual(before);

        await cycle(unit, 6 * 60);
        expect(procedureLegs(unit)).toEqual([]);
        expect(fplIdents(unit)).toEqual(['ENRAA', 'KPRC']);
    }, 20_000);
});

describe('VolatileMemory over a power cycle (characterization)', () => {
    it('puts the page state back to its defaults at the power-on (characterization)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootOnStandardRoute();
        const m = unit.props.memory;
        // Every field reset() lists, set to a value other than its default. nav4VnavWpt is a waypoint ahead in FPL 0, so
        // that Vnav.tick keeps it (it drops an invalid one itself). The ALT page's ALERT and WARN are user settings since
        // #259, which reset() does not touch (the test below)
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
        m.calPage.cal7Date = TimeStamp.create(0);
        m.calPage.cal7Timezone = 6;
        m.ctrPage.state = CtrState.DONE;
        m.ctrPage.lastFpl = m.fplPage.flightplans[0];
        m.ctrPage.lastFplPage = {} as unknown as FplPage; // Only its presence is read here
        m.ctrPage.waypoints = [{idx: 1} as unknown as CenterWaypoint]; // Only its presence is read here
        m.ctrPage.computedLegs = [];
        m.othPage.reserve = 45;
        await vi.advanceTimersByTimeAsync(2000);
        expect(m.navPage.nav4VnavWpt).toBe(kbbb); // The precondition: the unit keeps the seeded VNAV waypoint

        await cycle(unit);

        expect(m.dtPage.departureTime).toBeNull();
        expect(m.triPage).toMatchObject({tas: 150, windSpeed: 0, windDirTrue: 0, tri1To: null, tri3From: null, tri3To: null, tri5Fpl: 0});
        expect(m.navPage.nav4VnavWpt).toBeNull();
        expect(m.navPage.nav4VnavAngle).toBeNull();
        expect(m.navPage.nav4FromAlt).toBe(0);
        expect(m.navPage.nav4VnavDist).toBe(0);
        expect(m.calPage).toMatchObject({cal6FromTimezone: null, cal6ToTimezone: null, cal7Wpt: null, cal7Date: null, cal7Timezone: null});
        expect(m.ctrPage).toEqual({state: CtrState.NO_FPL, lastFpl: null, lastFplPage: null, waypoints: [], computedLegs: null});
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

// 3-55 step 4: the pilot normally enters the warn altitude only the first time altitude alerting is used, so the unit
// keeps it. Since #259 it is the user setting altAlertWarn, which the power-on leaves alone; the ALT page tests show it
describe('the ALT warn altitude over a power cycle', () => {
    it('keeps the ALT warn altitude over a power cycle (3-55, #259)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const warn = unit.props.userSettings.getSetting('altAlertWarn');
        warn.set(500);
        await vi.advanceTimersByTimeAsync(2000);
        expect(warn.get()).toBe(500); // The precondition: nothing else resets it

        await cycle(unit);

        expect(warn.get()).toBe(500);
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

describe('the approach disarm over a power cycle (characterization)', () => {
    // The Pilot's Guide does not say what a power cycle does to a disarm. A power-off of under 5 minutes keeps the
    // approach in FPL 0 (6-5) and the unit powers up in ENR-LEG (3-3), so the unit arms by itself again inside 30 NM (#139)
    it('arms by itself again after a power cycle of 1 minute that followed the pilot disarm (characterization, #139)', async () => {
        const unit = await approachLoadedAt(20);
        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ARM_LEG); // Precondition: armed by itself
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(3000);
        expect(nav.navmode).toBe(NavMode.ENR_LEG); // Precondition: disarmed, and it holds
        expect(fplIdents(unit)).toContain('FAFAA'); // Precondition: the approach is still in the plan

        await cycle(unit, 60);
        await vi.advanceTimersByTimeAsync(3000);

        expect(fplIdents(unit)).toContain('FAFAA');
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
    });
});

describe('the last match of the ident entry after a power cycle (characterization, #202)', () => {
    // A rule of the state, not a page of the Pilot's Guide: the last match is volatile and a power cycle forgets it
    it('forgets the last match of every waypoint page', async () => {
        const unit = await bootUnit({facilities: [airport('KCCC', 47.0, 8.0)], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'APT 1');
        const kccc = unit.props.memory.aptPage.facility as AirportFacility;
        const memory = unit.props.memory;
        for (const page of [memory.aptPage, memory.vorPage, memory.ndbPage, memory.intPage, memory.supPage]) {
            (page as { lastMatch: Facility | null }).lastMatch = kccc;
        }

        await cycle(unit);

        expect([memory.aptPage, memory.vorPage, memory.ndbPage, memory.intPage, memory.supPage].map(page => page.lastMatch)).toEqual([null, null, null, null, null]);
    });
});
