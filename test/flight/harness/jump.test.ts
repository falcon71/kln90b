import {describe, expect, it} from 'vitest';
import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {Flight, nmBefore} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {courseDeg, distanceNm} from '../../harness/flight/geo';

describe('jump', () => {
    it('moves to a point before the active waypoint and refuses to cross it', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const abc = vor('ABC', 47.5, 8.9);
        const kbbb = airport('KBBB', 48.2, 9.2);
        const world = new World().add(kaaa, abc, kbbb);
        // 2 NM past KAAA on the first leg, so the closest leg (ActiveWaypoint.activateFpl0) is KAAA → ABC
        const leg1 = courseDeg(kaaa, abc);
        const start = new GeoPoint(kaaa.lat, kaaa.lon).offset(leg1, UnitType.NMILE.convertTo(2, UnitType.GA_RADIAN));
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
        });
        await flight.flyUntil(() => flight.nav.activeIdent === 'ABC', {timeout: 30, description: 'ABC active'});

        await expect(flight.jump(nmBefore('KBBB', 5))).rejects.toThrow(/not the active waypoint/);
        await expect(flight.jump(nmBefore('ABC', 1))).rejects.toThrow(/closer than 3 NM/);

        await flight.jump(nmBefore('ABC', 10));
        // jump() flies one second after the jump: 0.03 NM at 120 kt
        expect(Math.abs(distanceNm(flight.aircraft, abc) - 10)).toBeLessThan(0.2);
        expect(flight.unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(Math.abs(flight.nav.distNm! - distanceNm(flight.aircraft, abc))).toBeLessThan(0.1);
    });
});
