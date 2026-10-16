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

    it('names the country of an airport by its region (D-1 to D-3)', () => {
        expect(getCountry(airport('LSZZ', 47, 8, {region: 'LS'}))).toBe('CHE');
        expect(getCountry(airport('EGZZ', 51, 0, {region: 'EG'}))).toBe('GBR');
    });

    // 3-15: each entry carries its country. The sim fills the region of every facility, airports too, so the region
    // decides and not the ident (the maintainer's examples, #342). MT is the ident prefix of Haiti (HTI), but the
    // region is K1
    it('names the country of an airport by its region (3-15, #342)', () => {
        expect(getCountry(airport('93F', 40, -100, {region: 'K4'}))).toBe('USA');
        expect(getCountry(airport('ETAR', 49.4, 7.6, {region: 'ED'}))).toBe('DEU');
        expect(getCountry(airport('MT99', 46.5, -110, {region: 'K1'}))).toBe('USA');
    });

    // The sim leaves the region of some airports empty (KIG in the maintainer's comment on #342). The characterization
    // is the three blanks of an empty region. LSZZ has the first two letters of a real region (LS), so an ident fallback
    // would give CHE here and fail the assertion
    it('leaves three blanks for an airport with an empty region (characterization, #342)', () => {
        expect(getCountry(airport('KIG', -5, 145, {region: ''}))).toBe('   ');
        expect(getCountry(airport('LSZZ', 47, 8, {region: ''}))).toBe('   ');
    });

    // User airports carry the region XX, which names no country (maintainer ruling, #342)
    it('leaves three blanks for a user airport (maintainer ruling, #342)', () => {
        expect(getCountry(airport('FARM', 47, 8, {region: 'XX'}))).toBe('   ');
    });

    it('leaves three blanks for an unknown region (characterization)', () => {
        expect(getCountry(vor('ABC', 0, 0, {region: 'QQ'}))).toBe('   ');
    });

    // 3-15, figure 3-52: the Duplicate Waypoint page lists the US entries as USA. The US regions K1 to K7 name the
    // country (#168)
    it('names a US airport USA (#168)', () => {
        expect(getCountry(airport('KAAA', 40, -100, {region: 'K1'}))).toBe('USA');
        expect(getCountry(airport('KZZZ', 40, -100, {region: 'K1'}))).toBe('USA');
    });

    // 3-15: each entry carries its country. LKPR (Czech Republic) has a K in second place, and PA, the region of
    // Alaska's airports, gives USA (#168)
    it('names the country of an airport by its region (3-15, #168)', () => {
        expect(getCountry(airport('LKAA', 50, 14, {region: 'LK'}))).toBe('CZE');
        expect(getCountry(airport('PAAA', 61, -150, {region: 'PA'}))).toBe('USA');
    });

    // Characterization (#168, #342): the region decides even for an ident that starts with K. The four-character ident
    // KAAA is invented here, in the region LK
    it('takes the country from the region when the ident starts with K (characterization, #168)', () => {
        expect(getCountry(airport('KAAA', 50, 14, {region: 'LK'}))).toBe('CZE');
    });

    // 3-15, figure 3-52: every entry of the Duplicate Waypoint page carries its country. US airports with a
    // three-character ident (B19 and K00 are airports of the database in the guide's examples) take the country of
    // their region
    it('names a US airport with a three-character ident USA (3-15, #342)', () => {
        expect(getCountry(airport('B19', 40, -100, {region: 'K6'}))).toBe('USA');
        expect(getCountry(airport('K00', 40, -100, {region: 'K6'}))).toBe('USA');
    });

    // D-1 to D-3 against the ICAO regions of the Caribbean: TD Dominica (DMA), TR Montserrat (MSR), TT Trinidad and
    // Tobago (TTO), TU British Virgin Islands (VGB), TV St. Vincent (VCT), TX Bermuda (BMU). BER is the ARTCC Bermuda
    // of D-3, not a country.
    it.each([
        ['TD', 'DMA'], ['TR', 'MSR'], ['TT', 'TTO'], ['TU', 'VGB'], ['TV', 'VCT'], ['TX', 'BMU'],
    ])('names region %s %s (#169)', (region, country) => {
        expect(getCountry(vor('ABC', 15, -61, {region}))).toBe(country);
    });

    // The regions next to the six above keep their countries: TA Antigua and Barbuda (ATG), TB Barbados (BRB), TG Grenada
    // (GRD), TL St. Lucia (LCA), TQ Anguilla (AIA)
    it.each([
        ['TA', 'ATG'], ['TB', 'BRB'], ['TG', 'GRD'], ['TL', 'LCA'], ['TQ', 'AIA'],
    ])('keeps region %s %s (D-1 to D-3, #169)', (region, country) => {
        expect(getCountry(vor('ABC', 15, -61, {region}))).toBe(country);
    });
});

describe('getRegionOrCountry', () => {
    it('gives the state or province from the city of the facility (D-1)', () => {
        expect(getRegionOrCountry({...airport('KAAA', 40, -100), city: 'Wichita, Kansas'})).toBe('KS');
        expect(getRegionOrCountry({...airport('CYZZ', 50, -100), city: 'Regina, Saskatchewan'})).toBe('SK');
        expect(getRegionOrCountry({...airport('CYZZ', 46, -71), city: 'Quebec City, Quebec'})).toBe('PQ');
    });

    // 3-15 and APT 2 take the country when there is no state: an airport in a US region (K1 to K7) whose city names no
    // known state is in the USA
    it('falls back to USA for a US-region airport whose city has no known state (#168)', () => {
        expect(getRegionOrCountry({...airport('KAAA', 40, -100, {region: 'K1'}), city: 'Wichita'})).toBe('USA');
        expect(getRegionOrCountry({...airport('KAAA', 40, -100, {region: 'K1'}), city: 'Wichita, Nowhere'})).toBe('USA');
    });

    it('falls back to the country when the second part of the city is no state (characterization)', () => {
        expect(getRegionOrCountry({...airport('LSZZ', 47, 8, {region: 'LS'}), city: 'Zurich, Switzerland'})).toBe('CHE');
        expect(getRegionOrCountry({...airport('LSZZ', 47, 8, {region: 'LS'}), city: 'Zurich'})).toBe('CHE');
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

    it('pads every abbreviation to three cells (characterization)', () => {
        expect(Object.entries(FIRMAP).filter(([, v]) => v.length !== 3)).toEqual([]);
        expect(FIRMAP['KZFW']).toBe('FW ');
    });

    // D-3 to D-6: New York is NY. The CTR 2 row is <from>-<to> CTR in 3 + 1 + 3 cells; unpadded, NY shifts the row by a cell.
    it('pads NY to three cells like FW (#170)', () => {
        expect(FIRMAP['KZNY']).toBe('NY ');
        expect(FIRMAP['KZWY']).toBe('NY ');
    });
});
