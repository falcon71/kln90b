/**
 * The real KLN has analog discrete outputs for deviation bar signals. Based on page 186, it appears that the signal
 * is updated at 1HZ, but some circuitry filters and smoothes this signal. We try to emulate this behaviour here to
 * achive a smooth output for the GPS WP CROSS TRK SimVar
 */
export class SignalOutputFilter {

    lastPredictedValue = 0;
    vPredicted = 0;
    lastMeasuredValue = 0;
    lastMeasurementTime = new Date(0);

    setValue(measuredValue: number) {
        const now = new Date();
        const tDiff = now.getTime() - this.lastMeasurementTime.getTime();

        this.lastPredictedValue += this.vPredicted * tDiff;

        const vMeasured = (measuredValue - this.lastMeasuredValue) / tDiff;
        const nextPredictedValue = measuredValue + vMeasured * tDiff;

        //We don't want to jump to the measuredValue right away, so let's calculate a speed from
        // lastPredictedValue to nextPredictedValue for a smooth animation
        this.vPredicted = (nextPredictedValue - this.lastPredictedValue) / tDiff;

        this.lastMeasuredValue = measuredValue;
        this.lastMeasurementTime = now;
    }

    getCurrentValue() {
        const now = new Date();
        const tDiff = now.getTime() - this.lastMeasurementTime.getTime();

        return this.lastPredictedValue + this.vPredicted * tDiff;
    }


}