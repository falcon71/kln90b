import {CalcTickable, TICK_TIME_CALC} from "../TickController";
import {Sensors} from "../Sensors";
import {FLT_TIMER_POWER, KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {DtPageState} from "../data/VolatileMemory";
import {UserSetting} from "@microsoft/msfs-sdk";

const SAVE_INTERVALL = 60000;

export class Timers implements CalcTickable {
    private flightTimerSetting: UserSetting<boolean>;
    private totalTimeSetting: UserSetting<number>;
    private totalTime: number;

    private intSaveCount = 0;

    constructor(private sensors: Sensors, settings: KLN90BUserSettings, private state: DtPageState) {
        this.flightTimerSetting = settings.getSetting("flightTimer");
        this.totalTimeSetting = settings.getSetting("totalTime");
        this.totalTime = this.totalTimeSetting.get();
        console.log("total time: ", this.totalTime);
    }

    public tick(): void {
        if (this.flightTimerSetting.get() === FLT_TIMER_POWER || this.sensors.in.gps.groundspeed >= 30) {
            this.state.flightTimer += TICK_TIME_CALC / 1000;
            if (this.state.departureTime === null) {
                this.state.departureTime = this.sensors.in.gps.timeZulu;
            }
        }
        this.totalTime += TICK_TIME_CALC / 1000;
        this.intSaveCount += TICK_TIME_CALC;
        if (this.intSaveCount >= SAVE_INTERVALL) {
            //we save this every 60 seconds
            this.totalTimeSetting.set(this.totalTime);
            this.intSaveCount = 0;
        }
    }

}