import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {collectStatusMessages} from '../../../harness/statusLine';

// 3-47: APT 5 holds three lines of 11 characters of remarks per airport, OTH 4 lists the airports that have remarks.
// The stored slot (rmk0: ident of 4 characters plus the three lines) is persisted user data, docs/architecture.md Core 7.
const KAAA = () => airport('KAAA', 47, 8);

describe('APT 5 remarks', () => {
    it('stores a remark line entered on APT 5 under rmk0', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 5');
        await unit.panel.cursor('R');
        for (let i = 0; i < 10 && unit.panel.focused('R').row !== 2; i++) {
            await unit.panel.outer('R', 1);
        }
        expect(unit.panel.focused('R').row).toBe(2);

        await unit.panel.type('R', 'FUEL');
        await unit.panel.ent();
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(storedSetting(unit, 'rmk0')).toBe('KAAAFUEL       ' + ' '.repeat(22));
        expect(Screen.read().rows('R')[2]).toBe('FUEL       ');
    });

    // The second and third lines are their own fields: each lands in its own place of the slot and on its own row
    it('stores remarks entered on the second and third line in their own places of rmk0', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 5');
        await unit.panel.cursor('R');
        for (const [row, text] of [[3, 'CTAF'], [4, 'EXTRA']] as const) {
            for (let i = 0; i < 10 && unit.panel.focused('R').row !== row; i++) {
                await unit.panel.outer('R', 1);
            }
            expect(unit.panel.focused('R').row).toBe(row);
            await unit.panel.type('R', text);
            await unit.panel.ent();
        }
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(storedSetting(unit, 'rmk0')).toBe('KAAA' + ' '.repeat(11) + 'CTAF       ' + 'EXTRA      ');
        expect(Screen.read().rows('R').slice(2, 5)).toEqual(['           ', 'CTAF       ', 'EXTRA      ']);
    });

    it('shows the remarks of the airport in a stored slot', async () => {
        const unit = await bootUnit({
            facilities: [KAAA()], position: {lat: 47, lon: 8},
            storage: {rmk0: 'KAAAFUEL       CTAF       X          '},
        });

        await unit.panel.selectPage('R', 'APT 5');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R').slice(2, 5)).toEqual(['FUEL       ', 'CTAF       ', 'X          ']);
    });

    it('lists the airport of a stored slot on OTH 4', async () => {
        const unit = await bootUnit({
            facilities: [KAAA()], position: {lat: 47, lon: 8},
            storage: {rmk0: 'KAAAFUEL       CTAF       X          '},
        });

        await unit.panel.selectPage('L', 'OTH 4');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(0, 2)).toEqual(['APTS W/RMKS', 'KAAA       ']);
    });
});

/** Turns the right outer knob until the focused field is on the given row; the right cursor must be on */
async function cursorToRow(unit: HeadlessUnit, row: number): Promise<void> {
    for (let i = 0; i < 10 && unit.panel.focused('R').row !== row; i++) {
        await unit.panel.outer('R', 1);
    }
    expect(unit.panel.focused('R').row).toBe(row);
}

const rowsR = () => Screen.read().rows('R').map(r => r.trimEnd());

describe('APT 5 page layout and remark entry (3-47)', () => {
    // 3-47, figure 3-144: the airport on the first line, REMARKS: on the second, the three remark lines below it
    it('shows REMARKS: on the second line and the three remark lines below it (3-47)', async () => {
        const unit = await bootUnit({
            facilities: [KAAA()], position: {lat: 47, lon: 8},
            storage: {rmk0: 'KAAAFUEL       CTAF       X          '},
        });
        await unit.panel.selectPage('R', 'APT 5');

        expect(rowsR()).toEqual([' KAAA', 'REMARKS:', 'FUEL', 'CTAF', 'X', '']);
    });

    // 3-47, figure 3-141: the cursor for a remark covers the whole line, which holds eleven characters
    it('puts the cursor over the whole remark line of eleven cells (3-47)', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 5');
        await unit.panel.cursor('R');

        await cursorToRow(unit, 2);

        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' '.repeat(11)});
    });

    // 3-47: ENT approves a line, and the cursor moves on to the next line
    it('moves the cursor to the next remark line after ENT (3-47)', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 5');
        await unit.panel.cursor('R');
        await cursorToRow(unit, 2);
        await unit.panel.type('R', 'MOTEL');

        await unit.panel.ent();

        expect(unit.panel.focused('R').row).toBe(3);
        expect(rowsR()[2]).toBe('MOTEL');
    });
});

describe('APT 5 remarks of an 11th airport (#92)', () => {
    /** The stored slots of n airports with remarks, KBAA, KCAA, ...; laid out by hand from the format (Core 7) */
    const storedRemarks = (n: number) => Object.fromEntries(Array.from({length: n}, (_, i) =>
        [`rmk${i}`, `K${String.fromCharCode(66 + i)}AA` + 'X' + ' '.repeat(32)]));

    /** Enters one remark line for KAAA on APT 5 and returns the status line messages published meanwhile */
    async function enterRemark(unit: HeadlessUnit): Promise<string[]> {
        const seen = collectStatusMessages(unit);
        await unit.panel.selectPage('R', 'APT 5');
        await unit.panel.cursor('R');
        await cursorToRow(unit, 2);
        await unit.panel.type('R', 'MOTEL');
        await unit.panel.ent();
        return seen;
    }

    // 3-47: up to 100 airports may hold remarks. The sibling of the pin below: nine airports are stored, KAAA is the tenth
    it('accepts the remarks of a 10th airport without a status line message (3-47)', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}, storage: storedRemarks(9)});

        expect(await enterRemark(unit)).toEqual([]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'rmk9')).toBe('KAAAMOTEL      ' + ' '.repeat(22));
    });

    // 3-47, C-2: RMKS FULL is for the 101st airport; with ten airports stored the 11th must be accepted
    it.fails('accepts the remarks of an 11th airport without RMKS FULL (3-47, C-2, #92)', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}, storage: storedRemarks(10)});

        expect(await enterRemark(unit)).toEqual([]);
    });
});

describe('APT 5 page (characterization)', () => {
    it('shows an airport without remarks as three empty lines under REMARKS:', async () => {
        const unit = await bootUnit({facilities: [KAAA()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 5');

        expect(Screen.read().half('R')).toMatchInlineSnapshot(`
          " KAAA      
          REMARKS:   
                     
                     
                     
                     "
        `);
    });
});
