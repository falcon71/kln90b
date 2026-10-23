import {PageProps} from "../Page";
import {MainPage} from "../MainPage";
import {MakeRoomPage} from "./MakeRoomPage";

/**
 * #222: asks once per waypoint that a procedure load must delete from the front of FPL 0, numbering them from 1;
 * nothing is deleted before ENT on the last question, which calls `onContinue` of the load. CLR or CRSR on any of them
 * cancels (#385). Pushed on the left with the APT page as its parent.
 */
export class ProcedureMakeRoomPage extends MakeRoomPage {
    private asked = 1;

    constructor(props: PageProps, private readonly count: number, private readonly continueLoad: () => void) {
        super(props, 1);
    }

    protected onContinue(): void {
        if (this.asked < this.count) {
            this.asked++;
            this.setWaypointNumber(this.asked);
            return;
        }
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
        this.continueLoad();
    }

    protected onCancel(): void {
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
    }
}
