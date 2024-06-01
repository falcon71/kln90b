import {FSComponent, MagVar, VNode, VorClass, VorFacility, VorType} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {VorSelector} from "../../controls/selects/VorSelector";
import {isNearestWpt, isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {VorFreqEditor} from "../../controls/editors/VorFreqEditor";
import {MagvarEditor} from "../../controls/editors/MagvarEditor";
import {WaypointPageState} from '../../data/VolatileMemory';
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {NearestWpt, VorNearestList} from "../../data/navdata/NearestList";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {CoordOrNearestView} from "../../controls/CoordOrNearestView";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {convertTextToKLNCharset} from "../../data/Text";
import {buildIcao, USER_WAYPOINT} from "../../data/navdata/IcaoBuilder";


type VorPageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    vor: VorSelector
    dme: TextDisplay,
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    name: TextDisplay,
    class: TextDisplay,
    freq: VorFreqEditor,
    magvar: MagvarEditor,
    coordOrNearestView: CoordOrNearestView,
}

interface UserVor {
    freq: number | null,
    magvar: number | null,
    lat: number | null,
    lon: number | null,
}

export class VorPage extends WaypointPage<VorFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<VorPageTypes>;

    readonly name: string = "VOR  ";

    private userVor: UserVor = {
        freq: null,
        magvar: null,
        lat: null,
        lon: null,
    };

    constructor(props: PageProps) {
        super(props);
        console.log(this.facility);

        const facility = unpackFacility(this.facility);

        if (this.props.scanLists.vorScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO VOR WPTS");
        }

        this.children = new UIElementChildren<VorPageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            vor: new VorSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            dme: new TextDisplay(facility?.type == VorType.DME || facility?.type == VorType.VORDME ? "D" : " "),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "V"),
            nearestSelector: new NearestSelector(isNearestWpt(this.facility) ? this.facility.index : -1),
            name: new TextDisplay(this.formatName(facility)),
            class: new TextDisplay(this.formatClass(facility?.vorClass)),
            freq: new VorFreqEditor(this.props.bus, this.formatFreq(facility), this.setVorFrequency.bind(this)),
            magvar: new MagvarEditor(this.props.bus, facility ? -facility.magneticVariation : null, this.setMagvar.bind(this)),
            coordOrNearestView: new CoordOrNearestView(this.props.bus, this.facility, this.props.magvar, this.setLatitude.bind(this), this.setLongitude.bind(this)),
        });


        if (this.activeIdx !== -1) {
            this.children.get("vor").setReadonly(true);
        }

        this.cursorController = new CursorController(this.children);
    }

    public render(): VNode {
        this.requiresRedraw = true;
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("vor").render()} {this.children.get("dme").render()} {this.children.get("waypointType").render()}{this.children.get("nearestSelector").render()}<br/>
            {this.children.get("name").render()}<br/>
            &nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp&nbsp{this.children.get("class").render()}<br/>
            {this.children.get("freq").render()} {this.children.get("magvar").render()}<br/>
            {this.children.get("coordOrNearestView").render()}
        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.vorScanlist;
    }

    protected changeFacility(fac: string | VorFacility | NearestWpt<VorFacility>) {
        super.changeFacility(fac);

        const facility = unpackFacility(this.facility);

        this.children.get("vor").setValue(this.ident);
        this.children.get("dme").text = facility?.type == VorType.DME || facility?.type == VorType.VORDME ? "D" : " ";
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icao ?? null;
        this.children.get("coordOrNearestView").setFacility(this.facility);
        this.userVor = {
            freq: null,
            magvar: null,
            lat: null,
            lon: null,
        }
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        this.children.get("nearestSelector").setValue(isNearestWpt(this.facility) ? this.facility.index : -1);
        this.children.get("coordOrNearestView").setFacility(this.facility);
        if (facility === null) {
            this.children.get("dme").text = " ";
            this.children.get("name").text = "";
            this.children.get("class").text = "U";
            this.children.get("freq").setValue(null);
            this.children.get("magvar").setValue(null);

            this.children.get("freq").isReadonly = false;
            this.children.get("magvar").isReadonly = false;
        } else {
            this.children.get("dme").text = facility.type == VorType.DME || facility.type == VorType.VORDME ? "D" : " ";
            this.children.get("name").text = this.formatName(facility);
            this.children.get("class").text = this.formatClass(facility.vorClass);
            this.children.get("freq").setValue(this.formatFreq(facility));
            this.children.get("magvar").setValue(-facility.magneticVariation);

            const isUserWpt = isUserWaypoint(facility);

            this.children.get("freq").isReadonly = !isUserWpt;
            this.children.get("magvar").isReadonly = !isUserWpt;
        }
    }

    protected getMemory(): WaypointPageState<VorFacility> {
        return this.props.memory.vorPage;
    }

    protected getNearestList(): VorNearestList {
        return this.props.nearestLists.vorNearestList;
    }

    private setVorFrequency(freq: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityLoader.facilityRepo.update(facility!, fac => fac.freqMHz = freq);
        } else {
            this.userVor.freq = freq;
            this.createIfReady();
        }
    }

    private setMagvar(magvar: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            const activeWpt = this.props.memory.navPage.activeWaypoint.getActiveWpt();
            if (activeWpt?.icao === facility.icao) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "IN ACT LIST");
                return;
            }
            this.props.facilityLoader.facilityRepo.update(facility!, fac => fac.magneticVariation = -magvar);
        } else {
            this.userVor.magvar = magvar;
            this.createIfReady();
        }
    }

    private setLatitude(latitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityLoader.facilityRepo.update(facility!, fac => fac.lat = latitude);
        } else {
            this.userVor.lat = latitude;
            this.createIfReady();
        }
    }

    private setLongitude(longitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityLoader.facilityRepo.update(facility!, fac => fac.lon = longitude);
        } else {
            this.userVor.lon = longitude;
            this.createIfReady();
        }
    }

    /**
     * 5-18
     * @private
     */
    private createIfReady() {
        if (this.userVor.lat === null || this.userVor.lon === null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "ENT LAT/LON");
            return;
        }

        const magvar = this.userVor.magvar === null ? MagVar.get(this.userVor.lat, this.userVor.lon) : this.userVor.magvar;

        this.facility = {
            icao: buildIcao('V', USER_WAYPOINT, this.ident),
            name: "",
            lat: this.userVor.lat,
            lon: this.userVor.lon,
            region: USER_WAYPOINT,
            city: "",
            magvar: 0,
            freqMHz: this.userVor.freq ?? -1,
            freqBCD16: 0,
            magneticVariation: -magvar,
            type: VorType.Unknown,
            vorClass: VorClass.Unknown,
        };
        try {
            this.props.facilityLoader.facilityRepo.add(this.facility);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
        }
        this.props.memory.vorPage.facility = this.facility;
        this.cursorController.setCursorActive(false);
        this.requiresRedraw = true; //just for the magvar
    }

    private formatName(vor: VorFacility | null): string {
        if (!vor) {
            return "";
        }

        return convertTextToKLNCharset(Utils.Translate(vor.name)).substring(0, 11);
    }

    private formatFreq(vor: VorFacility | null): number | null {
        if (!vor || vor.freqMHz === -1) { //freqMHz is required, so we use -1 to indicate not set
            return null;
        }

        return vor.freqMHz;
    }

    private formatClass(cls: VorClass | undefined): string {
        switch (cls) {
            case VorClass.Terminal:
                return "T";
            case VorClass.LowAlt:
                return "L";
            case VorClass.HighAlt:
                return "H";
            default:
                return "U";

        }
    }
}