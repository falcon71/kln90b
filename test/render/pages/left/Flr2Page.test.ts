import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {FailureKey} from '../../../../kln90b/failures/FailureCatalog';
import {openFlr2, rows} from '../../../harness/render/flrPages';

// #458: FLR 2, the active failures (docs/failures.md, "UI"). The page is fictional, as SET 10 is

describe('FLR 2 (#458)', () => {
    it('lists the active failures in order', async () => {
        const unit = await bootUnit();
        for (const key of ['rs232In', 'altitude', 'arinc429Out'] as FailureKey[]) {
            unit.props.failures.fail(key);
        }
        await openFlr2(unit);

        expect(Screen.read().status().left).toBe('FLR 2');
        expect(rows()).toEqual(['  ACTIVE', '429 OUTPUT', 'ALTITUDE', 'RS-232 IN', '', '']);
        expect(unit.errors).toEqual([]);
    });

    it('repairs with CLR, ENT', async () => {
        const unit = await bootUnit();
        for (const key of ['rs232In', 'altitude', 'arinc429Out'] as FailureKey[]) {
            unit.props.failures.fail(key);
        }
        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'ALTITUDE');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[2]).toBe('REPAIR    ?');
        expect(unit.props.failures.isActive('altitude')).toBe(true);

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.failures.isActive('altitude')).toBe(false);
        expect(rows()).toEqual(['  ACTIVE', '429 OUTPUT', 'RS-232 IN', '', '', '']);
        expect(unit.errors).toEqual([]);
    });

    it('CLR at the prompt cancels', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[1]).toBe('REPAIR    ?');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()[1]).toBe('ALTITUDE');
        expect(unit.props.failures.isActive('altitude')).toBe(true);
    });

    it('ENT alone does not repair', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        await openFlr2(unit);
        await unit.panel.cursor('L');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()[1]).toBe('ALTITUDE');
        expect(unit.props.failures.isActive('altitude')).toBe(true);
    });

    it('empty', async () => {
        const unit = await bootUnit();
        await openFlr2(unit);

        expect(rows()).toEqual(['  ACTIVE', '', '', '', '', '']);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().status().left).toBe('FLR 2');
        expect(unit.errors).toEqual([]);
    });

    it('repairing the last entry leaves an empty list and the cursor off', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.clr();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()).toEqual(['  ACTIVE', '', '', '', '', '']);
        expect(Screen.read().status().left).toBe('FLR 2'); // The cursor is off: the page name shows
        expect(unit.errors).toEqual([]);
    });

    it('failures repaired from elsewhere while FLR 2 is shown', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        unit.props.failures.fail('arinc429Out');
        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'ALTITUDE');

        unit.props.failures.repairAll();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()).toEqual(['  ACTIVE', '', '', '', '', '']);
        expect(unit.errors).toEqual([]);
    });

    it('the cursor stays visible on a valid entry when its entry is repaired from elsewhere', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        unit.props.failures.fail('arinc429Out');
        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'ALTITUDE');

        unit.props.failures.repair('altitude');
        await vi.advanceTimersByTimeAsync(250); // One display tick, no key since: the cursor has moved by itself

        expect(rows()).toEqual(['  ACTIVE', '429 OUTPUT', '', '', '', '']);
        expect(unit.panel.focused('L').text.trim()).toBe('429 OUTPUT');
    });

    it('the cursor is off after its only entry is repaired from elsewhere: the next inner step turns the page', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        await openFlr2(unit);
        await unit.panel.cursor('L');

        unit.props.failures.repair('altitude');
        await vi.advanceTimersByTimeAsync(250);
        await unit.panel.inner('L', 1);

        expect(Screen.read().status().left).toBe('FLR 3');
        expect(unit.errors).toEqual([]);
    });
});
