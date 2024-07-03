import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Degrees, Knots} from "../../data/Units";
import {SpeedFieldset} from "../../controls/selects/SpeedFieldset";
import {SpeedDisplay} from "../../controls/displays/SpeedDisplay";
import {BearingFieldset} from "../../controls/selects/BearingFieldset";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {calculateHeadwind, calculateWindDirection, calculateWindspeed} from "../../data/Wind";


type Cal3PageTypes = {
    tas: SpeedFieldset,
    hdg: BearingFieldset,
    windLabel: TextDisplay,
    windComponent: SpeedDisplay,
    windDir: BearingDisplay,
    windSpeed: SpeedDisplay,
}

/**
 * 5-12
 */
export class Cal3Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Cal3PageTypes>;

    readonly name: string = "CAL 3";

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Cal3PageTypes>({
            tas: new SpeedFieldset(this.props.userSettings.getSetting('cal3Tas').get(), this.setTas.bind(this)),
            hdg: new BearingFieldset(this.props.userSettings.getSetting('cal3HeadingMag').get(), this.setHeading.bind(this)),
            windLabel: new TextDisplay("HDWND"),
            windComponent: new SpeedDisplay(null),
            windDir: new BearingDisplay(null),
            windSpeed: new SpeedDisplay(null),
        });

        this.children.get("hdg").setReadonly(this.props.planeSettings.input.headingInput);
        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        if (this.props.planeSettings.input.headingInput) {
            return (<pre>
            &nbsp&nbsp&nbspWIND<br/>
            TAS&nbsp&nbsp&nbsp{this.children.get("tas").render()}kt<br/>
            <br/>
                {this.children.get("windLabel").render()} {this.children.get("windComponent").render()}kt<br/>
            WIND&nbsp&nbsp&nbsp{this.children.get("windDir").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("windSpeed").render()}kt
        </pre>);
        } else {
            return (<pre>
            &nbsp&nbsp&nbspWIND<br/>
            TAS&nbsp&nbsp&nbsp{this.children.get("tas").render()}kt<br/>
            HDG&nbsp&nbsp&nbsp&nbsp{this.children.get("hdg").render()}°<br/>
                {this.children.get("windLabel").render()} {this.children.get("windComponent").render()}kt<br/>
            WIND&nbsp&nbsp&nbsp{this.children.get("windDir").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("windSpeed").render()}kt
        </pre>);
        }


    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        let hdgTrue: number;
        if (this.props.planeSettings.input.headingInput) {
            hdgTrue = this.props.magvar.magToTrue(this.props.sensors.in.headingGyro!);
        } else {
            hdgTrue = this.props.magvar.magToTrue(this.props.userSettings.getSetting('cal3HeadingMag').get());
        }

        const windSpeed = calculateWindspeed(this.props.userSettings.getSetting('cal3Tas').get(), this.props.sensors.in.gps.groundspeed, hdgTrue, this.props.sensors.in.gps.trackTrue);
        const windDir = calculateWindDirection(this.props.userSettings.getSetting('cal3Tas').get(), this.props.sensors.in.gps.groundspeed, hdgTrue, this.props.sensors.in.gps.trackTrue);
        const headWind = calculateHeadwind(windSpeed, windDir, hdgTrue);

        this.children.get("windLabel").text = headWind >= 0 ? "HDWND" : "TLWND";
        this.children.get("windComponent").speed = Math.abs(headWind);
        this.children.get("windSpeed").speed = windSpeed;
        this.children.get("windDir").bearing = windDir;  //true north!
    }

    private setTas(tas: Knots): void {
        this.props.userSettings.getSetting('cal3Tas').set(tas);
        this.requiresRedraw = true;
    }

    private setHeading(heading: Degrees): void {
        this.props.userSettings.getSetting('cal3HeadingMag').set(heading);
        this.requiresRedraw = true;
    }

}