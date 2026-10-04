import {airport, vor} from './navdata/builders';

/**
 * The world many tests use: KAAA (47.0, 8.0), the VOR ABC (47.5, 8.9) and KBBB (48.2, 9.2). The legs are 47.5 NM
 * (course 050°) and 43.8 NM (course 016°), a left turn of 34.4° at ABC (measured with geo.ts). Fresh objects on every
 * call, so a test may change them.
 */
export function standardRoute() {
    return {kaaa: airport('KAAA', 47.0, 8.0), abc: vor('ABC', 47.5, 8.9), kbbb: airport('KBBB', 48.2, 9.2)};
}
