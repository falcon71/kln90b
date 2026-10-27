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
import {Hardware} from "./Hardware";
import {SignalOutputFilter} from "./services/SignalOutputFilter";

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
    public fob: number = 0;
    public fuelFlow1: number = 0;
    public fuelFlow2: number = 0;
    public fuelUsed1: number | null = null;
    public fuelUsed2: number | null = null;
    private readonly realNumberOfEngines: number = 0;


    public static readonly GALLON_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'gallon', 2.9484);
    public static readonly IMP_GALLON_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'imperial gallon', 3.5408);
    private static readonly LITER_FUEL_JETB = new SimpleUnit(UnitFamily.Weight, 'liter', 0.7789);

    constructor(private readonly options: KLN90PlaneSettings) {
        if (this.options.input.fuelComputer.isInterfaced) {
            //Real unit: RS-232 IN, fuel/air data formats B, C and D. A single-engine aircraft sends asterisks in all
            //engine one and engine two fields (Installation manual A-11). Format A has no engine fields at all
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
        if (this.options.input.fuelComputer.fobTransmitted) {
            this.fob = UnitType.POUND.convertTo(SimVar.GetSimVarValue('FUEL TOTAL QUANTITY WEIGHT EX1', SimVarValueType.Pounds), targetUnit);
        }

        if (this.realNumberOfEngines === 2) {
            //Real unit: RS-232 IN, formats B, C and D: engine one fuel flow bytes 17-22, engine two bytes 24-29
            //(Installation manual A-11)
            this.fuelFlow1 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('ENG FUEL FLOW PPH:1', SimVarValueType.PPH), targetUnit);
            this.fuelFlow2 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('ENG FUEL FLOW PPH:2', SimVarValueType.PPH), targetUnit);

            //Real unit: RS-232 IN, formats B, C and D: engine one fuel used bytes 38-43, engine two bytes 45-50
            //(Installation manual A-11)
            if (this.options.input.fuelComputer.fuelUsedTransmitted) {
                this.fuelUsed1 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('GENERAL ENG FUEL USED SINCE START:1', SimVarValueType.Pounds), targetUnit);
                this.fuelUsed2 = UnitType.POUND.convertTo(SimVar.GetSimVarValue('GENERAL ENG FUEL USED SINCE START:2', SimVarValueType.Pounds), targetUnit);
            }
        } else {
            //Real unit: RS-232 IN, total fuel flow: format A bytes 8-11, formats B, C and D bytes 10-15 (Installation
            //manual A-10)
            this.fuelFlow1 = 0;
            for (let i = 1; i <= this.realNumberOfEngines; i++) {
                this.fuelFlow1 += UnitType.POUND.convertTo(SimVar.GetSimVarValue(`ENG FUEL FLOW PPH:${i}`, SimVarValueType.PPH), targetUnit);
            }

            //Real unit: RS-232 IN, formats B, C and D, total fuel used bytes 31-36 (Installation manual A-11)
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
                //Real unit: gray code pressure altitude in 100 ft steps on P901 pins 41-50 = D4, A1, A2, A4, B1, B2, B4,
                //C1, C2, C4 (Installation manual 1-6, 2-7, figure 2-17 sheet 3 on 2-47)
                this.pressureAltitude = Math.round(SimVar.GetSimVarValue('PRESSURE ALTITUDE', SimVarValueType.Feet) / 100) * 100;
            }
            return;
        }
        //Real unit: RS-232 IN, format D, bytes 108-112 barometric setting in hundredths of inHg (Installation manual A-13).
        //No ARINC 429 input: the air data receiver takes no baro label (Installation manual 1-2), and GAMA 11 defines none
        switch (this.options.input.airdata.baroSource) {
            case 1:
                this.barometer = SimVar.GetSimVarValue('KOHLSMAN SETTING HG:1', SimVarValueType.InHG);
                break;
            case 2:
                this.barometer = SimVar.GetSimVarValue('KOHLSMAN SETTING HG:2', SimVarValueType.InHG);
                break;
        }


        //Real unit: pressure altitude, one of
        //- ARINC 429 air data receiver, label 203 altitude (1013.25 mb) (Installation manual 1-2). GAMA 11 gives no
        //  layout for 203; it only lists the label and refers to ARINC 429 itself for it (GAMA 11 page 4-2)
        //- ARINC 429 air data receiver, label 204 baro-corrected altitude instead: BNR, bits 12-28 feet with 1 ft LSB, bit
        //  29 = 1 below sea level (GAMA 11 page 15). The ALT page then needs no baro (Installation manual 2-68)
        //- RS-232 IN, format C or D, bytes 64-69 pressure altitude in feet with a sign (Installation manual A-12), or
        //  format D bytes 114-119 baro-corrected altitude (A-13). The 429 value wins when both send it (A-11)
        //- without an air data computer: the gray code above
        this.pressureAltitude = SimVar.GetSimVarValue('PRESSURE ALTITUDE', SimVarValueType.Feet);

        //Real unit: true airspeed, either
        //- ARINC 429 air data receiver, label 210: BNR, bits 14-28 knots with a 0.0625 kt LSB, bit 29 always 0 (GAMA 11
        //  page 16)
        //- RS-232 IN, format C or D, bytes 56-58 TAS in knots (Installation manual A-12)
        this.tas = SimVar.GetSimVarValue('AIRSPEED TRUE', SimVarValueType.Knots);
        //Real unit: Mach, either
        //- ARINC 429 air data receiver, label 205 (Installation manual 1-2). GAMA 11 gives no layout for 205 and refers to
        //  ARINC 429 itself for it (GAMA 11 page 4-2)
        //- RS-232 IN, format C or D, bytes 60-62 Mach in thousandths (Installation manual A-12)
        this.mach = SimVar.GetSimVarValue('AIRSPEED MACH', SimVarValueType.Mach);
        //Real unit: static air temperature, either
        //- ARINC 429 air data receiver, label 213: BNR, bits 18-28 deg C with a 0.25 deg LSB, bit 29 = 1 below zero (GAMA
        //  11 page 16)
        //- RS-232 IN, format C or D, bytes 104-106 SAT in deg C with a sign (Installation manual A-13)
        this.sat = SimVar.GetSimVarValue('AMBIENT TEMPERATURE', SimVarValueType.Celsius);
        //Real unit: total air temperature, either
        //- ARINC 429 air data receiver, label 211 (Installation manual 1-2). GAMA 11 gives no layout for 211 and refers to
        //  ARINC 429 itself for it (GAMA 11 page 4-2)
        //- RS-232 IN, format C or D, bytes 78-80 TAT in deg C with a sign (Installation manual A-12)
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
        //Real unit: P901 pin 1 GPS DISPLAYED. Open = an indicator's resolver is connected to the KLN, grounded = not
        //displayed. The NAV/GPS relay grounds it in the NAV position (Installation manual 1-6, 2-4, figure 2-17 sheets 4
        //to 6 on 2-49 to 2-53)
        this.gpsIsNavSource = SimVar.GetSimVarValue('GPS DRIVES NAV1', SimVarValueType.Bool);

        //Real unit: the selected course, either
        //- the OBS resolver of the CDI/HSI: P901 pin 26 sine in and pin 37 cosine in, excited by the 450 Hz of pin 31 OBS
        //  RESOLVER OUT (Installation manual 1-6, 1-7, 2-6)
        //- ARINC 429 EFIS receiver, label 100 selected course, from an EFIS or a KA 90 (Installation manual 1-2): BNR,
        //  bits 17-28 with a 180/4096 deg LSB, bit 29 = 1 for 180-360 deg (GAMA 11 page 10)
        if (this.gpsIsNavSource) {
            switch (this.options.input.obsSource) {
                case 1:
                    this.obsMag = SimVar.GetSimVarValue('Nav OBS:1', SimVarValueType.Degree);
                    break;
                case 2:
                    this.obsMag = SimVar.GetSimVarValue('Nav OBS:2', SimVarValueType.Degree);
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
        if (this.options.input.headingInput) {
            this.headingGyro = SimVar.GetSimVarValue(this.options.input.headingSimVar, SimVarValueType.Degree); //PLANE HEADING DEGREES GYRO unless the aircraft names its own (#405)
        } else {
            this.headingGyro = null; //The input can be switched off at runtime (#368)
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

    constructor(private readonly options: KLN90PlaneSettings, public readonly audioGenerator: AudioGenerator, private readonly hardware: Hardware) {
        this.reset();
    }

    public setObs(obsMag: number | null) {
        this.obsOut = obsMag;
        if (obsMag !== null) {
            //Real unit: P901 pin 1 GPS DISPLAYED (see SensorsIn.tick)
            const gpsIsNavSource = SimVar.GetSimVarValue('GPS DRIVES NAV1', SimVarValueType.Bool);
            //Real unit: ARINC 429 transmitter, label 100 selected course #1 (Installation manual 1-3) to a remotely driven
            //course pointer: an EFIS directly, or an HSI through a KA 90 -0201/-0202 (KA 90 manual 1-2). BNR, bits 17-28
            //with a 180/4096 deg LSB, bit 29 = 1 for 180-360 deg, bit 11 = 1 when the LRN controls the course select
            //(GAMA 11 page 10). The KA 90 can also drive the pointer from label 114 desired track (KA 90 manual 1-2). The
            //KLN has no analog course output
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
        //Real unit: the OBS course, either
        //- ARINC 429 transmitter, label 100 selected course #1 (see above)
        //- RS-232 OUT, item I desired track, which in OBS mode is the course at the active waypoint, magnetic with its
        //  variation, in tenths of a degree (Installation manual A-5, A-6)
        if (obsMag === null) {
            SimVar.SetSimVarValue('GPS OBS VALUE', SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue('GPS OBS VALUE', SimVarValueType.Degree, obsMag);
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
        SimVar.SetSimVarValue(LVAR_XTK, SimVarValueType.NM, xtk ?? 0);

        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //Real unit: the CDI scale, either
        //- analog: the deviation voltage of P901 pin 22 against pin 25 is 30, 150 or 500 mV per nm for a full scale of 5,
        //  1 or 0.3 nm (Installation manual 1-7)
        //- ARINC 429 transmitter, label 326 lateral deviation scale factor: BNR, bits 14-28 full-scale deflection in nm
        //  with a 128/32768 nm LSB (GAMA 11 page 24)
        SimVar.SetSimVarValue('GPS CDI SCALING', SimVarValueType.Meters, UnitType.NMILE.convertTo(scaling, UnitType.METER));
        //Real unit: fictional, no output says whether there is an active waypoint. The nearest are the NAV flag (P901 pin
        //19 against pin 25, flag in view below 50 mV), the NAV superflag (P901 pin 18, invalid below 3.5 V) (Installation
        //manual 1-7, 2-5) and ARINC 429 label 275 bit 29 HSI valid, 0 = nav warning (GAMA 11 page 19)
        if (xtk === null) {
            this.xtkFilter.setValue(0, scaling);
            SimVar.SetSimVarValue('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, false);
            SimVar.SetSimVarValue('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, false);
        } else {
            this.xtkFilter.setValue(-xtk, scaling);
            SimVar.SetSimVarValue('GPS IS ACTIVE FLIGHT PLAN', SimVarValueType.Bool, true);
            SimVar.SetSimVarValue('GPS IS ACTIVE WAY POINT', SimVarValueType.Bool, true);
        }

        //The KLN does not output vertical information
        //Real unit: fictional, the unit has no vertical deviation output. Written as constants
        SimVar.SetSimVarValue('GPS GSI SCALING', SimVarValueType.Meters, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ANGLE', SimVarValueType.Degree, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ANGLE ERROR', SimVarValueType.Degree, 0);
        SimVar.SetSimVarValue('GPS VERTICAL ERROR', SimVarValueType.Meters, 0);
        SimVar.SetSimVarValue('GPS HAS GLIDEPATH', SimVarValueType.Bool, false);
    }

    public setToFrom(toFrom: boolean | null) {
        //Real unit: TO/FROM, any of
        //- analog: P901 pin 21 +TO against pin 20 +FROM, TO = +40 to +160 mV, FROM = -40 to -160 mV (Installation manual
        //  1-8, 2-5). The flagged state 0 shows on the NAV flag (pins 19/25) and the NAV
        //  superflag (pin 18) instead (Installation manual 1-7, 2-5), and as label 275 bit 29 HSI valid = 0 (GAMA 11 page
        //  19)
        //- ARINC 429 transmitter, label 275: bit 23 = 1 TO, bit 24 = 1 FROM (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character e: T or F, dashed while NAV is flagged (Installation manual A-6)
        if (toFrom === null) {
            SimVar.SetSimVarValue(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, 0);
        } else {
            SimVar.SetSimVarValue(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, toFrom === TO ? 1 : 2);
        }
    }

    /**
     * The deviation bar signal is filtered by analog circuitry (see SignalOutputFilter), so we set this more often
     */
    public setFilteredOutputs() {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //Real unit: the analog CDI deviation, P901 pin 22 +RIGHT against pin 25 +LEFT/NAV FLAG -, +/-150 mV at full scale
        //and +/-300 mV at most (Installation manual 1-7, 2-5). The digital cross track is ARINC 429 label 116 (setXTK)
        SimVar.SetSimVarValue('GPS WP CROSS TRK', SimVarValueType.Meters, UnitType.NMILE.convertTo(this.xtkFilter.getCurrentValue(), UnitType.METER));
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
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //Real unit: GPS WP TRACK ANGLE ERROR is fictional. No output carries it; a receiver can subtract ARINC 429 label
        //313 track from label 114 desired track
        //Real unit: GPS WP DESIRED TRACK, any of
        //- ARINC 429 transmitter, label 114 desired track, true: BNR, bits 17-28 with a 180/4096 deg LSB, bit 29 = 1 for
        //  180-360 deg (GAMA 11 page 12). Magnetic with label 147 magnetic variation
        //- RS-232 OUT, item I desired track, magnetic, in tenths of a degree: the DTK less the variation at the aircraft
        //  in LEG mode, the course at the active waypoint with its variation in OBS mode (Installation manual A-5, A-6)
        //- ARINC 429 transmitter, label 100 selected course, in OBS mode (setObs)
        if (dtkTrue === null) {
            SimVar.SetSimVarValue('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, 0);
            SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, 0);
        } else {
            if (actualTrack === null) {
                SimVar.SetSimVarValue('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, 0);
            } else {
                SimVar.SetSimVarValue('GPS WP TRACK ANGLE ERROR', SimVarValueType.Radians, UnitType.DEGREE.convertTo(NavMath.diffAngle(actualTrack, dtkTrue), UnitType.RADIAN));
            }
            SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(dtkTrue, magvar), UnitType.RADIAN));

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
            SimVar.SetSimVarValue(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(bearingToActive, magvar), UnitType.RADIAN));
        }

        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //Real unit: GPS WP TRUE BEARING is ARINC 429 transmitter label 115 waypoint bearing, true: BNR, bits 17-28 with a
        //180/4096 deg LSB, bit 29 = 1 for 180-360 deg, measured from the aircraft to the waypoint (GAMA 11 page 12). GPS
        //WP BEARING is its magnetic form, which the unit sends only as RS-232 item L and on the OBI bus (see above). The
        //real unit has one bearing; on a DME arc bearingForAP is the DTK instead, which is fictional
        if (bearingForAP === null) {
            SimVar.SetSimVarValue('GPS WP BEARING', SimVarValueType.Radians, 0);  //This SimVar appears to be readonly??
            SimVar.SetSimVarValue('GPS WP TRUE BEARING', SimVarValueType.Radians, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(MagVar.trueToMagnetic(bearingForAP, magvar), UnitType.RADIAN));  //This SimVar appears to be readonly??
            SimVar.SetSimVarValue('GPS WP TRUE BEARING', SimVarValueType.Radians, UnitType.DEGREE.convertTo(bearingForAP, UnitType.RADIAN));
        }
    }

    public setDistance(distance: NauticalMiles | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //Real unit: the distance to the active waypoint, any of
        //- ARINC 429 transmitter, label 251 distance to go: BNR, bits 14-28 nm with a 0.125 nm LSB, bit 29 always 0
        //  (GAMA 11 page 17)
        //- ARINC 429 transmitter, label 001 distance to go: BCD, bits 11-14 tenths, 15-18 units, 19-22 tens, 23-26
        //  hundreds, 27-29 thousands of nm (GAMA 11 page 2). For a distance indicator, which shows 34.5 NM during the self
        //  test (Installation manual 2-69)
        //- RS-232 OUT, item E distance to active waypoint, nm x 10 (Installation manual A-5)
        if (distance === null) {
            SimVar.SetSimVarValue('GPS WP DISTANCE', SimVarValueType.Meters, 0);
        } else {
            SimVar.SetSimVarValue('GPS WP DISTANCE', SimVarValueType.Meters, UnitType.NMILE.convertTo(distance, UnitType.METER));
        }
    }

    public setPos(pos: LatLonInterface | null, speed: Knots | null, track: Degrees | null, magvar: number, integretyWarning: boolean) {
        //The LVar is an output of the unit, independent of the GPS SimVars
        //Real unit: ARINC 429 transmitter, label 261 GPS discrete word bit 24 GPS integrity, 1 = fail (GAMA 11 page 18).
        //No analog or RS-232 output carries it
        SimVar.SetSimVarValue(LVAR_INTEGRITY_WARNING, SimVarValueType.Bool, integretyWarning);

        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //Real unit: the magnetic variation, either
        //- ARINC 429 transmitter, label 147 magnetic variation: BNR, bits 17-28 with a 180/4096 deg LSB, bit 29 = 1 West,
        //  bit 11 = 1 pilot entered, 0 computed (GAMA 11 page 14)
        //- RS-232 OUT, item Q magnetic variation, E or W and tenths of a degree: at the aircraft in LEG mode, at the active
        //  waypoint in OBS mode (Installation manual A-5, A-6)
        SimVar.SetSimVarValue('GPS MAGVAR', SimVarValueType.Radians, UnitType.DEGREE.convertTo(magvar, UnitType.RADIAN));

        //Real unit: the present position, either
        //- ARINC 429 transmitter, labels 310 latitude and 311 longitude: BNR, bits 9-28 with a 180/1048576 deg LSB and no
        //  SDI, bit 29 = 1 South or West (GAMA 11 page 23)
        //- RS-232 OUT, items A latitude and B longitude: N/S or E/W, degrees, minutes, hundredths of minutes
        //  (Installation manual A-5)
        if (pos === null) {
            SimVar.SetSimVarValue('GPS POSITION LAT', SimVarValueType.Degree, 0);
            SimVar.SetSimVarValue('GPS POSITION LON', SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue('GPS POSITION LAT', SimVarValueType.Degree, pos.lat);
            SimVar.SetSimVarValue('GPS POSITION LON', SimVarValueType.Degree, pos.lon);
        }
        //Real unit: the ground speed, any of
        //- ARINC 429 transmitter, label 312 ground speed: BNR, bits 14-28 knots with a 0.125 kt LSB, bit 29 always 0
        //  (GAMA 11 page 23)
        //- ARINC 429 transmitter, label 012 ground speed: BCD, bits 11-29 in tenths of a knot (GAMA 11 page 2)
        //- RS-232 OUT, item D ground speed in knots (Installation manual A-5)
        if (speed === null) {
            SimVar.SetSimVarValue('GPS GROUND SPEED', SimVarValueType.MetersPerSecond, 0);
        } else {
            SimVar.SetSimVarValue('GPS GROUND SPEED', SimVarValueType.MetersPerSecond, UnitType.KNOT.convertTo(speed, UnitType.MPS));
        }
        //Real unit: GPS GROUND TRUE TRACK is ARINC 429 transmitter label 313 track angle, true: BNR, bits 17-28 with a
        //180/4096 deg LSB, bit 29 = 1 for 180-360 deg (GAMA 11 page 23). GPS GROUND MAGNETIC TRACK is RS-232 OUT item C
        //track, magnetic, dashed below 2 kt: with the variation at the aircraft in LEG mode, at the active waypoint in
        //OBS mode (Installation manual A-5, A-6)
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
        //Real unit: GPS WP ETE, either
        //- ARINC 429 transmitter, label 252 time to go: BNR, bits 20-28 minutes with a 1 min LSB, bit 29 always 0 (GAMA 11
        //  page 17)
        //- ARINC 429 transmitter, label 002 time to go: BCD, bits 15-29 in tenths of a minute, bits 11-14 spare (GAMA 11
        //  page 2)
        //There is no RS-232 item for it.
        //Real unit: GPS WP ETA is fictional. The unit only sends the time itself, ARINC 429 label 150 GMT: BNR, bits 12-17
        //seconds, 18-23 minutes, 24-28 hours (GAMA 11 page 14)
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
        //Real unit: GPS ETE is ARINC 429 transmitter label 352 time to destination via the flight plan: BNR, bits 17-28
        //minutes with a 1 min LSB, bit 29 always 0 (GAMA 11 page 25). No RS-232 item; RS-232 item l is only the distance
        //to the destination (Installation manual A-6).
        //Real unit: GPS ETA is fictional, as GPS WP ETA is (setWPTETE)
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
        //Real unit: the flight plan output (see WTFlightplanSync), either
        //- RS-232 OUT, item w flight plan data, one item per waypoint and at most 32: bits 0-4 of the sequence byte are
        //  the waypoint number, bit 5 = 1 for the active waypoint, bit 6 = 1 for the last one (Installation manual A-8)
        //- ARINC 429 transmitter, label 074 data record header, bits 9-15 the number of records; label 075 active
        //  waypoint from/to, the TO record number in BCD with the tens in bits 13-16 and the units in bits 21-24 (GAMA 11
        //  pages 9, 10)
        SimVar.SetSimVarValue('GPS FLIGHT PLAN WP COUNT', SimVarValueType.Number, countTotal);
        SimVar.SetSimVarValue('GPS FLIGHT PLAN WP INDEX', SimVarValueType.Number, index + 1);
    }

    public setNextWpt(wpt: Facility | null) {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //Real unit: the active waypoint, any of
        //- RS-232 OUT, item K active waypoint identifier, five ASCII characters (Installation manual A-5)
        //- RS-232 OUT, the item w record whose sequence byte has the active bit: bytes 2-6 identifier, 7-13 packed
        //  latitude and longitude (Installation manual A-8, A-9)
        //- ARINC 429 transmitter, the record numbered as the TO of label 075 (setWPIndex): label 303 bits 17-23 its
        //  number; labels 304 and 305 identifier characters 1-3 and 4-6 in 7-bit fields at bits 9-15, 16-22 and 23-29;
        //  labels 306 latitude and 307 longitude, BNR bits 9-28 with a 180/1048576 deg LSB, bit 29 = 1 South or West
        //  (GAMA 11 pages 21 to 23)
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
        //Real unit: the from waypoint, either
        //- ARINC 429 transmitter, the record numbered as the FROM of label 075, BCD tens in bits 17-20 and units in bits
        //  25-28 (GAMA 11 page 10), with the words of setNextWpt
        //- RS-232 OUT, the item w record before the active one; it has no flag of its own (Installation manual A-8)
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
        //Real unit: the MSG annunciator, any of
        //- P901 pin 15 MSG, pulled low (sinks up to 250 mA) to light a remote lamp, open when off (Installation manual 1-7,
        //  2-5)
        //- ARINC 429 transmitter, label 275 bit 27 message alert, 1 = on (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character b: N new message, P persistent message, dashed otherwise
        //  (Installation manual A-6)
        SimVar.SetSimVarValue(LVAR_MSG_LIGHT, SimVarValueType.Bool, lightOn);
    }

    public setWptAlertLight(lightOn: boolean) {
        //Real unit: the WPT annunciator, any of
        //- P901 pin 14 WPT ALERT, pulled low (sinks up to 250 mA) to light a remote lamp, open when off (Installation
        //  manual 1-7, 2-5)
        //- ARINC 429 transmitter, label 275 bit 11 waypoint alert, 1 = on (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character a: W waypoint alert, T in turn, dashed otherwise (Installation
        //  manual A-6)
        SimVar.SetSimVarValue(LVAR_WPT_LIGHT, SimVarValueType.Bool, lightOn);
    }

    public setAnnunTest(lightOn: boolean) {
        //Real unit: fictional as one signal. On the self-test page the unit pulls all four annunciator outputs low, P901
        //pins 14 WPT, 15 MSG, 16 APPROACH ACTIVE and 17 APPROACH ARM (Installation manual 2-69). The OBS and LEG lamps of
        //the GPS CRS switch are not the KLN's
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

        //Real unit: K:GPS_OBS_ON/K:GPS_OBS_OFF (GPS OBS ACTIVE) is LEG or OBS mode, any of
        //- no pin: with the GPS CRS switch, its own contacts light the OBS and LEG lamps, and the KLN reads its position
        //  as a level on pin 33 (Installation manual 2-6, 2-69, figure 2-17 sheet 8 on 2-57)
        //- ARINC 429 transmitter, label 075 bit 9: 0 = LEG, 1 = OBS (GAMA 11 page 10). Label 275 bit 13 = 1 direct to
        //  (GAMA 11 page 19)
        //- RS-232 OUT, item t GPS discretes, character d: L leg, D direct to, O OBS, T OBS to leg transition
        //  (Installation manual A-6)
        //Real unit: GPS IS APPROACH ACTIVE and GPS APPROACH MODE (0 en route, 1 armed, 2 active, 3 self-test) are the
        //approach annunciation, any of
        //- P901 pin 17 APPROACH ARM and pin 16 APPROACH ACTIVE, each pulled low (sinks up to 250 mA) to light its lamp
        //  (Installation manual 1-7, 2-5). On the self-test page both are on (2-69), which 3 stands for
        //- ARINC 429 transmitter, label 261 bits 25-27 (read 27-26-25): 000 en route, 001 terminal, 010 approach; label 275
        //  bit 16 = 1 approach deviation scaling (GAMA 11 pages 18, 19). GAMA 11 has no approach arm bit
        //- RS-232 OUT, item t GPS discretes, character c: E en route, T terminal, R approach arm, A approach active
        //  (Installation manual A-6)
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

    public setRollCommand(bankAngle: number | null, courseToSteer: number | null) {
        //Real unit: roll steering, either
        //- ARINC 429 transmitter, label 121 horizontal command (Installation manual 1-3): BNR, bits 15-28 with a 180/16384
        //  deg LSB, bit 29 = 1 fly left, 0 fly right (GAMA 11 page 13). So a positive value is fly right, the opposite of
        //  the LVar, which is positive for a left bank. Only with a heading input (Installation manual 2-69); the self test
        //  commands 0, 5 deg right, 0 (2-70)
        //- analog roll steering, converted from label 121 by a KA 90 (KA 90 manual 1-2)
        if (bankAngle === null) {
            SimVar.SetSimVarValue(LVAR_ROLL_COMMAND, SimVarValueType.Degree, 0);
        } else {
            SimVar.SetSimVarValue(LVAR_ROLL_COMMAND, SimVarValueType.Degree, bankAngle);
        }

        //The real KLN does not have this, but we do and there is a SimVar for this...
        //Real unit: GPS COURSE TO STEER is fictional, no output carries it
        if (!this.options.output.writeGPSSimVars) {
            return;
        }
        //The maintainer held GPS COURSE TO STEER at 0 in the sim on 2026-10-19 and the default autopilot still tracked the
        //flight plan perfectly, so the sim's autopilot does not read it. It carries the course to steer of the roll
        //steering law, and 0 without a heading input or without a path (the maintainer's decision, 2026-10-19, reversing
        //the #143 exemption). The DTK goes to GPS WP DESIRED TRACK (setDesiredTrack), not here
        if (courseToSteer === null) {
            SimVar.SetSimVarValue('GPS COURSE TO STEER', SimVarValueType.Number, 0);
        } else {
            SimVar.SetSimVarValue('GPS COURSE TO STEER', SimVarValueType.Number, UnitType.DEGREE.convertTo(courseToSteer, UnitType.RADIAN));
        }
    }

    /**
     * The ticks that write the L:KLN90B_* outputs stop when the unit loses power, so the zero state is written once.
     * The GPS SimVars are left alone, see the note in reset().
     */
    public setPoweredOff(): void {
        //Real unit: without power the annunciator pins are open, the 429 transmitter is silent and the analog outputs
        //are flagged; each output's interface is on its setter above
        SimVar.SetSimVarValue(LVAR_ROLL_COMMAND, SimVarValueType.Degree, 0);
        SimVar.SetSimVarValue(LVAR_HSI_TF_FLAGS, SimVarValueType.Enum, 0);
        SimVar.SetSimVarValue(LVAR_MSG_LIGHT, SimVarValueType.Bool, false);
        SimVar.SetSimVarValue(LVAR_WPT_LIGHT, SimVarValueType.Bool, false);
        SimVar.SetSimVarValue(LVAR_ANNUN_TEST, SimVarValueType.Bool, false);
        SimVar.SetSimVarValue(LVAR_INTEGRITY_WARNING, SimVarValueType.Bool, false);
        SimVar.SetSimVarValue(LVAR_GPS_WP_BEARING, SimVarValueType.Radians, 0);
        SimVar.SetSimVarValue(LVAR_XTK, SimVarValueType.NM, 0);
        this.xtkFilter.reset();
    }

    public setGpsOverriden(): void {
        if (!this.options.output.writeGPSSimVars) {
            return;
        }

        //Real unit: fictional, the sim's claim that this gauge writes the GPS SimVars
        SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, true);
    }

    public reset() {
        //#350: a unit disabled for hot swapping has released the GPS to the unit that replaced it, so a power change does
        //not claim it. SimVarSync.setDisabled claims it again on the resume
        if (!this.options.output.writeGPSSimVars || this.hardware.isDisabled) {
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


    constructor(bus: EventBus, userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, audioGenerator: AudioGenerator, messageHandler: MessageHandler, hardware: Hardware) {
        this.in = new SensorsIn(bus, userSettings, options, messageHandler);
        this.out = new SensorsOut(options, audioGenerator, hardware);

        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.reset.bind(this));
    }


    tick() {
        this.in.tick();
    }

    private reset(evt: PowerEventData) {
        this.in.reset();
        this.out.reset();
        if (!evt.isPowered) {
            this.out.setPoweredOff();
        }
    }

}