import {FSComponent, ICAO, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {DeviationBar} from "../../controls/displays/DeviationBar";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {DistanceDisplay} from "../../controls/displays/DistanceDisplay";
import {SpeedDisplay} from "../../controls/displays/SpeedDisplay";
import {DurationDisplay} from "../../controls/displays/DurationDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {SixLinePage} from "../FourSegmentPage";
import {SuperDeviationBar} from "../../controls/displays/SuperDeviationBar";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {SidStar} from "../../data/navdata/SidStar";


type SuperNav1PageTypes = {
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
export class SuperNav1Page extends SixLinePage {

    public readonly lCursorController = NO_CURSOR_CONTROLLER;
    public readonly rCursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<SuperNav1PageTypes>;

    readonly name: string = "NAV 1";

    constructor(props: PageProps) {
        super(props);

        const navState = this.props.memory.navPage;

        const from = navState.activeWaypoint.getFromWpt();
        const to = navState.activeWaypoint.getActiveWpt();

        this.children = new UIElementChildren<SuperNav1PageTypes>({
            from: new TextDisplay(IcaoFixedLength.getIdentFromFacility(from)),
            activeArrow: new ActiveArrow(to?.icao ?? null, navState),
            to: new TextDisplay(this.getIdent()),
            cdi: new SuperDeviationBar(navState.xtkToActive, navState.toFrom, navState.xtkScale),
            dist: new DistanceDisplay(4, navState.distToActive),
            speed: new SpeedDisplay(this.props.sensors.in.gps.isValid() ? this.props.sensors.in.gps.groundspeed : null),
            ete: new DurationDisplay(navState.eteToActive),
            brg: new BearingDisplay(),
        });
    }

    public render(): VNode {
        return (<pre>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("from").render()}{this.children.get("activeArrow").render()}{this.children.get("to").render()}<br/>
            {this.children.get("cdi").render()}<br/>
            DIS&nbsp&nbsp{this.children.get("dist").render()}nm&nbsp&nbsp&nbspETE&nbsp{this.children.get("ete").render()}<br/>
            GS&nbsp&nbsp&nbsp&nbsp{this.children.get("speed").render()}kt&nbsp&nbsp&nbspBRG&nbsp&nbsp{this.children.get("brg").render()}
        </pre>);
    }

    tick(blink: boolean) {
        super.tick(blink);
        const navState = this.props.memory.navPage;

        const from = navState.activeWaypoint.getFromWpt();
        const to = navState.activeWaypoint.getActiveWpt();

        this.children.get("from").text = IcaoFixedLength.getIdentFromFacility(from);
        this.children.get("activeArrow").icao = to?.icao ?? null;
        this.children.get("to").text = this.getIdent();

        this.children.get("cdi").xtkScale = navState.xtkScale;
        this.children.get("cdi").deviation = navState.xtkToActive;
        this.children.get("cdi").to = navState.toFrom;
        this.children.get("dist").distance = navState.distToActive;
        this.children.get("speed").speed = this.props.sensors.in.gps.isValid() ? this.props.sensors.in.gps.groundspeed : null;
        this.children.get("ete").time = navState.eteToActive;
        this.children.get("brg").bearing = this.props.magvar.trueToMag(navState.bearingToActive);
    }

    private getIdent(): string {
        const leg = this.props.memory.navPage.activeWaypoint.getActiveLeg();
        if (leg === null) {
            return "";
        }
        return ICAO.getIdent(leg.wpt.icao) + SidStar.getWptSuffix(leg.fixType);
    }

}