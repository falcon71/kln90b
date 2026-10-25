import {FSComponent, UnitType, VNode, VorFacility} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {DistanceDisplay} from "../../controls/displays/DistanceDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {LatitudeDisplay} from "../../controls/displays/LatitudeDisplay";
import {LongitudeDisplay} from "../../controls/displays/LongitudeDisplay";
import {SidStar} from "../../data/navdata/SidStar";
import {TICK_TIME_DISPLAY} from "../../TickController";
import {ErrorEvent} from "../../controls/ErrorPage";
import {bearingBetween} from "../../data/navdata/Bearing";

//#204: the 90B guide does not say how often NAV 2 picks its VOR again. The KLN 89 trainer switched to a new nearer VOR
//within about 10 s while the page stayed shown (2026-10-16); maintainer ruling, #204: when the page opens, then every 10 s
const SEARCH_INTERVAL_TICKS = 10000 / TICK_TIME_DISPLAY;


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

    //3-8, 3-32: the nearest low or high altitude VOR, as the last search found it. The page searches only while it is
    //shown (#204)
    private nearestVor: VorFacility | null = null;
    private isSearching: boolean = false;
    private ticksToSearch: number = SEARCH_INTERVAL_TICKS;

    constructor(props: PageProps) {
        super(props);
        this.searchNearestVor();

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
        this.ticksToSearch--;
        if (this.ticksToSearch <= 0) {
            this.searchNearestVor();
        }
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
                vor = this.nearestVor;
            }

            if (vor === null) {
                this.children.get("vor").text = "---";
                this.children.get("vorBearing").bearing = null;
                this.children.get("vorDist").distance = null;
            } else {
                this.children.get("vor").text = vor.icaoStruct.ident.padEnd(3, " ");
                const radialTrue = bearingBetween(vor, this.props.sensors.in.gps.coords); //#339: the radial is measured at the VOR; #432: none on the VOR
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

    private searchNearestVor(): void {
        //One search at a time; a search that answers late is not overtaken by the next one
        if (this.isSearching) {
            return;
        }
        this.isSearching = true;
        this.ticksToSearch = SEARCH_INTERVAL_TICKS;
        const coords = this.props.sensors.in.gps.coords;
        this.props.nearestUtils.getNearestLowHighVor(coords.lat, coords.lon).then(vor => {
            this.nearestVor = vor;
            this.isSearching = false;
        }, e => {
            //A failed search shows on the error page, as one of a nearest list does (#95), and the next one runs
            this.isSearching = false;
            console.error(e);
            if (e instanceof Error) {
                this.props.bus.getPublisher<ErrorEvent>().pub("error", e);
            }
        });
    }
}
