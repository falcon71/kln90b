import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {fuelComputer, NO_ALTIMETER, panelXml} from '../../harness/panelXml';
import {airport} from '../../harness/navdata/builders';
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
    // A message describes the power-on in which it was posted. The maintainer ruled that the unit loses its messages at
    // the power-off (#176)
    it('does not keep an unread message of the previous power-on (#176)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.props.messageHandler.addMessage(new OneTimeMessage(['BEFORE THE CYCLE']));

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).not.toContain('BEFORE THE CYCLE');
    });

    // The setup of the tests above: the cycle itself completes, and the message is there before it
    it('holds the message before the cycle (#176) (characterization)', async () => {
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

describe('messages at the power-off (#176)', () => {
    it('are gone while the unit is off, with the annunciator', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.props.messageHandler.addMessage(new OneTimeMessage(['BEFORE THE POWER-OFF']));
        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit)).toContain('BEFORE THE POWER-OFF'); // the precondition: the list holds it

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.messageHandler.hasMessages()).toBe(false);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
    });

    it('are gone after the electricity went away and came back', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.ElectricitySimVar': 'CIRCUIT ON:1'})});
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.approveSelfTest();
        unit.props.messageHandler.addMessage(new OneTimeMessage(['BEFORE THE LOSS']));
        expect(messages(unit)).toContain('BEFORE THE LOSS'); // the precondition: the list holds it

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000); // beyond the ride-through a fix of #332 may add
        expect(unit.props.messageHandler.hasMessages()).toBe(false);
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.approveSelfTest();

        expect(messages(unit)).not.toContain('BEFORE THE LOSS');
    });

    // A message posted before the first power-on (the restore of the user data runs while the unit starts) belongs to
    // that power-on, so only a power-off removes it, not the power-on itself
    it('leave a message posted at the start-up alone when the unit is switched on', async () => {
        const unit = await bootUnit({
            engineRunning: false,
            facilities: [airport('KAAA', 47, 8)],
            // The type letter Q is no facility type, so the restore fails and the unit posts USER DATA LOST (#144)
            storage: {userDataFormat: 2, wpt0: 'QXX        BAD     +4700.00+00800.00', fpl1: 'A          KAAA    '},
        });
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000);
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain('USER DATA LOST');
    });
});

describe('a read message over a power cycle (#351)', () => {
    // The maintainer's ruling (#351): a persistent message (ALTITUDE FAIL without an altitude input) that was read
    // before the power-off and whose condition still holds after the power-on comes back read, so msg does not flash.
    // The AVsoftech trainer (unreliable) kept a read OBS WPT > 200NM read over its power button; the KLN 89 could not
    // show it (the condition does not survive its relaunch)
    it('bring a read persistent message back read when its condition still holds (#351)', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_ALTIMETER)});
        await settle(unit);
        await unit.panel.readMessages(); // the persistent message stays after it is read
        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit)).toEqual(['ALTITUDE FAIL']); // the precondition: persistent and read
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain('ALTITUDE FAIL');
        expect(unit.props.messageHandler.getMessages().find(m => m.message[0] === 'ALTITUDE FAIL')!.seen).toBe(true);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
    });
});
