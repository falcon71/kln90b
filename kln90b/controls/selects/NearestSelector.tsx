import {Facility, FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {EnterResult, Field} from "../../pages/CursorController";
import {NO_CHILDREN} from '../../pages/Page';
import {TickController} from "../../TickController";
import {NearestWpt} from "../../data/navdata/NearestList";
import {isNearestWpt} from "../../pages/right/WaypointPage";


export class NearestSelector implements Field {

    readonly children = NO_CHILDREN;
    public isEntered = false;
    public isFocused = false;
    public isReadonly = false;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    /**
     * The nearestIndex is 0 based
     * @param facility
     */
    public constructor(private facility: Facility | NearestWpt<Facility> | null) {
    }

    public render(): VNode {
        return (
            <span ref={this.ref}>{this.formatValue(this.getIndex())}</span>);
    }

    outerLeft(): boolean {
        return false;
    }

    outerRight(): boolean {
        return false;
    }

    innerLeft(): boolean {
        return false;
    }

    innerRight(): boolean {
        return false;
    }

    public setFacility(facility: Facility | NearestWpt<Facility> | null): void {
        this.facility = facility;
    }

    public setFocused(focused: boolean) {
        this.isFocused = focused;
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        const nearestIndex = this.getIndex();
        this.isReadonly = nearestIndex === -1;

        this.ref.instance.textContent = this.formatValue(nearestIndex);

        if (this.isFocused) {
            this.ref!.instance.classList.add("inverted");
            this.ref!.instance.classList.remove("blink");
        } else {
            this.ref!.instance.classList.remove("inverted");
            if (blink && nearestIndex !== -1) {
                this.ref!.instance.classList.add("blink");
            } else {
                this.ref!.instance.classList.remove("blink");
            }
        }
    }

    private getIndex(): number {
        return isNearestWpt(this.facility) ? this.facility.index : -1;
    }

    isEnterAccepted(): boolean {
        return false;
    }

    enter(): Promise<EnterResult> {
        return Promise.resolve(EnterResult.Not_Handled);
    }

    clear(): boolean {
        return false;
    }

    isClearAccepted(): boolean {
        return false;
    }

    private formatValue(nearestIndex: number) {
        if (nearestIndex === -1) {
            return "    ";
        }

        return `nr ${nearestIndex + 1}`; //The KLN is 1 based
    }

    public keyboard(key: string): boolean {
        return false;
    }
}