import {onTestFinished, describe, expect, it, vi} from 'vitest';
import {bootUnit, bootUnitExpectingError} from '../../harness/boot';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';

/** A facility client that works, except that its nearest search sessions cannot be started */
function clientWithoutNearestSearch(message: string): MemoryFacilityClient {
    const client = new MemoryFacilityClient([]);
    client.startNearestSearchSessionWithIcaoStructs = () => Promise.reject(new Error(message));
    return client;
}

/** The error page logs every error it shows; keep the expected one out of the test output */
function muteConsoleError(): void {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Registered before the boot, so it runs after the teardown has put the spy back
    onTestFinished(() => spy.mockRestore());
}

describe('bootUnitExpectingError (harness)', () => {
    // #50: a failure while the unit starts up is published on the error topic and shown on the error page
    it('returns after the first error with the message on the error page', async () => {
        muteConsoleError();
        const client = clientWithoutNearestSearch('no navdata');

        const failed = await bootUnitExpectingError({platform: {createFacilityClient: () => client as any}});

        expect(failed.errors[0].message).toBe('no navdata');
        expect(failed.errorPage()).toContain('no navdata');
    });

    it('reports no message while the error page is hidden', async () => {
        muteConsoleError();
        const client = clientWithoutNearestSearch('no navdata');
        const failed = await bootUnitExpectingError({platform: {createFacilityClient: () => client as any}});
        expect(failed.errorPage()).not.toBeNull();

        document.querySelector('.errorpage')!.classList.add('d-none');

        expect(failed.errorPage()).toBeNull();
    });

    it('throws when the unit comes up instead', async () => {
        await expect(bootUnitExpectingError()).rejects.toThrow('bootUnitExpectingError: propsReady fired');
    });

    it('has torn the failed boots down: the next test boots a normal unit', async () => {
        const unit = await bootUnit();
        expect(unit.errors).toEqual([]);
    });
});
