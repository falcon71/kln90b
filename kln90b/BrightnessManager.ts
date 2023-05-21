import {EventBus, SimVarValueType} from "@microsoft/msfs-sdk";
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

    constructor(bus: EventBus, private readonly planeSetting: KLN90PlaneSettings) {
        this.container = document.getElementById('InstrumentsContainer')!;
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.powerChanged.bind(this));

        this.brightnessSetting = SimVar.GetSimVarValue(LVAR_BRIGHTNESS, SimVarValueType.Percent);
        if(this.brightnessSetting === 0){
            this.setBrightness(1); //Initialize with 1
        }
    }

    public incBrightness(): void {
        this.brightnessSetting = Math.min(this.brightnessSetting + BRIGHTNESS_STEP, 1);
        this.updateLvar();
        this.refreshElement();
    }

    public decBrightness(): void {
        this.brightnessSetting = Math.max(this.brightnessSetting - BRIGHTNESS_STEP, 0);
        this.updateLvar();
        this.refreshElement();
    }

    public setBrightness(brightness: number): void{
        if(this.brightnessSetting === brightness){
            return;
        }

        this.brightnessSetting = brightness;
        this.updateLvar();
        this.refreshElement();
    }

    private updateLvar(): void{
        SimVar.SetSimVarValue(LVAR_BRIGHTNESS, SimVarValueType.Percent, this.brightnessSetting);
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
        await this.sleep(warmUpTime);
        const brightnessIncrease = 1 / TIME_TO_REACH_FULL_BRIGHTNESS * BRIGHTNESS_TICKRATE;
        while (this.possibleBrightness < 1) {
            await this.sleep(BRIGHTNESS_TICKRATE);

            this.possibleBrightness = Math.min(this.possibleBrightness + brightnessIncrease, 1);
            this.refreshElement();
        }
    }

    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}