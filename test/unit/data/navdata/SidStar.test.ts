import {describe, expect, it} from 'vitest';
import {
    AirportFacility, ApproachProcedure, Facility, FixTypeFlags, FlightPlan, FlightPlanLeg, GeoCircle, GeoPoint, LegTurnDirection,
    LegType, Procedure, RnavTypeFlags,
} from '@microsoft/msfs-sdk';
import {SidStar} from '../../../../kln90b/data/navdata/SidStar';
import {KLNFixType, KLNFlightplanLeg, KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {Sensors} from '../../../../kln90b/Sensors';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, star} from '../../../harness/navdata/procedures';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {EARTH_RADIUS_NM, pointFrom} from '../../../harness/flight/geo';

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
    const idents = (legs: KLNFlightplanLeg[]) => legs.map(l => l.wpt.icaoStruct.ident);
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
            expect(idents(legs)).toEqual(['D225J', 'IFAAA', 'FAFAA', 'MAPAA']);
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
        it.each([
            ['left arc 270 to 180, aircraft on radial 225', LEFT, 270, 180, 225, 'D225J'],
            ['left arc 270 to 180, aircraft on radial 45, outside the arc: the beginning of the arc', LEFT, 270, 180, 45, 'D270J'],
            ['right arc 180 to 270, aircraft on radial 45, outside the arc: the beginning of the arc', RIGHT, 180, 270, 45, 'D180J'],
        ])('%s', async (_name, turn, from, to, aircraftRadial, entry) => {
            const {app, facs} = arcApproach(turn, from, to);
            const legs = await convert(facs, at(aircraftRadial, 20), kprc, app);
            expect(idents(legs)).toEqual([entry, 'ARCEN', 'FAFAA', 'MAPAA']);
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
            expect(idents(legs)).toEqual(['D260J', 'ARCEN', 'FAFAA', 'MAPAA']);
            const arc = legs[0].arcData!;
            expect((arc.entryFacility as unknown as { reference1Radial: number }).reference1Radial).toBeCloseTo(260, 0);
            expect(arc.beginRadial).toBe(270);
            expect(arc.endRadial).toBe(180);
            expect(arc.endFacility.icaoStruct.ident).toBe('ARCEN');
            expect(radiusNm(legs[0])).toBeCloseTo(10, 2);
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

        // The code compares the ICAO objects by reference; a copy of the same waypoint is not found.
        it.fails('finds a waypoint whose ICAO is an equal copy (#130)', () => {
            const copy = {...wpt, icaoStruct: {...wpt.icaoStruct}};
            expect(copy.icaoStruct).toEqual(wpt.icaoStruct);
            expect(copy.icaoStruct).not.toBe(wpt.icaoStruct);
            expect(SidStar.hasDuplicates([fplLeg(wpt)], [procLeg(copy)])).toBe(true);
        });
    });

    // 6-16 to 6-18: a DME arc is flown at its published distance. Real STARs fly AF, CI (no fix), AF around one navaid
    // with two radii. The conversion drops the fixless CI leg, takes the first arc for a step-down fix of the second
    // and flies the whole arc at the radius of the second.
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
            const idx = idents(legs);
            expect(idx).toContain('ARC2E');
            expect(idx[idx.length - 1]).toBe('FINAL');
            const secondArc = legs.find(l => l.arcData?.endFacility.icaoStruct.ident === 'ARC2E');
            expect(secondArc).toBeDefined();
            expect(radiusNm(secondArc!)).toBeCloseTo(10, 1);
        });

        it.fails('flies the first arc at its own radius of 13 NM (#131)', async () => {
            const legs = await convertStar();
            const firstArc = legs.find(l => l.arcData?.endFacility.icaoStruct.ident === 'ARC1E');
            expect(firstArc).toBeDefined();
            expect(radiusNm(firstArc!)).toBeCloseTo(13, 1);
        });
    });
});

// Session 7 task 6: the conversion paths of SidStar that the tests above leave out. The worlds are invented.
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
const idents = (legs: KLNFlightplanLeg[]) => legs.map(l => l.wpt.icaoStruct.ident);

describe('SidStar.formatApproachName', () => {
    const name = (type: ApproachType, runway: string, suffix?: string) =>
        SidStar.formatApproachName(approach({type, runway, suffix, final: [Leg.IF(fafaa)]}), kprc);

    // 6-5: the approach header is the first letter of the approach type, the runway, a dash and the airport (figure 6-8
    // shows V25R-KLAX, figure 6-24 V12-KOWA). 3-49 lists the RNAV approaches as RNAV.
    it.each([
        ['VOR 25R', ApproachType.APPROACH_TYPE_VOR, '25R', 'V25R-KPRC'],
        ['VOR/DME 12', ApproachType.APPROACH_TYPE_VORDME, '12', 'V12-KPRC'],
        ['NDB 24L', ApproachType.APPROACH_TYPE_NDB, '24L', 'N24L-KPRC'],
        ['NDB/DME 33', ApproachType.APPROACH_TYPE_NDBDME, '33', 'N33-KPRC'],
        ['RNAV 15C', ApproachType.APPROACH_TYPE_RNAV, '15C', 'R15C-KPRC'],
    ])('names the %s approach', (_n, type, runway, expected) => {
        expect(name(type, runway)).toBe(expected);
    });

    // The manual shows no header for a GPS approach, a runway below 10, a circling approach or a suffix; these are the
    // code's forms.
    describe('(characterization)', () => {
        it('names a GPS approach like an RNAV approach', () => {
            expect(name(ApproachType.APPROACH_TYPE_GPS, '27')).toBe('R27-KPRC');
        });

        it('pads a runway below 10 with a zero', () => {
            expect(name(ApproachType.APPROACH_TYPE_VOR, '09')).toBe('V09-KPRC');
        });

        it('names a circling approach with a dash for the runway', () => {
            expect(name(ApproachType.APPROACH_TYPE_VOR, '', 'A')).toBe('V-A-KPRC');
        });

        it('puts the suffix after the runway', () => {
            expect(name(ApproachType.APPROACH_TYPE_RNAV, '27', 'Y')).toBe('R27Y-KPRC');
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
    // be added or deleted (no colon). FlightplanList draws the header from procedure.displayName.
    it('marks every waypoint as an approach waypoint of the airport under the approach header', async () => {
        const legs = await convertApp(rnav27(), 1);
        expect(legs.map(l => l.type)).toEqual(Array(6).fill(KLNLegType.APP));
        expect(legs.every(l => l.parentFacility === kprc)).toBe(true);
        expect(legs.map(l => l.procedure!.displayName)).toEqual(Array(6).fill('R27LY-KPRC'));
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
        expect(idents(legs)).toEqual(['IFAAA', 'FAFAA', 'MAPAA', 'MISAA', 'MAHAA']);
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

    // The database pattern IF X (IAF), HF X: the flagged IF is kept, the hold is dropped as a repeat, and the OBS
    // reminder of the hold is lost with it. Whether the sim flags its data this way is not verified.
    it.fails('asks for OBS at an IAF whose hold follows it as a separate leg (#NEW-6-1)', async () => {
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

    it('lists an IAF whose hold follows it as a separate leg once (setup of #NEW-6-1)', async () => {
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
    const facs = [kprc, abc, arcbg, step1, step2, arcen, fafaa, mapaa];
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
        expect(idents(legs)).toEqual(['DEPAA', 'COMAA', 'COMAB', 'TRNAA', 'TRNAB']);
        expect(legs.map(l => l.type)).toEqual(Array(5).fill(KLNLegType.SID));
        expect(legs.map(l => l.procedure!.displayName)).toEqual(Array(5).fill('PORT9-SID'));
    });

    // 6-21: some steps of the selection may not be necessary; a SID without a runway part starts at the common route.
    it('lists a SID without a runway part from the common route', async () => {
        const legs = await convert(departure(false), KLNLegType.SID, null, 0);
        expect(idents(legs)).toEqual(['COMAA', 'COMAB', 'TRNAA', 'TRNAB']);
    });

    // 6-23: a STAR starts with its transition and runs through the common route (figure 6-42: INK, PHILS, TQA ...
    // CREEK); the header is the name, a dash and the STAR glyph (figures 6-41 to 6-43; Æ in the font,
    // docs/architecture.md).
    it('lists a STAR from the transition through the common route', async () => {
        const legs = await convert(arrival(), KLNLegType.STAR, null, 0);
        expect(idents(legs)).toEqual(['TRNAB', 'TRNAA', 'COMAB', 'COMAA']);
        expect(legs.map(l => l.type)).toEqual(Array(4).fill(KLNLegType.STAR));
        expect(legs.map(l => l.procedure!.displayName)).toEqual(Array(4).fill('ARRV4-Æ'));
    });

    // The manual's example STAR has no runway part; the code appends it after the common route.
    it('appends the runway part of a STAR after the common route (characterization)', async () => {
        const legs = await convert(arrival(), KLNLegType.STAR, 0, 0);
        expect(idents(legs)).toEqual(['TRNAB', 'TRNAA', 'COMAB', 'COMAA', 'RWYAA']);
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
