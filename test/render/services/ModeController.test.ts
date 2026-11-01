import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {airport, intersection} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {APR_ARM_SWITCH, NO_ALTIMETER, PanelOptions, panelXml} from '../../harness/panelXml';
import {savedFlightplan} from '../../harness/storage';
import {activeIdent, fplIdents, messageLines, messages} from '../../harness/readers';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {crossTrackNm, distanceNm, pointBefore, pointFrom} from '../../harness/flight/geo';
import {KLNFixType} from '../../../kln90b/data/flightplan/Flightplan';
import {NavMode} from '../../../kln90b/data/VolatileMemory';
import {inhibitAllBut, liftInhibits} from '../../harness/gps';
import {GpsGeometry, predictRaim, Raim, raimStatus} from '../../../kln90b/GpsSolution';
import {RAIM_ENROUTE_NOT_APPROACH, stubSatellites} from '../../harness/predictionStub';
import {EVT_APPR_ARM} from '../../../kln90b/HEvents';

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
        expect(unit.props.modeController.getObsMag()).toBe(77);
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

// The approach to KPRC of the ARM to ACTV tests (6-3)
const kprc = airport('KPRC', 47.0, 8.0);
const mapaa = intersection('MAPAA', 47.0, 8.0);
// The final course is 180: the FAF is 5 NM north of the MAP. At rest the unit's GPS track is 0, so a final course within
// 110 degrees of 000 would switch to APR before the aircraft moves.
const fafPos = pointFrom(mapaa, 0, 5);
const fafaa = intersection('FAFAA', fafPos.lat, fafPos.lon);

/**
 * The IF is 5 NM and the IAF 10 NM before the FAF on the inbound track, which may differ from the final course; the
 * unit starts 1.6 NM before the FAF on that track with the FAF active and the mode ARM. `panel` adds panel.xml options.
 */
async function armedNearFaf(inboundTrack: number, panel: PanelOptions = {}) {
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
        panelXml: panelXml({...APR_ARM_SWITCH, ...panel}),
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

// 6-3: the unit switches from ARM to APR when the FAF is the active waypoint and the aircraft is within 2 NM of it and
// heading toward it. 633fdad widened the allowed difference between the track and the final course to 110 degrees.
describe('arming to approach active at the FAF (633fdad)', () => {
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
    // or 3, ACTV = 2 or 3"; 6-1 for the ARM annunciator).
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

// #453, design 5.5. 6-3: ACTV also needs integrity predicted at the FAF and the MAP for their ETAs, and RAIM available now
// (the 0.3 NM limit). 6-20, B-3: otherwise the unit stays in ARM with the inhibit message and checks again for as long
// as the gate checks. B-1, B-3, 6-20: a loss of integrity in ACTV flags the navigation, and GPS APR brings it back for the
// missed approach. The design's 5.6 lists these as flight tests; moveAircraft observes them more cheaply here
describe('integrity at the approach (6-3, 6-20, #453)', () => {
    const INHIBITED = 'RAIM NOT AVAILABLE APR MODE INHIBITED PREDICT RAIM ON STA 5';
    const PRESS_APR = 'PRESS GPS APR FOR NAV';
    const APPROACH_RAIM = 'BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE';
    const COVERAGE = 'SATELLITE COVERAGE INADEQUATE FOR NAV';

    /** Inhibits every satellite on the STA 5 prediction context only; the receiver keeps them all */
    async function inhibitPrediction(unit: HeadlessUnit): Promise<void> {
        const prediction = unit.props.sensors.in.gps.raimPrediction;
        await prediction.awaitInit();
        for (const sat of prediction.getSatellites()) {
            prediction.setSatelliteInhibit(sat.prn, true);
        }
    }

    /** Waits until the model has n measurements: the SDK drops an inhibited satellite at its next position update, every 5 s */
    async function untilMeasurements(unit: HeadlessUnit, n: number): Promise<void> {
        const gps = unit.props.sensors.in.gps;
        for (let s = 0; s < 12 && gps.solution.measurements !== n; s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.solution.measurements).toBe(n);
    }

    /** Waits until the unit's fix is valid or not; after a lift of the inhibits the SDK takes about 14 s to use satellites again */
    async function untilValid(unit: HeadlessUnit, valid: boolean): Promise<void> {
        const gps = unit.props.sensors.in.gps;
        for (let s = 0; s < 120 && gps.isValid() !== valid; s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(valid);
    }

    /** In APR, 1.55 NM before the FAF, on a unit without an altitude input */
    async function inApr() {
        const {unit, nav, inboundTrack} = await armedNearFaf(80, NO_ALTIMETER);
        await flyOn(unit, inboundTrack);
        expect(nav.navmode).toBe(NavMode.APR_LEG); // Precondition
        return {unit, nav};
    }

    /** In APR with the integrity flag set by a loss of the fix, and the fix back */
    async function flaggedWithFixBack() {
        const {unit, nav} = await inApr();
        inhibitAllBut(unit, 0);
        await untilValid(unit, false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav.integrityFlag).toBe(true); // Precondition: flagged
        liftInhibits(unit);
        await untilValid(unit, true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav.navmode).toBe(NavMode.APR_LEG); // Preconditions: still in APR, flagged, with a fix
        expect(nav.integrityFlag).toBe(true);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        return {unit, nav};
    }

    it('stays in ARM and posts the inhibit message when RAIM is predicted unavailable', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await inhibitPrediction(unit);

        await flyOn(unit, inboundTrack);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(messages(unit)).toContain(INHIBITED);

        unit.props.sensors.in.gps.raimPrediction.syncSatelliteInhibitWithParent();
        for (let s = 0; s < 11 && nav.navmode !== NavMode.APR_LEG; s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(messages(unit)).not.toContain(INHIBITED);
        expect(unit.errors).toEqual([]);
    });

    // The retry rate is our own choice (at most every 10 s): a prediction is cheap, but it need not run every second
    it('retries a refused check every 10 s, not every tick', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(nav.navmode).toBe(NavMode.ARM_LEG); // Precondition: refused
        const setPosition = vi.spyOn(unit.props.sensors.in.gps.raimPrediction, 'setPosition');

        await vi.advanceTimersByTimeAsync(25_000);

        // Two or three checks in 25 s, each stopping at the FAF, which fails
        expect(setPosition.mock.calls.length).toBeGreaterThanOrEqual(2);
        expect(setPosition.mock.calls.length).toBeLessThanOrEqual(3);
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
    });

    it('the inhibit message leaves when the gate stops checking', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(messages(unit)).toContain(INHIBITED); // Precondition

        await moveAircraft(unit, pointFrom(fafaa, inboundTrack + 180, 3), {groundspeedKt: 120, trackTrue: inboundTrack});

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(nav.aprIntegrityInhibit).toBe(false);
        expect(messages(unit)).not.toContain(INHIBITED);
    });

    it('the inhibit message leaves when the FAF is no longer active', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(messages(unit)).toContain(INHIBITED); // Precondition

        await unit.panel.directTo('MAPAA');

        expect(activeIdent(unit)).toBe('MAPAA'); // Preconditions: the MAP is active, and the unit is still in ARM
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(nav.aprIntegrityInhibit).toBe(false);
        expect(messages(unit)).not.toContain(INHIBITED);
    });

    // 6-3: the predictions are for the FAF and the MAP, each at its ETA from the ground speed: 1.55 NM to the FAF at 120 kt
    // is 46.5 s, and the 5 NM from the FAF to the MAP another 150 s
    it('predicts at the FAF and at the MAP for their ETAs (6-3)', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        const gps = unit.props.sensors.in.gps;
        const setPosition = vi.spyOn(gps.raimPrediction, 'setPosition');

        await flyOn(unit, inboundTrack);
        const now = gps.timeZulu.getTimestamp(); // The time of the last calculation tick, the one of the check

        expect(nav.navmode).toBe(NavMode.APR_LEG); // Precondition: the check passed
        const calls = setPosition.mock.calls;
        expect(calls).toHaveLength(2);
        const [[fafLat, fafLon, , fafTime], [mapLat, mapLon, , mapTime]] = calls;
        expect(fafLat).toBeCloseTo(fafaa.lat, 6);
        expect(fafLon).toBeCloseTo(fafaa.lon, 6);
        expect(mapLat).toBeCloseTo(mapaa.lat, 6);
        expect(mapLon).toBeCloseTo(mapaa.lon, 6);
        expect(Math.abs(fafTime - now - 46_500)).toBeLessThan(100);
        expect(Math.abs(mapTime - fafTime - 150_000)).toBeLessThan(100);
    });

    it('ACTV also needs RAIM now', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        inhibitAllBut(unit, 4);
        // The prediction keeps every satellite
        for (const prn of [...gps.raimPrediction.inhibitedSatellitePrnCodes.get()]) {
            gps.raimPrediction.setSatelliteInhibit(prn, false);
        }
        await untilMeasurements(unit, 4);
        expect(gps.isValid()).toBe(true); // Preconditions: a fix of four satellites, and integrity predicted at the FAF and the MAP
        expect(predictRaim(gps.raimPrediction, fafaa.lat, fafaa.lon, gps.timeZulu.getTimestamp(), false, 0.3)).toBe(true);
        expect(predictRaim(gps.raimPrediction, mapaa.lat, mapaa.lon, gps.timeZulu.getTimestamp(), false, 0.3)).toBe(true);

        await flyOn(unit, inboundTrack);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(messages(unit)).toContain(INHIBITED);
    }, 60_000);

    /** A solution of the model with the given count and slope, the SDK's satellites unchanged */
    function spySolution(unit: HeadlessUnit, measurements: number, maxSlope: number) {
        const geometry: GpsGeometry = {valid: true, satellites: measurements, altitudeAided: false, measurements, hdop: 1, epeNm: 0.01, maxSlope};
        return vi.spyOn(unit.props.sensors.in.gps, 'solution', 'get').mockReturnValue(geometry);
    }

    // Design 5.2: the gate checks RAIM for the 0.3 NM limit of ACTV. HPL 40 x 5 m x 5.3 = 0.57 NM: within the 1 NM of ARM
    // and the 2 NM en route, beyond 0.3 NM
    it('ACTV needs RAIM for the approach limit of 0.3 NM', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        spySolution(unit, 6, 40);

        await flyOn(unit, inboundTrack);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(messages(unit)).toContain(INHIBITED);
    });

    // Design 5.5: the flag counts RAIM for the 0.3 NM limit too (the slope as above)
    it('in APR, a geometry beyond the approach limit flags the navigation after 2 minutes', async () => {
        const {unit, nav} = await inApr();
        spySolution(unit, 6, 40);

        await vi.advanceTimersByTimeAsync(119_000);
        expect(nav.integrityFlag).toBe(false);
        await vi.advanceTimersByTimeAsync(3000);

        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(nav.integrityFlag).toBe(true);
        expect(nav.xtkToActive).toBeNull();
    }, 120_000);

    // The tick that leaves APR by itself (the approach is no longer in FPL 0) clears the flag at once, not a tick later
    it('the flag goes in the tick that leaves APR when the approach is removed', async () => {
        const {unit, nav} = await flaggedWithFixBack();

        unit.props.memory.fplPage.flightplans[0].removeProcedures();
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.ENR_LEG); // Precondition: the tick left APR
        expect(nav.integrityFlag).toBe(false);
        expect(messages(unit)).not.toContain(PRESS_APR);
    }, 120_000);

    // Design 5.5: the predictions at the FAF and the MAP are for the 0.3 NM limit too. The prediction context hands out a
    // geometry with RAIM for 2 NM and 1 NM but not 0.3 NM without an altitude (predictionStub.ts); the live solution is the
    // real, healthy one
    it('the predictions check the approach limit of 0.3 NM', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80, NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        vi.spyOn(gps.raimPrediction, 'getSatellites').mockReturnValue(stubSatellites(RAIM_ENROUTE_NOT_APPROACH));
        expect(raimStatus(gps.solution, 0.3)).toBe(Raim.Available); // Precondition: RAIM now is not what refuses

        await flyOn(unit, inboundTrack);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(messages(unit)).toContain(INHIBITED);
    });

    // 5-29, design 5.2: the altitude is a measurement of the predictions as of the live solution. Four satellites in use
    // at zenith 45 degrees, 90 degrees apart, give no RAIM on their own (four measurements); with the altitude row the
    // slope is the square root of 2 whatever the limit (test/unit/GpsSolution.test.ts, computed with numpy). The live solution is the
    // real, healthy one
    describe('the altitude input in the predictions', () => {
        const FOUR_IN_USE: readonly [number, number][] = [[45, 0], [45, 90], [45, 180], [45, 270]];

        it('goes to ACTV with four satellites predicted and an altitude input', async () => {
            const {unit, nav, inboundTrack} = await armedNearFaf(80);
            vi.spyOn(unit.props.sensors.in.gps.raimPrediction, 'getSatellites').mockReturnValue(stubSatellites(FOUR_IN_USE));

            await flyOn(unit, inboundTrack);

            expect(nav.navmode).toBe(NavMode.APR_LEG);
            expect(messages(unit)).not.toContain(INHIBITED);
        });

        it('stays in ARM with the inhibit message with four satellites predicted and no altitude input', async () => {
            const {unit, nav, inboundTrack} = await armedNearFaf(80, NO_ALTIMETER);
            const gps = unit.props.sensors.in.gps;
            vi.spyOn(gps.raimPrediction, 'getSatellites').mockReturnValue(stubSatellites(FOUR_IN_USE));
            expect(raimStatus(gps.solution, 0.3)).toBe(Raim.Available); // Precondition: RAIM now is not what refuses

            await flyOn(unit, inboundTrack);

            expect(nav.navmode).toBe(NavMode.ARM_LEG);
            expect(messages(unit)).toContain(INHIBITED);
        });
    });

    // Each of the two predictions checks the 0.3 NM limit on its own: the geometry above only where the prediction is made
    // for that fix, the real sky elsewhere
    it.each(['FAFAA', 'MAPAA'])('the prediction at %s checks the approach limit of 0.3 NM', async (ident) => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80, NO_ALTIMETER);
        const prediction = unit.props.sensors.in.gps.raimPrediction;
        const fix = ident === 'FAFAA' ? fafaa : mapaa;
        const real = prediction.getSatellites.bind(prediction);
        const stub = stubSatellites(RAIM_ENROUTE_NOT_APPROACH);
        vi.spyOn(prediction, 'getSatellites').mockImplementation(() => distanceNm(prediction.getLatLon(), fix) < 0.01 ? stub : real());

        await flyOn(unit, inboundTrack);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(messages(unit)).toContain(INHIBITED);
    });

    // The count of a RAIM loss belongs to one APR period. The gate checks RAIM in an ARM tick, so a unit can leave APR
    // with a running count, pass the gate on good RAIM and be back in APR within seconds: the 2 minutes start again
    it('a RAIM loss count of an earlier APR period does not carry over', async () => {
        const {unit, nav} = await inApr();
        const spy = spySolution(unit, 6, 40);
        await vi.advanceTimersByTimeAsync(100_000);
        expect(nav.integrityFlag).toBe(false); // Precondition: 100 s counted, no flag yet
        spy.mockRestore();
        await unit.panel.press(EVT_APPR_ARM);
        for (let s = 0; s < 5 && nav.navmode !== NavMode.APR_LEG; s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(nav.navmode).toBe(NavMode.APR_LEG); // Precondition: back in APR on good RAIM

        spySolution(unit, 6, 40);
        await vi.advanceTimersByTimeAsync(30_000);

        expect(nav.integrityFlag).toBe(false);
        expect(nav.xtkToActive).not.toBeNull();
    }, 120_000);

    // 6-1: GPS APR in ARM disarms; the inhibit belongs to ARM
    it('the inhibit message leaves when the pilot disarms', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(messages(unit)).toContain(INHIBITED); // Precondition

        await unit.panel.press(EVT_APPR_ARM);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.ENR_LEG);
        expect(nav.aprIntegrityInhibit).toBe(false);
        expect(messages(unit)).not.toContain(INHIBITED);
    });

    // 6-3: the gate does not check in OBS (ARM-OBS never goes to ACTV)
    it('the inhibit message leaves when the unit goes to OBS', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(messages(unit)).toContain(INHIBITED); // Precondition

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.ARM_OBS);
        expect(nav.aprIntegrityInhibit).toBe(false);
        expect(messages(unit)).not.toContain(INHIBITED);
    });

    // A clock that goes back (a time set on SET 2, a sim time moved back) must not hold the retry back until the clock
    // has caught up again
    it('a clock that went back does not hold the retry back', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        const gps = unit.props.sensors.in.gps;
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(nav.navmode).toBe(NavMode.ARM_LEG); // Precondition: refused
        gps.raimPrediction.syncSatelliteInhibitWithParent();
        const before = gps.timeZulu.getTimestamp();

        unit.env.sim.absoluteTimeOffsetMs = -10 * 60_000;
        await vi.advanceTimersByTimeAsync(3000);

        expect(gps.timeZulu.getTimestamp()).toBeLessThan(before - 9 * 60_000); // Precondition: the unit's clock went back
        expect(gps.isValid()).toBe(true);
        expect(nav.navmode).toBe(NavMode.APR_LEG); // Within 3 s, not 10 s after the refusal
    });

    // Without a fix the position and the track are frozen and ACTV is impossible: the gate stops checking, and SATELLITE
    // COVERAGE INADEQUATE FOR NAV says why (B-4). The track toward the FAF is frozen in from a flight with a refused gate
    it('no inhibit message without a fix, only the coverage message', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        const gps = unit.props.sensors.in.gps;
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(messages(unit)).toContain(INHIBITED); // Precondition: refused with the track toward the FAF

        inhibitAllBut(unit, 0);
        await untilValid(unit, false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(gps.trackTrue).toBeCloseTo(80, 0); // Preconditions: the frozen track and position would pass the gate
        expect(distanceNm(gps.coords, fafaa)).toBeLessThan(2);
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(nav.aprIntegrityInhibit).toBe(false);
        const listed = messages(unit);
        expect(listed).toContain(COVERAGE);
        expect(listed).not.toContain(INHIBITED);
    }, 60_000);

    // B-3, 6-20: the flag set by the loss of the fix asks for GPS APR at once, while the fix is still lost
    it('lists PRESS GPS APR FOR NAV while the fix is still lost', async () => {
        const {unit, nav} = await inApr();
        inhibitAllBut(unit, 0);
        await untilValid(unit, false);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // Precondition: still lost
        expect(nav.navmode).toBe(NavMode.APR_LEG);
        const listed = messages(unit);
        expect(listed).toContain(PRESS_APR);
        expect(listed).toContain(COVERAGE);
    }, 60_000);

    // B-1: BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE first, a NAV flag some minutes later (B-1 gives no figure): 2
    // minutes is the design's low-confidence call. B-3, 6-20: then PRESS GPS APR FOR NAV, and GPS APR goes to ARM with navigation
    it('in APR, a RAIM loss flags the navigation after 2 minutes and asks for GPS APR (B-1, B-3, 6-20)', async () => {
        const {unit, nav} = await inApr();
        inhibitAllBut(unit, 4);
        await untilMeasurements(unit, 4);

        await vi.advanceTimersByTimeAsync(12_000);
        expect(messages(unit)).toContain(APPROACH_RAIM);
        expect(nav.xtkToActive).not.toBeNull();

        await vi.advanceTimersByTimeAsync(107_000); // 119 s
        expect(nav.xtkToActive).not.toBeNull();
        expect(messages(unit)).not.toContain(PRESS_APR);

        await vi.advanceTimersByTimeAsync(3000); // 122 s
        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(nav.xtkToActive).toBeNull();
        expect(messages(unit)).toContain(PRESS_APR);

        await unit.panel.press(EVT_APPR_ARM);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(nav.xtkToActive).not.toBeNull();
        expect(messages(unit)).not.toContain(PRESS_APR);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // 6-20: the flag is cleared by the pilot, not by the satellites
    it('the integrity flag stays after the fix comes back, until GPS APR', async () => {
        const {unit, nav} = await flaggedWithFixBack();
        expect(nav.xtkToActive).toBeNull();
        expect(messages(unit)).toContain(PRESS_APR);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(nav.xtkToActive).toBeNull();

        await unit.panel.press(EVT_APPR_ARM);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav.integrityFlag).toBe(false);
        expect(nav.xtkToActive).not.toBeNull();
        expect(messages(unit)).not.toContain(PRESS_APR);
    }, 120_000);

    // 6-3: a Direct To leaves ACTV, and with it the flag goes
    it('a Direct To clears the integrity flag', async () => {
        const {unit, nav} = await flaggedWithFixBack();

        await unit.panel.directTo('MAPAA');

        expect(activeIdent(unit)).toBe('MAPAA'); // Precondition
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(nav.integrityFlag).toBe(false);
        expect(nav.xtkToActive).not.toBeNull();
        expect(messages(unit)).not.toContain(PRESS_APR);
    }, 120_000);

    // Without ground speed the ETAs would be infinite: the prediction is made for the present time instead
    it('ground speed 0 at the gate predicts at the present time (Review Focus 4)', async () => {
        const {unit, nav, inboundTrack} = await armedNearFaf(80);
        const gps = unit.props.sensors.in.gps;
        await inhibitPrediction(unit);
        await flyOn(unit, inboundTrack);
        expect(nav.navmode).toBe(NavMode.ARM_LEG); // Precondition: refused, so the gate checks again
        const setPosition = vi.spyOn(gps.raimPrediction, 'setPosition');
        const from = gps.timeZulu.getTimestamp();

        await moveAircraft(unit, pointFrom(fafaa, inboundTrack + 180, 1.5), {groundspeedKt: 0});
        await vi.advanceTimersByTimeAsync(11_000);

        expect(gps.groundspeed).toBe(0); // Preconditions: standing, and the gate checked again
        const times = setPosition.mock.calls.map(c => c[3]);
        expect(times.length).toBeGreaterThan(0);
        const to = gps.timeZulu.getTimestamp();
        for (const t of times) {
            expect(Number.isFinite(t)).toBe(true);
            expect(t).toBeGreaterThanOrEqual(from);
            expect(t).toBeLessThanOrEqual(to);
        }
        expect(unit.errors).toEqual([]);
    });

    // The flag is state of the power-on (VolatileMemory), and the search after the power-on is no loss of a fix
    it('a power cycle clears the flag and posts no coverage message during the new search (Review Focus 3)', async () => {
        const {unit, nav} = await flaggedWithFixBack();
        const gps = unit.props.sensors.in.gps;

        await unit.panel.powerOff();
        await unit.panel.powerOn();
        expect(nav.integrityFlag).toBe(false);

        const sampled: string[] = [];
        let searched = 0;
        for (let s = 0; s < 300 && !gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
            searched++;
            sampled.push(...messages(unit));
        }
        expect(gps.isValid()).toBe(true); // Preconditions: the search ended with a fix, after some time without one
        expect(searched).toBeGreaterThan(0);
        expect(sampled).not.toContain(COVERAGE);
        expect(sampled).not.toContain(PRESS_APR);
        expect(nav.integrityFlag).toBe(false);
    }, 120_000);
});
