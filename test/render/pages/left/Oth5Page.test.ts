import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {distanceNm} from '../../../harness/flight/geo';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

const FUEL_PANEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>'
    + '<Input><FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer></Input>'
    + '</Instrument></PlaneHTMLConfig>';

describe('OTH 5 page', () => {
    // 5-39 for the page; the SimVar is the contract with the aircraft: the fuel computer's fuel on board is EX1 (#53)
    it('shows the fuel on board from the EX1 SimVar, in the configured unit (#53)', async () => {
        const unit = await bootUnit({panelXml: FUEL_PANEL_XML});
        // The decoy is the plain SimVar, which must not be read
        unit.env.sim.set('FUEL TOTAL QUANTITY WEIGHT EX1', 'pounds', 300);
        unit.env.sim.set('FUEL TOTAL QUANTITY WEIGHT', 'pounds', 600);

        await unit.panel.selectPage('L', 'OTH 5');
        await vi.advanceTimersByTimeAsync(1500);

        const rows = Screen.read().rows('L');
        // 300 lb of avgas at 6 lb per US gallon
        expect(rows[1]).toBe('FOB      50');
        expect(rows[0].endsWith('GAL')).toBe(true);
    });
});

/** A fuel computer installation; fuel is the inner XML of FuelComputer after IsInterfaced (Unit, FOBTransmitted, ...) */
function fuelXml(fuel = ''): string {
    return '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>'
        + `<FuelComputer><IsInterfaced>true</IsInterfaced>${fuel}</FuelComputer>`
        + '</Input></Instrument></PlaneHTMLConfig>';
}

/** Where the aircraft flies at 120 kt toward ABC: on the first leg of the standard route, 0.8 NM past KAAA */
const ON_LEG = {lat: 47.01, lon: 8.02};

/**
 * A twin with a fuel computer, FPL 0 KAAA ABC KBBB, flying at 120 kt on the first leg. The fuel computer reads the
 * number of engines when the unit is built, so the SimVar goes in through the boot. Avgas in US gallons is 6 lb per
 * gallon (the SDK's autogas gallon, as the #53 test above uses): 756 lb on board are 126 GAL, 90 and 84 pph are 15 and
 * 14 GAL/HR.
 */
async function twinOnRoute(reserve = 0, fpl0?: 'KAAA-KBBB'): Promise<HeadlessUnit> {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        panelXml: fuelXml(), facilities: [kaaa, abc, kbbb],
        storage: savedFlightplan(0, fpl0 === 'KAAA-KBBB' ? [kaaa, kbbb] : [kaaa, abc, kbbb]),
        simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 2}],
    });
    unit.env.sim.set('FUEL TOTAL QUANTITY WEIGHT EX1', 'pounds', 756);
    unit.env.sim.set('ENG FUEL FLOW PPH:1', 'pounds per hour', 90);
    unit.env.sim.set('ENG FUEL FLOW PPH:2', 'pounds per hour', 84);
    await settle(unit);
    await moveAircraft(unit, ON_LEG, {groundspeedKt: 120, trackTrue: 50});
    unit.props.memory.othPage.reserve = reserve;
    await unit.panel.selectPage('L', 'OTH 5');
    await vi.advanceTimersByTimeAsync(1500);
    return unit;
}

describe('OTH 5 page (characterization)', () => {
    it('characterization: a twin on the first leg of KAAA ABC KBBB', async () => {
        await twinOnRoute();

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " KBBB   GAL
          FOB     126
          REQD     22
          L FOB   104
          RES:  00000
          EXTRA   104"
        `);
    });
});

describe('OTH 5 page, fuel to the destination (5-39, 5-40)', () => {
    // 5-39: the KLN computes the fuel required as the ETE to the destination along the route times the present fuel flow;
    // 5-40: L FOB is FOB minus REQD, EXTRA is L FOB minus RES. The ETE is derived here from geo.ts: the great-circle
    // distance to ABC, then ABC to KBBB, at 120 kt
    it('shows REQD, L FOB and EXTRA from the fuel flow, the ETE along the route and the reserve (5-39, 5-40)', async () => {
        await twinOnRoute(30);
        const {abc, kbbb} = standardRoute();
        const eteHours = (distanceNm(ON_LEG, abc) + distanceNm(abc, kbbb)) / 120;
        const reqd = 29 * eteHours;     // 21.8 GAL
        const lfob = 126 - reqd;        // 104.2 GAL
        const extra = lfob - 30;        // 74.2 GAL
        const cell = (n: number) => String(Math.round(n)).padStart(5, ' ');

        const rows = Screen.read().rows('L');
        expect(rows.slice(2, 6)).toEqual([`REQD  ${cell(reqd)}`, `L FOB ${cell(lfob)}`, 'RES:  00030', `EXTRA ${cell(extra)}`]);
    });

    // 5-39: the destination is the last waypoint of the route, with the active arrow when it is the active waypoint
    it('shows the destination with the active arrow when it is the active waypoint (5-39)', async () => {
        await twinOnRoute(0, 'KAAA-KBBB');

        expect(Screen.read().rows('L')[0]).toBe('›KBBB   GAL');
    });

    it('shows the destination without the arrow while an earlier waypoint is active (5-39)', async () => {
        await twinOnRoute();

        expect(Screen.read().rows('L')[0]).toBe(' KBBB   GAL');
    });
});

describe('OTH 5 page, fuel on board and reserve entry (5-40)', () => {
    // 5-40: without the colon after FOB the fuel on board cannot be changed on the KLN, so the cursor starts on RES
    it('puts the cursor on RES first when the fuel on board is transmitted (5-40)', async () => {
        const unit = await bootUnit({panelXml: fuelXml()});
        await unit.panel.selectPage('L', 'OTH 5');
        await unit.panel.cursor('L');

        expect(Screen.read().rows('L')[1]).toBe('FOB       0');
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 6, text: '0'});
    });

    // 5-40: with the colon (a Shadin computer without its control head) the fuel on board is set with the left inner knob
    it('sets the fuel on board with the inner knob when FOB shows a colon (5-40)', async () => {
        const unit = await bootUnit({panelXml: fuelXml('<FOBTransmitted>false</FOBTransmitted>')});
        await unit.panel.selectPage('L', 'OTH 5');
        expect(Screen.read().rows('L')[1]).toBe('FOB:      0');
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 6, text: '    0'});

        await unit.panel.inner('L', 3);
        await unit.panel.inner('L', -1);

        expect(Screen.read().rows('L')[1]).toBe('FOB:      2');
    });

    // 5-40: the reserve is entered digit by digit with the outer and inner knobs; 5-41: OTH 6 shows the same reserve
    it('enters the reserve digit by digit, and OTH 6 shows the same reserve (5-40, 5-41)', async () => {
        const unit = await bootUnit({panelXml: fuelXml()});
        await unit.panel.selectPage('L', 'OTH 5');
        await unit.panel.cursor('L');

        await unit.panel.outer('L', 3);     // the tens digit
        await unit.panel.inner('L', 4);
        await unit.panel.outer('L', 1);     // the units digit
        await unit.panel.inner('L', 5);
        expect(Screen.read().rows('L')[4]).toBe('RES:  00045');
        await unit.panel.cursor('L');

        await unit.panel.selectPage('L', 'OTH 6');
        expect(Screen.read().rows('L')[5]).toBe(' RES: 00045');
    });
});
