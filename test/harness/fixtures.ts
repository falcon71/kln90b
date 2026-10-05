import {Facility} from '@microsoft/msfs-sdk';
import {airport, intersection, ndb, vor} from './navdata/builders';

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
