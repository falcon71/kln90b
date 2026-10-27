import {SimVarValueType} from "@microsoft/msfs-sdk";
import {PowerSupply} from "./PowerSupply";
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

    constructor(private readonly powerSupply: PowerSupply, private readonly settings: KLN90PlaneSettings, private readonly tickController: TickController, private readonly modeController: ModeController, private readonly pageManager: PageManager, private readonly brightnessManager: BrightnessManager, private readonly wtFlightplanSync: WTFlightplanSync, private readonly hardware: Hardware) {
        window.setInterval(this.tick.bind(this), SYNC_TICK);
    }

    private tick(): void {
        if (this.settings.input.electricitySimVar) {
            if (ELECTRICITY_INDEX.test(this.settings.input.electricitySimVar)) {
                //Real unit: fictional, a runtime override of the index of Input.ElectricitySimVar
                const index = SimVar.GetSimVarValue(LVAR_ELECTRICITY_INDEX, SimVarValueType.Number);
                this.settings.input.electricitySimVar = this.settings.input.electricitySimVar.replace(ELECTRICITY_INDEX, `:${index}`);
            }

            //Real unit: P901 pin 40 A/C POWER, 11 to 33 VDC, with pin 27 A/C GROUND (Installation manual 1-5, 2-6, 2-7)
            this.powerSupply.setElectricityAvailable(!!SimVar.GetSimVarValue(this.settings.input.electricitySimVar, SimVarValueType.Bool));
        }

        //The only read of L:KLN90B_Disabled: everything else reads hardware.isDisabled (#138)
        //Real unit: fictional, the unit is taken out of the aircraft for hot swapping
        this.setDisabled(!!SimVar.GetSimVarValue(LVAR_DISABLE, SimVarValueType.Bool));

        if (this.settings.input.externalSwitches.legObsSwitchInstalled && !this.hardware.isDisabled) {
            //SensorsIn would be a better place for this, but this would create a circle reference between sensors and modecontroller
            //Real unit: P901 pin 33 LEG/OBS CONTROL from the GPS CRS switch. The switch is alternate action (latching), so
            //pin 33 is a held level: grounded in OBS, open in LEG (Installation manual 2-6, figure 2-17 sheet 8 on 2-57).
            //GPS OBS ACTIVE is that switch position. The OBS and LEG lamps are lit by the switch's other contacts, not by
            //the KLN (Installation manual 2-69)
            this.modeController.setExternalObsMode(!!SimVar.GetSimVarValue('GPS OBS ACTIVE', SimVarValueType.Bool));
        }

        //Real unit: fictional, runtime overrides of the panel.xml keys Input.ObsSource, Output.ObsTarget,
        //Input.HeadingInput and Output.WriteGPSSimVars. The interfaces they stand for are on those keys
        //(KLN90BPlaneSettingsParser)
        this.settings.input.obsSource = SimVar.GetSimVarValue(LVAR_OBS_SOURCE, SimVarValueType.Number);
        this.settings.output.obsTarget = SimVar.GetSimVarValue(LVAR_OBS_TARGET, SimVarValueType.Number);
        this.settings.input.headingInput = !!SimVar.GetSimVarValue(LVAR_HEADING_INPUT, SimVarValueType.Bool);

        const writeGpsSimvars = !!SimVar.GetSimVarValue(LVAR_GPS_SIMVARS, SimVarValueType.Bool);
        if (writeGpsSimvars !== this.settings.output.writeGPSSimVars) {
            this.settings.output.writeGPSSimVars = writeGpsSimvars;
            if (!this.hardware.isDisabled) { //A disabled unit has released the GPS for hot swapping, setDisabled claims it again
                //Real unit: fictional, the sim's claim that this gauge writes the GPS SimVars
                SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, writeGpsSimvars);
            }
            if (writeGpsSimvars) {
                this.wtFlightplanSync.sync(); //The planner has not been written while the option was off
            }
        }
        //Real unit: fictional, the front-panel brightness knob's position (see BrightnessManager)
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
            //Real unit: fictional, the sim's claim that this gauge writes the GPS SimVars
            SimVar.SetSimVarValue('GPS OVERRIDDEN', SimVarValueType.Bool, !disabled); //Allows other devices to write GPS vars
            if (!disabled) {
                this.wtFlightplanSync.sync(); //#398: the planner was not written while the unit was disabled
            }
        }

    }


}