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
     * @param vector The tracked flight path vector.
     * @param dtk The desired track, in degrees true.
     * @param xtk The cross-track error, in nautical miles.
     * @returns The updated bank angle.
     */
    private updateBankAngle(vector: GeoCircle, dtk: number, xtk: number): number {
        //Bank angle: Right negative, left positive

        const track = this.sensors.in.gps.getTrackTrueRespectingGroundspeed()!;
        const trackDiff = NavMath.diffAngle(dtk, track);


        //Case 1, we are on track, only minimal corrections needed
        if (xtk < 0.1 && Math.abs(trackDiff) < 2) {
            //This one requires tweaking, it's oscillating
            const desiredBankAngle = xtk * 20;
            console.debug("On track", dtk, desiredBankAngle);
            this.sensors.out.setRollCommand(desiredBankAngle, dtk);
            return desiredBankAngle;
        }

        //We are not on track and need to intercept the track in a 45° angle with a 25° bank
        const interceptSign = xtk < 0 ? 1 : -1;
        const interceptAngle = 45 * interceptSign;
        const interceptTrack = NavMath.normalizeHeading(dtk + interceptAngle);

        //Create a circle describing a 45 Degree path towards the leg
        const to = new GeoPoint(this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
        to.offset(interceptTrack, UnitType.NMILE.convertTo(1000, UnitType.GA_RADIAN));
        const aircraftPath = new GeoCircle(new Float64Array(3), 0);
        aircraftPath.setAsGreatCircle(this.sensors.in.gps.coords, to);

        //Interception between theoretical 45° path and the leg
        const intersections: Float64Array[] = [];
        vector.intersection(aircraftPath, intersections);
        const intersectionPoints = intersections.map(int => {
                const p = new GeoPoint(0, 0);
                return p.setFromCartesian(int);
            })
                .sort((a, b) => a.distance(this.sensors.in.gps.coords) - b.distance(this.sensors.in.gps.coords)) //Max two, we want the closest one in front of the plane
                .filter(p => Math.abs(NavMath.diffAngle(this.sensors.in.gps.coords.bearingTo(p), interceptTrack)) <= 90) //We look at the intersections of two great circles. The closest intersection may actually be behind the plane
        ;


        const standardTurnRadiusAtCurrentSpeed = UnitType.METER.convertTo(NavMath.turnRadius(this.sensors.in.gps.groundspeed, this.bankeAngleForStandardTurn(this.sensors.in.gps.groundspeed)), UnitType.NMILE);
        const distanceFor45DegreeTurn = standardTurnRadiusAtCurrentSpeed * Math.tan((45 / 2) * Avionics.Utils.DEG2RAD);

        const distToIntersection = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(intersectionPoints[0]), UnitType.NMILE);

        //Case 2, we are still too far away to intercept the leg. We simply fly with 45° towards it
        if (distToIntersection > distanceFor45DegreeTurn) {
            const desiredBankAngle = this.desiredBank(interceptTrack);
            console.debug("Far away, intercept with 45 degrees", interceptTrack, desiredBankAngle);
            this.sensors.out.setRollCommand(desiredBankAngle, interceptTrack);
            return desiredBankAngle;
        }

        //We have passed the point, where we need to turn towards the leg
        //First we calcuate the interception point between the aircraft and the leg
        const to2 = new GeoPoint(this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon);
        to2.offset(track, UnitType.NMILE.convertTo(1000, UnitType.GA_RADIAN));
        const aircraftPath2 = new GeoCircle(new Float64Array(3), 0);
        aircraftPath2.setAsGreatCircle(this.sensors.in.gps.coords, to2);

        const intersections2: Float64Array[] = [];
        vector.intersection(aircraftPath2, intersections2);
        const intersectionPoints2 = intersections2.map(int => {
                const p = new GeoPoint(0, 0);
                return p.setFromCartesian(int);
            })
                .sort((a, b) => a.distance(this.sensors.in.gps.coords) - b.distance(this.sensors.in.gps.coords)) //Max two, we want the closest one in front of the plane
                .filter(p => Math.abs(NavMath.diffAngle(this.sensors.in.gps.coords.bearingTo(p), track)) <= 90) //We look at the intersections of two great circles. The closest intersection may actually be behind the plane
        ;


        //Case 3 (times 2), we are within the point, where we should intercept the leg, but we don't.
        // This means, we need to turn back to the leg, similiar to case 2
        if (intersectionPoints2.length === 0) {
            const desiredBankAngle = this.desiredBank(interceptTrack);
            console.debug("Track does not intercept leg, intercept with 45 degrees", interceptTrack, desiredBankAngle);
            this.sensors.out.setRollCommand(desiredBankAngle, interceptTrack);
            return desiredBankAngle;
        }

        const distToIntersection2 = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(intersectionPoints2[0]), UnitType.NMILE);
        //Yeah, the interception is on the other side of the planet...
        if (distToIntersection2 > distanceFor45DegreeTurn * 2) {
            const desiredBankAngle = this.desiredBank(interceptTrack);
            console.debug("Track does not intercept leg2, intercept with 45 degrees", interceptTrack, desiredBankAngle);
            this.sensors.out.setRollCommand(desiredBankAngle, interceptTrack);
            return desiredBankAngle;
        }

        //Case 4, we are close enough to intercept the leg
        //It was previously assumed to be a standard bank angle, but we calculate the optimal bank angle here going up to 30
        const diffAngle = Math.abs(NavMath.diffAngle(track, dtk));

        //We are calculating the distance between the GPS position and the position where we intend to acutally intercept the leg
        //This is an isosceles triangle. The distance to the interception is the length of the sides and here we calculate the base
        const distCurrentPosActualInterception = 2 * distToIntersection2 * Math.cos(diffAngle / 2 * Avionics.Utils.DEG2RAD);
        //Another isosceles triangle. Knowing the base, we can calculate the sides again, those are turn radius
        const requiredTurnRadius = distCurrentPosActualInterception / (2 * Math.cos((90 - (diffAngle / 2)) * Avionics.Utils.DEG2RAD));

        const desiredBankAngle = Math.min(NavMath.bankAngle(this.sensors.in.gps.groundspeed, UnitType.NMILE.convertTo(requiredTurnRadius, UnitType.METER)), 30) * interceptSign;


        console.debug("RollSteering", desiredBankAngle, dtk);

        this.sensors.out.setRollCommand(desiredBankAngle, dtk);
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