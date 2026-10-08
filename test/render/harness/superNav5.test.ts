import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {SuperNav5} from '../../harness/render/superNav5';
import {SuperNav5Field1} from '../../../kln90b/settings/KLN90BUserSettings';
import {Screen} from '../../harness/render/screen';
import {MainPage} from '../../../kln90b/pages/MainPage';
import {SuperNav5Page} from '../../../kln90b/pages/left/SuperNav5Page';

describe('SuperNav5.read (harness)', () => {
    // 3-36: NAV 5 on both sides makes Super NAV 5, with field 1 set to XTK. The -.-NM- text without an active waypoint is a characterization: the guide has no figure of it
    it('reads the left column, the message and range, and hides the right cursor windows', async () => {
        const unit = await bootUnit({storage: {superNav5Field1: SuperNav5Field1.XTK}});
        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: the overlay hides the status line, so selectPage cannot end there
        await vi.advanceTimersByTimeAsync(250);
        expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav5Page);

        const nav5 = SuperNav5.read();

        // Field 1 (the fifth row of the left column, after distance, ident, mode and ground speed) shows the cross track
        expect(nav5.left[4]).toBe('-.-NM-');
        expect(nav5).toEqual({
            left: ['--.- È', '', 'Ê-Ë', '   0 É', '-.-NM-', 'Ó---°', 'Ö---°'],
            msg: 'msg',
            range: '40  ',
            right: null,
            directTo: null,
        });
    });

    it('reads the right cursor window once the right cursor is on', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: the overlay hides the status line, so selectPage cannot end there
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(250);

        const right = SuperNav5.read().right!;

        expect(right).toEqual(['ÜVOR:OFF', 'ÝNDB:OFF', 'ŸAPT:OFF', ' 000° N^']);
    });

    it('reads the direct-to window once the scan knob is pulled', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: the overlay hides the status line, so selectPage cannot end there
        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);

        // No flight plan legs: the window is open and blank
        expect(SuperNav5.read().directTo).toBe('      ');
    });

    it('is the page Screen refuses to read', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: the overlay hides the status line, so selectPage cannot end there
        await vi.advanceTimersByTimeAsync(250);

        expect(() => Screen.read()).toThrow(/SuperNav5\.read/);
    });

    it('throws while Super NAV 5 is not shown', async () => {
        await bootUnit();
        expect(() => SuperNav5.read()).toThrow(/Super NAV 5 is not shown/);
    });
});

describe('SuperNav5.focused (harness)', () => {
    async function superNav5(storage: Record<string, unknown> = {}) {
        const unit = await bootUnit({storage});
        await unit.panel.selectPage('R', 'NAV 4'); // the right side first: its shorter way passes NAV 5
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(250);
        return unit;
    }

    it('is empty while the left cursor is off, although an unread message inverts the msg prompt', async () => {
        await superNav5();

        // The boot messages are unread: the prompt is the inverted span that focused() has to leave out
        expect(SuperNav5.read().msg).toBe('msg');
        expect(document.querySelector('.super-nav5-mgs-range .inverted')?.textContent).toBe('msg');
        expect(SuperNav5.focused()).toEqual([]);
    });

    it('returns the range selector, which shares the overlay with the msg prompt, once the cursor is on', async () => {
        const unit = await superNav5({superNav5MapRange: 15});

        await unit.panel.cursor('L');

        expect(SuperNav5.focused()).toEqual(['15  ']);
    });

    it('follows the cursor to the next field of the left column and turns no-break spaces into blanks', async () => {
        const unit = await superNav5({superNav5MapRange: 15});
        await unit.panel.cursor('L');

        await unit.panel.outer('L', 1);

        // Field 1 shows ETE; the DOM pads its text with no-break spaces (the unread msg prompt is inverted as well)
        const raw = [...document.querySelectorAll('.super-nav5-left-controls .inverted')].map(e => e.textContent).filter(t => t !== 'msg');
        expect(raw).toEqual(['ETE\u00a0\u00a0\u00a0']);
        expect(SuperNav5.focused()).toEqual(['ETE   ']);
    });

    it('does not read the cursor of the right menu, which is not in the left column', async () => {
        const unit = await superNav5();

        await unit.panel.cursor('R');

        // The right cursor is on a field of the menu (VOR first), inverted outside the left column
        expect(document.querySelector('.super-nav5-right-controls .inverted')).not.toBeNull();
        expect(SuperNav5.focused()).toEqual([]);
    });

    it('leaves out an inverted field in a d-none subtree and reads the container it is given', () => {
        document.body.innerHTML = '<div id="other"><pre class="super-nav5-left-controls">'
            + '<span class="d-none"><span class="inverted">HIDDEN</span></span><span class="inverted">AB\u00a0</span></pre></div>';

        expect(SuperNav5.focused(document.getElementById('other'))).toEqual(['AB ']);
    });

    it('throws without a #pageContainer', () => {
        document.body.innerHTML = '';
        expect(() => SuperNav5.focused()).toThrow(/no #pageContainer/);
    });
});
