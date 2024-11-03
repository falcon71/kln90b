import {FSComponent, GeoPoint, UnitType, UserSetting, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Canvas, CoordinateCanvasDrawContext} from "../../controls/Canvas";
import {SelectField} from "../../controls/selects/SelectField";
import {MainPage} from "../MainPage";
import {unpackFacility, WaypointPage} from "../right/WaypointPage";
import {MapOrientationSelector} from "../../controls/selects/MapOrientationSelector";
import {Nav5Orientation} from "../../settings/KLN90BUserSettings";
import {KLNFixType, LegDefinition} from "../../data/flightplan/FlightPlan";
import {ActiveWaypoint} from "../../data/flightplan/ActiveWaypoint";
import {NauticalMiles} from "../../data/Units";

type Nav5PageTypes = {
    canvas: Canvas,
    orientation: MapOrientationSelector,
    range: SelectField,
}

const RANGES = ["   1", "   2", "   3", "   5", "  10", "  15", "  20", "  25", "  30", "  40", "  60", "  80", " 100", " 120", " 160", " 240", " 320", " 480", "1000"]; //I have no idea, which ranges the device supports

export class Nav5Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Nav5PageTypes>;

    readonly name: string = "NAV 5";
    private rangeSetting: UserSetting<number>;
    private readonly orientationSetting: UserSetting<Nav5Orientation>;

    constructor(props: PageProps) {
        super(props);

        this.rangeSetting = this.props.userSettings.getSetting("nav5MapRange");
        this.orientationSetting = this.props.userSettings.getSetting("nav5MapOrientation");

        this.children = new UIElementChildren<Nav5PageTypes>({
            canvas: new Canvas(),
            orientation: MapOrientationSelector.build(this.props.planeSettings, this.orientationSetting, this.props.sensors, this.props.modeController, this.props.magvar),
            range: new SelectField(RANGES, RANGES.indexOf(this.rangeSetting.get().toString().padStart(4, " ")), this.saveRange.bind(this)),
        });


        this.cursorController = new CursorController(this.children);
    }


    public render(): VNode {
        return (<div>
            {this.children.get("canvas").render()}
            <pre
                class="nav-5-bottom-controls">{this.children.get("orientation").render()}&nbsp&nbsp&nbsp{this.children.get("range").render()}</pre>
        </div>);
    }

    public tick(blink: boolean): void {
        this.requiresRedraw = true;
        super.tick(blink);
    }

    protected redraw() {
        if (!this.props.sensors.in.gps.isValid()) {
            this.children.get("canvas").clear();
            return;
        }

        let ctx: CoordinateCanvasDrawContext;
        switch (this.orientationSetting.get()) {
            case Nav5Orientation.NORTH_UP:
                ctx = this.children.get("canvas").getDrawingContextWithCenterRange(this.props.sensors.in.gps.coords, this.rangeSetting.get());
                break;
            case Nav5Orientation.DTK_UP:
                const dtk = this.props.modeController.getDtkOrObsTrue();
                ctx = this.children.get("canvas").getDrawingContextWithOffsetCenterRangeRotation(this.props.sensors.in.gps.coords, this.rangeSetting.get(), dtk ?? 0);
                break;
            case Nav5Orientation.TK_UP:
                const tk = this.props.sensors.in.gps.getTrackTrueRespectingGroundspeed();
                if (tk === null) {
                    this.children.get("canvas").clear();
                    return;
                }
                ctx = this.children.get("canvas").getDrawingContextWithOffsetCenterRangeRotation(this.props.sensors.in.gps.coords, this.rangeSetting.get(), tk);
                break;
            case Nav5Orientation.HDG_UP:
                const hdg = this.props.magvar.magToTrue(this.props.sensors.in.headingGyro ?? 0);
                ctx = this.children.get("canvas").getDrawingContextWithOffsetCenterRangeRotation(this.props.sensors.in.gps.coords, this.rangeSetting.get(), hdg);
                break;
            default:
                throw new Error("orientation not implemented");
        }


        this.drawWaypointPageIcon(ctx);


        const activeWaypoint = this.props.memory.navPage.activeWaypoint;

        const legs = this.props.memory.fplPage.flightplans[0].getLegs();

        if (activeWaypoint.getActiveFplIdx() !== -1 && !this.props.modeController.isObsModeActive()) {
            this.drawFlightplan(ctx, legs, activeWaypoint);
        }

        if (this.props.modeController.isObsModeActive() && activeWaypoint.getActiveWpt() !== null) {
            this.drawObs(ctx, activeWaypoint, this.rangeSetting.get());
        } else if (activeWaypoint.isDctNavigation()) {
            this.drawDirectTo(ctx, activeWaypoint);
        }


        this.drawFlightplanLabels(ctx, legs);

        this.drawPlaneIcon(ctx);

        ctx.fill();
    }

    /**
     * 3-35
     * @param ctx
     * @private
     */
    private drawWaypointPageIcon(ctx: CoordinateCanvasDrawContext) {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        const rightPage = mainPage.getRightPage();
        if (rightPage instanceof WaypointPage) {
            const facility = unpackFacility(rightPage.facility);
            if (facility !== null) {
                ctx.drawIcon(facility, "+");
            }
        }
    }

    private drawFlightplan(ctx: CoordinateCanvasDrawContext, legs: LegDefinition[], activeWaypoint: ActiveWaypoint) {
        const actIdx = activeWaypoint.getActiveFplIdx();
        for (let i = 1; i < legs.length; i++) {
            const prevleg = legs[i - 1];
            const leg = legs[i];
            if (activeWaypoint.isDctNavigation()) {
                if (actIdx === i) {
                    const from = activeWaypoint.getFromWpt()!;
                    ctx.drawFlightplanArrow(from, leg.wpt);
                } else if (i > actIdx) {
                    if (prevleg.arcData === undefined) {
                        ctx.drawFlightplanLine(prevleg.wpt, leg.wpt);
                    } else {
                        const point = new GeoPoint(prevleg.arcData.beginPoint.lat, prevleg.arcData.beginPoint.lon);
                        if (!point.equals(prevleg.arcData.entryFacility)) {
                            ctx.drawArc(prevleg.arcData.circle, prevleg.arcData.beginPoint, prevleg.arcData.entryFacility, true);
                        }
                        ctx.drawArc(prevleg.arcData.circle, prevleg.arcData.entryFacility, prevleg.arcData.endPoint);
                    }
                }
            } else {
                if (prevleg.arcData === undefined) {
                    if (actIdx === i) {
                        ctx.drawFlightplanArrow(prevleg.wpt, leg.wpt);
                    } else {
                        ctx.drawFlightplanLine(prevleg.wpt, leg.wpt);
                    }
                } else {
                    const point = new GeoPoint(prevleg.arcData.beginPoint.lat, prevleg.arcData.beginPoint.lon);
                    if (!point.equals(prevleg.arcData.entryFacility)) {
                        ctx.drawArc(prevleg.arcData.circle, prevleg.arcData.beginPoint, prevleg.arcData.entryFacility, true);
                    }
                    if (actIdx === i) {
                        ctx.drawArcWithArrow(prevleg.arcData.circle, prevleg.arcData.entryFacility, prevleg.arcData.endPoint);
                    } else {
                        ctx.drawArc(prevleg.arcData.circle, prevleg.arcData.entryFacility, prevleg.arcData.endPoint);
                    }
                }
            }

            if (i >= actIdx && leg.fixType === KLNFixType.MAP) {
                return; //6-9
            }
        }
    }

    private drawObs(ctx: CoordinateCanvasDrawContext, activeWaypoint: ActiveWaypoint, range: NauticalMiles) {
        const actWpt = activeWaypoint.getActiveWpt()!;
        const actGeo = new GeoPoint(actWpt.lat, actWpt.lon);
        const toGeo = new GeoPoint(0, 0);
        const obs = this.props.modeController.getObsTrue();
        const dist = UnitType.NMILE.convertTo(range + this.props.memory.navPage.distToActive!, UnitType.GA_RADIAN);

        toGeo.set(actGeo);
        toGeo.offset(obs, dist);
        ctx.drawLine(actWpt, toGeo);

        toGeo.set(actGeo);
        toGeo.offset(obs - 180, dist);
        ctx.drawLine(actWpt, toGeo);

        if (activeWaypoint.getActiveFplIdx() === -1) {
            ctx.drawIcon(actWpt, "%");
        }
    }

    private drawDirectTo(ctx: CoordinateCanvasDrawContext, activeWaypoint: ActiveWaypoint) {
        const actWpt = activeWaypoint.getActiveWpt()!;
        //Direct to, to anywhere
        const from = activeWaypoint.getFromWpt()!;
        ctx.drawFlightplanArrow(from, actWpt);

        if (activeWaypoint.getActiveFplIdx() === -1) {
            ctx.drawIcon(actWpt, "%");
        }
    }

    private drawFlightplanLabels(ctx: CoordinateCanvasDrawContext, legs: LegDefinition[]) {
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const nextLeg = legs[i + 1];

            if (nextLeg === undefined || leg.wpt.icao !== nextLeg.wpt.icao) { //Don't draw the same waypoint twice
                ctx.drawIcon(leg.wpt, (i + 1).toString());
            }
        }
    }

    private drawPlaneIcon(ctx: CoordinateCanvasDrawContext) {
        switch (this.orientationSetting.get()) {
            case Nav5Orientation.NORTH_UP:
            case Nav5Orientation.DTK_UP:
                ctx.drawIcon(this.props.sensors.in.gps.coords, "$");
                break;
            case Nav5Orientation.TK_UP:
            case Nav5Orientation.HDG_UP:
                ctx.drawIcon(this.props.sensors.in.gps.coords, "#");
                break;
        }
    }

    private saveRange(rangeIdx: number): void {
        this.rangeSetting.set(Number(RANGES[rangeIdx]));
    }
}