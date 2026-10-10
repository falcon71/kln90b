import {beforeAll, describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {vor} from '../../harness/navdata/builders';

describe('headless boot outside a test', () => {
    let outcome: unknown;

    beforeAll(async () => {
        outcome = await bootUnit().then(() => 'booted', e => e);
    });

    it('says that bootUnit belongs inside a test', () => {
        expect(outcome).toBeInstanceOf(Error);
        expect((outcome as Error).message).toMatch(/call it inside a test/);
    });
});

describe('headless boot', () => {
    it('boots to the main page with a GPS solution', async () => {
        const unit = await bootUnit({facilities: [vor('ABC', 47.2, 8.0)], position: {lat: 47, lon: 8}});
        // Not a wait for the fix: the boot is force-ready (engineRunning defaults to true), so the fix and NAV 2 are
        // there within a second. 30 s run 30 calculation ticks, so the error checks below see a unit that has been running
        await vi.advanceTimersByTimeAsync(30_000);

        const statusLine = document.querySelector('.statusline')!.textContent!.replace(/\u00a0/g, ' ');
        expect(statusLine.startsWith('NAV 2')).toBe(true);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(unit.errors).toEqual([]);
        expect(unit.env.sim.errors).toEqual([]);
        expect(unit.env.sim.get('GPS POSITION LAT', 'degrees')).toBeCloseTo(47, 6);
        expect(unit.env.sim.get('GPS POSITION LON', 'degrees')).toBeCloseTo(8, 6);
    });

    it('allows only one live unit per test', async () => {
        await bootUnit();
        await expect(bootUnit()).rejects.toThrow(/one unit per test/);
    });
});
