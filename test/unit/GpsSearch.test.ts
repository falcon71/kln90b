import {describe, expect, it} from 'vitest';
import {GPS_ERA_DURATION, receiverTimeDifference} from '../../kln90b/GpsSearch';

// #62, #63: the receiver keeps GPS time as the week modulo 1024 and the time of week, so a difference of its clocks is
// wrapped into half an era either way. The expectations are literals, not derived from the constant under test
const DAY = 24 * 60 * 60 * 1000;
const ERA = 1024 * 7 * 24 * 3600 * 1000;

describe('receiverTimeDifference', () => {
    it('the era is 1024 weeks', () => {
        expect(GPS_ERA_DURATION).toBe(ERA);
    });

    it.each([
        [0, 0, 0],
        [ERA, 0, 0],
        [-ERA, 0, 0],
    ])('a difference of %d - %d is no difference at all', (a, b, expected) => {
        expect(Math.abs(receiverTimeDifference(a, b))).toBe(expected);
    });

    it.each([
        [DAY, 0, DAY],
        [-DAY, 0, -DAY],
        [-ERA + DAY, 0, DAY], // A day ahead, one era back
        [ERA - DAY, 0, -DAY],
        [DAY, -ERA, DAY], // The second argument counts, too
        [ERA / 2, 0, ERA / 2], // Half an era stays as it is, either way
        [-ERA / 2, 0, -ERA / 2],
        [ERA / 2 + 1, 0, -ERA / 2 + 1], // Beyond half an era, the other way round is shorter
        [-ERA / 2 - 1, 0, ERA / 2 - 1],
    ])('%d - %d is %d', (a, b, expected) => {
        expect(receiverTimeDifference(a, b)).toBe(expected);
    });
});
