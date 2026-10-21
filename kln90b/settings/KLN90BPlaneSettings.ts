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

        const options: KLN90PlaneSettings = {
            takeHomeMode: this.getBoolean(instrumentsTag, "TakeHomeMode", false),
            basePath: this.getString(instrumentsTag, "BasePath", 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B'),
            vfrOnly: this.getBoolean(instrumentsTag, "VFROnly", false),
            input: {
                altimeterInterfaced: this.getBoolean(instrumentsTag, "Input.AltimeterInterfaced", true),
                obsSource: this.getChoice(instrumentsTag, "Input.ObsSource", OBS_DEVICES, 1),
                headingInput: headingSimVar !== null,
                headingSimVar: headingSimVar ?? DEFAULT_HEADING_SIMVAR,
                electricitySimVar: this.getString(instrumentsTag, "Input.ElectricitySimVar", "").trim(), //A pretty-printed element ends in whitespace, which would hide the index
                airdata: {
                    isInterfaced: this.getBoolean(instrumentsTag, "Input.Airdata.IsInterfaced", false),
                    baroSource: this.getChoice(instrumentsTag, "Input.Airdata.BaroSource", BARO_SOURCES, 0),
                },
                fuelComputer: {
                    isInterfaced: this.getBoolean(instrumentsTag, "Input.FuelComputer.IsInterfaced", false),
                    unit: this.getChoice(instrumentsTag, "Input.FuelComputer.Unit", FUEL_UNITS, FuelUnit.GAL),
                    type: this.getChoice(instrumentsTag, "Input.FuelComputer.Type", FUEL_TYPES, FuelType.AVGAS),
                    fobTransmitted: this.getBoolean(instrumentsTag, "Input.FuelComputer.FOBTransmitted", true),
                    fuelUsedTransmitted: this.getBoolean(instrumentsTag, "Input.FuelComputer.FuelUsedTransmitted", true),
                },
                externalSwitches: {
                    legObsSwitchInstalled: this.getBoolean(instrumentsTag, "Input.ExternalSwitches.LegObsSwitchInstalled", false),
                    appArmSwitchInstalled: this.getBoolean(instrumentsTag, "Input.ExternalSwitches.AppArmSwitchInstalled", false),
                },
            },
            output: {
                obsTarget: this.getChoice(instrumentsTag, "Output.ObsTarget", OBS_DEVICES, 0),
                altitudeAlertEnabled: this.getBoolean(instrumentsTag, "Output.AltitudeAlertEnabled", false),
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
