import {Facility, FSComponent, ICAO, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {CursorController, EnterResult, Field} from "../pages/CursorController";
import {PageProps, UIElementChildren} from '../pages/Page';
import {TickController} from "../TickController";
import {KLNErrorMessage, StatusLineMessageEvents} from "./StatusLine";
import {WaypointEditor} from "./editors/WaypointEditor";
import {ListItem} from "./ListItem";
import {FlightplanArrow} from "./displays/FlightplanArrow";
import {IcaoFixedLength} from "../data/navdata/IcaoFixedLength";
import {TextDisplay} from "./displays/TextDisplay";
import {SixLineHalfPage} from "../pages/FiveSegmentPage";
import {FplWptEnterMode} from "./FlightplanList";
import {KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {SidStar} from "../data/navdata/SidStar";

export interface FlightplanListItemProps extends PageProps {
    fplIdx: number,
    origWptIdx: number, //The actual index of this leg in the flightplan. -1 when it is a new waypoint not yet in the fpl
    leg: KLNFlightplanLeg | null,
    wptIdx: number, //The index to display to the user
    wpt: Facility | null,
    onCreate: (idx: number, mode: FplWptEnterMode) => void,
    onDelete: (idx: number) => void,
    onInsertDone: (idx: number, value: Facility | null, leg: KLNFlightplanLeg | null) => void,
    onBeforeDelete: (idx: number) => KLNErrorMessage | null,
    parent: SixLineHalfPage,
    cursorController: CursorController,
}

type FlightplanListItemTypes = {
    arrow: FlightplanArrow | TextDisplay
}

export class FlightplanListItem implements Field, ListItem {
    readonly children: UIElementChildren<FlightplanListItemTypes>;
    public isEntered = false;
    public isDeleting = false;
    public isFocused = false;
    public readonly isReadonly = false;
    public wpt: Facility | null;
    public readonly origWptIdx: number;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    protected readonly readonlyRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    protected readonly delRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private waypointEditor: WaypointEditor;
    private readonly type: KLNLegType;
    private readonly wptIdent: string;

    public constructor(protected props: FlightplanListItemProps) {
        this.wpt = this.props.wpt;
        this.origWptIdx = this.props.origWptIdx;

        this.children = new UIElementChildren<FlightplanListItemTypes>({
            arrow: this.props.fplIdx === 0 ? new FlightplanArrow(props.origWptIdx, props.memory.navPage, props.cursorController) : new TextDisplay(" "),
        });  //The waypointeditor is not a child. We must steal all events and handle them ourself

        this.waypointEditor = new WaypointEditor({
            ...props,
            value: this.wpt,
            enterCallback: this.setFacility.bind(this),
        });

        this.type = this.props.leg?.type ?? KLNLegType.USER;

        if (this.type === KLNLegType.APP) {
            const suffix = SidStar.getWptSuffix(this.props.leg?.fixType);
            this.wptIdent = (ICAO.getIdent(this.wpt!.icao) + suffix).padEnd(6, " ");
        } else {
            this.wptIdent = IcaoFixedLength.getIdentFromFacility(this.wpt);
        }

    }

    public render(): VNode {
        let colon: string;
        switch (this.type) {
            case KLNLegType.APP:
                colon = " ";
                break;
            case KLNLegType.SID:
            case KLNLegType.STAR:
                colon = ".";
                break;
            case KLNLegType.USER:
                colon = ":";
                break;
        }
        const wptEditor = this.type === KLNLegType.APP ? (
            <span ref={this.readonlyRef}>{this.wptIdent}</span>) : this.waypointEditor.render();


        //The manual is wrong for delete, the questionmark is at the very end: https://youtu.be/S1lt2W95bLA?t=189
        return (<span>
            <span ref={this.ref}>
                {this.children.get("arrow").render()}{(this.props.wptIdx + 1).toString().padStart(2, " ")}{colon}{wptEditor}
            </span>
            <span ref={this.delRef} class="d-none inverted">
                DEL {IcaoFixedLength.getIdentFromFacility(this.wpt)} ?
            </span>
        </span>);
    }

    public setFocused(focused: boolean) {
        this.isEntered = false;
        this.isDeleting = false;
        this.isFocused = focused;

        if (!focused && this.waypointEditor.isEntered) {
            //The user aborted the insert by turning the cursor off
            this.props.onInsertDone(this.props.wptIdx, null, null);
        }
        if (this.type !== KLNLegType.APP) {
            this.waypointEditor.setFocused(focused);
        }
    }

    outerLeft(): boolean {
        return this.waypointEditor.outerLeft();
    }

    outerRight(): boolean {
        return this.waypointEditor.outerRight();
    }

    innerLeft(): boolean {
        if (this.type === KLNLegType.APP) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "INVALID ADD");
            return true;
        }

        if (!this.waypointEditor.isEntered && this.wpt !== null) {

            this.props.onCreate(this.props.wptIdx, FplWptEnterMode.ROTATE_LEFT);
            return true;
        }
        const handled = this.waypointEditor.innerLeft();
        this.isEntered = this.waypointEditor.isEntered;
        return handled;
    }

    innerRight(): boolean {
        if (this.type === KLNLegType.APP) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "INVALID ADD");
            return true;
        }

        if (!this.waypointEditor.isEntered && this.wpt !== null) {
            this.props.onCreate(this.props.wptIdx, FplWptEnterMode.ROTATE_RIGHT);
            return true;
        }
        const handled = this.waypointEditor.innerRight();
        this.isEntered = this.waypointEditor.isEntered;
        return handled;
    }

    isEnterAccepted(): boolean {
        return this.isDeleting || this.waypointEditor.isEnterAccepted();
    }

    isClearAccepted(): boolean {
        return this.wpt !== null;
    }

    enter(): Promise<EnterResult> {
        if (this.isDeleting) {
            this.props.onDelete(this.props.wptIdx);
            this.isDeleting = false;
            this.isEntered = false;
            return Promise.resolve(EnterResult.Handled_Keep_Focus);
        } else {
            if (!this.waypointEditor.isEntered && this.wpt !== null) {
                this.props.onCreate(this.props.wptIdx, FplWptEnterMode.ENTER);
                return Promise.resolve(EnterResult.Handled_Keep_Focus);
            }
            const handled = this.waypointEditor.enter();
            this.isEntered = this.waypointEditor.isEntered;
            return handled;
        }
    }

    public confirmCurrentValue(): Promise<void> {
        return this.waypointEditor.confirmCurrentValue();
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        if (this.type === KLNLegType.APP) {
            if (this.isFocused) {
                this.readonlyRef.instance.classList.add("inverted");
            } else {
                this.readonlyRef.instance.classList.remove("inverted");
            }
        }

        if (this.isDeleting) {
            this.ref.instance.classList.add("d-none");
            this.delRef.instance.classList.remove("d-none");
            if (blink) {
                this.delRef.instance.classList.add("inverted-blink");
            } else {
                this.delRef.instance.classList.remove("inverted-blink");
            }
        } else {
            this.ref.instance.classList.remove("d-none");
            this.delRef.instance.classList.add("d-none");
        }
        //children is not set, so we have to do this manually
        this.waypointEditor.tick(blink);
        this.waypointEditor.children.walk(c => c.tick(blink));

    }

    clear(): boolean {
        if (this.wpt === null) {
            return false;
        }
        if (this.type === KLNLegType.APP) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "INVALID DEL");
            return true;
        }

        if (this.isDeleting) { //4-5 delete can be cancelled by pressing clear again
            this.isDeleting = false;
            this.isEntered = false;
            return true;
        }

        const res = this.props.onBeforeDelete(this.props.wptIdx);
        if (res !== null) {
            this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", res);
            return true;
        }

        this.isDeleting = true;
        this.isEntered = true;
        return true;
    }

    public isItemFocused(): Boolean {
        return this.isFocused;
    }

    private setFacility(facility: Facility | null) {
        this.wpt = facility;
        this.props.onInsertDone(this.props.wptIdx, facility, this.props.leg);
    }

    public keyboard(key: string): boolean {
        return this.waypointEditor.keyboard(key);
    }
}