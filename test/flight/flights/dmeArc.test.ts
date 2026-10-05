import {describe, expect, it} from 'vitest';
import {FixTypeFlags, GeoCircle, LegTurnDirection} from '@microsoft/msfs-sdk';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, angleDiff, courseDeg, distanceNm, EARTH_RADIUS_NM, pointFrom} from '../../harness/flight/geo';

const RNAV = ApproachType.APPROACH_TYPE_RNAV;

/**
 * A DME arc around ABC from the 180 to the 270 radial (right, clockwise) or from the 270 to the 180 radial (left,
 * counterclockwise), the same south-west quarter. FAFAA lies on the radial of the arc's end, halfway to the VOR; MAPAA
 * and the airport are 1 NM from the VOR on that radial.
 */
function arcWorld(turn: LegTurnDirection, o: { radiusNm?: number } = {}) {
    const radius = o.radiusNm ?? 10;
    const abc = vor('ABC', 47.3, 8.3);
    const at = (bearing: number, nm: number) => pointFrom(abc, bearing, nm);
    const [from, to] = turn === LegTurnDirection.Right ? [180, 270] : [270, 180];
    const arcbg = intersection('ARCBG', at(from, radius).lat, at(from, radius).lon);
    const arcen = intersection('ARCEN', at(to, radius).lat, at(to, radius).lon);
    const fafaa = intersection('FAFAA', at(to, radius / 2).lat, at(to, radius / 2).lon);
    const mapaa = intersection('MAPAA', at(to, 1).lat, at(to, 1).lon);
    const kprc = withProcedures(airport('KPRC', at(to, 1).lat, at(to, 1).lon), {
        approaches: [approach({
            type: RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG', legs: [
                    Leg.IF(arcbg, FixTypeFlags.IAF),
                    Leg.AF(arcen, abc, {radiusNm: radius, fromRadial: from, toRadial: to, turn}),
                    Leg.TF(fafaa, FixTypeFlags.FAF),
                ],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        })],
    });
    const world = new World({magvar: 0}).add(kprc, abc, arcbg, arcen, fafaa, mapaa);
    return {world, abc, kprc, arcen, fafaa, at};
}

/**
 * Starts on the arc at `radial`, on its tangent (the course to the VOR plus 90 for a left arc, minus 90 for a right
 * one), loads the approach through APT 8 and flies 2 s, so the unit has converted the arc and made ARCEN active.
 */
async function loadedOnArc(turn: LegTurnDirection, radial: number, o: { radiusNm?: number, groundspeedKt?: number } = {}) {
    const w = arcWorld(turn, o);
    const p = w.at(radial, o.radiusNm ?? 10);
    const track = (courseDeg(p, w.abc) + (turn === LegTurnDirection.Left ? 90 : -90) + 360) % 360;
    const flight = await Flight.start({
        world: w.world, storage: savedFlightplan(0, [w.kprc]),
        aircraft: {lat: p.lat, lon: p.lon, altitudeFt: 3000, groundspeedKt: o.groundspeedKt ?? 120, trackTrue: track},
    });
    await flight.panel.loadProcedure('APT 8');
    await flight.fly(2);
    return {flight, ...w};
}

const legIdents = (flight: Flight) => flight.unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);

describe('DME arc flown', () => {
    // Spec: Pilot's Guide 6-16 to 6-18 (a DME arc is flown around its VOR in the direction of the procedure, from the
    // entry to the end fix). 15d9b35 reverses the SDK circle for right-hand arcs: an SDK GeoCircle runs
    // counterclockwise, so only a left arc is flown with it as it is. Without the reversal a right arc is flown the
    // long way round the circle, which the aircraft cannot follow: it spirals into the VOR.
    it.each([
        ['right', LegTurnDirection.Right, 190, 1, 'D190J'],
        ['left', LegTurnDirection.Left, 260, -1, 'D260J'],
    ] as const)('flies a %s arc in its direction at 10 NM from the VOR to its end fix (#18)', async (_name, turn, radial, sign, entry) => {
        const {flight, abc} = await loadedOnArc(turn, radial);
        // Precondition: the unit converted the arc to its entry waypoint and made the arc's end fix active
        expect(legIdents(flight)).toEqual([entry, 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
        expect(flight.nav.activeIdent).toBe('ARCEN');

        const loadedAt = flight.t;
        let lastRadial = courseDeg(abc, flight.aircraft);
        flight.monitor('on the 10 NM circle while ARCEN is active', f => {
            if (f.nav.activeIdent !== 'ARCEN') return true;
            const r = courseDeg(abc, f.aircraft);
            const step = angleDiff(r, lastRadial) * sign; // positive: the radial turns the way the arc runs
            lastRadial = r;
            // Quiet for the first 20 s, while the aircraft settles on the arc
            if (f.t - loadedAt < 20) return true;
            const off = distanceNm(abc, f.aircraft) - 10;
            // The turn onto the next leg is anticipated and cuts the corner at the arc's end. At 120 kt the bank is
            // 18.3 degrees (57.3 * atan(120 / 362.1)), the turn radius 0.63 NM, and a 90 degree turn cuts the corner by
            // r * (sqrt(2) - 1) = 0.26 NM, so 0.3 NM holds it (measured 0.18)
            if (Math.abs(off) >= 0.3) return `${off.toFixed(2)} NM off the 10 NM circle at ${(f.t - loadedAt).toFixed(0)} s`;
            // The radial never steps back against the direction of the arc (a few thousandths of noise are allowed)
            return step > -0.01 || `the radial stepped back by ${step.toFixed(2)} degrees`;
        });

        // The arc is 80 degrees of 10 NM, 13.96 NM or 419 s at 120 kt, less the anticipation of the turn at its end
        // (measured 415 s)
        await flight.flyUntilActive('FAFAA', {timeout: 540});
        expect(flight.unit.errors).toEqual([]);
    });

    // Spec: Pilot's Guide 6-18 (the waypoint alert and the turn anticipation to the next leg at the end of an arc) and
    // 4-8 (turn anticipation). 326da1a: the anticipation takes the DTK at the end of the arc, not the present one.
    //
    // The geometry is deliberately tight and must stay so. The radius is 5 NM and the speed 180 kt, where the 25 degree
    // bank cap gives a turn radius of 1.01 NM, and the start is on the arc, 70 degrees before its end. With the present
    // DTK (290) the turn onto 090 looks like one of 160 degrees and starts at once, 5.5 NM from ARCEN. At 10 NM and
    // 120 kt the broken and the correct turn start differ by only about 0.06 NM, which no bound can tell apart. Do not
    // "simplify" this to the arc of the test above.
    it('starts the turn at the arc end from the DTK there, not the present one (326da1a)', async () => {
        const {flight, abc, arcen, fafaa} = await loadedOnArc(LegTurnDirection.Right, 200, {radiusNm: 5, groundspeedKt: 180});
        expect(flight.nav.activeIdent).toBe('ARCEN');
        // The arc ends on the 270 radial going north, and the next leg runs east: a right turn of 90 degrees
        const nextCourse = courseDeg(arcen, fafaa);
        expect(nextCourse).toBeCloseTo(89.91, 2);

        await flight.flyUntil(
            () => flight.nav.activeIdent !== 'ARCEN' || angleBetween(flight.nav.dtkTrue, nextCourse) < 1,
            {timeout: 300, description: 'turn onto the FAF leg started'});

        expect(flight.nav.activeIdent).toBe('ARCEN');
        // Lower bound: the turn radius at 180 kt and the 25 degree bank cap is 1.01 NM, and a 90 degree turn needs
        // r * tan(45) of lead. Upper bound: the roll-in adds 25 deg / (5 deg/s) * 180 kt = 0.25 NM and one calculation
        // tick 0.05 NM, 1.01 + 0.25 + 0.05 = 1.31 (measured 1.24 NM). The broken start is at 5.5 NM.
        const distance = distanceNm(flight.aircraft, arcen);
        expect(distance).toBeGreaterThan(1.01);
        expect(distance).toBeLessThan(1.31);

        // The same fromDtk builds the turn itself (4-8: the unit saves how the turn was calculated), so it must put the
        // turn circle where the geometry says. The arc ends going along the tangent there, which is the course to the
        // VOR minus 90 for a clockwise arc. The turn starts r * tan(45) before ARCEN on that line, and its circle has
        // its center r to the right of the start. Reversing fromDtk on arcs only moves the start behind ARCEN and the
        // center to the left of it; the start distance above does not see that, the turn it flies does.
        const radius = (180 * 1852 / 3600) ** 2 / (9.80665 * Math.tan(25 * Math.PI / 180)) / 1852; // NM, 1.012
        const tangent = courseDeg(arcen, abc) - 90;
        const start = pointFrom(arcen, tangent + 180, radius * Math.tan(Math.PI / 4));
        const center = pointFrom(start, tangent + 90, radius);
        const turn = flight.unit.props.memory.navPage.activeWaypoint.turnStack
            .map(entry => entry.path)
            .reduce((smallest, path) => circleRadiusNm(path) < circleRadiusNm(smallest) ? path : smallest);
        expect(circleRadiusNm(turn)).toBeCloseTo(radius, 1);
        expect(distanceNm(circleCenter(turn), center)).toBeLessThan(0.03);

        // Flown through, the aircraft is on the FAF leg and never passes it by more than one turn radius. That is what
        // a turn that starts at the waypoint, without any lead, would give; the turn flown here stays inside it
        // (measured 0.65 NM).
        let northOfLeg = 0;
        flight.monitor('beyond the FAF leg', f => {
            const d = distanceNm(arcen, f.aircraft);
            const off = Math.asin(Math.sin(d / EARTH_RADIUS_NM) * Math.sin((courseDeg(arcen, f.aircraft) - nextCourse) * Math.PI / 180)) * EARTH_RADIUS_NM;
            northOfLeg = Math.max(northOfLeg, -off); // the leg runs east, so north is on its left
            return true;
        });
        await flight.flyUntil(
            () => angleBetween(flight.sim.get('GPS GROUND TRUE TRACK', 'degrees'), nextCourse) < 1,
            {timeout: 120, description: 'established on the FAF leg course'});
        expect(flight.nav.activeIdent).toBe('FAFAA');
        expect(northOfLeg).toBeLessThan(radius);
    });
});

/** A GeoCircle as the SDK keeps it: a reversed one has the antipode of its center and the radius pi - r */
const circleRadiusNm = (c: GeoCircle) => (c.radius > Math.PI / 2 ? Math.PI - c.radius : c.radius) * EARTH_RADIUS_NM;
const circleCenter = (c: GeoCircle) => {
    const [x, y, z] = c.radius > Math.PI / 2 ? [-c.center[0], -c.center[1], -c.center[2]] : [c.center[0], c.center[1], c.center[2]];
    return {lat: Math.asin(z) * 180 / Math.PI, lon: Math.atan2(y, x) * 180 / Math.PI};
};
