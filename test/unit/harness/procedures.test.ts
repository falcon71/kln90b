import {describe, expect, it} from 'vitest';
import {FixTypeFlags, LegTurnDirection, LegType, RnavTypeFlags} from '@microsoft/msfs-sdk';
import {SidStar} from '../../../kln90b/data/navdata/SidStar';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, runwayFix, sid, star, withProcedures} from '../../harness/navdata/procedures';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';

const fix = intersection('FIXAA', 47.1, 8.1);
const RNAV = ApproachType.APPROACH_TYPE_RNAV;

describe('procedure builders (harness)', () => {
    it('returns a new, unfrozen leg on every call', () => {
        const a = Leg.TF(fix);
        const b = Leg.TF(fix);

        expect(a).not.toBe(b);
        expect(Object.isFrozen(a)).toBe(false);
        // SidStar writes into legs: addArcInfoIfPrevIsSame assigns fixTypeFlags
        a.fixTypeFlags = 8;
        expect(b.fixTypeFlags).toBe(0);
    });

    it('fills the fields SidStar reads', () => {
        expect(Leg.TF(fix, 1)).toMatchObject({fixIcaoStruct: fix.icaoStruct, fixTypeFlags: 1, flyOver: false});
        expect(Leg.CA(270).fixIcaoStruct.ident).toBe('');
        expect(Leg.CA(270).course).toBe(270);
    });

    // Each option with a value other than its default, so that a builder that drops an option fails
    it('passes the options of a leg into it', () => {
        expect(Leg.TF(fix, 0, true).flyOver).toBe(true);
        expect(Leg.CF(fix, 123, FixTypeFlags.FAF)).toMatchObject({course: 123, fixTypeFlags: FixTypeFlags.FAF, fixIcaoStruct: fix.icaoStruct});
        expect(Leg.HM(fix, 90, LegTurnDirection.Left, FixTypeFlags.MAHP)).toMatchObject({course: 90, turnDirection: LegTurnDirection.Left, fixTypeFlags: FixTypeFlags.MAHP});
        expect(Leg.HM(fix, 90).turnDirection).toBe(LegTurnDirection.Right);
        expect(Leg.HF(fix, 90, LegTurnDirection.Left, FixTypeFlags.IAF)).toMatchObject({type: LegType.HF, course: 90, turnDirection: LegTurnDirection.Left, fixTypeFlags: FixTypeFlags.IAF, fixIcaoStruct: fix.icaoStruct});
        expect(Leg.HA(fix, 270, LegTurnDirection.Left, FixTypeFlags.IAF)).toMatchObject({type: LegType.HA, course: 270, turnDirection: LegTurnDirection.Left, fixTypeFlags: FixTypeFlags.IAF, fixIcaoStruct: fix.icaoStruct});
        expect(Leg.PI(fix, 45, LegTurnDirection.Left, FixTypeFlags.IAF)).toMatchObject({type: LegType.PI, course: 45, turnDirection: LegTurnDirection.Left, fixTypeFlags: FixTypeFlags.IAF, fixIcaoStruct: fix.icaoStruct});
        expect(Leg.HF(fix, 90).turnDirection).toBe(LegTurnDirection.Right);
        expect(Leg.HF(fix, 90).fixTypeFlags).toBe(0);
        expect(Leg.HA(fix, 270).turnDirection).toBe(LegTurnDirection.Right);
        expect(Leg.HA(fix, 270).fixTypeFlags).toBe(0);
        expect(Leg.PI(fix, 45).turnDirection).toBe(LegTurnDirection.Right);
        expect(Leg.PI(fix, 45).fixTypeFlags).toBe(0);
        // A fix may be given as an ICAO value as well as a facility
        expect(Leg.TF(fix.icaoStruct).fixIcaoStruct).toEqual(fix.icaoStruct);
        expect(Leg.IF(fix.icaoStruct, FixTypeFlags.IAF)).toMatchObject({fixIcaoStruct: fix.icaoStruct, fixTypeFlags: FixTypeFlags.IAF});
    });

    it('passes the names, the suffix and the transitions of a procedure into it', () => {
        const a = approach({
            type: RNAV, runway: '27', name: 'RNAV Z 27', suffix: 'Z', transitions: [{name: 'IAFAA', legs: [Leg.IF(fix)]}], final: [Leg.TF(fix)],
        });
        expect([a.name, a.approachSuffix, a.transitions.map(t => t.name)]).toEqual(['RNAV Z 27', 'Z', ['IAFAA']]);

        const p = star('STAR1', {transitions: [{name: 'TRANS', legs: [Leg.TF(fix)]}, {name: 'OTHER', legs: [Leg.TF(fix)]}]});
        expect([p.name, p.enRouteTransitions.map(t => t.name)]).toEqual(['STAR1', ['TRANS', 'OTHER']]);
    });

    describe('approach', () => {
        const final = [Leg.IF(fix), Leg.TF(fix)];

        it('is recognized as an RNAV approach with LNAV', () => {
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', final}))).toBe(true);
        });

        it('is not recognized as an RNAV approach without the LNAV bit, so rnav is honored', () => {
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', rnav: 0, final}))).toBe(false);
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', rnav: RnavTypeFlags.LPV, final}))).toBe(false);
        });

        it('is not recognized with an RF leg', () => {
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', final: [Leg.TF(fix), Leg.RF(fix)]}))).toBe(false);
        });

        it('is not recognized as RNP AR', () => {
            expect(SidStar.isApproachRecognized(approach({type: RNAV, runway: '27', final, rnpAr: true}))).toBe(false);
        });

        it('splits the runway into number and designator', () => {
            const left = approach({type: RNAV, runway: '27L', final});
            expect([left.runwayNumber, left.runwayDesignator]).toEqual([27, RunwayDesignator.RUNWAY_DESIGNATOR_LEFT]);
            const right = approach({type: RNAV, runway: '09R', final});
            expect([right.runwayNumber, right.runwayDesignator]).toEqual([9, RunwayDesignator.RUNWAY_DESIGNATOR_RIGHT]);
            const center = approach({type: RNAV, runway: '27C', final});
            expect(center.runwayDesignator).toBe(RunwayDesignator.RUNWAY_DESIGNATOR_CENTER);
            const plain = approach({type: RNAV, runway: '27', final});
            expect([plain.runwayNumber, plain.runwayDesignator]).toEqual([27, RunwayDesignator.RUNWAY_DESIGNATOR_NONE]);
            const circling = approach({type: RNAV, runway: '', final});
            expect([circling.runwayNumber, circling.runway]).toEqual([0, '']);
        });
    });

    describe('sid and star', () => {
        it('are recognized with a leg to a fix', () => {
            expect(SidStar.isProcedureRecognized(sid('AAA1', {common: [Leg.TF(fix)]}))).toBe(true);
            expect(SidStar.isProcedureRecognized(star('BBB1', {transitions: [{name: 'TRANS', legs: [Leg.TF(fix)]}]}))).toBe(true);
        });

        it('are not recognized with only legs without a fix', () => {
            expect(SidStar.isProcedureRecognized(sid('AAA1', {common: [Leg.CA(270), Leg.VM(270)]}))).toBe(false);
        });

        it('are not recognized with an RF leg or as RNP AR', () => {
            expect(SidStar.isProcedureRecognized(sid('AAA1', {common: [Leg.TF(fix), Leg.RF(fix)]}))).toBe(false);
            expect(SidStar.isProcedureRecognized(sid('AAA1', {common: [Leg.TF(fix)], rnpAr: true}))).toBe(false);
        });

        it('judge one runway transition on its own legs', () => {
            const p = sid('AAA1', {runways: [{runway: '09', legs: [Leg.CA(90)]}, {runway: '27L', legs: [Leg.TF(fix)]}]});

            expect(p.runwayTransitions.map(r => [r.runwayNumber, r.runwayDesignation])).toEqual([
                [9, RunwayDesignator.RUNWAY_DESIGNATOR_NONE], [27, RunwayDesignator.RUNWAY_DESIGNATOR_LEFT],
            ]);
            expect(SidStar.isProcedureRecognized(p, p.runwayTransitions[0])).toBe(false);
            expect(SidStar.isProcedureRecognized(p, p.runwayTransitions[1])).toBe(true);
        });
    });

    describe('withProcedures', () => {
        it('copies the airport with the procedures and leaves the original alone', () => {
            const apt = airport('KPRC', 47, 8);
            const p = sid('AAA1', {common: [Leg.TF(fix)]});

            const copy = withProcedures(apt, {departures: [p]});

            expect(copy).not.toBe(apt);
            expect(copy.departures).toEqual([p]);
            expect(copy.arrivals).toEqual([]);
            expect(apt.departures).toEqual([]);
        });
    });

    describe('runwayFix', () => {
        it('is a runway facility with the ICAO the sim uses', () => {
            const apt = airport('KPRC', 47, 8, {runwayHeading: 270});

            const rw = runwayFix(apt, '27');

            expect(rw.icaoStruct).toMatchObject({type: 'R', region: '', airport: 'KPRC', ident: 'RW27'});
            expect(rw.runway.designation).toBe('27');
        });

        it('names the airport when the runway does not exist', () => {
            expect(() => runwayFix(airport('KPRC', 47, 8, {runwayHeading: 270}), '18')).toThrow('KPRC has no runway 18');
        });
    });

    describe('MemoryFacilityClient.missingProcedureFixes', () => {
        const apt = airport('KPRC', 47, 8);

        it('names a procedure fix that was not added, and is empty once it is added', () => {
            const navdata = new MemoryFacilityClient([withProcedures(apt, {
                departures: [sid('AAA1', {common: [Leg.TF(fix)]})],
            })]);

            expect(navdata.missingProcedureFixes()).toEqual(['FIXAA (W K1)']);

            navdata.add(fix);

            expect(navdata.missingProcedureFixes()).toEqual([]);
        });

        it('looks at every list of legs', () => {
            const idents = ['FIXBB', 'FIXCC', 'FIXDD', 'FIXEE', 'FIXFF', 'FIXGG'];
            const [a, b, c, d, e, f] = idents.map(i => intersection(i, 47, 8));
            const navdata = new MemoryFacilityClient([withProcedures(apt, {
                departures: [sid('AAA1', {common: [Leg.TF(f)]})],
                arrivals: [star('BBB1', {transitions: [{name: 'T', legs: [Leg.TF(a)]}], runways: [{runway: '27', legs: [Leg.TF(b)]}]})],
                approaches: [approach({
                    type: RNAV, runway: '27', transitions: [{name: 'T', legs: [Leg.IF(c)]}], final: [Leg.TF(d)], missed: [Leg.DF(e)],
                })],
            })]);

            expect(navdata.missingProcedureFixes().sort()).toEqual(idents.map(i => `${i} (W K1)`));
        });

        it('names the navaid of an arc, and ignores legs without a fix', () => {
            const navaid = vor('ARC', 47, 8);
            const end = intersection('ARCEN', 47, 8);
            const arc = Leg.AF(end, navaid, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left});
            const navdata = new MemoryFacilityClient([withProcedures(apt, {
                approaches: [approach({type: RNAV, runway: '27', final: [Leg.CA(270), arc]})],
            }), end]);

            expect(navdata.missingProcedureFixes()).toEqual(['ARC (V K1)']);
        });
    });
});
