import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../../TickController";

export type EditorFieldValue = number | null;

export abstract class EditorField implements UiElement {
    abstract readonly charset: string[];
    readonly children = NO_CHILDREN;
    public value: EditorFieldValue = null;
    public defaultValue: number = 0;
    public isFocused = false;
    public isParentFocused = false;
    public isParentBlink = false;
    /**
     * A leading zero of an entered value shows as a blank. The value stays 0; only the text changes. The editor sets
     * it from its leading zero cells (Editor.setLeadingZeroCells), and clears it while its edit is open
     */
    public isBlank = false;
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
        if (this.value == null) {
            return "_".repeat(this.fieldLength());
        }
        return this.isBlank ? " ".repeat(this.fieldLength()) : this.charset[this.value];
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

/**
 * The first character of a waypoint ident: the knob and the keyboard offer no blank (#374, checked in the KLN 89
 * trainer, 2026-10-15), so the wheel runs A to Z and 0 to 9 and round again. The charset keeps the blank, so a cell that
 * holds one (an empty field, the blank CLR leaves) still shows it and the indices stay the shared ones
 */
export class FirstIdentEditorField extends AlphabetEditorField {

    incrementChar() {
        this.value = this.value === null || this.value >= this.charset.length - 1 ? 1 : this.value + 1;
    }

    decrementChar() {
        this.value = this.value === null || this.value <= 1 ? this.charset.length - 1 : this.value - 1;
    }

    public keyboard(key: string): boolean {
        return key !== ' ' && super.keyboard(key);
    }
}

/**
 * A character of a remark on the APT 5 page (3-47): a letter, a digit, the hyphen or the blank. The hyphen follows the
 * 9 and precedes the blank (checked in the KLN 89 trainer, 2026-10-08)
 */
export class RemarkEditorField extends EditorField {

    charset = [' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '-'];

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

/**
 * The tens of the degrees of a latitude. The knob and the keyboard offer 0 to 8 (checked in the KLN 89 trainer,
 * 2026-10-08), but the cell can show the 9 of a stored latitude of 90 degrees
 */
export class LatitudeTensEditorField extends NumberEditorField {

    incrementChar() {
        this.value = this.value === null || this.value >= 8 ? 0 : this.value + 1;
    }

    decrementChar() {
        this.value = this.value === null ? 0 : this.value <= 0 ? 8 : this.value - 1;
    }

    public keyboard(key: string): boolean {
        return key !== '9' && super.keyboard(key);
    }
}

export class MonthEditorField extends EditorField {
    charset = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
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
