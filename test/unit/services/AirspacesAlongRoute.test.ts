import {describe, expect, it} from 'vitest';
import {BoundaryType, LodBoundary} from '@microsoft/msfs-sdk';
import {airspace} from '../../harness/navdata/airspaces';
import {airspacesAlongRoute} from '../../../kln90b/services/AirspacesAlongRoute';
import {NearestUtils} from '../../../kln90b/data/navdata/NearestUtils';

// #410: the sim holds most areas as several boundaries with the same type, limits and vectors but other names and ids,
// and the airspace lists show such an area once. These are the project's own rules; no manual page covers them. The
// area is invented.
describe('airspaces along the route, copies of one area (#410)', () => {
    // The route runs north over 47.0, 47.2 and 47.4 N at 8 E; both legs cross the area from 47.1 to 47.3 N
    const route = [{lat: 47.0, lon: 8.0}, {lat: 47.2, lon: 8.0}, {lat: 47.4, lon: 8.0}];
    const corners: [number, number][] = [[47.3, 7.9], [47.3, 8.1], [47.1, 8.1], [47.1, 7.9]];

    // The searches of the first leg (centers at 47.0 and 47.1 N) hand out one copy of the area as its representative,
    // those of the second leg (47.2 and 47.3 N) the other, as when the copy with the shortest name left the search in
    // between
    it('lists an area once when the searches of two legs hand out different copies of it (#410)', async () => {
        const first = new LodBoundary(airspace('R-COPY LONG', BoundaryType.Restricted, corners));
        const second = new LodBoundary(airspace('R-COPY', BoundaryType.Restricted, corners));
        const utils = {
            getAirspaces: async (lat: number) => lat < 47.15 ? [first] : [second],
        } as unknown as NearestUtils;

        const found = await airspacesAlongRoute(route, utils);

        expect(found.map(a => a.facility.name)).toEqual(['R-COPY LONG']);
    });
});
