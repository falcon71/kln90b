import {EventBus, FSComponent, NodeReference, Publisher, VNode} from '@microsoft/msfs-sdk';
import {EnterResult, Field} from "../../pages/CursorController";
import {UIElementChildren} from '../../pages/Page';
import {EditorField, EditorFieldValue} from "./EditorField";
import {StatusLineMessageEvents} from "../StatusLine";
import {TickController} from "../../TickController";


export type Rawvalue = number[];

/**
 * 3-14
 * An editor allows "jumping in" by rotiating an inner knob. Each field must then be manuelly entered and acknowledged with enter
 */
export abstract class Editor<T> implements Field {
    readonly children: UIElementChildren<any>;
    public isEntered = false;
    public isFocused = false;

    public isReadonly = false;
    public DEFAULT_FIELD_VALUE: EditorFieldValue = null; //this character will be shown in all fields, when the users enters the editor
    protected readonly containerRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    /** The cells of an editor that has an idle text (render puts them in this span) */
    protected readonly cellsRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    /** The span that shows the idle text in place of the cells */
    protected readonly idleRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    protected convertedValue: Rawvalue | null = null;
    protected cursorIndex = 0;
    protected statusLineMessagePublisher: Publisher<StatusLineMessageEvents>;
    private leadingZeroCells: number[] = [];

    protected constructor(bus: EventBus,
                          protected readonly editorFields: EditorField[],
                          protected value: T | null,
                          protected readonly enterCallback: (text: T) => void,
                          private emptyFieldValue: EditorFieldValue = null, //this character will be shown in all fields, when the value is null
    ) {
        if (value !== null) {
            this.convertedValue = this.convertFromValue(value);
        }
        this.applyValueToFields(this.convertedValue);
        const childmap: { [key: string]: EditorField } = {};
        for (let i = 0; i < editorFields.length; i++) {
            childmap[String(i)] = editorFields[i];
        }

        this.children = new UIElementChildren(childmap);

        this.statusLineMessagePublisher = bus.getPublisher<StatusLineMessageEvents>();
    }


    public abstract render(): VNode;


    public setFocused(focused: boolean) {
        if (!focused) {
            this.setEntered(false);
            this.applyValueToFields(this.convertedValue);
        }
        this.isFocused = focused;
        this.children.walk((child) => (child as EditorField).isParentFocused = focused);
    }

    public setValue(value: T | null) {
        this.value = value;
        if (value === null) {
            this.convertedValue = null;
        } else {
            this.convertedValue = this.convertFromValue(value);
        }
        if (!this.isEntered) {
            this.applyValueToFields(this.convertedValue);
        }
    }

    /**
     * The cursor stops at the first cell. The Pilot's Guide is silent, the KLN 89 trainer stops there (checked 2026-10-08)
     */
    outerLeft(): boolean {
        if (this.cursorIndex > 0) {
            this.editorFields[this.cursorIndex].isFocused = false;
            this.cursorIndex--;
            this.editorFields[this.cursorIndex].isFocused = true;
        }
        return true;
    }

    /**
     * The cursor stops at the last cell. The Pilot's Guide is silent, the KLN 89 trainer stops there (checked 2026-10-08)
     */
    outerRight(): boolean {
        if (this.cursorIndex < this.editorFields.length - 1) {
            this.editorFields[this.cursorIndex].isFocused = false;
            this.cursorIndex++;
            this.editorFields[this.cursorIndex].isFocused = true;
        }
        return true;
    }

    innerLeft(): boolean {
        if (this.isEntered) {
            this.decrementCurrentChar();
            this.onCharChanged();
        } else {
            this.setEntered(true);
        }
        return true;
    }

    innerRight(): boolean {
        if (this.isEntered) {
            this.incrementCurrentChar();
            this.onCharChanged();
        } else {
            this.setEntered(true);
        }
        return true;
    }

    async enter(): Promise<EnterResult> {
        if (!this.isEnterAccepted()) {
            return EnterResult.Not_Handled;
        }

        const editedValue = this.editorFields.map(f => f.value ?? f.defaultValue);
        const value = await this.convertToValue(editedValue);
        if (value === null) {
            this.statusLineMessagePublisher.pub("statusLineMessage", "INVALID ENT");
            return EnterResult.Handled_Keep_Focus;
        }
        this.convertedValue = editedValue;
        this.value = value;

        this.applyValueToFields(this.convertedValue);
        this.isEntered = false;
        this.applyLeadingBlanks();
        this.enterCallback(value);
        return EnterResult.Handled_Move_Focus;
    }

    isEnterAccepted(): boolean {
        return this.isEntered;
    }

    tick(blink: boolean): void {

    }

    /**
     * CLR during an open edit brings the old value back and closes the edit; the cursor stays on the field. Checked in
     * the KLN 89 trainer, 2026-10-08 (#307)
     */
    clear(): boolean {
        if (this.isEntered) {
            this.setEntered(false);
            return true;
        }
        return false;
    }

    isClearAccepted(): boolean {
        return this.isEntered;
    }

    /**
     * A text that the closed field shows in place of its cells, or null to show the cells (#341: a distance that does not
     * fit the cells). An open edit always shows the cells
     */
    protected idleText(): string | null {
        return null;
    }

    /** For editors that render cellsRef and idleRef: shows the idle text or the cells. Call it from tick() */
    protected tickIdleText(): void {
        if (!TickController.checkRef(this.cellsRef, this.idleRef)) {
            return;
        }
        const text = this.isEntered ? null : this.idleText();
        if (text === null) {
            this.idleRef.instance.classList.add("d-none");
            this.cellsRef.instance.classList.remove("d-none");
        } else {
            this.idleRef.instance.textContent = text;
            this.idleRef.instance.classList.remove("d-none");
            this.cellsRef.instance.classList.add("d-none");
            if (this.isFocused) {
                this.idleRef.instance.classList.add("inverted");
            } else {
                this.idleRef.instance.classList.remove("inverted");
            }
        }
    }

    protected onCharChanged(): Promise<void> {
        return Promise.resolve();
    }

    protected abstract convertToValue(rawValue: Rawvalue): Promise<T | null>;

    protected abstract convertFromValue(value: T | null): Rawvalue;

    protected applyValueToFields(value: Rawvalue | null) {
        for (let i = 0; i < this.editorFields.length; i++) {
            if (value === null) {
                this.editorFields[i].value = this.emptyFieldValue;
            } else {
                this.editorFields[i].value = value[i];
            }
        }
        this.applyLeadingBlanks();
    }

    /**
     * The cells, in display order, whose zeros are blanked while the edit is closed: from the first up to the first cell
     * that is not 0. An open edit shows every cell as it is. Checked in the KLN 89 trainer: a degree below 10 shows a
     * blank once entered and its zeros while edited (2026-10-07, #230), the open longitude shows E008° (2026-10-08, #304)
     */
    protected setLeadingZeroCells(cells: number[]): void {
        this.leadingZeroCells = cells;
        this.applyLeadingBlanks();
    }

    private applyLeadingBlanks(): void {
        let leading = !this.isEntered;
        for (const i of this.leadingZeroCells) {
            const field = this.editorFields[i];
            leading = leading && field.value === 0;
            field.isBlank = leading;
        }
    }

    protected setEntered(isEntered: boolean) {
        if (isEntered) {
            this.cursorIndex = 0;
            this.editorFields.forEach((f) => f.value = this.DEFAULT_FIELD_VALUE);
            this.editorFields[0].isFocused = true;
            this.editorFields[0].value = 0;
        } else {
            this.editorFields[this.cursorIndex].isFocused = false;
            this.applyValueToFields(this.convertedValue);
        }
        this.isEntered = isEntered;
        this.applyLeadingBlanks();
    }

    private incrementCurrentChar() {
        this.editorFields[this.cursorIndex].incrementChar();
    }

    private decrementCurrentChar() {
        this.editorFields[this.cursorIndex].decrementChar();
    }

    public keyboard(key: string): boolean {
        if (!this.isEntered) {
            this.setEntered(true);
        }

        const field = this.editorFields[this.cursorIndex];
        if (field.keyboard(key)) {
            this.onCharChanged();
            return true;
        } else {
            return false;
        }
    }
}