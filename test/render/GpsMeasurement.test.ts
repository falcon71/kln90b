import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {GeoPoint, GPSSatelliteState, UnitType} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../harness/boot';
import {messages} from '../harness/readers';
import {inhibitAllBut, liftInhibits} from '../harness/gps';
import {ExactMeasurement, MeasurementInputs} from '../../kln90b/GpsMeasurement';
import {GPS} from '../../kln90b/Gps';
import {computeGeometry, GpsGeometry, MAX_ROWS} from '../../kln90b/GpsSolution';

// #402: the unit takes its position, ground speed and track from a measurement strategy (kln90b/GpsMeasurement.ts,
// design 6.1). The harness boots with the exact one unless a test passes simulatedGps.

const POSITION_DIFFERS = 'POSITION DIFFERS FROM LAST POSITION BY >2NM';
const STORED = {lastLatitude: 47, lastLongitude: 8}; //The boot position

const distanceNm = (a: GeoPoint, lat: number, lon: number): number =>
    UnitType.GA_RADIAN.convertTo(a.distance(lat, lon), UnitType.NMILE);

/** The exact strategy, with a log of the calls the unit makes */
class RecordingMeasurement extends ExactMeasurement {
    public readonly calls: ('update' | 'restart')[] = [];
    /** A copy of the inputs of the last update */
    public last: { geometry: GpsGeometry; prns: number[]; coefficients: number[]; indicatedAltitudeFt: number | null } | undefined;
    /** Per update: the sim time it got, and E:ABSOLUTE TIME in seconds at the call */
    public readonly times: [number, number][] = [];

    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        this.calls.push('update');
        this.times.push([simTimeS, SimVar.GetSimVarValue('E:ABSOLUTE TIME', 'seconds')]);
        this.last = {
            geometry: inputs.geometry, prns: [...inputs.prns], coefficients: Array.from(inputs.coefficients),
            indicatedAltitudeFt: inputs.indicatedAltitudeFt,
        };
        super.update(simTimeS, truthLat, truthLon, inputs);
    }

    public restart(): void {
        this.calls.push('restart');
        super.restart();
    }
}

/** A receiver that is 3 NM north of the truth: whatever the unit shows or compares at that offset came from the strategy */
class NorthOffsetMeasurement extends ExactMeasurement {
    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        super.update(simTimeS, truthLat, truthLon, inputs);
        this.lat = truthLat + 3 / 60;
    }
}

/** A receiver with a ground speed and a track of its own, far from those of the sim (0 kt, no move) */
class FixedVelocityMeasurement extends ExactMeasurement {
    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        super.update(simTimeS, truthLat, truthLon, inputs);
        this.groundspeedKt = 77;
        this.trackTrue = 123;
    }
}

/**
 * Records the position the GPS takes at the forced acquisition of an engine-running start. The acquisition happens inside
 * bootUnit, outside the calculation tick (acceptForcedSolution), and the next calculation tick replaces the position; so
 * the spy is on the prototype, installed before the boot. Call it before bootUnit
 */
function positionAtForcedAcquisition(): { position: GeoPoint | undefined } {
    const original = GPS.prototype.acceptForcedSolution;
    const result: { position: GeoPoint | undefined } = {position: undefined};
    const spy = vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
        original.call(this);
        if (result.position === undefined && this.isValid()) {
            result.position = new GeoPoint(this.coords.lat, this.coords.lon);
        }
    });
    onTestFinished(() => spy.mockRestore());
    return result;
}

describe('the GPS measurement strategy (#402, design 6.1)', () => {
    it('the default boot navigates on the exact sim position', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.01234);
        unit.env.sim.set('PLANE LONGITUDE', 'degrees', 8.04321);
        await vi.advanceTimersByTimeAsync(1000);

        //GeoPoint normalizes the angles, which costs the last bits
        expect(gps.coords.lat).toBeCloseTo(47.01234, 12);
        expect(gps.coords.lon).toBeCloseTo(8.04321, 12);
    });

    it('simulatedGps navigates on a measured position near the truth', async () => {
        const unit = await bootUnit({simulatedGps: true});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        await vi.advanceTimersByTimeAsync(60_000);

        expect(gps.isValid()).toBe(true);
        const error = distanceNm(gps.coords, 47, 8);
        expect(error).toBeGreaterThan(0);
        expect(error).toBeLessThan(gps.solution.epeNm);
    });

    // The engine-running start acquires outside the calculation tick (acceptForcedSolution), so the measurement has no
    // history yet when the unit takes its first position
    it('an engine-running start with simulatedGps gives a finite position at once', async () => {
        const acquisition = positionAtForcedAcquisition();
        const unit = await bootUnit({simulatedGps: true, storage: STORED});
        const gps = unit.props.sensors.in.gps;

        const first = acquisition.position!;
        expect(first).toBeDefined();
        expect(Number.isFinite(first.lat) && Number.isFinite(first.lon)).toBe(true);
        expect(distanceNm(first, 47, 8)).toBeLessThan(UnitType.METER.convertTo(100, UnitType.NMILE));

        await settle(unit);
        expect(distanceNm(gps.coords, 47, 8)).toBeLessThan(UnitType.METER.convertTo(100, UnitType.NMILE));
        expect(messages(unit)).not.toContain(POSITION_DIFFERS);
    });

    it('a power cycle restarts the measurement', async () => {
        const measurement = new RecordingMeasurement();
        const unit = await bootUnit({platform: {createGpsMeasurement: () => measurement}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        measurement.calls.length = 0;
        await unit.panel.powerOff();
        expect(measurement.calls).toEqual(['restart']);

        measurement.calls.length = 0;
        await unit.panel.powerOn();
        expect(gps.isValid()).toBe(false); //Precondition: the restart below is that of the power-on, not of a fix
        expect(measurement.calls).toEqual(['restart']);
    });

    // 6.7: the filter starts from the current measurement at every fix, also at a fix regained in flight
    it('a regained fix starts the measurement with no history', async () => {
        const measurement = new RecordingMeasurement();
        const unit = await bootUnit({platform: {createGpsMeasurement: () => measurement}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        inhibitAllBut(unit, 0);
        for (let s = 0; s < 30 && gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(false); //Precondition: the fix is lost
        measurement.calls.length = 0;
        liftInhibits(unit);
        for (let s = 0; s < 300 && !gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(true);

        //The acquisition tick: gpsAcquired restarts and updates, then the valid branch updates at the same sim time
        expect(measurement.calls.slice(0, 3)).toEqual(['restart', 'update', 'update']);
    }, 60_000);

    it('the unit takes the ground speed and the track of the measurement', async () => {
        const unit = await bootUnit({platform: {createGpsMeasurement: () => new FixedVelocityMeasurement()}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        expect(gps.groundspeed).toBe(77);
        expect(gps.trackTrue).toBe(123);
    });

    // The strategy keeps its state from tick to tick on the elapsed sim time: in seconds, as SimulatedMeasurement takes
    // a step of more than 30 s for a gap and restarts
    it('the measurement gets the sim time in seconds, one second apart from tick to tick', async () => {
        const measurement = new RecordingMeasurement();
        const unit = await bootUnit({platform: {createGpsMeasurement: () => measurement}});
        //The first update is that of gpsAcquired at the forced acquisition, which follows its restart
        const firstUpdate = measurement.calls.indexOf('update');
        expect(measurement.calls[firstUpdate - 1]).toBe('restart');
        expect(measurement.times[0][0]).toBe(measurement.times[0][1]);
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(measurement.times.filter(([given, absolute]) => given !== absolute)).toEqual([]);
        const [previous, last] = measurement.times.slice(-2);
        expect(last[0]).toBe(last[1]);
        expect(previous[0]).toBe(previous[1]);
        expect(last[0] - previous[0]).toBeCloseTo(1, 6);
    });

    // #402: one object for the life of the unit, updated in place (maintainer, 2026-11-01): ticks, a lost and a
    // regained fix
    it('keeps one position object that follows the measurement', async () => {
        const unit = await bootUnit({platform: {createGpsMeasurement: () => new NorthOffsetMeasurement()}});
        const gps = unit.props.sensors.in.gps;
        const coords = gps.coords;
        await settle(unit);

        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.2);
        await vi.advanceTimersByTimeAsync(1000);
        expect(gps.coords).toBe(coords);
        expect(coords.lat).toBeCloseTo(47.2 + 3 / 60, 10);

        inhibitAllBut(unit, 0);
        for (let s = 0; s < 30 && gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(false); //Precondition: the fix is lost
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.3);
        liftInhibits(unit);
        for (let s = 0; s < 300 && !gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(true);

        expect(gps.coords).toBe(coords);
        expect(coords.lat).toBeCloseTo(47.3 + 3 / 60, 10);
    }, 60_000);

    // 3-35: the gate stays in GPS, whatever the strategy gives below 2 kt. Wind (OTH 9, CAL 3), the airspace alert and the
    // approach arming read trackTrue as it is. 47/8 to 47.1/8.1 is the true course 34.232 degrees (Gps.test.ts); 47.1/8.1
    // to 47.2/8.1 is due north
    it('keeps the last track below 2 kt (3-35)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        await moveAircraft(unit, {lat: 47.1, lon: 8.1}, {groundspeedKt: 120});
        expect(gps.trackTrue).toBeCloseTo(34.232, 2); //Precondition

        await moveAircraft(unit, {lat: 47.2, lon: 8.1}, {groundspeedKt: 1.9});

        expect(gps.trackTrue).toBeCloseTo(34.232, 2);
    });

    // 6.4: the strategy maps the errors of the satellites in use, and of the altitude input, through the solution
    it('the measurement gets the solution, its satellites and the altitude input', async () => {
        const measurement = new RecordingMeasurement();
        const unit = await bootUnit({altitudeFt: 3000, platform: {createGpsMeasurement: () => measurement}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const inUse = gps.gpsSatComputer.getSatellites().filter(sat =>
            sat.state.get() === GPSSatelliteState.InUse || sat.state.get() === GPSSatelliteState.InUseDiffApplied);
        expect(inUse.length).toBeGreaterThanOrEqual(4); //Precondition: the solution has satellites

        const last = measurement.last!;
        expect(last.geometry).toBe(gps.solution);
        expect(last.geometry.altitudeAided).toBe(true);
        expect(last.prns).toEqual(inUse.map(sat => sat.prn));
        const expected = new Float64Array(2 * MAX_ROWS);
        computeGeometry(inUse.map(sat => sat.position.get()), true, expected);
        expect(last.coefficients).toEqual(Array.from(expected));
        expect(last.indicatedAltitudeFt).not.toBeNull();
        expect(last.indicatedAltitudeFt).toBe(unit.props.sensors.in.airdata.getIndicatedAlt());
        expect(Math.abs(last.indicatedAltitudeFt! - 3000)).toBeLessThan(100); //29.92 inHg: indicated is pressure altitude
    });

    // #456: for a satellite exactly due north or south of the plane, the SDK's acos can round past ±1 and give a NaN
    // azimuth. The solution leaves that satellite out, and the measurement gets the satellites that remain
    it('a satellite whose azimuth is NaN is left out of the solution and the measurement (#456)', async () => {
        const measurement = new RecordingMeasurement();
        const unit = await bootUnit({altitudeFt: 3000, platform: {createGpsMeasurement: () => measurement}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const inUse = gps.gpsSatComputer.getSatellites().filter(sat =>
            sat.state.get() === GPSSatelliteState.InUse || sat.state.get() === GPSSatelliteState.InUseDiffApplied);
        expect(inUse.length).toBeGreaterThanOrEqual(5); //Precondition: four good satellites remain

        const position = new Float64Array([inUse[0].position.get()[0], NaN]);
        vi.spyOn(inUse[0].position, 'get').mockReturnValue(position);
        await vi.advanceTimersByTimeAsync(1000);

        expect(gps.solution.valid).toBe(true);
        expect(gps.solution.satellites).toBe(inUse.length - 1);
        expect(Number.isFinite(gps.solution.hdop)).toBe(true);
        expect(measurement.last!.prns).toEqual(inUse.slice(1).map(sat => sat.prn));
    });

    // 6.7: B-3 compares the position the receiver measured, and the unit navigates on it
    it('the unit takes and compares the measured position, not the truth', async () => {
        const acquisition = positionAtForcedAcquisition();
        const unit = await bootUnit({storage: STORED, platform: {createGpsMeasurement: () => new NorthOffsetMeasurement()}});
        expect(acquisition.position!.lat).toBeCloseTo(47 + 3 / 60, 10); //gpsAcquired
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        expect(messages(unit)).toContain(POSITION_DIFFERS);
        expect(gps.coords.lat).toBeCloseTo(47 + 3 / 60, 10);
        expect(gps.coords.lon).toBeCloseTo(8, 10);
    });
});
