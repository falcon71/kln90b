import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Seconds} from "../../data/Units";
import {format} from "numerable";

/**
 * Displays a duration in the format HH:MM. Below an hour the hours are left blank (":MM"), except in the trip form of the
 * trip pages, which keeps the hour digit ("0:MM", 3-15, figure 3-50).
 */
export class DurationDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    public isVisible = true;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public time: Seconds | null = null, private readonly tripForm: boolean = false) {
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
        return formatDuration(this.time, this.tripForm);
    }
}

export function formatDuration(duration: Seconds | null, tripForm: boolean = false): string {
    if (duration === null) {
        return "--:--";
    }
    //#223: round the total minutes first, so 59.5 minutes after a whole hour carry into the next hour instead of
    //showing :60. The figures of 5-7 round; the KLN 89 trainer's CAL 1 rounds too (2026-10-12)
    const totalMinutes = Math.round(duration / 60);
    if (totalMinutes / 60 >= 100) {
        return "--:--";
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
        return `${tripForm ? " 0" : "  "}:${format(minutes, "00")}`;
    } else {
        return `${hours.toString().padStart(2, " ")}:${format(minutes, "00")}`;
    }
}