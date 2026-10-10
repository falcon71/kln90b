import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {standardRoute} from '../../harness/fixtures';
import {fplIdents} from '../../harness/readers';

describe('FrontPanel', () => {
    it('enters a flight plan on FPL 0', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const world = new World().add(kaaa, abc, kbbb);
        const flight = await Flight.start({world, pilot: new ManualPilot(), aircraft: {lat: 47.0, lon: 8.0, altitudeFt: 3000, groundspeedKt: 0, trackTrue: 45}});

        await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);

        const legs = fplIdents(flight.unit);
        expect(legs).toEqual(['KAAA', 'ABC', 'KBBB']);
        const left = flight.screen.half('L');
        for (const ident of ['KAAA', 'ABC', 'KBBB']) expect(left).toContain(ident);
        expect(flight.screen.leftName()).toBe('FPL 0');
    });

    it('enters the three-letter ident of a VOR and selects a page on the right', async () => {
        const {kaaa, abc} = standardRoute();
        const world = new World().add(kaaa, abc);
        const flight = await Flight.start({world, pilot: new ManualPilot(), aircraft: {lat: 47.0, lon: 8.0, altitudeFt: 3000, groundspeedKt: 0, trackTrue: 45}});

        await flight.panel.appendToFpl0(['ABC']);
        await flight.panel.selectPage('R', 'D/T 1');

        const legs = fplIdents(flight.unit);
        expect(legs).toEqual(['ABC']);
        expect(flight.screen.status().right).toBe('D/T 1');
    });

    it('brings the unit through a power cycle and the self-test and flies on', async () => {
        const {kaaa} = standardRoute();
        const world = new World().add(kaaa);
        const flight = await Flight.start({world, pilot: new ManualPilot(), aircraft: {lat: 47.0, lon: 8.0, altitudeFt: 3000, groundspeedKt: 0, trackTrue: 45}});

        await flight.panel.powerCycle();
        await flight.panel.approveSelfTest();
        await flight.fly(5);

        expect(flight.screen.status().left).toBe('NAV 2');
    });
});
