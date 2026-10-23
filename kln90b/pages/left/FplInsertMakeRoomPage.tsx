import {PageProps} from "../Page";
import {MainPage} from "../MainPage";
import {MakeRoomPage} from "./MakeRoomPage";

/**
 * #380: asked by the inner-knob click that would add a waypoint to a full FPL 0, before the insert row opens. ENT deletes
 * one waypoint from the front (one step of roomSteps) and hands back to the FPL page, which asks again or opens the row;
 * CLR or CRSR cancels (#385). Pushed on the left over the FPL 0 page (a context of its own, maintainer)
 */
export class FplInsertMakeRoomPage extends MakeRoomPage {
    constructor(props: PageProps, private readonly deleteAndContinue: () => void, private readonly cancel: () => void) {
        super(props, 1);
    }

    protected onContinue(): void {
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
        this.deleteAndContinue();
    }

    protected onCancel(): void {
        (this.props.pageManager.getCurrentPage() as MainPage).popLeftPage();
        this.cancel();
    }
}
