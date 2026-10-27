import {PageProps} from "../pages/Page";
import {Sensors} from "../Sensors";
import {ModeController} from "../services/ModeController";
import {format} from "numerable";
import {roundBearing} from "./Coordinates";
import {NavMath} from "@microsoft/msfs-sdk";
import {NavMode, NavPageState} from "./VolatileMemory";
import {Database} from "./navdata/Database";
import {KLNMagvar} from "./navdata/KLNMagvar";
import {PageManager} from "../pages/PageManager";
import {MainPage} from "../pages/MainPage";
import {AltPage} from "../pages/left/AltPage";
import {Message} from "./MessageHandler";
import {Vnav, VnavState} from "../services/Vnav";
import {Nav4LeftPage, Nav4RightPage} from "../pages/left/Nav4Page";
import {isBaroTransmitted, KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {SustainedCondition} from "./SustainedCondition";

/**
 * How long the course must be off before a course message that waits shows: the KA 90 Installation Manual pp. 3-43 and
 * 3-45 give 12 s for a readable indicator, and the same time is carried over by analogy for a driven indicator (the
 * maintainer, 2026-10-26, #401). Counted in GPS time, which stands still while the sim is paused
 */
export const COURSE_MESSAGE_DELAY = 12_000;

/*
We have pretty all messages except for failures and RAIM problems
 */

export function buildPersistentMessages(props: PageProps): Message[] {
    return [
        new AltitudeFailMessage(props.planeSettings),
        new ArmGPSApproachMessage(props.memory.navPage),
        new DatabaseOutOfDateMessage(props.database),
        new IfRequiredSelectObsMessage(props.memory.navPage, props.modeController),
        new MagvarMessage(props.magvar, props.memory.navPage),
        new Obs200NMMessage(props.memory.navPage, props.modeController),
        new PressAltToSetBaroMessage(props.memory.navPage, props.pageManager, props.planeSettings),
        new VnavAlertMessage(props.vnav, props.pageManager),
        //Both course messages are always built: Output.ObsTarget can change while the unit runs (L:KLN90B_ObsTarget,
        //SimVarSync), so each decides on every call which indicator case applies (#401)
        new AdjustCourseToWithObsReadingMessage(props.sensors, props.modeController, props.memory.navPage, props.planeSettings),
        new AdjustCourseMessage(props.sensors, props.memory.navPage, props.planeSettings),
    ];
}


class AdjustCourseToWithObsReadingMessage implements Message {

    public message: string[] = ["ADJ NAV IND CRS"];
    public seen: boolean = false;
    private forceShow = false;

    private lastCourse: number | null = null;
    private validUntil: number = 0;
    private atStartUp = true; //Until the first evaluation after the self-test is approved (#330)


    constructor(private readonly sensors: Sensors, private readonly modeController: ModeController, private readonly navState: NavPageState,
                private readonly planeSettings: KLN90PlaneSettings) {
    }


    public isConditionValid(): boolean {
        if (this.planeSettings.output.obsTarget !== 0) {
            //4-8, B-1: no TO message when the unit slews the indicator itself. The plain message is the one for a driven
            //indicator that does not follow (#401). The next evaluation starts as a new one, so a course from before is
            //no DTK change
            this.atStartUp = true;
            return false;
        }

        if (!this.navState.isSelfTestApproved) {
            //#330: not evaluated before the self-test is approved, neither on the Turn-On page nor on the self-test page,
            //whose fixed course is part of the check and not a course to set (figure 3-4)
            this.atStartUp = true;
            return false;
        }

        //This message has two conditions. They must both be here, otherwise this message could be shown twice
        const dtk = this.modeController.getDtkOrObsMagnetic();
        if (this.atStartUp) {
            //#330: the course at the approval is where the unit starts, not a DTK change, so it opens no 30 s window,
            //and a window from before the power-off is over
            this.atStartUp = false;
            this.forceShow = false;
            this.lastCourse = dtk;
        }
        if (dtk === null || this.modeController.isObsModeActive()) {
            return false;
        }

        this.message = [`ADJ NAV IND CRS TO ${format(roundBearing(dtk), "000")}°`];

        if (this.lastCourse === null || Math.abs(NavMath.diffAngle(this.lastCourse, dtk)) > 5) {
            //First part: Whenever turn changes to more than 5 degress
            this.forceShow = true;
            this.validUntil = Date.now() + 30 * 1000;
            //The time is about 30 seconds: https://youtu.be/S1lt2W95bLA?t=2244 https://youtu.be/S1lt2W95bLA?t=2574
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

/**
 * B-1: the indicator the unit drives (Output.ObsTarget other than 0) does not follow the course the unit sent. The unit
 * reads the course back one calculation tick after it sends it, and the sim slews the indicator in the time between, so
 * the message waits until the indicator has been more than 0.5 degrees off for more than 12 s of GPS time. The KA 90
 * Installation Manual (pp. 3-43, 3-45) gives the 12 s for a readable indicator, and they are carried over by analogy
 * for a driven one (the maintainer, 2026-10-26, #401).
 */
class AdjustCourseMessage implements Message {

    public readonly message: string[] = ["ADJ NAV IND CRS"];
    public seen: boolean = false;
    private readonly off = new SustainedCondition(COURSE_MESSAGE_DELAY);


    constructor(private readonly sensors: Sensors, private readonly navState: NavPageState, private readonly planeSettings: KLN90PlaneSettings) {
    }

    public isConditionValid(): boolean {
        if (!this.navState.isSelfTestApproved) {
            //#330: not evaluated before the self-test is approved, as for the readable indicator. The self-test page
            //sends its fixed course (figure 3-4) to a driven indicator, which reads it back one tick later
            this.off.reset();
            return false;
        }

        if (this.planeSettings.output.obsTarget === 0) {
            //An indicator the unit does not drive is the readable case, which has its own message
            this.off.reset();
            return false;
        }

        if (this.sensors.out.obsOut === null || this.sensors.in.obsMag === null) {
            this.off.reset();
            return false;
        }

        //The GPS replaces its time object on some ticks, so it is read through the GPS each time. MessageHandler.tick
        //asks twice per tick, and the time is the same for both
        const now = this.sensors.in.gps.timeZulu.getTimestamp();
        return this.off.update(Math.abs(NavMath.diffAngle(this.sensors.out.obsOut, this.sensors.in.obsMag)) > 0.5, now);
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
        //B-1: near the FAF, also at the IAF copy of a fix that is IAF and FAF (#369)
        const faf = this.navstate.activeWaypoint.getActiveFafLeg();
        if (faf === null || !(this.navstate.navmode === NavMode.ENR_LEG || this.navstate.navmode === NavMode.ENR_OBS)) {
            return false;
        }

        return this.navstate.distToActive! <= 3;
    }
}

/**
 * B-2: posted when the data base becomes out of date while the unit is on: a date entered on SET 2 or the self-test
 * page, the GPS correcting the date, or the end of the data base passing in flight. It is the only source of this
 * message (#175).
 */
class DatabaseOutOfDateMessage implements Message {

    public message: string[] = ["DATA BASE OUT OF DATE", "ALL DATA MUST BE", "CONFIRMED BEFORE USE"];
    public seen: boolean = false;
    private wasValid: boolean = false;
    private latched: boolean = false;

    constructor(private readonly daabase: Database) {
    }


    public isConditionValid(): boolean {
        const dbValidNow = this.daabase.isAiracCurrent();
        if (this.wasValid && !dbValidNow) {
            //3-16: it stays until the pilot has read it. MessageHandler.tick asks a listed message twice per tick, so the
            //change from current to expired sets a latch instead of being the condition itself (#175)
            this.latched = true;
        }
        this.wasValid = dbValidNow;

        if (this.seen) {
            //Gone once read; only a new change from current to expired brings it back (KLN 89 trainer, 2026-10-18)
            this.latched = false;
        }

        return this.latched;
    }

    public onPowerOff(): void {
        //A date already past the end at power-up posts nothing (KLN 89 trainer, 2026-10-18), so the next power-on
        //starts as the first one did (#175)
        this.latched = false;
        this.wasValid = false;
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


    constructor(private readonly navState: NavPageState, private readonly pageManager: PageManager, private readonly planeSettings: KLN90PlaneSettings) {
    }

    public isConditionValid(): boolean {
        //6-8: Not displayed when an air data computer supplies the barometric pressure. The ALT page is read-only then
        if (isBaroTransmitted(this.planeSettings)) {
            return false;
        }

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
