import {GeoCircle, GeoPoint, LatLonInterface, NavMath, UnitType} from "@microsoft/msfs-sdk";
import {Degrees, Knots, NauticalMiles, Seconds} from "../Units";
import {bankeAngleForStandardTurn} from "../../services/KLNNavmath";

/**
 * Pure geometry for waypoint sequencing and turn anticipation. No state, no sensors: every function takes the
 * positions it needs. Distances are NM, angles degrees true, speeds knots.
 */

/**
 * The turn lead never exceeds this much flying time before the waypoint (KLN 89 trainer, 2026-10-20: the lead stops
 * growing at about 60 s of ground speed)
 */
export const LEAD_CAP_TIME: Seconds = 60;

const SECONDS_PER_HOUR = 3600;
const DEG2RAD = Math.PI / 180;

const PROJECTED_CACHE = new GeoPoint(0, 0);
const WPT_PROJECTED_CACHE = new GeoPoint(0, 0);
const BISECTOR_CACHE = new GeoCircle(new Float64Array(3), 0);
const GREAT_CIRCLE_CACHE = new GeoCircle(new Float64Array(3), 0);
const FROM_GEOPOINT_CACHE = new GeoPoint(0, 0);
const ARC_FROM_CACHE = new GeoPoint(0, 0);
const ARC_TO_CACHE = new GeoPoint(0, 0);

export interface TurnLead {
    /** How far before the waypoint the turn starts, measured along the inbound leg */
    lead: NauticalMiles;
    /** The radius of the circle that is tangent to both legs at the lead distance */
    radius: NauticalMiles;
}

/**
 * The lead distance of a turn and the radius of the turn flown with it. The lead is r·tan(θ/2) for the standard-rate
 * (at most 25° bank) radius r, capped at LEAD_CAP_TIME of ground speed and at half the inbound leg. A capped turn is
 * flown on a tighter circle that is still tangent to both legs (checked in the KLN 89 trainer, 2026-10-20).
 * @param groundspeed
 * @param turnAngle the size of the turn, 0 to 180
 * @param inboundLeg length of the leg that is flown into the waypoint
 */
export function turnLead(groundspeed: Knots, turnAngle: Degrees, inboundLeg: NauticalMiles): TurnLead {
    const r = UnitType.METER.convertTo(NavMath.turnRadius(groundspeed, bankeAngleForStandardTurn(groundspeed)), UnitType.NMILE);
    const tanHalf = Math.tan(turnAngle / 2 * DEG2RAD);
    const uncapped = r * tanHalf;
    const lead = Math.min(uncapped, groundspeed * LEAD_CAP_TIME / SECONDS_PER_HOUR, inboundLeg / 2);
    return {lead: lead, radius: lead < uncapped ? lead / tanHalf : r};
}

/**
 * The distance along the path from the position to the waypoint: positive before the waypoint, negative past it.
 * Both are projected onto the path first.
 * @param path the leg, directed from its start towards the waypoint
 * @param wpt
 * @param pos
 */
export function alongTrackDistance(path: GeoCircle, wpt: LatLonInterface, pos: LatLonInterface): NauticalMiles {
    path.closest(pos, PROJECTED_CACHE);
    path.closest(wpt, WPT_PROJECTED_CACHE);
    const along = path.distanceAlong(PROJECTED_CACHE, WPT_PROJECTED_CACHE, Math.PI);
    const circumference = path.arcLength(2 * Math.PI);
    //Further than half the circle means the waypoint lies behind us
    const signed = along > circumference / 2 ? along - circumference : along;
    return UnitType.GA_RADIAN.convertTo(signed, UnitType.NMILE);
}

/**
 * The signed distance of the position from the bisector of the turn at the waypoint: the great circle through the
 * waypoint, perpendicular to the mean of the inbound and next course. Negative on the inbound side, positive past it.
 * @param wpt
 * @param inboundDtk
 * @param nextDtk
 * @param pos
 */
export function bisectorSide(wpt: LatLonInterface, inboundDtk: Degrees, nextDtk: Degrees, pos: LatLonInterface): NauticalMiles {
    const mean = inboundDtk + NavMath.diffAngle(inboundDtk, nextDtk) / 2;
    BISECTOR_CACHE.setAsGreatCircle(wpt, NavMath.normalizeHeading(mean + 90));
    //GeoCircle.distance is positive away from the circle's center, which is on the left of a great circle's direction
    //of travel. The inbound side is on the right of the line (bearing mean + 90), so the sign flips
    return -UnitType.GA_RADIAN.convertTo(BISECTOR_CACHE.distance(pos), UnitType.NMILE);
}

/**
 * The distance from the position to the leg from to: the perpendicular distance while the foot of the perpendicular
 * lies between the ends, otherwise the distance to from. Otherwise-to-from and not to the nearer end is the rule
 * of the leg search in ActiveWaypoint.findClosestLegIdx (checked in the KLN 89 trainer, see the comment there).
 * @param from
 * @param to
 * @param arc the circle of a DME arc leg, or undefined for a great circle leg
 * @param pos
 */
export function segmentDistance(from: LatLonInterface, to: LatLonInterface, arc: GeoCircle | undefined, pos: LatLonInterface): NauticalMiles {
    FROM_GEOPOINT_CACHE.set(from);
    let circle: GeoCircle;
    if (arc === undefined) {
        GREAT_CIRCLE_CACHE.setAsGreatCircle(from, to);
        circle = GREAT_CIRCLE_CACHE;
    } else {
        circle = arc;
    }
    circle.closest(pos, PROJECTED_CACHE);

    const between = arc === undefined
        ? isPointOnCircleBetween(FROM_GEOPOINT_CACHE, to, PROJECTED_CACHE)
        : isPointOnArcBetween(circle, from, to, PROJECTED_CACHE);
    //The closest point is not between from and to, so the distance between the position and from is used instead
    const distance = between ? PROJECTED_CACHE.distance(pos) : FROM_GEOPOINT_CACHE.distance(pos);
    return UnitType.GA_RADIAN.convertTo(distance, UnitType.NMILE);
}

/**
 * Checks if the point is located between from and to. All points must be located on the same great circle
 * @param from
 * @param to
 * @param pointToCheck
 */
function isPointOnCircleBetween(from: GeoPoint, to: LatLonInterface, pointToCheck: GeoPoint): boolean {
    const distFromTo = from.distance(to);
    const distPointFrom = pointToCheck.distance(from);
    const distPointTo = pointToCheck.distance(to);
    //If the distance between A & C and B & C is the same as A & B, then C lies between A & B, otherwise it is outside
    return distPointFrom + distPointTo <= distFromTo + GeoCircle.ANGULAR_TOLERANCE;
}

/**
 * #121: checks if a point of a DME arc lies between from and to, by the angle along the arc's circle in its own
 * direction. The chord test of isPointOnCircleBetween needs a great circle; the ends need not lie exactly on the
 * arc's circle, so they are projected onto it first
 */
function isPointOnArcBetween(circle: GeoCircle, from: LatLonInterface, to: LatLonInterface, pointToCheck: GeoPoint): boolean {
    circle.closest(from, ARC_FROM_CACHE);
    circle.closest(to, ARC_TO_CACHE);
    return circle.angleAlong(ARC_FROM_CACHE, pointToCheck, Math.PI) <= circle.angleAlong(ARC_FROM_CACHE, ARC_TO_CACHE, Math.PI) + GeoCircle.ANGULAR_TOLERANCE;
}
