import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {EnterResult} from '../../../kln90b/pages/CursorController';
import {FiveSegmentPage} from '../../../kln90b/pages/FiveSegmentPage';

// FiveSegmentPage joins a left and a right half page under one status line; the Self Test page is the one place the
// unit shows it (the Take Home page is the other, TakeHomeMode). These tests drive it there. The code comments refer
// to the KLN 89 trainer for the scan fall-through; no observation of it is recorded, and the Pilot's Guide gives no page
// for either event, so everything here is a characterization.

/** The Self Test page of a cold boot: SelfTestLeftPage on the left, SelfTestRightPage on the right */
async function onSelfTestPage() {
    const unit = await bootToSelfTest({magvar: 0});
    const page = unit.props.pageManager.getCurrentPage() as FiveSegmentPage;
    expect(page).toBeInstanceOf(FiveSegmentPage); // Precondition
    return {unit, lPage: page.props.lPage, rPage: page.props.rPage};
}

const baroRow = () => Screen.read().rows('R')[4];

/** Pulls SCAN, so that the right inner knob sends the scan events */
async function pullScan(unit: HeadlessUnit): Promise<void> {
    await unit.panel.scan();
}

describe('FiveSegmentPage scan events (characterization)', () => {
    // KLN90BCore turns the right inner knob into EVT_R_SCAN_RIGHT while SCAN is pulled. With the right cursor on, the
    // page hands the event to the cursor controller as the inner knob; the cursor starts on the first two baro digits
    it('turns the field under the right cursor with a right scan, as the right inner knob does', async () => {
        const {unit} = await onSelfTestPage();
        expect(unit.panel.focused('R').text).toBe('29'); // Precondition: the cursor is on the baro
        await pullScan(unit);

        await unit.panel.inner('R', 1);

        expect(baroRow()).toBe('BARO:30.92"');
        expect(unit.errors).toEqual([]);
    });

    it('turns the field under the right cursor with a left scan, as the right inner knob does', async () => {
        const {unit} = await onSelfTestPage();
        await pullScan(unit);

        await unit.panel.inner('R', -1);

        expect(baroRow()).toBe('BARO:28.92"');
        expect(unit.errors).toEqual([]);
    });

    // With the right cursor off the scan goes to the half page, whatever it does with it: SelfTestRightPage inherits
    // SixLineHalfPage.scanRight, which does nothing and returns false
    it('gives a right scan to the right half page when its cursor is off, and the field stays', async () => {
        const {unit, rPage} = await onSelfTestPage();
        await unit.panel.cursor('R');
        expect(Screen.read().status().right).toBe(''); // Precondition: the cursor is off
        const scanRight = vi.spyOn(rPage, 'scanRight');
        const innerRight = vi.spyOn(rPage.getCursorController(), 'innerRight');
        await pullScan(unit);

        await unit.panel.inner('R', 1);

        expect(scanRight).toHaveBeenCalledTimes(1);
        expect(scanRight).toHaveReturnedWith(false);
        expect(innerRight).not.toHaveBeenCalled();
        expect(baroRow()).toBe('BARO:29.92"');
    });

    it('gives a left scan to the right half page when its cursor is off, and the field stays', async () => {
        const {unit, rPage} = await onSelfTestPage();
        await unit.panel.cursor('R');
        const scanLeft = vi.spyOn(rPage, 'scanLeft');
        const innerLeft = vi.spyOn(rPage.getCursorController(), 'innerLeft');
        await pullScan(unit);

        await unit.panel.inner('R', -1);

        expect(scanLeft).toHaveBeenCalledTimes(1);
        expect(scanLeft).toHaveReturnedWith(false);
        expect(innerLeft).not.toHaveBeenCalled();
        expect(baroRow()).toBe('BARO:29.92"');
    });
});

describe('FiveSegmentPage ENT order (characterization)', () => {
    /**
     * Replaces enter and isEnterAccepted of both halves, so that the page's decision shows in the order of the calls.
     * `accepts` says which half waits for a confirmation, `handles` which half handles the ENT it is given.
     */
    async function pressEnt(accepts: { l: boolean, r: boolean }, handles: { l: boolean, r: boolean }): Promise<string[]> {
        const {unit, lPage, rPage} = await onSelfTestPage();
        const calls: string[] = [];
        for (const [side, half] of [['L', lPage], ['R', rPage]] as const) {
            const key = side === 'L' ? 'l' : 'r';
            vi.spyOn(half, 'isEnterAccepted').mockReturnValue(accepts[key]);
            vi.spyOn(half, 'enter').mockImplementation(async () => {
                calls.push(side);
                return handles[key] ? EnterResult.Handled_Keep_Focus : EnterResult.Not_Handled;
            });
        }

        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        return calls;
    }

    it('serves a right half page that waits for confirmation before the left, which would handle ENT', async () => {
        expect(await pressEnt({l: false, r: true}, {l: true, r: true})).toEqual(['R']);
    });

    it('serves a left half page that waits for confirmation, and the right gets no ENT whatever the left answers', async () => {
        expect(await pressEnt({l: true, r: false}, {l: false, r: true})).toEqual(['L']);
    });

    it('serves the left half page first when both wait for confirmation', async () => {
        expect(await pressEnt({l: true, r: true}, {l: true, r: true})).toEqual(['L']);
    });

    it('gives ENT to the left half page first when none waits, and stops there when it handles it', async () => {
        expect(await pressEnt({l: false, r: false}, {l: true, r: true})).toEqual(['L']);
    });

    it('gives ENT to the right half page when none waits and the left does not handle it', async () => {
        expect(await pressEnt({l: false, r: false}, {l: false, r: true})).toEqual(['L', 'R']);
    });
});
