import {describe, expect, it} from 'vitest';
import {GeoCircle, UnitType} from '@microsoft/msfs-sdk';
import {
    alongTrackDistance,
    bisectorSide,
    dtkAtClosest,
    inboundLegLength,
    LEAD_CAP_TIME,
    segmentDistance,
    turnLead,
} from '../../../../kln90b/data/navdata/SequencingGeometry';
import {courseDeg, distanceNm, pointFrom} from '../../../harness/flight/geo';

// Positions are placed with the harness geometry (independent haversine and destination formula); the expectations
// are literals worked out by hand from the textbook formulas.
const W = {lat: 47, lon: 9};

describe('turnLead (KLN 89 trainer, 2026-10-20)', () => {
    it('caps the lead at 60 s', () => {
        expect(LEAD_CAP_TIME).toBe(60);
    });

    it('is r·tan(θ/2) below the caps: 120° at 239 kt', () => {
        const t = turnLead(239, 120, 30);
        // 25° bank radius: 239² / (11.26 · tan 25°) ft ÷ 3.2808 = 3316 m = 1.790 NM (the constants of NavMath.turnRadius)
        expect(t.lead).toBeCloseTo(3.10, 2);   // 1.790 NM × tan 60°
        expect(t.radius).toBeCloseTo(1.790, 2);
    });

    it('caps the lead at 60 s of ground speed: 150° at 239 kt', () => {
        const t = turnLead(239, 150, 30);
        expect(t.lead).toBeCloseTo(3.983, 2);  // 239 / 60; uncapped 6.66
        expect(t.radius).toBeCloseTo(3.983 / Math.tan(75 * Math.PI / 180), 2);  // 1.067, tangent to both legs
    });

    it('caps the lead at half the inbound leg: 171° after 2.0 NM at 119 kt', () => {
        const t = turnLead(119, 171, 2.0);
        expect(t.lead).toBeCloseTo(1.0, 2);
        expect(t.radius).toBeCloseTo(1.0 / Math.tan(85.5 * Math.PI / 180), 3);
    });

    it('uses the standard-rate radius below 25° of bank: 120° at 119 kt', () => {
        expect(turnLead(119, 120, 30).lead).toBeCloseTo(1.09, 1);  // 0.628 NM × tan 60°
    });

    it('has no lead for a straight-on course, but keeps the radius: 0° at 239 kt', () => {
        const t = turnLead(239, 0, 30);
        expect(t.lead).toBe(0);
        expect(t.radius).toBeCloseTo(1.790, 2);
    });
});

describe('alongTrackDistance', () => {
    const path = GeoCircle.createGreatCircle(W, 90);

    it('is the distance still to fly to the waypoint: 3 NM before it and 2 NM to the side', () => {
        const pos = pointFrom(pointFrom(W, 270, 3), 0, 2);
        expect(alongTrackDistance(path, W, pos)).toBeCloseTo(3.0, 2);
    });

    it('is negative past the waypoint: 1 NM past it', () => {
        expect(alongTrackDistance(path, W, pointFrom(W, 90, 1))).toBeCloseTo(-1.0, 2);
    });

    it('is zero abeam the waypoint', () => {
        expect(alongTrackDistance(path, W, pointFrom(W, 0, 2))).toBeCloseTo(0, 2);
    });
});

describe('bisectorSide', () => {
    // Inbound 090, next leg 000: a 90° left turn, the bisector runs on bearing 135/315 through W
    it('is negative on the inbound side: 1 NM back along the inbound leg', () => {
        expect(bisectorSide(W, 90, 0, pointFrom(W, 270, 1))).toBeCloseTo(-0.707, 2);
    });

    it('is positive on the far side: 1 NM out along the next leg', () => {
        expect(bisectorSide(W, 90, 0, pointFrom(W, 0, 1))).toBeCloseTo(0.707, 2);
    });

    it('is zero on the line: on bearing 315 from the waypoint', () => {
        expect(bisectorSide(W, 90, 0, pointFrom(W, 315, 2))).toBeCloseTo(0, 2);
    });

    it('bisects a right turn the same way: inbound 090, next 180', () => {
        expect(bisectorSide(W, 90, 180, pointFrom(W, 270, 1))).toBeCloseTo(-0.707, 2);
        expect(bisectorSide(W, 90, 180, pointFrom(W, 180, 1))).toBeCloseTo(0.707, 2);
    });
    // The courses straddle north, where the plain mean of the two numbers is 180 and not the bisector direction 000.
    // Mean direction m = 000, so the bisector runs east-west and a point at an angle a from m is cos(a) NM out: 1 NM
    // back on bearing 170 (or 190) is at 170 degrees from m, cos 170 = -0.985; 1 NM out on bearing 010 (or 350) is +0.985
    it('crosses north to the right: inbound 350, next 010', () => {
        expect(bisectorSide(W, 350, 10, pointFrom(W, 170, 1))).toBeCloseTo(-0.985, 2);
        expect(bisectorSide(W, 350, 10, pointFrom(W, 10, 1))).toBeCloseTo(0.985, 2);
    });

    it('crosses north to the left: inbound 010, next 350', () => {
        expect(bisectorSide(W, 10, 350, pointFrom(W, 190, 1))).toBeCloseTo(-0.985, 2);
        expect(bisectorSide(W, 10, 350, pointFrom(W, 350, 1))).toBeCloseTo(0.985, 2);
    });
});

describe('segmentDistance', () => {
    const A = {lat: 47, lon: 8};
    const B = {lat: 47, lon: 9};
    const mid = pointFrom(A, courseDeg(A, B), distanceNm(A, B) / 2);

    it('is the perpendicular distance while the foot lies on the leg: 2 NM north of the midpoint', () => {
        expect(segmentDistance(A, B, undefined, pointFrom(mid, 0, 2))).toBeCloseTo(2.0, 2);
    });

    it('is the distance to the from waypoint when the foot lies past the leg: 3 NM east of B', () => {
        const pos = pointFrom(B, 90, 3);
        expect(segmentDistance(A, B, undefined, pos)).toBeCloseTo(distanceNm(A, pos), 2);
        expect(segmentDistance(A, B, undefined, pos)).toBeGreaterThan(43);
    });

    it('is the distance to the from waypoint when the foot lies before the leg: 3 NM west of A', () => {
        expect(segmentDistance(A, B, undefined, pointFrom(A, 270, 3))).toBeCloseTo(3.0, 2);
    });

    describe('on a DME arc of 10 NM around (47 N, 9 E), counterclockwise from the east to the north point', () => {
        const center = {lat: 47, lon: 9};
        const arc = GeoCircle.createFromPoint(center, UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN));
        const from = pointFrom(center, 90, 10);
        const to = pointFrom(center, 0, 10);

        it('is the radial offset while the foot lies on the arc: 2 NM outside on bearing 045', () => {
            expect(segmentDistance(from, to, arc, pointFrom(center, 45, 12))).toBeCloseTo(2.0, 2);
        });

        it('is the distance to the from waypoint past the arc: on the south point', () => {
            expect(segmentDistance(from, to, arc, pointFrom(center, 180, 10))).toBeCloseTo(14.14, 1);  // 10 NM × √2
        });
    });
});

describe('inboundLegLength (#404)', () => {
    it('is the great-circle distance between the ends of a great-circle leg: 47 N from 8 E to 9 E', () => {
        const A = {lat: 47, lon: 8};
        const B = {lat: 47, lon: 9};
        expect(inboundLegLength(A, GeoCircle.createGreatCircle(A, B), B)).toBeCloseTo(distanceNm(A, B), 3);
        expect(inboundLegLength(A, GeoCircle.createGreatCircle(A, B), B)).toBeCloseTo(40.99, 2);  // 60 arcmin × cos 47°, at 1.0018 NM per arcmin on the SDK's sphere
    });

    describe('on a DME arc of 10 NM around (47 N, 9 E), counterclockwise from the east to the north point', () => {
        const center = {lat: 47, lon: 9};
        const arc = GeoCircle.createFromPoint(center, UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN));

        it('is the length along the arc, a quarter circle of 15.71 NM, not the 14.14 NM chord', () => {
            expect(inboundLegLength(pointFrom(center, 90, 10), arc, pointFrom(center, 0, 10))).toBeCloseTo(15.71, 2);  // 10 NM × π / 2
        });

        it('counts an end off the arc at its radial: the start 1 NM outside it', () => {
            expect(inboundLegLength(pointFrom(center, 90, 11), arc, pointFrom(center, 0, 10))).toBeCloseTo(15.71, 2);
        });
    });
});

// #433: on the center of a circle every point of it is equally close, so there is no DTK abeam
describe('dtkAtClosest (#433)', () => {
    const circle = () => GeoCircle.createFromPoint(W, UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN));

    it('is the course of the circle abeam the position', () => {
        // 5 NM south of the center the closest point is 10 NM south, where the counterclockwise circle runs due east
        expect(dtkAtClosest(circle(), pointFrom(W, 180, 5))!).toBeCloseTo(90, 1);
    });

    it('is null on the center', () => {
        expect(dtkAtClosest(circle(), W)).toBeNull();
    });
});
