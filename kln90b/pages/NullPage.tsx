import {DisplayComponent, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {NO_CHILDREN, Page} from "./Page";

/**
 * Empty Page, when the device is turned off
 */
export class NullPage extends DisplayComponent<any> implements Page {

    readonly children = NO_CHILDREN;

    public render(): VNode {
        return (
            <pre></pre>
        );
    }

    public isEnterAccepted(): boolean {
        return false;
    }

    public onInteractionEvent(evt: string): boolean {
        return true;
    }

    public tick(blink: boolean): void {
    }

    public isLeftCursorActive(): boolean {
        return false;
    }

    public isRightCursorActive(): boolean {
        return false;
    }


    public leftPageName(): string {
        return "     ";
    }

    public rightPageName(): string {
        return "     ";
    }

    public isMessagePageShown(): boolean {
        return false;
    }

    public hasStatusline(): boolean {
        return false;
    }
}