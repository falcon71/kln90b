import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {EventBus} from '@microsoft/msfs-sdk';
import {DistanceEditor} from '../../../../kln90b/controls/editors/DistanceEditor';
import {vor} from '../../../harness/navdata/builders';
import {mount} from '../../../harness/render/mount';
import {Screen} from '../../../harness/render/screen';
import {userWaypoints} from '../../../harness/readers';
import {blinkCycle} from '../../../harness/render/blink';
import {savedUserWaypoints} from '../../../harness/storage';
import {collectStatusMessages} from '../../../harness/statusLine';
import {pointFrom} from '../../../harness/flight/geo';

/**
 * DistanceEditor is the DIS field of the INT and SUP pages. The host here is the INT page of QQI, a stored user
 * intersection 6.0 NM due north of the VOR MKC (no magnetic variation anywhere, so the radial is 000 either way, #280).
 * An entered distance moves QQI along the 000 radial of MKC, and the repository holds the committed value.
 * What every editor shares (CLR, the cursor turned off, the wrap of a digit and of the cursor) is in the tests of the
 * base class; this file holds the rules of the DIS field.
 */
const MKC = {lat: 47.0, lon: 11.0};

async function onDis(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [vor('MKC', MKC.lat, MKC.lon)],
        storage: savedUserWaypoints([{kind: 'int', ident: 'QQI', lat: 47.1, lon: 11.0}]),
        position: {lat: 47, lon: 8},
    });
    await unit.panel.selectPage('R', 'INT  ');
    await vi.advanceTimersByTimeAsync(9000); // REF_CALCULATION_TIME
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', 'MKC');
    await unit.panel.outer('R', 2); // RAD, DIS
    expect(unit.panel.focused('R').row).toBe(3); // precondition: the cursor is on DIS
    return unit;
}

/** The latitude of QQI in the repository */
const qqiLat = (unit: HeadlessUnit): number => userWaypoints(unit).find(f => f.icaoStruct.ident === 'QQI')!.lat;

/** The column of the DIS field's decimal point on the whole screen: DIS:ddd.d starts at column 12 of the right half */
const POINT_COL = 12 + 4 + 3;

describe('DistanceEditor on the INT page (5-19)', () => {
    // 5-19 step 11: the inner knob selects each digit and the outer knob moves to the next one. The first click opens
    // the field with a 0 in the hundreds cell (figure 5-74 shows the open field as 048.1); a digit cell starts at 0 on
    // its first click. 012.5 NM due north of MKC (pointFrom, flight/geo.ts)
    it('takes a distance selected with the knobs (5-19)', async () => {
        const unit = await onDis();
        await unit.panel.inner('R', 1); // opens the field: 0__._
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 2); // 1
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 3); // 2
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 6); // 5
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(qqiLat(unit)).toBeCloseTo(pointFrom(MKC, 0, 12.5).lat, 6);
    });

    // Figure 5-74: the open DIS field shows three digits, the point and the tenth, with its leading zero (DIS:048.1)
    it('shows the open field with its leading zero (5-19, figure 5-74)', async () => {
        const unit = await onDis();
        await unit.panel.type('R', '0481');

        expect(Screen.read().rows('R')[3].slice(0, 9)).toBe('DIS:048.1');
    });

    // Figure 5-74 draws the cursor over the whole open field, the point included (five inverse cells); figures 5-72 and
    // 5-73 do the same for RAD, whose editor inverts its point. DistanceEditor draws the point as plain text
    it.fails('covers the decimal point with the cursor while the distance is entered '
        + '(5-19, figure 5-74, #302)', async () => {
        const unit = await onDis();
        await unit.panel.type('R', '048');

        expect(Screen.read().cell(3, POINT_COL)).toEqual({ch: '.', attr: 'I'});
    });

    // Sibling of the #302 pin: the point is in that cell, the digit in front of it is inverted, and the tenth after
    // it is the cursor's own cell, which flashes (inverse on three display ticks of four, flashing on the fourth)
    it('shows the point between inverted digits while the distance is entered (5-19, figure 5-74)', async () => {
        const unit = await onDis();
        await unit.panel.type('R', '048');

        const reads = await blinkCycle(() => Screen.read());
        expect(reads.map(s => s.cell(3, POINT_COL).ch)).toEqual(['.', '.', '.', '.']);
        expect(reads.map(s => s.cell(3, POINT_COL - 1).attr)).toEqual(['I', 'I', 'I', 'I']);
        expect(reads.map(s => s.cell(3, POINT_COL + 1).attr).sort().join('')).toBe('FIII');
    });

    // Figures 5-75 and 5-76 show the defined waypoint's distance with a blank in front (DIS: 48.1, DIS:  7.0); the open
    // field keeps its zero (figure 5-74), so the blank belongs to the display after ENT
    it('shows the entered distance without the leading zero after ENT '
        + '(5-19, figures 5-75, 5-76, #282)', async () => {
        const unit = await onDis();
        await unit.panel.type('R', '0481');
        await unit.panel.ent();

        expect(Screen.read().rows('R')[3].slice(0, 9)).toBe('DIS: 48.1');
    });

    // Sibling of the #282 test: ENT commits 48.1 NM
    it('moves the waypoint to the distance entered (5-19)', async () => {
        const unit = await onDis();
        await unit.panel.type('R', '0481');
        await unit.panel.ent();

        expect(qqiLat(unit)).toBeCloseTo(pointFrom(MKC, 0, 48.1).lat, 6);
    });

    // Figure 5-74 has three digits before the point, and the KLN 89 trainer (2026-10-07) took 400.0 and 999.9, so the
    // hundreds cell offers 0 to 9: four clicks after the opening 0 give 4
    it('offers the hundreds digits up to 9 (5-19, figure 5-74, '
        + 'checked in the KLN 89 trainer, 2026-10-07, #288)', async () => {
        const unit = await onDis();
        await unit.panel.inner('R', 1); // opens the field with 0
        await unit.panel.inner('R', 4);

        expect(unit.panel.focused('R').text).toBe('4__._');
    });

    // Sibling: three clicks after the opening 0 give 3
    it('steps the hundreds digit up from the opening 0 (5-19)', async () => {
        const unit = await onDis();
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', 3);

        expect(unit.panel.focused('R').text).toBe('3__._');
    });

    // The top of the range: nine clicks after the opening 0 give 9, one more wraps to 0 (a digit cell wraps from 9 to 0,
    // checked in the KLN 89 trainer, 2026-10-08, T4, the same test as for the radial)
    it('wraps the hundreds digit from 9 to 0 (5-19, figure 5-74, checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onDis();
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', 9);
        expect(unit.panel.focused('R').text).toBe('9__._');
        await unit.panel.inner('R', 1);

        expect(unit.panel.focused('R').text).toBe('0__._');
    });

    // The KLN 89 trainer (2026-10-07) took 400.0 and 999.9 without a message; figure 5-74 allows three digits, so 360.0,
    // the first value the radial's limit refused, is taken
    it('accepts a distance of 360.0 NM (5-19, figure 5-74, '
        + 'checked in the KLN 89 trainer, 2026-10-07, #288)', async () => {
        const unit = await onDis();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('R', '3600');
        await unit.panel.ent();

        expect(messages).toEqual([]);
        expect(qqiLat(unit)).toBeCloseTo(pointFrom(MKC, 0, 360).lat, 6);
    });

    // The value below the old limit
    it('accepts a distance of 359.9 NM (5-19)', async () => {
        const unit = await onDis();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('R', '3599');
        await unit.panel.ent();

        expect(messages).toEqual([]);
        expect(qqiLat(unit)).toBeCloseTo(pointFrom(MKC, 0, 359.9).lat, 6);
    });

    // The largest value of the field, which the KLN 89 trainer (2026-10-07) took as an edit without a message
    it('accepts a distance of 999.9 NM (5-19, figure 5-74, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        const unit = await onDis();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('R', '9999');
        await unit.panel.ent();

        expect(messages).toEqual([]);
        expect(qqiLat(unit)).toBeCloseTo(pointFrom(MKC, 0, 999.9).lat, 6);
    });
});

describe('DistanceEditor on its own (5-19)', () => {
    // Figure 5-74: the field shows three digits, the point and the tenth. A stored distance puts each digit into its
    // own cell; no digit of 123.4 equals the one beside it. The editor is mounted on its own, because the closed field
    // of the INT page blanks its leading zeros and its stored distance has too few distinct digits to tell the cells apart
    it('puts each digit of a stored distance into its own cell (5-19, figure 5-74)', () => {
        const editor = new DistanceEditor(new EventBus(), 123.4, () => undefined);

        expect(mount(editor).text()).toBe('123.4');
    });
});

describe('DistanceEditor, an entered distance (3-50, 5-19, #282)', () => {
    // Figures 5-75 and 5-76 show 48.1 and 21.6 after a blank, figure 3-155 shows 3.7 after two blanks (the trainer,
    // 2026-10-07, pads with blanks too)
    it.each([
        [3.7, '  3.7'],
        [48.1, ' 48.1'],
    ])('shows %f as "%s" (figures 3-155, 5-75, 5-76, #282)', (nm, text) => {
        expect(mount(new DistanceEditor(new EventBus(), nm, () => undefined)).text()).toBe(text);
    });

    // No figure shows these three. 12.0 keeps the zero of its tenth; 100.0
    // guards against blanking a zero after a digit; 0.4 follows figure 3-155 and the trainer, against figure 3-159
    // (09.1 below 10 NM)
    it.each([
        [12.0, ' 12.0'],
        [100.0, '100.0'],
        [0.4, '  0.4'],
    ])('characterization: shows %f as "%s" (#282)', (nm, text) => {
        expect(mount(new DistanceEditor(new EventBus(), nm, () => undefined)).text()).toBe(text);
    });
});
