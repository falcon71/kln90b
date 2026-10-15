import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {ActiveArrow} from '../../../../kln90b/controls/displays/ActiveArrow';
import {NavPageState} from '../../../../kln90b/data/VolatileMemory';
import {airport} from '../../../harness/navdata/builders';
import {mountedCycle} from '../../../harness/render/blink';
import {mount, mountedRead} from '../../../harness/render/mount';

const KAAA = airport('KAAA', 47.0, 8.0);
const KBBB = airport('KBBB', 47.5, 8.0);

/**
 * The part of NavPageState that ActiveArrow reads: the active waypoint, its index in FPL 0 (#294) and the waypoint
 * alert
 */
function navState(active: Facility | null, waypointAlert = false, activeFplIdx = 0): NavPageState {
    return {
        activeWaypoint: {getActiveWpt: () => active, getActiveFplIdx: () => activeFplIdx},
        waypointAlert,
    } as unknown as NavPageState;
}

/** The arrow cell of a page showing `shown` (its ICAO, or null for a page without a waypoint) after a display tick */
function arrow(shown: Facility | null, state: NavPageState): { text: string, mask: string } {
    return mountedRead(new ActiveArrow(shown?.icaoStruct ?? null, state));
}

/** The (text, mask) of the arrow cell on four display ticks, the fourth the blink tick */
function arrowCycle(shown: Facility | null, state: NavPageState): { text: string, mask: string }[] {
    const m = mount(new ActiveArrow(shown?.icaoStruct ?? null, state));
    return mountedCycle(m, () => ({text: m.text(), mask: m.mask()}));
}

// The arrow is the font's › (U+203A), drawn as the solid arrow in front of an ident (docs/architecture.md)
describe('ActiveArrow', () => {
    // 3-29 and 4-10, figure 4-37: an arrow in front of the identifier marks the active waypoint on its waypoint page
    it('shows the arrow on the page of the active waypoint (3-29, 4-10)', () => {
        expect(arrow(KAAA, navState(KAAA)).text).toBe('›');
    });

    // 4-10, figure 4-38: the page of a waypoint that is not active has no arrow
    it('shows a blank on the page of another waypoint (4-10)', () => {
        expect(arrow(KBBB, navState(KAAA)).text).toBe(' ');
    });

    // 4-10: without an active waypoint nothing is designated
    it('shows a blank without an active waypoint (4-10)', () => {
        expect(arrow(KAAA, navState(null)).text).toBe(' ');
        expect(arrow(null, navState(null)).text).toBe(' ');
    });

    // 4-10: a page that shows no waypoint never carries the arrow
    it('shows a blank on a page without a waypoint (4-10)', () => {
        expect(arrow(null, navState(KAAA)).text).toBe(' ');
    });

    // 3-29 and 4-8: during waypoint alerting the arrow in front of the active waypoint flashes. The display flashes on
    // the blink tick (every fourth display tick) and is steady on the others.
    it('flashes the arrow during waypoint alerting (3-29, 4-8)', () => {
        expect(arrowCycle(KAAA, navState(KAAA, true))).toEqual([
            {text: '›', mask: '.'}, {text: '›', mask: '.'}, {text: '›', mask: '.'}, {text: '›', mask: 'B'},
        ]);
    });

    // 3-29, 4-8: without the alert the arrow is steady
    it('keeps the arrow steady without waypoint alerting (3-29, 4-8)', () => {
        expect(arrowCycle(KAAA, navState(KAAA, false))).toEqual(Array(4).fill({text: '›', mask: '.'}));
    });

    // 3-29: only the arrow of the active waypoint flashes; another waypoint's page has none
    it('shows no flashing cell on another waypoint\'s page during the alert (3-29)', () => {
        expect(arrowCycle(KBBB, navState(KAAA, true))).toEqual(Array(4).fill({text: ' ', mask: '.'}));
    });
});

// #294: a page that knows the place of its waypoint in FPL 0 (the ACT pages) gives the arrow that index, and the arrow
// compares it with the active one instead of the ICAOs, so two copies of one waypoint differ. The booted behavior is
// held on the ACT page (ActPage.test.ts); here the arrow is driven directly.
describe('ActiveArrow plan index', () => {
    // 4-10: the arrow marks the active waypoint; the plan index identifies it
    it('shows the arrow when its plan index is the active one (4-10, #294)', () => {
        const m = mount(new ActiveArrow(KAAA.icaoStruct, navState(KAAA, false, 2), 2));
        m.tick();
        expect(m.text()).toBe('›');
    });

    it('characterization: shows a blank at another plan index although the ICAOs are equal (#294)', () => {
        const m = mount(new ActiveArrow(KAAA.icaoStruct, navState(KAAA, false, 1), 3));
        m.tick();
        expect(m.text()).toBe(' ');
    });

    it('characterization: without a plan index the arrow compares the ICAOs (#294)', () => {
        // The active index differs from every index the test could pass, so only the ICAO comparison can decide
        const same = mount(new ActiveArrow(KAAA.icaoStruct, navState(KAAA, false, 5), null));
        same.tick();
        expect(same.text()).toBe('›');
        const other = mount(new ActiveArrow(KBBB.icaoStruct, navState(KAAA, false, 5), null));
        other.tick();
        expect(other.text()).toBe(' ');
    });

    it('characterization: a plan index set after the construction is used at the next display tick (#294)', () => {
        const arrowAt = new ActiveArrow(null, navState(KAAA, false, 2), -1);
        const m = mount(arrowAt);
        m.tick();
        expect(m.text()).toBe(' ');

        arrowAt.fplIdx = 2;
        m.tick();
        expect(m.text()).toBe('›');
    });
});

describe('ActiveArrow (characterization)', () => {
    it('characterization: the cell is blank until the first display tick', () => {
        const m = mount(new ActiveArrow(KAAA.icaoStruct, navState(KAAA)));
        expect(m.text()).toBe(' ');
    });

    it('characterization: the arrow follows the active waypoint at the next display tick', () => {
        const state = navState(KAAA);
        const m = mount(new ActiveArrow(KBBB.icaoStruct, state));
        m.tick();
        expect(m.text()).toBe(' ');
        // The state is a stub that has only what ActiveArrow reads: activeWaypoint.getActiveWpt(), which tick() calls
        // on every display tick, and waypointAlert, which tick() reads to flash the arrow. The test replaces
        // getActiveWpt to move the active waypoint after the mount, which a booted unit would do through a Direct To
        // or a sequence (the booted behavior is held by the page tests)
        (state as unknown as {
            activeWaypoint: { getActiveWpt: () => Facility }
        }).activeWaypoint.getActiveWpt = () => KBBB;
        m.tick();
        expect(m.text()).toBe('›');
    });
});
