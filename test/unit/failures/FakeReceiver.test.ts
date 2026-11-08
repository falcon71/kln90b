import {beforeEach, describe, expect, it} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {ChannelRow, FakeReceiver, FakeReceiverInputs} from '../../../kln90b/failures/FakeReceiver';
import {SpooferSite} from '../../../kln90b/failures/Transmitters';
import {StubSkyContext, stubSkyContext, StubSkySatellite} from '../../harness/predictionStub';

/**
 * #465: the fake receiver (design docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md, "The fake
 * signals" and "The fake receiver and the shared channels"). The fake satellites of a spoofer take the unit's channels by
 * one search rule shared with the real satellites, are acquired in the start model's times and lost by the lock rule.
 * The skies are stub prediction contexts, the SDK's channels plain objects
 */

const DEG = Math.PI / 180;
const T0 = Date.UTC(2026, 10, 7, 12, 0, 0);
const SHIFT_MS = 6 * 3600 * 1000;
const TRUE_POSITION = {lat: 47, lon: 8};
const FALSE_POSITION = {lat: 48, lon: 9};

/** Eight PRNs above the 5 degree mask at the false position, PRN 9 just under it, PRN 10 under the horizon */
const FAKE_SKY: StubSkySatellite[] = [
    [1, 20, 0], [2, 30, 45], [3, 40, 90], [4, 50, 135], [5, 60, 180], [6, 70, 225], [7, 80, 270], [8, 84, 315],
    [9, 86, 0], [10, 120, 0],
];
/** The sky the unit's almanac predicts at its belief: PRNs 1 to 4 are up in both skies, PRN 5 is under the mask */
const BELIEVED_SKY: StubSkySatellite[] = [
    [1, 25, 10], [2, 35, 50], [3, 45, 95], [4, 55, 140], [5, 87, 0], [11, 30, 0], [12, 40, 0], [13, 50, 0], [14, 60, 0],
];
/** Twelve PRNs above the mask */
const TWELVE: StubSkySatellite[] = Array.from({length: 12}, (_, i) => [i + 1, 10 + 5 * i, 30 * i] as const);

const SPOOFER: SpooferSite = {
    lat: 47.1, lon: 8.1, powerDb: 100, refAglFt: 10_000,
    falseLat: FALSE_POSITION.lat, falseLon: FALSE_POSITION.lon, falseAltFt: 0, shiftMs: SHIFT_MS, clockM: 0,
};

/** A satellite in one of the SDK's channels, its state set by the test */
class SdkSat {
    public st: GPSSatelliteState;
    public readonly state = {get: () => this.st};
    private readonly pos: Float64Array;
    public readonly position = {get: () => this.pos};

    constructor(public readonly prn: number, state: GPSSatelliteState, zenithDeg = 45) {
        this.st = state;
        this.pos = new Float64Array([zenithDeg * DEG, 0]);
    }
}

const sat = (prn: number, state: GPSSatelliteState, zenithDeg?: number) => new SdkSat(prn, state, zenithDeg) as unknown as GPSSatellite;

let fakeSky: StubSkyContext;
let believedSky: StubSkyContext;
let fakeStars: readonly StubSkySatellite[];
let believedStars: readonly StubSkySatellite[];
let channels: (GPSSatellite | null)[];
let realLost: Set<number>;
let realSnr: Map<number, number>;
let receiver: FakeReceiver;
let input: FakeReceiverInputs;

beforeEach(() => {
    fakeStars = FAKE_SKY;
    believedStars = BELIEVED_SKY;
    fakeSky = stubSkyContext(() => fakeStars);
    believedSky = stubSkyContext(() => believedStars);
    channels = Array.from({length: 8}, () => null);
    realLost = new Set();
    realSnr = new Map();
    // Every normal of the jitter is 0, every acquisition time its mean less half its range
    receiver = new FakeReceiver(fakeSky.context, believedSky.context, () => 0);
    input = {
        simTimeMs: T0, spoofer: {...SPOOFER}, spooferRatio: 1e6, jammerRatio: 0, antennaLossDb: 0,
        beliefLat: TRUE_POSITION.lat, beliefLon: TRUE_POSITION.lon, beliefTimeMs: T0, searchAll: false, almanacSearch: false,
        acquisitionFactor: 1, sdkChannels: channels, realSnr: prn => realSnr.get(prn) ?? 0, realLost: prn => realLost.has(prn),
    };
});

/** One calculation tick a second later: the sim time and the unit's clock move on together */
function tick(): void {
    input.simTimeMs += 1000;
    input.beliefTimeMs += 1000;
    receiver.tick(input);
}

/** The unit believes it stands at the false position at the false time (captured) */
function believeFalse(): void {
    input.beliefLat = FALSE_POSITION.lat;
    input.beliefLon = FALSE_POSITION.lon;
    input.beliefTimeMs = input.simTimeMs + SHIFT_MS;
}

function rows(): ChannelRow[] {
    const out: ChannelRow[] = [];
    receiver.fillRows(out, input);
    return out;
}

const fakePrns = () => rows().filter(r => r.fake).map(r => r.prn).sort((a, b) => a - b);
const stateOf = (prn: number) => rows().find(r => r.fake && r.prn === prn)?.state;

/** Seconds of ticks until the fake PRN is in the state, or cap */
function secondsUntil(prn: number, state: GPSSatelliteState, cap = 200): number {
    let s = 0;
    for (; s < cap && stateOf(prn) !== state; s++) {
        tick();
    }
    return s;
}

/** Eight channels of real satellites 21 to 28 whose signals are lost, searched in the SDK's None state */
function lostRealChannels(): void {
    for (let i = 0; i < 8; i++) {
        channels[i] = sat(21 + i, GPSSatelliteState.None);
        realLost.add(21 + i);
    }
}

describe('the fake skies (#465)', () => {
    it('the fake sky is predicted at the false position and the false time, at most every 5 s', () => {
        input.beliefTimeMs = T0 + 120_000; // The unit's clock 2 minutes ahead: a true belief, with a time of its own
        receiver.tick(input);
        for (let s = 1; s <= 9; s++) {
            tick();
        }

        expect(fakeSky.positions).toEqual([
            [FALSE_POSITION.lat, FALSE_POSITION.lon, 0, T0 + SHIFT_MS],
            [FALSE_POSITION.lat, FALSE_POSITION.lon, 0, T0 + 5000 + SHIFT_MS],
        ]);
        expect(fakeSky.predictions).toBe(2);
        // The believed sky the same, at the unit's belief
        expect(believedSky.positions).toEqual([
            [TRUE_POSITION.lat, TRUE_POSITION.lon, 0, T0 + 120_000],
            [TRUE_POSITION.lat, TRUE_POSITION.lon, 0, T0 + 125_000],
        ]);
        expect(receiver.fakeSkyCount).toBe(8);
        // The directions of every PRN of the fake sky, also those under the mask and the horizon
        expect(receiver.fakeZenith(1)).toBeCloseTo(20 * DEG, 12);
        expect(receiver.fakeHourAngle(2)).toBeCloseTo(45 * DEG, 12);
        expect(receiver.fakeZenith(9)).toBeCloseTo(86 * DEG, 12);
        expect(receiver.fakeZenith(10)).toBeCloseTo(120 * DEG, 12);
    });

    it('without a spoofer nothing is predicted and the fake sky is empty', () => {
        input.spoofer = null;
        input.spooferRatio = 0;
        for (let s = 0; s < 10; s++) {
            tick();
        }
        expect(fakeSky.predictions).toBe(0);
        expect(believedSky.predictions).toBe(0);
        expect(receiver.fakeSkyCount).toBe(0);
    });
});

describe('the fake signals (#465)', () => {
    // 1e6 split over eight: 10 log10(125000) + 60 - 10 log10(1 + 7 × 125000) = 51.549, the cap of 60 - 10 log10(7)
    it('every fake satellite has the same SNR before the jitter, capped near 51.5 with eight', () => {
        receiver.tick(input);

        for (let prn = 1; prn <= 8; prn++) {
            expect(receiver.snr(prn)).toBeCloseTo(51.549, 3);
        }
        expect(receiver.snr(9)).toBe(0); // Under the mask: the spoofer does not send it
        expect(receiver.snr(10)).toBe(0);
        expect(receiver.snr(11)).toBe(0); // Not in the fake sky at all

        // The jammer lowers the fake satellites as it lowers the real ones: a jammer as strong as the eight together
        // more than doubles the noise, 10 log10(125000) + 60 - 10 log10(1 + 1e6 + 7 × 125000) = 48.239
        input.jammerRatio = 1e6;
        tick();
        expect(receiver.snr(3)).toBeCloseTo(48.239, 3);
    });

    it('the estimate jitter differs per satellite and is small at a high SNR', () => {
        let u = 0;
        const jittered = new FakeReceiver(fakeSky.context, believedSky.context, () => (u = (u + 0.37) % 1));
        jittered.tick(input);
        const snrs = [1, 2, 3, 4, 5, 6, 7, 8].map(prn => jittered.snr(prn));
        expect(new Set(snrs).size).toBe(8);
        // jitterSigmaDb(51.55) is 0.07 dB: four sigma
        for (const snr of snrs) {
            expect(Math.abs(snr - 51.549)).toBeLessThan(0.3);
        }
    });
});

describe('the shared channels (#465)', () => {
    it('with the belief true, only PRNs in both skies are searchable; with searchAll every fake PRN', () => {
        receiver.tick(input);
        expect(fakePrns()).toEqual([1, 2, 3, 4]);

        input.searchAll = true;
        tick();
        expect(fakePrns()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('an SBAS satellite of the fake sky is neither counted nor searched', () => {
        fakeStars = [...FAKE_SKY, [20, 30, 0, 'WAAS']];
        believedStars = [...BELIEVED_SKY, [20, 30, 0, 'WAAS']];
        lostRealChannels();
        input.searchAll = true;
        receiver.tick(input);
        expect(receiver.fakeSkyCount).toBe(8);
        expect(receiver.snr(20)).toBe(0);
        for (let s = 0; s < 3; s++) {
            tick();
        }
        expect(fakePrns()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        // A free channel for it: still not searched
        channels[7] = null;
        receiver.clear();
        tick();
        expect(fakePrns()).not.toContain(20);
    });

    it('with the belief false, the PRNs of the fake sky are searchable', () => {
        believeFalse();
        believedStars = FAKE_SKY; // The almanac at the false position and time predicts the fake sky
        receiver.tick(input);
        expect(receiver.believesFalse).toBe(true);
        expect(fakePrns()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('a channel tracking a real satellite that is not lost is never claimed', () => {
        input.searchAll = true;
        for (let i = 0; i < 7; i++) {
            channels[i] = sat(i + 1, GPSSatelliteState.InUse);
            realSnr.set(i + 1, 40); // Weaker than the fake of its PRN: a tracking loop does not jump
        }
        for (let s = 0; s < 10; s++) {
            tick();
        }
        // PRN 8 has no real satellite in a channel and takes the free one; PRNs 1 to 7 are each in a tracked channel
        expect(fakePrns()).toEqual([8]);
        for (let prn = 1; prn <= 7; prn++) {
            expect(receiver.claimsSdkPrn(prn)).toBe(false);
        }

        realLost.add(3);
        tick();
        expect(fakePrns()).toEqual([3, 8]);
        expect(receiver.claimsSdkPrn(3)).toBe(true);
        expect(receiver.claimsSdkPrn(4)).toBe(false);
    });

    it("a fake satellite stronger than the real one of its PRN claims that PRN's channel; the SDK satellite there reports lost", () => {
        input.searchAll = true;
        fakeStars = [[5, 30, 0]];
        input.spooferRatio = 0.1; // One fake satellite: 10 log10(0.1) + 60 = 50
        channels[0] = sat(21, GPSSatelliteState.None);
        channels[1] = sat(22, GPSSatelliteState.Unreachable);
        channels[2] = sat(5, GPSSatelliteState.None); // Searched, not lost
        realLost.add(21);
        realSnr.set(5, 55);

        receiver.tick(input);
        expect(fakePrns()).toEqual([]); // The real signal is the stronger: the channel locks it

        realSnr.set(5, 40);
        tick();
        expect(fakePrns()).toEqual([5]);
        expect(receiver.claimsSdkPrn(5)).toBe(true);
        expect(receiver.claimsSdkPrn(21)).toBe(false);
        expect(receiver.claimsSdkPrn(22)).toBe(false);

        // The claim is read at the query: a PRN the SDK puts into the claimed channel is held at once, before a tick
        const swapped = sat(30, GPSSatelliteState.None);
        channels[2] = swapped;
        expect(receiver.claimsSdkPrn(30)).toBe(true);
        expect(receiver.claimsSdkPrn(21)).toBe(false);
        // PRN 5 stays held wherever the SDK puts it: its fake signal has a channel
        channels[3] = sat(5, GPSSatelliteState.None);
        expect(receiver.claimsSdkPrn(5)).toBe(true);
        // and is listed once, from the channel of its fake signal
        expect(rows().filter(r => r.prn === 5)).toEqual([{prn: 5, state: GPSSatelliteState.None, snr: 50, zenithRad: null, fake: true}]);
    });

    it('a free channel is taken in the order: empty or unreachable, lost, searched', () => {
        input.searchAll = true;
        fakeStars = [[5, 30, 0]];
        input.spooferRatio = 0.1;
        for (let i = 0; i < 8; i++) {
            channels[i] = sat(21 + i, GPSSatelliteState.InUse);
        }
        channels[1] = sat(22, GPSSatelliteState.None); // Searched, not lost
        channels[4] = sat(25, GPSSatelliteState.None);
        realLost.add(25); // Lost
        channels[6] = sat(27, GPSSatelliteState.Unreachable);

        receiver.tick(input);
        expect(receiver.claimsSdkPrn(27)).toBe(true);
        expect(receiver.claimsSdkPrn(25)).toBe(false);

        channels[6] = sat(27, GPSSatelliteState.InUse);
        receiver.clear();
        tick();
        expect(receiver.claimsSdkPrn(25)).toBe(true);
        expect(receiver.claimsSdkPrn(22)).toBe(false);

        channels[4] = sat(25, GPSSatelliteState.InUse);
        realLost.delete(25);
        receiver.clear();
        tick();
        expect(receiver.claimsSdkPrn(22)).toBe(true);
    });

    it('never more than 8 channels in the rows; a claimed channel shows the fake PRN, its SNR and its fake-sky zenith once the belief is false', () => {
        lostRealChannels();
        fakeStars = TWELVE;
        believedStars = TWELVE.map(([prn, zenith]) => [prn, zenith + 3, 0] as const);

        receiver.tick(input);
        let r = rows();
        expect(r.length).toBe(8);
        expect(r.every(row => row.fake)).toBe(true);
        expect(r.map(row => row.prn).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        // 1e6 over twelve: 10 log10(1e6 / 12) + 60 - 10 log10(1 + 11e6 / 12) = 49.586
        for (const row of r) {
            expect(row.snr).toBeCloseTo(49.586, 3);
            expect(row.state).toBe(GPSSatelliteState.None);
        }
        // The belief true: the elevation the unit's almanac predicts at its belief, the believed sky's
        expect(r.find(row => row.prn === 4)!.zenithRad).toBeCloseTo(28 * DEG, 12);

        believeFalse();
        tick();
        r = rows();
        expect(r.length).toBe(8);
        expect(r.find(row => row.prn === 4)!.zenithRad).toBeCloseTo(25 * DEG, 12);
        expect(r.find(row => row.prn === 8)!.zenithRad).toBeCloseTo(45 * DEG, 12);
    });

    it('a channel that is not claimed shows the SDK satellite in it; an empty one no row', () => {
        input.searchAll = true; // A blind search: the fake satellite's position is not known until its orbit data is in
        fakeStars = [[5, 30, 0]];
        input.spooferRatio = 0.1;
        channels[0] = sat(21, GPSSatelliteState.InUse, 40);
        channels[1] = sat(22, GPSSatelliteState.None);
        realLost.add(22);
        realSnr.set(21, 44.5);

        receiver.tick(input);
        const r = rows();
        expect(r).toEqual([
            {prn: 21, state: GPSSatelliteState.InUse, snr: 44.5, zenithRad: 40 * DEG, fake: false},
            {prn: 22, state: GPSSatelliteState.None, snr: 0, zenithRad: 45 * DEG, fake: false},
            {prn: 5, state: GPSSatelliteState.None, snr: 50, zenithRad: null, fake: true}, // The first empty channel
        ]);
    });
});

describe('acquisition (#465)', () => {
    // The random source gives 0: every time is its mean less half its range (GpsSearch.ts)
    it('acquisition times: idle under a true belief, blind with searchAll, hot after a power cycle while captured with the ephemeris collected', () => {
        receiver.tick(input);
        expect(stateOf(1)).toBe(GPSSatelliteState.None); // Claimed and searched
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(37); // IDLE_ACQUISITION 40 s less 3

        receiver.clear();
        input.searchAll = true;
        tick();
        expect(stateOf(1)).toBe(GPSSatelliteState.None);
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(60); // BLIND_ACQUISITION 90 s less 30, a sky search

        // The almanac search's blind search for its first satellite, as for a real one (ALMANAC_SEARCH_ACQUISITION 390 s less 60)
        receiver.clear();
        input.almanacSearch = true;
        tick();
        expect(secondsUntil(1, GPSSatelliteState.Acquired, 400)).toBe(330);
        input.almanacSearch = false;

        // Captured: the fake ephemeris is collected, then the power is cycled at the false position and time
        receiver.clear();
        input.searchAll = false;
        believeFalse();
        believedStars = FAKE_SKY;
        tick();
        expect(receiver.believesFalse).toBe(true);
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(37); // Not collected yet: idle
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(30);
        receiver.reset();
        expect(fakePrns()).toEqual([]); // Every fake satellite lost at the power change
        tick();
        expect(stateOf(1)).toBe(GPSSatelliteState.None);
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(6); // HOT_ACQUISITION 9 s less 3, in use at once
    });

    it('no hot start with the belief more than 2 NM from the false position, or the clock at the true time', () => {
        believeFalse();
        believedStars = FAKE_SKY;
        receiver.tick(input);
        secondsUntil(1, GPSSatelliteState.InUse);

        receiver.reset();
        input.beliefLat = FALSE_POSITION.lat + 2.5 / 60; // 2.5 NM north
        tick();
        expect(receiver.believesFalse).toBe(true);
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(37);

        receiver.reset();
        input.beliefLat = FALSE_POSITION.lat + 1.5 / 60; // 1.5 NM north
        tick();
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(6);

        receiver.reset();
        input.beliefLat = FALSE_POSITION.lat;
        input.beliefTimeMs = input.simTimeMs + 1000; // The clock nearer the true time
        tick();
        expect(receiver.believesFalse).toBe(false);
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(37);

        // In a search of every PRN the hot rule still comes first (its order in the start model's times)
        receiver.reset();
        input.beliefTimeMs = input.simTimeMs + SHIFT_MS;
        input.searchAll = true;
        tick();
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(6);
    });

    // #471, rcvrEeprom (IM C-4, 0800): the same receiver searches the fake signals as the real ones, so the factor GPS
    // passes until the first fix of the power-on scales every fake acquisition time, mean and range alike. The times
    // of the test above, each times 3
    it('the 0800 factor scales the acquisition time in every branch (#471)', () => {
        input.acquisitionFactor = 3;
        receiver.tick(input);
        expect(secondsUntil(1, GPSSatelliteState.Acquired, 400)).toBe(111); // Idle: 37 s times 3

        receiver.clear();
        input.searchAll = true;
        tick();
        expect(secondsUntil(1, GPSSatelliteState.Acquired, 400)).toBe(180); // Blind: 60 s times 3

        receiver.clear();
        input.almanacSearch = true;
        tick();
        expect(secondsUntil(1, GPSSatelliteState.Acquired, 1200)).toBe(990); // Almanac search: 330 s times 3
        input.almanacSearch = false;

        // Hot: captured with the fake ephemeris collected, then the power is cycled at the false position and time
        receiver.clear();
        input.searchAll = false;
        believeFalse();
        believedStars = FAKE_SKY;
        tick();
        secondsUntil(1, GPSSatelliteState.InUse, 400);
        receiver.reset();
        tick();
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(18); // 6 s times 3

        // After the first fix GPS passes 1: the normal times again
        receiver.reset();
        input.acquisitionFactor = 1;
        tick();
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(6);
    });

    // As the SDK's receiver (GPSSatComputer.onUpdate): a step of more than twice its 5 s update interval is a pause, a time
    // change or a reload, and counts no time
    it('a step of sim time over 10 s counts nothing toward the acquisition', () => {
        receiver.tick(input);
        input.simTimeMs += 10_000;
        input.beliefTimeMs += 10_000;
        receiver.tick(input);
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(27);

        receiver.clear();
        tick();
        input.simTimeMs += 11_000;
        input.beliefTimeMs += 11_000;
        receiver.tick(input);
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(37);
    });

    it('in use 30 s after acquisition, at once if its ephemeris was collected from this spoofer', () => {
        receiver.tick(input);
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(37);
        expect(receiver.isFakeInUse(1)).toBe(false);
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(30); // EPHEMERIS_DOWNLOAD_MS
        expect(receiver.isFakeInUse(1)).toBe(true);
        expect(receiver.isFakeInUse(2)).toBe(true); // Claimed and acquired in the same ticks
        expect(receiver.isFakeInUse(5)).toBe(false); // Not searchable under the true belief
        expect([...receiver.inUsePrns()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);

        // Lost and reacquired from the same spoofer: the ephemeris is remembered
        input.jammerRatio = 1e12;
        tick();
        expect(fakePrns()).toEqual([]);
        input.jammerRatio = 0;
        tick();
        expect(stateOf(1)).toBe(GPSSatelliteState.None);
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(37);

        // A new spoofer: its ephemeris must be collected again
        input.spoofer = null;
        tick();
        input.spoofer = {...SPOOFER};
        tick();
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(37);
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(30);
    });
});

/** The jammer level that puts each of eight fake satellites of level 0.01 at the SNR: 10 log10(0.01) + 60 - 10 log10(1 + J + 0.07) */
const jammerFor = (snr: number) => Math.pow(10, (40 - snr) / 10) - 1.07;

describe('the lock rule (#465)', () => {
    it('lost below 30, released at once; reacquired only at 35', () => {
        lostRealChannels();
        input.spooferRatio = 0.08;
        receiver.tick(input);
        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(67);
        expect(receiver.claimsSdkPrn(21)).toBe(true); // Precondition: the first fake took the first lost channel

        input.jammerRatio = jammerFor(30.5);
        tick();
        expect(receiver.snr(1)).toBeCloseTo(30.5, 6);
        expect(fakePrns()).toEqual([1, 2, 3, 4]); // Tracked down to 30

        input.jammerRatio = jammerFor(29.5);
        tick();
        expect(fakePrns()).toEqual([]);
        expect(receiver.claimsSdkPrn(21)).toBe(false); // The channel is free in the same tick
        expect(receiver.inUsePrns()).toEqual([]);

        input.jammerRatio = jammerFor(34.5);
        for (let s = 0; s < 5; s++) {
            tick();
        }
        expect(fakePrns()).toEqual([]);

        input.jammerRatio = jammerFor(35.5);
        tick();
        expect(fakePrns()).toEqual([1, 2, 3, 4]);
        expect(stateOf(1)).toBe(GPSSatelliteState.None);

        // Searched, not yet acquired: released below 35
        input.jammerRatio = jammerFor(34.5);
        tick();
        expect(fakePrns()).toEqual([]);
    });
});

describe('the fake PRNs in use (#465)', () => {
    // GPS.updateSolution reads them in every calculation tick: one array, written in place, whose contents follow the
    // channels as fake satellites come into use and are lost
    it('one array for every tick, holding the fake PRNs in use in channel order as they come and go', () => {
        input.spooferRatio = 0.08; // Eight fake signals of level 0.01, for jammerFor
        receiver.tick(input);
        const prns = receiver.inUsePrns();
        expect(prns).toEqual([]);

        expect(secondsUntil(1, GPSSatelliteState.InUse)).toBe(67);
        expect(receiver.inUsePrns()).toBe(prns);
        expect([...prns]).toEqual([1, 2, 3, 4]);

        input.searchAll = true; // PRNs 5 to 8 take the next channels, searched blind: 60 s and the ephemeris
        expect(secondsUntil(5, GPSSatelliteState.InUse)).toBe(91);
        expect(receiver.inUsePrns()).toBe(prns);
        expect([...prns]).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

        input.jammerRatio = jammerFor(29.5); // Every fake satellite lost
        tick();
        expect(receiver.inUsePrns()).toBe(prns);
        expect([...prns]).toEqual([]);

        input.jammerRatio = 0;
        input.searchAll = false;
        expect(secondsUntil(2, GPSSatelliteState.InUse)).toBe(38); // The claiming tick and the idle time: the ephemeris is remembered
        expect(receiver.inUsePrns()).toBe(prns);
        expect([...prns]).toEqual([1, 2, 3, 4]);
    });
});

describe('the lock rule while the ephemeris is collected (#465)', () => {
    it('an acquired fake satellite is tracked down to 30 during its ephemeris download, then lost in that tick', () => {
        lostRealChannels();
        input.spooferRatio = 0.08;
        receiver.tick(input);
        expect(secondsUntil(1, GPSSatelliteState.Acquired)).toBe(37);

        input.jammerRatio = jammerFor(31);
        for (let s = 0; s < 10; s++) {
            tick();
        }
        expect(receiver.snr(1)).toBeCloseTo(31, 6);
        expect(stateOf(1)).toBe(GPSSatelliteState.Acquired); // Still downloading, tracked between 30 and 35
        expect(receiver.claimsSdkPrn(21)).toBe(true);

        input.jammerRatio = jammerFor(29.5);
        tick();
        expect(fakePrns()).toEqual([]);
        expect(receiver.claimsSdkPrn(21)).toBe(false);
    });
});

describe('real satellites held by a claim (#465)', () => {
    /** Calls freeHeld and returns the PRNs it gave back */
    function freed(): number[] {
        const out: number[] = [];
        receiver.freeHeld(input, prn => out.push(prn));
        return out;
    }

    it('a satellite that timed out to Unreachable in a claimed channel is freed once it leaves the channel, if its signal is not lost', () => {
        lostRealChannels();
        input.searchAll = true;
        receiver.tick(input);
        expect(receiver.claimsSdkPrn(21)).toBe(true); // Precondition: claimed
        (channels[0] as unknown as SdkSat).st = GPSSatelliteState.Unreachable; // The SDK's 4-minute timeout
        (channels[1] as unknown as SdkSat).st = GPSSatelliteState.Unreachable;
        realLost.delete(21); // The real signal of 21 is fine; 22 stays lost
        expect(freed()).toEqual([]); // Still in the claimed channels

        // The SDK moves new satellites into the two channels
        channels[0] = sat(31, GPSSatelliteState.None);
        channels[1] = sat(32, GPSSatelliteState.None);
        expect(freed()).toEqual([21]);
        expect(freed()).toEqual([]); // Once

        // The claim released while its Unreachable satellite is still in the channel
        (channels[2] as unknown as SdkSat).st = GPSSatelliteState.Unreachable;
        realLost.delete(23);
        expect(freed()).toEqual([]);
        input.spoofer = null;
        tick();
        expect(freed()).toEqual([23]);
    });
});

describe('the spoofer gone (#465)', () => {
    it('clear() on a repair releases every claim in the same tick', () => {
        lostRealChannels();
        input.searchAll = true;
        receiver.tick(input);
        expect(fakePrns()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

        input.spoofer = null;
        input.spooferRatio = 0;
        tick();
        expect(fakePrns()).toEqual([]);
        for (let prn = 21; prn <= 28; prn++) {
            expect(receiver.claimsSdkPrn(prn)).toBe(false);
        }
        expect(receiver.fakeSkyCount).toBe(0);
        expect(receiver.snr(1)).toBe(0);
        expect(rows().map(r => r.prn)).toEqual([21, 22, 23, 24, 25, 26, 27, 28]);
    });

    it('a spoofer replaced by another releases every claim in the same tick', () => {
        lostRealChannels();
        input.searchAll = true;
        receiver.tick(input);
        expect(fakePrns().length).toBe(8);

        input.spoofer = {...SPOOFER, falseLat: 30};
        tick();
        expect(fakePrns().length).toBe(8); // Claimed again, searched from the start
        expect(stateOf(1)).toBe(GPSSatelliteState.None);
        expect(fakeSky.positions[fakeSky.positions.length - 1][0]).toBe(30); // The new false position predicted at once
    });
});
