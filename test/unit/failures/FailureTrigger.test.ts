import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {Failures, FailureChangedEvents} from '../../../kln90b/failures/Failures';
import {FailureKey} from '../../../kln90b/failures/FailureCatalog';
import {FailureTrigger} from '../../../kln90b/failures/FailureTrigger';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {PowerEvent} from '../../../kln90b/PowerSupply';
import {clearStatic} from '../../harness/singletons';
import {mulberry32} from '../../harness/sim/random';

function plane(): KLN90PlaneSettings {
    return {
        takeHomeMode: false, basePath: '', debugMode: false, vfrOnly: false,
        input: {
            altimeterInterfaced: true, obsSource: 1, headingInput: false, headingSimVar: '', electricitySimVar: '',
            airdata: {isInterfaced: false, baroSource: 0, interface: DataInterface.RS232},
            obsInterface: ObsInterface.ANALOG, headingInterface: DataInterface.ARINC429,
            fuelComputer: {isInterfaced: false} as KLN90PlaneSettings['input']['fuelComputer'],
            externalSwitches: {legObsSwitchInstalled: false, appArmSwitchInstalled: false},
        },
        output: {
            obsTarget: 0, altitudeAlertEnabled: false, writeGPSSimVars: true, rmiInterface: RmiInterface.OBI, rmiInstalled: false,
            dataInterface: DataInterface.ARINC429,
            externalAnnunciators: {msgInstalled: false, wptInstalled: false, armInstalled: false, actvInstalled: false},
        },
    };
}

const ALWAYS_HIT = () => 0;
/** The eligible random failures of plane(): ARINC 429 output, OBS resolver, altitude, EEPROM and the superflag */
const ELIGIBLE: FailureKey[] = ['arinc429Out', 'obsResolver', 'altitude', 'eeprom', 'superflag'];

let events: { key: FailureKey, active: boolean }[];
let now: number;

function build(random: () => number, mtbfHours = 1) {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    const bus = new EventBus();
    events = [];
    bus.getSubscriber<FailureChangedEvents>().on('failureChanged').handle(e => events.push(e));
    const failures = new Failures(bus, KLN90BFailureSettings.getManager(bus), plane());
    failures.setMtbfHours(mtbfHours);
    const trigger = new FailureTrigger(bus, failures, () => now, random);
    return {bus, failures, trigger};
}

beforeEach(() => {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    now = 1_000_000;
});

describe('FailureTrigger', () => {
    it('the eligible candidates are the ones the tests assume', () => {
        const {failures} = build(ALWAYS_HIT);
        expect(failures.randomCandidates().map(d => d.key).sort()).toEqual([...ELIGIBLE].sort());
    });

    it('MTBF off never fails', () => {
        const {trigger} = build(ALWAYS_HIT, 0);
        for (let i = 0; i < 10_000; i++) {
            now += 1;
            trigger.tick();
        }
        expect(events).toEqual([]);
    });

    it('the first tick only sets the reference', () => {
        const {trigger} = build(ALWAYS_HIT);
        trigger.tick();
        expect(events).toEqual([]);

        now += 1;
        trigger.tick();
        expect(events.length).toBe(1);
        expect(events[0].active).toBe(true);
    });

    it('the rate matches the MTBF', () => {
        const {trigger, failures} = build(mulberry32(1), 1);
        trigger.tick();
        let drawn = 0;
        let lastDraw = now;
        const gaps: number[] = [];
        while (drawn < 200) {
            now += 1;
            trigger.tick();
            const hits = events.filter(e => e.active).length;
            if (hits > drawn) {
                drawn = hits;
                gaps.push(now - lastDraw);
                lastDraw = now;
                failures.repairAll();
            }
        }
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        expect(mean).toBeGreaterThan(3600 * 0.9);
        expect(mean).toBeLessThan(3600 * 1.1);
    });

    it('the choice is equal among candidates', () => {
        // Hit in the first draw, a spread value in the second: the draws alternate
        const rng = mulberry32(7);
        let n = 0;
        const {trigger, failures} = build(() => (n++ % 2 === 0 ? 0 : rng()));
        trigger.tick();
        const counts: Record<string, number> = {};
        for (let i = 0; i < 3000; i++) {
            now += 1;
            trigger.tick();
            failures.repairAll();
        }
        for (const e of events.filter(e => e.active)) {
            counts[e.key] = (counts[e.key] ?? 0) + 1;
        }
        expect(Object.keys(counts).sort()).toEqual([...ELIGIBLE].sort());
        const expected = 3000 / ELIGIBLE.length;
        for (const key of ELIGIBLE) {
            expect(counts[key]).toBeGreaterThan(expected * 0.9);
            expect(counts[key]).toBeLessThan(expected * 1.1);
        }
    });

    it('ineligible and active failures are not drawn', () => {
        const {trigger, failures} = build(ALWAYS_HIT);
        failures.fail('obsResolver');
        failures.fail('altitude');
        failures.fail('eeprom');
        failures.fail('superflag');
        events.length = 0;
        // rs232Out is ineligible on this plane and stays out; only arinc429Out is left, and it is active too
        failures.fail('arinc429Out');
        events.length = 0;

        trigger.tick();
        for (let i = 0; i < 100; i++) {
            now += 1;
            trigger.tick();
        }
        expect(events).toEqual([]);
    });

    it('a clock jump counts nothing', () => {
        const {trigger} = build(ALWAYS_HIT);
        trigger.tick();
        now += 61;
        trigger.tick();
        now -= 5;
        trigger.tick();
        expect(events).toEqual([]);

        now += 1; //a normal step from the new reference counts again
        trigger.tick();
        expect(events.length).toBe(1);
    });

    it('a power event clears the reference', () => {
        const {bus, trigger} = build(ALWAYS_HIT);
        trigger.tick();
        bus.getPublisher<PowerEvent>().pub('powerEvent', {isPowered: true} as never, false, false);

        now += 1;
        trigger.tick();
        expect(events).toEqual([]);

        now += 1;
        trigger.tick();
        expect(events.length).toBe(1);
    });

    it('reset clears the reference', () => {
        const {trigger} = build(ALWAYS_HIT);
        trigger.tick();
        trigger.reset();
        now += 1;
        trigger.tick();
        expect(events).toEqual([]);
    });
});
