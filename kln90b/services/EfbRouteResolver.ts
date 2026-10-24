import {
    AirwayData,
    AirwayType,
    DeepReadonly,
    EventBus,
    Facility,
    FacilityClient,
    FlightPlanRouteEnrouteLeg,
    GeoPoint,
    ICAO,
    IcaoValue,
    ReadonlyFlightPlanRoute,
    UnitType,
    UserFacility,
    UserFacilityType,
} from "@microsoft/msfs-sdk";
import {KLNFlightplanLeg, KLNLegType} from "../data/flightplan/Flightplan";
import {getUniqueIdent} from "../data/navdata/UniqueIdentGenerator";
import {buildIcao, buildIcaoStruct, TEMPORARY_WAYPOINT} from "../data/navdata/IcaoBuilder";
import {StatusLineMessageEvents} from "../controls/StatusLine";
import {KLNFacilityRepository} from "../data/navdata/KLNFacilityRepository";
import {EfbSegment, ResolvedEfbRoute} from "./EfbRouteFit";

/** A fix of the route: its facility, or the ident of one that cannot be loaded (reported as WAYPOINT xxx DELETED) */
type ResolvedFix = { readonly facility: Facility } | { readonly missing: string };

/** A resolved route, with what the resolve added to the facility repository */
export interface EfbRouteResolution extends ResolvedEfbRoute {
    /**
     * Design §6: every waypoint this resolve created in the repository (the temporary waypoints of lat/lon and
     * point-bearing-distance legs), whether the fit keeps its leg or not. The loader removes those that no flight plan
     * uses after the fit; nothing else in the repository is touched. Whatever else a resolve creates in the repository
     * (the DME arc entries of a procedure) belongs in this list too
     */
    readonly createdWaypoints: Facility[],
}

/**
 * Turns the route the EFB syncs into the ordered segments that fitEfbRoute fits into FPL 0 (#195, design §5). Every
 * lookup happens here, so that the fit itself needs no navdata.
 *
 * - The departure airport is a one-leg en-route segment, the destination is kept apart (its place is reserved).
 * - The en-route legs become the legs of one en-route segment, broken by a `missing` segment where a fix cannot be
 *   loaded.
 * - Lat/lon and point-bearing-distance legs become temporary waypoints (region XY), which this adds to the repository
 *   and lists in `createdWaypoints`. The loader removes those that the fit cuts.
 * - An airway leg is expanded into the fixes of the airway between the fix before it and its exit fix.
 */
export class EfbRouteResolver {

    constructor(private readonly bus: EventBus, private readonly facilityLoader: FacilityClient, private readonly facilityRepository: KLNFacilityRepository) {
    }

    public async resolve(route: ReadonlyFlightPlanRoute): Promise<EfbRouteResolution> {
        const segments: EfbSegment[] = [];
        // Kept per resolve, not on the instance: an overtaken resolve may still be running
        const createdWaypoints: Facility[] = [];
        // The facility of the last leg resolved, the entry of an airway that follows
        let previous: Facility | null = null;

        if (!ICAO.isValueEmpty(route.departureAirport)) {
            const departure = await this.loadFacility(route.departureAirport);
            if (departure === null) {
                segments.push({kind: "missing", ident: route.departureAirport.ident});
            } else {
                segments.push({kind: "user", legs: [EfbRouteResolver.userLeg(departure)]});
                previous = departure;
            }
        }

        let enroute: KLNFlightplanLeg[] = [];
        for (const leg of route.enroute) {
            for (const fix of await this.resolveLeg(leg, previous, createdWaypoints)) {
                if ("facility" in fix) {
                    enroute.push(EfbRouteResolver.userLeg(fix.facility));
                    previous = fix.facility;
                } else {
                    if (enroute.length > 0) {
                        segments.push({kind: "user", legs: enroute});
                        enroute = [];
                    }
                    segments.push({kind: "missing", ident: fix.missing});
                }
            }
        }
        if (enroute.length > 0) {
            segments.push({kind: "user", legs: enroute});
        }

        let destination: KLNFlightplanLeg | null = null;
        if (!ICAO.isValueEmpty(route.destinationAirport)) {
            const facility = await this.loadFacility(route.destinationAirport);
            if (facility === null) {
                // Reported last, where it stands in the route
                segments.push({kind: "missing", ident: route.destinationAirport.ident});
            } else {
                destination = EfbRouteResolver.userLeg(facility);
            }
        }

        return {segments, destination, createdWaypoints};
    }

    /**
     * The fixes one en-route leg stands for, in the order they are flown. None for a PPOS leg (design §2: ignored, as
     * before) or a leg without a fix
     */
    private async resolveLeg(leg: DeepReadonly<FlightPlanRouteEnrouteLeg>, previous: Facility | null, created: Facility[]): Promise<ResolvedFix[]> {
        if (leg.isPpos) {
            return [];
        } else if (leg.hasLatLon) {
            return [await this.resolveLatLon(leg, created)];
        } else if (leg.hasPointBearingDistance) {
            return [await this.resolvePointBearingDistance(leg, created)];
        } else if (!ICAO.isValueEmpty(leg.fixIcao)) {
            const fix = await this.loadFacility(leg.fixIcao);
            if (fix === null) {
                return [{missing: leg.fixIcao.ident}];
            }
            const airwayFixes = leg.via === "" ? [] : await this.resolveAirway(leg.via, previous, fix);
            return [...airwayFixes, {facility: fix}];
        }
        return [];
    }

    private async resolveLatLon(leg: DeepReadonly<FlightPlanRouteEnrouteLeg>, created: Facility[]): Promise<ResolvedFix> {
        const held = this.findHeldWaypoint(leg.fixIcao);
        if (held !== undefined) {
            return {facility: held};
        }

        let ident = "CUST";
        if (!ICAO.isValueEmpty(leg.fixIcao)) {
            ident = leg.fixIcao.ident;
        }

        return this.createTemporaryWaypoint(ident, leg.lat, leg.lon, created);
    }

    /**
     * #195.1: a fix at a true bearing and a distance in NM from a reference facility (EDDF DKB180/15 WLD EDDM). Its
     * position is found as the SDK's Garmin route loader does, and it is named after the leg like a named lat/lon leg,
     * falling back to the reference ident
     */
    private async resolvePointBearingDistance(leg: DeepReadonly<FlightPlanRouteEnrouteLeg>, created: Facility[]): Promise<ResolvedFix> {
        const ident = leg.name || leg.referenceIcao.ident || "CUST";
        const reference = await this.loadFacility(leg.referenceIcao);
        if (reference === null) {
            return {missing: EfbRouteResolver.reportedIdent(ident)};
        }

        // A distance of 0 leaves the reference position
        const position = new GeoPoint(reference.lat, reference.lon)
            .offset(leg.bearing, UnitType.NMILE.convertTo(leg.distance, UnitType.GA_RADIAN));
        return this.createTemporaryWaypoint(ident, position.lat, position.lon, created);
    }

    /**
     * #195.2: the fixes of the airway strictly between the entry (the fix before the leg) and the exit, in the
     * direction of travel. None when the airway, the entry or the exit cannot be found on it, or the exit is the entry:
     * the leg then goes direct to the exit fix, as before. A VOR or NDB on the airway is loaded as that facility, as the
     * SDK's Garmin route loader does
     */
    private async resolveAirway(via: string, entry: Facility | null, exit: Facility): Promise<ResolvedFix[]> {
        if (entry === null) {
            return [];
        }

        let airway: AirwayData;
        try {
            // The airway type does not select anything (see the SDK's Garmin route loader)
            airway = await this.facilityLoader.getAirway(via, AirwayType.None, exit.icaoStruct);
        } catch (e) {
            console.warn(`Airway ${via} to ${exit.icaoStruct.ident} not found, flying direct`, e);
            return [];
        }

        const indexOf = (fac: Facility) => airway.waypoints.findIndex(w =>
            w.icaoStruct.ident === fac.icaoStruct.ident && w.icaoStruct.region === fac.icaoStruct.region);
        const entryIndex = indexOf(entry);
        const exitIndex = indexOf(exit);
        if (entryIndex < 0 || exitIndex < 0 || entryIndex === exitIndex) {
            return [];
        }

        const step = exitIndex > entryIndex ? 1 : -1;
        const fixes: ResolvedFix[] = [];
        for (let i = entryIndex + step; i !== exitIndex; i += step) {
            const waypoint = airway.waypoints[i];
            if (waypoint.icaoStruct.type === "W") {
                fixes.push({facility: waypoint});
            } else {
                const facility = await this.loadFacility(waypoint.icaoStruct);
                fixes.push(facility === null ? {missing: waypoint.icaoStruct.ident} : {facility});
            }
        }
        return fixes;
    }

    /**
     * A new temporary waypoint (region XY) with the first four characters of the ident, made unique with the first free
     * letter, and listed in `created`. Missing when no letter is free or the user data base is full (C-2: USR DB FULL)
     */
    private async createTemporaryWaypoint(ident: string, lat: number, lon: number, created: Facility[]): Promise<ResolvedFix> {
        const newIdent = await getUniqueIdent(ident, this.facilityLoader);

        if (newIdent === null) {
            return {missing: EfbRouteResolver.reportedIdent(ident)};
        }

        const facility: UserFacility = {
            icao: buildIcao('U', TEMPORARY_WAYPOINT, newIdent),
            icaoStruct: buildIcaoStruct('U', TEMPORARY_WAYPOINT, newIdent),
            name: "",
            lat: lat,
            lon: lon,
            region: TEMPORARY_WAYPOINT,
            city: "",
            isTemporary: false, //irrelevant, because this flag is not persisted
            userFacilityType: UserFacilityType.LAT_LONG,
        };
        console.log("Adding temporary user waypoint", facility);

        try {
            this.facilityRepository.add(facility);
            created.push(facility);
            return {facility};
        } catch (e) {
            this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "USR DB FULL");
            console.error(e);
            return {missing: EfbRouteResolver.reportedIdent(ident)};
        }
    }

    /**
     * The ident a dropped temporary waypoint is reported by: the first four characters it would have been named after
     * (getUniqueIdent). The MSG page does not truncate, and WAYPOINT, the ident and DELETED fit its 23 columns only for
     * an ident of up to six characters, which a name of the EFB may well exceed
     */
    private static reportedIdent(ident: string): string {
        return ident.substring(0, 4);
    }

    /**
     * #187, the maintainer's ruling: KlnEfbSaver sends a user (region XX) or temporary (region XY) waypoint as a
     * lat/lon leg whose fixIcao names it, always with the type U. When the EFB syncs that leg back and the unit still
     * holds the waypoint, the leg is that waypoint, matched by region and ident whatever its type, with the position
     * the unit holds. The repository holds only user and temporary waypoints, so a database fix never matches
     */
    private findHeldWaypoint(fixIcao: DeepReadonly<IcaoValue>): Facility | undefined {
        let held: Facility | undefined = undefined;
        this.facilityRepository.forEach(fac => {
            if (fac.icaoStruct.region === fixIcao.region && fac.icaoStruct.ident === fixIcao.ident) {
                held = fac;
            }
        });
        return held;
    }

    private async loadFacility(icao: DeepReadonly<IcaoValue>): Promise<Facility | null> {
        try {
            return await this.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(icao), icao);
        } catch (e) {
            console.error(`Error converting ${ICAO.tryValueToStringV2(icao)}`, e);
            return null;
        }
    }

    private static userLeg(facility: Facility): KLNFlightplanLeg {
        return {wpt: facility, type: KLNLegType.USER};
    }
}
