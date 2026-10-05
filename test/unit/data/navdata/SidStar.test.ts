import {describe, expect, it} from 'vitest';
import {
    AirportFacility, ApproachProcedure, Facility, FixTypeFlags, FlightPlan, GeoCircle, GeoPoint, LegTurnDirection, LegType,
    RnavTypeFlags,
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
        it.fails('finds a waypoint whose ICAO is an equal copy (#NEW-2-1)', () => {
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

        it.fails('flies the first arc at its own radius of 13 NM (#NEW-2-2)', async () => {
            const legs = await convertStar();
            const firstArc = legs.find(l => l.arcData?.endFacility.icaoStruct.ident === 'ARC1E');
            expect(firstArc).toBeDefined();
            expect(radiusNm(firstArc!)).toBeCloseTo(13, 1);
        });
    });
});
