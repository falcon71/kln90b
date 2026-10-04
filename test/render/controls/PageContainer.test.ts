import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

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
        expect(Screen.read().rightName()).toBe('KYBD ');

        input.dispatchEvent(new KeyboardEvent('keypress', {keyCode: 27}));
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.errors).toEqual([]);
        expect(unit.props.pageManager.isRightKeyboardActive()).toBe(false);
        expect(Screen.read().rightName()).toBe('CRSR ');
    });
});
