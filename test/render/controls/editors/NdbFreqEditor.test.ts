import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {blinkCycle} from '../../../harness/render/blink';
import {savedUserWaypoints} from '../../../harness/storage';
import {collectStatusMessages} from '../../../harness/statusLine';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

/**
 * NdbFreqEditor is the FREQ field of the NDB page, editable on a user NDB (5-18). The host here is the NDB page of QQN,
 * a stored user NDB on 328.0 kHz (the frequency of figure 5-66); its ident sorts before the default NDB, so the page
 * opens on it. The repository holds the committed value (an NDB's freqMHz holds kHz, as the sim's facilities do).
 */
async function onFreq(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        storage: savedUserWaypoints([{kind: 'ndb', ident: 'QQN', lat: 47.5, lon: 11.25, freqKHz: 328.0}]),
    });
    await unit.panel.selectPage('R', 'NDB  ');
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', '328.0');
    expect(unit.panel.focused('R').row).toBe(3); // precondition: the cursor is on FREQ
    return unit;
}

/** The frequency of QQN in the repository */
function qqnFreq(unit: HeadlessUnit): number {
    let freq = NaN;
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => {
        if (f.icaoStruct.ident === 'QQN') freq = (f as any).freqMHz;
    });
    return freq;
}

/** The column of the FREQ field's decimal point on the whole screen: FREQ dddd.d starts at column 12 of the right
 * half */
const POINT_COL = 12 + 5 + 4;

/** With the cursor on FREQ: 350.0 selected with the knobs, not entered */
async function select350(unit: HeadlessUnit): Promise<void> {
    await unit.panel.inner('R', 1); // opens the field: the thousands cell blank, the others dashed
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 4); // 3
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 6); // 5
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 1); // 0
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 1); // 0
}

describe('NdbFreqEditor on the NDB page (5-18)', () => {
    // Figure 5-66: the stored frequency shows with a blank in the thousands place (FREQ  328.0)
    it('shows the stored frequency with a blank thousands place (5-18, figure 5-66)', async () => {
        await onFreq();

        expect(Screen.read().rows('R')[3]).toBe('FREQ  328.0');
    });

    // 5-18: an NDB frequency may be stored with the user NDB. NdbFreqEditor.convertToValue adds the cells as numbers
    // (0 + 3 + 5 + 0 = 8, so 8.0 kHz) and refuses every frequency with INVALID ENT
    it.fails('takes a frequency selected with the knobs (5-18, figure 5-66, #277)', async () => {
        const unit = await onFreq();
        const messages = collectStatusMessages(unit);
        await select350(unit);
        await unit.panel.ent();

        expect(messages).toEqual([]);
        expect(qqnFreq(unit)).toBe(350);
    });

    // Sibling of the #277 pin: the knobs reach every cell and show 350.0 before ENT
    it('shows the frequency selected with the knobs before ENT (5-18)', async () => {
        const unit = await onFreq();
        await select350(unit);

        expect(Screen.read().rows('R')[3]).toBe('FREQ  350.0');
    });

    // Figures 5-72 to 5-74 draw the cursor over the RAD and DIS fields of the same chapter with their decimal point
    // inside the inverse block; no figure shows the cursor in the NDB frequency, so this pin extends those figures to
    // it (the guide's rule, not a figure of this field). NdbFreqEditor draws the point as plain text
    it.fails('covers the decimal point with the cursor while the frequency is entered '
        + '(5-18, extends figures 5-72 to 5-74, #NEW-0-1)', async () => {
        const unit = await onFreq();
        await select350(unit);

        expect(Screen.read().cell(3, POINT_COL)).toEqual({ch: '.', attr: 'I'});
    });

    // Sibling of the #NEW-0-1 pin: the point is in that cell, the digit in front of it is inverted, and the tenth after
    // it is the cursor's own cell, which flashes (inverse on three display ticks of four, flashing on the fourth)
    it('shows the point between inverted digits while the frequency is entered (5-18)', async () => {
        const unit = await onFreq();
        await select350(unit);

        const reads = await blinkCycle(() => Screen.read());
        expect(reads.map(s => s.cell(3, POINT_COL).ch)).toEqual(['.', '.', '.', '.']);
        expect(reads.map(s => s.cell(3, POINT_COL - 1).attr)).toEqual(['I', 'I', 'I', 'I']);
        expect(reads.map(s => s.cell(3, POINT_COL + 1).attr).sort().join('')).toBe('FIII');
    });
});

describe('NdbFreqEditor on the NDB page (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08: a cell wraps past its last choice. The thousands cell of the 90B
    // offers a blank and 1 only (the 89 has no user NDB); two clicks after the opening blank come back to it
    it('wraps the thousands cell from 1 to the blank (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onFreq();
        await unit.panel.inner('R', 1); // opens the field with the blank
        await unit.panel.inner('R', 1);
        expect(unit.panel.focused('R').text).toBe('1___._');
        await unit.panel.inner('R', 1);

        expect(unit.panel.focused('R').text).toBe(' ___._');
    });
});

describe('NdbFreqEditor keyboard', () => {
    // #109's suggested fix maps a typed 0 to the blank of a cell whose charset has a blank instead of a 0 (the
    // keyboard is the project's own feature, so the expectation is that issue's, not the guide's). Today the 0 is
    // refused, the cursor stays on the thousands cell, and so are 3, 5 and 0 after it
    it.fails('types a frequency below 1000 kHz with a leading 0 (#109)', async () => {
        const unit = await onFreq();
        await unit.panel.type('R', '03500');

        expect(Screen.read().rows('R')[3]).toBe('FREQ  350.0');
    });

    // Sibling of the pin: the keyboard reaches the field and fills the cells that follow a blank thousands cell. A
    // pilot cannot type that blank (the PC keyboard sends A to Z and 0 to 9, KLN90BCore.handleKeyboardEvent), so the
    // inner knob sets it and the outer knob moves on
    it('types the digits after a blank thousands cell set with the knob (characterization)', async () => {
        const unit = await onFreq();
        await unit.panel.inner('R', 1); // opens the field on the blank
        await unit.panel.outer('R', 1);
        await unit.panel.type('R', '3500');

        expect(Screen.read().rows('R')[3]).toBe('FREQ  350.0');
    });
});
