import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {
    FixTypeFlags,
    FlightPlan,
    FlightPlanner,
    FlightPlannerOptions,
    LegTurnDirection,
} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {insertLeg} from '../../harness/flightplan';
import {pointBefore, pointFrom} from '../../harness/flight/geo';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {savedFlightplan} from '../../harness/storage';
import {APR_ARM_SWITCH, NO_GPS_SIMVARS, panelXml} from '../../harness/panelXml';
import {activeIdent, fplIdents} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {KLNLegType} from '../../../kln90b/data/flightplan/Flightplan';
import {insertLegIntoFpl} from '../../../kln90b/services/FlightplanUtils';

// Public contract: the SDK FlightPlanner with the id "kln90b" mirrors FPL 0 (CLAUDE.md, "Public contract with aircraft";
// the wiki page Accessing the Flight Plan; WTFlightplanSync). Plan 0 holds the legs of FPL 0, and a direct-to that leaves
// the plan goes to plan 1, which becomes the active plan. As the real unit does, nothing is sent behind a fence: the
// missed approach is not available before the MAP, and with an arc the unit sends only the legs from the arc on, or up
// to the arc's entry while it is ahead (the wiki page, which cites the installation manual).

/** The instrument's planner. The options only matter when the planner does not exist yet, and WTFlightplanSync made it */
const plannerOf = (unit: HeadlessUnit): FlightPlanner => FlightPlanner.getPlanner('kln90b', unit.core.bus, {} as FlightPlannerOptions);
const identsOf = (plan: FlightPlan): string[] => [...plan.legs()].map(l => l.leg.fixIcaoStruct.ident);

const NO_GPS_SIMVARS_XML = panelXml(NO_GPS_SIMVARS);

describe('the "kln90b" flight planner on the standard route', () => {
    const {kaaa, abc} = standardRoute();
    const xray = intersection('XRAY', 47.2, 8.7);
    const position = pointBefore(kaaa, abc, 20);

    // The standard route and the extra fix XRAY; the magnetic variation 4 E is on purpose
    const bootOnRoute = (xml?: string) => bootOnStandardRoute({facilities: [xray], position, magvar: 4, panelXml: xml});

    it('mirrors FPL 0 with the coordinates of its waypoints and the active leg', async () => {
        const unit = await bootOnRoute();
        const planner = plannerOf(unit);
        const plan = planner.getFlightPlan(0);

        expect(unit.errors).toEqual([]);
        expect(planner.activePlanIndex).toBe(0);
        expect(planner.hasFlightPlan(1)).toBe(false);
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect([...plan.legs()].map(l => [l.leg.lat, l.leg.lon])).toEqual([[47, 8], [47.5, 8.9], [48.2, 9.2]]);
        expect(plan.activeLateralLeg).toBe(1); // ABC is the active waypoint
        expect(plan.directToData).toEqual({segmentIndex: -1, segmentLegIndex: -1});
    });

    it('follows an edit of FPL 0', async () => {
        const unit = await bootOnRoute();
        const plan = plannerOf(unit).getFlightPlan(0);
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'KBBB']); // Precondition

        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
    });

    // 4-10: a Direct To to a waypoint that is not in the plan is flown on its own. The planner puts it on plan 1 like the
    // Garmins do (WTFlightplanSync), an IF at the present position and the target, and makes plan 1 the active plan.
    it('puts a direct-to off the plan on plan 1 and keeps plan 0', async () => {
        const unit = await bootOnRoute();
        const planner = plannerOf(unit);
        expect(planner.activePlanIndex).toBe(0); // Precondition

        await unit.panel.press('KLN90B_DCT_Push');
        await unit.panel.enterIdent('L', 'XRAY');
        await unit.panel.ent(); // INT confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true);
        expect(planner.activePlanIndex).toBe(1);
        const dto = planner.getFlightPlan(1);
        expect(identsOf(dto)).toEqual(['', 'XRAY']);
        const legs = [...dto.legs()];
        expect(legs[0].leg.lat).toBeCloseTo(position.lat, 4);
        expect(legs[0].leg.lon).toBeCloseTo(position.lon, 4);
        expect(legs[1].leg.lat).toBeCloseTo(47.2, 6);
        expect(legs[1].leg.lon).toBeCloseTo(8.7, 6);
        expect(dto.activeLateralLeg).toBe(1);
        expect(identsOf(planner.getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    // A direct-to to a waypoint of FPL 0 resumes the plan behind it (4-10); an edit in front of the target moves the
    // target, and plan 0 marks it at its new index (#149)
    it('keeps the active leg of plan 0 on a direct-to target when a leg is inserted in front of it', async () => {
        const unit = await bootOnRoute();
        const planner = plannerOf(unit);
        await unit.panel.press('KLN90B_DCT_Push');
        await unit.panel.enterIdent('L', 'ABC');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        expect(planner.activePlanIndex).toBe(1); // Precondition: the direct-to is on plan 1
        expect(planner.getFlightPlan(0).activeLateralLeg).toBe(1); // Precondition: ABC

        insertLeg(unit, 1, xray);
        await vi.advanceTimersByTimeAsync(1000);

        expect(identsOf(planner.getFlightPlan(0))).toEqual(['KAAA', 'XRAY', 'ABC', 'KBBB']);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(2);
        expect(planner.getFlightPlan(0).activeLateralLeg).toBe(2);
        expect(planner.activePlanIndex).toBe(1);
        expect(unit.errors).toEqual([]);
    });

    // The wiki page Accessing the Flight Plan: plan 0 always matches FPL 0, the direct-to plan is only there while a
    // direct-to is flown. When the direct-to ends the planner returns to plan 0 and plan 1 is gone.
    it('returns to plan 0 and drops plan 1 when the direct-to ends', async () => {
        const unit = await bootOnRoute();
        const planner = plannerOf(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;

        // A direct-to to ABC, a waypoint of FPL 0: reaching it resumes the plan (4-10)
        await unit.panel.press('KLN90B_DCT_Push');
        await unit.panel.enterIdent('L', 'ABC');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        expect(planner.activePlanIndex).toBe(1); // Precondition: the direct-to is on plan 1
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveFplIdx()).toBe(1);

        aw.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.isDctNavigation()).toBe(false);
        expect(planner.activePlanIndex).toBe(0);
        expect(planner.hasFlightPlan(1)).toBe(false);
        expect(identsOf(planner.getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    // The planner mirrors FPL 0 only: an edit of another flight plan must not overwrite plan 0
    it('does not overwrite plan 0 with an edit of FPL 1', async () => {
        const unit = await bootOnRoute();
        const plan = plannerOf(unit).getFlightPlan(0);
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'KBBB']); // Precondition

        const fpl1 = unit.props.memory.fplPage.flightplans[1];
        insertLegIntoFpl(fpl1, unit.props.memory.navPage, 0, {wpt: xray, type: KLNLegType.USER});
        await vi.advanceTimersByTimeAsync(1000);

        expect(fplIdents(unit, 1)).toEqual(['XRAY']); // The edit happened
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    // Not part of the contract's wording, but the reason the pins below can say "none": with the option off the unit does
    // not mirror an edit
    it('does not mirror an edit of FPL 0 with Output.WriteGPSSimVars off', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        const plan = plannerOf(unit).getFlightPlan(0);
        const before = identsOf(plan);

        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
        expect(identsOf(plan)).toEqual(before);
    });

    // The planner stays untouched with WriteGPSSimVars off, on the edit path and on the active-waypoint path of
    // WTFlightplanSync (#142). The wiki lists the planner with the options that WriteGPSSimVars gates; the maintainer ruled
    // "Gate both". The first test holds the setup: the boot, the route and a working sequence.
    it('the unit with Output.WriteGPSSimVars off has the route and sequences (setup of the #142 tests)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        const aw = unit.props.memory.navPage.activeWaypoint;

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(activeIdent(unit)).toBe('ABC');
        expect(plannerOf(unit).hasFlightPlan(0)).toBe(true);

        aw.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(activeIdent(unit)).toBe('KBBB');
    });

    it('leaves plan 0 empty with Output.WriteGPSSimVars off, after the boot (#142)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual([]);
    });

    it('leaves plan 0 empty with Output.WriteGPSSimVars off, after a sequence (#142)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        unit.props.memory.navPage.activeWaypoint.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual([]);
    });

    // The direct-to plan goes through the same sync
    it('creates no direct-to plan with Output.WriteGPSSimVars off', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        const planner = plannerOf(unit);

        await unit.panel.press('KLN90B_DCT_Push');
        await unit.panel.enterIdent('L', 'XRAY');
        await unit.panel.ent(); // INT confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true); // The unit flies it
        expect(planner.hasFlightPlan(1)).toBe(false);
        expect(planner.activePlanIndex).toBe(0);
        expect(identsOf(planner.getFlightPlan(0))).toEqual([]);
    });

    // L:KLN90B_WriteGpsSimvars switches the option at runtime (LVars.ts): the sync stops with it and starts again at once
    it('stops mirroring the active leg when L:KLN90B_WriteGpsSimvars goes to 0, and goes on when it returns to 1', async () => {
        const unit = await bootOnRoute();
        const aw = unit.props.memory.navPage.activeWaypoint;
        const plan = plannerOf(unit).getFlightPlan(0);
        expect(plan.activeLateralLeg).toBe(1); // Precondition: ABC, mirrored

        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        aw.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);
        expect(activeIdent(unit)).toBe('KBBB');
        expect(plan.activeLateralLeg).toBe(1); // Not rewritten

        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        expect(plan.activeLateralLeg).toBe(2); // KBBB, mirrored at the switch, without another change
        insertLeg(unit, 3, xray); // Behind the active KBBB
        await vi.advanceTimersByTimeAsync(1000);
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'KBBB', 'XRAY']);
        expect(plan.activeLateralLeg).toBe(2); // KBBB, mirrored again
    });

    // The planner is filled at the switch, not at the next change (the unit booted with the option off, so nothing wrote
    // it before)
    it('mirrors FPL 0 at once when L:KLN90B_WriteGpsSimvars goes from 0 to 1', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        const planner = plannerOf(unit);
        expect(identsOf(planner.getFlightPlan(0))).toEqual([]); // Precondition: nothing mirrored with the option off

        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        const plan = planner.getFlightPlan(0);
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(plan.activeLateralLeg).toBe(1); // ABC is the active waypoint
        expect(planner.hasFlightPlan(1)).toBe(false);
    });

    it('mirrors a direct-to on plan 1 as well when L:KLN90B_WriteGpsSimvars goes from 0 to 1', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        const planner = plannerOf(unit);
        await unit.panel.press('KLN90B_DCT_Push');
        await unit.panel.enterIdent('L', 'XRAY');
        await unit.panel.ent(); // INT confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true); // Precondition
        expect(planner.hasFlightPlan(1)).toBe(false);

        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(planner.activePlanIndex).toBe(1);
        expect(identsOf(planner.getFlightPlan(1))).toEqual(['', 'XRAY']);
        expect(identsOf(planner.getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    // Only the edge to 1 syncs: switching off, or a level of 1, writes nothing
    it('does not rewrite the planner while the LVar stays at 1, nor when it goes to 0', async () => {
        const unit = await bootOnRoute();
        const planner = plannerOf(unit);
        const plan = planner.getFlightPlan(0);
        const spy = vi.spyOn(planner, 'getFlightPlan');

        await vi.advanceTimersByTimeAsync(2000); // The level stays at 1
        expect(spy).not.toHaveBeenCalled();

        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(spy).not.toHaveBeenCalled();
        expect(identsOf(plan)).toEqual(['KAAA', 'ABC', 'KBBB']);
    });
});

// The Hot Swapping wiki page and the doc comment of Hardware.isDisabled: a unit disabled for hot swapping writes no
// outputs, the "kln90b" planner included, whatever asks for the sync (#398). The planner was not written meanwhile, so
// the resume mirrors FPL 0 once, when Output.WriteGPSSimVars is on
describe('the "kln90b" flight planner while the unit is disabled for hot swapping (public contract)', () => {
    const {kaaa, abc} = standardRoute();
    const xray = intersection('XRAY', 47.2, 8.7);
    const bootOnRoute = (xml?: string) => bootOnStandardRoute({facilities: [xray], position: pointBefore(kaaa, abc, 20), panelXml: xml});

    async function setDisabled(unit: HeadlessUnit, disabled: boolean): Promise<void> {
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', disabled);
        await vi.advanceTimersByTimeAsync(300);
    }

    // The sibling is 'mirrors FPL 0 at once when L:KLN90B_WriteGpsSimvars goes from 0 to 1' above
    it('writes nothing when L:KLN90B_WriteGpsSimvars goes from 0 to 1 while disabled (#398)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        await setDisabled(unit, true);

        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual([]);
    });

    // The sibling is 'follows an edit of FPL 0' above
    it('does not mirror a change of FPL 0 while disabled (#398)', async () => {
        const unit = await bootOnRoute();
        await setDisabled(unit, true);

        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);

        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    // The maintainer's ruling: the gates read Hardware.isDisabled, never the LVar. The planner gate runs on an edit of
    // FPL 0 and on the option going on: one second of polls, ten of them, and no read of its own
    it('reads L:KLN90B_Disabled only in the poll, also when FPL 0 changes and the option toggles (#398)', async () => {
        const unit = await bootOnRoute();
        await setDisabled(unit, true);
        const read = vi.spyOn(SimVar, 'GetSimVarValue');
        onTestFinished(() => read.mockRestore()); // A second spyOn on the method would return this one with its calls

        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(500);
        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(200);
        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(read.mock.calls.filter(c => c[0] === 'L:KLN90B_Disabled').length).toBe(10);
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']); // Precondition: nothing was written
    });

    // sequenceToNextWaypoint publishes activeWaypointChanged without flightplanChanged, so this is the third entry into the
    // sync. The sibling is 'stops mirroring the active leg when L:KLN90B_WriteGpsSimvars goes to 0' above
    it('does not mirror a change of the active waypoint while disabled, and mirrors it on the resume (#398)', async () => {
        const unit = await bootOnRoute();
        const plan = plannerOf(unit).getFlightPlan(0);
        expect(plan.activeLateralLeg).toBe(1); // Precondition: ABC, mirrored
        await setDisabled(unit, true);

        unit.props.memory.navPage.activeWaypoint.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);
        expect(activeIdent(unit)).toBe('KBBB'); // Precondition: the unit has sequenced
        expect(plan.activeLateralLeg).toBe(1); // Not rewritten

        await setDisabled(unit, false);

        expect(plan.activeLateralLeg).toBe(2); // KBBB, mirrored on the resume
    });

    it('mirrors FPL 0 once on the resume (#398)', async () => {
        const unit = await bootOnRoute();
        await setDisabled(unit, true);
        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);
        const planner = plannerOf(unit);
        const writes = vi.spyOn(planner, 'getFlightPlan'); // WTFlightplanSync.writeFpl0 gets plan 0 once per write

        await setDisabled(unit, false);

        expect(writes).toHaveBeenCalledTimes(1);
        expect(identsOf(planner.getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
    });

    it('mirrors FPL 0 on the resume after the option went on while disabled (#398)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        await setDisabled(unit, true);
        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        await setDisabled(unit, false);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });

    // With Output.WriteGPSSimVars off the unit does not write the planner (#142), and the resume does not either
    it('writes nothing on the resume when L:KLN90B_WriteGpsSimvars went to 0 while disabled (#398)', async () => {
        const unit = await bootOnRoute();
        await setDisabled(unit, true);
        unit.env.sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        insertLeg(unit, 2, xray);
        await vi.advanceTimersByTimeAsync(1000);

        await setDisabled(unit, false);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['KAAA', 'ABC', 'KBBB']);
    });
});

describe('the "kln90b" flight planner behind a fence', () => {
    // The VOR 36 of KDST as in ActiveWaypoint.test.ts (#41): the VOR VVV is the FAF 5 NM south of the MAP and the missed
    // approach holding point, so the missed approach is VVV again
    async function loadVorApproach() {
        const kdst = airport('KDST', 47.0, 8.0);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const vvvPos = pointFrom(mapaa, 180, 5);
        const vvv = vor('VVV', vvvPos.lat, vvvPos.lon);
        const ifPos = pointFrom(vvv, 210, 10);
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
        const unit = await bootUnit({
            facilities: [apt, vvv, ifaaa, enraa, mapaa], position: pointFrom(vvv, 200, 3), storage: savedFlightplan(0, [enraa, apt]),
            panelXml: panelXml(APR_ARM_SWITCH),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    // The wiki page (Accessing the Flight Plan): the missed approach is not available before the MAP
    it('sends the missed approach only after the MAP', async () => {
        const unit = await loadVorApproach();
        const aw = unit.props.memory.navPage.activeWaypoint;
        const plan = plannerOf(unit).getFlightPlan(0);

        // The KLN itself holds the whole procedure, the planner stops at the MAP
        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['ENRAA', 'IFAAA', 'VVV', 'MAPAA', 'VVV', 'KDST']);
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(identsOf(plan)).toEqual(['ENRAA', 'IFAAA', 'VVV', 'MAPAA']);
        expect(plan.activeLateralLeg).toBe(2);

        // With the MAP itself active the missed approach is still not available: the fence holds up to and including the MAP
        aw.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.getActiveFplIdx()).toBe(3);
        expect(identsOf(plan)).toEqual(['ENRAA', 'IFAAA', 'VVV', 'MAPAA']);
        expect(plan.activeLateralLeg).toBe(3);

        // Sequenced past the MAP, the missed approach is sent: the active leg is the missed approach VVV
        aw.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.getActiveFplIdx()).toBe(4);
        expect(identsOf(plan)).toEqual(['ENRAA', 'IFAAA', 'VVV', 'MAPAA', 'VVV', 'KDST']);
        expect(plan.activeLateralLeg).toBe(4);
    });

    // The arc world of SensorsOutSimVars.test.ts: a left arc around ABC from the 270 to the 180 radial, then FAFAA and the
    // MAP. All positions are true, and the variation is 0.
    const arcAbc = vor('ABC', 47.3, 8.3);
    const at = (bearing: number, nm: number) => pointFrom({lat: arcAbc.lat, lon: arcAbc.lon}, bearing, nm);
    const arcbg = intersection('ARCBG', at(270, 10).lat, at(270, 10).lon);
    const arcen = intersection('ARCEN', at(180, 10).lat, at(180, 10).lon);
    const fafaa = intersection('FAFAA', 47.1, 7.9);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const enrwp = intersection('ENRWP', at(270, 30).lat, at(270, 30).lon);
    const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
        approaches: [approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG', legs: [
                    Leg.IF(arcbg, FixTypeFlags.IAF),
                    Leg.AF(arcen, arcAbc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left}),
                    Leg.TF(fafaa, FixTypeFlags.FAF),
                ],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        })],
    });

    async function loadArcApproach(positionOf: { lat: number; lon: number }, fpl0: (typeof kprc | typeof enrwp)[]) {
        const unit = await bootUnit({
            facilities: [kprc, arcAbc, arcbg, arcen, fafaa, mapaa, enrwp], position: positionOf, storage: savedFlightplan(0, fpl0),
            magvar: 0,
            panelXml: panelXml(APR_ARM_SWITCH),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    // The wiki page: waypoints after an arc are not available while the arc is ahead
    it('sends only the legs up to the arc entry while the arc is ahead', async () => {
        const unit = await loadArcApproach(at(270, 25), [enrwp, kprc]);
        const aw = unit.props.memory.navPage.activeWaypoint;
        const plan = plannerOf(unit).getFlightPlan(0);

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['ENRWP', 'D270J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(identsOf(plan)).toEqual(['ENRWP', 'D270J']);
        expect(plan.activeLateralLeg).toBe(1);
    });

    // The wiki page: waypoints before an arc are not available once the aircraft is on it. The entry is dropped, so the
    // planner's active index runs one behind the KLN's, and it follows the sequence.
    it('sends the legs from the arc on, with the active index counted from the arc', async () => {
        const unit = await loadArcApproach(at(225, 10), [kprc]);
        const aw = unit.props.memory.navPage.activeWaypoint;
        const plan = plannerOf(unit).getFlightPlan(0);

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['D225J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(identsOf(plan)).toEqual(['ARCEN', 'FAFAA', 'MAPAA']);
        expect(plan.activeLateralLeg).toBe(0);

        aw.sequenceToNextWaypoint(); // FAFAA
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(identsOf(plan)).toEqual(['ARCEN', 'FAFAA', 'MAPAA']);
        expect(plan.activeLateralLeg).toBe(1);
    });

    // The same, with an enroute fix before the arc: every leg before the arc entry is dropped, so the active index shrinks by
    // that many. With a single leg before the entry, dropping one and dropping all cannot be told apart.
    it('drops every leg before the arc entry from the active index', async () => {
        const unit = await loadArcApproach(at(225, 10), [enrwp, kprc]);
        const aw = unit.props.memory.navPage.activeWaypoint;
        const plan = plannerOf(unit).getFlightPlan(0);

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['ENRWP', 'D225J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
        expect(aw.getActiveFplIdx()).toBe(1); // The aircraft sits on the entry D225J, so the leg to the entry is the active one
        aw.sequenceToNextWaypoint(); // ARCEN: the aircraft is on the arc
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(identsOf(plan)).toEqual(['ARCEN', 'FAFAA', 'MAPAA']);
        expect(plan.activeLateralLeg).toBe(0);
    });
});

// #347: a procedure removed from FPL 0 is removed from the planner mirror too. Public contract (CLAUDE.md, "Public
// contract with aircraft"; the wiki page Accessing the Flight Plan): plan 0 always matches FPL 0.
describe('the "kln90b" flight planner after a procedure leaves FPL 0', () => {
    /**
     * FPL 0 of ENRBB, ENRAA and KPRC with the APT 8 approach loaded; the approach legs precede the airport. `power`
     * powers the unit through Input.ElectricitySimVar CIRCUIT ON:1, on at the boot
     */
    async function bootWithApproach(power?: 'circuit'): Promise<HeadlessUnit> {
        const iafaa = intersection('IAFAA', 47.3, 7.7);
        const ifaaa = intersection('IFAAA', 47.2, 7.8);
        const fafaa = intersection('FAFAA', 47.1, 7.9);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const mahaa = intersection('MAHAA', 47.0, 8.3);
        const enraa = intersection('ENRAA', 47.6, 7.4);
        const enrbb = intersection('ENRBB', 48.2, 6.8);
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa, FixTypeFlags.IF)]}],
                final: [Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
                missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90, LegTurnDirection.Right, FixTypeFlags.MAHP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [kprc, iafaa, ifaaa, fafaa, mapaa, mahaa, enraa, enrbb], position: {lat: 47.9, lon: 7.1},
            storage: savedFlightplan(0, [enrbb, enraa, kprc]),
            panelXml: panelXml(power === 'circuit' ? {...APR_ARM_SWITCH, 'Input.ElectricitySimVar': 'CIRCUIT ON:1'} : APR_ARM_SWITCH),
            simVars: power === 'circuit' ? [{name: 'CIRCUIT ON:1', unit: 'bool', value: 1}] : [],
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition: the approach is loaded
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toContain('FAFAA'); // Precondition: the planner has it
        return unit;
    }

    // The approach's legs as the planner mirrors them: the transition and the final, and no leg after the MAP (the fence)
    const MIRRORED_APPROACH = ['ENRBB', 'ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'MAPAA'];

    it('drops the approach from plan 0 after DELETE APR (#347)', async () => {
        const unit = await bootWithApproach();

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'CHANGE APR?');
        await unit.panel.clr();
        expect(Screen.read().text()).toContain('DELETE APR?'); // The question of the delete, before ENT answers it
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(3000);

        expect(fplIdents(unit)).toEqual(['ENRBB', 'ENRAA', 'KPRC']);
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['ENRBB', 'ENRAA', 'KPRC']);
    });

    // 6-5, 6-23: FPL 0 loses its procedures when the unit was off for more than 5 minutes. The planner mirror follows at
    // the power-on, which is the public contract (CLAUDE.md, "Public contract with aircraft"), so only the FPL 0 part cites
    // the manual
    it('drops the approach from plan 0 at the power-on after more than 5 minutes off (#347)', async () => {
        const unit = await bootWithApproach();

        await unit.panel.powerCycle({offSeconds: 360});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(fplIdents(unit)).toEqual(['ENRBB', 'ENRAA', 'KPRC']);
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['ENRBB', 'ENRAA', 'KPRC']);
    });

    // The sibling: a power cycle under 5 minutes keeps the procedures in FPL 0 (6-5, 6-23), so the mirror keeps them too
    it('keeps the approach in plan 0 over a power cycle of 1 minute (#347)', async () => {
        const unit = await bootWithApproach();
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(MIRRORED_APPROACH); // Precondition: the approach is mirrored

        await unit.panel.powerCycle({offSeconds: 60});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(MIRRORED_APPROACH);
    });

    // #398: a unit disabled for hot swapping writes no outputs. Its power follows the circuit (it ignores the power H
    // events, #138), and the power-on after more than 5 minutes off removes the approach from FPL 0 (6-5, 6-23) while it
    // is disabled. The planner keeps the approach until the resume mirrors FPL 0
    it('mirrors the removal of the approach at the power-on only when the unit is put back (#398)', async () => {
        const unit = await bootWithApproach('circuit');
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(360_000);
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(fplIdents(unit)).toEqual(['ENRBB', 'ENRAA', 'KPRC']); // FPL 0 has lost the approach
        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(MIRRORED_APPROACH);

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual(['ENRBB', 'ENRAA', 'KPRC']);
    });
});
