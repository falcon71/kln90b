import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {Failures} from '../../../kln90b/failures/Failures';
import {GpsFailures, ReceiverView} from '../../../kln90b/failures/GpsFailures';
import {FailingMeasurement} from '../../../kln90b/failures/FailingMeasurement';
import {GpsMeasurement, MeasurementInputs} from '../../../kln90b/GpsMeasurement';
import {GpsGeometry} from '../../../kln90b/GpsSolution';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';

const R = 6378100;
const DEG = 180 / Math.PI;

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

/** An inner strategy with fixed outputs that records its calls */
class FakeInner implements GpsMeasurement {
    public lat = 47.5;
    public lon = 8.25;
    public groundspeedKt = 123;
    public trackTrue: number | null = 77;
    public calls: [number, number, number, MeasurementInputs][] = [];
    public restarts = 0;

    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        this.calls.push([simTimeS, truthLat, truthLon, inputs]);
    }

    public restart(): void {
        this.restarts++;
    }
}

let inner: FakeInner;
let failures: Failures;
let settings: ReturnType<typeof KLN90BFailureSettings.getManager>;
let gf: GpsFailures;
let fm: FailingMeasurement;

function inputs(prns: number[], coefficients: number[]): MeasurementInputs {
    return {geometry: {} as GpsGeometry, prns, coefficients: Float64Array.from(coefficients), indicatedAltitudeFt: null};
}

/** Faulty satellite 7 with a finished ramp of the given bias */
function faulty(biasM: number) {
    settings.getSetting('failure_faultySatellite').set(`{"prn":7,"biasM":${biasM},"rampS":100,"elapsedS":100}`);
    gf.tick(0);
}

beforeEach(() => {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    const bus = new EventBus();
    settings = KLN90BFailureSettings.getManager(bus);
    failures = new Failures(bus, settings, plane());
    const receiver: ReceiverView = {satellites: () => [], solutionPrns: () => [7], solution: {} as GpsGeometry, isValid: () => true};
    gf = new GpsFailures(bus, failures, receiver, false);
    inner = new FakeInner();
    fm = new FailingMeasurement(inner, gf);
});

describe('FailingMeasurement', () => {
    it('without the failure the outputs equal the inner ones exactly and the call is passed on', () => {
        const inp = inputs([7, 8], [0.8, 0.1, 0.2, 0.3, 0, 0]);
        fm.update(12, 47.4, 8.2, inp);
        expect(fm.lat).toBe(47.5);
        expect(fm.lon).toBe(8.25);
        expect(fm.groundspeedKt).toBe(123);
        expect(fm.trackTrue).toBe(77);
        expect(inner.calls).toHaveLength(1);
        expect(inner.calls[0][0]).toBe(12);
        expect(inner.calls[0][1]).toBe(47.4);
        expect(inner.calls[0][2]).toBe(8.2);
        expect(inner.calls[0][3]).toBe(inp);
    });

    it('a null track of the inner strategy stays null', () => {
        inner.trackTrue = null;
        fm.update(1, 47, 8, inputs([7], [1, 0, 0, 0]));
        expect(fm.trackTrue).toBeNull();
    });

    it('a satellite due north in row 1 moves the position south by coefficient times bias', () => {
        faulty(1000);
        fm.update(1, 47.4, 8.2, inputs([3, 7], [0.1, 0.1, 0.8, 0, 0, 0]));
        expect(fm.lat).toBeCloseTo(47.5 - 800 / R * DEG, 12);
        expect(fm.lon).toBe(8.25);
        expect(fm.groundspeedKt).toBe(123);
        expect(fm.trackTrue).toBe(77);
    });

    it('a satellite to the east moves the position west, scaled by cos(latitude)', () => {
        faulty(1000);
        fm.update(1, 47.4, 8.2, inputs([7], [0, 0.5, 0, 0]));
        expect(fm.lat).toBe(47.5);
        expect(fm.lon).toBeCloseTo(8.25 - 500 / (R * Math.cos(47.5 / DEG)) * DEG, 12);
    });

    it('a mixed row moves both axes with the sign flipped', () => {
        faulty(2000);
        fm.update(1, 47.4, 8.2, inputs([7], [-0.25, 0.5, 0, 0]));
        const lat = 47.5 + 500 / R * DEG;
        expect(fm.lat).toBeCloseTo(lat, 12);
        expect(fm.lon).toBeCloseTo(8.25 - 1000 / (R * Math.cos(lat / DEG)) * DEG, 12);
    });

    it('the bias is the ramped one', () => {
        settings.getSetting('failure_faultySatellite').set('{"prn":7,"biasM":1000,"rampS":100,"elapsedS":25}');
        gf.tick(0);
        fm.update(1, 47.4, 8.2, inputs([7], [1, 0, 0, 0]));
        expect(fm.lat).toBeCloseTo(47.5 - 250 / R * DEG, 12);
    });

    it('a faulty satellite that is not in the solution adds nothing', () => {
        faulty(1000);
        fm.update(1, 47.4, 8.2, inputs([3, 4], [0.5, 0.5, 0.5, 0.5, 0, 0]));
        expect(fm.lat).toBe(47.5);
        expect(fm.lon).toBe(8.25);
    });

    it('the error does not accumulate over updates', () => {
        faulty(1000);
        const inp = inputs([7], [1, 0, 0, 0]);
        fm.update(1, 47.4, 8.2, inp);
        fm.update(2, 47.4, 8.2, inp);
        expect(fm.lat).toBeCloseTo(47.5 - 1000 / R * DEG, 12);
    });

    it('the error is gone when the satellite leaves the solution', () => {
        faulty(1000);
        fm.update(1, 47.4, 8.2, inputs([7], [1, 0, 0, 0]));
        fm.update(2, 47.4, 8.2, inputs([3], [1, 0, 0, 0]));
        expect(fm.lat).toBe(47.5);
    });

    it('keeps the cos(latitude) floor near the pole', () => {
        faulty(1000);
        inner.lat = 90;
        fm.update(1, 90, 0, inputs([7], [0, 1, 0, 0]));
        expect(fm.lon).toBeCloseTo(8.25 - 1000 / (R * 1e-4) * DEG, 6);
    });

    it('restart passes through', () => {
        fm.restart();
        expect(inner.restarts).toBe(1);
    });
});
