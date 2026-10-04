import {describe, expect, it} from 'vitest';
import {BoundaryType, FacilitySearchType, UnitType} from '@microsoft/msfs-sdk';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {airspace} from '../../harness/navdata/airspaces';
import {vor} from '../../harness/navdata/builders';

describe('World airspaces', () => {
    it('serves the airspaces of the world to the flown unit', async () => {
        const world = new World().add(vor('ABC', 47.5, 8.5)).addAirspace(airspace('R-WORLD', BoundaryType.Restricted, [[47.1, 7.9], [47.1, 8.1], [46.9, 8.1], [46.9, 7.9]]));
        const flight = await Flight.start({world, aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 100, trackTrue: 90}, pilot: new ManualPilot()});

        const session = await flight.unit.navdata.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Boundary);
        const result = await session.searchNearest(47, 8, UnitType.NMILE.convertTo(10, UnitType.METER), 10);

        expect(world.airspaces().map(a => a.name)).toEqual(['R-WORLD']);
        expect(result.added.map((a: any) => a.name)).toEqual(['R-WORLD']);
    });
});
