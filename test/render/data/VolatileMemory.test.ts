import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnit, HeadlessUnit, NEAREST_SEARCH_WAIT_MS, settle} from '../../harness/boot';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {APR_ARM_SWITCH, panelXml} from '../../harness/panelXml';
import {savedFlightplan, savedUserWaypoints, storedSetting} from '../../harness/storage';
import {efbRoute} from '../../harness/platform';
import {setTriFigures} from '../../harness/triSettings';
import {activeIdent, fplIdents} from '../../harness/readers';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {Screen} from '../../harness/render/screen';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {AirportFacility, EventBus, Facility, FlightPlanner, FlightPlannerOptions, ICAO, UserFacility} from '@microsoft/msfs-sdk';
import {isNearestWpt, unpackFacility} from '../../../kln90b/data/navdata/NearestList';
import {Leg, runwayFix, star, withProcedures} from '../../harness/navdata/procedures';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {pointFrom} from '../../harness/flight/geo';
import {CtrState, NavMode, TriPageState, VolatileMemory, WaypointPageState} from '../../../kln90b/data/VolatileMemory';
import {PowerEvent} from '../../../kln90b/PowerSupply';
import {TimeStamp} from '../../../kln90b/data/Time';
import {CenterWaypoint} from '../../../kln90b/pages/right/Ctr1Page';
import {FplPage} from '../../../kln90b/pages/left/FplPage';
import {TurnPlan} from '../../../kln90b/data/flightplan/ActiveWaypoint';
import {SavedWaypoint} from '../../../kln90b/data/SavedWaypoint';
import type {Message} from '../../../kln90b/data/MessageHandler';

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

// The 90B guide is silent about a Direct To at the power-on (3-3 only says ENR-LEG, 3-8 the page of the last active
// waypoint). The KLN 89 trainer dropped it at every relaunch and came back on an FPL 0 leg (checked in the KLN 89 trainer,
// 2026-10-25); it does not model the time off. In the AVsoftech KLN 90B trainer a quick off and on kept the Direct To and a
// restart of the program dropped it (the maintainer, 2026-10-25), which the maintainer took as the 5 minutes of 6-5
describe('the Direct To over a power cycle (#422)', () => {
    const kaaa = airport('KAAA', 47.0, 8.0);
    const kbbb = airport('KBBB', 47.4, 8.0);
    const kccc = airport('KCCC', 47.2, 8.3);

    /** On the leg KAAA-KBBB of FPL 0, then D-> KCCC, which no flight plan holds */
    async function directToOutsideFpl0() {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb, kccc], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await settle(unit);
        await unit.panel.directTo('KCCC');
        return unit;
    }

    it('the Direct To to KCCC is active before the power-off and FPL 0 is kept over the power cycle (the precondition, #422)', async () => {
        const unit = await directToOutsideFpl0();
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KCCC');
        expect(aw.isDctNavigation()).toBe(true);

        await cycle(unit, 600);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
    });

    it('drops the Direct To after a power-off of more than 5 minutes and comes back on the leg to KBBB (KLN 89 trainer 2026-10-25, #422)', async () => {
        const unit = await directToOutsideFpl0();
        const aw = unit.props.memory.navPage.activeWaypoint;

        await cycle(unit, 600);

        expect(aw.isDctNavigation()).toBe(false);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
    });

    it('keeps the Direct To over a power-off of 5 minutes or less (6-5, AVsoftech KLN 90B trainer 2026-10-25, #422)', async () => {
        const unit = await directToOutsideFpl0();
        const aw = unit.props.memory.navPage.activeWaypoint;

        await cycle(unit, 60);

        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KCCC');
    });

    // The calculation tick on the data base page activates the leg to KBBB, which writes the last active waypoint, before
    // ACKNOWLEDGE? chooses the first page
    it('opens on the page of the dropped Direct To target although the leg to KBBB is already active (3-8, KLN 89 trainer 2026-10-25, #422)', async () => {
        const unit = await directToOutsideFpl0();
        const until = async (text: string) => {
            for (let i = 0; i < 30 && !Screen.read().text().includes(text); i++) {
                await vi.advanceTimersByTimeAsync(1000);
            }
            expect(Screen.read().text()).toContain(text);
        };

        await unit.panel.powerCycle({offSeconds: 600});
        await until('APPROVE?');
        await unit.panel.cursorTo('R', 'APPROVE?');
        await unit.panel.ent();
        await until('ACKNOWLEDGE?');
        await vi.advanceTimersByTimeAsync(5000);
        expect(activeIdent(unit)).toBe('KBBB'); // Precondition: the new leg is active before the first page is chosen
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        const screen = Screen.read();
        expect(screen.status().right).toBe('APT 4');
        expect(screen.rows('R')[0].slice(1).split(' ')[0]).toBe('KCCC');
    });

    it('drops a Direct To to an approach waypoint with the approach after a power-off of more than 5 minutes (6-5, #422)', async () => {
        const unit = await approachLoadedAt(40);
        const aw = unit.props.memory.navPage.activeWaypoint;
        await unit.panel.directTo('FAFAA');
        expect(aw.isDctNavigation()).toBe(true); // Precondition
        expect(activeIdent(unit)).toBe('FAFAA');

        await cycle(unit, 600);

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['ENRAA', 'KPRC']);
        expect(aw.isDctNavigation()).toBe(false);
        expect(activeIdent(unit)).toBe('KPRC');
    });

    it('comes up flagged when FPL 0 has fewer than two waypoints after a power-off of more than 5 minutes (AVsoftech KLN 90B trainer 2026-10-25, #422)', async () => {
        const unit = await bootUnit({facilities: [kccc], position: {lat: 47.1, lon: 8.0}});
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        await unit.panel.directTo('KCCC');
        expect(aw.isDctNavigation()).toBe(true); // Precondition

        await cycle(unit, 600);

        expect(aw.getActiveWpt()).toBeNull();
        expect(aw.isDctNavigation()).toBe(false);
    });

    // Removing the procedures publishes the change, and the flight planner mirror then activates a new leg inside the
    // reset, so the start page must be copied before the procedures go
    it('opens on the page of the approach waypoint that was active although the power-on removed the approach (3-8, 6-5, #422)', async () => {
        const unit = await approachLoadedAt(40);
        expect(activeIdent(unit)).toBe('IAFAA'); // Precondition: the plan leg to the IAF is active
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(false);

        await cycle(unit, 600);

        const screen = Screen.read();
        expect(screen.status().right).toBe('INT');
        expect(screen.rows('R')[0].slice(1).split(' ')[0]).toBe('IAFAA');
    });

    // The SDK flight planner "kln90b" is part of the contract with aircraft: it leaves its Direct To plan at the power-on,
    // not only once the GPS has a fix and a leg is activated
    it('mirrors the dropped Direct To in the SDK flight planner at the power-on (#422)', async () => {
        const unit = await directToOutsideFpl0();
        // The SDK keeps one planner per id and ignores the options of a later call, so this is the unit's own planner
        const planner = FlightPlanner.getPlanner('kln90b', unit.core.bus, {} as FlightPlannerOptions);
        expect(planner.activePlanIndex).toBe(1); // Precondition: the planner flies its Direct To plan

        await unit.panel.powerCycle({offSeconds: 600});

        expect(planner.activePlanIndex).toBe(0);
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

// A plan leg on the approach is active when the unit is turned off, and the aircraft flies on while it is off. The
// power-on of more than 5 minutes removes the approach, and the unit must then take the leg closest to where the aircraft
// is now, as it does for a dropped Direct To (#422) and after a sim restart
describe('the active leg after a power-on that removed its approach (#423)', () => {
    /** FPL 0 ENRZZ (150 NM north), ENRAA (60 NM north), the approach, KPRC; the leg to IAFAA active 16 NM north. Then off
     * for 600 s while the aircraft moves to 110 NM north, on the leg ENRZZ - ENRAA, and on again */
    async function movedWhileOff() {
        const w = approachWorld();
        const enrzz = intersection('ENRZZ', w.north(150).lat, w.north(150).lon);
        const unit = await bootUnit({
            facilities: [...w.facilities, enrzz], position: w.north(16),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [enrzz, w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        const before = activeIdent(unit);
        await unit.panel.powerOff();
        unit.env.sim.set('PLANE LATITUDE', 'degrees', w.north(110).lat);
        await vi.advanceTimersByTimeAsync(600_000);
        await unit.panel.powerOn();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);
        return {unit, before};
    }

    it('the leg to IAFAA is active before the power-off, and the power-on removes the approach (the precondition, #423)', async () => {
        const {unit, before} = await movedWhileOff();
        expect(before).toBe('IAFAA');
        expect(fplIdents(unit)).toEqual(['ENRZZ', 'ENRAA', 'KPRC']);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
    });

    it.fails('comes back on the leg closest to the position after the power-on, ENRZZ - ENRAA (#423)', async () => {
        const {unit} = await movedWhileOff();
        expect(activeIdent(unit)).toBe('ENRAA');
    });
});

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
    // timeSincePowerChange of the power event (PowerSupply); the whole-second cycles above cannot hit the millisecond
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

describe('VolatileMemory over a power cycle', () => {
    // The unit powers up in ENR-LEG (3-3); the timers, the CAL 6 and CAL 7 first views and the CTR computation start over
    // (4-13, 5-14, 5-15, 5-22, 5-26). The KLN 89 trainer showed the mode back in Leg, the VNAV waypoint and offset reset, the
    // CAL 3 alarm cleared and its elapsed timer restarted after a relaunch; the CTR reset is the AVsoftech trainer's (unreliable),
    // and the record has no trainer evidence for the CAL 6 and CAL 7 fields (docs/kln89-trainer-record.md, 2026-10-24)
    it('puts the page state back to its defaults at the power-on (3-3, 4-13, 5-14, 5-15, 5-26, trainer record) (#192)', async () => {
        const {abc, kbbb} = standardRoute();
        const unit = await bootOnStandardRoute();
        const m = unit.props.memory;
        // Every field reset() lists, set to a value other than its default. nav4VnavWpt is a waypoint ahead in FPL 0, so
        // that Vnav.tick keeps it (it drops an invalid one itself). The ALT page's ALERT and WARN are user settings since
        // #259, and the TRI and OTH figures and the waypoints of the TRI and waypoint pages since #192: reset() does not
        // forget those (the tests below)
        m.dtPage.flightTimer = 1234;
        m.dtPage.departureTime = TimeStamp.create(0);
        m.navPage.nav4VnavWpt = kbbb;
        m.navPage.nav4FromAlt = 5000;
        m.navPage.nav4VnavDist = 3;
        m.navPage.nav4VnavAngle = -3;
        m.navPage.obsMag = 123;
        m.navPage.superNav5ActualRange = 100;
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
        await vi.advanceTimersByTimeAsync(2000);
        expect(m.navPage.nav4VnavWpt).toBe(kbbb); // The precondition: the unit keeps the seeded VNAV waypoint

        await cycle(unit);

        expect(m.dtPage.departureTime).toBeNull();
        expect(m.navPage.nav4VnavWpt).toBeNull();
        expect(m.navPage.nav4VnavAngle).toBeNull();
        expect(m.navPage.nav4FromAlt).toBe(0);
        expect(m.navPage.nav4VnavDist).toBe(0);
        expect(m.navPage.obsMag).toBe(0);
        expect(m.navPage.superNav5ActualRange).toBe(40);
        expect(m.calPage).toMatchObject({cal6FromTimezone: null, cal6ToTimezone: null, cal7Wpt: null, cal7Date: null, cal7Timezone: null});
        expect(m.ctrPage).toEqual({state: CtrState.NO_FPL, lastFpl: null, lastFplPage: null, waypoints: [], computedLegs: null});
        expect(m.isReady).toBe(true);
    });

    // The KLN 89 trainer forgot the NAV 4 selected altitude at a relaunch (two entries, 2026-10-24); the AVsoftech trainer
    // kept it, but it is unreliable. Neither Pilot's Guide says. The reset does not depend on the time off
    it('forgets the NAV 4 selected altitude at a power-on (KLN 89 trainer 2026-10-24) (#192)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.props.memory.navPage.nav4SelectedAltitude = 12300;
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.nav4SelectedAltitude).toBe(12300); // The precondition: nothing else resets it

        await cycle(unit);

        expect(unit.props.memory.navPage.nav4SelectedAltitude).toBe(0);
    });

    // KLNMagvar.tick sets the pilot's variation to 0 on every tick inside the primary coverage area, so it is visible only
    // outside it (lat 74.5). The KLN 89 guide keeps the entered variation over a power-off of up to 5 minutes (4-46, 4-47);
    // the 90B guide is silent (5-44)
    it('keeps the pilot-entered magnetic variation over a power-off of 1 minute (KLN 89 guide 4-47) (#192)', async () => {
        const unit = await bootUnit({position: {lat: 74.5, lon: 8.0}});
        await settle(unit);
        unit.props.memory.navPage.userMagvar = 7;
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.userMagvar).toBe(7); // The precondition: nothing else resets it here

        await cycle(unit, 60);

        expect(unit.props.memory.navPage.userMagvar).toBe(7);
    });

    it('forgets the pilot-entered magnetic variation after more than 5 minutes off (KLN 89 guide 4-47) (#192)', async () => {
        const unit = await bootUnit({position: {lat: 74.5, lon: 8.0}});
        await settle(unit);
        unit.props.memory.navPage.userMagvar = 7;
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.userMagvar).toBe(7); // The precondition: nothing else resets it here

        await cycle(unit, 6 * 60);

        expect(unit.props.memory.navPage.userMagvar).toBe(0);
    }, 20_000);

    // The limit is "more than 5 minutes" (the same rule as 6-5): exactly 300 s off keeps the variation, a millisecond more
    // forgets it. The knob acts at once, so the off time the power event reports is what the test advances to; the press
    // of the harness takes simulated time too, which the helper subtracts. The reported time is asserted
    async function variationAfterPowerOffFor(offMs: number) {
        const unit = await bootUnit({position: {lat: 74.5, lon: 8.0}});
        await settle(unit);
        unit.props.memory.navPage.userMagvar = 7;
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.userMagvar).toBe(7); // The precondition: nothing else resets it here
        let offAt = 0;
        const reported: number[] = [];
        unit.props.bus.getSubscriber<PowerEvent>().on('powerEvent').handle(e => {
            if (e.isPowered) {
                // The bus replays the last event (the boot) to a new subscriber: only a power-on after the power-off counts
                if (offAt !== 0) {
                    reported.push(e.timeSincePowerChange);
                }
            } else {
                offAt = Date.now();
            }
        });

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(offMs - (Date.now() - offAt));
        await unit.panel.powerOn();

        expect(reported).toEqual([offMs]); // The precondition: the unit was off for exactly this long
        return unit.props.memory.navPage.userMagvar;
    }

    it('keeps the pilot-entered magnetic variation at exactly 5 minutes off (KLN 89 guide 4-47) (#192)', async () => {
        expect(await variationAfterPowerOffFor(300_000)).toBe(7);
    });

    it('forgets the pilot-entered magnetic variation a millisecond over 5 minutes off (KLN 89 guide 4-47) (#192)', async () => {
        expect(await variationAfterPowerOffFor(300_001)).toBe(0);
    });

    // 4-13: the flight timer starts at the power-on; the KLN 89 trainer restarted its similar CAL 3 elapsed timer
    // (docs/kln89-trainer-record.md, 2026-10-24)
    it('restarts the flight timer at the power-on (4-13, trainer record) (#192)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.props.memory.dtPage.flightTimer = 1234;

        await unit.panel.powerCycle();

        expect(unit.props.memory.dtPage.flightTimer).toBe(0);
    });

    // Both trainers kept the TRI fuel flow and reserve over a power cycle (2026-10-24); the AVsoftech trainer (unreliable) kept
    // the TAS, wind and the TRI 5 plan number as well;
    // the OTH reserve follows the TRI reserve by analogy. They are user settings (#192), which survive a sim restart too
    it('keeps the TRI and OTH figures over a power cycle (trainer record 2026-10-24, #192)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const figures = {tas: 170, windDirTrue: 20, windSpeed: 30, ff: 12, reserve: 30, tri5Fpl: 3, othReserve: 45};
        setTriFigures(unit, figures);

        await cycle(unit, 6 * 60);

        const settings = unit.props.userSettings;
        expect({
            tas: settings.getSetting('triTas').get(),
            windDirTrue: settings.getSetting('triWindDirTrue').get(),
            windSpeed: settings.getSetting('triWindSpeed').get(),
            ff: settings.getSetting('triFuelFlow').get(),
            reserve: settings.getSetting('triReserve').get(),
            tri5Fpl: settings.getSetting('tri5Fpl').get(),
            othReserve: settings.getSetting('othReserve').get(),
        }).toEqual(figures);
    }, 20_000);
});

// A turn started before the power-off is not kept: the turn plan of the active waypoint and the flag that its own turn
// has started are cleared with the turn stack (#375). The power-on is VolatileMemory.reset alone, without the ticks of a
// whole power cycle: the calculations during the self-test clear the turn stack as well, so a full cycle would not show
// what reset does
describe('the turn state over a power cycle (#375)', () => {
    it('a power cycle clears the turn plan and the own-turn flag', async () => {
        const unit = await bootOnStandardRoute();
        const aw = unit.props.memory.navPage.activeWaypoint;
        aw.ownTurnStarted = true;
        aw.turnPlan = TurnPlan.AT_LEAD;

        unit.props.memory.reset({isPowered: true, timeSincePowerChange: 1000});

        expect(aw.ownTurnStarted).toBe(false);
        expect(aw.turnPlan).toBeNull();
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('ABC'); // The precondition: the active waypoint did not change
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

    // The KLN 89 trainer kept the last shown waypoint of every waypoint page type over relaunches (2026-10-24,
    // docs/kln89-trainer-record.md); the waypoint is the user setting vorPageWpt (#192)
    it('opens the VOR page on the last VOR shown after a power cycle (trainer 2026-10-24) (#192)', async () => {
        const unit = await bootUnit({facilities: [abc, abd], position: {lat: 47.0, lon: 8.0}});
        await settle(unit);
        await unit.panel.selectPage('R', 'VOR');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ABD');
        await unit.panel.cursor('R');
        expect(unit.props.memory.vorPage.ident).toBe('ABD');

        await cycle(unit);

        expect(unit.props.memory.vorPage.ident).toBe('ABD');
        expect(isNearestWpt(unit.props.memory.vorPage.facility)).toBe(false);
        expect(unpackFacility(unit.props.memory.vorPage.facility)?.icaoStruct.ident).toBe('ABD');
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

/**
 * Two waypoints of every waypoint page type; the first of each sorts before the second, so a page that falls back opens
 * on the first (the scan lists are in ident order, fixtures.ts). The user waypoints of the SUP page are saved user data.
 * Fresh objects on every call
 */
function waypointWorld() {
    return {
        facilities: [
            airport('KAAA', 47.0, 8.0), airport('KAAB', 47.1, 8.1),
            vor('ABC', 47.2, 8.0), vor('ABD', 47.3, 8.1),
            ndb('NAA', 47.2, 8.2), ndb('NAB', 47.3, 8.3),
            intersection('INTAA', 47.2, 8.4), intersection('INTAB', 47.3, 8.5),
        ],
        storage: savedUserWaypoints([
            {kind: 'sup', ident: 'USUA', lat: 47.2, lon: 8.6},
            {kind: 'sup', ident: 'USUB', lat: 47.3, lon: 8.7},
        ]),
    };
}

/** The setting value of a waypoint: its ICAO string (V2) */
const savedIcao = (type: string, region: string, ident: string) => ICAO.valueToStringV2(ICAO.value(type, region, '', ident));
const savedOf = (f: Facility) => ICAO.valueToStringV2(f.icaoStruct);
/** The activeWaypoint setting: its ICAO string (V2, #415) */
const activeIcao = (type: string, region: string, ident: string) => ICAO.valueToStringV2(ICAO.value(type, region, '', ident));

type WaypointPageKey = 'aptPage' | 'vorPage' | 'ndbPage' | 'intPage' | 'supPage';

interface WaypointPageCase {
    name: string;
    /** The page to select with FrontPanel.selectPage */
    select: string;
    key: string;
    memory: WaypointPageKey;
    first: string;
    second: string;
    /** The ICAO string (V2) of the second */
    secondIcao: string;
    /** The active waypoint at the boot: of another type, so that the start-up (3-8) leaves the page alone */
    activeIcao: string;
}

const AIRPORT_ACTIVE = activeIcao('A', '', 'KAAA');
const VOR_ACTIVE = activeIcao('V', 'K1', 'ABC');

const WAYPOINT_PAGES: WaypointPageCase[] = [
    {name: 'APT', select: 'APT 1', key: 'aptPageWpt', memory: 'aptPage', first: 'KAAA', second: 'KAAB', secondIcao: savedIcao('A', '', 'KAAB'), activeIcao: VOR_ACTIVE},
    {name: 'VOR', select: 'VOR', key: 'vorPageWpt', memory: 'vorPage', first: 'ABC', second: 'ABD', secondIcao: savedIcao('V', 'K1', 'ABD'), activeIcao: AIRPORT_ACTIVE},
    {name: 'NDB', select: 'NDB', key: 'ndbPageWpt', memory: 'ndbPage', first: 'NAA', second: 'NAB', secondIcao: savedIcao('N', 'K1', 'NAB'), activeIcao: AIRPORT_ACTIVE},
    {name: 'INT', select: 'INT', key: 'intPageWpt', memory: 'intPage', first: 'INTAA', second: 'INTAB', secondIcao: savedIcao('W', 'K1', 'INTAB'), activeIcao: AIRPORT_ACTIVE},
    {name: 'SUP', select: 'SUP', key: 'supPageWpt', memory: 'supPage', first: 'USUA', second: 'USUB', secondIcao: savedIcao('U', 'XX', 'USUB'), activeIcao: AIRPORT_ACTIVE},
];

/** The scan list of each waypoint page */
const SCAN_LISTS = {
    aptPage: 'aptScanlist', vorPage: 'vorScanlist', ndbPage: 'ndbScanlist', intPage: 'intScanlist', supPage: 'supScanlist',
} as const;

/** The ident of the waypoint a page state holds, unwrapped from a nearest rank */
const heldIdent = (unit: HeadlessUnit, page: WaypointPageKey) =>
    unpackFacility<Facility>(unit.props.memory[page].facility)?.icaoStruct.ident;

// The KLN 89 trainer kept the last shown waypoint of every waypoint page type over relaunches of every length, however it
// was reached (2026-10-24, round 2, docs/kln89-trainer-record.md). Only user settings survive a sim restart, so each page
// type keeps it in a setting (#192); a power-on resolves it again from there
describe('the waypoint pages over a power cycle and a sim restart (#192)', () => {
    it.each(WAYPOINT_PAGES)('saves the waypoint the $name page shows (#192)', async (c) => {
        const w = waypointWorld();
        const unit = await bootUnit({facilities: w.facilities, storage: w.storage, position: {lat: 47.0, lon: 8.0}});
        await settle(unit);
        await unit.panel.selectPage('R', c.select);
        expect(Screen.read().rows('R')[0].trim().startsWith(c.first)).toBe(true); // Precondition: the first of the scan list

        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        expect(Screen.read().rows('R')[0].trim().startsWith(c.second)).toBe(true); // Precondition: the scan reached it
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, c.key)).toBe(c.secondIcao);
    });

    it.each(WAYPOINT_PAGES)('shows the saved $name at a new boot (trainer 2026-10-24) (#192)', async (c) => {
        const w = waypointWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: 47.0, lon: 8.0},
            storage: {...w.storage, [c.key]: c.secondIcao, activeWaypoint: c.activeIcao},
        });
        await settle(unit);

        await unit.panel.selectPage('R', c.select);

        expect(Screen.read().rows('R')[0].trim().startsWith(c.second)).toBe(true);
        expect(heldIdent(unit, c.memory)).toBe(c.second);
        expect(unit.props.memory[c.memory].ident).toBe(c.second);
    });

    // Round 2: a page on a nearest rank came back as the same waypoint, plain, without the nearest marker. KBBB is the
    // nearest airport (MSG then ENT shows it as nr 1, 3-23), the scan to the right shows KCCC as nr 2
    it('restores a waypoint shown at a nearest rank as the plain waypoint (trainer 2026-10-24) (#192)', async () => {
        const unit = await bootUnit({
            facilities: [airport('KBBB', 47.2, 12.0), airport('KCCC', 47.6, 12.0), airport('KDDD', 48.0, 12.0)],
            position: {lat: 47.19, lon: 12.0},
        });
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.msg();
        await unit.panel.ent();
        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        expect(Screen.read().rows('R')[0]).toBe(' KCCC  nr 2'); // Precondition
        expect(isNearestWpt(unit.props.memory.aptPage.facility)).toBe(true); // Precondition: the state holds the rank

        await cycle(unit, 6 * 60);

        expect(isNearestWpt(unit.props.memory.aptPage.facility)).toBe(false);
        expect(heldIdent(unit, 'aptPage')).toBe('KCCC');
        await unit.panel.selectPage('R', 'APT 1');
        expect(Screen.read().rows('R')[0]).toBe(' KCCC      ');
    });

    // A page that restores its saved waypoint still has its scan list built at the power-on: the scan to the right past
    // the last nearest rank goes on with the first waypoint of the scan list (3-23, 3-24)
    it('scans past the last nearest rank to the first of the scan list when the page restored its waypoint (3-24) (#192)', async () => {
        const unit = await bootUnit({
            facilities: [airport('KBBB', 47.2, 12.0), airport('KCCC', 47.6, 12.0)],
            position: {lat: 47.19, lon: 12.0},
            storage: {aptPageWpt: savedIcao('A', '', 'KCCC')},
        });
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        expect(heldIdent(unit, 'aptPage')).toBe('KCCC'); // Precondition: the page restored its saved waypoint
        await unit.panel.msg();
        await unit.panel.ent();
        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        expect(Screen.read().rows('R')[0]).toBe(' KCCC  nr 2'); // Precondition: the last nearest rank

        await unit.panel.inner('R', 1);

        expect(Screen.read().rows('R')[0]).toBe(' KBBB      ');
    });

    // The same for every page type, booted without saved user waypoints: loading them syncs the repository, and the sync
    // rebuilds every scan list. That leaves out SUP, whose waypoints are the saved user waypoints
    it.each(WAYPOINT_PAGES.filter(c => c.name !== 'SUP'))('builds the $name scan list when the page restored its waypoint (#192)', async (c) => {
        const unit = await bootUnit({
            facilities: waypointWorld().facilities, position: {lat: 47.0, lon: 8.0},
            storage: {[c.key]: c.secondIcao, activeWaypoint: c.activeIcao},
        });
        await settle(unit);
        expect(heldIdent(unit, c.memory)).toBe(c.second); // Precondition: the page restored its saved waypoint

        expect(unit.props.scanLists[SCAN_LISTS[c.memory]].start()?.ident).toBe(c.first);
    });

    // A page parked on a rank follows the re-ranking in its tick (3-24, #268): the setting is written when the waypoint
    // at the rank changes, and a steady tick writes nothing
    it('writes the setting of a page parked on a nearest rank only when the waypoint changes (#192)', async () => {
        const kccc = airport('KCCC', 47.6, 12.0);
        const unit = await bootUnit({facilities: [airport('KBBB', 47.2, 12.0), kccc], position: {lat: 47.19, lon: 12.0}});
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.msg();
        await unit.panel.ent();
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'nr 1');
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('R')[0]).toBe(' KBBB  nr 1'); // Precondition
        const set = vi.spyOn(unit.props.userSettings.getSetting('aptPageWpt'), 'set');

        await vi.advanceTimersByTimeAsync(10_000);
        expect(set).not.toHaveBeenCalled();

        // Next to KCCC the parked rank shows it: one write
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.59);
        await vi.advanceTimersByTimeAsync(2 * NEAREST_SEARCH_WAIT_MS);
        expect(Screen.read().rows('R')[0]).toBe(' KCCC  nr 1'); // Precondition
        expect(set.mock.calls).toEqual([[savedOf(kccc)]]);
    });

    // The power-on resolves the saved waypoint and puts it into the page state; the setting already holds it
    it('does not write the setting again when a power-on restores the waypoint it holds (#192)', async () => {
        const w = waypointWorld();
        const unit = await bootUnit({facilities: w.facilities, storage: {...w.storage, vorPageWpt: savedIcao('V', 'K1', 'ABD')}});
        await settle(unit);
        expect(heldIdent(unit, 'vorPage')).toBe('ABD'); // Precondition
        const set = vi.spyOn(unit.props.userSettings.getSetting('vorPageWpt'), 'set');

        await cycle(unit, 6 * 60);

        expect(heldIdent(unit, 'vorPage')).toBe('ABD');
        expect(set).not.toHaveBeenCalled();
    });

    // A saved waypoint that does not resolve (another database, a corrupted value, a waypoint of another type) falls back
    // to the first of the scan list. The KLN 89 trainer showed the first or the preceding user waypoint after a user waypoint
    // was deleted, and the deleted one was entry 0, so it does not tell which (round 2)
    it('falls back to the first of the scan list when the saved waypoint does not resolve (#192)', async () => {
        const w = waypointWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: 47.0, lon: 8.0},
            storage: {
                ...w.storage,
                aptPageWpt: 'garbage',
                vorPageWpt: savedIcao('V', 'K1', 'ABX'), // Not in the navdata
                ndbPageWpt: savedIcao('V', 'K1', 'ABD'), // A VOR, on the NDB page
                intPageWpt: savedIcao('Q', 'K1', 'INTAB'), // A V2 string whose type letter is no facility type
            },
        });
        await settle(unit);

        expect([heldIdent(unit, 'aptPage'), heldIdent(unit, 'vorPage'), heldIdent(unit, 'ndbPage'), heldIdent(unit, 'intPage')])
            .toEqual(['KAAA', 'ABC', 'NAA', 'INTAA']);
        expect([unit.props.memory.aptPage.ident, unit.props.memory.vorPage.ident, unit.props.memory.ndbPage.ident, unit.props.memory.intPage.ident])
            .toEqual(['KAAA', 'ABC', 'NAA', 'INTAA']);
        await vi.advanceTimersByTimeAsync(1000);
        expect([storedSetting(unit, 'aptPageWpt'), storedSetting(unit, 'vorPageWpt'), storedSetting(unit, 'ndbPageWpt'), storedSetting(unit, 'intPageWpt')])
            .toEqual([savedIcao('A', '', 'KAAA'), savedIcao('V', 'K1', 'ABC'), savedIcao('N', 'K1', 'NAA'), savedIcao('W', 'K1', 'INTAA')]);
        expect(unit.consoleErrors).toEqual([]);
        expect(unit.errors).toEqual([]);
    });

    // The keys are new and saved as V2 from the start (V1 is deprecated, maintainer 2026-10-24), so a V1 string is not
    // read: it does not resolve, and the page falls back
    it('does not resolve a waypoint saved as an ICAO V1 string (#192)', async () => {
        const w = waypointWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: 47.0, lon: 8.0},
            storage: {...w.storage, vorPageWpt: ICAO.valueToStringV1(ICAO.value('V', 'K1', '', 'ABD'))},
        });
        await settle(unit);

        expect(heldIdent(unit, 'vorPage')).toBe('ABC');
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'vorPageWpt')).toBe(savedIcao('V', 'K1', 'ABC'));
        expect(unit.consoleErrors).toEqual([]);
    });

    // 5-22: the power-off deletes the temporary waypoints no flight plan holds (TemporaryWaypointDeleter), so a temporary
    // waypoint the SUP page showed does not resolve at the power-on
    it('falls back when the saved user waypoint was a temporary one (#192)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const kbbb = airport('KBBB', 47.4, 8.0);
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], efb: true,
            storage: savedUserWaypoints([{kind: 'sup', ident: 'USUA', lat: 47.2, lon: 8.6}]),
        });
        await settle(unit);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb, enroute: [{lat: 47.1, lon: 8.1}]}));
        await vi.advanceTimersByTimeAsync(2000);
        unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb})); // FPL 0 no longer holds CUST
        await vi.advanceTimersByTimeAsync(2000);
        const cust = unit.props.facilityRepository.get(ICAO.value('U', 'XY', '', 'CUST')) as UserFacility;
        expect(cust.icaoStruct.region).toBe('XY'); // Precondition: a temporary waypoint
        unit.props.memory.supPage.facility = cust; // As the SUP page writes it
        unit.props.memory.supPage.ident = 'CUST';
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'supPageWpt')).toBe(savedIcao('U', 'XY', 'CUST')); // Precondition

        await cycle(unit, 6 * 60);

        expect(heldIdent(unit, 'supPage')).toBe('USUA');
        expect(unit.props.memory.supPage.ident).toBe('USUA');
        expect(unit.errors).toEqual([]);
    });

    // The same over a sim restart: the unit was not turned off, so the temporary waypoint was saved, and the power-on of
    // the boot deletes it (5-22) in the event that also restores the page
    it('falls back at a new boot when the saved user waypoint was a temporary one (#192)', async () => {
        const unit = await bootUnit({
            storage: {
                ...savedUserWaypoints([{kind: 'sup', ident: 'USUA', lat: 47.2, lon: 8.6}]),
                wpt1: `UXY        ${'TMPB'.padEnd(8, ' ')}+4707.00+00807.00`, // As TemporaryWaypointDeleter.test.ts lays it out
                supPageWpt: savedIcao('U', 'XY', 'TMPB'),
            },
        });
        await settle(unit);

        expect(unit.props.facilityRepository.get(ICAO.value('U', 'XY', '', 'TMPB'))).toBeUndefined(); // Precondition: deleted
        expect(heldIdent(unit, 'supPage')).toBe('USUA');
        expect(unit.props.memory.supPage.ident).toBe('USUA');
        expect(unit.errors).toEqual([]);
    });

    // 3-8: after the start-up the right side shows the page of the last active waypoint, which wins over the saved
    // waypoint of that page type and becomes the saved one
    it('shows the last active waypoint on its page type at the start-up (3-8) (#192)', async () => {
        const w = waypointWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: 47.0, lon: 8.0},
            storage: {...w.storage, vorPageWpt: savedIcao('V', 'K1', 'ABC'), activeWaypoint: activeIcao('V', 'K1', 'ABD')},
        });
        await settle(unit);

        expect(Screen.read().status().right).toBe('VOR');
        expect(Screen.read().rows('R')[0].trim().startsWith('ABD')).toBe(true);
        expect(heldIdent(unit, 'vorPage')).toBe('ABD');
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'vorPageWpt')).toBe(savedIcao('V', 'K1', 'ABD'));
    });

    // The unit leaves the start-up only once the memory is ready (WelcomePage), so a restore that takes longer than the
    // start-up (a database lookup takes a frame or more in the sim) cannot overwrite the 3-8 override afterwards. The
    // lookup of the saved VOR ABC is held back for 5 s
    it('shows the last active waypoint at the start-up even when the restore is slow (3-8) (#192)', async () => {
        const getFacility = MemoryFacilityClient.prototype.getFacility;
        const spy = vi.spyOn(MemoryFacilityClient.prototype, 'getFacility');
        onTestFinished(() => spy.mockRestore());
        spy.mockImplementation(function (this: MemoryFacilityClient, type, icao) {
            const ident = typeof icao === 'string' ? ICAO.getIdentFromStringV1(icao) : icao.ident;
            const result = getFacility.call(this, type, icao);
            return ident === 'ABC' ? new Promise(resolve => setTimeout(() => resolve(result), 5000)) : result;
        });
        const w = waypointWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: 47.0, lon: 8.0},
            storage: {...w.storage, vorPageWpt: savedIcao('V', 'K1', 'ABC'), activeWaypoint: activeIcao('V', 'K1', 'ABD')},
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(6000); // Past the held-back lookup

        expect(Screen.read().status().right).toBe('VOR');
        expect(Screen.read().rows('R')[0].trim().startsWith('ABD')).toBe(true);
        expect(heldIdent(unit, 'vorPage')).toBe('ABD');
        expect(storedSetting(unit, 'vorPageWpt')).toBe(savedIcao('V', 'K1', 'ABD'));
    });

    // A saved waypoint of another type than the page's (a corrupted value) does not resolve: each of these resolves in
    // the navdata, so only the type keeps it off the page
    it.each([
        {name: 'APT', memory: 'aptPage' as const, key: 'aptPageWpt', wrong: savedIcao('V', 'K1', 'ABD'), first: 'KAAA'},
        {name: 'VOR', memory: 'vorPage' as const, key: 'vorPageWpt', wrong: savedIcao('N', 'K1', 'NAB'), first: 'ABC'},
        {name: 'NDB', memory: 'ndbPage' as const, key: 'ndbPageWpt', wrong: savedIcao('W', 'K1', 'INTAB'), first: 'NAA'},
        {name: 'INT', memory: 'intPage' as const, key: 'intPageWpt', wrong: savedIcao('A', '', 'KAAB'), first: 'INTAA'},
        {name: 'SUP', memory: 'supPage' as const, key: 'supPageWpt', wrong: savedIcao('V', 'K1', 'ABD'), first: 'USUA'},
    ])('falls back on the $name page when the saved waypoint is of another type (#192)', async (c) => {
        const w = waypointWorld();
        const unit = await bootUnit({facilities: w.facilities, position: {lat: 47.0, lon: 8.0}, storage: {...w.storage, [c.key]: c.wrong}});
        await settle(unit);

        expect(heldIdent(unit, c.memory)).toBe(c.first);
    });

    // The INT page shows runway waypoints too (IntPage is a page of intersections and runways); a saved runway comes back
    it('shows a saved runway on the INT page at a new boot (#192)', async () => {
        const w = waypointWorld();
        const krwy = airport('KRWY', 47.4, 8.0, {runwayHeading: 270});
        const rw27 = runwayFix(krwy, '27');
        const unit = await bootUnit({
            facilities: [...w.facilities, krwy, rw27], position: {lat: 47.0, lon: 8.0},
            storage: {...w.storage, intPageWpt: savedOf(rw27), activeWaypoint: AIRPORT_ACTIVE},
        });
        await settle(unit);

        expect(heldIdent(unit, 'intPage')).toBe('RW27');
        expect(unit.props.memory.intPage.ident).toBe('RW27');
        await unit.panel.selectPage('R', 'INT');
        expect(Screen.read().rows('R')[0].trim().startsWith('RW27')).toBe(true);
    });
});

// A power-on shows the first waypoint of the scan list on a page whose saved waypoint does not resolve. Only the SUP page
// catches a lookup of that waypoint that rejects; on the APT, VOR, NDB and INT pages the rejection ends the power-on
// before the memory is ready, and the unit stays on the Turn-On page (WelcomePage waits for it). The lookup of the
// default intersection ZZXIN, the only one and so the first of the INT scan list, is made to reject here, as a database
// facility the ident search returns but that does not load would
describe('a first waypoint of a scan list that does not load (#416)', () => {
    it.fails('leaves the Turn-On page when the first waypoint of the INT scan list does not load (#416)', async () => {
        const getFacility = MemoryFacilityClient.prototype.getFacility;
        const spy = vi.spyOn(MemoryFacilityClient.prototype, 'getFacility');
        onTestFinished(() => spy.mockRestore());
        spy.mockImplementation(function (this: MemoryFacilityClient, type, icao) {
            const ident = typeof icao === 'string' ? ICAO.getIdentFromStringV1(icao) : icao.ident;
            return ident === 'ZZXIN' ? Promise.reject(new Error('no facility ZZXIN')) : getFacility.call(this, type, icao);
        });
        const unit = await bootUnit(); // Engine running: the Turn-On page goes as soon as the memory is ready

        await vi.advanceTimersByTimeAsync(20_000); // Past the 17 s of a Turn-On page that waits

        expect(unit.takeRejections()).toEqual([]);
        expect(unit.props.memory.isReady).toBe(true);
        expect(Screen.read().status().left).toBe('NAV 2');
    });
});

// The trainers kept the TRI 1 waypoint (AVsoftech) and the trip waypoints of CAL 1 (KLN 89) over a power cycle
// (2026-10-24, docs/kln89-trainer-record.md); they are user settings (#192), which survive a sim restart too
describe('the TRI waypoints over a sim restart (#192)', () => {
    it('keeps the TRI 1 and TRI 3 waypoints over a sim restart (trainers 2026-10-24) (#192)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const intaa = intersection('INTAA', 47.3, 8.5);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb, intaa],
            storage: {tri1To: savedOf(kbbb), tri3From: savedOf(abc), tri3To: savedOf(intaa)},
        });
        await settle(unit);
        const tri = unit.props.memory.triPage;

        // The boot from the saved data
        expect([tri.tri1To, tri.tri3From, tri.tri3To].map(f => f?.icaoStruct.ident)).toEqual(['KBBB', 'ABC', 'INTAA']);

        // The saves
        tri.tri1To = kaaa;
        tri.tri3From = intaa;
        tri.tri3To = null;
        await vi.advanceTimersByTimeAsync(1000);
        expect([storedSetting(unit, 'tri1To'), storedSetting(unit, 'tri3From'), storedSetting(unit, 'tri3To')])
            .toEqual([savedOf(kaaa), savedOf(intaa), '']);
    });

    it('forgets a TRI waypoint that does not resolve (#192)', async () => {
        const unit = await bootUnit({storage: {tri1To: savedIcao('Q', 'K1', 'ABC'), tri3From: savedIcao('V', 'K1', 'ABX'), tri3To: ''}});
        await settle(unit);
        const tri = unit.props.memory.triPage;

        expect([tri.tri1To, tri.tri3From, tri.tri3To]).toEqual([null, null, null]);
        await vi.advanceTimersByTimeAsync(1000);
        // The setting is cleared, so a later boot does not try again
        expect([storedSetting(unit, 'tri1To'), storedSetting(unit, 'tri3From')]).toEqual(['', '']);
        expect(unit.consoleErrors).toEqual([]);
    });

    // A saved temporary waypoint no flight plan holds is deleted by the power-on of the boot (5-22), in the event that
    // also restores the TRI waypoints, so it gives null (spec 4.4)
    it('forgets a TRI waypoint that was a temporary one at a new boot (#192)', async () => {
        const unit = await bootUnit({
            storage: {
                userDataFormat: 2,
                wpt0: `UXY        ${'TMPB'.padEnd(8, ' ')}+4707.00+00807.00`, // As TemporaryWaypointDeleter.test.ts lays it out
                tri1To: savedIcao('U', 'XY', 'TMPB'),
            },
        });
        await settle(unit);

        expect(unit.props.facilityRepository.get(ICAO.value('U', 'XY', '', 'TMPB'))).toBeUndefined(); // Precondition: deleted
        expect(unit.props.memory.triPage.tri1To).toBeNull();
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'tri1To')).toBe('');
    });
});

// #192: VolatileMemory holds only what the unit forgets at a power-on; what it keeps is a user setting. The guard holds
// that for every field of the page states, the fields added later too: after a power-on of more than 5 minutes every
// field is back at the value of a freshly constructed state. A field that is added and neither reset nor made a setting
// fails here. The guard sees the own keys of a page state, so every field needs an initializer (see VolatileMemory)
describe('the page states over a power-on (#192)', () => {
    const SENTINEL = {sentinel: true};
    // Not page state in the sense of #192: persisted on their own path, or the maps reset() clears (checked below)
    const KEPT = new Set(['fplPage.flightplans', 'navPage.activeWaypoint', 'navPage.airspaceWarned', 'navPage.airspaceEntered']);

    /**
     * The fields a power-on restores from the user settings or the scan list, so that their value is the result of the
     * restore and not a default (the tests of the waypoint pages and the TRI waypoints hold it). They are still checked
     * for the sentinel
     */
    function restoredKeys(page: unknown): string[] {
        if (page instanceof WaypointPageState) {
            return ['_facility', 'ident'];
        }
        if (page instanceof TriPageState) {
            return ['_tri1To', '_tri3From', '_tri3To'];
        }
        return [];
    }

    it('resets every field of the page states at a power-on (#192)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const memory = unit.props.memory;
        const p = unit.props;
        // The initial values: a state as the constructor leaves it. On a bus of its own: on the unit's it would be reset at once, by the last power event the bus replays
        const fresh = new VolatileMemory(new EventBus(), p.userSettings, p.facilityLoader, p.sensors, p.scanLists, memory.fplPage.flightplans, null);
        const pagesOf = (m: VolatileMemory) => Object.entries(m)
            .filter(([name]) => name.endsWith('Page'))
            .map(([name, page]) => [name, page as Record<string, unknown>] as const);
        const pages = pagesOf(memory);
        const freshPages = new Map(pagesOf(fresh));
        // A SavedWaypoint is the link to the user setting that a power-on restores from
        const isChecked = (name: string, page: Record<string, unknown>, key: string) =>
            !KEPT.has(`${name}.${key}`) && !(page[key] instanceof SavedWaypoint);
        for (const [name, page] of pages) {
            for (const key of Object.keys(page)) {
                if (isChecked(name, page, key)) {
                    page[key] = SENTINEL;
                }
            }
        }
        const message = {} as unknown as Message; // Only its presence is read here
        memory.navPage.airspaceWarned.set('area', message);
        memory.navPage.airspaceEntered.set('area', message);

        memory.reset({isPowered: true, timeSincePowerChange: 6 * 60 * 1000});
        // Microtasks only: the ticks of a timer advance would recompute the derived values and hide a missing reset
        for (let i = 0; i < 1000 && !memory.isReady; i++) {
            await Promise.resolve();
        }

        expect(memory.isReady).toBe(true);
        // Every field must be back at its initial value, which a value the reset wrote wrongly is not. The restored fields
        // are only checked for the sentinel
        const actual: Record<string, unknown> = {};
        const initial: Record<string, unknown> = {};
        for (const [name, page] of pages) {
            for (const key of Object.keys(page)) {
                if (!isChecked(name, page, key)) {
                    continue;
                }
                actual[`${name}.${key}`] = page[key];
                initial[`${name}.${key}`] = restoredKeys(page).includes(key) && page[key] !== SENTINEL ? page[key] : freshPages.get(name)![key];
            }
        }
        expect(actual).toEqual(initial);
        expect(memory.navPage.airspaceWarned.size).toBe(0);
        expect(memory.navPage.airspaceEntered.size).toBe(0);
    });
});
