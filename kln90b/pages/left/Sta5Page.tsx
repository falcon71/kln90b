import {
    ClockEvents,
    DebounceTimer,
    EventBus,
    Facility,
    FSComponent,
    GNSSEvents,
    GPSSatComputer,
    GPSSystemState,
    UserSetting,
    VNode,
} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {TimeEditor} from "../../controls/editors/TimeEditor";
import {SelectField} from "../../controls/selects/SelectField";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {TimeStamp, TIMEZONES} from "../../data/Time";
import {HOURS_TO_SECONDS} from "../../data/navdata/NavCalculator";


type Sta5PageTypes = {
    dest: WaypointEditor,
    eta: TimeEditor,
    timezone: SelectField;
    result: TextDisplay,
}

const RAIM_CALCULATION_TIME = 10 * 1000; //No idea, the manual mentions a few seconds

/**
 * 6-20
 */
export class Sta5Page extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Sta5PageTypes>;

    readonly name: string = "STA 5";

    private wpt: Facility | null = this.props.memory.navPage.activeWaypoint.getDestination();
    private etaZulu: TimeStamp | null = null;
    private timezoneSetting: UserSetting<number>;

    private refDebounce = new DebounceTimer();

    constructor(props: PageProps) {
        super(props);

        this.timezoneSetting = this.props.userSettings.getSetting("timezone");

        const futureLegs = this.props.memory.navPage.activeWaypoint.getFutureLegs();
        this.wpt = futureLegs.length > 0 ? futureLegs[futureLegs.length - 1].wpt : null;

        if (this.props.memory.navPage.eteToDest !== null) {
            this.etaZulu = this.props.sensors.in.gps.timeZulu.addSeconds(this.props.memory.navPage.eteToDest);
        }

        this.children = new UIElementChildren<Sta5PageTypes>({
            dest: new WaypointEditor({
                ...this.props,
                value: this.wpt,
                enterCallback: this.setWpt.bind(this),
                parent: this,
            }),
            eta: new TimeEditor(this.props.bus, this.etaZulu?.atTimezone(TIMEZONES[this.timezoneSetting.get()]) ?? null, this.saveTime.bind(this)),
            timezone: new SelectField(TIMEZONES.map(t => t.code), this.timezoneSetting.get(), this.saveTimezone.bind(this)),
            result: new TextDisplay("  ççççççç"),
        });

        this.cursorController = new CursorController(this.children);
        this.calculateRaim();
    }

    public render(): VNode {
        return (<pre>
            RAIM STATUS<br/>
            DEST: {this.children.get("dest").render()}<br/>
            ETA:&nbsp&nbsp{this.children.get("eta").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("timezone").render()}<br/>
            {this.children.get("result").render()}<br/>
            -15&nbsp&nbsp0&nbsp&nbsp•15
        </pre>);
    }

    private setWpt(waypoint: Facility | null) {
        this.wpt = waypoint;
        this.calculateRaim();
    }

    private saveTimezone(tzIndex: number): void {
        this.props.userSettings.getSetting("timezone").set(tzIndex);
        this.children.get("eta").setValue(this.etaZulu?.atTimezone(TIMEZONES[this.timezoneSetting.get()]) ?? null);
    }

    private saveTime(time: TimeStamp): void {
        this.etaZulu = time;
        this.calculateRaim();
    }

    private calculateRaim() {
        this.refDebounce.clear();
        if (this.wpt === null || this.etaZulu === null) {
            this.children.get("result").text = "  ççççççç";
            return;
        }

        let actualTimeStamp = this.props.sensors.in.gps.timeZulu.withTime(this.etaZulu.getHours(), this.etaZulu.getMinutes()).getTimestamp();
        if (actualTimeStamp < this.props.sensors.in.gps.timeZulu.getTimestamp()) {
            actualTimeStamp += 24 * HOURS_TO_SECONDS * 1000;
        }


        this.children.get("result").text = " COMPUTING";

        const tempBus = new EventBus();
        const clockPublisher = tempBus.getPublisher<ClockEvents>();
        const gnssPublisher = tempBus.getPublisher<GNSSEvents>();

        const gps = new GPSSatComputer(
            1,
            tempBus,
            `coui://${this.props.planeSettings.basePath}/Assets/gps_ephemeris.json`,
            `coui://${this.props.planeSettings.basePath}/Assets/gps_sbas.json`,
            5000,
            [],
            'primary',
        );


        clockPublisher.pub('simTime', this.etaZulu.getTimestamp());
        gnssPublisher.pub('gps-position', new LatLongAlt(this.wpt.lat, this.wpt.lon, 0));

        gps.init();

        this.refDebounce.schedule(async () => { //init needs some time to load the json, but we need to simulate the calculation time anyway
            let result = "";
            for (let timeOffset = -15; timeOffset <= 15; timeOffset += 5) {
                gps.reset();
                const timestamp = actualTimeStamp + (timeOffset * 60 * 1000);
                clockPublisher.pub('simTime', timestamp);
                gps.acquireAndUseSatellites();

                console.log(timeOffset, gps.state);

                const isRaimAvailable = gps.state === GPSSystemState.SolutionAcquired || gps.state === GPSSystemState.DiffSolutionAcquired;

                if (isRaimAvailable) {
                    result += "è";
                } else {
                    result += "é";
                }
            }

            this.children.get("result").text = "  " + result;
        }, RAIM_CALCULATION_TIME);


    }


}