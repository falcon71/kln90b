import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {SixLineHalfPage} from "../FiveSegmentPage";
import {airspacesAlongRoute} from "../../services/AirspacesAlongRoute";
import {formatAirspaceTypeName} from "../../data/navdata/AirspaceAlert";
import {SelectField} from "../../controls/selects/SelectField";


type Tri6PageTypes = {
    fpl: SelectField,
    line0: TextDisplay,
    line1: TextDisplay,
    line2: TextDisplay,
    line3: TextDisplay,
    line4: TextDisplay,
}

/**
 * 5-5
 */
export class Tri6Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Tri6PageTypes>;

    readonly name: string = "TRI 6";
    private lines: string[] = [];

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Tri6PageTypes>({

            fpl: new SelectField([" 0", " 1", " 2", " 3", " 4", " 5", " 6", " 7", " 8", " 9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25"], this.props.memory.triPage.tri5Fpl, this.setFpl.bind(this)),
            line0: new TextDisplay(""),
            line1: new TextDisplay(""),
            line2: new TextDisplay(""),
            line3: new TextDisplay(""),
            line4: new TextDisplay(""),
        });

        this.cursorController = new CursorController(this.children);
        this.setFpl(this.props.memory.triPage.tri5Fpl);
    }


    public render(): VNode {
        return (<pre>
            FP{this.children.get("fpl").render()}<br/>
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

    private setFpl(fpl: number) {
        this.props.memory.triPage.tri5Fpl = fpl;
        this.lines = [];
        this.requiresRedraw = true;
        const fplLegs = this.props.memory.fplPage.flightplans[fpl].getLegs();
        if (fplLegs.length < 2) {
            this.numPages = 1;
            this.currentPage = 0;
        } else {
            const route = fplLegs.map(l => l.wpt);

            const esa = this.props.msa.getMSAForRoute(route);
            const lines = ["ESA " + (esa?.toString().padStart(5, " ") ?? "-----") + "ft"];
            airspacesAlongRoute(route, this.props.nearestUtils).then(airspaces => {
                if (this.props.memory.triPage.tri5Fpl !== fpl) {
                    return; //The user scrolled faster than we could load the airspaces
                }
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