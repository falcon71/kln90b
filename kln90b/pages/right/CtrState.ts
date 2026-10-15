import {PageProps} from "../Page";
import {MainPage} from "../MainPage";
import {FplPage} from "../left/FplPage";
import {CtrPageState, CtrState} from "../../data/VolatileMemory";
import {Flightplan} from "../../data/flightplan/Flightplan";

/**
 * #301 5-26: the CTR pages go back to their start state once the flight plan page on the left is left. Pages are
 * recreated on every knob step, so another instance means the page was left. Run in the display ticks of CTR 1 and
 * CTR 2. Returns the FPL page on the left, or null.
 */
export function syncCtrState(props: PageProps): FplPage | null {
    const page = (props.pageManager.getCurrentPage() as MainPage).getLeftPage();
    const state = props.memory.ctrPage;
    if (!(page instanceof FplPage)) {
        resetCtrState(state, CtrState.NO_FPL, null, null);
        return null;
    }
    if (page !== state.lastFplPage) {
        resetCtrState(state, CtrState.FPL, page, props.memory.fplPage.flightplans[page.fplIdx]);
    }
    return page;
}

export function resetCtrState(state: CtrPageState, to: CtrState, page: FplPage | null, fpl: Flightplan | null): void {
    state.state = to;
    state.lastFplPage = page;
    state.lastFpl = fpl;
    state.waypoints = [];
}
