import {describe, expect, it, vi} from 'vitest';
import {FlightplanArrow} from '../../../../kln90b/controls/displays/FlightplanArrow';
import {NavPageState} from '../../../../kln90b/data/VolatileMemory';
import {CursorController} from '../../../../kln90b/pages/CursorController';
import {mountedCycle} from '../../../harness/render/blink';
import {mount} from '../../../harness/render/mount';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

/** The part of NavPageState that FlightplanArrow reads: the active index in FPL 0, Direct To, the waypoint alert */
function navState(activeIdx: number, dct = false, waypointAlert = false): NavPageState {
    return {
        activeWaypoint: {getActiveFplIdx: () => activeIdx, isDctNavigation: () => dct},
        waypointAlert,
    } as unknown as NavPageState;
}

/** A cursor controller whose focused field is being edited (`entered`) or that has no field under the cursor */
function cursor(entered = false): CursorController {
    return {getCurrentFocusedField: () => entered ? {isEntered: true} : null} as unknown as CursorController;
}

/** The arrow cell of the FPL 0 row of waypoint `idx` after a display tick */
function arrow(idx: number, state: NavPageState, entered = false): { text: string, mask: string } {
    const m = mount(new FlightplanArrow(idx, state, cursor(entered)));
    m.tick();
    return {text: m.text(), mask: m.mask()};
}

/** The (text, mask) of that cell on four display ticks, the fourth the blink tick */
function arrowCycle(idx: number, state: NavPageState): { text: string, mask: string }[] {
    const m = mount(new FlightplanArrow(idx, state, cursor()));
    return mountedCycle(m, () => ({text: m.text(), mask: m.mask()}));
}

// The font draws the active leg symbol with three code points (FlightplanArrow.tsx): À its head, in front of the active
// "to" waypoint, Á its tail, in front of the "from" waypoint, Â its shaft, on a procedure header row between the two.
// › is the plain arrow.
describe('FlightplanArrow', () => {
    // 4-7, figure 4-29: the head of the active leg symbol is in front of the active "to" waypoint, its tail in front of
    // the "from" waypoint
    it('draws the head of the leg symbol at the active waypoint and the tail at the from waypoint (4-7)', () => {
        const state = navState(2);
        expect(arrow(2, state).text).toBe('À');
        expect(arrow(1, state).text).toBe('Á');
    });

    // 4-7, figure 4-29: the other waypoints of the plan have no symbol
    it('leaves the other waypoints blank (4-7)', () => {
        const state = navState(2);
        expect(arrow(0, state).text).toBe(' ');
        expect(arrow(3, state).text).toBe(' ');
    });

    // 4-7 and 4-11, figure 4-42: during a Direct To to a waypoint of the plan the leg symbol is not drawn; just an
    // arrow precedes the Direct To waypoint, and the waypoint before it has nothing
    it('draws just the arrow at a Direct To waypoint and nothing at the one before it (4-7, 4-11)', () => {
        const state = navState(2, true);
        expect(arrow(2, state).text).toBe('›');
        expect(arrow(1, state).text).toBe(' ');
    });

    // 4-7: without an active waypoint in the plan there is no leg
    it('draws nothing without an active waypoint in the plan (4-7)', () => {
        expect(arrow(0, navState(-1)).text).toBe(' ');
        expect(arrow(-1, navState(-1)).text).toBe(' ');
    });

    // 4-8, figure 4-35: during waypoint alerting the arrow in front of the active waypoint flashes, on the blink tick
    // (every fourth display tick); the tail does not
    it('flashes the head at the active waypoint during waypoint alerting (4-8)', () => {
        const state = navState(2, false, true);
        expect(arrowCycle(2, state)).toEqual([
            {text: 'À', mask: '.'}, {text: 'À', mask: '.'}, {text: 'À', mask: '.'}, {text: 'À', mask: 'B'},
        ]);
    });

    // 4-8: the tail does not flash
    it('keeps the tail steady during waypoint alerting (4-8)', () => {
        expect(arrowCycle(1, navState(2, false, true))).toEqual(Array(4).fill({text: 'Á', mask: '.'}));
    });

    // 4-8: without the alert the head is steady
    it('keeps the head steady without waypoint alerting (4-8)', () => {
        expect(arrowCycle(2, navState(2))).toEqual(Array(4).fill({text: 'À', mask: '.'}));
    });

    // 3-29: the Direct To arrow flashes the same way
    it('flashes the Direct To arrow during waypoint alerting (3-29)', () => {
        expect(arrowCycle(2, navState(2, true, true))).toEqual([
            {text: '›', mask: '.'}, {text: '›', mask: '.'}, {text: '›', mask: '.'}, {text: '›', mask: 'B'},
        ]);
    });

    // A video of a real unit the code cites (youtu.be/-7xleA3Hz3Y?t=435): while a waypoint is being entered on FPL 0
    // all arrows are gone
    it('draws nothing while a field of the page is being edited (the video the code cites)', () => {
        const state = navState(2);
        expect(arrow(2, state, true).text).toBe(' ');
        expect(arrow(1, state, true).text).toBe(' ');
    });
});

describe('FlightplanArrow (characterization)', () => {
    // A procedure header row sits between two waypoints; FlightplanList gives it the index i - 0.5
    it('characterization: a procedure header row right before the active waypoint draws the shaft', () => {
        expect(arrow(1.5, navState(2)).text).toBe('Â');
        expect(arrow(1.5, navState(2, true)).text).toBe(' ');
    });

    it('characterization: a hidden arrow (the row under the cursor) shows nothing', () => {
        const a = new FlightplanArrow(2, navState(2), cursor());
        const m = mount(a);
        a.isVisible = false;
        m.tick();
        expect(m.text()).toBe('');
    });
});

/** FPL 0 KAAA, ABC, KBBB on the left, flying from KAAA to ABC */
async function onFpl0(): Promise<HeadlessUnit> {
    const r = standardRoute();
    const unit = await bootUnit({
        facilities: [r.kaaa, r.abc, r.kbbb], storage: savedFlightplan(0, [r.kaaa, r.abc, r.kbbb]),
        position: {lat: r.kaaa.lat, lon: r.kaaa.lon},
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 0');
    return unit;
}

describe('FlightplanArrow on FPL 0 during a NAV flag', () => {
    // 4-7, figure 4-29: the setup sibling of the pin. Navigating, FPL 0 draws the leg symbol from KAAA to ABC; after
    // the GPS loses its solution (gps.reset() in the middle of the test, testing.md) the unit is flagged and ABC stays
    // active
    it('draws the leg symbol while navigating, and keeps ABC active through the flag (4-7)', async () => {
        const unit = await onFpl0();
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['Á 1:KAAA   ', 'À 2:ABC    ']);

        unit.props.sensors.in.gps.reset();
        await vi.advanceTimersByTimeAsync(1500);

        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // the fast acquisition takes 10 s
        expect(unit.props.memory.navPage.toFrom).toBeNull(); // the flag
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1);
        expect(Screen.read().rows('L')[2].slice(2)).toBe('2:ABC    ');
    });

    // 4-7: the active leg symbol is not displayed unless the unit is actually receiving navigation signals suitable for
    // navigation. The arrow keeps drawing it through a NAV flag, because the flag keeps the active waypoint. Whether a
    // plain arrow stays in front of ABC is not claimed: the pin asserts only that neither end of the symbol is drawn.
    it.fails('draws no leg symbol during a NAV flag (4-7, #NEW-7-1)', async () => {
        const unit = await onFpl0();
        unit.props.sensors.in.gps.reset();
        await vi.advanceTimersByTimeAsync(1500);

        const rows = Screen.read().rows('L').slice(1, 3);
        expect([rows[0][0], rows[1][0]]).toEqual([' ', expect.not.stringMatching(/[ÀÁ]/)]);
    });
});
