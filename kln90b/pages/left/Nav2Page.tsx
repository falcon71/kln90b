import {FSComponent, ICAO, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {DistanceDisplay} from "../../controls/displays/DistanceDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {LatitudeDisplay} from "../../controls/displays/LatitudeDisplay";
import {LongitudeDisplay} from "../../controls/displays/LongitudeDisplay";
import {SidStar} from "../../data/navdata/SidStar";


type Nav2PageTypes = {
    vor: TextDisplay,
    vorBearing: BearingDisplay,
    vorDist: DistanceDisplay,
    lat: LatitudeDisplay,
    lon: LongitudeDisplay,
}

export class Nav2Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Nav2PageTypes>;

    readonly name: string = "NAV 2";

    constructor(props: PageProps) {
        super(props);


        this.children = new UIElementChildren<Nav2PageTypes>({
            vor: new TextDisplay("---"),
            vorBearing: new BearingDisplay(),
            vorDist: new DistanceDisplay(6),
            lat: new LatitudeDisplay(this.props.sensors.in.gps.isValid() ? this.props.sensors.in.gps.coords.lat : null),
            lon: new LongitudeDisplay(this.props.sensors.in.gps.isValid() ? this.props.sensors.in.gps.coords.lon : null),
        });
    }


    public render(): VNode {
        return (<pre>
            PRESENT POS<br/>
            <br/>
            {this.children.get("vor").render()}&nbsp&nbsp{this.children.get("vorBearing").render()}fr<br/>
            &nbsp&nbsp&nbsp{this.children.get("vorDist").render()}nm<br/>
            {this.children.get("lat").render()}<br/>
            {this.children.get("lon").render()}<br/>
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        if (this.props.sensors.in.gps.isValid()) {
            this.children.get("lat").latitude = this.props.sensors.in.gps.coords.lat;
            this.children.get("lon").longitude = this.props.sensors.in.gps.coords.lon;

            //3-32 displays VOR of arc, when within 30NM
            let vor = SidStar.getVorIfWithin30NMOfArc(this.props.memory.navPage, this.props.memory.fplPage.flightplans[0]);
            if (vor === null) {
                const nearestVors = this.props.nearestLists.vorNearestList.getNearestList();
                if (nearestVors.length > 0) {
                    vor = nearestVors[0].facility;
                }
            }

            if (vor === null) {
                this.children.get("vor").text = "---";
                this.children.get("vorBearing").bearing = null;
                this.children.get("vorDist").distance = null;
            } else {
                this.children.get("vor").text = ICAO.getIdent(vor.icao);
                const radialTrue = this.props.sensors.in.gps.coords.bearingFrom(vor.lat, vor.lon); //NearestWpt is to
                this.children.get("vorBearing").bearing = this.props.magvar.trueToMag(radialTrue, -vor.magneticVariation);
                this.children.get("vorDist").distance = UnitType.GA_RADIAN.convertTo(this.props.sensors.in.gps.coords.distance(vor), UnitType.NMILE);
            }
        } else {
            this.children.get("vor").text = "---";
            this.children.get("vorBearing").bearing = null;
            this.children.get("vorDist").distance = null;
            this.children.get("lat").latitude = null;
            this.children.get("lon").longitude = null;
        }


    }

}