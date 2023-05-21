import {GeoCircle, GeoPoint, LatLonInterface, LodBoundary, UnitType} from "@microsoft/msfs-sdk";
import {NearestUtils} from "../data/navdata/NearestUtils";
import {SPECIAL_USE_AIRSPACE_FILTER} from "../data/navdata/AirspaceAlert";
import {BoundaryUtils} from "../data/navdata/BoundaryUtils";
import {NauticalMiles} from "../data/Units";


interface SplittedLeg {
    fromIdx: number,
    searchRadius: NauticalMiles,
    coord: LatLonInterface,
}

const MAX_SEARCH_RADIUS = 100;

const CACHED_POINT = new GeoPoint(0, 0);


/**
 * This splits a long leg into several smaller chunks, so that we get all airspaces along the leg.
 * The circles are choosen between the legs, so that the fewest amount of waypoints are generated.
 * @param idx The index of the from waypoint. This allows to match the result with the original legs.
 * @param from
 * @param to
 * @param maxDist The distance is quite a tradeoff. A smaller distance means less airspaces to filter in JS, that are
 *                far off from the route anyway, but it also means more coherent calls which take a very long time.
 */
function splitLeg(idx: number, from: LatLonInterface, to: LatLonInterface, maxDist: NauticalMiles = MAX_SEARCH_RADIUS): SplittedLeg[] {
    const circle = new GeoCircle(new Float64Array(3), 0);
    CACHED_POINT.set(from);
    const dist = UnitType.GA_RADIAN.convertTo(CACHED_POINT.distance(to), UnitType.NMILE);

    const numResults = Math.ceil(dist / (maxDist * 2));

    const diameter = dist / numResults;
    const radius = diameter / 2;
    const diameterGA = UnitType.NMILE.convertTo(diameter, UnitType.GA_RADIAN);
    const radiusGA = UnitType.NMILE.convertTo(radius, UnitType.GA_RADIAN);

    const splittedLegs: SplittedLeg[] = [{fromIdx: idx, coord: from, searchRadius: radius}];

    circle.setAsGreatCircle(from, to);

    for (let i = 0; i < numResults; i++) {
        const wpt = new GeoPoint(0, 0);
        circle.offsetDistanceAlong(from, radiusGA + diameterGA * i, wpt);
        splittedLegs.push({fromIdx: idx, coord: wpt, searchRadius: radius});
    }


    console.log(`Route with ${dist}nm distance splitted into legs every ${radius}nm`, splittedLegs);

    return splittedLegs;
}

/**
 * Returns all airspaces in order along the route
 * @param route
 * @param utils
 */
export async function airspacesAlongRoute(route: LatLonInterface[], utils: NearestUtils): Promise<LodBoundary[]> {
    if (route.length < 2) {
        throw new Error("airspacesAlongRoute requires at least two waypoints");
    }


    const legs: SplittedLeg[] = [];
    for (let i = 1; i < route.length; i++) {
        legs.push(...splitLeg(i - 1, route[i - 1], route[i]));
    }
    const airspaces: LodBoundary[][] = Array(route.length - 1).fill([]);
    for (const leg of legs) {
        airspaces[leg.fromIdx].push(...await utils.getAirspaces(leg.coord.lat, leg.coord.lon, UnitType.METER.convertFrom(leg.searchRadius, UnitType.NMILE), 200, SPECIAL_USE_AIRSPACE_FILTER));
    }

    console.log(route, airspaces);
    const foundAirspaces: LodBoundary[] = [];

    for (let i = 1; i < route.length; i++) {
        const from = route[i - 1];
        const to = route[i];
        const airspacesForLeg = airspaces[i - 1];
        for (const airspace of airspacesForLeg) {
            if (!foundAirspaces.some(a => a.facility.id === airspace.facility.id)) {
                const intersects = BoundaryUtils.intersects(airspace, from.lat, from.lon, to.lat, to.lon);
                if (intersects || (i == 1 && BoundaryUtils.isInside(airspace, from.lat, from.lon))) {
                    foundAirspaces.push(airspace);
                }
            }
        }
    }


    return foundAirspaces;
}

interface HalfAirspaceIntersection {
    legIdx: number,
    airspaceTo: LodBoundary,
    intersection: GeoPoint,
    distFromIntersection: number,
}


export interface AirspaceIntersection {
    legIdx: number,
    airspaceFrom: LodBoundary,
    airspaceTo: LodBoundary,
    intersection: GeoPoint,
}

/**
 * Returns detailed information on each airspace crossing on the route
 * @param route
 * @param utils
 * @param filter
 */
export async function airspaceIntersectionsAlongRoute(route: LatLonInterface[], utils: NearestUtils, filter: number): Promise<AirspaceIntersection[]> {
    if (route.length < 2) {
        throw new Error("airspacesAlongRoute requires at least two waypoints");
    }

    const legs: SplittedLeg[] = [];
    for (let i = 1; i < route.length; i++) {
        legs.push(...splitLeg(i - 1, route[i - 1], route[i]));
    }
    const airspaces: LodBoundary[][] = Array(route.length - 1).fill([]);
    for (const leg of legs) {
        airspaces[leg.fromIdx].push(...await utils.getAirspaces(leg.coord.lat, leg.coord.lon, UnitType.METER.convertFrom(leg.searchRadius, UnitType.NMILE), 200, filter));
    }

    console.log(route, airspaces);
    const foundIntersections: HalfAirspaceIntersection[] = [];


    for (let i = 1; i < route.length; i++) {
        foundIntersections.push(...getAirspacesForLeg(i, route, airspaces));
    }

    console.log("all intersections", foundIntersections);

    return cleanup(foundIntersections, route, airspaces);
}

function getAirspacesForLeg(i: number, route: LatLonInterface[], airspaces: LodBoundary[][]): HalfAirspaceIntersection[] {
    const from = route[i - 1];
    const to = route[i];

    const airspacesForLeg = airspaces[i - 1];
    const foundIntersections: HalfAirspaceIntersection[] = [];
    for (const airspace of airspacesForLeg) {
        const intersections = BoundaryUtils.getIntersections(airspace, from.lat, from.lon, to.lat, to.lon);
        for (const intersection of intersections) {
            foundIntersections.push({
                legIdx: i,
                airspaceTo: airspace,
                intersection: intersection,
                distFromIntersection: UnitType.GA_RADIAN.convertTo(intersection.distance(from), UnitType.NMILE),
            });
        }
    }

    return foundIntersections.sort((a, b) => a.distFromIntersection - b.distFromIntersection);
}

function cleanup(intersections: HalfAirspaceIntersection[], route: LatLonInterface[], airspaces: LodBoundary[][]): AirspaceIntersection[] {
    //We now have all intersection. We clea nup duplicate intersecntiond and set from/to correctly
    const result: AirspaceIntersection[] = [];


    let fromAirspace: LodBoundary | null = null;
    for (const airspace of airspaces[0]) {
        if (BoundaryUtils.isInside(airspace, route[0].lat, route[0].lon)) {
            fromAirspace = airspace;
            break;
        }
    }

    console.assert(fromAirspace !== null, "starting airspace not found", route, airspaces);

    for (let i = 0; i < intersections.length; i++) {
        const intersection = intersections[i];
        if (fromAirspace !== null && !areAirspacesEqual(fromAirspace, intersection.airspaceTo)) {
            result.push({
                legIdx: intersection.legIdx,
                airspaceFrom: fromAirspace,
                airspaceTo: intersection.airspaceTo,
                intersection: intersection.intersection,
            });
            //For each crossing, we have at least two, sometimes more intersections: from and to. If the following intersections have about the same distance (1nm), then we must skip them
            while (i + 1 < intersections.length &&
            areIntersectionsEqual(intersection, intersections[i + 1])) {
                i++;
            }

        }

        fromAirspace = intersection.airspaceTo;
    }

    console.log("cleaned intersections", result);

    return result;
}

function areIntersectionsEqual(a: HalfAirspaceIntersection, b: HalfAirspaceIntersection) {
    return a.intersection.equals(b.intersection, UnitType.NMILE.convertTo(1, UnitType.GA_RADIAN));
}

/**
 * Two airspaces are equal, if the identifier is equal
 * @param a
 * @param b
 */
function areAirspacesEqual(a: LodBoundary, b: LodBoundary): boolean {
    return a.facility.name.substring(0, 4) === b.facility.name.substring(0, 4)
}
