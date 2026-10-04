import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {ICAO} from '@microsoft/msfs-sdk';
import {bootUnit} from '../../harness/boot';
import {airport} from '../../harness/navdata/builders';

const original = console.error;

/** The first two tests run in order: the second checks what the unit of the first one left behind. */
describe('console.error collector (harness)', () => {
    it('records a console.error call after the boot', async () => {
        const unit = await bootUnit();
        expect(unit.consoleErrors).toEqual([]);

        console.error('x', 42);

        expect(unit.consoleErrors).toEqual([['x', 42]]);
    });

    it('has the original console.error back after the unit', () => {
        expect(console.error).toBe(original);
    });

    it('passes the call on to the console.error it replaced', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // Registered before the boot, so it runs after the teardown has put the spy back
        onTestFinished(() => spy.mockRestore());
        const unit = await bootUnit();

        console.error('x', 42);

        expect(spy).toHaveBeenCalledExactlyOnceWith('x', 42);
        expect(unit.consoleErrors).toEqual([['x', 42]]);
    });

    // The collector is installed before init, so what the boot logs is counted. The unit logs when the waypoint it saved
    // as active is not in the navdata (KLN90BCore.asyncInit)
    it('counts a console.error raised during the boot', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => spy.mockRestore());
        const lost = ICAO.valueToStringV1(airport('KZZZ', 47.0, 8.0).icaoStruct);

        const unit = await bootUnit({storage: {activeWaypoint: lost}});

        expect(unit.consoleErrors.map(args => args[0])).toEqual([`Last active waypoint not found: ${lost}`]);
    });
});
