import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {FuelFlowDisplay} from "../../controls/displays/FuelDisplay";


type Oth7PageTypes = {
    fuelUnit: TextDisplay,
    ff1: FuelFlowDisplay,
    ff2: FuelFlowDisplay,
    fftotal: FuelFlowDisplay,
}

/**
 * 5-41
 */
export class Oth7Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Oth7PageTypes>;

    readonly name: string = "OTH 7";


    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Oth7PageTypes>({
            fuelUnit: new TextDisplay(this.props.planeSettings.input.fuelComputer.unit.padStart(3, " ")),
            ff1: new FuelFlowDisplay(0),
            ff2: new FuelFlowDisplay(0),
            fftotal: new FuelFlowDisplay(0),
        });
    }

    public render(): VNode {
        if (this.props.sensors.in.fuelComputer.numberOfEngines === 2) {
            return (<pre>
                &nbspFUEL FLOW<br/>
                <br/>
                &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("fuelUnit").render()}/HR<br/>
                ENG 1&nbsp&nbsp{this.children.get("ff1").render()}<br/>
                ENG 2&nbsp&nbsp{this.children.get("ff2").render()}<br/>
                TOTAL&nbsp&nbsp{this.children.get("fftotal").render()}
            </pre>);
        } else {
            return (<pre>
                &nbspFUEL FLOW<br/>
                <br/>
                &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("fuelUnit").render()}/HR<br/>
                <br/>
                <br/>
                &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("fftotal").render()}
            </pre>);
        }
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {

        this.children.get("ff1").fuelFlow = this.props.sensors.in.fuelComputer.fuelFlow1;
        this.children.get("ff2").fuelFlow = this.props.sensors.in.fuelComputer.fuelFlow2;
        this.children.get("fftotal").fuelFlow = this.props.sensors.in.fuelComputer.fuelFlow1 + this.props.sensors.in.fuelComputer.fuelFlow2;
    }
}