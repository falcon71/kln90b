import {EARTH_RADIUS_M, GpsMeasurement, MeasurementInputs, MIN_COS_LAT} from "../GpsMeasurement";
import {GpsFailures} from "./GpsFailures";

const RAD_TO_DEG = 180 / Math.PI;

/**
 * The faulty satellite's position error (#460): wraps the measurement strategy, always updates it and passes its outputs
 * through, adding the error of the faulty satellite while it is a row of the solution. A pseudorange too long moves the
 * position away from the satellite, so the error is the negative of the row's coefficient times the bias (GpsSolution
 * header). Ground speed and track are the inner ones: a clock jump changes the range, not the Doppler.
 */
export class FailingMeasurement implements GpsMeasurement {
    public lat = 0;
    public lon = 0;
    public groundspeedKt = 0;
    public trackTrue: number | null = null;

    constructor(private readonly inner: GpsMeasurement, private readonly failures: GpsFailures) {
    }

    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        this.inner.update(simTimeS, truthLat, truthLon, inputs);

        let lat = this.inner.lat;
        let lon = this.inner.lon;

        const prn = this.failures.faultyPrn;
        if (prn !== null) {
            const row = inputs.prns.indexOf(prn);
            if (row >= 0) {
                const bias = this.failures.faultyBiasM;
                lat += -inputs.coefficients[2 * row] * bias / EARTH_RADIUS_M * RAD_TO_DEG;
                const cosLat = Math.max(MIN_COS_LAT, Math.cos(lat / RAD_TO_DEG));
                lon += -inputs.coefficients[2 * row + 1] * bias / (EARTH_RADIUS_M * cosLat) * RAD_TO_DEG;
            }
        }

        this.lat = lat;
        this.lon = lon;
        this.groundspeedKt = this.inner.groundspeedKt;
        this.trackTrue = this.inner.trackTrue;
    }

    public restart(): void {
        this.inner.restart();
    }
}
