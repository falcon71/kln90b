import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {DateEditor} from "../../controls/editors/DateEditor";
import {TimeEditor} from "../../controls/editors/TimeEditor";
import {SelectField} from "../../controls/selects/SelectField";
import {TimeStamp, TIMEZONES, UTC} from "../../data/Time";
import {BaroFieldset, BaroFieldsetFactory} from "../../controls/selects/BaroFieldset";
import {Button} from "../../controls/Button";
import {FourSegmentPage} from "../FourSegmentPage";
import {AiracPage} from "../AiracPage";
import {VFROnlyPage} from "../VFROnlyPage";
import {format} from "numerable";
import {Inhg} from "../../data/Units";


type SelftTestRightPageChildTypes = {
    date: DateEditor;
    time: TimeEditor;
    seconds: TextDisplay;
    timezone: SelectField;
    approve: Button;

    altitude: TextDisplay;

    barometer: BaroFieldset;
}


export class SelfTestRightPage extends SixLineHalfPage {

    public readonly cursorController: CursorController;
    readonly children: UIElementChildren<SelftTestRightPageChildTypes>;

    readonly name: string = "     ";

    constructor(props: PageProps) {
        super(props);


        const timezone = this.props.userSettings.getSetting("timezone").get();


        const now = this.props.sensors.in.gps.timeZulu;

        const nowTz = now.atTimezone(TIMEZONES[timezone]);
        console.log("Time now", now, nowTz);


        this.children = new UIElementChildren<SelftTestRightPageChildTypes>({
            date: new DateEditor(this.props.bus, now, this.saveDate.bind(this)),
            time: new TimeEditor(this.props.bus, now, this.saveTime.bind(this)),
            seconds: new TextDisplay(this.formatSeconds(now)),
            timezone: new SelectField(TIMEZONES.map(t => t.code), timezone, this.saveTimezone.bind(this)),
            barometer: BaroFieldsetFactory.createBaroFieldSet(this.props.sensors.in.airdata.barometer, this.props.userSettings, this.saveBaro),
            approve: new Button("APPROVE?", this.approve.bind(this)),
            altitude: new TextDisplay(this.formatAlt()),
        });

        this.children.get("barometer").setReadonly(this.props.planeSettings.input.airdata.baroSource > 0);

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
        this.cursorController.focusIndex(3);
    }


    public render(): VNode {
        return (<pre>
            DATE/TIME  <br/>
            &nbsp&nbsp{this.children.get("date").render()}<br/>
            {this.children.get("time").render()}:{this.children.get("seconds").render()}{this.children.get("timezone").render()}<br/>
            ALT {this.children.get("altitude").render()}ft<br/>
            BARO:{this.children.get("barometer").render()}<br/>
            &nbsp&nbsp{this.children.get("approve").render()}
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);

    }

    protected redraw() {
        this.children.get("altitude").text = this.formatAlt();

        const timezone = this.props.userSettings.getSetting("timezone").get();

        const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[timezone]);

        this.children.get("date").setValue(now);
        this.children.get("time").setValue(now);
        this.children.get("seconds").text = this.formatSeconds(now);

        if (this.props.planeSettings.input.airdata.baroSource > 0) {
            this.children.get("barometer").setBaro(this.props.sensors.in.airdata.barometer);
        }
    }

    private formatAlt(): string {
        const indicatedAlt = this.props.sensors.in.airdata.getIndicatedAlt();
        if (indicatedAlt === null) {
            return "-----";
        }
        return String(Math.round(indicatedAlt / 100) * 100).padStart(5, " ");
    }

    private saveTimezone(tzIndex: number): void {
        this.props.userSettings.getSetting("timezone").set(tzIndex);
    }

    private saveBaro(baro: Inhg): void {
        this.props.sensors.in.airdata.barometer = baro;
    }

    private saveDate(date: TimeStamp): void {
        console.log("saveDate", date);
        const timezone = this.props.userSettings.getSetting("timezone").get();

        const oldDate = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[timezone]);
        const newDate = oldDate.withDate(date.getYear(), date.getMonth(), date.getDate());

        this.props.sensors.in.gps.timeZulu = newDate.atTimezone(UTC);
    }

    private saveTime(date: TimeStamp): void {
        console.log("saveTime", date);

        const timezone = this.props.userSettings.getSetting("timezone").get();

        const oldDate = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[timezone]);
        const newDate = oldDate.withTime(date.getHours(), date.getMinutes());

        this.props.sensors.in.gps.timeZulu = newDate.atTimezone(UTC);
    }

    private approve(): void {
        this.props.memory.navPage.isSelfTestActive = false;

        this.props.sensors.out.audioGenerator.shortBeeps(5);
        this.props.sensors.in.gps.startGPSSearch();
        if (this.props.planeSettings.vfrOnly) {
            this.props.pageManager.setCurrentPage(FourSegmentPage, {
                ...this.props,
                page: new VFROnlyPage(this.props),
            });
        } else {
            this.props.pageManager.setCurrentPage(FourSegmentPage, {
                ...this.props,
                page: new AiracPage(this.props),
            });
        }

    }

    private formatSeconds(date: TimeStamp): string {
        return format(date.getSeconds(), "00");
    }
}