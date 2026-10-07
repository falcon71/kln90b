import {
    AirportFacility, ApproachProcedure, Facility, FlightPlan, FlightPlanLeg,
    IcaoValue, LegTurnDirection, LegType, Procedure, RnavTypeFlags, RunwayFacility, RunwayUtils,
    UnitType, VorFacility,
} from '@microsoft/msfs-sdk';

/** A fix by facility or ICAO. Every fix must also be in the navdata: SidStar loads each one with getFacility. */
export type Fix = Facility | IcaoValue;
const icaoOf = (f: Fix): IcaoValue => 'icaoStruct' in f ? f.icaoStruct : f;

/**
 * Procedure legs as the sim's navdata delivers them: FlightPlan.createLeg fills every field the SDK declares
 * (msfssdk.d.ts, FlightPlanLeg) with a default. SidStar writes into legs (fixTypeFlags, course), so every call returns a
 * new, unfrozen object; never share a leg between procedures.
 */
export const Leg = {
    IF: (fix: Fix, flags = 0) => FlightPlan.createLeg({type: LegType.IF, fixIcaoStruct: icaoOf(fix), fixTypeFlags: flags}),
    TF: (fix: Fix, flags = 0, flyOver = false) => FlightPlan.createLeg({type: LegType.TF, fixIcaoStruct: icaoOf(fix), fixTypeFlags: flags, flyOver}),
    CF: (fix: Fix, courseMag: number, flags = 0) => FlightPlan.createLeg({type: LegType.CF, fixIcaoStruct: icaoOf(fix), course: courseMag, fixTypeFlags: flags}),
    DF: (fix: Fix, flags = 0) => FlightPlan.createLeg({type: LegType.DF, fixIcaoStruct: icaoOf(fix), fixTypeFlags: flags}),
    /** No fix: SidStar drops it */
    CA: (courseMag: number) => FlightPlan.createLeg({type: LegType.CA, course: courseMag}),
    /** No fix: SidStar drops it */
    VM: (courseMag: number) => FlightPlan.createLeg({type: LegType.VM, course: courseMag}),
    HM: (fix: Fix, inboundMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.HM, fixIcaoStruct: icaoOf(fix), course: inboundMag, turnDirection: turn, fixTypeFlags: flags}),
    HF: (fix: Fix, inboundMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.HF, fixIcaoStruct: icaoOf(fix), course: inboundMag, turnDirection: turn, fixTypeFlags: flags}),
    HA: (fix: Fix, inboundMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.HA, fixIcaoStruct: icaoOf(fix), course: inboundMag, turnDirection: turn, fixTypeFlags: flags}),
    /** A procedure turn; courseMag is the outbound course of the turn */
    PI: (fix: Fix, courseMag: number, turn = LegTurnDirection.Right, flags = 0) =>
        FlightPlan.createLeg({type: LegType.PI, fixIcaoStruct: icaoOf(fix), course: courseMag, turnDirection: turn, fixTypeFlags: flags}),
    /**
     * DME arc to endFix around navaid. SidStar uses fromRadial (course) and toRadial (theta) as true bearings, and the arc
     * must not be the first leg that survives filtering (the conversion replaces the leg before it with the entry).
     */
    AF: (endFix: Fix, navaid: VorFacility, o: { radiusNm: number; fromRadial: number; toRadial: number; turn: LegTurnDirection; flags?: number }) =>
        FlightPlan.createLeg({
            type: LegType.AF, fixIcaoStruct: icaoOf(endFix), originIcaoStruct: navaid.icaoStruct,
            rho: UnitType.NMILE.convertTo(o.radiusNm, UnitType.METER), course: o.fromRadial, theta: o.toRadial,
            turnDirection: o.turn, fixTypeFlags: o.flags ?? 0,
        }),
    /** Only for testing that RF procedures are rejected */
    RF: (fix: Fix) => FlightPlan.createLeg({type: LegType.RF, fixIcaoStruct: icaoOf(fix)}),
};

export interface Transition {
    name: string;
    legs: FlightPlanLeg[];
}

function parseRunway(runway: string): { runwayNumber: number; designator: RunwayDesignator } {
    if (runway === '') return {runwayNumber: 0, designator: RunwayDesignator.RUNWAY_DESIGNATOR_NONE};
    const letter = runway.slice(2);
    const designator = letter === 'L' ? RunwayDesignator.RUNWAY_DESIGNATOR_LEFT
        : letter === 'R' ? RunwayDesignator.RUNWAY_DESIGNATOR_RIGHT
            : letter === 'C' ? RunwayDesignator.RUNWAY_DESIGNATOR_CENTER : RunwayDesignator.RUNWAY_DESIGNATOR_NONE;
    return {runwayNumber: Number(runway.slice(0, 2)), designator};
}

export interface ProcedureOptions {
    /** Runway transitions, e.g. {runway: '27', legs}. The runway is '27', '27L', '09R', '27C' */
    runways?: { runway: string; legs: FlightPlanLeg[] }[];
    common?: FlightPlanLeg[];
    /** Enroute transitions */
    transitions?: Transition[];
    rnpAr?: boolean;
}

function procedure(name: string, o: ProcedureOptions): Procedure {
    return {
        name, rnpAr: o.rnpAr ?? false, commonLegs: o.common ?? [],
        enRouteTransitions: (o.transitions ?? []).map(t => ({name: t.name, legs: t.legs})),
        runwayTransitions: (o.runways ?? []).map(r => {
            const {runwayNumber, designator} = parseRunway(r.runway);
            return {runwayNumber, runwayDesignation: designator, legs: r.legs};
        }),
    };
}

/** A departure. The SDK types SIDs and STARs alike (msfssdk.d.ts, Procedure) */
export const sid = (name: string, o: ProcedureOptions): Procedure => procedure(name, o);
/** An arrival */
export const star = (name: string, o: ProcedureOptions): Procedure => procedure(name, o);

export interface ApproachOptions {
    /** An ApproachType global, e.g. ApproachType.APPROACH_TYPE_RNAV */
    type: ApproachType;
    /** '27', '27L', or '' for a circling approach */
    runway: string;
    suffix?: string;
    /** RnavTypeFlags; the unit lists an RNAV approach only with LNAV. Default LNAV */
    rnav?: number;
    transitions?: Transition[];
    final: FlightPlanLeg[];
    missed?: FlightPlanLeg[];
    rnpAr?: boolean;
    missedRnpAr?: boolean;
    name?: string;
}

export function approach(o: ApproachOptions): ApproachProcedure {
    const {runwayNumber, designator} = parseRunway(o.runway);
    return {
        name: o.name ?? `APPROACH ${o.runway}`, runway: o.runway, runwayNumber, runwayDesignator: designator,
        approachType: o.type, approachSuffix: o.suffix ?? '', rnavTypeFlags: o.rnav ?? RnavTypeFlags.LNAV,
        rnpAr: o.rnpAr ?? false, missedApproachRnpAr: o.missedRnpAr ?? false, icaos: [],
        transitions: (o.transitions ?? []).map(t => ({name: t.name, legs: t.legs})),
        finalLegs: o.final, missedLegs: o.missed ?? [],
    };
}

/** A copy of the airport with procedures; the builders in builders.ts stay procedure-free */
export function withProcedures(apt: AirportFacility, p: { departures?: Procedure[]; arrivals?: Procedure[]; approaches?: ApproachProcedure[] }): AirportFacility {
    return {...apt, departures: p.departures ?? [], arrivals: p.arrivals ?? [], approaches: p.approaches ?? []};
}

/**
 * The runway waypoint a procedure leg can fly to (a SID's first leg, a STAR's last, a missed approach). Built with the
 * SDK's own RunwayUtils.createRunwayFacility from the airport's runway, so the ICAO is the sim's: type R, no region, the
 * airport ident and RW plus the designation. Add it to the navdata like any facility.
 * @param apt an airport from airport(), with the runway the designation names
 * @param runway '27', '09R', ...
 */
export function runwayFix(apt: AirportFacility, runway: string): RunwayFacility {
    const found = RunwayUtils.getOneWayRunwaysFromAirport(apt).find(r => r.designation === runway);
    if (found === undefined) {
        throw new Error(`runwayFix: ${apt.icaoStruct.ident} has no runway ${runway}`);
    }
    return RunwayUtils.createRunwayFacility(apt, found);
}
