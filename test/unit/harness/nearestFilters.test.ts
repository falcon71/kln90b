import {describe, expect, it} from 'vitest';
import {AirportClassMask, BitFlags, FacilitySearchType, RunwaySurfaceType, UnitType, VorClass, VorType} from '@microsoft/msfs-sdk';
import {airport, vor} from '../../harness/navdata/builders';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';

const nm = (n: number) => UnitType.NMILE.convertTo(n, UnitType.METER);
const ft = (n: number) => UnitType.FOOT.convertTo(n, UnitType.METER);
const flags = (...values: number[]) => BitFlags.union(...values.map(v => BitFlags.createFlag(v)));
const idents = (list: readonly any[]) => list.map(i => i.ident);

const HARD = flags(RunwaySurfaceType.Asphalt, RunwaySurfaceType.Concrete);
const ANY_SURFACE = ~0;
const BOTH_CLASSES = AirportClassMask.HardSurface | AirportClassMask.SoftSurface;
const TOWERED_OR_NOT = 3;

async function airportSession(...airports: ReturnType<typeof airport>[]) {
    const client = new MemoryFacilityClient(airports);
    return await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport);
}

async function vorSession(...vors: ReturnType<typeof vor>[]) {
    const client = new MemoryFacilityClient(vors);
    return await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
}

describe('MemoryFacilityClient airport filters', () => {
    const heliport = airport('HELI', 47.0, 8.0, {runways: []});
    const paved = airport('PAVD', 47.1, 8.0);

    it('returns an airport without runways until the class mask hides it', async () => {
        const session = await airportSession(heliport, paved);

        const unfiltered = await session.searchNearest(47.0, 8.0, nm(50), 10);
        session.setAirportFilter(false, BOTH_CLASSES);
        const filtered = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(unfiltered.added)).toEqual(['HELI', 'PAVD']);
        expect(idents(filtered.removed)).toEqual(['HELI']);
        expect(idents(filtered.added)).toEqual([]);
    });

    // The sim developers' rule: with no runways, the runway length and surface filters do not apply
    it('lets an airport without runways pass the extended filter', async () => {
        const session = await airportSession(heliport, paved);
        session.setExtendedAirportFilters(HARD, 0, TOWERED_OR_NOT, ft(1000));

        const result = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(result.added)).toEqual(['HELI', 'PAVD']);
    });

    it('drops an airport whose only runway is shorter than the minimum length', async () => {
        const session = await airportSession(airport('SHRT', 47.0, 8.0, {runwayLengthFt: 900}), airport('LONG', 47.1, 8.0, {runwayLengthFt: 1100}));
        session.setExtendedAirportFilters(ANY_SURFACE, 0, TOWERED_OR_NOT, ft(1000));

        const result = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(result.added)).toEqual(['LONG']);
    });

    it('needs one runway that meets the length and the surface filter together', async () => {
        // The long runway is grass and the paved one is short: no single runway passes both
        const split = airport('SPLT', 47.0, 8.0, {runways: [{lengthFt: 800, surface: RunwaySurfaceType.Asphalt}, {lengthFt: 4000, surface: RunwaySurfaceType.Grass}]});
        const whole = airport('WHOL', 47.1, 8.0, {runways: [{lengthFt: 800, surface: RunwaySurfaceType.Grass}, {lengthFt: 4000, surface: RunwaySurfaceType.Asphalt}]});
        const session = await airportSession(split, whole);
        session.setExtendedAirportFilters(HARD, 0, TOWERED_OR_NOT, ft(1000));

        const result = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(result.added)).toEqual(['WHOL']);
    });

    it('drops an airport with only a soft runway when only hard surfaces are allowed', async () => {
        const session = await airportSession(airport('GRAS', 47.0, 8.0, {surface: RunwaySurfaceType.Grass}), paved);
        session.setExtendedAirportFilters(HARD, 0, TOWERED_OR_NOT, 0);

        const result = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(result.added)).toEqual(['PAVD']);
    });

    it('filters by the towered mask: 1 is untowered, 2 is towered', async () => {
        const session = await airportSession(airport('TWRD', 47.0, 8.0, {towered: true}), airport('OPEN', 47.1, 8.0));

        session.setExtendedAirportFilters(ANY_SURFACE, 0, 2, 0);
        const toweredOnly = await session.searchNearest(47.0, 8.0, nm(50), 10);
        session.setExtendedAirportFilters(ANY_SURFACE, 0, 1, 0);
        const untoweredOnly = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(toweredOnly.added)).toEqual(['TWRD']);
        expect(idents(untoweredOnly.added)).toEqual(['OPEN']);
        expect(idents(untoweredOnly.removed)).toEqual(['TWRD']);
    });

    it('applies the filter before maxItems, so a hidden near airport takes no slot', async () => {
        const paved9 = Array.from({length: 9}, (_, i) => airport(`P${i}`, 47.1 + i * 0.1, 8.0));
        const session = await airportSession(airport('HELI', 47.0, 8.0, {runways: []}), ...paved9);
        session.setAirportFilter(false, BOTH_CLASSES);

        const result = await session.searchNearest(47.0, 8.0, nm(100), 9);

        expect(idents(result.added)).toEqual(paved9.map(a => a.icaoStruct.ident));
    });

    it('reports an airport hidden by a new filter as removed at the next search', async () => {
        const session = await airportSession(heliport, paved);
        const first = await session.searchNearest(47.0, 8.0, nm(50), 10);
        session.setAirportFilter(false, AirportClassMask.HardSurface);

        const second = await session.searchNearest(47.0, 8.0, nm(50), 10);
        const third = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(first.added)).toEqual(['HELI', 'PAVD']);
        expect([idents(second.added), idents(second.removed)]).toEqual([[], ['HELI']]);
        expect([idents(third.added), idents(third.removed)]).toEqual([[], []]);
    });

    it('keeps the filter per session', async () => {
        const client = new MemoryFacilityClient([heliport, paved]);
        const filtered = await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport);
        const plain = await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport);
        filtered.setAirportFilter(false, AirportClassMask.HardSurface);

        const a = await filtered.searchNearest(47.0, 8.0, nm(50), 10);
        const b = await plain.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(a.added)).toEqual(['PAVD']);
        expect(idents(b.added)).toEqual(['HELI', 'PAVD']);
    });

    it('derives the airport class from the runways unless one is given', () => {
        expect(heliport.airportClass).toBe(4);
        expect(paved.airportClass).toBe(1);
        expect(airport('GRAS', 47, 8, {surface: RunwaySurfaceType.Grass}).airportClass).toBe(2);
        expect(airport('PRIV', 47, 8, {airportClass: 5}).airportClass).toBe(5);
    });
});

describe('MemoryFacilityClient VOR filters', () => {
    const highAlt = vor('HIGH', 47.0, 8.1);
    const terminal = vor('TERM', 47.0, 8.2, {vorClass: VorClass.Terminal});
    const nearTerminal = vor('NEAR', 47.0, 8.02, {vorClass: VorClass.Terminal});
    const dme = vor('DMEO', 47.0, 8.3, {type: VorType.DME});

    it('drops a terminal VOR unless the class mask has Terminal', async () => {
        const session = await vorSession(highAlt, terminal);

        session.setVorFilter(flags(VorClass.HighAlt, VorClass.LowAlt), ~0);
        const without = await session.searchNearest(47.0, 8.0, nm(50), 10);
        session.setVorFilter(flags(VorClass.HighAlt, VorClass.LowAlt, VorClass.Terminal), ~0);
        const withTerminal = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(without.added)).toEqual(['HIGH']);
        expect([idents(withTerminal.added), idents(withTerminal.removed)]).toEqual([['TERM'], []]);
    });

    it('drops a DME-only facility unless the type mask has DME', async () => {
        const session = await vorSession(highAlt, dme);

        session.setVorFilter(~0, flags(VorType.VOR, VorType.VORDME, VorType.VORTAC));
        const vorsOnly = await session.searchNearest(47.0, 8.0, nm(50), 10);
        session.setVorFilter(~0, flags(VorType.VOR, VorType.VORDME, VorType.VORTAC, VorType.DME));
        const withDme = await session.searchNearest(47.0, 8.0, nm(50), 10);

        expect(idents(vorsOnly.added)).toEqual(['HIGH']);
        expect(idents(withDme.added)).toEqual(['DMEO']);
    });

    it('applies the VOR filter before maxItems', async () => {
        const session = await vorSession(nearTerminal, highAlt);
        session.setVorFilter(flags(VorClass.HighAlt), ~0);

        const result = await session.searchNearest(47.0, 8.0, nm(50), 1);

        expect(idents(result.added)).toEqual(['HIGH']);
    });
});
