import {describe, expect, it} from 'vitest';
import {FixTypeFlags, GeoCircle, LegTurnDirection} from '@microsoft/msfs-sdk';
import {Flight} from '../../harness/flight/Flight';
import {ManualPilot} from '../../harness/flight/pilots';
import {World} from '../../harness/flight/World';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {APR_ARM_SWITCH, HEADING_INPUT, panelXml} from '../../harness/panelXml';
import {savedFlightplan} from '../../harness/storage';
import {fplIdents, turnStackLength} from '../../harness/readers';
import {moveArcEntry} from '../../../kln90b/services/FlightplanUtils';
import {angleBetween, angleDiff, courseDeg, crossTrackNm, distanceNm, EARTH_RADIUS_NM, pointFrom} from '../../harness/flight/geo';

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
        // The unit flies the arc by roll steering, which needs a heading input (2-69, #143); an own panel.xml replaces the
        // harness default, so it carries it
        panelXml: panelXml({...APR_ARM_SWITCH, ...HEADING_INPUT}),
        aircraft: {lat: p.lat, lon: p.lon, altitudeFt: 3000, groundspeedKt: o.groundspeedKt ?? 120, trackTrue: track},
    });
    await flight.panel.loadProcedure('APT 8');
    await flight.fly(2);
    return {flight, ...w};
}

/**
 * Recorded by the 326da1a flight below and judged by the baseline test after it, so the flight is flown once: the
 * largest distance past the FAF leg (north of it) from the start of the turn at the arc end until 30 s after the track
 * is on the leg's course (#100)
 */
const arcEnd: { overshootNm: number | null } = {overshootNm: null};

/**
 * That overshoot as the old RollSteeringController flew it as of 15b5ddd, measured on 2026-10-19 (the appendix of
 * docs/superpowers/specs/2026-10-19-roll-steering-design.md): the bound of the test below
 */
const ARC_END_OVERSHOOT_NM = 0.688;

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
        expect(fplIdents(flight.unit)).toEqual([entry, 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
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
        // (measured 0.69 NM on 2026-10-19 at 15b5ddd).
        let northOfLeg = 0;
        flight.monitor('beyond the FAF leg', f => {
            const off = crossTrackNm(f.aircraft, arcen, nextCourse);
            northOfLeg = Math.max(northOfLeg, -off); // the leg runs east, so north is on its left
            return true;
        });
        await flight.flyUntil(
            // The aircraft's own track, not the GPS GROUND TRUE TRACK output: the unit writes that once a second, and the
            // aircraft sweeps through the 2 degree window at 3 degrees per second, so a sample could miss it (#373 moved the
            // phase of the roll steering by one tick, and the old condition then never held)
            () => angleBetween(flight.aircraft.trackTrue, nextCourse) < 1,
            {timeout: 120, description: 'established on the FAF leg course'});
        expect(flight.nav.activeIdent).toBe('FAFAA');
        expect(northOfLeg).toBeLessThan(radius);

        // The farthest point past the leg comes when the track turns back through the leg's course, which can fall just
        // after the 1 degree window above, so the monitor keeps measuring for 30 s more (the leg goes on to FAFAA and
        // MAPAA on the same radial, 2.5 NM and 4 NM from ARCEN)
        await flight.fly(30);
        arcEnd.overshootNm = northOfLeg;
    });

    // The roll steering design, section 6: the new control law is not worse than the old one at the arc end, where the
    // old bank collapsed to about 4 degrees between the start of the turn and the sequencing to FAFAA (#100)
    it('overshoots the FAF leg at the arc end by no more than the old controller (#100)', () => {
        expect(arcEnd.overshootNm).not.toBeNull();
        expect(arcEnd.overshootNm!).toBeLessThanOrEqual(ARC_END_OVERSHOOT_NM);
    });
});

// The roll steering design (docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 4B): on a DME arc the unit
// steers on the arc's circle. Near its VOR the closest point of the circle is still defined, and the command must turn
// the aircraft out toward the arc. The old controller's arc code (ArcTurnController) is gone (#100)
describe('roll steering near the VOR of a DME arc (#100)', () => {
    it('gives a finite command toward the arc near its VOR', async () => {
        const {flight, abc} = await loadedOnArc(LegTurnDirection.Right, 190);
        expect(flight.nav.activeIdent).toBe('ARCEN');
        // 0.5 NM from ABC on its 225 radial, flying the arc's direction (clockwise: the radial plus 90). The aircraft is
        // set 2 s before that point and flown there wings level, so that the unit's track (taken from two successive
        // positions) is the true one when the command is read (as place() in rollSteering.test.ts)
        const radial = 225;
        const track = radial + 90;
        const at = pointFrom(abc, radial, 0.5);
        const runUp = pointFrom(at, track + 180, 120 * 2 / 3600);
        const autopilot = flight.pilot;
        flight.pilot = new ManualPilot();
        Object.assign(flight.aircraft, {lat: runUp.lat, lon: runUp.lon, trackTrue: track, bankDeg: 0});
        flight.aircraft.writeTo(flight.sim, 0);
        await flight.fly(2);
        flight.pilot = autopilot;
        expect(flight.nav.activeIdent).toBe('ARCEN');

        const roll = flight.sim.get('L:KLN90B_RollCommand', 'degrees') as number;
        const cts = (flight.sim.lastWrite('GPS COURSE TO STEER')!.value as number) * 180 / Math.PI;
        expect(Number.isFinite(roll)).toBe(true);
        expect(Number.isFinite(cts)).toBe(true);
        // The arc lies 9.5 NM out along the radial, to the left of the track: the bank is left, and the course to steer
        // leads away from the VOR, within 90 degrees of the radial
        expect(roll).toBeGreaterThan(0);
        expect(angleBetween(cts, radial)).toBeLessThan(90);
    });
});

// #441: MOVE ? on the arc entry that follows the active waypoint changes the leg in place, so moveArcEntry tells the
// active waypoint (ActiveWaypoint.onArcEntryMoved). The turn started onto the old entry is dropped and calculated again,
// as an insert or a delete of the next leg does (#408)
describe('MOVE ? on the arc entry after the active waypoint (#441)', () => {
    /**
     * FPL 0 is KAAA WPTAA KPRC, and the approach is loaded with the aircraft on the leg to WPTAA, 10 NM before it. The
     * unit enters the arc at the point of the arc closest to the aircraft then (6-16), the radial 184 here, which is
     * about 58 degrees right of the leg as seen from WPTAA. The entry follows the active waypoint WPTAA. The autopilot
     * flies the leg until the turn at WPTAA has started, and 1 s more. There the track is the leg's: its line meets the
     * arc where the leg's line does, so a moved entry needs hardly a turn at all (MOVE ? takes the entry on the track,
     * 6-17)
     */
    async function inTurnToArcEntry() {
        const {world, abc, kprc} = arcWorld(LegTurnDirection.Right);
        const wpt1 = pointFrom(pointFrom(abc, 270, 3), 180, 12);
        const kaaa = pointFrom(wpt1, 170, 25);
        const start = pointFrom(wpt1, 170, 10);
        const kaaaFac = airport('KAAA', kaaa.lat, kaaa.lon);
        const wptFac = intersection('WPTAA', wpt1.lat, wpt1.lon);
        world.add(kaaaFac, wptFac);
        const flight = await Flight.start({
            world,
            storage: savedFlightplan(0, [kaaaFac, wptFac, kprc]),
            panelXml: panelXml({...APR_ARM_SWITCH, ...HEADING_INPUT}),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 350},
        });
        await flight.fly(2);
        await flight.panel.loadProcedure('APT 8', {ident: 'KPRC'});
        await flight.flyUntil(() => flight.unit.props.memory.navPage.activeWaypoint.ownTurnStarted, {timeout: 400, description: 'the turn at WPTAA'});
        await flight.fly(1);
        // MOVE ? on the entry: the entry is recalculated on the aircraft's track, as FlightplanUtils.moveArcEntry does
        const move = () => moveArcEntry(flight.unit.props.bus, flight.unit.props.memory.fplPage.flightplans[0], 2,
            flight.unit.props.memory.navPage.activeWaypoint, flight.unit.props.sensors);
        return {flight, abc, aw: flight.unit.props.memory.navPage.activeWaypoint, move};
    }

    // The sibling that holds the preconditions: the move itself works, and the turn at WPT1 is the one onto the old entry
    it('moves the entry while the turn at the waypoint before it has started (control of the pin)', async () => {
        const {flight, aw, move} = await inTurnToArcEntry();
        expect(fplIdents(flight.unit).slice(0, 3)).toEqual(['KAAA', 'WPTAA', 'D184J']);
        expect(flight.nav.activeIdent).toBe('WPTAA');
        expect(aw.ownTurnStarted).toBe(true);
        expect(turnStackLength(flight.unit)).toBeGreaterThan(0);
        // The old turn is onto the entry about 58 degrees right of the leg, with a lead of about 0.48 NM: the aircraft is 1 s
        // into it, still more than 0.3 NM before WPTAA, which a turn of the moved entry's few degrees has not reached
        expect(distanceNm(flight.aircraft, flight.world.pos('WPTAA'))).toBeGreaterThan(0.3);

        expect(move()).toBe(true);
        expect(fplIdents(flight.unit)[2]).not.toBe('D184J');
    });

    it('drops the turn started onto the old entry when the entry is moved (#441)', async () => {
        const {flight, aw, move} = await inTurnToArcEntry();
        const oldEntries = [...aw.turnStack];
        expect(move()).toBe(true);
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('WPTAA');
        // The moved entry is on the leg's own line, so the new turn is small and its start is still ahead
        expect(aw.ownTurnStarted).toBe(false);
        oldEntries.forEach(entry => expect(aw.turnStack).not.toContain(entry));
    });
});

/** A GeoCircle as the SDK keeps it: a reversed one has the antipode of its center and the radius pi - r */
const circleRadiusNm = (c: GeoCircle) => (c.radius > Math.PI / 2 ? Math.PI - c.radius : c.radius) * EARTH_RADIUS_NM;
const circleCenter = (c: GeoCircle) => {
    const [x, y, z] = c.radius > Math.PI / 2 ? [-c.center[0], -c.center[1], -c.center[2]] : [c.center[0], c.center[1], c.center[2]];
    return {lat: Math.asin(z) * 180 / Math.PI, lon: Math.atan2(y, x) * 180 / Math.PI};
};
