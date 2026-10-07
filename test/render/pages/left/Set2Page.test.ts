import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {OneTimeMessage} from '../../../../kln90b/data/MessageHandler';

describe('SET 2 page', () => {
    // 3-53, 5-14: the figures of SET 2 and CAL 6 show the first zone as CORD UNIV/Z. The half page is 11 characters
    // wide, and the name of the first timezone has 12
    it('fits the screen with the default timezone (#110)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 2');

        expect(Screen.read().rows('L')[4]).toBe('CORD UNIV/Z');
    });

    // Appendix B (B-1, B-3) lists the message as RECYCLE POWER TO USE CORRECT DATA BASE DATA
    it.fails('spells the message about a changed database validity correctly (#111)', async () => {
        // A booted unit has a fix at once, and the date is read-only with a fix
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // day 01
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // JAN
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3); // the first click enters a 0, so this is a 2
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8); // a 7
        expect(Screen.read().rows('L')[2]).toBe('  01 JAN 27');
        await unit.panel.ent(); // 1 Jan 2027 is after the expiration of the database

        expect(unit.errors).toEqual([]);
        expect(unit.props.database.isAiracCurrent()).toBe(false);
        const messages = unit.props.messageHandler.getMessages().map(m => (m as OneTimeMessage).message);
        expect(messages).toContainEqual(['RECYCLE POWER TO USE', 'CORRECT DATA BASE DATA']);
    });
});

/** The mask of the left half page's rows 2 and 3: the date, and the time with its zone */
const dateTimeMask = () => Screen.read().maskRows('L').slice(2, 4);

const ON_DATE = ['..IIIIIIIII', '...........'];
const ON_TIME = ['...........', 'IIIII......'];
const ON_ZONE = ['...........', '........III'];

// 3-53: the date and time cannot be set while the unit receives them from a satellite. SET 2 makes both read-only at the
// first fix, which leaves the time zone as the only field (the magnetic variation is read-only while it is valid, 5-44).
describe('SET 2 cursor when the GPS gets its first fix (3-53)', () => {
    // Holds the setup of the pins below: a cold unit lets the cursor on the date and the time, and after the fix a SET 2
    // page built anew puts it on the time zone
    it('moves the cursor over the date and the time without a fix, and only the time zone is left after it', async () => {
        const unit = await bootUnit({coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        expect(dateTimeMask()).toEqual(ON_DATE);
        await unit.panel.outer('L', 1);
        expect(dateTimeMask()).toEqual(ON_TIME);
        await unit.panel.cursor('L');

        await settle(unit);
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(dateTimeMask()).toEqual(ON_ZONE);
    });

    // CursorController.setCursorActive clamps the remembered field to fields.length instead of fields.length - 1
    // (CursorController.ts:123), so the cursor comes on at a field that is gone and throws
    it.fails('turns the cursor on at the time zone when it was on the time before the fix (#NEW-5-2)', async () => {
        const unit = await bootUnit({coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.cursor('L');
        await settle(unit);

        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(dateTimeMask()).toEqual(ON_ZONE);
    });

    // Nothing moves the cursor when the focused field turns read-only under it, so every display tick asks a field that is
    // gone whether it takes ENT, and throws
    it.fails('stays usable when the fix comes while the cursor is on the time (#NEW-5-2)', async () => {
        const unit = await bootUnit({coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);

        await settle(unit);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
    });
});
