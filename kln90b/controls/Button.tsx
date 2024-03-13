import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {EnterResult, Field} from "../pages/CursorController";
import {NO_CHILDREN} from '../pages/Page';
import {TickController} from "../TickController";


export class Button implements Field {
    readonly children = NO_CHILDREN;
    public isEntered = false;
    public isFocused = false;

    public isReadonly = false;
    public isVisible = true;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    public constructor(public text: string, private readonly enterCallback: () => void, private readonly clearCallback?: () => void) {
    }


    public render(): VNode {
        return (
            <span ref={this.ref} class={this.isVisible ? "" : "d-none"}>{this.text}</span>);
    }


    public setFocused(focused: boolean) {
        this.isFocused = focused;
    }

    public setVisible(visible: boolean) {
        this.isVisible = visible;
        this.isReadonly = !visible;
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

    isEnterAccepted(): boolean {
        return true;
    }

    enter(): Promise<EnterResult> {
        this.enterCallback();
        return Promise.resolve(EnterResult.Handled_Move_Focus);
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        if (this.isVisible) {
            this.ref!.instance.classList.remove("d-none");
        } else {
            this.ref!.instance.classList.add("d-none");
        }

        if (this.isFocused) {
            this.ref!.instance.classList.add("inverted", "inverted-blink");
            if (blink) {
                this.ref!.instance.classList.add("inverted-blink");
            } else {
                this.ref!.instance.classList.remove("inverted-blink");
            }
        } else {
            this.ref!.instance.classList.remove("inverted", "inverted-blink");
        }
    }

    clear(): boolean {
        if (this.clearCallback) {
            this.clearCallback();
            return true;
        }
        return false;
    }

    isClearAccepted(): boolean {
        return this.clearCallback !== undefined;
    }

    public keyboard(key: string): boolean {
        return false;
    }

}