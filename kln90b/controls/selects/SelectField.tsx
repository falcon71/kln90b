import {FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {EnterResult, Field} from "../../pages/CursorController";
import {NO_CHILDREN} from '../../pages/Page';
import {TickController} from "../../TickController";


export class SelectField implements Field {
    readonly children = NO_CHILDREN;
    public isEntered = false;
    public isFocused = false;
    public isReadonly = false;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    public constructor(protected valueSet: string[], public value: number, protected readonly changedCallback: (value: number) => void) {
    }


    public render(): VNode {
        return (
            <span ref={this.ref}>{this.valueSet[this.value]}</span>);
    }


    public setFocused(focused: boolean) {
        this.isFocused = focused;
    }


    outerLeft(): boolean {
        return false;
    }

    outerRight(): boolean {
        return false;
    }

    innerLeft(): boolean {
        this.value--;
        if (this.value < 0) {
            this.value = this.valueSet.length - 1;
        }
        this.changedCallback(this.value);
        return true;
    }

    innerRight(): boolean {
        this.value++;
        if (this.value >= this.valueSet.length) {
            this.value = 0;
        }
        this.changedCallback(this.value);
        return true;
    }


    isEnterAccepted(): boolean {
        return false;
    }

    enter(): Promise<EnterResult> {
        return Promise.resolve(EnterResult.Not_Handled);
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        this.ref.instance.textContent = this.valueSet[this.value];

        if (this.isFocused) {
            this.ref!.instance.classList.add("inverted");
        } else {
            this.ref!.instance.classList.remove("inverted");
        }
    }


    clear(): boolean {
        return false;
    }

    isClearAccepted(): boolean {
        return false;
    }

    public keyboard(key: string): boolean {
        const idx = this.valueSet.indexOf(key);
        if (idx == -1) {
            return false;
        }

        this.value = idx;
        this.changedCallback(this.value);
        return true;
    }
}