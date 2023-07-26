import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {Alignment, RoundedDistanceDisplay} from "../../controls/displays/RoundedDistanceDisplay";


type Dt1OtherPageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    activeIdent: TextDisplay,
    activeDis: RoundedDistanceDisplay,
    activeEte: DurationDisplay,
    destIdx: TextDisplay,
    destIdent: TextDisplay,
    destDis: RoundedDistanceDisplay,
    destEte: DurationDisplay,
}

/**
 * 4-11
 * Empty page: https://youtu.be/Q6m7_CVGPCg?t=19
 */
export class Dt1OtherPage extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Dt1OtherPageTypes>;

    readonly name: string = "D/T 1";
    public isVisible = true;
    private readonly lastRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(props: PageProps) {
        super(props);

        const navState = this.props.memory.navPage;

        const to = navState.activeWaypoint.getActiveWpt();
        const activeIdx = navState.activeWaypoint.getActiveFplIdx();


        this.children = new UIElementChildren<Dt1OtherPageTypes>({
            activeArrow: new ActiveArrow(to?.icao ?? null, navState),
            activeIdx: new TextDisplay(activeIdx === -1 ? "  " : (activeIdx + 1).toString().padStart(2, " ")),
            activeIdent: new TextDisplay(IcaoFixedLength.getIdentFromFacility(to)),
            activeDis: new RoundedDistanceDisplay(Alignment.right, navState.distToActive),
            activeEte: new DurationDisplay(navState.eteToActive),
            destIdx: new TextDisplay(""),
            destIdent: new TextDisplay(""),
            destDis: new RoundedDistanceDisplay(Alignment.right, this.props.memory.navPage.distToDest),
            destEte: new DurationDisplay(this.props.memory.navPage.eteToDest),
        });
    }


    public render(): VNode {
        return (<pre>
            &nbsp{this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()} {this.children.get("activeIdent").render()}<br/>
            DIS&nbsp&nbsp{this.children.get("activeDis").render()}nm<br/>
            ETE&nbsp&nbsp&nbsp{this.children.get("activeEte").render()}<br/>
            <span ref={this.lastRef} class="d-none">
                &nbsp&nbsp{this.children.get("destIdx").render()} {this.children.get("destIdent").render()}<br/>
                DIS&nbsp&nbsp{this.children.get("destDis").render()}nm<br/>
                ETE&nbsp&nbsp&nbsp{this.children.get("destEte").render()}
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

        this.children.get("activeArrow").icao = to?.icao ?? null;
        this.children.get("activeIdx").text = activeIdx === -1 ? "  " : (activeIdx + 1).toString().padStart(2, " ");
        this.children.get("activeIdent").text = IcaoFixedLength.getIdentFromFacility(to);
        this.children.get("activeDis").distance = navState.distToActive;
        this.children.get("activeEte").time = navState.eteToActive;

        if (destLeg === null) {
            this.lastRef.instance.classList.add("d-none");
        } else {
            this.children.get("destIdx").text = (legs.indexOf(destLeg) + 1).toString().padStart(2, " ");
            this.children.get("destIdent").text = IcaoFixedLength.getIdentFromFacility(destLeg.wpt);
            this.children.get("destDis").distance = this.props.memory.navPage.distToDest;
            this.children.get("destEte").time = this.props.memory.navPage.eteToDest;
            this.lastRef.instance.classList.remove("d-none");
        }


    }


}