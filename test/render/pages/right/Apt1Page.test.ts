import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {airport} from '../../../harness/navdata/builders';

describe('APT 1 page', () => {
    // 5-19: a user airport is created by entering its latitude and longitude, and the cursor goes to the latitude
    it('creates a user airport at the user position without an error (#65)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ZZZZ');
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.status().right).toBe('CRSR');
        expect(screen.rows('R')[0]).toBe(' ZZZZ      ');
        // The latitude is the focused field (row 4), the longitude (row 5) is not
        expect(unit.panel.focused('R').row).toBe(4);

        await unit.panel.outer('R', 1);

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('R').row).toBe(5);
    });
});

/**
 * Scanning after the shown nearest entry dropped off the nearest list (#39, c2e7b8e, d202f4a).
 * The nearest search radius is 500 NM, so a teleport of 10 degrees of latitude drops an entry at once; flying there
 * would take hundreds of NM.
 */
describe('APT 1 page on a nearest entry', () => {
    // Invented airports on one meridian, 0.2 degrees (12 NM) apart; KZZZ is far out of the 500 NM search radius
    const kaaa = airport('KAAA', 47.0, 8.0);
    const kbbb = airport('KBBB', 47.2, 8.0);
    const kccc = airport('KCCC', 47.4, 8.0);
    const kzzz = airport('KZZZ', 57.1, 8.0);

    /** The aircraft is 0.6 NM from KBBB; the emergency nearest function (3-23) shows the nearest airport on APT 1 */
    async function bootAtNearest(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb, kccc, kzzz], position: {lat: 47.19, lon: 8.0}});
        // The nearest search runs every 10 s. The booted unit has its boot messages, so MSG then ENT has an effect.
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.msg();
        await unit.panel.ent();
        // Precondition, not the claim
        expect(Screen.read().rows('R')[0]).toBe(' KBBB  nr 1');
        return unit;
    }

    /** KBBB is removed from the list, the page still holds the object. KZZZ, 6 NM away, is the only entry then. */
    async function dropEntry(unit: HeadlessUnit): Promise<void> {
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 57.0);
        await vi.advanceTimersByTimeAsync(25000);
    }

    // 3-24: the airport stays displayed and its nr changes with the aircraft's position
    it('follows the aircraft with the nr of the shown airport (d202f4a)', async () => {
        const unit = await bootAtNearest();

        // KCCC (47.4) is the nearest now, so KBBB is the second: 0.19 degrees of latitude (11.4 NM) south, bearing 180
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.39);
        await vi.advanceTimersByTimeAsync(12000);

        expect(Screen.read().rows('R')[0]).toBe(' KBBB  nr 2');
        expect(Screen.read().rows('R')[4]).toBe('     180°to');
        expect(Screen.read().rows('R')[5]).toBe('     11.4nm');
    });

    describe('after the entry dropped off the list (characterization)', () => {
        it('shows the airport with a blank nr and its coordinates (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);

            expect(Screen.read().rows('R')[0]).toBe(' KBBB      ');
            // KBBB's coordinates, no longer bearing and distance. The longitude row (row 5) is left out of these three
            // tests: it shows a degree below 10 written with a zero (#230). The latitude row holds the coordinates.
            expect(Screen.read().rows('R')[4]).toBe('N 47°12.00\'');
        });

        // The checks are independent: the ident, the coordinates and the error channels (unit.errors and
        // unit.consoleErrors) each catch a different break (see the commit message)
        it('scans left to the previous airport of the complete list (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);

            await unit.panel.scan();
            await unit.panel.inner('R', -1);

            expect(Screen.read().rows('R')[0]).toBe(' KAAA      ');
            expect(Screen.read().rows('R')[4]).toBe('N 47°00.00\'');
            expect(unit.errors).toEqual([]);
            expect(unit.consoleErrors).toEqual([]);
        });

        it('scans right to the next airport of the complete list (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);

            await unit.panel.scan();
            await unit.panel.inner('R', 1);

            expect(Screen.read().rows('R')[0]).toBe(' KCCC      ');
            expect(Screen.read().rows('R')[4]).toBe('N 47°24.00\'');
            expect(unit.errors).toEqual([]);
            expect(unit.consoleErrors).toEqual([]);
        });
    });
});

/**
 * Scanning from a typed ident that matches no waypoint. Checked in the KLN 89 trainer (2026-10-07; the 89 shows dashes
 * and no CREATE NEW state, but its scan is the same): the scan is relative to the last waypoint the ident entry matched,
 * not to the typed ident. Clockwise shows that waypoint's successor, counterclockwise its predecessor. In the trainer
 * the typed ident sorted after its last match, and counterclockwise showed the predecessor of the last match, where a
 * scan from the typed ident would have shown the last match itself. 3-21 gives the alphabetical order of the scan.
 */
describe('APT 1 page scanning from a typed ident that matches no airport (3-21)', () => {
    // Invented airports, a few NM apart. Typing KC matches KCCC; KCZ matches nothing, and KCCC was the last match.
    const world = () => ({
        facilities: [airport('KAAA', 47.0, 8.0), airport('KBBB', 47.02, 8.0), airport('KCCC', 47.04, 8.0), airport('KDDD', 47.06, 8.0)],
        position: {lat: 47.0, lon: 8.0},
    });
    const CHARSET = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

    /** APT 1 with KCZ entered with the knobs (enterIdent) and the cursor off: the state the pins scan from */
    async function enterKcz(): Promise<HeadlessUnit> {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KCZ');
        await unit.panel.cursor('R');
        return unit;
    }

    /** KCZ entered as above, the scan knob pulled; one slow click of the inner knob follows */
    async function scanFromKcz(clicks: number): Promise<HeadlessUnit> {
        const unit = await enterKcz();
        await unit.panel.scan();
        await unit.panel.inner('R', clicks);
        await vi.advanceTimersByTimeAsync(400);
        return unit;
    }

    /** Sets the character of the focused selector cell with the inner knob, the shorter way around the selector's characters */
    async function setChar(unit: HeadlessUnit, ch: string): Promise<void> {
        for (let guard = 0; unit.panel.focused('R').text[0] !== ch; guard++) {
            expect(guard).toBeLessThan(CHARSET.length);
            let delta = CHARSET.indexOf(ch) - CHARSET.indexOf(unit.panel.focused('R').text[0]);
            if (delta > CHARSET.length / 2) delta -= CHARSET.length;
            if (delta < -CHARSET.length / 2) delta += CHARSET.length;
            await unit.panel.inner('R', delta > 0 ? 1 : -1);
        }
    }

    // The passing siblings of the pins: after KC the page shows KCCC, the last match, and after KCZ the page offers to
    // create a waypoint, typed char by char and (below) on the pins' own path. Without them the scans could start anywhere.
    it('shows KCCC after KC and the CREATE NEW state after KCZ', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await setChar(unit, 'K');
        await unit.panel.outer('R', 1);
        await setChar(unit, 'C');
        expect(Screen.read().rows('R').slice(0, 2)).toEqual([' KCCC      ', 'KCCC AIRPT ']);

        await unit.panel.outer('R', 1);
        await setChar(unit, 'Z');

        const rows = Screen.read().rows('R');
        expect([rows[0], rows[2], rows[3]]).toEqual([' KCZ       ', 'CREATE NEW ', 'WPT AT:    ']);
    });

    it('shows the CREATE NEW state for KCZ entered the way the pins enter it', async () => {
        const unit = await enterKcz();

        const rows = Screen.read().rows('R');
        expect([rows[0], rows[2], rows[3]]).toEqual([' KCZ       ', 'CREATE NEW ', 'WPT AT:    ']);
    });

    it.fails('scans clockwise to the waypoint after the last match (3-21, #202)', async () => {
        const unit = await scanFromKcz(1);

        expect(Screen.read().rows('R')[0]).toBe(' KDDD      ');
    });

    // A scan from the typed ident would show KCCC (the airport before KCZ), so this case tells the two readings apart
    it.fails('scans counterclockwise to the waypoint before the last match (3-21, #202)', async () => {
        const unit = await scanFromKcz(-1);

        expect(Screen.read().rows('R')[0]).toBe(' KBBB      ');
    });
});
