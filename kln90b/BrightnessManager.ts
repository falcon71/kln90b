import {EventBus, MathUtils, SimVarValueType, Wait} from "@microsoft/msfs-sdk";
import {PowerEvent, PowerEventData} from "./PowerButton";
import {KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {LVAR_BRIGHTNESS} from "./LVars";

const BRIGHTNESS_STEP = 0.05;
const TIME_UNTIL_COLD = 10 * 60 * 1000; //The device is considered "cold" after this time
const TIME_TO_WARM = 6000; //takes about 6 seconds to warm up: https://youtube.com/shorts/9We5fcd2-VE?feature=share

const BRIGHTNESS_TICKRATE = 100;
const TIME_TO_REACH_FULL_BRIGHTNESS = 4000;

export class BrightnessManager {

    private brightnessSetting = 1; //Position of the knob
    private possibleBrightness = 0; //Depends on power
    private container: HTMLElement;
    private simVarWritten: boolean = false;

    constructor(bus: EventBus, private readonly planeSetting: KLN90PlaneSettings) {
        this.container = document.getElementById('InstrumentsContainer')!;
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.powerChanged.bind(this));

        this.brightnessSetting = SimVar.GetSimVarValue(LVAR_BRIGHTNESS, SimVarValueType.Number);
        if(this.brightnessSetting === 0){
            this.setBrightness(1); //Initialize with 1
        }
    }

    public incBrightness(): void {
        this.setBrightness(this.brightnessSetting + BRIGHTNESS_STEP);
    }

    public decBrightness(): void {
        this.setBrightness(this.brightnessSetting - BRIGHTNESS_STEP);
    }

    public setBrightnessExternal(brightness: number): void {
        if (!this.simVarWritten) {
            if (this.brightnessSetting == brightness) {
                this.simVarWritten = true; //During startup it does not seem to work well. If both values are the same, then the SimVar has been written
                return;
            }
            //Happens when the users uses the events. We are about to write the simvar, but the read operation will still yield the old value, this resetting the user action
            console.log(`Ignoring setBrightnessExternal, last Value is not yet written. Current: ${this.brightnessSetting} External: ${brightness}`);
            return;
        }
        this.setBrightness(brightness);
    }

    private setBrightness(brightness: number): void {
        brightness = MathUtils.clamp(brightness, 0, 1);
        if(this.brightnessSetting === brightness){
            return;
        }

        this.brightnessSetting = brightness;
        this.updateLvar();
        this.refreshElement();
    }

    private updateLvar(): void{
        this.simVarWritten = false;
        SimVar.SetSimVarValue(LVAR_BRIGHTNESS, SimVarValueType.Number, this.brightnessSetting).then(() => this.simVarWritten = true);
    }


    private refreshElement() {
        console.log("Brightness", this.brightnessSetting, this.possibleBrightness);
        this.container.style.opacity = Math.min(this.brightnessSetting, this.possibleBrightness).toString();
    }

    private powerChanged(evt: PowerEventData) {
        if (evt.isPowered) {
            if (this.planeSetting.debugMode) {
                this.possibleBrightness = 1;
                this.refreshElement();
            } else {
                this.possibleBrightness = 0;
                this.refreshElement();
                this.powerUp(evt.timeSincePowerChange);
            }
        } else {
            this.possibleBrightness = 0;
            this.refreshElement();
        }
    }

    private async powerUp(timePoweredOff: number) {
        const warmUpTime = Math.min(timePoweredOff / TIME_UNTIL_COLD * TIME_TO_WARM, TIME_TO_WARM);
        await Wait.awaitDelay(warmUpTime);
        const brightnessIncrease = 1 / TIME_TO_REACH_FULL_BRIGHTNESS * BRIGHTNESS_TICKRATE;
        while (this.possibleBrightness < 1) {
            await Wait.awaitDelay(BRIGHTNESS_TICKRATE);

            this.possibleBrightness = Math.min(this.possibleBrightness + brightnessIncrease, 1);
            this.refreshElement();
        }
    }
}