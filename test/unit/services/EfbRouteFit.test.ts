import {describe, expect, it} from 'vitest';
import {KLNFlightplanLeg, KLNLegType} from '../../../kln90b/data/flightplan/Flightplan';
import {EfbSegment, fitEfbRoute} from '../../../kln90b/services/EfbRouteFit';
import {intersection} from '../../harness/navdata/builders';
import {identsOf} from '../../harness/readers';

const leg = (ident: string, type: KLNLegType): KLNFlightplanLeg => ({wpt: intersection(ident, 47, 8), type});

/** Fixes the unit takes leg by leg: the departure airport and the en-route fixes */
const user = (...idents: string[]): EfbSegment => ({kind: 'user', legs: idents.map(i => leg(i, KLNLegType.USER))});

/** A SID, STAR or approach, taken whole or not at all */
const proc = (type: KLNLegType, ...idents: string[]): EfbSegment => ({kind: 'procedure', legs: idents.map(i => leg(i, type))});

const invalid = (...idents: string[]): EfbSegment => ({kind: 'invalid', idents});
const missing = (ident: string): EfbSegment => ({kind: 'missing', ident});

/** fixes('W', 3) is W01, W02, W03 */
const fixes = (prefix: string, n: number): string[] => Array.from({length: n}, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);

const dest = (ident: string): KLNFlightplanLeg => leg(ident, KLNLegType.USER);

describe('fitEfbRoute', () => {
    // §4 of docs/superpowers/specs/2026-10-24-efb-route-import-design.md
    it('loads a route that fits whole', () => {
        const result = fitEfbRoute({segments: [user('KAAA', 'A', 'B', 'C')], destination: dest('KBBB')});

        expect(identsOf(result.legs)).toEqual(['KAAA', 'A', 'B', 'C', 'KBBB']);
        expect(result.deleted).toEqual([]);
    });

    // 4-1: 30 en-route waypoints. The destination keeps its place, whatever comes before it
    it('cuts the en-route part and keeps the destination (#195)', () => {
        const result = fitEfbRoute({segments: [user('KAAA', ...fixes('W', 30))], destination: dest('KBBB')});

        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('W', 28), 'KBBB']);
        expect(result.deleted).toEqual(['W29', 'W30']);
    });

    it('cuts at the 30th en-route leg without a destination', () => {
        const result = fitEfbRoute({segments: [user(...fixes('W', 31))], destination: null});

        expect(identsOf(result.legs)).toEqual(fixes('W', 30));
        expect(result.deleted).toEqual(['W31']);
    });

    // #221: 45 legs in all for FPL 0, 30 of them en route
    it('fills FPL 0 to exactly 45 legs', () => {
        const result = fitEfbRoute({
            segments: [user('KAAA'), proc(KLNLegType.SID, ...fixes('S', 15)), user(...fixes('W', 28))],
            destination: dest('KBBB'),
        });

        expect(result.legs.length).toBe(45);
        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('S', 15), ...fixes('W', 28), 'KBBB']);
        expect(result.deleted).toEqual([]);
    });

    it('drops a procedure that does not fit whole and everything after it, but keeps the destination (#378)', () => {
        const result = fitEfbRoute({
            segments: [
                user('KAAA'),
                proc(KLNLegType.SID, ...fixes('S', 10)),
                user(...fixes('W', 27)),
                proc(KLNLegType.STAR, ...fixes('T', 8)),
                proc(KLNLegType.APP, 'P01', 'P02'), // would fit alone, but the STAR did not: no gap
            ],
            destination: dest('KBBB'),
        });

        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('S', 10), ...fixes('W', 27), 'KBBB']);
        expect(result.deleted).toEqual([...fixes('T', 8), 'P01', 'P02']);
    });

    it('skips an invalid procedure and goes on loading (#378)', () => {
        const result = fitEfbRoute({
            segments: [user('KAAA'), invalid('S1', 'S2'), user('A'), proc(KLNLegType.STAR, 'T1')],
            destination: dest('KBBB'),
        });

        expect(identsOf(result.legs)).toEqual(['KAAA', 'A', 'T1', 'KBBB']);
        expect(result.deleted).toEqual(['S1', 'S2']);
    });

    it('reports a missing fix without cutting', () => {
        const result = fitEfbRoute({segments: [user('A'), missing('ZZZ'), user('B')], destination: dest('KBBB')});

        expect(identsOf(result.legs)).toEqual(['A', 'B', 'KBBB']);
        expect(result.deleted).toEqual(['ZZZ']);
    });

    it('reports everything after a cut in route order', () => {
        const result = fitEfbRoute({
            segments: [user('KAAA', ...fixes('W', 29)), missing('ZZZ'), invalid('T1')],
            destination: dest('KBBB'),
        });

        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('W', 28), 'KBBB']);
        expect(result.deleted).toEqual(['W29', 'ZZZ', 'T1']);
    });

    // The destination's total leg is reserved: the legs before it may fill FPL 0 up to 44, not 45
    it('takes a procedure that ends exactly one leg before the 45-leg limit', () => {
        const result = fitEfbRoute({
            segments: [user('KAAA', ...fixes('W', 28)), proc(KLNLegType.STAR, ...fixes('T', 15))],
            destination: dest('KBBB'),
        });

        expect(result.legs.length).toBe(45);
        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('W', 28), ...fixes('T', 15), 'KBBB']);
        expect(result.deleted).toEqual([]);
    });

    it('drops a procedure that would end on the 45th leg, because the destination needs it', () => {
        const result = fitEfbRoute({
            segments: [user('KAAA', ...fixes('W', 28)), proc(KLNLegType.STAR, ...fixes('T', 16))],
            destination: dest('KBBB'),
        });

        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('W', 28), 'KBBB']);
        expect(result.deleted).toEqual(fixes('T', 16));
    });

    it('drops a procedure that fits the total after the en-route part was cut', () => {
        const result = fitEfbRoute({
            segments: [user('KAAA', ...fixes('W', 30)), proc(KLNLegType.STAR, 'T01', 'T02')],
            destination: dest('KBBB'),
        });

        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('W', 28), 'KBBB']);
        expect(result.deleted).toEqual(['W29', 'W30', 'T01', 'T02']);
    });

    it('drops an en-route fix that would fit after a procedure did not', () => {
        const result = fitEfbRoute({
            segments: [
                user('KAAA'),
                proc(KLNLegType.SID, ...fixes('S', 10)),
                user(...fixes('W', 27)),
                proc(KLNLegType.STAR, ...fixes('T', 8)),
                user('X01'), // 38 legs and 28 en route so far: there is room for one more
            ],
            destination: dest('KBBB'),
        });

        expect(identsOf(result.legs)).toEqual(['KAAA', ...fixes('S', 10), ...fixes('W', 27), 'KBBB']);
        expect(result.deleted).toEqual([...fixes('T', 8), 'X01']);
    });

    it('keeps the procedure leg types', () => {
        const result = fitEfbRoute({
            segments: [user('KAAA'), proc(KLNLegType.SID, ...fixes('S', 15)), user(...fixes('W', 28))],
            destination: dest('KBBB'),
        });

        const types = result.legs.map(l => l.type);
        expect(types[0]).toBe(KLNLegType.USER);
        expect(types.slice(1, 16)).toEqual(Array(15).fill(KLNLegType.SID));
        expect(types.slice(16)).toEqual(Array(29).fill(KLNLegType.USER));
    });
});
