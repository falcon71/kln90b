import {FSComponent, UserSetting} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {NavPageState} from "../../data/VolatileMemory";
import {TickController} from "../../TickController";
import {format} from "numerable";
import {roundBearing} from "../../data/Coordinates";
import {Sensors} from "../../Sensors";
import {SuperNav5Field3} from "../../settings/KLN90BUserSettings";
import {KLNMagvar} from "../../data/navdata/KLNMagvar";
import {SidStar} from "../../data/navdata/SidStar";
import {Flightplan} from "../../data/flightplan/Flightplan";
import {ModeController} from "../../services/ModeController";
import {bearingBetween} from "../../data/navdata/Bearing";


export class SuperNav5Field3Selector extends SelectField {


    private constructor(valueSet: string[], private setting: UserSetting<SuperNav5Field3>, private state: NavPageState, private sensors: Sensors, private readonly magvar: KLNMagvar, private readonly fpl0: Flightplan, private readonly modeController: ModeController, changedCallback: (value: number) => void) {
        super(valueSet, setting.get(), changedCallback);
    }

    public static build(setting: UserSetting<SuperNav5Field3>, state: NavPageState, sensors: Sensors, magvar: KLNMagvar, fpl0: Flightplan, modeController: ModeController): SuperNav5Field3Selector {
        return new SuperNav5Field3Selector([" TK   ", "BRG   ", "RAD   "], setting, state, sensors, magvar, fpl0, modeController, (field) => this.saveSetting(setting, field));
    }

    private static saveSetting(setting: UserSetting<SuperNav5Field3>, field: SuperNav5Field3): void {
        setting.set(field);
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

            let field: SuperNav5Field3 = this.value;

            const vor = SidStar.getVorIfWithin30NMOfArc(this.state, this.fpl0);
            let arc: number | null = 0;

            if (vor !== null) {
                //6-18 Overriden to DTK, when an arc is active
                field = SuperNav5Field3.ARC;
                const radialTrue = bearingBetween(vor, this.sensors.in.gps.coords); //#339: the radial is measured at the VOR; #432: none on the VOR
                arc = this.magvar.trueToMag(radialTrue, -vor.magneticVariation);
            }

            switch (field) {
                case SuperNav5Field3.TK:
                    this.ref.instance.textContent = "Ö" + this.formatDegrees(this.modeController.getTrackMag());
                    break;
                case SuperNav5Field3.BRG:
                    this.ref.instance.textContent = "Ô" + this.formatDegrees(this.modeController.getBearingToActiveMag());
                    break;
                case SuperNav5Field3.RAD:
                    this.ref.instance.textContent = "Õ" + this.formatDegrees(this.toRadial(this.modeController.getBearingToActiveMag()));
                    break;
                case SuperNav5Field3.ARC:
                    this.ref.instance.textContent = "Ø" + this.formatDegrees(arc);
                    break;
            }
        }
    }

    private toRadial(bearing: number | null): number | null {
        return bearing === null ? null : (bearing + 180) % 360;
    }

    private formatDegrees(degrees: number | null): string {
        if (degrees === null) {
            return "---°";
        }
        return `${format(roundBearing(degrees), "000")}°`;
    }
}