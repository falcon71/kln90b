import {
    AirportFacility,
    ApproachTransition,
    ArrivalProcedure,
    DepartureProcedure, EnrouteTransition,
    FSComponent,
    ICAO,
    NodeReference,
    Procedure,
    RunwayTransition,
    RunwayUtils,
    VNode,
} from '@microsoft/msfs-sdk';
import {PageProps, UIElementChildren} from "../Page";
import {CursorController, NO_CURSOR_CONTROLLER} from "../CursorController";
import {AirportSelector} from "../../controls/selects/AirportSelector";
import {isNearestWpt, unpackFacility, WaypointPage} from "./WaypointPage";
import {WaypointPageState} from "../../data/VolatileMemory";
import {CreateWaypointMessage} from "../../controls/selects/CreateWaypointMessage";
import {Apt1Page} from "./Apt1Page";
import {StatusLineMessageEvents} from "../../controls/StatusLine";
import {Scanlist} from "../../data/navdata/Scanlist";
import {AirportNearestList} from "../../data/navdata/NearestList";
import {ActiveArrow} from "../../controls/displays/ActiveArrow";
import {LastItemAlwaysVisibleList} from "../../controls/List";
import {SimpleListItem} from "../../controls/ListItem";
import {Button} from "../../controls/Button";
import {MainPage} from "../MainPage";
import {Fpl0Page} from "../left/FplPage";
import {KLNFlightplanLeg, KLNLegType} from "../../data/flightplan/Flightplan";
import {OneTimeMessage} from "../../data/MessageHandler";
import {TextDisplay} from "../../controls/displays/TextDisplay";
import {NearestSelector} from "../../controls/selects/NearestSelector";
import {SidStar} from "../../data/navdata/SidStar";
import {insertLegIntoFpl} from "../../services/FlightplanUtils";


export interface Apt7PageProps extends PageProps {
    type: KLNLegType,
}


type Apt7PageTypes = {
    page: WaypointPage<AirportFacility>,
}

/**
 * 3-49, 6-4
 *
 * Yes, it is impossible not to select an approach transition!
 */
export class Apt7Page extends WaypointPage<AirportFacility> {

    readonly children: UIElementChildren<Apt7PageTypes>;
    readonly name: string = "APT 7";
    protected cursorController = NO_CURSOR_CONTROLLER;
    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private currentApt7Page: WaypointPage<AirportFacility>;

    private hasSid: boolean = false;
    private hasStar: boolean = false;

    constructor(props: PageProps) {
        super(props);

        if (this.props.scanLists.aptScanlist.isEmpty()) {
            props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO APT WPTS");
        }

        this.refreshPageInformation();

        this.currentApt7Page = new Apt7ProcedurePage({
            ...props,
            selectProcedure: this.selectProcedure.bind(this),
            type: this.getProcedureType(),
        });


        this.children = new UIElementChildren<Apt7PageTypes>({
            page: this.currentApt7Page,
        });

    }

    public render(): VNode {
        return (<div ref={this.ref}>
            {this.currentApt7Page.render()}
        </div>);
    }

    public setCurrentPage(page: number): void {
        super.setCurrentPage(page);

        this.currentApt7Page = new Apt7ProcedurePage({
            ...this.props,
            selectProcedure: this.selectProcedure.bind(this),
            type: this.getProcedureType(),
        });
        this.requiresRedraw = true;
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.refreshPageInformation();
        this.currentApt7Page = new Apt7ProcedurePage({
            ...this.props,
            selectProcedure: this.selectProcedure.bind(this),
            type: this.getProcedureType(),
        });
        this.requiresRedraw = true;
    }

    public clear(): boolean {
        const type = this.getProcedureType();

        let step: number = 0;
        let proc: Procedure;
        let rwy: RunwayTransition | null;
        let trans: EnrouteTransition | null;
        let legs: KLNFlightplanLeg[];
        //The order RWY/TRANS is different for SID & STAR
        if (this.currentApt7Page instanceof Apt7ProcedurePage) {
            return false;
        } else if (this.currentApt7Page instanceof Apt7RunwayPage) {
            proc = this.currentApt7Page.proc;
            rwy = null;
            trans = this.currentApt7Page.trans;
            if (type === KLNLegType.SID) {
                step = 1;
            } else {
                step = 2;
            }
        } else if (this.currentApt7Page instanceof Apt7TransitionPage) {
            proc = this.currentApt7Page.proc;
            rwy = this.currentApt7Page.rwy;
            trans = null;
            if (type === KLNLegType.SID) {
                step = 2;
            } else {
                step = 1;
            }
        } else if (this.currentApt7Page instanceof Apt7PreviewPage) {
            proc = this.currentApt7Page.proc;
            rwy = this.currentApt7Page.rwy;
            trans = this.currentApt7Page.trans;
            step = 3;
        } else if (this.currentApt7Page instanceof Apt7AddPage) {
            proc = this.currentApt7Page.proc;
            rwy = this.currentApt7Page.rwy;
            trans = this.currentApt7Page.trans;
            legs = this.currentApt7Page.legs;
            step = 4;
        } else {
            throw Error(`Unexpected page: ${this.currentApt7Page}`);
        }

        step--;
        if (step === 2) {
            if (type === KLNLegType.SID) {
                if (proc.enRouteTransitions.length <= 1) {
                    step--;
                }
            } else {
                if (proc.runwayTransitions.length <= 1) {
                    step--;
                }
            }
        }

        if (step === 1) {
            if (type === KLNLegType.SID) {
                if (proc.runwayTransitions.length <= 1) {
                    step--;
                }
            } else {
                if (proc.enRouteTransitions.length <= 1) {
                    step--;
                }
            }
        }

        switch (step) {
            case 0:
                this.currentApt7Page = new Apt7ProcedurePage({
                    ...this.props,
                    selectProcedure: this.selectProcedure.bind(this),
                    type: type,
                });
                break;
            case 1:
                if (type === KLNLegType.SID) {
                    this.currentApt7Page = new Apt7RunwayPage({
                        ...this.props,
                        proc: proc,
                        trans: trans,
                        selectRunway: this.selectRunway.bind(this),
                        type: type,
                    });
                } else {
                    this.currentApt7Page = new Apt7TransitionPage({
                        ...this.props,
                        proc: proc,
                        rwy: rwy,
                        selectTransition: this.selectTransition.bind(this),
                        type: type,
                    });
                }
                break;
            case 2:
                if (type === KLNLegType.SID) {
                    this.currentApt7Page = new Apt7TransitionPage({
                        ...this.props,
                        proc: proc,
                        rwy: rwy,
                        selectTransition: this.selectTransition.bind(this),
                        type: type,
                    });
                } else {
                    this.currentApt7Page = new Apt7RunwayPage({
                        ...this.props,
                        proc: proc,
                        trans: trans,
                        selectRunway: this.selectRunway.bind(this),
                        type: type,
                    });
                }
                break;
            case 4:
                this.currentApt7Page = new Apt7PreviewPage({
                    ...this.props,
                    proc: proc,
                    rwy: rwy,
                    trans: trans,
                    legs: legs!,
                    load: this.loadIfFplContainsApt.bind(this),
                    type: type,
                });
                break;
        }

        this.requiresRedraw = true;
        return true;
    }

    public getCursorController(): CursorController {
        return this.currentApt7Page.getCursorController();
    }

    protected redraw(): void {
        this.children.set("page", this.currentApt7Page);
        this.ref.instance.innerHTML = "";
        FSComponent.render(this.currentApt7Page.render(), this.ref.instance);
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    private refreshPageInformation() {
        const facility = unpackFacility(this.facility);
        if (facility === null) {
            this.numPages = 1;
            this.hasSid = false;
            this.hasStar = false;
        } else {
            this.hasSid = facility.departures.length > 0;
            this.hasStar = facility.arrivals.length > 0;
            this.numPages = this.hasSid && this.hasStar ? 2 : 1;
        }
        this.currentPage = 0;
    }

    private getProcedureType(): KLNLegType {
        if (this.hasStar && (this.currentPage === 1 || !this.hasSid)) {
            return KLNLegType.STAR;
        } else {
            return KLNLegType.SID;
        }
    }

    private selectProcedure(proc: Procedure): void {
        console.log("selectProcedure", proc);

        if (this.getProcedureType() === KLNLegType.SID) {
            if (proc.runwayTransitions.length <= 1) {
                this.selectRunway(proc, proc.runwayTransitions.length === 1 ? proc.runwayTransitions[0] : null, null)
            } else {
                this.currentApt7Page = new Apt7RunwayPage({
                    ...this.props,
                    proc: proc,
                    trans: null,
                    selectRunway: this.selectRunway.bind(this),
                    type: this.getProcedureType(),
                });
            }
        } else {
            if (proc.enRouteTransitions.length <= 1) {
                this.selectTransition(proc, null, proc.enRouteTransitions.length === 1 ? proc.enRouteTransitions[0] : null)
            } else {
                this.currentApt7Page = new Apt7TransitionPage({
                    ...this.props,
                    proc: proc,
                    rwy: null,
                    selectTransition: this.selectTransition.bind(this),
                    type: this.getProcedureType(),
                });
            }
        }
        this.requiresRedraw = true;
    }

    private async selectRunway(proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null): Promise<void> {
        console.log("selectRunway", proc, rwy);

        if (this.getProcedureType() === KLNLegType.SID) {
            if (proc.enRouteTransitions.length <= 1) {
                return this.selectTransition(proc, rwy, proc.enRouteTransitions.length === 1 ? proc.enRouteTransitions[0] : null)
            } else {
                this.currentApt7Page = new Apt7TransitionPage({
                    ...this.props,
                    proc: proc,
                    rwy: rwy,
                    selectTransition: this.selectTransition.bind(this),
                    type: this.getProcedureType(),
                });
            }
        } else {
            const legs = await this.props.sidstar.getKLNProcedureLegList(unpackFacility(this.facility)!, proc, this.getProcedureType(), rwy, trans);
            this.currentApt7Page = new Apt7PreviewPage({
                ...this.props,
                proc: proc,
                rwy: rwy,
                trans: trans,
                legs: legs,
                load: this.loadIfFplContainsApt.bind(this),
                type: this.getProcedureType(),
            });
        }
        this.requiresRedraw = true;
    }

    private async selectTransition(proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null): Promise<void> {
        console.log("selectTransition", proc, rwy, trans);

        if (this.getProcedureType() === KLNLegType.SID) {
            const legs = await this.props.sidstar.getKLNProcedureLegList(unpackFacility(this.facility)!, proc, this.getProcedureType(), rwy, trans);
            this.currentApt7Page = new Apt7PreviewPage({
                ...this.props,
                proc: proc,
                rwy: rwy,
                trans: trans,
                legs: legs,
                load: this.loadIfFplContainsApt.bind(this),
                type: this.getProcedureType(),
            });
        } else {
            if (proc.runwayTransitions.length <= 1) {
                return this.selectRunway(proc, proc.runwayTransitions.length === 1 ? proc.runwayTransitions[0] : null, trans)
            } else {
                this.currentApt7Page = new Apt7RunwayPage({
                    ...this.props,
                    proc: proc,
                    trans: trans,
                    selectRunway: this.selectRunway.bind(this),
                    type: this.getProcedureType(),
                });
            }
        }
        this.requiresRedraw = true;
    }

    private loadIfFplContainsApt(proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null, legs: KLNFlightplanLeg[]): void {
        console.log("loadIfFplContainsApt", proc, rwy, trans, legs);
        const fpl0Legs = this.props.memory.fplPage.flightplans[0].getLegs();
        const facility = unpackFacility(this.facility)!;

        if (fpl0Legs.some(wpt => wpt.wpt.icao === facility.icao)) {
            this.load(proc, rwy, trans, legs);
            return;
        }

        this.currentApt7Page = new Apt7AddPage({
            ...this.props,
            proc: proc,
            rwy: rwy,
            trans: trans,
            legs: legs,
            load: this.load.bind(this),
            type: this.getProcedureType(),
        });
        this.requiresRedraw = true;

    }

    private load(proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null, legs: KLNFlightplanLeg[]): void {
        console.log("load", proc, rwy, trans, legs);

        const type = this.getProcedureType();

        const fpl0 = this.props.memory.fplPage.flightplans[0];
        fpl0.removeProcedure(type); //I don't think you can have two approaches at the same time
        const fpl0Legs = fpl0.getLegs();
        const facility = unpackFacility(this.facility)!;
        let idx = fpl0Legs.findIndex(wpt => wpt.wpt.icao === facility.icao);
        if (idx === -1) {
            idx = type === KLNLegType.SID ? 0 : fpl0Legs.length;

            try {
                insertLegIntoFpl(fpl0, this.props.memory.navPage, idx, {wpt: facility, type: KLNLegType.USER});
            } catch (e) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL");
                console.error(e);
                return;
            }
        }
        if (type === KLNLegType.SID) {
            //After the airport
            idx++;
        } else {
            //We want to insert the start before the APP
            while (idx > 0 && fpl0Legs[idx - 1].type === KLNLegType.APP) {
                idx--;
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
                return;
            }
        }

        this.currentApt7Page = new Apt7ProcedurePage({
            ...this.props,
            selectProcedure: this.selectProcedure.bind(this),
            type: this.getProcedureType(),
        });
        this.requiresRedraw = true;


        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.setLeftPage(new Fpl0Page(this.props));
    }
}

interface Apt7ProcedurePageProps extends PageProps {
    selectProcedure: (proc: ArrivalProcedure | DepartureProcedure) => void,
    type: KLNLegType,
}

type Apt7ProcedurePageTypes = {
    activeArrow: ActiveArrow,
    activeIdx: TextDisplay,
    apt: AirportSelector,
    waypointType: TextDisplay,
    nearestSelector: NearestSelector,

    list: LastItemAlwaysVisibleList,

    createWpt: CreateWaypointMessage,
}

/**
 * 3-49, 6-4
 */
class Apt7ProcedurePage extends WaypointPage<AirportFacility> {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt7ProcedurePageTypes>;

    readonly name: string = "APT 7";

    protected readonly mainRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    protected readonly emptyRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    protected readonly listRef: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();
    private readonly selectProcedure: (proc: ArrivalProcedure | DepartureProcedure) => void;
    private readonly procedureType: KLNLegType;

    constructor(props: Apt7ProcedurePageProps) {
        super(props);
        this.selectProcedure = props.selectProcedure;
        this.procedureType = props.type;

        const facility = unpackFacility(this.facility);


        this.children = new UIElementChildren<Apt7ProcedurePageTypes>({
            activeArrow: new ActiveArrow(facility?.icao ?? null, this.props.memory.navPage),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, this.changeFacility.bind(this)),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(isNearestWpt(this.facility) ? this.facility.index : -1),
            list: new LastItemAlwaysVisibleList(UIElementChildren.forList([]), 4),
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
                <div ref={this.emptyRef}>
                    NO SID/STAR<br/>
                    FOR THIS<br/>
                    AIRPORT<br/>
                    IN DATABASE
                </div>
                <div ref={this.listRef} class="d-none">
                    SELECT {this.procedureType === KLNLegType.SID ? "SID" : "STAR"}<br/>
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
        this.children.get("nearestSelector").setValue(isNearestWpt(this.facility) ? this.facility.index : -1);
        if (facility === null) {
            this.mainRef.instance.classList.add("d-none");
            this.children.get("createWpt").setVisible(true);
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);
            const procedures: readonly Procedure[] = this.procedureType === KLNLegType.SID ? facility.departures : facility.arrivals;
            const procs = procedures.filter(SidStar.isProcedureRecognized).map((proc, idx) => new SimpleListItem<Procedure>({
                bus: this.props.bus,
                value: proc,
                fulltext: (idx + 1).toString().padStart(2, " ") + " " + proc.name.padEnd(7, " "),
                onEnter: this.selectProcedure,
            }));
            if (procs.length === 0) {
                this.emptyRef.instance.classList.remove("d-none");
                this.listRef.instance.classList.add("d-none");
            } else {
                this.emptyRef.instance.classList.add("d-none");
                this.listRef.instance.classList.remove("d-none");
                this.children.get("list").refresh(UIElementChildren.forList(procs));
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
}

abstract class Apt7SelectorPage extends WaypointPage<AirportFacility> {


    readonly name: string = "APT 7";
    public abstract readonly proc: Procedure;
    protected abstract readonly procedureType: KLNLegType;

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    protected formatTitle(): string {
        return `${this.proc.name}-${this.procedureType === KLNLegType.SID ? "SID" : "Æ"}`;
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

}


interface Apt7RunwayPageProps extends PageProps {
    proc: Procedure,
    trans: EnrouteTransition | null,
    selectRunway: (proc: Procedure, rwy: RunwayTransition, trans: EnrouteTransition | null) => void,
    type: KLNLegType,
}


type Apt7RunwayPageTypes = {
    list: LastItemAlwaysVisibleList,
}

class Apt7RunwayPage extends Apt7SelectorPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt7RunwayPageTypes>;

    public readonly proc: Procedure;
    public readonly trans: EnrouteTransition | null;
    protected readonly procedureType: KLNLegType;
    private readonly selectRunway: (proc: Procedure, rwy: RunwayTransition, trans: (EnrouteTransition | null)) => void;

    constructor(props: Apt7RunwayPageProps) {
        super(props);
        this.proc = props.proc;
        this.procedureType = props.type;
        this.trans = props.trans;
        this.selectRunway = props.selectRunway;

        this.children = new UIElementChildren<Apt7RunwayPageTypes>({
            list: new LastItemAlwaysVisibleList(this.buildList(), 4),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            RUNWAY<br/>
            {this.children.get("list").render()}
        </pre>);
    }

    private buildList(): UIElementChildren<any> {
        const rwys = this.proc.runwayTransitions.map((rwy, idx) => new SimpleListItem<RunwayTransition>({
            bus: this.props.bus,
            value: rwy,
            fulltext: (idx + 1).toString().padStart(2, " ") + " " + RunwayUtils.getRunwayNameString(rwy.runwayNumber, rwy.runwayDesignation, true).padEnd(5, " "),
            onEnter: (rwy) => this.selectRunway(this.proc, rwy, this.trans),
        }));

        return UIElementChildren.forList(rwys);
    }

}

interface Apt7TransitionPageProps extends PageProps {
    proc: Procedure,
    rwy: RunwayTransition | null,
    selectTransition: (proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null) => void,
    type: KLNLegType,
}


type Apt7TransitionPageTypes = {
    list: LastItemAlwaysVisibleList,
}

class Apt7TransitionPage extends Apt7SelectorPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt7TransitionPageTypes>;

    public readonly proc: Procedure;
    public readonly rwy: RunwayTransition | null;
    protected readonly procedureType: KLNLegType;
    private readonly selectTransition: (proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null) => void;

    constructor(props: Apt7TransitionPageProps) {
        super(props);
        this.proc = props.proc;
        this.rwy = props.rwy;
        this.procedureType = props.type;
        this.selectTransition = props.selectTransition;

        this.children = new UIElementChildren<Apt7TransitionPageTypes>({
            list: new LastItemAlwaysVisibleList(this.buildList(), 4),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }

    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            TRANSITION<br/>
            {this.children.get("list").render()}
        </pre>);
    }

    private buildList(): UIElementChildren<any> {
        const iafs = this.proc.enRouteTransitions.map((trans, idx) => new SimpleListItem<ApproachTransition>({
            bus: this.props.bus,
            value: trans,
            fulltext: (idx + 1).toString().padStart(2, " ") + " " + trans.name.padEnd(5, " "),
            onEnter: (trans) => this.selectTransition(this.proc, this.rwy, trans),
        }));

        return UIElementChildren.forList(iafs);
    }

}


interface Apt7PreviewPageProps extends PageProps {
    proc: Procedure,
    rwy: RunwayTransition | null,
    trans: EnrouteTransition | null,
    legs: KLNFlightplanLeg[],
    load: (proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null, legs: KLNFlightplanLeg[]) => void,
    type: KLNLegType,
}


type Apt7PreviewPageTypes = {
    list: LastItemAlwaysVisibleList,
    load: Button,
}

class Apt7PreviewPage extends Apt7SelectorPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt7PreviewPageTypes>;

    public readonly proc: Procedure;
    public readonly rwy: RunwayTransition | null;
    public readonly trans: EnrouteTransition | null;
    protected readonly procedureType: KLNLegType;

    constructor(props: Apt7PreviewPageProps) {
        super(props);
        this.proc = props.proc;
        this.rwy = props.rwy;
        this.trans = props.trans;
        this.procedureType = props.type;

        this.children = new UIElementChildren<Apt7PreviewPageTypes>({
            list: new LastItemAlwaysVisibleList(this.buildList(props.legs), 4),
            load: new Button("LOAD IN FPL", () => props.load(props.proc, props.rwy, props.trans, props.legs)),
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


interface Apt7AddPageProps extends PageProps {
    proc: Procedure,
    rwy: RunwayTransition | null,
    trans: EnrouteTransition | null,
    legs: KLNFlightplanLeg[],
    load: (proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null, legs: KLNFlightplanLeg[]) => void,
    type: KLNLegType,
}


type Apt7AddPageTypes = {
    approve: Button,
}


class Apt7AddPage extends Apt7SelectorPage {

    public readonly cursorController;
    readonly children: UIElementChildren<Apt7AddPageTypes>;

    public readonly proc: Procedure;
    public readonly rwy: RunwayTransition | null;
    public readonly trans: EnrouteTransition | null;
    public readonly legs: KLNFlightplanLeg[];
    protected readonly procedureType: KLNLegType;

    constructor(props: Apt7AddPageProps) {
        super(props);
        this.proc = props.proc;
        this.rwy = props.rwy;
        this.trans = props.trans;
        this.legs = props.legs;
        this.procedureType = props.type;

        this.children = new UIElementChildren<Apt7AddPageTypes>({
            approve: new Button("  APPROVE? ", () => props.load(props.proc, props.rwy, props.trans, props.legs)),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setCursorActive(true);
    }


    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            PRESS ENT<br/>
            TO ADD {ICAO.getIdent(unpackFacility(this.facility)!.icao)}<br/>
            AND {this.procedureType === KLNLegType.SID ? "SID" : "STAR"} TO<br/>
            FPL 0<br/>
            {this.children.get("approve").render()}
        </pre>);
    }

}