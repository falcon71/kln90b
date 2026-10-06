import {Facility, FixTypeFlags} from '@microsoft/msfs-sdk';
import {pointFrom} from './flight/geo';
import {airport, intersection, ndb, vor} from './navdata/builders';
import {approach, Leg, withProcedures} from './navdata/procedures';

/** Where the default navdata lies: the South Pacific, far beyond the 500 NM nearest search of every test position */
export const DEFAULT_NAVDATA_POSITION = {lat: -45, lon: -150};

/**
 * One airport, VOR, NDB and intersection that bootUnit adds to every world (BootOptions.defaultNavdata), because a real
 * unit always has a database: without them, the APT, VOR, NDB and INT pages of a world that lacks the type post NO APT
 * WPTS, NO VOR WPTS, ... on the status line, a state no real unit shows. There is no user waypoint: NO SUP WPTS is real.
 *
 * The idents start with ZZ, so they sort after the idents tests use: the scan lists are in ident order, and the APT, VOR,
 * NDB and INT pages open on the first entry. A test ident that sorts after its type's default would put the default
 * first; bootUnit only refuses an exact clash. The idents are unique across the types, so no DUPLICATE page appears.
 * They lie far from every test position, so the nearest lists, the maps and the INT reference VOR are unchanged.
 */
export function defaultNavdata(): Facility[] {
    const {lat, lon} = DEFAULT_NAVDATA_POSITION;
    return [
        airport('ZZXA', lat, lon),
        vor('ZZV', lat, lon + 0.1),
        ndb('ZZN', lat, lon + 0.2),
        intersection('ZZXIN', lat, lon + 0.3),
    ];
}

/**
 * The world many tests use: KAAA (47.0, 8.0), the VOR ABC (47.5, 8.9) and KBBB (48.2, 9.2). The legs are 47.5 NM
 * (course 050°) and 43.8 NM (course 016°), a left turn of 34.4° at ABC (measured with geo.ts). Fresh objects on every
 * call, so a test may change them.
 */
export function standardRoute() {
    return {kaaa: airport('KAAA', 47.0, 8.0), abc: vor('ABC', 47.5, 8.9), kbbb: airport('KBBB', 48.2, 9.2)};
}

/**
 * An RNAV approach to KPRC (47.0, 8.0) from the north, final course 180: IAFAA 10 NM and IFAAA 5 NM north of the FAF,
 * the FAF FAFAA 5 NM north of the MAP, a step-down fix SDFAA 2.5 NM north of the MAP, the MAP MAPAA at the airport, and
 * an enroute fix ENRAA 60 NM north of KPRC. Unlike the IAF = FAF worlds of ModeController.test.ts and HEvents.test.ts (#129), the unit can
 * reach APR here, and the step-down fix lets a test check that APR does not come back past the FAF. Store
 * [enraa, kprc] in FPL 0 and load the approach with unit.panel.loadProcedure('APT 8'). Fresh objects on every call.
 */
export function approachWorld() {
    const kprcBase = airport('KPRC', 47.0, 8.0);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const at = (nmNorthOfMap: number) => pointFrom(mapaa, 0, nmNorthOfMap);
    const fafaa = intersection('FAFAA', at(5).lat, at(5).lon);
    const sdfaa = intersection('SDFAA', at(2.5).lat, at(2.5).lon);
    const ifaaa = intersection('IFAAA', at(10).lat, at(10).lon);
    const iafaa = intersection('IAFAA', at(15).lat, at(15).lon);
    const enraa = intersection('ENRAA', at(60).lat, at(60).lon);
    const kprc = withProcedures(kprcBase, {
        approaches: [approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa)]}],
            final: [Leg.IF(ifaaa), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(sdfaa), Leg.TF(mapaa, FixTypeFlags.MAP)],
        })],
    });
    return {
        kprc, enraa, iafaa, ifaaa, fafaa, sdfaa, mapaa,
        /** Every facility the world needs, for bootUnit({facilities}) */
        facilities: [kprc, enraa, iafaa, ifaaa, fafaa, sdfaa, mapaa],
        /** The point nm NM north of KPRC on the final course line */
        north: (nm: number) => pointFrom(kprcBase, 0, nm),
    };
}
