import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {DistanceDisplay} from "../../controls/displays/DistanceDisplay";
import {BearingDisplay} from "../../controls/displays/BearingDisplay";
import {AltitudeDisplay} from "../../controls/displays/AltitudeDisplay";
import {IcaoFixedLength} from "../../data/navdata/IcaoFixedLength";
import {Feet} from "../../data/Units";
import {ObsDtkElement} from "../../controls/selects/ObsDtkElement";


type Nav3PageTypes = {
    from: TextDisplay,
    activeArrow: ActiveArrow,
    to: TextDisplay,
    dtkLabel: TextDisplay,
    dtk: ObsDtkElement
    track: BearingDisplay
    flyDir: TextDisplay,
    flyDist: DistanceDisplay,
    msa: AltitudeDisplay,
    esa: AltitudeDisplay,
}

/**
 * 3-31
 */
export class Nav3Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Nav3PageTypes>;

    readonly name: string = "NAV 3";

    constructor(props: PageProps) {
        super(props);

        const navState = this.props.memory.navPage;
        const gps = this.props.sensors.in.gps;

        const from = navState.activeWaypoint.getFromWpt();
        const to = navState.activeWaypoint.getActiveWpt();

        this.children = new UIElementChildren<Nav3PageTypes>({
            from: new TextDisplay(IcaoFixedLength.getIdentFromFacility(from)),
            activeArrow: new ActiveArrow(to?.icao ?? null, navState),
            to: new TextDisplay(IcaoFixedLength.getIdentFromFacility(to)),
            dtkLabel: new TextDisplay(this.getDtkLabel()),
            dtk: new ObsDtkElement(this.props.planeSettings, this.props.sensors, navState, this.props.modeController),
            track: new BearingDisplay(),
            flyDir: new TextDisplay(this.formatXTKDirection(navState.xtkToActive)),
            flyDist: new DistanceDisplay(3, navState.xtkToActive ? Math.abs(navState.xtkToActive) : null),
            msa: new AltitudeDisplay(gps.isValid() ? this.props.msa.getMSA(gps.coords) : null),
            esa: new AltitudeDisplay(this.calculateESA()),
        });


        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        return (<pre>
            {this.children.get("from").render()}{this.children.get("activeArrow").render()}{this.children.get("to").render()}<br/>
            {this.children.get("dtkLabel").render()}&nbsp&nbsp&nbsp{this.children.get("dtk").render()}<br/>
            TK&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("track").render()}<br/>
            FLY {this.children.get("flyDir").render()} {this.children.get("flyDist").render()}nm<br/>
            MSA {this.children.get("msa").render()}ft<br/>
            ESA {this.children.get("esa").render()}ft<br/>
        </pre>);
    }

    tick(blink: boolean) {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        const navState = this.props.memory.navPage;
        const gps = this.props.sensors.in.gps;

        const from = navState.activeWaypoint.getFromWpt();
        const to = navState.activeWaypoint.getActiveWpt();

        this.children.get("from").text = IcaoFixedLength.getIdentFromFacility(from);
        this.children.get("activeArrow").icao = to?.icao ?? null;
        this.children.get("to").text = IcaoFixedLength.getIdentFromFacility(to);

        this.children.get("track").bearing = gps.isValid() ? this.props.magvar.trueToMag(gps.getTrackTrueRespectingGroundspeed()) : null;
        this.children.get("flyDir").text = this.formatXTKDirection(navState.xtkToActive);
        this.children.get("flyDist").distance = navState.xtkToActive ? Math.abs(navState.xtkToActive) : null;

        this.children.get("msa").altitude = gps.isValid() ? this.props.msa.getMSA(gps.coords) : null;
        this.children.get("esa").altitude = this.calculateESA();

        this.children.get("dtkLabel").text = this.getDtkLabel();
    }

    private getDtkLabel(): string {
        if (this.props.modeController.isObsModeActive()) {
            return this.canObsBeEntered() ? "OBS:" : "OBS ";
        } else {
            return "DTK ";
        }
    }

    private canObsBeEntered(): boolean {
        return this.props.planeSettings.output.obsTarget !== 0 || this.props.sensors.in.obsMag === null;
    }

    private calculateESA(): Feet | null {
        const activeWpt = this.props.memory.navPage.activeWaypoint.getActiveWpt();
        if (activeWpt === null) {
            return null;
        }

        const esa = this.props.msa.getMSAFromTo(this.props.sensors.in.gps.coords, activeWpt);
        const activeIdx = this.props.memory.navPage.activeWaypoint.getActiveFplIdx();
        if (activeIdx === -1 || esa === null || this.props.modeController.isObsModeActive()) {
            return esa;
        }

        const esaAlongRoute = this.props.msa.getMSAForRoute(this.props.memory.navPage.activeWaypoint.getFutureLegs().map(l => l.wpt));
        return esaAlongRoute ? Math.max(esa, esaAlongRoute) : null;
    }

    private formatXTKDirection(xtk: number | null): string {
        if (xtk === null) {
            return "-"
        } else {
            return xtk >= 0 ? "L" : "R";
        }
    }

}