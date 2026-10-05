import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, FlightPlanner, FlightPlannerOptions, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {courseDeg, pointBefore, pointFrom} from '../../../harness/flight/geo';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const kaaa = airport('KAAA', 47.0, 8.0);
const abc = vor('ABC', 47.2, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

describe('ActiveWaypoint on FPL 0', () => {
    it('flags navigation and drops the FROM waypoint when deleting leaves fewer than two legs (0031c11, d8edd70)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.2, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: KBBB is active, KAAA is FROM
        expect(aw.getFromWpt()).not.toBeNull();

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // KBBB
        await unit.panel.clr();
        await unit.panel.ent(); // DEL KBBB ?
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveWpt()).toBeNull();
        expect(aw.getActiveFplIdx()).toBe(-1);
        expect(aw.isDctNavigation()).toBe(false);
        expect(aw.getFromWpt()).toBeNull();
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(1);
        // The remaining leg is neither active nor FROM, so its row has no arrow (4-1: FPL 0 with one waypoint is flagged)
        expect(Screen.read().rows('L')[1]).toBe('  1:KAAA   ');
    });

    // 3-28: a typed Direct To target that is in FPL 0 takes its place in the plan (4-10)
    it('directTo reads the target leg, not the previous active index (43d472b)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: ABC is active

        // The boot right page is SUP without a facility, so the DIR page opens blank (not prefilled with ABC)
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KBBB');
        await unit.panel.ent(); // APT 1 confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.isDctNavigation()).toBe(true);
        // What the pilot sees: back on NAV 2 and NAV 1, flying to KBBB
        const screen = Screen.read();
        expect(screen.status().left).toBe('NAV 2');
        expect(screen.status().right).toBe('NAV 1');
        expect(screen.rows('R')[0]).toBe('d    ›KBBB ');
    });

    it('keeps a deleted direct-to target as a random direct-to (#67)', async () => {
        // 4-10 to 4-11: a Direct To waypoint is flown on its own, the plan only resumes after it
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2); // KBBB
        await unit.panel.dct();
        await unit.panel.ent();
        expect(aw.getActiveFplIdx()).toBe(2); // Precondition: direct to the last leg
        expect(aw.isDctNavigation()).toBe(true);

        await unit.panel.clr();
        await unit.panel.ent(); // DEL KBBB ?
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(aw.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(aw.getActiveFplIdx()).toBe(-1);
        expect(aw.isDctNavigation()).toBe(true);
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(2);
        // What the pilot sees: the leg is gone from FPL 0, NAV 1 still flies to KBBB
        const screen = Screen.read();
        expect(screen.rows('L').slice(1, 4)).toEqual(['  1:KAAA   ', '  2:ABC    ', '  3:       ']);
        expect(screen.rows('R')[0]).toBe('d    ›KBBB ');
    });
});

describe('OBS mode on a flight plan with the same waypoint twice (3415417, #67)', () => {
    // The default ObsSource 1 would take the course from Nav OBS:1 and never reach the fallback line of the fix
    const OBS_SOURCE_OFF = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>';

    async function enterObsOnDuplicatedPlan() {
        // Five NM west of KAAA, so the bearing to KAAA is about 090
        const position = pointFrom(kaaa, 270, 5);
        const unit = await bootUnit({
            facilities: [kaaa], position, panelXml: OBS_SOURCE_OFF,
            storage: savedFlightplan(0, [kaaa, kaaa]),
        });
        await settle(unit);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(3000);
        return {unit, position};
    }

    // 5-36: switching to OBS keeps the active waypoint. Before the fix the unit used a desired track that does not exist
    // when TO and FROM are the same waypoint. No exception shows (the OBS course stays blank and the deviation is the
    // whole distance), so the assertions are on the state and the screen, not on unit.errors alone.
    it('enters OBS with a defined course and zero deviation, the waypoint stays active (#67)', async () => {
        const {unit} = await enterObsOnDuplicatedPlan();
        const nav = unit.props.memory.navPage;

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KAAA');
        expect(Number.isFinite(nav.obsMag)).toBe(true);
        expect(Number.isFinite(nav.xtkToActive)).toBe(true);
        // Under the break the OBS course on the left half is blank (OBS:°)
        expect(Screen.read().rows('L')[3]).toMatch(/^OBS:\d{3}°/);
        expect(unit.errors).toEqual([]);
    });

    // The Pilot's Guide does not say which course OBS takes when the plan has no desired track. The unit takes the
    // bearing to the waypoint, which leaves the deviation at zero (under the break it is the 5 NM to the waypoint).
    it('takes the bearing to the waypoint as the OBS course (characterization, #67)', async () => {
        const {unit, position} = await enterObsOnDuplicatedPlan();

        expect(Math.abs(unit.props.memory.navPage.xtkToActive!)).toBeLessThan(0.05);
        expect(Math.abs(unit.props.memory.navPage.obsMag - courseDeg(position, kaaa))).toBeLessThan(0.5);
        expect(Screen.read().rows('L')[3]).toBe('OBS:090°   ');
    });
});

describe('sequencing after a direct-to to a waypoint of FPL 0 (748151c, #70)', () => {
    async function directToAbc() {
        // The final course KAAA - ABC is about 51.0 degrees
        const {kaaa: stdKaaa, abc: stdAbc, kbbb: stdKbbb} = standardRoute();
        const position = pointBefore(stdKaaa, stdAbc, 5);
        const unit = await bootUnit({
            facilities: [stdKaaa, stdAbc, stdKbbb], position,
            storage: savedFlightplan(0, [stdKaaa, stdAbc, stdKbbb]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        await unit.panel.selectPage('R', 'CTR 1'); // So DCT pre-fills the active waypoint (3-27) instead of opening blank
        await unit.panel.dct();
        await unit.panel.ent();
        // Preconditions of the bug: the direct-to makes the SDK planner leave plan 0 for its own direct-to plan
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveFplIdx()).toBe(1);
        // The SDK keeps one planner per id and ignores the options of a later call, so this is the unit's own planner
        const planner = FlightPlanner.getPlanner('kln90b', unit.core.bus, {} as FlightPlannerOptions);
        expect(planner.activePlanIndex).toBe(1);
        expect(planner.hasFlightPlan(1)).toBe(true);
        return {unit, aw, planner};
    }

    // 4-10: a direct-to to a waypoint of FPL 0 resumes the plan when the waypoint is reached.
    // 748151c published activeWaypointChanged before the leg data was set, which threw here after a direct-to.
    it('sequences to the next leg of FPL 0 without an error (#70)', async () => {
        const {aw} = await directToAbc();

        expect(() => aw.sequenceToNextWaypoint()).not.toThrow();

        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('KBBB');
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.isDctNavigation()).toBe(false); // 4-10: the plan is resumed
    });

    // Public contract (CLAUDE.md, the SDK FlightPlanner id "kln90b" mirrored from FPL 0): the planner follows the sequence.
    // Deleting the publish does not throw, the planner just stays on the direct-to plan.
    it('mirrors the sequence in the SDK flight planner (#70)', async () => {
        const {aw, planner} = await directToAbc();

        aw.sequenceToNextWaypoint();

        expect(planner.activePlanIndex).toBe(0);
        expect(planner.hasFlightPlan(1)).toBe(false);
        expect(planner.getFlightPlan(0).activeLateralLeg).toBe(2);
        expect(planner.getFlightPlan(0).getLeg(2).leg.fixIcaoStruct.ident).toBe('KBBB');
        // The direct-to of the planner is cleared; a stale one is the symptom of #70
        expect(planner.getFlightPlan(0).directToData).toEqual({segmentIndex: -1, segmentLegIndex: -1});
    });
});

// 42099f3: ActiveWaypoint.findClosestLegIdx picks the leg of FPL 0 that is closest to the aircraft when a plan becomes
// active. The Pilot's Guide has no page for how the unit picks the leg after a load, so this pins what the unit does
// (characterization): it takes the leg whose segment, between its two waypoints, is closest.
describe('the active leg after loading an approach with a missed approach to its FAF (characterization, #41, 42099f3)', () => {
    /**
     * VOR 36 of KDST: the VOR VVV is the FAF 5 NM south of the MAP and the missed approach holding point, IFAAA is the IF
     * 10 NM south. The aircraft is 7 NM south of the MAP and 1 NM east, abeam the leg IFAAA - VVV and 2 NM before the FAF.
     */
    async function loadVorApproachAbeamFinal() {
        const kdst = airport('KDST', 47.0, 8.0);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const vvvPos = pointFrom(mapaa, 180, 5);
        const vvv = vor('VVV', vvvPos.lat, vvvPos.lon);
        const ifPos = pointFrom(mapaa, 180, 10);
        const ifaaa = intersection('IFAAA', ifPos.lat, ifPos.lon);
        const enrPos = pointFrom(ifaaa, 240, 30);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const apt = withProcedures(kdst, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_VOR, runway: '36',
                transitions: [{name: 'IFAAA', legs: [Leg.IF(ifaaa, FixTypeFlags.IAF)]}],
                final: [Leg.IF(ifaaa), Leg.TF(vvv, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
                missed: [Leg.DF(vvv), Leg.HM(vvv, 0, LegTurnDirection.Right, FixTypeFlags.MAHP)],
            })],
        });
        const position = pointFrom(pointFrom(mapaa, 180, 7), 90, 1);
        const unit = await bootUnit({
            facilities: [apt, vvv, ifaaa, enraa, mapaa], position, storage: savedFlightplan(0, [enraa, apt]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    it('activates the leg to the FAF, not the missed approach leg back to the VOR (#41)', async () => {
        const unit = await loadVorApproachAbeamFinal();
        const idents = unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);
        const aw = unit.props.memory.navPage.activeWaypoint;

        expect(idents).toEqual(['ENRAA', 'IFAAA', 'VVV', 'MAPAA', 'VVV', 'KDST']); // Precondition
        expect(unit.errors).toEqual([]);
        // The leg IFAAA - VVV passes 1.0 NM from the aircraft. The extension of the missed approach leg MAPAA - VVV,
        // which is also 1 NM away, lies beyond VVV: its closest point is not between its two waypoints.
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('VVV');
    });
});
