import {describe, expect, it, vi} from 'vitest';
import {AirportFacility, GpsBoolean} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {approach} from '../../../harness/navdata/procedures';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints, storedSetting} from '../../../harness/storage';
import {answerTimezone} from '../../../harness/timezone';

describe('APT 2 page', () => {
    // 3-43: the elevation is shown in feet, rounded to 10 ft. The database holds meters (1234 ft are 376.2 m)
    it('shows the elevation in feet, rounded to 10 (#35)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 8.0, {elevationFt: 1234})]});
        await unit.panel.selectPage('R', 'APT 2');

        const rows = Screen.read().rows('R');

        expect(rows[3]).toBe('ELV  1230ft');
    });
});

// The 0-based UTC months in which a northern and a southern zone observes daylight saving time; the clock of the tests
// is in June
const NORTHERN_SUMMER = [3, 4, 5, 6, 7, 8, 9];
const SOUTHERN_SUMMER = [9, 10, 11, 0, 1, 2];

/** Selects APT 2 for the first airport of the scan list; the time zone answer arrives asynchronously, a display tick shows it */
async function showApt2(unit: HeadlessUnit): Promise<string[]> {
    await unit.panel.selectPage('R', 'APT 2');
    await vi.advanceTimersByTimeAsync(500);
    return Screen.read().rows('R');
}

/** KAAA in Springfield, Illinois, at 600 ft */
const springfield = (extra: Partial<AirportFacility> = {}) =>
    ({...airport('KAAA', 39.8, -89.7, {elevationFt: 600, city: 'SPRINGFIELD, Illinois'}), ...extra} as AirportFacility);

describe('APT 2 page of a database airport (characterization)', () => {
    it('shows the airport', async () => {
        answerTimezone(-6, NORTHERN_SUMMER);
        const unit = await bootUnit({facilities: [springfield({radarCoverage: GpsBoolean.Yes, approaches: [approach({type: ApproachType.APPROACH_TYPE_ILS, runway: '', final: []})]})]});

        await showApt2(unit);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            " KAAA      ",
            "SPRINGFIELD",
            "         IL",
            "ELV   600ft",
            "Z-06(-05DT)",
            "ILS     (R)",
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
});

describe('APT 2 page of a database airport', () => {
    // 3-43, figure 3-135: the city on the second row, followed by the state of a US airport
    it('shows the city and the state (3-43)', async () => {
        answerTimezone(-5, NORTHERN_SUMMER);
        const unit = await bootUnit({facilities: [springfield({city: 'ORLANDO, Florida'})]});

        const rows = await showApt2(unit);
        expect(rows[1]).toMatch(/^ORLANDO +FL$/);
        expect(rows[2]).toBe('           ');
    });

    // 3-43, figure 3-135: Z-06 is local standard time six hours behind UTC; the daylight saving time follows in
    // parentheses where it is observed. The unit's clock is in June, inside the summer time.
    it('shows the UTC offset with the daylight saving time (3-43)', async () => {
        answerTimezone(-6, NORTHERN_SUMMER);
        const unit = await bootUnit({facilities: [springfield()]});

        expect((await showApt2(unit))[4]).toBe('Z-06(-05DT)');
    });

    // 3-43: without daylight saving time the parentheses are left out
    it('shows the UTC offset alone where no daylight saving time is observed (3-43)', async () => {
        answerTimezone(5);
        const unit = await bootUnit({facilities: [springfield()]});

        expect((await showApt2(unit))[4]).toBe('Z+05       ');
    });

    // 3-43: the daylight saving time of the southern hemisphere, which the June clock is outside of, still shows
    it('shows the daylight saving time of a southern airport in June (3-43)', async () => {
        answerTimezone(10, SOUTHERN_SUMMER);
        const unit = await bootUnit({facilities: [{...airport('YAAA', -33.9, 151.2), city: 'SYDNEY'} as AirportFacility]});

        expect((await showApt2(unit))[4]).toBe('Z+10(+11DT)');
    });

    // 3-43: ILS, NP APR for a non-precision approach and no ILS, NO APR without an instrument approach; (R) for an
    // approach control with radar. The labels and (R) stand on the last row, (R) at its right end (figure 3-135).
    it.each([
        ['an ILS', [ApproachType.APPROACH_TYPE_ILS, ApproachType.APPROACH_TYPE_RNAV], 'ILS'],
        ['a VOR approach', [ApproachType.APPROACH_TYPE_VOR], 'NP APR'],
        ['an RNAV approach', [ApproachType.APPROACH_TYPE_RNAV], 'NP APR'],
        ['no approach', [], 'NO APR'],
    ])('names the approach type for %s (3-43)', async (_kind, types, label) => {
        answerTimezone(-6, NORTHERN_SUMMER);
        const approaches = (types as ApproachType[]).map(type => approach({type, runway: '', final: []}));
        const unit = await bootUnit({facilities: [springfield({approaches} as any)]});

        expect((await showApt2(unit))[5].trim()).toBe(label);
    });

    it('shows (R) for an airport with a radar approach control (3-43)', async () => {
        answerTimezone(-6, NORTHERN_SUMMER);
        const unit = await bootUnit({facilities: [springfield({radarCoverage: GpsBoolean.Yes})]});

        expect((await showApt2(unit))[5]).toMatch(/^NO APR +\(R\)$/);
    });
});

describe('APT 2 page of a user airport', () => {
    /** FARM created at the present position (5-16), then APT 2 */
    async function farmOnApt2(): Promise<HeadlessUnit> {
        const unit = await bootUnit({position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'FARM');
        await unit.panel.cursorTo('R', 'PRES POS?');
        await unit.panel.ent();
        await unit.panel.inner('R', 1);
        return unit;
    }

    // 5-17 step 9, figure 5-59: the elevation of a new user airport is dashed below the ident
    it('shows the dashed elevation of a new user airport (5-17)', async () => {
        await farmOnApt2();

        expect(Screen.read().status().right).toBe('APT 2');
        expect(Screen.read().rows('R')).toEqual([
            ' FARM      ',
            '           ',
            '           ',
            'ELV _____ft',
            '           ',
            '           ',
        ]);
    });

    // 5-17 step 9, figure 5-60: the cursor starts on the ident; the outer knob moves it to the elevation, which is
    // entered digit by digit and stored with ENT
    it('stores an entered elevation (5-17)', async () => {
        const unit = await farmOnApt2();
        await unit.panel.cursor('R');
        expect(unit.panel.focused('R').row).toBe(0);
        await unit.panel.cursorTo('R', '_____');
        await unit.panel.type('R', '01250');
        await unit.panel.ent();
        await unit.panel.cursor('R');

        expect(Screen.read().rows('R')[3]).toBe('ELV 01250ft');
        // The elevation is saved with the user waypoint (a V2 string laid out by hand, docs/architecture.md Core 7): type A,
        // region XX, the ident padded to eight, latitude +4700.00, longitude +01200.00, the elevation in meters (1250 ft
        // are 381 m), the unknown runway length -33 ft and no surface. The unit saves a moment after the change.
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'wpt0')).toBe('AXX        FARM    +4700.00+01200.00+00381-00033-');
        // The elevation is kept: APT 2 shows it again after a visit to APT 1
        await unit.panel.inner('R', -1);
        await unit.panel.inner('R', 1);
        expect(Screen.read().rows('R')[3]).toBe('ELV 01250ft');
    });
});

describe('APT 2 page of a stored user airport (characterization)', () => {
    it('shows the airport with its elevation', async () => {
        const unit = await bootUnit({storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0, elevationFt: 1250}])});
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'UAPT');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'APT 2');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            " UAPT      ",
            "           ",
            "           ",
            "ELV 01250ft",
            "           ",
            "           ",
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
});
