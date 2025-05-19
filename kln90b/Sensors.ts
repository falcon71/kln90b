import {FuelType, FuelUnit, KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {
    EventBus,
    Facility,
    LatLonInterface,
    MagVar,
    NavMath,
    SimpleUnit,
    SimVarValueType,
    Unit,
    UnitFamily,
    UnitType,
    UserSetting,
} from "@microsoft/msfs-sdk";
import {pressureAlt2IndicatedAlt} from "./data/Conversions";
import {Celsius, Degrees, Feet, Inhg, Knots, NauticalMiles, Seconds} from "./data/Units";
import {PowerEvent} from "./PowerButton";
import {KLN90BUserSettings} from "./settings/KLN90BUserSettings";
import {CalcTickable} from "./TickController";
import {AudioGenerator} from "./services/AudioGenerator";
import {MessageHandler} from "./data/MessageHandler";
import {NavMode, TO} from "./data/VolatileMemory";
import {
    LVAR_ANNUN_TEST,
    LVAR_GPS_WP_BEARING,
    LVAR_HSI_TF_FLAGS,
    LVAR_MSG_LIGHT,
    LVAR_ROLL_COMMAND,
    LVAR_WPT_LIGHT,
} from "./LVars";
import {GPS} from "./Gps";
import {SignalOutputFilter} from "./services/SignalOutputFilter";


export class FuelComputer implements CalcTickable {

    public readonly numberOfEngines: null | 1 | 2 = null; //The KLN only knows 1 or 2
    public fob: number = 0;
    public fuelFlow1: number = 0;
    public fuelFlow2: number = 0;
    public fuelUsed1: number | null = null;
    public fuelUsed2: number | null = null;
    private readonly realNumberOfEngines: number = 0;


    public static readonly IMP_GALLON_FUEL_AVGAS = new SimpleUnit(UnitFamily.Weight, 'imperial gallon', 3.2685);
    public static readonly GALLON_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'gallon', 2.9484);
    public static readonly IMP_GALLON_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'imperial gallon', 3.5408);
    private static readonly LITER_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'liter', 0.7789);

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
                switch (this.options.input.fuelComputer.type) {
                    case FuelType.AVGAS:
                        targetUnit = UnitType.GALLON_AUTOGAS_FUEL;
                        break;
                    case FuelType.JET_A1:
                        targetUnit = UnitType.GALLON_FUEL;
                        break;
                    case FuelType.JET_B:
                        targetUnit = FuelComputer.GALLON_FUEL_JETB;
                        break;
                }
                break;
            case FuelUnit.IMP:
                switch (this.options.input.fuelComputer.type) {
                    case FuelType.AVGAS:
                        targetUnit = FuelComputer.IMP_GALLON_FUEL_AVGAS;
                        break;
                    case FuelType.JET_A1:
                        targetUnit = UnitType.IMP_GALLON_FUEL;
                        break;
                    case FuelType.JET_B:
                        targetUnit = FuelComputer.IMP_GALLON_FUEL_JETB;
                        break;
                }
                targetUnit = UnitType.IMP_GALLON_FUEL;
                break;
            case FuelUnit.KG:
                targetUnit = UnitType.KILOGRAM;
                break;
            case FuelUnit.L:
                switch (this.options.input.fuelComputer.type) {
                    case FuelType.AVGAS:
                        targetUnit = UnitType.LITER_AUTOGAS_FUEL;
                        break;
                    case FuelType.JET_A1:
                        targetUnit = UnitType.LITER_FUEL;
                        break;
                    case FuelType.JET_B:
                        targetUnit = FuelComputer.LITER_FUEL_JETB;
                        break;
                }
                break;
            case FuelUnit.LB:
                targetUnit = UnitType.POUND;
                break;
        }

        if (this.options.input.fuelComputer.fobTransmitted) {
            this.fob = UnitType.POUND.convertTo(SimVar.GetSimVarValue('FUEL TOTAL QUANTITY WEIGHT EX1', SimVarValueType.Pounds), targetUnit);
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


    constructor(bus: EventBus, userSettings: KLN90BUserSettings, private readonly options: KLN90PlaneSettings, messageHandler: MessageHandler) {
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

    private xtkFilter = new SignalOutputFilter();

    constructor(private readonly options: KLN90PlaneSettings, public readonly audioGenerator: AudioGenerator) {
        this.reset();
    }

    public setObs(obsMag: number | null) {
        this.obsOut = obsMag;
        if (obsMag !== null) {
            const gpsIsNavSource = SimVar.GetSimVarValue('GPS DRIVES NAV1', SimVarValueType.Bool);
            if (gpsIsNavSource) {
                switch (this.options.output.obsTarget) {
                    case 1:
                        SimVar.SetSimVarValue('K:VOR1_SET', SimVarValueType.Number, obsMag);
                        break;
                    case 2:
                        SimVar.SetSimVarValue('K:VOR2_SET', SimVarValueType.Number, obsMag);
                        break;
                }
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

    public setXTK(xtk: number | null, scaling: number) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        SimVar.SetSimVarValue('GPS CDI SCALING', SimVarValueType.Meters, UnitType.NMILE.convertTo(scaling, UnitType.METER));
        if (xtk === null) {
            this.xtkFilter.setValue(0);
            SimVar.SetSimVarValue('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, false);
            SimVar.SetSimVarValue('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, false);
        } else {
            this.xtkFilter.setValue(UnitType.NMILE.convertTo(-xtk, UnitType.METER));
            SimVar.SetSimVarValue('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, true);
            SimVar.SetSimVarValue('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, true);
        }

        //The KLN does not output vertical information
        SimVar.SetSimVarValue('GPS GSI SCALING', SimVarValueType.Meters, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ANGLE', SimVarValueType.Degree, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ANGLE ERROR', SimVarValueType.Degree, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ERROR', SimVarValueType.Meters, 0);
        SimVar.SetSimVarValue('GPS HAS GLIDEPATH', SimVarValueType.Bool, false);
    }

    public setToFrom(toFrom: boolean | null) {
        if (toFrom === null) {
            SimVar.SetSimVarValue(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, 0);
        } else {
            SimVar.SetSimVarValue(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, toFrom === TO ? 1 : 2);
        }
    }

    /**
     * The deviation bar signal is filtered by analog circuitry, so we set this more often
     */
    public setFilteredOutputs() {
        SimVar.SetSimVarValue('GPS WP CROSS TRK', SimVarValueType.Meters, this.xtkFilter.getCurrentValue());
    }

    public setDesiredTrack(dtkMag: number | null, actualTrack: number | null, magvar: number) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (dtkMag === null) {
            SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, 0);
            SimVar.SetSimVarValue('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(dtkMag, UnitType.RADIAN));
            if (actualTrack === null) {
                SimVar.SetSimVarValue('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, 0);
            } else {
                SimVar.SetSimVarValue('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, UnitType.DEGREE.convertTo(NavMath.diffAngle(MagVar.trueToMagnetic(actualTrack, magvar), dtkMag), UnitType.RADIAN));
            }
        }
    }

    public setWpBearing(bearingForAP: number | null, bearingToActive: number | null, magvar: number) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        if (bearingForAP === null) {
            SimVar.SetSimVarValue('GPS WP BEARING', SimVarValueType.Radians, 0);  //This SimVar appears to be readonly??
            SimVar.SetSimVarValue('GPS WP TRUE BEARING', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(bearingForAP, magvar), UnitType.RADIAN));  //This SimVar appears to be readonly??
            SimVar.SetSimVarValue('GPS WP TRUE BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(bearingForAP, UnitType.RADIAN));
        }
        if (bearingToActive === null) {
            SimVar.SetSimVarValue(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(bearingToActive, magvar), UnitType.RADIAN));
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

    public setPos(pos: LatLonInterface | null, speed: Knots | null, track: Degrees | null, magvar: number) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        SimVar.SetSimVarValue('GPS MAGVAR', SimVarValueType.Radians, UnitType.DEGREE.convertTo(magvar, UnitType.RADIAN));

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
            SimVar.SetSimVarValue('GPS GROUND MAGNETIC TRACK', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS GROUND TRUE TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(track, UnitType.RADIAN));
            SimVar.SetSimVarValue('GPS GROUND MAGNETIC TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(track, magvar), UnitType.RADIAN));
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
            SimVar.SetSimVarValue('GPS WP NEXT ID', SimVarValueType.String, wpt.icaoStruct.ident);
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
            SimVar.SetSimVarValue('GPS WP PREV ID', SimVarValueType.String, wpt.icaoStruct.ident);
            SimVar.SetSimVarValue('GPS WP PREV LAT', SimVarValueType.Degree, wpt.lat);
            SimVar.SetSimVarValue('GPS WP PREV LON', SimVarValueType.Degree, wpt.lon);
        }
    }

    public setMessageLight(lightOn: boolean) {
        SimVar.SetSimVarValue(LVAR_MSG_LIGHT, SimVarValueType.Bool, lightOn);
    }

    public setWptAlertLight(lightOn: boolean) {
        SimVar.SetSimVarValue(LVAR_WPT_LIGHT, SimVarValueType.Bool, lightOn);
    }

    public setAnnunTest(lightOn: boolean) {
        SimVar.SetSimVarValue(LVAR_ANNUN_TEST, SimVarValueType.Bool, lightOn);
    }

    /**
     *
     * @param mode
     * @param isSelfTestActive For selftest, we set GPS APPROACH MODE to 3, to signal that ARM AND APPR lights should
     * both light up on external annunciators. 3 is not used during normal operation
     * @param writeObs GPS OBS ACTIVE will become readonly when an external mode switch is installed
     */
    public setMode(mode: NavMode, isSelfTestActive: boolean, writeObs: boolean) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }

        switch (mode) {
            case NavMode.ENR_LEG:
                if (writeObs) {
                    //GPS OBS ACTIVE is marked writable in the docs, but appears to be readonly
                    SimVar.SetSimVarValue('K:GPS_OBS_OFF', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                }
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, false);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 0);
                break;
            case NavMode.ENR_OBS:
                if (writeObs) {
                    SimVar.SetSimVarValue('K:GPS_OBS_ON', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, true);
                }
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, false);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 0);
                break;
            case NavMode.ARM_LEG:
                if (writeObs) {
                    SimVar.SetSimVarValue('K:GPS_OBS_OFF', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                }
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 1);
                break;
            case NavMode.ARM_OBS:
                if (writeObs) {
                    SimVar.SetSimVarValue('K:GPS_OBS_ON', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, true);
                }
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 1);
                break;
            case NavMode.APR_LEG:
                if (writeObs) {
                    SimVar.SetSimVarValue('K:GPS_OBS_OFF', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                }
                SimVar.SetSimVarValue('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                SimVar.SetSimVarValue('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 2);
                break

        }
    }

    public setRollCommand(bankAngle: number | null, desiredHeading: number | null) {
        if (bankAngle === null) {
            SimVar.SetSimVarValue(LVAR_ROLL_COMMAND, SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue(LVAR_ROLL_COMMAND, SimVarValueType.Degree, bankAngle);
        }

        //The real KLN does not have this, but we do and there is a SimVar for this...
        if (desiredHeading === null) {
            SimVar.SetSimVarValue('GPS COURSE TO STEER', SimVarValueType.Number, 0);
        } else {
            SimVar.SetSimVarValue('GPS COURSE TO STEER', SimVarValueType.Number, UnitType.DEGREE.convertTo(desiredHeading, UnitType.RADIAN));
        }
    }

    public setGpsOverriden(): void {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }

        SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, true);
    }

    public reset() {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }

        this.setGpsOverriden();

        //Code disabled for now.
        //A CTD has been observed in the following conditions:
        //Starting a flight on the runway and setting L:KLN90B_Disabled to true right away
        //The sim crashes once hot swapping of other GPS units occur
        //The crash can be prevented by the following:
        //- Not setting GPS OVERRIDDEN to false when disabling the KLN (SimVarSync.setDisabled)
        //- Running TickController.tickCalc at least once before setting GPS OVERRIDDEN to false when disabling the KLN
        //- Or by not setting these GPS SimVars to 0
        //- The exact offending SimVar is unknown at this time
        /*
        this.setXTK(null, 5);
        this.setObs(null);
        this.setDesiredTrack(null, null, 0);
        this.setWpBearing(null, null);
        this.setDistance(null);
        this.setWPTETE(null, null);
        this.setDestETE(null, null);
        this.setPos(null, null, null, 0);
        this.setWPIndex(0, 0);
        this.setPrevWpt(null);
        this.setNextWpt(null);
        this.setMode(NavMode.ENR_LEG, false, !this.options.input.externalSwitches.legObsSwitchInstalled);
         */
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