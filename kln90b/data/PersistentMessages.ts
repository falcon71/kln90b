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
        new AdjustCourseToMessage(props.sensors, props.modeController, props.memory.navPage, props.planeSettings),
        new AdjustCourseMessage(props.sensors, props.memory.navPage, props.planeSettings),
    ];
}


/**
 * ADJ NAV IND CRS TO nnn°: set the indicator's course to the DTK. Only in Leg mode with a DTK, and never for an indicator
 * the unit drives (4-8, B-1), whose message is AdjustCourseMessage. The number follows the live DTK. It goes once it is
 * read (the maintainer's ruling, 2026-10-27, unlike the messages that stay listed when read, 3-16). The case is that of
 * the current calculation, since the CDI can be switched to and away from GPS at any time.
 *
 * With an indicator course the unit reads (sensors.in.obsMag), the message shows while that course is more than 5
 * degrees off the DTK (B-1): at once at a leg change (4-8, B-1; NavPageState.legChangeDtkDelta), otherwise once the
 * course has been off for more than 12 s of GPS time (KA 90 Installation Manual pp. 3-43, 3-45). It goes on the next
 * calculation once the course is within 5 degrees; while the course stays off it comes back, unread, more than 12 s after
 * the read. The AVsoftech trainer showed each of these (docs/kln89-trainer-record.md, 2026-10-26). #434
 *
 * Without one, the unit cannot tell where the indicator points, so the message comes at a leg change of more than 5
 * degrees (4-8, B-1): at an anticipated or abeam turn the moment the WPT light goes from flashing to steady. If the leg
 * change started a turn, the message goes when the turn ends and the WPT light goes off, read or not. Both videos show
 * this, and both are proven unreadable installations: the Tu-154 (https://youtu.be/S1lt2W95bLA, about t=2245 and
 * t=2574), whose self-test page at about 02:57 shows OBS IN dashed (the maintainer, 2026-10-27), and the Air Chathams
 * CV580 at 30:38, its CDI on NAV 1. A Direct To, an activation, the first DTK and a switch between LEG and OBS are no
 * leg change and post nothing (the Tu-154 video at about 43:52; the maintainer's ruling, 2026-10-27). Without a turn
 * nothing marks an end, so the message stays until it is read or the next leg change (the maintainer's ruling,
 * 2026-10-27, low confidence). This replaces the 30 s window of #177. #436
 */
class AdjustCourseToMessage implements Message {

    public message: string[] = ["ADJ NAV IND CRS"];
    public seen: boolean = false;
    /** The readable course more than 5 degrees off the DTK */
    private readonly offTimer = new SustainedCondition(COURSE_MESSAGE_DELAY);
    /** The unreadable case: posted by a leg change and not yet removed */
    private posted = false;
    /** The unreadable case: the leg change that posted the message started a turn, whose end removes it */
    private endsWithTurn = false;


    constructor(private readonly sensors: Sensors, private readonly modeController: ModeController, private readonly navState: NavPageState,
                private readonly planeSettings: KLN90PlaneSettings) {
    }


    public isConditionValid(): boolean {
        if (this.planeSettings.output.obsTarget !== 0) {
            //4-8, B-1: no TO message when the unit slews the indicator itself. The plain message is the one for a driven
            //indicator that does not follow (#401)
            this.reset();
            return false;
        }

        if (!this.navState.isSelfTestApproved) {
            //#330: not evaluated before the self-test is approved, neither on the Turn-On page nor on the self-test page,
            //whose fixed course is part of the check and not a course to set (figure 3-4). The count starts at the
            //approval, and a message posted before the power-off is not posted again
            this.reset();
            return false;
        }

        const dtk = this.modeController.getDtkOrObsMagnetic();
        if (dtk === null || this.modeController.isObsModeActive()) {
            this.reset();
            return false;
        }

        this.message = [`ADJ NAV IND CRS TO ${format(roundBearing(dtk), "000")}°`];

        const obsMag = this.sensors.in.obsMag;
        if (obsMag === null) {
            //The unreadable case
            this.offTimer.reset();
            const delta = this.navState.legChangeDtkDelta;
            if (delta !== null && delta > 5) {
                //4-8, B-1: at the leg change, at a turn the WPT light going steady. A later leg change gives the
                //message the new DTK and decides anew whether a turn ends it. Each leg change is a new message, so it
                //is unread, also in the second the one before was read (#436). Both calls of the tick see the same mark
                this.seen = false;
                this.posted = true;
                this.endsWithTurn = this.navState.activeWaypoint.turnStack.length > 0;
            } else if (this.seen) {
                //Removed once read, for good until the next leg change (the maintainer, 2026-10-27)
                this.posted = false;
            } else if (this.posted && this.endsWithTurn && this.navState.activeWaypoint.turnStack.length === 0) {
                //The end of the turn, the WPT light going off (the Tu-154 and CV580 videos)
                this.posted = false;
            }
            return this.posted;
        }

        //The readable case
        this.posted = false;
        //The GPS replaces its time object on some ticks, so it is read through the GPS each time. MessageHandler.tick
        //asks twice per tick, and the time is the same for both
        const now = this.sensors.in.gps.timeZulu.getTimestamp();
        const off = Math.abs(NavMath.diffAngle(dtk, obsMag)) > 5;
        if (this.navState.legChangeDtkDelta !== null && off) {
            //4-8 with B-1: a leg change posts at once. It is a new message, so it is unread, also in the second the one
            //before was read, and the read does not hold it back for 12 s. Both calls of the tick see the same mark
            this.seen = false;
            this.offTimer.satisfy(now);
        }
        if (this.seen) {
            //Removed once read, and counted again from the read (the maintainer, 2026-10-27). MessageHandler sets seen
            //back to false while the message is invalid, so it comes back unread
            this.offTimer.restart(now);
            return false;
        }
        return this.offTimer.update(off, now);
    }

    /** Neither case carries over a time the message is not evaluated */
    private reset(): void {
        this.offTimer.reset();
        this.posted = false;
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

        //Without a position (NAV flag) the distance is null, and null <= 3 would be true in JavaScript (#417)
        return this.navstate.distToActive !== null && this.navstate.distToActive <= 3;
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

        //B-2, 6-10: 4 NM before the fix, which a unit without a position does not know (#417)
        return this.navstate.distToActive !== null && this.navstate.distToActive <= 4;
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
