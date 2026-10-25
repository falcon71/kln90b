import {describe, expect, it} from 'vitest';
import {courseAtWaypoint} from '../../../../kln90b/data/navdata/ObsGeometry';
import {courseDeg, finalCourseDeg, pointBefore, pointFrom} from '../../../harness/flight/geo';

// Positions are placed with the harness geometry (independent haversine and destination formulas), so the expectations
// do not come from the function under test.
describe('courseAtWaypoint (5-37, #370)', () => {
    // The geometry of #370: KAAA at 47 N 8 E, EEE 150 NM east of it, the aircraft 100 NM before EEE and 5 NM north of the leg
    const kaaa = {lat: 47.0, lon: 8.0};
    const eee = pointFrom(kaaa, 90, 150);
    const onLeg = pointBefore(kaaa, eee, 100);
    const position = pointFrom(onLeg, courseDeg(onLeg, eee) - 90, 5);

    it('is the final course of the great circle from the position, not the initial bearing', () => {
        expect(courseAtWaypoint(position, eee)).toBeCloseTo(finalCourseDeg(position, eee), 6); // 095.54
        expect(Math.abs(courseAtWaypoint(position, eee) - courseDeg(position, eee))).toBeGreaterThan(1.5); // 093.76
    });

    it('is just below 360 for a course just west of north, which needs no wrap', () => {
        // The position is 100 NM from the waypoint on its bearing 179, so the course at the waypoint is about 359: the
        // bearing plus 180 is below 360 already. The wrap itself is held by the course just east of north below
        const waypoint = {lat: 47.0, lon: 9.0};
        const south = pointFrom(waypoint, 179, 100);

        const course = courseAtWaypoint(south, waypoint);

        expect(course).toBeGreaterThanOrEqual(0);
        expect(course).toBeLessThan(360);
        expect(course).toBeCloseTo(finalCourseDeg(south, waypoint), 6);
        expect(course).toBeGreaterThan(358.5);
    });

    it('wraps into [0, 360) for a course just east of north', () => {
        // The position is 100 NM from the waypoint on its bearing 181: the course at the waypoint is about 001, and the
        // bearing plus 180 is past 360 before it is wrapped
        const waypoint = {lat: 47.0, lon: 9.0};
        const south = pointFrom(waypoint, 181, 100);

        const course = courseAtWaypoint(south, waypoint);

        expect(course).toBeGreaterThanOrEqual(0);
        expect(course).toBeLessThan(2);
        expect(course).toBeCloseTo(finalCourseDeg(south, waypoint), 6);
    });
});
