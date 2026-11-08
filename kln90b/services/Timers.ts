import {CalcTickable, TICK_TIME_CALC} from "../TickController";
import {Sensors} from "../Sensors";
import {FLT_TIMER_POWER, KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {DtPageState} from "../data/VolatileMemory";
import {EventBus, UserSetting} from "@microsoft/msfs-sdk";
import {UserMemoryLostEvent} from "../PowerSupply";

const SAVE_INTERVALL = 60000;

export class Timers implements CalcTickable {
    private flightTimerSetting: UserSetting<boolean>;
    private totalTimeSetting: UserSetting<number>;
    private totalTime: number;

    private intSaveCount = 0;

    constructor(bus: EventBus, private sensors: Sensors, settings: KLN90BUserSettings, private state: DtPageState) {
        this.flightTimerSetting = settings.getSetting("flightTimer");
        this.totalTimeSetting = settings.getSetting("totalTime");
        this.totalTime = this.totalTimeSetting.get();
        console.log("total time: ", this.totalTime);
        //#461: the total time of STA 4 is part of the user memory a failed battery loses at the power-on
        bus.getSubscriber<UserMemoryLostEvent>().on("userMemoryLost").handle(() => this.totalTime = 0);
    }

    public tick(): void {
        if (this.flightTimerSetting.get() === FLT_TIMER_POWER || this.sensors.in.gps.groundspeed >= 30) {
            this.state.flightTimer += TICK_TIME_CALC / 1000;
            if (this.state.departureTime === null) {
                this.state.departureTime = this.sensors.in.gps.timeZulu.addSeconds(0); //A copy, the GPS advances its time object in place without a fix and in take-home mode
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