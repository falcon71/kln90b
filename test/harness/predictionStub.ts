import {GPSPredictionContext, GPSPredictionSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';

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

/** One satellite of a stub sky: its PRN, its zenith and hour angle in degrees, and the SBAS group of an SBAS satellite */
export type StubSkySatellite = readonly [prn: number, zenithDeg: number, hourAngleDeg: number, sbasGroup?: string];

/** A stub prediction context and the positions it was predicted at */
export interface StubSkyContext {
    readonly context: GPSPredictionContext;
    /** Every setPosition, as [lat, lon, altitude, time] */
    readonly positions: [number, number, number, number][];
    /** How many times predict ran */
    predictions: number;
}

/**
 * A prediction context for the fake receiver's tests (#465). It has the satellites 1 to 32; predict() places them from
 * sky(lat, lon, time), and a PRN that sky leaves out stands at zenith 180 degrees, below the horizon. Before the first
 * predict every satellite is below the horizon too
 */
export function stubSkyContext(sky: (lat: number, lon: number, time: number) => readonly StubSkySatellite[]): StubSkyContext {
    const positions: [number, number, number, number][] = [];
    const satellites = Array.from({length: 32}, (_, i) => {
        const position = new Float64Array([Math.PI, 0]);
        return {
            prn: i + 1,
            sbasGroup: undefined as string | undefined,
            state: {get: () => GPSSatelliteState.None},
            position: {get: () => position},
            signalStrength: {get: () => 0},
            raw: position,
        };
    });
    const stub: StubSkyContext = {
        positions,
        predictions: 0,
        context: {
            awaitInit: () => Promise.resolve(),
            getSatellites: () => satellites as unknown as GPSPredictionSatellite[],
            setPosition(lat: number, lon: number, altitude: number, time: number) {
                positions.push([lat, lon, altitude, time]);
                return this;
            },
            predict() {
                stub.predictions++;
                const [lat, lon, , time] = positions[positions.length - 1];
                for (const sat of satellites) {
                    sat.raw[0] = Math.PI;
                    sat.raw[1] = 0;
                }
                for (const [prn, zenith, hourAngle, sbasGroup] of sky(lat, lon, time)) {
                    satellites[prn - 1].raw[0] = zenith * DEG;
                    satellites[prn - 1].raw[1] = hourAngle * DEG;
                    satellites[prn - 1].sbasGroup = sbasGroup;
                }
                return this;
            },
        } as unknown as GPSPredictionContext,
    };
    return stub;
}
