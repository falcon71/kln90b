import {VorType} from '@microsoft/msfs-sdk';
import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, ndb, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The VOR selector of the VOR page: three cells, VORs only. ABC is the first VOR, so the page opens on it; K00 is an
// airport and KNB an NDB that sort before the VOR KSA. An NDB of the type H carries the number of a VOR-DME in its type
// field, so only the search type keeps it out of the offers.
async function abcWithCursor(...more: ReturnType<typeof vor>[]): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [
            vor('ABC', 47.2, 8.0), airport('K00', 47.3, 8.0), ndb('KNB', 47.4, 8.0), vor('KSA', 47.6, 8.1), ...more,
        ],
        position: {lat: 47.0, lon: 8.0},
    });
    await unit.panel.selectPage('R', 'VOR  ');
    await unit.panel.cursor('R');
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'A'}); // precondition
    return unit;
}

const vorIdent = (unit: HeadlessUnit) =>
    (unit.props.memory.vorPage.facility as { icaoStruct: { ident: string } } | null)?.icaoStruct.ident;

describe('VOR selector (3-20, 5-18)', () => {
    // 5-18: a VOR identifier has one to three characters, so the selector has three cells (3-20: the outer knob steps
    // over each).
    // Turning the outer knob on from the first cell, the cursor visits exactly these cells of the identifier row.
    it('has three character cells (3-20, 5-18)', async () => {
        const unit = await abcWithCursor();
        const cols = new Set<number>();

        for (let i = 0; i < 6; i++) {
            const {row, col} = unit.panel.focused('R');
            if (row === 0) cols.add(col);
            await unit.panel.outer('R', 1);
        }

        expect([...cols].sort((a, b) => a - b)).toEqual([13, 14, 15]);
    });

    // 3-20 (figures 3-67 to 3-70): the VOR page offers the first VOR that begins with the characters entered. K offers
    // KSA, not the airport K00 or the NDB KNB. A to K is ten clicks clockwise
    it('offers a VOR, not the airport or the NDB that sort first (3-20)', async () => {
        const unit = await abcWithCursor();

        await unit.panel.inner('R', 10);

        expect(Screen.read().rows('R')[0].slice(0, 4)).toBe(' KSA');
        expect(vorIdent(unit)).toBe('KSA');
    });

    // Sibling of the VORTAC test below: the same entry offers a VOR-DME named ADM. B to D is two clicks clockwise
    it('offers the VOR-DME ADM after AD (3-20)', async () => {
        const unit = await abcWithCursor(vor('ADM', 47.3, 8.3, {type: VorType.VORDME, name: 'ARDMORE'}));
        await unit.panel.outer('R', 1);

        await unit.panel.inner('R', 2);

        expect(vorIdent(unit)).toBe('ADM');
    });

    // 3-20 and 3-49: a VORTAC is a VOR of the database (figures 3-151 and 3-152 show VORTACs on the VOR page), so the
    // autocompletion offers it as it offers a VOR-DME (#276)
    it('offers the VORTAC ADM after AD (3-20, 3-49, #276)', async () => {
        const unit = await abcWithCursor(vor('ADM', 47.3, 8.3, {type: VorType.VORTAC, name: 'ARDMORE'}));
        await unit.panel.outer('R', 1);

        await unit.panel.inner('R', 2);

        expect(vorIdent(unit)).toBe('ADM');
    });

    // A localizer and a VOT are VOR facilities of the sim (VorType.ILS and VorType.VOT) that the VOR ident search returns.
    // The database list of the guide (2-1) names VORs with their DME indicator and no localizers or test transmitters,
    // but it does not say that they are left out of the VOR page, so this holds what the code does today: nothing is
    // offered, and a four-character localizer ident does not turn up in the three cells
    it.each([['localizer', VorType.ILS], ['VOT', VorType.VOT]])('does not offer a %s after AD (characterization)', async (_name, type) => {
        const unit = await abcWithCursor(vor('ADM', 47.3, 8.3, {type}));
        await unit.panel.outer('R', 1);

        await unit.panel.inner('R', 2);

        expect(vorIdent(unit)).toBeUndefined();
    });

    // The selector leaves out a station of the type TACAN: the nearest list of the VOR page leaves out TACAN too,
    // and no page of the guide shows one. What the real unit does with a TACAN-only station is not known, so
    // this holds only what the code does today: nothing is offered and the user VOR creation opens
    it('does not offer a TACAN station after AD (characterization)', async () => {
        const unit = await abcWithCursor(vor('ADM', 47.3, 8.3, {type: VorType.TACAN, name: 'ARDMORE'}));
        await unit.panel.outer('R', 1);

        await unit.panel.inner('R', 2);

        expect(vorIdent(unit)).toBeUndefined();
    });
});
