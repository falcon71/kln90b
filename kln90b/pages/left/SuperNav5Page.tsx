import {
    AirportFacility,
    AirportRunway,
    Facility,
    FacilityType,
    FSComponent,
    GeoPoint,
    ICAO,
    OneWayRunway,
    RunwayUtils,
    UnitType,
    UserSetting,
    VNode,
    VorClass,
    VorFacility,
} from '@microsoft/msfs-sdk';
import {NO_CHILDREN, PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {Canvas, CanvasSize, CoordinateCanvasDrawContext} from "../../controls/Canvas";
import {isUserWaypoint} from "../right/WaypointPage";
import {Nav5Orientation, SuperNav5VOR} from "../../settings/KLN90BUserSettings";
import {SuperNav5Left} from "../../controls/SuperNav5Left";
import {SevenLinePage} from "../OneSegmentPage";
import {KLNFixType, KLNFlightplanLeg} from "../../data/flightplan/Flightplan";
import {ActiveWaypoint} from "../../data/flightplan/ActiveWaypoint";
import {SuperNav5Right} from "../../controls/SuperNav5Right";
import {NearestWpt} from '../../data/navdata/NearestList';
import {SuperNav5DirectToSelector} from "../../controls/selects/SuperNav5DirectToSelector";
import {NauticalMiles} from "../../data/Units";

type SuperNav5PageTypes = {
    canvas: Canvas,
    left: SuperNav5Left,
    right: SuperNav5Right,
    directTo: SuperNav5DirectToSelector,
}
const RANGES = [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 60, 80, 100, 120, 160, 240, 320, 480, 1000]; //I have no idea, which ranges the device supports


export class SuperNav5Page extends SevenLinePage {

    public readonly lCursorController;
    public readonly rCursorController;
    readonly children: UIElementChildren<SuperNav5PageTypes>;

    readonly name: string = "NAV 5";
    private rangeSetting: UserSetting<number> = this.props.userSettings.getSetting("superNav5MapRange");
    private orientationSetting: UserSetting<Nav5Orientation> = this.props.userSettings.getSetting("superNav5MapOrientation");
    private vorSetting: UserSetting<SuperNav5VOR> = this.props.userSettings.getSetting("superNav5Vor");
    private ndbSetting: UserSetting<boolean> = this.props.userSettings.getSetting("superNav5Ndb");
    private aptSetting: UserSetting<boolean> = this.props.userSettings.getSetting("superNav5Apt");

    private isDecluttered: boolean = false;

    /*
    private timeMeasuresCount = 0;
    private timeCumulated = 0;
    */

    constructor(props: PageProps) {
        super(props);

        this.rCursorController = new CursorController(NO_CHILDREN);

        this.children = new UIElementChildren<SuperNav5PageTypes>({
            canvas: new Canvas(CanvasSize.FULLPAGE),
            left: new SuperNav5Left(props),
            right: new SuperNav5Right(props, this.rCursorController),
            directTo: new SuperNav5DirectToSelector(this.props.bus, this.props.hardware, this.props.memory.fplPage.flightplans[0], this.props.memory.navPage.activeWaypoint, this.props.sensors),
        });

        this.lCursorController = new CursorController(this.children.get("left").children);
        this.rCursorController.refreshChildren(this.children.get("right").children);
    }


    public render(): VNode {
        return (<div>
            {this.children.get("canvas").render()}
            {this.children.get("left").render()}
            {this.children.get("right").render()}
            {this.children.get("directTo").render()}
        </div>);
    }

    public tick(blink: boolean): void {
        super.tick(blink);
        this.redraw();
    }

    public clear(): boolean {
        if (this.props.hardware.isScanPulled) {
            const didSomething = this.children.get("directTo").clear();
            if (!didSomething) {
                this.isDecluttered = !this.isDecluttered;
            }
        } else {
            this.isDecluttered = !this.isDecluttered;
        }
        return true;
    }

    public scanRight(): boolean {
        return this.children.get("directTo").scanRight();
    }

    public scanLeft(): boolean {
        return this.children.get("directTo").scanLeft();
    }

    public getDirectToTarget(): Facility | null {
        return this.children.get("directTo").getDirectToTarget();
    }

    public enter(): boolean {
        if (this.props.hardware.isScanPulled && this.children.get("directTo").enter()) {
            return true;
        }
        return super.enter();
    }

    protected redraw() {
        if (!this.props.sensors.in.gps.isValid()) {
            this.children.get("canvas").clear();
            return;
        }

        //const start = performance.now();

        let range = this.rangeSetting.get();
        if (range === 0) {
            //3-36 Auto zoom

            range = this.calculateAutoRange();
            this.props.memory.navPage.superNav5ActualRange = range;
        }

        let ctx: CoordinateCanvasDrawContext;


        switch (this.orientationSetting.get()) {
            case Nav5Orientation.NORTH_UP:
                ctx = this.children.get("canvas").getDrawingContextWithCenterRange(this.props.sensors.in.gps.coords, range);
                break;
            case Nav5Orientation.DTK_UP:
                const dtk = this.props.modeController.getDtkOrObsTrue();
                ctx = this.children.get("canvas").getDrawingContextWithOffsetCenterRangeRotation(this.props.sensors.in.gps.coords, range, dtk ?? 0);
                break;
            case Nav5Orientation.TK_UP:
                const tk = this.props.sensors.in.gps.getTrackTrueRespectingGroundspeed();
                if (tk === null) {
                    this.children.get("canvas").clear();
                    return;
                }
                ctx = this.children.get("canvas").getDrawingContextWithOffsetCenterRangeRotation(this.props.sensors.in.gps.coords, range, tk);
                break;
            case Nav5Orientation.HDG_UP:
                const hdg = this.props.magvar.magToTrue(this.props.sensors.in.headingGyro ?? 0);
                ctx = this.children.get("canvas").getDrawingContextWithOffsetCenterRangeRotation(this.props.sensors.in.gps.coords, range, hdg);
                break;
            default:
                throw new Error("orientation not implemented");
        }

        const activeWaypoint = this.props.memory.navPage.activeWaypoint;

        const legs = this.props.memory.fplPage.flightplans[0].getLegs();

        if (activeWaypoint.getActiveFplIdx() !== -1 && !this.props.modeController.isObsModeActive()) {
            this.drawFlightplan(ctx, legs, activeWaypoint);
        }

        if (!this.isDecluttered && this.vorSetting.get() !== SuperNav5VOR.OFF) {
            this.drawNearestList(ctx, this.props.nearestLists.vorNearestList.getNearestList().filter(this.filterNearestVor.bind(this)), ")")
        }
        if (!this.isDecluttered && this.ndbSetting.get()) {
            this.drawNearestList(ctx, this.props.nearestLists.ndbNearestList.getNearestList(), "(")
        }
        if (!this.isDecluttered && this.aptSetting.get()) {
            this.drawAirports(ctx, legs, range)
        }

        if (this.props.modeController.isObsModeActive() && activeWaypoint.getActiveWpt() !== null) {
            this.drawObs(ctx, activeWaypoint, range);
        } else if (activeWaypoint.isDctNavigation()) {
            this.drawDirectTo(ctx, activeWaypoint);
        }

        this.drawFlightplanLabels(ctx, legs, range);

        this.drawPlaneIcon(ctx);

        ctx.fill();
        //Enable this to log the drawing performance
        /*
        this.timeMeasuresCount++;
        this.timeCumulated += performance.now() - start;

        if(this.timeMeasuresCount >= 20){
            console.log(`Drawtime: ${this.timeCumulated / this.timeMeasuresCount} ms`);
            this.timeMeasuresCount = 0;
            this.timeCumulated = 0;
        }
         */
    }

    /**
     * 3-36
     * @private
     */
    private calculateAutoRange(): number {
        const following = this.props.memory.navPage.activeWaypoint.getFollowingLeg();
        let distance = this.props.memory.navPage.distToActive ?? 40;
        if (following !== null) {
            distance = UnitType.GA_RADIAN.convertTo(this.props.sensors.in.gps.coords.distance(following.wpt), UnitType.NMILE);
        }

        return RANGES.find((r) => r >= distance) ?? 1000;
    }

    private drawFlightplan(ctx: CoordinateCanvasDrawContext, legs: KLNFlightplanLeg[], activeWaypoint: ActiveWaypoint) {
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
                return;  //6-9
            }
        }
    }

    private drawFlightplanLabels(ctx: CoordinateCanvasDrawContext, legs: KLNFlightplanLeg[], range: NauticalMiles) {
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];

            if (range <= 2 && ICAO.getFacilityType(leg.wpt.icao) === FacilityType.Airport && !isUserWaypoint(leg.wpt)) {
                this.drawRunways(ctx, leg.wpt as AirportFacility, range);
            }

            ctx.drawIcon(leg.wpt, "@");
            ctx.drawLabel(leg.wpt, ICAO.getIdent(leg.wpt.icao));
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

    private drawAirports(ctx: CoordinateCanvasDrawContext, legs: KLNFlightplanLeg[], range: NauticalMiles) {
        const airports = this.props.nearestLists.aptNearestList.getNearestList();
        for (const airport of airports) {
            if (!legs.some(leg => leg.wpt.icao === airport.facility.icao)) { //Don't draw it, if it is already drawn by the flightplan
                if (range <= 2 && !isUserWaypoint(airport.facility)) {
                    this.drawRunways(ctx, airport.facility, range);
                } else {
                    ctx.drawIcon(airport.facility, "&");
                }
                ctx.drawLabel(airport.facility, ICAO.getIdent(airport.facility.icao));
            }
        }
    }

    /**
     * 3-38
     * @param ctx
     * @param airport
     * @param range
     * @private
     */
    private drawRunways(ctx: CoordinateCanvasDrawContext, airport: AirportFacility, range: NauticalMiles) {
        const runways: OneWayRunway[][] = [];

        let longestRunwayIdx = -1;
        let longestRunway: AirportRunway | null = null;
        const from = new GeoPoint(0, 0);
        const to = new GeoPoint(0, 0);

        for (let i = 0; i < airport.runways.length; i++) {
            const rwy = airport.runways[i];
            runways.push(RunwayUtils.getOneWayRunways(rwy, i));

            if (longestRunway === null || rwy.length > longestRunway.length) {
                longestRunway = rwy;
                longestRunwayIdx = i;
            }
        }

        for (const runway of runways) {
            from.set(runway[0].latitude, runway[0].longitude);
            to.set(runway[1].latitude, runway[1].longitude);
            ctx.drawLine(from, to);
        }

        //After the lines, we don't want labels drawn over the lines
        for (const runway of runways) {
            if (range <= 1 || runway[0].parentRunwayIndex == longestRunwayIdx) {
                from.set(runway[0].latitude, runway[0].longitude);
                to.set(runway[1].latitude, runway[1].longitude);
                ctx.drawLabel(from, runway[0].designation);
                ctx.drawLabel(to, runway[1].designation);
            }
        }
    }

    private drawNearestList(ctx: CoordinateCanvasDrawContext, waypoints: NearestWpt<Facility>[], icon: string) {
        for (const wpt of waypoints) {
            ctx.drawIcon(wpt.facility, icon);
            ctx.drawLabel(wpt.facility, ICAO.getIdent(wpt.facility.icao));
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

    private filterNearestVor(vor: NearestWpt<VorFacility>): boolean {
        switch (this.vorSetting.get()) {
            case SuperNav5VOR.OFF:
                return false;
            case SuperNav5VOR.H:
                return vor.facility.vorClass === VorClass.HighAlt;
            case SuperNav5VOR.LH:
                return vor.facility.vorClass === VorClass.HighAlt || vor.facility.vorClass === VorClass.LowAlt;
            case SuperNav5VOR.TLH:
                return true;
        }
    }

}