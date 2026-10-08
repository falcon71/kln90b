import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {intersection, ndb} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {isUserWaypoint} from '../../../../kln90b/pages/right/WaypointPage';

/*
 * WaypointPage is the base of the APT, VOR, NDB, INT and SUP pages. These tests drive it through the NDB page, which
 * has a nearest list without filters, and keep the facilities of the other pages away. The flow between the nearest
 * list and the complete list is held by test/render/data/navdata/NearestList.test.ts, the scan after an entry dropped
 * off the nearest list (#39) by Apt1Page.test.ts, and the SUP page's scan without a nearest list by SupPage.test.ts.
 */

const identRow = () => Screen.read().rows('R')[0];

/** One slow click of the right inner knob: more than 350 ms after the last one, so the scan does not speed up */
async function slowStep(unit: HeadlessUnit, clicks: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(400);
    await unit.panel.inner('R', clicks);
    await vi.advanceTimersByTimeAsync(400);
}

// 26 invented NDBs NAA, NBA, ..., NZA, 0.01 degrees apart, all more than 60 NM north of the aircraft. ZZN, the default
// NDB, sorts after them.
const alphabet = () => Array.from({length: 26}, (_, i) => ndb(`N${String.fromCharCode(65 + i)}A`, 47.0 + i * 0.01, 10.5));

async function ndbPageOnNaa(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: alphabet(), position: {lat: 46.0, lon: 10.5}});
    await unit.panel.selectPage('R', 'NDB  ');
    expect(identRow()).toBe(' NAA       '); // precondition: the first NDB of the complete list
    await unit.panel.scan();
    return unit;
}

// The frequency is on a half kHz: a whole kHz shows .0 (#NEW-3-13)
describe('waypoint page, shown by the NDB page (characterization)', () => {
    it('shows a waypoint with its name, frequency and position', async () => {
        const unit = await bootUnit({
            facilities: [ndb('NAA', 47.2, 10.5, {frequencyKHz: 251.5, name: 'ALPHA'})], position: {lat: 47.0, lon: 10.5},
        });
        await unit.panel.selectPage('R', 'NDB  ');
        await vi.advanceTimersByTimeAsync(500);

        const screen = Screen.read();
        expect({rows: screen.rows('R'), status: screen.status()}).toMatchInlineSnapshot(`
          {
            "rows": [
              " NAA       ",
              "ALPHA      ",
              "           ",
              "FREQ  251.5",
              "N 47°12.00'",
              "E 10°30.00'",
            ],
            "status": {
              "left": "NAV 2",
              "mode": "enr-leg msg",
              "right": "NDB",
            },
          }
        `);
    });
});

describe('waypoint page scanning (3-21)', () => {
    // 3-21: turned slowly, the knob steps through the waypoints one at a time
    it('steps one waypoint per click when the knob is turned slowly (3-21)', async () => {
        const unit = await ndbPageOnNaa();

        await slowStep(unit, 1);
        expect(identRow()).toBe(' NBA       ');
        await slowStep(unit, 1);
        expect(identRow()).toBe(' NCA       ');
        await slowStep(unit, -1);
        expect(identRow()).toBe(' NBA       ');
    });
});

// The guide gives no rate for the faster scan; the code multiplies the step by 1.5 for every click within 350 ms of
// the last one in the same direction (WaypointPage ScanHandler), rounding down.
describe('waypoint page scanning speed (characterization)', () => {
    it('passes twelve NDBs with five clicks a display tick apart, and one with a fast click back', async () => {
        const unit = await ndbPageOnNaa();
        await vi.advanceTimersByTimeAsync(400);

        await unit.panel.inner('R', 5); // one click per display tick (250 ms): steps of 1, 1, 2, 3 and 5
        expect(identRow()).toBe(' NMA       ');

        await unit.panel.inner('R', -1); // 250 ms later, but the other way: the speed starts again at one
        expect(identRow()).toBe(' NLA       ');
    });

    it('passes one NDB per click when the clicks are half a second apart', async () => {
        const unit = await ndbPageOnNaa();
        await vi.advanceTimersByTimeAsync(400);

        for (let i = 0; i < 4; i++) {
            await unit.panel.inner('R', 1);
            await vi.advanceTimersByTimeAsync(250); // 500 ms from click to click
        }

        expect(identRow()).toBe(' NEA       ');
    });
});

describe('waypoint page memory over a page change', () => {
    // Checked in the KLN 89 trainer, 2026-10-07: the page of a waypoint type keeps its waypoint over a change of type
    it('shows the waypoint selected before when the page comes back (the KLN 89 trainer)', async () => {
        const unit = await ndbPageOnNaa();
        await slowStep(unit, 2);
        await unit.panel.scan();
        expect(identRow()).toBe(' NCA       '); // precondition

        await unit.panel.outer('R', 1); // INT
        await unit.panel.outer('R', -1); // NDB

        expect(identRow()).toBe(' NCA       ');
    });
});

describe('waypoint page memory over a page change (characterization)', () => {
    // NAA, NBB and NCC lie 6, 12 and 18 NM north of the aircraft. The page keeps the nearest entry it showed, and its
    // nr follows the aircraft, also after the page was left in between.
    it('keeps a nearest entry, with its nr following the aircraft, when the page comes back', async () => {
        const unit = await bootUnit({
            facilities: [ndb('NAA', 47.1, 10.5), ndb('NBB', 47.2, 10.5), ndb('NCC', 47.3, 10.5)], position: {lat: 47.0, lon: 10.5},
        });
        await vi.advanceTimersByTimeAsync(12000); // the nearest search runs every 10 s
        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.scan();
        await slowStep(unit, -2);
        await unit.panel.scan();
        expect(identRow()).toBe(' NBB   nr 2'); // precondition

        await unit.panel.outer('R', 1); // INT
        await unit.panel.outer('R', -1); // NDB
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.21); // NBB is 0.6 NM away now, the nearest
        await vi.advanceTimersByTimeAsync(12000);

        expect(identRow()).toBe(' NBB   nr 1');
    });

    // An ident typed with no waypoint stays as typed: the page offers to create it again
    it('shows the creation prompt for an ident typed without a waypoint when the page comes back', async () => {
        const unit = await bootUnit({facilities: alphabet(), position: {lat: 46.0, lon: 10.5}});
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'QQ');
        await unit.panel.cursor('R');

        await unit.panel.outer('R', -1); // NDB
        await unit.panel.outer('R', 1); // INT

        const rows = Screen.read().rows('R');
        expect([rows[0], rows[2], rows[3]]).toEqual([' QQ        ', 'CREATE NEW ', 'WPT AT:    ']);
    });
});

// The ICAO region XX marks a user waypoint and XY a temporary one (CLAUDE.md, Navdata; IcaoBuilder). The pages make the
// fields of a user waypoint editable on that test.
describe('isUserWaypoint (characterization)', () => {
    it.each([
        ['XX', true],
        ['XY', true],
        ['K1', false],
    ])('takes the region %s as a user waypoint: %s', (region, expected) => {
        const fac = intersection('QQ', 47, 10.5, {region});
        expect(fac.icaoStruct.region).toBe(region); // precondition: the builder's region

        expect(isUserWaypoint(fac)).toBe(expected);
    });
});
