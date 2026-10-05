import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnitExpectingError} from '../harness/boot';

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
