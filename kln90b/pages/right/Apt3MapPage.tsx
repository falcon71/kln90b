import {AirportFacility, FSComponent, GeoPoint, RunwayUtils, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {NO_CURSOR_CONTROLLER} from "../CursorController";
import {Canvas} from "../../controls/Canvas";
import {isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {Scanlist} from "../../data/navdata/Scanlist";
import {AirportNearestList} from "../../data/navdata/NearestList";

type Apt3MapPageTypes = {
    canvas: Canvas,
}

//todo we should see what happens at heliports
export class Apt3MapPage extends WaypointPage<AirportFacility> {

    public readonly cursorController = NO_CURSOR_CONTROLLER;
    readonly children: UIElementChildren<Apt3MapPageTypes>;

    readonly name: string = "APT 3";

    constructor(props: PageProps) {
        super(props);

        const facility = unpackFacility(this.facility);
        if (!facility || isUserWaypoint(facility)) {
            this.numPages = 0;
        }

        console.log(this.facility);

        this.children = new UIElementChildren<Apt3MapPageTypes>({
            canvas: new Canvas(),
        });
    }


    public render(): VNode {
        this.requiresRedraw = true;
        return this.children.get("canvas").render();
    }

    public changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        const facility = unpackFacility(this.facility);
        this.numPages = facility && !isUserWaypoint(facility) ? 1 : 0;
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        const runways = facility!.runways.map((r, idx) => RunwayUtils.getOneWayRunways(r, idx));

        const flatRunways = runways.reduce((acc, val) => acc.concat(val), []);

        const lats = flatRunways.map(r => r.latitude);
        const lons = flatRunways.map(r => r.longitude);
        const from = new GeoPoint(0, 0);
        const to = new GeoPoint(0, 0);

        const ctx = this.children.get("canvas").getDrawingContextWithBoundingBox(Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons));

        for (const runway of runways) {
            from.set(runway[0].latitude, runway[0].longitude);
            to.set(runway[1].latitude, runway[1].longitude);
            ctx.drawLine(from, to);
        }

        //After the lines, we don't want labels drawn over the lines
        for (const runway of runways) {
            from.set(runway[0].latitude, runway[0].longitude);
            to.set(runway[1].latitude, runway[1].longitude);
            ctx.drawLabel(from, runway[0].designation);
            ctx.drawLabel(to, runway[1].designation);
        }

        ctx.fill();
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }
}