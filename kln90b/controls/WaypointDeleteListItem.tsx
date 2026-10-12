import {Facility} from '@microsoft/msfs-sdk';
import {PageProps} from '../pages/Page';
import {StatusLineMessageEvents} from "./StatusLine";
import {ListItemProps, SimpleListItem} from "./ListItem";
import {MainPage} from "../pages/MainPage";
import {WaypointConfirmPage} from "../pages/right/WaypointConfirmPage";
import {SixLineHalfPage} from "../pages/FiveSegmentPage";
import {EnterResult} from "../pages/CursorController";


export class WaypointDeleteListItem extends SimpleListItem<Facility> {
    /**
     * The waypoint page this item's question pushed on the right, while the question is open
     */
    private pushedPage: SixLineHalfPage | null = null;

    public constructor(props: ListItemProps<Facility> & PageProps, private parent: SixLineHalfPage) {
        super(props);
    }

    public setFocused(focused: boolean) {
        if (this.isEntered) {
            this.popPushedPage();
        }
        super.setFocused(focused);
    }

    enter(): Promise<EnterResult> {
        if (this.isEntered) {
            //5-20 steps 3 and 4 cover the deletion; the right page's return is by analogy to 3-14 (medium, #316)
            this.popPushedPage();
        }
        return super.enter();
    }

    clear(): boolean {
        if (this.props.onDelete === undefined) {
            return false;
        }
        if (this.isEntered) { //4-5 delete can be cancelled by pressing clear again
            this.popPushedPage();
            this.isEntered = false;
            return true;
        }

        if (this.props.onBeforeDelete !== undefined) {
            const res = this.props.onBeforeDelete(this.props.value);
            if (res !== null) {
                this.props.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", res);
                return true;
            }
        }
        WaypointConfirmPage.showWaypointconfirmation({
            ...this.getPageProps(),
            facility: this.props.value,
            callingEditor: null,
        }, this.parent); //We are the left page, that means we get priority and we will see the enter from the list
        const mainPage = this.getPageProps().pageManager.getCurrentPage() as MainPage;
        this.pushedPage = mainPage.getRightPage();

        this.isEntered = true;
        return true;
    }

    /**
     * Pops the waypoint page of the question, unless a right knob has already closed it (#358)
     */
    private popPushedPage(): void {
        const mainPage = this.getPageProps().pageManager.getCurrentPage() as MainPage;
        if (this.pushedPage !== null && mainPage.getRightPage() === this.pushedPage) {
            mainPage.popRightPage();
        }
        this.pushedPage = null;
    }

    private getPageProps(): PageProps {
        return this.props as any;
    }

}