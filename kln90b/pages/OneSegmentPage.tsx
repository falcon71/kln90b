import {DisplayComponent, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {CursorController} from "./CursorController";
import {PageProps, UiElement, UIElementChildren} from "./Page";

export abstract class SevenLinePage extends DisplayComponent<PageProps> implements UiElement {
    abstract readonly lCursorController: CursorController;
    abstract readonly rCursorController: CursorController;
    abstract children: UIElementChildren<any>;

    abstract render(): VNode

    enter(): boolean {
        return false;
    }

    isEnterAccepted(): boolean {
        return this.lCursorController.isEnterAccepted() || this.rCursorController.isEnterAccepted();
    }

    msg(): boolean {
        return false;
    }

    tick(blink: boolean): void {
    }

    public scanRight(): boolean {
        return false;
    }

    public scanLeft(): boolean {
        return false;
    }


    clear(): boolean {
        return this.lCursorController.clear() || this.rCursorController.clear();
    }

}
