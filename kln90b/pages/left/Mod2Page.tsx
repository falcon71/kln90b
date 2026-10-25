import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {NO_CHILDREN, PageProps, UIElementChildren} from "../Page";
import {CursorController, EnterResult, Field} from "../CursorController";
import {CdiScaleField} from "../../controls/selects/CdiScaleField";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";
import {roundBearing} from "../../data/Coordinates";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {Sensors} from "../../Sensors";
import {ModeController} from "../../services/ModeController";
import {TickController} from "../../TickController";


type Mod2PageTypes = {
    title1: TextDisplay,
    title2: TextDisplay,
    obsLabel: TextDisplay,
    obs: ModObsElement,
    cdiScale: CdiScaleField,
}

export class Mod2Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Mod2PageTypes>;

    readonly name: string = "MOD 2";


    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Mod2PageTypes>({
            title1: new TextDisplay(""),
            title2: new TextDisplay(""),
            obsLabel: new TextDisplay(""),
            obs: new ModObsElement(this.props.planeSettings, this.props.sensors, this.props.modeController),
            cdiScale: new CdiScaleField(this.props.memory.navPage),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            {this.children.get("title1").render()}<br/>
            {this.children.get("title2").render()}<br/>
            <br/>
            OBS{this.children.get("obsLabel").render()}{this.children.get("obs").render()}<br/>
            <br/>
            CDI:±{this.children.get("cdiScale").render()}NM
        </pre>);
    }

    public isEnterAccepted(): boolean {
        return !this.props.modeController.isObsModeActive() && !this.props.planeSettings.input.externalSwitches.legObsSwitchInstalled;
    }

    public enter(): Promise<EnterResult> {
        if (this.props.modeController.isObsModeActive() || this.props.planeSettings.input.externalSwitches.legObsSwitchInstalled) {
            return Promise.resolve(EnterResult.Not_Handled);
        }
        this.props.modeController.switchToEnrObsMode();
        return Promise.resolve(EnterResult.Handled_Keep_Focus);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {
        if (this.props.modeController.isObsModeActive()) {

            this.children.get("title1").text = "ACTIVE MODE";
            this.children.get("title2").text = "";
        } else {
            if (this.props.planeSettings.input.externalSwitches.legObsSwitchInstalled) {
                this.children.get("title1").text = "PRESS GPS";
                this.children.get("title2").text = "CRS FOR";
            } else {
                this.children.get("title1").text = "PRESS ENT";
                this.children.get("title2").text = "TO ACTIVATE";
            }
        }
        this.children.get("obsLabel").text = this.canObsBeEntered() ? ":" : " ";
    }

    private canObsBeEntered(): boolean {
        return this.props.planeSettings.output.obsTarget !== 0 || this.props.sensors.in.obsMag === null;
    }
}


/**
 * Special OBS Selector for the MOD 2 page
 */
class ModObsElement implements Field {


    readonly children = NO_CHILDREN;
    public readonly isEntered: boolean = false;
    public isFocused: boolean = false;
    public isReadonly: boolean = true;

    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();


    constructor(private readonly planeSettings: KLN90PlaneSettings,
                private readonly sensors: Sensors,
                private readonly modeController: ModeController) {
    }

    public clear(): boolean {
        return false;
    }

    public enter(): Promise<EnterResult> {
        return Promise.resolve(EnterResult.Not_Handled);
    }

    public innerLeft(): boolean {
        this.modeController.stepObs(-1);
        return true;
    }

    public innerRight(): boolean {
        this.modeController.stepObs(1);
        return false;
    }

    public isClearAccepted(): boolean {
        return false;
    }

    public isEnterAccepted(): boolean {
        return false;
    }

    public outerLeft(): boolean {
        return false;
    }

    public outerRight(): boolean {
        return false;
    }

    public keyboard(key: string): boolean {
        return false;
    }

    public render(): VNode {
        return (
            <span ref={this.ref}>{this.getDisplayValue()}</span>);
    }

    public setFocused(focused: boolean): void {
        this.isFocused = focused;
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        if (this.modeController.isObsModeActive()) {
            this.isReadonly = !this.canObsBeEntered();
        } else {
            this.isReadonly = true;
        }

        this.ref.instance.textContent = this.getDisplayValue();

        if (this.isFocused) {
            this.ref!.instance.classList.add("inverted");
        } else {
            this.ref!.instance.classList.remove("inverted");
        }
    }

    private getDisplayValue(): string {
        return this.modeController.isObsModeActive() ? `${format(roundBearing(this.modeController.getObsMag()), "000")}°` : "---°";
    }

    private canObsBeEntered(): boolean {
        return this.planeSettings.output.obsTarget !== 0 || this.sensors.in.obsMag === null;
    }


}