import {describe, expect, it, vi} from 'vitest';
import {BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../../../harness/boot';
import {airspace} from '../../../harness/navdata/airspaces';
import {Screen} from '../../../harness/render/screen';

/** A square of 2 d degrees around a point, as [lat, lon] corners */
const around = (lat: number, lon: number, d: number): [number, number][] =>
    [[lat + d, lon - d], [lat + d, lon + d], [lat - d, lon + d], [lat - d, lon - d]];

// The single-Center and outside cases are held in NearestUtils.test.ts and harness/airspaces.test.ts. This file adds a
// position inside several Center sectors with their own frequencies: nothing at hand says in which order the
// frequencies are listed, whether a repeat shows or how many fit, so the list is a characterization
describe('OTH 2 page (characterization)', () => {
    it('characterization: five sectors of one Center, one frequency repeated', async () => {
        const center = (freq: number, d: number) =>
            airspace('TEST CENTER', BoundaryType.Center, around(47.0, 8.0, d), {frequencyMHz: freq});
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
            airspaces: [center(132.85, 0.5), center(118.55, 0.6), center(127.2, 0.7), center(118.55, 0.8), center(124.0, 0.9), center(135.05, 1.0)],
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'OTH 2');
        await vi.advanceTimersByTimeAsync(2000); // the page loads its Center in its constructor

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "TEST CENTER
          CTR        
               118.55
               124.00
               127.20
               132.85"
        `);
        expect(unit.errors).toEqual([]);
    });
});

/** ALPHA around the boot position, BRAVO 42 NM north of it; neither overlaps the other */
const ALPHA_BRAVO = () => [
    airspace('ALPHA', BoundaryType.Center, around(47.0, 8.0, 0.3), {frequencyMHz: 118.55}),
    airspace('BRAVO', BoundaryType.Center, around(47.7, 8.0, 0.3), {frequencyMHz: 132.85}),
];

describe('OTH 2 page, the Center of the present position (3-52)', () => {
    // 3-52: the page names the Center for the aircraft's present position. Selecting the page again after flying from
    // ALPHA into BRAVO shows BRAVO; this is the passing sibling of the pin below (same Centers, same move)
    it('names the Center of the new position when the page is selected again after a move (3-52)', async () => {
        const unit = await bootUnit({position: {lat: 47.0, lon: 8.0}, altitudeFt: 0, airspaces: ALPHA_BRAVO()});
        await settle(unit);
        await unit.panel.selectPage('L', 'OTH 2');
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['ALPHA      ', 'CTR        ', '     118.55']);

        await moveAircraft(unit, {lat: 47.7, lon: 8.0}, {groundspeedKt: 150, trackTrue: 0});
        await unit.panel.inner('L', -1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().status().left).toBe('OTH 2');
        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['BRAVO      ', 'CTR        ', '     132.85']);
    });

    // 3-52: the page left on display follows the present position too; today it keeps the Center it found when it was
    // selected
    it.fails('names the Center of the new position while the page stays selected (3-52, #NEW-5-3)', async () => {
        const unit = await bootUnit({position: {lat: 47.0, lon: 8.0}, altitudeFt: 0, airspaces: ALPHA_BRAVO()});
        await settle(unit);
        await unit.panel.selectPage('L', 'OTH 2');
        await vi.advanceTimersByTimeAsync(2000);

        await moveAircraft(unit, {lat: 47.7, lon: 8.0}, {groundspeedKt: 150, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(20_000);

        expect(Screen.read().rows('L').slice(0, 3)).toEqual(['BRAVO      ', 'CTR        ', '     132.85']);
    });
});
