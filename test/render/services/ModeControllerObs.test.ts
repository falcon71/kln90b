import {describe, expect, it, vi} from 'vitest';
import {Facility, FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {savedFlightplan} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';
import {angleBetween, courseDeg, distanceNm, EARTH_RADIUS_NM, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {KLNFixType} from '../../../kln90b/data/flightplan/Flightplan';
import {FROM, NavMode} from '../../../kln90b/data/VolatileMemory';

// The standard world: the final course KAAA - ABC is about 51.0, ABC - KBBB about 16
const {kaaa, abc, kbbb} = standardRoute();
const OBS_SOURCE_OFF = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>';
const LEG_OBS_SWITCH = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ExternalSwitches>'
    + '<LegObsSwitchInstalled>true</LegObsSwitchInstalled></ExternalSwitches></Input></Instrument></PlaneHTMLConfig>';

/**
 * The deviation of the position from the great circle through wpt with the given true course there, by hand (spherical
 * cross-track, right of course positive): the angle at wpt between the course and the bearing from wpt to the aircraft
 */
function xtkFromCourse(position: { lat: number; lon: number }, wpt: { lat: number; lon: number }, course: number): number {
    const d = distanceNm(wpt, position);
    const bearingFromWptToAircraft = courseDeg(wpt, position);
    return EARTH_RADIUS_NM * Math.asin(Math.sin(d / EARTH_RADIUS_NM) * Math.sin((course - (bearingFromWptToAircraft + 180)) * Math.PI / 180));
}

async function legMode(unit: HeadlessUnit) {
    await unit.panel.selectPage('L', 'MOD 1');
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(2000);
}

describe('LEG to OBS (5-36)', () => {
    // 5-36 rule 2.ii: when the unit is not the displayed source (ObsSource 0: the unit cannot read the indicator), the
    // course is chosen so that the deviation stays the same
    it('keeps a deviation of 2 NM when the unit chooses the course', async () => {
        const position = pointFrom(pointBefore(kaaa, abc, 5), 141, 2); // 2 NM right of the leg, 5 NM before ABC
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], position, panelXml: OBS_SOURCE_OFF, storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        const nav = unit.props.memory.navPage;
        expect(nav.xtkToActive!).toBeCloseTo(2, 1); // Precondition, by construction

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC'); // 5-36 rule 1
        expect(nav.xtkToActive!).toBeCloseTo(2, 1);
    });

    // The same with a magnetic variation, so that the unit must convert the true course it chooses to the magnetic OBS.
    // The OBS course is magnetic and the path true: at a variation of 0 a missing conversion cannot be seen. The course
    // the unit chooses is the leg's DTK at the aircraft (its final course to within 0.2 degrees, 5 NM before the end) less the variation.
    describe('keeps a deviation of 2 NM and sets the magnetic OBS course', () => {
        /** ObsSource 0, 5 NM before the end of the leg KAAA - `end`, 2 NM right of it */
        async function twoNmRight(end: Facility, magvar: number | undefined) {
            const position = pointFrom(pointBefore(kaaa, end, 5), finalCourseDeg(kaaa, end) + 90, 2);
            const unit = await bootUnit({facilities: [kaaa, end], position, panelXml: OBS_SOURCE_OFF, magvar, storage: savedFlightplan(0, [kaaa, end])});
            await settle(unit);
            const nav = unit.props.memory.navPage;
            expect(nav.xtkToActive!).toBeCloseTo(2, 1); // Precondition, by construction

            await unit.panel.obsMode();
            await vi.advanceTimersByTimeAsync(2000);
            return {nav, trueCourse: finalCourseDeg(kaaa, end)};
        }

        // 5-35 item 6: an active VOR counts with its published variation, here 10 E (the sim stores east as negative)
        it('with the published variation of the active VOR (10 E)', async () => {
            const end = vor('ABC', abc.lat, abc.lon, {magneticVariation: -10});
            const {nav, trueCourse} = await twoNmRight(end, undefined);

            expect(nav.navmode).toBe(NavMode.ENR_OBS);
            expect(Math.abs(nav.obsMag - (trueCourse - 10))).toBeLessThan(0.2);
            expect(nav.xtkToActive!).toBeCloseTo(2, 1);
        });

        // 5-35: for a waypoint that is not a VOR the unit uses the variation at the aircraft, here 10 E
        it('with the variation at the aircraft for an active airport (10 E)', async () => {
            const {nav, trueCourse} = await twoNmRight(kbbb, 10);

            expect(nav.navmode).toBe(NavMode.ENR_OBS);
            expect(Math.abs(nav.obsMag - (trueCourse - 10))).toBeLessThan(0.2);
            expect(nav.xtkToActive!).toBeCloseTo(2, 1);
        });
    });

    // 5-36 rule 2.ii. The unit takes the DTK at the aircraft as the OBS, but the OBS course is laid through the active
    // waypoint, where the great circle of the leg has another course. 100 NM before the end of a 150 NM leg to the east
    // at 47 N the two differ by about 1.8 degrees, so an aircraft on the leg gets a deviation of about 3.1 NM.
    // Its passing sibling is the 2 NM test above (the same flow on a short leg); the preconditions here are the
    // aircraft on the leg and the OBS mode entered, which the sibling below asserts without the final deviation
    // (5-36 rule 1: the active waypoint stays)
    async function longLegInObs() {
        const start = airport('KAAA', 47.0, 8.0);
        const endPos = pointFrom(start, 90, 150);
        const end = vor('EEE', endPos.lat, endPos.lon);
        const position = pointBefore(start, end, 100);
        const unit = await bootUnit({facilities: [start, end], position, panelXml: OBS_SOURCE_OFF, storage: savedFlightplan(0, [start, end])});
        await settle(unit);
        const nav = unit.props.memory.navPage;
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.01); // On the leg

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        return nav;
    }

    it('enters OBS with EEE active for an aircraft on a long leg, 100 NM before the waypoint (the setup of #NEW-3-1)', async () => {
        const nav = await longLegInObs();

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('EEE');
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
    });

    it.fails('keeps the deviation of an aircraft on a long leg, 100 NM before the waypoint (#NEW-3-1)', async () => {
        const nav = await longLegInObs();

        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.1);
    });

    // C-1: NO ACTV WPT when OBS is selected without an active waypoint; the mode stays
    it('says NO ACTV WPT and stays in LEG without an active waypoint (C-1)', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(1000);

        await unit.panel.obsMode();

        expect(Screen.read().status().mode).toBe('NO ACTV WPT');
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
    });
});

describe('OBS to LEG (5-36)', () => {
    /** Plan KAAA, ABC, KBBB; OBS mode with the external indicator on `obs`, ABC active */
    async function inObs(position: { lat: number; lon: number }, obs: number) {
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], position, storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', obs);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        return unit;
    }

    // 5-36: on the TO side the active waypoint stays (rule 1), the OBS becomes the DTK (rule 2) and the leg is a direct-to
    // (rule 3), so the deviation from the 070 course through ABC is kept
    it('keeps the waypoint and takes the OBS course as the DTK on the TO side', async () => {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await inObs(position, 70);
        const nav = unit.props.memory.navPage;
        expect(xtkFromCourse(position, abc, 70)).toBeCloseTo(1.63, 1); // Not about zero, so a recentred leg cannot match

        await legMode(unit);

        expect(nav.navmode).toBe(NavMode.ENR_LEG);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(Math.abs(nav.desiredTrack! - 70)).toBeLessThan(0.2);
        expect(Math.abs(nav.xtkToActive! - xtkFromCourse(position, abc, 70))).toBeLessThan(0.05);
    });

    /**
     * OBS 050 to ABC, then the aircraft 10 NM past ABC on the course ABC - KBBB and 2 NM right of it: the FROM side of
     * the OBS course, ABC still active (OBS does not sequence, 5-35)
     */
    async function pastAbcInObs() {
        const unit = await inObs(pointBefore(kaaa, abc, 5), 50);
        const nav = unit.props.memory.navPage;
        const leg2Course = courseDeg(abc, kbbb);
        const foot = pointFrom(abc, leg2Course, 10);
        const position = pointFrom(foot, leg2Course + 90, 2);
        await moveAircraft(unit, position, {groundspeedKt: 120, trackTrue: 16});
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(nav.toFrom).toBe(FROM);
        return {unit, nav, position, foot};
    }

    // The sibling of the pin below: its setup holds, and the switch itself works (5-36: the mode changes, a waypoint is
    // active)
    it('the pin setup: OBS 050 to ABC, 10 NM past ABC, 2 NM right of ABC - KBBB, FROM (the setup of #NEW-3-5)', async () => {
        const {unit, nav} = await pastAbcInObs();

        expect(nav.activeWaypoint.getActiveFplIdx()).toBe(1);
        expect(Math.abs(nav.xtkToActive! - 2)).toBeGreaterThan(1); // The OBS deviation is not the 2 NM of leg 2, so a kept leg cannot match it by chance

        await legMode(unit);

        expect(nav.navmode).toBe(NavMode.ENR_LEG);
        // The unit re-orients on FPL 0 and flies to the leg's waypoint, KBBB, today and under the fix of the pin
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('KBBB');
    });

    // 5-36 rules 1 and 2: on the FROM side the unit re-orients on FPL 0, computes the DTK for the new leg, and the
    // deviation from that leg is kept; checked in the KLN 89 trainer: the leg comes back with its deviation. The unit
    // makes a direct-to from the present position to KBBB instead (ModeController.switchToEnrLegMode, FROM branch), so the
    // plan leg is lost and the deviation is zero
    it.fails('re-activates the plan leg ABC - KBBB instead of a direct-to from the present position (#NEW-3-5)', async () => {
        const {unit, nav, foot} = await pastAbcInObs();

        await legMode(unit);

        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('KBBB');
        expect(nav.activeWaypoint.isDctNavigation()).toBe(false);
        expect(nav.activeWaypoint.getFromWpt()!.icaoStruct.ident).toBe('ABC');
        expect(angleBetween(nav.desiredTrack, finalCourseDeg(abc, foot))).toBeLessThan(0.5);
        expect(Math.abs(nav.xtkToActive! - 2)).toBeLessThan(0.1);
    });

    // 5-36 rule 1: the waypoint that was active in OBS stays active. switchToEnrLegMode looks it up by its ICAO
    // (ActiveWaypoint.directTo), which finds the first copy in FPL 0
    /** FPL 0 KAAA, ABC, KBBB, ABC, the second ABC active by a direct-to from FPL 0, then OBS */
    async function secondAbcInObs() {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: pointBefore(kbbb, abc, 10), storage: savedFlightplan(0, [kaaa, abc, kbbb, abc]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3); // The second ABC
        await unit.panel.dct();
        await unit.panel.ent();
        await unit.panel.cursor('L');
        expect(aw.getActiveFplIdx()).toBe(3);
        unit.env.sim.set('Nav OBS:1', 'degrees', 196);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(aw.getActiveFplIdx()).toBe(3); // OBS keeps the copy (setObs uses the index)
        return {unit, aw};
    }

    // 5-36 rule 1: the sibling of the pin below; its setup holds and the switch back to LEG works
    it('the pin setup: the second ABC of FPL 0 stays active in OBS, and LEG brings the unit back to ENR-LEG (the setup of #NEW-3-2)', async () => {
        const {unit, aw} = await secondAbcInObs();

        await legMode(unit);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });

    it.fails('keeps the second copy of a waypoint that is twice in FPL 0 active (#NEW-3-2)', async () => {
        const {unit, aw} = await secondAbcInObs();

        await legMode(unit);

        expect(aw.getActiveFplIdx()).toBe(3);
    });
});

describe('OBS to LEG on an approach whose FAF is also the IAF or the missed approach holding point (6-11, 6-19)', () => {
    const kprc = airport('KPRC', 47.0, 8.0);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const txoPos = pointFrom(kprc, 0, 5);
    const txo = intersection('TXOAA', txoPos.lat, txoPos.lon);
    const enrPos = pointFrom(txo, 0, 30);
    const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);

    /** VOR approach with the IAF TXOAA that is also the FAF; the IAF copy active, then OBS 180 */
    async function iafIsFafInObs() {
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_VOR, runway: '18',
                transitions: [{name: 'TXOAA', legs: [Leg.IF(txo, FixTypeFlags.IAF)]}],
                final: [Leg.IF(txo, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, txo, mapaa], position: pointFrom(txo, 0, 6),
            storage: {...savedFlightplan(0, [enraa, apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ENRAA', 'TXOAA', 'TXOAA', 'MAPAA', 'KPRC']);
        expect(aw.getActiveLeg()!.fixType).toBe(KLNFixType.IAF);
        unit.env.sim.set('Nav OBS:1', 'degrees', 180);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_OBS); // Within 30 NM of the airport the unit arms the approach
        expect(aw.getActiveFplIdx()).toBe(1);
        return {unit, aw};
    }

    // 5-36 and 6-11: the sibling of the pin below; its setup holds and the switch back to LEG works
    it('the pin setup: the IAF copy is active in ARM-OBS, and LEG brings the unit to ARM-LEG with TXOAA active (the setup of #NEW-3-3)', async () => {
        const {unit, aw} = await iafIsFafInObs();

        await legMode(unit);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('TXOAA');
    });

    // 6-11 step 5: after the course reversal at an IAF that is also the FAF, switching to LEG makes the FAF active.
    // Run as a plain it, the pin fails at the index assertion: expected 1 to be 2
    it.fails('makes the FAF copy active when the IAF and the FAF are the same fix (#NEW-3-3)', async () => {
        const {unit, aw} = await iafIsFafInObs();

        await legMode(unit);

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getActiveLeg()!.fixType).toBe(KLNFixType.FAF);
    });

    // 6-11 note and 6-19 note: after holding at a missed approach holding point that is also the FAF, switching to LEG
    // makes the FAF active. This passes only because ActiveWaypoint.directTo takes the first copy of the waypoint, the
    // lookup of #NEW-3-2: a fix of that pin that keeps the active copy turns this test red
    it('makes the FAF copy active when the missed approach holding point is the FAF', async () => {
        const vvvPos = pointFrom(mapaa, 0, 5);
        const vvv = vor('VVV', vvvPos.lat, vvvPos.lon);
        const ifPos = pointFrom(vvv, 0, 10);
        const ifaaa = intersection('IFAAA', ifPos.lat, ifPos.lon);
        const enr2Pos = pointFrom(ifaaa, 0, 30);
        const enr2 = intersection('ENRAA', enr2Pos.lat, enr2Pos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_VOR, runway: '18',
                transitions: [{name: 'IFAAA', legs: [Leg.IF(ifaaa, FixTypeFlags.IAF)]}],
                final: [Leg.IF(ifaaa), Leg.TF(vvv, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
                missed: [Leg.DF(vvv), Leg.HM(vvv, 180, LegTurnDirection.Right, FixTypeFlags.MAHP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enr2, ifaaa, vvv, mapaa], position: pointFrom(ifaaa, 0, 5),
            storage: {...savedFlightplan(0, [enr2, apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        const aw = unit.props.memory.navPage.activeWaypoint;
        const legs = unit.props.memory.fplPage.flightplans[0].getLegs();
        expect(legs.map(l => l.wpt.icaoStruct.ident)).toEqual(['ENRAA', 'IFAAA', 'VVV', 'MAPAA', 'VVV', 'KPRC']);
        expect(legs[2].fixType).toBe(KLNFixType.FAF);
        // The missed approach: the holding point as direct-to target, from the FPL 0 page
        await moveAircraft(unit, pointFrom(vvv, 0, 3), {groundspeedKt: 120, trackTrue: 180});
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 5); // The approach header row counts as a cursor position
        await unit.panel.dct();
        await unit.panel.ent();
        await unit.panel.cursor('L');
        expect(aw.getActiveFplIdx()).toBe(4); // Precondition: the holding point copy
        unit.env.sim.set('Nav OBS:1', 'degrees', 180);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(aw.getActiveFplIdx()).toBe(4);

        await legMode(unit);

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getActiveLeg()!.fixType).toBe(KLNFixType.FAF);
    });
});

describe('OBS course and the published variation of a VOR (5-35)', () => {
    // 5-35 item 6: with a VOR active in OBS the published variation of the VOR counts, not the computed one. The sim stores
    // VOR variation positive west (msfs-sdk FacilityUtils), so -10 is 10 E: OBS 090 is the true course 100 through VVV.
    // The aircraft is 10 NM from VVV on its 250 radial, so the deviation is 10 sin(280 - 250) = 5.0 NM by hand
    it('lays the OBS course through an active VOR with the VOR variation', async () => {
        const vvv = vor('VVV', 47.3, 8.3, {magneticVariation: -10});
        const position = pointFrom(vvv, 250, 10);
        const unit = await bootUnit({facilities: [kaaa, vvv], position, storage: savedFlightplan(0, [kaaa, vvv]), magvar: 0});
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', 90);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        const nav = unit.props.memory.navPage;
        expect(nav.obsMag).toBe(90);
        expect(nav.xtkToActive!).toBeCloseTo(5.0, 2);
    });
});

describe('OBS WPT > 200NM (B-3)', () => {
    /** The active waypoint FAR at `nm` from the aircraft, in OBS or not */
    async function messagesAt(nm: number, obs: boolean) {
        const far = vor('FAR', 47.0, 8.0);
        const startPos = pointFrom(far, 270, 400);
        const sta = vor('STA', startPos.lat, startPos.lon);
        const unit = await bootUnit({facilities: [sta, far], position: pointFrom(far, 270, nm), storage: savedFlightplan(0, [sta, far])});
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', 90);
        if (obs) await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('FAR');
        return unit.props.messageHandler.getMessages().map(m => m.message);
    }

    it('shows the message in OBS with the waypoint 210 NM away', async () => {
        expect(await messagesAt(210, true)).toContainEqual(['OBS WPT > 200NM']);
    });

    it('does not show it in OBS with the waypoint 190 NM away', async () => {
        expect(await messagesAt(190, true)).not.toContainEqual(['OBS WPT > 200NM']);
    });

    it('does not show it in LEG with the waypoint 210 NM away', async () => {
        expect(await messagesAt(210, false)).not.toContainEqual(['OBS WPT > 200NM']);
    });
});

describe('the external GPS CRS switch (5-33)', () => {
    // 5-33: with the switch installed the mode follows the switch; 5-36 rule 1: the active waypoint stays both ways
    it('switches to OBS and back to LEG with the switch, keeping the active waypoint', async () => {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], position, panelXml: LEG_OBS_SWITCH, storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        const nav = unit.props.memory.navPage;
        unit.env.sim.set('Nav OBS:1', 'degrees', 70);
        unit.env.sim.set('GPS OBS ACTIVE', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.obsMag).toBe(70);

        unit.env.sim.set('GPS OBS ACTIVE', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(nav.navmode).toBe(NavMode.ENR_LEG);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(Math.abs(nav.desiredTrack! - 70)).toBeLessThan(0.2); // 5-36 rule 2
    });
});
