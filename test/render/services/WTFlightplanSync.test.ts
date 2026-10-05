import {describe, expect, it, vi} from 'vitest';
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
/** The idents of the KLN's own FPL 0 */
const klnIdents = (unit: HeadlessUnit): string[] => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);

const NO_GPS_SIMVARS_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><WriteGPSSimVars>false</WriteGPSSimVars></Output></Instrument></PlaneHTMLConfig>';

describe('the "kln90b" flight planner on the standard route', () => {
    const {kaaa, abc, kbbb} = standardRoute();
    const xray = intersection('XRAY', 47.2, 8.7);
    const position = pointBefore(kaaa, abc, 20);

    async function bootOnRoute(panelXml?: string) {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb, xray], storage: savedFlightplan(0, [kaaa, abc, kbbb]), position, magvar: 4, panelXml,
        });
        await settle(unit);
        return unit;
    }

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

        expect(klnIdents(unit)).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
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

        expect(fpl1.getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['XRAY']); // The edit happened
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

        expect(klnIdents(unit)).toEqual(['KAAA', 'ABC', 'XRAY', 'KBBB']);
        expect(identsOf(plan)).toEqual(before);
    });

    // The planner is filled with WriteGPSSimVars off: the active-waypoint path of WTFlightplanSync is not gated (#NEW-5-1,
    // #NEW-5-2). The wiki lists the planner with the options that WriteGPSSimVars gates; the maintainer ruled "Gate both".
    // The sibling holds the setup: the boot, the route and a working sequence.
    it('the unit with Output.WriteGPSSimVars off has the route and sequences (setup of #NEW-5-1 and #NEW-5-2)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        const aw = unit.props.memory.navPage.activeWaypoint;

        expect(unit.errors).toEqual([]);
        expect(klnIdents(unit)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(plannerOf(unit).hasFlightPlan(0)).toBe(true);

        aw.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('KBBB');
    });

    it.fails('leaves plan 0 empty with Output.WriteGPSSimVars off, after the boot (#NEW-5-1)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual([]);
    });

    it.fails('leaves plan 0 empty with Output.WriteGPSSimVars off, after a sequence (#NEW-5-2)', async () => {
        const unit = await bootOnRoute(NO_GPS_SIMVARS_XML);
        unit.props.memory.navPage.activeWaypoint.sequenceToNextWaypoint();
        await vi.advanceTimersByTimeAsync(1000);

        expect(identsOf(plannerOf(unit).getFlightPlan(0))).toEqual([]);
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
        expect(klnIdents(unit)).toEqual(['ENRAA', 'IFAAA', 'VVV', 'MAPAA', 'VVV', 'KDST']);
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
        expect(klnIdents(unit)).toEqual(['ENRWP', 'D270J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
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
        expect(klnIdents(unit)).toEqual(['D225J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
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
        expect(klnIdents(unit)).toEqual(['ENRWP', 'D225J', 'ARCEN', 'FAFAA', 'MAPAA', 'KPRC']);
        expect(aw.getActiveFplIdx()).toBe(1); // The aircraft sits on the entry D225J, so the leg to the entry is the active one
        aw.sequenceToNextWaypoint(); // ARCEN: the aircraft is on the arc
        await vi.advanceTimersByTimeAsync(1000);

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(identsOf(plan)).toEqual(['ARCEN', 'FAFAA', 'MAPAA']);
        expect(plan.activeLateralLeg).toBe(0);
    });
});
