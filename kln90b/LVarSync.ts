import {SimVarValueType} from "@microsoft/msfs-sdk";
import {PowerButton} from "./PowerButton";
import {KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {LVAR_DISABLE} from "./LVars";

const SYNC_TICK = 100;

/**
 * Reads LVars from the sim and synchronizes internal settings to them
 */
export class LVarSync {

    private disabled: boolean = false;

    constructor(private readonly powerButton: PowerButton, private readonly settings: KLN90PlaneSettings) {
        window.setInterval(this.tick.bind(this), SYNC_TICK);
    }


    private tick(): void {
        if (this.settings.input.electricityLvar) {
            this.powerButton.setElectricityAvailable(!!SimVar.GetSimVarValue(this.settings.input.electricityLvar, SimVarValueType.Bool));
        }

        const disabled = !!SimVar.GetSimVarValue(LVAR_DISABLE, SimVarValueType.Bool);
        this.setDisabled(disabled);
    }

    private setDisabled(disabled: boolean): void {
        if (disabled === this.disabled) {
            return;
        }

        this.disabled = disabled;
        if (disabled) {
            this.powerButton.setPowerSwitch(false); //This also stops all ticks

            if (this.settings.output.writeGPSLvars) {
                SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, false); //Allows other devices to write GPS vars
            }
        } //Nothing to do for disabling. GPS OVERRIDDEN will be written once the device is turned on again
    }


}