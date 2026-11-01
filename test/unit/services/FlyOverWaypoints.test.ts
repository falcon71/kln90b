import {describe, expect, it} from 'vitest';
import {EventBus, Facility, FacilityClient, ICAO} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {isSidStarFlyOver} from '../../../kln90b/services/FlyOverWaypoints';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {Leg, sid, star, withProcedures} from '../../harness/navdata/procedures';

// 4-2..4-3: a SID or STAR waypoint that is flown over is asked about when it is entered into a flight plan (EN ROUTE
// or SID/STAR). The guide says nothing about which entered fix counts as that waypoint; the selection (an intersection
// of the airport that a flagged leg of a departure or arrival of that airport names) is the maintainer's rule, see the
// design doc of #77, so the cases below are characterizations.
const kaaa = airport('KAAA', 47, 8);
const df1 = intersection('DF1', 47.1, 8.1, {airport: 'KAAA'});
const df2 = intersection('DF2', 47.2, 8.2, {airport: 'KAAA'});
const df3 = intersection('DF3', 47.3, 8.3, {airport: 'KAAA'});
const df4 = intersection('DF4', 47.4, 8.4, {airport: 'KAAA'});
const df1x = intersection('DF1', 47.5, 8.5, {airport: 'KAAA', region: 'K2'});
const enr1 = intersection('ENR1', 47.6, 8.6);
const df9 = intersection('DF9', 47.7, 8.7, {airport: 'KZZZ'});
// A terminal NDB of KAAA that a procedure flies over (the sim gives terminal NDBs their airport, 2026-11-01 sim check)
const terminalNdb = {...ndb('TNDB', 47.8, 8.8), icaoStruct: ICAO.value('N', 'K1', 'KAAA', 'TNDB')};
// A terminal NDB of KAAA that its procedures fly only as an ordinary fix
const ordinaryNdb = {...ndb('ONDB', 47.82, 8.82), icaoStruct: ICAO.value('N', 'K1', 'KAAA', 'ONDB')};
// An NDB without an airport that a procedure flies over
const enrouteNdb = ndb('ENDB', 47.83, 8.83);
// A VOR with an airport in its ICAO, which the sim never gives one: the rule still keeps it out
const vorWithAirport = {...vor('TVOR', 47.85, 8.85), icaoStruct: ICAO.value('V', 'K1', 'KAAA', 'TVOR')};

// DD1 of KDDD is not flown over; DD1 of KBBB, the same ident and region, is (in a procedure of KDDD)
const dd1 = intersection('DD1', 47.9, 8.9, {airport: 'KDDD'});
const dd1OfKbbb = intersection('DD1', 47.9, 8.9, {airport: 'KBBB'});
// An airport field that is only blanks, which IntPage treats as no airport
const paddedBlank = intersection('PAD1', 48.0, 9.0, {airport: '    '});

const kdddWithProcedures = withProcedures(airport('KDDD', 47, 8), {
    arrivals: [star('ARR3', {common: [Leg.TF(dd1), Leg.TF(dd1OfKbbb, 0, true)]})],
});

const kaaaWithProcedures = withProcedures(kaaa, {
    arrivals: [star('ARR1', {
        common: [Leg.TF(df1, 0, true), Leg.TF(df4), Leg.TF(enr1, 0, true)],
        transitions: [{name: 'T1', legs: [Leg.TF(df3, 0, true)]}],
    }), star('ARR2', {common: [Leg.TF(terminalNdb, 0, true), Leg.TF(ordinaryNdb)]}), star('ARR5', {common: [Leg.TF(vorWithAirport, 0, true)]})],
    departures: [sid('DEP1', {runways: [{runway: '09', legs: [Leg.TF(df2, 0, true)]}]})],
});

// KZZZ is not in the database, though DF9 is: the airport load fails
const memory = new MemoryFacilityClient([kaaaWithProcedures, kdddWithProcedures, df1, df2, df3, df4, df1x, enr1, df9]);
const loader = new KLNFacilityLoader(memory as unknown as ActualFacilityClient, KLNFacilityRepository.getRepository(new EventBus())) as unknown as FacilityClient;

const isFlyOver = (fix: Facility) => isSidStarFlyOver(fix, loader);

describe('isSidStarFlyOver', () => {
    it('true for a terminal fix flown over in a STAR common leg (characterization)', async () => {
        expect(await isFlyOver(df1)).toBe(true);
    });

    it('true for a terminal fix flown over only in a SID runway transition (characterization)', async () => {
        expect(await isFlyOver(df2)).toBe(true);
    });

    it('true for a terminal fix flown over only in an en-route transition (characterization)', async () => {
        expect(await isFlyOver(df3)).toBe(true);
    });

    it('false for a terminal fix its procedures fly only as an ordinary fix (characterization)', async () => {
        expect(await isFlyOver(df4)).toBe(false);
    });

    it('false for a fix without an airport, though a procedure flies over it (characterization)', async () => {
        expect(await isFlyOver(enr1)).toBe(false);
    });

    it('false for a fix of the same ident in another region (characterization)', async () => {
        expect(await isFlyOver(df1x)).toBe(false);
    });

    it('false when the airport is not in the database (characterization)', async () => {
        expect(await isFlyOver(df9)).toBe(false);
    });

    it('true for a terminal NDB flown over (characterization)', async () => {
        expect(await isFlyOver(terminalNdb)).toBe(true);
    });

    it('false for a terminal NDB its procedures fly only as an ordinary fix (characterization)', async () => {
        expect(await isFlyOver(ordinaryNdb)).toBe(false);
    });

    // A loader that answers every request with an airport that flies over the NDB: only the blank-airport check keeps it out
    it('false for an NDB without an airport, though a procedure flies over it (characterization)', async () => {
        const flyingOverIt = withProcedures(airport('KEEE', 47, 8), {arrivals: [star('ARR6', {common: [Leg.TF(enrouteNdb, 0, true)]})]});
        const answersAnything = {getFacility: () => Promise.resolve(flyingOverIt)} as unknown as FacilityClient;

        expect(await isSidStarFlyOver(enrouteNdb, answersAnything)).toBe(false);
    });

    it('false for a VOR whose ICAO names an airport, though a procedure flies over it (characterization)', async () => {
        expect(await isFlyOver(vorWithAirport)).toBe(false);
    });

    // A loader that answers every request with KAAA: only the rule itself keeps a fix without an airport out
    it('does not look a fix without an airport up in an airport (characterization)', async () => {
        const answersAnything = {getFacility: () => Promise.resolve(kaaaWithProcedures)} as unknown as FacilityClient;

        expect(await isSidStarFlyOver(enr1, answersAnything)).toBe(false);
    });

    it('false when only a fix of the same ident and region at another airport is flown over (characterization)', async () => {
        expect(await isFlyOver(dd1)).toBe(false);
    });

    // A loader that answers every request with an airport that flies over the padded fix: only the trimmed blank check
    // keeps it out
    it('treats an airport field of only blanks as no airport (characterization)', async () => {
        const flyingOverIt = withProcedures(airport('KEEE', 47, 8), {arrivals: [star('ARR4', {common: [Leg.TF(paddedBlank, 0, true)]})]});
        const answersAnything = {getFacility: () => Promise.resolve(flyingOverIt)} as unknown as FacilityClient;

        expect(await isSidStarFlyOver(paddedBlank, answersAnything)).toBe(false);
    });
});
