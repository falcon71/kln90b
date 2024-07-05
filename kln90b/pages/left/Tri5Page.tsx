import {FSComponent, GeoPoint, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Degrees, Knots, NauticalMiles, Seconds} from "../../data/Units";
import {SpeedFieldset} from "../../controls/selects/SpeedFieldset";
import {TripFuelFieldset} from "../../controls/selects/FuelFieldset";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";
import {TripFuelDisplay} from "../../controls/displays/FuelDisplay";
import {calculateGroundspeed} from "../../data/Wind";
import {SelectField} from "../../controls/selects/SelectField";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {HOURS_TO_SECONDS} from "../../data/navdata/NavCalculator";


type Tri5PageTypes = {
    fpl: SelectField,
    distance: RoundedDistanceDisplay,
    from: TextDisplay,
    to: TextDisplay,
    gs: SpeedFieldset,
    ete: DurationDisplay,
    ff: TripFuelFieldset,
    res: TripFuelFieldset,
    fReq: TripFuelDisplay,
}

/**
 * 5-6
 */
export class Tri5Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Tri5PageTypes>;

    readonly name: string = "TRI 5";

    private from: string = "     ";
    private to: string = "     ";
    private gs: Knots | null = null;
    private dist: NauticalMiles | null = null;
    private bearing: Degrees | null = null;
    private ete: Seconds | null = null;

    constructor(props: PageProps) {
        super(props);


        this.children = new UIElementChildren<Tri5PageTypes>({
            fpl: new SelectField([" 0", " 1", " 2", " 3", " 4", " 5", " 6", " 7", " 8", " 9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25"], this.props.memory.triPage.tri5Fpl, this.setFpl.bind(this)),
            distance: new RoundedDistanceDisplay(Alignment.right, this.dist),
            from: new TextDisplay(this.from),
            to: new TextDisplay(this.to),
            gs: new SpeedFieldset(this.gs ?? 0, this.setGS.bind(this)),
            ete: new DurationDisplay(this.ete),
            ff: new TripFuelFieldset(this.props.memory.triPage.ff, this.setFF.bind(this)),
            res: new TripFuelFieldset(this.props.memory.triPage.reserve, this.setReserve.bind(this)),
            fReq: new TripFuelDisplay(null),
        });

        this.cursorController = new CursorController(this.children);
        this.setFpl(this.props.memory.triPage.tri5Fpl);
    }

    public render(): VNode {
        return (<pre>
            FP{this.children.get("fpl").render()} {this.children.get("distance").render()}nm<br/>
            {this.children.get("from").render()}-{this.children.get("to").render()}<br/>
            {this.children.get("gs").render()}kt {this.children.get("ete").render()}<br/>
            FF:&nbsp{this.children.get("ff").render()}<br/>
            RES:{this.children.get("res").render()}<br/>
            F REQ {this.children.get("fReq").render()}
        </pre>);
    }

    private setFpl(fpl: number) {
        this.props.memory.triPage.tri5Fpl = fpl;

        const fplLegs = this.props.memory.fplPage.flightplans[fpl].getLegs();
        if (fplLegs.length < 2) {
            this.from = fplLegs.length >= 1 ? IcaoFixedLength.getIdentFromFacility(fplLegs[0].wpt) : "     ";
            this.to = "     ";
            this.bearing = null;
            this.dist = null;
            this.gs = null;
            this.ete = null;
        } else {
            this.from = IcaoFixedLength.getIdentFromFacility(fplLegs[0].wpt);
            this.to = IcaoFixedLength.getIdentFromFacility(fplLegs[fplLegs.length - 1].wpt);

            const from = new GeoPoint(0, 0);
            let gs = 0;
            this.dist = 0;
            for (let i = 1; i < fplLegs.length; i++) {
                from.set(fplLegs[i - 1].wpt);

                this.dist += UnitType.GA_RADIAN.convertTo(from.distance(fplLegs[i].wpt), UnitType.NMILE);
                const bearing = from.bearingTo(fplLegs[i].wpt);
                gs += calculateGroundspeed(this.props.memory.triPage.tas, bearing, this.props.memory.triPage.windSpeed, this.props.memory.triPage.windDirTrue);
            }

            this.gs = gs / (fplLegs.length - 1);
            this.ete = this.dist / this.gs * HOURS_TO_SECONDS;
        }

        this.children.get("from").text = this.from;
        this.children.get("to").text = this.to;
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