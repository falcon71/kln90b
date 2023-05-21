import {FSComponent, NodeReference, UserSetting, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {TimeDisplay} from "../../controls/displays/TimeDisplay";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {NauticalMiles, Seconds} from "../../data/Units";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";
import {SelectField} from "../../controls/selects/SelectField";
import {TIMEZONES} from "../../data/Time";
import {calcDistToDestination} from "../../services/FlightplanUtils";


type Dt2OtherPageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    activeIdent: TextDisplay,
    activeDis: RoundedDistanceDisplay,
    activeEta: TimeDisplay,
    timezone: SelectField;
    destIdx: TextDisplay,
    destIdent: TextDisplay,
    destDis: RoundedDistanceDisplay,
    destEta: TimeDisplay,
    destTimezone: TextDisplay;
}

/**
 * 4-12
 */
export class Dt2OtherPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Dt2OtherPageTypes>;

    readonly name: string = "D/T 2";

    private readonly lastRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    private timezoneSetting: UserSetting<number>;

    constructor(props: PageProps) {
        super(props);

        this.timezoneSetting = this.props.userSettings.getSetting("timezone");

        const navState = this.props.memory.navPage;

        const to = navState.activeWaypoint.getActiveWpt();
        const activeIdx = navState.activeWaypoint.getActiveFplIdx();

        const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[this.timezoneSetting.get()]);


        this.children = new UIElementChildren<Dt2OtherPageTypes>({
            activeArrow: new ActiveArrow(to?.icao ?? null, navState),
            activeIdx: new TextDisplay(activeIdx === -1 ? "  " : (activeIdx + 1).toString().padStart(2, " ")),
            activeIdent: new TextDisplay(IcaoFixedLength.getIdentFromFacility(to)),
            activeDis: new RoundedDistanceDisplay(Alignment.right, navState.distToActive),
            activeEta: new TimeDisplay(navState.eteToActive ? now.addSeconds(navState.eteToActive) : null),
            timezone: new SelectField(TIMEZONES.map(t => t.code), this.timezoneSetting.get(), this.saveTimezone.bind(this)),
            destIdx: new TextDisplay(""),
            destIdent: new TextDisplay(""),
            destDis: new RoundedDistanceDisplay(Alignment.right, null),
            destEta: new TimeDisplay(null),
            destTimezone: new TextDisplay(TIMEZONES[this.timezoneSetting.get()].code),
        });

        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            &nbsp{this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()} {this.children.get("activeIdent").render()}<br/>
            DIS&nbsp&nbsp{this.children.get("activeDis").render()}nm<br/>
            &nbsp&nbsp&nbsp{this.children.get("activeEta").render()}{this.children.get("timezone").render()}<br/>
            <span ref={this.lastRef} class="d-none">
                &nbsp&nbsp{this.children.get("destIdx").render()} {this.children.get("destIdent").render()}<br/>
                DIS&nbsp&nbsp{this.children.get("destDis").render()}nm<br/>
                &nbsp&nbsp&nbsp{this.children.get("destEta").render()}{this.children.get("destTimezone").render()}
            </span>
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        const navState = this.props.memory.navPage;

        const to = navState.activeWaypoint.getActiveWpt();
        const activeIdx = navState.activeWaypoint.getActiveFplIdx();

        const legs = this.props.memory.fplPage.flightplans[0].getLegs();
        const futureLegs = this.props.memory.navPage.activeWaypoint.getFutureLegs();
        const destLeg = futureLegs.length > 1 ? futureLegs[futureLegs.length - 1] : null;

        const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[this.timezoneSetting.get()]);

        this.children.get("timezone").value = this.timezoneSetting.get();

        this.children.get("activeArrow").icao = to?.icao ?? null;
        this.children.get("activeIdx").text = activeIdx === -1 ? "  " : (activeIdx + 1).toString().padStart(2, " ");
        this.children.get("activeIdent").text = IcaoFixedLength.getIdentFromFacility(to);
        this.children.get("activeDis").distance = navState.distToActive;
        this.children.get("activeEta").time = navState.eteToActive ? now.addSeconds(navState.eteToActive) : null;

        if (destLeg === null) {
            this.lastRef.instance.classList.add("d-none");
        } else {
            const destDis = calcDistToDestination(this.props.memory.navPage, futureLegs);
            const destEte = this.calcEte(destDis);
            this.children.get("destIdx").text = (legs.indexOf(destLeg) + 1).toString().padStart(2, " ");
            this.children.get("destIdent").text = IcaoFixedLength.getIdentFromFacility(destLeg.wpt);
            this.children.get("destDis").distance = destDis;
            this.children.get("destEta").time = destEte ? now.addSeconds(destEte) : null;
            this.children.get("destTimezone").text = TIMEZONES[this.timezoneSetting.get()].code;
            this.lastRef.instance.classList.remove("d-none");
        }


    }

    private saveTimezone(tzIndex: number): void {
        this.props.userSettings.getSetting("timezone").set(tzIndex);
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

}