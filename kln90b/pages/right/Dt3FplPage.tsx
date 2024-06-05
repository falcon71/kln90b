import {FSComponent, GeoPoint, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";
import {Flightplan} from "../../data/flightplan/Flightplan";
import {Degrees} from "../../data/Units";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";


type Dt3FplPageTypes = {
    dis1: RoundedDistanceDisplay,
    dis2: RoundedDistanceDisplay,
    dis3: RoundedDistanceDisplay,
    dis4: RoundedDistanceDisplay,
    dis5: RoundedDistanceDisplay,

    dtk1: BearingDisplay,
    dtk2: BearingDisplay,
    dtk3: BearingDisplay,
    dtk4: BearingDisplay,
    dtk5: BearingDisplay,
}

interface DisDtk {
    dis: number | null,
    dtkMag: number | null,
}

/**
 * 4-12
 */
export class Dt3FplPage extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Dt3FplPageTypes>;

    readonly name: string = "D/T 3";

    public isVisible = true;

    constructor(props: PageProps) {
        super(props);

        this.children = new UIElementChildren<Dt3FplPageTypes>({
            dis1: new RoundedDistanceDisplay(Alignment.left, null),
            dtk1: new BearingDisplay(),
            dis2: new RoundedDistanceDisplay(Alignment.left, null),
            dtk2: new BearingDisplay(),
            dis3: new RoundedDistanceDisplay(Alignment.left, null),
            dtk3: new BearingDisplay(),
            dis4: new RoundedDistanceDisplay(Alignment.left, null),
            dtk4: new BearingDisplay(),
            dis5: new RoundedDistanceDisplay(Alignment.left, null),
            dtk5: new BearingDisplay(),
        });
    }

    public render(): VNode {
        return (<pre>
            DIS&nbsp&nbsp&nbsp&nbsp&nbspDTK<br/>
            {this.children.get("dis1").render()}&nbsp&nbsp&nbsp{this.children.get("dtk1").render()}<br/>
            {this.children.get("dis2").render()}&nbsp&nbsp&nbsp{this.children.get("dtk2").render()}<br/>
            {this.children.get("dis3").render()}&nbsp&nbsp&nbsp{this.children.get("dtk3").render()}<br/>
            {this.children.get("dis4").render()}&nbsp&nbsp&nbsp{this.children.get("dtk4").render()}<br/>
            {this.children.get("dis5").render()}&nbsp&nbsp&nbsp{this.children.get("dtk5").render()}<br/>
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
            this.children.get("dtk1").bearing = this.getDtkLine(1, fplIndices, data);
            this.children.get("dis2").distance = this.getDistanceLine(2, fplIndices, data);
            this.children.get("dtk2").bearing = this.getDtkLine(2, fplIndices, data);
            this.children.get("dis3").distance = this.getDistanceLine(3, fplIndices, data);
            this.children.get("dtk3").bearing = this.getDtkLine(3, fplIndices, data);
            this.children.get("dis4").distance = this.getDistanceLine(4, fplIndices, data);
            this.children.get("dtk4").bearing = this.getDtkLine(4, fplIndices, data);
            this.children.get("dis5").distance = this.getDistanceLine(5, fplIndices, data);
            this.children.get("dtk5").bearing = this.getDtkLine(5, fplIndices, data);

            this.children.get("dis1").isVisible = this.shouldDistanceBeVisible(fplIndex, 1, actIdx, fplIndices);
            this.children.get("dtk1").isVisible = this.shouldDtkBeVisible(fplIndex, 1, actIdx, fplIndices);
            this.children.get("dis2").isVisible = this.shouldDistanceBeVisible(fplIndex, 2, actIdx, fplIndices);
            this.children.get("dtk2").isVisible = this.shouldDtkBeVisible(fplIndex, 2, actIdx, fplIndices);
            this.children.get("dis3").isVisible = this.shouldDistanceBeVisible(fplIndex, 3, actIdx, fplIndices);
            this.children.get("dtk3").isVisible = this.shouldDtkBeVisible(fplIndex, 3, actIdx, fplIndices);
            this.children.get("dis4").isVisible = this.shouldDistanceBeVisible(fplIndex, 4, actIdx, fplIndices);
            this.children.get("dtk4").isVisible = this.shouldDtkBeVisible(fplIndex, 4, actIdx, fplIndices);
            this.children.get("dis5").isVisible = this.shouldDistanceBeVisible(fplIndex, 5, actIdx, fplIndices);
            this.children.get("dtk5").isVisible = this.shouldDtkBeVisible(fplIndex, 5, actIdx, fplIndices);


        }
    }
    private calculateDisEte(fpl: Flightplan): DisDtk[] {
        const legs = fpl.getLegs();
        const disDtk: DisDtk[] = [];
        const CACHED_POINT = new GeoPoint(0, 0);
        if (fpl.idx === 0) {
            const navState = this.props.memory.navPage;
            const actIdx = navState.activeWaypoint.getActiveFplIdx();
            let distanceTotal = 0;
            for (let i = 0; i < legs.length; i++) {
                if (actIdx > i || actIdx === -1) {
                    disDtk.push({dis: null, dtkMag: null});
                } else if (actIdx === i) {
                    distanceTotal += navState.distToActive!;
                    disDtk.push({dis: distanceTotal, dtkMag: this.props.magvar.trueToMag(navState.bearingToActive)});
                } else {
                    const prev = legs[i - 1];
                    const next = legs[i];
                    CACHED_POINT.set(prev.wpt.lat, prev.wpt.lon);
                    if (CACHED_POINT.equals(next.wpt)) {
                        disDtk.push(disDtk[disDtk.length - 1]); //The KLN 89 trainer displays the same DTK
                    } else {
                        distanceTotal += UnitType.GA_RADIAN.convertTo(CACHED_POINT.distance(next.wpt), UnitType.NMILE);
                        const dtkTrue = CACHED_POINT.bearingTo(next.wpt);
                        const magvar = this.props.magvar.getMagvarForCoordinates(prev.wpt);
                        disDtk.push({dis: distanceTotal, dtkMag: this.props.magvar.trueToMag(dtkTrue, magvar)});
                    }

                }
            }

        } else {
            let distanceTotal = 0;
            disDtk.push({dis: null, dtkMag: null});
            for (let i = 1; i < legs.length; i++) {
                const prev = legs[i - 1];
                const next = legs[i];
                CACHED_POINT.set(prev.wpt.lat, prev.wpt.lon);
                if (CACHED_POINT.equals(next.wpt)) {
                    disDtk.push(disDtk[disDtk.length - 1]); //The KLN 89 trainer displays the same DTK
                } else {
                    distanceTotal += UnitType.GA_RADIAN.convertTo(CACHED_POINT.distance(next.wpt), UnitType.NMILE);
                    const dtkTrue = CACHED_POINT.bearingTo(next.wpt);
                    const magvar = this.props.magvar.getMagvarForCoordinates(prev.wpt);
                    disDtk.push({dis: distanceTotal, dtkMag: this.props.magvar.trueToMag(dtkTrue, magvar)});
                }
            }
        }
        return disDtk;
    }

    private getDistanceLine(row: number, fplIndices: [number, number, number, number, number, number], data: DisDtk[]): number | null {
        const legIdx = fplIndices[row];
        if (legIdx === -1) {
            return null;
        }
        return data[legIdx].dis;
    }

    private getDtkLine(row: number, fplIndices: [number, number, number, number, number, number], data: DisDtk[]): Degrees | null {
        const legIdx = fplIndices[row];
        if (legIdx === -1) {
            return null;
        }
        return data[legIdx].dtkMag;
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

    private shouldDtkBeVisible(fplIdx: number, row: number, actIdx: number, fplIndices: [number, number, number, number, number, number]): boolean {
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

}