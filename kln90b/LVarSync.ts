import {LVAR_BRIGHTNESS, LVAR_POWER, LVAR_RIGHT_SCAN} from "./LVars";
import {SimVarValueType} from "@microsoft/msfs-sdk";
import {Hardware} from "./Hardware";
import {PowerButton} from "./PowerButton";
import {TICK_TIME_DISPLAY} from "./TickController";

const SYNC_TICK = 100;

export class LVarSync{


    constructor(private readonly hardware: Hardware, private readonly powerButton: PowerButton) {
        // window.setInterval(this.tick.bind(this), SYNC_TICK);
    }


    private tick(): void{
        this.hardware.setScanPulled(!!SimVar.GetSimVarValue(LVAR_RIGHT_SCAN, SimVarValueType.Bool));
        this.powerButton.setPowered(!!SimVar.GetSimVarValue(LVAR_POWER, SimVarValueType.Bool));
        this.powerButton.setBrightness(SimVar.GetSimVarValue(LVAR_BRIGHTNESS, SimVarValueType.Percent));
    }

}