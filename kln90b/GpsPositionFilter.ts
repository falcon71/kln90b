/** The spectral density of the white acceleration the filter allows: (3 m/s^2)^2, a hard maneuver of a light aircraft */
export const PROCESS_NOISE = 9;

/** The earth radius of the SDK's geo classes, in meters */
const EARTH_RADIUS_M = 6378100;
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
/** Near the poles the east-west scale cos(lat) goes to 0. It stays above this, so that nothing divides by zero. */
const MIN_COS_LAT = 1e-4;
/** Start covariance of an axis whose position variance is unusable: 1 NM, 1 sigma, in m^2 */
const START_POS_VAR = 1852 * 1852;
/** The same for the velocity: 10 m/s, 1 sigma. A judgment value: the tests only hold that it is large and finite. */
const START_VEL_VAR = 100;

/** Offsets of the three covariance numbers of one axis: position, position/velocity and velocity */
const PP = 0;
const PV = 1;
const VV = 2;
const NORTH = 0;
const EAST = 3;

function usable(variance: number): boolean {
    return Number.isFinite(variance) && variance > 0;
}

/**
 * The position filter of the simulated GPS receiver (#402, design 6.5 and 6.7): one Kalman filter per horizontal axis,
 * north and east, each with the state [position, velocity]. The measured position and the Doppler velocity go in; the
 * smoothed position and velocity come out.
 *
 * The velocity is measured so precisely (the Doppler shift of the satellite signals) that the velocity estimate follows
 * it within one update, and the position predicts with it. That is why there is no lag in a maneuver, and why a step in
 * the measured position glides in over several updates.
 *
 * The position is the lat/lon pair itself. Moving it by v*dt and taking the innovation in north/east meters is a flat
 * step, accurate enough over one tick. Every 2x2 covariance is written out as three numbers and the position and
 * velocity updates are sequential scalar updates, so there is no matrix code and `update` does not allocate. The
 * process model is a white acceleration: Q = q * [[dt^3/3, dt^2/2], [dt^2/2, dt]].
 *
 * A variance that is not finite or not positive skips that scalar update for that axis, while the prediction still
 * runs. A measurement (position or velocity) that is not finite makes the whole `update` a no-op, prediction included.
 * This is a pure math module: it imports nothing from the project.
 */
export class GpsPositionFilter {
    /** Degrees */
    public lat = 0;
    /** Degrees, in [-180, 180) */
    public lon = 0;
    /** m/s */
    public vNorth = 0;
    /** m/s */
    public vEast = 0;
    public initialized = false;

    /** Per axis the three numbers pp, pv and vv, north first */
    private readonly cov = new Float64Array(6);
    /** The result of the last measureAxis */
    private newVelocity = 0;

    /** Forgets the state; the next update starts from its measurement with no history */
    public restart(): void {
        this.initialized = false;
    }

    /**
     * @param dtS seconds since the last update. When it is not positive there is no prediction, but the measurement is
     * still taken. The caller filters pauses and large gaps.
     * @param lat measured position, degrees
     * @param lon degrees
     * @param vNorth measured velocity, m/s
     * @param vEast m/s
     * @param posVarNorth variance of the measured position in m^2
     * @param posVarEast m^2
     * @param velVarNorth variance of the measured velocity in (m/s)^2
     * @param velVarEast (m/s)^2
     */
    public update(dtS: number, lat: number, lon: number, vNorth: number, vEast: number,
                  posVarNorth: number, posVarEast: number, velVarNorth: number, velVarEast: number): void {
        // A measurement that is not a number must not poison the state: the call does nothing
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(vNorth) || !Number.isFinite(vEast)) {
            return;
        }

        if (!this.initialized) {
            this.start(lat, lon, vNorth, vEast, posVarNorth, posVarEast, velVarNorth, velVarEast);
            return;
        }

        if (dtS > 0) {
            this.predict(dtS);
        }

        // Innovations in meters, taken after the prediction. Both use the latitude of the predicted state.
        const cosLat = this.cosLat();
        const innovNorth = (lat - this.lat) * DEG_TO_RAD * EARTH_RADIUS_M;
        const innovEast = GpsPositionFilter.wrapLon(lon - this.lon) * DEG_TO_RAD * EARTH_RADIUS_M * cosLat;

        const shiftNorth = this.measureAxis(NORTH, this.vNorth, innovNorth, posVarNorth, vNorth, velVarNorth);
        this.vNorth = this.newVelocity;
        const shiftEast = this.measureAxis(EAST, this.vEast, innovEast, posVarEast, vEast, velVarEast);
        this.vEast = this.newVelocity;

        this.lat = GpsPositionFilter.clampLat(this.lat + shiftNorth / EARTH_RADIUS_M * RAD_TO_DEG);
        this.lon = GpsPositionFilter.normalizeLon(this.lon + shiftEast / (EARTH_RADIUS_M * cosLat) * RAD_TO_DEG);
    }

    private start(lat: number, lon: number, vNorth: number, vEast: number,
                  posVarNorth: number, posVarEast: number, velVarNorth: number, velVarEast: number): void {
        this.lat = lat;
        this.lon = GpsPositionFilter.normalizeLon(lon);
        this.vNorth = vNorth;
        this.vEast = vEast;
        this.cov[NORTH + PP] = usable(posVarNorth) ? posVarNorth : START_POS_VAR;
        this.cov[NORTH + PV] = 0;
        this.cov[NORTH + VV] = usable(velVarNorth) ? velVarNorth : START_VEL_VAR;
        this.cov[EAST + PP] = usable(posVarEast) ? posVarEast : START_POS_VAR;
        this.cov[EAST + PV] = 0;
        this.cov[EAST + VV] = usable(velVarEast) ? velVarEast : START_VEL_VAR;
        this.initialized = true;
    }

    /** Constant velocity over dt, and P = F P F^T + Q for F = [[1, dt], [0, 1]] */
    private predict(dt: number): void {
        const cosLat = this.cosLat();
        this.lat = GpsPositionFilter.clampLat(this.lat + this.vNorth * dt / EARTH_RADIUS_M * RAD_TO_DEG);
        this.lon = GpsPositionFilter.normalizeLon(this.lon + this.vEast * dt / (EARTH_RADIUS_M * cosLat) * RAD_TO_DEG);

        const dt2 = dt * dt;
        const q = PROCESS_NOISE;
        for (let o = 0; o < 6; o += 3) {
            const pp = this.cov[o + PP];
            const pv = this.cov[o + PV];
            const vv = this.cov[o + VV];
            this.cov[o + PP] = pp + 2 * dt * pv + dt2 * vv + q * dt2 * dt / 3;
            this.cov[o + PV] = pv + dt * vv + q * dt2 / 2;
            this.cov[o + VV] = vv + q * dt;
        }
    }

    /**
     * The position update, then the velocity update of one axis. Returns the shift of the position in meters and leaves
     * the new velocity in newVelocity.
     */
    private measureAxis(o: number, velocity: number, innovPos: number, posVar: number,
                        measuredVelocity: number, velVar: number): number {
        let shift = 0;

        if (usable(posVar)) {
            const pp = this.cov[o + PP];
            const pv = this.cov[o + PV];
            const s = pp + posVar;
            const k0 = pp / s;
            const k1 = pv / s;
            shift += k0 * innovPos;
            velocity += k1 * innovPos;
            this.cov[o + PP] = pp - k0 * pp;
            this.cov[o + PV] = pv - k0 * pv;
            this.cov[o + VV] -= k1 * pv;
        }

        if (usable(velVar)) {
            const pv = this.cov[o + PV];
            const vv = this.cov[o + VV];
            const innov = measuredVelocity - velocity;
            const s = vv + velVar;
            const k0 = pv / s;
            const k1 = vv / s;
            shift += k0 * innov;
            velocity += k1 * innov;
            this.cov[o + PP] -= k0 * pv;
            this.cov[o + PV] = pv - k0 * vv;
            this.cov[o + VV] = vv - k1 * vv;
        }

        this.newVelocity = velocity;
        return shift;
    }

    private cosLat(): number {
        return Math.max(MIN_COS_LAT, Math.cos(this.lat * DEG_TO_RAD));
    }

    private static clampLat(lat: number): number {
        return Math.min(90, Math.max(-90, lat));
    }

    /** A longitude difference into [-180, 180] */
    private static wrapLon(diff: number): number {
        return diff - 360 * Math.round(diff / 360);
    }

    /** A longitude into [-180, 180) */
    private static normalizeLon(lon: number): number {
        const result = lon - 360 * Math.floor((lon + 180) / 360);
        // For a lon just below 180, lon + 180 rounds up to 360 and the result is just below -180
        return result < -180 ? result + 360 : result;
    }
}
