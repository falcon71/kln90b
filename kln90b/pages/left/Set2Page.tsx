import {FSComponent, NodeReference, UserSetting, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {DateEditor} from "../../controls/editors/DateEditor";
import {TimeEditor} from "../../controls/editors/TimeEditor";
import {SelectField} from "../../controls/selects/SelectField";
import {TimeStamp, TIMEZONES, UTC} from "../../data/Time";
import {format} from "numerable";
import {MagvarEditor} from "../../controls/editors/MagvarEditor";
import {OneTimeMessage} from "../../data/MessageHandler";
import {GPSEvents} from "../../Sensors";


type Set2PageTypes = {
    date: DateEditor,
    time: TimeEditor,
    seconds: TextDisplay;
    timezone: SelectField;
    timezoneName: TextDisplay,

    magvar: MagvarEditor,
}

/**
 * 3-53
 * 5-44 magvar
 */
export class Set2Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set2PageTypes>;

    readonly name: string = "SET 2";
    protected readonly magvarRef: NodeReference<HTMLSpanElement>;

    private timezoneSetting: UserSetting<number>;

    constructor(props: PageProps) {
        super(props);


        this.timezoneSetting = this.props.userSettings.getSetting("timezone");

        const gps = this.props.sensors.in.gps;

        const now = this.props.sensors.in.gps.timeZulu;

        this.children = new UIElementChildren<Set2PageTypes>({
            date: new DateEditor(this.props.bus, now, this.saveDate.bind(this)),
            time: new TimeEditor(this.props.bus, now, this.saveTime.bind(this)),
            seconds: new TextDisplay(this.formatSeconds(now)),
            timezone: new SelectField(TIMEZONES.map(t => t.code), this.timezoneSetting.get(), this.saveTimezone.bind(this)),
            timezoneName: new TextDisplay(TIMEZONES[this.timezoneSetting.get()].name),
            magvar: new MagvarEditor(this.props.bus, this.props.memory.navPage.userMagvar, this.saveMagvar.bind(this)),
        });

        this.magvarRef = FSComponent.createRef<HTMLSpanElement>();

        if (gps.isValid()) {
            this.children.get("date").isReadonly = true;
            this.children.get("time").isReadonly = true;
        }
        if (this.props.magvar.isMagvarValid()) {
            this.children.get("magvar").isReadonly = true;
        }

        this.cursorController = new CursorController(this.children);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);

    }

    public render(): VNode {
        return (<pre>
            &nbspDATE/TIME<br/>
            <br/>
            &nbsp&nbsp{this.children.get("date").render()}<br/>
            {this.children.get("time").render()}:{this.children.get("seconds").render()}{this.children.get("timezone").render()}<br/>
            {this.children.get("timezoneName").render()}<br/>
            <span class="d-none" ref={this.magvarRef}>MAG V&nbsp&nbsp{this.children.get("magvar").render()}</span>
        </pre>);
    }

    protected redraw() {
        const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[this.timezoneSetting.get()]);

        this.children.get("date").setValue(now);
        this.children.get("time").setValue(now);
        this.children.get("seconds").text = this.formatSeconds(now);

        //We need to refresh these every tick, because the TZ can also be changed on the D/T 2 page
        this.children.get("timezoneName").text = TIMEZONES[this.timezoneSetting.get()].name;
        this.children.get("timezone").value = this.timezoneSetting.get();

        if (this.props.sensors.in.gps.isValid()) {
            this.children.get("date").isReadonly = true;
            this.children.get("time").isReadonly = true;
        }
        if (this.props.magvar.isMagvarValid()) {
            this.magvarRef.instance.classList.add("d-none");
            this.children.get("magvar").isReadonly = true;
        } else {
            this.magvarRef.instance.classList.remove("d-none");
            this.children.get("magvar").isReadonly = false;
        }
    }

    private saveMagvar(magvar: number): void {
        this.props.memory.navPage.userMagvar = magvar;
    }

    private saveTimezone(tzIndex: number): void {
        this.props.userSettings.getSetting("timezone").set(tzIndex);
    }

    private saveDate(date: TimeStamp): void {
        console.log("saveDate", date);
        const dbValdiBefore = this.props.database.isAiracCurrent();

        const timezone = this.props.userSettings.getSetting("timezone").get();

        const oldDate = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[timezone]);
        const newDate = oldDate.withDate(date.getYear(), date.getMonth(), date.getDate());

        this.props.sensors.in.gps.timeZulu = newDate.atTimezone(UTC);
        this.props.sensors.in.gps.recalcTTF();
        const dbValidAfter = this.props.database.isAiracCurrent();
        if (dbValdiBefore !== dbValidAfter) {
            this.props.messageHandler.addMessage(new OneTimeMessage(["RECYLCE POWER TO USE", "CORRECT DATA BASE DATA"]))
        }
        this.props.bus.getPublisher<GPSEvents>().pub("timeUpdatedEvent", this.props.sensors.in.gps.timeZulu);
    }

    private saveTime(date: TimeStamp): void {
        console.log("saveTime", date);
        const dbValdiBefore = this.props.database.isAiracCurrent();

        const timezone = this.props.userSettings.getSetting("timezone").get();

        const oldDate = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[timezone]);
        const newDate = oldDate.withTime(date.getHours(), date.getMinutes());

        this.props.sensors.in.gps.timeZulu = newDate.atTimezone(UTC);
        this.props.sensors.in.gps.recalcTTF();
        const dbValidAfter = this.props.database.isAiracCurrent();
        if (dbValdiBefore !== dbValidAfter) {
            this.props.messageHandler.addMessage(new OneTimeMessage(["RECYLCE POWER TO USE", "CORRECT DATA BASE DATA"]))
        }
        this.props.bus.getPublisher<GPSEvents>().pub("timeUpdatedEvent", this.props.sensors.in.gps.timeZulu);
    }

    private formatSeconds(date: TimeStamp): string {
        return format(date.getSeconds(), "00");
    }


}