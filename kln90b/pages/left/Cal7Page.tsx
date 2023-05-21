import {Facility, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {SelectField} from "../../controls/selects/SelectField";
import {TimeStamp, TIMEZONES, UTC} from "../../data/Time";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {DateEditor} from "../../controls/editors/DateEditor";
import {TimeDisplay} from "../../controls/displays/TimeDisplay";
import {calculateSunrise, calculateSunset} from "../../data/Sun";


type Cal7PageTypes = {
    wpt: WaypointEditor,
    date: DateEditor,
    zone: SelectField,
    rise: TimeDisplay,
    set: TimeDisplay,
}

/**
 * 5-15
 */
export class Cal7Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Cal7PageTypes>;

    readonly name: string = "CAL 7";

    constructor(props: PageProps) {
        super(props);


        let date = this.props.memory.calPage.cal7DateZ;
        if (date === null) {
            date = this.props.sensors.in.gps.timeZulu;
            this.props.memory.calPage.cal7DateZ = date;
        }

        let zone = this.props.memory.calPage.cal7Timezone;
        if (zone === null) {
            zone = this.props.userSettings.getSetting("timezone").get();
            this.props.memory.calPage.cal7Timezone = zone;
        }

        date = date.atTimezone(TIMEZONES[zone]);


        let wpt = this.props.memory.calPage.cal7Wpt;
        if (wpt === null) {
            wpt = this.props.memory.navPage.activeWaypoint.getDestination();
            this.props.memory.calPage.cal7Wpt = wpt;
        }

        this.children = new UIElementChildren<Cal7PageTypes>({
            wpt: new WaypointEditor({
                ...this.props,
                enterCallback: this.saveWpt.bind(this),
                value: wpt,
                parent: this,
            }),
            date: new DateEditor(this.props.bus, date, this.saveDate.bind(this)),
            zone: new SelectField(TIMEZONES.map(t => t.code), zone, this.saveZone.bind(this)),
            rise: new TimeDisplay(null),
            set: new TimeDisplay(null),
        });

        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            SUNRISE/SET<br/>
            {this.children.get("wpt").render()}<br/>
            &nbsp&nbsp{this.children.get("date").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("zone").render()}<br/>
            RISE&nbsp&nbsp{this.children.get("rise").render()}<br/>
            SET&nbsp&nbsp&nbsp{this.children.get("set").render()}
        </pre>);
    }

    protected redraw(): void {
        if (this.props.memory.calPage.cal7Wpt === null) {
            this.children.get("rise").time = null;
            this.children.get("set").time = null;
        } else {
            const sunrise = calculateSunrise(this.props.memory.calPage.cal7DateZ!, this.props.memory.calPage.cal7Wpt);
            const sunset = calculateSunset(this.props.memory.calPage.cal7DateZ!, this.props.memory.calPage.cal7Wpt);
            const timeZone = TIMEZONES[this.props.memory.calPage.cal7Timezone!];
            this.children.get("rise").time = sunrise?.atTimezone(timeZone) ?? null;
            this.children.get("set").time = sunset?.atTimezone(timeZone) ?? null;
        }
    }

    private saveWpt(wpt: Facility | null): void {
        this.props.memory.calPage.cal7Wpt = wpt;
        this.requiresRedraw = true;
    }

    private saveDate(date: TimeStamp): void {
        this.props.memory.calPage.cal7DateZ = date.atTimezone(UTC);
        this.requiresRedraw = true;
    }

    private saveZone(tzTo: number): void {
        this.props.memory.calPage.cal7Timezone = tzTo;
        this.requiresRedraw = true;
    }
}