import {FSComponent, UserSetting} from "@microsoft/msfs-sdk";
import {SelectField} from "./SelectField";
import {NavPageState} from "../../data/VolatileMemory";
import {TickController} from "../../TickController";
import {format} from "numerable";
import {SuperNav5Field1} from "../../settings/KLN90BUserSettings";
import {Vnav, VnavState} from "../../services/Vnav";
import {Feet} from "../../data/Units";


export class SuperNav5Field1Selector extends SelectField {


    private constructor(valueSet: string[], private setting: UserSetting<SuperNav5Field1>, private state: NavPageState, private vnav: Vnav, changedCallback: (value: number) => void) {
        super(valueSet, setting.get(), changedCallback);
    }

    public static build(setting: UserSetting<SuperNav5Field1>, state: NavPageState, vnav: Vnav): SuperNav5Field1Selector {
        return new SuperNav5Field1Selector(["ETE   ", "XTK   ", "VNAV  "], setting, state, vnav, (field) => this.saveSetting(setting, field));
    }

    private static saveSetting(setting: UserSetting<SuperNav5Field1>, field: SuperNav5Field1): void {
        setting.set(field);
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

            switch (this.value) {
                case SuperNav5Field1.ETE:
                    this.ref.instance.textContent = `Ð${this.formatEte(this.state.eteToActive)}`;
                    break;
                case SuperNav5Field1.XTK:
                    this.ref.instance.textContent = this.formatXtk(this.state.xtkToActive);
                    break;
                case SuperNav5Field1.VNAV:
                    this.ref.instance.textContent = this.getVnavString();
                    break;
            }
        }
    }

    private getVnavString(): string {
        const vnav = this.vnav;
        switch (vnav.state) {
            case VnavState.Inactive:
                return "V OFF";
            case VnavState.Armed:
                if (vnav.timeToVnav! / 60 > 10) {
                    return "V ARM";
                } else {
                    return `V${this.vnav.formatDuration(vnav.timeToVnav)}`;
                }
            case VnavState.Active:
                return `V${this.formatAlt(vnav.advisoryAltitude!)}`;
        }
    }

    private formatAlt(targetAlt: Feet): string {
        return (Math.round(targetAlt / 100) * 100).toString().padStart(5, " ");
    }

    /**
     * 3-36
     * @param time
     * @private
     */
    private formatEte(time: number | null): string {
        if (time === null) {
            return "-:--";
        }
        const totalMinutes = time / 60;
        if (totalMinutes / 60 >= 10) {
            return "-:--";
        }
        const hours = Math.floor(totalMinutes / 60);

        const minutes = totalMinutes % 60;

        return `${hours.toString()}:${format(minutes, "00")}`;
    }

    /**
     * 6-8
     * @param xtk
     * @private
     */
    private formatXtk(xtk: number | null): string {
        if (xtk === null) {
            return "--.-NM-";
        }
        const xtkDist = Math.abs(xtk);
        let xtkString;
        if (xtkDist >= 10) {
            xtkString = format(xtkDist, "000");
        } else if (xtkDist >= 1) {
            xtkString = format(xtkDist, "0.0");
        } else {
            xtkString = format(xtkDist, "0.00").substring(1); //doesn't work with just .00
        }

        let arrow;
        if (xtk < 0) {
            arrow = "›";
        } else {
            arrow = "‹";
        }

        return `${xtkString}NM${arrow}`;
    }
}