import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {padInt} from "../../data/NumberFormat";

/**
 * The mean time between failures in hours, 0 to 999 (#458). Fictional, the real unit has no such field. Closed it shows
 * OFF for 0 and the hours with an H otherwise, right aligned in four cells; open it shows the three digits and the H.
 * CLR on the closed field turns the random failures off.
 */
export class MtbfEditor extends Editor<number> {

    constructor(bus: EventBus, value: number, enterCallback: (hours: number) => void) {
        super(bus, [
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
        this.setLeadingZeroCells([0, 1]);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}><span ref={this.cellsRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}H
        </span><span ref={this.idleRef} class="d-none"></span></span>);
    }

    protected idleText(): string | null {
        if (this.value === null || this.value === 0) {
            return " OFF";
        }
        return `${this.value}H`.padStart(4, " ");
    }

    public isClearAccepted(): boolean {
        return this.isEntered || (this.value ?? 0) > 0;
    }

    public clear(): boolean {
        if (this.isEntered) {
            return super.clear();
        }
        if ((this.value ?? 0) > 0) {
            this.setValue(0);
            this.enterCallback(0);
            return true;
        }
        return false;
    }

    tick(blink: boolean): void {
        super.tick(blink);
        this.tickIdleText();
    }

    protected convertFromValue(hours: number): Rawvalue {
        const digits = padInt(hours, 3);
        return [Number(digits[0]), Number(digits[1]), Number(digits[2])];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        return Promise.resolve(Number(String(rawValue[0]) + String(rawValue[1]) + String(rawValue[2])));
    }
}
