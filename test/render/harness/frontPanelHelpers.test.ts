import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {airport} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';
import {activeIdent} from '../../harness/readers';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';
import {MessagePage} from '../../../kln90b/controls/MessagePage';

async function booted(opts: Parameters<typeof bootUnit>[0] = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit(opts);
    await settle(unit);
    return unit;
}

/** The last advance of the clock that `run` asks for: the wait a helper ends with */
async function lastWait(run: () => Promise<unknown>): Promise<number> {
    const spy = vi.spyOn(vi, 'advanceTimersByTimeAsync');
    try {
        await run();
        return spy.mock.calls[spy.mock.calls.length - 1][0];
    } finally {
        spy.mockRestore();
    }
}

describe('FrontPanel.directTo (harness)', () => {
    // 3-28: D->, the ident, ENT on the waypoint page and ENT to approve make the waypoint the active one
    it('makes the waypoint active the way a pilot enters a Direct To', async () => {
        const unit = await booted({facilities: [airport('KBBB', 47.2, 8.0)]});
        expect(activeIdent(unit)).toBeUndefined();

        await unit.panel.directTo('KBBB');

        expect(unit.errors).toEqual([]);
        expect(activeIdent(unit)).toBe('KBBB');
    });

    it('waits one second afterwards, or the waitMs given', async () => {
        const unit = await booted({facilities: [airport('KBBB', 47.2, 8.0), airport('KCCC', 47.3, 8.0)]});

        expect(await lastWait(() => unit.panel.directTo('KBBB'))).toBe(1000);
        expect(await lastWait(() => unit.panel.directTo('KCCC', {waitMs: 2500}))).toBe(2500);
    });
});

describe('FrontPanel.show (harness)', () => {
    it('selects the page, waits and returns the six rows of that side', async () => {
        const unit = await booted();

        const rows = await unit.panel.show('L', 'SET 2');

        expect(rows).toHaveLength(6);
        expect(rows).toEqual(Screen.read().rows('L'));
        expect(Screen.read().status().left).toBe('SET 2');
    });

    it('works on the right side too', async () => {
        const unit = await booted();

        const rows = await unit.panel.show('R', 'D/T 1');

        expect(rows).toEqual(Screen.read().rows('R'));
        expect(Screen.read().status().right).toBe('D/T 1');
        expect(Screen.read().status().left).not.toBe('D/T 1');
    });

    it('waits one second after the page shows, or the waitMs given', async () => {
        const unit = await booted();

        expect(await lastWait(() => unit.panel.show('L', 'SET 2'))).toBe(1000);
        expect(await lastWait(() => unit.panel.show('L', 'SET 3', {waitMs: 2500}))).toBe(2500);
    });
});

describe('FrontPanel.enterDate (harness)', () => {
    // 3-53: the date of SET 2 is entered cell by cell, and is read-only while the GPS has a fix, so the unit has none.
    // 1 Jan 2027 is the entry of the #111 pin in Set2Page.test.ts
    it('enters the day, the month and the two year digits of the open editor', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');

        await unit.panel.enterDate('L', 1, 1, [2, 7]);

        expect(Screen.read().rows('L')[2]).toBe('  01 JAN 27');
    });

    it('enters another date by the same clicks', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');

        await unit.panel.enterDate('L', 12, 3, [3, 1]);

        expect(Screen.read().rows('L')[2]).toBe('  12 MAR 31');
    });
});

describe('FrontPanel.enterDate on the right side (harness)', () => {
    // 3-5 step 6: the date of the self-test page is entered with the right knobs while no satellite gives one
    it('enters the date of the self-test page with the right knobs', async () => {
        const unit = await bootToSelfTest({storage: {fastGpsAcquisition: false}});
        // The cursor starts on the baro field (3-6)
        for (let i = 0; unit.panel.focused('R').text !== '01 JUN 26'; i++) {
            if (i >= 7) throw new Error(`no date field
${Screen.read().dump()}`);
            await unit.panel.outer('R', -1);
        }

        await unit.panel.enterDate('R', 3, 8, [2, 5]);

        expect(Screen.read().rows('R')[1]).toBe('  03 AUG 25');
        expect(Screen.read().rows('L')[1]).not.toContain('AUG');
    });
});

describe('FrontPanel.confirmSet1AndReselect (harness)', () => {
    // 3-18: CONFIRM? commits the entered values. That the GPS then holds the track while the aircraft stands still is
    // the harness simulation (moveAircraft in testing.md), not the guide
    it('confirms SET 1, leaves the cursor off and shows SET 1 again', async () => {
        const unit = await booted({position: {lat: 47.5, lon: 11.25}});
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4); // latitude, longitude, ground speed, track
        await unit.panel.inner('L', 1); // opens the track: 0__
        await unit.panel.inner('L', 1); // 1
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4); // 3
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6); // 5
        await unit.panel.ent();

        const select = vi.spyOn(unit.panel, 'selectPage');

        await unit.panel.confirmSet1AndReselect();

        // SET 1 is built anew by leaving it and coming back, which is what makes it read the GPS again
        expect(select.mock.calls).toEqual([['L', 'SET 2'], ['L', 'SET 1']]);
        select.mockRestore();
        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.trackTrue).toBe(135);
        expect(Screen.read().status().left).toBe('SET 1');
        expect(Screen.read().rows('L')[4].slice(7)).toBe('135°');
    });
});

describe('HeadlessUnit.overlay (harness)', () => {
    it('is null while no overlay shows', async () => {
        const unit = await booted();

        expect(unit.overlay()).toBeNull();
    });

    // 3-16: MSG opens the message page over the main page
    it('is the message page after MSG with a message', async () => {
        const unit = await booted();
        unit.props.messageHandler.addMessage(new OneTimeMessage(['A MESSAGE']));

        await unit.panel.msg();

        expect(unit.overlay()).toBeInstanceOf(MessagePage);
    });
});
