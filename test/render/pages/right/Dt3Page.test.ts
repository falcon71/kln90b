import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

/** The GPS is valid within about 12 s of boot; until then FPL 0 does not activate */
async function waitForGps(unit: HeadlessUnit): Promise<void> {
    for (let i = 0; i < 120 && !unit.props.sensors.in.gps.isValid(); i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
}

describe('D/T 3 page', () => {
    it('shows the same DIS and DTK for a leg that repeats the previous waypoint (#27, dbb01bf)', async () => {
        // 4-12: D/T 3 shows DIS and DTK per waypoint of FPL 0; the KLN 89 trainer repeats the values for a repeated waypoint
        const kaaa = airport('KAAA', 47.6, 8.0);
        const abc = vor('ABC', 47.4, 8.0);
        const def = intersection('DEF', 47.2, 8.0);
        const kbbb = airport('KBBB', 47.0, 8.0);
        const error = vi.spyOn(console, 'error');
        const unit = await bootUnit({
            facilities: [kaaa, abc, def, kbbb], position: {lat: 47.5, lon: 8.0}, magvar: 0,
            storage: savedFlightplan(0, [kaaa, abc, def, def, kbbb]),
        });
        await waitForGps(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition: ABC is active

        await unit.panel.outer('L', -1); // FPL 0, cursor off
        // From SUP: CTR, REF, ACT, D/T; then D/T 1 and D/T 2 to D/T 3.
        // Not selectPage: the ACT page on the way is wider than a half page here, and Screen.read refuses it
        await unit.panel.outer('R', 4);
        await unit.panel.inner('R', 2);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        expect(screen.leftName()).toBe('FPL 0');
        expect(screen.rightName()).toBe('D/T 3');
        // The distances accumulate along the legs, 0.1 degree of latitude is 6.0108 NM: 6, 18 (twice, the repeated DEF), 30.
        // KAAA lies behind the active leg and has no values
        expect(screen.half('R').split('\n')).toEqual([
            'DIS     DTK',
            '           ',
            '  6    180°',
            ' 18    180°',
            ' 18    180°',
            ' 30    180°',
        ]);
        // A zero-length leg would give a NaN heading, which the SDK reports with console.error
        expect(error).not.toHaveBeenCalled();
    });
});
