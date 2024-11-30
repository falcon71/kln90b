import {AirportFacility, Facility, FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {PageProps, UiElement, UIElementChildren} from '../pages/Page';
import {Flightplan, KLNFixType, KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {List} from "./List";
import {FlightplanListItem} from "./FlightplanListItem";
import {Button} from "./Button";
import {CursorController, EnterResult} from "../pages/CursorController";
import {ListItem} from "./ListItem";
import {SixLineHalfPage} from "../pages/FiveSegmentPage";
import {ActiveWaypoint} from "../data/flightplan/ActiveWaypoint";
import {StatusLineMessageEvents} from "./StatusLine";
import {TextDisplay} from "./displays/TextDisplay";
import {TickController} from "../TickController";
import {FlightplanArrow} from "./displays/FlightplanArrow";
import {NavPageState} from "../data/VolatileMemory";
import {MainPage} from "../pages/MainPage";
import {Apt8Page} from "../pages/right/Apt8Page";
import {Apt7Page} from "../pages/right/Apt7Page";
import {insertLegIntoFpl} from "../services/FlightplanUtils";

export const enum FplWptEnterMode {
    ROTATE_LEFT, //Rotate inner cursor
    ROTATE_RIGHT, //Rotate inner cursor
    ENTER, //Press enter (inserts WPT)
    CONFIRM, //ref page. Value is entered, must be confirmed
    KEYBOARD, //The user pressed a keyboard key
}

interface EditableFlightplanLeg {
    wpt: Facility | null,
    leg?: KLNFlightplanLeg,
    origIdx: number, //The actual index of this leg in the flightplan. -1 when it is a new waypoint not yet in the fpl
    enterMe?: FplWptEnterMode, //Causes the leg to be entered after creation
    enterKeyboardKey?: string,
    focusMe?: boolean,
}

type UseInvertButtonTypes = {
    use: Button,
    useInverted: Button,
}

/**
 * This one is tricky, because use and invert are both marked, when the cursor is over invert.
 * We do this by drawing the use buton with negative margin on top of the useInvert button.
 * The use button is then made invisible, when useInvert is focused, otherwise use would appear completely green.
 */
class UseInvertButton implements UiElement {
    public readonly children: UIElementChildren<UseInvertButtonTypes>;

    public isVisible = true;

    constructor(useFpl: () => void,
                useInvertedFpl: () => void) {

        this.children = new UIElementChildren<UseInvertButtonTypes>({
            use: new Button("USE?", useFpl),
            useInverted: new Button("USE? INVRT?", useInvertedFpl),
        })
    }

    public render(): VNode | null {
        return (<span>{this.children.get("useInverted").render()}<span
            class="use-invert">{this.children.get("use").render()}</span></span>);
    }

    public tick(blink: boolean): void {
        if (this.children.get("useInverted").isFocused) {
            this.children.get("use").isVisible = false; //A little dirty hack
        } else {
            this.children.get("use").isVisible = this.isVisible;
        }
    }

    public setVisible(visible: boolean) {
        this.isVisible = visible;
        this.children.get("use").setVisible(visible);
        this.children.get("useInverted").setVisible(visible);
    }

    public isItemFocused(): Boolean {
        return this.children.get("use").isFocused ||
            this.children.get("useInverted").isFocused;
    }
}


type FPLFirstLineTypes = {
    useInverted: UseInvertButton,
    del: Button,
    load0: Button,
}

class FPLFirstLine implements ListItem {
    public readonly children: UIElementChildren<FPLFirstLineTypes>;

    constructor(private cursorController: CursorController,
                private flightplan: Flightplan,
                loadFpl0: () => void,
                useFpl: () => void,
                useInvertedFpl: () => void,
                deleteFpl: () => void,
    ) {
        this.children = new UIElementChildren<FPLFirstLineTypes>({
            useInverted: new UseInvertButton(useFpl, useInvertedFpl),
            del: new Button("DELETE FPL?", deleteFpl, this.cancelDeleteAll.bind(this)),
            load0: new Button("LOAD FPL 0?", loadFpl0),
        });
        //Popping in looks better than popping out
        this.children.get("useInverted").setVisible(false);
        this.children.get("del").setVisible(false);
        this.children.get("load0").setVisible(false);
    }

    public render(): VNode | null {
        return (
            <span>{this.children.get("del").render()}{this.children.get("load0").render()}{this.children.get("useInverted").render()}</span>);
    }

    /**
     * Returns the number of active buttons
     */
    public refreshButtons(): number {
        if (this.flightplan.idx === 0) {
            this.children.get("useInverted").setVisible(false);
            this.children.get("del").setVisible(false);
            this.children.get("load0").setVisible(false);
            return 0;
        } else if (this.flightplan.getLegs().length === 0) {
            this.children.get("useInverted").setVisible(false);
            this.children.get("del").setVisible(false);
            this.children.get("load0").setVisible(true);
            return 1;
        } else {
            this.children.get("useInverted").setVisible(true);
            this.children.get("del").setVisible(false);
            this.children.get("load0").setVisible(false);
            return 1;
        }
    }

    public askDeleteAll() {
        this.children.get("useInverted").setVisible(false);
        this.children.get("del").setVisible(true);
        this.children.get("load0").setVisible(false);
    }

    public cancelDeleteAll() {
        this.refreshButtons();
        this.cursorController.setCursorActive(false);
    }

    public tick(blink: boolean): void {
    }


    public isItemFocused(): Boolean {
        return this.children.get("useInverted").isItemFocused() ||
            this.children.get("del").isFocused ||
            this.children.get("load0").isFocused;
    }
}

type ChangeProcedureListItemTypes = {
    arrow: FlightplanArrow
}

class ChangeProcedureListItem implements ListItem {
    readonly children: UIElementChildren<ChangeProcedureListItemTypes>;
    public isEntered = false;
    public isFocused = false;
    public isReadonly = false;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    protected readonly innerRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(cursorController: CursorController,
                private readonly wptIdx: number,
                private readonly facility: AirportFacility,
                private readonly type: KLNLegType,
                navState: NavPageState,
                private readonly procedureDisplayName: string,
                private readonly removeProcedure: (type: KLNLegType) => void,
                private readonly changeProcedure: (facility: AirportFacility, type: KLNLegType) => void,
                private readonly onCreate: (idx: number, mode: FplWptEnterMode, keyboardKey?: string) => void,
    ) {
        this.children = new UIElementChildren<ChangeProcedureListItemTypes>({
            arrow: new FlightplanArrow(wptIdx, navState, cursorController),
        });

    }

    public render(): VNode {
        return (
            <span ref={this.ref}>{this.children.get("arrow").render()}<span
                ref={this.innerRef}>{this.procedureDisplayName}</span></span>);
    }


    public setFocused(focused: boolean) {
        this.isEntered = false;
        this.isFocused = focused;
        this.children.get("arrow").isVisible = !this.isFocused;
    }


    outerLeft(): boolean {
        return false;
    }

    outerRight(): boolean {
        return false;
    }

    //confirmed in KLN-89 trainer, inserts a new waypoint before
    innerLeft(): boolean {
        this.onCreate(this.wptIdx, FplWptEnterMode.ROTATE_LEFT);
        return true;
    }

    //confirmed in KLN-89 trainer, inserts a new waypoint before
    innerRight(): boolean {
        this.onCreate(this.wptIdx, FplWptEnterMode.ROTATE_RIGHT);
        return true;
    }


    isEnterAccepted(): boolean {
        return true;
    }

    isClearAccepted(): boolean {
        return true;
    }


    enter(): Promise<EnterResult> {
        if (this.isEntered) {
            this.removeProcedure(this.type);
        } else {
            this.changeProcedure(this.facility, this.type);
        }
        return Promise.resolve(EnterResult.Handled_Keep_Focus);
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        if (this.isEntered) {
            this.children.get("arrow").isVisible = false;
            this.innerRef.instance.textContent = `DELETE ${this.getTypeString()}?`;
            this.ref.instance.classList.add("inverted");
            if (blink) {
                this.ref.instance.classList.add("inverted-blink");
            } else {
                this.ref.instance.classList.remove("inverted-blink");
            }
        } else if (this.isFocused) {
            this.children.get("arrow").isVisible = false;
            this.ref.instance.classList.add("inverted");
            this.innerRef.instance.textContent = `CHANGE ${this.getTypeString()}?`;
            if (this.isEnterAccepted()) {
                if (blink) {
                    this.ref.instance.classList.add("inverted-blink");
                } else {
                    this.ref.instance.classList.remove("inverted-blink");
                }
            }
        } else {
            this.children.get("arrow").isVisible = true;
            this.innerRef.instance.textContent = this.procedureDisplayName;
            this.ref.instance.classList.remove("inverted", "inverted-blink");
        }
    }

    clear(): boolean {
        if (this.isEntered) { //4-5 delete can be cancelled by pressing clear again
            this.isEntered = false;
            return true;
        }

        this.isEntered = true;
        return true;
    }

    public isItemFocused(): Boolean {
        return this.isFocused;
    }

    private getTypeString(): String {
        switch (this.type) {
            case KLNLegType.APP:
                return "APR";
            case KLNLegType.SID:
                return "SID";
            case KLNLegType.STAR:
                return "Æ";
            default:
                throw Error(`Unexpected type:${this.type}`);

        }
    }
}


class EditableFlightplan {

    public legs: EditableFlightplanLeg[] = [];
    public listParent: FlightplanList | undefined;
    public firstLine: FPLFirstLine;


    constructor(private cursorController: CursorController,
                public flightplan: Flightplan,
                private props: PageProps,
                private parent: SixLineHalfPage,
                loadFpl0: () => void,
                useFpl: () => void,
                useInvertedFpl: () => void,
    ) {
        this.firstLine = new FPLFirstLine(cursorController, flightplan, loadFpl0, useFpl, useInvertedFpl, this.deleteFpl.bind(this));
        this.syncLegsFromFlightplan();
    }

    public deleteLeg(idx: number) {
        this.flightplan.deleteLeg(idx);
        this.syncLegsFromFlightplan();
        this.legs[idx].focusMe = true;
        this.buildList();
    }

    public insertLeg(idx: number, wpt: Facility | null, leg: KLNFlightplanLeg | null) {
        if (wpt === null) {
            //The user aborted the insert by turning the cursor off
            this.syncLegsFromFlightplan();
            this.buildList();
            return;
        }

        try {
            const moveCursorIndex = this.flightplan.idx > 0 && this.flightplan.getLegs().length == 0;
            if (leg === null) {
                leg = {wpt: wpt, type: KLNLegType.USER}
            } else {
                leg = {
                    ...leg,
                    wpt: wpt, //Was empty in createLeg
                };
            }

            insertLegIntoFpl(this.flightplan, this.props.memory.navPage, idx, leg);
            this.syncLegsFromFlightplan();

            if (moveCursorIndex) {
                this.cursorController.cursorField = 2 //We inserted one more field at the top, so we must now correct the focused index
            }

            this.buildList();
        } catch (e) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "FPL FULL");
            console.error(e);
        }
    }

    public createLeg(idx: number, enter: FplWptEnterMode, keyboardKey: string | undefined, wpt: Facility | null = null): void {
        let leg: KLNFlightplanLeg | undefined;
        if (Number.isInteger(idx)) {
            const prev = this.legs[idx];
            if (prev?.leg) { //Happens when a SID or STAR is edited. We need to copy this metadata
                leg = {
                    wpt: wpt as any, //We will fill leg once we are done in insertLeg
                    type: prev.leg.type,
                    procedure: prev.leg.procedure,
                    parentFacility: prev.leg.parentFacility,
                }
            }
        } else {
            //We are inserting a waypoint right before a procedure, we don't want to copy the procedure metadata
            idx = idx + 0.5;
        }


        this.legs.splice(idx, 0, {wpt: wpt, leg: leg, origIdx: -1, enterMe: enter, enterKeyboardKey: keyboardKey});
        this.buildList();
    }

    public askDeleteAll(): void {
        this.firstLine.askDeleteAll();
        this.cursorController.setCursorActive(true);
        this.cursorController.focusIndex(0);
    }

    public load(fpl: Flightplan): void {
        this.flightplan.load(fpl);
        this.refreshFpl();
        this.cursorController.setCursorActive(false);
    }

    public refreshFpl(): void {
        this.syncLegsFromFlightplan();
        this.buildList();
    }

    public buildList(): UIElementChildren<any> {
        const listItems: UiElement[] = [];
        let focusIdx = -1;

        let numActiveFields = this.firstLine.refreshButtons();
        listItems.push(this.firstLine);

        let enterMethod = () => {
        };

        for (let i = 0; i < this.legs.length; i++) {
            const leg = this.legs[i];
            if (leg.leg !== undefined && leg.leg.procedure?.displayName !== undefined && (i === 0 || leg.leg.procedure.displayName !== this.legs[i - 1].leg?.procedure?.displayName)) {
                numActiveFields++;
                listItems.push(new ChangeProcedureListItem(
                    this.cursorController,
                    i - 0.5, //Between the two
                    leg.leg.parentFacility!,
                    leg.leg.type,
                    this.props.memory.navPage,
                    leg.leg.procedure.displayName,
                    this.removeProcedure.bind(this),
                    this.changeProcedure.bind(this),
                    this.createLeg.bind(this),
                ));
            }


            const listItem = new FlightplanListItem({
                ...this.props,
                parent: this.parent,
                fplIdx: this.flightplan.idx,
                origWptIdx: leg.origIdx,
                leg: leg.leg ?? null,
                wptIdx: i,
                wpt: leg.wpt,
                onCreate: this.createLeg.bind(this),
                onInsertDone: this.insertLeg.bind(this),
                onDelete: this.deleteLeg.bind(this),
                onBeforeDelete: () => null,
                cursorController: this.cursorController,
            });


            numActiveFields++;
            listItems.push(listItem);

            if (leg.enterMe !== undefined) {
                focusIdx = numActiveFields - 1;
                //This can only be done, after the cursorController is up-to-date.
                enterMethod = () => {
                    switch (leg.enterMe) {
                        case FplWptEnterMode.ROTATE_LEFT:
                            listItem.innerLeft();
                            break;
                        case FplWptEnterMode.ROTATE_RIGHT:
                            listItem.innerRight();
                            break;
                        case FplWptEnterMode.ENTER:
                            //we can't use the cursorcontroller for enter here, because that would result in an infinte loop of creating waypoint
                            listItem.enter().then(result => {
                                    //oh, the hacks get worse and worse...
                                    if (result === EnterResult.Handled_Move_Focus) {
                                        this.cursorController.outerRight();
                                    }
                                },
                            );
                            break;
                        case FplWptEnterMode.KEYBOARD:
                            listItem.innerRight();
                            listItem.keyboard(leg.enterKeyboardKey!);
                            break;
                        case FplWptEnterMode.CONFIRM:
                            listItem.confirmCurrentValue().then(_ => this.cursorController.setCursorActive(false));
                            break;
                    }
                };
            } else if (leg.focusMe) {
                focusIdx = numActiveFields - 1;
                leg.focusMe = false;
            }

            if (leg.leg?.fixType === KLNFixType.MAP) {
                listItems.push(new TextDisplay("*NO WPT SEQ"));
            }


        }
        const children = UIElementChildren.forList(listItems);
        this.listParent?.refresh(children); //Not pretty...
        this.cursorController.refreshChildren(children);
        if (focusIdx !== -1) {
            this.cursorController.focusIndex(focusIdx);
            enterMethod();
        }
        return children;
    }

    private syncLegsFromFlightplan() {
        this.legs = this.flightplan.getLegs().map((l, idx) => ({wpt: l.wpt, origIdx: idx, leg: l}));
        this.legs.push({wpt: null, origIdx: -1});
    }

    /**
     *
     * @private
     */
    private deleteFpl(): void {
        this.flightplan.delete();
        this.refreshFpl();
        this.cursorController.setCursorActive(false);
    }

    private removeProcedure(type: KLNLegType): void {
        this.flightplan.removeProcedure(type);
        this.refreshFpl();
    }

    private changeProcedure(facility: AirportFacility, type: KLNLegType): void {
        const mainPage = this.props.pageManager.getCurrentPage() as MainPage;
        this.cursorController.setCursorActive(false);
        let page;
        //Should this be push?
        this.props.memory.aptPage.facility = facility;
        switch (type) {
            case KLNLegType.SID:
                page = new Apt7Page(this.props);
                page.setCurrentPage(0);
                mainPage.setRightPage(page);
                break;
            case KLNLegType.STAR:
                page = new Apt7Page(this.props);
                page.setCurrentPage(1); //Will be clamped if too large
                mainPage.setRightPage(page);
                break;
            case KLNLegType.APP:
                mainPage.setRightPage(new Apt8Page(this.props));
                break;
            default:
                throw Error(`Type ${type} not supported`)
        }

    }

}

export class FlightplanList extends List {


    private constructor(private editPlan: EditableFlightplan, private cursorController: CursorController, private activeWaypoint: ActiveWaypoint) {
        super(editPlan.buildList(), 6);
        this.editPlan.listParent = this;
    }

    public static build(cursorController: CursorController,
                        parent: SixLineHalfPage,
                        flightplan: Flightplan,
                        props: PageProps,
                        loadFpl0: () => void,
                        useFpl: () => void,
                        useInvertedFpl: () => void,
    ): FlightplanList {
        const editPlan = new EditableFlightplan(cursorController, flightplan, props, parent, loadFpl0, useFpl, useInvertedFpl);

        return new FlightplanList(editPlan, cursorController, props.memory.navPage.activeWaypoint);
    }

    public askDeleteAll() {
        this.editPlan.askDeleteAll();
    }

    public load(fpl: Flightplan) {
        this.editPlan.load(fpl);
    }

    public refresh(children: UIElementChildren<any>): void {
        super.refresh(children);
    }

    public getSelectedWaypoint(): Facility | null {
        const focused: FlightplanListItem | null = this.children.getall().filter(c => c instanceof FlightplanListItem).find(x => (x as FlightplanListItem).isFocused) as any;
        return focused?.wpt ?? null;
    }

    public tick(blink: boolean): void {
        const actIdx = this.activeWaypoint.getActiveFplIdx();
        if (this.editPlan.flightplan.idx === 0 && !this.cursorController.cursorActive && actIdx !== -1) {
            //4-8 the active waypoint will always be visible

            const childList = this.children.getall();
            for (let i = 0; i < childList.length; i++) {
                const child = childList[i];
                if (child instanceof FlightplanListItem && child.origWptIdx === actIdx) {
                    const requiredScrollIdx = Math.max(Math.min(i - 1, childList.length - this.height - 1), 0); //not using clamp, the order is important
                    if (requiredScrollIdx !== this.scrollIdx) {
                        this.scrollIdx = requiredScrollIdx;
                        this.redraw();
                    }
                }
            }
        }

        super.tick(blink);
    }

    /**
     * Returns the indices of the currently visible legs.
     * This is used by the D/T page
     */
    public getVisibleLegsIndices(): [number, number, number, number, number, number] {

        return [this.getLegIdx(0), this.getLegIdx(1), this.getLegIdx(2), this.getLegIdx(3), this.getLegIdx(4), this.getLegIdx(5)];
    }

    public insertRefWpt(wpt: Facility, idx: number) {
        this.cursorController.setCursorActive(true);
        this.editPlan.createLeg(idx, FplWptEnterMode.CONFIRM, undefined, wpt);
    }

    public refreshFpl() {
        this.editPlan.refreshFpl();
    }

    protected getRowChild(row: number): UiElement | null {
        const childList = this.children.getall();
        if (row !== 5 || this.isLastWaypointInView(childList.length)) {
            return super.getRowChild(row);
        }

        //The last waypoint will always be shown
        return childList[childList.length - 2];
    }

    protected calculateRequiredScrollIdx(focusedIdx: number) {
        const childList = this.children.getall();
        let requiredScrollIdx = this.scrollIdx;
        if (focusedIdx < requiredScrollIdx) {
            requiredScrollIdx = focusedIdx;
        }
        if (focusedIdx < childList.length - 2) {
            //behaves like a five line list
            if (focusedIdx >= requiredScrollIdx + 5) {
                requiredScrollIdx = focusedIdx - 4;
            }
        } else {
            if (focusedIdx >= requiredScrollIdx + 6) {
                requiredScrollIdx = focusedIdx - 5;
            }
        }

        return requiredScrollIdx;
    }

    private isLastWaypointInView(numChildren: number): boolean {
        return this.scrollIdx + 6 >= numChildren;
    }

    private getLegIdx(row: number): number {
        const child = this.getRowChild(row);
        if (child instanceof FlightplanListItem) {
            return child.origWptIdx;
        } else {
            return -1;
        }
    }
}