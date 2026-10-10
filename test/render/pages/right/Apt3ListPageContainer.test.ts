import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';

// KAAA has three runways, so its APT 3 is the diagram and two list pages (four rows each, two rows per runway); UAPT is
// a user airport with its single runway, which scans right after KAAA
const KAAA_FIRST_LIST_PAGE = [
    ' KAAA      ',
    '           ',
    '18 /36     ',
    "  8000' HRD",
    '06 /24     ',
    "  6200' HRD",
];
const KAAA_SECOND_LIST_PAGE = [
    ' KAAA      ',
    '           ',
    '14 /32     ',
    "  4300' HRD",
    '           ',
    '           ',
];
const UAPT_PAGE = [
    ' UAPT      ',
    '           ',
    'RWY LEN    ',
    " 03200' HRD",
    '           ',
    '           ',
];

async function bootWorld(): Promise<HeadlessUnit> {
    return bootUnit({
        facilities: [airport('KAAA', 47.1, 12.0, {
            runways: [{heading: 60, lengthFt: 6200}, {heading: 140, lengthFt: 4300}, {heading: 180, lengthFt: 8000}],
        })],
        storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.2, lon: 12.0, runwayLengthFt: 3200}]),
        position: {lat: 47.0, lon: 12.0},
    });
}

/** APT 3 on the diagram of KAAA, the nearest airport */
async function bootOnApt3(): Promise<HeadlessUnit> {
    const unit = await bootWorld();
    await unit.panel.selectPage('R', 'APT 3');
    return unit;
}

/** The scan knob pulled, turned `clicks` times and pushed back: the next airport of the scan list */
async function scan(unit: HeadlessUnit, clicks: number): Promise<void> {
    await unit.panel.scan();
    await unit.panel.inner('R', clicks);
    await vi.advanceTimersByTimeAsync(1000);
    await unit.panel.scan();
}

const rows = () => Screen.read().rows('R');
const pageField = () => Screen.read().status().right;

describe('Apt3ListPageContainer, the list of a database airport and the page of a user airport', () => {
    // 3-44: the runways of a database airport are listed longest first; 5-16: a user airport stores one runway, which
    // APT 3 shows as RWY LEN with a length and a surface (5-17, figures 5-61 and 5-62). The page tells the two apart when the scan changes the airport.
    it('shows the runway of a user airport and not the runway list after a scan from the list (3-44, 5-16)', async () => {
        const unit = await bootOnApt3();
        await unit.panel.inner('R', 1);
        expect(rows()).toEqual(KAAA_FIRST_LIST_PAGE);

        await scan(unit, 1);

        expect(rows()).toEqual(UAPT_PAGE);
        expect(unit.errors).toEqual([]);
    });

    it('lists the runways of the database airport again after a scan back from the user airport (3-44, 5-16)', async () => {
        const unit = await bootOnApt3();
        await unit.panel.inner('R', 1);
        await scan(unit, 1);
        expect(rows()).toEqual(UAPT_PAGE);

        await scan(unit, -1);
        await unit.panel.inner('R', 1);

        expect(rows()).toEqual(KAAA_FIRST_LIST_PAGE);
    });

    // The scan from the diagram of a database airport leaves the page as it was built for the diagram, so the user page
    // keeps the runway it was built with (the first runway of KAAA) until the page is left. The same cause as #269.
    it.fails('shows the runway of a user airport after a scan from the diagram of a database airport (5-16, #269)', async () => {
        const unit = await bootOnApt3();

        await scan(unit, 1);

        expect(rows()).toEqual(UAPT_PAGE);
    });

    // 3-29: the active waypoint carries an arrow on its waypoint pages. The arrow follows the airport the page shows.
    it('shows the arrow of the active waypoint only on the airport it marks (3-29)', async () => {
        const unit = await bootWorld();
        await settle(unit);
        await unit.panel.directTo('KAAA');
        await unit.panel.selectPage('R', 'APT 3');
        await unit.panel.inner('R', 1);
        expect(rows()[0]).toBe('›KAAA      ');

        await scan(unit, 1);
        expect(rows()[0]).toBe(' UAPT      ');

        await scan(unit, -1);
        await unit.panel.inner('R', 1);
        expect(rows()[0]).toBe('›KAAA      ');
    });

    // The ident entered on the list page goes through the same change of the airport as the scan
    it('shows the runway of a user airport after its ident is entered on the list page (5-16)', async () => {
        const unit = await bootOnApt3();
        await unit.panel.inner('R', 1);
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'UAPT');
        await unit.panel.cursor('R');

        expect(rows()).toEqual(UAPT_PAGE);
    });
});

describe('Apt3ListPageContainer, the pages after a change of the airport (characterization)', () => {
    it('counts the pages of the user airport, not those of the list it came from', async () => {
        const unit = await bootOnApt3();
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', 1);
        expect(rows()).toEqual(KAAA_SECOND_LIST_PAGE);
        expect(pageField()).toBe('APT+3');

        await scan(unit, 1);
        expect(pageField()).toBe('APT 3');
        await unit.panel.inner('R', 1);

        expect(pageField()).toBe('APT 4');
        expect(rows()[0]).toBe(' UAPT      ');
    });

    it('counts the pages of the database airport after the user airport: the diagram and two list pages', async () => {
        const unit = await bootOnApt3();
        await unit.panel.inner('R', 1);
        await scan(unit, 1);
        await scan(unit, -1);

        expect([pageField(), rows()[0]]).toEqual(['APT+3', '           ']);
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', 1);
        expect(rows()).toEqual(KAAA_SECOND_LIST_PAGE);
        await unit.panel.inner('R', 1);
        expect(pageField()).toBe('APT 4');
    });

    async function unknownIdentOnList(): Promise<HeadlessUnit> {
        const unit = await bootOnApt3();
        await unit.panel.inner('R', 1);
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'QQQ');
        await unit.panel.cursor('R');
        return unit;
    }

    it('takes the offer to create a waypoint away on a scan to a known airport', async () => {
        const unit = await unknownIdentOnList();
        expect(rows()[2]).toBe('CREATE NEW ');

        await scan(unit, 1);

        expect(rows()).toEqual(UAPT_PAGE);
    });
});

describe('Apt3ListPageContainer, an unknown ident', () => {
    // 5-16, figure 5-54: an ident without a match offers to create the waypoint. The figure shows it on APT 1; this test
    // applies the same offer to the APT 3 list page, which the guide does not show, so the APT 3 part is an assumption
    it('offers CREATE NEW WPT AT for an ident entered on the list page (5-16)', async () => {
        const unit = await bootOnApt3();
        await unit.panel.inner('R', 1);
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'QQQ');
        await unit.panel.cursor('R');

        expect(rows()).toEqual([' QQQ       ', '           ', 'CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  ']);
    });
});
