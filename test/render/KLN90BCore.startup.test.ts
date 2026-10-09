import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnit, bootUnitExpectingError} from '../harness/boot';
import {KLN90BCore} from '../../kln90b/KLN90BCore';
import {EVT_ENT} from '../../kln90b/HEvents';

/** The error page logs every error it shows; keep the expected one out of the test output */
function muteConsoleError(): void {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Registered before the boot, so it runs after the teardown has put the spy back
    onTestFinished(() => spy.mockRestore());
}

// The source is the fix commit, not a manual page. The harness test bootFailure.test.ts holds the catch on the
// propsReady chain (a facility client whose nearest search rejects, which fails after init() has returned). Here the
// failure is thrown inside init() itself, which only the catch of init() handles.
describe('KLN90BCore start-up failure (#50, b4a4ff2)', () => {
    it('shows an error thrown inside init() on the error page, without an unhandled rejection', async () => {
        muteConsoleError();

        const failed = await bootUnitExpectingError({
            platform: {
                createFacilityClient: () => {
                    throw new Error('no client');
                },
            },
        });

        expect(failed.errors.map(e => e.message)).toEqual(['no client']);
        expect(failed.errorPage()?.startsWith('Error: no client')).toBe(true);
        expect(failed.takeRejections()).toEqual([]);
    });
});

// The source is the fix commit 7b4465d ("ignore events until it is correctly initialized", the startup in the
// Dukes): an aircraft can send H events before BaseInstrument.Init has run. PageManager.test.ts holds the PageManager
// half (no throw, the log line). This test holds what the pilot saw: without the fix the event threw, the core
// published the error and the bus cached it; the error page received the cached error while init() was still building
// it, before it was rendered, so its showError threw and init() stopped. The unit never came up (re-broken:
// propsReady never fires).
describe('H events before KLN90BCore.init (7b4465d)', () => {
    it('are ignored, and the unit comes up without an error', async () => {
        muteConsoleError();
        const original = KLN90BCore.prototype.init;
        // The event arrives on the core that the boot built, just before its init() runs
        const init = vi.spyOn(KLN90BCore.prototype, 'init').mockImplementation(
            function (this: KLN90BCore, xml: Document) {
                this.onInteractionEvent([EVT_ENT]);
                return original.call(this, xml);
            });
        onTestFinished(() => init.mockRestore());

        const unit = await bootUnit();

        expect(init).toHaveBeenCalledTimes(1);
        expect(unit.errors).toEqual([]);
        expect(document.querySelector('.errorpage')!.classList.contains('d-none')).toBe(true);
        expect(unit.consoleErrors).toEqual([['Event KLN90B_ENT_Push ignored, we are not yet initialized!']]);
    });
});
