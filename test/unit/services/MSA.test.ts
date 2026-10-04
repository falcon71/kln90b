import {describe, expect, it} from 'vitest';
import {MSA} from '../../../kln90b/services/MSA';

const BASE_PATH = 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B';

describe('MSA with duplicate waypoints (#8 4cbe2b5)', () => {
    // The grid value is read from the first-degree grid in resources/.../Assets/msa.json (row 47 + 56, column 8 + 180).
    // It is data the project ships and no manual page states it, so the value is characterization.
    it('(characterization) gives the grid value of the cell around 47.5N 8.5E', async () => {
        const msa = new MSA();
        await msa.init(BASE_PATH);
        expect(msa.getMSA({lat: 47.5, lon: 8.5})).toBe(11400);
    });

    // 3-33: the route's ESA is the highest MSA along the route. A leg between two identical waypoints has no length,
    // so its MSA is the one of the point.
    it('gives the MSA of the point for a leg between two identical waypoints', async () => {
        const msa = new MSA();
        await msa.init(BASE_PATH);
        const p = {lat: 47.5, lon: 8.5};
        expect(msa.getMSAFromTo(p, {...p})).toBe(11400);
    });

    it('gives the MSA of the point for a route that consists of two identical waypoints', async () => {
        const msa = new MSA();
        await msa.init(BASE_PATH);
        const p = {lat: 47.5, lon: 8.5};
        expect(msa.getMSAForRoute([p, {...p}])).toBe(11400);
    });
});
