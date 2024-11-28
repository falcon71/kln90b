import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {DeviationBar} from "../../controls/displays/DeviationBar";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {DistanceDisplay} from "../../controls/displays/DistanceDisplay";
import {SpeedDisplay} from "../../controls/displays/SpeedDisplay";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";


type Nav1PageTypes = {
    from: TextDisplay,
    activeArrow: ActiveArrow,
    to: TextDisplay,

    cdi: DeviationBar
    dist: DistanceDisplay,
    speed: SpeedDisplay,

    ete: DurationDisplay,

    brg: BearingDisplay,
}

/**
 * 3-31
 */
export class Nav1Page extends SixLineHalfPage {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Nav1PageTypes>;

    readonly name: string = "NAV 1";

    constructor(props: PageProps) {
        super(props);

        const navState = this.props.memory.navPage;

        const from = navState.activeWaypoint.getFromWpt();
        const to = navState.activeWaypoint.getActiveWpt();

        this.children = new UIElementChildren<Nav1PageTypes>({
            from: new TextDisplay(IcaoFixedLength.getIdentFromFacility(from)),
            activeArrow: new ActiveArrow(to?.icaoStruct ?? null, navState),
            to: new TextDisplay(IcaoFixedLength.getIdentFromFacility(to)),
            cdi: new DeviationBar(navState.xtkToActive, navState.toFrom, navState.xtkScale),
            dist: new DistanceDisplay(4, navState.distToActive),
            speed: new SpeedDisplay(this.props.sensors.in.gps.isValid() ? this.props.sensors.in.gps.groundspeed : null),
            ete: new DurationDisplay(navState.eteToActive),
            brg: new BearingDisplay(),
        });
    }


    public render(): VNode {
        return (<pre>
            {this.children.get("from").render()}{this.children.get("activeArrow").render()}{this.children.get("to").render()}<br/>
            {this.children.get("cdi").render()}<br/>
            DIS&nbsp&nbsp{this.children.get("dist").render()}nm<br/>
            GS&nbsp&nbsp&nbsp&nbsp{this.children.get("speed").render()}kt<br/>
            ETE&nbsp&nbsp&nbsp{this.children.get("ete").render()}<br/>
            BRG&nbsp&nbsp&nbsp&nbsp{this.children.get("brg").render()}<br/>
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        const navState = this.props.memory.navPage;

        const from = navState.activeWaypoint.getFromWpt();
        const to = navState.activeWaypoint.getActiveWpt();

        this.children.get("from").text = IcaoFixedLength.getIdentFromFacility(from);
        this.children.get("activeArrow").icao = to?.icaoStruct ?? null;
        this.children.get("to").text = IcaoFixedLength.getIdentFromFacility(to);

        this.children.get("cdi").xtkScale = navState.xtkScale;
        this.children.get("cdi").deviation = navState.xtkToActive;
        this.children.get("cdi").to = navState.toFrom;
        this.children.get("dist").distance = navState.distToActive;
        this.children.get("speed").speed = this.props.sensors.in.gps.isValid() ? this.props.sensors.in.gps.groundspeed : null;
        this.children.get("ete").time = navState.eteToActive;
        this.children.get("brg").bearing = this.props.magvar.trueToMag(navState.bearingToActive);

    }

}