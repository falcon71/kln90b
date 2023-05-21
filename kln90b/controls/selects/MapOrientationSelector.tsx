import {FSComponent, UserSetting} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {TickController} from "../../TickController";
import {format} from "numerable";
import {Sensors} from "../../Sensors";
import {Nav5Orientation} from "../../settings/KLN90BUserSettings";
import {ModeController} from "../../services/ModeController";
import {KLNMagvar} from "../../data/navdata/KLNMagvar";


export class MapOrientationSelector extends SelectField {


    private constructor(valueSet: string[], private readonly orientationSetting: UserSetting<Nav5Orientation>, private readonly sensors: Sensors, private readonly modeController: ModeController, private readonly magvar: KLNMagvar, changedCallback: (value: number) => void) {
        super(valueSet, orientationSetting.get(), changedCallback);
    }

    public static build(options: KLN90PlaneSettings, orientationSetting: UserSetting<Nav5Orientation>, sensors: Sensors, modeController: ModeController, magvar: KLNMagvar): MapOrientationSelector {
        return new MapOrientationSelector(this.getValueset(options), orientationSetting, sensors, modeController, magvar, (orientation) => this.saveMapOrientation(orientationSetting, orientation));
    }

    private static getValueset(options: KLN90PlaneSettings): string[] {
        return options.input.headingInput ? ["N^  ", "DTK^", "TK^ ", "HDG^"] : ["N^  ", "DTK^", "TK^ "];
    }

    private static saveMapOrientation(orientationSetting: UserSetting<Nav5Orientation>, orientation: Nav5Orientation): void {
        orientationSetting.set(orientation);
    }

    /**
     * 3-35
     * @param blink
     */
    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        if (this.isFocused) {
            this.ref.instance.textContent = this.valueSet[this.value];
            this.ref!.instance.classList.add("inverted");
        } else {
            this.ref!.instance.classList.remove("inverted");

            switch (this.value) {
                case Nav5Orientation.NORTH_UP:
                    this.ref.instance.textContent = "N^  ";
                    break;
                case Nav5Orientation.DTK_UP:
                    this.ref.instance.textContent = this.formatDegrees(this.modeController.getDtkOrObsMagnetic());
                    break;
                case Nav5Orientation.TK_UP:
                    this.ref.instance.textContent = this.formatDegrees(this.magvar.trueToMag(this.sensors.in.gps.getTrackTrueRespectingGroundspeed()));
                    break;
                case Nav5Orientation.HDG_UP:
                    this.ref.instance.textContent = this.formatDegrees(this.sensors.in.headingGyro);
                    break;
            }
        }
    }

    private formatDegrees(degrees: number | null): string {
        if (degrees === null) {
            return "---°";
        }
        return `${format(degrees, "000")}°`;
    }
}