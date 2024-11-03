import {PageProps} from "../pages/Page";
import {Sensors} from "../Sensors";
import {ModeController} from "../services/ModeController";
import {format} from "numerable";
import {NavMath} from "@microsoft/msfs-sdk";
import {NavMode, NavPageState} from "./VolatileMemory";
import {KLNFixType} from "./flightplan/FlightPlan";
import {Database} from "./navdata/Database";
import {KLNMagvar} from "./navdata/KLNMagvar";
import {PageManager} from "../pages/PageManager";
import {MainPage} from "../pages/MainPage";
import {AltPage} from "../pages/left/AltPage";
import {Message} from "./MessageHandler";
import {Vnav, VnavState} from "../services/Vnav";
import {Nav4LeftPage, Nav4RightPage} from "../pages/left/Nav4Page";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";

/*
We have pretty all messages except for failures and RAIM problems
 */

export function buildPersistentMessages(props: PageProps): Message[] {
    const messages: Message[] = [
        new AltitudeFailMessage(props.planeSettings),
        new ArmGPSApproachMessage(props.memory.navPage),
        new DatabaseOutOfDateMessage(props.database),
        new IfRequiredSelectObsMessage(props.memory.navPage, props.modeController),
        new MagvarMessage(props.magvar, props.memory.navPage),
        new Obs200NMMessage(props.memory.navPage, props.modeController),
        new PressAltToSetBaroMessage(props.memory.navPage, props.pageManager),
        new VnavAlertMessage(props.vnav, props.pageManager),
    ];

    if (props.planeSettings.output.obsTarget === 0) {
        messages.push(new AdjustCourseToWithObsReadingMessage(props.sensors, props.modeController));
    } else {
        messages.push(new AdjustCourseMessage(props.sensors));
    }

    return messages;
}


class AdjustCourseToWithObsReadingMessage implements Message {

    public message: string[] = ["ADJ NAV IND CRS"];
    public seen: boolean = false;
    private forceShow = false;

    private lastCourse: number | null = null;
    private validUntil: number = 0;


    constructor(private readonly sensors: Sensors, private readonly modeController: ModeController) {
    }


    public isConditionValid(): boolean {
        //This message has two conditions. They must both be here, otherwise this message could be shown twice
        const dtk = this.modeController.getDtkOrObsMagnetic();
        if (dtk === null || this.modeController.isObsModeActive()) {
            return false;
        }

        this.message = [`ADJ NAV IND CRS TO ${format(dtk, "000")}°`];

        if (this.lastCourse === null || Math.abs(NavMath.diffAngle(this.lastCourse, dtk)) > 5) {
            //First part: Whenever turn changes to more than 5 degress
            this.forceShow = true;
            this.validUntil = Date.now() + 10 * 1000;
            //The time appears to be about 30 seconds: https://youtu.be/S1lt2W95bLA?t=2244 https://youtu.be/S1lt2W95bLA?t=2574
        }
        this.lastCourse = dtk;

        if (this.seen) {
            this.forceShow = false;
        }

        if (this.forceShow && Date.now() < this.validUntil) {
            return true;
        }

        if (this.sensors.in.obsMag === null) {
            return false;
        }

        //Second part, if we can read in, then check for a difference
        return Math.abs(NavMath.diffAngle(dtk, this.sensors.in.obsMag)) > 5;
    }
}

class AdjustCourseMessage implements Message {

    public readonly message: string[] = ["ADJ NAV IND CRS"];
    public seen: boolean = false;


    constructor(private readonly sensors: Sensors) {
    }

    public isConditionValid(): boolean {
        if (this.sensors.out.obsOut === null || this.sensors.in.obsMag === null) {
            return false;
        }

        return Math.abs(NavMath.diffAngle(this.sensors.out.obsOut, this.sensors.in.obsMag)) > 0.5;
    }
}

class AltitudeFailMessage implements Message {

    public message: string[] = ["ALTITUDE FAIL"];
    public seen: boolean = false;

    constructor(private readonly planeSettings: KLN90PlaneSettings) {
    }

    public isConditionValid(): boolean {
        return !this.planeSettings.vfrOnly && !this.planeSettings.input.altimeterInterfaced && !this.planeSettings.input.airdata.isInterfaced
    }
}

class ArmGPSApproachMessage implements Message {

    public message: string[] = ["ARM GPS APPROACH"];
    public seen: boolean = false;

    constructor(private readonly navstate: NavPageState) {
    }


    public isConditionValid(): boolean {
        const active = this.navstate.activeWaypoint.getActiveLeg();
        if (active === null || active.fixType !== KLNFixType.FAF || !(this.navstate.navmode === NavMode.ENR_LEG || this.navstate.navmode === NavMode.ENR_OBS)) {
            return false;
        }

        return this.navstate.distToActive! <= 3;
    }
}

class DatabaseOutOfDateMessage implements Message {

    public message: string[] = ["DATA BASE OUT OF DATE", "ALL DATA MUST BE", "CONFIRMED BEFORE USE"];
    public seen: boolean = false;
    private wasValid: boolean = false;

    constructor(private readonly daabase: Database) {
    }


    public isConditionValid(): boolean {
        const dbValidNow = this.daabase.isAiracCurrent();
        const showMessage = this.wasValid && !dbValidNow;

        this.wasValid = dbValidNow;

        return showMessage;
    }
}


class IfRequiredSelectObsMessage implements Message {

    public message: string[] = ["IF REQUIRED SELECT OBS"];
    public seen: boolean = false;

    constructor(private readonly navstate: NavPageState, private readonly modeController: ModeController) {
    }


    public isConditionValid(): boolean {
        const active = this.navstate.activeWaypoint.getActiveLeg();
        if (active === null || active.askObs !== true || this.modeController.isObsModeActive()) {
            return false;
        }

        return this.navstate.distToActive! <= 4;
    }
}


class MagvarMessage implements Message {

    public readonly message: string[] = ["MAGNETIC VAR INVALID", "ALL DATA REFERENCED", "TO TRUE NORTH"];
    public seen: boolean = false;


    constructor(private readonly magvar: KLNMagvar, private readonly navState: NavPageState) {
    }

    public isConditionValid(): boolean {
        return !this.magvar.isMagvarValid() && this.navState.userMagvar === 0;
    }
}


class Obs200NMMessage implements Message {

    public message: string[] = ["OBS WPT > 200NM"];
    public seen: boolean = false;

    constructor(private readonly navstate: NavPageState, private readonly modeController: ModeController) {
    }


    public isConditionValid(): boolean {
        const active = this.navstate.activeWaypoint.getActiveLeg();
        if (active === null || !this.modeController.isObsModeActive()) {
            return false;
        }

        return this.navstate.distToActive! > 200;
    }
}

class PressAltToSetBaroMessage implements Message {

    public readonly message: string[] = ["PRESS ALT TO SET BARO"];
    public seen: boolean = false;
    private lastMode: NavMode = NavMode.ENR_LEG;
    private altShown = true;


    constructor(private readonly navState: NavPageState, private readonly pageManager: PageManager) {
    }

    public isConditionValid(): boolean {
        const mode = this.navState.navmode;
        if (mode !== this.lastMode) {
            if (mode === NavMode.ARM_OBS || mode === NavMode.ARM_LEG) {
                this.altShown = false;
            }
            this.lastMode = mode;
        }

        if (!this.altShown) {
            const mainPage = this.pageManager.getCurrentPage();
            if (mainPage instanceof MainPage) {
                const leftPage = mainPage.getLeftPage();
                if (leftPage instanceof AltPage) {
                    this.altShown = true;
                }
            }
        }


        return !this.altShown;
    }
}


class VnavAlertMessage implements Message {

    public readonly message: string[] = ["VNV ALERT"];
    public seen: boolean = false;
    private nav4Shown = true;


    constructor(private readonly vnav: Vnav, private readonly pageManager: PageManager) {
    }

    public isConditionValid(): boolean {
        if (this.vnav.state !== VnavState.Armed) {
            this.nav4Shown = false;
            return false;
        }

        if (this.vnav.timeToVnav! <= 90) {
            if (!this.nav4Shown) {
                const mainPage = this.pageManager.getCurrentPage();
                if (mainPage instanceof MainPage) {
                    if (mainPage.getLeftPage() instanceof Nav4LeftPage) {
                        this.nav4Shown = true;
                    } else if (mainPage.getRightPage() instanceof Nav4RightPage) {
                        this.nav4Shown = true;
                    }
                }
            }
        } else {
            this.nav4Shown = false;
            return false;
        }


        return !this.nav4Shown;
    }
}
