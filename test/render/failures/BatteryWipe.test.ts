import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {ICAO} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {airport, intersection} from '../../harness/navdata/builders';
import {savedFlightplan, savedUserWaypoints, storedSetting} from '../../harness/storage';
import {fplIdents, messages, userWaypoints} from '../../harness/readers';
import {efbRoute, FakePlatform} from '../../harness/platform';
import {panelXml} from '../../harness/panelXml';
import {Screen} from '../../harness/render/screen';
import {KLN90BCore} from '../../../kln90b/KLN90BCore';
import {EVT_POWER_ON} from '../../../kln90b/HEvents';

const kaaa = airport('KAAA', 47.0, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);
/** A user waypoint the test creates after a wipe (region XX) */
const usrb = intersection('USRB', 47.3, 8.3, {region: 'XX'});
/** An airport that is not in the navdata: a restore of a plan that holds it posts WAYPOINT KZZZ DELETED (B-4, #421) */
const KZZZ = airport('KZZZ', 47.6, 8.0);
const WELCOME1 = 'BATTERY TEST UNIT      ';
const RMK0 = 'KAAALINE ONE   LINE TWO   LINE THREE ';
const EEPROM = {eepromCrtCenterX: 2, eepromCrtCenterY: -1, eepromDbarCalPlus: 301.5, eepromDbarCalMinus: -298.5};

/** The user memory of an earlier session, with the EEPROM calibration that no wipe reaches */
const STORED: Record<string, unknown> = {
    // Two user waypoints of different types, so that a removal of only some of them shows
    ...savedUserWaypoints([{kind: 'int', ident: 'USRA', lat: 47.2, lon: 8.2}, {kind: 'apt', ident: 'UAPT', lat: 47.25, lon: 8.25}]),
    ...savedFlightplan(1, [kaaa, kbbb]),
    rmk0: RMK0,
    welcome1: WELCOME1,
    powercycles: 41,
    totalTime: 7200,
    userDataFormat: 2,
    fastGpsAcquisition: false,
    ...EEPROM,
};
const FAILED = {failure_battery: '{}'};

const userDataLost = (unit: HeadlessUnit) => messages(unit).filter(m => m === 'USER DATA LOST').length;
const restoreMessages = (unit: HeadlessUnit) => messages(unit).filter(m => m.startsWith('WAYPOINT') || m.startsWith('OTHER WAYPOINTS'));
const userIdents = (unit: HeadlessUnit) => userWaypoints(unit).map(f => f.icaoStruct.ident).sort();
const emptySlot = (value: unknown) => value === '' || value === undefined;

function expectDataInMemory(unit: HeadlessUnit): void {
    expect(userIdents(unit)).toEqual(['UAPT', 'USRA']);
    expect(fplIdents(unit, 1)).toEqual(['KAAA', 'KBBB']);
    expect(unit.props.remarksManager.getAirportsWithRemarks()).toEqual(['KAAA']);
    expect(unit.props.userSettings.getSetting('welcome1').get()).toBe(WELCOME1);
}

function expectDataStored(unit: HeadlessUnit): void {
    expect(storedSetting(unit, 'wpt0')).toBe(STORED.wpt0);
    expect(storedSetting(unit, 'wpt1')).toBe(STORED.wpt1);
    expect(storedSetting(unit, 'fpl1')).toBe(STORED.fpl1);
    expect(storedSetting(unit, 'rmk0')).toBe(RMK0);
}

function expectDataGone(unit: HeadlessUnit): void {
    expect(userIdents(unit)).toEqual([]);
    expect(fplIdents(unit, 1)).toEqual([]);
    expect(unit.props.remarksManager.getAirportsWithRemarks()).toEqual([]);
    expect(unit.props.userSettings.getSetting('welcome1').get()).toBe(' '.repeat(23));
}

// Characterizations of the design (docs/superpowers/specs/2026-11-08-failures-battery-design.md, "The wipe"): at a
// power-on with the battery failed the unit has lost its battery-backed user memory (B-2 for the battery's life), and
// USER DATA LOST is posted; nothing is lost while the unit runs
describe('the wipe of the user memory at a power-on with the battery failed (#461)', () => {
    it('a power-on with the battery failed wipes the user memory', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], storage: STORED});
        expectDataInMemory(unit); // Precondition

        unit.props.failures.fail('battery');
        await unit.panel.powerCycle({offSeconds: 600});
        await unit.panel.approveSelfTest();

        expectDataGone(unit);
        expect(unit.props.userSettings.getSetting('powercycles').get()).toBe(1);
        expect(unit.props.userSettings.getSetting('totalTime').get()).toBe(0);
        expect(userDataLost(unit)).toBe(1);

        await vi.advanceTimersByTimeAsync(1000);
        expect(emptySlot(storedSetting(unit, 'wpt0'))).toBe(true);
        expect(emptySlot(storedSetting(unit, 'wpt1'))).toBe(true);
        expect(emptySlot(storedSetting(unit, 'fpl1'))).toBe(true);
        expect(emptySlot(storedSetting(unit, 'rmk0'))).toBe(true);
        expect(storedSetting(unit, 'userDataFormat')).toBe(2);
        expect(storedSetting(unit, 'fastGpsAcquisition')).toBe(false);
        for (const [name, value] of Object.entries(EEPROM)) {
            expect(storedSetting(unit, name), name).toBe(value);
        }
        expect(storedSetting(unit, 'failure_battery')).toBe('{}');

        // Timers saves the total time it counts every 60 s: the 7200 s of before the wipe do not come back
        await vi.advanceTimersByTimeAsync(61_000);
        expect(unit.props.userSettings.getSetting('totalTime').get()).toBeLessThan(200);
    }, 30_000);

    it('nothing is wiped while the unit is on, and a repair before the power-off keeps everything', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], storage: STORED});

        unit.props.failures.fail('battery');
        await vi.advanceTimersByTimeAsync(10 * 60_000);
        expectDataInMemory(unit);
        expectDataStored(unit);

        unit.props.failures.repair('battery');
        await unit.panel.powerCycle({offSeconds: 600});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);

        expectDataInMemory(unit);
        expectDataStored(unit);
        expect(userDataLost(unit)).toBe(0);
    }, 60_000);

    describe('the first power-on of a session wipes', () => {
        // FPL 1 holds KZZZ, which is not in the navdata: the boot's restore of a cold-and-dark start reports it deleted
        // before the power-on, and the wipe clears that message with the data it was about. At an engine-running start
        // the wipe comes before the restore, which then reads empty slots
        const storage = {...STORED, ...FAILED, ...savedFlightplan(1, [kaaa, KZZZ, kbbb])};

        it('cold and dark', async () => {
            const unit = await bootToSelfTest({facilities: [kaaa, kbbb], storage});

            expectDataGone(unit);
            expect(userDataLost(unit)).toBe(1);
            expect(restoreMessages(unit)).toEqual([]);
        }, 30_000);

        it('engine running', async () => {
            const unit = await bootUnit({facilities: [kaaa, kbbb], storage});

            expectDataGone(unit);
            expect(userDataLost(unit)).toBe(1);
            expect(restoreMessages(unit)).toEqual([]);
        });
    });

    it('the ride-through and the hot-swap resume wipe nothing', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], storage: STORED, panelXml: panelXml({'Input.ElectricitySimVar': 'CIRCUIT ON:1'})});
        const sim = unit.env.sim;
        // CIRCUIT ON:1 is unset (reads 0) at the boot, so the unit is off until the circuit comes on (SimVarSync.test.ts)
        await vi.advanceTimersByTimeAsync(3000);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.approveSelfTest();
        unit.props.failures.fail('battery');

        // A loss shorter than the ride-through of the battery module (PowerSupply.test.ts)
        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(1000);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().status().left).toBe('NAV 2'); // Precondition: carried, no power-on
        // A hot-swap disable and resume (SimVarSync.test.ts)
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(5000);
        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expectDataInMemory(unit);
        expectDataStored(unit);
        expect(userDataLost(unit)).toBe(0);
    }, 30_000);

    it('a first-ever start is no wipe', async () => {
        const unit = await bootUnit();

        expect(userDataLost(unit)).toBe(0);
        expect(unit.props.battery.health).toBe(100);
    });

    // KLNMagvar sets the pilot's variation to 0 inside the primary coverage area, so it is visible only outside (lat 74.5)
    it('the wipe leaves no Direct To and no pilot magnetic variation', async () => {
        const kccc = airport('KCCC', 74.6, 8.0);
        const unit = await bootUnit({facilities: [kccc], position: {lat: 74.5, lon: 8.0}});
        await settle(unit);
        await unit.panel.directTo('KCCC');
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true); // Precondition
        unit.props.memory.navPage.userMagvar = 5;
        unit.props.failures.fail('battery');

        await unit.panel.powerCycle({offSeconds: 60});
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.userMagvar).toBe(0);
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(false);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()).toBeNull();
        expect(unit.props.memory.navPage.activeWaypoint.lastactiveWaypoint).toBeNull();
        expect(unit.props.memory.navPage.startPageWaypoint).toBeNull();
    });

    describe('a route synced from the EFB before the power-on is wiped, one after it stays', () => {
        it('cold and dark, synced before the power-on', async () => {
            const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, engineRunning: false, storage: FAILED});
            unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
            await vi.advanceTimersByTimeAsync(2000);
            expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']); // Precondition: loaded while off

            await unit.panel.powerOn();
            await vi.advanceTimersByTimeAsync(19_000);

            expect(fplIdents(unit)).toEqual([]);
        }, 30_000);

        it('engine running, synced after the boot', async () => {
            const unit = await bootUnit({facilities: [kaaa, kbbb], efb: true, storage: FAILED});
            expect(userDataLost(unit)).toBe(1); // Precondition: the boot's power-on wiped

            unit.efb!.sync(efbRoute({departure: kaaa, destination: kbbb}));
            await vi.advanceTimersByTimeAsync(2000);

            expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
        });
    });

    // The wipe is an in-session power cycle: at an engine-running boot the restore rewrites userDataFormat to 2 by itself
    it('data entered after a wipe survives the next session once repaired', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], storage: STORED});
        unit.props.failures.fail('battery');
        await unit.panel.powerCycle({offSeconds: 60});
        await unit.panel.approveSelfTest();
        expect(userIdents(unit)).toEqual([]); // Precondition: wiped

        unit.props.facilityRepository.add(usrb);
        unit.props.failures.repair('battery');
        await vi.advanceTimersByTimeAsync(1000);

        expect(String(storedSetting(unit, 'wpt0')).startsWith(ICAO.valueToStringV2(usrb.icaoStruct))).toBe(true);
        expect(storedSetting(unit, 'userDataFormat')).toBe(2);
    }, 30_000);

    it('two power cycles in a row', async () => {
        const unit = await bootUnit({facilities: [kaaa, kbbb], storage: STORED});
        unit.props.failures.fail('battery');

        await unit.panel.powerCycle({offSeconds: 60});
        await unit.panel.approveSelfTest();
        unit.props.facilityRepository.add(usrb);
        expect(userIdents(unit)).toEqual(['USRB']); // Precondition
        await unit.panel.powerCycle({offSeconds: 60});
        await unit.panel.approveSelfTest();

        expect(userIdents(unit)).toEqual([]);
        expect(userDataLost(unit)).toBe(1);
    }, 60_000);
});

/** Every lookup of the memory client answers after the delay */
function delayedLookups(delayMs: number): { createFacilityClient: (this: FakePlatform) => any } {
    return {
        createFacilityClient(this: FakePlatform) {
            const inner = this.navdata;
            return new Proxy(inner, {
                get(target, prop) {
                    const value = (target as any)[prop];
                    if (prop === 'getFacility') {
                        return (...args: unknown[]) => new Promise(resolve => setTimeout(resolve, delayMs)).then(() => value.apply(target, args));
                    }
                    return typeof value === 'function' ? value.bind(target) : value;
                },
            });
        },
    };
}

/** Switches the unit on `ms` after its init started */
function powerOnDuringBoot(ms: number): void {
    const original = KLN90BCore.prototype.init;
    const init = vi.spyOn(KLN90BCore.prototype, 'init').mockImplementation(
        function (this: KLN90BCore, xml: Document) {
            setTimeout(() => this.onInteractionEvent([EVT_POWER_ON]), ms);
            return original.call(this, xml);
        });
    onTestFinished(() => init.mockRestore());
}

// Every lookup takes 5 s: the last active waypoint is looked up from 0 to 5 s, the flight plans from 5 to 10 s. A
// power-on in either leaves the data the restore had read before the wipe behind, and the restore's messages
describe('a power-on during the boot\'s restore (#461)', () => {
    const storage = {
        ...STORED, ...FAILED,
        ...savedFlightplan(1, [kaaa, KZZZ, kbbb]),
        activeWaypoint: ICAO.valueToStringV2(kaaa.icaoStruct),
    };

    for (const [when, ms] of [['during the lookup of the last active waypoint', 1000], ['during the restore of the flight plans', 7000]] as const) {
        it(when, async () => {
            powerOnDuringBoot(ms);
            const unit = await bootUnit({facilities: [kaaa, kbbb], engineRunning: false, storage, platform: delayedLookups(5000)});
            await vi.advanceTimersByTimeAsync(20_000);

            expect(fplIdents(unit, 1)).toEqual([]);
            expect(unit.props.memory.navPage.activeWaypoint.lastactiveWaypoint).toBeNull();
            expect(unit.props.memory.navPage.startPageWaypoint).toBeNull();
            expect(userIdents(unit)).toEqual([]);
            expect(userDataLost(unit)).toBe(1);
            expect(restoreMessages(unit)).toEqual([]);
        }, 60_000);
    }

    // A slot the boot cannot restore is reported with USER DATA LOST (KLN90BCore.asyncInit); a wipe during the restore
    // reports the same loss, which is listed once
    it('a profile that cannot be restored and a wipe during the restore', async () => {
        powerOnDuringBoot(1000);
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], engineRunning: false, platform: delayedLookups(5000),
            storage: {...FAILED, userDataFormat: 2, wpt0: 'GARBAGE', activeWaypoint: ICAO.valueToStringV2(kaaa.icaoStruct)},
        });
        await vi.advanceTimersByTimeAsync(20_000);

        expect(userDataLost(unit)).toBe(1);
    }, 60_000);
});
