import {FuelUnit, KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {
    ClockEvents,
    EventBus,
    Facility,
    GeoPoint,
    GNSSEvents,
    GPSSatComputer,
    GPSSatComputerEvents,
    GPSSystemState,
    ICAO,
    LatLonInterface,
    Publisher,
    SimVarValueType,
    Unit,
    UnitFamily,
    UnitType,
    UserSetting,
} from "@microsoft/msfs-sdk";
import {pressureAlt2IndicatedAlt} from "./data/Conversions";
import {Celsius, Degrees, Feet, Inhg, Knots, NauticalMiles, Seconds} from "./data/Units";
import {TimeStamp} from "./data/Time";
import {PowerEvent, PowerEventData} from "./PowerButton";
import {KLN90BUserSettings} from "./settings/KLN90BUserSettings";
import {CalcTickable, TICK_TIME_CALC} from "./TickController";
import {AudioGenerator} from "./services/AudioGenerator";
import {MessageHandler, OneTimeMessage} from "./data/MessageHandler";
import {HOURS_TO_SECONDS} from "./data/navdata/NavCalculator";
import {NavMode} from "./data/VolatileMemory";

const SAVE_INTERVALL = 60000;

const MIN_GROUND_SPEED_FOR_TRACK = 2; //3-35

export interface GPSEvents {
    timeUpdatedEvent: TimeStamp; //This is fired if either the time was manually updated by the other or when the time was changed by more than 10 minutes
}

const NUM_STATE_CHANGES = 2;

const MAX_TIME_DIFF = 2 * HOURS_TO_SECONDS * 1000; //TTF may take up to 12 minutes if the clock is off by two hours
const MAX_POS_DIFF = 25; //TTF may take up to 12 minutes if the position differs by more than 25NM

export class GPS {
    public coords: GeoPoint;
    public trackTrue: Degrees = 0; //Consider accessing this via getTrackRespectingGroundspeed
    public groundspeed: Knots = 0;
    public timeZulu: TimeStamp;
    private lastCoords: GeoPoint;
    private intSaveCount = 0;
    private readonly takeHomeMode: boolean;
    private isStarted: boolean = false;

    public gpsSatComputer: GPSSatComputer;
    private clockPublisher: Publisher<ClockEvents>;
    private gnssPublisher: Publisher<GNSSEvents>;

    constructor(private bus: EventBus, private userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, private readonly messageHandler: MessageHandler) {
        this.gpsSatComputer = new GPSSatComputer(
            1,
            bus,
            'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_ephemeris.json',
            'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_sbas.json',
            5000,
            [],
        );
        bus.getSubscriber<GPSSatComputerEvents>().on('gps_system_state_changed_1').handle(state => {
            const valid = state === GPSSystemState.SolutionAcquired || state === GPSSystemState.DiffSolutionAcquired;
            if (valid) {
                this.gpsAcquired();
            }
        });
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.powerChanged.bind(this));

        this.clockPublisher = bus.getPublisher<ClockEvents>();
        this.gnssPublisher = bus.getPublisher<GNSSEvents>();

        this.gpsSatComputer.init();

        this.coords = new GeoPoint(
            userSettings.getSetting("lastLatitude").get(),
            userSettings.getSetting("lastLongitude").get(),
        );
        this.lastCoords = this.coords;
        this.takeHomeMode = options.takeHomeMode;


        //We assume that the internal clock kept the time fairly accurate since it has last been running
        const timeRandom = Math.random() * 5 - 2.5;
        //We subtract an hour, because the PowerButton assumes the device has been off for one our. Will be added back in powerChanged
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) + timeRandom - HOURS_TO_SECONDS);
        this.timeZulu = this.unixToTimestamp(unixTime);
    }

    tick() {
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
        const lat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
        const lon = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);
        const alt = SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Meters);

        if (this.takeHomeMode) {
            const distance = this.groundspeed / 60 / 60 / 1000 * TICK_TIME_CALC;

            this.coords = this.coords.offset(this.trackTrue, UnitType.NMILE.convertTo(distance, UnitType.GA_RADIAN));

            this.intSaveCount += TICK_TIME_CALC;
            if (this.intSaveCount >= SAVE_INTERVALL) {
                this.savePosition();
                this.intSaveCount = 0;
            }
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + TICK_TIME_CALC);
        } else {

            if (this.isStarted) {
                this.clockPublisher.pub('simTime', unixTime);
                this.gnssPublisher.pub('gps-position', new LatLongAlt(lat, lon, alt));
                this.gpsSatComputer.onUpdate();
            }

            if (this.isValid()) {
                this.lastCoords = this.coords;
                this.coords = new GeoPoint(
                    lat,
                    lon,
                );
                this.groundspeed = SimVar.GetSimVarValue('GROUND VELOCITY', SimVarValueType.Knots);

                if (this.groundspeed >= MIN_GROUND_SPEED_FOR_TRACK) {
                    //3-34 The manual mentions, that this can lag a bit, so this works for me
                    this.trackTrue = this.lastCoords.bearingTo(this.coords);
                }

                SimVar.SetSimVarValue('GPS POSITION LAT', SimVarValueType.Degree, this.coords.lat);
                SimVar.SetSimVarValue('GPS POSITION LON', SimVarValueType.Degree, this.coords.lon);

                this.intSaveCount += TICK_TIME_CALC;
                if (this.intSaveCount >= SAVE_INTERVALL) {
                    this.savePosition();
                    this.intSaveCount = 0;
                }
                this.timeZulu = this.unixToTimestamp(unixTime);
            } else {
                this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + TICK_TIME_CALC);
                /*
                    4-13:
                        If the present position flags (NAV flag) after being valid
                        in the NAV mode, the flight timer continues to run if
                        the groundspeed was more than 30 knots immediately
                        before the flag.
                    This means, the last values are keep the way they are when the signal becomes invalid.
                 */

            }
        }
    }

    /**
     * 3-32 The track is only shown, when the speed is sufficient. This method return null if it's not
     */
    public getTrackTrueRespectingGroundspeed(): Knots | null {
        return this.groundspeed >= MIN_GROUND_SPEED_FOR_TRACK ? this.trackTrue : null;
    }

    public startGPSSearch(): void {
        this.isStarted = true;
        this.recalcTTF();
    }

    /**
     * Recalculated the time to first fix, such as when the assumed position or time changes
     */
    public recalcTTF(): void {
        const ttf = this.getTimeToFirstFix();
        for (const sat of this.gpsSatComputer.sats) {
            const anySat = sat as any;
            let stateChangeTime;
            if (this.userSettings.getSetting("fastGpsAcquisition").get()) {
                stateChangeTime = (5 + (10 * Math.random())) * 1000; // 5 to 15 seconds like Working Title
            } else {
                const randomFactor = ttf / -2 + Math.random() * ttf * 1.5; //For 60 Seconds, this gives the range 30-120. 6 Minutes gives the range 3-12 minutes
                stateChangeTime = (ttf + randomFactor) * 1000 / NUM_STATE_CHANGES;
            }

            anySat.stateChangeTime = stateChangeTime; //A hack to lengthen the time for the transition to aquired
            anySat.stateChangeTimeRemaining = Math.min(anySat.stateChangeTimeRemaining, anySat.stateChangeTime);
        }
    }

    public isValid(): boolean {
        //todo this is not entirely correct. GPSSatComputer assumes navigation is only possible with 4 sats. 5-29 states that navigation may be possible with 3 sats when an altitude input is used in the solution
        return this.gpsSatComputer.state === GPSSystemState.SolutionAcquired || this.gpsSatComputer.state === GPSSystemState.DiffSolutionAcquired;
    }

    /**
     * 3-17 Normally 2 min, but 12 min if positon or time is wrong
     * @private
     */
    private getTimeToFirstFix(): Seconds {
        const lat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
        const lon = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);
        const actualPos = new GeoPoint(lat, lon);
        const actualTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));

        const posDist = UnitType.GA_RADIAN.convertTo(this.coords.distance(actualPos), UnitType.NMILE);
        const secondsDiff = Math.abs(this.timeZulu.getTimestamp() - actualTime);

        const ttf = (posDist / MAX_POS_DIFF + secondsDiff / MAX_TIME_DIFF) * 600;
        console.log("TTF", posDist, secondsDiff, ttf);
        return Utils.Clamp(ttf, 60, 600);
    }

    reset(): void {
        this.savePosition();
        this.gpsSatComputer.reset();
        this.isStarted = false;

        //we still keep all old values
    }

    public savePosition(): void {
        this.userSettings.getSetting("lastLatitude").set(this.coords.lat);
        this.userSettings.getSetting("lastLongitude").set(this.coords.lon);
    }

    private unixToTimestamp(unix: number): TimeStamp {
        return TimeStamp.create(unix);
    }

    private absoluteTimeToUNIXTime(absoluteTime: number): number {
        return (absoluteTime - 62135596800) * 1000;
    }

    private gpsAcquired() {
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
        const time = this.unixToTimestamp(unixTime);
        const pos = new GeoPoint(
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree),
        );

        if (UnitType.GA_RADIAN.convertTo(this.coords.distance(pos), UnitType.NMILE) > 2) {
            this.messageHandler.addMessage(new OneTimeMessage(["POSITION DIFFERS FROM", "LAST POSITION BY >2NM"]));
        }

        if (Math.abs(time.getTimestamp() - this.timeZulu.getTimestamp()) > 10 * 60 * 1000) {
            this.messageHandler.addMessage(new OneTimeMessage(["SYSTEM TIME UPDATED", "TO GPS TIME"]));
            this.bus.getPublisher<GPSEvents>().pub("timeUpdatedEvent", time);
        }

        this.timeZulu = time;
        this.coords = pos;

        //Position is now known, the rest of the satellites won't take long now
        this.recalcTTF();
    }

    private powerChanged(evt: PowerEventData) {
        if (evt.isPowered) {
            //Ticks are not running, when we are powered off
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + evt.timeSincePowerChange);
        }
    }
}

export class FuelComputer implements CalcTickable {

    public readonly numberOfEngines: null | 1 | 2 = null; //The KLN only knows 1 or 2
    public fob: number = 0;
    public fuelFlow1: number = 0;
    public fuelFlow2: number = 0;
    public fuelUsed1: number | null = null;
    public fuelUsed2: number | null = null;
    private readonly realNumberOfEngines: number = 0;

    constructor(private readonly options: KLN90PlaneSettings) {
        if (this.options.input.fuelComputer.isInterfaced) {
            this.realNumberOfEngines = SimVar.GetSimVarValue('NUMBER OF ENGINES', SimVarValueType.Number);
            this.numberOfEngines = this.realNumberOfEngines === 2 ? 2 : 1;
        }
    }

    public tick(): void {
        if (!this.options.input.fuelComputer.isInterfaced) {
            return;
        }

        let targetUnit: Unit<UnitFamily.Weight>;

        switch (this.options.input.fuelComputer.unit) {
            case FuelUnit.GAL:
                targetUnit = UnitType.GALLON_FUEL;
                break;
            case FuelUnit.IMP:
                targetUnit = UnitType.IMP_GALLON_FUEL;
                break;
            case FuelUnit.KG:
                targetUnit = UnitType.KILOGRAM;
                break;
            case FuelUnit.L:
                targetUnit = UnitType.LITER_FUEL;
                break;
            case FuelUnit.LB:
                targetUnit = UnitType.POUND;
                break;
        }

        if (this.options.input.fuelComputer.fobTransmitted) {
            this.fob = UnitType.POUND.convertTo(SimVar.GetSimVarValue('FUEL TOTAL QUANTITY WEIGHT', SimVarValueType.Pounds), targetUnit);
        }

        if (this.realNumberOfEngines === 2) {
            this.fuelFlow1 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('ENG FUEL FLOW PPH:1', SimVarValueType.PPH), targetUnit);
            this.fuelFlow2 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('ENG FUEL FLOW PPH:2', SimVarValueType.PPH), targetUnit);

            if (this.options.input.fuelComputer.fuelUsedTransmitted) {
                this.fuelUsed1 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('GENERAL ENG FUEL USED SINCE START:1', SimVarValueType.Pounds), targetUnit);
                this.fuelUsed2 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('GENERAL ENG FUEL USED SINCE START:2', SimVarValueType.Pounds), targetUnit);
            }
        } else {
            this.fuelFlow1 = 0;
            for (let i = 1; i <= this.realNumberOfEngines; i++) {
                this.fuelFlow1 += UnitType.POUND.convertTo(SimVar.GetSimVarValue(`ENG FUEL FLOW PPH:${i}`, SimVarValueType.PPH), targetUnit);
            }

            if (this.options.input.fuelComputer.fuelUsedTransmitted) {
                this.fuelUsed1 = 0;
                for (let i = 1; i <= this.realNumberOfEngines; i++) {
                    this.fuelUsed1 += UnitType.POUND.convertTo(SimVar.GetSimVarValue(`GENERAL ENG FUEL USED SINCE START:${i}`, SimVarValueType.Pounds), targetUnit);
                }
            }
        }
    }


    public reset() {
        this.fob = 0;
    }
}


export class Airdata implements CalcTickable {
    public barometer: Inhg = 29.92;
    public tas: Knots = 0;
    public mach: number = 0;
    public sat: Celsius = 0;
    public tat: Celsius = 0;
    public pressureAltitude: Feet | null = null;

    private barometersetting: UserSetting<number>;

    constructor(private readonly userSettings: KLN90BUserSettings, private readonly options: KLN90PlaneSettings) {
        this.barometersetting = userSettings.getSetting("barosetting");
        this.barometer = this.barometersetting.get();

    }

    public tick(): void {
        this.barometersetting.set(this.barometer); //Not expensive, when the value doesn't change

        if (!this.options.input.airdata.isInterfaced) {
            if (this.options.input.altimeterInterfaced) {
                //Gray Code. Not very precise
                this.pressureAltitude = Math.round(SimVar.GetSimVarValue('PRESSURE ALTITUDE', SimVarValueType.Feet) / 100) * 100;
            }
            return;
        }
        switch (this.options.input.airdata.baroSource) {
            case 1:
                this.barometer = SimVar.GetSimVarValue('KOHLSMAN SETTING HG:1', SimVarValueType.InHG);
                break;
            case 2:
                this.barometer = SimVar.GetSimVarValue('KOHLSMAN SETTING HG:2', SimVarValueType.InHG);
                break;
        }


        this.pressureAltitude = SimVar.GetSimVarValue('PRESSURE ALTITUDE', SimVarValueType.Feet);

        this.tas = SimVar.GetSimVarValue('AIRSPEED TRUE', SimVarValueType.Knots);
        this.mach = SimVar.GetSimVarValue('AIRSPEED MACH', SimVarValueType.Mach);
        this.sat = SimVar.GetSimVarValue('AMBIENT TEMPERATURE', SimVarValueType.Celsius);
        this.tat = SimVar.GetSimVarValue('TOTAL AIR TEMPERATURE', SimVarValueType.Celsius);
    }

    public getIndicatedAlt(): Feet | null {
        if (this.pressureAltitude === null) {
            return null;
        }

        return pressureAlt2IndicatedAlt(this.pressureAltitude, this.barometer);
    }
}

export class SensorsIn implements CalcTickable {

    public obsMag: number | null = null;
    public readonly gps: GPS;
    public headingGyro: Degrees | null = null; //Depends on how the user sets the gyro, but likely magnetic
    public gpsIsNavSource: boolean = false;
    public fuelComputer: FuelComputer;
    public airdata: Airdata;


    constructor(bus: EventBus, private readonly userSettings: KLN90BUserSettings, private readonly options: KLN90PlaneSettings, messageHandler: MessageHandler) {
        this.gps = new GPS(bus, userSettings, options, messageHandler);
        this.fuelComputer = new FuelComputer(options);
        this.airdata = new Airdata(userSettings, options);
    }

    tick() {
        this.gpsIsNavSource = SimVar.GetSimVarValue('GPS DRIVES NAV1', SimVarValueType.Bool);

        if (this.gpsIsNavSource) {
            switch (this.options.input.obsSource) {
                case 1:
                    this.obsMag = SimVar.GetSimVarValue('Nav OBS:1', SimVarValueType.Degree);
                    break;
                case 2:
                    this.obsMag = SimVar.GetSimVarValue('Nav OBS:2', SimVarValueType.Degree);
                    break;
            }
        } else {
            //The manual implies, that this can only be read, when the GPS is the nav source
            this.obsMag = null;
        }

        if (this.options.input.headingInput) {
            this.headingGyro = SimVar.GetSimVarValue('PLANE HEADING DEGREES GYRO', SimVarValueType.Degree);
        }

        this.gps.tick();
        this.fuelComputer.tick();
        this.airdata.tick();
    }

    public reset() {
        this.gps.reset();
        this.fuelComputer.reset();
    }

}

export class SensorsOut {

    public obsOut: number | null = null;

    constructor(private readonly options: KLN90PlaneSettings, public readonly audioGenerator: AudioGenerator) {
        this.reset();
    }

    public setObs(obsMag: number | null) {
        this.obsOut = obsMag;
        if (obsMag !== null) {
            switch (this.options.output.obsTarget) {
                case 1:
                    SimVar.SetSimVarValue('VOR1_SET', SimVarValueType.Number, obsMag);
                    break;
                case 2:
                    SimVar.SetSimVarValue('VOR2_SET', SimVarValueType.Number, obsMag);
                    break;
            }
        }

        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (obsMag === null) {
            SimVar.SetSimVarValue('GPS OBS VALUE', SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue('GPS OBS VALUE', SimVarValueType.Degree, obsMag);
        }


    }

    public setMagvar(magvar: number) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        SimVar.SetSimVarValue('GPS MAGVAR', SimVarValueType.Radians, magvar);
    }

    public setXTK(xtk: number | null, scaling: number) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        SimVar.SetSimVarValue('GPS CDI SCALING', SimVarValueType.Meters, UnitType.NMILE.convertTo(scaling, UnitType.METER));
        if (xtk === null) {
            SimVar.SetSimVarValue('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, false);
            SimVar.SetSimVarValue('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, false);
            SimVar.SetSimVarValue('GPS WP CROSS TRK', SimVarValueType.Meters, 0);
        } else {
            SimVar.SetSimVarValue('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, true);
            SimVar.SetSimVarValue('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, true);
            SimVar.SetSimVarValue('GPS WP CROSS TRK', SimVarValueType.Meters, UnitType.NMILE.convertTo(-xtk, UnitType.METER));
        }

        //The KLN does not output vertical information
        SimVar.SetSimVarValue('GPS GSI SCALING', SimVarValueType.Meters, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ANGLE', SimVarValueType.Degree, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ANGLE ERROR', SimVarValueType.Degree, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ERROR', SimVarValueType.Meters, 0);
        SimVar.SetSimVarValue('GPS HAS GLIDEPATH', SimVarValueType.Bool, false);
    }

    public setDesiredTrack(dtkMag: number | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (dtkMag === null) {
            SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, 0);
            SimVar.SetSimVarValue('GPS COURSE TO STEER', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(dtkMag, UnitType.RADIAN));
            SimVar.SetSimVarValue('GPS COURSE TO STEER', SimVarValueType.Radians, UnitType.DEGREE.convertTo(dtkMag, UnitType.RADIAN));
        }
    }

    public setWpBearing(bearingMag: number | null, bearingTrue: number | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (bearingMag === null) {
            SimVar.SetSimVarValue('GPS WP BEARING', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(bearingMag, UnitType.RADIAN));
        }
        if (bearingTrue === null) {
            SimVar.SetSimVarValue('GPS WP TRUE BEARING', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP TRUE BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(bearingTrue, UnitType.RADIAN));
        }
    }

    public setDistance(distance: NauticalMiles | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (distance === null) {
            SimVar.SetSimVarValue('GPS WP DISTANCE', SimVarValueType.Meters, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP DISTANCE', SimVarValueType.Meters, UnitType.NMILE.convertTo(distance, UnitType.METER));
        }
    }

    public setPos(pos: LatLonInterface | null, speed: Knots | null, track: Degrees | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (pos === null) {
            SimVar.SetSimVarValue('GPS POSITION LAT', SimVarValueType.Degree, 0);
            SimVar.SetSimVarValue('GPS POSITION LON', SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue('GPS POSITION LAT', SimVarValueType.Degree, pos.lat);
            SimVar.SetSimVarValue('GPS POSITION LON', SimVarValueType.Degree, pos.lon);
        }
        if (speed === null) {
            SimVar.SetSimVarValue('GPS GROUND SPEED', SimVarValueType.MetersPerSecond, 0);
        } else {
            SimVar.SetSimVarValue('GPS GROUND SPEED', SimVarValueType.MetersPerSecond, UnitType.KNOT.convertTo(speed, UnitType.MPS));
        }
        if (track === null) {
            SimVar.SetSimVarValue('GPS GROUND TRUE TRACK', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS GROUND TRUE TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(track, UnitType.RADIAN));
        }
    }

    public setWPTETE(ete: Seconds | null, eta: Seconds | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (ete === null) {
            SimVar.SetSimVarValue('GPS WP ETE', SimVarValueType.Seconds, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP ETE', SimVarValueType.Seconds, ete);
        }
        if (eta === null) {
            SimVar.SetSimVarValue('GPS WP ETA', SimVarValueType.Seconds, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP ETA', SimVarValueType.Seconds, eta);
        }
    }

    public setDestETE(ete: Seconds | null, eta: Seconds | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (ete === null) {
            SimVar.SetSimVarValue('GPS ETE', SimVarValueType.Seconds, 0);
        } else {
            SimVar.SetSimVarValue('GPS ETE', SimVarValueType.Seconds, ete);
        }
        if (eta === null) {
            SimVar.SetSimVarValue('GPS ETA', SimVarValueType.Seconds, 0);
        } else {
            SimVar.SetSimVarValue('GPS ETA', SimVarValueType.Seconds, eta);
        }
    }

    public setWPIndex(index: number, countTotal: number) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        SimVar.SetSimVarValue('GPS FLIGHT PLAN WP COUNT', SimVarValueType.Number, countTotal);
        SimVar.SetSimVarValue('GPS FLIGHT PLAN WP INDEX', SimVarValueType.Number, index + 1);
    }

    public setNextWpt(wpt: Facility | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (wpt === null) {
            SimVar.SetSimVarValue('GPS WP NEXT ID', SimVarValueType.String, '');
            SimVar.SetSimVarValue('GPS WP NEXT LAT', SimVarValueType.Degree, 0);
            SimVar.SetSimVarValue('GPS WP NEXT LON', SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP NEXT ID', SimVarValueType.String, ICAO.getIdent(wpt.icao));
            SimVar.SetSimVarValue('GPS WP NEXT LAT', SimVarValueType.Degree, wpt.lat);
            SimVar.SetSimVarValue('GPS WP NEXT LON', SimVarValueType.Degree, wpt.lon);
        }
    }

    public setPrevWpt(wpt: Facility | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (wpt === null) {
            SimVar.SetSimVarValue('GPS WP PREV VALID', SimVarValueType.Bool, false);
            SimVar.SetSimVarValue('GPS WP PREV ID', SimVarValueType.String, '');
            SimVar.SetSimVarValue('GPS WP PREV LAT', SimVarValueType.Degree, 0);
            SimVar.SetSimVarValue('GPS WP PREV LON', SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP PREV VALID', SimVarValueType.Bool, true);
            SimVar.SetSimVarValue('GPS WP PREV ID', SimVarValueType.String, ICAO.getIdent(wpt.icao));
            SimVar.SetSimVarValue('GPS WP PREV LAT', SimVarValueType.Degree, wpt.lat);
            SimVar.SetSimVarValue('GPS WP PREV LON', SimVarValueType.Degree, wpt.lon);
        }
    }

    public setMode(mode: NavMode) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }

        switch (mode) {
            case NavMode.ENR_LEG:
                SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, false);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, 0);
                break;
            case NavMode.ENR_OBS:
                SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, false);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, 0);
                break;
            case NavMode.ARM_LEG:
                SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, 1);
                break;
            case NavMode.ARM_OBS:
                SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, 1);
                break;
            case NavMode.APR_LEG:
                SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, 2);
                break

        }
    }

    public reset() {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }

        SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, true);

        this.setXTK(null, 5);
        this.setObs(null);
        this.setMagvar(0);
        this.setDesiredTrack(null);
        this.setWpBearing(null, null);
        this.setDistance(null);
        this.setWPTETE(null, null);
        this.setDestETE(null, null);
        this.setPos(null, null, null);
        this.setWPIndex(0, 0);
        this.setPrevWpt(null);
        this.setNextWpt(null);
        this.setMode(NavMode.ENR_LEG);
    }
}


export class Sensors implements CalcTickable {

    public in: SensorsIn;
    public out: SensorsOut;


    constructor(bus: EventBus, userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, audioGenerator: AudioGenerator, messageHandler: MessageHandler) {
        this.in = new SensorsIn(bus, userSettings, options, messageHandler);
        this.out = new SensorsOut(options, audioGenerator);

        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.reset.bind(this));
    }


    tick() {
        this.in.tick();
    }

    private reset() {
        this.in.reset();
        this.out.reset();
    }

}