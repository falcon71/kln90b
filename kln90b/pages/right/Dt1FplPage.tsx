import {FSComponent, GeoPoint, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";
import {Flightplan} from "../../data/flightplan/Flightplan";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";


type Dt1FplPageTypes = {
    dis1: RoundedDistanceDisplay,
    dis2: RoundedDistanceDisplay,
    dis3: RoundedDistanceDisplay,
    dis4: RoundedDistanceDisplay,
    dis5: RoundedDistanceDisplay,

    time1: DurationDisplay,
    time2: DurationDisplay,
    time3: DurationDisplay,
    time4: DurationDisplay,
    time5: DurationDisplay,
}

interface DisEte {
    dis: number | null,
    ete: number | null,
}

/**
 * 4-11
 * Empty page: https://youtu.be/Q6m7_CVGPCg?t=19
 */
export class Dt1FplPage extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Dt1FplPageTypes>;

    readonly name: string = "D/T 1";

    public isVisible = true;

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Dt1FplPageTypes>({
            dis1: new RoundedDistanceDisplay(Alignment.left, null),
            time1: new DurationDisplay(null),
            dis2: new RoundedDistanceDisplay(Alignment.left, null),
            time2: new DurationDisplay(null),
            dis3: new RoundedDistanceDisplay(Alignment.left, null),
            time3: new DurationDisplay(null),
            dis4: new RoundedDistanceDisplay(Alignment.left, null),
            time4: new DurationDisplay(null),
            dis5: new RoundedDistanceDisplay(Alignment.left, null),
            time5: new DurationDisplay(null),
        });
    }

    public render(): VNode {
        return (<pre>
            DIS&nbsp&nbsp&nbsp&nbsp&nbspETE<br/>
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

            this.children.get("dis1").distance = this.getDistanceLine(1, fplIndices, data); //we start at 1, because the header is 0
            this.children.get("time1").time = this.getTimeLine(1, fplIndices, data);
            this.children.get("dis2").distance = this.getDistanceLine(2, fplIndices, data);
            this.children.get("time2").time = this.getTimeLine(2, fplIndices, data);
            this.children.get("dis3").distance = this.getDistanceLine(3, fplIndices, data);
            this.children.get("time3").time = this.getTimeLine(3, fplIndices, data);
            this.children.get("dis4").distance = this.getDistanceLine(4, fplIndices, data);
            this.children.get("time4").time = this.getTimeLine(4, fplIndices, data);
            this.children.get("dis5").distance = this.getDistanceLine(5, fplIndices, data);
            this.children.get("time5").time = this.getTimeLine(5, fplIndices, data);

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

    private calculateDisEte(fpl: Flightplan): DisEte[] {
        const legs = fpl.getLegs();
        const disEte: DisEte[] = [];
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
                    distanceTotal += UnitType.GA_RADIAN.convertTo(new GeoPoint(prev.wpt.lat, prev.wpt.lon).distance(next.wpt), UnitType.NMILE);
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
                distanceTotal += UnitType.GA_RADIAN.convertTo(new GeoPoint(prev.wpt.lat, prev.wpt.lon).distance(next.wpt), UnitType.NMILE);
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

    private getTimeLine(row: number, fplIndices: [number, number, number, number, number, number], data: DisEte[]): number | null {
        const legIdx = fplIndices[row];
        if (legIdx === -1) {
            return null;
        }
        return data[legIdx].ete;
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