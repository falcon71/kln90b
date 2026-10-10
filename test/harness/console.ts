import {onTestFinished, vi} from 'vitest';

/**
 * Keeps an expected console.error out of the test output. Two things log with console.error, and a test that provokes
 * either wants the output quiet: the error page logs every error it shows, and the SDK logs its own errors (a failed
 * facility search, for example) the same way. The spy is restored when the test ends; the callback is registered before
 * the boot's, so it runs after the teardown has put the spy back (Vitest runs onTestFinished callbacks last registered
 * first). Call it before the boot.
 */
export function muteConsoleError(): void {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Registered before the boot, so it runs after the teardown has put the spy back
    onTestFinished(() => spy.mockRestore());
}
