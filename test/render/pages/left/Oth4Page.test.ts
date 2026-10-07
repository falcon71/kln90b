import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

const REMARK: [string, string, string] = ['FUEL 24H   ', '           ', '           '];

/** A unit whose APT 5 pages hold remarks for the given airports, with OTH 4 shown on the left */
async function withRemarks(idents: string[]): Promise<HeadlessUnit> {
    const unit = await bootUnit();
    for (const ident of idents) {
        unit.props.remarksManager.saveRemarks(ident, REMARK);
    }
    await unit.panel.selectPage('L', 'OTH 4');
    return unit;
}

/** The airport idents OTH 4 lists, in the order of the rows */
const listed = (): string[] => Screen.read().rows('L').slice(1).map(r => r.trim()).filter(r => r !== '');

describe('OTH 4 page (characterization)', () => {
    // The unit lists the airports sorted by ident, whatever the order the remarks were saved in
    it('characterization: three airports with remarks', async () => {
        await withRemarks(['KCCC', 'KAAA', 'KBBB']);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "APTS W/RMKS
          KAAA       
          KBBB       
          KCCC       
                     
                     "
        `);
    });
});

describe('OTH 4 page, the list of airports with remarks (3-47)', () => {
    // 3-47, checked in the KLN 89 trainer, 2026-10-07: remarks entered for three airports out of order are listed sorted
    // by ident
    it('lists the airports with remarks sorted by ident (3-47, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        await withRemarks(['KCCC', 'KAAA', 'KBBB']);

        expect(listed()).toEqual(['KAAA', 'KBBB', 'KCCC']);
    });
});

describe('OTH 4 page, deleting remarks (3-47)', () => {
    // 3-47: OTH 4 lists the airports whose APT 5 page holds remarks; the cursor on one, CLR and ENT delete its remarks
    it('deletes the remarks of the airport under the cursor with CLR and ENT (3-47)', async () => {
        const unit = await withRemarks(['KAAA', 'KBBB', 'KCCC']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // KBBB

        await unit.panel.clr();
        await unit.panel.ent();

        expect(unit.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA', 'KCCC']);
        await unit.panel.cursor('L');
        expect(listed()).toEqual(['KAAA', 'KCCC']);
    });

    // 3-47: the list is that of the airports with remarks. The page listens for changes while it is shown: a remark
    // saved on APT 5 (here through the manager, as the APT 5 page does) appears on OTH 4. KCCC has never been changed
    it('lists an airport whose remarks were saved while the page is shown (3-47)', async () => {
        const unit = await withRemarks(['KAAA', 'KBBB']);
        await unit.panel.cursor('L');
        await unit.panel.clr();
        await unit.panel.ent(); // KAAA deleted
        await unit.panel.cursor('L');
        expect(listed()).toEqual(['KBBB']);

        unit.props.remarksManager.saveRemarks('KCCC', REMARK);
        await vi.advanceTimersByTimeAsync(500);

        expect(listed()).toEqual(['KBBB', 'KCCC']);
    });

    // The same sequence as the test above, but the new remark is for KAAA, the airport whose remarks were just deleted
    it.fails('lists an airport again when its remarks are saved anew while the page is shown (3-47, #NEW-5-4)', async () => {
        const unit = await withRemarks(['KAAA', 'KBBB']);
        await unit.panel.cursor('L');
        await unit.panel.clr();
        await unit.panel.ent(); // KAAA deleted
        await unit.panel.cursor('L');

        unit.props.remarksManager.saveRemarks('KAAA', REMARK);
        await vi.advanceTimersByTimeAsync(500);

        expect(listed()).toEqual(['KAAA', 'KBBB']);
    });

    // 3-47: CLR and ENT delete the remarks of the airport under the cursor, so the airport leaves the list. KCCC, the
    // deleted one, was not the airport saved last; the sibling is the delete test above, where KCCC was saved last and
    // KBBB (the middle one) was deleted
    it.fails('removes a deleted airport from the list when its remarks were the last saved (3-47, #NEW-5-4)', async () => {
        const unit = await withRemarks(['KAAA', 'KBBB', 'KCCC']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2); // KCCC, the last airport saved

        await unit.panel.clr();
        await unit.panel.ent();

        expect(unit.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA', 'KBBB']);
        await unit.panel.cursor('L');
        expect(listed()).toEqual(['KAAA', 'KBBB']);
    });
});

// The guide is silent on where the cursor goes when the last row of the list is deleted or the list becomes empty. The
// deleted airport is never the one saved last in these setups, so that the list is redrawn at all (#NEW-5-4)
describe('OTH 4 page, the cursor after a deletion (characterization)', () => {
    it('characterization: moves the cursor to the new last airport when the last airport is deleted', async () => {
        const unit = await withRemarks(['KCCC', 'KAAA', 'KBBB']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2); // KCCC, the last row of the list KAAA, KBBB, KCCC

        await unit.panel.clr();
        await unit.panel.ent();

        expect(listed()).toEqual(['KAAA', 'KBBB']);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 0, text: 'KBBB'});
    });

    it('characterization: turns the cursor off when the only airport is deleted', async () => {
        const unit = await bootUnit();
        unit.props.remarksManager.saveRemarks('KBBB', REMARK);
        unit.props.remarksManager.saveRemarks('KAAA', REMARK);
        unit.props.remarksManager.deleteRemarks('KAAA');
        await unit.panel.selectPage('L', 'OTH 4');
        await unit.panel.cursor('L');
        expect(listed()).toEqual(['KBBB']);

        await unit.panel.clr();
        await unit.panel.ent();

        expect(listed()).toEqual([]);
        expect(Screen.read().status().left).toBe('OTH 4');
    });
});
