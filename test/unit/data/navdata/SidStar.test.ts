import {describe, expect, it} from 'vitest';
import {
    AirportFacility, ApproachProcedure, Facility, FixTypeFlags, FlightPlan, FlightPlanLeg, GeoCircle, GeoPoint, ICAO, LegTurnDirection,
    LegType, Procedure, RnavTypeFlags,
} from '@microsoft/msfs-sdk';
import {SidStar} from '../../../../kln90b/data/navdata/SidStar';
import {KLNFixType, KLNFlightplanLeg, KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {Sensors} from '../../../../kln90b/Sensors';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, star} from '../../../harness/navdata/procedures';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {EARTH_RADIUS_NM, pointFrom} from '../../../harness/flight/geo';
import {identsOf} from '../../../harness/readers';

const fix = intersection('FIXAA', 47, 8);

/** The legs of an approach that tests do not care about; every call returns new legs */
const legs = () => ({final: [Leg.IF(fix), Leg.TF(fix)], missed: [Leg.TF(fix)]});

const LNAV_LNAVVNAV = RnavTypeFlags.LNAV | RnavTypeFlags.LNAVVNAV;

describe('SidStar.isApproachRecognized', () => {
    // 2-2: the database holds the non-precision overlays (no LOC, LDA or SDF) and the GPS-only approaches. Whether an
    // approach is listed is decided on its type, so a precision approach type is never listed.
    describe.each([
        ['GPS', ApproachType.APPROACH_TYPE_GPS],
        ['VOR', ApproachType.APPROACH_TYPE_VOR],
        ['VORDME', ApproachType.APPROACH_TYPE_VORDME],
        ['NDB', ApproachType.APPROACH_TYPE_NDB],
        ['NDBDME', ApproachType.APPROACH_TYPE_NDBDME],
    ])('%s approach (#6 cc89fd4)', (_name, type) => {
        it('is listed', () => {
            expect(SidStar.isApproachRecognized(approach({type, runway: '27', ...legs()}))).toBe(true);
        });
    });

    it.each([
        ['ILS', ApproachType.APPROACH_TYPE_ILS],
        ['LOCALIZER', ApproachType.APPROACH_TYPE_LOCALIZER],
        ['LDA', ApproachType.APPROACH_TYPE_LDA],
        ['SDF', ApproachType.APPROACH_TYPE_SDF],
        ['LOCALIZER_BACK_COURSE', ApproachType.APPROACH_TYPE_LOCALIZER_BACK_COURSE],
    ])('does not list a %s approach (#6 117f548)', (_name, type) => {
        expect(SidStar.isApproachRecognized(approach({type, runway: '27', ...legs()}))).toBe(false);
    });

    // The LNAV-bit rule is the code's convention (RNAV approaches only if LNAV without VNAV is allowed), not a
    // statement of the Pilot's Guide.
    describe('RNAV approaches (characterization of the LNAV rule)', () => {
        const RNAV = ApproachType.APPROACH_TYPE_RNAV;

        it('lists an RNAV approach with the LNAV bit and no RF leg (#6 4fa8cea)', () => {
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', rnav: LNAV_LNAVVNAV, ...legs()}))).toBe(true);
        });

        it('does not list an RNAV approach without the LNAV bit (LNAV/VNAV and LPV only)', () => {
            const flags = RnavTypeFlags.LNAVVNAV | RnavTypeFlags.LPV;
            expect(flags).toBe(10);
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', rnav: flags, ...legs()}))).toBe(false);
        });

        it('does not list an RNAV approach with no flags at all', () => {
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', rnav: 0, ...legs()}))).toBe(false);
        });
    });

    // The real unit has no arc-to-fix with a radius change (RF) leg. Where the code filters them is the code's
    // convention: the final legs, any transition or the missed approach.
    describe('RF legs (characterization)', () => {
        const RNAV = ApproachType.APPROACH_TYPE_RNAV;
        const withRf = () => [Leg.TF(fix), Leg.RF(fix)];

        it.each([
            ['the final legs', () => ({final: withRf()})],
            ['a transition', () => ({transitions: [{name: 'TRANS', legs: withRf()}]})],
            ['the missed approach', () => ({missed: withRf()})],
        ])('does not list an RNAV approach with an RF leg in %s', (_where, fields) => {
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', rnav: LNAV_LNAVVNAV, ...legs(), ...fields()}))).toBe(false);
        });

        it('does not list a VOR approach with an RF leg', () => {
            expect(SidStar.isApproachRecognized(approach({type: ApproachType.APPROACH_TYPE_VOR, runway: '27', ...legs(), final: withRf()}))).toBe(false);
        });
    });
});

// #59: the unit lists every approach and procedure whatever its RNP value, as the real unit does at 2M2 and KMBT even
// though some of their approaches need an RNP below 1. Only RNP AR (authorization required) and RF legs are filtered.
// The code's comment is the reference here, the Pilot's Guide does not discuss RNP values: characterization.
describe('RNP is not a filter (characterization, #59 71481dc, b0c16cf)', () => {
    /** A leg with a required navigation performance, in meters (FlightPlanLeg.rnp) */
    const rnpLeg = (type: LegType, rnp: number) => FlightPlan.createLeg({type, rnp, fixIcaoStruct: fix.icaoStruct});
    const procedure = (rnpAr: boolean) => sid('RNP1', {common: [rnpLeg(LegType.TF, 1852)], rnpAr});

    it('lists an RNAV approach with LNAV whose legs all have an RNP of 0.3 NM', () => {
        const a = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '27', rnav: LNAV_LNAVVNAV,
            final: [rnpLeg(LegType.IF, 555.6), rnpLeg(LegType.TF, 555.6)], missed: [rnpLeg(LegType.IF, 555.6), rnpLeg(LegType.TF, 555.6)],
        });
        expect(SidStar.isApproachRecognized(a)).toBe(true);
    });

    it('lists a VOR approach with a leg at an RNP of 1 NM', () => {
        const a = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27', final: [Leg.IF(fix), rnpLeg(LegType.TF, 1852)], missed: [Leg.TF(fix)],
        });
        expect(SidStar.isApproachRecognized(a)).toBe(true);
    });

    it('does not list an RNP AR approach', () => {
        expect(SidStar.isApproachRecognized(approach({type: ApproachType.APPROACH_TYPE_VOR, runway: '27', ...legs(), rnpAr: true}))).toBe(false);
    });

    it('does not list an approach with an RNP AR missed approach', () => {
        expect(SidStar.isApproachRecognized(approach({type: ApproachType.APPROACH_TYPE_VOR, runway: '27', ...legs(), missedRnpAr: true}))).toBe(false);
    });

    it('lists a procedure with a leg at an RNP of 1 NM', () => {
        expect(SidStar.isProcedureRecognized(procedure(false))).toBe(true);
    });

    it('does not list an RNP AR procedure', () => {
        expect(SidStar.isProcedureRecognized(procedure(true))).toBe(false);
    });
});

// #14: a procedure that only has legs the unit cannot fly (CA, VM: no fix) would show up as an empty procedure on
// APT 7. The rule is the code's: no manual page describes it, so these are characterization tests.
describe('SidStar.isProcedureRecognized needs a recognized leg (characterization, #14 8da5eee)', () => {
    it('does not list a procedure whose only legs are CA and VM without a fix', () => {
        expect(SidStar.isProcedureRecognized(sid('GEG7', {runways: [{runway: '04', legs: [Leg.CA(40), Leg.VM(40)]}]}))).toBe(false);
    });

    it('lists it once a common leg to a fix is added', () => {
        const p = sid('GEG7', {runways: [{runway: '04', legs: [Leg.CA(40), Leg.VM(40)]}], common: [Leg.TF(fix)]});
        expect(SidStar.isProcedureRecognized(p)).toBe(true);
    });

    it('judges one runway transition on its own legs', () => {
        const p = sid('JFK5', {
            runways: [{runway: '04', legs: [Leg.CA(40), Leg.VM(40)]}, {runway: '31', legs: [Leg.CA(310), Leg.TF(fix)]}],
        });
        const [rwy04, rwy31] = p.runwayTransitions;
        expect(SidStar.isProcedureRecognized(p, rwy04)).toBe(false);
        expect(SidStar.isProcedureRecognized(p, rwy31)).toBe(true);
    });
});

type ArcNamer = { getArcEntryName(navaid: string, radial: number, dist: number): string };
const getArcEntryName = (navaid: string, radial: number, dist: number) =>
    (SidStar as unknown as ArcNamer).getArcEntryName(navaid, radial, dist);

describe('SidStar.getArcEntryName (#28 063a836)', () => {
    // 6-6, 6-16: D, the radial in three digits, and the distance as a letter (A is 1 NM, Z is 26 NM)
    it.each([
        [18, 'D045R'],
        [26, 'D045Z'],
    ])('names an arc entry %i NM from the VOR', (dist, name) => {
        expect(getArcEntryName('ABC', 45, dist)).toBe(name);
    });

    // 6-6: DME arcs beyond 26 NM have waypoints named with the first two letters of the DME ident and the three-digit
    // radial.
    it.each([
        ['ABC', 45, 27, 'AB045'],
        ['ABC', 45, 80, 'AB045'],
        ['ABC', 270, 30, 'AB270'],
        ['ABC', 5, 120, 'AB005'],
    ])('names the arc entry of %s radial %i at %i NM beyond 26 NM', (navaid, radial, dist, name) => {
        expect(getArcEntryName(navaid, radial, dist)).toBe(name);
    });

    // A radial just below north is named 000, never 360 (the north rule of #263): characterization, #363
    it('characterization: names an entry on the radial 359.6 D000J (#363)', () => {
        expect(getArcEntryName('ABC', 359.6, 10)).toBe('D000J');
    });

    it('characterization: names an entry on the radial 359.6 beyond 26 NM AB000 (#363)', () => {
        expect(getArcEntryName('ABC', 359.6, 30)).toBe('AB000');
    });
});

// 6-17: an arc entry is recalculated from the current track: the point where the track meets the arc, ahead of the
// aircraft. The VOR ABC is at 0/0 and the arc has a radius of 10 NM. The expected values are solved on the sphere
// of geo.ts (radius EARTH_RADIUS_NM) without the SDK, so the numbers hold for the code's great circles.
describe('SidStar.recalculateArcEntryData (9ce23bf, f4f5395, 1ef2a35)', () => {
    const R = EARTH_RADIUS_NM;
    const toDeg = (nm: number) => nm / R * 180 / Math.PI;

    const arcEnd = intersection('ARCEN', 0.14, 0.08);

    function arcLeg(turnDirection: LegTurnDirection, beginRadial: number, endRadial: number): KLNFlightplanLeg {
        const circle = new GeoCircle(GeoPoint.sphericalToCartesian({lat: 0, lon: 0}, new Float64Array(3)), 10 / R);
        if (turnDirection === LegTurnDirection.Right) {
            circle.reverse(); // as getArcEntryData does for right-hand arcs
        }
        return {arcData: {beginRadial, endRadial, turnDirection, vor: vor('ABC', 0, 0), endFacility: arcEnd, circle}} as unknown as KLNFlightplanLeg;
    }

    function sensorsAt(lat: number, lon: number, track: number | null): Sensors {
        return {in: {gps: {coords: new GeoPoint(lat, lon), getTrackTrueRespectingGroundspeed: () => track}}} as unknown as Sensors;
    }

    // 3 NM south and 5 NM east of the VOR, track 000. The meridian meets the arc at latitude +-0.1440798 (8.66 NM
    // north or south of the VOR): the point ahead is on the 29.99993 radial, the point behind on the 150.00007 radial.
    // The point behind is the closer one (5.66 NM against 11.66 NM).
    const SOUTH_EAST = {lat: -0.0499107, lon: 0.0831845};

    it('enters a left-hand arc ahead of the aircraft, not at the closer point behind it (9ce23bf)', () => {
        const arc = arcLeg(LegTurnDirection.Left, 170, 10);
        const data = SidStar.recalculateArcEntryData(arc, sensorsAt(SOUTH_EAST.lat, SOUTH_EAST.lon, 0))!;
        const entry = data.entryFacility as unknown as { icaoStruct: { ident: string }, lat: number, lon: number, reference1Radial: number, reference1Distance: number };
        expect(entry.icaoStruct.ident).toBe('D030J');
        expect(entry.reference1Radial).toBeCloseTo(30, 3);
        expect(entry.reference1Distance).toBeCloseTo(10, 3);
        expect(Math.abs(entry.lat - 0.14408)).toBeLessThan(1e-5);
        expect(Math.abs(entry.lon - 0.08318)).toBeLessThan(1e-5);
    });

    // 15 NM south and 5 NM east of the VOR, outside the circle, track 000: both intersections are ahead. The same two
    // points as above (latitude +-0.1440798, longitude 0.0831845, radials 29.99993 and 150.00007), now 6.34 NM (south,
    // radial 150) and 23.66 NM (north, radial 30) from the aircraft. The closest one is the entry.
    it('enters at the closer of two intersections ahead of the aircraft (9ce23bf)', () => {
        const arc = arcLeg(LegTurnDirection.Left, 170, 10);
        const data = SidStar.recalculateArcEntryData(arc, sensorsAt(toDeg(-15), toDeg(5), 0))!;
        const entry = data.entryFacility as unknown as { icaoStruct: { ident: string }, lat: number, lon: number, reference1Radial: number };
        expect(entry.icaoStruct.ident).toBe('D150J');
        expect(entry.reference1Radial).toBeCloseTo(150, 3);
        expect(Math.abs(entry.lat + 0.14408)).toBeLessThan(1e-5);
        expect(Math.abs(entry.lon - 0.08318)).toBeLessThan(1e-5);
    });

    it('enters a right-hand arc on the radial ahead of the aircraft (1ef2a35)', () => {
        const arc = arcLeg(LegTurnDirection.Right, 10, 170);
        const data = SidStar.recalculateArcEntryData(arc, sensorsAt(SOUTH_EAST.lat, SOUTH_EAST.lon, 0))!;
        const entry = data.entryFacility as unknown as { lat: number, lon: number, reference1Radial: number };
        expect(entry.reference1Radial).toBeCloseTo(30, 3);
        expect(Math.abs(entry.lat - 0.14408)).toBeLessThan(1e-5);
        expect(Math.abs(entry.lon - 0.08318)).toBeLessThan(1e-5);
    });

    it('returns the arc itself with the new entry, unchanged otherwise', () => {
        const arc = arcLeg(LegTurnDirection.Left, 170, 10);
        const data = SidStar.recalculateArcEntryData(arc, sensorsAt(SOUTH_EAST.lat, SOUTH_EAST.lon, 0))!;
        expect(data.beginRadial).toBe(170);
        expect(data.endRadial).toBe(10);
        expect(data.turnDirection).toBe(LegTurnDirection.Left);
        expect(data.circle).toBe(arc.arcData!.circle);
        expect(data.endFacility).toBe(arcEnd);
    });

    it('finds no entry without a track', () => {
        const arc = arcLeg(LegTurnDirection.Left, 170, 10);
        expect(SidStar.recalculateArcEntryData(arc, sensorsAt(SOUTH_EAST.lat, SOUTH_EAST.lon, null))).toBeNull();
    });

    // 6-18: the arc has to contain the entry. The point ahead is on the 30 radial, outside this arc, which runs from
    // 100 to 170. The point behind (150) is inside it but is not an entry, because it is behind the aircraft.
    it('finds no entry when the track meets the circle outside the arc', () => {
        const arc = arcLeg(LegTurnDirection.Left, 170, 100);
        expect(SidStar.recalculateArcEntryData(arc, sensorsAt(SOUTH_EAST.lat, SOUTH_EAST.lon, 0))).toBeNull();
    });

    // Track 090 from 5 NM north and 3 NM west of the VOR (a great circle heading east at its apex). It meets the
    // circle at the 60.00015 radial ahead (11.66 NM away) and at the 299.99999 radial behind (5.66 NM away); both are
    // on this arc, which runs through south from 30 to 330. Solved from tan(lat) = tan(5 NM) cos(lon + 3 NM) and
    // cos(lat) cos(lon) = cos(10 NM). The point behind is exactly opposite the track, so the sign of the angle to it
    // is rounding noise; this geometry happens to give -180, which only an absolute value rejects.
    it('enters ahead of the aircraft when it flies east (f4f5395)', () => {
        const arc = arcLeg(LegTurnDirection.Left, 330, 30);
        const data = SidStar.recalculateArcEntryData(arc, sensorsAt(toDeg(5), -toDeg(3), 90))!;
        const entry = data.entryFacility as unknown as { icaoStruct: { ident: string }, lat: number, lon: number, reference1Radial: number };
        expect(entry.icaoStruct.ident).toBe('D060J');
        expect(entry.reference1Radial).toBeCloseTo(60, 3);
        expect(Math.abs(entry.lat - 0.083184)).toBeLessThan(1e-5);
        expect(Math.abs(entry.lon - 0.14408)).toBeLessThan(1e-5);
    });

    // The distance is the radius of the arc, although the circle of a right-hand arc is reversed (radius pi minus the
    // arc radius, 10809.3 NM). The name of the entry and the stored distance are those of the 10 NM arc, as for the left
    // arc above (the same point on the 30 radial).
    it('names a right-hand arc entry D030J and stores the distance of the arc (#104)', () => {
        const arc = arcLeg(LegTurnDirection.Right, 10, 170);
        const data = SidStar.recalculateArcEntryData(arc, sensorsAt(SOUTH_EAST.lat, SOUTH_EAST.lon, 0))!;
        const entry = data.entryFacility as unknown as { icaoStruct: { ident: string }, reference1Distance: number };
        expect(entry.icaoStruct.ident).toBe('D030J');
        expect(entry.reference1Distance).toBeCloseTo(10, 6);
    });

    // The arc radius decides the name beyond the letter range as well, and the left-hand arc is the reference: the same
    // entry of a 40 NM arc gets the same name and distance for every other turn direction. getArcEntryData reverses the
    // circle of every arc that is not a left-hand one, so the arcs of the other directions are built reversed. The
    // aircraft is 45 NM west of the VOR on the equator and flies east; its track meets the circle at the 270 radial first,
    // outside the arc (the south half, radials 0 to 180), and then at the 90 radial, which is the entry.
    describe('an arc of 40 NM (#104)', () => {
        const entryOf = (turn: LegTurnDirection) => {
            const circle = new GeoCircle(GeoPoint.sphericalToCartesian({lat: 0, lon: 0}, new Float64Array(3)), 40 / R);
            if (turn !== LegTurnDirection.Left) {
                circle.reverse();
            }
            const [beginRadial, endRadial] = turn === LegTurnDirection.Left ? [180, 0] : [0, 180];
            const arc = {arcData: {beginRadial, endRadial, turnDirection: turn, vor: vor('ABC', 0, 0), endFacility: arcEnd, circle}} as unknown as KLNFlightplanLeg;
            const data = SidStar.recalculateArcEntryData(arc, sensorsAt(0, -toDeg(45), 90))!;
            return data.entryFacility as unknown as { icaoStruct: { ident: string }, reference1Radial: number, reference1Distance: number };
        };

        it.each([
            ['right', LegTurnDirection.Right],
            ['either', LegTurnDirection.Either],
            ['none', LegTurnDirection.None],
        ])('gives an arc of turn direction %s the same name and distance as a left-hand arc', (_name, turn) => {
            const left = entryOf(LegTurnDirection.Left);
            const other = entryOf(turn);

            expect([left.reference1Radial, other.reference1Radial]).toEqual([expect.closeTo(90, 3), expect.closeTo(90, 3)]);
            expect([left.reference1Distance, other.reference1Distance]).toEqual([expect.closeTo(40, 6), expect.closeTo(40, 6)]);
            expect(other.icaoStruct.ident).toBe(left.icaoStruct.ident);
        });
    });
});

// The conversion of procedures to KLN legs. SidStar reads only getFacility, repo.add and gps.coords here, so the unit
// is built without a boot. The VOR ABC is at 47.3 N 8.3 E; every arc has a radius of 10 NM and runs through the
// south-west quarter: a left (counterclockwise) arc from radial 270 to 180, a right (clockwise) one from 180 to 270.
describe('SidStar conversion of procedures to KLN legs', () => {
    const abc = vor('ABC', 47.3, 8.3);
    const at = (radial: number, nm: number) => pointFrom({lat: abc.lat, lon: abc.lon}, radial, nm);
    const fixAt = (ident: string, radial: number, nm: number) => {
        const p = at(radial, nm);
        return intersection(ident, p.lat, p.lon);
    };
    const kprc = airport('KPRC', 47.0, 8.0);
    const fafaa = intersection('FAFAA', 47.1, 7.9);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const LEFT = LegTurnDirection.Left;
    const RIGHT = LegTurnDirection.Right;

    const sidStar = (facs: Facility[], where: { lat: number; lon: number }) =>
        new SidStar(new MemoryFacilityClient(facs) as any, {add() {}} as any,
                    {in: {gps: {coords: new GeoPoint(where.lat, where.lon)}}} as any);
    const convert = (facs: Facility[], where: { lat: number; lon: number }, apt: AirportFacility, app: ApproachProcedure) =>
        sidStar(facs, where).getKLNApproachLegList(apt, app, app.transitions[0]);
    /** The radius in NM of the circle of a leg's arc; the circle's radius is a great-arc radian (geo.ts: EARTH_RADIUS_NM) */
    const radiusNm = (leg: KLNFlightplanLeg) => leg.arcData!.circle.radius * EARTH_RADIUS_NM;

    /** An approach whose transition is IF at the begin of the arc, the arc, FAF; the MAP is the final */
    function arcApproach(turn: LegTurnDirection, from: number, to: number) {
        const arcbg = fixAt('ARCBG', from, 10);
        const arcen = fixAt('ARCEN', to, 10);
        const app = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [Leg.IF(arcbg, FixTypeFlags.IAF), Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: from, toRadial: to, turn}), Leg.TF(fafaa, FixTypeFlags.FAF)],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        return {app, facs: [abc, arcbg, arcen, fafaa, mapaa, kprc]};
    }

    // 6-16, 6-17: the unit replaces the published start of an arc by an entry on the radial the aircraft is on now.
    // 7fd640e: PHNY ends its transition on an arc and starts the final at the same fix.
    describe('an arc whose end fix is also the IF of the final (7fd640e)', () => {
        const arcbg = fixAt('ARCBG', 270, 10);
        const ifaaa = fixAt('IFAAA', 180, 10);
        const app = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [Leg.IF(arcbg, FixTypeFlags.IAF), Leg.AF(ifaaa, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LEFT})],
            }],
            final: [Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });

        it('keeps the arc and its end fix instead of the plain IF', async () => {
            const legs = await convert([abc, arcbg, ifaaa, fafaa, mapaa, kprc], at(225, 20), kprc, app);
            expect(identsOf(legs)).toEqual(['D225J', 'IFAAA', 'FAFAA', 'MAPAA']);
            expect(legs.map(l => l.fixType)).toEqual([KLNFixType.IAF, undefined, KLNFixType.FAF, KLNFixType.MAP]);
            const entry = legs[0];
            expect(entry.arcData).toBeDefined();
            expect(entry.arcData!.endFacility.icaoStruct.ident).toBe('IFAAA');
            expect(entry.arcData!.vor.icaoStruct.ident).toBe('ABC');
            expect(entry.arcData!.beginRadial).toBe(270);
            expect(entry.arcData!.endRadial).toBe(180);
            expect(radiusNm(entry)).toBeCloseTo(10, 2);
            expect(legs[1].arcData).toBeUndefined();
        });
    });

    // 6-16: the entry lies on the radial the aircraft is on, or at the beginning of the arc when that radial is outside
    // the arc. 1ef2a35 reads the range of a left-hand arc from its end radial to its begin radial.
    describe('the entry of an arc (1ef2a35)', () => {
        /**
         * The approach of arcApproach with the arc published in magnetic radials around an ABC of `variationEast` degrees
         * east (stored as the sim stores it, negated): the fixes lie on the true radials `fromMag + variationEast` and
         * `toMag + variationEast`. With `trueDegrees` the leg is flagged true and the fixes lie on the radials as given.
         */
        function arcApproachE(turn: LegTurnDirection, fromMag: number, toMag: number, variationEast: number, trueDegrees = false) {
            const abcE = vor('ABC', abc.lat, abc.lon, {magneticVariation: -variationEast});
            const shift = trueDegrees ? 0 : variationEast;
            const arcbg = fixAt('ARCBG', fromMag + shift, 10);
            const arcen = fixAt('ARCEN', toMag + shift, 10);
            const arc = FlightPlan.createLeg({
                ...Leg.AF(arcen, abcE, {radiusNm: 10, fromRadial: fromMag, toRadial: toMag, turn}), trueDegrees,
            });
            const app = approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{name: 'ARCBG', legs: [Leg.IF(arcbg, FixTypeFlags.IAF), arc, Leg.TF(fafaa, FixTypeFlags.FAF)]}],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            });
            return {app, facs: [abcE, arcbg, arcen, fafaa, mapaa, kprc]};
        }

        it.each([
            ['left arc 270 to 180, aircraft on radial 225', LEFT, 270, 180, 225, 'D225J'],
            ['left arc 270 to 180, aircraft on radial 45, outside the arc: the beginning of the arc', LEFT, 270, 180, 45, 'D270J'],
            ['right arc 180 to 270, aircraft on radial 45, outside the arc: the beginning of the arc', RIGHT, 180, 270, 45, 'D180J'],
        ])('%s', async (_name, turn, from, to, aircraftRadial, entry) => {
            const {app, facs} = arcApproach(turn, from, to);
            const legs = await convert(facs, at(aircraftRadial, 20), kprc, app);
            expect(identsOf(legs)).toEqual([entry, 'ARCEN', 'FAFAA', 'MAPAA']);
        });

        // 6-6: the name carries the radial from the VOR, which is magnetic with the VOR's own variation (real-world
        // names match "true minus the station declination", the comment on #363). The aircraft is on the true 235 radial,
        // the magnetic 225, inside the arc
        it('names the entry after the magnetic radial (6-6, #363)', async () => {
            const abcE = vor('ABC', abc.lat, abc.lon, {magneticVariation: -10});
            const arcbg = fixAt('ARCBG', 280, 10);
            const arcen = fixAt('ARCEN', 190, 10);
            const app = approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG',
                    legs: [Leg.IF(arcbg, FixTypeFlags.IAF), Leg.AF(arcen, abcE, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LEFT}), Leg.TF(fafaa, FixTypeFlags.FAF)],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            });
            const legs = await convert([abcE, arcbg, arcen, fafaa, mapaa, kprc], at(235, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D225J');
            expect((legs[0].wpt as unknown as { reference1Radial: number }).reference1Radial).toBeCloseTo(235, 0);
        });

        // 6-16: outside the published arc the entry is its beginning. The published radials are magnetic by the ARINC 424
        // convention (not from the guide), converted with the VOR's own variation as the SDK does for course legs: with
        // 10 E, the left arc 270 to 180 magnetic
        // covers 190 to 280 true. The aircraft on the true 285 (magnetic 275) is outside: the entry is the beginning,
        // on the true 280, named after the magnetic 270. Read as true, the code put the beginning on the true 270
        // (named D260J by #363's magnetic name)
        it('enters a magnetic arc at its published beginning from outside (6-16, #365)', async () => {
            const {app, facs} = arcApproachE(LEFT, 270, 180, 10);
            const legs = await convert(facs, at(285, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D270J');
            const begin = pointFrom({lat: abc.lat, lon: abc.lon}, 280, 10);
            expect(Math.abs(legs[0].wpt.lat - begin.lat)).toBeLessThan(1e-4);
            expect(Math.abs(legs[0].wpt.lon - begin.lon)).toBeLessThan(1e-4);
            expect(legs[0].arcData!.beginRadial).toBeCloseTo(280, 6);
            expect(legs[0].arcData!.endRadial).toBeCloseTo(190, 6);
        });

        // The aircraft on the true 275 (magnetic 265) is inside the published arc: the entry is on its radial. Read as
        // true (180 to 270), the code took it for outside and gave the beginning, D260J
        it('enters a magnetic arc on the aircraft\'s radial from inside (6-16, #365)', async () => {
            const {app, facs} = arcApproachE(LEFT, 270, 180, 10);
            const legs = await convert(facs, at(275, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D265J');
        });

        // The right-hand arc 180 to 270 magnetic with 10 E covers the true 190 to 280. Outside, on the true 185 (magnetic
        // 175): the entry is the beginning, the true 190, named after the magnetic 180. Read as true (180 to 270) the code
        // took 185 for inside and named it D175J
        it('enters a magnetic right-hand arc at its published beginning from outside (6-16, #365)', async () => {
            const {app, facs} = arcApproachE(RIGHT, 180, 270, 10);
            const legs = await convert(facs, at(185, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D180J');
            const begin = pointFrom({lat: abc.lat, lon: abc.lon}, 190, 10);
            expect(Math.abs(legs[0].wpt.lat - begin.lat)).toBeLessThan(1e-4);
            expect(Math.abs(legs[0].wpt.lon - begin.lon)).toBeLessThan(1e-4);
            expect(legs[0].arcData!.beginRadial).toBeCloseTo(190, 6);
            expect(legs[0].arcData!.endRadial).toBeCloseTo(280, 6);
        });

        // Inside, on the true 235 (magnetic 225): the entry is on the aircraft's radial, D225J. The true 235 is inside the
        // arc read as true as well, so this case holds the right-hand branch of the name only; the next one separates
        it('enters a magnetic right-hand arc on the aircraft\'s radial from inside (6-16, #365)', async () => {
            const {app, facs} = arcApproachE(RIGHT, 180, 270, 10);
            const legs = await convert(facs, at(235, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D225J');
        });

        // The true 275 (magnetic 265) is inside the arc 190 to 280 true and outside 180 to 270 read as true, where the
        // entry would be the beginning, D170J
        it('enters a magnetic right-hand arc on a radial that only the converted range contains (6-16, #365)', async () => {
            const {app, facs} = arcApproachE(RIGHT, 180, 270, 10);
            const legs = await convert(facs, at(275, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D265J');
        });

        // The recalculation of the entry reads the stored radials, which are true: the aircraft on the true 275 flies
        // inbound (track 095) to the arc 190 to 280 true (10 E). Stored as published (270 to 180) it would be outside the
        // arc and the recalculation would return nothing. The track meets the circle on the true 275 (within half a
        // degree), the magnetic 265
        it('recalculates the entry of a magnetic arc inside its converted range (6-17, #365)', async () => {
            const {app, facs} = arcApproachE(LEFT, 270, 180, 10);
            const where = at(275, 20);
            const legs = await convert(facs, where, kprc, app);
            const sensors = {in: {gps: {coords: new GeoPoint(where.lat, where.lon), getTrackTrueRespectingGroundspeed: () => 95}}} as any;

            const data = SidStar.recalculateArcEntryData(legs[0], sensors);

            expect(data).not.toBeNull();
            expect((data!.entryFacility as unknown as { icaoStruct: { ident: string } }).icaoStruct.ident).toBe('D265J');
        });

        // The SDK flag trueDegrees (a characterization: no unit source) keeps the radials as given: the left arc 270 to
        // 180 true, the fixes on the true 270 and 180. The aircraft on the true 275 is outside, so the entry is the
        // beginning on the true 270, named after the magnetic 260
        it('characterization: uses the radials of a leg with trueDegrees as given (#365)', async () => {
            const {app, facs} = arcApproachE(LEFT, 270, 180, 10, true);
            const legs = await convert(facs, at(275, 20), kprc, app);

            expect(identsOf(legs)[0]).toBe('D260J');
            const begin = pointFrom({lat: abc.lat, lon: abc.lon}, 270, 10);
            expect(Math.abs(legs[0].wpt.lat - begin.lat)).toBeLessThan(1e-4);
            expect(Math.abs(legs[0].wpt.lon - begin.lon)).toBeLessThan(1e-4);
            expect(legs[0].arcData!.beginRadial).toBeCloseTo(270, 6);
            expect(legs[0].arcData!.endRadial).toBeCloseTo(180, 6);
        });

        // 6-17: the entry is recalculated from the arc as the conversion built it. The aircraft is 20 NM out on the
        // radial 225 and flies towards the VOR (track 045): its track meets the circle close to the same radial (within half
        // a degree, the great circle bends away from the rhumb line), 10 NM from the VOR, for either direction of the arc (#104).
        it.each([
            ['left arc 270 to 180', LEFT, 270, 180],
            ['right arc 180 to 270', RIGHT, 180, 270],
        ])('recalculates the entry of a converted %s on the radial of the track (#104)', async (_name, turn, from, to) => {
            const {app, facs} = arcApproach(turn, from, to);
            const where = at(225, 20);
            const legs = await convert(facs, where, kprc, app);
            const sensors = {in: {gps: {coords: new GeoPoint(where.lat, where.lon), getTrackTrueRespectingGroundspeed: () => 45}}} as any;

            const data = SidStar.recalculateArcEntryData(legs[0], sensors)!;

            const entry = data.entryFacility as unknown as { icaoStruct: { ident: string }, reference1Radial: number, reference1Distance: number };
            expect(entry.icaoStruct.ident).toBe('D225J');
            expect(entry.reference1Radial).toBeCloseTo(225, 0);
            expect(entry.reference1Distance).toBeCloseTo(10, 4);
        });

        // 6-6 gives the name format; that its radial is magnetic comes from the real-world navdata (the comment on #363).
        // The recalculated entry carries the magnetic radial in its name as well, with the variation of ABC
        // (10 E, stored -10): the track meets the circle on the true radial 225 (within half a degree), the magnetic 215
        it('names a recalculated entry after the magnetic radial (6-6, #363)', async () => {
            const abcE = vor('ABC', abc.lat, abc.lon, {magneticVariation: -10});
            const arcbg = fixAt('ARCBG', 270, 10);
            const arcen = fixAt('ARCEN', 180, 10);
            const app = approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG',
                    legs: [Leg.IF(arcbg, FixTypeFlags.IAF), Leg.AF(arcen, abcE, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LEFT}), Leg.TF(fafaa, FixTypeFlags.FAF)],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            });
            const where = at(225, 20);
            const legs = await convert([abcE, arcbg, arcen, fafaa, mapaa, kprc], where, kprc, app);
            const sensors = {in: {gps: {coords: new GeoPoint(where.lat, where.lon), getTrackTrueRespectingGroundspeed: () => 45}}} as any;

            const data = SidStar.recalculateArcEntryData(legs[0], sensors)!;

            expect((data.entryFacility as unknown as { icaoStruct: { ident: string } }).icaoStruct.ident).toBe('D215J');
        });
    });

    // 6-10: the example lists a fix that is both IAF and FAF twice. 6-11: switching to LEG makes the FAF the active
    // waypoint when IAF and FAF are the same waypoint, which needs the second entry.
    describe('a repeated fix is kept when it is flagged (a6acb5c)', () => {
        const txo = vor('TXO', 47.2, 7.9);
        const vorApproach = (transitionFlags: number, finalFlags: number) => approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'TXO', legs: [Leg.IF(txo, transitionFlags)]}],
            final: [Leg.IF(txo, finalFlags), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const far = {lat: 47.5, lon: 7.5};

        it('lists the co-located IAF and FAF twice', async () => {
            const legs = await convert([txo, mapaa, kprc], far, kprc, vorApproach(FixTypeFlags.IAF, FixTypeFlags.FAF));
            expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
                ['TXO', KLNFixType.IAF], ['TXO', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP],
            ]);
        });

        it('lists an unflagged repeat once (control)', async () => {
            const legs = await convert([txo, mapaa, kprc], far, kprc, vorApproach(0, 0));
            expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
                ['TXO', undefined], ['MAPAA', KLNFixType.MAP],
            ]);
        });
    });

    // 6-18: the unit has no step-down fixes on an arc, they are not in its database. Consecutive arcs around the same
    // navaid become one arc that runs from the start of the first to the end of the last.
    describe('consecutive arcs around the same navaid are one arc (a6acb5c)', () => {
        const arcbg = fixAt('ARCBG', 270, 10);
        const step = fixAt('STEPD', 225, 10);
        const arcen = fixAt('ARCEN', 180, 10);

        it('merges the arcs, drops the step-down fix and enters on the aircraft radial', async () => {
            const app = approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG',
                    legs: [
                        Leg.IF(arcbg, FixTypeFlags.IAF),
                        Leg.AF(step, abc, {radiusNm: 10, fromRadial: 270, toRadial: 225, turn: LEFT}),
                        Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 225, toRadial: 180, turn: LEFT}),
                        Leg.TF(fafaa, FixTypeFlags.FAF),
                    ],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            });
            const legs = await convert([abc, arcbg, step, arcen, fafaa, mapaa, kprc], at(260, 20), kprc, app);
            expect(identsOf(legs)).toEqual(['D260J', 'ARCEN', 'FAFAA', 'MAPAA']);
            const arc = legs[0].arcData!;
            expect((arc.entryFacility as unknown as { reference1Radial: number }).reference1Radial).toBeCloseTo(260, 0);
            expect(arc.beginRadial).toBe(270);
            expect(arc.endRadial).toBe(180);
            expect(arc.endFacility.icaoStruct.ident).toBe('ARCEN');
            expect(radiusNm(legs[0])).toBeCloseTo(10, 2);
        });

        // The filter keeps an arc that carries a flag, so the second arc still follows it in the conversion: the flagged
        // step-down and the arc after it stay one arc. The doubled entry and the missing STEPD are bug #382, this holds
        // the list as it is while the pin below is open.
        const flaggedStepDown = () => approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [
                    Leg.IF(arcbg),
                    Leg.AF(step, abc, {radiusNm: 10, fromRadial: 270, toRadial: 225, turn: LEFT, flags: FixTypeFlags.IAF}),
                    Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 225, toRadial: 180, turn: LEFT}),
                    Leg.TF(fafaa, FixTypeFlags.FAF),
                ],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        });

        it('keeps a flagged step-down on one arc as one arc (characterization, #131, #382)', async () => {
            const legs = await convert([abc, arcbg, step, arcen, fafaa, mapaa, kprc], at(260, 20), kprc, flaggedStepDown());

            expect(identsOf(legs)).toEqual(['D260J', 'D260J', 'ARCEN', 'FAFAA', 'MAPAA']);
        });

        // 6-5: the unit lists the IAF; 6-18: an arc has no step-down fixes of its own
        it.fails('lists a flagged step-down fix on a DME arc once, after the arc entry (6-5, 6-18, #382)', async () => {
            const legs = await convert([abc, arcbg, step, arcen, fafaa, mapaa, kprc], at(260, 20), kprc, flaggedStepDown());

            expect(identsOf(legs)).toEqual(['D260J', 'STEPD', 'ARCEN', 'FAFAA', 'MAPAA']);
            expect(legs[1].fixType).toBe(KLNFixType.IAF);
        });
    });

    // 6-5, B-3: the unit tells the pilot that the enroute part of the flight plan already holds waypoints of the
    // procedure (all tests of this block).
    describe('SidStar.hasDuplicates', () => {
        const wpt = vor('KPT', 47, 8);
        const fplLeg = (w: Facility) => ({wpt: w, type: KLNLegType.USER}) as unknown as KLNFlightplanLeg;
        const procLeg = (w: Facility) => ({wpt: w, type: KLNLegType.STAR}) as unknown as KLNFlightplanLeg;

        it('finds a waypoint that is in both lists by the same ICAO object', () => {
            expect(SidStar.hasDuplicates([fplLeg(wpt)], [procLeg({...wpt})])).toBe(true);
        });

        it('finds no duplicate between different waypoints', () => {
            expect(SidStar.hasDuplicates([fplLeg(wpt)], [procLeg(vor('KPU', 47, 8))])).toBe(false);
        });

        // The ICAOs are compared by value: the facility loader may hand out a copy of the same waypoint (a plan restored
        // from storage), and the pilot is warned all the same.
        it('finds a waypoint whose ICAO is an equal copy (#130)', () => {
            const copy = {...wpt, icaoStruct: {...wpt.icaoStruct}};
            expect(copy.icaoStruct).toEqual(wpt.icaoStruct);
            expect(copy.icaoStruct).not.toBe(wpt.icaoStruct);
            expect(SidStar.hasDuplicates([fplLeg(wpt)], [procLeg(copy)])).toBe(true);
        });

        // All four parts of the ICAO decide, so a waypoint that only shares its ident with one of the plan is no duplicate
        it.each([
            ['region', ICAO.value('V', 'K2', '', 'KPT')],
            ['type', ICAO.value('N', wpt.icaoStruct.region, '', 'KPT')],
            ['airport', ICAO.value('V', wpt.icaoStruct.region, 'KAAA', 'KPT')],
            ['ident', ICAO.value('V', wpt.icaoStruct.region, '', 'KPU')],
        ])('finds no duplicate when only the %s of the ICAO differs (#130)', (_part, icaoStruct) => {
            expect(SidStar.hasDuplicates([fplLeg(wpt)], [procLeg({...wpt, icaoStruct})])).toBe(false);
        });

        // The equal copy is found wherever it stands: behind other legs of the plan and of the procedure
        it('finds an equal copy behind other waypoints in both lists (#130)', () => {
            const other = vor('KPV', 47, 8);
            const copy = {...wpt, icaoStruct: {...wpt.icaoStruct}};
            expect(SidStar.hasDuplicates([fplLeg(other), fplLeg(wpt)], [procLeg(vor('KPU', 47, 8)), procLeg(copy)])).toBe(true);
        });
    });

    // 6-16 to 6-18: a DME arc is flown at its published distance. Real STARs fly AF, CI (no fix), AF around one navaid
    // with two radii. The conversion drops the fixless CI leg and keeps the two arcs: the first ends at its own end fix,
    // which stays in the list, and the second starts at its published beginning (#131). How the unit joins two radii is
    // not described, so the leg between the arcs is a characterization.
    describe('AF, CI, AF around one navaid with two radii', () => {
        const stfix = fixAt('STFIX', 270, 20);
        const arc1end = fixAt('ARC1E', 225, 13);
        const arc2end = fixAt('ARC2E', 180, 10);
        const final = fixAt('FINAL', 150, 10);
        const ci = () => FlightPlan.createLeg({type: LegType.CI, course: 135});
        const arrival = () => star('ARR1', {
            common: [
                Leg.IF(stfix),
                Leg.AF(arc1end, abc, {radiusNm: 13, fromRadial: 270, toRadial: 225, turn: LEFT}),
                ci(),
                Leg.AF(arc2end, abc, {radiusNm: 10, fromRadial: 225, toRadial: 180, turn: LEFT}),
                Leg.TF(final),
            ],
        });
        const facs = [abc, stfix, arc1end, arc2end, final, kprc];
        const convertStar = () => sidStar(facs, at(270, 25)).getKLNProcedureLegList(kprc, arrival(), KLNLegType.STAR, null, null);

        it('converts, ends at the second arc and the final, and flies the second arc at 10 NM', async () => {
            const procedure = arrival();
            const [first, second] = procedure.commonLegs.filter(l => l.type === LegType.AF);
            expect(first.originIcaoStruct).toEqual(second.originIcaoStruct);
            expect(first.rho).toBeCloseTo(13 * 1852, 3);
            expect(second.rho).toBeCloseTo(10 * 1852, 3);
            expect(procedure.commonLegs.find(l => l.type === LegType.CI)!.fixIcaoStruct.ident.trim()).toBe('');

            const legs = await convertStar();
            const idx = identsOf(legs);
            expect(idx).toContain('ARC2E');
            expect(idx[idx.length - 1]).toBe('FINAL');
            const secondArc = legs.find(l => l.arcData?.endFacility.icaoStruct.ident === 'ARC2E');
            expect(secondArc).toBeDefined();
            expect(radiusNm(secondArc!)).toBeCloseTo(10, 1);
        });

        it('flies the first arc at its own radius of 13 NM (#131)', async () => {
            const legs = await convertStar();
            const firstArc = legs.find(l => l.arcData?.endFacility.icaoStruct.ident === 'ARC1E');
            expect(firstArc).toBeDefined();
            expect(radiusNm(firstArc!)).toBeCloseTo(13, 1);
        });

        // 6-6: an arc entry is named D, the magnetic radial and the distance as a letter (M = 13, J = 10). The second
        // arc starts at its published beginning, joined to the end of the first by a straight leg (characterization)
        it('lists the first arc to ARC1E and the second from its beginning on radial 225 (characterization, #131)', async () => {
            const legs = await convertStar();

            expect(identsOf(legs)).toEqual(['D270M', 'ARC1E', 'D225J', 'ARC2E', 'FINAL']);
            const second = legs.find(l => l.arcData?.endFacility.icaoStruct.ident === 'ARC2E')!;
            expect(second.arcData!.beginRadial).toBeCloseTo(225, 3);
            expect(radiusNm(second)).toBeCloseTo(10, 1);
        });

        // The aircraft is on radial 200, inside the span of the second arc (225 to 180). A first arc is entered abeam the
        // aircraft there (6-16), but the second follows the first and so starts at its published beginning, not at D200J
        it('starts the second arc at its beginning although the aircraft is abeam a point of it (characterization, #131)', async () => {
            const legs = await sidStar(facs, at(200, 25)).getKLNProcedureLegList(kprc, arrival(), KLNLegType.STAR, null, null);

            expect(identsOf(legs)).toEqual(['D270M', 'ARC1E', 'D225J', 'ARC2E', 'FINAL']);
        });
    });

    // 6-18 covers step-downs on one arc. When two arcs are one arc is the code's ruling (#131): the same navaid and a
    // radius within 0.1 NM; the tolerance is a characterization. The aircraft is on radial 270 of ABC at 25 NM.
    describe('two arcs are one arc only around one navaid within 0.1 NM of radius (characterization, #131)', () => {
        const xyz = vor('XYZ', 47.6, 8.9);
        const atXyz = (radial: number, nm: number) => pointFrom({lat: xyz.lat, lon: xyz.lon}, radial, nm);
        const fixAtXyz = (ident: string, radial: number, nm: number) => {
            const p = atXyz(radial, nm);
            return intersection(ident, p.lat, p.lon);
        };
        const stfix = fixAt('STFIX', 270, 25);
        const final = fixAt('FINAL', 150, 10);
        const convertTwoArcs = (navaid2: typeof abc, radius1: number, radius2: number) => {
            const arc1end = fixAt('ARC1E', 225, radius1);
            const arc2end = navaid2 === abc ? fixAt('ARC2E', 180, radius2) : fixAtXyz('ARC2E', 180, radius2);
            const proc = star('ARR1', {
                common: [
                    Leg.IF(stfix),
                    Leg.AF(arc1end, abc, {radiusNm: radius1, fromRadial: 270, toRadial: 225, turn: LEFT}),
                    Leg.AF(arc2end, navaid2, {radiusNm: radius2, fromRadial: 225, toRadial: 180, turn: LEFT}),
                    Leg.TF(final),
                ],
            });
            return sidStar([abc, xyz, stfix, arc1end, arc2end, final, kprc], at(270, 25)).getKLNProcedureLegList(kprc, proc, KLNLegType.STAR, null, null);
        };

        it('keeps two arcs of one radius around different navaids as two arcs, the second from its beginning', async () => {
            const legs = await convertTwoArcs(xyz, 10, 10);

            expect(identsOf(legs)).toEqual(['D270J', 'ARC1E', 'D225J', 'ARC2E', 'FINAL']);
            expect(legs[2].arcData!.vor.icaoStruct.ident).toBe('XYZ');
        });

        it('merges two arcs whose radii differ by 0.05 NM into one arc', async () => {
            const legs = await convertTwoArcs(abc, 10.05, 10);

            expect(identsOf(legs)).toEqual(['D270J', 'ARC2E', 'FINAL']);
            expect(legs[0].arcData!.beginRadial).toBeCloseTo(270, 3);
        });

        it('keeps two arcs whose radii differ by 0.2 NM as two arcs', async () => {
            const legs = await convertTwoArcs(abc, 10.2, 10);

            expect(identsOf(legs)).toEqual(['D270J', 'ARC1E', 'D225J', 'ARC2E', 'FINAL']);
        });
    });

    // #376: the conversion works on copies of the legs the SDK hands out, so the database stays as it is and a second
    // conversion (or a second transition) gives the same legs as the first. The approaches are built per test, so the
    // assertions see that test's objects.
    describe('a conversion leaves the procedure as the database has it (#376)', () => {
        const stfix = fixAt('STFIX', 270, 10);
        const arc1end = fixAt('ARC1E', 225, 10);
        const arc2end = fixAt('ARC2E', 180, 10);
        const WORLD = [abc, stfix, arc1end, arc2end, fafaa, mapaa, kprc];

        /** The PHNY-shaped approach: the transition ends its arc at ARC1E, the final starts at the same fix (7fd640e) */
        const phnyApproach = () => approach({
            type: ApproachType.APPROACH_TYPE_VORDME, runway: '18',
            transitions: [
                {name: 'STFIX', legs: [Leg.IF(stfix, FixTypeFlags.IAF), Leg.AF(arc1end, abc, {radiusNm: 10, fromRadial: 270, toRadial: 225, turn: LEFT})]},
            ],
            final: [Leg.IF(arc1end, FixTypeFlags.IAF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });

        /** Two transitions: STFIX ends its arc at ARC1E, and ARC1E starts a transition of its own; the final starts with an arc */
        const twoTransitionsApproach = () => approach({
            type: ApproachType.APPROACH_TYPE_VORDME, runway: '18',
            transitions: [
                {name: 'STFIX', legs: [Leg.IF(stfix, FixTypeFlags.IAF), Leg.AF(arc1end, abc, {radiusNm: 10, fromRadial: 270, toRadial: 225, turn: LEFT})]},
                {name: 'ARC1E', legs: [Leg.IF(arc1end, FixTypeFlags.IAF)]},
            ],
            final: [Leg.AF(arc2end, abc, {radiusNm: 10, fromRadial: 225, toRadial: 180, turn: LEFT}), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });

        it('converts the same approach and transition twice to the same legs (characterization, #376)', async () => {
            const app = phnyApproach();
            const ss = sidStar(WORLD, at(250, 30));
            const first = await ss.getKLNApproachLegList(kprc, app, app.transitions[0]);
            const second = await ss.getKLNApproachLegList(kprc, app, app.transitions[0]);

            expect(identsOf(first)).toEqual(['D250J', 'ARC1E', 'FAFAA', 'MAPAA']);
            expect(identsOf(second)).toEqual(identsOf(first));
        });

        // 6-16: an arc entered from outside starts at its published beginning
        it('starts the arc of the second transition at its published beginning after the first was converted (6-16, #376)', async () => {
            const app = twoTransitionsApproach();
            const ss = sidStar(WORLD, at(250, 30));
            await ss.getKLNApproachLegList(kprc, app, app.transitions[0]); // STFIX
            const legs = await ss.getKLNApproachLegList(kprc, app, app.transitions[1]); // ARC1E

            expect(identsOf(legs)[0]).toBe('D225J');
            expect(legs[0].arcData!.beginRadial).toBeCloseTo(225, 3);
        });

        it('leaves the course and the flags of the database legs unchanged (characterization, #376)', async () => {
            const twoTransitions = twoTransitionsApproach();
            const phny = phnyApproach();
            // the two-transition approach (STFIX, then ARC1E) and the PHNY-shaped one-transition approach
            await sidStar(WORLD, at(250, 30)).getKLNApproachLegList(kprc, twoTransitions, twoTransitions.transitions[0]);
            await sidStar(WORLD, at(250, 30)).getKLNApproachLegList(kprc, phny, phny.transitions[0]);

            expect(twoTransitions.finalLegs[0].course).toBe(225); // the final arc's published beginning
            expect(phny.transitions[0].legs[1].fixTypeFlags).toBe(0); // the transition's arc carries no flag
        });

        // Two consecutive arcs on one navaid and radius: mergeAFsIfNecessary gives the second arc the course of the first.
        // The arcs run 270 to 225 and 225 to 180 (magnetic, variation 0), so the merged arc runs from 270 to 180. The
        // aircraft is on radial 250 at 20 NM, inside the merged arc: the entry is D250J (6-6, distance letter J = 10 NM).
        it('converts the same STAR with consecutive arcs twice to the same legs and leaves its arcs unchanged (characterization, #376)', async () => {
            const proc = star('ARR2', {
                common: [
                    Leg.IF(stfix),
                    Leg.AF(arc1end, abc, {radiusNm: 10, fromRadial: 270, toRadial: 225, turn: LEFT}),
                    Leg.AF(arc2end, abc, {radiusNm: 10, fromRadial: 225, toRadial: 180, turn: LEFT}),
                    Leg.TF(fafaa),
                ],
            });
            const ss = sidStar(WORLD, at(250, 20));
            const first = await ss.getKLNProcedureLegList(kprc, proc, KLNLegType.STAR, null, null);
            const second = await ss.getKLNProcedureLegList(kprc, proc, KLNLegType.STAR, null, null);

            expect(identsOf(first)).toEqual(['D250J', 'ARC2E', 'FAFAA']);
            expect(identsOf(second)).toEqual(identsOf(first));
            expect(first[0].arcData!.beginRadial).toBeCloseTo(270, 6);
            expect(second[0].arcData!.beginRadial).toBeCloseTo(270, 6);
            expect(proc.commonLegs[2].course).toBe(225); // the second arc's published beginning, as the database has it
        });

        // The same merge on a missed approach: the missed legs carry the two arcs (the final is one FAF leg). The list is
        // FAFAA, the missed start, the entry, ARC2E and MAPAA; the entry replaces the missed start and is D250J as above.
        it('converts the same missed approach with consecutive arcs twice to the same legs and leaves its arcs unchanged (characterization, #376)', async () => {
            const missedStart = fixAt('MISSA', 300, 5);
            const app = approach({
                type: ApproachType.APPROACH_TYPE_VORDME, runway: '18',
                final: [Leg.TF(fafaa, FixTypeFlags.FAF)],
                missed: [
                    Leg.TF(missedStart),
                    Leg.AF(arc1end, abc, {radiusNm: 10, fromRadial: 270, toRadial: 225, turn: LEFT}),
                    Leg.AF(arc2end, abc, {radiusNm: 10, fromRadial: 225, toRadial: 180, turn: LEFT}),
                    Leg.TF(mapaa, FixTypeFlags.MAP),
                ],
            });
            const ss = sidStar([...WORLD, missedStart], at(250, 20));
            const first = await ss.getKLNApproachLegList(kprc, app, null);
            const second = await ss.getKLNApproachLegList(kprc, app, null);

            expect(identsOf(first)).toEqual(['FAFAA', 'D250J', 'ARC2E', 'MAPAA']);
            expect(identsOf(second)).toEqual(identsOf(first));
            expect(first[1].arcData!.beginRadial).toBeCloseTo(270, 6);
            expect(second[1].arcData!.beginRadial).toBeCloseTo(270, 6);
            expect(app.missedLegs[2].course).toBe(225); // the second arc's published beginning, as the database has it
        });
    });
});

// The conversion paths of SidStar that the tests above leave out. The worlds are invented.
const kprc = airport('KPRC', 47.0, 8.0);
const iafaa = intersection('IAFAA', 47.4, 7.6);
const ifaaa = intersection('IFAAA', 47.3, 7.7);
const fafaa = intersection('FAFAA', 47.2, 7.8);
const mapaa = intersection('MAPAA', 47.05, 7.95);
const misaa = intersection('MISAA', 46.9, 8.1);
const mahaa = intersection('MAHAA', 46.8, 8.2);
const hldaa = intersection('HLDAA', 47.35, 7.65);
const WORLD: Facility[] = [kprc, iafaa, ifaaa, fafaa, mapaa, misaa, mahaa, hldaa];
const FAR = {lat: 48, lon: 9};

const sidStar = (facs: Facility[] = WORLD) =>
    new SidStar(new MemoryFacilityClient(facs) as any, {add() {}} as any, {in: {gps: {coords: new GeoPoint(FAR.lat, FAR.lon)}}} as any);
const convertApp = (app: ApproachProcedure, iafIdx: number | null = 0, apt: AirportFacility = kprc) =>
    sidStar().getKLNApproachLegList(apt, app, iafIdx === null ? null : app.transitions[iafIdx]);

describe('SidStar approach names', () => {
    const RNAV = ApproachType.APPROACH_TYPE_RNAV, GPS = ApproachType.APPROACH_TYPE_GPS, VOR = ApproachType.APPROACH_TYPE_VOR,
        VORDME = ApproachType.APPROACH_TYPE_VORDME, NDB = ApproachType.APPROACH_TYPE_NDB, NDBDME = ApproachType.APPROACH_TYPE_NDBDME;
    const app = (type: ApproachType, runway: string, suffix?: string) => approach({type, runway, suffix, final: [Leg.IF(fafaa)]});
    const listName = (type: ApproachType, runway: string, suffix?: string) => SidStar.formatApproachListName(app(type, runway, suffix));
    const header = (type: ApproachType, runway: string, suffix?: string, apt = kprc) => SidStar.formatApproachName(app(type, runway, suffix), apt);
    // Invented positions; the idents are the airports the evidence names
    const krno = airport('KRNO', 39.5, -119.8), ksmo = airport('KSMO', 34.0, -118.5),
        kaas = airport('KAAS', 46.0, -100.0), ktrk = airport('KTRK', 39.3, -120.1);

    // krno-iap-list.jpg (photo of a real unit, maintainer's "gps search" folder): the APT 8 list of KRNO shows RNAV 17L,
    // 17R, 35L and 35R. These are the X approaches, the only ones the unit can fly; the others are filtered out. The
    // suffix is not shown.
    it('lists an RNAV approach with a runway without its suffix', () => {
        expect(['17L', '17R', '35L', '35R'].map(r => listName(RNAV, r, 'X'))).toEqual(['RNAV 17L', 'RNAV 17R', 'RNAV 35L', 'RNAV 35R']);
    });

    // krno-r35l-list.jpg (photo of a real unit): the header of RNAV 35L at KRNO is R35L-KRNO, without the suffix.
    it('titles an RNAV approach with a runway without its suffix', () => {
        expect(header(RNAV, '35L', 'X', krno)).toBe('R35L-KRNO');
    });

    // 6-5: the approach header is the first letter of the approach type, the runway, a dash and the airport (figure 6-8
    // shows V25R-KLAX, figure 6-24 is a VOR RWY 12 approach).
    it.each([
        ['VOR 25R', VOR, '25R', 'V25R-KPRC'],
        ['NDB 24L', NDB, '24L', 'N24L-KPRC'],
        ['RNAV 15C', RNAV, '15C', 'R15C-KPRC'],
    ])('names the %s approach', (_n, type, runway, expected) => {
        expect(header(type, runway)).toBe(expected);
    });

    // 3-49, figure 3-149: an approach without a runway is listed as VOR-A.
    it('lists a VOR approach without a runway with its suffix', () => {
        expect(listName(VOR, '', 'A')).toBe('VOR-A   ');
    });

    // AVsoftech KLN 90B trainer, checked by the maintainer on 2026-10-22. It is third-party and does not count as
    // evidence (test/README.md).
    describe('(characterization, AVsoftech KLN 90B trainer, 2026-10-22)', () => {
        it('names a GPS approach with G', () => {
            expect(listName(GPS, '27')).toBe('GPS  27 ');
            expect(header(GPS, '27')).toBe('G27-KPRC');
        });

        it('names a VOR/DME approach with a runway VORD and D', () => {
            expect(listName(VORDME, '12')).toBe('VORD 12 ');
            expect(header(VORDME, '12')).toBe('D12-KPRC');
        });

        it('names a VOR/DME approach without a runway like a VOR approach (KAAS VOR/DME-A)', () => {
            expect(listName(VORDME, '', 'A')).toBe('VOR-A   ');
            expect(header(VORDME, '', 'A', kaas)).toBe('VOR-A-KAAS');
        });

        it('names an RNAV approach without a runway RNV and the suffix, without a dash (KTRK RNAV-A)', () => {
            expect(listName(RNAV, '', 'A')).toBe('RNVA    ');
            expect(header(RNAV, '', 'A', ktrk)).toBe('RNVA-KTRK');
        });

        it('names an NDB approach without a runway NDB-B', () => {
            expect(listName(NDB, '', 'B')).toBe('NDB-B   ');
        });
    });

    describe('(characterization, no source)', () => {
        // The trainer showed only the list name NDB-B; the header is by analogy with VOR-A-KAAS
        it('titles an NDB approach without a runway NDB-B and the airport', () => {
            expect(header(NDB, '', 'B')).toBe('NDB-B-KPRC');
        });

        // Only RNAV has a photo (krno-r35l-list.jpg); the drop of the suffix for the other types follows the rule
        it('drops the suffix of a VOR approach with a runway', () => {
            expect(listName(VOR, '25R', 'Y')).toBe('VOR  25R');
            expect(header(VOR, '25R', 'Y')).toBe('V25R-KPRC');
        });

        // What the code does: isApproachRecognized filters such a type out before any caller, so this is no claim about
        // the real unit
        it('throws for a type it does not name', () => {
            expect(() => listName(ApproachType.APPROACH_TYPE_ILS, '27')).toThrow();
            expect(() => header(ApproachType.APPROACH_TYPE_ILS, '27')).toThrow();
        });

        it('keeps the zero of a runway below 10', () => {
            // No source for the zero
            expect(listName(VOR, '09')).toBe('VOR  09 ');
            expect(header(VOR, '09')).toBe('V09-KPRC');
        });

        // By analogy with RNVA; no runway-less GPS approach is in the trainer's database
        it('names a GPS approach without a runway GPS and the suffix, without a dash', () => {
            expect(listName(GPS, '', 'A')).toBe('GPSA    ');
            expect(header(GPS, '', 'A')).toBe('GPSA-KPRC');
        });

        // The maintainer's ruling (#60): NDB/DME is named like NDB
        it('names an NDB/DME approach like an NDB approach', () => {
            expect(listName(NDBDME, '33')).toBe('NDB  33 ');
            expect(header(NDBDME, '33')).toBe('N33-KPRC');
            expect(listName(NDBDME, '', 'C')).toBe('NDB-C   ');
        });

        // Nobody knows what the real unit shows for such a pair. This is only what the rule produces, a guess with no
        // evidence, and the pilot cannot tell the two apart.
        it('names KSMO RNAV 03 Y and Z alike', () => {
            expect([listName(RNAV, '03', 'Y'), listName(RNAV, '03', 'Z')]).toEqual(['RNAV 03 ', 'RNAV 03 ']);
            expect([header(RNAV, '03', 'Y', ksmo), header(RNAV, '03', 'Z', ksmo)]).toEqual(['R03-KSMO', 'R03-KSMO']);
        });

        it('names an approach without a runway and without a suffix by its type word alone', () => {
            expect(listName(VOR, '')).toBe('VOR     ');
            expect(header(VOR, '')).toBe('VOR-KPRC');
            expect(listName(RNAV, '')).toBe('RNV     ');
            expect(listName(NDB, '')).toBe('NDB     ');
            expect(listName(GPS, '')).toBe('GPS     ');
        });
    });
});

describe('SidStar.getKLNApproachLegList', () => {
    const rnav27 = () => approach({
        type: ApproachType.APPROACH_TYPE_RNAV, runway: '27L', suffix: 'Y', name: 'RNAV 27L Y',
        transitions: [
            {name: 'HLDAA', legs: [Leg.IF(hldaa, FixTypeFlags.IAF), Leg.TF(ifaaa)]},
            {name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa)]},
        ],
        final: [Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        missed: [Leg.CA(270), Leg.DF(misaa), Leg.TF(mahaa, FixTypeFlags.MAHP)],
    });

    // 6-4, 6-5: the list of an approach starts at the selected IAF and runs through the final approach to the missed
    // approach (figures 6-5 and 6-6: ELMOO-i ... FREBY-f, MA25B-m, then LAX and INISH); every waypoint appears once
    // (the IF that ends the transition and starts the final is one waypoint). 6-6, 6-7: the suffixes mark IAF, FAF, MAP
    // and the missed approach holding point.
    it('lists the selected transition, the final and the missed approach in order, with the fix types', async () => {
        const legs = await convertApp(rnav27(), 1);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['IAFAA', KLNFixType.IAF], ['IFAAA', undefined], ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP],
            ['MISAA', undefined], ['MAHAA', KLNFixType.MAHP],
        ]);
    });

    // 6-5: the header V25R-KLAX stands above the approach waypoints on FPL 0 (figure 6-8); 6-7: approach waypoints cannot
    // be added or deleted (no colon). FlightplanList draws the header from procedure.displayName. An approach with a
    // runway shows no suffix (krno-r35l-list.jpg).
    it('marks every waypoint as an approach waypoint of the airport under the approach header', async () => {
        const legs = await convertApp(rnav27(), 1);
        expect(legs.map(l => l.type)).toEqual(Array(6).fill(KLNLegType.APP));
        expect(legs.every(l => l.parentFacility === kprc)).toBe(true);
        expect(legs.map(l => l.procedure!.displayName)).toEqual(Array(6).fill('R27L-KPRC'));
    });

    // The EFB route sync answers the route request from these fields (KlnEfbSaver; CLAUDE.md "Public contract with
    // aircraft", the EFB route sync).
    it('carries the approach and the transition for the EFB route', async () => {
        const legs = await convertApp(rnav27(), 1);
        const p = legs[0].procedure!;
        expect(p.procedureName).toBe('RNAV 27L Y');
        expect(p.approachType).toBe(ApproachType.APPROACH_TYPE_RNAV);
        expect(p.approachSuffix).toBe('Y');
        expect(p.transition).toBe('IAFAA');
        expect(p.runwayNumber).toBe(27);
        expect(p.runwayDesignator).toBe(RunwayDesignator.RUNWAY_DESIGNATOR_LEFT);
    });

    it('converts the final and the missed approach alone without a transition (characterization)', async () => {
        const legs = await convertApp(rnav27(), null);
        expect(identsOf(legs)).toEqual(['IFAAA', 'FAFAA', 'MAPAA', 'MISAA', 'MAHAA']);
        expect(legs[0].procedure!.transition).toBeUndefined();
    });
});

// B-2, 6-10, 6-14: the unit reminds the pilot to select OBS (IF REQUIRED SELECT OBS) 4 NM before a waypoint that can be
// the basis of a hold or a course reversal. PersistentMessages reads askObs for it.
describe('the OBS reminder of holds and procedure turns', () => {
    const RIGHT = LegTurnDirection.Right;
    const withLeg = (first: FlightPlanLeg) => approach({
        type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
        final: [first, Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
    });

    it.each([
        ['a hold to an altitude (HA)', (f: Facility, flags: number) => Leg.HA(f, 90, RIGHT, flags)],
        ['a hold to a fix (HF)', (f: Facility, flags: number) => Leg.HF(f, 90, RIGHT, flags)],
        ['a hold to a manual termination (HM)', (f: Facility, flags: number) => Leg.HM(f, 90, RIGHT, flags)],
        ['a procedure turn (PI)', (f: Facility, flags: number) => Leg.PI(f, 90, RIGHT, flags)],
    ])('asks for OBS at %s', async (_n, build) => {
        const legs = await convertApp(withLeg(build(hldaa, FixTypeFlags.IAF)), null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType, l.askObs])).toEqual([
            ['HLDAA', KLNFixType.IAF, true], ['FAFAA', KLNFixType.FAF, false], ['MAPAA', KLNFixType.MAP, false],
        ]);
    });

    it('asks for OBS at a hold that follows a leg to the same fix, as the database stores many IAF holds', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa), Leg.TF(hldaa), Leg.HF(hldaa, 90, RIGHT, FixTypeFlags.IAF)]}],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.askObs])).toEqual([
            ['IAFAA', false], ['HLDAA', true], ['FAFAA', false], ['MAPAA', false],
        ]);
    });

    // B-2, 6-10: the database pattern IF X (IAF), HF X: the flagged IF is kept and the hold is dropped as a repeat; the
    // OBS reminder of the hold moves to the kept leg. Whether the sim flags its data this way is not verified.
    it('asks for OBS at an IAF whose hold follows it as a separate leg (#219)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'HLDAA', legs: [Leg.IF(hldaa, FixTypeFlags.IAF), Leg.HF(hldaa, 90)]}],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType, l.askObs])).toEqual([
            ['HLDAA', KLNFixType.IAF, true], ['FAFAA', KLNFixType.FAF, false], ['MAPAA', KLNFixType.MAP, false],
        ]);
    });

    it('lists an IAF whose hold follows it as a separate leg once (setup of #219)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'HLDAA', legs: [Leg.IF(hldaa, FixTypeFlags.IAF), Leg.HF(hldaa, 90)]}],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['HLDAA', KLNFixType.IAF], ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP],
        ]);
    });
});

// The code flies over a hold or procedure turn fix and over a fix the database marks as fly-over, and anticipates the
// others.
describe('the fly-over of hold fixes and published fly-over fixes (characterization)', () => {
    it('flies over a hold fix and a published fly-over fix, and anticipates the others', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.HF(hldaa, 90, LegTurnDirection.Right, FixTypeFlags.IAF), Leg.TF(fafaa, FixTypeFlags.FAF, true), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => l.flyOver)).toEqual([true, true, false]);
    });
});

describe('an unflagged repeat of the last kept fix (characterization)', () => {
    it('is dropped when other legs precede it', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(hldaa, FixTypeFlags.IAF), Leg.HF(hldaa, 90)]}],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['IAFAA', KLNFixType.IAF], ['HLDAA', KLNFixType.IAF], ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP],
        ]);
    });
});

describe('the OBS reminder of a dropped leg (characterization, #219)', () => {
    it('is not set by a dropped repeat that is no hold or procedure turn', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'HLDAA', legs: [Leg.IF(hldaa, FixTypeFlags.IAF), Leg.TF(hldaa)]}],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.askObs])).toEqual([
            ['HLDAA', false], ['FAFAA', false], ['MAPAA', false],
        ]);
    });

    it('is not left on the previous leg by a hold dropped because the next leg goes to the same fix', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa), Leg.HF(hldaa, 90), Leg.TF(hldaa)]}],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app);
        // The HLDAA row is left out: whether the kept leg there asks for OBS is the bug #384 (pinned below)
        expect(legs.filter(l => l.wpt.icaoStruct.ident !== 'HLDAA').map(l => [l.wpt.icaoStruct.ident, l.askObs])).toEqual([
            ['IAFAA', false], ['IFAAA', false], ['FAFAA', false], ['MAPAA', false],
        ]);
    });
});

// 6-10, B-2: the reminder to select OBS comes before a waypoint that is the basis of a hold or a course reversal. The
// hold is dropped here because the next leg goes to the same fix, and the kept leg asks for nothing (#384)
describe('the OBS reminder of a hold dropped for the next leg to the same fix (B-2, 6-10)', () => {
    it.fails('asks for OBS at a hold dropped because the next leg goes to the same fix (B-2, 6-10, #384)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa), Leg.HF(hldaa, 90), Leg.TF(hldaa)]}],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app);
        expect(legs.filter(l => l.wpt.icaoStruct.ident === 'HLDAA').map(l => l.askObs)).toEqual([true]);
    });
});

// The manual shows no approach whose missed approach holds at the MAP; the code lists the fix twice, once per flag, as it
// does for a co-located IAF and FAF.
describe('a missed approach that holds at the MAP (characterization)', () => {
    it('lists the MAP and the holding point at the same fix as two waypoints', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.HM(mapaa, 90, undefined, FixTypeFlags.MAHP), Leg.TF(misaa)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP], ['MAPAA', KLNFixType.MAHP], ['MISAA', undefined],
        ]);
    });
});

describe('the MAHP of a missed approach (#220)', () => {
    // 6-5 to 6-7: the holding point of the missed approach shows once with its suffix; 6-11: the OBS reminder before it.
    // The KLN 89 lists it once, last (checked in the KLN 89 trainer, 2026-10-15). The hold carries the MAHP flag as the
    // conversion leaves it after the derivation below.
    it('lists the holding point of the missed approach once with the MAHP suffix and the OBS reminder (6-5, 6-7, 6-11; checked in the KLN 89 trainer, 2026-10-15, #220)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90, undefined, FixTypeFlags.MAHP)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType, l.askObs])).toEqual([
            ['FAFAA', KLNFixType.FAF, false], ['MAPAA', KLNFixType.MAP, false], ['MAHAA', KLNFixType.MAHP, true],
        ]);
    });

    // The sim sets no MAHP flag (the #220 comment: HKKI RNAV 24 ends CA, DF TEXAV, HM TEXAV). The hold that ends the
    // missed approach is the MAHP (maintainer ruling). The conversion sets it on its copy, never on the SDK's leg.
    it('derives the MAHP from an unflagged hold that ends the missed approach (characterization, #220)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType, l.askObs])).toEqual([
            ['FAFAA', KLNFixType.FAF, false], ['MAPAA', KLNFixType.MAP, false], ['MAHAA', KLNFixType.MAHP, true],
        ]);
        expect(app.missedLegs[app.missedLegs.length - 1].fixTypeFlags).toBe(0);
    });

    // The database also ends a missed approach with a hold to an altitude or to a fix; the derivation does not depend on
    // which hold type it is (the test above covers HM) (maintainer ruling)
    it.each([
        ['HA', (f: Facility) => Leg.HA(f, 90)],
        ['HF', (f: Facility) => Leg.HF(f, 90)],
    ])('makes a missed approach that ends in %s the MAHP (characterization, #220)', async (_name, hold) => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa), hold(mahaa)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType, l.askObs])).toEqual([
            ['FAFAA', KLNFixType.FAF, false], ['MAPAA', KLNFixType.MAP, false], ['MAHAA', KLNFixType.MAHP, true],
        ]);
    });

    // A leg without a fix is not listed, so the last listed leg decides (maintainer ruling)
    it('makes the hold the MAHP when only a leg without a fix follows it (characterization, #220)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90), Leg.CA(90)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType, l.askObs])).toEqual([
            ['FAFAA', KLNFixType.FAF, false], ['MAPAA', KLNFixType.MAP, false], ['MAHAA', KLNFixType.MAHP, true],
        ]);
    });

    // A hold at the MAP fix that ends the missed approach: the fix is listed as the MAP, then as the MAHP, the way the
    // flagged hold at the MAP is (characterization)
    it('derives the MAHP at the MAP fix from an unflagged hold at the MAP (characterization, #220)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.HM(mapaa, 90)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP], ['MAPAA', KLNFixType.MAHP],
        ]);
    });

    // A missed approach that does not end in a hold gets no MAHP (maintainer ruling). A procedure turn is the leg most
    // easily taken for one: it asks for OBS like a hold, but it is no hold.
    it.each([
        ['DF', (f: Facility) => Leg.DF(f)],
        ['TF', (f: Facility) => Leg.TF(f)],
        ['CF', (f: Facility) => Leg.CF(f, 270)],
        ['PI', (f: Facility) => Leg.PI(f, 90)],
    ])('marks no MAHP when the missed approach ends in %s, not in a hold (characterization, #220)', async (_name, last) => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), last(mahaa)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP], ['MAHAA', undefined],
        ]);
    });

    // Only the hold that ends the missed approach is the MAHP: a hold that a further leg follows is not (maintainer ruling)
    it('marks no MAHP when a hold is followed by a further leg of the missed approach (characterization, #220)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90), Leg.TF(misaa)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['FAFAA', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP], ['MAHAA', undefined], ['MISAA', undefined],
        ]);
    });
});

// The conversion of DME arcs: the entry on the aircraft's radial, one arc for consecutive arcs, the FAF kept. The pages
// are cited on the spec tests.
describe('DME arcs in the conversion', () => {
    const abc = vor('ABC', 47.3, 8.3);
    const fixAt = (ident: string, radial: number, nm: number) => {
        const p = pointFrom({lat: abc.lat, lon: abc.lon}, radial, nm);
        return intersection(ident, p.lat, p.lon);
    };
    const arcbg = fixAt('ARCBG', 270, 10);
    const step1 = fixAt('STEPA', 240, 10);
    const step2 = fixAt('STEPB', 210, 10);
    const arcen = fixAt('ARCEN', 180, 10);
    const hldfx = fixAt('HLDFX', 180, 10);
    const facs = [kprc, abc, arcbg, step1, step2, arcen, hldfx, fafaa, mapaa];
    const L = LegTurnDirection.Left;
    const convertAt = (app: ApproachProcedure, radial: number) => {
        const from = pointFrom({lat: abc.lat, lon: abc.lon}, radial, 20);
        return new SidStar(new MemoryFacilityClient(facs) as any, {add() {}} as any,
                           {in: {gps: {coords: new GeoPoint(from.lat, from.lon)}}} as any)
            .getKLNApproachLegList(kprc, app, app.transitions[0]);
    };

    // 6-16 to 6-18: the unit enters an arc on the aircraft's radial and flies it to its end fix. 6-18: two step-down
    // fixes make three arc legs, flown as one arc from the start of the first to the end of the last (the step-down
    // fixes are not in its database); the arc ends at the FAF, which keeps its suffix (6-6, 6-7: every approach has a FAF).
    it('flies three arcs around one navaid as one arc that ends at the FAF', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [
                    Leg.IF(arcbg, FixTypeFlags.IAF),
                    Leg.AF(step1, abc, {radiusNm: 10, fromRadial: 270, toRadial: 240, turn: L}),
                    Leg.AF(step2, abc, {radiusNm: 10, fromRadial: 240, toRadial: 210, turn: L}),
                    Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 210, toRadial: 180, turn: L, flags: FixTypeFlags.FAF}),
                ],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertAt(app, 260);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['D260J', KLNFixType.IAF], ['ARCEN', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP],
        ]);
        expect(legs[0].arcData!.beginRadial).toBe(270);
        expect(legs[0].arcData!.endRadial).toBe(180);
        // 6-17 step 4: the arc approach loads like any other, so the entry is an approach waypoint of the airport too
        // (ModeController finds the approach airport for the 30 NM arming of 6-1 on the first approach waypoint). 6-18
        // step 8: the unit anticipates the turn onto the arc, so the entry is not a fly-over waypoint.
        expect(legs.map(l => [l.type, l.parentFacility, l.flyOver])).toEqual([
            [KLNLegType.APP, kprc, false], [KLNLegType.APP, kprc, false], [KLNLegType.APP, kprc, false],
        ]);
    });

    it('makes the arc entry a user waypoint on the arc radius from the VOR (characterization)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [Leg.IF(arcbg, FixTypeFlags.IAF), Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: L}), Leg.TF(fafaa, FixTypeFlags.FAF)],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertAt(app, 225);
        const entry = legs[0].wpt as unknown as { icaoStruct: { ident: string }, reference1IcaoStruct: { ident: string }, reference1Radial: number, reference1Distance: number };
        expect(entry.icaoStruct.ident).toBe('D225J');
        expect(entry.reference1IcaoStruct.ident).toBe('ABC');
        expect(entry.reference1Radial).toBeCloseTo(225, 0);
        expect(entry.reference1Distance).toBeCloseTo(10, 6);
    });

    // 6-6, 6-7: the FAF keeps its suffix when the arc ends at the fix where the final starts (the PHNY pattern of
    // 7fd640e, here with the FAF on the final's first leg).
    it('keeps the FAF of the final when the arc of the transition ends at it', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [Leg.IF(arcbg, FixTypeFlags.IAF), Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: L})],
            }],
            final: [Leg.IF(arcen, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertAt(app, 225);
        expect(legs.map(l => [l.wpt.icaoStruct.ident, l.fixType])).toEqual([
            ['D225J', KLNFixType.IAF], ['ARCEN', KLNFixType.FAF], ['MAPAA', KLNFixType.MAP],
        ]);
        expect(legs[0].arcData!.endFacility.icaoStruct.ident).toBe('ARCEN');
    });

    // B-2, 6-10: the reminder before a waypoint that is the basis of a hold. That the arc to it stays an arc is the
    // project's arc model (6-16), not B-2. The arc carries the IAF flag, so it is kept and the unflagged hold after it is
    // dropped as a repeat (the #219 path)
    it('asks for OBS at the end fix of an arc that leads to a hold (B-2, 6-10, #219)', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [
                    Leg.IF(arcbg),
                    Leg.AF(hldfx, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: L, flags: FixTypeFlags.IAF}),
                    Leg.HF(hldfx, 90),
                ],
            }],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertAt(app, 260);
        const end = legs.find(l => l.wpt.icaoStruct.ident.trim() === 'HLDFX')!;
        expect(legs.some(l => l.arcData?.endFacility.icaoStruct.ident.trim() === 'HLDFX')).toBe(true);
        expect(end.askObs).toBe(true);
        expect(legs[0].arcData).toBeDefined();
        expect(legs[0].askObs).toBeUndefined();
    });

    // B-2, 6-10: the reminder before a waypoint that is the basis of a hold or a course reversal. That the arc to it stays
    // an arc is the project's arc model (6-16), not B-2. Here the arc carries no flag, so it is dropped as a repeat and
    // the unit takes the arc in the place of the hold (addArcInfoIfPrevIsSame); the hold's reminder must survive that.
    // The hold is unflagged and not last (the else branch of filterOutDuplicates), or it carries a flag (the keep branch).
    it.each([
        ['HF', 'unflagged', () => Leg.HF(hldfx, 90)],
        ['PI', 'unflagged', () => Leg.PI(hldfx, 90)],
        ['HF', 'flagged IAF', () => Leg.HF(hldfx, 90, L, FixTypeFlags.IAF)],
        ['PI', 'flagged IAF', () => Leg.PI(hldfx, 90, L, FixTypeFlags.IAF)],
    ])('asks for OBS at the end fix of an unflagged arc that leads to a %s, %s (B-2, 6-10, #381)', async (_type, _flag, hold) => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [
                    Leg.IF(arcbg),
                    Leg.AF(hldfx, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: L}),
                    hold(),
                ],
            }],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertAt(app, 260);
        const end = legs.find(l => l.wpt.icaoStruct.ident.trim() === 'HLDFX')!;
        expect(legs.some(l => l.arcData?.endFacility.icaoStruct.ident.trim() === 'HLDFX')).toBe(true);
        expect(end.askObs).toBe(true);
        expect(legs[0].askObs).toBeUndefined();
    });

    it.each([
        ['unflagged', 0],
        ['flagged IAF', FixTypeFlags.IAF],
    ])('keeps no OBS reminder at the end fix of an unflagged arc followed by a leg that is no hold, %s (characterization, #381)', async (_flag, flags) => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            transitions: [{
                name: 'ARCBG',
                legs: [
                    Leg.IF(arcbg),
                    Leg.AF(hldfx, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: L}),
                    Leg.TF(hldfx, flags),
                ],
            }],
            final: [Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertAt(app, 260);
        const end = legs.find(l => l.wpt.icaoStruct.ident.trim() === 'HLDFX')!;
        expect(legs.some(l => l.arcData?.endFacility.icaoStruct.ident.trim() === 'HLDFX')).toBe(true);
        expect(end.askObs).toBe(false);
    });
});

// The code leaves out procedures with an RF leg anywhere and judges each transition by its own legs, as it does for
// runway transitions (#14).
describe('SidStar.isProcedureRecognized for SIDs and STARs (characterization)', () => {
    const f = intersection('FIXAA', 47, 8);
    const g = intersection('FIXAB', 47.1, 8.1);
    it.each([
        ['the runway part', () => sid('RF1', {runways: [{runway: '27', legs: [Leg.TF(f), Leg.RF(g)]}], common: [Leg.TF(g)]})],
        ['an enroute transition', () => sid('RF1', {common: [Leg.TF(f)], transitions: [{name: 'FIXAB', legs: [Leg.TF(f), Leg.RF(g)]}]})],
        ['the common route', () => star('RF1', {common: [Leg.TF(f), Leg.RF(g)]})],
    ])('does not list a procedure with an RF leg in %s', (_w, build) => {
        expect(SidStar.isProcedureRecognized(build())).toBe(false);
    });

    it('judges one enroute transition on its own legs', () => {
        const p = star('ARR1', {transitions: [{name: 'FIXAA', legs: [Leg.IF(f), Leg.TF(g)]}, {name: 'VECTR', legs: [Leg.VM(90)]}]});
        const [withFix, vectors] = p.enRouteTransitions;
        expect(SidStar.isProcedureRecognized(p, null, withFix)).toBe(true);
        expect(SidStar.isProcedureRecognized(p, null, vectors)).toBe(false);
    });
});

describe('the fix type of a leg with two flags (characterization)', () => {
    it('makes a leg that is IAF and FAF the FAF', async () => {
        const app = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
            final: [Leg.IF(fafaa, FixTypeFlags.IAF | FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
        });
        const legs = await convertApp(app, null);
        expect(legs.map(l => l.fixType)).toEqual([KLNFixType.FAF, KLNFixType.MAP]);
    });
});

describe('SidStar.getKLNProcedureLegList', () => {
    const depaa = intersection('DEPAA', 47.05, 8.0);
    const comaa = intersection('COMAA', 47.2, 8.1);
    const comab = intersection('COMAB', 47.4, 8.3);
    const trnaa = intersection('TRNAA', 47.6, 8.5);
    const trnab = intersection('TRNAB', 47.8, 8.7);
    const rwyaa = intersection('RWYAA', 46.95, 7.95);
    const facs = [kprc, depaa, comaa, comab, trnaa, trnab, rwyaa];
    const convert = (proc: Procedure, type: KLNLegType, rwy: number | null, trans: number | null) =>
        sidStar(facs).getKLNProcedureLegList(kprc, proc, type, rwy === null ? null : proc.runwayTransitions[rwy],
                                             trans === null ? null : proc.enRouteTransitions[trans]);

    const departure = (withRunway = true) => sid('PORT9', {
        runways: withRunway ? [{runway: '01L', legs: [Leg.CA(10), Leg.CF(depaa, 350)]}] : [],
        common: [Leg.DF(comaa), Leg.TF(comab)],
        transitions: [{name: 'TRNAB', legs: [Leg.IF(comab), Leg.TF(trnaa), Leg.TF(trnab)]}],
    });
    const arrival = () => star('ARRV4', {
        transitions: [{name: 'TRNAB', legs: [Leg.IF(trnab), Leg.TF(trnaa), Leg.TF(comab)]}],
        common: [Leg.IF(comab), Leg.TF(comaa)],
        runways: [{runway: '27R', legs: [Leg.TF(comaa), Leg.TF(rwyaa)]}],
    });

    // 6-21: a SID has three parts, the name, a transition and a runway part. 6-22: the waypoints start with the runway
    // part and end with the transition (figure 6-37: SFO04, PORTE, PESCA ... FLW), each once; the header is the name
    // followed by -SID (figures 6-35 to 6-38).
    it('lists a SID from the runway part through the common route to the transition', async () => {
        const legs = await convert(departure(), KLNLegType.SID, 0, 0);
        expect(identsOf(legs)).toEqual(['DEPAA', 'COMAA', 'COMAB', 'TRNAA', 'TRNAB']);
        expect(legs.map(l => l.type)).toEqual(Array(5).fill(KLNLegType.SID));
        expect(legs.map(l => l.procedure!.displayName)).toEqual(Array(5).fill('PORT9-SID'));
    });

    // 6-21: some steps of the selection may not be necessary; a SID without a runway part starts at the common route.
    it('lists a SID without a runway part from the common route', async () => {
        const legs = await convert(departure(false), KLNLegType.SID, null, 0);
        expect(identsOf(legs)).toEqual(['COMAA', 'COMAB', 'TRNAA', 'TRNAB']);
    });

    // 6-23: a STAR starts with its transition and runs through the common route (figure 6-42: INK, PHILS, TQA ...
    // CREEK); the header is the name, a dash and the STAR glyph (figures 6-41 to 6-43; Æ in the font,
    // docs/architecture.md).
    it('lists a STAR from the transition through the common route', async () => {
        const legs = await convert(arrival(), KLNLegType.STAR, null, 0);
        expect(identsOf(legs)).toEqual(['TRNAB', 'TRNAA', 'COMAB', 'COMAA']);
        expect(legs.map(l => l.type)).toEqual(Array(4).fill(KLNLegType.STAR));
        expect(legs.map(l => l.procedure!.displayName)).toEqual(Array(4).fill('ARRV4-Æ'));
    });

    // The manual's example STAR has no runway part; the code appends it after the common route.
    it('appends the runway part of a STAR after the common route (characterization)', async () => {
        const legs = await convert(arrival(), KLNLegType.STAR, 0, 0);
        expect(identsOf(legs)).toEqual(['TRNAB', 'TRNAA', 'COMAB', 'COMAA', 'RWYAA']);
    });

    // The EFB route sync answers the route request from these fields (KlnEfbSaver; CLAUDE.md "Public contract with
    // aircraft", the EFB route sync).
    it.each([
        ['SID', KLNLegType.SID, departure, 1],
        ['STAR', KLNLegType.STAR, arrival, 27],
    ] as const)('carries the %s, its transition and its runway for the EFB route', async (_n, type, build, number) => {
        const legs = await convert(build(), type, 0, 0);
        const p = legs[0].procedure!;
        expect(p.procedureName).toBe(type === KLNLegType.SID ? 'PORT9' : 'ARRV4');
        expect(p.transition).toBe('TRNAB');
        expect(p.runwayNumber).toBe(number);
        expect(p.runwayDesignator).toBe(type === KLNLegType.SID ? RunwayDesignator.RUNWAY_DESIGNATOR_LEFT : RunwayDesignator.RUNWAY_DESIGNATOR_RIGHT);
    });
});

// 3-32: on an approach with a DME arc, NAV 2 shows the arc's VOR when the aircraft is within 30 NM of the arc; 6-18:
// the arc radial on Super NAV 5 is forced at the same distance. The manual measures to the arc, so the distance runs
// along the flight plan to the arc entry.
describe('SidStar.getVorIfWithin30NMOfArc', () => {
    const abc = vor('ABC', 47.3, 8.3);
    const at = (p: { lat: number; lon: number }, ident: string) => intersection(ident, p.lat, p.lon);
    const wptA = at({lat: 47.0, lon: 8.0}, 'WPTAA');
    const entry = at(pointFrom({lat: 47.0, lon: 8.0}, 90, 15), 'D270J');
    const legA = {wpt: wptA, type: KLNLegType.APP} as unknown as KLNFlightplanLeg;
    const entryLeg = {wpt: entry, type: KLNLegType.APP, arcData: {vor: abc}} as unknown as KLNFlightplanLeg;
    const greatCircle = {path: {isGreatCircle: () => true}};
    const navState = (distToActive: number, future: KLNFlightplanLeg[], fplIdx = 1, from: unknown = greatCircle) => ({
        activeWaypoint: {getActiveFplIdx: () => fplIdx, getFromLeg: () => from, getFutureLegs: () => future},
        distToActive,
    }) as any;
    const fpl0 = (legs: KLNFlightplanLeg[]) => ({getLegs: () => legs}) as any;

    it('names the arc VOR when the arc entry is 25 NM ahead along the plan (10 NM to WPTAA, 15 NM on)', () => {
        expect(SidStar.getVorIfWithin30NMOfArc(navState(10, [legA, entryLeg]), fpl0([]))).toBe(abc);
    });

    it('names no VOR when the arc entry is 35 NM ahead along the plan (20 NM to WPTAA, 15 NM on)', () => {
        expect(SidStar.getVorIfWithin30NMOfArc(navState(20, [legA, entryLeg]), fpl0([]))).toBeNull();
    });

    it('names no VOR when the arc entry is 31 NM ahead along the plan (16 NM to WPTAA, 15 NM on)', () => {
        expect(SidStar.getVorIfWithin30NMOfArc(navState(16, [legA, entryLeg]), fpl0([]))).toBeNull();
    });

    it('names the arc VOR while the arc entry is the active waypoint 29 NM away', () => {
        expect(SidStar.getVorIfWithin30NMOfArc(navState(29, [entryLeg]), fpl0([]))).toBe(abc);
    });

    it('names the arc VOR while the aircraft flies the arc', () => {
        const onArc = {path: {isGreatCircle: () => false}};
        const legs = [legA, entryLeg, {wpt: wptA, type: KLNLegType.APP} as unknown as KLNFlightplanLeg];
        expect(SidStar.getVorIfWithin30NMOfArc(navState(5, [legs[2]], 2, onArc), fpl0(legs))).toBe(abc);
    });

    it('names no VOR without an active flight plan leg', () => {
        expect(SidStar.getVorIfWithin30NMOfArc(navState(1, [entryLeg], -1), fpl0([]))).toBeNull();
    });
});
