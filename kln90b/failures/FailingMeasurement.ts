import {EARTH_RADIUS_M, GpsMeasurement, MeasurementInputs, MIN_COS_LAT} from "../GpsMeasurement";
import {RangeErrorView} from "./RangeErrors";

const RAD_TO_DEG = 180 / Math.PI;
const MPS_PER_KNOT = 1852 / 3600;
const MIN_GROUND_SPEED_FOR_TRACK = 2; //3-35

/**
 * The errors of the mixed solution (#460, #465, RangeErrors): wraps the measurement strategy, always updates it and moves its
 * outputs by the solution's shift. With the true reference state the inner position is moved by the position error and the
 * inner velocity by the velocity error. With the false reference state the false position takes the inner position's place,
 * moved by the position error, and the velocity is the velocity error alone (the fake signals describe a receiver standing
 * still). Without errors the inner outputs pass through unchanged. A faulty satellite's ramp is a clock jump: it moves the
 * position, not the Doppler (RangeErrors)
 */
export class FailingMeasurement implements GpsMeasurement {
    public lat = 0;
    public lon = 0;
    public groundspeedKt = 0;
    public trackTrue: number | null = null;
    /** The inner strategy's last track, for a moving aircraft whose inner update gives none (a restart, a pause) */
    private lastInnerTrack: number | null = null;

    constructor(private readonly inner: GpsMeasurement, private readonly errors: RangeErrorView) {
    }

    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        this.inner.update(simTimeS, truthLat, truthLon, inputs);
        const e = this.errors;

        const falseReference = e.falseReference;
        let lat = falseReference ? e.falseLat : this.inner.lat;
        let lon = falseReference ? e.falseLon : this.inner.lon;
        //A shift of the north moves the latitude; the east is scaled by the moved one
        lat += e.northM / EARTH_RADIUS_M * RAD_TO_DEG;
        const cosLat = Math.max(MIN_COS_LAT, Math.cos(lat / RAD_TO_DEG));
        lon += e.eastM / (EARTH_RADIUS_M * cosLat) * RAD_TO_DEG;
        this.lat = lat;
        this.lon = lon;

        if (this.inner.trackTrue !== null) {
            this.lastInnerTrack = this.inner.trackTrue;
        }
        const innerTrack = this.inner.trackTrue ?? this.lastInnerTrack;
        if (falseReference) {
            this.setVelocity(e.velNorthMps, e.velEastMps);
        } else if (e.velNorthMps === 0 && e.velEastMps === 0) {
            //Nothing to add: the inner outputs
            this.groundspeedKt = this.inner.groundspeedKt;
            this.trackTrue = this.inner.trackTrue;
        } else if (this.inner.groundspeedKt < MIN_GROUND_SPEED_FOR_TRACK) {
            //At rest, or as good as: the inner velocity has no direction (ExactMeasurement gives none standing still)
            this.setVelocity(e.velNorthMps, e.velEastMps);
        } else if (innerTrack === null) {
            //Moving, but no direction known yet to add the error to: the inner outputs
            this.groundspeedKt = this.inner.groundspeedKt;
            this.trackTrue = this.inner.trackTrue;
        } else {
            const speed = this.inner.groundspeedKt * MPS_PER_KNOT;
            const track = innerTrack / RAD_TO_DEG;
            this.setVelocity(speed * Math.cos(track) + e.velNorthMps, speed * Math.sin(track) + e.velEastMps);
        }
    }

    /** The ground speed and the track of a velocity; no track below 2 kt (3-35) */
    private setVelocity(northMps: number, eastMps: number): void {
        const speedKt = Math.hypot(northMps, eastMps) / MPS_PER_KNOT;
        this.groundspeedKt = speedKt;
        //The sum with 360 keeps a tiny negative angle from rounding to 360
        this.trackTrue = speedKt < MIN_GROUND_SPEED_FOR_TRACK ? null : (Math.atan2(eastMps, northMps) * RAD_TO_DEG + 360) % 360;
    }

    public restart(): void {
        this.lastInnerTrack = null;
        this.inner.restart();
    }
}
