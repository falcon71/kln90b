import {format} from "numerable";
import {SelectField} from "./SelectField";
import {NavMode, NavPageState} from "../../data/VolatileMemory";

/**
 * 5-38: the scales the pilot can select in the current mode. In the approach-arm mode nothing less sensitive than 1 NM,
 * except the 5 NM the unit keeps while armed beyond 30 NM (6-1); once left, it cannot be selected again (#160)
 */
function selectableScales(nav: NavPageState): number[] {
    switch (nav.navmode) {
        case NavMode.ENR_LEG:
        case NavMode.ENR_OBS:
            return [0.3, 1, 5];
        case NavMode.ARM_LEG:
        case NavMode.ARM_OBS:
            return nav.xtkScale >= 5 ? [0.3, 1, 5] : [0.3, 1];
        case NavMode.APR_LEG:
            return [0.3];
    }
}

/**
 * The scale the field shows: the step the scale is at or ramping to. The ARM ramp (5 to 1) shows 1.00, and APR always
 * 0.30, also on the tick of the activation, where the scale is still exactly 1 (characterization, #160)
 */
function shownScale(nav: NavPageState): number {
    if (nav.navmode === NavMode.APR_LEG || nav.xtkScale < 1) {
        return 0.3;
    }
    return nav.xtkScale < 5 ? 1 : 5;
}

const formatScale = (scale: number): string => format(scale, "0.00");

/**
 * The CDI scale field of MOD 1 and MOD 2 (5-38)
 */
export class CdiScaleField extends SelectField {
    private readonly shown: { scales: number[] };

    constructor(private readonly navState: NavPageState) {
        const shown = {scales: selectableScales(navState)};
        //#260: a knob click sets the scale from the list the pilot saw, not from the list of a mode that changed since
        super(shown.scales.map(formatScale), shown.scales.indexOf(shownScale(navState)), idx => navState.xtkScale = shown.scales[idx]);
        this.shown = shown;
    }

    public tick(blink: boolean): void {
        //The choices follow the mode at every display tick (#260)
        this.shown.scales = selectableScales(this.navState);
        this.valueSet = this.shown.scales.map(formatScale);
        this.value = this.shown.scales.indexOf(shownScale(this.navState));
        super.tick(blink);
    }
}
