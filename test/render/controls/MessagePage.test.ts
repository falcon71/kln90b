import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {airport} from '../../harness/navdata/builders';
import {blinkCycle} from '../../harness/render/blink';
import {Screen} from '../../harness/render/screen';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';

/** The six text rows of the MSG page, trimmed */
const msgRows = () => Array.from({length: 6}, (_, r) => Screen.read().row(r).trimEnd());

/**
 * The text and the mask of the msg prompt (row 6, cells 14 to 16) on 8 display ticks (two blink cycles of four), which
 * must flash: the flashing phase on one tick in four (the blink tick), the steady phase on the other three, and on the
 * same tick of both cycles. A set of the values over two seconds would also accept the phases swapped
 */
async function expectPromptFlashing(steady: string, flashing: string): Promise<void> {
    const prompt = () => {
        const s = Screen.read();
        return `${s.row(6).slice(14, 17)} ${s.mask().split('\n')[6].slice(14, 17)}`;
    };
    const first = await blinkCycle(prompt);
    const cycles = [first, await blinkCycle(prompt)];
    const expected = [steady, steady, steady, flashing].sort();
    expect(cycles.map(c => [...c].sort())).toEqual([expected, expected]);
    expect(cycles[1].indexOf(flashing)).toBe(cycles[0].indexOf(flashing));
}

/** KBBB 0.6 NM north of the aircraft, after the first nearest search (every 10 s), so that MSG then ENT has a target */
async function bootNearKbbb(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('KBBB', 47.2, 8.0)], position: {lat: 47.19, lon: 8.0}});
    await vi.advanceTimersByTimeAsync(12000);
    return unit;
}

/** Reads the boot messages (testing.md section 6): MSG until the page closes, then the one-time messages go */
async function readAll(unit: HeadlessUnit): Promise<void> {
    await unit.panel.msg();
    for (let i = 0; i < 10 && Screen.read().status().left === ''; i++) {
        await unit.panel.msg();
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(unit.props.messageHandler.getMessages()).toEqual([]); // the precondition: nothing is left to read
}

describe('MSG page (spec)', () => {
    // 3-23: on the MSG page, ENT shows the waypoint page of the nearest airport on the right. 3-16: leaving the MSG
    // page returns to the pages that were in view before (the left page, NAV 2, was the one before the MSG page)
    it('shows the nearest airport on APT 1 when ENT is pressed on the MSG page (3-23, 3-16)', async () => {
        const unit = await bootNearKbbb();
        await unit.panel.msg();
        expect(Screen.read().status().left).toBe(''); // the precondition: the MSG page is up

        await unit.panel.ent();

        const screen = Screen.read();
        expect([screen.status().left, screen.status().right]).toEqual(['NAV 2', 'APT 1']);
        expect(screen.rows('R')[0]).toBe(' KBBB  nr 1');
    });

    // 3-16, figure 3-56: a message of several lines starts each further line one cell in
    it('starts the further lines of a message one cell in (3-16, figure 3-56)', async () => {
        const unit = await bootUnit();
        await readAll(unit);
        unit.props.messageHandler.addMessage(new OneTimeMessage(['FIRST LINE', 'SECOND LINE', 'THIRD LINE']));

        await unit.panel.msg();

        expect(msgRows().slice(0, 4)).toEqual(['FIRST LINE', ' SECOND LINE', ' THIRD LINE', '']);
    });
});

describe('MSG page, a message on a later page (#191)', () => {
    /**
     * After the boot messages are read: three one-time messages of three lines each. Newest first (3-16), THREE and TWO
     * fill the first MSG page and ONE is on the second. MSG shows the first page, and ENT leaves the MSG page for the
     * nearest airport (3-23) before the second page was shown.
     */
    async function leaveAfterTheFirstPage(): Promise<HeadlessUnit> {
        const unit = await bootNearKbbb();
        await readAll(unit);
        for (const text of ['ONE', 'TWO', 'THREE']) {
            unit.props.messageHandler.addMessage(new OneTimeMessage([`${text} A`, `${text} B`, `${text} C`]));
        }
        await unit.panel.msg();
        expect(msgRows()).toEqual(['THREE A', ' THREE B', ' THREE C', 'TWO A', ' TWO B', ' TWO C']);
        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('APT 1'); // ENT left the MSG page
        await vi.advanceTimersByTimeAsync(1000); // a calculation tick drops the one-time messages that were read
        return unit;
    }

    // The preconditions of the pin below rest on 3-16 (newest first, two messages on the first page) and 3-23 (ENT
    // leaves the MSG page). That a one-time message that was on the screen is gone once the page was left is not in the
    // guide: checked in the KLN 89 trainer, 2026-10-08 (T29)
    it('drops the messages shown on the first page once read (sibling of #191) (3-16, KLN 89 trainer 2026-10-08)',
        async () => {
            const unit = await leaveAfterTheFirstPage();

            const texts = unit.props.messageHandler.getMessages().map(m => m.message[0]);
            expect(texts).not.toContain('THREE A');
            expect(texts).not.toContain('TWO A');
        });

    // 3-16: the prompt flashes while a message has not been viewed; ONE was never on the screen. Checked in the KLN 89
    // trainer, 2026-10-08 (T29): after leaving the first of two MSG pages (there with the outer knob, here with ENT,
    // 3-23) the prompt kept flashing and the message of the second page was still there
    it.fails('keeps the message of the unseen second page and flashes msg (3-16, KLN 89 trainer 2026-10-08, #191)',
        async () => {
            const unit = await leaveAfterTheFirstPage();

            expect(unit.props.messageHandler.getMessages().map(m => m.message[0])).toEqual(['ONE A']);
            await expectPromptFlashing('msg III', 'msg FFF');
        });
});
