import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {inhibitAllBut} from '../../../harness/gps';
import {GpsGeometry} from '../../../../kln90b/GpsSolution';
import {formatEpe} from '../../../../kln90b/pages/left/Sta2Page';

describe('STA 2 page', () => {
    describe('formatEpe', () => {
        it('is five dashes without an estimate', () => {
            expect(formatEpe(null)).toBe('-----');
        });

        it('rounds to hundredths of a nautical mile in five characters', () => {
            expect(formatEpe(0.0049)).toBe(' 0.00');
            expect(formatEpe(0.0051)).toBe(' 0.01');
            expect(formatEpe(0.025)).toBe(' 0.03');
            expect(formatEpe(3.8)).toBe(' 3.80');
        });
    });

    it('shows the unit\'s own error estimate with a fix', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 2');

        const rows = Screen.read().half('L').split('\n');
        expect(rows[0]).toBe('ESTIMATED  ');
        expect(rows[1]).toBe('POSN ERROR ');
        expect(rows[2]).toMatch(/^ {5}\d\.\d\dNM$/);
        //This harness seed's value: eight satellites plus the altitude (HDOP 0.93, EPE 0.0050 NM). It sits near the
        //rounding edge, so the tests below pin the page's value and its source with literal geometries instead
        expect(rows[2]).toBe('     0.01NM');
    });

    // A literal estimate away from every rounding edge: a wrong factor, or the SDK's hdop in place of the unit's own
    // solution, shows as another number. The page stays valid because GPS.isValid() reads the real solution
    it('shows the estimate of the unit solution, not the SDK hdop', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'STA 2');

        for (const [epeNm, expected] of [[0.0237, '     0.02NM'], [3.1234, '     3.12NM']] as const) {
            const geometry: GpsGeometry = {...gps.solution, epeNm};
            const spy = vi.spyOn(gps, 'solution', 'get').mockReturnValue(geometry);
            await vi.advanceTimersByTimeAsync(500);

            expect(gps.isValid()).toBe(true);
            expect(Screen.read().half('L').split('\n')[2]).toBe(expected);
            spy.mockRestore();
        }
    });

    // The one real case where the SDK's hdop is -1: three satellites plus the altitude (5-29)
    it('shows a finite estimate on three satellites plus the altitude', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'STA 2');

        inhibitAllBut(unit, 3);
        await vi.advanceTimersByTimeAsync(10_000);
        expect(gps.gpsSatComputer.hdop).toBe(-1);
        expect(gps.isValid()).toBe(true);

        const row = Screen.read().half('L').split('\n')[2];
        expect(row).toMatch(/^ {5}\d\.\d\dNM$/);
        expect(Math.abs(parseFloat(row) - gps.solution.epeNm)).toBeLessThanOrEqual(0.005);
    });

    // The validity decides, not the finiteness: during TRAN the solution is valid with a finite estimate, but the unit
    // has not accepted the position yet (5-29)
    it('shows dashes during TRAN, with a valid solution', async () => {
        const unit = await bootUnit({coldGps: true});
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'STA 2');

        for (let i = 0; i < 600 && !gps.isTransition(); i++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(gps.isTransition()).toBe(true);
        expect(gps.isValid()).toBe(false);
        expect(gps.solution.valid).toBe(true);
        expect(Number.isFinite(gps.solution.epeNm)).toBe(true);
        await vi.advanceTimersByTimeAsync(250);
        expect(gps.isTransition()).toBe(true);

        expect(Screen.read().half('L').split('\n')[2]).toBe('    -----NM');
    }, 60_000);

    it('shows dashes without a fix', async () => {
        const unit = await bootUnit({coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        await unit.panel.selectPage('L', 'STA 2');

        const rows = Screen.read().half('L').split('\n');
        expect(rows[0]).toBe('ESTIMATED  ');
        expect(rows[1]).toBe('POSN ERROR ');
        expect(rows[2]).toBe('    -----NM');
    });
});
