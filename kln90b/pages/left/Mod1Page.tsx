import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController, EnterResult} from "../CursorController";
import {CdiScaleField} from "../../controls/selects/CdiScaleField";
import {TextDisplay} from "../../controls/displays/TextDisplay";


type Mod1PageTypes = {
    title1: TextDisplay,
    title2: TextDisplay,
    cdiScale: CdiScaleField,
}

export class Mod1Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Mod1PageTypes>;

    readonly name: string = "MOD 1";


    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Mod1PageTypes>({
            title1: new TextDisplay(""),
            title2: new TextDisplay(""),
            cdiScale: new CdiScaleField(this.props.memory.navPage),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            {this.children.get("title1").render()}<br/>
            {this.children.get("title2").render()}<br/>
            <br/>
            LEG<br/>
            <br/>
            CDI:±{this.children.get("cdiScale").render()}NM
        </pre>);
    }

    public isEnterAccepted(): boolean {
        return this.props.modeController.isObsModeActive() && !this.props.planeSettings.input.externalSwitches.legObsSwitchInstalled;
    }

    public enter(): Promise<EnterResult> {
        if (!this.props.modeController.isObsModeActive() || this.props.planeSettings.input.externalSwitches.legObsSwitchInstalled) {
            return Promise.resolve(EnterResult.Not_Handled);
        }
        this.props.modeController.switchToEnrLegMode();
        return Promise.resolve(EnterResult.Handled_Keep_Focus);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {
        if (this.props.modeController.isObsModeActive()) {
            if (this.props.planeSettings.input.externalSwitches.legObsSwitchInstalled) {
                this.children.get("title1").text = "PRESS GPS";
                this.children.get("title2").text = "CRS FOR";
            } else {
                this.children.get("title1").text = "PRESS ENT";
                this.children.get("title2").text = "TO ACTIVATE";
            }
        } else {
            this.children.get("title1").text = "ACTIVE MODE";
            this.children.get("title2").text = "";
        }
    }
}