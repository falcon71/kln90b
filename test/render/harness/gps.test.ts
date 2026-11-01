import {describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../harness/boot';
import {inhibitAllBut, liftInhibits} from '../../harness/gps';

describe('inhibitAllBut and liftInhibits (harness)', () => {
    it('inhibits every satellite but the first n in use, on the computer and on the STA 5 prediction', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const inUse = gps.gpsSatComputer.getSatellites()
            .filter(s => s.state.get() === GPSSatelliteState.InUse)
            .map(s => s.prn);
        const all = gps.gpsSatComputer.getSatellites().map(s => s.prn);

        const kept = inhibitAllBut(unit, 3);

        expect(kept).toEqual(inUse.slice(0, 3));
        const others = all.filter(prn => !kept.includes(prn)).sort((a, b) => a - b);
        expect([...gps.gpsSatComputer.inhibitedSatellitePrnCodes.get()].sort((a, b) => a - b)).toEqual(others);
        expect([...gps.raimPrediction.inhibitedSatellitePrnCodes.get()].sort((a, b) => a - b)).toEqual(others);

        await vi.advanceTimersByTimeAsync(6000); // The SDK's next position update
        expect(gps.solution.satellites).toBe(3);
    });

    it('throws when fewer satellites are in use than asked for', async () => {
        const unit = await bootUnit();
        await settle(unit);

        expect(() => inhibitAllBut(unit, 33)).toThrow(/satellites in use, 33 wanted/);
    });

    it('lifts every inhibit, and the prediction follows the computer\'s inhibits again', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        inhibitAllBut(unit, 3);

        liftInhibits(unit);

        expect(gps.gpsSatComputer.inhibitedSatellitePrnCodes.get().size).toBe(0);
        expect(gps.raimPrediction.inhibitedSatellitePrnCodes.get().size).toBe(0);
        const prn = gps.gpsSatComputer.getSatellites()[0].prn;
        gps.gpsSatComputer.setSatelliteInhibit(prn, true);
        expect([...gps.raimPrediction.inhibitedSatellitePrnCodes.get()]).toEqual([prn]);
    });
});
