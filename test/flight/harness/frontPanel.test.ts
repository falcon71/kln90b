import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {airport, vor} from '../../harness/navdata/builders';

describe('FrontPanel', () => {
    it('enters a flight plan on FPL 0', async () => {
        const world = new World().add(airport('KAAA', 47.0, 8.0), vor('ABC', 47.5, 8.9), airport('KBBB', 48.2, 9.2));
        const flight = await Flight.start({world, pilot: new ManualPilot(), aircraft: {lat: 47.0, lon: 8.0, altitudeFt: 3000, groundspeedKt: 0, trackTrue: 45}});

        await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);

        const legs = flight.unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);
        expect(legs).toEqual(['KAAA', 'ABC', 'KBBB']);
        const left = flight.screen.half('L');
        for (const ident of ['KAAA', 'ABC', 'KBBB']) expect(left).toContain(ident);
        expect(flight.screen.leftName()).toBe('FPL 0');
    });
});
