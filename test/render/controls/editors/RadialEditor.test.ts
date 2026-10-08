import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {EventBus} from '@microsoft/msfs-sdk';
import {RadialEditor} from '../../../../kln90b/controls/editors/RadialEditor';
import {vor} from '../../../harness/navdata/builders';
import {mount} from '../../../harness/render/mount';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';
import {collectStatusMessages} from '../../../harness/statusLine';
import {distanceNm, pointFrom} from '../../../harness/flight/geo';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

/**
 * RadialEditor is the RAD field of the INT and SUP pages. The host here is the INT page of QQI, a stored user
 * intersection due north of the VOR MKC. No magnetic variation anywhere, so a magnetic and a true radial agree (#280).
 * An entered radial moves QQI around MKC at its distance, and the repository holds the committed value.
 */
const MKC = {lat: 47.0, lon: 11.0};
const QQI = {lat: 47.1, lon: 11.0};

async function onRad(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [vor('MKC', MKC.lat, MKC.lon)],
        storage: savedUserWaypoints([{kind: 'int', ident: 'QQI', ...QQI}]),
        position: {lat: 47, lon: 8},
    });
    await unit.panel.selectPage('R', 'INT  ');
    await vi.advanceTimersByTimeAsync(9000); // REF_CALCULATION_TIME
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', 'MKC');
    await unit.panel.outer('R', 1);
    expect(unit.panel.focused('R')).toEqual({row: 2, col: 17, text: '000.0'}); // precondition: the cursor is on RAD
    return unit;
}

/** QQI in the repository as [lat, lon] */
function qqi(unit: HeadlessUnit): [number, number] {
    let pos: [number, number] = [NaN, NaN];
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => {
        if (f.icaoStruct.ident === 'QQI') pos = [f.lat, f.lon];
    });
    return pos;
}

/** The column of the RAD field's decimal point on the whole screen: RAD: ddd.d starts at column 12 of the right half */
const POINT_COL = 12 + 5 + 3;

describe('RadialEditor on the INT page (5-19)', () => {
    // 5-19 step 9: the inner knob selects each digit, the outer knob moves on, to a tenth of a degree. The first click
    // opens the field with a 0 in the hundreds cell; a digit cell starts at 0 on its first click. 234.8 at QQI's
    // distance from MKC (pointFrom and distanceNm, flight/geo.ts); no digit of it equals the one beside it
    it('takes a radial selected with the knobs (5-19)', async () => {
        const unit = await onRad();
        await unit.panel.inner('R', 1); // opens the field: 0__._
        await unit.panel.inner('R', 2); // 2
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 4); // 3
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 5); // 4
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 9); // 8
        await unit.panel.ent();

        const p = pointFrom(MKC, 234.8, distanceNm(MKC, QQI));
        const [lat, lon] = qqi(unit);
        expect(unit.errors).toEqual([]);
        expect(lat).toBeCloseTo(p.lat, 6);
        expect(lon).toBeCloseTo(p.lon, 6);
    });

    // Figures 5-72 and 5-73: the cursor over RAD is five inverse cells, the point included, both over the dashes and
    // over the selected radial
    it('covers the decimal point with the cursor (5-19, figures 5-72, 5-73)', async () => {
        await onRad();

        expect(Screen.read().cell(2, POINT_COL)).toEqual({ch: '.', attr: 'I'});
    });

    // The same while the radial is being selected (figure 5-73)
    it('covers the decimal point while the radial is entered (5-19, figure 5-73)', async () => {
        const unit = await onRad();
        await unit.panel.type('R', '23');

        expect(Screen.read().cell(2, POINT_COL)).toEqual({ch: '.', attr: 'I'});
    });

    // With the cursor elsewhere the point is plain again (figures 5-74 and 5-75 show RAD without the cursor)
    it('shows the point plain without the cursor (5-19, figure 5-74)', async () => {
        const unit = await onRad();
        await unit.panel.outer('R', 1); // DIS

        expect(Screen.read().cell(2, POINT_COL)).toEqual({ch: '.', attr: '.'});
    });
});

describe('RadialEditor limits (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08: no radial above 359.9 can be entered (the 89 offers the hundreds and
    // the tens as one block from 00 to 35). The 90B has no such block; its editor refuses 360.0, and QQI stays where it
    // was. QQI starts due north of MKC, where a radial of 360 would put it on the same point as 000, so the test first
    // moves it to the 090 radial and offers 360.0 from there
    it('takes no radial above 359.9: 360.0 changes nothing (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onRad();
        await unit.panel.type('R', '0900');
        await unit.panel.ent(); // QQI moves to the 090 radial, the cursor goes on to DIS
        await unit.panel.outer('R', -1); // RAD again
        await unit.panel.type('R', '3600');
        await unit.panel.ent();

        const p = pointFrom(MKC, 90, distanceNm(MKC, QQI));
        const [lat, lon] = qqi(unit);
        expect(lat).toBeCloseTo(p.lat, 6);
        expect(lon).toBeCloseTo(p.lon, 6);
    });

    // Sibling: 359.9, the largest radial the 89 takes, is taken (checked in the KLN 89 trainer, 2026-10-08)
    it('takes 359.9 (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onRad();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('R', '3599');
        await unit.panel.ent();

        expect(messages).toEqual([]);
        const p = pointFrom(MKC, 359.9, distanceNm(MKC, QQI));
        expect(qqi(unit)[1]).toBeCloseTo(p.lon, 6);
    });

    // Checked in the KLN 89 trainer, 2026-10-08: a digit cell wraps from 9 to 0 (the units of its latitude do). The
    // tens cell of the radial is such a cell: ten clicks after the opening 0 give 9, one more gives 0
    it('wraps a digit cell from 9 to 0 (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onRad();
        await unit.panel.inner('R', 1); // opens the field: 0__._
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 10);
        expect(unit.panel.focused('R').text).toBe('09_._');
        await unit.panel.inner('R', 1);

        expect(unit.panel.focused('R').text).toBe('00_._');
    });
});

describe('RadialEditor on its own (5-19)', () => {
    // Figures 5-72 and 5-73: the field shows three digits, the point and the tenth. A stored radial puts each digit
    // into its own cell; no digit of 123.4 equals the one beside it. The editor is mounted on its own, because the INT
    // page shows the final bearing at the intersection instead of the stored radial (#281), and every radial it could
    // show without that bug has too few distinct digits to tell the cells apart
    it('puts each digit of a stored radial into its own cell (5-19, figures 5-72, 5-73)', () => {
        const editor = new RadialEditor(new EventBus(), 123.4, () => undefined);

        expect(mount(editor).text()).toBe('123.4');
    });
});

describe('RadialEditor on the INT page (characterization)', () => {
    // The status line text of the refusal of 360.0 is the code's own choice
    it('shows INVALID ENT for 360.0', async () => {
        const unit = await onRad();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('R', '3600');
        await unit.panel.ent();

        expect(messages).toEqual(['INVALID ENT']);
    });

    // The hundreds cell offers 0 to 3 and wraps: three clicks after the opening 0 give 3, one more gives 0
    it('wraps the hundreds cell from 3 to 0', async () => {
        const unit = await onRad();
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', 3);
        expect(unit.panel.focused('R').text).toBe('3__._');
        await unit.panel.inner('R', 1);

        expect(unit.panel.focused('R').text).toBe('0__._');
    });
});
