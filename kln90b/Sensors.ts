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
import {PowerEvent, PowerEventData} from "./PowerSupply";
import {KLN90BUserSettings} from "./settings/KLN90BUserSettings";
import {CalcTickable} from "./TickController";
import {AudioGenerator} from "./services/AudioGenerator";
import {MessageHandler} from "./data/MessageHandler";
import {NavMode, TO} from "./data/VolatileMemory";
import {
    LVAR_ANNUN_TEST,
    LVAR_GPS_WP_BEARING,
    LVAR_HSI_TF_FLAGS,
    LVAR_INTEGRITY_WARNING,
    LVAR_MSG_LIGHT,
    LVAR_ROLL_COMMAND,
    LVAR_WPT_LIGHT,
    LVAR_XTK,
} from "./LVars";
import {GPS} from "./Gps";
import {GpsMeasurement} from "./GpsMeasurement";
import {AntennaAttitudeSource} from "./AntennaAttitude";
import {Failures} from "./failures/Failures";
import {Hardware} from "./Hardware";
import {SignalOutputFilter} from "./services/SignalOutputFilter";
import {Interconnect} from "./Interconnect";

//"Real unit:" comments say how a real KLN 90B takes in or puts out each value (#366):
//- P901 pins and RS-232 items: Installation manual 006-10521-0005 Rev 5. RS-232 is in appendix A: OUT on pin 13, IN on
//  pin 36, 9600 baud 8N1.
//- ARINC 429: the unit's labels are in the Installation manual 1-2 to 1-4, in GAMA format. Receivers: EFIS on pins 4/5,
//  radar graphics on pins 6/7, air data on pins 8/9. Transmitter: pins 23/24. The bit layouts are from GAMA Publication
//  No. 11 version 6.0 (2016), cited as "GAMA 11" with its printed page. That edition is newer than the unit, and
//  Honeywell does not document which bits the KLN 90B sets. Every word has bits 1-8 label, 9-10 SDI (unless the data
//  starts at bit 9), 30-31 SSM and 32 odd parity. The SSM, written as bits 31 30, depends on the word type (GAMA 11
//  page 27):
//  - BNR: 11 normal, 01 no computed data, 10 functional test, 00 failure warning. Bit 29 is the sign.
//  - BCD: 00 plus (North, East, right, to), 11 minus (South, West, left, from), 01 no computed data, 10 functional
//    test.
//  - discrete: 00 normal, 01 no computed data, 10 functional test, 11 failure warning. GAMA warns that many older
//    designs send 11 as normal on discrete words too, so which one the KLN 90B uses is unknown.
//  The self-test page would be the place for functional test; Honeywell does not say whether the unit sends it.
//- A "fictional" value has no counterpart on the real unit.

export class FuelComputer implements CalcTickable {

    public readonly numberOfEngines: null | 1 | 2 = null; //The KLN only knows 1 or 2
    /**
     * Null while a failed RS-232 input leaves the transmitted value missing (#458). A FOB the pilot entered stays a number
     */
    public fob: number | null = 0;
    /**
     * Null while a failed RS-232 input leaves it missing (#458)
     */
    public fuelFlow1: number | null = 0;
    /**
     * Null while a failed RS-232 input leaves it missing (#458). A single engine has none and keeps 0
     */
    public fuelFlow2: number | null = 0;
    public fuelUsed1: number | null = null;
    public fuelUsed2: number | null = null;
    private readonly realNumberOfEngines: number = 0;


    public static readonly GALLON_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'gallon', 2.9484);
    public static readonly IMP_GALLON_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'imperial gallon', 3.5408);
    private static readonly LITER_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'liter', 0.7789);

    constructor(private readonly options: KLN90PlaneSettings, private readonly interconnect: Interconnect) {
        if (this.options.input.fuelComputer.isInterfaced) {
            //Real unit: RS-232 IN, fuel/air data formats B, C and D. A single-engine aircraft sends asterisks in all
            //engine one and engine two fields (Installation manual A-11). Format A has no engine fields at all
            this.realNumberOfEngines = this.interconnect.rs232In.read('NUMBER OF ENGINES', SimVarValueType.Number);
            this.numberOfEngines = this.realNumberOfEngines === 2 ? 2 : 1;
        }
    }

    public tick(): void {
        if (!this.options.input.fuelComputer.isInterfaced) {
            return;
        }

        //Once per tick, not per SimVar (#458)
        const isReceiving = this.interconnect.rs232In.isReceiving;
        let targetUnit: Unit<UnitFamily.Weight>;

        switch (this.options.input.fuelComputer.unit) {
            case FuelUnit.GAL:
                switch (this.options.input.fuelComputer.type) {
                    case FuelType.AVGAS:
                        targetUnit = UnitType.GALLON_AUTOGAS_FUEL;
                        break;
                    case FuelType.JET_A1:
                        targetUnit = UnitType.GALLON_JET_A_FUEL;
                        break;
                    case FuelType.JET_B:
                        targetUnit = FuelComputer.GALLON_FUEL_JETB;
                        break;
                }
                break;
            case FuelUnit.IMP:
                switch (this.options.input.fuelComputer.type) {
                    case FuelType.AVGAS:
                        targetUnit = UnitType.IMP_GALLON_AUTOGAS_FUEL;
                        break;
                    case FuelType.JET_A1:
                        targetUnit = UnitType.IMP_GALLON_JET_A_FUEL;
                        break;
                    case FuelType.JET_B:
                        targetUnit = FuelComputer.IMP_GALLON_FUEL_JETB;
                        break;
                }
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
                        targetUnit = UnitType.LITER_JET_A_FUEL;
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

        //Real unit: RS-232 IN, fuel remaining: format A bytes 3-6, formats B, C and D bytes 3-8 (Installation manual A-10).
        //No ARINC 429 label carries fuel
        //A failed input leaves it missing, and a FOB the pilot entered is not a received value (#458)
        if (this.options.input.fuelComputer.fobTransmitted) {
            this.fob = isReceiving ? UnitType.POUND.convertTo(this.interconnect.rs232In.read('FUEL TOTAL QUANTITY WEIGHT EX1', SimVarValueType.Pounds), targetUnit) : null;
        }

        if (!isReceiving) {
            this.fuelFlow1 = null;
            this.fuelFlow2 = this.realNumberOfEngines === 2 ? null : 0;
            if (this.options.input.fuelComputer.fuelUsedTransmitted) {
                this.fuelUsed1 = null;
                this.fuelUsed2 = null;
            }
            return;
        }

        if (this.realNumberOfEngines === 2) {
            //Real unit: RS-232 IN, formats B, C and D: engine one fuel flow bytes 17-22, engine two bytes 24-29
            //(Installation manual A-11)
            this.fuelFlow1 = UnitType.POUND.convertTo(this.interconnect.rs232In.read('ENG FUEL FLOW PPH:1', SimVarValueType.PPH), targetUnit);
            this.fuelFlow2 = UnitType.POUND.convertTo(this.interconnect.rs232In.read('ENG FUEL FLOW PPH:2', SimVarValueType.PPH), targetUnit);

            //Real unit: RS-232 IN, formats B, C and D: engine one fuel used bytes 38-43, engine two bytes 45-50
            //(Installation manual A-11)
            if (this.options.input.fuelComputer.fuelUsedTransmitted) {
                this.fuelUsed1 = UnitType.POUND.convertTo(this.interconnect.rs232In.read('GENERAL ENG FUEL USED SINCE START:1', SimVarValueType.Pounds), targetUnit);
                this.fuelUsed2 = UnitType.POUND.convertTo(this.interconnect.rs232In.read('GENERAL ENG FUEL USED SINCE START:2', SimVarValueType.Pounds), targetUnit);
            }
        } else {
            //Real unit: RS-232 IN, total fuel flow: format A bytes 8-11, formats B, C and D bytes 10-15 (Installation
            //manual A-10)
            this.fuelFlow1 = 0;
            for (let i = 1; i <= this.realNumberOfEngines; i++) {
                this.fuelFlow1 += UnitType.POUND.convertTo(this.interconnect.rs232In.read(`ENG FUEL FLOW PPH:${i}`, SimVarValueType.PPH), targetUnit);
            }

            //Real unit: RS-232 IN, formats B, C and D, total fuel used bytes 31-36 (Installation manual A-11)
            if (this.options.input.fuelComputer.fuelUsedTransmitted) {
                this.fuelUsed1 = 0;
                for (let i = 1; i <= this.realNumberOfEngines; i++) {
                    this.fuelUsed1 += UnitType.POUND.convertTo(this.interconnect.rs232In.read(`GENERAL ENG FUEL USED SINCE START:${i}`, SimVarValueType.Pounds), targetUnit);
                }
            }
        }
    }


    /**
     * The fuel flow of all engines, null while a value is missing (#458)
     */
    public getTotalFuelFlow(): number | null {
        if (this.fuelFlow1 === null || this.fuelFlow2 === null) {
            return null;
        }
        return this.fuelFlow1 + this.fuelFlow2;
    }

    /**
     * The fuel used by all engines, null while a value is missing (#458)
     */
    public getTotalFuelUsed(): number | null {
        if (this.fuelUsed1 === null || (this.numberOfEngines === 2 && this.fuelUsed2 === null)) {
            return null;
        }
        return this.fuelUsed1 + (this.numberOfEngines === 2 ? this.fuelUsed2! : 0);
    }

    public reset() {
        this.fob = 0;
    }
}


export class Airdata implements CalcTickable {
    public barometer: Inhg = 29.92;
    //Null while a failed input leaves the value missing (#458)
    public tas: Knots | null = 0;
    public mach: number | null = 0;
    public sat: Celsius | null = 0;
    public tat: Celsius | null = 0;
    public pressureAltitude: Feet | null = null;

    private barometersetting: UserSetting<number>;

    constructor(private readonly userSettings: KLN90BUserSettings, private readonly options: KLN90PlaneSettings, private readonly interconnect: Interconnect) {
        this.barometersetting = userSettings.getSetting("barosetting");
        this.barometer = this.barometersetting.get();

    }

    public tick(): void {
        this.barometersetting.set(this.barometer); //Not expensive, when the value doesn't change

        if (!this.options.input.airdata.isInterfaced) {
            if (this.options.input.altimeterInterfaced) {
                //Gray Code. Not very precise
                //Real unit: gray code pressure altitude in 100 ft steps on P901 pins 41-50 = D4, A1, A2, A4, B1, B2, B4,
                //C1, C2, C4 (Installation manual 1-6, 2-7, figure 2-17 sheet 3 on 2-47)
                //A failed encoder leaves the altitude missing, and the receiver without its aiding (#458)
                this.pressureAltitude = this.interconnect.grayCode.isReceiving ?
                    Math.round(this.interconnect.grayCode.read('PRESSURE ALTITUDE', SimVarValueType.Feet) / 100) * 100 : null;
            }
            return;
        }
        //Real unit: RS-232 IN, format D, bytes 108-112 barometric setting in hundredths of inHg (Installation manual A-13).
        //No ARINC 429 input: the air data receiver takes no baro label (Installation manual 1-2), and GAMA 11 defines none
        //A failed RS-232 input is as if no baro were transmitted: the barometer keeps its value (#458)
        if (this.interconnect.rs232In.isReceiving) {
            switch (this.options.input.airdata.baroSource) {
                case 1:
                    this.barometer = this.interconnect.rs232In.read('KOHLSMAN SETTING HG:1', SimVarValueType.InHG);
                    break;
                case 2:
                    this.barometer = this.interconnect.rs232In.read('KOHLSMAN SETTING HG:2', SimVarValueType.InHG);
                    break;
            }
        }

        //A failed air data input leaves every value missing (#458)
        if (!this.interconnect.airdata.isReceiving) {
            this.pressureAltitude = null;
            this.tas = null;
            this.mach = null;
            this.sat = null;
            this.tat = null;
            return;
        }


        //Real unit: pressure altitude, one of
        //- ARINC 429 air data receiver, label 203 altitude (1013.25 mb) (Installation manual 1-2). GAMA 11 gives no
        //  layout for 203; it only lists the label and refers to ARINC 429 itself for it (GAMA 11 page 4-2)
        //- ARINC 429 air data receiver, label 204 baro-corrected altitude instead: BNR, bits 12-28 feet with 1 ft LSB, bit
        //  29 = 1 below sea level (GAMA 11 page 15). The ALT page then needs no baro (Installation manual 2-68)
        //- RS-232 IN, format C or D, bytes 64-69 pressure altitude in feet with a sign (Installation manual A-12), or
        //  format D bytes 114-119 baro-corrected altitude (A-13). The 429 value wins when both send it (A-11)
        //- without an air data computer: the gray code above
        this.pressureAltitude = this.interconnect.airdata.read('PRESSURE ALTITUDE', SimVarValueType.Feet);

        //Real unit: true airspeed, either
        //- ARINC 429 air data receiver, label 210: BNR, bits 14-28 knots with a 0.0625 kt LSB, bit 29 always 0 (GAMA 11
        //  page 16)
        //- RS-232 IN, format C or D, bytes 56-58 TAS in knots (Installation manual A-12)
        this.tas = this.interconnect.airdata.read('AIRSPEED TRUE', SimVarValueType.Knots);
        //Real unit: Mach, either
        //- ARINC 429 air data receiver, label 205 (Installation manual 1-2). GAMA 11 gives no layout for 205 and refers to
        //  ARINC 429 itself for it (GAMA 11 page 4-2)
        //- RS-232 IN, format C or D, bytes 60-62 Mach in thousandths (Installation manual A-12)
        this.mach = this.interconnect.airdata.read('AIRSPEED MACH', SimVarValueType.Mach);
        //Real unit: static air temperature, either
        //- ARINC 429 air data receiver, label 213: BNR, bits 18-28 deg C with a 0.25 deg LSB, bit 29 = 1 below zero (GAMA
        //  11 page 16)
        //- RS-232 IN, format C or D, bytes 104-106 SAT in deg C with a sign (Installation manual A-13)
        this.sat = this.interconnect.airdata.read('AMBIENT TEMPERATURE', SimVarValueType.Celsius);
        //Real unit: total air temperature, either
        //- ARINC 429 air data receiver, label 211 (Installation manual 1-2). GAMA 11 gives no layout for 211 and refers to
        //  ARINC 429 itself for it (GAMA 11 page 4-2)
        //- RS-232 IN, format C or D, bytes 78-80 TAT in deg C with a sign (Installation manual A-12)
        this.tat = this.interconnect.airdata.read('TOTAL AIR TEMPERATURE', SimVarValueType.Celsius);
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
    private headingAvailable: boolean;
    public headingGyro: Degrees | null = null; //Depends on how the user sets the gyro, but likely magnetic
    public gpsIsNavSource: boolean = false;
    public fuelComputer: FuelComputer;
    public airdata: Airdata;


    constructor(bus: EventBus, userSettings: KLN90BUserSettings, private readonly options: KLN90PlaneSettings, private readonly interconnect: Interconnect,
                messageHandler: MessageHandler, gpsMeasurement: GpsMeasurement, antenna: AntennaAttitudeSource, signalRandom: () => number,
                failures: Failures) {
        this.airdata = new Airdata(userSettings, options, interconnect);
        //5-29: the altitude input is a measurement of the GPS solution. Airdata reports none until its first tick
        this.gps = new GPS(bus, userSettings, options, messageHandler, () => this.airdata.getIndicatedAlt(), gpsMeasurement, antenna, signalRandom, failures);
        this.fuelComputer = new FuelComputer(options, interconnect);
        //Pages and selectors built before the first tick (a force-ready start) see the heading input already (#458)
        this.headingAvailable = this.readHeading();
    }

    tick() {
        //Real unit: P901 pin 1 GPS DISPLAYED. Open = an indicator's resolver is connected to the KLN, grounded = not
        //displayed. The NAV/GPS relay grounds it in the NAV position (Installation manual 1-6, 2-4, figure 2-17 sheets 4
        //to 6 on 2-49 to 2-53)
        this.gpsIsNavSource = this.interconnect.gpsDisplayed.read('GPS DRIVES NAV1', SimVarValueType.Bool);

        //Real unit: the selected course, either
        //- the OBS resolver of the CDI/HSI: P901 pin 26 sine in and pin 37 cosine in, excited by the 450 Hz of pin 31 OBS
        //  RESOLVER OUT (Installation manual 1-6, 1-7, 2-6)
        //- ARINC 429 EFIS receiver, label 100 selected course, from an EFIS or a KA 90 (Installation manual 1-2): BNR,
        //  bits 17-28 with a 180/4096 deg LSB, bit 29 = 1 for 180-360 deg (GAMA 11 page 10)
        //A failed resolver leaves the course missing: it is set on the unit, as with ObsSource 0 (#458)
        if (this.gpsIsNavSource) {
            const obsReceiving = this.interconnect.obs.isReceiving;
            switch (this.options.input.obsSource) {
                case 1:
                    this.obsMag = obsReceiving ? this.interconnect.obs.read('Nav OBS:1', SimVarValueType.Degree) : null;
                    break;
                case 2:
                    this.obsMag = obsReceiving ? this.interconnect.obs.read('Nav OBS:2', SimVarValueType.Degree) : null;
                    break;
                default: //0 ignores the external course, also after L:KLN90B_ObsSource switched to it at runtime
                    this.obsMag = null;
                    break;
            }
        } else {
            //The manual implies, that this can only be read, when the GPS is the nav source
            this.obsMag = null;
        }

        //Real unit: the heading (Installation manual 2-69), either
        //- ARINC 429 EFIS receiver, label 320 magnetic heading or label 314 true heading (Installation manual 1-2), from
        //  an EFIS 40/50 or a KA 90: BNR, bits 14-28 with a 180/32768 deg LSB, bit 29 = 1 for 180-360 deg (GAMA 11 pages 23,
        //  24)
        //- RS-232 IN, format C or D, bytes 100-102 magnetic heading (Installation manual A-13)
        //A failed RS-232 input leaves the heading missing, as without a heading input (#458)
        this.headingAvailable = this.readHeading();

        this.gps.tick();
        this.fuelComputer.tick();
        this.airdata.tick();
    }

    /**
     * Reads the heading into headingGyro, null without one, and returns whether one arrives
     */
    private readHeading(): boolean {
        if (this.options.input.headingInput && this.interconnect.heading.isReceiving) {
            this.headingGyro = this.interconnect.heading.read(this.options.input.headingSimVar, SimVarValueType.Degree); //PLANE HEADING DEGREES GYRO unless the aircraft names its own (#405)
            return true;
        }
        this.headingGyro = null; //The input can be switched off at runtime (#368)
        return false;
    }

    /**
     * Whether a heading arrives: the input is installed and its port receives, as of the last tick (or of the construction
     * before the first one). A failed RS-232 heading (#458) behaves as without a heading input (docs/failures.md, "RS-232
     * input"), so every consumer that keys on the presence of the heading asks this, not Input.HeadingInput
     */
    public isHeadingAvailable(): boolean {
        return this.headingAvailable;
    }

    public reset() {
        this.gps.reset();
        this.fuelComputer.reset();
    }

}

/**
 * What the D-bar pin puts out for the deviation the unit means to put out: the EEPROM's calibration (#459,
 * EepromCalibration), which changes it only while the EEPROM has failed
 */
export interface DbarOutput {
    /**
     * @param filtered The deviation the unit means to put out
     * @param fullScale The deviation of full scale in the same unit
     */
    dbarDeviation(filtered: number, fullScale: number): number;
}

/** No calibration error */
const EXACT_DBAR: DbarOutput = {dbarDeviation: v => v};

export class SensorsOut {

    public obsOut: number | null = null;

    private xtkFilter = new SignalOutputFilter();

    constructor(private readonly options: KLN90PlaneSettings, private readonly interconnect: Interconnect, public readonly audioGenerator: AudioGenerator, private readonly hardware: Hardware,
                private readonly dbar: DbarOutput = EXACT_DBAR) {
        //The boot claims the GPS SimVars, so a port failed in an earlier session writes its null state, as at a power
        //change (#458)
        this.interconnect.writeNullState('all', () => this.reset());
    }

    public setObs(obsMag: number | null) {
        this.obsOut = obsMag;
        if (obsMag !== null) {
            //Real unit: P901 pin 1 GPS DISPLAYED (see SensorsIn.tick)
            const gpsIsNavSource = this.interconnect.gpsDisplayed.read('GPS DRIVES NAV1', SimVarValueType.Bool);
            //Real unit: ARINC 429 transmitter, label 100 selected course #1 (Installation manual 1-3) to a remotely driven
            //course pointer: an EFIS directly, or an HSI through a KA 90 -0201/-0202 (KA 90 manual 1-2). BNR, bits 17-28
            //with a 180/4096 deg LSB, bit 29 = 1 for 180-360 deg, bit 11 = 1 when the LRN controls the course select
            //(GAMA 11 page 10). The KA 90 can also drive the pointer from label 114 desired track (KA 90 manual 1-2). The
            //KLN has no analog course output
            if (gpsIsNavSource) {
                switch (this.options.output.obsTarget) {
                    case 1:
                        this.interconnect.arinc429Tx.write('K:VOR1_SET', SimVarValueType.Number, obsMag);
                        break;
                    case 2:
                        this.interconnect.arinc429Tx.write('K:VOR2_SET', SimVarValueType.Number, obsMag);
                        break;
                }
            }
        }

        this.writeGpsObs(obsMag);
    }

    private writeGpsObs(obsMag: number | null) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: the OBS course, either
        //- ARINC 429 transmitter, label 100 selected course #1 (see setObs)
        //- RS-232 OUT, item I desired track, which in OBS mode is the course at the active waypoint, magnetic with its
        //  variation, in tenths of a degree (Installation manual A-5, A-6)
        if (obsMag === null) {
            gpsNavData.write('GPS OBS VALUE', SimVarValueType.Degree, 0);
        } else {
            gpsNavData.write('GPS OBS VALUE', SimVarValueType.Degree, obsMag);
        }
    }

    public setXTK(xtk: number | null, scaling: number) {
        //The LVar is an output of the unit (ARINC 429 label 116), independent of the GPS SimVars
        //Real unit: the cross track, either
        //- ARINC 429 transmitter, label 116 cross track distance: BNR, bits 14-28 nm with a 128/32768 nm LSB (bits 11-13 an
        //  optional finer extension), bit 29 = 1 fly right, 0 fly left. So a positive value is fly left, as in the LVar
        //  (GAMA 11 page 12)
        //- RS-232 OUT, item G cross track error: R or L for the aircraft right or left of course, then nm x 100
        //  (Installation manual A-5)
        this.interconnect.arinc429Tx.write(LVAR_XTK, SimVarValueType.NM, xtk ?? 0);
        this.xtkFilter.setValue(xtk === null ? 0 : -xtk, scaling);
        this.writeGpsXtk(xtk, scaling);
    }

    private writeGpsXtk(xtk: number | null, scaling: number) {
        const gpsAnalogNav = this.interconnect.gps(this.interconnect.analogNav);
        const gpsSuperflag = this.interconnect.gps(this.interconnect.superflag);
        const gpsSim = this.interconnect.gps(this.interconnect.sim);
        //Real unit: the CDI scale, either
        //- analog: the deviation voltage of P901 pin 22 against pin 25 is 30, 150 or 500 mV per nm for a full scale of 5,
        //  1 or 0.3 nm (Installation manual 1-7)
        //- ARINC 429 transmitter, label 326 lateral deviation scale factor: BNR, bits 14-28 full-scale deflection in nm
        //  with a 128/32768 nm LSB (GAMA 11 page 24)
        gpsAnalogNav.write('GPS CDI SCALING', SimVarValueType.Meters, UnitType.NMILE.convertTo(scaling, UnitType.METER));
        //Real unit: fictional, no output says whether there is an active waypoint. The nearest are the NAV flag (P901 pin
        //19 against pin 25, flag in view below 50 mV), the NAV superflag (P901 pin 18, invalid below 3.5 V) (Installation
        //manual 1-7, 2-5) and ARINC 429 label 275 bit 29 HSI valid, 0 = nav warning (GAMA 11 page 19). They go out on the
        //superflag port, so a failed superflag flags them (#459)
        if (xtk === null) {
            gpsSuperflag.write('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, false);
            gpsSuperflag.write('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, false);
        } else {
            gpsSuperflag.write('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, true);
            gpsSuperflag.write('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, true);
        }

        //The KLN does not output vertical information
        //Real unit: fictional, the unit has no vertical deviation output. Written as constants
        gpsSim.write('GPS GSI SCALING', SimVarValueType.Meters, 0);
        gpsSim.write('GPS VERTICAL ANGLE', SimVarValueType.Degree, 0);
        gpsSim.write('GPS VERTICAL ANGLE ERROR', SimVarValueType.Degree, 0);
        gpsSim.write('GPS VERTICAL ERROR', SimVarValueType.Meters, 0);
        gpsSim.write('GPS HAS GLIDEPATH', SimVarValueType.Bool, false);
    }

    public setToFrom(toFrom: boolean | null) {
        //Real unit: TO/FROM, any of
        //- analog: P901 pin 21 +TO against pin 20 +FROM, TO = +40 to +160 mV, FROM = -40 to -160 mV (Installation manual
        //  1-8, 2-5). The flagged state 0 shows on the NAV flag (pins 19/25) and the NAV
        //  superflag (pin 18) instead (Installation manual 1-7, 2-5), and as label 275 bit 29 HSI valid = 0 (GAMA 11 page
        //  19)
        //- ARINC 429 transmitter, label 275: bit 23 = 1 TO, bit 24 = 1 FROM (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character e: T or F, dashed while NAV is flagged (Installation manual A-6)
        //The LVar's 0 is the flag, so it goes out on the superflag port (#459). What the unit commands is recorded here
        //for the failure detector, because a failed port drops the write before it sees the value
        this.interconnect.commanded.record('superflag', toFrom !== null);
        if (toFrom === null) {
            this.interconnect.superflag.write(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, 0);
        } else {
            this.interconnect.superflag.write(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, toFrom === TO ? 1 : 2);
        }
    }

    /**
     * The deviation bar signal is filtered by analog circuitry (see SignalOutputFilter), so we set this more often
     */
    public setFilteredOutputs() {
        //Real unit: the analog CDI deviation, P901 pin 22 +RIGHT against pin 25 +LEFT/NAV FLAG -, +/-150 mV at full scale
        //and +/-300 mV at most (Installation manual 1-7, 2-5). The digital cross track is ARINC 429 label 116 (setXTK).
        //A failed EEPROM puts the pin off by the uncorrected gain and zero point (#459, EepromCalibration); the zero point
        //shows while the deviation is flagged too, as on a miscalibrated pin. The full scale is the filter's, so a power
        //change resets both together
        const deviation = this.dbar.dbarDeviation(this.xtkFilter.getCurrentValue(), this.xtkFilter.getScale());
        this.interconnect.gps(this.interconnect.analogNav).write('GPS WP CROSS TRK', SimVarValueType.Meters, UnitType.NMILE.convertTo(deviation, UnitType.METER));
    }

    /**
     * GPS WP DESIRED TRACK is the DTK or the OBS course, magnetic with the variation at the aircraft, and
     * GPS WP TRACK ANGLE ERROR that course less the track, computed in true. In OBS mode the unit shows the OBS course
     * with the variation of the active waypoint (#371), but these outputs keep the frame of the aircraft
     * @param dtkTrue the DTK or the OBS course, true
     * @param actualTrack the track, true
     * @param magvar the variation at the aircraft
     */
    public setDesiredTrack(dtkTrue: number | null, actualTrack: number | null, magvar: number) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: GPS WP TRACK ANGLE ERROR is fictional. No output carries it; a receiver can subtract ARINC 429 label
        //313 track from label 114 desired track
        //Real unit: GPS WP DESIRED TRACK, any of
        //- ARINC 429 transmitter, label 114 desired track, true: BNR, bits 17-28 with a 180/4096 deg LSB, bit 29 = 1 for
        //  180-360 deg (GAMA 11 page 12). Magnetic with label 147 magnetic variation
        //- RS-232 OUT, item I desired track, magnetic, in tenths of a degree: the DTK less the variation at the aircraft
        //  in LEG mode, the course at the active waypoint with its variation in OBS mode (Installation manual A-5, A-6)
        //- ARINC 429 transmitter, label 100 selected course, in OBS mode (setObs)
        if (dtkTrue === null) {
            gpsNavData.write('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, 0);
            gpsNavData.write('GPS WP DESIRED TRACK', SimVarValueType.Radians, 0);
        } else {
            if (actualTrack === null) {
                gpsNavData.write('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, 0);
            } else {
                gpsNavData.write('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, UnitType.DEGREE.convertTo(NavMath.diffAngle(actualTrack, dtkTrue), UnitType.RADIAN));
            }
            gpsNavData.write('GPS WP DESIRED TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(dtkTrue, magvar), UnitType.RADIAN));

        }
    }

    public setWpBearing(bearingForAP: number | null, bearingToActive: number | null, magvar: number) {
        //The LVar is an output of the unit, independent of the GPS SimVars
        //Real unit: the bearing to the active waypoint for an RMI, any of
        //- P901 pins 10, 11 and 12 OBI DATA, CLOCK and SYNC, a Honeywell serial bus that drives some Honeywell RMIs
        //  directly, or a standard sin/cos OBI through a KDA 692 (Installation manual 1-7, 2-4)
        //- ARINC 429 transmitter, label 115 waypoint bearing, true, through a KA 90 -0201/-0202 to an XYZ RMI or a sin/cos
        //  OBI (KA 90 manual 1-2). See GPS WP TRUE BEARING below
        //- RS-232 OUT, item L bearing to active waypoint, magnetic, in tenths of a degree: the bearing less the variation
        //  at the aircraft in LEG mode, the radial with the waypoint's variation +/-180 in OBS mode (Installation manual
        //  A-5, A-6)
        if (bearingToActive === null) {
            this.interconnect.rmi.write(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, 0);
        } else {
            this.interconnect.rmi.write(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(bearingToActive, magvar), UnitType.RADIAN));
        }
        this.writeGpsWpBearing(bearingForAP, magvar);
    }

    private writeGpsWpBearing(bearingForAP: number | null, magvar: number) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: GPS WP TRUE BEARING is ARINC 429 transmitter label 115 waypoint bearing, true: BNR, bits 17-28 with a
        //180/4096 deg LSB, bit 29 = 1 for 180-360 deg, measured from the aircraft to the waypoint (GAMA 11 page 12). GPS
        //WP BEARING is its magnetic form, which the unit sends only as RS-232 item L and on the OBI bus (see above). The
        //real unit has one bearing; on a DME arc bearingForAP is the DTK instead, which is fictional
        if (bearingForAP === null) {
            gpsNavData.write('GPS WP BEARING', SimVarValueType.Radians, 0);  //This SimVar appears to be readonly??
            gpsNavData.write('GPS WP TRUE BEARING', SimVarValueType.Radians, 0);
        } else {
            gpsNavData.write('GPS WP BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(bearingForAP, magvar), UnitType.RADIAN));  //This SimVar appears to be readonly??
            gpsNavData.write('GPS WP TRUE BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(bearingForAP, UnitType.RADIAN));
        }
    }

    public setDistance(distance: NauticalMiles | null) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: the distance to the active waypoint, any of
        //- ARINC 429 transmitter, label 251 distance to go: BNR, bits 14-28 nm with a 0.125 nm LSB, bit 29 always 0
        //  (GAMA 11 page 17)
        //- ARINC 429 transmitter, label 001 distance to go: BCD, bits 11-14 tenths, 15-18 units, 19-22 tens, 23-26
        //  hundreds, 27-29 thousands of nm (GAMA 11 page 2). For a distance indicator, which shows 34.5 NM during the self
        //  test (Installation manual 2-69)
        //- RS-232 OUT, item E distance to active waypoint, nm x 10 (Installation manual A-5)
        if (distance === null) {
            gpsNavData.write('GPS WP DISTANCE', SimVarValueType.Meters, 0);
        } else {
            gpsNavData.write('GPS WP DISTANCE', SimVarValueType.Meters, UnitType.NMILE.convertTo(distance, UnitType.METER));
        }
    }

    public setPos(pos: LatLonInterface | null, speed: Knots | null, track: Degrees | null, magvar: number, integretyWarning: boolean) {
        //The LVar is an output of the unit, independent of the GPS SimVars
        //Real unit: ARINC 429 transmitter, label 261 GPS discrete word bit 24 GPS integrity, 1 = fail (GAMA 11 page 18).
        //The caller passes true when the position has no fix, or RAIM is unavailable at the alert limit of the current
        //flight phase (#453). No analog or RS-232 output carries it
        this.interconnect.arinc429Tx.write(LVAR_INTEGRITY_WARNING, SimVarValueType.Bool, integretyWarning);
        this.writeGpsPos(pos, speed, track, magvar);
    }

    private writeGpsPos(pos: LatLonInterface | null, speed: Knots | null, track: Degrees | null, magvar: number) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: the magnetic variation, either
        //- ARINC 429 transmitter, label 147 magnetic variation: BNR, bits 17-28 with a 180/4096 deg LSB, bit 29 = 1 West,
        //  bit 11 = 1 pilot entered, 0 computed (GAMA 11 page 14)
        //- RS-232 OUT, item Q magnetic variation, E or W and tenths of a degree: at the aircraft in LEG mode, at the active
        //  waypoint in OBS mode (Installation manual A-5, A-6)
        gpsNavData.write('GPS MAGVAR', SimVarValueType.Radians, UnitType.DEGREE.convertTo(magvar, UnitType.RADIAN));

        //Real unit: the present position, either
        //- ARINC 429 transmitter, labels 310 latitude and 311 longitude: BNR, bits 9-28 with a 180/1048576 deg LSB and no
        //  SDI, bit 29 = 1 South or West (GAMA 11 page 23)
        //- RS-232 OUT, items A latitude and B longitude: N/S or E/W, degrees, minutes, hundredths of minutes
        //  (Installation manual A-5)
        if (pos === null) {
            gpsNavData.write('GPS POSITION LAT', SimVarValueType.Degree, 0);
            gpsNavData.write('GPS POSITION LON', SimVarValueType.Degree, 0);
        } else {
            gpsNavData.write('GPS POSITION LAT', SimVarValueType.Degree, pos.lat);
            gpsNavData.write('GPS POSITION LON', SimVarValueType.Degree, pos.lon);
        }
        //Real unit: the ground speed, any of
        //- ARINC 429 transmitter, label 312 ground speed: BNR, bits 14-28 knots with a 0.125 kt LSB, bit 29 always 0
        //  (GAMA 11 page 23)
        //- ARINC 429 transmitter, label 012 ground speed: BCD, bits 11-29 in tenths of a knot (GAMA 11 page 2)
        //- RS-232 OUT, item D ground speed in knots (Installation manual A-5)
        if (speed === null) {
            gpsNavData.write('GPS GROUND SPEED', SimVarValueType.MetersPerSecond, 0);
        } else {
            gpsNavData.write('GPS GROUND SPEED', SimVarValueType.MetersPerSecond, UnitType.KNOT.convertTo(speed, UnitType.MPS));
        }
        //Real unit: GPS GROUND TRUE TRACK is ARINC 429 transmitter label 313 track angle, true: BNR, bits 17-28 with a
        //180/4096 deg LSB, bit 29 = 1 for 180-360 deg (GAMA 11 page 23). GPS GROUND MAGNETIC TRACK is RS-232 OUT item C
        //track, magnetic, dashed below 2 kt: with the variation at the aircraft in LEG mode, at the active waypoint in
        //OBS mode (Installation manual A-5, A-6)
        if (track === null) {
            gpsNavData.write('GPS GROUND TRUE TRACK', SimVarValueType.Radians, 0);
            gpsNavData.write('GPS GROUND MAGNETIC TRACK', SimVarValueType.Radians, 0);
        } else {
            gpsNavData.write('GPS GROUND TRUE TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(track, UnitType.RADIAN));
            gpsNavData.write('GPS GROUND MAGNETIC TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(track, magvar), UnitType.RADIAN));
        }
    }

    public setWPTETE(ete: Seconds | null, eta: Seconds | null) {
        const gpsArinc429Tx = this.interconnect.gps(this.interconnect.arinc429Tx);
        //Real unit: GPS WP ETE, either
        //- ARINC 429 transmitter, label 252 time to go: BNR, bits 20-28 minutes with a 1 min LSB, bit 29 always 0 (GAMA 11
        //  page 17)
        //- ARINC 429 transmitter, label 002 time to go: BCD, bits 15-29 in tenths of a minute, bits 11-14 spare (GAMA 11
        //  page 2)
        //There is no RS-232 item for it.
        //Real unit: GPS WP ETA is fictional. The unit only sends the time itself, ARINC 429 label 150 GMT: BNR, bits 12-17
        //seconds, 18-23 minutes, 24-28 hours (GAMA 11 page 14)
        if (ete === null) {
            gpsArinc429Tx.write('GPS WP ETE', SimVarValueType.Seconds, 0);
        } else {
            gpsArinc429Tx.write('GPS WP ETE', SimVarValueType.Seconds, ete);
        }
        if (eta === null) {
            gpsArinc429Tx.write('GPS WP ETA', SimVarValueType.Seconds, 0);
        } else {
            gpsArinc429Tx.write('GPS WP ETA', SimVarValueType.Seconds, eta);
        }
    }

    public setDestETE(ete: Seconds | null, eta: Seconds | null) {
        const gpsArinc429Tx = this.interconnect.gps(this.interconnect.arinc429Tx);
        //Real unit: GPS ETE is ARINC 429 transmitter label 352 time to destination via the flight plan: BNR, bits 17-28
        //minutes with a 1 min LSB, bit 29 always 0 (GAMA 11 page 25). No RS-232 item; RS-232 item l is only the distance
        //to the destination (Installation manual A-6).
        //Real unit: GPS ETA is fictional, as GPS WP ETA is (setWPTETE)
        if (ete === null) {
            gpsArinc429Tx.write('GPS ETE', SimVarValueType.Seconds, 0);
        } else {
            gpsArinc429Tx.write('GPS ETE', SimVarValueType.Seconds, ete);
        }
        if (eta === null) {
            gpsArinc429Tx.write('GPS ETA', SimVarValueType.Seconds, 0);
        } else {
            gpsArinc429Tx.write('GPS ETA', SimVarValueType.Seconds, eta);
        }
    }

    /**
     * GPS FLIGHT PLAN WP INDEX is 1-based: the active waypoint of FPL 0 is index + 1, and 0 without one. It never exceeds
     * the count. An index above 0 with a count of 0 crashes MSFS 2024 to desktop when another GPS unit takes over in a hot
     * swap; index = count (the last waypoint active) and an index above a non-zero count did not (#462, the sim tests of
     * 2026-11-03 in docs/sim-flight-record.md). The guard is here so that no caller can write that pair
     * @param index the index of the active waypoint in FPL 0, -1 without one
     * @param countTotal the number of FPL 0 legs
     */
    public setWPIndex(index: number, countTotal: number) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: the flight plan output (see WTFlightplanSync), either
        //- RS-232 OUT, item w flight plan data, one item per waypoint and at most 32: bits 0-4 of the sequence byte are
        //  the waypoint number, bit 5 = 1 for the active waypoint, bit 6 = 1 for the last one (Installation manual A-8)
        //- ARINC 429 transmitter, label 074 data record header, bits 9-15 the number of records; label 075 active
        //  waypoint from/to, the TO record number in BCD with the tens in bits 13-16 and the units in bits 21-24 (GAMA 11
        //  pages 9, 10)
        gpsNavData.write('GPS FLIGHT PLAN WP COUNT', SimVarValueType.Number, countTotal);
        gpsNavData.write('GPS FLIGHT PLAN WP INDEX', SimVarValueType.Number, Math.max(0, Math.min(index + 1, countTotal)));
    }

    public setNextWpt(wpt: Facility | null) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: the active waypoint, any of
        //- RS-232 OUT, item K active waypoint identifier, five ASCII characters (Installation manual A-5)
        //- RS-232 OUT, the item w record whose sequence byte has the active bit: bytes 2-6 identifier, 7-13 packed
        //  latitude and longitude (Installation manual A-8, A-9)
        //- ARINC 429 transmitter, the record numbered as the TO of label 075 (setWPIndex): label 303 bits 17-23 its
        //  number; labels 304 and 305 identifier characters 1-3 and 4-6 in 7-bit fields at bits 9-15, 16-22 and 23-29;
        //  labels 306 latitude and 307 longitude, BNR bits 9-28 with a 180/1048576 deg LSB, bit 29 = 1 South or West
        //  (GAMA 11 pages 21 to 23)
        if (wpt === null) {
            gpsNavData.write('GPS WP NEXT ID', SimVarValueType.String, '');
            gpsNavData.write('GPS WP NEXT LAT', SimVarValueType.Degree, 0);
            gpsNavData.write('GPS WP NEXT LON', SimVarValueType.Degree, 0);
        } else {
            gpsNavData.write('GPS WP NEXT ID', SimVarValueType.String, wpt.icaoStruct.ident);
            gpsNavData.write('GPS WP NEXT LAT', SimVarValueType.Degree, wpt.lat);
            gpsNavData.write('GPS WP NEXT LON', SimVarValueType.Degree, wpt.lon);
        }
    }

    public setPrevWpt(wpt: Facility | null) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        //Real unit: the from waypoint, either
        //- ARINC 429 transmitter, the record numbered as the FROM of label 075, BCD tens in bits 17-20 and units in bits
        //  25-28 (GAMA 11 page 10), with the words of setNextWpt
        //- RS-232 OUT, the item w record before the active one; it has no flag of its own (Installation manual A-8)
        if (wpt === null) {
            gpsNavData.write('GPS WP PREV VALID', SimVarValueType.Bool, false);
            gpsNavData.write('GPS WP PREV ID', SimVarValueType.String, '');
            gpsNavData.write('GPS WP PREV LAT', SimVarValueType.Degree, 0);
            gpsNavData.write('GPS WP PREV LON', SimVarValueType.Degree, 0);
        } else {
            gpsNavData.write('GPS WP PREV VALID', SimVarValueType.Bool, true);
            gpsNavData.write('GPS WP PREV ID', SimVarValueType.String, wpt.icaoStruct.ident);
            gpsNavData.write('GPS WP PREV LAT', SimVarValueType.Degree, wpt.lat);
            gpsNavData.write('GPS WP PREV LON', SimVarValueType.Degree, wpt.lon);
        }
    }

    public setMessageLight(lightOn: boolean) {
        //Real unit: the MSG annunciator, any of
        //- P901 pin 15 MSG, pulled low (sinks up to 250 mA) to light a remote lamp, open when off (Installation manual 1-7,
        //  2-5)
        //- ARINC 429 transmitter, label 275 bit 27 message alert, 1 = on (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character b: N new message, P persistent message, dashed otherwise
        //  (Installation manual A-6)
        this.interconnect.msgAnnunciator.write(LVAR_MSG_LIGHT, SimVarValueType.Bool, lightOn);
    }

    public setWptAlertLight(lightOn: boolean) {
        //Real unit: the WPT annunciator, any of
        //- P901 pin 14 WPT ALERT, pulled low (sinks up to 250 mA) to light a remote lamp, open when off (Installation
        //  manual 1-7, 2-5)
        //- ARINC 429 transmitter, label 275 bit 11 waypoint alert, 1 = on (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character a: W waypoint alert, T in turn, dashed otherwise (Installation
        //  manual A-6)
        this.interconnect.wptAnnunciator.write(LVAR_WPT_LIGHT, SimVarValueType.Bool, lightOn);
    }

    public setAnnunTest(lightOn: boolean) {
        //Real unit: fictional as one signal. On the self-test page the unit pulls all four annunciator outputs low, P901
        //pins 14 WPT, 15 MSG, 16 APPROACH ACTIVE and 17 APPROACH ARM (Installation manual 2-69). The OBS and LEG lamps of
        //the GPS CRS switch are not the KLN's
        this.interconnect.sim.write(LVAR_ANNUN_TEST, SimVarValueType.Bool, lightOn);
    }

    /**
     *
     * @param mode
     * @param isSelfTestActive For selftest, we set GPS APPROACH MODE to 3, to signal that ARM AND APPR lights should
     * both light up on external annunciators. 3 is not used during normal operation
     * @param writeObs GPS OBS ACTIVE will become readonly when an external mode switch is installed
     */
    public setMode(mode: NavMode, isSelfTestActive: boolean, writeObs: boolean) {
        const gpsNavData = this.interconnect.gps(this.interconnect.navData);
        const gpsApproachLamps = this.interconnect.gps(this.interconnect.approachLamps);

        //Real unit: K:GPS_OBS_ON/K:GPS_OBS_OFF (GPS OBS ACTIVE) is LEG or OBS mode, any of
        //- no pin: with the GPS CRS switch, its own contacts light the OBS and LEG lamps, and the KLN reads its position
        //  as a level on pin 33 (Installation manual 2-6, 2-69, figure 2-17 sheet 8 on 2-57)
        //- ARINC 429 transmitter, label 075 bit 9: 0 = LEG, 1 = OBS (GAMA 11 page 10). Label 275 bit 13 = 1 direct to
        //  (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character d: L leg, D direct to, O OBS, T OBS to leg transition
        //  (Installation manual A-6)
        //Real unit: GPS APPROACH MODE (0 en route, 1 armed, 2 active, 3 self-test) is the approach annunciation for the
        //lamps of the GPS APR switch-annunciator, the SimVar the wiki documents for them: P901 pin 17 APPROACH ARM and pin
        //16 APPROACH ACTIVE, each pulled low (sinks up to 250 mA) to light its lamp (Installation manual 1-7, 2-5). On the
        //self-test page both are on (2-69), which 3 stands for. It goes through the approach lamp group (#451)
        //Real unit: GPS IS APPROACH ACTIVE is the approach state as data, not documented for lamps (#451), either
        //- ARINC 429 transmitter, label 261 bits 25-27 (read 27-26-25): 000 en route, 001 terminal, 010 approach; label 275
        //  bit 16 = 1 approach deviation scaling (GAMA 11 pages 18, 19). GAMA 11 has no approach arm bit
        //- RS-232 OUT, item t GPS discretes, character c: E en route, T terminal, R approach arm, A approach active
        //  (Installation manual A-6)
        switch (mode) {
            case NavMode.ENR_LEG:
                if (writeObs) {
                    //GPS OBS ACTIVE is marked writable in the docs, but appears to be readonly
                    gpsNavData.write('K:GPS_OBS_OFF', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                }
                gpsNavData.write('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, false);
                gpsApproachLamps.write('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 0);
                break;
            case NavMode.ENR_OBS:
                if (writeObs) {
                    gpsNavData.write('K:GPS_OBS_ON', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, true);
                }
                gpsNavData.write('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, false);
                gpsApproachLamps.write('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 0);
                break;
            case NavMode.ARM_LEG:
                if (writeObs) {
                    gpsNavData.write('K:GPS_OBS_OFF', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                }
                gpsNavData.write('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                gpsApproachLamps.write('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 1);
                break;
            case NavMode.ARM_OBS:
                if (writeObs) {
                    gpsNavData.write('K:GPS_OBS_ON', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, true);
                }
                gpsNavData.write('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                gpsApproachLamps.write('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 1);
                break;
            case NavMode.APR_LEG:
                if (writeObs) {
                    gpsNavData.write('K:GPS_OBS_OFF', SimVarValueType.Bool, true);
                    //SimVar.SetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool, false);
                }
                gpsNavData.write('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, true);
                gpsApproachLamps.write('GPS APPROACH MODE', SimVarValueType.Enum, isSelfTestActive ? 3 : 2);
                break

        }
    }

    public setRollCommand(bankAngle: number | null, courseToSteer: number | null) {
        //Real unit: roll steering, either
        //- ARINC 429 transmitter, label 121 horizontal command (Installation manual 1-3): BNR, bits 15-28 with a 180/16384
        //  deg LSB, bit 29 = 1 fly left, 0 fly right (GAMA 11 page 13). So a positive value is fly right, the opposite of
        //  the LVar, which is positive for a left bank. Only with a heading input (Installation manual 2-69); the self test
        //  commands 0, 5 deg right, 0 (2-70)
        //- analog roll steering, converted from label 121 by a KA 90 (KA 90 manual 1-2)
        if (bankAngle === null) {
            this.interconnect.arinc429Tx.write(LVAR_ROLL_COMMAND, SimVarValueType.Degree, 0);
        } else {
            this.interconnect.arinc429Tx.write(LVAR_ROLL_COMMAND, SimVarValueType.Degree, bankAngle);
        }
        this.writeGpsCourseToSteer(courseToSteer);
    }

    private writeGpsCourseToSteer(courseToSteer: number | null) {
        //The real KLN does not have this, but we do and there is a SimVar for this...
        //Real unit: GPS COURSE TO STEER is fictional, no output carries it. It goes with the roll command it is derived
        //from, on the transmitter (#451)
        //The maintainer held GPS COURSE TO STEER at 0 in the sim on 2026-10-19 and the default autopilot still tracked the
        //flight plan perfectly, so the sim's autopilot does not read it. It carries the course to steer of the roll
        //steering law, and 0 without a heading input or without a path (the maintainer's decision, 2026-10-19, reversing
        //the #143 exemption). The DTK goes to GPS WP DESIRED TRACK (setDesiredTrack), not here
        const gpsArinc429Tx = this.interconnect.gps(this.interconnect.arinc429Tx);
        if (courseToSteer === null) {
            gpsArinc429Tx.write('GPS COURSE TO STEER', SimVarValueType.Number, 0);
        } else {
            gpsArinc429Tx.write('GPS COURSE TO STEER', SimVarValueType.Number, UnitType.DEGREE.convertTo(courseToSteer, UnitType.RADIAN));
        }
    }

    /**
     * The ticks that write the L:KLN90B_* outputs stop when the unit loses power, so the zero state is written once.
     * The GPS SimVars get their null state in reset() (#462).
     */
    public setPoweredOff(): void {
        this.writeLVarNullState();
        this.xtkFilter.reset();
    }

    /**
     * The null state of every output, with no change of state: what a switched-off unit leaves on its outputs. A failed
     * port writes it once in a null-state pass (#458, FailureOutputs)
     */
    public writeNullState(): void {
        this.writeLVarNullState();
        this.writeGpsNullState();
    }

    /**
     * The zero state of the L:KLN90B_* outputs that setPoweredOff writes, and nothing else
     */
    public writeLVarNullState(): void {
        //Real unit: without power the annunciator pins are open, the 429 transmitter is silent and the analog outputs
        //are flagged; each output's interface is on its setter above
        this.writeDigitalLVarNullState();
        this.interconnect.superflag.write(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, 0);
        this.interconnect.msgAnnunciator.write(LVAR_MSG_LIGHT, SimVarValueType.Bool, false);
        this.interconnect.wptAnnunciator.write(LVAR_WPT_LIGHT, SimVarValueType.Bool, false);
        this.interconnect.sim.write(LVAR_ANNUN_TEST, SimVarValueType.Bool, false);
    }

    /**
     * The L:KLN90B_* outputs of the navigation data: the roll command, the integrity warning, the RMI bearing and the
     * digital cross track. reset() zeroes them with the GPS SimVars
     */
    private writeDigitalLVarNullState(): void {
        this.interconnect.arinc429Tx.write(LVAR_ROLL_COMMAND, SimVarValueType.Degree, 0);
        this.interconnect.arinc429Tx.write(LVAR_INTEGRITY_WARNING, SimVarValueType.Bool, false);
        this.interconnect.rmi.write(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, 0);
        this.interconnect.arinc429Tx.write(LVAR_XTK, SimVarValueType.NM, 0);
    }

    public setGpsOverriden(): void {
        //Real unit: fictional, the sim's claim that this gauge writes the GPS SimVars
        this.interconnect.gps(this.interconnect.sim).write('GPS OVERRIDDEN', SimVarValueType.Bool, true);
    }

    /**
     * The GPS SimVars are not written: without Output.WriteGPSSimVars, or while disabled for hot swapping
     */
    private isGpsReleased(): boolean {
        //#350: a unit disabled for hot swapping has released the GPS to the unit that replaced it, so a power change does
        //not claim it. SimVarSync.setDisabled claims it again on the resume
        return !this.options.output.writeGPSSimVars || this.hardware.isDisabled;
    }

    /**
     * At every power change: claims the GPS, sets the state the null outputs stand for and writes the null state of the
     * GPS SimVars and of the L:KLN90B_* outputs of the navigation data. Sensors runs it in a null-state pass over every
     * port, so that a failed port writes it too (#458)
     */
    public reset() {
        if (this.isGpsReleased()) {
            return;
        }

        this.setGpsOverriden();
        //No deviation for the D-bar filter to settle to, and no OBS course
        this.xtkFilter.setValue(0, 5);
        this.obsOut = null;
        this.writeGpsNullState();
        this.writeDigitalLVarNullState();
    }

    /**
     * The GPS SimVar writes of reset() after the claim, and nothing else: no claim, no change of state
     */
    public writeGpsNullState(): void {
        if (this.isGpsReleased()) {
            return;
        }

        //The null state of the GPS SimVars, at every power change, so that a switched-off unit does not leave a
        //GPS-coupled autopilot a frozen DTK and deviation (#462). The ticks write the real values from the next one on.
        //It was disabled from d3c5230f (2024-03-03) to #462 after a crash to desktop in FS2020, whose cause was not known
        //then. The sim tests of 2026-11-03 (MSFS 2024, docs/sim-flight-record.md) found it: GPS FLIGHT PLAN WP INDEX 1
        //with GPS FLIGHT PLAN WP COUNT 0 crashes the sim when another GPS unit takes over in a hot swap. The same null
        //state with index 0 does not, and that pair alone among live values does. The old guesses (a start on the runway,
        //L:KLN90B_Disabled set at once, no calculation tick yet) were wrong. setWPIndex keeps the index within the count
        this.writeGpsXtk(null, 5);
        //Real unit: the D-bar driver holds its pin through op-amp stages behind the RC filter (CMM 64-65,
        //SignalOutputFilter), so without power the pin drops to 0 V at once (guess: the manuals do not describe the
        //unpowered output). Only the signal tick writes the deviation, and it stops with the power
        this.interconnect.gps(this.interconnect.analogNav).write('GPS WP CROSS TRK', SimVarValueType.Meters, 0);
        this.writeGpsObs(null);
        this.setDesiredTrack(null, null, 0);
        this.writeGpsWpBearing(null, 0);
        this.setDistance(null);
        this.setWPTETE(null, null);
        this.setDestETE(null, null);
        this.writeGpsPos(null, null, null, 0);
        this.setWPIndex(-1, 0);
        this.setPrevWpt(null);
        this.setNextWpt(null);
        this.writeGpsCourseToSteer(null);
        //Not setMode: K:GPS_OBS_ON/OFF is the position of the aircraft's LEG/OBS switch (GPS OBS ACTIVE), which a power
        //change must not flip. The next calculation tick writes the real mode
        this.interconnect.gps(this.interconnect.navData).write('GPS IS APPROACH ACTIVE', SimVarValueType.Bool, false);
        this.interconnect.gps(this.interconnect.approachLamps).write('GPS APPROACH MODE', SimVarValueType.Enum, 0);
    }
}


export class Sensors implements CalcTickable {

    public in: SensorsIn;
    public out: SensorsOut;


    constructor(bus: EventBus, userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, public readonly interconnect: Interconnect, audioGenerator: AudioGenerator,
                messageHandler: MessageHandler, hardware: Hardware, gpsMeasurement: GpsMeasurement, antenna: AntennaAttitudeSource,
                signalRandom: () => number, failures: Failures, dbar: DbarOutput = EXACT_DBAR) {
        this.in = new SensorsIn(bus, userSettings, options, interconnect, messageHandler, gpsMeasurement, antenna, signalRandom, failures);
        this.out = new SensorsOut(options, interconnect, audioGenerator, hardware, dbar);

        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.reset.bind(this));
    }


    tick() {
        this.in.tick();
    }

    public onTicksStopped(): void {
        this.in.gps.onTicksStopped();
    }

    private reset(evt: PowerEventData) {
        this.in.reset();
        //A power change writes the null state of every port, a failed one too (#458): a power-on while failed leaves the
        //null state on the failed port, which writes nothing from then on
        this.interconnect.writeNullState('all', () => {
            this.out.reset();
            if (!evt.isPowered) {
                this.out.setPoweredOff();
            }
        });
    }

}