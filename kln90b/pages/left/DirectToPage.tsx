import {Facility, FSComponent, ICAO, UserFacilityUtils, VNode} from '@microsoft/msfs-sdk';
import {SixLineHalfPage} from "../FiveSegmentPage";
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {WaypointEditor} from "../../controls/editors/WaypointEditor";
import {MainPage} from "../MainPage";
import {isWapointPage, unpackFacility} from "../right/WaypointPage";
import {Nav1Page} from "./Nav1Page";
import {Fpl0Page} from "./FplPage";
import {SuperNav5Page} from "./SuperNav5Page";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {format} from "numerable";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {KLNFixType} from "../../data/flightplan/Flightplan";
import {FROM} from "../../data/VolatileMemory";
import {FlightPlanWaypint, isFlightPlanWaypint} from "../../controls/FlightplanList";


type DirectToPageTypes = {
    title: TextDisplay,
    wpt: WaypointEditor,
}

/**
 * 3-27
 */
export class DirectToPage extends SixLineHalfPage {

    public readonly cursorController;
    readonly children: UIElementChildren<DirectToPageTypes>;

    readonly name: string = "DIR  "; //The KLN 89 and KLN 90B trainer display DIR

    private activateMode: boolean = false;
    //If the user performs a direct to by selecting a wpt from the fpl 0 page, then the KLN knows wheter you selected
    //the first or any other occurence
    private readonly flightPlanIndex: number | null = null;

    constructor(props: PageProps) {
        super(props);

        const directToAutoFill = this.getDirectToSuggestion();
        let facility: Facility | null;
        if (isFlightPlanWaypint(directToAutoFill)) {
            facility = directToAutoFill.wpt;
            this.flightPlanIndex = directToAutoFill.index;
        } else {
            facility = directToAutoFill;
            this.flightPlanIndex = null;
        }


        this.children = new UIElementChildren<DirectToPageTypes>({
            title: new TextDisplay("DIRECT TO:"),
            wpt: new WaypointEditor({
                ...this.props,
                enterCallback: this.performDirectTo.bind(this),
                value: facility,
                parent: this,
            }),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
        if (directToAutoFill !== null) {
            this.children.get("wpt").confirmCurrentValue();
        }
    }

    public directToPressed(): void {
        if (!this.props.modeController.isObsModeActive()) {
            return;
        }
        this.activateMode = !this.activateMode;
        this.children.get("title").text = this.activateMode ? "ACTIVATE:" : "DIRECT TO:";
    }

    public tick(blink: boolean): void {
        super.tick(blink);

        if (this.activateMode && !this.props.modeController.isObsModeActive()) {
            this.activateMode = false;
            this.children.get("title").text = "DIRECT TO:";
        }
    }

    public render(): VNode {
        return (<pre>
            {this.children.get("title").render()}<br/>
            <br/>
            &nbsp &nbsp{this.children.get("wpt").render()}
        </pre>);
    }

    private performDirectTo(waypoint: Facility | null) {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.popLeftPage();
        if (waypoint === null) { //3-29 clear DCT
            this.props.memory.navPage.activeWaypoint.cancelDirectTo();
        } else {
            const from = UserFacilityUtils.createFromLatLon(ICAO.value("U", "XX", "", "d"), this.props.sensors.in.gps.coords.lat, this.props.sensors.in.gps.coords.lon, true);
            if (this.flightPlanIndex !== null && ICAO.valueEquals(this.props.memory.fplPage.flightplans[0].getLegs()[this.flightPlanIndex].wpt.icaoStruct, waypoint.icaoStruct)) {
                this.props.memory.navPage.activeWaypoint.directToFlightplanIndex(from, this.flightPlanIndex);
            } else {
                this.props.memory.navPage.activeWaypoint.directTo(from, waypoint);
            }

            this.props.modeController.deactivateApproach();
            if (this.props.modeController.isObsModeActive()) {
                if (this.activateMode) {
                    this.props.modeController.setObs(this.props.memory.navPage.obsMag);
                } else {
                    const obsTrue = this.props.sensors.in.gps.coords.bearingTo(waypoint);
                    const magvar = this.props.modeController.getMagvarForObs(waypoint);
                    const obsMag = this.props.magvar.trueToMag(obsTrue, magvar);
                    this.props.modeController.setObs(obsMag);

                    if (this.props.planeSettings.output.obsTarget === 0) {
                        this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", `d› CRS ${format(obsMag, "000")}` as any);
                    }
                }

            }
            if (!(mainPage.getLeftPage() instanceof Nav1Page)) {
                mainPage.setRightPage(new Nav1Page(this.props));
            }
        }
    }

    private getDirectToSuggestion(): Facility | FlightPlanWaypint | null {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        //1 flightplan 0 with cursor
        const leftPage = mainPage.getLeftPage();
        if (leftPage instanceof Fpl0Page) {
            const selectedFacility = leftPage.getSelectedWaypoint();
            if (selectedFacility !== null) {
                return selectedFacility;
            }
        }
        //2 super nav 5 page
        const overlayPage = mainPage.getOverlayPage();
        if (overlayPage instanceof SuperNav5Page) {
            const selectedFacility = overlayPage.getDirectToTarget();
            if (selectedFacility !== null) {
                return selectedFacility;
            }
        }

        //3 waypoint page is shown
        const rightPage = mainPage.getRightPage();

        if (isWapointPage(rightPage)) {
            return unpackFacility(rightPage.facility);
        }

        //4 current active waypoint or missed approach if MAP
        const active = this.props.memory.navPage.activeWaypoint.getActiveLeg();
        if (active !== null) {
            if (active.fixType === KLNFixType.MAP && this.props.memory.navPage.toFrom === FROM) {
                //Special rule for MAP. Activates the missed approach
                return this.props.memory.navPage.activeWaypoint.getFollowingLeg()?.wpt ?? null;
            } else {
                return active.wpt;
            }
        }

        //5 blank
        return null;

    }

}