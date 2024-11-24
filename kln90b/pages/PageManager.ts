import {Page, PageProps} from "./Page";
import {
    AirportFacility,
    ComponentProps,
    DisplayComponentFactory,
    EventBus,
    Facility,
    FacilityType,
    FSComponent,
    ICAO,
    IntersectionFacility,
    NdbFacility,
    RunwayFacility,
    UserFacility,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {NullPage} from "./NullPage";
import {MainPage} from "./MainPage";
import {Nav2Page} from "./left/Nav2Page";
import {Apt4Page} from "./right/Apt4Page";
import {SupPage} from "./right/SupPage";
import {WaypointPage} from "./right/WaypointPage";
import {VorPage} from "./right/VorPage";
import {NdbPage} from "./right/NdbPage";
import {IntPage} from "./right/IntPage";
import {DisplayTickable} from "../TickController";
import {OneTimeMessage} from "../data/MessageHandler";
import {PageContainer} from "../controls/PageContainer";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";

export class PageManager implements DisplayTickable {

    private container: PageContainer | null = null;


    constructor() {
    }

    onInteractionEvent(evt: string): void {
        this.container!.onInteractionEvent(evt);
    }


    Init(bus: EventBus, userSettings: KLN90BUserSettings): void {
        console.log("PageManager ready");
        this.setupContainer(PageContainer, {bus, userSettings});
        this.setCurrentPage(NullPage, {})
    }

    public setCurrentPage<T extends ComponentProps>(type: DisplayComponentFactory<T>, props: T) {
        this.container!.setCurrentPage(type, props);
    }

    public isLeftKeyboardActive(): boolean {
        return this.container!.isLeftKeyboardActive;
    }

    public startMainPage(props: PageProps) {
        const lastActiveWaypoint = props.memory.navPage.activeWaypoint.lastactiveWaypoint;
        if (lastActiveWaypoint === null) {
            this.setCurrentPage(MainPage, {
                ...props,
                lPage: new Nav2Page(props),
                rPage: new SupPage(props),
            }); //default when no last active waypoint
        } else {
            let page: WaypointPage<Facility>;
            switch (ICAO.getFacilityTypeFromValue(lastActiveWaypoint.icaoStruct)) {
                case FacilityType.Airport:
                    props.memory.aptPage.ident = lastActiveWaypoint.icaoStruct.ident;
                    props.memory.aptPage.facility = lastActiveWaypoint as AirportFacility;
                    page = new Apt4Page(props);
                    break;
                case FacilityType.VOR:
                    props.memory.vorPage.ident = lastActiveWaypoint.icaoStruct.ident;
                    props.memory.vorPage.facility = lastActiveWaypoint as VorFacility;
                    page = new VorPage(props);
                    break;
                case FacilityType.NDB:
                    props.memory.ndbPage.ident = lastActiveWaypoint.icaoStruct.ident;
                    props.memory.ndbPage.facility = lastActiveWaypoint as NdbFacility;
                    page = new NdbPage(props);
                    break;
                case FacilityType.Intersection:
                case FacilityType.RWY:
                    props.memory.intPage.ident = lastActiveWaypoint.icaoStruct.ident;
                    props.memory.intPage.facility = lastActiveWaypoint as IntersectionFacility | RunwayFacility;
                    page = new IntPage(props);
                    break;
                case FacilityType.USR:
                    props.memory.supPage.ident = lastActiveWaypoint.icaoStruct.ident;
                    props.memory.supPage.facility = lastActiveWaypoint as UserFacility;
                    page = new SupPage(props);
                    break;
                default:
                    throw new Error(`Unsupported waypoint: ${lastActiveWaypoint.icaoStruct}`);
            }
            this.setCurrentPage(MainPage, {
                ...props,
                lPage: new Nav2Page(props),
                rPage: page,
            });
        }

        if (props.planeSettings.input.fuelComputer.isInterfaced && !props.planeSettings.input.fuelComputer.fobTransmitted) {
            props.messageHandler.addMessage(new OneTimeMessage(["SET FUEL ON BOARD", "ON OTH 5 IF NECESSARY"]));
        }
    }

    public isRightKeyboardActive(): boolean {
        return this.container!.isRightKeyboardActive;
    }

    public getCurrentPage(): Page {
        return this.container!.getCurrentPage();
    }

    public resetKeyboard() {
        this.container!.resetKeyboard();
    }

    tick(blink: boolean): void {
        this.container!.tick(blink);
    }

    private setupContainer<T extends ComponentProps>(type: DisplayComponentFactory<T>, props: T) {
        const container = FSComponent.buildComponent(type, props);
        this.container = container?.instance as unknown as PageContainer;
        const containerParent = document.getElementById('InstrumentsContainer');
        FSComponent.render(this.container!.render()!, containerParent);
    }
}