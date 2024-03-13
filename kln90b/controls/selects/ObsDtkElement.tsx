import {FSComponent, NavMath, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN} from "../../pages/Page";
import {EnterResult, Field} from "../../pages/CursorController";
import {format} from "numerable";
import {TickController} from "../../TickController";
import {KLN90PlaneSettings} from "../../settings/KLN90BPlaneSettings";
import {Sensors} from "../../Sensors";
import {NavPageState} from "../../data/VolatileMemory";
import {ModeController} from "../../services/ModeController";

/**
 * 5-35 Unlike the BearingFieldset, this is one whole select
 */
export class ObsDtkElement implements Field {


    readonly children = NO_CHILDREN;
    public readonly isEntered: boolean = false;
    public isFocused: boolean = false;
    public isReadonly: boolean = true;
    public isVisible: boolean = true;

    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();


    constructor(private readonly planeSettings: KLN90PlaneSettings,
                private readonly sensors: Sensors,
                private readonly navState: NavPageState,
                private readonly modeController: ModeController) {
    }

    public clear(): boolean {
        return false;
    }

    public enter(): Promise<EnterResult> {
        return Promise.resolve(EnterResult.Not_Handled);
    }

    public innerLeft(): boolean {
        this.modeController.setObs(NavMath.normalizeHeading(this.navState.obsMag - 1));
        return true;
    }

    public innerRight(): boolean {
        this.modeController.setObs(NavMath.normalizeHeading(this.navState.obsMag + 1));
        return false;
    }

    public isClearAccepted(): boolean {
        return false;
    }

    public isEnterAccepted(): boolean {
        return false;
    }

    public outerLeft(): boolean {
        return false;
    }

    public outerRight(): boolean {
        return false;
    }

    public render(): VNode {
        return (
            <span ref={this.ref}>{this.getDisplayValue()}</span>);
    }

    public setFocused(focused: boolean): void {
        this.isFocused = focused;
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        if (this.isVisible) {
            this.ref.instance.classList.remove("d-none");
        } else {
            this.ref.instance.classList.add("d-none");
        }

        this.isReadonly = !this.canObsBeEntered();

        if (blink && this.isFlashing()) {
            this.ref.instance.classList.add("blink");
        } else {
            this.ref.instance.classList.remove("blink");
        }

        this.ref.instance.textContent = this.getDisplayValue();

        if (this.isFocused) {
            this.ref!.instance.classList.add("inverted");
        } else {
            this.ref!.instance.classList.remove("inverted");
        }
    }

    private getDisplayValue(): string {
        const dtk = this.modeController.getDtkOrObsMagnetic();
        return dtk === null ? "---°" : `${format(dtk, "000")}°`;
    }

    private canObsBeEntered(): boolean {
        return this.modeController.isObsModeActive() &&
            (this.planeSettings.output.obsTarget !== 0 || this.sensors.in.obsMag === null);
    }

    //4-9
    private isFlashing(): boolean {
        const dtk = this.modeController.getDtkOrObsMagnetic();
        return this.sensors.in.obsMag !== null && dtk !== null && Math.abs(NavMath.diffAngle(this.sensors.in.obsMag, dtk)) > 10;
    }

    public keyboard(key: string): boolean {
        return false;
    }
}