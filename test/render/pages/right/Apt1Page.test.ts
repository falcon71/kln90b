import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {airport} from '../../../harness/navdata/builders';

/** Rows of the right half page that have highlighted (inverted or flashing) cells */
function highlightedRows(screen: Screen): number[] {
    const rows: number[] = [];
    for (let r = 0; r < 6; r++) {
        for (let c = 12; c < 23; c++) {
            if (['I', 'F'].includes(screen.cell(r, c).attr)) {
                rows.push(r);
                break;
            }
        }
    }
    return rows;
}

describe('APT 1 page', () => {
    // 5-19: a user airport is created by entering its latitude and longitude, and the cursor goes to the latitude
    it('creates a user airport at the user position without an error (#65)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.type('R', 'ZZZZ');
        for (let guard = 0; !highlightedRows(Screen.read()).some(r => Screen.read().row(r).slice(12).startsWith('USER POS?')); guard++) {
            if (guard > 8) throw new Error(`no USER POS?\n${Screen.read().dump()}`);
            await unit.panel.outer('R', 1);
        }
        await unit.panel.ent();

        let screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.rightName()).toBe('CRSR ');
        expect(screen.row(0).slice(12)).toBe(' ZZZZ      ');
        // The latitude is the focused field (row 4), the longitude (row 5) is not
        expect(highlightedRows(screen)).toEqual([4]);

        await unit.panel.outer('R', 1);

        screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(highlightedRows(screen)).toEqual([5]);
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

    const rightRow = (n: number) => Screen.read().row(n).slice(12);

    /** The aircraft is 0.6 NM from KBBB; the emergency nearest function (3-23) shows the nearest airport on APT 1 */
    async function bootAtNearest(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb, kccc, kzzz], position: {lat: 47.19, lon: 8.0}});
        // The nearest search runs every 10 s. The booted unit has its boot messages, so MSG then ENT has an effect.
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.msg();
        await unit.panel.ent();
        // Precondition, not the claim
        expect(rightRow(0)).toBe(' KBBB  nr 1');
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

        expect(rightRow(0)).toBe(' KBBB  nr 2');
        expect(rightRow(4)).toBe('     180°to');
        expect(rightRow(5)).toBe('     11.4nm');
    });

    describe('after the entry dropped off the list (characterization)', () => {
        it('shows the airport with a blank nr and its coordinates (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);

            expect(rightRow(0)).toBe(' KBBB      ');
            // KBBB's coordinates, no longer bearing and distance
            expect(rightRow(4)).toBe('N 47°12.00\'');
            expect(rightRow(5)).toBe('E 08°00.00\'');
        });

        // The checks are independent: the ident, the coordinates and the error channels (unit.errors and the console.error
        // spy) each catch a different break (see the commit message)
        it('scans left to the previous airport of the complete list (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                await unit.panel.scan();
                await unit.panel.inner('R', -1);

                expect(rightRow(0)).toBe(' KAAA      ');
                expect(rightRow(4)).toBe('N 47°00.00\'');
                expect(rightRow(5)).toBe('E 08°00.00\'');
                expect(unit.errors).toEqual([]);
                expect(consoleError).toHaveBeenCalledTimes(0);
            } finally {
                consoleError.mockRestore();
            }
        });

        it('scans right to the next airport of the complete list (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
            try {
                await unit.panel.scan();
                await unit.panel.inner('R', 1);

                expect(rightRow(0)).toBe(' KCCC      ');
                expect(rightRow(4)).toBe('N 47°24.00\'');
                expect(rightRow(5)).toBe('E 08°00.00\'');
                expect(unit.errors).toEqual([]);
                expect(consoleError).toHaveBeenCalledTimes(0);
            } finally {
                consoleError.mockRestore();
            }
        });
    });
});
