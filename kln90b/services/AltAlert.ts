import {CalcTickable} from "../TickController";
import {VolatileMemory} from "../data/VolatileMemory";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {Sensors} from "../Sensors";
import {Feet} from "../data/Units";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";

enum AltAlertState {
    ARMED,
    REACHING,
    REACHED,
}

/**
 * 3-56
 */
export class AltAlert implements CalcTickable {

    private state: AltAlertState = AltAlertState.ARMED;
    private selectedAltitude = 0;


    constructor(private memory: VolatileMemory, private settings: KLN90PlaneSettings, private sensors: Sensors, private readonly userSettings: KLN90BUserSettings) {
    }

    public tick(): void {
        const indicatedAlt = this.sensors.in.airdata.getIndicatedAlt();
        if (!this.userSettings.getSetting("altAlertEnabled").get() || indicatedAlt === null || !this.settings.output.altitudeAlertEnabled) {
            return;
        }

        const roundetAlt = Math.round(indicatedAlt / 100) * 100;
        if (this.memory.navPage.nav4SelectedAltitude !== this.selectedAltitude) {
            this.state = AltAlertState.ARMED;
            this.selectedAltitude = this.memory.navPage.nav4SelectedAltitude;
        }


        switch (this.state) {
            case AltAlertState.ARMED:
                if (roundetAlt === this.selectedAltitude) {
                    this.state = AltAlertState.REACHED;
                    this.sensors.out.audioGenerator.shortBeeps(2);
                } else if (this.isAltWithinWindow(roundetAlt, this.selectedAltitude, 1000)) {
                    this.state = AltAlertState.REACHING;
                    this.sensors.out.audioGenerator.shortBeeps(3);
                }
                return;
            case AltAlertState.REACHING:
                if (roundetAlt === this.selectedAltitude) {
                    this.state = AltAlertState.REACHED;
                    this.sensors.out.audioGenerator.shortBeeps(2);
                } else if (!this.isAltWithinWindow(roundetAlt, this.selectedAltitude, 1000)) {
                    this.state = AltAlertState.ARMED;
                }
                return;
            case AltAlertState.REACHED:
                if (!this.isAltWithinWindow(roundetAlt, this.selectedAltitude, this.userSettings.getSetting("altAlertWarn").get())) {
                    this.state = AltAlertState.REACHING;
                    this.sensors.out.audioGenerator.shortBeeps(4);
                }
                return;
        }

    }

    private isAltWithinWindow(indicatedAlt: Feet, selectedAlt: Feet, window: Feet) {
        return indicatedAlt >= selectedAlt - window && indicatedAlt <= selectedAlt + window;
    }

}