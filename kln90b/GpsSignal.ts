/**
 * The signal of a satellite at the receiver (#464, #467). A pure math module: it imports nothing from the project.
 *
 * The SNR of a satellite is the antenna's gain curve over the elevation above the antenna's plane, plus an offset for the
 * satellite's transmit power, a slow fade and the receiver's estimate jitter, less the rise of the noise floor that the
 * ground transmitters cause (#465, GpsTransmitter.ts). The stateful parts live in the
 * SatelliteSignals service; this module holds the functions of one satellite at one moment.
 *
 * The antenna curve: the power that arrives from a GPS satellite is nearly the same at every elevation, as the satellite's
 * antenna sends more toward the edge of the earth to make up for the longer path. What changes is the gain of the
 * aircraft's antenna: it falls steeply in the last 10 to 20 degrees above its plane and is nearly flat above about 45.
 * The curve has that shape, 50 + 12 × log10(sin(elevation)): 37 at 5 degrees, 41 at 10, 46 at 30 and 50 overhead. Its
 * constants are our own choice, fitted to the manuals: the Installation Manual (C-7) puts typical KLN 90 SNRs in the
 * forties and calls 30 and below unusable, 30 to 35 marginal; the Pilot's Guide (5-29, 5-30) gives a usable range from
 * the mid-thirties to the mid-fifties. The gain pattern of the KA 91/92 antenna is unknown.
 * The spread of about 13 dB between a low and a high satellite is the margin that radiated tests found between losing the
 * low satellites and losing every satellite to interference (MITRE/Volpe, Loss of Lock Analysis, RTCA 2017).
 *
 * The antenna's plane: the antenna sits on top of the fuselage with its base level within 5 degrees in level flight
 * (Installation Manual 2-1), so its plane is the airframe's and a tilted antenna loses satellites. The elevation is
 * therefore taken above that plane, from the aircraft's heading, pitch and bank.
 *
 * The floor: measured aircraft antenna patterns fall to about -20 to -25 dBic below the antenna's plane against a peak of
 * about +2 to +3 dBic (Eurocontrol EEC Report 337, 1999, scale model of a BAC 1-11). That is 23 to 28 dB under the zenith,
 * so the curve stops at 25, under the unusable limit and under the reacquire threshold.
 *
 * The block offsets: the transmit power differs by satellite generation. The offsets are our estimates, ordered by what
 * the IGS antenna calibrations of the blocks show, the IIR block split by its antenna panel (Rothacher and Schmid,
 * IGSMAIL-5131, 2005; Marquis and Reigh). GPS III radiates less toward the edge of the earth, so its offset grows with the
 * elevation.
 *
 * The fade and the jitter sizes are our estimates too; the research found no published airborne C/N0 statistics.
 */

import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';

/** The SNR at the antenna's zenith, in dB-Hz */
export const ZENITH_SNR = 50;
/** dB per decade of sin(elevation) */
export const SLOPE = 12;
/** The curve's floor for a satellite at or under the antenna's plane */
export const BACKLOBE_SNR = 25;
/** Installation Manual C-7: 30 and below is unusable. A tracked satellite below this is lost */
export const LOCK_LOSS_SNR = 30;
/** A lost satellite comes back at this SNR or more */
export const ACQUIRE_SNR = 35;
/** Correlation time of the fade in flight: the airframe's echo changes with the satellite's direction */
export const FADE_TAU_AIR_S = 20;
/** Correlation time of the fade on the ground: reflections change over minutes with the satellite's elevation */
export const FADE_TAU_GROUND_S = 120;
/** The receiver's mask: a satellite above this zenith angle (5 degrees elevation) is not used */
export const MASK_ZENITH_RAD = 85 * Math.PI / 180;

/** The attitude that decides where the antenna's plane points */
export interface AntennaAttitude {
    headingTrueDeg: number;
    /** Nose up is positive */
    pitchUpDeg: number;
    /** Right wing down is positive */
    bankRightDeg: number;
    onGround: boolean;
}

export const LEVEL_ATTITUDE: Readonly<AntennaAttitude> = {
    headingTrueDeg: 0,
    pitchUpDeg: 0,
    bankRightDeg: 0,
    onGround: false,
};

const DEG = Math.PI / 180;

/**
 * @param zenithRad The zenith angle of the satellite as the SDK gives it, in radians
 * @param hourAngleRad The SDK's hour angle, which turns from north towards the west
 * @param attitude The aircraft's attitude
 * @returns The sine of the satellite's elevation above the antenna's plane. -1 for a satellite at or under the local
 * horizon, as the earth blocks it whatever the attitude. NaN for an angle that is not a number
 */
export function antennaSinElevation(zenithRad: number, hourAngleRad: number, attitude: Readonly<AntennaAttitude>): number {
    if (zenithRad >= Math.PI / 2) {
        return -1;
    }
    const sinE = Math.cos(zenithRad);
    const cosE = Math.sin(zenithRad);
    const relative = -hourAngleRad - attitude.headingTrueDeg * DEG;
    const phi = attitude.bankRightDeg * DEG;
    const theta = attitude.pitchUpDeg * DEG;
    return sinE * Math.cos(phi) * Math.cos(theta)
        - cosE * (Math.cos(phi) * Math.sin(theta) * Math.cos(relative) - Math.sin(phi) * Math.sin(relative));
}

/**
 * @param sinAntennaElevation The sine of the elevation above the antenna's plane
 * @returns The SNR in dB-Hz, at least BACKLOBE_SNR. BACKLOBE_SNR also for a satellite at or under the plane and for a
 * value that is not a number (#456)
 */
export function antennaCurveSnr(sinAntennaElevation: number): number {
    if (!(sinAntennaElevation > 0)) {
        return BACKLOBE_SNR;
    }
    return Math.max(BACKLOBE_SNR, ZENITH_SNR + SLOPE * Math.log10(sinAntennaElevation));
}

/** The block names of the IGS satellite metadata, which the generated ephemeris carries per PRN */
export const KNOWN_BLOCKS: readonly string[] = ['GPS-IIF', 'GPS-IIR-M', 'GPS-IIR-B', 'GPS-IIR-A', 'GPS-IIIA'];

/**
 * @param block The IGS block name of the satellite, if it has one
 * @param sinLocalElevation The sine of the satellite's elevation above the local horizon
 * @returns The offset of the satellite's transmit power in dB. 0 for a block that is not known
 */
export function blockOffsetDb(block: string | undefined, sinLocalElevation: number): number {
    switch (block) {
        case 'GPS-IIF':
            return 1;
        case 'GPS-IIR-M':
            return 0.5;
        case 'GPS-IIR-B':
            return 0;
        case 'GPS-IIR-A':
            return -1;
        case 'GPS-IIIA': {
            // -1.5 up to 30 degrees, linear in the elevation to -4 from 50 degrees
            const elevation = Math.asin(Math.max(-1, Math.min(1, sinLocalElevation))) / DEG;
            const t = Math.max(0, Math.min(1, (elevation - 30) / 20));
            return -1.5 - 2.5 * t;
        }
        default:
            return 0;
    }
}

/**
 * @param sinAntennaElevation The sine of the elevation above the antenna's plane
 * @param onGround Whether the aircraft is on the ground
 * @returns The standard deviation of the fade in dB: largest at the antenna's horizon, smallest from 45 degrees up
 */
export function fadeSigmaDb(sinAntennaElevation: number, onGround: boolean): number {
    const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinAntennaElevation))) / DEG;
    // not a number and below the plane count as the horizon
    const share = elevationDeg > 0 ? Math.min(1, elevationDeg / 45) : 0;
    return onGround ? 0.5 + 1.5 * (1 - share) : 0.3 + 0.9 * (1 - share);
}

/**
 * @param snr The SNR before the jitter, in dB-Hz
 * @returns The standard deviation of the receiver's C/N0 estimate noise in dB, at most 1.5: the estimate's variance falls
 * with the C/N0
 */
export function jitterSigmaDb(snr: number): number {
    return Math.min(1.5, 0.15 * Math.pow(10, (45 - snr) / 20));
}

/**
 * The longest step of simulated time that counts. A longer one, or one back, is a pause, a time change or a reload and
 * moves nothing. Equal to MAX_TRIGGER_STEP_S of the failure trigger, which this module must not import (a test pins it)
 */
export const MAX_SIGNAL_STEP_S = 60;

/** What the service needs of the receiver */
export interface SignalReceiverView {
    satellites(): readonly GPSSatellite[];
}

/**
 * @param sat A satellite of the SDK's computer
 * @returns The IGS block name that the generated ephemeris carries for the satellite, if it has one
 */
export function sdkBlockOf(sat: GPSSatellite): string | undefined {
    const block = (sat as any).data?.ephemeris?.block;
    return typeof block === 'string' ? block : undefined;
}

function isTracked(state: GPSSatelliteState): boolean {
    return state === GPSSatelliteState.Acquired || state === GPSSatelliteState.DataCollected
        || state === GPSSatelliteState.InUse || state === GPSSatelliteState.InUseDiffApplied;
}

const PRN_SLOTS = 256;

/**
 * The SNR of every satellite, once per calculation tick, and the lock rule that is the same for every cause: a tracked
 * satellite is lost below LOCK_LOSS_SNR, an untracked one is lost while it is below ACQUIRE_SNR, and a lost one comes
 * back only at ACQUIRE_SNR or more. The state is in typed arrays indexed by PRN, so a tick allocates nothing.
 */
export class SatelliteSignals {
    /** Scales the fade's size. 0 switches it off */
    public fadeScale = 1;
    /** Scales the jitter's size. 0 switches it off */
    public jitterScale = 1;

    private readonly snrs = new Float64Array(PRN_SLOTS);
    private readonly fade = new Float64Array(PRN_SLOTS);
    private readonly jitter = new Float64Array(PRN_SLOTS);
    private readonly computed = new Uint8Array(PRN_SLOTS);
    private readonly lost = new Uint8Array(PRN_SLOTS);
    private lastTimeS: number | null = null;
    private hasSpare = false;
    private spare = 0;

    constructor(
        private readonly receiver: SignalReceiverView,
        private readonly random: () => number,
        private readonly blockOf: (sat: GPSSatellite) => string | undefined = sdkBlockOf,
    ) {
    }

    /**
     * @param noiseRiseDb The rise of the noise floor from every transmitter (#465), lost from every satellite's SNR
     */
    public tick(simTimeS: number, attitude: Readonly<AntennaAttitude>, noiseRiseDb: number): void {
        const last = this.lastTimeS;
        this.lastTimeS = simTimeS;
        let dt = last === null ? 0 : simTimeS - last;
        if (!(dt > 0) || dt > MAX_SIGNAL_STEP_S) {
            dt = 0;
        }
        this.compute(dt, attitude, noiseRiseDb);
    }

    /**
     * The SNRs and the lost set outside the calculation tick, counting no time
     * @param noiseRiseDb The rise of the noise floor from every transmitter (#465), lost from every satellite's SNR
     */
    public refresh(attitude: Readonly<AntennaAttitude>, noiseRiseDb: number): void {
        this.compute(0, attitude, noiseRiseDb);
    }

    public reset(): void {
        this.lost.fill(0);
        this.fade.fill(0);
        this.jitter.fill(0);
        this.computed.fill(0);
        this.snrs.fill(0);
        this.lastTimeS = null;
    }

    public snr(prn: number): number {
        return this.snrs[prn] ?? 0;
    }

    public isLost(prn: number): boolean {
        return this.lost[prn] === 1;
    }

    private compute(dt: number, attitude: Readonly<AntennaAttitude>, noiseRiseDb: number): void {
        const sats = this.receiver.satellites();
        const tau = attitude.onGround ? FADE_TAU_GROUND_S : FADE_TAU_AIR_S;
        for (let i = 0; i < sats.length; i++) {
            const sat = sats[i];
            const prn = sat.prn;
            const pos = sat.position.get();
            const sinAntenna = antennaSinElevation(pos[0], pos[1], attitude);
            const sinLocal = Math.cos(pos[0]);
            // a position that is not a number has no block offset to give
            const offset = isFinite(sinLocal) ? blockOffsetDb(this.blockOf(sat), sinLocal) : 0;

            if (this.computed[prn] === 0) {
                this.computed[prn] = 1;
                this.fade[prn] = this.normal();
                this.jitter[prn] = 0;
            } else if (dt > 0) {
                const a = Math.exp(-dt / tau);
                this.fade[prn] = a * this.fade[prn] + Math.sqrt(1 - a * a) * this.normal();
            }

            const base = antennaCurveSnr(sinAntenna) + offset
                + this.fade[prn] * fadeSigmaDb(sinAntenna, attitude.onGround) * this.fadeScale - noiseRiseDb;
            if (dt > 0) {
                this.jitter[prn] = this.normal();
            }
            const snr = base + this.jitter[prn] * jitterSigmaDb(base) * this.jitterScale;
            this.snrs[prn] = snr;

            if (this.lost[prn] === 1) {
                this.lost[prn] = snr < ACQUIRE_SNR ? 1 : 0;
            } else {
                this.lost[prn] = snr < (isTracked(sat.state.get()) ? LOCK_LOSS_SNR : ACQUIRE_SNR) ? 1 : 0;
            }
        }
    }

    /** Box-Muller, as in GpsErrorModel. The second value of each pair is kept for the next call */
    private normal(): number {
        if (this.hasSpare) {
            this.hasSpare = false;
            return this.spare;
        }
        const u1 = 1 - this.random();
        const u2 = this.random();
        const r = Math.sqrt(-2 * Math.log(u1));
        this.spare = r * Math.sin(2 * Math.PI * u2);
        this.hasSpare = true;
        return r * Math.cos(2 * Math.PI * u2);
    }
}
