import {describe, expect, it, vi} from 'vitest';
import {GPSSystemState} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../harness/boot';
import {NO_ALTIMETER, panelXml} from '../harness/panelXml';
import {inhibitAllBut, liftInhibits} from '../harness/gps';
import {pointFrom} from '../harness/flight/geo';
import {SIGMA_UERE_M} from '../../kln90b/GpsSolution';

// #453 (design 5.1): the unit's validity comes from its own position solution (kln90b/GpsSolution.ts) over the
// satellites the SDK has in use, with the altitude input as an extra measurement. 5-29: a position needs four
// satellites, or three with an altitude input; the SDK alone needs four.
describe('the GPS solution (5-29, #453)', () => {
    // The model and the SDK's satellite computer invert the same matrix when there is no altitude row: two
    // implementations of one number
    it('the model\'s HDOP equals the SDK\'s without an altitude input (two implementations)', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_ALTIMETER)});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        expect(gps.solution.altitudeAided).toBe(false);
        expect(gps.solution.satellites).toBeGreaterThanOrEqual(4); // Precondition: a real solution, not the empty one
        expect(gps.solution.hdop).toBeCloseTo(gps.gpsSatComputer.hdop, 6);

        // A minute later the satellites have moved (the SDK moves them every 5 s): the model follows them
        const before = gps.solution.hdop;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(gps.solution.hdop).not.toBeCloseTo(before, 6); // Precondition: the geometry has changed
        expect(gps.solution.hdop).toBeCloseTo(gps.gpsSatComputer.hdop, 6);
    });

    // The solution is recomputed only when its inputs change. A recompute has just run for moved satellites, so the next
    // move is 4 s away: the next tick reuses the solution. The cache key includes the altitude input (Airdata reports
    // none until its first tick), so the tick after that recomputes for the altitude alone
    it('reuses the solution while nothing changes, and uses the altitude input from the tick it appears', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_ALTIMETER)});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const seen = gps.solution;
        for (let i = 0; i < 6 && gps.solution === seen; i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.solution).not.toBe(seen); // Precondition: the satellites have just moved
        const moved = gps.solution;
        expect(moved.altitudeAided).toBe(false);

        await vi.advanceTimersByTimeAsync(1000);
        expect(gps.solution).toBe(moved); // Not recomputed: nothing changed

        unit.props.sensors.in.airdata.pressureAltitude = 5000; // Without an altimeter, Airdata.tick leaves it as it is
        await vi.advanceTimersByTimeAsync(1000);

        expect(gps.solution.altitudeAided).toBe(true);
    });

    it('navigates on three satellites with an altitude input, as NAV A (5-29)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        inhibitAllBut(unit, 3);
        await vi.advanceTimersByTimeAsync(10_000);

        expect(gps.gpsSatComputer.pdop).toBe(-1); // The SDK alone has no solution
        expect(gps.isValid()).toBe(true);
        expect(gps.solution.satellites).toBe(3);
        expect(gps.solution.altitudeAided).toBe(true);
    });

    it('loses the fix on three satellites without an altitude input (5-29)', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_ALTIMETER)});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(true);

        inhibitAllBut(unit, 3);
        // The SDK drops the inhibited satellites at its next position update, every 5 s
        for (let i = 0; i < 6 && gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }

        expect(gps.isValid()).toBe(false);
        expect(gps.solution.satellites).toBe(3);
    });

    // Design 5.1: without the sync the SDK's last known position stays where its own solution ended. The satellites that
    // come back lost their channels while inhibited. Beyond 100 NM of its last known position the SDK's line-of-sight
    // filter offers none of them for a free channel (only satellites it already has data from), so it searches blind
    // in PRN order. Measured without the sync (2026-11-01): 524 s with slow acquisition, 23 s with fast (its timeout is
    // 1 s); with the sync 11 s and 13 s. So the test runs with slow acquisition
    it('passes the three-plus-altitude fix to the SDK, so the satellites that come back get their channels at once', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        inhibitAllBut(unit, 3);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(gps.isValid()).toBe(true); // Precondition: three plus altitude
        expect(gps.gpsSatComputer.pdop).toBe(-1); // Precondition: the SDK has no solution of its own

        const start = {lat: 47, lon: 8};
        for (let nm = 10; nm <= 150; nm += 10) {
            await moveAircraft(unit, pointFrom(start, 0, nm), {groundspeedKt: 300});
        }
        expect(gps.isValid()).toBe(true); // Precondition: still three plus altitude, 150 NM from the SDK's last solution
        liftInhibits(unit);
        let seconds = 0;
        for (; seconds < 120 && gps.gpsSatComputer.systemState.get() !== GPSSystemState.SolutionAcquired; seconds++) {
            await vi.advanceTimersByTimeAsync(1000);
        }

        expect(gps.gpsSatComputer.systemState.get()).toBe(GPSSystemState.SolutionAcquired);
        expect(seconds).toBeLessThanOrEqual(20); // A blind search takes minutes
    }, 30_000);

    // The worst geometry of the real constellation (design section 2): near 64.5°S 52°W a tracked satellite sets at
    // 01:50:35Z, and the HDOP jumps from about 1 to about 4.6 with six satellites in use, until a rising satellite is
    // acquired about 50 s later. The fix stays valid. The SDK reduces time to the time of week, so the case repeats
    // every week. It comes from the unit's ephemeris file (resources/.../Assets/gps_ephemeris.json): a changed
    // ephemeris file must fail here, and the case must then be found again.
    // The date lies outside the harness navdata cycle (BootOptions.start), so the data base is out of date; nothing here
    // reads the MSG page
    it('the bad-geometry case of the real constellation (spec 2)', async () => {
        const unit = await bootUnit({
            position: {lat: -64.5, lon: -52}, start: new Date('2026-11-05T01:20:00Z'), altitudeFt: 0,
            panelXml: panelXml(NO_ALTIMETER),
        });
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        await vi.advanceTimersByTimeAsync(Date.parse('2026-11-05T01:50:00Z') - Date.now());
        expect(gps.solution.hdop).toBeLessThan(1.2);

        await vi.advanceTimersByTimeAsync(Date.parse('2026-11-05T01:50:45Z') - Date.now());
        expect(gps.solution.hdop).toBeGreaterThan(4.5);
        expect(gps.solution.satellites).toBe(6);
        expect(gps.isValid()).toBe(true);
    }, 60_000);

    // Take-home mode (TakeHomeMode, Installation manual 1-6, 2-4) flies without satellites, so its solution is a constant
    // healthy one. It uses the altitude input as in flight (5-29), so STA 1 keeps showing NAV A with an altimeter
    it('take-home mode with the engine running stays valid', async () => {
        const unit = await bootUnit({panelXml: panelXml({TakeHomeMode: true})});
        await vi.advanceTimersByTimeAsync(60_000);
        const gps = unit.props.sensors.in.gps;

        expect(gps.isValid()).toBe(true);
        // The constant, not the geometry of the forced acquisition
        expect(gps.solution).toEqual({
            valid: true, satellites: 8, altitudeAided: true, measurements: 8, hdop: 1, cNorth: 0.5, cEast: 0.5,
            epeNm: expect.closeTo(2 * SIGMA_UERE_M / 1852, 12), maxSlope: 0, // The error estimate at HDOP 1
        });
    });

    it('knows whether it had a fix since the power-on', async () => {
        const unit = await bootUnit();
        const gps = unit.props.sensors.in.gps;
        expect(gps.hadFixSincePowerOn).toBe(true); // The forced acquisition of the engine-running start

        await unit.panel.powerOff();
        expect(gps.hadFixSincePowerOn).toBe(false);
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.powerOn();
        expect(gps.hadFixSincePowerOn).toBe(false);

        for (let i = 0; i < 120 && !gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(true);
        expect(gps.hadFixSincePowerOn).toBe(true);
    }, 30_000);

    // Review focus 5: the forced acquisition calls acceptForcedSolution before any tick has computed the solution
    it('an engine-running start is valid at once, without TRAN', async () => {
        const unit = await bootUnit();
        const gps = unit.props.sensors.in.gps;

        expect(gps.isValid()).toBe(true);
        expect(gps.isTransition()).toBe(false);
    });
});
