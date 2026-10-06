/// <reference types="node" />
import {describe, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {bootUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

// 3-33: in Leg mode the ESA is the highest sector MSA from the present position to the active waypoint and on along
// FPL 0 to the destination. Except for the test of the route part, all waypoints and the aircraft lie in the one sector
// from 47N 8E, so the expected ESA is that sector's value whatever the leg sampling does (#97, the 40 NM sampling gap).
// The values are read from the shipped grid.
const GRID: number[][] = JSON.parse(readFileSync(
    'resources/html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/msa.json', 'utf-8'));
const SECTOR_47N_8E = GRID[47 + 56][8 + 180];
const SECTOR_46N_8E = GRID[46 + 56][8 + 180];

async function nav3Esa(legs: ReturnType<typeof airport>[], position: { lat: number, lon: number }) {
    const unit = await bootUnit({facilities: legs, position, storage: savedFlightplan(0, legs)});
    await settle(unit);
    await unit.panel.selectPage('L', 'NAV 3');
    await vi.advanceTimersByTimeAsync(2000);
    return {unit, esaRow: Screen.read().rows('L')[5]};
}

describe('NAV 3 ESA in Leg mode', () => {
    // The passing sibling of the pin below: with a waypoint after the active one the ESA shows the sector value
    it('shows the ESA with a waypoint after the active one (3-33)', async () => {
        const kaaa = airport('KAAA', 47.1, 8.1);
        const kbbb = airport('KBBB', 47.5, 8.5);
        const kccc = airport('KCCC', 47.8, 8.8);
        const {unit, esaRow} = await nav3Esa([kaaa, kbbb, kccc], {lat: 47.3, lon: 8.3});

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(esaRow).toBe(`ESA ${SECTOR_47N_8E}ft`);
    });

    // 3-33: the ESA includes the sectors of the rest of the route. The aircraft is in the sector from 47N 8E, 9 NM short
    // of the active KBBB, which lies in the higher sector from 46N 8E, as does KCCC. The leg to KBBB is read at its start
    // only, so the higher sector reaches the display through the route part (KBBB to KCCC) alone, and every leg is under
    // 40 NM, so that neither #97 nor the gap of the end point decides the value.
    it('shows the highest sector of the rest of the route (3-33)', async () => {
        const kaaa = airport('KAAA', 47.2, 8.4);
        const kbbb = airport('KBBB', 46.9, 8.5);
        const kccc = airport('KCCC', 46.7, 8.6);
        expect(SECTOR_46N_8E).toBeGreaterThan(SECTOR_47N_8E);
        const {unit, esaRow} = await nav3Esa([kaaa, kbbb, kccc], {lat: 47.05, lon: 8.45});

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(esaRow).toBe(`ESA ${SECTOR_46N_8E}ft`);
    });

    // 3-33: and the other way round: the aircraft is in the higher sector from 46N 8E, the active KBBB and the rest of the
    // route lie in the lower sector from 47N 8E, so the sector of the present position decides. Same leg lengths.
    it('shows the highest sector from the present position to the active waypoint (3-33)', async () => {
        const kaaa = airport('KAAA', 46.7, 8.4);
        const kbbb = airport('KBBB', 47.1, 8.5);
        const kccc = airport('KCCC', 47.3, 8.6);
        expect(SECTOR_46N_8E).toBeGreaterThan(SECTOR_47N_8E);
        const {unit, esaRow} = await nav3Esa([kaaa, kbbb, kccc], {lat: 46.9, lon: 8.45});

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(esaRow).toBe(`ESA ${SECTOR_46N_8E}ft`);
    });

    // On the last leg the rest of the route is the destination alone. MSA.getMSAForRoute returns 0 for one waypoint,
    // and Nav3Page.calculateESA takes that 0 for "no value" (`esaAlongRoute ? ... : null`), so the ESA shows dashes on
    // every final leg, also of a two-waypoint plan. Expected: the ESA from the present position to the destination.
    it.fails('shows the ESA on the last leg of FPL 0 (#NEW-4-6)', async () => {
        const kaaa = airport('KAAA', 47.1, 8.1);
        const kbbb = airport('KBBB', 47.5, 8.5);
        const {unit, esaRow} = await nav3Esa([kaaa, kbbb], {lat: 47.3, lon: 8.3});

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(esaRow).toBe(`ESA ${SECTOR_47N_8E}ft`);
    });

    // The setup sibling of the pin: the boot lands on the last leg, the page is NAV 3, and the ESA row is the dashed one
    // (asserted as the row's label only, so that no passing test claims the dashes are right)
    it('reaches the last leg of a two-waypoint FPL 0 on NAV 3 (sibling of #NEW-4-6, 3-33)', async () => {
        const kaaa = airport('KAAA', 47.1, 8.1);
        const kbbb = airport('KBBB', 47.5, 8.5);
        const {unit, esaRow} = await nav3Esa([kaaa, kbbb], {lat: 47.3, lon: 8.3});

        expect(unit.errors).toEqual([]);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1);
        expect(Screen.read().leftName()).toBe('NAV 3');
        expect(esaRow.startsWith('ESA ')).toBe(true);
    });
});
