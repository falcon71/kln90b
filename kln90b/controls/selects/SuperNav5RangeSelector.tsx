import {FSComponent, UserSetting} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {TickController} from "../../TickController";
import {NavPageState} from "../../data/VolatileMemory";
import {knownMapRange, MAP_RANGES} from "../../data/MapRanges";

const RANGES = ["AUTO", ...MAP_RANGES.map(r => r.toString().padEnd(4, " "))];

export class SuperNav5RangeSelector extends SelectField {


    private constructor(private rangeSetting: UserSetting<number>, private navState: NavPageState, changedCallback: (value: number) => void) {
        super(RANGES, rangeSetting.get() === 0 ? 0 : RANGES.indexOf(rangeSetting.get().toString().padEnd(4, " ")), changedCallback);
    }

    public static build(rangeSetting: UserSetting<number>, navState: NavPageState): SuperNav5RangeSelector {
        if (rangeSetting.get() !== 0) {
            rangeSetting.set(knownMapRange(rangeSetting.get())); //#236, 0 is AUTO
        }
        return new SuperNav5RangeSelector(rangeSetting, navState, (range) => this.saveRange(rangeSetting, range));
    }

    private static saveRange(rangeSetting: UserSetting<number>, rangeIdx: number): void {
        const range = rangeIdx === 0 ? 0 : Number(RANGES[rangeIdx]);
        rangeSetting.set(range);
    }

    /**
     * 3-35
     * @param blink
     */
    tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        if (this.isFocused) {
            this.ref.instance.textContent = this.valueSet[this.value];
            this.ref!.instance.classList.add("inverted");
        } else {
            this.ref!.instance.classList.remove("inverted");
            if (this.value === 0) {
                this.ref.instance.textContent = this.navState.superNav5ActualRange.toString();
            } else {
                this.ref.instance.textContent = this.valueSet[this.value];
            }
        }
    }
}