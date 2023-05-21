import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {MachDisplay, SpeedDisplay} from "../../controls/displays/SpeedDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {calculateHeadwind, calculateWindDirection, calculateWindspeed} from "../../data/Wind";


type Oth9PageTypes = {
    tas: SpeedDisplay,
    mach: MachDisplay,
    windLabel: TextDisplay,
    windComponent: SpeedDisplay,
    windDir: BearingDisplay,
    windSpeed: SpeedDisplay,
}

/**
 * 5-43
 */
export class Oth9Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Oth9PageTypes>;

    readonly name: string;


    constructor(props: PageProps) {
        super(props);

        this.name = this.props.planeSettings.input.fuelComputer.isInterfaced ? "OTH 9" : "OTH 5";

        this.children = new UIElementChildren<Oth9PageTypes>({
            tas: new SpeedDisplay(this.props.sensors.in.airdata.tas),
            mach: new MachDisplay(this.props.sensors.in.airdata.mach),
            windLabel: new TextDisplay("HDWND"),
            windComponent: new SpeedDisplay(null),
            windDir: new BearingDisplay(null),
            windSpeed: new SpeedDisplay(null),
        });
    }

    public render(): VNode {
        if (this.props.planeSettings.input.headingInput) {
            return (<pre>
                &nbspAIR DATA<br/>
                TAS&nbsp&nbsp&nbsp{this.children.get("tas").render()}kt<br/>
                MACH&nbsp&nbsp&nbsp&nbsp{this.children.get("mach").render()}<br/>
                {this.children.get("windLabel").render()} {this.children.get("windComponent").render()}kt<br/>
                WIND&nbsp&nbsp&nbsp{this.children.get("windDir").render()}<br/>
                &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("windSpeed").render()}kt
            </pre>);
        } else {
            return (<pre>
                &nbspAIR DATA<br/>
                TAS&nbsp&nbsp&nbsp{this.children.get("tas").render()}kt<br/>
                MACH&nbsp&nbsp&nbsp&nbsp{this.children.get("mach").render()}
            </pre>);
        }
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw(): void {
        this.children.get("tas").speed = this.props.sensors.in.airdata.tas;
        this.children.get("mach").mach = this.props.sensors.in.airdata.mach;
        if (!this.props.planeSettings.input.headingInput) {
            return;
        }

        const hdgTrue = this.props.magvar.magToTrue(this.props.sensors.in.headingGyro!);
        const windSpeed = calculateWindspeed(this.props.sensors.in.airdata.tas, this.props.sensors.in.gps.groundspeed, hdgTrue, this.props.sensors.in.gps.trackTrue);
        const windDir = calculateWindDirection(this.props.sensors.in.airdata.tas, this.props.sensors.in.gps.groundspeed, hdgTrue, this.props.sensors.in.gps.trackTrue);
        const headWind = calculateHeadwind(windSpeed, windDir, hdgTrue);

        this.children.get("windLabel").text = headWind >= 0 ? "HDWND" : "TLWND";
        this.children.get("windComponent").speed = Math.abs(headWind);
        this.children.get("windSpeed").speed = windSpeed;
        this.children.get("windDir").bearing = windDir;  //true north!
    }
}