import {GeoPoint, GPSPredictionContext, GPSSatellite, GPSSatelliteState, UnitType} from '@microsoft/msfs-sdk';
import {ACQUIRE_SNR, jitterSigmaDb, LOCK_LOSS_SNR, MASK_ZENITH_RAD} from '../GpsSignal';
import {
    ALMANAC_SEARCH_ACQUISITION,
    ALMANAC_SEARCH_ACQUISITION_RANGE,
    BLIND_ACQUISITION,
    BLIND_ACQUISITION_RANGE,
    HOT_ACQUISITION,
    HOT_ACQUISITION_RANGE,
    IDLE_ACQUISITION,
    WARM_ACQUISITION_RANGE,
} from '../GpsSearch';
import {fakeSnr} from '../GpsTransmitter';
import type {SpooferSite} from './Transmitters';

/** The time to collect a satellite's ephemeris after its acquisition, one data frame: the SDK's ephemerisDownloadTime in Gps.ts */
export const EPHEMERIS_DOWNLOAD_MS = 30_000;
/** The skies are predicted again after this much sim time: the SDK moves its satellites every 5 s */
export const SKY_REPREDICT_MS = 5_000;

/** One of the unit's channels as STA 1 shows it: the SDK's satellite in it, or the fake satellite that claims it */
export interface ChannelRow {
    prn: number;
    state: GPSSatelliteState;
    snr: number;
    /** The zenith angle the unit knows for the satellite, or null when it does not know where the satellite stands */
    zenithRad: number | null;
    fake: boolean;
}

/** What the fake receiver reads each tick: one object, filled in place by GPS */
export interface FakeReceiverInputs {
    /** The sim time, UNIX ms */
    simTimeMs: number;
    /** The spoofer, null without one or while it is pending */
    spoofer: Readonly<SpooferSite> | null;
    /** The spoofer's total level at the aircraft as a ratio over the thermal noise */
    spooferRatio: number;
    /** The jammer's level at the aircraft as a ratio */
    jammerRatio: number;
    /** The antennaGain failure's loss in dB, which the fake signals suffer in the same antenna as the real ones (#471, IM C-7) */
    antennaLossDb: number;
    /** The position the unit navigates on and its clock (UNIX ms) */
    beliefLat: number;
    beliefLon: number;
    beliefTimeMs: number;
    /** The receiver searches every PRN: a sky or an almanac search of the start model */
    searchAll: boolean;
    /** The start model's almanac search, whose blind search has its own acquisition time (GpsSearch) */
    almanacSearch: boolean;
    /**
     * The factor of the acquisition times: the rcvrEeprom factor until the first fix of the power-on, else 1 (#471, IM C-4,
     * 0800). The same receiver searches the fake signals as the real ones, so GpsSearch's times and these scale alike
     */
    acquisitionFactor: number;
    /** The SDK's channels, the live array */
    sdkChannels: readonly (GPSSatellite | null)[];
    /** The SNR of a real satellite */
    realSnr: (prn: number) => number;
    /** Whether the receiver has lost a real satellite's signal */
    realLost: (prn: number) => boolean;
}

const PRN_SLOTS = 256;
const MAX_CHANNELS = 16;
/**
 * The longest step of sim time that counts, as for the SDK's satellites: GPSSatComputer.onUpdate skips a step of more than
 * twice its update interval (5 s in Gps.ts), a pause, a time change or a reload
 */
const MAX_STEP_MS = 10_000;
/** The SDK's hot-start rule: a belief within 2 NM of where the satellites are predicted for */
const HOT_DISTANCE_RAD = UnitType.NMILE.convertTo(2, UnitType.GA_RADIAN);

const enum Fake {
    /** No channel */
    Free,
    /** Claimed a channel and searched there */
    Searching,
    /** Acquired, collecting the ephemeris */
    Acquired,
    InUse,
}

/**
 * The fake satellites of a spoofer in the unit's 8 channels (#465, design "The fake signals" and "The fake receiver and the
 * shared channels"). A spoofer simulates the sky of a receiver standing at the false position at the false time: the fake
 * sky, a prediction context. Every fake signal has the same level at the aircraft, and its SNR is that level over the
 * noise of the jammer and the other fake signals (GpsTransmitter fakeSnr).
 *
 * The receiver searches the PRNs its almanac puts in the sky at its belief (the believed sky), or every PRN in a blind
 * search. A channel that searches PRN Y locks whichever signal of Y is the stronger at ACQUIRE_SNR or more; a channel that
 * tracks a signal keeps it until the lock rule loses it. A fake satellite takes a channel by claiming it: the SDK's
 * satellite in a claimed channel reports its signal lost through GPS's reachability predicate (claimsSdkPrn), so the SDK
 * neither tracks it nor gives the channel to another satellite while the claim lasts. The SDK keeps its channel count, and
 * STA 1 shows exactly the unit's channels (fillRows).
 *
 * The state is kept in typed arrays by PRN and by channel, so a tick allocates nothing. The skies are predicted at most
 * every SKY_REPREDICT_MS of sim time.
 */
export class FakeReceiver {
    /** Scales the estimate jitter of the fake satellites' SNRs. 0 switches it off */
    public jitterScale = 1;

    /** Per PRN: the fake satellite's SNR this tick, its state and the time left in it (ms) */
    private readonly snrs = new Float64Array(PRN_SLOTS);
    private readonly state = new Uint8Array(PRN_SLOTS);
    private readonly timer = new Float64Array(PRN_SLOTS);
    /** Per PRN: the fake ephemeris was collected from this spoofer */
    private readonly collected = new Uint8Array(PRN_SLOTS);
    /** Per PRN: above the mask in the fake sky, and in the believed sky */
    private readonly inFakeSky = new Uint8Array(PRN_SLOTS);
    private readonly inBelievedSky = new Uint8Array(PRN_SLOTS);
    /** Per PRN: the directions in the fake sky (every PRN, also under the mask) and the zenith angle in the believed sky */
    private readonly fakeZenithRad = new Float64Array(PRN_SLOTS).fill(Math.PI);
    private readonly fakeHourAngleRad = new Float64Array(PRN_SLOTS);
    private readonly believedZenithRad = new Float64Array(PRN_SLOTS).fill(Math.PI);
    /** The fake PRNs above the mask, ascending */
    private readonly fakePrns: number[] = [];
    private fakeCount = 0;
    /** Per channel: the fake PRN that claims it, 0 for none */
    private readonly claimed = new Uint8Array(MAX_CHANNELS);
    private readonly inUse: number[] = [];
    /** Per PRN: the SDK's satellite timed out to Unreachable while it sat in a claimed channel */
    private readonly heldUnreachable = new Uint8Array(PRN_SLOTS);

    /** The SDK's channels of the last tick: the live array, read again at every query */
    private channels: readonly (GPSSatellite | null)[] = [];
    private lastTimeMs: number | null = null;
    private lastPredictMs = NaN;
    private believedFalse = false;
    /** The spoofer the state belongs to, by its values: Transmitters reuses one object for every generation */
    private hasSpoofer = false;
    private readonly spoofer: SpooferSite = {lat: 0, lon: 0, powerDb: 0, refAglFt: 0, falseLat: 0, falseLon: 0, falseAltFt: 0, shiftMs: 0, clockM: 0};
    private readonly belief = new GeoPoint(0, 0);
    private hasSpare = false;
    private spare = 0;

    constructor(private readonly fakeSky: GPSPredictionContext, private readonly believedSky: GPSPredictionContext, private readonly random: () => number) {
    }

    /** The fake PRNs above the 5 degree mask at the false position, 0 without a spoofer */
    public get fakeSkyCount(): number {
        return this.fakeCount;
    }

    /** The unit's clock is nearer the false time than the true time */
    public get believesFalse(): boolean {
        return this.believedFalse;
    }

    /**
     * Whether the SDK's satellite of this PRN is held lost: it sits in a channel a fake satellite claims, read from the SDK's
     * channels now, so that a satellite the SDK puts into a claimed channel during its update is held at once; or a fake
     * satellite of this PRN has a channel, as the receiver does not search a PRN in two channels
     */
    public claimsSdkPrn(prn: number): boolean {
        if (this.state[prn] !== Fake.Free) {
            return true;
        }
        const channels = this.channels;
        for (let i = 0; i < channels.length && i < MAX_CHANNELS; i++) {
            if (this.claimed[i] !== 0 && channels[i]?.prn === prn) {
                return true;
            }
        }
        return false;
    }

    /** The fake ephemeris of this PRN was collected from the spoofer (kept over a power cycle, erased by a wipe) */
    public hasCollected(prn: number): boolean {
        return this.collected[prn] === 1;
    }

    /** #461: the wipe of the receiver's memory erases the ephemeris collected from the spoofer too */
    public forgetEphemeris(): void {
        this.collected.fill(0);
    }

    public isFakeInUse(prn: number): boolean {
        return this.state[prn] === Fake.InUse;
    }

    /**
     * The fake PRNs in use, in channel order. The array is reused and written by index; its length is set only when it
     * changes, so that a tick allocates nothing (GPS.updateSolution asks every tick)
     */
    public inUsePrns(): readonly number[] {
        const out = this.inUse;
        let n = 0;
        for (let i = 0; i < MAX_CHANNELS; i++) {
            const prn = this.claimed[i];
            if (prn !== 0 && this.state[prn] === Fake.InUse) {
                out[n++] = prn;
            }
        }
        if (out.length !== n) {
            out.length = n;
        }
        return out;
    }

    /** The zenith angle of a PRN in the fake sky, radians; also under the mask */
    public fakeZenith(prn: number): number {
        return this.fakeZenithRad[prn];
    }

    /** The SDK's hour angle of a PRN in the fake sky, radians */
    public fakeHourAngle(prn: number): number {
        return this.fakeHourAngleRad[prn];
    }

    /** The SNR of a fake satellite, 0 for a PRN the spoofer does not send */
    public snr(prn: number): number {
        return this.snrs[prn];
    }

    /** Power change: every fake satellite lost, the claims released and the timers cleared. The fake ephemeris is kept */
    public reset(): void {
        this.state.fill(Fake.Free);
        this.timer.fill(0);
        this.claimed.fill(0);
        this.lastTimeMs = null;
    }

    /**
     * The SDK's satellites that a claim held lost until the SDK's acquisition timeout made them Unreachable (one below the
     * horizon, or any in a blind search: with a belief a held satellite in view never times out, #470): the real
     * receiver never searched them there, so once a satellite is out of the claimed channel, or the claim is released, and
     * its own signal is not lost, it is given back to the SDK as searchable (free). Without it the SDK would keep a healthy
     * satellite out of its channel assignment for an hour. Called after the SDK's update, which times satellites out and
     * moves them between channels
     * @param free Makes the SDK's satellite of a PRN searchable again
     */
    public freeHeld(inputs: Readonly<FakeReceiverInputs>, free: (prn: number) => void): void {
        const channels = inputs.sdkChannels;
        for (let i = 0; i < channels.length && i < MAX_CHANNELS; i++) {
            const sat = channels[i];
            if (this.claimed[i] !== 0 && sat !== null && sat.prn < PRN_SLOTS && sat.state.get() === GPSSatelliteState.Unreachable) {
                this.heldUnreachable[sat.prn] = 1;
            }
        }
        for (let prn = 0; prn < PRN_SLOTS; prn++) {
            if (this.heldUnreachable[prn] === 1 && !this.claimsSdkPrn(prn)) {
                this.heldUnreachable[prn] = 0;
                if (!inputs.realLost(prn)) {
                    free(prn);
                }
            }
        }
    }

    /** The spoofer is gone or replaced: also the fake sky and the fake ephemeris are forgotten */
    public clear(): void {
        this.reset();
        this.collected.fill(0);
        this.snrs.fill(0);
        this.inFakeSky.fill(0);
        this.inBelievedSky.fill(0);
        this.fakeZenithRad.fill(Math.PI);
        this.fakeHourAngleRad.fill(0);
        this.believedZenithRad.fill(Math.PI);
        this.fakePrns.length = 0;
        this.fakeCount = 0;
        this.lastPredictMs = NaN;
        this.believedFalse = false;
        this.hasSpoofer = false;
    }

    public tick(inputs: Readonly<FakeReceiverInputs>): void {
        this.channels = inputs.sdkChannels;
        const spoofer = inputs.spoofer;
        if (spoofer === null) {
            if (this.hasSpoofer) {
                this.clear();
            }
            return;
        }
        if (this.hasSpoofer && !this.isSameSpoofer(spoofer)) {
            this.clear();
        }
        if (!this.hasSpoofer) {
            this.hasSpoofer = true;
            Object.assign(this.spoofer, spoofer);
        }

        const last = this.lastTimeMs;
        this.lastTimeMs = inputs.simTimeMs;
        let dt = last === null ? 0 : inputs.simTimeMs - last;
        if (!(dt > 0) || dt > MAX_STEP_MS) {
            dt = 0;
        }

        this.believedFalse = Math.abs(inputs.beliefTimeMs - (inputs.simTimeMs + spoofer.shiftMs)) < Math.abs(inputs.beliefTimeMs - inputs.simTimeMs);
        if (!(inputs.simTimeMs - this.lastPredictMs < SKY_REPREDICT_MS && inputs.simTimeMs >= this.lastPredictMs)) {
            this.predict(inputs, spoofer);
        }
        this.updateSnrs(inputs);
        this.applyLockRule();
        this.advance(dt);
        this.claim(inputs, spoofer);
    }

    /**
     * The unit's channels: a claimed channel shows its fake satellite, the others the SDK's satellite in them, in channel
     * order; an empty channel has no row. A fake satellite's zenith is the one the unit predicts for it: the fake sky's
     * once the belief is false, the believed sky's before. In a blind search it is unknown until its ephemeris is in
     * (#213). An SDK row's zenith is the SDK's; STA 1 applies its own rule for a satellite whose orbit data is missing
     * @param out Filled in place; its row objects are reused
     */
    public fillRows(out: ChannelRow[], inputs: Readonly<FakeReceiverInputs>): void {
        const channels = inputs.sdkChannels;
        let n = 0;
        for (let i = 0; i < channels.length && i < MAX_CHANNELS; i++) {
            const prn = this.claimed[i];
            const sat = channels[i];
            if (prn === 0 && (sat === null || this.state[sat.prn] !== Fake.Free)) {
                continue; //Empty, or its PRN has a fake satellite in another channel
            }
            let row = out[n];
            if (row === undefined) {
                row = out[n] = {prn: 0, state: GPSSatelliteState.None, snr: 0, zenithRad: null, fake: false};
            }
            n++;
            if (prn !== 0) {
                row.prn = prn;
                row.state = this.sdkState(prn);
                row.snr = this.snrs[prn];
                row.zenithRad = inputs.searchAll && this.collected[prn] === 0 ? null
                    : this.believedFalse ? this.fakeZenithRad[prn] : this.believedZenithRad[prn];
                row.fake = true;
            } else {
                row.prn = sat!.prn;
                row.state = sat!.state.get();
                row.snr = inputs.realSnr(sat!.prn);
                row.zenithRad = sat!.position.get()[0];
                row.fake = false;
            }
        }
        out.length = n;
    }

    private isSameSpoofer(s: Readonly<SpooferSite>): boolean {
        const own = this.spoofer;
        return own.lat === s.lat && own.lon === s.lon && own.powerDb === s.powerDb && own.falseLat === s.falseLat
            && own.falseLon === s.falseLon && own.falseAltFt === s.falseAltFt && own.shiftMs === s.shiftMs && own.clockM === s.clockM;
    }

    private sdkState(prn: number): GPSSatelliteState {
        switch (this.state[prn]) {
            case Fake.InUse:
                return GPSSatelliteState.InUse;
            case Fake.Acquired:
                return GPSSatelliteState.Acquired;
            default:
                return GPSSatelliteState.None;
        }
    }

    /** Both skies: the fake one at the false position and time, the believed one at the unit's belief. Altitude 0, as predictRaim passes it */
    private predict(inputs: Readonly<FakeReceiverInputs>, spoofer: Readonly<SpooferSite>): void {
        this.lastPredictMs = inputs.simTimeMs;
        this.fakeSky.setPosition(spoofer.falseLat, spoofer.falseLon, 0, inputs.simTimeMs + spoofer.shiftMs).predict();
        this.believedSky.setPosition(inputs.beliefLat, inputs.beliefLon, 0, inputs.beliefTimeMs).predict();

        this.inFakeSky.fill(0);
        this.fakePrns.length = 0;
        const fake = this.fakeSky.getSatellites();
        for (let i = 0; i < fake.length; i++) {
            const sat = fake[i];
            if (sat.sbasGroup !== undefined || sat.prn >= PRN_SLOTS) {
                continue;
            }
            const position = sat.position.get();
            this.fakeZenithRad[sat.prn] = position[0];
            this.fakeHourAngleRad[sat.prn] = position[1];
            if (position[0] < MASK_ZENITH_RAD) {
                this.inFakeSky[sat.prn] = 1;
            }
        }
        for (let prn = 0; prn < PRN_SLOTS; prn++) {
            if (this.inFakeSky[prn] === 1) {
                this.fakePrns.push(prn);
            }
        }
        this.fakeCount = this.fakePrns.length;

        this.inBelievedSky.fill(0);
        //No SBAS filter here: a PRN is searched only if the fake sky, which has none, has it too
        const believed = this.believedSky.getSatellites();
        for (let i = 0; i < believed.length; i++) {
            const sat = believed[i];
            if (sat.prn >= PRN_SLOTS) {
                continue;
            }
            const zenith = sat.position.get()[0];
            this.believedZenithRad[sat.prn] = zenith;
            if (zenith < MASK_ZENITH_RAD) {
                this.inBelievedSky[sat.prn] = 1;
            }
        }
    }

    /** Every fake signal has the same level: the spoofer's divided among the fake sky's PRNs, plus each its own estimate jitter */
    private updateSnrs(inputs: Readonly<FakeReceiverInputs>): void {
        this.snrs.fill(0);
        const n = this.fakeCount;
        if (n === 0 || !(inputs.spooferRatio > 0)) {
            return;
        }
        const base = fakeSnr(inputs.spooferRatio / n, n, inputs.jammerRatio) - inputs.antennaLossDb;
        const sigma = jitterSigmaDb(base) * this.jitterScale;
        for (let i = 0; i < n; i++) {
            this.snrs[this.fakePrns[i]] = base + sigma * this.normal();
        }
    }

    /**
     * The lock rule of every satellite (#467): a tracked fake satellite is lost below LOCK_LOSS_SNR, a searched one while it
     * is below ACQUIRE_SNR. A loss frees its channel at once
     */
    private applyLockRule(): void {
        for (let i = 0; i < MAX_CHANNELS; i++) {
            const prn = this.claimed[i];
            if (prn === 0) {
                continue;
            }
            const limit = this.state[prn] === Fake.Searching ? ACQUIRE_SNR : LOCK_LOSS_SNR;
            if (this.snrs[prn] < limit) {
                this.release(i);
            }
        }
    }

    private release(channel: number): void {
        const prn = this.claimed[channel];
        this.claimed[channel] = 0;
        this.state[prn] = Fake.Free;
        this.timer[prn] = 0;
    }

    /** The acquisition, then the ephemeris download unless it was collected from this spoofer before */
    private advance(dt: number): void {
        for (let i = 0; i < MAX_CHANNELS; i++) {
            const prn = this.claimed[i];
            if (prn === 0) {
                continue;
            }
            const state = this.state[prn];
            if (state === Fake.InUse) {
                continue;
            }
            this.timer[prn] -= dt;
            if (this.timer[prn] > 0) {
                continue;
            }
            if (state === Fake.Searching && this.collected[prn] === 0) {
                this.state[prn] = Fake.Acquired;
                this.timer[prn] = EPHEMERIS_DOWNLOAD_MS;
            } else {
                this.state[prn] = Fake.InUse;
                this.collected[prn] = 1;
                this.timer[prn] = 0;
            }
        }
    }

    /**
     * The search rule: a searchable fake PRN at ACQUIRE_SNR or more, stronger than the real signal of its PRN or with that
     * one lost, takes the channel that holds its PRN, or else a free channel. A channel whose satellite is tracked and not
     * lost is never taken: a tracking loop does not jump to another correlation peak
     */
    private claim(inputs: Readonly<FakeReceiverInputs>, spoofer: Readonly<SpooferSite>): void {
        for (let k = 0; k < this.fakePrns.length; k++) {
            const prn = this.fakePrns[k];
            if (this.state[prn] !== Fake.Free || !(inputs.searchAll || this.inBelievedSky[prn] === 1)) {
                continue;
            }
            const snr = this.snrs[prn];
            if (!(snr >= ACQUIRE_SNR) || !(inputs.realLost(prn) || inputs.realSnr(prn) < snr)) {
                continue;
            }
            const channel = this.channelFor(prn, inputs);
            if (channel < 0) {
                continue;
            }
            this.claimed[channel] = prn;
            this.state[prn] = Fake.Searching;
            this.timer[prn] = this.acquisitionTime(prn, inputs, spoofer);
        }
    }

    /** The channel a fake PRN takes, -1 for none: its own PRN's, else an empty or unreachable one, a lost one, a searched one */
    private channelFor(prn: number, inputs: Readonly<FakeReceiverInputs>): number {
        const channels = inputs.sdkChannels;
        const count = Math.min(channels.length, MAX_CHANNELS);
        for (let i = 0; i < count; i++) {
            const sat = channels[i];
            if (this.claimed[i] === 0 && sat !== null && sat.prn === prn) {
                return isTracked(sat.state.get()) && !inputs.realLost(prn) ? -1 : i;
            }
        }
        let best = -1;
        let bestRank = 0;
        for (let i = 0; i < count; i++) {
            if (this.claimed[i] !== 0) {
                continue;
            }
            const rank = this.freeRank(channels[i], inputs);
            if (rank > bestRank) {
                best = i;
                bestRank = rank;
            }
        }
        return best;
    }

    /** How free a channel is: 3 empty or unreachable, 2 its signal lost, 1 searched, 0 tracking */
    private freeRank(sat: GPSSatellite | null, inputs: Readonly<FakeReceiverInputs>): number {
        if (sat === null) {
            return 3;
        }
        const state = sat.state.get();
        if (state === GPSSatelliteState.Unreachable) {
            return 3;
        }
        if (inputs.realLost(sat.prn)) {
            return 2;
        }
        return state === GPSSatelliteState.None ? 1 : 0;
    }

    /**
     * The start model's times (GpsSearch.ts), judged against the fake signals' own truth: hot with a false belief within the
     * SDK's 2 NM of the false position and the fake ephemeris collected; the almanac search's time in an almanac search, as
     * for a real satellite; blind in a sky search; otherwise the idle time
     */
    private acquisitionTime(prn: number, inputs: Readonly<FakeReceiverInputs>, spoofer: Readonly<SpooferSite>): number {
        //#471, rcvrEeprom: the whole time, mean and spread, as GpsSearch scales the real satellites' times
        return this.unscaledAcquisitionTime(prn, inputs, spoofer) * inputs.acquisitionFactor;
    }

    private unscaledAcquisitionTime(prn: number, inputs: Readonly<FakeReceiverInputs>, spoofer: Readonly<SpooferSite>): number {
        if (this.believedFalse && this.collected[prn] === 1
            && this.belief.set(inputs.beliefLat, inputs.beliefLon).distance(spoofer.falseLat, spoofer.falseLon) <= HOT_DISTANCE_RAD) {
            return HOT_ACQUISITION + (this.random() - 0.5) * HOT_ACQUISITION_RANGE;
        }
        if (inputs.almanacSearch) {
            return ALMANAC_SEARCH_ACQUISITION + (this.random() - 0.5) * ALMANAC_SEARCH_ACQUISITION_RANGE;
        }
        if (inputs.searchAll) {
            return BLIND_ACQUISITION + (this.random() - 0.5) * BLIND_ACQUISITION_RANGE;
        }
        return IDLE_ACQUISITION + (this.random() - 0.5) * WARM_ACQUISITION_RANGE;
    }

    /** Box-Muller, as in GpsSignal. The second value of each pair is kept for the next call */
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

function isTracked(state: GPSSatelliteState): boolean {
    return state === GPSSatelliteState.Acquired || state === GPSSatelliteState.DataCollected
        || state === GPSSatelliteState.InUse || state === GPSSatelliteState.InUseDiffApplied;
}
