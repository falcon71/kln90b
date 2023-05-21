import {Facility, FSComponent, GeoPoint, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {LatitudeEditor} from "../../controls/editors/LatitudeEditor";
import {LongitudeEditor} from "../../controls/editors/LongitudeEditor";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {Button} from "../../controls/Button";
import {Degrees, Knots, Latitude, Longitude} from "../../data/Units";
import {RadialEditor} from "../../controls/editors/RadialEditor";
import {BearingEditor} from "../../controls/editors/BearingEditor";
import {SpeedEditor} from "../../controls/editors/SpeedEditor";


type Set1PageTypes = {
    wpt: WaypointEditor,
    lat: LatitudeEditor,
    lon: LongitudeEditor,
    groundspeed: SpeedEditor,
    track: RadialEditor,
    confirm: Button,
}

export class Set1Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Set1PageTypes>;

    readonly name: string = "SET 1";

    private lat: Latitude;
    private lon: Latitude;
    private groundspeed: Knots;
    private track: Degrees;

    constructor(props: PageProps) {
        super(props);

        const gps = this.props.sensors.in.gps;
        this.lat = gps.coords.lat;
        this.lon = gps.coords.lon;
        this.groundspeed = gps.groundspeed;
        this.track = this.props.magvar.trueToMag(gps.trackTrue);

        this.children = new UIElementChildren<Set1PageTypes>({
            wpt: new WaypointEditor({
                ...this.props,
                enterCallback: this.setWpt.bind(this),
                parent: this,
            }),
            lat: new LatitudeEditor(this.props.bus, this.lat, this.setLat.bind(this)),
            lon: new LongitudeEditor(this.props.bus, this.lon, this.setLon.bind(this)),
            groundspeed: new SpeedEditor(this.props.bus, this.groundspeed, this.setGroundspeed.bind(this)),
            track: new BearingEditor(this.props.bus, this.track, this.setTrack.bind(this)),
            confirm: new Button("CONFIRM?", this.confirmPosition.bind(this)), //The manual is wrong, this button is always visible. See https://youtu.be/8esFTk7Noj8
        });

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        return (<pre>
            INIT POSN<br/>
            WPT: {this.children.get("wpt").render()}<br/>
            {this.children.get("lat").render()}'<br/>
            {this.children.get("lon").render()}'<br/>
            {this.children.get("groundspeed").render()} KT {this.children.get("track").render()}°<br/>
            {this.children.get("confirm").render()}
        </pre>);
    }

    private setWpt(waypoint: Facility | null) {
        this.lat = waypoint!.lat;
        this.lon = waypoint!.lon;
        this.children.get("lat").setValue(this.lat);
        this.children.get("lon").setValue(this.lon);
    }

    private setLat(lat: Latitude | null) {
        this.lat = lat!;
    }

    private setLon(lon: Longitude | null) {
        this.lon = lon!;
    }

    private setGroundspeed(groundspeed: Knots) {
        this.groundspeed = groundspeed;
    }

    private setTrack(track: Degrees) {
        this.track = track;
    }

    private confirmPosition(): void {
        const gps = this.props.sensors.in.gps;
        gps.coords = new GeoPoint(
            this.lat,
            this.lon,
        );
        gps.groundspeed = this.groundspeed;
        gps.trackTrue = this.track;
        gps.recalcTTF();
        this.cursorController.setCursorActive(false);
    }

}