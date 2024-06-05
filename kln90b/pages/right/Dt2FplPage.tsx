import {FSComponent, GeoPoint, UnitType, UserSetting, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";
import {TimeDisplay} from "../../controls/displays/TimeDisplay";
import {Flightplan} from "../../data/flightplan/Flightplan";
import {TimeStamp, TIMEZONES} from "../../data/Time";
import {SelectField} from "../../controls/selects/SelectField";


type Dt2FplPageTypes = {
    timezone: SelectField;

    dis1: RoundedDistanceDisplay,
    dis2: RoundedDistanceDisplay,
    dis3: RoundedDistanceDisplay,
    dis4: RoundedDistanceDisplay,
    dis5: RoundedDistanceDisplay,

    time1: TimeDisplay,
    time2: TimeDisplay,
    time3: TimeDisplay,
    time4: TimeDisplay,
    time5: TimeDisplay,
}

interface DisEte {
    dis: number | null,
    ete: number | null,
}

/**
 * 4-12
 */
export class Dt2FplPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Dt2FplPageTypes>;

    readonly name: string = "D/T 2";

    public isVisible = true;

    private timezoneSetting: UserSetting<number>;

    constructor(props: PageProps) {
        super(props);

        this.timezoneSetting = this.props.userSettings.getSetting("timezone");

        this.children = new UIElementChildren<Dt2FplPageTypes>({
            timezone: new SelectField(TIMEZONES.map(t => t.code), this.props.userSettings.getSetting("timezone").get(), this.saveTimezone.bind(this)),
            dis1: new RoundedDistanceDisplay(Alignment.left, null),
            time1: new TimeDisplay(null),
            dis2: new RoundedDistanceDisplay(Alignment.left, null),
            time2: new TimeDisplay(null),
            dis3: new RoundedDistanceDisplay(Alignment.left, null),
            time3: new TimeDisplay(null),
            dis4: new RoundedDistanceDisplay(Alignment.left, null),
            time4: new TimeDisplay(null),
            dis5: new RoundedDistanceDisplay(Alignment.left, null),
            time5: new TimeDisplay(null),
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            DIS&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("timezone").render()}<br/>
            {this.children.get("dis1").render()}&nbsp&nbsp{this.children.get("time1").render()}<br/>
            {this.children.get("dis2").render()}&nbsp&nbsp{this.children.get("time2").render()}<br/>
            {this.children.get("dis3").render()}&nbsp&nbsp{this.children.get("time3").render()}<br/>
            {this.children.get("dis4").render()}&nbsp&nbsp{this.children.get("time4").render()}<br/>
            {this.children.get("dis5").render()}&nbsp&nbsp{this.children.get("time5").render()}<br/>
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        const page = mainPage.getLeftPage();


        if (page instanceof FplPage) {
            const fplIndex = page.fplIdx;
            const fplIndices = page.getVisibleLegsIndices();
            const actIdx = this.props.memory.navPage.activeWaypoint.getActiveFplIdx();

            const fpl = this.props.memory.fplPage.flightplans[fplIndex];
            const data = this.calculateDisEte(fpl);

            const now = this.props.sensors.in.gps.timeZulu.atTimezone(TIMEZONES[this.timezoneSetting.get()]);

            this.children.get("timezone").value = this.timezoneSetting.get();

            this.children.get("dis1").distance = this.getDistanceLine(1, fplIndices, data); //we start at 1, because the header is 0
            this.children.get("time1").time = this.getTimeLine(1, fplIndices, data, now);
            this.children.get("dis2").distance = this.getDistanceLine(2, fplIndices, data);
            this.children.get("time2").time = this.getTimeLine(2, fplIndices, data, now);
            this.children.get("dis3").distance = this.getDistanceLine(3, fplIndices, data);
            this.children.get("time3").time = this.getTimeLine(3, fplIndices, data, now);
            this.children.get("dis4").distance = this.getDistanceLine(4, fplIndices, data);
            this.children.get("time4").time = this.getTimeLine(4, fplIndices, data, now);
            this.children.get("dis5").distance = this.getDistanceLine(5, fplIndices, data);
            this.children.get("time5").time = this.getTimeLine(5, fplIndices, data, now);

            this.children.get("dis1").isVisible = this.shouldDistanceBeVisible(fplIndex, 1, actIdx, fplIndices);
            this.children.get("time1").isVisible = this.shouldTimeBeVisible(fplIndex, 1, actIdx, fplIndices);
            this.children.get("dis2").isVisible = this.shouldDistanceBeVisible(fplIndex, 2, actIdx, fplIndices);
            this.children.get("time2").isVisible = this.shouldTimeBeVisible(fplIndex, 2, actIdx, fplIndices);
            this.children.get("dis3").isVisible = this.shouldDistanceBeVisible(fplIndex, 3, actIdx, fplIndices);
            this.children.get("time3").isVisible = this.shouldTimeBeVisible(fplIndex, 3, actIdx, fplIndices);
            this.children.get("dis4").isVisible = this.shouldDistanceBeVisible(fplIndex, 4, actIdx, fplIndices);
            this.children.get("time4").isVisible = this.shouldTimeBeVisible(fplIndex, 4, actIdx, fplIndices);
            this.children.get("dis5").isVisible = this.shouldDistanceBeVisible(fplIndex, 5, actIdx, fplIndices);
            this.children.get("time5").isVisible = this.shouldTimeBeVisible(fplIndex, 5, actIdx, fplIndices);


        }
    }

    private saveTimezone(tzIndex: number): void {
        this.props.userSettings.getSetting("timezone").set(tzIndex);
    }

    private calculateDisEte(fpl: Flightplan): DisEte[] {
        const legs = fpl.getLegs();
        const disEte: DisEte[] = [];
        const CACHED_POINT = new GeoPoint(0, 0);
        if (fpl.idx === 0) {
            const navState = this.props.memory.navPage;
            const actIdx = navState.activeWaypoint.getActiveFplIdx();
            let distanceTotal = 0;
            const eteAvail = this.props.sensors.in.gps.groundspeed > 2;
            for (let i = 0; i < legs.length; i++) {
                if (actIdx > i || actIdx === -1) {
                    disEte.push({dis: null, ete: null});
                } else if (actIdx === i) {
                    distanceTotal += navState.distToActive!;
                    disEte.push({dis: distanceTotal, ete: navState.eteToActive});
                } else {
                    const prev = legs[i - 1];
                    const next = legs[i];
                    CACHED_POINT.set(prev.wpt.lat, prev.wpt.lon);
                    distanceTotal += UnitType.GA_RADIAN.convertTo(CACHED_POINT.distance(next.wpt), UnitType.NMILE);
                    disEte.push({
                        dis: distanceTotal,
                        ete: eteAvail ? distanceTotal / this.props.sensors.in.gps.groundspeed * 60 * 60 : null,
                    });
                }
            }

        } else {
            let distanceTotal = 0;
            disEte.push({dis: null, ete: null});
            for (let i = 1; i < legs.length; i++) {
                const prev = legs[i - 1];
                const next = legs[i];
                CACHED_POINT.set(prev.wpt.lat, prev.wpt.lon);
                distanceTotal += UnitType.GA_RADIAN.convertTo(CACHED_POINT.distance(next.wpt), UnitType.NMILE);
                disEte.push({dis: distanceTotal, ete: null})
            }
        }
        return disEte;
    }

    private getDistanceLine(row: number, fplIndices: [number, number, number, number, number, number], data: DisEte[]): number | null {
        const legIdx = fplIndices[row];
        if (legIdx === -1) {
            return null;
        }
        return data[legIdx].dis;
    }

    private getTimeLine(row: number, fplIndices: [number, number, number, number, number, number], data: DisEte[], now: TimeStamp): TimeStamp | null {
        const legIdx = fplIndices[row];
        if (legIdx === -1) {
            return null;
        }
        const ete = data[legIdx].ete;
        return ete ? now.addSeconds(ete) : null;
    }

    private shouldDistanceBeVisible(fplIdx: number, row: number, actIdx: number, fplIndices: [number, number, number, number, number, number]): boolean {
        const legIdx = fplIndices[row];
        if (legIdx === -1) {
            return false;
        }
        if (fplIdx === 0) {
            return legIdx >= actIdx;
        } else {
            return legIdx > 0;
        }
    }

    private shouldTimeBeVisible(fplIdx: number, row: number, actIdx: number, fplIndices: [number, number, number, number, number, number]): boolean {
        if (fplIdx !== 0) {
            return false;
        }

        const legIdx = fplIndices[row];
        if (legIdx === -1) {
            return false;
        }

        return legIdx >= actIdx;

    }

}