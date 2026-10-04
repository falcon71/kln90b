import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {SuperNav5} from '../../harness/render/superNav5';
import {SuperNav5Field1} from '../../../kln90b/settings/KLN90BUserSettings';
import {Screen} from '../../harness/render/screen';
import {MainPage} from '../../../kln90b/pages/MainPage';
import {SuperNav5Page} from '../../../kln90b/pages/left/SuperNav5Page';

describe('SuperNav5.read (harness)', () => {
    // 3-31: NAV 5 on both sides makes Super NAV 5. 6-8: field 1 shows -.-NM- without a cross track
    it('reads the left column, the message and range, and hides the right cursor windows', async () => {
        const unit = await bootUnit({storage: {superNav5Field1: SuperNav5Field1.XTK}});
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.selectPage('R', 'NAV 4');
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
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.selectPage('R', 'NAV 4');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: the overlay hides the status line, so selectPage cannot end there
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(250);

        const right = SuperNav5.read().right!;

        expect(right).toEqual(['ÜVOR:OFF', 'ÝNDB:OFF', 'ŸAPT:OFF', ' 000° N^']);
    });

    it('reads the direct-to window once the scan knob is pulled', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.selectPage('R', 'NAV 4');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: the overlay hides the status line, so selectPage cannot end there
        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);

        // No flight plan legs: the window is open and blank
        expect(SuperNav5.read().directTo).toBe('      ');
    });

    it('is the page Screen refuses to read', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.selectPage('R', 'NAV 4');
        await unit.panel.inner('R', 1); // NAV 5 on both sides: the overlay hides the status line, so selectPage cannot end there
        await vi.advanceTimersByTimeAsync(250);

        expect(() => Screen.read()).toThrow(/SuperNav5\.read/);
    });

    it('throws while Super NAV 5 is not shown', async () => {
        await bootUnit();
        expect(() => SuperNav5.read()).toThrow(/Super NAV 5 is not shown/);
    });
});
