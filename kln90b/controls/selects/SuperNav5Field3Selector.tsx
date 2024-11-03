import {UserSetting} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {NavPageState} from "../../data/VolatileMemory";
import {TickController} from "../../TickController";
import {format} from "numerable";
import {Sensors} from "../../Sensors";
import {SuperNav5Field3} from "../../settings/KLN90BUserSettings";
import {KLNMagvar} from "../../data/navdata/KLNMagvar";
import {SidStar} from "../../data/navdata/SidStar";
import {FlightPlan} from "../../data/flightplan/FlightPlan";


export class SuperNav5Field3Selector extends SelectField {


    private constructor(valueSet: string[], private setting: UserSetting<SuperNav5Field3>, private state: NavPageState, private sensors: Sensors, private readonly magvar: KLNMagvar, private readonly fpl0: FlightPlan, changedCallback: (value: number) => void) {
        super(valueSet, setting.get(), changedCallback);
    }

    public static build(setting: UserSetting<SuperNav5Field3>, state: NavPageState, sensors: Sensors, magvar: KLNMagvar, fpl0: FlightPlan): SuperNav5Field3Selector {
        return new SuperNav5Field3Selector([" TK   ", "BRG   ", "RAD   "], setting, state, sensors, magvar, fpl0, (field) => this.saveSetting(setting, field));
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
            let arc: number = 0;

            if (vor !== null) {
                //6-18 Overriden to DTK, when an arc is active
                field = SuperNav5Field3.ARC;
                const radialTrue = this.sensors.in.gps.coords.bearingFrom(vor.lat, vor.lon);
                arc = this.magvar.trueToMag(radialTrue, -vor.magneticVariation);
            }

            switch (field) {
                case SuperNav5Field3.TK:
                    this.ref.instance.textContent = "Ö" + this.formatDegrees(this.magvar.trueToMag(this.sensors.in.gps.getTrackTrueRespectingGroundspeed()));
                    break;
                case SuperNav5Field3.BRG:
                    this.ref.instance.textContent = "Ô" + this.formatDegrees(this.magvar.trueToMag(this.state.bearingToActive));
                    break;
                case SuperNav5Field3.RAD:
                    this.ref.instance.textContent = "Õ" + this.formatDegrees(this.toRadial(this.magvar.trueToMag(this.state.bearingToActive)));
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
        return `${format(degrees, "000")}°`;
    }
}