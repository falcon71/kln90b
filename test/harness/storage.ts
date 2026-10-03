import {Facility, ICAO} from '@microsoft/msfs-sdk';

/**
 * User data as saved by an earlier session, for BootOptions.storage: a flight plan in the V2 format
 * (docs/architecture.md, Core 7). Only USER legs are persisted, so pass database or user facilities, not procedures.
 */
export function savedFlightplan(idx: number, legs: Facility[]): Record<string, unknown> {
    return {userDataFormat: 2, [`fpl${idx}`]: legs.map(f => ICAO.valueToStringV2(f.icaoStruct)).join('')};
}
