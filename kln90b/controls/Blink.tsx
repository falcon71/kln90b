import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../TickController";
import {NO_CHILDREN, UiElement} from "../pages/Page";


export class Blink implements UiElement {
    readonly children = NO_CHILDREN;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    /**
     * @param contents The text
     * @param inverted Whether the text is shown inverse between its flashes; TEST FAIL of the Self Test page flashes
     * without (3-4)
     */
    constructor(private contents: String, private readonly inverted = true) {
    }

    render(): VNode {
        return this.inverted
            ? (<span class="inverted" ref={this.ref}>{this.contents}</span>)
            : (<span ref={this.ref}>{this.contents}</span>);
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