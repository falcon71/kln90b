import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../../TickController";

export type EditorFieldValue = number | null;

export abstract class EditorField implements UiElement {
    abstract readonly charset: string[];
    readonly children = NO_CHILDREN;
    public value: EditorFieldValue = null;
    public isFocused = false;
    public isParentFocused = false;
    public isParentBlink = false;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();


    public render(): VNode {
        return (
            <span ref={this.ref}>{this.toString()}</span>);
    }

    public incrementChar() {
        let newIdx = this.value === null ? 0 : this.value + 1;
        console.log("incrementCurrentChar", newIdx);
        if (newIdx >= this.charset.length) {
            newIdx = 0;
        }
        this.value = newIdx;
    }

    public decrementChar() {
        let newIdx = this.value === null ? 0 : this.value - 1;
        console.log("decrementChar", newIdx);
        if (newIdx < 0) {
            newIdx = this.charset.length - 1;
        }
        this.value = newIdx;
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        if (blink && (this.isFocused || this.isParentBlink)) {
            this.ref.instance.classList.add("inverted-blink");
        } else {
            this.ref.instance.classList.remove("inverted-blink");
            if (this.isParentFocused) {
                this.ref.instance.classList.add("inverted");
            } else {
                this.ref.instance.classList.remove("inverted");
            }
        }

        this.ref.instance.textContent = this.toString();
    }

    /**
     * calculates the value based on the displayvalue in the charset
     * @param displayValue
     */
    public setDisplayValue(displayValue: string): void {
        const idx = this.charset.indexOf(displayValue);
        if (idx === -1) {
            this.value = null;
        } else {
            this.value = idx;
        }
    }

    private fieldLength(): number {
        return this.charset[0].length;
    }

    private toString() {
        return this.value == null ? "_".repeat(this.fieldLength()) : this.charset[this.value];
    }

    public keyboard(key: string): boolean {
        const idx = this.charset.indexOf(key);
        if (idx == -1) {
            return false;
        }

        this.value = idx;

        return true;
    }

}

export class AlphabetEditorField extends EditorField {

    charset = [' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

}

export class NumberEditorField extends EditorField {
    charset;


    constructor(charset: string[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
        super();
        this.charset = charset;
    }

    /**
     * Create a number field with the specified range of values
     * @param min
     * @param max
     */
    public static createWithMinMax(min: number, max: number): NumberEditorField {
        const size = max - min + 1;
        const length = String(max).length;

        const charset = [...Array(size).keys()].map(i => String(i + min).padStart(length, "0"));
        return new NumberEditorField(charset);
    }

    /**
     * creates a number field, which starts at 0, but display a blank character, when zero is entered
     * @param max
     */
    public static createWithBlankMax(max: number): NumberEditorField {
        const size = max + 1;
        const length = String(max).length;

        const charset = [...Array(size).keys()].map(i => i == 0 ? " " : String(i).padStart(length, "0"));
        return new NumberEditorField(charset);
    }
}

export class MonthEditorField extends EditorField {
    charset = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"];
}

export class NorthSouthEditorField extends EditorField {
    charset = ["N", "S"];
}


export class EastWestEditorField extends EditorField {
    charset = ["E", "W"];
}

export class RunwaySurfaceEditorField extends EditorField {
    charset = ["HRD", "SFT"];
}
