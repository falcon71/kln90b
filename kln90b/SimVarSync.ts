import {SimVarValueType} from "@microsoft/msfs-sdk";
import {PowerButton} from "./PowerButton";
import {ELECTRICITY_INDEX, KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {
    LVAR_BRIGHTNESS,
    LVAR_DISABLE,
    LVAR_ELECTRICITY_INDEX,
    LVAR_GPS_SIMVARS,
    LVAR_HEADING_INPUT,
    LVAR_OBS_SOURCE,
    LVAR_OBS_TARGET,
} from "./LVars";
import {TickController} from "./TickController";
import {ModeController} from "./services/ModeController";
import {PageManager} from "./pages/PageManager";
import {BrightnessManager} from "./BrightnessManager";
import {WTFlightplanSync} from "./services/WTFlightplanSync";
import {Hardware} from "./Hardware";

const SYNC_TICK = 100;

/**
 * Reads SimVars from the sim and synchronizes internal settings to them
 */
export class SimVarSync {

    constructor(private readonly powerButton: PowerButton, private readonly settings: KLN90PlaneSettings, private readonly tickController: TickController, private readonly modeController: ModeController, private readonly pageManager: PageManager, private readonly brightnessManager: BrightnessManager, private readonly wtFlightplanSync: WTFlightplanSync, private readonly hardware: Hardware) {
        window.setInterval(this.tick.bind(this), SYNC_TICK);
    }

    private tick(): void {
        if (this.settings.input.electricitySimVar) {
            if (ELECTRICITY_INDEX.test(this.settings.input.electricitySimVar)) {
                const index = SimVar.GetSimVarValue(LVAR_ELECTRICITY_INDEX, SimVarValueType.Number);
                this.settings.input.electricitySimVar = this.settings.input.electricitySimVar.replace(ELECTRICITY_INDEX, `:${index}`);
            }

            this.powerButton.setElectricityAvailable(!!SimVar.GetSimVarValue(this.settings.input.electricitySimVar, SimVarValueType.Bool));
        }

        //The only read of L:KLN90B_Disabled: everything else reads hardware.isDisabled (#138)
        this.setDisabled(!!SimVar.GetSimVarValue(LVAR_DISABLE, SimVarValueType.Bool));

        if (this.settings.input.externalSwitches.legObsSwitchInstalled && !this.hardware.isDisabled) {
            //SensorsIn would be a better place for this, but this would create a circle reference between sensors and modecontroller
            this.modeController.setExternalObsMode(!!SimVar.GetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool));
        }

        this.settings.input.obsSource = SimVar.GetSimVarValue(LVAR_OBS_SOURCE, SimVarValueType.Number);
        this.settings.output.obsTarget = SimVar.GetSimVarValue(LVAR_OBS_TARGET, SimVarValueType.Number);
        this.settings.input.headingInput = !!SimVar.GetSimVarValue(LVAR_HEADING_INPUT, SimVarValueType.Bool);

        const writeGpsSimvars = !!SimVar.GetSimVarValue(LVAR_GPS_SIMVARS, SimVarValueType.Bool);
        if (writeGpsSimvars !== this.settings.output.writeGPSSimVars) {
            this.settings.output.writeGPSSimVars = writeGpsSimvars;
            if (!this.hardware.isDisabled) { //A disabled unit has released the GPS for hot swapping, setDisabled claims it again
                SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, writeGpsSimvars);
            }
            if (writeGpsSimvars) {
                this.wtFlightplanSync.sync(); //The planner has not been written while the option was off
            }
        }
        this.brightnessManager.setBrightnessExternal(SimVar.GetSimVarValue(LVAR_BRIGHTNESS, SimVarValueType.Number));

    }

    private setDisabled(disabled: boolean): void {
        if (disabled === this.hardware.isDisabled) {
            return;
        }

        this.hardware.isDisabled = disabled;

        this.tickController.setEnabled(!disabled);
        this.pageManager.resetKeyboard();

        if (this.settings.output.writeGPSSimVars) {
            SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, !disabled); //Allows other devices to write GPS vars
        }

    }


}