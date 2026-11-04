import {FSComponent, UserSetting} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {TickController} from "../../TickController";
import {padInt} from "../../data/NumberFormat";
import {roundBearing} from "../../data/Coordinates";
import {Sensors} from "../../Sensors";
import {effectiveMapOrientation, Nav5Orientation} from "../../settings/KLN90BUserSettings";
import {ModeController} from "../../services/ModeController";


export class MapOrientationSelector extends SelectField {


    private constructor(valueSet: string[], value: number, private readonly orientationSetting: UserSetting<Nav5Orientation>, private readonly sensors: Sensors, private readonly modeController: ModeController, changedCallback: (value: number) => void) {
        super(valueSet, value, changedCallback);
    }

    public static build(options: KLN90PlaneSettings, orientationSetting: UserSetting<Nav5Orientation>, sensors: Sensors, modeController: ModeController): MapOrientationSelector {
        return new MapOrientationSelector(this.getValueset(sensors.in.isHeadingAvailable()), effectiveMapOrientation(orientationSetting.get(), sensors.in.isHeadingAvailable()), orientationSetting, sensors, modeController, (orientation) => this.saveMapOrientation(orientationSetting, orientation));
    }

    private static getValueset(headingAvailable: boolean): string[] {
        return headingAvailable ? ["N^  ", "DTK^", "TK^ ", "HDG^"] : ["N^  ", "DTK^", "TK^ "];
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

            switch (effectiveMapOrientation(this.value, this.sensors.in.isHeadingAvailable())) {
                case Nav5Orientation.NORTH_UP:
                    this.ref.instance.textContent = "N^  ";
                    break;
                case Nav5Orientation.DTK_UP:
                    this.ref.instance.textContent = this.formatDegrees(this.modeController.getDtkOrObsMagnetic());
                    break;
                case Nav5Orientation.TK_UP:
                    this.ref.instance.textContent = this.formatDegrees(this.modeController.getTrackMag());
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
        return `${padInt(roundBearing(degrees), 3)}°`;
    }
}