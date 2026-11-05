import {EventBus, FSComponent, NodeReference, VNode} from '@microsoft/msfs-sdk';
import {EnterResult, Field} from "../pages/CursorController";
import {NO_CHILDREN, UiElement} from '../pages/Page';
import {TickController} from "../TickController";
import {StatusLineMessage, StatusLineMessageEvents} from "./StatusLine";

export interface ListItemProps<T> {
    bus: EventBus,
    value: T,
    fulltext: string,
    deleteText?: string,
    onEnter?: (value: T) => void,
    onDelete?: (value: T) => void,

    onBeforeDelete?: (value: T) => StatusLineMessage | null,
}

export interface ListItem extends UiElement {

    isItemFocused(): Boolean,
}

export function isListItem(el: UiElement): el is ListItem {
    return "isItemFocused" in el;
}

export class SimpleListItem<T> implements Field, ListItem {
    readonly children = NO_CHILDREN;
    public isEntered = false;
    public isFocused = false;
    public isReadonly = false;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    public constructor(protected props: ListItemProps<T>) {
    }


    public render(): VNode {
        return (
            <span ref={this.ref}>{this.props.fulltext}</span>);
    }


    public setFocused(focused: boolean) {
        this.isEntered = false;
        this.isFocused = focused;
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
        return this.props.onEnter !== undefined || this.isEntered;
    }

    isClearAccepted(): boolean {
        return this.props.onDelete !== undefined;
    }


    enter(): Promise<EnterResult> {
        if (this.isEntered) {
            this.props.onDelete!(this.props.value);
            this.isEntered = false;
            return Promise.resolve(EnterResult.Handled_Keep_Focus);
        } else {
            if (this.props.onEnter === undefined) {
                return Promise.resolve(EnterResult.Not_Handled);
            } else {
                this.props.onEnter(this.props.value);
                return Promise.resolve(EnterResult.Handled_Move_Focus);
            }
        }
    }


    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        if (this.isEntered) {
            const text = this.props.deleteText ?? this.props.fulltext;
            //4-5, 5-20: the question mark stands in a fixed column after an ident of five cells, as on FPL and OTH 3
            this.ref.instance.textContent = `DEL ${text.padEnd(5, " ")} ?`;
            if (blink) {
                this.ref.instance.classList.add("inverted-blink");
            } else {
                this.ref.instance.classList.remove("inverted-blink");
            }
        } else {
            this.ref.instance.textContent = this.props.fulltext;
            this.ref.instance.classList.remove("inverted-blink");
        }

        if (this.isFocused) {
            this.ref.instance.classList.add("inverted");
            if (this.isEnterAccepted()) {
                if (blink) {
                    this.ref.instance.classList.add("inverted-blink");
                } else {
                    this.ref.instance.classList.remove("inverted-blink");
                }
            }
        } else {
            this.ref.instance.classList.remove("inverted", "inverted-blink");
        }
    }

    clear(): boolean {
        if (this.props.onDelete === undefined) {
            return false;
        }

        if (this.isEntered) { //4-5 delete can be cancelled by pressing clear again
            this.isEntered = false;
            return true;
        }

        if (this.props.onBeforeDelete !== undefined) {
            const res = this.props.onBeforeDelete(this.props.value);
            if (res !== null) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", res);
                return true;
            }
        }


        this.isEntered = true;
        return true;
    }

    public keyboard(key: string): boolean {
        return false;
    }

    public isItemFocused(): Boolean {
        return this.isFocused;
    }

}

export interface ConfirmListItemProps<T> {
    bus: EventBus,
    value: T,
    text: string,
    /** What the entry shows while it asks, 11 characters. It flashes in the entry's place */
    prompt: string,
    /** The key that asks. ENT answers it, the same key as on the entry; CLR withdraws it */
    trigger: 'clear' | 'enter',
    onConfirm: (value: T) => void,
}

/**
 * An entry that asks for a confirmation with a prompt of its own: CLR asks and ENT confirms (FLR 2), or ENT asks and
 * ENT confirms (FLR 3). CLR withdraws the question. The text changes inside the display tick (#458)
 */
export class ConfirmListItem<T> extends SimpleListItem<T> {

    public constructor(private readonly confirmProps: ConfirmListItemProps<T>) {
        super({bus: confirmProps.bus, value: confirmProps.value, fulltext: confirmProps.text});
    }

    public isEnterAccepted(): boolean {
        return this.confirmProps.trigger === 'enter' || this.isEntered;
    }

    public isClearAccepted(): boolean {
        return this.confirmProps.trigger === 'clear' || this.isEntered;
    }

    public enter(): Promise<EnterResult> {
        if (this.isEntered) {
            this.isEntered = false;
            this.confirmProps.onConfirm(this.confirmProps.value);
            return Promise.resolve(EnterResult.Handled_Keep_Focus);
        }
        if (this.confirmProps.trigger === 'enter') {
            this.isEntered = true;
            return Promise.resolve(EnterResult.Handled_Keep_Focus);
        }
        return Promise.resolve(EnterResult.Not_Handled);
    }

    public clear(): boolean {
        if (this.isEntered) {
            this.isEntered = false;
            return true;
        }
        if (this.confirmProps.trigger === 'clear') {
            this.isEntered = true;
            return true;
        }
        return false;
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        const text = this.isEntered ? this.confirmProps.prompt : this.confirmProps.text;
        if (this.ref.instance.textContent !== text) {
            this.ref.instance.textContent = text;
        }
        const classes = this.ref.instance.classList;
        if (this.isFocused) {
            classes.add("inverted");
        } else {
            classes.remove("inverted");
        }
        if (blink && (this.isEntered || (this.isFocused && this.isEnterAccepted()))) {
            classes.add("inverted-blink");
        } else {
            classes.remove("inverted-blink");
        }
    }
}
