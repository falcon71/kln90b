import {describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {KLN90BSettingSaveManager} from '../../../kln90b/settings/KLN90BUserSettingsSaverManager';
import {simEnv} from '../../harness/sim/install';

// Persisted user data, CLAUDE.md "Public contract with aircraft" ("Persisted user data": setting keys are never
// renamed or repurposed, users keep their data across versions) and docs/architecture.md Core 7: every key that
// `KLN90BSettingSaveManager.save` writes, with its default. Users' saved profiles are keyed by these names, so a
// rename or a changed default loses or changes what they stored.
//
// An exact pin on purpose: adding, renaming or removing a key, or changing a default, has to touch this list. When #92
// is fixed with more remark slots, the `rmk` slots below change on purpose.
const PREFIX = 'persistent-setting.KLN TEST.profile_1.';

const DEFAULTS: Record<string, unknown> = {
    welcome1: ' '.repeat(23),
    welcome2: ' '.repeat(23),
    welcome3: ' '.repeat(23),
    welcome4: ' '.repeat(23),
    powercycles: 0,
    totalTime: 0,
    timezone: 0,
    barounit: true,
    barosetting: 29.92,
    lastLatitude: 0,
    lastLongitude: 0,
    lastAlmanacDownload: 0,
    nearestAptSurface: true,
    nearestAptMinRunwayLength: 1000,
    activeWaypoint: '',
    airspaceAlertEnabled: true,
    airspaceAlertBuffer: 500,
    altAlertVolume: 99,
    htAboveAptEnabled: false,
    htAboveAptOffset: 800,
    turnAnticipation: true,
    nav5MapOrientation: 0,
    nav5MapRange: 40,
    superNav5MapOrientation: 0,
    superNav5MapRange: 40,
    superNav5Field1: 0,
    superNav5Field2: 0,
    superNav5Field3: 0,
    superNav5Vor: 0,
    superNav5Ndb: false,
    superNav5Apt: false,
    flightTimer: false,
    fastGpsAcquisition: true,
    cal12IndicatedAltitude: 0,
    cal12Barometer: 0,
    cal1SAT: 0,
    cal2Cas: 0,
    cal2TAT: 0,
    cal3Tas: 0,
    cal3HeadingMag: 0,
    cal4GS: 0,
    cal4Fpm: 0,
    cal4Angle: 0,
    cal5TempC: 0,
    cal5TempF: 32,
    cal5SpeedKt: 0,
    cal5SpeedMph: 0,
    userDataFormat: 0,
};

describe('persisted user setting keys', () => {
    it('saves every key under persistent-setting.<ATC MODEL>.profile_1 with its default', () => {
        // The unit stage has no teardown, and autosave never stores a default, so the save manager is asked for all
        const data = simEnv().storage.data;
        data.clear();
        const bus = new EventBus();
        const manager = new KLN90BSettingSaveManager(bus, new KLN90BUserSettings(bus));

        manager.save('KLN TEST.profile_1');

        const expected: Record<string, string> = {};
        for (const [name, value] of Object.entries(DEFAULTS)) {
            expected[PREFIX + name] = JSON.stringify(value);
        }
        // 250 user waypoint slots (docs/architecture.md Core 7), FPL 0 to FPL 25 and the remark slots, empty
        for (let i = 0; i < 250; i++) expected[`${PREFIX}wpt${i}`] = '""';
        for (let i = 0; i <= 25; i++) expected[`${PREFIX}fpl${i}`] = '""';
        for (let i = 0; i < 10; i++) expected[`${PREFIX}rmk${i}`] = '""';

        expect(Object.fromEntries(data)).toEqual(expected);
    });
});
