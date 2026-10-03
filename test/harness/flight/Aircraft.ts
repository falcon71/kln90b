import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {FakeSim} from '../sim/FakeSim';
import {norm360} from './geo';

const G = 9.80665;
const KNOT_MPS = 1852 / 3600;
const RAD = Math.PI / 180;

export interface AircraftInit {
    lat: number;
    lon: number;
    altitudeFt: number;
    groundspeedKt: number;
    trackTrue: number;
}

export interface AircraftOptions {
    /** Default 5°/s, the roll rate KLNNavmath assumes for turn anticipation */
    rollRateDegPerS?: number;
    /** Default 25° (MAX_BANK_ANGLE in NavCalculator.ts) */
    maxBankDeg?: number;
}

/**
 * A point mass flying coordinated turns at constant ground speed and altitude, with no wind. Bank is positive to the
 * right.
 */
export class Aircraft {
    public lat: number;
    public lon: number;
    public altitudeFt: number;
    public groundspeedKt: number;
    public trackTrue: number;
    public bankDeg = 0;
    private readonly rollRate: number;
    private readonly maxBank: number;

    constructor(init: AircraftInit, opts: AircraftOptions = {}) {
        this.lat = init.lat;
        this.lon = init.lon;
        this.altitudeFt = init.altitudeFt;
        this.groundspeedKt = init.groundspeedKt;
        this.trackTrue = init.trackTrue;
        this.rollRate = opts.rollRateDegPerS ?? 5;
        this.maxBank = opts.maxBankDeg ?? 25;
    }

    /**
     * Advances the aircraft.
     * @param dt seconds
     * @param commandedBankDeg positive = right
     */
    public step(dt: number, commandedBankDeg: number): void {
        const target = Math.max(-this.maxBank, Math.min(this.maxBank, commandedBankDeg));
        const maxChange = this.rollRate * dt;
        this.bankDeg += Math.max(-maxChange, Math.min(maxChange, target - this.bankDeg));
        const v = this.groundspeedKt * KNOT_MPS;
        if (v > 0.1) {
            const turnRateDeg = G * Math.tan(this.bankDeg * RAD) / v / RAD;
            this.trackTrue = norm360(this.trackTrue + turnRateDeg * dt);
        }
        this.moveAlongTrack(this.groundspeedKt * dt / 3600);
    }

    /** Moves along the current great circle and updates the track to the course at the new position. */
    public moveAlongTrack(nm: number): void {
        if (nm <= 0) return;
        const start = new GeoPoint(this.lat, this.lon);
        const end = new GeoPoint(this.lat, this.lon).offset(this.trackTrue, UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN));
        this.lat = end.lat;
        this.lon = end.lon;
        this.trackTrue = norm360(end.bearingTo(start) + 180);
    }

    /**
     * Writes the sim variables the unit reads (Sensors.ts, Gps.ts).
     * @param sim
     * @param magvar degrees east, for the gyro heading
     */
    public writeTo(sim: FakeSim, magvar: number): void {
        sim.set('PLANE LATITUDE', 'degrees', this.lat);
        sim.set('PLANE LONGITUDE', 'degrees', this.lon);
        sim.set('PLANE ALTITUDE', 'feet', this.altitudeFt);
        sim.set('PRESSURE ALTITUDE', 'feet', this.altitudeFt);
        sim.set('GROUND VELOCITY', 'knots', this.groundspeedKt);
        sim.set('AIRSPEED TRUE', 'knots', this.groundspeedKt);
        sim.set('PLANE HEADING DEGREES TRUE', 'degrees', this.trackTrue);
        sim.set('PLANE HEADING DEGREES GYRO', 'degrees', norm360(this.trackTrue - magvar));
        sim.set('PLANE BANK DEGREES', 'degrees', this.bankDeg);
        sim.set('GPS DRIVES NAV1', 'bool', true);
    }
}
