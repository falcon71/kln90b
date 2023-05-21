import {
    AirportFacility,
    ApproachProcedure,
    ApproachTransition,
    FSComponent,
    ICAO,
    NodeReference,
    RunwayUtils,
    VNode,
} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController, NO_CURSOR_CONTROLLER} from "../CursorController";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {Apt1Page} from "./Apt1Page";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {AirportNearestList} from "../../data/navdata/NearestList";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {Apt8IafList, LastItemAlwaysVisibleList} from "../../controls/List";
import {SimpleListItem} from "../../controls/ListItem";
import {Button} from "../../controls/Button";
import {MainPage} from "../MainPage";
import {Fpl0Page} from "../left/FplPage";
import {KLNFlightplanLeg, KLNLegType} from "../../data/flightplan/Flightplan";
import {OneTimeMessage} from "../../data/MessageHandler";
import {SidStar} from "../../data/navdata/SidStar";
import {insertLegIntoFpl} from "../../services/FlightplanUtils";


type Apt8PageTypes = {
    page: WaypointPage<AirportFacility>,
}

/**
 * 3-49, 6-4
 *
 * Yes, it is impossible not to select an approach transition!
 */
export class Apt8Page extends WaypointPage<AirportFacility> {

    readonly children: UIElementChildren<Apt8PageTypes>;
    readonly name: string = "APT 8";
    protected cursorController = NO_CURSOR_CONTROLLER;
    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private currentApt8Page: WaypointPage<AirportFacility>;

    constructor(props: PageProps) {
        super(props);

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }

        this.currentApt8Page = new Apt8IAPPage({
            ...props,
            selectApproach: this.selectApproach.bind(this),
        });


        this.children = new UIElementChildren<Apt8PageTypes>({
            page: this.currentApt8Page,
        });

    }


    public render(): VNode {
        return (<div ref={this.ref}>
            {this.currentApt8Page.render()}
        </div>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    public clear(): boolean {
        if (this.currentApt8Page instanceof Apt8IAPPage) {
            return false;
        } else if (this.currentApt8Page instanceof Apt8IAFPage) {
            this.currentApt8Page = new Apt8IAPPage({
                ...this.props,
                selectApproach: this.selectApproach.bind(this),
            });
        } else if (this.currentApt8Page instanceof Apt8PreviewPage) {
            const app = this.currentApt8Page.app;
            if (app.transitions.length <= 1) {
                this.currentApt8Page = new Apt8IAPPage({
                    ...this.props,
                    selectApproach: this.selectApproach.bind(this),
                });
            } else {
                this.currentApt8Page = new Apt8IAFPage({
                    ...this.props,
                    app: app,
                    selectIaf: this.selectIaf.bind(this),
                });
            }
        } else if (this.currentApt8Page instanceof Apt8AddPage) {
            this.currentApt8Page = new Apt8PreviewPage({
                ...this.props,
                app: this.currentApt8Page.app,
                iaf: this.currentApt8Page.iaf,
                legs: this.currentApt8Page.legs,
                load: this.loadIfFplContainsApt.bind(this),
            });
        }

        this.requiresRedraw = true;
        return true;
    }

    public getCursorController(): CursorController {
        return this.currentApt8Page.getCursorController();
    }

    protected redraw(): void {
        this.children.set("page", this.currentApt8Page);
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.currentApt8Page.render(), this.ref.instance);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.currentApt8Page = new Apt8IAPPage({
            ...this.props,
            selectApproach: this.selectApproach.bind(this),
        });
        this.requiresRedraw = true;
    }

    private selectApproach(app: ApproachProcedure): void {
        console.log("selectApproach", app);
        if (!this.props.database.isAiracCurrent() && !this.props.planeSettings.debugMode) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "OUTDATED DB");
            return;
        }

        if (app.transitions.length <= 1) {
            this.selectIaf(app, app.transitions.length === 1 ? app.transitions[0] : null);
        } else {
            this.currentApt8Page = new Apt8IAFPage({
                ...this.props,
                app: app,
                selectIaf: this.selectIaf.bind(this),
            });
        }


        this.requiresRedraw = true;
    }

    private async selectIaf(app: ApproachProcedure, iaf: ApproachTransition | null): Promise<void> {
        console.log("selectIaf", app, iaf);
        //We actually only need the Identds for the preview page and not the whole facilities.
        //BUT, the KLN also resolves DME Arc entries and we need the facilities for that
        const legs = await this.props.sidstar.getKLNApproachLegList(unpackFacility(this.facility)!, app, iaf);
        this.currentApt8Page = new Apt8PreviewPage({
            ...this.props,
            app: app,
            iaf: iaf,
            legs: legs,
            load: this.loadIfFplContainsApt.bind(this),
        });
        this.requiresRedraw = true;
    }

    private loadIfFplContainsApt(app: ApproachProcedure, iaf: ApproachTransition | null, legs: KLNFlightplanLeg[]): void {
        console.log("loadIfFplContainsApt", app, iaf, legs);
        const fpl0Legs = this.props.memory.fplPage.flightplans[0].getLegs();
        const facility = unpackFacility(this.facility)!;

        if (fpl0Legs.some(wpt => wpt.wpt.icao === facility.icao)) {
            this.load(app, iaf, legs);
            return;
        }

        this.currentApt8Page = new Apt8AddPage({
            ...this.props,
            app: app,
            iaf: iaf,
            legs: legs,
            load: this.load.bind(this),
        });
        this.requiresRedraw = true;

    }

    private load(app: ApproachProcedure, iaf: ApproachTransition | null, legs: KLNFlightplanLeg[]): void {
        console.log("load", app, iaf, legs);

        const fpl0 = this.props.memory.fplPage.flightplans[0];
        fpl0.removeProcedure(KLNLegType.APP); //I don't think you can have two approaches at the same time
        const fpl0Legs = fpl0.getLegs();
        const facility = unpackFacility(this.facility)!;
        let idx = fpl0Legs.findIndex(wpt => wpt.wpt.icao === facility.icao);
        if (idx === -1) {
            idx = fpl0Legs.length;
            try {
                insertLegIntoFpl(fpl0, this.props.memory.navPage, fpl0Legs.length, {wpt: facility, type: KLNLegType.USER});
            } catch (e) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL");
                console.error(e);
                return;
            }
        }

        if (SidStar.hasDuplicates(fpl0Legs, legs)) {
            this.props.messageHandler.addMessage(new OneTimeMessage(["REDUNDANT WPTS IN FPL", "EDIT ENROUTE WPTS", "AS NECESSARY"]));
        }

        for (const leg of legs) {
            try {
                insertLegIntoFpl(fpl0, this.props.memory.navPage, idx, leg);
                idx++;
            } catch (e) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL");
                console.error(e);
                break;
            }
        }

        this.currentApt8Page = new Apt8IAPPage({
            ...this.props,
            selectApproach: this.selectApproach.bind(this),
        });
        this.requiresRedraw = true;


        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.setLeftPage(new Fpl0Page(this.props));
    }
}

interface Apt8IapPageProps extends PageProps {
    selectApproach: (app: ApproachProcedure) => void,
}

type Apt8IAPPageTypes = {
    activeArrow: ActiveArrow,
    apt: AirportSelector,

    list: LastItemAlwaysVisibleList,

    createWpt: CreateWaypointMessage,
}

/**
 * 3-49, 6-4
 */
class Apt8IAPPage extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt8IAPPageTypes>;

    readonly name: string = "APT 8";

    protected readonly mainRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    protected readonly emptyRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    protected readonly listRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private readonly selectApproach: (app: ApproachProcedure) => void;

    constructor(props: Apt8IapPageProps) {
        super(props);
        this.selectApproach = props.selectApproach;

        const facility = unpackFacility(this.facility);


        this.children = new UIElementChildren<Apt8IAPPageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            list: new LastItemAlwaysVisibleList(UIElementChildren.forList([])),
            createWpt: new CreateWaypointMessage(() => Apt1Page.createAtUserPosition(props), () => Apt1Page.createAtPresentPosition(props)),
        });

        if (this.activeIdx !== -1) {
            this.children.get("apt").setReadonly(true);
        }

        this.cursorController = new CursorController(this.children);

    }


    public render(): VNode {
        return (<pre>
            {this.children.get("activeArrow").render()}{this.children.get("apt").render()} IAP<br/>
            <div ref={this.mainRef}>
                <div ref={this.emptyRef}>
                    NO APPROACH<br/>
                    FOR THIS<br/>
                    AIRPORT<br/>
                    IN DATABASE
                </div>
                <div ref={this.listRef} class="d-none">

                    {this.children.get("list").render()}
                </div>
            </div>
            {this.children.get("createWpt").render()}
        </pre>);
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected redraw(): void {
        const facility = unpackFacility(this.facility);
        if (facility === null) {
            this.mainRef.instance.classList.add("d-none");
            this.children.get("createWpt").setVisible(true);
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);
            const approaches = facility.approaches.filter(SidStar.isApproachRecognized).map((app, idx) => new SimpleListItem<ApproachProcedure>({
                bus: this.props.bus,
                value: app,
                fulltext: (idx + 1).toString().padStart(2, " ") + " " + this.formatApproachName(app),
                onEnter: this.selectApproach,
            }));


            if (approaches.length === 0) {
                this.emptyRef.instance.classList.remove("d-none");
                this.listRef.instance.classList.add("d-none");
            } else {
                this.emptyRef.instance.classList.add("d-none");
                this.listRef.instance.classList.remove("d-none");
                this.children.get("list").refresh(UIElementChildren.forList(approaches));
            }
        }

        this.cursorController.refreshChildren(this.children);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private formatApproachName(app: ApproachProcedure): string {
        let prefix: string;

        switch (app.approachType) {
            case ApproachType.APPROACH_TYPE_GPS:
                prefix = "RNAV";
                break;
            case ApproachType.APPROACH_TYPE_VOR:
            case ApproachType.APPROACH_TYPE_VORDME:
                prefix = "VOR";
                break;
            case ApproachType.APPROACH_TYPE_NDB:
            case ApproachType.APPROACH_TYPE_NDBDME:
                prefix = "NDB";
                break;
            default:
                throw Error(`Unsupported approachtype: ${app}`);
        }

        let suffix = "";
        if (app.approachSuffix !== "") {
            suffix = `-${app.approachSuffix}`;
        }

        let runway = "   ";
        if (app.runway !== "") {
            runway = RunwayUtils.getRunwayNameString(app.runwayNumber, app.runwayDesignator, true).padEnd(3, " ");
        }

        return (prefix + suffix).padEnd(5, " ") + runway.padEnd(3, " ");
    }
}

abstract class Apt8SelectorPage extends WaypointPage<AirportFacility> {


    readonly name: string = "APT 8";
    public abstract readonly app: ApproachProcedure;

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected formatTitle(): string {
        return SidStar.formatApproachName(this.app, unpackFacility(this.facility)!);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

}

interface Apt8IafPageProps extends PageProps {
    app: ApproachProcedure,
    selectIaf: (app: ApproachProcedure, iaf: ApproachTransition) => void,
}


type Apt8IAFPageTypes = {
    list: Apt8IafList,
}

class Apt8IAFPage extends Apt8SelectorPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt8IAFPageTypes>;

    public readonly app: ApproachProcedure;
    private readonly selectIaf: (app: ApproachProcedure, iaf: ApproachTransition) => void;

    constructor(props: Apt8IafPageProps) {
        super(props);
        this.app = props.app;
        this.selectIaf = props.selectIaf;

        this.children = new UIElementChildren<Apt8IAFPageTypes>({
            list: new Apt8IafList(this.buildList()),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            IAF {this.children.get("list").render()}
        </pre>);
    }

    private buildList(): UIElementChildren<any> {
        const iafs = this.app.transitions.map((iaf, idx) => new SimpleListItem<ApproachTransition>({
            bus: this.props.bus,
            value: iaf,
            fulltext: (idx + 1).toString().padEnd(2, " ") + iaf.name.padEnd(5, " "),
            onEnter: (iaf) => this.selectIaf(this.app, iaf),
        }));

        return UIElementChildren.forList(iafs);
    }

}


interface Apt8PreviewPageProps extends PageProps {
    app: ApproachProcedure,
    iaf: ApproachTransition | null,
    legs: KLNFlightplanLeg[],
    load: (app: ApproachProcedure, iaf: ApproachTransition | null, legs: KLNFlightplanLeg[]) => void,
}


type Apt8PreviewPageTypes = {
    list: LastItemAlwaysVisibleList,
    load: Button,
}

class Apt8PreviewPage extends Apt8SelectorPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt8PreviewPageTypes>;

    public readonly app: ApproachProcedure;
    public readonly iaf: ApproachTransition | null;

    constructor(props: Apt8PreviewPageProps) {
        super(props);
        this.app = props.app;
        this.iaf = props.iaf;

        this.children = new UIElementChildren<Apt8PreviewPageTypes>({
            list: new LastItemAlwaysVisibleList(this.buildList(props.legs), 4),
            load: new Button("LOAD IN FPL", () => props.load(props.app, props.iaf, props.legs)),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }


    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            {this.children.get("list").render()}
            {this.children.get("load").render()}
        </pre>);
    }

    private buildList(legs: KLNFlightplanLeg[]): UIElementChildren<any> {
        const waypoints = legs.map((leg, idx) => new SimpleListItem<KLNFlightplanLeg>({
            bus: this.props.bus,
            value: leg,
            fulltext: `${(idx + 1).toString().padStart(2, " ")} ${ICAO.getIdent(leg.wpt.icao)}${SidStar.getWptSuffix(leg.fixType)}`.padEnd(11, " "), //6-10 the prefix is right after short identifiers
        }));

        return UIElementChildren.forList(waypoints);
    }


}


interface Apt8AddPageProps extends PageProps {
    app: ApproachProcedure,
    iaf: ApproachTransition | null,
    legs: KLNFlightplanLeg[],
    load: (app: ApproachProcedure, iaf: ApproachTransition | null, legs: KLNFlightplanLeg[]) => void,
}


type Apt8AddPageTypes = {
    approve: Button,
}


class Apt8AddPage extends Apt8SelectorPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt8AddPageTypes>;

    public readonly app: ApproachProcedure;
    public readonly iaf: ApproachTransition | null;
    public readonly legs: KLNFlightplanLeg[];

    constructor(props: Apt8AddPageProps) {
        super(props);
        this.app = props.app;
        this.iaf = props.iaf;
        this.legs = props.legs;

        this.children = new UIElementChildren<Apt8AddPageTypes>({
            approve: new Button("  APPROVE? ", () => props.load(props.app, props.iaf, props.legs)),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }


    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            PRESS ENT<br/>
            TO ADD {ICAO.getIdent(unpackFacility(this.facility)!.icao)}<br/>
            AND APPR TO<br/>
            FPL 0<br/>
            {this.children.get("approve").render()}
        </pre>);
    }

}