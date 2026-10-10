import {Facility, FacilityType} from '@microsoft/msfs-sdk';
import {HeadlessUnit} from './boot';
import {KLNFlightplanLeg} from '../../kln90b/data/flightplan/Flightplan';

/**
 * The user waypoints of the unit's facility repository (user airports, VORs, NDBs, intersections and supplementary
 * waypoints alike), in repository order. With `type` only that facility type: FacilityType.USR is the supplementary
 * waypoints only.
 */
export function userWaypoints(unit: HeadlessUnit, type?: FacilityType): Facility[] {
    const out: Facility[] = [];
    unit.props.facilityRepository.forEach(f => out.push(f), type === undefined ? undefined : [type]);
    return out;
}

/** The message list as the MSG page would list it, each message's lines joined with a blank */
export const messages = (unit: HeadlessUnit): string[] =>
    unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

/** The message list with each message's lines kept apart */
export const messageLines = (unit: HeadlessUnit): string[][] =>
    unit.props.messageHandler.getMessages().map(m => m.message);

export const identsOf = (legs: readonly KLNFlightplanLeg[]): string[] => legs.map(l => l.wpt.icaoStruct.ident);

/** The idents of a flight plan of the unit, FPL 0 by default */
export const fplIdents = (unit: HeadlessUnit, idx = 0): string[] =>
    identsOf(unit.props.memory.fplPage.flightplans[idx].getLegs());

/** The ident of the active waypoint, undefined without one */
export const activeIdent = (unit: HeadlessUnit): string | undefined =>
    unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident;

/** ActiveWaypoint replaces the turn stack's array, so it is read fresh */
export const turnStackLength = (unit: HeadlessUnit): number =>
    unit.props.memory.navPage.activeWaypoint.turnStack.length;
