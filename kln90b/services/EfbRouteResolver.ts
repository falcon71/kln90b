import {
    AirportUtils,
    ApproachIdentifier,
    ApproachProcedure,
    AirwayData,
    AirwayType,
    DeepReadonly,
    EnrouteTransition,
    EventBus,
    Facility,
    FacilityClient,
    FacilityType,
    FacilityUtils,
    FlightPlanRouteEnrouteLeg,
    GeoPoint,
    ICAO,
    IcaoValue,
    ReadonlyFlightPlanRoute,
    RunwayIdentifier,
    RunwayTransition,
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
import {SidStar} from "../data/navdata/SidStar";

/** A fix of the route: its facility, or the ident of one that cannot be loaded (reported as WAYPOINT xxx DELETED) */
type ResolvedFix = { readonly facility: Facility } | { readonly missing: string };

/** A resolved route, with what the resolve added to the facility repository */
export interface EfbRouteResolution extends ResolvedEfbRoute {
    /**
     * Design §6: every waypoint this resolve created in the repository (the temporary waypoints of lat/lon and
     * point-bearing-distance legs, the DME arc entries SidStar adds while it converts a procedure), whether the fit
     * keeps its leg or not. The loader removes those that no flight plan uses after the fit; nothing else in the
     * repository is touched
     */
    readonly createdWaypoints: Facility[],
}

/** A choice the APT 7/8 flow makes, and whether it could make it as the route names it */
interface Choice<T> {
    readonly choice: T | null,
    readonly made: boolean,
}

/**
 * Turns the route the EFB syncs into the ordered segments that fitEfbRoute fits into FPL 0 (#195, #378, design §5).
 * Every lookup happens here, so that the fit itself needs no navdata.
 *
 * - The segments are in the order of FPL 0: the departure airport, the SID, the en-route fixes, the STAR and the
 *   approach (Apt7Page.loadNow, Apt8Page.loadNow). The destination is kept apart (its place is reserved).
 * - The departure airport is a one-leg en-route segment.
 * - The en-route legs become the legs of one en-route segment, broken by a `missing` segment where a fix cannot be
 *   loaded.
 * - Lat/lon and point-bearing-distance legs become temporary waypoints (region XY), which this adds to the repository
 *   and lists in `createdWaypoints`. The loader removes those that the fit cuts.
 * - An airway leg is expanded into the fixes of the airway between the fix before it and its exit fix.
 * - A SID, STAR or approach is a `procedure` segment when APT 7/8 would have let the pilot load it as the route names
 *   it, and an `invalid` one with the idents of its legs otherwise (design §4 "Invalid procedure"). One the airport
 *   does not have, or one without its airport, gives no segment.
 */
export class EfbRouteResolver {

    constructor(private readonly bus: EventBus, private readonly facilityLoader: FacilityClient, private readonly facilityRepository: KLNFacilityRepository, private readonly sidstar: SidStar) {
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

                const sid = await this.resolveDepartureArrival(departure, KLNLegType.SID, route.departure, route.departureTransition, route.departureRunway, createdWaypoints);
                if (sid !== null) {
                    segments.push(sid);
                    if (sid.kind === "procedure" && sid.legs.length > 0) {
                        // Design §5: an airway after a SID starts at the last fix of the SID
                        previous = sid.legs[sid.legs.length - 1].wpt;
                    }
                }
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
                // Reported last, where it stands in the route. The STAR and the approach have no airport to come from
                segments.push({kind: "missing", ident: route.destinationAirport.ident});
            } else {
                destination = EfbRouteResolver.userLeg(facility);

                const star = await this.resolveDepartureArrival(facility, KLNLegType.STAR, route.arrival, route.arrivalTransition, route.destinationRunway, createdWaypoints);
                if (star !== null) {
                    segments.push(star);
                }
                const approach = await this.resolveApproach(facility, route.approach, route.approachTransition, createdWaypoints);
                if (approach !== null) {
                    segments.push(approach);
                }
            }
        }

        return {segments, destination, createdWaypoints};
    }

    /**
     * #378: the SID or STAR the route names, as APT 7 would load it (Apt7Page.selectProcedure, selectRunway,
     * selectTransition). APT 7 selects a runway or a transition itself where there are none or one; where it would show
     * a list, the route's choice is taken if the list would show it (Apt7RunwayPage, Apt7TransitionPage show only those
     * that leave a leg the unit can fly). A SID asks for the runway first, a STAR for the transition first, and each
     * list depends on the choice before it. Null when the airport has no procedure of that name (nothing is known,
     * nothing is reported)
     */
    private async resolveDepartureArrival(airport: Facility, type: KLNLegType.SID | KLNLegType.STAR, name: string, transitionName: string, runway: DeepReadonly<RunwayIdentifier>, created: Facility[]): Promise<EfbSegment | null> {
        if (!FacilityUtils.isFacilityType(airport, FacilityType.Airport)) {
            return null;
        }
        const procedures = type === KLNLegType.SID ? airport.departures : airport.arrivals;
        const found = AirportUtils.findDepartureArrivalIndexesFromName(procedures, name, transitionName, runway);
        if (found.procedureIndex < 0) {
            return null;
        }
        const proc = procedures[found.procedureIndex];

        const chooseRunway = (trans: EnrouteTransition | null) => EfbRouteResolver.choose(proc.runwayTransitions, found.runwayTransitionIndex,
            r => SidStar.isProcedureRecognized(proc, r, trans));
        const chooseTransition = (rwy: RunwayTransition | null) => EfbRouteResolver.choose(proc.enRouteTransitions, found.enrouteTransitionIndex,
            t => SidStar.isProcedureRecognized(proc, rwy, t));

        let rwy: Choice<RunwayTransition>;
        let trans: Choice<EnrouteTransition>;
        if (type === KLNLegType.SID) {
            rwy = chooseRunway(null);
            trans = chooseTransition(rwy.choice);
        } else {
            trans = chooseTransition(null);
            rwy = chooseRunway(trans.choice);
        }

        const valid = SidStar.isProcedureRecognized(proc) && rwy.made && trans.made;
        const legs = () => this.sidstar.getKLNProcedureLegList(airport, proc, type, rwy.choice, trans.choice);
        return this.procedureSegment(valid, legs, created);
    }

    /**
     * #378: the approach the route names, as APT 8 would load it (Apt8Page.selectApproach): APT 8 lists only the
     * approaches the unit can fly (SidStar.isApproachRecognized), selects the IAF itself where there are none or one,
     * and lists every IAF otherwise, so the route must name one (an approach starts at an IAF, never at the IF). Null
     * when the airport has no such approach
     */
    private async resolveApproach(airport: Facility, identifier: DeepReadonly<ApproachIdentifier>, transitionName: string, created: Facility[]): Promise<EfbSegment | null> {
        if (!FacilityUtils.isFacilityType(airport, FacilityType.Airport)) {
            return null;
        }
        const found = AirportUtils.findApproachIndexesFromIdentifier(airport, identifier, transitionName);
        if (found.approachIndex < 0) {
            return null;
        }
        const app = airport.approaches[found.approachIndex];
        const iaf = EfbRouteResolver.choose(app.transitions, found.transitionIndex, () => true);

        const recognized = SidStar.isApproachRecognized(app);
        // The conversion names the approach, and SidStar has no name for a type the unit does not list (an ILS). The
        // legs of such an approach are only reported, never loaded, so a copy of another type gives them
        const convertible: ApproachProcedure = recognized ? app : {...app, approachType: ApproachType.APPROACH_TYPE_RNAV};
        return this.procedureSegment(recognized && iaf.made, () => this.sidstar.getKLNApproachLegList(airport, convertible, iaf.choice), created);
    }

    /**
     * The choice of APT 7/8 among `options`: the only one, or none, without asking; otherwise the one the route names
     * (`namedIndex`, -1 for none) if the list would show it
     */
    private static choose<T>(options: readonly T[], namedIndex: number, listed: (option: T) => boolean): Choice<T> {
        if (options.length <= 1) {
            return {choice: options.length === 1 ? options[0] : null, made: true};
        }
        const named = namedIndex >= 0 ? options[namedIndex] : undefined;
        // A choice the page would not list has no supported leg, so this keeps an empty procedure from being loaded
        if (named !== undefined && listed(named)) {
            return {choice: named, made: true};
        }
        return {choice: null, made: false};
    }

    /**
     * Converts a procedure with SidStar, the conversion of APT 7/8, into a `procedure` segment, or into an `invalid`
     * one with the idents of its legs (design §4: those of the procedure without the missing choice). The DME arc
     * entries the conversion adds to the repository (6-16) are listed in `created` unless the repository held them
     * before; the loader removes those no flight plan uses. Null when the conversion fails (a fix of the procedure is
     * not in the database)
     */
    private async procedureSegment(valid: boolean, convert: () => Promise<KLNFlightplanLeg[]>, created: Facility[]): Promise<EfbSegment | null> {
        const held = new Set<string>();
        this.facilityRepository.forEach(fac => held.add(ICAO.getUid(fac.icaoStruct)), [FacilityType.USR]);

        let legs: KLNFlightplanLeg[];
        try {
            legs = await convert();
        } catch (e) {
            console.error("Error converting a procedure of the route", e);
            // Deliberate: no segment and no message, as for a procedure not in the database (design §4)
            return null;
        }

        for (const leg of legs) {
            const entry = leg.arcData?.entryFacility;
            if (entry !== undefined && !held.has(ICAO.getUid(entry.icaoStruct)) && !created.includes(entry)) {
                created.push(entry);
            }
        }

        return valid ? {kind: "procedure", legs} : {kind: "invalid", idents: legs.map(leg => leg.wpt.icaoStruct.ident)};
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
