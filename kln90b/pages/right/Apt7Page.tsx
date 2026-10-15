import {
    AirportFacility,
    ApproachTransition,
    ArrivalProcedure,
    DepartureProcedure,
    EnrouteTransition,
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
import {unpackFacility, WaypointPage} from "./WaypointPage";
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
            changeFacility: this.changeFacility.bind(this),
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
            changeFacility: this.changeFacility.bind(this),
        });
        this.requiresRedraw = true;
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    public changeFacility(fac: string | AirportFacility) {
        super.changeFacility(fac);
        this.refreshPageInformation();
        if (this.currentApt7Page instanceof Apt7ProcedurePage) {
            this.currentApt7Page.setProcedureType(this.getProcedureType());
        } else {
            this.currentApt7Page = new Apt7ProcedurePage({
                ...this.props,
                selectProcedure: this.selectProcedure.bind(this),
                type: this.getProcedureType(),
                changeFacility: this.changeFacility.bind(this),
            });
        }
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
            throw new Error(`Unexpected page: ${this.currentApt7Page}`);
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
            //Each list gets the entry chosen there before, so that the cursor comes back on it (#273). The page we come
            //from carries that entry: a runway page carries the transition chosen before it and no runway, a transition
            //page the runway chosen before it and no transition, and the preview and add pages carry both. So the runway
            //list takes `rwy` and the transition list takes `trans`, wherever we come from: for a SID the runway list
            //comes first, for a STAR the transition list.
            case 0:
                this.currentApt7Page = new Apt7ProcedurePage({
                    ...this.props,
                    selectProcedure: this.selectProcedure.bind(this),
                    type: type,
                    changeFacility: this.changeFacility.bind(this),
                    selected: proc,
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
                        selected: rwy,
                    });
                } else {
                    this.currentApt7Page = new Apt7TransitionPage({
                        ...this.props,
                        proc: proc,
                        rwy: rwy,
                        selectTransition: this.selectTransition.bind(this),
                        type: type,
                        selected: trans,
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
                        selected: trans,
                    });
                } else {
                    this.currentApt7Page = new Apt7RunwayPage({
                        ...this.props,
                        proc: proc,
                        trans: trans,
                        selectRunway: this.selectRunway.bind(this),
                        type: type,
                        selected: rwy,
                    });
                }
                break;
            case 3:
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
            this.hasSid = facility.departures.some(proc => SidStar.isProcedureRecognized(proc));
            this.hasStar = facility.arrivals.some(proc => SidStar.isProcedureRecognized(proc));
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

        if (fpl0Legs.some(wpt => ICAO.valueEquals(wpt.wpt.icaoStruct, facility.icaoStruct))) {
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
        fpl0.startBatchInsert();
        fpl0.removeProcedure(type); //I don't think you can have two approaches at the same time
        const fpl0Legs = fpl0.getLegs();
        const facility = unpackFacility(this.facility)!;
        let idx = fpl0Legs.findIndex(wpt => ICAO.valueEquals(wpt.wpt.icaoStruct, facility.icaoStruct));
        if (idx === -1) {
            //Airport not in FPL?
            idx = type === KLNLegType.SID ? 0 : fpl0Legs.length;

            try {
                insertLegIntoFpl(fpl0, this.props.memory.navPage, idx, {wpt: facility, type: KLNLegType.USER});
            } catch (e) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL");
                console.error(e);
                fpl0.finishBatchInsert();
                return;
            }
        }
        if (type === KLNLegType.SID) {
            //After the airport
            idx++;
        } else {
            //We want to insert the STAR before the APP
            while (idx > 0 && fpl0Legs[idx - 1].type === KLNLegType.APP) {
                idx--;
            }
        }

        // 6-5, B-3: only the enroute waypoints count, not the legs of a procedure that is already loaded
        if (SidStar.hasDuplicates(fpl0Legs.filter(leg => leg.type === KLNLegType.USER), legs)) {
            this.props.messageHandler.addMessage(new OneTimeMessage(["REDUNDANT WPTS IN FPL", "EDIT ENROUTE WPTS", "AS NECESSARY"]));
        }

        for (const leg of legs) {
            try {
                insertLegIntoFpl(fpl0, this.props.memory.navPage, idx, leg);
                idx++;
            } catch (e) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL");
                console.error(e);
                fpl0.finishBatchInsert();
                return;
            }
        }
        fpl0.finishBatchInsert();

        this.currentApt7Page = new Apt7ProcedurePage({
            ...this.props,
            selectProcedure: this.selectProcedure.bind(this),
            type: this.getProcedureType(),
            changeFacility: this.changeFacility.bind(this),
        });
        this.requiresRedraw = true;


        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        mainPage.setLeftPage(new Fpl0Page(this.props));
    }
}

interface Apt7ProcedurePageProps extends PageProps {
    selectProcedure: (proc: ArrivalProcedure | DepartureProcedure) => void,
    type: KLNLegType,
    changeFacility: (fac: string | AirportFacility) => void,
    /** The procedure chosen on this list before, when CLR comes back to it: the cursor comes on there (#273) */
    selected?: Procedure | null,
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
    private procedureType: KLNLegType;
    private pendingSelected: Procedure | null;
    private suppressDbWarning: boolean = false;

    constructor(props: Apt7ProcedurePageProps) {
        super(props);
        this.selectProcedure = props.selectProcedure;
        this.procedureType = props.type;
        this.pendingSelected = props.selected ?? null;

        const facility = unpackFacility(this.facility);


        this.children = new UIElementChildren<Apt7ProcedurePageTypes>({
            activeArrow: new ActiveArrow(facility?.icaoStruct ?? null, this.props.memory.navPage, this.getActiveArrowFplIdx()),
            activeIdx: new TextDisplay(this.getActiveIdxText()),
            apt: new AirportSelector(this.props.bus, this.ident, this.props.facilityLoader, (fac) => {
                props.changeFacility(fac); //Normally, only this.changeFacility would be called. But we also need to inform the parent, so it can calculate the number of pages correctly and set the correct procedure type
                this.changeFacility(fac);
            }),
            waypointType: new TextDisplay(this.activeIdx === -1 ? "" : "A"),
            nearestSelector: new NearestSelector(this.facility),
            list: new LastItemAlwaysVisibleList(UIElementChildren.forList([]), 4),
            createWpt: new CreateWaypointMessage(() => Apt1Page.createAtUserPosition(props), () => Apt1Page.createAtPresentPosition(props)),
        });

        if (this.activeIdx !== -1) {
            this.children.get("apt").setReadonly(true);
        }

        this.cursorController = new CursorController(this.children, this.warnIfDBOutdated.bind(this));
        this.cursorController.setStartFieldProvider(() => this.children.get("list").topVisibleField());

    }
    public render(): VNode {
        this.requiresRedraw = true;
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

    private warnIfDBOutdated(cursorActive: boolean) {
        // Based on the KLN 89 trainer, this message is also shown on the APT 7 pages
        // It is shown every time the cursor is activated (even for airports without procedures),
        // but procedures can still be selected
        // A CLR step back puts the cursor on again, but it was on before, so it is not a new CRSR press (#273)
        if (cursorActive && !this.suppressDbWarning && !this.props.database.isAiracCurrent()) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "OUTDATED DB");
        }
    }

    public getScanlist(): Scanlist {
        return this.props.scanLists.aptScanlist;
    }

    public setProcedureType(procedureType: KLNLegType) {
        this.procedureType = procedureType;
    }

    protected getMemory(): WaypointPageState<AirportFacility> {
        return this.props.memory.aptPage;
    }

    protected getNearestList(): AirportNearestList {
        return this.props.nearestLists.aptNearestList;
    }

    protected redraw(): void {
        const facility = unpackFacility(this.facility);
        let selectedItem: SimpleListItem<Procedure> | null = null;
        this.children.get("nearestSelector").setFacility(this.facility);
        if (facility === null) {
            this.mainRef.instance.classList.add("d-none");
            this.children.get("createWpt").setVisible(true);
            this.cursorController.setDefaultCursorField(0);
        } else {
            this.mainRef.instance.classList.remove("d-none");
            this.children.get("createWpt").setVisible(false);
            const procedures: readonly Procedure[] = this.procedureType === KLNLegType.SID ? facility.departures : facility.arrivals;
            const recognized = procedures.filter(proc => SidStar.isProcedureRecognized(proc));
            const procs = recognized.map((proc, idx) => new SimpleListItem<Procedure>({
                bus: this.props.bus,
                value: proc,
                fulltext: (idx + 1).toString().padStart(2, " ") + " " + proc.name.padEnd(7, " "),
                onEnter: this.selectProcedure,
            }));
            if (procs.length === 0) {
                this.cursorController.setDefaultCursorField(0);
                this.emptyRef.instance.classList.remove("d-none");
                this.listRef.instance.classList.add("d-none");
            } else {
                this.cursorController.setDefaultCursorField(this.activeIdx === -1 ? 4 : 0); //6-4 is proof that this is done on the APT 8 page. The APT 7 page is likely the same
                this.emptyRef.instance.classList.add("d-none");
                this.listRef.instance.classList.remove("d-none");
                this.children.get("list").refresh(UIElementChildren.forList(procs));
                selectedItem = this.pendingSelected === null ? null : procs[recognized.indexOf(this.pendingSelected)] ?? null;
            }
        }

        this.cursorController.refreshChildren(this.children);

        if (this.pendingSelected !== null) {
            if (selectedItem !== null) {
                //CLR back to this list keeps the cursor on, on the procedure chosen before. Checked in the KLN 89
                //trainer, 2026-10-07 (medium) (#273). The fields exist only now, so the focus is set by the field and
                //not by an index
                this.suppressDbWarning = true;
                this.cursorController.setCursorActive(true);
                this.suppressDbWarning = false;
                this.cursorController.focusField(selectedItem);
            }
            this.pendingSelected = null;
        }
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
    /** The runway chosen on this list before, when CLR comes back to it: the cursor comes on there (#273) */
    selected?: RunwayTransition | null,
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
    private selectedItem: SimpleListItem<RunwayTransition> | null = null;

    constructor(props: Apt7RunwayPageProps) {
        super(props);
        this.proc = props.proc;
        this.procedureType = props.type;
        this.trans = props.trans;
        this.selectRunway = props.selectRunway;

        this.children = new UIElementChildren<Apt7RunwayPageTypes>({
            list: new LastItemAlwaysVisibleList(this.buildList(props.selected ?? null), 4),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setStartFieldProvider(() => this.children.get("list").topVisibleField()); //T23: the top visible entry of a scrolled list (#355)
        this.cursorController.setCursorActive(true);
        if (this.selectedItem !== null) {
            //CLR back to this list keeps the cursor on the entry chosen before, checked in the KLN 89 trainer (2026-10-07,
            //medium; this list by analogy) (#273)
            this.cursorController.focusField(this.selectedItem);
        }
    }

    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            RUNWAY<br/>
            {this.children.get("list").render()}
        </pre>);
    }

    private buildList(selected: RunwayTransition | null): UIElementChildren<any> {
        const recognized = this.proc.runwayTransitions.filter(runwayTransition => SidStar.isProcedureRecognized(this.proc, runwayTransition, this.trans));
        const rwys = recognized.map((rwy, idx) => new SimpleListItem<RunwayTransition>({
            bus: this.props.bus,
            value: rwy,
            fulltext: (idx + 1).toString().padStart(2, " ") + " " + RunwayUtils.getRunwayNameString(rwy.runwayNumber, rwy.runwayDesignation, true, "RW").padEnd(5, " "),
            onEnter: (rwy) => this.selectRunway(this.proc, rwy, this.trans),
        }));
        this.selectedItem = selected === null ? null : rwys[recognized.indexOf(selected)] ?? null;

        return UIElementChildren.forList(rwys);
    }

}

interface Apt7TransitionPageProps extends PageProps {
    proc: Procedure,
    rwy: RunwayTransition | null,
    selectTransition: (proc: Procedure, rwy: RunwayTransition | null, trans: EnrouteTransition | null) => void,
    type: KLNLegType,
    /** The transition chosen on this list before, when CLR comes back to it: the cursor comes on there (#273) */
    selected?: EnrouteTransition | null,
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
    private selectedItem: SimpleListItem<ApproachTransition> | null = null;

    constructor(props: Apt7TransitionPageProps) {
        super(props);
        this.proc = props.proc;
        this.rwy = props.rwy;
        this.procedureType = props.type;
        this.selectTransition = props.selectTransition;

        this.children = new UIElementChildren<Apt7TransitionPageTypes>({
            list: new LastItemAlwaysVisibleList(this.buildList(props.selected ?? null), 4),
        });

        this.cursorController = new CursorController(this.children);
        this.cursorController.setStartFieldProvider(() => this.children.get("list").topVisibleField()); //T23: the top visible entry of a scrolled list (#355)
        this.cursorController.setCursorActive(true);
        if (this.selectedItem !== null) {
            //CLR back to this list keeps the cursor on the entry chosen before, checked in the KLN 89 trainer (2026-10-07,
            //medium; this list by analogy) (#273)
            this.cursorController.focusField(this.selectedItem);
        }
    }

    public render(): VNode {
        return (<pre>
            {this.formatTitle()}<br/>
            TRANSITION<br/>
            {this.children.get("list").render()}
        </pre>);
    }

    private buildList(selected: EnrouteTransition | null): UIElementChildren<any> {
        const recognized = this.proc.enRouteTransitions.filter(enrouteTransition => SidStar.isProcedureRecognized(this.proc, this.rwy, enrouteTransition));
        const iafs = recognized.map((trans, idx) => new SimpleListItem<ApproachTransition>({
            bus: this.props.bus,
            value: trans,
            fulltext: (idx + 1).toString().padStart(2, " ") + " " + trans.name.padEnd(5, " "),
            onEnter: (trans) => this.selectTransition(this.proc, this.rwy, trans),
        }));
        this.selectedItem = selected === null ? null : iafs[recognized.indexOf(selected)] ?? null;

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
        this.cursorController.setStartFieldProvider(() => this.children.get("list").topVisibleField()); //T23: the top visible entry of a scrolled list (#355)
        this.cursorController.setCursorActive(true);
        this.cursorController.focusIndex(props.legs.length); //LOAD IN FPL is preselected: https://youtu.be/idv2Hh6PQnw?t=487
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
            fulltext: `${(idx + 1).toString().padStart(2, " ")} ${leg.wpt.icaoStruct.ident}${SidStar.getWptSuffix(leg.fixType)}`.padEnd(11, " "), //6-10 the prefix is right after short identifiers
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
            TO ADD {unpackFacility(this.facility)!.icaoStruct.ident}<br/>
            AND {this.procedureType === KLNLegType.SID ? "SID" : "STAR"} TO<br/>
            FPL 0<br/>
            {this.children.get("approve").render()}
        </pre>);
    }

}