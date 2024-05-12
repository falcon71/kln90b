import {EventBus, NodeReference} from "@microsoft/msfs-sdk";
import {PowerEvent, PowerEventData} from "./PowerButton";
import {ErrorEvent} from "./controls/ErrorPage";

export const TICK_TIME_DISPLAY = 250;
export const TICK_TIME_CALC = 1000;


export interface DisplayTickable {
    tick(blink: boolean): void;

}

export interface CalcTickable {
    tick(): void;

}

/**
 * The KLN 90B is an old and slow device. The display lags visibly and calculations are slow. This class drives
 * the internal tick.
 * In the real unit, the display is a CRT screen and line by line would be refreshed. We however simply redraw it at a
 * rate of 4 hz. See maintenance manual page 43 for details (Figure 9, CRT Controller Timine Characteristics).
 * This imposes the rule, that DOM manipulationss are only ever allowed within a tick, not when
 * a state changes are the user interacts with the device!
 */
export class TickController {

    private blink = 0;
    private displayIntervallID: number = 0;
    private calcIntervallID: number = 0;

    private isEnabled = true;
    private isPowered = false;

    /**
     *
     * @param bus
     * @param displayTickables The display runs at 4hz
     * @param calcTickables Sensonrs and calculations run at 1hz
     */
    constructor(private readonly bus: EventBus, private readonly displayTickables: DisplayTickable[], private readonly calcTickables: CalcTickable[]) {

        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.handlePowerChange.bind(this));
    }

    public static checkRef(...refs: NodeReference<any>[]): boolean {
        return refs.every(ref => ref.getOrDefault() !== null);
    }

    public tickDisplay(): void {
        this.blink = (this.blink + 1) % 4;
        const blink = this.blink == 0;
        for (const tickable of this.displayTickables) {
            try {
                tickable.tick(blink);
            } catch (e) {
                console.error(e);
                if (e instanceof Error) {
                    this.bus.getPublisher<ErrorEvent>().pub("error", e);
                }
            }
        }
    }

    public tickCalc(): void {
        for (const tickable of this.calcTickables) {
            try {
                tickable.tick();
            } catch (e) {
                console.error(e);
                if (e instanceof Error) {
                    this.bus.getPublisher<ErrorEvent>().pub("error", e);
                }
            }
        }
    }

    public setEnabled(enabled: boolean): void {
        if (this.isEnabled === enabled) {
            return;
        }

        this.isEnabled = enabled;
        this.setupLoops();
    }

    private handlePowerChange(evt: PowerEventData): void {
        this.isPowered = evt.isPowered;
        this.setupLoops();
    }

    private setupLoops() {
        if (this.isPowered && this.isEnabled) {
            console.log("starting ticks");
            this.displayIntervallID = window.setInterval(this.tickDisplay.bind(this), TICK_TIME_DISPLAY);
            this.calcIntervallID = window.setInterval(this.tickCalc.bind(this), TICK_TIME_CALC);
        } else {
            console.log("ending ticks");
            window.clearInterval(this.displayIntervallID);
            window.clearInterval(this.calcIntervallID);
        }
    }

}