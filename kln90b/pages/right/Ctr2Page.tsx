import {FSComponent, LodBoundary, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {DistanceDisplay} from "../../controls/displays/DistanceDisplay";
import {LatitudeDisplay} from "../../controls/displays/LatitudeDisplay";
import {LongitudeDisplay} from "../../controls/displays/LongitudeDisplay";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {FIRMAP} from "../../data/FirMap";

type Ctr2PageTypes = {
    ident: TextDisplay,
    new: TextDisplay,
    ctrFrom: TextDisplay,
    ctrTo: TextDisplay,
    vor: TextDisplay,
    bearing: BearingDisplay,
    dist: DistanceDisplay,
    lat: LatitudeDisplay,
    lon: LongitudeDisplay,
}

/**
 * 5-21
 */
export class Ctr2Page extends SixLineHalfPage {

    public cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Ctr2PageTypes>;


    readonly name: string = "CTR 2";

    constructor(props: PageProps) {
        super(props);

        this.numPages = Math.max(this.props.memory.ctrPage.waypoints.length, 1);

        this.children = new UIElementChildren<Ctr2PageTypes>({
            ident: new TextDisplay("     "),
            new: new TextDisplay("   "),
            ctrFrom: new TextDisplay("   "),
            ctrTo: new TextDisplay("   "),
            vor: new TextDisplay("     "),
            bearing: new BearingDisplay(null),
            dist: new DistanceDisplay(4, null),
            lat: new LatitudeDisplay(null),
            lon: new LongitudeDisplay(null),
        });

    }

    public render(): VNode {
        if (this.props.memory.ctrPage.waypoints.length === 0) {
            //No idea how this looks like in the real unit
            return (
                <pre>
                    <br/>
                    <br/>
                    NO CTR<br/>
                    WAYPOINTS
                </pre>
            )
        } else {
            return (
                <pre>
                    &nbsp{this.children.get("ident").render()}&nbsp&nbsp{this.children.get("new").render()}<br/>
                    {this.children.get("ctrFrom").render()}-{this.children.get("ctrTo").render()} CTR<br/>
                    {this.children.get("vor").render()}&nbsp&nbsp{this.children.get("bearing").render()}<br/>
                    &nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("dist").render()}nm<br/>
                    {this.children.get("lat").render()}<br/>
                    {this.children.get("lon").render()}<br/>
                </pre>
            )
        }
    }

    protected redraw(): void {
        if (this.currentPage >= this.props.memory.ctrPage.waypoints.length) {
            return;
        }

        const wpt = this.props.memory.ctrPage.waypoints[this.currentPage];

        this.children.get("ident").text = IcaoFixedLength.getIdentFromFacility(wpt.wpt);
        this.children.get("new").text = wpt.isNew ? "new" : "   ";
        this.children.get("ctrFrom").text = this.getAirspaceName(wpt.airspaceFrom);
        this.children.get("ctrTo").text = this.getAirspaceName(wpt.airspaceTo);
        this.children.get("vor").text = wpt.wpt.reference1IcaoStruct!.ident.padEnd(5, " ");
        this.children.get("bearing").bearing = this.props.magvar.trueToMag(wpt.wpt.reference1Radial!);
        this.children.get("dist").distance = wpt.wpt.reference1Distance!;
        this.children.get("lat").latitude = wpt.wpt.lat;
        this.children.get("lon").longitude = wpt.wpt.lon;
    }

    private getAirspaceName(airspace: LodBoundary): string {
        const ident = airspace.facility.name.substring(0, 4);

        if (FIRMAP.hasOwnProperty(ident)) {
            return FIRMAP[ident];
        } else {
            return "   ";
        }


    }
}