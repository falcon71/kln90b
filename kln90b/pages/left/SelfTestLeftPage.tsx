import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {DeviationBar} from "../../controls/displays/DeviationBar";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";


type SelfTestLeftPageTypes = {
    scale: DeviationBar,
    obsIn: BearingDisplay,
}

export class SelfTestLeftPage extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children = new UIElementChildren<SelfTestLeftPageTypes>({
        scale: new DeviationBar(-0.5, false, 1),
        obsIn: new BearingDisplay(this.props.sensors.in.obsMag),
    });

    readonly name: string = "     ";

    constructor(props: PageProps) {
        super(props);

        this.props.memory.navPage.isSelfTestActive = true;
    }


    public render(): VNode {
        return (<pre>
            DIS  34.5NM<br/>
            {this.children.get("scale").render()}<br/>
            OBS IN {this.children.get("obsIn").render()}<br/>
            &nbsp&nbsp&nbspOUT 315°<br/>
            RMI    130°<br/>
            ANNUN    ON
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        this.children.get("obsIn").bearing = this.props.sensors.in.obsMag;
    }
}