import {Facility, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {SixLineHalfPage} from "../FiveSegmentPage";
import {airspacesAlongRoute} from "../../services/AirspacesAlongRoute";
import {formatAirspaceTypeName} from "../../data/navdata/AirspaceAlert";


type Tri4PageTypes = {
    from: WaypointEditor,
    to: WaypointEditor,
    line0: TextDisplay,
    line1: TextDisplay,
    line2: TextDisplay,
    line3: TextDisplay,
    line4: TextDisplay,
}

/**
 * 5-5
 */
export class Tri4Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Tri4PageTypes>;

    readonly name: string = "TRI 4";
    private lines: string[] = [];

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Tri4PageTypes>({
            from: new WaypointEditor({
                ...this.props,
                enterCallback: this.setFrom.bind(this),
                value: this.props.memory.triPage.tri3From,
                parent: this,
            }),
            to: new WaypointEditor({
                ...this.props,
                enterCallback: this.setTo.bind(this),
                value: this.props.memory.triPage.tri3To,
                parent: this,
            }),
            line0: new TextDisplay(""),
            line1: new TextDisplay(""),
            line2: new TextDisplay(""),
            line3: new TextDisplay(""),
            line4: new TextDisplay(""),
        });

        this.cursorController = new CursorController(this.children);
        this.calcRoute();
    }


    public render(): VNode {
        return (<pre>
            {this.children.get("from").render()}-{this.children.get("to").render()}<br/>
            {this.children.get("line0").render()}<br/>
            {this.children.get("line1").render()}<br/>
            {this.children.get("line2").render()}<br/>
            {this.children.get("line3").render()}<br/>
            {this.children.get("line4").render()}
            </pre>);
    }

    protected redraw() {
        const startIndex = this.currentPage * 5;

        for (let i = 0; i < 5; i++) {
            if (i + startIndex < this.lines.length) {
                this.children.get(`line${i}` as any).text = this.lines[i + startIndex];
            } else {
                this.children.get(`line${i}` as any).text = "";
            }

        }
    }

    private setFrom(wpt: Facility | null) {
        this.props.memory.triPage.tri3From = wpt;
        this.calcRoute();

    }

    private setTo(wpt: Facility | null) {
        this.props.memory.triPage.tri3To = wpt;
        this.calcRoute();
    }

    private calcRoute() {
        this.lines = [];
        this.requiresRedraw = true;
        if (this.props.memory.triPage.tri3From === null || this.props.memory.triPage.tri3To === null) {
            this.numPages = 1;
            this.currentPage = 0;
        } else {
            const esa = this.props.msa.getMSAFromTo(this.props.memory.triPage.tri3From, this.props.memory.triPage.tri3To);
            const lines = ["ESA " + (esa?.toString().padStart(5, " ") ?? "-----") + "ft"];
            airspacesAlongRoute([this.props.memory.triPage.tri3From, this.props.memory.triPage.tri3To], this.props.nearestUtils).then(airspaces => {
                for (const airspace of airspaces) {
                    console.log("found airspace", airspace);
                    const name = airspace.facility.name;
                    const type = formatAirspaceTypeName(airspace.facility.type);
                    let line2 = ` ${type}`;
                    if (name.length > 11) {
                        line2 = ` ${name.substring(11, 21 - line2.length)}${line2}`;
                    }
                    lines.push(name.substring(0, 11));
                    lines.push(line2);
                }

                this.lines = lines;

                this.numPages = Math.max(Math.ceil(this.lines.length / 5), 1);
                this.currentPage = 0;
                this.requiresRedraw = true;
            });
        }
    }

}