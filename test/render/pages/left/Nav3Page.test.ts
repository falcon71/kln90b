import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, MINIMAL_PANEL_XML, moveAircraft, settle} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {readRows, Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';
import {pointFrom} from '../../../harness/flight/geo';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

describe('NAV 3 page', () => {
    // The same waypoint twice in a row (#19, #8) gives a route leg without length. The ESA is the highest MSA along the
    // rest of the route, so the page asks the MSA service for that leg too. 16800 is the value the shipped MSA grid gives
    // for this route (KAAA is at 46N 7E), copied once from the screen: characterization of the grid data.
    it('shows the ESA with the same waypoint twice in FPL 0 and raises no error (#8 4cbe2b5) (characterization)', async () => {
        const kaaa = airport('KAAA', 46, 7);
        const abc = vor('ABC', 47, 8);
        const kbbb = airport('KBBB', 48, 9);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            position: {lat: 46, lon: 7},
            storage: savedFlightplan(0, [kaaa, abc, abc, kbbb]),
        });
        // The FPL activates at the first calculation tick with a GPS fix
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 3');
        await vi.advanceTimersByTimeAsync(2000);

        // KAAA is the FROM waypoint and ABC the active one, followed by the duplicate and KBBB
        const activeWaypoint = unit.props.memory.navPage.activeWaypoint;
        expect(activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('ABC');
        expect(activeWaypoint.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ABC', 'ABC', 'KBBB']);

        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect(rows[0]).toBe('KAAA ›ABC  ');
        expect(rows[5]).toBe('ESA 16800ft');
    });
});

// An invented world: KDDD, KAAA 200 NM west of it on the great circle that leaves KDDD on 270 true, and KEEE 30 NM east
// of KDDD, so that the leg KAAA to KDDD is not the last one (the ESA of the last leg is #183). FPL 0 is KAAA, KDDD, KEEE.
const KDDD = airport('KDDD', 47.0, 9.0);
const KAAA = airport('KAAA', pointFrom(KDDD, 270, 200).lat, pointFrom(KDDD, 270, 200).lon);
const KEEE = airport('KEEE', pointFrom(KDDD, 90, 30).lat, pointFrom(KDDD, 90, 30).lon);
const west = (nm: number) => pointFrom(KDDD, 270, nm);
// Without an OBS input there is no external course: DTK does not flash for a mismatch (4-9), and OBS can be entered
const OBS_SOURCE_OFF = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>';

/**
 * Boots on the leg KAAA to KDDD, 30 NM west of KDDD, selects NAV 3 on the left and holds the position `rightNm` right of
 * the course (south of it, the leg is eastbound) at 120 kt with the track of the leg
 */
async function nav3OnLeg(rightNm: number, panelXml = OBS_SOURCE_OFF): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KDDD, KEEE], position: west(30), panelXml,
        storage: savedFlightplan(0, [KAAA, KDDD, KEEE]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'NAV 3');
    await moveAircraft(unit, pointFrom(west(30), 180, rightNm), {groundspeedKt: 120, trackTrue: 90});
    expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KDDD'); // Precondition
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

describe('NAV 3 page (characterization)', () => {
    it('shows the leg, DTK, TK, the cross track, MSA and ESA on an FPL 0 leg', async () => {
        await nav3OnLeg(0.3);

        expect(Screen.read().rows('L')).toEqual([
            'KAAA ›KDDD ',
            'DTK    089°',
            'TK     090°',
            'FLY L 0.3nm',
            'MSA 15900ft',
            'ESA 15900ft',
        ]);
    });
});

describe('NAV 3 page on an FPL 0 leg', () => {
    // 3-32, 5-35: in OBS mode the selected course replaces DTK; the colon after OBS says it can be entered on the unit,
    // which it can without an external indicator. 5-36: switching to OBS without an external indicator keeps the
    // deviation, so on the course the OBS is the DTK, 088.8 true there (the course from the aircraft to KDDD), 089.
    it('shows OBS: with the course in OBS mode without an external indicator (3-32, 5-35, 5-36)', async () => {
        const unit = await nav3OnLeg(0);
        await unit.panel.obsMode();
        await unit.panel.selectPage('L', 'NAV 3');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(Screen.read().rows('L')[1]).toBe('OBS:   089°');
    });

    // 5-35: with an external indicator the course is set there, and OBS shows without the colon. The indicator is set to
    // 100 (Nav OBS:1, the default ObsSource).
    it('shows OBS without the colon when the course comes from the external indicator (5-35)', async () => {
        const unit = await nav3OnLeg(0, MINIMAL_PANEL_XML);
        unit.env.sim.set('Nav OBS:1', 'degrees', 100);
        await unit.panel.obsMode();
        await unit.panel.selectPage('L', 'NAV 3');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(Screen.read().rows('L')[1]).toBe('OBS    100°');
    });

    // 5-35 steps b and c (figures 5-113, 5-114): with the colon shown the cursor goes over the OBS course and the inner
    // knob changes it, one degree per click
    it('changes the OBS course with the inner knob under the cursor (5-35)', async () => {
        const unit = await nav3OnLeg(0);
        await unit.panel.obsMode();
        await unit.panel.selectPage('L', 'NAV 3');
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 7, text: '089°'});

        await unit.panel.inner('L', 2);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[1]).toBe('OBS:   091°');

        await unit.panel.inner('L', -3);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[1]).toBe('OBS:   088°');
    });

    // 3-32: FLY L or R and the distance to the course. 0.3 NM right of the course reads FLY L 0.3nm
    it('reads FLY L 0.3nm 0.3 NM right of the course (3-32)', async () => {
        await nav3OnLeg(0.3);

        expect(Screen.read().rows('L')[3]).toBe('FLY L 0.3nm');
    });

    // The setup sibling of the pin: 9.97 NM right of the course, NAV 3 on the left
    it('reaches 9.97 NM right of the course (3-32)', async () => {
        const unit = await nav3OnLeg(9.97);

        expect(unit.props.memory.navPage.xtkToActive!).toBeCloseTo(9.97, 2);
        const row = readRows(document.querySelector('.left-page')!).map(r => r.map(c => c.ch).join(''))[3];
        expect(row.startsWith('FLY L ')).toBe(true);
    });

    // 3-32 (figures 3-104, 3-105): the cross track has three cells. Just below 10 NM the tenths round up to 10.0, four
    // cells, which runs past the edge of the half page. Expected: 10 (rounded) or 9.9 (truncated) in the three cells.
    it.fails('keeps the cross track in its three cells just below 10 NM (3-32, #NEW-1-4)', async () => {
        await nav3OnLeg(9.97);

        expect(['FLY L  10nm', 'FLY L 9.9nm']).toContain(Screen.read().rows('L')[3]);
    });
});
