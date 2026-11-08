import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EventBus, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {Failures} from '../../../kln90b/failures/Failures';
import {AirportFinder, SpooferSite, TransmitterInputs, Transmitters} from '../../../kln90b/failures/Transmitters';
import {
    dbToRatio,
    fakeSnr,
    jammerEdgeNm,
    jammerPowerDb,
    levelDb,
    noiseRiseDb,
    spooferEdgeNm,
    spooferPowerDb,
} from '../../../kln90b/GpsTransmitter';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';
import {mulberry32} from '../../harness/sim/random';
import {abeamElevationDeg, gainAtElevationDb, levelGainDb} from '../../harness/transmitterGain';

// The edge solves are counted (the tick cost rule of CLAUDE.md); they compute as they do unmocked
vi.mock('../../../kln90b/GpsTransmitter', async importOriginal => {
    const actual = await importOriginal<typeof import('../../../kln90b/GpsTransmitter')>();
    return {...actual, jammerEdgeNm: vi.fn(actual.jammerEdgeNm), spooferEdgeNm: vi.fn(actual.spooferEdgeNm)};
});

/**
 * #465: the transmitter service, the spec docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md,
 * "Transmitters", "Power", "The fake signals", "Placement" and "Persistence". The expected distances are measured here with
 * the SDK's GeoPoint and the edges with the physics of GpsTransmitter.ts, never read back from the service.
 */

function plane(takeHomeMode: boolean): KLN90PlaneSettings {
    return {
        takeHomeMode, basePath: '', debugMode: false, vfrOnly: false,
        input: {
            altimeterInterfaced: true, obsSource: 1, headingInput: false, headingSimVar: '', electricitySimVar: '',
            airdata: {isInterfaced: false, baroSource: 0, interface: DataInterface.RS232},
            obsInterface: ObsInterface.ANALOG, headingInterface: DataInterface.ARINC429,
            fuelComputer: {isInterfaced: false} as KLN90PlaneSettings['input']['fuelComputer'],
            externalSwitches: {legObsSwitchInstalled: false, appArmSwitchInstalled: false},
        },
        output: {
            obsTarget: 0, altitudeAlertEnabled: false, writeGPSSimVars: true, rmiInterface: RmiInterface.OBI, rmiInstalled: false,
            dataInterface: DataInterface.ARINC429,
            externalAnnunciators: {msgInstalled: false, wptInstalled: false, armInstalled: false, actvInstalled: false},
        },
    };
}

interface LatLon {
    lat: number;
    lon: number;
}

const HOME: LatLon = {lat: 47, lon: 8};
/** A spoofer's leave edge: its fake SNR at the lock-loss level (30) less 5 (controller ruling I) */
const LEAVE_SNR = 25;

/** A finder that answers what the test says, and records what it was asked */
class FakeFinder implements AirportFinder {
    public readonly calls: { lat: number, lon: number, radiusNm: number }[] = [];
    public readonly pending: ((r: { lat: number, lon: number, elevationFt: number } | null) => void)[] = [];

    /** @param answer The answer at once; undefined: the promise waits for resolve() */
    constructor(private readonly answer?: { lat: number, lon: number, elevationFt: number } | null) {
    }

    public find(lat: number, lon: number, radiusNm: number): Promise<{ lat: number, lon: number, elevationFt: number } | null> {
        this.calls.push({lat, lon, radiusNm});
        if (this.answer !== undefined) {
            return Promise.resolve(this.answer);
        }
        return new Promise(resolve => this.pending.push(resolve));
    }
}

/** Lets the promise callbacks of an airport search run */
async function flush(): Promise<void> {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

const point = new GeoPoint(0, 0);

function distanceNm(a: LatLon, b: LatLon): number {
    return UnitType.GA_RADIAN.convertTo(point.set(a.lat, a.lon).distance(b.lat, b.lon), UnitType.NMILE);
}

function bearingDeg(from: LatLon, to: LatLon): number {
    return point.set(from.lat, from.lon).bearingTo(to.lat, to.lon);
}

/** The point at a bearing and distance from another */
function offset(from: LatLon, bearing: number, nm: number): LatLon {
    const p = new GeoPoint(from.lat, from.lon).offset(bearing, UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN));
    return {lat: p.lat, lon: p.lon};
}

/** The signed difference a - b of two bearings, in -180 to 180 */
function bearingDiff(a: number, b: number): number {
    return ((a - b) % 360 + 540) % 360 - 180;
}

function inputs(at: LatLon, aglFt: number, simTimeS: number, onGround = false, groundElevationFt = 0): TransmitterInputs {
    return {
        lat: at.lat, lon: at.lon, aglFt, groundElevationFt, simTimeS,
        attitude: {headingTrueDeg: 0, pitchUpDeg: 0, bankRightDeg: 0, onGround},
    };
}

let settings: ReturnType<typeof KLN90BFailureSettings.getManager>;
let failures: Failures;
let tx: Transmitters;
let draws: number;

function build(takeHome = false, random: () => number = mulberry32(1)) {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    const bus = new EventBus();
    settings = KLN90BFailureSettings.getManager(bus);
    failures = new Failures(bus, settings, plane(takeHome));
    draws = 0;
    tx = new Transmitters(bus, failures, takeHome, () => {
        draws++;
        return random();
    });
}

function stored(key: 'gpsJamming' | 'gpsSpoofing'): Record<string, number> {
    return JSON.parse(settings.getSetting(`failure_${key}`).get());
}

function countWrites(): { count: number } {
    const writes = {count: 0};
    const original = failures.setValues.bind(failures);
    failures.setValues = (key, values) => {
        writes.count++;
        original(key, values);
    };
    return writes;
}

/**
 * One tick at `from`, the failure, then one tick after flying `seconds` on a track: the transmitter is generated in the
 * second tick, with the track of that step
 * @returns the aircraft's position at the generation
 */
function generateAfterStep(key: 'gpsJamming' | 'gpsSpoofing', from: LatLon, trackDeg: number, speedKt: number, seconds: number, aglFt: number): LatLon {
    tx.tick(inputs(from, aglFt, 1000));
    failures.fail(key);
    const to = offset(from, trackDeg, speedKt * seconds / 3600);
    tx.tick(inputs(to, aglFt, 1000 + seconds));
    return to;
}

beforeEach(() => {
    build();
});

describe('Transmitters: the jammer placement (#465)', () => {
    it('on the ground the jammer is placed 2 to 12.3 NM away (within the ground horizon) and takes effect at once', () => {
        const distances: number[] = [];
        for (let seed = 1; seed <= 100; seed++) {
            build(false, mulberry32(seed));
            failures.fail('gpsJamming');
            tx.tick(inputs(HOME, 0, 1000, true));
            distances.push(distanceNm(HOME, tx.jammer!));
            // At most 12.3 NM, the power for a first loss at 100 NM or more, the floor of the antenna: a rise of 24 dB or more
            expect(noiseRiseDb(tx.jammerRatio, 0)).toBeGreaterThan(20);
        }
        expect(Math.min(...distances)).toBeGreaterThanOrEqual(2 - 1e-9);
        expect(Math.max(...distances)).toBeLessThanOrEqual(12.3 + 1e-9);
        // Drawn over the range, not fixed at one end
        expect(Math.min(...distances)).toBeLessThan(3);
        expect(Math.max(...distances)).toBeGreaterThan(11.3);
    });

    it('on the ground at 100 ft above the ground the placement stops at 15 NM, not at the 24.6 NM horizon', () => {
        const distances: number[] = [];
        for (let seed = 1; seed <= 100; seed++) {
            build(false, mulberry32(seed));
            failures.fail('gpsJamming');
            tx.tick(inputs(HOME, 100, 1000, true));
            distances.push(distanceNm(HOME, tx.jammer!));
        }
        expect(Math.min(...distances)).toBeGreaterThanOrEqual(2 - 1e-9);
        expect(Math.max(...distances)).toBeLessThanOrEqual(15 + 1e-9);
        expect(Math.max(...distances)).toBeGreaterThan(14);
    });

    // Controller ruling H: placed by the effect, where it is just about to show. The rise at the placed distance is computed
    // here from the level functions, in level flight over the horizontal distance, as the edges are, with the gain at the
    // depression there computed by the test's harness
    it.each([5000, 10000, 35000])('in flight at %d ft the jammer is placed ahead within ±30 degrees where its rise is 1 to 3 dB', aglFt => {
        const offsets: number[] = [];
        const rises: number[] = [];
        for (let seed = 1; seed <= 100; seed++) {
            build(false, mulberry32(seed));
            const at = generateAfterStep('gpsJamming', HOME, 90, 250, 1, aglFt);
            const site = tx.jammer!;
            offsets.push(bearingDiff(bearingDeg(at, site), 90));
            const nm = distanceNm(at, site);
            rises.push(noiseRiseDb(dbToRatio(levelDb(site.powerDb, nm, aglFt, levelGainDb(nm, aglFt))), 0));
            // The power for a first loss at 100 to 600 NM
            expect(site.powerDb).toBeGreaterThanOrEqual(jammerPowerDb(100) - 1e-9);
            expect(site.powerDb).toBeLessThanOrEqual(jammerPowerDb(600) + 1e-9);
            expect(site.refAglFt).toBe(Math.max(10000, aglFt));
        }
        expect(Math.min(...offsets)).toBeGreaterThanOrEqual(-30 - 1e-6);
        expect(Math.max(...offsets)).toBeLessThanOrEqual(30 + 1e-6);
        expect(Math.min(...offsets)).toBeLessThan(-25);
        expect(Math.max(...offsets)).toBeGreaterThan(25);
        expect(Math.min(...rises)).toBeGreaterThanOrEqual(1 - 1e-3);
        expect(Math.max(...rises)).toBeLessThanOrEqual(3 + 1e-3);
        // Drawn over the band, not fixed at one end
        expect(Math.min(...rises)).toBeLessThan(1.3);
        expect(Math.max(...rises)).toBeGreaterThan(2.5);
    });

    it('a prop at 5,000 ft is placed by its present horizon, not by the reference altitude', () => {
        for (let seed = 1; seed <= 20; seed++) {
            build(false, mulberry32(seed));
            const at = generateAfterStep('gpsJamming', HOME, 90, 120, 1, 5000);
            const site = tx.jammer!;
            const d = distanceNm(at, site);
            expect(d).toBeLessThanOrEqual(jammerEdgeNm(site.powerDb, 5000) + 1e-6);
            // Placed by the reference altitude of 10,000 ft, it would be between the distance of a 3 dB rise there and its edge
            // there (controller ruling H), beyond the 5,000 ft horizon
            expect(d).toBeLessThan(jammerEdgeNm(site.powerDb, 10000, 3));
            expect(jammerEdgeNm(site.powerDb, 10000, 3)).toBeGreaterThan(jammerEdgeNm(site.powerDb, 5000) + 10); // Precondition
        }
    });

    // Controller ruling H: the fake SNR at the placed distance, for the fake count 8 (the default before a fake sky is known),
    // computed here from the level functions
    it.each([10000, 35000])('in flight at %d ft the spoofer is placed ahead where its fake SNR is 35 to 38, with the power for a capture at 300 to 600 NM', async aglFt => {
        const snrs: number[] = [];
        for (let seed = 1; seed <= 50; seed++) {
            build(false, mulberry32(seed));
            tx.setAirportFinder(new FakeFinder(null));
            const at = generateAfterStep('gpsSpoofing', HOME, 90, 450, 1, aglFt);
            await flush();
            const p: Readonly<SpooferSite> = tx.spoofer!;
            expect(Math.abs(bearingDiff(bearingDeg(at, p), 90))).toBeLessThanOrEqual(30 + 1e-6);
            const nm = distanceNm(at, p);
            snrs.push(fakeSnr(dbToRatio(levelDb(p.powerDb, nm, aglFt, levelGainDb(nm, aglFt))) / 8, 8, 0));
            expect(p.powerDb).toBeGreaterThanOrEqual(spooferPowerDb(300) - 1e-9);
            expect(p.powerDb).toBeLessThanOrEqual(spooferPowerDb(600) + 1e-9);
        }
        expect(Math.min(...snrs)).toBeGreaterThanOrEqual(35 - 1e-3);
        expect(Math.max(...snrs)).toBeLessThanOrEqual(38 + 1e-3);
        expect(Math.min(...snrs)).toBeLessThan(35.5);
        expect(Math.max(...snrs)).toBeGreaterThan(37.5);
    });
});

// Maintainer, final review (2026-11-08): the first-loss distance of a jammer's power is drawn uniformly from 100 to 600 NM,
// so that the strong jammers beyond the 242 NM horizon of FL350 black out a wide area. The draw is the jammer's first
// random number: a random source that always returns the same value puts it at that share of the range
describe('Transmitters: the jammer power draw (#465)', () => {
    it.each([[0, 100], [0.5, 350], [0.999999, 600]])('a random number of %s gives the power of a first loss at %s NM', (r, firstLossNm) => {
        build(false, () => r);
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 0, 1000, true));
        expect(tx.jammer!.powerDb).toBeCloseTo(jammerPowerDb(firstLossNm), 4);
    });

    // A jammer of the strongest draw is placed and left in the diffraction band beyond the radio horizon of FL350,
    // 1.23 × (sqrt(100) + sqrt(35,000)) = 242.4 NM. The distances are derived here by hand: the power from the calibration
    // (a 7 dB rise at 600 NM in line of sight, the test harness's gain), the level in level flight over the horizontal
    // distance with that gain, less 2 dB a NM beyond the horizon, stepped down to the rise of 1 dB (the edge) or 3 dB (the
    // near end of the placement, controller ruling H). The random source draws the power (0.999999: 600 NM), the bearing
    // (0.5: on the track) and the distance in the placement band (0 or 0.999999: its near or far end)
    describe('the strongest draw at FL350', () => {
        const horizonNm = 1.23 * (Math.sqrt(100) + Math.sqrt(35000));
        const powerDb = 10 * Math.log10(Math.pow(10, 0.7) - 1) + 20 * Math.log10(600) - levelGainDb(600, 35000);
        const handRiseDb = (nm: number) => noiseRiseDb(dbToRatio(powerDb - 20 * Math.log10(nm) + levelGainDb(nm, 35000) - 2 * Math.max(0, nm - horizonNm)), 0);
        const handEdgeNm = (riseDb: number) => {
            let nm = 300;
            while (handRiseDb(nm) < riseDb) {
                nm -= 0.001;
            }
            return nm;
        };
        const sequence = (values: number[]) => {
            let i = 0;
            return () => values[Math.min(i++, values.length - 1)];
        };

        it('the hand distances lie a few NM beyond the horizon', () => {
            expect(handEdgeNm(1)).toBeGreaterThan(horizonNm + 5);
            expect(handEdgeNm(1)).toBeLessThan(horizonNm + 15);
            expect(handEdgeNm(3)).toBeGreaterThan(horizonNm + 3);
            expect(handEdgeNm(1) - handEdgeNm(3)).toBeGreaterThan(2);
        });

        it.each([[0, 3], [0.999999, 1]])('a distance draw of %s places it where the rise is %s dB', (r, riseDb) => {
            build(false, sequence([0.999999, 0.5, r]));
            const at = generateAfterStep('gpsJamming', HOME, 90, 450, 1, 35000);
            expect(draws).toBe(3); // Precondition: the power, the bearing and the distance
            expect(tx.jammer!.powerDb).toBeCloseTo(powerDb, 3);
            expect(Math.abs(bearingDiff(bearingDeg(at, tx.jammer!), 90))).toBeLessThan(0.01);
            expect(distanceNm(at, tx.jammer!)).toBeCloseTo(handEdgeNm(riseDb), 1);
        });

        it('it is left just beyond the edge, not before', () => {
            build(false, sequence([0.999999, 0.5, 0, 0.5, 0.5, 0.5]));
            generateAfterStep('gpsJamming', HOME, 90, 450, 1, 35000);
            const site = {...tx.jammer!};
            const edgeNm = handEdgeNm(1);
            // Due west of the jammer, on the parallel through it: the horizontal distance to the site is as asked
            const away = (nm: number) => offset(site, 270, nm);
            tx.tick(inputs(away(edgeNm - 0.1), 35000, 1002));
            expect(tx.jammer).toEqual(site);
            tx.tick(inputs(away(edgeNm + 0.1), 35000, 1003));
            expect(tx.jammer!.lat).not.toBe(site.lat);
        });
    });
});

describe('Transmitters: the track for the placement (#465)', () => {
    /** The bearings from the aircraft of 100 jammers generated after `setup`, relative to the 090 the aircraft flew */
    function relativeBearings(setup: () => LatLon): number[] {
        const result: number[] = [];
        for (let seed = 1; seed <= 100; seed++) {
            build(false, mulberry32(seed));
            const at = setup();
            result.push(bearingDiff(bearingDeg(at, tx.jammer!), 90));
        }
        return result;
    }

    function quadrants(bearings: number[]): number[] {
        const q = [0, 0, 0, 0];
        for (const b of bearings) {
            q[Math.floor((b + 180) / 90) % 4]++;
        }
        return q;
    }

    const CASES: [string, () => LatLon][] = [
        ['below 2 kt (1.9 kt)', () => generateAfterStep('gpsJamming', HOME, 90, 1.9, 1, 5000)],
        ['without a previous position (the first tick)', () => {
            const at = offset(HOME, 90, 250 / 3600);
            failures.fail('gpsJamming');
            tx.tick(inputs(at, 5000, 1001));
            return at;
        }],
        ['after a reset', () => {
            tx.tick(inputs(HOME, 5000, 1000));
            tx.reset();
            failures.fail('gpsJamming');
            const at = offset(HOME, 90, 250 / 3600);
            tx.tick(inputs(at, 5000, 1001));
            return at;
        }],
        ['after a step back in time', () => {
            tx.tick(inputs(HOME, 5000, 1000));
            failures.fail('gpsJamming');
            const at = offset(HOME, 90, 250 / 3600);
            tx.tick(inputs(at, 5000, 999));
            return at;
        }],
        ['after a step of 61 s', () => generateAfterStep('gpsJamming', HOME, 90, 250, 61, 5000)],
    ];

    it.each(CASES)('%s the bearing is random', (_name, setup) => {
        const q = quadrants(relativeBearings(setup));
        expect(q.filter(n => n >= 10)).toHaveLength(4);
    });

    it.each([['2.1 kt', 2.1, 1], ['a step of 60 s', 250, 60]])('with %s the jammer is placed ahead', (_name, speedKt, seconds) => {
        const bearings = relativeBearings(() => generateAfterStep('gpsJamming', HOME, 90, speedKt, seconds, 5000));
        expect(bearings.filter(b => Math.abs(b) > 30 + 1e-6)).toEqual([]);
    });
});

describe('Transmitters: leaving and the reference altitude (#465)', () => {
    it('a descent below the horizon does not generate a new jammer; it comes back on the climb', () => {
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 20000, 1000));
        const site = {...tx.jammer!};
        const rise = noiseRiseDb(tx.jammerRatio, 0);
        expect(site.refAglFt).toBe(20000);
        expect(rise).toBeGreaterThan(0.9); // Precondition: placed just inside its edge at 20,000 ft, a rise of about 1 dB

        let t = 1001;
        for (let agl = 19000; agl >= 1000; agl -= 1000) {
            tx.tick(inputs(HOME, agl, t++));
            expect(tx.jammer).toEqual(site);
        }
        // About 190 NM away, 140 NM beyond the 1,000 ft horizon
        expect(noiseRiseDb(tx.jammerRatio, 0)).toBeLessThan(0.01);

        for (let agl = 2000; agl <= 20000; agl += 1000) {
            tx.tick(inputs(HOME, agl, t++));
            expect(tx.jammer).toEqual(site);
        }
        expect(noiseRiseDb(tx.jammerRatio, 0)).toBeCloseTo(rise, 9);
    });

    it('leaving by the reference altitude generates a new one ahead, once', () => {
        let at = generateAfterStep('gpsJamming', {lat: 47, lon: 0}, 90, 600, 10, 10000);
        let t = 1010;
        const first = {...tx.jammer!};
        const edge = jammerEdgeNm(first.powerDb, 10000);
        const writes = countWrites();
        let replacedAt = -1;
        let previous = at;
        for (let step = 1; step <= 300; step++) {
            previous = at;
            at = offset(at, 90, 600 * 10 / 3600);
            t += 10;
            tx.tick(inputs(at, 10000, t));
            if (tx.jammer!.lat !== first.lat || tx.jammer!.lon !== first.lon) {
                replacedAt = step;
                break;
            }
        }
        expect(replacedAt).toBeGreaterThan(0);
        // Replaced at the first tick beyond the edge at 10,000 ft, behind the aircraft
        expect(distanceNm(at, first)).toBeGreaterThan(edge);
        expect(distanceNm(previous, first)).toBeLessThanOrEqual(edge);
        expect(Math.abs(bearingDiff(bearingDeg(at, first), 270))).toBeLessThan(90);
        const second = {...tx.jammer!};
        expect(Math.abs(bearingDiff(bearingDeg(at, second), 90))).toBeLessThanOrEqual(30 + 1e-6);
        expect(stored('gpsJamming')).toEqual(second);
        expect(writes.count).toBe(1);

        for (let step = 1; step <= 100; step++) {
            at = offset(at, 90, 600 * 10 / 3600);
            t += 10;
            tx.tick(inputs(at, 10000, t));
            expect(tx.jammer).toEqual(second);
        }
        expect(writes.count).toBe(1);
    });

    // Review Focus 1: the map's relocation moves the aircraft hundreds of NM between two ticks
    it.each([1, 120])('a teleport of 500 NM replaces the transmitter exactly once and does not throw (a step of %d s)', seconds => {
        const at = generateAfterStep('gpsJamming', HOME, 90, 300, 1, 10000);
        const first = {...tx.jammer!};
        const writes = countWrites();
        const there = offset(at, 0, 500);
        let t = 1001 + seconds;
        expect(() => tx.tick(inputs(there, 10000, t))).not.toThrow();
        const second = {...tx.jammer!};
        expect(second).not.toEqual(first);
        expect(distanceNm(there, second)).toBeLessThanOrEqual(jammerEdgeNm(second.powerDb, 10000) + 1e-6);
        expect(writes.count).toBe(1);

        for (let i = 0; i < 30; i++) {
            expect(() => tx.tick(inputs(there, 10000, ++t))).not.toThrow();
            expect(tx.jammer).toEqual(second);
        }
        expect(writes.count).toBe(1);
    });

    it('the leave edge is solved again as the reference grows: a site beyond the edge at 10,000 ft is kept after a climb to 35,000 ft', () => {
        const values = {...offset(HOME, 90, 200), powerDb: jammerPowerDb(150), refAglFt: 10000};
        settings.getSetting('failure_gpsJamming').set(JSON.stringify(values));
        expect(jammerEdgeNm(values.powerDb, 10000)).toBeLessThan(200); // Preconditions
        expect(jammerEdgeNm(values.powerDb, 35000)).toBeGreaterThan(200);
        // 100 NM from the site: the edge at 10,000 ft is solved and the site kept
        tx.tick(inputs(offset(values, 270, 100), 10000, 1000));
        expect(tx.jammer).toEqual(values);
        tx.tick(inputs(HOME, 35000, 1001));
        expect(tx.jammer).toEqual({...values, refAglFt: 35000});
    });

    // The bisection stays out of most ticks of a climb (CLAUDE.md, tick cost)
    it('the leave edge is solved again only once the reference has grown by 100 ft', () => {
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 10000, 999)); // The generation, placed by the edge at the present height
        tx.tick(inputs(HOME, 10000, 1000)); // The first leave check solves the edge at the reference
        const solves = () => vi.mocked(jammerEdgeNm).mock.calls.length;
        const before = solves();
        tx.tick(inputs(HOME, 10099, 1001));
        expect(solves()).toBe(before);
        tx.tick(inputs(HOME, 10100, 1002));
        expect(solves()).toBe(before + 1);
        expect(vi.mocked(jammerEdgeNm).mock.calls[before][1]).toBe(10100);
        tx.tick(inputs(HOME, 10199, 1003));
        tx.tick(inputs(HOME, 10150, 1004));
        expect(solves()).toBe(before + 1);
        tx.tick(inputs(HOME, 10200, 1005));
        expect(solves()).toBe(before + 2);
    });

    // Controller ruling I: a spoofer is left only once its fake signals are below the lock-loss level (LOCK_LOSS_SNR 30 less
    // 5): between the acquisition edge (fake SNR 35) and that one it is kept, beyond it replaced
    it('a spoofer is kept beyond its acquisition edge and replaced only beyond fake SNR 25', () => {
        const powerDb = spooferPowerDb(400);
        const acquire = spooferEdgeNm(powerDb, 8, 10000);
        const leave = spooferEdgeNm(powerDb, 8, 10000, LEAVE_SNR);
        expect(leave).toBeGreaterThan(acquire + 3); // Precondition: 10 dB of fake SNR, several NM of the diffraction band
        const values = {
            ...offset(HOME, 90, 50), powerDb, refAglFt: 10000,
            falseLat: 46, falseLon: 7, falseAltFt: 1400, shiftMs: -3.6e7, clockM: 1000,
        };
        settings.getSetting('failure_gpsSpoofing').set(JSON.stringify(values));
        tx.tick(inputs(HOME, 10000, 1000));
        expect(tx.spoofer).toEqual(values); // Precondition: loaded
        const site = {lat: values.lat, lon: values.lon};
        let t = 1001;
        // Kept just beyond the acquisition edge, and just inside the leave edge
        for (const nm of [acquire + 0.5, (acquire + leave) / 2, leave - 0.1]) {
            tx.tick(inputs(offset(site, 270, nm), 10000, t++));
            expect(tx.spoofer).toEqual(values);
        }
        tx.tick(inputs(offset(site, 270, leave + 0.1), 10000, t++));
        expect(tx.spoofer).toBeNull(); // Replaced: the new one's airport search is pending
    });

    // Controller ruling: a spoofer's edges use the fake count taken at its generation or load, so a change of the fake sky
    // never replaces a spoofer the aircraft has not left
    it('a spoofer keeps the fake count of its load: a larger count later does not replace it', async () => {
        const powerDb = spooferPowerDb(400);
        const edge8 = spooferEdgeNm(powerDb, 8, 10000, LEAVE_SNR);
        const edge30 = spooferEdgeNm(powerDb, 30, 10000, LEAVE_SNR);
        expect(edge30).toBeLessThan(edge8 - 1); // Precondition: more fake signals jam each other, a shorter edge
        const values = {
            ...offset(HOME, 90, (edge8 + edge30) / 2), powerDb, refAglFt: 10000,
            falseLat: 46, falseLon: 7, falseAltFt: 1400, shiftMs: -3.6e7, clockM: 1000,
        };
        settings.getSetting('failure_gpsSpoofing').set(JSON.stringify(values));
        tx.tick(inputs(HOME, 10000, 1000));
        expect(tx.spoofer).toEqual(values);
        tx.setFakeCount(30);
        tx.tick(inputs(HOME, 10000, 1001));
        tx.tick(inputs(HOME, 10100, 1002)); // The edge solved again
        expect(tx.spoofer).toEqual({...values, refAglFt: 10100});
    });

    it('a spoofer takes the fake count at its load: loaded with 1, a site beyond the edge for 8 is kept, also after a later count of 30', () => {
        const powerDb = spooferPowerDb(400);
        const edge1 = spooferEdgeNm(powerDb, 1, 10000, LEAVE_SNR);
        const edge8 = spooferEdgeNm(powerDb, 8, 10000, LEAVE_SNR);
        expect(edge1).toBeGreaterThan(edge8 + 1); // Precondition: one fake signal is not jammed by others, a longer edge
        const values = {
            ...offset(HOME, 90, (edge1 + edge8) / 2), powerDb, refAglFt: 10000,
            falseLat: 46, falseLon: 7, falseAltFt: 1400, shiftMs: -3.6e7, clockM: 1000,
        };
        settings.getSetting('failure_gpsSpoofing').set(JSON.stringify(values));
        tx.setFakeCount(1);
        tx.tick(inputs(HOME, 10000, 1000));
        expect(tx.spoofer).toEqual(values);
        tx.setFakeCount(30);
        tx.tick(inputs(HOME, 10100, 1001)); // The edge solved again
        expect(tx.spoofer).toEqual({...values, refAglFt: 10100});
    });

    it('a new spoofer takes the fake count of its generation', async () => {
        tx.setAirportFinder(new FakeFinder(null));
        tx.setFakeCount(30);
        const calls = vi.mocked(spooferEdgeNm).mock.calls;
        const before = calls.length;
        generateAfterStep('gpsSpoofing', HOME, 90, 450, 1, 10000);
        expect(calls.length).toBeGreaterThan(before);
        expect(calls.slice(before).map(c => c[1])).toEqual(calls.slice(before).map(() => 30));
    });

    it('the reference altitude grows and is saved per 500 ft', () => {
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 5000, 1000));
        expect(stored('gpsJamming').refAglFt).toBe(10000); // The floor
        const writes = countWrites();
        let t = 1001;
        for (const agl of [7000, 9900, 10000, 10200, 10499]) {
            tx.tick(inputs(HOME, agl, t++));
        }
        expect(writes.count).toBe(0);
        expect(tx.jammer!.refAglFt).toBe(10499);
        tx.tick(inputs(HOME, 10500, t++));
        expect(writes.count).toBe(1);
        expect(stored('gpsJamming').refAglFt).toBe(10500);
        tx.tick(inputs(HOME, 10900, t++));
        expect(writes.count).toBe(1);
        expect(tx.jammer!.refAglFt).toBe(10900);
        tx.tick(inputs(HOME, 11000, t++));
        expect(writes.count).toBe(2);
        expect(stored('gpsJamming').refAglFt).toBe(11000);
        tx.tick(inputs(HOME, 9000, t++));
        expect(writes.count).toBe(2);
        expect(tx.jammer!.refAglFt).toBe(11000);
    });
});

describe('Transmitters: persistence (#465)', () => {
    function storeJammer(at: LatLon, bearing: number, nm: number, refAglFt = 10000): Record<string, number> {
        const p = offset(at, bearing, nm);
        const values = {lat: p.lat, lon: p.lon, powerDb: jammerPowerDb(150), refAglFt};
        settings.getSetting('failure_gpsJamming').set(JSON.stringify(values));
        return values;
    }

    it('the stored site is loaded; one beyond its edge at a session start is replaced', () => {
        const values = storeJammer(HOME, 90, 50);
        const writes = countWrites();
        tx.tick(inputs(HOME, 10000, 1000));
        expect(tx.jammer).toEqual(values);
        expect(writes.count).toBe(0);
        expect(draws).toBe(0);
        tx.tick(inputs(HOME, 10000, 1001));
        expect(tx.jammer).toEqual(values);

        build();
        const far = storeJammer(HOME, 90, 500);
        tx.tick(inputs(HOME, 10000, 1000));
        const replaced = {...tx.jammer!};
        expect(replaced).not.toEqual(far);
        expect(stored('gpsJamming')).toEqual(replaced);
        expect(distanceNm(HOME, replaced)).toBeLessThanOrEqual(jammerEdgeNm(replaced.powerDb, 10000) + 1e-6);
    });

    it('a stored site loaded at a higher altitude than its reference keeps it, as the reference grows first', () => {
        // 200 NM: beyond the edge at 10,000 ft (about 141 NM for this power), within the edge at 35,000 ft
        const values = storeJammer(HOME, 90, 200);
        expect(jammerEdgeNm(values.powerDb, 10000)).toBeLessThan(200); // Preconditions
        expect(jammerEdgeNm(values.powerDb, 35000)).toBeGreaterThan(200);
        tx.tick(inputs(HOME, 35000, 1000));
        expect(tx.jammer).toEqual({...values, refAglFt: 35000});
        expect(stored('gpsJamming').refAglFt).toBe(35000);
    });

    it('a stored reference below the floor is taken as 10,000 ft', () => {
        // 120 NM: beyond the edge at 5,000 ft (about 104 NM for this power), within the edge at 10,000 ft
        const values = storeJammer(HOME, 90, 120, 5000);
        expect(jammerEdgeNm(values.powerDb, 5000)).toBeLessThan(120); // Preconditions
        expect(jammerEdgeNm(values.powerDb, 10000)).toBeGreaterThan(120);
        tx.tick(inputs(HOME, 3000, 1000));
        expect(tx.jammer).toEqual({...values, refAglFt: 10000});
    });

    it.each([
        '{}', 'garbage', '[1]',
        '{"lat":"x","lon":8,"powerDb":70,"refAglFt":10000}',
        '{"lat":47,"lon":8,"powerDb":70}',
        '{"lat":47,"lon":8,"powerDb":null,"refAglFt":10000}',
        '{"lon":8,"powerDb":70,"refAglFt":10000}',
    ])('values that do not parse are generated anew: %s', text => {
        settings.getSetting('failure_gpsJamming').set(text);
        expect(() => tx.tick(inputs(HOME, 10000, 1000))).not.toThrow();
        const v = stored('gpsJamming');
        expect(Object.keys(v).sort()).toEqual(['lat', 'lon', 'powerDb', 'refAglFt']);
        expect(Object.values(v).filter(n => typeof n !== 'number' || !isFinite(n))).toEqual([]);
        expect(tx.jammer).toEqual(v);
        expect(distanceNm(HOME, {lat: v.lat, lon: v.lon})).toBeLessThanOrEqual(jammerEdgeNm(v.powerDb, 10000) + 1e-6);
    });

    it('a stored spoofer without its spoofer values is generated anew', () => {
        const finder = new FakeFinder(null);
        tx.setAirportFinder(finder);
        settings.getSetting('failure_gpsSpoofing').set('{"lat":47,"lon":8.5,"powerDb":120,"refAglFt":10000}');
        tx.tick(inputs(HOME, 10000, 1000));
        expect(finder.calls).toHaveLength(1);
    });

    it('a stored spoofer is loaded without a search', async () => {
        const finder = new FakeFinder(null);
        tx.setAirportFinder(finder);
        const values = {lat: 47, lon: 8.5, powerDb: 100, refAglFt: 12000, falseLat: 46, falseLon: 7, falseAltFt: 1400, shiftMs: -3.6e7, clockM: 1000};
        settings.getSetting('failure_gpsSpoofing').set(JSON.stringify(values));
        tx.tick(inputs(HOME, 10000, 1000));
        await flush();
        expect(tx.spoofer).toEqual(values);
        expect(finder.calls).toEqual([]);
        expect(tx.spooferRatio).toBeGreaterThan(0);
    });

    it('refresh loads the stored site and sets the level the tick sets, drawing and saving nothing', () => {
        storeJammer(HOME, 90, 20);
        const writes = countWrites();
        tx.refresh(inputs(HOME, 10000, 1000));
        const refreshed = tx.jammerRatio;
        expect(noiseRiseDb(refreshed, 0)).toBeGreaterThan(10);
        expect(draws).toBe(0);
        expect(writes.count).toBe(0);
        tx.tick(inputs(HOME, 10000, 1000));
        expect(tx.jammerRatio).toBe(refreshed);
    });

    it('refresh with values that do not parse draws, saves and places nothing', () => {
        settings.getSetting('failure_gpsJamming').set('{}');
        tx.refresh(inputs(HOME, 10000, 1000));
        expect(draws).toBe(0);
        expect(settings.getSetting('failure_gpsJamming').get()).toBe('{}');
        expect(tx.jammer).toBeNull();
        expect(tx.jammerRatio).toBe(0);
    });

    it('reset keeps the site', () => {
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 10000, 1000));
        const site = {...tx.jammer!};
        tx.reset();
        expect(tx.jammer).toEqual(site);
        tx.tick(inputs(HOME, 10000, 2000));
        expect(tx.jammer).toEqual(site);
    });
});

describe('Transmitters: the spoofer (#465)', () => {
    it('the spoofer draws its shift within 2 to 12 hours either sign, its clock within ±0.5 ms, its false point 30 to 150 NM from the place', async () => {
        const shifts: number[] = [];
        const clocks: number[] = [];
        const falseDistances: number[] = [];
        for (let seed = 1; seed <= 100; seed++) {
            build(false, mulberry32(seed));
            tx.setAirportFinder(new FakeFinder(null));
            failures.fail('gpsSpoofing');
            tx.tick(inputs(HOME, 0, 1000, true));
            await flush();
            const s = tx.spoofer!;
            shifts.push(s.shiftMs);
            clocks.push(s.clockM);
            falseDistances.push(distanceNm(s, {lat: s.falseLat, lon: s.falseLon}));
        }
        const hours = shifts.map(s => Math.abs(s) / 3_600_000);
        expect(Math.min(...hours)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...hours)).toBeLessThanOrEqual(12);
        expect(Math.min(...hours)).toBeLessThan(2.5);
        expect(Math.max(...hours)).toBeGreaterThan(11.5);
        expect(shifts.filter(s => s < 0).length).toBeGreaterThan(20);
        expect(shifts.filter(s => s > 0).length).toBeGreaterThan(20);
        // Half a millisecond of light time: 149,896 m
        expect(Math.max(...clocks.map(Math.abs))).toBeLessThanOrEqual(149_896.229);
        expect(Math.min(...clocks)).toBeLessThan(-120_000);
        expect(Math.max(...clocks)).toBeGreaterThan(120_000);
        expect(Math.min(...falseDistances)).toBeGreaterThanOrEqual(30 - 1e-6);
        expect(Math.max(...falseDistances)).toBeLessThanOrEqual(150 + 1e-6);
        expect(Math.min(...falseDistances)).toBeLessThan(35);
        expect(Math.max(...falseDistances)).toBeGreaterThan(145);
    });

    it('the spoofer takes the airport the finder returns, else the drawn point at the ground elevation under the aircraft', async () => {
        const airport = {lat: 46.5, lon: 7.5, elevationFt: 1234};
        const finder = new FakeFinder();
        tx.setAirportFinder(finder);
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1000, true, 4321));

        // Pending: nothing sent, nothing saved
        expect(tx.spoofer).toBeNull();
        expect(tx.spooferRatio).toBe(0);
        expect(settings.getSetting('failure_gpsSpoofing').get()).toBe('{}');
        expect(finder.calls).toHaveLength(1);
        const asked = finder.calls[0];
        expect(asked.radiusNm).toBe(30);
        tx.tick(inputs(HOME, 0, 1001, true, 4321));
        expect(finder.calls).toHaveLength(1); // One search per generation
        expect(tx.spoofer).toBeNull();

        finder.pending[0](airport);
        await flush();
        const s = tx.spoofer!;
        expect({lat: s.falseLat, lon: s.falseLon, elevationFt: s.falseAltFt}).toEqual(airport);
        const askedFrom = distanceNm(s, asked);
        expect(askedFrom).toBeGreaterThanOrEqual(30 - 1e-6);
        expect(askedFrom).toBeLessThanOrEqual(150 + 1e-6);
        expect(stored('gpsSpoofing')).toEqual({...s});
        expect(tx.spooferRatio).toBe(0); // The level comes with the next tick
        tx.tick(inputs(HOME, 0, 1002, true, 4321));
        expect(noiseRiseDb(0, tx.spooferRatio)).toBeGreaterThan(20);

        // No match: the drawn point, at the ground elevation under the aircraft at the generation
        build();
        const none = new FakeFinder();
        tx.setAirportFinder(none);
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1000, true, 4321));
        tx.tick(inputs(HOME, 0, 1001, true, 99));
        none.pending[0](null);
        await flush();
        expect(tx.spoofer!.falseLat).toBe(none.calls[0].lat);
        expect(tx.spoofer!.falseLon).toBe(none.calls[0].lon);
        expect(tx.spoofer!.falseAltFt).toBe(4321);
    });

    it('a regeneration drops the late airport answer of the spoofer it replaced', async () => {
        const finder = new FakeFinder();
        tx.setAirportFinder(finder);
        const at = generateAfterStep('gpsSpoofing', HOME, 90, 450, 1, 10000);
        expect(finder.calls).toHaveLength(1);
        tx.tick(inputs(offset(at, 0, 500), 10000, 1002)); // Far beyond its edge: generated anew, a second search
        expect(finder.calls).toHaveLength(2);

        finder.pending[0]({lat: 46, lon: 7, elevationFt: 100});
        await flush();
        expect(tx.spoofer).toBeNull();
        expect(settings.getSetting('failure_gpsSpoofing').get()).toBe('{}');

        finder.pending[1]({lat: 45, lon: 6, elevationFt: 200});
        await flush();
        expect({lat: tx.spoofer!.falseLat, lon: tx.spoofer!.falseLon, elevationFt: tx.spoofer!.falseAltFt}).toEqual({lat: 45, lon: 6, elevationFt: 200});
        expect(stored('gpsSpoofing').falseLat).toBe(45);
    });

    it('a finder not yet set counts as pending; the search starts once it is set', async () => {
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1000, true));
        tx.tick(inputs(HOME, 0, 1001, true));
        expect(tx.spoofer).toBeNull();
        expect(settings.getSetting('failure_gpsSpoofing').get()).toBe('{}');
        const finder = new FakeFinder(null);
        tx.setAirportFinder(finder);
        tx.tick(inputs(HOME, 0, 1002, true));
        await flush();
        expect(finder.calls).toHaveLength(1);
        expect(tx.spoofer).not.toBeNull();
    });

    // Final review (2026-11-08): a search that never answers is given up after 30 s of sim time; the drawn point is taken at
    // the ground elevation of the generation, saved, and a late answer is ignored
    it('a search that does not answer within 30 s of sim time takes the drawn point; a late answer is ignored', async () => {
        const finder = new FakeFinder();
        tx.setAirportFinder(finder);
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1000, true, 4321));
        tx.tick(inputs(HOME, 0, 1029.9, true, 99));
        await flush();
        expect(tx.spoofer).toBeNull(); // Pending for 29.9 s
        expect(tx.spooferRatio).toBe(0);

        tx.tick(inputs(HOME, 0, 1030, true, 99));
        const s = {...tx.spoofer!};
        expect(s.falseLat).toBe(finder.calls[0].lat);
        expect(s.falseLon).toBe(finder.calls[0].lon);
        expect(s.falseAltFt).toBe(4321);
        expect(stored('gpsSpoofing')).toEqual(s);
        expect(finder.calls).toHaveLength(1); // Not searched again

        finder.pending[0]({lat: 46, lon: 7, elevationFt: 100});
        await flush();
        expect(tx.spoofer).toEqual(s);
        expect(stored('gpsSpoofing')).toEqual(s);
    });

    it('a search that fails takes the drawn point', async () => {
        tx.setAirportFinder({find: () => Promise.reject(new Error('no'))});
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1000, true, 500));
        await flush();
        expect(tx.spoofer!.falseAltFt).toBe(500);
    });

    it('the repair drops the site at once and a late airport result is ignored', async () => {
        const finder = new FakeFinder();
        tx.setAirportFinder(finder);
        failures.fail('gpsSpoofing');
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 0, 1000, true));
        expect(tx.jammerRatio).toBeGreaterThan(0); // Precondition

        failures.repair('gpsJamming');
        expect(tx.jammer).toBeNull();
        expect(tx.jammerRatio).toBe(0);

        failures.repair('gpsSpoofing');
        expect(tx.spoofer).toBeNull();
        finder.pending[0]({lat: 46, lon: 7, elevationFt: 100});
        await flush();
        expect(tx.spoofer).toBeNull();
        expect(settings.getSetting('failure_gpsSpoofing').get()).toBe('');

        // Failed, repaired and failed again: the answer of the search before the repair arrives late, while the failure is
        // active again with a new search of its own. It is ignored; the new search's answer is taken
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1001, true));
        failures.repair('gpsSpoofing');
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1002, true));
        expect(finder.calls).toHaveLength(3);
        finder.pending[1]({lat: 46, lon: 7, elevationFt: 100});
        await flush();
        expect(tx.spoofer).toBeNull();
        expect(settings.getSetting('failure_gpsSpoofing').get()).toBe('{}');
        finder.pending[2]({lat: 45, lon: 6, elevationFt: 200});
        await flush();
        expect(tx.spoofer!.falseLat).toBe(45);

        // The repair with the spoofer resolved: dropped at once, the ratio 0
        tx.tick(inputs(HOME, 0, 1003, true));
        expect(tx.spooferRatio).toBeGreaterThan(0); // Precondition
        failures.repair('gpsSpoofing');
        expect(tx.spoofer).toBeNull();
        expect(tx.spooferRatio).toBe(0);
    });

    it('a stored text cleared without an event is not readable and gives no level at the next tick', () => {
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 0, 1000, true));
        settings.getSetting('failure_gpsJamming').set('');
        expect(tx.jammer).toBeNull();
        tx.tick(inputs(HOME, 0, 1001, true));
        expect(tx.jammerRatio).toBe(0);
    });

    it('a failure started again after its text was cleared without an event, before a tick, is generated anew', () => {
        failures.fail('gpsJamming');
        tx.tick(inputs(HOME, 0, 1000, true));
        const first = {...tx.jammer!};
        settings.getSetting('failure_gpsJamming').set('');
        failures.fail('gpsJamming');
        expect(tx.jammer).toBeNull(); // Nothing until the generation of the next tick
        tx.tick(inputs(HOME, 0, 1001, true));
        expect(tx.jammer).not.toEqual(first);
        expect(stored('gpsJamming')).toEqual({...tx.jammer!});
    });

    it('the fake count is 8 until it is set', () => {
        expect(tx.spooferFakeCount).toBe(8);
        tx.setFakeCount(5);
        expect(tx.spooferFakeCount).toBe(5);
    });

    it('take-home mode: no site, ratios 0', async () => {
        build(true);
        const finder = new FakeFinder(null);
        tx.setAirportFinder(finder);
        failures.fail('gpsJamming');
        failures.fail('gpsSpoofing');
        tx.tick(inputs(HOME, 0, 1000, true));
        tx.refresh(inputs(HOME, 0, 1000, true));
        await flush();
        expect(tx.jammer).toBeNull();
        expect(tx.spoofer).toBeNull();
        expect(tx.jammerRatio).toBe(0);
        expect(tx.spooferRatio).toBe(0);
        expect(finder.calls).toEqual([]);
        expect(settings.getSetting('failure_gpsJamming').get()).toBe('{}');
        expect(settings.getSetting('failure_gpsSpoofing').get()).toBe('{}');
    });
});

describe('Transmitters: the levels (#465)', () => {
    // Final review (2026-11-08): the fake signals travel the spoofer's slant range on top of the range they claim (RangeErrors)
    it("the spoofer's slant range over the horizontal distance and the height above the mast, 0 without a level", () => {
        const values = {...offset(HOME, 90, 50), powerDb: spooferPowerDb(400), refAglFt: 10000, falseLat: 46, falseLon: 7, falseAltFt: 1400, shiftMs: -3.6e7, clockM: 1000};
        settings.getSetting('failure_gpsSpoofing').set(JSON.stringify(values));
        expect(tx.spooferSlantM).toBe(0);
        tx.tick(inputs(HOME, 10000, 1000));
        expect(tx.spooferRatio).toBeGreaterThan(0); // Precondition
        expect(tx.spooferSlantM).toBeCloseTo(Math.hypot(50 * 1852, 9900 * 0.3048), 3);
        tx.tick(inputs(offset(values, 270, 20), 3000, 1001));
        expect(tx.spooferSlantM).toBeCloseTo(Math.hypot(20 * 1852, 2900 * 0.3048), 3);
        failures.repair('gpsSpoofing');
        expect(tx.spooferSlantM).toBe(0);
    });

    // Final review (2026-11-08): GPS reads the heights only while a transmitter failure is in effect
    it('anyActive: a jamming or a spoofing failure in effect, none in take-home mode', () => {
        expect(tx.anyActive).toBe(false);
        failures.fail('gpsJamming');
        expect(tx.anyActive).toBe(true);
        failures.repair('gpsJamming');
        failures.fail('gpsSpoofing');
        expect(tx.anyActive).toBe(true);
        failures.repair('gpsSpoofing');
        failures.fail('gpsAntenna');
        expect(tx.anyActive).toBe(false);
        build(true);
        failures.fail('gpsJamming');
        expect(tx.anyActive).toBe(false);
    });

    // Final review (2026-11-08): the gain toward the jammer from the test's harness. 50 NM abeam at 10,000 ft, 2.18 degrees
    // under the horizon: level -13.09 dB, banked 20 degrees toward it -6.17 (+6.9 dB), 20 degrees away -23.09 (-10 dB)
    it('banking toward the jammer raises its level, banking away lowers it', () => {
        const values = {...offset(HOME, 90, 50), powerDb: jammerPowerDb(150), refAglFt: 10000};
        settings.getSetting('failure_gpsJamming').set(JSON.stringify(values));
        const level = inputs(HOME, 10000, 1000);
        tx.tick(level);
        const flat = tx.jammerRatio;
        const change = (bank: number) => gainAtElevationDb(abeamElevationDeg(50, 10000, bank)) - gainAtElevationDb(abeamElevationDeg(50, 10000, 0));
        tx.tick({...level, simTimeS: 1001, attitude: {...level.attitude, bankRightDeg: 20}});
        expect(10 * Math.log10(tx.jammerRatio / flat)).toBeCloseTo(change(20), 2);
        expect(change(20)).toBeCloseTo(6.92, 1); // Precondition: the expectation of the ruling, 6 to 8 dB
        tx.tick({...level, simTimeS: 1002, attitude: {...level.attitude, bankRightDeg: -20}});
        expect(10 * Math.log10(tx.jammerRatio / flat)).toBeCloseTo(change(-20), 2);
        expect(change(-20)).toBeCloseTo(-10, 1);
    });

    it('the level falls with the slant range, 6 dB from 20 to 40 NM in line of sight, less the gain the steeper depression loses', () => {
        const values = {...offset(HOME, 90, 20), powerDb: jammerPowerDb(150), refAglFt: 10000};
        settings.getSetting('failure_gpsJamming').set(JSON.stringify(values));
        tx.tick(inputs(HOME, 10000, 1000));
        const near = tx.jammerRatio;
        tx.tick(inputs(offset(values, 270, 40), 10000, 1001));
        // The slant ranges with the 9,900 ft between the mast and the aircraft, and the gain at each depression (the test's
        // harness): 20 NM is 4.8 degrees under the horizon, 40 NM 2.6
        const h = 9900 * 0.3048 / 1852;
        const gainChange = levelGainDb(40, 10000) - levelGainDb(20, 10000);
        expect(gainChange).toBeGreaterThan(1); // Precondition: the nearer one is lower under the antenna
        expect(10 * Math.log10(near / tx.jammerRatio)).toBeCloseTo(20 * Math.log10(Math.hypot(40, h) / Math.hypot(20, h)) - gainChange, 6);
    });
});
