import {SimVarValueType} from "@microsoft/msfs-sdk";
import {LVAR_ELECTRICITY_INDEX, LVAR_GPS_SIMVARS, LVAR_OBS_SOURCE, LVAR_OBS_TARGET} from "../LVars";

export const enum FuelUnit {
    GAL = "GAL",
    IMP = "IMP",
    L = "L",
    KG = "KG",
    LB = "LB",
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
        electricitySimVar: string,
        airdata: {
            isInterfaced: boolean,
            baroSource: number;
        },
        fuelComputer: {
            isInterfaced: boolean,
            unit: FuelUnit,
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


export class KLN90BPlaneSettingsParser {

    public parsePlaneSettings(xmlConfig: Document): KLN90PlaneSettings {


        const instrumentsTag = this.getKLNInstrumentsTag(xmlConfig);

        const options: KLN90PlaneSettings = {
            takeHomeMode: this.getOption(instrumentsTag, "TakeHomeMode", false),
            basePath: this.getOption(instrumentsTag, "BasePath", 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B'),
            vfrOnly: this.getOption(instrumentsTag, "VFROnly", false),
            input: {
                altimeterInterfaced: this.getOption(instrumentsTag, "Input.AltimeterInterfaced", true),
                obsSource: this.getOption(instrumentsTag, "Input.ObsSource", 1),
                headingInput: this.getOption(instrumentsTag, "Input.HeadingInput", false),
                electricitySimVar: this.getOption(instrumentsTag, "Input.ElectricitySimVar", ""),
                airdata: {
                    isInterfaced: this.getOption(instrumentsTag, "Input.Airdata.IsInterfaced", false),
                    baroSource: this.getOption(instrumentsTag, "Input.Airdata.BaroSource", 0),
                },
                fuelComputer: {
                    isInterfaced: this.getOption(instrumentsTag, "Input.FuelComputer.IsInterfaced", false),
                    unit: this.getOption(instrumentsTag, "Input.FuelComputer.Unit", FuelUnit.GAL),
                    fobTransmitted: this.getOption(instrumentsTag, "Input.FuelComputer.FOBTransmitted", true),
                    fuelUsedTransmitted: this.getOption(instrumentsTag, "Input.FuelComputer.FuelUsedTransmitted", true),
                },
                externalSwitches: {
                    legObsSwitchInstalled: this.getOption(instrumentsTag, "Input.ExternalSwitches.LegObsSwitchInstalled", false),
                    appArmSwitchInstalled: this.getOption(instrumentsTag, "Input.ExternalSwitches.AppArmSwitchInstalled", false),
                },
            },
            output: {
                obsTarget: this.getOption(instrumentsTag, "Output.ObsTarget", 0),
                altitudeAlertEnabled: this.getOption(instrumentsTag, "Output.AltitudeAlertEnabled", true),
                writeGPSSimVars: this.getOption(instrumentsTag, "Output.WriteGPSSimVars", true),
            },
            debugMode: false,
        };

        console.log("Plane Settings", options, xmlConfig);

        SimVar.SetSimVarValue(LVAR_OBS_SOURCE, SimVarValueType.Number, options.input.obsSource);
        SimVar.SetSimVarValue(LVAR_OBS_TARGET, SimVarValueType.Number, options.output.obsTarget);
        SimVar.SetSimVarValue(LVAR_GPS_SIMVARS, SimVarValueType.Bool, options.output.writeGPSSimVars);
        if (options.input.electricitySimVar.includes(":")) {
            SimVar.SetSimVarValue(LVAR_ELECTRICITY_INDEX, SimVarValueType.Number, Number(options.input.electricitySimVar.split(":")[1]));
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

    private getOption<T extends string | number | boolean>(element: Element | null, key: string, defaultvalue: T): T {
        if (element === null) {
            return defaultvalue;
        }

        const keys = key.split(".");
        for (const subkey of keys) {
            const elements: HTMLCollectionOf<Element> = element!.getElementsByTagName(subkey);
            if (elements.length == 0 || elements[0] === null) {
                return defaultvalue;
            }
            element = elements[0];
        }


        const textValue = element.textContent;
        if (textValue == null) {
            return defaultvalue;
        }

        switch (typeof defaultvalue) {
            case "string":
                // @ts-ignore
                return textValue;
            case "number":
                // @ts-ignore
                return Number(textValue);
            case "boolean":
                // @ts-ignore
                return textValue === 'true';
            default:
                throw new Error(`Unexpected Type ${typeof defaultvalue}`);
        }
    }

}