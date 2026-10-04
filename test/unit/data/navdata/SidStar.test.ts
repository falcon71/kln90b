import {describe, expect, it} from 'vitest';
import {
    ApproachProcedure, GeoCircle, GeoPoint, ICAO, LegTurnDirection, LegType, Procedure, RnavTypeFlags, RunwayTransition,
} from '@microsoft/msfs-sdk';
import {SidStar} from '../../../../kln90b/data/navdata/SidStar';
import {KLNFlightplanLeg} from '../../../../kln90b/data/flightplan/Flightplan';
import {Sensors} from '../../../../kln90b/Sensors';
import {vor} from '../../../harness/navdata/builders';
import {EARTH_RADIUS_NM} from '../../../harness/flight/geo';

function leg(type: LegType, rnp = 0) {
    return {type, rnp, fixIcaoStruct: ICAO.value('W', 'K1', '', 'FIXAA')};
}

interface AppFields {
    approachType: number;
    rnavTypeFlags?: number;
    rnpAr?: boolean;
    missedApproachRnpAr?: boolean;
    transitions?: { legs: ReturnType<typeof leg>[] }[];
    finalLegs?: ReturnType<typeof leg>[];
    missedLegs?: ReturnType<typeof leg>[];
}

function app(f: AppFields): ApproachProcedure {
    return {
        approachType: f.approachType,
        rnavTypeFlags: f.rnavTypeFlags ?? 0,
        rnpAr: f.rnpAr ?? false,
        missedApproachRnpAr: f.missedApproachRnpAr ?? false,
        transitions: f.transitions ?? [],
        finalLegs: f.finalLegs ?? [leg(LegType.IF), leg(LegType.TF)],
        missedLegs: f.missedLegs ?? [leg(LegType.TF)],
    } as unknown as ApproachProcedure;
}

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
    ])('%s approach (#6 cc89fd4)', (_name, approachType) => {
        it('is listed', () => {
            expect(SidStar.isApproachRecognized(app({approachType}))).toBe(true);
        });
    });

    it.each([
        ['ILS', ApproachType.APPROACH_TYPE_ILS],
        ['LOCALIZER', ApproachType.APPROACH_TYPE_LOCALIZER],
        ['LDA', ApproachType.APPROACH_TYPE_LDA],
        ['SDF', ApproachType.APPROACH_TYPE_SDF],
        ['LOCALIZER_BACK_COURSE', ApproachType.APPROACH_TYPE_LOCALIZER_BACK_COURSE],
    ])('does not list a %s approach (#6 117f548)', (_name, approachType) => {
        expect(SidStar.isApproachRecognized(app({approachType}))).toBe(false);
    });

    // The LNAV-bit rule is the code's convention (RNAV approaches only if LNAV without VNAV is allowed), not a
    // statement of the Pilot's Guide.
    describe('RNAV approaches (characterization of the LNAV rule)', () => {
        const RNAV = ApproachType.APPROACH_TYPE_RNAV;

        it('lists an RNAV approach with the LNAV bit and no RF leg (#6 4fa8cea)', () => {
            expect(SidStar.isApproachRecognized(app({approachType: RNAV, rnavTypeFlags: LNAV_LNAVVNAV}))).toBe(true);
        });

        it('does not list an RNAV approach without the LNAV bit (LNAV/VNAV and LPV only)', () => {
            const flags = RnavTypeFlags.LNAVVNAV | RnavTypeFlags.LPV;
            expect(flags).toBe(10);
            expect(SidStar.isApproachRecognized(app({approachType: RNAV, rnavTypeFlags: flags}))).toBe(false);
        });

        it('does not list an RNAV approach with no flags at all', () => {
            expect(SidStar.isApproachRecognized(app({approachType: RNAV, rnavTypeFlags: 0}))).toBe(false);
        });
    });

    // The real unit has no arc-to-fix with a radius change (RF) leg. Where the code filters them is the code's
    // convention: the final legs, any transition or the missed approach.
    describe('RF legs (characterization)', () => {
        const RNAV = ApproachType.APPROACH_TYPE_RNAV;
        const withRf = [leg(LegType.TF), leg(LegType.RF)];

        it.each([
            ['the final legs', {finalLegs: withRf}],
            ['a transition', {transitions: [{legs: withRf}]}],
            ['the missed approach', {missedLegs: withRf}],
        ])('does not list an RNAV approach with an RF leg in %s', (_where, fields) => {
            expect(SidStar.isApproachRecognized(app({approachType: RNAV, rnavTypeFlags: LNAV_LNAVVNAV, ...fields}))).toBe(false);
        });

        it('does not list a VOR approach with an RF leg', () => {
            expect(SidStar.isApproachRecognized(app({approachType: ApproachType.APPROACH_TYPE_VOR, finalLegs: withRf}))).toBe(false);
        });
    });
});

// #59: the unit lists every approach and procedure whatever its RNP value, as the real unit does at 2M2 and KMBT even
// though some of their approaches need an RNP below 1. Only RNP AR (authorization required) and RF legs are filtered.
// The code's comment is the reference here, the Pilot's Guide does not discuss RNP values: characterization.
describe('RNP is not a filter (characterization, #59 71481dc, b0c16cf)', () => {
    const procedure = (rnpAr: boolean) => ({
        enRouteTransitions: [], runwayTransitions: [], commonLegs: [leg(LegType.TF, 1852)], rnpAr,
    }) as unknown as Procedure;

    it('lists an RNAV approach with LNAV whose legs all have an RNP of 0.3 NM', () => {
        const legs = [leg(LegType.IF, 555.6), leg(LegType.TF, 555.6)];
        const a = app({approachType: ApproachType.APPROACH_TYPE_RNAV, rnavTypeFlags: LNAV_LNAVVNAV, finalLegs: legs, missedLegs: legs});
        expect(SidStar.isApproachRecognized(a)).toBe(true);
    });

    it('lists a VOR approach with a leg at an RNP of 1 NM', () => {
        const a = app({approachType: ApproachType.APPROACH_TYPE_VOR, finalLegs: [leg(LegType.IF), leg(LegType.TF, 1852)]});
        expect(SidStar.isApproachRecognized(a)).toBe(true);
    });

    it('does not list an RNP AR approach', () => {
        expect(SidStar.isApproachRecognized(app({approachType: ApproachType.APPROACH_TYPE_VOR, rnpAr: true}))).toBe(false);
    });

    it('does not list an approach with an RNP AR missed approach', () => {
        expect(SidStar.isApproachRecognized(app({approachType: ApproachType.APPROACH_TYPE_VOR, missedApproachRnpAr: true}))).toBe(false);
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
    const noFix = (type: LegType) => ({type, rnp: 0, fixIcaoStruct: ICAO.emptyValue()});
    const procedure = (runwayLegs: ReturnType<typeof leg>[][], commonLegs: ReturnType<typeof leg>[]) => ({
        enRouteTransitions: [], runwayTransitions: runwayLegs.map(legs => ({legs})), commonLegs, rnpAr: false,
    }) as unknown as Procedure;

    it('does not list a procedure whose only legs are CA and VM without a fix', () => {
        expect(SidStar.isProcedureRecognized(procedure([[noFix(LegType.CA), noFix(LegType.VM)]], []))).toBe(false);
    });

    it('lists it once a common leg to a fix is added', () => {
        expect(SidStar.isProcedureRecognized(procedure([[noFix(LegType.CA), noFix(LegType.VM)]], [leg(LegType.TF)]))).toBe(true);
    });

    it('judges one runway transition on its own legs', () => {
        const rwy04 = {legs: [noFix(LegType.CA), noFix(LegType.VM)]};
        const rwy31 = {legs: [noFix(LegType.CA), leg(LegType.TF)]};
        const p = {enRouteTransitions: [], runwayTransitions: [rwy04, rwy31], commonLegs: [], rnpAr: false} as unknown as Procedure;
        expect(SidStar.isProcedureRecognized(p, rwy04 as unknown as RunwayTransition)).toBe(false);
        expect(SidStar.isProcedureRecognized(p, rwy31 as unknown as RunwayTransition)).toBe(true);
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

    // 6-6: the identifier has five characters, as every waypoint name in the unit. Beyond 26 NM the distance no longer
    // fits a letter (the old letter-only form gave "undefined"), so only the shape is asserted here; the form is the pin below.
    it.each([27, 30])('names an arc entry %i NM from the VOR with five letters or digits', dist => {
        expect(getArcEntryName('ABC', 45, dist)).toMatch(/^[A-Z0-9]{5}$/);
    });

    // 6-6: DME arcs beyond 26 NM have waypoints named with the first two letters of the DME ident and the three-digit
    // radial. The code uses the along-radial form of the same page instead (ident plus distance).
    it.fails('names an arc entry beyond 26 NM with two letters of the DME ident and the radial (#107)', () => {
        expect(getArcEntryName('ABC', 45, 27)).toBe('AB045');
        expect(getArcEntryName('ABC', 45, 30)).toBe('AB045');
    });
});

// 6-17: an arc entry is recalculated from the current track: the point where the track meets the arc, ahead of the
// aircraft. The VOR ABC is at 0/0 and the arc has a radius of 10 NM. The expected values are solved on the sphere
// of geo.ts (radius EARTH_RADIUS_NM) without the SDK, so the numbers hold for the code's great circles.
describe('SidStar.recalculateArcEntryData (9ce23bf, f4f5395, 1ef2a35)', () => {
    const R = EARTH_RADIUS_NM;
    const toDeg = (nm: number) => nm / R * 180 / Math.PI;

    function arcLeg(turnDirection: LegTurnDirection, beginRadial: number, endRadial: number): KLNFlightplanLeg {
        const circle = new GeoCircle(GeoPoint.sphericalToCartesian({lat: 0, lon: 0}, new Float64Array(3)), 10 / R);
        if (turnDirection === LegTurnDirection.Right) {
            circle.reverse(); // as getArcEntryData does for right-hand arcs
        }
        return {arcData: {beginRadial, endRadial, turnDirection, vor: vor('ABC', 0, 0), circle}} as unknown as KLNFlightplanLeg;
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

    // The distance is read from the radius of the circle, and a right-hand circle is reversed (radius pi minus the
    // arc radius, 10809.3 NM). The name then reads like a 100+ NM waypoint.
    it.fails('names a right-hand arc entry D030J (#104)', () => {
        const arc = arcLeg(LegTurnDirection.Right, 10, 170);
        const data = SidStar.recalculateArcEntryData(arc, sensorsAt(SOUTH_EAST.lat, SOUTH_EAST.lon, 0))!;
        const entry = data.entryFacility as unknown as { icaoStruct: { ident: string }, reference1Distance: number };
        expect(entry.icaoStruct.ident).toBe('D030J');
        expect(entry.reference1Distance).toBeCloseTo(10, 3);
    });
});
