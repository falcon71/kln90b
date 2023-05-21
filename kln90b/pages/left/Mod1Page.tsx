import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController, EnterResult} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";
import {NavMode} from "../../data/VolatileMemory";


type Mod1PageTypes = {
    title1: TextDisplay,
    title2: TextDisplay,
    cdiScale: SelectField,
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
            cdiScale: new SelectField(this.buildValidScales().map(scale => format(scale, "0.00")), this.getScaleIdx(), this.setCDIScale.bind(this)),
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
        return this.props.modeController.isObsModeActive();
    }

    public enter(): Promise<EnterResult> {
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
                this.children.get("title1").text = "PRESS GRPS";
                this.children.get("title2").text = "CRS FOR";
            } else {
                this.children.get("title1").text = "PRESS ENT";
                this.children.get("title2").text = "TO ACTIVATE";
            }
        } else {
            this.children.get("title1").text = "ACTIVE MODE";
            this.children.get("title2").text = "";
        }

        this.children.get("cdiScale").value = this.getScaleIdx();
    }

    private buildValidScales(): number[] {
        switch (this.props.memory.navPage.navmode) {
            case NavMode.ENR_LEG:
            case NavMode.ENR_OBS:
                return [0.3, 1, 5];
            case NavMode.ARM_LEG:
            case NavMode.ARM_OBS:
                return [0.3, 1];
            case NavMode.APR_LEG:
                return [0.3];
        }
    }

    private setCDIScale(scaleIdx: number) {
        this.props.memory.navPage.xtkScale = this.buildValidScales()[scaleIdx];
    }

    private getScaleIdx(): number {
        let displayScale = this.props.memory.navPage.xtkScale;

        //We only display 0.3, 1 and 5 here, but the actual scale can be anything inbetween when transitionen approach modes
        if (displayScale < 1) {
            displayScale = 0.3;
        } else if (displayScale < 5) {
            displayScale = 1;
        }

        return this.buildValidScales().indexOf(displayScale);
    }
}