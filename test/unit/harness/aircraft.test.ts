import {describe, expect, it} from 'vitest';
import {Aircraft} from '../../harness/flight/Aircraft';
import {coupledAutopilot} from '../../harness/flight/pilots';
import {FakeSim} from '../../harness/sim/FakeSim';
import {distanceNm} from '../../harness/flight/geo';

function fly(aircraft: Aircraft, seconds: number, bank: number): void {
    for (let i = 0; i < seconds * 16; i++) aircraft.step(1 / 16, bank);
}

describe('Aircraft', () => {
    it('flies 120 NM in one hour at 120 kt', () => {
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0});
        fly(a, 3600, 0);
        expect(distanceNm({lat: 0, lon: 0}, a)).toBeCloseTo(120, 1);
        expect(a.lon).toBeCloseTo(0, 6);
    });

    it('rolls at most at the roll rate and up to the limit', () => {
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0});
        fly(a, 1, 40);
        expect(a.bankDeg).toBeCloseTo(5, 6);
        fly(a, 10, 40);
        expect(a.bankDeg).toBe(25);
    });

    it('turns at the standard rate with standard-rate bank', () => {
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0});
        a.bankDeg = 18.34;
        fly(a, 10, 18.34);
        // g·tan(18.34°)/v at 120 kt = 3.0°/s
        expect(a.trackTrue / 10).toBeCloseTo(3.0, 1);
    });
});

describe('coupledAutopilot', () => {
    it('banks right for a negative (right) roll command', () => {
        const sim = new FakeSim();
        sim.set('L:KLN90B_RollCommand', 'degrees', -10);
        const a = new Aircraft({lat: 0, lon: 0, altitudeFt: 0, groundspeedKt: 0, trackTrue: 0});
        expect(coupledAutopilot().commandedBank({sim, aircraft: a})).toBe(10);
    });
});
