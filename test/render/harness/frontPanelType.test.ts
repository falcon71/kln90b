import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {FrontPanel} from '../../harness/flight/FrontPanel';
import {airport} from '../../harness/navdata/builders';

describe('FrontPanel.type (harness)', () => {
    it('types an ident into a waypoint selector on the right side', async () => {
        // KAAA is the nearest airport, so it would show without any typing; the test types KBBB
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0), airport('KBBB', 48.0, 9.0)]});
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');

        await unit.panel.type('R', 'KBBB');

        expect(Screen.read().row(0).slice(12)).toBe(' KBBB      ');
    });

    it('types into the left side with the left cursor on', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 8.0)]});
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');

        await unit.panel.type('L', 'KAAA');

        expect(Screen.read().row(1).slice(0, 11)).toBe('  1:KAAA   ');
    });
});

// The PC keyboard path (KLN90BCore.handleKeyboardEvent) sends A to Z and 0 to 9 and nothing else, so a test that
// types anything else tests a unit no pilot can operate (#109: no pilot can type a blank into the hundreds cell of a
// longitude)
describe('FrontPanel.type, the keyboard guard (harness)', () => {
    // press() waits one display tick after each event, and there is no unit here to install the fake timers
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const panel = () => {
        const sent: string[] = [];
        return {sent, panel: new FrontPanel(evt => sent.push(evt), () => Screen.read())};
    };

    it('sends letters and digits as H events of the side', async () => {
        const {sent, panel: p} = panel();

        await p.type('R', 'AZ09');

        expect(sent).toEqual(['KLN90B_Internal_Key:RIGHT:A', 'KLN90B_Internal_Key:RIGHT:Z', 'KLN90B_Internal_Key:RIGHT:0', 'KLN90B_Internal_Key:RIGHT:9']);
    });

    it.each([
        [' ', 'a blank'], ['-', 'a hyphen'], ['.', 'a decimal point'], ['a', 'a lowercase letter'],
        ['\u00a0', 'a no-break space'],
    ])('refuses %j (%s) and names the keyboard path', async (ch) => {
        const {panel: p} = panel();

        await expect(p.type('R', ch))
            .rejects.toThrow(/cannot be typed on the PC keyboard \(KLN90BCore\.handleKeyboardEvent/);
    });

    it('sends nothing of a text that holds a refused character', async () => {
        const {sent, panel: p} = panel();

        await expect(p.type('L', 'E 103000')).rejects.toThrow(/' ' cannot be typed/);

        expect(sent).toEqual([]);
    });

    // Only an aircraft's H event can send such a character; press() is that path
    it('still sends a blank as a raw H event with press()', async () => {
        const {sent, panel: p} = panel();

        await p.press('KLN90B_Internal_Key:RIGHT: ');

        expect(sent).toEqual(['KLN90B_Internal_Key:RIGHT: ']);
    });
});
