import {Facility, FSComponent, UnitType, VNode} from '@microsoft/msfs-sdk';
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
import {calculateGroundspeedAlongCourse} from "../../data/Wind";
import {HOURS_TO_SECONDS} from "../../data/navdata/NavCalculator";
import {bearingBetween} from "../../data/navdata/Bearing";


type Tri1PageTypes = {
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
 * 5-3
 */
export class Tri1Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Tri1PageTypes>;

    readonly name: string = "TRI 1";

    private gs: Knots | null = null;
    private dist: NauticalMiles | null = null;
    private bearingTrue: Degrees | null = null;
    private ete: Seconds | null = null;

    constructor(props: PageProps) {
        super(props);


        this.children = new UIElementChildren<Tri1PageTypes>({
            to: new WaypointEditor({
                ...this.props,
                enterCallback: this.setTo.bind(this),
                value: this.props.memory.triPage.tri1To,
                parent: this,
            }),
            distance: new RoundedDistanceDisplay(Alignment.right, this.dist),
            bearing: new BearingDisplay(this.bearingTrue),
            gs: new SpeedFieldset(this.gs ?? 0, this.setGS.bind(this)),
            ete: new DurationDisplay(this.ete, true),
            ff: new TripFuelFieldset(this.props.userSettings.getSetting('triFuelFlow').get(), this.setFF.bind(this)),
            res: new TripFuelFieldset(this.props.userSettings.getSetting('triReserve').get(), this.setReserve.bind(this)),
            fReq: new TripFuelDisplay(null),
        });

        this.cursorController = new CursorController(this.children);
        this.setTo(this.props.memory.triPage.tri1To);
    }

    public render(): VNode {
        return (<pre>
            P.POS-{this.children.get("to").render()}<br/>
            {this.children.get("distance").render()}nm {this.children.get("bearing").render()}<br/>
            {this.children.get("gs").render()}kt {this.children.get("ete").render()}<br/>
            FF:&nbsp{this.children.get("ff").render()}<br/>
            RES:{this.children.get("res").render()}<br/>
            F REQ {this.children.get("fReq").render()}
        </pre>);
    }

    private setTo(wpt: Facility | null) {
        this.props.memory.triPage.tri1To = wpt;
        if (wpt === null || !this.props.sensors.in.gps.isValid()) {
            this.bearingTrue = null;
            this.dist = null;
            this.gs = null;
            this.ete = null;
        } else {
            //#432: on the waypoint there is no bearing to it, and without a course no ground speed along it
            const bearingTrue =
                this.bearingTrue = bearingBetween(this.props.sensors.in.gps.coords, wpt);
            this.dist = UnitType.GA_RADIAN.convertTo(this.props.sensors.in.gps.coords.distance(wpt!), UnitType.NMILE);
            this.gs = bearingTrue === null ? null : calculateGroundspeedAlongCourse(this.props.userSettings.getSetting('triTas').get(), bearingTrue, this.props.userSettings.getSetting('triWindSpeed').get(), this.props.userSettings.getSetting('triWindDirTrue').get());
            this.ete = this.gs === null ? null : this.dist / this.gs * HOURS_TO_SECONDS;
        }

        this.children.get("bearing").bearing = this.props.magvar.trueToMag(this.bearingTrue);
        this.children.get("distance").distance = this.dist;
        //no route keeps 000; a route the wind leaves no solution for shows dashes (#167)
        this.children.get("gs").setSpeed(this.dist === null ? 0 : this.gs);
        this.children.get("ete").time = this.ete;

        this.calcFuelRequired();
    }

    private calcFuelRequired() {
        if (this.ete === null) {
            this.children.get("fReq").fuel = null;
        } else {
            this.children.get("fReq").fuel = (this.ete / 3600) * this.props.userSettings.getSetting('triFuelFlow').get() + this.props.userSettings.getSetting('triReserve').get();
        }

    }

    private setFF(ff: number) {
        this.props.userSettings.getSetting('triFuelFlow').set(ff);

        this.calcFuelRequired();
    }

    private setReserve(reserve: number) {
        this.props.userSettings.getSetting('triReserve').set(reserve);

        this.calcFuelRequired();
    }

    private setGS(speed: Knots) {
        this.gs = speed;

        if (this.dist === null || !this.props.sensors.in.gps.isValid()) {
            this.ete = null;
        } else {
            this.ete = this.dist / this.gs * HOURS_TO_SECONDS;
        }

        this.children.get("ete").time = this.ete;

        this.calcFuelRequired();
    }
}