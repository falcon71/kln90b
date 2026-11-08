import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {Failures} from '../../../kln90b/failures/Failures';
import {ReceiverView, GpsFailures, FAULT_SWITCH_S} from '../../../kln90b/failures/GpsFailures';
import {GpsGeometry} from '../../../kln90b/GpsSolution';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';

function plane(takeHomeMode: boolean): KLN90PlaneSettings {
    return {
        takeHomeMode, basePath: '', debugMode: false, vfrOnly: false,
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

const deg = (d: number) => d * Math.PI / 180;

/** A satellite at the given elevation */
function sat(prn: number, elevationDeg: number, state: GPSSatelliteState = GPSSatelliteState.InUse): GPSSatellite {
    const zenith = deg(90 - elevationDeg);
    return {prn, position: {get: () => Float64Array.of(zenith, 0)}, state: {get: () => state}} as unknown as GPSSatellite;
}

let sats: GPSSatellite[];
let solutionPrns: number[];
let solution: GpsGeometry;
let valid: boolean;
let settings: ReturnType<typeof KLN90BFailureSettings.getManager>;
let failures: Failures;
let gf: GpsFailures;

function build(takeHome = false, random: () => number = () => 0.5) {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    const bus = new EventBus();
    settings = KLN90BFailureSettings.getManager(bus);
    failures = new Failures(bus, settings, plane(takeHome));
    const receiver: ReceiverView = {
        satellites: () => sats,
        solutionPrns: () => solutionPrns,
        get solution() {
            return solution;
        },
        isValid: () => valid,
    };
    gf = new GpsFailures(bus, failures, receiver, takeHome, random);
}

function run(fromS: number, toS: number) {
    for (let t = fromS; t <= toS; t++) {
        gf.tick(t);
    }
}

beforeEach(() => {
    sats = [sat(1, 10), sat(2, 30), sat(3, 3, GPSSatelliteState.None)];
    solutionPrns = [];
    solution = {} as GpsGeometry;
    valid = true;
    build();
});

describe('GpsFailures receiver failures', () => {
    it('nothing failed: no receiver failure', () => {
        gf.tick(0);
        gf.tick(1);
        expect(gf.receiverFailed).toBe(false);
    });

    it('gpsAntenna is a receiver failure', () => {
        failures.fail('gpsAntenna');
        expect(gf.receiverFailed).toBe(true);
    });

    it('gpsReceiver is a receiver failure', () => {
        failures.fail('gpsReceiver');
        expect(gf.receiverFailed).toBe(true);
    });

    it('with both receiver failures, repairing one leaves the receiver failed; repairing both ends it', () => {
        failures.fail('gpsAntenna');
        failures.fail('gpsReceiver');
        failures.repair('gpsAntenna');
        expect(gf.receiverFailed).toBe(true);
        failures.repair('gpsReceiver');
        expect(gf.receiverFailed).toBe(false);
    });

    it('take-home mode has no receiver failures', () => {
        build(true);
        failures.fail('gpsAntenna');
        expect(gf.receiverFailed).toBe(false);
    });
});

describe('GpsFailures faulty satellite', () => {
    function storedFault(): { prn: number, biasM: number, rampS: number, elapsedS: number } {
        return JSON.parse(settings.getSetting('failure_faultySatellite').get());
    }

    function storeFault(text: string) {
        settings.getSetting('failure_faultySatellite').set(text);
    }

    function good(measurements = 6, maxSlope = 1): GpsGeometry {
        return {valid: true, measurements, maxSlope} as GpsGeometry;
    }

    it('the constants of the design', () => {
        expect(FAULT_SWITCH_S).toBe(120);
    });

    it('without the failure there is no satellite and no bias', () => {
        solutionPrns = [1, 2];
        gf.tick(0);
        gf.tick(1);
        expect(gf.faultyPrn).toBeNull();
        expect(gf.faultyBiasM).toBe(0);
    });

    it('picks the highest satellite of the solution, not the highest in the sky', () => {
        sats = [sat(1, 10), sat(2, 30), sat(3, 60), sat(4, 45)];
        solutionPrns = [1, 2, 4];
        failures.fail('faultySatellite');
        expect(gf.faultyPrn).toBe(4);
        expect(storedFault().prn).toBe(4);
    });

    it('picks the satellite with the smallest zenith whatever the order of the solution', () => {
        sats = [sat(1, 10), sat(2, 30), sat(3, 30.1), sat(4, 12)];
        solutionPrns = [4, 3, 2, 1];
        failures.fail('faultySatellite');
        expect(gf.faultyPrn).toBe(3);
    });

    it('without a solution takes the highest satellite above 5 degrees', () => {
        sats = [sat(5, 5.5), sat(2, 4.99), sat(3, 3), sat(1, 5.01)];
        failures.fail('faultySatellite');
        expect(gf.faultyPrn).toBe(5);
        sats = [sat(1, 5.01), sat(2, 4.99), sat(3, 3)];
        build();
        failures.fail('faultySatellite');
        expect(gf.faultyPrn).toBe(1);
        sats = [sat(2, 4.99), sat(3, 3)];
        build();
        failures.fail('faultySatellite');
        expect(gf.faultyPrn).toBeNull();
    });

    it('without any satellite nothing is drawn; once there are some, the draw is made once', () => {
        sats = [];
        let draws = 0;
        gf.random = () => {
            draws++;
            return 0.5;
        };
        failures.fail('faultySatellite');
        gf.tick(0);
        gf.tick(1);
        expect(gf.faultyPrn).toBeNull();
        expect(gf.faultyBiasM).toBe(0);
        expect(draws).toBe(0);
        sats = [sat(7, 40)];
        gf.tick(2);
        expect(gf.faultyPrn).toBe(7);
        expect(draws).toBe(2);
        gf.tick(3);
        gf.tick(4);
        expect(draws).toBe(2);
        expect(storedFault()).toEqual({prn: 7, biasM: 1750, rampS: 210, elapsedS: 0});
    });

    it.each([[0, 1, 500, 300], [1, 0, 3000, 120], [0.5, 0.5, 1750, 210]])('draws the ranges: random %d then %d gives biasM %d, rampS %d', (r1, r2, biasM, rampS) => {
        const draws = [r1, r2];
        let i = 0;
        gf.random = () => draws[i++];
        solutionPrns = [2];
        failures.fail('faultySatellite');
        expect(storedFault()).toEqual({prn: 2, biasM, rampS, elapsedS: 0});
        expect(i).toBe(2);
    });

    it('the bias ramps linearly: 875 m after 105 s of the 210 s ramp, then holds at 1750', () => {
        solutionPrns = [2];
        failures.fail('faultySatellite');
        gf.tick(0);
        expect(gf.faultyBiasM).toBe(0);
        run(1, 105);
        expect(gf.faultyBiasM).toBeCloseTo(875, 9);
        run(106, 209);
        expect(gf.faultyBiasM).toBeCloseTo(1750 * 209 / 210, 9);
        run(210, 400);
        expect(gf.faultyBiasM).toBe(1750);
    });

    it('saves the progress every 10 s and once at the end', () => {
        storeFault('{"prn":2,"biasM":1000,"rampS":35,"elapsedS":0}');
        solutionPrns = [2];
        let writes = 0;
        const original = failures.setValues.bind(failures);
        failures.setValues = (key, values) => {
            writes++;
            original(key, values);
        };
        gf.tick(0);
        run(1, 9);
        expect(writes).toBe(0);
        gf.tick(10);
        expect(writes).toBe(1);
        expect(storedFault().elapsedS).toBe(10);
        run(11, 19);
        expect(writes).toBe(1);
        gf.tick(20);
        expect(storedFault().elapsedS).toBe(20);
        run(21, 34);
        expect(writes).toBe(3);
        gf.tick(35);
        expect(writes).toBe(4);
        expect(storedFault()).toEqual({prn: 2, biasM: 1000, rampS: 35, elapsedS: 35});
        run(36, 100);
        expect(writes).toBe(4);
    });

    it('continues the stored ramp from its progress', () => {
        storeFault('{"prn":2,"biasM":1000,"rampS":200,"elapsedS":50}');
        solutionPrns = [2];
        gf.tick(0);
        expect(gf.faultyPrn).toBe(2);
        expect(gf.faultyBiasM).toBe(250);
        gf.tick(1);
        expect(gf.faultyBiasM).toBe(255);
    });

    it('a step back, a jump of hours and the first tick after reset count nothing', () => {
        storeFault('{"prn":2,"biasM":1000,"rampS":200,"elapsedS":50}');
        solutionPrns = [2];
        gf.tick(1000);
        gf.tick(1001);
        expect(gf.faultyBiasM).toBeCloseTo(255, 9);
        gf.tick(900);
        expect(gf.faultyBiasM).toBeCloseTo(255, 9);
        gf.tick(900 + 7200);
        expect(gf.faultyBiasM).toBeCloseTo(255, 9);
        gf.tick(900 + 7201);
        expect(gf.faultyBiasM).toBeCloseTo(260, 9);
        //A step of 1 s, which would count without the reset
        gf.reset();
        gf.tick(900 + 7202);
        expect(gf.faultyBiasM).toBeCloseTo(260, 9);
        gf.tick(900 + 7203);
        expect(gf.faultyBiasM).toBeCloseTo(265, 9);
    });

    it.each([
        '{}', 'garbage', '{"prn":2,"biasM":"x","rampS":100,"elapsedS":3}', '{"prn":2,"biasM":1000,"rampS":0}',
        '{"biasM":1000,"rampS":100,"elapsedS":3}', '{"prn":null,"biasM":1000,"rampS":100}', '{"prn":2,"rampS":100}',
    ])('stored %s is drawn anew in the tick', text => {
        solutionPrns = [2];
        storeFault(text);
        expect(() => gf.tick(0)).not.toThrow();
        expect(storedFault()).toEqual({prn: 2, biasM: 1750, rampS: 210, elapsedS: 0});
    });

    it('a stored value without elapsedS starts at 0', () => {
        solutionPrns = [2];
        storeFault('{"prn":3,"biasM":1000,"rampS":100}');
        gf.tick(0);
        expect(gf.faultyPrn).toBe(3);
        expect(gf.faultyBiasM).toBe(0);
        gf.tick(1);
        expect(gf.faultyBiasM).toBe(10);
    });

    it('parses the stored values once, not at every tick', () => {
        solutionPrns = [2];
        failures.fail('faultySatellite');
        let reads = 0;
        const original = failures.values.bind(failures);
        failures.values = key => {
            reads++;
            return original(key);
        };
        run(0, 50);
        expect(reads).toBe(0);
    });

    it('a repair clears the satellite and the bias at once, and a new failure is drawn anew', () => {
        solutionPrns = [2];
        failures.fail('faultySatellite');
        run(0, 50);
        expect(gf.faultyBiasM).toBeGreaterThan(0);
        failures.repair('faultySatellite');
        expect(gf.faultyPrn).toBeNull();
        expect(gf.faultyBiasM).toBe(0);
        solutionPrns = [1];
        failures.fail('faultySatellite');
        expect(gf.faultyPrn).toBe(1);
        gf.tick(51);
        expect(gf.faultyBiasM).toBeCloseTo(1750 / 210, 9);
    });

    it('clears a stale cache when the failure is no longer effective, without an event', () => {
        solutionPrns = [2];
        failures.fail('faultySatellite');
        run(0, 10);
        settings.getSetting('failure_faultySatellite').set('');
        gf.tick(11);
        expect(gf.faultyPrn).toBeNull();
        expect(gf.faultyBiasM).toBe(0);
    });

    it('take-home mode has no faulty satellite', () => {
        build(true);
        solutionPrns = [2];
        failures.fail('faultySatellite');
        run(0, 100);
        expect(gf.faultyPrn).toBeNull();
        expect(gf.faultyBiasM).toBe(0);
    });

    it('take-home mode: nothing is drawn or readable even before a tick', () => {
        build(true);
        solutionPrns = [1, 2, 3, 4, 5];
        solution = good();
        failures.fail('faultySatellite');
        expect(gf.faultyPrn).toBeNull();
        expect(gf.faultyBiasM).toBe(0);
    });

    it('a stored text cleared without an event is not readable before the next tick', () => {
        solutionPrns = [1, 2, 3, 4, 5];
        solution = good();
        storeFault('{"prn":2,"biasM":1000,"rampS":100,"elapsedS":100}');
        gf.tick(0);
        expect(gf.faultyPrn).toBe(2);
        expect(gf.faultyBiasM).toBe(1000);
        settings.getSetting('failure_faultySatellite').set('');
        expect(gf.faultyPrn).toBeNull();
        expect(gf.faultyBiasM).toBe(0);
    });

    it('with unusable stored values and no satellite, the text is parsed once and only the pick is retried', () => {
        sats = [];
        storeFault('{}');
        let reads = 0;
        const original = failures.values.bind(failures);
        failures.values = key => {
            reads++;
            return original(key);
        };
        run(0, 20);
        expect(reads).toBe(1);
        expect(gf.faultyPrn).toBeNull();
        sats = [sat(7, 40)];
        gf.tick(21);
        expect(gf.faultyPrn).toBe(7);
        expect(reads).toBe(1);
        expect(storedFault()).toEqual({prn: 7, biasM: 1750, rampS: 210, elapsedS: 0});
    });

    it('a ramp loaded finished is not saved again; one loaded mid-way saves after 10 s of progress, not before', () => {
        solutionPrns = [2];
        let writes = 0;
        const wrap = () => {
            const original = failures.setValues.bind(failures);
            failures.setValues = (key, values) => {
                writes++;
                original(key, values);
            };
        };
        wrap();
        storeFault('{"prn":2,"biasM":1000,"rampS":100,"elapsedS":100}');
        run(0, 50);
        expect(writes).toBe(0);
        build();
        wrap();
        solutionPrns = [2];
        storeFault('{"prn":2,"biasM":1000,"rampS":1000,"elapsedS":500}');
        run(0, 9);
        expect(writes).toBe(0);
        gf.tick(10);
        expect(writes).toBe(1);
        expect(storedFault().elapsedS).toBe(510);
    });

    describe('another satellite', () => {
        beforeEach(() => {
            sats = [sat(1, 80), sat(2, 60), sat(3, 40)];
            solutionPrns = [1, 2, 3];
            failures.fail('faultySatellite');
            gf.tick(0);
        });

        it('out of the solution for 119 s with a fix keeps the satellite, 120 s switches and redraws', () => {
            expect(gf.faultyPrn).toBe(1);
            solutionPrns = [2, 3];
            gf.random = () => 0;
            run(1, 119);
            expect(gf.faultyPrn).toBe(1);
            gf.tick(120);
            expect(gf.faultyPrn).toBe(2);
            expect(storedFault()).toEqual({prn: 2, biasM: 500, rampS: 120, elapsedS: 0});
            expect(gf.faultyBiasM).toBe(0);
        });

        it('the new draw counts again: another 120 s without it switches once more, not before', () => {
            solutionPrns = [2, 3];
            run(1, 120);
            expect(gf.faultyPrn).toBe(2);
            solutionPrns = [3];
            run(121, 239);
            expect(gf.faultyPrn).toBe(2);
            gf.tick(240);
            expect(gf.faultyPrn).toBe(3);
        });

        it('300 s out of the solution without a fix does not switch, and the count is held, not reset', () => {
            solutionPrns = [2, 3];
            run(1, 100);
            valid = false;
            run(101, 400);
            expect(gf.faultyPrn).toBe(1);
            valid = true;
            run(401, 419);
            expect(gf.faultyPrn).toBe(1);
            gf.tick(420);
            expect(gf.faultyPrn).toBe(2);
        });

        it('a short dropout does not switch: 60 s out, 1 s back in, 60 s out', () => {
            solutionPrns = [2, 3];
            run(1, 60);
            solutionPrns = [1, 2, 3];
            gf.tick(61);
            solutionPrns = [2, 3];
            run(62, 121);
            expect(gf.faultyPrn).toBe(1);
            run(122, 180);
            expect(gf.faultyPrn).toBe(1);
            gf.tick(181);
            expect(gf.faultyPrn).toBe(2);
        });

        it('in the solution it never switches', () => {
            run(1, 1000);
            expect(gf.faultyPrn).toBe(1);
        });

        it('a jump of the sim clock counts nothing toward the switch', () => {
            solutionPrns = [2, 3];
            run(1, 60);
            gf.tick(60 + 7200);
            gf.tick(61 + 7200);
            expect(gf.faultyPrn).toBe(1);
            run(62 + 7200, 119 + 7200);
            expect(gf.faultyPrn).toBe(1);
            gf.tick(120 + 7200);
            expect(gf.faultyPrn).toBe(2);
        });

        it('the count is runtime only: a reset restarts it', () => {
            solutionPrns = [2, 3];
            run(1, 100);
            gf.reset();
            run(1000, 1119);
            expect(gf.faultyPrn).toBe(1);
        });

        it('a fix but an empty solution: the sky pick is the same satellite, so nothing is redrawn', () => {
            solutionPrns = [];
            gf.random = () => 0;
            run(1, 300);
            expect(gf.faultyPrn).toBe(1);
            expect(storedFault().biasM).toBe(1750);
            expect(storedFault().rampS).toBe(210);
        });
    });
});
