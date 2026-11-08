import {EventBus, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {FailureChangedEvents, Failures} from "./Failures";
import {FailureKey} from "./FailureCatalog";
import {AntennaAttitude, LOCK_LOSS_SNR, MAX_SIGNAL_STEP_S} from "../GpsSignal";
import {
    dbToRatio,
    jammerEdgeNm,
    jammerPowerDb,
    levelDb,
    MAST_FT,
    METERS_PER_MS,
    radioHorizonNm,
    spooferEdgeNm,
    spooferPowerDb,
    transmitterSinAntennaElevation,
    transmitterGainDb,
    transmitterSinLocalElevation,
} from "../GpsTransmitter";

/** The closest a transmitter is placed on the ground */
export const GROUND_DISTANCE_MIN_NM = 2; //guess
/** The farthest a transmitter is placed on the ground, if the ground horizon is farther (maintainer: under 15 NM) */
export const GROUND_DISTANCE_MAX_NM = 15;
/**
 * In flight a transmitter is placed where its effect is just about to show (controller ruling H, 2026-11-07): between its
 * edge at the present height (a jammer's noise rise of 1 dB, a spoofer's fake SNR of ACQUIRE_SNR) and the distance where the
 * effect is this much stronger. By the effect, not by a share of the distance: in the diffraction band beyond the radio
 * horizon a tenth of the distance is tens of dB
 */
export const PLACE_JAMMER_RISE_DB = 3; //guess
export const PLACE_SPOOFER_SNR = 38; //guess
/**
 * A spoofer is left only once its fake signals are below the lock-loss level (controller ruling I, 2026-11-07): its leave
 * edge at the reference altitude is at this fake SNR, so that the lock rule loses the fake satellites before it is replaced.
 * A jammer's leave edge is its edge, the 1 dB rise
 */
export const SPOOFER_LEAVE_SNR = LOCK_LOSS_SNR - 5; //guess
/** In flight a transmitter is placed ahead on the track, within this many degrees either side */
export const PLACE_BEARING_SPREAD_DEG = 30; //guess
/**
 * A jammer's power is drawn so that it would take the weakest satellite (a noise rise of 7 dB) at this line-of-sight
 * distance in level flight at CALIBRATION_AGL_FT, up to JAMMER_FIRST_LOSS_MAX_NM. Beyond the radio horizon at that altitude
 * (about 242 NM at FL350) the first loss is limited by the horizon and the diffraction band instead: such a jammer takes its
 * first satellite near the horizon and its last much farther out than a weak one does, so it blacks out a wide area
 * (maintainer, final review 2026-11-08)
 */
export const JAMMER_FIRST_LOSS_MIN_NM = 100; //guess
export const JAMMER_FIRST_LOSS_MAX_NM = 600; //guess
/** A spoofer's power is drawn so that it would capture the receiver at this distance in line of sight, up to SPOOFER_CAPTURE_MAX_NM */
export const SPOOFER_CAPTURE_MIN_NM = 300; //guess
export const SPOOFER_CAPTURE_MAX_NM = 600; //guess
/** The false position is drawn this far from the spoofer, up to FALSE_DISTANCE_MAX_NM */
export const FALSE_DISTANCE_MIN_NM = 30; //guess
export const FALSE_DISTANCE_MAX_NM = 150; //guess
/** The radius around the drawn false position in which an airport is taken instead (maintainer, 2026-11-07) */
export const AIRPORT_SEARCH_RADIUS_NM = 30; //guess
/**
 * An airport search that has not answered after this much sim time is given up: the drawn point is taken, and a late answer
 * is ignored (final review, 2026-11-08). A search that never answers would otherwise leave the spoofer silent for good
 */
export const AIRPORT_SEARCH_TIMEOUT_S = 30; //guess
/** The spoofer's time shift in hours, either sign (crew reports) */
export const SHIFT_MIN_H = 2; //guess
export const SHIFT_MAX_H = 12; //guess
/** The reference altitude is at least this height above the ground */
export const REFERENCE_FLOOR_FT = 10000; //guess
/** The reference altitude is saved when it has grown by this much since the last save. Our own choice */
export const REF_SAVE_STEP_FT = 500;
/**
 * The edge at the reference altitude is solved again when the reference has grown by this much since the last solve, so that
 * the bisection does not run in every tick of a climb. About 0.2 NM of edge at 10,000 ft. Our own choice
 */
export const EDGE_SOLVE_STEP_FT = 100;
/** Below this ground speed there is no track, and a transmitter is placed at a random bearing (3-35) */
export const TRACK_MIN_SPEED_KT = 2;
/** The number of fake satellites a spoofer is placed for until the fake sky tells it */
export const DEFAULT_FAKE_COUNT = 8;

const FT_PER_NM = 1852 / 0.3048;
const METERS_PER_NM = 1852;
const MS_PER_HOUR = 3_600_000;

/** A transmitter on the ground: its place, its power and its reference altitude (spec, "Transmitters") */
export interface TransmitterSite {
    lat: number;
    lon: number;
    /** The level in dB over the receiver's thermal noise at 1 NM, before the antenna's gain */
    powerDb: number;
    /** The highest height above the ground seen since the generation, at least REFERENCE_FLOOR_FT */
    refAglFt: number;
}

/** A spoofer: a transmitter that simulates the sky of a receiver standing at the false position at the false time */
export interface SpooferSite extends TransmitterSite {
    falseLat: number;
    falseLon: number;
    falseAltFt: number;
    /** The false time minus the true time */
    shiftMs: number;
    /** The spoofer's clock offset in meters of range, common to every fake signal */
    clockM: number;
}

/** Finds the airport the false position snaps to (spec, "The fake signals"); null when none is within the radius */
export interface AirportFinder {
    find(lat: number, lon: number, radiusNm: number): Promise<{ lat: number; lon: number; elevationFt: number } | null>;
}

/** What the transmitters need of the aircraft each tick; one object owned by GPS, filled in place each tick */
export interface TransmitterInputs {
    /** The true position */
    lat: number;
    lon: number;
    aglFt: number;
    /** The ground elevation under the aircraft (PLANE ALTITUDE minus PLANE ALT ABOVE GROUND) */
    groundElevationFt: number;
    simTimeS: number;
    attitude: Readonly<AntennaAttitude>;
}

const JAMMER_KEYS: readonly string[] = ['lat', 'lon', 'powerDb', 'refAglFt'] satisfies (keyof TransmitterSite)[];
const SPOOFER_KEYS: readonly string[] = ['lat', 'lon', 'powerDb', 'refAglFt', 'falseLat', 'falseLon', 'falseAltFt', 'shiftMs', 'clockM'] satisfies (keyof SpooferSite)[];

/** One failure's transmitter: its site and the runtime state around it. The site object is reused for every generation */
class Slot<T extends TransmitterSite> {
    /** A place is known: loaded or generated */
    public has = false;
    /** The site is complete: always for a jammer, after the airport search for a spoofer */
    public resolved = false;
    /** Counts generations and clears, so that a late airport result of an older one is dropped */
    public generation = 0;
    public searchStarted = false;
    /** The sim time the airport search started, seconds */
    public searchStartS = 0;
    public lastSavedRefFt = 0;
    public ratio = 0;
    /** The slant range from the transmitter to the aircraft in meters, with the ratio; 0 without a level */
    public slantM = 0;

    /** The leave edge at the reference altitude, and what it was computed for */
    public edgeAtRefNm = 0;
    public edgeRefFt = NaN;
    /** A spoofer's fake count, taken at its generation or load: a later change of the fake sky never moves its edges */
    public fakeCount = DEFAULT_FAKE_COUNT;

    /** The spoofer's drawn false point and the ground elevation at its generation, for a search without a match */
    public drawnLat = 0;
    public drawnLon = 0;
    public drawnElevationFt = 0;

    /** @param keys The stored values, which are the site's fields */
    constructor(public readonly key: FailureKey, public readonly site: T, public readonly keys: readonly string[]) {
    }

    public clear(): void {
        this.generation++;
        this.has = false;
        this.resolved = false;
        this.searchStarted = false;
        this.ratio = 0;
        this.slantM = 0;
    }
}

/**
 * The ground transmitters of the jamming and the spoofing failures (#465): at most one jammer and one spoofer, each placed,
 * replaced and persisted by the spec's rules ("Transmitters", "Power", "Placement", "Persistence"), and their levels at the
 * aircraft as power ratios over the receiver's thermal noise. Their effect on the satellites belongs to the receiver.
 * Take-home mode has none (#460).
 */
export class Transmitters {
    private readonly jam = new Slot<TransmitterSite>('gpsJamming', {lat: 0, lon: 0, powerDb: 0, refAglFt: 0}, JAMMER_KEYS);
    private readonly spoof = new Slot<SpooferSite>('gpsSpoofing', {
        lat: 0, lon: 0, powerDb: 0, refAglFt: 0, falseLat: 0, falseLon: 0, falseAltFt: 0, shiftMs: 0, clockM: 0,
    }, SPOOFER_KEYS);

    private finder: AirportFinder | null = null;
    private fakeCount = DEFAULT_FAKE_COUNT;

    /** The previous tick's true position and time, for the track */
    private readonly previous = new GeoPoint(0, 0);
    private hasPrevious = false;
    private previousTimeS = 0;
    /** The track over the last step in degrees true, NaN without one */
    private trackDeg = NaN;

    /** The aircraft's position in this tick */
    private readonly here = new GeoPoint(0, 0);
    private readonly origin = new GeoPoint(0, 0);
    private readonly scratch = new GeoPoint(0, 0);

    constructor(bus: EventBus, private readonly failures: Failures, private readonly takeHomeMode: boolean, private readonly random: () => number = Math.random) {
        bus.getSubscriber<FailureChangedEvents>().on("failureChanged").handle(e => {
            //Active: the generation needs the inputs, so it waits for the next tick, which finds the stored text empty
            if (e.key === 'gpsJamming') {
                this.jam.clear();
            } else if (e.key === 'gpsSpoofing') {
                this.spoof.clear();
            }
        });
    }

    public setAirportFinder(finder: AirportFinder): void {
        this.finder = finder;
    }

    /** The jammer, null without the failure. The object is reused: copy it to keep it */
    public get jammer(): Readonly<TransmitterSite> | null {
        return this.isActive(this.jam) && this.jam.has ? this.jam.site : null;
    }

    /** The spoofer, null without the failure and while its airport search is pending. The object is reused: copy it to keep it */
    public get spoofer(): Readonly<SpooferSite> | null {
        return this.isActive(this.spoof) && this.spoof.has && this.spoof.resolved ? this.spoof.site : null;
    }

    /** The jammer's level at the aircraft as a ratio over the thermal noise, 0 without one */
    public get jammerRatio(): number {
        return this.jam.ratio;
    }

    /** The spoofer's total level at the aircraft as a ratio over the thermal noise, 0 without one or while it is pending */
    public get spooferRatio(): number {
        return this.spoof.ratio;
    }

    /** The slant range from the spoofer to the aircraft in meters, which its fake signals travel on top; 0 while spooferRatio is 0 */
    public get spooferSlantM(): number {
        return this.spoof.slantM;
    }

    /**
     * Whether a transmitter failure is in effect: only then do the transmitters need the heights of TransmitterInputs, which
     * GPS reads only for them (the tick cost rule, CLAUDE.md)
     */
    public get anyActive(): boolean {
        return this.isActive(this.jam) || this.isActive(this.spoof);
    }

    /** The number of fake satellites the spoofer's edge is computed for */
    public get spooferFakeCount(): number {
        return this.fakeCount;
    }

    /** Set by the fake receiver each tick with the fake sky's count */
    public setFakeCount(n: number): void {
        this.fakeCount = n;
    }

    /** Power change: the last position and time are forgotten, the sites are kept */
    public reset(): void {
        this.hasPrevious = false;
        this.trackDeg = NaN;
        this.jam.ratio = 0;
        this.spoof.ratio = 0;
        this.jam.slantM = 0;
        this.spoof.slantM = 0;
    }

    public tick(inputs: Readonly<TransmitterInputs>): void {
        this.updateTrack(inputs);
        this.here.set(inputs.lat, inputs.lon);
        this.tickSlot(this.jam, inputs);
        this.tickSlot(this.spoof, inputs);
    }

    /**
     * The levels outside the calculation tick, for the forced acquisition of an engine-running start: loads stored sites
     * that are not cached yet, but counts no time, draws nothing and saves nothing
     */
    public refresh(inputs: Readonly<TransmitterInputs>): void {
        this.here.set(inputs.lat, inputs.lon);
        this.refreshSlot(this.jam, inputs);
        this.refreshSlot(this.spoof, inputs);
    }

    private isActive(slot: Slot<TransmitterSite>): boolean {
        return !this.takeHomeMode && this.failures.isEffective(slot.key);
    }

    private isSpoofer(slot: Slot<TransmitterSite>): boolean {
        return slot === this.spoof;
    }

    /** The track from the previous tick's position; none below TRACK_MIN_SPEED_KT, at the first tick, a step back or a jump (MAX_SIGNAL_STEP_S) */
    private updateTrack(inputs: Readonly<TransmitterInputs>): void {
        this.trackDeg = NaN;
        if (this.hasPrevious) {
            const dt = inputs.simTimeS - this.previousTimeS;
            if (dt > 0 && dt <= MAX_SIGNAL_STEP_S) {
                const distanceNm = UnitType.GA_RADIAN.convertTo(this.previous.distance(inputs.lat, inputs.lon), UnitType.NMILE);
                if (distanceNm / dt * 3600 >= TRACK_MIN_SPEED_KT) {
                    this.trackDeg = this.previous.bearingTo(inputs.lat, inputs.lon);
                }
            }
        }
        this.previous.set(inputs.lat, inputs.lon);
        this.previousTimeS = inputs.simTimeS;
        this.hasPrevious = true;
    }

    private tickSlot(slot: Slot<TransmitterSite>, inputs: Readonly<TransmitterInputs>): void {
        if (!this.isActive(slot)) {
            if (slot.has || slot.ratio !== 0) {
                slot.clear();
            }
            return;
        }

        let generated = false;
        if (!slot.has && !this.load(slot)) {
            this.generate(slot, inputs);
            generated = true;
        }
        if (this.isSpoofer(slot) && !slot.resolved) {
            if (!slot.searchStarted) {
                this.startSearch(slot, inputs.simTimeS);
            } else if (inputs.simTimeS - slot.searchStartS >= AIRPORT_SEARCH_TIMEOUT_S) {
                //Given up: a new generation number drops the late answer, as it drops that of a replaced spoofer
                slot.generation++;
                this.resolveSpoofer(slot.generation, null);
            }
        }

        //The reference grows first: the present height is one seen since the generation
        if (inputs.aglFt > slot.site.refAglFt) {
            slot.site.refAglFt = inputs.aglFt;
        }
        //Leaving: beyond the leave edge at the reference altitude, a new one at once. One generation per tick at most
        if (!generated && this.horizontalNm(slot.site) > this.edgeAtRefNm(slot)) {
            this.generate(slot, inputs);
        }
        if (slot.resolved && slot.site.refAglFt - slot.lastSavedRefFt >= REF_SAVE_STEP_FT) {
            this.save(slot);
        }

        this.updateLevel(slot, inputs);
    }

    private refreshSlot(slot: Slot<TransmitterSite>, inputs: Readonly<TransmitterInputs>): void {
        if (!this.isActive(slot)) {
            slot.ratio = 0;
            slot.slantM = 0;
            return;
        }
        if (!slot.has) {
            this.load(slot);
        }
        this.updateLevel(slot, inputs);
    }

    /** Takes the stored values; false when they are missing or do not parse (a hand-edited profile) */
    private load(slot: Slot<TransmitterSite>): boolean {
        const values = this.failures.values(slot.key);
        const keys = slot.keys;
        for (let i = 0; i < keys.length; i++) {
            const v = values[keys[i]];
            if (typeof v !== 'number' || !isFinite(v)) {
                return false;
            }
        }
        const site = slot.site as unknown as Record<string, number>;
        for (let i = 0; i < keys.length; i++) {
            site[keys[i]] = values[keys[i]];
        }
        slot.site.refAglFt = Math.max(REFERENCE_FLOOR_FT, slot.site.refAglFt);
        slot.has = true;
        slot.resolved = true;
        slot.searchStarted = true;
        slot.lastSavedRefFt = slot.site.refAglFt;
        slot.edgeRefFt = NaN;
        slot.fakeCount = this.fakeCount;
        return true;
    }

    /** A new transmitter by the placement rules (spec, "Placement"); a jammer is saved at once, a spoofer once its search resolves */
    private generate(slot: Slot<TransmitterSite>, inputs: Readonly<TransmitterInputs>): void {
        slot.generation++;
        slot.edgeRefFt = NaN;
        slot.fakeCount = this.fakeCount;
        const site = slot.site;
        if (this.isSpoofer(slot)) {
            site.powerDb = spooferPowerDb(this.uniform(SPOOFER_CAPTURE_MIN_NM, SPOOFER_CAPTURE_MAX_NM));
        } else {
            site.powerDb = jammerPowerDb(this.uniform(JAMMER_FIRST_LOSS_MIN_NM, JAMMER_FIRST_LOSS_MAX_NM));
        }
        this.place(slot, inputs);
        site.refAglFt = Math.max(REFERENCE_FLOOR_FT, inputs.aglFt);
        slot.has = true;

        if (!this.isSpoofer(slot)) {
            slot.resolved = true;
            slot.searchStarted = true;
            this.save(slot);
            return;
        }

        const spoofer = this.spoof.site;
        const sign = this.random() < 0.5 ? -1 : 1;
        spoofer.shiftMs = sign * this.uniform(SHIFT_MIN_H, SHIFT_MAX_H) * MS_PER_HOUR;
        spoofer.clockM = this.uniform(-METERS_PER_MS / 2, METERS_PER_MS / 2);
        this.origin.set(site.lat, site.lon).offset(this.random() * 360,
            UnitType.NMILE.convertTo(this.uniform(FALSE_DISTANCE_MIN_NM, FALSE_DISTANCE_MAX_NM), UnitType.GA_RADIAN), this.scratch);
        slot.drawnLat = this.scratch.lat;
        slot.drawnLon = this.scratch.lon;
        slot.drawnElevationFt = inputs.groundElevationFt;
        slot.resolved = false;
        slot.searchStarted = false;
        this.startSearch(slot, inputs.simTimeS);
    }

    /**
     * On the ground: a random bearing, within the ground horizon and GROUND_DISTANCE_MAX_NM, so that it takes effect at
     * once. In flight: ahead on the track, between the edge at the present height and the distance of a slightly stronger
     * effect (spec, "Placement"; PLACE_JAMMER_RISE_DB, PLACE_SPOOFER_SNR)
     */
    private place(slot: Slot<TransmitterSite>, inputs: Readonly<TransmitterInputs>): void {
        let bearing: number;
        let distanceNm: number;
        if (inputs.attitude.onGround) {
            bearing = this.random() * 360;
            distanceNm = this.uniform(GROUND_DISTANCE_MIN_NM, Math.min(GROUND_DISTANCE_MAX_NM, radioHorizonNm(inputs.aglFt)));
        } else {
            bearing = isNaN(this.trackDeg) ? this.random() * 360 : this.trackDeg + this.uniform(-PLACE_BEARING_SPREAD_DEG, PLACE_BEARING_SPREAD_DEG);
            distanceNm = this.uniform(this.nearEdgeNm(slot, inputs.aglFt), this.edgeNm(slot, inputs.aglFt));
        }
        this.here.offset(bearing, UnitType.NMILE.convertTo(distanceNm, UnitType.GA_RADIAN), this.scratch);
        slot.site.lat = this.scratch.lat;
        slot.site.lon = this.scratch.lon;
    }

    /** @param simTimeS The sim time, seconds: the search is given up AIRPORT_SEARCH_TIMEOUT_S later */
    private startSearch(slot: Slot<TransmitterSite>, simTimeS: number): void {
        const finder = this.finder;
        if (finder === null) {
            return; //Pending until a finder is set
        }
        slot.searchStarted = true;
        slot.searchStartS = simTimeS;
        const generation = slot.generation;
        let search: Promise<{ lat: number; lon: number; elevationFt: number } | null>;
        try {
            search = finder.find(slot.drawnLat, slot.drawnLon, AIRPORT_SEARCH_RADIUS_NM);
        } catch (e) {
            search = Promise.resolve(null);
        }
        search.then(airport => this.resolveSpoofer(generation, airport), () => this.resolveSpoofer(generation, null));
    }

    /** The search's result: an airport's reference point and elevation, else the drawn point at the ground elevation of the generation */
    private resolveSpoofer(generation: number, airport: { lat: number; lon: number; elevationFt: number } | null): void {
        const slot = this.spoof;
        if (generation !== slot.generation || !slot.has || !this.isActive(slot)) {
            return; //Repaired or regenerated in the meantime
        }
        const site = slot.site;
        if (airport !== null) {
            site.falseLat = airport.lat;
            site.falseLon = airport.lon;
            site.falseAltFt = airport.elevationFt;
        } else {
            site.falseLat = slot.drawnLat;
            site.falseLon = slot.drawnLon;
            site.falseAltFt = slot.drawnElevationFt;
        }
        slot.resolved = true;
        this.save(slot);
    }

    private save(slot: Slot<TransmitterSite>): void {
        const values: Record<string, number> = {};
        const site = slot.site as unknown as Record<string, number>;
        for (let i = 0; i < slot.keys.length; i++) {
            values[slot.keys[i]] = site[slot.keys[i]];
        }
        slot.lastSavedRefFt = slot.site.refAglFt;
        this.failures.setValues(slot.key, values);
    }

    /**
     * The edge at a height above the ground in level flight (spec, "Placement"): a 1 dB rise for a jammer, fake SNR 35 for a
     * spoofer with the fake count taken at its generation or load
     */
    private edgeNm(slot: Slot<TransmitterSite>, aglFt: number): number {
        return this.isSpoofer(slot)
            ? spooferEdgeNm(slot.site.powerDb, Math.max(1, slot.fakeCount), aglFt)
            : jammerEdgeNm(slot.site.powerDb, aglFt);
    }

    /** The nearer end of the placement in flight: the distance of a slightly stronger effect than at the edge (PLACE_JAMMER_RISE_DB, PLACE_SPOOFER_SNR) */
    private nearEdgeNm(slot: Slot<TransmitterSite>, aglFt: number): number {
        return this.isSpoofer(slot)
            ? spooferEdgeNm(slot.site.powerDb, Math.max(1, slot.fakeCount), aglFt, PLACE_SPOOFER_SNR)
            : jammerEdgeNm(slot.site.powerDb, aglFt, PLACE_JAMMER_RISE_DB);
    }

    /**
     * The leave edge at a height: a jammer's edge, and for a spoofer the distance where its fake signals are below the
     * lock-loss level (SPOOFER_LEAVE_SNR)
     */
    private leaveEdgeNm(slot: Slot<TransmitterSite>, aglFt: number): number {
        return this.isSpoofer(slot)
            ? spooferEdgeNm(slot.site.powerDb, Math.max(1, slot.fakeCount), aglFt, SPOOFER_LEAVE_SNR)
            : jammerEdgeNm(slot.site.powerDb, aglFt);
    }

    /** The leave edge at the reference altitude, solved at a generation or load and again once the reference has grown by EDGE_SOLVE_STEP_FT */
    private edgeAtRefNm(slot: Slot<TransmitterSite>): number {
        if (!(slot.site.refAglFt - slot.edgeRefFt < EDGE_SOLVE_STEP_FT)) {
            slot.edgeAtRefNm = this.leaveEdgeNm(slot, slot.site.refAglFt);
            slot.edgeRefFt = slot.site.refAglFt;
        }
        return slot.edgeAtRefNm;
    }

    /** The horizontal distance from the aircraft (this.here) */
    private horizontalNm(site: Readonly<TransmitterSite>): number {
        return UnitType.GA_RADIAN.convertTo(this.here.distance(site.lat, site.lon), UnitType.NMILE);
    }

    /** The level at the aircraft over the slant range, with the antenna's gain toward the transmitter (spec, "Transmitters") */
    private updateLevel(slot: Slot<TransmitterSite>, inputs: Readonly<TransmitterInputs>): void {
        if (!slot.has || !slot.resolved) {
            slot.ratio = 0;
            slot.slantM = 0;
            return;
        }
        const site = slot.site;
        const horizontalNm = this.horizontalNm(site);
        const heightNm = (inputs.aglFt - MAST_FT) / FT_PER_NM;
        const slantNm = Math.sqrt(horizontalNm * horizontalNm + heightNm * heightNm);
        const bearing = this.here.bearingTo(site.lat, site.lon);
        const sinLocal = transmitterSinLocalElevation(horizontalNm, inputs.aglFt);
        const gainDb = transmitterGainDb(transmitterSinAntennaElevation(isFinite(bearing) ? bearing : 0, sinLocal, inputs.attitude));
        slot.ratio = dbToRatio(levelDb(site.powerDb, slantNm, inputs.aglFt, gainDb));
        slot.slantM = slantNm * METERS_PER_NM;
    }

    private uniform(min: number, max: number): number {
        return min + this.random() * (max - min);
    }
}
