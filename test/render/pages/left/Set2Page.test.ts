import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {OneTimeMessage} from '../../../../kln90b/data/MessageHandler';

describe('SET 2 page', () => {
    // 3-53, 5-14: the figures of SET 2 and CAL 6 show the first zone as CORD UNIV/Z. The half page is 11 characters
    // wide, and the name of the first timezone has 12
    it.fails('fits the screen with the default timezone (#110)', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', 1);

        expect(Screen.read().leftName()).toBe('SET 2');
        expect(Screen.read().half('L').split('\n')[4]).toBe('CORD UNIV/Z');
    });

    // Appendix B (B-1, B-3) lists the message as RECYCLE POWER TO USE CORRECT DATA BASE DATA
    it.fails('spells the message about a changed database validity correctly (#111)', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false, timezone: 1}});
        // A booted unit has a fix at once, and the date is read-only with a fix
        unit.props.sensors.in.gps.reset();
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', 1);
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // day 01
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // JAN
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3); // the first click enters a 0, so this is a 2
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8); // a 7
        expect(Screen.read().half('L').split('\n')[2]).toBe('  01 JAN 27');
        await unit.panel.ent(); // 1 Jan 2027 is after the expiration of the database

        expect(unit.errors).toEqual([]);
        expect(unit.props.database.isAiracCurrent()).toBe(false);
        const messages = unit.props.messageHandler.getMessages().map(m => (m as OneTimeMessage).message);
        expect(messages).toContainEqual(['RECYCLE POWER TO USE', 'CORRECT DATA BASE DATA']);
    });
});
