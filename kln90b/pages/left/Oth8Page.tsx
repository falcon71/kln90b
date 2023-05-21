import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {OthFuelDisplay} from "../../controls/displays/FuelDisplay";


type Oth8PageTypes = {
    fuelUnit: TextDisplay,
    used1: OthFuelDisplay,
    used2: OthFuelDisplay,
    usedTotal: OthFuelDisplay,
}

/**
 * 5-41
 */
export class Oth8Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Oth8PageTypes>;

    readonly name: string = "OTH 8";


    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Oth8PageTypes>({
            fuelUnit: new TextDisplay(this.props.planeSettings.input.fuelComputer.unit.padStart(3, " ")),
            used1: new OthFuelDisplay(null),
            used2: new OthFuelDisplay(null),
            usedTotal: new OthFuelDisplay(null),
        });
    }

    public render(): VNode {
        if (this.props.sensors.in.fuelComputer.numberOfEngines === 2) {
            return (<pre>
                &nbspFUEL USED<br/>
                <br/>
                &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("fuelUnit").render()}<br/>
                ENG 1&nbsp{this.children.get("used1").render()}<br/>
                ENG 2&nbsp{this.children.get("used2").render()}<br/>
                TOTAL&nbsp{this.children.get("usedTotal").render()}
            </pre>);
        } else {
            return (<pre>
                &nbspFUEL USED<br/>
                <br/>
                &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("fuelUnit").render()}<br/>
                <br/>
                <br/>
                &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("usedTotal").render()}
            </pre>);
        }
    }

    public tick(blink: boolean): void {
        if (this.props.planeSettings.input.fuelComputer.fuelUsedTransmitted) {
            this.requiresRedraw = true;
        }
        super.tick(blink);
    }

    protected redraw(): void {
        this.children.get("used1").fuel = this.props.sensors.in.fuelComputer.fuelUsed1;
        this.children.get("used2").fuel = this.props.sensors.in.fuelComputer.fuelUsed2;
        this.children.get("usedTotal").fuel = this.props.sensors.in.fuelComputer.fuelUsed1! + this.props.sensors.in.fuelComputer.fuelUsed2!;
    }
}