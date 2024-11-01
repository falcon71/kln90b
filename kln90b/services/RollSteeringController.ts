import {CalcTickable} from "../TickController";
import {Sensors} from "../Sensors";
import {MAX_BANK_ANGLE} from "../data/navdata/NavCalculator";
import {VolatileMemory} from "../data/VolatileMemory";
import {ArcTurnController, FlightPathUtils, GeoCircle, MathUtils, NavMath, UnitType} from "@microsoft/msfs-sdk";

/**
 * How long it takes for the bank to switch between 0 and 5° on the selft test page.
 * The manual does not mention how long this actual takes, so this is just a guess
 */
const SELF_TEST_TIME_SEC = 5;
const SELF_TEST_DIR_RIGHT = 1;
const SELF_TEST_DIR_LEFT = -1;

/**
 * Calculates the roll command for the autopilot
 * Code was adapted from Working Titles LNavComputer
 */
export class RollSteeringController implements CalcTickable {


    private readonly arcController = new ArcTurnController();
    private selfTestBank = 0;
    private selfTestDirection: -1 | 1 = SELF_TEST_DIR_RIGHT;

    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory) {
    }

    public tick(): void {
        const nav = this.memory.navPage;
        if (nav.isSelfTestActive) {
            this.sensors.out.setRollCommand(this.selfTest());
            return;
        } else {
            this.selfTestBank = 0;
            this.selfTestDirection = SELF_TEST_DIR_RIGHT;
        }

        const fromLeg = nav.activeWaypoint.getFromLeg();
        if (fromLeg == null) {
            this.sensors.out.setRollCommand(null);
            return;
        }

        const desiredBankAngle = this.updateBankAngle(fromLeg.path, nav.desiredTrack!, nav.xtkToActive!);
        this.sensors.out.setRollCommand(desiredBankAngle);
    }

    /**
     * Installation manual page 2-70
     * @private
     */
    private selfTest(): number {
        this.selfTestBank = Math.max(Math.min(this.selfTestBank + (5 / SELF_TEST_TIME_SEC * this.selfTestDirection), 5), 0);
        if (this.selfTestBank >= 5) {
            this.selfTestDirection = SELF_TEST_DIR_LEFT;
        } else if (this.selfTestBank <= 0) {
            this.selfTestDirection = SELF_TEST_DIR_RIGHT;
        }
        return this.selfTestBank;
    }

    /**
     * Updates a bank angle state for a tracked flight path vector.
     * @param vector The tracked flight path vector.
     * @param dtk The desired track, in degrees true.
     * @param xtk The cross-track error, in nautical miles.
     * @returns The updated bank angle.
     */
    private updateBankAngle(vector: GeoCircle, dtk: number, xtk: number): number {
        let absInterceptAngle = Math.min(Math.pow(Math.abs(xtk) * 20, 1.35) + (Math.abs(xtk) * 50), 45);
        if (absInterceptAngle <= 2.5) {
            absInterceptAngle = NavMath.clamp(Math.abs(xtk * 150), 0, 2.5);
        }

        const interceptAngle = xtk < 0 ? absInterceptAngle : -1 * absInterceptAngle;
        const courseToSteer = NavMath.normalizeHeading(dtk + interceptAngle);

        let desiredBankAngle = this.desiredBank(courseToSteer);

        if (vector.isGreatCircle()) {
            this.arcController.reset();
        } else {
            desiredBankAngle = this.adjustBankAngleForArc(vector, desiredBankAngle);
        }

        return desiredBankAngle;
    }

    /**
     * Calculates a desired bank angle from a desired track.
     * @param desiredTrack The desired track, in degrees true.
     * @returns The desired bank angle, in degrees. Positive values indicate left bank.
     */
    private desiredBank(desiredTrack: number): number {
        const turnDirection = NavMath.getTurnDirection(this.sensors.in.gps.getTrackTrueRespectingGroundspeed() ?? 0, desiredTrack);
        const headingDiff = Math.abs(NavMath.diffAngle(this.sensors.in.gps.getTrackTrueRespectingGroundspeed() ?? 0, desiredTrack));

        let baseBank = Math.min(1.25 * headingDiff, MAX_BANK_ANGLE);
        baseBank *= (turnDirection === 'left' ? 1 : -1);

        return baseBank;
    }

    /**
     * Adjusts a bank angle state's desired bank angle for arc vectors.
     * @param circle
     * @param desiredBankAngle
     * @returns The adjusted bank angle state.
     */
    private adjustBankAngleForArc(circle: GeoCircle, desiredBankAngle: number): number {
        const nav = this.memory.navPage;
        const turnDirection = FlightPathUtils.getTurnDirectionFromCircle(circle);
        const radius = UnitType.GA_RADIAN.convertTo(FlightPathUtils.getTurnRadiusFromCircle(circle), UnitType.METER);

        const distance = UnitType.GA_RADIAN.convertTo(circle.distance(this.sensors.in.gps.coords), UnitType.METER);
        const bankAdjustment = this.arcController.getOutput(distance);

        const turnBankAngle = NavMath.bankAngle(this.sensors.in.gps.groundspeed, radius) * (turnDirection === 'left' ? 1 : -1);
        const turnRadius = NavMath.turnRadius(this.sensors.in.gps.groundspeed, 25);

        const bankBlendFactor = Math.max(1 - (Math.abs(UnitType.NMILE.convertTo(nav.xtkToActive!, UnitType.METER)) / turnRadius), 0);

        desiredBankAngle = MathUtils.clamp(
            (desiredBankAngle * (1 - bankBlendFactor)) + (turnBankAngle * bankBlendFactor) + bankAdjustment,
            -MAX_BANK_ANGLE,
            MAX_BANK_ANGLE,
        );

        return desiredBankAngle;
    }

}