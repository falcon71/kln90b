import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {Failures} from '../../../kln90b/failures/Failures';
import {FailureDetectionState, FailureDetector} from '../../../kln90b/failures/FailureDetector';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';

/** Air data over ARINC 429 and a fuel computer (RS-232 in), RS-232 output: every kind of detection is eligible */
function plane(headingRs232 = false): KLN90PlaneSettings {
    return {
        takeHomeMode: false, basePath: '', debugMode: false, vfrOnly: false,
        input: {
            altimeterInterfaced: true, obsSource: 1, headingInput: headingRs232, headingSimVar: '', electricitySimVar: '',
            airdata: {isInterfaced: true, baroSource: 0, interface: DataInterface.ARINC429},
            obsInterface: ObsInterface.ANALOG, headingInterface: DataInterface.RS232,
            fuelComputer: {isInterfaced: true} as KLN90PlaneSettings['input']['fuelComputer'],
            externalSwitches: {legObsSwitchInstalled: false, appArmSwitchInstalled: false},
        },
        output: {
            obsTarget: 0, altitudeAlertEnabled: false, writeGPSSimVars: true, rmiInterface: RmiInterface.OBI, rmiInstalled: false,
            dataInterface: DataInterface.RS232,
            externalAnnunciators: {msgInstalled: false, wptInstalled: false, armInstalled: false, actvInstalled: false},
        },
    };
}

let now: number;
let state: FailureDetectionState;
let failures: Failures;
let random: number;
let detector: FailureDetector;

function tickAt(t: number) {
    now = t;
    detector.tick();
}

beforeEach(() => {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    now = 1000;
    random = 0;
    state = {mainPageShown: false, powerOnScheduled: false, pendingS: new Map(), detected: new Set()};
    failures = new Failures(new EventBus(), KLN90BFailureSettings.getManager(new EventBus()), plane());
    detector = new FailureDetector(failures, () => state, () => now, () => random);
});

describe('FailureDetector', () => {
    it('nothing before the main page', () => {
        failures.fail('rs232In');
        failures.fail('arinc429Out');
        tickAt(1000);
        tickAt(1100);

        expect(state.pendingS.size).toBe(0);
        expect(state.detected.size).toBe(0);
        expect(detector.isDetected('rs232In')).toBe(false);
        expect(detector.isDetected('arinc429Out')).toBe(false);
    });

    it('power-on order: RS-232 at the main page, ARINC 429 five seconds later', () => {
        failures.fail('rs232In');
        failures.fail('airdata429');
        tickAt(1000);
        state.mainPageShown = true;
        tickAt(1001);

        expect(detector.isDetected('rs232In')).toBe(true);
        expect(detector.isDetected('airdata429')).toBe(false);

        tickAt(1005);
        expect(detector.isDetected('airdata429')).toBe(false); // 4 s after the main page tick
        tickAt(1006);
        expect(detector.isDetected('airdata429')).toBe(true);
    });

    it('operation delay: random 0 gives 2 s, random 0.999 gives 10 s, never earlier', () => {
        state.mainPageShown = true;
        tickAt(1000);
        for (const [draw, delay] of [[0, 2], [0.999, 10]] as const) {
            random = draw;
            failures.repair('rs232In');
            tickAt(now + 1);
            failures.fail('rs232In');
            const failedAt = now + 1;
            tickAt(failedAt);
            expect(detector.isDetected('rs232In')).toBe(false);
            tickAt(failedAt + delay - 0.5);
            expect(detector.isDetected('rs232In')).toBe(false);
            tickAt(failedAt + delay);
            expect(detector.isDetected('rs232In')).toBe(true);
        }
    });

    it('an internal failure shows at the next tick', () => {
        state.mainPageShown = true;
        tickAt(1000);
        random = 0.999;
        failures.fail('arinc429Out');
        expect(detector.isDetected('arinc429Out')).toBe(false); // Not before the detector has looked
        tickAt(1001);

        expect(detector.isDetected('arinc429Out')).toBe(true);
    });

    it('a repair or loss of eligibility clears the schedule and a new eligibility schedules anew', () => {
        state.mainPageShown = true;
        tickAt(1000);
        failures.fail('rs232In');
        tickAt(1001);
        expect(state.pendingS.has('rs232In')).toBe(true);

        failures.repair('rs232In');
        tickAt(1002);
        expect(state.pendingS.has('rs232In')).toBe(false);
        expect(detector.isDetected('rs232In')).toBe(false);

        // Failed while ineligible: the setting is stored but not effective
        const settings = plane();
        settings.input.fuelComputer.isInterfaced = false;
        const ineligible = new Failures(new EventBus(), KLN90BFailureSettings.getManager(new EventBus()), settings);
        const own = new FailureDetector(ineligible, () => state, () => now, () => random);
        ineligible.fail('rs232In');
        now = 1003;
        own.tick();
        expect(state.pendingS.has('rs232In')).toBe(false);

        settings.input.fuelComputer.isInterfaced = true; // Eligible again
        random = 0.5;
        now = 1004;
        own.tick();
        expect(state.pendingS.get('rs232In')).toBe(2 + 0.5 * 8); // The seconds it still waits
        expect(own.isDetected('rs232In')).toBe(false);
    });

    it('a repair clears a detected failure, and the next failure waits its delay again', () => {
        state.mainPageShown = true;
        tickAt(1000);
        failures.fail('rs232In');
        tickAt(1001);
        tickAt(1003);
        expect(detector.isDetected('rs232In')).toBe(true); // Precondition: 2 s with random 0

        failures.repair('rs232In');
        tickAt(1004);
        expect(state.detected.has('rs232In')).toBe(false);
        failures.fail('rs232In');
        tickAt(1005);

        expect(detector.isDetected('rs232In')).toBe(false);
        tickAt(1007);
        expect(detector.isDetected('rs232In')).toBe(true);
    });
});

// The sim clock can be set back or ahead (a date changed in the sim, a long pause). A detected failure stays detected,
// and a pending one waits the time it has left, counted as the trigger counts time (MAX_TRIGGER_STEP_S)
describe('FailureDetector over a jump of the sim clock', () => {
    it('keeps a detected failure detected when the clock is set back an hour', () => {
        failures.fail('arinc429Out');
        state.mainPageShown = true;
        tickAt(1000);
        tickAt(1001);
        expect(detector.isDetected('arinc429Out')).toBe(true); // Precondition

        tickAt(1001 - 3600);

        expect(detector.isDetected('arinc429Out')).toBe(true);
        tickAt(1002 - 3600);
        expect(detector.isDetected('arinc429Out')).toBe(true);
    });

    it('a pending detection waits its remaining delay across a jump back of an hour', () => {
        state.mainPageShown = true;
        tickAt(1000);
        random = 0.75; // 2 + 0.75 * 8 = 8 s
        failures.fail('rs232In');
        tickAt(1001); // Scheduled: 8 s from here
        tickAt(1004); // 3 s counted, 5 s left
        expect(detector.isDetected('rs232In')).toBe(false); // Precondition

        tickAt(1004 - 3600); // Counts nothing
        tickAt(1008 - 3600); // 4 s counted, 1 s left
        expect(detector.isDetected('rs232In')).toBe(false);
        tickAt(1009 - 3600);
        expect(detector.isDetected('rs232In')).toBe(true);
    });

    it('a pending detection waits its remaining delay across a jump ahead of hours', () => {
        state.mainPageShown = true;
        tickAt(1000);
        random = 0.75; // 8 s
        failures.fail('rs232In');
        tickAt(1001);
        tickAt(1004); // 5 s left

        tickAt(1004 + 5 * 3600); // Counts nothing
        expect(detector.isDetected('rs232In')).toBe(false);
        tickAt(1008 + 5 * 3600); // 1 s left
        expect(detector.isDetected('rs232In')).toBe(false);
        tickAt(1009 + 5 * 3600);
        expect(detector.isDetected('rs232In')).toBe(true);
    });

    it('counts a step of a minute and no larger one, as the trigger does', () => {
        state.mainPageShown = true;
        tickAt(1000);
        random = 0.75; // 8 s
        failures.fail('rs232In');
        tickAt(1001);
        tickAt(1001 + 60.5); // A jump: counts nothing
        expect(detector.isDetected('rs232In')).toBe(false);
        tickAt(1001 + 60.5 + 60); // A step of exactly a minute counts
        expect(detector.isDetected('rs232In')).toBe(true);
    });

    it('counts nothing for the time the ticks were stopped (hot swap)', () => {
        state.mainPageShown = true;
        tickAt(1000);
        random = 0.75; // 8 s
        failures.fail('rs232In');
        tickAt(1001);
        detector.onTicksStopped();
        tickAt(1030); // The first tick after the stop only sets the reference
        expect(detector.isDetected('rs232In')).toBe(false);
        tickAt(1037);
        expect(detector.isDetected('rs232In')).toBe(false);
        tickAt(1038);
        expect(detector.isDetected('rs232In')).toBe(true);
    });
});
