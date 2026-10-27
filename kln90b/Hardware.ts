import {LVAR_RIGHT_SCAN} from "./LVars";
import {SimVarValueType} from "@microsoft/msfs-sdk";

export class Hardware {

    public isScanPulled: boolean = false;

    /**
     * True while the unit is disabled for hot swapping (L:KLN90B_Disabled; the wiki page Hot Swapping and Package
     * Detection). A disabled unit is one that has been taken out of the aircraft, not one that is switched off, so the
     * flag is the physical state of the device and lives here, beside the scan knob. While it is set the unit:
     * - takes no input: no H event reaches it, the power and brightness events included, so its power follows only
     *   the electricity SimVar of panel.xml (#138, the maintainer's ruling);
     * - writes none of the GPS outputs the aircraft reads: no GPS SimVars, no GPS OVERRIDDEN claim, no "kln90b" flight
     *   planner, no EFB reply and no EFB route import. A loss of power still writes the zeroed L:KLN90B_* outputs;
     * - runs no ticks;
     * - resumes where it left off when it is put back.
     *
     * Only SimVarSync.setDisabled sets it, from its 100 ms poll of L:KLN90B_Disabled, which is the only read of that
     * LVar. Every gate reads this flag, never the LVar (the maintainer's ruling: reading the LVar is expensive), and lags
     * the LVar by at most one poll.
     */
    public isDisabled: boolean = false;

    constructor() {
        //Real unit: fictional as a signal. L:KLN90B_RightScan is the position of the front-panel right inner knob (pulled
        //out = scan), which has no connector pin
        SimVar.SetSimVarValue(LVAR_RIGHT_SCAN, SimVarValueType.Bool, this.isScanPulled);
    }

    public setScanPulled(scanPulled: boolean): void{
        if(scanPulled !== this.isScanPulled){
            this.isScanPulled = scanPulled;
            SimVar.SetSimVarValue(LVAR_RIGHT_SCAN, SimVarValueType.Bool, scanPulled);
        }
    }

}