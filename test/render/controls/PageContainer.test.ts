import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {savedFlightplan} from '../../harness/storage';
import {airport} from '../../harness/navdata/builders';

describe('keyboard mode (characterization, #75)', () => {
    // The test calls the key handler on the input element. It does not test how Coherent delivers the key.
    it('leaves keyboard mode when Escape is pressed', async () => {
        const unit = await bootUnit();
        await unit.panel.cursor('R');
        const input = document.querySelector('input.keyboard') as HTMLInputElement;

        // A left click on the CRSR field of the right status line enters keyboard mode
        input.dispatchEvent(new MouseEvent('mousedown', {button: 0, screenX: 700, screenY: 350}));
        input.focus(); // Coherent focuses the input through FOCUS_INPUT_FIELD; happy-dom needs it here
        await vi.advanceTimersByTimeAsync(250);
        expect(unit.props.pageManager.isRightKeyboardActive()).toBe(true);
        expect(Screen.read().status().right).toBe('KYBD');

        input.dispatchEvent(new KeyboardEvent('keypress', {keyCode: 27}));
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.errors).toEqual([]);
        expect(unit.props.pageManager.isRightKeyboardActive()).toBe(false);
        expect(Screen.read().status().right).toBe('CRSR');
    });
});

// Keyboard mode is the sim's PC keyboard, which the real unit does not have: no manual page describes it, so these
// tests are characterizations. A left click on the CRSR field of a status line (cells 1 to 5 on the left, 18 to 22 on
// the right) focuses the hidden input; its keys are published on the bus and KLN90BCore turns them into the unit's
// events. The tests deliver the events to the input element, as the test above does
describe('keyboard mode, the click and the keys (characterization)', () => {
    /** Screen coordinates of the status row: cell 3 of the left CRSR field, and cell 10, outside both fields */
    const LEFT_CRSR = {screenX: (4 + 3 * 9) * 4, screenY: (3 + 6.5 * 13) * 4};
    const OUTSIDE = {screenX: (4 + 10 * 9) * 4, screenY: (3 + 6.5 * 13) * 4};

    const input = () => document.querySelector('input.keyboard') as HTMLInputElement;
    const tick = () => vi.advanceTimersByTimeAsync(250);

    async function click(at: {screenX: number, screenY: number}) {
        input().dispatchEvent(new MouseEvent('mousedown', {button: 0, ...at}));
        input().focus(); // Coherent focuses the input through FOCUS_INPUT_FIELD; happy-dom needs it here
        await tick();
    }

    async function key(keyCode: number) {
        input().dispatchEvent(new KeyboardEvent('keydown', {keyCode}));
        await tick();
    }

    /** FPL 0 on the left, empty, with the cursor on the blank first waypoint */
    async function emptyFpl0() {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L').text).toBe('     '); // Precondition
        return unit;
    }

    it('characterization: a left click on the left CRSR field enters keyboard mode, and a letter key types into ' +
        'the field',
        async () => {
            const unit = await emptyFpl0();

            await click(LEFT_CRSR);
            expect(Screen.read().status().left).toBe('KYBD');

            await key(75); // K
            expect(unit.panel.focused('L').text[0]).toBe('K');
        });

    // Both cursors are on, so that a key that reached either side would show
    it('characterization: a click outside the CRSR fields does not enter keyboard mode, and keys then do nothing',
        async () => {
            const unit = await emptyFpl0();
            await unit.panel.cursor('R');
            const right = unit.panel.focused('R');

            await click(OUTSIDE);
            await key(75);

            expect(Screen.read().status()).toMatchObject({left: 'CRSR', right: 'CRSR'});
            expect(unit.panel.focused('L').text).toBe('     ');
            expect(unit.panel.focused('R')).toEqual(right);
        });

    it('characterization: turning the cursor off leaves keyboard mode', async () => {
        const unit = await emptyFpl0();
        await click(LEFT_CRSR);
        expect(unit.props.pageManager.isLeftKeyboardActive()).toBe(true); // Precondition

        await unit.panel.cursor('L');
        await tick();

        expect(unit.props.pageManager.isLeftKeyboardActive()).toBe(false);
        expect(Screen.read().status().left).toBe('FPL 0');
    });

    it('characterization: a right click leaves keyboard mode', async () => {
        const unit = await emptyFpl0();
        await click(LEFT_CRSR);
        expect(unit.props.pageManager.isLeftKeyboardActive()).toBe(true); // Precondition

        input().dispatchEvent(new MouseEvent('mousedown', {button: 2, ...LEFT_CRSR}));
        await tick();

        expect(unit.props.pageManager.isLeftKeyboardActive()).toBe(false);
        expect(Screen.read().status().left).toBe('CRSR');
    });

    // The keys of KLN90BCore.handleKeyboardEvent: Home and End turn the outer knob, Delete is CLR, Enter is ENT
    it('characterization: Home moves the cursor down, End up, Delete asks DEL and Enter deletes, on a plan of two',
        async () => {
            const kaaa = airport('KAAA', 47.0, 8.0);
            const kbbb = airport('KBBB', 47.5, 8.0);
            const unit = await bootUnit({facilities: [kaaa, kbbb], storage: savedFlightplan(3, [kaaa, kbbb])});
            await unit.panel.selectPage('L', 'FPL 3');
            await unit.panel.cursor('L');
            await click(LEFT_CRSR);
            expect(unit.panel.focused('L').text).toBe('USE?'); // Precondition

            await key(36); // Home
            expect(unit.panel.focused('L').text).toBe('USE? INVRT?');
            await key(36);
            expect(unit.panel.focused('L').text).toBe('KAAA ');
            await key(35); // End
            expect(unit.panel.focused('L').text).toBe('USE? INVRT?');
            await key(36);
            await key(46); // Delete
            expect(unit.panel.focused('L').text).toBe('DEL KAAA  ?');
            input().dispatchEvent(new KeyboardEvent('keypress', {keyCode: 13})); // Enter arrives as a keypress
            await tick();
            const legs = unit.props.memory.fplPage.flightplans[3].getLegs();
            expect(legs.map(l => l.wpt.icaoStruct.ident)).toEqual(['KBBB']);
        });
});
