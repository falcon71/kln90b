import {FSComponent, UserSetting, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {TimeDisplay} from "../../controls/displays/TimeDisplay";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {SelectField} from "../../controls/selects/SelectField";
import {TIMEZONES} from "../../data/Time";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {KLNFlightplanLeg} from "../../data/flightplan/Flightplan";


type Dt4PageTypes = {
    dct: TextDisplay,
    arrow: ActiveArrow,
    ident: TextDisplay,
    timezone: SelectField;
    depTime: TimeDisplay,
    time: TimeDisplay,
    eta: TimeDisplay,
    flightTime: DurationDisplay,
    ete: DurationDisplay,
}

/**
 * 4-13
 */
export class Dt4Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Dt4PageTypes>;

    readonly name: string = "D/T 4";

    private timezoneSetting: UserSetting<number>;

    constructor(props: PageProps) {
        super(props);

        this.timezoneSetting = this.props.userSettings.getSetting("timezone");

        const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[this.timezoneSetting.get()]);

        this.children = new UIElementChildren<Dt4PageTypes>({
            dct: new TextDisplay(" "),
            arrow: new ActiveArrow(null, this.props.memory.navPage, -1),
            ident: new TextDisplay(""),
            timezone: new SelectField(TIMEZONES.map(t => t.code), this.timezoneSetting.get(), this.saveTimezone.bind(this)),
            depTime: new TimeDisplay(this.props.memory.dtPage.departureTime?.atTimezone(TIMEZONES[this.timezoneSetting.get()]) ?? null),
            time: new TimeDisplay(now),
            eta: new TimeDisplay(null),
            flightTime: new DurationDisplay(this.props.memory.dtPage.flightTimer),
            ete: new DurationDisplay(this.props.memory.navPage.eteToDest),
        });

        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            {this.children.get("dct").render()}{this.children.get("arrow").render()}{this.children.get("ident").render()} {this.children.get("timezone").render()}<br/>
            DEP&nbsp&nbsp&nbsp{this.children.get("depTime").render()}<br/>
            TIME&nbsp&nbsp{this.children.get("time").render()}<br/>
            ETA&nbsp&nbsp&nbsp{this.children.get("eta").render()}<br/>
            FLT&nbsp&nbsp&nbsp{this.children.get("flightTime").render()}<br/>
            ETE&nbsp&nbsp&nbsp{this.children.get("ete").render()}<br/>
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        const futureLegs = this.props.memory.navPage.activeWaypoint.getFutureLegs();
        const destLeg = futureLegs.length > 0 ? futureLegs[futureLegs.length - 1] : null;
        const activeWaypoint = this.props.memory.navPage.activeWaypoint;
        const isDctToDest = activeWaypoint.isDctNavigation() && destLeg !== null && destLeg === activeWaypoint.getActiveLeg();

        const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[this.timezoneSetting.get()]);

        //#298: d› for a Direct To to the destination (photo 0283863.jpg off the plan); the arrow alone while the last leg
        //of FPL 0 is active. The arrow compares plan indices, so a first copy of the destination gets none
        this.children.get("dct").text = isDctToDest ? "d" : " ";
        this.children.get("arrow").fplIdx = this.destinationFplIdx(destLeg);
        this.children.get("ident").text = IcaoFixedLength.getIdentFromFacility(destLeg?.wpt ?? null);
        this.children.get("timezone").value = this.timezoneSetting.get();
        this.children.get("depTime").time = this.props.memory.dtPage.departureTime?.atTimezone(TIMEZONES[this.timezoneSetting.get()]) ?? null;
        this.children.get("time").time = now;
        this.children.get("eta").time = this.props.memory.navPage.eteToDest !== null ? now.addSeconds(this.props.memory.navPage.eteToDest) : null; //#393: 0 is a value
        this.children.get("flightTime").time = this.props.memory.dtPage.flightTimer;
        this.children.get("ete").time = this.props.memory.navPage.eteToDest;
    }

    /**
     * The index of the destination leg in FPL 0, -1 for a Direct To leg outside the plan (as getActiveFplIdx), null
     * without a destination
     */
    private destinationFplIdx(destLeg: KLNFlightplanLeg | null): number | null {
        if (destLeg === null) {
            return null;
        }
        return this.props.memory.navPage.activeWaypoint.fpl0.getLegs().indexOf(destLeg);
    }

    private saveTimezone(tzIndex: number): void {
        this.props.userSettings.getSetting("timezone").set(tzIndex);
    }


}