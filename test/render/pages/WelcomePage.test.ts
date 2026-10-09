import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

const TOP_ROW = ' GPS             ORS 20';
const BOTTOM_ROW = ' SELF TEST IN PROGRESS ';

/** A cold-and-dark unit switched on with the given saved settings; the Turn-On page shows after one display tick */
async function powerOnCold(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({engineRunning: false, storage});
    await unit.panel.powerOn();
    return unit;
}

const isTurnOnPage = () => Screen.read().row(0) === TOP_ROW && Screen.read().row(6) === BOTTOM_ROW;

describe('Turn-On page (3-3, 5-28)', () => {
    // 5-28: four personal lines of 23 characters are shown on the Turn-On page each time the unit is switched on, the
    // first of them on the third line of the display (step 3), so the four lines are rows 2 to 5; figure 5-98 shows
    // three of them in use between the copyright row and SELF TEST IN PROGRESS. The texts are invented.
    it('shows the four stored lines on the third to sixth lines of the display at power-on (5-28)', async () => {
        const lines = ['JOHN DOE', '   PILOT OWNER', 'N12345', 'MEDICAL DUE 2027'].map(l => l.padEnd(23, ' '));
        await powerOnCold({welcome1: lines[0], welcome2: lines[1], welcome3: lines[2], welcome4: lines[3]});

        expect(Screen.read().text().split('\n')).toEqual([
            TOP_ROW,
            ' ©1994 ALLIEDSIGNAL INC',
            'JOHN DOE               ',
            '   PILOT OWNER         ',
            'N12345                 ',
            'MEDICAL DUE 2027       ',
            BOTTOM_ROW,
        ]);
    });

    // 3-3, figure 3-3: SELF TEST IN PROGRESS is the one text of the page that is shown inverse (the maintainer read it
    // off the printed figure); the other six rows are plain. The row has a plain cell on each side of the inverse text.
    it('draws only SELF TEST IN PROGRESS inverse (3-3, figure 3-3)', async () => {
        await powerOnCold();

        expect(Screen.read().mask().split('\n')).toEqual([
            ...Array(6).fill('.'.repeat(23)),
            '.' + 'I'.repeat(21) + '.',
        ]);
    });

    // 3-3: the Turn-On page shows for a few seconds, then the Self Test page replaces it. The Maintenance Manual
    // (006-15521-0003 Rev 3, page 1011) says it times out after about 15 s; in the short video the code cites
    // (https://youtube.com/shorts/9We5fcd2-VE) the Self Test page comes up about 18 s after the power knob is pressed.
    // Both bound the page to more than 14 s and less than 19 s after power-on.
    it('replaces the Turn-On page by the Self Test page after 14 s and before 19 s '
        + '(3-3, maintenance manual 1011)', async () => {
        const unit = await powerOnCold();

        await vi.advanceTimersByTimeAsync(14_000 - 250); // powerOn already ran one display tick
        expect(isTurnOnPage()).toBe(true);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(Screen.read().rows('R')[5]).toBe('  APPROVE? ');
        expect(unit.errors).toEqual([]);
    });

    // 5-28 steps 4 to 6: the second to fourth lines are programmed as the first and approved with ENT each; step 5
    // moves the cursor over a whole line with the left outer knob. A line approved is shown at the next power-on. The
    // fourth line is the sixth line of the display (row 5). FreetextEditor.test.ts holds the first line.
    it('keeps a programmed fourth line for the next power-on (5-28)', async () => {
        const unit = await powerOnCold();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3); // the fourth line
        await unit.panel.inner('L', 2); // A (the first click shows the blank)
        await unit.panel.ent();
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);

        await unit.panel.powerCycle();

        expect(isTurnOnPage()).toBe(true);
        expect(Screen.read().text().split('\n').slice(2, 6)).toEqual([
            ' '.repeat(23),
            ' '.repeat(23),
            ' '.repeat(23),
            'A' + ' '.repeat(22),
        ]);
        expect(unit.errors).toEqual([]);
    });

    // 5-28 steps 2 to 6 (an inference, the guide does not say it): the pilot presses the left CRSR while the Turn-On
    // page shows, programs up to four lines and presses the left CRSR again when finished. That procedure takes far
    // longer than the few seconds the page shows on its own, so the page must stay while the left cursor is on.
    it('stays while the left cursor is on (5-28)', async () => {
        const unit = await powerOnCold();
        await unit.panel.cursor('L');

        await vi.advanceTimersByTimeAsync(60_000);

        expect(isTurnOnPage()).toBe(true);
        expect(unit.errors).toEqual([]);
    });
});

describe('Turn-On page (characterization)', () => {
    // How long the page stays after the cursor is turned off is not in the guide. The code moves on at the next display
    // tick once its time is over.
    it('moves on to the Self Test page at once when the cursor is turned off after its time '
        + '(characterization)', async () => {
        const unit = await powerOnCold();
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(30_000);
        expect(isTurnOnPage()).toBe(true);

        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(250);

        expect(Screen.read().rows('R')[5]).toBe('  APPROVE? ');
        expect(unit.errors).toEqual([]);
    });
});
