import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {HtAboveAirportAlert} from '../../../kln90b/services/HtAboveAirportAlert';
import {NavPageState} from '../../../kln90b/data/VolatileMemory';
import {KLN90PlaneSettings} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {Sensors} from '../../../kln90b/Sensors';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {LONG_BEEP_ID, SHORT_BEEP_ID} from '../../../kln90b/services/AudioGenerator';
import {airport, vor} from '../../harness/navdata/builders';

// 3-58: the height above airport alert. SET 5 enables it and sets an offset of 800 to 2000 ft. The unit puts a cylinder
// of 5 NM radius around the airport that is the Direct To or the active "to" waypoint, with its top at the field
// elevation plus the offset, and sounds short, long, short when the aircraft first penetrates it. The service reads the
// active waypoint and the distance to it from the navigation state, which the calculation tick fills.

const SHORT_LONG_SHORT = [SHORT_BEEP_ID, LONG_BEEP_ID, SHORT_BEEP_ID];

interface Options {
    active: Facility | null;
    enabled?: boolean;
    /** SET 5 offset, the setting htAboveAptOffset */
    offset?: number;
    /** SET 8 vertical buffer, the setting airspaceAlertBuffer (#89: the alert reads this one today) */
    suaBuffer?: number;
    installed?: boolean;
}

function rig(opts: Options) {
    const nav = {
        activeWaypoint: {getActiveWpt: () => opts.active},
        distToActive: null as number | null,
    };
    let ind: number | null = null;
    const patterns: string[][] = [];
    const sensors = {
        in: {airdata: {getIndicatedAlt: () => ind}},
        out: {audioGenerator: {beepPattern: (p: string[]) => patterns.push([...p])}},
    } as unknown as Sensors;
    const values: Record<string, unknown> = {
        htAboveAptEnabled: opts.enabled ?? true,
        htAboveAptOffset: opts.offset ?? 800,
        airspaceAlertBuffer: opts.suaBuffer ?? opts.offset ?? 800,
    };
    const userSettings = {getSetting: (name: string) => ({get: () => values[name]})} as unknown as KLN90BUserSettings;
    const settings = {output: {altitudeAlertEnabled: opts.installed ?? true}} as unknown as KLN90PlaneSettings;
    const alert = new HtAboveAirportAlert(nav as unknown as NavPageState, settings, sensors, userSettings);
    return {
        patterns,
        /** One calculation tick with the aircraft `distNm` from the active waypoint at `indFt` */
        at: (distNm: number | null, indFt: number | null) => {
            nav.distToActive = distNm;
            ind = indFt;
            alert.tick();
        },
    };
}

describe('HtAboveAirportAlert', () => {
    // 3-58: field elevation 0 ft (so the elevation's unit plays no part), offset 1000 ft: the top is 1000 ft.
    // Entering at 3 NM and 900 ft sounds short, long, short.
    it('sounds short, long, short on entering the cylinder (3-58)', () => {
        const r = rig({active: airport('KHHH', 47, 8, {elevationFt: 0}), offset: 1000});
        r.at(8, 900);
        expect(r.patterns).toEqual([]);
        r.at(3, 900);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // 3-58: the radius is 5 NM. 5.1 NM is outside, 4.9 NM inside.
    it('has a radius of 5 NM (3-58)', () => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 1000});
        r.at(5.1, 500);
        expect(r.patterns).toEqual([]);
        r.at(4.9, 500);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // 3-58: the top is the offset above the field (elevation 0 ft here; the elevation is the subject of the pins below).
    // 1100 ft is above a 1000 ft top, 900 ft below it.
    it('has its top at the offset above the field (3-58)', () => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 1000});
        r.at(3, 1100);
        expect(r.patterns).toEqual([]);
        r.at(3, 900);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // 3-58: the alert sounds when the aircraft first penetrates the cylinder, not on every tick inside it
    it('sounds once while the aircraft stays inside (3-58)', () => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 1000});
        r.at(4, 900);
        r.at(3, 800);
        r.at(2, 700);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // characterization: leaving the cylinder and entering it again sounds again. The manual's "first penetrates" could
    // also mean once per airport.
    it('sounds again after leaving and re-entering the cylinder (characterization)', () => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 1000});
        r.at(3, 900);
        r.at(3, 1500);
        r.at(3, 900);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT, SHORT_LONG_SHORT]);
    });

    // 3-58: only an airport has the cylinder; a VOR as the active waypoint gives no alert. The VOR carries an altitude
    // field, which VOR facilities lack, so that only the type check can keep it silent.
    it('ignores an active waypoint that is not an airport (3-58)', () => {
        const r = rig({active: {...vor('HHV', 47, 8), altitude: 0} as Facility, offset: 1000});
        r.at(3, 900);
        expect(r.patterns).toEqual([]);
    });

    // 3-58: SET 5 OFF; 3-59: an altitude input is required; 3-57/3-59: the installation can disable the feature
    it.each([
        ['with SET 5 OFF', {enabled: false}, 900],
        ['without an altitude input', {}, null],
        ['when the installation disables it', {installed: false}, 900],
    ])('stays silent %s (3-58, 3-59)', (_name, opts, ind) => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 1000, ...opts});
        r.at(3, ind);
        expect(r.patterns).toEqual([]);
    });

    // The passing sibling of the pins below, at elevation 0: 1700 ft is above an 800 ft offset and below a 2000 ft one
    it('uses the offset when both settings agree (3-58)', () => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 2000, suaBuffer: 2000});
        r.at(3, 1700);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // 3-58: the offset is the SET 5 offset (htAboveAptOffset). The service reads the SET 8 buffer airspaceAlertBuffer
    // instead, the reading half of #89 (the SET 5 pin holds the saving half).
    it.fails('uses the SET 5 offset, not the SUA buffer (#89)', () => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 2000, suaBuffer: 500});
        r.at(3, 1700);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // 3-58: the top is the database field elevation plus the offset, in feet. AirportFacility.altitude is in meters (the
    // builder converts like the sim data; APT 2 converts it back), but the service adds it to feet unconverted. A field
    // at 3000 ft (914.4 m) with offset 1000 ft has its top at 4000 ft; the service uses 1914.4 ft, so an aircraft at
    // 3900 ft, 900 ft above the field, gets no alert.
    it.fails('adds the field elevation in feet (#178)', () => {
        const r = rig({active: airport('KHHH', 47, 8, {elevationFt: 3000}), offset: 1000});
        r.at(3, 3900);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // The passing sibling of the pin above: at 1800 ft, below 1914 ft, the service alerts today, so the pin's setup
    // reaches the comparison
    it('alerts an aircraft below the top of a field at 3000 ft (sibling of #178, 3-58)', () => {
        const r = rig({active: airport('KHHH', 47, 8, {elevationFt: 3000}), offset: 1000});
        r.at(3, 1800);
        expect(r.patterns).toEqual([SHORT_LONG_SHORT]);
    });

    // Without a navigation solution (GPS invalid, NavCalculator.setFlag) distToActive is null while the active waypoint
    // stays. `null <= 5` is true in JavaScript, so the service treats an unknown position as inside the cylinder.
    // An aircraft below the top with no position must not alert: 3-58 compares the aircraft's position with the cylinder.
    it.fails('gives no alert without a distance to the airport (#179)', () => {
        const r = rig({active: airport('KHHH', 47, 8), offset: 1000});
        r.at(null, 500);
        expect(r.patterns).toEqual([]);
    });
});
