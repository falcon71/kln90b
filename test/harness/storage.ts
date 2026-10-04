import {Facility, ICAO} from '@microsoft/msfs-sdk';
import type {HeadlessUnit} from './boot';

/**
 * User data as saved by an earlier session, for BootOptions.storage: a flight plan in the V2 format
 * (docs/architecture.md, Core 7). Only USER legs are persisted, so pass database or user facilities, not procedures.
 */
export function savedFlightplan(idx: number, legs: Facility[]): Record<string, unknown> {
    return {userDataFormat: 2, [`fpl${idx}`]: legs.map(f => ICAO.valueToStringV2(f.icaoStruct)).join('')};
}

/**
 * The value the unit saved under a user setting, parsed; undefined if it was never saved (FakeStorage returns "" for a
 * missing key). The unit saves a setting some time after it changed, so advance the clock first.
 */
export function storedSetting(unit: HeadlessUnit, name: string): unknown {
    const raw = unit.env.storage.data.get(`persistent-setting.${unit.atcModel}.profile_1.${name}`);
    return raw === undefined || raw === '' ? undefined : JSON.parse(raw);
}
