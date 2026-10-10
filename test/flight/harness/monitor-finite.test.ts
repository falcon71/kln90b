import {describe, expect, it} from 'vitest';
import {SimVarValueType} from '@microsoft/msfs-sdk';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {vor} from '../../harness/navdata/builders';
import {NO_GPS_SIMVARS, panelXml} from '../../harness/panelXml';

describe('built-in monitor: GPS outputs finite', () => {
    it('fails the flight when a GPS output SimVar is not finite', async () => {
        // The unit writes GPS WP DISTANCE every second, which would overwrite the NaN before the monitor samples it,
        // so this aircraft does not let the unit write the GPS SimVars
        const flight = await Flight.start({
            world: new World().add(vor('ABC', 47.5, 8.5)), panelXml: panelXml(NO_GPS_SIMVARS),
            aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0},
        });
        await flight.fly(2);
        SimVar.SetSimVarValue('GPS WP DISTANCE', SimVarValueType.Meters, NaN);
        expect(flight.sim.lastWrite('GPS WP DISTANCE')?.value).toBeNaN();
        await expect(flight.fly(2)).rejects.toThrow(/GPS outputs finite: GPS WP DISTANCE = NaN/);
    });
});
