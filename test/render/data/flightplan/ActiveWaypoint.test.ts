import {describe, expect, it, vi} from 'vitest';
import {FlightPlanner, FlightPlannerOptions, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {courseDeg, finalCourseDeg, norm360} from '../../../harness/flight/geo';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const kaaa = airport('KAAA', 47.0, 8.0);
const abc = vor('ABC', 47.2, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

/** The GPS is valid within about 12 s of boot; until then FPL 0 does not activate */
async function waitForGps(unit: HeadlessUnit): Promise<void> {
    for (let i = 0; i < 120 && !unit.props.sensors.in.gps.isValid(); i++) await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
}

describe('ActiveWaypoint on FPL 0', () => {
    it('flags navigation and drops the FROM waypoint when deleting leaves fewer than two legs (0031c11, d8edd70)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.2, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await waitForGps(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: KBBB is active, KAAA is FROM
        expect(aw.getFromWpt()).not.toBeNull();

        await unit.panel.outer('L', -1); // FPL 0
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
        expect(Screen.read().half('L').split('\n')[1]).toBe('  1:KAAA   ');
    });

    // 3-28: a typed Direct To target that is in FPL 0 takes its place in the plan (4-10)
    it('directTo reads the target leg, not the previous active index (43d472b)', async () => {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await waitForGps(unit);
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
        // ENT errors never reach unit.errors, so also check what the pilot sees: back on NAV 2 and NAV 1, flying to KBBB
        const screen = Screen.read();
        expect(screen.leftName()).toBe('NAV 2');
        expect(screen.rightName()).toBe('NAV 1');
        expect(screen.half('R').split('\n')[0]).toBe('d    ›KBBB ');
    });

    it('keeps a deleted direct-to target as a random direct-to (#67)', async () => {
        // 4-10 to 4-11: a Direct To waypoint is flown on its own, the plan only resumes after it
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await waitForGps(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;

        await unit.panel.outer('L', -1); // FPL 0
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
        // ENT errors never reach unit.errors, so also check the screen: the leg is gone from FPL 0, NAV 1 still flies to KBBB
        const screen = Screen.read();
        expect(screen.half('L').split('\n').slice(1, 4)).toEqual(['  1:KAAA   ', '  2:ABC    ', '  3:       ']);
        expect(screen.half('R').split('\n')[0]).toBe('d    ›KBBB ');
    });
});

describe('OBS mode on a flight plan with the same waypoint twice (3415417, #67)', () => {
    // The default ObsSource 1 would take the course from Nav OBS:1 and never reach the fallback line of the fix
    const OBS_SOURCE_OFF = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>';

    async function enterObsOnDuplicatedPlan() {
        // Five NM west of KAAA, so the bearing to KAAA is about 090
        const position = new GeoPoint(kaaa.lat, kaaa.lon).offset(270, UnitType.NMILE.convertTo(5, UnitType.GA_RADIAN));
        const unit = await bootUnit({
            facilities: [kaaa], position: {lat: position.lat, lon: position.lon}, panelXml: OBS_SOURCE_OFF,
            storage: savedFlightplan(0, [kaaa, kaaa]),
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'MOD 2');
        await unit.panel.ent();
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
        // Under the break the deviation is the 5 NM to the waypoint
        expect(Number.isFinite(nav.xtkToActive)).toBe(true);
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05);
        // Under the break the OBS course on the left half is blank (OBS:°)
        expect(Screen.read().half('L').split('\n')[3]).toMatch(/^OBS:\d{3}°/);
        expect(unit.errors).toEqual([]);
    });

    // characterization: 5-36 does not say which course OBS takes when the plan has no desired track; the unit takes the
    // bearing to the waypoint, which leaves the deviation at zero
    it('takes the bearing to the waypoint as the OBS course (characterization, #67)', async () => {
        const {unit, position} = await enterObsOnDuplicatedPlan();

        expect(Math.abs(unit.props.memory.navPage.obsMag - courseDeg(position, kaaa))).toBeLessThan(0.5);
        expect(Screen.read().half('L').split('\n')[3]).toBe('OBS:090°   ');
    });
});

describe('sequencing after a direct-to to a waypoint of FPL 0 (748151c, #70)', () => {
    // The standard world of the flight tests; the final course KAAA - ABC is about 51.0 degrees
    const stdKaaa = airport('KAAA', 47.0, 8.0);
    const stdAbc = vor('ABC', 47.5, 8.9);
    const stdKbbb = airport('KBBB', 48.2, 9.2);

    async function directToAbc() {
        const course = finalCourseDeg(stdKaaa, stdAbc);
        const position = new GeoPoint(stdAbc.lat, stdAbc.lon).offset(norm360(course + 180), UnitType.NMILE.convertTo(5, UnitType.GA_RADIAN));
        const unit = await bootUnit({
            facilities: [stdKaaa, stdAbc, stdKbbb], position: {lat: position.lat, lon: position.lon},
            storage: savedFlightplan(0, [stdKaaa, stdAbc, stdKbbb]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        await unit.panel.outer('R', 1); // CTR 1, so DCT pre-fills the active waypoint (3-27) instead of opening blank
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
    });
});
