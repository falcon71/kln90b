/**
 * The signal of a satellite at the receiver (#464). A pure math module: it imports nothing from the project.
 *
 * The power that arrives from a GPS satellite is nearly the same at every elevation, as the satellite's antenna sends more
 * toward the edge of the earth to make up for the longer path. What changes with the elevation is the gain of the
 * aircraft's antenna: it falls steeply in the last 10 to 20 degrees above the horizon and is nearly flat above about 45.
 * The curve below has that shape, 50 + 12 × log10(sin(elevation)): 37 at 5 degrees, 41 at 10, 46 at 30 and 50 overhead.
 * Its constants are our own choice, fitted to the manuals: the Installation Manual (C-7) puts typical KLN 90 SNRs in the
 * forties and calls 30 and below unusable, 30 to 35 marginal; the Pilot's Guide (5-29, 5-30) gives a usable range from
 * the mid-thirties to the mid-fifties. The gain pattern of the KA 91/92 antenna is unknown.
 *
 * The spread of about 13 dB between a low and a high satellite is the margin that radiated tests found between losing the
 * low satellites and losing every satellite to interference (MITRE/Volpe, Loss of Lock Analysis, RTCA 2017).
 */

/** The SNR at the zenith, in dB-Hz */
const ZENITH_SNR = 50;
/** dB per decade of sin(elevation) */
const SLOPE = 12;
/** Installation Manual C-7: 30 and below is unusable. The curve stops there, about 1 degree above the horizon */
export const MIN_SNR = 30;

/**
 * @param zenithRad The zenith angle of the satellite as the SDK gives it, in radians
 * @returns The SNR in dB-Hz, at least MIN_SNR. Also MIN_SNR for an angle that is not a number (#456)
 */
export function satelliteSnr(zenithRad: number): number {
    const sinElevation = Math.cos(zenithRad);
    if (!(sinElevation > 0)) {
        return MIN_SNR;
    }
    return Math.max(MIN_SNR, ZENITH_SNR + SLOPE * Math.log10(sinElevation));
}
