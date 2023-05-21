import {NO_CHILDREN, UiElement, UIElementChildren} from "./Page";


export interface CursorHandler {
    outerLeft(): boolean;

    outerRight(): boolean;

    innerLeft(): boolean;

    innerRight(): boolean;

    enter(): Promise<EnterResult>;

    clear(): boolean;
}

/**
 * A field is an element, that can be focused by the cursorcontroller
 */
export interface Field extends CursorHandler, UiElement {

    readonly isFocused: boolean;
    readonly isEntered: boolean;

    readonly isReadonly: boolean;

    isEnterAccepted(): boolean;

    isClearAccepted(): boolean;

    setFocused(focused: boolean): void;
}


export function isField(el: UiElement): el is Field {
    return "isReadonly" in el;
}

export enum EnterResult {
    Not_Handled, //The element did not handle the Enter Event
    Handled_Keep_Focus, //The element handled the event, but still keeps the focus
    Handled_Move_Focus, //The element handled the event and it's done. The cursor shall be moved to the next element
}

/**
 * This class handles the selection of indiviual fields.
 */
export class CursorController implements CursorHandler {
    public cursorActive: boolean = false;
    public cursorField: number = 0;


    /**
     *
     * @param children
     */
    constructor(private children: UIElementChildren<any>) {
        // @ts-ignore
        this.fields = children.getallFlat().filter(c => isField(c) && !(c as Field).isReadonly);
    }

    public getCurrentFocusedField(): Field | null {
        if (this.cursorActive) {
            return this.getFields()[this.cursorField];
        } else {
            return null;
        }
    }

    /**
     * The readonly state of fields will automatically be updated, so this should only be called if the instance of
     * UIElementChildren changed. This is usually only the case for lists
     * @param children
     */
    public refreshChildren(children: UIElementChildren<any>): void {
        this.children = children;
        if (this.cursorActive) {
            const fields = this.getFields();
            if (fields.length === 0) {
                this.setCursorActive(false);
            } else if (this.cursorField >= fields.length) {
                this.focusIndex(fields.length - 1);
            }
        }

    }

    public toggleCursor(): boolean {
        const fields = this.getFields();
        if (fields.length === 0) {
            return false;
        }
        this.setCursorActive(!this.cursorActive);
        console.log("toggleCursor", this.cursorActive, this.getCurrentFocusedField());
        return true;
    }

    public setCursorActive(active: boolean) {
        if (active === this.cursorActive) {
            return;
        }
        const fields = this.getFields();
        if (active && fields.length === 0) {
            throw new Error("The cursor cannot be set, there are no fields");
        }
        if (active) {
            this.cursorActive = active;
            this.cursorField = Math.min(this.cursorField, fields.length); //4.1.2 This sounds like, the last cursorposition is remembered
            this.getCurrentFocusedField()!.setFocused(true);
        } else {
            //The order is important!
            this.getCurrentFocusedField()?.setFocused(false);
            this.cursorActive = active;
        }
    }

    public outerRight(): boolean {
        if (!this.cursorActive) {
            return false;
        }
        if (this.getCurrentFocusedField()?.isEntered) {
            return this.getCurrentFocusedField()!.outerRight();
        }

        const fields = this.getFields();

        this.getCurrentFocusedField()!.setFocused(false);
        this.cursorField++;
        if (this.cursorField >= fields.length) {
            this.cursorField = 0;
        }
        this.getCurrentFocusedField()!.setFocused(true);
        return true;
    }

    public outerLeft(): boolean {
        if (!this.cursorActive) {
            return false;
        }
        if (this.getCurrentFocusedField()?.isEntered) {
            return this.getCurrentFocusedField()!.outerLeft();
        }

        const fields = this.getFields();
        this.getCurrentFocusedField()!.setFocused(false);
        this.cursorField--;
        if (this.cursorField < 0) {
            this.cursorField = fields.length - 1;
        }
        this.getCurrentFocusedField()!.setFocused(true);
        return true;
    }

    public focusIndex(index: number): void {
        if (!this.cursorActive) {
            throw new Error("Cursor is not active, cannot set index");
        }
        this.getCurrentFocusedField()?.setFocused(false);
        this.cursorField = index;
        this.getCurrentFocusedField()!.setFocused(true);
    }

    public innerRight(): boolean {
        if (!this.cursorActive) {
            return false;
        }
        return this.getCurrentFocusedField()!.innerRight();
    }

    public innerLeft(): boolean {
        if (!this.cursorActive) {
            return false;
        }
        return this.getCurrentFocusedField()!.innerLeft();
    }

    public isEnterAccepted() {
        if (!this.cursorActive) {
            return false;
        }
        return this.getCurrentFocusedField()!.isEnterAccepted();
    }

    public async enter(): Promise<EnterResult> {
        if (!this.cursorActive) {
            return EnterResult.Not_Handled;
        }
        const result = await this.getCurrentFocusedField()!.enter();

        if (result === EnterResult.Handled_Move_Focus) {
            this.outerRight(); //Enter always moves to the next field, see https://www.youtube.com/shorts/9We5fcd2-VE
        }
        return result;
    }

    public clear(): boolean {
        if (!this.cursorActive) {
            return false;
        }
        if (this.getCurrentFocusedField()!.isClearAccepted()) {
            return this.getCurrentFocusedField()!.clear();
        }

        return false;
    }

    private getFields(): Field[] {
        // @ts-ignore
        return this.children.getallFlat().filter(c => isField(c) && !(c as Field).isReadonly);
    }
}

/**
 * No cursor is available for this page
 */
export const NO_CURSOR_CONTROLLER = new CursorController(NO_CHILDREN);