import {Facility, FSComponent, GeoPoint, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {Degrees, Knots, NauticalMiles, Seconds} from "../../data/Units";
import {SpeedFieldset} from "../../controls/selects/SpeedFieldset";
import {TripFuelFieldset} from "../../controls/selects/FuelFieldset";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";
import {TripFuelDisplay} from "../../controls/displays/FuelDisplay";
import {calculateGroundspeed} from "../../data/Wind";
import {HOURS_TO_SECONDS} from "../../data/navdata/NavCalculator";


type Tri3PageTypes = {
    from: WaypointEditor,
    to: WaypointEditor,
    distance: RoundedDistanceDisplay,
    bearing: BearingDisplay,
    gs: SpeedFieldset,
    ete: DurationDisplay,
    ff: TripFuelFieldset,
    res: TripFuelFieldset,
    fReq: TripFuelDisplay,
}

/**
 * 5-5
 */
export class Tri3Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Tri3PageTypes>;

    readonly name: string = "TRI 3";

    private gs: Knots | null = null;
    private dist: NauticalMiles | null = null;
    private bearingTrue: Degrees | null = null;
    private ete: Seconds | null = null;
    private magvar: number = 0;

    constructor(props: PageProps) {
        super(props);


        this.children = new UIElementChildren<Tri3PageTypes>({
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
            distance: new RoundedDistanceDisplay(Alignment.right, this.dist),
            bearing: new BearingDisplay(this.bearingTrue),
            gs: new SpeedFieldset(this.gs ?? 0, this.setGS.bind(this)),
            ete: new DurationDisplay(this.ete),
            ff: new TripFuelFieldset(this.props.memory.triPage.ff, this.setFF.bind(this)),
            res: new TripFuelFieldset(this.props.memory.triPage.reserve, this.setReserve.bind(this)),
            fReq: new TripFuelDisplay(null),
        });

        this.cursorController = new CursorController(this.children);
        this.calcRoute();
    }

    public render(): VNode {
        return (<pre>
            {this.children.get("from").render()}-{this.children.get("to").render()}<br/>
            {this.children.get("distance").render()}nm {this.children.get("bearing").render()}<br/>
            {this.children.get("gs").render()}kt {this.children.get("ete").render()}<br/>
            FF:&nbsp{this.children.get("ff").render()}<br/>
            RES:{this.children.get("res").render()}<br/>
            F REQ {this.children.get("fReq").render()}
        </pre>);
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
        if (this.props.memory.triPage.tri3From === null || this.props.memory.triPage.tri3To === null) {
            this.bearingTrue = null;
            this.dist = null;
            this.gs = null;
            this.ete = null;
        } else {
            const from = new GeoPoint(this.props.memory.triPage.tri3From.lat, this.props.memory.triPage.tri3From.lon);

            this.bearingTrue = from.bearingTo(this.props.memory.triPage.tri3To);
            this.magvar = this.props.magvar.getMagvarForCoordinates(from);

            this.dist = UnitType.GA_RADIAN.convertTo(from.distance(this.props.memory.triPage.tri3To), UnitType.NMILE);
            this.gs = calculateGroundspeed(this.props.memory.triPage.tas, this.bearingTrue, this.props.memory.triPage.windSpeed, this.props.memory.triPage.windDirTrue);
            this.ete = this.dist / this.gs * HOURS_TO_SECONDS;
        }

        this.children.get("bearing").bearing = this.props.magvar.trueToMag(this.bearingTrue, this.magvar);
        this.children.get("distance").distance = this.dist;
        this.children.get("gs").setSpeed(this.gs ?? 0);
        this.children.get("ete").time = this.ete;

        this.calcFuelRequired();
    }

    private calcFuelRequired() {
        if (this.ete === null) {
            this.children.get("fReq").fuel = null;
        } else {
            this.children.get("fReq").fuel = (this.ete / 3600) * this.props.memory.triPage.ff + this.props.memory.triPage.reserve;
        }

    }

    private setFF(ff: number) {
        this.props.memory.triPage.ff = ff;

        this.calcFuelRequired();
    }

    private setReserve(reserve: number) {
        this.props.memory.triPage.reserve = reserve;

        this.calcFuelRequired();
    }

    private setGS(speed: Knots) {
        this.gs = speed;

        if (this.dist === null) {
            this.ete = null;
        } else {
            this.ete = this.dist / this.gs * HOURS_TO_SECONDS;
        }

        this.children.get("ete").time = this.ete;

        this.calcFuelRequired();
    }
}