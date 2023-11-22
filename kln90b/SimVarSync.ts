import {SimVarValueType} from "@microsoft/msfs-sdk";
import {PowerButton} from "./PowerButton";
import {KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {LVAR_DISABLE, LVAR_ELECTRICITY_INDEX, LVAR_GPS_SIMVARS, LVAR_OBS_SOURCE, LVAR_OBS_TARGET} from "./LVars";
import {TickController} from "./TickController";

const SYNC_TICK = 100;

/**
 * Reads SimVars from the sim and synchronizes internal settings to them
 */
export class SimVarSync {

    private disabled: boolean = false;

    constructor(private readonly powerButton: PowerButton, private readonly settings: KLN90PlaneSettings, private readonly tickController: TickController) {
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

        this.settings.input.obsSource = SimVar.GetSimVarValue(LVAR_OBS_SOURCE, SimVarValueType.Number);
        this.settings.output.obsTarget = SimVar.GetSimVarValue(LVAR_OBS_TARGET, SimVarValueType.Number);

        const writeGpsSimvars = !!SimVar.GetSimVarValue(LVAR_GPS_SIMVARS, SimVarValueType.Bool);
        if (writeGpsSimvars !== this.settings.output.writeGPSSimVars) {
            this.settings.output.writeGPSSimVars = writeGpsSimvars;
            SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, writeGpsSimvars);
        }
    }

    private setDisabled(disabled: boolean): void {
        if (disabled === this.disabled) {
            return;
        }

        this.disabled = disabled;

        this.tickController.setEnabled(!disabled);

        if (this.settings.output.writeGPSSimVars) {
            SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, !disabled); //Allows other devices to write GPS vars
        }

    }


}