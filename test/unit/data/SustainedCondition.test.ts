import {describe, expect, it} from 'vitest';
import {SustainedCondition} from '../../../kln90b/data/SustainedCondition';

const T0 = Date.UTC(2026, 5, 1, 12);
const SECOND = 1000;
const HOUR = 3600 * SECOND;

/** Holds the condition true from `from` to `to` (inclusive), one second apart, and returns the last answer */
function hold(c: SustainedCondition, from: number, to: number): boolean {
    let answer = false;
    for (let t = from; t <= to; t += SECOND) {
        answer = c.update(true, t);
    }
    return answer;
}

describe('SustainedCondition', () => {
    it('holds after more than the duration, not at it', () => {
        const c = new SustainedCondition(12 * SECOND);
        for (let t = T0; t <= T0 + 12 * SECOND; t += SECOND) {
            expect(c.update(true, t)).toBe(false);
        }
        expect(c.update(true, T0 + 13 * SECOND)).toBe(true);
    });

    it('is false for a condition that does not hold', () => {
        const c = new SustainedCondition(12 * SECOND);
        for (let t = T0; t <= T0 + 30 * SECOND; t += SECOND) {
            expect(c.update(false, t)).toBe(false);
        }
    });

    it('starts again after a break', () => {
        const c = new SustainedCondition(12 * SECOND);
        hold(c, T0, T0 + 10 * SECOND);
        expect(c.update(false, T0 + 11 * SECOND)).toBe(false);

        for (let t = T0 + 12 * SECOND; t <= T0 + 24 * SECOND; t += SECOND) {
            expect(c.update(true, t)).toBe(false);
        }
        expect(c.update(true, T0 + 25 * SECOND)).toBe(true);
    });

    it('gives the same answer twice at the same time', () => {
        const c = new SustainedCondition(12 * SECOND);
        hold(c, T0, T0 + 5 * SECOND);
        expect(c.update(true, T0 + 6 * SECOND)).toBe(false);
        expect(c.update(true, T0 + 6 * SECOND)).toBe(false);

        hold(c, T0 + 7 * SECOND, T0 + 12 * SECOND);
        expect(c.update(true, T0 + 13 * SECOND)).toBe(true);
        expect(c.update(true, T0 + 13 * SECOND)).toBe(true);
    });

    it('does not advance while the time stands still (the sim paused)', () => {
        const c = new SustainedCondition(12 * SECOND);
        for (let i = 0; i < 100; i++) {
            expect(c.update(true, T0)).toBe(false);
        }
    });

    it('restarts on a backward jump of the time', () => {
        const c = new SustainedCondition(12 * SECOND);
        hold(c, T0, T0 + 11 * SECOND);
        const back = T0 - HOUR;

        for (let t = back; t <= back + 12 * SECOND; t += SECOND) {
            expect(c.update(true, t)).toBe(false);
        }
        expect(c.update(true, back + 13 * SECOND)).toBe(true);
    });

    it('restarts on a jump forward of more than 60 s', () => {
        const c = new SustainedCondition(12 * SECOND);
        hold(c, T0, T0 + 5 * SECOND);

        expect(c.update(true, T0 + 2 * HOUR)).toBe(false);
        expect(c.update(true, T0 + 2 * HOUR + 12 * SECOND)).toBe(false);
        expect(c.update(true, T0 + 2 * HOUR + 13 * SECOND)).toBe(true);
    });

    it('does not restart on a step of 60 s, as a high sim rate makes', () => {
        const c = new SustainedCondition(12 * SECOND);
        expect(c.update(true, T0)).toBe(false);
        expect(c.update(true, T0 + 60 * SECOND)).toBe(true);
    });

    it('is satisfied at once after satisfy', () => {
        const c = new SustainedCondition(12 * SECOND);
        c.satisfy(T0);
        expect(c.update(true, T0)).toBe(true);
        expect(c.update(true, T0 + SECOND)).toBe(true);
    });

    it('is not satisfied once the condition breaks after satisfy', () => {
        const c = new SustainedCondition(12 * SECOND);
        c.satisfy(T0);
        expect(c.update(false, T0 + SECOND)).toBe(false);
        expect(c.update(true, T0 + 2 * SECOND)).toBe(false);
    });

    it('counts again from restart', () => {
        const c = new SustainedCondition(12 * SECOND);
        hold(c, T0, T0 + 20 * SECOND);
        expect(c.update(true, T0 + 20 * SECOND)).toBe(true); // Precondition: it holds
        const t = T0 + 21 * SECOND;
        c.restart(t);

        for (let u = t; u <= t + 12 * SECOND; u += SECOND) {
            expect(c.update(true, u)).toBe(false);
        }
        expect(c.update(true, t + 13 * SECOND)).toBe(true);
    });

    it('forgets the count on reset', () => {
        const c = new SustainedCondition(12 * SECOND);
        hold(c, T0, T0 + 20 * SECOND);
        c.reset();

        expect(c.update(true, T0 + 21 * SECOND)).toBe(false);
        expect(c.update(true, T0 + 33 * SECOND)).toBe(false);
        expect(c.update(true, T0 + 34 * SECOND)).toBe(true);
    });
});
