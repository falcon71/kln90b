import {describe, expect, it, vi} from 'vitest';
import {bootUnit, moveAircraft, settle} from '../../harness/boot';
import {courseDeg, pointFrom} from '../../harness/flight/geo';

const START = {lat: 47, lon: 8};

describe('moveAircraft (harness)', () => {
    // Gps.ts takes the track from the last two positions at a ground speed of at least 2 kt (3-35)
    it('gives the GPS the track of the jump and holds it', async () => {
        const unit = await bootUnit({position: START, altitudeFt: 0});
        await settle(unit);
        const target = pointFrom(START, 45, 0.05);

        await moveAircraft(unit, target, {groundspeedKt: 120});

        const expected = courseDeg(START, target);
        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(expected, 2);
        await vi.advanceTimersByTimeAsync(5000);
        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(expected, 2);
    });

    it('sets a given track by jumping from behind the target', async () => {
        const unit = await bootUnit({position: START, altitudeFt: 0});
        await settle(unit);
        const target = pointFrom(START, 90, 1);

        await moveAircraft(unit, target, {groundspeedKt: 120, trackTrue: 200});

        const expected = courseDeg(pointFrom(target, 20, 0.05), target);
        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(expected, 2);
        await vi.advanceTimersByTimeAsync(5000);
        expect(unit.props.sensors.in.gps.trackTrue).toBeCloseTo(expected, 2);
    });
});
