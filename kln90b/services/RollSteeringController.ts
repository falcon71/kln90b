import {CalcTickable} from "../TickController";
import {Sensors} from "../Sensors";
import {VolatileMemory} from "../data/VolatileMemory";
import {GeoCircle} from "@microsoft/msfs-sdk";
import {KLN90PlaneSettings} from "../settings/KLN90BPlaneSettings";
import {rollSteeringCommand} from "./RollSteeringLaw";

/**
 * How long it takes for the bank to switch between 0 and 5° on the selft test page.
 * The manual does not mention how long this actual takes, so this is just a guess
 */
const SELF_TEST_TIME_SEC = 5;
const SELF_TEST_DIR_RIGHT = -1;
const SELF_TEST_DIR_LEFT = 1;

/**
 * Calculates the roll command for the autopilot (L:KLN90B_RollCommand, ARINC 429 label 121 on the real unit) and the
 * course to steer, with the law of RollSteeringLaw.ts on the path NavCalculator publishes (NavPageState.steeringPath).
 * The law follows the roll steering design (docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 4): the
 * 30 s look-ahead and the 45 degree intercept cap as checked in the KLN 89 trainer, 2026-10-19, the bank from
 * autopilot/lnav/LNavRollSteerComputer.ts and the course to steer from autopilot/lnav/LNavComputer.ts of the MSFS
 * avionics framework.
 *
 * The command is calculated once a second, in the 1 Hz calculation tick (the maintainer's decision, 2026-10-19):
 * - Installation Manual 1-1 only says that the ARINC 429 labels follow the GAMA format; no KLN document gives a bus
 *   speed or a label rate.
 * - GAMA Publication 11 (v6.0, 2016, not necessarily the edition the unit was built to) sends label 121 every 50 to
 *   100 ms.
 * - TSO-C129a asks for navigation data at least once a second, and the maintainer's note on the Tu-154 video (35:15)
 *   shows a calculation rate of 1 Hz.
 * - So the unit computes the command once a second and the bus repeats the held value in between.
 * - The output is raw, without rate limiting: the aircraft that read the command smooth it themselves.
 */
export class RollSteeringController implements CalcTickable {
    private selfTestBank = 0;
    private selfTestDirection: -1 | 1 = SELF_TEST_DIR_RIGHT;

    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory, private readonly planeSettings: KLN90PlaneSettings) {
    }

    public tick(): void {
        const nav = this.memory.navPage;
        //Installation Manual 2-69: without a heading input the unit gives no roll steering, so L:KLN90B_RollCommand is 0,
        //also during the self-test (#143). GPS COURSE TO STEER is 0 then too (the maintainer's decision, 2026-10-19, see
        //Sensors.setRollCommand). Nothing is calculated, so no latch or self-test state is left over for the moment the input
        //is switched on (L:KLN90B_HeadingInput, #368)
        if (!this.planeSettings.input.headingInput) {
            this.resetSelfTest();
            nav.rollSteeringLatch = null;
            this.sensors.out.setRollCommand(null, null);
            return;
        }

        if (nav.isSelfTestActive) {
            this.sensors.out.setRollCommand(this.selfTest(), null);
            return;
        }
        this.resetSelfTest();

        //#373: without a path or an XTK there is nothing to steer on. 2-70: roll steering needs a ground speed
        const path = nav.steeringPath;
        const gps = this.sensors.in.gps;
        if (path === null || nav.xtkToActive === null || gps.groundspeed < 5) {
            nav.rollSteeringLatch = null;
            this.sensors.out.setRollCommand(null, null);
            return;
        }

        //The latch belongs to the path it was chosen on. The from leg's path is one object that ActiveWaypoint rewrites for
        //every leg, so the latch keeps a copy and compares the geometry
        const latch = nav.rollSteeringLatch;
        //The circle of an anticipated turn is the bottom entry of the turn stack (NavCalculator.steeringPath); a DME arc is a
        //leg path and never lies there
        const turnStack = nav.activeWaypoint.turnStack;
        const turnCircle = turnStack.length > 0 && turnStack[0].path === path;
        const command = rollSteeringCommand(path, gps.coords, gps.groundspeed, gps.getTrackTrueRespectingGroundspeed()!,
            latch !== null && isSamePath(latch.path, path) ? latch.turn : null, turnCircle);
        nav.rollSteeringLatch = command.latch === null ? null : {turn: command.latch, path: new GeoCircle(path.center, path.radius)};
        this.sensors.out.setRollCommand(command.bankAngle, command.courseToSteer);
    }

    private resetSelfTest(): void {
        this.selfTestBank = 0;
        this.selfTestDirection = SELF_TEST_DIR_RIGHT;
    }

    /**
     * Installation manual page 2-70
     * @private
     */
    private selfTest(): number {
        this.selfTestBank = Math.max(Math.min(this.selfTestBank + (5 / SELF_TEST_TIME_SEC * this.selfTestDirection), 0), -5);
        if (this.selfTestBank <= -5) {
            this.selfTestDirection = SELF_TEST_DIR_LEFT;
        } else if (this.selfTestBank >= 0) {
            this.selfTestDirection = SELF_TEST_DIR_RIGHT;
        }
        return this.selfTestBank;
    }
}

function isSamePath(a: GeoCircle, b: GeoCircle): boolean {
    return a.radius === b.radius && a.center[0] === b.center[0] && a.center[1] === b.center[1] && a.center[2] === b.center[2];
}
