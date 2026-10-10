import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {fuelComputer, panelXml} from '../../harness/panelXml';
import {messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';

/** The six text rows of the MSG page, trimmed */
const msgRows = () => Array.from({length: 6}, (_, r) => Screen.read().row(r).trimEnd());

/** Reads every message off the MSG page (it throws if the page does not close), which lets the read one-time messages go */
async function readAll(unit: HeadlessUnit) {
    await unit.panel.readMessages();
    expect(messages(unit)).toEqual([]); // The precondition: nothing is left to read
}

describe('the MSG page as the place a message is read (3-16)', () => {
    // 3-16: the newest message comes first, the rest in reverse chronological order
    it('lists the newest message first (3-16)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        // Read the boot messages, so that the page holds only the two below
        await readAll(unit);

        unit.props.messageHandler.addMessage(new OneTimeMessage(['OLDER MESSAGE']));
        unit.props.messageHandler.addMessage(new OneTimeMessage(['NEWER MESSAGE']));
        await unit.panel.msg();

        expect(msgRows().slice(0, 2)).toEqual(['NEWER MESSAGE', 'OLDER MESSAGE']);
    });

    // 3-16: when the messages do not fit one page, further presses of MSG show the others, then the previous pages
    it('pages through messages that do not fit, then returns to the pages in view (3-16)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await readAll(unit);
        const left = Screen.read().status().left;
        // Three lines, three lines and one line: the first two fill the six rows, and the oldest goes to a second page
        unit.props.messageHandler.addMessage(new OneTimeMessage(['ONE A']));
        for (const text of ['TWO', 'THREE']) {
            unit.props.messageHandler.addMessage(new OneTimeMessage([`${text} A`, `${text} B`, `${text} C`]));
        }

        await unit.panel.msg();
        expect(msgRows()).toEqual(['THREE A', ' THREE B', ' THREE C', 'TWO A', ' TWO B', ' TWO C']);
        await unit.panel.msg();
        expect(msgRows()[0]).toBe('ONE A');
        await unit.panel.msg();
        expect(Screen.read().status().left).toBe(left);
    });
});

describe('SET FUEL ON BOARD ON OTH 5 IF NECESSARY', () => {
    const FUEL_TEXT = 'SET FUEL ON BOARD ON OTH 5 IF NECESSARY';

    // B-4: the message comes after the start-up with a fuel computer on which the KLN 90B sets the fuel on board.
    // Input.FuelComputer.FOBTransmitted false is that computer (cfg/panel.xml)
    it('shows once after the start with a fuel computer that does not send the fuel on board (B-4)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(fuelComputer({fob: false})),
        });
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit).filter(m => m === FUEL_TEXT)).toHaveLength(1);
    });

    it('does not show without a fuel computer, whatever the fuel on board flag says (characterization)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml({'Input.FuelComputer.IsInterfaced': false, 'Input.FuelComputer.FOBTransmitted': false}),
        });
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain(FUEL_TEXT);
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    it('does not show with a fuel computer that sends the fuel on board (B-4)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(fuelComputer({fob: true})),
        });
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('SET FUEL ON BOARD ON OTH 5 IF NECESSARY');
        // The list is the live one: the empty storage has no last position, so the first fix differs from it (B-3)
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    it('shows again after a power cycle (characterization)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(fuelComputer({fob: false})),
        });
        await vi.advanceTimersByTimeAsync(2000);
        await readAll(unit);
        expect(messages(unit)).toEqual([]);

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain('SET FUEL ON BOARD ON OTH 5 IF NECESSARY');
    });
});

describe('messages over a power cycle', () => {
    // MessageHandler.ts:32 carries "todo clear messages when power is off". Today an unread message posted before the
    // power-off is still on the MSG page after the power-on. The maintainer ruled it a bug: clear at the power-off
    it.fails('does not keep an unread message of the previous power-on (#176)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.props.messageHandler.addMessage(new OneTimeMessage(['BEFORE THE CYCLE']));

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('BEFORE THE CYCLE');
    });

    // The sibling of the pin: the cycle itself completes, and the message is there before it
    it('holds the message before the cycle (sibling of #176) (characterization)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.props.messageHandler.addMessage(new OneTimeMessage(['BEFORE THE CYCLE']));
        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit)).toContain('BEFORE THE CYCLE');

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(unit.errors).toEqual([]);
    });
});
