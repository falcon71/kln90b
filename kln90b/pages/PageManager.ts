import {Page, PageProps} from "./Page";
import {
    AirportFacility,
    ComponentProps,
    DisplayComponent, DisplayComponentFactory,
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

export class PageManager implements DisplayTickable {

    private currentPage: DisplayComponent<PageProps> & Page | undefined;
    private container: HTMLElement | null = null;


    constructor() {
    }

    onInteractionEvent(evt: string): void {
        this.currentPage!.onInteractionEvent(evt);
    }


    Init(): void {
        console.log("PageManager ready");
        this.container = document.getElementById('InstrumentsContainer');
        this.setCurrentPage(NullPage, {})
    }

    public setCurrentPage<T extends ComponentProps>(type: DisplayComponentFactory<T>, props: T) {
        //todo this is too fast, we must move the rerendering to the next tick!
        this.currentPage?.destroy();

        const page = FSComponent.buildComponent(type, props);
        this.currentPage = page?.instance as unknown as DisplayComponent<PageProps> & Page;

        this.rerenderCurrentPage();
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
            switch (ICAO.getFacilityType(lastActiveWaypoint.icao)) {
                case FacilityType.Airport:
                    props.memory.aptPage.ident = ICAO.getIdent(lastActiveWaypoint.icao);
                    props.memory.aptPage.facility = lastActiveWaypoint as AirportFacility;
                    page = new Apt4Page(props);
                    break;
                case FacilityType.VOR:
                    props.memory.vorPage.ident = ICAO.getIdent(lastActiveWaypoint.icao);
                    props.memory.vorPage.facility = lastActiveWaypoint as VorFacility;
                    page = new VorPage(props);
                    break;
                case FacilityType.NDB:
                    props.memory.ndbPage.ident = ICAO.getIdent(lastActiveWaypoint.icao);
                    props.memory.ndbPage.facility = lastActiveWaypoint as NdbFacility;
                    page = new NdbPage(props);
                    break;
                case FacilityType.Intersection:
                case FacilityType.RWY:
                    props.memory.intPage.ident = ICAO.getIdent(lastActiveWaypoint.icao);
                    props.memory.intPage.facility = lastActiveWaypoint as IntersectionFacility | RunwayFacility;
                    page = new IntPage(props);
                    break;
                case FacilityType.USR:
                    props.memory.supPage.ident = ICAO.getIdent(lastActiveWaypoint.icao);
                    props.memory.supPage.facility = lastActiveWaypoint as UserFacility;
                    page = new SupPage(props);
                    break;
                default:
                    throw new Error(`Unsupported waypoint: ${lastActiveWaypoint.icao}`);
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


    public rerenderCurrentPage() {
        this.container!.innerHTML = "";

        FSComponent.render(this.currentPage!.render()!, this.container);
    }

    public getCurrentPage(): Page {
        return this.currentPage!;
    }

    tick(blink: boolean): void {
        this.getCurrentPage().tick(blink);
        this.getCurrentPage().children.walk((el) => el.tick(blink));
    }
}