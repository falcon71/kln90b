import {describe, expect, it} from 'vitest';
import {getCountry, getRegionOrCountry} from '../../../kln90b/data/CountryMap';
import {FIRMAP} from '../../../kln90b/data/FirMap';
import {airport, ndb, vor} from '../../harness/navdata/builders';

// The abbreviations are those of Appendix D (D-1 states and provinces, D-1 to D-3 countries, D-3 to D-6 ARTCC/FIR).
// Which ICAO region (the first two letters of an ICAO location indicator, or the K1 to K7 regions of the US) belongs
// to which country is public ICAO data (Doc 7910); the facilities below are invented.

describe('getCountry', () => {
    it('names the country of a navaid by its ICAO region (D-1 to D-3)', () => {
        expect(getCountry(vor('ABC', 47, 8, {region: 'LS'}))).toBe('CHE');
        expect(getCountry(ndb('AB', 50, 8, {region: 'ED'}))).toBe('DEU');
        expect(getCountry(vor('ABC', 40, -100, {region: 'K3'}))).toBe('USA');
        expect(getCountry(vor('ABC', 50, -100, {region: 'CY'}))).toBe('CAN');
    });

    it('names the country of an airport by the first two letters of its ident (D-1 to D-3)', () => {
        // airports carry no region in the sim's ICAO
        expect(getCountry(airport('LSZZ', 47, 8))).toBe('CHE');
        expect(getCountry(airport('EGZZ', 51, 0))).toBe('GBR');
    });

    it('leaves three blanks for an unknown region (characterization)', () => {
        expect(getCountry(vor('ABC', 0, 0, {region: 'QQ'}))).toBe('   ');
    });

    // 3-15, figure 3-52: the Duplicate Waypoint page lists the US entries as USA. A US airport ident starts with K and
    // a letter (KAAA), whose first two letters are no region, so the page shows three blanks.
    it.fails('names a US airport USA (#NEW-1-5)', () => {
        expect(getCountry(airport('KAAA', 40, -100))).toBe('USA');
    });

    // D-1 to D-3 against the ICAO regions of the Caribbean: TD Dominica (DMA), TR Montserrat (MSR), TT Trinidad and
    // Tobago (TTO), TU British Virgin Islands (VGB), TV St. Vincent (VCT), TX Bermuda (BMU). BER is the ARTCC Bermuda
    // of D-3, not a country.
    it.fails.each([
        ['TD', 'DMA'], ['TR', 'MSR'], ['TT', 'TTO'], ['TU', 'VGB'], ['TV', 'VCT'], ['TX', 'BMU'],
    ])('names region %s %s (#NEW-1-6)', (region, country) => {
        expect(getCountry(vor('ABC', 15, -61, {region}))).toBe(country);
    });
});

describe('getRegionOrCountry', () => {
    it('gives the state or province from the city of the facility (D-1)', () => {
        expect(getRegionOrCountry({...airport('KAAA', 40, -100), city: 'Wichita, Kansas'})).toBe('KS');
        expect(getRegionOrCountry({...airport('CYZZ', 50, -100), city: 'Regina, Saskatchewan'})).toBe('SK');
        expect(getRegionOrCountry({...airport('CYZZ', 46, -71), city: 'Quebec City, Quebec'})).toBe('PQ');
    });

    it('falls back to the country when the second part of the city is no state (characterization)', () => {
        expect(getRegionOrCountry({...airport('LSZZ', 47, 8), city: 'Zurich, Switzerland'})).toBe('CHE');
        expect(getRegionOrCountry({...airport('LSZZ', 47, 8), city: 'Zurich'})).toBe('CHE');
    });
});

describe('FIRMAP', () => {
    it('abbreviates FIR names as CTR 2 shows them (D-3 to D-6)', () => {
        expect(FIRMAP['EDMM']).toBe('MUN');
        expect(FIRMAP['EDWW']).toBe('BRE');
        expect(FIRMAP['CZEG']).toBe('EDM');
        expect(FIRMAP['VTBB']).toBe('BAN');
        expect(FIRMAP['ZBPE']).toBe('BEI');
    });

    it('pads every other abbreviation to three cells (characterization)', () => {
        expect(Object.entries(FIRMAP).filter(([k, v]) => v.length !== 3 && !['KZNY', 'KZWY'].includes(k))).toEqual([]);
        expect(FIRMAP['KZFW']).toBe('FW ');
    });

    // D-3 to D-6: New York is NY. The CTR 2 row is <from>-<to> CTR in 3 + 1 + 3 cells; unpadded, NY shifts the row by a cell.
    it.fails('pads NY to three cells like FW (#NEW-1-7)', () => {
        expect(FIRMAP['KZNY']).toBe('NY ');
        expect(FIRMAP['KZWY']).toBe('NY ');
    });
});
