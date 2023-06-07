import {LVAR_RIGHT_SCAN} from "./LVars";
import {SimVarValueType} from "@microsoft/msfs-sdk";

export class Hardware {

    public isScanPulled: boolean = false;

    constructor() {
        SimVar.SetSimVarValue(LVAR_RIGHT_SCAN, SimVarValueType.Bool, this.isScanPulled);
    }

    public setScanPulled(scanPulled: boolean): void{
        if(scanPulled !== this.isScanPulled){
            this.isScanPulled = scanPulled;
            SimVar.SetSimVarValue(LVAR_RIGHT_SCAN, SimVarValueType.Bool, scanPulled);
        }
    }

}