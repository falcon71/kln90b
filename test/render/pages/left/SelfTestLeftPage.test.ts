import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('self-test page', () => {
    it('outputs a course of 315° and an RMI bearing of 130° during the self-test (955b535)', async () => {
        const unit = await bootUnit({engineRunning: false, magvar: 0});
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(19_000);

        // 3-4: the self-test shows OBS out 315° and RMI 130°
        const left = Screen.read().half('L').split('\n');
        expect(left).toContain('   OUT 315°');
        expect(left).toContain('RMI    130°');

        // The outputs follow the page: the course is 315° (magnetic, and the variation is 0), the bearing 130°
        const sim = unit.env.sim;
        expect(sim.get('GPS WP DESIRED TRACK', 'degrees')).toBeCloseTo(315, 1);
        expect(sim.get('GPS OBS VALUE', 'degrees')).toBeCloseTo(315, 1);
        expect(sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')).toBeCloseTo(130, 1);
        expect(unit.errors).toEqual([]);
    });
});
