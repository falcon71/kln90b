import {CalcTickable} from "../TickController";
import {Sensors} from "../Sensors";
import {MAX_BANK_ANGLE} from "../data/navdata/NavCalculator";
import {VolatileMemory} from "../data/VolatileMemory";
import {
    ArcTurnController,
    FlightPathUtils,
    GeoCircle,
    GeoPoint,
    LNavState,
    LNavTransitionMode,
    MathUtils,
    NavMath,
    UnitType,
} from "@microsoft/msfs-sdk";
import {Knots} from "../data/Units";

/**
 * How long it takes for the bank to switch between 0 and 5° on the selft test page.
 * The manual does not mention how long this actual takes, so this is just a guess
 */
const SELF_TEST_TIME_SEC = 5;
const SELF_TEST_DIR_RIGHT = -1;
const SELF_TEST_DIR_LEFT = 1;

/**
 * Calculates the roll command for the autopilot
 * Code was adapted from Working Titles LNavComputer
 */
export class RollSteeringController implements CalcTickable {
    private readonly arcController = new ArcTurnController();
    private selfTestBank = 0;
    private selfTestDirection: -1 | 1 = SELF_TEST_DIR_RIGHT;

    private readonly CACHED_POINT = new GeoPoint(0, 0);
    private readonly CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);

    private readonly anticipationState: LNavState = {
        globalLegIndex: 0,
        transitionMode: LNavTransitionMode.None,
        vectorIndex: 0,
        isSuspended: false,
        inhibitedSuspendLegIndex: -1,
        resetVectorsOnSuspendEnd: false,
        isMissedApproachActive: false,
    };


    constructor(private readonly sensors: Sensors, private readonly memory: VolatileMemory) {
    }

    public tick(): void {
        const nav = this.memory.navPage;
        if (nav.isSelfTestActive) {
            this.sensors.out.setRollCommand(this.selfTest(), null);
            return;
        } else {
            this.selfTestBank = 0;
            this.selfTestDirection = SELF_TEST_DIR_RIGHT;
        }

        const fromLeg = nav.activeWaypoint.getFromLeg();
        if (fromLeg == null || this.sensors.in.gps.groundspeed < 5) {
            this.sensors.out.setRollCommand(null, null);
            this.arcController.reset();
            return;
        }

        this.updateBankAngle(fromLeg.path, nav.desiredTrack!, nav.xtkToActive!);


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

    /**
     * Updates a bank angle state for a tracked flight path vector.
     * @param leg The tracked flight path vector.
     * @param dtk The desired track, in degrees true.
     * @param xtk The cross-track error, in nautical miles.
     * @returns The updated bank angle.
     */
    private updateBankAngle(leg: GeoCircle, dtk: number, xtk: number): number {
        //Bank angle: Right negative, left positive

        const track = this.sensors.in.gps.getTrackTrueRespectingGroundspeed()!;
        const absTrackDiff = Math.abs(NavMath.diffAngle(track, dtk));

        //Case 1, we are on track, only minimal corrections needed
        if (xtk < 0.1 && absTrackDiff < 10) {
            //It currently does overshoot a little, might need some small adjustments
            const desiredTrack = dtk - xtk * 50;
            const desiredBankAngle = this.desiredBank(track, desiredTrack, NavMath.getTurnDirection(track, desiredTrack));
            console.debug(`On track, XKT:${xtk} DTK:${dtk} bank:${desiredBankAngle} courseToSteer:${desiredTrack}`);
            this.sensors.out.setRollCommand(desiredBankAngle, desiredTrack);
            return desiredBankAngle;
        }

        //This is a 45° intercept track towards the leg
        const interceptAngle = 45 * (xtk < 0 ? 1 : -1);
        const interceptTrack = NavMath.normalizeHeading(dtk + interceptAngle);


        //We are not on track and need to calculate our turn to the track
        //First we calcuate the interception point between the aircraft and the leg
        this.CACHED_POINT.set(this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
        this.CACHED_POINT.offset(track, UnitType.NMILE.convertTo(1000, UnitType.GA_RADIAN));
        this.CACHED_CIRCLE.setAsGreatCircle(this.sensors.in.gps.coords, this.CACHED_POINT);

        const intersectionsCurrentTrackLeg: Float64Array[] = [];
        leg.intersection(this.CACHED_CIRCLE, intersectionsCurrentTrackLeg);
        const intersectionsCurrentTrackLegPoints = intersectionsCurrentTrackLeg.map(int => {
            const p = new GeoPoint(0, 0);
            return p.setFromCartesian(int);
        })
            .filter(p => Math.abs(NavMath.diffAngle(this.sensors.in.gps.coords.bearingTo(p), track)) <= 90) //We look at the intersections of two great circles. The closest intersection may actually be behind the plane
            .filter(p => UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(p), UnitType.NMILE) <= 100) //Let's ignore the interception on the other side of the planet
            .sort((a, b) => a.distance(this.sensors.in.gps.coords) - b.distance(this.sensors.in.gps.coords)); //Max two, we want the closest one in front of the plane


        //Case 2 We don't intercept the leg, lets turn 45° towards it
        if (intersectionsCurrentTrackLegPoints.length === 0) {
            const desiredBankAngle = this.desiredBank(track, interceptTrack, NavMath.getTurnDirection(track, interceptTrack));
            console.debug(`Track does not intercept leg, intercept with 45 degrees: bank:${desiredBankAngle} courseToSteer:${interceptTrack}`);
            this.sensors.out.setRollCommand(desiredBankAngle, interceptTrack);
            return desiredBankAngle;
        }

        const distToIntersection = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(intersectionsCurrentTrackLegPoints[0]), UnitType.NMILE);
        console.debug(`Inteception bearing:${NavMath.diffAngle(this.sensors.in.gps.coords.bearingTo(intersectionsCurrentTrackLegPoints[0]), track)} distance:${distToIntersection}`);

        //Case 4, We calculate the optimal bank angle required for a smooth turn towards the leg
        //This function allows up to 30° to correct for lag when turning
        //We are calculating the distance between the GPS position and the position where we intend to acutally intercept the leg
        //This is an isosceles triangle. The distance to the interception is the length of the sides and here we calculate the base
        const distCurrentPosActualInterception = 2 * distToIntersection * Math.cos(absTrackDiff / 2 * Avionics.Utils.DEG2RAD);
        //Another isosceles triangle. Knowing the base, we can calculate the sides again, those are turn radius
        const requiredTurnRadius = distCurrentPosActualInterception / (2 * Math.cos((90 - (absTrackDiff / 2)) * Avionics.Utils.DEG2RAD));

        const absDesiredBankAngle = Math.min(NavMath.bankAngle(this.sensors.in.gps.groundspeed, UnitType.NMILE.convertTo(requiredTurnRadius, UnitType.METER)), 30);

        const desiredTurnRadius = UnitType.METER.convertTo(NavMath.turnRadius(this.sensors.in.gps.groundspeed, this.bankeAngleForStandardTurn(this.sensors.in.gps.groundspeed)), UnitType.NMILE);
        //This is the distance on the 45° edge on the circle to the leg. If we are farther away then the 45° degree intercept point, then we want to fly with 45° towards the leg, unless we require a stronger bank angle already
        const maxXtkForTracking = desiredTurnRadius * (1 - Math.sqrt(2) / 2);

        //Less than 25° of bank angle is required and we are still far away from the leg, let's continue closing in on an intercept track
        if (absDesiredBankAngle < 25 //If we need more than 25° bank, then this has priority
            && xtk > maxXtkForTracking) {
            const desiredBankAngle = this.desiredBank(track, interceptTrack, NavMath.getTurnDirection(track, interceptTrack));
            console.debug(`Too far away, XTK ${xtk}>${maxXtkForTracking}, intercept with 45 degrees: bank:${desiredBankAngle} courseToSteer:${interceptTrack}`);
            this.sensors.out.setRollCommand(desiredBankAngle, interceptTrack);
            return desiredBankAngle;
        }

        //We are now ready to intercept the leg with the optimal bank angle
        const desiredBankAngle = absDesiredBankAngle * (NavMath.getTurnDirection(track, dtk) == 'left' ? 1 : -1);

        console.debug(`Intercepting leg: radius:${requiredTurnRadius} bank:${desiredBankAngle} courseToSteer:${dtk}`);

        this.sensors.out.setRollCommand(desiredBankAngle, dtk);
        return desiredBankAngle;
    }

    /**
     * Calculates a desired bank angle from a desired track.
     * @param desiredTrack The desired track, in degrees true.
     * @param turnDirection
     * @returns The desired bank angle, in degrees. Positive values indicate left bank.
     */
    private desiredBank(track: number, desiredTrack: number, turnDirection: "left" | "right"): number {
        const headingDiff = Math.abs(NavMath.diffAngle(track, desiredTrack));
        let baseBank = Math.min(1.25 * headingDiff, MAX_BANK_ANGLE);
        // baseBank = 25;
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


    /**
     * https://edwilliams.org/avform147.htm#Turns
     * @param speed
     * @private
     */
    private bankeAngleForStandardTurn(speed: Knots) {
        return Math.min(57.3 * Math.atan(speed / 362.1), MAX_BANK_ANGLE);
    }

}