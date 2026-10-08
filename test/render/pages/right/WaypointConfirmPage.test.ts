import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {insertLeg} from '../../../harness/flightplan';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';

describe('waypoint confirmation page', () => {
    // 3-14: the confirmation page shows the waypoint as the waypoint page does (the ACT page is the one with a position
    // in the flight plan in front of the ident)
    it('opened from the ACT page has the layout of the waypoint page (8045b29)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const inta = intersection('INTA', 47.1, 8.0);
        const unit = await bootUnit({
            facilities: [kaaa, inta, vor('ABC', 47.2, 8.0), vor('XYZ', 48.5, 8.0)],
            position: {lat: 47.0, lon: 8.0},
        });

        // The plain VOR page of XYZ
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'XYZ');
        const plainRow0 = Screen.read().rows('R')[0];
        expect(plainRow0).toBe(' XYZ D     ');
        await unit.panel.cursor('R');

        // Then to ACT, with INTA as the active waypoint
        await unit.panel.selectPage('R', 'ACT  ');
        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, inta);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0]).toBe('› 2 INTA I ');
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(9000);
        await unit.panel.enterIdent('R', 'XYZ');
        await unit.panel.ent();

        // The confirmation page is the VOR page of XYZ, without the position in the flight plan of the ACT page
        expect(Screen.read().rows('R')[0]).toBe(plainRow0);
        expect(Screen.read().rows('R')[0]).not.toContain(' 2 ');
        expect(unit.errors).toEqual([]);
    });
});

// Invented waypoints of every type north of the aircraft (longitudes of 10 degrees or more keep the coordinate rows
// clear of #230); USUP is a user waypoint of the SUP type. The airport has a name that no abbreviation of 3-26 touches
// (#NEW-1-2).
const world = () => ({
    facilities: [
        airport('KAAA', 47.2, 10.5, {name: 'ROTH FIELD'}), vor('ABC', 47.0, 10.6), ndb('NAA', 47.1, 10.4),
        intersection('INTAA', 47.3, 10.5),
    ],
    position: {lat: 46.8, lon: 10.5},
    storage: savedUserWaypoints([{kind: 'sup', ident: 'USUP', lat: 47.4, lon: 10.5}]),
});

/**
 * TRI 3 on the left with the cursor on its first waypoint (the example of 3-14) and NAV 1 on the right, after the status
 * line messages of the page changes have gone (they show for about 5 s, 3-10)
 */
async function tri3WithNav1(): Promise<HeadlessUnit> {
    const unit = await bootUnit(world());
    await unit.panel.selectPage('R', 'NAV 1');
    await unit.panel.selectPage('L', 'TRI 3');
    await vi.advanceTimersByTimeAsync(6000);
    await unit.panel.cursor('L');
    return unit;
}

describe('waypoint confirmation page (characterization)', () => {
    it('shows the airport page of the identifier, with ENT in the status line', async () => {
        const unit = await tri3WithNav1();
        await unit.panel.enterIdent('L', 'KAAA');

        await unit.panel.ent();

        const screen = Screen.read();
        expect({rows: screen.rows('R'), status: screen.status()}).toMatchInlineSnapshot(`
          {
            "rows": [
              " KAAA      ",
              "ROTH FIELD ",
              "           ",
              "           ",
              "N 47°12.00'",
              "E 10°30.00'",
            ],
            "status": {
              "left": "CRSR",
              "mode": "enr-leg ent",
              "right": "APT 1",
            },
          }
        `);
    });
});

describe('waypoint confirmation page (3-14)', () => {
    // 3-14 steps 7 and 8 (figures 3-45 to 3-47): ENT after an identifier shows its waypoint page on the right with ENT
    // flashing in the status line; the second ENT approves it and the right side returns to the page shown before
    it('shows the waypoint page with ENT, and the second ENT returns to the page shown before (3-14)', async () => {
        const unit = await tri3WithNav1();
        await unit.panel.enterIdent('L', 'KAAA');

        await unit.panel.ent();
        expect(Screen.read().status()).toEqual({left: 'CRSR', mode: 'enr-leg ent', right: 'APT 1'});
        expect(Screen.read().rows('R').slice(0, 2)).toEqual([' KAAA      ', 'ROTH FIELD ']);

        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('NAV 1');
        expect(Screen.read().status().mode).toBe('enr-leg msg'); // no ENT; the boot lights MSG (testing.md section 6)
        expect(Screen.read().rows('L')[0]).toBe('KAAA -     ');
        expect(unit.errors).toEqual([]);
    });

    // 3-14 step 7: the waypoint page of the identifier's type. Figure 3-46 shows APT 1 for an airport, figure 3-54 the
    // NDB page; the VOR, INT and SUP pages are the only pages of their types (3-13)
    it.each([
        ['KAAA', 'APT 1'],
        ['ABC', 'VOR'],
        ['NAA', 'NDB'],
        ['INTAA', 'INT'],
        ['USUP', 'SUP'],
    ])('confirms %s on the %s page (3-13, 3-14, 3-15)', async (ident, page) => {
        const unit = await tri3WithNav1();
        await unit.panel.enterIdent('L', ident);

        await unit.panel.ent();

        expect(Screen.read().status().right).toBe(page);
        expect(Screen.read().rows('R')[0].trim().split(' ')[0]).toBe(ident);
    });

    // 3-28, note to step 6: while the waypoint page awaits approval, turning the left inner knob starts the entry
    // again, so the waypoint page goes and the right side shows the page from before
    it('closes the waypoint page when the left inner knob restarts the entry on DIRECT TO (3-28)', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'NAV 1');
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KAAA');
        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('APT 1'); // precondition

        await unit.panel.inner('L', 1);

        expect(Screen.read().status()).toEqual({left: 'CRSR', mode: 'enr-leg ent', right: 'NAV 1'}); // ENT for the new entry
        expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: ');
        expect(unit.errors).toEqual([]);
    });
});

// The guide does not say what the right inner knob does while a waypoint page awaits approval. The confirmation page
// carries its own page tree, so the knob shows the other pages of the waypoint.
describe('waypoint confirmation page, the right inner knob (characterization)', () => {
    it('shows APT 2 of the airport being confirmed, and ENT still approves it', async () => {
        const unit = await tri3WithNav1();
        await unit.panel.enterIdent('L', 'KAAA');
        await unit.panel.ent();

        await unit.panel.inner('R', 1);
        expect(Screen.read().status()).toEqual({left: 'CRSR', mode: 'enr-leg ent', right: 'APT 2'});
        expect(Screen.read().rows('R')[0]).toBe(' KAAA      ');
        expect(Screen.read().rows('R')[3]).toBe('ELV     0ft'); // the elevation row of APT 2, which APT 1 does not have
        await unit.panel.inner('R', -1);
        expect(Screen.read().status().right).toBe('APT 1');

        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('NAV 1');
        expect(Screen.read().rows('L')[0]).toBe('KAAA -     ');
    });
});
