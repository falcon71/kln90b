import {describe, expect, it} from 'vitest';
import {Facility, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, SavedUserWaypoint, savedUserWaypoints} from '../../../harness/storage';

/** User intersections at 47°30.00'N 8°15.50'W; where they are does not matter to the list */
function userWaypoints(idents: string[]): Record<string, unknown> {
    return savedUserWaypoints(idents.map(ident => ({kind: 'int', ident, lat: 47.5, lon: -(8 + 15.5 / 60)})));
}

describe('OTH 3 page', () => {
    // The list shows five rows below the title, and the focused one must stay among them
    it('scrolls the list to keep the focused row visible (characterization) (9a17b5b)', async () => {
        const unit = await bootUnit({storage: userWaypoints(['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG'])});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');

        await unit.panel.outer('L', 5);

        const screen = Screen.read();
        expect(screen.rows('L').slice(1)).toEqual([
            'BBB   I    ',
            'CCC   I    ',
            'DDD   I    ',
            'EEE   I    ',
            'FFF   I    ',
        ]);
        const mask = screen.maskRows('L');
        // Only the last visible row, FFF, is focused
        expect(mask[5]).toBe('IIIIIIIIIII');
        for (let row = 1; row <= 4; row++) {
            expect(mask[row]).not.toContain('I');
        }
    });

    // 5-20: CLR asks for the deletion of the focused waypoint, ENT confirms. 4-5: the cursor stays on the row
    it('keeps the cursor on the row of a deleted waypoint, which now shows the next one (#26)', async () => {
        const unit = await bootUnit({storage: userWaypoints(['AAA', 'BBB', 'CCC', 'DDD'])});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);

        await unit.panel.clr();

        expect(Screen.read().rows('L')[2]).toBe('DEL BBB   ?');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(screen.rows('L').slice(1, 4)).toEqual([
            'AAA   I    ',
            'CCC   I    ',
            'DDD   I    ',
        ]);
        const mask = screen.maskRows('L');
        expect(mask[2]).toBe('IIIIIIIIIII');
        expect(mask[1]).not.toContain('I');
        expect(mask[3]).not.toContain('I');
    });
});

/** One user waypoint of each kind, stored out of order; AVOR is used in FPL 6 */
const MIXED: SavedUserWaypoint[] = [
    {kind: 'sup', ident: 'ASUP', lat: 47.1, lon: 8.1},
    {kind: 'int', ident: 'AINT', lat: 47.2, lon: 8.2},
    {kind: 'ndb', ident: 'AND', lat: 47.3, lon: 8.3, freqKHz: 350},
    {kind: 'vor', ident: 'AVOR', lat: 47.4, lon: 8.4, freqMHz: 113.1, magvar: 0},
    {kind: 'apt', ident: 'BAPT', lat: 47.5, lon: 8.5},
    {kind: 'apt', ident: 'AAPT', lat: 47.6, lon: 8.6},
];
const avor = {icaoStruct: ICAO.value('V', 'XX', '', 'AVOR')} as unknown as Facility;
const aint = {icaoStruct: ICAO.value('W', 'XX', '', 'AINT')} as unknown as Facility;
const asup = {icaoStruct: ICAO.value('U', 'XX', '', 'ASUP')} as unknown as Facility;
const MIXED_STORAGE = {...savedUserWaypoints(MIXED), ...savedFlightplan(6, [avor])};

/** The ident, the type letter and the flight plan number of an OTH 3 row (no number without a plan) */
const entry = (row: string): string => {
    const m = /^(\S+)\s+([AVNIS])\s*(\d*)$/.exec(row);
    return m === null ? `no match: "${row}"` : [m[1], m[2], m[3]].join(' ').trim();
};

describe('OTH 3 page (characterization)', () => {
    it('characterization: one user waypoint of each kind, one of them in FPL 6', async () => {
        const unit = await bootUnit({storage: MIXED_STORAGE});
        await unit.panel.selectPage('L', 'OTH 3');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " USER WPTS 
          AAPT  A    
          BAPT  A    
          AVOR  V   6
          AND   N    
          AINT  I    "
        `);
    });
});

describe('OTH 3 page, the user waypoint list (5-20)', () => {
    // 5-20: airports first, then VORs, NDBs, intersections and supplemental waypoints, alphabetical within each kind; the
    // type letter follows the ident, and the number of a flight plan that uses the waypoint follows the type
    it('lists the user waypoints by kind, then by ident, with the type letter and the plan number (5-20)', async () => {
        const unit = await bootUnit({storage: MIXED_STORAGE});
        await unit.panel.selectPage('L', 'OTH 3');
        const first = Screen.read().rows('L').slice(1);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 5); // the sixth waypoint scrolls into the last row

        expect([...first, Screen.read().rows('L')[5]].map(entry)).toEqual([
            'AAPT A', 'BAPT A', 'AVOR V 6', 'AND N', 'AINT I', 'ASUP S',
        ]);
    });

    // 5-20, checked in the KLN 89 trainer, 2026-10-07: a waypoint of FPL 0 that is not the active one shows 0, and a
    // waypoint used in several plans shows the lowest plan number. AINT is in FPL 0 behind the active KBBB; ASUP is in
    // FPL 4 and FPL 2, stored in that order, so the highest number would be the first one found
    it('shows 0 for a waypoint of FPL 0 and the lowest plan number of several (5-20, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        const {kaaa, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, kbbb],
            storage: {
                ...savedUserWaypoints(MIXED),
                ...savedFlightplan(0, [kaaa, kbbb, aint]),
                ...savedFlightplan(4, [asup]),
                ...savedFlightplan(2, [asup]),
            },
        });
        await settle(unit);
        // The aircraft is at KAAA, so the active waypoint is KBBB and AINT is not it
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        await unit.panel.selectPage('L', 'OTH 3');
        const first = Screen.read().rows('L').slice(1);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 5);

        expect([...first, Screen.read().rows('L')[5]].map(entry).filter(e => e.startsWith('AINT') || e.startsWith('ASUP'))).toEqual([
            'AINT I 0', 'ASUP S 2',
        ]);
    });

    // 5-20, C-2: a waypoint used in a flight plan cannot be deleted; CLR says USED IN FPL and nothing is asked
    it('refuses to delete a waypoint used in a flight plan with USED IN FPL (5-20, C-2)', async () => {
        const unit = await bootUnit({storage: MIXED_STORAGE});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2); // AVOR

        await unit.panel.clr();

        expect(Screen.read().status().mode).toBe('USED IN FPL');
        expect(entry(Screen.read().rows('L')[3])).toBe('AVOR V 6');
    });

    // C-1: the active waypoint cannot be deleted; CLR says ACTIVE WPT. AINT is the active waypoint of FPL 0 KAAA AINT
    it('refuses to delete the active waypoint with ACTIVE WPT (C-1)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const unit = await bootUnit({facilities: [kaaa], storage: {...savedUserWaypoints(MIXED), ...savedFlightplan(0, [kaaa, aint])}});
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('AINT');
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4); // AINT

        await unit.panel.clr();

        expect(Screen.read().status().mode).toBe('ACTIVE WPT');
        // The row still lists AINT (no deletion asked); the plan number of the active waypoint is not the subject here
        expect(entry(Screen.read().rows('L')[5]).slice(0, 6)).toBe('AINT I');
    });

    // 5-20: CLR on a waypoint asks for the deletion and shows the waypoint's page on the right side (figure 5-79)
    it('shows the page of the waypoint on the right while it asks for the deletion (5-20)', async () => {
        const unit = await bootUnit({storage: MIXED_STORAGE});
        await unit.panel.selectPage('L', 'OTH 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4); // AINT

        await unit.panel.clr();

        const screen = Screen.read();
        expect(screen.rows('L')[5]).toBe('DEL AINT  ?');
        expect(screen.status().right).toBe('INT');
        expect(screen.rows('R')[0].trim()).toBe('AINT');
    });
});
