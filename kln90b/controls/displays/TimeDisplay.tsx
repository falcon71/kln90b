import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {format} from "numerable";
import {TimeStamp} from "../../data/Time";

/**
 * Displays a time in the format HH:MM
 */
export class TimeDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    public isVisible = true;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public time: TimeStamp | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatTime()}</span>);
    }

    public tick(blnk: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        if (this.isVisible) {
            this.ref!.instance.classList.remove("d-none");
        } else {
            this.ref!.instance.classList.add("d-none");
        }
        this.ref.instance.innerText = this.formatTime();
    }

    private formatTime(): string {
        if (this.time === null) {
            return "--:--";
        }

        return `${format(this.time.getHours(), "00")}:${format(this.time.getMinutes(), "00")}`;
    }
}