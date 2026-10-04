import {describe, expect, it} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {airport} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

describe('settle (harness)', () => {
    it('returns with a GPS solution and FPL 0 active', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.2, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });

        // The force-ready boot is valid at once, but FPL 0 activates only at the first calculation tick
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(-1);

        await settle(unit);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        // KAAA is the departure of the stored plan, so the active leg ends at KBBB (index 1)
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1);
    });
});

describe('coldGps (harness)', () => {
    it('boots without a GPS fix, which settle waits for', async () => {
        const unit = await bootUnit({coldGps: true});

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);

        await settle(unit);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
    });

    it('acquires on its own with fast acquisition off', async () => {
        const unit = await bootUnit({coldGps: true, storage: {fastGpsAcquisition: false}});

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);

        await settle(unit, 600);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
    });

    it('throws from settle when there is no fix within the cap', async () => {
        const unit = await bootUnit({coldGps: true});

        await expect(settle(unit, 1)).rejects.toThrow('settle: no GPS solution within 1 s');
    });
});
