import {describe, expect, it} from 'vitest';
import {Facility, FacilityClient} from '@microsoft/msfs-sdk';
import {getUniqueIdent, getUniqueIdentWithNumbers} from '../../../../kln90b/data/navdata/UniqueIdentGenerator';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {buildIcaoStruct, TEMPORARY_WAYPOINT} from '../../../../kln90b/data/navdata/IcaoBuilder';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';

// The callers pass the KLNFacilityLoader, which merges the user waypoints; the memory client stands in for it.
const memory = (facilities: Facility[]) => new MemoryFacilityClient(facilities) as unknown as FacilityClient;

/** A supplementary (USR) waypoint in the temporary region, as the REF page files its reference waypoints */
const userWaypoint = (ident: string, lat: number, lon: number): Facility =>
    ({...intersection(ident, lat, lon, {region: TEMPORARY_WAYPOINT}), icaoStruct: buildIcaoStruct('U', TEMPORARY_WAYPOINT, ident)});

describe('getUniqueIdent (REF and EFB waypoint names)', () => {
    it('appends the first free letter to the ident (5-22)', async () => {
        // 5-22: TXK becomes TXKA, and a second reference waypoint from TXK becomes TXKB
        const client = memory([vor('ABC', 47, 8)]);
        expect(await getUniqueIdent('ABC', client)).toBe('ABCA');
        const withA = memory([vor('ABC', 47, 8), intersection('ABCA', 47.1, 8)]);
        expect(await getUniqueIdent('ABC', withA)).toBe('ABCB');
    });

    it('counts every facility type that starts with the ident, not only the type of the source (characterization)', async () => {
        // The user waypoint is the real case: a reference waypoint is stored as a USR waypoint in region XY, and the
        // next reference waypoint from the same source must see it.
        const client = memory([
            vor('ABC', 47, 8),
            airport('ABCA', 47.2, 8),
            intersection('ABCB', 47.1, 8),
            ndb('ABCC', 47.3, 8),
            userWaypoint('ABCD', 47.4, 8),
        ]);
        expect(await getUniqueIdent('ABC', client)).toBe('ABCE');
    });

    it('keeps the first four characters of a longer ident (5-22)', async () => {
        // 5-22: the fifth character is dropped. ABCDE with ABCD taken gives ABCDA.
        const client = memory([intersection('ABCDE', 47, 8), intersection('ABCD', 47.1, 8)]);
        expect(await getUniqueIdent('ABCDE', client)).toBe('ABCDA');
    });

    it('uses the ident itself when nobody has it (characterization: the EFB import names CUST, then CUSTA)', async () => {
        expect(await getUniqueIdent('CUST', memory([]))).toBe('CUST');
    });

    it('gives null when all 27 names are taken (characterization)', async () => {
        const taken = ['', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((s, i) => intersection('QQQ' + s, 40 + i / 100, 8));
        expect(await getUniqueIdent('QQQ', memory(taken))).toBeNull();
    });

    it('gives the last letter when it is the only name left (characterization)', async () => {
        const taken = ['', ...'ABCDEFGHIJKLMNOPQRSTUVWXY'].map((s, i) => intersection('QQQ' + s, 40 + i / 100, 8));
        expect(await getUniqueIdent('QQQ', memory(taken))).toBe('QQQZ');
    });
});

describe('getUniqueIdentWithNumbers (CTR waypoint names)', () => {
    it('appends the first free two-digit number to the VOR ident (5-26)', async () => {
        // 5-26: a Center waypoint is named after the nearest VOR plus the first free number, PVW00
        expect(await getUniqueIdentWithNumbers('ABC', memory([vor('ABC', 47, 8)]))).toBe('ABC00');
        const taken = memory([vor('ABC', 47, 8), intersection('ABC00', 47.1, 8), intersection('ABC01', 47.2, 8)]);
        expect(await getUniqueIdentWithNumbers('ABC', taken)).toBe('ABC02');
    });

    it('counts on past 09 (characterization)', async () => {
        const taken = Array.from({length: 10}, (_, i) => intersection('ABC' + String(i).padStart(2, '0'), 40 + i / 100, 8));
        expect(await getUniqueIdentWithNumbers('ABC', memory(taken))).toBe('ABC10');
    });
});
