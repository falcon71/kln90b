import {Facility, ICAO} from '@microsoft/msfs-sdk';
import type {HeadlessUnit} from './boot';

/**
 * User data as saved by an earlier session, for BootOptions.storage: a flight plan in the V2 format
 * (docs/architecture.md, Core 7). Only USER legs are persisted, so pass database or user facilities, not procedures.
 */
export function savedFlightplan(idx: number, legs: Facility[]): Record<string, unknown> {
    return {userDataFormat: 2, [`fpl${idx}`]: legs.map(f => ICAO.valueToStringV2(f.icaoStruct)).join('')};
}

interface SavedPosition {
    /** Characters of the display set (A-Z, 0-9, space, -), at most 8 (the width of the field); padded to 8 in the string */
    ident: string;
    /** Degrees, north positive */
    lat: number;
    /** Degrees, east positive */
    lon: number;
}

/**
 * A user waypoint as an earlier session saved it. `sup` is a user waypoint of the SUP page (type letter `U`), `int` a
 * user intersection (`W`).
 * - `apt`: `elevationFt` is stored in meters, rounded, as the format and the model hold it (1400 ft are saved as +00427).
 *   An unknown elevation is saved as -1 m (the unit's own value) and an unknown runway length as -33 ft (the unit's
 *   -10 m), with the surface `-`; give `runwayLengthFt` to get a surface of `H` (asphalt) unless `surface` says `S` (grass).
 * - `vor`: `magvar` is the whole-degree number the unit saves, as the model holds it (`VorOptions.magneticVariation`).
 */
export type SavedUserWaypoint =
    | (SavedPosition & { kind: 'sup' | 'int' })
    | (SavedPosition & { kind: 'apt'; elevationFt?: number; runwayLengthFt?: number; surface?: 'H' | 'S' | '-' })
    | (SavedPosition & { kind: 'vor'; freqMHz: number; magvar: number })
    | (SavedPosition & { kind: 'ndb'; freqKHz: number });

const USER_REGION = 'XX';
const TYPE_LETTER = {sup: 'U', int: 'W', apt: 'A', vor: 'V', ndb: 'N'};
/** What the unit saves for an airport of unknown elevation: -1 m (Apt1Page.createAtUserPosition, `altitude: -1`) */
const UNKNOWN_ELEVATION_M = -1;
const UNKNOWN_RUNWAY_LENGTH_FT = -33;

/** A sign, then |n| padded to the given digits: signed(-3, 2) is "-03" */
function signed(n: number, digits: number): string {
    return (n < 0 ? '-' : '+') + String(Math.abs(n)).padStart(digits, '0');
}

/** Degrees and decimal minutes, `+DDMM.mm` (degreeDigits 2) or `+DDDMM.mm` (3), rounded to 0.01 minute */
function degreesMinutes(value: number, degreeDigits: number): string {
    const hundredths = Math.round(Math.abs(value) * 6000);
    const degrees = Math.floor(hundredths / 6000);
    const minutes = ((hundredths % 6000) / 100).toFixed(2).padStart(5, '0');
    return (value < 0 ? '-' : '+') + String(degrees).padStart(degreeDigits, '0') + minutes;
}

/**
 * User waypoints in the V2 format (docs/architecture.md, Core 7), for BootOptions.storage: one `wptN` setting per
 * waypoint, in the order given, plus `userDataFormat: 2`. The strings are laid out by hand from the format, not
 * produced by the persistor, so that a test of the restore does not depend on the code that saved. Merge it with
 * `savedFlightplan` by spreading both.
 *
 * Do not put a southern latitude of 1 degree or more into a restore test: the loader flips its sign (#98).
 */
export function savedUserWaypoints(wpts: SavedUserWaypoint[]): Record<string, unknown> {
    const storage: Record<string, unknown> = {userDataFormat: 2};
    wpts.forEach((w, i) => {
        // type, region, 8 blanks (the airport part of the ICAO, empty for a user waypoint), the ident padded to 8
        let s = `${TYPE_LETTER[w.kind]}${USER_REGION}${' '.repeat(8)}${w.ident.padEnd(8, ' ')}`;
        s += degreesMinutes(w.lat, 2) + degreesMinutes(w.lon, 3);
        switch (w.kind) {
            case 'apt': {
                const length = w.runwayLengthFt ?? UNKNOWN_RUNWAY_LENGTH_FT;
                const surface = w.surface ?? (w.runwayLengthFt === undefined ? '-' : 'H');
                // The format stores the elevation in meters, as the model holds it (UserWaypointPersistor.serializeApt)
                const elevationM = w.elevationFt === undefined ? UNKNOWN_ELEVATION_M : Math.round(w.elevationFt * 0.3048);
                s += signed(elevationM, 5) + signed(length, 5) + surface;
                break;
            }
            case 'vor':
                s += '+' + w.freqMHz.toFixed(2).padStart(6, '0') + signed(w.magvar, 2);
                break;
            case 'ndb':
                s += '+' + w.freqKHz.toFixed(1).padStart(6, '0');
                break;
        }
        storage[`wpt${i}`] = s;
    });
    return storage;
}

/**
 * The value the unit saved under a user setting, parsed; undefined if it was never saved (FakeStorage returns "" for a
 * missing key). The unit saves a setting some time after it changed, so advance the clock first.
 */
export function storedSetting(unit: HeadlessUnit, name: string): unknown {
    const raw = unit.env.storage.data.get(`persistent-setting.${unit.atcModel}.profile_1.${name}`);
    return raw === undefined || raw === '' ? undefined : JSON.parse(raw);
}
