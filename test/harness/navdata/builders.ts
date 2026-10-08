import {
    AirportClass, AirportFacility, AirportFacilityDataFlags, AirportPrivateType, AirportRunway, FacilityFrequencyType,
    GpsBoolean, ICAO, IntersectionFacility, IntersectionType, LandingSystemCategory, NdbFacility, NdbType,
    RunwayLightingType, RunwaySurfaceCategory, RunwaySurfaceType, RunwayUtils, UnitType, VorClass, VorFacility, VorType,
} from '@microsoft/msfs-sdk';

const DEFAULT_REGION = 'K1';

function emptyIls() {
    return {
        icao: '', icaoStruct: ICAO.emptyValue(), name: '', freqMHz: 0, freqBCD16: 0, type: FacilityFrequencyType.None,
        hasGlideslope: false, glideslopeAngle: 0, localizerCourse: 0, magvar: 0, hasBackcourse: false, glideslopeAlt: 0,
        glideslopeLat: 0, glideslopeLon: 0, lsCategory: LandingSystemCategory.None, localizerWidth: 0,
    };
}

function runwayDesignation(heading: number): string {
    const a = Math.round(heading / 10) % 36 || 36;
    const b = (a + 18 - 1) % 36 + 1;
    return `${String(Math.min(a, b)).padStart(2, '0')}-${String(Math.max(a, b)).padStart(2, '0')}`;
}

/**
 * The heading of the runway's lower-numbered end, which the SDK reads as `direction` for a designation `09-27` (it
 * takes the first named end for the heading and the second for its opposite)
 */
function lowerEndHeading(heading: number): number {
    const own = Math.round(heading / 10) % 36 || 36;
    return own > 18 ? (heading + 180) % 360 : heading;
}

export interface RunwayOptions {
    /**
     * The heading of one end of the runway, default 90. The runway is stored with its lower-numbered end first, so a
     * heading of 270 gives the designation 09-27 with a direction of 90.
     */
    heading?: number;
    /** Default 5000 */
    lengthFt?: number;
    /** Default Asphalt */
    surface?: RunwaySurfaceType;
}

export interface AirportOptions {
    elevationFt?: number;
    runwayHeading?: number;
    runwayLengthFt?: number;
    surface?: RunwaySurfaceType;
    name?: string;
    city?: string;
    /**
     * Zero or more runways. Absent: one runway from runwayHeading, runwayLengthFt and surface. An empty array is a
     * heliport (the nearest filters treat it specially, see MemoryFacilityClient).
     */
    runways?: RunwayOptions[];
    /** Default false */
    towered?: boolean;
    /** Default: HeliportOnly without runways, HardSurface with a hard runway, otherwise SoftSurface */
    airportClass?: AirportClass;
}

function runway(lat: number, lon: number, elevationFt: number, o: RunwayOptions): AirportRunway {
    const heading = o.heading ?? 90;
    return {
        latitude: lat, longitude: lon, elevation: UnitType.FOOT.convertTo(elevationFt, UnitType.METER),
        direction: lowerEndHeading(heading), designation: runwayDesignation(heading),
        length: UnitType.FOOT.convertTo(o.lengthFt ?? 5000, UnitType.METER), width: 30,
        surface: o.surface ?? RunwaySurfaceType.Asphalt, lighting: RunwayLightingType.Unknown,
        designatorCharPrimary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
        designatorCharSecondary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
        primaryBlastpadLength: 0, primaryOverrunLength: 0, secondaryOverrunLength: 0, secondaryBlastpadLength: 0,
        primaryILSFrequency: emptyIls(), secondaryILSFrequency: emptyIls(),
        primaryElevation: 0, primaryThresholdLength: 0, secondaryElevation: 0, secondaryThresholdLength: 0,
    } as AirportRunway;
}

function derivedClass(runways: AirportRunway[]): AirportClass {
    if (runways.length === 0) return AirportClass.HeliportOnly;
    return runways.some(r => RunwayUtils.getSurfaceCategory(r) === RunwaySurfaceCategory.Hard) ? AirportClass.HardSurface : AirportClass.SoftSurface;
}

export function airport(ident: string, lat: number, lon: number, opts: AirportOptions = {}): AirportFacility {
    const icaoStruct = ICAO.value('A', '', '', ident);
    const elevationFt = opts.elevationFt ?? 0;
    const runwayOptions = opts.runways ?? [{heading: opts.runwayHeading, lengthFt: opts.runwayLengthFt, surface: opts.surface}];
    const runways = runwayOptions.map(o => runway(lat, lon, elevationFt, o));
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: opts.name ?? `${ident} AIRPORT`, lat, lon,
        region: DEFAULT_REGION, city: opts.city ?? '', magvar: 0, airportPrivateType: AirportPrivateType.Public,
        fuel1: '', fuel2: '', bestApproach: '', radarCoverage: GpsBoolean.Unknown, airspaceType: 0,
        airportClass: opts.airportClass ?? derivedClass(runways),
        towered: opts.towered ?? false, frequencies: [], runways, departures: [], approaches: [], arrivals: [],
        altitude: UnitType.FOOT.convertTo(elevationFt, UnitType.METER),
        loadedDataFlags: AirportFacilityDataFlags.All, holdingPatterns: [], transitionAlt: 0, transitionLevel: 0, iata: '',
    } as unknown as AirportFacility;
}

export interface VorOptions {
    frequencyMHz?: number;
    /** As stored in the sim's VOR records; the instrument negates it (see Nav2Page) */
    magneticVariation?: number;
    region?: string;
    name?: string;
    type?: VorType;
    /** Default HighAlt */
    vorClass?: VorClass;
}

export function vor(ident: string, lat: number, lon: number, opts: VorOptions = {}): VorFacility {
    const region = opts.region ?? DEFAULT_REGION;
    const icaoStruct = ICAO.value('V', region, '', ident);
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: opts.name ?? ident, lat, lon, region, city: '',
        magvar: 0, freqMHz: opts.frequencyMHz ?? 114.3, freqBCD16: 0, magneticVariation: opts.magneticVariation ?? 0,
        type: opts.type ?? VorType.VORDME, vorClass: opts.vorClass ?? VorClass.HighAlt, navRange: 0, dme: null, ils: null,
        tacan: null, trueReferenced: false, alt: 0,
    } as unknown as VorFacility;
}

export function ndb(ident: string, lat: number, lon: number, opts: { frequencyKHz?: number; region?: string; name?: string } = {}): NdbFacility {
    const region = opts.region ?? DEFAULT_REGION;
    const icaoStruct = ICAO.value('N', region, '', ident);
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: opts.name ?? ident, lat, lon, region, city: '',
        magvar: 0, freqMHz: opts.frequencyKHz ?? 350, type: NdbType.H, range: 0, bfoRequired: false, alt: 0,
    } as unknown as NdbFacility;
}

export function intersection(ident: string, lat: number, lon: number, opts: { region?: string } = {}): IntersectionFacility {
    const region = opts.region ?? DEFAULT_REGION;
    const icaoStruct = ICAO.value('W', region, '', ident);
    // noinspection JSDeprecatedSymbols
    return {
        icao: ICAO.valueToStringV1(icaoStruct), icaoStruct, name: '', lat, lon, region, city: '', routes: [],
        nearestVorICAO: '', nearestVorICAOStruct: ICAO.emptyValue(), nearestVorType: VorType.Unknown,
        nearestVorFrequencyBCD16: 0, nearestVorFrequencyMHz: 0, nearestVorTrueRadial: 0, nearestVorMagneticRadial: 0,
        nearestVorDistance: 0, type: IntersectionType.Named,
    } as unknown as IntersectionFacility;
}
