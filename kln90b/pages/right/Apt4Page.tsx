import {AirportFacility, FacilityFrequencyType, FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController} from "../CursorController";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {format} from "numerable";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {Apt1Page} from "./Apt1Page";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {AirportNearestList} from "../../data/navdata/NearestList";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";


type Apt4PageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    apt: AirportSelector
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    freq0: TextDisplay,
    freq1: TextDisplay,
    freq2: TextDisplay,
    freq3: TextDisplay,
    freq4: TextDisplay,

    createWpt: CreateWaypointMessage,
}

/**
 * 3-45
 */
export class Apt4Page extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt4PageTypes>;

    readonly name: string = "APT 4";
    protected readonly mainRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private freqs: string[] = [];

    constructor(props: PageProps) {
        super(props);

        const facility = unpackFacility(this.facility);

        this.buildFreqList();

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }


        this.children = new UIElementChildren<Apt4PageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(this.facility),
            freq0: new TextDisplay(""),
            freq1: new TextDisplay(" COMM FREQ"),
            freq2: new TextDisplay(" DATA NOT"),
            freq3: new TextDisplay(" AVAILABLE"),
            freq4: new TextDisplay(""),
            createWpt: new CreateWaypointMessage(() => Apt1Page.createAtUserPosition(props), () => Apt1Page.createAtPresentPosition(props)),
        });

        if (this.activeIdx !== -1) {
            this.children.get("apt").setReadonly(true);
        }
        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("activeIdx").render()}{this.children.get("apt").render()}&nbsp&nbsp{this.children.get("waypointType").render()}{this.children.get("nearestSelector").render()}<br/>
            <div ref={this.mainRef}>
                {this.children.get("freq0").render()}<br/>
                {this.children.get("freq1").render()}<br/>
                {this.children.get("freq2").render()}<br/>
                {this.children.get("freq3").render()}<br/>
                {this.children.get("freq4").render()}
            </div>
            {this.children.get("createWpt").render()}
        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected redraw(): void {
        this.children.get("nearestSelector").setFacility(this.facility);
        if (this.facility === null) {
            this.mainRef.instance.classList.add("d-none");
            this.children.get("createWpt").setVisible(true);
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);
            if (this.freqs.length > 0) {
                const startIndex = this.currentPage * 5;

                for (let i = 0; i < 5; i++) {
                    if (i + startIndex < this.freqs.length) {
                        // @ts-ignore
                        this.children.get(`freq${i}`).text = this.freqs[i + startIndex];
                    } else {
                        // @ts-ignore
                        this.children.get(`freq${i}`).text = "";
                    }

                }
            } else {
                this.children.get("freq0").text = "";
                this.children.get("freq1").text = " COMM FREQ";
                this.children.get("freq2").text = " DATA NOT";
                this.children.get("freq3").text = " AVAILABLE";
                this.children.get("freq4").text = "";
            }
        }
    }


    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.children.get("activeArrow").icao = unpackFacility(this.facility)?.icao ?? null;
        this.children.get("apt").setValue(this.ident);
        this.buildFreqList();
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private buildFreqList() {
        const facility = unpackFacility(this.facility);
        if (facility) {
            this.freqs = facility.frequencies.filter(f => f.type != 0).map(f => `${this.freqTypeString(f.type)} ${format(f.freqMHz, "000.00")}`);
            this.numPages = Math.max(Math.ceil(this.freqs.length / 5), 1);
        } else {
            this.freqs = [];
            this.numPages = 1;
        }
    }

    private freqTypeString(type: FacilityFrequencyType): string {
        switch (type) {
            case FacilityFrequencyType.None:
                return "    ";
            case FacilityFrequencyType.ATIS:
                return "ATIS";
            case FacilityFrequencyType.Multicom:
                return "MCOM";
            case FacilityFrequencyType.Unicom:
                return "UNIC";
            case FacilityFrequencyType.CTAF:
                return "CTAF";
            case FacilityFrequencyType.Ground:
                return "GRND";
            case FacilityFrequencyType.Tower:
                return "TWR ";
            case FacilityFrequencyType.Clearance:
            case FacilityFrequencyType.GCO:
                return "CLR ";
            case FacilityFrequencyType.Approach:
                return "APR ";
            case FacilityFrequencyType.Departure:
                return "DEP ";
            case FacilityFrequencyType.Center:
                return "CTR ";
            case FacilityFrequencyType.FSS:
                return "AFIS";
            case FacilityFrequencyType.AWOS:
                return "AWOS";
            case FacilityFrequencyType.ASOS:
                return "ASOS";
            case FacilityFrequencyType.CPT:
                return "PTAX";
            default:
                console.log("Unkonwn Type!", type);
                return "    ";
        }
    }
}