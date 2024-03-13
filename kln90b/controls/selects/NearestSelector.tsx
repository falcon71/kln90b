import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {EnterResult, Field} from "../../pages/CursorController";
import {NO_CHILDREN} from '../../pages/Page';
import {TickController} from "../../TickController";


export class NearestSelector implements Field {

    readonly children = NO_CHILDREN;
    public isEntered = false;
    public isFocused = false;
    public isReadonly = false;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    /**
     * The nearestIndex is 0 based
     * @param nearestIndex
     */
    public constructor(private nearestIndex: number = -1) {
        this.isReadonly = nearestIndex === -1;
    }

    public render(): VNode {
        return (
            <span ref={this.ref}>{this.formatValue()}</span>);
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

    public setValue(value: number): void {
        this.nearestIndex = value;
        this.isReadonly = value === -1;
    }

    public setFocused(focused: boolean) {
        this.isFocused = focused;
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        this.ref.instance.textContent = this.formatValue();

        if (this.isFocused) {
            this.ref!.instance.classList.add("inverted");
            this.ref!.instance.classList.remove("blink");
        } else {
            this.ref!.instance.classList.remove("inverted");
            if (blink && this.nearestIndex !== -1) {
                this.ref!.instance.classList.add("blink");
            } else {
                this.ref!.instance.classList.remove("blink");
            }
        }
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

    private formatValue() {
        if (this.nearestIndex === -1) {
            return "    ";
        }

        return `nr ${this.nearestIndex + 1}`; //The KLN is 1 based
    }

    public keyboard(key: string): boolean {
        return false;
    }
}