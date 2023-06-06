import {SimVarValueType} from "@microsoft/msfs-sdk";
import {PowerButton} from "./PowerButton";
import {KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";

const SYNC_TICK = 100;

/**
 * Reads LVars from the sim and synchronizes internal settings to them
 */
export class LVarSync {


    constructor(private readonly powerButton: PowerButton, private readonly settings: KLN90PlaneSettings) {
        window.setInterval(this.tick.bind(this), SYNC_TICK);
    }


    private tick(): void {
        if (this.settings.input.electricityLvar) {
            this.powerButton.setElectricityAvailable(!!SimVar.GetSimVarValue(this.settings.input.electricityLvar, SimVarValueType.Bool));
        }

    }

}