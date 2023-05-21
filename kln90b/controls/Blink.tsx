import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../TickController";
import {NO_CHILDREN, UiElement} from "../pages/Page";


export class Blink implements UiElement {
    readonly children = NO_CHILDREN;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(private contents: String) {
    }

    render(): VNode {
        return (<span class="inverted" ref={this.ref}>{this.contents}</span>);
    }

    public tick(blnk: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        if (blnk) {
            this.ref.instance.classList.add("blink");
        } else {
            this.ref.instance.classList.remove("blink");
        }
    }
}