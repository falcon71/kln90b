import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
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

    private readonly hdgRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    /** Whether the page shows the variant with a heading input: line three blank and HDG read-only */
    private headingShown: boolean;

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

        this.headingShown = this.props.sensors.in.isHeadingAvailable();
        this.children.get("hdg").setReadonly(this.headingShown);
        this.cursorController = new CursorController(this.children);
    }


    /**
     * 5-12: with a heading input line three is blank and the heading comes from the input, without one the pilot enters
     * it there. The heading can come and go while the page is shown (a failed RS-232 input and its repair, #458), so the
     * line is hidden and shown in the redraw
     */
    public render(): VNode {
        return (<pre>
            &nbsp&nbsp&nbspWIND<br/>
            TAS&nbsp&nbsp&nbsp{this.children.get("tas").render()}kt<br/>
            <span ref={this.hdgRef} class={this.headingShown ? "d-none" : ""}>HDG&nbsp&nbsp&nbsp&nbsp{this.children.get("hdg").render()}°</span><br/>
                {this.children.get("windLabel").render()} {this.children.get("windComponent").render()}kt<br/>
            WIND&nbsp&nbsp{this.children.get("windDir").render()}¥<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("windSpeed").render()}kt
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        const headingAvailable = this.props.sensors.in.isHeadingAvailable();
        if (headingAvailable !== this.headingShown) {
            this.headingShown = headingAvailable;
            //CursorController moves a cursor off a field that turned read-only (#217)
            this.children.get("hdg").setReadonly(headingAvailable);
            if (headingAvailable) {
                this.hdgRef.instance.classList.add("d-none");
            } else {
                this.hdgRef.instance.classList.remove("d-none");
            }
        }

        let hdgTrue: number;
        if (headingAvailable) {
            hdgTrue = this.props.magvar.magToTrue(this.props.sensors.in.headingGyro!);
        } else {
            hdgTrue = this.props.magvar.magToTrue(this.props.userSettings.getSetting('cal3HeadingMag').get());
        }

        const tas = this.props.userSettings.getSetting('cal3Tas').get();
        if (!(Math.round(tas) <= 999)) {
            //#389: a TAS that does not fit the field (CAL 2 computes more than 999 kt) shows dashes and gives no wind
            this.children.get("windLabel").text = "HDWND";
            this.children.get("windComponent").speed = null;
            this.children.get("windDir").bearing = null;
            this.children.get("windSpeed").speed = null;
            return;
        }

        const windSpeed = calculateWindspeed(tas, this.props.sensors.in.gps.groundspeed, hdgTrue, this.props.sensors.in.gps.trackTrue);
        const windDir = calculateWindDirection(tas, this.props.sensors.in.gps.groundspeed, hdgTrue, this.props.sensors.in.gps.trackTrue);
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