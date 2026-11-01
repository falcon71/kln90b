import {GPSPredictionSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';

const DEG = Math.PI / 180;

/**
 * Five satellites as [zenith, azimuth] in degrees: three high ones at zenith 30° (azimuths 0, 120, 240) and two low ones
 * at zenith 80°, 15° apart (azimuths 60 and 75). Computed with numpy, independently of GpsSolution.ts: the largest
 * horizontal slope is 43.90 (on the third high satellite), so HPL = 43.90 × 5 m × 5.3 = 1163 m = 0.63 NM. Without an
 * altitude input, RAIM is available for the 2 NM and the 1 NM alert limits, not for the 0.3 NM of the approach (#453,
 * design 5.2). With the altitude row the slope drops below the approach limit, so use it on a unit with NO_ALTIMETER
 */
export const RAIM_ENROUTE_NOT_APPROACH: readonly [number, number][] = [[30, 0], [30, 120], [30, 240], [80, 60], [80, 75]];

/** Stub prediction satellites in state InUse at the given [zenith, azimuth] in degrees, with PRNs 1, 2, ... */
export function stubSatellites(skyDeg: readonly [number, number][], state = GPSSatelliteState.InUse): GPSPredictionSatellite[] {
    return skyDeg.map(([zenith, azimuth], i) => {
        const position = new Float64Array([zenith * DEG, azimuth * DEG]);
        return {
            prn: i + 1,
            sbasGroup: undefined,
            state: {get: () => state},
            position: {get: () => position},
            signalStrength: {get: () => 1},
        } as unknown as GPSPredictionSatellite;
    });
}
