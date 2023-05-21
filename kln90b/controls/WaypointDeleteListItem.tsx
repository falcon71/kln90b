import {Facility, FSComponent} from '@microsoft/msfs-sdk';
import {PageProps} from '../pages/Page';
import {StatusLineMessageEvents} from "./StatusLine";
import {ListItemProps, SimpleListItem} from "./ListItem";
import {MainPage} from "../pages/MainPage";
import {WaypointConfirmPage} from "../pages/right/WaypointConfirmPage";
import {SixLineHalfPage} from "../pages/FiveSegmentPage";


export class WaypointDeleteListItem extends SimpleListItem<Facility> {
    public constructor(props: ListItemProps<Facility> & PageProps, private parent: SixLineHalfPage) {
        super(props);
    }

    public setFocused(focused: boolean) {
        if (this.isEntered) {
            const mainPage = this.getPageProps().pageManager.getCurrentPage() as MainPage;
            mainPage.popRightPage();
        }
        super.setFocused(focused);
    }

    clear(): boolean {
        if (this.props.onDelete === undefined) {
            return false;
        }
        if (this.isEntered) { //4-5 delete can be cancelled by pressing clear again
            const mainPage = this.getPageProps().pageManager.getCurrentPage() as MainPage;
            mainPage.popRightPage();
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
        }, this.parent); //We are the left page, that means we get priority and we will see the enter from the list


        this.isEntered = true;
        return true;
    }

    private getPageProps(): PageProps {
        return this.props as any;
    }

}