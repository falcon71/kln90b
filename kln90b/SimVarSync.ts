import {SimVarValueType} from "@microsoft/msfs-sdk";
import {PowerButton} from "./PowerButton";
import {KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {
    LVAR_BRIGHTNESS,
    LVAR_DISABLE,
    LVAR_ELECTRICITY_INDEX,
    LVAR_GPS_SIMVARS,
    LVAR_OBS_SOURCE,
    LVAR_OBS_TARGET,
} from "./LVars";
import {TickController} from "./TickController";
import {ModeController} from "./services/ModeController";
import {PageManager} from "./pages/PageManager";
import {BrightnessManager} from "./BrightnessManager";

const SYNC_TICK = 100;

/**
 * Reads SimVars from the sim and synchronizes internal settings to them
 */
export class SimVarSync {

    private disabled: boolean = false;

    constructor(private readonly powerButton: PowerButton, private readonly settings: KLN90PlaneSettings, private readonly tickController: TickController, private readonly modeController: ModeController, private readonly pageManager: PageManager, private readonly brightnessManager: BrightnessManager) {
        window.setInterval(this.tick.bind(this), SYNC_TICK);
    }

    private tick(): void {
        if (this.settings.input.electricitySimVar) {
            if (this.settings.input.electricitySimVar.includes(":")) {
                const split = this.settings.input.electricitySimVar.split(":");
                split[1] = SimVar.GetSimVarValue(LVAR_ELECTRICITY_INDEX, SimVarValueType.Number);
                this.settings.input.electricitySimVar = split.join(":");
            }

            this.powerButton.setElectricityAvailable(!!SimVar.GetSimVarValue(this.settings.input.electricitySimVar, SimVarValueType.Bool));
        }

        const disabled = !!SimVar.GetSimVarValue(LVAR_DISABLE, SimVarValueType.Bool);
        this.setDisabled(disabled);

        if (this.settings.input.externalSwitches.legObsSwitchInstalled && !disabled) {
            //SensorsIn would be a better place for this, but this would create a circle reference between sensors and modecontroller
            this.modeController.setExternalObsMode(!!SimVar.GetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool));
        }

        this.settings.input.obsSource = SimVar.GetSimVarValue(LVAR_OBS_SOURCE, SimVarValueType.Number);
        this.settings.output.obsTarget = SimVar.GetSimVarValue(LVAR_OBS_TARGET, SimVarValueType.Number);

        const writeGpsSimvars = !!SimVar.GetSimVarValue(LVAR_GPS_SIMVARS, SimVarValueType.Bool);
        if (writeGpsSimvars !== this.settings.output.writeGPSSimVars) {
            this.settings.output.writeGPSSimVars = writeGpsSimvars;
            SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, writeGpsSimvars);
        }
        this.brightnessManager.setBrightnessExternal(SimVar.GetSimVarValue(LVAR_BRIGHTNESS, SimVarValueType.Number));

    }

    private setDisabled(disabled: boolean): void {
        if (disabled === this.disabled) {
            return;
        }

        this.disabled = disabled;

        this.tickController.setEnabled(!disabled);
        this.pageManager.resetKeyboard();

        if (this.settings.output.writeGPSSimVars) {
            SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, !disabled); //Allows other devices to write GPS vars
        }

    }


}