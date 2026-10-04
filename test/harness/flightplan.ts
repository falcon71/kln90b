import {Facility} from '@microsoft/msfs-sdk';
import type {HeadlessUnit} from './boot';
import {KLNLegType} from '../../kln90b/data/flightplan/Flightplan';
import {insertLegIntoFpl} from '../../kln90b/services/FlightplanUtils';

/**
 * Inserts a USER leg into FPL 0 at idx, as the FPL page does after a waypoint confirmation: it calls `insertLegIntoFpl`,
 * which answers a full FPL 0 (30 legs) by dropping the first leg. Advance the clock before reading the screen.
 */
export function insertLeg(unit: HeadlessUnit, idx: number, fac: Facility): void {
    insertLegIntoFpl(unit.props.memory.fplPage.flightplans[0], unit.props.memory.navPage, idx, {wpt: fac, type: KLNLegType.USER});
}
