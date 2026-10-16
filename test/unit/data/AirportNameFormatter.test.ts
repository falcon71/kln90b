import {describe, expect, it} from 'vitest';
import {AirportNameFormatter} from '../../../kln90b/data/AirportNameFormatter';

const format = (name: string) => AirportNameFormatter.format(name);

// 3-26: names too long for the display are shortened: the compass words, Point, Port, Fort, Saint and General get short
// forms, City of, Greater and The are deleted, punctuation goes, International and Regional are shortened; the first
// word stays unless it is longer than eight characters
describe('AirportNameFormatter (3-26)', () => {
    // Every word of the short-form table, in a position that is not the first, in a name too long for the display
    it.each([
        ['NORTHWEST', 'NW'], ['NORTHEAST', 'NE'], ['SOUTHWEST', 'SW'], ['SOUTHEAST', 'SE'],
        ['NORTHERN', 'N'], ['NORTH', 'N'], ['EASTERN', 'E'], ['EAST', 'E'],
        ['SOUTHERN', 'S'], ['SOUTH', 'S'], ['WESTERN', 'W'], ['WEST', 'W'],
        ['POINT', 'PT'], ['PORT', 'PT'], ['FORT', 'FT'], ['SAINT', 'ST'], ['GENERAL', 'GEN'],
        ['INTERNATIONAL', 'INT'], ['REGIONAL', 'REG'],
    ])('shortens %s to %s', (word, shortForm) => {
        expect(format(`ALPHA ${word} MUNICIPAL AIRPORT FIELD`)).toBe(`ALPHA ${shortForm} MUNICIPAL AIRPORT FIELD`);
    });

    it('shortens the listed words of a long name', () => {
        expect(format('ALPHA NORTH SAINT REGIONAL INTERNATIONAL')).toBe('ALPHA N ST REG INT');
    });

    it('keeps a first word of eight characters', () => {
        expect(format('NORTHERN COLORADO REGIONAL AIRPORT')).toBe('NORTHERN COLORADO REG AIRPORT');
    });

    it('shortens a first word of nine characters', () => {
        expect(format('SOUTHEAST TEXAS REGIONAL AIRPORT')).toBe('SE TEXAS REG AIRPORT');
    });

    it('deletes THE, also as the first word, without a blank', () => {
        expect(format('THE HARTSFIELD ATLANTA INTERNATIONAL')).toBe('HARTSFIELD ATLANTA INT');
    });

    it('deletes CITY OF and GREATER', () => {
        expect(format('CITY OF COLORADO SPRINGS MUNICIPAL')).toBe('COLORADO SPRINGS MUNICIPAL');
        expect(format('GREATER BUFFALO INTERNATIONAL')).toBe('BUFFALO INT');
    });

    it('removes punctuation', () => {
        expect(format("St. Mary's County Regional Airport")).toBe('ST MARYS COUNTY REG AIRPORT');
    });
});

// Maintainer ruling, #265: a listed word is shortened only as a whole word, and every occurrence of it is shortened.
// Figures 3-71 (WESTCHESTER) and 3-84 (NEWPORT MUN) support the first part: they show names that fit and keep a word
// that contains WEST or PORT whole. The text of 3-26 says neither.
describe('AirportNameFormatter whole words and every occurrence (maintainer ruling, #265)', () => {
    it('keeps WEST inside WESTCHESTER', () => {
        expect(format('WESTCHESTER COUNTY INTERNATIONAL AIRPORT')).toBe('WESTCHESTER COUNTY INT AIRPORT');
    });

    it('keeps PORT inside NEWPORT and AIRPORT', () => {
        expect(format('ALPHA NEWPORT MUNICIPAL AIRPORT')).toBe('ALPHA NEWPORT MUNICIPAL AIRPORT');
    });

    it('shortens PORT as a whole word next to AIRPORT', () => {
        expect(format('ALPHA PORT MUNICIPAL AIRPORT FIELD')).toBe('ALPHA PT MUNICIPAL AIRPORT FIELD');
    });

    it('shortens every occurrence of a word', () => {
        expect(format('FORT WORTH SAINT PAUL SAINT JOHN FIELD')).toBe('FORT WORTH ST PAUL ST JOHN FIELD');
    });
});

// Where 3-26 is silent: a name is too long when it does not fit APT 1's two name rows of eleven (figure 3-85), and
// then every rule applies, in the order of the formatter (delete words, then judge the first word, then shorten).
// The AVsoftech 90B trainer (an unreliable third-party trainer) showed WESTCHESTER / CO for KHPN on 2026-10-16; it is a
// characterization source only, no test asserts it.
describe('AirportNameFormatter thresholds and order of the rules (characterization)', () => {
    it('keeps a name of 22 characters whole', () => {
        expect(format('ALPHA NORTH REGIONAL X')).toBe('ALPHA NORTH REGIONAL X');
    });

    it('shortens a name of 23 characters', () => {
        expect(format('ALPHA NORTH REGIONAL XY')).toBe('ALPHA N REG XY');
    });

    it('keeps THE in a name that fits', () => {
        expect(format('THE HARTSFIELD')).toBe('THE HARTSFIELD');
    });

    it('collapses blanks in a name that fits', () => {
        expect(format('KCCC  AIRPORT')).toBe('KCCC AIRPORT');
    });

    it('judges the first word that is left after deleting THE, and leaves no blank in the middle', () => {
        expect(format('THE NORTHERN COLORADO REGIONAL AIRPORT')).toBe('NORTHERN COLORADO REG AIRPORT');
        expect(format('ALPHA THE BRAVO REGIONAL AIRPORT FIELD')).toBe('ALPHA BRAVO REG AIRPORT FIELD');
    });
});
