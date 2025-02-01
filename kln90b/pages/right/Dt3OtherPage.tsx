import {Facility, FSComponent, GeoPoint, NodeReference, UnitType, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {NauticalMiles} from "../../data/Units";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";


type Dt3OtherPageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    activeIdent: TextDisplay,
    activeDis: RoundedDistanceDisplay,
    activeDtk: BearingDisplay,
    followingIdx: TextDisplay,
    followingIdent: TextDisplay,
    followingDis: RoundedDistanceDisplay,
    followingDtk: BearingDisplay,
}

/**
 * 4-12
 */
export class Dt3OtherPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Dt3OtherPageTypes>;

    readonly name: string = "D/T 3";

    private readonly lastRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(props: PageProps) {
        super(props);

        const navState = this.props.memory.navPage;

        const to = navState.activeWaypoint.getActiveWpt();
        const activeIdx = navState.activeWaypoint.getActiveFplIdx();

        const legs = this.props.memory.fplPage.flightplans[0].getLegs();
        const followingIdx = activeIdx !== -1 && activeIdx + 1 < legs.length ? activeIdx + 1 : -1;
        const following = followingIdx > -1 ? legs[followingIdx].wpt : null;

        this.children = new UIElementChildren<Dt3OtherPageTypes>({
            activeArrow: new ActiveArrow(to?.icaoStruct ?? null, navState),
            activeIdx: new TextDisplay(activeIdx === -1 ? "  " : (activeIdx + 1).toString().padStart(2, " ")),
            activeIdent: new TextDisplay(IcaoFixedLength.getIdentFromFacility(to)),
            activeDis: new RoundedDistanceDisplay(Alignment.right, navState.distToActive),
            activeDtk: new BearingDisplay(),
            followingIdx: new TextDisplay((followingIdx + 1).toString().padStart(2, " ")),
            followingIdent: new TextDisplay(IcaoFixedLength.getIdentFromFacility(following)),
            followingDis: new RoundedDistanceDisplay(Alignment.right, this.calcDistToFollowing(following)),
            followingDtk: new BearingDisplay(),
        });

        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<pre>
            &nbsp{this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()} {this.children.get("activeIdent").render()}<br/>
            DIS&nbsp&nbsp{this.children.get("activeDis").render()}nm<br/>
            DTK&nbsp&nbsp&nbsp&nbsp{this.children.get("activeDtk").render()}<br/>
            <span ref={this.lastRef} class="d-none">
                &nbsp&nbsp{this.children.get("followingIdx").render()} {this.children.get("followingIdent").render()}<br/>
                DIS&nbsp&nbsp{this.children.get("followingDis").render()}nm<br/>
                DTK&nbsp&nbsp&nbsp&nbsp{this.children.get("followingDtk").render()}<br/>
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
        const followingIdx = activeIdx !== -1 && activeIdx + 1 < legs.length ? activeIdx + 1 : -1;
        const following = followingIdx > -1 ? legs[followingIdx].wpt : null;

        this.children.get("activeArrow").icao = to?.icaoStruct ?? null;
        this.children.get("activeIdx").text = activeIdx === -1 ? "  " : (activeIdx + 1).toString().padStart(2, " ");
        this.children.get("activeIdent").text = IcaoFixedLength.getIdentFromFacility(to);
        this.children.get("activeDis").distance = navState.distToActive;
        this.children.get("activeDtk").bearing = this.props.magvar.trueToMag(navState.bearingToActive);

        if (followingIdx === -1) {
            this.lastRef.instance.classList.add("d-none");
        } else {
            this.children.get("followingIdx").text = (followingIdx + 1).toString().padStart(2, " ");
            this.children.get("followingIdent").text = IcaoFixedLength.getIdentFromFacility(following);
            this.children.get("followingDis").distance = this.calcDistToFollowing(following);
            this.children.get("followingDtk").bearing = this.calcDtkToFollowing(following);
            this.lastRef.instance.classList.remove("d-none");
        }


    }

    private calcDistToFollowing(following: Facility | null): NauticalMiles | null {
        const navState = this.props.memory.navPage;
        if (following === null) {
            return null;
        }

        const active = navState.activeWaypoint.getActiveWpt()!;

        return navState.distToActive! + UnitType.GA_RADIAN.convertTo(new GeoPoint(active.lat, active.lon).distance(following), UnitType.NMILE);
    }

    private calcDtkToFollowing(following: Facility | null): NauticalMiles | null {
        const navState = this.props.memory.navPage;
        if (following === null) {
            return null;
        }

        const active = navState.activeWaypoint.getActiveWpt()!;
        const activePoint = new GeoPoint(active.lat, active.lon);
        const magvar = this.props.magvar.getMagvarForCoordinates(active);
        if (activePoint.equals(following)) {
            return this.props.magvar.trueToMag(navState.desiredTrack, magvar); //The KLN 89 trainer displays the same DTK
        } else {
            const dtkTrue = activePoint.bearingTo(following);
            return this.props.magvar.trueToMag(dtkTrue, magvar);
        }

    }

}