import {DebounceTimer, Facility, FSComponent, UserSetting, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {NauticalMiles, Seconds} from "../../data/Units";
import {TimeEditor} from "../../controls/editors/TimeEditor";
import {SelectField} from "../../controls/selects/SelectField";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {calcDistToDestination} from "../../services/FlightplanUtils";
import {TimeStamp, TIMEZONES} from "../../data/Time";


type Sta5PageTypes = {
    dest: WaypointEditor,
    eta: TimeEditor,
    timezone: SelectField;
    result: TextDisplay,
}

const RAIM_CALCULATION_TIME = 10 * 1000; //No idea, the manual mentions a few seconds

export class Sta5Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Sta5PageTypes>;

    readonly name: string = "STA 5";

    private wpt: Facility | null = this.props.memory.navPage.activeWaypoint.getDestination();
    private etaZulu: TimeStamp | null = null;
    private timezoneSetting: UserSetting<number>;

    private refDebounce = new DebounceTimer();

    constructor(props: PageProps) {
        super(props);

        this.timezoneSetting = this.props.userSettings.getSetting("timezone");

        const futureLegs = this.props.memory.navPage.activeWaypoint.getFutureLegs();
        this.wpt = futureLegs.length > 0 ? futureLegs[futureLegs.length - 1].wpt : null;

        const destDis = calcDistToDestination(this.props.memory.navPage, futureLegs);
        const destEte = this.calcEte(destDis);
        if (destEte !== null) {
            this.etaZulu = this.props.sensors.in.gps.timeZulu.addSeconds(destEte);
        }

        this.children = new UIElementChildren<Sta5PageTypes>({
            dest: new WaypointEditor({
                ...this.props,
                value: this.wpt,
                enterCallback: this.setWpt.bind(this),
                parent: this,
            }),
            eta: new TimeEditor(this.props.bus, this.etaZulu?.atTimezone(TIMEZONES[this.timezoneSetting.get()]) ?? null, this.saveTime.bind(this)),
            timezone: new SelectField(TIMEZONES.map(t => t.code), this.timezoneSetting.get(), this.saveTimezone.bind(this)),
            result: new TextDisplay("  ççççççç"),
        });

        this.cursorController = new CursorController(this.children);
        this.calculateRaim();
    }

    public render(): VNode {
        return (<pre>
            RAIM STATUS<br/>
            DEST: {this.children.get("dest").render()}<br/>
            ETA:&nbsp&nbsp{this.children.get("eta").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("timezone").render()}<br/>
            {this.children.get("result").render()}<br/>
            -15&nbsp&nbsp0&nbsp&nbsp•15
        </pre>);
    }

    private calcEte(dist: NauticalMiles | null): Seconds | null {
        if (dist === null) {
            return null;
        }
        if (this.props.sensors.in.gps.groundspeed > 2) {
            return dist / this.props.sensors.in.gps.groundspeed * 60 * 60;
        } else {
            return null;
        }
    }

    private setWpt(waypoint: Facility | null) {
        this.wpt = waypoint;
        this.calculateRaim();
    }

    private saveTimezone(tzIndex: number): void {
        this.props.userSettings.getSetting("timezone").set(tzIndex);
        this.children.get("eta").setValue(this.etaZulu?.atTimezone(TIMEZONES[this.timezoneSetting.get()]) ?? null);
    }

    private saveTime(time: TimeStamp): void {
        this.etaZulu = time;
        this.calculateRaim();
    }

    private calculateRaim() {
        this.refDebounce.clear();
        if (this.wpt === null || this.etaZulu === null) {
            this.children.get("result").text = "  ççççççç";
            return;
        }


        this.children.get("result").text = " COMPUTING";

        this.refDebounce.schedule(async () => {
            this.children.get("result").text = "  èèèèèèè"; //Yeah, we are not simulating raim yet...
        }, RAIM_CALCULATION_TIME);
    }


}