import {FSComponent, UserSetting} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {TickController} from "../../TickController";
import {NavPageState} from "../../data/VolatileMemory";

const RANGES = ["AUTO", "1   ", "2   ", "3   ", "5   ", "10  ", "15  ", "20  ", "25  ", "30  ", "40  ", "60  ", "80  ", "100 ", "120 ", "160 ", "240 ", "320 ", "480 ", "1000"]; //I have no idea, which ranges the device supports

export class SuperNav5RangeSelector extends SelectField {


    private constructor(private rangeSetting: UserSetting<number>, private navState: NavPageState, changedCallback: (value: number) => void) {
        super(RANGES, rangeSetting.get() === 0 ? 0 : RANGES.indexOf(rangeSetting.get().toString().padEnd(4, " ")), changedCallback);
    }

    public static build(rangeSetting: UserSetting<number>, navState: NavPageState): SuperNav5RangeSelector {
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