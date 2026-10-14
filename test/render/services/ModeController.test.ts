import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {airport, intersection} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {APR_ARM_SWITCH, panelXml} from '../../harness/panelXml';
import {savedFlightplan} from '../../harness/storage';
import {activeIdent, fplIdents, messageLines} from '../../harness/readers';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {crossTrackNm, pointBefore, pointFrom} from '../../harness/flight/geo';
import {KLNFixType} from '../../../kln90b/data/flightplan/Flightplan';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// The standard world of the flight tests: the final course KAAA - ABC is about 51.0 degrees
const {kaaa, abc} = standardRoute();

describe('ModeController OBS course', () => {
    // 5-34 and 5-35: in OBS the deviation is measured from the selected course through the active waypoint, and the
    // course comes from the external indicator. 014293d: ModeController ticks before NavCalculator, so a course that
    // changed is in the deviation of the same calculation tick instead of one second late.
    it('uses a changed OBS course in the same calculation tick (014293d)', async () => {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await bootOnStandardRoute({position});
        const sim = unit.env.sim;
        sim.set('Nav OBS:1', 'degrees', 51); // Before entering OBS: unset it reads 0
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(sim.get('GPS OBS VALUE', 'degrees')).toBeCloseTo(51, 2);

        sim.set('Nav OBS:1', 'degrees', 100);
        await vi.advanceTimersByTimeAsync(1000); // Exactly one calculation tick

        // The deviation from the course 100 through ABC
        const expectedXtk = crossTrackNm(position, abc, 100);
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

    // The sibling of the pin: the same entry with an OBS course other than the stored one works, so a broken setup fails here.
    // Spec: the OBS course is the one the external indicator shows (5-34), and going from LEG to OBS keeps the active
    // waypoint and takes that course (5-36, rule 2.i); the deviation is measured from it through the waypoint.
    it('measures the deviation from an OBS course of 077 through the waypoint (#122)', async () => {
        const {unit, position} = await enterObsWithCourse(77);
        const nav = unit.props.memory.navPage;

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.obsMag).toBe(77);
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(crossTrackNm(position, abc, 77)).toBeCloseTo(4.38, 1);
        expect(Math.abs(nav.xtkToActive! - crossTrackNm(position, abc, 77))).toBeLessThan(0.05);
    });

    // 5-36: the OBS course is whatever the indicator selects, 000 included. Entering OBS lays the course even when its
    // number equals the stored one, which is 0 at start and after a switch to LEG.
    it('measures the deviation from an OBS course of 000 through the waypoint (#122)', async () => {
        const {unit, position} = await enterObsWithCourse(0);
        const nav = unit.props.memory.navPage;

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(crossTrackNm(position, abc, 0)).toBeCloseTo(-7.77, 1);
        expect(Math.abs(nav.xtkToActive! - crossTrackNm(position, abc, 0))).toBeLessThan(0.05);
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
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        const nav = unit.props.memory.navPage;
        expect(activeIdent(unit)).toBe('FAFAA'); // Preconditions
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
        expect(activeIdent(unit)).toBe('FAFAA');
        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(unit.errors).toEqual([]);
    });

    // The Pilot's Guide does not give the limit; the unit uses 110 degrees, so a track 120 degrees off stays in ARM
    it('stays in ARM with a track of 120 degrees off the final course (characterization, 633fdad)', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(60);

        await flyOn(unit, inboundTrack);

        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(60, 0);
        expect(activeIdent(unit)).toBe('FAFAA');
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.errors).toEqual([]);
    });

    // Public contract: GPS APPROACH MODE is 0 off, 1 ARM, 2 ACTV and 3 self-test (the External Annunciators wiki page, "ARM = 1
    // or 3, ACTV = 2 or 3"; 6-1 for the ARM annunciator). It sits in this describe because armedNearFaf is local to it.
    it('writes GPS APPROACH MODE 1 in ARM and 2 in APR', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.env.sim.lastWrite('GPS APPROACH MODE')!.value).toBe(1);

        await flyOn(unit, inboundTrack);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(unit.env.sim.lastWrite('GPS APPROACH MODE')!.value).toBe(2);
    });

    // No source states the value of GPS IS APPROACH ACTIVE in ARM: the panel.xml customization wiki only lists the SimVar
    // under WriteGPSSimVars. This is what the code writes today, 1 in ARM and in APR.
    it('writes GPS IS APPROACH ACTIVE 1 in ARM and in APR (characterization)', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.env.sim.lastWrite('GPS IS APPROACH ACTIVE')!.value).toBe(1);

        await flyOn(unit, inboundTrack);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(unit.env.sim.lastWrite('GPS IS APPROACH ACTIVE')!.value).toBe(1);
    });
});

/** The approach to KPRC with a fix TXOAA that is IAF and FAF, `nmNorth` NM north of it, loaded in FPL 0 */
async function iafFafWorld(nmNorth: number) {
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
        facilities: [apt, enraa, txo, mapaa], position: pointFrom(txo, 0, nmNorth),
        panelXml: panelXml(APR_ARM_SWITCH),
        storage: {...savedFlightplan(0, [enraa, apt]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    return {unit, txo};
}

// 6-3 lists a waypoint that is the IAF and the FAF at once as the active waypoint of the switch; 6-10 gives the example
// where the unit switches to APR 2 NM from the IAF/FAF. With such a fix the IAF copy is active during the last 2 NM, and
// ActiveWaypoint.getActiveFafLeg() lets it count as the FAF for the switch (#129).
describe('arming to approach active at a fix that is IAF and FAF (#129)', () => {
    const armedNearIafFaf = () => iafFafWorld(1.6);

    // The setup: the IAF copy is active and the unit stays armed 1.6 NM from the fix because the rest track of 0 points
    // away from it
    it('is armed with the IAF copy of the fix active at 1.6 NM from it, on a rest track that points away from the fix (6-3)', async () => {
        const {unit} = await armedNearIafFaf();
        const nav = unit.props.memory.navPage;

        expect(fplIdents(unit)).toEqual(['ENRAA', 'TXOAA', 'TXOAA', 'MAPAA', 'KPRC']);
        expect(nav.activeWaypoint.getActiveFplIdx()).toBe(1);
        expect(nav.activeWaypoint.getActiveLeg()!.fixType).toBe(KLNFixType.IAF);
        expect(activeIdent(unit)).toBe('TXOAA');
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.errors).toEqual([]);
    });

    it('switches to APR within 2 NM of the fix, heading toward it (#129)', async () => {
        const {unit, txo} = await armedNearIafFaf();
        const nav = unit.props.memory.navPage;

        await moveAircraft(unit, pointFrom(txo, 0, 1.55), {groundspeedKt: 120, trackTrue: 180});

        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(180, 0);
        expect(nav.navmode).toBe(NavMode.APR_LEG);
    });

    // 6-3, 6-10: active at the IAF copy, the unit sequences over the zero-length IAF to FAF leg and on to the MAP, and the
    // scale is 0.3 past the FAF
    it('flies on in APR past the fix to the MAP at 0.3 (6-3, 6-10)', async () => {
        const {unit, txo} = await armedNearIafFaf();
        const nav = unit.props.memory.navPage;
        await moveAircraft(unit, pointFrom(txo, 0, 1.55), {groundspeedKt: 120, trackTrue: 180});
        expect(nav.navmode).toBe(NavMode.APR_LEG);

        await moveAircraft(unit, pointFrom(txo, 0, 0.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav.xtkScale).toBeGreaterThan(0.3);
        expect(nav.xtkScale).toBeLessThan(0.7); // On the ramp to 0.3, 0.5 NM before the fix

        await moveAircraft(unit, pointFrom(txo, 180, 1), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(3000);
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(nav.xtkScale).toBe(0.3);
        expect(unit.errors).toEqual([]);
    });
});

// B-1 (the reminder before the FAF, with the approach disarmed). That the IAF copy of a fix that is IAF and FAF is the
// active waypoint on the way to the fix rests on the plan layout and the adjacency characterization of #153, not on B-1
describe('ARM GPS APPROACH at a fix that is IAF and FAF (#369)', () => {
    it('shows ARM GPS APPROACH 2.5 NM before the fix with the IAF copy active and the approach disarmed (reminder: B-1; IAF copy: characterization, #369)', async () => {
        const {unit, txo} = await iafFafWorld(6);
        const nav = unit.props.memory.navPage;
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav.navmode).toBe(NavMode.ARM_LEG); // 11 NM from KPRC: armed by itself
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav.navmode).toBe(NavMode.ENR_LEG);

        await moveAircraft(unit, pointFrom(txo, 0, 2.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(2000);

        expect(nav.activeWaypoint.getActiveLeg()!.fixType).toBe(KLNFixType.IAF);
        expect(messageLines(unit)).toContainEqual(['ARM GPS APPROACH']);
    });
});
