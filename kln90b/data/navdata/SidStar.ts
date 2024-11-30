import {
    AirportFacility,
    ApproachProcedure,
    ApproachTransition,
    BitFlags,
    EnrouteTransition,
    Facility,
    FacilityClient,
    FacilityType,
    FixTypeFlags,
    FlightPlanLeg,
    GeoCircle,
    GeoPoint,
    ICAO,
    LatLonInterface,
    LegTurnDirection,
    LegType,
    NavMath,
    Procedure,
    RnavTypeFlags,
    RunwayTransition,
    RunwayUtils,
    UnitType,
    UserFacility,
    UserFacilityType,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {Flightplan, KLNFixType, KLNFlightplanLeg, KLNLegType, ProcedureInformation} from "../flightplan/Flightplan";
import {Degrees, NauticalMiles} from "../Units";
import {format} from "numerable";
import {Sensors} from "../../Sensors";
import {NavPageState} from "../VolatileMemory";
import {buildIcao, buildIcaoStruct, TEMPORARY_WAYPOINT} from "./IcaoBuilder";
import {KLNFacilityRepository} from "./KLNFacilityRepository";

export interface ArcData {
    beginRadial: Degrees, //The published beginning radial
    beginPoint: LatLonInterface, //Published Coordinates of the beginning
    entryFacility: Facility, //The point where the aircraft will enter the arc. Somewhere between begin and end

    endRadial: Degrees,
    endFacility: Facility, //The end waypoint of the arc
    endPoint: LatLonInterface,

    turnDirection: LegTurnDirection,

    vor: VorFacility, //The VOR

    circle: GeoCircle,
}

const B_RNAV = UnitType.NMILE.convertTo(5, UnitType.METER);

export class SidStar {



    public constructor(private readonly facilityLoader: FacilityClient, private readonly facilityRepository: KLNFacilityRepository, private readonly sensors: Sensors) {
    }

    /**
     * Returns true, if the enroute segment of the flightplan contains legs from the procedure
     * @param fplLegs
     * @param procedureLegs
     */

    public static hasDuplicates(fplLegs: KLNFlightplanLeg[], procedureLegs: KLNFlightplanLeg[]): boolean {
        const procedureIcaos = procedureLegs.map(leg => leg.wpt.icaoStruct);

        for (const fplLeg of fplLegs) {
            if (procedureIcaos.includes(fplLeg.wpt.icaoStruct)) {
                return true;
            }
        }
        return false;
    }

    public static getWptSuffix(fixType: KLNFixType | undefined | null): string {
        switch (fixType) {
            case KLNFixType.IAF:
                return "à";
            case KLNFixType.FAF:
                return "á";
            case KLNFixType.MAP:
                return "ã";
            case KLNFixType.MAHP:
                return "â";
            default:
                return "";
        }
    }

    public static formatApproachName(app: ApproachProcedure, facility: AirportFacility): string {
        let prefix: string;

        switch (app.approachType) {
            case ApproachType.APPROACH_TYPE_GPS:
            case ApproachType.APPROACH_TYPE_RNAV:
                prefix = "R";
                break;
            case ApproachType.APPROACH_TYPE_VOR:
            case ApproachType.APPROACH_TYPE_VORDME:
                prefix = "V";
                break;
            case ApproachType.APPROACH_TYPE_NDB:
            case ApproachType.APPROACH_TYPE_NDBDME:
                prefix = "N";
                break;
            default:
                throw new Error(`Unsupported approachtype: ${app}`);
        }

        let runway: string;
        //Figure 6-18, no padding with spaces in the name
        if (app.runway === "") {
            runway = "-"; //See figure 3-149 -A or -B
        } else {
            runway = RunwayUtils.getRunwayNameString(app.runwayNumber, app.runwayDesignator, true);
        }

        return prefix + runway + app.approachSuffix + "-" + facility.icaoStruct.ident;
    }

    /**
     * 6-17. Scan was pulled from the Super NAV 5 page to recalculate the arc entry based on the current track
     */
    public static recalculateArcEntryData(leg: KLNFlightplanLeg, sensors: Sensors): ArcData | null {
        const arcData = leg.arcData!;

        const track = sensors.in.gps.getTrackTrueRespectingGroundspeed();
        if (track === null) {
            return null;
        }

        const to = new GeoPoint(sensors.in.gps.coords.lat, sensors.in.gps.coords.lon);
        to.offset(track, UnitType.NMILE.convertTo(1000, UnitType.GA_RADIAN));

        const aircraftPath = new GeoCircle(new Float64Array(3), 0);
        aircraftPath.setAsGreatCircle(sensors.in.gps.coords, to);

        const intersections: Float64Array[] = [];

        arcData.circle.intersection(aircraftPath, intersections);

        const entryPoints = intersections.map(int => {
            const p = new GeoPoint(0, 0);
            return p.setFromCartesian(int);
            })
            .filter(p => Math.abs(NavMath.diffAngle(sensors.in.gps.coords.bearingTo(p), track)) <= 90) //We look at the intersections of two great circles. The closest intersection may actually be behind the plane
            .sort((a, b) => a.distance(sensors.in.gps.coords) - b.distance(sensors.in.gps.coords)) //Max two, we want the closest one in front of the plane
        ;

        for (const entryPoint of entryPoints) {
            const vorPoint = new GeoPoint(arcData.vor.lat, arcData.vor.lon);
            const radial = vorPoint.bearingTo(entryPoint);
            const dist = UnitType.GA_RADIAN.convertTo(arcData.circle.radius, UnitType.NMILE);

            let start;
            let end;

            if (arcData.turnDirection == LegTurnDirection.Left) {
                start = arcData.endRadial;
                end = arcData.beginRadial;
            } else {
                start = arcData.beginRadial;
                end = arcData.endRadial;
            }


            if (NavMath.bearingIsBetween(radial, start, end)) {
                // noinspection JSDeprecatedSymbols
                const entryFacility: UserFacility = {
                    icao: buildIcao('U', TEMPORARY_WAYPOINT, this.getArcEntryName(arcData.vor.icaoStruct.ident, radial, dist)),
                    icaoStruct: buildIcaoStruct('U', TEMPORARY_WAYPOINT, this.getArcEntryName(arcData.vor.icaoStruct.ident, radial, dist)),
                    name: "",
                    lat: entryPoint.lat,
                    lon: entryPoint.lon,
                    region: TEMPORARY_WAYPOINT,
                    city: "",
                    isTemporary: false, //irrelevant, because this flag is not persisted
                    userFacilityType: UserFacilityType.LAT_LONG,
                    reference1IcaoStruct: arcData.vor.icaoStruct,
                    reference1Radial: radial,
                    reference1Distance: dist,
                };

                /*
                try {
                    //Not sure, but I would expect this to behave like the REF page
                    this.facilityLoader.facilityRepo.add(entryFacility);
                } catch (e) {
                    //DB full. Oh well, what's the worst that could possibly happen?
                }
                 */

                return {
                    beginRadial: arcData.beginRadial,
                    beginPoint: arcData.beginPoint,
                    entryFacility: entryFacility,
                    endRadial: arcData.endRadial,
                    endFacility: arcData.endFacility,
                    endPoint: arcData.endPoint,
                    turnDirection: arcData.turnDirection,
                    vor: arcData.vor,
                    circle: arcData.circle,
                }
            }
        }

        return null;
    }

    public static isApproachRecognized(app: ApproachProcedure): boolean {
        if (!SidStar.appIsBRnav(app) || !SidStar.appHasNoRFLegs(app)) {
            return false;
        }

        switch (app.approachType) {
            case ApproachType.APPROACH_TYPE_RNAV:
                //Only if LNAV without VNAV is allowed
                return BitFlags.isAny(app.rnavTypeFlags, RnavTypeFlags.LNAV);
            case ApproachType.APPROACH_TYPE_GPS:
            case ApproachType.APPROACH_TYPE_VOR:
            case ApproachType.APPROACH_TYPE_NDB:
            case ApproachType.APPROACH_TYPE_VORDME:
            case ApproachType.APPROACH_TYPE_NDBDME:
                return true;
            default:
                return false;
        }
    }

    public static isProcedureRecognized(proc: Procedure, runwayTransition: RunwayTransition | null = null, enrouteTransition: EnrouteTransition | null = null): boolean {
        //The real device does not include RNAV procedures: https://www.euroga.org/forums/maintenance-avionics/5573-rnav-retrofit
        //It seems, that we can't recognize those here
        return SidStar.procIsBRnav(proc) && SidStar.procHasNoRFLegs(proc) && SidStar.hasAtLeastOneRecognizedLeg(proc, runwayTransition, enrouteTransition);
    }

    /**
     * 3-32, 6-18
     */
    public static getVorIfWithin30NMOfArc(navState: NavPageState, fpl0: Flightplan): VorFacility | null {
        const fplIdx = navState.activeWaypoint.getActiveFplIdx();
        if (fplIdx === -1) {
            return null;
        }


        const from = navState.activeWaypoint.getFromLeg();
        if (from?.path.isGreatCircle() === false) {
            //Currently on an arc. -1 must exist for this to happen
            const legs = fpl0.getLegs();
            return legs[fplIdx - 1].arcData!.vor;
        }


        const futureLegs = navState.activeWaypoint.getFutureLegs();
        let dist = navState.distToActive!;


        for (let i = 0; i < futureLegs.length; i++) {
            const next = futureLegs[i];
            if (i > 0) {
                const prev = futureLegs[i - 1];
                //The manual states, distance is to the arc, not the VOR:
                dist += UnitType.GA_RADIAN.convertTo(new GeoPoint(prev.wpt.lat, prev.wpt.lon).distance(next.wpt), UnitType.NMILE);
            }

            if (dist > 30) {
                return null;
            }

            if (next.arcData !== undefined) {
                return next.arcData.vor;
            }

        }

        return null;
    }

    /**
     * 6-16
     * @param navaid
     * @param radial
     * @param dist
     */
    private static getArcEntryName(navaid: String, radial: Degrees, dist: NauticalMiles): string {
        const rounded = Math.round(dist);
        if (rounded <= 26) {
            const ALPHABET = [' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

            return `D${format(radial, "000")}${ALPHABET[rounded]}`;
        } else if (rounded <= 99) { // https://www.jeppesen.com/download/navdata/navdata_info1.pdf
            return `${navaid}${format(rounded, "00")}`;
        } else {
            return `${format(rounded - 100, "00")}${navaid}`;
        }

    }

    private static appHasNoRFLegs(app: ApproachProcedure): boolean {
        for (const transition of app.transitions) {
            if (transition.legs.some(leg => leg.type === LegType.RF)) {
                return false;
            }
        }

        return !app.finalLegs.concat(app.missedLegs).some(leg => leg.type === LegType.RF);
    }

    private static procHasNoRFLegs(proc: Procedure): boolean {
        for (const transition of proc.enRouteTransitions) {
            if (transition.legs.some(leg => leg.type === LegType.RF)) {
                return false;
            }
        }
        for (const transition of proc.runwayTransitions) {
            if (transition.legs.some(leg => leg.type === LegType.RF)) {
                return false;
            }
        }

        return !proc.commonLegs.some(leg => leg.type === LegType.RF);
    }

    /**
     *  People are going to hate me, but the KLN is only capable of B-RNAV
     * @param proc
     * @private
     */
    private static appIsBRnav(app: ApproachProcedure): boolean {
        for (const transition of app.transitions) {
            if (transition.legs.some(leg => leg.rnp > 0 && leg.rnp < B_RNAV)) {
                return false;
            }
        }

        return !app.finalLegs.concat(app.missedLegs).some(leg => leg.rnp > 0 && leg.rnp < B_RNAV);
    }

    /**
     *  People are going to hate me, but the KLN is only capable of B-RNAV
     * @param proc
     * @private
     */
    private static procIsBRnav(proc: Procedure): boolean {
        for (const transition of proc.enRouteTransitions) {
            if (transition.legs.some(leg => leg.rnp > 0 && leg.rnp < B_RNAV)) {
                return false;
            }
        }
        for (const transition of proc.runwayTransitions) {
            if (transition.legs.some(leg => leg.rnp > 0 && leg.rnp < B_RNAV)) {
                return false;
            }
        }

        return !proc.commonLegs.some(leg => leg.rnp > 0 && leg.rnp < B_RNAV);
    }

    /**
     * For example KGEG GEG7 only has CA and VM, which are not recognized by the KLN,
     * which would result in an empty procedure with no legs.
     * Another interesting example is KJFK JFK 5. Only RWY 31 has a leg to CRI, the others would be empty
     * @param proc
     * @param runwayTransition If given, then only this runwaytransition will be checked, otherwise all
     * @param enrouteTransition If given, then only this enrouteTransition will be checked, otherwise all
     * @private
     */
    private static hasAtLeastOneRecognizedLeg(proc: Procedure, runwayTransition: RunwayTransition | null = null, enrouteTransition: EnrouteTransition | null = null): boolean {
        if (enrouteTransition === null) {
            for (const transition of proc.enRouteTransitions) {
                if (transition.legs.some(leg => SidStar.isLegSupported(leg))) {
                    return true;
                }
            }
        } else if (enrouteTransition.legs.some(leg => SidStar.isLegSupported(leg))) {
            return true;
        }

        if (runwayTransition === null) {
            for (const transition of proc.runwayTransitions) {
                if (transition.legs.some(leg => SidStar.isLegSupported(leg))) {
                    return true;
                }
            }
        } else if (runwayTransition.legs.some(leg => SidStar.isLegSupported(leg))) {
            return true;
        }

        return proc.commonLegs.some(leg => SidStar.isLegSupported(leg));
    }

    private static isLegSupported(leg: FlightPlanLeg): boolean {
        return leg.fixIcaoStruct.ident.trim() !== "" &&
            leg.type != LegType.RF;
    }

    /**
     * Builds the list of legs.
     * Filters out duplicates and legs that are not supported by the KLN
     * Async, because we may need the facilities for DME arcs.
     * @param facility
     * @param app
     * @param iaf
     */

    public async getKLNApproachLegList(facility: AirportFacility, app: ApproachProcedure, iaf: ApproachTransition | null): Promise<KLNFlightplanLeg[]> {
        const legs: FlightPlanLeg[] = [];

        if (iaf != null) {
            legs.push(...iaf.legs);
        }

        legs.push(...app.finalLegs, ...app.missedLegs);

        const cleaned = this.filterOutDuplicates(legs.filter(leg => SidStar.isLegSupported(leg)));
        const approachName = SidStar.formatApproachName(app, facility);
        return await this.convertToKLN(facility, {
            displayName: approachName,
            procedureName: app.name,
            approachSuffix: app.approachSuffix,
            approachType: app.approachType,
            transition: iaf?.name,
            runwayNumber: app.runwayNumber,
            runwayDesignator: app.runwayDesignator,
        }, KLNLegType.APP, cleaned);
    }

    private filterOutDuplicates(legs: FlightPlanLeg[]): FlightPlanLeg[] {
        const filtered: FlightPlanLeg[] = [];

        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (i === legs.length - 1 || BitFlags.isAny(leg.fixTypeFlags, BitFlags.union(FixTypeFlags.IAF, FixTypeFlags.FAF, FixTypeFlags.MAP, FixTypeFlags.MAHP))) { //We always keep IAF, FAF, MAP!
                let modifiedLeg = leg;
                if (i > 0) {
                    modifiedLeg = this.addArcInfoIfPrevIsSame(legs[i - 1], leg);
                }
                this.mergeAFsIfNecessary(modifiedLeg, legs, i);
                filtered.push(modifiedLeg);
            } else {
                const next = legs[i + 1];
                const bothAreAF = leg.type === LegType.AF && next.type === LegType.AF; //The KLN does not support step down fixes. We merge multiple arcs

                const nextIsSameWpt = ICAO.valueEquals(next.fixIcaoStruct, leg.fixIcaoStruct);
                const isAlreadyLastInList = filtered.length > 0 && ICAO.valueEquals(filtered[filtered.length - 1].fixIcaoStruct, leg.fixIcaoStruct);
                if (!bothAreAF && !nextIsSameWpt && !isAlreadyLastInList) { //We prefer the following WPT, because those might be holds
                    let modifiedLeg = leg;
                    if (i > 0) {
                        modifiedLeg = this.addArcInfoIfPrevIsSame(legs[i - 1], leg);
                    }
                    this.mergeAFsIfNecessary(modifiedLeg, legs, i);
                    filtered.push(modifiedLeg);
                }
            }
        }

        return filtered;
    }

    private mergeAFsIfNecessary(leg: FlightPlanLeg, legs: FlightPlanLeg[], i: number) {
        //If this is an arc, we must check the previous waypoint if that was an arc to. If so, we merge themn
        if (leg.type === LegType.AF) {
            let iPrev = i - 1;
            while (iPrev >= 0 && legs[iPrev].type === LegType.AF) {
                const prev = legs[iPrev];
                leg.course = prev.course; //Our new arc goes from the prev start to this ones theta
                iPrev--;
            }
        }
    }

    /**
     * Example PHNY: TEWVU is the last waypoint of the transition, as well as the IF.
     * In that case, we would use the IF, but the arc information from the previous wpt would be lost.
     * We merge the arc information back from the previous waypoint
     * @param prevLeg
     * @param currentLeg
     * @private
     */
    private addArcInfoIfPrevIsSame(prevLeg: FlightPlanLeg, currentLeg: FlightPlanLeg): FlightPlanLeg {
        if (!ICAO.valueEquals(prevLeg.fixIcaoStruct, currentLeg.fixIcaoStruct) || prevLeg.type !== LegType.AF) {
            return currentLeg;
        }

        //Yes, merging is as easy as that...
        prevLeg.fixTypeFlags = currentLeg.fixTypeFlags;
        return prevLeg;
    }

    /**
     * Builds the list of legs.
     * Filters out duplicates and legs that are not supported by the KLN.
     * Async, because we may need the facilities for DME arcs.
     * @param facility
     * @param type
     * @param proc
     * @param rwy
     * @param trans
     */

    public async getKLNProcedureLegList(facility: AirportFacility, proc: Procedure, type: KLNLegType, rwy: RunwayTransition | null, trans: EnrouteTransition | null): Promise<KLNFlightplanLeg[]> {
        const legs: FlightPlanLeg[] = [];

        if (type === KLNLegType.SID) {
            if (rwy != null) {
                legs.push(...rwy.legs);
            }

            legs.push(...proc.commonLegs);

            if (trans != null) {
                legs.push(...trans.legs);
            }
        } else {

            if (trans != null) {
                legs.push(...trans.legs);
            }

            legs.push(...proc.commonLegs);

            if (rwy != null) {
                legs.push(...rwy.legs);
            }
        }

        const cleaned = this.filterOutDuplicates(legs.filter(leg => SidStar.isLegSupported(leg)));
        const procedureName = `${proc.name}-${type === KLNLegType.SID ? "SID" : "Æ"}`;
        return await this.convertToKLN(facility, {
            displayName: procedureName,
            procedureName: proc.name,
            transition: trans?.name,
            runwayNumber: rwy?.runwayNumber,
            runwayDesignator: rwy?.runwayDesignation as RunwayDesignator ?? null,
        }, type, cleaned);

    }

    /**
     * Converts the FlightPlanLegs to KLNFlightplanLegs.
     * Also resolves DME Arc entries.
     * @param facility
     * @param procedureName
     * @param legType
     * @param legs
     * @private
     */
    private async convertToKLN(facility: AirportFacility, procedureInformation: ProcedureInformation, legType: KLNLegType, legs: FlightPlanLeg[]): Promise<KLNFlightplanLeg[]> {
        const promises = legs.map(leg =>
            this.facilityLoader.getFacility(ICAO.getFacilityTypeFromValue(leg.fixIcaoStruct), leg.fixIcaoStruct).then(fac => ({
                    leg: leg,
                    facility: fac,
                }),
            ));


        const enriched = await Promise.all(promises);
        const klnLegs: KLNFlightplanLeg[] = [];

        for (const enrichedLeg of enriched) {
            if (enrichedLeg.leg.type === LegType.AF) {
                //Entry here and exits below for arcs

                //The KLN calculates its own entry
                const originalEntry = klnLegs.pop()!;


                const arcData = await this.getArcEntryData(enrichedLeg);
                klnLegs.push({
                    wpt: arcData.entryFacility,
                    type: legType,
                    parentFacility: facility,
                    procedure: procedureInformation,
                    arcData: arcData,
                    fixType: originalEntry.fixType,
                    flyOver: enrichedLeg.leg.flyOver,
                });
            }


            const askObs = this.shouldAskObs(enrichedLeg.leg.type);
            klnLegs.push({
                wpt: enrichedLeg.facility,
                type: legType,
                parentFacility: facility,
                procedure: procedureInformation,
                flyOver: enrichedLeg.leg.flyOver || askObs,
                askObs: askObs,
                fixType: this.getKLNFixType(enrichedLeg.leg),
            });

        }
        return klnLegs;

    }

    private getKLNFixType(leg: FlightPlanLeg): KLNFixType | undefined {
        if (BitFlags.isAll(leg.fixTypeFlags, FixTypeFlags.FAF)) {
            return KLNFixType.FAF; //This one is most important, we check this first
        } else if (BitFlags.isAll(leg.fixTypeFlags, FixTypeFlags.MAP)) {
            return KLNFixType.MAP;
        } else if (BitFlags.isAll(leg.fixTypeFlags, FixTypeFlags.IAF)) {
            return KLNFixType.IAF;
        } else if (BitFlags.isAll(leg.fixTypeFlags, FixTypeFlags.MAHP)) {
            return KLNFixType.MAHP;
        } else {
            return undefined;
        }
    }

    /**
     * B-2. KLN asks for OBS in holds and procedure turns
     * @param legType
     */

    private shouldAskObs(legType: LegType): boolean {
        switch (legType) {
            case LegType.HA:
            case LegType.HF:
            case LegType.HM:
            case LegType.PI:
                return true;
            default:
                return false;
        }
    }

    /**
     * 6-16
     * "Normal" systems use the published CI point as an entry. The KLN-90B does not support that type.
     * Therefore, it generates an artificialy entry waypoint based on the radial of the current position to the VOR.
     */
    private async getArcEntryData(convertedLeg: { facility: Facility; leg: FlightPlanLeg }): Promise<ArcData> {
        const vor = await this.facilityLoader.getFacility(FacilityType.VOR, convertedLeg.leg.originIcaoStruct);
        const vorPoint = new GeoPoint(vor.lat, vor.lon);

        const circleCenter = new Float64Array(3);
        vorPoint.toCartesian(circleCenter);

        const circle = new GeoCircle(circleCenter, UnitType.METER.convertTo(convertedLeg.leg.rho, UnitType.GA_RADIAN));

        //Published beginning
        const beginPoint = new GeoPoint(0, 0);
        vorPoint.offset(convertedLeg.leg.course, UnitType.METER.convertTo(convertedLeg.leg.rho, UnitType.GA_RADIAN), beginPoint);

        //Entry based on current position
        const entryPoint = new GeoPoint(0, 0);
        circle.closest(this.sensors.in.gps.coords, entryPoint);

        let radial = vorPoint.bearingTo(entryPoint);
        const dist = UnitType.METER.convertTo(convertedLeg.leg.rho, UnitType.NMILE);

        let start;
        let end;
        if (convertedLeg.leg.turnDirection == LegTurnDirection.Left) {
            start = convertedLeg.leg.theta;
            end = convertedLeg.leg.course;
        } else {
            start = convertedLeg.leg.course;
            end = convertedLeg.leg.theta;
            //Not sure if it is *always* correct to reverse it for right hand turns, but it seemed to work fine for all procedures as LGKO
            circle.reverse();
        }

        if (!NavMath.bearingIsBetween(radial, start, end)) {
            //Outside of arc, then it defaults to the beginning of the arc
            entryPoint.set(beginPoint);
            radial = convertedLeg.leg.course;
        }

        // noinspection JSDeprecatedSymbols
        const entryFacility: UserFacility = {
            icao: buildIcao('U', TEMPORARY_WAYPOINT, SidStar.getArcEntryName(vor.icaoStruct.ident, radial, dist)),
            icaoStruct: buildIcaoStruct('U', TEMPORARY_WAYPOINT, SidStar.getArcEntryName(vor.icaoStruct.ident, radial, dist)),
            name: "",
            lat: entryPoint.lat,
            lon: entryPoint.lon,
            region: TEMPORARY_WAYPOINT,
            city: "",
            isTemporary: false, //irrelevant, because this flag is not persisted
            userFacilityType: UserFacilityType.LAT_LONG,
            reference1IcaoStruct: vor.icaoStruct,
            reference1Radial: radial,
            reference1Distance: dist,
        };

        //End point. The precision of the facility coordinates may not be precise enough and cause errors in the resample of the NAV 5 page
        const endPoint = new GeoPoint(0, 0);
        circle.closest(convertedLeg.facility, endPoint);

        try {
            //Not sure, but I would expect this to behave like the REF page
            this.facilityRepository.add(entryFacility);
        } catch (e) {
            //DB full. Oh well, what's the worst that could possibly happen?
        }

        return {
            beginRadial: convertedLeg.leg.course,
            beginPoint: beginPoint,
            entryFacility: entryFacility,
            endRadial: convertedLeg.leg.theta,
            endFacility: convertedLeg.facility,
            endPoint: endPoint,
            turnDirection: convertedLeg.leg.turnDirection,

            vor: vor,
            circle: circle,
        }
    }

}