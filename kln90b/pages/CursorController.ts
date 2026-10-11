import {NO_CHILDREN, UiElement, UIElementChildren} from "./Page";

export interface CursorHandler {
    outerLeft(): boolean;

    outerRight(): boolean;

    innerLeft(): boolean;

    innerRight(): boolean;

    enter(): Promise<EnterResult>;

    clear(): boolean;

    keyboard(key: string): boolean; //Keyboard presses
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
    private defaultFieldIsLast: boolean = false;
    /**
     * The field this controller focused last. It can turn read-only under the cursor (#217)
     */
    private focusedField: Field | null = null;


    /**
     *
     * @param children
     * @param onCursorActiveChangedListener Will be called each time the cursorActive state is changed
     * @param enterAlwaysMoves If true, ENT also moves the cursor on when the field did not handle it. Only the self-test
     * page does this, 3-6 and 3-7
     */
    constructor(private children: UIElementChildren<any>, private onCursorActiveChangedListener: (isActive: boolean) => void = () => {
    }, private readonly enterAlwaysMoves: boolean = false) {
        // @ts-ignore
        this.fields = children.getallFlat().filter(c => isField(c) && !(c as Field).isReadonly);
    }

    public getCurrentFocusedField(): Field | null {
        if (!this.cursorActive) {
            return null;
        }
        const fields = this.getFields();
        if (fields[this.cursorField] !== this.focusedField) {
            //Fields can turn read-only while the cursor is on: the date and time at the first fix (3-53), the magnetic
            //variation inside the area (5-44) (#217)
            const index = this.focusedField === null ? -1 : fields.indexOf(this.focusedField);
            if (index !== -1) {
                //A field before the cursor changed, the cursor stays on its field
                this.cursorField = index;
            } else {
                //The field under the cursor is gone, the cursor moves to the field at its position or the last one left.
                //Only a field that is still on the page loses the focus: a list replaces its items, and turning off a
                //replaced flight plan item aborts the insert it holds (FlightplanListItem.setFocused)
                if (this.focusedField?.isReadonly) {
                    this.focusedField.setFocused(false);
                }
                this.focusedField = null;
                if (fields.length === 0) {
                    //Not setCursorActive(false), it asks for the focused field again
                    this.cursorActive = false;
                    this.onCursorActiveChangedListener(false);
                    return null;
                }
                this.focusAt(Math.min(this.cursorField, fields.length - 1), fields);
            }
        }
        return fields[this.cursorField];
    }

    private focusAt(index: number, fields: Field[] = this.getFields()): void {
        this.cursorField = index;
        this.focusedField = fields[index];
        this.focusedField.setFocused(true);
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

    /**
     * Sets the default field that will be selected the next time the cursor is activated.
     * Has no effect if the cursor is already active.
     * @param defaultField
     */
    public setDefaultCursorField(defaultField: number): void {
        if (this.cursorActive) {
            return;
        }
        this.cursorField = defaultField;
        this.defaultFieldIsLast = false;
    }

    /**
     * The cursor will start on the last field the next time it is activated, however many fields the page has by then.
     * Has no effect if the cursor is already active.
     */
    public setDefaultCursorFieldToLast(): void {
        if (this.cursorActive) {
            return;
        }
        this.defaultFieldIsLast = true;
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
            if (this.defaultFieldIsLast) {
                this.cursorField = fields.length - 1;
                this.defaultFieldIsLast = false;
            }
            this.focusAt(Math.min(this.cursorField, fields.length - 1), fields); //4.1.2 This sounds like, the last cursorposition is remembered
        } else {
            //Not getCurrentFocusedField, which would move the cursor (#217)
            const index = this.focusedField === null ? -1 : fields.indexOf(this.focusedField);
            if (index !== -1) {
                //A field before the cursor may have changed since: the position follows the field
                this.cursorField = index;
                this.focusedField!.setFocused(false);
            } else {
                fields[this.cursorField]?.setFocused(false);
                if (this.focusedField?.isReadonly) {
                    this.focusedField.setFocused(false);
                }
            }
            this.focusedField = null;
            this.cursorActive = active;
        }
        this.onCursorActiveChangedListener(active);
    }

    public outerRight(): boolean {
        const field = this.getCurrentFocusedField();
        if (field === null) {
            return false;
        }
        if (field.isEntered) {
            return field.outerRight();
        }

        const fields = this.getFields();
        if (this.cursorField >= fields.length - 1) {
            return true; //4-3: The cursor stops at the last field, it does not wrap. Checked in the KLN 89 trainer (#218)
        }

        field.setFocused(false);
        this.focusAt(this.cursorField + 1, fields);
        return true;
    }

    public outerLeft(): boolean {
        const field = this.getCurrentFocusedField();
        if (field === null) {
            return false;
        }
        if (field.isEntered) {
            return field.outerLeft();
        }

        if (this.cursorField <= 0) {
            return true; //4-3: The cursor stops at the first field, it does not wrap. Checked in the KLN 89 trainer (#218)
        }

        field.setFocused(false);
        this.focusAt(this.cursorField - 1);
        return true;
    }

    public focusIndex(index: number): void {
        if (!this.cursorActive) {
            throw new Error("Cursor is not active, cannot set index");
        }
        this.getCurrentFocusedField()?.setFocused(false);
        this.focusAt(index);
    }

    public innerRight(): boolean {
        return this.getCurrentFocusedField()?.innerRight() ?? false;
    }

    public innerLeft(): boolean {
        return this.getCurrentFocusedField()?.innerLeft() ?? false;
    }

    public isEnterAccepted() {
        return this.getCurrentFocusedField()?.isEnterAccepted() ?? false;
    }

    public async enter(): Promise<EnterResult> {
        const field = this.getCurrentFocusedField();
        if (field === null) {
            return EnterResult.Not_Handled;
        }
        const result = await field.enter();

        if (result == EnterResult.Handled_Keep_Focus) {
            const focused = this.getCurrentFocusedField();
            if (this.cursorActive && focused && !focused.isFocused) {
                //Happens when enter was pressed to delete an item (e.g. OTH 3 page)
                //This item no longer exists, but we still want to focus the item on the current index
                this.focusAt(this.cursorField);
            }
        } else if (result === EnterResult.Handled_Move_Focus || this.enterAlwaysMoves) {
            //Enter moves to the next field, see https://www.youtube.com/shorts/9We5fcd2-VE
            //A field with nothing to accept leaves the cursor where it is, checked in the KLN 89 trainer (#354)
            //On the last field the cursor stays, the pilot turns it off with CRSR (5-17 steps 9 and 10, 3-47) (#218)
            this.outerRight();
        }
        return result;
    }

    public clear(): boolean {
        const field = this.getCurrentFocusedField();
        if (field === null) {
            return false;
        }
        if (field.isClearAccepted()) {
            return field.clear();
        }

        return false;
    }

    private getFields(): Field[] {
        // @ts-ignore
        return this.children.getallFlat().filter(c => isField(c) && !(c as Field).isReadonly);
    }

    public keyboard(key: string): boolean {
        return this.getCurrentFocusedField()?.keyboard(key) ?? false;
    }
}

/**
 * No cursor is available for this page
 */
export const NO_CURSOR_CONTROLLER = new CursorController(NO_CHILDREN);