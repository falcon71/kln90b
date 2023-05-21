import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {TimeFieldset} from "../../controls/selects/TimeFieldset";
import {SelectField} from "../../controls/selects/SelectField";
import {TimeStamp, TIMEZONES, UTC} from "../../data/Time";


type Cal6PageTypes = {
    fromTime: TimeFieldset,
    fromZone: SelectField,
    fromZomeName: TextDisplay,
    toTime: TimeFieldset,
    toZone: SelectField,
    toZomeName: TextDisplay,
}

/**
 * 5-14
 */
export class Cal6Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Cal6PageTypes>;

    readonly name: string = "CAL 6";

    constructor(props: PageProps) {
        super(props);

        let timeZ = this.props.memory.calPage.cal6TimeZ;
        if (timeZ === null) {
            timeZ = this.props.sensors.in.gps.timeZulu;
            this.props.memory.calPage.cal6TimeZ = timeZ;
        }
        let fromZone = this.props.memory.calPage.cal6FromTimezone;
        if (fromZone === null) {
            fromZone = this.props.userSettings.getSetting("timezone").get();
            this.props.memory.calPage.cal6FromTimezone = fromZone;
        }


        let toZone = this.props.memory.calPage.cal6ToTimezone;
        if (toZone === null) {
            toZone = 0;
            this.props.memory.calPage.cal6ToTimezone = 0;
        }

        const timeFrom = timeZ.atTimezone(TIMEZONES[fromZone]);
        const timeTo = timeZ.atTimezone(TIMEZONES[toZone]);

        this.children = new UIElementChildren<Cal6PageTypes>({
            fromTime: new TimeFieldset(timeFrom, this.setTimeFrom.bind(this)),
            fromZone: new SelectField(TIMEZONES.map(t => t.code), fromZone, this.saveZoneFrom.bind(this)),
            fromZomeName: new TextDisplay(TIMEZONES[fromZone].name),
            toTime: new TimeFieldset(timeTo, this.setTimeTo.bind(this)),
            toZone: new SelectField(TIMEZONES.map(t => t.code), toZone, this.saveZoneTo.bind(this)),
            toZomeName: new TextDisplay(TIMEZONES[toZone].name),
        });

        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            &nbspTIME CONV<br/>
            &nbsp{this.children.get("fromTime").render()} {this.children.get("fromZone").render()}<br/>
            {this.children.get("fromZomeName").render()}<br/>
            <br/>
            &nbsp{this.children.get("toTime").render()} {this.children.get("toZone").render()}<br/>
            {this.children.get("toZomeName").render()}
        </pre>);
    }

    private setTimeFrom(timeFrom: TimeStamp): void {
        const timeZ = timeFrom.atTimezone(UTC);
        this.props.memory.calPage.cal6TimeZ = timeZ;

        const timeTo = timeZ.atTimezone(TIMEZONES[this.props.memory.calPage.cal6ToTimezone!]);
        this.children.get("toTime").setTime(timeTo);
    }

    private setTimeTo(timeTo: TimeStamp): void {
        const timeZ = timeTo.atTimezone(UTC);
        this.props.memory.calPage.cal6TimeZ = timeZ;

        const timeFrom = timeZ.atTimezone(TIMEZONES[this.props.memory.calPage.cal6FromTimezone!]);
        this.children.get("fromTime").setTime(timeFrom);
    }

    private saveZoneFrom(tzFrom: number): void {
        this.props.memory.calPage.cal6FromTimezone = tzFrom;

        const timeFrom = this.props.memory.calPage.cal6TimeZ!.atTimezone(TIMEZONES[tzFrom]);
        this.children.get("fromTime").setTime(timeFrom);
        this.children.get("fromZomeName").text = TIMEZONES[tzFrom].name;
    }

    private saveZoneTo(tzTo: number): void {
        this.props.memory.calPage.cal6ToTimezone = tzTo;

        const timeTo = this.props.memory.calPage.cal6TimeZ!.atTimezone(TIMEZONES[tzTo]);
        this.children.get("toTime").setTime(timeTo);
        this.children.get("toZomeName").text = TIMEZONES[tzTo].name;
    }
}