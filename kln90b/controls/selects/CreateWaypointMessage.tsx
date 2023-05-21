import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {Button} from "../Button";
import {TickController} from "../../TickController";


type CreateWaypointMessageTypes = {
    userPos: Button,
    presPos: Button,
}

export class CreateWaypointMessage implements UiElement {


    readonly children: UIElementChildren<CreateWaypointMessageTypes>;

    protected readonly ref: NodeReference<HTMLDivElement> = FSComponent.createRef<HTMLDivElement>();

    private isVisible = false;

    constructor(createUserPosHandler: () => void, createPresentPosHandler: () => void) {
        this.children = new UIElementChildren<CreateWaypointMessageTypes>({
            userPos: new Button("USER POS?", createUserPosHandler),
            presPos: new Button("PRES POS?", createPresentPosHandler),
        });
    }

    render(): VNode {
        return (<div ref={this.ref} class="d-none">
            <br/>
            CREATE NEW<br/>
            WPT AT:<br/>
            {this.children.get("userPos").render()}<br/>
            {this.children.get("presPos").render()}
        </div>);
    }

    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        if (this.isVisible) {
            this.ref.instance.classList.remove("d-none");
        } else {
            this.ref.instance.classList.add("d-none");
        }
    }

    public setVisible(visible: boolean) {
        this.isVisible = visible;
        this.children.get("userPos").isReadonly = !visible;
        this.children.get("presPos").isReadonly = !visible;
    }

}