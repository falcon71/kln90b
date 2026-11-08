import {describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, untilCalcTick} from '../../harness/boot';
import {messageLines, messages} from '../../harness/readers';
import {openFlr2} from '../../harness/render/flrPages';
import {blinkCycle} from '../../harness/render/blink';
import {Screen} from '../../harness/render/screen';
import {Message} from '../../../kln90b/data/MessageHandler';

// #471: the one RCVR HARDWARE ERROR: message that shows the receiver error word (IM C-3, C-4; KLN 900 Pilot's Guide B-6),
// and TEST FAIL for it. The design docs/superpowers/specs/2026-11-08-receiver-hardware-errors-design.md, "The message":
// a bit the code did not have makes the message unread again; a bit that ends only changes the text

const HOME = {lastLatitude: 47, lastLongitude: 8};
const OPEN_ANTENNA = {failure_gpsAntenna: '{"short":0}'};
const TITLE = 'RCVR HARDWARE ERROR:';
const SLOW = 300_000;

const gpsOf = (unit: HeadlessUnit) => unit.props.sensors.in.gps;
/** The listed receiver error messages, each with its lines */
const receiverEntries = (unit: HeadlessUnit): string[][] => messageLines(unit).filter(l => l[0] === TITLE);
/** The listed receiver error message; throws unless there is exactly one */
function receiverMessage(unit: HeadlessUnit): Message {
    const list = unit.props.messageHandler.getMessages().filter(m => m.message[0] === TITLE);
    expect(list.length).toBe(1);
    return list[0];
}

/** The mask of the msg prompt (row 6, cells 14 to 16) over one blink cycle; `III` is steady, `FFF` the flashing phase */
async function promptMasks(): Promise<string[]> {
    expect(Screen.read().row(6).slice(14, 17)).toBe('msg'); // Precondition: the prompt shows
    return blinkCycle(() => Screen.read().mask().split('\n')[6].slice(14, 17));
}

const TRACKED_STATES: readonly GPSSatelliteState[] = [GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied];
const tracked = (unit: HeadlessUnit) => gpsOf(unit).gpsSatComputer.getChannels().some(s => s !== null && TRACKED_STATES.includes(s.state.get()));

describe('RCVR HARDWARE ERROR: (#471)', () => {
    it('0018 from the antenna and the battery\'s wipe', async () => {
        const unit = await bootToSelfTest({storage: {...OPEN_ANTENNA, failure_battery: '{}'}});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);

        expect(receiverEntries(unit)).toEqual([[TITLE, '0018']]);

        await unit.panel.readMessages();
        expect(receiverMessage(unit).seen).toBe(true); // Precondition: read on the MSG page

        // A bit that ends only changes the text: the message stays read
        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'GPS ANTENNA');
        await unit.panel.clr();
        await unit.panel.ent();
        expect(unit.props.failures.isActive('gpsAntenna')).toBe(false); // Precondition
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(250);

        expect(receiverEntries(unit)).toEqual([[TITLE, '0008']]);
        expect(receiverMessage(unit).seen).toBe(true);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
        expect(await promptMasks()).toEqual(['III', 'III', 'III', 'III']);

        // 0008 ends with the first satellite tracked, and with it the message
        for (let s = 0; !tracked(unit); s++) {
            if (s >= 30 * 60) throw new Error('no satellite tracked within 30 minutes');
            expect(receiverEntries(unit)).toEqual([[TITLE, '0008']]);
            await vi.advanceTimersByTimeAsync(1000);
        }
        await vi.advanceTimersByTimeAsync(1000);
        expect(receiverEntries(unit)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, SLOW);

    it('a new bit re-alerts', async () => {
        const unit = await bootUnit({storage: {...HOME, ...OPEN_ANTENNA}});
        await vi.advanceTimersByTimeAsync(2000);
        expect(receiverEntries(unit)).toEqual([[TITLE, '0010']]); // Precondition
        await unit.panel.readMessages();
        expect(receiverMessage(unit).seen).toBe(true); // Precondition: read
        expect(await promptMasks()).toEqual(['III', 'III', 'III', 'III']); // Precondition: steady

        gpsOf(unit).failures.receiverErrors.random = () => 0.6; // The code 2000
        unit.props.failures.fail('rcvrHardware');
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(250);

        expect(receiverEntries(unit)).toEqual([[TITLE, '2010']]);
        expect(receiverMessage(unit).seen).toBe(false);
        expect(await promptMasks()).toContain('FFF');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('a short shows 0110', async () => {
        const unit = await bootUnit({storage: {...HOME, failure_gpsAntenna: '{"short":1}'}});
        await vi.advanceTimersByTimeAsync(2000);

        expect(receiverEntries(unit)).toEqual([[TITLE, '0110']]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('not posted before the first navigation page', async () => {
        const unit = await bootToSelfTest({storage: {...HOME, ...OPEN_ANTENNA}});
        await vi.advanceTimersByTimeAsync(5000);

        expect(gpsOf(unit).failures.receiverErrors.reportedCode).toBe(0x0010); // Precondition: the word has the bit
        expect(receiverEntries(unit)).toEqual([]);
        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
    }, 60_000);

    it.each([
        ['rcvrEeprom', {failure_rcvrEeprom: '{"transient":0}'}],
        ['the battery\'s wipe alone', {failure_battery: '{}'}],
    ])('TEST FAIL for a power-on code: %s', async (_, storage) => {
        await bootToSelfTest({storage: {...HOME, ...storage}});

        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
    }, 60_000);

    it('the control: nothing stored shows ANNUN ON', async () => {
        await bootToSelfTest({storage: HOME});

        expect(Screen.read().rows('L')[5]).toBe('ANNUN    ON');
    }, 60_000);

    it('hidden while NO RCVR DATA', async () => {
        const unit = await bootUnit({storage: {...HOME, ...OPEN_ANTENNA, failure_gpsReceiver: '{}'}});
        await vi.advanceTimersByTimeAsync(5000);
        expect(messages(unit)).toContain('NO RCVR DATA');
        expect(receiverEntries(unit)).toEqual([]);
        await unit.panel.readMessages();
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false); // Precondition

        unit.props.failures.repair('gpsReceiver');
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(250);

        expect(receiverEntries(unit)).toEqual([[TITLE, '0010']]);
        expect(receiverMessage(unit).seen).toBe(false);
        expect(await promptMasks()).toContain('FFF');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('after a power cycle the message comes back unread', async () => {
        const unit = await bootUnit({storage: {...HOME, ...OPEN_ANTENNA}});
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.readMessages();
        expect(receiverMessage(unit).seen).toBe(true); // Precondition

        await unit.panel.powerCycle({offSeconds: 60});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);

        expect(receiverEntries(unit)).toEqual([[TITLE, '0010']]);
        expect(receiverMessage(unit).seen).toBe(false);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
