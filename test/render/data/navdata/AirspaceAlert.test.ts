import {describe, expect, it, vi} from 'vitest';
import {BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../../harness/boot';
import {airspace} from '../../../harness/navdata/airspaces';
import {Screen} from '../../../harness/render/screen';

const square: [number, number][] = [[47.1, 7.9], [47.1, 8.1], [46.9, 8.1], [46.9, 7.9]];

/** Boots inside a restricted area with the given vertical limits and opens the MSG page after the alert has run */
async function messagesInside(altitudeFt: number, minFt: number, maxFt: number): Promise<string> {
    const unit = await bootUnit({
        position: {lat: 47.0, lon: 8.0}, altitudeFt,
        airspaces: [airspace('R-TEST', BoundaryType.Restricted, square, {minFt, maxFt})],
    });
    await settle(unit);
    // The alert searches every 10 s
    await vi.advanceTimersByTimeAsync(12000);
    await unit.panel.msg();
    return Screen.read().text();
}

// 3-39, 3-40: the SUA alert is three-dimensional; inside the lateral boundary and between the limits (widened by the
// vertical buffer of SET 8, 500 ft by default, 3-41) the unit shows INSIDE SPC USE AIRSPACE
describe('SUA alert, vertical limits of an MSL airspace', () => {
    it('alerts on the ground inside an area whose floor is at 0 ft', async () => {
        expect(await messagesInside(0, 0, 5000)).toContain('INSIDE SPC USE AIRSPACE');
    });

    it('does not alert below the floor and its buffer', async () => {
        expect(await messagesInside(0, 1000, 5000)).not.toContain('SPC USE AIRSPACE');
    });

    it('does not alert above the ceiling and its buffer', async () => {
        expect(await messagesInside(8000, 1000, 5000)).not.toContain('SPC USE AIRSPACE');
    });

    // AirspaceAlert.isVerticallyInsideAirspace compares the aircraft's altitude with minAlt in the ceiling check
    // (AirspaceAlert.ts:155), so every aircraft above the floor plus the buffer counts as outside.
    it.fails('alerts between the floor and the ceiling (#NEW-2-1)', async () => {
        expect(await messagesInside(3000, 1000, 5000)).toContain('INSIDE SPC USE AIRSPACE');
    });
});
