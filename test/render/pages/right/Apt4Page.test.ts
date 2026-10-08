import {describe, expect, it} from 'vitest';
import {AirportFacility, FacilityFrequency, FacilityFrequencyType, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, savedUserWaypoints} from '../../../harness/storage';

/** A frequency as the sim's facility record carries it; airport() has no frequencies option, so the tests add them */
function freq(type: FacilityFrequencyType, freqMHz: number): FacilityFrequency {
    return {name: '', icao: '', icaoStruct: ICAO.emptyValue(), freqMHz, freqBCD16: 0, type};
}

/** KAAA with the given frequencies, in the order the database holds them */
function withFreqs(...frequencies: FacilityFrequency[]): AirportFacility {
    return {...airport('KAAA', 47.1, 8.0), frequencies} as AirportFacility;
}

const FIVE = [
    freq(FacilityFrequencyType.ATIS, 125.55),
    freq(FacilityFrequencyType.Clearance, 119.85),
    freq(FacilityFrequencyType.Ground, 121.75),
    freq(FacilityFrequencyType.Tower, 118.35),
    freq(FacilityFrequencyType.CTAF, 118.35),
];

/** The V1 ICAO string of KAAA, as the unit stores the last active waypoint (setting activeWaypoint) */
const KAAA_V1 = 'A      KAAA ';

describe('APT 4 page (characterization)', () => {
    it('shows the frequencies of an airport', async () => {
        const unit = await bootUnit({facilities: [withFreqs(...FIVE, freq(FacilityFrequencyType.Approach, 124.45))]});
        await unit.panel.selectPage('R', 'APT 4');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            " KAAA      ",
            "ATIS 125.55",
            "CLR  119.85",
            "GRND 121.75",
            "TWR  118.35",
            "CTAF 118.35",
          ]
        `);
        expect(Screen.read().maskRows('R')).toMatchInlineSnapshot(`
          [
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
          ]
        `);
    });

    // The text is held by the spec test below; this pins the code's split into three rows
    it('splits the note for an airport without frequencies over three rows', async () => {
        const unit = await bootUnit({facilities: [withFreqs()]});
        await unit.panel.selectPage('R', 'APT 4');

        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            " KAAA      ",
            "           ",
            " COMM FREQ ",
            " DATA NOT  ",
            " AVAILABLE ",
            "           ",
          ]
        `);
    });

    // The guide's list of types has no entry for the sim's FSS and remote clearance (GCO) types; the labels are the code's
    it.each([
        ['FSS', FacilityFrequencyType.FSS, 'AFIS 122.20'],
        ['GCO', FacilityFrequencyType.GCO, 'CLR  122.20'],
    ])('labels the sim frequency type %s as the code chooses', async (_name, type, row) => {
        const unit = await bootUnit({facilities: [withFreqs(freq(type, 122.2))]});
        await unit.panel.selectPage('R', 'APT 4');

        expect(Screen.read().rows('R')[1]).toBe(row);
    });
});

describe('APT 4 page', () => {
    // 3-45, figure 3-138: one frequency per row, the type in four cells, a blank where a part-time frequency has its
    // asterisk (the sim has no part-time flag), the frequency in MHz with two decimals
    it('lists one frequency per row with its type (3-45)', async () => {
        const unit = await bootUnit({facilities: [withFreqs(...FIVE)]});
        await unit.panel.selectPage('R', 'APT 4');

        expect(Screen.read().rows('R')).toEqual([
            ' KAAA      ',
            'ATIS 125.55',
            'CLR  119.85',
            'GRND 121.75',
            'TWR  118.35',
            'CTAF 118.35',
        ]);
        expect(Screen.read().status().right).toBe('APT 4');
    });

    // 3-9, 3-10, figures 3-33 and 3-34, 3-45: an airport with more frequencies than one page holds has APT+4, and the
    // further APT 4 page lists the rest
    it('continues on a second APT 4 page after five frequencies (3-9, 3-45)', async () => {
        const unit = await bootUnit({
            facilities: [withFreqs(...FIVE, freq(FacilityFrequencyType.Approach, 124.45), freq(FacilityFrequencyType.Departure, 126.65))],
        });
        await unit.panel.selectPage('R', 'APT 4');
        expect(Screen.read().status().right).toBe('APT+4');
        expect(Screen.read().rows('R')[5]).toBe('CTAF 118.35');

        await unit.panel.inner('R', 1);

        expect(Screen.read().status().right).toBe('APT+4');
        expect(Screen.read().rows('R')).toEqual([
            ' KAAA      ',
            'APR  124.45',
            'DEP  126.65',
            '           ',
            '           ',
            '           ',
        ]);

        await unit.panel.inner('R', 1);
        expect(Screen.read().status().right).toBe('APT 5');
    });

    // 3-45: the abbreviations of the frequency types that have a counterpart among the sim's types
    it.each([
        ['ATIS', FacilityFrequencyType.ATIS, 'ATIS'],
        ['CPT', FacilityFrequencyType.CPT, 'PTAX'],
        ['Clearance', FacilityFrequencyType.Clearance, 'CLR '],
        ['Ground', FacilityFrequencyType.Ground, 'GRND'],
        ['Tower', FacilityFrequencyType.Tower, 'TWR '],
        ['Unicom', FacilityFrequencyType.Unicom, 'UNIC'],
        ['Multicom', FacilityFrequencyType.Multicom, 'MCOM'],
        ['CTAF', FacilityFrequencyType.CTAF, 'CTAF'],
        ['Approach', FacilityFrequencyType.Approach, 'APR '],
        ['Departure', FacilityFrequencyType.Departure, 'DEP '],
        ['Center', FacilityFrequencyType.Center, 'CTR '],
        ['ASOS', FacilityFrequencyType.ASOS, 'ASOS'],
        ['AWOS', FacilityFrequencyType.AWOS, 'AWOS'],
    ])('labels the frequency type %s with its abbreviation (3-45)', async (_name, type, label) => {
        const unit = await bootUnit({facilities: [withFreqs(freq(type, 122.2))]});
        await unit.panel.selectPage('R', 'APT 4');

        expect(Screen.read().rows('R')[1]).toBe(`${label} 122.20`);
    });

    // 3-46: an airport without communication data shows that the data is not available
    it('says that no frequency data is available for an airport without frequencies (3-46)', async () => {
        const unit = await bootUnit({facilities: [withFreqs()]});
        await unit.panel.selectPage('R', 'APT 4');

        const text = Screen.read().rows('R').slice(1).join(' ').replace(/ +/g, ' ').trim();
        expect(text).toBe('COMM FREQ DATA NOT AVAILABLE');
        expect(Screen.read().status().right).toBe('APT 4');
    });

    // 5-16: a user airport cannot store frequencies, so its APT 4 page has none (3-46 gives the text)
    it('shows no frequencies for a user airport (5-16, 3-46)', async () => {
        const unit = await bootUnit({storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0}])});
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'UAPT');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'APT 4');

        const rows = Screen.read().rows('R');
        expect(rows[0]).toBe(' UAPT      ');
        expect(rows.slice(1).join(' ').replace(/ +/g, ' ').trim()).toBe('COMM FREQ DATA NOT AVAILABLE');
    });

    // 3-45: HF frequencies (2000 kHz to 30000 kHz) are shown in kHz without a decimal point, 6547 for 6547 kHz
    it.fails('shows an HF frequency in kHz without a decimal point (3-45, #NEW-1-4)', async () => {
        const unit = await bootUnit({facilities: [withFreqs(freq(FacilityFrequencyType.Center, 6.547))]});
        await unit.panel.selectPage('R', 'APT 4');

        expect(Screen.read().rows('R')[1].trim()).toMatch(/^CTR +6547$/);
    });

    // 3-45, the sibling of the pin: the same HF frequency is listed with its type, so the pin fails on the format only
    it('lists an HF frequency with its type (3-45)', async () => {
        const unit = await bootUnit({facilities: [withFreqs(freq(FacilityFrequencyType.Center, 6.547))]});
        await unit.panel.selectPage('R', 'APT 4');

        expect(Screen.read().rows('R')[1].slice(0, 4)).toBe('CTR ');
    });
});

describe('APT 4 page after power-on', () => {
    // 3-8, figure 3-26: when the last active waypoint was an airport, the right side shows its APT 4 page, with the
    // arrow when the airport is still the active waypoint (3-45). FPL 0 KBBB to KAAA makes KAAA active.
    it('shows the frequencies of the last active airport on APT 4 (3-8, 3-45)', async () => {
        const kbbb = airport('KBBB', 47.3, 8.0);
        const unit = await bootUnit({
            facilities: [withFreqs(freq(FacilityFrequencyType.Unicom, 122.8)), kbbb],
            storage: {activeWaypoint: KAAA_V1, ...savedFlightplan(0, [kbbb, withFreqs()])},
        });
        await settle(unit);

        expect(Screen.read().status().right).toBe('APT 4');
        expect(Screen.read().rows('R').slice(0, 2)).toEqual(['›KAAA      ', 'UNIC 122.80']);
    });
});
