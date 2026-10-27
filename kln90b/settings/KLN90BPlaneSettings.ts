import {SimVarValueType} from "@microsoft/msfs-sdk";
import {LVAR_ELECTRICITY_INDEX, LVAR_GPS_SIMVARS, LVAR_HEADING_INPUT, LVAR_OBS_SOURCE, LVAR_OBS_TARGET} from "../LVars";

/**
 * The index of Input.ElectricitySimVar is only a trailing colon and digits ("CIRCUIT ON:1"). Any other colon belongs to the
 * name: the prefix of an LVar or an A: variable ("L:MY_AVIONICS_BUS").
 */
export const ELECTRICITY_INDEX = /:(\d+)$/;

/**
 * The heading SimVar of Input.HeadingInput true. A string in the key names another one, for aircraft with their own gyro
 * simulation (#405)
 */
export const DEFAULT_HEADING_SIMVAR = 'PLANE HEADING DEGREES GYRO';

export const enum FuelUnit {
    GAL = "GAL",
    IMP = "IMP",
    L = "L",
    KG = "KG",
    LB = "LB",
}

export const enum FuelType {
    AVGAS = "Avgas",
    JET_A1 = "JetA1",
    JET_B = "JetB",
}

export interface KLN90PlaneSettings {
    takeHomeMode: boolean;
    basePath: string,
    debugMode: boolean; //Skips test pages, GPS available immediately
    vfrOnly: boolean;
    input: {
        altimeterInterfaced: boolean; //example for no input: https://youtu.be/S1lt2W95bLA?t=176
        obsSource: number;
        headingInput: boolean;
        headingSimVar: string; //Read in degrees while headingInput is set
        electricitySimVar: string,
        airdata: {
            isInterfaced: boolean,
            baroSource: number;
        },
        fuelComputer: {
            isInterfaced: boolean,
            unit: FuelUnit,
            type: FuelType,
            fobTransmitted: boolean,
            fuelUsedTransmitted: boolean,
        }
        externalSwitches: {
            legObsSwitchInstalled: boolean,
            appArmSwitchInstalled: boolean,
        };
    }
    output: {
        obsTarget: number;
        altitudeAlertEnabled: boolean;
        writeGPSSimVars: boolean;
    }
}

/**
 * True if an air data computer sends the baro setting. BaroSource is ignored without an air data computer, as the
 * fuel computer keys are without a fuel computer (#360)
 */
export function isBaroTransmitted(settings: KLN90PlaneSettings): boolean {
    return settings.input.airdata.isInterfaced && settings.input.airdata.baroSource > 0;
}

const OBS_DEVICES = [0, 1, 2] as const;
const BARO_SOURCES = [0, 1, 2] as const;
const FUEL_UNITS = [FuelUnit.GAL, FuelUnit.IMP, FuelUnit.L, FuelUnit.KG, FuelUnit.LB] as const;
const FUEL_TYPES = [FuelType.AVGAS, FuelType.JET_A1, FuelType.JET_B] as const;

export class KLN90BPlaneSettingsParser {

    /**
     * One line for each invalid value of the last parse, for the aircraft developer (#145). An invalid value is never
     * used; the key gets its default instead.
     */
    public problems: string[] = [];

    public parsePlaneSettings(xmlConfig: Document): KLN90PlaneSettings {
        this.problems = [];

        const instrumentsTag = this.getKLNInstrumentsTag(xmlConfig);
        const headingSimVar = this.getHeadingSimVar(instrumentsTag, "Input.HeadingInput");

        //The panel.xml keys stand for how the unit is wired and strapped at the P901 connector, which the real unit reads at
        //power-up. "Real unit:" comments name the interface: P901 pins and RS-232 items from the Installation manual
        //(006-10521-0005 Rev 5, appendix A for RS-232), ARINC 429 labels in GAMA format (Installation manual 1-1)
        const options: KLN90PlaneSettings = {
            //Real unit: P901 pin 2 TAKE HOME. Grounded = take-home mode, which acts as if the GPS had a fix at the last or
            //the entered position; always open in an aircraft (Installation manual 1-6, 2-4)
            takeHomeMode: this.getBoolean(instrumentsTag, "TakeHomeMode", false),
            //Real unit: fictional, where the gauge's files are in the sim package
            basePath: this.getString(instrumentsTag, "BasePath", 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B'),
            //Real unit: P901 pin 30 APPROACH ARM SELECT strapped to pin 16 APPROACH ACTIVE, sampled at power-up. Interconnect
            //drawing, figure 2-17 sheet 8 (Installation manual 2-57), "VFR ONLY"
            vfrOnly: this.getBoolean(instrumentsTag, "VFROnly", false),
            input: {
                //Real unit: an altitude source, any of
                //- Gray code from an encoding altimeter: P901 pins 41-50 = D4, A1, A2, A4, B1, B2, B4, C1, C2, C4 (no D1/D2
                //  inputs), pressure altitude in 100 ft steps (Installation manual 1-6, 2-7, figure 2-17 sheet 3 on 2-47)
                //- ARINC 429 air data receiver, P901 pins 8/9, label 203 (see Input.Airdata.IsInterfaced)
                //- RS-232 IN, P901 pin 36, fuel/air data format C or D, bytes 64-69 pressure altitude (see
                //  Input.Airdata.IsInterfaced)
                //The key only switches the gray code: Airdata.tick reads the altitude itself when an air data computer is
                //interfaced
                altimeterInterfaced: this.getBoolean(instrumentsTag, "Input.AltimeterInterfaced", true),
                //Real unit: where the selected course comes from, read by SensorsIn.tick
                //- 1, 2: the OBS resolver of a CDI/HSI, P901 pin 26 sine in, pin 37 cosine in, excited by the 450 Hz of
                //  pin 31 OBS RESOLVER OUT, read only while pin 1 GPS DISPLAYED is open (Installation manual 1-6, 1-7,
                //  2-4, 2-6)
                //- 1, 2: or ARINC 429 EFIS receiver, P901 pins 4/5, label 100 selected course, from an EFIS or a KA 90
                //  that reads the indicator's resolver or XYZ course (Installation manual 1-2, 2-4; KA 90 manual 1-1)
                //- 0: none of these, pin 1 grounded. The course is set on MOD 2 only
                obsSource: this.getChoice(instrumentsTag, "Input.ObsSource", OBS_DEVICES, 1),
                //Real unit: a heading source (Installation manual 2-69), any of
                //- ARINC 429 EFIS receiver, P901 pins 4/5, label 314 true heading or label 320 magnetic heading (Installation
                //  manual 1-2), from an EFIS 40/50 or a KA 90 that converts 3-wire heading
                //- RS-232 IN, P901 pin 36, fuel/air data format C or D, bytes 100-102 magnetic heading (Installation
                //  manual A-13), e.g. from a Shadin converter
                headingInput: headingSimVar !== null,
                //Real unit: fictional, the SimVar that stands for the heading source above
                headingSimVar: headingSimVar ?? DEFAULT_HEADING_SIMVAR,
                //Real unit: P901 pin 40 A/C POWER, 11 to 33 VDC, with pin 27 A/C GROUND (Installation manual 1-5, 2-6, 2-7)
                electricitySimVar: this.getString(instrumentsTag, "Input.ElectricitySimVar", "").trim(), //A pretty-printed element ends in whitespace, which would hide the index
                airdata: {
                    //Real unit: an air data computer on either
                    //- ARINC 429 air data receiver, P901 pins 8/9, labels 203 pressure altitude, 204 baro-corrected altitude,
                    //  205 Mach, 210 TAS, 211 TAT, 213 SAT (Installation manual 1-2, 2-4). false = pins 8/9 wired to the
                    //  429 transmitter pins 23/24, otherwise AIR DATA FAIL is shown
                    //- RS-232 IN, P901 pin 36, fuel/air data format C or D (Installation manual A-11 to A-13). The 429 value
                    //  wins when both send an item
                    isInterfaced: this.getBoolean(instrumentsTag, "Input.Airdata.IsInterfaced", false),
                    //Real unit: only RS-232 IN, P901 pin 36, format D, bytes 108-112 barometric setting (Installation manual
                    //A-13). The 429 air data receiver takes no baro setting label; it gets label 204 baro-corrected
                    //altitude instead (Installation manual 1-2, 2-68). Without either, the pilot enters the baro
                    baroSource: this.getChoice(instrumentsTag, "Input.Airdata.BaroSource", BARO_SOURCES, 0),
                },
                fuelComputer: {
                    //Real unit: RS-232 IN, P901 pin 36, fuel/air data format A, B, C or D, sent every 1.6 s (Installation
                    //manual 2-7, A-10 to A-13). false = pin 36 looped to pin 13 RS-232 OUT, otherwise NO RS-232 DATA is
                    //shown. There is no fuel input on ARINC 429
                    isInterfaced: this.getBoolean(instrumentsTag, "Input.FuelComputer.IsInterfaced", false),
                    //Real unit: RS-232 fuel/air data byte 2, units of measure: G, I, L, K or B (Installation manual A-10)
                    unit: this.getChoice(instrumentsTag, "Input.FuelComputer.Unit", FUEL_UNITS, FuelUnit.GAL),
                    //Real unit: fictional. The fuel computer sends volume or mass; the type only converts the sim's pounds
                    type: this.getChoice(instrumentsTag, "Input.FuelComputer.Type", FUEL_TYPES, FuelType.AVGAS),
                    //Real unit: false = format D with asterisks in bytes 3-9 total fuel remaining, so the pilot enters
                    //the fuel on board (Installation manual A-13)
                    fobTransmitted: this.getBoolean(instrumentsTag, "Input.FuelComputer.FOBTransmitted", true),
                    //Real unit: false = format A, which has no fuel used. Formats B, C and D carry it in bytes 31-51
                    //(Installation manual A-10, A-11)
                    fuelUsedTransmitted: this.getBoolean(instrumentsTag, "Input.FuelComputer.FuelUsedTransmitted", true),
                },
                externalSwitches: {
                    //Real unit: P901 pin 33 LEG/OBS CONTROL, sampled at power-up. true = the latching GPS CRS switch,
                    //which holds pin 33 grounded in OBS and open in LEG, and the MOD page selection is disabled. false =
                    //pin 33 strapped to pin 21 +TO (Installation manual 2-6, figure 2-17 sheet 8 on 2-57)
                    legObsSwitchInstalled: this.getBoolean(instrumentsTag, "Input.ExternalSwitches.LegObsSwitchInstalled", false),
                    //Real unit: P901 pin 30 APPROACH ARM SELECT, sampled at power-up. true = the GPS APR switch, each momentary
                    //ground arms or disarms the approach (H:KLN90B_ApprArm_Push). false without VFROnly = pin 30 strapped
                    //to pin 17 APPROACH ARM, "IFR ENROUTE ONLY" (Installation manual 2-6, figure 2-17 sheet 8 on 2-57)
                    appArmSwitchInstalled: this.getBoolean(instrumentsTag, "Input.ExternalSwitches.AppArmSwitchInstalled", false),
                },
            },
            output: {
                //Real unit: a remotely driven course pointer, fed by ARINC 429 transmitter P901 pins 23/24, label 100
                //selected course: an EFIS directly, or a mechanical HSI through a KA 90 -0201/-0202, which can also drive
                //the pointer from label 114 desired track (Installation manual 1-3, 2-67; KA 90 manual 1-2). The KLN has
                //no analog course output of its own
                obsTarget: this.getChoice(instrumentsTag, "Output.ObsTarget", OBS_DEVICES, 0),
                //Real unit: P901 pin 38 ALT ALERT, sampled at power-up. Open or driving a Sonalert/lamp = output, and the
                //pilot can use the altitude alert. Grounded = input, and the alert functions are disabled (Installation
                //manual 1-6, 2-7)
                altitudeAlertEnabled: this.getBoolean(instrumentsTag, "Output.AltitudeAlertEnabled", false),
                //Real unit: fictional. It switches the sim's GPS SimVars and the Working Title flight plan, which stand for
                //the unit's analog nav outputs, its ARINC 429 transmitter and its RS-232 OUT together (see SensorsOut)
                writeGPSSimVars: this.getBoolean(instrumentsTag, "Output.WriteGPSSimVars", true),
            },
            debugMode: false,
        };

        //Installation manual 2-6: The approach arm select pin is either strapped for VFR only or wired to the approach
        //arm switch, so a VFR only unit cannot have the switch
        if (options.vfrOnly && options.input.externalSwitches.appArmSwitchInstalled) {
            this.problems.push("Input.ExternalSwitches.AppArmSwitchInstalled: a VFR only unit (VFROnly true) has no approach arm switch. The default false is used.");
            options.input.externalSwitches.appArmSwitchInstalled = false;
        }

        console.log("Plane Settings", options, xmlConfig);
        if (this.problems.length > 0) {
            console.warn("Invalid panel.xml values", this.problems);
        }

        //Real unit: fictional. The runtime overrides start from the panel.xml values; SimVarSync reads them back. A real
        //installation's wiring can only change through a relay, as the NAV/GPS switching does (figure 2-17 sheets 4 to 6,
        //Installation manual 2-49 to 2-53)
        SimVar.SetSimVarValue(LVAR_OBS_SOURCE, SimVarValueType.Number, options.input.obsSource);
        SimVar.SetSimVarValue(LVAR_OBS_TARGET, SimVarValueType.Number, options.output.obsTarget);
        SimVar.SetSimVarValue(LVAR_HEADING_INPUT, SimVarValueType.Bool, options.input.headingInput);
        SimVar.SetSimVarValue(LVAR_GPS_SIMVARS, SimVarValueType.Bool, options.output.writeGPSSimVars);
        const electricityIndex = ELECTRICITY_INDEX.exec(options.input.electricitySimVar);
        if (electricityIndex !== null) {
            SimVar.SetSimVarValue(LVAR_ELECTRICITY_INDEX, SimVarValueType.Number, Number(electricityIndex[1]));
        }

        return options;
    }

    private getKLNInstrumentsTag(xmlConfig: Document): Element | null {
        const instrumentConfigs = xmlConfig.getElementsByTagName('Instrument');
        for (let i = 0; i < instrumentConfigs.length; i++) {
            const el = instrumentConfigs.item(i);

            if (el !== null) {
                const nameEl = el.getElementsByTagName('Name');
                if (nameEl.length > 0 && nameEl[0].textContent === "KLN90B") {
                    return el;
                }
            }
        }
        return null;
    }

    private getString(element: Element | null, key: string, defaultvalue: string): string {
        return this.getText(element, key) ?? defaultvalue;
    }

    /**
     * Only true or false. Anything else, like True or 1, is rejected
     */
    private getBoolean(element: Element | null, key: string, defaultvalue: boolean): boolean {
        const text = this.getText(element, key)?.trim();
        if (text === undefined) {
            return defaultvalue;
        }
        switch (text) {
            case "true":
                return true;
            case "false":
                return false;
            default:
                return this.reject(key, text, "true or false", defaultvalue);
        }
    }

    /**
     * true for the default heading SimVar, false for none, or the name of a SimVar (#405). A name starts with a letter
     * and has a space (HEADING INDICATOR) or a prefix (L:MY_HEADING), so a misspelled boolean like True, flase or 1 is
     * still rejected instead of switching the input on. A name may not end in a colon (L:)
     * @returns The SimVar, or null without a heading input
     */
    private getHeadingSimVar(element: Element | null, key: string): string | null {
        const text = this.getText(element, key)?.trim();
        if (text === undefined) {
            return null;
        }
        switch (text) {
            case "true":
                return DEFAULT_HEADING_SIMVAR;
            case "false":
                return null;
        }
        if (!/^[A-Za-z]/.test(text) || !/[ :]/.test(text) || text.endsWith(":")) {
            this.reject(key, text, "true, false or a SimVar", false);
            return null;
        }
        return text;
    }

    /**
     * One of the documented values, written exactly as listed
     */
    private getChoice<T extends string | number>(element: Element | null, key: string, choices: readonly T[], defaultvalue: T): T {
        const text = this.getText(element, key)?.trim();
        if (text === undefined) {
            return defaultvalue;
        }
        const choice = choices.find(c => String(c) === text);
        if (choice === undefined) {
            return this.reject(key, text, `one of ${choices.join(", ")}`, defaultvalue);
        }
        return choice;
    }

    private reject<T>(key: string, text: string, expected: string, defaultvalue: T): T {
        this.problems.push(`${key}: "${text}" is not ${expected}. The default ${defaultvalue} is used.`);
        return defaultvalue;
    }

    /**
     * The text of the element at the dotted path, or undefined if the key is missing
     */
    private getText(element: Element | null, key: string): string | undefined {
        if (element === null) {
            return undefined;
        }

        const keys = key.split(".");
        for (const subkey of keys) {
            const elements: HTMLCollectionOf<Element> = element!.getElementsByTagName(subkey);
            if (elements.length == 0 || elements[0] === null) {
                return undefined;
            }
            element = elements[0];
        }

        return element.textContent ?? undefined;
    }

}
