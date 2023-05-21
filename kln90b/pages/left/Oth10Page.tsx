import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TemperatureDisplay} from "../../controls/displays/TemperatureDisplay";
import {AltitudeDisplay} from "../../controls/displays/AltitudeDisplay";
import {pressureAlt2DensityAlt} from "../../data/Conversions";


type Oth10PageTypes = {
    sat: TemperatureDisplay,
    tat: TemperatureDisplay,
    pressureAlt: AltitudeDisplay,
    densityAlt: AltitudeDisplay,
}

/**
 * 5-43
 */
export class Oth10Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Oth10PageTypes>;

    readonly name: string;


    constructor(props: PageProps) {
        super(props);

        this.name = this.props.planeSettings.input.fuelComputer.isInterfaced ? "OTH10" : "OTH 6";

        this.children = new UIElementChildren<Oth10PageTypes>({
            sat: new TemperatureDisplay(this.props.sensors.in.airdata.sat),
            tat: new TemperatureDisplay(this.props.sensors.in.airdata.tat),
            pressureAlt: new AltitudeDisplay(this.props.sensors.in.airdata.pressureAltitude),
            densityAlt: new AltitudeDisplay(null),
        });
    }

    public render(): VNode {
        return (<pre>
                &nbspAIR DATA<br/>
                <br/>
                SAT&nbsp&nbsp&nbsp{this.children.get("sat").render()}<br/>
                TAT&nbsp&nbsp&nbsp{this.children.get("tat").render()}<br/>
                PRS {this.children.get("pressureAlt").render()}ft<br/>
                DEN {this.children.get("densityAlt").render()}ft
            </pre>);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {
        this.children.get("sat").temperature = this.props.sensors.in.airdata.sat;
        this.children.get("tat").temperature = this.props.sensors.in.airdata.tat;
        this.children.get("pressureAlt").altitude = this.props.sensors.in.airdata.pressureAltitude;
        this.children.get("densityAlt").altitude = pressureAlt2DensityAlt(this.props.sensors.in.airdata.pressureAltitude!, this.props.sensors.in.airdata.sat); //normally transmitted directly by the airdata system...
    }
}