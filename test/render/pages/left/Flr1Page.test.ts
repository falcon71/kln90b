import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {EVT_ENT} from '../../../../kln90b/HEvents';
import {collectStatusMessages} from '../../../harness/statusLine';
import {Flr2Page} from '../../../../kln90b/pages/left/Flr2Page';
import {Flr3Page} from '../../../../kln90b/pages/left/Flr3Page';
import {openFlr1, openFlr2, rows} from '../../../harness/render/flrPages';

// #458: the FLR pages are fictional, as SET 10 is; the unit has no such pages. FLR 1 and the container FlrPage, which
// turns FLR 1 to FLR 3 with the inner knob: docs/failures.md, "UI". FLR 2 and FLR 3 are in Flr2Page.test.ts and
// Flr3Page.test.ts

describe('FLR 1 (#458)', () => {
    it('the default screen', async () => {
        const unit = await bootUnit();
        await openFlr1(unit);

        expect(unit.errors).toEqual([]);
        expect(rows()).toEqual(['MTBF:   OFF', 'BATTERY 100', '', '', '', 'SERVICE?']);
    });

    it('MTBF entry', async () => {
        const unit = await bootUnit();
        await openFlr1(unit);
        await unit.panel.cursor('L');

        await unit.panel.type('L', '015');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[0]).toBe('MTBF:   15H');
        expect(unit.props.failures.mtbfHours).toBe(15);

        await unit.panel.cursorTo('L', '15H');
        await unit.panel.type('L', '999');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[0]).toBe('MTBF:  999H');
        expect(unit.props.failures.mtbfHours).toBe(999);

        await unit.panel.cursorTo('L', '999H');
        await unit.panel.type('L', '000');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[0]).toBe('MTBF:   OFF');
        expect(unit.props.failures.mtbfHours).toBe(0);
        expect(unit.errors).toEqual([]);
    });

    it('CLR on the field turns the failures off', async () => {
        const unit = await bootUnit();
        unit.props.failures.setMtbfHours(15);
        await openFlr1(unit);
        expect(rows()[0]).toBe('MTBF:   15H');
        await unit.panel.cursor('L');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()[0]).toBe('MTBF:   OFF');
        expect(unit.props.failures.mtbfHours).toBe(0);
    });

    it('SERVICE? needs CONFIRM?', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        unit.props.failures.fail('rs232In');
        await openFlr1(unit);
        const messages = collectStatusMessages(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'SERVICE?');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[5]).toBe('CONFIRM?');
        expect(Screen.read().status().left).toBe('CRSR'); //The question keeps the cursor
        expect(unit.props.failures.activeList().length).toBe(2);

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.failures.activeList()).toEqual([]);
        expect(messages).toContain('SERVICED');
        expect(rows()[5]).toBe('SERVICE?');
        //The service done, the cursor goes off (maintainer, 2026-11-04)
        expect(Screen.read().status().left).toBe('FLR 1');
        expect(unit.errors).toEqual([]);
    });

    // CLAUDE.md: the DOM changes only inside a display tick, so the question shows at the next tick, not at the key
    it('SERVICE? changes its text only in a display tick', async () => {
        const unit = await bootUnit();
        await openFlr1(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'SERVICE?');

        unit.send(EVT_ENT);
        await vi.advanceTimersByTimeAsync(0); // Lets the handler finish, no display tick runs
        expect(rows()[5]).toBe('SERVICE?');

        await vi.advanceTimersByTimeAsync(250);
        expect(rows()[5]).toBe('CONFIRM?');
    });

    it('CLR at CONFIRM? cancels', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('altitude');
        await openFlr1(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'SERVICE?');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[5]).toBe('CONFIRM?');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()[5]).toBe('SERVICE?');
        expect(unit.props.failures.activeList().length).toBe(1);
    });

    it('the knobs', async () => {
        // What an outer step from SET 10 shows, read on the unit before it opens FLR 1
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 10');
        await unit.panel.outer('L', 1);
        const afterOuter = Screen.read().status().left;
        await unit.panel.outer('L', -1);
        expect(Screen.read().status().left).toBe('SET10'); // Precondition: back on SET 10
        await openFlr1(unit);
        await unit.panel.inner('L', 1);
        expect(Screen.read().status().left).toBe('FLR 2');
        await unit.panel.inner('L', 1);
        expect(Screen.read().status().left).toBe('FLR 3');
        await unit.panel.inner('L', 1);
        expect(Screen.read().status().left).toBe('FLR 1');

        await unit.panel.outer('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().status().left).toBe(afterOuter);
        expect(unit.errors).toEqual([]);
    });
});

describe('FLR 1 battery (#461)', () => {
    // Characterization: the percent is the charge rounded up (the display rule of Battery.displayPercent)
    it('shows the charge rounded up', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 42.01}});
        await openFlr1(unit);
        expect(rows()[1]).toBe('BATTERY  43');
        expect(unit.errors).toEqual([]);
    });

    it('shows an empty battery as 0', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 0}});
        await openFlr1(unit);
        expect(rows()[1]).toBe('BATTERY   0');
    });

    it('SERVICE? gives a new battery and repairs the battery failure', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 3, failure_battery: '{}'}});
        await openFlr1(unit);
        expect(rows()[1]).toBe('BATTERY   3'); // Precondition
        expect(unit.props.failures.isActive('battery')).toBe(true); // Precondition
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'SERVICE?');

        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()[1]).toBe('BATTERY 100');
        expect(unit.props.failures.isActive('battery')).toBe(false);
        expect(unit.errors).toEqual([]);
    });

    // The service is on FLR 1 only: repairing the failure on FLR 2 does not charge the battery
    it('repairing BATTERY on FLR 2 leaves the charge', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 3, failure_battery: '{}'}});
        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'BATTERY');
        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.failures.isActive('battery')).toBe(false);

        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[1]).toBe('BATTERY   3');
    });
});

describe('the FLR sub pages are destroyed (#96, #458)', () => {
    it('on an inner step and on closing the FLR pages', async () => {
        const destroy2 = vi.spyOn(Flr2Page.prototype, 'destroy');
        const destroy3 = vi.spyOn(Flr3Page.prototype, 'destroy');
        try {
            const unit = await bootUnit();
            await openFlr1(unit);
            await unit.panel.inner('L', 1); // FLR 2
            expect(destroy2).toHaveBeenCalledTimes(0);
            await unit.panel.inner('L', 1); // FLR 3: FLR 2 is replaced
            expect(destroy2).toHaveBeenCalledTimes(1);
            expect(destroy3).toHaveBeenCalledTimes(0);

            await unit.panel.outer('L', 1); // Closes the FLR pages
            await vi.advanceTimersByTimeAsync(1000);
            expect(destroy3).toHaveBeenCalledTimes(1);
            expect(destroy2).toHaveBeenCalledTimes(1);
            expect(unit.errors).toEqual([]);
        } finally {
            destroy2.mockRestore();
            destroy3.mockRestore();
        }
    });
});
