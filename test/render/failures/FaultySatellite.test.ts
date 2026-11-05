import {afterEach, describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle, untilCalcTick} from '../../harness/boot';
import {approachWorld} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {APR_ARM_SWITCH, NO_ALTIMETER, NO_OBS, panelXml} from '../../harness/panelXml';
import {activeIdent, messages} from '../../harness/readers';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {inhibitAllBut} from '../../harness/gps';
import {NavMode} from '../../../kln90b/data/VolatileMemory';
import {EARTH_RADIUS_M} from '../../../kln90b/GpsMeasurement';

/**
 * #460: the faulty satellite's message and what a detected fault does to the integrity (the design
 * docs/superpowers/specs/2026-11-05-failures-gps-receiver-design.md, "The faulty satellite"). RAIM detects the satellite's
 * pseudorange bias and posts RAIM POSITION ERROR (B-3); the integrity output fails, ACTV is refused and APR flags the
 * navigation at once (6-3, 6-20), while en route the navigation stays valid. The harness navigates on ExactMeasurement, so
 * the offset of the unit's position from the sim position is exactly the faulty satellite's error
 */

const POSITION_ERROR = 'RAIM POSITION ERROR CROSS CHECK POSITION';
const RAIM = 'RAIM NOT AVAILABLE CROSS CHECK POSITION';
const INHIBITED = 'RAIM NOT AVAILABLE APR MODE INHIBITED PREDICT RAIM ON STA 5';
const PRESS_APR = 'PRESS GPS APR FOR NAV';
const ALTITUDE_FAIL = 'ALTITUDE FAIL';
const INTEGRITY = 'L:KLN90B_IntegrityWarn';

const DEG_TO_RAD = Math.PI / 180;
/** The highest satellite at KAAA at the harness's start time (the first en route test picks it), for a stored fault */
const FAULTY_PRN = 8;

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * En route at KAAA on the standard route (ABC active). The position stored at the last power-off is where the unit boots,
 * so the boot posts no POSITION DIFFERS message, and without a course input the unit posts no ADJ NAV IND CRS while it
 * stands (4-8)
 */
const enRoute = (panel: Record<string, unknown> = {}) => bootOnStandardRoute({
    panelXml: panelXml({...NO_OBS, ...panel}), storage: {lastLatitude: 47, lastLongitude: 8},
});

const integrityWarn = (unit: HeadlessUnit) => unit.env.sim.lastWrite(INTEGRITY)?.value;

/** The PRNs the SDK has in use */
function inUse(unit: HeadlessUnit): number[] {
    return unit.props.sensors.in.gps.gpsSatComputer.getSatellites()
        .filter(s => s.state.get() === GPSSatelliteState.InUse || s.state.get() === GPSSatelliteState.InUseDiffApplied)
        .map(s => s.prn);
}

/** The satellite in use with the smallest zenith angle, worked out from the SDK's satellites */
function highestInUse(unit: HeadlessUnit): number {
    const used = new Set(inUse(unit));
    const sats = unit.props.sensors.in.gps.gpsSatComputer.getSatellites().filter(s => used.has(s.prn));
    sats.sort((a, b) => a.position.get()[0] - b.position.get()[0]);
    return sats[0].prn;
}

/** The offset of the unit's position from the sim position in meters, north and east */
function offsetM(unit: HeadlessUnit): { north: number, east: number } {
    const sim = unit.env.sim;
    const coords = unit.props.sensors.in.gps.coords;
    const lat = sim.get('PLANE LATITUDE', 'degrees');
    const lon = sim.get('PLANE LONGITUDE', 'degrees');
    return {
        north: (coords.lat - lat) * DEG_TO_RAD * EARTH_RADIUS_M,
        east: (coords.lon - lon) * DEG_TO_RAD * EARTH_RADIUS_M * Math.cos(coords.lat * DEG_TO_RAD),
    };
}

/** The error the faulty satellite's row gives: minus its coefficients times the bias (GpsSolution header), from GPS's solution */
function expectedErrorM(unit: HeadlessUnit): { north: number, east: number, row: number } {
    const gps = unit.props.sensors.in.gps;
    const prns: number[] = (gps as any).solutionPrns;
    const coefficients: Float64Array = (gps as any).solutionCoefficients;
    const row = prns.indexOf(gps.failures.faultyPrn!);
    const bias = gps.failures.faultyBiasM;
    return {north: -coefficients[2 * row] * bias, east: -coefficients[2 * row + 1] * bias, row};
}

/** En route on the standard route (ABC active), the faulty satellite failed, and 300 s later: every ramp is complete */
async function faultedEnRoute(): Promise<HeadlessUnit> {
    const unit = await enRoute();
    expect(messages(unit)).toEqual([]); // Preconditions: a healthy unit
    expect(integrityWarn(unit)).toBe(0);
    unit.props.failures.fail('faultySatellite');
    await vi.advanceTimersByTimeAsync(300_000);
    return unit;
}

describe('the faulty satellite en route (#460)', () => {
    it('is the highest satellite in use, and its error is minus its coefficients times the bias', async () => {
        const unit = await enRoute();
        const gps = unit.props.sensors.in.gps;
        const highest = highestInUse(unit);

        unit.props.failures.fail('faultySatellite');
        expect(gps.failures.faultyPrn).toBe(highest);

        await vi.advanceTimersByTimeAsync(300_000);

        expect(gps.isValid()).toBe(true);
        expect(gps.failures.faultyPrn).toBe(highest); // It stayed in the solution
        expect(gps.failures.faultyBiasM).toBeGreaterThanOrEqual(500);
        const expected = expectedErrorM(unit);
        expect(expected.row).toBeGreaterThanOrEqual(0);
        const offset = offsetM(unit);
        expect(Math.abs(offset.north - expected.north)).toBeLessThan(5);
        expect(Math.abs(offset.east - expected.east)).toBeLessThan(5);
        expect(Math.hypot(offset.north, offset.east)).toBeGreaterThan(50);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // B-3: RAIM detects the fault and the pilot is told to cross check the position
    it('posts RAIM POSITION ERROR', async () => {
        const unit = await faultedEnRoute();

        expect(messages(unit)).toEqual([POSITION_ERROR]);
    }, 60_000);

    it('fails the integrity output (L:KLN90B_IntegrityWarn)', async () => {
        const unit = await faultedEnRoute();

        expect(integrityWarn(unit)).toBe(1);
    }, 60_000);

    // Design, "The faulty satellite": en route the navigation stays valid
    it('does not flag the navigation', async () => {
        const unit = await faultedEnRoute();
        const nav = unit.props.memory.navPage;

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(nav.navmode).toBe(NavMode.ENR_LEG);
        expect(nav.integrityFlag).toBe(false);
        expect(nav.xtkToActive).not.toBeNull();
    }, 60_000);

    it('the repair takes the message, the integrity warning and the position error away', async () => {
        const unit = await faultedEnRoute();
        expect(messages(unit)).toEqual([POSITION_ERROR]); // Preconditions: detected, the position off
        expect(integrityWarn(unit)).toBe(1);
        expect(Math.hypot(offsetM(unit).north, offsetM(unit).east)).toBeGreaterThan(50);

        unit.props.failures.repair('faultySatellite');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.sensors.in.gps.failures.faultyPrn).toBeNull();
        expect(messages(unit)).toEqual([]);
        expect(integrityWarn(unit)).toBe(0);
        const offset = offsetM(unit);
        expect(Math.abs(offset.north)).toBeLessThan(0.01);
        expect(Math.abs(offset.east)).toBeLessThan(0.01);
    }, 60_000);

    it('without a failure the integrity output is good en route, as before', async () => {
        const unit = await enRoute();
        await vi.advanceTimersByTimeAsync(30_000);

        expect(unit.props.sensors.in.gps.failures.faultyPrn).toBeNull();
        expect(integrityWarn(unit)).toBe(0);
        expect(messages(unit)).toEqual([]);
    }, 60_000);

    // 5-29: four satellites without an altitude input give a fix but no RAIM, so RAIM cannot detect the fault: the error is
    // there and nothing says so but the RAIM message
    it('without RAIM the error is there and RAIM POSITION ERROR is not posted', async () => {
        const unit = await enRoute(NO_ALTIMETER);
        const gps = unit.props.sensors.in.gps;
        const kept = inhibitAllBut(unit, 4);
        for (let s = 0; s < 12 && gps.solution.measurements !== 4; s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.solution.measurements).toBe(4); // Precondition: a fix of four satellites
        expect(gps.isValid()).toBe(true);

        unit.props.failures.fail('faultySatellite');
        await vi.advanceTimersByTimeAsync(300_000);

        expect(gps.isValid()).toBe(true);
        expect(kept).toContain(gps.failures.faultyPrn);
        expect(gps.failures.faultyBiasM).toBeGreaterThanOrEqual(500);
        const expected = expectedErrorM(unit);
        expect(expected.row).toBeGreaterThanOrEqual(0);
        const offset = offsetM(unit);
        expect(Math.abs(offset.north - expected.north)).toBeLessThan(5);
        expect(Math.abs(offset.east - expected.east)).toBeLessThan(5);
        expect(Math.hypot(offset.north, offset.east)).toBeGreaterThan(50);
        expect(messages(unit)).toEqual([ALTITUDE_FAIL, RAIM]);
    }, 60_000);
});

/**
 * The approach world of fixtures.ts, booted 7.5 NM north of KPRC between the IF and the FAF, with the approach loaded and
 * armed: the FAF is active, 2.5 NM away, and the rest track of 000 points away from the final course of 180
 */
async function armedBeforeFaf() {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(7.5),
        panelXml: panelXml(APR_ARM_SWITCH),
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    await vi.advanceTimersByTimeAsync(31_000);
    const nav = unit.props.memory.navPage;
    expect(activeIdent(unit)).toBe('FAFAA'); // Preconditions
    expect(nav.navmode).toBe(NavMode.ARM_LEG);
    return {unit, nav, w};
}

/** Inbound on the final course, 1.95 NM before the FAF: the gate checks */
async function intoGate(unit: HeadlessUnit, w: ReturnType<typeof approachWorld>): Promise<void> {
    await moveAircraft(unit, w.north(5 + 1.95), {groundspeedKt: 120, trackTrue: 180});
}

/** Fails the faulty satellite and waits until RAIM detects it for the approach limit of 0.3 NM */
async function untilDetectedForApproach(unit: HeadlessUnit): Promise<void> {
    const failures = unit.props.sensors.in.gps.failures;
    unit.props.failures.fail('faultySatellite');
    for (let s = 0; s < 30 && !failures.faultDetected(0.3); s++) {
        await vi.advanceTimersByTimeAsync(1000);
    }
    expect(failures.faultDetected(0.3)).toBe(true);
}

/** In APR 1.95 NM before the FAF, the faulty satellite failed and detected for the approach limit, one calculation tick later */
async function detectedInApr() {
    const {unit, nav, w} = await armedBeforeFaf();
    await intoGate(unit, w);
    expect(nav.navmode).toBe(NavMode.APR_LEG); // Preconditions: in APR, healthy
    expect(nav.integrityFlag).toBe(false);
    expect(integrityWarn(unit)).toBe(0);
    expect(messages(unit)).not.toContain(POSITION_ERROR);

    await untilDetectedForApproach(unit);
    await untilCalcTick(unit);
    return {unit, nav};
}

describe('the faulty satellite at the approach (#460)', () => {
    // 6-3, B-3: ACTV needs RAIM, and a detected fault is no integrity
    it('in ARM before the FAF, a detected fault refuses ACTV with RAIM NOT AVAILABLE APR MODE INHIBITED', async () => {
        const {unit, nav, w} = await armedBeforeFaf();
        await untilDetectedForApproach(unit);

        await intoGate(unit, w);

        expect(activeIdent(unit)).toBe('FAFAA');
        expect(nav.navmode).toBe(NavMode.ARM_LEG);
        expect(nav.aprIntegrityInhibit).toBe(true);
        expect(messages(unit)).toContain(INHIBITED);
    }, 60_000);

    // 6-20, B-3: a detected fault flags the navigation at once, as a lost fix does, not after the 2 minutes of a RAIM loss
    it('in APR, a detected fault flags the navigation at once and asks for GPS APR', async () => {
        const {unit, nav} = await detectedInApr();

        expect(nav.navmode).toBe(NavMode.APR_LEG);
        expect(nav.integrityFlag).toBe(true);
        expect(nav.xtkToActive).toBeNull();
        expect(messages(unit)).toContain(PRESS_APR);
    }, 60_000);

    // B-3: the message is for every mode, the approach limit of 0.3 NM in APR
    it('in APR, a detected fault posts RAIM POSITION ERROR', async () => {
        const {unit} = await detectedInApr();

        expect(messages(unit)).toContain(POSITION_ERROR);
    }, 60_000);

    it('in APR, a detected fault fails the integrity output', async () => {
        const {unit} = await detectedInApr();

        expect(integrityWarn(unit)).toBe(1);
    }, 60_000);

    // Design, "The faulty satellite": the message and the integrity output ask for the alert limit of the mode (halForMode),
    // 1 NM in ARM. A fault detected for that limit only tells a wrong limit apart
    describe('the alert limit of the mode in ARM', () => {
        /** The messages listed before the fault are returned, as this world posts some of its own at the boot */
        async function detectedForArmOnly() {
            const {unit} = await armedBeforeFaf();
            const before = messages(unit);
            expect(before).not.toContain(POSITION_ERROR); // Preconditions: a healthy unit
            expect(integrityWarn(unit)).toBe(0);
            vi.spyOn(unit.props.sensors.in.gps.failures, 'faultDetected').mockImplementation(hal => hal === 1);
            await vi.advanceTimersByTimeAsync(2000);
            return {unit, before};
        }

        it('posts RAIM POSITION ERROR for the limit of ARM', async () => {
            const {unit, before} = await detectedForArmOnly();

            expect(messages(unit).filter(m => !before.includes(m))).toEqual([POSITION_ERROR]);
        }, 60_000);

        it('fails the integrity output for the limit of ARM', async () => {
            const {unit} = await detectedForArmOnly();

            expect(integrityWarn(unit)).toBe(1);
        }, 60_000);
    });

    // Design, "The faulty satellite": the ACTV check and the APR flag ask for the approach limit of 0.3 NM, also while the
    // unit is still armed (1 NM)
    describe('the approach limit at the gate and in APR', () => {
        const detectedForApproachOnly = (unit: HeadlessUnit) =>
            vi.spyOn(unit.props.sensors.in.gps.failures, 'faultDetected').mockImplementation(hal => hal === 0.3);

        it('refuses ACTV for a fault detected for the approach limit only', async () => {
            const {unit, nav, w} = await armedBeforeFaf();
            detectedForApproachOnly(unit);

            await intoGate(unit, w);

            expect(nav.navmode).toBe(NavMode.ARM_LEG);
            expect(nav.aprIntegrityInhibit).toBe(true);
        }, 60_000);

        it('flags the navigation in APR for a fault detected for the approach limit only', async () => {
            const {unit, nav, w} = await armedBeforeFaf();
            await intoGate(unit, w);
            expect(nav.navmode).toBe(NavMode.APR_LEG); // Precondition
            detectedForApproachOnly(unit);

            await untilCalcTick(unit);

            expect(nav.integrityFlag).toBe(true);
        }, 60_000);
    });
});

// 5-29: during TRAN the solution is valid, but the unit has not accepted the position yet (Gps.isValid). A receiver failure
// takes the satellites out of the unit's solution at once, while the SDK keeps them in use until its next position update
// (design, "Blocked satellites leave the unit's solution at once"); repaired before that, they are all back in the next
// tick, and the stored fault, its ramp complete, is detected in the TRAN tick. Only the accepted fix holds the message back
describe('the faulty satellite during TRAN (#460)', () => {
    it('posts RAIM POSITION ERROR only once the fix is accepted', async () => {
        const unit = await bootOnStandardRoute({
            panelXml: panelXml(NO_OBS),
            storage: {lastLatitude: 47, lastLongitude: 8, failure_faultySatellite: JSON.stringify({prn: FAULTY_PRN, biasM: 2000, rampS: 120, elapsedS: 120})},
        });
        const gps = unit.props.sensors.in.gps;
        expect(messages(unit)).toEqual([POSITION_ERROR]); // Precondition: the stored fault is detected
        unit.props.failures.fail('gpsReceiver');
        await untilCalcTick(unit);
        expect(gps.isValid()).toBe(false); // Precondition: the fix lost
        unit.props.failures.repair('gpsReceiver');

        for (let s = 0; s < 120 && !gps.isTransition(); s++) {
            await untilCalcTick(unit);
        }
        // Preconditions: the TRAN tick, the fault detected for the en route limit, no accepted fix
        expect(gps.isTransition()).toBe(true);
        expect(gps.isValid()).toBe(false);
        expect(gps.failures.faultyPrn).toBe(FAULTY_PRN);
        expect(gps.failures.faultDetected(2)).toBe(true);

        expect(messages(unit)).not.toContain(POSITION_ERROR);

        await untilCalcTick(unit);

        expect(gps.isValid()).toBe(true); // Precondition: accepted
        expect(messages(unit)).toContain(POSITION_ERROR);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
