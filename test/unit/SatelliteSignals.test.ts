import {describe, expect, it} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {
    AntennaAttitude, antennaCurveSnr, antennaSinElevation, BACKLOBE_SNR, blockOffsetDb, fadeSigmaDb,
    LEVEL_ATTITUDE, MAX_SIGNAL_STEP_S, SatelliteSignals,
} from '../../kln90b/GpsSignal';
import {MAX_TRIGGER_STEP_S} from '../../kln90b/failures/FailureTrigger';
import {mulberry32} from '../harness/sim/random';
import {countAllocations} from '../harness/allocation';

const deg = (d: number) => d * Math.PI / 180;

interface FakeSat {
    prn: number;
    zenith: number;
    hour: number;
    state: GPSSatelliteState;
}

function makeSat(prn: number, elevationDeg: number, hourDeg = 0, state: GPSSatelliteState = GPSSatelliteState.InUse): FakeSat {
    return {prn, zenith: deg(90 - elevationDeg), hour: deg(hourDeg), state};
}

function view(sats: FakeSat[]) {
    const objs = sats.map(s => ({
        prn: s.prn,
        position: {get: () => Float64Array.of(s.zenith, s.hour)},
        state: {get: () => s.state},
    }) as unknown as GPSSatellite);
    return {satellites: () => objs};
}

function build(sats: FakeSat[], blocks: Record<number, string | undefined> = {}, seed = 1) {
    return new SatelliteSignals(view(sats), mulberry32(seed), sat => blocks[sat.prn]);
}

const flight = (a: Partial<AntennaAttitude> = {}): AntennaAttitude => ({...LEVEL_ATTITUDE, ...a});

function quiet(signals: SatelliteSignals) {
    signals.fadeScale = 0;
    signals.jitterScale = 0;
}

describe('SatelliteSignals deterministic part (characterization)', () => {
    it('is the curve plus the block offset, and the jamming lowers it', () => {
        const s = makeSat(5, 30);
        const signals = build([s], {5: 'GPS-IIF'});
        quiet(signals);
        signals.tick(0, LEVEL_ATTITUDE, 0);
        const expected = antennaCurveSnr(antennaSinElevation(s.zenith, s.hour, LEVEL_ATTITUDE)) + blockOffsetDb('GPS-IIF', Math.cos(s.zenith));
        expect(signals.snr(5)).toBeCloseTo(expected, 9);
        expect(signals.snr(5)).toBeCloseTo(46.4 + 1, 1);
        signals.tick(1, LEVEL_ATTITUDE, 10);
        expect(signals.snr(5)).toBeCloseTo(expected - 10, 9);
    });

    it('treats a satellite without a block as offset 0 and does not throw', () => {
        const s = makeSat(6, 30);
        const signals = build([s]);
        quiet(signals);
        signals.tick(0, LEVEL_ATTITUDE, 0);
        expect(signals.snr(6)).toBeCloseTo(antennaCurveSnr(antennaSinElevation(s.zenith, s.hour, LEVEL_ATTITUDE)), 9);
    });

    it('gives a satellite with a NaN position the back lobe plus its fade', () => {
        const s = makeSat(7, 30);
        s.zenith = NaN;
        const signals = build([s], {7: 'GPS-IIIA'});
        quiet(signals);
        signals.tick(0, LEVEL_ATTITUDE, 0);
        expect(signals.snr(7)).toBe(BACKLOBE_SNR);
        signals.fadeScale = 1;
        signals.reset();
        signals.tick(0, LEVEL_ATTITUDE, 0);
        expect(signals.snr(7)).not.toBe(BACKLOBE_SNR);
        expect(Math.abs(signals.snr(7) - BACKLOBE_SNR)).toBeLessThan(6 * fadeSigmaDb(NaN, false));
    });

    it('takes the GPS-IIIA ramp from the local elevation, not from the elevation above the tilted antenna', () => {
        const s = makeSat(8, 30); // Dead ahead at a local elevation of 30 degrees: no ramp yet, -1.5 dB
        const signals = build([s], {8: 'GPS-IIIA'});
        quiet(signals);
        const attitude = flight({pitchUpDeg: -30}); // Nose down: the antenna sees it at 60 degrees, where the ramp would give -4 dB
        expect(antennaSinElevation(s.zenith, s.hour, attitude)).toBeCloseTo(Math.sin(deg(60)), 9); // Precondition
        signals.tick(0, attitude, 0);
        expect(signals.snr(8)).toBeCloseTo(antennaCurveSnr(Math.sin(deg(60))) - 1.5, 9);
    });

    it('reports 0 and not lost for a PRN never computed', () => {
        const signals = build([makeSat(5, 30)]);
        expect(signals.snr(9)).toBe(0);
        expect(signals.isLost(9)).toBe(false);
    });
});

describe('SatelliteSignals lock rule (characterization)', () => {
    function setup(state: GPSSatelliteState) {
        const s = makeSat(5, 30, 0, state);
        const signals = build([s]);
        quiet(signals);
        const base = antennaCurveSnr(antennaSinElevation(s.zenith, s.hour, LEVEL_ATTITUDE));
        const at = (snr: number, t: number) => signals.tick(t, LEVEL_ATTITUDE, base - snr);
        return {signals, at};
    }

    it('keeps a tracked satellite at exactly 30 and loses one just below', () => {
        const {signals, at} = setup(GPSSatelliteState.InUse);
        at(30.0000001, 0);
        expect(signals.isLost(5)).toBe(false);
        at(29.99, 1);
        expect(signals.isLost(5)).toBe(true);
    });

    describe('at the exact thresholds', () => {
        /** At the zenith, with no block and no fade or jitter, the SNR is exactly 50 minus the jamming */
        function zenith(state: GPSSatelliteState) {
            const signals = build([makeSat(5, 90, 0, state)]);
            quiet(signals);
            return signals;
        }

        it('keeps a tracked satellite at exactly 30', () => {
            const signals = zenith(GPSSatelliteState.InUse);
            signals.tick(0, LEVEL_ATTITUDE, 20);
            expect(signals.snr(5)).toBe(30);
            expect(signals.isLost(5)).toBe(false);
        });

        it('brings a lost satellite back at exactly 35 and keeps it lost just below', () => {
            const signals = zenith(GPSSatelliteState.InUse);
            signals.tick(0, LEVEL_ATTITUDE, 40);
            expect(signals.isLost(5)).toBe(true);
            signals.tick(1, LEVEL_ATTITUDE, 15.5);
            expect(signals.isLost(5)).toBe(true);
            signals.tick(2, LEVEL_ATTITUDE, 15);
            expect(signals.snr(5)).toBe(35);
            expect(signals.isLost(5)).toBe(false);
        });

        it('does not lose an untracked satellite at exactly 35', () => {
            const signals = zenith(GPSSatelliteState.None);
            signals.tick(0, LEVEL_ATTITUDE, 15);
            expect(signals.snr(5)).toBe(35);
            expect(signals.isLost(5)).toBe(false);
            signals.tick(1, LEVEL_ATTITUDE, 15.5);
            expect(signals.isLost(5)).toBe(true);
        });
    });

    it('keeps a lost satellite lost just below 35 and brings it back at 35', () => {
        const {signals, at} = setup(GPSSatelliteState.InUse);
        at(20, 0);
        expect(signals.isLost(5)).toBe(true);
        at(34.99, 1);
        expect(signals.isLost(5)).toBe(true);
        at(35.01, 2);
        expect(signals.isLost(5)).toBe(false);
    });

    it('loses an untracked satellite while it is below 35', () => {
        const {signals, at} = setup(GPSSatelliteState.None);
        at(34.99, 0);
        expect(signals.isLost(5)).toBe(true);
        at(35.01, 1);
        expect(signals.isLost(5)).toBe(false);
    });

    it('counts Acquired, DataCollected and InUseDiffApplied as tracked', () => {
        for (const state of [GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUseDiffApplied]) {
            const {signals, at} = setup(state);
            at(32, 0);
            expect(signals.isLost(5), String(state)).toBe(false);
        }
    });

    it('does not count None or Unreachable as tracked', () => {
        for (const state of [GPSSatelliteState.None, GPSSatelliteState.Unreachable]) {
            const {signals, at} = setup(state);
            at(32, 0);
            expect(signals.isLost(5), String(state)).toBe(true);
        }
    });

    it('loses a satellite when the bank tilts the antenna away and only brings it back at 35', () => {
        const s = makeSat(5, 15, 90);
        const signals = build([s]);
        quiet(signals);
        signals.tick(0, flight(), 0);
        expect(signals.isLost(5)).toBe(false);
        signals.tick(1, flight({bankRightDeg: 25}), 0);
        expect(signals.isLost(5)).toBe(true);
        signals.tick(2, flight(), 9);
        expect(signals.snr(5)).toBeGreaterThan(30);
        expect(signals.snr(5)).toBeLessThan(35);
        expect(signals.isLost(5)).toBe(true);
        signals.tick(3, flight(), 0);
        expect(signals.isLost(5)).toBe(false);
    });
});

describe('SatelliteSignals fade (characterization)', () => {
    function run(onGround: boolean, ticks: number, lag: number, seed = 42) {
        const s = makeSat(5, 0);
        const signals = build([s], {}, seed);
        signals.jitterScale = 0;
        const att = flight({onGround});
        const sinE = antennaSinElevation(s.zenith, s.hour, att);
        const det = antennaCurveSnr(sinE);
        const x = new Float64Array(ticks);
        for (let i = 0; i < ticks; i++) {
            signals.tick(i, att, 0);
            x[i] = signals.snr(5) - det;
        }
        let mean = 0;
        for (let i = 0; i < ticks; i++) {
            mean += x[i];
        }
        mean /= ticks;
        let v = 0;
        let c = 0;
        for (let i = 0; i < ticks; i++) {
            v += (x[i] - mean) ** 2;
        }
        for (let i = 0; i + lag < ticks; i++) {
            c += (x[i] - mean) * (x[i + lag] - mean);
        }
        return {sd: Math.sqrt(v / ticks), ac: (c / (ticks - lag)) / (v / ticks), sigma: fadeSigmaDb(sinE, onGround)};
    }

    it('has the sigma of the fade table and a correlation time of 20 s in flight', () => {
        const r = run(false, 20000, 20);
        expect(r.sigma).toBeCloseTo(1.2, 9);
        expect(Math.abs(r.sd - 1.2)).toBeLessThan(0.1);
        expect(Math.abs(r.ac - Math.exp(-1))).toBeLessThan(0.1);
    });

    it('has a correlation time of 120 s on the ground', () => {
        const r = run(true, 200000, 120);
        expect(Math.abs(r.ac - Math.exp(-1))).toBeLessThan(0.1);
    });
});

describe('SatelliteSignals jitter (characterization)', () => {
    it('has the sample sigma of the jitter table at an SNR of about 30', () => {
        const s = makeSat(5, 30);
        const signals = build([s], {}, 7);
        signals.fadeScale = 0;
        const base = antennaCurveSnr(antennaSinElevation(s.zenith, s.hour, LEVEL_ATTITUDE));
        const n = 20000;
        const x = new Float64Array(n);
        for (let i = 0; i < n; i++) {
            signals.tick(i, LEVEL_ATTITUDE, base - 30);
            x[i] = signals.snr(5) - 30;
        }
        let mean = 0;
        for (let i = 0; i < n; i++) {
            mean += x[i];
        }
        mean /= n;
        let v = 0;
        for (let i = 0; i < n; i++) {
            v += (x[i] - mean) ** 2;
        }
        expect(Math.abs(Math.sqrt(v / n) - 0.84)).toBeLessThan(0.05);
    });
});

describe('SatelliteSignals jitter size (characterization)', () => {
    // random() = 0.25 makes every Box-Muller pair (0, sqrt(-2 ln 0.75)). Two satellites shift the draw order so that the
    // second tick draws the nonzero value of the pair as the jitter of the first satellite
    const Z = Math.sqrt(-2 * Math.log(0.75));

    it.each([[10, 40], [23, 27]])('scales the jitter by the sigma of the SNR before it (jamming %d, SNR %d)', (jam, snr) => {
        const a = makeSat(5, 90);
        const signals = new SatelliteSignals(view([a, makeSat(6, 90)]), () => 0.25, () => undefined);
        signals.fadeScale = 0;
        signals.tick(0, LEVEL_ATTITUDE, jam);
        expect(signals.snr(5)).toBeCloseTo(snr, 9);
        signals.tick(1, LEVEL_ATTITUDE, jam);
        const sigma = 0.15 * Math.pow(10, (45 - snr) / 20);
        expect(signals.snr(5)).toBeCloseTo(snr + Z * sigma, 9);
    });
});

describe('SatelliteSignals time step (characterization)', () => {
    it('has the same step limit as the failure trigger', () => {
        expect(MAX_SIGNAL_STEP_S).toBe(MAX_TRIGGER_STEP_S);
    });

    function warm() {
        const signals = build([makeSat(5, 20)], {}, 3);
        signals.tick(100, LEVEL_ATTITUDE, 0);
        signals.tick(101, LEVEL_ATTITUDE, 0);
        return signals;
    }

    it('draws no jitter and moves no fade on a step back or a jump of 10 hours', () => {
        const a = build([makeSat(5, 20)], {}, 3);
        a.tick(100, LEVEL_ATTITUDE, 0);
        const v0 = a.snr(5);
        a.tick(50, LEVEL_ATTITUDE, 0);
        expect(a.snr(5)).toBe(v0);
        a.tick(50 + 36000, LEVEL_ATTITUDE, 0);
        expect(a.snr(5)).toBe(v0);
        a.tick(50 + 36001, LEVEL_ATTITUDE, 0);
        expect(a.snr(5)).not.toBe(v0);
    });

    it('moves on a step of exactly the limit and not on one just over it', () => {
        const a = warm();
        const v = a.snr(5);
        a.tick(101 + MAX_SIGNAL_STEP_S, LEVEL_ATTITUDE, 0);
        expect(a.snr(5)).not.toBe(v);
        const b = warm();
        b.tick(101 + MAX_SIGNAL_STEP_S + 0.5, LEVEL_ATTITUDE, 0);
        expect(b.snr(5)).toBe(v);
    });

    it('does not move on the same time again, and refresh draws nothing', () => {
        const a = warm();
        const v = a.snr(5);
        a.tick(101, LEVEL_ATTITUDE, 0);
        expect(a.snr(5)).toBe(v);
        a.refresh(LEVEL_ATTITUDE, 0);
        expect(a.snr(5)).toBe(v);
        a.refresh(LEVEL_ATTITUDE, 0);
        a.tick(102, LEVEL_ATTITUDE, 0);
        const b = warm();
        b.tick(102, LEVEL_ATTITUDE, 0);
        expect(a.snr(5)).toBe(b.snr(5));
    });

    it('lets refresh apply a new jamming value and the lock rule', () => {
        const a = warm();
        a.refresh(LEVEL_ATTITUDE, 40);
        expect(a.isLost(5)).toBe(true);
        expect(a.snr(5)).toBeLessThan(15);
    });
});

describe('SatelliteSignals reset (characterization)', () => {
    it('clears the lost set and draws a fresh fade, and the next tick counts nothing', () => {
        const s = makeSat(5, 20);
        const signals = build([s], {}, 9);
        signals.tick(0, LEVEL_ATTITUDE, 40);
        expect(signals.isLost(5)).toBe(true);
        signals.reset();
        expect(signals.isLost(5)).toBe(false);
        signals.tick(1, LEVEL_ATTITUDE, 0);
        const afterReset = signals.snr(5);
        // the same sequence from the same seed reproduces it, so the draw after a reset is deterministic
        const ref = build([s], {}, 9);
        ref.tick(0, LEVEL_ATTITUDE, 40);
        ref.reset();
        ref.tick(1, LEVEL_ATTITUDE, 0);
        expect(ref.snr(5)).toBe(afterReset);
        // and it is a fresh z, not the one kept from before: without the reset the fade would have moved by dt only
        const kept = build([s], {}, 9);
        kept.tick(0, LEVEL_ATTITUDE, 40);
        kept.tick(1, LEVEL_ATTITUDE, 0);
        expect(kept.snr(5)).not.toBe(afterReset);
    });

    it('counts no time across a reset, even within the step limit', () => {
        const s = makeSat(5, 20);
        const signals = build([s], {}, 9);
        signals.fadeScale = 0;
        signals.tick(100, LEVEL_ATTITUDE, 0);
        signals.tick(101, LEVEL_ATTITUDE, 0);
        signals.reset();
        signals.tick(102, LEVEL_ATTITUDE, 0);
        const fresh = build([s], {}, 9);
        fresh.fadeScale = 0;
        fresh.tick(0, LEVEL_ATTITUDE, 0);
        expect(signals.snr(5)).toBe(fresh.snr(5));
    });
});

describe('SatelliteSignals allocation (characterization)', () => {
    it('allocates nothing in a tick after a warm-up', () => {
        const signals = build([makeSat(5, 20), makeSat(6, 50, 40)], {5: 'GPS-IIIA'});
        signals.tick(0, LEVEL_ATTITUDE, 0);
        const {counts} = countAllocations(() => {
            signals.tick(1, LEVEL_ATTITUDE, 0);
            signals.refresh(LEVEL_ATTITUDE, 0);
        });
        for (const k of Object.keys(counts)) {
            expect(counts[k], k).toBe(0);
        }
    });
});
