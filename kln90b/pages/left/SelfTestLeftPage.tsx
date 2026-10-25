import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {DeviationBar} from "../../controls/displays/DeviationBar";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {Blink} from "../../controls/Blink";


type SelfTestLeftPageTypes = {
    scale: DeviationBar,
    obsIn: BearingDisplay,
    testFail: Blink,
}

export class SelfTestLeftPage extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children = new UIElementChildren<SelfTestLeftPageTypes>({
        scale: new DeviationBar(-0.5, false, 1),
        obsIn: new BearingDisplay(this.props.sensors.in.obsMag),
        //3-4: a failed self-test flashes TEST FAIL in place of ANNUN ON (#416). The page container ticks it
        testFail: new Blink("TEST FAIL", false),
    });

    /** #416: whether the self-test of this power-on has failed; it does not change while the page is shown */
    private readonly isTestFailed: boolean;

    readonly name: string = "     ";

    constructor(props: PageProps) {
        super(props);

        this.props.memory.navPage.isSelfTestActive = true;
        this.isTestFailed = this.props.memory.selfTestFailure !== null;
    }


    public render(): VNode {
        return (<pre>
            DIS  34.5NM<br/>
            {this.children.get("scale").render()}<br/>
            OBS IN {this.children.get("obsIn").render()}<br/>
            &nbsp&nbsp&nbspOUT 315°<br/>
            RMI    130°<br/>
            {this.isTestFailed ? <span>{this.children.get("testFail").render()}&nbsp&nbsp</span> : "ANNUN    ON"}
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