import {describe, expect, it, vi} from 'vitest';
import {BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, NEAREST_SEARCH_WAIT_MS, settle} from '../../harness/boot';
import {airspace} from '../../harness/navdata/airspaces';
import {airport} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';

/** The text of the MSG page, read as the pilot sees it: one row per message line. */
const messagePageText = () => Screen.read().text();

const around = (lat: number, lon: number, d: number): [number, number][] => [[lat + d, lon - d], [lat + d, lon + d], [lat - d, lon + d], [lat - d, lon - d]];

describe('airspaces served by the harness', () => {
    // 3-39, 3-40: the message INSIDE SPC USE AIRSPACE. The aircraft is on the ground at 0 ft, the floor of the area, so
    // the vertical check holds whichever way it compares the ceiling (see the pin #127 in AirspaceAlert.test.ts).
    it('shows the SUA message for an aircraft inside a restricted area', async () => {
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
            airspaces: [airspace('R-TEST', BoundaryType.Restricted, around(47.0, 8.0, 0.1), {minFt: 0, maxFt: 5000})],
        });
        await settle(unit);

        // The alert searches every 10 s (NEAREST_SEARCH_WAIT_MS)
        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.msg();

        expect(messagePageText()).toContain('INSIDE SPC USE AIRSPACE\n R-TEST');
    });

    it('shows no message for an aircraft outside the restricted area', async () => {
        const unit = await bootUnit({
            position: {lat: 47.5, lon: 8.0}, altitudeFt: 0,
            airspaces: [airspace('R-TEST', BoundaryType.Restricted, around(47.0, 8.0, 0.1), {minFt: 0, maxFt: 5000})],
        });
        await settle(unit);

        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);
        await unit.panel.msg();

        expect(messagePageText()).not.toContain('SPC USE AIRSPACE');
    });

    it('lists an airspace that lies on the route on TRI 2', async () => {
        // The route runs from the present position (47.0N) to KBBB, 20 NM north. The airspace straddles the route and
        // holds its search centers (the position and the middle of the route), so #102 does not hide it.
        const unit = await bootUnit({
            facilities: [airport('KBBB', 47.3333, 8.0)],
            position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
            airspaces: [airspace('R-ROUTE', BoundaryType.Restricted, [[47.2, 7.8], [47.2, 8.2], [46.9, 8.2], [46.9, 7.8]])],
        });
        await settle(unit);

        await unit.panel.selectPage('L', 'TRI 2');
        await unit.panel.cursor('L');
        await unit.panel.type('L', 'KBBB');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);

        // Row 0 is the route, row 1 the ESA line; the airspace follows with its name and type
        const rows = Screen.read().half('L').split('\n');
        expect(rows[0]).toBe('P.POS-KBBB ');
        expect(rows.slice(2, 4)).toEqual(['R-ROUTE    ', ' REST      ']);
    });

    // OTH 2 reads frequency.name of every Center (Oth2Page.redraw), so the helper has to give the name
    it('shows the name and frequency of a Center on OTH 2', async () => {
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
            airspaces: [airspace('TEST CENTER', BoundaryType.Center, around(47.0, 8.0, 0.5), {frequencyMHz: 118.55})],
        });
        await settle(unit);

        await unit.panel.selectPage('L', 'OTH 2');
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().half('L').split('\n').slice(0, 3)).toEqual(['TEST CENTER', 'CTR        ', '     118.55']);
        expect(unit.errors).toEqual([]);
    });

    it('shows the frequency name of a Center when one is given', async () => {
        const unit = await bootUnit({
            position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
            airspaces: [airspace('TEST CENTER', BoundaryType.Center, around(47.0, 8.0, 0.5), {frequencyMHz: 118.55, frequencyName: 'ZURICH'})],
        });
        await settle(unit);

        await unit.panel.selectPage('L', 'OTH 2');
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().half('L').split('\n').slice(0, 3)).toEqual(['ZURICH     ', 'CTR        ', '     118.55']);
        expect(unit.errors).toEqual([]);
    });
});
