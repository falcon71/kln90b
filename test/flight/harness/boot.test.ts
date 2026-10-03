import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {vor} from '../../harness/navdata/builders';

describe('headless boot', () => {
    it('boots to the main page with a GPS solution', async () => {
        const unit = await bootUnit({facilities: [vor('ABC', 47.2, 8.0)], position: {lat: 47, lon: 8}});
        await vi.advanceTimersByTimeAsync(30_000);

        const statusLine = document.querySelector('.statusline')!.textContent!.replace(/\u00a0/g, ' ');
        expect(statusLine.startsWith('NAV 2')).toBe(true);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(unit.errors).toEqual([]);
        expect(unit.env.sim.errors).toEqual([]);
        expect(unit.env.sim.get('GPS POSITION LAT', 'degrees')).toBeCloseTo(47, 6);
        expect(unit.env.sim.get('GPS POSITION LON', 'degrees')).toBeCloseTo(8, 6);
    });

    it('allows only one unit per test file', async () => {
        await expect(bootUnit()).rejects.toThrow(/one unit per test file/);
    });
});
