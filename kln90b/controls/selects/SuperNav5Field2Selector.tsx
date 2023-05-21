import {FSComponent, UserSetting, VNode} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {NavPageState} from "../../data/VolatileMemory";
import {TickController} from "../../TickController";
import {format} from "numerable";
import {Sensors} from "../../Sensors";
import {SuperNav5Field2} from "../../settings/KLN90BUserSettings";
import {UIElementChildren} from "../../pages/Page";
import {ObsDtkElement} from "./ObsDtkElement";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {ModeController} from "../../services/ModeController";
import {KLNMagvar} from "../../data/navdata/KLNMagvar";

type SuperNav5Field2SelectorTypes = {
    obsdtk: ObsDtkElement,
}

export class SuperNav5Field2Selector extends SelectField {

    public children: UIElementChildren<SuperNav5Field2SelectorTypes>;


    private constructor(valueSet: string[], private readonly setting: UserSetting<SuperNav5Field2>, private readonly state: NavPageState, private readonly sensors: Sensors, planeSettings: KLN90PlaneSettings, private readonly modeController: ModeController, private readonly magvar: KLNMagvar, changedCallback: (value: number) => void) {
        super(valueSet, setting.get(), changedCallback);
        this.children = new UIElementChildren<SuperNav5Field2SelectorTypes>({
            obsdtk: new ObsDtkElement(planeSettings, sensors, state, modeController),
        });
    }

    public static build(setting: UserSetting<SuperNav5Field2>, state: NavPageState, sensors: Sensors, planeSettings: KLN90PlaneSettings, modeController: ModeController, magvar: KLNMagvar): SuperNav5Field2Selector {
        return new SuperNav5Field2Selector(["DTK   ", "BRG   ", "RAD   "], setting, state, sensors, planeSettings, modeController, magvar, (field) => this.saveSetting(setting, field));
    }

    private static saveSetting(setting: UserSetting<SuperNav5Field2>, field: SuperNav5Field2): void {
        setting.set(field);
    }

    public render(): VNode {
        return (
            <span><span ref={this.ref}>{this.valueSet[this.value]}</span>{this.children.get("obsdtk").render()}</span>);
    }

    /**
     * 3-35
     * @param blink
     */
    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        let field: SuperNav5Field2 = this.value;

        if (this.state.activeWaypoint.getFromLeg()?.path.isGreatCircle() === false) {
            //6-18 Overriden to DTK, when an arc is active
            field = SuperNav5Field2.DTK;
        }

        if (this.isFocused) {
            this.ref.instance.textContent = this.valueSet[this.value];
            this.ref!.instance.classList.add("inverted");
        } else {
            this.ref!.instance.classList.remove("inverted");



            switch (field) {
                case SuperNav5Field2.DTK:
                    //4-9
                    this.ref.instance.textContent = this.modeController.isObsModeActive() ? "Ù" : "Ó";
                    break;
                case SuperNav5Field2.BRG:
                    this.ref.instance.textContent = "Ô" + this.formatDegrees(this.magvar.trueToMag(this.state.bearingToActive));
                    break;
                case SuperNav5Field2.RAD:
                    this.ref.instance.textContent = "Õ" + this.formatDegrees(this.toRadial(this.magvar.trueToMag(this.state.bearingToActive)));
                    break;
            }
        }

        this.children.get("obsdtk").isVisible = field === SuperNav5Field2.DTK && !this.isFocused;
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