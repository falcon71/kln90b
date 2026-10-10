/// <reference types="node" />
import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';

const listenersAtLoad = process.listenerCount('unhandledRejection');
let domWhenChecked: boolean | undefined;

/** The tests run in order: the last ones check what the earlier ones left behind. */
describe('unhandled rejection collector (harness)', () => {
    it('collects a rejection in unit.errors and unit.rejections, and takeRejections() marks it as expected', async () => {
        const unit = await bootUnit();
        const boom = new Error('boom');

        void Promise.reject(boom);
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.rejections).toEqual([boom]);
        expect(unit.errors).toEqual([boom]);
        expect(unit.takeRejections()).toEqual([boom]);
        expect(unit.rejections).toEqual([]);
    });

    it('wraps a rejection that is not an Error', async () => {
        const unit = await bootUnit();

        void Promise.reject('plain');
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.errors.map(e => e.message)).toEqual(['plain']);
        expect(unit.takeRejections()).toEqual(['plain']);
    });

    // The listener is installed before init, so a rejection during the boot is counted. KLN90BCore.asyncInit does not
    // handle a rejecting getRouteManager()
    it('collects a rejection raised during the boot', async () => {
        const noEfb = new Error('no efb');

        const unit = await bootUnit({platform: {getRouteManager: () => Promise.reject(noEfb)}});

        expect(unit.errors).toEqual([noEfb]);
        expect(unit.takeRejections()).toEqual([noEfb]);
    });

    // The strict check: a rejection nobody took fails the test when it ends. The sibling above holds the same setup.
    // Not a bug pin: the failure is the behavior under test, so this it.fails names no issue and stays as it is
    it.fails('fails a test that leaves a rejection untaken (harness self-test, not a bug pin)', async () => {
        await bootUnit();
        void Promise.reject(new Error('untaken'));
        await vi.advanceTimersByTimeAsync(250);
    });

    it('runs the check while the unit is still up, before the teardown', async () => {
        await bootUnit();
        // Registered after the boot, so it runs before the check. Its immediate fires while the check waits for its own,
        // so it sees the DOM as the check does
        onTestFinished(() => {
            setImmediate(() => {
                domWhenChecked = document.getElementById('pageContainer') !== null;
            });
        });
    });

    it('saw the unit still up', () => {
        expect(domWhenChecked).toBe(true);
    });

    it('has removed every listener it installed', () => {
        expect(process.listenerCount('unhandledRejection')).toBe(listenersAtLoad);
    });
});
