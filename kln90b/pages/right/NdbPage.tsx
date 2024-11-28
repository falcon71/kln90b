import {FSComponent, NdbFacility, NdbType, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {NdbSelector} from "../../controls/selects/NdbSelector";
import {isUserWaypoint, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {NdbFreqEditor} from "../../controls/editors/NdbFreqEditor";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {NdbNearestList} from "../../data/navdata/NearestList";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {CoordOrNearestView} from "../../controls/CoordOrNearestView";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {convertTextToKLNCharset} from "../../data/Text";
import {buildIcao, buildIcaoStruct, USER_WAYPOINT} from "../../data/navdata/IcaoBuilder";

interface UserNdb {
    freq: number | null,
    lat: number | null,
    lon: number | null,
}

type NdbPageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    ndb: NdbSelector
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    name: TextDisplay,
    freq: NdbFreqEditor,

    coordOrNearestView: CoordOrNearestView,
}

export class NdbPage extends WaypointPage<NdbFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<NdbPageTypes>;

    readonly name: string = "NDB  ";


    private userNdb: UserNdb = {
        freq: null,
        lat: null,
        lon: null,
    };

    constructor(props: PageProps) {
        super(props);


        console.log(this.facility);
        const facility = unpackFacility(this.facility);

        if (this.props.scanLists.ndbScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO NDB WPTS");
        }

        this.children = new UIElementChildren<NdbPageTypes>({
            activeArrow: new ActiveArrow(facility?.icaoStruct ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            ndb: new NdbSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "N"),
            nearestSelector: new NearestSelector(this.facility),
            name: new TextDisplay(this.formatName(facility)),
            freq: new NdbFreqEditor(this.props.bus, this.formatFreq(facility), this.setNdbFrequency.bind(this)),
            coordOrNearestView: new CoordOrNearestView(this.props.bus, this.facility, this.props.magvar, this.setLatitude.bind(this), this.setLongitude.bind(this)),
        });

        if (this.activeIdx !== -1) {
            this.children.get("ndb").setReadonly(true);
        }

        this.cursorController = new CursorController(this.children);

    }

    public render(): VNode {
        this.requiresRedraw = true;
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("ndb").render()}&nbsp&nbsp&nbsp{this.children.get("nearestSelector").render()} {this.children.get("waypointType").render()}<br/>
            {this.children.get("name").render()}<br/>
            <br/>
            FREQ&nbsp{this.children.get("freq").render()}<br/>
            {this.children.get("coordOrNearestView").render()}
        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.ndbScanlist;
    }

    protected changeFacility(fac: string | NdbFacility) {
        super.changeFacility(fac);
        this.children.get("ndb").setValue(this.ident);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icaoStruct ?? null;
        this.children.get("coordOrNearestView").setFacility(this.facility);
        this.userNdb = {
            freq: null,
            lat: null,
            lon: null,
        }
    }

    protected redraw() {
        const facility = unpackFacility(this.facility);
        this.children.get("nearestSelector").setFacility(this.facility);
        this.children.get("coordOrNearestView").setFacility(this.facility);
        if (facility === null) {
            this.children.get("name").text = "";
            this.children.get("freq").setValue(null);

            this.children.get("freq").isReadonly = false;
        } else {
            this.children.get("name").text = this.formatName(facility);
            this.children.get("freq").setValue(this.formatFreq(facility));

            const isUserWpt = isUserWaypoint(facility);

            this.children.get("freq").isReadonly = !isUserWpt;
        }

    }

    protected getMemory(): WaypointPageState<NdbFacility> {
        return this.props.memory.ndbPage;
    }

    protected getNearestList(): NdbNearestList {
        return this.props.nearestLists.ndbNearestList;
    }

    private setNdbFrequency(freq: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityRepository.update(facility!, fac => fac.freqMHz = freq);
        } else {
            this.userNdb.freq = freq;
            this.createIfReady();
        }
    }

    private setLatitude(latitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityRepository.update(facility!, fac => fac.lat = latitude);
        } else {
            this.userNdb.lat = latitude;
            this.createIfReady();
        }
    }

    private setLongitude(longitude: number) {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.props.facilityRepository.update(facility!, fac => fac.lon = longitude);
        } else {
            this.userNdb.lon = longitude;
            this.createIfReady();
        }
    }

    /**
     * 5-18
     * @private
     */
    private createIfReady() {
        if (this.userNdb.lat === null || this.userNdb.lon === null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "ENT LAT/LON");
            return;
        }

        // noinspection JSDeprecatedSymbols
        this.facility = {
            icao: buildIcao('N', USER_WAYPOINT, this.ident),
            icaoStruct: buildIcaoStruct('N', USER_WAYPOINT, this.ident),
            name: "",
            lat: this.userNdb.lat,
            lon: this.userNdb.lon,
            region: USER_WAYPOINT,
            city: "",
            magvar: 0,
            freqMHz: this.userNdb.freq ?? -1,
            type: NdbType.H,
            range: 0,
            bfoRequired: false,
        };
        try {
            this.props.facilityRepository.add(this.facility);
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
        }
        this.props.memory.ndbPage.facility = this.facility;
        this.cursorController.setCursorActive(false);
        this.requiresRedraw = true; //just for the magvar
    }

    private formatName(ndb: NdbFacility | null): string {
        if (!ndb) {
            return "";
        }
        return convertTextToKLNCharset(Utils.Translate(ndb.name)).substring(0, 11);
    }

    private formatFreq(ndb: NdbFacility | null): number | null {
        if (!ndb || ndb.freqMHz === -1) { //freqMHz is required, so we use -1 to indicate not set
            return null;
        }

        return ndb.freqMHz;
    }
}