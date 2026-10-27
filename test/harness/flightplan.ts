import {Facility} from '@microsoft/msfs-sdk';
import type {HeadlessUnit} from './boot';
import {KLNLegType} from '../../kln90b/data/flightplan/Flightplan';
import {insertLegIntoFpl} from '../../kln90b/services/FlightplanUtils';

/**
 * Inserts a USER leg into FPL 0 at idx, as the FPL page does after a waypoint confirmation: it calls `insertLegIntoFpl`,
 * which answers a full FPL 0 (30 en-route legs) by dropping the first leg. It skips the question the FPL page asks before
 * an insert into a full FPL 0 opens (#380). Advance the clock before reading the screen.
 */
export function insertLeg(unit: HeadlessUnit, idx: number, fac: Facility): void {
    insertLegIntoFpl(unit.props.memory.fplPage.flightplans[0], unit.props.memory.navPage, idx, {wpt: fac, type: KLNLegType.USER});
}

/**
 * Deletes the leg at idx from FPL 0, as the FPL page does when the pilot deletes a waypoint (`FlightplanList.deleteLeg`
 * calls `Flightplan.deleteLeg`). It skips the DEL? question. Advance the clock before reading the screen.
 */
export function deleteLeg(unit: HeadlessUnit, idx: number): void {
    unit.props.memory.fplPage.flightplans[0].deleteLeg(idx);
}
