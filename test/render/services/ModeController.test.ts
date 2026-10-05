import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {airport, intersection} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {savedFlightplan} from '../../harness/storage';
import {courseDeg, distanceNm, EARTH_RADIUS_NM, pointBefore, pointFrom} from '../../harness/flight/geo';
import {KLNFixType} from '../../../kln90b/data/flightplan/Flightplan';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// The standard world of the flight tests: the final course KAAA - ABC is about 51.0 degrees
const {kaaa, abc, kbbb} = standardRoute();

describe('ModeController OBS course', () => {
    // 5-34 and 5-35: in OBS the deviation is measured from the selected course through the active waypoint, and the
    // course comes from the external indicator. 014293d: ModeController ticks before NavCalculator, so a course that
    // changed is in the deviation of the same calculation tick instead of one second late.
    it('uses a changed OBS course in the same calculation tick (014293d)', async () => {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        const sim = unit.env.sim;
        sim.set('Nav OBS:1', 'degrees', 51); // Before entering OBS: unset it reads 0
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(sim.get('GPS OBS VALUE', 'degrees')).toBeCloseTo(51, 2);

        sim.set('Nav OBS:1', 'degrees', 100);
        await vi.advanceTimersByTimeAsync(1000); // Exactly one calculation tick

        // The aircraft is d from ABC on the bearing brg; the course through ABC is 100: XTK = R asin(sin(d/R) sin(100 - brg))
        const d = distanceNm(position, abc);
        const brg = courseDeg(position, abc);
        const expectedXtk = EARTH_RADIUS_NM * Math.asin(Math.sin(d / EARTH_RADIUS_NM) * Math.sin((100 - brg) * Math.PI / 180));
        expect(expectedXtk).toBeCloseTo(3.77, 1); // The hand value is not about zero, so a stale course cannot match it
        expect(Math.abs(sim.get('GPS OBS VALUE', 'degrees') - 100)).toBeLessThan(0.01);
        expect(Math.abs(sim.get('GPS WP DESIRED TRACK', 'degrees') - 100)).toBeLessThan(0.01);
        // Not GPS WP CROSS TRK: the 16 Hz output filter lags the model
        expect(Math.abs(nav.xtkToActive! - expectedXtk)).toBeLessThan(0.05);
    });
});

describe('ModeController OBS course of 000', () => {
    /** Plan [KAAA, ABC], 10 NM before ABC on the leg, the external OBS course set before OBS is entered */
    async function enterObsWithCourse(course: number) {
        const position = pointBefore(kaaa, abc, 10);
        const unit = await bootUnit({facilities: [kaaa, abc], position, storage: savedFlightplan(0, [kaaa, abc])});
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', course);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(3000);
        return {unit, position};
    }

    /** The deviation from the course through ABC for an aircraft at the position, by hand */
    function xtkFromCourse(position: { lat: number; lon: number }, course: number): number {
        const d = distanceNm(position, abc);
        return EARTH_RADIUS_NM * Math.asin(Math.sin(d / EARTH_RADIUS_NM) * Math.sin((course - courseDeg(position, abc)) * Math.PI / 180));
    }

    // The sibling of the pin: the same entry with an OBS course other than the stored one works, so a broken setup fails here.
    // Spec: the OBS course is the one the external indicator shows (5-34), and going from LEG to OBS keeps the active
    // waypoint and takes that course (5-36, rule 2.i); the deviation is measured from it through the waypoint.
    it('measures the deviation from an OBS course of 077 through the waypoint (#122)', async () => {
        const {unit, position} = await enterObsWithCourse(77);
        const nav = unit.props.memory.navPage;

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.obsMag).toBe(77);
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(xtkFromCourse(position, 77)).toBeCloseTo(4.38, 1);
        expect(Math.abs(nav.xtkToActive! - xtkFromCourse(position, 77))).toBeLessThan(0.05);
    });

    // 5-36: the OBS course is the one the indicator selects, 000 included. ModeController.setObs returns at once when the
    // course equals navState.obsMag, which is 0 at start and after a switch to LEG, so the leg path stays in force.
    it.fails('measures the deviation from an OBS course of 000 through the waypoint (#122)', async () => {
        const {unit, position} = await enterObsWithCourse(0);
        const nav = unit.props.memory.navPage;

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(xtkFromCourse(position, 0)).toBeCloseTo(-7.77, 1);
        expect(Math.abs(nav.xtkToActive! - xtkFromCourse(position, 0))).toBeLessThan(0.05);
    });
});

// 6-3: the unit switches from ARM to APR when the FAF is the active waypoint and the aircraft is within 2 NM of it and
// heading toward it. 633fdad widened the allowed difference between the track and the final course to 110 degrees.
describe('arming to approach active at the FAF (633fdad)', () => {
    const kprc = airport('KPRC', 47.0, 8.0);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    // The final course is 180: the FAF is 5 NM north of the MAP. At rest the unit's GPS track is 0, so a final course within
    // 110 degrees of 000 would switch to APR before the aircraft moves.
    const fafPos = pointFrom(mapaa, 0, 5);
    const fafaa = intersection('FAFAA', fafPos.lat, fafPos.lon);

    /**
     * The IF is 5 NM and the IAF 10 NM before the FAF on the inbound track, which may differ from the final course; the
     * unit starts 1.6 NM before the FAF on that track with the FAF active and the mode ARM.
     */
    async function armedNearFaf(inboundTrack: number) {
        const ifPos = pointFrom(fafaa, inboundTrack + 180, 5);
        const iafPos = pointFrom(fafaa, inboundTrack + 180, 10);
        const ifaaa = intersection('IFAAA', ifPos.lat, ifPos.lon);
        const iafaa = intersection('IAFAA', iafPos.lat, iafPos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
                transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa)]}],
                final: [Leg.IF(ifaaa), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, iafaa, ifaaa, fafaa, mapaa], position: pointFrom(fafaa, inboundTrack + 180, 1.6),
            storage: {...savedFlightplan(0, [apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        const nav = unit.props.memory.navPage;
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('FAFAA'); // Preconditions
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        return {unit, nav, inboundTrack};
    }

    /** The aircraft moves on to 1.55 NM before the FAF on the inbound track */
    async function flyOn(unit: Awaited<ReturnType<typeof armedNearFaf>>['unit'], inboundTrack: number) {
        await moveAircraft(unit, pointFrom(fafaa, inboundTrack + 180, 1.55), {groundspeedKt: 120, trackTrue: inboundTrack});
    }

    // 6-3: the aircraft flies toward the FAF, 100 degrees off the final course
    it('switches to APR with a track of 100 degrees off the final course (633fdad)', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);

        await flyOn(unit, inboundTrack);

        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(80, 0); // The unit has the track of the move
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('FAFAA');
        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(unit.errors).toEqual([]);
    });

    // The Pilot's Guide does not give the limit; the unit uses 110 degrees, so a track 120 degrees off stays in ARM
    it('stays in ARM with a track of 120 degrees off the final course (characterization, 633fdad)', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(60);

        await flyOn(unit, inboundTrack);

        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(60, 0);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('FAFAA');
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.errors).toEqual([]);
    });

    // Public contract: GPS APPROACH MODE is 0 off, 1 ARM, 2 ACTV and 3 self-test, and GPS IS APPROACH ACTIVE is 1 in both
    // ARM and ACTV (the External Annunciators wiki page, "ARM = 1 or 3, ACTV = 2 or 3"; 6-1 for the ARM annunciator). It
    // sits in this describe because armedNearFaf is local to it.
    it('writes GPS APPROACH MODE 1 in ARM and 2 in APR, with GPS IS APPROACH ACTIVE 1 in both', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.env.sim.lastWrite('GPS APPROACH MODE')!.value).toBe(1);
        expect(unit.env.sim.lastWrite('GPS IS APPROACH ACTIVE')!.value).toBe(1);

        await flyOn(unit, inboundTrack);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(unit.env.sim.lastWrite('GPS APPROACH MODE')!.value).toBe(2);
        expect(unit.env.sim.lastWrite('GPS IS APPROACH ACTIVE')!.value).toBe(1);
    });
});

// 6-3 lists a waypoint that is the IAF and the FAF at once as the active waypoint of the switch; 6-10 gives the example
// where the unit switches to APR 2 NM from the IAF/FAF. ModeController.checkSwitchAprArmToActive returns unless the
// active waypoint is typed FAF, but with such a fix the IAF copy is active during the last 2 NM (#129).
describe('arming to approach active at a fix that is IAF and FAF (#129)', () => {
    async function armedNearIafFaf() {
        const kprc = airport('KPRC', 47.0, 8.0);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const txoPos = pointFrom(kprc, 0, 5);
        const txo = intersection('TXOAA', txoPos.lat, txoPos.lon);
        const enrPos = pointFrom(txo, 0, 30);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_VOR, runway: '18',
                transitions: [{name: 'TXOAA', legs: [Leg.IF(txo, FixTypeFlags.IAF)]}],
                final: [Leg.IF(txo, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, txo, mapaa], position: pointFrom(txo, 0, 1.6),
            storage: {...savedFlightplan(0, [enraa, apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        return {unit, txo};
    }

    // The sibling of the pin: the setup works, the IAF copy is active and the unit stays armed 1.6 NM from the fix because the
    // rest track of 0 points away from it
    it('is armed with the IAF copy of the fix active at 1.6 NM from it, on a rest track that points away from the fix (6-3)', async () => {
        const {unit} = await armedNearIafFaf();
        const nav = unit.props.memory.navPage;

        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ENRAA', 'TXOAA', 'TXOAA', 'MAPAA', 'KPRC']);
        expect(nav.activeWaypoint.getActiveFplIdx()).toBe(1);
        expect(nav.activeWaypoint.getActiveLeg()!.fixType).toBe(KLNFixType.IAF);
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('TXOAA');
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.errors).toEqual([]);
    });

    it.fails('switches to APR within 2 NM of the fix, heading toward it (#129)', async () => {
        const {unit, txo} = await armedNearIafFaf();
        const nav = unit.props.memory.navPage;

        await moveAircraft(unit, pointFrom(txo, 0, 1.55), {groundspeedKt: 120, trackTrue: 180});

        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(180, 0);
        expect(nav.navmode).toBe(NavMode.APR_LEG);
    });
});
