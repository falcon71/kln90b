import {GeoPoint, SimVarValueType} from '@microsoft/msfs-sdk';
import {GpsErrorModel, SIGMA_DOPPLER_MPS} from './GpsErrorModel';
import {GpsPositionFilter} from './GpsPositionFilter';
import {GpsGeometry, SIGMA_UERE_M} from './GpsSolution';

/** What the strategy needs besides the truth: the receiver solution of the satellites in use (#402, design 6.4) */
export interface MeasurementInputs {
    /** From computeGeometry. Its cNorth and cEast give the measurement noise of the filter */
    geometry: GpsGeometry;
    /** The satellites in use, in the row order of the coefficients */
    prns: readonly number[];
    /** From computeGeometry, for the same rows as prns, plus the altitude row last */
    coefficients: Float64Array;
    /** The altitude input of the unit in feet, or null when it has none */
    indicatedAltitudeFt: number | null;
}

/**
 * Where the position, the ground speed and the track of the unit come from while it has a fix (#402, design 6.1).
 * GPS.tick calls `update` once per calculation tick while the unit has a fix. GPS.gpsAcquired calls `restart` and then
 * `update` at every fix: outside the tick for a forced acquisition, or inside the acquisition tick, which then calls
 * `update` a second time at the same `simTimeS`; that second call must hold the outputs. The take-home mode does not use
 * it.
 */
export interface GpsMeasurement {
    /**
     * @param simTimeS The sim time in seconds, for the elapsed time between two updates
     * @param truthLat The sim position in degrees
     * @param truthLon The sim position in degrees
     */
    update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void;

    /** The next update starts from its measurement with no history */
    restart(): void;

    /** Degrees */
    readonly lat: number;
    /** Degrees */
    readonly lon: number;
    readonly groundspeedKt: number;
    /** True track in degrees [0, 360). Null when the last update gives no track */
    readonly trackTrue: number | null;
}

/** The earth radius of the SDK's geo classes, in meters */
const EARTH_RADIUS_M = 6378100;
const RAD_TO_DEG = 180 / Math.PI;
/** Near the poles the east-west scale cos(lat) goes to 0. It stays above this, so that nothing divides by zero. */
const MIN_COS_LAT = 1e-4;
const MPS_PER_KNOT = 1852 / 3600;
const METERS_PER_FOOT = 0.3048;
/** A gap in the sim time beyond this restarts the filter, but not the error processes (design 6.7) */
const MAX_UPDATE_GAP_S = 30;
/**
 * The move of the truth differs from what the filter's velocity or the sim's predicts by more than this: slew, teleport
 * or a new flight (design 6.7). In flight the difference is the acceleration's a · dt² / 2.
 */
const JUMP_DISTANCE_M = 50;
/**
 * The allowance grows with dt² by this acceleration, about 2 g, so that a turn under time acceleration, where one tick is
 * several seconds of sim time, is no jump
 */
const JUMP_ACCELERATION_MPS2 = 20;
/** The allowance stops growing at 1 NM */
const MAX_JUMP_DISTANCE_M = 1852;
/**
 * The truth moved less than this share of what the filter's velocity predicts: the sim is paused. The sim time runs on in
 * the active pause and in the pause, and the velocity keeps its last value, but the aircraft stands still (flight 1 in
 * the sim, 2026-11-02).
 */
const PAUSE_MOVED_SHARE = 0.1;
/** Below this the velocity explains too little to tell a pause from an aircraft at rest */
const PAUSE_MIN_EXPLAINED_M = 1;

/**
 * Today's behavior: the position is the sim position, the ground speed is the sim's, and the track is the bearing from
 * the last to the current position. It draws no random numbers.
 */
export class ExactMeasurement implements GpsMeasurement {
    public lat = 0;
    public lon = 0;
    public groundspeedKt = 0;
    public trackTrue: number | null = null;

    private previous = new GeoPoint(0, 0);
    private current = new GeoPoint(0, 0);
    private hasPrevious = false;

    public update(_simTimeS: number, truthLat: number, truthLon: number, _inputs: MeasurementInputs): void {
        // Swap, so that nothing is allocated
        const swap = this.previous;
        this.previous = this.current;
        this.current = swap;
        this.current.set(truthLat, truthLon);

        this.lat = truthLat;
        this.lon = truthLon;
        this.groundspeedKt = SimVar.GetSimVarValue('GROUND VELOCITY', SimVarValueType.Knots);

        //3-34 The track is the bearing of the move. It is held while the position does not change (the sim is paused)
        if (this.hasPrevious && !this.previous.equals(this.current)) {
            this.trackTrue = this.previous.bearingTo(this.current);
        } else {
            this.trackTrue = null;
        }
        this.hasPrevious = true;
    }

    public restart(): void {
        this.hasPrevious = false;
    }
}

/**
 * The truth plus the errors of a simulated receiver, filtered (#402, design 6.3 to 6.7). The slow and fast ranging
 * errors of the satellites in use are mapped to a position and a velocity error, which are added to the truth. The
 * position filter smooths that measurement, and its output is what the unit sees.
 *
 * Nothing allocates in `update`. The collaborators can be injected, for tests.
 */
export class SimulatedMeasurement implements GpsMeasurement {
    public lat = 0;
    public lon = 0;
    public groundspeedKt = 0;
    public trackTrue: number | null = null;

    private lastTimeS = 0;
    /** Whether there was a successful update since the construction or the last restart */
    private hasReference = false;
    private lastTruthLat = 0;
    private lastTruthLon = 0;
    /** Position error north and east (m), velocity error north and east (m/s) */
    private readonly errors = new Float64Array(4);

    constructor(random: () => number = Math.random,
                private readonly errorModel: GpsErrorModel = new GpsErrorModel(random),
                private readonly filter: GpsPositionFilter = new GpsPositionFilter()) {
    }

    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        // Whatever is not a number must not enter the state, and a skipped update leaves the time reference alone, so
        // that the next good one takes the whole elapsed time
        if (!Number.isFinite(simTimeS) || !Number.isFinite(truthLat) || !Number.isFinite(truthLon)) {
            return;
        }

        let dt = 0;
        if (this.hasReference) {
            dt = simTimeS - this.lastTimeS;
            if (dt === 0) {
                // The same sim time: the second update of the acquisition tick, held
                return;
            }
        }

        const velocityNorth = SimVar.GetSimVarValue('VELOCITY WORLD Z', SimVarValueType.MetersPerSecond);
        const velocityEast = SimVar.GetSimVarValue('VELOCITY WORLD X', SimVarValueType.MetersPerSecond);
        if (!Number.isFinite(velocityNorth) || !Number.isFinite(velocityEast)) {
            this.truthWithoutReference(truthLat, truthLon);
            return;
        }

        if (this.hasReference && dt < 0) {
            // The clock went backwards (a new flight): nothing is known any more
            this.restart();
            dt = 0;
        }

        const cosLat = Math.max(MIN_COS_LAT, Math.cos(truthLat / RAD_TO_DEG));
        if (this.hasReference) {
            let movedLon = truthLon - this.lastTruthLon;
            if (movedLon > 180) {
                movedLon -= 360;
            } else if (movedLon < -180) {
                movedLon += 360;
            }
            const movedNorthM = (truthLat - this.lastTruthLat) / RAD_TO_DEG * EARTH_RADIUS_M;
            const movedEastM = movedLon / RAD_TO_DEG * EARTH_RADIUS_M * cosLat;
            // The move the filter predicts
            const explainedNorthM = this.filter.vNorth * dt;
            const explainedEastM = this.filter.vEast * dt;
            const explainedM = Math.hypot(explainedNorthM, explainedEastM);

            if (explainedM >= PAUSE_MIN_EXPLAINED_M && Math.hypot(movedNorthM, movedEastM) < PAUSE_MOVED_SHARE * explainedM) {
                // The sim is paused: everything is held. The reference time follows, so that the first update after the
                // pause is no gap
                this.lastTimeS = simTimeS;
                return;
            }

            const allowanceM = Math.min(JUMP_DISTANCE_M + JUMP_ACCELERATION_MPS2 * dt * dt / 2, MAX_JUMP_DISTANCE_M);
            if (dt > MAX_UPDATE_GAP_S) {
                // The unit was not ticking: the filter's prediction is worth nothing over so long a gap. The satellites
                // are the same ones, and the Gauss-Markov step of their errors is exact for any dt (design 6.7)
                this.filter.restart();
            } else if (Math.hypot(movedNorthM - explainedNorthM, movedEastM - explainedEastM) > allowanceM
                || Math.hypot(movedNorthM - velocityNorth * dt, movedEastM - velocityEast * dt) > allowanceM) {
                // Slew or teleport. A slew reads a velocity of 0 at its first and last tick: either the filter's
                // velocity or the sim's misses the move, and the filter would follow it. Only the filter jumps; the
                // error processes go on
                this.filter.restart();
            }
        }

        let altitudeErrorM: number | null = null;
        if (inputs.indicatedAltitudeFt !== null) {
            const trueAltitudeFt = SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Feet);
            altitudeErrorM = (inputs.indicatedAltitudeFt - trueAltitudeFt) * METERS_PER_FOOT;
        }
        this.errorModel.update(dt, inputs.prns, inputs.coefficients, altitudeErrorM, this.errors);
        const errorNorth = this.errors[0];
        const errorEast = this.errors[1];
        const velocityErrorNorth = this.errors[2];
        const velocityErrorEast = this.errors[3];
        if (!Number.isFinite(errorNorth) || !Number.isFinite(errorEast)
            || !Number.isFinite(velocityErrorNorth) || !Number.isFinite(velocityErrorEast)) {
            this.truthWithoutReference(truthLat, truthLon);
            return;
        }

        const measuredLat = truthLat + errorNorth / EARTH_RADIUS_M * RAD_TO_DEG;
        const measuredLon = truthLon + errorEast / (EARTH_RADIUS_M * cosLat) * RAD_TO_DEG;
        const geometry = inputs.geometry;
        this.filter.update(dt, measuredLat, measuredLon,
            velocityNorth + velocityErrorNorth, velocityEast + velocityErrorEast,
            SIGMA_UERE_M * SIGMA_UERE_M * geometry.cNorth, SIGMA_UERE_M * SIGMA_UERE_M * geometry.cEast,
            SIGMA_DOPPLER_MPS * SIGMA_DOPPLER_MPS * geometry.cNorth, SIGMA_DOPPLER_MPS * SIGMA_DOPPLER_MPS * geometry.cEast);

        this.lastTimeS = simTimeS;
        this.lastTruthLat = truthLat;
        this.lastTruthLon = truthLon;
        this.hasReference = true;

        this.lat = this.filter.lat;
        this.lon = this.filter.lon;
        const speed = Math.hypot(this.filter.vNorth, this.filter.vEast);
        this.groundspeedKt = speed / MPS_PER_KNOT;
        // The sum with 360 keeps a tiny negative angle from rounding to 360
        this.trackTrue = speed === 0 ? null : (Math.atan2(this.filter.vEast, this.filter.vNorth) * RAD_TO_DEG + 360) % 360;
    }

    /**
     * A skipped update holds the outputs. Without a reference there is nothing worth holding (the first update after the
     * construction or a restart, where GPS takes the position of a new fix), so the outputs become the truth, at rest.
     * The reference stays unset: the next good update starts from its measurement
     */
    private truthWithoutReference(truthLat: number, truthLon: number): void {
        if (this.hasReference) {
            return;
        }
        this.lat = truthLat;
        this.lon = truthLon;
        this.groundspeedKt = 0;
        this.trackTrue = null;
    }

    public restart(): void {
        this.filter.restart();
        this.errorModel.reset();
        this.hasReference = false;
    }
}
