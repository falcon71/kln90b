import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';
import {collectStatusMessages} from '../../../harness/statusLine';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

/**
 * VorFreqEditor is the frequency field of the VOR page, editable on a user VOR (5-18). The host here is the VOR page of
 * QQV, a stored user VOR on 113.90 MHz; its ident sorts before the default VOR, so the page opens on it. The repository
 * holds the committed value.
 */
async function onFreq(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        storage: savedUserWaypoints([{kind: 'vor', ident: 'QQV', lat: 47.5, lon: 11.25, freqMHz: 113.9, magvar: 12}]),
    });
    await unit.panel.selectPage('R', 'VOR  ');
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', '113.90');
    // precondition: the cursor is on the frequency
    expect(unit.panel.focused('R')).toEqual({row: 3, col: 12, text: '113.90'});
    return unit;
}

/** The frequency of QQV in the repository */
function qqvFreq(unit: HeadlessUnit): number {
    let freq = NaN;
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => {
        if (f.icaoStruct.ident === 'QQV') freq = (f as any).freqMHz;
    });
    return freq;
}

/** The column of the frequency's decimal point on the whole screen: ddd.dd starts at column 12 of the right half */
const POINT_COL = 12 + 3;

/** Types a frequency with the keyboard and presses ENT; returns the status-line messages it caused */
async function enterFreq(unit: HeadlessUnit, digits: string): Promise<string[]> {
    const messages = collectStatusMessages(unit);
    await unit.panel.type('R', digits);
    await unit.panel.ent();
    return messages;
}

describe('VorFreqEditor on the VOR page (5-18)', () => {
    // 5-18, figure 5-64: a frequency may be stored with the user VOR. The first click opens the field with the 1 of the
    // hundreds cell; a digit cell starts at 0 on its first click. 108.50 MHz
    it('takes a frequency selected with the knobs (5-18, figure 5-64)', async () => {
        const unit = await onFreq();
        await unit.panel.inner('R', 1); // opens the field: 1__.__
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 1); // 0
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 9); // 8
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 6); // 5
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 1); // 0
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(qqvFreq(unit)).toBe(108.5);
        expect(Screen.read().rows('R')[3].slice(0, 6)).toBe('108.50');
    });

});

describe('VorFreqEditor on the VOR page (characterization)', () => {
    // The code draws the decimal point of the frequency inside the inverse block of the cursor, like the RAD field. No
    // figure shows the cursor in the VOR frequency, so this holds what the code does
    it('covers the decimal point with the cursor', async () => {
        await onFreq();

        expect(Screen.read().cell(3, POINT_COL)).toEqual({ch: '.', attr: 'I'});
    });

    // The hundreds cell holds only the 1, and the tens cell offers 0 and 1
    it('keeps the 1 in the hundreds cell and offers 0 and 1 in the tens cell', async () => {
        const unit = await onFreq();
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', 3);
        expect(unit.panel.focused('R').text).toBe('1__.__');
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 2);
        expect(unit.panel.focused('R').text).toBe('11_.__');
        await unit.panel.inner('R', 1);

        expect(unit.panel.focused('R').text).toBe('10_.__');
    });

    // The VOR band ends at 117.95 MHz: 118.00 is refused with INVALID ENT and the stored frequency stays
    it('refuses 118.00 with INVALID ENT', async () => {
        const unit = await onFreq();

        expect(await enterFreq(unit, '11800')).toEqual(['INVALID ENT']);
        expect(qqvFreq(unit)).toBe(113.9);
    });

    // Sibling: 117.95 is taken
    it('takes 117.95', async () => {
        const unit = await onFreq();

        expect(await enterFreq(unit, '11795')).toEqual([]);
        expect(qqvFreq(unit)).toBe(117.95);
    });

    // The band starts at 108.00 MHz: 107.95 is refused
    it('refuses 107.95 with INVALID ENT', async () => {
        const unit = await onFreq();

        expect(await enterFreq(unit, '10795')).toEqual(['INVALID ENT']);
        expect(qqvFreq(unit)).toBe(113.9);
    });

    // Sibling: 108.00 is taken
    it('takes 108.00', async () => {
        const unit = await onFreq();

        expect(await enterFreq(unit, '10800')).toEqual([]);
        expect(qqvFreq(unit)).toBe(108);
    });
});
