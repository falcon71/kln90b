import {EventBus, NodeReference} from "@microsoft/msfs-sdk";
import {PowerEvent, PowerEventData} from "./PowerButton";
import {ErrorEvent} from "./controls/ErrorPage";

export const TICK_TIME_DISPLAY = 250;
export const TICK_TIME_CALC = 1000;
export const TICK_TIME_SIGNALS = 1000 / 16;


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
 *
 * The calculation rate seems to be one second. Observe the DIS field at 35:15:
 * https://youtu.be/zWsMxpqo5v4?si=nlakArKashayZBhh&t=2115
 * The aircraft takes 0.78sec for 0.1NM and the display skips a digit every now and then. Since the refresh rate of the
 * screen is higher, it appears that the calculations are done once per second. Page 189 in the maintenance manual
 * mentions peaks in their circuitry with a 1HZ repetition, further strengthening this theory.
 */
export class TickController {

    private blink = 0;
    private displayIntervallID: number = 0;
    private calcIntervallID: number = 0;
    private signalsIntervallID: number = 0;

    private isEnabled = true;
    private isPowered = false;

    /**
     *
     * @param bus
     * @param displayTickables The display runs at 4hz
     * @param calcTickables Sensonrs and calculations run at 1hz
     * @param signalTickables Analog filtered signals by circuitry, like the deviation bar signal (Page 186 in the maintenance manual)
     */
    constructor(private readonly bus: EventBus, private readonly displayTickables: DisplayTickable[], private readonly calcTickables: CalcTickable[], private readonly signalTickables: CalcTickable[]) {

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

    public tickSignals(): void {
        for (const tickable of this.signalTickables) {
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
            this.signalsIntervallID = window.setInterval(this.tickSignals.bind(this), TICK_TIME_SIGNALS);
        } else {
            console.log("ending ticks");
            window.clearInterval(this.displayIntervallID);
            window.clearInterval(this.calcIntervallID);
            window.clearInterval(this.signalsIntervallID);
        }
    }

}