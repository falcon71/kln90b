import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Seconds} from "../../data/Units";
import {format} from "numerable";

/**
 * Displays a duration in the format HH:MM
 */
export class DurationDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    public isVisible = true;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public time: Seconds | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatTime()}</span>);
    }

    public tick(blink: boolean): void {
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
        return formatDuration(this.time);
    }
}

export function formatDuration(duration: Seconds | null): string {
    if (duration === null) {
        return "--:--";
    }
    const totalMinutes = duration / 60;
    if (totalMinutes / 60 >= 100) {
        return "--:--";
    }
    const hours = Math.floor(totalMinutes / 60);


    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `  :${format(minutes, "00")}`;
    } else {
        return `${hours.toString().padStart(2, " ")}:${format(minutes, "00")}`;
    }
}